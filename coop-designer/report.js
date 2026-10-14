/* Coop Designer (Pro): the step-by-step build plan PDF. Pure functions over the engine's result; pdf-lib is passed in
 * (loaded only when a Pro user asks for the plan). The PDF and the page read the same result, so the cut list, the
 * hardware-cloth layout and the shopping list always agree with the page. The elevations are vectors drawn from the
 * same members as the 3D model, at a stated scale; the exploded step views are pictures of the live model.
 * Fonts: Parkinsans and Geologica, embedded as TrueType with the WinAnsi encoding (fonts/co-pdf-*.ttf, cut by
 * _build/fonts.py); if they cannot be fetched the plan is set in Helvetica with the same layout.
 * Works in the browser (window.CoopReport) and in Node for the tests. */
(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory();
  else root.CoopReport = factory();
})(typeof self !== 'undefined' ? self : this, function () {
  'use strict';
  // @metrics-start (copied from fonts/pdf-metrics.json, written by _build/fonts.py)
  const CUTS = {"ParkinsansPDF-ExtraBold":{"widths":[191,405,451,919,649,904,814,243,470,470,548,700,292,578,297,425,657,526,569,623,691,664,638,523,653,611,298,323,700,700,700,524,1104,755,671,748,735,548,561,757,743,460,582,722,491,935,765,787,636,770,702,636,604,712,746,1076,739,701,613,522,840,521,733,772,307,679,679,602,679,618,373,679,686,295,326,650,362,1067,686,636,680,679,448,545,456,686,649,885,628,668,507,492,277,492,674,0,774,0,292,338,567,811,686,685,340,1232,636,355,1056,0,613,0,0,350,350,625,625,519,689,933,434,915,545,355,1032,0,507,701,191,405,612,674,590,701,407,591,392,775,475,588,700,0,512,436,480,700,403,389,270,728,743,320,328,297,464,588,833,874,957,524,755,755,755,755,755,755,971,748,548,548,548,548,460,460,460,460,738,765,787,787,787,787,787,700,787,712,712,712,712,701,636,788,679,679,679,679,679,679,1102,602,618,618,618,618,347,347,347,347,641,686,636,636,636,636,636,700,625,686,686,686,686,668,680,668],"bbox":[-124,-288,1207,995],"ascent":1050,"descent":-350,"capHeight":690,"xHeight":546,"italicAngle":0.0,"stemV":160,"file":"co-pdf-display.ttf"},"GeologicaPDF-Regular":{"widths":[245,322,408,634,648,1032,749,228,346,346,550,648,269,389,269,456,648,648,648,648,648,648,650,648,648,648,294,294,648,648,648,494,855,694,634,698,712,612,580,751,746,294,502,695,544,914,752,832,634,832,664,628,560,740,662,1018,670,620,584,346,456,346,648,545,500,552,646,516,646,572,388,598,616,263,263,558,263,947,616,604,646,646,410,494,430,604,522,789,536,532,488,346,292,346,648,0,648,0,278,648,489,1000,630,630,500,1488,628,313,1188,0,584,0,0,269,269,480,480,500,500,1000,500,954,494,313,998,0,488,620,245,335,648,648,648,648,292,628,500,838,400,530,648,0,611,500,456,648,416,410,500,618,644,269,500,318,427,530,915,930,1008,488,694,694,694,694,694,694,890,698,612,612,612,612,294,294,294,294,732,752,832,832,832,832,832,648,832,740,740,740,740,620,642,633,552,552,552,552,552,552,905,516,572,572,572,572,263,263,263,263,594,616,604,604,604,604,604,648,604,604,604,604,604,532,646,532],"bbox":[-64,-226,1451,1018],"ascent":975,"descent":-275,"capHeight":700,"xHeight":480,"italicAngle":0.0,"stemV":80,"file":"co-pdf-regular.ttf"},"GeologicaPDF-SemiBold":{"widths":[235,338,440,643,648,1040,761,240,354,354,568,648,282,394,282,464,648,648,648,648,648,648,650,648,648,648,303,303,648,648,648,507,850,714,650,698,722,628,590,752,764,318,520,720,555,929,769,828,650,828,680,635,572,751,684,1030,686,639,587,354,464,354,648,555,500,570,660,529,660,587,408,608,642,288,288,588,288,972,642,616,660,660,432,513,442,626,548,816,588,565,506,354,319,354,648,0,648,0,286,648,523,1000,647,647,500,1492,635,330,1172,0,587,0,0,282,282,518,518,500,500,1000,500,966,513,330,1000,0,506,639,235,345,648,648,648,648,319,640,500,838,410,564,648,0,609,500,452,648,418,411,500,638,674,282,500,324,434,564,927,940,1014,504,714,714,714,714,714,714,902,698,628,628,628,628,318,318,318,318,742,769,828,828,828,828,828,648,828,751,751,751,751,639,660,668,570,570,570,570,570,570,919,529,587,587,587,587,288,288,288,288,608,642,616,616,616,616,616,648,616,626,626,626,626,565,660,565],"bbox":[-70,-226,1464,1033],"ascent":975,"descent":-275,"capHeight":700,"xHeight":480,"italicAngle":0.0,"stemV":120,"file":"co-pdf-semibold.ttf"}};
  // @metrics-end
  const api = { base: '/coop-designer/fonts/', fontDir: null, forceStandard: false, index: {} };
  const ROLES = { regular: ['GeologicaPDF-Regular', 'Helvetica', 'COPDFA'], bold: ['GeologicaPDF-SemiBold', 'Helvetica-Bold', 'COPDFB'], display: ['ParkinsansPDF-ExtraBold', 'Helvetica-Bold', 'COPDFC'] };
  const WIN = '€‚ƒ„…†‡ˆ‰Š‹ŒŽ‘’“”•–—˜™š›œžŸ';
  const MAP = { '≤': '<=', '≥': '>=', '−': '-', ' ': ' ', ' ': ' ', ' ': ' ', '²': '2' };
  const safe = s => String(s == null ? '' : s).replace(/[\s\S]/g, c => { const n = c.charCodeAt(0); if (n === 0xa0 || n === 0x2009 || n === 0x202f) return ' '; if (c === '\n' || (n >= 32 && n < 127) || (n >= 0xa0 && n <= 0xff) || WIN.includes(c)) return c; return MAP[c] != null ? MAP[c] : ''; });
  const localDay = () => { const d = new Date(); return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`; };

  // ---------- fonts ----------
  const cache = {};
  async function readFont(file) {
    const node = typeof window === 'undefined' && typeof process === 'object' && process.versions && process.versions.node;
    if (node) {
      const get = typeof require === 'function' ? require : process.getBuiltinModule;
      const fs = get('fs'), path = get('path');
      const dirs = [api.fontDir, path.join(process.cwd(), 'src', 'coop-designer', 'fonts'), path.join(process.cwd(), 'coop-designer', 'fonts')].filter(Boolean);
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
    up = sub(up, mul(dir, dot(up, dir)));
    if (Math.hypot(...up) < 1e-6) up = [0, 0, 1];
    up = norm(up);
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
  // views: front looks at the front (x right, y up), side looks from the far end (z right, y up), plan from above
  const VIEWS = { front: { u: p => p[0], v: p => p[1], depth: p => p[2] }, side: { u: p => p[2], v: p => p[1], depth: p => p[0] }, plan: { u: p => p[0], v: p => -p[2], depth: p => p[1] } };

  // ---------- the document ----------
  async function pdf(PDFLib, ctx) {
    const { res, E, D } = ctx;
    const T = (k, p) => E.t(k, p), I = E.I;
    // piece names read as part of a sentence; German keeps the capital of its nouns
    const low = x => (E.getLang && E.getLang() === 'de' ? x : x.toLowerCase());
    const longDate = iso => I.date(iso);
    const money = x => I.dec(x.toFixed(2));
    const short = s => (s.id && I.has(`src.${s.id}`) ? T(`src.${s.id}`) : s.short);
    const m = res.m, d = res.design, u = m.units, both = !!ctx.both;
    const { PDFDocument, rgb, degrees } = PDFLib;
    const doc = await PDFDocument.create();
    const name = m.name || E.TYPE_NAME[m.type];
    doc.setTitle(safe(T('pdf.docTitle', { name }))); doc.setAuthor(T('pdf.author')); doc.setSubject(T('pdf.subject')); doc.setCreator(T('pdf.creator'));
    const F = await fonts(doc, PDFLib);
    const C = { choc: rgb(0.180, 0.102, 0.071), choc2: rgb(0.373, 0.290, 0.243), choc3: rgb(0.541, 0.467, 0.420), egg: rgb(0.863, 0.937, 0.918), egg2: rgb(0.788, 0.902, 0.875), pine: rgb(0.851, 0.639, 0.373), pineLight: rgb(0.925, 0.808, 0.627), olive: rgb(0.337, 0.439, 0.102), leaf: rgb(0.608, 0.773, 0.239), yolk: rgb(1, 0.690, 0), fox: rgb(0.776, 0.239, 0.184), white: rgb(1, 1, 1), line: rgb(0.80, 0.84, 0.82), soil: rgb(0.62, 0.48, 0.34), wire: rgb(0.42, 0.45, 0.48) };
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
      page.drawRectangle({ x: 0, y: PH - 8, width: PW, height: 8, color: C.yolk });
      page.drawText(safe(T('pdf.docTitle', { name })), { x: M, y: 22, size: 8.5, font: F.regular, color: C.choc2 });
      const right = T('pdf.foot', { n: pageNo });
      page.drawText(safe(right), { x: PW - M - w(right, F.regular, 8.5), y: 22, size: 8.5, font: F.regular, color: C.choc2 });
      y = PH - M - 6;
      if (title) heading(title);
    }
    function heading(t, size = 24) { ensure(size + 14); page.drawText(safe(t), { x: M, y: y - size, size, font: F.display, color: C.choc }); y -= size + 12; }
    function sub2(t) { ensure(26); page.drawText(safe(t), { x: M, y: y - 14, size: 13.5, font: F.bold, color: C.choc }); y -= 22; }
    function ensure(h) { if (y - h < M + 24) newPage(); }
    function lines(text, f, s, width) {
      const words = safe(text).split(/\s+/); const out = []; let cur = '';
      for (const wd of words) {
        const t = cur ? cur + ' ' + wd : wd;
        if (w(t, f, s) <= width) { cur = t; continue; }
        if (cur) out.push(cur);
        // a word wider than the line (a long web address): break it after a slash, or anywhere if it has none
        let rest = wd;
        while (rest.length > 1 && w(rest, f, s) > width) {
          let n = rest.length - 1; while (n > 1 && w(rest.slice(0, n), f, s) > width) n--;
          const slash = rest.lastIndexOf('/', n - 1);
          const at = slash > n * 0.4 ? slash + 1 : n;
          out.push(rest.slice(0, at)); rest = rest.slice(at);
        }
        cur = rest;
      }
      if (cur) out.push(cur); return out;
    }
    // a clickable web address over a box on the page (a PDF link annotation); skipped if pdf-lib lacks the parts
    function link(x, y0, wd, h, url) {
      try {
        const { PDFName, PDFString } = PDFLib;
        const ref = doc.context.register(doc.context.obj({ Type: 'Annot', Subtype: 'Link', Rect: [x, y0, x + wd, y0 + h], Border: [0, 0, 0], A: { Type: 'Action', S: 'URI', URI: PDFString.of(url) } }));
        const annots = page.node.lookup(PDFName.of('Annots'));
        if (annots) annots.push(ref); else page.node.set(PDFName.of('Annots'), doc.context.obj([ref]));
      } catch (e) { /* the address is printed anyway */ }
    }
    const cutNote = c => (c.angled && !new RegExp(T('pdf.cutWords'), 'i').test(c.where) ? T('pdf.angled') : '');
    function para(text, o = {}) {
      const f = o.font || F.regular, s = o.size || 10.5, lh = s * 1.42, x = o.x || M, width = o.width || CW;
      for (const ln of lines(text, f, s, width)) { ensure(lh); page.drawText(ln, { x, y: y - s, size: s, font: f, color: o.color || C.choc }); y -= lh; }
      y -= o.after == null ? 6 : o.after;
    }
    function table(cols, rows, o = {}) {
      const s = o.size || 9.5, pad = 4, total = cols.reduce((a, c) => a + c.w, 0);
      const ws = cols.map(c => c.w / total * CW);
      const head = () => { ensure(22); let x = M; page.drawRectangle({ x: M, y: y - 16, width: CW, height: 16, color: C.egg }); cols.forEach((c, i) => { page.drawText(safe(c.h), { x: c.align === 'right' ? x + ws[i] - pad - w(c.h, F.bold, s - 0.5) : x + pad, y: y - 11.5, size: s - 0.5, font: F.bold, color: C.choc2 }); x += ws[i]; }); y -= 18; };
      head();
      for (const r of rows) {
        if (r.group) { ensure(18); page.drawText(safe(r.group), { x: M + pad, y: y - 11, size: s, font: F.bold, color: C.choc2 }); y -= 16; continue; }
        const cells = r.cells.map((t, i) => lines(t, i === 0 && o.boldFirst ? F.bold : F.regular, s, ws[i] - 2 * pad));
        const h = Math.max(...cells.map(c => c.length)) * s * 1.32 + 6;
        if (y - h < M + 24) { newPage(); head(); }
        let x = M;
        cells.forEach((cl, i) => {
          cl.forEach((ln, k) => { const f = i === 0 && o.boldFirst ? F.bold : F.regular; page.drawText(ln, { x: cols[i].align === 'right' ? x + ws[i] - pad - w(ln, f, s) : x + pad, y: y - s - 2 - k * s * 1.32, size: s, font: f, color: r.color && i === 0 ? r.color : C.choc }); });
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
    page.drawRectangle({ x: 0, y: PH - 220, width: PW, height: 212, color: C.egg });
    page.drawText(safe(T('pdf.cover')), { x: M, y: PH - 80, size: 40, font: F.display, color: C.choc });
    page.drawText(safe(m.name || T('v.your', { type: E.TYPE_SHORT[m.type] })), { x: M, y: PH - 116, size: 20, font: F.bold, color: C.choc });
    const fp = res.footprint;
    const birds = T('pdf.birds', { n: m.birds, bantam: m.size === 'bantam' });
    y = PH - 140;
    para(T('pdf.coverLine', { type: E.TYPE_NAME[m.type], birds, x: L(fp.x, 'dim'), z: L(fp.z, 'dim'), coop: E.area(res.areas.coopA, u), run: E.area(res.areas.runA, u), under: res.areas.under > 0 && m.type !== 'walkin' ? E.area(res.areas.under, u) : '' }), { size: 11.5 });
    para(T('pdf.coverMat', { lumber: d.lumber.label, actual: d.lumber.actual, boards: res.cut.boards.length, stock: E.stockLabel(m.stock, u), frameBoards: res.cut.sections.length ? res.cut.sections[0].boards.length : res.cut.boards.length, frameStock: [...new Set((res.cut.sections.length ? res.cut.sections[0].boards : []).map(b => b.stock))].sort((a, b) => a - b).map(x => E.stockLabel(x, u)).join(T('v.and')) || E.stockLabel(m.stock, u), mesh: res.mesh.mesh.label, rolls: res.mesh.count, nests: d.nests ? d.nests.n : 0, bars: d.roosts ? d.roosts.bars : 0, made }), { size: 10.5, color: C.choc2 });
    y = PH - 236;
    const gx = M, gw = CW, warn = [1, 2, 3, 4].map(i => T(`pdf.warn${i}`));
    const wl = warn.map(t => lines(t, F.regular, 10, gw - 28));
    const gh = wl.reduce((a, l) => a + l.length * 14 + 4, 0) + 30;
    page.drawRectangle({ x: gx, y: y - gh, width: gw, height: gh, color: C.white, borderColor: C.yolk, borderWidth: 1.4 });
    page.drawRectangle({ x: gx, y: y - gh, width: 6, height: gh, color: C.yolk });
    page.drawText(safe(T('pdf.readFirst')), { x: gx + 16, y: y - 20, size: 12.5, font: F.bold, color: C.choc });
    let yy = y - 38;
    for (const l of wl) { for (const ln of l) { page.drawText(ln, { x: gx + 16, y: yy, size: 10, font: F.regular, color: C.choc }); yy -= 14; } yy -= 4; }
    y -= gh + 14;
    const iso = ctx.shots && ctx.shots.views && ctx.shots.views.find(v => v.label === 'iso');
    if (iso) await image(iso.url, CW, y - M - 120);
    sub2(T('pdf.inPlan'));
    para(T('pdf.toc'), { size: 10.5 });

    // ---- 2. shopping list ----
    newPage('shop', T('pdf.shop'));
    para(T('pdf.shopNote'), { color: C.choc2 });
    const shopRows = []; let lastG = '';
    for (const it of res.shop.items) { if (it.group !== lastG) { shopRows.push({ group: it.group }); lastG = it.group; } shopRows.push({ cells: [it.label + (it.note ? `. ${it.note}` : ''), `${it.qty} ${E.unit(it.qty, it.unit)}`, it.price != null ? money(it.price) : '', it.cost != null ? money(it.cost) : ''] }); }
    if (res.shop.priced) shopRows.push({ cells: [T('v.total'), '', '', money(res.shop.total)] });
    table([{ h: T('pdf.h.item'), w: 6 }, { h: T('v.h.qty'), w: 1.6, align: 'right' }, { h: T('pdf.h.unitPrice'), w: 1.3, align: 'right' }, { h: T('v.h.cost'), w: 1.2, align: 'right' }], shopRows);

    // ---- 3. cut list ----
    newPage('cut', T('pdf.cut'));
    const cut = res.cut;
    para(T('pdf.cutIntro', { n: cut.boards.length, secs: cut.sections.map(s => T('pdf.cutSec', { n: s.boards.length, lumber: s.lumber.label, actual: s.lumber.actual || '' })).join(', '), kerf: L(cut.kerf), trim: L(cut.trim), waste: Math.round(cut.waste * 100) }), { color: C.choc2 });
    const maxStock = Math.max(...cut.boards.map(b => b.stock));
    const sc = CW / maxStock;
    for (const b of cut.boards) {
      ensure(54);
      const sec = cut.sections.find(s => s.sec === b.sec);
      const label = T('pdf.board', { n: b.n, lumber: sec ? sec.lumber.label : b.sec, stock: E.stockLabel(b.stock, u), pieces: b.cuts.length, left: L(b.leftover) });
      page.drawText(safe(label), { x: M, y: y - 10, size: 9.5, font: F.bold, color: C.choc });
      y -= 16;
      const bh = 20; let x = M;
      b.cuts.forEach((c, i) => {
        const cw = c.len * sc;
        page.drawRectangle({ x, y: y - bh, width: Math.max(0.5, cw - 0.6), height: bh, color: i % 2 ? C.pineLight : C.pine, borderColor: C.choc, borderWidth: 0.6 });
        const t = L(c.len);
        if (w(t, F.regular, 8) < cw - 4) page.drawText(safe(t), { x: x + (cw - w(t, F.regular, 8)) / 2, y: y - bh / 2 - 3, size: 8, font: F.regular, color: C.choc });
        x += cw + cut.kerf * sc;
      });
      const lw = b.stock * sc - (x - M);
      if (lw > 0.5) { page.drawRectangle({ x, y: y - bh, width: lw, height: bh, color: C.egg, borderColor: C.choc3, borderWidth: 0.6 }); for (let hx = x + 4; hx < x + lw; hx += 6) page.drawLine({ start: { x: hx, y: y - bh }, end: { x: Math.min(hx + 6, x + lw), y: y - 2 }, thickness: 0.5, color: C.choc3 }); }
      y -= bh + 4;
      para(b.cuts.map((c, i) => `${i + 1}. ${L(c.len)} ${low(c.where)}${cutNote(c)}`).join(T('pdf.semi')), { size: 8.5, color: C.choc2, after: 8 });
    }
    sub2(T('pdf.sheetPieces'));
    const sheetRows = [];
    for (const kind of ['floor', 'wall']) {
      const sl = res.sheets[kind];
      if (!sl.count) continue;
      sheetRows.push({ group: T('pdf.sheetGroup', { label: sl.sheet.label, n: sl.count }) });
      for (const p of sl.pieces) sheetRows.push({ cells: [p.where, `${L(Math.min(p.w, p.l))} x ${L(Math.max(p.w, p.l))}`] });
    }
    table([{ h: T('pdf.h.piece'), w: 6 }, { h: T('pdf.h.size'), w: 3, align: 'right' }], sheetRows, { size: 8.5 });

    // ---- 4. hardware cloth ----
    newPage('mesh', T('pdf.mesh'));
    const ml = res.mesh;
    para(T('pdf.meshIntro', { mesh: ml.mesh.label, w: L(m.roll.w), l: L(m.roll.l, 'dim'), n: ml.count, total: L(ml.total, 'dim'), overlap: L(ml.overlap) }), { color: C.choc2 });
    const faceRows = [];
    for (const f of ml.faces) for (const [ri, r] of f.rects.entries()) faceRows.push({ f, r, ri });
    const colW = (CW - 20) / 2; let col = 0, rowTop = y, rowH = 0;
    for (const { f, r, ri } of faceRows) {
      const rect = r.rect, hmax = Math.max(rect.h0, rect.h1);
      const s2 = Math.min((colW - 10) / rect.w, 130 / hmax);
      const fw = rect.w * s2, fh = hmax * s2;
      const need = fh + 44;
      if (col === 0) { if (y - need < M + 24) newPage(); rowTop = y; rowH = 0; }
      const x0 = M + col * (colW + 20), y0 = rowTop - 14;
      page.drawText(safe(T('pdf.face', { label: f.label, part: f.rects.length > 1 ? ri + 1 : 0, n: r.strips.length, vertical: r.orient === 'vertical' })), { x: x0, y: y0, size: 9.5, font: F.bold, color: C.choc });
      const base = y0 - 8 - fh;
      r.strips.forEach((s, i) => {
        if (r.orient === 'vertical') page.drawRectangle({ x: x0 + s.at * s2, y: base, width: s.cover * s2, height: s.len * s2, color: i % 2 ? C.egg2 : C.egg, borderColor: C.choc, borderWidth: 0.6, opacity: 0.9 });
        else page.drawRectangle({ x: x0, y: base + s.at * s2, width: s.len * s2, height: s.cover * s2, color: i % 2 ? C.egg2 : C.egg, borderColor: C.choc, borderWidth: 0.6, opacity: 0.9 });
      });
      page.drawSvgPath(`M 0 0 L ${fw} 0 L ${fw} ${-rect.h1 * s2} L 0 ${-rect.h0 * s2} Z`, { x: x0, y: base, borderColor: C.pine, borderWidth: 1.6 });
      const capL = lines(T('pdf.strips', { list: r.strips.map(s => L(s.len)).join(', ') }), F.regular, 8.5, colW);
      capL.forEach((ln, k) => page.drawText(ln, { x: x0, y: base - 12 - k * 11, size: 8.5, font: F.regular, color: C.choc2 }));
      rowH = Math.max(rowH, need + capL.length * 11);
      col++;
      if (col === 2) { col = 0; y = rowTop - rowH - 6; }
    }
    if (col === 1) y = rowTop - rowH - 6;
    if (d.apron) {
      sub2(T('pdf.apron'));
      para(T('pdf.apronText', { label: d.apron.label, kind: d.apron.kind, width: L(d.apron.width), depth: L(d.apron.depth), out: L(d.apron.out), per: L(d.apron.per, 'dim'), strips: d.apron.perWidth }), { size: 10 });
      table([{ h: T('pdf.h.apronLen'), w: 2 }, { h: T('pdf.h.apronSides'), w: 5 }], ml.apronCuts.map(c => ({ cells: [L(c.len, 'dim'), c.sides] })));
    }
    sub2(T('pdf.rolls'));
    table([{ h: T('pdf.h.roll'), w: 1 }, { h: T('pdf.h.rollStrips'), w: 6 }, { h: T('pdf.h.left'), w: 1.4, align: 'right' }], ml.rolls.map((b, i) => ({ cells: [String(i + 1), b.cuts.map(c => `${L(c.len)} (${low(c.where)})`).join(T('pdf.semi')), L(b.leftover, 'dim')] })));

    // ---- 5. elevations ----
    newPage('elev', T('pdf.elev'));
    const views = [['front', T('pdf.view.front')], ['side', T('pdf.view.side')], ['plan', T('pdf.view.plan')]];
    const mems = d.members;
    const MMPT = 72 / 25.4;
    for (const [v, title] of views) {
      const V = VIEWS[v];
      const polys = mems.map(mem => { const cs = corners(mem); return { pts: hull(cs.map(p => [V.u(p), V.v(p)])), depth: Math.max(...cs.map(V.depth)), mem }; });
      let u0 = Infinity, u1 = -Infinity, v0 = Infinity, v1 = -Infinity;
      for (const p of polys) for (const q of p.pts) { u0 = Math.min(u0, q[0]); u1 = Math.max(u1, q[0]); v0 = Math.min(v0, q[1]); v1 = Math.max(v1, q[1]); }
      // the plan and the side view shrink to the next scale down to share the page when there is room for them
      const room = y - (M + 24) - 60;
      const boxW = CW - 60, boxH = v === 'front' ? 190 : room >= 90 ? Math.min(190, room) : 190;
      const scales = [5, 10, 12, 15, 20, 24, 25, 30, 40, 48, 50, 60, 75, 96, 100, 120, 150];
      const N = scales.find(n => (u1 - u0) / n * MMPT <= boxW && (v1 - v0) / n * MMPT <= boxH) || 200;
      const k = MMPT / N;
      const dh = (v1 - v0) * k;
      ensure(dh + 60);
      page.drawText(safe(T('pdf.scale', { title, n: N, a4: u === 'metric' })), { x: M, y: y - 12, size: 11, font: F.bold, color: C.choc });
      const ox = M + 30 + (boxW - (u1 - u0) * k) / 2 - u0 * k, oy = y - 30 - dh - v0 * k;
      polys.sort((a, b) => a.depth - b.depth);
      for (const p of polys) {
        if (p.pts.length < 3) continue;
        const path = p.pts.map((q, i) => `${i ? 'L' : 'M'} ${(q[0] * k).toFixed(2)} ${(-q[1] * k).toFixed(2)}`).join(' ') + ' Z';
        page.drawSvgPath(path, { x: ox, y: oy, color: p.mem.kind === 'roost' ? C.pineLight : C.pine, borderColor: C.choc, borderWidth: 0.4 });
      }
      const dim = (a, b, at, label, vertical) => {
        const t = safe(label);
        if (!vertical) {
          const yv = oy + at * k; page.drawLine({ start: { x: ox + a * k, y: yv }, end: { x: ox + b * k, y: yv }, thickness: 0.6, color: C.olive });
          for (const e of [a, b]) page.drawLine({ start: { x: ox + e * k, y: yv - 4 }, end: { x: ox + e * k, y: yv + 4 }, thickness: 0.6, color: C.olive });
          page.drawText(t, { x: ox + (a + b) / 2 * k - w(t, F.regular, 8.5) / 2, y: yv + 3, size: 8.5, font: F.regular, color: C.olive });
        } else {
          const xv = ox + at * k; page.drawLine({ start: { x: xv, y: oy + a * k }, end: { x: xv, y: oy + b * k }, thickness: 0.6, color: C.olive });
          for (const e of [a, b]) page.drawLine({ start: { x: xv - 4, y: oy + e * k }, end: { x: xv + 4, y: oy + e * k }, thickness: 0.6, color: C.olive });
          page.drawText(t, { x: xv + 4, y: oy + (a + b) / 2 * k, size: 8.5, font: F.regular, color: C.olive, rotate: degrees(90) });
        }
      };
      if (v === 'front') { dim(u0, u1, v0 - 9 / k * 1.3, L(u1 - u0, 'dim'), false); dim(0, v1, u1 + 8 / k, L(v1, 'dim'), true); }
      if (v === 'side') { dim(u0, u1, v0 - 9 / k * 1.3, L(u1 - u0, 'dim'), false); dim(0, v1, u0 - 8 / k, L(v1, 'dim'), true); }
      if (v === 'plan') { dim(u0, u1, v1 + 8 / k, L(u1 - u0, 'dim'), false); dim(v0, v1, u1 + 8 / k, L(v1 - v0, 'dim'), true); }
      y -= dh + 56;
    }

    // ---- 6. the steps ----
    newPage('steps', T('pdf.steps'));
    para(T('pdf.stepsIntro'), { color: C.choc2 });
    const pics = (ctx.shots && ctx.shots.steps) || [];
    for (const st of res.steps) {
      const parts = res.cut.cuts.filter(c => c.step === st.n);
      const sheetsOf = d.sheets.filter(s => s.step === st.n);
      const pic = pics.find(p => p.n === st.n);
      ensure(pic ? 280 : 90);
      sub2(T('pdf.step', { n: res.steps.indexOf(st) + 1, title: st.title }));
      para(st.text, { size: 10.5 });
      if (pic) await image(pic.url, CW * 0.86, 230);
      if (parts.length) {
        // one entry for each kind of piece, its lengths listed: "hen house, left wall, stud, top cut to the slope: 44 1/2, 41 1/2 in"
        const groups = new Map();
        for (const c of parts) { const g = groups.get(c.where) || { c, lens: new Map() }; const k = L(c.len); g.lens.set(k, (g.lens.get(k) || 0) + 1); groups.set(c.where, g); }
        para(T('pdf.pieces', { list: [...groups.values()].map(g => T('pdf.group', { where: low(g.c.where) + cutNote(g.c), lens: [...g.lens].map(([k, n]) => (n > 1 ? T('pdf.nAt', { n, len: k }) : k)).join(', ') })).join(T('pdf.semi')) }), { size: 9, color: C.choc2 });
      }
      if (sheetsOf.length) para(T('pdf.plywood', { list: sheetsOf.map(s => `${low(s.where)} ${L(Math.min(s.w, s.l))} x ${L(Math.max(s.w, s.l))}`).join(T('pdf.semi')) }), { size: 9, color: C.choc2 });
      if (st.n === 9) para(T('pdf.meshStep', { n: res.mesh.count, staple: u === 'metric' ? '75 mm' : T('u.in', { v: '3' }), screw: u === 'metric' ? '300 mm' : T('u.in', { v: '12' }) }), { size: 9, color: C.choc2 });
      y -= 4;
    }

    // ---- 7. details: the apron, the nest boxes, the roosts ----
    newPage('details', T('pdf.details'));
    if (d.apron) {
      ensure(220);
      sub2(T('pdf.apronSection'));
      const k2 = 2.6 / 25.4; // 2.6 points to the inch, about 1:28
      const sx = M + 30, gy = y - 86; // the ground line; the wall stands 70 points above it, under the heading
      const dpt = d.apron.depth * k2, outp = Math.min(d.apron.out * k2, CW - 120);
      page.drawRectangle({ x: sx - 10, y: gy - Math.max(dpt, 20) - 30, width: CW - 20, height: Math.max(dpt, 20) + 30, color: rgb(0.93, 0.89, 0.83) });
      page.drawLine({ start: { x: sx - 10, y: gy }, end: { x: sx + CW - 30, y: gy }, thickness: 1.2, color: C.soil });
      page.drawText(safe(T('pdf.ground')), { x: sx + CW - 70, y: gy + 4, size: 8.5, font: F.regular, color: C.choc2 });
      page.drawRectangle({ x: sx, y: gy, width: d.t * k2, height: 70, color: C.pine, borderColor: C.choc, borderWidth: 0.6 });
      page.drawText(safe(T('pdf.runWall', { lumber: d.lumber.label })), { x: sx + d.t * k2 + 6, y: gy + 60, size: 8.5, font: F.regular, color: C.choc });
      const wx = sx + d.t * k2 + 2;
      page.drawLine({ start: { x: wx, y: gy + 70 }, end: { x: wx, y: gy - (d.apron.kind === 'skirt' ? 0 : dpt) }, thickness: 1.6, color: C.wire });
      if (d.apron.kind === 'skirt') page.drawLine({ start: { x: wx, y: gy + 1 }, end: { x: wx + outp, y: gy + 1 }, thickness: 1.6, color: C.wire });
      else page.drawLine({ start: { x: wx, y: gy - dpt }, end: { x: wx + outp, y: gy - dpt }, thickness: 1.6, color: C.wire });
      const lbl = d.apron.kind === 'skirt' ? T('pdf.skirtLbl', { w: L(d.apron.width) }) : T('pdf.apronLbl', { d: L(d.apron.depth), out: L(d.apron.out) });
      page.drawText(safe(lbl), { x: wx + 8, y: gy - (d.apron.kind === 'skirt' ? -6 : dpt) + 5, size: 9, font: F.bold, color: C.choc });
      page.drawText(safe(T('pdf.wallMesh')), { x: wx + 8, y: gy + 30, size: 8.5, font: F.regular, color: C.choc2 });
      y = gy - Math.max(dpt, 20) - 44;
      para(T(`pdf.apronWhy.${d.apron.kind}`), { size: 9.5, color: C.choc2 });
    } else para(T(m.type === 'tractor' ? 'pdf.noApronTractor' : 'pdf.noApron'), { size: 10 });
    if (d.nests) {
      const nb = d.nests;
      sub2(T('pdf.nestTitle', { n: nb.n }));
      para(T('pdf.nestText', { w: L(nb.w), d: L(nb.d), h: L(nb.h), lip: L(nb.lip), row: L(nb.rowL), y: L(nb.y), outside: nb.outside }), { size: 10 });
      ensure(90);
      const bx = M + 20, by = y - 70, s3 = Math.min((CW - 40) / nb.rowL, 60 / nb.h);
      for (let i = 0; i < nb.n; i++) page.drawRectangle({ x: bx + i * nb.w * s3, y: by, width: nb.w * s3, height: nb.h * s3, color: C.egg, borderColor: C.choc, borderWidth: 0.8 });
      page.drawRectangle({ x: bx, y: by, width: nb.rowL * s3, height: nb.lip * s3, color: C.egg2, borderColor: C.choc, borderWidth: 0.8 });
      y = by - 16;
    }
    if (d.roosts) {
      const R2 = d.roosts;
      sub2(T('pdf.roosts'));
      const rsec = res.cut.sections.find(s => s.sec === R2.sec);
      para(T('pdf.roostText', { bars: R2.bars, secId: R2.sec, sec: rsec ? rsec.lumber.label : R2.sec, flat: R2.flat, len: L(R2.len), h: L(R2.h), gap: R2.bars > 1 ? L((D.RULES.roostGap + 2) * 25.4) : '', per: L(R2.total / m.birds), joint: R2.len > m.stock }), { size: 10 });
    }
    if (d.pop) para(T('pdf.popText', { w: L(d.pop.w), h: L(d.pop.h), ramp: d.ramp ? L(d.ramp.len) : '', angle: d.ramp ? Math.round(d.ramp.angle) : 0 }), { size: 10 });

    // ---- 8. checks ----
    newPage('checks', T('pdf.checks'));
    para(T('pdf.checksIntro'), { color: C.choc2 });
    const word = { fits: T('v.word.fits'), check: T('v.word.check'), fail: T('v.word.fail'), info: T('v.word.info') }, col2 = { fits: C.olive, check: rgb(0.54, 0.32, 0), fail: C.fox, info: C.choc2 };
    // each row names its sources by number; the numbered list under the table gives every title, address and date once
    const used = [];
    const num = s => { let i = used.findIndex(x => x.url === s.url); if (i < 0) { used.push(s); i = used.length - 1; } return i + 1; };
    table([{ h: T('pdf.h.result'), w: 1 }, { h: T('pdf.h.check'), w: 2 }, { h: T('v.h.yours'), w: 2.4 }, { h: T('v.h.guide'), w: 2.2 }, { h: T('pdf.h.why'), w: 5 }], res.checks.map(r => ({ color: col2[r.status], cells: [word[r.status], r.title, r.yours, r.limit, `${r.reason}${r.sources.length ? T('pdf.rowSources', { list: r.sources.map(s => `${short(s)} [${num(s)}]`).join(T('pdf.semi')) }) : ''}`] })), { size: 8.5, boldFirst: true });
    if (used.length) {
      sub2(T('pdf.sourcesTitle'));
      for (const [i, s] of used.entries()) {
        para(T('pdf.srcLine', { i: i + 1, title: s.title, date: longDate(s.checked) }), { size: 8.5, after: 0 });
        for (const ln of lines(s.url, F.regular, 8.5, CW - 14)) {
          ensure(12);
          page.drawText(ln, { x: M + 14, y: y - 8.5, size: 8.5, font: F.regular, color: C.olive });
          link(M + 14, y - 11, w(ln, F.regular, 8.5), 12, s.url);
          y -= 12;
        }
        y -= 4;
      }
    }
    const code = E.encode(m);
    para(T('pdf.made', { made, code: `${code.slice(0, 60)}${code.length > 60 ? '...' : ''}` }), { size: 8.5, color: C.choc2 });
    return doc.save();
  }
  function pageOf(res, section) { return api.index[section] || 1; }
  return { api, pdf, pageOf, safe, corners, hull };
});
