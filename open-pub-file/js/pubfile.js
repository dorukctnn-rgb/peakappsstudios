// Reads a Microsoft Publisher file (.pub, Publisher 2002 and later: the files Publisher 2003 to 2021 wrote) in the browser.
// What it brings out: the text of every text box and table, which page each one sits on, where on the page it sits,
// every picture stored in the file, and the title, author and dates. What it does not do: draw the page. Publisher's
// fonts, colours, shapes, borders and the exact look are not rebuilt.
// How the file is laid out (the knowledge comes from Microsoft's [MS-PUB] documentation and from the open source readers
// libmspub (MPL 2.0) and Apache POI HPBF (Apache 2.0); this is a fresh implementation):
//   a compound file with the streams "Contents" (the page, shape and chunk index), "Quill/QuillSub/CONTENTS" (all the text),
//   "Escher/EscherStm" (shape positions and picture references) and "Escher/EscherDelayStm" (the pictures themselves).
// Pure functions, no DOM and no network: it runs in the page's worker and in Node (unit tests).
import { openCfb, CfbError } from './cfb.js';
import { Inflate } from '../vendor/fflate.js';

export class PubError extends Error {
  constructor(code, detail = '') { super(detail || code); this.code = code; }
}

export const LIMITS = {
  maxFile: 1500 * 1024 * 1024,
  maxStories: 20000,
  maxChunks: 200000,
  maxShapes: 100000,
  maxImages: 4000,
  maxPages: 5000,
  maxMetafile: 96 * 1024 * 1024,
};

const EMU_PER_PT = 12700;

/* ---------------- small binary helpers ---------------- */
const mk = u8 => new DataView(u8.buffer, u8.byteOffset, u8.byteLength);
const latin1 = (u8, a, b) => { let s = ''; for (let i = a; i < b && i < u8.length; i++) s += String.fromCharCode(u8[i]); return s; };
function utf16(u8, a, b) {
  const end = Math.min(b, u8.length) & ~1;
  const start = a & ~1;
  const n = Math.max(0, (end - start) >> 1);
  const view = new Uint16Array(n);
  const dv = mk(u8);
  for (let i = 0; i < n; i++) view[i] = dv.getUint16(start + i * 2, true);
  let out = '';
  for (let i = 0; i < n; i += 8192) out += String.fromCharCode.apply(null, view.subarray(i, i + 8192));
  return out;
}

/* ---------------- Contents blocks ---------------- */
// A block is: id (1 byte), type (1 byte), then data whose size the type says (0, 1, 2, 4, 8, 16, 24 bytes) or, for the
// container types, a 4-byte length that counts itself followed by that many bytes (a string, or more blocks).
const FIXED = new Map([[0x78, 0], [0x05, 0], [0x08, 0], [0x0a, 0], [0x10, 2], [0x12, 2], [0x18, 2], [0x1a, 2], [0x07, 2],
  [0x20, 4], [0x22, 4], [0x58, 4], [0x68, 4], [0x70, 4], [0xb8, 4], [0x28, 8], [0x38, 16], [0x48, 24]]);
const VARIABLE = new Set([0xc0, 0x80, 0x82, 0x88, 0x8a, 0x90, 0x98, 0xa0]);
const BLK_STRING = 0xc0, BLK_CONTAINER = 0x88, BLK_DIRECTORY = 0x90, BLK_SHAPE_SEQ = 0x70;

class Reader {
  constructor(u8) { this.u8 = u8; this.dv = mk(u8); this.pos = 0; this.steps = 0; }
  get len() { return this.u8.length; }
  ok(limit) { return this.pos + 2 <= this.len && this.pos < limit; }
  u32(at = this.pos) { if (at + 4 > this.len) throw new PubError('corrupt', 'read past the end of a stream'); return this.dv.getUint32(at, true); }
  u16(at = this.pos) { if (at + 2 > this.len) throw new PubError('corrupt', 'read past the end of a stream'); return this.dv.getUint16(at, true); }
  /** one block at the reader's position. skip: step over a container's children (leave the position after the block) */
  block(skip = false) {
    if (++this.steps > 4_000_000) throw new PubError('corrupt', 'too many blocks');
    const start = this.pos;
    if (start + 2 > this.len) throw new PubError('corrupt', 'block past the end of a stream');
    const id = this.u8[start], type = this.u8[start + 1];
    const dataOffset = start + 2;
    const info = { id, type, start, dataOffset, dataLength: 0, data: 0, str: null, end: dataOffset };
    this.pos = dataOffset;
    if (VARIABLE.has(type)) {
      const n = this.u32(dataOffset);
      if (n < 4 || dataOffset + n > this.len + 0) throw new PubError('corrupt', 'block length outside the stream');
      info.dataLength = n;
      info.end = dataOffset + n;
      if (type === BLK_STRING) { info.str = this.u8.subarray(dataOffset + 4, dataOffset + n); this.pos = info.end; }
      else if (skip) this.pos = info.end;
      else this.pos = dataOffset + 4;
    } else {
      const n = FIXED.has(type) ? FIXED.get(type) : 0;
      info.dataLength = n;
      info.end = dataOffset + n;
      if (info.end > this.len) throw new PubError('corrupt', 'block past the end of a stream');
      if (n === 1) info.data = this.u8[dataOffset];
      else if (n === 2) info.data = this.dv.getUint16(dataOffset, true);
      else if (n === 4) info.data = this.dv.getUint32(dataOffset, true);
      this.pos = info.end;
    }
    return info;
  }
}

const CH = { SHAPE: 0x01, TABLE: 0x10, ALTSHAPE: 0x20, GROUP: 0x30, LOGO: 0x31, PAGE: 0x43, DOCUMENT: 0x44, CELLS: 0x63 };

