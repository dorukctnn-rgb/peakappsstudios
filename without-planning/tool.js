/* Without Planning: page logic. Engine: engine.js (window.WPEngine). Rules: rules-en.js, rules-ie.js.
 * Nothing typed here leaves the browser. The share link keeps the project after the # sign.
 * The 3D scene (scene.js and three.js) loads only when the 3D view starts; the PDF code and pdf-lib only when a Pro
 * user asks for the PDF. */
(function () {
  'use strict';

  // ---- Gumroad Pro product, permalink without-planning-pro. Gumroad requires the product id for products made after 2023.
  // Fail closed: while this is 'PENDING' (or empty) Pro never turns on, whatever is stored in the browser.
  const WITHOUT_PLANNING_PRO_PRODUCT_ID = 'va1n2QuoHMpquiILUKwd4w==';
  const PRO_READY = !!WITHOUT_PLANNING_PRO_PRODUCT_ID && WITHOUT_PLANNING_PRO_PRODUCT_ID !== 'PENDING';
  const LICENSE = {
    tool: 'without-planning',
    productId: PRO_READY ? WITHOUT_PLANNING_PRO_PRODUCT_ID : 'PENDING',
    permalink: 'without-planning-pro',
    buyUrl: 'https://dorukctn.gumroad.com/l/without-planning-pro',
    pitch: 'Pro writes the PDF report with 3D views and drawings, the rule-by-rule table, the designated land checklist, the building regulations triggers and the next-step pack. $29, once, for every project you check.',
  };
  const PDFLIB_SRC = '/pay-gap-report/vendor/pdf-lib.min.js';
  const REPORT_SRC = '/without-planning/report.js';
  const SCENE_SRC = '/without-planning/scene.js';

  const E = window.WPEngine;
  const $ = id => document.getElementById(id);
  const esc = s => String(s == null ? '' : s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const form = $('form');

  // ---------- Questions (the screening wording lives in engine.js, shared with the PDF) ----------
  const JUDGE_TEXT = {
    en: [['original', 'The house I measured is the original house, as built or as it stood on 1 July 1948'], ['principal', 'The front wall, facing the road, is the principal elevation'], ['curtilage', 'The whole plot I entered is the garden of the house']],
    ie: [['openSpace', 'The rear and side gardens are private, for the household only']],
  };
  const PROJECT_Q = {
    ext: [
      ['p.balcony', 'A balcony, roof terrace or raised platform over 30 cm?', null, 'en-rear en-side'],
      ['p.balcony', 'Will its roof be used as a balcony or terrace?', null, 'ie-ext'],
      ['p.roofAlter', 'Does it change the roof of the house itself?', 'Dormers and roof changes have their own classes.', 'en-rear en-side'],
      ['p.cladding', 'Cladding in stone, render, timber, plastic or tiles?', 'Not allowed on article 2(3) land.', 'en-rear en-side', 'screen.conservation!=no|screen.park!=no|screen.whs!=no'],
      ['p.pitch', 'Will its roof pitch match the house?', null, 'en-rear en-side', 'p.storeys=2'],
    ],
    garden: [
      ['p.platform', 'A veranda, balcony or decking over 30 cm high?', null, 'en-out'],
      ['p.occupancy', 'Only lived in with the main house, never sold separately?', null, 'ie-dad'],
      ['p.temporary', 'A caravan, mobile home or other temporary structure?', null, 'ie-dad'],
      ['p.newAccess', 'Does it need a new access onto the road?', null, 'ie-dad'],
      ['p.ownAccess', 'Does it have its own path or wheelchair route within the plot?', null, 'ie-dad'],
      ['p.letting', 'Will it be let for short stays?', null, 'ie-dad'],
      ['p.owner', 'Is the main house the owner’s home when work starts?', null, 'ie-dad'],
      ['p.split', 'Has the house been split into two homes under Class 1A?', null, 'ie-dad'],
    ],
    hp: [
      ['p.frontsHighway', 'On a wall or roof that faces a road or footpath?', null, 'en-ashp', 'p.mount!=ground'],
      ['p.aboveGround', 'Above the ground floor?', null, 'en-ashp', 'p.mount=wall'],
      ['p.nearerHighway', 'Nearer to the road than the house is?', 'Matters in a conservation area or World Heritage Site.', 'en-ashp', 'screen.conservation!=no|screen.whs!=no'],
      ['p.wind', 'Is there a wind turbine on the house or in the garden?', null, 'en-ashp'],
      ['p.mcsDone', 'Has your MCS installer completed the MCS 020 a) table?', null, 'en-ashp'],
      ['p.road', 'Will it sit over a public road or footpath?', null, 'ie-hp'],
    ],
    notice: [
      ['p.self', 'Will each home be self-contained, sharing only the way in?', null, 'ie-split'],
      ['p.dad', 'Is there a Class 3A house in the garden already?', null, 'ie-split'],
    ],
  };
  const SIDE_WINDOWS = { none: 'No upper-floor side windows', obscured: 'Obscure-glazed, fixed below 1.7 m', clear: 'Clear or opening' };

  // ---------- State ----------
  let model = null, result = null, scene = null, sceneLoading = null, pro = false, glBroken = false;
  const get = (o, path) => path.split('.').reduce((a, k) => (a == null ? a : a[k]), o);
  function set(o, path, v) { const ks = path.split('.'); let t = o; ks.slice(0, -1).forEach(k => { if (t[k] == null || typeof t[k] !== 'object') t[k] = {}; t = t[k]; }); t[ks[ks.length - 1]] = v; }

  // ---------- Build the dynamic parts of the form ----------
  const STATUS_ICON = {
    pass: '<svg viewBox="0 0 16 16" aria-hidden="true"><circle cx="8" cy="8" r="6" fill="currentColor"/></svg>',
    fail: '<svg viewBox="0 0 16 16" aria-hidden="true"><rect x="2.5" y="2.5" width="11" height="11" fill="currentColor"/><path d="M5 8h6" stroke="#fff" stroke-width="2"/></svg>',
    check: '<svg viewBox="0 0 16 16" aria-hidden="true"><path d="M8 1.8 15 14H1z" fill="currentColor"/><path d="M8 6v4" stroke="#fff" stroke-width="1.8"/></svg>',
    prior: '<svg viewBox="0 0 16 16" aria-hidden="true"><path d="M8 1.8 15 14H1z" fill="currentColor"/><path d="M8 6v4" stroke="#fff" stroke-width="1.8"/></svg>',
    info: '<svg viewBox="0 0 16 16" aria-hidden="true"><circle cx="8" cy="8" r="5.5" fill="none" stroke="currentColor" stroke-width="1.6"/></svg>',
    incomplete: '<svg viewBox="0 0 16 16" aria-hidden="true"><circle cx="8" cy="8" r="5.5" fill="none" stroke="currentColor" stroke-width="1.6"/></svg>',
  };
  const STATUS_WORD = { pass: 'Pass', fail: 'Fail', check: 'Check', info: 'Applies' };
  let qid = 0;
  function ynHTML(path, text, small, opts = {}) {
    const name = `q${++qid}`;
    const choices = opts.sure ? [['yes', 'Yes'], ['', 'Not sure']] : [['yes', 'Yes'], ['no', 'No'], ['', 'Not sure']];
    return `<fieldset class="wp-q" data-yn="${esc(path)}"${opts.kind ? ` data-kind="${esc(opts.kind)}"` : ''}${opts.cond ? ` data-if="${esc(opts.cond)}"` : ''}><legend>${esc(text)}${small ? `<small>${esc(small)}</small>` : ''}</legend><span class="wp-yn">${choices.map(([v, l]) => `<label><input type="radio" name="${name}" value="${v}"><span${opts.flag && v === 'yes' ? ' class="wp-flag"' : ''}>${l}</span></label>`).join('')}</span></fieldset>`;
  }
  function buildQuestions() {
    const j = model.j;
    $('questions').innerHTML = E.SCREEN_KEYS[j].map(k => ynHTML(`screen.${k}`, E.QUESTIONS[j][k].q, E.QUESTIONS[j][k].help, { flag: k !== 'previous' })).join('');
    $('judgements').innerHTML = JUDGE_TEXT[j].map(([k, t]) => ynHTML(`judge.${k}`, t, null, { sure: true })).join('');
    const R = E.RULES[j];
    $('maps').innerHTML = `<p>Look these up on the official maps. The tool does not check them for you.</p><ul>${R.MAPS.map(m => `<li><a href="${esc(m.url)}" rel="noopener" target="_blank">${esc(m.label)}</a></li>`).join('')}</ul>`;
    document.querySelectorAll('[data-questions]').forEach(box => {
      const list = PROJECT_Q[box.dataset.questions] || [];
      box.innerHTML = list.map(([path, text, small, kind, cond]) => ynHTML(path, text, small, { kind, cond })).join('')
        + (box.dataset.questions === 'ext' ? `<label class="wp-field" data-kind="en-rear en-side" data-if="p.storeys=2" style="margin-top:8px"><span>Upper-floor windows in the side walls</span><select data-k="p.sideWindows"><option value="">Not decided</option>${Object.entries(SIDE_WINDOWS).map(([v, l]) => `<option value="${v}">${l}</option>`).join('')}</select></label>` : '');
    });
    const kinds = Object.entries(E.PROJECTS).filter(([, p]) => p.j === j);
    $('tabs').innerHTML = kinds.map(([k, p]) => `<button type="button" data-kind-tab="${k}" aria-pressed="${k === model.kind}">${esc(p.name)}<small>${esc(p.cls)}</small></button>`).join('');
  }

  // ---------- Model to form, form to model ----------
  function fillForm() {
    form.querySelectorAll('[data-k]').forEach(el => {
      const v = get(model, el.dataset.k);
      if (el.type === 'checkbox') el.checked = el.dataset.true ? v === el.dataset.true : !!v;
      else el.value = v == null ? '' : String(v);
    });
    form.querySelectorAll('[data-yn]').forEach(fs => {
      const v = get(model, fs.dataset.yn) || '';
      fs.querySelectorAll('input').forEach(i => { i.checked = i.value === v; });
    });
    form.querySelectorAll('[data-multi]').forEach(box => {
      const arr = get(model, box.dataset.multi) || [];
      box.querySelectorAll('input').forEach(i => { i.checked = arr.includes(i.value); });
    });
    form.querySelectorAll('[data-seg]').forEach(seg => {
      const v = get(model, seg.dataset.seg);
      seg.querySelectorAll('button').forEach(b => b.setAttribute('aria-pressed', String(b.dataset.v === v)));
    });
    $('juris').querySelectorAll('button').forEach(b => b.setAttribute('aria-pressed', String(b.dataset.j === model.j)));
    $('tabs').querySelectorAll('button').forEach(b => b.setAttribute('aria-pressed', String(b.dataset.kindTab === model.kind)));
  }
  const NUMERIC = /^(house\.(width|depth|eaves|ridge|rearWall)|plot\.(gapL|gapR|front|rear)|existing\.(extDepth|extWidth|extHeight|outArea|hard|hpArea|farArea)|p\.(depth|width|offset|setback|height|eaves|walls|above|x|y|w|d|h|edge|ground|lw|r|noise|background|area1|area2))$/;
  function readField(el) {
    const path = el.dataset.k;
    let v;
    if (el.type === 'checkbox') v = el.dataset.true ? (el.checked ? el.dataset.true : el.dataset.false) : el.checked;
    else if (NUMERIC.test(path)) v = el.value === '' ? '' : Number(el.value);
    else if (/^(p\.storeys|p\.units|p\.q|existing\.extStoreys|existing\.heatPumps)$/.test(path)) v = Number(el.value);
    else v = el.value;
    set(model, path, v);
    if (/^(house|plot)\./.test(path)) model.sample = false;
  }
  function visible() {
    const test = expr => expr.split('|').some(alt => alt.split('&').every(cond => {
      const m = cond.match(/^([\w.]+)(!?=)(.*)$/);
      if (!m) return true;
      const v = get(model, m[1]);
      const sv = v == null ? '' : String(v);
      return m[2] === '=' ? sv === m[3] : sv !== m[3];
    }));
    form.querySelectorAll('[data-j-only], [data-kind], [data-if]').forEach(el => {
      const d = el.dataset;
      el.hidden = (d.jOnly && d.jOnly !== model.j) || (d.kind && !d.kind.split(' ').includes(model.kind)) || (d.if && !test(d.if)) || false;
    });
    // a field hidden by its parent stays out of the tab order automatically
  }

  // ---------- Render the result ----------
  function groupOf(r) {
    if (/^(en\.o|ie\.a5|ie\.a9)\./.test(r.id)) return 'Before any class';
    return r.cls;
  }
  function render() {
    result = E.evaluate(model);
    const v = result.verdict;
    const P = E.PROJECTS[model.kind];
    const R = E.RULES[model.j];
    $('tb-project').textContent = `${P.name}, ${R.name}, ${P.cls}${model.sample ? ' (sample house)' : ''}`;
    $('verdict-title').innerHTML = `<span class="st-${v.status}">${STATUS_ICON[v.status] || ''}</span><span>${esc(v.title)}</span>`;
    $('verdict-title').className = 'wp-verdict-t';
    $('verdict-text').textContent = v.text;
    $('verdict-formal').textContent = v.formal || '';
    $('tb-asof').textContent = R.RULES_AS_OF;
    $('tb-version').textContent = R.RULES_VERSION;
    $('sched-asof').textContent = `Rules as of ${R.RULES_AS_OF}, rule set ${R.RULES_VERSION}`;
    const c = result.counts;
    $('counts').innerHTML = result.ok ? `<span class="wp-count st-pass"><span>Pass</span><b>${c.pass}</b></span><span class="wp-count st-fail"><span>Fail</span><b>${c.fail}</b></span><span class="wp-count st-check"><span>Check</span><b>${c.check}</b></span>` : '';
    const flags = (result.flags || []).filter(f => f.answer === 'yes');
    $('flags').hidden = !flags.length;
    if (flags.length) {
      const names = flags.map(f => E.QUESTIONS[model.j][f.key].name);
      $('flags').innerHTML = `<p><b>The national rules may not apply as entered.</b> You told us about ${esc(names.join(', '))}. Ask the council before relying on this; the official maps are in step 4.</p>`;
    }
    // schedule
    const rows = [];
    if (!result.ok) rows.push(`<tr><td colspan="5">${esc(result.errors.join(' '))}</td></tr>`);
    let last = '';
    for (const r of result.results) {
      const g = groupOf(r);
      if (g !== last) { rows.push(`<tr class="wp-group"><td colspan="5">${esc(g)}</td></tr>`); last = g; }
      rows.push(`<tr class="is-${r.status}" data-id="${esc(r.id)}"><td class="wp-st st-${r.status}"><span>${STATUS_ICON[r.status]}${STATUS_WORD[r.status]}</span></td><td class="wp-rule">${esc(r.rule)}</td><td class="wp-yours" data-h="Your project">${esc(r.value)}${r.note ? `<span class="wp-cell-note">${esc(r.note)}</span>` : ''}</td><td class="wp-lim" data-h="Limit">${esc(r.limit || '')}</td><td class="wp-ref" data-h="Source"><a href="${esc(r.url)}" rel="noopener" target="_blank" title="${esc(r.ref)}, checked ${esc(longDate(r.checked))}">${esc(shortRef(r.ref))}</a></td></tr>`);
    }
    $('rows').innerHTML = rows.join('');
    // building regulations, kept apart from planning
    const B = E.buildingFor(model);
    $('building').innerHTML = `<h3>Building regulations are a separate question</h3><ul>${B.map(b => `<li>${esc(b.text)} <a href="${esc(R.SOURCES[b.source].url)}" rel="noopener" target="_blank">Source</a></li>`).join('')}</ul>`;
    $('badge').hidden = !model.sample;
    $('sample-note').hidden = !model.sample;
    $('pack-desc').textContent = model.j === 'en'
      ? 'Lawful development certificate cover letter and document checklist' + (result.route === 'prior' ? ', and the larger home extension prior approval checklist.' : '. With a larger extension, the prior approval checklist too.')
      : (model.kind === 'ie-dad' || model.kind === 'ie-split' ? `The Class ${model.kind === 'ie-dad' ? '3A' : '1A'} notice content from Appendix I of Circular PLR 02/2026 and its compliance checklist, filled in, plus a section 5 cover letter.` : 'Section 5 cover letter and document checklist.');
    if (scene) scene.update(model, result, E);
  }
  // "GPDO 2015, Schedule 2, Part 1, Class A, paragraph A.1(b)" reads as "Class A, A.1(b)" in the table; the PDF keeps the full reference
  function shortRef(ref) {
    return ref.replace(/^GPDO 2015, Schedule 2, Part (1|14), /, (m0, n) => (n === '14' ? 'Part 14, ' : ''))
      .replace(/^Planning and Development Regulations 2001, Schedule 2, Part 1, /, '')
      .replace(/^Planning and Development Regulations 2001, /, 'Regulations 2001, ')
      .replace(/paragraphs? /g, '');
  }
  function longDate(iso) { const [y, m, d] = iso.split('-').map(Number); return `${d} ${E.RULES.en.MONTHS[m - 1]} ${y}`; }

  // ---------- 3D: loaded on intent ----------
  function webgl() {
    try { const c = document.createElement('canvas'); return !!(window.WebGLRenderingContext && (c.getContext('webgl2') || c.getContext('webgl'))); } catch (e) { return false; }
  }
  function start3d(animate) {
    if (scene || sceneLoading || glBroken) return sceneLoading;
    if (!webgl()) { glBroken = true; $('gl-note').hidden = false; $('start3d').hidden = true; return null; }
    $('start3d').disabled = true;
    $('start3d').lastChild.textContent = 'Loading the 3D view';
    sceneLoading = import(SCENE_SRC).then(mod => {
      const canvas = $('canvas');
      canvas.hidden = false;
      scene = mod.createScene(canvas, { labels: $('tags'), onView: setViewButtons });
      scene.update(model, result, E, { animate });
      $('poster').hidden = true;
      $('start3d').hidden = true;
      $('views').hidden = false;
      return scene;
    }).catch(err => {
      console.error(err);
      glBroken = true; $('gl-note').hidden = false; $('start3d').hidden = true;
      return null;
    });
    return sceneLoading;
  }
  function setViewButtons(v) { $('views').querySelectorAll('button').forEach(b => b.setAttribute('aria-pressed', String(b.dataset.view === v))); }

  // ---------- Events ----------
  let t = 0;
  const schedule = () => { clearTimeout(t); t = setTimeout(() => { visible(); render(); }, 60); };
  form.addEventListener('input', e => {
    const el = e.target;
    if (el.dataset && el.dataset.k) readField(el);
    else if (el.closest('[data-yn]')) { const fs = el.closest('[data-yn]'); set(model, fs.dataset.yn, el.value); }
    else if (el.closest('[data-multi]')) { const box = el.closest('[data-multi]'); set(model, box.dataset.multi, [...box.querySelectorAll('input:checked')].map(i => i.value)); }
    schedule();
    start3d(true);
  });
  form.addEventListener('click', e => {
    const seg = e.target.closest('[data-seg] button');
    if (seg) { set(model, seg.closest('[data-seg]').dataset.seg, seg.dataset.v); if (/^house\./.test(seg.closest('[data-seg]').dataset.seg)) model.sample = false; fillForm(); visible(); render(); start3d(true); return; }
    const jb = e.target.closest('#juris button');
    if (jb && jb.dataset.j !== model.j) { switchProject(Object.keys(E.PROJECTS).find(k => E.PROJECTS[k].j === jb.dataset.j && E.PROJECTS[k].name === E.PROJECTS[model.kind].name) || (jb.dataset.j === 'ie' ? 'ie-ext' : 'en-rear')); return; }
    const tab = e.target.closest('[data-kind-tab]');
    if (tab && tab.dataset.kindTab !== model.kind) switchProject(tab.dataset.kindTab);
  });
  function switchProject(kind) {
    const keepSample = model.sample;
    model = keepSample ? E.sample(kind) : E.fresh(kind, model);
    if (!keepSample) model.sample = false;
    rebuild();
    start3d(true);
  }
  function rebuild() { buildQuestions(); fillForm(); visible(); render(); }
  $('start3d').addEventListener('click', () => start3d(true));
  $('views').addEventListener('click', e => { const b = e.target.closest('[data-view]'); if (!b || !scene) return; scene.setView(b.dataset.view); setViewButtons(b.dataset.view); });
  $('sample').addEventListener('click', () => { model = E.sample(model.kind); rebuild(); start3d(true); PeakUI.toast('Sample house loaded.'); });
  $('clear').addEventListener('click', () => {
    const m = E.fresh(model.kind);
    for (const k of ['width', 'depth', 'eaves', 'ridge', 'rearWall']) m.house[k] = '';
    for (const k of ['front', 'rear', 'gapL', 'gapR']) m.plot[k] = '';
    model = m; rebuild();
    PeakUI.toast('Cleared. Enter your house in step 2.');
    const first = form.querySelector('[data-k="house.width"]'); if (first) first.focus();
  });
  $('share').addEventListener('click', async () => {
    const url = `${location.origin}${location.pathname}#wp=${E.encode(model)}`;
    history.replaceState(null, '', url);
    try { await navigator.clipboard.writeText(url); PeakUI.toast('Share link copied. It holds this project; nothing was uploaded.'); }
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
    if (!reportPromise) reportPromise = loadScript(REPORT_SRC, () => window.WPReport).catch(e => { reportPromise = null; throw e; });
    return Promise.all([pdfLibPromise, reportPromise]);
  }
  function slug() { return `without-planning-${model.kind}-${new Date().toISOString().slice(0, 10)}`; }
  async function views() {
    // 3D views for the PDF: from the live scene, or a fresh one drawn off screen
    const s = scene || await start3d(false);
    if (!s) return [];
    const shots = [];
    shots.push(Object.assign({ label: 'The project in 3D' }, s.snapshot({ width: 1400, height: 900, view: 'persp', type: 'image/jpeg', quality: 0.9 })));
    return shots;
  }
  async function doPdf() {
    if (!(PRO_READY && PeakLicense.requirePro('The PDF report, the rule-by-rule table and the next-step pack are part of Pro. The check on this page stays free.'))) return;
    if (!result || !result.ok) { PeakUI.toast('Finish the drawing first: ' + (result ? result.errors[0] : '')); return; }
    const btn = $('x-pdf'), label = btn.textContent;
    try {
      btn.disabled = true; btn.textContent = 'Preparing the PDF';
      const [PDFLib, X] = await loadPdf();
      const shots = await views();
      const bytes = await X.pdf(PDFLib, { model, result, E, shots });
      PeakUI.download(new Blob([bytes], { type: 'application/pdf' }), `${slug()}.pdf`);
      PeakUI.toast('PDF report downloaded.');
    } catch (e) { console.error(e); PeakUI.toast('The PDF could not be made. Try again, or email us so we can look into it.'); }
    finally { btn.disabled = false; btn.textContent = label; }
  }
  async function doPack() {
    if (!(PRO_READY && PeakLicense.requirePro('The next-step pack is part of Pro. The check on this page stays free.'))) return;
    if (!result || !result.ok) { PeakUI.toast('Finish the drawing first.'); return; }
    try {
      const [, X] = await loadPdf();
      PeakUI.download(new Blob([X.packText({ model, result, E })], { type: 'text/plain;charset=utf-8' }), `${slug()}-letter.txt`);
      PeakUI.toast('Letter and checklists downloaded as text.');
    } catch (e) { console.error(e); PeakUI.toast('The download failed. Try again.'); }
  }
  $('x-pdf').addEventListener('click', doPdf);
  $('x-pack').addEventListener('click', doPack);
  function proState() {
    $('locked').querySelectorAll('li').forEach(li => { li.classList.toggle('is-open', pro); li.querySelector('em').textContent = pro ? 'Active' : 'Pro'; });
  }

  // ---------- Start ----------
  function initialModel() {
    const h = location.hash.slice(1);
    const share = h.match(/(?:^|&)wp=([A-Za-z0-9_-]+)/);
    if (share) { const m = E.decode(share[1]); if (m) return { m, auto: true }; }
    const preset = h.match(/(?:^|&)p=([a-z-]+)/);
    if (preset && E.PROJECTS[preset[1]]) return { m: E.sample(preset[1]), auto: true };
    return { m: E.sample('en-rear'), auto: false };
  }
  const init = initialModel();
  model = init.m;
  // the form first; the verdict and the schedule in the next task, so no single task blocks the first paint for long
  buildQuestions(); fillForm(); visible();
  setTimeout(render, 0);
  // first intent anywhere in the tool starts the 3D view; a share link or a guide preset starts it after load
  const intent = () => start3d(true);
  $('tool').addEventListener('pointerdown', intent, { once: true });
  $('tool').addEventListener('focusin', intent, { once: true });
  if (init.auto) {
    const go = () => (window.requestIdleCallback ? requestIdleCallback(() => start3d(true), { timeout: 1500 }) : setTimeout(() => start3d(true), 300));
    if (document.readyState === 'complete') go(); else window.addEventListener('load', go, { once: true });
  }
  window.addEventListener('hashchange', () => { const n = initialModel(); if (n.auto) { model = n.m; rebuild(); start3d(true); } });

  PeakLicense.setup(LICENSE);
  pro = PRO_READY && PeakLicense.isPro();
  PeakLicense.onChange(p => { pro = PRO_READY && p; proState(); });
  proState();
  // for tests and the offline renderer
  window.WPTool = { get model() { return model; }, get result() { return result; }, start3d, get scene() { return scene; }, setModel(m) { model = m; rebuild(); } };
})();
