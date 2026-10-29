// Processing worker: reads the export ZIPs, matches files to the memories list, writes fixed copies into ZIP parts.
// Never opens a network connection: there is no network code in it or in the engine it imports. It also reports any
// request it makes after it starts to the page, which adds it to the "Sent from this page" counter (expected: none).
// Output goes to a folder the user chose,
// to the browser's private storage (OPFS), or to memory as a last resort.
import { readZipIndex, readEntry, entryChunks, entryDataRange, ZipError } from './engine/zip-read.js';
import { ZipWriter, entryOverhead } from './engine/zip-write.js';
import { parseMemoriesList } from './engine/memories.js';
import { calibrate, describeMedia, isMemoryMedia, matchAll, pairOverlays } from './engine/match.js';
import { planWrites, summarize, csvRows, partFileName } from './engine/plan.js';
import { writeJpegMeta, JpegError } from './engine/exif.js';
import { patchMp4, planMp4Patch, Mp4Error } from './engine/mp4.js';
import { isValidZone } from './engine/tz.js';
import { wallText } from './engine/bytes.js';
import { canDrawLayers, coverRect, JPEG_QUALITY } from './engine/compose.js';

const OPFS_DIR = 'photo-date-fixer';
const MAX_VIDEO_IN_MEMORY = 256 * 1024 * 1024;

let S = null; // scan state
let cancelRun = false;

const post = (m, transfer) => self.postMessage(m, transfer ?? []);

// The page cannot see this worker's requests (each worker has its own performance timeline), so the worker counts its own.
// Static imports finished loading before this line ran, so only later requests are counted.
if (typeof PerformanceObserver === "function") {
  try {
    new PerformanceObserver((list) => {
      const n = list.getEntries().filter((e) => !/^(blob|data):/.test(e.name)).length;
      if (n) post({ type: "net", n });
    }).observe({ type: "resource", buffered: false });
  } catch {
    /* no resource timing in this worker */
  }
}

self.onmessage = async (ev) => {
  const m = ev.data ?? {};
  try {
    if (m.type === 'scan') await scan(m);
    else if (m.type === 'replan') replan(m);
    else if (m.type === 'run') await run(m);
    else if (m.type === 'cancel') cancelRun = true;
    else if (m.type === 'clear') post({ type: 'cleared', removed: await clearOpfs() });
    else if (m.type === 'inspect') post({ type: 'inspected', ...(await inspectOpfs()) });
  } catch (e) {
    post({ type: 'error', code: e?.code ?? (e?.name === 'QuotaExceededError' ? 'storage' : 'generic'), name: e?.fileName ?? null, message: String(e?.message ?? e).slice(0, 300) });
  }
};

function isZipName(n) {
  return /\.zip$/i.test(n);
}

async function scan({ files, fallbackTz }) {
  const zips = [];
  let listText = null;
  let listName = null;
  const loose = [];
  for (const f of files) {
    if (/memories_history\.(json|html)$/i.test(f.name)) {
      loose.push(f);
      continue;
    }
    let index;
    try {
      index = await readZipIndex(f);
    } catch (e) {
      if (e instanceof ZipError && e.code === 'notzip') {
        const err = new ZipError(e.message, isZipName(f.name) ? 'read' : 'noZip');
        err.fileName = f.name;
        throw err;
      }
      e.fileName = f.name;
      throw e;
    }
    zips.push({ file: f, name: f.name, entries: index.entries });
    post({ type: 'scanProgress', done: zips.length, total: files.length });
  }
  // the list: JSON preferred, HTML accepted
  const all = [];
  zips.forEach((z, zi) => z.entries.forEach((e) => all.push({ zi, e })));
  const pickList = (re) => all.find(({ e }) => !e.dir && re.test(e.name));
  const hit = pickList(/(^|\/)memories_history\.json$/i) ?? pickList(/(^|\/)memories_history\.html$/i);
  if (hit) {
    listName = hit.e.name;
    listText = new TextDecoder('utf-8').decode(await readEntry(zips[hit.zi].file, hit.e));
  } else if (loose.length) {
    const lf = loose.find((f) => /\.json$/i.test(f.name)) ?? loose[0];
    listName = lf.name;
    listText = await lf.text();
  }
  if (listText == null) throw Object.assign(new Error('memories list not found'), { code: 'noList' });
  let records;
  try {
    records = parseMemoriesList(listName, listText);
  } catch (e) {
    throw Object.assign(new Error(`could not read ${listName}: ${e.message}`), { code: 'noList' });
  }
  const media = [];
  zips.forEach((z, zi) => {
    for (const e of z.entries) if (!e.dir && isMemoryMedia(e.name)) media.push(describeMedia(zi, e));
  });
  if (!media.length) throw Object.assign(new Error('no media'), { code: 'noMedia', count: records.length });
  post({ type: 'scanProgress', phase: 'matching' });
  const cal = calibrate(records, media);
  const match = matchAll(records, media, { offsetMin: cal.offsetMin });
  const pairs = pairOverlays(media);
  S = { zips, records, media, match, pairs, cal, listName, fallbackTz: isValidZone(fallbackTz) ? fallbackTz : 'UTC', items: null };
  replan({ fallbackTz: S.fallbackTz, quiet: true });
  const summary = summarize(S.items, match.noMedia);
  const chronological = S.items.filter((it) => it.utcMs != null).sort((a, b) => a.utcMs - b.utcMs);
  const previewItems = chronological.filter((it) => it.media.type === 'Image').slice(0, 5);
  const preview = [];
  const transfer = [];
  for (const it of previewItems) {
    let thumb = null;
    if (/\.(jpe?g|png|webp)$/i.test(it.media.ext) && it.media.entry.usize < 25 * 1024 * 1024) {
      try {
        thumb = await readEntry(S.zips[it.media.zip].file, it.media.entry);
        transfer.push(thumb.buffer);
      } catch {
        thumb = null;
      }
    }
    preview.push(previewRow(it, thumb));
  }
  post({ type: 'scanned', summary, preview, listName, zipNames: zips.map((z) => z.name), calibration: cal, totalBytes: summary.bytes }, transfer);
}