function parseContents(u8) {
  const r = new Reader(u8);
  if (u8.length < 0x1e) throw new PubError('corrupt', 'Contents stream too short');
  const trailer = r.u32(0x1a);
  if (trailer + 4 > u8.length) throw new PubError('corrupt', 'trailer outside the stream');
  const trailerEnd = Math.min(u8.length, trailer + r.u32(trailer));
  r.pos = trailer + 4;
  const chunks = [];
  let seq = -1;
  let found = false;
  for (let i = 0; i < 12 && r.ok(trailerEnd) && !found; i++) {
    const part = r.block(false);
    if (part.type !== BLK_DIRECTORY) { r.pos = part.end > part.dataOffset ? part.end : r.pos; continue; }
    found = true;
    while (r.ok(part.end)) {
      const b = r.block(false);
      seq++;
      if (b.type === BLK_CONTAINER) {
        let type = null, offset = null, parent = 0;
        while (r.ok(b.end)) {
          const s = r.block(true);
          if (s.id === 2) type = s.data; else if (s.id === 4) offset = s.data; else if (s.id === 5) parent = s.data;
        }
        if (type !== null && offset !== null && chunks.length < LIMITS.maxChunks) chunks.push({ type, offset, seq, parent });
      }
      r.pos = b.end;
    }
  }
  if (!found) throw new PubError('corrupt', 'no chunk directory');

  let docChunk = null;
  const pageChunks = [], shapeChunks = [];
  for (const c of chunks) {
    if (c.type === CH.DOCUMENT && !docChunk) docChunk = c;
    else if (c.type === CH.PAGE) pageChunks.push(c);
    else if (c.type === CH.SHAPE || c.type === CH.ALTSHAPE || c.type === CH.GROUP || c.type === CH.TABLE || c.type === CH.LOGO) shapeChunks.push(c);
  }
  if (!docChunk) throw new PubError('corrupt', 'no document chunk');

  // the document: page size and the order of the pages
  const doc = { width: 0, height: 0, pageOrder: [] };
  {
    const rd = new Reader(u8);
    rd.pos = docChunk.offset;
    const len = rd.u32();
    rd.pos = docChunk.offset + 4;
    const stop = Math.min(u8.length, docChunk.offset + len);
    while (rd.ok(stop)) {
      const b = rd.block(false);
      if (b.id === 0x12) {
        while (rd.ok(b.end)) { const s = rd.block(true); if (s.id === 1) doc.width = s.data; else if (s.id === 2) doc.height = s.data; }
      } else if (b.id === 0x02 && b.type !== BLK_STRING) {
        rd.pos = b.dataOffset + 4;
        while (rd.ok(b.end)) { const s = rd.block(true); if (s.id === 0) doc.pageOrder.push(s.data); }
      }
      rd.pos = b.end;
    }
  }

  // pages: the shapes on each, and whether it is a master page
  const pages = new Map();
  for (const c of pageChunks) {
    const rd = new Reader(u8);
    rd.pos = c.offset;
    const len = rd.u32();
    rd.pos = c.offset + 4;
    const stop = Math.min(u8.length, c.offset + len);
    const page = { seq: c.seq, shapes: [], master: false, appliedMaster: null };
    while (rd.ok(stop)) {
      const b = rd.block(false);
      if (b.id === 0x02 && b.type !== BLK_STRING && VARIABLE.has(b.type)) {
        while (rd.ok(b.end)) { const s = rd.block(true); if (s.type === BLK_SHAPE_SEQ) page.shapes.push(s.data); }
      } else if (b.id === 0x0e && b.type === BLK_STRING) {
        if (b.str.some(x => x !== 0)) page.master = true;
      } else if (b.id === 0x0d && !VARIABLE.has(b.type)) page.appliedMaster = b.data;
      rd.pos = b.end;
    }
    pages.set(c.seq, page);
  }

  // shapes: the text each one holds, and for tables the grid
  const shapes = new Map();
  for (const c of shapeChunks) {
    const rd = new Reader(u8);
    rd.pos = c.offset;
    const len = rd.u32();
    rd.pos = c.offset + 4;
    const stop = Math.min(u8.length, c.offset + len);
    const sh = { seq: c.seq, chunkType: c.type, textId: null, rows: 0, cols: 0, wEmu: 0, hEmu: 0 };
    while (rd.ok(stop)) {
      const b = rd.block(true);
      if (b.id === 0x27 && !VARIABLE.has(b.type)) sh.textId = b.data;
      else if (b.id === 0x66 && c.type === CH.TABLE) sh.rows = b.data;
      else if (b.id === 0x67 && c.type === CH.TABLE) sh.cols = b.data;
      else if (b.id === 0xaa) sh.wEmu = b.data;
      else if (b.id === 0xab) sh.hEmu = b.data;
    }
    if (shapes.size < LIMITS.maxShapes) shapes.set(c.seq, sh);
  }
  return { doc, pages, shapes };
}

