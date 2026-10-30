/* Builds the bust off the main thread and hands the typed arrays back. */
import { generate } from './headgen.js';
self.onmessage = (e) => {
  const r = generate(e.data || {});
  const t = [r.head.positions.buffer, r.head.normals.buffer, r.head.indices.buffer, r.head.ao.buffer, r.roots.buffer,
    r.marker.positions.buffer, r.marker.u.buffer, r.marker.across.buffer, r.marker.dash.buffer, r.marker.indices.buffer];
  self.postMessage(r, t);
};
