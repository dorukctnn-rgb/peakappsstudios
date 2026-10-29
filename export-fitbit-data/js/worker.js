/* Tallyband worker: opens the Fitbit / Google Health archive you pick (the Takeout ZIP or its parts, an unzipped folder, or
 * single JSON and CSV files) in this browser tab and answers the page's requests for tables. It makes no network request;
 * nothing it reads is stored or sent anywhere. A ZIP is never loaded whole: its table of contents is read from the end of
 * the file, then only the files a request needs. Heart-rate readings (most of a real archive's size) are opened only when
 * you download them, and only for the days you chose. */
import { isZip, openZip, readEntry } from './zipread.js';
import * as E from './engine.js';
import { writeXlsx } from './xlsx.js';
import { zipSync, strToU8 } from '../vendor/fflate.js';
import { makeSampleZip } from './sample.js';

let S = null, files = [], keys = new Set(), problems = [], archives = [], isSample = false, settings = { tz: '', unit: '', auto: false };
const post = (type, data, transfer) => self.postMessage(Object.assign({ type }, data), transfer || []);
const dec = new TextDecoder('utf-8');
const MAX_HR_DAYS = 31, MAX_MINUTE_DAYS = 366;

async function textOf(f) {
  if (f.zip) return dec.decode(await readEntry(f.zip, f.e));
  return await f.file.text();
}
function addFile(path, size, src) {
  const c = E.classify(path);
  if (!c.kind) return;
  const key = path.replace(/^.*?(Takeout\/|MyFitbitData\/[^/]+\/)/i, '') + '|' + size;
  if (keys.has(key)) return;   // the same archive added twice
  keys.add(key);
  files.push(Object.assign({ path, name: E.base(path), size, key }, c, src));
}

async function openAll(list) {
  for (let i = 0; i < list.length; i++) {
    const item = list[i];
    const file = item && item.file ? item.file : item;
    const path = (item && item.path) || file.webkitRelativePath || file.name || 'file';
    const nm = E.base(path);
    post('progress', { stage: 'list', file: nm, i, n: list.length });
    if (!file.size) { if (!path.includes('/')) problems.push({ name: nm, reason: 'empty' }); continue; }
    if (await isZip(file)) {
      let zip;
      try { zip = await openZip(file); } catch (e) { problems.push({ name: nm, reason: 'zip' }); continue; }
      archives.push(nm);
      let enc = 0, any = 0;
      for (const e of zip.entries) {
        if (e.encrypted) { enc++; continue; }
        const before = files.length;
        addFile(e.name, e.usize, { zip, e });
        if (files.length > before) any++;
      }
      if (enc) problems.push({ name: nm, reason: 'encrypted' });
      if (!any && !enc) problems.push({ name: nm, reason: 'nofitbit', inside: zip.entries.slice(0, 5).map(e => e.name) });
      continue;
    }
    const head = new Uint8Array(await file.slice(0, 8).arrayBuffer());
    if (head[0] === 0x25 && head[1] === 0x50 && head[2] === 0x44 && head[3] === 0x46) { problems.push({ name: nm, reason: 'pdf' }); continue; }
    if (head[0] === 0x52 && head[1] === 0x61 && head[2] === 0x72) { problems.push({ name: nm, reason: 'rar' }); continue; }
    if (head[0] === 0x37 && head[1] === 0x7a) { problems.push({ name: nm, reason: '7z' }); continue; }
    if (head[0] === 0x1f && head[1] === 0x8b) { problems.push({ name: nm, reason: 'tgz' }); continue; }
    if (!/\.(json|csv)$/i.test(nm) && !/^User(Sleeps|SleepStages)_/i.test(nm)) { if (!path.includes('/')) problems.push({ name: nm, reason: 'type' }); continue; }
    const before = files.length;
    addFile(path, file.size, { file });
    if (files.length === before && !path.includes('/')) problems.push({ name: nm, reason: 'unknown' });
  }
}

async function load() {
  S = E.newStore();
  const todo = E.planLoad(files);
  let done = 0;
  for (const f of todo) {
    if (done % 4 === 0) post('progress', { stage: 'read', file: f.name, i: done, n: todo.length });
    try { E.ingestFile(S, f.kind, await textOf(f)); }
    catch (err) { problems.push({ name: f.name, reason: 'parse', detail: String(err && err.message || err).slice(0, 120) }); }
    done++;
  }
  if (!settings.tz) settings.tz = S.tz || '';
}

