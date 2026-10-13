/* Coop Designer: page logic. Engine: engine.js (window.CoopEngine) over data.js (window.CoopData); the sun slider uses
 * SunCalc (shared from /catio-designer/vendor/). Nothing typed here leaves the browser: the share link keeps the design
 * after the # sign. The 3D scene (scene.js and three.js) loads only when the 3D view starts; the PDF code, pdf-lib and
 * the 3D exporters only when a Pro user asks for them. */
(function () {
  'use strict';

  // ---- Gumroad Pro product, permalink coop-designer-pro. The licence check sends the product id, never the
  // permalink. Fail closed: while this is 'PENDING' (or empty) Pro never turns on, whatever the browser has stored.
  const COOP_PRO_PRODUCT_ID = 'WcX4Mrulv7hK9DysZs-tqA==';
  const PRO_READY = !!COOP_PRO_PRODUCT_ID && COOP_PRO_PRODUCT_ID !== 'PENDING';
  const LICENSE = {
    tool: 'coop-designer',
    productId: PRO_READY ? COOP_PRO_PRODUCT_ID : 'PENDING',
    permalink: 'coop-designer-pro',
    buyUrl: 'https://dorukctn.gumroad.com/l/coop-designer-pro',
    pitch: 'Pro writes the build plan for this exact coop: the optimised cut list with a diagram per board, the hardware cloth cut to your roll with the apron, a step-by-step PDF with elevations and exploded views, the add-ons, saved designs, GLB and OBJ files and large renders. $19, once.',
  };
  const PDFLIB_SRC = '/pay-gap-report/vendor/pdf-lib.min.js';
  const REPORT_SRC = '/coop-designer/report.js';
  const SCENE_SRC = '/coop-designer/scene.js';

  const E = window.CoopEngine, D = window.CoopData, V = window.CoopView;
  const $ = id => document.getElementById(id);
  const esc = s => V.esc(s);
  const form = $('form');
  const get = (o, path) => path.split('.').reduce((a, k) => (a == null ? a : a[k]), o);
  function set(o, path, v) { const ks = path.split('.'); let t = o; ks.slice(0, -1).forEach(k => { if (t[k] == null || typeof t[k] !== 'object') t[k] = {}; t = t[k]; }); t[ks[ks.length - 1]] = v; }
  const SunCalc = () => window.SunCalc || null;

  let model = null, res = null, scene = null, sceneLoading = null, glBroken = false, pro = false;
  let ensureRes = () => res;

  // ---------- the selects that depend on the units ----------
  function fillSelects() {
    const u = model.units;
    $('lumber').innerHTML = D.LUMBER[u].map(l => `<option value="${esc(l.id)}">${esc(l.label)}</option>`).join('');
    $('stock').innerHTML = D.STOCK[u].map(s => `<option value="${s.mm}">${esc(s.label)}</option>`).join('');
    $('mesh').innerHTML = D.MESH.map(me => `<option value="${esc(me.id)}">${esc(me.label)}</option>`).join('');
  }
  // ---------- model to form, form to model ----------
  function fillOne(el) {
    const k = el.dataset.k, t = el.dataset.t, v = get(model, k);
    if (t === 'bool') el.checked = !!v;
    else if (t === 'len') el.value = v == null || v === '' ? '' : E.toInput(v, model.units);
    else el.value = v == null ? '' : String(v);
  }
  function fillForm(skip) {
    form.querySelectorAll('[data-k]').forEach(el => { if (el !== skip) fillOne(el); });
    document.querySelectorAll('#addons [data-k]').forEach(el => { if (el !== skip) fillOne(el); });
    form.querySelectorAll('[data-seg]').forEach(seg => { const v = String(get(model, seg.dataset.seg)); seg.querySelectorAll('button').forEach(b => b.setAttribute('aria-pressed', String(b.dataset.v === v))); });
    document.querySelectorAll('input[name="type"]').forEach(r => { r.checked = r.value === model.type; });
    document.querySelectorAll('[data-unit]').forEach(i => { i.textContent = model.units === 'metric' ? 'cm' : 'in'; });
    const L = E.lumberOf(model); $('lumber-actual').textContent = `Actual size ${L.actual}`;
    const me = E.meshOf(model);
    const native = r => (Math.abs(r[0] / 25.4 - Math.round(r[0] / 25.4)) > 1e-6 ? `${Math.round(r[0])} mm x ${r[1] / 1000} m` : `${E.len(r[0], 'imperial')} x ${E.len(r[1], 'imperial', 'dim')}`);
    $('roll-note').textContent = me && me.rolls.length ? `Listed rolls: ${me.rolls.map(native).join(', ')}` : 'Enter the roll you buy';
    document.querySelector('[data-label="rl"]').textContent = model.type === 'house' ? 'Run length, the house end included' : 'Run length beside the coop';
    document.querySelector('[data-label="cw"]').textContent = model.type === 'house' ? 'Hen house width' : 'Coop width';
    $('auto-note').textContent = model.auto ? '' : '(off: you set the sizes)';
  }
  function readField(el) {
    const k = el.dataset.k, t = el.dataset.t;
    let v;
    if (t === 'bool') v = el.checked;
    else if (t === 'len') { if (el.value === '') return false; v = E.fromInput(el.value, model.units); if (!Number.isFinite(v)) return false; }
    else if (t === 'num' || t === 'int') { if (el.value === '') return false; v = Number(el.value); if (!Number.isFinite(v)) return false; }
    else v = el.value;
    if (k.startsWith('addons.') && !pro) return false;
    set(model, k, v);
    if (k === 'mesh') model.roll = E.defaultRoll(v, model.units);
    if (el.hasAttribute('data-size')) model.auto = false;   // a size typed by hand stops the automatic sizing
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
  function visible() { document.querySelectorAll('[data-show]').forEach(el => { el.hidden = !cond(el.dataset.show); }); }
  // when the automatic sizing is on, the sizes follow the flock and the yard
  const sized = m => E.normalize(E.sizeFor(E.normalize(m)));

  // Pro add-ons only count with Pro: a shared link that has them shows them with Pro and without them otherwise
  function gated() { if (pro) return model; const m = JSON.parse(JSON.stringify(model)); for (const a of Object.values(m.addons)) a.on = false; return m; }

  // ---------- render (the rows come from view.js, which the build also uses to write the sample into the page) ----------
  let shopRendered = '';
  function render() {
    res = E.evaluate(gated());
    $('design-title').textContent = V.title(model, E);
    $('design-sub').textContent = V.summary(res, E);
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
    res = E.evaluate(gated());
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
      scene = mod.createScene(canvas, { labels: $('tags') });
      scene.update(Object.assign({ E }, res));
      setSun();
      $('poster').hidden = true; $('start3d').hidden = true; $('toolbar').hidden = false;
      return scene;
    }).catch(err => { console.error(err); glBroken = true; $('gl-note').hidden = false; $('start3d').hidden = true; return null; });
    return sceneLoading;
  }
  let sceneT = 0;
  function queueScene() { if (!scene) return; clearTimeout(sceneT); sceneT = setTimeout(() => { scene.update(Object.assign({ E }, res)); setSun(); }, 90); }
  // the sun over a June day at 40 degrees north, the coop's front to the south
  function setSun() {
    if (!scene) return;
    const h = Number($('sun').value);
    $('sun-out').textContent = `${String(Math.floor(h)).padStart(2, '0')}:${h % 1 ? '30' : '00'}`;
    const S = SunCalc();
    if (!S) return;
    const p = S.getPosition(new Date(Date.UTC(2026, 5, 21, Math.floor(h), (h % 1) * 60)), 40, 0);
    scene.setSun(p.altitude * 180 / Math.PI, (p.azimuth * 180 / Math.PI + 180 + 360) % 360, 180);
  }
  $('sun').addEventListener('input', setSun);
  $('modes').addEventListener('click', e => {
    const b = e.target.closest('[data-mode]'); if (!b || !scene) return;
    $('modes').querySelectorAll('button').forEach(x => x.setAttribute('aria-pressed', String(x === b)));
    scene.setMode(b.dataset.mode);
  });
  // the hen's way from the run to the roost, with the size of each step from the checks
  $('henpath').addEventListener('click', () => start3d().then(s => {
    if (!s) return; ensureRes();
    $('modes').querySelectorAll('button').forEach(x => x.setAttribute('aria-pressed', String(x.dataset.mode === 'full')));
    const st = id => { const r = res.checks.find(x => x.id === id); return r ? r.status : 'info'; };
    const d = res.design, u = model.units;
    const tags = {
      ramp: d.ramp ? { text: `Ramp ${Math.round(d.ramp.angle)} degrees`, tone: 'dim' } : null,
      pop: { text: `Pop door ${E.len(d.pop.w, u)} x ${E.len(d.pop.h, u)}`, tone: 'dim' },
      nest: { text: `Nest box ${E.len(d.nests ? d.nests.y : 0, u)} up`, tone: st('nest-height') },
      roost: { text: `Roost ${E.len(d.roosts ? d.roosts.h : 0, u)} up`, tone: st('roost-height') },
    };
    s.walkHen(tags);
    const flagged = ['nest-height', 'roost-height', 'roost-length'].filter(id => ['check', 'fail'].includes(st(id)));
    PeakUI.toast(flagged.length ? `The hen path has ${flagged.length} ${flagged.length === 1 ? 'step' : 'steps'} to look at: ${flagged.map(id => res.checks.find(x => x.id === id).title.toLowerCase()).join(', ')}.` : 'The hen walks up the ramp, lays in the nest box and roosts above it: every step fits the guides.');
  }));

  // ---------- events ----------
  let t = 0;
  const schedule = () => { clearTimeout(t); t = setTimeout(() => { if (model.auto) { model = sized(model); fillForm(document.activeElement); } visible(); render(); }, 80); };
  form.addEventListener('input', e => { const el = e.target; if (el.dataset && el.dataset.k && readField(el)) schedule(); });
  form.addEventListener('change', e => {
    const el = e.target; if (!(el.dataset && el.dataset.k)) return;
    readField(el);
    model = model.auto ? sized(model) : E.normalize(model);
    if (el.dataset.k === 'mesh') fillSelects();
    fillForm(); visible(); render();
  });
  $('addons').addEventListener('change', e => {
    const el = e.target; if (!(el.dataset && el.dataset.k)) return;
    if (!(PRO_READY && PeakLicense.requirePro('The add-ons are part of Pro. The design, the checks and the shopping list stay free.'))) { fillForm(); return; }
    readField(el); model = model.auto ? sized(model) : E.normalize(model); fillForm(); visible(); render();
  });
  form.addEventListener('click', e => {
    const b = e.target.closest('[data-seg] button'); if (!b) return;
    if (b.dataset.v !== model.units) switchUnits(b.dataset.v);
  });
  function switchUnits(u) {
    const o = model;
    const n = E.fresh(o.type, u);
    // keep the flock, the yard and the sizes; move the materials to their nearest equivalent in the other system
    for (const k of ['birds', 'size', 'climate', 'predators', 'auto', 'nests', 'roostH', 'roof', 'top', 'window', 'name']) n[k] = o[k];
    for (const k of ['yard', 'coop', 'run', 'af', 'tr', 'apron']) n[k] = JSON.parse(JSON.stringify(o[k]));
    n.addons = JSON.parse(JSON.stringify(o.addons));
    n.lumber = D.SWAP[o.lumber] || n.lumber;
    if (o.mesh === 'hc12-19' && u === 'metric') n.mesh = 'wm13-19'; else if (o.mesh === 'wm13-19' && u === 'imperial') n.mesh = 'hc12-19';
    else if (o.mesh === 'poultry' && u === 'metric') n.mesh = 'poultry25'; else if (o.mesh === 'poultry25' && u === 'imperial') n.mesh = 'poultry'; else n.mesh = o.mesh;
    n.roll = E.defaultRoll(n.mesh, u);
    model = n.auto ? sized(n) : E.normalize(n); model.sample = false;
    shopRendered = '';
    fillSelects(); fillForm(); visible(); render();
  }
  document.querySelectorAll('input[name="type"]').forEach(r => r.addEventListener('change', () => {
    if (!r.checked || r.value === model.type) return;
    const o = model, n = E.fresh(r.value, o.units);
    for (const k of ['birds', 'size', 'climate', 'predators', 'name']) n[k] = o[k];
    n.yard = Object.assign({}, o.yard); n.auto = true;
    model = sized(n); shopRendered = '';
    fillSelects(); fillForm(); visible(); render();
    start3d();
  }));
  $('start3d').addEventListener('click', () => start3d());
  $('sample').addEventListener('click', () => { model = E.sample(); shopRendered = ''; fillSelects(); fillForm(); visible(); render(); PeakUI.toast('Sample design loaded.'); });
  $('fresh').addEventListener('click', () => {
    const o = model; const n = E.fresh(o.type, o.units);
    n.yard = Object.assign({}, o.yard); n.climate = o.climate; n.predators = o.predators;
    model = sized(n); shopRendered = ''; fillSelects(); fillForm(); visible(); render();
    PeakUI.toast('Your own design: start with your flock in step 1.');
    const first = form.querySelector('[data-k="birds"]'); if (first) first.focus();
  });
  $('share').addEventListener('click', async () => {
    const url = `${location.origin}${location.pathname}#design=${E.encode(model)}`;
    history.replaceState(null, '', url);
    try { await navigator.clipboard.writeText(url); PeakUI.toast('Share link copied. It holds this design; nothing was uploaded.'); }
    catch (e) { PeakUI.toast('The link is in the address bar. Copy it from there.'); }
  });
  $('print').addEventListener('click', () => {
    document.body.classList.add('co-print-shop');
    const done = () => { document.body.classList.remove('co-print-shop'); window.removeEventListener('afterprint', done); };
    window.addEventListener('afterprint', done);
    window.print();
    setTimeout(done, 1500);
  });

  // ---------- Pro ----------
  let pdfLibPromise = null, reportPromise = null;
  const loadScript = (src, test) => (test() ? Promise.resolve(test()) : new Promise((resolve, reject) => {
    const el = document.createElement('script'); el.src = src;
    el.onload = () => (test() ? resolve(test()) : reject(new Error(src + ' did not load')));
    el.onerror = () => reject(new Error(src + ' did not load'));
    document.head.appendChild(el);
  }));
  function loadPdf() {
    if (!pdfLibPromise) pdfLibPromise = loadScript(PDFLIB_SRC, () => window.PDFLib).catch(e => { pdfLibPromise = null; throw e; });
    if (!reportPromise) reportPromise = loadScript(REPORT_SRC, () => window.CoopReport).catch(e => { reportPromise = null; throw e; });
    return Promise.all([pdfLibPromise, reportPromise]);
  }
  const today = () => { const d = new Date(); return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`; };
  const stem = () => `coop-${model.type}-${today()}`;
  const needPro = why => PRO_READY && PeakLicense.requirePro(why);
  async function shots(s) {
    if (!s) return { views: [], steps: [] };
    const views = [Object.assign({ label: 'iso' }, s.snapshot({ width: 1400, height: 900, view: 'iso', type: 'image/jpeg', quality: 0.86 }))];
    const steps = res.steps.map(st => Object.assign({ n: st.n }, s.snapshot({ width: 1000, height: 680, view: 'iso', type: 'image/jpeg', quality: 0.82, upTo: st.n, hi: st.n, explodeBy: 1, henOn: false, envOn: false })));
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
    const shot = s.snapshot({ width: 2400, height: 1500, view: 'hero', type: 'image/png' });
    const blob = await (await fetch(shot.url)).blob();
    PeakUI.download(blob, `${stem()}-render.png`);
  }
  $('x-pdf').addEventListener('click', doPdf);
  $('x-glb').addEventListener('click', () => doExport('glb'));
  $('x-obj').addEventListener('click', () => doExport('obj'));
  $('x-png').addEventListener('click', doRender);

  // saved designs: Pro, kept in this browser only
  const SAVE_KEY = 'coop-designer:saved';
  const store = { get() { try { return JSON.parse(localStorage.getItem(SAVE_KEY) || '[]'); } catch (e) { return []; } }, set(v) { try { localStorage.setItem(SAVE_KEY, JSON.stringify(v)); } catch (e) { PeakUI.toast('This browser will not keep saved designs (private mode?).'); } } };
  function renderSaved() {
    const list = store.get();
    $('saved-list').innerHTML = list.length ? list.map((x, i) => `<li><span>${esc(x.name)} <span class="co-small">${esc(x.at)}</span></span><span><button type="button" data-load="${i}">Open</button> <button type="button" data-del="${i}">Delete</button></span></li>`).join('') : '<li>No saved designs yet.</li>';
  }
  $('save').addEventListener('click', () => {
    if (!needPro('Saved designs are part of Pro.')) return;
    const name = ($('save-name').value || model.name || `${E.TYPE_NAME[model.type]} ${today()}`).slice(0, 60);
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

  // the cut list and the hardware-cloth layout, drawn on the page for Pro
  function svgBoards(r) {
    const u = r.m.units, boards = r.cut.boards;
    const W = 720, rowH = 30;
    const maxStock = Math.max(...boards.map(b => b.stock));
    const sc = (W - 10) / maxStock;
    let y = 4; const parts = [];
    for (const b of boards) {
      const sec = r.cut.sections.find(s => s.sec === b.sec);
      parts.push(`<text x="0" y="${y + 11}" font-size="12" fill="currentColor">Board ${b.n}, ${esc(sec ? sec.lumber.label : b.sec)} x ${esc(E.stockLabel(b.stock, u))}: ${b.cuts.length} ${b.cuts.length === 1 ? 'cut' : 'cuts'}, ${esc(E.len(b.leftover, u))} left over</text>`);
      y += 16; let x = 0;
      for (const c of b.cuts) {
        const w = c.len * sc;
        parts.push(`<rect x="${x.toFixed(1)}" y="${y}" width="${Math.max(1, w - 1).toFixed(1)}" height="${rowH}" fill="#d9a35f" stroke="#2e1a12" stroke-width="0.8"/>`);
        if (w > 44) parts.push(`<text x="${(x + w / 2).toFixed(1)}" y="${y + 19}" font-size="11.5" text-anchor="middle" fill="#2e1a12">${esc(E.len(c.len, u))}</text>`);
        x += w + r.cut.kerf * sc;
      }
      const lw = b.stock * sc - x;
      if (lw > 1) parts.push(`<rect x="${x.toFixed(1)}" y="${y}" width="${lw.toFixed(1)}" height="${rowH}" fill="url(#co-hatch)" stroke="#8a776b" stroke-width="0.8"/>`);
      y += rowH + 10;
    }
    return `<svg class="co-diagram" viewBox="0 0 ${W} ${y}" role="img" aria-label="Cutting diagram: each board drawn to scale with its cuts"><defs><pattern id="co-hatch" width="6" height="6" patternUnits="userSpaceOnUse" patternTransform="rotate(45)"><rect width="6" height="6" fill="#f2f9f6"/><line x1="0" y1="0" x2="0" y2="6" stroke="#8a776b" stroke-width="1.2"/></pattern></defs>${parts.join('')}</svg>`;
  }
  function svgMesh(r) {
    const u = r.m.units, out = [];
    for (const f of r.mesh.faces) for (const [ri, rr] of f.rects.entries()) {
      const rect = rr.rect, hmax = Math.max(rect.h0, rect.h1);
      const sc = 220 / Math.max(rect.w, hmax), w = rect.w * sc, h = hmax * sc;
      const strips = rr.strips.map((s, i) => rr.orient === 'vertical'
        ? `<rect x="${(s.at * sc).toFixed(1)}" y="${(h - s.len * sc).toFixed(1)}" width="${(s.cover * sc).toFixed(1)}" height="${(s.len * sc).toFixed(1)}" fill="${i % 2 ? '#9bc53d40' : '#ffb00040'}" stroke="#2e1a12" stroke-width="0.8"/>`
        : `<rect x="0" y="${(h - (s.at + s.cover) * sc).toFixed(1)}" width="${(s.len * sc).toFixed(1)}" height="${(s.cover * sc).toFixed(1)}" fill="${i % 2 ? '#9bc53d40' : '#ffb00040'}" stroke="#2e1a12" stroke-width="0.8"/>`).join('');
      const outline = `<polygon points="0,${h} ${w},${h} ${w},${(h - rect.h1 * sc).toFixed(1)} 0,${(h - rect.h0 * sc).toFixed(1)}" fill="none" stroke="#d9a35f" stroke-width="2.4"/>`;
      out.push(`<figure class="co-board"><svg class="co-diagram" viewBox="-4 -4 ${w + 8} ${h + 8}" style="max-width:${Math.round(w + 8)}px" role="img" aria-label="${esc(f.label)}: ${rr.strips.length} ${rr.orient} strips">${strips}${outline}</svg><figcaption>${esc(f.label)}${f.rects.length > 1 ? `, part ${ri + 1}` : ''}: ${rr.strips.length} ${rr.orient} ${rr.strips.length === 1 ? 'strip' : 'strips'} (${rr.strips.map(s => esc(E.len(s.len, u))).join(', ')})</figcaption></figure>`);
    }
    if (r.mesh.apronCuts.length) out.push(`<figure class="co-board"><figcaption><b>Apron (${esc(r.design.apron.label.toLowerCase())}):</b> ${r.mesh.apronCuts.map(c => `${esc(E.len(c.len, u, 'dim'))}, ${esc(c.where.replace(/^Apron, /, ''))}`).join('; ')}</figcaption></figure>`);
    return out.join('');
  }
  function proRender() {
    if (!pro || !res) return;
    const u = model.units;
    $('cut-diagrams').innerHTML = `<h3>Cut list: ${res.cut.boards.length} boards</h3><p class="co-small">Packed first-fit decreasing with a ${esc(E.len(res.cut.kerf, u))} saw kerf, keeping ${esc(E.len(res.cut.trim, u))} on each board to square its end; ${Math.round(res.cut.waste * 100)}% of the wood bought is left over, in the hatched ends.</p>${svgBoards(res)}`;
    $('mesh-diagrams').innerHTML = `<h3>Hardware cloth: ${res.mesh.count} ${res.mesh.count === 1 ? 'roll' : 'rolls'} of ${esc(E.len(model.roll.w, u))} x ${esc(E.len(model.roll.l, u, 'dim'))}</h3><div style="display:flex;flex-wrap:wrap;gap:12px 20px">${svgMesh(res)}</div>`;
  }
  function proState() {
    $('locked').querySelectorAll('li').forEach(li => { li.classList.toggle('is-open', pro); li.querySelector('em').textContent = pro ? 'Active' : 'Pro'; });
    $('addons').disabled = !pro;
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
  window.CoopReady = true;
  document.querySelectorAll('[data-enter-key][aria-busy]').forEach(b => b.removeAttribute('aria-busy'));
  if (window.CoopWantsKey) { window.CoopWantsKey = false; PeakLicense.open(); }
  fillSelects(); fillForm(); visible();
  // the page arrives with the sample already written in (by the build): work it out again only when the browser is
  // idle, so the first paint waits for no script; anything else (a shared link) renders now
  const pre = !init.auto && !pro && $('check-rows').dataset.pre === 'sample';
  if (pre) {
    const warm = () => { if (res) return; res = E.evaluate(gated()); shopRendered = V.shopSig(res, model.units); };
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
  window.CoopTool = { get model() { return model; }, get result() { return ensureRes(); }, get pro() { return pro; }, start3d, get scene() { return scene; }, setModel(m) { model = E.normalize(m); shopRendered = ''; fillSelects(); fillForm(); visible(); render(); } };
})();
