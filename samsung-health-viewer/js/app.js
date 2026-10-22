/* Wristory page logic (English, German, Brazilian Portuguese and Korean pages). The files go to the worker
 * (worker.js) in this tab; the page only shows what the worker works out. The one network request the page itself can
 * make is the Pro license check, to Gumroad, when you paste a key. */
import { strings, fill } from './i18n.js';
import { sheetRows, sheetSvg, weekSvg, nightBar, STAGE_ORDER, SHEET_TOP, ROW_GAP } from './charts.js';
import { EXERCISE } from './engine.js';
import { makeFmt } from './fmt.js';

// ---- Gumroad Pro product, permalink wristory-pro. The license check sends this product id, never the permalink.
// Fail closed: while this is 'PENDING' (or empty) Pro never turns on, whatever the browser has stored.
const WRISTORY_PRO_PRODUCT_ID = 'XuXvvnsoqTxqXuPmJ1ECgQ==';
const WRISTORY_PRO_URL = 'https://dorukctn.gumroad.com/l/wristory-pro';
const PRO_READY = !!WRISTORY_PRO_PRODUCT_ID && WRISTORY_PRO_PRODUCT_ID !== 'PENDING';

const LANG = (document.documentElement.lang || 'en').slice(0, 2).toLowerCase();
const T = strings(LANG);
const $ = id => document.getElementById(id);
const esc = s => String(s === null || s === undefined ? '' : s).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
const LOCK = '<svg class="ws-lock" viewBox="0 0 20 20" aria-hidden="true" focusable="false"><path d="M6 9V6.5a4 4 0 0 1 8 0V9" fill="none" stroke="currentColor" stroke-width="1.8"/><rect x="4" y="9" width="12" height="8.5" rx="2" fill="currentColor"/></svg>';
const addDays = (day, n) => new Date(Date.parse(day + 'T00:00:00Z') + n * 864e5).toISOString().slice(0, 10);
const reduced = () => matchMedia('(prefers-reduced-motion: reduce)').matches;

/* ---------- formatting ---------- */
const F = makeFmt(T, LANG);
const exName = c => (T.ex && T.ex[c]) || EXERCISE[c] || (typeof c === 'string' ? c : `${EXERCISE[0]} ${c}`);

const state = { meta: null, pro: false, period: 'last90', from: null, to: null, data: null, sel: 0, logTab: 'bp', req: 0, tables: null, tablesKey: '' };
let worker = null;

/* ---------- license ---------- */
function setupLicense() {
  if (!window.PeakLicense) return;
  window.PeakLicense.setup(Object.assign({ tool: 'wristory', productId: PRO_READY ? WRISTORY_PRO_PRODUCT_ID : 'PENDING', permalink: 'wristory-pro', buyUrl: WRISTORY_PRO_URL, pitch: T.pitch }, T.license ? { strings: T.license, localMessages: true } : {}));
  window.PeakLicense.onChange(isPro => {
    const was = state.pro;
    state.pro = PRO_READY && !!isPro;
    $('pro-state').textContent = state.pro ? T.proActive : T.proOff;
    document.body.classList.toggle('ws-is-pro', state.pro);
    if (was !== state.pro && state.meta) { renderPeriods(); renderProTools(); if (!state.pro && state.period !== 'last90') setPeriod('last90', true); }
  });
}
// fail closed: Pro is on only when this page says so, not when the browser merely holds a stored key
function needPro(reason) {
  if (state.pro) return true;
  if (window.PeakLicense) window.PeakLicense.open(reason || T.pitch);
  return false;
}

/* ---------- worker ---------- */
function getWorker() {
  if (worker) return worker;
  try { worker = new Worker(new URL('./worker.js', import.meta.url), { type: 'module' }); } catch (e) { worker = null; return null; }
  worker.onmessage = onMessage;
  worker.onerror = () => showError([{ name: '', reason: 'read' }]);
  return worker;
}
const post = m => { const w = getWorker(); if (w) w.postMessage(m); };
const pending = new Map();
function ask(msg) { return new Promise(res => { const id = ++state.req; pending.set(id, res); post(Object.assign({ id }, msg)); }); }

function stage(name) {
  ['idle', 'busy', 'error', 'done'].forEach(s => { $('stage-' + s).hidden = s !== name; });
  $('panel').dataset.state = name;
}
const focusEl = el => { if (el) el.focus({ preventScroll: true }); };
function setBar(p) { const b = $('busy-bar'); b.setAttribute('aria-valuenow', String(Math.round(p))); b.querySelector('i').style.width = `${p}%`; }
function busy() { stage('busy'); $('busy-title').textContent = T.reading; $('busy-sub').textContent = T.starting; setBar(4); focusEl($('busy-title')); }
function startFiles(items) { if (!items || !items.length) return; busy(); post({ type: 'files', files: items }); }
function startSample() { busy(); setBar(20); post({ type: 'sample' }); }