/* ---------------- Quill: the text ---------------- */
function parseQuill(u8) {
  if (u8.length < 0x20 || latin1(u8, 0, 8) !== 'CHNKINK ') throw new PubError('corrupt', 'text stream has no CHNKINK header');
  const dv = mk(u8);
  const refs = [];
  let list = 0x18;
  const seen = new Set();
  while (list !== 0xffffffff && list + 8 <= u8.length && !seen.has(list)) {
    seen.add(list);
    const n = dv.getUint16(list + 2, true);
    const next = dv.getUint32(list + 4, true);
    for (let i = 0; i < n; i++) {
      const o = list + 8 + i * 24;
      if (o + 24 > u8.length) break;
      refs.push({
        name: latin1(u8, o + 2, o + 6), id: dv.getUint16(o + 6, true), name2: latin1(u8, o + 12, o + 16),
        offset: dv.getUint32(o + 16, true), length: dv.getUint32(o + 20, true),
      });
    }
    list = next;
    if (refs.length > 4000) break;
  }
  const text = refs.find(r => r.name === 'TEXT');
  const strs = refs.find(r => r.name === 'STRS');
  const syid = refs.find(r => r.name === 'SYID');
  if (!text || !strs || !syid) throw new PubError('no-text', 'the text chunks are missing');
  const inside = r => r.offset + r.length <= u8.length;
  if (!inside(text) || !inside(strs) || !inside(syid)) throw new PubError('corrupt', 'text chunk past the end of the stream');

  const lengths = [];
  {
    const n = dv.getUint32(strs.offset, true);
    const pre = dv.getUint32(strs.offset + 4, true);
    let p = strs.offset + 4 + pre;
    for (let i = 0; i < n && i < LIMITS.maxStories && p + 4 <= strs.offset + strs.length; i++, p += 4) lengths.push(dv.getUint32(p, true));
  }
  const ids = [];
  {
    const n = dv.getUint32(syid.offset + 4, true);
    let p = syid.offset + 8;
    for (let i = 0; i < n && i < LIMITS.maxStories && p + 4 <= syid.offset + syid.length; i++, p += 4) ids.push(dv.getUint32(p, true));
  }
  const stories = [];
  let at = text.offset;
  const end = text.offset + text.length;
  for (let j = 0; j < lengths.length; j++) {
    const bytes = lengths[j] * 2;
    if (at + bytes > end) { stories.push({ id: ids[j] ?? j, index: j, text: utf16(u8, at, end), truncated: true }); break; }
    stories.push({ id: ids[j] ?? j, index: j, text: utf16(u8, at, at + bytes), truncated: false });
    at += bytes;
  }

  // hyperlink tables: a PLC bit of type 12 lists the addresses of one text area, in the order they appear
  const links = [];
  for (const r of refs) {
    if (r.name2 !== 'PLC ' || r.length < 0x34 || !inside(r)) continue;
    const typ = dv.getUint32(r.offset + 4, true);
    if (typ !== 12) continue;
    const n = dv.getUint32(r.offset, true);
    if (n === 0 || n > 1000) continue;
    if (r.length === 0x34) continue; // no hyperlinks in this one
    try {
      const start0 = r.offset;
      const pre = [];
      for (let i = 0; i < n + 2; i++) pre.push(dv.getUint32(start0 + 8 + i * 4, true));
      let until = 0x34;
      if (n === 1) until = 0x4c; else if (n >= 2) until = 0x68 + (n - 2) * 22;
      let p = start0 + until;
      const found = [];
      for (let i = 0; i < n; i++) {
        if (p + 2 > start0 + r.length) break;
        const len = dv.getUint16(p, true);
        const first = dv.getUint16(p + 2, true);
        if (first === 0) { found.push(''); p += len || 2; }
        else { found.push(utf16(u8, p + 2, p + 2 + len * 2)); p += 2 + len * 2; }
      }
      found.forEach((url, i) => { if (url) links.push({ story: r.id, start: pre[1 + i] ?? 0, url }); });
    } catch { /* a link table this reader does not understand is skipped */ }
  }
  return { stories, links };
}

/* ---------------- Escher: where shapes sit, which picture they show ---------------- */
const ESC = { DGG: 0xf000, BSTORE: 0xf001, DG: 0xf002, SPGR: 0xf003, SP: 0xf004, FSPGR: 0xf009, FSP: 0xf00a, FOPT: 0xf00b,
  CHILD_ANCHOR: 0xf00f, CLIENT_ANCHOR: 0xf010, CLIENT_DATA: 0xf011 };
const BLIP = { 0xf01a: 'emf', 0xf01b: 'wmf', 0xf01c: 'pict', 0xf01d: 'jpeg', 0xf01e: 'png', 0xf01f: 'dib', 0xf029: 'tiff', 0xf02a: 'jpegcmyk' };

function escherRecords(dv, u8len, start, end) {
  const out = [];
  let p = start;
  let guard = 0;
  while (p + 8 <= Math.min(end, u8len) && guard++ < 400000) {
    const initial = dv.getUint16(p, true), type = dv.getUint16(p + 2, true), len = dv.getUint32(p + 4, true);
    const off = p + 8;
    out.push({ initial, type, off, len });
    p = off + len + ((type === ESC.DGG || type === ESC.DG) ? 4 : 0);
    if (len > u8len) break;
  }
  return out;
}
function escherPairs(dv, off, len, skip) {
  const m = new Map();
  let p = off + skip;
  const end = off + len;
  while (p + 6 <= end) { m.set(dv.getUint16(p, true), dv.getUint32(p + 2, true)); p += 6; }
  return m;
}