function previewRow(it, thumb) {
  return {
    file: it.media.base,
    name: it.name,
    utc: it.utcMs != null ? wallText(it.utcMs) : null,
    local: it.wallMs != null ? wallText(it.wallMs) : null,
    offset: it.offset,
    tz: it.tz,
    loc: it.loc,
    status: it.status,
    thumb,
    mime: it.media.ext === '.png' ? 'image/png' : it.media.ext === '.webp' ? 'image/webp' : 'image/jpeg',
  };
}

function replan({ fallbackTz, quiet }) {
  if (!S) return;
  if (fallbackTz && isValidZone(fallbackTz)) S.fallbackTz = fallbackTz;
  S.items = planWrites(S.match, { fallbackTz: S.fallbackTz, pairs: S.pairs });
  if (!quiet) post({ type: 'replanned', summary: summarize(S.items, S.match.noMedia) });
}

// ---------------------------------------------------------------------------------------------- sinks
async function opfsDir(create = true) {
  const root = await navigator.storage.getDirectory();
  return root.getDirectoryHandle(OPFS_DIR, { create });
}

async function clearOpfs() {
  try {
    const root = await navigator.storage.getDirectory();
    await root.removeEntry(OPFS_DIR, { recursive: true });
    return true;
  } catch {
    return false;
  }
}

async function inspectOpfs() {
  try {
    const dir = await opfsDir(false);
    let n = 0;
    let bytes = 0;
    for await (const [, h] of dir.entries()) {
      if (h.kind === 'file') {
        n++;
        bytes += (await h.getFile()).size;
      }
    }
    return { files: n, bytes };
  } catch {
    return { files: 0, bytes: 0 };
  }
}

async function openSink(dest, name, dirHandle) {
  if (dest === 'folder') {
    const fh = await dirHandle.getFileHandle(name, { create: true });
    const w = await fh.createWritable();
    return { kind: 'folder', write: (u8) => w.write(u8), close: async () => (await w.close(), null), abort: async () => w.abort?.() };
  }
  if (dest === 'opfs') {
    const dir = await opfsDir(true);
    const fh = await dir.getFileHandle(name, { create: true });
    if (typeof fh.createSyncAccessHandle === 'function') {
      const h = await fh.createSyncAccessHandle();
      // early Safari and Chrome builds returned promises from these methods; awaiting a plain value is harmless
      await h.truncate(0);
      let at = 0;
      return {
        kind: 'opfs',
        write: async (u8) => {
          let off = 0;
          while (off < u8.length) {
            let n = h.write(off === 0 ? u8 : u8.subarray(off), { at });
            if (n && typeof n.then === 'function') n = await n;
            if (!n) throw Object.assign(new Error('write failed'), { code: 'storage' });
            at += n;
            off += n;
          }
        },
        close: async () => {
          await h.flush();
          await h.close();
          return null;
        },
        abort: async () => {
          try {
            await h.close();
          } catch {
            /* closed */
          }
        },
      };
    }
    if (typeof fh.createWritable === 'function') {
      const w = await fh.createWritable();
      return { kind: 'opfs', write: (u8) => w.write(u8), close: async () => (await w.close(), null), abort: async () => w.abort?.() };
    }
    throw Object.assign(new Error('no writable storage'), { code: 'nostorage' });
  }
  const chunks = [];
  return { kind: 'memory', write: (u8) => chunks.push(u8), close: async () => new Blob(chunks, { type: 'application/zip' }), abort: async () => (chunks.length = 0) };
}

