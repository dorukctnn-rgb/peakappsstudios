// Writes capture date, UTC offset and GPS into a JPEG's Exif block without touching the image data. The existing Exif
// tags are kept (orientation, camera, size), except the ones we replace, offset-sensitive maker notes and the embedded
// thumbnail. The new block is always little-endian TIFF and sits right after SOI (after JFIF APP0 when present).
import { rd32, rdBE16, rdBE32, toUtf8 } from './bytes.js';

const TYPE_SIZE = [0, 1, 1, 2, 4, 8, 1, 1, 2, 4, 8, 4, 8, 4];
const ASCII = 2;
const SHORT = 3;
const LONG = 4;
const RATIONAL = 5;
const UNDEFINED = 7;
const BYTE = 1;

export class JpegError extends Error {}

export function jpegSegments(u8) {
  if (u8.length < 4 || u8[0] !== 0xff || u8[1] !== 0xd8) throw new JpegError('not a JPEG file');
  const segs = [];
  let p = 2;
  while (p + 4 <= u8.length) {
    if (u8[p] !== 0xff) throw new JpegError('damaged JPEG header');
    const marker = u8[p + 1];
    if (marker === 0xff) {
      p++;
      continue;
    }
    if (marker === 0xd8 || marker === 0x01 || (marker >= 0xd0 && marker <= 0xd7)) {
      p += 2;
      continue;
    }
    if (marker === 0xd9) break;
    const len = rdBE16(u8, p + 2);
    if (len < 2 || p + 2 + len > u8.length) throw new JpegError('damaged JPEG segment');
    segs.push({ marker, start: p, end: p + 2 + len, data: p + 4 });
    if (marker === 0xda) break;
    p += 2 + len;
  }
  return segs;
}

const isExifAt = (u8, o) => u8[o] === 0x45 && u8[o + 1] === 0x78 && u8[o + 2] === 0x69 && u8[o + 3] === 0x66 && u8[o + 4] === 0 && u8[o + 5] === 0;

function swapToLE(raw, type) {
  const size = TYPE_SIZE[type];
  const unit = type === RATIONAL || type === 10 ? 4 : size;
  if (unit <= 1) return raw.slice();
  const out = new Uint8Array(raw.length);
  for (let i = 0; i < raw.length; i += unit) for (let k = 0; k < unit; k++) out[i + k] = raw[i + unit - 1 - k];
  return out;
}

export function parseTiff(t) {
  if (t.length < 8) throw new JpegError('Exif block too short');
  const le = t[0] === 0x49 && t[1] === 0x49;
  if (!le && !(t[0] === 0x4d && t[1] === 0x4d)) throw new JpegError('bad TIFF byte order');
  const r16 = (o) => (le ? t[o] | (t[o + 1] << 8) : rdBE16(t, o));
  const r32 = (o) => (le ? rd32(t, o) : rdBE32(t, o));
  if (r16(2) !== 42) throw new JpegError('bad TIFF header');
  const readIfd = (off) => {
    const map = new Map();
    if (!off || off + 2 > t.length) return map;
    const n = r16(off);
    for (let k = 0; k < n; k++) {
      const e = off + 2 + k * 12;
      if (e + 12 > t.length) break;
      const tag = r16(e);
      const type = r16(e + 2);
      const count = r32(e + 4);
      const sz = (TYPE_SIZE[type] ?? 0) * count;
      if (!TYPE_SIZE[type] || sz > t.length) continue;
      const vo = sz <= 4 ? e + 8 : r32(e + 8);
      if (vo + sz > t.length) continue;
      const raw = t.subarray(vo, vo + sz);
      map.set(tag, { type, count, bytes: le ? raw.slice() : swapToLE(raw, type), ptr: type === LONG || type === 13 ? r32(e + 8) : null });
    }
    return map;
  };
  const ifd0 = readIfd(r32(4));
  const exif = ifd0.has(0x8769) ? readIfd(ifd0.get(0x8769).ptr) : new Map();
  const gps = ifd0.has(0x8825) ? readIfd(ifd0.get(0x8825).ptr) : new Map();
  return { ifd0, exif, gps };
}

const asciiVal = (s) => {
  const b = toUtf8(`${s}\0`);
  return { type: ASCII, count: b.length, bytes: b };
};
const shortVal = (v) => {
  const b = new Uint8Array(2);
  b[0] = v & 255;
  b[1] = (v >> 8) & 255;
  return { type: SHORT, count: 1, bytes: b };
};
const rationalVal = (pairs) => {
  const b = new Uint8Array(pairs.length * 8);
  const dv = new DataView(b.buffer);
  pairs.forEach(([n, d], i) => {
    dv.setUint32(i * 8, n >>> 0, true);
    dv.setUint32(i * 8 + 4, d >>> 0, true);
  });
  return { type: RATIONAL, count: pairs.length, bytes: b };
};