function problemText(p) {
  if (p.reason === 'nofiles') return fill(T.errNoFilesText, { inside: p.inside && p.inside.length ? fill(T.errInside, { list: p.inside.join(', ') }) : '' });
  const key = { zip: 'errZip', empty: 'errEmpty', type: 'errType', toobig: 'errBig', read: 'errRead', encrypted: 'errEncrypted' }[p.reason];
  return key ? fill(T[key], { name: p.name }) : '';
}
function showError(problems) {
  stage('error');
  const nofiles = !problems.length || problems.every(p => p.reason === 'nofiles' || p.reason === 'type');
  $('error-title').textContent = nofiles ? T.errNoFiles : T.errTitle;
  const lines = (problems.length ? problems : [{ reason: 'nofiles' }]).map(problemText).filter(Boolean);
  $('error-text').innerHTML = lines.length > 1 ? `<ul>${lines.map(l => `<li>${esc(l)}</li>`).join('')}</ul>` : `<p>${esc(lines[0] || '')}</p>`;
  focusEl($('error-title'));
}

function onMessage(ev) {
  const m = ev.data || {};
  if (m.type === 'progress') {
    const pct = m.total ? Math.round((m.done / m.total) * 100) : 0;
    $('busy-sub').textContent = m.total && m.done ? fill(T.readingPct, { file: m.file, pct }) : fill(T.readingFile, { file: m.file });
    setBar(m.count ? Math.max(4, ((m.index || 0) / m.count) * 100) : Math.max(6, pct));
    return;
  }
  if (m.type === 'loaded') { onLoaded(m.meta); return; }
  if (m.type === 'error') { if (m.id !== undefined && pending.has(m.id)) { pending.get(m.id)({ error: m.message }); pending.delete(m.id); } else if (!state.meta) showError([{ name: '', reason: 'read' }]); return; }
  if (m.id !== undefined && pending.has(m.id)) { const res = pending.get(m.id); pending.delete(m.id); res(m); }
}

function onLoaded(meta) {
  if (!meta.first || !meta.free) { state.meta = null; showError(meta.problems.length ? meta.problems : [{ reason: 'nofiles' }]); return; }
  state.meta = meta;
  state.tables = null; state.tablesKey = '';
  stage('done');
  const c = meta.counts;
  $('done-title').textContent = meta.sample ? T.doneSampleTitle : fill(T.doneTitle, { days: F.n(c.days), nights: F.n(c.nights) });
  $('done-sub').textContent = meta.sample ? T.doneSampleSub : fill(T.doneSub, { first: F.date(meta.first), last: F.date(meta.last), workouts: F.n(c.workouts) });
  focusEl($('done-title'));
  $('view').hidden = false;
  $('coverage').textContent = fill(meta.sample ? T.coverageSample : T.coverage, { first: F.date(meta.first), last: F.date(meta.last) });
  fillSelects();
  renderRead();
  setPeriod('last90', true);
}

/* ---------- period ---------- */
function rangeOf(key) {
  const M = state.meta;
  if (key === 'last90') return M.free;
  if (key === 'last30') { const f = addDays(M.last, -29); return { from: f < M.first ? M.first : f, to: M.last }; }
  if (key === 'all') return { from: M.first, to: M.last };
  if (/^y\d{4}$/.test(key)) { const y = key.slice(1); return { from: `${y}-01-01` < M.first ? M.first : `${y}-01-01`, to: `${y}-12-31` > M.last ? M.last : `${y}-12-31` }; }
  return M.free;
}
function renderPeriods() {
  const M = state.meta;
  const keys = ['last90'].concat(M.years.slice().reverse().map(y => 'y' + y)).concat(M.years.length > 1 ? ['all'] : []);
  $('periods').innerHTML = keys.map(k => {
    const label = k === 'last90' ? T.last90 : k === 'all' ? T.allYears : k.slice(1);
    const locked = k !== 'last90' && !state.pro;
    return `<button type="button" class="ws-period${locked ? ' is-locked' : ''}" data-period="${k}" aria-pressed="${state.period === k}">${esc(label)}${locked ? LOCK : ''}</button>`;
  }).join('');
}
async function setPeriod(key, force) {
  if (!state.meta) return;
  if (key !== 'last90' && !state.pro && !force) { needPro(T.proPeriod); return; }
  if (!state.pro) key = 'last90';
  state.period = key;
  const r = rangeOf(key);
  state.from = r.from; state.to = r.to;
  renderPeriods();
  const res = await ask({ type: 'summary', from: r.from, to: r.to });
  if (res.error) return;
  state.data = res;
  state.sel = Math.max(0, res.sheet.length - 1);
  const fn = $('free-note');
  fn.hidden = state.pro || !state.meta.years.length || state.meta.first >= state.meta.free.from;
  fn.textContent = fill(T.freeNote, { from: F.date(r.from), to: F.date(r.to) });
  renderSheet();
  renderPanels();
  renderProTools();
}

