/* Earhours page logic. The files go to the worker (worker.js) in this tab; the page only shows what the worker works
 * out. The one network request the page itself can make is the Pro license check, to Gumroad, when you paste a key. */
import { recordSvg } from './clock.js';
import { drawCard, cardFileName, CARD_TYPES, longDate } from './cards.js';
import { statsToCsv, KIND } from './engine.js';

// ---- Gumroad Pro product, permalink earhours-pro. The license check sends this product id, never the permalink.
// Fail closed: while this is 'PENDING' (or empty) Pro never turns on, whatever the browser has stored.
const EARHOURS_PRO_PRODUCT_ID = '2om7pN_sgcE0CbT_4PT3dA==';
const EARHOURS_PRO_URL = 'https://dorukctn.gumroad.com/l/earhours-pro';
const PRO_READY = !!EARHOURS_PRO_PRODUCT_ID && EARHOURS_PRO_PRODUCT_ID !== 'PENDING';

const $ = id => document.getElementById(id);
const DAY = 864e5;
const num = n => Math.round(n).toLocaleString('en-US');
const mins = ms => Math.round(ms / 60000);
const esc = s => String(s).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
const WD = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];
const WD_LONG = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday'];
const MON = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
const MON_LONG = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];
const reduceMotion = () => window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches;

const state = { meta: null, year: null, list: 'artists', showAll: false, card: 'summary', stats: null, compare: null, alltime: null, pro: false, busy: false, req: 0, sample: false };
let worker = null;
const browserTz = (() => { try { return Intl.DateTimeFormat().resolvedOptions().timeZone || 'UTC'; } catch (e) { return 'UTC'; } })();
let tz = browserTz;

/* ---------- license ---------- */
function setupLicense() {
  if (!window.PeakLicense) return;
  window.PeakLicense.setup({
    tool: 'earhours', productId: PRO_READY ? EARHOURS_PRO_PRODUCT_ID : 'PENDING', permalink: 'earhours-pro', buyUrl: EARHOURS_PRO_URL,
    pitch: 'Pro opens every year in your file, all-time totals, year against year, the top 100 lists, all seven story cards and a CSV. $5 once.',
  });
  window.PeakLicense.onChange(isPro => {
    const was = state.pro;
    state.pro = PRO_READY && !!isPro;
    $('pro-state').textContent = state.pro ? 'Pro is active on this browser. Thank you.' : 'Pro is not active on this browser.';
    if (was !== state.pro && state.meta) { buildYears(); requestStats(); }
  });
}
const needPro = reason => (state.pro ? true : (window.PeakLicense ? window.PeakLicense.requirePro(reason) : false));

/* ---------- stages ---------- */
function stage(name) {
  ['idle', 'busy', 'error', 'done'].forEach(s => { $('stage-' + s).hidden = s !== name; });
  $('panel').dataset.state = name;
}
function focusEl(el) { if (el) { el.focus({ preventScroll: true }); } }

/* ---------- worker ---------- */
function getWorker() {
  if (worker) return worker;
  try {
    worker = new Worker(new URL('./worker.js', import.meta.url), { type: 'module' });
  } catch (e) {
    worker = null;
    return null;
  }
  worker.onmessage = onWorker;
  worker.onerror = (e) => { e.preventDefault && e.preventDefault(); fail('This browser could not start the reader', '<p>Open this page in a current version of Chrome, Edge, Firefox or Safari and try again.</p>'); };
  return worker;
}

function fail(title, html) {
  state.busy = false;
  $('error-title').textContent = title;
  $('error-text').innerHTML = html;
  stage('error');
  focusEl($('error-title'));
}

function start(files, { add = false } = {}) {
  if (!files || !files.length) return;
  const w = getWorker();
  if (!w) return fail('This browser could not start the reader', '<p>Open this page in a current version of Chrome, Edge, Firefox or Safari and try again.</p>');
  state.busy = true;
  if (!add || state.sample) { w.postMessage({ type: 'reset' }); state.sample = false; }
  $('busy-title').textContent = files.length === 1 ? `Reading ${files[0].name}` : `Reading ${files.length} files`;
  $('busy-sub').textContent = 'Opening the file in this tab';
  setBar(2);
  stage('busy');
  focusEl($('busy-title'));
  w.postMessage({ type: 'files', files, tz });
}

