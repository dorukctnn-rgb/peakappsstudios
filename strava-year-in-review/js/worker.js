/* Yearlap worker: opens the export you pick in this browser tab, keeps the activities in memory and answers the page's
 * questions. It makes no network request; nothing it reads is stored or sent anywhere. A ZIP is never loaded whole: its
 * table of contents is read from the end of the file, then only the files Yearlap needs are opened.
 *  - Strava: activities.csv (and bikes.csv, shoes.csv); route files one by one, only when you ask for the route poster.
 *  - Garmin: the Activities.csv from Garmin Connect, or the "Export Your Data" archive, from which the activity list,
 *    the daily steps and the sleep are read; the original FIT files (in ZIPs inside the ZIP) only for the route poster. */
import { strFromU8 } from '../vendor/fflate.js';
import { isZip, openZip, readEntry, entryBlob } from './zipread.js';
import { createStore, ingestCsv, ingestGear, localise, yearsIn, computeStats, computeSport, computeGear, compareYears, parseCsv, offsetFinder, CAT } from './engine.js';
import { parseRoute, fitRoute } from './routes.js';
import { makeSampleActivities, sampleCsv, sampleRoute } from './sample.js';
import { looksGarminCsv, ingestGarminCsv, ingestGarminSummaries, createWellness, ingestDailySummaries, ingestSleep, computeWellness, wellnessCounts, fitFamily, garminSampleCsv, sampleWellness } from './garmin.js';

let st = createStore();
let routes = new Map(); // 'activities/123.fit.gz' (lower case) -> { zip, entry } | { file }
let L = null, tz = 'UTC', sample = false, lang = 'en';
let well = createWellness();
let gZips = [], gFits = [], gIndex = null; // Garmin: ZIPs of original files inside the archive, loose FIT files, what they hold

const post = (type, data, transfer) => self.postMessage(Object.assign({ type }, data), transfer || []);
const base = n => String(n).split(/[\\/]/).pop();
const routeKey = n => { const m = String(n).replace(/\\/g, '/').match(/activities\/[^/]+$/i); return m ? m[0].toLowerCase() : 'activities/' + base(n).toLowerCase(); };
const ROUTE_RE = /\.(gpx|fit|tcx)(\.gz)?$/i;
const G_SUMMARY = /DI-Connect-Fitness\/[^/]*summarizedActivities[^/]*\.json$/i;
const G_DAILY = /DI-Connect-Aggregator\/UDSFile[^/]*\.json$/i;
const G_SLEEP = /DI-Connect-Wellness\/[^/]*sleepData[^/]*\.json$/i;
const G_UPLOADS = /Uploaded-Files\/[^/]+\.zip$/i;
const G_FIT = /\.fit(\.gz)?$/i;
const garminName = n => G_SUMMARY.test(n) || G_DAILY.test(n) || G_SLEEP.test(n);

async function readText(blob) { return strFromU8(new Uint8Array(await blob.arrayBuffer())); }
const json = text => { try { return JSON.parse(text); } catch (e) { return null; } };

// a CSV: Garmin's Activities.csv when its columns say so, else Strava's activities.csv
function ingestAnyCsv(name, text) {
  const head = text.slice(0, 200000);
  const rows = parseCsv(head.slice(0, head.lastIndexOf('\n') > 0 ? head.lastIndexOf('\n') : head.length));
  if (looksGarminCsv(rows)) return ingestGarminCsv(st, name, text);
  return ingestCsv(st, name, text);
}