function parseEscher(u8) {
  const dv = mk(u8);
  const delayMap = []; // pxId - 1 -> delay stream index (1 based) or -1
  const top = escherRecords(dv, u8.length, 0, u8.length);
  const dgg = top.find(r => r.type === ESC.DGG);
  if (dgg) {
    const inner = escherRecords(dv, u8.length, dgg.off, dgg.off + dgg.len);
    const bs = inner.find(r => r.type === ESC.BSTORE);
    if (bs) {
      let idx = 1;
      for (let p = bs.off; p + 44 <= bs.off + bs.len && delayMap.length < LIMITS.maxImages * 4; p += 44) {
        const zero = dv.getUint32(p + 10, true) === 0 && dv.getUint32(p + 14, true) === 0 && dv.getUint32(p + 18, true) === 0 && dv.getUint32(p + 22, true) === 0;
        delayMap.push(zero ? -1 : idx++);
      }
    }
  }
  const shapes = new Map(); // seq -> { box, pxId, order }
  let order = 0;
  const groupDepthLimit = 40;
  const walkGroup = (spgr, parentCs, parentAbs, depth) => {
    if (depth > groupDepthLimit) return;
    for (const rec of escherRecords(dv, u8.length, spgr.off, spgr.off + spgr.len)) {
      if (rec.type === ESC.SPGR) walkGroup(rec, parentCs, parentAbs, depth + 1);
      else if (rec.type === ESC.SP) {
        const r = shapeRecord(rec, parentCs, parentAbs);
        if (r.abs && r.defines) { parentAbs = r.abs; }
        if (r.cs) parentCs = r.cs;
      }
    }
  };
  const shapeRecord = (sp, parentCs, parentAbs) => {
    const parts = escherRecords(dv, u8.length, sp.off, sp.off + sp.len);
    let cs = parentCs, defines = false;
    const fspgr = parts.find(x => x.type === ESC.FSPGR);
    if (fspgr && fspgr.off + 16 <= u8.length) {
      cs = { xs: dv.getInt32(fspgr.off, true), ys: dv.getInt32(fspgr.off + 4, true), xe: dv.getInt32(fspgr.off + 8, true), ye: dv.getInt32(fspgr.off + 12, true) };
      defines = true;
    }
    const fsp = parts.find(x => x.type === ESC.FSP);
    const flags = fsp && fsp.off + 8 <= u8.length ? dv.getUint32(fsp.off + 4, true) : 0;
    const isGroupLeader = !!(flags & 1);
    const data = parts.find(x => x.type === ESC.CLIENT_DATA);
    if (!data) return { cs, defines };
    const dvals = escherPairs(dv, data.off, data.len, 4);
    const seq = dvals.get(0x6801);
    if (seq === undefined) return { cs, defines };
    const anchor = parts.find(x => x.type === ESC.CLIENT_ANCHOR || x.type === ESC.CHILD_ANCHOR);
    let abs = null;
    if (anchor && anchor.type === ESC.CLIENT_ANCHOR) {
      const a = escherPairs(dv, anchor.off, anchor.len, 4);
      abs = { xs: a.get(0x2001) | 0, ys: a.get(0x2002) | 0, xe: a.get(0x2003) | 0, ye: a.get(0x2004) | 0 };
    } else if (anchor && anchor.off + 16 <= u8.length) {
      const cw = (parentCs.xe - parentCs.xs) || 1, ch = (parentCs.ye - parentCs.ys) || 1;
      const gw = parentAbs.xe - parentAbs.xs, gh = parentAbs.ye - parentAbs.ys;
      const sx = gw / cw, sy = gh / ch;
      abs = {
        xs: Math.round((dv.getInt32(anchor.off, true) - parentCs.xs) * sx + parentAbs.xs),
        ys: Math.round((dv.getInt32(anchor.off + 4, true) - parentCs.ys) * sy + parentAbs.ys),
        xe: Math.round((dv.getInt32(anchor.off + 8, true) - parentCs.xs) * sx + parentAbs.xs),
        ye: Math.round((dv.getInt32(anchor.off + 12, true) - parentCs.ys) * sy + parentAbs.ys),
      };
    }
    let pxId = 0;
    const fopt = parts.find(x => x.type === ESC.FOPT);
    if (fopt) {
      const n = fopt.initial >> 4;
      let p = fopt.off;
      for (let i = 0; i < n && p + 6 <= fopt.off + fopt.len; i++, p += 6) {
        if (dv.getUint16(p, true) === 0x4104) pxId = dv.getUint32(p + 2, true);
      }
    }
    if (shapes.size < LIMITS.maxShapes) shapes.set(seq, { seq, abs, pxId, order: isGroupLeader ? -1 : order++, group: isGroupLeader });
    return { cs, defines, abs: isGroupLeader || defines ? abs : null };
  };
  for (const dg of top.filter(r => r.type === ESC.DG)) {
    for (const rec of escherRecords(dv, u8.length, dg.off, dg.off + dg.len)) {
      if (rec.type === ESC.SPGR) walkGroup(rec, { xs: 0, ys: 0, xe: 1, ye: 1 }, { xs: 0, ys: 0, xe: 1, ye: 1 }, 0);
    }
  }
  return { shapes, delayMap };
}

/* ---------------- pictures ---------------- */
function imageStartOffset(kind, initial) {
  const inst = initial >> 4;
  let oneUid = true, off = 0x11;
  switch (kind) {
    case 'wmf': oneUid = inst === 0x216; off = 0x34; break;
    case 'emf': oneUid = inst === 0x3d4; off = 0x34; break;
    case 'png': oneUid = inst === 0x6e0; break;
    case 'jpeg': oneUid = inst === 0x46a || inst === 0x6e2; break;
    case 'jpegcmyk': oneUid = inst === 0x46b || inst === 0x6e3; off = 33; break;
    case 'dib': oneUid = inst === 0x7a8; break;
    case 'tiff': oneUid = inst === 0x6e4; break;
    default: break;
  }
  return off + (oneUid ? 0 : 0x10);
}

/** raw deflate inflate with a ceiling on the output, so a hostile picture cannot fill memory. Returns null on any trouble. */
export function inflateLimited(data, max = LIMITS.maxMetafile) {
  const chunks = [];
  let total = 0;
  let failed = false;
  const z = new Inflate((c) => { total += c.length; if (total <= max) chunks.push(c.slice()); });
  try { z.push(data, true); } catch { failed = true; }
  if (failed || total > max || total === 0) return null;
  const out = new Uint8Array(total);
  let o = 0;
  for (const c of chunks) { out.set(c, o); o += c.length; }
  return out;
}

/** a bare WMF (what Publisher stores) with the 22 byte "placeable" header the common viewers need to know its size */
export function placeableWmf(raw, rc, ptEmuW) {
  if (raw.length >= 4 && raw[0] === 0xd7 && raw[1] === 0xcd && raw[2] === 0xc6 && raw[3] === 0x9a) return raw;
  const clamp = v => Math.max(-32768, Math.min(32767, Math.round(v)));
  const w = rc[2] - rc[0];
  let inch = ptEmuW > 0 && w > 0 ? Math.round(w / (ptEmuW / 914400)) : 1440;
  if (!(inch >= 1 && inch <= 65535)) inch = 1440;
  const out = new Uint8Array(22 + raw.length);
  const dv = mk(out);
  dv.setUint32(0, 0x9ac6cdd7, true);
  dv.setUint16(4, 0, true);
  dv.setInt16(6, clamp(rc[0]), true); dv.setInt16(8, clamp(rc[1]), true); dv.setInt16(10, clamp(rc[2]), true); dv.setInt16(12, clamp(rc[3]), true);
  dv.setUint16(14, inch, true);
  dv.setUint32(16, 0, true);
  let sum = 0;
  for (let i = 0; i < 10; i++) sum ^= dv.getUint16(i * 2, true);
  dv.setUint16(20, sum & 0xffff, true);
  out.set(raw, 22);
  return out;
}