function dms(deg) {
  const a = Math.abs(deg);
  let d = Math.floor(a);
  let m = Math.floor((a - d) * 60);
  let s = Math.round(((a - d) * 60 - m) * 60 * 10000);
  if (s >= 600000) {
    s -= 600000;
    m += 1;
  }
  if (m >= 60) {
    m -= 60;
    d += 1;
  }
  return [
    [d, 1],
    [m, 1],
    [s, 10000],
  ];
}

const exifText = (wallMs) => {
  const t = new Date(wallMs);
  const p = (n) => String(n).padStart(2, '0');
  return `${t.getUTCFullYear()}:${p(t.getUTCMonth() + 1)}:${p(t.getUTCDate())} ${p(t.getUTCHours())}:${p(t.getUTCMinutes())}:${p(t.getUTCSeconds())}`;
};

// meta: { wallMs (local clock time), offset ('+03:00'), utcMs, loc: {lat, lon} | null }
export function buildExifMaps(existing, meta) {
  const ifd0 = new Map(existing?.ifd0 ?? []);
  const exif = new Map(existing?.exif ?? []);
  let gps = new Map(existing?.gps ?? []);
  for (const tag of [0x0132, 0x8769, 0x8825, 0x0201, 0x0202]) ifd0.delete(tag);
  for (const tag of [0x9003, 0x9004, 0x9010, 0x9011, 0x9012, 0x9290, 0x9291, 0x9292, 0xa005, 0x927c]) exif.delete(tag);
  // drop any remaining entries that pointed at other blocks; they would dangle after the rewrite
  for (const m of [ifd0, exif]) for (const [tag, v] of m) if (v.type === 13) m.delete(tag);
  const when = exifText(meta.wallMs);
  ifd0.set(0x0132, asciiVal(when));
  if (!exif.has(0x9000)) exif.set(0x9000, { type: UNDEFINED, count: 4, bytes: toUtf8('0232') });
  exif.set(0x9003, asciiVal(when));
  exif.set(0x9004, asciiVal(when));
  if (meta.offset) {
    exif.set(0x9010, asciiVal(meta.offset));
    exif.set(0x9011, asciiVal(meta.offset));
    exif.set(0x9012, asciiVal(meta.offset));
  }
  if (meta.loc) {
    gps = new Map();
    gps.set(0x0000, { type: BYTE, count: 4, bytes: new Uint8Array([2, 3, 0, 0]) });
    gps.set(0x0001, asciiVal(meta.loc.lat >= 0 ? 'N' : 'S'));
    gps.set(0x0002, rationalVal(dms(meta.loc.lat)));
    gps.set(0x0003, asciiVal(meta.loc.lon >= 0 ? 'E' : 'W'));
    gps.set(0x0004, rationalVal(dms(meta.loc.lon)));
    const u = new Date(meta.utcMs);
    gps.set(0x0007, rationalVal([
      [u.getUTCHours(), 1],
      [u.getUTCMinutes(), 1],
      [u.getUTCSeconds(), 1],
    ]));
    const p = (n) => String(n).padStart(2, '0');
    gps.set(0x001d, asciiVal(`${u.getUTCFullYear()}:${p(u.getUTCMonth() + 1)}:${p(u.getUTCDate())}`));
  }
  return { ifd0, exif, gps };
}

export function buildTiff({ ifd0, exif, gps }) {
  const hasGps = gps.size > 0;
  ifd0.set(0x8769, { type: LONG, count: 1, bytes: new Uint8Array(4) });
  if (hasGps) ifd0.set(0x8825, { type: LONG, count: 1, bytes: new Uint8Array(4) });
  const ifdSize = (m) => 2 + m.size * 12 + 4;
  const dataSize = (m) => {
    let s = 0;
    for (const v of m.values()) if (v.bytes.length > 4) s += v.bytes.length + (v.bytes.length & 1);
    return s;
  };
  const off0 = 8;
  const offExif = off0 + ifdSize(ifd0) + dataSize(ifd0);
  const offGps = offExif + ifdSize(exif) + dataSize(exif);
  const total = hasGps ? offGps + ifdSize(gps) + dataSize(gps) : offGps;
  const setLong = (v, n) => new DataView(v.bytes.buffer, v.bytes.byteOffset, 4).setUint32(0, n, true);
  setLong(ifd0.get(0x8769), offExif);
  if (hasGps) setLong(ifd0.get(0x8825), offGps);
  const out = new Uint8Array(total);
  const dv = new DataView(out.buffer);
  out.set([0x49, 0x49, 0x2a, 0x00]);
  dv.setUint32(4, off0, true);
  const writeIfd = (m, at) => {
    const tags = [...m.keys()].sort((a, b) => a - b);
    dv.setUint16(at, tags.length, true);
    let data = at + 2 + tags.length * 12 + 4;
    tags.forEach((tag, i) => {
      const v = m.get(tag);
      const e = at + 2 + i * 12;
      dv.setUint16(e, tag, true);
      dv.setUint16(e + 2, v.type, true);
      dv.setUint32(e + 4, v.count, true);
      if (v.bytes.length <= 4) out.set(v.bytes, e + 8);
      else {
        dv.setUint32(e + 8, data, true);
        out.set(v.bytes, data);
        data += v.bytes.length + (v.bytes.length & 1);
      }
    });
    dv.setUint32(at + 2 + tags.length * 12, 0, true);
  };
  writeIfd(ifd0, off0);
  writeIfd(exif, offExif);
  if (hasGps) writeIfd(gps, offGps);
  return out;
}