/* ---------- the day sheet ---------- */
function heartKey() { return state.meta.heart; }
function rowsNow() {
  const has = Object.assign({}, state.meta.has);
  const s = state.data.sheet;
  // a row with nothing in this period stays out of the sheet
  if (!s.some(d => d.steps)) has.steps = false;
  if (!s.some(d => d.asleep)) has.sleep = false;
  if (!s.some(d => d.heart !== null)) has.heart = false;
  if (!s.some(d => d.kg !== null)) has.weight = false;
  if (!s.some(d => d.stress !== null)) has.stress = false;
  if (!s.some(d => d.spo2 !== null)) has.spo2 = false;
  if (!s.some(d => d.wo)) has.workouts = false;
  if (!s.some(d => d.bp)) has.bp = false;
  return sheetRows(has, heartKey(), $('sheet-scroll').clientWidth < 420);
}
let colW = 8;
function renderSheet() {
  const days = state.data.sheet, rows = rowsNow();
  const box = $('sheet-scroll');
  const avail = Math.max(240, box.clientWidth || 600);
  colW = Math.max(3, Math.min(16, Math.floor((avail / days.length) * 10) / 10));
  $('sheet').innerHTML = sheetSvg(days, rows, { colW, sel: state.sel, monthName: F.month });
  $('sheet').setAttribute('aria-label', fill(T.sheetLabel, { from: F.date(state.from), to: F.date(state.to) }));
  const stageKeys = state.meta.has.staged ? STAGE_ORDER : ['asleep'];
  $('sheet-labels').innerHTML = `<div style="height:${SHEET_TOP}px"></div>` + rows.map(r => {
    const legend = r.key === 'sleep' ? `<span class="ws-legend">${stageKeys.map(k => `<i class="ws-sw ws-sw-${k}"></i>${esc(T.stage[k])}`).join(' ')}</span>` : '';
    return `<div class="ws-label ws-label-${r.key}" style="height:${r.h}px;margin-bottom:${ROW_GAP}px"><span>${esc(T.row[r.key])}</span>${legend}</div>`;
  }).join('');
  box.scrollLeft = box.scrollWidth;
  renderDay();
}
function moveSel(i) {
  const n = state.data.sheet.length;
  state.sel = Math.max(0, Math.min(n - 1, i));
  const sel = document.getElementById('sv-sel');
  if (sel) sel.setAttribute('x', String(state.sel * colW));
  const box = $('sheet-scroll'), x = state.sel * colW;
  if (x < box.scrollLeft + 10) box.scrollLeft = x - 40;
  else if (x > box.scrollLeft + box.clientWidth - 20) box.scrollLeft = x - box.clientWidth + 60;
  renderDay();
}
function renderDay() {
  const d = state.data.sheet[state.sel];
  if (!d) { $('daycard').innerHTML = ''; return; }
  const lines = [];
  if (d.steps) lines.push(['steps', fill(T.dSteps, { v: F.n(d.steps) })]);
  if (d.asleep) {
    const st = d.staged ? `<span class="ws-dc-stages">${STAGE_ORDER.map(k => `<span><i class="ws-sw ws-sw-${k}"></i>${esc(T.stage[k])} ${esc(F.dur(d[k]))}</span>`).join('')}</span>` : '';
    lines.push(['sleep', `${esc(fill(T.dSleep, { v: F.dur(d.asleep) }))}${d.bed !== null ? `<span class="ws-dc-sub">${esc(fill(T.dBedWake, { bed: F.clock(d.bed), wake: F.clock(d.wake) }))}</span>` : ''}${st}`, true]);
  }
  if (d.heart !== null) lines.push([heartKey(), fill(T.dHeart || '{v} bpm', { v: F.n(d.heart) })]);
  if (d.kg !== null) lines.push(['weight', F.kg(d.kg)]);
  if (d.stress !== null) lines.push(['stress', fill(T.dStress, { v: F.n(d.stress) })]);
  if (d.spo2 !== null) lines.push(['spo2', F.pct(d.spo2)]);
  if (d.wo) lines.push(['workouts', fill(d.wo > 1 ? T.dWorkoutsN : T.dWorkouts, { n: d.wo, t: F.dur(d.woMin) })]);
  if (d.bp) lines.push(['bp', fill(d.bp > 1 ? T.dBpN : T.dBp, { n: d.bp })]);
  $('daycard').innerHTML = `<p class="ws-dc-date">${esc(F.long(d.day))}</p>` + (lines.length ? `<dl>${lines.map(([k, v, html]) => `<div><dt>${esc(T.row[k])}</dt><dd>${html ? v : esc(v)}</dd></div>`).join('')}</dl>` : `<p class="ws-note">${esc(T.dayNone)}</p>`);
}

