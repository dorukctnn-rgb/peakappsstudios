/* Pay Transparency Kit: one letter as an A4 PDF. pdf-lib is passed in (the copy vendored with the Pay Gap Report,
 * loaded only when a PDF is asked for) and text goes through the Pay Gap Report's pdfText(), which keeps it inside the
 * WinAnsi set of the standard Helvetica font (German and Dutch letters, the euro sign and typographic quotes are in it).
 * Works in the browser (window.PayTransPDF) and in Node for the tests. */
(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory(() => require('../pay-gap-report/report.js'), require('./letters.js'));
  else root.PayTransPDF = factory(() => root.PayGapReport, root.PayTransLetters);
})(typeof self !== 'undefined' ? self : this, function (getReport, LT) {
  'use strict';

  const PAGE_WORD = { en: 'Page', de: 'Seite', nl: 'Pagina' };
  const OF_WORD = { en: 'of', de: 'von', nl: 'van' };

  async function letterPDF(PDFLib, letter, meta) {
    const pdfText = getReport().pdfText;
    const { PDFDocument, StandardFonts, rgb } = PDFLib;
    const doc = await PDFDocument.create();
    const m = meta || {};
    doc.setTitle(pdfText(m.title || letter.subject || 'Letter'));
    if (m.author) doc.setAuthor(pdfText(m.author));
    doc.setCreator('Peak Apps Pay Transparency Kit');
    doc.setProducer('pdf-lib');
    if (letter.lang) doc.setLanguage(letter.lang);
    const F = await doc.embedFont(StandardFonts.Helvetica), B = await doc.embedFont(StandardFonts.HelveticaBold);
    const W = 595.28, H = 841.89, ML = 68, MR = 64, MT = 64, MB = 70, CW = W - ML - MR;
    const INK = rgb(0.08, 0.08, 0.09), MUTED = rgb(0.38, 0.39, 0.42), RULE = rgb(0.8, 0.8, 0.78);
    const SIZE = 10.5, LEAD = 15.2;
    let page, y;
    const pages = [];
    const newPage = () => { page = doc.addPage([W, H]); pages.push(page); y = H - MT; };
    const ensure = h => { if (y - h < MB) newPage(); };
    const wrap = (str, font, size, max) => {
      const out = [];
      for (const para of pdfText(str).split('\n')) {
        const words = para.split(/\s+/).filter(Boolean);
        if (!words.length) { out.push(''); continue; }
        let cur = '';
        for (const w of words) {
          const t = cur ? cur + ' ' + w : w;
          if (font.widthOfTextAtSize(t, size) > max && cur) { out.push(cur); cur = w; } else cur = t;
        }
        if (cur) out.push(cur);
      }
      return out;
    };
    const draw = (t, x, yy, o) => page.drawText(t, { x, y: yy, size: (o && o.size) || SIZE, font: (o && o.bold) ? B : F, color: (o && o.color) || INK });
    const para = (str, o = {}) => {
      const font = o.bold ? B : F, size = o.size || SIZE;
      for (const line of wrap(str, font, size, o.width || CW)) { ensure(LEAD); draw(line, o.x || ML, y, { size, bold: o.bold, color: o.color }); y -= o.lead || LEAD; }
    };

    newPage();
    // Sender, recipient and date
    if (letter.sender && letter.sender.length) {
      letter.sender.forEach((s, i) => { draw(pdfText(s), ML, y, { size: i === 0 ? 11 : 9.5, bold: i === 0 }); y -= 14; });
      y -= 16;
    }
    if (letter.recipient && letter.recipient.length) {
      letter.recipient.forEach(s => { para(s, { lead: 14 }); });
      y -= 12;
    }
    if (letter.dateLine) {
      const t = pdfText(letter.dateLine);
      draw(t, W - MR - F.widthOfTextAtSize(t, SIZE), y, {});
      y -= 26;
    }
    if (letter.subject) { para(letter.subject, { bold: true, size: 11.5, lead: 16 }); y -= 10; }
    if (letter.salutation) { para(letter.salutation); y -= 7; }
    for (const b of letter.blocks || []) {
      if (b.h) { ensure(40); y -= 6; para(b.h, { bold: true, size: 11 }); y -= 2; continue; }
      if (b.p) { para(b.p); y -= 7; continue; }
      if (b.list) {
        const items = LT.listItems(letter, b);
        for (const it of items) {
          const mm = /^(\S+)\s(.*)$/s.exec(it);
          const label = mm ? mm[1] : '', body = mm ? mm[2] : it;
          const lines = wrap(body, F, SIZE, CW - 22);
          ensure(LEAD * Math.min(lines.length, 2));
          draw(pdfText(label), ML + 2, y, { color: MUTED });
          for (const line of lines) { ensure(LEAD); draw(line, ML + 22, y, {}); y -= LEAD; }
          y -= 3;
        }
        y -= 5;
      }
    }
    if (letter.closing) {
      ensure(LEAD * 4);
      y -= 4;
      para(letter.closing);
      y -= 30;
    }
    if (letter.signature && letter.signature.length) letter.signature.forEach((s, i) => { ensure(LEAD); para(s, { bold: i === 0 }); });

    if (pages.length > 1) {
      const lang = letter.lang || 'en';
      pages.forEach((p, i) => {
        const t = `${PAGE_WORD[lang]} ${i + 1} ${OF_WORD[lang]} ${pages.length}`;
        p.drawLine({ start: { x: ML, y: MB - 26 }, end: { x: W - MR, y: MB - 26 }, thickness: 0.5, color: RULE });
        p.drawText(t, { x: W - MR - F.widthOfTextAtSize(t, 8), y: MB - 40, size: 8, font: F, color: MUTED });
      });
    }
    return doc.save();
  }

  return { letterPDF };
});
