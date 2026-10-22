/* The CSV reader for the Samsung Health export. Each file starts with one line about the file itself
 * ("com.samsung.health.weight,6315006,9": data type, version, column count), then the header, then the rows. Some data
 * types name their columns with the data type in front ("com.samsung.health.heart_rate.start_time"); the reader keeps
 * the short name ("start_time"). Rows usually end with one extra empty cell, cells can hold JSON or text in quotes, and
 * the first byte can be a byte order mark. Older exports have no first line, and a file saved again by a spreadsheet
 * can use semicolons. Columns are found by name, so a column Samsung adds later is ignored and a missing one is simply
 * empty. Text is fed in pieces (push), so a file of any size is read without holding it whole. */

export function splitLine(line, d) {
  if (line.indexOf('"') < 0) return line.split(d);
  const out = [];
  let cur = '', q = false;
  for (let i = 0; i < line.length; i++) {
    const c = line[i];
    if (q) {
      if (c === '"') { if (line[i + 1] === '"') { cur += '"'; i++; } else q = false; }
      else cur += c;
    } else if (c === '"') q = true;
    else if (c === d) { out.push(cur); cur = ''; }
    else cur += c;
  }
  out.push(cur);
  return out;
}

function openQuote(line) {
  let q = false;
  for (let i = 0; i < line.length; i++) if (line[i] === '"') q = !q;
  return q;
}

export function sniffDelimiter(line) {
  const n = ch => line.split(ch).length - 1;
  const c = [[',', n(',')], [';', n(';')], ['\t', n('\t')]].sort((a, b) => b[1] - a[1]);
  return c[0][1] > 0 ? c[0][0] : ',';
}

// "com.samsung.health.weight,6315006,9" or "com.samsung.shealth.step_daily_trend,7006003,6.30.2"
const META_RE = /^\uFEFF?"?(com\.samsung\.[a-z0-9_.]+)"?\s*[,;\t]\s*"?(\d+)"?\s*[,;\t]\s*"?([\d.]+)"?\s*[,;\t]?\s*$/i;
export const isMetaLine = line => META_RE.test(line.trim());

// "com.samsung.health.heart_rate.start_time" -> "start_time"; plain names are only lower-cased
export function shortName(col) {
  const c = String(col || '').trim().replace(/^\uFEFF/, '').replace(/^"|"$/g, '').toLowerCase();
  if (/^com\.samsung\./.test(c)) return c.slice(c.lastIndexOf('.') + 1);
  return c;
}

export class CsvStream {
  constructor(opts) {
    this.onRow = opts.onRow;
    this.onHeader = opts.onHeader || (() => {});
    this.d = opts.delimiter || null;
    this.meta = null;
    this.header = null;
    this.buf = '';
    this.pending = '';
    this.rows = 0;
    this.bad = 0;
  }
  push(text) {
    this.buf += text;
    let nl, from = 0;
    while ((nl = this.buf.indexOf('\n', from)) >= 0) {
      let line = this.buf.slice(from, nl);
      from = nl + 1;
      if (line.endsWith('\r')) line = line.slice(0, -1);
      this.line(line);
    }
    this.buf = this.buf.slice(from);
  }
  end() {
    if (this.buf) { const l = this.buf.endsWith('\r') ? this.buf.slice(0, -1) : this.buf; this.buf = ''; this.line(l); }
    if (this.pending) { const p = this.pending; this.pending = ''; this.record(p); }
  }
  line(line) {
    if (this.pending) {
      this.pending += '\n' + line;
      if (openQuote(this.pending)) return;
      line = this.pending;
      this.pending = '';
    } else if (line.indexOf('"') >= 0 && openQuote(line)) { this.pending = line; return; }
    this.record(line);
  }
  record(line) {
    if (!line.trim()) return;
    if (!this.header) {
      const h = line.replace(/^\uFEFF/, '');
      const m = !this.meta && h.trim().match(META_RE);
      if (m) { this.meta = { type: m[1].toLowerCase(), version: m[2], cols: m[3] }; return; }
      if (!this.d) this.d = sniffDelimiter(h);
      const cols = splitLine(h, this.d).map(shortName);
      // a full and a short spelling of the same column: the first one wins
      this.header = cols.map((c, i) => (c && cols.indexOf(c) === i ? c : ''));
      this.onHeader(this.header);
      return;
    }
    const cells = splitLine(line, this.d);
    const H = this.header;
    const o = {};
    for (let i = 0; i < H.length; i++) if (H[i]) o[H[i]] = cells[i] === undefined ? '' : cells[i].trim();
    this.rows++;
    try { if (!this.onRow(o)) this.bad++; } catch (e) { this.bad++; }
  }
}

export function parseCsv(text) {
  const rows = [];
  const s = new CsvStream({ onRow: r => { rows.push(r); return true; } });
  s.push(text);
  s.end();
  return { header: s.header || [], meta: s.meta, rows };
}

// A number cell. Empty, "null", "NaN" and Samsung's -1 sentinel give null; a decimal comma ("72,5") is read as 72.5.
export function num(v) {
  if (v === undefined || v === null) return null;
  let s = String(v).trim();
  if (!s || /^(null|none|nan|undefined)$/i.test(s)) return null;
  if (/^-?\d+,\d+$/.test(s)) s = s.replace(',', '.');
  const n = Number(s);
  return Number.isFinite(n) ? n : null;
}
