/* Calculators on the KDP coloring book guide pages. Needs kdp.js (window.KDP). */
(function () {
  'use strict';
  const K = window.KDP;
  const SVGNS = 'http://www.w3.org/2000/svg';
  const U = 100;
  const f = n => K.fmt(n, 3);
  const evenUp = n => (n % 2 ? n + 1 : n);

  function el(name, attrs, parent) {
    const n = document.createElementNS(SVGNS, name);
    for (const k in attrs) if (attrs[k] != null) n.setAttribute(k, attrs[k]);
    if (parent) parent.appendChild(n);
    return n;
  }
  function trimOptions(sel, value) {
    sel.innerHTML = K.TRIMS.map(t => `<option value="${t.id}">${K.trimLabel(t)}${t.note ? ' (' + t.note + ')' : ''}</option>`).join('');
    sel.value = value || '8.5x11';
  }
  function inkOptions(sel, value) {
    sel.innerHTML = K.INK_ORDER.map(k => `<option value="${k}">${K.INKS[k].label}</option>`).join('');
    sel.value = value || 'white';
  }
  const results = rows => rows.map(([a, b, c]) => `<div><dt>${a}</dt><dd>${b}${c ? `<small>${c}</small>` : ''}</dd></div>`).join('');
  function observe(node, fn) { if ('ResizeObserver' in window) { let w = 0; new ResizeObserver(e => { const nw = Math.round(e[0].contentRect.width); if (nw !== w) { w = nw; fn(); } }).observe(node); } }

  /** A facing-page spread (even page left, odd page right) with bleed, trim and safe area. */
  function spreadDiagram(host, trimId, bleed, pages) {
    const ps = K.pageSize(trimId, bleed);
    const pxPerIn = Math.min(Math.max(host.clientWidth - 8, 260) / (2 * ps.w + 0.2), (420 - 52) / ps.h);   // 420 = CSS max-height
    const px = v => v / pxPerIn * U;
    const W = ps.w * U, H = ps.h * U;
    const svg = el('svg', { viewBox: `${-px(4)} ${-px(26)} ${2 * W + px(8)} ${H + px(52)}`, role: 'img',
      'aria-label': `Two facing ${f(ps.w)} by ${f(ps.h)} inch pages with a ${f(K.gutter(pages))} inch gutter and ${f(K.outsideMargin(bleed))} inch outside margins` });
    const defs = el('defs', {}, svg);
    const pat = el('pattern', { id: 'g-hatch', width: px(6), height: px(6), patternUnits: 'userSpaceOnUse', patternTransform: 'rotate(45)' }, defs);
    el('rect', { width: px(6), height: px(6), style: 'fill: color-mix(in oklab, var(--accent) 10%, transparent)' }, pat);
    el('line', { x1: 0, y1: 0, x2: 0, y2: px(6), 'stroke-width': px(2.2), style: 'stroke: color-mix(in oklab, var(--accent) 34%, transparent)' }, pat);
    const fs = px(11);
    const narrow = ps.w * pxPerIn < 240;            // phone width: shorter labels
    ['left', 'right'].forEach((side, i) => {
      const g = el('g', { transform: `translate(${i * W} 0)` }, svg);
      el('rect', { x: px(i ? 3 : -3), y: px(5), width: W, height: H, class: 'pv-shadow' }, g);
      el('rect', { x: 0, y: 0, width: W, height: H, class: 'pv-page' }, g);
      const tr = K.trimRect(trimId, bleed, side);
      if (bleed) el('path', { d: `M0 0H${W}V${H}H0Z M${tr.x * U} ${tr.y * U}V${(tr.y + tr.h) * U}H${(tr.x + tr.w) * U}V${tr.y * U}Z`, 'fill-rule': 'evenodd', fill: 'url(#g-hatch)' }, g);
      el('rect', { x: tr.x * U, y: tr.y * U, width: tr.w * U, height: tr.h * U, class: 'pv-trim' }, g);
      const sa = K.safeArea(trimId, bleed, pages, side);
      el('rect', { x: sa.x * U, y: sa.y * U, width: sa.w * U, height: sa.h * U, class: 'pv-safe' }, g);
      const t = el('text', { x: W / 2, y: H / 2 - px(6), 'font-size': px(12), 'text-anchor': 'middle', class: 'pv-label is-art' }, g);
      t.textContent = narrow ? `${side === 'left' ? 'Even' : 'Odd'} (${side})` : `${side === 'left' ? 'Even' : 'Odd'} page (${side})`;
      const t2 = el('text', { x: W / 2, y: H / 2 + px(12), 'font-size': fs, 'text-anchor': 'middle', class: 'pv-label' }, g);
      t2.textContent = narrow ? `safe ${f(sa.w)} × ${f(sa.h)}` : `safe area ${f(sa.w)} × ${f(sa.h)} in`;
      // Gutter and outside arrows.
      const y = H * 0.22;
      const dim = (x1, x2, text, anchor) => {
        el('line', { x1, y1: y, x2, y2: y, class: 'pv-dim' }, g);
        for (const x of [x1, x2]) el('line', { x1: x, y1: y - px(4), x2: x, y2: y + px(4), class: 'pv-dim' }, g);
        const tt = el('text', { x: anchor === 'end' ? x1 - px(4) : x2 + px(4), y: y + px(4), 'font-size': fs, 'text-anchor': anchor, class: 'pv-dimtext' }, g);
        tt.textContent = text;
      };
      if (side === 'left') { dim(0, sa.x * U, '', 'end'); dim((sa.x + sa.w) * U, W, '', 'start'); }
      else { dim(0, sa.x * U, '', 'end'); dim((sa.x + sa.w) * U, W, '', 'start'); }
      const lab = el('text', { x: side === 'left' ? (sa.x + sa.w) * U - px(4) : sa.x * U + px(4), y: y - px(8), 'font-size': fs, 'text-anchor': side === 'left' ? 'end' : 'start', class: 'pv-dimtext' }, g);
      lab.textContent = narrow ? f(K.gutter(pages)) : `gutter ${f(K.gutter(pages))}`;
      const lab2 = el('text', { x: side === 'left' ? sa.x * U + px(4) : (sa.x + sa.w) * U - px(4), y: y - px(8), 'font-size': fs, 'text-anchor': side === 'left' ? 'start' : 'end', class: 'pv-dimtext' }, g);
      lab2.textContent = narrow ? f(K.outsideMargin(bleed)) : `${f(K.outsideMargin(bleed))} in`;
      const pl = el('text', { x: W / 2, y: H + px(18), 'font-size': fs, 'text-anchor': 'middle', class: 'pv-label' }, g);
      pl.textContent = narrow ? `${f(ps.w)} × ${f(ps.h)} in` : `${f(ps.w)} × ${f(ps.h)} in PDF page`;
    });
    el('line', { x1: W, y1: 0, x2: W, y2: H, class: 'pv-spine' }, svg);
    const st = el('text', { x: W, y: -px(10), 'font-size': px(11), 'text-anchor': 'middle', class: 'pv-label' }, svg);
    st.textContent = 'spine';
    host.replaceChildren(svg);
  }

  // ---- Bleed and margins calculator ----
  const mc = document.querySelector('[data-calc="margins"]');
  if (mc) {
    const trimSel = mc.querySelector('[name=trim]'), pagesIn = mc.querySelector('[name=pages]'), out = mc.querySelector('[data-out]'), fig = mc.querySelector('[data-fig]'), go = mc.querySelector('[data-go]'), note = mc.querySelector('[data-note]');
    const bleedSeg = mc.querySelector('[data-seg=bleed]');
    trimOptions(trimSel, '8.5x11');
    const getBleed = PeakUI.seg(bleedSeg, () => run());
    function run() {
      const t = trimSel.value, bleed = getBleed() === '1';
      const raw = Math.round(Number(pagesIn.value) || 0), pages = Math.min(Math.max(evenUp(raw), 24), 828);
      const ps = K.pageSize(t, bleed), g = K.gutter(pages), o = K.outsideMargin(bleed), sa = K.safeArea(t, bleed, pages, 'right');
      out.innerHTML = results([
        ['PDF page size', `${f(ps.w)} × ${f(ps.h)} in`, `${K.mm(ps.w)} × ${K.mm(ps.h)} mm, ${Math.round(ps.w * 72)} × ${Math.round(ps.h * 72)} pt`],
        ['Inside (gutter)', `${f(g)} in`, `${K.gutterBand(pages)} pages`],
        ['Top, bottom, outside', `${f(o)} in`, bleed ? '0.125 bleed + 0.25 from trim' : 'from the trim edge'],
        ['Safe area per page', `${f(sa.w)} × ${f(sa.h)} in`, `at 300 dpi: ${Math.ceil(sa.w * 300)} × ${Math.ceil(sa.h * 300)} px`],
      ]);
      const msgs = [];
      if (raw < 24) msgs.push('KDP’s minimum is 24 pages; showing 24.');
      else if (raw > 828) msgs.push('KDP’s maximum is 828 pages; showing 828.');
      else if (raw % 2) msgs.push(`KDP rounds ${raw} up to ${raw + 1} pages.`);
      note.textContent = msgs.join(' ');
      go.href = `/kdp-coloring-book/?trim=${encodeURIComponent(t)}&bleed=${bleed ? 1 : 0}`;
      spreadDiagram(fig, t, bleed, pages);
    }
    trimSel.addEventListener('change', run); pagesIn.addEventListener('input', run);
    observe(fig, run);
    run();
  }

  // ---- Blank backs vs double-sided ----
  const bc = document.querySelector('[data-calc="backs"]');
  if (bc) {
    const nIn = bc.querySelector('[name=designs]'), trimSel = bc.querySelector('[name=trim]'), inkSel = bc.querySelector('[name=ink]'), front = bc.querySelector('[name=front]');
    const A = bc.querySelector('[data-out=single]'), B = bc.querySelector('[data-out=double]'), go = bc.querySelector('[data-go]');
    trimOptions(trimSel, '8.5x11'); inkOptions(inkSel, 'white');
    function col(single) {
      const n = Math.max(1, Math.min(600, Math.round(Number(nIn.value) || 1)));
      const l = K.layout({ art: n, singleSided: single, belongsTo: front.checked, ink: inkSel.value, trimId: trimSel.value, padToMin: true });
      const pages = l.total, cost = K.printCostUSD(trimSel.value, Math.max(pages, 24), inkSel.value);
      const rows = [
        ['Pages', `${pages}${l.padded ? ` (incl. ${l.padded} padding)` : ''}`],
        ['Blank pages', String(l.blanks)],
        ['Gutter', `${f(K.gutter(Math.max(pages, 24)))} in`],
        ['Spine', `${f(K.spineWidth(Math.max(pages, 24), inkSel.value))} in`],
        ['Print cost, Amazon.com', cost == null ? 'n/a' : `$${cost.toFixed(2)}`],
      ];
      const problems = l.problems.map(p => `<p class="warn" style="margin-top:8px">${p.msg}</p>`).join('');
      return `<dl>${rows.map(([a, b]) => `<dt>${a}</dt><dd>${b}</dd>`).join('')}</dl>${problems}`;
    }
    function run() {
      A.innerHTML = col(true); B.innerHTML = col(false);
      go.href = `/kdp-coloring-book/?trim=${encodeURIComponent(trimSel.value)}&ink=${inkSel.value}&single=1`;
    }
    [nIn, trimSel, inkSel, front].forEach(n => n.addEventListener(n === nIn ? 'input' : 'change', run));
    run();
  }

  // ---- Spine width page: cover widget + Pro license for the template download ----
  const cv = document.querySelector('[data-cover]');
  if (cv && window.KDPCover) {
    if (window.PeakLicense) PeakLicense.setup(K.LICENSE);
    const go = document.querySelector('[data-go-cover]');
    KDPCover.setup(cv, { trim: '8.5x11', ink: 'white', pages: 100, onChange: c => { if (go) go.href = `/kdp-coloring-book/?trim=${encodeURIComponent(c.trim.id)}&ink=${c.ink}#cover`; } });
  }
})();
