/* Yearlap page logic (English, German and Dutch pages). The export goes to the worker (worker.js) in this tab; the page
 * only shows what the worker works out. The one network request the page itself can make is the Pro license check, to
 * Gumroad, when you paste a key. */
import { strings, fill, ADDRESS } from './i18n.js';
import { makeFmt } from './fmt.js';
import { drawCard, cardFileName, CARD_TYPES, drawStrip, drawClock, bigIndexOf } from './cards.js';
import { drawPoster, PW, PH } from './poster.js';
import { statsToCsv, paceSport, CAT } from './engine.js';

// ---- Gumroad Pro product, permalink yearlap-pro. The license check sends this product id, never the permalink.
// Fail closed: while this is 'PENDING' (or empty) Pro never turns on, whatever the browser has stored.
const YEARLAP_PRO_PRODUCT_ID = 'G43kWkJtKuWPZ7BEEKdlPA==';
const YEARLAP_PRO_URL = 'https://dorukctn.gumroad.com/l/yearlap-pro';
const PRO_READY = !!YEARLAP_PRO_PRODUCT_ID && YEARLAP_PRO_PRODUCT_ID !== 'PENDING';

const LANG = (document.documentElement.lang || 'en').slice(0, 2);
const T = strings(LANG);
const $ = id => document.getElementById(id);
const DAY = 864e5;
const esc = s => String(s).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
const reduceMotion = () => window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
const LOCK = '<svg class="yl-lock" viewBox="0 0 20 20" aria-hidden="true" focusable="false"><path d="M6 9V6.5a4 4 0 0 1 8 0V9" fill="none" stroke="currentColor" stroke-width="1.8"/><rect x="4" y="9" width="12" height="8.5" rx="2" fill="currentColor"/></svg>';

const browserTz = (() => { try { return Intl.DateTimeFormat().resolvedOptions().timeZone || 'UTC'; } catch (e) { return 'UTC'; } })();
const usLike = /^en-(US|LR|MM)$/i.test(navigator.language || '');
const state = {
  meta: null, year: null, stats: null, compare: null, alltime: null, gear: null, pro: false, req: 0, sample: false,
  imperial: usLike, unitsChosen: false, card: 'year', monthMetric: 'dist', sport: null, sportStats: null,
  routes: null, routesKey: '', posterSport: '', posterTheme: 'night',
};
let tz = browserTz;
let worker = null;
let F = makeFmt(LANG, state.imperial);

/* ---------- license ---------- */
function setupLicense() {
  if (!window.PeakLicense) return;
  const L = LANG === 'en' ? {} : {
    strings: LANG === 'de'
      ? { title: 'Pro holen', buy: 'Pro bei Gumroad kaufen', keyLabel: 'Schon gekauft? Füge deinen Lizenzschlüssel ein', verify: 'Aktivieren', close: 'Schließen', checking: 'Wird bei Gumroad geprüft…', badKey: 'Das sieht nicht wie ein Lizenzschlüssel aus. Er steht in deiner Kaufbestätigung von Gumroad.', network: 'Gumroad war nicht erreichbar. Prüfe die Verbindung und versuche es noch einmal.', ok: 'Pro ist in diesem Browser aktiv. Danke.', refunded: 'Dieser Kauf wurde erstattet oder ist beendet, Pro ist aus.', rejected: 'Dieser Lizenzschlüssel wurde nicht angenommen.', active: 'Pro ist in diesem Browser aktiv.' }
      : { title: 'Pro nemen', buy: 'Pro kopen bij Gumroad', keyLabel: 'Al gekocht? Plak je licentiesleutel', verify: 'Activeren', close: 'Sluiten', checking: 'Wordt bij Gumroad gecontroleerd…', badKey: 'Dat lijkt geen licentiesleutel. Je vindt hem in je aankoopbevestiging van Gumroad.', network: 'Gumroad was niet bereikbaar. Controleer je verbinding en probeer het opnieuw.', ok: 'Pro is actief in deze browser. Dank je.', refunded: 'Deze aankoop is terugbetaald of beëindigd, dus Pro staat uit.', rejected: 'Deze licentiesleutel is niet geaccepteerd.', active: 'Pro is actief in deze browser.' },
    localMessages: true,
  };
  window.PeakLicense.setup(Object.assign({ tool: 'yearlap', productId: PRO_READY ? YEARLAP_PRO_PRODUCT_ID : 'PENDING', permalink: 'yearlap-pro', buyUrl: YEARLAP_PRO_URL, pitch: T.pitch }, L));
  window.PeakLicense.onChange(isPro => {
    const was = state.pro;
    state.pro = PRO_READY && !!isPro;
    $('pro-state').textContent = state.pro ? T.proActive : T.proOff;
    document.body.classList.toggle('yl-is-pro', state.pro);
    if (was !== state.pro && state.meta) { buildYears(); requestStats(); }
  });
}
const needPro = reason => (state.pro ? true : (window.PeakLicense ? window.PeakLicense.requirePro(reason) : false));

