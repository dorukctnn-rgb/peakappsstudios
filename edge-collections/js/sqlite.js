// A small read-only SQLite reader, enough to read the tables of the Collections database that Microsoft Edge keeps on
// disk (collectionsSQLite). It follows the file format as published at https://www.sqlite.org/fileformat2.html:
// the 100-byte header, table b-trees (interior page 0x05, leaf page 0x0D), records with serial types, and payloads that
// spill onto overflow pages. It never writes, never runs SQL and never looks at the freelist, so rows that SQLite has
// deleted stay deleted. Everything happens in memory on the visitor's device.
//   const db = openSqlite(uint8array);   db.tables() -> ['collections', ...];   db.rows('items') -> [{ id, title, ... }]

export class SqliteError extends Error {
  constructor(code, message) { super(message); this.code = code; }
}

const MAGIC = 'SQLite format 3\u0000';
const MAX_PAGES_VISITED = 2_000_000;

function readVarint(b, at) {
  // returns [value as Number, bytes used]; the 9th byte keeps all 8 bits
  let v = 0n;
  for (let i = 0; i < 8; i++) {
    if (at + i >= b.length) throw new SqliteError('corrupt', 'varint runs past the end of the page');
    const byte = b[at + i];
    v = (v << 7n) | BigInt(byte & 0x7f);
    if (!(byte & 0x80)) return [Number(BigInt.asIntN(64, v)), i + 1];
  }
  if (at + 8 >= b.length) throw new SqliteError('corrupt', 'varint runs past the end of the page');
  v = (v << 8n) | BigInt(b[at + 8]);
  return [Number(BigInt.asIntN(64, v)), 9];
}

