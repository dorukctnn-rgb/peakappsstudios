/* Name Cut Files studio (Peak Apps Tools).
 * Needs /assets/site.js (PeakUI), /assets/license.js (PeakLicense), engine.js (NameCutEngine) and csv.js (NameCutCSV).
 * opentype.js and Clipper load after first paint; JSZip loads only for the ZIP download.
 */
(function () {
  'use strict';

  // ---- Owner: paste the Gumroad product id of "name-cut-files-pro" here once the product exists. ----
  // Gumroad needs product_id to verify keys of products created after January 2023; until it is set,
  // license.js falls back to the permalink below.
  const GUMROAD_PRODUCT_ID = 'cLk68S6IaHYri7B8aIuv6A==';
  const PRO_PERMALINK = 'name-cut-files-pro';
  const BUY_URL = 'https://dorukctn.gumroad.com/l/name-cut-files-pro';
  const FREE_LIMIT = 10;

  const E = window.NameCutEngine, X = window.NameCutCSV;
  const root = document.querySelector('[data-nc]');
  if (!root || !E || !X) return;
  const BASE = '/name-cut-files/';
  const PT = E.PT;
  const $ = (s, el = root) => el.querySelector(s);
  const $$ = (s, el = root) => [...el.querySelectorAll(s)];
  const toast = m => (window.PeakUI ? PeakUI.toast(m) : window.alert(m));
  const esc = s => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

  const FONTS = {
    pacifico: { label: 'Pacifico', file: 'fonts/pacifico.woff', script: true },
    dancing: { label: 'Dancing Script', file: 'fonts/dancing-script-variable.ttf', script: true, variation: { wght: 700 } },
    norican: { label: 'Norican', file: 'fonts/norican.woff', script: true },
    greatvibes: { label: 'Great Vibes', file: 'fonts/great-vibes.woff', script: true },
    baloo: { label: 'Baloo 2', file: 'fonts/baloo-2-extrabold.woff', script: false },
  };
  const MATS = {
    m12x12: { w: 12, h: 12, name: '12 × 12 in mat' },
    m12x24: { w: 12, h: 24, name: '12 × 24 in mat' },
    letter: { w: 8.5, h: 11, name: 'Letter sheet', sheet: true },
    a4: { w: 210 / 25.4, h: 297 / 25.4, name: 'A4 sheet', sheet: true },
    'ptc-letter': { w: 7.44, h: 9.94, name: 'Print Then Cut area (Letter)', sheet: true, pro: true },
    'ptc-a4': { w: 7.2, h: 10.62, name: 'Print Then Cut area (A4)', sheet: true, pro: true },
    'joy-s': { w: 4.5, h: 6.5, name: 'Cricut Joy mat', pro: true },
    'joy-l': { w: 4.5, h: 12, name: 'Cricut Joy mat', pro: true },
    'joy-xtra': { w: 8.5, h: 12, name: 'Cricut Joy Xtra mat', pro: true },
    portrait: { w: 8, h: 12, name: 'Silhouette Portrait mat', pro: true },
    'cameo-plus': { w: 15, h: 15, name: 'Cameo Plus mat', pro: true },
    'cameo-pro': { w: 24, h: 24, name: 'Cameo Pro mat', pro: true },
    custom: { custom: true, name: 'custom mat', pro: true },
  };
  const BAR = { thin: 0.045, medium: 0.065, bold: 0.09 };
  const LEN_KEYS = ['width', 'height', 'offset', 'margin', 'gap', 'customW', 'customH'];
  const LIMITS = { width: [0.2, 60], height: [0.1, 40], offset: [0.02, 1.5], margin: [0, 3], gap: [0, 3], customW: [1, 60], customH: [1, 60] };

  // ---------- state ----------
  const KEY = 'peak-namecut:v1';
  const store = {
    get(k) { try { return JSON.parse(localStorage.getItem(k) || 'null'); } catch (e) { return null; } },
    set(k, v) { try { localStorage.setItem(k, JSON.stringify(v)); } catch (e) { /* private mode */ } },
  };
  const DEF = {
    names: $('[data-list]').value, font: 'pacifico', unit: 'in', mode: 'width', width: '3', height: '1', tracking: 0, case: 'as',
    join: true, bar: false, barSize: 'medium', backing: false, offset: '0.15', mat: 'm12x12', customW: '19.5', customH: '11',
    margin: '0.25', gap: '0.25', ink: '#111111', mirror: false, col: 0,
  };
  const saved = store.get(KEY) || {};
  const S = Object.assign({}, DEF, pick(saved, Object.keys(DEF)), fromQuery());
  if (S.font === 'own' || !FONTS[S.font]) S.font = 'pacifico';
  S.backing = false; S.mirror = false;          // Pro switches start off until the licence is known
  const savedMat = S.mat;
  if (MATS[S.mat] && MATS[S.mat].pro) S.mat = 'm12x12';
  let page = 0;
  function pick(o, keys) { const r = {}; keys.forEach(k => { if (o[k] != null) r[k] = o[k]; }); return r; }
  function fromQuery() {
    const q = new URLSearchParams(location.search);
    const r = {};
    if (q.has('names')) r.names = q.get('names').split(/[,\n]/).map(s => s.trim()).filter(Boolean).join('\n');
    if (q.has('font') && FONTS[q.get('font')]) r.font = q.get('font');
    if (/^(width|height|fit)$/.test(q.get('mode') || '')) r.mode = q.get('mode');
    if (/^(in|cm)$/.test(q.get('unit') || '')) r.unit = q.get('unit');
    if (q.has('w')) r.width = q.get('w');
    if (q.has('h')) r.height = q.get('h');
    if (q.has('mat') && MATS[q.get('mat')] && !MATS[q.get('mat')].pro) r.mat = q.get('mat');
    if (q.has('bar')) r.bar = q.get('bar') === '1';
    if (q.has('join')) r.join = q.get('join') !== '0';
    if (q.has('case') && /^(as|title|upper)$/.test(q.get('case'))) r.case = q.get('case');
    if (q.has('gap')) r.gap = q.get('gap');
    return r;
  }
  const save = () => { const o = Object.assign({}, S); store.set(KEY, o); };

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
  const inch = k => E.toInches(parseLen(S[k]), S.unit);
  const fmt = (vIn, d) => { const v = E.fromInches(vIn, S.unit); return (d != null ? v.toFixed(d) : S.unit === 'cm' ? v.toFixed(1) : v.toFixed(2)); };
  const fmtShort = vIn => { const v = E.fromInches(vIn, S.unit); return String(+v.toFixed(S.unit === 'cm' ? 1 : 3)); };
  const isPro = () => !!(window.PeakLicense && PeakLicense.isPro());

  // ---------- elements ----------
  const list = $('[data-list]'), countEl = $('[data-count]'), colRow = $('[data-colrow]'), colSel = $('[data-col]');
  const matbox = $('[data-matbox]'), matSvg = $('[data-mat]'), statusEl = $('[data-status]');
  const pager = $('[data-pager]'), pgLabel = $('[data-pg-label]');
  const nameList = $('[data-namelist]'), limitEl = $('[data-limit]');
  const inputs = {}; $$('[data-in]').forEach(el => { inputs[el.dataset.in] = el; });
  const checks = {}; $$('[data-check]').forEach(el => { checks[el.dataset.check] = el; });
  const matSel = $('[data-mat-select]');
  const btn = a => $(`[data-action="${a}"]`);

  list.value = S.names;
  for (const [k, el] of Object.entries(inputs)) {
    el.value = S[k];
    el.addEventListener('input', () => {
      S[k] = el.type === 'range' ? +el.value : el.value;
      if (k === 'tracking') syncTrack();
      save();
      if (k === 'ink') return;
      schedule();
    });
  }
  for (const [k, el] of Object.entries(checks)) {
    el.checked = !!S[k];
    el.addEventListener('change', () => {
      if (el.checked && (k === 'backing' || k === 'mirror') && !isPro()) {
        el.checked = false;
        PeakLicense.requirePro(k === 'backing'
          ? 'The backing layer (an offset shape under every name) is part of Pro: $15 once, with unlimited names and Etsy CSV import.'
          : 'Mirrored PNGs for sublimation and printable iron-on are part of Pro: $15 once, with unlimited names and Etsy CSV import.');
        return;
      }
      S[k] = el.checked; save(); syncVisibility();
      if (k !== 'mirror') schedule();
    });
  }
  list.addEventListener('input', () => { S.names = list.value; save(); schedule(); });
  colSel.addEventListener('change', () => { S.col = +colSel.value; save(); schedule(); });
  matSel.value = S.mat;
  let lastMat = S.mat;
  matSel.addEventListener('change', () => {
    const m = MATS[matSel.value];
    if (m.pro && !isPro()) {
      matSel.value = lastMat;
      PeakLicense.requirePro('Cricut Joy, Joy Xtra, Print Then Cut areas, Silhouette Portrait and Cameo mats and custom sizes are part of Pro: $15 once.');
      return;
    }
    lastMat = S.mat = matSel.value; page = 0; save(); syncVisibility(); schedule();
  });

  // segmented controls
  $$('[data-seg]').forEach(segEl => {
    const name = segEl.dataset.seg;
    segEl.querySelectorAll('button[data-value]').forEach(b => b.setAttribute('aria-pressed', String(b.dataset.value === S[name])));
    PeakUI.seg(segEl, v => {
      if (name === 'unit') return setUnit(v);
      S[name] = v; save(); syncLabels(); syncVisibility(); schedule();
    });
  });
  const setSeg = (name, v) => $$(`[data-seg="${name}"] button[data-value]`).forEach(b => b.setAttribute('aria-pressed', String(b.dataset.value === v)));

  function setUnit(u) {
    if (u === S.unit) return;
    for (const k of LEN_KEYS) {
      const n = parseLen(S[k]);
      if (isFinite(n)) S[k] = String(+(u === 'cm' ? n * 2.54 : n / 2.54).toFixed(u === 'cm' ? 2 : 3));
      if (inputs[k]) inputs[k].value = S[k];
    }
    S.unit = u; save(); setSeg('unit', u); syncLabels(); schedule();
  }
  const HINTS = {
    width: 'Every name is exactly this wide. Short names come out taller.',
    height: 'Every name is exactly this tall, top of the tallest letter to the bottom of the lowest. Long names come out wider.',
    fit: 'Each name is as big as it can be inside this box, so long and short names both fit one blank.',
  };
  function syncLabels() {
    $$('[data-u]').forEach(el => { el.textContent = S.unit; });
    $('[data-mode-hint]').textContent = HINTS[S.mode];
  }
  function syncTrack() { $('[data-track-out]').textContent = (S.tracking > 0 ? '+' : '') + S.tracking; }
  function syncVisibility() {
    $$('[data-when]').forEach(el => { el.hidden = !el.dataset.when.split(' ').includes(S.mode); });
    $$('[data-when-bar]').forEach(el => { el.hidden = !S.bar; });
    $$('[data-when-backing]').forEach(el => { el.hidden = !S.backing; });
    $('[data-custom]').hidden = S.mat !== 'custom';
  }

  // ---------- fonts ----------
  const fontBtns = $$('[data-font]');
  const fontFile = $('[data-font-file]');
  let ownFont = null;
  function setFontUI() { fontBtns.forEach(b => { const on = b.dataset.font === S.font; b.setAttribute('aria-checked', String(on)); b.tabIndex = on ? 0 : -1; }); }
  function chooseFont(id) {
    if (id === 'own') { if (!ownFont) { fontFile.click(); return; } }
    const was = S.font;
    S.font = id;
    if (id !== 'own') save();
    // a script font usually wants the join step; block letters usually don't
    const script = id === 'own' ? true : FONTS[id].script;
    const wasScript = was === 'own' || !FONTS[was] ? true : FONTS[was].script;
    if (was !== id && wasScript !== script) { S.join = script; checks.join.checked = script; save(); }
    setFontUI(); schedule();
  }
  fontBtns.forEach(b => {
    b.addEventListener('click', () => chooseFont(b.dataset.font));
    b.addEventListener('keydown', e => {
      const i = fontBtns.indexOf(b);
      const next = { ArrowRight: 1, ArrowDown: 1, ArrowLeft: -1, ArrowUp: -1 }[e.key];
      if (!next) return;
      e.preventDefault();
      const nb = fontBtns[(i + next + fontBtns.length) % fontBtns.length];
      nb.focus(); if (nb.dataset.font !== 'own' || ownFont) chooseFont(nb.dataset.font);
    });
  });
  // clicking "Your font" again lets you pick another file
  $('[data-font="own"]').addEventListener('click', e => { if (S.font === 'own' && ownFont) { e.stopImmediatePropagation(); fontFile.click(); } }, true);
  fontFile.addEventListener('change', async () => {
    const f = fontFile.files && fontFile.files[0];
    fontFile.value = '';
    if (!f) return;
    try {
      const buf = await f.arrayBuffer();
      const sig = String.fromCharCode(...new Uint8Array(buf.slice(0, 4)));
      if (sig === 'wOF2') throw new Error('WOFF2 files can’t be read here. Use the TTF or OTF version of the font.');
      await core();
      const font = window.opentype.parse(buf);
      if (!font || !font.unitsPerEm) throw new Error('This file doesn’t look like a font.');
      let name = '';
      try { name = font.getEnglishName('fontFamily') || ''; } catch (e) { name = ''; }
      name = name || f.name.replace(/\.[^.]+$/, '');
      ownFont = { font, name, key: 'own:' + name + ':' + f.size + ':' + f.lastModified };
      $('[data-own-name]').textContent = name;
      $('[data-font-note]').textContent = `${name} is read by your browser and stays on this device. If you sell what you cut, check that its licence allows that.`;
      chooseFont('own');
    } catch (e) {
      toast(e.message && e.message.length < 140 ? e.message : 'That font could not be read. Try the TTF or OTF file.');
    }
  });

  // ---------- libraries ----------
  const libs = {};
  function loadScript(src) {
    return new Promise((res, rej) => {
      const s = document.createElement('script');
      s.src = src; s.async = true;
      s.onload = () => res(); s.onerror = () => rej(new Error('Could not load ' + src));
      document.head.appendChild(s);
    });
  }
  function core() {
    if (!libs.core) {
      libs.core = Promise.all([
        window.opentype ? 0 : loadScript(BASE + 'vendor/opentype.min.js'),
        window.ClipperLib ? 0 : loadScript(BASE + 'vendor/clipper.min.js'),
      ]).catch(e => { libs.core = null; throw e; });
    }
    return libs.core;
  }
  function zipLib() {
    if (!libs.zip) libs.zip = (window.JSZip ? Promise.resolve() : loadScript(BASE + 'vendor/jszip.min.js')).catch(e => { libs.zip = null; throw e; });
    return libs.zip;
  }
  const fontCache = {};
  function getFont(id) {
    if (id === 'own') return Promise.resolve(ownFont && ownFont.font);
    if (!fontCache[id]) {
      fontCache[id] = (async () => {
        await core();
        const r = await fetch(BASE + FONTS[id].file);
        if (!r.ok) throw new Error('font ' + r.status);
        const font = window.opentype.parse(await r.arrayBuffer());
        if (FONTS[id].variation && font.variation && font.tables.fvar) { try { font.variation.set(FONTS[id].variation); } catch (e) { /* default instance */ } }
        return font;
      })().catch(e => { delete fontCache[id]; throw e; });
    }
    return fontCache[id];
  }
  const fontKey = () => (S.font === 'own' ? (ownFont ? ownFont.key : 'own') : S.font);
  const fontLabel = () => (S.font === 'own' ? (ownFont ? ownFont.name : 'your font') : FONTS[S.font].label);

  // ---------- names ----------
  let importOrders = [];   // [{ text, order }] by line, from the last CSV import
  function readNames() {
    const lines = S.names.split(/\r\n|\r|\n/);
    const tabs = lines.some(l => l.includes('\t'));
    const out = [];
    let cols = 0;
    lines.forEach((l, i) => {
      let t = l;
      if (tabs) { const parts = l.split('\t'); cols = Math.max(cols, parts.length); t = parts[Math.min(S.col, parts.length - 1)] || ''; }
      t = t.replace(/\s+/g, ' ').trim();
      if (!t) return;
      const io = importOrders[i];
      out.push({ text: E.applyCase(t, S.case), raw: t, line: i, order: io && io.text === l.trim() ? io.order : '' });
    });
    return { names: out, tabs, cols };
  }
  function syncColumns(tabs, cols) {
    colRow.hidden = !tabs;
    if (!tabs) return;
    if (colSel.options.length !== cols) {
      const first = S.names.split(/\r?\n/).find(l => l.includes('\t')) || '';
      const parts = first.split('\t');
      colSel.innerHTML = Array.from({ length: cols }, (_, i) => `<option value="${i}">Column ${i + 1}${parts[i] ? ': ' + esc(parts[i].slice(0, 18)) : ''}</option>`).join('');
    }
    colSel.value = String(Math.min(S.col, cols - 1));
  }

  // ---------- options ----------
  function readOpts() {
    const bad = [];
    const val = k => {
      const v = inch(k), [lo, hi] = LIMITS[k];
      const ok = isFinite(v) && v >= lo - 1e-9 && v <= hi + 1e-9;
      if (inputs[k]) inputs[k].setAttribute('aria-invalid', String(!ok));
      if (!ok) bad.push(k);
      return v;
    };
    const o = { mode: S.mode, tracking: +S.tracking || 0, join: !!S.join };
    o.width = S.mode === 'height' ? (isFinite(inch('width')) ? inch('width') : 3) : val('width');
    o.height = S.mode === 'width' ? (isFinite(inch('height')) ? inch('height') : 1) : val('height');
    if (S.mode === 'height' && inputs.width) inputs.width.removeAttribute('aria-invalid');
    if (S.mode === 'width' && inputs.height) inputs.height.removeAttribute('aria-invalid');
    o.bar = S.bar ? { on: true, thickness: BAR[S.barSize] || BAR.medium } : null;
    o.barKey = S.bar ? S.barSize : 'off';
    o.backing = S.backing && isPro() ? { on: true, offset: val('offset') } : null;
    o.margin = val('margin'); o.gap = val('gap');
    const m = MATS[S.mat] || MATS.m12x12;
    o.mat = m.custom ? { w: val('customW'), h: val('customH'), name: 'custom mat' } : m;
    o.bad = bad;
    return o;
  }

  // ---------- compute ----------
  const prepCache = new Map(), weldCache = new Map(), sizeCache = new Map();
  const trim = m => { if (m.size > 4000) m.clear(); };
  let C = null;
  function processName(font, fk, text, o) {
    const pk = fk + '\u0001' + o.tracking + '\u0001' + text;
    let prep = prepCache.get(pk);
    if (!prep) { prep = E.prepare(font, text, o.tracking); prepCache.set(pk, prep); }
    if (!prep.cb || prep.cb.w <= 0) return { text, empty: true, missing: prep.missing };
    const tol = E.tolFor(prep.cb, o);
    const wk = pk + '\u0001' + o.join + '\u0001' + o.barKey + '\u0001' + tol;
    let w = weldCache.get(wk);
    if (!w) { w = E.weldName(font, C, text, { prepared: prep, tol, join: o.join, bar: o.bar }); weldCache.set(wk, w); }
    if (w.empty || !w.paths || !w.paths.length) return { text, empty: true, missing: w.missing || [] };
    const sk = wk + '\u0001' + o.mode + ':' + o.width + 'x' + o.height + '\u0001' + (o.backing ? o.backing.offset : 0);
    let s = sizeCache.get(sk);
    if (!s) { s = E.sizeName(C, w, { mode: o.mode, width: o.width, height: o.height, backing: o.backing }); sizeCache.set(sk, s); }
    return s;
  }

  let gen = 0, timer = 0, result = null, loadedOnce = false;
  function schedule(delay) {
    clearTimeout(timer);
    matbox.classList.add('is-busy');
    timer = setTimeout(run, delay == null ? 140 : delay);
  }
  function setStatus(t, warn) { statusEl.textContent = t; statusEl.classList.toggle('is-warn', !!warn); }

  async function run() {
    const my = ++gen;
    const { names, tabs, cols } = readNames();
    syncColumns(tabs, cols);
    countEl.textContent = names.length === 1 ? '1 name' : `${names.length} names`;
    countEl.classList.toggle('is-over', names.length > FREE_LIMIT && !isPro());
    const o = readOpts();
    if (o.bad.length) { setStatus('Check the highlighted size', true); matbox.classList.remove('is-busy'); setButtons(false); return; }
    let font;
    try {
      if (!loadedOnce) setStatus('Loading the font');
      await core();
      C = window.ClipperLib;
      font = await getFont(S.font);
    } catch (e) {
      setStatus('The font or the outline library did not load. Check your connection and reload.', true);
      matbox.classList.remove('is-busy');
      return;
    }
    if (my !== gen) return;
    if (!font) { setStatus('Choose a font file', true); matbox.classList.remove('is-busy'); return; }
    const fk = fontKey();
    const out = [];
    let t0 = performance.now();
    for (let i = 0; i < names.length; i++) {
      let s;
      try { s = processName(font, fk, names[i].text, o); } catch (e) { s = { text: names[i].text, empty: true, missing: [], error: true }; }
      out.push(Object.assign({}, s, { line: names[i].line, raw: names[i].raw, order: names[i].order }));
      if (performance.now() - t0 > 32) {
        setStatus(`Welding ${i + 1} of ${names.length}`);
        await new Promise(r => setTimeout(r, 0));
        if (my !== gen) return;
        t0 = performance.now();
      }
    }
    [prepCache, weldCache, sizeCache].forEach(trim);
    const items = out.filter(s => !s.empty);
    const mat = o.mat;
    const layout = E.pack(items.map(s => ({ w: s.w, h: s.h })), { w: mat.w, h: mat.h, margin: o.margin, gap: o.gap });
    result = { all: out, items, layout, mat, o };
    loadedOnce = true;
    if (page >= layout.mats) page = layout.mats - 1;
    render();
    matbox.classList.remove('is-busy');
  }

  // ---------- render ----------
  function drawMat(mat, sheet, unit) {
    const W = mat.w * PT, H = mat.h * PT;
    const big = Math.max(mat.w, mat.h);
    const B = sheet ? 0 : 0.6 * PT;            // mat border that carries the ruler numbers
    const pad = (sheet ? 0.45 : 0.3) * PT * Math.max(1, big / 12);
    const foot = 0.42 * PT * Math.max(1, big / 12);  // room under the mat for the status line
    const vb = [-B - pad, -B - pad, W + 2 * B + 2 * pad, H + 2 * B + 2 * pad + foot];
    matSvg.setAttribute('viewBox', vb.map(v => v.toFixed(1)).join(' '));
    const fs = Math.max(8, big * PT / 66);
    let g = '';
    if (sheet) {
      g += `<rect x="${3}" y="${4}" width="${W}" height="${H}" fill="rgba(0,0,0,.28)"/><rect class="sheet-body" width="${W}" height="${H}"/>`;
    } else {
      g += `<rect class="mat-body" x="${-B}" y="${-B}" width="${W + 2 * B}" height="${H + 2 * B}" rx="${0.22 * PT}"/>`;
      g += `<rect class="mat-edge" x="${-B}" y="${-B}" width="${W + 2 * B}" height="${H + 2 * B}" rx="${0.22 * PT}" vector-effect="non-scaling-stroke"/>`;
      const step = unit === 'cm' ? PT / 2.54 : PT / 2;            // minor: 1 cm or 1/2 in
      const majorEvery = unit === 'cm' ? 5 : 2;
      let minor = '', major = '', nums = '';
      for (let i = 0, x = 0; x <= W + 0.01; i++, x = i * step) {
        (i % majorEvery === 0 ? (major += `M${x.toFixed(2)} 0V${H}`) : (minor += `M${x.toFixed(2)} 0V${H}`));
        if (i % majorEvery === 0 && i > 0 && x < W - 0.01) nums += `<text class="mat-num" x="${x.toFixed(2)}" y="${(-B * 0.36).toFixed(1)}" font-size="${fs.toFixed(1)}" text-anchor="middle">${i / majorEvery * (unit === 'cm' ? 5 : 1)}</text>`;
      }
      for (let i = 0, y = 0; y <= H + 0.01; i++, y = i * step) {
        (i % majorEvery === 0 ? (major += `M0 ${y.toFixed(2)}H${W}`) : (minor += `M0 ${y.toFixed(2)}H${W}`));
        if (i % majorEvery === 0 && i > 0 && y < H - 0.01) nums += `<text class="mat-num" x="${(-B * 0.5).toFixed(1)}" y="${(y + fs * 0.35).toFixed(2)}" font-size="${fs.toFixed(1)}" text-anchor="middle">${i / majorEvery * (unit === 'cm' ? 5 : 1)}</text>`;
      }
      g += `<path class="mat-grid" d="${minor}" vector-effect="non-scaling-stroke"/><path class="mat-grid-major" d="${major}" vector-effect="non-scaling-stroke"/>${nums}`;
    }
    return g;
  }

  function render() {
    const R = result;
    const mat = R.mat, sheet = !!mat.sheet, o = R.o;
    matbox.classList.toggle('is-sheet', sheet);
    matbox.classList.toggle('is-tall', mat.h / mat.w > 1.3);
    let g = drawMat(mat, sheet, S.unit);
    const m = o.margin * PT;
    g += `<rect class="${sheet ? 'sheet-safe' : 'mat-safe'}" x="${m}" y="${m}" width="${Math.max(0, mat.w * PT - 2 * m)}" height="${Math.max(0, mat.h * PT - 2 * m)}" vector-effect="non-scaling-stroke"/>`;
    const pro = isPro();
    let shapes = '';
    R.items.forEach((s, i) => {
      const p = R.layout.place[i];
      if (p.mat !== page) return;
      const extra = !pro && i >= FREE_LIMIT ? ' opacity=".28"' : '';
      shapes += `<g${extra}>`;
      if (s.backing) shapes += `<path class="nc-b" fill-rule="evenodd" d="${E.pathData(s.backing, p.x, p.y)}"/>`;
      shapes += `<path class="nc-n" fill-rule="evenodd" d="${E.pathData(s.name, p.x, p.y)}"/>`;
      if (p.tooBig) shapes += `<rect class="nc-over" x="${p.x * PT}" y="${p.y * PT}" width="${s.w * PT}" height="${s.h * PT}" vector-effect="non-scaling-stroke"/>`;
      shapes += '</g>';
    });
    matSvg.innerHTML = g + `<g class="nc-names-g">${shapes}</g>`;
    matSvg.setAttribute('aria-label', `${R.items.length} names in ${fontLabel()} on a ${fmtShort(mat.w)} by ${fmtShort(mat.h)} ${S.unit === 'cm' ? 'centimetre' : 'inch'} ${sheet ? 'sheet' : 'mat'}`);
    // pager
    pager.hidden = R.layout.mats < 2;
    pgLabel.textContent = `${sheet ? 'Sheet' : 'Mat'} ${page + 1} of ${R.layout.mats}`;
    $$('[data-pg]').forEach(b => { b.disabled = (+b.dataset.pg < 0 && page === 0) || (+b.dataset.pg > 0 && page >= R.layout.mats - 1); });
    // readout
    const n = R.items.length;
    $('[data-r-names]').textContent = String(n);
    $('[data-r-size]').textContent = o.mode === 'width' ? `${fmtShort(o.width)} ${S.unit} wide` : o.mode === 'height' ? `${fmtShort(o.height)} ${S.unit} tall` : `fit ${fmtShort(o.width)} × ${fmtShort(o.height)}`;
    $('[data-r-mat]').textContent = `${fmtShort(mat.w)} × ${fmtShort(mat.h)} ${S.unit}${R.layout.mats > 1 ? ` (${R.layout.mats})` : ''}`;
    const split = R.items.filter(s => s.pieces - s.smallPieces > 1).length;
    const dots = R.items.some(s => s.smallPieces > 0);
    $('[data-r-pieces]').textContent = !n ? '0' : split ? `${split} split` : dots ? '1 + dots' : '1 each';
    // status
    const over = R.items.filter((s, i) => R.layout.place[i].tooBig).length;
    const missing = [...new Set(R.all.flatMap(s => s.missing || []))];
    if (over) setStatus(`${over === 1 ? '1 name is' : over + ' names are'} bigger than the area inside the margins`, true);
    else if (missing.length) setStatus(`${fontLabel()} has no ${missing.slice(0, 4).join(' ')}: those letters are left out`, true);
    else setStatus(n ? `${fontLabel()}, ${o.join ? 'letters joined, ' : ''}welded` : 'Add a name to start');
    renderList();
    setButtons(n > 0);
    syncLimit();
  }

  function renderList() {
    const R = result, pro = isPro();
    let html = '', idx = 0;
    R.all.forEach(s => {
      if (s.empty) {
        html += `<li><span class="t">${esc(s.text)}</span><span class="d">nothing to cut</span><span class="w">${s.missing && s.missing.length ? 'This font has no ' + esc(s.missing.join(' ')) : 'No letters in this font'}</span></li>`;
        return;
      }
      const i = idx++;
      const p = R.layout.place[i];
      const warn = [];
      const big = s.pieces - s.smallPieces;
      if (big > 1) warn.push(`${big} pieces: try Join letters or the bar`);
      if (s.missing && s.missing.length) warn.push('no ' + s.missing.join(' ') + ' in this font');
      if (p && p.tooBig) warn.push('bigger than the mat area');
      const cut = !pro && i >= FREE_LIMIT ? ' class="is-cut" title="Not in the free file"' : '';
      html += `<li${cut}><span class="t">${esc(s.text)}</span><span class="d">${fmt(s.nameW)} × ${fmt(s.nameH)}${s.backing ? ` (${fmt(s.w)} × ${fmt(s.h)})` : ''}</span>${warn.length ? `<span class="w">${esc(warn.join('; '))}</span>` : ''}</li>`;
    });
    nameList.innerHTML = html;
  }

  function setButtons(on) { ['svg', 'png', 'dxf', 'zip'].forEach(a => { const b = btn(a); if (b) b.disabled = !on; }); }
  function syncLimit() {
    const n = result ? result.items.length : 0;
    const over = n > FREE_LIMIT && !isPro();
    btn('svg').textContent = over ? `Download SVG (first ${FREE_LIMIT})` : 'Download SVG';
    limitEl.hidden = !over;
    if (over) {
      limitEl.innerHTML = `You have ${n} names. Free files hold the first ${FREE_LIMIT}, the ones shown solid on the mat. <a href="${BUY_URL}" data-buy-pro target="_blank" rel="noopener">Pro</a> puts every name in one file for $15 once.`;
    }
  }
  $$('[data-pg]').forEach(b => b.addEventListener('click', () => {
    if (!result) return;
    page = Math.max(0, Math.min(result.layout.mats - 1, page + +b.dataset.pg));
    render();
  }));

  // ---------- downloads ----------
  function exportSet() {
    const R = result;
    const pro = isPro();
    const items = pro ? R.items : R.items.slice(0, FREE_LIMIT);
    const layout = items.length === R.items.length ? R.layout
      : E.pack(items.map(s => ({ w: s.w, h: s.h })), { w: R.mat.w, h: R.mat.h, margin: R.o.margin, gap: R.o.gap });
    return { items, layout, mat: R.mat };
  }
  const slug = () => E.xmlId(fontLabel()).toLowerCase();
  async function guard(button, fn) {
    if (!result || button.getAttribute('aria-busy') === 'true') return;
    button.setAttribute('aria-busy', 'true');
    try { await fn(); } catch (e) { console.error(e); toast('That download failed. Try again, or try fewer names at once.'); }
    button.removeAttribute('aria-busy');
  }
  btn('svg').addEventListener('click', () => guard(btn('svg'), async () => {
    const x = exportSet();
    const svg = E.svgSheet(x.items, x.layout, x.mat, { title: `${x.items.length} names in ${fontLabel()}` });
    PeakUI.download(new Blob([svg], { type: 'image/svg+xml' }), `names-${slug()}-${x.items.length}.svg`);
    toast(`SVG saved: ${x.items.length} ${x.items.length === 1 ? 'name' : 'names'}, ${fmtShort(x.mat.w)} × ${fmtShort(x.mat.h)} ${S.unit}${x.layout.mats > 1 ? `, ${x.layout.mats} mats` : ''}`);
  }));
  btn('dxf').addEventListener('click', () => guard(btn('dxf'), async () => {
    const x = exportSet();
    PeakUI.download(new Blob([E.dxfSheet(x.items, x.layout, x.mat)], { type: 'application/dxf' }), `names-${slug()}-${x.items.length}.dxf`);
  }));
  btn('png').addEventListener('click', () => guard(btn('png'), async () => {
    const x = exportSet();
    const mirror = !!(S.mirror && isPro());
    const blob = await sheetPNG(x.items, x.layout, x.mat, { dpi: 300, mirror, ink: S.ink || '#111111', backing: '#c99f66' });
    PeakUI.download(blob, `names-${slug()}-${x.items.length}${mirror ? '-mirrored' : ''}-300dpi.png`);
  }));
  btn('zip').addEventListener('click', () => {
    if (!isPro()) { PeakLicense.requirePro('A ZIP with one SVG per name, in a folder per Etsy order when you imported a CSV, is part of Pro: $15 once.'); return; }
    guard(btn('zip'), async () => {
      await zipLib();
      const R = result;
      const zip = new window.JSZip();
      const used = new Set();
      R.items.forEach((s, i) => {
        const folder = s.order ? `order-${E.fileSafe(s.order)}/` : '';
        let base = `${String(i + 1).padStart(3, '0')}-${E.fileSafe(s.text)}`;
        while (used.has(folder + base)) base += '-2';
        used.add(folder + base);
        zip.file(`${folder}${base}.svg`, E.svgSingle(s, { title: s.text }));
      });
      zip.file('all-names.svg', E.svgSheet(R.items, R.layout, R.mat, { title: `${R.items.length} names in ${fontLabel()}` }));
      const blob = await zip.generateAsync({ type: 'blob', compression: 'DEFLATE', compressionOptions: { level: 6 } });
      PeakUI.download(blob, `name-cut-files-${R.items.length}.zip`);
    });
  });

  // PNG at true size. Drawn in horizontal strips and streamed through a deflate encoder,
  // so a 12 × 24 in sheet at 300 dpi (3600 × 7200 px) never needs one giant canvas.
  async function sheetPNG(items, layout, mat, opt) {
    const GAP = 1;
    const totalH = layout.mats * mat.h + (layout.mats - 1) * GAP;
    const W = Math.round(mat.w * opt.dpi), H = Math.round(totalH * opt.dpi);
    const s = opt.dpi / PT;
    const shapes = items.map((it, i) => {
      const p = layout.place[i];
      const dx = p.x, dy = p.y + p.mat * (mat.h + GAP);
      return { y0: dy * opt.dpi, y1: (dy + it.h) * opt.dpi, b: it.backing ? new Path2D(E.pathData(it.backing, dx, dy)) : null, n: new Path2D(E.pathData(it.name, dx, dy)) };
    });
    const draw = (ctx, y0, h) => {
      ctx.setTransform(1, 0, 0, 1, 0, 0);
      ctx.clearRect(0, 0, W, h);
      ctx.setTransform(opt.mirror ? -s : s, 0, 0, s, opt.mirror ? W : 0, -y0);
      for (const sh of shapes) {
        if (sh.y1 < y0 - 2 || sh.y0 > y0 + h + 2) continue;
        if (sh.b) { ctx.fillStyle = opt.backing; ctx.fill(sh.b, 'evenodd'); }
        ctx.fillStyle = opt.ink; ctx.fill(sh.n, 'evenodd');
      }
    };
    return encodePNG(W, H, opt.dpi, draw);
  }

  const CRC = (() => { const t = new Uint32Array(256); for (let n = 0; n < 256; n++) { let c = n; for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1; t[n] = c >>> 0; } return t; })();
  function crc32(parts) { let c = 0xffffffff; for (const p of parts) for (let i = 0; i < p.length; i++) c = CRC[(c ^ p[i]) & 255] ^ (c >>> 8); return (c ^ 0xffffffff) >>> 0; }
  function chunk(type, data) {
    const head = new Uint8Array(8), tail = new Uint8Array(4);
    const dv = new DataView(head.buffer);
    dv.setUint32(0, data.length);
    const t = new Uint8Array([...type].map(ch => ch.charCodeAt(0)));
    head.set(t, 4);
    new DataView(tail.buffer).setUint32(0, crc32([t, data]));
    return [head, data, tail];
  }
  function phys(dpi) { const d = new Uint8Array(9); const v = new DataView(d.buffer); const ppm = Math.round(dpi / 0.0254); v.setUint32(0, ppm); v.setUint32(4, ppm); d[8] = 1; return d; }
  async function encodePNG(W, H, dpi, draw) {
    const ihdr = new Uint8Array(13); const iv = new DataView(ihdr.buffer);
    iv.setUint32(0, W); iv.setUint32(4, H); ihdr[8] = 8; ihdr[9] = 6; ihdr[10] = 0; ihdr[11] = 0; ihdr[12] = 0;
    const sig = new Uint8Array([137, 80, 78, 71, 13, 10, 26, 10]);
    const canvas = document.createElement('canvas');
    if (typeof CompressionStream === 'undefined') {
      // older browsers: one canvas, then add the resolution chunk
      canvas.width = W; canvas.height = H;
      const ctx = canvas.getContext('2d');
      draw(ctx, 0, H);
      const blob = await new Promise(r => canvas.toBlob(r, 'image/png'));
      const buf = new Uint8Array(await blob.arrayBuffer());
      const at = 8 + 25; // after the signature and IHDR
      return new Blob([buf.slice(0, at), ...chunk('pHYs', phys(dpi)), buf.slice(at)], { type: 'image/png' });
    }
    const stripH = Math.max(16, Math.min(H, Math.floor(4e6 / W)));
    canvas.width = W; canvas.height = stripH;
    const ctx = canvas.getContext('2d', { willReadFrequently: true });
    const cs = new CompressionStream('deflate');
    const writer = cs.writable.getWriter();
    const out = [];
    const reading = (async () => { const r = cs.readable.getReader(); for (;;) { const { value, done } = await r.read(); if (done) break; out.push(value); } })();
    for (let y = 0; y < H; y += stripH) {
      const h = Math.min(stripH, H - y);
      draw(ctx, y, h);
      const px = ctx.getImageData(0, 0, W, h).data;
      const rows = new Uint8Array(h * (W * 4 + 1));
      for (let r = 0; r < h; r++) { rows[r * (W * 4 + 1)] = 0; rows.set(px.subarray(r * W * 4, (r + 1) * W * 4), r * (W * 4 + 1) + 1); }
      await writer.ready; await writer.write(rows);
      if (y && (y / stripH) % 4 === 0) await new Promise(r => setTimeout(r, 0));
    }
    await writer.close(); await reading;
    const parts = [sig, ...chunk('IHDR', ihdr), ...chunk('pHYs', phys(dpi))];
    for (const o of out) parts.push(...chunk('IDAT', o));
    parts.push(...chunk('IEND', new Uint8Array(0)));
    return new Blob(parts, { type: 'image/png' });
  }

  // ---------- CSV import ----------
  const imp = $('[data-import]'), impField = $('[data-import-field]'), impPrev = $('[data-import-preview]');
  let analysis = null, impNames = [];
  PeakUI.drop($('[data-drop]'), async files => {
    const f = files[0];
    if (!f) return;
    if (!/\.(csv|tsv|txt)$/i.test(f.name) && !/csv|text/.test(f.type)) { toast('That isn’t a CSV file. In Etsy, download the Sold Order Items CSV from Shop Manager, Settings, Options, Download Data.'); return; }
    const text = await f.text();
    analysis = X.analyze(X.parseCSV(text));
    if (!analysis.ok || !analysis.fields.length) { toast('No rows found in that file.'); return; }
    impField.innerHTML = analysis.fields.map(fl => `<option value="${esc(fl.id)}">${esc(fl.label)}${fl.kind === 'var' ? ' (from Variations)' : ''}</option>`).join('');
    impField.value = analysis.guess;
    imp.hidden = false;
    previewImport();
    imp.scrollIntoView({ block: 'nearest', behavior: matchMedia('(prefers-reduced-motion: reduce)').matches ? 'auto' : 'smooth' });
  });
  function previewImport() {
    const r = X.extractNames(analysis, { field: impField.value, split: $('[data-import-split]').checked ? 'all' : 'lines', repeatQty: $('[data-import-qty]').checked });
    impNames = r.names;
    const orders = new Set(impNames.map(n => n.order).filter(Boolean)).size;
    $('[data-import-sum]').innerHTML = `${analysis.isEtsy ? 'Etsy orders file. ' : ''}<strong>${impNames.length} ${impNames.length === 1 ? 'name' : 'names'}</strong>${orders ? ` from ${orders} ${orders === 1 ? 'order' : 'orders'}` : ''}${r.skipped ? `, ${r.skipped} without personalization skipped` : ''}.`;
    impPrev.innerHTML = impNames.slice(0, 60).map(n => `<li>${esc(n.text)}${n.order ? `<span class="o">#${esc(n.order)}</span>` : ''}</li>`).join('') + (impNames.length > 60 ? `<li class="o">and ${impNames.length - 60} more</li>` : '');
  }
  impField.addEventListener('change', previewImport);
  $('[data-import-split]').addEventListener('change', previewImport);
  $('[data-import-qty]').addEventListener('change', previewImport);
  $('[data-import-cancel]').addEventListener('click', () => { imp.hidden = true; analysis = null; });
  $('[data-import-use]').addEventListener('click', () => {
    if (!isPro()) { PeakLicense.requirePro(`Importing names from an Etsy orders CSV is part of Pro: $15 once. It also removes the ${FREE_LIMIT}-name limit, so all ${impNames.length} names go in one file.`); return; }
    S.names = impNames.map(n => n.text).join('\n');
    importOrders = impNames.map(n => ({ text: n.text, order: n.order }));
    list.value = S.names; S.col = 0; save();
    imp.hidden = true;
    schedule(0);
    toast(`${impNames.length} names added`);
  });

  // ---------- licence ----------
  function startLicense() {
    if (!window.PeakLicense) return;
    PeakLicense.setup({ tool: 'name-cut-files', productId: GUMROAD_PRODUCT_ID, permalink: PRO_PERMALINK, buyUrl: BUY_URL,
      pitch: 'Pro is $15 once: unlimited names per file, Etsy CSV import, a backing layer, one SVG per name in a ZIP, mirrored PNGs and more mat sizes.' });
    const proState = document.querySelector('[data-pro-state]'), signOut = document.querySelector('[data-pro-signout]');
    if (signOut) signOut.addEventListener('click', e => { e.preventDefault(); PeakLicense.signOut(); });
    let first = true;
    PeakLicense.onChange(pro => {
      if (proState) { proState.hidden = !pro; proState.textContent = pro ? 'Pro is active on this browser.' : ''; }
      if (signOut) signOut.hidden = !pro;
      if (pro && MATS[savedMat] && MATS[savedMat].pro && S.mat === 'm12x12') { S.mat = lastMat = savedMat; matSel.value = S.mat; syncVisibility(); }
      if (!pro) {
        if (S.backing) { S.backing = false; checks.backing.checked = false; }
        if (S.mirror) { S.mirror = false; checks.mirror.checked = false; }
        if (MATS[S.mat] && MATS[S.mat].pro) { S.mat = lastMat = 'm12x12'; matSel.value = S.mat; }
        syncVisibility();
      }
      if (!first) schedule(0);
      first = false;
    });
  }

  // ---------- start ----------
  setFontUI(); syncLabels(); syncTrack(); syncVisibility();
  setStatus('Loading the font');
  // the empty mat is drawn straight away; names follow once the libraries arrive
  result = null;
  (function firstPaint() {
    const o = readOpts();
    matSvg.setAttribute('preserveAspectRatio', 'xMidYMid meet');
    matSvg.innerHTML = drawMat(o.mat && o.mat.w ? o.mat : MATS.m12x12, !!(o.mat && o.mat.sheet), S.unit);
    matbox.classList.toggle('is-sheet', !!(o.mat && o.mat.sheet));
  })();
  if (document.readyState === 'complete') { startLicense(); schedule(0); }
  else window.addEventListener('load', () => { startLicense(); schedule(0); });
})();
