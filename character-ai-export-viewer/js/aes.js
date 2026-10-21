/* AES block encryption (FIPS-197), encryption direction only, for the counter mode that WinZip AES archives use.
 * WebCrypto has AES-CTR, but its counter is big-endian and WinZip's is little-endian, so the key stream is made here.
 * Classic script: sets self.CaiAes (browser worker) and module.exports (Node tests). */
(function (root, factory) {
  const m = factory();
  if (typeof module === 'object' && module.exports) module.exports = m;
  else root.CaiAes = m;
})(typeof self !== 'undefined' ? self : globalThis, function () {
  'use strict';
  const SBOX = new Uint8Array(256);
  const T0 = new Uint32Array(256), T1 = new Uint32Array(256), T2 = new Uint32Array(256), T3 = new Uint32Array(256);
  const xtime = (b) => ((b << 1) ^ (b & 0x80 ? 0x1b : 0)) & 0xff;
  (function init() {
    // S-box from the multiplicative inverse in GF(2^8) and the affine transform
    let p = 1, q = 1;
    const rotl8 = (x, s) => ((x << s) | (x >>> (8 - s))) & 0xff;
    do {
      p = p ^ ((p << 1) & 0xff) ^ (p & 0x80 ? 0x1b : 0);
      q ^= q << 1; q ^= q << 2; q ^= q << 4; q &= 0xff;
      if (q & 0x80) q ^= 0x09;
      SBOX[p] = (q ^ rotl8(q, 1) ^ rotl8(q, 2) ^ rotl8(q, 3) ^ rotl8(q, 4) ^ 0x63) & 0xff;
    } while (p !== 1);
    SBOX[0] = 0x63;
    for (let i = 0; i < 256; i++) {
      const s = SBOX[i], s2 = xtime(s), s3 = s2 ^ s;
      const t = ((s2 << 24) | (s << 16) | (s << 8) | s3) >>> 0;
      T0[i] = t;
      T1[i] = ((t >>> 8) | (t << 24)) >>> 0;
      T2[i] = ((t >>> 16) | (t << 16)) >>> 0;
      T3[i] = ((t >>> 24) | (t << 8)) >>> 0;
    }
  })();

  function expandKey(key) {
    const nk = key.length / 4;
    if (nk !== 4 && nk !== 6 && nk !== 8) throw new Error('AES key must be 16, 24 or 32 bytes');
    const nr = nk + 6;
    const w = new Uint32Array(4 * (nr + 1));
    for (let i = 0; i < nk; i++) w[i] = ((key[4 * i] << 24) | (key[4 * i + 1] << 16) | (key[4 * i + 2] << 8) | key[4 * i + 3]) >>> 0;
    let rcon = 1;
    const sub = (t) => ((SBOX[t >>> 24] << 24) | (SBOX[(t >>> 16) & 255] << 16) | (SBOX[(t >>> 8) & 255] << 8) | SBOX[t & 255]) >>> 0;
    for (let i = nk; i < w.length; i++) {
      let t = w[i - 1];
      if (i % nk === 0) { t = sub(((t << 8) | (t >>> 24)) >>> 0) ^ (rcon << 24); rcon = xtime(rcon); }
      else if (nk > 6 && i % nk === 4) t = sub(t);
      w[i] = (w[i - nk] ^ t) >>> 0;
    }
    return { w, nr };
  }

  // encrypts one 16-byte block from inp[io..] into out[oo..]
  function encryptBlock(ks, inp, io, out, oo) {
    const { w, nr } = ks;
    let s0 = ((inp[io] << 24) | (inp[io + 1] << 16) | (inp[io + 2] << 8) | inp[io + 3]) ^ w[0];
    let s1 = ((inp[io + 4] << 24) | (inp[io + 5] << 16) | (inp[io + 6] << 8) | inp[io + 7]) ^ w[1];
    let s2 = ((inp[io + 8] << 24) | (inp[io + 9] << 16) | (inp[io + 10] << 8) | inp[io + 11]) ^ w[2];
    let s3 = ((inp[io + 12] << 24) | (inp[io + 13] << 16) | (inp[io + 14] << 8) | inp[io + 15]) ^ w[3];
    let k = 4;
    for (let r = 1; r < nr; r++) {
      const t0 = T0[s0 >>> 24] ^ T1[(s1 >>> 16) & 255] ^ T2[(s2 >>> 8) & 255] ^ T3[s3 & 255] ^ w[k];
      const t1 = T0[s1 >>> 24] ^ T1[(s2 >>> 16) & 255] ^ T2[(s3 >>> 8) & 255] ^ T3[s0 & 255] ^ w[k + 1];
      const t2 = T0[s2 >>> 24] ^ T1[(s3 >>> 16) & 255] ^ T2[(s0 >>> 8) & 255] ^ T3[s1 & 255] ^ w[k + 2];
      const t3 = T0[s3 >>> 24] ^ T1[(s0 >>> 16) & 255] ^ T2[(s1 >>> 8) & 255] ^ T3[s2 & 255] ^ w[k + 3];
      s0 = t0; s1 = t1; s2 = t2; s3 = t3; k += 4;
    }
    const o0 = ((SBOX[s0 >>> 24] << 24) | (SBOX[(s1 >>> 16) & 255] << 16) | (SBOX[(s2 >>> 8) & 255] << 8) | SBOX[s3 & 255]) ^ w[k];
    const o1 = ((SBOX[s1 >>> 24] << 24) | (SBOX[(s2 >>> 16) & 255] << 16) | (SBOX[(s3 >>> 8) & 255] << 8) | SBOX[s0 & 255]) ^ w[k + 1];
    const o2 = ((SBOX[s2 >>> 24] << 24) | (SBOX[(s3 >>> 16) & 255] << 16) | (SBOX[(s0 >>> 8) & 255] << 8) | SBOX[s1 & 255]) ^ w[k + 2];
    const o3 = ((SBOX[s3 >>> 24] << 24) | (SBOX[(s0 >>> 16) & 255] << 16) | (SBOX[(s1 >>> 8) & 255] << 8) | SBOX[s2 & 255]) ^ w[k + 3];
    out[oo] = o0 >>> 24; out[oo + 1] = (o0 >>> 16) & 255; out[oo + 2] = (o0 >>> 8) & 255; out[oo + 3] = o0 & 255;
    out[oo + 4] = o1 >>> 24; out[oo + 5] = (o1 >>> 16) & 255; out[oo + 6] = (o1 >>> 8) & 255; out[oo + 7] = o1 & 255;
    out[oo + 8] = o2 >>> 24; out[oo + 9] = (o2 >>> 16) & 255; out[oo + 10] = (o2 >>> 8) & 255; out[oo + 11] = o2 & 255;
    out[oo + 12] = o3 >>> 24; out[oo + 13] = (o3 >>> 16) & 255; out[oo + 14] = (o3 >>> 8) & 255; out[oo + 15] = o3 & 255;
  }

  // WinZip AES counter mode: the counter block starts at 1 and counts up as a little-endian number. Stateful, so the
  // data can arrive in chunks of any size.
  function winzipCtr(key) {
    const ks = expandKey(key);
    const ctr = new Uint8Array(16), stream = new Uint8Array(16);
    let used = 16;
    function next() {
      for (let i = 0; i < 16; i++) { ctr[i] = (ctr[i] + 1) & 255; if (ctr[i] !== 0) break; }
      encryptBlock(ks, ctr, 0, stream, 0);
      used = 0;
    }
    return function xor(data) {
      const out = new Uint8Array(data.length);
      for (let i = 0; i < data.length; i++) {
        if (used === 16) next();
        out[i] = data[i] ^ stream[used++];
      }
      return out;
    };
  }

  return { expandKey, encryptBlock, winzipCtr };
});