function familyList() {
  const fams = new Map();
  for (const f of files) {
    if (f.kind === 'profile') continue;
    const id = f.kind === 'csv' || f.kind === 'json' ? f.family : f.kind;
    const o = fams.get(id) || { id, kind: f.kind, label: f.label, files: 0, bytes: 0, first: '', last: '' };
    o.files++; o.bytes += f.size || 0;
    const d = E.nameDate(f.name);
    if (d) { if (!o.first || d < o.first) o.first = d; if (!o.last || d > o.last) o.last = d; }
    fams.set(id, o);
  }
  return [...fams.values()];
}

function meta() {
  const tz = settings.tz || S.tz;
  const wu = E.weightUnit(S);
  const fams = familyList();
  const has = k => fams.some(f => f.id === k);
  return {
    sample: isSample, archives, problems, tz, tzFrom: settings.auto ? 'device' : settings.tz && settings.tz !== S.tz ? 'you' : S.tzFrom, weight: wu, unit: settings.unit || wu.unit,
    coverage: E.coverage(S, tz),
    counts: { nights: [...S.nights.values()].filter(n => n.main).length, naps: [...S.nights.values()].filter(n => !n.main).length, weights: S.weights.size, workouts: S.workouts.size },
    has: { minutes: S.q.steps.size > 0 || S.q.calories.size > 0, hr: has('hr') || has('gdHr'), stages: [...S.nights.values()].some(n => n.segments && n.segments.length) },
    others: fams.filter(f => f.kind === 'csv' || f.kind === 'json').sort((a, b) => a.label.localeCompare(b.label)),
    fileCount: files.length,
  };
}

/* ------------------------------------------------------------------ tables */
function table(what, from, to) {
  const tz = settings.tz || S.tz, unit = settings.unit || E.weightUnit(S).unit || 'lb';
  if (what === 'daily') return E.dailyRows(S, from, to, { tz, unit });
  if (what === 'sleep') return E.sleepRows(S, from, to);
  if (what === 'stages') return E.stageRows(S, from, to);
  if (what === 'weight') return E.weightRows(S, from, to, unit);
  if (what === 'workouts') return E.workoutRows(S, from, to);
  return null;
}
const spanDays = (from, to) => Math.round((Date.parse(to + 'T00:00:00Z') - Date.parse(from + 'T00:00:00Z')) / 864e5) + 1;

async function readings(kind, from, to) {
  const tz = settings.tz || S.tz;
  if (kind === 'hr') {
    if (spanDays(from, to) > MAX_HR_DAYS) return { error: 'hr-range' };
    const lo = E.addDays(from, -1), hi = E.addDays(to, 1);
    const list = files.filter(f => (f.kind === 'hr' || f.kind === 'gdHr') && E.nameDate(f.name) >= lo && E.nameDate(f.name) <= hi);
    let rows = [];
    let i = 0;
    for (const f of list) {
      post('progress', { stage: 'export', file: f.name, i: i++, n: list.length });
      const t = await textOf(f);
      const arr = f.kind === 'hr' ? E.parseJsonArray(t) : E.parseCsv(t).rows.map(r => ({ dateTime: r.timestamp, value: { bpm: r['beats per minute'] ?? r.bpm ?? r.value } }));
      rows = rows.concat(E.readingRows(arr, from, to, tz, 'hr'));
    }
    rows.sort((a, b) => (a.time < b.time ? -1 : a.time > b.time ? 1 : 0));
    return { rows };
  }
  if (spanDays(from, to) > MAX_MINUTE_DAYS) return { error: 'minute-range' };
  const lo = E.addDays(from, -40), hi = E.addDays(to, 1);
  const lists = {};
  for (const fam of ['steps', 'calories', 'distance']) {
    const list = files.filter(f => f.kind === fam && E.nameDate(f.name) >= lo && E.nameDate(f.name) <= hi).sort((a, b) => (a.name < b.name ? -1 : 1));
    let rows = [];
    for (const f of list) { post('progress', { stage: 'export', file: f.name, i: 0, n: 1 }); rows = rows.concat(E.readingRows(E.parseJsonArray(await textOf(f)), from, to, tz, fam)); }
    const seen = new Set();
    lists[fam] = rows.filter(r => (seen.has(r.time) ? false : (seen.add(r.time), true)));
  }
  return { rows: E.mergeMinuteRows(lists) };
}

