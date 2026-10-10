/* Equality Action Plan: page logic. Rules: rules.js (window.EAPRules). Engine: engine.js (window.EAP).
 * Pro: analysis.js (with the Pay Gap Report's paygap.js) and pack.js (with pdf-lib), loaded only when a Pro feature is used.
 * The plan is saved in this browser's localStorage under equality-action-plan:draft and never sent anywhere.
 * The only network call is the Gumroad licence check (license.js). */
(function () {
  'use strict';

  // ---- Gumroad Pro product, permalink equality-action-plan-pro. Gumroad requires the product id for products made after 2023.
  // Fail closed: while this is 'PENDING' (or empty) Pro never turns on, whatever is stored in the browser.
  const EQUALITY_ACTION_PLAN_PRO_PRODUCT_ID = 'K3Xa3viPIr7y696y98OISQ==';
  const PRO_READY = !!EQUALITY_ACTION_PLAN_PRO_PRODUCT_ID && EQUALITY_ACTION_PLAN_PRO_PRODUCT_ID !== 'PENDING';
  const LICENSE = {
    tool: 'equality-action-plan',
    productId: PRO_READY ? EQUALITY_ACTION_PLAN_PRO_PRODUCT_ID : 'PENDING',
    permalink: 'equality-action-plan-pro',
    buyUrl: 'https://dorukctn.gumroad.com/l/equality-action-plan-pro',
    pitch: 'Pro adds the Step 1 analysis from your HR export, the sign-off pack PDF, a page for your website, the measures tracker and the staff consultation kit. $79, once, per organisation, for every reporting entity in it.',
  };
  const STORE_KEY = 'equality-action-plan:draft';
  const SRC = {
    paygap: '/pay-gap-report/paygap.js', report: '/pay-gap-report/report.js', pdflib: '/pay-gap-report/vendor/pdf-lib.min.js',
    analysis: '/equality-action-plan/analysis.js', pack: '/equality-action-plan/pack.js',
  };

  const R = window.EAPRules, E = window.EAP;
  const $ = id => document.getElementById(id);
  const esc = s => String(s == null ? '' : s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const reduce = () => matchMedia('(prefers-reduced-motion: reduce)').matches;
  const now = new Date();
  // The reporting year open now: the 2026 snapshot until its deadline passes (4 April 2027), then the next.
  const defaultYear = () => (now.getTime() > Date.UTC(2027, 3, 4, 23, 59) ? 2027 : 2026);

  function blankPlan() {
    return { employer: '', sector: 'private', year: defaultYear(), actions: {}, narrative: '', website: '', responsible: { name: '', title: '' }, figures: {}, figRaw: {}, tracker: {}, sample: false };
  }
  const S = { plan: blankPlan(), pro: false, built: null, analysis: null, table: null, mapping: null, prevTracker: null, responses: [], open: null };
  let saveTimer = null;

  // ---------- Storage (per-browser convenience; everything works without it) ----------
  function save() {
    clearTimeout(saveTimer);
    saveTimer = setTimeout(() => {
      try {
        if (S.plan.sample) localStorage.removeItem(STORE_KEY);
        else localStorage.setItem(STORE_KEY, JSON.stringify(Object.assign({ v: 1, saved: Date.now() }, S.plan)));
      } catch (e) { /* private mode or blocked storage */ }
    }, 350);
  }
  function restore() {
    try {
      const raw = localStorage.getItem(STORE_KEY);
      if (!raw) return false;
      const p = JSON.parse(raw);
      if (!p || p.v !== 1) return false;
      S.plan = Object.assign(blankPlan(), p, { sample: false });
      delete S.plan.v; delete S.plan.saved;
      return true;
    } catch (e) { return false; }
  }

  function say(msg) { $('status').textContent = msg; if (msg) PeakUI.toast(msg); }

  // ---------- Figures ----------
  function setFigure(key, raw) {
    S.plan.figRaw[key] = raw;
    const v = E.parseFigure(raw, key);
    if (v == null) delete S.plan.figures[key]; else S.plan.figures[key] = v;
  }
  function figureProblems() {
    const bad = [];
    for (const k of E.FIG_KEYS) {
      const raw = (S.plan.figRaw[k] || '').trim();
      if (raw && E.parseFigure(raw, k) == null) bad.push(E.FIG_LABEL[k]);
    }
    return bad;
  }

  // ---------- Render: bar ----------
  function renderBar() {
    const p = S.plan;
    if (document.activeElement !== $('employer')) $('employer').value = p.employer;
    $('sector').querySelectorAll('button').forEach(b => b.setAttribute('aria-pressed', String(b.dataset.value === p.sector)));
    const years = [2026, 2027];
    if (!years.includes(p.year)) years.push(p.year);
    $('year').innerHTML = years.sort().map(y => `<option value="${y}"${y === p.year ? ' selected' : ''}>${y} to ${y + 1}${y <= 2026 ? ' (voluntary)' : ''}</option>`).join('');
    const ry = R.reportingYear(p.sector, p.year);
    $('dates').innerHTML = `Snapshot date <strong>${esc(ry.snapshot.long)}</strong>. The plan goes with your gender pay gap figures, by <strong>${esc(ry.deadline.long)}</strong>. ` +
      (ry.status === 'voluntary' ? 'Voluntary for this reporting year.' : 'Whether a plan is required for this year depends on regulations that have not been made yet.');
    $('sample-note').hidden = !p.sample;
    if (p.sample) $('sample-note-text').textContent = E.SAMPLE.note;
    const resp = R.RESPONSIBLE.required[p.sector];
    $('resp').hidden = false;
    $('resp-hint').textContent = resp
      ? 'Private and voluntary sector employers name a responsible person, usually a director, partner or senior officer, who confirms the information is accurate.'
      : 'Most public authority employers do not need a responsible person. You can still record who approved the plan for your own sign-off.';
  }

  // ---------- Render: figures and diagnosis ----------
  function renderFigures() {
    document.querySelectorAll('[data-fig]').forEach(inp => {
      const k = inp.dataset.fig;
      if (document.activeElement === inp) return;
      const raw = S.plan.figRaw[k];
      inp.value = raw != null ? raw : S.plan.figures[k] != null ? E.r1(S.plan.figures[k]).toFixed(1) : '';
      inp.setAttribute('aria-label', E.FIG_LABEL[k] + ', percent');
    });
    const bad = figureProblems();
    $('fig-warn').hidden = !bad.length;
    $('fig-warn').textContent = bad.length ? `Not read as a percentage: ${bad.join(', ')}. Gaps can be negative; shares run from 0 to 100.` : '';
  }
  function renderDiagnosis() {
    const d = E.diagnose(S.plan.figures);
    const out = $('diagnosis');
    if (!d.any) {
      out.innerHTML = '<p class="eap-diag-empty">Type in your figures, or load the sample plan, and what they show appears here with the actions GOV.UK links to it.</p>';
      return;
    }
    const chosen = id => !!S.plan.actions[id];
    const lead = d.notes.filter(n => n.id === 'gap' || n.id === 'gap-negative');
    const rest = d.notes.filter(n => !lead.includes(n));
    const chip = a => `<button type="button" class="eap-chip" data-add="${esc(a.id)}" aria-pressed="${chosen(a.id)}" aria-label="${chosen(a.id) ? 'In your plan' : 'Add to your plan'}: ${esc(a.name)}">${chosen(a.id) ? 'In your plan' : 'Add'}</button>`;
    const pats = d.patterns.map(p => `<div class="eap-pat" data-pattern="${esc(p.id)}"><p>${esc(p.text)}</p>${p.question ? `<p class="eap-q">Step 1 asks: ${esc(p.question)}</p>` : ''}` +
      `<ul class="eap-pat-acts" aria-label="Actions GOV.UK links to this">${p.actions.map(a => `<li><span>${esc(a.name)}</span>${chip(a)}</li>`).join('')}</ul>` +
      `<details class="eap-why"><summary>When GOV.UK says ${p.actions.length === 1 ? 'this action fits' : 'these actions fit'}</summary><ul>${p.actions.map(a => `<li><strong>${esc(a.name)}.</strong> ${esc(a.why)}</li>`).join('')}</ul></details></div>`).join('');
    out.innerHTML = lead.map(n => `<p class="eap-note-lead" data-note="${esc(n.id)}">${esc(n.text)}</p>`).join('') +
      (pats || '<p class="eap-diag-empty">No pattern in these figures links to a particular action. The notes below say what they show.</p>') +
      rest.map(n => `<p class="eap-note" data-note="${esc(n.id)}">${esc(n.text)}</p>`).join('');
  }

  // ---------- Render: the picker ----------
  function buildGroups() {
    $('groups').innerHTML = R.GROUPS.map(g => {
      const acts = R.ACTIONS.filter(a => a.group === g.id);
      return `<fieldset class="eap-group" data-kind="${g.kind}"><legend><span>${esc(g.name)}</span><small>${esc(R.KIND[g.kind].name)}</small></legend><ul class="eap-acts">` +
        acts.map(a => `<li class="eap-act" data-act="${a.id}" data-on="false"><input type="checkbox" id="act-${a.id}" data-pick="${a.id}" aria-describedby="sum-${a.id}"><label class="eap-act-name" for="act-${a.id}">${esc(a.name)}</label>` +
          `<p class="eap-act-sum" id="sum-${a.id}">${esc(a.summary)} <a href="${esc(a.url)}" rel="noopener" aria-label="${esc(a.name)} on GOV.UK">GOV.UK guidance</a></p>` +
          `<div class="seg" role="group" aria-label="Status of ${esc(a.name)}" data-status-for="${a.id}"><button type="button" data-value="new" aria-pressed="true">New or in progress</button><button type="button" data-value="embedded" aria-pressed="false">Embedded</button></div></li>`).join('') +
        '</ul></fieldset>';
    }).join('');
  }
  function renderPicker(c) {
    for (const a of R.ACTIONS) {
      const li = document.querySelector(`.eap-act[data-act="${a.id}"]`);
      const sel = S.plan.actions[a.id];
      li.dataset.on = String(!!sel);
      li.querySelector('input[type=checkbox]').checked = !!sel;
      li.querySelectorAll('.seg button').forEach(b => b.setAttribute('aria-pressed', String(!!sel && b.dataset.value === sel.status)));
    }
    $('rules').innerHTML = c.rules.map(r => `<li data-ok="${r.ok}" data-rule="${r.id}"><div><strong>${esc(r.title)}</strong><span>${esc(r.text)}</span></div></li>`).join('');
    const k = c.counts;
    $('counts').textContent = k.total ? `${k.total} action${k.total === 1 ? '' : 's'} chosen: ${k.new} new or in progress, ${k.embedded} embedded.` : 'No actions chosen yet.';
  }

  // ---------- Render: texts ----------
  function textCard(x) {
    const a = x.action, st = R.STATUSES[x.status], pr = R.PROMPTS[x.status];
    return `<div class="eap-text" data-text-for="${a.id}"><div class="eap-text-head"><h3 id="th-${a.id}">${esc(a.name)}</h3><span class="eap-tag" data-status="${x.status}">${esc(st.name)}${pr.required ? '' : ', text optional'}</span></div>` +
      `<ul class="eap-prompts">${pr.items.map(i => `<li>${esc(i.charAt(0).toUpperCase() + i.slice(1))}</li>`).join('')}</ul>` +
      `<textarea class="input eap-textarea" data-text="${a.id}" rows="4" spellcheck="true" aria-labelledby="th-${a.id}" aria-describedby="cnt-${a.id} tw-${a.id}"></textarea>` +
      `<div class="eap-count-row"><p class="warn" id="tw-${a.id}"></p><p class="eap-count" id="cnt-${a.id}"></p></div></div>`;
  }
  let textKeys = '';
  function renderTexts(c) {
    const key = c.list.map(x => x.id + ':' + x.status).join(',');
    if (key !== textKeys) {
      const focused = document.activeElement && document.activeElement.dataset && document.activeElement.dataset.text;
      $('texts').innerHTML = c.list.map(textCard).join('');
      c.list.forEach(x => { $('texts').querySelector(`[data-text="${x.id}"]`).value = x.text; });
      textKeys = key;
      if (focused) { const el = $('texts').querySelector(`[data-text="${focused}"]`); if (el) el.focus(); }
    }
    $('texts-empty').hidden = c.list.length > 0;
    for (const t of c.texts) updateCount(t);
    // Narrative
    if (document.activeElement !== $('narrative')) $('narrative').value = S.plan.narrative;
    const n = c.narrative;
    setCount($('narr-count'), n.words, n.limit);
    const nw = [];
    if (n.over) nw.push(`${n.words - n.limit} word${n.words - n.limit === 1 ? '' : 's'} over the 200-word limit.`);
    if (n.links.length) nw.push(`Remove the web address (${n.links[0]}): the service asks for your web page separately, below.`);
    $('narr-warn').hidden = !nw.length; $('narr-warn').textContent = nw.join(' ');
    if (document.activeElement !== $('website')) $('website').value = S.plan.website;
    if (document.activeElement !== $('resp-name')) $('resp-name').value = S.plan.responsible.name || '';
    if (document.activeElement !== $('resp-title')) $('resp-title').value = S.plan.responsible.title || '';
  }
  function setCount(el, words, limit) {
    el.textContent = `${words} / ${limit} words`;
    el.dataset.state = words > limit ? 'over' : words >= limit * 0.9 ? 'near' : '';
  }
  function updateCount(t) {
    const card = $('texts').querySelector(`[data-text-for="${t.id}"]`);
    if (!card) return;
    setCount($('cnt-' + t.id), t.words, t.limit);
    const w = [];
    if (t.over) w.push(`${t.words - t.limit} word${t.words - t.limit === 1 ? '' : 's'} over the limit.`);
    if (t.links.length) w.push(`The service does not allow links in this text: remove ${t.links[0]}.`);
    if (t.missing) w.push('New or in progress actions need this text.');
    $('tw-' + t.id).textContent = w.join(' ');
    card.dataset.state = t.over ? 'over' : t.links.length ? 'links' : t.missing ? 'missing' : '';
  }

  // ---------- Render: output ----------
  function renderOutput(c) {
    const left = [];
    c.rules.filter(r => !r.ok).forEach(r => left.push(r.text.replace(/^Not met yet: /, '')));
    c.texts.forEach(t => {
      const name = R.BY_ID[t.id].name;
      if (t.missing) left.push(`Write the supporting text for ${name}.`);
      if (t.over) left.push(`Cut ${t.words - t.limit} word${t.words - t.limit === 1 ? '' : 's'} from ${name}.`);
      if (t.links.length) left.push(`Remove the link from ${name}.`);
    });
    if (c.narrative.over) left.push(`Cut ${c.narrative.words - c.narrative.limit} words from the narrative.`);
    if (c.narrative.links.length) left.push('Remove the link from the narrative.');
    if (!c.website.ok) left.push('The website link should start with https:// or www.');
    if (c.responsible.required && !c.responsible.ok) left.push('Add the responsible person before you submit.');
    const ready = $('ready');
    ready.dataset.ok = String(!left.length);
    ready.innerHTML = !left.length
      ? `<strong>Ready to copy.</strong> All three rules are met and every text is inside its limit. ${esc(R.asOfLine())}.`
      : `<strong>${left.length} thing${left.length === 1 ? '' : 's'} to finish:</strong><ul>${left.slice(0, 8).map(x => `<li>${esc(x)}</li>`).join('')}</ul>`;
    const blocks = E.serviceBlocks(S.plan);
    $('blocks').innerHTML = blocks.map((b, i) => {
      const meta = b.limit ? `${b.status ? b.status + ', ' : ''}${b.words} / ${b.limit} words` : b.step;
      const empty = !b.text;
      return `<li class="eap-block" data-block="${esc(b.id)}" data-empty="${empty}"><div class="eap-block-head">${esc(b.title)}<span class="eap-block-meta">${esc(meta)}</span></div><button type="button" class="btn btn-sm" data-copy="${i}"${empty ? ' disabled' : ''}>Copy</button><pre>${esc(empty ? (b.id === 'website' ? 'No link yet' : b.id.startsWith('action:') ? 'No text yet' : 'Nothing yet') : b.text)}</pre></li>`;
    }).join('');
    S.blocks = blocks;
  }

  function render() {
    const c = E.checkPlan(S.plan);
    renderBar(); renderFigures(); renderDiagnosis(); renderPicker(c); renderTexts(c); renderOutput(c); renderPro();
    document.querySelectorAll('[data-asof]').forEach(el => { el.textContent = R.RULES_AS_OF; });
    document.querySelectorAll('[data-asof-line]').forEach(el => { el.textContent = R.asOfLine(); });
    return c;
  }
  // A light update while typing a text: counters, rules and output, without rebuilding the text boxes.
  function refreshCounts() {
    const c = E.checkPlan(S.plan);
    c.texts.forEach(updateCount);
    setCount($('narr-count'), c.narrative.words, c.narrative.limit);
    renderPicker(c); renderOutput(c);
    const n = c.narrative, nw = [];
    if (n.over) nw.push(`${n.words - n.limit} word${n.words - n.limit === 1 ? '' : 's'} over the 200-word limit.`);
    if (n.links.length) nw.push(`Remove the web address (${n.links[0]}): the service asks for your web page separately, below.`);
    $('narr-warn').hidden = !nw.length; $('narr-warn').textContent = nw.join(' ');
  }

  // ---------- Plan changes ----------
  function toggleAction(id, on, status) {
    if (!R.BY_ID[id]) return;
    if (on) S.plan.actions[id] = Object.assign({ status: 'new', text: '' }, S.plan.actions[id] || {}, status ? { status } : {});
    else delete S.plan.actions[id];
    S.plan.sample = false;
    save(); render();
  }
  function copyText(text) {
    const done = () => say('Copied.');
    if (navigator.clipboard && window.isSecureContext) return navigator.clipboard.writeText(text).then(done, () => fallback());
    fallback();
    function fallback() {
      const ta = document.createElement('textarea');
      ta.value = text; ta.setAttribute('readonly', ''); ta.style.position = 'fixed'; ta.style.opacity = '0';
      document.body.appendChild(ta); ta.select();
      try { document.execCommand('copy'); done(); } catch (e) { say('Copy did not work in this browser. Select the text and copy it.'); }
      ta.remove();
    }
  }
  const slug = () => (S.plan.employer || 'plan').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 40) || 'plan';
  const fileBase = () => `equality-action-plan-${slug()}-${S.plan.year}-${S.plan.year + 1}`;

  // ---------- Fragments: #prefill= from the Pay Gap Report, #select= and #example= from the guides ----------
  function applyHash() {
    const h = location.hash || '';
    let applied = false;
    const pre = E.parsePrefill(h);
    if (pre) {
      if (pre.employer) S.plan.employer = pre.employer;
      if (pre.sector) S.plan.sector = pre.sector;
      if (pre.year) S.plan.year = pre.year;
      S.plan.figures = {}; S.plan.figRaw = {};
      for (const k of E.FIG_KEYS) if (pre.figures[k] != null) { S.plan.figures[k] = pre.figures[k]; S.plan.figRaw[k] = E.r1(pre.figures[k]).toFixed(1); }
      S.plan.sample = false;
      const note = $('prefill-note');
      note.hidden = false;
      note.textContent = pre.count >= 10
        ? 'Filled in from the Pay Gap Report: the six measures and the four quartile shares. Check them against the figures you publish.'
        : pre.count ? `Filled in from the Pay Gap Report: ${pre.count} figure${pre.count === 1 ? '' : 's'}. Type in the others from your published report to see the full diagnosis.` : 'The link from the Pay Gap Report carried no figures.';
      applied = 'prefill';
    }
    const params = new URLSearchParams(h.replace(/^#/, ''));
    const sel = params.get('select');
    if (sel) {
      for (const id of sel.split(',')) if (R.BY_ID[id] && !S.plan.actions[id]) S.plan.actions[id] = { status: 'new', text: '' };
      S.plan.sample = false;
      applied = applied || 'select';
    }
    const ex = params.get('example');
    if (ex && R.BY_ID[ex] && E.EXAMPLES && E.EXAMPLES[ex]) {
      const cur = S.plan.actions[ex];
      S.plan.actions[ex] = { status: cur ? cur.status : 'new', text: cur && cur.text.trim() ? cur.text : E.EXAMPLES[ex].text };
      S.plan.sample = false;
      applied = applied || 'example';
    }
    if (applied) {
      try { history.replaceState(null, '', location.pathname + location.search); } catch (e) { /* ignore */ }
      save();
    }
    return applied;
  }

  // ---------- Pro ----------
  const scripts = {};
  function loadScript(src, ready) {
    if (ready()) return Promise.resolve();
    if (!scripts[src]) scripts[src] = new Promise((res, rej) => {
      const el = document.createElement('script');
      el.src = src; el.onload = () => (ready() ? res() : rej(new Error(src + ' did not load')));
      el.onerror = () => { delete scripts[src]; rej(new Error(src + ' did not load')); };
      document.head.appendChild(el);
    });
    return scripts[src];
  }
  const needPro = reason => PRO_READY && PeakLicense.requirePro(reason);
  function renderPro() {
    const step = $('pro-step');
    step.dataset.pro = String(S.pro);
    $('pro-tag').hidden = S.pro;
    $('lock').hidden = S.pro;
    $('pro-sub').textContent = S.pro ? 'Pro is active in this browser. Everything below is built on this page.' : 'For the people who sign it off, publish it and review it next year. Each row is part of Pro.';
    if (window.EAPPro && S.open) window.EAPPro.render(S.open);
  }
  function openPanel(name) {
    const ctx = proContext();
    // Free users can open the analysis to see which questions their file answers; the figures stay locked.
    if (name !== 'analysis' && !needPro(name === 'tracker' ? 'The measures tracker is part of Pro: a metric, baseline, target, owner and review date for each action, as CSV and PDF.' : 'The staff consultation kit is part of Pro: an anonymous menopause needs survey, a focus group guide and a CSV of the answers.')) return;
    loadScript(SRC.paygap, () => window.PayGap)
      .then(() => loadScript(SRC.analysis, () => window.EAPAnalysis))
      .then(() => loadScript('/equality-action-plan/pro.js', () => window.EAPPro))
      .then(() => {
        S.open = name;
        ['analysis', 'tracker', 'consult'].forEach(n => { $('panel-' + n).hidden = n !== name; });
        window.EAPPro.init(ctx);
        window.EAPPro.render(name);
        $('panel-' + name).scrollIntoView({ behavior: reduce() ? 'auto' : 'smooth', block: 'start' });
      })
      .catch(e => { console.error(e); say('That part of the page did not load. Check your connection and try again.'); });
  }
  function proContext() {
    return { S, R, E, $, esc, say, save, render, needPro, loadScript, SRC, fileBase, copyText, PRO_READY };
  }
  function proAction(kind) {
    const reasons = { pack: 'The sign-off pack PDF is part of Pro: your plan, the data appendix and an approval page for the responsible person.', 'web-html': 'The website plan page is part of Pro: a self-contained HTML page and a PDF for your own site.', 'web-pdf': 'The website plan page is part of Pro: a self-contained HTML page and a PDF for your own site.' };
    if (!needPro(reasons[kind])) return;
    loadScript(SRC.paygap, () => window.PayGap)
      .then(() => loadScript(SRC.analysis, () => window.EAPAnalysis))
      .then(() => loadScript('/equality-action-plan/pro.js', () => window.EAPPro))
      .then(() => { window.EAPPro.init(proContext()); return window.EAPPro.action(kind); })
      .catch(e => { console.error(e); say('The export failed. Try again, or email us so we can look into it.'); });
  }

  // ---------- Events ----------
  function bind() {
    $('employer').addEventListener('input', e => { S.plan.employer = e.target.value; S.plan.sample = false; save(); $('sample-note').hidden = true; refreshCounts(); });
    PeakUI.seg($('sector'), v => { S.plan.sector = v; save(); render(); });
    $('year').addEventListener('change', e => { S.plan.year = Number(e.target.value); save(); render(); });
    $('sample').addEventListener('click', () => {
      S.plan = Object.assign(blankPlan(), E.samplePlan());
      S.plan.figRaw = {};
      for (const k of E.FIG_KEYS) if (S.plan.figures[k] != null) S.plan.figRaw[k] = E.r1(S.plan.figures[k]).toFixed(1);
      $('prefill-note').hidden = true;
      textKeys = '';
      render();
      say('Sample plan loaded: synthetic data.');
      $('tool').scrollIntoView({ behavior: reduce() ? 'auto' : 'smooth', block: 'start' });
    });
    const clear = () => { S.plan = blankPlan(); textKeys = ''; $('prefill-note').hidden = true; try { localStorage.removeItem(STORE_KEY); } catch (e) { /* ignore */ } render(); say('Cleared. Start your own plan.'); };
    $('sample-clear').addEventListener('click', clear);
    $('reset').addEventListener('click', clear);
    $('diag-step').addEventListener('input', e => {
      const k = e.target.dataset && e.target.dataset.fig;
      if (!k) return;
      setFigure(k, e.target.value); S.plan.sample = false; save();
      renderDiagnosis();
      const bad = figureProblems();
      $('fig-warn').hidden = !bad.length;
      $('fig-warn').textContent = bad.length ? `Not read as a percentage: ${bad.join(', ')}. Gaps can be negative; shares run from 0 to 100.` : '';
    });
    $('diagnosis').addEventListener('click', e => {
      const b = e.target.closest('[data-add]');
      if (!b) return;
      const id = b.dataset.add;
      if (S.plan.actions[id]) { const el = document.getElementById('act-' + id); if (el) el.closest('.eap-act').scrollIntoView({ behavior: reduce() ? 'auto' : 'smooth', block: 'center' }); return; }
      toggleAction(id, true, 'new');
      say(`${R.BY_ID[id].name} added as new or in progress.`);
    });
    $('groups').addEventListener('change', e => {
      const id = e.target.dataset && e.target.dataset.pick;
      if (id) toggleAction(id, e.target.checked);
    });
    $('groups').addEventListener('click', e => {
      const b = e.target.closest('.seg button');
      if (!b) return;
      const id = b.closest('[data-status-for]').dataset.statusFor;
      if (!S.plan.actions[id]) return;
      S.plan.actions[id].status = b.dataset.value; S.plan.sample = false;
      save(); render();
    });
    $('texts').addEventListener('input', e => {
      const id = e.target.dataset && e.target.dataset.text;
      if (!id || !S.plan.actions[id]) return;
      S.plan.actions[id].text = e.target.value; S.plan.sample = false;
      save(); refreshCounts();
    });
    $('narrative').addEventListener('input', e => { S.plan.narrative = e.target.value; S.plan.sample = false; save(); refreshCounts(); });
    $('website').addEventListener('input', e => { S.plan.website = e.target.value; save(); refreshCounts(); });
    $('resp-name').addEventListener('input', e => { S.plan.responsible.name = e.target.value; save(); refreshCounts(); });
    $('resp-title').addEventListener('input', e => { S.plan.responsible.title = e.target.value; save(); refreshCounts(); });
    $('blocks').addEventListener('click', e => {
      const b = e.target.closest('[data-copy]');
      if (!b || !S.blocks) return;
      copyText(S.blocks[Number(b.dataset.copy)].text);
    });
    $('copy-all').addEventListener('click', () => copyText(E.planText(S.plan)));
    $('download-txt').addEventListener('click', () => {
      PeakUI.download(new Blob([E.planText(S.plan).replace(/\n/g, '\r\n')], { type: 'text/plain;charset=utf-8' }), fileBase() + '.txt');
      say('Text file downloaded.');
    });
    $('pro-rows').addEventListener('click', e => {
      const o = e.target.closest('[data-open]');
      if (o) return openPanel(o.dataset.open);
      const a = e.target.closest('[data-pro-action]');
      if (a) proAction(a.dataset.proAction);
    });
  }

  // ---------- Start ----------
  restore();
  buildGroups();
  bind();
  const via = applyHash();
  PeakLicense.setup(LICENSE);
  S.pro = PRO_READY && PeakLicense.isPro();
  PeakLicense.onChange(pro => { S.pro = PRO_READY && pro; render(); });
  render();
  if (via === 'prefill') $('diag-step').scrollIntoView({ behavior: 'auto', block: 'start' });
  else if (via === 'select' || via === 'example') $('text-step').scrollIntoView({ behavior: 'auto', block: 'start' });
  window.addEventListener('hashchange', () => { if (applyHash()) { textKeys = ''; render(); } });
})();
