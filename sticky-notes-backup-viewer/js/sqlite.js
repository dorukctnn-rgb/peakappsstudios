/* Peelback: a small SQLite file reader. It reads the tables of a database file in memory: no WebAssembly, no library, nothing
 * is written and nothing is sent anywhere. What it knows (the file format is public: sqlite.org/fileformat2.html):
 *  - the 100-byte header (page size, text encoding), table b-trees (interior 0x05, leaf 0x0D), overflow pages, records;
 *  - the write-ahead log (plum.sqlite-wal): frames are checked (salts and the checksum chain) and the pages of every committed
 *    transaction are laid over the main file, as SQLite itself does when it opens a database that has a -wal beside it;
 *  - pages on the free list (what a deleted note leaves behind once its page is released).
 * Integers wider than 53 bits come back as BigInt (the Sticky Notes times are 63-bit .NET ticks). */

export class SqliteError extends Error {}
const MAGIC = 'SQLite format 3\u0000';

export function isSqlite(b) {
  if (!b || b.length < 100) return false;
  for (let i = 0; i < 16; i++) if (b[i] !== MAGIC.charCodeAt(i)) return false;
  return true;
}
export function isWal(b) {
  if (!b || b.length < 32) return false;
  const m = ((b[0] << 24) | (b[1] << 16) | (b[2] << 8) | b[3]) >>> 0;
  return m === 0x377f0682 || m === 0x377f0683;
}

const dv = b => new DataView(b.buffer, b.byteOffset, b.byteLength);

function varint(b, o) {
  let v = 0n;
  for (let i = 0; i < 8; i++) {
    const c = b[o + i];
    if (c === undefined) throw new SqliteError('The file ends inside a number.');
    v = (v << 7n) | BigInt(c & 0x7f);
    if (!(c & 0x80)) return [Number(v), i + 1, v];
  }
  const c = b[o + 8];
  v = (v << 8n) | BigInt(c);
  return [v > 0x1fffffffffffffn ? v : Number(v), 9, v];
}

/** Lays the committed frames of a WAL file over a database file; returns the database as it was at the last commit. */
export function applyWal(db, wal) {
  if (!isSqlite(db)) throw new SqliteError('This is not a SQLite database file.');
  if (!isWal(wal)) return { db, frames: 0, note: 'not a wal' };
  const w = dv(wal);
  const magic = w.getUint32(0), pageSize = w.getUint32(8) === 1 ? 65536 : w.getUint32(8);
  const salt1 = w.getUint32(16), salt2 = w.getUint32(20);
  const big = (magic & 1) === 1;
  const sum = (buf, off, len, s) => {
    let [s0, s1] = s;
    const v = dv(buf);
    for (let i = 0; i < len; i += 8) {
      const x0 = v.getUint32(off + i, !big), x1 = v.getUint32(off + i + 4, !big);
      s0 = (s0 + x0 + s1) >>> 0; s1 = (s1 + x1 + s0) >>> 0;
    }
    return [s0, s1];
  };
  let s = sum(wal, 0, 24, [0, 0]);
  if (s[0] !== w.getUint32(24) || s[1] !== w.getUint32(28)) return { db, frames: 0, note: 'bad wal header' };
  const dbPage = dv(db).getUint16(16);
  const dbPageSize = dbPage === 1 ? 65536 : dbPage;
  if (pageSize !== dbPageSize) return { db, frames: 0, note: 'page size differs' };
  const frameLen = 24 + pageSize;
  const pages = new Map();       // page number -> the page bytes of the last committed frame
  let pending = [], committed = 0, sizeAfter = 0, off = 32, n = 0;
  while (off + frameLen <= wal.length) {
    if (w.getUint32(off + 8) !== salt1 || w.getUint32(off + 12) !== salt2) break;
    s = sum(wal, off, 8, s);
    s = sum(wal, off + 24, pageSize, s);
    if (s[0] !== w.getUint32(off + 16) || s[1] !== w.getUint32(off + 20)) break;
    const pgno = w.getUint32(off);
    pending.push([pgno, wal.subarray(off + 24, off + frameLen)]);
    const commitSize = w.getUint32(off + 4);
    n++;
    if (commitSize !== 0) { for (const [p, d] of pending) pages.set(p, d); pending = []; committed = n; sizeAfter = commitSize; }
    off += frameLen;
  }
  if (!committed) return { db, frames: 0, note: 'no committed frames' };
  const total = Math.max(sizeAfter, Math.ceil(db.length / pageSize));
  const out = new Uint8Array(total * pageSize);
  out.set(db.subarray(0, Math.min(db.length, out.length)));
  for (const [p, d] of pages) if (p >= 1 && p <= total) out.set(d, (p - 1) * pageSize);
  return { db: out, frames: committed, note: '' };
}

