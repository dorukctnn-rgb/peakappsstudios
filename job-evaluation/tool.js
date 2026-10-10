/* Job Evaluation: page logic. Engine: jobeval.js (window.JobEval). The record PDF (record.js) loads with pdf-lib and the
 * Pay Gap Report's report.js (its WinAnsi text filter) only when a PDF is asked for. Files are read with
 * File.arrayBuffer() through the Pay Gap Report's reader (paygap.js), loaded on first use. Nothing on this page is sent
 * anywhere and there are no analytics; only a licence key goes to Gumroad, to check it. */
(function () {
  'use strict';

  // ---- Gumroad Pro product, permalink job-evaluation-pro. Gumroad requires the product id for products made after 2023.
  // Fail closed: Pro turns on only after Gumroad has verified a key for this product.
  const JOBEVAL_PRO_PRODUCT_ID = 'Y5slwJj8QOwcVx21iibZyg==';
  const PRO_READY = !!JOBEVAL_PRO_PRODUCT_ID && JOBEVAL_PRO_PRODUCT_ID !== 'PENDING';
  const LICENSE = {
    tool: 'job-evaluation',
    productId: PRO_READY ? JOBEVAL_PRO_PRODUCT_ID : 'PENDING',
    permalink: 'job-evaluation-pro',
    buyUrl: 'https://dorukctn.gumroad.com/l/job-evaluation-pro',
    pitch: 'Pro evaluates every role, lets you change the weights, levels and grades, and writes the methodology record PDF, the categories CSV and the payroll merge. $99, once, per organisation.',
  };
  const PDFLIB_SRC = '/pay-gap-report/vendor/pdf-lib.min.js';
  const MAX_BYTES = 50 * 1024 * 1024;

  const J = window.JobEval;
  const $ = id => document.getElementById(id);
  const esc = s => String(s == null ? '' : s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const int = n => Number(n).toLocaleString('en-GB');
  const fmt = x => (x == null || x === '' ? '' : Number(J.pts(x)).toLocaleString('en-GB', { maximumFractionDigits: 1 }));
  const today = () => { const d = new Date(); return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`; };
  const MONTHS = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];
  const longDate = iso => { const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(iso || ''); return m ? `${Number(m[3])} ${MONTHS[Number(m[2]) - 1]} ${m[1]}` : ''; };
  const lockIcon = '<svg width="11" height="11" viewBox="0 0 14 14" aria-hidden="true"><rect x="2.5" y="6" width="9" height="6.5" rx="1.2" fill="none" stroke="currentColor" stroke-width="1.4"/><path d="M4.5 6V4.5a2.5 2.5 0 0 1 5 0V6" fill="none" stroke="currentColor" stroke-width="1.4"/></svg>';
  const xIcon = '<svg width="14" height="14" viewBox="0 0 14 14" aria-hidden="true"><path d="M3.5 3.5l7 7M10.5 3.5l-7 7" stroke="currentColor" stroke-width="1.5" stroke-linecap="round"/></svg>';

  const S = { ev: null, cur: 0, pro: false, dirty: false, res: null, checks: [], editing: null, confirm: null, mergeTable: null, mergeCol: null, merge: null, hide: false };
  // The EU guidelines advise against watching a job's running total while scoring it (Tool 5, step 5). Remembered per browser.
  try { S.hide = localStorage.getItem('job-evaluation:hide-total') === '1'; } catch (e) { /* storage blocked */ }

  // ---------- Who is evaluated ----------
  const active = i => S.pro || (S.ev && S.ev.sample) || i < J.FREE_ROLES;
  const activeRoles = () => S.ev.roles.filter((r, i) => active(i));
  const evNow = () => Object.assign({}, S.ev, { roles: activeRoles() });
  function compute() {
    if (!S.ev) { S.res = null; S.checks = []; return; }
    const ev = evNow();
    S.res = J.evaluate(ev);
    S.checks = J.checks(ev, S.res);
    if (S.mergeTable) S.merge = J.mergePayroll(S.mergeTable, ev, S.res, { column: S.mergeCol });
  }
  const rowOf = role => S.res && S.res.rows.find(r => r.role === role);
  const nameOf = r => (r && String(r.name || '').trim()) || 'Unnamed role';
  const scheme = () => S.ev.scheme;
  const weighted = () => scheme().subs.filter(s => Number(s.weight) > 0);

  function say(msg) { $('status').textContent = msg; if (msg) PeakUI.toast(msg); }
  function touch() { S.dirty = true; }

  // ---------- Scripts loaded on first use ----------
  const loading = {};
  function loadScript(src, ready) {
    if (ready && ready()) return Promise.resolve();
    if (!loading[src]) loading[src] = new Promise((resolve, reject) => {
      const el = document.createElement('script');
      el.src = src;
      el.onload = () => resolve();
      el.onerror = () => { delete loading[src]; reject(new Error('Could not load ' + src)); };
      document.head.appendChild(el);
    });
    return loading[src];
  }
  const loadReader = () => loadScript('/pay-gap-report/paygap.js', () => window.PayGap);

  // ---------- Starting points ----------
  function newEvaluation() {
    return { org: '', evaluators: '', date: today(), notes: '', scheme: J.defaultScheme(), roles: [], sample: false };
  }
  function start(ev, msg) {
    S.ev = ev; S.cur = 0; S.dirty = false; S.editing = null; S.mergeTable = null; S.merge = null;
    compute(); render();
    if (msg) say(msg);
  }
  function loadSample(scroll) {
    start(J.sample(), 'Sample company loaded: 15 synthetic roles, scored in full.');
    if (scroll) $('tool').scrollIntoView({ behavior: matchMedia('(prefers-reduced-motion: reduce)').matches ? 'auto' : 'smooth', block: 'start' });
  }
  function canAdd(n) {
    if (S.pro || !S.ev || S.ev.roles.length + (n || 1) <= J.FREE_ROLES) return true;
    PeakLicense.requirePro(`The free version evaluates up to ${J.FREE_ROLES} roles. Pro evaluates every role, and adds the record PDF, the categories CSV and saving the evaluation.`);
    return false;
  }
  function addRole(focus) {
    if (!S.ev) S.ev = newEvaluation();
    else if (S.ev.sample) { if (!canAdd()) return; }
    else if (!canAdd()) return;
    S.ev.roles.push(J.newRole(''));
    S.cur = S.ev.roles.length - 1;
    touch(); compute(); render();
    if (focus) { const inp = document.querySelector(`#roles-body tr[data-i="${S.cur}"] input[data-f="name"]`); if (inp) inp.focus(); }
  }
  function confirmLoss(what) {
    if (!S.ev || !S.dirty || S.ev.sample || !S.ev.roles.length) return true;
    return window.confirm(`${what} Changes since you last saved the evaluation file will be lost.`);
  }

  // ---------- Files ----------
  function badFile(file, kinds) {
    if (file.size > MAX_BYTES) return `${file.name} is larger than 50 MB.`;
    if (/\.xls$/i.test(file.name)) return 'That is an old Excel .xls file. Save it as XLSX or CSV, then choose it again.';
    if (!kinds.test(file.name)) return 'Choose a CSV or XLSX file.';
    return '';
  }
  async function readTableFrom(file) {
    await loadReader();
    try { return await window.PayGap.readTable(file.name, new Uint8Array(await file.arrayBuffer())); }
    catch (e) { return { error: /xls/.test(e.message) ? 'That is an old Excel .xls file. Save it as XLSX or CSV, then choose it again.' : 'That file could not be read as CSV or XLSX. Save it again from your spreadsheet program and try once more.' }; }
  }
  async function importFile(file) {
    if (!file) return;
    const bad = badFile(file, /\.(csv|tsv|txt|xlsx)$/i);
    if (bad) return say(bad);
    const table = await readTableFrom(file);
    if (table.error) return say(table.error);
    if (!table.headers.filter(Boolean).length) return say(`${file.name} has no header row.`);
    if (!S.ev || S.ev.sample) S.ev = newEvaluation();
    const r = J.importRoles(table, S.ev.scheme);
    const notes = [];
    if (r.skipped.length) notes.push(`${r.skipped.length} row${r.skipped.length > 1 ? 's' : ''} skipped: ${r.skipped.slice(0, 6).map(s => `row ${s.row} (${s.why})`).join(', ')}${r.skipped.length > 6 ? ', and more' : ''}.`);
    r.problems.slice(0, 12).forEach(p => notes.push(p.text));
    if (r.problems.length > 12) notes.push(`${r.problems.length - 12} more values could not be read.`);
    const before = S.ev.roles.length;
    S.ev.roles.push(...r.roles);
    S.cur = before < S.ev.roles.length ? before : S.cur;
    if (r.roles.length) touch();
    compute(); render();
    const box = $('import-notes');
    box.hidden = !notes.length;
    box.innerHTML = notes.map(n => `<li>${esc(n)}</li>`).join('');
    const locked = S.ev.roles.filter((x, i) => !active(i)).length;
    say(r.roles.length ? `Imported ${r.roles.length} role${r.roles.length > 1 ? 's' : ''} from ${file.name}${locked ? `; ${locked} need Pro to be scored` : ''}.` : (r.problems[0] ? r.problems[0].text : `No roles found in ${file.name}.`));
  }
  function openSaved() {
    if (!(PRO_READY && PeakLicense.requirePro('Saving and reopening the evaluation file is part of Pro.'))) return;
    const inp = document.createElement('input');
    inp.type = 'file'; inp.accept = '.json,application/json';
    inp.addEventListener('change', async () => {
      const f = inp.files[0];
      if (!f) return;
      if (f.size > 20 * 1024 * 1024) return say('That file is too large to be a saved evaluation.');
      const out = J.parse(await f.text());
      if (out.error) return say(out.error);
      if (!confirmLoss('Open this evaluation instead of the current one?')) return;
      start(out.ev, `Opened ${f.name}: ${out.ev.roles.length} roles.`);
    });
    inp.click();
  }

  // ---------- Render ----------
  function render() {
    const has = !!S.ev;
    $('tool').dataset.state = has ? 'ready' : 'empty';
    $('empty').hidden = has;
    $('work').hidden = !has;
    if (!has) return;
    if (S.cur >= S.ev.roles.length) S.cur = Math.max(0, S.ev.roles.length - 1);
    if (S.ev.roles.length && !active(S.cur)) S.cur = 0;
    renderBar(); renderRoles(); renderPicker(); renderSheet(); renderResults(); renderPlan(); renderOut();
  }
  function renderBar() {
    if (document.activeElement !== $('org')) $('org').value = S.ev.org || '';
    $('sample-note').hidden = !S.ev.sample;
  }

  // Roles table
  function scoredText(row) { return row ? `${row.scored} of ${row.needed}` : ''; }
  function renderRoles() {
    const rows = S.ev.roles.map((role, i) => {
      const locked = !active(i), row = rowOf(role);
      const dis = locked ? ' disabled' : '';
      const nm = esc(role.name);
      const conf = S.confirm === role.id;
      return `<tr data-i="${i}" class="${locked ? 'is-locked' : ''}${i === S.cur ? ' is-current' : ''}">
        <td class="je-c-name" data-l="Role"><input class="input" data-f="name" value="${nm}" aria-label="Role name" placeholder="Role name, as in your payroll" maxlength="160"${dis}></td>
        <td class="je-c-dept" data-l="Department"><input class="input" data-f="department" value="${esc(role.department)}" aria-label="Department of ${nm || 'this role'}" maxlength="160"${dis}></td>
        <td class="je-c-n" data-l="Women"><input class="input" data-f="women" inputmode="numeric" value="${role.women == null ? '' : role.women}" aria-label="Number of women in ${nm || 'this role'}" maxlength="7"${dis}></td>
        <td class="je-c-n" data-l="Men"><input class="input" data-f="men" inputmode="numeric" value="${role.men == null ? '' : role.men}" aria-label="Number of men in ${nm || 'this role'}" maxlength="7"${dis}></td>
        <td class="num" data-l="Scored" data-cell="scored">${locked ? `<span class="je-lockpill">${lockIcon} Pro</span>` : scoredText(row)}</td>
        <td class="num" data-l="Points" data-cell="points">${row && !locked ? fmt(row.total) : ''}</td>
        <td data-l="Grade" data-cell="grade">${row && row.category ? esc(row.category) : ''}</td>
        <td class="je-c-act"><button type="button" class="btn btn-sm" data-act="score">${locked ? `${lockIcon} Score` : 'Score'}</button><button type="button" class="je-x${conf ? ' is-confirm' : ''}" data-act="remove" aria-label="${conf ? 'Confirm removing' : 'Remove'} ${nm || 'this role'}">${conf ? 'Remove?' : xIcon}</button></td>
      </tr>`;
    }).join('');
    $('roles-body').innerHTML = rows || '<tr><td colspan="8" class="muted">No roles yet. Add one, or import a list.</td></tr>';
    const n = S.ev.roles.length, locked = S.ev.roles.filter((r, i) => !active(i)).length;
    $('cap-note').textContent = S.pro ? `${int(n)} role${n === 1 ? '' : 's'}. Pro evaluates every role.`
      : S.ev.sample ? 'The sample shows all 15 roles. For your own evaluation the free version takes up to 5 roles; Pro takes every role.'
        : locked ? `The free version evaluates the first ${J.FREE_ROLES} roles; ${locked} more ${locked === 1 ? 'needs' : 'need'} Pro.` : `The free version evaluates up to ${J.FREE_ROLES} roles; Pro takes every role.`;
  }
  function renderRoleNumbers() {
    S.ev.roles.forEach((role, i) => {
      const tr = document.querySelector(`#roles-body tr[data-i="${i}"]`);
      if (!tr || !active(i)) return;
      const row = rowOf(role);
      tr.querySelector('[data-cell="scored"]').textContent = scoredText(row);
      tr.querySelector('[data-cell="points"]').textContent = row ? fmt(row.total) : '';
      tr.querySelector('[data-cell="grade"]').textContent = row && row.category ? row.category : '';
      tr.classList.toggle('is-current', i === S.cur);
    });
  }

  // Picker
  function renderPicker() {
    const items = [], opts = [];
    S.ev.roles.forEach((role, i) => {
      if (!active(i)) return;
      const row = rowOf(role);
      const sub = !row ? '' : S.hide ? `${row.scored} of ${row.needed} scored` : row.complete && row.category ? row.category : `${row.scored} of ${row.needed} scored`;
      items.push(`<li><button type="button" data-i="${i}" aria-current="${i === S.cur}"><span class="p-name">${esc(nameOf(role))}</span><span class="p-pts">${row && !S.hide ? fmt(row.total) : ''}</span><span class="p-sub${row && row.complete ? ' is-done' : ''}">${esc(sub)}</span></button></li>`);
      opts.push(`<option value="${i}"${i === S.cur ? ' selected' : ''}>${esc(nameOf(role))}${sub ? ` (${esc(sub)})` : ''}</option>`);
    });
    $('picker').innerHTML = items.join('');
    $('picker-select').innerHTML = opts.join('');
  }

  // Scoring sheet
  function levelText(s, l) {
    const p = J.levelPoints(s, l, scheme().total);
    return `<span class="lv">Level ${l}, ${fmt(p)} point${p === 1 ? '' : 's'}</span>${esc(s.levels[l])}`;
  }
  function renderSheet() {
    const sh = $('sheet');
    const role = S.ev.roles[S.cur];
    if (!role || !active(S.cur)) { sh.innerHTML = '<p class="je-sheet-empty">Add a role in step 1 to score it here.</p>'; return; }
    const sc = scheme(), gw = J.groupWeights(sc);
    let html = `<div class="je-sheet-head"><h3 id="sheet-role">${esc(nameOf(role))}</h3><div class="je-sum" id="sum"></div><div class="je-bars" id="sum-bars"></div></div><label class="check je-hide"><input type="checkbox" id="hide-total"${S.hide ? ' checked' : ''}> Hide the running total while scoring, as the EU guidelines advise</label>`;
    for (const g of J.GROUPS) {
      const subs = sc.subs.filter(s => s.group === g.id);
      if (!subs.length) continue;
      html += `<section class="je-group" aria-labelledby="g-${g.id}"><div class="je-group-h"><h4 id="g-${g.id}">${esc(g.name)}</h4><span>${fmt(gw[g.id])}%, ${fmt(sc.total * gw[g.id] / 100)} points</span></div>`;
      for (const s of subs) {
        const l = role.levels[s.id];
        const max = J.maxLevel(s);
        const w = Number(s.weight) || 0;
        let radios = '';
        for (let k = 0; k <= max; k++) radios += `<input type="radio" name="lv-${s.id}" id="lv-${s.id}-${k}" value="${k}"${l === k ? ' checked' : ''}><label for="lv-${s.id}-${k}" data-l="${k}"><span aria-hidden="true">${k}</span><span class="sr-only">Level ${k}: ${esc(s.levels[k])}</span></label>`;
        const all = s.levels.map((t, k) => `<li><button type="button" data-pick="${k}" aria-pressed="${l === k}"><span class="n">${k}</span><span>${esc(t)}</span></button></li>`).join('');
        html += `<fieldset class="je-sub${l == null ? ' is-empty' : ''}" data-sub="${esc(s.id)}">
          <legend><span class="je-sub-name">${esc(s.name)}</span> <span class="je-sub-w">${w > 0 ? `${fmt(w)}%, ${fmt(J.subPoints(s, sc.total))} points` : 'No weight: does not count'}</span></legend>
          ${s.def ? `<p class="je-sub-def">${esc(s.def)}</p>` : ''}
          <div class="je-levels">${radios}</div>
          <p class="je-desc${l == null ? ' is-none' : ''}" data-desc>${l == null ? 'Not scored yet. Choose the level that matches what the job requires.' : levelText(s, l)}</p>
          <div class="je-sub-more"><details><summary>All ${max + 1} levels</summary><ol class="je-all">${all}</ol></details></div>
          ${s.watch ? `<p class="je-watch">${esc(s.watch)}</p>` : ''}
          <label class="je-why"><span>Reason for this level</span><textarea class="input" rows="1" data-why="${esc(s.id)}" maxlength="2000" placeholder="What in the job puts it at this level">${esc(role.notes[s.id] || '')}</textarea></label>
        </fieldset>`;
      }
      html += '</section>';
    }
    const idx = S.ev.roles.map((r, i) => i).filter(active);
    const at = idx.indexOf(S.cur);
    html += `<div class="je-sheet-foot"><button type="button" class="btn btn-sm" data-go="-1"${at <= 0 ? ' disabled' : ''}>Previous role</button><button type="button" class="btn btn-sm btn-ink" data-go="1"${at >= idx.length - 1 ? ' disabled' : ''}>Next role</button></div>`;
    sh.innerHTML = html;
    renderSheetSum();
  }
  function renderSheetSum() {
    const role = S.ev.roles[S.cur];
    const row = role && rowOf(role);
    if (!row || !$('sum')) return;
    const sc = scheme(), gw = J.groupWeights(sc);
    $('sum-bars').hidden = S.hide;
    if (S.hide) { $('sum').innerHTML = `<span class="je-sum-grade">${row.scored} of ${row.needed} subfactors scored</span>`; const h0 = $('sheet-role'); if (h0) h0.textContent = nameOf(role); return; }
    $('sum').innerHTML = `<span class="je-sum-pts">${fmt(row.total)} <small>of ${int(sc.total)} points</small></span><span class="je-sum-grade">${row.complete && row.category ? esc(row.category) : `${row.scored} of ${row.needed} subfactors scored`}</span>`;
    $('sum-bars').innerHTML = J.GROUPS.map(g => {
      const max = sc.total * gw[g.id] / 100, v = row.groups[g.id];
      return `<div class="je-bar-g"><span class="t">${esc(g.name)} <b>${fmt(v)}</b> of ${fmt(max)}</span><i><span style="width:${max ? Math.min(100, v * 100 / max) : 0}%"></span></i></div>`;
    }).join('');
    const h = $('sheet-role'); if (h) h.textContent = nameOf(role);
  }
  function updateSub(id) {
    const role = S.ev.roles[S.cur];
    const fs = document.querySelector(`#sheet fieldset[data-sub="${CSS.escape(id)}"]`);
    const s = scheme().subs.find(x => x.id === id);
    if (!fs || !s) return;
    const l = role.levels[id];
    fs.classList.toggle('is-empty', l == null);
    const d = fs.querySelector('[data-desc]');
    d.className = 'je-desc' + (l == null ? ' is-none' : '');
    d.innerHTML = l == null ? 'Not scored yet. Choose the level that matches what the job requires.' : levelText(s, l);
    fs.querySelectorAll('[data-pick]').forEach(b => b.setAttribute('aria-pressed', String(Number(b.dataset.pick) === l)));
    const r = fs.querySelector(`input[value="${l}"]`); if (r && !r.checked) r.checked = true;
  }
  function preview(fs, k) {
    const s = scheme().subs.find(x => x.id === fs.dataset.sub);
    const d = fs.querySelector('[data-desc]');
    if (!s || !d) return;
    const l = S.ev.roles[S.cur].levels[s.id];
    if (k == null || k === l) { d.className = 'je-desc' + (l == null ? ' is-none' : ''); d.innerHTML = l == null ? 'Not scored yet. Choose the level that matches what the job requires.' : levelText(s, l); }
    else { d.className = 'je-desc is-preview'; d.innerHTML = levelText(s, k); }
  }
  function setLevel(id, l) {
    const role = S.ev.roles[S.cur];
    if (!role) return;
    role.levels[id] = l;
    touch(); compute();
    updateSub(id); renderSheetSum(); renderPicker(); renderRoleNumbers(); renderResults(); renderMergeResult();
  }
  function selectRole(i, scroll) {
    if (!active(i)) { PeakLicense.requirePro(`The free version evaluates the first ${J.FREE_ROLES} roles. Pro scores every role.`); return; }
    S.cur = i;
    renderPicker(); renderSheet(); renderRoleNumbers();
    if (scroll) {
      $('score-step').scrollIntoView({ behavior: matchMedia('(prefers-reduced-motion: reduce)').matches ? 'auto' : 'smooth', block: 'start' });
      const role = S.ev.roles[i];
      const first = weighted().find(s => role.levels[s.id] == null) || weighted()[0];
      const target = first && document.querySelector(`#sheet input[name="lv-${CSS.escape(first.id)}"]${role.levels[first.id] != null ? ':checked' : ''}`);
      if (target) target.focus({ preventScroll: true });
    }
  }

  // Results
  function renderResults() {
    const res = S.res, sc = scheme();
    const rows = res.rows.slice().sort((a, b) => (b.complete - a.complete) || (b.total - a.total) || (a.index - b.index));
    const done = res.complete.length, total = res.rows.length;
    const used = res.categories.length;
    $('res-sub').textContent = !total ? 'Add and score roles to see their grades.'
      : `${done} of ${total} role${total === 1 ? '' : 's'} fully scored${used ? `, in ${used} grade${used === 1 ? '' : 's'}` : ''}. Points out of ${int(sc.total)}; grades as set in step 4.`;
    const probs = res.problems;
    $('problems').hidden = !probs.length;
    $('problems').innerHTML = probs.map(p => `<li>${esc(p.text)}</li>`).join('');
    const head = `<caption class="sr-only">Points and grade of each role</caption><thead><tr><th scope="col">Role</th>${J.GROUPS.map(g => `<th scope="col" class="num">${esc(g.name)}</th>`).join('')}<th scope="col" class="num">Points</th><th scope="col">Grade</th><th scope="col" class="num">Women</th><th scope="col" class="num">Men</th></tr></thead>`;
    const domTag = r => (r.dom ? `<span class="je-dom">${r.dom.kind === 'F' ? 'women-dominated' : r.dom.kind === 'M' ? 'men-dominated' : 'mixed'}</span>` : '');
    const body = rows.map(r => `<tr class="${r.complete ? '' : 'is-incomplete'}"><th scope="row">${esc(nameOf(r.role))}${domTag(r)}</th>${J.GROUPS.map(g => `<td class="num" data-l="${esc(g.name)}">${fmt(r.groups[g.id])}</td>`).join('')}<td class="num" data-l="Points"><strong>${fmt(r.total)}</strong></td><td class="je-grade" data-l="Grade">${r.complete ? esc(r.category || '') : `${r.scored} of ${r.needed} scored`}</td><td class="num" data-l="Women">${r.role.women == null ? '' : int(r.role.women)}</td><td class="num" data-l="Men">${r.role.men == null ? '' : int(r.role.men)}</td></tr>`).join('');
    $('results-table').innerHTML = head + `<tbody>${body || `<tr><td colspan="${J.GROUPS.length + 5}" class="muted">No roles yet.</td></tr>`}</tbody>`;
    // Categories
    $('cats').innerHTML = res.categories.map(c => {
      const n = c.women + c.men;
      const mix = c.headcountRoles ? `<div class="je-mix"><span>${int(c.women)} ${c.women === 1 ? 'woman' : 'women'}, ${int(c.men)} ${c.men === 1 ? 'man' : 'men'}${c.headcountRoles < c.roles.length ? `, in ${c.headcountRoles} of ${c.roles.length} roles` : ''}</span>${n ? `<span class="bar" role="img" aria-label="${Math.round(c.women * 100 / n)}% women"><span class="w" style="width:${c.women * 100 / n}%"></span><span class="m" style="width:${c.men * 100 / n}%"></span></span>` : ''}</div>` : '<div class="je-mix"><span class="none">No headcounts entered</span></div>';
      return `<li data-cat="${esc(c.name)}"><div class="je-cat-name">${esc(c.name)}<small>${int(c.from)} to ${int(c.to)} points</small></div><ul class="je-chips">${c.roles.map(r => `<li><b>${esc(nameOf(r.role))}</b><span>${fmt(r.total)}</span></li>`).join('')}</ul>${mix}</li>`;
    }).join('') || '<li class="muted">Score every subfactor of a role to place it in a grade.</li>';
    // Checks
    $('checks').innerHTML = S.checks.map(c => `<li data-state="${c.state}" data-check="${c.id}"><span class="ck-body"><strong>${esc(c.title)}</strong><span class="ck-text">${esc(c.text)}</span>${c.items && c.items.length ? `<ul class="ck-items">${c.items.map(t => `<li>${esc(t)}</li>`).join('')}</ul>` : ''}</span></li>`).join('');
  }

  // Factor plan and grades
  function renderPlan() {
    const sc = scheme(), gw = J.groupWeights(sc), pro = S.pro, total = J.weightTotal(sc);
    $('plan-sub').textContent = pro
      ? 'Change a weight, a level description or a grade and everything above updates. The weights must add up to 100%; record the reason for any change in step 5.'
      : 'The default plan of the EU-wide guidelines: four factors, fourteen subfactors, 1,200 points, ten grades of 120 points.';
    let rows = '';
    for (const g of J.GROUPS) {
      const subs = sc.subs.filter(s => s.group === g.id);
      rows += `<tr class="is-group"><th scope="row" colspan="2">${esc(g.name)}</th><td class="num" data-gw="${g.id}">${fmt(gw[g.id])}%</td><td class="num" data-gp="${g.id}">${fmt(sc.total * gw[g.id] / 100)}</td><td></td></tr>`;
      for (const s of subs) {
        const w = Number(s.weight) || 0;
        rows += `<tr data-sub="${esc(s.id)}"><th scope="row" colspan="2"><span data-sname="${esc(s.id)}">${esc(s.name)}</span>${s.custom ? ' <span class="je-dom">added</span>' : ''}</th>
          <td class="num">${pro ? `<input class="input" data-w="${esc(s.id)}" inputmode="decimal" value="${fmt(w)}" aria-label="Weight of ${esc(s.name)}, percent">` : `${fmt(w)}%`}</td>
          <td class="num" data-sp="${esc(s.id)}">${fmt(J.subPoints(s, sc.total))}</td>
          <td class="num">0 to ${J.maxLevel(s)}${pro ? ` <button type="button" class="btn btn-sm je-edit" data-edit="${esc(s.id)}" aria-expanded="${S.editing === s.id}">${S.editing === s.id ? 'Close' : 'Edit'}</button>` : ''}</td></tr>`;
        if (pro && S.editing === s.id) rows += `<tr><td colspan="5">${subEditor(s)}</td></tr>`;
      }
      if (pro) rows += `<tr><td colspan="5"><button type="button" class="btn btn-sm je-quiet" data-addsub="${g.id}">Add a subfactor to ${esc(g.name.toLowerCase())}</button></td></tr>`;
    }
    const bad = Math.abs(total - 100) > 1e-6;
    rows += `<tr class="is-total${bad ? ' is-bad' : ''}"><th scope="row" colspan="2">Total</th><td class="num" id="w-total">${fmt(total)}%</td><td class="num">${int(sc.total)}</td><td></td></tr>`;
    $('plan').innerHTML = `<div class="table-wrap"><table class="je-plan-t"><caption class="sr-only">Factors, subfactors, weights and points</caption><thead><tr><th scope="col" colspan="2">Factor and subfactor</th><th scope="col" class="num">Weight</th><th scope="col" class="num">Points</th><th scope="col" class="num">Levels</th></tr></thead><tbody>${rows}</tbody></table></div>` +
      (pro ? '<div class="je-plan-foot"><button type="button" class="btn btn-sm je-quiet" id="plan-default">Restore the default plan and grades</button></div>' : '');
    // Grades
    const b = sc.bands;
    const gr = b.map((x, i) => {
      const r = J.bandRange(sc, i);
      return `<tr data-band="${i}"><td>${pro ? `<input class="input" data-bn="${i}" value="${esc(x.name)}" maxlength="60" aria-label="Name of grade ${i + 1}">` : esc(x.name)}</td><td class="num je-g-from">${pro && i > 0 ? `<input class="input" data-bf="${i}" inputmode="numeric" value="${x.from}" aria-label="Lowest points of ${esc(x.name)}">` : int(x.from)}</td><td class="num" data-bt="${i}">${int(r.to)}</td></tr>`;
    }).join('');
    $('grades').innerHTML = `<h3>Grades</h3>${pro ? `<div class="je-grades-ctl"><label class="field"><span>Number of grades</span><select class="select" id="band-count">${Array.from({ length: 14 }, (_, k) => k + 2).map(n => `<option value="${n}"${n === b.length ? ' selected' : ''}>${n}</option>`).join('')}</select></label><p class="hint">Choosing a number splits ${int(sc.total)} points into equal grades; you can then move any lower limit.</p></div>` : ''}<div class="table-wrap"><table class="je-grades-t"><caption class="sr-only">Grades and their points</caption><thead><tr><th scope="col">Grade, the category name</th><th scope="col" class="num">From</th><th scope="col" class="num">To</th></tr></thead><tbody>${gr}</tbody></table></div>`;
    $('plan-lock').hidden = pro;
  }
  function subEditor(s) {
    const max = J.maxLevel(s);
    const lv = s.levels.map((t, k) => `<div class="je-lv-edit"><span>${k}</span><textarea class="input" rows="2" data-lv="${esc(s.id)}" data-k="${k}" maxlength="600" aria-label="Level ${k} of ${esc(s.name)}">${esc(t)}</textarea></div>`).join('');
    return `<div class="je-sub-editor" data-editor="${esc(s.id)}">
      <div class="row"><label class="field"><span>Name</span><input class="input" data-sn="${esc(s.id)}" value="${esc(s.name)}" maxlength="120"></label>
      <label class="field"><span>Top level</span><select class="select" data-smax="${esc(s.id)}">${[1, 2, 3, 4, 5, 6, 7, 8].map(n => `<option value="${n}"${n === max ? ' selected' : ''}>${n}</option>`).join('')}</select></label></div>
      <label class="field"><span>What it assesses</span><textarea class="input" rows="2" data-sd="${esc(s.id)}" maxlength="2000">${esc(s.def || '')}</textarea></label>
      ${lv}
      <div class="je-plan-foot">${s.custom ? `<button type="button" class="btn btn-sm" data-delsub="${esc(s.id)}">Remove this subfactor</button>` : `<button type="button" class="btn btn-sm je-quiet" data-resetsub="${esc(s.id)}">Restore the default text</button>`}</div>
    </div>`;
  }
  function afterPlanChange(full) {
    touch(); compute();
    renderSheet(); renderPicker(); renderRoleNumbers(); renderResults(); renderMergeResult();
    if (full) renderPlan();
    else {
      const sc = scheme(), gw = J.groupWeights(sc), total = J.weightTotal(sc);
      J.GROUPS.forEach(g => { const a = document.querySelector(`[data-gw="${g.id}"]`), p = document.querySelector(`[data-gp="${g.id}"]`); if (a) a.textContent = `${fmt(gw[g.id])}%`; if (p) p.textContent = fmt(sc.total * gw[g.id] / 100); });
      sc.subs.forEach(s => { const c = document.querySelector(`[data-sp="${CSS.escape(s.id)}"]`); if (c) c.textContent = fmt(J.subPoints(s, sc.total)); });
      const t = $('w-total'); if (t) { t.textContent = `${fmt(total)}%`; t.closest('tr').classList.toggle('is-bad', Math.abs(total - 100) > 1e-6); }
      sc.bands.forEach((b, i) => { const c = document.querySelector(`[data-bt="${i}"]`); if (c) c.textContent = int(J.bandRange(sc, i).to); });
    }
  }

  // Outputs
  function renderOut() {
    const pro = S.pro;
    $('out-tag').hidden = pro;
    $('out-step').querySelector('.je-out').dataset.pro = String(pro);
    $('out-sub').textContent = pro ? 'The evidence an employer keeps, and the categories for the pay gap report and pay information requests. Built on this page.' : 'Part of Pro. Everything above stays free.';
    if (document.activeElement !== $('evaluators')) $('evaluators').value = S.ev.evaluators || '';
    if (document.activeElement !== $('ev-date')) $('ev-date').value = S.ev.date || '';
    if (document.activeElement !== $('notes')) $('notes').value = S.ev.notes || '';
    renderMergeResult();
  }
  function renderMergeResult() {
    const box = $('merge-result');
    const m = S.merge;
    box.hidden = !m;
    if (!m) return;
    const t = S.mergeTable;
    const opts = ['<option value="-1">No job title column</option>'].concat(t.headers.map((h, i) => `<option value="${i}"${i === m.column ? ' selected' : ''}>${esc(h || `Column ${i + 1}`)}</option>`)).join('');
    const roleOpts = r => ['<option value="">Match it to a role</option>'].concat(S.ev.roles.map((x, i) => (active(i) ? `<option value="${i}">${esc(nameOf(x))}</option>` : ''))).join('');
    const un = m.unmatched.slice(0, 40).map(u => `<li><code>${esc(u.value)}</code><span class="muted">${int(u.count)} row${u.count === 1 ? '' : 's'}</span><select class="select" data-alias="${esc(u.value)}" aria-label="Role for ${esc(u.value)}">${roleOpts()}</select></li>`).join('');
    const parts = [];
    if (m.unscored.length) parts.push(`<p class="warn">${m.unscored.reduce((a, u) => a + u.count, 0)} row${m.unscored.length > 1 || m.unscored[0].count > 1 ? 's belong' : ' belongs'} to roles not fully scored yet: ${esc(m.unscored.map(u => `${u.value} (${u.count})`).join(', '))}. Finish scoring them to give those workers a grade.</p>`);
    if (m.blank) parts.push(`<p class="hint">${int(m.blank)} row${m.blank === 1 ? ' has' : 's have'} no job title and get no category.</p>`);
    box.innerHTML = `<p><strong>${esc(t.name)}</strong>: ${int(m.total)} rows. ${int(m.matched)} of them matched to a grade.</p>
      <div class="je-merge-cols"><label class="field"><span>The column with each worker’s job title</span><select class="select" id="merge-col">${opts}</select></label></div>
      ${un ? `<div><p class="hint">Job titles that match no role. Match each to a role and the evaluation remembers it, or rename the role in step 1.</p><ul class="je-merge-un">${un}</ul>${m.unmatched.length > 40 ? `<p class="hint">And ${m.unmatched.length - 40} more.</p>` : ''}</div>` : ''}
      ${parts.join('')}
      <div class="je-merge-actions"><button type="button" class="btn btn-primary btn-sm" id="merge-download">Download the payroll with categories</button><a class="btn btn-sm" href="/pay-gap-report/?regime=eu">Open the Pay Gap Report</a><a class="btn btn-sm je-quiet" href="/pay-transparency/answer-a-request/">Open the answer tool</a></div>
      <p class="hint">The download is the same file with a <code>category_of_workers</code> column${m.replaced ? ' (the old one replaced)' : ' added'}${m.delimiter === ';' ? ', separated by semicolons as before' : ''}. Drop it into either tool and the column is matched automatically.</p>`;
  }
  async function mergeFile(file) {
    if (!file) return;
    const bad = badFile(file, /\.(csv|tsv|txt|xlsx)$/i);
    if (bad) return say(bad);
    const table = await readTableFrom(file);
    if (table.error) return say(table.error);
    if (!table.body.length) return say(`${file.name} has no rows under a header row.`);
    S.mergeTable = table; S.mergeCol = J.detectTitleColumn(table.headers);
    compute(); renderMergeResult();
    say(`Read ${file.name}: ${int(table.body.length)} rows, ${int(S.merge.matched)} matched to a grade.`);
  }
  async function mergeSample() {
    await loadReader();
    const table = await window.PayGap.readTable('sample-company-annual.csv', window.PayGap.sampleCSV('eu'));
    S.mergeTable = table; S.mergeCol = J.detectTitleColumn(table.headers);
    compute(); renderMergeResult();
    say(`The Pay Gap Report’s sample payroll: ${int(table.body.length)} rows, ${int(S.merge.matched)} matched to a grade.`);
  }

  // ---------- Exports (Pro) ----------
  const slug = s => String(s || '').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 40);
  const base = () => `job-evaluation${S.ev.org ? '-' + slug(S.ev.org) : ''}-${S.ev.date || today()}`;
  function ready(what) {
    if (!S.res.valid) { say(`Fix the factor plan first: ${S.res.problems[0].text}`); return false; }
    if (!S.res.complete.length) { say(`Score every subfactor of at least one role before downloading ${what}.`); return false; }
    return true;
  }
  async function exportPdf() {
    if (!(PRO_READY && PeakLicense.requirePro('The methodology record PDF is part of Pro. The evaluation on this page stays free.'))) return;
    compute();
    if (!ready('the record')) return;
    const btn = $('x-pdf'), label = btn.textContent;
    try {
      btn.disabled = true; btn.textContent = 'Preparing the PDF…';
      await loadScript(PDFLIB_SRC, () => window.PDFLib);
      await loadScript('/assets/pe-pdf.js', () => window.PEPdf);
      await loadScript('/pay-gap-report/report.js', () => window.PayGapReport);
      await loadScript('/job-evaluation/record.js', () => window.JobEvalRecord);
      const ev = evNow();
      const bytes = await window.JobEvalRecord.pdf(window.PDFLib, { J, ev, res: S.res, checks: S.checks, generated: longDate(today()), pdfText: window.PayGapReport.pdfText });
      PeakUI.download(new Blob([bytes], { type: 'application/pdf' }), `${base()}-record.pdf`);
      say(S.res.incomplete.length ? `Record downloaded. ${S.res.incomplete.length} role${S.res.incomplete.length > 1 ? 's are' : ' is'} listed as not fully scored.` : 'Record downloaded.');
    } catch (e) {
      console.error(e);
      PeakUI.toast('The PDF could not be made. Try again, or email us so we can look into it.');
    } finally { btn.textContent = label; btn.disabled = false; }
  }
  function exportCsv() {
    if (!(PRO_READY && PeakLicense.requirePro('The categories CSV is part of Pro. The categories on this page stay free.'))) return;
    compute();
    if (!ready('the categories')) return;
    PeakUI.download(new Blob([J.categoriesCSV(evNow(), S.res)], { type: 'text/csv;charset=utf-8' }), `${base()}-categories.csv`);
    say(S.res.incomplete.length ? `Categories CSV downloaded. ${S.res.incomplete.length} role${S.res.incomplete.length > 1 ? 's' : ''} not fully scored ${S.res.incomplete.length > 1 ? 'are' : 'is'} left out.` : 'Categories CSV downloaded.');
  }
  function exportMerged() {
    if (!(PRO_READY && PeakLicense.requirePro('Adding the categories to a payroll export is part of Pro.'))) return;
    compute();
    if (!S.merge) return;
    if (!S.merge.matched) return say('No worker matched a scored role. Choose the job title column, or match the titles to roles.');
    const name = (S.mergeTable.name || 'payroll').replace(/\.(csv|tsv|txt|xlsx)$/i, '');
    PeakUI.download(new Blob([S.merge.csv], { type: 'text/csv;charset=utf-8' }), `${name}-with-categories.csv`);
    say(`Payroll downloaded with categories for ${int(S.merge.matched)} of ${int(S.merge.total)} rows.`);
  }
  function saveFile() {
    if (!(PRO_READY && PeakLicense.requirePro('Saving the evaluation as a file, to reopen it later, is part of Pro.'))) return;
    PeakUI.download(new Blob([J.serialize(S.ev)], { type: 'application/json' }), `${base()}.json`);
    S.dirty = false;
    say('Evaluation saved as a file. Open it here again to carry on.');
  }

  // ---------- Events ----------
  PeakUI.drop($('drop'), files => importFile(files[0]));
  $('sample').addEventListener('click', () => loadSample(true));
  $('first-role').addEventListener('click', () => { S.ev = newEvaluation(); addRole(true); });
  $('open-saved').addEventListener('click', openSaved);
  $('open-saved-2').addEventListener('click', openSaved);
  $('save').addEventListener('click', saveFile);
  $('reset').addEventListener('click', () => { if (!confirmLoss('Start over?')) return; S.ev = null; S.mergeTable = null; S.merge = null; render(); say('Cleared. Add roles or load the sample to start again.'); });
  $('sample-clear').addEventListener('click', () => { S.ev = null; render(); say('Sample cleared.'); });
  $('org').addEventListener('input', e => { S.ev.org = e.target.value; touch(); });
  $('add-role').addEventListener('click', () => addRole(true));
  $('import').addEventListener('click', () => $('file2').click());
  $('file2').addEventListener('change', e => { const f = e.target.files[0]; e.target.value = ''; if (f) importFile(f); });

  // Roles table
  $('roles-body').addEventListener('input', e => {
    const inp = e.target.closest('input[data-f]'); if (!inp) return;
    const i = Number(inp.closest('tr').dataset.i), role = S.ev.roles[i], f = inp.dataset.f;
    if (f === 'women' || f === 'men') {
      const v = inp.value.trim();
      const ok = v === '' || /^\d{1,7}$/.test(v);
      inp.setAttribute('aria-invalid', String(!ok));
      if (!ok) return;
      role[f] = v === '' ? null : Number(v);
    } else role[f] = inp.value;
    touch(); compute();
    renderRoleNumbers(); renderPicker(); renderResults(); renderMergeResult();
    if (i === S.cur && f === 'name') renderSheetSum();
  });
  $('roles-body').addEventListener('click', e => {
    const b = e.target.closest('button[data-act]'); if (!b) return;
    const i = Number(b.closest('tr').dataset.i), role = S.ev.roles[i];
    if (b.dataset.act === 'score') { selectRole(i, true); return; }
    if (b.dataset.act === 'remove') {
      if (S.confirm !== role.id) { S.confirm = role.id; renderRoles(); const again = document.querySelector(`#roles-body tr[data-i="${i}"] [data-act="remove"]`); if (again) again.focus(); setTimeout(() => { if (S.confirm === role.id) { S.confirm = null; if (S.ev) renderRoles(); } }, 4000); return; }
      S.confirm = null;
      S.ev.roles.splice(i, 1);
      if (S.cur >= i && S.cur > 0) S.cur--;
      touch(); compute(); render();
      say(`Removed ${nameOf(role)}.`);
    }
  });
  // Picker
  $('picker').addEventListener('click', e => { const b = e.target.closest('button[data-i]'); if (b) selectRole(Number(b.dataset.i), false); });
  $('picker-select').addEventListener('change', e => selectRole(Number(e.target.value), false));
  // Sheet
  const sheet = $('sheet');
  sheet.addEventListener('change', e => {
    if (e.target.id === 'hide-total') { S.hide = e.target.checked; try { localStorage.setItem('job-evaluation:hide-total', S.hide ? '1' : '0'); } catch (err) { /* storage blocked */ } renderSheetSum(); renderPicker(); return; }
    const r = e.target.closest('input[type=radio]'); if (r) setLevel(r.name.slice(3), Number(r.value));
  });
  sheet.addEventListener('click', e => {
    const p = e.target.closest('[data-pick]');
    if (p) { const fs = p.closest('fieldset'); setLevel(fs.dataset.sub, Number(p.dataset.pick)); return; }
    const g = e.target.closest('[data-go]');
    if (g) {
      const idx = S.ev.roles.map((r, i) => i).filter(active), at = idx.indexOf(S.cur) + Number(g.dataset.go);
      if (at >= 0 && at < idx.length) selectRole(idx[at], true);
    }
  });
  sheet.addEventListener('input', e => { const t = e.target.closest('textarea[data-why]'); if (t) { S.ev.roles[S.cur].notes[t.dataset.why] = t.value; touch(); } });
  sheet.addEventListener('mouseover', e => { const l = e.target.closest('.je-levels label'); if (l) preview(l.closest('fieldset'), Number(l.dataset.l)); });
  sheet.addEventListener('mouseout', e => { const l = e.target.closest('.je-levels label'); if (l && !l.contains(e.relatedTarget)) preview(l.closest('fieldset'), null); });
  // Tabbing into a group with no level yet focuses level 0 without choosing it: show what that level means
  sheet.addEventListener('focusin', e => { const r = e.target.closest('.je-levels input'); if (r && !r.checked) preview(r.closest('fieldset'), Number(r.value)); });
  sheet.addEventListener('focusout', e => { const r = e.target.closest('.je-levels input'); if (r) preview(r.closest('fieldset'), null); });

  // Factor plan (Pro)
  const plan = $('plan');
  plan.addEventListener('input', e => {
    const w = e.target.closest('input[data-w]');
    if (w) { const v = Number(String(w.value).replace(',', '.')); if (Number.isFinite(v) && v >= 0 && v <= 100) { scheme().subs.find(s => s.id === w.dataset.w).weight = Math.round(v * 100) / 100; afterPlanChange(false); } return; }
    const s = id => scheme().subs.find(x => x.id === id);
    const n = e.target.closest('[data-sn]'); if (n) { s(n.dataset.sn).name = n.value; const lab = plan.querySelector(`[data-sname="${CSS.escape(n.dataset.sn)}"]`); if (lab) lab.textContent = n.value; afterPlanChange(false); return; }
    const d = e.target.closest('[data-sd]'); if (d) { s(d.dataset.sd).def = d.value; touch(); return; }
    const lv = e.target.closest('[data-lv]'); if (lv) { s(lv.dataset.lv).levels[Number(lv.dataset.k)] = lv.value; touch(); return; }
  });
  plan.addEventListener('change', e => {
    // Typed fields already updated everything on input. Re-rendering the table here would replace the field the user
    // is moving to, so only the scoring sheet, which shows the descriptions, is refreshed.
    if (e.target.closest('[data-sd], [data-lv]')) { renderSheet(); return; }
    if (e.target.closest('input[data-w], [data-sn]')) return;
    const mx = e.target.closest('[data-smax]');
    if (mx) {
      const sub = scheme().subs.find(x => x.id === mx.dataset.smax), n = Number(mx.value);
      while (sub.levels.length < n + 1) sub.levels.push(`Level ${sub.levels.length}: describe what the job requires at this level.`);
      sub.levels.length = n + 1;
      for (const r of S.ev.roles) if (r.levels[sub.id] > n) delete r.levels[sub.id];
      afterPlanChange(true);
    }
  });
  plan.addEventListener('click', e => {
    const ed = e.target.closest('[data-edit]');
    if (ed) { S.editing = S.editing === ed.dataset.edit ? null : ed.dataset.edit; renderPlan(); const f = document.querySelector(`[data-sn="${CSS.escape(ed.dataset.edit)}"]`); if (f) f.focus(); return; }
    const add = e.target.closest('[data-addsub]');
    if (add) {
      let k = 1; while (scheme().subs.some(s => s.id === `custom_${k}`)) k++;
      const id = `custom_${k}`;
      const at = scheme().subs.map(s => s.group).lastIndexOf(add.dataset.addsub);
      scheme().subs.splice(at + 1, 0, { id, group: add.dataset.addsub, name: `Additional subfactor ${k}`, def: '', watch: '', weight: 0, custom: true,
        levels: ['Not applicable. The job does not require it.', 'Basic, with close supervision or in a limited context.', 'Routine, with occasional independent judgement.', 'Consistent, independent use with moderate complexity.', 'Advanced, with significant impact beyond the team.', 'Highly specialised or strategic, with organisation-wide or external impact.'] });
      S.editing = id;
      afterPlanChange(true);
      const f = document.querySelector(`[data-sn="${id}"]`); if (f) { f.focus(); f.select(); }
      say('Subfactor added with no weight. Give it a weight and take the same from others, so the total stays 100%.');
      return;
    }
    const del = e.target.closest('[data-delsub]');
    if (del) { const i = scheme().subs.findIndex(s => s.id === del.dataset.delsub); if (i > -1) { scheme().subs.splice(i, 1); for (const r of S.ev.roles) { delete r.levels[del.dataset.delsub]; delete r.notes[del.dataset.delsub]; } } S.editing = null; afterPlanChange(true); return; }
    const rs = e.target.closest('[data-resetsub]');
    if (rs) { const d = J.PLAN.find(p => p.id === rs.dataset.resetsub), s = scheme().subs.find(x => x.id === rs.dataset.resetsub); if (d && s) { s.name = d.name; s.def = d.def; s.watch = d.watch; s.levels = d.levels.slice(); for (const r of S.ev.roles) if (r.levels[s.id] > J.maxLevel(s)) delete r.levels[s.id]; } afterPlanChange(true); return; }
    if (e.target.closest('#plan-default')) { const d = J.defaultScheme(); S.ev.scheme = d; for (const r of S.ev.roles) for (const k of Object.keys(r.levels)) { const s = d.subs.find(x => x.id === k); if (!s || r.levels[k] > J.maxLevel(s)) delete r.levels[k]; } S.editing = null; afterPlanChange(true); say('Default plan and grades restored.'); }
  });
  const grades = $('grades');
  grades.addEventListener('input', e => {
    const bn = e.target.closest('[data-bn]'); if (bn) { scheme().bands[Number(bn.dataset.bn)].name = bn.value; afterPlanChange(false); return; }
    const bf = e.target.closest('[data-bf]'); if (bf) { const v = Number(bf.value); if (Number.isInteger(v) && v >= 0) { scheme().bands[Number(bf.dataset.bf)].from = v; afterPlanChange(false); } }
  });
  grades.addEventListener('change', e => {
    if (e.target.id === 'band-count') { const names = scheme().bands.map(b => b.name); scheme().bands = J.equalBands(scheme().total, Number(e.target.value)).map((b, i) => (names[i] && !/^Grade \d+$/.test(names[i]) ? Object.assign(b, { name: names[i] }) : b)); afterPlanChange(true); return; }
  });

  // Outputs
  $('evaluators').addEventListener('input', e => { S.ev.evaluators = e.target.value; touch(); });
  $('ev-date').addEventListener('change', e => { S.ev.date = /^\d{4}-\d{2}-\d{2}$/.test(e.target.value) ? e.target.value : ''; touch(); });
  $('notes').addEventListener('input', e => { S.ev.notes = e.target.value; touch(); });
  $('x-pdf').addEventListener('click', exportPdf);
  $('x-csv').addEventListener('click', exportCsv);
  $('merge-file-btn').addEventListener('click', () => $('merge-file').click());
  $('merge-file').addEventListener('change', e => { const f = e.target.files[0]; e.target.value = ''; if (f) mergeFile(f); });
  $('merge-sample').addEventListener('click', mergeSample);
  $('merge-result').addEventListener('change', e => {
    if (e.target.id === 'merge-col') { S.mergeCol = Number(e.target.value); compute(); renderMergeResult(); return; }
    const a = e.target.closest('select[data-alias]');
    if (a && a.value !== '') { const role = S.ev.roles[Number(a.value)]; (role.aliases = role.aliases || []).push(a.dataset.alias); touch(); compute(); renderMergeResult(); say(`“${a.dataset.alias}” now counts as ${nameOf(role)}.`); }
  });
  $('merge-result').addEventListener('click', e => { if (e.target.closest('#merge-download')) exportMerged(); });

  window.addEventListener('beforeunload', e => { if (S.ev && S.dirty && !S.ev.sample && S.ev.roles.length) { e.preventDefault(); e.returnValue = ''; } });

  PeakLicense.setup(LICENSE);
  S.pro = PRO_READY && PeakLicense.isPro();
  PeakLicense.onChange(pro => { S.pro = PRO_READY && pro; if (S.ev) { compute(); render(); } });
  try { if (new URLSearchParams(location.search).has('sample')) loadSample(false); } catch (e) { /* no query string */ }
  if (!S.ev) render();
})();