async function pickDest(want) {
  if (want === 'folder') return 'folder';
  if (want !== 'memory') {
    try {
      const dir = await opfsDir(true);
      const probe = await dir.getFileHandle('.probe', { create: true });
      const ok = typeof probe.createSyncAccessHandle === 'function' || typeof probe.createWritable === 'function';
      await dir.removeEntry('.probe');
      if (ok) return 'opfs';
    } catch {
      /* private mode or no OPFS */
    }
  }
  return 'memory';
}

// ---------------------------------------------------------------------------------------------- run
const estimate = (it) => {
  let n = it.media.entry.usize + entryOverhead(it.name) + 256;
  for (const o of it.overlays) n += o.media.entry.usize + entryOverhead(o.name);
  return n;
};

async function* rangeChunks(blob, a, b, size = 4 << 20) {
  for (let o = a; o < b; o += size) yield new Uint8Array(await blob.slice(o, Math.min(b, o + size)).arrayBuffer());
}

// Draws a photo's caption and sticker layers over it and returns a new JPEG: the photo is encoded again, so its pixels change.
// Only when the person switched the option on. Decoding goes by the file's content, not its name: many -overlay.png files are WebP.
// Nothing here opens a connection: the bytes go from the ZIP to a canvas in this worker and back.
async function drawOverlays(photoBytes, layers) {
  if (typeof OffscreenCanvas !== 'function' || typeof createImageBitmap !== 'function') throw new Error('this browser cannot draw images here');
  const photo = await createImageBitmap(new Blob([photoBytes]));
  try {
    const canvas = new OffscreenCanvas(photo.width, photo.height);
    const g = canvas.getContext('2d');
    g.drawImage(photo, 0, 0);
    for (const bytes of layers) {
      const layer = await createImageBitmap(new Blob([bytes]));
      const r = coverRect(photo.width, photo.height, layer.width, layer.height);
      g.drawImage(layer, r.x, r.y, r.w, r.h);
      layer.close();
    }
    const out = await canvas.convertToBlob({ type: 'image/jpeg', quality: JPEG_QUALITY });
    return new Uint8Array(await out.arrayBuffer());
  } finally {
    photo.close();
  }
}

const addNote = (notes, name, text) => notes.set(name, notes.has(name) ? `${notes.get(name)}; ${text}` : text);

async function writeItem(zw, it, zipFile, notes, { drawLayers = false, drawn = null } = {}) {
  const m = it.media;
  const times = { wallMs: it.wallMs ?? m.entry.wallMs ?? Date.now(), utcMs: it.utcMs ?? m.entry.extUtcMs ?? m.entry.wallMs ?? Date.now() };
  const isJpeg = /\.(jpe?g)$/i.test(m.ext);
  let layersDrawn = false;
  if (m.type === 'Image') {
    let bytes = await readEntry(zipFile, m.entry);
    if (drawLayers && canDrawLayers(it)) {
      try {
        const layers = [];
        for (const o of it.overlays) layers.push(await readEntry(S.zips[o.media.zip].file, o.media.entry));
        bytes = await drawOverlays(bytes, layers);
        layersDrawn = true;
        drawn?.add(it.name);
        addNote(notes, it.name, 'caption and sticker layer drawn onto the photo (saved as a new JPEG)');
      } catch (e) {
        addNote(notes, it.name, `layer kept as a separate file: ${String(e?.message ?? e).slice(0, 80)}`);
      }
    }
    if (isJpeg && it.wallMs != null) {
      try {
        bytes = writeJpegMeta(bytes, { wallMs: it.wallMs, offset: it.offset, utcMs: it.utcMs, loc: it.loc });
      } catch (e) {
        addNote(notes, it.name, `Exif not written: ${e instanceof JpegError ? e.message : 'unreadable JPEG'}`);
      }
    } else if (!isJpeg) notes.set(it.name, `no Exif for ${m.ext || 'this'} files; name and file time set`);
    await zw.addFile(it.name, bytes, times);
  } else {
    const canPatch = it.utcMs != null;
    let done = false;
    if (canPatch && m.entry.method === 0) {
      try {
        const [a, b] = await entryDataRange(zipFile, m.entry);
        const src = zipFile.slice(a, b);
        const plan = await planMp4Patch(src, { utcMs: it.utcMs, loc: it.loc });
        async function* parts() {
          yield* rangeChunks(src, plan.before[0], plan.before[1]);
          yield plan.moov;
          yield* rangeChunks(src, plan.after[0], plan.after[1]);
        }
        await zw.addStream(it.name, parts(), times);
        if (it.loc && !plan.xyz) notes.set(it.name, 'location not written (chunk offsets would overflow)');
        done = true;
      } catch (e) {
        if (!(e instanceof Mp4Error)) throw e;
        notes.set(it.name, `video metadata not written: ${e.message}`);
      }
    } else if (canPatch && m.entry.usize <= MAX_VIDEO_IN_MEMORY) {
      const bytes = await readEntry(zipFile, m.entry);
      try {
        const r = patchMp4(bytes, { utcMs: it.utcMs, loc: it.loc });
        await zw.addFile(it.name, r.bytes, times);
        done = true;
      } catch (e) {
        if (!(e instanceof Mp4Error)) throw e;
        notes.set(it.name, `video metadata not written: ${e.message}`);
        await zw.addFile(it.name, bytes, times);
        done = true;
      }
    } else if (canPatch) notes.set(it.name, 'video too large to patch inside a compressed ZIP entry; name and file time set');
    if (!done) await zw.addStream(it.name, entryChunks(zipFile, m.entry), times);
  }
  if (layersDrawn) return;
  for (const o of it.overlays) {
    const bytes = await readEntry(S.zips[o.media.zip].file, o.media.entry);
    await zw.addFile(o.name, bytes, times);
  }
}

