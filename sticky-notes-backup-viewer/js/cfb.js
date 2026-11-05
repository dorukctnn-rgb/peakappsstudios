/* Peelback: a reader for Microsoft's compound file (OLE) container, the shape of StickyNotes.snt from Windows 7 and the first
 * Windows 10 releases. Format: [MS-CFB] (learn.microsoft.com/openspecs/windows_protocols/ms-cfb). Read only; every chain is
 * bounded so a damaged file ends in an error instead of a loop. */
export class CfbError extends Error {}
const SIG = [0xd0, 0xcf, 0x11, 0xe0, 0xa1, 0xb1, 0x1a, 0xe1];
export const isCfb = b => !!b && b.length >= 512 && SIG.every((x, i) => b[i] === x);
const ENDOFCHAIN = 0xfffffffe, FREESECT = 0xffffffff;

export function readCfb(b) {
  if (!isCfb(b)) throw new CfbError('This is not a compound (OLE) file.');
  const v = new DataView(b.buffer, b.byteOffset, b.byteLength);
  const shift = v.getUint16(30, true), miniShift = v.getUint16(32, true);
  if (shift !== 9 && shift !== 12) throw new CfbError('The sector size in the header is not valid.');
  const secSize = 1 << shift, miniSize = 1 << miniShift;
  const nFat = v.getUint32(44, true), dirStart = v.getUint32(48, true), cutoff = v.getUint32(56, true);
  const miniFatStart = v.getUint32(60, true), nMiniFat = v.getUint32(64, true);
  let difStart = v.getUint32(68, true); const nDif = v.getUint32(72, true);
  const maxSec = Math.floor((b.length - 512) / secSize) + 1;
  const sec = n => { const o = 512 + n * secSize; if (n >= maxSec || o + secSize > b.length) throw new CfbError('A sector points outside the file.'); return o; };
  // the FAT: its sectors are listed in the header (109) and in the DIFAT chain
  const fatSecs = [];
  for (let i = 0; i < 109 && fatSecs.length < nFat; i++) { const s = v.getUint32(76 + i * 4, true); if (s !== FREESECT) fatSecs.push(s); }
  for (let d = 0; d < nDif && difStart < ENDOFCHAIN; d++) {
    const o = sec(difStart);
    for (let i = 0; i < secSize / 4 - 1 && fatSecs.length < nFat; i++) { const s = v.getUint32(o + i * 4, true); if (s !== FREESECT) fatSecs.push(s); }
    difStart = v.getUint32(o + secSize - 4, true);
  }
  const fat = new Uint32Array(fatSecs.length * (secSize / 4));
  fatSecs.forEach((s, k) => { const o = sec(s); for (let i = 0; i < secSize / 4; i++) fat[k * (secSize / 4) + i] = v.getUint32(o + i * 4, true); });
  const chain = start => {
    const out = []; let s = start, guard = 0;
    while (s < ENDOFCHAIN && guard++ <= fat.length) { out.push(s); s = fat[s]; if (s === undefined) break; }
    return out;
  };
  const readChain = (start, size) => {
    const secs = chain(start), out = new Uint8Array(secs.length * secSize);
    secs.forEach((s, i) => out.set(b.subarray(sec(s), sec(s) + secSize), i * secSize));
    return size == null ? out : out.subarray(0, size);
  };
  // directory entries
  const dirBytes = readChain(dirStart);
  const dv2 = new DataView(dirBytes.buffer, dirBytes.byteOffset, dirBytes.byteLength);
  const entries = [];
  for (let o = 0; o + 128 <= dirBytes.length; o += 128) {
    const nameLen = dv2.getUint16(o + 64, true), type = dirBytes[o + 66];
    if (type === 0) { entries.push(null); continue; }
    let name = '';
    for (let i = 0; i + 2 <= Math.min(nameLen, 64) - 2; i += 2) name += String.fromCharCode(dv2.getUint16(o + i, true));
    const size = dv2.getUint32(o + 120, true);
    entries.push({ name, type, left: dv2.getUint32(o + 68, true), right: dv2.getUint32(o + 72, true), child: dv2.getUint32(o + 76, true),
      start: dv2.getUint32(o + 116, true), size, ctime: filetime(dv2, o + 100), mtime: filetime(dv2, o + 108) });
  }
  const root = entries[0];
  if (!root || root.type !== 5) throw new CfbError('The directory has no root entry.');
  // the mini stream (streams under the cutoff live in small 64-byte pieces of the root's own stream)
  let mini = null, miniFat = null;
  const getMini = () => {
    if (mini) return;
    mini = readChain(root.start, root.size);
    const raw = readChain(miniFatStart, nMiniFat * secSize);
    const dvm = new DataView(raw.buffer, raw.byteOffset, raw.byteLength);
    miniFat = new Uint32Array(raw.length / 4);
    for (let i = 0; i < miniFat.length; i++) miniFat[i] = dvm.getUint32(i * 4, true);
  };
  const stream = e => {
    if (!e || e.type !== 2) return new Uint8Array(0);
    if (e.size >= cutoff) return readChain(e.start, e.size);
    getMini();
    const out = new Uint8Array(Math.ceil(e.size / miniSize) * miniSize || 0);
    let s = e.start, i = 0, guard = 0;
    while (s < ENDOFCHAIN && guard++ <= miniFat.length && i * miniSize < out.length) { out.set(mini.subarray(s * miniSize, s * miniSize + miniSize), i * miniSize); i++; s = miniFat[s]; }
    return out.subarray(0, e.size);
  };
  // children of a storage: the red-black tree walked in order, every index visited once
  const children = idx => {
    const out = [], seen = new Set();
    const walk = n => {
      if (n === FREESECT || n >= entries.length || seen.has(n) || !entries[n]) return;
      seen.add(n); walk(entries[n].left); out.push(entries[n]); walk(entries[n].right);
    };
    walk(entries[idx] ? entries[idx].child : FREESECT);
    return out;
  };
  const indexOf = new Map(entries.map((e, i) => [e, i]));
  const tree = e => ({ entry: e, kids: e.type === 1 || e.type === 5 ? children(indexOf.get(e)).map(tree) : [] });
  return { root: tree(root), stream, entries };
}

// FILETIME (100 ns ticks since 1601) at a DataView offset, as milliseconds since 1970; 0 when unset
function filetime(v, o) {
  const lo = v.getUint32(o, true), hi = v.getUint32(o + 4, true);
  if (!lo && !hi) return 0;
  const ms = (hi * 4294967296 + lo) / 10000 - 11644473600000;
  return ms > 0 && ms < 4102444800000 ? Math.round(ms) : 0;
}
