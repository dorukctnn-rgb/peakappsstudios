/* Dropped Kerb Check: page logic. Engine: engine.js (window.DKEngine). Rules: national.js and authorities/<slug>.js,
 * each council's file loaded when it is chosen. Nothing typed here leaves the browser; the share link keeps the
 * frontage after the # sign. The 3D scene (scene.js and three.js) loads only when the 3D view starts; the PDF code and
 * pdf-lib only when a Pro user asks for the pack. */
(function () {
  'use strict';

  // ---- Gumroad Pro product, permalink dropped-kerb-pro. Gumroad requires the product id for products made after 2023,
  // and the licence check sends it (never the permalink). Fail closed: while this is 'PENDING' (or empty) Pro never
  // turns on, whatever is stored in the browser.
  const DROPPED_KERB_PRO_PRODUCT_ID = 'Yur-s7dQ06gxVqnRcrGoMQ==';
  const PRO_READY = !!DROPPED_KERB_PRO_PRODUCT_ID && DROPPED_KERB_PRO_PRODUCT_ID !== 'PENDING';
  const LICENSE = {
    tool: 'dropped-kerb',
    productId: PRO_READY ? DROPPED_KERB_PRO_PRODUCT_ID : 'PENDING',
    permalink: 'dropped-kerb-pro',
    buyUrl: 'https://dorukctn.gumroad.com/l/dropped-kerb-pro',
    pitch: 'Pro writes the application pack: a scaled site plan and frontage elevation, 3D views, every rule with its source, the photo checklist and a cover letter, plus the planning pack, the if-refused pack, a contractor checklist and side-by-side options. $19, once, per property.',
  };
  const PDFLIB_SRC = '/pay-gap-report/vendor/pdf-lib.min.js';
  const REPORT_SRC = '/dropped-kerb/report.js';
  const SCENE_SRC = '/dropped-kerb/scene.js';

  const E = window.DKEngine, IDX = window.DKIndex, NAT = window.DKNational;
  const A = window.DKAuth = window.DKAuth || {};
  const $ = id => document.getElementById(id);
  const esc = s => String(s == null ? '' : s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const form = $('form');

  // ---------- Councils: the search list, and each council's file loaded on demand ----------
  const label = a => (a.verified ? a.name : a.area);
  const options = [];
  for (const a of IDX.LIST) options.push([label(a), a.slug]);
  for (const [d, slug] of IDX.DISTRICTS) { const a = IDX.BY_SLUG[slug]; if (a && d !== a.area) options.push([`${d} (${label(a)})`, slug]); }
  $('council-list').innerHTML = options.map(([t]) => `<option value="${esc(t)}"></option>`).join('');
  const lookup = new Map(options.map(([t, s]) => [t.toLowerCase(), s]));
  for (const a of IDX.LIST) { lookup.set(a.area.toLowerCase(), a.slug); lookup.set(a.slug, a.slug); }
  // the exact option first ("Leeds City Council"), then the name without "City Council", "County" and the like
  function slugFor(text) {
    const raw = String(text || '').trim().toLowerCase().replace(/\s+/g, ' ');
    if (!raw) return null;
    if (lookup.has(raw)) return lookup.get(raw);
    const t = raw.replace(/\s+council$/, '').replace(/\s+(city|county|borough|district|metropolitan borough)$/, '').replace(/^(london borough of|royal borough of|the) /, '');
    if (lookup.has(t)) return lookup.get(t);
    const hit = options.find(([o]) => { const l = o.toLowerCase(); return l.startsWith(raw + ' (') || l.startsWith(t + ' ('); });
    return hit ? hit[1] : null;
  }
  const loading = {};
  function loadAuth(slug) {
    const entry = IDX.BY_SLUG[slug];
    if (!entry || !entry.verified || A[slug]) return Promise.resolve(A[slug] || null);
    if (!loading[slug]) loading[slug] = new Promise((resolve, reject) => {
      const el = document.createElement('script'); el.src = `/dropped-kerb/authorities/${slug}.js`;
      el.onload = () => resolve(A[slug]); el.onerror = () => { delete loading[slug]; reject(new Error('rules for ' + slug + ' did not load')); };
      document.head.appendChild(el);
    });
    return loading[slug];
  }

  // ---------- State ----------
  let model = null, result = null, scene = null, sceneLoading = null, pro = false, glBroken = false;
  const get = (o, path) => path.split('.').reduce((a, k) => (a == null ? a : a[k]), o);
  function set(o, path, v) { const ks = path.split('.'); let t = o; ks.slice(0, -1).forEach(k => { if (t[k] == null || typeof t[k] !== 'object') t[k] = {}; t = t[k]; }); t[ks[ks.length - 1]] = v; }

  // the planning screen questions come from the engine, so the PDF prints the same words
  $('questions').innerHTML = E.SCREEN_KEYS.map(k => {
    const q = E.QUESTIONS[k];
    return `<fieldset class="dk-q" data-yn="screen.${k}"><legend>${esc(q.q)}${q.help ? `<small>${esc(q.help)}</small>` : ''}</legend><span class="dk-yn"><label><input type="radio" name="q-${k}" value="yes"><span>Yes</span></label><label><input type="radio" name="q-${k}" value="no"><span>No</span></label><label><input type="radio" name="q-${k}" value=""><span>Not sure</span></label></span></fieldset>`;
  }).join('');

  // ---------- Model to form, form to model ----------
  const NUMERIC = /^(depth|width|frontage|footway|verge|level|junction|wall|treeDist|treeCirc|lampDist|furnDist|busDist|area|newWallH|softPct)$/;
  function fillForm() {
    form.querySelectorAll('[data-k]').forEach(el => {
      const k = el.dataset.k;
      const v = k === 'softPct' ? (model.soft == null || model.soft === '' ? '' : Math.round(model.soft * 100)) : get(model, k);
      el.value = v == null ? '' : String(v);
    });
    form.querySelectorAll('[data-yn]').forEach(fs => { const v = get(model, fs.dataset.yn) || ''; fs.querySelectorAll('input').forEach(i => { i.checked = i.value === String(v); }); });
    form.querySelectorAll('[data-seg]').forEach(seg => { const v = String(get(model, seg.dataset.seg)); seg.querySelectorAll('button').forEach(b => b.setAttribute('aria-pressed', String(b.dataset.v === v))); });
    const entry = IDX.BY_SLUG[model.a];
    const input = $('council');
    if (entry && slugFor(input.value) !== model.a) input.value = label(entry);
  }
  function readField(el) {
    const k = el.dataset.k;
    let v;
    if (k === 'softPct') { set(model, 'soft', el.value === '' ? '' : Math.max(0, Math.min(100, Number(el.value))) / 100); model.sample = false; return; }
    if (NUMERIC.test(k)) v = el.value === '' ? '' : Number(el.value);
    else if (k === 'speed') v = Number(el.value);
    else v = el.value;
    set(model, k, v);
    model.sample = false;
  }
  function test(expr) {
    return expr.split('|').some(alt => alt.split('&').every(cond => {
      const m = cond.match(/^([\w.]+)(!?=)(.*)$/);
      if (!m) return true;
      const v = get(model, m[1]); const sv = v == null ? '' : String(v);
      return m[2] === '=' ? sv === m[3] : sv !== m[3];
    }));
  }
  function visible() {
    const a = A[model.a];
    form.querySelectorAll('[data-if]').forEach(el => { el.hidden = !test(el.dataset.if); });
    form.querySelectorAll('[data-if-auth]').forEach(el => { el.hidden = !(a && a.rules && a.rules[el.dataset.ifAuth]); });
  }

  // ---------- Render ----------
  const ICON = {
    pass: '<svg viewBox="0 0 16 16" aria-hidden="true"><circle cx="8" cy="8" r="6" fill="currentColor"/></svg>',
    fail: '<svg viewBox="0 0 16 16" aria-hidden="true"><rect x="2.5" y="2.5" width="11" height="11" fill="currentColor"/><path d="M5 8h6" stroke="#fff" stroke-width="2"/></svg>',
    check: '<svg viewBox="0 0 16 16" aria-hidden="true"><path d="M8 1.8 15 14H1z" fill="currentColor"/><path d="M8 6v4" stroke="#fff" stroke-width="1.8"/></svg>',
    info: '<svg viewBox="0 0 16 16" aria-hidden="true"><circle cx="8" cy="8" r="5.5" fill="none" stroke="currentColor" stroke-width="1.6"/></svg>',
    incomplete: '<svg viewBox="0 0 16 16" aria-hidden="true"><circle cx="8" cy="8" r="5.5" fill="none" stroke="currentColor" stroke-width="1.6"/></svg>',
  };
  const WORD = { pass: 'Pass', fail: 'Fail', check: 'Check', info: 'Applies' };
  const GROUP = { council: a => `${a ? a.name : 'This council'}: its published rules`, consent: () => 'Highway law, for every council', planning: () => 'Planning permission (national rules)' };
  function authLine() {
    const entry = IDX.BY_SLUG[model.a], a = A[model.a];
    if (!entry) return '';
    if (entry.verified && a) return `<span class="dk-tick"></span><b>${esc(a.name)}</b>: its own rules, read on ${esc(E.longDate(a.checked))}.${entry.page ? ` <a href="/dropped-kerb/${esc(a.slug)}/">${esc(a.short)}’s rules and fees</a>` : ''}`;
    return `<span class="dk-none"></span><b>${esc(entry.area)}</b>: its own rules are not checked here yet, so the national rules apply. <a href="https://www.gov.uk/apply-dropped-kerb" rel="noopener">Find its page by postcode</a>.`;
  }
  function render() {
    result = E.evaluate(model, A);
    const v = result.verdict, entry = IDX.BY_SLUG[model.a], a = A[model.a];
    $('auth-line').innerHTML = authLine();
    $('tb-label').textContent = `${a ? a.name : entry ? entry.area : 'Choose a council'}${model.sample ? ', sample house' : ''}`;
    $('verdict-title').innerHTML = `<span class="st-${v.status}">${ICON[v.status] || ''}</span><span>${esc(v.title)}</span>`;
    $('verdict-text').textContent = v.text;
    $('tb-asof').textContent = result.ok ? result.rulesAsOf : NAT.RULES_AS_OF;
    $('tb-version').textContent = result.ok ? result.rulesVersion : NAT.RULES_VERSION;
    $('sched-asof').textContent = `Council rules as of ${result.ok ? result.rulesAsOf : NAT.RULES_AS_OF}; national rules ${NAT.RULES_VERSION}`;
    const c = result.councilCounts || { pass: 0, fail: 0, check: 0 };
    $('counts').innerHTML = result.ok ? ['pass', 'fail', 'check'].map(k => `<span class="dk-count st-${k}"><b>${c[k]}</b><span>${WORD[k]}</span></span>`).join('') : '';
    // planning, and the money before any work
    if (result.ok) {
      const p = result.planning;
      $('planning-box').innerHTML = `<h3 class="st-${p.status}">${ICON[p.status]}<span>${esc(p.title)}</span></h3><p>${esc(p.text)}</p>`;
      $('planning-long').textContent = `${p.title}. ${p.text}`;
      const cost = result.cost;
      if (cost) {
        const fee = cost.lines.filter(l => l.kind === 'fee' || l.kind === 'possible');
        const feeTotal = fee.reduce((s, l) => s + (l.kind === 'fee' ? l.amount : 0), 0);
        const works = cost.lines.find(l => l.kind === 'works');
        const txt = cost.missing ? cost.missing : `${E.money(feeTotal)} to apply${cost.atRisk && cost.atRisk < feeTotal ? `, ${E.money(cost.atRisk)} of it lost if refused` : cost.atRisk ? ', not refunded if refused' : ''}.`;
        $('cost-box').innerHTML = `<h3>Before any work</h3><span class="dk-money">${cost.missing ? 'Fee not shown' : E.money(feeTotal)}</span><p>${esc(txt)} ${works ? esc(works.note.split('.')[0] + '.') : ''}</p>`;
        $('cost').innerHTML = `<tbody>${cost.lines.map(l => `<tr><td>${esc(l.label)}${l.note ? `<span class="dk-cell-note">${esc(l.note)}</span>` : ''}${l.source ? `<span class="dk-cell-note"><a href="${esc(l.source.url)}" rel="noopener" target="_blank">${esc(l.source.short)}</a></span>` : ''}</td><td class="num">${l.amount == null ? 'Quote' : l.amountHigh && l.amountHigh !== l.amount ? `${E.money(l.amount)} to ${E.money(l.amountHigh)}` : (l.kind === 'optional' ? 'Optional ' : l.kind === 'possible' ? 'Up to ' : '') + E.money(l.amount)}</td></tr>`).join('')}<tr class="dk-total"><td>Estimate${cost.openEnded ? ', before the items quoted on site' : ''}</td><td class="num">${cost.low === cost.high ? E.money(cost.low) : `${E.money(cost.low)} to ${E.money(cost.high)}`}</td></tr></tbody>`;
        $('cost-note').innerHTML = `Fees as published on ${esc(a.short)}’s pages, read on ${esc(E.longDate(a.checked))}. <a href="/dropped-kerb/cost/">Fees compared across councils</a>`;
      } else {
        $('cost-box').innerHTML = `<h3>Before any work</h3><p>Fees are not checked for ${esc(entry.area)} yet. Among the councils checked here, applying costs ${esc(IDX.RANGE.fee)}.</p>`;
        $('cost').innerHTML = `<tbody><tr><td>${esc(entry.area)}’s fees are not in this tool yet. The councils checked here charge ${esc(IDX.RANGE.fee)} to apply, and most do not refund it.</td></tr></tbody>`;
      }
    } else {
      $('planning-box').innerHTML = '<h3>Planning permission</h3><p>Finish the measurements first.</p>';
      $('cost-box').innerHTML = '<h3>Before any work</h3><p>Finish the measurements first.</p>';
    }
    // the schedule
    const rows = [];
    if (!result.ok) rows.push(`<tr><td colspan="5">${esc(result.errors.join(' '))}</td></tr>`);
    let last = '';
    for (const r of result.results) {
      if (r.group !== last) { rows.push(`<tr class="dk-group"><td colspan="5">${esc(GROUP[r.group](a))}</td></tr>`); last = r.group; }
      rows.push(`<tr class="is-${r.status}" data-id="${esc(r.id)}"><td class="dk-st st-${r.status}"><span>${ICON[r.status]}${WORD[r.status]}</span></td><td class="dk-rule">${esc(r.rule)}</td><td data-h="Yours">${esc(r.value)}${r.note ? `<span class="dk-cell-note">${esc(r.note)}</span>` : ''}</td><td data-h="Limit"${r.limit ? '' : ' class="dk-empty"'}>${esc(r.limit || '')}</td><td class="dk-ref" data-h="Source">${r.url ? `<a href="${esc(r.url)}" rel="noopener" target="_blank" title="${esc(r.ref)}, read ${esc(E.longDate(r.checked))}">${esc(r.sourceLabel)}</a>${r.ref ? `<span class="dk-cell-note">${esc(r.ref)}</span>` : ''}` : ''}</td></tr>`);
    }
    $('rows').innerHTML = rows.join('');
    $('badge').hidden = !model.sample;
    $('sample-note').hidden = !model.sample;
    if (scene && result.ok) scene.update(model, result, E);
  }

  // ---------- 3D: loaded on intent ----------
  function webgl() { try { const c = document.createElement('canvas'); return !!(window.WebGLRenderingContext && (c.getContext('webgl2') || c.getContext('webgl'))); } catch (e) { return false; } }
  function start3d(animate) {
    if (scene || sceneLoading || glBroken) return sceneLoading;
    if (!webgl()) { glBroken = true; $('gl-note').hidden = false; $('start3d').hidden = true; return null; }
    $('start3d').disabled = true; $('start3d').lastChild.textContent = 'Loading the 3D view';
    sceneLoading = import(SCENE_SRC).then(mod => {
      const canvas = $('canvas'); canvas.hidden = false;
      scene = mod.createScene(canvas, { labels: $('tags'), onView: setViewButtons });
      if (result && result.ok) scene.update(model, result, E, { animate });
      $('poster').hidden = true; $('start3d').hidden = true; $('views').hidden = false;
      return scene;
    }).catch(err => { console.error(err); glBroken = true; $('gl-note').hidden = false; $('start3d').hidden = true; return null; });
    return sceneLoading;
  }
  function setViewButtons(v) { $('views').querySelectorAll('button').forEach(b => b.setAttribute('aria-pressed', String(b.dataset.view === v))); }

  // ---------- Events ----------
  let t = 0;
  const schedule = () => { clearTimeout(t); t = setTimeout(() => { visible(); render(); }, 60); };
  form.addEventListener('input', e => {
    const el = e.target;
    if (el.dataset && el.dataset.k) readField(el);
    else if (el.closest('[data-yn]')) { set(model, el.closest('[data-yn]').dataset.yn, el.value); model.sample = false; }
    schedule(); start3d(true);
  });
  form.addEventListener('click', e => {
    const b = e.target.closest('[data-seg] button');
    if (!b) return;
    const k = b.closest('[data-seg]').dataset.seg;
    set(model, k, k === 'spaces' ? Number(b.dataset.v) : b.dataset.v); model.sample = false;
    fillForm(); visible(); render(); start3d(true);
  });
  function chooseCouncil(slug) {
    if (!slug || slug === model.a) return;
    const keep = model.sample;
    return loadAuth(slug).then(() => {
      model = keep ? E.sample(slug, A) : Object.assign(E.fresh(slug, model), { a: slug });
      fillForm(); visible(); render(); start3d(true);
    }).catch(err => { console.error(err); PeakUI.toast('The council’s rules could not be loaded. Check your connection and try again.'); });
  }
  $('council').addEventListener('change', () => chooseCouncil(slugFor($('council').value)));
  $('council').addEventListener('input', () => { const s = slugFor($('council').value); if (s && s !== model.a && IDX.BY_SLUG[s] && $('council').value.length > 2) chooseCouncil(s); });
  $('start3d').addEventListener('click', () => start3d(true));
  $('views').addEventListener('click', e => { const b = e.target.closest('[data-view]'); if (!b || !scene) return; scene.setView(b.dataset.view); setViewButtons(b.dataset.view); });
  $('sample').addEventListener('click', () => { model = E.sample(model.a, A); fillForm(); visible(); render(); start3d(true); PeakUI.toast('Sample house loaded.'); });
  $('clear').addEventListener('click', () => {
    const m = E.fresh(model.a);
    for (const k of ['depth', 'width', 'footway', 'verge', 'level', 'junction', 'wall', 'area', 'frontage']) m[k] = '';
    Object.assign(m, { tree: '', treeDist: '', treeCirc: '', lamp: '', lampDist: '', furn: '', furnDist: '', bus: '', busDist: '', crossing: '', bay: '', calming: '', door: '', existing: '', steep: '', newWall: '', structural: '', surface: 'undecided', soft: '' });
    model = m; fillForm(); visible(); render();
    PeakUI.toast('Cleared. Enter your frontage in step 1.');
    const first = form.querySelector('[data-k="depth"]'); if (first) first.focus();
  });
  $('share').addEventListener('click', async () => {
    const url = `${location.origin}${location.pathname}#dk=${E.encode(model)}`;
    history.replaceState(null, '', url);
    try { await navigator.clipboard.writeText(url); PeakUI.toast('Share link copied. It holds this frontage; nothing was uploaded.'); }
    catch (e) { PeakUI.toast('The link is in the address bar. Copy it from there.'); }
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
    if (!reportPromise) reportPromise = loadScript(REPORT_SRC, () => window.DKReport).catch(e => { reportPromise = null; throw e; });
    return Promise.all([pdfLibPromise, reportPromise]);
  }
  const today = () => { const d = new Date(); return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`; };
  const fileStem = () => `dropped-kerb-${model.a}-${today()}`;
  async function views() {
    const s = scene || await start3d(false);
    if (!s || !result || !result.ok) return [];
    return [
      Object.assign({ label: 'street' }, s.snapshot({ width: 1400, height: 875, view: 'street', type: 'image/jpeg', quality: 0.88 })),
      Object.assign({ label: 'section' }, s.snapshot({ width: 1400, height: 600, view: 'section', type: 'image/jpeg', quality: 0.88 })),
    ];
  }
  function needVerified() {
    if (result && result.ok && result.verified) return true;
    PeakUI.toast(result && result.ok ? 'The pack needs a council whose rules are checked here. Choose one of the 12, or wait for yours.' : 'Finish the measurements first: ' + (result ? result.errors[0] : ''));
    return false;
  }
  async function doPdf() {
    if (!(PRO_READY && PeakLicense.requirePro('The application pack, the planning and refusal packs, the contractor checklist and the options are part of Pro. The check on this page stays free.'))) return;
    if (!needVerified()) return;
    const btn = $('x-pdf'), text = btn.textContent;
    try {
      btn.disabled = true; btn.textContent = 'Preparing the pack';
      const [PDFLib, X] = await loadPdf();
      const shots = await views();
      const bytes = await X.pdf(PDFLib, { model, result, E, A, shots, options: E.options(model, A) });
      PeakUI.download(new Blob([bytes], { type: 'application/pdf' }), `${fileStem()}.pdf`);
      PeakUI.toast('Application pack downloaded.');
    } catch (e) { console.error(e); PeakUI.toast('The PDF could not be made. Try again, or email us so we can look into it.'); }
    finally { btn.disabled = false; btn.textContent = text; }
  }
  async function doTxt() {
    if (!(PRO_READY && PeakLicense.requirePro('The letters are part of Pro. The check on this page stays free.'))) return;
    if (!needVerified()) return;
    try {
      const [, X] = await loadPdf();
      PeakUI.download(new Blob([X.packText({ model, result, E, A })], { type: 'text/plain;charset=utf-8' }), `${fileStem()}-letters.txt`);
      PeakUI.toast('Letters and checklists downloaded as text.');
    } catch (e) { console.error(e); PeakUI.toast('The download failed. Try again.'); }
  }
  $('x-pdf').addEventListener('click', doPdf);
  $('x-txt').addEventListener('click', doTxt);
  function proState() { $('locked').querySelectorAll('li').forEach(li => { li.classList.toggle('is-open', pro); li.querySelector('em').textContent = pro ? 'Active' : 'Pro'; }); }

  // ---------- Start ----------
  function initial() {
    const h = location.hash.slice(1);
    const share = h.match(/(?:^|&)dk=([A-Za-z0-9_-]+)/);
    if (share) { const m = E.decode(share[1]); if (m) return { m, auto: true }; }
    const council = h.match(/(?:^|&)a=([a-z-]+)/);
    if (council && IDX.BY_SLUG[council[1]]) return { a: council[1], auto: true, edit: (h.match(/(?:^|&)p=([a-z-]+)/) || [])[1] };
    return { m: E.sample('kent', A), auto: false };
  }
  const PRESET = {
    refused: m => { m.depth = 4.3; m.wall = 1.1; m.treeDist = 2.2; },
    planning: m => { m.road = 'classified'; m.turn = 'yes'; },
    parking: m => { m.door = 'no'; },
  };
  function boot(init) {
    const go = () => { fillForm(); visible(); setTimeout(render, 0); };
    if (init.m) { model = init.m; return loadAuth(model.a).then(go, go); }
    return loadAuth(init.a).then(() => { model = E.sample(init.a, A); if (init.edit && PRESET[init.edit]) PRESET[init.edit](model); go(); }, () => { model = E.fresh(init.a); go(); });
  }
  const init = initial();
  const ready = boot(init);
  const intent = () => start3d(true);
  $('tool').addEventListener('pointerdown', intent, { once: true });
  $('tool').addEventListener('focusin', intent, { once: true });
  if (init.auto) {
    const go = () => ready.then(() => (window.requestIdleCallback ? requestIdleCallback(() => start3d(true), { timeout: 1500 }) : setTimeout(() => start3d(true), 300)));
    if (document.readyState === 'complete') go(); else window.addEventListener('load', go, { once: true });
  }
  window.addEventListener('hashchange', () => { const n = initial(); if (n.auto) boot(n).then(() => start3d(true)); });

  PeakLicense.setup(LICENSE);
  pro = PRO_READY && PeakLicense.isPro();
  PeakLicense.onChange(p => { pro = PRO_READY && p; proState(); });
  proState();
  // for tests and the offline renderer
  window.DKTool = { get model() { return model; }, get result() { return result; }, start3d, get scene() { return scene; }, ready, setModel(m) { model = m; return loadAuth(m.a).then(() => { fillForm(); visible(); render(); }); } };
})();