function dibToBmp(dib) {
  if (dib.length < 40) return null;
  const dv = mk(dib);
  const hdr = dv.getUint32(0, true);
  if (hdr < 12 || hdr > 124) return null;
  let bits = 0, used = 0, comp = 0;
  if (hdr === 12) { bits = dv.getUint16(10, true); } else { bits = dv.getUint16(14, true); comp = dv.getUint32(16, true); used = dv.getUint32(32, true); }
  let pal = 0;
  if (bits <= 8) pal = (used || (1 << bits)) * (hdr === 12 ? 3 : 4);
  const masks = (hdr === 40 && (comp === 3 || comp === 6)) ? (comp === 3 ? 12 : 16) : 0;
  const off = 14 + hdr + pal + masks;
  const out = new Uint8Array(14 + dib.length);
  const o = mk(out);
  out[0] = 0x42; out[1] = 0x4d;
  o.setUint32(2, out.length, true);
  o.setUint32(10, off, true);
  out.set(dib, 14);
  return out;
}

function jpegSize(u8) {
  let p = 2;
  while (p + 9 < u8.length) {
    if (u8[p] !== 0xff) { p++; continue; }
    const m = u8[p + 1];
    if (m === 0xd8 || m === 0x01 || (m >= 0xd0 && m <= 0xd7)) { p += 2; continue; }
    const len = (u8[p + 2] << 8) | u8[p + 3];
    if ((m >= 0xc0 && m <= 0xcf) && m !== 0xc4 && m !== 0xc8 && m !== 0xcc) return { h: (u8[p + 5] << 8) | u8[p + 6], w: (u8[p + 7] << 8) | u8[p + 8] };
    p += 2 + len;
  }
  return null;
}
/** Publisher files the pictures under a type that is not always the real one (a GIF can sit in a "PNG" record): go by the first bytes */
function sniffRaster(u8) {
  if (u8.length < 12) return null;
  if (u8[0] === 0x89 && u8[1] === 0x50 && u8[2] === 0x4e && u8[3] === 0x47) return { ext: 'png', mime: 'image/png' };
  if (u8[0] === 0xff && u8[1] === 0xd8) return { ext: 'jpg', mime: 'image/jpeg' };
  if (u8[0] === 0x47 && u8[1] === 0x49 && u8[2] === 0x46 && u8[3] === 0x38) return { ext: 'gif', mime: 'image/gif' };
  if (u8[0] === 0x42 && u8[1] === 0x4d) return { ext: 'bmp', mime: 'image/bmp' };
  if ((u8[0] === 0x49 && u8[1] === 0x49 && u8[2] === 0x2a && u8[3] === 0) || (u8[0] === 0x4d && u8[1] === 0x4d && u8[2] === 0 && u8[3] === 0x2a)) return { ext: 'tif', mime: 'image/tiff' };
  return null;
}
function imageInfo(img) {
  const u8 = img.bytes;
  if (img.ext === 'gif' && u8.length > 10) { const dv = mk(u8); return { w: dv.getUint16(6, true), h: dv.getUint16(8, true) }; }
  if (img.ext === 'png' && u8.length > 24) { const dv = mk(u8); return { w: dv.getUint32(16), h: dv.getUint32(20) }; }
  if ((img.ext === 'jpg') && u8.length > 12) return jpegSize(u8);
  if (img.ext === 'bmp' && u8.length > 26) { const dv = mk(u8); return { w: Math.abs(dv.getInt32(18, true)), h: Math.abs(dv.getInt32(22, true)) }; }
  return null;
}

function parseDelay(u8) {
  const dv = mk(u8);
  const images = []; // 1 based index = array index + 1
  let p = 0;
  let guard = 0;
  while (p + 8 <= u8.length && guard++ < LIMITS.maxImages * 4) {
    const initial = dv.getUint16(p, true), type = dv.getUint16(p + 2, true), len = dv.getUint32(p + 4, true);
    const off = p + 8;
    const next = off + len;
    if (len > u8.length - off) { images.push(null); break; }
    const kind = BLIP[type];
    if (!kind) { images.push(null); p = next; continue; }
    const start = off + imageStartOffset(kind, initial);
    if (start >= next) { images.push(null); p = next; continue; }
    let bytes = u8.subarray(start, next);
    let ext = kind, mime = '', shown = false;
    const sniffed = (kind === 'jpeg' || kind === 'png' || kind === 'jpegcmyk') ? sniffRaster(bytes) : null;
    if (sniffed) { ext = sniffed.ext; mime = sniffed.mime; shown = kind !== 'jpegcmyk'; }
    else if (kind === 'jpeg' || kind === 'jpegcmyk') { ext = 'jpg'; mime = 'image/jpeg'; shown = kind === 'jpeg'; }
    else if (kind === 'png') { mime = 'image/png'; shown = true; }
    else if (kind === 'dib') {
      const bmp = dibToBmp(bytes);
      if (!bmp) { images.push(null); p = next; continue; }
      bytes = bmp; ext = 'bmp'; mime = 'image/bmp'; shown = true;
    } else if (kind === 'wmf' || kind === 'emf') {
      // a metafile picture: a 34 byte header (size, bounds, size in EMU, packed size, compression) and then the metafile,
      // deflated (behind a 2 byte zlib header) unless the compression byte says it is stored as it is
      const hdr = start - 36;
      if (hdr < off || hdr + 34 > next) { images.push(null); p = next; continue; }
      const cbSize = dv.getUint32(hdr, true);
      const rc = [dv.getInt32(hdr + 4, true), dv.getInt32(hdr + 8, true), dv.getInt32(hdr + 12, true), dv.getInt32(hdr + 16, true)];
      const ptW = dv.getInt32(hdr + 20, true), ptH = dv.getInt32(hdr + 24, true);
      const comp = u8[hdr + 32];
      let raw = null;
      if (comp === 0) { const z0 = hdr + 34; raw = inflateLimited(u8.subarray(z0 + ((u8[z0] & 0x0f) === 8 ? 2 : 0), next)); }
      else if (comp === 0xfe) raw = u8.subarray(hdr + 34, Math.min(next, hdr + 34 + cbSize));
      if (!raw || raw.length < 18) { images.push(null); p = next; continue; }
      bytes = kind === 'wmf' ? placeableWmf(raw, rc, ptW) : raw;
      mime = kind === 'wmf' ? 'image/wmf' : 'image/emf'; ext = kind;
      const img = { kind, ext, mime, bytes, shown: false, size: bytes.length, vector: true, rc, wPt: ptW / EMU_PER_PT, hPt: ptH / EMU_PER_PT };
      images.push(img);
      p = next;
      continue;
    } else if (kind === 'tiff') { mime = 'image/tiff'; ext = 'tif'; }
    else if (kind === 'pict') { mime = 'image/x-pict'; ext = 'pict'; }
    const img = { kind, ext, mime, bytes, shown, size: bytes.length };
    const info = imageInfo(img);
    if (info) { img.w = info.w; img.h = info.h; }
    images.push(img);
    p = next;
  }
  return images;
}

