/* Earhours worker: opens the files you pick (ZIP or JSON) in this browser tab, keeps the plays in memory and answers the
 * page's questions. It makes no network request; nothing it reads is stored or sent anywhere. A ZIP is opened one history
 * file at a time, so a long Extended streaming history never sits in memory all at once. */
import { unzipSync, strFromU8 } from '../vendor/fflate.js';
import { createStore, ingestJsonText, ingestParsed, isHistoryName, finalize, localise, yearsIn, computeStats, compareYears } from './engine.js';
import { makeSample } from './sample.js';

let st = createStore();
let f = null, L = null;

const post = (type, data) => self.postMessage(Object.assign({ type }, data));
const isZip = (u8) => u8.length >= 4 && u8[0] === 0x50 && u8[1] === 0x4b && (u8[2] === 3 || u8[2] === 5) && (u8[3] === 4 || u8[3] === 6);
const lastPart = (n) => String(n).split(/[\\/]/).pop();

async function readOne(file, i, total) {
  const name = file.name || 'file';
  if (!file.size) { st.problems.push({ name, reason: 'empty' }); return; }
  const head = new Uint8Array(await file.slice(0, 4).arrayBuffer());
  if (isZip(head)) {
    let buf;
    try { buf = new Uint8Array(await file.arrayBuffer()); } catch (e) { st.problems.push({ name, reason: 'read' }); return; }
    const names = [];
    try { unzipSync(buf, { filter: (e) => { names.push(e.name); return false; } }); } catch (e) { st.problems.push({ name, reason: 'zip' }); return; }
    const wanted = names.filter(isHistoryName);
    if (!wanted.length) { st.problems.push({ name, reason: 'nohistory', inside: names.filter(n => /\.json$/i.test(n)).map(lastPart).slice(0, 8) }); return; }
    for (let k = 0; k < wanted.length; k++) {
      const inner = wanted[k];
      post('progress', { file: lastPart(inner), index: i, total, part: k + 1, parts: wanted.length, plays: st.counts.rows });
      let out;
      try { out = unzipSync(buf, { filter: (e) => e.name === inner }); } catch (e) { st.problems.push({ name: lastPart(inner), reason: 'zip' }); continue; }
      const bytes = out[inner];
      if (!bytes) continue;
      ingestJsonText(st, lastPart(inner), strFromU8(bytes));
    }
    return;
  }
  post('progress', { file: name, index: i, total, part: 1, parts: 1, plays: st.counts.rows });
  if (!/\.json$/i.test(name) && !(head[0] === 0x5b || head[0] === 0xef || head[0] === 0x20 || head[0] === 0x0a || head[0] === 0x0d)) { st.problems.push({ name, reason: 'type' }); return; }
  let text;
  try { text = await file.text(); } catch (e) { st.problems.push({ name, reason: 'read' }); return; }
  ingestJsonText(st, name, text);
}

function meta(tz) {
  f = finalize(st);
  L = localise(f, tz);
  return {
    plays: f.n, files: st.files, notUsed: st.notUsed, problems: st.problems, counts: st.counts,
    hasExtended: f.hasExtended, hasAccount: f.hasAccount,
    years: yearsIn(f, L), first: f.n ? f.t[0] : null, last: f.n ? f.t[f.n - 1] : null, tz,
  };
}

self.onmessage = async (ev) => {
  const m = ev.data || {};
  try {
    if (m.type === 'reset') { st = createStore(); f = null; L = null; post('reset', {}); return; }
    if (m.type === 'files') {
      const files = m.files || [];
      for (let i = 0; i < files.length; i++) await readOne(files[i], i, files.length);
      post('loaded', { meta: meta(m.tz) });
      return;
    }
    if (m.type === 'sample') {
      ingestParsed(st, 'Streaming_History_Audio_sample.json', makeSample(new Date()));
      post('loaded', { meta: meta(m.tz), sample: true });
      return;
    }
    if (m.type === 'tz') { if (f) post('loaded', { meta: meta(m.tz), tzChange: true }); return; }
    if (m.type === 'stats') {
      if (!f || !L) return;
      const result = computeStats(f, L, { year: m.year, topN: m.topN || 10, today: m.today });
      const alltime = m.alltime ? (m.year === 'all' ? result : computeStats(f, L, { year: 'all', topN: 10, today: m.today })) : null;
      post('stats', { id: m.id, result, compare: m.compare ? compareYears(f, L) : null, alltime });
    }
  } catch (e) {
    post('error', { message: String((e && e.message) || e) });
  }
};