function startSample() {
  const w = getWorker();
  if (!w) return fail('This browser could not start the reader', '<p>Open this page in a current version of Chrome, Edge, Firefox or Safari and try again.</p>');
  state.busy = true;
  state.sample = true;
  w.postMessage({ type: 'reset' });
  $('busy-title').textContent = 'Building the sample';
  $('busy-sub').textContent = 'A made-up listener, two years of plays';
  setBar(30);
  stage('busy');
  w.postMessage({ type: 'sample', tz });
}

function setBar(p) {
  const v = Math.max(0, Math.min(100, Math.round(p)));
  $('busy-bar').setAttribute('aria-valuenow', String(v));
  $('busy-bar').firstElementChild.style.width = v + '%';
}

function onWorker(ev) {
  const m = ev.data || {};
  if (m.type === 'progress') {
    const p = ((m.index + (m.part - 1) / Math.max(1, m.parts)) / Math.max(1, m.total)) * 100;
    setBar(Math.max(4, p));
    $('busy-sub').textContent = `${m.file}${m.parts > 1 ? ` (part ${m.part} of ${m.parts})` : ''}, ${num(m.plays)} plays so far`;
    return;
  }
  if (m.type === 'loaded') { state.busy = false; loaded(m.meta, m); return; }
  if (m.type === 'stats') {
    if (m.id !== state.req) return;
    state.stats = m.result;
    if (m.compare) state.compare = m.compare;
    if (m.alltime) state.alltime = m.alltime;
    render();
    return;
  }
  if (m.type === 'error') fail('Something went wrong while reading', `<p>${esc(m.message)}</p><p>Try the file again. If it keeps happening, write to info@peakappsstudio.com with the file name (not the file).</p>`);
}

/* ---------- after loading ---------- */
const PROBLEM = {
  json: n => `${n} could not be read as JSON. It may be cut short; download it again from Spotify's email.`,
  zip: n => `${n} could not be opened as a ZIP file. Download it again from Spotify's email.`,
  nohistory: (n, p) => `${n} has no streaming history in it${p.inside && p.inside.length ? ` (it holds ${p.inside.join(', ')})` : ''}. Use the ZIP from Spotify's "Download your data" email.`,
  type: n => `${n} is not a ZIP or JSON file. Spotify sends a ZIP called my_spotify_data.zip.`,
  empty: n => `${n} is empty.`,
  read: n => `${n} could not be read by the browser.`,
};
function problemList(meta) {
  const items = meta.problems.map(p => PROBLEM[p.reason] ? PROBLEM[p.reason](p.name, p) : `${p.name} could not be read.`);
  if (meta.notUsed.length) items.push(`Not listening history, so skipped: ${meta.notUsed.slice(0, 6).join(', ')}${meta.notUsed.length > 6 ? ` and ${meta.notUsed.length - 6} more` : ''}.`);
  return items;
}

