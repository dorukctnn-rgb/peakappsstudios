/* Pay Transparency Kit: the employer's answer page. Engine: engine.js on top of the Pay Gap Report's paygap.js.
 * The payroll file is read with File.arrayBuffer() on this page and never sent anywhere. There are no analytics.
 * Free: the file, the checks, the categories and headcounts, and the start of the letter with the figures hidden.
 * Pro: the figures, the full letters, the PDFs, the request log, the yearly notice and the criteria template.
 * pdf-lib loads only when a Pro user asks for a PDF. */
(function () {
  'use strict';

  // ---- Gumroad Pro product, permalink pay-transparency-kit-pro. Gumroad requires the product id for new products.
  // Fail closed: while this is 'PENDING' (or empty) Pro never turns on, whatever is stored in the browser.
  const PAYTRANS_PRO_PRODUCT_ID = '26Kg2nlZ-D23_Uylq2MXOQ==';
  const PRO_READY = !!PAYTRANS_PRO_PRODUCT_ID && PAYTRANS_PRO_PRODUCT_ID !== 'PENDING';
  const LICENSE = {
    tool: 'pay-transparency',
    productId: PRO_READY ? PAYTRANS_PRO_PRODUCT_ID : 'PENDING',
    permalink: 'pay-transparency-kit-pro',
    buyUrl: 'https://dorukctn.gumroad.com/l/pay-transparency-kit-pro',
    pitch: 'Pro gives the figures, the answer letters in English, German and Dutch as PDF and text, the request log, the yearly notice and the criteria template. $99, once, per organisation.',
  };
  const MAX_BYTES = 50 * 1024 * 1024;

  const P = window.PayGap, R = window.PayTransRules, LT = window.PayTransLetters, E = window.PayTransEngine;
  if (!P || !R || !LT || !E) return;
  const $ = id => document.getElementById(id);
  const esc = s => String(s == null ? '' : s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const int = n => Number(n).toLocaleString('en-GB');
  const today = (() => { const d = new Date(); return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`; })();

  const S = {
    table: null, mapping: null, sexMap: {}, choices: { duplicates: 'first', outliers: 'keep', noPay: 'hourly' },
    hoursMode: 'total', ftWeek: 40, sample: false,
    country: 'IE', deBasis: 'entg', beSector: 'other', workerRow: null, cmp: '', received: today, year: Number(today.slice(0, 4)) - 1,
    lang: 'en', payBasis: 'both', parttime: 'paid', currency: 'EUR',
    workerName: '', employer: '', signatory: '', signatoryTitle: '', criteriaWhere: '', contact: '',
    include: {}, pro: false, logPrev: [], logEntries: [],
  };
  let V = null;

  // ---------- Files ----------
  async function readFile(file) {
    if (!file) return;
    if (file.size > MAX_BYTES) return say(`${file.name} is larger than 50 MB, which is more than a payroll export of one row per worker should be.`);
    if (/\.xls$/i.test(file.name)) return say('That is an old Excel .xls file. Save it as XLSX or CSV in Excel, then drop it here.');
    if (!/\.(csv|tsv|txt|xlsx)$/i.test(file.name)) return say('Choose a CSV or XLSX file.');
    let table;
    try { table = await P.readTable(file.name, new Uint8Array(await file.arrayBuffer())); }
    catch (e) { return say(/xls/.test(e.message) ? 'That is an old Excel .xls file. Save it as XLSX or CSV, then drop it here.' : 'That file could not be read as CSV or XLSX. Save it again from your payroll or spreadsheet program and try once more.'); }
    if (!table.headers.filter(Boolean).length || !table.body.length) return say(`${file.name} has no rows under a header row.`);
    load(table, false);
    say(`Read ${file.name}: ${int(table.body.length)} rows.`);
  }
  function load(table, sample) {
    S.table = table; S.sample = sample;
    S.mapping = E.detectMapping(table.headers);
    S.hoursMode = E.guessHoursMode(table, S.mapping);
    S.sexMap = {}; S.include = {}; S.workerRow = null; S.cmp = '';
    if (sample) {
      if (!S.employer) S.employer = P.SAMPLE.employer;
      render(true);
      // Start on a worker whose category has enough of both sexes to show a full answer.
      const pick = V.records.find(r => r.category === 'Manager' && r.sex === 'F' && E.counts(r));
      if (pick) S.workerRow = pick.row;
    }
    render();
  }
  async function loadSample(scroll) {
    load(await E.sampleTable(), true);
    if (scroll) $('tool').scrollIntoView({ behavior: matchMedia('(prefers-reduced-motion: reduce)').matches ? 'auto' : 'smooth', block: 'start' });
  }
  function reset() {
    S.table = null; S.mapping = null; S.sample = false; S.workerRow = null; S.sexMap = {}; S.include = {};
    if (S.employer === P.SAMPLE.employer) S.employer = '';
    render();
    say('Cleared. Drop a payroll export to start again.');
  }
  function say(msg) { $('status').textContent = msg; if (msg && window.PeakUI) PeakUI.toast(msg); }

  // ---------- Model ----------
  function mappingProblem() {
    const m = S.mapping;
    if (!(m.sex > -1)) return 'Match the column that records each worker’s sex.';
    if (!(m.category > -1)) return 'Match the column with the category of workers: the group doing the same work or work of equal value.';
    if (!(m.hourly > -1) && !(m.ordinary > -1 && m.hours > -1)) return 'Match either the gross hourly pay column, or both basic pay and hours.';
    return '';
  }
  function compute() {
    const built = E.buildRecords(S.table, { mapping: S.mapping, hoursMode: S.hoursMode, sexMap: S.sexMap, fullTimeWeekly: S.ftWeek });
    const rv = E.review(built.records, S.choices);
    return { records: built.records, checks: rv.checks, cats: E.categories(built.records), problem: mappingProblem() };
  }
  function opts() {
    if (S.country === 'DE') return { de200: S.deBasis === 'entg' ? 'yes' : 'no', deTariff: 'unsure' };
    if (S.country === 'BE') return { beSector: S.beSector };
    return {};
  }
  const requester = () => (V && S.workerRow != null ? V.records.find(r => r.row === S.workerRow) : null);

  // ---------- Render ----------
  function render(quiet) {
    const has = !!S.table;
    $('tool').dataset.state = has ? 'ready' : 'empty';
    $('empty').hidden = has;
    $('ready').hidden = !has;
    if (!has) { V = null; return; }
    V = compute();
    if (quiet) return;
    renderFile(); renderMapping(); renderChecks(); renderCats(); renderRequest(); renderAnswer();
  }

  function renderFile() {
    const t = S.table;
    $('file-name').textContent = t.name;
    $('file-meta').textContent = `${t.kind === 'xlsx' ? `XLSX${t.sheetName ? `, sheet ${t.sheetName}` : ''}` : 'CSV'}, ${int(t.body.length)} rows, ${t.headers.filter(Boolean).length} columns`;
    $('sample-note').hidden = !S.sample;
  }

  function firstValue(idx) {
    if (!(idx > -1)) return '';
    for (const b of S.table.body) { const v = b.cells[idx]; if (v != null && String(v).trim() !== '') return String(v); }
    return '';
  }
  function renderMapping() {
    const m = S.mapping;
    const opt = ['<option value="-1">Not in the file</option>'].concat(S.table.headers.map((h, i) => `<option value="${i}">${esc(h || `Column ${i + 1}`)}</option>`)).join('');
    const missing = new Set();
    if (!(m.sex > -1)) missing.add('sex');
    if (!(m.category > -1)) missing.add('category');
    if (!(m.hourly > -1) && !(m.ordinary > -1 && m.hours > -1)) { if (!(m.ordinary > -1)) missing.add('ordinary'); if (!(m.hours > -1)) missing.add('hours'); }
    $('map-body').innerHTML = E.FIELDS.map(f => {
      const idx = m[f.key] != null ? m[f.key] : -1;
      return `<tr class="${missing.has(f.key) ? 'is-missing' : ''}"><th scope="row">${esc(f.label)}${f.hint ? `<small>${esc(f.hint)}</small>` : f.optional ? '<small>Optional</small>' : ''}</th><td><select class="select" data-field="${f.key}" aria-label="${esc(f.label)}">${opt.replace(`value="${idx}"`, `value="${idx}" selected`)}</select></td><td class="pt-map-ex">${esc(firstValue(idx).slice(0, 40))}</td></tr>`;
    }).join('');
    $('hours-mode').value = S.hoursMode;
    $('ft-week').value = S.ftWeek;
    $('basis-hint').textContent = m.fte > -1 ? 'The file has a full-time equivalent column, so the full-time week is only used for rows where it is blank.' : 'Used for the full-time equivalent when the file has no FTE column: hours paid divided by a full-time year of this many hours a week.';
    $('map-warn').hidden = !V.problem;
    $('map-warn').textContent = V.problem;
  }

  function renderChecks() {
    $('checks-step').hidden = !!V.problem;
    if (V.problem) return;
    $('checks').innerHTML = V.checks.map(c => {
      let extra = '';
      if (c.choice) extra += `<div class="pt-radios" role="radiogroup" aria-label="${esc(c.title)}">${c.choice.options.map(([v, l]) => `<label><input type="radio" name="ck-${c.choice.name}" data-choice="${c.choice.name}" value="${v}"${c.choice.value === v ? ' checked' : ''}> ${esc(l)}</label>`).join('')}</div>`;
      if (c.values) extra += c.values.map(v => `<div class="ck-value"><code>${esc(v.raw === '' ? '(blank)' : v.raw)}</code><span class="muted">${v.count} row${v.count > 1 ? 's' : ''}</span><select class="select" data-sex="${esc(v.raw)}" aria-label="Treat ${esc(v.raw || 'blank')} as"><option value="X">Leave out of the averages</option><option value="M">Male</option><option value="F">Female</option></select></div>`).join('');
      const mapped = Object.keys(S.sexMap).filter(k => S.sexMap[k] === 'M' || S.sexMap[k] === 'F');
      if (c.id === 'sex' && mapped.length) extra += `<p class="ck-text">Matched by you: ${mapped.map(k => `${esc(k || '(blank)')} as ${S.sexMap[k] === 'M' ? 'male' : 'female'}`).join(', ')}. <button type="button" class="linklike" data-unmap>Undo</button></p>`;
      if (c.rows && c.rows.length && c.state !== 'ok') {
        const list = c.rows.slice(0, 60).map(r => `<li>Row ${r.row}${r.id ? `, ${esc(r.id)}` : ''}</li>`).join('');
        extra += `<details><summary>Show ${c.rows.length > 60 ? 'the first 60 rows' : c.rows.length === 1 ? 'the row' : `the ${c.rows.length} rows`}</summary><ul class="ck-rows">${list}</ul></details>`;
      }
      return `<li data-state="${c.state}"><span class="ck-body"><strong>${esc(c.title)}</strong>${c.text ? `<span class="ck-text">${esc(c.text)}</span>` : ''}${extra}</span></li>`;
    }).join('');
    $('checks').querySelectorAll('select[data-sex]').forEach(sel => { const v = S.sexMap[sel.dataset.sex]; if (v) sel.value = v; });
  }

  function smallNote(g) {
    const bits = [];
    if (g.women === 1) bits.push('1 woman'); else if (g.women === 2) bits.push('2 women');
    if (g.men === 1) bits.push('1 man'); else if (g.men === 2) bits.push('2 men');
    return bits.length ? `<span class="pt-small">Small group: ${esc(bits.join(', '))}</span>` : '';
  }
  function renderCats() {
    $('cats-step').hidden = !!V.problem;
    if (V.problem) return;
    const req = requester();
    const rows = V.cats.map(g => `<tr class="${req && req.category === g.name ? 'is-pick' : ''}"><th scope="row">${g.name ? esc(g.name) : '<span class="muted">No category</span>'}</th><td class="num">${int(g.women)}</td><td class="num">${int(g.men)}</td><td class="num">${g.other ? int(g.other) : ''}</td><td class="num">${int(g.inAverages)}</td><td>${g.name ? smallNote(g) : '<span class="muted small">Not in any average</span>'}</td></tr>`).join('');
    $('cats').innerHTML = `<caption class="sr-only">Headcount by sex in each category of workers</caption><thead><tr><th scope="col">Category</th><th scope="col" class="num">Women</th><th scope="col" class="num">Men</th><th scope="col" class="num">Not recorded</th><th scope="col" class="num">In the averages</th><th scope="col">Note</th></tr></thead><tbody>${rows}</tbody>`;
    const named = V.cats.filter(g => g.name).length;
    $('cats-note').textContent = `${named} categor${named === 1 ? 'y' : 'ies'} in the file. Small group marks a category where one sex has one or two people; step 5 explains what that means for an answer.`;
  }

  function renderRequest() {
    $('req-step').hidden = !!V.problem;
    if (V.problem) return;
    const cs = R.COUNTRIES.slice().sort((a, b) => a.names.en.localeCompare(b.names.en));
    if (!$('country').options.length) $('country').innerHTML = cs.map(c => `<option value="${c.code}">${esc(c.names.en)}</option>`).join('');
    $('country').value = S.country;
    $('de-basis-f').hidden = S.country !== 'DE';
    $('de-basis').value = S.deBasis;
    $('be-sector-f').hidden = S.country !== 'BE';
    $('be-sector').value = S.beSector;
    // Workers, grouped by category
    const groups = new Map();
    for (const r of V.records) {
      if (r.out && (r.out.code === 'example' || r.out.code === 'duplicate')) continue;
      if (!r.category) continue;
      if (!groups.has(r.category)) groups.set(r.category, []);
      groups.get(r.category).push(r);
    }
    const label = r => `${r.id || 'Row ' + r.row}${r.name ? ', ' + r.name : ''}${r.title ? ', ' + r.title : ''}${r.sex === 'M' ? ', man' : r.sex === 'F' ? ', woman' : ', sex not recorded'}`;
    $('worker').innerHTML = '<option value="">Choose the worker who asked</option>' + [...groups.entries()].sort((a, b) => a[0].localeCompare(b[0])).map(([cat, list]) => `<optgroup label="${esc(cat)}">${list.map(r => `<option value="${r.row}">${esc(label(r))}</option>`).join('')}</optgroup>`).join('');
    $('worker').value = S.workerRow != null ? String(S.workerRow) : '';
    const req = requester();
    const rule = currentRule();
    const entg = isEntg(rule);
    $('cmp-f').hidden = !entg;
    if (entg) {
      const cats = [...groups.keys()].sort();
      $('cmp').innerHTML = cats.map(c => `<option value="${esc(c)}">${esc(c)}</option>`).join('');
      $('cmp').value = S.cmp || (req ? req.category : '');
    }
    $('basis-f').hidden = entg; $('pt-f').hidden = entg;
    const hasAnnual = S.mapping.ordinary > -1;
    $('pay-basis').querySelectorAll('option').forEach(o => { o.disabled = !hasAnnual && o.value !== 'hourly'; });
    if (!hasAnnual) S.payBasis = 'hourly';
    $('pay-basis').value = S.payBasis;
    $('parttime').value = S.parttime;
    $('received').value = S.received;
    $('lang').value = S.lang;
    $('year').value = S.year;
    $('currency').value = S.currency;
    if (document.activeElement !== $('worker-name')) $('worker-name').value = S.workerName || (req && req.name) || '';
    for (const [id, k] of [['employer', 'employer'], ['signatory', 'signatory'], ['signatory-title', 'signatoryTitle'], ['criteria-where', 'criteriaWhere'], ['contact', 'contact']]) if (document.activeElement !== $(id)) $(id).value = S[k];
    // Dates
    const per = rule.mode === 'statutory' ? `${LT.period('en', rule.regime.deadline)} under ${rule.regime.short.en}` : rule.mode === 'upcoming' ? `the directive's two months; ${rule.upcoming.short.en} applies from ${LT.longDate('en', rule.upcoming.from)}` : rule.status === 'unknown' ? 'the directive’s two months; the national rule is not confirmed' : `the directive's two months; not yet a legal deadline in ${R.BY_CODE[S.country].names.en}`;
    $('dates').innerHTML = `Received <strong>${esc(LT.longDate('en', S.received))}</strong>. Answer by <strong>${esc(LT.longDate('en', rule.due))}</strong> (${esc(per)}).${rule.regime && rule.regime.oncePerYear ? ' Italy allows one request a year per worker.' : ''}`;
  }

  function currentRule() { return R.ruleFor(S.country, opts(), S.received); }
  const isEntg = rule => rule && rule.mode === 'statutory' && rule.regime.kind === 'entg';

  function lockIcon() { return '<svg width="11" height="11" viewBox="0 0 14 14" aria-hidden="true"><rect x="2.5" y="6" width="9" height="6.5" rx="1.2" fill="none" stroke="currentColor" stroke-width="1.4"/><path d="M4.5 6V4.5a2.5 2.5 0 0 1 5 0V6" fill="none" stroke="currentColor" stroke-width="1.4"/></svg>'; }

  // Everything the letter, the figures and the log need, for the chosen worker
  function answerData(maskFigures) {
    const req = requester();
    if (!req) return { problem: 'Choose the worker who made the request.' };
    const rule = currentRule();
    const base = {
      lang: S.lang, country: S.country, opts: opts(), received: S.received, sent: today,
      workerName: S.workerName || req.name || '', employer: S.employer, signatory: S.signatory, signatoryTitle: S.signatoryTitle,
      year: S.year, basis: S.payBasis, parttime: S.parttime, currency: S.currency, criteriaWhere: S.criteriaWhere, maskFigures,
    };
    if (isEntg(rule)) {
      const ent = E.entgFor(V.records, req, S.cmp || req.category);
      if (ent.problem) return { problem: ent.problem, rule };
      return { rule, req, ent, letter: Object.assign(base, { category: ent.category, entg: ent }) };
    }
    const ans = E.answerFor(V.records, req, { parttime: S.parttime });
    if (ans.problem) return { problem: ans.problem, rule };
    const flagged = new Set(ans.disclosure.map(f => f.sex));
    const grp = (g, sex) => Object.assign({}, g, { withheld: flagged.has(sex) && !S.include[sex] });
    return { rule, req, ans, letter: Object.assign(base, { category: ans.category, own: ans.own, women: grp(ans.women, 'F'), men: grp(ans.men, 'M') }) };
  }

  function letterHTML(L, preview) {
    const fig = s => esc(s).replace(/\{\{fig\}\}/g, '<span class="pt-mask" role="img" aria-label="Figure shown in Pro"></span>');
    let h = '';
    if (L.sender && L.sender.length) h += `<div class="pt-l-sender">${L.sender.map(esc).join('<br>')}</div>`;
    if (L.recipient && L.recipient.length) h += `<div class="pt-l-recipient">${L.recipient.map(esc).join('<br>')}</div>`;
    if (L.dateLine) h += `<div class="pt-l-date">${esc(L.dateLine)}</div>`;
    if (L.subject) h += `<p class="pt-l-subject">${fig(L.subject)}</p>`;
    if (L.salutation) h += `<p>${fig(L.salutation)}</p>`;
    let body = '';
    const blocks = preview ? L.blocks.slice(0, 4) : L.blocks;
    for (const b of blocks) {
      if (b.h) body += `<p class="pt-l-h">${fig(b.h)}</p>`;
      else if (b.p) body += `<p>${fig(b.p)}</p>`;
      else if (b.list) body += `<ol>${LT.listItems(L, b).map(it => { const m = /^(\S+)\s([\s\S]*)$/.exec(it); return `<li><span>${esc(m[1])}</span><span>${fig(m[2])}</span></li>`; }).join('')}</ol>`;
    }
    if (preview) return h + `<div class="pt-fade">${body}</div>`;
    return h + body + `<div class="pt-l-sign"><p class="pt-l-close">${esc(L.closing)}</p>${(L.signature || []).map(s => `<p>${esc(s)}</p>`).join('')}</div>`;
  }

  function renderAnswer() {
    $('ans-step').hidden = !!V.problem;
    if (V.problem) return;
    const pro = S.pro;
    const d = answerData(!pro);
    $('lock').hidden = pro;
    $('out-btns').dataset.pro = String(pro);
    if (d.problem) {
      $('figs').innerHTML = `<div class="pt-fig"><span class="pt-fig-l">Next</span><span class="pt-fig-s">${esc(d.problem)}</span></div>`;
      $('disclosure').innerHTML = ''; $('method').hidden = true; $('letter').innerHTML = ''; $('ans-sub').textContent = '';
      return;
    }
    $('method').hidden = false;
    const cur = S.currency;
    const money = x => (pro ? (x == null ? 'n/a' : esc(LT.money('en', x, cur))) : '<span class="pt-mask" role="img" aria-label="Figure shown in Pro"></span>');
    const req = d.req;
    if (d.ent) {
      const e = d.ent;
      const other = e.otherSex === 'M' ? 'men' : 'women';
      $('ans-sub').textContent = `Germany, Entgelttransparenzgesetz: comparison pay for ${e.category}, from the ${other} who do that work.`;
      $('figs').innerHTML =
        `<div class="pt-fig"><span class="pt-fig-l">Comparison activity</span><span class="pt-fig-v">${int(e.n)} ${other}</span><span class="pt-fig-s">${esc(e.category)}: ${int(e.count)} of ${int(e.total)} in the averages are ${other} (${e.share == null ? 'n/a' : Math.round(e.share)}%)</span></div>` +
        `<div class="pt-fig"><span class="pt-fig-l">Comparison pay, median per month</span><span class="pt-fig-v" data-figure="median">${e.withheld ? 'Not stated' : money(e.median)}</span><span class="pt-fig-s">${e.withheld ? 'Fewer than six of the other sex do this work (§ 12(3)).' : 'Full-time equivalent, average monthly gross pay (§ 11(3)).'}</span></div>` +
        `<div class="pt-fig"><span class="pt-fig-l">Variable pay, median per month</span><span class="pt-fig-v" data-figure="variable">${e.withheld || e.variableMedian == null ? 'n/a' : money(e.variableMedian)}</span><span class="pt-fig-s">One pay component, if the worker asked for it.</span></div>`;
      $('disclosure').innerHTML = e.missingFte ? '<p class="pt-warn">Some of them have no full-time equivalent: map the FTE column or the hours column, so pay can be converted to full time.</p>' : '';
      $('method').textContent = 'Each person’s pay for the year (basic plus complementary or variable) is divided by their full-time equivalent and by 12; the median is the middle value, or the mean of the two middle values. The answer is due within three months of receipt under § 15(3), for employers without a collective pay agreement.';
    } else {
      const a = d.ans, w = d.letter.women, m = d.letter.men;
      const show = S.payBasis;
      const pair = (x, n) => {
        if (!n) return '<span class="pt-fig-s">None in this category</span>';
        const parts = [];
        if (show !== 'hourly') parts.push(`<span class="pt-fig-v">${money(x.annual)}</span><span class="pt-fig-s">a year${S.parttime === 'fte' ? ', full-time equivalent' : ''}</span>`);
        if (show !== 'annual') parts.push(`<span class="pt-fig-${show === 'hourly' ? 'v' : 's'}">${money(x.hourly)}${show === 'hourly' ? '</span><span class="pt-fig-s">an hour' : ' an hour'}</span>`);
        return parts.join('');
      };
      const wTxt = w.withheld ? '<span class="pt-fig-v">Left out</span><span class="pt-fig-s">See below</span>' : pair(w, w.n);
      const mTxt = m.withheld ? '<span class="pt-fig-v">Left out</span><span class="pt-fig-s">See below</span>' : pair(m, m.n);
      $('ans-sub').textContent = `${req.id || 'Row ' + req.row} in ${a.category}. Averages over ${int(w.n)} women and ${int(m.n)} men.`;
      $('figs').innerHTML =
        `<div class="pt-fig"><span class="pt-fig-l">Their pay level</span>${a.own.annual == null && a.own.hourly == null ? '<span class="pt-fig-s">No usable pay for this worker in the file</span>' : pair(a.own, 1)}</div>` +
        `<div class="pt-fig"><span class="pt-fig-l">Women (${int(w.n)})</span>${wTxt}</div>` +
        `<div class="pt-fig"><span class="pt-fig-l">Men (${int(m.n)})</span>${mTxt}</div>`;
      const warn = a.disclosure.map(f => {
        const g = f.sex === 'F' ? 'women' : 'men', one = f.sex === 'F' ? 'woman' : 'man';
        const why = f.reason === 'one' ? `There is one ${one} in ${esc(a.category)}, so the ${g}’s average is that person’s pay.` : `There are two ${g} in ${esc(a.category)} and the worker who asked is one of them, so from the average and their own pay they can work out the other person’s pay.`;
        return `<div class="pt-warn"><strong>Giving the ${g}’s average would disclose a colleague’s pay.</strong> ${why} The directive sets no minimum group size; it lets each country decide that such figures go only to workers’ representatives, the labour inspectorate or the equality body (Article 12(3)). Check your national rule before you include it.<div class="pt-radios" role="radiogroup" aria-label="The ${g}’s average"><label><input type="radio" name="inc-${f.sex}" value="out"${S.include[f.sex] ? '' : ' checked'} data-include="${f.sex}"> Leave it out of the letter</label><label><input type="radio" name="inc-${f.sex}" value="in"${S.include[f.sex] ? ' checked' : ''} data-include="${f.sex}"> Include it</label></div></div>`;
      }).join('');
      const fteWarn = a.missingFte ? '<p class="pt-warn">Some workers in this category have no full-time equivalent, so their annual pay is left out of the full-time averages. Map the FTE or hours column.</p>' : '';
      $('disclosure').innerHTML = warn + fteWarn;
      $('method').textContent = `${S.payBasis === 'hourly' ? 'Hourly pay' : S.payBasis === 'annual' ? 'Annual pay' : 'Annual and hourly pay'}: the mean for the women and for the men in ${a.category}, the worker included in their own group. Pay is basic plus complementary or variable pay for ${S.year}. ${S.parttime === 'fte' ? 'Annual pay of part-timers is divided by their full-time equivalent.' : 'Annual pay is as paid, so it is lower for part-timers; hourly pay is not affected by hours.'}`;
    }
    const L = LT.answerLetter(d.letter);
    $('letter').innerHTML = letterHTML(L, !pro);
    $('letter').setAttribute('lang', S.lang);
    $('log-note').textContent = `${S.logPrev.length ? `${int(S.logPrev.length)} earlier request${S.logPrev.length === 1 ? '' : 's'} loaded. ` : ''}${S.logEntries.length ? `${int(S.logEntries.length)} added in this session. ` : ''}Each answer you download is added to the log.`;
  }

  // ---------- Exports (Pro) ----------
  function loadScript(src) { return new Promise((resolve, reject) => { const s = document.createElement('script'); s.src = src; s.onload = resolve; s.onerror = () => reject(new Error('Could not load ' + src)); document.head.appendChild(s); }); }
  let libs = null;
  function pdfLibs() {
    if (!libs) libs = (async () => {
      if (!window.PayGapReport) await loadScript('/pay-gap-report/report.js');
      if (!window.PDFLib) await loadScript('/pay-gap-report/vendor/pdf-lib.min.js');
      if (!window.PayTransPDF) await loadScript('/pay-transparency/letterpdf.js');
      return window.PDFLib;
    })().catch(e => { libs = null; throw e; });
    return libs;
  }
  const slug = s => String(s || '').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 40);
  function requirePro(why) { return PRO_READY && PeakLicense.requirePro(why); }

  function logEntry(d) {
    const req = d.req, rule = d.rule;
    const ruleLabel = rule.mode === 'statutory' ? rule.regime.short.en : rule.mode === 'upcoming' ? `Directive Art. 7 (voluntary; ${rule.upcoming.short.en} from ${rule.upcoming.from})` : 'Directive Art. 7 (voluntary)';
    const e = { received: S.received, due: rule.due, answered: today, country: S.country, rule: ruleLabel, lang: S.lang, employeeId: req.id || `row ${req.row}`, name: d.letter.workerName, category: d.letter.category, parttime: S.parttime === 'fte' ? 'full-time equivalent' : 'as paid' };
    if (d.ent) {
      Object.assign(e, { women: d.ent.otherSex === 'F' ? d.ent.n : '', men: d.ent.otherSex === 'M' ? d.ent.n : '', given: d.ent.withheld ? 'comparison pay not stated (§ 12(3) EntgTranspG)' : 'yes', notes: d.ent.withheld ? '' : `EntgTranspG comparison pay, median per month, full time: ${d.ent.median == null ? '' : d.ent.median.toFixed(2)}` });
    } else {
      const a = d.ans, w = d.letter.women, m = d.letter.men;
      Object.assign(e, { women: w.n, men: m.n, given: w.withheld || m.withheld ? 'partly: an average was left out' : 'yes', ownAnnual: a.own.annual, ownHourly: a.own.hourly, womenAnnual: w.withheld ? null : w.annual, womenHourly: w.withheld ? null : w.hourly, menAnnual: m.withheld ? null : m.annual, menHourly: m.withheld ? null : m.hourly, notes: a.disclosure.map(f => `${f.sex === 'F' ? 'women' : 'men'}: ${f.reason === 'one' ? 'one person' : 'two incl. the requester'}${S.include[f.sex] ? ', included' : ', left out'}`).join('; ') });
    }
    const key = `${e.employeeId}|${e.received}`;
    const i = S.logEntries.findIndex(x => `${x.employeeId}|${x.received}` === key);
    if (i > -1) { e.id = S.logEntries[i].id; S.logEntries[i] = e; } else { e.id = E.nextRequestId(S.logPrev, S.logEntries); S.logEntries.push(e); }
  }

  async function exportAnswer(kind) {
    if (!requirePro('The answer letter, its PDF and the request log are part of Pro. The categories and headcounts stay free.')) return;
    V = compute();
    const d = answerData(false);
    if (d.problem) return say(d.problem);
    const L = LT.answerLetter(d.letter);
    const base = `pay-information-answer-${slug(d.req.id || 'row-' + d.req.row)}-${today}`;
    const btn = $(kind === 'pdf' ? 'x-pdf' : 'x-txt'), label = btn.textContent;
    try {
      btn.disabled = true;
      if (kind === 'pdf') {
        btn.textContent = 'Preparing the PDF…';
        const PDFLib = await pdfLibs();
        const bytes = await window.PayTransPDF.letterPDF(PDFLib, L, { title: L.subject, author: S.employer });
        PeakUI.download(new Blob([bytes], { type: 'application/pdf' }), base + '.pdf');
      } else {
        PeakUI.download(new Blob(['﻿' + LT.toText(L).replace(/\n/g, '\r\n')], { type: 'text/plain;charset=utf-8' }), base + '.txt');
      }
      logEntry(d);
      render();
      say(kind === 'pdf' ? 'Answer PDF downloaded and added to the request log.' : 'Answer text downloaded and added to the request log.');
    } catch (e) {
      console.error(e);
      say('The export failed. Try again, or use the text version.');
    } finally { btn.disabled = false; btn.textContent = label; }
  }
  function exportLog() {
    if (!requirePro('The request log is part of Pro.')) return;
    if (!S.logEntries.length && !S.logPrev.length) return say('The log is empty: download an answer first, or continue an earlier log.');
    PeakUI.download(new Blob([E.logCSV(S.logEntries, S.logPrev)], { type: 'text/csv;charset=utf-8' }), `pay-information-request-log-${today}.csv`);
    say('Request log downloaded.');
  }
  async function loadLog(file) {
    if (!file) return;
    const res = E.readLog(P.decodeText(new Uint8Array(await file.arrayBuffer())));
    if (res.error) return say(res.error);
    S.logPrev = res.rows;
    render();
    say(`${res.rows.length} earlier request${res.rows.length === 1 ? '' : 's'} loaded. New answers are added after them.`);
  }
  function noticeLetter() {
    return LT.annualNotice({ lang: S.lang, country: S.country, opts: opts(), date: today, employer: S.employer, contact: S.contact, criteriaWhere: S.criteriaWhere, signatory: S.signatory });
  }
  async function exportNotice(kind) {
    if (!requirePro('The yearly notice in three languages is part of Pro. A preview is free on the annual notice page.')) return;
    const L = noticeLetter();
    const base = `pay-information-yearly-notice-${S.lang}-${today}`;
    try {
      if (kind === 'pdf') {
        const PDFLib = await pdfLibs();
        PeakUI.download(new Blob([await window.PayTransPDF.letterPDF(PDFLib, L, { title: L.subject, author: S.employer })], { type: 'application/pdf' }), base + '.pdf');
      } else PeakUI.download(new Blob(['﻿' + LT.toText(L).replace(/\n/g, '\r\n')], { type: 'text/plain;charset=utf-8' }), base + '.txt');
      say('Yearly notice downloaded.');
    } catch (e) { console.error(e); say('The export failed. Try again, or use the text version.'); }
  }
  function exportCriteria() {
    if (!requirePro('The pay criteria template is part of Pro.')) return;
    const L = LT.criteriaTemplate({ lang: S.lang, employer: S.employer, date: today });
    PeakUI.download(new Blob(['﻿' + LT.toText(L).replace(/\n/g, '\r\n')], { type: 'text/plain;charset=utf-8' }), `pay-criteria-template-${S.lang}-${today}.txt`);
    say('Pay criteria template downloaded.');
  }

  // ---------- Events ----------
  PeakUI.drop($('drop'), files => readFile(files[0]));
  $('replace').addEventListener('click', () => $('file2').click());
  $('file2').addEventListener('change', e => { const f = e.target.files[0]; e.target.value = ''; if (f) readFile(f); });
  const tool = $('tool');
  ['dragenter', 'dragover'].forEach(n => tool.addEventListener(n, e => { if (tool.dataset.state === 'ready' && e.dataTransfer && [...e.dataTransfer.types].includes('Files')) { e.preventDefault(); tool.classList.add('is-over'); } }));
  ['dragleave', 'drop'].forEach(n => tool.addEventListener(n, e => { if (n === 'dragleave' && tool.contains(e.relatedTarget)) return; tool.classList.remove('is-over'); }));
  tool.addEventListener('drop', e => { if (tool.dataset.state !== 'ready') return; e.preventDefault(); if (e.dataTransfer.files.length) readFile(e.dataTransfer.files[0]); });
  $('sample').addEventListener('click', () => loadSample(true));
  $('sample-clear').addEventListener('click', reset);
  $('reset').addEventListener('click', reset);
  $('map-body').addEventListener('change', e => {
    const sel = e.target.closest('select[data-field]'); if (!sel) return;
    const key = sel.dataset.field, idx = Number(sel.value);
    for (const k of Object.keys(S.mapping)) if (k !== key && S.mapping[k] === idx && idx > -1) S.mapping[k] = -1;
    S.mapping[key] = idx;
    if (key === 'hours') S.hoursMode = E.guessHoursMode(S.table, S.mapping);
    render();
  });
  $('hours-mode').addEventListener('change', e => { S.hoursMode = e.target.value; render(); });
  $('ft-week').addEventListener('change', e => { const v = Number(e.target.value); if (v > 0 && v <= 60) S.ftWeek = v; render(); });
  $('checks').addEventListener('change', e => {
    const r = e.target.closest('input[data-choice]'); if (r) { S.choices[r.dataset.choice] = r.value; render(); return; }
    const s = e.target.closest('select[data-sex]'); if (s) { S.sexMap[s.dataset.sex] = s.value; render(); }
  });
  $('checks').addEventListener('click', e => { if (e.target.closest('[data-unmap]')) { S.sexMap = {}; render(); } });
  const bind = (id, key, num) => $(id).addEventListener('change', e => { S[key] = num ? Number(e.target.value) : e.target.value; render(); });
  bind('year', 'year', true); bind('currency', 'currency');
  bind('country', 'country'); bind('de-basis', 'deBasis'); bind('be-sector', 'beSector'); bind('cmp', 'cmp'); bind('lang', 'lang'); bind('pay-basis', 'payBasis'); bind('parttime', 'parttime');
  $('worker').addEventListener('change', e => { S.workerRow = e.target.value === '' ? null : Number(e.target.value); S.workerName = ''; S.include = {}; S.cmp = ''; render(); });
  $('received').addEventListener('change', e => { if (R.parseISO(e.target.value)) { S.received = e.target.value; render(); } });
  for (const [id, k] of [['worker-name', 'workerName'], ['employer', 'employer'], ['signatory', 'signatory'], ['signatory-title', 'signatoryTitle'], ['criteria-where', 'criteriaWhere'], ['contact', 'contact']]) {
    $(id).addEventListener('input', e => { S[k] = e.target.value; });
    $(id).addEventListener('change', () => render());
  }
  $('disclosure').addEventListener('change', e => { const r = e.target.closest('input[data-include]'); if (r) { S.include[r.dataset.include] = r.value === 'in'; render(); } });
  $('x-pdf').addEventListener('click', () => exportAnswer('pdf'));
  $('x-txt').addEventListener('click', () => exportAnswer('txt'));
  $('x-log').addEventListener('click', exportLog);
  $('log-load').addEventListener('click', () => { if (requirePro('The request log is part of Pro.')) $('log-file').click(); });
  $('log-file').addEventListener('change', e => { const f = e.target.files[0]; e.target.value = ''; loadLog(f); });
  $('x-notice').addEventListener('click', () => exportNotice('pdf'));
  $('x-notice-txt').addEventListener('click', () => exportNotice('txt'));
  $('x-criteria').addEventListener('click', exportCriteria);

  // Start: the country from ?country=, else from the browser's region if it is an EU member state.
  try {
    const q = (new URLSearchParams(location.search).get('country') || '').toUpperCase();
    const region = (((navigator.languages && navigator.languages[0]) || navigator.language || '').split('-')[1] || '').toUpperCase();
    if (R.BY_CODE[q]) S.country = q; else if (R.BY_CODE[region]) S.country = region;
    const l = (new URLSearchParams(location.search).get('lang') || '').toLowerCase();
    if (['en', 'de', 'nl'].includes(l)) S.lang = l;
  } catch (e) { /* no query string */ }

  PeakLicense.setup(LICENSE);
  S.pro = PRO_READY && PeakLicense.isPro();
  PeakLicense.onChange(pro => { S.pro = PRO_READY && pro; render(); });
  render();
})();
