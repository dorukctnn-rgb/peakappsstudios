/* KDP coloring book interior maker: UI, preview and PDF export.
 * Rules and math: kdp.js (window.KDP). Cover widget: cover.js (window.KDPCover). pdf-lib loads only on export. */
(function () {
  'use strict';
  const K = window.KDP;
  const $ = id => document.getElementById(id);
  const SVGNS = 'http://www.w3.org/2000/svg';
  const U = 100;                                    // preview units per inch
  const PRO_KEYS = ['belongs', 'test', 'numbers'];
  const STORE = { last: 'kdp-interior:last', presets: 'kdp-interior:presets' };
  const store = {
    get(k, d) { try { const v = JSON.parse(localStorage.getItem(k) || 'null'); return v == null ? d : v; } catch (e) { return d; } },
    set(k, v) { try { localStorage.setItem(k, JSON.stringify(v)); } catch (e) { /* private mode */ } },
  };

  // ---------- State ----------
  const S = { trim: K.FREE_TRIM, ink: 'white', bleed: false, single: true, fit: 'fit', extra: 0.25, center: true, pad: true, belongs: false, test: false, numbers: false };
  const SETTING_KEYS = Object.keys(S);
  const view = { mode: matchMedia('(max-width: 640px)').matches ? 'page' : 'spread', idx: null };
  let art = [];                                      // { id, file, url, w, h, name }
  let isPro = false, L = null, seq = 0, busy = false;

  // ---------- Controls ----------
  const trimSel = $('trim'), inkSel = $('ink');
  trimSel.innerHTML = `<optgroup label="Free"><option value="${K.FREE_TRIM}">${K.trimLabel(K.FREE_TRIM)} (US letter)</option></optgroup>` +
    `<optgroup label="Pro">${K.TRIMS.filter(t => t.id !== K.FREE_TRIM).map(t => `<option value="${t.id}" data-pro>${K.trimLabel(t)}${t.note ? ' (' + t.note + ')' : ''}</option>`).join('')}</optgroup>`;
  inkSel.innerHTML = K.INK_ORDER.map(k => `<option value="${k}">${K.INKS[k].label}</option>`).join('');

  const segs = {};
  for (const [id, key, parse] of [['bleed', 'bleed', v => v === '1'], ['fit', 'fit', v => v]]) {
    segs[id] = $(id);
    PeakUI.seg(segs[id], v => { S[key] = parse(v); onSetting(key); });
  }
  PeakUI.seg($('view'), v => { view.mode = v; drawPreview(); });
  trimSel.addEventListener('change', () => { S.trim = trimSel.value; onSetting('trim'); });
  inkSel.addEventListener('change', () => { S.ink = inkSel.value; onSetting('ink'); });
  $('extra').addEventListener('change', e => { S.extra = Number(e.target.value); onSetting('extra'); });
  for (const [id, key] of [['single', 'single'], ['center', 'center'], ['pad', 'pad'], ['belongs', 'belongs'], ['testpage', 'test'], ['numbers', 'numbers']]) {
    $(id).addEventListener('change', e => { S[key] = e.target.checked; onSetting(key); });
  }

  function setSeg(root, value) { root.querySelectorAll('button').forEach(b => b.setAttribute('aria-pressed', String(b.dataset.value === String(value)))); }
  function syncControls() {
    trimSel.value = S.trim; inkSel.value = S.ink;
    setSeg(segs.bleed, S.bleed ? '1' : '0'); setSeg(segs.fit, S.fit);
    $('extra').value = String(S.extra);
    $('single').checked = S.single; $('center').checked = S.center; $('pad').checked = S.pad;
    $('belongs').checked = S.belongs; $('testpage').checked = S.test; $('numbers').checked = S.numbers;
    $('numbers').disabled = S.fit === 'fill';
    $('center').disabled = S.fit === 'fill'; $('extra').disabled = S.fit === 'fill';
    for (const o of inkSel.options) o.disabled = !K.pageRange(S.trim, o.value);
  }

  function onSetting(key) {
    if (key === 'fit' && S.fit === 'fill' && !S.bleed) { S.bleed = true; PeakUI.toast('Bleed is on: art that reaches the page edge needs it.'); }
    if (key === 'bleed' && !S.bleed && S.fit === 'fill') { S.fit = 'fit'; PeakUI.toast('Without bleed the art has to stay inside the margins.'); }
    if (key === 'trim' && !K.pageRange(S.trim, S.ink)) { S.ink = 'premium'; PeakUI.toast('Standard color isn’t offered for A4; switched to premium color.'); }
    if (key === 'belongs' || key === 'test') view.idx = 0;
    if (isPro) store.set(STORE.last, pick(S));
    render();
  }
  const pick = o => SETTING_KEYS.reduce((a, k) => (a[k] = o[k], a), {});
  function apply(v) {
    if (!v) return;
    for (const k of SETTING_KEYS) if (k in v && typeof v[k] === typeof S[k]) S[k] = v[k];
    if (!K.trim(S.trim)) S.trim = K.FREE_TRIM;
    if (!K.INKS[S.ink] || !K.pageRange(S.trim, S.ink)) S.ink = 'white';
  }

  // ---------- Files ----------
  const ACCEPT = /^image\/(png|jpeg|webp)$/;
  async function addFiles(files) {
    const ok = files.filter(f => ACCEPT.test(f.type));
    const skipped = files.length - ok.length;
    const added = [];
    for (const file of ok) {
      const url = URL.createObjectURL(file);
      try {
        const img = new Image(); img.src = url; await img.decode();
        added.push({ id: ++seq, file, url, thumb: await thumbnail(img), w: img.naturalWidth, h: img.naturalHeight, name: file.name });
      } catch (e) { URL.revokeObjectURL(url); }
    }
    added.sort((a, b) => a.name.localeCompare(b.name, undefined, { numeric: true, sensitivity: 'base' }));
    art = art.concat(added);
    if (added.length) {
      const first = art.length - added.length;
      view.idx = null; render();
      const p = L.pages.find(p => p.kind === 'art' && p.art === first); if (p) { view.idx = p.n - 1; drawPreview(); }
    }
    let msg = added.length ? `Added ${added.length} page${added.length === 1 ? '' : 's'}.` : 'No pages added.';
    if (skipped) msg += ` Skipped ${skipped} file${skipped === 1 ? '' : 's'} that aren’t PNG or JPG.`;
    if (!isPro && art.length > K.FREE_ART_LIMIT && art.length - added.length <= K.FREE_ART_LIMIT) msg += ` Free exports include ${K.FREE_ART_LIMIT}; you can still preview them all.`;
    PeakUI.toast(msg);
  }
  // Small JPEG thumbnails for the page strip, so a long book doesn't keep every full-size image decoded.
  async function thumbnail(img) {
    try {
      const w = 180, h = Math.max(1, Math.round(img.naturalHeight * w / img.naturalWidth));
      const cv = document.createElement('canvas'); cv.width = w; cv.height = h;
      const ctx = cv.getContext('2d'); ctx.fillStyle = '#fff'; ctx.fillRect(0, 0, w, h);
      ctx.imageSmoothingQuality = 'high'; ctx.drawImage(img, 0, 0, w, h);
      const blob = await new Promise(r => cv.toBlob(r, 'image/jpeg', 0.85));
      return blob ? URL.createObjectURL(blob) : null;
    } catch (e) { return null; }
  }
  PeakUI.drop($('drop'), addFiles);
  // Sample pages, drawn by sample.js, for a visitor who has no artwork with them yet.
  $('sample').addEventListener('click', async (e) => {
    const b = e.currentTarget;
    if (!window.KDPSample) { PeakUI.toast('The sample pages couldn’t be drawn in this browser.'); return; }
    b.disabled = true;
    try { await addFiles(await window.KDPSample.pages()); }
    catch (err) { PeakUI.toast('The sample pages couldn’t be drawn in this browser.'); }
    finally { b.disabled = false; }
  });
  // Files dropped anywhere on the tool also count.
  const tool = $('maker');
  const hasFiles = e => e.dataTransfer && [...e.dataTransfer.types].includes('Files');
  tool.addEventListener('dragover', e => { if (hasFiles(e)) e.preventDefault(); });
  tool.addEventListener('drop', e => { if (hasFiles(e) && !e.target.closest('#drop')) { e.preventDefault(); addFiles([...e.dataTransfer.files]); } });

  function move(from, to) {
    if (to < 0 || to >= art.length || from === to) return;
    const [it] = art.splice(from, 1); art.splice(to, 0, it); render();
  }
  function remove(i) {
    const [it] = art.splice(i, 1); if (it) { URL.revokeObjectURL(it.url); if (it.thumb) URL.revokeObjectURL(it.thumb); }
    render();
  }

  // ---------- Layout helpers ----------
  function currentLayout() {
    const sample = art.length === 0;
    return Object.assign(K.layout({ art: sample ? 3 : art.length, singleSided: S.single, belongsTo: S.belongs, testPage: S.test, ink: S.ink, trimId: S.trim, padToMin: S.pad && !sample }), { sample });
  }
  const marginPages = () => (L.sample ? K.MIN_PAGES : Math.max(L.total, K.MIN_PAGES));
  function boxFor(p) {
    return K.artBox(S.trim, { bleed: S.bleed, pages: marginPages(), side: p.side, center: S.center, extra: S.fit === 'fill' ? 0 : S.extra, numbers: S.numbers && S.fit === 'fit' });
  }
  function frontBox(p) { return K.artBox(S.trim, { bleed: S.bleed, pages: marginPages(), side: p.side, center: true, extra: Math.max(S.extra, 0.125) }); }
  function placement(p) {
    const a = art[p.art];
    if (S.fit === 'fill') { const ps = K.pageSize(S.trim, S.bleed); return K.placeImage(a.w, a.h, { x: 0, y: 0, w: ps.w, h: ps.h }, 'fill'); }
    return K.placeImage(a.w, a.h, boxFor(p), 'fit');
  }
  function proInUse() {
    const list = [];
    if (S.trim !== K.FREE_TRIM) list.push(`${K.trimLabel(S.trim)} trim`);
    if (art.length > K.FREE_ART_LIMIT) list.push(`${art.length} coloring pages (free: ${K.FREE_ART_LIMIT})`);
    if (S.belongs) list.push('“This book belongs to” page');
    if (S.test) list.push('test-colors page');
    if (S.numbers && S.fit === 'fit') list.push('page numbers');
    return list;
  }

  // ---------- Render ----------
  function render() {
    L = currentLayout();
    syncControls();
    // Sample: open on a blank back + design spread (or the design itself in page view).
    if (view.idx == null || view.idx >= L.total) view.idx = L.sample && S.single ? (view.mode === 'page' ? 2 : 1) : 0;
    drawStrip();
    drawStats();
    drawPreview();
    if (cover && !L.sample) cover.sync({ trim: S.trim, ink: S.ink, pages: L.total });
  }

  function drawStats() {
    const ps = K.pageSize(S.trim, S.bleed), pages = marginPages(), g = K.gutter(pages);
    const cost = L.sample ? null : K.printCostUSD(S.trim, L.total, S.ink);
    const spine = K.spineWidth(Math.max(L.total, 24), S.ink);
    const designs = art.length;
    const parts = [];
    if (designs) parts.push(`${designs} design${designs === 1 ? '' : 's'}`);
    if (L.front) parts.push(`${L.front} front`);
    if (L.blanks) parts.push(`${L.blanks} blank`);
    const stats = [
      ['Pages', L.sample ? '0' : String(L.total), L.sample ? 'add pages to count' : parts.join(', ')],
      ['Page size', `${K.fmt(ps.w)} × ${K.fmt(ps.h)} in`, S.bleed ? `${K.trimLabel(S.trim)} + bleed` : 'trim size, no bleed'],
      ['Gutter', `${K.fmt(g)} in`, `${K.gutterBand(pages)} pages`],
      ['Outer margins', `${K.fmt(K.outsideMargin(S.bleed))} in`, S.bleed ? 'top, bottom, outside (from bleed edge)' : 'top, bottom, outside'],
      ['Spine', L.sample ? 'n/a' : `${K.fmt(spine)} in`, K.INKS[S.ink].short],
      ['Print cost', cost == null ? 'n/a' : `$${cost.toFixed(2)}`, cost == null && !L.sample ? 'needs 24+ pages' : 'Amazon.com, KDP rates'],
    ];
    $('stats').innerHTML = stats.map(([a, b, c]) => `<div><dt>${a}</dt><dd>${b}<small>${c}</small></dd></div>`).join('');

    // Notes
    const notes = [];
    if (L.sample) notes.push(['info', 'This is a sample. Add your coloring pages to see your page count, margins and print cost.']);
    for (const pr of L.problems) {
      if (L.sample) break;
      if (pr.code === 'min') {
        const more = K.artNeededForMin({ art: art.length, singleSided: S.single, belongsTo: S.belongs, testPage: S.test, ink: S.ink, trimId: S.trim, padToMin: S.pad });
        notes.push(['warn', `${pr.msg} ${more ? `Add ${more} more coloring page${more === 1 ? '' : 's'}` : 'Add more coloring pages'}${S.pad ? '' : ' or turn on padding'}.`]);
      } else notes.push(['warn', pr.msg]);
    }
    if (L.padded) notes.push(['info', `${L.padded} blank page${L.padded === 1 ? '' : 's'} added at the end to reach KDP’s ${L.min}-page minimum (KDP allows up to ${K.MAX_BLANK_RUN_END} in a row at the end).`]);
    if (!L.sample) {
      const low = [], high = [];
      for (const p of L.pages) if (p.kind === 'art') { const d = placement(p).dpi; if (d < K.MIN_DPI) low.push(`p. ${p.n} (${d} dpi)`); else if (d > K.MAX_DPI) high.push(p.n); }
      if (low.length) notes.push(['warn', `${low.length} page${low.length === 1 ? '' : 's'} would print below 300 dpi: ${low.slice(0, 6).join(', ')}${low.length > 6 ? '…' : ''}. Use larger images${S.fit === 'fit' ? ' or more white space' : ''}.`]);
      else if (art.length) notes.push(['ok', `Every page prints at ${K.MIN_DPI} dpi or more.`]);
      if (high.length) notes.push(['info', `${high.length} page${high.length === 1 ? '' : 's'} above 600 dpi will be scaled to 600 dpi, KDP’s recommended maximum, to keep the file small.`]);
    }
    if (S.fit === 'fill') notes.push(['info', 'Fill to bleed: 0.125 in is trimmed from the top, bottom and outside edge, and the gutter side is hidden in the binding. Keep important lines inside the dashed line.']);
    const pro = proInUse();
    if (pro.length && !isPro) notes.push(['info', `Pro in use: ${pro.join(', ')}. The preview is free; exporting with these needs Pro.`]);
    $('notes').innerHTML = notes.map(([k, t]) => `<li class="is-${k}">${t}</li>`).join('');
    $('export-note').textContent = isPro ? 'Pro is active on this browser.' : pro.length ? `Needs Pro: ${pro.join(', ')}.` : `Free: up to ${K.FREE_ART_LIMIT} coloring pages at ${K.trimLabel(K.FREE_TRIM)}.`;
  }

  // ---------- Page strip ----------
  let dragFrom = null;
  function drawStrip() {
    const list = $('pages');
    const byArt = new Map(L.sample ? [] : L.pages.filter(p => p.kind === 'art').map(p => [p.art, p]));
    $('strip-hint').textContent = art.length ? `${art.length} page${art.length === 1 ? '' : 's'}. Drag or use the arrows to reorder.` : 'Your pages appear here. They are sorted by file name; drag to reorder.';
    const cur = L.pages[view.idx];
    list.innerHTML = art.map((a, i) => {
      const p = byArt.get(i), d = p ? placement(p).dpi : 0;
      const locked = !isPro && i >= K.FREE_ART_LIMIT;
      return `<li class="kdp-card${locked ? ' is-locked' : ''}${cur && cur.kind === 'art' && cur.art === i ? ' is-current' : ''}" draggable="true" data-i="${i}" tabindex="0" aria-label="Coloring page ${i + 1}, ${escapeHtml(a.name)}, book page ${p ? p.n : ''}, ${d} dpi">
        <span class="thumb"><img src="${a.thumb || a.url}" alt="" loading="lazy" decoding="async"></span>
        <span class="num">${i + 1}</span>
        <span class="over">
          <button type="button" data-act="left" aria-label="Move earlier" ${i === 0 ? 'disabled' : ''}>‹</button>
          <button type="button" data-act="right" aria-label="Move later" ${i === art.length - 1 ? 'disabled' : ''}>›</button>
          <button type="button" data-act="remove" aria-label="Remove page">×</button>
        </span>
        <span class="meta"><span>p. ${p ? p.n : '–'}</span><span class="${d < K.MIN_DPI ? 'low' : ''}">${d} dpi</span></span>
      </li>`;
    }).join('');
  }
  const escapeHtml = s => s.replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
  const pagesEl = $('pages');
  pagesEl.addEventListener('click', e => {
    const card = e.target.closest('.kdp-card'); if (!card) return;
    const i = Number(card.dataset.i), act = e.target.closest('button[data-act]');
    if (act) {
      if (act.dataset.act === 'left') move(i, i - 1);
      else if (act.dataset.act === 'right') move(i, i + 1);
      else remove(i);
      const next = pagesEl.querySelector(`[data-i="${Math.min(act.dataset.act === 'left' ? i - 1 : act.dataset.act === 'right' ? i + 1 : i, art.length - 1)}"]`);
      if (next) next.focus();
      return;
    }
    const p = L.pages.find(p => p.kind === 'art' && p.art === i); if (p) { view.idx = p.n - 1; drawPreview(); drawStrip(); }
  });
  pagesEl.addEventListener('keydown', e => {
    const card = e.target.closest('.kdp-card'); if (!card || e.target !== card) return;
    const i = Number(card.dataset.i);
    if (e.key === 'Delete' || e.key === 'Backspace') { e.preventDefault(); remove(i); }
    else if (e.altKey && (e.key === 'ArrowLeft' || e.key === 'ArrowRight')) { e.preventDefault(); const j = i + (e.key === 'ArrowLeft' ? -1 : 1); move(i, j); const n = pagesEl.querySelector(`[data-i="${j}"]`); if (n) n.focus(); }
    else if (e.key === 'Enter') card.click();
  });
  pagesEl.addEventListener('dragstart', e => {
    const card = e.target.closest('.kdp-card'); if (!card) return;
    dragFrom = Number(card.dataset.i); card.classList.add('is-dragging');
    e.dataTransfer.effectAllowed = 'move'; e.dataTransfer.setData('text/x-kdp-page', String(dragFrom));
  });
  pagesEl.addEventListener('dragover', e => {
    if (dragFrom == null) return;
    const card = e.target.closest('.kdp-card'); e.preventDefault();
    pagesEl.querySelectorAll('.is-target').forEach(n => n !== card && n.classList.remove('is-target'));
    if (card && Number(card.dataset.i) !== dragFrom) card.classList.add('is-target');
  });
  pagesEl.addEventListener('drop', e => {
    if (dragFrom == null) return;
    e.preventDefault(); e.stopPropagation();
    const card = e.target.closest('.kdp-card');
    const to = card ? Number(card.dataset.i) : art.length - 1;
    const from = dragFrom; dragFrom = null; move(from, to);
  });
  pagesEl.addEventListener('dragend', () => { dragFrom = null; pagesEl.querySelectorAll('.is-dragging,.is-target').forEach(n => n.classList.remove('is-dragging', 'is-target')); });

  // ---------- Preview ----------
  const canvasHost = $('canvas');
  function el(name, attrs, parent) {
    const n = document.createElementNS(SVGNS, name);
    for (const k in attrs) if (attrs[k] != null) n.setAttribute(k, attrs[k]);
    if (parent) parent.appendChild(n);
    return n;
  }
  function spreads() {
    const out = [[null, L.pages[0]]];
    for (let i = 1; i < L.total; i += 2) out.push([L.pages[i], L.pages[i + 1] || null]);
    return out;
  }
  function currentSpread() { return view.idx === 0 ? 0 : Math.ceil(view.idx / 2); }

  function drawPreview() {
    if (!L) return;
    const ps = K.pageSize(S.trim, S.bleed);
    const sp = spreads();
    let pagesToDraw, label;
    if (view.mode === 'spread') {
      const si = Math.min(currentSpread(), sp.length - 1);
      pagesToDraw = sp[si];
      const ns = pagesToDraw.filter(Boolean).map(p => p.n);
      label = L.sample ? `Sample spread, ${ns.length > 1 ? `pages ${ns[0]}–${ns[1]}` : `page ${ns[0]}`}` : `${ns.length > 1 ? `Pages ${ns[0]}–${ns[1]}` : `Page ${ns[0]}`} of ${L.total}`;
      $('prev').disabled = si === 0; $('next').disabled = si >= sp.length - 1;
    } else {
      const p = L.pages[Math.min(view.idx, L.total - 1)];
      pagesToDraw = [p];
      label = L.sample ? `Sample, page ${p.n} (${p.side})` : `Page ${p.n} of ${L.total}, ${p.side}-hand`;
      $('prev').disabled = view.idx <= 0; $('next').disabled = view.idx >= L.total - 1;
    }
    $('where').textContent = label;

    const single = view.mode === 'page';
    const n = single ? 1 : 2;
    const hostW = Math.max(canvasHost.clientWidth, 260);
    const annotPx = single ? 74 : 0;                 // room for dimension labels, in screen pixels
    // Same height cap as the CSS for .kdp-canvas svg, so label sizes match what is drawn.
    const maxH = window.innerWidth > 960 ? Math.min(660, Math.max(380, window.innerHeight - 460)) : Math.max(window.innerHeight * 0.58, 240);
    const pxPerIn = Math.min((hostW - 2 * annotPx) / (ps.w * n), (maxH - 30) / ps.h);
    if (!(pxPerIn > 0) || !canvasHost.isConnected) return;   // window not laid out yet (e.g. during a reload)
    const annot = annotPx / pxPerIn;
    const totalW = ps.w * n + annot * 2;
    const px = v => v / pxPerIn * U;
    const top = px(4), bottom = px(26);
    const svg = el('svg', { viewBox: `${-annot * U} ${-top} ${totalW * U} ${ps.h * U + top + bottom}`, 'aria-hidden': 'true' });
    const defs = el('defs', {}, svg);
    const pat = el('pattern', { id: 'pv-hatch', width: px(6), height: px(6), patternUnits: 'userSpaceOnUse', patternTransform: 'rotate(45)' }, defs);
    el('rect', { width: px(6), height: px(6), style: 'fill: color-mix(in oklab, var(--accent) 10%, transparent)' }, pat);
    el('line', { x1: 0, y1: 0, x2: 0, y2: px(6), 'stroke-width': px(2.2), style: 'stroke: color-mix(in oklab, var(--accent) 34%, transparent)' }, pat);
    const fold = el('linearGradient', { id: 'pv-fold', x1: 0, x2: 1, y1: 0, y2: 0 }, defs);
    el('stop', { offset: 0, 'stop-color': '#141518', 'stop-opacity': 0 }, fold);
    el('stop', { offset: 1, 'stop-color': '#141518', 'stop-opacity': 0.09 }, fold);

    pagesToDraw.forEach((p, i) => {
      const x0 = single ? 0 : i * ps.w * U;
      if (!p) {                                       // inside of the cover next to page 1
        if (!single) {
          const t = el('text', { x: x0 + ps.w * U / 2, y: ps.h * U / 2, 'font-size': px(11.5), 'text-anchor': 'middle', class: 'pv-label' }, svg);
          t.textContent = i === 0 ? 'Inside front cover' : 'Inside back cover';
          const t2 = el('text', { x: x0 + ps.w * U / 2, y: ps.h * U / 2 + px(17), 'font-size': px(11), 'text-anchor': 'middle', class: 'pv-label' }, svg);
          t2.textContent = i === 0 ? 'page 1 is the first right-hand page' : '';
        }
        return;
      }
      drawPage(svg, defs, p, x0, ps, px, single);
    });
    if (!single && pagesToDraw[0] && pagesToDraw[1]) {
      const sx = ps.w * U;
      el('rect', { x: sx - px(14), y: 0, width: px(14), height: ps.h * U, class: 'pv-fold' }, svg);
      el('rect', { x: sx, y: 0, width: px(14), height: ps.h * U, class: 'pv-fold', transform: `matrix(-1 0 0 1 ${2 * sx} 0)` }, svg);
      el('line', { x1: sx, y1: 0, x2: sx, y2: ps.h * U, class: 'pv-spine' }, svg);
    }
    canvasHost.replaceChildren(svg);
    canvasHost.setAttribute('aria-label', previewDescription(pagesToDraw, ps));
  }

  function previewDescription(list, ps) {
    const parts = list.filter(Boolean).map(p => `page ${p.n} (${p.side}): ${p.kind === 'art' ? 'coloring page' : p.kind === 'belongs' ? '“This book belongs to” page' : p.kind === 'test' ? 'test-colors page' : 'blank'}`);
    return `Preview, ${K.fmt(ps.w)} by ${K.fmt(ps.h)} inch pages, gutter ${K.fmt(K.gutter(marginPages()))} inch. ${parts.join('; ')}.`;
  }

  function drawPage(svg, defs, p, x0, ps, px, single) {
    const g = el('g', { transform: `translate(${x0} 0)` }, svg);
    const W = ps.w * U, H = ps.h * U;
    if (single || p.side === 'right' || p.n === 1) el('rect', { x: px(3), y: px(5), width: W, height: H, class: 'pv-shadow' }, g);
    else el('rect', { x: -px(3), y: px(5), width: W, height: H, class: 'pv-shadow' }, g);
    el('rect', { x: 0, y: 0, width: W, height: H, class: 'pv-page' }, g);
    const clipId = `pvclip-${p.n}-${x0 > 0 ? 'r' : 'l'}`;
    const clip = el('clipPath', { id: clipId }, defs); el('rect', { x: 0, y: 0, width: W, height: H }, clip);
    const content = el('g', { 'clip-path': `url(#${clipId})` }, g);

    if (p.kind === 'art') {
      if (L.sample) drawSample(content, boxFor(p), px);
      else {
        const pl = placement(p), a = art[p.art];
        el('image', { href: a.url, x: pl.rect.x * U, y: pl.rect.y * U, width: pl.rect.w * U, height: pl.rect.h * U, preserveAspectRatio: 'none' }, content);
        if (pl.dpi < K.MIN_DPI) {
          const b = boxFor(p);
          const t = el('text', { x: (b.x + b.w / 2) * U, y: (b.y + b.h) * U - px(8), 'font-size': px(11), 'text-anchor': 'middle', class: 'pv-blank pv-warn' }, content);
          t.textContent = `${pl.dpi} dpi, below 300`;
        }
      }
      if (S.numbers && S.fit === 'fit') {
        const ns = K.numberSlot(S.trim, { bleed: S.bleed, pages: marginPages(), side: p.side, center: S.center, extra: S.extra, numbers: true });
        const t = el('text', { x: ns.cx * U, y: ns.y * U, 'font-size': ns.size / 72 * U, 'text-anchor': 'middle', class: 'pv-sans' }, content);
        t.textContent = String(p.n);
      }
    } else if (p.kind === 'belongs' || p.kind === 'test') {
      drawShapes(content, K.frontMatter(p.kind, frontBox(p)), px);
    } else {
      const t = el('text', { x: W / 2, y: H / 2, 'font-size': px(11), 'text-anchor': 'middle', class: 'pv-blank' }, content);
      t.textContent = p.kind === 'pad' ? 'Blank (padding)' : 'Blank back';
    }

    // Overlays: bleed band, trim line, KDP safe area.
    const tr = K.trimRect(S.trim, S.bleed, p.side);
    if (S.bleed) el('path', { d: `M0 0H${W}V${H}H0Z M${tr.x * U} ${tr.y * U}V${(tr.y + tr.h) * U}H${(tr.x + tr.w) * U}V${tr.y * U}Z`, 'fill-rule': 'evenodd', class: 'pv-bleed' }, g);
    el('rect', { x: tr.x * U, y: tr.y * U, width: tr.w * U, height: tr.h * U, class: 'pv-trim' }, g);
    const sa = K.safeArea(S.trim, S.bleed, marginPages(), p.side);
    el('rect', { x: sa.x * U, y: sa.y * U, width: sa.w * U, height: sa.h * U, class: 'pv-safe' }, g);

    // Label under the page.
    const lab = el('text', { x: W / 2, y: H + px(17), 'font-size': px(11.5), 'text-anchor': 'middle', class: 'pv-label' + (p.kind === 'art' ? ' is-art' : '') }, g);
    lab.textContent = `p. ${p.n}, ${p.side}: ${p.kind === 'art' ? (L.sample ? 'sample' : `design ${p.art + 1}`) : p.kind === 'belongs' ? 'belongs-to page' : p.kind === 'test' ? 'test colors' : 'blank'}`;

    if (single) drawDims(g, p, ps, sa, px);
  }

  function drawDims(g, p, ps, sa, px) {
    const W = ps.w * U, H = ps.h * U, fs = px(11);
    const gut = K.gutter(marginPages()), out = K.outsideMargin(S.bleed);
    const y = H * 0.18;
    const insideLeft = p.side === 'right';
    // Horizontal margin arrows at y.
    const seg = (x1, x2, yy, text, anchorSide) => {
      el('line', { x1, y1: yy, x2, y2: yy, class: 'pv-dim' }, g);
      for (const x of [x1, x2]) el('line', { x1: x, y1: yy - px(4), x2: x, y2: yy + px(4), class: 'pv-dim' }, g);
      const tx = anchorSide === 'out-left' ? x1 - px(5) : x2 + px(5);
      const t = el('text', { x: tx, y: yy + px(4), 'font-size': fs, 'text-anchor': anchorSide === 'out-left' ? 'end' : 'start', class: 'pv-dimtext' }, g);
      t.textContent = text;
    };
    if (insideLeft) { seg(0, sa.x * U, y, 'gutter', 'out-left'); seg((sa.x + sa.w) * U, W, y, `${K.fmt(out)} in`, 'out-right'); }
    else { seg(0, sa.x * U, y, `${K.fmt(out)} in`, 'out-left'); seg((sa.x + sa.w) * U, W, y, 'gutter', 'out-right'); }
    // Second line under each label: the gutter value, and which edges the outer margin covers.
    const sub = (text, left) => { const t = el('text', { x: left ? -px(5) : W + px(5), y: y + px(18), 'font-size': px(10), 'text-anchor': left ? 'end' : 'start', class: 'pv-dimtext' }, g); t.textContent = text; };
    sub(`${K.fmt(gut)} in`, insideLeft); sub('top & bottom', !insideLeft);
    // Side labels outside the page.
    const side = el('text', { x: insideLeft ? -px(10) : W + px(10), y: H / 2, 'font-size': fs, 'text-anchor': 'middle', class: 'pv-label', transform: `rotate(-90 ${insideLeft ? -px(10) : W + px(10)} ${H / 2})` }, g);
    side.textContent = 'spine side';
  }

  function drawShapes(g, shapes, px) {
    for (const s of shapes) {
      if (s.type === 'path') el('path', { d: scalePath(s.d), class: 'pv-ink', 'stroke-width': Math.max(s.stroke / 72 * U / (px(1)), 0.6) }, g);
      else if (s.type === 'line') el('line', { x1: s.x1 * U, y1: s.y1 * U, x2: s.x2 * U, y2: s.y2 * U, class: 'pv-ink', 'stroke-width': Math.max(s.stroke / 72 * U / px(1), 0.6) }, g);
      else if (s.type === 'circle') el('circle', { cx: s.cx * U, cy: s.cy * U, r: s.r * U, class: 'pv-ink', 'stroke-width': Math.max(s.stroke / 72 * U / px(1), 0.6) }, g);
      else if (s.type === 'text') {
        const t = el('text', { x: s.cx * U, y: s.y * U, 'font-size': s.size / 72 * U, 'text-anchor': 'middle', class: s.font === 'serif' ? 'pv-serif' : 'pv-sans', 'font-style': s.font === 'serif' ? 'italic' : null }, g);
        t.textContent = s.text;
      }
    }
  }
  // Path strings from kdp.js are in inches; scale numbers (but not arc flags) to preview units.
  function scalePath(d) {
    return d.replace(/([MLHVAZ])([^MLHVAZ]*)/g, (m, cmd, args) => {
      const n = args.trim().split(/[\s,]+/).filter(Boolean).map(Number);
      if (cmd === 'A') return `A${n[0] * U} ${n[1] * U} ${n[2]} ${n[3]} ${n[4]} ${n[5] * U} ${n[6] * U}`;
      return cmd + n.map(v => v * U).join(' ');
    });
  }

  function drawSample(g, box, px) {
    // A simple mandala so the empty preview shows what a coloring page looks like.
    const cx = (box.x + box.w / 2) * U, cy = (box.y + box.h / 2) * U, R = Math.min(box.w, box.h) / 2 * U * 0.86;
    const sw = Math.max(px(1.3), 0.6);
    const m = el('g', { class: 'pv-ink', 'stroke-width': sw }, g);
    el('circle', { cx, cy, r: R }, m);
    el('circle', { cx, cy, r: R * 0.93 }, m);
    for (let i = 0; i < 16; i++) el('ellipse', { cx, cy: cy - R * 0.66, rx: R * 0.1, ry: R * 0.24, transform: `rotate(${i * 22.5} ${cx} ${cy})` }, m);
    for (let i = 0; i < 16; i++) el('circle', { cx, cy: cy - R * 0.86, r: R * 0.045, transform: `rotate(${i * 22.5 + 11.25} ${cx} ${cy})` }, m);
    for (let i = 0; i < 8; i++) el('ellipse', { cx, cy: cy - R * 0.32, rx: R * 0.13, ry: R * 0.2, transform: `rotate(${i * 45} ${cx} ${cy})` }, m);
    el('circle', { cx, cy, r: R * 0.42 }, m);
    el('circle', { cx, cy, r: R * 0.13 }, m);
    el('circle', { cx, cy, r: R * 0.06 }, m);
    const t = el('text', { x: cx, y: (box.y + box.h) * U - px(4), 'font-size': px(10), 'text-anchor': 'middle', class: 'pv-sample' }, g);
    t.textContent = 'SAMPLE PAGE';
  }

  $('prev').addEventListener('click', () => step(-1));
  $('next').addEventListener('click', () => step(1));
  function step(d) {
    if (view.mode === 'spread') { const si = Math.max(0, Math.min(currentSpread() + d, spreads().length - 1)); view.idx = si === 0 ? 0 : si * 2 - 1; }
    else view.idx = Math.max(0, Math.min(view.idx + d, L.total - 1));
    drawPreview(); drawStrip();
  }
  $('stage').addEventListener('keydown', e => {
    if (e.target.closest('button, select, input')) return;
    if (e.key === 'ArrowLeft') { e.preventDefault(); step(-1); } else if (e.key === 'ArrowRight') { e.preventDefault(); step(1); }
  });
  canvasHost.tabIndex = 0;
  if ('ResizeObserver' in window) { let w = 0; new ResizeObserver(en => { const nw = Math.round(en[0].contentRect.width); if (nw !== w) { w = nw; drawPreview(); } }).observe(canvasHost); }

  // ---------- PDF export ----------
  async function deflate(doc, bytes) {
    if ('CompressionStream' in window) {
      const stream = new Blob([bytes]).stream().pipeThrough(new CompressionStream('deflate'));
      return { bytes: new Uint8Array(await new Response(stream).arrayBuffer()), done: true };
    }
    return { bytes, done: false };
  }
  async function imageXObject(PDFLib, doc, pixels, w, h, gray) {
    const dict = { Type: 'XObject', Subtype: 'Image', Width: w, Height: h, ColorSpace: gray ? 'DeviceGray' : 'DeviceRGB', BitsPerComponent: 8 };
    const z = await deflate(doc, pixels);
    const stream = z.done ? PDFLib.PDFRawStream.of(doc.context.obj(Object.assign(dict, { Filter: 'FlateDecode' })), z.bytes) : doc.context.flateStream(pixels, dict);
    return doc.context.register(stream);
  }
  function drawXObject(PDFLib, page, ref, x, y, w, h) {
    const name = page.node.newXObject('Im', ref);
    page.pushOperators(PDFLib.pushGraphicsState(), PDFLib.concatTransformationMatrix(w, 0, 0, h, x, y), PDFLib.drawObject(name), PDFLib.popGraphicsState());
  }
  /** Read canvas pixels as gray (1 byte) or RGB (3 bytes) samples. One color space per file, as KDP recommends:
   *  gray for black-ink books, RGB for color books. */
  const grayBook = () => !K.INKS[S.ink].color;
  function samples(ctx, w, h, gray) {
    const d = ctx.getImageData(0, 0, w, h).data, n = w * h;
    if (gray) { const out = new Uint8Array(n); for (let i = 0, j = 0; j < n; i += 4, j++) out[j] = (d[i] * 299 + d[i + 1] * 587 + d[i + 2] * 114 + 500) / 1000; return { bytes: out, gray: true }; }
    const out = new Uint8Array(n * 3); for (let i = 0, j = 0; i < d.length; i += 4, j += 3) { out[j] = d[i]; out[j + 1] = d[i + 1]; out[j + 2] = d[i + 2]; }
    return { bytes: out, gray: false };
  }
  const MAX_PIXELS = 16e6;
  async function artImage(PDFLib, doc, p) {
    const a = art[p.art], pl = placement(p);
    const bmp = await createImageBitmap(a.file);
    const c = pl.crop, scale = Math.min(1, K.MAX_DPI / pl.dpi);
    let w = Math.max(1, Math.round(c.sw * scale)), h = Math.max(1, Math.round(c.sh * scale));
    if (w * h > MAX_PIXELS) { const f = Math.sqrt(MAX_PIXELS / (w * h)); w = Math.floor(w * f); h = Math.floor(h * f); }
    const cv = document.createElement('canvas'); cv.width = w; cv.height = h;
    const ctx = cv.getContext('2d', { willReadFrequently: true });
    ctx.fillStyle = '#fff'; ctx.fillRect(0, 0, w, h);            // flatten transparency onto white
    ctx.imageSmoothingEnabled = true; ctx.imageSmoothingQuality = 'high';
    ctx.drawImage(bmp, c.sx, c.sy, c.sw, c.sh, 0, 0, w, h);
    bmp.close && bmp.close();
    const px = samples(ctx, w, h, grayBook());
    cv.width = cv.height = 0;
    return { ref: await imageXObject(PDFLib, doc, px.bytes, w, h, px.gray), rect: pl.visible };
  }
  async function textImage(PDFLib, doc, text, font, sizePt) {
    const k = 600 / 72, cv = document.createElement('canvas'), ctx = cv.getContext('2d', { willReadFrequently: true });
    const css = font === 'serif' ? `italic 400 ${sizePt * k}px "Instrument Serif", Georgia, serif` : `400 ${sizePt * k}px Geist, Helvetica, Arial, sans-serif`;
    ctx.font = css;
    const m = ctx.measureText(text), pad = Math.ceil(sizePt * k * 0.1);
    const asc = Math.ceil(m.actualBoundingBoxAscent || sizePt * k * 0.8), desc = Math.ceil(m.actualBoundingBoxDescent || sizePt * k * 0.25);
    const w = Math.ceil(m.width) + pad * 2, h = asc + desc + pad * 2;
    cv.width = w; cv.height = h;
    ctx.fillStyle = '#fff'; ctx.fillRect(0, 0, w, h);
    ctx.font = css; ctx.fillStyle = '#000'; ctx.textBaseline = 'alphabetic'; ctx.fillText(text, pad, pad + asc);
    const px = samples(ctx, w, h, grayBook());
    return { ref: await imageXObject(PDFLib, doc, px.bytes, w, h, px.gray), w: w / k, h: h / k, baseline: (pad + asc) / k };
  }

  async function exportPDF() {
    if (busy) return;
    if (!art.length) { PeakUI.toast('Add at least one coloring page first.'); $('drop').focus(); return; }
    const pro = proInUse();
    if (pro.length && !PeakLicense.requirePro(`Your settings use Pro: ${pro.join(', ')}. Turn them off to export free, or buy Pro.`)) return;
    if (L.problems.some(p => p.code === 'ink-trim')) { PeakUI.toast(L.problems.find(p => p.code === 'ink-trim').msg); return; }
    busy = true;
    const btn = $('export'), bar = $('progress'), fill = bar.firstElementChild;
    btn.disabled = true; bar.hidden = false; fill.style.width = '2%';
    const label = btn.textContent; btn.textContent = 'Loading PDF engine…';
    try {
      const PDFLib = await K.loadPdfLib();
      if (document.fonts) await Promise.all([document.fonts.load('italic 40px "Instrument Serif"'), document.fonts.load('400 20px Geist')]).catch(() => {});
      const doc = await PDFLib.PDFDocument.create({ updateMetadata: false });
      const ps = K.pageSize(S.trim, S.bleed), P = 72, Wpt = ps.w * P, Hpt = ps.h * P;
      const black = grayBook() ? PDFLib.grayscale(0) : PDFLib.rgb(0, 0, 0);
      const numberCache = new Map();
      for (let i = 0; i < L.total; i++) {
        const p = L.pages[i];
        btn.textContent = `Placing page ${p.n} of ${L.total}…`; fill.style.width = `${Math.round(4 + 92 * i / L.total)}%`;
        const page = doc.addPage([Wpt, Hpt]);
        const tr = K.trimRect(S.trim, S.bleed, p.side);
        page.setTrimBox(tr.x * P, (ps.h - tr.y - tr.h) * P, tr.w * P, tr.h * P);
        page.setBleedBox(0, 0, Wpt, Hpt);
        if (p.kind === 'art') {
          const im = await artImage(PDFLib, doc, p);
          drawXObject(PDFLib, page, im.ref, im.rect.x * P, (ps.h - im.rect.y - im.rect.h) * P, im.rect.w * P, im.rect.h * P);
          if (S.numbers && S.fit === 'fit') {
            const ns = K.numberSlot(S.trim, { bleed: S.bleed, pages: marginPages(), side: p.side, center: S.center, extra: S.extra, numbers: true });
            const key = String(p.n);
            const t = numberCache.get(key) || await textImage(PDFLib, doc, key, 'sans', ns.size);
            numberCache.set(key, t);
            drawXObject(PDFLib, page, t.ref, ns.cx * P - t.w / 2, (ps.h - ns.y) * P - (t.h - t.baseline), t.w, t.h);
          }
        } else if (p.kind === 'belongs' || p.kind === 'test') {
          const box = frontBox(p);
          const boxPt = { x: box.x * P, y: box.y * P, w: box.w * P, h: box.h * P };
          for (const s of K.frontMatter(p.kind, boxPt, P)) {
            if (s.type === 'path') page.drawSvgPath(s.d, { x: 0, y: Hpt, borderColor: black, borderWidth: s.stroke });
            else if (s.type === 'line') page.drawLine({ start: { x: s.x1, y: Hpt - s.y1 }, end: { x: s.x2, y: Hpt - s.y2 }, thickness: s.stroke, color: black });
            else if (s.type === 'circle') page.drawCircle({ x: s.cx, y: Hpt - s.cy, size: s.r, borderColor: black, borderWidth: s.stroke });
            else if (s.type === 'text') {
              const t = await textImage(PDFLib, doc, s.text, s.font, s.size);
              drawXObject(PDFLib, page, t.ref, s.cx - t.w / 2, Hpt - s.y - (t.h - t.baseline), t.w, t.h);
            }
          }
        }
        if (i % 4 === 3) await new Promise(r => setTimeout(r));
      }
      btn.textContent = 'Saving PDF…'; fill.style.width = '97%';
      const bytes = await doc.save();
      const name = `coloring-book-interior-${S.trim}${S.bleed ? '-bleed' : ''}-${L.total}p.pdf`;
      PeakUI.download(new Blob([bytes], { type: 'application/pdf' }), name);
      fill.style.width = '100%';
      PeakUI.toast(`Saved ${name}: ${L.total} pages at ${K.fmt(ps.w)} × ${K.fmt(ps.h)} in.`);
      window.__kdpLastExport = { name, pages: L.total, size: [Wpt, Hpt], bytes: bytes.length };
    } catch (e) {
      console.error(e);
      PeakUI.toast(e.message || 'The PDF couldn’t be built. Try fewer or smaller images.');
    } finally {
      busy = false; btn.disabled = false; btn.textContent = label;
      setTimeout(() => { bar.hidden = true; fill.style.width = '0'; }, 1200);
    }
  }
  $('export').addEventListener('click', exportPDF);

  // ---------- Saved setups (Pro) ----------
  const presetSel = $('preset');
  function presets() { return store.get(STORE.presets, []); }
  function drawPresets() {
    const list = presets();
    presetSel.innerHTML = list.length ? `<option value="">Choose a saved setup…</option>` + list.map((p, i) => `<option value="${i}">${escapeHtml(p.name)}</option>`).join('') : '<option value="">No saved setups yet</option>';
    $('preset-del').disabled = !list.length;
  }
  function presetName() {
    return `${K.trimLabel(S.trim)}, ${S.bleed ? 'bleed' : 'no bleed'}, ${S.single ? 'blank backs' : 'double-sided'}, ${K.INKS[S.ink].short}${S.belongs || S.test || S.numbers ? ', extras' : ''}`;
  }
  $('preset-save').addEventListener('click', () => {
    if (!PeakLicense.requirePro('Saved setups are part of Pro: keep one setup per series and switch with one click.')) return;
    const list = presets().filter(p => p.name !== presetName());
    list.unshift({ name: presetName(), s: pick(S) });
    store.set(STORE.presets, list.slice(0, 20)); drawPresets(); presetSel.value = '0';
    PeakUI.toast('Setup saved in this browser.');
  });
  presetSel.addEventListener('change', () => {
    const p = presets()[Number(presetSel.value)]; if (!p || presetSel.value === '') return;
    if (!PeakLicense.requirePro('Saved setups are part of Pro.')) { presetSel.value = ''; return; }
    apply(p.s); onSetting('preset'); PeakUI.toast(`Loaded “${p.name}”.`);
  });
  $('preset-del').addEventListener('click', () => {
    const i = Number(presetSel.value); const list = presets();
    if (presetSel.value === '' || !list[i]) { PeakUI.toast('Choose a saved setup to delete.'); return; }
    list.splice(i, 1); store.set(STORE.presets, list); drawPresets();
  });

  // ---------- Init ----------
  let cover = null;
  const coverRoot = document.querySelector('[data-cover]');
  if (coverRoot && window.KDPCover) cover = KDPCover.setup(coverRoot, { trim: S.trim, ink: S.ink, pages: 48 });

  PeakLicense.setup(K.LICENSE);
  isPro = PeakLicense.isPro();
  if (isPro) apply(store.get(STORE.last, null));
  // Links from the guide pages can prefill the book: ?trim=6x9&bleed=1&ink=cream&single=0
  const q = new URLSearchParams(location.search);
  if (q.has('trim') && K.trim(q.get('trim'))) S.trim = q.get('trim');
  if (q.has('ink') && K.INKS[q.get('ink')] && K.pageRange(S.trim, q.get('ink'))) S.ink = q.get('ink');
  if (q.has('bleed')) S.bleed = q.get('bleed') === '1';
  if (q.has('single')) S.single = q.get('single') !== '0';
  if (S.fit === 'fill' && !S.bleed) S.fit = 'fit';
  setSeg($('view'), view.mode);
  drawPresets();
  render();
  PeakLicense.onChange(pro => { const was = isPro; isPro = pro; if (pro && !was) store.set(STORE.last, pick(S)); render(); });
  window.addEventListener('pagehide', () => art.forEach(a => { URL.revokeObjectURL(a.url); if (a.thumb) URL.revokeObjectURL(a.thumb); }));
})();
