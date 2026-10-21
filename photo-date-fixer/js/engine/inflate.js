// Raw DEFLATE (RFC 1951) decoder, written for this tool. Used when the browser has no DecompressionStream or when the
// browser's own decoder fails on an entry (the CRC check in zip-read.js decides). Whole-buffer in, whole-buffer out.

const LBASE = [3, 4, 5, 6, 7, 8, 9, 10, 11, 13, 15, 17, 19, 23, 27, 31, 35, 43, 51, 59, 67, 83, 99, 115, 131, 163, 195, 227, 258];
const LEXT = [0, 0, 0, 0, 0, 0, 0, 0, 1, 1, 1, 1, 2, 2, 2, 2, 3, 3, 3, 3, 4, 4, 4, 4, 5, 5, 5, 5, 0];
const DBASE = [1, 2, 3, 4, 5, 7, 9, 13, 17, 25, 33, 49, 65, 97, 129, 193, 257, 385, 513, 769, 1025, 1537, 2049, 3073, 4097, 6145, 8193, 12289, 16385, 24577];
const DEXT = [0, 0, 0, 0, 1, 1, 2, 2, 3, 3, 4, 4, 5, 5, 6, 6, 7, 7, 8, 8, 9, 9, 10, 10, 11, 11, 12, 12, 13, 13];
const CLORDER = [16, 17, 18, 0, 8, 7, 9, 6, 10, 5, 11, 4, 12, 3, 13, 2, 14, 1, 15];

export class InflateError extends Error {}

// Lookup table indexed by the next maxLen input bits (LSB first). Entry = symbol << 4 | code length.
function buildTable(lens, n) {
  let max = 0;
  const count = new Uint16Array(16);
  for (let i = 0; i < n; i++) {
    count[lens[i]]++;
    if (lens[i] > max) max = lens[i];
  }
  count[0] = 0;
  if (max === 0) return { table: new Uint32Array(2), max: 1, empty: true };
  // over-subscription check
  let left = 1;
  for (let l = 1; l <= 15; l++) {
    left <<= 1;
    left -= count[l];
    if (left < 0) throw new InflateError('bad code lengths');
  }
  const next = new Uint16Array(16);
  let code = 0;
  for (let l = 1; l <= 15; l++) {
    code = (code + count[l - 1]) << 1;
    next[l] = code;
  }
  const size = 1 << max;
  const table = new Uint32Array(size);
  for (let sym = 0; sym < n; sym++) {
    const L = lens[sym];
    if (!L) continue;
    let c = next[L]++;
    let r = 0;
    for (let k = 0; k < L; k++) {
      r = (r << 1) | (c & 1);
      c >>= 1;
    }
    const v = (sym << 4) | L;
    for (let k = r; k < size; k += 1 << L) table[k] = v;
  }
  return { table, max, empty: false };
}

let FIXED = null;
function fixedTables() {
  if (FIXED) return FIXED;
  const l = new Uint8Array(288);
  for (let i = 0; i < 144; i++) l[i] = 8;
  for (let i = 144; i < 256; i++) l[i] = 9;
  for (let i = 256; i < 280; i++) l[i] = 7;
  for (let i = 280; i < 288; i++) l[i] = 8;
  const d = new Uint8Array(30).fill(5);
  FIXED = { lit: buildTable(l, 288), dist: buildTable(d, 30) };
  return FIXED;
}

