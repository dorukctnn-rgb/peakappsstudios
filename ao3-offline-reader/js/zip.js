/* Ficshelf's ZIP reader and writer (the code of Splitlight's, Agelens' and Threadkeep's, with three additions for a library of
 * untrusted files). Both work on Blobs, so a large file is never read into memory: the reader takes the central directory from
 * the end of the file and inflates one entry only when it is asked for (DecompressionStream 'deflate-raw', in every current
 * browser and in Node), and the writer builds its archive from Blob parts, copying an entry's compressed bytes straight from the
 * source file when it can. ZIP64 is read and written. Added here:
 *  - safeEntries(): drops entries whose name climbs out of the archive (../, a drive letter, a leading slash), keeps the first of
 *    two entries with one name, and refuses an entry that inflates to more than 100 times its stored size when it is over 1 MB
 *    (a zip bomb) or an archive that claims more than 4 GB of content;
 *  - head(): the first bytes of an entry, inflating only as far as needed (the library scan reads the top of each file);
 *  - writeZip({ deflate: true }) compresses what it writes (the EPUBs and catalogs this tool makes).
 * Nothing here touches the network. */

export class ZipError extends Error {
  constructor(code, message) { super(message || code); this.code = code; }
}

const u16 = (v, o) => v.getUint16(o, true);
const u32 = (v, o) => v.getUint32(o, true);
const u64 = (v, o) => v.getUint32(o, true) + v.getUint32(o + 4, true) * 0x100000000;

async function bytesOf(blob, start, end) {
  return new Uint8Array(await blob.slice(start, end).arrayBuffer());
}

const UTF8 = new TextDecoder('utf-8', { fatal: true });
const CP437 = ('ÇüéâäàåçêëèïîìÄÅÉæÆôöòûùÿÖÜ¢£¥₧ƒ'
  + 'áíóúñÑªº¿⌐¬½¼¡«»░▒▓│┤╡╢╖╕╣║╗╝╜╛┐'
  + '└┴┬├─┼╞╟╚╔╩╦╠═╬╧╨╤╥╙╘╒╓╫╪┘┌█▄▌▐▀'
  + 'αßΓπΣσµτΦΘΩδ∞φε∩≡±≥≤⌠⌡÷≈°∙·√ⁿ²■ ');
function nameOf(bytes, utf8Flag) {
  if (utf8Flag) { try { return UTF8.decode(bytes); } catch { /* fall through */ } }
  try { return UTF8.decode(bytes); } catch { /* not UTF-8 */ }
  let s = '';
  for (const b of bytes) s += b < 128 ? String.fromCharCode(b) : CP437[b - 128];
  return s;
}