/* ---------- panels ---------- */
function weeksWithLabels(ws) { return ws.map(w => Object.assign({ label: F.short(w.from) }, w)); }
function panel(key, title, body, wide) { return `<section class="ws-card ws-card-${key}${wide ? ' ws-card-wide' : ''}" aria-labelledby="p-${key}"><h3 id="p-${key}"><i class="ws-dot ws-dot-${key}" aria-hidden="true"></i>${esc(title)}</h3>${body}</section>`; }
function renderPanels() {
  const s = state.data.summary, W = state.data.weeks, out = [], missing = [];
  const p = t => `<p>${esc(t)}</p>`;
  if (s.steps) {
    out.push(panel('steps', T.stepsH, `<p class="ws-big">${esc(fill(T.stepsLine, { avg: F.n(s.steps.avg), days: F.n(s.steps.days) }))}</p>`
      + p([s.steps.best ? fill(T.stepsBest, { steps: F.n(s.steps.best.steps), day: F.date(s.steps.best.day) }) : '', fill(T.stepsOver, { n: F.n(s.steps.over10k) }), s.steps.km ? fill(T.stepsKm, { km: F.d1(s.steps.km) }) : ''].filter(Boolean).join(' '))
      + `<figure class="ws-fig"><div class="ws-chart" data-chart="steps"></div><figcaption>${esc(T.weekCap)}</figcaption></figure>`, true));
  } else missing.push(T.row.steps);
  if (s.sleep) {
    const staged = s.sleep.staged > 0;
    const table = staged ? `<table class="ws-mini"><tbody>${STAGE_ORDER.map(k => { const tot = STAGE_ORDER.reduce((a, x) => a + (s.sleep[x] || 0), 0); return `<tr><th scope="row"><i class="ws-sw ws-sw-${k}" aria-hidden="true"></i>${esc(T.stage[k])}</th><td>${esc(F.dur(s.sleep[k]))}</td><td>${esc(F.pct(Math.round(((s.sleep[k] || 0) / tot) * 100)))}</td></tr>`; }).join('')}</tbody></table>` : `<p class="ws-note">${esc(T.sleepUnstaged)}</p>`;
    out.push(panel('sleep', T.sleepH, `<p class="ws-big">${esc(fill(T.sleepLine, { asleep: F.dur(s.sleep.asleep), nights: F.n(s.sleep.nights) }))}</p>`
      + (s.sleep.bed !== null ? p(fill(T.sleepBed, { bed: F.clock(s.sleep.bed), wake: F.clock(s.sleep.wake) })) : '')
      + (staged ? `<h4>${esc(T.sleepAvgH)}</h4>${nightBar(s.sleep, T.stage)}` : '') + table));
  } else missing.push(T.row.sleep);
  if (s.heart) {
    const k = heartKey();
    const main = k === 'resting' && s.heart.resting ? fill(T.heartResting, { v: F.n(s.heart.resting), n: F.n(s.heart.restingDays) }) : k === 'sleeping' && s.heart.sleeping ? fill(T.heartSleeping, { v: F.n(s.heart.sleeping), n: F.n(s.heart.sleepingDays) }) : s.heart.low ? fill(T.heartLow, { v: F.n(s.heart.low) }) : '';
    out.push(panel('heart', T.heartH, (main ? `<p class="ws-big">${esc(main)}</p>` : '') + (s.heart.avg ? p(fill(T.heartDay, { avg: F.n(s.heart.avg), high: F.n(s.heart.high) })) : '')
      + `<figure class="ws-fig"><div class="ws-chart" data-chart="heart"></div><figcaption>${esc(T.row[k])}: ${esc(T.weekCap)}</figcaption></figure>`));
  } else missing.push(T.heartH);
  if (s.weight) {
    out.push(panel('weight', T.weightH, `<p class="ws-big">${esc(fill(T.weightLine, { first: F.kg(s.weight.first.kg), d1: F.date(s.weight.first.day), last: F.kg(s.weight.last.kg), d2: F.date(s.weight.last.day) }))}</p>`
      + p(`${fill(T.weightChange, { v: F.kgSigned(s.weight.change) })} ${fill(T.weightN, { n: F.n(s.weight.n) })}`)
      + `<figure class="ws-fig"><div class="ws-chart" data-chart="kg"></div><figcaption>${esc(T.weekCapKg)}</figcaption></figure>`));
  } else missing.push(T.weightH);
  if (s.workouts) {
    const rows = s.workouts.types.slice(0, 7).map(t => `<tr><th scope="row">${esc(exName(t.type))}</th><td>${F.n(t.n)}</td><td>${esc(F.dur(t.mins))}</td><td>${t.km >= 0.1 ? esc(F.km(t.km)) : ''}</td></tr>`).join('');
    out.push(panel('workouts', T.woH, `<p class="ws-big">${esc(fill(T.woLine, { n: F.n(s.workouts.n), t: F.dur(s.workouts.mins) }))}</p>`
      + `<div class="ws-table-wrap"><table class="ws-mini ws-mini-4"><thead><tr><th scope="col">${esc(T.woType)}</th><th scope="col">${esc(T.woCount)}</th><th scope="col">${esc(T.woTime)}</th><th scope="col">${esc(T.woDist)}</th></tr></thead><tbody>${rows}</tbody></table></div>`));
  } else missing.push(T.woH);
  const small = [];
  if (s.stress) small.push(`<div class="ws-small-item"><h4><i class="ws-dot ws-dot-stress" aria-hidden="true"></i>${esc(T.stressH)}</h4>` + p(fill(T.stressLine, { v: F.n(s.stress.avg), n: F.n(s.stress.days) })) + '</div>');
  else missing.push(T.stressH);
  if (s.spo2) small.push(`<div class="ws-small-item"><h4><i class="ws-dot ws-dot-spo2" aria-hidden="true"></i>${esc(T.spo2H)}</h4>` + p(fill(T.spo2Line, { v: F.d1(s.spo2.avg), n: F.n(s.spo2.days), low: F.n(s.spo2.low) })) + '</div>');
  else missing.push(T.spo2H);
  if (s.bp) small.push(`<div class="ws-small-item"><h4><i class="ws-dot ws-dot-bp" aria-hidden="true"></i>${esc(T.bpH)}</h4>` + p(`${fill(T.bpLine, { n: F.n(s.bp.n), sys: F.n(s.bp.sys), dia: F.n(s.bp.dia) })} ${fill(T.bpLast, { sys: F.n(s.bp.last.sys), dia: F.n(s.bp.last.dia), day: F.date(s.bp.last.day) })}`) + '</div>');
  else missing.push(T.bpH);
  if (small.length) out.push(`<section class="ws-card ws-card-small" aria-label="${esc([s.stress && T.stressH, s.spo2 && T.spo2H, s.bp && T.bpH].filter(Boolean).join(', '))}">${small.join('')}</section>`);
  $('panels').innerHTML = out.join('') + (missing.length ? `<p class="ws-missing">${esc(fill(T.notInFiles, { list: missing.join(', ') }))}</p>` : '');
  drawCharts();
}
// the week charts are drawn at the width they get, so their text is never stretched
function drawCharts() {
  if (!state.data) return;
  const W = state.data.weeks;
  const spec = { steps: [W.steps, 'bar', 'ws-c-steps', F.n, T.weekCap], heart: [W.heart, 'line', 'ws-c-heart', v => `${F.n(v)} bpm`, T.weekCap], kg: [W.kg, 'line', 'ws-c-kg', v => F.kg(v), T.weekCapKg] };
  document.querySelectorAll('[data-chart]').forEach(el => { const [ws, kind, cls, fmt, label] = spec[el.dataset.chart]; el.innerHTML = weekSvg(weeksWithLabels(ws), kind, cls, fmt, label, el.clientWidth); });
}