/* ---------- stages ---------- */
function stage(name) {
  ['idle', 'busy', 'error', 'done'].forEach(s => { $('stage-' + s).hidden = s !== name; });
  $('panel').dataset.state = name;
}
const focusEl = el => { if (el) el.focus({ preventScroll: true }); };
function fail(title, html) {
  $('error-title').textContent = title;
  $('error-text').innerHTML = html;
  stage('error');
  focusEl($('error-title'));
}
function getWorker() {
  if (worker) return worker;
  try { worker = new Worker(new URL('./worker.js', import.meta.url), { type: 'module' }); } catch (e) { worker = null; return null; }
  worker.onmessage = onWorker;
  worker.onerror = (e) => { if (e.preventDefault) e.preventDefault(); fail(T.noWorkerTitle, `<p>${esc(T.noWorker)}</p>`); };
  return worker;
}
function setBar(p) {
  const v = Math.max(0, Math.min(100, Math.round(p)));
  $('busy-bar').setAttribute('aria-valuenow', String(v));
  $('busy-bar').firstElementChild.style.width = v + '%';
}
function start(items) {
  if (!items || !items.length) return;
  const w = getWorker();
  if (!w) return fail(T.noWorkerTitle, `<p>${esc(T.noWorker)}</p>`);
  w.postMessage({ type: 'reset' });
  state.sample = false; state.routes = null; state.routesKey = '';
  const first = items[0].file || items[0];
  $('busy-title').textContent = items.length === 1 ? fill(T.readingOne, { name: first.name }) : fill(T.readingMany, { n: F.n(items.length) });
  $('busy-sub').textContent = T.opening;
  setBar(4);
  stage('busy');
  focusEl($('busy-title'));
  w.postMessage({ type: 'files', files: items, tz });
}
function startSample() {
  const w = getWorker();
  if (!w) return fail(T.noWorkerTitle, `<p>${esc(T.noWorker)}</p>`);
  state.sample = true; state.routes = null; state.routesKey = '';
  $('busy-title').textContent = T.sampleBuilding;
  $('busy-sub').textContent = T.sampleSub;
  setBar(40);
  stage('busy');
  w.postMessage({ type: 'sample', tz });
}

function onWorker(ev) {
  const m = ev.data || {};
  if (m.type === 'progress') {
    setBar(10 + ((m.index + (m.step === 'csv' ? 0.6 : 0.2)) / Math.max(1, m.total)) * 80);
    $('busy-sub').textContent = m.step === 'csv' ? T.stepCsv : fill(T.stepZip, { file: m.file });
    return;
  }
  if (m.type === 'loaded') { loaded(m.meta, m); return; }
  if (m.type === 'stats') {
    if (m.id !== state.req) return;
    state.stats = m.result;
    if (m.compare) state.compare = m.compare;
    if (m.alltime) state.alltime = m.alltime;
    state.gear = m.gear || null;
    render();
    return;
  }
  if (m.type === 'sport') { if (m.id === state.req) { state.sportStats = m.result; renderSportBody(); } return; }
  if (m.type === 'routeProgress') { if (m.id === state.posterReq) $('poster-status').textContent = fill(T.posterReading, { done: F.n(m.done), total: F.n(m.total) }); return; }
  if (m.type === 'routes') { if (m.id === state.posterReq) routesArrived(m); return; }
  if (m.type === 'error') {
    if (state.posterBusy) { state.posterBusy = false; $('btn-poster').disabled = false; $('poster-status').textContent = m.message; return; }
    fail(T.errTitle, `<p>${esc(m.message)}</p><p>${esc(T.errMail)}</p>`);
  }
}

/* ---------- after loading ---------- */
function problemList(meta) {
  const items = meta.problems.map(p => fill(T['p_' + p.reason] || T.p_read, { n: p.name, inside: p.inside && p.inside.length ? fill(T.inside, { list: p.inside.join(', ') }) : '' }));
  if (meta.counts.skipped) items.push(fill(T.skipped, { n: F.n(meta.counts.skipped) }));
  return items;
}
function loaded(meta, m) {
  state.meta = meta;
  if (m.tzChange) {
    const ys = meta.years.map(y => y.year);
    if (state.year !== 'all' && !ys.includes(state.year)) state.year = ys[ys.length - 1];
    state.compare = null; state.alltime = null; state.routes = null; state.routesKey = '';
    buildYears(); requestStats();
    return;
  }
  if (!meta.count) {
    const items = problemList(meta);
    return fail(T.noActsTitle, `${items.length ? `<ul>${items.map(i => `<li>${esc(i)}</li>`).join('')}</ul>` : ''}<p>${esc(T.noActsHint)}</p>`);
  }
  if (!state.unitsChosen && meta.layout && !meta.sample) state.imperial = meta.layout.unit1 === 'mi';
  F = makeFmt(LANG, state.imperial);
  syncUnits();
  const years = meta.years.map(y => y.year);
  state.year = latestYear();
  state.compare = null; state.alltime = null; state.sport = null; state.sportStats = null;
  const first = meta.years[0], last = meta.years[meta.years.length - 1];
  const vars = { n: F.n(meta.count), from: first.year, to: last.year, y: last.year };
  $('done-title').textContent = m.sample ? fill(T.doneSample, vars) : years.length > 1 ? fill(T.doneTitle, vars) : fill(T.doneTitleOne, vars);
  const probs = problemList(meta);
  const lay = meta.layout || {};
  const routes = meta.routes.available ? fill(T.routesSome, { n: F.n(meta.routes.available) }) : T.routesNone;
  $('done-sub').textContent = m.sample ? T.doneSampleSub : `${fill(T.doneSub, { lang: T.langs[lay.lang] || T.langs.other, how: lay.how === 'position' ? T.howPos : lay.how === 'names' ? T.howNames : '', routes })}${probs.length ? ' ' + probs.join(' ') : ''}`;
  stage('done');
  fillTz();
  buildYears();
  $('results').hidden = false;
  requestStats();
  focusEl($('done-title'));
  setTimeout(() => { $('results').scrollIntoView({ behavior: reduceMotion() ? 'auto' : 'smooth', block: 'start' }); }, 120);
}
function currentYearInTz() {
  try { return Number(new Intl.DateTimeFormat('en-US', { timeZone: tz, year: 'numeric' }).format(new Date())); } catch (e) { return new Date().getFullYear(); }
}
function requestStats() {
  if (!worker || !state.meta) return;
  state.req++;
  worker.postMessage({ type: 'stats', id: state.req, year: state.year, pro: state.pro });
  if (state.pro && state.sport) worker.postMessage({ type: 'sport', id: state.req, year: state.year, sport: state.sport });
}

