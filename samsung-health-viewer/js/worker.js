/* Wristory worker: opens the Samsung Health export you pick (the ZIP Samsung sends, the unzipped folder, or single
 * CSV files) in this browser tab, keeps the days in memory and answers the page's questions. It makes no network
 * request; nothing it reads is stored or sent anywhere. A ZIP is never loaded whole: its table of contents is read from
 * the end of the file, then only the files Wristory knows are opened, in pieces. Everything else in the export (the
 * device list, preferences, badges, GPS routes, the jsons folder, food logs and the like) is never opened. */
import { isZip, openZip, readEntry, streamEntry, streamFile } from './zipread.js';
import { CsvStream } from './csv.js';
import { kindOf, dataTypeOf, newExport, ingest, buildView, freeRange, yearsIn, summary, sheet, weekly, heartSource, compareYears, tables } from './engine.js';
import { makeSampleExport } from './sample.js';

let exports = [], problems = [], ignored = [], view = null, isSample = false;
const post = (type, data) => self.postMessage(Object.assign({ type }, data));
const base = n => String(n).split(/[\\/]/).pop();
const MAX_CSV = 4e9;

function reader(ex, kind, name) {
  const rec = { name, kind, rows: 0, skipped: 0 };
  const s = new CsvStream({ onRow: r => { const ok = ingest(ex, kind, r); if (ok) rec.rows++; else rec.skipped++; return ok; } });
  return { rec, s };
}

async function readKnown(ex, kind, name, streamer) {
  const dec = new TextDecoder('utf-8');
  const { rec, s } = reader(ex, kind, name);
  let last = 0;
  await streamer(b => s.push(dec.decode(b, { stream: true })), (done, total) => {
    if (done - last > (8 << 20) || done === total) { last = done; post('progress', { file: name, done, total }); }
  });
  s.push(dec.decode());
  s.end();
  if (!s.header) problems.push({ name, reason: 'empty' });
  ex.files.push(rec);
}

async function readZip(blob, label, depth = 0) {
  let zip;
  try { zip = await openZip(blob); } catch (e) { problems.push({ name: label, reason: 'zip' }); return; }
  const ex = newExport(label);
  const known = [];
  let encrypted = 0;
  for (const e of zip.entries) {
    const nm = base(e.name);
    if (e.name.startsWith('__MACOSX/') || /^\._/.test(nm)) continue;
    const kind = /\.csv$/i.test(nm) ? kindOf(nm) : null;
    if (kind) { if (e.encrypted) encrypted++; else known.push({ e, kind, nm, type: dataTypeOf(nm) }); }
    else if (/\.zip$/i.test(nm) && depth < 1) known.push({ e, kind: 'zip', nm });
    else ignored.push(nm);
  }
  // the same data type twice (an export unpacked into itself): keep the one closest to the top
  known.sort((a, b) => a.e.name.split('/').length - b.e.name.split('/').length);
  const seen = new Set();
  let any = false;
  for (const k of known) {
    if (k.kind === 'zip') {
      try { await readZip(new Blob([await readEntry(zip, k.e)]), `${label}: ${k.nm}`, depth + 1); } catch (e) { problems.push({ name: k.nm, reason: 'zip' }); }
      continue;
    }
    if (seen.has(k.type)) continue;
    seen.add(k.type);
    any = true;
    post('progress', { file: k.nm, done: 0, total: k.e.csize });
    try { await readKnown(ex, k.kind, k.nm, (onBytes, onProgress) => streamEntry(zip, k.e, onBytes, onProgress)); }
    catch (err) { problems.push({ name: k.nm, reason: 'zip' }); }
  }
  if (encrypted) problems.push({ name: label, reason: 'encrypted' });
  if (any) exports.push(ex);
  else if (!encrypted && (!depth || !known.length)) problems.push({ name: label, reason: 'nofiles', inside: zip.entries.slice(0, 6).map(e => base(e.name)) });
}

