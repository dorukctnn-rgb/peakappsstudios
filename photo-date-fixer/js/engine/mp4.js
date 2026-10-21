// Sets the creation time (mvhd, tkhd, mdhd) and the location atom (©xyz, ISO 6709) of an MP4/MOV without re-encoding.
// Only the moov box is rewritten; when moov sits before mdat ("fast start") every chunk offset (stco/co64) moves by the
// size change. Big files are handled by reading the top-level boxes through Blob slices, so only moov is in memory.
import { rdBE16, rdBE32, rdBE64, toUtf8, wrBE32, wrBE64 } from './bytes.js';

const EPOCH_1904 = 2082844800;
const CONTAINERS = new Set(['moov', 'trak', 'mdia', 'minf', 'stbl', 'edts', 'dinf', 'udta', 'mvex']);

export class Mp4Error extends Error {}

const typeAt = (b, o) => String.fromCharCode(b[o], b[o + 1], b[o + 2], b[o + 3]);

// children of a box payload [start, end)
export function boxes(b, start, end) {
  const out = [];
  let p = start;
  while (p + 8 <= end) {
    let size = rdBE32(b, p);
    const type = typeAt(b, p + 4);
    let header = 8;
    if (size === 1) {
      if (p + 16 > end) break;
      size = rdBE64(b, p + 8);
      header = 16;
    } else if (size === 0) size = end - p;
    if (size < header || p + size > end) break;
    out.push({ type, start: p, size, header, end: p + size });
    p += size;
  }
  return out;
}

export function iso6709(lat, lon) {
  const f = (v, w) => {
    const s = v < 0 ? '-' : '+';
    const [i, d] = Math.abs(v).toFixed(4).split('.');
    return `${s}${i.padStart(w, '0')}.${d}`;
  };
  return `${f(lat, 2)}${f(lon, 3)}/`;
}

function xyzBox(loc) {
  const s = toUtf8(iso6709(loc.lat, loc.lon));
  const b = new Uint8Array(8 + 4 + s.length);
  wrBE32(b, 0, b.length);
  b.set([0xa9, 0x78, 0x79, 0x7a], 4);
  b[8] = (s.length >> 8) & 255;
  b[9] = s.length & 255;
  b[10] = 0x15;
  b[11] = 0xc7;
  b.set(s, 12);
  return b;
}

function patchTimes(m, secs, first = 8) {
  // m: Uint8Array of the whole moov box (patched in place)
  let n = 0;
  const walk = (start, end) => {
    for (const bx of boxes(m, start, end)) {
      const p = bx.start + bx.header;
      if (bx.type === 'mvhd' || bx.type === 'tkhd' || bx.type === 'mdhd') {
        const v = m[p];
        if (v === 1 && p + 20 <= bx.end) {
          wrBE64(m, p + 4, secs);
          wrBE64(m, p + 12, secs);
          n++;
        } else if (v === 0 && p + 12 <= bx.end) {
          wrBE32(m, p + 4, secs >>> 0);
          wrBE32(m, p + 8, secs >>> 0);
          n++;
        }
      } else if (CONTAINERS.has(bx.type)) walk(p, bx.end);
    }
  };
  walk(first, m.length);
  return n;
}

function shiftChunkOffsets(m, delta, first = 8) {
  let ok = true;
  const walk = (start, end) => {
    for (const bx of boxes(m, start, end)) {
      const p = bx.start + bx.header;
      if (bx.type === 'stco') {
        const count = rdBE32(m, p + 4);
        for (let i = 0; i < count; i++) {
          const at = p + 8 + i * 4;
          const v = rdBE32(m, at) + delta;
          if (v < 0 || v > 0xffffffff) ok = false;
          else wrBE32(m, at, v);
        }
      } else if (bx.type === 'co64') {
        const count = rdBE32(m, p + 4);
        for (let i = 0; i < count; i++) {
          const at = p + 8 + i * 8;
          wrBE64(m, at, rdBE64(m, at) + delta);
        }
      } else if (CONTAINERS.has(bx.type)) walk(p, bx.end);
    }
  };
  walk(first, m.length);
  return ok;
}