/* ---------- year buttons, units, time zone ---------- */
// the free year: the latest year in the export; in January and February, while the new year has only begun, the year
// before (the one people want to look back on), when the export has it
const latestYear = () => {
  const ys = state.meta.years.map(y => y.year), last = ys[ys.length - 1];
  const now = new Date();
  return last === currentYearInTz() && now.getMonth() < 2 && ys.includes(last - 1) ? last - 1 : last;
};
function buildYears() {
  const opts = state.meta.years.map(y => y.year).reverse().concat(state.meta.years.length > 1 ? ['all'] : []);
  $('years').innerHTML = opts.map(y => {
    const locked = !state.pro && y !== latestYear();
    return `<button type="button" data-year="${y}" aria-pressed="${y === state.year}"${locked ? ' data-locked' : ''}>${locked ? LOCK : ''}<span>${y === 'all' ? esc(T.allTime) : y}</span>${locked ? `<span class="sr-only"> (${T.pro})</span>` : ''}</button>`;
  }).join('');
}
$('years').addEventListener('click', e => {
  const b = e.target.closest('button[data-year]');
  if (!b) return;
  const y = b.dataset.year === 'all' ? 'all' : Number(b.dataset.year);
  if (y !== latestYear() && !needPro(T.proYears)) return;
  state.year = y;
  state.routes = null; state.routesKey = '';
  buildYears();
  requestStats();
});
function syncUnits() {
  $('units').querySelectorAll('button').forEach(b => b.setAttribute('aria-pressed', String((b.dataset.u === 'imperial') === state.imperial)));
}
$('units').addEventListener('click', e => {
  const b = e.target.closest('button[data-u]');
  if (!b) return;
  state.imperial = b.dataset.u === 'imperial';
  state.unitsChosen = true;
  F = makeFmt(LANG, state.imperial);
  syncUnits();
  render();
});
function fillTz() {
  const sel = $('tz');
  if (sel.options.length) { sel.value = tz; return; }
  let zones = [];
  try { zones = Intl.supportedValuesOf ? Intl.supportedValuesOf('timeZone') : []; } catch (e) { zones = []; }
  const list = [browserTz, 'UTC', ...zones.filter(z => z !== browserTz && z !== 'UTC')];
  sel.innerHTML = list.map(z => `<option value="${esc(z)}">${esc(z)}</option>`).join('');
  sel.value = tz;
}
$('tz').addEventListener('change', e => { tz = e.target.value; if (worker && state.meta) worker.postMessage({ type: 'tz', tz }); });

