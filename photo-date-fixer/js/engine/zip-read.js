// ZIP reader for Blob/File inputs. Reads only the central directory up front, then each entry on demand with
// blob.slice(), so a multi-gigabyte export never has to fit in memory. Handles ZIP64, data descriptors, extended
// timestamp (0x5455) and NTFS (0x000a) time fields, and archives with prepended bytes.
import { dosToWallMs, rd16, rd32, rd64, utf8 } from './bytes.js';
import { crc32 } from './crc32.js';
import { inflateRaw } from './inflate.js';

export class ZipError extends Error {
  constructor(message, code) {
    super(message);
    this.code = code;
  }
}

const SIG_EOCD = 0x06054b50;
const SIG_Z64LOC = 0x07064b50;
const SIG_Z64EOCD = 0x06064b50;
const SIG_CEN = 0x02014b50;
const SIG_LOC = 0x04034b50;

export async function readRange(blob, start, end) {
  if (end <= start) return new Uint8Array(0);
  try {
    return new Uint8Array(await blob.slice(start, end).arrayBuffer());
  } catch (e) {
    throw new ZipError(`read failed: ${e?.message ?? e}`, 'read');
  }
}

export async function readZipIndex(blob) {
  const size = blob.size;
  if (size < 22) throw new ZipError('file is too small to be a ZIP', 'notzip');
  const tailLen = Math.min(size, 22 + 0xffff + 20);
  const tailStart = size - tailLen;
  const tail = await readRange(blob, tailStart, size);
  let e = -1;
  for (let i = tail.length - 22; i >= 0; i--) {
    if (tail[i] === 0x50 && tail[i + 1] === 0x4b && tail[i + 2] === 5 && tail[i + 3] === 6 && i + 22 + rd16(tail, i + 20) <= tail.length) {
      e = i;
      break;
    }
  }
  if (e < 0 || rd32(tail, e) !== SIG_EOCD) throw new ZipError('no end of central directory', 'notzip');
  let total = rd16(tail, e + 10);
  let cdSize = rd32(tail, e + 12);
  let cdOffset = rd32(tail, e + 16);
  let cdEnd = tailStart + e;
  if (e >= 20 && rd32(tail, e - 20) === SIG_Z64LOC) {
    const z64Off = rd64(tail, e - 20 + 8);
    const z = await readRange(blob, z64Off, Math.min(size, z64Off + 56));
    if (z.length >= 56 && rd32(z, 0) === SIG_Z64EOCD) {
      total = rd64(z, 32);
      cdSize = rd64(z, 40);
      cdOffset = rd64(z, 48);
      cdEnd = z64Off;
    }
  }
  // bytes before the archive (self-extractors, some download tools) shift every offset by the same amount
  let shift = cdEnd - (cdOffset + cdSize);
  if (shift < 0 || cdOffset + shift + cdSize > size) shift = 0;
  const cd = await readRange(blob, cdOffset + shift, cdOffset + shift + cdSize);
  const entries = [];
  let p = 0;
  for (let k = 0; k < total; k++) {
    if (p + 46 > cd.length || rd32(cd, p) !== SIG_CEN) {
      if (k === 0) throw new ZipError('central directory is damaged', 'corrupt');
      break;
    }
    const flags = rd16(cd, p + 8);
    const method = rd16(cd, p + 10);
    const time = rd16(cd, p + 12);
    const date = rd16(cd, p + 14);
    const crc = rd32(cd, p + 16);
    let csize = rd32(cd, p + 20);
    let usize = rd32(cd, p + 24);
    const nlen = rd16(cd, p + 28);
    const xlen = rd16(cd, p + 30);
    const clen = rd16(cd, p + 32);
    let local = rd32(cd, p + 42);
    const name = utf8.decode(cd.subarray(p + 46, p + 46 + nlen));
    let x = p + 46 + nlen;
    const xend = Math.min(cd.length, x + xlen);
    let extUtcMs = null;
    while (x + 4 <= xend) {
      const id = rd16(cd, x);
      const sz = rd16(cd, x + 2);
      const d = x + 4;
      if (d + sz > xend) break;
      if (id === 0x0001) {
        let q = d;
        if (usize === 0xffffffff && q + 8 <= d + sz) {
          usize = rd64(cd, q);
          q += 8;
        }
        if (csize === 0xffffffff && q + 8 <= d + sz) {
          csize = rd64(cd, q);
          q += 8;
        }
        if (local === 0xffffffff && q + 8 <= d + sz) local = rd64(cd, q);
      } else if (id === 0x5455 && sz >= 5 && cd[d] & 1) {
        extUtcMs = rd32(cd, d + 1) * 1000;
      } else if (id === 0x000a && sz >= 32 && rd16(cd, d + 4) === 1 && rd16(cd, d + 6) >= 24) {
        const ft = rd64(cd, d + 8);
        if (ft > 0) extUtcMs = Math.round(ft / 10000 - 11644473600000);
      }
      x = d + sz;
    }
    entries.push({
      name,
      flags,
      method,
      crc,
      csize,
      usize,
      local: local + shift,
      dosTime: time,
      dosDate: date,
      wallMs: dosToWallMs(time, date),
      extUtcMs,
      dir: name.endsWith('/'),
    });
    p += 46 + nlen + xlen + clen;
  }
  return { size, entries };
}

