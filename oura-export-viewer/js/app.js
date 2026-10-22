/* Nightjar page logic (English, German, French and Japanese pages). The export goes to the worker (worker.js) in this
 * tab; the page only shows what the worker works out. The one network request the page itself can make is the Pro
 * license check, to Gumroad, when you paste a key. */
import { strings, fill } from './i18n.js';
import { makeFmt } from './fmt.js';
import { drawWeave, weaveGeometry, hypnogramSvg, nightCurveSvg, trendSvg, STAGE } from './charts.js';
import { drawCard, cardFileName, CARD_TYPES, FREE_CARDS } from './cards.js';

// ---- Gumroad Pro product, permalink nightjar-pro. The license check sends this product id, never the permalink.
// Fail closed: while this is 'PENDING' (or empty) Pro never turns on, whatever the browser has stored.
const NIGHTJAR_PRO_PRODUCT_ID = 'k60gXpODcY0I3E8GB1zcYw==';
const NIGHTJAR_PRO_URL = 'https://dorukctn.gumroad.com/l/nightjar-pro';
const PRO_READY = !!NIGHTJAR_PRO_PRODUCT_ID && NIGHTJAR_PRO_PRODUCT_ID !== 'PENDING';

const LANG = (document.documentElement.lang || 'en').slice(0, 2);
const T = strings(LANG);
const $ = id => document.getElementById(id);
const SEP = LANG === 'ja' ? '、' : ', ';
const esc = s => String(s === null || s === undefined ? '' : s).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
const LOCK = '<svg class="nj-lock" viewBox="0 0 20 20" aria-hidden="true" focusable="false"><path d="M6 9V6.5a4 4 0 0 1 8 0V9" fill="none" stroke="currentColor" stroke-width="1.8"/><rect x="4" y="9" width="12" height="8.5" rx="2" fill="currentColor"/></svg>';
const usF = /^en-(US|LR|MM)$/i.test(navigator.language || '');
const browserTz = (() => { try { return Intl.DateTimeFormat().resolvedOptions().timeZone || 'UTC'; } catch (e) { return 'UTC'; } })();
const addDays = (day, n) => new Date(Date.parse(day + 'T00:00:00Z') + n * 864e5).toISOString().slice(0, 10);

const state = {
  meta: null, pro: false, fahrenheit: usF, period: 'last90', from: null, to: null, data: null, req: 0,
  night: null, trend: 'hrv', card: 'recent', cardYear: null, cardData: null, wGeom: null, nightsShown: [], showAllWorkouts: false,
};
let F = makeFmt(T, { fahrenheit: state.fahrenheit });
let worker = null;

/* ---------- license ---------- */
function setupLicense() {
  if (!window.PeakLicense) return;
  const L = {
    de: { title: 'Pro holen', buy: 'Pro bei Gumroad kaufen', keyLabel: 'Schon gekauft? Füge deinen Lizenzschlüssel ein', verify: 'Aktivieren', close: 'Schließen', checking: 'Wird bei Gumroad geprüft…', badKey: 'Das sieht nicht wie ein Lizenzschlüssel aus. Er steht in deiner Kaufbestätigung von Gumroad.', network: 'Gumroad war nicht erreichbar. Prüfe die Verbindung und versuche es noch einmal.', ok: 'Pro ist in diesem Browser aktiv. Danke.', refunded: 'Dieser Kauf wurde erstattet oder ist beendet, Pro ist aus.', rejected: 'Dieser Lizenzschlüssel wurde nicht angenommen.', active: 'Pro ist in diesem Browser aktiv.' },
    fr: { title: 'Passer à Pro', buy: 'Acheter Pro sur Gumroad', keyLabel: 'Déjà acheté ? Collez votre clé de licence', verify: 'Activer', close: 'Fermer', checking: 'Vérification auprès de Gumroad…', badKey: 'Cela ne ressemble pas à une clé de licence. Elle figure dans votre reçu Gumroad.', network: 'Gumroad est injoignable. Vérifiez votre connexion et réessayez.', ok: 'Pro est actif dans ce navigateur. Merci.', refunded: 'Cet achat a été remboursé ou a pris fin : Pro est désactivé.', rejected: 'Cette clé de licence n’a pas été acceptée.', active: 'Pro est actif dans ce navigateur.' },
    ja: { title: 'Proを使う', buy: 'GumroadでProを購入', keyLabel: '購入済みの方はライセンスキーを貼り付けてください', verify: '有効にする', close: '閉じる', checking: 'Gumroadで確認しています…', badKey: 'ライセンスキーの形式ではありません。Gumroadの購入メールに記載されています。', network: 'Gumroadに接続できませんでした。接続を確認して、もう一度お試しください。', ok: 'このブラウザでProが有効になりました。ありがとうございます。', refunded: 'この購入は返金済みか終了しているため、Proは無効です。', rejected: 'このライセンスキーは受け付けられませんでした。', active: 'このブラウザでProが有効です。' },
  }[LANG];
  window.PeakLicense.setup(Object.assign({ tool: 'nightjar', productId: PRO_READY ? NIGHTJAR_PRO_PRODUCT_ID : 'PENDING', permalink: 'nightjar-pro', buyUrl: NIGHTJAR_PRO_URL, pitch: T.pitch }, L ? { strings: L, localMessages: true } : {}));
  window.PeakLicense.onChange(isPro => {
    const was = state.pro;
    state.pro = PRO_READY && !!isPro;
    $('pro-state').textContent = state.pro ? T.proActive : T.proOff;
    document.body.classList.toggle('nj-is-pro', state.pro);
    if (was !== state.pro && state.meta) {
      if (state.meta.exports.length > 1) post({ type: 'merge', merge: state.pro });
      else { renderControls(); renderPro(); }
    }
  });
}
// fail closed: Pro is on only when this page says so, not when the browser merely holds a stored key
function needPro(reason) {
  if (state.pro) return true;
  if (window.PeakLicense) window.PeakLicense.open(reason || T.pitch);
  return false;
}

/* ---------- stages ---------- */
function stage(name) {
  ['idle', 'busy', 'error', 'done'].forEach(s => { $('stage-' + s).hidden = s !== name; });
  $('panel').dataset.state = name;
}
const focusEl = el => { if (el) el.focus({ preventScroll: true }); };

function getWorker() {
  if (worker) return worker;
  try { worker = new Worker(new URL('./worker.js', import.meta.url), { type: 'module' }); } catch (e) { worker = null; return null; }
  worker.onmessage = onMessage;
  worker.onerror = () => showError([{ name: '', reason: 'read' }]);
  return worker;
}
const post = m => { const w = getWorker(); if (w) w.postMessage(m); };

