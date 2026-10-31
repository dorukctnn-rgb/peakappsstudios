/* Ficshelf's Web Worker: lists the files and (Pro) searches their text without freezing the page. It gets File handles from the page,
 * reads their tops, and posts back small records. A cancel message stops the work before the next file. The Bloom filters of a search
 * stay here for the session only. Nothing here touches the network. */
import { expandSources, sourceId } from './source.js';
import { scanAll } from './scan.js';
import { searchLibrary } from './search.js';

let cancelled = false;
const blooms = new Map();
const post = m => postMessage(m);
const throttle = (fn, ms) => { let last = 0; return a => { const t = Date.now(); if (t - last >= ms) { last = t; fn(a); } }; };

self.onmessage = async e => {
  const m = e.data || {};
  if (m.type === 'cancel') { cancelled = true; return; }
  if (m.type === 'forget') { blooms.clear(); return; }
  if (m.type === 'scan') {
    cancelled = false;
    try {
      post({ type: 'progress', id: m.id, phase: 'open', done: 0, total: 0 });
      const { sources, skipped } = await expandSources(m.items, { isCancelled: () => cancelled });
      const r = await scanAll(sources, { isCancelled: () => cancelled, onProgress: throttle(p => post({ type: 'progress', id: m.id, phase: 'scan', ...p }), 60) });
      const ids = new Set(r.works.map(w => w.id));
      post({ type: 'done', id: m.id, works: r.works, sources: sources.filter(s => ids.has(sourceId(s))), skipped, cancelled: r.cancelled });
    } catch (err) { post({ type: 'error', id: m.id, message: String((err && err.message) || err) }); }
    return;
  }
  if (m.type === 'search') {
    cancelled = false;
    try {
      const r = await searchLibrary(m.items, m.query, blooms, {
        isCancelled: () => cancelled,
        onResult: row => post({ type: 'hit', id: m.id, row }),
        onProgress: throttle(p => post({ type: 'progress', id: m.id, phase: 'search', ...p }), 80),
      });
      post({ type: 'done', id: m.id, scanned: r.scanned, cancelled: r.cancelled, count: r.results.length });
    } catch (err) { post({ type: 'error', id: m.id, message: String((err && err.message) || err) }); }
  }
};