/* ---------------- summary information ---------------- */
const CODEPAGES = { 874: 'windows-874', 932: 'shift_jis', 936: 'gbk', 949: 'euc-kr', 950: 'big5', 1250: 'windows-1250', 1251: 'windows-1251', 1252: 'windows-1252', 1253: 'windows-1253', 1254: 'windows-1254', 1255: 'windows-1255', 1256: 'windows-1256', 1257: 'windows-1257', 1258: 'windows-1258', 65001: 'utf-8' };
function parseSummary(u8) {
  const out = { title: '', author: '', lastAuthor: '', created: null, modified: null, thumbnail: null };
  try {
    if (u8.length < 48) return out;
    const dv = mk(u8);
    if (dv.getUint16(0, true) !== 0xfffe) return out;
    const sets = dv.getUint32(24, true);
    if (sets < 1) return out;
    const off = dv.getUint32(44, true);
    if (off + 8 > u8.length) return out;
    const n = Math.min(dv.getUint32(off + 4, true), 64);
    let cp = 1252;
    const props = [];
    for (let i = 0; i < n; i++) {
      const id = dv.getUint32(off + 8 + i * 8, true), po = off + dv.getUint32(off + 12 + i * 8, true);
      if (po + 4 > u8.length) continue;
      props.push([id, po, dv.getUint16(po, true)]);
      if (id === 1 && dv.getUint16(po, true) === 2) cp = dv.getUint16(po + 4, true);
    }
    const label = CODEPAGES[cp] || 'windows-1252';
    const str = (po, vt) => {
      const len = dv.getUint32(po + 4, true);
      if (len > 4096 || po + 8 > u8.length) return '';
      const noNul = s => s.split(String.fromCharCode(0)).join('').trim();
      if (vt === 31) return noNul(utf16(u8, po + 8, po + 8 + len * 2));
      try { return noNul(new TextDecoder(label).decode(u8.subarray(po + 8, po + 8 + len))); } catch { return noNul(latin1(u8, po + 8, po + 8 + len)); }
    };
    const date = po => {
      const lo = dv.getUint32(po + 4, true), hi = dv.getUint32(po + 8, true);
      const ms = (hi * 4294967296 + lo) / 10000 - 11644473600000;
      return ms > 0 && ms < 4.1e12 ? new Date(ms).toISOString() : null;
    };
    for (const [id, po, vt] of props) {
      if ((vt === 30 || vt === 31) && id === 2) out.title = str(po, vt);
      else if ((vt === 30 || vt === 31) && id === 4) out.author = str(po, vt);
      else if ((vt === 30 || vt === 31) && id === 8) out.lastAuthor = str(po, vt);
      else if (vt === 64 && id === 12) out.created = date(po);
      else if (vt === 64 && id === 13) out.modified = date(po);
      else if (vt === 71 && id === 17) out.thumbnail = thumbnailOf(u8, po);
    }
  } catch { /* the summary is a courtesy: a damaged one is skipped */ }
  return out;
}

/** "Publisher 2010" and so on, from the application version Office writes into the document summary (11 = 2003, 12 = 2007, 14 = 2010, 15 = 2013, 16 = 2016 and later) */
function savedByOf(u8) {
  if (u8.length < 48) return '';
  const dv = mk(u8);
  if (dv.getUint16(0, true) !== 0xfffe || dv.getUint32(24, true) < 1) return '';
  const off = dv.getUint32(44, true);
  if (off + 8 > u8.length) return '';
  const n = Math.min(dv.getUint32(off + 4, true), 64);
  for (let i = 0; i < n; i++) {
    const id = dv.getUint32(off + 8 + i * 8, true), po = off + dv.getUint32(off + 12 + i * 8, true);
    if (id !== 23 || po + 8 > u8.length || dv.getUint16(po, true) !== 3) continue;
    const major = dv.getUint32(po + 4, true) >>> 16;
    const names = { 10: '2002', 11: '2003', 12: '2007', 14: '2010', 15: '2013' };
    if (names[major]) return `Publisher ${names[major]}`;
    if (major >= 16 && major < 30) return 'Publisher 2016 or later';
  }
  return '';
}

/** the page-1 preview Publisher stores: a metafile around one bitmap. Returns a BMP, or null. */
function thumbnailOf(u8, po) {
  const dv = mk(u8);
  const cb = dv.getUint32(po + 4, true);
  const fmt = dv.getInt32(po + 8, true);
  let start = po + 12;
  if (fmt === -1) start += 4; else return null;
  const clip = dv.getInt32(po + 12, true);
  if (clip !== 3 && clip !== 8) return null;
  const end = Math.min(u8.length, po + 8 + cb);
  if (clip === 8) { const dib = u8.subarray(start, end); const bmp = dibToBmp(dib); return bmp ? { bytes: bmp, mime: 'image/bmp' } : null; }
  // CF_METAFILEPICT: an 8 byte header (mapping mode, extents) before the WMF
  let p = start;
  for (let i = 0; i < 24 && p + 18 < end; i++, p++) if (dv.getUint16(p, true) === 1 && dv.getUint16(p + 2, true) === 9 && dv.getUint16(p + 4, true) === 0x300) break; else if (i === 23) return null;
  p += 18;
  let guard = 0;
  while (p + 6 <= end && guard++ < 2000) {
    const size = dv.getUint32(p, true) * 2, fn = dv.getUint16(p + 4, true);
    if (size < 6 || fn === 0) break;
    if (fn === 0x0f43 && p + 28 + 40 <= end) { const bmp = dibToBmp(u8.subarray(p + 28, p + size)); if (bmp) return { bytes: bmp, mime: 'image/bmp' }; }
    if (fn === 0x0b41 && p + 6 + 22 + 40 <= end) { const bmp = dibToBmp(u8.subarray(p + 6 + 22, p + size)); if (bmp) return { bytes: bmp, mime: 'image/bmp' }; }
    p += size;
  }
  return null;
}