/* ---------- rendering ---------- */
function render() {
  const s = state.stats;
  if (!s) return;
  const y = state.year;
  const running = y !== 'all' && y === currentYearInTz();
  $('res-title').textContent = y === 'all' ? T.resAll : fill(running ? T.resRunning : T.resYear, { y });
  $('coverage').textContent = s.count ? fill(T.coverage, { n: F.n(s.count), from: F.date(s.firstDay), to: F.date(s.lastDay), tz }) + (state.sample ? T.sampleNote : '') : T.coverageNone;
  // totals
  const hasDist = s.dist > 0;
  $('t-dist').textContent = hasDist ? F.distNum(s.dist) : F.n(s.moving / 3600);
  $('t-dist-u').textContent = hasDist ? F.du : 'h';
  $('t-dist-l').textContent = hasDist ? T.kDist : T.kTime;
  $('t-count').textContent = F.n(s.count);
  $('t-time').textContent = F.hours(s.moving);
  $('t-elev').textContent = F.elev(s.elev);
  $('t-days').textContent = F.n(s.activeDays);
  if (hasDist && s.firstDay) {
    const weeks = Math.max(1, Math.round(((Date.parse(s.lastDay) - Date.parse(y === 'all' ? s.firstDay : `${y}-01-01`)) / DAY + 1) / 7));
    $('t-sub').textContent = fill(T.distSub, { perWeek: F.dist(s.dist / weeks), weeks: F.n(weeks) });
  } else $('t-sub').textContent = hasDist ? '' : T.distSubNone;
  renderStrip(s);
  renderSports(s);
  renderMonths(s);
  renderClock(s);
  renderFacts(s);
  renderCardPicks();
  drawCurrentCard();
  renderSportPages(s);
  renderGear();
  renderCompare();
  renderPoster();
  renderFiles();
  $('btn-csv').querySelector('.yl-lock').style.display = state.pro ? 'none' : '';
}
function renderStrip(s) {
  const box = $('strip-box');
  if (!s.strip) { box.hidden = true; return; }
  box.hidden = false;
  const c = $('strip');
  const w = Math.max(320, Math.round(c.clientWidth || 900)), h = 96, dpr = Math.min(2, window.devicePixelRatio || 1);
  c.width = w * dpr; c.height = h * dpr;
  const ctx = c.getContext('2d');
  ctx.scale(dpr, dpr);
  drawStrip(ctx, s.strip, 0, 0, w, h, { base: 'rgba(15,27,45,0.18)', tick: '#1f4e79', big: '#e0a400' }, bigIndexOf(s));
  $('strip-cap').textContent = fill(T.strip, { y: s.year });
}
function famColor(cat) { return cat === CAT.RIDE ? '#2b86b0' : cat === CAT.WALK ? '#c98a00' : cat === CAT.WINTER ? '#5b6f8f' : cat === CAT.SWIM ? '#119b85' : cat === CAT.WATER ? '#3f66c9' : cat === CAT.GYM ? '#8b5bd6' : cat === CAT.OTHER ? '#6b7a8f' : '#e8213f'; }
function renderSports(s) {
  const list = s.sports.slice(0, 8);
  const max = Math.max(1, ...list.map(x => x.moving));
  $('sports').innerHTML = list.map(x => `<li style="--c:${famColor(x.cat)}"><span class="t">${esc(x.type)}</span><span class="v">${esc(F.hours(x.moving))}</span><span class="s">${esc(fill(T.sportLine, { count: F.n(x.count), acts: x.count === 1 ? T.activity : T.activities, time: F.hm(x.moving) }) + (x.dist > 0 ? fill(T.sportDist, { dist: F.dist(x.dist) }) : ''))}</span><span class="bar" aria-hidden="true"><i style="width:${Math.max(2, (x.moving / max) * 100).toFixed(1)}%"></i></span></li>`).join('');
  $('sports-more').textContent = s.sports.length > 8 ? `+ ${s.sports.length - 8}` : '';
}
function bars(el, values, labels, longLabels, fmtv) {
  const max = Math.max(1, ...values);
  const top = values.indexOf(Math.max(...values));
  el.setAttribute('role', 'list');
  el.innerHTML = values.map((v, i) => `<div class="col${i === top && v > 0 ? ' top' : ''}" role="listitem" aria-label="${esc(longLabels[i])}: ${esc(fmtv(v))}" title="${esc(longLabels[i])}: ${esc(fmtv(v))}"><span style="height:${((v / max) * 100).toFixed(1)}%"></span><b aria-hidden="true">${esc(labels[i])}</b></div>`).join('');
}
function renderMonths(s) {
  const box = $('months-block');
  const byYear = state.year === 'all';
  $('months-h').textContent = byYear ? $('months-h').dataset.years : $('months-h').dataset.months;
  const useDist = state.monthMetric === 'dist' && s.dist > 0;
  $('month-metric').hidden = s.dist === 0;
  $('month-metric').querySelectorAll('button').forEach(b => b.setAttribute('aria-pressed', String(b.dataset.m === (useDist ? 'dist' : 'time'))));
  if (byYear) {
    const ys = (s.years || []).slice(-12);
    $('months').style.gridTemplateColumns = `repeat(${Math.max(ys.length, 1)}, minmax(0, 1fr))`;
    bars($('months'), ys.map(y => (useDist ? y.dist : y.moving)), ys.map(y => `'${String(y.year).slice(2)}`), ys.map(y => String(y.year)), v => (useDist ? F.dist(v) : F.hm(v)));
  } else {
    $('months').style.gridTemplateColumns = '';
    bars($('months'), s.months.map(m => (useDist ? m.dist : m.moving)), F.monS.map(x => x.slice(0, 3)), F.monL, v => (useDist ? F.dist(v) : F.hm(v)));
  }
  box.dataset.metric = useDist ? 'dist' : 'time';
}
$('month-metric').addEventListener('click', e => {
  const b = e.target.closest('button[data-m]');
  if (!b) return;
  state.monthMetric = b.dataset.m;
  if (state.stats) renderMonths(state.stats);
});
function renderClock(s) {
  const c = $('clock');
  const w = Math.max(280, Math.round(c.clientWidth || 560)), dpr = Math.min(2, window.devicePixelRatio || 1);
  const lab = w < 480 ? 34 : 52, fs = w < 480 ? 11 : 13;
  const cw = (w - lab) / 24, h = Math.round(7 * (cw * 1.25 + 4) + fs * 2.2);
  c.width = w * dpr; c.height = h * dpr; c.style.height = h + 'px';
  const ctx = c.getContext('2d');
  ctx.scale(dpr, dpr);
  const css = getComputedStyle(document.body);
  drawClock(ctx, s.clock, 0, 0, w, 7, { label: css.getPropertyValue('--muted').trim() || '#4b5a6e', empty: 'rgba(15,27,45,0.07)', full: '#e8213f' }, F, { lab, fs, hs: fs, gap: 4 });
  if (s.peakHour !== null && s.count) {
    const wd = s.weekdays.indexOf(Math.max(...s.weekdays));
    $('clock-note').textContent = fill(T.clockNote, { h: String(s.peakHour).padStart(2, '0'), wd: F.wdL[wd] }) + ' ' + T.clockMost;
  } else $('clock-note').textContent = '';
  // the same grid as a table for screen readers
  $('clock-table').innerHTML = `<caption>${esc($('clock-h').textContent)}</caption><tr><th scope="col"></th>${[0, 3, 6, 9, 12, 15, 18, 21].map(hh => `<th scope="col">${String(hh).padStart(2, '0')}:00</th>`).join('')}</tr>` + F.wdL.map((d, wd) => `<tr><th scope="row">${esc(d)}</th>${[0, 3, 6, 9, 12, 15, 18, 21].map(hh => `<td>${s.clock.slice(wd * 24 + hh, wd * 24 + hh + 3).reduce((a, b) => a + b, 0)}</td>`).join('')}</tr>`).join('');
}
function renderFacts(s) {
  const rows = [];
  const act = a => `${a.dist > 0 ? F.dist(a.dist) : F.dur(a.moving)}, ${esc(a.name || a.type)} (${esc(a.type)}), ${esc(fill(T.onDate, { date: F.date(a.day) }))}`;
  if (s.longest) rows.push([T.fLongest, `<span class="big">${esc(s.longest.dist > 0 ? F.dist(s.longest.dist) : F.dur(s.longest.moving))}</span> ${esc(s.longest.name || s.longest.type)}, ${esc(fill(T.onDate, { date: F.date(s.longest.day) }))}`]);
  if (s.longestTime && s.longest && s.longestTime.id !== s.longest.id) rows.push([T.fLongestTime, `${esc(F.dur(s.longestTime.moving))}, ${esc(s.longestTime.name || s.longestTime.type)}`]);
  if (s.biggestDay) rows.push([T.fBiggest, `<span class="big">${esc(s.biggestDay.dist > 0 ? F.dist(s.biggestDay.dist) : F.hm(s.biggestDay.moving))}</span> ${esc(fill(T.onDate, { date: F.date(s.biggestDay.day) }))}`]);
  if (s.streak) rows.push([T.fStreak, `<span class="big">${esc(s.streak.days === 1 ? T.streakVal1 : fill(T.streakVal, { n: F.n(s.streak.days) }))}</span> ${esc(fill(T.fromTo, { from: F.date(s.streak.from), to: F.date(s.streak.to) }))}`]);
  if (s.mostClimb && s.mostClimb.elev >= 50) rows.push([T.fClimb, `<span class="big">${esc(F.elev(s.mostClimb.elev))}</span> ${esc(s.mostClimb.name || s.mostClimb.type)}, ${esc(fill(T.onDate, { date: F.date(s.mostClimb.day) }))}`]);
  if (s.year !== 'all') {
    const useDist = s.dist > 0;
    const vals = s.months.map(m => (useDist ? m.dist : m.moving));
    const top = vals.indexOf(Math.max(...vals));
    if (vals[top] > 0) rows.push([T.fBestMonth, `${esc(F.monL[top])}: ${esc(useDist ? F.dist(vals[top]) : F.hm(vals[top]))}`]);
  }
  if (s.first) rows.push([s.year === 'all' ? T.fFirstAll : fill(T.fFirst, { y: s.year }), act(s.first)]);
  $('facts').innerHTML = rows.map(([k, v]) => `<div><dt>${esc(k)}</dt><dd>${v}</dd></div>`).join('');
}

