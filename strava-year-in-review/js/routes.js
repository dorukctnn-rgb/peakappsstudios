/* Route files from a Strava export: activities/<id>.gpx, .tcx.gz or .fit.gz (the original file from your watch or bike
 * computer). Each one is read for its GPS points only, then thinned to a few hundred points for the poster. FIT is a
 * binary format (Garmin's); this reader follows its record layout: definition messages, data messages, compressed
 * timestamp headers and developer fields, and keeps latitude and longitude from the "record" message (global number 20). */
import { gunzipSync, strFromU8 } from '../vendor/fflate.js';

const SEMI = 180 / 2147483648;
export const MAX_POINTS = 700;

// meta (optional): filled with what a Garmin export needs to place a file in time without an activity list: the start
// (session start_time, else the first record's timestamp, else file_id time_created; Unix ms, UTC), the sport (FIT sport
// enum, from the session or the sport message) and the session's total distance in metres.
const FIT_EPOCH = 631065600000; // 1989-12-31T00:00:00Z, where FIT time starts
export function fitPoints(u8, meta = null) {
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
        const at = {};
        for (let k = 0; k < nf; k++) {
          if (p + 3 > end) return out;
          const fnum = u8[p], sz = u8[p + 1];
          if (fnum === 0 && sz === 4) lat = size;
          if (fnum === 1 && sz === 4) lon = size;
          if (meta) at[fnum] = [size, sz];
          size += sz;
          p += 3;
        }
        if (rh & 0x20) {
          const nd = u8[p++];
          for (let k = 0; k < nd; k++) { size += u8[p + 1]; p += 3; }
        }
        defs[local] = { global, little, size, lat, lon, at };
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
  function u32(d, p, f) { const a = d.at[f]; if (!a || a[1] !== 4) return -1; const v = dv.getUint32(p + a[0], d.little); return v === 0xffffffff ? -1 : v; }
  function u8f(d, p, f) { const a = d.at[f]; if (!a || a[1] !== 1) return -1; const v = u8[p + a[0]]; return v === 0xff ? -1 : v; }
  function take(d, p) {
    if (meta) {
      if (d.global === 18) { // session
        const st = u32(d, p, 2); if (st > 0 && !(meta.start > 0)) meta.start = FIT_EPOCH + st * 1000;
        const sp = u8f(d, p, 5); if (sp >= 0 && meta.sport == null) meta.sport = sp;
        const td = u32(d, p, 9); if (td > 0) meta.dist = (meta.dist || 0) + td / 100;
      } else if (d.global === 12) { const sp = u8f(d, p, 0); if (sp >= 0 && meta.sport == null) meta.sport = sp; }
      else if (d.global === 0) { const tc = u32(d, p, 4); if (tc > 0 && !(meta.created > 0)) meta.created = FIT_EPOCH + tc * 1000; }
      else if (d.global === 20 && !(meta.first > 0)) { const ts = u32(d, p, 253); if (ts > 0) meta.first = FIT_EPOCH + ts * 1000; }
    }
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

// a FIT file from a Garmin export, on its own: its points (thinned, or null when it has no GPS), when it started (UTC
// ms, or NaN), its FIT sport number and its distance in metres (the session's, else measured along the points)
export function fitRoute(bytes) {
  let u8 = bytes;
  if (u8.length > 2 && u8[0] === 0x1f && u8[1] === 0x8b) u8 = gunzipSync(u8);
  const meta = {};
  const flat = fitPoints(u8, meta);
  const t = meta.start > 0 ? meta.start : meta.first > 0 ? meta.first : meta.created > 0 ? meta.created : NaN;
  let dist = meta.dist > 0 ? meta.dist : 0;
  if (!dist && flat.length >= 4) {
    const R = 6371008.8, rad = Math.PI / 180;
    for (let i = 2; i < flat.length; i += 2) {
      const a1 = flat[i - 2] * rad, a2 = flat[i] * rad, dl = (flat[i + 1] - flat[i - 1]) * rad;
      const h = Math.sin((a2 - a1) / 2) ** 2 + Math.cos(a1) * Math.cos(a2) * Math.sin(dl / 2) ** 2;
      dist += 2 * R * Math.asin(Math.min(1, Math.sqrt(h)));
    }
  }
  return { pts: flat.length >= 4 ? thin(flat) : null, t, sport: meta.sport == null ? -1 : meta.sport, dist };
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