/* ---------------- text clean-up ---------------- */
/** paragraphs of one story. Publisher ends a paragraph with CR; a line break is LF or VT; other control characters go. */
const NL = String.fromCharCode(10);
const TAB = String.fromCharCode(9);
export function paragraphsOf(raw) {
  const s = String(raw);
  const out = [];
  let cur = '';
  for (let i = 0; i < s.length; i++) {
    const c = s.charCodeAt(i);
    if (c === 13) { if (s.charCodeAt(i + 1) === 10) i++; out.push(cur); cur = ''; }
    else if (c === 10 || c === 11 || c === 0x2028) cur += NL;
    else if (c === 9) cur += TAB;
    else if (c < 32 || (c >= 127 && c < 160) || c === 0xfffe || c === 0xffff) continue;
    else cur += s[i];
  }
  out.push(cur);
  const paras = out.map(p => p.trimEnd());
  while (paras.length && paras[paras.length - 1] === '') paras.pop();
  return paras;
}

const wordCount = s => (s.match(/[^\s]+/gu) || []).length;

/* ---------------- reading order ---------------- */
export function readingOrder(frames, pageW) {
  const withBox = frames.filter(f => f.box);
  const without = frames.filter(f => !f.box);
  if (!withBox.length) return frames.slice();
  const wide = pageW ? pageW * 0.6 : Infinity;
  const byY = withBox.slice().sort((a, b) => a.box.y - b.box.y || a.box.x - b.box.x);
  const out = [];
  let run = [];
  const flush = () => {
    if (!run.length) return;
    const tol = pageW ? pageW * 0.04 : 0;
    const cols = [];
    for (const f of run.slice().sort((a, b) => a.box.x - b.box.x)) {
      const c = cols.find(k => Math.abs(k.x - f.box.x) <= tol);
      if (c) c.items.push(f); else cols.push({ x: f.box.x, items: [f] });
    }
    cols.sort((a, b) => a.x - b.x);
    for (const c of cols) out.push(...c.items.sort((a, b) => a.box.y - b.box.y));
    run = [];
  };
  for (const f of byY) {
    if (f.box.w >= wide) { flush(); out.push(f); } else run.push(f);
  }
  flush();
  return out.concat(without);
}

/* ---------------- the whole file ---------------- */
/**
 * @param {Uint8Array} bytes the .pub file
 * @returns the model: { meta, pageSize, pages, masters, otherText, images, links, stats, warnings }
 */