async function run({ fallbackTz, partMB = 300, dest = 'opfs', dirHandle = null, drawLayers = false }) {
  if (!S) throw new Error('nothing scanned');
  cancelRun = false;
  if (fallbackTz && fallbackTz !== S.fallbackTz) replan({ fallbackTz, quiet: true });
  const mode = await pickDest(dest);
  const partBytes = Math.max(50, Math.min(300, Number(partMB) || 300)) * 1e6 * (mode === 'memory' ? 0.5 : 1);
  if (mode === 'opfs') await clearOpfs();
  const stamp = wallText(Date.now(), '', '-', '').slice(0, 13);
  const items = S.items.slice().sort((a, b) => (a.wallMs ?? 9e15) - (b.wallMs ?? 9e15) || (a.name < b.name ? -1 : 1));
  const total = items.length;
  const parts = [];
  const partOf = new Map();
  const notes = new Map();
  const drawn = new Set();
  let partNo = 0;
  let zw = null;
  let sink = null;
  let used = 0;
  let lastPost = 0;
  const startPart = async () => {
    partNo++;
    const name = partFileName(partNo, stamp);
    sink = await openSink(mode, name, dirHandle);
    zw = new ZipWriter(sink);
    used = 0;
    return name;
  };
  const endPart = async (extra) => {
    if (extra) await zw.addFile(extra.name, extra.bytes, extra.times);
    const r = await zw.finish();
    const blob = await sink.close();
    parts.push({ n: partNo, name: partFileName(partNo, stamp), size: r.size, entries: r.entries, blob: blob ?? null });
    post({ type: 'partDone', part: parts.at(-1) });
  };
  try {
    await startPart();
    for (let i = 0; i < total; i++) {
      if (cancelRun) throw Object.assign(new Error('stopped'), { code: 'stopped' });
      const it = items[i];
      const est = estimate(it);
      if (used > 0 && used + est > partBytes) {
        await endPart(null);
        await startPart();
      }
      await writeItem(zw, it, S.zips[it.media.zip].file, notes, { drawLayers: Boolean(drawLayers), drawn });
      partOf.set(it.name, partNo);
      used = zw.offset;
      const now = Date.now();
      if (now - lastPost > 120 || i === total - 1) {
        lastPost = now;
        post({ type: 'progress', done: i + 1, total, part: partNo, written: parts.reduce((s, p) => s + p.size, 0) + zw.offset });
      }
    }
    const csv = csvRows(items, S.match.noMedia, { zipNames: S.zips.map((z) => z.name), partOf, notes, drawn });
    const csvBytes = new TextEncoder().encode(csv);
    const now = Date.now();
    await endPart({ name: 'photo-date-fixer-report.csv', bytes: csvBytes, times: { wallMs: now, utcMs: now } });
    post({ type: 'done', mode, parts: parts.map(({ n, name, size, entries, blob }) => ({ n, name, size, entries, blob })), report: csv, notes: notes.size });
  } catch (e) {
    try {
      await sink?.abort?.();
    } catch {
      /* already closed */
    }
    if (mode === 'opfs') await clearOpfs();
    if (e?.name === 'QuotaExceededError') throw Object.assign(new Error('storage full'), { code: 'storage' });
    throw e;
  }
}
