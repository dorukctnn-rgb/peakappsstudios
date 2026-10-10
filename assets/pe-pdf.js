/* Pay equity family: the type and colours of the PDFs the family's tools write (Pay Gap Report, Equality Action Plan,
 * Menopause Adjustments, Pay Transparency Kit, Job Evaluation), the paper side of /assets/pay-equity.css.
 *
 * Fonts: Archivo (SIL Open Font License, /assets/fonts/OFL-archivo.txt), embedded as TrueType with the WinAnsi encoding
 * (archivo-pdf-*.ttf, cut by _build/pdf-fonts.py), so a file holds the same characters as with the standard Helvetica
 * it replaces; pdfText() in /pay-gap-report/report.js keeps every string inside that set. Each font measures text with
 * the metrics of the Helvetica cut it stands in for, so every line break, shortened line and page break is computed
 * exactly as before and a document keeps its words on the same pages. draw() then sets the text in Archivo at that
 * place: left-aligned text from the same point, right-aligned and centred text by Archivo's own widths. A string that
 * would come out wider than the room it was given is drawn narrower to fit it, never past it.
 * If the font files cannot be fetched, the document is made with the standard Helvetica in the same colours.
 * In the browser: window.PEPdf, fonts fetched from /assets/fonts/ when a PDF is made. In Node, for the tests: fonts
 * read from src/assets/fonts under the working directory, or from PEPdf.fontDir. */
