/* Tallyband Pro's Excel file, made in this tab (adapted from Wristory). An .xlsx is a ZIP of a few XML files: one sheet per
 * table, the header row bold and frozen, a filter on it, dates and times as real Excel dates so they sort and filter,
 * numbers as numbers. A sheet holds at most 1,048,575 rows (Excel's limit); longer tables are cut and say so in their name.
 * Nothing is sent anywhere. */
import { zipSync, strToU8 } from '../vendor/fflate.js';

export const MAX_ROWS = 1048575;
const x = s => String(s).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c])).replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f]/g, '');
export const colName = i => { let s = ''; i++; while (i) { const m = (i - 1) % 26; s = String.fromCharCode(65 + m) + s; i = Math.floor((i - 1) / 26); } return s; };
const DAY = /^(\d{4})-(\d{2})-(\d{2})$/, DT = /^(\d{4})-(\d{2})-(\d{2}) (\d{2}):(\d{2})(?::(\d{2}))?$/, HMS = /^(\d{2}):(\d{2}):(\d{2})$/;
const serial = (y, mo, d, h = 0, mi = 0, s = 0) => Date.UTC(+y, +mo - 1, +d, +h, +mi, +s) / 864e5 + 25569;

function cell(ref, v) {
  if (v === null || v === undefined || v === '') return '';
  if (typeof v === 'number' && Number.isFinite(v)) return `<c r="${ref}"><v>${v}</v></c>`;
  const s = String(v);
  let m;
  if ((m = s.match(DAY))) return `<c r="${ref}" s="2"><v>${serial(m[1], m[2], m[3])}</v></c>`;
  if ((m = s.match(DT))) return `<c r="${ref}" s="3"><v>${serial(m[1], m[2], m[3], m[4], m[5], m[6] || 0).toFixed(6)}</v></c>`;
  if ((m = s.match(HMS))) return `<c r="${ref}" s="4"><v>${((+m[1] * 3600 + +m[2] * 60 + +m[3]) / 86400).toFixed(6)}</v></c>`;
  return `<c r="${ref}" t="inlineStr"><is><t xml:space="preserve">${x(s)}</t></is></c>`;
}

function sheetXml(cols, rows) {
  const last = colName(cols.length - 1) + (rows.length + 1);
  const widths = cols.map(c => Math.min(42, Math.max(10, c.length + 2, ...rows.slice(0, 200).map(r => String(r[c] == null ? '' : r[c]).length + 2))));
  const out = ['<?xml version="1.0" encoding="UTF-8" standalone="yes"?>\n<worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main">'];
  out.push('<sheetViews><sheetView workbookViewId="0"><pane ySplit="1" topLeftCell="A2" activePane="bottomLeft" state="frozen"/></sheetView></sheetViews>');
  out.push(`<cols>${widths.map((w, i) => `<col min="${i + 1}" max="${i + 1}" width="${w}" customWidth="1"/>`).join('')}</cols>`);
  out.push('<sheetData>');
  out.push(`<row r="1">${cols.map((c, i) => `<c r="${colName(i)}1" t="inlineStr" s="1"><is><t>${x(c)}</t></is></c>`).join('')}</row>`);
  rows.forEach((r, k) => { out.push(`<row r="${k + 2}">${cols.map((c, i) => cell(colName(i) + (k + 2), r[c])).join('')}</row>`); });
  out.push(`</sheetData><autoFilter ref="A1:${last}"/></worksheet>`);
  return out.join('');
}

const safeName = (s, used) => {
  let n = String(s).replace(/[\[\]:*?/\\]/g, ' ').slice(0, 31) || 'Sheet';
  let k = 2;
  while (used.has(n.toLowerCase())) n = `${n.slice(0, 28)} ${k++}`;
  used.add(n.toLowerCase());
  return n;
};
const columnsOf = rows => { const seen = new Set(), cols = []; for (const r of rows.slice(0, 5000)) for (const k of Object.keys(r)) if (!seen.has(k)) { seen.add(k); cols.push(k); } return cols; };

