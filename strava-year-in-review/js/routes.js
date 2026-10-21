/* Route files from a Strava export: activities/<id>.gpx, .tcx.gz or .fit.gz (the original file from your watch or bike
 * computer). Each one is read for its GPS points only, then thinned to a few hundred points for the poster. FIT is a
 * binary format (Garmin's); this reader follows its record layout: definition messages, data messages, compressed
 * timestamp headers and developer fields, and keeps latitude and longitude from the "record" message (global number 20). */
import { gunzipSync, strFromU8 } from '../vendor/fflate.js';

const SEMI = 180 / 2147483648;
export const MAX_POINTS = 700;

export function fitPoints(u8) {
  const out = [];
  const dv = new DataView(u8.buffer, u8.byteOffset, u8.byteLength);
  let off = 0;
  while (off + 12 <= u8.length) {
    const hs = u8[off];
    if ((hs !== 12 && hs !== 14) || !(u8[off + 8] === 0x2e && u8[off + 9] === 0x46 && u8[off + 10] === 0x49 && u8[off + 11] === 0x54)) break;
    const dataSize = dv.getUint32(off + 4, true);
    let p = off + hs;
    const end = Math.min(u8.length, p + dataSize);
    const defs = [];
    while (p < end) {
      const rh = u8[p++];
      if (rh & 0x80) {
        const d = defs[(rh >> 5) & 3];
        if (!d || p + d.size > end) return out;
        take(d, p);
        p += d.size;
        continue;
      }
      const local = rh & 0x0f;
      if (rh & 0x40) {
        if (p + 5 > end) return out;
        const little = u8[p + 1] === 0;
        const global = dv.getUint16(p + 2, little);
        const nf = u8[p + 4];
        p += 5;
        let size = 0, lat = -1, lon = -1;
        for (let k = 0; k < nf; k++) {
          if (p + 3 > end) return out;
          const fnum = u8[p], sz = u8[p + 1];
          if (fnum === 0 && sz === 4) lat = size;
          if (fnum === 1 && sz === 4) lon = size;
          size += sz;
          p += 3;
        }
        if (rh & 0x20) {
          const nd = u8[p++];
          for (let k = 0; k < nd; k++) { size += u8[p + 1]; p += 3; }
        }
        defs[local] = { global, little, size, lat, lon };
      } else {
        const d = defs[local];
        if (!d || p + d.size > end) return out;
        take(d, p);
        p += d.size;
      }
    }
    off = off + hs + dataSize + 2;
  }
  return out;
  function take(d, p) {
    if (d.global !== 20 || d.lat < 0 || d.lon < 0) return;
    const la = dv.getInt32(p + d.lat, d.little), lo = dv.getInt32(p + d.lon, d.little);
    if (la === 0x7fffffff || lo === 0x7fffffff || (la === 0 && lo === 0)) return;
    out.push(la * SEMI, lo * SEMI);
  }
}

export function gpxPoints(text) {
  const out = [];
  const re = /<(?:[\w-]+:)?(?:trkpt|rtept)\b([^>]*)>/g;
  let m;
  while ((m = re.exec(text))) {
    const a = m[1];
    const la = a.match(/\blat\s*=\s*["']\s*([-+]?[\d.]+(?:e[-+]?\d+)?)/i), lo = a.match(/\blon\s*=\s*["']\s*([-+]?[\d.]+(?:e[-+]?\d+)?)/i);
    if (la && lo) { const y = +la[1], x = +lo[1]; if (Number.isFinite(y) && Number.isFinite(x) && !(y === 0 && x === 0)) out.push(y, x); }
  }
  return out;
}

export function tcxPoints(text) {
  const out = [];
  const re = /<(?:[\w-]+:)?LatitudeDegrees>\s*([-+]?[\d.]+)\s*<\/(?:[\w-]+:)?LatitudeDegrees>\s*<(?:[\w-]+:)?LongitudeDegrees>\s*([-+]?[\d.]+)/g;
  let m;
  while ((m = re.exec(text))) { const y = +m[1], x = +m[2]; if (Number.isFinite(y) && Number.isFinite(x) && !(y === 0 && x === 0)) out.push(y, x); }
  return out;
}

// keeps at most max points, evenly spaced along the file, always the first and the last
export function thin(flat, max = MAX_POINTS) {
  const n = flat.length / 2;
  if (n <= max) return Float64Array.from(flat);
  const out = new Float64Array(max * 2);
  for (let i = 0; i < max; i++) {
    const k = Math.round((i * (n - 1)) / (max - 1));
    out[i * 2] = flat[k * 2]; out[i * 2 + 1] = flat[k * 2 + 1];
  }
  return out;
}

// name: the file's name (activities/123.fit.gz); bytes: its contents. Returns Float64Array [lat, lon, lat, lon...] or null.
export function parseRoute(name, bytes) {
  let u8 = bytes;
  let nm = String(name).toLowerCase();
  if (u8.length > 2 && u8[0] === 0x1f && u8[1] === 0x8b) { u8 = gunzipSync(u8); nm = nm.replace(/\.gz$/, ''); }
  let flat = [];
  const isFit = u8.length >= 12 && u8[8] === 0x2e && u8[9] === 0x46 && u8[10] === 0x49 && u8[11] === 0x54;
  if (isFit || nm.endsWith('.fit')) flat = fitPoints(u8);
  else {
    const text = strFromU8(u8.subarray(0, Math.min(u8.length, 60e6)));
    flat = /<(?:[\w-]+:)?TrainingCenterDatabase/.test(text.slice(0, 4000)) || nm.endsWith('.tcx') ? tcxPoints(text) : gpxPoints(text);
  }
  if (flat.length < 4) return null;
  return thin(flat);
}