function loaded(meta, m) {
  state.meta = meta;
  if (m.tzChange) {
    const ys = meta.years.map(y => y.year);
    if (state.year !== 'all' && !ys.includes(state.year)) state.year = ys[ys.length - 1];
    state.compare = null; state.alltime = null;
    buildYears();
    requestStats();
    return;
  }
  if (!meta.plays) {
    const items = problemList(meta);
    const emptyFiles = meta.files.filter(f => f.format === 'empty').length;
    if (emptyFiles && !items.length) items.push('The streaming history files in it are empty: Spotify had no plays to list for that period.');
    if (!items.length) items.push('No plays were found in these files.');
    return fail('No listening history found', `<ul>${items.map(i => `<li>${esc(i)}</li>`).join('')}</ul><p>The files Earhours reads are called StreamingHistory_music_0.json (Account data) or Streaming_History_Audio_....json (Extended streaming history).</p>`);
  }
  const years = meta.years.map(y => y.year);
  state.year = years[years.length - 1];
  state.showAll = false;
  state.compare = null; state.alltime = null;
  const span = years.length > 1 ? `from ${years[0]} to ${years[years.length - 1]}` : `in ${years[0]}`;
  $('done-title').textContent = m.sample ? `The sample: ${num(meta.plays)} plays ${span}` : `Found ${num(meta.plays)} plays ${span}`;
  const probs = problemList(meta);
  $('done-sub').textContent = m.sample ? 'Made-up artists and songs, built in your browser. Open your own file to see yours.'
    : `${meta.files.filter(f => f.rows).length} history ${meta.files.filter(f => f.rows).length === 1 ? 'file' : 'files'} read.${probs.length ? ' ' + probs.join(' ') : ''}`;
  stage('done');
  fillTz();
  buildYears();
  $('results').hidden = false;
  requestStats();
  focusEl($('done-title'));
  setTimeout(() => { $('results').scrollIntoView({ behavior: reduceMotion() ? 'auto' : 'smooth', block: 'start' }); }, 120);
}

function todayInTz() {
  try {
    const p = {};
    for (const x of new Intl.DateTimeFormat('en-US', { timeZone: tz, year: 'numeric', month: 'numeric', day: 'numeric' }).formatToParts(new Date())) p[x.type] = x.value;
    return Math.floor(Date.UTC(+p.year, +p.month - 1, +p.day) / DAY);
  } catch (e) { return Math.floor(Date.now() / DAY); }
}

function requestStats() {
  if (!worker || !state.meta) return;
  state.req++;
  const multi = state.meta.years.length > 1;
  worker.postMessage({ type: 'stats', id: state.req, year: state.year, topN: state.pro ? 100 : 10, today: todayInTz(), compare: state.pro && multi, alltime: state.pro });
}

/* ---------- year buttons and time zone ---------- */
const latestYear = () => state.meta.years[state.meta.years.length - 1].year;
function buildYears() {
  const box = $('years');
  const lock = '<svg class="eh-lock" viewBox="0 0 20 20" aria-hidden="true" focusable="false"><path d="M6 9V6.5a4 4 0 0 1 8 0V9" fill="none" stroke="currentColor" stroke-width="1.8"/><rect x="4" y="9" width="12" height="8.5" rx="2" fill="currentColor"/></svg>';
  const opts = state.meta.years.map(y => y.year).reverse().concat(state.meta.years.length > 1 ? ['all'] : []);
  box.innerHTML = opts.map(y => {
    const locked = !state.pro && y !== latestYear();
    return `<button type="button" data-year="${y}" aria-pressed="${y === state.year}"${locked ? ' data-locked' : ''}>${locked ? lock : ''}<span>${y === 'all' ? 'All time' : y}</span>${locked ? '<span class="sr-only"> (Pro)</span>' : ''}</button>`;
  }).join('');
}
$('years').addEventListener('click', e => {
  const b = e.target.closest('button[data-year]');
  if (!b) return;
  const y = b.dataset.year === 'all' ? 'all' : Number(b.dataset.year);
  if (y !== latestYear() && !needPro('Every year in your file and all-time totals are part of Pro.')) return;
  state.year = y;
  buildYears();
  requestStats();
});

function fillTz() {
  const sel = $('tz');
  if (sel.options.length) { sel.value = tz; return; }
  let zones = [];
  try { zones = Intl.supportedValuesOf ? Intl.supportedValuesOf('timeZone') : []; } catch (e) { zones = []; }
  const list = [browserTz, 'UTC', ...zones.filter(z => z !== browserTz && z !== 'UTC')];
  sel.innerHTML = list.map((z, i) => `<option value="${esc(z)}">${esc(z)}${i === 0 ? ' (this device)' : ''}</option>`).join('');
  sel.value = tz;
}
$('tz').addEventListener('change', e => {
  tz = e.target.value;
  if (worker && state.meta) worker.postMessage({ type: 'tz', tz });
});