function startFiles(items) {
  if (!items || !items.length) return;
  stage('busy');
  $('busy-title').textContent = T.reading; $('busy-sub').textContent = T.starting; setBar(0);
  focusEl($('busy-title'));
  post({ type: 'files', files: items, tz: browserTz, merge: state.pro });
}
function startSample() {
  stage('busy');
  $('busy-title').textContent = T.reading; $('busy-sub').textContent = T.starting; setBar(20);
  focusEl($('busy-title'));
  post({ type: 'sample', tz: browserTz, merge: state.pro });
}
function setBar(p) { const b = $('busy-bar'); b.setAttribute('aria-valuenow', String(Math.round(p))); b.querySelector('i').style.width = `${p}%`; }

function problemText(p) {
  const key = { zip: 'errZip', empty: 'errEmpty', type: 'errType', toobig: 'errBig', json: 'errJson', read: 'errRead' }[p.reason];
  if (p.reason === 'nofiles') return fill(T.errNoFilesText, { inside: p.inside && p.inside.length ? fill(T.errInside, { list: p.inside.join(SEP) }) : '' });
  return key ? fill(T[key], { name: p.name }) : '';
}
function showError(problems) {
  stage('error');
  const nofiles = problems.find(p => p.reason === 'nofiles');
  $('error-title').textContent = nofiles ? T.errNoFiles : T.errTitle;
  const lines = problems.map(problemText).filter(Boolean);
  $('error-text').innerHTML = lines.length > 1 ? `<ul>${lines.map(l => `<li>${esc(l)}</li>`).join('')}</ul>` : `<p>${esc(lines[0] || '')}</p>`;
  focusEl($('error-title'));
}

function onMessage(ev) {
  const m = ev.data || {};
  if (m.type === 'progress') {
    const pct = m.total ? Math.round((m.done / m.total) * 100) : 0;
    $('busy-sub').textContent = m.total && m.done ? fill(T.readingPct, { file: m.file, pct }) : fill(T.readingFile, { file: m.file });
    setBar(m.count ? ((m.index || 0) / m.count) * 100 : Math.max(5, pct));
    return;
  }
  if (m.type === 'loaded') { onLoaded(m.meta, m.quiet); return; }
  if (m.type === 'error') { if (!state.meta) showError([{ name: '', reason: 'read' }]); return; }
  if (m.id !== undefined && pending.has(m.id)) { const res = pending.get(m.id); pending.delete(m.id); res(m); }
}
const pending = new Map();
function ask(msg) { return new Promise(res => { const id = ++state.req; pending.set(id, res); post(Object.assign({ id }, msg)); }); }

function onLoaded(meta, quiet) {
  state.meta = meta;
  if (!meta.hasNights && !meta.hasDays) { showError(meta.problems.length ? meta.problems : [{ name: '', reason: 'nofiles' }]); state.meta = null; return; }
  if (!quiet) {
    stage('done');
    const ex = meta.exports.filter(e => e.used);
    const nights = ex.reduce((s, e) => s + e.nights, 0), days = ex.reduce((s, e) => s + e.days, 0);
    $('done-title').textContent = meta.sample ? T.doneSampleTitle : fill(T.doneTitle, { nights: F.n(nights), days: F.n(days) });
    $('done-sub').textContent = meta.sample ? T.doneSampleSub : fill(T.doneSub, { first: F.date(meta.first), last: F.date(meta.last) });
    focusEl($('done-title'));
    state.period = 'last90'; state.night = null; state.cardYear = null; state.cardData = null;
  }
  setPeriod(state.pro ? state.period : 'last90', true);
}

/* ---------- period ---------- */
function periodRange(key) {
  const M = state.meta, last = M.last, first = M.first;
  if (key === 'last90') return M.free;
  if (key === 'last30') return { from: addDays(last, -29), to: last };
  if (key === 'year') return { from: `${last.slice(0, 4)}-01-01` < first ? first : `${last.slice(0, 4)}-01-01`, to: last };
  if (key === 'all') return { from: first, to: last };
  if (/^y\d{4}$/.test(key)) { const y = key.slice(1); return { from: `${y}-01-01` < first ? first : `${y}-01-01`, to: `${y}-12-31` > last ? last : `${y}-12-31` }; }
  if (key === 'custom') return { from: state.from || M.free.from, to: state.to || last };
  return M.free;
}
async function setPeriod(key, force) {
  if (!state.meta) return;
  if (key !== 'last90' && !state.pro && !force) { needPro(T.proPeriod); return; }
  if (!state.pro) key = 'last90';
  state.period = key;
  const r = periodRange(key);
  state.from = r.from; state.to = r.to;
  const res = await ask({ type: 'summary', from: r.from, to: r.to, pro: state.pro });
  state.data = res;
  state.nightsShown = res.nights;
  if (!state.night || state.night < r.from || state.night > r.to) {
    const withN = res.nights.filter(n => !n.none);
    state.night = withN.length ? withN[withN.length - 1].day : null;
  }
  renderAll();
}

