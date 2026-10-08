/* Quilt Label Maker: list/CSV parsing and the Quilt of Valor label check. Pure functions (no DOM). */

export const MAX_ROWS = 500;

/** Parse pasted text or a CSV/TSV file into rows of cells. Handles quoted cells, "" escapes and CRLF. */
export function parseDelimited(text) {
  const src = String(text || '').replace(/^﻿/, '');
  const first = src.split(/\r?\n/).find(l => l.trim()) || '';
  const count = ch => { let n = 0, q = false; for (const c of first) { if (c === '"') q = !q; else if (!q && c === ch) n++; } return n; };
  const delim = ['\t', ',', ';'].map(d => [d, count(d)]).sort((a, b) => b[1] - a[1])[0];
  const d = delim[1] > 0 ? delim[0] : null;
  const rows = [];
  let row = [], cell = '', q = false;
  for (let i = 0; i < src.length; i++) {
    const c = src[i];
    if (q) {
      if (c === '"') { if (src[i + 1] === '"') { cell += '"'; i++; } else q = false; }
      else cell += c;
      continue;
    }
    if (c === '"' && cell.trim() === '') { q = true; cell = ''; continue; }
    if (d && c === d) { row.push(cell.trim()); cell = ''; continue; }
    if (c === '\n' || c === '\r') {
      if (c === '\r' && src[i + 1] === '\n') i++;
      row.push(cell.trim()); rows.push(row); row = []; cell = ''; continue;
    }
    cell += c;
  }
  row.push(cell.trim()); rows.push(row);
  const out = rows.filter(r => r.some(x => x !== ''));
  out.delimiter = d;
  return out;
}

const norm = s => String(s || '').toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim();

/* Column names people actually use in guild spreadsheets, mapped to the label fields. */
const QUILT_COLUMNS = {
  title: ['quilt name', 'quilt', 'title', 'quilt title', 'name of quilt', 'pattern'],
  for: ['made for', 'for', 'recipient', 'recipient name', 'given to', 'presented to', 'name', 'child', 'baby', 'awardee'],
  by: ['made by', 'maker', 'by', 'from', 'quilter', 'quilted by', 'pieced by', 'makers'],
  date: ['date', 'year', 'when', 'date made', 'finished'],
  place: ['place', 'location', 'city', 'where', 'made in', 'town'],
  message: ['message', 'note', 'notes', 'dedication', 'text', 'occasion'],
  care: ['care', 'washing', 'washing note', 'wash', 'care instructions', 'laundering', 'care note'],
};
const QOV_COLUMNS = {
  awardee: ['awarded to', 'awardee', 'recipient', 'veteran', 'name', 'presented to', 'service member', 'for'],
  piecer: ['pieced by', 'piecer', 'top by', 'top maker', 'made by', 'maker'],
  piecerState: ['pieced by state', 'piecer state', 'top maker state', 'maker state'],
  quilter: ['quilted by', 'quilter', 'longarm', 'longarmer', 'longarm quilter'],
  quilterState: ['quilted by state', 'quilter state', 'longarm state'],
  binder: ['bound by', 'binder', 'binding by', 'binding'],
  binderState: ['bound by state', 'binder state', 'binding state'],
  state: ['state'],
  date: ['date', 'date awarded', 'award date', 'awarded on', 'when'],
  place: ['place', 'location', 'award location', 'where', 'city'],
  message: ['message', 'note', 'notes', 'dedication', 'gratitude'],
  care: ['care', 'washing', 'washing note', 'wash', 'laundering'],
  donor: ['donated by', 'label donated by', 'printing donated by', 'sponsor'],
};

/** Match a header row to fields. Returns { map: {colIndex: field}, isHeader } */
export function mapHeader(row, kind = 'quilt') {
  const cols = kind === 'qov' ? QOV_COLUMNS : QUILT_COLUMNS;
  const map = {};
  const used = new Set();
  row.forEach((cell, i) => {
    const n = norm(cell);
    if (!n) return;
    for (const [field, names] of Object.entries(cols)) {
      if (used.has(field)) continue;
      if (names.includes(n)) { map[i] = field; used.add(field); return; }
    }
  });
  return { map, isHeader: Object.keys(map).length > 0 };
}

/**
 * Turn pasted text into a list of label field objects.
 * - With a header row (Quilt name, Made for, Date...), every column fills its field.
 * - Without one, each line is one label: the first cell fills "made for" (or the awardee), a second cell the quilt name.
 * Empty cells fall back to the template (the label on screen).
 */