function readInt(b, o, n) {
  if (n === 0) return 0;
  const v = dv(b);
  switch (n) {
    case 1: return v.getInt8(o);
    case 2: return v.getInt16(o);
    case 3: { const x = (b[o] << 16) | (b[o + 1] << 8) | b[o + 2]; return x & 0x800000 ? x - 0x1000000 : x; }
    case 4: return v.getInt32(o);
    case 6: { const hi = v.getInt16(o), lo = v.getUint32(o + 2); return hi * 4294967296 + lo; }
    default: { const x = v.getBigInt64(o); return x >= -9007199254740991n && x <= 9007199254740991n ? Number(x) : x; }
  }
}

function decodeText(bytes, enc) {
  if (enc === 2) return new TextDecoder('utf-16le').decode(bytes);
  if (enc === 3) return new TextDecoder('utf-16be').decode(bytes);
  return new TextDecoder('utf-8').decode(bytes);
}

/** One record (the payload of a table cell) as an array of values: null, number, bigint, string or Uint8Array. */
export function decodeRecord(p, enc) {
  const [hdrLen, hl] = varint(p, 0);
  const types = [];
  let o = hl;
  while (o < hdrLen) { const [t, l] = varint(p, o); types.push(t); o += l; }
  const out = [];
  let d = hdrLen;
  for (const t of types) {
    if (t === 0) out.push(null);
    else if (t >= 1 && t <= 6) { const sz = [0, 1, 2, 3, 4, 6, 8][t]; out.push(readInt(p, d, sz)); d += sz; }
    else if (t === 7) { out.push(dv(p).getFloat64(d)); d += 8; }
    else if (t === 8) out.push(0);
    else if (t === 9) out.push(1);
    else if (t >= 12) {
      const len = t % 2 === 0 ? (t - 12) / 2 : (t - 13) / 2;
      const raw = p.subarray(d, d + len);
      out.push(t % 2 === 0 ? raw.slice() : decodeText(raw, enc));
      d += len;
    } else throw new SqliteError('A record uses a value type this reader does not know.');
  }
  return out;
}