/* ---------- cards ---------- */
function cardAvailable(c) {
  if (c.needs === 'compare') return !!(state.meta && state.meta.years.length > 1);
  if (c.needs === 'gear') return !!(state.meta && state.meta.gear > 0);
  if (c.needs === 'routes') return !!(state.routes && state.routes.length);
  return true;
}
function renderCardPicks() {
  if (!CARD_TYPES.some(c => c.id === state.card && cardAvailable(c) && (c.free || state.pro))) state.card = 'year';
  $('card-picks').innerHTML = CARD_TYPES.map(c => {
    const locked = !c.free && !state.pro;
    const off = !cardAvailable(c);
    const on = c.id === state.card;
    return `<button type="button" role="radio" aria-checked="${on}" tabindex="${on ? 0 : -1}" data-card="${c.id}"${locked ? ' data-locked' : ''}${off ? ' disabled' : ''}>${locked ? LOCK : ''}<span>${esc(T.cardNames[c.id])}</span>${locked ? `<span class="sr-only"> (${T.pro})</span>` : ''}</button>`;
  }).join('');
}
$('card-picks').addEventListener('click', e => {
  const b = e.target.closest('button[data-card]');
  if (!b || b.disabled) return;
  const c = CARD_TYPES.find(x => x.id === b.dataset.card);
  if (!c.free && !needPro(fill(T.proCard, { name: T.cardNames[c.id] }))) return;
  state.card = c.id;
  renderCardPicks();
  drawCurrentCard();
  $('card-picks').querySelector(`[data-card="${c.id}"]`).focus();
});
$('card-picks').addEventListener('keydown', e => {
  if (!['ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown'].includes(e.key)) return;
  const btns = [...$('card-picks').querySelectorAll('button:not([disabled])')];
  let i = btns.indexOf(document.activeElement);
  if (i < 0) return;
  e.preventDefault();
  i = (i + (e.key === 'ArrowRight' || e.key === 'ArrowDown' ? 1 : -1) + btns.length) % btns.length;
  btns[i].focus();
});
function cardData() {
  const y = state.year;
  return { T, f: F, year: y, running: y !== 'all' && y === currentYearInTz(), stats: state.stats, compare: state.compare, alltime: state.alltime, gear: state.gear, routes: state.routes, address: ADDRESS[LANG] || ADDRESS.en };
}
async function fontsReady() {
  try { await Promise.all([document.fonts.load('italic 800 80px "Yearlap Display"'), document.fonts.load('700 40px "Yearlap Text"'), document.fonts.load('400 40px "Yearlap Text"')]); } catch (e) { /* draw with the fallback */ }
}
async function drawCurrentCard() {
  if (!state.stats) return;
  await fontsReady();
  const c = CARD_TYPES.find(x => x.id === state.card);
  if (!c.free && !state.pro) state.card = 'year';
  drawCard($('card-canvas'), state.card, cardData());
  $('card-canvas').setAttribute('aria-label', fill(T.cardPreview, { name: T.cardNames[state.card] }));
  $('card-note').textContent = state.sample ? T.cardSample : '';
}
const canvasBlob = c => new Promise(res => c.toBlob(b => res(b), 'image/png'));
$('btn-save-card').addEventListener('click', async () => {
  if (!state.stats) return;
  await drawCurrentCard();
  const blob = await canvasBlob($('card-canvas'));
  if (!blob) return;
  window.PeakUI.download(blob, cardFileName(state.card, state.year));
  window.PeakUI.toast(T.cardSaved);
});
(function shareButton() {
  try {
    const f = new File([new Blob(['x'], { type: 'image/png' })], 'x.png', { type: 'image/png' });
    if (navigator.canShare && navigator.canShare({ files: [f] })) $('btn-share-card').hidden = false;
  } catch (e) { /* no file sharing here */ }
})();
$('btn-share-card').addEventListener('click', async () => {
  if (!state.stats) return;
  await drawCurrentCard();
  const blob = await canvasBlob($('card-canvas'));
  if (!blob) return;
  try { await navigator.share({ files: [new File([blob], cardFileName(state.card, state.year), { type: 'image/png' })] }); } catch (e) { /* closed the share sheet */ }
});