async function readFiles(list) {
  let loose = null;
  const seen = new Set();
  for (let i = 0; i < list.length; i++) {
    const item = list[i];
    const file = item && item.file ? item.file : item;
    const path = (item && item.path) || file.webkitRelativePath || file.name || 'file';
    const nm = base(path);
    if (list.length < 40 || i % 10 === 0) post('progress', { file: nm, done: 0, total: file.size || 0, index: i, count: list.length });
    if (!file.size) { if (!path.includes('/')) problems.push({ name: nm, reason: 'empty' }); continue; }
    if (/\.zip$/i.test(nm) || await isZip(file)) {
      if (await isZip(file)) await readZip(file, nm); else problems.push({ name: nm, reason: 'zip' });
      continue;
    }
    const kind = /\.csv$/i.test(nm) ? kindOf(nm) : null;
    if (!kind) {
      if (path.includes('/')) ignored.push(nm); else problems.push({ name: nm, reason: 'type' });
      continue;
    }
    if (file.size > MAX_CSV) { problems.push({ name: nm, reason: 'toobig' }); continue; }
    const type = dataTypeOf(nm);
    if (seen.has(type)) continue;
    seen.add(type);
    if (!loose) loose = newExport(path.includes('/') ? path.split('/')[0] : nm);
    try { await readKnown(loose, kind, nm, (onBytes, onProgress) => streamFile(file, onBytes, onProgress)); }
    catch (err) { problems.push({ name: nm, reason: 'read' }); }
  }
  if (loose && loose.files.length) exports.push(loose);
}

function rebuild() {
  // several exports dropped together are read as one history (duplicates are removed by the engine)
  view = buildView(exports);
  const files = exports.flatMap(ex => ex.files);
  return {
    labels: exports.map(ex => ex.label), files, problems, ignored: [...new Set(ignored)].slice(0, 400), ignoredCount: new Set(ignored).size, sample: isSample,
    first: view.first, last: view.last, years: yearsIn(view), free: freeRange(view), heart: heartSource(view),
    counts: { days: [...view.days.values()].filter(t => t.steps > 0).length, nights: view.nights.filter(n => !n.nap).length, workouts: view.workouts.length, weights: view.weights.length, bps: view.bps.length },
    has: {
      steps: [...view.days.values()].some(t => t.steps > 0), sleep: view.nights.length > 0, staged: view.nights.some(n => n.staged),
      heart: [...view.days.values()].some(t => t.hrN || t.rhr !== undefined || t.shr !== undefined), weight: view.weights.length > 0,
      workouts: view.workouts.length > 0, stress: [...view.days.values()].some(t => t.stressN), spo2: [...view.days.values()].some(t => t.spo2N), bp: view.bps.length > 0,
    },
  };
}

self.onmessage = async (ev) => {
  const m = ev.data || {};
  try {
    if (m.type === 'reset') { exports = []; problems = []; ignored = []; view = null; isSample = false; post('reset', {}); return; }
    if (m.type === 'files' || m.type === 'sample') {
      exports = []; problems = []; ignored = []; view = null; isSample = false;
      if (m.type === 'sample') {
        isSample = true;
        const ex = newExport('Sample export (made up)');
        const { files } = makeSampleExport({ days: m.days || 820 });
        for (const [name, text] of Object.entries(files)) {
          const kind = kindOf(name);
          if (!kind) { ignored.push(base(name)); continue; }
          const { rec, s } = reader(ex, kind, base(name));
          s.push(text); s.end(); ex.files.push(rec);
        }
        exports.push(ex);
      } else await readFiles(m.files || []);
      post('loaded', { meta: rebuild() });
      return;
    }
    if (!view) return;
    if (m.type === 'summary') {
      post('summary', { id: m.id, summary: summary(view, m.from, m.to), sheet: sheet(view, m.from, m.to), weeks: { steps: weekly(view, m.from, m.to, 'steps'), asleep: weekly(view, m.from, m.to, 'asleep'), heart: weekly(view, m.from, m.to, 'heart'), kg: weekly(view, m.from, m.to, 'kg'), stress: weekly(view, m.from, m.to, 'stress'), spo2: weekly(view, m.from, m.to, 'spo2') } });
      return;
    }
    if (m.type === 'tables') { post('tables', { id: m.id, tables: tables(view, m.from, m.to) }); return; }
    if (m.type === 'compare') { post('compare', { id: m.id, rows: compareYears(view, m.a, m.b) }); return; }
    if (m.type === 'year') { const y = m.year; post('year', { id: m.id, summary: summary(view, `${y}-01-01`, `${y}-12-31`), sheet: sheet(view, `${y}-01-01`, `${y}-12-31`) }); return; }
  } catch (e) {
    post('error', { message: String((e && e.message) || e), id: m.id });
  }
};
