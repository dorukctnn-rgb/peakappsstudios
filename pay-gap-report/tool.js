/* Pay Gap Report: page logic. Engine: paygap.js (window.PayGap). Exports: report.js (window.PayGapReport).
 * The payroll file is read with File.arrayBuffer() on this page and never sent anywhere. There are no analytics here.
 * pdf-lib loads only when a Pro user asks for the PDF. */
(function () {
  'use strict';

  // ---- Gumroad Pro product, permalink pay-gap-report-pro. Gumroad requires the product id for products made after 2023.
  // Fail closed: while this is 'PENDING' (or empty) Pro never turns on, whatever is stored in the browser.
  const PAYGAP_PRO_PRODUCT_ID = 'zIfk0-uD6CxTjogKFQiTKg==';
  const PRO_READY = !!PAYGAP_PRO_PRODUCT_ID && PAYGAP_PRO_PRODUCT_ID !== 'PENDING';
  const LICENSE = {
    tool: 'pay-gap-report',
    productId: PRO_READY ? PAYGAP_PRO_PRODUCT_ID : 'PENDING',
    permalink: 'pay-gap-report-pro',
    buyUrl: 'https://dorukctn.gumroad.com/l/pay-gap-report-pro',
    pitch: 'Pro works out every statutory measure for your regime and writes the PDF report, the figures CSV and the excluded rows CSV. $79, once, per organisation.',
  };
  const PDFLIB_SRC = '/pay-gap-report/vendor/pdf-lib.min.js';
  const MAX_BYTES = 50 * 1024 * 1024;

  const P = window.PayGap, X = window.PayGapReport;
  const $ = id => document.getElementById(id);
  const esc = s => String(s == null ? '' : s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const int = n => Number(n).toLocaleString('en-GB');
  const now = new Date();
  const Y = now.getFullYear(), M1 = now.getMonth() + 1, D1 = now.getDate();
  const onOrAfter = (m, d) => M1 > m || (M1 === m && D1 >= d);
  const DEFAULTS = {
    uk_private: onOrAfter(4, 5) ? Y : Y - 1,
    uk_public: onOrAfter(3, 31) ? Y : Y - 1,
    ireland: `${onOrAfter(6, 1) ? Y : Y - 1}-06-30`,
    eu: onOrAfter(6, 7) ? Y : Y - 1,
  };

  const S = {
    regime: 'uk_private', table: null, mapping: null, sexMap: {},
    choices: { duplicates: 'first', outliers: 'keep', noPay: 'hourly' },
    payPeriod: 'monthly', hoursMode: 'total', hoursGuess: null,
    employer: '', ukYear: { uk_private: DEFAULTS.uk_private, uk_public: DEFAULTS.uk_public }, ieDate: DEFAULTS.ireland, euYear: DEFAULTS.eu,
    sample: false, confirmed: false, pro: false, narrative: {}, signer: { name: '', title: '' },
  };
  let V = null;

  const REGIME_NOTE = {
    uk_private: 'Employers in Great Britain with 250 or more employees on 5 April. Six measures, published within 12 months with a written statement signed by a director or equivalent (SI 2017/172).',
    uk_public: 'Public authorities in England, and the bodies listed in Schedule 2, with 250 or more employees on 31 March. Six measures, published within 12 months (SI 2017/353). Scotland and Wales have their own duties.',
    ireland: 'Employers with 50 or more employees on a snapshot date they choose in June. Eleven measures, published not later than 5 months after that date (S.I. No. 264 of 2022, as amended).',
    eu: 'Directive (EU) 2023/970, Article 9: indicators (a) to (g) on the previous calendar year. Employers with 150 or more workers report first, by 7 June 2027.',
  };
  const NEEDS = {
    uk: ['One row per relevant employee: everyone employed on the snapshot date, including part-time staff and people on leave.', 'Sex, and either the hourly rate of pay or the ordinary pay for the pay period that includes the snapshot date with weekly working hours.', 'Bonus pay paid in the 12 months to the snapshot date, and a full pay column marking anyone on reduced or nil pay because of leave.'],
    ie: ['One row per employee on your snapshot date in June.', 'Sex, ordinary pay and bonus for the 12 months to that date, and the hours worked in those 12 months, or the hourly remuneration.', 'Y or N columns for part-time employees, temporary contracts and benefits in kind.'],
    eu: ['One row per worker employed in the reference year.', 'Sex, basic pay and complementary or variable pay for the year, and the hours paid, or gross hourly pay.', 'The category of workers each person belongs to, for indicator (g).'],
  };
  const R = () => P.REGIMES[S.regime];

  // ---------- Files ----------
  async function readFile(file) {
    if (!file) return;
    if (file.size > MAX_BYTES) return say(`${file.name} is larger than 50 MB, which is more than a payroll export of one row per employee should be.`);
    if (/\.xls$/i.test(file.name)) return say('That is an old Excel .xls file. Save it as XLSX or CSV in Excel, then drop it here.');
    if (!/\.(csv|tsv|txt|xlsx)$/i.test(file.name)) return say('Choose a CSV or XLSX file.');
    let table;
    try {
      table = await P.readTable(file.name, new Uint8Array(await file.arrayBuffer()));
    } catch (e) {
      return say(/xls/.test(e.message) ? 'That is an old Excel .xls file. Save it as XLSX or CSV, then drop it here.' : 'That file could not be read as CSV or XLSX. Save it again from your payroll or spreadsheet program and try once more.');
    }
    if (!table.headers.filter(Boolean).length || !table.body.length) return say(`${file.name} has no rows under a header row.`);
    load(table, false);
    say(`Read ${file.name}: ${int(table.body.length)} rows.`);
  }
  function guessHours(table, mapping) {
    if (!(mapping.hours > -1)) return null;
    const vals = table.body.map(b => P.parseNumber(b.cells[mapping.hours], false)).filter(v => Number.isFinite(v) && v > 0);
    const med = P.median(vals);
    return med == null ? null : med;
  }
  function load(table, sample) {
    S.table = table; S.sample = sample;
    S.mapping = P.detectMapping(table.headers);
    S.sexMap = {};
    S.choices = { duplicates: 'first', outliers: 'keep', noPay: 'hourly' };
    S.confirmed = sample;
    const med = guessHours(table, S.mapping);
    S.hoursGuess = med;
    S.hoursMode = R().area !== 'uk' && med != null && med <= 80 ? 'weekly' : 'total';
    if (sample && !S.employer) S.employer = P.SAMPLE.employer;
    render();
  }
  async function loadSample(scroll) {
    const t = await P.readTable(`sample-company-${R().area === 'uk' ? 'uk' : 'annual'}.csv`, P.sampleCSV(S.regime));
    load(t, true);
    if (scroll) $('tool').scrollIntoView({ behavior: matchMedia('(prefers-reduced-motion: reduce)').matches ? 'auto' : 'smooth', block: 'start' });
  }
  function reset(quiet) {
    S.table = null; S.mapping = null; S.sample = false; S.confirmed = false; S.sexMap = {};
    if (S.employer === P.SAMPLE.employer) S.employer = '';
    render();
    if (!quiet) say('Cleared. Drop a payroll export to start again.');
  }
  function say(msg) { $('status').textContent = msg; if (msg) PeakUI.toast(msg); }

  // ---------- Model ----------
  function mappingProblem() {
    const m = S.mapping;
    if (!(m.sex > -1)) return 'Match the column that records each employee’s sex.';
    const hasHourly = m.hourly > -1, hasPay = m.ordinary > -1 && m.hours > -1;
    if (!hasHourly && !hasPay) return R().area === 'uk' ? 'Match either the hourly rate of pay, or both ordinary pay and weekly working hours.' : 'Match either the hourly pay column, or both pay and hours.';
    return '';
  }
  function compute() {
    const built = P.buildRecords(S.table, { regime: S.regime, mapping: S.mapping, payPeriod: S.payPeriod, hoursMode: S.hoursMode, sexMap: S.sexMap });
    const rv = P.review(built.records, S.regime, S.choices);
    const res = P.compute(built.records, S.regime, { mapping: S.mapping });
    return { records: built.records, checks: rv.checks, res, problem: mappingProblem() };
  }
  function periodFor() {
    if (S.regime === 'ireland') return { date: S.ieDate };
    if (S.regime === 'eu') return { year: S.euYear };
    return { year: S.ukYear[S.regime] };
  }

  // ---------- Render ----------
  function render() {
    renderRegime();
    const has = !!S.table;
    $('tool').dataset.state = has ? 'ready' : 'empty';
    $('empty').hidden = has;
    $('ready').hidden = !has;
    if (!has) { V = null; return; }
    V = compute();
    renderFile(); renderMapping(); renderChecks(); renderResults();
  }

  function renderRegime() {
    $('regime').querySelectorAll('button').forEach(b => b.setAttribute('aria-pressed', String(b.dataset.value === S.regime)));
    $('regime-note').textContent = REGIME_NOTE[S.regime];
    $('needs').innerHTML = NEEDS[R().area].map(t => `<li><span>${esc(t)}</span></li>`).join('');
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
    const fields = P.fieldsFor(S.regime);
    const opts = ['<option value="-1">Not in the file</option>'].concat(S.table.headers.map((h, i) => `<option value="${i}">${esc(h || `Column ${i + 1}`)}</option>`)).join('');
    const missing = new Set();
    const m = S.mapping;
    if (!(m.sex > -1)) missing.add('sex');
    if (!(m.hourly > -1) && !(m.ordinary > -1 && m.hours > -1)) { if (!(m.ordinary > -1)) missing.add('ordinary'); if (!(m.hours > -1)) missing.add('hours'); }
    const why = {
      hourly: 'Leave empty to work it out from pay and hours',
      bonusPeriod: 'Already prorated to the pay period (reg. 6, step 3)',
      payPeriod: 'Rows without one use the default pay period',
      fullPay: 'N for anyone paid less, or nothing, because of leave',
      category: 'Same work or work of equal value (Art. 3(1)(h))',
    };
    $('map-body').innerHTML = fields.map(f => {
      const idx = m[f.key] != null ? m[f.key] : -1;
      return `<tr class="${missing.has(f.key) ? 'is-missing' : ''}"><th scope="row">${esc(f.label)}${why[f.key] ? `<small>${esc(why[f.key])}</small>` : ''}</th><td><select class="select" data-field="${f.key}" aria-label="${esc(f.label)}">${opts.replace(`value="${idx}"`, `value="${idx}" selected`)}</select></td><td class="pg-map-ex">${esc(firstValue(idx).slice(0, 40))}</td></tr>`;
    }).join('');
    const a = R().area;
    let basis = '';
    if (a === 'uk') {
      basis = `<label class="field"><span>Pay period, for rows without one</span><select class="select" id="pay-period">${['weekly', 'fortnightly', 'four-weekly', 'monthly'].map(p => `<option value="${p}"${S.payPeriod === p ? ' selected' : ''}>${p[0].toUpperCase() + p.slice(1)}</option>`).join('')}</select></label>
        <p class="hint">Pay for the period becomes a weekly amount: multiplied by 7 and divided by the days in the period, with a month counted as 30.44 days (reg. 6). Then it is divided by weekly working hours.</p>`;
      if (S.hoursGuess != null && S.hoursGuess > 100) basis += `<p class="warn">The hours column has a typical value of ${esc(S.hoursGuess.toFixed(1))}. UK hourly pay uses weekly working hours; check this column.</p>`;
    } else {
      basis = `<label class="field"><span>The hours column holds</span><select class="select" id="hours-mode"><option value="total"${S.hoursMode === 'total' ? ' selected' : ''}>Hours for the whole ${a === 'ie' ? '12 months' : 'year'}</option><option value="weekly"${S.hoursMode === 'weekly' ? ' selected' : ''}>Weekly hours, times 52.18</option></select></label>
        <p class="hint">${a === 'ie' ? 'Reg. 4 uses the total working hours in the 12 months to the snapshot date. Weekly hours are multiplied by 52.18; use real totals for anyone who joined or changed hours during the year.' : 'Hourly pay is pay for the year divided by the hours paid in the year. Weekly hours are multiplied by 52.18; use real totals for anyone who joined during the year.'}</p>`;
      if (S.hoursGuess != null) basis += `<p class="hint">Typical value in the file: ${esc(S.hoursGuess.toFixed(1))} hours.</p>`;
    }
    basis += `<p class="hint">${a === 'uk' ? 'Ordinary pay is for the pay period that includes the snapshot date; bonus pay is for the 12 months ending on it.' : a === 'ie' ? 'Ordinary pay, which in Ireland includes overtime, and bonus are for the 12 months ending on the snapshot date.' : 'Basic pay and complementary or variable pay are for the reference year.'}</p>`;
    $('basis').innerHTML = basis;
    const prob = V.problem;
    $('map-warn').hidden = !prob;
    $('map-warn').textContent = prob;
  }

  function renderChecks() {
    const step = $('checks-step');
    if (V.problem) { step.hidden = true; return; }
    step.hidden = false;
    const html = V.checks.map(c => {
      let extra = '';
      if (c.choice) extra += `<div class="ck-choice" role="radiogroup" aria-label="${esc(c.title)}">${c.choice.options.map(([v, l]) => `<label><input type="radio" name="ck-${c.choice.name}" data-choice="${c.choice.name}" value="${v}"${c.choice.value === v ? ' checked' : ''}> ${esc(l)}</label>`).join('')}</div>`;
      if (c.values) extra += `<div class="ck-values">${c.values.map(v => `<div class="ck-value"><code>${esc(v.raw === '' ? '(blank)' : v.raw)}</code><span class="muted">${v.count} row${v.count > 1 ? 's' : ''}</span><select class="select" data-sex="${esc(v.raw)}" aria-label="Treat ${esc(v.raw || 'blank')} as"><option value="X">Leave out of the figures</option><option value="M">Male</option><option value="F">Female</option></select></div>`).join('')}</div>`;
      const mapped = Object.keys(S.sexMap).filter(k => S.sexMap[k] === 'M' || S.sexMap[k] === 'F');
      if (c.id === 'sex' && mapped.length) extra += `<p class="ck-text">Matched by you: ${mapped.map(k => `${esc(k || '(blank)')} as ${S.sexMap[k] === 'M' ? 'male' : 'female'}`).join(', ')}. <button type="button" class="linklike" data-unmap>Undo</button></p>`;
      if (c.rows && c.rows.length && c.state !== 'ok') {
        const list = c.rows.slice(0, 60).map(r => `<li>Row ${r.row}${r.id ? `, ${esc(r.id)}` : ''}${r.hourly != null ? `, ${esc(P.money(r.hourly, R().currency))} an hour` : ''}${r.fields ? `, ${esc(r.fields.map(k => P.fieldLabel(k, S.regime)).join(', '))}` : ''}</li>`).join('');
        extra += `<details><summary>Show ${c.rows.length > 60 ? 'the first 60 rows' : c.rows.length === 1 ? 'the row' : `the ${c.rows.length} rows`}</summary><ul class="ck-rows">${list}</ul></details>`;
      }
      return `<li data-state="${c.state}" data-check="${c.id}"><span class="ck-body"><strong>${esc(c.title)}</strong>${c.text ? `<span class="ck-text">${esc(c.text)}</span>` : ''}${extra}</span></li>`;
    }).join('');
    $('checks').innerHTML = html;
    // Restore the sex value matches the user made (the selects default to "leave out")
    $('checks').querySelectorAll('select[data-sex]').forEach(sel => { const v = S.sexMap[sel.dataset.sex]; if (v) sel.value = v; });
    const h = V.res.headcount;
    $('confirm').hidden = S.confirmed;
    $('confirm-note').textContent = S.confirmed
      ? 'The figures below update when you change anything above.'
      : `${int(h.relevant)} of ${int(V.records.length)} rows go into the figures${h.leftOut ? `; ${int(h.leftOut)} left out of every figure` : ''}${h.leftOutHourly ? `; ${int(h.leftOutHourly)} only out of the hourly figures` : ''}.`;
  }

  function lockIcon() { return '<svg width="11" height="11" viewBox="0 0 14 14" aria-hidden="true"><rect x="2.5" y="6" width="9" height="6.5" rx="1.2" fill="none" stroke="currentColor" stroke-width="1.4"/><path d="M4.5 6V4.5a2.5 2.5 0 0 1 5 0V6" fill="none" stroke="currentColor" stroke-width="1.4"/></svg>'; }

  function renderResults() {
    const show = !V.problem && S.confirmed;
    $('results').hidden = !show;
    if (!show) return;
    const reg = R(), res = V.res, h = res.headcount, cur = res.currency, pro = S.pro;
    const d = P.dates(S.regime, periodFor());
    const money = v => P.money(v, cur);
    const who = reg.area === 'eu' ? 'workers' : 'employees';
    // Settings
    if (document.activeElement !== $('employer')) $('employer').value = S.employer;
    $('year-f').hidden = S.regime === 'ireland';
    $('date-f').hidden = S.regime !== 'ireland';
    if (S.regime === 'ireland') {
      $('ie-date').value = S.ieDate;
      const yy = Number(S.ieDate.slice(0, 4));
      $('ie-date').min = `${yy}-06-01`; $('ie-date').max = `${yy}-06-30`;
    } else {
      const eu = S.regime === 'eu';
      $('year-l').textContent = eu ? 'Reference year' : 'Snapshot year';
      const cur0 = eu ? S.euYear : S.ukYear[S.regime];
      const from = eu ? 2025 : 2017, to = Math.max(Y, cur0) + (eu ? 1 : 0);
      const years = []; for (let yy = to; yy >= from; yy--) years.push(yy);
      $('year').innerHTML = years.map(yy => `<option value="${yy}"${yy === cur0 ? ' selected' : ''}>${eu ? yy : `${yy} (${S.regime === 'uk_private' ? '5 April' : '31 March'})`}</option>`).join('');
    }
    const sched = reg.area === 'eu' ? P.euSchedule(h.total) : null;
    $('dates').innerHTML = reg.area === 'eu'
      ? `Reference year ${d.referenceYear}, 1 January to 31 December. ${int(h.total)} workers in the file (${esc(sched.band)}). ${esc(sched.text)}`
      : reg.area === 'ie'
        ? `Snapshot date <strong>${esc(P.longDate(d.snapshot))}</strong>. Pay period ${esc(P.longDate(d.periodFrom))} to ${esc(P.longDate(d.periodTo))}. Publish not later than <strong>${esc(P.longDate(d.deadline))}</strong>.`
        : `Snapshot date <strong>${esc(P.longDate(d.snapshot))}</strong>. Bonus period ${esc(P.longDate(d.bonusFrom))} to ${esc(P.longDate(d.bonusTo))}. Publish by <strong>${esc(P.longDate(d.deadline))}</strong>.`;
    const required = reg.area === 'eu' ? null : h.total >= reg.threshold;
    $('res-sub').textContent = `${reg.name}. ${reg.area === 'eu' ? '' : required ? `${int(h.total)} ${who} in the file: at or above the threshold of ${reg.threshold}.` : `${int(h.total)} ${who} in the file: below the threshold of ${reg.threshold}, so reporting would be voluntary.`}`.trim();

    // Headcount
    $('headcount').innerHTML = `<div><dt class="pg-count-h">${reg.area === 'eu' ? 'Workers' : 'Employees'} in the file</dt><dd></dd></div>` +
      `<div><dt>Men</dt><dd>${int(h.men)}</dd></div><div><dt>Women</dt><dd>${int(h.women)}</dd></div>` +
      (h.neither ? `<div><dt>Recorded as neither, left out</dt><dd>${int(h.neither)}</dd></div>` : '') +
      `<div><dt>Total</dt><dd>${int(h.total)}</dd></div>` +
      `<div class="pg-count-sub"><dt>In the hourly pay figures</dt><dd>${int(h.hourlyMen)} men, ${int(h.hourlyWomen)} women</dd></div>`;

    // Headline gaps (free)
    const card = (f, label) => `<div class="pg-gap"><span class="pg-gap-l">${esc(label)}</span><span class="pg-gap-v" data-figure="${f.id}">${esc(P.pct(f.value))}</span><span class="pg-gap-ref">${esc(reg.lawShort)}, ${esc(f.ref)}</span>` +
      (f.value == null ? `<span class="pg-gap-note">${esc(f.note || '')}</span>` : `<span class="pg-gap-mw"><span>Men</span><span>${esc(money(f.men.value))}</span><span>Women</span><span>${esc(money(f.women.value))}</span></span>`) + '</div>';
    const mh = res.byId.mean_hourly, md = res.byId.median_hourly;
    $('gaps').innerHTML = card(mh, 'Mean hourly pay gap') + card(md, 'Median hourly pay gap');
    const f2 = v => (v == null ? 'n/a' : v.toFixed(2));
    const line = (f, word) => f.value == null ? `<p>${esc(word)}: ${esc(f.note || 'not available')}.</p>` :
      `<p><strong>${esc(word)}.</strong> ${word === 'Mean' ? `The average hourly pay of the ${int(f.men.n)} men is ${esc(money(f.men.value))} and of the ${int(f.women.n)} women ${esc(money(f.women.value))}.` : `The middle hourly pay for men is ${esc(money(f.men.value))} and for women ${esc(money(f.women.value))}; with an even count it is the average of the two middle values.`}</p><p class="pg-formula">(${f2(f.men.value)} − ${f2(f.women.value)}) ÷ ${f2(f.men.value)} × 100 = ${esc(P.pct(f.value))}</p>`;
    $('explain').innerHTML = `<h4>How these were worked out</h4>${line(mh, 'Mean')}${line(md, 'Median')}<p class="hint">Worked out from the unrounded figures, then rounded to one decimal place. ${reg.area === 'uk' ? 'Hourly pay is for full-pay relevant employees only.' : ''}</p>`;
    $('sign').textContent = 'Positive figures mean men are paid more on average; negative figures mean women are. Each gap is the difference as a percentage of men’s pay.';

    // Every measure
    let t = `<caption class="sr-only">Every measure for ${esc(reg.name)}</caption><thead><tr><th scope="col">Measure</th><th scope="col" class="num">Men</th><th scope="col" class="num">Women</th><th scope="col" class="num">Figure</th></tr></thead><tbody>`;
    const locked = f => !f.free && !pro;
    const refHtml = f => `<span class="pg-ref">${esc(reg.lawShort)}, ${esc(f.ref)}</span>`;
    for (const f of res.figures) {
      if (locked(f)) {
        t += `<tr class="is-locked" data-measure="${f.id}"><th scope="row">${esc(f.label)}${refHtml(f)}</th><td></td><td></td><td class="num"><span class="pg-locked">${lockIcon()} Pro</span></td></tr>`;
        continue;
      }
      const freeCls = f.free && !pro ? ' is-free' : '';
      if (f.kind === 'gap') {
        t += `<tr class="${freeCls}" data-measure="${f.id}"><th scope="row">${esc(f.label)}${refHtml(f)}${f.value == null && f.note ? `<span class="pg-note">${esc(f.note)}</span>` : ''}</th><td class="num pg-mw" data-l="Men">${f.men.value != null ? esc(money(f.men.value)) : ''}${f.men.n ? `<span class="pg-note">${int(f.men.n)} men</span>` : ''}</td><td class="num pg-mw" data-l="Women">${f.women.value != null ? esc(money(f.women.value)) : ''}${f.women.n ? `<span class="pg-note">${int(f.women.n)} women</span>` : ''}</td><td class="num" data-l="Gap" data-value="${f.id}">${esc(P.pct(f.value))}</td></tr>`;
      } else if (f.kind === 'share') {
        t += `<tr data-measure="${f.id}"><th scope="row">${esc(f.label)}${refHtml(f)}${f.men.value == null && f.note ? `<span class="pg-note">${esc(f.note)}</span>` : ''}</th><td class="num" data-l="Men" data-value="${f.id}:men">${esc(P.pct(f.men.value))}<span class="pg-note">${int(f.men.count)} of ${int(f.men.n)}</span></td><td class="num" data-l="Women" data-value="${f.id}:women">${esc(P.pct(f.women.value))}<span class="pg-note">${int(f.women.count)} of ${int(f.women.n)}</span></td><td></td></tr>`;
      } else if (f.kind === 'quartiles') {
        t += `<tr data-measure="${f.id}"><th scope="row" colspan="4">${esc(f.label)}${refHtml(f)}${f.note ? `<span class="pg-note">${esc(f.note)}</span>` : ''}</th></tr>`;
        f.bands.slice().reverse().forEach(b => {
          const i = f.bands.indexOf(b);
          t += `<tr class="is-sub" data-measure="${f.id}"><th scope="row">${esc(b.band)} band<span class="pg-note">${int(b.men + b.women)} people${b.split ? ', shared pay rate split across bands' : ''}</span></th><td class="num" data-l="Men" data-value="quartiles:${i}:men">${esc(P.pct(b.menPct))}<span class="pg-note">${int(b.men)}</span></td><td class="num" data-l="Women" data-value="quartiles:${i}:women">${esc(P.pct(b.womenPct))}<span class="pg-note">${int(b.women)}</span></td><td></td></tr>`;
        });
      } else if (f.kind === 'categories') {
        t += `<tr data-measure="${f.id}"><th scope="row">${esc(f.label)}${refHtml(f)}${f.note ? `<span class="pg-note">${esc(f.note)}</span>` : ''}</th><td colspan="2" class="pg-mw">${int(f.rows.length)} categor${f.rows.length === 1 ? 'y' : 'ies'}</td><td class="num" data-l="Flagged">${int(f.flagged)} at 5% or more</td></tr>`;
      }
    }
    t += '</tbody>';
    $('measures').innerHTML = t;
    $('measures-note').textContent = pro ? `${res.figures.length} measures under ${reg.lawShort}.` : `${res.figures.length} measures under ${reg.lawShort}. The free version shows the first two.`;
    $('lock').hidden = pro;

    // Quartile chart (Pro)
    const qf = res.byId.quartiles;
    $('q-block').hidden = !pro || !qf.bands.length;
    if (pro && qf.bands.length) {
      $('q-h').textContent = reg.area === 'eu' ? '(f) Quartile pay bands' : 'Quartile pay bands';
      $('q-note').textContent = `${int(qf.n)} ${reg.area === 'uk' ? 'full-pay relevant employees' : reg.area === 'ie' ? 'relevant employees' : 'workers'} ranked by hourly pay, highest band first.`;
      $('q-chart').innerHTML = qf.bands.slice().reverse().map(b => {
        const n = b.men + b.women, wp = n ? b.women * 100 / n : 0;
        return `<div class="pg-q-row"><span class="pg-q-name">${esc(b.band)}<small>${esc(money(b.min))} to ${esc(money(b.max))}</small></span><span class="pg-q-bar" role="img" aria-label="${esc(b.band)} band: ${esc(P.pct(b.womenPct))} women, ${esc(P.pct(b.menPct))} men"><span class="w" style="width:${wp}%">${wp >= 14 ? esc(P.pct(b.womenPct)) : ''}</span><span class="m" style="width:${100 - wp}%">${100 - wp >= 14 ? esc(P.pct(b.menPct)) : ''}</span></span><span class="pg-q-n">${int(b.women)} women, ${int(b.men)} men</span></div>`;
      }).join('') + '<div class="pg-q-key"><span class="k-w">Women</span><span class="k-m">Men</span></div>';
    }

    // Categories (EU, Pro)
    const cf = res.byId.categories;
    $('cat-block').hidden = !pro || !cf;
    if (pro && cf) {
      $('cat-note').textContent = cf.uncategorised ? `${int(cf.uncategorised)} workers without a category are not in this table.` : 'Gaps per hour unless marked annual.';
      $('cat-table').innerHTML = `<caption class="sr-only">Gender pay gap by category of workers</caption><thead><tr><th scope="col">Category</th><th scope="col" class="num">Men</th><th scope="col" class="num">Women</th><th scope="col" class="num">Gap, hourly pay</th><th scope="col" class="num">Basic pay</th><th scope="col" class="num">Variable pay</th><th scope="col" class="num">Annual pay</th><th scope="col">Article 10</th></tr></thead><tbody>` +
        (cf.rows.length ? cf.rows.map(g => `<tr class="${g.flag ? 'is-flag' : ''}"><th scope="row">${esc(g.name)}</th><td class="num">${int(g.men)}</td><td class="num">${int(g.women)}</td><td class="num" data-value="cat:${esc(g.name)}">${esc(P.pct(g.hourly))}</td><td class="num">${esc(P.pct(g.basic))}</td><td class="num">${esc(P.pct(g.variable))}</td><td class="num">${esc(P.pct(g.annual))}</td><td>${g.flag ? '<span class="pg-flag">5% or more</span>' : g.annualFlag ? '<span class="pg-flag pg-flag-soft">Annual only</span>' : g.note ? `<span class="muted small">${esc(g.note)}</span>` : ''}</td></tr>`).join('') : `<tr><td colspan="8">${esc(cf.note || 'No categories in the file.')}</td></tr>`) + '</tbody>';
      $('art10').textContent = cf.flagged
        ? `${cf.flagged} categor${cf.flagged === 1 ? 'y has' : 'ies have'} an hourly gap of 5% or more. Under Article 10 the employer must carry out a joint pay assessment with workers’ representatives where such a difference is not justified on objective, gender-neutral criteria and has not been remedied within six months of submitting the report. Annual gaps are marked separately because part-time and part-year work move them.`
        : 'No category has an hourly gap of 5% or more. Article 10 sets the joint pay assessment at a difference of at least 5% in a category that the employer has not justified on objective, gender-neutral criteria or remedied within six months of submitting the report.';
    }

    // Report and exports
    const ex = $('export');
    ex.dataset.pro = String(pro);
    $('export-tag').hidden = pro;
    $('export-note').textContent = pro ? 'A4 PDF and two CSV files, built on this page.' : 'Part of Pro. The figures above stay free.';
    $('narr-l').textContent = reg.area === 'ie' ? 'Statement of the reasons for the differences and the measures taken or proposed (Reg. 6(4)). Edit the text in square brackets.' : reg.area === 'eu' ? 'Explanation of the figures, including any category at 5% or more. Edit the text in square brackets.' : 'Supporting narrative for the report. Edit the text in square brackets.';
    const view = baseView();
    const tpl = X.narrativeTemplate(view);
    const ta = $('narrative');
    if (S.narrative[S.regime] == null || S.narrative[S.regime].auto) S.narrative[S.regime] = { text: tpl, auto: true };
    if (document.activeElement !== ta) ta.value = S.narrative[S.regime].text;
    $('signer').hidden = !reg.statement;
    if (document.activeElement !== $('signer-name')) $('signer-name').value = S.signer.name;
    if (document.activeElement !== $('signer-title')) $('signer-title').value = S.signer.title;
    $('x-hint').textContent = reg.statement
      ? 'The PDF holds the figures, the quartile chart, the methodology with legal references, your narrative and the signature block for the written statement.'
      : reg.area === 'eu'
        ? 'The PDF holds indicators (a) to (g), the quartile chart, the category table with the Article 10 flags, the methodology and your explanation.'
        : 'The PDF holds the figures, the quartile chart, the methodology with legal references and your statement.';
  }

  // ---------- Exports (Pro) ----------
  function baseView() {
    return {
      P, R: R(), regimeId: S.regime, res: V.res, records: V.records, checks: V.checks, dates: P.dates(S.regime, periodFor()),
      employer: S.employer.trim(), generated: P.longDate(new Date(Date.UTC(Y, M1 - 1, D1))), signer: { name: S.signer.name.trim(), title: S.signer.title.trim() },
      file: { name: S.table.name }, sample: S.sample, hourlyGiven: V.records.some(r => r.hourlyGiven > 0),
    };
  }
  function reportView() {
    const v = baseView();
    v.narrative = S.narrative[S.regime] ? S.narrative[S.regime].text : X.narrativeTemplate(v);
    return v;
  }
  let pdfLibPromise = null;
  function loadPdfLib() {
    if (window.PDFLib) return Promise.resolve(window.PDFLib);
    if (!pdfLibPromise) pdfLibPromise = new Promise((resolve, reject) => {
      const el = document.createElement('script');
      el.src = PDFLIB_SRC;
      el.onload = () => (window.PDFLib ? resolve(window.PDFLib) : reject(new Error('pdf-lib did not load')));
      el.onerror = () => { pdfLibPromise = null; reject(new Error('pdf-lib did not load')); };
      document.head.appendChild(el);
    });
    return pdfLibPromise;
  }
  function slug() {
    const p = periodFor();
    const when = p.date ? p.date.slice(0, 4) : p.year;
    return `gender-pay-gap-${S.regime.replace('_', '-')}-${when}`;
  }
  async function doExport(kind) {
    if (!(PRO_READY && PeakLicense.requirePro('The PDF report, the figures CSV and the excluded rows CSV are part of Pro. The figures on this page stay free.'))) return;
    const btn = $(kind === 'pdf' ? 'x-pdf' : kind === 'csv' ? 'x-csv' : 'x-excl');
    const label = btn.textContent;
    try {
      btn.disabled = true;
      V = compute();
      const view = reportView();
      if (kind === 'csv') PeakUI.download(new Blob([X.figuresCSV(view)], { type: 'text/csv;charset=utf-8' }), `${slug()}-figures.csv`);
      else if (kind === 'excl') PeakUI.download(new Blob([X.exclusionsCSV(view)], { type: 'text/csv;charset=utf-8' }), `${slug()}-excluded-rows.csv`);
      else {
        btn.textContent = 'Preparing the PDF…';
        const PDFLib = await loadPdfLib();
        const bytes = await X.pdf(PDFLib, view);
        PeakUI.download(new Blob([bytes], { type: 'application/pdf' }), `${slug()}-report.pdf`);
      }
      say(kind === 'pdf' ? 'PDF report downloaded.' : kind === 'csv' ? 'Figures CSV downloaded.' : 'Excluded rows CSV downloaded.');
    } catch (e) {
      console.error(e);
      PeakUI.toast('The export failed. Try again, or email us so we can look into it.');
    } finally { btn.textContent = label; btn.disabled = false; }
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
  $('sample-clear').addEventListener('click', () => reset());
  $('reset').addEventListener('click', () => reset());
  $('sample-download').addEventListener('click', () => PeakUI.download(new Blob([P.sampleCSV(S.regime)], { type: 'text/csv;charset=utf-8' }), `sample-company-${R().area === 'uk' ? 'uk' : 'annual'}.csv`));
  PeakUI.seg($('regime'), val => {
    if (val === S.regime) return;
    S.regime = val;
    if (S.sample) { loadSample(false); say(`Sample company loaded for ${R().name}.`); return; }
    if (S.table) {
      const med = S.hoursGuess;
      S.hoursMode = R().area !== 'uk' && med != null && med <= 80 ? 'weekly' : 'total';
      say(`Now under ${R().name}. Check that pay and hours in the file cover the period this regime uses.`);
    }
    render();
  });
  $('map-body').addEventListener('change', e => {
    const sel = e.target.closest('select[data-field]');
    if (!sel) return;
    const key = sel.dataset.field, idx = Number(sel.value);
    for (const k of Object.keys(S.mapping)) if (k !== key && S.mapping[k] === idx && idx > -1) S.mapping[k] = -1;
    S.mapping[key] = idx;
    if (key === 'hours') S.hoursGuess = guessHours(S.table, S.mapping);
    render();
  });
  $('basis').addEventListener('change', e => {
    if (e.target.id === 'pay-period') S.payPeriod = e.target.value;
    if (e.target.id === 'hours-mode') S.hoursMode = e.target.value;
    render();
  });
  $('checks').addEventListener('change', e => {
    const r = e.target.closest('input[data-choice]');
    if (r) { S.choices[r.dataset.choice] = r.value; render(); return; }
    const s = e.target.closest('select[data-sex]');
    if (s) { S.sexMap[s.dataset.sex] = s.value; render(); }
  });
  $('checks').addEventListener('click', e => { if (e.target.closest('[data-unmap]')) { S.sexMap = {}; render(); } });
  $('confirm').addEventListener('click', () => {
    S.confirmed = true; render();
    $('results').scrollIntoView({ behavior: matchMedia('(prefers-reduced-motion: reduce)').matches ? 'auto' : 'smooth', block: 'start' });
  });
  $('employer').addEventListener('input', e => { S.employer = e.target.value; });
  $('employer').addEventListener('change', () => render());
  $('year').addEventListener('change', e => { const v = Number(e.target.value); if (S.regime === 'eu') S.euYear = v; else S.ukYear[S.regime] = v; render(); });
  $('ie-date').addEventListener('change', e => { if (/^\d{4}-06-\d{2}$/.test(e.target.value)) S.ieDate = e.target.value; else { say('The Irish snapshot date must be a date in June.'); } render(); });
  $('narrative').addEventListener('input', e => { S.narrative[S.regime] = { text: e.target.value, auto: false }; });
  $('signer-name').addEventListener('input', e => { S.signer.name = e.target.value; });
  $('signer-title').addEventListener('input', e => { S.signer.title = e.target.value; });
  $('x-pdf').addEventListener('click', () => doExport('pdf'));
  $('x-csv').addEventListener('click', () => doExport('csv'));
  $('x-excl').addEventListener('click', () => doExport('excl'));

  try {
    const want = new URLSearchParams(location.search).get('regime');
    if (want && P.REGIMES[want]) S.regime = want;
  } catch (e) { /* no query string */ }

  PeakLicense.setup(LICENSE);
  S.pro = PRO_READY && PeakLicense.isPro();
  PeakLicense.onChange(pro => { S.pro = PRO_READY && pro; render(); });
  render();
})();