/* ---------- Pro: sport pages ---------- */
function lockedNote(text, reason, id) {
  return `<div class="yl-locked-note"><p>${esc(text)}</p><button type="button" class="btn btn-sm yl-btn-pro" data-pro-reason="${esc(reason)}" id="${id}">${LOCK}<span>${esc(T.seeWhat)}</span></button></div>`;
}
document.addEventListener('click', e => { const b = e.target.closest('[data-pro-reason]'); if (b) needPro(b.dataset.proReason); });
function renderSportPages(s) {
  const tabs = $('sport-tabs'), body = $('sport-body');
  if (!state.pro) {
    tabs.innerHTML = '';
    body.innerHTML = lockedNote(fill(T.lockSports, { n: F.n(s.sports.length) }), T.proSports, 'btn-sports-pro');
    return;
  }
  const list = s.sports.slice(0, 10);
  if (!list.length) { tabs.innerHTML = ''; body.innerHTML = `<p class="yl-empty">${esc(T.coverageNone)}</p>`; return; }
  if (!state.sport || !list.some(x => x.type === state.sport)) {
    state.sport = list[0].type; state.sportStats = null;
    worker.postMessage({ type: 'sport', id: state.req, year: state.year, sport: state.sport });
  }
  tabs.innerHTML = list.map((x, i) => `<button type="button" role="tab" id="stab-${i}" aria-controls="sport-body" aria-selected="${x.type === state.sport}" tabindex="${x.type === state.sport ? 0 : -1}" data-sport="${esc(x.type)}" style="--c:${famColor(x.cat)}">${esc(x.type)}</button>`).join('');
  const sel = tabs.querySelector('[aria-selected="true"]');
  if (sel) body.setAttribute('aria-labelledby', sel.id);
  renderSportBody();
}
function renderSportBody() {
  const sp = state.sportStats, body = $('sport-body');
  if (!state.pro) return;
  if (!sp || sp.sport !== state.sport) { body.innerHTML = '<p class="yl-empty">…</p>'; return; }
  const pace = paceSport(sp.cat);
  const kp = [[T.kActs, F.n(sp.count)], [T.kTime, F.hm(sp.moving)]];
  if (sp.dist > 0) kp.push([T.kDist, F.dist(sp.dist)], [pace ? T.sAvgPace : T.sAvgSpeed, F.pace(sp.dist, sp.moving, sp.cat)]);
  if (sp.elev > 0) kp.push([T.kElev, F.elev(sp.elev)]);
  kp.push([T.kDays, F.n(sp.activeDays)]);
  const best = [];
  if (sp.longest) best.push([T.sLongest, `${sp.longest.dist > 0 ? F.dist(sp.longest.dist) : F.dur(sp.longest.moving)} (${F.dur(sp.longest.moving)}), ${sp.longest.name}, ${F.date(sp.longest.day)}`]);
  if (sp.fastest) best.push([fill(T.sFastest, { min: F.distLabel(sp.minDist) }), `${F.pace(sp.fastest.dist, sp.fastest.moving, sp.cat)}: ${F.dist(sp.fastest.dist)}, ${F.dur(sp.fastest.moving)}, ${sp.fastest.name}, ${F.date(sp.fastest.day)}`]);
  const buckets = sp.distBuckets ? sp.distBuckets.map(b => [b.lo === 0 ? fill(T.under, { a: F.distLabel(b.hi) }) : b.hi === Infinity || b.hi === null ? fill(T.over, { a: F.distLabel(b.lo) }) : fill(T.between, { a: F.distLabel(b.lo), b: F.distLabel(b.hi) }), b.count]) : [];
  const bmax = Math.max(1, ...buckets.map(b => b[1]));
  body.innerHTML = `<dl class="yl-kpis yl-kpis-sm">${kp.map(([k, v]) => `<div><dt>${esc(k)}</dt><dd>${esc(v)}</dd></div>`).join('')}</dl>
<div class="yl-sport-cols"><div><h4 class="yl-sub-h">${esc(T.sMonths)}</h4><div class="yl-bars" id="sport-months"></div></div>
<div>${best.length ? `<dl class="yl-dl">${best.map(([k, v]) => `<div><dt>${esc(k)}</dt><dd>${esc(v)}</dd></div>`).join('')}</dl>` : ''}
${buckets.length ? `<h4 class="yl-sub-h">${esc(T.sBuckets)}</h4><ul class="yl-buckets">${buckets.map(([k, n]) => `<li><span>${esc(k)}</span><b>${F.n(n)}</b><i style="width:${((n / bmax) * 100).toFixed(1)}%"></i></li>`).join('')}</ul>` : ''}</div></div>`;
  const useDist = sp.dist > 0;
  if (state.year === 'all') {
    const ys = (sp.years || []).slice(-12);
    $('sport-months').style.gridTemplateColumns = `repeat(${Math.max(ys.length, 1)}, minmax(0, 1fr))`;
    bars($('sport-months'), ys.map(y => (useDist ? y.dist : y.moving)), ys.map(y => `'${String(y.year).slice(2)}`), ys.map(y => String(y.year)), v => (useDist ? F.dist(v) : F.hm(v)));
  } else bars($('sport-months'), sp.months.map(m => (useDist ? m.dist : m.moving)), F.monS.map(x => x.slice(0, 3)), F.monL, v => (useDist ? F.dist(v) : F.hm(v)));
}
$('sport-tabs').addEventListener('click', e => {
  const b = e.target.closest('[data-sport]');
  if (!b) return;
  selectSport(b.dataset.sport);
});
$('sport-tabs').addEventListener('keydown', e => {
  if (!['ArrowLeft', 'ArrowRight', 'Home', 'End'].includes(e.key)) return;
  const tabs = [...$('sport-tabs').querySelectorAll('[role=tab]')];
  let i = tabs.indexOf(document.activeElement);
  if (i < 0) return;
  e.preventDefault();
  i = e.key === 'Home' ? 0 : e.key === 'End' ? tabs.length - 1 : (i + (e.key === 'ArrowRight' ? 1 : -1) + tabs.length) % tabs.length;
  selectSport(tabs[i].dataset.sport);
  $('sport-tabs').querySelectorAll('[role=tab]')[i].focus();
});
function selectSport(type) {
  state.sport = type; state.sportStats = null;
  worker.postMessage({ type: 'sport', id: state.req, year: state.year, sport: type });
  renderSportPages(state.stats);
}