export class Sqlite {
  constructor(bytes) {
    if (!isSqlite(bytes)) throw new SqliteError('This is not a SQLite database file.');
    this.b = bytes; this.v = dv(bytes);
    const ps = this.v.getUint16(16);
    this.pageSize = ps === 1 ? 65536 : ps;
    if (this.pageSize < 512 || (this.pageSize & (this.pageSize - 1))) throw new SqliteError('The page size in the header is not valid.');
    this.reserved = bytes[20];
    this.usable = this.pageSize - this.reserved;
    this.enc = this.v.getUint32(56) || 1;
    this.pages = Math.floor(bytes.length / this.pageSize);
    this.walMode = bytes[18] === 2 || bytes[19] === 2;
  }
  page(n) {
    if (n < 1 || n > this.pages) throw new SqliteError('A page number points outside the file.');
    return (n - 1) * this.pageSize;
  }
  // all the cells of the table b-tree at page `root`: [rowid, payload bytes]
  *cells(root, seen = new Set(), depth = 0) {
    if (depth > 24 || seen.has(root) || root < 1 || root > this.pages) return;   // a page outside a cut file ends that branch only
    seen.add(root);
    const base = this.page(root), hdr = root === 1 ? base + 100 : base;
    const type = this.b[hdr], ncell = this.v.getUint16(hdr + 3);
    if (type === 0x05) {
      const ptrs = hdr + 12;
      for (let i = 0; i < ncell; i++) {
        const cell = base + this.v.getUint16(ptrs + i * 2);
        yield* this.cells(this.v.getUint32(cell), seen, depth + 1);
      }
      yield* this.cells(this.v.getUint32(hdr + 8), seen, depth + 1);
    } else if (type === 0x0d) {
      for (const c of this.leafCells(base, hdr, ncell)) yield c;
    }
  }
  *leafCells(base, hdr, ncell) {
    const ptrs = hdr + 8, U = this.usable;
    for (let i = 0; i < ncell; i++) {
      let o = base + this.v.getUint16(ptrs + i * 2);
      try {
        const [P, l1] = varint(this.b, o); o += l1;
        const [rowid, l2] = varint(this.b, o); o += l2;
        const X = U - 35;
        if (P <= X) { yield [rowid, this.b.subarray(o, o + P)]; continue; }
        const M = Math.floor(((U - 12) * 32) / 255) - 23;
        const K = M + ((P - M) % (U - 4));
        const local = K <= X ? K : M;
        const out = new Uint8Array(P);
        out.set(this.b.subarray(o, o + local));
        let got = local, next = this.v.getUint32(o + local), guard = 0;
        while (next && got < P && guard++ < 1_000_000) {
          const po = this.page(next);
          const take = Math.min(U - 4, P - got);
          out.set(this.b.subarray(po + 4, po + 4 + take), got);
          got += take; next = this.v.getUint32(po);
        }
        if (got === P) yield [rowid, out];
      } catch (e) { /* a damaged cell is skipped, the others are still read */ }
    }
  }
  /** The schema: [{ type, name, tbl, root, sql }] */
  schema() {
    const out = [];
    for (const [, p] of this.cells(1)) {
      try { const r = decodeRecord(p, this.enc); out.push({ type: r[0], name: r[1], tbl: r[2], root: Number(r[3]) || 0, sql: r[4] || '' }); } catch (e) { /* skip */ }
    }
    return out;
  }
  /** The column names of a table from its CREATE TABLE text, and which one is the INTEGER PRIMARY KEY (kept in the rowid). */
  static columns(sql) {
    const m = /\(([\s\S]*)\)[^)]*$/.exec(sql || '');
    if (!m) return { names: [], rowidCol: -1 };
    const parts = []; let depth = 0, cur = '', q = '';
    for (const ch of m[1]) {
      if (q) { cur += ch; if (ch === q) q = ''; continue; }
      if (ch === '"' || ch === "'" || ch === '`') { q = ch; cur += ch; continue; }
      if (ch === '[') { q = ']'; cur += ch; continue; }
      if (ch === '(') depth++;
      if (ch === ')') depth--;
      if (ch === ',' && depth === 0) { parts.push(cur.trim()); cur = ''; } else cur += ch;
    }
    if (cur.trim()) parts.push(cur.trim());
    const names = []; let rowidCol = -1;
    for (const p of parts) {
      if (/^(constraint|primary\s+key|unique|check|foreign\s+key)\b/i.test(p)) continue;
      const nm = /^(?:"([^"]+)"|`([^`]+)`|\[([^\]]+)\]|'([^']+)'|(\S+))/.exec(p);
      const name = nm[1] || nm[2] || nm[3] || nm[4] || nm[5];
      if (/\binteger\b[^,]*\bprimary\s+key\b/i.test(p)) rowidCol = names.length;
      names.push(name);
    }
    return { names, rowidCol };
  }
  /** Every row of a table as an object { column: value }. */
  table(name) {
    const t = this.schema().find(s => s.type === 'table' && String(s.name).toLowerCase() === name.toLowerCase());
    if (!t || !t.root) return null;
    const { names, rowidCol } = Sqlite.columns(t.sql);
    const rows = [];
    for (const [rowid, p] of this.cells(t.root)) {
      let r;
      try { r = decodeRecord(p, this.enc); } catch (e) { continue; }
      const o = { rowid };
      names.forEach((c, i) => { o[c] = i === rowidCol && r[i] === null ? rowid : (r[i] === undefined ? null : r[i]); });
      rows.push(o);
    }
    return { name: t.name, columns: names, rows };
  }
  /** Page numbers on the free list (the trunk pages and the leaf pages they list). */
  freePages() {
    const out = [];
    let trunk = this.v.getUint32(32), guard = 0;
    while (trunk && guard++ < 100000) {
      let o;
      try { o = this.page(trunk); } catch (e) { break; }
      out.push({ page: trunk, trunk: true });
      const count = this.v.getUint32(o + 4);
      for (let i = 0; i < count && 8 + i * 4 + 4 <= this.usable; i++) {
        const leaf = this.v.getUint32(o + 8 + i * 4);
        if (leaf >= 1 && leaf <= this.pages) out.push({ page: leaf, trunk: false });
      }
      trunk = this.v.getUint32(o);
    }
    return out;
  }
  /** Rows still readable on a page that is no longer part of a table (a released leaf page keeps its cells). */
  rowsOfPage(n) {
    const base = this.page(n);
    if (this.b[base] !== 0x0d) return [];
    const ncell = this.v.getUint16(base + 3);
    const out = [];
    for (const [rowid, p] of this.leafCells(base, base, ncell)) {
      try { out.push({ rowid, values: decodeRecord(p, this.enc) }); } catch (e) { /* not a record */ }
    }
    return out;
  }
}
