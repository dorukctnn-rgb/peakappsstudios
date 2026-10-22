/* A ZIP reader that never loads the whole archive. The browser reads the table of contents at the end of the file and
 * then only the slices it needs, one entry at a time, straight from the file on your disk. Large entries (a few years of
 * heart rate readings can be hundreds of megabytes) are inflated in pieces with streamEntry, so the tab never holds the
 * whole file. ZIP64 is supported. Nothing is sent anywhere: Blob.slice reads the local file. */
import { inflateSync, Inflate } from '../vendor/fflate.js';

const u32 = (dv, o) => dv.getUint32(o, true);
const u16 = (dv, o) => dv.getUint16(o, true);
const u64 = (dv, o) => Number(dv.getBigUint64(o, true));
const bytes = async (blob, from, to) => new Uint8Array(await blob.slice(from, to).arrayBuffer());

export async function isZip(blob) {
  if (!blob || blob.size < 22) return false;
  const h = await bytes(blob, 0, 4);
  return h[0] === 0x50 && h[1] === 0x4b && (h[2] === 3 || h[2] === 5) && (h[3] === 4 || h[3] === 6);
}

export async function openZip(blob) {
  const size = blob.size;
  const tailLen = Math.min(size, 22 + 65535 + 20);
  const tail = await bytes(blob, size - tailLen, size);
  const dv = new DataView(tail.buffer, tail.byteOffset, tail.byteLength);
  let e = -1;
  for (let i = tail.length - 22; i >= 0; i--) if (tail[i] === 0x50 && tail[i + 1] === 0x4b && tail[i + 2] === 5 && tail[i + 3] === 6) { e = i; break; }
  if (e < 0) throw new Error('zip: no end of central directory');
  let count = u16(dv, e + 10), cdSize = u32(dv, e + 12), cdOff = u32(dv, e + 16);
  if (count === 0xffff || cdSize === 0xffffffff || cdOff === 0xffffffff) {
    const l = e - 20;
    if (l < 0 || u32(dv, l) !== 0x07064b50) throw new Error('zip: missing zip64 locator');
    const z64 = u64(dv, l + 8);
    const rec = await bytes(blob, z64, z64 + 56);
    const rv = new DataView(rec.buffer, rec.byteOffset, rec.byteLength);
    if (u32(rv, 0) !== 0x06064b50) throw new Error('zip: bad zip64 record');
    count = u64(rv, 32); cdSize = u64(rv, 40); cdOff = u64(rv, 48);
  }
  if (cdOff + cdSize > size) throw new Error('zip: table of contents is past the end (file cut short?)');
  const cd = await bytes(blob, cdOff, cdOff + cdSize);
  const cv = new DataView(cd.buffer, cd.byteOffset, cd.byteLength);
  const td = new TextDecoder('utf-8');
  const entries = [];
  let p = 0;
  for (let k = 0; k < count && p + 46 <= cd.length; k++) {
    if (u32(cv, p) !== 0x02014b50) break;
    const flags = u16(cv, p + 8), method = u16(cv, p + 10);
    let csize = u32(cv, p + 20), usize = u32(cv, p + 24);
    const nlen = u16(cv, p + 28), xlen = u16(cv, p + 30), clen = u16(cv, p + 32);
    let loff = u32(cv, p + 42);
    const name = td.decode(cd.subarray(p + 46, p + 46 + nlen));
    let x = p + 46 + nlen;
    const xend = x + xlen;
    while (x + 4 <= xend) {
      const id = u16(cv, x), sz = u16(cv, x + 2);
      if (id === 1) {
        let o = x + 4;
        if (usize === 0xffffffff) { usize = u64(cv, o); o += 8; }
        if (csize === 0xffffffff) { csize = u64(cv, o); o += 8; }
        if (loff === 0xffffffff) { loff = u64(cv, o); o += 8; }
      }
      x += 4 + sz;
    }
    if (!name.endsWith('/')) entries.push({ name, method, csize, usize, loff, encrypted: !!(flags & 1) });
    p += 46 + nlen + xlen + clen;
  }
  return { blob, entries };
}

export async function readEntry(zip, e) {
  if (e.encrypted) throw new Error('zip: encrypted entry');
  let buf = await bytes(zip.blob, e.loff, Math.min(zip.blob.size, e.loff + 30 + 512 + e.csize));
  let hv = new DataView(buf.buffer, buf.byteOffset, buf.byteLength);
  if (buf.length < 30 || u32(hv, 0) !== 0x04034b50) throw new Error('zip: bad local header');
  const start = 30 + u16(hv, 26) + u16(hv, 28);
  if (start + e.csize > buf.length) buf = await bytes(zip.blob, e.loff, e.loff + start + e.csize);
  const data = buf.subarray(start, start + e.csize);
  if (data.length < e.csize) throw new Error('zip: entry cut short');
  if (e.method === 0) return data;
  if (e.method === 8) return e.usize > 0 ? inflateSync(data, { out: new Uint8Array(e.usize) }) : inflateSync(data);
  throw new Error('zip: unsupported compression ' + e.method);
}

// Where an entry's compressed bytes start (after its local header).
async function dataStart(zip, e) {
  const head = await bytes(zip.blob, e.loff, Math.min(zip.blob.size, e.loff + 30));
  const hv = new DataView(head.buffer, head.byteOffset, head.byteLength);
  if (head.length < 30 || u32(hv, 0) !== 0x04034b50) throw new Error('zip: bad local header');
  return e.loff + 30 + u16(hv, 26) + u16(hv, 28);
}

// Reads an entry in slices of `step` bytes and hands the uncompressed bytes to onBytes(chunk) piece by piece, then
// resolves. onProgress(done, total) gets the compressed bytes read so far. Memory stays at about one slice.
export async function streamEntry(zip, e, onBytes, onProgress, step = 4 << 20) {
  if (e.encrypted) throw new Error('zip: encrypted entry');
  if (e.method !== 0 && e.method !== 8) throw new Error('zip: unsupported compression ' + e.method);
  const start = await dataStart(zip, e);
  if (start + e.csize > zip.blob.size) throw new Error('zip: entry cut short');
  const inf = e.method === 8 ? new Inflate((chunk) => { if (chunk && chunk.length) onBytes(chunk); }) : null;
  for (let off = 0; off < e.csize; off += step) {
    const end = Math.min(e.csize, off + step);
    const part = await bytes(zip.blob, start + off, start + end);
    if (inf) inf.push(part, end >= e.csize); else onBytes(part);
    if (onProgress) onProgress(end, e.csize);
  }
  if (inf && e.csize === 0) inf.push(new Uint8Array(0), true);
}

// The same for a plain file (a CSV picked on its own, or from an unzipped folder).
export async function streamFile(file, onBytes, onProgress, step = 4 << 20) {
  for (let off = 0; off < file.size; off += step) {
    const end = Math.min(file.size, off + step);
    onBytes(new Uint8Array(await file.slice(off, end).arrayBuffer()));
    if (onProgress) onProgress(end, file.size);
  }
}
