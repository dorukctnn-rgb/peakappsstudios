/* Cover template for the KDP coloring book maker: preview (SVG) and guides (PDF, PNG at 300 dpi).
 * Markup: an element with [data-cover] containing [data-c="trim|pages|ink|out|figure|pdf|png"].
 * Depends on window.KDP (kdp.js). Pro downloads go through PeakLicense.requirePro. */
(function () {
  'use strict';
  const K = window.KDP;
  const SVGNS = 'http://www.w3.org/2000/svg';
  const COL = { paper: '#ffffff', bleed: '#dfe2f1', spine: '#eef0f8', trim: '#4a4d55', safe: '#2f3f8f', warn: '#9a4a12', label: '#4a4d55', barcode: '#ffffff' };
  const PDFLIB_SRC = '/kdp-coloring-book/vendor/pdf-lib.min.js';

  // ---- lazy pdf-lib (shared with tool.js) ----
  let pdfLibPromise = null;
  function loadPdfLib() {
    if (window.PDFLib) return Promise.resolve(window.PDFLib);
    if (!pdfLibPromise) pdfLibPromise = new Promise((resolve, reject) => {
      const s = document.createElement('script');
      s.src = PDFLIB_SRC; s.async = true;
      s.onload = () => window.PDFLib ? resolve(window.PDFLib) : reject(new Error('pdf-lib did not load'));
      s.onerror = () => { pdfLibPromise = null; reject(new Error('Couldn’t load the PDF engine. Check your connection and try again.')); };
      document.head.appendChild(s);
    });
    return pdfLibPromise;
  }
  K.loadPdfLib = loadPdfLib;

  const f3 = n => K.fmt(n, 3);
  const evenUp = n => (n % 2 ? n + 1 : n);

  /** Drawing operations in inches, origin top-left. */
  function ops(c, opts = {}) {
    const o = [];
    const W = c.W, H = c.H, B = K.BLEED;
    o.push({ t: 'rect', x: 0, y: 0, w: W, h: H, fill: 'paper' });
    o.push({ t: 'band', outer: { x: 0, y: 0, w: W, h: H }, inner: { x: B, y: B, w: W - 2 * B, h: H - 2 * B }, fill: 'bleed' });
    o.push({ t: 'rect', ...c.spineRect, fill: 'spine' });
    o.push({ t: 'rect', x: B, y: B, w: W - 2 * B, h: H - 2 * B, stroke: 'trim', sw: 0.75 });
    for (const x of [c.spineRect.x, c.spineRect.x + c.spineRect.w]) o.push({ t: 'line', x1: x, y1: 0, x2: x, y2: H, stroke: 'trim', sw: 0.5, dash: true });
    o.push({ t: 'rect', ...c.backSafe, stroke: 'safe', sw: 0.75, dash: true });
    o.push({ t: 'rect', ...c.frontSafe, stroke: 'safe', sw: 0.75, dash: true });
    if (c.spineSafe) o.push({ t: 'rect', ...c.spineSafe, stroke: 'safe', sw: 0.75, dash: true });
    o.push({ t: 'rect', ...c.barcode, fill: 'barcode', stroke: 'trim', sw: 0.75 });
    o.push({ t: 'text', x: c.barcode.x + c.barcode.w / 2, y: c.barcode.y + c.barcode.h / 2 - 0.02, text: 'Barcode area', role: 'sm', color: 'label' });
    o.push({ t: 'text', x: c.barcode.x + c.barcode.w / 2, y: c.barcode.y + c.barcode.h / 2 + 0.17, text: '2 × 1.2 in', role: 'sm', color: 'label' });
    o.push({ t: 'text', x: c.back.x + c.back.w / 2, y: c.back.y + 0.55, text: 'BACK COVER', role: 'md', color: 'label', track: true });
    o.push({ t: 'text', x: c.front.x + c.front.w / 2, y: c.front.y + 0.55, text: 'FRONT COVER', role: 'md', color: 'label', track: true });
    const sx = c.spineRect.x + c.spineRect.w / 2, sy = c.spineRect.y + c.spineRect.h / 2;
    if (c.spine >= 0.16) {
      o.push({ t: 'text', x: sx, y: sy, text: c.spineText ? `SPINE ${f3(c.spine)} in` : 'NO SPINE TEXT', role: 'sm', color: c.spineText ? 'safe' : 'warn', rotate: 90, track: true });
    }
    o.push({ t: 'text', x: B + 0.06, y: B * 0.72, text: 'BLEED 0.125 in', role: 'xs', color: 'label', anchor: 'start' });
    if (opts.info) {
      const lines = [
        `Full cover ${f3(c.W)} × ${f3(c.H)} in (${Math.round(c.W * 300)} × ${Math.round(c.H * 300)} px at 300 dpi)`,
        `Trim ${K.trimLabel(c.trim)}, ${c.pages} pages, ${K.INKS[c.ink].label}`,
        `Spine ${f3(c.spine)} in = ${c.pages} × ${K.INKS[c.ink].spine} in`,
        c.spineText ? 'Spine text allowed: keep it inside the dashed spine box (0.0625 in from each fold).' : `No spine text: KDP needs at least ${K.SPINE_TEXT_MIN_PAGES} pages.`,
        'Dashed boxes: keep text and important art inside (0.125 in from trim and folds).',
        'Guide only. Hide or delete it before you export your cover for KDP.',
      ];
      const x = c.front.x + c.front.w / 2, y0 = c.front.y + c.front.h * 0.42;
      lines.forEach((text, i) => o.push({ t: 'text', x, y: y0 + i * 0.24, text, role: i === 5 ? 'smb' : 'sm', color: i === 5 ? 'warn' : 'label' }));
    }
    return o;
  }

  // ---- SVG preview ----
  function el(name, attrs, parent) {
    const n = document.createElementNS(SVGNS, name);
    for (const k in attrs) if (attrs[k] != null) n.setAttribute(k, attrs[k]);
    if (parent) parent.appendChild(n);
    return n;
  }
  function renderSVG(host, c) {
    const U = 100;                      // svg units per inch
    const PAD = { l: 4, r: 40, t: 24, b: 40 };   // room for labels, in screen pixels
    const pxPerIn = Math.min((Math.max(host.clientWidth, 240) - PAD.l - PAD.r) / c.W, (520 - PAD.t - PAD.b) / c.H);   // 520 = CSS max-height
    const px = n => n / pxPerIn * U;     // screen px → svg units
    const narrow = c.W * pxPerIn < 520;
    const svg = el('svg', { viewBox: `${-px(PAD.l)} ${-px(PAD.t)} ${c.W * U + px(PAD.l + PAD.r)} ${c.H * U + px(PAD.t + PAD.b)}`, role: 'img', 'aria-label': `Cover template, ${f3(c.W)} by ${f3(c.H)} inches, spine ${f3(c.spine)} inches` });
    const defs = el('defs', {}, svg);
    const pat = el('pattern', { id: 'cv-hatch', width: 8, height: 8, patternUnits: 'userSpaceOnUse', patternTransform: 'rotate(45)' }, defs);
    el('rect', { width: 8, height: 8, style: 'fill: color-mix(in oklab, var(--accent) 9%, #fff)' }, pat);
    el('line', { x1: 0, y1: 0, x2: 0, y2: 8, 'stroke-width': 3, style: 'stroke: color-mix(in oklab, var(--accent) 40%, #fff)' }, pat);
    el('rect', { x: px(2), y: px(4), width: c.W * U, height: c.H * U, fill: 'rgba(20,21,24,.09)' }, svg);
    const size = { xs: 10, sm: 10.5, smb: 10.5, md: 11.5 };
    const spinePx = c.spine * pxPerIn, barcodePx = c.barcode.w * pxPerIn;
    for (const op of ops(c)) {
      if (op.t === 'rect') {
        const cls = op.fill === 'paper' ? 'cv-paper' : op.fill === 'spine' ? 'cv-spine' : op.fill === 'barcode' ? 'cv-barcode' : op.stroke === 'safe' ? 'cv-safe' : 'cv-trim';
        el('rect', { x: op.x * U, y: op.y * U, width: op.w * U, height: op.h * U, class: cls }, svg);
      } else if (op.t === 'band') {
        const a = op.outer, b = op.inner;
        el('path', { d: `M${a.x * U} ${a.y * U}h${a.w * U}v${a.h * U}h${-a.w * U}Z M${b.x * U} ${b.y * U}v${b.h * U}h${b.w * U}v${-b.h * U}Z`, 'fill-rule': 'evenodd', class: 'cv-bleed' }, svg);
      } else if (op.t === 'line') {
        el('line', { x1: op.x1 * U, y1: op.y1 * U, x2: op.x2 * U, y2: op.y2 * U, class: 'cv-fold' }, svg);
      } else if (op.t === 'text') {
        if (op.role === 'xs' || op.rotate) continue;            // bleed label: legend below; spine label: handled below                                  // spine label handled below
        let text = op.text;
        if (text === 'Barcode area') { if (barcodePx < 110) continue; }
        if (text === '2 × 1.2 in' && barcodePx < 60) continue;
        if (text === '2 × 1.2 in' && barcodePx < 110) text = 'barcode';
        const t = el('text', { x: op.x * U, y: (text === 'barcode' ? c.barcode.y + c.barcode.h / 2 : op.y) * U, 'font-size': px(size[op.role] || 10.5), 'text-anchor': op.anchor || 'middle', 'dominant-baseline': 'middle',
          class: 'cv-label' + (op.color === 'safe' ? ' is-accent' : op.color === 'warn' ? ' is-warn' : ''), 'letter-spacing': op.track ? px(1.2) : null }, svg);
        t.textContent = text;
      }
    }
    // Spine label: inside the spine when it is wide enough on screen, otherwise above the cover.
    const sx = (c.spineRect.x + c.spineRect.w / 2) * U, sy = (c.spineRect.y + c.spineRect.h / 2) * U;
    const spineLabel = c.spineText ? `spine ${f3(c.spine)} in` : `spine ${f3(c.spine)} in, no text`;
    if (spinePx >= 22) {
      const t = el('text', { x: sx, y: sy, 'font-size': px(10.5), 'text-anchor': 'middle', 'dominant-baseline': 'middle', class: 'cv-label' + (c.spineText ? ' is-accent' : ' is-warn'), 'letter-spacing': px(1), transform: `rotate(90 ${sx} ${sy})` }, svg);
      t.textContent = c.spineText ? `SPINE ${f3(c.spine)} in` : 'NO SPINE TEXT';
    } else {
      el('line', { x1: sx, y1: -px(9), x2: sx, y2: px(2), class: 'pv-dim' }, svg);
      const t = el('text', { x: sx, y: -px(13), 'font-size': px(10.5), 'text-anchor': 'middle', class: 'cv-label' + (c.spineText ? ' is-accent' : ' is-warn') }, svg);
      t.textContent = spineLabel;
    }
    // Dimensions.
    const dy = c.H * U + px(16);
    el('line', { x1: 0, y1: dy, x2: c.W * U, y2: dy, class: 'pv-dim' }, svg);
    for (const x of [0, c.W * U]) el('line', { x1: x, y1: dy - px(5), x2: x, y2: dy + px(5), class: 'pv-dim' }, svg);
    const wt = el('text', { x: c.W * U / 2, y: dy + px(17), 'font-size': px(11.5), 'text-anchor': 'middle', class: 'pv-dimtext' }, svg);
    wt.textContent = narrow ? `${f3(c.W)} in wide` : `${f3(c.W)} in full width, spine ${f3(c.spine)} in`;
    const dx = c.W * U + px(16);
    el('line', { x1: dx, y1: 0, x2: dx, y2: c.H * U, class: 'pv-dim' }, svg);
    for (const y of [0, c.H * U]) el('line', { x1: dx - px(5), y1: y, x2: dx + px(5), y2: y, class: 'pv-dim' }, svg);
    const ht = el('text', { x: dx + px(12), y: c.H * U / 2, 'font-size': px(11.5), 'text-anchor': 'middle', class: 'pv-dimtext', transform: `rotate(90 ${dx + px(12)} ${c.H * U / 2})` }, svg);
    ht.textContent = `${f3(c.H)} in`;
    const legend = document.createElement('ul');
    legend.className = 'kdp-legend'; legend.setAttribute('aria-label', 'Legend');
    legend.innerHTML = '<li><i class="lg-trim"></i>Trim</li><li><i class="lg-bleed"></i>Bleed 0.125 in</li><li><i class="lg-safe"></i>Safe area</li><li><i class="lg-fold"></i>Spine folds</li>';
    host.replaceChildren(svg, legend);
  }

  // ---- PDF guide ----
  async function buildPDF(c) {
    const PDFLib = await loadPdfLib();
    const { PDFDocument, StandardFonts, rgb } = PDFLib;
    const hex = h => rgb(parseInt(h.slice(1, 3), 16) / 255, parseInt(h.slice(3, 5), 16) / 255, parseInt(h.slice(5, 7), 16) / 255);
    const doc = await PDFDocument.create();
    doc.setTitle(`KDP cover guide ${K.fmt(c.trim.w, 2)} x ${K.fmt(c.trim.h, 2)} in, ${c.pages} pages`);
    doc.setProducer('Peak Apps Tools'); doc.setCreator('Peak Apps Tools');
    const font = await doc.embedFont(StandardFonts.Helvetica);
    const bold = await doc.embedFont(StandardFonts.HelveticaBold);
    const P = 72, Hpt = c.H * P;
    const page = doc.addPage([c.W * P, Hpt]);
    const Y = (y, h = 0) => Hpt - (y + h) * P;
    const size = { xs: 5.5, sm: 7.5, smb: 7.5, md: 9 };
    for (const op of ops(c, { info: true })) {
      if (op.t === 'rect') {
        page.drawRectangle({ x: op.x * P, y: Y(op.y, op.h), width: op.w * P, height: op.h * P,
          color: op.fill ? hex(COL[op.fill]) : undefined, borderColor: op.stroke ? hex(COL[op.stroke]) : undefined,
          borderWidth: op.stroke ? op.sw : 0, borderDashArray: op.dash ? [3, 2] : undefined });
      } else if (op.t === 'band') {
        const a = op.outer, b = op.inner, col = hex(COL.bleed);
        page.drawRectangle({ x: a.x * P, y: Y(a.y, b.y - a.y), width: a.w * P, height: (b.y - a.y) * P, color: col });
        page.drawRectangle({ x: a.x * P, y: Y(b.y + b.h, a.y + a.h - b.y - b.h), width: a.w * P, height: (a.y + a.h - b.y - b.h) * P, color: col });
        page.drawRectangle({ x: a.x * P, y: Y(b.y, b.h), width: (b.x - a.x) * P, height: b.h * P, color: col });
        page.drawRectangle({ x: (b.x + b.w) * P, y: Y(b.y, b.h), width: (a.x + a.w - b.x - b.w) * P, height: b.h * P, color: col });
      } else if (op.t === 'line') {
        page.drawLine({ start: { x: op.x1 * P, y: Y(op.y1) }, end: { x: op.x2 * P, y: Y(op.y2) }, thickness: op.sw, color: hex(COL[op.stroke]), dashArray: op.dash ? [2, 2] : undefined });
      } else if (op.t === 'text') {
        const f = op.role === 'smb' || op.role === 'md' ? bold : font, s = size[op.role] || 7.5;
        const w = f.widthOfTextAtSize(op.text, s);
        if (op.rotate) {
          page.drawText(op.text, { x: op.x * P + s * 0.35, y: Y(op.y) - w / 2, size: s, font: f, color: hex(COL[op.color]), rotate: PDFLib.degrees(90) });
        } else {
          const x = op.anchor === 'start' ? op.x * P : op.x * P - w / 2;
          page.drawText(op.text, { x, y: Y(op.y) - s * 0.35, size: s, font: f, color: hex(COL[op.color]) });
        }
      }
    }
    return new Blob([await doc.save()], { type: 'application/pdf' });
  }

  // ---- PNG guide (300 dpi, with a pHYs chunk so editors open it at the right physical size) ----
  function crc32(bytes) {
    let c, crc = 0xffffffff;
    for (let n = 0; n < bytes.length; n++) {
      c = (crc ^ bytes[n]) & 0xff;
      for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
      crc = (crc >>> 8) ^ c;
    }
    return (crc ^ 0xffffffff) >>> 0;
  }
  function withDpi(buf, dpi) {
    const src = new Uint8Array(buf), ppm = Math.round(dpi / 0.0254);
    const chunk = new Uint8Array(21), dv = new DataView(chunk.buffer);
    dv.setUint32(0, 9); chunk.set([0x70, 0x48, 0x59, 0x73], 4);
    dv.setUint32(8, ppm); dv.setUint32(12, ppm); chunk[16] = 1;
    dv.setUint32(17, crc32(chunk.subarray(4, 17)));
    const at = 33;                                   // 8-byte signature + 25-byte IHDR chunk
    const out = new Uint8Array(src.length + chunk.length);
    out.set(src.subarray(0, at)); out.set(chunk, at); out.set(src.subarray(at), at + chunk.length);
    return out;
  }
  async function buildPNG(c) {
    let dpi = 300;
    const maxArea = 16.7e6;
    if (c.W * c.H * dpi * dpi > maxArea && /iP(hone|ad|od)/.test(navigator.userAgent)) dpi = Math.floor(Math.sqrt(maxArea / (c.W * c.H)));
    const draw = d => {
      const cv = document.createElement('canvas');
      cv.width = Math.round(c.W * d); cv.height = Math.round(c.H * d);
      const ctx = cv.getContext('2d');
      if (!ctx) return null;
      const S = d, size = { xs: 0.075, sm: 0.1, smb: 0.1, md: 0.125 };
      for (const op of ops(c, { info: true })) {
        ctx.setLineDash([]);
        if (op.t === 'rect') {
          if (op.fill) { ctx.fillStyle = COL[op.fill]; ctx.fillRect(op.x * S, op.y * S, op.w * S, op.h * S); }
          if (op.stroke) { ctx.strokeStyle = COL[op.stroke]; ctx.lineWidth = op.sw / 72 * S * 1.4; if (op.dash) ctx.setLineDash([0.04 * S, 0.03 * S]); ctx.strokeRect(op.x * S, op.y * S, op.w * S, op.h * S); }
        } else if (op.t === 'band') {
          const a = op.outer, b = op.inner;
          ctx.fillStyle = COL.bleed; ctx.beginPath(); ctx.rect(a.x * S, a.y * S, a.w * S, a.h * S); ctx.rect(b.x * S, b.y * S, b.w * S, b.h * S); ctx.fill('evenodd');
        } else if (op.t === 'line') {
          ctx.strokeStyle = COL[op.stroke]; ctx.lineWidth = op.sw / 72 * S * 1.4; if (op.dash) ctx.setLineDash([0.03 * S, 0.03 * S]);
          ctx.beginPath(); ctx.moveTo(op.x1 * S, op.y1 * S); ctx.lineTo(op.x2 * S, op.y2 * S); ctx.stroke();
        } else if (op.t === 'text') {
          ctx.save(); ctx.fillStyle = COL[op.color];
          ctx.font = `${op.role === 'smb' || op.role === 'md' ? 600 : 400} ${(size[op.role] || 0.1) * S}px Helvetica, Arial, sans-serif`;
          ctx.textAlign = op.anchor === 'start' ? 'left' : 'center'; ctx.textBaseline = 'middle';
          ctx.translate(op.x * S, op.y * S); if (op.rotate) ctx.rotate(op.rotate * Math.PI / 180);
          ctx.fillText(op.text, 0, 0); ctx.restore();
        }
      }
      return cv;
    };
    let cv = draw(dpi);
    let blob = cv && await new Promise(r => cv.toBlob(r, 'image/png'));
    if (!blob) { dpi = Math.floor(Math.sqrt(maxArea / (c.W * c.H))); cv = draw(dpi); blob = cv && await new Promise(r => cv.toBlob(r, 'image/png')); }
    if (!blob) throw new Error('This browser couldn’t draw an image that large.');
    return { blob: new Blob([withDpi(await blob.arrayBuffer(), dpi)], { type: 'image/png' }), dpi };
  }

  // ---- Widget ----
  function setup(root, options = {}) {
    const $ = k => root.querySelector(`[data-c="${k}"]`);
    const trimSel = $('trim'), inkSel = $('ink'), pagesIn = $('pages'), out = $('out'), fig = $('figure');
    trimSel.innerHTML = K.TRIMS.map(t => `<option value="${t.id}">${K.trimLabel(t)}${t.note ? ' (' + t.note + ')' : ''}</option>`).join('');
    inkSel.innerHTML = K.INK_ORDER.map(k => `<option value="${k}">${K.INKS[k].label}</option>`).join('');
    trimSel.value = options.trim || '8.5x11'; inkSel.value = options.ink || 'white';
    if (options.pages) pagesIn.value = options.pages;
    let touched = false, current = null;

    function state() {
      const raw = Math.round(Number(pagesIn.value) || 0);
      return { trim: trimSel.value, ink: inkSel.value, raw, pages: evenUp(Math.max(raw, 0)) };
    }
    function render() {
      const s = state();
      const range = K.pageRange(s.trim, s.ink);
      const rows = [];
      let pages = s.pages;
      if (pages < 24) pages = 24;
      const c = K.cover(s.trim, pages, s.ink);
      current = c;
      rows.push(['Spine width', `${f3(c.spine)} in (${K.mm(c.spine)} mm)`]);
      rows.push(['Full cover', `${f3(c.W)} × ${f3(c.H)} in`]);
      rows.push(['At 300 dpi', `${Math.round(c.W * 300)} × ${Math.round(c.H * 300)} px`]);
      rows.push(['Front / back', `${K.trimLabel(c.trim)} each`]);
      let html = rows.map(([a, b]) => `<dt>${a}</dt><dd>${b}</dd>`).join('');
      const notes = [];
      if (s.raw < 24) notes.push(['warn', `KDP's minimum is 24 pages; showing the cover for 24.`]);
      else if (s.raw % 2) notes.push(['ok', `KDP rounds ${s.raw} pages up to ${s.pages}; the spine uses ${s.pages}.`]);
      if (!range) notes.push(['warn', `${K.INKS[s.ink].label} isn't offered for ${K.trimLabel(s.trim)}.`]);
      else if (pages > range.max) notes.push(['warn', `${K.trimLabel(s.trim)} with ${K.INKS[s.ink].label.toLowerCase()} allows up to ${range.max} pages.`]);
      else if (pages < range.min) notes.push(['warn', `${K.INKS[s.ink].label} needs at least ${range.min} pages.`]);
      if (!c.spineText) notes.push(['warn', `No spine text: KDP only allows it from ${K.SPINE_TEXT_MIN_PAGES} pages. Leave the spine plain or use a color only.`]);
      else if (pages === 79) notes.push(['warn', 'Spine text at exactly 79 pages: KDP’s cover guide says “at least 79”, its submission guidelines say “more than 79”, and Cover Creator needs 80. Use 80+ to be safe.']);
      else notes.push(['ok', `Spine text allowed. Keep it ${K.SPINE_TEXT_CLEARANCE} in from each fold, inside the dashed spine box.`]);
      html += notes.map(([k, t]) => `<p class="is-${k}">${t}</p>`).join('');
      out.innerHTML = html;
      renderSVG(fig, c);
      if (options.onChange) options.onChange(c);
    }
    [trimSel, inkSel].forEach(n => n.addEventListener('change', () => { touched = true; render(); }));
    pagesIn.addEventListener('input', () => { touched = true; render(); });
    if ('ResizeObserver' in window) { let w = 0; new ResizeObserver(e => { const nw = Math.round(e[0].contentRect.width); if (nw !== w) { w = nw; if (current) renderSVG(fig, current); } }).observe(fig); }

    async function download(kind) {
      if (!window.PeakLicense || !PeakLicense.requirePro('The cover template download is part of Pro. The spine and cover numbers stay free.')) return;
      const s = state(); const pages = Math.max(24, s.pages);
      const c = K.cover(s.trim, pages, s.ink);
      const name = `kdp-cover-guide-${s.trim}-${pages}p-${s.ink}`;
      const btn = $(kind); btn.disabled = true;
      try {
        if (kind === 'pdf') { window.PeakUI.download(await buildPDF(c), name + '.pdf'); PeakUI.toast(`Cover guide saved: ${f3(c.W)} × ${f3(c.H)} in`); }
        else { const r = await buildPNG(c); window.PeakUI.download(r.blob, `${name}-${r.dpi}dpi.png`); PeakUI.toast(`PNG guide saved at ${r.dpi} dpi`); }
      } catch (e) { console.error(e); PeakUI.toast(e.message || 'Something went wrong.'); }
      finally { btn.disabled = false; }
    }
    $('pdf').addEventListener('click', () => download('pdf'));
    $('png').addEventListener('click', () => download('png'));
    render();
    return {
      sync(v) { if (touched) return; if (v.trim) trimSel.value = v.trim; if (v.ink) inkSel.value = v.ink; if (v.pages) pagesIn.value = v.pages; render(); },
      render,
    };
  }

  window.KDPCover = { setup, ops, buildPDF, buildPNG, renderSVG, loadPdfLib };
})();