/* ---------- Pro tools ---------- */
function fillSelects() {
  const M = state.meta, ys = M.years.slice().reverse();
  const opt = (v, l, sel) => `<option value="${v}"${sel ? ' selected' : ''}>${esc(l)}</option>`;
  $('cmp-a').innerHTML = ys.map((y, i) => opt(y, y, i === Math.min(1, ys.length - 1))).join('');
  $('cmp-b').innerHTML = ys.map((y, i) => opt(y, y, i === 0)).join('');
  $('poster-year').innerHTML = ys.map((y, i) => opt(y, y, i === (ys.length > 1 && M.last.slice(5) < '06-30' ? 1 : 0))).join('');
  $('pdf-period').innerHTML = [opt('last30', T.pdfLast30), opt('last90', T.pdfLast90, true)].concat(ys.map(y => opt('y' + y, fill(T.pdfYear, { y })))).concat(ys.length > 1 ? [opt('all', T.pdfAll)] : []).join('');
}
async function renderProTools() {
  if (!state.meta) return;
  // year against year
  const a = +$('cmp-a').value, b = +$('cmp-b').value;
  const cmpKeys = ['days', 'stepsAvg', 'over10k', 'sleepAsleep', 'sleepDeep', 'hrResting', 'hrSleeping', 'hrLow', 'weightChange', 'workouts', 'workoutHours', 'stress', 'spo2', 'bpSys', 'bpDia'];
  if (!state.pro) {
    $('cmp-table').innerHTML = `<table class="ws-cmp is-locked"><thead><tr><th scope="col">${esc(T.metric)}</th><th scope="col">${a || ''}</th><th scope="col">${b || ''}</th><th scope="col">${esc(T.diff)}</th></tr></thead><tbody>${cmpKeys.slice(0, 8).map(k => `<tr><th scope="row">${esc(T.cmp[k])}</th><td>${LOCK}</td><td>${LOCK}</td><td>${LOCK}</td></tr>`).join('')}</tbody></table>`;
  } else if (a === b) {
    $('cmp-table').innerHTML = `<p class="ws-note">${esc(T.cmpEmpty)}</p>`;
  } else {
    const res = await ask({ type: 'compare', a, b });
    const fmt = (key, v) => {
      if (v === null || v === undefined) return '';
      if (/^sleep(Asleep|Deep|Rem)$/.test(key)) return F.dur(v);
      if (key === 'sleepBed' || key === 'sleepWake') return F.clock(v);
      if (/^weight/.test(key)) return key === 'weightChange' ? F.kgSigned(v) : F.kg(v);
      if (key === 'km') return F.km(v);
      if (key === 'spo2') return F.pct(v);
      if (key === 'workoutHours') return F.dur(v * 60);
      if (/^hr/.test(key)) return `${F.n(v)} bpm`;
      if (/^bp/.test(key)) return `${F.n(v)} mmHg`;
      return F.n(v);
    };
    const diff = r => {
      if (r.a === null || r.b === null || r.key === 'sleepBed' || r.key === 'sleepWake' || r.key === 'weightStart' || r.key === 'weightEnd') return '';
      const d = r.b - r.a;
      if (!d) return '0';
      const sign = d > 0 ? '+' : '-';
      return sign + fmt(r.key, Math.abs(d)).replace(/^[+-]/, '');
    };
    $('cmp-table').innerHTML = res.rows.length ? `<table class="ws-cmp"><thead><tr><th scope="col">${esc(T.metric)}</th><th scope="col">${a}</th><th scope="col">${b}</th><th scope="col">${esc(T.diff)} (${b} - ${a})</th></tr></thead><tbody>${res.rows.map(r => `<tr><th scope="row">${esc(T.cmp[r.key])}</th><td>${esc(fmt(r.key, r.a))}</td><td>${esc(fmt(r.key, r.b))}</td><td>${esc(diff(r))}</td></tr>`).join('')}</tbody></table>` : `<p class="ws-note">${esc(T.cmpEmpty)}</p>`;
  }
  renderLog();
}
async function getTables(from, to) {
  const key = from + to;
  if (state.tables && state.tablesKey === key) return state.tables;
  const res = await ask({ type: 'tables', from, to });
  state.tables = res.tables; state.tablesKey = key;
  return res.tables;
}
async function renderLog() {
  const bp = state.logTab === 'bp';
  $('log-tab-bp').setAttribute('aria-selected', String(bp)); $('log-tab-bp').tabIndex = bp ? 0 : -1;
  $('log-tab-weight').setAttribute('aria-selected', String(!bp)); $('log-tab-weight').tabIndex = bp ? -1 : 0;
  const head = bp ? [T.logDate, T.logSys, T.logDia, T.logPulse] : [T.logDate, T.logKg, T.logFat, T.logMuscle];
  if (!state.pro) {
    $('log-panel').innerHTML = `<table class="ws-cmp is-locked"><thead><tr>${head.map(h => `<th scope="col">${esc(h)}</th>`).join('')}</tr></thead><tbody>${[0, 1, 2].map(() => `<tr>${head.map(() => `<td>${LOCK}</td>`).join('')}</tr>`).join('')}</tbody></table>`;
    return;
  }
  const t = await getTables(state.from, state.to);
  const rows = (bp ? t.bp : t.weight).slice().reverse();
  const MAX = 400;
  const cells = r => (bp ? [r.time, F.n(r.systolic), F.n(r.diastolic), r.pulse ? F.n(r.pulse) : ''] : [r.time, F.kg(r.weight_kg), r.body_fat_pct ? F.pct1(r.body_fat_pct) : '', r.muscle_kg ? F.kg(r.muscle_kg) : '']);
  $('log-panel').innerHTML = rows.length ? `<table class="ws-cmp ws-log"><thead><tr>${head.map(h => `<th scope="col">${esc(h)}</th>`).join('')}</tr></thead><tbody>${rows.slice(0, MAX).map(r => `<tr>${cells(r).map((c, i) => (i ? `<td>${esc(c)}</td>` : `<th scope="row">${esc(c)}</th>`)).join('')}</tr>`).join('')}</tbody></table>${rows.length > MAX ? `<p class="ws-note">${esc(fill(T.logMore, { n: MAX }))}</p>` : ''}` : `<p class="ws-note">${esc(T.logNone)}</p>`;
}