/** Parse the column names out of a CREATE TABLE statement, in order. Table constraints are skipped. */
export function columnsOf(sql) {
  const s = String(sql || '');
  const open = s.indexOf('(');
  const close = s.lastIndexOf(')');
  if (open < 0 || close <= open) return [];
  const inner = s.slice(open + 1, close);
  const parts = [];
  let depth = 0, cur = '', quote = null;
  for (const ch of inner) {
    if (quote) { cur += ch; if (ch === quote) quote = null; continue; }
    if (ch === '"' || ch === "'" || ch === '`' || ch === '[') { quote = ch === '[' ? ']' : ch; cur += ch; continue; }
    if (ch === '(') depth++;
    if (ch === ')') depth--;
    if (ch === ',' && depth === 0) { parts.push(cur); cur = ''; continue; }
    cur += ch;
  }
  if (cur.trim()) parts.push(cur);
  const out = [];
  for (const p of parts) {
    const def = p.trim();
    if (!def) continue;
    if (/^(constraint|primary\s+key|unique|check|foreign\s+key)\b/i.test(def)) continue;
    const m = /^("([^"]|"")+"|`[^`]+`|\[[^\]]+\]|'([^']|'')+'|[^\s(]+)/.exec(def);
    if (!m) continue;
    let name = m[1];
    if (/^["'`[]/.test(name)) name = name.slice(1, -1).replace(/""/g, '"').replace(/''/g, "'");
    const rest = def.slice(m[1].length);
    out.push({ name, rowidAlias: /^\s*integer\s+primary\s+key\b/i.test(rest) && !/\bdesc\b/i.test(rest) });
  }
  return out;
}

export function openSqlite(bytes) {
  const b = bytes instanceof Uint8Array ? bytes : new Uint8Array(bytes);
  if (b.length < 100) throw new SqliteError('not-sqlite', 'The file is too small to be a database.');
  for (let i = 0; i < MAGIC.length; i++) if (b[i] !== MAGIC.charCodeAt(i)) throw new SqliteError('not-sqlite', 'This is not a SQLite database file.');
  const dv = new DataView(b.buffer, b.byteOffset, b.byteLength);
  let pageSize = dv.getUint16(16);
  if (pageSize === 1) pageSize = 65536;
  if (pageSize < 512 || (pageSize & (pageSize - 1)) !== 0) throw new SqliteError('corrupt', `Unexpected page size ${pageSize}.`);
  const reserved = b[20];
  const usable = pageSize - reserved;
  if (usable < 480) throw new SqliteError('corrupt', 'Unexpected reserved space.');
  const encoding = dv.getUint32(56) || 1;
  const decoder = new TextDecoder(encoding === 2 ? 'utf-16le' : encoding === 3 ? 'utf-16be' : 'utf-8', { fatal: false });
  const pageCount = Math.floor(b.length / pageSize);
  if (pageCount < 1) throw new SqliteError('corrupt', 'The file holds no complete page.');
  // a file cut short (copied while being written, or a partial download) still opens: pages past the end read as missing
  const truncated = b.length % pageSize !== 0;

  const pageStart = n => (n - 1) * pageSize;
  const checkPage = n => {
    if (!Number.isInteger(n) || n < 1 || n > pageCount) throw new SqliteError('corrupt', `Page ${n} is outside the file (it has ${pageCount}).`);
  };

  // payload of a table leaf cell, joined with its overflow pages
  function payload(page, cellAt) {
    let at = cellAt;
    const [len, l1] = readVarint(b, at); at += l1;
    const [rowid, l2] = readVarint(b, at); at += l2;
    if (len < 0 || len > 1_000_000_000) throw new SqliteError('corrupt', 'Unreasonable record size.');
    const X = usable - 35;
    if (len <= X) return { rowid, data: b.subarray(at, at + len) };
    const M = Math.floor(((usable - 12) * 32) / 255) - 23;
    const K = M + ((len - M) % (usable - 4));
    const local = K <= X ? K : M;
    const out = new Uint8Array(len);
    out.set(b.subarray(at, at + local), 0);
    let got = local;
    let next = dv.getUint32(at + local);
    const seen = new Set();
    while (got < len) {
      if (next === 0 || seen.has(next)) throw new SqliteError('corrupt', 'A record ends early (broken overflow chain).');
      seen.add(next);
      checkPage(next);
      const s = pageStart(next);
      const take = Math.min(usable - 4, len - got);
      out.set(b.subarray(s + 4, s + 4 + take), got);
      got += take;
      next = dv.getUint32(s);
    }
    return { rowid, data: out };
  }

  function decodeRecord(data) {
    const [hdrLen, l0] = readVarint(data, 0);
    let h = l0;
    const types = [];
    while (h < hdrLen) { const [t, l] = readVarint(data, h); types.push(t); h += l; }
    const ddv = new DataView(data.buffer, data.byteOffset, data.byteLength);
    let at = hdrLen;
    const vals = [];
    for (const t of types) {
      let v = null;
      let n = 0;
      switch (t) {
        case 0: v = null; break;
        case 1: v = ddv.getInt8(at); n = 1; break;
        case 2: v = ddv.getInt16(at); n = 2; break;
        case 3: v = (ddv.getUint8(at) << 16 | ddv.getUint16(at + 1)); if (v & 0x800000) v -= 0x1000000; n = 3; break;
        case 4: v = ddv.getInt32(at); n = 4; break;
        case 5: v = ddv.getInt16(at) * 0x100000000 + ddv.getUint32(at + 2); n = 6; break;
        case 6: v = Number(ddv.getBigInt64(at)); n = 8; break;
        case 7: v = ddv.getFloat64(at); n = 8; break;
        case 8: v = 0; break;
        case 9: v = 1; break;
        case 10: case 11: throw new SqliteError('corrupt', 'Reserved serial type in a record.');
        default:
          if (t % 2 === 0) { n = (t - 12) / 2; v = data.slice(at, at + n); }
          else { n = (t - 13) / 2; v = decoder.decode(data.subarray(at, at + n)); }
      }
      if (at + n > data.length) throw new SqliteError('corrupt', 'A record is shorter than its header says.');
      at += n;
      vals.push(v);
    }
    return vals;
  }

  // walk a table b-tree from its root page, calling fn(rowid, values) for each row, in rowid order. A row that cannot be
  // read (a cut-off file, a broken overflow chain) is counted in lost.rows and skipped; a missing page in lost.pages.
  function walk(root, fn, lost = { rows: 0, pages: 0 }) {
    const stack = [root];
    const seen = new Set();
    let visited = 0;
    while (stack.length) {
      const n = stack.pop();
      if (seen.has(n)) throw new SqliteError('corrupt', 'A page is linked twice in the same table.');
      seen.add(n);
      if (++visited > MAX_PAGES_VISITED) throw new SqliteError('corrupt', 'Too many pages.');
      if (truncated && n > pageCount) { lost.pages++; continue; }
      checkPage(n);
      const s = pageStart(n);
      const hs = n === 1 ? s + 100 : s;
      const kind = b[hs];
      const cells = dv.getUint16(hs + 3);
      if (kind === 0x0d) {
        const ptrs = hs + 8;
        for (let i = 0; i < cells; i++) {
          const off = dv.getUint16(ptrs + i * 2);
          if (off < 8 || off >= pageSize) throw new SqliteError('corrupt', 'A cell points outside its page.');
          let rec;
          try { const { rowid, data } = payload(n, s + off); rec = [rowid, decodeRecord(data)]; } catch (e) { if (e.code === 'corrupt' && n !== 1) { lost.rows++; continue; } throw e; }
          fn(rec[0], rec[1]);
        }
      } else if (kind === 0x05) {
        const ptrs = hs + 12;
        const right = dv.getUint32(hs + 8);
        // push in reverse so the leftmost child is read first
        stack.push(right);
        for (let i = cells - 1; i >= 0; i--) {
          const off = dv.getUint16(ptrs + i * 2);
          if (off < 12 || off >= pageSize) throw new SqliteError('corrupt', 'A cell points outside its page.');
          stack.push(dv.getUint32(s + off));
        }
      } else {
        throw new SqliteError('corrupt', `Page ${n} is not a table page.`);
      }
    }
  }

  const master = [];
  walk(1, (rowid, v) => master.push({ type: v[0], name: v[1], tbl_name: v[2], rootpage: v[3], sql: v[4] }));
  const tables = new Map();
  for (const r of master) if (r.type === 'table' && r.rootpage > 0) tables.set(String(r.name), r);

  return {
    pageSize,
    pageCount,
    truncated,
    encoding: encoding === 2 ? 'utf-16le' : encoding === 3 ? 'utf-16be' : 'utf-8',
    tables: () => [...tables.keys()],
    has: name => tables.has(name),
    columns: name => (tables.has(name) ? columnsOf(tables.get(name).sql).map(c => c.name) : []),
    lost: { rows: 0, pages: 0 },
    rows(name) {
      const t = tables.get(name);
      if (!t) return [];
      const cols = columnsOf(t.sql);
      const out = [];
      walk(t.rootpage, (rowid, vals) => {
        const row = {};
        cols.forEach((c, i) => { row[c.name] = c.rowidAlias ? rowid : (i < vals.length ? vals[i] : null); });
        out.push(row);
      }, this.lost);
      return out;
    },
  };
}
