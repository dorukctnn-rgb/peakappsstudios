// Stashback worker: reads the Collections database files off the page's main thread, so a large file never freezes the
// page. Messages in: { type: 'open', files: [{ name, size, bytes }], labels } | { type: 'sample' }. Out: { type: 'done',
// result, sample } | { type: 'error', code, detail, names }. Nothing here touches the network.
import { readCollections, mergeResults, OpenError, MAX_FILE } from './engine.js';

function readOne(f, label) {
  if (f.size === 0) throw new OpenError('zero', f.name);
  if (f.size > MAX_FILE) throw new OpenError('too-big', f.name);
  return readCollections(new Uint8Array(f.bytes), { label });
}

self.onmessage = async ev => {
  const m = ev.data || {};
  try {
    if (m.type === 'sample') {
      const { sampleBytes } = await import('./sample.js');
      const r = readCollections(sampleBytes(), { label: 'Sample' });
      self.postMessage({ type: 'done', result: r, sample: true });
      return;
    }
    if (m.type === 'open') {
      const results = [];
      const skipped = [];
      for (let i = 0; i < m.files.length; i++) {
        const f = m.files[i];
        try { results.push(readOne(f, m.labels[i])); } catch (e) {
          if (m.files.length === 1) throw e;
          skipped.push({ name: f.name, code: e.code || 'corrupt', detail: e.message });
        }
      }
      if (!results.length) throw new OpenError(skipped[0]?.code || 'corrupt', skipped[0]?.detail || '');
      self.postMessage({ type: 'done', result: results.length === 1 ? results[0] : mergeResults(results), parts: results.map(r => r.stats), skipped });
    }
  } catch (e) {
    self.postMessage({ type: 'error', code: e.code || 'corrupt', detail: String(e.message || '') });
  }
};