async function readGarminZip(zip, file, i, total) {
  post('progress', { file: 'DI_CONNECT', index: i, total, step: 'csv' });
  let found = 0;
  for (const e of zip.entries) {
    const n = e.name.replace(/\\/g, '/');
    try {
      if (G_SUMMARY.test(n)) { const j = json(strFromU8(await readEntry(zip, e))); if (j && ingestGarminSummaries(st, `${file.name}: ${base(n)}`, j, lang)) found++; else if (!j) st.problems.push({ name: `${file.name}: ${base(n)}`, reason: 'read' }); }
      else if (G_DAILY.test(n)) { const j = json(strFromU8(await readEntry(zip, e))); if (j) ingestDailySummaries(well, j); }
      else if (G_SLEEP.test(n)) { const j = json(strFromU8(await readEntry(zip, e))); if (j) ingestSleep(well, j); }
      else if (G_UPLOADS.test(n)) gZips.push({ zip, entry: e });
      else if (G_FIT.test(n)) gFits.push({ zip, entry: e });
      else if (/(^|\/)activities\.csv$/i.test(n) && !/(^|\/)activities\//i.test(n)) { if (ingestAnyCsv(`${file.name}: ${base(n)}`, strFromU8(await readEntry(zip, e)))) found++; }
    } catch (err) { st.problems.push({ name: `${file.name}: ${base(n)}`, reason: 'read' }); }
  }
  if (!found && !well.steps.size && !well.sleep.size) st.problems.push({ name: file.name, reason: 'nogarmin' });
  gIndex = null;
}

async function readZip(file, i, total) {
  let zip;
  try { zip = await openZip(file); } catch (e) { st.problems.push({ name: file.name, reason: 'zip' }); return; }
  const csvs = zip.entries.filter(e => base(e.name).toLowerCase() === 'activities.csv').sort((a, b) => a.name.length - b.name.length);
  const garmin = zip.entries.some(e => garminName(e.name.replace(/\\/g, '/')) || G_UPLOADS.test(e.name.replace(/\\/g, '/')) || /(^|\/)DI_CONNECT\//.test(e.name));
  if (garmin) { await readGarminZip(zip, file, i, total); return; }
  for (const e of zip.entries) if (ROUTE_RE.test(e.name) && /(^|\/)activities\//i.test(e.name)) routes.set(routeKey(e.name), { zip, entry: e });
  if (!csvs.length) {
    // a ZIP of FIT files (Garmin's "Export Original", or an Uploaded-Files part on its own)
    const fits = zip.entries.filter(e => G_FIT.test(e.name));
    if (fits.length) { for (const e of fits) gFits.push({ zip, entry: e }); gIndex = null; return; }
    const inside = zip.entries.filter(e => !e.name.includes('/') || e.name.split('/').length === 2).map(e => base(e.name)).filter(n => /\.(csv|json)$/i.test(n)).slice(0, 8);
    st.problems.push({ name: file.name, reason: 'nocsv', inside });
    return;
  }
  post('progress', { file: 'activities.csv', index: i, total, step: 'csv' });
  try { ingestAnyCsv(`${file.name}: activities.csv`, strFromU8(await readEntry(zip, csvs[0]))); }
  catch (e) { st.problems.push({ name: `${file.name}: activities.csv`, reason: 'zip' }); return; }
  for (const [nm, kind] of [['bikes.csv', 'bike'], ['shoes.csv', 'shoe']]) {
    const g = zip.entries.find(e => base(e.name).toLowerCase() === nm);
    if (g) { try { ingestGear(st, kind, strFromU8(await readEntry(zip, g))); } catch (e) { /* gear names are a nicety */ } }
  }
}

async function readOne(item, i, total) {
  const file = item && item.file ? item.file : item;
  const name = (item && item.path) || file.webkitRelativePath || file.name || 'file';
  const path = String(name).replace(/\\/g, '/');
  const inFolder = path.includes('/');
  const low = base(name).toLowerCase();
  // from an unzipped folder, only the files Yearlap reads are opened; photos, profile and the rest are left shut
  if (inFolder && !(low === 'activities.csv' || low === 'bikes.csv' || low === 'shoes.csv' || ROUTE_RE.test(low) || /\.zip$/i.test(low) || garminName(path))) { st.counts.skipped = (st.counts.skipped || 0) + 1; return; }
  if (!file.size) { st.problems.push({ name: base(name), reason: 'empty' }); return; }
  if (await isZip(file)) {
    if (inFolder && G_UPLOADS.test(path)) { gZips.push({ blob: file }); gIndex = null; return; }
    post('progress', { file: base(name), index: i, total, step: 'zip' }); await readZip(file, i, total); return;
  }
  if (garminName(path) || (/\.json$/i.test(low) && /summarizedactivities|udsfile|sleepdata/i.test(low))) {
    const j = json(await readText(file));
    if (!j) { st.problems.push({ name: base(name), reason: 'read' }); return; }
    if (/summarizedactivities/i.test(low)) ingestGarminSummaries(st, base(name), j, lang);
    else if (/udsfile/i.test(low)) ingestDailySummaries(well, j);
    else ingestSleep(well, j);
    return;
  }
  if (ROUTE_RE.test(low)) {
    if (!/(^|\/)activities\//i.test(path) && G_FIT.test(low)) { gFits.push({ file }); gIndex = null; }
    routes.set(routeKey(name), { file });
    return;
  }
  if (low === 'bikes.csv' || low === 'shoes.csv') { ingestGear(st, low === 'bikes.csv' ? 'bike' : 'shoe', await readText(file)); return; }
  if (/\.csv$/i.test(low) || file.type === 'text/csv') {
    if (file.size > 200e6) { st.problems.push({ name, reason: 'toobig' }); return; }
    post('progress', { file: base(name), index: i, total, step: 'csv' });
    ingestAnyCsv(base(name), await readText(file));
    return;
  }
  st.problems.push({ name: base(name), reason: 'type' });
}

const isGarmin = () => st.source === 'garmin' || (!st.acts.length && (gFits.length || gZips.length || well.steps.size || well.sleep.size));
function meta() {
  L = localise(st.acts, tz);
  let withRoute = 0;
  for (const a of st.acts) if (a.file && (sample || routes.has(a.file.toLowerCase()))) withRoute++;
  const g = isGarmin();
  return {
    count: L.length, years: yearsIn(L), files: st.files, problems: st.problems, counts: st.counts, layout: st.layout && { how: st.layout.how, unit1: st.layout.unit1, lang: st.layout.lang, columns: st.layout.columns, garmin: st.layout.garmin || '' },
    routes: g && !sample ? { garmin: true, available: gFits.length + gZips.length, archives: gZips.length, loose: gFits.length } : { withFile: st.acts.filter(a => a.file).length, available: withRoute, sources: sample ? withRoute : routes.size },
    gear: new Set(st.acts.map(a => a.gear).filter(Boolean)).size,
    sports: [...new Set(L.map(a => a.type))], sample, tz, source: g ? 'garmin' : 'strava', wellness: wellnessCounts(well),
  };
}

async function buildRoutes(m) {
  if (isGarmin() && !sample) return buildGarminRoutes(m);
  let list = L.filter(a => (m.year === 'all' || a.y === m.year) && a.file && (!m.sport || a.type === m.sport));
  if (!sample) list = list.filter(a => routes.has(a.file.toLowerCase()));
  const out = [], buffers = [];
  let failed = 0;
  for (let k = 0; k < list.length; k++) {
    const a = list[k];
    if (k % 8 === 0) post('routeProgress', { id: m.id, done: k, total: list.length });
    let pts = null;
    try {
      if (sample) pts = sampleRoute(a);
      else {
        const src = routes.get(a.file.toLowerCase());
        const bytes = src.zip ? await readEntry(src.zip, src.entry) : new Uint8Array(await src.file.arrayBuffer());
        pts = parseRoute(a.file, bytes);
      }
    } catch (e) { pts = null; }
    if (!pts) { failed++; continue; }
    out.push({ id: a.id, name: a.name, type: a.type, cat: a.cat, dist: a.dist, day: a.day, pts });
    buffers.push(pts.buffer);
  }
  post('routes', { id: m.id, routes: out, failed, asked: list.length }, buffers);
}

// Garmin: every original FIT file is read once (start, sport, points), then matched to its activity by the start time
async function garminIndex(id) {
  if (gIndex) return gIndex;
  const list = [];
  let done = 0, failed = 0, noGps = 0;
  const one = async (get) => {
    try {
      const r = fitRoute(await get());
      if (r.pts && Number.isFinite(r.t)) list.push(r); else noGps++;
    } catch (e) { failed++; }
    done++;
    if (done % 8 === 0) post('routeProgress', { id, done, total: -1 });
  };
  for (const f of gFits) await one(async () => (f.zip ? readEntry(f.zip, f.entry) : new Uint8Array(await f.file.arrayBuffer())));
  for (const z of gZips) {
    let inner;
    try { inner = await openZip(z.blob || await entryBlob(z.zip, z.entry)); } catch (e) { failed++; continue; }
    for (const e of inner.entries) if (G_FIT.test(e.name)) await one(() => readEntry(inner, e));
  }
  list.sort((a, b) => a.t - b.t);
  gIndex = { list, failed, noGps, read: done };
  return gIndex;
}
async function buildGarminRoutes(m) {
  const idx = await garminIndex(m.id);
  const off = offsetFinder(tz);
  const byGmt = new Map(), byLocal = new Map();
  for (const a of L) {
    if (Number.isFinite(a.gmt)) byGmt.set(Math.round(a.gmt / 60000), a);
    byLocal.set(Math.round(a.t / 60000), a);
  }
  const near = (map, k) => { for (const d of [0, -1, 1, -2, 2]) { const a = map.get(k + d); if (a) return a; } return null; };
  const out = [], buffers = [];
  for (const r of idx.list) {
    const lt = r.t + off(r.t) * 60000;
    const a = near(byGmt, Math.round(r.t / 60000)) || near(byLocal, Math.round(lt / 60000));
    const y = a ? a.y : new Date(lt).getUTCFullYear();
    if (m.year !== 'all' && y !== m.year) continue;
    if (m.sport && !(a && a.type === m.sport)) continue;
    const pts = r.pts.slice();
    out.push(a ? { id: a.id, name: a.name, type: a.type, cat: a.cat, dist: a.dist || r.dist, day: a.day, pts } : { id: 'fit' + r.t, name: '', type: '', cat: fitFamily(r.sport), dist: r.dist, day: Math.floor(lt / 864e5), pts });
    buffers.push(pts.buffer);
  }
  post('routes', { id: m.id, routes: out, failed: idx.failed, asked: out.length, read: idx.read }, buffers);
}

self.onmessage = async (ev) => {
  const m = ev.data || {};
  try {
    if (m.type === 'reset') { st = createStore(); routes = new Map(); well = createWellness(); gZips = []; gFits = []; gIndex = null; L = null; sample = false; post('reset', {}); return; }
    if (m.type === 'files') {
      tz = m.tz || tz; lang = m.lang || lang;
      sample = false;
      const files = m.files || [];
      for (let i = 0; i < files.length; i++) await readOne(files[i], i, files.length);
      post('loaded', { meta: meta() });
      return;
    }
    if (m.type === 'sample') {
      tz = m.tz || tz; lang = m.lang || lang;
      st = createStore(); routes = new Map(); well = createWellness(); gZips = []; gFits = []; gIndex = null; sample = true;
      const acts = makeSampleActivities(new Date());
      if (m.source === 'garmin') {
        ingestGarminCsv(st, 'Activities.csv', garminSampleCsv(acts, lang));
        const outdoor = new Set(acts.filter(a => a.file).map(a => 'gm' + Math.round(a.t / 60000)));
        for (const a of st.acts) if (outdoor.has(a.id) && a.cat !== CAT.SWIM) a.file = 'sample';
        well = sampleWellness(new Date());
      } else {
        ingestCsv(st, 'activities.csv (sample)', sampleCsv(acts));
        ingestGear(st, 'shoe', 'Shoe Name\nSample trainers (blue)\nSample trainers (orange)\n');
        ingestGear(st, 'bike', 'Bike Name\nSample road bike\n');
      }
      post('loaded', { meta: meta(), sample: true });
      return;
    }
    if (m.type === 'tz') { tz = m.tz; if (st.acts.length) post('loaded', { meta: meta(), tzChange: true }); return; }
    if (!L) return;
    if (m.type === 'stats') {
      const result = computeStats(L, { year: m.year });
      const extra = {};
      if (m.pro) {
        extra.compare = compareYears(L);
        extra.alltime = m.year === 'all' ? result : computeStats(L, { year: 'all' });
        extra.gear = computeGear(L, st.gearKind, { year: m.year });
        if (well.steps.size || well.sleep.size) extra.wellness = computeWellness(well, m.year);
      }
      post('stats', { id: m.id, result, ...extra });
      return;
    }
    if (m.type === 'sport') { post('sport', { id: m.id, result: computeSport(L, { year: m.year, sport: m.sport }) }); return; }
    if (m.type === 'routes') { await buildRoutes(m); return; }
  } catch (e) {
    post('error', { message: String((e && e.message) || e), id: m.id });
  }
};
