/* Skillcase ZIP reader for File/Blob inputs (the ChatGPT data export). It reads the ZIP's list of files first, then only
 * the entries it needs (conversations.json, or conversations-000.json and the files after it), one slice at a time with
 * blob.slice(), so an export of several gigabytes with images never has to be loaded whole. Handles ZIP64, archives
 * with bytes in front, stored and deflated entries. Password-protected ZIPs are refused (ChatGPT's export has none).
 * Adapted from Chatbound's reader (src/character-ai-export-viewer/js/zip.js), without the password ciphers.
 * Decompression is fflate's streaming Inflate (vendor/fflate.js, MIT). No network. */
import { Inflate } from '../vendor/fflate.js';

export class ZipError extends Error {
  constructor(message, code) { super(message); this.code = code; }
}

const CRC_TABLE = (() => {
  const t = new Int32Array(256);
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    t[n] = c;
  }
  return t;
})();
export function crc32(data, crc = 0) {
  let c = ~crc;
  for (let i = 0; i < data.length; i++) c = CRC_TABLE[(c ^ data[i]) & 255] ^ (c >>> 8);
  return ~c >>> 0;
}

const rd16 = (b, o) => b[o] | (b[o + 1] << 8);
const rd32 = (b, o) => (b[o] | (b[o + 1] << 8) | (b[o + 2] << 16) | (b[o + 3] << 24)) >>> 0;
const rd64 = (b, o) => rd32(b, o) + rd32(b, o + 4) * 4294967296;
const utf8 = new TextDecoder('utf-8');

async function readRange(blob, start, end) {
  if (end <= start) return new Uint8Array(0);
  try {
    return new Uint8Array(await blob.slice(start, end).arrayBuffer());
  } catch (e) {
    throw new ZipError('The file could not be read: ' + (e && e.message ? e.message : e), 'read');
  }
}

export async function isZip(blob) {
  if (!blob || blob.size < 4) return false;
  const h = await readRange(blob, 0, 4);
  return h[0] === 0x50 && h[1] === 0x4b && (h[2] === 3 || h[2] === 5 || h[2] === 7);
}

export async function readIndex(blob) {
  const size = blob.size;
  if (size < 22) throw new ZipError('This file is too small to be a ZIP.', 'notzip');
  const tailLen = Math.min(size, 22 + 0xffff + 20);
  const tailStart = size - tailLen;
  const tail = await readRange(blob, tailStart, size);
  let e = -1;
  for (let i = tail.length - 22; i >= 0; i--) {
    if (tail[i] === 0x50 && tail[i + 1] === 0x4b && tail[i + 2] === 5 && tail[i + 3] === 6) { e = i; break; }
  }
  if (e < 0) throw new ZipError('The end of this ZIP is missing. The download may have stopped early.', 'truncated');
  let total = rd16(tail, e + 10);
  let cdSize = rd32(tail, e + 12);
  let cdOffset = rd32(tail, e + 16);
  let cdEnd = tailStart + e;
  if (e >= 20 && rd32(tail, e - 20) === 0x07064b50) {
    const z64Off = rd64(tail, e - 20 + 8);
    const z = await readRange(blob, z64Off, Math.min(size, z64Off + 56));
    if (z.length >= 56 && rd32(z, 0) === 0x06064b50) {
      total = rd64(z, 32); cdSize = rd64(z, 40); cdOffset = rd64(z, 48); cdEnd = z64Off;
    }
  }
  // bytes in front of the archive (some download tools) shift every offset by the same amount
  let shift = cdEnd - (cdOffset + cdSize);
  if (shift < 0 || cdOffset + shift + cdSize > size) shift = 0;
  const cd = await readRange(blob, cdOffset + shift, cdOffset + shift + cdSize);
  const entries = [];
  let p = 0;
  while (p + 46 <= cd.length && rd32(cd, p) === 0x02014b50) {
    const flags = rd16(cd, p + 8);
    const method = rd16(cd, p + 10);
    const crc = rd32(cd, p + 16);
    let compSize = rd32(cd, p + 20);
    let usize = rd32(cd, p + 24);
    const nameLen = rd16(cd, p + 28), extraLen = rd16(cd, p + 30), commentLen = rd16(cd, p + 32);
    let localOffset = rd32(cd, p + 42);
    const name = utf8.decode(cd.subarray(p + 46, p + 46 + nameLen)).replace(/\\/g, '/');
    let x = p + 46 + nameLen;
    const xEnd = x + extraLen;
    while (x + 4 <= xEnd) {
      const id = rd16(cd, x), len = rd16(cd, x + 2);
      const d = x + 4;
      if (id === 0x0001) {
        let q = d;
        if (usize === 0xffffffff && q + 8 <= d + len) { usize = rd64(cd, q); q += 8; }
        if (compSize === 0xffffffff && q + 8 <= d + len) { compSize = rd64(cd, q); q += 8; }
        if (localOffset === 0xffffffff && q + 8 <= d + len) { localOffset = rd64(cd, q); q += 8; }
      }
      x = d + len;
    }
    entries.push({ name, flags, method, crc, compSize, size: usize, localOffset: localOffset + shift, encrypted: !!(flags & 1), dir: name.endsWith('/') });
    p += 46 + nameLen + extraLen + commentLen;
  }
  if (!entries.length && total > 0) throw new ZipError('The list of files inside this ZIP could not be read.', 'corrupt');
  return { entries, size };
}

async function dataStart(blob, entry) {
  const h = await readRange(blob, entry.localOffset, entry.localOffset + 30);
  if (h.length < 30 || rd32(h, 0) !== 0x04034b50) throw new ZipError('A file inside the ZIP is damaged.', 'corrupt');
  return entry.localOffset + 30 + rd16(h, 26) + rd16(h, 28);
}

/** The uncompressed bytes of one entry. onProgress(readBytes, totalBytes) is optional. */
export async function readEntryBytes(blob, entry, { onProgress = null, chunkSize = 4 << 20 } = {}) {
  if (entry.encrypted) throw new ZipError('This ZIP is locked with a password.', 'password');
  if (entry.method !== 0 && entry.method !== 8) throw new ZipError(`A file inside the ZIP uses compression method ${entry.method}, which is not supported.`, 'unsupported');
  const start = await dataStart(blob, entry);
  const end = start + entry.compSize;
  const parts = [];
  let produced = 0, crc = 0;
  const emit = d => { if (!d.length) return; crc = crc32(d, crc); produced += d.length; parts.push(d); };
  let inf = null;
  if (entry.method === 8) { inf = new Inflate(); inf.ondata = d => emit(d); }
  const total = Math.max(0, end - start);
  try {
    for (let pos = start; pos < end || (pos === start && total === 0); pos += chunkSize) {
      const stop = Math.min(end, pos + chunkSize);
      const buf = await readRange(blob, pos, stop);
      if (inf) inf.push(buf, stop >= end); else emit(buf);
      if (onProgress) onProgress(stop - start, total);
      if (total === 0) break;
    }
  } catch (e) {
    if (e instanceof ZipError) throw e;
    throw new ZipError('A file inside the ZIP is damaged or incomplete. The download may have stopped early.', 'corrupt');
  }
  if ((entry.crc !== 0 || produced > 0) && crc !== entry.crc) throw new ZipError('A file inside the ZIP is damaged (its checksum does not match).', 'corrupt');
  const out = new Uint8Array(produced);
  let o = 0;
  for (const part of parts) { out.set(part, o); o += part.length; }
  return out;
}
