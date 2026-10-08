/* Etsy Tax Summary exports (Pro): categorized CSV, XLSX workbook and the accountant PDF.
 * Pure functions over a "view" object built by tool.js; pdf-lib is passed in (lazy-loaded by the page).
 * Works in the browser (window.EtsyReport) and in Node for the tests. */
(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory();
  else root.EtsyReport = factory();
})(typeof self !== 'undefined' ? self : this, function () {
  'use strict';
  const E = typeof EtsyTax !== 'undefined' ? EtsyTax : null; // eslint-disable-line no-undef
  const eng = view => view.E || E;

  const dec = c => (c == null ? '' : ((c < 0 ? '-' : '') + (Math.abs(c) / 100).toFixed(2)));
  const csvCell = v => { const s = v == null ? '' : String(v); return /[",\n\r]/.test(s) || /^[=+\-@]/.test(s) && !/^-?\d/.test(s) ? '"' + s.replace(/"/g, '""') + '"' : s; };
  const formWord = region => (region === 'us' ? 'Schedule C line' : region === 'uk' ? 'SA103S box' : 'Category');

  // ---------- Categorized rows (CSV) ----------
  function rowRecords(view) {
    const X = eng(view);
    const out = [];
    for (const f of view.files) {
      if (f.kind !== 'statement') continue;
      for (const r of f.rows) {
        if (r.dup || r.day == null || r.day < view.period.start || r.day > view.period.end || r.currency !== view.currency) continue;
        for (const p of r.parts) {
          out.push({
            shop: f.shopName || '', file: f.name, date: r.date, type: r.type, title: r.title, info: r.info, currency: r.currency,
            amount: r.amount, fees: r.fees, net: r.fromTitle ? null : r.net, counted: p.cents,
            category: X.CATS[p.cat] ? X.CATS[p.cat].label : p.cat, line: X.lineFor(p.cat, view.region), order: r.order,
          });
        }
      }
    }
    out.sort((a, b) => (a.date < b.date ? -1 : a.date > b.date ? 1 : 0));
    return out;
  }
  function rowsCSV(view) {
    const head = ['Shop', 'Source file', 'Date', 'Type', 'Title', 'Info', 'Currency', 'Amount', 'Fees & Taxes', 'Net', 'Counted amount', 'Category', formWord(view.region), 'Order'];
    const lines = [head.map(csvCell).join(',')];
    for (const r of rowRecords(view)) lines.push([r.shop, r.file, r.date, r.type, r.title, r.info, r.currency, dec(r.amount), dec(r.fees), dec(r.net), dec(r.counted), r.category, r.line, r.order].map(csvCell).join(','));
    return String.fromCharCode(0xFEFF) + lines.join('\r\n') + '\r\n';
  }

  // ---------- Summary tables shared by XLSX and PDF ----------
  function summaryTable(view) {
    const s = view.s, X = eng(view), t = s.totals, R = view.region;
    const line = c => X.lineFor(c, R);
    const rows = [
      { label: 'Sales, including shipping buyers paid', cents: s.salesExTax, line: line('sales'), strong: false },
    ];
    if (view.shipping != null) rows.push({ label: 'of which shipping charged (Sold Orders CSV)', cents: view.shipping, sub: true });
    rows.push(
      { label: 'Refunds to buyers', cents: s.refundsExTax, line: line('refunds') },
      { label: 'Sales after refunds', cents: s.netSales, strong: true },
      { label: 'Transaction fees', cents: t.fee_transaction, line: line('fee_transaction') },
      { label: 'Payment processing fees', cents: t.fee_processing, line: line('fee_processing') },
      { label: 'Listing and renewal fees', cents: t.fee_listing, line: line('fee_listing') },
    );
    if (t.fee_regulatory) rows.push({ label: 'Regulatory operating fees', cents: t.fee_regulatory, line: line('fee_regulatory') });
    if (t.fee_tax) rows.push({ label: 'Tax and VAT on Etsy fees', cents: t.fee_tax, line: line('fee_tax') });
    if (t.fee_subscription) rows.push({ label: 'Subscriptions', cents: t.fee_subscription, line: line('fee_subscription') });
    if (t.fee_other) rows.push({ label: 'Other Etsy fees and credits', cents: t.fee_other, line: line('fee_other') });
    rows.push({ label: 'Etsy Ads', cents: t.ads_etsy, line: line('ads_etsy') }, { label: 'Offsite Ads fees', cents: t.ads_offsite, line: line('ads_offsite') });
    if (t.ads_other) rows.push({ label: 'Other marketing', cents: t.ads_other, line: line('ads_other') });
    rows.push({ label: 'Shipping labels bought on Etsy', cents: s.labels, line: line('labels') });
    rows.push({ label: 'Net from Etsy activity', cents: s.netEtsy, strong: true });
    if (view.cost && view.cost.total) {
      rows.push({ label: 'Your own costs entered (materials, supplies, mileage, other)', cents: -view.cost.total });
      rows.push({ label: 'Estimated profit before tax', cents: s.netEtsy - view.cost.total, strong: true });
    }
    const memo = [
      { label: 'Sales tax and VAT Etsy collected from buyers (not your income)', cents: s.taxOnSales },
      { label: 'Of which returned to buyers with refunds', cents: -s.taxOnRefunds },
      { label: 'Sent to your bank', cents: -s.deposits },
    ];
    if (s.payments) memo.push({ label: 'Payments you made to Etsy', cents: s.payments });
    if (s.reserve) memo.push({ label: 'Reserve held or released', cents: s.reserve });
    if (s.unmapped) memo.push({ label: 'Rows to review (kept out of the totals)', cents: s.unmapped });
    return { rows, memo };
  }
  const MONTH_COLS = ['Sales', 'Refunds', 'Tax Etsy collected', 'Etsy fees', 'Ads', 'Labels', 'Net', 'Deposited'];
  function monthRows(s) {
    const r = s.months.map(m => [m.label, m.d.salesExTax, m.d.refundsExTax, m.d.taxCollectedNet, m.d.fees, m.d.ads, m.d.labels, m.d.netEtsy, -m.d.deposits]);
    r.push(['Total', s.salesExTax, s.refundsExTax, s.taxCollectedNet, s.fees, s.ads, s.labels, s.netEtsy, -s.deposits]);
    return r;
  }

  // ---------- XLSX (no dependencies: SpreadsheetML in a stored ZIP) ----------
  const CRC = (() => { const t = new Uint32Array(256); for (let n = 0; n < 256; n++) { let c = n; for (let k = 0; k < 8; k++) c = c & 1 ? 0xEDB88320 ^ (c >>> 1) : c >>> 1; t[n] = c >>> 0; } return t; })();
  function crc32(bytes) { let c = 0xFFFFFFFF; for (let i = 0; i < bytes.length; i++) c = CRC[(c ^ bytes[i]) & 0xFF] ^ (c >>> 8); return (c ^ 0xFFFFFFFF) >>> 0; }
  const utf8 = s => new TextEncoder().encode(s);
  function zip(files) {
    const parts = [], central = [];
    let offset = 0;
    const d = new Date(), dosTime = (d.getHours() << 11) | (d.getMinutes() << 5) | (d.getSeconds() >> 1), dosDate = ((d.getFullYear() - 1980) << 9) | ((d.getMonth() + 1) << 5) | d.getDate();
    for (const f of files) {
      const name = utf8(f.name), data = typeof f.data === 'string' ? utf8(f.data) : f.data, crc = crc32(data);
      const h = new DataView(new ArrayBuffer(30));
      h.setUint32(0, 0x04034b50, true); h.setUint16(4, 20, true); h.setUint16(6, 0x0800, true); h.setUint16(8, 0, true);
      h.setUint16(10, dosTime, true); h.setUint16(12, dosDate, true); h.setUint32(14, crc, true); h.setUint32(18, data.length, true); h.setUint32(22, data.length, true);
      h.setUint16(26, name.length, true); h.setUint16(28, 0, true);
      parts.push(new Uint8Array(h.buffer), name, data);
      const c = new DataView(new ArrayBuffer(46));
      c.setUint32(0, 0x02014b50, true); c.setUint16(4, 20, true); c.setUint16(6, 20, true); c.setUint16(8, 0x0800, true); c.setUint16(10, 0, true);
      c.setUint16(12, dosTime, true); c.setUint16(14, dosDate, true); c.setUint32(16, crc, true); c.setUint32(20, data.length, true); c.setUint32(24, data.length, true);
      c.setUint16(28, name.length, true); c.setUint32(42, offset, true);
      central.push(new Uint8Array(c.buffer), name);
      offset += 30 + name.length + data.length;
    }
    const cdSize = central.reduce((a, b) => a + b.length, 0);
    const e = new DataView(new ArrayBuffer(22));
    e.setUint32(0, 0x06054b50, true); e.setUint16(8, files.length, true); e.setUint16(10, files.length, true); e.setUint32(12, cdSize, true); e.setUint32(16, offset, true);
    const all = parts.concat(central, [new Uint8Array(e.buffer)]);
    const out = new Uint8Array(all.reduce((a, b) => a + b.length, 0));
    let p = 0; for (const a of all) { out.set(a, p); p += a.length; }
    return out;
  }
  const xmlEsc = s => String(s).replace(/[<>&"]/g, c => ({ '<': '&lt;', '>': '&gt;', '&': '&amp;', '"': '&quot;' }[c])).replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F]/g, '');
  const colName = i => { let s = ''; i++; while (i) { const m = (i - 1) % 26; s = String.fromCharCode(65 + m) + s; i = Math.floor((i - 1) / 26); } return s; };
  // cell: string | number | null | { v, money, bold }
  function sheetXML(sheet) {
    const rows = sheet.rows.map((row, ri) => {
      const cells = row.map((cell, ci) => {
        if (cell == null || cell === '') return '';
        const c = typeof cell === 'object' ? cell : { v: cell };
        const ref = colName(ci) + (ri + 1);
        const bold = c.bold || ri < (sheet.header || 0);
        if (typeof c.v === 'number') {
          const style = c.money ? (bold ? 3 : 2) : (bold ? 1 : 0);
          return `<c r="${ref}"${style ? ` s="${style}"` : ''}><v>${c.money ? (c.v / 100).toFixed(2) : c.v}</v></c>`;
        }
        return `<c r="${ref}" t="inlineStr"${bold ? ' s="1"' : ''}><is><t xml:space="preserve">${xmlEsc(c.v)}</t></is></c>`;
      }).join('');
      return `<row r="${ri + 1}">${cells}</row>`;
    }).join('');
    const cols = (sheet.widths || []).map((w, i) => `<col min="${i + 1}" max="${i + 1}" width="${w}" customWidth="1"/>`).join('');
    const pane = sheet.header ? `<sheetViews><sheetView workbookViewId="0"><pane ySplit="${sheet.header}" topLeftCell="A${sheet.header + 1}" activePane="bottomLeft" state="frozen"/></sheetView></sheetViews>` : '';
    return `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>\n<worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main">${pane}${cols ? `<cols>${cols}</cols>` : ''}<sheetData>${rows}</sheetData></worksheet>`;
  }
  function xlsx(sheets) {
    const ns = 'http://schemas.openxmlformats.org';
    const files = [
      { name: '[Content_Types].xml', data: `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>\n<Types xmlns="${ns}/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/><Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/><Override PartName="/xl/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.styles+xml"/>${sheets.map((s, i) => `<Override PartName="/xl/worksheets/sheet${i + 1}.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/>`).join('')}</Types>` },
      { name: '_rels/.rels', data: `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>\n<Relationships xmlns="${ns}/package/2006/relationships"><Relationship Id="rId1" Type="${ns}/officeDocument/2006/relationships/officeDocument" Target="xl/workbook.xml"/></Relationships>` },
      { name: 'xl/workbook.xml', data: `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>\n<workbook xmlns="${ns}/spreadsheetml/2006/main" xmlns:r="${ns}/officeDocument/2006/relationships"><sheets>${sheets.map((s, i) => `<sheet name="${xmlEsc(s.name.replace(/[[\]:*?/\\]/g, ' ').slice(0, 31))}" sheetId="${i + 1}" r:id="rId${i + 1}"/>`).join('')}</sheets></workbook>` },
      { name: 'xl/_rels/workbook.xml.rels', data: `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>\n<Relationships xmlns="${ns}/package/2006/relationships">${sheets.map((s, i) => `<Relationship Id="rId${i + 1}" Type="${ns}/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet${i + 1}.xml"/>`).join('')}<Relationship Id="rId${sheets.length + 1}" Type="${ns}/officeDocument/2006/relationships/styles" Target="styles.xml"/></Relationships>` },
      { name: 'xl/styles.xml', data: `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>\n<styleSheet xmlns="${ns}/spreadsheetml/2006/main"><numFmts count="1"><numFmt numFmtId="164" formatCode="#,##0.00;[Red]-#,##0.00"/></numFmts><fonts count="2"><font><sz val="11"/><name val="Calibri"/></font><font><b/><sz val="11"/><name val="Calibri"/></font></fonts><fills count="2"><fill><patternFill patternType="none"/></fill><fill><patternFill patternType="gray125"/></fill></fills><borders count="1"><border><left/><right/><top/><bottom/><diagonal/></border></borders><cellStyleXfs count="1"><xf numFmtId="0" fontId="0" fillId="0" borderId="0"/></cellStyleXfs><cellXfs count="4"><xf numFmtId="0" fontId="0" fillId="0" borderId="0" xfId="0"/><xf numFmtId="0" fontId="1" fillId="0" borderId="0" xfId="0" applyFont="1"/><xf numFmtId="164" fontId="0" fillId="0" borderId="0" xfId="0" applyNumberFormat="1"/><xf numFmtId="164" fontId="1" fillId="0" borderId="0" xfId="0" applyNumberFormat="1" applyFont="1"/></cellXfs><cellStyles count="1"><cellStyle name="Normal" xfId="0" builtinId="0"/></cellStyles></styleSheet>` },
    ];
    sheets.forEach((s, i) => files.push({ name: `xl/worksheets/sheet${i + 1}.xml`, data: sheetXML(s) }));
    return zip(files);
  }
  function workbook(view) {
    const s = view.s, money = c => ({ v: c, money: true });
    const sum = summaryTable(view);
    const formHead = formWord(view.region);
    const summary = [[`Etsy sales and fees, ${view.period.label}`], [`${view.shopLabel} (${view.currency}). Prepared ${view.generated} from Etsy CSV files.`], [],
      [{ v: 'Item', bold: true }, { v: 'Amount', bold: true }, { v: formHead, bold: true }]];
    for (const r of sum.rows) summary.push([r.sub ? '   ' + r.label : r.label, { v: r.cents, money: true, bold: r.strong }, r.line || '']);
    summary.push([], [{ v: 'Not income or expense', bold: true }]);
    for (const r of sum.memo) summary.push([r.label, money(r.cents)]);
    summary.push([], [{ v: 'Where these usually go (common practice, not tax advice)', bold: true }], [{ v: 'Line or box', bold: true }, { v: 'Amount', bold: true }, { v: 'Description', bold: true }, { v: 'What is in it', bold: true }]);
    for (const l of view.lines.lines) summary.push([l.code, money(l.cents), l.label, l.what]);
    for (const l of view.lines.off) summary.push([l.code, money(l.cents), l.label, l.what]);
    const months = [['Month'].concat(MONTH_COLS)].concat(monthRows(s).map(r => [r[0]].concat(r.slice(1).map(money))));
    const recs = rowRecords(view);
    const rows = [['Date', 'Type', 'Title', 'Info', 'Currency', 'Amount', 'Fees & Taxes', 'Net', 'Counted amount', 'Category', formHead, 'Order', 'Shop', 'Source file']]
      .concat(recs.map(r => [r.date, r.type, r.title, r.info, r.currency, r.amount == null ? null : money(r.amount), r.fees == null ? null : money(r.fees), r.net == null ? null : money(r.net), money(r.counted), r.category, r.line, r.order, r.shop, r.file]));
    const sheets = [
      { name: 'Summary', rows: summary, widths: [52, 16, 34, 70] },
      { name: 'By month', rows: months, header: 1, widths: [20, 14, 14, 18, 14, 12, 12, 14, 14] },
      { name: 'Rows', rows, header: 1, widths: [12, 12, 48, 30, 9, 12, 12, 12, 14, 30, 18, 14, 14, 30] },
    ];
    if (view.cost && view.cost.list.length) {
      sheets.push({ name: 'Your costs', header: 1, widths: [12, 14, 40, 10, 14, 16], rows: [['Date', 'Kind', 'Description', 'Miles', 'Amount', 'Rate']].concat(view.cost.list.map(c => [c.date, KIND_LABEL[c.kind] || c.kind, c.desc || '', c.kind === 'mileage' ? Number(c.miles) || 0 : null, c.cents == null ? null : money(c.cents), c.rate || c.why || ''])) });
    }
    return xlsx(sheets);
  }
  const KIND_LABEL = { materials: 'Materials', supplies: 'Packaging and supplies', mileage: 'Mileage', other: 'Other expense' };

  // ---------- PDF ----------
  const WINANSI_EXTRA = '€‚ƒ„…†‡ˆ‰Š‹ŒŽ‘’“”•–—˜™š›œžŸ';
  const cc = (...n) => String.fromCharCode(...n);
  const PDF_MINUS = new RegExp(cc(0x2212), 'g'), PDF_SPACES = new RegExp('[' + cc(0xa0, 0x2007, 0x202f) + ']', 'g'), PDF_ARROW = new RegExp(cc(0x2192), 'g');
  const PDF_MARKS = new RegExp('[' + cc(0x300) + '-' + cc(0x36f) + ']', 'g');
  function pdfText(s) {
    return Array.from(String(s == null ? '' : s).replace(PDF_MINUS, '-').replace(PDF_SPACES, ' ').replace(PDF_ARROW, 'to')).map(ch => {
      const c = ch.codePointAt(0);
      if ((c >= 32 && c <= 126) || (c >= 160 && c <= 255) || WINANSI_EXTRA.includes(ch)) return ch;
      const base = ch.normalize('NFD').replace(PDF_MARKS, '');
      if (base && base.length === 1 && base.charCodeAt(0) < 127) return base;
      return c === 9 ? ' ' : c < 32 ? '' : '?';
    }).join('');
  }
  async function pdf(PDFLib, view) {
    const X = eng(view);
    const { PDFDocument, StandardFonts, rgb } = PDFLib;
    const doc = await PDFDocument.create();
    doc.setTitle(pdfText(`Etsy sales and fees, ${view.period.label}`));
    doc.setAuthor(pdfText(view.shopLabel));
    doc.setCreator('Peak Apps Etsy Tax Summary');
    doc.setProducer('pdf-lib');
    const F = await doc.embedFont(StandardFonts.Helvetica), B = await doc.embedFont(StandardFonts.HelveticaBold);
    const size = view.region === 'us' ? [612, 792] : [595.28, 841.89];
    const W = size[0], H = size[1], M = 44, CW = W - 2 * M;
    const INK = rgb(0.08, 0.08, 0.09), MUTED = rgb(0.4, 0.41, 0.44), RULE = rgb(0.82, 0.82, 0.8), ACCENT = rgb(0x5b / 255, 0x2d / 255, 0x56 / 255), SOFT = rgb(0.955, 0.945, 0.93);
    const m = c => X.money(c, view.currency, { ascii: true, locale: view.region === 'uk' ? 'en-GB' : 'en-US' });
    let page, y;
    const pages = [];
    const newPage = () => { page = doc.addPage(size); pages.push(page); y = H - M; };
    const ensure = h => { if (y - h < M + 30) newPage(); };
    const text = (str, x, yy, o = {}) => { const f = o.bold ? B : F, s = o.size || 9.5; const t = pdfText(str); const w = f.widthOfTextAtSize(t, s); page.drawText(t, { x: o.right ? x - w : o.center ? x - w / 2 : x, y: yy, size: s, font: f, color: o.color || INK }); return w; };
    const wrap = (str, font, s, max) => {
      const words = pdfText(str).split(/\s+/); const lines = []; let cur = '';
      for (const w of words) { const t = cur ? cur + ' ' + w : w; if (font.widthOfTextAtSize(t, s) > max && cur) { lines.push(cur); cur = w; } else cur = t; }
      if (cur) lines.push(cur); return lines;
    };
    const para = (str, o = {}) => { const s = o.size || 9, f = o.bold ? B : F; for (const l of wrap(str, f, s, o.width || CW)) { ensure(s + 4); text(l, o.x || M, y, { size: s, bold: o.bold, color: o.color }); y -= s + 3.5; } };
    const rule = (yy, c = RULE, t = 0.6) => page.drawLine({ start: { x: M, y: yy }, end: { x: W - M, y: yy }, thickness: t, color: c });
    const h2 = str => { ensure(40); y -= 10; text(str, M, y, { bold: true, size: 12.5 }); y -= 8; rule(y, INK, 0.8); y -= 14; };

    newPage();
    // Title block
    text('ETSY TAX SUMMARY', M, y, { size: 8, color: ACCENT, bold: true });
    text(`Prepared ${view.generated}`, W - M, y, { size: 8, color: MUTED, right: true });
    y -= 24;
    text(`Etsy sales and fees, ${view.period.label}`, M, y, { bold: true, size: 19 });
    y -= 17;
    para(`${view.shopLabel}, amounts in ${view.currency}. Period ${X.iso(X.fromDay(view.period.start))} to ${X.iso(X.fromDay(view.period.end))}. Built from ${view.fileCount.statements} Etsy monthly statement CSV file${view.fileCount.statements === 1 ? '' : 's'}${view.fileCount.orders ? ` and ${view.fileCount.orders} order CSV file${view.fileCount.orders === 1 ? '' : 's'}` : ''}, read on the seller's own computer.`, { color: MUTED, size: 9.5 });
    y -= 8;
    // Key figures band
    const s = view.s;
    const keys = [['Sales after refunds', s.netSales], ['Etsy fees, ads and labels', s.fees + s.ads + s.labels], ['Net from Etsy activity', s.netEtsy], ['Tax Etsy collected (excluded)', s.taxCollectedNet]];
    const bh = 46; ensure(bh + 10);
    page.drawRectangle({ x: M, y: y - bh, width: CW, height: bh, color: SOFT });
    keys.forEach(([l, v], i) => { const x = M + 12 + i * (CW / 4); text(l, x, y - 16, { size: 7.5, color: MUTED }); text(m(v), x, y - 34, { size: 12.5, bold: true }); });
    y -= bh + 8;

    // Summary
    const sum = summaryTable(view);
    const formHead = view.region === 'us' ? 'Schedule C' : view.region === 'uk' ? 'SA103S' : '';
    h2('Summary');
    text('Item', M, y, { size: 8, color: MUTED }); text('Amount', W - M - 90, y, { size: 8, color: MUTED, right: true }); if (formHead) text(formHead, W - M, y, { size: 8, color: MUTED, right: true });
    y -= 12;
    for (const r of sum.rows) {
      ensure(14);
      if (r.strong) { rule(y + 10, RULE, 0.5); }
      text(r.label, M + (r.sub ? 12 : 0), y, { bold: r.strong, size: r.sub ? 8.5 : 9.5, color: r.sub ? MUTED : INK });
      text(m(r.cents), W - M - 90, y, { bold: r.strong, right: true, size: r.sub ? 8.5 : 9.5, color: r.sub ? MUTED : INK });
      if (r.line) text(r.line, W - M, y, { right: true, size: 8.5, color: MUTED });
      y -= r.strong ? 17 : 14;
    }
    y -= 4;
    text('Not income or expense', M, y, { bold: true, size: 9.5 }); y -= 14;
    for (const r of sum.memo) { ensure(14); text(r.label, M, y, { size: 9 }); text(m(r.cents), W - M - 90, y, { right: true, size: 9 }); y -= 13; }

    // Form lines
    h2(view.region === 'us' ? 'Where these usually go on Schedule C' : view.region === 'uk' ? 'Where these usually go on the SA103S' : 'Totals by category');
    const c1 = M, c2 = M + 70, c3 = W - M;
    const formLine = (l, off) => {
      const what = wrap(l.what, F, 8, CW - 70 - 100);
      ensure(14 + what.length * 10);
      if (!off) text(l.code, c1, y, { bold: true, size: 9, color: ACCENT });
      text(l.label, c2, y, { size: 9, bold: !!l.total });
      text(m(l.cents), c3, y, { right: true, size: 9, bold: !off });
      y -= 11;
      for (const w of what) { text(w, c2, y, { size: 8, color: MUTED }); y -= 10; }
      y -= 4;
    };
    view.lines.lines.forEach(l => formLine(l));
    ensure(40);
    y -= 2; rule(y + 8);
    text(view.region === 'us' ? 'Not on Schedule C' : view.region === 'uk' ? 'Not on the return' : 'Not income or expense', c1, y - 4, { bold: true, size: 8, color: MUTED });
    y -= 18;
    view.lines.off.forEach(l => formLine(l, true));
    y -= 2;
    para(view.region === 'us'
      ? `Line numbers follow the 2025 Schedule C (Form 1040), the latest final form when checked on ${X.CHECKED}. The placement shown is common practice for marketplace sellers, not tax advice; your tax preparer may group items differently.`
      : view.region === 'uk'
        ? `Box numbers follow the SA103S Self-employment (short) page for 2025 to 2026, checked on ${X.CHECKED}. If you use the full SA103F page the boxes are numbered differently. This is common practice, not tax advice.`
        : 'Plain categories; match them to your own country’s return.', { size: 8, color: MUTED });

    // Month table: keep it on one page
    ensure(70 + 13 * (s.months.length + 1));
    h2('Month by month');
    const mcols = ['Month'].concat(MONTH_COLS);
    const firstW = 92, colW = (CW - firstW) / (mcols.length - 1);
    const mx = i => (i === 0 ? M : M + firstW + colW * i);
    mcols.forEach((c, i) => { if (i === 0) text(c, M, y, { size: 7.5, color: MUTED }); else { const ls = wrap(c, F, 7.5, colW - 4); ls.forEach((l, k) => text(l, mx(i), y + (ls.length - 1 - k) * 0 - k * 9, { size: 7.5, color: MUTED, right: true })); } });
    y -= 20; rule(y + 10);
    const mr = monthRows(s);
    mr.forEach((row, ri) => {
      const total = ri === mr.length - 1;
      ensure(14);
      if (total) { rule(y + 10, INK, 0.6); }
      else if (ri % 2 === 1) page.drawRectangle({ x: M, y: y - 3.5, width: CW, height: 13, color: SOFT });
      row.forEach((v, i) => { if (i === 0) text(v, M + 2, y, { size: 8, bold: total }); else text(X.money(v, view.currency, { ascii: true, locale: view.region === 'uk' ? 'en-GB' : 'en-US' }).replace(/^(-?)[^\d-]+/, '$1'), mx(i), y, { size: 8, right: true, bold: total }); });
      y -= 13;
    });
    y -= 4;
    para(`Amounts in ${view.currency}, currency symbol left out. Sales exclude the tax Etsy collected; refunds exclude the tax returned. Etsy fees include tax or VAT charged on them.`, { size: 8, color: MUTED });

    // Checks, costs, other fees, review rows, files
    h2('Checks');
    for (const c of view.s.checks) {
      const tag = c.ok ? 'OK' : 'CHECK';
      ensure(26);
      text(tag, M, y, { bold: true, size: 8, color: c.ok ? INK : ACCENT });
      text(c.title, M + 46, y, { bold: true, size: 9 });
      y -= 11;
      for (const l of wrap(c.text, F, 8.5, CW - 46)) { ensure(11); text(l, M + 46, y, { size: 8.5, color: MUTED }); y -= 10.5; }
      y -= 4;
    }
    if (view.k1099) {
      ensure(30);
      const k = view.k1099;
      text('1099-K', M, y, { bold: true, size: 8 });
      text('Federal Form 1099-K threshold', M + 46, y, { bold: true, size: 9 }); y -= 11;
      for (const l of wrap(`Gross sales for 1099-K purposes (sales before refunds, without the tax Etsy collected): ${m(k.gross)} across ${k.transactions} sales. Etsy must file a federal 1099-K only above $20,000 and more than 200 transactions (calendar years 2025 and later). ${k.over ? 'This year is above both, so expect a 1099-K.' : 'This year is not above both, so no federal 1099-K is expected; some states use lower thresholds.'} The income is reportable either way.`, F, 8.5, CW - 46)) { ensure(11); text(l, M + 46, y, { size: 8.5, color: MUTED }); y -= 10.5; }
      y -= 4;
    }
    if (view.cost && view.cost.list.length) {
      h2('Your own costs entered');
      for (const c of view.cost.list) {
        ensure(13);
        text(c.date, M, y, { size: 8.5 }); text(KIND_LABEL[c.kind] || c.kind, M + 62, y, { size: 8.5 });
        text(c.kind === 'mileage' ? `${Number(c.miles) || 0} miles, ${c.rate || c.why || ''}` + (c.desc ? `, ${c.desc}` : '') : (c.desc || ''), M + 170, y, { size: 8.5, color: MUTED });
        text(c.cents == null ? 'n/a' : m(c.cents), W - M, y, { size: 8.5, right: true });
        y -= 12.5;
      }
      ensure(14); rule(y + 9); text('Total', M, y, { bold: true, size: 9 }); text(m(view.cost.total), W - M, y, { bold: true, right: true, size: 9 }); y -= 14;
    }
    if (s.otherTitles.length) {
      h2('Other Etsy fees and credits');
      for (const o of s.otherTitles) { ensure(13); text(`${o.title} (${o.n})`, M, y, { size: 8.5 }); text(m(o.cents), W - M, y, { size: 8.5, right: true }); y -= 12.5; }
    }
    if (s.unmappedRows.length) {
      h2('Rows to review (not in the totals)');
      for (const r of s.unmappedRows.slice(0, 60)) { ensure(13); text(r.date, M, y, { size: 8.5 }); text(`${r.type}: ${r.title}`.slice(0, 80), M + 62, y, { size: 8.5 }); text(m(r.value), W - M, y, { size: 8.5, right: true }); y -= 12.5; }
      if (s.unmappedRows.length > 60) para(`And ${s.unmappedRows.length - 60} more in the CSV export.`, { size: 8, color: MUTED });
    }
    h2('Source files');
    for (const f of view.files) {
      ensure(13);
      text(f.name.slice(0, 70), M, y, { size: 8.5 });
      text(`${X.KINDS[f.kind] || f.kind}, ${f.rows.length} rows${f.shopName ? `, ${f.shopName}` : ''}`, W - M, y, { size: 8.5, right: true, color: MUTED });
      y -= 12.5;
    }

    // Footer on every page
    pages.forEach((p, i) => {
      p.drawLine({ start: { x: M, y: M - 8 }, end: { x: W - M, y: M - 8 }, thickness: 0.5, color: RULE });
      const note = pdfText('Not tax advice. Totals come from the seller’s own Etsy CSV files; check them with your accountant.');
      p.drawText(note, { x: M, y: M - 20, size: 7.5, font: F, color: MUTED });
      const pg = `Page ${i + 1} of ${pages.length}`;
      p.drawText(pg, { x: W - M - F.widthOfTextAtSize(pg, 7.5), y: M - 20, size: 7.5, font: F, color: MUTED });
    });
    return doc.save();
  }

  return { rowRecords, rowsCSV, summaryTable, monthRows, MONTH_COLS, workbook, xlsx, zip, crc32, pdf, pdfText, KIND_LABEL };
});