// Returns a new moov with times set and ©xyz added or replaced. moovFirst: moov comes before mdat.
export function rewriteMoov(moov, { utcMs, loc, moovFirst }) {
  const secs = Math.floor(utcMs / 1000) + EPOCH_1904;
  const base = moov.slice();
  if (base.length < 8 || typeAt(base, 4) !== 'moov') throw new Mp4Error('moov box expected');
  const header = rdBE32(base, 0) === 1 ? 16 : 8;
  const timesPatched = patchTimes(base, secs, header);
  if (!loc) return { moov: base, delta: 0, timesPatched, xyz: false };
  const kids = boxes(base, header, base.length);
  const udta = kids.find((k) => k.type === 'udta');
  const xyz = xyzBox(loc);
  let next;
  if (udta) {
    const inner = boxes(base, udta.start + udta.header, udta.end);
    const old = inner.find((k) => k.type === '©xyz');
    const parts = [];
    parts.push(base.subarray(udta.start + udta.header, old ? old.start : udta.end), xyz);
    if (old) parts.push(base.subarray(old.end, udta.end));
    let innerLen = 0;
    for (const p of parts) innerLen += p.length;
    const newUdta = new Uint8Array(8 + innerLen);
    wrBE32(newUdta, 0, newUdta.length);
    newUdta.set(toUtf8('udta'), 4);
    let o = 8;
    for (const p of parts) {
      newUdta.set(p, o);
      o += p.length;
    }
    next = new Uint8Array(base.length - udta.size + newUdta.length);
    next.set(base.subarray(0, udta.start), 0);
    next.set(newUdta, udta.start);
    next.set(base.subarray(udta.end), udta.start + newUdta.length);
  } else {
    const newUdta = new Uint8Array(8 + xyz.length);
    wrBE32(newUdta, 0, newUdta.length);
    newUdta.set(toUtf8('udta'), 4);
    newUdta.set(xyz, 8);
    next = new Uint8Array(base.length + newUdta.length);
    next.set(base, 0);
    next.set(newUdta, base.length);
  }
  if (header === 16) wrBE64(next, 8, next.length);
  else if (next.length > 0xffffffff) throw new Mp4Error('moov too large');
  else wrBE32(next, 0, next.length);
  const delta = next.length - base.length;
  if (moovFirst && delta) {
    if (!shiftChunkOffsets(next, delta, header)) return { moov: base, delta: 0, timesPatched, xyz: false };
  }
  return { moov: next, delta, timesPatched, xyz: true };
}

// Whole file in memory
export function patchMp4(u8, opts) {
  const top = boxes(u8, 0, u8.length);
  const moov = top.find((b) => b.type === 'moov');
  if (!moov) throw new Mp4Error('no moov box');
  const mdat = top.find((b) => b.type === 'mdat');
  const r = rewriteMoov(u8.subarray(moov.start, moov.end), { ...opts, moovFirst: Boolean(mdat && moov.start < mdat.start) });
  const out = new Uint8Array(u8.length - moov.size + r.moov.length);
  out.set(u8.subarray(0, moov.start), 0);
  out.set(r.moov, moov.start);
  out.set(u8.subarray(moov.end), moov.start + r.moov.length);
  return { bytes: out, ...r };
}

// Top-level boxes of a Blob, reading 16 bytes per box
export async function blobBoxes(blob) {
  const out = [];
  let p = 0;
  const size = blob.size;
  while (p + 8 <= size) {
    const h = new Uint8Array(await blob.slice(p, Math.min(size, p + 16)).arrayBuffer());
    let len = rdBE32(h, 0);
    const type = typeAt(h, 4);
    let header = 8;
    if (len === 1) {
      if (h.length < 16) break;
      len = rdBE64(h, 8);
      header = 16;
    } else if (len === 0) len = size - p;
    if (len < header || p + len > size) break;
    out.push({ type, start: p, size: len, header, end: p + len });
    p += len;
  }
  return out;
}

// Plan for a large file kept on disk: [copy range, new moov bytes, copy range]
export async function planMp4Patch(blob, opts) {
  const top = await blobBoxes(blob);
  const moov = top.find((b) => b.type === 'moov');
  if (!moov) throw new Mp4Error('no moov box');
  if (moov.size > 64 * 1024 * 1024) throw new Mp4Error('moov box too large');
  const mdat = top.find((b) => b.type === 'mdat');
  const moovBytes = new Uint8Array(await blob.slice(moov.start, moov.end).arrayBuffer());
  const r = rewriteMoov(moovBytes, { ...opts, moovFirst: Boolean(mdat && moov.start < mdat.start) });
  return { before: [0, moov.start], moov: r.moov, after: [moov.end, blob.size], size: blob.size - moov.size + r.moov.length, ...r };
}

// Read creation time and location back (tests)
export function readMp4Meta(u8) {
  const top = boxes(u8, 0, u8.length);
  const moov = top.find((b) => b.type === 'moov');
  if (!moov) return null;
  let created = null;
  let xyz = null;
  const walk = (start, end) => {
    for (const bx of boxes(u8, start, end)) {
      const p = bx.start + bx.header;
      if (bx.type === 'mvhd') {
        const v = u8[p];
        const secs = v === 1 ? rdBE64(u8, p + 4) : rdBE32(u8, p + 4);
        created = (secs - EPOCH_1904) * 1000;
      } else if (bx.type === '©xyz') {
        const len = rdBE16(u8, p);
        xyz = new TextDecoder().decode(u8.subarray(p + 4, p + 4 + len));
      } else if (CONTAINERS.has(bx.type)) walk(p, bx.end);
    }
  };
  walk(moov.start + moov.header, moov.end);
  return { created, xyz };
}
