/* Catio Designer (Pro): the step-by-step build plan PDF. Pure functions over the engine's result; pdf-lib is passed in
 * (loaded only when a Pro user asks for the plan). The PDF and the page read the same result, so the cut list, the
 * mesh layout and the shopping list always agree with the page. The elevations are vectors drawn from the same members
 * as the 3D model, at a stated scale; the exploded step views are pictures of the live model.
 * Fonts: Gluten and Familjen Grotesk, embedded as TrueType with the WinAnsi encoding (fonts/cd-pdf-*.ttf, cut by
 * _build/fonts.py); if they cannot be fetched the plan is set in Helvetica with the same layout.
 * Works in the browser (window.CatioReport) and in Node for the tests. */
(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory();
  else root.CatioReport = factory();
})(typeof self !== 'undefined' ? self : this, function () {
  'use strict';
  // @metrics-start (copied from fonts/pdf-metrics.json, written by _build/fonts.py)
  const CUTS = {"GlutenPDF-ExtraBold":{"widths":[348,286,384,973,581,788,778,198,404,373,558,592,292,684,284,656,682,682,682,682,682,682,682,682,682,682,255,255,430,525,408,545,1022,821,686,644,733,584,618,807,794,366,674,791,660,997,858,830,690,810,692,642,754,771,852,1069,758,746,656,418,552,434,495,704,330,694,713,628,661,618,562,704,707,396,404,671,498,884,734,727,702,714,602,574,620,744,779,951,734,728,594,389,264,394,511,0,624,0,226,562,378,828,605,605,505,1032,642,242,1106,0,656,0,0,248,272,394,361,298,646,840,478,496,574,242,1060,0,594,746,348,263,500,568,590,746,264,560,464,802,281,437,504,488,821,480,318,590,262,272,326,781,554,205,386,182,312,437,606,604,697,540,821,830,821,821,821,821,1048,644,584,584,584,584,366,366,366,366,733,858,830,830,830,830,830,496,830,771,771,771,771,746,615,680,694,694,694,694,694,694,1013,628,618,618,618,618,366,366,366,366,586,734,727,727,727,727,727,600,727,744,744,744,744,728,702,728],"bbox":[-215,-236,1062,868],"ascent":645,"descent":-238,"capHeight":584,"xHeight":416,"italicAngle":0.0,"stemV":160,"file":"cd-pdf-display.ttf"},"FamiljenPDF-Regular":{"widths":[200,275,425,600,567,850,675,250,350,350,375,567,200,300,200,350,567,567,567,567,567,567,567,567,567,567,275,275,567,567,567,483,825,600,583,617,642,542,517,658,667,250,250,575,500,858,683,658,575,658,583,567,575,650,600,900,592,533,592,350,333,350,567,600,500,550,550,492,550,508,292,542,542,233,233,500,233,817,542,525,550,550,350,450,292,542,475,750,467,475,458,350,300,350,567,0,650,0,225,567,375,600,400,400,500,1225,567,375,867,0,592,0,0,200,200,375,375,300,600,900,500,783,450,375,817,0,458,533,200,275,533,567,567,567,300,600,500,767,367,600,567,300,500,500,425,567,400,400,500,542,600,200,500,400,350,600,950,950,950,483,600,600,600,600,600,600,800,617,542,542,542,542,250,250,250,250,642,683,658,658,658,658,658,567,658,650,650,650,650,533,580,592,550,550,550,550,550,550,817,492,508,508,508,508,233,233,233,233,525,542,525,525,525,525,525,567,525,542,542,542,542,475,550,475],"bbox":[-181,-178,1168,873],"ascent":1025,"descent":-225,"capHeight":650,"xHeight":500,"italicAngle":0.0,"stemV":80,"file":"cd-pdf-regular.ttf"},"FamiljenPDF-SemiBold":{"widths":[200,294,462,600,567,850,705,250,350,350,394,567,238,300,238,350,567,567,567,567,567,567,567,567,567,567,294,294,567,567,567,490,844,619,602,623,648,548,517,652,679,262,267,619,500,883,708,665,594,665,602,579,575,662,619,919,617,558,592,350,346,350,567,600,500,569,569,511,569,521,323,561,561,252,252,538,255,842,561,544,569,569,382,469,323,561,507,800,504,494,471,350,300,350,567,0,657,0,244,567,450,600,400,400,500,1225,579,375,854,0,592,0,0,238,238,450,450,319,600,900,500,783,469,375,842,0,471,558,200,294,533,567,567,567,300,600,500,767,367,600,567,300,500,500,425,567,400,400,500,567,600,238,500,400,362,600,950,950,950,490,619,619,619,619,619,619,838,623,548,548,548,548,262,262,262,262,648,708,665,665,665,665,665,567,665,662,662,662,662,558,597,617,569,569,569,569,569,569,829,511,521,521,521,521,252,252,252,252,544,561,544,544,544,544,544,567,544,561,561,561,561,494,569,494],"bbox":[-193,-179,1173,882],"ascent":1025,"descent":-225,"capHeight":650,"xHeight":500,"italicAngle":0.0,"stemV":120,"file":"cd-pdf-semibold.ttf"}};
  // @metrics-end
  const api = { base: '/catio-designer/fonts/', fontDir: null, forceStandard: false, index: {} };
  const ROLES = { regular: ['FamiljenPDF-Regular', 'Helvetica', 'CDPDFA'], bold: ['FamiljenPDF-SemiBold', 'Helvetica-Bold', 'CDPDFB'], display: ['GlutenPDF-ExtraBold', 'Helvetica-Bold', 'CDPDFC'] };
  const WIN = '€‚ƒ„…†‡ˆ‰Š‹ŒŽ‘’“”•–—˜™š›œžŸ';
  const MAP = { '≤': '<=', '≥': '>=', '−': '-', ' ': ' ', ' ': ' ', ' ': ' ' };
  const safe = s => String(s == null ? '' : s).replace(/[\s\S]/g, c => { const n = c.charCodeAt(0); if (c === '\n' || (n >= 32 && n < 127) || (n >= 0xa0 && n <= 0xff) || WIN.includes(c)) return c; return MAP[c] != null ? MAP[c] : ''; });
  const localDay = () => { const d = new Date(); return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`; };
  const longDate = iso => { const [y, m, d] = iso.split('-').map(Number); return `${d} ${['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'][m - 1]} ${y}`; };

  // ---------- fonts ----------
  const cache = {};
  async function readFont(file) {
    const node = typeof window === 'undefined' && typeof process === 'object' && process.versions && process.versions.node;
    if (node) {
      const get = typeof require === 'function' ? require : process.getBuiltinModule;
      const fs = get('fs'), path = get('path');
      const dirs = [api.fontDir, path.join(process.cwd(), 'src', 'catio-designer', 'fonts'), path.join(process.cwd(), 'catio-designer', 'fonts')].filter(Boolean);
      const dir = dirs.find(d => fs.existsSync(path.join(d, file)));
      if (!dir) throw new Error(`${file} not found`);
      return new Uint8Array(fs.readFileSync(path.join(dir, file)));
    }
    const r = await fetch(api.base + file);
    if (!r.ok) throw new Error(`${file}: HTTP ${r.status}`);
    return new Uint8Array(await r.arrayBuffer());
  }
  function embedCut(doc, PDFLib, name, tag, bytes) {
    const { StandardFontEmbedder, PDFFont } = PDFLib;
    const cut = CUTS[name];
    const std = StandardFontEmbedder.for('Helvetica');
    const emb = Object.create(StandardFontEmbedder.prototype);
    Object.assign(emb, { font: std.font, encoding: std.encoding, fontName: name, customName: undefined });
    emb.widthOfTextAtSize = (t, s) => std.encodeTextAsGlyphs(t).reduce((a, g) => a + (cut.widths[g.code - 32] || 0), 0) * s / 1000;
    emb.heightOfFontAtSize = s => (cut.ascent - cut.descent) * s / 1000;
    emb.sizeOfFontAtHeight = h => h * 1000 / (cut.ascent - cut.descent);
    emb.encodeText = t => std.encodeText(t);
    let dict = null;
    emb.embedIntoContext = async (context, ref) => {
      if (!dict) {
        const base = `${tag}+${name}`;
        const fileRef = context.register(context.flateStream(bytes, { Length1: bytes.length }));
        const descRef = context.register(context.obj({ Type: 'FontDescriptor', FontName: base, Flags: 32, FontBBox: cut.bbox, ItalicAngle: cut.italicAngle, Ascent: cut.ascent, Descent: cut.descent, CapHeight: cut.capHeight, XHeight: cut.xHeight, StemV: cut.stemV, FontFile2: fileRef }));
        dict = context.obj({ Type: 'Font', Subtype: 'TrueType', BaseFont: base, FirstChar: 32, LastChar: 255, Widths: cut.widths, FontDescriptor: descRef, Encoding: 'WinAnsiEncoding' });
      }
      context.assign(ref, dict);
      return ref;
    };
    const font = PDFFont.of(doc.context.nextRef(), doc, emb);
    doc.fonts.push(font);
    return font;
  }
  async function fonts(doc, PDFLib) {
    const out = {};
    let files = null;
    if (!api.forceStandard && Object.keys(CUTS).length) {
      try { files = await Promise.all(Object.values(ROLES).map(([n]) => (cache[n] = cache[n] || readFont(CUTS[n].file).catch(e => { delete cache[n]; throw e; })))); }
      catch (e) { files = null; if (typeof console !== 'undefined') console.warn('PDF fonts could not be loaded; using Helvetica.', e && e.message); }
    }
    const roles = Object.keys(ROLES);
    for (let i = 0; i < roles.length; i++) { const [name, fallback, tag] = ROLES[roles[i]]; out[roles[i]] = files ? embedCut(doc, PDFLib, name, tag, files[i]) : await doc.embedFont(fallback); }
    out.custom = !!files;
    return out;
  }

  // ---------- geometry helpers for the drawings ----------
  const sub = (a, b) => [a[0] - b[0], a[1] - b[1], a[2] - b[2]];
  const addv = (a, b) => [a[0] + b[0], a[1] + b[1], a[2] + b[2]];
  const mul = (a, k) => [a[0] * k, a[1] * k, a[2] * k];
  const dot = (a, b) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
  const cross = (a, b) => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
  const norm = a => { const l = Math.hypot(...a) || 1; return mul(a, 1 / l); };
  function corners(mem) {
    const dir = norm(sub(mem.p1, mem.p0)), L = Math.hypot(...sub(mem.p1, mem.p0));
    let up = mem.up ? mem.up.slice() : Math.abs(dir[1]) < 0.9 ? [0, 1, 0] : [0, 0, 1];
    up = norm(sub(up, mul(dir, dot(up, dir))));
    const side = norm(cross(dir, up));
    const c = mul(addv(mem.p0, mem.p1), 0.5), out = [];
    for (const i of [-1, 1]) for (const j of [-1, 1]) for (const k of [-1, 1]) out.push(addv(addv(addv(c, mul(dir, i * L / 2)), mul(up, j * mem.a / 2)), mul(side, k * mem.b / 2)));
    return out;
  }
  function hull(pts) {
    const p = pts.slice().sort((a, b) => a[0] - b[0] || a[1] - b[1]);
    if (p.length < 3) return p;
    const cr = (o, a, b) => (a[0] - o[0]) * (b[1] - o[1]) - (a[1] - o[1]) * (b[0] - o[0]);
    const lo = [], hi = [];
    for (const q of p) { while (lo.length >= 2 && cr(lo[lo.length - 2], lo[lo.length - 1], q) <= 0) lo.pop(); lo.push(q); }
    for (let i = p.length - 1; i >= 0; i--) { const q = p[i]; while (hi.length >= 2 && cr(hi[hi.length - 2], hi[hi.length - 1], q) <= 0) hi.pop(); hi.push(q); }
    return lo.slice(0, -1).concat(hi.slice(0, -1));
  }
  // views: front looks at the front (x right, y up), side looks from the right (z right, y up), plan from above (x right, z down)
  const VIEWS = { front: { u: p => p[0], v: p => p[1], depth: p => p[2] }, side: { u: p => p[2], v: p => p[1], depth: p => p[0] }, plan: { u: p => p[0], v: p => -p[2], depth: p => p[1] } };

  // ---------- the document ----------
  async function pdf(PDFLib, ctx) {
    const { res, E, D } = ctx;
    const m = res.m, d = res.design, u = m.units, both = !!ctx.both;
    const { PDFDocument, rgb, degrees } = PDFLib;
    const doc = await PDFDocument.create();
    doc.setTitle(safe(`Catio build plan, ${m.name || E.TYPE_NAME[m.type]}`)); doc.setAuthor('Catio Designer, Peak Apps Studio'); doc.setSubject('Step-by-step build plan for a DIY catio'); doc.setCreator('peakappsstudio.com/catio-designer/');
    const F = await fonts(doc, PDFLib);
    const C = { plum: rgb(0.141, 0.071, 0.227), plum2: rgb(0.357, 0.294, 0.451), plum3: rgb(0.545, 0.494, 0.639), lilac: rgb(0.933, 0.910, 1), lilac2: rgb(0.886, 0.855, 0.973), cedar: rgb(0.788, 0.541, 0.294), cedarLight: rgb(0.925, 0.808, 0.659), catnip: rgb(0.055, 0.478, 0.278), fits: rgb(0.169, 0.714, 0.451), marm: rgb(1, 0.541, 0.239), fail: rgb(0.761, 0.145, 0.239), white: rgb(1, 1, 1), line: rgb(0.82, 0.8, 0.87), blue: rgb(0.18, 0.357, 1) };
    const [PW, PH] = u === 'metric' ? [595.28, 841.89] : [612, 792];
    const M = 40, CW = PW - 2 * M;
    const L = (mm, kind) => (both ? E.both(mm, u, kind) : E.len(mm, u, kind));
    const made = longDate(localDay());
    let page = null, y = 0, pageNo = 0;
    api.index = {};
    const w = (t, f, s) => f.widthOfTextAtSize(safe(t), s);
    function newPage(section, title) {
      page = doc.addPage([PW, PH]); pageNo++;
      if (section && !api.index[section]) api.index[section] = pageNo;
      page.drawRectangle({ x: 0, y: PH - 8, width: PW, height: 8, color: C.cedar });
      page.drawText(safe(`Catio build plan, ${m.name || E.TYPE_NAME[m.type]}`), { x: M, y: 22, size: 8.5, font: F.regular, color: C.plum2 });
      const right = `Page ${pageNo}. Guidance for a hobby build, not an engineering guarantee.`;
      page.drawText(safe(right), { x: PW - M - w(right, F.regular, 8.5), y: 22, size: 8.5, font: F.regular, color: C.plum2 });
      y = PH - M - 6;
      if (title) { heading(title); }
    }
    function heading(t, size = 24) { ensure(size + 14); page.drawText(safe(t), { x: M, y: y - size, size, font: F.display, color: C.plum }); y -= size + 12; }
    function sub2(t) { ensure(26); page.drawText(safe(t), { x: M, y: y - 14, size: 13.5, font: F.bold, color: C.plum }); y -= 22; }
    function ensure(h) { if (y - h < M + 24) newPage(); }
    function lines(text, f, s, width) {
      const words = safe(text).split(/\s+/); const out = []; let cur = '';
      for (const wd of words) { const t = cur ? cur + ' ' + wd : wd; if (w(t, f, s) > width && cur) { out.push(cur); cur = wd; } else cur = t; }
      if (cur) out.push(cur); return out;
    }
    function para(text, o = {}) {
      const f = o.font || F.regular, s = o.size || 10.5, lh = s * 1.42, x = o.x || M, width = o.width || CW;
      for (const ln of lines(text, f, s, width)) { ensure(lh); page.drawText(ln, { x, y: y - s, size: s, font: f, color: o.color || C.plum }); y -= lh; }
      y -= o.after == null ? 6 : o.after;
    }
    // a table: cols [{h, w (share), align}], rows of cell strings
    function table(cols, rows, o = {}) {
      const s = o.size || 9.5, pad = 4, total = cols.reduce((a, c) => a + c.w, 0);
      const ws = cols.map(c => c.w / total * CW);
      const head = () => { ensure(22); let x = M; page.drawRectangle({ x: M, y: y - 16, width: CW, height: 16, color: C.lilac }); cols.forEach((c, i) => { page.drawText(safe(c.h), { x: c.align === 'right' ? x + ws[i] - pad - w(c.h, F.bold, s - 0.5) : x + pad, y: y - 11.5, size: s - 0.5, font: F.bold, color: C.plum2 }); x += ws[i]; }); y -= 18; };
      head();
      for (const r of rows) {
        if (r.group) { ensure(18); page.drawText(safe(r.group), { x: M + pad, y: y - 11, size: s, font: F.bold, color: C.plum2 }); y -= 16; continue; }
        const cells = r.cells.map((t, i) => lines(t, i === 0 && o.boldFirst ? F.bold : F.regular, s, ws[i] - 2 * pad));
        const h = Math.max(...cells.map(c => c.length)) * s * 1.32 + 6;
        if (y - h < M + 24) { newPage(); head(); }
        let x = M;
        cells.forEach((cl, i) => {
          cl.forEach((ln, k) => { const f = i === 0 && o.boldFirst ? F.bold : F.regular; page.drawText(ln, { x: cols[i].align === 'right' ? x + ws[i] - pad - w(ln, f, s) : x + pad, y: y - s - 2 - k * s * 1.32, size: s, font: f, color: r.color && i === 0 ? r.color : C.plum }); });
          x += ws[i];
        });
        y -= h;
        page.drawLine({ start: { x: M, y }, end: { x: M + CW, y }, thickness: 0.5, color: C.line });
      }
      y -= 8;
    }
    async function image(dataUrl, maxW, maxH) {
      if (!dataUrl) return;
      const b64 = dataUrl.split(',')[1];
      const bytes = typeof Buffer !== 'undefined' ? Uint8Array.from(Buffer.from(b64, 'base64')) : Uint8Array.from(atob(b64), c => c.charCodeAt(0));
      const img = /^data:image\/png/.test(dataUrl) ? await doc.embedPng(bytes) : await doc.embedJpg(bytes);
      const sc = Math.min(maxW / img.width, maxH / img.height);
      ensure(img.height * sc + 6);
      page.drawImage(img, { x: M + (CW - img.width * sc) / 2, y: y - img.height * sc, width: img.width * sc, height: img.height * sc });
      y -= img.height * sc + 8;
    }

    // ---- 1. cover ----
    newPage('cover');
    page.drawRectangle({ x: 0, y: PH - 220, width: PW, height: 212, color: C.lilac });
    page.drawText(safe('Build plan'), { x: M, y: PH - 80, size: 40, font: F.display, color: C.plum });
    page.drawText(safe(m.name || `Your ${E.TYPE_NAME[m.type].toLowerCase()}`), { x: M, y: PH - 116, size: 20, font: F.bold, color: C.plum });
    const dims = `${E.TYPE_NAME[m.type]}: ${L(d.W, 'dim')} wide, ${L(d.D, 'dim')} deep, ${L(d.Hb, 'dim')} high at the ${m.type === 'free' ? 'back' : m.type === 'balcony' && d.ceiling ? 'ceiling' : 'wall'}${Math.abs(d.Hb - d.Hf) > 1 ? `, ${L(d.Hf, 'dim')} at the front` : ''}.`;
    y = PH - 140; para(dims, { size: 11.5, width: CW });
    para(`Frame ${d.lumber.label} (actual ${d.lumber.actual}), ${res.cut.boards.length} boards of ${E.stockLabel(m.stock, u)}; mesh: ${res.mesh.mesh.label}, ${res.mesh.count} ${res.mesh.count === 1 ? 'roll' : 'rolls'}; roof: ${E.ROOF_NAME[m.roof].toLowerCase()}; for ${m.cats} ${m.cats === 1 ? 'cat' : 'cats'}. Made on ${made}.`, { size: 10.5, color: C.plum2 });
    y = PH - 236;
    // the guidance box, first thing on the first page
    const gx = M, gw = CW, warn = ['This plan is guidance for a hobby build, not an engineering guarantee. Check every size against your own site before you cut.', 'The tool does not size the frame for snow or wind. If you get heavy snow or strong wind, check locally with a builder or your building department.', 'Check HOA and lease rules before you build. This plan gives no permit or legal advice.', 'Keep pressure-treated lumber where the cat cannot rub or chew it, and close every gap: no opening a cat could squeeze through, even on top.'];
    const wl = warn.map(t => lines(t, F.regular, 10, gw - 28));
    const gh = wl.reduce((a, l) => a + l.length * 14 + 4, 0) + 30;
    page.drawRectangle({ x: gx, y: y - gh, width: gw, height: gh, color: C.white, borderColor: C.marm, borderWidth: 1.4 });
    page.drawRectangle({ x: gx, y: y - gh, width: 6, height: gh, color: C.marm });
    page.drawText(safe('Read this first'), { x: gx + 16, y: y - 20, size: 12.5, font: F.bold, color: C.plum });
    let yy = y - 38;
    for (const l of wl) { for (const ln of l) { page.drawText(ln, { x: gx + 16, y: yy, size: 10, font: F.regular, color: C.plum }); yy -= 14; } yy -= 4; }
    y -= gh + 14;
    const iso = ctx.shots && ctx.shots.views && ctx.shots.views.find(v => v.label === 'iso');
    if (iso) await image(iso.url, CW, y - M - 120);
    // what is in the plan
    sub2('In this plan');
    const toc = [['Shopping list', 'shop'], ['Cut list, board by board', 'cut'], ['Mesh cutting layout', 'mesh'], ['Elevations and plan, dimensioned', 'elev'], ['Build steps', 'steps'], ['Fixing to your wall', 'wall'], ['The checks, with sources', 'checks']];
    para(toc.map(t => t[0]).join('. ') + '.', { size: 10.5 });

    // ---- 2. shopping list ----
    newPage('shop', 'Shopping list');
    para('Quantities for this design. Prices come only from what you typed on the page; the tool ships none.', { color: C.plum2 });
    const shopRows = []; let lastG = '';
    for (const it of res.shop.items) { if (it.group !== lastG) { shopRows.push({ group: it.group }); lastG = it.group; } shopRows.push({ cells: [it.label + (it.note ? `. ${it.note}` : ''), `${it.qty} ${E.unit(it.qty, it.unit)}`, it.price != null ? it.price.toFixed(2) : '', it.cost != null ? it.cost.toFixed(2) : ''] }); }
    if (res.shop.priced) shopRows.push({ cells: ['Total of the prices you entered', '', '', res.shop.total.toFixed(2)] });
    table([{ h: 'Item', w: 6 }, { h: 'Quantity', w: 1.6, align: 'right' }, { h: 'Unit price', w: 1.3, align: 'right' }, { h: 'Cost', w: 1.2, align: 'right' }], shopRows);

    // ---- 3. cut list ----
    newPage('cut', 'Cut list');
    const cut = res.cut;
    para(`${cut.boards.length} boards of ${d.lumber.label} (actual ${d.lumber.actual}), ${Object.entries(cut.byStock).map(([s, n]) => `${n} x ${E.stockLabel(Number(s), u)}`).join(', ')}. Packed first-fit decreasing with a ${L(cut.kerf)} saw kerf: ${Math.round(cut.waste * 100)}% of the wood bought is left over, hatched at the end of each board. Cut the longest pieces first; mark each piece with its board and number.`, { color: C.plum2 });
    const maxStock = Math.max(...cut.boards.map(b => b.stock));
    const sc = CW / maxStock;
    for (const b of cut.boards) {
      ensure(54);
      const label = `Board ${b.n}: ${E.stockLabel(b.stock, u)}, ${b.cuts.length} ${b.cuts.length === 1 ? 'piece' : 'pieces'}, ${L(b.leftover)} left over`;
      page.drawText(safe(label), { x: M, y: y - 10, size: 9.5, font: F.bold, color: C.plum });
      y -= 16;
      const bh = 20; let x = M;
      b.cuts.forEach((c, i) => {
        const cw = c.len * sc;
        page.drawRectangle({ x, y: y - bh, width: Math.max(0.5, cw - 0.6), height: bh, color: i % 2 ? C.cedarLight : C.cedar, borderColor: C.plum, borderWidth: 0.6 });
        const t = L(c.len);
        if (w(t, F.regular, 8) < cw - 4) page.drawText(safe(t), { x: x + (cw - w(t, F.regular, 8)) / 2, y: y - bh / 2 - 3, size: 8, font: F.regular, color: C.plum });
        x += cw + cut.kerf * sc;
      });
      const lw = b.stock * sc - (x - M);
      if (lw > 0.5) { page.drawRectangle({ x, y: y - bh, width: lw, height: bh, color: C.lilac, borderColor: C.plum3, borderWidth: 0.6 }); for (let hx = x + 4; hx < x + lw; hx += 6) page.drawLine({ start: { x: hx, y: y - bh }, end: { x: Math.min(hx + 6, x + lw), y: y - 2 }, thickness: 0.5, color: C.plum3 }); }
      y -= bh + 4;
      const list = b.cuts.map((c, i) => `${i + 1}. ${L(c.len)} ${c.where.toLowerCase()}${c.angled ? ' (angled ends)' : ''}`).join('; ');
      para(list, { size: 8.5, color: C.plum2, after: 8 });
    }

    // ---- 4. mesh ----
    newPage('mesh', 'Mesh cutting layout');
    const ml = res.mesh;
    para(`${ml.mesh.label}. Roll ${L(m.roll.w)} wide by ${L(m.roll.l, 'dim')}: ${ml.count} ${ml.count === 1 ? 'roll' : 'rolls'} for ${L(ml.total, 'dim')} of strips. Overlap each strip on the last by ${L(ml.overlap)}, over a frame member where you can; tie overlaps between members with hog rings or stainless zip ties. Staple to the outside of the frame and cut flush to a wire.`, { color: C.plum2 });
    const faceRows = [];
    for (const f of ml.faces) for (const [ri, r] of f.rects.entries()) faceRows.push({ f, r, ri });
    const colW = (CW - 20) / 2; let col = 0, rowTop = y, rowH = 0;
    for (const { f, r, ri } of faceRows) {
      const rect = r.rect, hmax = Math.max(rect.h0, rect.h1);
      const s2 = Math.min((colW - 10) / rect.w, 150 / hmax);
      const fw = rect.w * s2, fh = hmax * s2;
      const need = fh + 44;
      if (col === 0) { if (y - need < M + 24) { newPage(); } rowTop = y; rowH = 0; }
      const x0 = M + col * (colW + 20), y0 = rowTop - 14;
      page.drawText(safe(`${f.label}${f.rects.length > 1 ? `, part ${ri + 1}` : ''}: ${r.strips.length} ${r.orient} ${r.strips.length === 1 ? 'strip' : 'strips'}`), { x: x0, y: y0, size: 9.5, font: F.bold, color: C.plum });
      const base = y0 - 8 - fh;
      r.strips.forEach((s, i) => {
        if (r.orient === 'vertical') page.drawRectangle({ x: x0 + s.at * s2, y: base, width: s.cover * s2, height: s.len * s2, color: i % 2 ? C.lilac2 : C.lilac, borderColor: C.plum, borderWidth: 0.6, opacity: 0.9 });
        else page.drawRectangle({ x: x0, y: base + s.at * s2, width: s.len * s2, height: s.cover * s2, color: i % 2 ? C.lilac2 : C.lilac, borderColor: C.plum, borderWidth: 0.6, opacity: 0.9 });
      });
      page.drawSvgPath(`M 0 0 L ${fw} 0 L ${fw} ${-rect.h1 * s2} L 0 ${-rect.h0 * s2} Z`, { x: x0, y: base, borderColor: C.cedar, borderWidth: 1.6 });
      const cap = r.strips.map(s => L(s.len)).join(', ');
      const capL = lines(`Strips: ${cap}`, F.regular, 8.5, colW);
      capL.forEach((ln, k) => page.drawText(ln, { x: x0, y: base - 12 - k * 11, size: 8.5, font: F.regular, color: C.plum2 }));
      rowH = Math.max(rowH, need + capL.length * 11);
      col++;
      if (col === 2) { col = 0; y = rowTop - rowH - 6; }
    }
    if (col === 1) y = rowTop - rowH - 6;
    sub2('Cutting the rolls');
    table([{ h: 'Roll', w: 1 }, { h: 'Strips cut from it, in order', w: 6 }, { h: 'Left', w: 1.4, align: 'right' }], ml.rolls.map((b, i) => ({ cells: [String(i + 1), b.cuts.map(c => `${L(c.len)} (${c.where.toLowerCase()})`).join('; '), L(b.leftover, 'dim')] })));

    // ---- 5. elevations ----
    newPage('elev', 'Elevations and plan');
    const views = [['front', 'Front elevation'], ['side', 'Side elevation, from the right'], ['plan', 'Plan, from above']];
    const mems = d.members;
    const MMPT = 72 / 25.4;
    for (const [v, title] of views) {
      const V = VIEWS[v];
      const polys = mems.map(mem => { const cs = corners(mem); return { pts: hull(cs.map(p => [V.u(p), V.v(p)])), depth: Math.max(...cs.map(V.depth)), mem }; });
      let u0 = Infinity, u1 = -Infinity, v0 = Infinity, v1 = -Infinity;
      for (const p of polys) for (const q of p.pts) { u0 = Math.min(u0, q[0]); u1 = Math.max(u1, q[0]); v0 = Math.min(v0, q[1]); v1 = Math.max(v1, q[1]); }
      const boxW = CW - 60, boxH = v === 'plan' ? 190 : 200;
      const scales = [5, 10, 12, 15, 20, 24, 25, 30, 40, 48, 50, 60, 75, 96, 100];
      const N = scales.find(n => (u1 - u0) / n * MMPT <= boxW && (v1 - v0) / n * MMPT <= boxH) || 150;
      const k = MMPT / N;
      const dh = (v1 - v0) * k;
      ensure(dh + 60);
      page.drawText(safe(`${title}. Scale 1:${N} on ${u === 'metric' ? 'A4' : 'Letter'}`), { x: M, y: y - 12, size: 11, font: F.bold, color: C.plum });
      const ox = M + 30 + (boxW - (u1 - u0) * k) / 2 - u0 * k, oy = y - 30 - dh - v0 * k;
      polys.sort((a, b) => (v === 'plan' ? a.depth - b.depth : a.depth - b.depth));
      for (const p of polys) {
        if (p.pts.length < 3) continue;
        const path = p.pts.map((q, i) => `${i ? 'L' : 'M'} ${(q[0] * k).toFixed(2)} ${(-q[1] * k).toFixed(2)}`).join(' ') + ' Z';
        page.drawSvgPath(path, { x: ox, y: oy, color: p.mem.addon ? C.cedarLight : C.cedar, borderColor: C.plum, borderWidth: 0.45 });
      }
      // dimension lines
      const dim = (a, b, at, label, vertical) => {
        const t = safe(label);
        if (!vertical) {
          const yv = oy + at * k; page.drawLine({ start: { x: ox + a * k, y: yv }, end: { x: ox + b * k, y: yv }, thickness: 0.6, color: C.blue });
          for (const e of [a, b]) page.drawLine({ start: { x: ox + e * k, y: yv - 4 }, end: { x: ox + e * k, y: yv + 4 }, thickness: 0.6, color: C.blue });
          page.drawText(t, { x: ox + (a + b) / 2 * k - w(t, F.regular, 8.5) / 2, y: yv + 3, size: 8.5, font: F.regular, color: C.blue });
        } else {
          const xv = ox + at * k; page.drawLine({ start: { x: xv, y: oy + a * k }, end: { x: xv, y: oy + b * k }, thickness: 0.6, color: C.blue });
          for (const e of [a, b]) page.drawLine({ start: { x: xv - 4, y: oy + e * k }, end: { x: xv + 4, y: oy + e * k }, thickness: 0.6, color: C.blue });
          page.drawText(t, { x: xv + 4, y: oy + (a + b) / 2 * k, size: 8.5, font: F.regular, color: C.blue, rotate: degrees(90) });
        }
      };
      if (v === 'front') { dim(0, d.W, v0 - 9 / k * 1.3, L(d.W, 'dim'), false); dim(0, d.Hf, u1 + 8 / k, L(d.Hf, 'dim'), true); if (d.door) dim(d.door.x0, d.door.x0 + d.door.w, d.door.h + d.door.y0 + 6 / k, `door ${L(d.door.w)}`, false); }
      if (v === 'side') { dim(0, d.D, v0 - 9 / k * 1.3, L(d.D, 'dim'), false); dim(0, d.Hb, u0 - 8 / k, L(d.Hb, 'dim'), true); if (Math.abs(d.Hb - d.Hf) > 1) dim(0, d.Hf, u1 + 8 / k, L(d.Hf, 'dim'), true); }
      if (v === 'plan') { dim(0, d.W, v1 + 8 / k, L(d.W, 'dim'), false); dim(-d.D, 0, u1 + 8 / k, L(d.D, 'dim'), true); }
      y -= dh + 56;
      if (v === 'front') ensure(60);
    }

    // ---- 6. the steps ----
    newPage('steps', 'Build steps');
    para('Build in this order. Each picture shows the pieces of that step lifted out in orange, where they go, over the work already done. The pieces for each step are listed under it.', { color: C.plum2 });
    const pics = (ctx.shots && ctx.shots.steps) || [];
    for (const st of res.steps) {
      const parts = res.cut.cuts.filter(c => c.step === st.n);
      const sheetsOf = d.sheets.filter(s => s.step === st.n);
      const pic = pics.find(p => p.n === st.n);
      ensure(pic ? 280 : 90);
      sub2(`Step ${res.steps.indexOf(st) + 1}. ${st.title}`);
      para(st.text, { size: 10.5 });
      if (pic) await image(pic.url, CW * 0.86, 230);
      if (parts.length) {
        const groups = {};
        for (const c of parts) { const key = `${c.where}|${Math.round(c.len)}`; groups[key] = groups[key] || { where: c.where, len: c.len, n: 0, angled: c.angled }; groups[key].n++; }
        para(`Pieces: ${Object.values(groups).map(g => `${g.n} x ${L(g.len)} ${g.where.toLowerCase()}${g.angled ? ' (angled ends)' : ''}`).join('; ')}.`, { size: 9, color: C.plum2 });
      }
      if (sheetsOf.length) para(`Plywood: ${sheetsOf.map(s => `${s.where.toLowerCase()} ${L(Math.min(s.w, s.l))} x ${L(Math.max(s.w, s.l))}`).join('; ')}.`, { size: 9, color: C.plum2 });
      if (st.n === 6) para(`Mesh: ${res.mesh.count} ${res.mesh.count === 1 ? 'roll' : 'rolls'}, cut as the mesh layout shows. Staples about every ${u === 'metric' ? '75 mm' : '3 in'}, washer-head screws about every ${u === 'metric' ? '300 mm' : '12 in'} round each panel.`, { size: 9, color: C.plum2 });
      y -= 4;
    }

    // ---- 7. fixing to the wall ----
    newPage('wall', d.attached ? 'Fixing to your wall' : 'Standing it on the ground');
    const WALL = D.WALLS[m.wall];
    if (d.attached && !(m.type === 'balcony' && m.bal.nodrill)) {
      para(`Your wall: ${WALL.label}. ${WALL.fix}`, { size: 11 });
      para(`On this design ${d.members.filter(x => x.wallFix).length} pieces are fixed to the house: ${[...new Set(d.members.filter(x => x.wallFix).map(x => x.where.toLowerCase()))].join('; ')}. Keep the wood off the wall face where water runs, and seal round each fixing.`, { size: 10.5 });
      // a section through the fixing
      ensure(200);
      const sx = M + 40, sy = y - 180;
      page.drawRectangle({ x: sx, y: sy, width: 46, height: 170, color: m.wall === 'masonry' ? rgb(0.75, 0.5, 0.42) : C.lilac2, borderColor: C.plum, borderWidth: 0.8 });
      page.drawText(safe(m.wall === 'masonry' ? 'Brick or block' : 'Wall, siding and sheathing'), { x: sx + 4, y: sy + 176, size: 8.5, font: F.regular, color: C.plum2 });
      if (m.wall !== 'masonry') { page.drawRectangle({ x: sx - 30, y: sy, width: 30, height: 170, color: C.cedarLight, borderColor: C.plum, borderWidth: 0.6 }); page.drawText(safe('Stud'), { x: sx - 28, y: sy + 80, size: 8.5, font: F.regular, color: C.plum }); }
      page.drawRectangle({ x: sx + 50, y: sy + 60, width: 4, height: 50, color: C.plum3 });
      page.drawText(safe('Spacer'), { x: sx + 50, y: sy + 48, size: 8, font: F.regular, color: C.plum2 });
      page.drawRectangle({ x: sx + 56, y: sy + 30, width: d.w / 25.4 * 10, height: 110, color: C.cedar, borderColor: C.plum, borderWidth: 0.8 });
      page.drawText(safe(`Wall batten, ${d.lumber.label}`), { x: sx + 62 + d.w / 25.4 * 10, y: sy + 120, size: 9, font: F.regular, color: C.plum });
      page.drawLine({ start: { x: sx + 56 + d.w / 25.4 * 10 + 6, y: sy + 85 }, end: { x: m.wall === 'masonry' ? sx + 10 : sx - 22, y: sy + 85 }, thickness: 2.6, color: C.plum });
      page.drawText(safe(m.wall === 'masonry' ? 'Masonry anchor into the brick, not the mortar' : 'Structural screw or lag screw into the stud'), { x: sx + 62 + d.w / 25.4 * 10, y: sy + 80, size: 9, font: F.regular, color: C.plum });
      y = sy - 16;
    } else if (m.type === 'balcony' && m.bal.nodrill) {
      para(`No drilling: ${d.tension} floor-to-ceiling tension posts, set to ${L(m.h, 'dim')}, hold the frames. Clamp each frame to its posts with pipe clamps or post brackets, pad the post ends so they do not mark the floor and ceiling, and tighten them to the maker's instructions. Check the posts every few weeks.`, { size: 11 });
    } else {
      para('Stand the base frame level on pavers, a deck or a gravel bed. Lay mesh under the base frame on soft ground so nothing digs in, and anchor the frame against wind with ground anchors or stakes at the corners.', { size: 11 });
    }

    // ---- 8. checks ----
    newPage('checks', 'The checks, with sources');
    para('Guidance from the sources named in each row, read on 12 October 2026. No official standard for catios exists.', { color: C.plum2 });
    const word = { fits: 'Fits', check: 'Check', fail: 'Fail', info: 'Note' }, col2 = { fits: C.catnip, check: rgb(0.62, 0.29, 0.07), fail: C.fail, info: C.plum2 };
    table([{ h: 'Result', w: 1 }, { h: 'Check', w: 2 }, { h: 'Yours', w: 2.4 }, { h: 'Guide', w: 2.2 }, { h: 'Why, and the source', w: 5 }], res.checks.map(r => ({ color: col2[r.status], cells: [word[r.status], r.title, r.yours, r.limit, `${r.reason} ${r.sources.map(s => `${s.short} (${s.url}, read ${s.checked})`).join('; ')}`] })), { size: 8.5, boldFirst: true });
    para(`Made with Catio Designer on ${made}: peakappsstudio.com/catio-designer/. Share code of this design: ${E.encode(m).slice(0, 60)}${E.encode(m).length > 60 ? '...' : ''}`, { size: 8.5, color: C.plum2 });
    return doc.save();
  }
  function pageOf(res, section) { return api.index[section] || 1; }
  return { api, pdf, pageOf, safe, corners, hull };
});