/* ---------- rendering ---------- */
function skeleton() {
  const R = $('res');
  if (R.dataset.built) return;
  R.dataset.built = '1';
  R.innerHTML = `
<div class="nj-res-head">
  <h2 id="res-title">${esc(T.resTitle)}</h2>
  <div class="nj-controls" id="controls"></div>
  <div class="nj-custom" id="custom" hidden>
    <label>${esc(T.from)}<input type="date" class="input" id="c-from"></label>
    <label>${esc(T.to)}<input type="date" class="input" id="c-to"></label>
    <button type="button" class="btn btn-sm nj-quiet" id="c-apply">${esc(T.apply)}</button>
  </div>
  <p class="nj-coverage" id="coverage"></p>
</div>
<dl class="nj-kpis" id="kpis"></dl>
<p class="nj-note">${esc(T.avgNote)}</p>
<section class="nj-sec" aria-labelledby="weave-h">
  <h3 id="weave-h">${esc(T.weaveTitle)}</h3>
  <p class="nj-intro">${esc(T.weaveText)}</p>
  <div class="nj-weave"><canvas id="weave" tabindex="0" role="img" aria-label="${esc(T.weaveTitle)}"></canvas><p class="nj-weave-hint" id="weave-hint" aria-live="polite"></p></div>
  <ul class="nj-legend">${['1', '2', '3', '4'].map(c => `<li><i style="background:${STAGE[c]}"></i>${esc(T.stages[{ 1: 'deep', 2: 'light', 3: 'rem', 4: 'awake' }[c]])}</li>`).join('')}</ul>
  <div class="nj-night" id="night" aria-live="polite"></div>
</section>
<section class="nj-sec" aria-labelledby="trends-h">
  <h3 id="trends-h">${esc(T.trendsTitle)}</h3>
  <p class="nj-intro">${esc(T.trendsText)}</p>
  <div class="nj-chips" id="trend-chips" role="group" aria-label="${esc(T.trendsTitle)}"></div>
  <div class="nj-chart" id="trend-chart"></div>
  <p class="nj-readout" id="trend-readout"></p>
  <p class="nj-explain" id="trend-explain"></p>
</section>
<section class="nj-sec" aria-labelledby="contrib-h">
  <h3 id="contrib-h">${esc(T.contribTitle)}</h3>
  <p class="nj-intro">${esc(T.contribText)}</p>
  <div class="nj-cols" id="contrib"></div>
</section>
<section class="nj-sec" aria-labelledby="mix-h">
  <h3 id="mix-h">${esc(T.stageMix)}</h3>
  <p class="nj-intro">${esc(T.stageMixText)}</p>
  <div id="mix"></div>
</section>
<section class="nj-sec" aria-labelledby="days-h">
  <h3 id="days-h">${esc(T.daysTitle)}</h3>
  <p class="nj-intro">${esc(T.daysText)}</p>
  <div id="days"></div>
</section>
<section class="nj-sec" aria-labelledby="work-h">
  <h3 id="work-h">${esc(T.workoutsTitle)}</h3>
  <div id="workouts"></div>
</section>
<section class="nj-sec" aria-labelledby="tags-h">
  <h3 id="tags-h">${esc(T.tagsTitle)}</h3>
  <p class="nj-intro">${esc(T.tagsText)}</p>
  <div id="tags"></div>
</section>
<section class="nj-sec" aria-labelledby="cards-h" id="cards"></section>
<div class="nj-pro-zone" id="prozone"></div>
<details class="nj-files"><summary>${esc(T.filesTitle)}</summary><div id="files"></div></details>`;
  $('c-apply').addEventListener('click', () => {
    const a = $('c-from').value, b = $('c-to').value;
    if (!a || !b) return;
    state.from = a <= b ? a : b; state.to = a <= b ? b : a;
    setPeriod('custom');
  });
  const wv = $('weave');
  const pick = (ev) => {
    const g = state.wGeom; if (!g) return null;
    const rect = wv.getBoundingClientRect();
    const i = Math.floor((ev.clientX - rect.left - g.x0) / g.colW);
    return i >= 0 && i < state.nightsShown.length ? i : null;
  };
  wv.addEventListener('click', ev => { const i = pick(ev); if (i !== null && !state.nightsShown[i].none) openNight(state.nightsShown[i].day, true); });
  wv.addEventListener('pointermove', ev => { const i = pick(ev); $('weave-hint').textContent = i === null ? '' : hintFor(state.nightsShown[i]); });
  wv.addEventListener('keydown', ev => {
    if (ev.key !== 'ArrowLeft' && ev.key !== 'ArrowRight') return;
    ev.preventDefault();
    stepNight(ev.key === 'ArrowLeft' ? -1 : 1);
  });
  let rt = null;
  window.addEventListener('resize', () => { clearTimeout(rt); rt = setTimeout(() => { if (state.data) { renderWeave(); renderNightCharts(); renderTrend(); renderDays(); } }, 150); });
}
function hintFor(n) {
  if (!n) return '';
  if (n.none) return `${F.dateWd(n.day)}: ${T.noStages}`;
  return `${F.dateWd(n.day)}: ${F.clock(n.start)}, ${fill(T.asleep, { h: F.dur(n.total) })}${n.hrv ? `, HRV ${F.ms(n.hrv)}` : ''}`;
}

function renderAll() {
  $('results').hidden = false;
  skeleton();
  renderControls(); renderKpis(); renderWeave(); openNight(state.night, false); renderTrendChips(); renderTrend(); renderContrib(); renderMix(); renderDays(); renderWorkouts(); renderTags(); renderPro(); renderFiles();
}

function renderControls() {
  const M = state.meta;
  const presets = ['last90', 'last30', 'year', 'all'].map(k => [k, T.periods[k]]);
  const years = M.years.length > 1 ? M.years.map(y => [`y${y}`, String(y)]) : [];
  const btn = ([k, label]) => `<button type="button" data-p="${k}" aria-pressed="${state.period === k}">${!state.pro && k !== 'last90' ? LOCK : ''}${esc(label)}</button>`;
  $('controls').innerHTML = `<div class="nj-seg" role="group" aria-label="${esc(T.periodLabel)}">${presets.map(btn).join('')}${years.map(btn).join('')}${btn(['custom', T.periods.custom])}</div>
<div class="nj-seg" role="group" aria-label="${esc(T.units)}"><button type="button" data-u="c" aria-pressed="${!state.fahrenheit}">°C</button><button type="button" data-u="f" aria-pressed="${state.fahrenheit}">°F</button></div>
${M.sample ? `<span class="nj-tagline">${esc(T.sampleTag)}</span>` : ''}`;
  $('controls').querySelectorAll('[data-p]').forEach(b => b.addEventListener('click', () => {
    const k = b.dataset.p;
    if (k === 'custom') {
      if (!needPro(T.proPeriod)) return;
      $('custom').hidden = false; $('c-from').min = M.first; $('c-from').max = M.last; $('c-to').min = M.first; $('c-to').max = M.last;
      $('c-from').value = state.from; $('c-to').value = state.to; $('c-from').focus();
      return;
    }
    $('custom').hidden = true;
    setPeriod(k);
  }));
  $('controls').querySelectorAll('[data-u]').forEach(b => b.addEventListener('click', () => {
    state.fahrenheit = b.dataset.u === 'f'; F = makeFmt(T, { fahrenheit: state.fahrenheit }); renderAll();
  }));
  const d = state.data.summary;
  $('coverage').textContent = `${fill(T.coverage, { from: F.date(state.from), to: F.date(state.to), nights: F.n(d.nights), days: F.n(d.days) })} ${state.pro ? fill(T.coverageAll, { first: F.date(M.first), last: F.date(M.last) }) : M.first < M.free.from ? fill(T.coverageFree, { first: F.date(M.first) }) : ''}`.trim();
}

function renderKpis() {
  const A = state.data.summary.avg;
  const k = (key, val, sub) => `<div><dt>${esc(T.kpi[key])}</dt><dd>${val ? esc(val) : `<small>${esc(T.none)}</small>`}${val && sub ? `<small>${esc(sub)}</small>` : ''}</dd></div>`;
  const rng = (key) => A[key].n > 1 ? fill(T.rangeTxt, { min: F.metric(key, A[key].min), max: F.metric(key, A[key].max) }) : '';
  $('kpis').innerHTML = [
    k('sleepScore', F.n(A.sleepScore.avg), rng('sleepScore')), k('readiness', F.n(A.readiness.avg), rng('readiness')), k('activityScore', F.n(A.activityScore.avg), rng('activityScore')),
    k('total', F.dur(A.total.avg), rng('total')), k('hrv', F.ms(A.hrv.avg), rng('hrv')), k('hrLow', F.bpm(A.hrLow.avg), rng('hrLow')),
    k('tempDev', F.dev(A.tempDev.avg), rng('tempDev')), k('spo2', F.pct1(A.spo2.avg), ''), k('steps', F.n(A.steps.avg), ''), k('bedtime', F.clock(A.bedtime.avg), A.wake.avg !== null ? fill(T.bedWake, { bed: F.clock(A.bedtime.avg), wake: F.clock(A.wake.avg) }) : ''),
  ].join('');
}

