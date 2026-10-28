// Compound File Binary reader (the "OLE" container .pub, .doc and .xls files are stored in), read only.
// Format: Microsoft [MS-CFB]. Pure functions, no DOM, no network: it runs in the page's worker and in Node (unit tests).
// Every read is bounds-checked and every chain walk is capped, so a damaged or hostile file ends in an error, not a hang.

export class CfbError extends Error {
  constructor(code, detail = '') { super(detail || code); this.code = code; }
}

const FREE = 0xfffffffa; // sector numbers at or above this are markers, not sectors
const MAX_SECTORS = 1 << 25; // 32 million sectors, far past any real file (512 B each = 16 GiB)

/**
 * @param {Uint8Array} u8 whole file
 * @returns {{ names: string[], has(path: string): boolean, read(path: string): Uint8Array, size(path: string): number }}
 */
export function openCfb(u8) {
  if (u8.length < 512) throw new CfbError('not-cfb', 'shorter than one header');
  const sig = [0xd0, 0xcf, 0x11, 0xe0, 0xa1, 0xb1, 0x1a, 0xe1];
  for (let i = 0; i < 8; i++) if (u8[i] !== sig[i]) throw new CfbError('not-cfb', 'no compound file signature');
  const dv = new DataView(u8.buffer, u8.byteOffset, u8.byteLength);
  const secShift = dv.getUint16(30, true);
  const miniShift = dv.getUint16(32, true);
  if (secShift !== 9 && secShift !== 12) throw new CfbError('corrupt', 'odd sector size');
  if (miniShift !== 6) throw new CfbError('corrupt', 'odd mini sector size');
  const secSize = 1 << secShift;
  const miniSize = 1 << miniShift;
  const nFat = dv.getUint32(44, true);
  const dirStart = dv.getUint32(48, true);
  const miniCutoff = dv.getUint32(56, true);
  const miniFatStart = dv.getUint32(60, true);
  const difStart = dv.getUint32(68, true);
  const nDif = dv.getUint32(72, true);
  const nSectorsInFile = Math.floor((u8.length - secSize) / secSize);
  if (nFat === 0 || nFat > nSectorsInFile) throw new CfbError('corrupt', 'bad FAT size');

  const secOff = n => (n + 1) * secSize;
  const secBytes = n => {
    const o = secOff(n);
    if (o >= u8.length) throw new CfbError('truncated', 'sector past the end of the file');
    return u8.subarray(o, Math.min(o + secSize, u8.length));
  };

  // the FAT sectors: the first 109 are in the header, more come from the DIFAT chain
  const fatSecs = [];
  for (let i = 0; i < 109 && fatSecs.length < nFat; i++) {
    const s = dv.getUint32(76 + i * 4, true);
    if (s < FREE) fatSecs.push(s);
  }
  let d = difStart;
  const seenDif = new Set();
  for (let k = 0; k < nDif && d < FREE && !seenDif.has(d); k++) {
    seenDif.add(d);
    const o = secOff(d);
    if (o + secSize > u8.length) throw new CfbError('truncated', 'DIFAT sector past the end of the file');
    const per = secSize / 4 - 1;
    for (let i = 0; i < per && fatSecs.length < nFat; i++) {
      const s = dv.getUint32(o + i * 4, true);
      if (s < FREE) fatSecs.push(s);
    }
    d = dv.getUint32(o + per * 4, true);
  }
  const perFat = secSize / 4;
  const fat = new Uint32Array(fatSecs.length * perFat);
  fatSecs.forEach((s, k) => {
    const o = secOff(s);
    if (o + secSize > u8.length) throw new CfbError('truncated', 'FAT sector past the end of the file');
    for (let i = 0; i < perFat; i++) fat[k * perFat + i] = dv.getUint32(o + i * 4, true);
  });

  const chain = (start, table, limit = MAX_SECTORS) => {
    const out = [];
    let s = start;
    const seen = new Set();
    while (s < FREE && !seen.has(s)) {
      if (s >= table.length) throw new CfbError('corrupt', 'chain leaves the table');
      seen.add(s);
      out.push(s);
      if (out.length > limit) throw new CfbError('corrupt', 'chain too long');
      s = table[s];
    }
    return out;
  };
  const readChain = start => {
    const secs = chain(start, fat, nSectorsInFile + 2);
    const out = new Uint8Array(secs.length * secSize);
    secs.forEach((s, i) => out.set(secBytes(s), i * secSize));
    return out;
  };

  // directory
  const dirBytes = readChain(dirStart);
  const ddv = new DataView(dirBytes.buffer, dirBytes.byteOffset, dirBytes.byteLength);
  const entries = [];
  for (let i = 0; i + 128 <= dirBytes.length; i += 128) {
    const nameLen = ddv.getUint16(i + 64, true);
    let name = '';
    for (let j = 0; j + 2 <= Math.min(nameLen, 64) - 2; j += 2) name += String.fromCharCode(ddv.getUint16(i + j, true));
    entries.push({
      name, type: dirBytes[i + 66],
      left: ddv.getUint32(i + 68, true), right: ddv.getUint32(i + 72, true), child: ddv.getUint32(i + 76, true),
      start: ddv.getUint32(i + 116, true),
      size: secSize === 512 ? ddv.getUint32(i + 120, true) : Number(ddv.getBigUint64(i + 120, true) & 0xffffffffn),
    });
  }
  const root = entries[0];
  if (!root || root.type !== 5) throw new CfbError('corrupt', 'no root entry');

  // mini stream and its FAT
  let miniFat = new Uint32Array(0);
  let miniStream = new Uint8Array(0);
  const needMini = entries.some(e => e.type === 2 && e.size < miniCutoff && e.size > 0);
  if (needMini) {
    if (miniFatStart >= FREE) throw new CfbError('corrupt', 'no mini FAT');
    const mf = readChain(miniFatStart);
    const mdv = new DataView(mf.buffer, mf.byteOffset, mf.byteLength);
    miniFat = new Uint32Array(mf.length / 4);
    for (let i = 0; i < miniFat.length; i++) miniFat[i] = mdv.getUint32(i * 4, true);
    miniStream = readChain(root.start);
  }
  const streamBytes = e => {
    if (e.size === 0) return new Uint8Array(0);
    if (e.size < miniCutoff) {
      const secs = chain(e.start, miniFat, miniFat.length + 2);
      const out = new Uint8Array(secs.length * miniSize);
      secs.forEach((s, i) => {
        const o = s * miniSize;
        if (o + miniSize > miniStream.length) throw new CfbError('truncated', 'mini sector past the end of the mini stream');
        out.set(miniStream.subarray(o, o + miniSize), i * miniSize);
      });
      if (out.length < e.size) throw new CfbError('truncated', 'stream shorter than its size');
      return out.subarray(0, e.size);
    }
    const secs = chain(e.start, fat, nSectorsInFile + 2);
    if (secs.length * secSize < e.size) throw new CfbError('truncated', 'stream shorter than its size');
    const out = new Uint8Array(e.size);
    let o = 0;
    for (const s of secs) {
      const b = secBytes(s);
      const take = Math.min(b.length, e.size - o);
      out.set(b.subarray(0, take), o);
      o += take;
      if (o >= e.size) break;
    }
    return out;
  };

  // path map, walking the sibling trees (the tree is ordered, but only the names matter here)
  const paths = new Map();
  const visited = new Set();
  const walk = (idx, prefix, depth) => {
    if (idx >= entries.length || depth > 64) return;
    const stack = [idx];
    while (stack.length) {
      const i = stack.pop();
      if (i >= entries.length || visited.has(i)) continue;
      visited.add(i);
      const e = entries[i];
      const p = prefix ? `${prefix}/${e.name}` : e.name;
      if (e.type === 2) paths.set(p, e);
      else if (e.type === 1) walk(e.child, p, depth + 1);
      stack.push(e.left, e.right);
    }
  };
  walk(root.child, '', 0);

  return {
    names: [...paths.keys()],
    has: p => paths.has(p),
    size: p => (paths.get(p) || { size: 0 }).size,
    read: p => {
      const e = paths.get(p);
      if (!e) throw new CfbError('missing-stream', p);
      return streamBytes(e);
    },
  };
}