/* ---------- Pro: gear ---------- */
function renderGear() {
  const box = $('gear-body');
  const n = state.meta ? state.meta.gear : 0;
  if (!state.pro) { box.innerHTML = n ? lockedNote(fill(T.lockGear, { n: F.n(n) }), T.proGear, 'btn-gear-pro') : `<div class="yl-locked-note"><p>${esc(T.lockGearNone)}</p></div>`; return; }
  const g = state.gear;
  if (!g || !g.length) { box.innerHTML = `<div class="yl-locked-note"><p>${esc(T.lockGearNone)}</p></div>`; return; }
  const kind = k => (k === 'bike' ? T.gBike : k === 'shoe' ? T.gShoe : T.gOther);
  box.innerHTML = `<div class="yl-scroll"><table><caption>${esc(T.gCaption)}</caption><thead><tr><th scope="col">${esc(T.gName)}</th><th scope="col">${esc(T.gKind)}</th><th scope="col" class="num">${esc(state.year === 'all' ? T.gLife : T.gYear)}</th><th scope="col" class="num">${esc(T.gActs)}</th><th scope="col" class="num">${esc(T.gLife)}</th><th scope="col">${esc(T.gFirst)}</th><th scope="col">${esc(T.gLast)}</th></tr></thead><tbody>${g.map(x => `<tr><th scope="row">${esc(x.name)}</th><td>${esc(kind(x.kind))}</td><td class="num">${esc(F.dist(x.year.dist))}</td><td class="num">${F.n(x.year.count)}</td><td class="num">${esc(F.dist(x.life.dist))}</td><td>${esc(F.date(x.first))}</td><td>${esc(F.date(x.last))}</td></tr>`).join('')}</tbody></table></div>`;
}

/* ---------- Pro: year against year ---------- */
function renderCompare() {
  const box = $('compare-body');
  const multi = state.meta && state.meta.years.length > 1;
  if (!multi) { box.innerHTML = `<div class="yl-locked-note"><p>${esc(T.lockCompareOne)}</p></div>`; return; }
  if (!state.pro) { box.innerHTML = lockedNote(fill(T.lockCompare, { n: F.n(state.meta.years.length) }), T.proCompare, 'btn-compare-pro'); return; }
  const c = state.compare;
  if (!c) { box.innerHTML = '<p class="yl-empty">…</p>'; return; }
  const rows = c.slice().reverse().map((e, i, arr) => {
    const prev = arr[i + 1];
    const ch = prev && prev.dist ? Math.round(((e.dist - prev.dist) / prev.dist) * 100) : null;
    return `<tr><th scope="row">${e.year}</th><td class="num">${F.n(e.count)}</td><td class="num">${esc(F.dist(e.dist))}</td><td class="num">${esc(F.hours(e.moving))}</td><td class="num">${esc(F.elev(e.elev))}</td><td class="num">${F.n(e.activeDays)}</td><td class="num">${ch === null ? '' : (ch > 0 ? '+' : '') + ch + '%'}</td><td>${esc(e.topSport)}</td></tr>`;
  }).join('');
  box.innerHTML = `<div class="yl-scroll"><table><caption>${esc(T.cCaption)}</caption><thead><tr><th scope="col">${esc(T.cYear)}</th><th scope="col" class="num">${esc(T.cActs)}</th><th scope="col" class="num">${esc(T.cDist)}</th><th scope="col" class="num">${esc(T.cTime)}</th><th scope="col" class="num">${esc(T.cElev)}</th><th scope="col" class="num">${esc(T.cDays)}</th><th scope="col" class="num">${esc(T.cChange)}</th><th scope="col">${esc(T.cTop)}</th></tr></thead><tbody>${rows}</tbody></table></div>`;
}

/* ---------- Pro: route poster ---------- */
function renderPoster() {
  const lock = $('poster-locked'), tools = $('poster-tools');
  const avail = state.meta ? state.meta.routes.available : 0;
  if (!state.pro) {
    tools.hidden = true; lock.hidden = false;
    lock.innerHTML = `<div class="yl-locked-poster"><img src="/strava-year-in-review/img/poster-sample-480.webp" width="480" height="679" loading="lazy" alt="">${lockedNote(fill(T.lockPoster, { n: F.n(avail) }), T.proPoster, 'btn-poster-pro')}</div>`;
    return;
  }
  lock.hidden = true; tools.hidden = false;
  const sel = $('poster-sport');
  const sports = state.stats.sports.map(x => x.type);
  sel.innerHTML = `<option value="">${esc(T.posterAll)}</option>` + sports.map(x => `<option value="${esc(x)}">${esc(x)}</option>`).join('');
  sel.value = sports.includes(state.posterSport) ? state.posterSport : '';
  $('btn-poster').textContent = state.routes ? T.posterRedraw : T.posterBuild;
  $('btn-poster-save').disabled = !(state.routes && state.routes.length);
  if (state.routes) drawPosterPreview();
}
$('poster-sport').addEventListener('change', e => { state.posterSport = e.target.value; state.routes = null; state.routesKey = ''; $('btn-poster-save').disabled = true; $('btn-poster').textContent = T.posterBuild; });
$('poster-theme').addEventListener('click', e => {
  const b = e.target.closest('button[data-theme]');
  if (!b) return;
  state.posterTheme = b.dataset.theme;
  $('poster-theme').querySelectorAll('button').forEach(x => x.setAttribute('aria-pressed', String(x === b)));
  if (state.routes) drawPosterPreview();
});
$('poster-name').addEventListener('input', () => { if (state.routes) drawPosterPreview(); });
$('btn-poster').addEventListener('click', () => {
  if (!needPro(T.proPoster) || !worker) return;
  state.posterReq = (state.posterReq || 0) + 1;
  state.posterBusy = true;
  $('btn-poster').disabled = true;
  $('poster-status').textContent = fill(T.posterReading, { done: '0', total: '…' });
  worker.postMessage({ type: 'routes', id: state.posterReq, year: state.year, sport: state.posterSport || null });
});
function routesArrived(m) {
  state.posterBusy = false;
  $('btn-poster').disabled = false;
  state.routes = m.routes;
  if (!m.routes.length) { $('poster-status').textContent = T.posterNone; $('poster-frame').hidden = true; $('btn-poster-save').disabled = true; renderCardPicks(); return; }
  $('poster-status').textContent = fill(T.posterDone, { n: F.n(m.routes.length) }) + (m.failed ? fill(T.posterFailed, { n: F.n(m.failed) }) : '');
  $('btn-poster').textContent = T.posterRedraw;
  $('btn-poster-save').disabled = false;
  drawPosterPreview();
  renderCardPicks();
}
function posterOpts() {
  return { routes: state.routes || [], year: state.year, name: $('poster-name').value.trim().slice(0, 48), theme: state.posterTheme, f: F, T, address: ADDRESS[LANG] || ADDRESS.en, sport: state.posterSport || '' };
}
async function drawPosterPreview() {
  await fontsReady();
  $('poster-frame').hidden = false;
  const c = $('poster-canvas');
  const w = Math.min(720, Math.max(280, Math.round(c.parentElement.clientWidth || 600)));
  drawPoster(c, posterOpts(), (w * Math.min(2, window.devicePixelRatio || 1)) / PW);
  c.style.width = w + 'px';
  c.style.height = Math.round((w * PH) / PW) + 'px';
}
$('btn-poster-save').addEventListener('click', async () => {
  if (!state.routes || !state.routes.length || !needPro(T.proPoster)) return;
  await fontsReady();
  const c = document.createElement('canvas');
  drawPoster(c, posterOpts(), 1);
  const blob = await canvasBlob(c);
  c.width = c.height = 1;
  if (!blob) return;
  window.PeakUI.download(blob, `yearlap-poster-${state.year === 'all' ? 'all-time' : state.year}${state.posterSport ? '-' + state.posterSport.toLowerCase().replace(/[^a-z0-9]+/g, '-') : ''}.png`);
  window.PeakUI.toast(T.posterSaved);
});

