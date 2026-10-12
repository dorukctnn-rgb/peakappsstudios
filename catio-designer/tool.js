/* Catio Designer: page logic. Engine: engine.js (window.CatioEngine) over data.js (window.CatioData); shade from
 * SunCalc (vendor/suncalc.js). Nothing typed here leaves the browser: the share link keeps the design after the # sign,
 * the city list is a file on this site. The 3D scene (scene.js and three.js) loads only when the 3D view starts; the
 * PDF code, pdf-lib and the 3D exporters only when a Pro user asks for them. */
(function () {
  'use strict';

  // ---- Gumroad Pro product, permalink catio-designer-pro. The licence check sends the product id, never the
  // permalink. Fail closed: while this is 'PENDING' (or empty) Pro never turns on, whatever the browser has stored.
  const CATIO_PRO_PRODUCT_ID = 'NAxDLXljUOazAKiV3GgTDQ==';
  const PRO_READY = !!CATIO_PRO_PRODUCT_ID && CATIO_PRO_PRODUCT_ID !== 'PENDING';
  const LICENSE = {
    tool: 'catio-designer',
    productId: PRO_READY ? CATIO_PRO_PRODUCT_ID : 'PENDING',
    permalink: 'catio-designer-pro',
    buyUrl: 'https://dorukctn.gumroad.com/l/catio-designer-pro',
    pitch: 'Pro writes the build plan for this exact catio: the optimised cut list with a diagram per board, the mesh cut to your roll, a step-by-step PDF with elevations and exploded views, the add-ons, saved designs, GLB and OBJ files and large renders. $19, once.',
  };
  const PDFLIB_SRC = '/pay-gap-report/vendor/pdf-lib.min.js';
  const REPORT_SRC = '/catio-designer/report.js';
  const SCENE_SRC = '/catio-designer/scene.js';

  const E = window.CatioEngine, D = window.CatioData;
  const $ = id => document.getElementById(id);
  const esc = s => window.CatioView.esc(s);
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
    $('mesh').innerHTML = D.MESH.map(me => `<option value="${esc(me.id)}">${esc(me.label)}</option>`).join('') + '<option value="custom">Another mesh: enter its opening and gauge</option>';
  }
  // ---------- model to form, form to model ----------
  function fillForm(skip) {
    form.querySelectorAll('[data-k]').forEach(el => {
      if (el === skip) return;
      const k = el.dataset.k, t = el.dataset.t, v = get(model, k);
      if (t === 'bool') el.checked = !!v;
      else if (t === 'len') el.value = v == null || v === '' ? '' : E.toInput(v, model.units);
      else el.value = v == null ? '' : String(v);
    });
    document.querySelectorAll('#addons [data-k]').forEach(el => {
      const k = el.dataset.k, t = el.dataset.t, v = get(model, k);
      if (t === 'bool') el.checked = !!v; else if (t === 'len') el.value = E.toInput(v, model.units); else el.value = v == null ? '' : String(v);
    });
    form.querySelectorAll('[data-seg]').forEach(seg => { const v = String(get(model, seg.dataset.seg)); seg.querySelectorAll('button').forEach(b => b.setAttribute('aria-pressed', String(b.dataset.v === v))); });
    document.querySelectorAll('input[name="type"]').forEach(r => { r.checked = r.value === model.type; });
    document.querySelectorAll('[data-unit]').forEach(i => { i.textContent = model.units === 'metric' ? 'cm' : 'in'; });
    const L = E.lumberOf(model); $('lumber-actual').textContent = `Actual size ${L.actual}`;
    const me = E.meshOf(model);
    const native = r => (Math.abs(r[0] % 100) < 1e-6 ? `${Math.round(r[0])} mm x ${r[1] / 1000} m` : `${E.len(r[0], 'imperial')} x ${E.len(r[1], 'imperial', 'dim')}`);
    $('roll-note').textContent = me && me.rolls && me.rolls.length ? `Listed rolls: ${me.rolls.map(native).join(', ')}` : 'Enter the roll you buy';
    const labels = { window: ['Width of the box', 'Height at the wall'], leanto: ['Width along the wall', 'Height at the wall'], free: ['Width', 'Height at the back'], balcony: ['Width along the wall', 'Floor to ceiling'] }[model.type];
    document.querySelector('[data-label="w"]').textContent = labels[0];
    document.querySelector('[data-label="h"]').textContent = model.type === 'balcony' && !model.bal.ceiling ? 'Height at the wall' : labels[1];
  }
  function readField(el) {
    const k = el.dataset.k, t = el.dataset.t;
    let v;
    if (t === 'bool') v = el.checked;
    else if (t === 'len') { if (el.value === '') return false; v = E.fromInput(el.value, model.units); if (!Number.isFinite(v)) return false; }
    else if (t === 'num' || t === 'int') { if (el.value === '') v = k === 'lat' ? null : get(model, k); else v = Number(el.value); if (v !== null && !Number.isFinite(v)) return false; }
    else v = el.value;
    if (k.startsWith('addons.') && !pro) return false;
    set(model, k, v);
    if (k === 'mesh') { model.roll = E.defaultRoll(v, model.units); }
    if (k === 'lat') { model.city = ''; $('city').value = ''; }
    model.sample = false;
    return true;
  }
  function cond(expr) {
    return expr.split('|').some(c => {
      const neg = c.startsWith('!'); const s = neg ? c.slice(1) : c;
      let r;
      if (s === 'ceiling') r = model.type === 'balcony' && model.bal.ceiling;
      else if (s === 'tunnel') r = model.type === 'free' && model.tunnel.l > 0;
      else if (s === 'door') r = !!model.door;
      else if (s === 'roofed') r = !(model.type === 'balcony' && model.bal.ceiling) && model.roof !== 'none';
      else if (s === 'panels') r = !(model.type === 'balcony' && model.bal.ceiling) && (model.roof === 'poly' || model.roof === 'solid');
      else if (s.includes('=')) { const [k, v] = s.split('='); r = String(get(model, k)) === v; }
      else r = !!get(model, s);
      return neg ? !r : r;
    });
  }
  function visible() { document.querySelectorAll('[data-show]').forEach(el => { el.hidden = !cond(el.dataset.show); }); }

  // Pro add-ons only count with Pro: a shared link that has them shows them with Pro and without them otherwise
  function gated() { if (pro) return model; const m = JSON.parse(JSON.stringify(model)); for (const a of Object.values(m.addons)) a.on = false; return m; }

  // ---------- render (the rows come from view.js, which the build also uses to write the sample into the page) ----------
  const V = window.CatioView;
  let shopRendered = '';
  function render() {
    res = E.evaluate(gated(), { SunCalc: SunCalc() });
    const m = res.m;
    $('design-title').textContent = V.title(model, E);
    $('design-sub').textContent = V.summary(res, E);
    $('counts').innerHTML = V.counts(res.counts);
    $('badge').hidden = !model.sample; $('sample-note').hidden = !model.sample;
    $('door-note').textContent = m.type !== 'window' && !E.doorFits(Object.assign({}, m)) ? `(needs a front ${m.units === 'metric' ? '1680 mm' : '66 in'} tall)` : '';
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
    if (!shopRendered) ensureRes();
    res = E.evaluate(gated(), { SunCalc: SunCalc() });
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
      scene = mod.createScene(canvas, { labels: $('tags'), onCatDone: () => {} });
      scene.update(Object.assign({ E }, res));
      setSun();
      $('poster').hidden = true; $('start3d').hidden = true; $('toolbar').hidden = false;
      return scene;
    }).catch(err => { console.error(err); glBroken = true; $('gl-note').hidden = false; $('start3d').hidden = true; return null; });
    return sceneLoading;
  }
  let sceneT = 0;
  function queueScene() { if (!scene) return; clearTimeout(sceneT); sceneT = setTimeout(() => { scene.update(Object.assign({ E }, res)); setSun(); }, 90); }
  function setSun() {
    if (!scene) return;
    const h = Number($('sun').value), lat = model.lat == null ? 40 : model.lat;
    $('sun-out').textContent = `${String(Math.floor(h)).padStart(2, '0')}:${h % 1 ? '30' : '00'}`;
    const S = SunCalc();
    if (!S) return;
    const p = S.getPosition(new Date(Date.UTC(2026, lat < 0 ? 11 : 5, 21, Math.floor(h), (h % 1) * 60)), lat, 0);
    scene.setSun(p.altitude * 180 / Math.PI, (p.azimuth * 180 / Math.PI + 180 + 360) % 360, model.facing);
  }
  $('sun').addEventListener('input', setSun);
  $('modes').addEventListener('click', e => {
    const b = e.target.closest('[data-mode]'); if (!b || !scene) return;
    $('modes').querySelectorAll('button').forEach(x => x.setAttribute('aria-pressed', String(x === b)));
    scene.setMode(b.dataset.mode);
  });
  $('catpath').addEventListener('click', () => start3d().then(s => {
    if (!s) return; ensureRes();
    $('modes').querySelectorAll('button').forEach(x => x.setAttribute('aria-pressed', String(x.dataset.mode === 'full')));
    const steps = E.pathSteps(res.design);
    const flagged = steps.map(st => { const row = res.checks.find(r => r.id === (st.from === 'entry' ? 'step-entry' : `step-${st.to}`)); return { st, status: row ? row.status : 'info' }; });
    s.walkCat(flagged);
    const bad = flagged.filter(f => f.status === 'fail' || f.status === 'check');
    PeakUI.toast(bad.length ? `The cat path has ${bad.length} ${bad.length === 1 ? 'jump' : 'jumps'} to look at: ${bad.map(f => `${f.st.fromLabel} to ${f.st.toLabel}, ${E.len(f.st.rise, model.units)}`).join('; ')}.` : 'Every step on the cat path is one the cat can manage.');
  }));

  // ---------- events ----------
  let t = 0;
  const schedule = () => { clearTimeout(t); t = setTimeout(() => { visible(); render(); }, 70); };
  form.addEventListener('input', e => { const el = e.target; if (el.dataset && el.dataset.k && readField(el)) schedule(); });
  form.addEventListener('change', e => {
    const el = e.target; if (!(el.dataset && el.dataset.k)) return;
    readField(el); model = E.normalize(model);
    if (el.dataset.k === 'mesh' || el.dataset.k === 'roof') fillSelects();
    fillForm(); visible(); render();
  });
  $('addons').addEventListener('change', e => {
    const el = e.target; if (!(el.dataset && el.dataset.k)) return;
    if (!(PRO_READY && PeakLicense.requirePro('The add-ons are part of Pro. The design, the checks and the shopping list stay free.'))) { fillForm(); return; }
    readField(el); model = E.normalize(model); fillForm(); visible(); render();
  });
  form.addEventListener('click', e => {
    const b = e.target.closest('[data-seg] button'); if (!b) return;
    if (b.dataset.v !== model.units) switchUnits(b.dataset.v);
  });
  function switchUnits(u) {
    const o = model;
    const n = E.fresh(o.type, u);
    // keep the sizes; move the materials to their nearest equivalent in the other system
    for (const k of ['w', 'd', 'h', 'h2', 'cats', 'agility', 'roof', 'shade', 'floor', 'door', 'shelves', 'ramp', 'wall', 'facing', 'lat', 'city', 'name']) n[k] = o[k];
    n.win = Object.assign({}, o.win); n.gaps = Object.assign({}, o.gaps); n.bal = Object.assign({}, o.bal); n.tunnel = Object.assign({}, o.tunnel); n.addons = JSON.parse(JSON.stringify(o.addons));
    n.lumber = D.SWAP[o.lumber] || n.lumber;
    if (o.mesh === 'hc12-19' && u === 'metric') n.mesh = 'wm13-19'; else if (o.mesh === 'wm13-19' && u === 'imperial') n.mesh = 'hc12-19'; else n.mesh = o.mesh;
    n.custom = Object.assign({}, o.custom);
    n.roll = E.defaultRoll(n.mesh, u);
    model = E.normalize(n); model.sample = false;
    shopRendered = '';
    fillSelects(); fillForm(); visible(); render();
  }
  document.querySelectorAll('input[name="type"]').forEach(r => r.addEventListener('change', () => {
    if (!r.checked || r.value === model.type) return;
    const o = model, n = E.fresh(r.value, o.units);
    for (const k of ['cats', 'agility', 'wall', 'facing', 'lat', 'city']) n[k] = o[k];
    model = E.normalize(n); shopRendered = '';
    fillSelects(); fillForm(); visible(); render();
    start3d();
  }));
  $('start3d').addEventListener('click', () => start3d());
  $('sample').addEventListener('click', () => { model = E.sample(); shopRendered = ''; fillSelects(); fillForm(); visible(); render(); PeakUI.toast('Sample design loaded.'); });
  $('fresh').addEventListener('click', () => {
    const o = model; model = E.fresh(o.type === 'window' && o.sample ? 'window' : o.type, o.units); model.lat = o.lat; model.city = o.city; model.facing = o.facing;
    shopRendered = ''; fillSelects(); fillForm(); visible(); render();
    PeakUI.toast('Your own design: start with the sizes in step 1.');
    const first = form.querySelector('[data-k="w"]'); if (first) first.focus();
  });
  $('share').addEventListener('click', async () => {
    const url = `${location.origin}${location.pathname}#design=${E.encode(model)}`;
    history.replaceState(null, '', url);
    try { await navigator.clipboard.writeText(url); PeakUI.toast('Share link copied. It holds this design; nothing was uploaded.'); }
    catch (e) { PeakUI.toast('The link is in the address bar. Copy it from there.'); }
  });
  $('print').addEventListener('click', () => {
    document.body.classList.add('cd-print-shop');
    const done = () => { document.body.classList.remove('cd-print-shop'); window.removeEventListener('afterprint', done); };
    window.addEventListener('afterprint', done);
    window.print();
    setTimeout(done, 1500);
  });

  // ---------- the city list, fetched from this site on first use ----------
  let cities = null, cityLoading = null;
  function loadCities() {
    if (cities || cityLoading) return cityLoading;
    cityLoading = fetch('/catio-designer/cities.json').then(r => r.json()).then(j => { cities = j.cities; return cities; }).catch(() => { cityLoading = null; return null; });
    return cityLoading;
  }
  $('city').addEventListener('focus', loadCities, { once: true });
  $('city').addEventListener('input', () => {
    const q = $('city').value.trim().toLowerCase();
    if (!cities || q.length < 2) return;
    const hits = cities.filter(c => c[0].toLowerCase().startsWith(q)).slice(0, 12);
    $('city-list').innerHTML = hits.map(c => `<option value="${esc(c[0])}, ${esc(c[1])}"></option>`).join('');
    const exact = cities.find(c => `${c[0]}, ${c[1]}`.toLowerCase() === q);
    if (exact) { model.lat = exact[2]; model.city = `${exact[0]}, ${exact[1]}`; model.sample = false; fillForm($('city')); render(); }
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
    if (!reportPromise) reportPromise = loadScript(REPORT_SRC, () => window.CatioReport).catch(e => { reportPromise = null; throw e; });
    return Promise.all([pdfLibPromise, reportPromise]);
  }
  const today = () => { const d = new Date(); return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`; };
  const stem = () => `catio-${model.type}-${today()}`;
  const needPro = why => PRO_READY && PeakLicense.requirePro(why);
  async function shots(s) {
    if (!s) return { views: [], steps: [] };
    const views = [
      Object.assign({ label: 'iso' }, s.snapshot({ width: 1400, height: 900, view: 'iso', type: 'image/jpeg', quality: 0.86 })),
    ];
    const steps = res.steps.map(st => Object.assign({ n: st.n }, s.snapshot({ width: 1000, height: 680, view: 'iso', type: 'image/jpeg', quality: 0.82, upTo: st.n, hi: st.n, explodeBy: 1, catOn: false, envOn: false })));
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
  const SAVE_KEY = 'catio-designer:saved';
  const store = { get() { try { return JSON.parse(localStorage.getItem(SAVE_KEY) || '[]'); } catch (e) { return []; } }, set(v) { try { localStorage.setItem(SAVE_KEY, JSON.stringify(v)); } catch (e) { PeakUI.toast('This browser will not keep saved designs (private mode?).'); } } };
  function renderSaved() {
    const list = store.get();
    $('saved-list').innerHTML = list.length ? list.map((x, i) => `<li><span>${esc(x.name)} <span class="cd-small">${esc(x.at)}</span></span><span><button type="button" data-load="${i}">Open</button> <button type="button" data-del="${i}">Delete</button></span></li>`).join('') : '<li>No saved designs yet.</li>';
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

  // the cut list and the mesh layout, drawn on the page for Pro
  function svgBoards(r) {
    const u = r.m.units, boards = r.cut.boards;
    const W = 720, rowH = 30, gap = 22;
    const maxStock = Math.max(...boards.map(b => b.stock));
    const sc = (W - 10) / maxStock;
    let y = 4; const parts = [];
    for (const b of boards) {
      parts.push(`<text x="0" y="${y + 11}" font-size="12" fill="currentColor">Board ${b.n}, ${esc(E.stockLabel(b.stock, u))}: ${b.cuts.length} cuts, ${esc(E.len(b.leftover, u))} left over</text>`);
      y += 16; let x = 0;
      for (const c of b.cuts) {
        const w = c.len * sc;
        parts.push(`<rect x="${x.toFixed(1)}" y="${y}" width="${Math.max(1, w - 1).toFixed(1)}" height="${rowH}" fill="#c98a4b" stroke="#24123a" stroke-width="0.8"/>`);
        if (w > 44) parts.push(`<text x="${(x + w / 2).toFixed(1)}" y="${y + 19}" font-size="11.5" text-anchor="middle" fill="#24123a">${esc(E.len(c.len, u))}</text>`);
        x += w + r.cut.kerf * sc;
      }
      const lw = b.stock * sc - x;
      if (lw > 1) parts.push(`<rect x="${x.toFixed(1)}" y="${y}" width="${lw.toFixed(1)}" height="${rowH}" fill="url(#cd-hatch)" stroke="#8b7ea3" stroke-width="0.8"/>`);
      y += rowH + gap - 16 + 10;
    }
    return `<svg class="cd-diagram" viewBox="0 0 ${W} ${y}" role="img" aria-label="Cutting diagram: each board drawn to scale with its cuts"><defs><pattern id="cd-hatch" width="6" height="6" patternUnits="userSpaceOnUse" patternTransform="rotate(45)"><rect width="6" height="6" fill="#f7f4ff"/><line x1="0" y1="0" x2="0" y2="6" stroke="#8b7ea3" stroke-width="1.2"/></pattern></defs>${parts.join('')}</svg>`;
  }
  function svgMesh(r) {
    const u = r.m.units, out = [];
    for (const f of r.mesh.faces) for (const [ri, rr] of f.rects.entries()) {
      const rect = rr.rect, hmax = Math.max(rect.h0, rect.h1);
      const sc = 240 / Math.max(rect.w, hmax), w = rect.w * sc, h = hmax * sc;
      const strips = rr.strips.map((s, i) => rr.orient === 'vertical'
        ? `<rect x="${(s.at * sc).toFixed(1)}" y="${(h - s.len * sc).toFixed(1)}" width="${(s.cover * sc).toFixed(1)}" height="${(s.len * sc).toFixed(1)}" fill="${i % 2 ? '#2bb67333' : '#2e5bff22'}" stroke="#24123a" stroke-width="0.8"/>`
        : `<rect x="0" y="${(h - (s.at + s.cover) * sc).toFixed(1)}" width="${(s.len * sc).toFixed(1)}" height="${(s.cover * sc).toFixed(1)}" fill="${i % 2 ? '#2bb67333' : '#2e5bff22'}" stroke="#24123a" stroke-width="0.8"/>`).join('');
      const outline = `<polygon points="0,${h} ${w},${h} ${w},${(h - rect.h1 * sc).toFixed(1)} 0,${(h - rect.h0 * sc).toFixed(1)}" fill="none" stroke="#c98a4b" stroke-width="2.4"/>`;
      out.push(`<figure class="cd-board"><svg class="cd-diagram" viewBox="-4 -4 ${w + 8} ${h + 8}" style="max-width:${Math.round(w + 8)}px" role="img" aria-label="${esc(f.label)}: ${rr.strips.length} ${rr.orient} strips">${strips}${outline}</svg><figcaption>${esc(f.label)}${f.rects.length > 1 ? `, part ${ri + 1}` : ''}: ${rr.strips.length} ${rr.orient} ${rr.strips.length === 1 ? 'strip' : 'strips'} (${rr.strips.map(s => esc(E.len(s.len, u))).join(', ')}), overlapping ${esc(E.len(r.mesh.overlap, u))}</figcaption></figure>`);
    }
    return out.join('');
  }
  function proRender() {
    if (!pro || !res) return;
    const u = model.units;
    $('cut-diagrams').innerHTML = `<h3>Cut list: ${res.cut.boards.length} boards of ${esc(res.design.lumber.label)}</h3><p class="cd-small">Packed first-fit decreasing with a ${esc(E.len(res.cut.kerf, u))} saw kerf; ${Math.round(res.cut.waste * 100)}% of the wood bought is left over, in the hatched ends.</p>${svgBoards(res)}`;
    $('mesh-diagrams').innerHTML = `<h3>Mesh layout: ${res.mesh.count} ${res.mesh.count === 1 ? 'roll' : 'rolls'} of ${esc(E.len(model.roll.w, u))} x ${esc(E.len(model.roll.l, u, 'dim'))}</h3><div style="display:flex;flex-wrap:wrap;gap:12px 20px">${svgMesh(res)}</div>`;
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
  fillSelects(); fillForm(); visible();
  // the page arrives with the sample already written in (by the build): work it out again only when the browser is
  // idle, so the first paint waits for no script; anything else (a shared link) renders now
  const pre = !init.auto && !pro && $('check-rows').dataset.pre === 'sample';
  if (pre) {
    const warm = () => { if (res) return; res = E.evaluate(gated(), { SunCalc: SunCalc() }); shopRendered = V.shopSig(res, model.units); };
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
  window.CatioTool = { get model() { return model; }, get result() { return ensureRes(); }, get pro() { return pro; }, start3d, get scene() { return scene; }, setModel(m) { model = E.normalize(m); shopRendered = ''; fillSelects(); fillForm(); visible(); render(); } };
})();