export function rowsToLabels(text, kind = 'quilt', template = {}) {
  const rows = parseDelimited(text);
  if (!rows.length) return { labels: [], header: null, truncated: false };
  const head = mapHeader(rows[0], kind);
  let body = rows, map;
  if (head.isHeader) { body = rows.slice(1); map = head.map; }
  else if (rows.delimiter === '\t') map = kind === 'qov' ? { 0: 'awardee', 1: 'date', 2: 'place' } : { 0: 'for', 1: 'title', 2: 'date' };
  else {
    // A plain list: one label per line, and commas belong to the text ("Bennett, Ruth" or "Ruth Bennett, Iowa").
    body = String(text || '').split(/\r?\n/).map(l => l.trim()).filter(Boolean).map(l => [l.replace(/^"(.*)"$/, '$1')]);
    map = { 0: kind === 'qov' ? 'awardee' : 'for' };
  }
  const truncated = body.length > MAX_ROWS;
  const labels = body.slice(0, MAX_ROWS).map(r => {
    const f = { ...template };
    for (const [i, field] of Object.entries(map)) {
      const v = (r[i] || '').trim();
      if (!v) continue;
      if (field === 'state') { for (const k of ['piecerState', 'quilterState', 'binderState']) if (!rowHas(r, map, k)) f[k] = v; continue; }
      f[field] = v;
    }
    return f;
  });
  return { labels, header: head.isHeader ? Object.values(map) : null, truncated };
}
function rowHas(r, map, field) {
  const i = Object.keys(map).find(k => map[k] === field);
  return i != null && (r[i] || '').trim() !== '';
}

/* ------------------------------------------------------------------ Quilt of Valor check
 * Source: Quilts of Valor Foundation Policies & Procedures Manual (27 August 2026), section 8.10 Label,
 * and the QOVF FAQ "Quilt Labels" (updated 13 July 2020). */
const RELIGIOUS = /\b(god|god's|lord|jesus|christ|bless|blessed|blessing|blessings|pray|prayer|prayers|praying|amen|church|psalms?|bible|scripture|heaven|heavenly)\b/i;
const POLITICAL = /\b(trump|biden|harris|obama|vance|democrats?|democratic|republicans?|gop|maga|vote|voting|election|liberals?|conservatives?|congress(man|woman)?|senator|president)\b/i;
const ADVERT = /(https?:\/\/|www\.|\.com\b|\.net\b|\.shop\b|\bllc\b|\binc\b|\bcall us\b|\bdiscount\b|\bcoupon\b|\bon sale\b|\bvisit us\b)/i;

/** Returns the items QOVF requires, each with ok:true/false, plus wording flags. */
export function checkQov(f) {
  const has = v => String(v || '').trim().length > 0;
  const items = [
    { id: 'words', label: 'The words “Quilt of Valor”', ok: true },
    { id: 'awardee', label: has(f.awardee) ? 'The awardee’s name' : 'A space for the awardee’s name (a line to write on)', ok: true },
    { id: 'piecer', label: 'Who pieced the top', ok: has(f.piecer) },
    { id: 'quilter', label: 'Who quilted it', ok: has(f.quilter) },
    { id: 'binder', label: 'Who bound it', ok: has(f.binder) },
  ];
  const notes = [];
  const missingState = ['piecer', 'quilter', 'binder'].filter(k => has(f[k]) && !has(f[k + 'State']));
  if (missingState.length) notes.push({ level: 'info', text: 'QOVF’s label FAQ also asks for each maker’s state. The 2026 manual asks only for names or initials.' });
  const free = [f.message, f.care, f.place, f.date].filter(has).join(' \n ');
  const rel = free.match(RELIGIOUS), pol = free.match(POLITICAL), ad = free.match(ADVERT);
  if (rel) notes.push({ level: 'warn', text: `Check “${rel[0]}”: QOVF labels can’t carry a religious message.` });
  if (pol) notes.push({ level: 'warn', text: `Check “${pol[0]}”: QOVF labels can’t carry a political message.` });
  if (ad) notes.push({ level: 'warn', text: `Check “${ad[0]}”: QOVF labels can’t carry advertising. Thanking whoever donated the printing is allowed.` });
  const donor = String(f.donor || '');
  if (ADVERT.test(donor)) notes.push({ level: 'warn', text: 'Keep the donor line to a name. A web address or offer counts as advertising.' });
  return { ok: items.every(i => i.ok), items, notes };
}

/** Join makers who did several jobs: "Pieced and bound by Ann Lee, Ohio" + "Quilted by Bo Park, Iowa". */
export function qovMakerLines(f) {
  const roles = [['piecer', 'Pieced'], ['quilter', 'quilted'], ['binder', 'bound']];
  const groups = [];
  for (const [k, verb] of roles) {
    const name = String(f[k] || '').trim();
    if (!name) continue;
    const st = String(f[k + 'State'] || '').trim();
    const key = (name + '|' + st).toLowerCase();
    const g = groups.find(x => x.key === key);
    if (g) g.verbs.push(verb.toLowerCase()); else groups.push({ key, name, state: st, verbs: [verb.toLowerCase()] });
  }
  return groups.map(g => {
    const v = g.verbs.length === 1 ? g.verbs[0] : g.verbs.length === 2 ? `${g.verbs[0]} and ${g.verbs[1]}` : `${g.verbs[0]}, ${g.verbs[1]} and ${g.verbs[2]}`;
    return { lead: v.charAt(0).toUpperCase() + v.slice(1) + ' by', name: g.state ? `${g.name}, ${g.state}` : g.name };
  });
}