function renderWeave() {
  const cv = $('weave');
  const idx = state.nightsShown.findIndex(n => n.day === state.night);
  state.wGeom = drawWeave(cv, state.nightsShown, { selected: idx, font: getComputedStyle(document.body).fontFamily, monthLabel: F.month });
}

function stepNight(dir) {
  const list = state.nightsShown.filter(n => !n.none);
  const i = list.findIndex(n => n.day === state.night);
  const j = Math.max(0, Math.min(list.length - 1, (i < 0 ? list.length - 1 : i) + dir));
  if (list[j]) openNight(list[j].day, true);
}
let nightCache = null;
async function openNight(day, user) {
  const box = $('night');
  if (!day) { box.innerHTML = `<p>${esc(T.noStages)}</p>`; return; }
  state.night = day;
  if (user) renderWeave();
  const res = await ask({ type: 'night', day });
  const n = res.night;
  nightCache = n;
  if (!n) { box.innerHTML = `<p>${esc(T.noStages)}</p>`; return; }
  const fact = (key, val) => (val ? `<div><dt>${esc(T.nightFacts[key])}</dt><dd>${esc(val)}</dd></div>` : '');
  const tags = n.tags.map(t => t.name || T.tagNames[t.code] || t.code);
  const naps = n.naps.map(x => fill(T.napNote, { type: T.napTypes[x.type] || T.napTypes.sleep, h: F.dur(x.total) }));
  const contrib = (field, keys) => (n[field] ? `<div class="nj-cgroup"><h4>${esc(T.contribGroups[field])}</h4><ul class="nj-cbars">${keys.filter(k => n[field][k] !== null && n[field][k] !== undefined).map(k => `<li class="${n[field][k] < 70 ? 'low' : ''}"><span>${esc(T.contrib[k])}</span><b>${n[field][k]}</b><i style="--w:${n[field][k]}%"></i></li>`).join('')}</ul></div>` : '');
  box.innerHTML = `
<div class="nj-night-head">
  <div><h3>${esc(fill(T.nightTitle, { date: F.dateWd(n.day) }))}</h3>
  <p>${esc(fill(T.bedWake, { bed: F.clock(n.start && n.start.min), wake: F.clock(n.end && n.end.min) }))}, ${esc(fill(T.inBed, { h: F.dur(n.inBed) }))}, ${esc(fill(T.asleep, { h: F.dur(n.total) }))}</p></div>
  <div class="nj-night-nav"><button type="button" class="btn btn-sm nj-quiet" id="n-prev">${esc(T.prevNight)}</button><button type="button" class="btn btn-sm nj-quiet" id="n-next">${esc(T.nextNight)}</button></div>
</div>
<dl class="nj-facts">${fact('sleepScore', F.n(n.sleepScore))}${fact('readiness', F.n(n.readiness))}${fact('total', F.dur(n.total))}${fact('eff', F.pct(n.eff))}${fact('lat', F.min(n.lat))}${fact('hrLow', F.bpm(n.hrLow))}${fact('hrAvg', F.bpm(n.hrAvg))}${fact('hrv', F.ms(n.hrv))}${fact('breath', F.perMin(n.breath))}${fact('tempDev', F.dev(n.tempDev))}${fact('spo2', F.pct1(n.spo2))}${fact('restless', F.n(n.restless))}</dl>
<div class="nj-chart" id="n-hyp"></div>
<div class="nj-chart"><h4>${esc(T.hrCurve)}</h4><div id="n-curve"></div><p class="nj-keys"><span><i style="background:var(--hr)"></i>${esc(T.hrLine)}</span><span><i style="background:var(--rem)"></i>${esc(T.hrvLine)}</span></p></div>
${n.sc || n.rc ? `<div class="nj-cols nj-cols-2" style="margin-top:18px">${contrib('sc', ['total_sleep', 'efficiency', 'restfulness', 'rem_sleep', 'deep_sleep', 'latency', 'timing'])}${contrib('rc', ['previous_night', 'sleep_balance', 'sleep_regularity', 'previous_day_activity', 'activity_balance', 'resting_heart_rate', 'hrv_balance', 'recovery_index', 'body_temperature'])}</div>` : ''}
${tags.length ? `<p class="nj-note">${esc(fill(T.tagsBefore, { list: tags.join(SEP) }))}</p>` : ''}${naps.map(t => `<p class="nj-note">${esc(t)}</p>`).join('')}`;
  $('n-prev').addEventListener('click', () => stepNight(-1));
  $('n-next').addEventListener('click', () => stepNight(1));
  renderNightCharts();
  if (user) $('weave-hint').textContent = hintFor(state.nightsShown.find(x => x.day === day));
}
function renderNightCharts() {
  const n = nightCache; if (!n || !$('n-hyp')) return;
  const w = $('n-hyp').clientWidth || 900;
  $('n-hyp').innerHTML = n.phases ? hypnogramSvg(n.phases, Math.round(n.start ? n.start.min : 0), T, w) : `<p class="nj-note">${esc(T.noStages)}</p>`;
  $('n-curve').innerHTML = n.hr || n.hrvS ? nightCurveSvg(n.hr, n.hrvS, Math.round(n.start ? n.start.min : 0), T, w) : `<p class="nj-note">${esc(T.none)}</p>`;
}

const TREND_KEYS = ['hrv', 'hrLow', 'total', 'sleepScore', 'readiness', 'tempDev', 'spo2', 'breath', 'deep', 'rem', 'eff', 'bedtime', 'dayHr', 'skinTemp', 'dayStress', 'vascularAge', 'vo2max'];
function renderTrendChips() {
  const S = state.data.series;
  const keys = TREND_KEYS.filter(k => S[k] && S[k].length);
  if (!keys.includes(state.trend)) state.trend = keys[0] || 'hrv';
  $('trend-chips').innerHTML = keys.map(k => `<button type="button" data-k="${k}" aria-pressed="${state.trend === k}">${esc(T.trend[k])}</button>`).join('');
  $('trend-chips').querySelectorAll('button').forEach(b => b.addEventListener('click', () => { state.trend = b.dataset.k; renderTrendChips(); renderTrend(); }));
}
function renderTrend() {
  const k = state.trend, S = state.data.series[k] || [];
  const pts = S.map(p => ({ day: p.day, y: F.plot(k, p.v), raw: p.v })).filter(p => p.y !== null);
  const box = $('trend-chart');
  const out = trendSvg(pts, state.from, state.to, { width: box.clientWidth || 900, zero: k === 'tempDev', axis: v => F.axis(k, v), monthLabel: F.month, label: T.trend[k] });
  box.innerHTML = out.svg;
  const A = state.data.summary.avg[k];
  const base = A && A.avg !== null ? `${fill(T.periodAvg, { v: F.metric(k, A.avg) })}, ${fill(T.rangeTxt, { min: F.metric(k, A.min), max: F.metric(k, A.max) })}.` : '';
  $('trend-readout').textContent = base;
  $('trend-explain').textContent = T.explain[k] || '';
  const svg = box.querySelector('svg'), cur = svg && svg.querySelector('.c-cursor');
  if (!svg || !pts.length) return;
  const show = (ev) => {
    const r = svg.getBoundingClientRect();
    const x = ((ev.clientX - r.left) / r.width) * out.W;
    let best = null, bd = Infinity;
    for (const p of pts) { const d = Math.abs(out.x(p.day) - x); if (d < bd) { bd = d; best = p; } }
    if (!best) return;
    cur.setAttribute('x1', out.x(best.day)); cur.setAttribute('x2', out.x(best.day)); cur.setAttribute('visibility', 'visible');
    $('trend-readout').textContent = `${F.dateWd(best.day)}: ${F.metric(k, best.raw)}`;
  };
  svg.addEventListener('pointermove', show);
  svg.addEventListener('pointerdown', show);
  svg.addEventListener('pointerleave', () => { cur.setAttribute('visibility', 'hidden'); $('trend-readout').textContent = base; });
}

