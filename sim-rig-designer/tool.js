/* Sim Rig Designer: page logic. Engine: engine.js (window.SimRigEngine) over data.js (window.SimRigData). Nothing typed
 * here leaves the browser: the share link keeps the design after the # sign. The 3D scene (scene.js and three.js)
 * loads only when the 3D view starts; the PDF code, pdf-lib, JSZip and the 3D exporters only when a Pro user asks for
 * them. */
(function () {
  'use strict';

  // ---- Gumroad Pro product, permalink sim-rig-designer-pro. The licence check sends the product id, never the
  // permalink. Fail closed: while this is 'PENDING' (or empty) Pro never turns on, whatever the browser has stored.
  const SIM_RIG_PRO_PRODUCT_ID = 'yb6_8YJbgaJd7pqqWCYxMw==';
  const PRO_READY = !!SIM_RIG_PRO_PRODUCT_ID && SIM_RIG_PRO_PRODUCT_ID !== 'PENDING';
  // One licence for every language: the same product, the same key in this browser (tool: 'sim-rig-designer'). The
  // page's language (its <html lang>) picks the words and the market; English unless a dictionary for it is loaded.
  const E = window.SimRigEngine, D = window.SimRigData, V = window.SimRigView;
  const pageLang = (document.documentElement.lang || 'en').slice(0, 2).toLowerCase();
  E.setLang(E.I.LANGS.includes(pageLang) ? pageLang : 'en');
  const T = (k, p) => E.t(k, p);
  const LICENSE = {
    tool: 'sim-rig-designer',
    productId: PRO_READY ? SIM_RIG_PRO_PRODUCT_ID : 'PENDING',
    permalink: 'sim-rig-designer-pro',
    buyUrl: 'https://dorukctn.gumroad.com/l/sim-rig-designer-pro',
    pitch: T('t.pitch'),
  };
  // the licence dialog in the page's language (English keeps license.js's own words)
  if (E.getLang() !== 'en') Object.assign(LICENSE, { strings: Object.fromEntries(['title', 'buy', 'keyLabel', 'verify', 'close', 'checking', 'badKey', 'network', 'ok', 'refunded', 'rejected', 'active'].map(k => [k, T(`lic.${k}`)])), localMessages: true });
  const PDFLIB_SRC = '/pay-gap-report/vendor/pdf-lib.min.js';
  const JSZIP_SRC = '/name-cut-files/vendor/jszip.min.js';
  const REPORT_SRC = '/sim-rig-designer/report.js';
  const SCENE_SRC = '/sim-rig-designer/scene.js';

  const $ = id => document.getElementById(id);
  const esc = s => V.esc(s);
  const form = $('form');
  const get = (o, path) => path.split('.').reduce((a, k) => (a == null ? a : a[k]), o);
  function set(o, path, v) { const ks = path.split('.'); let t = o; ks.slice(0, -1).forEach(k => { if (t[k] == null || typeof t[k] !== 'object') t[k] = {}; t = t[k]; }); t[ks[ks.length - 1]] = v; }

  let model = null, res = null, scene = null, sceneLoading = null, glBroken = false, pro = false;
  let ensureRes = () => res;

  // ---------- the selects that depend on the units ----------
  function fillSelects() {
    const u = model.units;
    $('lumber').innerHTML = E.lumberOptions(u).map(l => `<option value="${esc(l.id)}">${esc(l.label)}</option>`).join('');
    $('stock').innerHTML = E.stockOptions(u, model.lumber).map(s => `<option value="${s.mm}">${esc(s.label)}</option>`).join('');
    $('sheet').innerHTML = E.sheetOptions(u).map(s => `<option value="${esc(s.id)}">${esc(s.label)}</option>`).join('');
  }
  // ---------- model to form, form to model ----------
  function fillOne(el) {
    const k = el.dataset.k, t = el.dataset.t, v = get(model, k);
    if (t === 'bool') el.checked = !!v;
    else if (t === 'len') el.value = v == null || v === '' || (k === 'driver.inseam' && !v) ? '' : E.toInput(v, model.units);
    else el.value = v == null ? '' : String(Math.round(Number(v) * 100) / 100 || v);
  }
  function fillForm(skip) {
    form.querySelectorAll('[data-k]').forEach(el => { if (el !== skip) fillOne(el); });
    form.querySelectorAll('[data-seg]').forEach(seg => { const v = String(get(model, seg.dataset.seg)); seg.querySelectorAll('button').forEach(b => b.setAttribute('aria-pressed', String(b.dataset.v === v))); });
    document.querySelectorAll('input[name="build"]').forEach(r => { r.checked = r.value === model.build; });
    document.querySelectorAll('[data-unit]').forEach(i => { i.textContent = model.units === 'metric' ? 'cm' : 'in'; });
    const L = E.lumberOf(model); $('lumber-actual').textContent = T('t.actual', { actual: L.actual });
    $('auto-note').textContent = model.auto ? '' : T('t.autoOff');
    $('h-note').textContent = model.units === 'metric' ? '' : E.height(model.driver.h, 'imperial');
  }
  function readField(el) {
    const k = el.dataset.k, t = el.dataset.t;
    let v;
    if (t === 'bool') v = el.checked;
    else if (t === 'len') { if (el.value === '') { if (k === 'driver.inseam') v = 0; else return false; } else { v = E.fromInput(el.value, model.units); if (!Number.isFinite(v)) return false; } }
    else if (t === 'num' || t === 'int') { if (el.value === '') return false; v = Number(el.value); if (!Number.isFinite(v)) return false; }
    else v = el.value;
    set(model, k, v);
    if (el.hasAttribute('data-size')) model.auto = false;   // a position typed by hand stops the automatic fitting
    model.sample = false;
    return true;
  }
  function cond(expr) {
    return expr.split('|').some(c => {
      const neg = c.startsWith('!'); const s = neg ? c.slice(1) : c;
      let r;
      if (s.includes('=')) { const [k, v] = s.split('='); r = String(get(model, k)) === v; }
      else r = !!get(model, s);
      return neg ? !r : r;
    });
  }
  function visible() { form.querySelectorAll('[data-show]').forEach(el => { el.hidden = !cond(el.dataset.show); }); }
  // when the automatic fitting is on, the positions follow the driver, the seat and the gear
  const sized = m => E.normalize(E.sizeFor(E.normalize(m)));

  // ---------- render (the rows come from view.js, which the build also uses to write the sample into the page) ----------
  let shopRendered = '';
  function render() {
    res = E.evaluate(model);
    if (model.auto) { model.rig = res.m.rig; fillForm(document.activeElement); }
    $('design-title').textContent = V.title(model, E);
    $('design-sub').textContent = V.summary(res, E);
    $('readout').innerHTML = V.readout(res);
    $('counts').innerHTML = V.counts(res.counts);
    $('badge').hidden = !model.sample; $('sample-note').hidden = !model.sample;
    $('check-rows').innerHTML = V.checkRows(res);
    renderShop();
    proRender();
    queueScene();
    langLinks();
  }
  // the language switch keeps the design: the other edition opens it with its own units and materials
  function langLinks() {
    const out = model && !model.sample && model.name === T('sample.name') ? Object.assign({}, model, { name: '' }) : model;
    const code = model && !model.sample ? `#design=${E.encode(out)}&from=${E.getLang()}` : '';
    document.querySelectorAll('a[data-lang-switch]').forEach(a => { a.href = a.getAttribute('data-lang-switch') + code; });
  }
  function renderShop() {
    const sig = V.shopSig(res, model.units);
    if (sig !== shopRendered || !$('shop-rows').children.length) { $('shop-rows').innerHTML = V.shopRows(res, E); shopRendered = sig; }
    else {
      for (const it of res.shop.items) { const c = document.querySelector(`[data-cost="${CSS.escape(it.id)}"]`); if (c) c.textContent = it.cost != null ? V.money(it.cost) : ''; }
      $('shop-total').textContent = res.shop.priced ? V.money(res.shop.total) : '';
    }
    const missing = res.shop.items.length - res.shop.priced;
    $('shop-note').textContent = res.shop.priced ? T('t.priced', { priced: res.shop.priced, n: res.shop.items.length, missing }) : T('t.pricesStay');
    $('shop-cap').textContent = V.shopCaption(res, model, E);
  }
  $('shop-rows').addEventListener('input', e => {
    const id = e.target.dataset && e.target.dataset.price;
    if (!id) return;
    const v = e.target.value === '' ? null : Number(e.target.value);
    if (v == null) delete model.prices[id]; else if (Number.isFinite(v) && v >= 0) model.prices[id] = v;
    res = E.evaluate(model);
    renderShop();
  });

  // ---------- 3D: loaded on intent ----------
  function webgl() { try { const c = document.createElement('canvas'); return !!(window.WebGLRenderingContext && (c.getContext('webgl2') || c.getContext('webgl'))); } catch (e) { return false; } }
  function start3d() {
    if (scene || sceneLoading || glBroken) return sceneLoading || Promise.resolve(scene);
    if (!webgl()) { glBroken = true; $('gl-note').hidden = false; $('start3d').hidden = true; return Promise.resolve(null); }
    $('start3d').disabled = true; $('start3d').lastChild.textContent = T('t.loading3d');
    ensureRes();
    sceneLoading = import(SCENE_SRC).then(mod => {
      const canvas = $('canvas'); canvas.hidden = false;
      scene = mod.createScene(canvas, { labels: $('tags'), onView: v => setViewButtons(v) });
      scene.update(Object.assign({ E }, res));
      applyToggles();
      $('poster').hidden = true; $('start3d').hidden = true; $('toolbar').hidden = false;
      return scene;
    }).catch(err => { console.error(err); glBroken = true; $('gl-note').hidden = false; $('start3d').hidden = true; return null; });
    return sceneLoading;
  }
  let sceneT = 0;
  function queueScene() { if (!scene) return; clearTimeout(sceneT); sceneT = setTimeout(() => { scene.update(Object.assign({ E }, res)); applyToggles(); }, 90); }
  const toggles = () => [...document.querySelectorAll('#toolbar [data-part]')];
  function applyToggles() { if (!scene) return; const o = {}; toggles().forEach(b => { o[b.dataset.part] = b.getAttribute('aria-pressed') === 'true'; }); scene.setShow(o); }
  document.querySelector('#toolbar .sr-toggles').addEventListener('click', e => {
    const b = e.target.closest('[data-part]'); if (!b) return;
    const on = b.getAttribute('aria-pressed') !== 'true';
    b.setAttribute('aria-pressed', String(on));
    if (b.dataset.part === 'angles' && on) { const d = document.querySelector('#toolbar [data-part="driver"]'); d.setAttribute('aria-pressed', 'true'); }
    applyToggles();
  });
  function setViewButtons(v) { $('views').querySelectorAll('button').forEach(x => x.setAttribute('aria-pressed', String(x.dataset.view === v))); }
  $('views').addEventListener('click', e => {
    const b = e.target.closest('[data-view]'); if (!b || !scene) return;
    setViewButtons(b.dataset.view); scene.setView(b.dataset.view);
    if (b.dataset.view === 'side') { const a = document.querySelector('#toolbar [data-part="angles"]'); a.setAttribute('aria-pressed', 'true'); document.querySelector('#toolbar [data-part="driver"]').setAttribute('aria-pressed', 'true'); applyToggles(); }
  });
  $('steps').addEventListener('click', () => start3d().then(s => { if (!s) return; setViewButtons('iso'); s.setView('iso'); s.playSteps(); }));

  // ---------- events ----------
  let t = 0;
  const schedule = () => { clearTimeout(t); t = setTimeout(() => { if (model.auto) { model = sized(model); fillForm(document.activeElement); } visible(); render(); }, 80); };
  form.addEventListener('input', e => { const el = e.target; if (el.dataset && el.dataset.k && readField(el)) schedule(); });
  form.addEventListener('change', e => {
    const el = e.target; if (!(el.dataset && el.dataset.k)) return;
    readField(el);
    model = model.auto ? sized(model) : E.normalize(model);
    // a section sold in other lengths: the length select offers its own (the design keeps the nearest)
    if (el.dataset.k === 'lumber') fillSelects();
    fillForm(); visible(); render();
  });
  form.addEventListener('click', e => {
    const b = e.target.closest('[data-seg] button'); if (!b) return;
    const key = b.closest('[data-seg]').dataset.seg;
    if (key === 'units') { if (b.dataset.v !== model.units) switchUnits(b.dataset.v); return; }
    if (get(model, key) === b.dataset.v) return;
    set(model, key, b.dataset.v); model.sample = false;
    if (key === 'style') { model.auto = true; model.gear.rim = D.STYLES[b.dataset.v].rim; }
    model = model.auto ? sized(model) : E.normalize(model);
    fillForm(); visible(); render();
  });
  // a design in the other system of units: the driver, the gear and the positions kept, the materials moved to their
  // nearest equivalent in this market
  function converted(o, u) {
    const n = E.fresh(o.build, u, o.style);
    for (const k of ['driver', 'seat', 'gear', 'screen', 'room', 'rig', 'addons']) n[k] = JSON.parse(JSON.stringify(o[k]));
    for (const k of ['auto', 'name', 'plate']) n[k] = o[k];
    n.lumber = E.swapLumber(o.lumber, u) || n.lumber;
    const m = n.auto ? sized(n) : E.normalize(n); m.sample = false;
    return m;
  }
  function switchUnits(u) {
    model = converted(model, u);
    shopRendered = '';
    fillSelects(); fillForm(); visible(); render();
  }
  document.querySelectorAll('input[name="build"]').forEach(r => r.addEventListener('change', () => {
    if (!r.checked || r.value === model.build) return;
    const o = model, n = E.fresh(r.value, o.units, o.style);
    for (const k of ['driver', 'screen', 'room', 'name']) n[k] = JSON.parse(JSON.stringify(o[k]));
    n.gear = JSON.parse(JSON.stringify(o.gear));
    if (r.value !== 'stand' && o.seat.type !== 'office') n.seat.type = o.seat.type;
    n.auto = true;
    model = sized(n); shopRendered = '';
    fillSelects(); fillForm(); visible(); render();
    start3d();
  }));
  $('start3d').addEventListener('click', () => start3d());
  $('sample').addEventListener('click', () => { model = E.sample(); shopRendered = ''; fillSelects(); fillForm(); visible(); render(); PeakUI.toast(T('t.sampleLoaded')); });
  $('fresh').addEventListener('click', () => {
    const o = model; const n = E.fresh(o.build, o.units, o.style);
    n.room = Object.assign({}, o.room);
    model = sized(n); shopRendered = ''; fillSelects(); fillForm(); visible(); render();
    PeakUI.toast(T('t.fresh'));
    const first = form.querySelector('[data-k="driver.h"]'); if (first) first.focus();
  });
  $('share').addEventListener('click', async () => {
    const url = `${location.origin}${location.pathname}#design=${E.encode(model)}`;
    history.replaceState(null, '', url);
    try { await navigator.clipboard.writeText(url); PeakUI.toast(T('t.shared')); }
    catch (e) { PeakUI.toast(T('t.sharedBar')); }
  });
  $('print').addEventListener('click', () => {
    document.body.classList.add('sr-print-shop');
    const done = () => { document.body.classList.remove('sr-print-shop'); window.removeEventListener('afterprint', done); };
    window.addEventListener('afterprint', done);
    window.print();
    setTimeout(done, 1500);
  });

  // ---------- Pro ----------
  let pdfLibPromise = null, reportPromise = null, zipPromise = null;
  const loadScript = (src, test) => (test() ? Promise.resolve(test()) : new Promise((resolve, reject) => {
    const el = document.createElement('script'); el.src = src;
    el.onload = () => (test() ? resolve(test()) : reject(new Error(src + ' did not load')));
    el.onerror = () => reject(new Error(src + ' did not load'));
    document.head.appendChild(el);
  }));
  function loadPdf() {
    if (!pdfLibPromise) pdfLibPromise = loadScript(PDFLIB_SRC, () => window.PDFLib).catch(e => { pdfLibPromise = null; throw e; });
    if (!reportPromise) reportPromise = loadScript(REPORT_SRC, () => window.SimRigReport).catch(e => { reportPromise = null; throw e; });
    return Promise.all([pdfLibPromise, reportPromise]);
  }
  const today = () => { const d = new Date(); return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`; };
  const stem = () => T('t.file.stem', { build: model.build, style: model.style, date: today() });
  const needPro = why => { if (!PRO_READY) { PeakLicense.open(why); return false; } return PeakLicense.requirePro(why); };
  async function shots(s) {
    if (!s) return { views: [], steps: [] };
    const views = [
      Object.assign({ label: 'iso' }, s.snapshot({ width: 1400, height: 900, view: 'iso', type: 'image/jpeg', quality: 0.86, theta: -0.95, phi: 1.15 })),
      Object.assign({ label: 'fit' }, s.snapshot({ width: 1400, height: 900, view: 'side', type: 'image/jpeg', quality: 0.86, anglesOn: true, labelPx: 22, screensOn: model.screen.kind !== 'triple' })),
    ];
    const steps = res.steps.map(st => Object.assign({ n: st.n }, s.snapshot({ width: 1000, height: 680, view: 'iso', type: 'image/jpeg', quality: 0.82, upTo: st.n, hi: st.n, explodeBy: 1, driverOn: false, roomOn: false, screensOn: st.n >= 6, gearOn: st.n >= 7, seatOn: res.design.lay.seated ? st.n >= 2 : st.n >= 7 })));
    return { views, steps };
  }
  async function doPdf() {
    if (!needPro(T('t.pro.pdf'))) return;
    const btn = $('x-pdf'), text = btn.textContent;
    try {
      btn.disabled = true; btn.textContent = T('t.preparing');
      const [PDFLib, X] = await loadPdf();
      const s = await start3d();
      const pics = await shots(s);
      const bytes = await X.pdf(PDFLib, { res, E, D, shots: pics, both: $('both-units').checked });
      PeakUI.download(new Blob([bytes], { type: 'application/pdf' }), T('t.file.plan', { stem: stem() }));
      PeakUI.toast(T('t.planDone'));
    } catch (e) { console.error(e); PeakUI.toast(T('t.pdfFail')); }
    finally { btn.disabled = false; btn.textContent = text; }
  }
  async function doDxf() {
    if (!needPro(T('t.pro.dxf'))) return;
    try {
      if (!zipPromise) zipPromise = loadScript(JSZIP_SRC, () => window.JSZip).catch(e => { zipPromise = null; throw e; });
      const JSZip = await zipPromise;
      const zip = new JSZip(), inch = $('dxf-inch').checked;
      const plates = res.design.plates;
      for (const pl of plates) zip.file(T('t.file.dxf', { id: pl.id, inch }), E.dxf(pl, { units: inch ? 'in' : 'mm' }));
      const lines = plates.map(pl => T('t.readme.plate', { label: pl.label, w: E.len(pl.w, model.units), d: E.len(pl.d, model.units), n: pl.holes.length, slots: pl.holes.some(h => h.slot), fix: pl.fixings.length, measured: pl.measured }));
      zip.file(T('t.readme.file'), [T('t.readme.head', { date: today() }), T('t.readme.units', { inch }), '', ...lines, '', T('t.readme.hand'), T('t.readme.check'), T('t.readme.made', { url: T('r.url') })].join('\r\n'));
      const blob = await zip.generateAsync({ type: 'blob' });
      PeakUI.download(blob, T('t.file.zip', { stem: stem() }));
      PeakUI.toast(T('t.dxfDone', { n: plates.length }));
    } catch (e) { console.error(e); PeakUI.toast(T('t.dxfFail')); }
  }
  async function doExport(kind) {
    if (!needPro(T('t.pro.3d'))) return;
    const s = await start3d(); if (!s) { PeakUI.toast(T('t.no3d')); return; }
    try {
      const obj = s.exportObject();
      if (kind === 'glb') {
        const { GLTFExporter } = await import('/catio-designer/vendor/GLTFExporter.js');
        const buf = await new GLTFExporter().parseAsync(obj, { binary: true });
        PeakUI.download(new Blob([buf], { type: 'model/gltf-binary' }), `${stem()}.glb`);
      } else {
        const { OBJExporter } = await import('/catio-designer/vendor/OBJExporter.js');
        PeakUI.download(new Blob([new OBJExporter().parse(obj)], { type: 'text/plain' }), `${stem()}.obj`);
      }
      PeakUI.toast(T('t.exported', { kind: kind.toUpperCase() }));
    } catch (e) { console.error(e); PeakUI.toast(T('t.fileFail')); }
  }
  async function doRender() {
    if (!needPro(T('t.pro.render'))) return;
    const s = await start3d(); if (!s) return;
    const shot = s.snapshot({ width: 2400, height: 1500, view: 'hero', type: 'image/png', theta: -0.8, phi: 1.18, mood: 'dusk' });
    const blob = await (await fetch(shot.url)).blob();
    PeakUI.download(blob, T('t.file.render', { stem: stem() }));
  }
  $('x-pdf').addEventListener('click', doPdf);
  $('x-dxf').addEventListener('click', doDxf);
  $('x-glb').addEventListener('click', () => doExport('glb'));
  $('x-obj').addEventListener('click', () => doExport('obj'));
  $('x-png').addEventListener('click', doRender);

  // saved designs: Pro, kept in this browser only
  const SAVE_KEY = 'sim-rig-designer:saved';
  const store = { get() { try { return JSON.parse(localStorage.getItem(SAVE_KEY) || '[]'); } catch (e) { return []; } }, set(v) { try { localStorage.setItem(SAVE_KEY, JSON.stringify(v)); } catch (e) { PeakUI.toast(T('t.noStore')); } } };
  function renderSaved() {
    const list = store.get();
    $('saved-list').innerHTML = list.length ? list.map((x, i) => `<li><span>${esc(x.name)} <span class="sr-small">${esc(x.at)}</span></span><span><button type="button" data-load="${i}">${esc(T('t.open'))}</button> <button type="button" data-del="${i}">${esc(T('t.delete'))}</button></span></li>`).join('') : `<li>${esc(T('t.noSaved'))}</li>`;
  }
  $('save').addEventListener('click', () => {
    if (!needPro(T('t.pro.saved'))) return;
    const name = ($('save-name').value || model.name || `${E.BUILD_NAME[model.build]} ${today()}`).slice(0, 60);
    const list = store.get().filter(x => x.name !== name);
    list.unshift({ name, code: E.encode(Object.assign({}, model, { name })), at: today() });
    store.set(list.slice(0, 30)); renderSaved(); PeakUI.toast(T('t.savedAs', { name }));
  });
  $('saved-list').addEventListener('click', e => {
    const l = e.target.dataset.load, d = e.target.dataset.del;
    if (l == null && d == null) return;
    if (!needPro(T('t.pro.saved'))) return;
    const list = store.get();
    if (d != null) { list.splice(Number(d), 1); store.set(list); renderSaved(); return; }
    const m = E.decode(list[Number(l)].code); if (!m) return;
    model = m; shopRendered = ''; fillSelects(); fillForm(); visible(); render(); PeakUI.toast(T('t.opened', { name: m.name }));
  });

  // the cut list (wood) or the cuts by profile (aluminium), and the plates, drawn on the page for Pro
  function svgBoards(r) {
    const u = r.m.units, boards = r.cut.boards;
    const W = 720, rowH = 30;
    const maxStock = Math.max(...boards.map(b => b.stock));
    const sc = (W - 10) / maxStock;
    let y = 4; const parts = [];
    for (const b of boards) {
      parts.push(`<text x="0" y="${y + 11}" font-size="12" fill="currentColor">${esc(T('t.svgBoard', { n: b.n, lumber: r.design.lumber.label, stock: E.stockLabel(b.stock, u), cuts: b.cuts.length, left: E.len(b.leftover, u) }))}</text>`);
      y += 16; let x = 0;
      for (const c of b.cuts) {
        const w = c.len * sc;
        parts.push(`<rect x="${x.toFixed(1)}" y="${y}" width="${Math.max(1, w - 1).toFixed(1)}" height="${rowH}" fill="#dcae72" stroke="#17151d" stroke-width="0.8"/>`);
        if (w > 44) parts.push(`<text x="${(x + w / 2).toFixed(1)}" y="${y + 19}" font-size="11.5" text-anchor="middle" fill="#17151d">${esc(E.len(c.len, u))}</text>`);
        x += w + r.cut.kerf * sc;
      }
      const lw = b.stock * sc - x;
      if (lw > 1) parts.push(`<rect x="${x.toFixed(1)}" y="${y}" width="${lw.toFixed(1)}" height="${rowH}" fill="url(#sr-hatch)" stroke="#77748a" stroke-width="0.8"/>`);
      y += rowH + 10;
    }
    return `<svg class="sr-diagram" viewBox="0 0 ${W} ${y}" role="img" aria-label="${esc(T('t.svgAria'))}"><defs><pattern id="sr-hatch" width="6" height="6" patternUnits="userSpaceOnUse" patternTransform="rotate(45)"><rect width="6" height="6" fill="#f6f6fa"/><line x1="0" y1="0" x2="0" y2="6" stroke="#77748a" stroke-width="1.2"/></pattern></defs>${parts.join('')}</svg>`;
  }
  function aluTable(r) {
    const u = r.m.units, rows = [];
    for (const s of r.bom.sections) {
      rows.push(`<tr class="sr-group"><td colspan="3">${esc(T('r.bomSec', { label: s.profile.label, m: s.total / 1000, n: s.n, kg: s.kg }))}</td></tr>`);
      for (const c of s.cuts) rows.push(`<tr><td><b>${esc(E.len(c.len, u))}</b>${c.angled ? ` <span class="sr-small">${esc(T('t.angledEnds'))}</span>` : ''}</td><td data-h="${esc(T('r.h.pieces'))}" class="num">${c.qty}</td><td data-h="${esc(T('r.h.where'))}">${esc(c.where)}</td></tr>`);
    }
    return `<table class="sr-table"><caption>${esc(T('t.aluCap'))}</caption><thead><tr><th scope="col">${esc(T('r.h.length'))}</th><th scope="col" class="num">${esc(T('r.h.pieces'))}</th><th scope="col">${esc(T('r.h.where'))}</th></tr></thead><tbody>${rows.join('')}</tbody></table>`;
  }
  function svgPlate(pl) {
    const sc = 240 / Math.max(pl.w, pl.d), w = pl.w * sc, h = pl.d * sc;
    const holes = pl.holes.concat(pl.fixings).map(hh => hh.slot ? `<rect x="${((hh.x - hh.d / 2) * sc).toFixed(1)}" y="${(h - (hh.y + hh.slot / 2 + hh.d / 2) * sc).toFixed(1)}" width="${(hh.d * sc).toFixed(1)}" height="${((hh.slot + hh.d) * sc).toFixed(1)}" rx="${(hh.d / 2 * sc).toFixed(1)}" fill="#fff" stroke="#17151d" stroke-width="0.8"/>` : `<circle cx="${(hh.x * sc).toFixed(1)}" cy="${(h - hh.y * sc).toFixed(1)}" r="${Math.max(1, hh.d / 2 * sc).toFixed(1)}" fill="#fff" stroke="#17151d" stroke-width="0.8"/>`).join('');
    return `<figure class="sr-plate"><svg class="sr-diagram" viewBox="-4 -4 ${(w + 8).toFixed(1)} ${(h + 8).toFixed(1)}" style="max-width:${Math.round(w + 8)}px" role="img" aria-label="${esc(T('t.plateAria', { label: pl.label, w: Math.round(pl.w), d: Math.round(pl.d) }))}"><rect x="0" y="0" width="${w.toFixed(1)}" height="${h.toFixed(1)}" rx="${(pl.r * sc).toFixed(1)}" fill="#e8cfa3" stroke="#17151d" stroke-width="1"/>${holes}</svg><figcaption>${esc(T('t.plateCap', { label: pl.label, w: E.len(pl.w, model.units), d: E.len(pl.d, model.units), measured: pl.measured }))}</figcaption></figure>`;
  }
  function proRender() {
    if (!pro || !res) return;
    const u = model.units;
    if (model.build === 'alu') $('cut-diagrams').innerHTML = `<h3>${esc(T('t.aluH', { n: res.bom.sections.reduce((a, s) => a + s.n, 0) }))}</h3>${aluTable(res)}<p class="sr-small">${esc(T('t.aluHw', { brackets: res.bom.brackets, hinges: res.bom.hinges, tnuts: res.bom.tnuts, bolts: res.bom.bolts, caps: res.bom.caps.p4040 + res.bom.caps.p4080 }))}</p>`;
    else $('cut-diagrams').innerHTML = `<h3>${esc(T('t.cutH', { n: res.cut.boards.length }))}</h3><p class="sr-small">${esc(T('t.cutNote', { kerf: E.len(res.cut.kerf, u), trim: E.len(res.cut.trim, u), waste: Math.round(res.cut.waste * 100) }))}</p>${svgBoards(res)}`;
    $('plate-diagrams').innerHTML = `<h3>${esc(T('t.platesH', { n: res.design.plates.length }))}</h3><div class="sr-plates">${res.design.plates.map(svgPlate).join('')}</div>`;
  }
  function proState() {
    $('locked').querySelectorAll('li').forEach(li => { li.classList.toggle('is-open', pro); li.querySelector('em').textContent = pro ? T('t.active') : 'Pro'; });
    $('pro-work').hidden = !pro;
    if (pro) renderSaved();
  }

  // ---------- start ----------
  function initial() {
    const h = location.hash.slice(1);
    const share = h.match(/(?:^|&)(?:design|prefill)=([A-Za-z0-9_-]+)/);
    if (share) {
      let m = E.decode(share[1]);
      // a design brought over by the language switch: in this edition's units and materials, without the other
      // edition's sample name
      const from = (h.match(/(?:^|&)from=([a-z]{2})/) || [])[1];
      if (m && from && from !== E.getLang()) {
        if (m.units !== E.market().units) m = converted(m, E.market().units);
        if (E.I.LANGS.some(l => E.I.t('sample.name', {}, l) === m.name)) m.name = '';
      }
      if (m) return { m, auto: true };
    }
    return { m: E.sample(), auto: false };
  }
  const init = initial();
  model = init.m;
  PeakLicense.setup(LICENSE);
  pro = PRO_READY && PeakLicense.isPro();
  PeakLicense.onChange(p => { const was = pro; pro = PRO_READY && p; proState(); if (was !== pro) render(); });
  // the licence button was pressed before the scripts arrived: open the dialog now
  window.SimRigReady = true;
  document.querySelectorAll('[data-enter-key][aria-busy]').forEach(b => b.removeAttribute('aria-busy'));
  if (window.SimRigWantsKey) { window.SimRigWantsKey = false; PeakLicense.open(); }
  fillSelects(); fillForm(); visible(); langLinks();
  // the page arrives with the sample already written in (by the build): work it out again only when the browser is
  // idle, so the first paint waits for no script; anything else (a shared link) renders now
  const pre = !init.auto && !pro && $('check-rows').dataset.pre === 'sample';
  if (pre) {
    const warm = () => { if (res) return; res = E.evaluate(model); shopRendered = V.shopSig(res, model.units); };
    window.requestIdleCallback ? requestIdleCallback(warm, { timeout: 2500 }) : setTimeout(warm, 600);
    ensureRes = () => { warm(); return res; };
  } else render();
  proState();
  const intent = () => start3d();
  $('tool').addEventListener('pointerdown', intent, { once: true });
  $('tool').addEventListener('focusin', intent, { once: true });
  if (init.auto) {
    const go = () => (window.requestIdleCallback ? requestIdleCallback(() => start3d(), { timeout: 1500 }) : setTimeout(start3d, 300));
    if (document.readyState === 'complete') go(); else window.addEventListener('load', go, { once: true });
  }
  window.addEventListener('hashchange', () => { const n = initial(); if (n.auto) { model = n.m; shopRendered = ''; fillSelects(); fillForm(); visible(); render(); start3d(); } });
  // for the tests and the offline renderer
  window.SimRigTool = { get model() { return model; }, get result() { return ensureRes(); }, get pro() { return pro; }, start3d, get scene() { return scene; }, setModel(m) { model = E.normalize(m); shopRendered = ''; fillSelects(); fillForm(); visible(); render(); } };
})();
