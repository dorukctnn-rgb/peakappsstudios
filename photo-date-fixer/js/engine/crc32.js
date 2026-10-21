// CRC-32 (IEEE 802.3, reflected 0xEDB88320) with slicing-by-8 tables. Incremental: crc32(data, previous).

const T = new Uint32Array(8 * 256);
for (let n = 0; n < 256; n++) {
  let c = n;
  for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
  T[n] = c >>> 0;
}
for (let n = 0; n < 256; n++) {
  let c = T[n];
  for (let s = 1; s < 8; s++) {
    c = T[c & 255] ^ (c >>> 8);
    T[s * 256 + n] = c >>> 0;
  }
}

export function crc32(data, prev = 0) {
  let c = ~prev >>> 0;
  let i = 0;
  const n = data.length;
  const end8 = n - (n % 8);
  while (i < end8) {
    const a = (data[i] | (data[i + 1] << 8) | (data[i + 2] << 16) | (data[i + 3] << 24)) ^ c;
    const b = data[i + 4] | (data[i + 5] << 8) | (data[i + 6] << 16) | (data[i + 7] << 24);
    c =
      T[1792 + (a & 255)] ^
      T[1536 + ((a >>> 8) & 255)] ^
      T[1280 + ((a >>> 16) & 255)] ^
      T[1024 + (a >>> 24)] ^
      T[768 + (b & 255)] ^
      T[512 + ((b >>> 8) & 255)] ^
      T[256 + ((b >>> 16) & 255)] ^
      T[b >>> 24];
    i += 8;
  }
  while (i < n) c = T[(c ^ data[i++]) & 255] ^ (c >>> 8);
  return ~c >>> 0;
}