/* ---------- files ---------- */
function stamp() { return state.meta.sample ? 'sample' : state.meta.last; }
function localTables(t) {
  // workout names and yes/no in the page's language; column names in the page's language
  const map = rows => rows.map(r => Object.fromEntries(Object.entries(r).map(([k, v]) => [T.cols[k] || k, k === 'type' ? exName(v) : k === 'recorded' ? (v === 'auto' ? T.auto : T.workout) : k === 'nap' ? (v === 'yes' ? T.yes : T.no) : v])));
  return { daily: map(t.daily), sleep: map(t.sleep), workouts: map(t.workouts), weight: map(t.weight), bp: map(t.bp) };
}
async function saveXlsx() {
  if (!needPro()) return;
  const st = $('xl-status'); st.textContent = T.making;
  try {
    const t = localTables(await getTables(state.meta.first, state.meta.last));
    const { writeXlsx } = await import('./xlsx.js');
    const sheets = Object.entries(t).filter(([, rows]) => rows.length).map(([k, rows]) => ({ name: T.sheetNames[k], rows }));
    const name = `wristory-${stamp()}.xlsx`;
    window.PeakUI ? window.PeakUI.download(await writeXlsx(sheets), name) : null;
    st.textContent = fill(T.saved, { name });
  } catch (e) { st.textContent = T.failed; }
}
async function saveCsv() {
  if (!needPro()) return;
  const st = $('xl-status'); st.textContent = T.making;
  try {
    const t = localTables(await getTables(state.meta.first, state.meta.last));
    const { csvZip } = await import('./xlsx.js');
    const name = `wristory-csv-${stamp()}.zip`;
    window.PeakUI.download(await csvZip(t, T.sheetNames, { comma: LANG === 'de' || LANG === 'pt' }), name);
    st.textContent = fill(T.saved, { name });
  } catch (e) { st.textContent = T.failed; }
}
async function savePdf() {
  if (!needPro()) return;
  const st = $('pdf-status'); st.textContent = T.making;
  try {
    const r = rangeOf($('pdf-period').value);
    const [sum, t, mod] = await Promise.all([ask({ type: 'summary', from: r.from, to: r.to }), ask({ type: 'tables', from: r.from, to: r.to }), import('./pdf.js')]);
    const blob = await mod.makeReport({ T, F, lang: LANG, from: r.from, to: r.to, summary: sum.summary, sheet: sum.sheet, weeks: sum.weeks, tables: t.tables, heart: heartKey(), exName, sample: state.meta.sample, has: state.meta.has });
    const name = `wristory-report-${r.from}-${r.to}.pdf`;
    window.PeakUI.download(blob.blob, name);
    st.textContent = fill(T.savedPdf, { name, n: blob.pages });
  } catch (e) { st.textContent = T.failed; }
}
async function savePoster(kind) {
  if (!needPro()) return;
  const st = $('poster-status'); st.textContent = T.making;
  try {
    const y = +$('poster-year').value;
    const [res, mod] = await Promise.all([ask({ type: 'year', year: y }), import('./poster.js')]);
    const out = await mod.makePoster({ T, F, lang: LANG, year: y, summary: res.summary, sheet: res.sheet, sample: state.meta.sample, staged: state.meta.has.staged, kind });
    const name = `wristory-${y}-poster${kind === 'png' ? '.png' : `-${kind}.pdf`}`;
    window.PeakUI.download(out, name);
    st.textContent = fill(T.saved, { name });
  } catch (e) { st.textContent = T.failed; }
}