export function openPub(bytes) {
  if (!(bytes instanceof Uint8Array)) throw new PubError('corrupt', 'bytes expected');
  if (bytes.length === 0) throw new PubError('empty');
  if (bytes.length > LIMITS.maxFile) throw new PubError('too-big');
  let cfb;
  try { cfb = openCfb(bytes); } catch (e) {
    if (e instanceof CfbError) {
      if (e.code === 'not-cfb') throw new PubError(looksLikeOther(bytes), e.message);
      throw new PubError(e.code === 'truncated' ? 'truncated' : 'corrupt', e.message);
    }
    throw e;
  }
  if (cfb.has('EncryptionInfo') || cfb.has('EncryptedPackage')) throw new PubError('encrypted', 'password protected');
  if (!cfb.has('Contents')) throw new PubError(cfb.has('WordDocument') ? 'is-word' : cfb.has('Workbook') || cfb.has('Book') ? 'is-excel' : cfb.has('PowerPoint Document') ? 'is-powerpoint' : 'not-publisher', 'no Contents stream');
  let contentsBytes;
  try { contentsBytes = cfb.read('Contents'); } catch (e) { throw wrap(e); }
  const gen = generationOf(contentsBytes);
  if (gen !== '2002') throw new PubError(gen === 'unknown' ? 'not-publisher' : 'old-version', `generation ${gen}`);
  if (!cfb.has('Quill/QuillSub/CONTENTS') || !cfb.has('Escher/EscherStm')) throw new PubError('not-publisher', 'text or shape stream missing');

  const warnings = [];
  let contents, quill, escher, images = [];
  try {
    contents = parseContents(contentsBytes);
    quill = parseQuill(cfb.read('Quill/QuillSub/CONTENTS'));
    escher = parseEscher(cfb.read('Escher/EscherStm'));
    if (cfb.has('Escher/EscherDelayStm')) images = parseDelay(cfb.read('Escher/EscherDelayStm'));
  } catch (e) { throw wrap(e); }
  let meta = { title: '', author: '', lastAuthor: '', created: null, modified: null, thumbnail: null };
  if (cfb.has('\u0005SummaryInformation')) { try { meta = parseSummary(cfb.read('\u0005SummaryInformation')); } catch { /* optional */ } }
  meta.savedBy = '';
  if (cfb.has('\u0005DocumentSummaryInformation')) { try { meta.savedBy = savedByOf(cfb.read('\u0005DocumentSummaryInformation')); } catch { /* optional */ } }

  const storyById = new Map();
  quill.stories.forEach(s => { if (!storyById.has(s.id)) storyById.set(s.id, s); });
  if (quill.stories.some(s => s.truncated)) warnings.push('truncated-text');

  const claimed = new Set();
  const used = new Set();
  const halfW = (contents.doc.width || 0) / 2, halfH = (contents.doc.height || 0) / 2;
  const pictureOf = pxId => {
    if (!pxId) return null;
    const di = escher.delayMap[pxId - 1];
    if (di === undefined || di < 1) return null;
    const img = images[di - 1];
    return img ? di - 1 : null;
  };
  const frameOf = (seq) => {
    const sh = contents.shapes.get(seq);
    const es = escher.shapes.get(seq);
    if (!sh && !es) return null;
    const f = { seq, kind: 'shape', box: null, text: null, paragraphs: null, grid: null, image: null, continued: false, links: [] };
    if (es && es.abs) {
      // Publisher measures from the centre of the page; the box is kept in points from the page's top left corner
      const x0 = Math.min(es.abs.xs, es.abs.xe), x1 = Math.max(es.abs.xs, es.abs.xe);
      const y0 = Math.min(es.abs.ys, es.abs.ye), y1 = Math.max(es.abs.ys, es.abs.ye);
      if (x1 > x0 && y1 > y0) f.box = { x: (x0 + halfW) / EMU_PER_PT, y: (y0 + halfH) / EMU_PER_PT, w: (x1 - x0) / EMU_PER_PT, h: (y1 - y0) / EMU_PER_PT };
    }
    if (es) { const pi = pictureOf(es.pxId); if (pi !== null) { f.image = pi; used.add(pi); f.kind = 'picture'; } }
    if (sh && sh.textId !== null && storyById.has(sh.textId)) {
      const story = storyById.get(sh.textId);
      if (claimed.has(story.id)) f.continued = true;
      else {
        claimed.add(story.id);
        const paras = paragraphsOf(story.text);
        f.paragraphs = paras;
        f.text = paras.join('\n');
        f.storyId = story.id;
        f.links = quill.links.filter(l => l.story === story.index).map(l => l.url);
        if (sh.chunkType === CH.TABLE && sh.rows > 0 && sh.cols > 0 && paras.length === sh.rows * sh.cols && sh.rows * sh.cols <= 2000) {
          const cells = paras.slice(0, sh.rows * sh.cols);
          f.grid = { rows: sh.rows, cols: sh.cols, cells };
          f.kind = 'table';
        } else if (f.kind === 'shape') f.kind = 'text';
        else if (f.kind === 'picture' && !f.text) f.kind = 'picture';
      }
      if (f.continued) f.kind = f.kind === 'shape' ? 'text' : f.kind;
    }
    return f;
  };

  const pageW = (contents.doc.width || 0) / EMU_PER_PT;
  const pageList = [];
  const masters = [];
  const order = contents.doc.pageOrder.length ? contents.doc.pageOrder : [...contents.pages.keys()];
  const seenPages = new Set();
  const frameFor = (pg) => pg.shapes.map(frameOf).filter(Boolean).filter(f => f.kind !== 'shape' || f.box);
  for (const seq of order) {
    const pg = contents.pages.get(seq);
    if (!pg || seenPages.has(seq) || pageList.length >= LIMITS.maxPages) continue;
    seenPages.add(seq);
    if (pg.master) { masters.push({ seq, frames: [] }); continue; }
    const frames = frameFor(pg);
    pageList.push({ n: pageList.length + 1, seq, appliedMaster: pg.appliedMaster, frames: readingOrder(frames, pageW), all: frames.length });
  }
  // Publisher keeps a few empty pages at the end of the list that are not pages of the document: leave out trailing empty ones
  while (pageList.length > 1 && pageList[pageList.length - 1].all === 0) pageList.pop();
  // master pages hold the text and pictures that repeat on every page (headers, footers, logos)
  for (const m of masters) {
    const pg = contents.pages.get(m.seq);
    m.frames = readingOrder(frameFor(pg).filter(f => f.kind !== 'shape'), pageW);
  }
  // pages that only the page order missed (rare): still listed, after the others
  for (const [seq, pg] of contents.pages) {
    if (seenPages.has(seq) || pg.master || pageList.length >= LIMITS.maxPages) continue;
    const frames = frameFor(pg);
    if (frames.length) pageList.push({ n: pageList.length + 1, seq, appliedMaster: pg.appliedMaster, frames: readingOrder(frames, pageW), all: frames.length });
  }

  // text no frame on a page claimed (pasteboard, hidden, deleted-looking boxes)
  const otherText = [];
  for (const s of quill.stories) {
    if (claimed.has(s.id)) continue;
    const paras = paragraphsOf(s.text);
    const t = paras.join('\n').trim();
    if (t) otherText.push({ storyId: s.id, paragraphs: paras, text: paras.join('\n') });
  }

  const imagesOut = [];
  images.forEach((im, i) => { if (im) imagesOut.push({ index: i, kind: im.kind, ext: im.ext, mime: im.mime, size: im.size, w: im.w || 0, h: im.h || 0, shown: im.shown, bytes: im.bytes, onPage: used.has(i), vector: !!im.vector, wPt: im.wPt || 0, hPt: im.hPt || 0 }); });

  const allText = [...pageList.flatMap(p => p.frames), ...masters.flatMap(m => m.frames)].map(f => f.text || '').concat(otherText.map(o => o.text)).join('\n');
  const stats = { pages: pageList.length, words: wordCount(allText), characters: allText.replace(/\s/g, '').length, images: imagesOut.length, textFrames: pageList.reduce((n, p) => n + p.frames.filter(f => f.text).length, 0), links: quill.links.length };
  return {
    format: 'Publisher 2002 and later',
    meta, pageSize: { w: contents.doc.width / EMU_PER_PT, h: contents.doc.height / EMU_PER_PT },
    pages: pageList, masters, otherText, images: imagesOut, links: quill.links, stats, warnings,
  };
}

function wrap(e) {
  if (e instanceof PubError) return e;
  if (e instanceof CfbError) return new PubError(e.code === 'truncated' ? 'truncated' : 'corrupt', e.message);
  return new PubError('corrupt', String(e && e.message || e));
}

/** Publisher 2002 and later start the Contents stream with e8 ac 2c 00, Publisher 2000 with e8 ac 22 00 */
export function generationOf(contents) {
  if (contents.length < 4 || contents[0] !== 0xe8 || contents[1] !== 0xac || contents[3] !== 0x00) return 'unknown';
  if (contents[2] === 0x2c) return '2002';
  if (contents[2] === 0x22) return '2000';
  return 'unknown';
}

/** what a file that is not a compound file probably is, for a clear message */
export function looksLikeOther(u8) {
  const h = latin1(u8, 0, 8);
  if (h.startsWith('%PDF')) return 'is-pdf';
  if (h.startsWith('PK')) return 'is-zip';
  if (h.startsWith('{\\rtf')) return 'is-rtf';
  if (/^-----BEGIN|^ssh-|^ecdsa-/.test(latin1(u8, 0, 12))) return 'is-key';
  return 'not-publisher';
}

export { EMU_PER_PT };
