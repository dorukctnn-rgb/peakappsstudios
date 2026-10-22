/* The CSV reader for Oura's export. The files are separated by semicolons (a comma or tab file is read too), JSON sits
 * inside cells with its quotes doubled, a whole line is sometimes wrapped in quotes, and in dailyactivity.csv and
 * sleepmodel.csv a row can hold fewer cells than the header, the missing ones being the first columns (documented by
 * Cracked Oura's ingestion code and harbour-ourasync). Columns are found by name, so a column Oura adds later is ignored
 * and a missing one is simply empty. Text is fed in pieces (push), so a file of any size is read without holding it
 * whole. */

// One line into cells. Quotes may open anywhere in a cell; "" inside quotes is one quote.
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

// true when the line ends inside an open quote (a cell that runs on to the next line)
function openQuote(line) {
  let q = false;
  for (let i = 0; i < line.length; i++) if (line[i] === '"') q = !q;
  return q;
}

export function sniffDelimiter(headerLine) {
  const n = ch => headerLine.split(ch).length - 1;
  const c = [[';', n(';')], ['\t', n('\t')], [',', n(',')]].sort((a, b) => b[1] - a[1]);
  return c[0][1] > 0 ? c[0][0] : ';';
}

const DAY_RE = /^\d{4}-\d{2}-\d{2}$/;
const TS_RE = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}/;

// Streams rows as objects keyed by header name. opts.onRow(obj), opts.onHeader(cols).
export class CsvStream {
  constructor(opts) {
    this.onRow = opts.onRow;
    this.onHeader = opts.onHeader || (() => {});
    this.d = opts.delimiter || null;
    this.header = null;
    this.buf = '';
    this.pending = '';
    this.rows = 0;
    this.bad = 0;
    this.short = 0;
  }
  push(text) {
    this.buf += text;
    let nl;
    let from = 0;
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
      let h = line.replace(/^﻿/, '');
      if (!this.d) this.d = sniffDelimiter(h);
      let cols = splitLine(h, this.d);
      if (cols.length === 1 && h.startsWith('"') && h.includes(this.d)) cols = splitLine(cols[0], this.d);
      this.header = cols.map(c => c.trim().replace(/^"|"$/g, '').toLowerCase());
      this.onHeader(this.header);
      return;
    }
    let cells = splitLine(line, this.d);
    const H = this.header;
    // a whole line wrapped in quotes: the first pass gives one cell holding the real line
    if (cells.length === 1 && H.length > 1 && cells[0].includes(this.d)) cells = splitLine(cells[0], this.d);
    if (cells.length < H.length) {
      this.short++;
      cells = this.align(cells);
    }
    const o = {};
    for (let i = 0; i < H.length; i++) o[H[i]] = cells[i] === undefined ? '' : cells[i];
    this.rows++;
    try { this.onRow(o); } catch (e) { this.bad++; }
  }
  // Fewer cells than the header: try the cells at the end (the first columns missing) and at the start, and keep the
  // one where the day or timestamp column reads as a date.
  align(cells) {
    const H = this.header, gap = H.length - cells.length;
    const right = new Array(gap).fill('').concat(cells);
    const left = cells.concat(new Array(gap).fill(''));
    const score = arr => {
      let s = 0;
      for (let i = 0; i < H.length; i++) {
        const v = arr[i] || '';
        if (H[i] === 'day' || H[i].endsWith('_day')) s += DAY_RE.test(v) ? 2 : v ? -2 : 0;
        else if (H[i] === 'timestamp' || H[i].startsWith('bedtime_') || H[i].endsWith('_datetime')) s += TS_RE.test(v) ? 1 : v ? -1 : 0;
      }
      return s;
    };
    return score(right) >= score(left) ? right : left;
  }
}

// Parses a whole text at once (small files and tests).
export function parseCsv(text) {
  const rows = [];
  const s = new CsvStream({ onRow: r => rows.push(r) });
  s.push(text);
  s.end();
  return { header: s.header || [], rows, stream: s };
}

// A JSON cell: {"deep_sleep": 95, ...} or {"interval": 300.0, "items": [...]}. Python spellings (None, True, False, NaN)
// are accepted, and a cell that is not JSON gives null.
export function jsonCell(v) {
  if (v === undefined || v === null) return null;
  let s = String(v).trim();
  if (!s || s === 'null' || s === 'None' || s === 'nan' || s === 'NaN') return null;
  if (s[0] !== '{' && s[0] !== '[') return null;
  try { return JSON.parse(s); } catch (e) { /* try the Python spelling */ }
  try {
    s = s.replace(/'/g, '"').replace(/\bNone\b/g, 'null').replace(/\bTrue\b/g, 'true').replace(/\bFalse\b/g, 'false').replace(/\bNaN\b/g, 'null');
    return JSON.parse(s);
  } catch (e) { return null; }
}

export function num(v) {
  if (v === undefined || v === null) return null;
  const s = String(v).trim();
  if (!s || s === 'None' || s === 'null' || s === 'nan' || s === 'NaN') return null;
  const n = Number(s);
  return Number.isFinite(n) ? n : null;
}

export function bool(v) {
  const s = String(v || '').trim().toLowerCase();
  return s === 'true' || s === '1' ? true : s === 'false' || s === '0' ? false : null;
}

export function dayOf(v) {
  const s = String(v || '').trim().replace(/"/g, '');
  const m = s.match(/^(\d{4}-\d{2}-\d{2})/);
  return m ? m[1] : null;
}
