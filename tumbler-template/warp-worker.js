/* Bends a flat design onto the template off the main thread. Message in: { id, src (ArrayBuffer RGBA), params }.
 * Messages out: { id, progress } while working, then { id, buf } (RGBA ArrayBuffer, params.outW x params.outH). */
importScripts('geometry.js');
self.onmessage = (e) => {
  const { id, src, params } = e.data;
  try {
    const s = new Uint8ClampedArray(src);
    const dst = new Uint8ClampedArray(params.outW * params.outH * 4);
    const rows = Math.max(1, Math.floor(400000 / params.outW));
    let lastReport = 0;
    for (let y = 0; y < params.outH; y += rows) {
      self.TumblerGeo.warpRows(dst, s, params, y, Math.min(params.outH, y + rows));
      const now = Date.now();
      if (now - lastReport > 120) { self.postMessage({ id, progress: Math.min(1, (y + rows) / params.outH) }); lastReport = now; }
    }
    self.postMessage({ id, buf: dst.buffer }, [dst.buffer]);
  } catch (err) {
    self.postMessage({ id, error: String(err && err.message || err) });
  }
};