async function other(id, from, to) {
  const list = files.filter(f => f.family === id);
  const dated = list.every(f => E.nameDate(f.name));
  const lo = E.addDays(from || '2008-01-01', -40), hi = E.addDays(to || '2040-01-01', 1);
  const use = dated ? list.filter(f => E.nameDate(f.name) >= lo && E.nameDate(f.name) <= hi) : list;
  const texts = [];
  let i = 0;
  for (const f of use) { post('progress', { stage: 'export', file: f.name, i: i++, n: use.length }); texts.push(await textOf(f)); }
  return list[0] && list[0].kind === 'json' ? E.genericJsonRows(texts, from, to) : E.genericCsvRows(texts, from, to);
}

const MAIN = [['daily', 'Daily summary'], ['sleep', 'Sleep'], ['stages', 'Sleep stages'], ['weight', 'Weight'], ['workouts', 'Workouts']];
async function everything(from, to) {
  const sheets = MAIN.map(([k, name]) => ({ key: k, name, rows: table(k, from, to) }));
  for (const f of meta().others) { const r = await other(f.id, from, to); sheets.push({ key: f.id, name: f.label, rows: r.rows }); }
  return sheets;
}

self.onmessage = async (ev) => {
  const m = ev.data || {};
  try {
    if (m.type === 'open' || m.type === 'sample') {
      S = null; files = []; keys = new Set(); problems = []; archives = []; settings = { tz: '', unit: '', auto: false }; isSample = m.type === 'sample';
      if (isSample) await openAll([{ file: new File([makeSampleZip()], 'takeout-sample-tallyband.zip', { type: 'application/zip' }), path: 'takeout-sample-tallyband.zip' }]);
      else await openAll(m.files || []);
      await load();
      post('loaded', { meta: meta() });
      return;
    }
    if (!S) return;
    if (m.type === 'settings') { if (m.tz !== undefined) { settings.tz = E.validZone(m.tz) ? m.tz : ''; settings.auto = !!m.auto; } if (m.unit !== undefined) settings.unit = m.unit === 'kg' || m.unit === 'lb' ? m.unit : ''; post('meta', { id: m.id, meta: meta() }); return; }
    if (m.type === 'preview') { const rows = table('daily', m.from, m.to); post('preview', { id: m.id, rows: rows.slice(0, m.limit || 8), total: rows.length, counts: Object.fromEntries(MAIN.map(([k]) => [k, table(k, m.from, m.to).length])) }); return; }
    if (m.type === 'csv') {
      let rows = table(m.what, m.from, m.to), note = '';
      if (rows) { /* one of the five main tables */ }
      else if (m.what === 'hr' || m.what === 'minutes') { const r = await readings(m.what, m.from, m.to); if (r.error) { post('fail', { id: m.id, code: r.error }); return; } rows = r.rows; }
      else { const r = await other(m.what, m.from, m.to); rows = r.rows; if (!r.cut) note = 'nodates'; }
      post('file', { id: m.id, rows: rows.length, note, text: E.toCsv(rows, { sep: m.sep === ';' ? ';' : ',' }) });
      return;
    }
    if (m.type === 'xlsx' || m.type === 'csvzip') {
      const sheets = await everything(m.from, m.to);
      if (m.type === 'xlsx') { const bytes = writeXlsx(sheets); post('file', { id: m.id, rows: sheets.reduce((a, s) => a + s.rows.length, 0), bytes }, [bytes.buffer]); return; }
      const out = {};
      for (const s of sheets) if (s.rows.length) out[`tallyband-${E.slugify(E.FILE_NAMES[s.key] || s.name)}-${m.from}-to-${m.to}.csv`] = strToU8(E.toCsv(s.rows, { sep: m.sep === ';' ? ';' : ',' }));
      const bytes = zipSync(out, { level: 6 });
      post('file', { id: m.id, rows: sheets.reduce((a, s) => a + s.rows.length, 0), bytes }, [bytes.buffer]);
      return;
    }
  } catch (e) {
    post('fail', { id: m.id, code: 'error', message: String((e && e.message) || e).slice(0, 200) });
  }
};
