/* Nightjar worker: opens the Oura export you pick (the ZIP, the unzipped folder or single CSV files) in this browser tab,
 * keeps the nights and days in memory and answers the page's questions. It makes no network request; nothing it reads is
 * stored or sent anywhere. A ZIP is never loaded whole: its table of contents is read from the end of the file, then only
 * the files Nightjar knows are opened, and the large ones (heart rate, skin temperature, daytime stress) are read in
 * pieces. Files it does not use (location, meals, medication, cycle data and the like) are never opened. */
import { isZip, openZip, readEntry, streamEntry, streamFile } from './zipread.js';
import { CsvStream } from './csv.js';
import { fileKind, STREAMED, newExport, ingestRow, streamRow, makeLocaliser, buildView, freeRange, yearsIn, summary, nightList, nightDetail, dayDetail, series, compare, tagStats, dailyCsv } from './engine.js';
import { makeSampleExport } from './sample.js';

let exports = [], problems = [], ignored = [], view = null, merged = false, isSample = false;
let tz = 'UTC', local = makeLocaliser('UTC');
const post = (type, data) => self.postMessage(Object.assign({ type }, data));
const base = n => String(n).split(/[\\/]/).pop();
const MAX_CSV = 4e9;

function ingestText(ex, kind, name, feed) {
  const rec = { name, kind, rows: 0, skipped: 0 };
  const s = new CsvStream({ onRow: r => { const ok = STREAMED.has(kind) ? streamRow(ex, kind, r, local) : ingestRow(ex, kind, r); if (ok) rec.rows++; else rec.skipped++; } });
  return { rec, s };
}

// JSON versions of the same files ({"data": [...]} or a bare array) are read too.
function ingestJson(ex, kind, name, text) {
  const rec = { name, kind, rows: 0, skipped: 0 };
  let j;
  try { j = JSON.parse(text); } catch (e) { problems.push({ name, reason: 'json' }); return rec; }
  const rows = Array.isArray(j) ? j : Array.isArray(j && j.data) ? j.data : (j && Object.values(j).find(Array.isArray)) || [];
  for (const o of rows) {
    if (!o || typeof o !== 'object') { rec.skipped++; continue; }
    const r = {};
    for (const [k, v] of Object.entries(o)) r[k.toLowerCase()] = v !== null && typeof v === 'object' ? JSON.stringify(v) : v === null ? '' : String(v);
    const ok = STREAMED.has(kind) ? streamRow(ex, kind, r, local) : ingestRow(ex, kind, r);
    if (ok) rec.rows++; else rec.skipped++;
  }
  return rec;
}