function renderContrib() {
  const C = state.data.summary.contributors;
  const group = (g) => { const rows = C[g].filter(r => r.avg !== null); if (!rows.length) return ''; return `<div class="nj-cgroup"><h4>${esc(T.contribGroups[g])}</h4><ul class="nj-cbars">${rows.map(r => `<li class="${r.avg < 70 ? 'low' : ''}"><span>${esc(T.contrib[r.key])}</span><b>${F.n(r.avg)}</b><i style="--w:${Math.round(r.avg)}%"></i></li>`).join('')}</ul></div>`; };
  const html = ['sc', 'rc', 'ac'].map(group).join('') + (C.resc.some(r => r.avg !== null) ? '' : '');
  $('contrib').innerHTML = html || `<p class="nj-note">${esc(T.none)}</p>`;
}

function renderMix() {
  const A = state.data.summary.avg;
  const parts = [['1', 'deep', A.deep.avg], ['2', 'light', A.light.avg], ['3', 'rem', A.rem.avg], ['4', 'awake', A.awake.avg]];
  const sum = parts.reduce((s, p) => s + (p[2] || 0), 0);
  if (!sum) { $('mix').innerHTML = `<p class="nj-note">${esc(T.none)}</p>`; return; }
  $('mix').innerHTML = `<div class="nj-mix" role="img" aria-label="${esc(T.stageMix)}">${parts.map(([c, , v]) => `<span style="width:${((v || 0) / sum) * 100}%;background:${STAGE[c]}"></span>`).join('')}</div>
<div class="nj-mixkey">${parts.map(([c, k, v]) => `<div><span><i style="display:inline-block;width:11px;height:11px;border-radius:3px;background:${STAGE[c]};margin-right:6px"></i>${esc(T.stages[k])}</span><b>${esc(F.dur(v))}</b><small class="nj-note" style="margin:0">${F.pct(((v || 0) / sum) * 100)}</small></div>`).join('')}</div>`;
}

function renderDays() {
  const S = state.data.series, D = state.data.summary;
  const box = $('days');
  if (!box) return;
  const w = (box.clientWidth || 900);
  const chart = (key, title, bars) => {
    const pts = (S[key] || []).map(p => ({ day: p.day, y: F.plot(key, p.v) })).filter(p => p.y !== null);
    if (!pts.length) return '';
    return `<div class="nj-chart"><h4>${esc(title)}</h4>${trendSvg(pts, state.from, state.to, { width: w, height: 200, bars, axis: v => F.axis(key, v), monthLabel: F.month, label: title }).svg}</div>`;
  };
  const A = D.avg;
  const move = [['high', A.highT.avg, '#2b2f85'], ['med', A.medT.avg, '#5c6bd0'], ['low', A.lowT.avg, '#93a6ec'], ['sed', A.sedT.avg, '#c9d0ea']];
  const ms = move.reduce((s, m) => s + (m[1] || 0), 0);
  const counts = (obj, names) => Object.keys(obj).length ? `<ul class="nj-counts">${Object.entries(obj).sort((a, b) => b[1] - a[1]).map(([k, n]) => `<li>${esc(names[k] || k)}<b>${F.n(n)}</b></li>`).join('')}</ul>` : '';
  box.innerHTML = `${chart('steps', T.stepsChart, true)}
${ms ? `<div class="nj-chart"><h4>${esc(T.moveMix)}</h4><div class="nj-mix">${move.map(([, v, c]) => `<span style="width:${((v || 0) / ms) * 100}%;background:${c}"></span>`).join('')}</div><div class="nj-mixkey">${move.map(([k, v, c]) => `<div><span><i style="display:inline-block;width:11px;height:11px;border-radius:3px;background:${c};margin-right:6px"></i>${esc(T.moveParts[k])}</span><b>${esc(F.dur(v))}</b></div>`).join('')}</div></div>` : ''}
${(S.stressHigh || []).length ? `<div class="nj-chart"><h4>${esc(T.stressTitle)}</h4><p class="nj-note" style="margin:0 0 6px">${esc(T.stressText)}</p></div>${chart('stressHigh', T.stressLine, true)}${chart('recoveryHigh', T.recoveryLine, true)}` : ''}
${Object.keys(D.daySummary).length ? `<div class="nj-chart"><h4>${esc(T.daySummaryTitle)}</h4>${counts(D.daySummary, T.daySummary)}</div>` : ''}
${Object.keys(D.resilience).length ? `<div class="nj-chart"><h4>${esc(T.resilienceTitle)}</h4>${counts(D.resilience, T.resilience)}</div>` : ''}
${D.lastVascular ? `<p class="nj-note">${esc(fill(T.lastVascular, { v: F.n(D.lastVascular.v), date: F.date(D.lastVascular.day) }))}</p>` : ''}${D.lastVo2 ? `<p class="nj-note">${esc(fill(T.lastVo2, { v: F.n1(D.lastVo2.v), date: F.date(D.lastVo2.day) }))}</p>` : ''}`;
  // the stress block's charts reuse the bar colour; tint the recovery one
  const svgs = box.querySelectorAll('.nj-chart svg');
  svgs.forEach(s => { if (s.getAttribute('aria-label') === T.stressLine) s.querySelectorAll('.c-bar').forEach(r => r.style.fill = 'var(--dawn)'); if (s.getAttribute('aria-label') === T.recoveryLine) s.querySelectorAll('.c-bar').forEach(r => r.style.fill = 'var(--rem)'); });
}