/* ---------- rendering ---------- */
function render() {
  const s = state.stats;
  if (!s) return;
  const y = state.year;
  const running = y !== 'all' && y === new Date(todayInTz() * DAY).getUTCFullYear();
  $('res-title').textContent = y === 'all' ? 'Your listening, all time' : running ? `Your listening in ${y} so far` : `Your listening in ${y}`;
  const first = s.firstDay ? longDate(s.firstDay) : '', last = s.lastDay ? longDate(s.lastDay) : '';
  $('coverage').textContent = s.plays ? `${num(s.plays)} plays from ${first} to ${last}, in ${tz} time.${state.sample ? ' This is the made-up sample.' : ''}` : 'No plays in this period.';
  // totals
  const m = mins(s.totalMs);
  $('t-min').textContent = num(m);
  $('t-unit').textContent = m === 1 ? 'minute' : 'minutes';
  const parts = [];
  if (s.kindMs[KIND.MUSIC]) parts.push(`${num(mins(s.kindMs[KIND.MUSIC]))} of music`);
  if (s.kindMs[KIND.PODCAST]) parts.push(`${num(mins(s.kindMs[KIND.PODCAST]))} of podcasts`);
  if (s.kindMs[KIND.AUDIOBOOK]) parts.push(`${num(mins(s.kindMs[KIND.AUDIOBOOK]))} of audiobooks`);
  if (s.kindMs[KIND.OTHER] >= 60000) parts.push(`${num(mins(s.kindMs[KIND.OTHER]))} of plays with no name in the file (local files)`);
  const hours = s.totalMs / 36e5;
  $('t-sub').textContent = `That is ${num(hours)} hours, or ${(s.totalMs / DAY).toFixed(1)} days of listening${parts.length ? ': ' + joinList(parts) : ''}.`;
  if (s.projection) {
    $('t-pace').hidden = false;
    $('t-pace').textContent = `At this pace: about ${num(mins(s.projection.ms))} minutes by 31 December`;
  } else $('t-pace').hidden = true;
  renderList();
  renderWhen(s);
  renderFacts(s);
  renderCardPicks();
  drawCurrentCard();
  renderCompare();
  renderFiles();
  $('btn-csv').querySelector('.eh-lock').style.display = state.pro ? 'none' : '';
}
const joinList = a => (a.length < 2 ? a.join('') : a.slice(0, -1).join(', ') + ' and ' + a[a.length - 1]);

function renderList() {
  const s = state.stats;
  const n = state.showAll && state.pro ? 100 : 10;
  const L = state.list;
  let items = [];
  if (L === 'artists') items = s.topArtists.map(a => ({ t: a.name, s: `${num(a.streams)} ${a.streams === 1 ? 'play' : 'plays'}`, v: `${num(mins(a.ms))} min`, w: a.ms }));
  if (L === 'songs') items = s.topTracks.map(a => ({ t: a.name, s: a.artist, v: `${num(a.streams)} ${a.streams === 1 ? 'play' : 'plays'}`, w: a.streams }));
  if (L === 'albums') items = s.topAlbums.map(a => ({ t: a.name, s: a.artist, v: `${num(mins(a.ms))} min`, w: a.ms }));
  if (L === 'shows') items = s.topShows.map(a => ({ t: a.name, s: a.kind === 'audiobook' ? `Audiobook, ${num(a.episodes)} ${a.episodes === 1 ? 'chapter' : 'chapters'}` : `${num(a.episodes)} ${a.episodes === 1 ? 'episode' : 'episodes'}`, v: `${num(mins(a.ms))} min`, w: a.ms }));
  items = items.slice(0, n);
  const max = items.length ? items[0].w || 1 : 1;
  $('rank').innerHTML = items.map((it, i) => `<li><span class="n">${i + 1}</span><span class="t">${esc(it.t)}</span><span class="v">${esc(it.v)}</span><span class="s">${esc(it.s)}</span><span class="bar" aria-hidden="true"><i style="width:${Math.max(2, (it.w / max) * 100).toFixed(1)}%"></i></span></li>`).join('');
  const empty = $('rank-empty');
  empty.hidden = items.length > 0;
  empty.textContent = { artists: 'No music in this period.', songs: 'No song was played for 30 seconds or more in this period.', albums: 'No albums in this period. Account data does not name albums; the Extended streaming history does.', shows: 'No podcasts or audiobooks in this period.' }[L];
  const more = $('btn-more');
  const total = { artists: s.topArtists, songs: s.topTracks, albums: s.topAlbums, shows: s.topShows }[L].length;
  more.hidden = state.pro ? total <= 10 : items.length < 10;
  more.querySelector('span').textContent = state.showAll && state.pro ? 'Show the top 10' : 'Show the top 100';
  more.querySelector('.eh-lock').style.display = state.pro ? 'none' : '';
}