(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory();
  else root.PEPdf = factory();
})(typeof self !== 'undefined' ? self : this, function () {
  'use strict';

  // @metrics-start (written by _build/pdf-fonts.py)
  const CUTS = {"ArchivoPDF-Regular":{"widths":[209,273,374,582,510,950,692,209,355,355,407,625,277,333,277,294,568,568,568,568,568,568,568,568,568,568,296,296,625,625,625,578,1005,682,698,728,734,677,612,796,736,267,559,662,536,847,736,788,665,788,727,673,606,731,648,924,680,655,635,296,294,296,625,485,187,545,567,519,567,548,280,556,563,225,223,514,225,860,563,570,567,567,332,510,297,562,504,723,513,504,498,353,245,353,625,0,581,0,239,569,394,844,582,582,295,1034,673,355,1229,0,635,0,0,239,239,394,394,391,500,1000,317,931,510,355,935,0,498,655,209,273,567,569,569,562,245,568,280,752,385,550,625,333,752,300,400,625,346,346,187,567,565,333,209,346,379,550,845,845,845,578,682,682,682,682,682,682,1000,728,677,677,677,677,267,267,267,267,734,736,788,788,788,788,788,625,788,731,731,731,731,655,679,619,545,545,545,545,545,545,894,519,548,548,548,548,225,225,225,225,567,563,570,570,570,570,570,625,570,562,562,562,562,504,562,504],"bbox":[-35,-183,1173,917],"ascent":878,"descent":-210,"capHeight":686,"xHeight":526,"italicAngle":0.0,"stemV":80,"file":"archivo-pdf-regular.ttf"},"ArchivoPDF-Bold":{"widths":[196,301,456,600,556,973,764,253,364,364,407,641,307,333,307,300,598,598,598,598,598,598,598,598,598,598,335,335,641,641,641,613,1001,724,722,733,739,683,622,802,754,301,603,725,591,872,754,793,681,793,730,679,641,748,694,964,706,699,653,350,300,350,641,518,228,580,608,573,608,584,325,607,602,267,264,570,267,891,602,613,608,608,380,556,342,601,547,798,572,547,519,393,253,393,641,0,599,0,280,599,488,973,599,599,349,1021,679,357,1202,0,653,0,0,280,280,488,488,441,500,1000,357,1001,556,357,965,0,519,699,196,301,597,599,597,595,253,598,326,772,398,576,641,333,772,307,400,641,371,371,228,605,616,333,237,371,393,576,887,887,887,613,724,724,724,724,724,724,1004,733,683,683,683,683,301,301,301,301,739,754,793,793,793,793,793,641,793,748,748,748,748,699,697,634,580,580,580,580,580,580,920,573,584,584,584,584,267,267,267,267,626,602,613,613,613,613,613,641,613,601,601,601,601,547,608,547],"bbox":[-42,-196,1149,931],"ascent":878,"descent":-210,"capHeight":686,"xHeight":526,"italicAngle":0.0,"stemV":136,"file":"archivo-pdf-bold.ttf"},"ArchivoPDF-Italic":{"widths":[209,273,374,582,510,950,692,209,355,355,407,625,277,333,277,294,568,568,568,568,568,568,568,568,568,568,296,296,625,625,625,578,1005,682,698,728,734,677,612,796,736,267,559,662,536,847,736,788,665,788,727,673,606,731,648,924,680,655,635,296,294,296,625,485,178,561,567,519,567,548,280,556,563,226,223,514,225,860,563,570,567,567,332,510,297,562,504,723,513,504,498,353,245,353,625,0,581,0,239,569,394,844,582,582,295,1034,673,355,1229,0,635,0,0,238,238,393,393,391,500,1000,317,931,510,355,935,0,498,655,209,273,570,569,569,562,245,568,280,752,385,550,625,333,752,300,400,625,346,346,187,567,565,333,210,346,379,550,845,845,845,626,682,682,682,682,682,682,1000,728,677,677,677,677,267,267,267,267,734,736,788,788,788,788,788,625,788,731,731,731,731,655,679,619,561,561,561,561,561,561,894,519,548,548,548,548,226,226,226,226,567,563,570,570,570,570,570,625,570,562,562,562,562,504,562,504],"bbox":[-99,-183,1242,917],"ascent":878,"descent":-210,"capHeight":686,"xHeight":526,"italicAngle":-10.0,"stemV":80,"file":"archivo-pdf-italic.ttf"},"ArchivoExpandedPDF-ExtraBold":{"widths":[272,346,508,720,673,1091,949,274,372,372,424,712,341,393,341,306,738,738,738,738,738,738,738,738,738,738,341,345,712,712,712,686,1184,881,867,889,884,817,754,957,932,360,705,900,717,1082,932,956,815,956,881,820,800,917,855,1147,883,866,808,362,306,362,712,621,302,732,728,726,728,735,445,729,720,307,305,699,307,1102,720,740,728,728,459,673,469,720,669,1017,721,669,625,371,285,371,712,0,751,0,298,744,540,1026,727,727,443,1222,820,368,1436,0,808,0,0,298,298,540,540,466,590,1180,472,1062,673,368,1202,0,625,866,272,346,733,736,633,733,282,736,405,807,486,612,712,393,807,368,400,712,445,445,302,722,702,394,275,445,473,612,1041,1041,1041,686,881,881,881,881,881,881,1195,889,817,817,817,817,360,360,360,360,884,932,956,956,956,956,956,712,956,917,917,917,917,866,834,742,732,732,732,732,732,732,1160,726,735,735,735,735,307,307,307,307,742,720,740,740,740,740,740,712,740,720,720,720,720,669,728,669],"bbox":[-68,-203,1384,937],"ascent":878,"descent":-210,"capHeight":686,"xHeight":526,"italicAngle":0.0,"stemV":160,"file":"archivo-expanded-pdf-extrabold.ttf"}};
  // @metrics-end

  // The family palette on paper, as in /assets/pay-equity.css
  const HEX = {
    ink: '#121a17', ink2: '#36423d', muted: '#59665f', rule: '#cdd2ce', soft: '#eff2ee', white: '#ffffff',
    women: '#11995a', womenInk: '#0b7a45', men: '#c9cfd4', menInk: '#4f5b63', onFill: '#0b130f',
    ok: '#1d7a45', warn: '#9a4a12', warnSoft: '#f7efea',
    pgr: '#11995a', pgrInk: '#0b7a45',
    eap: '#e0442a', eapInk: '#c0321c', eapSoft: '#fcefec',
    ma: '#9b5bb0', maInk: '#7d3c93',
    ptk: '#f0a800', ptkInk: '#8a5b00',
    je: '#2f6fd6', jeInk: '#2257b8', jeSoft: '#edf2fb',
  };
  // role: [Archivo cut, the Helvetica whose metrics it is measured with, subset tag]
  const ROLES = {
    regular: ['ArchivoPDF-Regular', 'Helvetica', 'PEQPDA'],
    bold: ['ArchivoPDF-Bold', 'Helvetica-Bold', 'PEQPDB'],
    italic: ['ArchivoPDF-Italic', 'Helvetica-Oblique', 'PEQPDC'],
    display: ['ArchivoExpandedPDF-ExtraBold', 'Helvetica-Bold', 'PEQPDD'],
  };

  // forceStandard: make the documents with Helvetica, as when the font files cannot be fetched (the tests compare both).
  // stats: set it to { n: 0, fit: 0, min: 1 } (and log: [] for the strings) to count what draw() sets narrower.
  const api = { HEX, ROLES, base: '/assets/fonts/', fontDir: null, forceStandard: false, stats: null, colors, fonts };

  function colors(PDFLib) {
    const out = {};
    for (const k of Object.keys(HEX)) {
      const h = HEX[k];
      out[k] = PDFLib.rgb(parseInt(h.slice(1, 3), 16) / 255, parseInt(h.slice(3, 5), 16) / 255, parseInt(h.slice(5, 7), 16) / 255);
    }
    return out;
  }

  // ---------- font files ----------
  const bytesCache = {};
  function fontBytes(file) {
    if (!bytesCache[file]) bytesCache[file] = readFont(file).catch(e => { delete bytesCache[file]; throw e; });
    return bytesCache[file];
  }
  async function readFont(file) {
    const node = typeof window === 'undefined' && typeof process === 'object' && process.versions && process.versions.node;
    if (node) {
      const get = typeof require === 'function' ? require : process.getBuiltinModule;
      const fs = get('fs'), path = get('path');
      const dirs = [api.fontDir, process.env.PE_PDF_FONTS, path.join(process.cwd(), 'src', 'assets', 'fonts'), path.join(process.cwd(), 'assets', 'fonts')].filter(Boolean);
      const dir = dirs.find(d => fs.existsSync(path.join(d, file)));
      if (!dir) throw new Error(`${file} not found`);
      return new Uint8Array(fs.readFileSync(path.join(dir, file)));
    }
    const r = await fetch(api.base + file);
    if (!r.ok) throw new Error(`${file}: HTTP ${r.status}`);
    return new Uint8Array(await r.arrayBuffer());
  }

  // ---------- fonts for one document ----------
  // fonts(doc, PDFLib, ['regular', 'bold', 'italic', 'display']) -> { regular, bold, ..., draw, C, archivo }
  async function fonts(doc, PDFLib, roles) {
    const want = roles && roles.length ? roles : ['regular', 'bold'];
    let files = null;
    if (!api.forceStandard) {
      try { files = await Promise.all(want.map(r => fontBytes(CUTS[ROLES[r][0]].file))); }
      catch (e) { files = null; if (typeof console !== 'undefined') console.warn('Archivo for the PDF could not be loaded; using Helvetica.', e && e.message); }
    }
    const out = { C: colors(PDFLib), archivo: !!files, draw: (page, text, o) => draw(PDFLib, page, text, o) };
    for (let i = 0; i < want.length; i++) {
      const [cut, metricsOf, tag] = ROLES[want[i]];
      out[want[i]] = files ? archivo(doc, PDFLib, cut, metricsOf, tag, files[i]) : await standard(doc, PDFLib, metricsOf);
    }
    if (out.display && out.bold && out.display.pe && files) out.display.pe.fallback = out.bold;
    // whether text in this font fits the room without being set narrower than 96%
    out.fits = (font, text, size, room) => fits(font, text, size, room);
    return out;
  }

  async function standard(doc, PDFLib, name) {
    const font = await doc.embedFont(name);
    font.pe = { width: (t, s) => font.widthOfTextAtSize(t, s) };
    return font;
  }

  function archivo(doc, PDFLib, name, metricsOf, tag, bytes) {
    const { StandardFontEmbedder, PDFFont } = PDFLib;
    const cut = CUTS[name];
    const std = StandardFontEmbedder.for(metricsOf);
    const emb = Object.create(StandardFontEmbedder.prototype);
    Object.assign(emb, { font: std.font, encoding: std.encoding, fontName: name, customName: undefined });
    // measuring: the metrics of the Helvetica cut it replaces, so the layout is computed exactly as before
    emb.widthOfTextAtSize = (t, s) => std.widthOfTextAtSize(t, s);
    emb.heightOfFontAtSize = (s, o) => std.heightOfFontAtSize(s, o);
    emb.sizeOfFontAtHeight = h => std.sizeOfFontAtHeight(h);
    // the same WinAnsi codes as Helvetica, so the text in the file is unchanged
    emb.encodeText = t => std.encodeText(t);
    let dict = null;
    emb.embedIntoContext = async (context, ref) => {
      if (!dict) {
        const base = `${tag}+${name}`;
        const fileRef = context.register(context.flateStream(bytes, { Length1: bytes.length }));
        const descRef = context.register(context.obj({
          Type: 'FontDescriptor', FontName: base, Flags: cut.italicAngle ? 96 : 32, FontBBox: cut.bbox, ItalicAngle: cut.italicAngle,
          Ascent: cut.ascent, Descent: cut.descent, CapHeight: cut.capHeight, XHeight: cut.xHeight, StemV: cut.stemV, FontFile2: fileRef,
        }));
        dict = context.obj({ Type: 'Font', Subtype: 'TrueType', BaseFont: base, FirstChar: 32, LastChar: 255, Widths: cut.widths, FontDescriptor: descRef, Encoding: 'WinAnsiEncoding' });
      }
      context.assign(ref, dict);
      return ref;
    };
    const font = PDFFont.of(doc.context.nextRef(), doc, emb);
    doc.fonts.push(font);
    font.pe = { width: (t, s) => std.encodeTextAsGlyphs(t).reduce((a, g) => a + (cut.widths[g.code - 32] || 0), 0) * s / 1000 };
    return font;
  }

  // draw(page, text, { x, y, size, font, color, align: 'left' | 'right' | 'center', max })
  // x is the left edge, the right edge or the centre. max is the room the text may take. By default that is the width
  // the text was measured with plus 1.5 pt for left-aligned text, and an eighth more than that width for right-aligned
  // and centred text, which grows into the space before it. The display cut, set narrower than 96% to fit, gives way
  // to the bold cut instead. Returns the measured width, as the callers of page.drawText used it.
  function fits(font, text, size, room) { return !font.pe || font.pe.width(text, size) * 0.96 <= room; }
  function draw(PDFLib, page, text, o) {
    let font = o.font;
    const size = o.size;
    const box = font.widthOfTextAtSize(text, size);
    const room = o.max != null ? Math.max(0, o.max) : o.align === 'right' || o.align === 'center' ? box * 1.125 : box + 1.5;
    if (font.pe && font.pe.fallback && !fits(font, text, size, room)) font = font.pe.fallback;
    const real = font.pe ? font.pe.width(text, size) : box;
    if (api.stats) { api.stats.n++; if (real > room) { api.stats.fit++; api.stats.min = Math.min(api.stats.min, room / real); if (api.stats.log) api.stats.log.push([+(room / real).toFixed(3), font.name, size, o.align || 'left', o.max != null ? 'max' : 'box', text.slice(0, 50)]); } }
    const k = real > room && real > 0 ? room / real : 1;
    const w = real * k;
    const x = o.align === 'right' ? o.x - w : o.align === 'center' ? o.x - w / 2 : o.x;
    const scale = v => page.pushOperators(PDFLib.PDFOperator.of(PDFLib.PDFOperatorNames.SetTextHorizontalScaling, [PDFLib.PDFNumber.of(v)]));
    if (k < 1) scale(Math.round(k * 10000) / 100);
    page.drawText(text, { x, y: o.y, size, font, color: o.color });
    if (k < 1) scale(100);
    return box;
  }

  return api;
});