async function renderWorkouts() {
  const D = state.data.summary.workouts;
  const box = $('workouts');
  if (!D.n) { box.innerHTML = `<p class="nj-note">${esc(T.workoutsNone)}</p>`; return; }
  const list = await workoutList();
  const rows = state.showAllWorkouts ? list : list.slice(0, 12);
  box.innerHTML = `<p class="nj-intro">${esc(fill(T.workoutsText, { n: F.n(D.n), h: F.dur(D.dur) }))}</p>
<div class="nj-scroll"><table class="nj-table"><thead><tr><th scope="col">${esc(T.wCols.date)}</th><th scope="col">${esc(T.wCols.activity)}</th><th scope="col" class="num">${esc(T.wCols.dur)}</th><th scope="col" class="num">${esc(T.wCols.cal)}</th><th scope="col" class="num">${esc(T.wCols.dist)}</th><th scope="col">${esc(T.wCols.intensity)}</th></tr></thead>
<tbody>${rows.map(w => `<tr><td>${esc(F.dateWd(w.day))}</td><td>${esc(w.label || T.activityNames[w.activity] || pretty(w.activity))}</td><td class="num">${esc(F.dur(w.dur))}</td><td class="num">${esc(F.kcal(w.cal))}</td><td class="num">${esc(w.dist ? F.km(w.dist) : '')}</td><td>${esc(T.intensity[w.intensity] || '')}</td></tr>`).join('')}</tbody></table></div>
${list.length > rows.length ? `<button type="button" class="btn btn-sm nj-quiet" id="w-all">${esc(fill(T.showAll, { n: F.n(list.length) }))}</button>` : ''}`;
  const b = $('w-all'); if (b) b.addEventListener('click', () => { state.showAllWorkouts = true; renderWorkouts(); });
}
const pretty = s => String(s || '').replace(/_/g, ' ').replace(/^\w/, c => c.toUpperCase());
async function workoutList() {
  const res = await ask({ type: 'workouts', from: state.from, to: state.to });
  return (res.workouts || []).slice().reverse();
}

function tagName(t) { return t.name || T.tagNames[t.code] || pretty(t.code); }
function renderTags() {
  const tags = state.data.summary.tags;
  $('tags').innerHTML = tags.length ? `<ul class="nj-counts">${tags.map(t => `<li>${esc(tagName(t))}<b>${esc(fill(T.tagCount, { n: F.n(t.n) }))}</b></li>`).join('')}</ul>` : `<p class="nj-note">${esc(T.tagsNone)}</p>`;
}

/* ---------- Pro ---------- */
function lockedLine(text) { return `<div class="nj-locked">${LOCK}<span>${esc(text)}</span><button type="button" class="btn btn-sm nj-buy" data-getpro>${esc(T.getPro)}</button></div>`; }
function renderPro() {
  const z = $('prozone'); if (!z) return;
  const M = state.meta, pro = state.pro;
  const badge = `<span class="nj-badge">${esc(T.proBadge)}</span>`;
  const enoughTags = state.data.summary.tags.filter(t => t.n >= 3).length;
  z.innerHTML = `
<section class="nj-pblock" aria-labelledby="cmp-h"><h3 id="cmp-h">${esc(T.compareTitle)} ${badge}</h3><p class="nj-intro">${esc(T.compareText)}</p>
${pro ? `<div class="nj-presets">${Object.entries(T.comparePresets).map(([k, l]) => `<button type="button" class="btn btn-sm nj-quiet" data-cmp="${k}">${esc(l)}</button>`).join('')}</div>
<div class="nj-twocol"><div class="nj-range"><label>${esc(T.compareA)}<input type="date" class="input" id="ca-from"></label><label>${esc(T.to)}<input type="date" class="input" id="ca-to"></label></div><div class="nj-range"><label>${esc(T.compareB)}<input type="date" class="input" id="cb-from"></label><label>${esc(T.to)}<input type="date" class="input" id="cb-to"></label></div></div>
<div class="nj-actions"><button type="button" class="btn btn-primary btn-sm" id="cmp-run">${esc(T.compareRun)}</button></div><div id="cmp-out"></div>` : lockedLine(T.locked)}
</section>
<section class="nj-pblock" aria-labelledby="tc-h"><h3 id="tc-h">${esc(T.tagCorrTitle)} ${badge}</h3><p class="nj-intro">${esc(T.tagCorrText)}</p>
${pro ? `<div id="tc-out"></div>` : lockedLine(enoughTags ? `${T.locked}: ${state.data.summary.tags.filter(t => t.n >= 3).map(tagName).slice(0, 6).join(SEP)}` : T.locked)}
</section>
<section class="nj-pblock" aria-labelledby="files-h"><h3 id="files-h">${esc(T.filesProTitle)} ${badge}</h3>
<div class="nj-prow"><div><h4>${esc(T.pdfTitle)}</h4><p>${esc(T.pdfText)}</p><p class="nj-note" id="pdf-status" aria-live="polite"></p></div><button type="button" class="btn ${pro ? 'btn-primary' : 'nj-quiet'}" id="pdf-make">${pro ? '' : LOCK}${esc(T.pdfMake)}</button></div>
<div class="nj-prow"><div><h4>${esc(T.csvTitle)}</h4><p>${esc(T.csvText)}</p></div><button type="button" class="btn ${pro ? 'btn-primary' : 'nj-quiet'}" id="csv-make">${pro ? '' : LOCK}${esc(T.csvMake)}</button></div>
<div class="nj-prow"><div><h4>${esc(T.mergeTitle)}</h4><p>${esc(M.exports.length > 1 ? fill(M.merged ? T.mergeOn : T.mergeOff, { n: M.exports.length }) : T.mergeText)}</p></div><button type="button" class="btn nj-quiet" id="merge-add">${pro ? '' : LOCK}${esc(T.mergeAdd)}</button></div>
</section>`;
  $('cards').innerHTML = `<div class="nj-cards"><div><h3 id="cards-h">${esc(T.cardsTitle)}</h3><p class="nj-intro">${esc(T.cardsText)}</p>
<div class="nj-picks" id="card-picks" role="radiogroup" aria-label="${esc(T.cardsTitle)}">${CARD_TYPES.map(c => `<button type="button" role="radio" data-card="${c}" aria-checked="${state.card === c}">${!pro && !FREE_CARDS.includes(c) ? LOCK : ''}${esc(T.cardNames[c])}</button>`).join('')}</div>
<div class="nj-actions"><button type="button" class="btn btn-primary" id="card-save">${esc(T.saveCard)}</button><button type="button" class="btn nj-quiet" id="card-share" hidden>${esc(T.shareCard)}</button></div></div>
<div class="nj-card-frame"><canvas id="card-canvas" width="1080" height="1920" aria-label="${esc(T.cardsTitle)}"></canvas></div></div>`;
  z.querySelectorAll('[data-getpro]').forEach(b => b.addEventListener('click', () => needPro(T.pitch)));
  if (pro) setupCompare();
  if (pro) renderTagCorr();
  $('cards').querySelectorAll('[data-card]').forEach(b => b.addEventListener('click', () => {
    const c = b.dataset.card;
    if (!FREE_CARDS.includes(c) && !needPro(T.pitch)) return;
    state.card = c; $('cards').querySelectorAll('[data-card]').forEach(x => x.setAttribute('aria-checked', String(x.dataset.card === c))); drawCurrentCard();
  }));
  $('card-save').addEventListener('click', saveCard);
  const sh = $('card-share');
  if (navigator.canShare && navigator.canShare({ files: [new File([new Uint8Array(1)], 'x.png', { type: 'image/png' })] })) { sh.hidden = false; sh.addEventListener('click', shareCard); }
  $('pdf-make').addEventListener('click', makePdf);
  $('csv-make').addEventListener('click', makeCsv);
  $('merge-add').addEventListener('click', () => { if (!needPro(T.pitch)) return; addMode = true; $('file-input').click(); });
  if (!pro && !FREE_CARDS.includes(state.card)) state.card = 'recent';
  drawCurrentCard();
}
let addMode = false;

