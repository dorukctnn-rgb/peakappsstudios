/* Lastleaf worker: reads the files you pick, in this browser tab, and builds the text file you save. It makes no network
 * request; nothing it reads is stored or sent anywhere, and your files are only read, never changed. The files' bytes
 * stay in memory only while this tab is open on them. */
import { openFiles, normalise, applyMapping, guessMapping, structureReport, pathLabel, MAX_FILE } from './engine.js';
import { allNotesText } from './export.js';
import { sampleJson } from './sample.js';
import { PRO_FORMATS, proExporter } from './pro.js';

let book = null; // { notes, folders, sources, sample }
let pending = null; // files still waiting for the mapping screen: { found: raws, unsure: [...], docs, calendars, problems }
let last = null; // the files of the last open, for the keys-only structure report: { docs, calendars, problems }
const post = (type, data, transfer) => self.postMessage(Object.assign({ type }, data), transfer || []);

function finish(raws, meta) {
  const N = normalise(raws);
  book = { notes: N.notes, folders: N.folders, sources: meta.sources, sample: !!meta.sample };
  pending = null;
  post('opened', { data: { notes: N.notes, folders: N.folders, sources: meta.sources, calendars: meta.calendars || [], problems: meta.problems || [], sample: !!meta.sample, mapped: !!meta.mapped } });
}

function askMapping() {
  const doc = pending.unsure[0];
  const json = pending.docs.find(d => d.name === doc.name).json;
  // the best list first: the one whose keys look most like notes, then the longest
  const ranked = doc.candidates.map(c => { const g = guessMapping(c); return { c, g, score: (g.body ? 4 : 0) + (g.title ? 2 : 0) + (g.created || g.modified ? 1 : 0) }; })
    .sort((a, b) => b.score - a.score || b.c.count - a.c.count);
  post('map', {
    data: {
      name: doc.name.split(' > ').pop(),
      left: pending.unsure.length,
      found: pending.found.length,
      candidates: ranked.map(({ c, g }) => ({ path: c.path, label: pathLabel(c.path), count: c.count, keys: c.keys, guess: g, parentKeys: parentKeys(json, c.path) })),
      report: structureReport(pending.docs, { calendars: pending.calendars.length, problems: pending.problems }),
    },
  });
}

// text fields of the objects that hold a list, offered as "the notebook name" on the mapping screen
function parentKeys(json, path) {
  const out = [];
  if (path.includes('{}')) out.push('#key');
  let v = json;
  for (let i = 0; i < path.length - 1; i++) {
    const seg = path[i];
    if (seg === '[]') v = Array.isArray(v) ? v.find(x => x && typeof x === 'object') : null;
    else if (seg === '{}') v = v && typeof v === 'object' ? Object.values(v)[0] : null;
    else v = v && typeof v === 'object' ? v[seg] : null;
    if (!v || typeof v !== 'object') break;
    if (!Array.isArray(v) && path[i + 1] !== '[]' && path[i + 1] !== '{}') continue;
    if (!Array.isArray(v)) for (const [k, x] of Object.entries(v)) if (typeof x === 'string' && /^[a-z_$][A-Za-z0-9_$\-]{0,47}$/.test(k)) out.push(k);
  }
  return [...new Set(out)];
}

// a single preview row for the mapping screen: what the first three notes would look like with the chosen fields
function preview(m) {
  const doc = pending.unsure[0];
  const json = pending.docs.find(d => d.name === doc.name).json;
  const raws = applyMapping(json, m);
  const N = normalise(raws.slice(0, 200));
  return { count: raws.length, first: N.notes.slice(0, 3).map(n => ({ title: n.title, text: n.text.slice(0, 160), folder: n.folder, created: n.created, modified: n.modified })) };
}

self.onmessage = async ev => {
  const m = ev.data || {};
  try {
    if (m.type === 'open') {
      book = null; pending = null;
      const files = [], tooBig = [];
      for (const f of m.files || []) {
        if (f.size > MAX_FILE) { tooBig.push({ name: f.name, code: 'toobig' }); continue; }
        files.push({ name: String(f.name || 'file').slice(0, 200), bytes: new Uint8Array(await f.arrayBuffer()) });
      }
      const got = openFiles(files);
      got.problems.push(...tooBig);
      const sizes = new Map(files.map(f => [f.name, f.bytes.length]));
      for (const p of got.problems) if (p.bytes == null && sizes.has(p.name)) p.bytes = sizes.get(p.name);
      last = { docs: got.docs, calendars: got.calendars, problems: got.problems };
      const sources = got.docs.map(d => d.name.split(' > ').pop());
      if (!got.docs.length) { post('failed', { calendars: got.calendars, problems: got.problems }); return; }
      if (got.unsure.length) {
        pending = { found: got.raws, unsure: got.unsure, docs: got.docs, calendars: got.calendars, problems: got.problems, sources };
        askMapping();
        return;
      }
      finish(got.raws, { sources, calendars: got.calendars, problems: got.problems });
      return;
    }
    if (m.type === 'preview') { if (pending) post('preview', { data: preview(m.mapping) }); return; }
    if (m.type === 'mapped' || m.type === 'skip') {
      if (!pending) return;
      const doc = pending.unsure.shift();
      if (m.type === 'mapped') {
        const json = pending.docs.find(d => d.name === doc.name).json;
        const raws = applyMapping(json, m.mapping);
        for (const r of raws) r.src = doc.name;
        pending.found.push(...raws);
      }
      if (pending.unsure.length) { askMapping(); return; }
      if (!pending.found.length) { const p = pending; pending = null; post('failed', { calendars: p.calendars, problems: p.problems, nonotes: true }); return; }
      finish(pending.found, { sources: pending.sources, calendars: pending.calendars, problems: pending.problems, mapped: true });
      return;
    }
    if (m.type === 'report') {
      post('report', { text: last ? structureReport(last.docs, { calendars: last.calendars.length, problems: last.problems }) : '' });
      return;
    }
    if (m.type === 'sample') {
      last = null;
      const bytes = new TextEncoder().encode(sampleJson(Date.now()));
      const got = openFiles([{ name: 'sample.json', bytes }]);
      finish(got.raws, { sources: ['sample'], sample: true });
      return;
    }
    if (m.type === 'export') {
      if (!book) throw new Error('nobook');
      if (m.kind === 'txt-all') { post('result', { id: m.id, blob: new Blob([allNotesText(book.notes, { madeOn: Date.now(), sources: book.sources, sample: book.sample })], { type: 'text/plain;charset=utf-8' }) }); return; }
      if (PRO_FORMATS.includes(m.kind)) proExporter(m.kind); // throws while Pro is off
      throw new Error('unknown export ' + m.kind);
    }
  } catch (e) {
    post('error', { id: m.id, code: e && e.code ? e.code : 'internal', detail: String(e && e.message || e).slice(0, 200) });
  }
};
