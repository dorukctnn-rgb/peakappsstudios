/* Sim Rig Designer (Pro): the step-by-step build plan PDF. Pure functions over the engine's result; pdf-lib is passed in
 * (loaded only when a Pro user asks for the plan). The PDF and the page read the same result, so the cut list, the
 * aluminium bill of materials, the plates and the shopping list always agree with the page. The elevations are vectors
 * drawn from the same members and plates as the 3D model, at a stated scale; the plates are also drawn at full size,
 * tiled across pages, to print as jigsaw and drilling templates; the fit and step views are pictures of the live model.
 * Fonts: Anek Latin (expanded) and Instrument Sans, embedded as TrueType with the WinAnsi encoding (fonts/sr-pdf-*.ttf,
 * cut by _build/fonts.py); if they cannot be fetched the plan is set in Helvetica with the same layout.
 * Works in the browser (window.SimRigReport) and in Node for the tests. */
(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory();
  else root.SimRigReport = factory();
})(typeof self !== 'undefined' ? self : this, function () {
  'use strict';
  // @metrics-start (copied from fonts/pdf-metrics.json, written by _build/fonts.py)
  const CUTS = {"AnekLatinPDF-ExtraBold":{"widths":[262,316,512,728,734,996,852,262,416,416,476,661,290,451,307,638,760,760,760,760,760,760,760,760,760,760,312,312,661,671,661,635,1042,843,806,730,827,742,710,844,859,337,540,786,676,1009,859,867,770,867,792,734,759,846,807,1100,806,781,720,386,638,386,594,568,423,672,743,606,743,678,484,669,720,316,327,698,316,1086,720,712,743,743,504,620,526,720,669,977,688,670,623,416,314,416,683,0,726,0,279,570,519,888,578,584,531,1428,734,379,1280,0,720,0,0,279,279,526,526,400,621,1150,514,868,620,379,1112,0,623,781,262,316,606,734,668,781,314,640,494,855,421,660,661,451,508,488,414,671,397,412,423,720,516,292,380,272,440,660,930,942,1071,635,843,843,843,843,843,843,1285,730,742,742,742,742,337,337,337,337,827,859,867,867,867,867,867,644,867,846,846,846,846,781,768,746,672,672,672,672,672,672,1080,606,678,678,678,678,316,316,316,316,714,720,712,712,712,712,712,661,712,720,720,720,720,670,743,670],"bbox":[-260,-230,1394,870],"ascent":900,"descent":-200,"capHeight":639,"xHeight":489,"italicAngle":0,"stemV":160,"file":"sr-pdf-display.ttf"},"InstrumentSansPDF-Regular":{"widths":[200,273,384,716,608,786,755,232,406,406,408,531,255,506,255,443,600,600,600,600,600,600,600,600,600,600,255,255,531,531,531,567,853,728,636,741,752,638,602,765,736,254,455,692,588,906,736,786,656,787,656,608,648,712,728,1089,688,676,623,406,443,406,531,426,354,533,606,533,606,564,354,606,599,240,240,535,240,922,599,584,606,606,375,473,377,589,523,767,551,523,496,406,242,406,531,0,701,0,248,0,398,655,0,0,433,842,608,334,1064,0,623,0,0,255,255,409,409,306,586,886,452,850,473,334,946,0,496,676,200,273,533,588,0,616,0,498,441,850,371,494,0,0,850,411,386,0,0,0,354,0,711,103,301,0,414,494,0,0,0,567,728,728,728,728,728,728,936,741,638,638,638,638,254,254,254,254,752,736,786,786,786,786,786,531,786,712,712,712,712,676,656,612,533,533,533,533,533,533,865,533,564,564,564,564,240,240,240,240,592,599,584,584,584,584,584,531,584,589,589,589,589,523,606,523],"bbox":[-65,-215,1039,986],"ascent":970,"descent":-250,"capHeight":720,"xHeight":510,"italicAngle":0,"stemV":80,"file":"sr-pdf-regular.ttf"},"InstrumentSansPDF-SemiBold":{"widths":[193,295,449,727,637,786,768,256,439,439,430,544,275,493,275,444,600,600,600,600,600,600,600,600,600,600,275,275,544,544,544,580,867,733,645,747,755,630,594,764,725,254,427,712,589,898,725,794,667,806,664,637,664,704,733,1087,707,700,631,439,444,439,544,466,354,558,621,552,621,571,370,621,612,260,260,558,260,941,612,597,621,621,390,494,406,604,536,800,587,536,513,439,234,439,544,0,715,0,271,0,464,728,0,0,433,830,637,361,1081,0,631,0,0,275,275,471,471,336,599,899,452,855,494,361,948,0,513,700,193,295,552,600,0,640,0,519,487,823,375,547,0,0,823,411,373,0,0,0,354,0,663,144,301,0,411,547,0,0,0,580,733,733,733,733,733,733,967,747,630,630,630,630,254,254,254,254,765,725,794,794,794,794,794,544,794,704,704,704,704,700,664,631,558,558,558,558,558,558,880,552,571,571,571,571,260,260,260,260,608,612,597,597,597,597,597,544,597,604,604,604,604,536,621,536],"bbox":[-71,-215,1048,986],"ascent":970,"descent":-250,"capHeight":720,"xHeight":510,"italicAngle":0,"stemV":120,"file":"sr-pdf-semibold.ttf"}};
  // @metrics-end
  const api = { base: '/sim-rig-designer/fonts/', fontDir: null, forceStandard: false, index: {} };
  const ROLES = { regular: ['InstrumentSansPDF-Regular', 'Helvetica', 'SRPDFA'], bold: ['InstrumentSansPDF-SemiBold', 'Helvetica-Bold', 'SRPDFB'], display: ['AnekLatinPDF-ExtraBold', 'Helvetica-Bold', 'SRPDFC'] };
  const WIN = '€‚ƒ„…†‡ˆ‰Š‹ŒŽ‘’“”•–—˜™š›œžŸ';
  const MAP = { '≤': '<=', '≥': '>=', '−': '-', ' ': ' ', ' ': ' ', ' ': ' ', '²': '2' };
  const safe = s => String(s == null ? '' : s).replace(/[\s\S]/g, c => { const n = c.charCodeAt(0); if (c === '\n' || (n >= 32 && n < 127) || (n >= 0xa0 && n <= 0xff) || WIN.includes(c)) return c; return MAP[c] != null ? MAP[c] : ''; });
  const localDay = () => { const d = new Date(); return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`; };
  const longDate = iso => { const [y, m, d] = iso.split('-').map(Number); return `${d} ${['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'][m - 1]} ${y}`; };
  const MMPT = 72 / 25.4;

  // ---------- fonts ----------
  const cache = {};
  async function readFont(file) {
    const node = typeof window === 'undefined' && typeof process === 'object' && process.versions && process.versions.node;
    if (node) {
      const get = typeof require === 'function' ? require : process.getBuiltinModule;
      const fs = get('fs'), path = get('path');
      const dirs = [api.fontDir, path.join(process.cwd(), 'src', 'sim-rig-designer', 'fonts'), path.join(process.cwd(), 'sim-rig-designer', 'fonts')].filter(Boolean);
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

  // ---------- geometry for the drawings ----------
  const sub = (a, b) => [a[0] - b[0], a[1] - b[1], a[2] - b[2]];
  const addv = (a, b) => [a[0] + b[0], a[1] + b[1], a[2] + b[2]];
  const mul = (a, k) => [a[0] * k, a[1] * k, a[2] * k];
  const dot = (a, b) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
  const cross = (a, b) => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
  const norm = a => { const l = Math.hypot(...a) || 1; return mul(a, 1 / l); };
  function corners(mem) {
    const dir = norm(sub(mem.p1, mem.p0)), L = Math.hypot(...sub(mem.p1, mem.p0));
    let up = mem.up ? mem.up.slice() : Math.abs(dir[1]) < 0.9 ? [0, 1, 0] : [0, 0, 1];
    if (!mem.up) { const n = cross(dir, [0, 0, 1]); up = Math.hypot(...n) > 1e-6 ? cross(n, dir) : [0, 1, 0]; if (Math.abs(dir[2]) > 0.5) up = [0, 1, 0]; }
    up = sub(up, mul(dir, dot(up, dir)));
    if (Math.hypot(...up) < 1e-6) up = [dir[1] > 0.9 ? 1 : 0, 0, 1];
    up = norm(up);
    const side = norm(cross(dir, up));
    const c = mul(addv(mem.p0, mem.p1), 0.5), out = [];
    for (const i of [-1, 1]) for (const j of [-1, 1]) for (const k of [-1, 1]) out.push(addv(addv(addv(c, mul(dir, i * L / 2)), mul(up, j * mem.a / 2)), mul(side, k * mem.b / 2)));
    return out;
  }
  function slabCorners(s) {
    if (s.poly) { const out = []; for (const q of s.poly) out.push([q[0], q[1], s.z0], [q[0], q[1], s.z1]); return out; }
    const a = s.rotZ || 0, u = [Math.cos(a), Math.sin(a), 0], n = [-Math.sin(a), Math.cos(a), 0], z = [0, 0, 1], out = [];
    for (const i of [-1, 1]) for (const j of [-1, 1]) for (const k of [-1, 1]) out.push(addv(addv(addv(s.c, mul(u, i * s.size[0] / 2)), mul(n, j * s.size[1] / 2)), mul(z, k * s.size[2] / 2)));
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
  // views: side looks from the driver's right (x right, y up), front looks from the screens back at the driver
  // (z right, y up), plan from above (x right, z down the page)
  const VIEWS = { side: { u: p => p[0], v: p => p[1], depth: p => -p[2] }, front: { u: p => -p[2], v: p => p[1], depth: p => p[0] }, plan: { u: p => p[0], v: p => -p[2], depth: p => p[1] } };

  // ---------- the document ----------
  async function pdf(PDFLib, ctx) {
    const { res, E, D } = ctx;
    const m = res.m, d = res.design, u = m.units, both = !!ctx.both, p = res.posture;
    const { PDFDocument, rgb, degrees } = PDFLib;
    const doc = await PDFDocument.create();
    const name = m.name || E.BUILD_NAME[m.build];
    doc.setTitle(safe(`Sim rig build plan, ${name}`)); doc.setAuthor('Sim Rig Designer, Peak Apps Studio'); doc.setSubject('Step-by-step build plan for a sim racing cockpit'); doc.setCreator('peakappsstudio.com/sim-rig-designer/');
    const F = await fonts(doc, PDFLib);
    const C = { ink: rgb(0.090, 0.082, 0.114), ink2: rgb(0.298, 0.286, 0.349), ink3: rgb(0.467, 0.455, 0.541), paddock: rgb(0.945, 0.949, 0.965), paddock2: rgb(0.902, 0.906, 0.933), sector: rgb(0.416, 0.180, 0.910), sectorSoft: rgb(0.925, 0.902, 0.992), yellow: rgb(1, 0.824, 0.247), kerb: rgb(0.843, 0.122, 0.153), green: rgb(0.043, 0.478, 0.294), white: rgb(1, 1, 1), line: rgb(0.83, 0.83, 0.87), wood: rgb(0.863, 0.682, 0.447), woodLight: rgb(0.925, 0.808, 0.627), alu: rgb(0.765, 0.780, 0.812), ply: rgb(0.910, 0.812, 0.639) };
    const [PW, PH] = u === 'metric' ? [595.28, 841.89] : [612, 792];
    const M = 40, CW = PW - 2 * M;
    const L = (mm, kind) => (both ? E.both(mm, u, kind) : E.len(mm, u, kind));
    const made = longDate(localDay());
    let page = null, y = 0, pageNo = 0;
    api.index = {};
    const w = (t, f, s) => f.widthOfTextAtSize(safe(t), s);
    function newPage(section, title, size) {
      const [pw, ph] = size || [PW, PH];
      page = doc.addPage([pw, ph]); pageNo++;
      if (section && !api.index[section]) api.index[section] = pageNo;
      page.drawRectangle({ x: 0, y: ph - 7, width: pw, height: 7, color: C.sector });
      page.drawText(safe(`Sim rig build plan, ${name}`), { x: M, y: 22, size: 8.5, font: F.regular, color: C.ink2 });
      const right = `Page ${pageNo}. Guidance for a hobby build, not an engineering guarantee.`;
      page.drawText(safe(right), { x: pw - M - w(right, F.regular, 8.5), y: 22, size: 8.5, font: F.regular, color: C.ink2 });
      y = ph - M - 4;
      if (title) heading(title);
    }
    function heading(t, size = 23) { ensure(size + 14); page.drawText(safe(t), { x: M, y: y - size, size, font: F.display, color: C.ink }); y -= size + 12; }
    function sub2(t) { ensure(26); page.drawText(safe(t), { x: M, y: y - 14, size: 13.5, font: F.bold, color: C.ink }); y -= 22; }
    function ensure(h) { if (y - h < M + 24) newPage(); }
    function lines(text, f, s, width) {
      const words = safe(text).split(/\s+/); const out = []; let cur = '';
      for (const wd of words) {
        const t = cur ? cur + ' ' + wd : wd;
        if (w(t, f, s) <= width) { cur = t; continue; }
        if (cur) out.push(cur);
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
    function link(x, y0, wd, h, url) {
      try {
        const { PDFName, PDFString } = PDFLib;
        const ref = doc.context.register(doc.context.obj({ Type: 'Annot', Subtype: 'Link', Rect: [x, y0, x + wd, y0 + h], Border: [0, 0, 0], A: { Type: 'Action', S: 'URI', URI: PDFString.of(url) } }));
        const annots = page.node.lookup(PDFName.of('Annots'));
        if (annots) annots.push(ref); else page.node.set(PDFName.of('Annots'), doc.context.obj([ref]));
      } catch (e) { /* the address is printed anyway */ }
    }
    function para(text, o = {}) {
      const f = o.font || F.regular, s = o.size || 10.5, lh = s * 1.42, x = o.x || M, width = o.width || CW;
      for (const ln of lines(text, f, s, width)) { ensure(lh); page.drawText(ln, { x, y: y - s, size: s, font: f, color: o.color || C.ink }); y -= lh; }
      y -= o.after == null ? 6 : o.after;
    }
    function table(cols, rows, o = {}) {
      const s = o.size || 9.5, pad = 4, total = cols.reduce((a, c) => a + c.w, 0);
      const ws = cols.map(c => c.w / total * CW);
      const head = () => { ensure(22); let x = M; page.drawRectangle({ x: M, y: y - 16, width: CW, height: 16, color: C.paddock2 }); cols.forEach((c, i) => { page.drawText(safe(c.h), { x: c.align === 'right' ? x + ws[i] - pad - w(c.h, F.bold, s - 0.5) : x + pad, y: y - 11.5, size: s - 0.5, font: F.bold, color: C.ink2 }); x += ws[i]; }); y -= 18; };
      head();
      for (const r of rows) {
        if (r.group) { ensure(18); page.drawText(safe(r.group), { x: M + pad, y: y - 11, size: s, font: F.bold, color: C.ink2 }); y -= 16; continue; }
        const cells = r.cells.map((t, i) => lines(t, i === 0 && o.boldFirst ? F.bold : F.regular, s, ws[i] - 2 * pad));
        const h = Math.max(...cells.map(c => c.length)) * s * 1.32 + 6;
        if (y - h < M + 24) { newPage(); head(); }
        let x = M;
        cells.forEach((cl, i) => {
          cl.forEach((ln, k) => { const f = i === 0 && o.boldFirst ? F.bold : F.regular; page.drawText(ln, { x: cols[i].align === 'right' ? x + ws[i] - pad - w(ln, f, s) : x + pad, y: y - s - 2 - k * s * 1.32, size: s, font: f, color: r.color && i === 0 ? r.color : C.ink }); });
          x += ws[i];
        });
        y -= h;
        page.drawLine({ start: { x: M, y }, end: { x: M + CW, y }, thickness: 0.5, color: C.line });
      }
      y -= 8;
    }
    async function image(dataUrl, maxW, maxH, tags) {
      if (!dataUrl) return;
      const b64 = dataUrl.split(',')[1];
      const bytes = typeof Buffer !== 'undefined' ? Uint8Array.from(Buffer.from(b64, 'base64')) : Uint8Array.from(atob(b64), c => c.charCodeAt(0));
      const img = /^data:image\/png/.test(dataUrl) ? await doc.embedPng(bytes) : await doc.embedJpg(bytes);
      const sc = Math.min(maxW / img.width, maxH / img.height);
      ensure(img.height * sc + 6);
      const x0 = M + (CW - img.width * sc) / 2, y0 = y - img.height * sc;
      page.drawImage(img, { x: x0, y: y0, width: img.width * sc, height: img.height * sc });
      // the angle tags the live model placed, drawn over the picture
      const tone = { fits: [C.sector, C.white], check: [C.yellow, C.ink], fail: [C.kerb, C.white], info: [C.white, C.ink] };
      for (const t of tags || []) {
        const [bg, fg] = tone[t.tone] || tone.info, s = 8.5, tw = w(t.text, F.bold, s) + 8, th = 13;
        const tx = x0 + t.x * sc - tw / 2, ty = y0 + (img.height - t.y) * sc;
        page.drawRectangle({ x: tx, y: ty, width: tw, height: th, color: bg });
        page.drawText(safe(t.text), { x: tx + 4, y: ty + 3.6, size: s, font: F.bold, color: fg });
      }
      y -= img.height * sc + 8;
    }
    const cutNote = c => (c.angled && !/cut|angle/i.test(c.where) ? ' (angled ends)' : '');
    // a member's length as the cut list or the bill of materials gives it (wood rounded up to the 1/16 in or the mm)
    const cutLen = new Map((res.cut.cuts || []).map(x => [x.id, x.len]));
    const pieceLen = mem => (cutLen.has(mem.id) ? cutLen.get(mem.id) : Math.round(mem.len));
    const deg = x => `${Math.round(x)} degrees`;

    // ---- 1. cover ----
    newPage('cover');
    page.drawRectangle({ x: 0, y: PH - 214, width: PW, height: 207, color: C.paddock });
    for (let i = 0, x = -8; x < PW; i++, x += 26) page.drawSvgPath(`M ${x} 0 L ${x + 23} 0 L ${x + 28} -9 L ${x + 5} -9 Z`, { x: 0, y: PH - 214, color: i % 2 ? C.white : C.kerb });
    page.drawText(safe('Build plan'), { x: M, y: PH - 80, size: 40, font: F.display, color: C.ink });
    page.drawText(safe(m.name || `Your ${E.BUILD_SHORT[m.build]}`), { x: M, y: PH - 114, size: 19, font: F.bold, color: C.ink });
    y = PH - 136;
    para(`${E.STYLE_NAME[m.style]} ${E.BUILD_SHORT[m.build]} for a driver ${E.height(m.driver.h, u)} tall${m.driver.inseam ? ` with a ${L(m.driver.inseam)} inside leg` : ''}: ${L(res.footprint.x, 'dim')} by ${L(res.footprint.z, 'dim')} on the floor${m.screen.stand ? ' with the screen stand' : ''}. Knee ${deg(p.rest.knee)}, hip ${deg(p.hip)}, elbow ${deg(p.elbow)}, seat back ${deg(p.back)}.`, { size: 11.5 });
    para(`${d.alu ? `${res.bom.sections.map(s => `${(s.total / 1000).toFixed(2)} m of ${s.profile.label}`).join(' and ')}, ${res.bom.brackets} corner brackets` : `${res.cut.boards.length} boards of ${d.lumber.label} x ${E.stockLabel(m.stock, u)}`}; ${res.sheets.count} ${res.sheets.count === 1 ? 'sheet' : 'sheets'} of ${d.sheet.kind}; ${d.plates.length} plates. Made on ${made}.`, { size: 10.5, color: C.ink2 });
    y = PH - 232;
    const warn = [
      'This plan is guidance for a hobby build, not an engineering guarantee. Check every size against your own body, seat and gear before you cut.',
      'No published figure says how stiff a wheel deck must be. With a direct drive base, grip the rim and twist hard once the rig is built; if the deck moves, add a brace before you race.',
      `The hole patterns are what you typed${d.plates.every(pl => pl.measured) ? ' and marked as measured' : ', and at least one is still the tool\'s EXAMPLE'}. Hold each plate drawing against your gear before you drill. The tool knows no maker's bolt pattern.`,
      'Print the drilling templates at the back at 100% (no "fit to page"), and check the 100 mm and 4 in bars on each page with a ruler before you drill.',
    ];
    const wl = warn.map(t => lines(t, F.regular, 10, CW - 28));
    const gh = wl.reduce((a, l) => a + l.length * 14 + 4, 0) + 30;
    page.drawRectangle({ x: M, y: y - gh, width: CW, height: gh, color: C.white, borderColor: C.yellow, borderWidth: 1.4 });
    page.drawRectangle({ x: M, y: y - gh, width: 6, height: gh, color: C.yellow });
    page.drawText(safe('Read this first'), { x: M + 16, y: y - 20, size: 12.5, font: F.bold, color: C.ink });
    let yy = y - 38;
    for (const l of wl) { for (const ln of l) { page.drawText(ln, { x: M + 16, y: yy, size: 10, font: F.regular, color: C.ink }); yy -= 14; } yy -= 4; }
    y -= gh + 14;
    // the contents go under the picture once every section has its page (drawn at the end)
    const TOC = [['fit', 'Your fit, with every angle'], ['shop', 'Shopping list'], ['cut', d.alu ? 'Aluminium bill of materials' : 'Cut list, board by board'], ['plates', 'The plates, dimensioned'], ['elev', 'Side, front and top views, to scale'], ['steps', 'Build steps'], ['checks', 'The checks, with sources'], ['templates', 'Drilling templates at full size']];
    const tocH = 30 + Math.ceil(TOC.length / 2) * 16;
    const iso = ctx.shots && ctx.shots.views && ctx.shots.views.find(v => v.label === 'iso');
    if (iso) await image(iso.url, CW, y - M - 24 - tocH - 8);
    const cover = page, tocY = y;

    // ---- 2. your fit ----
    newPage('fit', 'Your fit');
    para('The rig is placed around your body: your segment lengths are scaled from the ANSUR II survey by your height and inside leg, and the angles below are worked out from them. The side view shows each angle on the driver; the table gives every position, measured as SAE J1100 does from the hip point and the heel point.', { color: C.ink2 });
    const fitShot = ctx.shots && ctx.shots.views && ctx.shots.views.find(v => v.label === 'fit');
    if (fitShot) await image(fitShot.url, CW, 300, fitShot.tags);
    const st = id => { const r = res.checks.find(x => x.id === id); return r ? r.status : 'info'; };
    const word = { fits: 'Fits', check: 'Check', fail: 'Fail', info: 'Note' }, col2 = { fits: C.green, check: rgb(0.54, 0.36, 0), fail: C.kerb, info: C.ink2 };
    const lay = d.lay, rg = m.rig;
    table([{ h: 'Result', w: 1 }, { h: 'Angle or position', w: 3 }, { h: 'Yours', w: 2.4 }], [
      { color: col2[st('knee')], cells: [word[st('knee')], 'Knee at rest (L44)', deg(p.rest.knee)] },
      { color: col2[st('knee-press')], cells: [word[st('knee-press')], `Knee with the brake ${m.gear.travel} degrees down`, deg(p.press.knee)] },
      { color: col2[st('hip')], cells: [word[st('hip')], 'Hip, torso to thigh (L42)', deg(p.hip)] },
      { color: col2[st('ankle')], cells: [word[st('ankle')], 'Ankle, shin to foot (L46)', deg(p.rest.ankle)] },
      { color: col2[st('elbow')], cells: [word[st('elbow')], 'Elbow at 9 and 3 o\'clock', deg(p.elbow)] },
      { color: col2[st('torso')], cells: [word[st('torso')], 'Seat back from upright (L40)', deg(p.back)] },
      { cells: ['', 'Hip point above the floor', L(lay.H[1])] },
      { color: col2[st('h30')], cells: [word[st('h30')], 'Hip point above the heel point (H30)', L(rg.h30)] },
      { cells: ['', 'Heel point forward of the hip point (L53)', L(rg.l53)] },
      { cells: ['', 'Pedal deck angle', deg(rg.deck)] },
      { color: col2[st('wheel-height')], cells: [word[st('wheel-height')], 'Wheel centre above the hip point', L(rg.wheelUp)] },
      { cells: ['', 'Wheel centre forward of the hip point', L(rg.wheelReach)] },
      { cells: ['', 'Wheel tilt from upright', deg(rg.tilt)] },
      { color: col2[st('eye')], cells: [word[st('eye')], 'Eyes to the screen', L(rg.screenDist)] },
      { cells: ['', 'Field of view to set in the game', `${res.fov.h.toFixed(0)} degrees across, ${res.fov.v.toFixed(0)} high${m.screen.kind === 'triple' ? `; side screens in ${res.fov.side.toFixed(0)} degrees` : ''}`] },
    ], { size: 9, boldFirst: true });

    // ---- 3. shopping list ----
    newPage('shop', 'Shopping list');
    para('Quantities for this design. Prices come only from what you typed on the page; the tool ships none.', { color: C.ink2 });
    const shopRows = []; let lastG = '';
    for (const it of res.shop.items) { if (it.group !== lastG) { shopRows.push({ group: it.group }); lastG = it.group; } const q = Number.isInteger(it.qty) ? it.qty : it.qty.toFixed(2); shopRows.push({ cells: [it.label + (it.note ? `. ${it.note}` : ''), `${q} ${E.unit(it.qty, it.unit)}`, it.price != null ? it.price.toFixed(2) : '', it.cost != null ? it.cost.toFixed(2) : ''] }); }
    if (res.shop.priced) shopRows.push({ cells: ['Total of the prices you entered', '', '', res.shop.total.toFixed(2)] });
    table([{ h: 'Item', w: 6 }, { h: 'Quantity', w: 1.6, align: 'right' }, { h: 'Unit price', w: 1.3, align: 'right' }, { h: 'Cost', w: 1.2, align: 'right' }], shopRows);

    // ---- 4. cut list or aluminium bill of materials ----
    if (d.alu) {
      newPage('cut', 'Aluminium bill of materials');
      para(`Every profile piece by length. Order them cut to length, or cut them yourself from 1, 2 and 3 m lengths with a 3 mm kerf, as packed below. ${res.bom.brackets} corner brackets join the frame (two on each 40 mm face of a joint, four where the face is 80 mm), ${res.bom.hinges} angle brackets hold the braces, and every bracket and plate fixing takes a T-nut and an M8 bolt.`, { color: C.ink2 });
      for (const s of res.bom.sections) {
        sub2(`${s.profile.label}: ${(s.total / 1000).toFixed(2)} m in ${s.n} pieces, about ${s.kg.toFixed(1)} kg`);
        table([{ h: 'Length', w: 1.4 }, { h: 'Pieces', w: 0.8, align: 'right' }, { h: 'Where', w: 6 }], s.cuts.map(c => ({ cells: [L(c.len) + (c.angled ? ', angled' : ''), String(c.qty), c.where] })), { size: 9 });
        para(`Cut from stock: ${s.stock.map((b, i) => `length ${i + 1} (${b.stock / 1000} m): ${b.cuts.map(c => L(c.len)).join(', ')}, ${L(b.leftover)} left`).join('; ')}.`, { size: 8.5, color: C.ink2 });
      }
      sub2('Hardware');
      table([{ h: 'Item', w: 5 }, { h: 'Quantity', w: 1.4, align: 'right' }], [
        { cells: ['Corner brackets for 40 mm profile, 8 mm slot', String(res.bom.brackets)] },
        { cells: ['Hinge or angle brackets for the braces', String(res.bom.hinges)] },
        { cells: ['T-nuts for 8 mm slot, M8', String(res.bom.tnuts)] },
        { cells: ['M8 button-head bolts with washers', String(res.bom.bolts)] },
        { cells: ['End caps, 40 x 40 mm', String(res.bom.caps.p4040)] },
        { cells: ['End caps, 40 x 80 mm', String(res.bom.caps.p4080)] },
      ]);
    } else {
      newPage('cut', 'Cut list');
      const cut = res.cut;
      para(`${cut.boards.length} boards of ${d.lumber.label} (actual ${d.lumber.actual}). Packed first-fit decreasing with a ${L(cut.kerf)} saw kerf, keeping ${L(cut.trim)} on each board to square its end: ${Math.round(cut.waste * 100)}% of the wood bought is left over, hatched at the end of each board. Cut the longest pieces first; mark each piece with its board and number.`, { color: C.ink2 });
      const maxStock = Math.max(...cut.boards.map(b => b.stock));
      const sc = CW / maxStock;
      for (const b of cut.boards) {
        ensure(54);
        const label = `Board ${b.n}: ${d.lumber.label} x ${E.stockLabel(b.stock, u)}, ${b.cuts.length} ${b.cuts.length === 1 ? 'piece' : 'pieces'}, ${L(b.leftover)} left over`;
        page.drawText(safe(label), { x: M, y: y - 10, size: 9.5, font: F.bold, color: C.ink });
        y -= 16;
        const bh = 20; let x = M;
        b.cuts.forEach((c, i) => {
          const cw = c.len * sc;
          page.drawRectangle({ x, y: y - bh, width: Math.max(0.5, cw - 0.6), height: bh, color: i % 2 ? C.woodLight : C.wood, borderColor: C.ink, borderWidth: 0.6 });
          const t = L(c.len);
          if (w(t, F.regular, 8) < cw - 4) page.drawText(safe(t), { x: x + (cw - w(t, F.regular, 8)) / 2, y: y - bh / 2 - 3, size: 8, font: F.regular, color: C.ink });
          x += cw + cut.kerf * sc;
        });
        const lw = b.stock * sc - (x - M);
        if (lw > 0.5) { page.drawRectangle({ x, y: y - bh, width: lw, height: bh, color: C.paddock, borderColor: C.ink3, borderWidth: 0.6 }); for (let hx = x + 4; hx < x + lw; hx += 6) page.drawLine({ start: { x: hx, y: y - bh }, end: { x: Math.min(hx + 6, x + lw), y: y - 2 }, thickness: 0.5, color: C.ink3 }); }
        y -= bh + 4;
        para(b.cuts.map((c, i) => `${i + 1}. ${L(c.len)} ${c.where.toLowerCase()}${cutNote(c)}`).join('; '), { size: 8.5, color: C.ink2, after: 8 });
      }
    }
    if (res.sheets.count) {
      sub2(`Sheet pieces: ${res.sheets.count} ${res.sheets.count === 1 ? 'sheet' : 'sheets'} of ${d.sheet.label}`);
      table([{ h: 'Piece', w: 6 }, { h: 'Size', w: 3, align: 'right' }], res.sheets.pieces.map(pc => ({ cells: [pc.where, `${L(Math.min(pc.w, pc.l))} x ${L(Math.max(pc.w, pc.l))}`] })), { size: 8.5 });
    }

    // ---- 5. the plates, dimensioned ----
    newPage('plates', 'The plates');
    para(`Each plate drawn to scale from its DXF file, with the holes measured from its lower left corner. ${m.plate === 'alu' && d.alu ? 'Send the DXF files to a laser, waterjet or CNC service for 6 mm aluminium.' : `Cut them from the ${d.sheet.kind.toLowerCase()} with a jigsaw or a circular saw, drilling the gear holes through the full-size templates at the back, or on a CNC router from the DXF files.`} Holes for the gear are the patterns you typed; fixings to the frame are ${d.alu ? 'slots over the profile, for M8 bolts into T-nuts' : 'pilot holes for wood screws into the frame below'}.`, { color: C.ink2 });
    for (const pl of d.plates) {
      ensure(250);
      sub2(`${pl.label}: ${L(pl.w)} x ${L(pl.d)}${pl.measured ? '' : ' (example hole pattern)'}`);
      const sc = Math.min((CW - 40) / pl.w, 170 / pl.d), ox = M + 20, oy = y - 10 - pl.d * sc;
      page.drawSvgPath(roundRect(pl.w * sc, pl.d * sc, pl.r * sc), { x: ox, y: oy + pl.d * sc, color: C.ply, borderColor: C.ink, borderWidth: 0.8 });
      for (const h of pl.holes.concat(pl.fixings)) holeShape(page, ox, oy, sc, h, C, false);
      // the overall dimensions
      page.drawLine({ start: { x: ox, y: oy - 8 }, end: { x: ox + pl.w * sc, y: oy - 8 }, thickness: 0.6, color: C.sector });
      const tw = L(pl.w); page.drawText(safe(tw), { x: ox + pl.w * sc / 2 - w(tw, F.regular, 8.5) / 2, y: oy - 18, size: 8.5, font: F.regular, color: C.sector });
      page.drawLine({ start: { x: ox + pl.w * sc + 8, y: oy }, end: { x: ox + pl.w * sc + 8, y: oy + pl.d * sc }, thickness: 0.6, color: C.sector });
      const td = L(pl.d); page.drawText(safe(td), { x: ox + pl.w * sc + 19, y: oy + pl.d * sc / 2 - w(td, F.regular, 8.5) / 2, size: 8.5, font: F.regular, color: C.sector, rotate: degrees(90) });
      y = oy - 26;
      const gear = pl.holes.map(h => `${L(h.x)}, ${L(h.y)}`).join('; ');
      para(`Gear holes (${pl.holes.length}, ${Math.round(pl.holeD * 10) / 10} mm${pl.holes.some(h => h.slot) ? `, slotted ${L(pl.holes[0].slot)} front to back` : ''}), centres across and up from the corner: ${gear || 'none'}.`, { size: 8.5, color: C.ink2, after: 2 });
      para(`Fixings (${pl.fixings.length}): ${pl.fixings.map(h => `${L(h.x)}, ${L(h.y)}`).join('; ')}.`, { size: 8.5, color: C.ink2 });
    }

    // ---- 7. elevations ----
    newPage('elev', 'Side, front and top views');
    const solids = d.members.map(mem => ({ pts: corners(mem), kind: 'member' })).concat(d.slabs.map(s => ({ pts: slabCorners(s), kind: s.mat === 'alu' ? 'alu' : 'sheet' })));
    for (const [v, title] of [['side', 'Side view, from the right'], ['front', 'Front view, from the screen'], ['plan', 'Top view']]) {
      const VV = VIEWS[v];
      const polys = solids.map(sld => ({ pts: hull(sld.pts.map(q => [VV.u(q), VV.v(q)])), depth: Math.max(...sld.pts.map(VV.depth)), kind: sld.kind }));
      let u0 = Infinity, u1 = -Infinity, v0 = Infinity, v1 = -Infinity;
      for (const pp of polys) for (const q of pp.pts) { u0 = Math.min(u0, q[0]); u1 = Math.max(u1, q[0]); v0 = Math.min(v0, q[1]); v1 = Math.max(v1, q[1]); }
      const room = y - (M + 24) - 60;
      const boxW = CW - 60, boxH = v === 'side' ? 210 : room >= 90 ? Math.min(190, room) : 190;
      const scales = [5, 10, 12, 15, 20, 24, 25, 30, 40, 48, 50, 60, 75, 96, 100];
      const N = scales.find(n => (u1 - u0) / n * MMPT <= boxW && (v1 - v0) / n * MMPT <= boxH) || 120;
      const k = MMPT / N, dh = (v1 - v0) * k;
      ensure(dh + 60);
      page.drawText(safe(`${title}. Scale 1:${N} on ${u === 'metric' ? 'A4' : 'Letter'}`), { x: M, y: y - 12, size: 11, font: F.bold, color: C.ink });
      const ox = M + 30 + (boxW - (u1 - u0) * k) / 2 - u0 * k, oy = y - 30 - dh - v0 * k;
      polys.sort((a, b) => a.depth - b.depth);
      for (const pp of polys) {
        if (pp.pts.length < 3) continue;
        const path = pp.pts.map((q, i) => `${i ? 'L' : 'M'} ${(q[0] * k).toFixed(2)} ${(-q[1] * k).toFixed(2)}`).join(' ') + ' Z';
        page.drawSvgPath(path, { x: ox, y: oy, color: pp.kind === 'member' ? (d.alu ? C.alu : C.wood) : pp.kind === 'alu' ? C.alu : C.ply, borderColor: C.ink, borderWidth: 0.4 });
      }
      const dim = (a, b, at, label, vertical) => {
        const t = safe(label);
        if (!vertical) {
          const yv = oy + at * k; page.drawLine({ start: { x: ox + a * k, y: yv }, end: { x: ox + b * k, y: yv }, thickness: 0.6, color: C.sector });
          for (const e of [a, b]) page.drawLine({ start: { x: ox + e * k, y: yv - 4 }, end: { x: ox + e * k, y: yv + 4 }, thickness: 0.6, color: C.sector });
          page.drawText(t, { x: ox + (a + b) / 2 * k - w(t, F.regular, 8.5) / 2, y: yv + 3, size: 8.5, font: F.regular, color: C.sector });
        } else {
          const xv = ox + at * k; page.drawLine({ start: { x: xv, y: oy + a * k }, end: { x: xv, y: oy + b * k }, thickness: 0.6, color: C.sector });
          for (const e of [a, b]) page.drawLine({ start: { x: xv - 4, y: oy + e * k }, end: { x: xv + 4, y: oy + e * k }, thickness: 0.6, color: C.sector });
          page.drawText(t, { x: xv + 11, y: oy + (a + b) / 2 * k - w(t, F.regular, 8.5) / 2, size: 8.5, font: F.regular, color: C.sector, rotate: degrees(90) });
        }
      };
      if (v === 'side') {
        dim(u0, u1, v0 - 9 / k * 1.3, L(u1 - u0, 'dim'), false); dim(0, v1, u1 + 8 / k, L(v1, 'dim'), true);
        // the hip point and the wheel centre, as the table gives them
        for (const [q, t] of [[lay.H, 'Hip point'], [lay.wheel, 'Wheel centre']]) { page.drawCircle({ x: ox + q[0] * k, y: oy + q[1] * k, size: 2.4, color: C.sector }); page.drawText(safe(t), { x: ox + q[0] * k + 4, y: oy + q[1] * k + 3, size: 7.5, font: F.bold, color: C.sector }); }
      }
      if (v === 'front') { dim(u0, u1, v0 - 9 / k * 1.3, L(u1 - u0, 'dim'), false); dim(0, v1, u1 + 8 / k, L(v1, 'dim'), true); }
      if (v === 'plan') { dim(u0, u1, v1 + 8 / k, L(u1 - u0, 'dim'), false); dim(v0, v1, u1 + 8 / k, L(v1 - v0, 'dim'), true); }
      y -= dh + 56;
    }

    // ---- 8. the steps ----
    newPage('steps', 'Build steps');
    para('Build in this order. Each picture shows the parts of that step lifted out in yellow, over the work already done. The pieces for each step are listed under it.', { color: C.ink2 });
    const pics = (ctx.shots && ctx.shots.steps) || [];
    for (const stp of res.steps) {
      const parts = d.members.filter(x => x.step === stp.n);
      const slabsOf = d.sheets.filter(s => s.step === stp.n);
      const pic = pics.find(q => q.n === stp.n);
      ensure(pic ? 270 : 90);
      sub2(`Step ${res.steps.indexOf(stp) + 1}. ${stp.title}`);
      para(stp.text, { size: 10.5 });
      if (pic) await image(pic.url, CW * 0.84, 220);
      if (parts.length) {
        const groups = new Map();
        for (const c of parts) { const key = c.where; const g = groups.get(key) || { c, lens: new Map() }; const lk = L(pieceLen(c)); g.lens.set(lk, (g.lens.get(lk) || 0) + 1); groups.set(key, g); }
        para(`Pieces: ${[...groups.values()].map(g => `${g.c.where.toLowerCase()}${cutNote(g.c)}: ${[...g.lens].map(([kk, n]) => (n > 1 ? `${n} at ${kk}` : kk)).join(', ')}`).join('; ')}.`, { size: 9, color: C.ink2 });
      }
      if (slabsOf.length) para(`${d.sheet.kind}: ${slabsOf.map(s => `${s.where.toLowerCase()} ${L(Math.min(s.w, s.l))} x ${L(Math.max(s.w, s.l))}`).join('; ')}.`, { size: 9, color: C.ink2 });
      y -= 4;
    }

    // ---- 9. checks ----
    newPage('checks', 'The checks, with sources');
    para('Every check, with the studies, the SAE J1100 figures and the sim-racing guides it rests on, read on 14 October 2026. Where they disagree, the row gives the range and every source.', { color: C.ink2 });
    const used = [];
    const num = s => { let i = used.findIndex(x => x.url === s.url); if (i < 0) { used.push(s); i = used.length - 1; } return i + 1; };
    table([{ h: 'Result', w: 1 }, { h: 'Check', w: 2 }, { h: 'Yours', w: 2.4 }, { h: 'Guide', w: 2.2 }, { h: 'Why, and the source', w: 5 }], res.checks.map(r => ({ color: col2[r.status], cells: [word[r.status], r.title, r.yours, r.limit, `${r.reason}${r.sources.length ? ` Sources: ${r.sources.map(s => `${s.short} [${num(s)}]`).join('; ')}.` : ''}`] })), { size: 8.5, boldFirst: true });
    if (used.length) {
      sub2('Sources');
      for (const [i, s] of used.entries()) {
        para(`[${i + 1}] ${s.title}. Read ${longDate(s.checked)}.`, { size: 8.5, after: 0 });
        for (const ln of lines(s.url, F.regular, 8.5, CW - 14)) {
          ensure(12);
          page.drawText(ln, { x: M + 14, y: y - 8.5, size: 8.5, font: F.regular, color: C.sector });
          link(M + 14, y - 11, w(ln, F.regular, 8.5), 12, s.url);
          y -= 12;
        }
        y -= 4;
      }
    }
    const code = E.encode(m);
    para(`Made with Sim Rig Designer on ${made}: peakappsstudio.com/sim-rig-designer/. Share code of this design: ${code.slice(0, 60)}${code.length > 60 ? '...' : ''}`, { size: 8.5, color: C.ink2 });

    // ---- 9. drilling templates at full size, at the back so the plan prints without them ----
    const tm = 30, ov = 10;                                    // page margin (points), overlap between pages (mm)
    const gearPlates = d.plates.filter(pl => pl.holes.length);
    if (gearPlates.length) {
      newPage('templates', 'Drilling templates at full size');
      para('One template for the gear holes of each plate, at full size. Print these pages at 100% with no scaling, and check the bars at the foot of each page with a ruler.', { color: C.ink2 });
      para('Cut the plate to size first and draw a line across its middle. Where a template takes more than one page, the pages overlap by 10 mm: lay the black ringed crosses in the overlap on top of each other and tape the pages together. Lay the template with its dashed middle line on yours and its lower edge on the back edge of the plate, centre-punch every cross, then drill.', { color: C.ink2 });
      para(`Hold the template against your gear before you drill: if a hole does not line up, measure your gear again and change the pattern on the page. The fixings into the frame are not on the templates; the plate drawings on page ${api.index.plates} place them.`, { color: C.ink2 });
      table([{ h: 'Plate', w: 3 }, { h: 'Holes', w: 3 }, { h: 'Pages', w: 1, align: 'right' }], gearPlates.map(pl => ({ cells: [pl.label, `${pl.holes.length} at ${Math.round(pl.holeD * 10) / 10} mm${pl.holes.some(h => h.slot) ? `, slotted ${L(pl.holes[0].slot)}` : ''}${pl.measured ? '' : ' (example pattern)'}`, String(tileCount(pl))] })));
      for (const pl of gearPlates) {
        const t = tiling(pl);
        for (let r = 0; r < t.rows; r++) for (let c = 0; c < t.cols; c++) {
          newPage(null, null, [t.pw, t.ph]);
          const x0 = t.cx - t.half + c * (t.tw - ov), y0 = r * (t.th - ov);      // this page's window on the plate, mm
          const ww = Math.min(t.tw, t.cx + t.half - x0), wh = Math.min(t.th, t.top - y0);
          const px = tm, py = tm + 34, ox = px - x0 * MMPT, oy = py - y0 * MMPT;  // window corner and plate corner, points
          page.pushOperators(PDFLib.pushGraphicsState(), PDFLib.rectangle(px, py, ww * MMPT, wh * MMPT), PDFLib.clip(), PDFLib.endPath());
          page.drawSvgPath(roundRect(pl.w * MMPT, pl.d * MMPT, pl.r * MMPT), { x: ox, y: oy + pl.d * MMPT, color: rgb(0.992, 0.976, 0.945), borderColor: C.ink, borderWidth: 1.2 });
          page.drawLine({ start: { x: ox + t.cx * MMPT, y: oy }, end: { x: ox + t.cx * MMPT, y: oy + pl.d * MMPT }, thickness: 0.8, color: C.sector, dashArray: [7, 4] });
          for (const h of pl.holes) holeShape(page, ox, oy, MMPT, h, C, true);
          page.pushOperators(PDFLib.popGraphicsState());
          page.drawRectangle({ x: px, y: py, width: ww * MMPT, height: wh * MMPT, borderColor: C.ink3, borderWidth: 0.5, borderDashArray: [2, 3] });
          // ringed crosses down the middle of each overlap, at the same place on the plate on both pages
          const ring = (qx, qy) => {
            page.drawCircle({ x: qx, y: qy, size: 3, borderColor: C.ink, borderWidth: 0.5 });
            page.drawLine({ start: { x: qx - 7, y: qy }, end: { x: qx + 7, y: qy }, thickness: 0.5, color: C.ink });
            page.drawLine({ start: { x: qx, y: qy - 7 }, end: { x: qx, y: qy + 7 }, thickness: 0.5, color: C.ink });
          };
          const left = t.cx - t.half;
          for (let k = 1; k < t.cols; k++) {
            const xs = left + k * (t.tw - ov) + ov / 2;
            if (xs < x0 || xs > x0 + ww) continue;
            for (let yy = 20; yy <= t.top - 5; yy += 40) if (yy > y0 + 4 && yy < y0 + wh - 4) ring(ox + xs * MMPT, oy + yy * MMPT);
          }
          for (let k = 1; k < t.rows; k++) {
            const ys = k * (t.th - ov) + ov / 2;
            if (ys < y0 || ys > y0 + wh) continue;
            for (let xx = left + 20; xx <= left + 2 * t.half - 5; xx += 40) if (xx > x0 + 4 && xx < x0 + ww - 4) ring(ox + xx * MMPT, oy + ys * MMPT);
          }
          const mx = ox + t.cx * MMPT;
          if (mx > px + 2 && mx < px + ww * MMPT - 12) page.drawText(safe('Middle of the plate'), { x: mx + 11, y: py + wh * MMPT - 92, size: 8.5, font: F.bold, color: C.sector, rotate: degrees(90) });
          if (y0 === 0) page.drawText(safe('Back edge of the plate: lay this edge on it'), { x: px + 8, y: py + 5, size: 8.5, font: F.bold, color: C.ink });
          const tag = `${pl.label}, drilling template${t.rows * t.cols > 1 ? `, page ${String.fromCharCode(65 + r)}${c + 1} of ${t.rows * t.cols} (rows A${t.rows > 1 ? ` to ${String.fromCharCode(64 + t.rows)}` : ''} from the back edge)` : ''}`;
          page.drawText(safe(tag), { x: tm, y: t.ph - 26, size: 10, font: F.bold, color: C.ink });
          page.drawRectangle({ x: tm, y: tm + 15, width: 100 * MMPT, height: 4, color: C.ink });
          page.drawText(safe('100 mm'), { x: tm + 100 * MMPT + 6, y: tm + 14.5, size: 8, font: F.regular, color: C.ink });
          page.drawRectangle({ x: tm, y: tm + 5, width: 4 * 72, height: 4, color: C.sector });
          page.drawText(safe('4 in'), { x: tm + 4 * 72 + 6, y: tm + 4.5, size: 8, font: F.regular, color: C.ink });
        }
      }
    }
    // the window round the gear holes: across the plate's middle, from its back edge to past the last hole; then the
    // pages to print it on, portrait or landscape, whichever takes fewer
    function tiling(pl) {
      const cx = pl.w / 2;
      const half = Math.min(pl.w / 2, Math.max(...pl.holes.map(h => Math.abs(h.x - cx) + h.d / 2)) + 20);
      const top = Math.min(pl.d, Math.max(...pl.holes.map(h => h.y + (h.slot || 0) / 2 + h.d / 2)) + 20);
      const opts = [[PW, PH], [PH, PW]].map(([pw, ph]) => {
        const tw = (pw - 2 * tm) / MMPT, th = (ph - 2 * tm - 64) / MMPT;
        const cols = Math.max(1, Math.ceil((2 * half - ov) / (tw - ov) - 1e-9)), rows = Math.max(1, Math.ceil((top - ov) / (th - ov) - 1e-9));
        return { pw, ph, tw, th, cols, rows, cx, half, top };
      });
      return opts[1].cols * opts[1].rows < opts[0].cols * opts[0].rows ? opts[1] : opts[0];
    }
    function tileCount(pl) { const t = tiling(pl); return t.cols * t.rows; }

    // the contents, on the cover, now that every section has its page
    {
      const list = TOC.filter(([k]) => api.index[k]), rows = Math.ceil(list.length / 2), colW = CW / 2;
      cover.drawText(safe('In this plan'), { x: M, y: tocY - 14, size: 13.5, font: F.bold, color: C.ink });
      list.forEach(([k, label], i) => {
        const x = M + (i < rows ? 0 : colW), yy = tocY - 34 - (i % rows) * 16, pg = String(api.index[k]);
        cover.drawText(safe(label), { x, y: yy, size: 10, font: F.regular, color: C.ink });
        cover.drawText(pg, { x: x + colW - 18 - w(pg, F.bold, 10), y: yy, size: 10, font: F.bold, color: C.sector });
      });
    }
    return doc.save();
  }
  // a rounded rectangle path, w by h, its top left corner at the drawing origin (pdf-lib flips y for SVG paths)
  function roundRect(W, H, r) { r = Math.min(r, W / 2, H / 2); return `M ${r} 0 L ${W - r} 0 Q ${W} 0 ${W} ${r} L ${W} ${H - r} Q ${W} ${H} ${W - r} ${H} L ${r} ${H} Q 0 ${H} 0 ${H - r} L 0 ${r} Q 0 0 ${r} 0 Z`; }
  // a hole or a slot at its place on a plate drawn from (ox, oy) at sc points per mm; full size adds a drilling cross
  function holeShape(page, ox, oy, sc, h, C, cross) {
    const cx = ox + h.x * sc, cy = oy + h.y * sc, rr = Math.max(0.6, h.d / 2 * sc);
    if (h.slot > 0) {
      const hs = h.slot / 2 * sc;
      page.drawSvgPath(`M ${-rr} ${-hs} L ${-rr} ${hs} A ${rr} ${rr} 0 0 0 ${rr} ${hs} L ${rr} ${-hs} A ${rr} ${rr} 0 0 0 ${-rr} ${-hs} Z`, { x: cx, y: cy, color: C.white, borderColor: C.ink, borderWidth: 0.7 });
    } else page.drawCircle({ x: cx, y: cy, size: rr, color: C.white, borderColor: C.ink, borderWidth: 0.7 });
    if (cross) { const k = Math.max(rr + 3, 6); page.drawLine({ start: { x: cx - k, y: cy }, end: { x: cx + k, y: cy }, thickness: 0.4, color: C.sector }); page.drawLine({ start: { x: cx, y: cy - k }, end: { x: cx, y: cy + k }, thickness: 0.4, color: C.sector }); }
  }
  function pageOf(res, section) { return api.index[section] || 1; }
  return { api, pdf, pageOf, safe, corners, slabCorners, hull, roundRect };
});