export function writeJpegMeta(u8, meta) {
  const segs = jpegSegments(u8);
  const exifSeg = segs.find((s) => s.marker === 0xe1 && isExifAt(u8, s.data)) ?? null;
  let existing = null;
  if (exifSeg) {
    try {
      existing = parseTiff(u8.subarray(exifSeg.data + 6, exifSeg.end));
    } catch {
      existing = null;
    }
  }
  let tiff = buildTiff(buildExifMaps(existing, meta));
  if (tiff.length + 8 > 0xffff) tiff = buildTiff(buildExifMaps(null, meta));
  const app1 = new Uint8Array(4 + 6 + tiff.length);
  app1[0] = 0xff;
  app1[1] = 0xe1;
  const len = 2 + 6 + tiff.length;
  app1[2] = (len >> 8) & 255;
  app1[3] = len & 255;
  app1.set([0x45, 0x78, 0x69, 0x66, 0, 0], 4);
  app1.set(tiff, 10);
  let insertAt = 2;
  for (const s of segs) {
    if (s.start === insertAt && s.marker === 0xe0) insertAt = s.end;
    else break;
  }
  const keep = [];
  keep.push(u8.subarray(0, insertAt), app1);
  if (exifSeg && exifSeg.start >= insertAt) {
    keep.push(u8.subarray(insertAt, exifSeg.start), u8.subarray(exifSeg.end));
  } else keep.push(u8.subarray(insertAt));
  let n = 0;
  for (const k of keep) n += k.length;
  const out = new Uint8Array(n);
  let o = 0;
  for (const k of keep) {
    out.set(k, o);
    o += k.length;
  }
  return out;
}

// Read back what we care about (tests and the self-check after writing)
export function readJpegMeta(u8) {
  const segs = jpegSegments(u8);
  const s = segs.find((x) => x.marker === 0xe1 && isExifAt(u8, x.data));
  if (!s) return null;
  const { ifd0, exif, gps } = parseTiff(u8.subarray(s.data + 6, s.end));
  const txt = (m, tag) => (m.has(tag) ? new TextDecoder().decode(m.get(tag).bytes).replace(/\0+$/, '') : null);
  const rat = (m, tag) => {
    if (!m.has(tag)) return null;
    const b = m.get(tag).bytes;
    const dv = new DataView(b.buffer, b.byteOffset, b.byteLength);
    const out = [];
    for (let i = 0; i + 8 <= b.length; i += 8) out.push(dv.getUint32(i, true) / dv.getUint32(i + 4, true));
    return out;
  };
  const deg = (v, ref) => (v ? (v[0] + v[1] / 60 + v[2] / 3600) * (ref === 'S' || ref === 'W' ? -1 : 1) : null);
  return {
    dateTime: txt(ifd0, 0x0132),
    dateTimeOriginal: txt(exif, 0x9003),
    dateTimeDigitized: txt(exif, 0x9004),
    offsetTimeOriginal: txt(exif, 0x9011),
    orientation: ifd0.has(0x0112) ? ifd0.get(0x0112).bytes[0] : null,
    lat: deg(rat(gps, 0x0002), txt(gps, 0x0001)),
    lon: deg(rat(gps, 0x0004), txt(gps, 0x0003)),
    gpsDate: txt(gps, 0x001d),
    gpsTime: rat(gps, 0x0007),
  };
}

export const jpegImageStart = (u8) => {
  const segs = jpegSegments(u8);
  const sos = segs.find((s) => s.marker === 0xda);
  return sos ? sos.start : -1;
};
