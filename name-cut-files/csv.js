/* Name Cut Files: CSV reading and Etsy "Sold Order Items" name extraction (Peak Apps Tools).
 * Works in the browser (window.NameCutCSV) and in Node (module.exports) for the tests.
 *
 * Etsy puts every listing option and the buyer's personalization in one "Variations" cell:
 *   "Color:White,Size:S,Personalization:Ashley"
 *   "Ornament:Snowflake,Personalization:Name: Jessica-Marie, Font 2"
 * The personalization is free text, so it can hold commas, colons and line breaks of its own.
 * It runs to the end of the cell unless a later key is one that shows up as a real option
 * elsewhere in the file (before a personalization, or in rows without one).
 */
(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory();
  else root.NameCutCSV = factory();
})(typeof self !== 'undefined' ? self : this, function () {
  'use strict';

  // ---------- CSV ----------
  function detectDelimiter(text) {
    const counts = { ',': 0, ';': 0, '\t': 0 };
    let q = false;
    for (let i = 0; i < text.length && i < 20000; i++) {
      const c = text[i];
      if (c === '"') q = !q;
      else if (!q && (c === '\n' || c === '\r')) break;
      else if (!q && c in counts) counts[c]++;
    }
    let best = ',';
    for (const k of Object.keys(counts)) if (counts[k] > counts[best]) best = k;
    return best;
  }

  // RFC 4180: quoted fields may hold the delimiter, line breaks and "" for a quote.
  // A quote in the middle of an unquoted field is kept as text, which is what spreadsheet apps do.
  function parseCSV(text, delim) {
    text = String(text || '').replace(/^﻿/, '');
    delim = delim || detectDelimiter(text);
    const rows = [];
    let row = [], field = '', q = false, i = 0, quoted = false;
    const n = text.length;
    while (i < n) {
      const c = text[i];
      if (q) {
        if (c === '"') {
          if (text[i + 1] === '"') { field += '"'; i += 2; continue; }
          q = false; i++; continue;
        }
        field += c; i++; continue;
      }
      if (c === '"' && field === '' && !quoted) { q = true; quoted = true; i++; continue; }
      if (c === delim) { row.push(field); field = ''; quoted = false; i++; continue; }
      if (c === '\r' || c === '\n') {
        row.push(field); rows.push(row); row = []; field = ''; quoted = false;
        if (c === '\r' && text[i + 1] === '\n') i++;
        i++; continue;
      }
      field += c; i++;
    }
    if (field !== '' || row.length) { row.push(field); rows.push(row); }
    return rows.filter(r => r.some(c => String(c).trim() !== ''));
  }

  // ---------- text clean-up ----------
  const ENT = { amp: '&', lt: '<', gt: '>', quot: '"', apos: "'", nbsp: ' ', rsquo: '’', lsquo: '‘', ldquo: '“', rdquo: '”' };
  function decodeEntities(s) {
    return String(s).replace(/&(#x[0-9a-f]+|#\d+|[a-z]+);/gi, (m, e) => {
      if (e[0] === '#') {
        const cp = e[1] === 'x' || e[1] === 'X' ? parseInt(e.slice(2), 16) : parseInt(e.slice(1), 10);
        return isFinite(cp) && cp > 0 && cp < 0x110000 ? String.fromCodePoint(cp) : m;
      }
      const v = ENT[e.toLowerCase()];
      return v != null ? v : m;
    });
  }
  const PERS_RE = /^(personali[sz]ation|personnalisation|personalisierung|personalizaci[oó]n|personalizzazione|personalisatie|personaliza[cç][aã]o)\b/i;
  const isPersonalizationKey = k => PERS_RE.test(String(k).trim());
  const NOT_REQUESTED = /^(not requested on this item\.?|keine personalisierung|aucune personnalisation|no personalization|n\/?a|none|-)$/i;
  // "Name: Emma", "Names - Emma", "Child's name = Emma", "1st name: Emma"
  const LABEL_RE = /^(?:(?:first|1st|2nd|3rd|child'?s?|kid'?s?|baby'?s?|pet'?s?|dog'?s?|cat'?s?|full|last|family|ornament|stocking|personali[sz]ed)\s+)?(?:name|names|text|wording)\s*(?:\d+\s*)?[:=\-–]\s*/i;

  function cleanName(s, { stripLabels = true } = {}) {
    let t = decodeEntities(s).replace(/[​-‍﻿]/g, '').replace(/\s+/g, ' ').trim();
    if (stripLabels) t = t.replace(LABEL_RE, '').trim();
    t = t.replace(/^["'“”‘’]+|["'“”‘’]+$/g, '').trim();
    return t;
  }

  // split one personalization into names: line breaks always, and optionally commas, semicolons, " & ", " and ", " / "
  function splitNames(s, mode) {
    const text = decodeEntities(String(s || ''));
    if (mode === 'none') return [text];
    let parts = text.split(/\r\n|\r|\n|\\n/);
    if (mode === 'all') parts = parts.flatMap(p => p.split(/\s*[,;|/]\s*|\s+&\s+|\s+and\s+|\s+\+\s+/i));
    return parts;
  }

  // ---------- Etsy Variations ----------
  const KEY_RE = /(^|,)\s*([^,:\r\n]{1,48}?)\s*:/g;
  function variationMarks(str) {
    const marks = [];
    KEY_RE.lastIndex = 0;
    let m;
    while ((m = KEY_RE.exec(str))) {
      const key = m[2].trim();
      if (!key) continue;
      marks.push({ key, start: m.index + m[1].length, valueStart: KEY_RE.lastIndex });
    }
    return marks;
  }
  // keys that are real listing options: seen before a personalization in some row, or in rows without one
  function learnKeys(cells) {
    const known = new Set();
    for (const cell of cells) {
      const marks = variationMarks(cell || '');
      for (const mk of marks) {
        if (isPersonalizationKey(mk.key)) break;
        known.add(mk.key.toLowerCase());
      }
    }
    return known;
  }
  function parseVariations(str, known) {
    str = String(str || '');
    const marks = variationMarks(str);
    const out = [];
    if (!marks.length) return str.trim() ? [{ key: '', value: str.trim() }] : out;
    let inPers = false, cur = null;
    for (const mk of marks) {
      const boundary = !cur || !inPers || (known && known.has(mk.key.toLowerCase()) && !isPersonalizationKey(mk.key));
      if (!boundary) continue;
      if (cur) cur.end = mk.start - 1;   // the comma before this key
      cur = { key: mk.key, valueStart: mk.valueStart, end: str.length };
      out.push(cur);
      inPers = isPersonalizationKey(mk.key);
    }
    return out.map(p => ({ key: p.key, value: str.slice(p.valueStart, p.end).trim() }));
  }

  // ---------- table analysis ----------
  const norm = h => String(h || '').trim().toLowerCase().replace(/\s+/g, ' ');
  function findCol(header, names) {
    for (const n of names) { const i = header.findIndex(h => norm(h) === n); if (i > -1) return i; }
    return -1;
  }

  // Look at a parsed table: find the header, the Etsy columns and every field a name could come from.
  function analyze(rows) {
    if (!rows || !rows.length) return { ok: false, reason: 'empty' };
    // header = first row with at least two non-empty cells
    const hIdx = rows.findIndex(r => r.filter(c => String(c).trim()).length >= 2);
    const header = (rows[hIdx >= 0 ? hIdx : 0]).map(h => String(h).trim());
    const data = rows.slice((hIdx >= 0 ? hIdx : 0) + 1);
    const col = {
      variations: findCol(header, ['variations', 'variation', 'item options', 'options']),
      personalization: findCol(header, ['personalization', 'personalisation', 'personalization text']),
      order: findCol(header, ['order id', 'order number', 'order', 'order #', 'receipt id']),
      qty: findCol(header, ['quantity', 'qty']),
      item: findCol(header, ['item name', 'title', 'product', 'listing title']),
      buyer: findCol(header, ['buyer', 'buyer user id']),
      shipName: findCol(header, ['ship name', 'full name', 'name']),
      date: findCol(header, ['sale date', 'order date', 'date']),
    };
    const isEtsy = col.variations > -1 && (col.order > -1 || col.item > -1) && findCol(header, ['transaction id', 'listing id']) > -1;
    const cells = col.variations > -1 ? data.map(r => r[col.variations] || '') : [];
    const known = learnKeys(cells);
    const variations = data.map((r, i) => parseVariations(cells[i] || '', known));
    // fields offered to the user: variation keys first (most used first), then the plain columns
    const keyUse = new Map();
    variations.forEach(vs => vs.forEach(v => { if (v.key) keyUse.set(v.key, (keyUse.get(v.key) || 0) + 1); }));
    const fields = [];
    [...keyUse.entries()].sort((a, b) => b[1] - a[1]).forEach(([k, n]) => fields.push({ id: 'var:' + k, label: k, kind: 'var', key: k, count: n }));
    header.forEach((h, i) => {
      if (i === col.variations) return;
      const n = data.filter(r => String(r[i] || '').trim()).length;
      if (n) fields.push({ id: 'col:' + i, label: h || `Column ${i + 1}`, kind: 'col', index: i, count: n });
    });
    // best guess: personalization option, then a personalization column, then any field with "name" in it
    let guess = fields.find(f => f.kind === 'var' && isPersonalizationKey(f.key))
      || fields.find(f => f.kind === 'col' && f.index === col.personalization)
      || fields.find(f => f.kind === 'var' && /name/i.test(f.key))
      || fields.find(f => f.kind === 'col' && /^(names?|first name|child.?s name)$/i.test(f.label))
      || fields[0];
    const orders = col.order > -1 ? new Set(data.map(r => r[col.order]).filter(Boolean)).size : 0;
    return { ok: true, isEtsy, header, rows: data, col, variations, fields, guess: guess ? guess.id : null, orders };
  }

  // Pull the names out of an analysed table.
  // opts: { field: 'var:Personalization' | 'col:3', split: 'lines' | 'all' | 'none', repeatQty: true, stripLabels: true }
  function extractNames(an, opts) {
    opts = Object.assign({ split: 'lines', repeatQty: true, stripLabels: true }, opts);
    const field = an.fields.find(f => f.id === opts.field) || an.fields.find(f => f.id === an.guess);
    const names = [];
    let skipped = 0;
    if (!field) return { names, skipped };
    an.rows.forEach((r, i) => {
      let raw = '';
      if (field.kind === 'var') { const v = an.variations[i].find(x => x.key === field.key); raw = v ? v.value : ''; }
      else raw = r[field.index] || '';
      const whole = cleanName(raw, { stripLabels: false });
      if (!whole || NOT_REQUESTED.test(whole)) { if (String(raw).trim()) skipped++; return; }
      const qty = Math.max(1, Math.min(99, parseInt(an.col.qty > -1 ? r[an.col.qty] : '1', 10) || 1));
      const order = an.col.order > -1 ? String(r[an.col.order] || '').trim() : '';
      const parts = splitNames(raw, opts.split).map(p => cleanName(p, opts)).filter(p => p && !NOT_REQUESTED.test(p));
      for (let q = 0; q < (opts.repeatQty ? qty : 1); q++) parts.forEach(p => names.push({ text: p, order, row: i }));
    });
    return { names, skipped, field };
  }

  return { detectDelimiter, parseCSV, decodeEntities, cleanName, splitNames, parseVariations, learnKeys, isPersonalizationKey, analyze, extractNames };
});
