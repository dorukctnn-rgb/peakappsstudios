/* Yearlap worker: opens the export you pick (the ZIP, the unzipped folder or activities.csv) in this browser tab, keeps
 * the activities in memory and answers the page's questions. It makes no network request; nothing it reads is stored or
 * sent anywhere. A ZIP is never loaded whole: its table of contents is read from the end of the file, then only
 * activities.csv (and bikes.csv, shoes.csv) are opened. Route files are opened one by one, and only when you ask for the
 * route poster. */
import { strFromU8 } from '../vendor/fflate.js';
import { isZip, openZip, readEntry } from './zipread.js';
import { createStore, ingestCsv, ingestGear, localise, yearsIn, computeStats, computeSport, computeGear, compareYears } from './engine.js';
import { parseRoute } from './routes.js';
import { makeSampleActivities, sampleCsv, sampleRoute } from './sample.js';

let st = createStore();
let routes = new Map(); // 'activities/123.fit.gz' (lower case) -> { zip, entry } | { file }
let L = null, tz = 'UTC', sample = false;

const post = (type, data, transfer) => self.postMessage(Object.assign({ type }, data), transfer || []);
const base = n => String(n).split(/[\\/]/).pop();
const routeKey = n => { const m = String(n).replace(/\\/g, '/').match(/activities\/[^/]+$/i); return m ? m[0].toLowerCase() : 'activities/' + base(n).toLowerCase(); };
const ROUTE_RE = /\.(gpx|fit|tcx)(\.gz)?$/i;

async function readText(blob) { return strFromU8(new Uint8Array(await blob.arrayBuffer())); }

async function readZip(file, i, total) {
  let zip;
  try { zip = await openZip(file); } catch (e) { st.problems.push({ name: file.name, reason: 'zip' }); return; }
  const csvs = zip.entries.filter(e => base(e.name).toLowerCase() === 'activities.csv').sort((a, b) => a.name.length - b.name.length);
  for (const e of zip.entries) if (ROUTE_RE.test(e.name) && /(^|\/)activities\//i.test(e.name)) routes.set(routeKey(e.name), { zip, entry: e });
  if (!csvs.length) {
    const inside = zip.entries.filter(e => !e.name.includes('/') || e.name.split('/').length === 2).map(e => base(e.name)).filter(n => /\.(csv|json)$/i.test(n)).slice(0, 8);
    st.problems.push({ name: file.name, reason: 'nocsv', inside });
    return;
  }
  post('progress', { file: 'activities.csv', index: i, total, step: 'csv' });
  try { ingestCsv(st, `${file.name}: activities.csv`, strFromU8(await readEntry(zip, csvs[0]))); }
  catch (e) { st.problems.push({ name: `${file.name}: activities.csv`, reason: 'zip' }); return; }
  for (const [nm, kind] of [['bikes.csv', 'bike'], ['shoes.csv', 'shoe']]) {
    const g = zip.entries.find(e => base(e.name).toLowerCase() === nm);
    if (g) { try { ingestGear(st, kind, strFromU8(await readEntry(zip, g))); } catch (e) { /* gear names are a nicety */ } }
  }
}

async function readOne(item, i, total) {
  const file = item && item.file ? item.file : item;
  const name = (item && item.path) || file.webkitRelativePath || file.name || 'file';
  const inFolder = name.includes('/');
  const low = base(name).toLowerCase();
  // from an unzipped folder, only activities.csv, bikes.csv, shoes.csv and the route files are opened; photos, profile
  // and the rest are left shut
  if (inFolder && !(low === 'activities.csv' || low === 'bikes.csv' || low === 'shoes.csv' || ROUTE_RE.test(low) || /\.zip$/i.test(low))) { st.counts.skipped = (st.counts.skipped || 0) + 1; return; }
  if (!file.size) { st.problems.push({ name: base(name), reason: 'empty' }); return; }
  if (await isZip(file)) { post('progress', { file: base(name), index: i, total, step: 'zip' }); await readZip(file, i, total); return; }
  if (ROUTE_RE.test(low)) { routes.set(routeKey(name), { file }); return; }
  if (low === 'bikes.csv' || low === 'shoes.csv') { ingestGear(st, low === 'bikes.csv' ? 'bike' : 'shoe', await readText(file)); return; }
  if (/\.csv$/i.test(low) || file.type === 'text/csv') {
    if (file.size > 200e6) { st.problems.push({ name, reason: 'toobig' }); return; }
    post('progress', { file: base(name), index: i, total, step: 'csv' });
    ingestCsv(st, base(name), await readText(file));
    return;
  }
  st.problems.push({ name: base(name), reason: 'type' });
}

function meta() {
  L = localise(st.acts, tz);
  let withRoute = 0;
  for (const a of st.acts) if (a.file && (sample || routes.has(a.file.toLowerCase()))) withRoute++;
  return {
    count: L.length, years: yearsIn(L), files: st.files, problems: st.problems, counts: st.counts, layout: st.layout && { how: st.layout.how, unit1: st.layout.unit1, lang: st.layout.lang, columns: st.layout.columns },
    routes: { withFile: st.acts.filter(a => a.file).length, available: withRoute, sources: sample ? withRoute : routes.size }, gear: new Set(st.acts.map(a => a.gear).filter(Boolean)).size,
    sports: [...new Set(L.map(a => a.type))], sample, tz,
  };
}

async function buildRoutes(m) {
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

self.onmessage = async (ev) => {
  const m = ev.data || {};
  try {
    if (m.type === 'reset') { st = createStore(); routes = new Map(); L = null; sample = false; post('reset', {}); return; }
    if (m.type === 'files') {
      tz = m.tz || tz;
      sample = false;
      const files = m.files || [];
      for (let i = 0; i < files.length; i++) await readOne(files[i], i, files.length);
      post('loaded', { meta: meta() });
      return;
    }
    if (m.type === 'sample') {
      tz = m.tz || tz;
      st = createStore(); routes = new Map(); sample = true;
      const acts = makeSampleActivities(new Date());
      ingestCsv(st, 'activities.csv (sample)', sampleCsv(acts));
      ingestGear(st, 'shoe', 'Shoe Name\nSample trainers (blue)\nSample trainers (orange)\n');
      ingestGear(st, 'bike', 'Bike Name\nSample road bike\n');
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
