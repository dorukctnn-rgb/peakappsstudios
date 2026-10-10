/* Equality Action Plan: the Pro panels and exports, loaded only when a Pro row is opened.
 * The Step 1 analysis reads the HR export with File.arrayBuffer() on this page (analysis.js and the Pay Gap Report's
 * reader); nothing from the file is stored or sent. The measures tracker is saved with the plan in this browser.
 * Survey responses stay in the tab. pdf-lib loads only when a PDF is asked for. */
(function () {
  'use strict';
  let C = null;
  const A = () => window.EAPAnalysis;
  const MAX_BYTES = 50 * 1024 * 1024;
  const lock = '<span class="eap-lock" aria-hidden="true"></span>';

  function init(ctx) { C = ctx; }
  const $ = id => document.getElementById(id);

  // ---------- Step 1 analysis ----------
  function snapshotIso() { return C.R.reportingYear(C.S.plan.sector, C.S.plan.year).snapshot.iso; }
  function runAnalysis() {
    const S = C.S;
    if (!S.table) { S.built = null; S.analysis = null; return; }
    S.built = A().build(S.table, { snapshot: snapshotIso(), mapping: S.mapping });
    S.analysis = A().analyse(S.built);
  }
  async function readFile(file) {
    const S = C.S;
    if (!file) return;
    if (file.size > MAX_BYTES) return C.say(`${file.name} is larger than 50 MB, more than an HR export with one row per employee should be.`);
    if (/\.xls$/i.test(file.name)) return C.say('That is an old Excel .xls file. Save it as XLSX or CSV, then drop it here.');
    if (!/\.(csv|tsv|txt|xlsx)$/i.test(file.name)) return C.say('Choose a CSV or XLSX file.');
    try {
      const t = await window.PayGap.readTable(file.name, new Uint8Array(await file.arrayBuffer()));
      if (!t.headers.filter(Boolean).length || !t.body.length) return C.say(`${file.name} has no rows under a header row.`);
      loadTable(t, false);
      C.say(`Read ${file.name}: ${t.body.length.toLocaleString('en-GB')} rows.`);
    } catch (e) {
      C.say(/xls/.test(e.message) ? 'That is an old Excel .xls file. Save it as XLSX or CSV, then drop it here.' : 'That file could not be read as CSV or XLSX. Save it again from your HR or payroll system and try once more.');
    }
  }
  function loadTable(t, sample) {
    const S = C.S;
    S.table = t; S.tableSample = sample;
    S.mapping = A().detectMapping(t.headers);
    runAnalysis();
    renderAnalysis();
  }
  async function loadSample() {
    const t = await window.PayGap.readTable('sample-hr-export.csv', A().sampleCSV());
    loadTable(t, true);
  }
  function bars(items) {
    return `<div class="eap-bars">${items.slice().reverse().map(b => {
      const n = b.women + b.men, wp = n ? b.women * 100 / n : 0;
      return `<div class="eap-bar-row"><span>${C.esc(b.label)}</span><span class="eap-bar-track" role="img" aria-label="${C.esc(b.label)}: ${b.women} women, ${b.men} men"><span class="w" style="width:${wp}%"></span><span class="m" style="width:${100 - wp}%"></span></span><span class="eap-bar-n">${b.women} W, ${b.men} M</span></div>`;
    }).join('')}</div><div class="eap-key"><span class="k-w">Women</span><span class="k-m">Men</span></div>`;
  }
  function table(t) {
    return `<div class="table-wrap"><table><thead><tr>${t.head.map(h => `<th scope="col">${C.esc(h)}</th>`).join('')}</tr></thead><tbody>${t.rows.map(r => `<tr>${r.map((c, i) => i === 0 ? `<th scope="row">${C.esc(c)}</th>` : `<td>${C.esc(c)}</td>`).join('')}</tr>`).join('')}</tbody></table></div>`;
  }
  function renderAnalysis() {
    const S = C.S, el = $('panel-analysis'), esc = C.esc;
    const per = A().period(snapshotIso());
    const long = ms => { const d = new Date(ms); return `${d.getUTCDate()} ${C.R.MONTHS[d.getUTCMonth()]} ${d.getUTCFullYear()}`; };
    let h = `<div class="eap-panel-head"><h3 id="an-h">Step 1 analysis from your HR export</h3><p class="hint">Analysis period: ${esc(long(per.from))} to ${esc(long(per.to))}, the 12 months to the snapshot date of the reporting year chosen above.</p></div>`;
    if (!S.table) {
      h += `<div class="eap-drop drop" id="an-drop" tabindex="0" role="button" aria-describedby="an-help"><strong>Drop your HR or payroll export here</strong><span id="an-help" class="small muted">A CSV or XLSX file with one row per employee, including the people who left during the 12 months if you have them.</span><span class="btn btn-primary btn-sm" aria-hidden="true">Choose a file</span><input type="file" id="an-file" accept=".csv,.tsv,.txt,.xlsx" tabindex="-1" aria-hidden="true"></div>` +
        `<div class="eap-panel-actions"><button type="button" class="btn btn-sm btn-ink" id="an-sample">Use the sample HR export</button><button type="button" class="btn btn-sm eap-quiet" id="an-sample-dl">Download the sample file</button></div>` +
        `<p class="hint">The file is read on this page and is not uploaded or stored. Useful columns: sex, hourly pay (or pay and weekly hours), grade, start date, starting pay, bonus, promoted, grade before the promotion, leaver or leaving date, part-time, flexible working, performance rating, age or date of birth, absence days. Any column the file does not have is skipped and named.</p>`;
      el.innerHTML = h;
      window.PeakUI.drop($('an-drop'), files => readFile(files[0]));
      $('an-sample').addEventListener('click', () => loadSample());
      $('an-sample-dl').addEventListener('click', () => window.PeakUI.download(new Blob([A().sampleCSV()], { type: 'text/csv;charset=utf-8' }), 'sample-hr-export.csv'));
      return;
    }
    const t = S.table, res = S.analysis, pro = S.pro;
    h += `<div class="eap-panel-head"><p class="small"><strong>${esc(t.name)}</strong> <span class="muted">${t.kind === 'xlsx' ? 'XLSX' : 'CSV'}, ${t.body.length.toLocaleString('en-GB')} rows${S.tableSample ? ', synthetic sample data' : ''}</span></p><div class="eap-panel-actions"><button type="button" class="btn btn-sm" id="an-replace">Choose another file</button><button type="button" class="btn btn-sm eap-quiet" id="an-clear">Clear the file</button><input type="file" id="an-file2" accept=".csv,.tsv,.txt,.xlsx" hidden></div></div>`;
    // Column matching
    const opts = ['<option value="-1">Not in the file</option>'].concat(t.headers.map((x, i) => `<option value="${i}">${esc(x || `Column ${i + 1}`)}</option>`)).join('');
    const first = idx => { if (!(idx > -1)) return ''; for (const b of t.body) { const v = b.cells[idx]; if (v != null && String(v).trim() !== '') return String(v); } return ''; };
    h += `<details class="eap-map-d"${S.mapping.sex > -1 ? '' : ' open'}><summary>Columns matched: ${Object.values(S.mapping).filter(v => v > -1).length} of ${A().FIELDS.length}. Check or change them</summary><div class="table-wrap eap-map-wrap"><table class="eap-map"><thead><tr><th scope="col">What the analysis uses</th><th scope="col">Column in your file</th><th scope="col" class="eap-map-ex">First value</th></tr></thead><tbody>` +
      A().FIELDS.map(f => { const idx = S.mapping[f.key] != null ? S.mapping[f.key] : -1; return `<tr><th scope="row">${esc(f.label)}</th><td><select class="select" data-an-field="${f.key}" aria-label="${esc(f.label)}">${opts.replace(`value="${idx}"`, `value="${idx}" selected`)}</select></td><td class="eap-map-ex">${esc(first(idx).slice(0, 30))}</td></tr>`; }).join('') +
      '</tbody></table></div></details>';
    if (!(S.mapping.sex > -1)) { h += '<p class="warn">Match the column that records each employee’s sex to start the analysis.</p>'; el.innerHTML = h; bindAnalysis(); return; }
    const hc = res.headcount;
    h += `<p class="small">${hc.staff.toLocaleString('en-GB')} current employees (${hc.women} women, ${hc.men} men) and ${hc.leavers} who left during the 12 months.${hc.staff < 250 ? ' Fewer than 250 current employees: a plan is not required of this employer under section 78A, though one can still be published.' : ''}</p>`;
    if (res.checks.length) h += `<ul class="eap-checks">${res.checks.map(x => `<li>${esc(x)}</li>`).join('')}</ul>`;
    if (!pro) h += `<div class="eap-lock-bar"><p><strong>This file answers ${res.available} of the ${res.sections.length} questions below.</strong> The figures and charts are part of Pro, with the sign-off pack that carries them.</p><div class="eap-lock-actions"><a class="btn btn-primary btn-sm" data-buy-pro href="${esc(C.S.buyUrl || 'https://dorukctn.gumroad.com/l/equality-action-plan-pro')}" target="_blank" rel="noopener">Buy Pro on Gumroad</a><button type="button" class="btn btn-sm" id="an-key">Enter licence key</button></div></div>`;
    h += '<div class="eap-secs">' + res.sections.map(s => {
      let body = '';
      if (!s.ok && s.missing && s.missing.length) body = `<p class="eap-sec-missing">Skipped: the file has no ${esc(s.missing.join(', ').toLowerCase())} column.</p>`;
      else if (!s.ok) body = `<p class="eap-sec-missing">${esc(s.empty || 'No data for this in the file.')}</p>`;
      else if (!pro) body = `<p class="eap-locked-row">${lock}<span>Pro shows ${esc(s.shows)}.</span></p>`;
      else {
        body = (s.facts || []).map(f => `<p class="eap-sec-fact">${esc(f)}</p>`).join('');
        if (s.bars) body += bars(s.bars);
        if (s.table && !(s.bars && s.id === 'quartiles')) body += table(s.table);
        if (s.id === 'quartiles' && s.table) body += `<details><summary class="small">The table</summary>${table(s.table)}</details>`;
        if (s.byLevel) body += table(s.byLevel);
        if (s.basis) body += `<p class="eap-sec-basis">${esc(s.basis)}</p>`;
      }
      return `<section class="eap-sec" data-sec="${esc(s.id)}" data-ok="${s.ok}"><div class="eap-sec-head"><h4>${esc(s.title)}</h4></div><p class="eap-sec-q">${s.id === 'age' ? 'GOV.UK, on the menopause actions: ' : 'Step 1 asks: '}${esc(s.question)}</p>${body}</section>`;
    }).join('') + '</div>';
    if (pro) h += '<p class="hint">These figures go into the data appendix of the sign-off pack. They stay on this page and are not saved: drop the file again next time.</p>';
    el.innerHTML = h;
    bindAnalysis();
  }
  function bindAnalysis() {
    const S = C.S;
    const rep = $('an-replace'), f2 = $('an-file2');
    if (rep) rep.addEventListener('click', () => f2.click());
    if (f2) f2.addEventListener('change', e => { const f = e.target.files[0]; e.target.value = ''; if (f) readFile(f); });
    const clr = $('an-clear');
    if (clr) clr.addEventListener('click', () => { S.table = null; S.mapping = null; S.built = null; S.analysis = null; renderAnalysis(); C.say('File cleared.'); });
    const key = $('an-key');
    if (key) key.addEventListener('click', () => window.PeakLicense.open());
    $('panel-analysis').querySelectorAll('select[data-an-field]').forEach(sel => sel.addEventListener('change', () => {
      const k = sel.dataset.anField, idx = Number(sel.value);
      for (const x of Object.keys(S.mapping)) if (x !== k && S.mapping[x] === idx && idx > -1) S.mapping[x] = -1;
      S.mapping[k] = idx;
      runAnalysis(); renderAnalysis();
    }));
  }

  // ---------- Measures tracker ----------
  const OWN = '__own';
  function renderTracker() {
    const S = C.S, el = $('panel-tracker'), esc = C.esc, E = C.E, R = C.R;
    const rows = E.trackerRows(S.plan);
    const cmp = S.prevTracker ? E.compareTracker(rows, S.prevTracker.rows) : null;
    let h = `<div class="eap-panel-head"><h3>Measures tracker</h3><p class="hint">GOV.UK Step 5: record each action’s metric before you start it (the baseline), then measure at regular intervals with the same analysis. The metrics offered are the ones each action page suggests.</p></div>`;
    if (!rows.length) { el.innerHTML = h + '<p class="hint">Choose actions in step 2 and they appear here.</p>'; return; }
    h += `<div class="table-wrap eap-track-wrap" tabindex="0" role="region" aria-label="Measures tracker"><table class="eap-track"><thead><tr><th scope="col">Action</th><th scope="col">Metric</th><th scope="col">Baseline</th><th scope="col">Latest</th><th scope="col">Target</th><th scope="col">Owner</th><th scope="col">Review date</th><th scope="col">Notes</th>${cmp ? '<th scope="col">Last year</th><th scope="col">Change</th>' : ''}</tr></thead><tbody>`;
    for (const r of rows) {
      const a = R.BY_ID[r.id];
      const own = !a.metrics.includes(r.metric);
      const c = cmp && cmp.rows.find(x => x.current.id === r.id);
      const chg = c && c.change != null ? `${c.change > 0 ? '+' : ''}${c.change}${c.unit === '%' ? ' points' : c.unit ? ' ' + c.unit : ''}` : c && c.previous ? 'n/a' : '';
      h += `<tr data-track="${r.id}"><td class="eap-track-act">${esc(a.name)}<small>${esc(r.status)}</small></td>` +
        `<td><select class="select" data-tk="metricSel" aria-label="Metric for ${esc(a.name)}" title="${esc(r.metric)}">${a.metrics.map(m => `<option${m === r.metric ? ' selected' : ''}>${esc(m)}</option>`).join('')}<option value="${OWN}"${own ? ' selected' : ''}>Your own metric</option></select>${own ? `<input class="input" data-tk="metric" value="${esc(r.metric)}" aria-label="Your own metric for ${esc(a.name)}" style="margin-top:6px">` : ''}</td>` +
        ['baseline', 'latest', 'target', 'owner'].map(k => `<td><input class="input" data-tk="${k}" value="${esc(r[k])}" aria-label="${k[0].toUpperCase() + k.slice(1)} for ${esc(a.name)}"${k === 'owner' ? '' : ' size="6"'}></td>`).join('') +
        `<td><input class="input" type="date" data-tk="review" value="${esc(r.review)}" aria-label="Review date for ${esc(a.name)}"></td><td><input class="input" data-tk="notes" value="${esc(r.notes)}" aria-label="Notes for ${esc(a.name)}"></td>` +
        (cmp ? `<td class="small">${c && c.previous ? esc(`${c.previous.latest || c.previous.baseline || 'n/a'}`) : 'Not in last year’s file'}</td><td class="eap-chg" data-dir="${c && c.change > 0 ? 'up' : c && c.change < 0 ? 'down' : ''}">${esc(chg)}</td>` : '') + '</tr>';
    }
    h += '</tbody></table></div>';
    h += `<div class="eap-panel-actions"><button type="button" class="btn btn-sm btn-primary" id="tk-csv">Download the tracker CSV</button><button type="button" class="btn btn-sm" id="tk-pdf">Download the tracker PDF</button><button type="button" class="btn btn-sm" id="tk-load">Load last year’s tracker CSV</button><input type="file" id="tk-file" accept=".csv,.txt" hidden>${S.prevTracker ? '<button type="button" class="btn btn-sm eap-quiet" id="tk-unload">Remove last year’s file</button>' : ''}</div>`;
    if (S.prevTracker) {
      h += `<p class="hint">Last year’s file: ${esc(S.prevTracker.name)}, ${S.prevTracker.rows.length} row${S.prevTracker.rows.length === 1 ? '' : 's'}. The change compares this year’s latest value with last year’s latest, or its baseline when no latest was recorded.</p>`;
      if (cmp.dropped.length) h += `<div class="eap-lock-bar"><p>In last year’s file but not in this plan: ${cmp.dropped.map(d => esc(d.action || d.id)).join('; ')}. GOV.UK Step 6: you must be working on at least 2 actions at any time.</p><div class="eap-lock-actions">${cmp.dropped.filter(d => R.BY_ID[d.id]).map(d => `<button type="button" class="btn btn-sm" data-tk-add="${esc(d.id)}">Add ${esc(R.BY_ID[d.id].name)}</button>`).join('')}</div></div>`;
    }
    el.innerHTML = h;
    el.querySelectorAll('tr[data-track]').forEach(tr => {
      const id = tr.dataset.track;
      tr.addEventListener('input', e => {
        const k = e.target.dataset.tk;
        if (!k || k === 'metricSel') return;
        const t = S.plan.tracker[id] = Object.assign({}, rows.find(r => r.id === id) && { metric: rows.find(r => r.id === id).metric }, S.plan.tracker[id] || {});
        t[k] = e.target.value;
        C.save();
      });
      tr.addEventListener('change', e => {
        if (e.target.dataset.tk !== 'metricSel') return;
        const t = S.plan.tracker[id] = Object.assign({}, S.plan.tracker[id] || {});
        t.metric = e.target.value === OWN ? '' : e.target.value;
        C.save(); renderTracker();
      });
    });
    $('tk-csv').addEventListener('click', () => { window.PeakUI.download(new Blob([C.E.trackerCSV(C.E.trackerRows(S.plan))], { type: 'text/csv;charset=utf-8' }), `${C.fileBase()}-measures-tracker.csv`); C.say('Tracker CSV downloaded.'); });
    $('tk-pdf').addEventListener('click', () => exportPDF('tracker'));
    $('tk-load').addEventListener('click', () => $('tk-file').click());
    $('tk-file').addEventListener('change', async e => {
      const f = e.target.files[0]; e.target.value = '';
      if (!f) return;
      const res = C.E.parseTrackerCSV(await f.text());
      if (res.error) return C.say(res.error === 'not-a-tracker' ? 'That file is not a measures tracker CSV: it needs Action and Metric columns.' : 'That file is empty.');
      S.prevTracker = { name: f.name, rows: res.rows };
      renderTracker();
      C.say(`Loaded last year’s tracker: ${res.rows.length} rows.`);
    });
    const un = $('tk-unload');
    if (un) un.addEventListener('click', () => { S.prevTracker = null; renderTracker(); });
    el.querySelectorAll('[data-tk-add]').forEach(b => b.addEventListener('click', () => {
      const id = b.dataset.tkAdd;
      const p = S.prevTracker.rows.find(r => r.id === id);
      S.plan.actions[id] = { status: 'new', text: '' };
      S.plan.tracker[id] = { metric: p.metric, baseline: p.latest || p.baseline, target: p.target, owner: p.owner };
      C.save(); C.render(); renderTracker();
    }));
  }

  // ---------- Staff consultation kit ----------
  function renderConsult() {
    const S = C.S, el = $('panel-consult'), esc = C.esc, X = window.EAPPack;
    if (!X) { el.innerHTML = '<p class="hint">Loading the kit…</p>'; ensurePack().then(renderConsult); return; }
    S.responses = S.responses || [];
    let h = `<div class="eap-panel-head"><h3>Staff consultation kit</h3><p class="hint">Step 1 asks you to talk to employees about how menopause may affect them at work. The survey is anonymous; the questions and options come from the GOV.UK menopause action pages and Acas.</p></div>`;
    h += `<div class="eap-consult"><div><h4>Anonymous survey</h4><ol>${X.SURVEY.map(s => `<li>${esc(s.q)}${s.type === 'many' ? ' <span class="muted">(choose any)</span>' : ''}</li>`).join('')}</ol></div><div><h4>Focus group guide</h4>${X.FOCUS.map(b => `<p class="small"><strong>${esc(b.h)}</strong></p><ol>${b.items.map(i => `<li>${esc(i)}</li>`).join('')}</ol>`).join('')}</div></div>`;
    h += `<div class="eap-panel-actions"><button type="button" class="btn btn-sm" id="cs-survey">Download the survey</button><button type="button" class="btn btn-sm" id="cs-guide">Download the focus group guide</button><button type="button" class="btn btn-sm" id="cs-pdf">Download the kit as PDF</button></div>`;
    h += `<h4>Type in the answers</h4><p class="hint">From paper forms or another survey tool, one response at a time. Responses stay in this tab only, because they are about health: download the CSV to keep them, and follow your data protection lead’s advice.</p><form class="eap-form" id="cs-form">`;
    for (const s of X.SURVEY) {
      if (s.type === 'text') { h += `<label class="field"><span>${esc(s.q)}</span><textarea class="input" name="${s.id}" rows="2" maxlength="600"></textarea></label>`; continue; }
      h += `<fieldset><legend>${esc(s.q)}</legend><div class="eap-opts">${s.options.map(o => `<label><input type="${s.type === 'many' ? 'checkbox' : 'radio'}" name="${s.id}" value="${esc(o)}"> ${esc(o)}</label>`).join('')}</div></fieldset>`;
    }
    h += `<div class="eap-panel-actions"><button type="submit" class="btn btn-sm btn-primary">Add this response</button></div></form>`;
    const n = S.responses.length;
    h += `<p class="small" id="cs-count">${n} response${n === 1 ? '' : 's'} typed in.</p>`;
    if (n) {
      const T = X.tally(S.responses);
      h += `<div class="table-wrap eap-tally"><table><thead><tr><th scope="col">Question and option</th><th scope="col" class="num">Responses</th></tr></thead><tbody>${T.map(q => `<tr><th scope="row" colspan="2">${esc(q.q)} <span class="muted">(${q.n} answered)</span></th></tr>` + q.counts.map(c => `<tr><td>${esc(c.option)}</td><td class="num">${c.count}</td></tr>`).join('')).join('')}</tbody></table></div>`;
      h += `<div class="eap-panel-actions"><button type="button" class="btn btn-sm btn-primary" id="cs-csv">Download the responses CSV</button><button type="button" class="btn btn-sm eap-quiet" id="cs-clear">Clear the responses</button></div>`;
    }
    el.innerHTML = h;
    $('cs-survey').addEventListener('click', () => window.PeakUI.download(new Blob([X.surveyText().replace(/\n/g, '\r\n')], { type: 'text/plain;charset=utf-8' }), 'menopause-support-survey.txt'));
    $('cs-guide').addEventListener('click', () => window.PeakUI.download(new Blob([X.focusText().replace(/\n/g, '\r\n')], { type: 'text/plain;charset=utf-8' }), 'menopause-focus-group-guide.txt'));
    $('cs-pdf').addEventListener('click', () => exportPDF('consult'));
    $('cs-form').addEventListener('submit', e => {
      e.preventDefault();
      const fd = new FormData(e.target), r = {};
      for (const s of X.SURVEY) r[s.id] = s.type === 'many' ? fd.getAll(s.id) : (fd.get(s.id) || '').toString().trim();
      if (!X.SURVEY.some(s => (Array.isArray(r[s.id]) ? r[s.id].length : r[s.id]))) return C.say('That response is empty.');
      S.responses.push(r);
      renderConsult();
      C.say(`Response ${S.responses.length} added.`);
    });
    const csv = $('cs-csv');
    if (csv) csv.addEventListener('click', () => window.PeakUI.download(new Blob([X.responsesCSV(S.responses)], { type: 'text/csv;charset=utf-8' }), 'menopause-survey-responses.csv'));
    const clr = $('cs-clear');
    if (clr) clr.addEventListener('click', () => { S.responses = []; renderConsult(); });
  }

  // ---------- Exports ----------
  function ensurePack() {
    return C.loadScript(C.SRC.report, () => window.PayGapReport).then(() => C.loadScript(C.SRC.pack, () => window.EAPPack));
  }
  function ensurePdf() { return ensurePack().then(() => C.loadScript(C.SRC.pdflib, () => window.PDFLib)); }
  function makeView() {
    const S = C.S;
    return window.EAPPack.view({ plan: S.plan, analysis: S.analysis && S.pro ? S.analysis : null, analysisFile: S.table ? S.table.name : null, previous: S.prevTracker ? S.prevTracker.rows : null, today: new Date() });
  }
  async function exportPDF(kind) {
    if (!C.needPro('The PDFs are part of Pro.')) return;
    try {
      await ensurePdf();
      const X = window.EAPPack, v = makeView();
      let bytes, name;
      if (kind === 'pack') { bytes = await X.signOffPDF(window.PDFLib, v); name = `${C.fileBase()}-sign-off-pack.pdf`; }
      else if (kind === 'web') { bytes = await X.webPDF(window.PDFLib, v); name = `${C.fileBase()}-website.pdf`; }
      else if (kind === 'tracker') { bytes = await X.trackerPDF(window.PDFLib, v); name = `${C.fileBase()}-measures-tracker.pdf`; }
      else if (kind === 'consult') { bytes = await X.consultPDF(window.PDFLib, v); name = 'menopause-consultation-kit.pdf'; }
      window.PeakUI.download(new Blob([bytes], { type: 'application/pdf' }), name);
      C.say('PDF downloaded.');
    } catch (e) {
      console.error(e);
      C.say('The PDF could not be made. Try again, or email us so we can look into it.');
    }
  }
  async function action(kind) {
    if (kind === 'pack') return exportPDF('pack');
    if (kind === 'web-pdf') return exportPDF('web');
    if (kind === 'web-html') {
      if (!C.needPro('The website plan page is part of Pro.')) return;
      await ensurePack();
      window.PeakUI.download(new Blob([window.EAPPack.webHTML(makeView())], { type: 'text/html;charset=utf-8' }), `${C.fileBase()}-website.html`);
      C.say('Website page downloaded.');
    }
  }

  function render(name) {
    if (!C) return;
    if (name === 'analysis') renderAnalysis();
    else if (name === 'tracker') { if (C.S.pro) renderTracker(); else $('panel-tracker').hidden = true; }
    else if (name === 'consult') { if (C.S.pro) renderConsult(); else $('panel-consult').hidden = true; }
  }

  window.EAPPro = { init, render, action, exportPDF };
})();