async function readKnown(ex, kind, name, size, streamer) {
  const dec = new TextDecoder('utf-8');
  if (/\.json$/i.test(name)) {
    const parts = [];
    await streamer(b => parts.push(dec.decode(b, { stream: true })), null);
    parts.push(dec.decode());
    ex.files.push(ingestJson(ex, kind, name, parts.join('')));
    return;
  }
  const { rec, s } = ingestText(ex, kind, name);
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
  for (const e of zip.entries) {
    const nm = base(e.name);
    if (/^\._|^__MACOSX\//.test(nm) || e.name.startsWith('__MACOSX/')) continue;
    const kind = /\.(csv|json)$/i.test(nm) ? fileKind(nm) : null;
    if (kind) known.push({ e, kind, nm });
    else if (/\.zip$/i.test(nm) && depth < 1) known.push({ e, kind: 'zip', nm });
    else ignored.push(nm);
  }
  // the same file twice (an export unpacked into itself): keep the one closest to the top
  known.sort((a, b) => a.e.name.split('/').length - b.e.name.split('/').length);
  const seen = new Set();
  let any = false;
  for (const k of known) {
    if (k.kind === 'zip') {
      try { const inner = new Blob([await readEntry(zip, k.e)]); await readZip(inner, `${label}: ${k.nm}`, depth + 1); } catch (e) { problems.push({ name: k.nm, reason: 'zip' }); }
      continue;
    }
    if (seen.has(k.kind)) continue;
    seen.add(k.kind);
    any = true;
    post('progress', { file: k.nm, done: 0, total: k.e.csize });
    try { await readKnown(ex, k.kind, k.nm, k.e.usize, (onBytes, onProgress) => streamEntry(zip, k.e, onBytes, onProgress)); }
    catch (err) { problems.push({ name: k.nm, reason: 'zip' }); }
  }
  if (any) exports.push(ex);
  else if (!depth || !known.length) problems.push({ name: label, reason: 'nofiles', inside: zip.entries.slice(0, 6).map(e => base(e.name)) });
}

async function readFiles(list) {
  let loose = null;
  for (let i = 0; i < list.length; i++) {
    const item = list[i];
    const file = item && item.file ? item.file : item;
    const path = (item && item.path) || file.webkitRelativePath || file.name || 'file';
    const nm = base(path);
    post('progress', { file: nm, done: 0, total: file.size || 0, index: i, count: list.length });
    if (!file.size) { problems.push({ name: nm, reason: 'empty' }); continue; }
    if (await isZip(file)) { await readZip(file, nm); continue; }
    const kind = /\.(csv|json|txt)$/i.test(nm) ? fileKind(nm) : null;
    if (!kind) {
      if (path.includes('/')) ignored.push(nm); else problems.push({ name: nm, reason: 'type' });
      continue;
    }
    if (file.size > MAX_CSV) { problems.push({ name: nm, reason: 'toobig' }); continue; }
    if (!loose) loose = newExport(path.includes('/') ? path.split('/')[0] : nm);
    if (loose.files.some(f => f.kind === kind)) continue;
    try { await readKnown(loose, kind, nm, file.size, (onBytes, onProgress) => streamFile(file, onBytes, onProgress)); }
    catch (err) { problems.push({ name: nm, reason: 'read' }); }
  }
  if (loose && loose.files.length) exports.push(loose);
}

function lastOf(ex) { let l = ''; for (const k of ex.days.keys()) if (k > l) l = k; for (const n of ex.nights.values()) if (n.day > l) l = n.day; return l; }
function firstOf(ex) { let f = '9999'; for (const k of ex.days.keys()) if (k < f) f = k; for (const n of ex.nights.values()) if (n.day < f) f = n.day; return f === '9999' ? '' : f; }

function rebuild() {
  const usable = exports.filter(ex => ex.days.size || ex.nights.size);
  const newest = [...usable].sort((a, b) => (lastOf(a) < lastOf(b) ? 1 : -1))[0];
  view = buildView(merged ? usable : newest ? [newest] : []);
  return {
    exports: usable.map(ex => ({ label: ex.label, first: firstOf(ex), last: lastOf(ex), nights: new Set([...ex.nights.values()].map(n => n.day)).size, days: ex.days.size, files: ex.files, used: merged || ex === newest })),
    problems, ignored: [...new Set(ignored)], sample: isSample, merged,
    first: view.first, last: view.last, years: yearsIn(view), free: freeRange(view), tz,
    hasNights: view.main.size > 0, hasDays: view.days.size > 0,
  };
}

const SERIES = ['sleepScore', 'readiness', 'activityScore', 'total', 'deep', 'rem', 'light', 'awake', 'eff', 'lat', 'hrv', 'hrLow', 'hrAvg', 'breath', 'tempDev', 'spo2', 'bdi', 'steps', 'activeCal', 'stressHigh', 'recoveryHigh', 'dayHr', 'skinTemp', 'dayStress', 'vascularAge', 'vo2max', 'bedtime', 'wake'];

self.onmessage = async (ev) => {
  const m = ev.data || {};
  try {
    if (m.type === 'reset') { exports = []; problems = []; ignored = []; view = null; isSample = false; post('reset', {}); return; }
    if (m.type === 'files' || m.type === 'sample') {
      tz = m.tz || tz; local = makeLocaliser(tz); merged = !!m.merge;
      if (m.type === 'sample') {
        exports = []; problems = []; ignored = []; isSample = true;
        const ex = newExport('Sample export (made up)');
        const { files } = makeSampleExport({ days: m.days || 800 });
        for (const [name, text] of Object.entries(files)) {
          const kind = fileKind(name);
          const { rec, s } = ingestText(ex, kind, name);
          s.push(text); s.end(); ex.files.push(rec);
        }
        exports.push(ex);
      } else {
        if (isSample) { exports = []; problems = []; ignored = []; isSample = false; }
        await readFiles(m.files || []);
      }
      post('loaded', { meta: rebuild() });
      return;
    }
    if (m.type === 'merge') { merged = !!m.merge; if (exports.length) post('loaded', { meta: rebuild(), quiet: true }); return; }
    if (!view) return;
    if (m.type === 'summary') {
      const s = summary(view, m.from, m.to);
      const ser = {}; for (const k of SERIES) ser[k] = series(view, m.from, m.to, k);
      post('summary', { id: m.id, summary: s, nights: nightList(view, m.from, m.to), series: ser, tags: m.pro ? tagStats(view, m.from, m.to) : null });
      return;
    }
    if (m.type === 'night') { post('night', { id: m.id, night: nightDetail(view, m.day) }); return; }
    if (m.type === 'day') { post('day', { id: m.id, detail: dayDetail(view, m.day) }); return; }
    if (m.type === 'compare') { post('compare', { id: m.id, rows: compare(view, m.a, m.b) }); return; }
    if (m.type === 'csv') { post('csv', { id: m.id, text: dailyCsv(view, m.from, m.to) }); return; }
    if (m.type === 'nights') { post('nights', { id: m.id, nights: nightList(view, m.from, m.to) }); return; }
    if (m.type === 'workouts') { post('workouts', { id: m.id, workouts: view.workouts.filter(w => w.day >= m.from && w.day <= m.to).map(w => ({ day: w.day, activity: w.activity, label: w.label, cal: w.cal, dist: w.dist, intensity: w.intensity, dur: w.dur })) }); return; }
  } catch (e) {
    post('error', { message: String((e && e.message) || e), id: m.id });
  }
};
