/* ZIP reader for File/Blob inputs. Reads the central directory first, then one entry at a time with blob.slice(), so
 * a large export never has to sit in memory twice. Handles ZIP64, archives with bytes in front, stored and deflated
 * entries, and both kinds of ZIP password: the traditional PKWARE cipher (ZipCrypto) and WinZip AES (128/192/256).
 * Decompression is fflate's streaming Inflate (vendor/fflate.min.js, MIT).
 * Classic script: sets self.CaiZip (worker) and module.exports (Node tests). Needs self.fflate and self.CaiAes. */
(function (root, factory) {
  const m = factory(root);
  if (typeof module === 'object' && module.exports) module.exports = m;
  else root.CaiZip = m;
})(typeof self !== 'undefined' ? self : globalThis, function (root) {
  'use strict';
  const fflate = () => root.fflate;
  const aes = () => root.CaiAes;

  class ZipError extends Error {
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
  function crc32(data, crc = 0) {
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
      throw new ZipError('File tidak bisa dibaca: ' + (e && e.message ? e.message : e), 'read');
    }
  }

  async function isZip(blob) {
    if (!blob || blob.size < 4) return false;
    const h = await readRange(blob, 0, 4);
    return h[0] === 0x50 && h[1] === 0x4b && (h[2] === 3 || h[2] === 5 || h[2] === 7) ;
  }

  async function readIndex(blob) {
    const size = blob.size;
    if (size < 22) throw new ZipError('File ini terlalu kecil untuk menjadi ZIP.', 'notzip');
    const tailLen = Math.min(size, 22 + 0xffff + 20);
    const tailStart = size - tailLen;
    const tail = await readRange(blob, tailStart, size);
    let e = -1;
    for (let i = tail.length - 22; i >= 0; i--) {
      if (tail[i] === 0x50 && tail[i + 1] === 0x4b && tail[i + 2] === 5 && tail[i + 3] === 6) { e = i; break; }
    }
    if (e < 0) throw new ZipError('Bagian akhir ZIP ini hilang. Unduhan mungkin berhenti di tengah jalan.', 'truncated');
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
      let method = rd16(cd, p + 10);
      const dosTime = rd16(cd, p + 12);
      const crc = rd32(cd, p + 16);
      let compSize = rd32(cd, p + 20);
      let usize = rd32(cd, p + 24);
      const nameLen = rd16(cd, p + 28), extraLen = rd16(cd, p + 30), commentLen = rd16(cd, p + 32);
      let localOffset = rd32(cd, p + 42);
      const nameBytes = cd.subarray(p + 46, p + 46 + nameLen);
      const name = utf8.decode(nameBytes).replace(/\\/g, '/');
      let x = p + 46 + nameLen;
      const xEnd = x + extraLen;
      let aesInfo = null;
      while (x + 4 <= xEnd) {
        const id = rd16(cd, x), len = rd16(cd, x + 2);
        const d = x + 4;
        if (id === 0x0001) {
          let q = d;
          if (usize === 0xffffffff && q + 8 <= d + len) { usize = rd64(cd, q); q += 8; }
          if (compSize === 0xffffffff && q + 8 <= d + len) { compSize = rd64(cd, q); q += 8; }
          if (localOffset === 0xffffffff && q + 8 <= d + len) { localOffset = rd64(cd, q); q += 8; }
        } else if (id === 0x9901 && len >= 7) {
          aesInfo = { version: rd16(cd, d), strength: cd[d + 4], method: rd16(cd, d + 5) };
        }
        x = d + len;
      }
      const encrypted = !!(flags & 1);
      entries.push({
        name, flags, method, dosTime, crc, compSize, size: usize, localOffset: localOffset + shift, encrypted,
        aes: method === 99 ? (aesInfo || { version: 2, strength: 3, method: 8 }) : null,
        dir: name.endsWith('/'),
      });
      p += 46 + nameLen + extraLen + commentLen;
    }
    if (!entries.length && total > 0) throw new ZipError('Daftar file di dalam ZIP ini tidak bisa dibaca.', 'corrupt');
    return { entries, size };
  }

  async function dataStart(blob, entry) {
    const h = await readRange(blob, entry.localOffset, entry.localOffset + 30);
    if (h.length < 30 || rd32(h, 0) !== 0x04034b50) throw new ZipError('Sebuah file di dalam ZIP rusak.', 'corrupt');
    return entry.localOffset + 30 + rd16(h, 26) + rd16(h, 28);
  }

  // ---- traditional PKWARE encryption ----
  function zipCrypto(passBytes) {
    let k0 = 305419896, k1 = 591751049, k2 = 878082192;
    const upd = (c) => {
      k0 = CRC_TABLE[(k0 ^ c) & 255] ^ (k0 >>> 8);
      k1 = (k1 + (k0 & 255)) >>> 0;
      k1 = (Math.imul(k1, 134775813) + 1) >>> 0;
      k2 = CRC_TABLE[(k2 ^ (k1 >>> 24)) & 255] ^ (k2 >>> 8);
    };
    for (let i = 0; i < passBytes.length; i++) upd(passBytes[i]);
    return function decrypt(data) {
      const out = new Uint8Array(data.length);
      for (let i = 0; i < data.length; i++) {
        const t = (k2 | 2) & 0xffff;
        const p = data[i] ^ ((Math.imul(t, t ^ 1) >>> 8) & 255);
        out[i] = p;
        upd(p);
      }
      return out;
    };
  }

  async function aesKeys(passBytes, salt, strength) {
    const keyLen = [0, 16, 24, 32][strength];
    if (!keyLen) throw new ZipError('ZIP ini memakai tingkat enkripsi yang tidak didukung.', 'unsupported');
    const subtle = root.crypto && root.crypto.subtle;
    if (!subtle) throw new ZipError('Browser ini tidak bisa membuka ZIP yang dilindungi AES.', 'unsupported');
    const base = await subtle.importKey('raw', passBytes, 'PBKDF2', false, ['deriveBits']);
    const bits = new Uint8Array(await subtle.deriveBits({ name: 'PBKDF2', salt, iterations: 1000, hash: 'SHA-1' }, base, (2 * keyLen + 2) * 8));
    return { enc: bits.slice(0, keyLen), mac: bits.slice(keyLen, 2 * keyLen), check: bits.slice(2 * keyLen, 2 * keyLen + 2) };
  }

  // Prepares the decryption of one entry. Returns { decrypt, start, end, method, checkCrc } or throws
  // needs_password / bad_password.
  async function openEntry(blob, entry, password) {
    const start0 = await dataStart(blob, entry);
    let start = start0, end = start0 + entry.compSize, decrypt = null, method = entry.method, checkCrc = true;
    if (!entry.encrypted) return { start, end, decrypt, method, checkCrc };
    if (password == null || password === '') throw new ZipError('ZIP ini dikunci dengan kata sandi.', 'needs_password');
    const passBytes = new TextEncoder().encode(password);
    if (entry.aes) {
      const saltLen = [0, 8, 12, 16][entry.aes.strength];
      const head = await readRange(blob, start, start + saltLen + 2);
      const keys = await aesKeys(passBytes, head.subarray(0, saltLen), entry.aes.strength);
      if (keys.check[0] !== head[saltLen] || keys.check[1] !== head[saltLen + 1]) throw new ZipError('Kata sandi itu tidak bisa membuka ZIP.', 'bad_password');
      start += saltLen + 2;
      end -= 10; // the authentication code at the end
      decrypt = aes().winzipCtr(keys.enc);
      method = entry.aes.method;
      checkCrc = entry.aes.version === 1;
    } else {
      const head = await readRange(blob, start, start + 12);
      const dec = zipCrypto(passBytes);
      const plain = dec(head);
      const byCrc = entry.crc >>> 24, byTime = (entry.dosTime >>> 8) & 255;
      if (plain[11] !== byCrc && plain[11] !== byTime) throw new ZipError('Kata sandi itu tidak bisa membuka ZIP.', 'bad_password');
      start += 12;
      decrypt = dec;
    }
    return { start, end, decrypt, method, checkCrc };
  }

  async function checkPassword(blob, entry, password) {
    try { await openEntry(blob, entry, password); return true; } catch (e) { if (e.code === 'bad_password') return false; throw e; }
  }

  // Streams the uncompressed bytes of one entry to onChunk(Uint8Array). onProgress(readBytes, totalBytes) is optional.
  async function readEntry(blob, entry, { password = null, onChunk, onProgress = null, chunkSize = 4 << 20 } = {}) {
    const o = await openEntry(blob, entry, password);
    if (o.method !== 0 && o.method !== 8) throw new ZipError(`Sebuah file di dalam ZIP memakai metode kompresi ${o.method}, yang tidak didukung.`, 'unsupported');
    let crc = 0, produced = 0;
    const emit = (d) => { if (!d.length) return; if (o.checkCrc) crc = crc32(d, crc); produced += d.length; onChunk(d); };
    let inf = null;
    if (o.method === 8) {
      inf = new (fflate().Inflate)();
      inf.ondata = (d) => emit(d);
    }
    const total = Math.max(0, o.end - o.start);
    try {
      for (let pos = o.start; pos < o.end || (pos === o.start && total === 0); pos += chunkSize) {
        const stop = Math.min(o.end, pos + chunkSize);
        let buf = await readRange(blob, pos, stop);
        if (o.decrypt) buf = o.decrypt(buf);
        const last = stop >= o.end;
        if (inf) inf.push(buf, last); else emit(buf);
        if (onProgress) onProgress(stop - o.start, total);
        if (total === 0) break;
      }
    } catch (e) {
      if (e instanceof ZipError) throw e;
      if (entry.encrypted) throw new ZipError('Kata sandi itu tidak bisa membuka ZIP.', 'bad_password');
      throw new ZipError('Sebuah file di dalam ZIP rusak atau tidak lengkap. Unduhan mungkin berhenti di tengah jalan.', 'corrupt');
    }
    if (o.checkCrc && (entry.crc !== 0 || produced > 0) && crc !== entry.crc) {
      if (entry.encrypted) throw new ZipError('Kata sandi itu tidak bisa membuka ZIP.', 'bad_password');
      throw new ZipError('Sebuah file di dalam ZIP rusak (checksum-nya tidak cocok).', 'corrupt');
    }
    return produced;
  }

  async function readEntryBytes(blob, entry, opts = {}) {
    const parts = [];
    let n = 0;
    await readEntry(blob, entry, Object.assign({}, opts, { onChunk: (d) => { parts.push(d); n += d.length; } }));
    const out = new Uint8Array(n);
    let o = 0;
    for (const p of parts) { out.set(p, o); o += p.length; }
    return out;
  }

  return { ZipError, crc32, isZip, readIndex, readEntry, readEntryBytes, checkPassword, zipCrypto };
});