$('tops-tabs').addEventListener('click', e => {
  const b = e.target.closest('[role=tab]');
  if (!b) return;
  selectTab(b);
});
$('tops-tabs').addEventListener('keydown', e => {
  if (!['ArrowLeft', 'ArrowRight', 'Home', 'End'].includes(e.key)) return;
  const tabs = [...$('tops-tabs').querySelectorAll('[role=tab]')];
  let i = tabs.indexOf(document.activeElement);
  if (i < 0) return;
  e.preventDefault();
  i = e.key === 'Home' ? 0 : e.key === 'End' ? tabs.length - 1 : (i + (e.key === 'ArrowRight' ? 1 : -1) + tabs.length) % tabs.length;
  selectTab(tabs[i]);
  tabs[i].focus();
});
function selectTab(b) {
  $('tops-tabs').querySelectorAll('[role=tab]').forEach(t => { const on = t === b; t.setAttribute('aria-selected', String(on)); t.tabIndex = on ? 0 : -1; });
  $('tops-list').setAttribute('aria-labelledby', b.id);
  state.list = b.dataset.list;
  if (state.stats) renderList();
}
$('btn-more').addEventListener('click', () => {
  if (!needPro('The top 100 lists are part of Pro.')) return;
  state.showAll = !state.showAll;
  renderList();
});

function bars(el, values, labels, longLabels) {
  const max = Math.max(1, ...values);
  const top = values.indexOf(Math.max(...values));
  el.setAttribute('role', 'list');
  el.innerHTML = values.map((v, i) => `<div class="col${i === top && v > 0 ? ' top' : ''}" role="listitem" aria-label="${esc(longLabels[i])}: ${num(mins(v))} minutes" title="${esc(longLabels[i])}: ${num(mins(v))} minutes"><span style="height:${((v / max) * 100).toFixed(1)}%"></span><b aria-hidden="true">${esc(labels[i])}</b></div>`).join('');
}
function renderWhen(s) {
  const hm = s.hours.map(v => v / 60000);
  $('clock').innerHTML = recordSvg(hm, { size: 400, title: 'Listening by hour of the day, midnight at the top, clockwise', id: 'res-rec' });
  const peak = s.hours.indexOf(Math.max(...s.hours));
  const pad = h => String(h).padStart(2, '0');
  $('clock-note').textContent = s.plays ? `Your busiest hour is ${pad(peak)}:00 to ${pad((peak + 1) % 24)}:00, with ${num(mins(s.hours[peak]))} minutes.` : '';
  bars($('bars-week'), s.weekdays, WD, WD_LONG);
  if (s.months) {
    $('bars-time-h').textContent = 'By month';
    $('bars-time').className = 'eh-bars eh-bars-wide';
    bars($('bars-time'), s.months, MON, MON_LONG);
  } else {
    $('bars-time-h').textContent = 'By year';
    const ys = s.years.slice(-12);
    $('bars-time').className = 'eh-bars eh-bars-wide';
    $('bars-time').style.gridTemplateColumns = `repeat(${Math.max(ys.length, 1)}, minmax(0, 1fr))`;
    bars($('bars-time'), ys.map(y => y.ms), ys.map(y => `'${String(y.year).slice(2)}`), ys.map(y => String(y.year)));
    return;
  }
  $('bars-time').style.gridTemplateColumns = '';
}