/* What a file starts with, for the error messages: a ZIP, a PDF, a web page, JSON, text... */
export async function sniff(blob) {
  if (!blob.size) return 'empty';
  const b = await bytesOf(blob, 0, Math.min(blob.size, 512));
  if (b[0] === 0x50 && b[1] === 0x4b && (b[2] === 3 || b[2] === 5 || b[2] === 7)) return 'zip';
  if (b[0] === 0x25 && b[1] === 0x50 && b[2] === 0x44 && b[3] === 0x46) return 'pdf';
  if (b[0] === 0x52 && b[1] === 0x61 && b[2] === 0x72 && b[3] === 0x21) return 'rar';
  if (b[0] === 0x37 && b[1] === 0x7a && b[2] === 0xbc && b[3] === 0xaf) return '7z';
  if (b[0] === 0x1f && b[1] === 0x8b) return 'gzip';
  if (b[0] === 0xd0 && b[1] === 0xcf && b[2] === 0x11 && b[3] === 0xe0) return 'office-old';
  let t = '';
  try { t = new TextDecoder('utf-8').decode(b).replace(/^﻿/, '').trimStart(); } catch { return 'binary'; }
  if (/^[{[]/.test(t)) return 'json';
  if (/^<(!doctype|html|head|meta|body)/i.test(t)) return 'html';
  if (/^\[?\d{1,2}[./]\d{1,2}[./]\d{2,4},? \d{1,2}:\d{2}/.test(t)) return 'whatsapp';
  const ctl = [...b].filter(x => x < 9 || (x > 13 && x < 32)).length;
  return ctl > 4 ? 'binary' : 'text';
}

/* Reads the central directory. Returns { entries: [{ name, method, crc, compSize, size, localOffset, encrypted, dir }] }. */
export async function readZip(blob) {
  const size = blob.size;
  if (size < 22) throw new ZipError('not-zip');
  const tailLen = Math.min(size, 65557);
  const tail = await bytesOf(blob, size - tailLen, size);
  const tv = new DataView(tail.buffer, tail.byteOffset, tail.byteLength);
  let eocd = -1;
  for (let i = tail.length - 22; i >= 0; i--) {
    if (tail[i] === 0x50 && tail[i + 1] === 0x4b && tail[i + 2] === 5 && tail[i + 3] === 6) { eocd = i; break; }
  }
  if (eocd < 0) throw new ZipError('not-zip');
  let count = u16(tv, eocd + 10);
  let cdSize = u32(tv, eocd + 12);
  let cdOffset = u32(tv, eocd + 16);
  if (count === 0xffff || cdSize === 0xffffffff || cdOffset === 0xffffffff) {
    const loc = eocd - 20;
    if (loc < 0 || u32(tv, loc) !== 0x07064b50) throw new ZipError('not-zip', 'ZIP64 locator missing');
    const z64at = u64(tv, loc + 8);
    const z = await bytesOf(blob, z64at, z64at + 56);
    const zv = new DataView(z.buffer, z.byteOffset, z.byteLength);
    if (u32(zv, 0) !== 0x06064b50) throw new ZipError('not-zip', 'ZIP64 record missing');
    count = u64(zv, 32); cdSize = u64(zv, 40); cdOffset = u64(zv, 48);
  }
  if (cdOffset + cdSize > size) throw new ZipError('truncated');
  const cd = await bytesOf(blob, cdOffset, cdOffset + cdSize);
  const v = new DataView(cd.buffer, cd.byteOffset, cd.byteLength);
  const entries = [];
  let p = 0;
  for (let i = 0; i < count && p + 46 <= cd.length; i++) {
    if (u32(v, p) !== 0x02014b50) break;
    const flags = u16(v, p + 8);
    const method = u16(v, p + 10);
    const crc = u32(v, p + 16);
    let compSize = u32(v, p + 20);
    let usize = u32(v, p + 24);
    const nl = u16(v, p + 28), xl = u16(v, p + 30), cl = u16(v, p + 32);
    let localOffset = u32(v, p + 42);
    const name = nameOf(cd.subarray(p + 46, p + 46 + nl), flags & 0x800).replace(/\\/g, '/');
    let x = p + 46 + nl;
    const xend = x + xl;
    while (x + 4 <= xend) {
      const id = u16(v, x), len = u16(v, x + 2);
      if (id === 1) {
        let q = x + 4;
        if (usize === 0xffffffff) { usize = u64(v, q); q += 8; }
        if (compSize === 0xffffffff) { compSize = u64(v, q); q += 8; }
        if (localOffset === 0xffffffff) { localOffset = u64(v, q); q += 8; }
      }
      x += 4 + len;
    }
    entries.push({ name, method, crc, compSize, size: usize, localOffset, encrypted: !!(flags & 1), dir: name.endsWith('/'), blob });
    p += 46 + nl + xl + cl;
  }
  if (!entries.length && count) throw new ZipError('not-zip');
  return { entries };
}

export const MAX_RATIO = 100;
export const MAX_TOTAL = 4 * 1024 * 1024 * 1024;
/* The entries worth opening: names normalised and kept inside the archive, the first of a duplicated name, no bomb.
 * Returns { entries, notes: [...], bomb: boolean }. */
export function safeEntries(entries) {
  const out = [];
  const seen = new Set();
  const notes = [];
  let total = 0;
  let bomb = false;
  for (const e of entries) {
    let name = String(e.name).replace(/\\/g, '/');
    if (e.dir) continue;
    if (/^([a-z]:)?\//i.test(name) || name.split('/').includes('..')) { notes.push(`left out ${name}: its path climbs out of the archive`); continue; }
    name = name.replace(/^(\.\/)+/, '');
    if (!name) continue;
    if (seen.has(name)) { notes.push(`left out a second entry named ${name}`); continue; }
    seen.add(name);
    total += e.size;
    if (e.size > 1048576 && e.size / Math.max(1, e.compSize) > MAX_RATIO) { notes.push(`refused ${name}: it inflates to ${Math.round(e.size / Math.max(1, e.compSize))} times its stored size`); bomb = true; continue; }
    out.push(name === e.name ? e : { ...e, name });
  }
  if (total > MAX_TOTAL) { notes.push('the archive claims more than 4 GB of content'); bomb = true; return { entries: [], notes, bomb }; }
  return { entries: out, notes, bomb };
}

/* Where an entry's compressed bytes start (the local header's own name and extra lengths can differ from the central one). */
export async function dataStart(entry) {
  if (entry._start != null) return entry._start;
  const h = await bytesOf(entry.blob, entry.localOffset, entry.localOffset + 30);
  const hv = new DataView(h.buffer, h.byteOffset, h.byteLength);
  if (h.length < 30 || u32(hv, 0) !== 0x04034b50) throw new ZipError('damaged', `no local header for ${entry.name}`);
  entry._start = entry.localOffset + 30 + u16(hv, 26) + u16(hv, 28);
  return entry._start;
}

/* The entry's compressed bytes as a Blob slice (nothing is read yet). */
export async function rawBlob(entry) {
  const s = await dataStart(entry);
  return entry.blob.slice(s, s + entry.compSize);
}

/* The entry's content as a Blob (inflated through a stream, so even a large video costs little memory). */
export async function entryBlob(entry, type = '') {
  if (entry.encrypted) throw new ZipError('encrypted');
  const raw = await rawBlob(entry);
  if (entry.method === 0) return type ? raw.slice(0, raw.size, type) : raw;
  if (entry.method !== 8) throw new ZipError('method', `compression method ${entry.method}`);
  const stream = raw.stream().pipeThrough(new DecompressionStream('deflate-raw'));
  return new Response(stream).blob().then(b => (type ? b.slice(0, b.size, type) : b));
}

/* The entry's content as a stream of bytes, inflated as it is read (for the activity files, which can be gigabytes). */
export async function entryStream(entry) {
  if (entry.encrypted) throw new ZipError('encrypted');
  const raw = await rawBlob(entry);
  if (entry.method === 0) return raw.stream();
  if (entry.method !== 8) throw new ZipError('method', `compression method ${entry.method}`);
  return raw.stream().pipeThrough(new DecompressionStream('deflate-raw'));
}

/* The first n bytes of an entry, inflating only as far as that (the rest is never read). */
export async function head(entry, n) {
  if (entry.encrypted) throw new ZipError('encrypted');
  if (entry.method === 0) return new Uint8Array(await (await rawBlob(entry)).slice(0, n).arrayBuffer());
  if (entry.method !== 8) throw new ZipError('method', `compression method ${entry.method}`);
  const reader = (await entryStream(entry)).getReader();
  const chunks = [];
  let got = 0;
  try {
    while (got < n) {
      const { done, value } = await reader.read();
      if (done) break;
      chunks.push(value); got += value.length;
    }
  } finally { try { await reader.cancel(); } catch { /* already closed */ } }
  const out = new Uint8Array(Math.min(got, n));
  let o = 0;
  for (const c of chunks) { const take = Math.min(c.length, out.length - o); out.set(c.subarray(0, take), o); o += take; if (o >= out.length) break; }
  return out;
}

export async function entryBytes(entry) {
  return new Uint8Array(await (await entryBlob(entry)).arrayBuffer());
}

export async function entryText(entry) {
  return new TextDecoder('utf-8').decode(await entryBytes(entry));
}

/* ------------------------------------------------------------------ CRC-32 */
const CRC_TABLE = (() => {
  const t = new Uint32Array(256);
  for (let n = 0; n < 256; n++) { let c = n; for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1; t[n] = c >>> 0; }
  return t;
})();
export function crc32(bytes, crc = 0) {
  let c = ~crc >>> 0;
  for (let i = 0; i < bytes.length; i++) c = CRC_TABLE[(c ^ bytes[i]) & 0xff] ^ (c >>> 8);
  return ~c >>> 0;
}
export async function crc32Blob(blob) {
  let c = 0;
  const step = 8 * 1024 * 1024;
  for (let o = 0; o < blob.size; o += step) c = crc32(new Uint8Array(await blob.slice(o, o + step).arrayBuffer()), c);
  return c;
}

/* ------------------------------------------------------------------ writer */
const ENC = new TextEncoder();
function dosTime(d) {
  const y = Math.max(1980, d.getFullYear());
  return { time: (d.getHours() << 11) | (d.getMinutes() << 5) | (d.getSeconds() >> 1), date: ((y - 1980) << 9) | ((d.getMonth() + 1) << 5) | d.getDate() };
}
const BIG = 0xffffffff;

/* Builds a ZIP as a Blob. Each item is { name, data } (a string, Uint8Array or Blob, stored as it is) or { name, entry }
 * (an entry of a ZIP this file read; its compressed bytes are copied, not inflated). zip64: true writes the ZIP64 records
 * even for a small archive (the tests use it to check the reader's ZIP64 path without a 4 GB file). */
async function deflateBlob(body) {
  const blob = body instanceof Blob ? body : new Blob([body]);
  return new Response(blob.stream().pipeThrough(new CompressionStream('deflate-raw'))).blob();
}
export async function writeZip(items, { date = new Date(), zip64 = false, deflate = false } = {}) {
  const { time, date: dd } = dosTime(date);
  const parts = [];
  const central = [];
  let offset = 0;
  for (const it of items) {
    const nameBytes = ENC.encode(it.name);
    let method, crc, comp, size, body;
    if (it.entry) {
      method = it.entry.method; crc = it.entry.crc; comp = it.entry.compSize; size = it.entry.size;
      body = await rawBlob(it.entry);
    } else {
      const data = typeof it.data === 'string' ? ENC.encode(it.data) : it.data;
      method = 0;
      if (data instanceof Uint8Array) { crc = crc32(data); size = comp = data.length; body = data; }
      else { crc = await crc32Blob(data); size = comp = data.size; body = data; }
      if (deflate && !it.store && size >= 256) {
        const packed = await deflateBlob(body);
        if (packed.size < size) { method = 8; comp = packed.size; body = packed; }
      }
    }
    const z64 = zip64 || size >= BIG || comp >= BIG;
    const lx = z64 ? 20 : 0;
    const lh = new DataView(new ArrayBuffer(30 + nameBytes.length + lx));
    lh.setUint32(0, 0x04034b50, true); lh.setUint16(4, z64 ? 45 : 20, true); lh.setUint16(6, 0x800, true);
    lh.setUint16(8, method, true); lh.setUint16(10, time, true); lh.setUint16(12, dd, true);
    lh.setUint32(14, crc, true); lh.setUint32(18, z64 ? BIG : comp, true); lh.setUint32(22, z64 ? BIG : size, true);
    lh.setUint16(26, nameBytes.length, true); lh.setUint16(28, lx, true);
    new Uint8Array(lh.buffer).set(nameBytes, 30);
    if (z64) { const q = 30 + nameBytes.length; lh.setUint16(q, 1, true); lh.setUint16(q + 2, 16, true); setU64(lh, q + 4, size); setU64(lh, q + 12, comp); }
    parts.push(new Uint8Array(lh.buffer), body);
    central.push({ nameBytes, method, crc, comp, size, offset });
    offset += lh.byteLength + comp;
  }
  const cdStart = offset;
  for (const c of central) {
    const extra = [];
    if (zip64 || c.size >= BIG) extra.push(c.size);
    if (zip64 || c.comp >= BIG) extra.push(c.comp);
    if (zip64 || c.offset >= BIG) extra.push(c.offset);
    const xl = extra.length ? 4 + extra.length * 8 : 0;
    const h = new DataView(new ArrayBuffer(46 + c.nameBytes.length + xl));
    h.setUint32(0, 0x02014b50, true); h.setUint16(4, 45, true); h.setUint16(6, extra.length ? 45 : 20, true);
    h.setUint16(8, 0x800, true); h.setUint16(10, c.method, true); h.setUint16(12, time, true); h.setUint16(14, dd, true);
    h.setUint32(16, c.crc, true); h.setUint32(20, zip64 || c.comp >= BIG ? BIG : c.comp, true); h.setUint32(24, zip64 || c.size >= BIG ? BIG : c.size, true);
    h.setUint16(28, c.nameBytes.length, true); h.setUint16(30, xl, true);
    h.setUint32(42, zip64 || c.offset >= BIG ? BIG : c.offset, true);
    new Uint8Array(h.buffer).set(c.nameBytes, 46);
    if (xl) { const q = 46 + c.nameBytes.length; h.setUint16(q, 1, true); h.setUint16(q + 2, extra.length * 8, true); extra.forEach((n, i) => setU64(h, q + 4 + i * 8, n)); }
    parts.push(new Uint8Array(h.buffer));
    offset += h.byteLength;
  }
  const cdSize = offset - cdStart;
  const n = central.length;
  if (zip64 || n >= 0xffff || cdStart >= BIG || cdSize >= BIG) {
    const z = new DataView(new ArrayBuffer(56 + 20));
    z.setUint32(0, 0x06064b50, true); setU64(z, 4, 44); z.setUint16(12, 45, true); z.setUint16(14, 45, true);
    setU64(z, 24, n); setU64(z, 32, n); setU64(z, 40, cdSize); setU64(z, 48, cdStart);
    z.setUint32(56, 0x07064b50, true); setU64(z, 64, offset); z.setUint32(72, 1, true);
    parts.push(new Uint8Array(z.buffer));
  }
  const e = new DataView(new ArrayBuffer(22));
  e.setUint32(0, 0x06054b50, true);
  e.setUint16(8, zip64 ? 0xffff : Math.min(n, 0xffff), true); e.setUint16(10, zip64 ? 0xffff : Math.min(n, 0xffff), true);
  e.setUint32(12, zip64 || cdSize >= BIG ? BIG : cdSize, true); e.setUint32(16, zip64 || cdStart >= BIG ? BIG : cdStart, true);
  parts.push(new Uint8Array(e.buffer));
  return new Blob(parts, { type: 'application/zip' });
}
function setU64(v, o, n) { v.setUint32(o, n % 0x100000000, true); v.setUint32(o + 4, Math.floor(n / 0x100000000), true); }
