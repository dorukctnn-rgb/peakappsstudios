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
  const LICENSE = {
    tool: 'sim-rig-designer',
    productId: PRO_READY ? SIM_RIG_PRO_PRODUCT_ID : 'PENDING',
    permalink: 'sim-rig-designer-pro',
    buyUrl: 'https://dorukctn.gumroad.com/l/sim-rig-designer-pro',
    pitch: 'Pro writes the build plan for this exact rig: the optimised cut list with a diagram per board, the aluminium bill of materials cut by cut, DXF files for the wheel, pedal and shifter plates, a step-by-step PDF with your angles and every dimension, saved designs, GLB and OBJ files and large renders. $19, once.',
  };
  const PDFLIB_SRC = '/pay-gap-report/vendor/pdf-lib.min.js';
  const JSZIP_SRC = '/name-cut-files/vendor/jszip.min.js';
  const REPORT_SRC = '/sim-rig-designer/report.js';
  const SCENE_SRC = '/sim-rig-designer/scene.js';

  const E = window.SimRigEngine, D = window.SimRigData, V = window.SimRigView;
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
    $('lumber').innerHTML = D.LUMBER[u].map(l => `<option value="${esc(l.id)}">${esc(l.label)}</option>`).join('');
    $('stock').innerHTML = D.STOCK[u].map(s => `<option value="${s.mm}">${esc(s.label)}</option>`).join('');
    $('sheet').innerHTML = D.SHEETS[u].map(s => `<option value="${esc(s.id)}">${esc(s.label)}</option>`).join('');
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
    const L = E.lumberOf(model); $('lumber-actual').textContent = `Actual size ${L.actual}`;
    $('auto-note').textContent = model.auto ? '' : '(off: you set the positions)';
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
  }
  function renderShop() {
    const sig = V.shopSig(res, model.units);
    if (sig !== shopRendered || !$('shop-rows').children.length) { $('shop-rows').innerHTML = V.shopRows(res, E); shopRendered = sig; }
    else {
      for (const it of res.shop.items) { const c = document.querySelector(`[data-cost="${CSS.escape(it.id)}"]`); if (c) c.textContent = it.cost != null ? V.money(it.cost) : ''; }
      $('shop-total').textContent = res.shop.priced ? V.money(res.shop.total) : '';
    }
    const missing = res.shop.items.length - res.shop.priced;
    $('shop-note').textContent = res.shop.priced ? `${res.shop.priced} of ${res.shop.items.length} lines priced${missing ? `; ${missing} still blank` : ''}.` : 'Prices you type stay in this browser and in your share link.';
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
    $('start3d').disabled = true; $('start3d').lastChild.textContent = 'Loading the 3D view';
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
  function switchUnits(u) {
    const o = model;
    const n = E.fresh(o.build, u, o.style);
    // keep the driver, the gear and the positions; move the materials to their nearest equivalent in the other system
    for (const k of ['driver', 'seat', 'gear', 'screen', 'room', 'rig', 'addons']) n[k] = JSON.parse(JSON.stringify(o[k]));
    for (const k of ['auto', 'name', 'plate']) n[k] = o[k];
    n.lumber = D.SWAP[o.lumber] || n.lumber;
    model = n.auto ? sized(n) : E.normalize(n); model.sample = false;
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
  $('sample').addEventListener('click', () => { model = E.sample(); shopRendered = ''; fillSelects(); fillForm(); visible(); render(); PeakUI.toast('Sample design loaded.'); });
  $('fresh').addEventListener('click', () => {
    const o = model; const n = E.fresh(o.build, o.units, o.style);
    n.room = Object.assign({}, o.room);
    model = sized(n); shopRendered = ''; fillSelects(); fillForm(); visible(); render();
    PeakUI.toast('Your own design: start with your height in step 1.');
    const first = form.querySelector('[data-k="driver.h"]'); if (first) first.focus();
  });
  $('share').addEventListener('click', async () => {
    const url = `${location.origin}${location.pathname}#design=${E.encode(model)}`;
    history.replaceState(null, '', url);
    try { await navigator.clipboard.writeText(url); PeakUI.toast('Share link copied. It holds this design; nothing was uploaded.'); }
    catch (e) { PeakUI.toast('The link is in the address bar. Copy it from there.'); }
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
  const stem = () => `sim-rig-${model.build}-${model.style}-${today()}`;
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
    if (!needPro('The build plan PDF is part of Pro. The design, the checks and the shopping list stay free.')) return;
    const btn = $('x-pdf'), text = btn.textContent;
    try {
      btn.disabled = true; btn.textContent = 'Preparing the plan';
      const [PDFLib, X] = await loadPdf();
      const s = await start3d();
      const pics = await shots(s);
      const bytes = await X.pdf(PDFLib, { res, E, D, shots: pics, both: $('both-units').checked });
      PeakUI.download(new Blob([bytes], { type: 'application/pdf' }), `${stem()}-build-plan.pdf`);
      PeakUI.toast('Build plan downloaded.');
    } catch (e) { console.error(e); PeakUI.toast('The PDF could not be made. Try again, or email us so we can look into it.'); }
    finally { btn.disabled = false; btn.textContent = text; }
  }
  async function doDxf() {
    if (!needPro('The DXF files for the plates are part of Pro.')) return;
    try {
      if (!zipPromise) zipPromise = loadScript(JSZIP_SRC, () => window.JSZip).catch(e => { zipPromise = null; throw e; });
      const JSZip = await zipPromise;
      const zip = new JSZip(), inch = $('dxf-inch').checked;
      const plates = res.design.plates;
      for (const pl of plates) zip.file(`${pl.id}-plate${inch ? '-inches' : '-mm'}.dxf`, E.dxf(pl, { units: inch ? 'in' : 'mm' }));
      const lines = plates.map(pl => `${pl.label}: ${E.len(pl.w, model.units)} x ${E.len(pl.d, model.units)}, ${pl.holes.length} gear ${pl.holes.length === 1 ? 'hole' : 'holes'}${pl.holes.some(h => h.slot) ? ' (slots)' : ''}, ${pl.fixings.length} fixings to the frame. Pattern ${pl.measured ? 'as you measured it' : 'an EXAMPLE: measure your gear first'}.`);
      zip.file('README.txt', [`Sim Rig Designer plates, ${today()}`, `Units: ${inch ? 'inches' : 'millimetres'} (DXF R12). Layers: CUT_OUTLINE, CUT_HOLES, and NOTES (do not cut).`, '', ...lines, '', 'By hand: cut each plate to its size, then drill the gear holes through the full-size drilling templates at the back of the Pro build plan PDF.', 'Check every hole against your gear before you cut. Guidance for a hobby build, not an engineering guarantee.', 'Made with Sim Rig Designer: peakappsstudio.com/sim-rig-designer/'].join('\r\n'));
      const blob = await zip.generateAsync({ type: 'blob' });
      PeakUI.download(blob, `${stem()}-plates-dxf.zip`);
      PeakUI.toast(`${plates.length} DXF files downloaded in a zip.`);
    } catch (e) { console.error(e); PeakUI.toast('The DXF files could not be made. Try again.'); }
  }
  async function doExport(kind) {
    if (!needPro('The 3D files are part of Pro.')) return;
    const s = await start3d(); if (!s) { PeakUI.toast('This browser cannot draw 3D, so the 3D files cannot be made here.'); return; }
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
      PeakUI.toast(`${kind.toUpperCase()} downloaded. Units are metres.`);
    } catch (e) { console.error(e); PeakUI.toast('The file could not be made. Try again.'); }
  }
  async function doRender() {
    if (!needPro('Large renders are part of Pro.')) return;
    const s = await start3d(); if (!s) return;
    const shot = s.snapshot({ width: 2400, height: 1500, view: 'hero', type: 'image/png', theta: -0.8, phi: 1.18, mood: 'dusk' });
    const blob = await (await fetch(shot.url)).blob();
    PeakUI.download(blob, `${stem()}-render.png`);
  }
  $('x-pdf').addEventListener('click', doPdf);
  $('x-dxf').addEventListener('click', doDxf);
  $('x-glb').addEventListener('click', () => doExport('glb'));
  $('x-obj').addEventListener('click', () => doExport('obj'));
  $('x-png').addEventListener('click', doRender);

  // saved designs: Pro, kept in this browser only
  const SAVE_KEY = 'sim-rig-designer:saved';
  const store = { get() { try { return JSON.parse(localStorage.getItem(SAVE_KEY) || '[]'); } catch (e) { return []; } }, set(v) { try { localStorage.setItem(SAVE_KEY, JSON.stringify(v)); } catch (e) { PeakUI.toast('This browser will not keep saved designs (private mode?).'); } } };
  function renderSaved() {
    const list = store.get();
    $('saved-list').innerHTML = list.length ? list.map((x, i) => `<li><span>${esc(x.name)} <span class="sr-small">${esc(x.at)}</span></span><span><button type="button" data-load="${i}">Open</button> <button type="button" data-del="${i}">Delete</button></span></li>`).join('') : '<li>No saved designs yet.</li>';
  }
  $('save').addEventListener('click', () => {
    if (!needPro('Saved designs are part of Pro.')) return;
    const name = ($('save-name').value || model.name || `${E.BUILD_NAME[model.build]} ${today()}`).slice(0, 60);
    const list = store.get().filter(x => x.name !== name);
    list.unshift({ name, code: E.encode(Object.assign({}, model, { name })), at: today() });
    store.set(list.slice(0, 30)); renderSaved(); PeakUI.toast(`Saved as ${name}.`);
  });
  $('saved-list').addEventListener('click', e => {
    const l = e.target.dataset.load, d = e.target.dataset.del;
    if (l == null && d == null) return;
    if (!needPro('Saved designs are part of Pro.')) return;
    const list = store.get();
    if (d != null) { list.splice(Number(d), 1); store.set(list); renderSaved(); return; }
    const m = E.decode(list[Number(l)].code); if (!m) return;
    model = m; shopRendered = ''; fillSelects(); fillForm(); visible(); render(); PeakUI.toast(`Opened ${m.name}.`);
  });

  // the cut list (wood) or the cuts by profile (aluminium), and the plates, drawn on the page for Pro
  function svgBoards(r) {
    const u = r.m.units, boards = r.cut.boards;
    const W = 720, rowH = 30;
    const maxStock = Math.max(...boards.map(b => b.stock));
    const sc = (W - 10) / maxStock;
    let y = 4; const parts = [];
    for (const b of boards) {
      parts.push(`<text x="0" y="${y + 11}" font-size="12" fill="currentColor">Board ${b.n}, ${esc(r.design.lumber.label)} x ${esc(E.stockLabel(b.stock, u))}: ${b.cuts.length} ${b.cuts.length === 1 ? 'cut' : 'cuts'}, ${esc(E.len(b.leftover, u))} left over</text>`);
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
    return `<svg class="sr-diagram" viewBox="0 0 ${W} ${y}" role="img" aria-label="Cutting diagram: each board drawn to scale with its cuts"><defs><pattern id="sr-hatch" width="6" height="6" patternUnits="userSpaceOnUse" patternTransform="rotate(45)"><rect width="6" height="6" fill="#f6f6fa"/><line x1="0" y1="0" x2="0" y2="6" stroke="#77748a" stroke-width="1.2"/></pattern></defs>${parts.join('')}</svg>`;
  }
  function aluTable(r) {
    const u = r.m.units, rows = [];
    for (const s of r.bom.sections) {
      rows.push(`<tr class="sr-group"><td colspan="3">${esc(s.profile.label)}: ${(s.total / 1000).toFixed(2)} m in ${s.n} pieces, about ${s.kg.toFixed(1)} kg</td></tr>`);
      for (const c of s.cuts) rows.push(`<tr><td><b>${esc(E.len(c.len, u))}</b>${c.angled ? ' <span class="sr-small">(angled ends)</span>' : ''}</td><td data-h="Pieces" class="num">${c.qty}</td><td data-h="Where">${esc(c.where)}</td></tr>`);
    }
    return `<table class="sr-table"><caption>Order these cut to length, or cut them from 1, 2 and 3 m lengths with a 3 mm kerf.</caption><thead><tr><th scope="col">Length</th><th scope="col" class="num">Pieces</th><th scope="col">Where</th></tr></thead><tbody>${rows.join('')}</tbody></table>`;
  }
  function svgPlate(pl) {
    const sc = 240 / Math.max(pl.w, pl.d), w = pl.w * sc, h = pl.d * sc;
    const holes = pl.holes.concat(pl.fixings).map(hh => hh.slot ? `<rect x="${((hh.x - hh.d / 2) * sc).toFixed(1)}" y="${(h - (hh.y + hh.slot / 2 + hh.d / 2) * sc).toFixed(1)}" width="${(hh.d * sc).toFixed(1)}" height="${((hh.slot + hh.d) * sc).toFixed(1)}" rx="${(hh.d / 2 * sc).toFixed(1)}" fill="#fff" stroke="#17151d" stroke-width="0.8"/>` : `<circle cx="${(hh.x * sc).toFixed(1)}" cy="${(h - hh.y * sc).toFixed(1)}" r="${Math.max(1, hh.d / 2 * sc).toFixed(1)}" fill="#fff" stroke="#17151d" stroke-width="0.8"/>`).join('');
    return `<figure class="sr-plate"><svg class="sr-diagram" viewBox="-4 -4 ${(w + 8).toFixed(1)} ${(h + 8).toFixed(1)}" style="max-width:${Math.round(w + 8)}px" role="img" aria-label="${esc(pl.label)}, ${Math.round(pl.w)} by ${Math.round(pl.d)} mm"><rect x="0" y="0" width="${w.toFixed(1)}" height="${h.toFixed(1)}" rx="${(pl.r * sc).toFixed(1)}" fill="#e8cfa3" stroke="#17151d" stroke-width="1"/>${holes}</svg><figcaption>${esc(pl.label)}: ${esc(E.len(pl.w, model.units))} x ${esc(E.len(pl.d, model.units))}${pl.measured ? '' : ', example holes'}</figcaption></figure>`;
  }
  function proRender() {
    if (!pro || !res) return;
    const u = model.units;
    if (model.build === 'alu') $('cut-diagrams').innerHTML = `<h3>Aluminium profile: ${res.bom.sections.reduce((a, s) => a + s.n, 0)} pieces</h3>${aluTable(res)}<p class="sr-small">${res.bom.brackets} corner brackets, ${res.bom.hinges} angle brackets for the braces, ${res.bom.tnuts} T-nuts and ${res.bom.bolts} bolts, ${res.bom.caps.p4040 + res.bom.caps.p4080} end caps.</p>`;
    else $('cut-diagrams').innerHTML = `<h3>Cut list: ${res.cut.boards.length} boards</h3><p class="sr-small">Packed first-fit decreasing with a ${esc(E.len(res.cut.kerf, u))} saw kerf, keeping ${esc(E.len(res.cut.trim, u))} on each board to square its end; ${Math.round(res.cut.waste * 100)}% of the wood bought is left over, in the hatched ends.</p>${svgBoards(res)}`;
    $('plate-diagrams').innerHTML = `<h3>Plates: ${res.design.plates.length} DXF files</h3><div class="sr-plates">${res.design.plates.map(svgPlate).join('')}</div>`;
  }
  function proState() {
    $('locked').querySelectorAll('li').forEach(li => { li.classList.toggle('is-open', pro); li.querySelector('em').textContent = pro ? 'Active' : 'Pro'; });
    $('pro-work').hidden = !pro;
    if (pro) renderSaved();
  }

  // ---------- start ----------
  function initial() {
    const h = location.hash.slice(1);
    const share = h.match(/(?:^|&)(?:design|prefill)=([A-Za-z0-9_-]+)/);
    if (share) { const m = E.decode(share[1]); if (m) return { m, auto: true }; }
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
  fillSelects(); fillForm(); visible();
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
