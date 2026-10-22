/* Dayfold worker: opens the Daylio backup you pick, in this browser tab, keeps the journal in memory and answers the
 * page's questions. It makes no network request; nothing it reads is stored or sent anywhere, and the backup is only
 * ever read, never changed. A ZIP is never loaded whole: its table of contents is read from the end of the file, then
 * backup.daylio, then each photo only when the page shows it or a Pro file needs it. */
import { strFromU8, strToU8, deflateSync, Zip, ZipPassThrough, ZipDeflate } from '../vendor/fflate.js';
import { isZip, openZip, readEntry } from './zipread.js';
import { decodeBackupText, normalise, assetIndex, sniffMime, EXT, BackupError } from './parse.js';
import { yearsOf, summary, byYear, pixels, monthEntries, monthDays, activityCounts, activityMoods, search, toCsv } from './stats.js';
import { buildMarkdown } from './markdown.js';
import { sampleBackup } from './sample.js';
import { strings, LOCALE } from './i18n.js';

let J = null;          // the journal (parse.normalise)
let zip = null;        // the opened ZIP, when the file was one
let byName = new Map(); // file name in the ZIP (lower case, without extension too) -> entry
let samplePhotos = null; // checksum -> drawing spec, for the sample
let photoCache = new Map();
let source = null;
let lang = 'en';

const post = (type, data, transfer) => self.postMessage(Object.assign({ type }, data), transfer || []);
const base = n => String(n).split('/').pop();

function reset() { J = null; zip = null; byName = new Map(); samplePhotos = null; photoCache = new Map(); source = null; }

function zipCode(e) {
  const m = String(e && e.message || e);
  if (/encrypted/.test(m)) return 'encrypted';
  if (/cut short|past the end|bad local header/.test(m)) return 'truncated';
  if (/unsupported compression/.test(m)) return 'compression';
  return 'zip';
}