// sheets: [{ name, rows: [{column: value}] }] -> Uint8Array (.xlsx bytes)
export function writeXlsx(sheets) {
  const used = new Set();
  const list = sheets.filter(s => s.rows.length).map(s => {
    const cut = s.rows.length > MAX_ROWS;
    return { name: safeName(cut ? `${s.name.slice(0, 24)} (cut)` : s.name, used), rows: cut ? s.rows.slice(0, MAX_ROWS) : s.rows, cols: columnsOf(s.rows) };
  });
  if (!list.length) list.push({ name: 'Nothing in range', rows: [{ note: 'No rows fall between the dates you chose.' }], cols: ['note'] });
  const files = {
    '[Content_Types].xml': '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>\n<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/><Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/><Override PartName="/xl/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.styles+xml"/>'
      + list.map((s, i) => `<Override PartName="/xl/worksheets/sheet${i + 1}.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/>`).join('') + '</Types>',
    '_rels/.rels': '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>\n<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="xl/workbook.xml"/></Relationships>',
    'xl/workbook.xml': '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>\n<workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"><sheets>'
      + list.map((s, i) => `<sheet name="${x(s.name)}" sheetId="${i + 1}" r:id="rId${i + 1}"/>`).join('') + '</sheets>'
      + `<definedNames>${list.map((s, i) => `<definedName name="_xlnm._FilterDatabase" localSheetId="${i}" hidden="1">'${x(s.name).replace(/'/g, "''")}'!$A$1:$${colName(s.cols.length - 1)}$${s.rows.length + 1}</definedName>`).join('')}</definedNames></workbook>`,
    'xl/_rels/workbook.xml.rels': '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>\n<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">'
      + list.map((s, i) => `<Relationship Id="rId${i + 1}" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet${i + 1}.xml"/>`).join('')
      + `<Relationship Id="rId${list.length + 1}" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/styles" Target="styles.xml"/></Relationships>`,
    'xl/styles.xml': '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>\n<styleSheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main"><numFmts count="3"><numFmt numFmtId="164" formatCode="yyyy\\-mm\\-dd"/><numFmt numFmtId="165" formatCode="yyyy\\-mm\\-dd hh:mm:ss"/><numFmt numFmtId="166" formatCode="hh:mm:ss"/></numFmts><fonts count="2"><font><sz val="11"/><name val="Calibri"/></font><font><b/><sz val="11"/><name val="Calibri"/></font></fonts><fills count="3"><fill><patternFill patternType="none"/></fill><fill><patternFill patternType="gray125"/></fill><fill><patternFill patternType="solid"><fgColor rgb="FFF6E4EA"/><bgColor indexed="64"/></patternFill></fill></fills><borders count="1"><border><left/><right/><top/><bottom/><diagonal/></border></borders><cellStyleXfs count="1"><xf numFmtId="0" fontId="0" fillId="0" borderId="0"/></cellStyleXfs><cellXfs count="5"><xf numFmtId="0" fontId="0" fillId="0" borderId="0" xfId="0"/><xf numFmtId="0" fontId="1" fillId="2" borderId="0" xfId="0" applyFont="1" applyFill="1"/><xf numFmtId="164" fontId="0" fillId="0" borderId="0" xfId="0" applyNumberFormat="1"/><xf numFmtId="165" fontId="0" fillId="0" borderId="0" xfId="0" applyNumberFormat="1"/><xf numFmtId="166" fontId="0" fillId="0" borderId="0" xfId="0" applyNumberFormat="1"/></cellXfs><cellStyles count="1"><cellStyle name="Normal" xfId="0" builtinId="0"/></cellStyles></styleSheet>',
  };
  list.forEach((s, i) => { files[`xl/worksheets/sheet${i + 1}.xml`] = sheetXml(s.cols, s.rows); });
  return zipSync(Object.fromEntries(Object.entries(files).map(([k, v]) => [k, strToU8(v)])), { level: 6 });
}