export function inflateRaw(input, sizeHint = 0) {
  const src = input;
  const n = src.length;
  let pos = 0;
  let bitBuf = 0;
  let bitCnt = 0;
  let out = new Uint8Array(sizeHint > 0 ? sizeHint : Math.max(1024, n * 4));
  let op = 0;

  const need = (k) => {
    while (bitCnt < k) {
      if (pos >= n) {
        if (bitCnt === 0 && k > 0) throw new InflateError('unexpected end of data');
        return false;
      }
      bitBuf |= src[pos++] << bitCnt;
      bitCnt += 8;
    }
    return true;
  };
  const bits = (k) => {
    if (k === 0) return 0;
    if (!need(k)) throw new InflateError('unexpected end of data');
    const v = bitBuf & ((1 << k) - 1);
    bitBuf >>>= k;
    bitCnt -= k;
    return v;
  };
  const grow = (min) => {
    if (op + min <= out.length) return;
    let size = out.length * 2;
    while (size < op + min) size *= 2;
    const bigger = new Uint8Array(size);
    bigger.set(out.subarray(0, op));
    out = bigger;
  };
  const decode = (t) => {
    // fill up to max bits when available; near the end fewer bits may remain
    need(t.max);
    const e = t.table[bitBuf & ((1 << t.max) - 1)];
    const L = e & 15;
    if (L === 0 || L > bitCnt) throw new InflateError('bad Huffman code');
    bitBuf >>>= L;
    bitCnt -= L;
    return e >>> 4;
  };

  let last = 0;
  while (!last) {
    last = bits(1);
    const type = bits(2);
    if (type === 0) {
      bitBuf = 0;
      bitCnt = 0;
      if (pos + 4 > n) throw new InflateError('truncated stored block');
      const len = src[pos] | (src[pos + 1] << 8);
      const nlen = src[pos + 2] | (src[pos + 3] << 8);
      if ((len ^ 0xffff) !== nlen) throw new InflateError('stored block length mismatch');
      pos += 4;
      if (pos + len > n) throw new InflateError('truncated stored block');
      grow(len);
      out.set(src.subarray(pos, pos + len), op);
      op += len;
      pos += len;
      continue;
    }
    let lit;
    let dist;
    if (type === 1) ({ lit, dist } = fixedTables());
    else if (type === 2) {
      const hlit = bits(5) + 257;
      const hdist = bits(5) + 1;
      const hclen = bits(4) + 4;
      const cl = new Uint8Array(19);
      for (let i = 0; i < hclen; i++) cl[CLORDER[i]] = bits(3);
      const clt = buildTable(cl, 19);
      const lens = new Uint8Array(hlit + hdist);
      let i = 0;
      while (i < hlit + hdist) {
        const sym = decode(clt);
        if (sym < 16) lens[i++] = sym;
        else {
          let rep;
          let val = 0;
          if (sym === 16) {
            if (i === 0) throw new InflateError('repeat with no previous length');
            val = lens[i - 1];
            rep = 3 + bits(2);
          } else if (sym === 17) rep = 3 + bits(3);
          else rep = 11 + bits(7);
          if (i + rep > hlit + hdist) throw new InflateError('too many code lengths');
          while (rep--) lens[i++] = val;
        }
      }
      if (lens[256] === 0) throw new InflateError('no end-of-block code');
      lit = buildTable(lens.subarray(0, hlit), hlit);
      dist = buildTable(lens.subarray(hlit), hdist);
    } else throw new InflateError('invalid block type');

    for (;;) {
      const sym = decode(lit);
      if (sym < 256) {
        if (op >= out.length) grow(1);
        out[op++] = sym;
      } else if (sym === 256) break;
      else {
        const li = sym - 257;
        if (li >= 29) throw new InflateError('bad length symbol');
        const len = LBASE[li] + bits(LEXT[li]);
        if (dist.empty) throw new InflateError('distance code missing');
        const ds = decode(dist);
        if (ds >= 30) throw new InflateError('bad distance symbol');
        const d = DBASE[ds] + bits(DEXT[ds]);
        if (d > op) throw new InflateError('distance too far back');
        grow(len);
        let from = op - d;
        if (d >= len) {
          out.copyWithin(op, from, from + len);
          op += len;
        } else {
          for (let k = 0; k < len; k++) out[op++] = out[from++];
        }
      }
    }
  }
  return op === out.length ? out : out.subarray(0, op);
}