export async function entryDataRange(blob, entry) {
  const h = await readRange(blob, entry.local, entry.local + 30);
  if (h.length < 30 || rd32(h, 0) !== SIG_LOC) throw new ZipError(`local header missing for ${entry.name}`, 'corrupt');
  const start = entry.local + 30 + rd16(h, 26) + rd16(h, 28);
  return [start, start + entry.csize];
}

async function inflateWithBrowser(raw) {
  const ds = new DecompressionStream('deflate-raw');
  const out = await new Response(new Blob([raw]).stream().pipeThrough(ds)).arrayBuffer();
  return new Uint8Array(out);
}

// Whole entry in memory (photos, overlays, the memories list). CRC is checked; a browser decoder that disagrees with the
// CRC is retried with our own decoder before giving up.
export async function readEntry(blob, entry, { verify = true } = {}) {
  if (entry.flags & 1) throw new ZipError(`${entry.name} is encrypted`, 'encrypted');
  const [a, b] = await entryDataRange(blob, entry);
  const raw = await readRange(blob, a, b);
  if (entry.method === 0) {
    if (verify && crc32(raw) !== entry.crc) throw new ZipError(`checksum mismatch in ${entry.name}`, 'crc');
    return raw;
  }
  if (entry.method !== 8) throw new ZipError(`${entry.name} uses compression method ${entry.method}`, 'method');
  let data = null;
  if (typeof DecompressionStream === 'function') {
    try {
      data = await inflateWithBrowser(raw);
      if (verify && crc32(data) !== entry.crc) data = null;
    } catch {
      data = null;
    }
  }
  if (!data) {
    data = inflateRaw(raw, entry.usize);
    if (verify && crc32(data) !== entry.crc) throw new ZipError(`checksum mismatch in ${entry.name}`, 'crc');
  }
  return data;
}

// Large entries (long videos) as a stream of chunks; the caller checks the CRC at the end.
export async function* entryChunks(blob, entry, chunkSize = 4 << 20) {
  if (entry.flags & 1) throw new ZipError(`${entry.name} is encrypted`, 'encrypted');
  const [a, b] = await entryDataRange(blob, entry);
  if (entry.method === 0) {
    for (let o = a; o < b; o += chunkSize) yield await readRange(blob, o, Math.min(b, o + chunkSize));
    return;
  }
  if (entry.method !== 8) throw new ZipError(`${entry.name} uses compression method ${entry.method}`, 'method');
  if (typeof DecompressionStream === 'function') {
    const reader = blob.slice(a, b).stream().pipeThrough(new DecompressionStream('deflate-raw')).getReader();
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      yield value;
    }
    return;
  }
  yield inflateRaw(await readRange(blob, a, b), entry.usize);
}