function setupCompare() {
  const M = state.meta;
  const set = (a, b) => { $('ca-from').value = a.from; $('ca-to').value = a.to; $('cb-from').value = b.from; $('cb-to').value = b.to; };
  ['ca-from', 'ca-to', 'cb-from', 'cb-to'].forEach(id => { $(id).min = M.first; $(id).max = M.last; });
  const last = M.last;
  const presets = {
    month: () => { const m0 = last.slice(0, 7) + '-01'; const pm = new Date(Date.parse(m0 + 'T00:00:00Z')); pm.setUTCMonth(pm.getUTCMonth() - 1); const p0 = pm.toISOString().slice(0, 10); return [{ from: p0, to: addDays(m0, -1) }, { from: m0, to: last }]; },
    year: () => { const y = Number(last.slice(0, 4)); return [{ from: `${y - 1}-01-01`, to: `${y - 1}-12-31` }, { from: `${y}-01-01`, to: last }]; },
    season: () => [{ from: addDays(last, -179), to: addDays(last, -90) }, { from: addDays(last, -89), to: last }],
  };
  set(...presets.season());
  document.querySelectorAll('[data-cmp]').forEach(b => b.addEventListener('click', () => { set(...presets[b.dataset.cmp]()); runCompare(); }));
  $('cmp-run').addEventListener('click', runCompare);
  runCompare();
}
async function runCompare() {
  const a = { from: $('ca-from').value, to: $('ca-to').value }, b = { from: $('cb-from').value, to: $('cb-to').value };
  if (!a.from || !a.to || !b.from || !b.to) return;
  const res = await ask({ type: 'compare', a, b });
  const better = { sleepScore: 1, readiness: 1, activityScore: 1, total: 1, deep: 1, rem: 1, eff: 1, lat: -1, hrv: 1, hrLow: -1, spo2: 1, steps: 1, stressHigh: -1, recoveryHigh: 1 };
  const label = k => T.trend[k] || T.kpi[k] || T.nightFacts[k] || k;
  const ZERO = { s: 30, ms: 0.5, bpm: 0.5, score: 0.5, n: 0.5, '%': 0.5, br: 0.05, dC: 0.005, kcal: 0.5, clock: 0.5 };
  const diffTxt = (r) => {
    if (r.diff === null) return '';
    if (Math.abs(r.diff) < (r.key === 'spo2' ? 0.05 : ZERO[r.unit] || 0.5)) return F.metric(r.key, 0).replace(/^\+/, '');
    const sign = r.diff > 0 ? '+' : r.diff < 0 ? '−' : '';
    if (r.key === 'bedtime' || r.key === 'wake') return `${sign}${F.n(Math.abs(r.diff))} min`;
    if (r.key === 'tempDev') return F.dev(r.diff);
    return sign + F.metric(r.key, Math.abs(r.diff)).replace(/^[−+]/, '');
  };
  const rows = res.rows.filter(r => r.na || r.nb);
  $('cmp-out').innerHTML = `<div class="nj-scroll" style="margin-top:14px"><table class="nj-table"><thead><tr><th scope="col">${esc(T.compareCols.metric)}</th><th scope="col" class="num">${esc(T.compareCols.a)}<br><small>${esc(F.dateShort(a.from))}–${esc(F.dateShort(a.to))}</small></th><th scope="col" class="num">${esc(T.compareCols.b)}<br><small>${esc(F.dateShort(b.from))}–${esc(F.dateShort(b.to))}</small></th><th scope="col" class="num">${esc(T.compareCols.diff)}</th></tr></thead><tbody>${rows.map(r => {
    const dir = r.diff === null || !better[r.key] || Math.abs(r.diff) < (r.key === 'spo2' ? 0.05 : ZERO[r.unit] || 0.5) ? '' : (r.diff * better[r.key] > 0 ? 'up' : 'down');
    return `<tr><th scope="row">${esc(label(r.key))}</th><td class="num">${esc(F.metric(r.key, r.a))}</td><td class="num">${esc(F.metric(r.key, r.b))}</td><td class="num ${dir}">${esc(diffTxt(r))}</td></tr>`;
  }).join('')}</tbody></table></div>`;
}

function renderTagCorr() {
  const out = $('tc-out'); if (!out) return;
  const tags = state.data.tags || [];
  if (!tags.length) { out.innerHTML = `<p class="nj-note">${esc(T.tagCorrNone)}</p>`; return; }
  const keys = ['hrv', 'hrLow', 'sleepScore', 'total', 'deep', 'lat', 'tempDev'];
  out.innerHTML = tags.slice(0, 12).map(t => {
    const name = tagName(t);
    const rows = keys.map(k => {
      const m = t.metrics[k];
      if (m.with === null || m.without === null || !m.nWith || !m.nWithout) return '';
      const d = m.with - m.without;
      const small = Math.abs(d) < ({ hrv: 1, hrLow: 1, sleepScore: 1, total: 300, deep: 120, lat: 60, tempDev: 0.05 }[k] || 0);
      const sign = small ? '' : d > 0 ? '+' : '−';
      const diff = small ? F.metric(k, 0).replace(/^\+/, '') : k === 'tempDev' ? F.dev(d) : sign + F.metric(k, Math.abs(d));
      return `<tr><th scope="row">${esc(T.trend[k])}</th><td class="num">${esc(F.metric(k, m.with))} <small>(${F.n(m.nWith)})</small></td><td class="num">${esc(F.metric(k, m.without))} <small>(${F.n(m.nWithout)})</small></td><td class="num">${esc(diff)}</td></tr>`;
    }).join('');
    return `<div class="nj-tagrow"><h4>${esc(name)}<small>${esc(fill(T.tagNights, { n: t.nights }))}</small></h4>${t.nights < 8 ? `<p class="nj-note">${esc(T.tagFew)}</p>` : ''}
<div class="nj-scroll"><table class="nj-table"><thead><tr><th scope="col">${esc(T.compareCols.metric)}</th><th scope="col" class="num">${esc(fill(T.tagWith, { tag: name }))}</th><th scope="col" class="num">${esc(T.tagWithout)}</th><th scope="col" class="num">${esc(T.compareCols.diff)}</th></tr></thead><tbody>${rows}</tbody></table></div></div>`;
  }).join('') + `<p class="nj-note">${esc(T.tagCorrFoot)}</p>`;
}

