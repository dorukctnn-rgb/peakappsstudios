
/* Parses CSV text into { header: [...], rows: [[...], ...] }. A byte order mark at the start is dropped, CRLF and LF both
 * end a row, and a trailing empty line adds no row. */
export function parseCsv(text) {
  let s = String(text ?? '');
  if (s.charCodeAt(0) === 0xfeff) s = s.slice(1);
  const rows = [];
  let row = [];
  let field = '';
  let quoted = false;
  let i = 0;
  const n = s.length;
  while (i < n) {
    const c = s[i];
    if (quoted) {
      if (c === '"') {
        if (s[i + 1] === '"') { field += '"'; i += 2; continue; }
        quoted = false; i++; continue;
      }
      field += c; i++; continue;
    }
    if (c === '"' && field === '') { quoted = true; i++; continue; }
    if (c === ',') { row.push(field); field = ''; i++; continue; }
    if (c === '\r' || c === '\n') {
      row.push(field); field = '';
      rows.push(row); row = [];
      if (c === '\r' && s[i + 1] === '\n') i++;
      i++; continue;
    }
    field += c; i++;
  }
  if (field !== '' || row.length) { row.push(field); rows.push(row); }
  const clean = rows.filter(r => !(r.length === 1 && r[0] === ''));
  const header = (clean.shift() || []).map(h => h.trim());
  return { header, rows: clean };
}

/* The rows as objects keyed by the header names. A short row gets empty strings for the missing fields. */
export function csvObjects(text) {
  const { header, rows } = parseCsv(text);
  return { header, records: rows.map(r => Object.fromEntries(header.map((h, k) => [h, r[k] ?? '']))) };
}

/* Writes rows as CSV for a spreadsheet: every field quoted when it needs to be, CRLF line ends, and a byte order mark
 * so Excel reads accents and emoji as UTF-8. A field that starts with = + - or @ gets a leading apostrophe, so a
 * spreadsheet never runs text from the export as a formula. */
export function toCsv(header, rows, { bom = true } = {}) {
  const cell = v => {
    let t = v == null ? '' : String(v);
    if (/^[=+\-@\t\r]/.test(t)) t = `'${t}`;
    return /[",\r\n]/.test(t) ? `"${t.replace(/"/g, '""')}"` : t;
  };
  const lines = [header, ...rows].map(r => r.map(cell).join(','));
  return (bom ? String.fromCharCode(0xfeff) : '') + lines.join('\r\n') + '\r\n';
}