function renderFacts(s) {
  const rows = [];
  if (s.longestStreak) rows.push(['Longest streak', `<span class="big">${num(s.longestStreak.days)} ${s.longestStreak.days === 1 ? 'day' : 'days'}</span> in a row, ${esc(longDate(s.longestStreak.from))} to ${esc(longDate(s.longestStreak.to))}`]);
  if (s.biggestDay) rows.push(['Biggest day', `<span class="big">${num(mins(s.biggestDay.ms))} minutes</span> on ${esc(longDate(s.biggestDay.day))}`]);
  rows.push(['Days with at least a minute of listening', num(s.activeDays)]);
  if (s.skips.of) rows.push(s.skips.info
    ? ['Skips', `${Math.round(s.skips.rate * 100)}% of songs skipped (${num(s.skips.count)} of ${num(s.skips.of)})${s.skips.most ? `. Most skipped: ${esc(s.skips.most.name)} by ${esc(s.skips.most.artist)}, ${num(s.skips.most.count)} times` : ''}`]
    : ['Short plays', `${Math.round(s.skips.rate * 100)}% of songs stopped before 30 seconds (${num(s.skips.count)} of ${num(s.skips.of)}). Account data has no skip field; the Extended streaming history does.`]);
  if (s.firstSong) rows.push([state.year === 'all' ? 'First song in your file' : `First song of ${state.year}`, `${esc(s.firstSong.name)} by ${esc(s.firstSong.artist)}`]);
  if (s.night.ms >= 60000) rows.push(['Between midnight and 5 am', `${num(mins(s.night.ms))} minutes${s.night.topArtist ? `, mostly ${esc(s.night.topArtist.name)}` : ''}`]);
  rows.push(['Different artists and songs', `${num(s.distinctArtists)} artists, ${num(s.distinctTracks)} songs`]);
  $('facts').innerHTML = rows.map(([k, v]) => `<div><dt>${esc(k)}</dt><dd>${v}</dd></div>`).join('');
  const show = !!s.monthlyTop;
  $('monthly-h').hidden = !show;
  $('monthly').hidden = !show;
  if (show) $('monthly').innerHTML = s.monthlyTop.map((t, i) => t ? `<li><b>${MON[i]}</b><span>${esc(t.name)}</span></li>` : '').join('');
}