/* ---------- what was read ---------- */
function renderRead() {
  const M = state.meta;
  const items = M.files.filter(f => f.rows || f.skipped).map(f => `<li>${esc(fill(T.readRows, { rows: F.n(f.rows), name: f.name }))}${f.skipped ? ` <span class="ws-note">${esc(fill(T.readSkipped, { n: F.n(f.skipped) }))}</span>` : ''}</li>`);
  const probs = M.problems.map(problemText).filter(Boolean);
  $('read-list').innerHTML = `<ul>${items.join('')}</ul>` + (M.ignoredCount ? `<p class="ws-note">${esc(fill(T.readIgnored, { n: F.n(M.ignoredCount) }))}</p>` : '') + (probs.length ? `<p>${esc(T.readProblems)}</p><ul>${probs.map(p => `<li>${esc(p)}</li>`).join('')}</ul>` : '');
}

/* ---------- wiring ---------- */
async function dropped(dt) {
  const out = [];
  const entries = [...(dt.items || [])].map(i => (i.webkitGetAsEntry ? i.webkitGetAsEntry() : null)).filter(Boolean);
  if (!entries.length) return [...(dt.files || [])].map(f => ({ file: f, path: f.name }));
  const walk = async (entry, path) => {
    if (entry.isFile) { const f = await new Promise((res, rej) => entry.file(res, rej)); out.push({ file: f, path: path + f.name }); return; }
    const reader = entry.createReader();
    let batch;
    do { batch = await new Promise((res, rej) => reader.readEntries(res, rej)); for (const e of batch) await walk(e, path + entry.name + '/'); } while (batch.length);
  };
  for (const e of entries) await walk(e, '');
  return out;
}
function wire() {
  const fi = $('file-input'), fo = $('folder-input');
  $('btn-choose').addEventListener('click', () => fi.click());
  $('btn-folder').addEventListener('click', () => fo.click());
  $('btn-retry').addEventListener('click', () => fi.click());
  $('btn-sample').addEventListener('click', startSample);
  $('btn-error-sample').addEventListener('click', startSample);
  $('btn-reset').addEventListener('click', () => { post({ type: 'reset' }); state.meta = null; $('view').hidden = true; stage('idle'); focusEl($('drop-title')); });
  $('btn-see').addEventListener('click', ev => { ev.preventDefault(); const v = $('view'); v.scrollIntoView({ behavior: reduced() ? 'auto' : 'smooth' }); v.focus({ preventScroll: true }); });
  fi.addEventListener('change', () => { const files = [...fi.files].map(f => ({ file: f, path: f.name })); fi.value = ''; startFiles(files); });
  fo.addEventListener('change', () => { const files = [...fo.files].map(f => ({ file: f, path: f.webkitRelativePath || f.name })); fo.value = ''; startFiles(files); });
  const drop = $('drop');
  ['dragenter', 'dragover'].forEach(t => drop.addEventListener(t, e => { e.preventDefault(); drop.classList.add('is-over'); }));
  ['dragleave', 'drop'].forEach(t => drop.addEventListener(t, e => { e.preventDefault(); drop.classList.remove('is-over'); }));
  drop.addEventListener('drop', async e => { const items = await dropped(e.dataTransfer); startFiles(items); });
  $('periods').addEventListener('click', e => { const b = e.target.closest('[data-period]'); if (b) setPeriod(b.dataset.period); });
  const sheet = $('sheet');
  sheet.addEventListener('click', e => { const r = sheet.getBoundingClientRect(); moveSel(Math.floor((e.clientX - r.left) / colW)); });
  sheet.addEventListener('keydown', e => {
    const k = e.key, i = state.sel;
    const to = k === 'ArrowLeft' ? i - 1 : k === 'ArrowRight' ? i + 1 : k === 'PageUp' ? i - 7 : k === 'PageDown' ? i + 7 : k === 'Home' ? 0 : k === 'End' ? 1e9 : null;
    if (to === null) return;
    e.preventDefault(); moveSel(to);
  });
  let rt = 0;
  addEventListener('resize', () => { clearTimeout(rt); rt = setTimeout(() => { if (state.data) { renderSheet(); drawCharts(); } }, 150); });
  ['cmp-a', 'cmp-b'].forEach(id => $(id).addEventListener('change', () => { if (!needPro()) return; renderProTools(); }));
  $('log-tab-bp').addEventListener('click', () => { if (!needPro()) return; state.logTab = 'bp'; renderLog(); });
  $('log-tab-weight').addEventListener('click', () => { if (!needPro()) return; state.logTab = 'weight'; renderLog(); });
  $('log-tab-bp').parentElement.addEventListener('keydown', e => { if (e.key === 'ArrowRight' || e.key === 'ArrowLeft') { e.preventDefault(); const nx = state.logTab === 'bp' ? 'weight' : 'bp'; $('log-tab-' + nx).focus(); $('log-tab-' + nx).click(); } });
  $('btn-xlsx').addEventListener('click', saveXlsx);
  $('btn-csv').addEventListener('click', saveCsv);
  $('btn-pdf').addEventListener('click', savePdf);
  document.querySelectorAll('[data-poster]').forEach(b => b.addEventListener('click', () => savePoster(b.dataset.poster)));
}

setupLicense();
wire();
document.documentElement.dataset.wsReady = '1';