async function readBackupText(file) {
  if (!file || !file.size) throw new BackupError('empty');
  if (await isZip(file)) {
    let z;
    try { z = await openZip(file); } catch (e) { throw new BackupError(zipCode(e)); }
    let entry = z.entries.filter(e => base(e.name).toLowerCase() === 'backup.daylio').sort((a, b) => a.name.length - b.name.length)[0];
    if (!entry) {
      // a .daylio file put inside another ZIP: open the inner one
      const inner = z.entries.find(e => /\.daylio$/i.test(e.name) && e.usize < 1.5e9);
      if (inner) {
        let bytes;
        try { bytes = await readEntry(z, inner); } catch (e) { throw new BackupError(zipCode(e)); }
        return readBackupText(new Blob([bytes]));
      }
      throw new BackupError('nobackup', z.entries.slice(0, 6).map(e => base(e.name)).join(', '));
    }
    let text;
    try { text = strFromU8(await readEntry(z, entry)); } catch (e) { throw new BackupError(zipCode(e)); }
    zip = z;
    byName = assetIndex(z.entries.map(e => e.name));
    const entries = new Map(z.entries.map(e => [e.name, e]));
    for (const [k, n] of byName) byName.set(k, entries.get(n));
    return text;
  }
  if (file.size > 400e6) throw new BackupError('toobig');
  const head = new Uint8Array(await file.slice(0, 64).arrayBuffer());
  const start = strFromU8(head, true).replace(/^﻿|^ï»¿/, '').trimStart();
  if (!/^[{A-Za-z0-9+/=]/.test(start)) throw new BackupError('notbackup');
  return await file.text();
}

function meta() {
  const years = yearsOf(J.entries);
  let photos = 0, found = 0, voice = 0;
  const used = new Set();
  for (const e of J.entries) for (const a of e.assets) used.add(a);
  for (const a of used) {
    const A = J.assets.get(a);
    if (!A) continue;
    if (A.type === 'photo') { photos++; if (hasFile(A)) found++; } else if (A.type === 'audio') voice++;
  }
  return {
    name: source && source.name, size: source && source.size, sample: !!samplePhotos, platform: J.platform, version: J.version,
    count: J.entries.length, years, first: J.entries.length ? J.entries[0].key : null, last: J.entries.length ? J.entries[J.entries.length - 1].key : null,
    moods: J.moods.map(m => ({ id: m.id, name: m.name, pre: m.pre, group: m.group, score: m.score, state: m.state })),
    tags: J.tags.map(t => ({ id: t.id, name: t.name, group: t.group, state: t.state })), groups: J.groups,
    photos, photosFound: found, voice, problems: J.problems,
  };
}
const hasFile = A => (samplePhotos ? samplePhotos.has(A.checksum) : !!(A.checksum && byName.get(A.checksum.toLowerCase())));

async function open(file) {
  reset();
  source = { name: file && file.name, size: file && file.size };
  post('progress', { step: 'reading', p: 10 });
  const text = await readBackupText(file);
  post('progress', { step: 'decoding', p: 55 });
  let data;
  try { data = decodeBackupText(text); }
  catch (e) {
    // backup.daylio found inside the ZIP but unreadable: the backup is damaged, not "some other file"
    if (zip && e instanceof BackupError && e.code === 'notbackup') throw new BackupError('base64');
    throw e;
  }
  post('progress', { step: 'entries', p: 80 });
  J = normalise(data);
  post('opened', { meta: meta() });
}

function openSample(l) {
  reset();
  const { data, photos } = sampleBackup(l);
  source = { name: 'sample', size: 0 };
  J = normalise(data);
  samplePhotos = new Map(photos.map(p => [p.checksum, p]));
  post('opened', { meta: meta() });
}

/* ---------- photos ---------- */
async function drawSamplePhoto(spec) {
  if (typeof OffscreenCanvas === 'undefined') return null;
  const W = 960, H = 720;
  const c = new OffscreenCanvas(W, H);
  const g = c.getContext('2d');
  let s = spec.seed * 7919 + 13;
  const rnd = () => ((s = (s * 1103515245 + 12345) % 2147483648) / 2147483648);
  const sky = g.createLinearGradient(0, 0, 0, H);
  sky.addColorStop(0, `hsl(${spec.hue} 55% 72%)`);
  sky.addColorStop(1, `hsl(${(spec.hue + 30) % 360} 60% 88%)`);
  g.fillStyle = sky; g.fillRect(0, 0, W, H);
  g.fillStyle = `hsl(${(spec.hue + 40) % 360} 85% 92%)`;
  g.beginPath(); g.arc(W * (0.25 + rnd() * 0.5), H * 0.32, 70, 0, Math.PI * 2); g.fill();
  for (let layer = 0; layer < 3; layer++) {
    g.fillStyle = `hsl(${(spec.hue + 180 + layer * 12) % 360} ${30 + layer * 8}% ${48 - layer * 12}%)`;
    g.beginPath(); g.moveTo(0, H);
    const base0 = H * (0.55 + layer * 0.12);
    for (let x = 0; x <= W; x += 40) g.lineTo(x, base0 - Math.sin(x / (120 + layer * 40) + rnd() * 0.4 + layer) * (40 - layer * 8) - rnd() * 14);
    g.lineTo(W, H); g.closePath(); g.fill();
  }
  const blob = await c.convertToBlob({ type: 'image/jpeg', quality: 0.86 });
  return new Uint8Array(await blob.arrayBuffer());
}

async function photoBytes(assetId) {
  const A = J && J.assets.get(assetId);
  if (!A) return null;
  if (photoCache.has(assetId)) return photoCache.get(assetId);
  let bytes = null;
  if (samplePhotos) { const spec = samplePhotos.get(A.checksum); if (spec) bytes = await drawSamplePhoto(spec); }
  else if (zip && A.checksum) {
    const e = byName.get(A.checksum.toLowerCase());
    if (e) { try { bytes = await readEntry(zip, e); } catch (err) { bytes = null; } }
  }
  const out = bytes ? { bytes, mime: sniffMime(bytes) || (A.type === 'audio' ? 'audio/mp4' : 'application/octet-stream') } : null;
  if (samplePhotos && out) photoCache.set(assetId, out); // the sample's drawings are kept; real photos are read again from the file
  return out;
}

async function scaled(p, max) {
  if (!p || !max || typeof OffscreenCanvas === 'undefined' || typeof createImageBitmap === 'undefined' || !/^image\/(jpeg|png|webp|gif|avif)$/.test(p.mime)) return p;
  let bmp;
  try { bmp = await createImageBitmap(new Blob([p.bytes], { type: p.mime })); } catch (e) { return p; }
  const k = Math.min(1, max / Math.max(bmp.width, bmp.height));
  if (k >= 1 && p.mime === 'image/jpeg') { const r = { bytes: p.bytes, mime: p.mime, w: bmp.width, h: bmp.height }; bmp.close(); return r; }
  const w = Math.max(1, Math.round(bmp.width * k)), h = Math.max(1, Math.round(bmp.height * k));
  const c = new OffscreenCanvas(w, h);
  const g = c.getContext('2d');
  g.fillStyle = '#fff'; g.fillRect(0, 0, w, h);
  g.drawImage(bmp, 0, 0, w, h);
  bmp.close();
  const blob = await c.convertToBlob({ type: 'image/jpeg', quality: 0.85 });
  return { bytes: new Uint8Array(await blob.arrayBuffer()), mime: 'image/jpeg', w, h };
}

/* ---------- what an entry looks like to the page ---------- */
function view(e) {
  return {
    id: e.id, key: e.key, y: e.y, m: e.m, d: e.d, h: e.h, mi: e.mi, dow: e.dow, mood: e.mood, score: e.score,
    title: e.title, html: e.html, tags: e.tags,
    assets: e.assets.map(a => { const A = J.assets.get(a); return { id: a, type: A.type, found: hasFile(A) }; }),
  };
}

/* ---------- Pro files ---------- */
function names(l) {
  const T = strings(l);
  const loc = LOCALE[l] || 'en-GB';
  const wd = new Intl.DateTimeFormat(loc, { weekday: 'long', timeZone: 'UTC' });
  const full = new Intl.DateTimeFormat(loc, { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric', timeZone: 'UTC' });
  const my = new Intl.DateTimeFormat(loc, { month: 'long', year: 'numeric', timeZone: 'UTC' });
  return {
    T,
    mood: pre => T.moodNames[(pre || 3) - 1],
    weekday: dow => wd.format(new Date(Date.UTC(2023, 0, 1 + dow))),
    dayTitle: e => full.format(new Date(Date.UTC(e.y, e.m, e.d))),
    monthYear: (y, m) => my.format(new Date(Date.UTC(y, m, 1))),
    activitiesLabel: T.mdActivities, voiceLabel: T.mdVoice,
    readme: (n, ys) => T.mdReadme.replace('{n}', String(n)).replace('{years}', ys.length > 1 ? `${ys[0]}\u2013${ys[ys.length - 1]}` : String(ys[0] || '')),
  };
}

async function markdownZip(id, ys, l) {
  const N = names(l);
  // the photos and voice notes of the chosen years that the file has
  const want = new Map();
  for (const e of J.entries) if (ys.includes(e.y)) for (const a of e.assets) { const A = J.assets.get(a); if (A && hasFile(A)) want.set(a, A); }
  const photos = new Map();
  const bytesOf = new Map();
  let k = 0;
  for (const a of want.keys()) {
    const p = await photoBytes(a);
    k++;
    if (k % 10 === 0) post('progress', { id, step: 'photos', p: Math.round((k / want.size) * 70) });
    if (!p) continue;
    photos.set(a, { ext: EXT[p.mime] || 'bin' });
    bytesOf.set(a, p.bytes);
  }
  const { files, photoPaths, days: nDays } = buildMarkdown(J, ys, N, photos);
  let blob = new Blob([]);
  const pending = [];
  let pendingBytes = 0;
  const flush = () => { blob = new Blob([blob, ...pending]); pending.length = 0; pendingBytes = 0; };
  const z = new Zip((err, chunk) => { if (err) throw err; pending.push(chunk); pendingBytes += chunk.length; if (pendingBytes > 16e6) flush(); });
  for (const [path, text] of Object.entries(files)) { const f = new ZipDeflate(path, { level: 6 }); z.add(f); f.push(strToU8(text), true); }
  for (const [a, path] of photoPaths) { const b = bytesOf.get(a); if (!b) continue; const f = new ZipPassThrough(path); z.add(f); f.push(b, true); bytesOf.delete(a); }
  z.end();
  flush();
  post('result', { id, blob, days: nDays, photos: photoPaths.size });
}

function bookData(ys, l) {
  const N = names(l);
  const list = J.entries.filter(e => ys.includes(e.y)).map(e => Object.assign(view(e), { text: e.text }));
  const pix = {};
  for (const y of ys) pix[y] = pixels(J, y);
  return { entries: list, pixels: pix, moodNames: J.moods.map(m => [m.id, m.name || N.mood(m.pre), m.score]), tagNames: J.tags.map(t => [t.id, t.name]) };
}

/* ---------- messages ---------- */
self.onmessage = async (ev) => {
  const m = ev.data || {};
  try {
    if (m.type === 'open') { lang = m.lang || lang; await open(m.file); return; }
    if (m.type === 'sample') { lang = m.lang || lang; openSample(lang); return; }
    if (!J) { post('error', { id: m.id, code: 'noopen' }); return; }
    const ys = Array.isArray(m.years) ? m.years : m.y != null ? [m.y] : [];
    switch (m.type) {
      case 'summary': post('result', { id: m.id, data: summary(J, ys) }); break;
      case 'byYear': post('result', { id: m.id, data: byYear(J) }); break;
      case 'pixels': post('result', { id: m.id, data: pixels(J, m.y) }); break;
      case 'month': post('result', { id: m.id, data: { entries: monthEntries(J, m.y, m.m).map(view), days: monthDays(J, m.y, m.m) } }); break;
      case 'day': post('result', { id: m.id, data: J.entries.filter(e => e.key === m.key).sort((a, b) => b.t - a.t).map(view) }); break;
      case 'search': { const r = search(J, m.q, ys, 200); post('result', { id: m.id, data: { q: r.q, total: r.total, elsewhere: r.elsewhere, shown: r.shown.map(e => Object.assign(view(e), { text: e.text })) } }); break; }
      case 'acts': post('result', { id: m.id, data: activityCounts(J, ys) }); break;
      case 'actMoods': post('result', { id: m.id, data: activityMoods(J, ys, 5) }); break;
      case 'photo': {
        const p = await scaled(await photoBytes(m.asset), m.max);
        if (!p) { post('result', { id: m.id, data: null }); break; }
        const copy = samplePhotos ? p.bytes.slice() : p.bytes;
        post('result', { id: m.id, data: { bytes: copy, mime: p.mime, w: p.w, h: p.h } }, [copy.buffer]);
        break;
      }
      case 'csv': post('result', { id: m.id, blob: new Blob([toCsv(J, ys, names(m.lang || lang))], { type: 'text/csv;charset=utf-8' }) }); break;
      case 'markdown': await markdownZip(m.id, ys, m.lang || lang); break;
      case 'book': post('result', { id: m.id, data: bookData(ys, m.lang || lang) }); break;
      case 'deflate': {
        // RGBA pixels -> RGB, deflated (the poster PDF's image)
        const src = new Uint8Array(m.rgba);
        const rgb = new Uint8Array((src.length / 4) * 3);
        for (let i = 0, j = 0; i < src.length; i += 4, j += 3) { rgb[j] = src[i]; rgb[j + 1] = src[i + 1]; rgb[j + 2] = src[i + 2]; }
        const out = deflateSync(rgb, { level: 6 });
        post('result', { id: m.id, data: out }, [out.buffer]);
        break;
      }
      default: post('error', { id: m.id, code: 'unknown' });
    }
  } catch (e) {
    const code = e instanceof BackupError ? e.code : 'internal';
    if (m.type === 'open' || m.type === 'sample') reset();
    post('error', { id: m.id, code, detail: e instanceof BackupError ? e.detail : String(e && e.message || e).slice(0, 200), during: m.type });
  }
};