/* ---------- CSV and what was read ---------- */
$('btn-csv').addEventListener('click', () => {
  if (!state.stats || !needPro(T.proCsv)) return;
  const label = state.year === 'all' ? 'all time' : String(state.year);
  const blob = new Blob([statsToCsv(state.stats, { label, imperial: state.imperial, gear: state.gear, compare: state.compare })], { type: 'text/csv;charset=utf-8' });
  window.PeakUI.download(blob, `yearlap-${state.year === 'all' ? 'all-time' : state.year}.csv`);
  window.PeakUI.toast(T.csvSaved);
});
function renderFiles() {
  const meta = state.meta;
  if (!meta) return;
  const li = meta.files.map(f => `<li>${esc(fill(T.filesRows, { name: f.name, n: F.n(f.rows), cols: F.n(f.columns), lang: (T.langs[f.lang] || T.langs.other) + (f.how === 'position' ? T.howPos : f.how === 'names' ? T.howNames : '') }))}</li>`);
  const c = meta.counts, notes = [];
  if (c.dup) notes.push(fill(T.counts_dup, { n: F.n(c.dup) }));
  if (c.bad) notes.push(fill(T.counts_bad, { n: F.n(c.bad) }));
  if (c.errorFile) notes.push(fill(T.counts_error, { n: F.n(c.errorFile) }));
  if (!meta.sample) notes.push(meta.routes.available ? fill(T.routesSome, { n: F.n(meta.routes.available) }) : T.routesNone);
  problemList(meta).forEach(p => notes.push(p));
  $('files-read').innerHTML = `<ul>${li.join('')}</ul>${notes.length ? `<ul>${notes.map(n => `<li>${esc(n)}</li>`).join('')}</ul>` : ''}`;
}

/* ---------- file picking ---------- */
const input = $('file-input'), folder = $('folder-input');
$('btn-choose').addEventListener('click', () => input.click());
$('btn-folder').addEventListener('click', () => folder.click());
$('btn-retry').addEventListener('click', () => input.click());
input.addEventListener('change', () => { const files = [...input.files]; input.value = ''; if (files.length) start(files); });
folder.addEventListener('change', () => { const files = [...folder.files].map(f => ({ file: f, path: f.webkitRelativePath || f.name })); folder.value = ''; if (files.length) start(files); });
$('btn-sample').addEventListener('click', startSample);
$('btn-error-sample').addEventListener('click', startSample);
$('btn-reset').addEventListener('click', () => {
  if (worker) worker.postMessage({ type: 'reset' });
  Object.assign(state, { meta: null, stats: null, compare: null, alltime: null, gear: null, year: null, sample: false, routes: null, routesKey: '', sport: null, sportStats: null });
  $('results').hidden = true;
  $('poster-frame').hidden = true;
  stage('idle');
  focusEl($('drop-title'));
});
$('btn-see').addEventListener('click', e => { e.preventDefault(); $('results').scrollIntoView({ behavior: reduceMotion() ? 'auto' : 'smooth' }); focusEl($('results')); });
const drop = $('drop');
['dragenter', 'dragover'].forEach(ev => drop.addEventListener(ev, e => { e.preventDefault(); drop.classList.add('is-over'); }));
['dragleave', 'drop'].forEach(ev => drop.addEventListener(ev, e => { e.preventDefault(); drop.classList.remove('is-over'); }));
drop.addEventListener('drop', async e => { const items = await itemsFromDrop(e.dataTransfer); if (items.length) start(items); });
// drag and drop: the ZIP, activities.csv, or the unzipped folder (walked here, its paths kept)
async function itemsFromDrop(dt) {
  const list = dt.items ? [...dt.items] : [];
  const entries = list.map(i => (i.webkitGetAsEntry ? i.webkitGetAsEntry() : null)).filter(Boolean);
  if (!entries.length) return [...(dt.files || [])];
  const out = [];
  const walk = async (entry, depth, path) => {
    if (entry.isFile) { const f = await new Promise(res => entry.file(res, () => res(null))); if (f) out.push({ file: f, path: path + f.name }); return; }
    if (entry.isDirectory && depth < 4) {
      const reader = entry.createReader();
      for (;;) {
        const batch = await new Promise(res => reader.readEntries(res, () => res([])));
        if (!batch.length) break;
        for (const ch of batch) await walk(ch, depth + 1, path + entry.name + '/');
      }
    }
  };
  for (const en of entries) await walk(en, 0, '');
  return out;
}

window.addEventListener('resize', (() => { let t; return () => { clearTimeout(t); t = setTimeout(() => { if (state.stats) { renderStrip(state.stats); renderClock(state.stats); if (state.routes) drawPosterPreview(); } }, 200); }; })());
syncUnits();
setupLicense();
