// Small byte helpers shared by the ZIP, EXIF and MP4 code. Little endian unless the name says otherwise.

export const utf8 = new TextDecoder('utf-8');
const enc = new TextEncoder();
export const toUtf8 = (s) => enc.encode(s);

export const rd16 = (b, o) => b[o] | (b[o + 1] << 8);
export const rd32 = (b, o) => (b[o] | (b[o + 1] << 8) | (b[o + 2] << 16) | (b[o + 3] << 24)) >>> 0;
export const rd64 = (b, o) => rd32(b, o) + rd32(b, o + 4) * 0x100000000;
export const rdBE16 = (b, o) => (b[o] << 8) | b[o + 1];
export const rdBE32 = (b, o) => ((b[o] << 24) | (b[o + 1] << 16) | (b[o + 2] << 8) | b[o + 3]) >>> 0;
export const rdBE64 = (b, o) => rdBE32(b, o) * 0x100000000 + rdBE32(b, o + 4);

export function wr16(b, o, v) {
  b[o] = v & 255;
  b[o + 1] = (v >>> 8) & 255;
}
export function wr32(b, o, v) {
  b[o] = v & 255;
  b[o + 1] = (v >>> 8) & 255;
  b[o + 2] = (v >>> 16) & 255;
  b[o + 3] = (v >>> 24) & 255;
}
export function wr64(b, o, v) {
  wr32(b, o, v >>> 0);
  wr32(b, o + 4, Math.floor(v / 0x100000000) >>> 0);
}
export function wrBE32(b, o, v) {
  b[o] = (v >>> 24) & 255;
  b[o + 1] = (v >>> 16) & 255;
  b[o + 2] = (v >>> 8) & 255;
  b[o + 3] = v & 255;
}
export function wrBE64(b, o, v) {
  wrBE32(b, o, Math.floor(v / 0x100000000) >>> 0);
  wrBE32(b, o + 4, v >>> 0);
}

export function concat(parts) {
  let n = 0;
  for (const p of parts) n += p.length;
  const out = new Uint8Array(n);
  let o = 0;
  for (const p of parts) {
    out.set(p, o);
    o += p.length;
  }
  return out;
}

// MS-DOS time fields carry no time zone. "Wall" milliseconds below are the clock reading encoded as if it were UTC,
// so arithmetic stays exact and nothing depends on the machine's time zone.
export function dosToWallMs(time, date) {
  const y = ((date >> 9) & 0x7f) + 1980;
  const mo = (date >> 5) & 0x0f;
  const d = date & 0x1f;
  const h = (time >> 11) & 0x1f;
  const mi = (time >> 5) & 0x3f;
  const s = (time & 0x1f) * 2;
  if (mo < 1 || mo > 12 || d < 1 || d > 31 || h > 23 || mi > 59 || s > 59) return null;
  return Date.UTC(y, mo - 1, d, h, mi, s);
}
export function wallMsToDos(ms) {
  const t = new Date(ms);
  let y = t.getUTCFullYear();
  if (y < 1980) return { time: 0, date: (0 << 9) | (1 << 5) | 1 };
  if (y > 2107) y = 2107;
  return {
    time: (t.getUTCHours() << 11) | (t.getUTCMinutes() << 5) | Math.floor(t.getUTCSeconds() / 2),
    date: ((y - 1980) << 9) | ((t.getUTCMonth() + 1) << 5) | t.getUTCDate(),
  };
}

export const pad2 = (n) => String(n).padStart(2, '0');
// "2019-03-05 12:24:50" style text from wall milliseconds
export function wallText(ms, dateSep = '-', mid = ' ', timeSep = ':') {
  const t = new Date(ms);
  return `${t.getUTCFullYear()}${dateSep}${pad2(t.getUTCMonth() + 1)}${dateSep}${pad2(t.getUTCDate())}${mid}${pad2(t.getUTCHours())}${timeSep}${pad2(t.getUTCMinutes())}${timeSep}${pad2(t.getUTCSeconds())}`;
}