/* ---------- cards ---------- */
async function cardData() {
  const type = state.card;
  if (type === 'recent') {
    const r = state.meta.free;
    if (state.period === 'last90') return { type, nights: state.nightsShown, avg: state.data.summary.avg, lang: LANG };
    const res = await ask({ type: 'summary', from: r.from, to: r.to, pro: false });
    return { type, nights: res.nights, avg: res.summary.avg, lang: LANG };
  }
  const y = state.period.startsWith('y') ? Number(state.period.slice(1)) : Number(state.meta.last.slice(0, 4));
  const from = `${y}-01-01` < state.meta.first ? state.meta.first : `${y}-01-01`, to = `${y}-12-31` > state.meta.last ? state.meta.last : `${y}-12-31`;
  if (!state.cardData || state.cardData.year !== y) {
    const res = await ask({ type: 'summary', from, to, pro: false });
    const months = [];
    for (let m = 0; m < 12; m++) {
      const pre = `${y}-${String(m + 1).padStart(2, '0')}`;
      const vals = (res.series.hrv || []).filter(p => p.day.startsWith(pre)).map(p => p.v);
      months.push({ label: F.month(pre + '-01').slice(0, 3), v: vals.length ? vals.reduce((s, x) => s + x, 0) / vals.length : null });
    }
    let best = null;
    if (res.summary.best) best = (await ask({ type: 'night', day: res.summary.best.day })).night;
    state.cardData = { year: y, nights: res.nights, avg: res.summary.avg, monthly: months, best };
  }
  return Object.assign({ type, lang: LANG }, state.cardData, { year: y });
}
async function drawCurrentCard() {
  const cv = $('card-canvas'); if (!cv) return;
  try { await document.fonts.ready; } catch (e) { /* draw with what loaded */ }
  drawCard(cv, await cardData(), T, F);
}
function cardBlob() { return new Promise(res => $('card-canvas').toBlob(res, 'image/png')); }
async function saveCard() {
  if (!FREE_CARDS.includes(state.card) && !needPro(T.pitch)) return;
  const blob = await cardBlob();
  window.PeakUI.download(blob, cardFileName(state.card, state.card === 'recent' ? '' : (state.cardData && state.cardData.year)));
}
async function shareCard() {
  if (!FREE_CARDS.includes(state.card) && !needPro(T.pitch)) return;
  const blob = await cardBlob();
  try { await navigator.share({ files: [new File([blob], cardFileName(state.card, ''), { type: 'image/png' })] }); } catch (e) { /* closed the share sheet */ }
}

/* ---------- PDF and CSV ---------- */
async function makePdf() {
  if (!needPro(T.pitch)) return;
  const btn = $('pdf-make'); btn.disabled = true;
  try {
    const { buildReport } = await import('./pdf.js');
    await document.fonts.ready;
    const blob = await buildReport({ F, lang: LANG, from: state.from, to: state.to, sample: state.meta.sample, summary: state.data.summary, nights: state.data.nights, series: state.data.series, tags: state.data.tags }, T, (n, total) => { $('pdf-status').textContent = fill(T.pdfMaking, { n, total }); });
    window.PeakUI.download(blob, `nightjar-report-${state.from}-to-${state.to}.pdf`);
    $('pdf-status').textContent = '';
  } finally { btn.disabled = false; }
}
async function makeCsv() {
  if (!needPro(T.pitch)) return;
  const res = await ask({ type: 'csv', from: state.from, to: state.to });
  window.PeakUI.download(new Blob(['﻿' + res.text], { type: 'text/csv;charset=utf-8' }), `nightjar-${state.from}-to-${state.to}.csv`);
}

function renderFiles() {
  const M = state.meta;
  const ex = M.exports.map(e => `<li><strong>${esc(e.label)}</strong>${e.used ? '' : ` (${esc(T.filesNotShown)})`}<ul>${e.files.map(f => `<li>${esc(fill(T.filesRead, { name: f.name, rows: F.n(f.rows) }))}${f.skipped ? esc(fill(T.filesSkipped, { n: F.n(f.skipped) })) : ''}</li>`).join('')}</ul></li>`).join('');
  const probs = M.problems.map(problemText).filter(Boolean);
  $('files').innerHTML = `<ul>${ex}</ul>${probs.map(p => `<p>${esc(p)}</p>`).join('')}<p>${esc(M.ignored.length ? fill(T.filesIgnored, { list: M.ignored.slice(0, 60).join(SEP) }) : T.filesIgnoredNone)}</p>`;
}

/* ---------- inputs ---------- */
function wire() {
  const fi = $('file-input'), fo = $('folder-input');
  $('btn-choose').addEventListener('click', () => { addMode = false; fi.click(); });
  $('btn-folder').addEventListener('click', () => fo.click());
  $('btn-sample').addEventListener('click', startSample);
  $('btn-error-sample').addEventListener('click', startSample);
  $('btn-retry').addEventListener('click', () => { stage('idle'); fi.click(); });
  $('btn-reset').addEventListener('click', () => { post({ type: 'reset' }); state.meta = null; $('results').hidden = true; stage('idle'); focusEl($('drop-title')); });
  $('btn-see').addEventListener('click', ev => { ev.preventDefault(); const r = $('results'); r.scrollIntoView({ behavior: matchMedia('(prefers-reduced-motion: reduce)').matches ? 'auto' : 'smooth' }); r.focus({ preventScroll: true }); });
  fi.addEventListener('change', () => { const files = [...fi.files].map(f => ({ file: f, path: f.name })); fi.value = ''; if (!addMode) post({ type: 'reset' }); addMode = false; startFiles(files); });
  fo.addEventListener('change', () => { const files = [...fo.files].map(f => ({ file: f, path: f.webkitRelativePath || f.name })); fo.value = ''; post({ type: 'reset' }); startFiles(files); });
  const drop = $('drop');
  ['dragenter', 'dragover'].forEach(t => drop.addEventListener(t, e => { e.preventDefault(); drop.classList.add('is-over'); }));
  ['dragleave', 'drop'].forEach(t => drop.addEventListener(t, e => { e.preventDefault(); drop.classList.remove('is-over'); }));
  drop.addEventListener('drop', async e => {
    const items = await dropped(e.dataTransfer);
    post({ type: 'reset' });
    startFiles(items);
  });
}
// files and folders from a drop (folders are walked)
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

setupLicense();
wire();
document.documentElement.dataset.njReady = '1';
