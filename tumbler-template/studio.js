/* Tumbler & cone template studio (Peak Apps Tools).
 * UI for /tumbler-template/, /tumbler-template/conical-warp/ and /cone-template/ (mode from data-mode on [data-studio]).
 * Needs: /assets/site.js (PeakUI), /assets/license.js (PeakLicense), geometry.js (TumblerGeo), minipdf.js (MiniPDF, PeakPNG).
 */
(function () {
  'use strict';

  // ---- Owner: paste the Gumroad product id of "tumbler-studio-pro" here once the product exists. ----
  // Gumroad needs product_id to verify keys of products created after January 2023; until it is set,
  // license.js falls back to the permalink below.
  const GUMROAD_PRODUCT_ID = '';
  const PRO_PERMALINK = 'tumbler-studio-pro';
  const BUY_URL = 'https://dorukctn.gumroad.com/l/tumbler-studio-pro';

  const G = window.TumblerGeo;
  const root = document.querySelector('[data-studio]');
  if (!root || !G) return;
  const BASE = new URL('.', (document.currentScript && document.currentScript.src) || location.href).href;
  const mode = root.dataset.mode || 'tumbler';
  const isCone = mode === 'cone';
  const KEY = isCone ? 'peak-cone:v1' : 'peak-tumbler:v1';
  const BLANKS_KEY = 'peak-tumbler:blanks';
  const $ = (s, el = root) => el.querySelector(s);
  const $$ = (s, el = root) => [...el.querySelectorAll(s)];
  const toast = msg => window.PeakUI ? PeakUI.toast(msg) : alert(msg);
  const coarse = matchMedia('(pointer: coarse)').matches;

  // ---------- state ----------
  const DEF = isCone
    ? { unit: 'in', top: '6', bottom: '10', height: '7', heightMode: 'vertical', measure: 'diameter', bleedOn: false, bleed: '0.125', gap: '0', tab: '0.5', mirror: false, fit: 'stretch', paper: 'fit', labels: true, cutOnDesign: false }
    : { unit: 'in', top: '3.5', bottom: '2.75', height: '8', heightMode: 'vertical', measure: 'diameter', bleedOn: false, bleed: '0.125', gap: '0', tab: '0', mirror: false, fit: 'stretch', paper: 'fit', labels: true, cutOnDesign: false };
  const store = {
    get(k) { try { return JSON.parse(localStorage.getItem(k) || 'null'); } catch (e) { return null; } },
    set(k, v) { try { localStorage.setItem(k, JSON.stringify(v)); } catch (e) { /* private mode */ } },
  };
  const S = Object.assign({}, DEF, pick(store.get(KEY) || {}, Object.keys(DEF)), fromQuery());
  function pick(o, keys) { const r = {}; keys.forEach(k => { if (o[k] != null) r[k] = o[k]; }); return r; }
  function fromQuery() {
    const q = new URLSearchParams(location.search);
    if (!q.has('top') && !q.has('bottom') && !q.has('h')) return {};
    const r = {};
    if (q.has('unit') && /^(in|cm)$/.test(q.get('unit'))) r.unit = q.get('unit');
    if (q.has('top')) r.top = q.get('top');
    if (q.has('bottom')) r.bottom = q.get('bottom');
    if (q.has('h')) { r.height = q.get('h'); r.heightMode = 'vertical'; }
    if (q.has('slant')) { r.height = q.get('slant'); r.heightMode = 'slant'; }
    if (!q.has('h') && !q.has('slant')) { r.height = ''; r.heightMode = 'vertical'; } // guide links that leave the height to the user
    r.measure = q.get('circ') === '1' ? 'circumference' : 'diameter';
    if (q.has('gap')) r.gap = q.get('gap');
    if (q.has('bleed')) { r.bleedOn = q.get('bleed') !== '0'; if (+q.get('bleed') > 0) r.bleed = q.get('bleed'); }
    return r;
  }
  const save = () => store.set(KEY, S);

  // "3.5", "3 1/2", "3-1/2", "7/8", "3½", "3,5", '3.5"' -> number
  function parseLen(v) {
    if (v == null) return NaN;
    let s = String(v).trim().toLowerCase()
      .replace(/½/g, ' 1/2').replace(/¼/g, ' 1/4').replace(/¾/g, ' 3/4').replace(/⅛/g, ' 1/8').replace(/⅜/g, ' 3/8').replace(/⅝/g, ' 5/8').replace(/⅞/g, ' 7/8')
      .replace(/,/g, '.').replace(/\s*(″|"|inches|inch|in|cm)\s*$/, '').trim();
    if (!s) return NaN;
    let m = s.match(/^(\d+(?:\.\d*)?|\.\d+)$/);
    if (m) return parseFloat(m[1]);
    m = s.match(/^(?:(\d+)[\s-]+)?(\d+)\s*\/\s*(\d+)$/);
    if (m && +m[3]) return (m[1] ? +m[1] : 0) + (+m[2]) / (+m[3]);
    return NaN;
  }
  const toStr = (v, u) => String(+v.toFixed(u === 'in' ? 4 : 3));
  const len = (v, u = S.unit) => `${v.toFixed(2)} ${u}`;
  const frac = v => (S.unit === 'in' && isFinite(v) ? G.fraction16(v) + '″' : '');

  // ---------- elements ----------
  const inputs = {};
  $$('[data-in]').forEach(el => { inputs[el.dataset.in] = el; });
  const mat = $('[data-mat]'), svg = $('[data-svg]'), readout = $('[data-readout]'), errorEl = $('[data-error]');
  const statusEl = $('[data-status]'), gridLabel = $('[data-grid-label]');
  const checks = {};
  $$('[data-check]').forEach(el => { checks[el.dataset.check] = el; });
  const paperSel = $('[data-paper]');

  for (const [k, el] of Object.entries(inputs)) {
    el.value = S[k];
    el.addEventListener('input', () => { S[k] = el.value; save(); schedule(); });
  }
  for (const [k, el] of Object.entries(checks)) {
    el.checked = !!S[k];
    el.addEventListener('change', () => { S[k] = el.checked; save(); syncVisibility(); schedule(k === 'mirror' || k === 'cutOnDesign' || k === 'labels' ? 'soft' : undefined); });
  }
  if (paperSel) { paperSel.value = S.paper; paperSel.addEventListener('change', () => { S.paper = paperSel.value; save(); }); }

  // Segmented controls
  $$('[data-seg]').forEach(segEl => {
    const name = segEl.dataset.seg;
    segEl.querySelectorAll('button[data-value]').forEach(b => b.setAttribute('aria-pressed', String(b.dataset.value === S[name])));
    PeakUI.seg(segEl, v => {
      if (name === 'unit') return setUnit(v);
      S[name] = v; save(); syncLabels(); schedule();
    });
  });
  function setSeg(name, v) { $$(`[data-seg="${name}"] button[data-value]`).forEach(b => b.setAttribute('aria-pressed', String(b.dataset.value === v))); }

  function setUnit(u) {
    if (u === S.unit) return;
    const from = S.unit;
    for (const k of ['top', 'bottom', 'height', 'gap', 'bleed', 'tab']) {
      const n = parseLen(S[k]);
      if (isFinite(n)) S[k] = toStr(G.convert(n, from, u), u);
      if (inputs[k]) inputs[k].value = S[k];
    }
    S.unit = u; save(); setSeg('unit', u); syncLabels(); schedule();
  }
  function syncLabels() {
    $$('[data-u]').forEach(el => { el.textContent = S.unit; });
    $$('[data-dlabel]').forEach(el => { el.textContent = S.measure === 'circumference' ? 'circumference' : 'diameter'; });
    $$('[data-hlabel]').forEach(el => { el.textContent = S.heightMode === 'slant' ? 'Side length' : 'Height'; });
    if (gridLabel) gridLabel.textContent = '';
  }
  function syncVisibility() {
    $$('[data-when-bleed]').forEach(el => { el.hidden = !S.bleedOn; });
  }

  // ---------- compute ----------
  let g = null, lastErr = null, timer = 0;
  const MAX = { in: 100, cm: 254 };
  function compute() {
    const n = k => parseLen(S[k]);
    const opt = k => { const t = String(S[k] == null ? '' : S[k]).trim(); return t === '' ? 0 : parseLen(t); };
    const word = S.measure === 'circumference' ? 'circumference' : 'diameter';
    const empty = { top: `Enter the top ${word}.`, bottom: `Enter the bottom ${word}.`, height: S.heightMode === 'slant' ? 'Enter the side length you measured.' : 'Enter the height you measured.' };
    for (const k of ['top', 'bottom', 'height']) if (String(S[k] == null ? '' : S[k]).trim() === '') return { error: empty[k], field: k, empty: true };
    for (const k of ['top', 'bottom', 'height']) if (!isFinite(n(k))) return { error: `Check the ${k === 'height' ? (S.heightMode === 'slant' ? 'side length' : 'height') : k + ' ' + word}: use a number like 3.5 or 3 1/2.`, field: k };
    const vals = { top: n('top'), bottom: n('bottom'), height: n('height') };
    for (const [k, v] of Object.entries(vals)) if (isFinite(v) && v > MAX[S.unit]) return { error: `That’s over ${MAX[S.unit]} ${S.unit}. Check the ${k === 'height' ? 'height' : k + ' measurement'}.`, field: k };
    const gap = isCone ? 0 : opt('gap'), bleed = S.bleedOn ? opt('bleed') : 0, tab = isCone ? opt('tab') : 0;
    if (!isFinite(gap) || gap < 0) return { error: 'Check the handle gap: enter a length, or 0 for a full wrap.', field: 'gap' };
    if (!isFinite(bleed) || bleed < 0 || bleed > 2) return { error: 'Check the bleed: something like 0.125 in (3 mm) is usual.', field: 'bleed' };
    if (!isFinite(tab) || tab < 0) return { error: 'Check the glue tab width.', field: 'tab' };
    return G.solve({ unit: S.unit, top: vals.top, bottom: vals.bottom, height: vals.height, heightMode: S.heightMode, measure: S.measure, gap, bleed, tab });
  }
  function schedule(kind) {
    clearTimeout(timer);
    timer = setTimeout(() => update(kind), kind === 'soft' ? 0 : 60);
  }
  function update(kind) {
    const res = compute();
    Object.values(inputs).forEach(el => el.removeAttribute('aria-invalid'));
    if (res.error) {
      lastErr = res;
      if (errorEl) { errorEl.textContent = res.error; errorEl.hidden = false; }
      if (res.field && inputs[res.field]) inputs[res.field].setAttribute('aria-invalid', 'true');
      mat && mat.classList.add('is-stale');
      if (!g) drawEmpty(res.empty ? 'Your template appears here' : 'Check the measurements');
      $$('[data-needs-template]').forEach(b => { b.disabled = true; });
      save();
      return;
    }
    lastErr = null;
    if (errorEl) { errorEl.textContent = ''; errorEl.hidden = true; }
    mat && mat.classList.remove('is-stale');
    $$('[data-needs-template]').forEach(b => { b.disabled = false; });
    const changedShape = !g || kind !== 'soft';
    g = res;
    renderReadout();
    renderDesignHint();
    draw();
    save();
    if (design && changedShape) schedulePreview();
    else if (design && kind === 'soft') { updatePreviewStatus(); }
    updateDesignButtons();
  }

  // ---------- readout ----------
  function renderReadout() {
    if (!readout || !g) return;
    const rows = [];
    const item = (label, v, extra, title) => rows.push(`<div${title ? ` title="${title}"` : ''}><dt>${label}</dt><dd><span class="v">${v}</span>${extra ? `<span class="f">${extra}</span>` : ''}</dd></div>`);
    if (g.kind === 'rect') {
      item('Width (around)', len(g.W), frac(g.W));
      item('Height', len(g.h), frac(g.h));
      item('Shape', 'Rectangle', 'straight sides');
    } else {
      item('Top edge', len(g.topArc), frac(g.topArc), 'Length of the top curve');
      item('Bottom edge', len(g.bottomArc), frac(g.bottomArc), 'Length of the bottom curve');
      item('Side (slant)', len(g.s), frac(g.s), 'Length of each straight end');
      if (S.heightMode === 'slant') item('Height', len(g.h), frac(g.h), 'Straight-up height worked out from the side length');
      item('Outer radius', len(g.R), frac(g.R), 'Distance from the cone’s tip to the wide edge');
      item('Inner radius', len(g.r), frac(g.r), 'Distance from the cone’s tip to the narrow edge');
      item('Angle', `${g.spanDeg.toFixed(2)}°`, g.gap > 0 ? `of ${g.thetaDeg.toFixed(2)}°` : '');
    }
    item('Paper needed', `${g.width.toFixed(2)} × ${g.height.toFixed(2)}`, S.unit + (g.bleed > 0 ? ' with bleed' : g.tab > 0 ? ' with tab' : ''));
    readout.innerHTML = rows.join('');
    if (svg) svg.setAttribute('aria-label', g.kind === 'rect'
      ? `Flat template: a rectangle ${len(g.W)} wide and ${len(g.h)} tall.`
      : `Flat template: a curved band with a top edge of ${len(g.topArc)}, a bottom edge of ${len(g.bottomArc)}, straight ends of ${len(g.s)}, outer radius ${len(g.R)}, inner radius ${len(g.r)}, angle ${g.spanDeg.toFixed(1)} degrees.`);
  }

  // ---------- stage drawing (SVG in screen pixels) ----------
  const esc = s => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;');
  let stageK = 0, stageBox = null;
  function draw() {
    if (!svg || !mat || !g) return;
    const rect = mat.getBoundingClientRect();
    const cw = Math.round(rect.width), ch = Math.round(rect.height);
    if (cw < 60 || ch < 60) return;
    const small = cw < 560;
    const padL = small ? 30 : 44, padR = small ? 40 : 58, padT = small ? 40 : 50, padB = small ? 46 : 62;
    const k = Math.min((cw - padL - padR) / g.width, (ch - padT - padB) / g.height);
    const W = g.width * k, H = g.height * k;
    const ox = padL + (cw - padL - padR - W) / 2, oy = padT + (ch - padT - padB - H) / 2;
    stageK = k; stageBox = { ox, oy, W, H };
    const out = [];
    svg.setAttribute('viewBox', `0 0 ${cw} ${ch}`);
    svg.setAttribute('width', cw); svg.setAttribute('height', ch);

    // Cutting-mat grid aligned to the template's top-left corner.
    const steps = S.unit === 'in' ? [0.25, 0.5, 1, 2, 6, 12, 24] : [0.5, 1, 2, 5, 10, 20, 50];
    const minor = steps.find(v => v * k >= 13) || steps[steps.length - 1];
    const major = S.unit === 'in' ? (minor < 1 ? 1 : minor * 6) : (minor < 5 ? 5 : minor * 5);
    const lab = steps.find(v => v * k >= (small ? 30 : 36) && v >= minor) || major;
    const grid = [], gridMaj = [];
    const i0 = Math.floor(-ox / (minor * k)), i1 = Math.ceil((cw - ox) / (minor * k));
    for (let i = i0; i <= i1; i++) { const x = ox + i * minor * k; const v = i * minor; (isMult(v, major) ? gridMaj : grid).push(`M${x.toFixed(1)} 0V${ch}`); }
    const j0 = Math.floor(-oy / (minor * k)), j1 = Math.ceil((ch - oy) / (minor * k));
    for (let j = j0; j <= j1; j++) { const y = oy + j * minor * k; const v = j * minor; (isMult(v, major) ? gridMaj : grid).push(`M0 ${y.toFixed(1)}H${cw}`); }
    out.push(`<path class="mat-grid" d="${grid.join('')}"/><path class="mat-grid-major" d="${gridMaj.join('')}"/>`);
    // Rulers: numbers measured from the template's own corner.
    const ticks = [];
    for (let v = 0; v <= g.width + 1e-9; v += lab) ticks.push(`<text class="mat-num" x="${(ox + v * k).toFixed(1)}" y="${small ? 16 : 20}" text-anchor="middle">${+v.toFixed(2)}</text>`);
    for (let v = lab; v <= g.height + 1e-9; v += lab) ticks.push(`<text class="mat-num" x="${small ? 6 : 10}" y="${(oy + v * k + 4).toFixed(1)}">${+v.toFixed(2)}</text>`);
    out.push(ticks.join(''));
    if (gridLabel) gridLabel.textContent = `Grid ${+minor.toFixed(2)} ${S.unit} · bold ${+major.toFixed(2)} ${S.unit}`;

    const P = path => G.svgPath(G.toPage(g, path), k, 2);
    const paper = g.shapes.bleed || g.shapes.trim;
    out.push(`<defs><clipPath id="st-clip"><path d="${P(paper)}"/></clipPath>` +
      `<filter id="st-shadow" x="-10%" y="-10%" width="120%" height="130%"><feDropShadow dx="0" dy="3" stdDeviation="4" flood-color="#000" flood-opacity=".32"/></filter></defs>`);
    out.push(`<g transform="translate(${ox.toFixed(2)} ${oy.toFixed(2)})">`);
    out.push(`<g filter="url(#st-shadow)"><path class="tpl-paper" d="${P(paper)}"/>${g.shapes.tab ? `<path class="tpl-paper" d="${P(g.shapes.tab.concat([{ t: 'Z' }]))}"/>` : ''}</g>`);
    if (g.shapes.tab) out.push(`<path class="tpl-tab" d="${P(g.shapes.tab.concat([{ t: 'Z' }]))}"/>`);
    if (design && previewURL) out.push(`<image href="${previewURL}" x="0" y="0" width="${W.toFixed(2)}" height="${H.toFixed(2)}" preserveAspectRatio="none" clip-path="url(#st-clip)"/>`);
    if (g.shapes.bleed) out.push(`<path class="tpl-bleed" d="${P(g.shapes.bleed)}"/>`);
    out.push(`<path class="tpl-cut" d="${P(g.shapes.cut)}"/>`);
    if (g.shapes.fold) out.push(`<path class="tpl-fold" d="${P(g.shapes.fold)}"/>`);

    // Edge labels inside the piece (hidden when a design covers it, or when the piece is tiny on screen).
    if (!(design && previewURL) && g.s * k > 54) out.push(edgeLabels(k));
    out.push('</g>');

    // Dimension lines for the paper area.
    const dimY = oy + H + (small ? 18 : 22), dimX = ox + W + (small ? 14 : 20);
    out.push(`<path class="dim" d="M${ox} ${dimY}H${ox + W}M${ox} ${dimY - 5}v10M${ox + W} ${dimY - 5}v10"/>`);
    out.push(`<text class="dim-t" x="${ox + W / 2}" y="${dimY + 17}" text-anchor="middle">${esc(len(g.width))}</text>`);
    out.push(`<path class="dim" d="M${dimX} ${oy}V${oy + H}M${dimX - 5} ${oy}h10M${dimX - 5} ${oy + H}h10"/>`);
    out.push(`<text class="dim-t" transform="translate(${dimX + 15} ${oy + H / 2}) rotate(90)" text-anchor="middle">${esc(len(g.height))}</text>`);
    svg.innerHTML = out.join('');
  }
  // Grid-only mat with a short prompt, before there is a valid template to show.
  function drawEmpty(msg) {
    if (!svg || !mat) return;
    const rect = mat.getBoundingClientRect();
    const cw = Math.round(rect.width), ch = Math.round(rect.height);
    if (cw < 60 || ch < 60) return;
    let d = '';
    for (let x = 0; x <= cw; x += 24) d += `M${x} 0V${ch}`;
    for (let y = 0; y <= ch; y += 24) d += `M0 ${y}H${cw}`;
    svg.setAttribute('viewBox', `0 0 ${cw} ${ch}`);
    svg.innerHTML = `<path class="mat-grid" d="${d}"/><text class="dim-t" x="${cw / 2}" y="${ch / 2}" text-anchor="middle">${esc(msg)}</text>`;
    mat.classList.remove('is-stale');
  }
  function isMult(v, m) { const q = v / m; return Math.abs(q - Math.round(q)) < 1e-6; }

  function edgeLabels(k) {
    const parts = [];
    const fs = 11;
    const topTxt = `TOP EDGE ${g.topArc.toFixed(2)} ${S.unit}`, botTxt = `BOTTOM EDGE ${g.bottomArc.toFixed(2)} ${S.unit}`;
    const fits = (txt, lenPx) => txt.length * fs * 0.62 + 24 < lenPx;
    if (g.kind === 'rect') {
      const W = g.W * k, x0 = (g.bleed - g.box.minX) * k;
      const yTop = (g.box.maxY - g.h) * 0 + (g.bleed * k) + 17, yBot = (g.bleed + g.h) * k - 8;
      if (fits(topTxt, W)) parts.push(`<text class="tpl-label" x="${x0 + W / 2}" y="${yTop}" text-anchor="middle">${topTxt}</text>`);
      if (fits(botTxt, W)) parts.push(`<text class="tpl-label" x="${x0 + W / 2}" y="${yBot}" text-anchor="middle">${botTxt}</text>`);
      return parts.join('');
    }
    const a = g.span / 2;
    const arcPath = rad => [{ t: 'M', x: rad * Math.sin(-a), y: rad * Math.cos(-a) }, { t: 'A', cx: 0, cy: 0, rad, a0: -a, a1: a }];
    const topR = g.topIsOuter ? g.R - 17 / k : g.r + 17 / k;
    const botR = g.topIsOuter ? g.r + 8 / k : g.R - 8 / k;
    const defs = [];
    if (topR > 0 && fits(topTxt, topR * g.span * k)) {
      defs.push(`<path id="st-lt" d="${G.svgPath(G.toPage(g, arcPath(topR)), k, 2)}"/>`);
      parts.push(`<text class="tpl-label"><textPath href="#st-lt" startOffset="50%" text-anchor="middle">${topTxt}</textPath></text>`);
    }
    if (botR > 0 && botR * k > 30 && fits(botTxt, botR * g.span * k)) {
      defs.push(`<path id="st-lb" d="${G.svgPath(G.toPage(g, arcPath(botR)), k, 2)}"/>`);
      parts.push(`<text class="tpl-label"><textPath href="#st-lb" startOffset="50%" text-anchor="middle">${botTxt}</textPath></text>`);
    }
    return `<defs>${defs.join('')}</defs>${parts.join('')}`;
  }

  if (mat && 'ResizeObserver' in window) {
    let rt = 0, lastW = 0;
    new ResizeObserver(() => {
      cancelAnimationFrame(rt);
      rt = requestAnimationFrame(() => {
        draw();
        const w = mat.getBoundingClientRect().width;
        if (design && Math.abs(w - lastW) > 120) { lastW = w; schedulePreview(); }
      });
    }).observe(mat);
  } else window.addEventListener('resize', () => draw());

  // ---------- design (warp) ----------
  let design = null, previewURL = null, previewJob = 0, previewTimer = 0, jobSeq = 0;
  let previewWorker = null, workerBroken = false;
  const designCard = $('[data-design-card]');
  const dropEl = $('[data-drop]');
  const designInfo = $('[data-design-info]');

  function makeWorker() {
    if (workerBroken || typeof Worker === 'undefined') return null;
    try {
      const w = new Worker(BASE + 'warp-worker.js');
      w.addEventListener('error', () => { workerBroken = true; });
      return w;
    } catch (e) { workerBroken = true; return null; }
  }
  // Runs the warp in a worker when possible, otherwise in small chunks on the main thread.
  function warp(params, src, onProgress, worker) {
    if (worker && !workerBroken) {
      return new Promise((resolve, reject) => {
        const id = ++jobSeq;
        let settled = false;
        const onMsg = e => {
          if (e.data.id !== id) return;
          if (e.data.progress != null) { onProgress && onProgress(e.data.progress); return; }
          settled = true; cleanup();
          if (e.data.error) reject(new Error(e.data.error)); else resolve(new Uint8ClampedArray(e.data.buf));
        };
        const onErr = () => { if (settled) return; settled = true; cleanup(); workerBroken = true; warpMain(params, src, onProgress).then(resolve, reject); };
        const cleanup = () => { worker.removeEventListener('message', onMsg); worker.removeEventListener('error', onErr); };
        worker.addEventListener('message', onMsg);
        worker.addEventListener('error', onErr);
        const copy = src.slice();
        worker.postMessage({ id, src: copy.buffer, params }, [copy.buffer]);
      });
    }
    return warpMain(params, src, onProgress);
  }
  async function warpMain(params, src, onProgress) {
    const dst = new Uint8ClampedArray(params.outW * params.outH * 4);
    const rows = Math.max(1, Math.floor(120000 / params.outW));
    for (let y = 0; y < params.outH; y += rows) {
      G.warpRows(dst, src, params, y, Math.min(params.outH, y + rows));
      onProgress && onProgress((y + rows) / params.outH);
      await new Promise(r => setTimeout(r, 0));
    }
    return dst;
  }
  function makeCanvas(w, h) { const c = document.createElement('canvas'); c.width = w; c.height = h; return c; }
  function pixelsToCanvas(buf, w, h) {
    const c = makeCanvas(w, h);
    c.getContext('2d').putImageData(new ImageData(buf, w, h), 0, 0);
    return c;
  }
  // Clip the warped pixels to the exact outline (bleed if set) and optionally draw the cut line.
  function maskCanvas(c, ppu, withCut) {
    const ctx = c.getContext('2d');
    ctx.save();
    ctx.globalCompositeOperation = 'destination-in';
    ctx.beginPath(); G.tracePath(ctx, G.toPage(g, g.shapes.bleed || g.shapes.trim), ppu); ctx.fill();
    ctx.restore();
    if (withCut) {
      ctx.beginPath(); G.tracePath(ctx, G.toPage(g, g.shapes.trim), ppu);
      ctx.lineWidth = Math.max(1, ppu * (S.unit === 'in' ? 0.01 : 0.025)); ctx.strokeStyle = '#000'; ctx.stroke();
    }
  }
  async function decode(file) {
    if (!/^image\/(png|jpeg|webp)$/.test(file.type) && !/\.(png|jpe?g|webp)$/i.test(file.name)) throw new Error('Please use a PNG, JPG or WebP image.');
    if ('createImageBitmap' in window) {
      try { return await createImageBitmap(file, { imageOrientation: 'from-image' }); } catch (e) { /* fall back */ }
    }
    const url = URL.createObjectURL(file);
    try {
      const img = new Image(); img.decoding = 'async'; img.src = url;
      await img.decode();
      return img;
    } finally { setTimeout(() => URL.revokeObjectURL(url), 1000); }
  }
  // Draw the source at a size (keeping its aspect) and return its RGBA pixels.
  function sourcePixels(bitmap, maxW, maxH) {
    const w0 = bitmap.width, h0 = bitmap.height;
    const scale = Math.min(1, maxW / w0, maxH / h0);
    const w = Math.max(1, Math.round(w0 * scale)), h = Math.max(1, Math.round(h0 * scale));
    const c = makeCanvas(w, h);
    const ctx = c.getContext('2d');
    ctx.imageSmoothingQuality = 'high';
    ctx.drawImage(bitmap, 0, 0, w, h);
    return { data: ctx.getImageData(0, 0, w, h).data, w, h };
  }
  async function setDesign(file) {
    try {
      status('Opening ' + file.name + '…');
      const bitmap = await decode(file);
      if (!bitmap.width || !bitmap.height) throw new Error('That image is empty.');
      const prev = sourcePixels(bitmap, 1800, 1800);
      design = { name: file.name.replace(/\.[^.]+$/, ''), file, bitmap, w: bitmap.width, h: bitmap.height, prev };
      if (designInfo) {
        designInfo.hidden = false;
        $('[data-design-name]', designInfo).textContent = file.name;
        $('[data-design-px]', designInfo).textContent = `${bitmap.width} × ${bitmap.height} px`;
        const thumb = $('[data-design-thumb]', designInfo);
        if (thumb) { const t = sourcePixels(bitmap, 120, 120); const c = pixelsToCanvas(new Uint8ClampedArray(t.data), t.w, t.h); thumb.replaceChildren(c); }
      }
      if (dropEl) dropEl.classList.add('has-file');
      renderDesignHint();
      updateDesignButtons();
      schedulePreview(0);
    } catch (e) {
      status('');
      toast(e.message || 'Couldn’t open that image.');
    }
  }
  function clearDesign() {
    design = null;
    if (previewURL) URL.revokeObjectURL(previewURL);
    previewURL = null; previewJob++;
    if (designInfo) designInfo.hidden = true;
    if (dropEl) { dropEl.classList.remove('has-file'); const inp = $('input[type=file]', dropEl); if (inp) inp.value = ''; }
    status('');
    renderDesignHint(); updateDesignButtons(); draw();
  }
  function schedulePreview(delay = 140) { clearTimeout(previewTimer); previewTimer = setTimeout(updatePreview, delay); }
  async function updatePreview() {
    if (!design || !g) return;
    const job = ++previewJob;
    const dpr = Math.min(2, window.devicePixelRatio || 1);
    const target = Math.min(1600, Math.max(480, Math.round((stageBox ? stageBox.W : 800) * dpr)));
    let ppu = target / g.width;
    ppu = Math.min(ppu, Math.sqrt(2.6e6 / (g.width * g.height)));
    const p = G.warpParams(g, { ppu, mirror: false, fit: S.fit, srcW: design.prev.w, srcH: design.prev.h });
    if (!previewWorker) previewWorker = makeWorker();
    status('Bending your design…');
    try {
      const buf = await warp(p, design.prev.data, pr => { if (job === previewJob) status(`Bending your design… ${Math.round(pr * 100)}%`); }, previewWorker);
      if (job !== previewJob) return;
      const c = pixelsToCanvas(buf, p.outW, p.outH);
      maskCanvas(c, ppu, false);
      const blob = await new Promise(r => c.toBlob(r, 'image/png'));
      if (job !== previewJob || !blob) return;
      if (previewURL) URL.revokeObjectURL(previewURL);
      previewURL = URL.createObjectURL(blob);
      draw();
      updatePreviewStatus();
    } catch (e) {
      if (job === previewJob) status('Couldn’t bend the design: ' + e.message);
    }
  }
  function updatePreviewStatus() {
    if (!design) return status('');
    status(S.mirror ? 'Design bent to fit (exports mirrored)' : 'Design bent to fit');
  }
  function status(t) { if (statusEl) statusEl.textContent = t; }

  function renderDesignHint() {
    const el = $('[data-design-size]');
    if (!el || !g) return;
    const dpi = 300, pxPerUnit = S.unit === 'in' ? dpi : dpi / 2.54;
    const w = g.designW, h = g.designH;
    let t = `Best flat design size for this cup: <strong>${w.toFixed(2)} × ${h.toFixed(2)} ${S.unit}</strong> (${Math.round(w * pxPerUnit)} × ${Math.round(h * pxPerUnit)} px at 300 dpi). The tool bends it into the curve.`;
    if (design) {
      const da = design.w / design.h, ta = w / h;
      const diff = da / ta - 1;
      if (Math.abs(diff) > 0.04) t += ` <span class="st-note">Your image is ${Math.round(Math.abs(diff) * 100)}% ${diff > 0 ? 'wider' : 'taller'} than that shape. <em>Stretch</em> distorts it slightly; <em>Fit</em> keeps it whole; <em>Fill</em> trims the edges.</span>`;
    }
    el.innerHTML = t;
  }
  function updateDesignButtons() {
    $$('[data-needs-design]').forEach(b => { b.disabled = !design || !g; });
  }
  if (dropEl && window.PeakUI) PeakUI.drop(dropEl, files => setDesign(files[0]));
  $('[data-design-clear]') && $('[data-design-clear]').addEventListener('click', clearDesign);
  // fit segmented control triggers a preview refresh through S.fit
  const fitSeg = $('[data-seg="fit"]');
  if (fitSeg) fitSeg.addEventListener('click', () => { renderDesignHint(); schedulePreview(0); });

  // ---------- export helpers ----------
  const PAPERS = {
    letter: { w: 8.5, h: 11, label: 'Letter' }, legal: { w: 8.5, h: 14, label: 'Legal' }, tabloid: { w: 11, h: 17, label: 'Tabloid 11 × 17 in' },
    sb: { w: 13, h: 19, label: '13 × 19 in' }, a4: { w: 210 / 25.4, h: 297 / 25.4, label: 'A4' }, a3: { w: 297 / 25.4, h: 420 / 25.4, label: 'A3' },
  };
  const ptPerUnit = () => G.PT_PER_UNIT[S.unit];
  const baseName = () => {
    const n = v => String(+(+v).toFixed(2)).replace('.', '_');
    return `${isCone ? 'cone' : 'tumbler'}-template-${n(g.D1 * (S.measure === 'circumference' ? 1 : 1))}x${n(g.D2)}x${n(g.h)}${S.unit}`;
  };
  function describe() {
    const d = v => `${(+v).toFixed(2)} ${S.unit}`;
    const parts = [`Top Ø ${d(g.D1)}`, `bottom Ø ${d(g.D2)}`, `height ${d(g.h)}`];
    if (g.kind === 'arc') parts.push(`side ${d(g.s)}`, `top edge ${d(g.topArc)}`, `bottom edge ${d(g.bottomArc)}`, `R ${d(g.R)}`, `r ${d(g.r)}`, `angle ${g.spanDeg.toFixed(2)}°`);
    else parts.push(`width ${d(g.W)}`);
    if (g.gap > 0) parts.push(`handle gap ${d(g.gap)}`);
    if (g.bleed > 0) parts.push(`bleed ${d(g.bleed)}`);
    if (g.tab > 0) parts.push(`glue tab ${d(g.tab)}`);
    return parts.join(', ') + '.';
  }
  // Effective pixels per unit for raster exports: 300 dpi unless the device can't hold that many pixels.
  function rasterPpu(dpi = 300) {
    const want = S.unit === 'in' ? dpi : dpi / 2.54;
    const maxArea = coarse ? 16e6 : 64e6, maxSide = coarse ? 8000 : 16000;
    const ppu = Math.min(want, Math.sqrt(maxArea / (g.width * g.height)), maxSide / Math.max(g.width, g.height));
    return { ppu, dpi: ppu * (S.unit === 'in' ? 1 : 2.54), reduced: ppu < want - 1e-6 };
  }
  function canvasBlob(c) { return new Promise((res, rej) => c.toBlob(b => b ? res(b) : rej(new Error('Your browser ran out of memory making this image.')), 'image/png')); }
  async function busy(btn, fn) {
    if (btn) { btn.disabled = true; btn.setAttribute('aria-busy', 'true'); }
    try { await fn(); } catch (e) { console.error(e); toast(e.message || 'Something went wrong.'); }
    finally { if (btn) { btn.disabled = false; btn.removeAttribute('aria-busy'); } }
  }

  // Template outline drawn on a canvas (for the PNG export).
  function templateCanvas(ppu, dpi) {
    const c = makeCanvas(Math.round(g.width * ppu), Math.round(g.height * ppu));
    const ctx = c.getContext('2d');
    ctx.fillStyle = '#fff'; ctx.fillRect(0, 0, c.width, c.height);
    const lw = dpi / 100; // ~0.01 in
    if (g.shapes.bleed) {
      ctx.save(); ctx.beginPath(); G.tracePath(ctx, G.toPage(g, g.shapes.bleed), ppu);
      ctx.setLineDash([lw * 6, lw * 4]); ctx.lineWidth = lw * 0.8; ctx.strokeStyle = '#c8102e'; ctx.stroke(); ctx.restore();
    }
    ctx.beginPath(); G.tracePath(ctx, G.toPage(g, g.shapes.cut), ppu);
    ctx.lineWidth = lw; ctx.strokeStyle = '#000'; ctx.lineJoin = 'round'; ctx.stroke();
    if (g.shapes.fold) { ctx.save(); ctx.beginPath(); G.tracePath(ctx, G.toPage(g, g.shapes.fold), ppu); ctx.setLineDash([lw * 5, lw * 4]); ctx.lineWidth = lw * 0.8; ctx.strokeStyle = '#555'; ctx.stroke(); ctx.restore(); }
    if (S.labels) {
      const mid = centreLine();
      ctx.fillStyle = '#666'; ctx.textAlign = 'center';
      const fs = Math.max(10, Math.min(dpi * 0.11, (mid.bot - mid.top) * ppu / 6));
      ctx.font = `${fs}px Helvetica, Arial, sans-serif`;
      const x = mid.x * ppu;
      ctx.fillText(g.kind === 'arc' ? `TOP EDGE ${g.topArc.toFixed(3)} ${S.unit}` : `TOP ${g.topArc.toFixed(3)} ${S.unit}`, x, mid.top * ppu + fs * 1.6);
      ctx.fillText(g.kind === 'arc' ? `BOTTOM EDGE ${g.bottomArc.toFixed(3)} ${S.unit}` : `BOTTOM ${g.bottomArc.toFixed(3)} ${S.unit}`, x, mid.bot * ppu - fs * 0.8);
      ctx.font = `${fs * 0.85}px Helvetica, Arial, sans-serif`;
      ctx.fillText(g.kind === 'arc' ? `side ${g.s.toFixed(3)} ${S.unit}, R ${g.R.toFixed(3)} ${S.unit}, r ${g.r.toFixed(3)} ${S.unit}, angle ${g.spanDeg.toFixed(2)}°` : `${g.W.toFixed(3)} × ${g.h.toFixed(3)} ${S.unit}`, x, (mid.top + mid.bot) / 2 * ppu + fs * 0.3);
    }
    return c;
  }
  // Page-frame x of the centre line and y of the top/bottom edges at the centre (for labels).
  function centreLine() {
    if (g.kind === 'rect') { const b = g.bleed; return { x: b + g.W / 2, top: b, bot: b + g.h }; }
    const pts = G.toPage(g, [{ t: 'M', x: 0, y: g.R }, { t: 'L', x: 0, y: g.r }]);
    return { x: pts[0].x, top: Math.min(pts[0].y, pts[1].y), bot: Math.max(pts[0].y, pts[1].y) };
  }

  // Draw the template (and optional design image) onto a PDF page with its top-left at (x, y) points.
  function pdfTemplate(pg, x, y, k, opt = {}) {
    if (opt.image) pg.image(opt.image, x, y, g.width * k, g.height * k);
    pg.save().lineJoin(1);
    if (g.shapes.bleed && opt.bleedLine !== false) pg.begin('BleedLine').stroke([0.78, 0.06, 0.18]).lineWidth(0.5).dash([4, 3]).path(G.toPage(g, g.shapes.bleed), k, x, y, G).doStroke().end().dash([]);
    if (opt.cut !== false) pg.begin('CutLine').stroke([0, 0, 0]).lineWidth(0.6).path(G.toPage(g, g.shapes.cut), k, x, y, G).doStroke().end();
    if (g.shapes.fold && opt.cut !== false) pg.stroke([0.35, 0.35, 0.35]).lineWidth(0.5).dash([4, 3]).path(G.toPage(g, g.shapes.fold), k, x, y, G).doStroke().dash([]);
    pg.restore();
    if (opt.labels) {
      const m = centreLine();
      const cx = x + m.x * k, top = y + m.top * k, bot = y + m.bot * k;
      const room = bot - top;
      pg.fill([0.4, 0.4, 0.4]);
      if (room > 54) {
        pg.text(g.kind === 'arc' ? `TOP EDGE ${g.topArc.toFixed(3)} ${S.unit}` : `TOP ${g.W.toFixed(3)} ${S.unit}`, cx, top + 16, 8, { align: 'center', bold: true });
        pg.text(g.kind === 'arc' ? `BOTTOM EDGE ${g.bottomArc.toFixed(3)} ${S.unit}` : `BOTTOM ${g.W.toFixed(3)} ${S.unit}`, cx, bot - 8, 8, { align: 'center', bold: true });
      }
      if (room > 30) pg.text(g.kind === 'arc' ? `side ${g.s.toFixed(3)} ${S.unit}, R ${g.R.toFixed(3)} ${S.unit}, r ${g.r.toFixed(3)} ${S.unit}, angle ${g.spanDeg.toFixed(2)}°` : `${g.W.toFixed(3)} × ${g.h.toFixed(3)} ${S.unit}`, cx, (top + bot) / 2 + 3, 7, { align: 'center' });
    }
  }
  // Test square + print instructions in a band at (x, y), width w.
  function pdfInfo(pg, x, y, w, title) {
    const sq = S.unit === 'in' ? 72 : G.PT_PER_UNIT.cm * 2;
    pg.save().stroke([0, 0, 0]).lineWidth(0.5).rect(x, y, sq, sq).doStroke().restore();
    pg.fill([0.2, 0.2, 0.2]).text(S.unit === 'in' ? '1 in' : '2 cm', x + sq / 2, y + sq / 2 + 3, 8, { align: 'center' });
    const tx = x + sq + 14;
    pg.fill([0.08, 0.08, 0.08]).text(title, tx, y + 10, 10, { bold: true });
    pg.fill([0.25, 0.25, 0.25]).text(`Print at 100% / “Actual size” (not “Fit”). The square should measure exactly ${S.unit === 'in' ? '1 in' : '2 cm'}.`, tx, y + 25, 8);
    wrap(describe(), w - sq - 14, 7.5).forEach((line, i) => pg.text(line, tx, y + 39 + i * 10, 7.5));
    pg.fill([0.45, 0.45, 0.45]).text('peakappsstudio.com/' + (isCone ? 'cone-template' : 'tumbler-template') + '/', tx, y + sq, 7);
  }
  function wrap(text, maxW, size) {
    const words = text.split(' '), lines = []; let cur = '';
    for (const w of words) { const t = cur ? cur + ' ' + w : w; if (MiniPDF.textWidth(t, size) > maxW && cur) { lines.push(cur); cur = w; } else cur = t; }
    if (cur) lines.push(cur);
    return lines.slice(0, 3);
  }
  // Page size and placement for a single-sheet PDF. Returns null when the shape doesn't fit the paper.
  function singleLayout(paperKey, withInfo) {
    const k = ptPerUnit(), W = g.width * k, H = g.height * k;
    const band = withInfo ? 92 : 0;
    if (paperKey === 'fit') {
      const m = 36, pw = Math.max(W, withInfo ? 400 : 0) + 2 * m;
      return { pw, ph: H + 2 * m + band, x: (pw - W) / 2, y: m, info: withInfo, infoX: m, infoW: pw - 2 * m, infoY: m + H + 24 };
    }
    // Most inkjets print to about 1/8 in from the edge; the info band needs a little more room.
    const p = PAPERS[paperKey], m = 0.125 * 72, mi = 0.3 * 72;
    for (const [pw, ph] of [[p.w * 72, p.h * 72], [p.h * 72, p.w * 72]]) {
      if (withInfo && W <= pw - 2 * mi && H + band <= ph - 2 * mi) {
        const y = mi + (ph - 2 * mi - H - band) / 2;
        return { pw, ph, x: (pw - W) / 2, y, info: true, infoX: Math.min((pw - W) / 2, (pw - 400) / 2), infoW: Math.max(W, 400), infoY: y + H + 24 };
      }
    }
    for (const [pw, ph] of [[p.w * 72, p.h * 72], [p.h * 72, p.w * 72]]) {
      if (W <= pw - 2 * m && H <= ph - 2 * m) return { pw, ph, x: (pw - W) / 2, y: (ph - H) / 2, info: false };
    }
    return null;
  }
  function noFit(paperKey) {
    const p = PAPERS[paperKey];
    const msg = `This template needs ${g.width.toFixed(2)} × ${g.height.toFixed(2)} ${S.unit} and doesn’t fit on ${p.label}. Pick a bigger paper or “Template size”, or print it across several sheets (Pro).`;
    const el = $('[data-export-msg]'); if (el) { el.textContent = msg; el.hidden = false; }
    toast('Doesn’t fit on ' + p.label);
  }
  function clearExportMsg() { const el = $('[data-export-msg]'); if (el) { el.textContent = ''; el.hidden = true; } }

  // ---------- free exports ----------
  function exportSVG() {
    const u = S.unit;
    const P = path => G.svgPath(G.toPage(g, path), 1, 4);
    const W = +g.width.toFixed(4), H = +g.height.toFixed(4);
    const parts = [
      `<?xml version="1.0" encoding="UTF-8"?>`,
      `<!-- ${isCone ? 'Cone' : 'Tumbler'} template, true size. ${describe().replace(/--/g, '-')}. Made with peakappsstudio.com/${isCone ? 'cone-template' : 'tumbler-template'}/ -->`,
      `<svg xmlns="http://www.w3.org/2000/svg" width="${W}${u}" height="${H}${u}" viewBox="0 0 ${W} ${H}">`,
      `<title>${isCone ? 'Cone' : 'Tumbler'} template ${esc(describe())}</title>`,
    ];
    if (g.shapes.bleed) parts.push(`<path id="bleed-line" d="${P(g.shapes.bleed)}" fill="none" stroke="#c8102e" stroke-width="${u === 'in' ? 0.01 : 0.025}" stroke-dasharray="${u === 'in' ? '0.06 0.04' : '0.15 0.1'}"/>`);
    parts.push(`<path id="cut-line" d="${P(g.shapes.cut)}" fill="none" stroke="#000" stroke-width="${u === 'in' ? 0.01 : 0.025}"/>`);
    if (g.shapes.fold) parts.push(`<path id="fold-line" d="${P(g.shapes.fold)}" fill="none" stroke="#666" stroke-width="${u === 'in' ? 0.01 : 0.025}" stroke-dasharray="${u === 'in' ? '0.06 0.04' : '0.15 0.1'}"/>`);
    parts.push('</svg>');
    PeakUI.download(new Blob([parts.join('\n')], { type: 'image/svg+xml' }), baseName() + '.svg');
    toast('SVG saved at true size: ' + `${g.width.toFixed(2)} × ${g.height.toFixed(2)} ${u}`);
  }
  async function exportTemplatePDF() {
    clearExportMsg();
    const lay = singleLayout(S.paper, true);
    if (!lay) return noFit(S.paper);
    const pdf = new MiniPDF({ title: (isCone ? 'Cone' : 'Tumbler') + ' template', subject: describe() });
    const pg = pdf.addPage(lay.pw, lay.ph);
    const k = ptPerUnit();
    pdfTemplate(pg, lay.x, lay.y, k, { labels: S.labels });
    if (lay.info) pdfInfo(pg, lay.infoX, lay.infoY, lay.infoW, (isCone ? 'Cone' : 'Tumbler') + ' template');
    PeakUI.download(new Blob([pdf.build()], { type: 'application/pdf' }), baseName() + (S.paper === 'fit' ? '' : '-' + S.paper) + '.pdf');
    toast('PDF saved. Print at 100% (Actual size).');
  }
  async function exportTemplatePNG() {
    const r = rasterPpu(300);
    const c = templateCanvas(r.ppu, r.dpi);
    const blob = await PeakPNG.withDpi(await canvasBlob(c), r.dpi);
    PeakUI.download(blob, baseName() + '.png');
    toast(r.reduced ? `PNG saved at ${Math.round(r.dpi)} dpi (the most this device can make at this size).` : 'PNG saved at 300 dpi.');
  }
  // Full-resolution warped design.
  async function renderDesign(src, onProgress, worker) {
    const r = rasterPpu(300);
    const needW = Math.ceil(g.designW * r.ppu * 1.05), needH = Math.ceil(g.designH * r.ppu * 1.05);
    const sp = sourcePixels(src, Math.max(needW, 64), Math.max(needH, 64));
    const p = G.warpParams(g, { ppu: r.ppu, mirror: S.mirror, fit: S.fit, srcW: sp.w, srcH: sp.h });
    const buf = await warp(p, sp.data, onProgress, worker);
    const c = pixelsToCanvas(buf, p.outW, p.outH);
    maskCanvas(c, r.ppu, S.cutOnDesign);
    return { canvas: c, r };
  }
  async function exportDesignPNG() {
    if (!design) return;
    const w = makeWorker();
    try {
      const { canvas, r } = await renderDesign(design.bitmap, pr => status(`Making the 300 dpi file… ${Math.round(pr * 100)}%`), w);
      status('Saving PNG…');
      const blob = await PeakPNG.withDpi(await canvasBlob(canvas), r.dpi);
      PeakUI.download(blob, `${design.name}-warped-${baseName()}.png`);
      toast(r.reduced ? `Saved at ${Math.round(r.dpi)} dpi (the most this device can make at this size).` : `Saved: ${canvas.width} × ${canvas.height} px at 300 dpi${S.mirror ? ', mirrored' : ''}.`);
    } finally { w && w.terminate(); updatePreviewStatus(); }
  }
  async function imageForPDF(pdf, canvas) {
    const data = canvas.getContext('2d').getImageData(0, 0, canvas.width, canvas.height).data;
    return pdf.addImageRGBA(data, canvas.width, canvas.height, async () => {
      const c2 = makeCanvas(canvas.width, canvas.height); const x = c2.getContext('2d');
      x.fillStyle = '#fff'; x.fillRect(0, 0, c2.width, c2.height); x.drawImage(canvas, 0, 0);
      const b = await new Promise(r => c2.toBlob(r, 'image/jpeg', 0.95));
      return new Uint8Array(await b.arrayBuffer());
    });
  }
  async function exportDesignPDF() {
    if (!design) return;
    clearExportMsg();
    const lay = singleLayout(S.paper, false);
    if (!lay) return noFit(S.paper);
    const w = makeWorker();
    try {
      const { canvas } = await renderDesign(design.bitmap, pr => status(`Making the 300 dpi file… ${Math.round(pr * 100)}%`), w);
      status('Building PDF…');
      const pdf = new MiniPDF({ title: `${design.name} (bent for a ${isCone ? 'cone' : 'tumbler'})`, subject: describe() });
      const pg = pdf.addPage(lay.pw, lay.ph);
      const name = await imageForPDF(pdf, canvas);
      pdfTemplate(pg, lay.x, lay.y, ptPerUnit(), { image: name, cut: S.cutOnDesign, bleedLine: false, labels: false });
      PeakUI.download(new Blob([pdf.build()], { type: 'application/pdf' }), `${design.name}-warped-${baseName()}${S.paper === 'fit' ? '' : '-' + S.paper}.pdf`);
      toast('PDF saved. Print at 100% (Actual size)' + (S.mirror ? ', mirrored.' : '.'));
    } finally { w && w.terminate(); updatePreviewStatus(); }
  }

  const actions = {
    'svg': (b) => busy(b, async () => exportSVG()),
    'pdf': (b) => busy(b, exportTemplatePDF),
    'png': (b) => busy(b, exportTemplatePNG),
    'design-png': (b) => busy(b, exportDesignPNG),
    'design-pdf': (b) => busy(b, exportDesignPDF),
    'tiles': () => openTiles(),
    'batch': () => openBatch(),
    'presets': () => openPresets(),
    'copy-link': (b) => copyLink(b),
  };
  root.addEventListener('click', e => {
    const b = e.target.closest('[data-action]');
    if (!b || !root.contains(b)) return;
    e.preventDefault();
    if (!g && b.dataset.action !== 'presets') return toast('Fix the measurements first.');
    actions[b.dataset.action] && actions[b.dataset.action](b);
  });
  function copyLink(b) {
    const q = new URLSearchParams();
    q.set('top', S.top); q.set('bottom', S.bottom);
    q.set(S.heightMode === 'slant' ? 'slant' : 'h', S.height);
    if (S.unit !== 'in') q.set('unit', S.unit);
    if (S.measure === 'circumference') q.set('circ', '1');
    if (!isCone && parseLen(S.gap) > 0) q.set('gap', S.gap);
    const url = location.origin + location.pathname + '?' + q.toString();
    const done = () => toast('Link copied. It opens the generator with these measurements.');
    if (navigator.clipboard) navigator.clipboard.writeText(url).then(done, () => prompt('Copy this link', url));
    else prompt('Copy this link', url);
  }

  // ---------- Pro ----------
  function setupLicense() {
    if (!window.PeakLicense) return;
    PeakLicense.setup({
      tool: 'tumbler', productId: GUMROAD_PRODUCT_ID, permalink: PRO_PERMALINK, buyUrl: BUY_URL,
      pitch: 'Pro ($19, one-time) adds printing across several sheets with alignment marks, batch warping to a ZIP and a one-click library of published blank sizes plus your own saved blanks.',
    });
    PeakLicense.onChange(pro => {
      document.documentElement.classList.toggle('is-pro', pro);
      $$('[data-pro-state]', document).forEach(el => { el.textContent = pro ? 'Pro is active on this browser.' : ''; el.hidden = !pro; });
      $$('[data-pro-signout]', document).forEach(el => { el.hidden = !pro; });
    });
    $$('[data-pro-signout]', document).forEach(el => el.addEventListener('click', e => { e.preventDefault(); PeakLicense.signOut(); toast('Pro switched off on this browser.'); }));
  }
  const isPro = () => !!(window.PeakLicense && PeakLicense.isPro());
  const needPro = reason => (window.PeakLicense ? PeakLicense.requirePro(reason) : false);

  function makeDialog(cls, html) {
    const d = document.createElement('dialog');
    d.className = 'license-dialog st-dialog ' + cls;
    d.innerHTML = html;
    document.body.appendChild(d);
    d.addEventListener('click', e => { if (e.target === d) d.close(); });
    return d;
  }

  // Tiled printing
  let tilesDlg = null;
  function openTiles() {
    if (!tilesDlg) {
      tilesDlg = makeDialog('st-dialog-wide', `
        <form method="dialog">
          <div class="st-dlg-head"><h2>Print across several sheets <span class="pro-tag">Pro</span></h2><button class="st-x" value="close" aria-label="Close">×</button></div>
          <p class="small muted" style="margin:0">For templates bigger than your printer’s paper. Each sheet overlaps the next, with ⊕ marks to line them up and a map page with a scale square.</p>
          <div class="row">
            <label class="field"><span>Paper</span><select class="select" data-t="paper">
              <option value="letter">Letter 8.5 × 11 in</option><option value="legal">Legal 8.5 × 14 in</option><option value="a4">A4 210 × 297 mm</option><option value="sb">13 × 19 in</option><option value="tabloid">Tabloid 11 × 17 in</option><option value="a3">A3 297 × 420 mm</option></select></label>
            <label class="field"><span>Overlap</span><select class="select" data-t="overlap"><option value="0.25">0.25 in (6 mm)</option><option value="0.5" selected>0.5 in (13 mm)</option><option value="1">1 in (25 mm)</option></select></label>
          </div>
          ${isCone ? '' : '<label class="check"><input type="checkbox" data-t="design" checked> <span>Include my bent design (when one is added)</span></label>'}
          <div class="st-tilemap" data-t="map" aria-hidden="true"></div>
          <p class="small" data-t="summary" role="status"></p>
          <div class="st-dlg-actions"><button class="btn btn-primary" data-t="go">Download tiled PDF <span class="pro-tag">Pro</span></button><button class="btn" value="close">Close</button></div>
        </form>`);
      const q = s => tilesDlg.querySelector(`[data-t="${s}"]`);
      q('paper').value = S.unit === 'cm' ? 'a4' : 'letter';
      ['paper', 'overlap'].forEach(n => q(n).addEventListener('change', () => tilesPreview()));
      q('go').addEventListener('click', e => {
        e.preventDefault();
        if (!needPro('Printing across several sheets is part of Pro ($19, one-time).')) return;
        busy(q('go'), () => exportTiles(q('paper').value, +q('overlap').value, !!(q('design') && q('design').checked)));
      });
    }
    tilesPreview();
    tilesDlg.showModal();
  }
  function tileSpec(paperKey, overlapIn) {
    const p = PAPERS[paperKey];
    const k = ptPerUnit();
    // Work in points: margin 0.25 in for the printer's edge plus room for labels.
    const t = G.tile(g.width * k, g.height * k, { w: p.w * 72, h: p.h * 72 }, 0.4 * 72, overlapIn * 72);
    return t;
  }
  function tilesPreview() {
    const q = s => tilesDlg.querySelector(`[data-t="${s}"]`);
    const t = tileSpec(q('paper').value, +q('overlap').value);
    const map = q('map');
    if (!t) { map.innerHTML = ''; q('summary').textContent = 'That paper is too small for these settings.'; return; }
    const k = ptPerUnit();
    const W = g.width * k, H = g.height * k;
    const s = 300 / Math.max(W, H);
    const cells = [];
    for (let r = 0; r < t.rows; r++) for (let c = 0; c < t.cols; c++) {
      const x = c * t.stepX * s, y = r * t.stepY * s;
      cells.push(`<rect x="${x}" y="${y}" width="${t.aw * s}" height="${t.ah * s}" class="tm-sheet"/><text x="${x + 6}" y="${y + 14}" class="tm-label">${String.fromCharCode(65 + r)}${c + 1}</text>`);
    }
    const vw = Math.max(W * s, (t.cols - 1) * t.stepX * s + t.aw * s), vh = Math.max(H * s, (t.rows - 1) * t.stepY * s + t.ah * s);
    map.innerHTML = `<svg viewBox="-4 -4 ${vw + 8} ${vh + 8}" width="100%" style="max-height:260px"><path class="tm-shape" d="${G.svgPath(G.toPage(g, g.shapes.bleed || g.shapes.cut), k * s, 2)}"/>${cells.join('')}</svg>`;
    q('summary').textContent = `${t.count} ${PAPERS[q('paper').value].label} sheet${t.count > 1 ? 's' : ''} (${t.cols} across × ${t.rows} down, ${t.landscape ? 'landscape' : 'portrait'}) plus a map page.`;
  }
  async function exportTiles(paperKey, overlapIn, withDesign) {
    const t = tileSpec(paperKey, overlapIn);
    if (!t) throw new Error('That paper is too small for these settings.');
    const k = ptPerUnit(), W = g.width * k, H = g.height * k, m = 0.4 * 72, o = overlapIn * 72;
    const pdf = new MiniPDF({ title: (isCone ? 'Cone' : 'Tumbler') + ' template, tiled', subject: describe() });
    let img = null;
    if (withDesign && design) {
      const w = makeWorker();
      try { const { canvas } = await renderDesign(design.bitmap, pr => status(`Making the 300 dpi file… ${Math.round(pr * 100)}%`), w); img = await imageForPDF(pdf, canvas); }
      finally { w && w.terminate(); updatePreviewStatus(); }
    }
    const label = (r, c) => String.fromCharCode(65 + r) + (c + 1);
    // Page 1: assembly map, scale square, instructions.
    {
      const pw = t.landscape ? PAPERS[paperKey].h * 72 : PAPERS[paperKey].w * 72, ph = t.landscape ? PAPERS[paperKey].w * 72 : PAPERS[paperKey].h * 72;
      const pg = pdf.addPage(pw, ph);
      pg.fill([0.08, 0.08, 0.08]).text('How to put the sheets together', m, m + 14, 14, { bold: true });
      const steps = [
        `1. Print every page at 100% / “Actual size”. Check the square below measures ${S.unit === 'in' ? '1 in' : '2 cm'}.`,
        `2. Lay the sheets out like the map: row A at the top, column 1 on the left.`,
        `3. Neighbouring sheets share a ${overlapIn} in strip. Trim the top sheet along its grey border, lay it over the next`,
        `    one so the circled-cross marks sit exactly on top of each other, then tape.`,
      ];
      steps.forEach((s, i) => pg.fill([0.25, 0.25, 0.25]).text(s, m, m + 36 + i * 13, 9));
      const mapTop = m + 36 + steps.length * 13 + 16;
      const avail = { w: pw - 2 * m, h: ph - mapTop - m - 110 };
      const s = Math.min(avail.w / Math.max(W, (t.cols - 1) * t.stepX + t.aw), avail.h / Math.max(H, (t.rows - 1) * t.stepY + t.ah));
      pg.save().stroke([0.1, 0.1, 0.1]).lineWidth(0.8).path(G.toPage(g, g.shapes.cut), k * s, m, mapTop, G).doStroke().restore();
      for (let r = 0; r < t.rows; r++) for (let c = 0; c < t.cols; c++) {
        const x = m + c * t.stepX * s, y = mapTop + r * t.stepY * s;
        pg.save().stroke([0.12, 0.36, 0.3]).lineWidth(0.6).dash([3, 2]).rect(x, y, t.aw * s, t.ah * s).doStroke().restore();
        pg.fill([0.12, 0.36, 0.3]).text(label(r, c), x + 4, y + 12, 9, { bold: true });
      }
      const mapBottom = mapTop + Math.max(H, (t.rows - 1) * t.stepY + t.ah) * s;
      pdfInfo(pg, m, Math.min(ph - m - 80, mapBottom + 24), pw - 2 * m, `${t.count} ${PAPERS[paperKey].label} sheet${t.count > 1 ? 's' : ''}, ${overlapIn} in overlap`);
    }
    // Sheets
    for (let r = 0; r < t.rows; r++) for (let c = 0; c < t.cols; c++) {
      const pg = pdf.addPage(t.pw, t.ph);
      const tx = m - c * t.stepX, ty = m - r * t.stepY; // template origin on this page
      pg.save().rect(m, m, t.aw, t.ah).clip();
      pdfTemplate(pg, tx, ty, k, { image: img, labels: S.labels && !img });
      // Registration marks in every overlap strip (they print on both neighbours).
      pg.stroke([0, 0, 0]).lineWidth(0.4);
      const marks = [];
      for (let cc = 1; cc < t.cols; cc++) for (let rr = 0; rr < t.rows; rr++) { const xm = cc * t.stepX + o / 2; [0.3, 0.7].forEach(f => marks.push([xm, rr * t.stepY + t.ah * f])); }
      for (let rr = 1; rr < t.rows; rr++) for (let cc = 0; cc < t.cols; cc++) { const ym = rr * t.stepY + o / 2; [0.3, 0.7].forEach(f => marks.push([cc * t.stepX + t.aw * f, ym])); }
      for (const [mx, my] of marks) {
        const x = tx + mx, y = ty + my;
        if (x < m - 10 || x > m + t.aw + 10 || y < m - 10 || y > m + t.ah + 10) continue;
        pg.circle(x, y, 5).doStroke().moveTo(x - 9, y).lineTo(x + 9, y).moveTo(x, y - 9).lineTo(x, y + 9).doStroke();
      }
      pg.restore();
      // Sheet border and overlap strips.
      pg.save().stroke([0.6, 0.6, 0.6]).lineWidth(0.5).rect(m, m, t.aw, t.ah).doStroke();
      pg.fill([0.5, 0.5, 0.5]);
      if (c < t.cols - 1) pg.save().stroke([0.75, 0.75, 0.75]).dash([2, 2]).moveTo(m + t.aw - o, m).lineTo(m + t.aw - o, m + t.ah).doStroke().restore();
      if (r < t.rows - 1) pg.save().stroke([0.75, 0.75, 0.75]).dash([2, 2]).moveTo(m, m + t.ah - o).lineTo(m + t.aw, m + t.ah - o).doStroke().restore();
      pg.restore();
      pg.fill([0.12, 0.36, 0.3]).text(label(r, c), m, m - 10, 11, { bold: true });
      pg.fill([0.4, 0.4, 0.4]).text(`Row ${String.fromCharCode(65 + r)} of ${t.rows}, column ${c + 1} of ${t.cols}. Print at 100%.`, m + 26, m - 10, 7.5);
      if (c < t.cols - 1) pg.text(`right: ${label(r, c + 1)}`, m + t.aw, m - 10, 8, { align: 'right' });
      if (r < t.rows - 1) pg.text(`below: ${label(r + 1, c)}`, m + t.aw, m + t.ah + 16, 8, { align: 'right' });
    }
    PeakUI.download(new Blob([pdf.build()], { type: 'application/pdf' }), `${baseName()}-tiled-${paperKey}.pdf`);
    toast(`Tiled PDF saved: ${t.count} sheet${t.count > 1 ? 's' : ''} + map.`);
  }

  // Batch warp → ZIP
  let batchDlg = null, batchFiles = [];
  function loadScript(src) {
    return new Promise((res, rej) => { const s = document.createElement('script'); s.src = src; s.onload = res; s.onerror = () => rej(new Error('Couldn’t load the ZIP library.')); document.head.appendChild(s); });
  }
  function openBatch() {
    if (!batchDlg) {
      batchDlg = makeDialog('st-dialog-wide', `
        <form method="dialog">
          <div class="st-dlg-head"><h2>Bend a batch of designs <span class="pro-tag">Pro</span></h2><button class="st-x" value="close" aria-label="Close">×</button></div>
          <p class="small muted" style="margin:0">Every image is bent to the current template with the current settings (fit, mirror, bleed, cut line) and saved as a 300 dpi PNG inside one ZIP.</p>
          <div class="drop" data-b="drop" tabindex="0" role="button" aria-label="Choose or drop design images"><input type="file" accept="image/png,image/jpeg,image/webp" multiple tabindex="-1" aria-hidden="true"><strong>Choose or drop images</strong><span class="hint">PNG, JPG or WebP. Nothing is uploaded.</span></div>
          <ol class="st-batch-list" data-b="list"></ol>
          <p class="small" data-b="status" role="status"></p>
          <div class="st-dlg-actions"><button class="btn btn-primary" data-b="go" disabled>Bend all and download ZIP <span class="pro-tag">Pro</span></button><button class="btn" value="close">Close</button></div>
        </form>`);
      const q = s => batchDlg.querySelector(`[data-b="${s}"]`);
      PeakUI.drop(q('drop'), files => {
        batchFiles = batchFiles.concat(files.filter(f => /^image\/(png|jpeg|webp)$/.test(f.type))).slice(0, 200);
        q('list').innerHTML = batchFiles.map(f => `<li>${esc(f.name)} <span class="muted">${Math.round(f.size / 1024)} KB</span></li>`).join('');
        q('go').disabled = !batchFiles.length;
        q('status').textContent = `${batchFiles.length} image${batchFiles.length === 1 ? '' : 's'} ready.`;
      });
      q('go').addEventListener('click', e => {
        e.preventDefault();
        if (!needPro('Batch warping to a ZIP is part of Pro ($19, one-time).')) return;
        busy(q('go'), () => runBatch(q('status')));
      });
    }
    batchDlg.showModal();
  }
  async function runBatch(statusLine) {
    if (!window.JSZip) await loadScript(BASE + 'vendor/jszip.min.js');
    const zip = new window.JSZip();
    const w = makeWorker();
    const used = new Set();
    try {
      for (let i = 0; i < batchFiles.length; i++) {
        const f = batchFiles[i];
        statusLine.textContent = `Bending ${i + 1} of ${batchFiles.length}: ${f.name}`;
        let bmp;
        try { bmp = await decode(f); } catch (e) { statusLine.textContent = `Skipped ${f.name}: ${e.message}`; continue; }
        const { canvas, r } = await renderDesign(bmp, null, w);
        const blob = await PeakPNG.withDpi(await canvasBlob(canvas), r.dpi);
        let name = f.name.replace(/\.[^.]+$/, '') + '-warped.png';
        while (used.has(name)) name = name.replace(/(-\d+)?\.png$/, m => `-${(parseInt((m.match(/-(\d+)/) || [0, 1])[1], 10) + 1)}.png`);
        used.add(name);
        zip.file(name, blob);
        if (bmp.close) bmp.close();
      }
      zip.file('README.txt', `Bent with peakappsstudio.com/tumbler-template/\r\n${describe()}\r\nFit: ${S.fit}\r\nMirrored: ${S.mirror ? 'yes' : 'no'}\r\nCut line drawn: ${S.cutOnDesign ? 'yes' : 'no'}\r\nPrint at 100% (Actual size).\r\n`);
      statusLine.textContent = 'Packing the ZIP…';
      const out = await zip.generateAsync({ type: 'blob', compression: 'STORE' });
      PeakUI.download(out, `${baseName()}-designs.zip`);
      statusLine.textContent = `Done: ${batchFiles.length} design${batchFiles.length === 1 ? '' : 's'} in the ZIP.`;
    } finally { w && w.terminate(); }
  }

  // Preset library (sourced sizes) + saved blanks
  let presetDlg = null;
  function openPresets() {
    if (!needPro('Pro fills in published blank sizes with one click and saves your own measured blanks. The same published sizes are listed free on the size chart.')) return;
    const list = window.TumblerPresets || [];
    if (!presetDlg) {
      presetDlg = makeDialog('st-dialog-wide', `
        <form method="dialog">
          <div class="st-dlg-head"><h2>Blank sizes <span class="pro-tag">Pro</span></h2><button class="st-x" value="close" aria-label="Close">×</button></div>
          <p class="small muted" style="margin:0">Published sizes from manufacturer and blank-supplier pages. Brands differ and products change, so measure your own blank before printing a batch.</p>
          <div data-p="mine"></div>
          <div class="st-save-blank"><label class="field"><span>Save the current measurements as</span><input class="input" data-p="name" placeholder="e.g. 20 oz tapered from my supplier" maxlength="60"></label><button class="btn btn-sm" data-p="save">Save blank</button></div>
          <div data-p="lib"></div>
          <div class="st-dlg-actions"><a class="btn btn-sm" href="/tumbler-template/sizes/">Open the size chart</a><button class="btn" value="close">Close</button></div>
        </form>`);
      presetDlg.querySelector('[data-p="save"]').addEventListener('click', e => {
        e.preventDefault();
        const name = presetDlg.querySelector('[data-p="name"]').value.trim();
        if (!name) return toast('Give the blank a name first.');
        const mine = store.get(BLANKS_KEY) || [];
        mine.unshift({ name, top: S.top, bottom: S.bottom, height: S.height, heightMode: S.heightMode, measure: S.measure, unit: S.unit, gap: S.gap });
        store.set(BLANKS_KEY, mine.slice(0, 50));
        presetDlg.querySelector('[data-p="name"]').value = '';
        renderPresetLists(list);
        toast('Saved to My blanks on this browser.');
      });
      presetDlg.addEventListener('click', e => {
        const b = e.target.closest('[data-use],[data-del]');
        if (!b) return;
        e.preventDefault();
        if (b.dataset.del != null) { const mine = store.get(BLANKS_KEY) || []; mine.splice(+b.dataset.del, 1); store.set(BLANKS_KEY, mine); renderPresetLists(list); return; }
        const [kind, i] = b.dataset.use.split(':');
        applyPreset(kind === 'mine' ? (store.get(BLANKS_KEY) || [])[+i] : list[+i]);
        presetDlg.close();
      });
    }
    renderPresetLists(list);
    presetDlg.showModal();
  }
  function renderPresetLists(list) {
    const mine = store.get(BLANKS_KEY) || [];
    presetDlg.querySelector('[data-p="mine"]').innerHTML = mine.length
      ? `<h3 class="st-dlg-sub">My blanks</h3><ul class="st-presets">${mine.map((m, i) => `<li><button class="st-preset-btn" data-use="mine:${i}"><strong>${esc(m.name)}</strong><span class="mono">${esc(m.top)} / ${esc(m.bottom)} / ${esc(m.height)} ${esc(m.unit)}</span></button><button class="st-del" data-del="${i}" aria-label="Delete ${esc(m.name)}">×</button></li>`).join('')}</ul>` : '';
    const groups = {};
    list.forEach((p, i) => { (groups[p.group] = groups[p.group] || []).push([p, i]); });
    presetDlg.querySelector('[data-p="lib"]').innerHTML = Object.entries(groups).map(([grp, items]) =>
      `<h3 class="st-dlg-sub">${esc(grp)}</h3><ul class="st-presets">${items.map(([p, i]) =>
        `<li><button class="st-preset-btn" data-use="lib:${i}"><strong>${esc(p.name)}</strong><span class="mono">${p.kind === 'wrap' ? `${p.top} × ${p.height} ${p.unit} wrap` : `Ø ${p.top} to ${p.bottom}, ${p.height} ${p.unit} tall`}</span><span class="small muted">${esc(p.source.label)}${p.note ? ' · ' + esc(p.note) : ''}</span></button></li>`).join('')}</ul>`).join('');
  }
  function applyPreset(p) {
    if (!p) return;
    const u = p.unit || 'in';
    if (u !== S.unit) setSegOnly('unit', u);
    S.unit = u;
    S.top = String(p.top); S.bottom = String(p.bottom); S.height = String(p.height);
    S.heightMode = p.heightMode || 'vertical'; S.measure = p.measure || 'diameter';
    if (p.gap != null) S.gap = String(p.gap);
    for (const k of ['top', 'bottom', 'height', 'gap']) if (inputs[k]) inputs[k].value = S[k];
    setSeg('heightMode', S.heightMode); setSeg('measure', S.measure);
    syncLabels(); schedule();
    toast(`Filled in: ${p.name}. Check it against your own blank.`);
  }
  function setSegOnly(name, v) { setSeg(name, v); }

  // ---------- init ----------
  if (S.height === '' && inputs.height && /[?&](top|bottom)=/.test(location.search)) {
    inputs.height.placeholder = 'measure';
    setTimeout(() => inputs.height.focus({ preventScroll: true }), 300);
  }
  syncLabels();
  syncVisibility();
  setupLicense();
  update();
  // Refresh once fonts settle so labels measure correctly.
  if (document.fonts && document.fonts.ready) document.fonts.ready.then(() => draw());
  window.TumblerStudio = { get state() { return S; }, get geometry() { return g; } };
})();