/* ---------- cards ---------- */
function cardAvailable(c) {
  if (c.needs === 'compare') return state.meta && state.meta.years.length > 1;
  if (c.needs === 'alltime') return state.meta && state.meta.years.length > 0;
  return true;
}
function renderCardPicks() {
  const box = $('card-picks');
  const lock = '<svg class="eh-lock" viewBox="0 0 20 20" aria-hidden="true" focusable="false"><path d="M6 9V6.5a4 4 0 0 1 8 0V9" fill="none" stroke="currentColor" stroke-width="1.8"/><rect x="4" y="9" width="12" height="8.5" rx="2" fill="currentColor"/></svg>';
  if (!CARD_TYPES.some(c => c.id === state.card && cardAvailable(c))) state.card = 'summary';
  box.innerHTML = CARD_TYPES.map(c => {
    const locked = !c.free && !state.pro;
    const off = !cardAvailable(c);
    const on = c.id === state.card;
    return `<button type="button" role="radio" aria-checked="${on}" tabindex="${on ? 0 : -1}" data-card="${c.id}"${locked ? ' data-locked' : ''}${off ? ' disabled' : ''}>${locked ? lock : ''}<span>${esc(c.name)}</span>${locked ? '<span class="sr-only"> (Pro)</span>' : ''}</button>`;
  }).join('');
}
$('card-picks').addEventListener('click', e => {
  const b = e.target.closest('button[data-card]');
  if (!b || b.disabled) return;
  const c = CARD_TYPES.find(x => x.id === b.dataset.card);
  if (!c.free && !needPro(`The ${c.name.toLowerCase()} card is part of Pro.`)) return;
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
  const running = y !== 'all' && y === new Date(todayInTz() * DAY).getUTCFullYear();
  return { year: y, running, stats: state.stats, compare: state.compare, alltime: state.alltime };
}
async function fontsReady() {
  try { await Promise.all([document.fonts.load('80px "Earhours Display"'), document.fonts.load('600 40px "Earhours Text"'), document.fonts.load('400 40px "Earhours Text"')]); } catch (e) { /* draw with the fallback */ }
}
async function drawCurrentCard() {
  if (!state.stats) return;
  await fontsReady();
  const c = CARD_TYPES.find(x => x.id === state.card);
  if (!c.free && !state.pro) state.card = 'summary';
  drawCard($('card-canvas'), state.card, cardData());
  $('card-canvas').setAttribute('aria-label', `Preview of the ${CARD_TYPES.find(x => x.id === state.card).name.toLowerCase()} card`);
  $('card-note').textContent = state.sample ? 'This card shows the made-up sample. Open your own file for yours.' : '';
}
function cardBlob() { return new Promise(res => $('card-canvas').toBlob(b => res(b), 'image/png')); }
$('btn-save-card').addEventListener('click', async () => {
  if (!state.stats) return;
  await drawCurrentCard();
  const blob = await cardBlob();
  if (!blob) return;
  window.PeakUI.download(blob, cardFileName(state.card, cardData()));
  window.PeakUI.toast('Card saved');
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
  const blob = await cardBlob();
  if (!blob) return;
  const file = new File([blob], cardFileName(state.card, cardData()), { type: 'image/png' });
  try { await navigator.share({ files: [file] }); } catch (e) { /* closed the share sheet */ }
});

/* ---------- year against year ---------- */
function renderCompare() {
  const box = $('compare-body');
  const multi = state.meta && state.meta.years.length > 1;
  if (!multi) {
    box.innerHTML = `<div class="eh-locked-note"><p>Your file covers one year. Open the Extended streaming history to compare every year since you joined: it is the second option on Spotify's Privacy page.</p></div>`;
    return;
  }
  if (!state.pro) {
    box.innerHTML = `<div class="eh-locked-note"><p>Your file covers ${state.meta.years.length} years. Year against year lists each one with its minutes, the change from the year before, its top artist and top song, and how many artists you heard for the first time. It is part of Pro.</p><button type="button" class="btn btn-sm" id="btn-compare-pro">See what Pro includes</button></div>`;
    $('btn-compare-pro').addEventListener('click', () => needPro('Year against year is part of Pro.'));
    return;
  }
  const c = state.compare;
  if (!c) { box.innerHTML = '<p class="eh-empty">Working it out</p>'; return; }
  const rows = c.slice().reverse().map((e, i, arr) => {
    const prev = arr[i + 1];
    const ch = prev && prev.ms ? Math.round(((e.ms - prev.ms) / prev.ms) * 100) : null;
    return `<tr><th scope="row">${e.year}</th><td class="num">${num(mins(e.ms))}</td><td class="num">${ch === null ? '' : (ch > 0 ? '+' : '') + ch + '%'}</td><td>${esc(e.topArtist || '')}</td><td>${e.topTrack ? `${esc(e.topTrack.name)}, ${esc(e.topTrack.artist)}` : ''}</td><td class="num">${e.newArtists === null ? '' : num(e.newArtists)}</td></tr>`;
  }).join('');
  box.innerHTML = `<div class="eh-compare-scroll"><table><caption>Minutes and favourites by year, newest first. New artists are those with their first play of 30 seconds or more in that year.</caption><thead><tr><th scope="col">Year</th><th scope="col" class="num">Minutes</th><th scope="col" class="num">Change</th><th scope="col">Top artist</th><th scope="col">Top song</th><th scope="col" class="num">New artists</th></tr></thead><tbody>${rows}</tbody></table></div>`;
}

/* ---------- CSV and what was read ---------- */
$('btn-csv').addEventListener('click', () => {
  if (!state.stats || !needPro('The CSV export is part of Pro.')) return;
  const label = state.year === 'all' ? 'all time' : String(state.year);
  const blob = new Blob([statsToCsv(state.stats, label)], { type: 'text/csv;charset=utf-8' });
  window.PeakUI.download(blob, `earhours-${state.year === 'all' ? 'all-time' : state.year}.csv`);
  window.PeakUI.toast('CSV saved');
});

function renderFiles() {
  const meta = state.meta;
  if (!meta) return;
  const li = meta.files.map(f => `<li>${esc(f.name)}: ${f.format === 'empty' ? 'empty' : `${num(f.rows)} rows, ${f.format === 'extended' ? 'Extended streaming history' : 'Account data'}`}</li>`);
  const c = meta.counts;
  const notes = [];
  if (c.dup) notes.push(`${num(c.dup)} plays appeared twice (the same file added again) and were counted once.`);
  if (c.overlap) notes.push(`${num(c.overlap)} Account data plays were already in the extended history and were counted once.`);
  if (c.noName) notes.push(`${num(c.noName)} plays have no song or episode name in the file (often local files); their minutes are in the total but not in the top lists.`);
  if (c.bad) notes.push(`${num(c.bad)} rows had no usable time or length and were left out.`);
  problemList(meta).forEach(p => notes.push(p));
  $('files-read').innerHTML = `<ul>${li.join('')}</ul>${notes.length ? `<ul>${notes.map(n => `<li>${esc(n)}</li>`).join('')}</ul>` : ''}`;
}

/* ---------- file picking ---------- */
const input = $('file-input');
let addMode = false;
$('btn-choose').addEventListener('click', () => { addMode = false; input.click(); });
$('btn-retry').addEventListener('click', () => { addMode = false; input.click(); });
$('btn-add').addEventListener('click', () => { addMode = true; input.click(); });
input.addEventListener('change', () => { const files = [...input.files]; input.value = ''; if (files.length) start(files, { add: addMode }); });
$('btn-sample').addEventListener('click', startSample);
$('btn-error-sample').addEventListener('click', startSample);
$('btn-reset').addEventListener('click', () => {
  if (worker) worker.postMessage({ type: 'reset' });
  Object.assign(state, { meta: null, stats: null, compare: null, alltime: null, year: null, showAll: false, sample: false });
  $('results').hidden = true;
  stage('idle');
  focusEl($('drop-title'));
});
$('btn-see').addEventListener('click', e => { e.preventDefault(); $('results').scrollIntoView({ behavior: reduceMotion() ? 'auto' : 'smooth' }); focusEl($('results')); });

// drag and drop: files, or a folder (the unzipped download)
const drop = $('drop');
['dragenter', 'dragover'].forEach(ev => drop.addEventListener(ev, e => { e.preventDefault(); drop.classList.add('is-over'); }));
['dragleave', 'drop'].forEach(ev => drop.addEventListener(ev, e => { e.preventDefault(); drop.classList.remove('is-over'); }));
drop.addEventListener('drop', async e => {
  const files = await filesFromDrop(e.dataTransfer);
  if (files.length) start(files, { add: false });
});
async function filesFromDrop(dt) {
  const items = dt.items ? [...dt.items] : [];
  const entries = items.map(i => (i.webkitGetAsEntry ? i.webkitGetAsEntry() : null)).filter(Boolean);
  if (!entries.length) return [...(dt.files || [])];
  const out = [];
  const walk = async (entry, depth) => {
    if (entry.isFile) { const f = await new Promise((res) => entry.file(res, () => res(null))); if (f) out.push(f); return; }
    if (entry.isDirectory && depth < 4) {
      const reader = entry.createReader();
      for (;;) {
        const batch = await new Promise((res) => reader.readEntries(res, () => res([])));
        if (!batch.length) break;
        for (const ch of batch) await walk(ch, depth + 1);
      }
    }
  };
  for (const en of entries) await walk(en, 0);
  return out.filter(f => /\.(zip|json)$/i.test(f.name));
}

/* ---------- the request date line ---------- */
(function requestDate() {
  const by = new Date(Date.now() + 30 * DAY);
  const el = $('request-date');
  if (el) el.textContent = `Ask today and even the slower download should arrive by ${by.getDate()} ${MON_LONG[by.getMonth()]}.`;
})();

setupLicense();
