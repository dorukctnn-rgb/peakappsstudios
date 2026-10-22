/* Dayfold page logic (English, Spanish, Portuguese and German pages). The backup goes to the worker (worker.js) in this
 * tab; the page only shows what the worker works out. The one network request the page itself can make is the Pro
 * license check, to Gumroad, when you paste a key. Your journal is never uploaded and the backup is never changed. */
import { strings, fill, LOCALE } from './i18n.js';
import { MOOD, MOOD_INK, drawPoster, PW, PH } from './poster.js';
import { PdfWriter, PAPER } from './pdfmini.js';
import { makeBook } from './book.js';

// ---- Gumroad Pro product, permalink dayfold-pro. The license check sends this product id, never the permalink.
// Fail closed: while this is 'PENDING' (or empty) Pro never turns on, whatever the browser has stored.
const DAYFOLD_PRO_PRODUCT_ID = '2VWv8VhUwEBdNtxCeieIhQ==';
const DAYFOLD_PRO_URL = 'https://dorukctn.gumroad.com/l/dayfold-pro';
const PRO_READY = !!DAYFOLD_PRO_PRODUCT_ID && DAYFOLD_PRO_PRODUCT_ID !== 'PENDING';

const LANG = ((document.documentElement.lang || 'en').slice(0, 2)).toLowerCase();
const T = strings(LANG);
const LOC = LOCALE[LANG] || 'en-GB';
const $ = id => document.getElementById(id);
const esc = s => String(s == null ? '' : s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
// the worker sends notes as HTML with only b, i, u and s in them; anything else is shown as text, whatever happens
const safeNote = h => String(h || '').replace(/<(?!\/?(?:b|i|u|s)>)/g, '&lt;');
const nf = new Intl.NumberFormat(LOC);
const nf1 = new Intl.NumberFormat(LOC, { minimumFractionDigits: 1, maximumFractionDigits: 1 });
const fDay = new Intl.DateTimeFormat(LOC, { weekday: 'long', day: 'numeric', month: 'long', timeZone: 'UTC' });
const fDate = new Intl.DateTimeFormat(LOC, { day: 'numeric', month: 'long', year: 'numeric', timeZone: 'UTC' });
const fDateShort = new Intl.DateTimeFormat(LOC, { day: 'numeric', month: 'short', year: 'numeric', timeZone: 'UTC' });
const fMonth = new Intl.DateTimeFormat(LOC, { month: 'long', year: 'numeric', timeZone: 'UTC' });
const fDayMonth = new Intl.DateTimeFormat(LOC, { day: 'numeric', month: 'short', timeZone: 'UTC' });
const fMonthName = new Intl.DateTimeFormat(LOC, { month: 'long', timeZone: 'UTC' });
const fMonthShort = new Intl.DateTimeFormat(LOC, { month: 'short', timeZone: 'UTC' });
const fMonthLetter = new Intl.DateTimeFormat(LOC, { month: 'narrow', timeZone: 'UTC' });
const fWeekShort = new Intl.DateTimeFormat(LOC, { weekday: 'short', timeZone: 'UTC' });
const dateOf = key => { const [y, m, d] = key.split('-').map(Number); return new Date(Date.UTC(y, m - 1, d)); };
const reduceMotion = () => window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
const LOCK = '<svg class="df-lock" viewBox="0 0 20 20" aria-hidden="true" focusable="false"><path d="M6 9V6.5a4 4 0 0 1 8 0V9" fill="none" stroke="currentColor" stroke-width="1.8"/><rect x="4" y="9" width="12" height="8.5" rx="2" fill="currentColor"/></svg>';
// the first day of the week where the reader is: Sunday in the US and Brazil, Monday in most of Europe
const firstDay = (() => {
  try { const wi = new Intl.Locale(navigator.language || LOC).weekInfo || new Intl.Locale(navigator.language || LOC).getWeekInfo(); if (wi && wi.firstDay) return wi.firstDay % 7; } catch (e) { /* older browsers */ }
  return /^(en-US|pt-BR|en-CA|ja|he)/.test(navigator.language || '') || LANG === 'pt' ? 0 : 1;
})();

const state = { meta: null, pro: false, years: [], free: [], year: null, view: 'journal', month: null, day: null, q: '', lastView: 'journal', urls: [], moodById: new Map(), tagById: new Map(), groupById: new Map(), summary: null, posterYear: null };
let worker = null, seq = 0;
const waiting = new Map();

/* ---------- license ---------- */
function setupLicense() {
  if (!window.PeakLicense) return;
  const L = LANG === 'en' ? {} : {
    strings: {
      es: { title: 'Obtener Pro', buy: 'Comprar Pro en Gumroad', keyLabel: '¿Ya lo compraste? Pega tu clave de licencia', verify: 'Activar', close: 'Cerrar', checking: 'Comprobando con Gumroad…', badKey: 'Eso no parece una clave de licencia. Está en el correo de compra de Gumroad.', network: 'No se pudo contactar con Gumroad. Revisa la conexión y vuelve a intentarlo.', ok: 'Pro está activo en este navegador. Gracias.', refunded: 'Esta compra se reembolsó o terminó, así que Pro está desactivado.', rejected: 'Esa clave de licencia no se aceptó.', active: 'Pro está activo en este navegador.' },
      pt: { title: 'Obter o Pro', buy: 'Comprar o Pro no Gumroad', keyLabel: 'Já comprou? Cole sua chave de licença', verify: 'Ativar', close: 'Fechar', checking: 'Verificando com o Gumroad…', badKey: 'Isso não parece uma chave de licença. Ela está no e-mail de compra do Gumroad.', network: 'Não foi possível falar com o Gumroad. Verifique a conexão e tente de novo.', ok: 'O Pro está ativo neste navegador. Obrigado.', refunded: 'Esta compra foi reembolsada ou terminou, então o Pro está desligado.', rejected: 'Essa chave de licença não foi aceita.', active: 'O Pro está ativo neste navegador.' },
      de: { title: 'Pro holen', buy: 'Pro bei Gumroad kaufen', keyLabel: 'Schon gekauft? Füge deinen Lizenzschlüssel ein', verify: 'Aktivieren', close: 'Schließen', checking: 'Wird bei Gumroad geprüft…', badKey: 'Das sieht nicht wie ein Lizenzschlüssel aus. Er steht in deiner Kaufbestätigung von Gumroad.', network: 'Gumroad war nicht erreichbar. Prüfe die Verbindung und versuche es noch einmal.', ok: 'Pro ist in diesem Browser aktiv. Danke.', refunded: 'Dieser Kauf wurde erstattet oder ist beendet, Pro ist aus.', rejected: 'Dieser Lizenzschlüssel wurde nicht angenommen.', active: 'Pro ist in diesem Browser aktiv.' },
    }[LANG],
    localMessages: true,
  };
  window.PeakLicense.setup(Object.assign({ tool: 'dayfold', productId: PRO_READY ? DAYFOLD_PRO_PRODUCT_ID : 'PENDING', permalink: 'dayfold-pro', buyUrl: DAYFOLD_PRO_URL, pitch: T.pitch }, L));
  window.PeakLicense.onChange(isPro => {
    const was = state.pro;
    state.pro = PRO_READY && !!isPro;
    $('pro-state').textContent = state.pro ? T.proActive : T.proOff;
    document.body.classList.toggle('df-is-pro', state.pro);
    if (was !== state.pro && state.meta && state.meta.count) { renderYears(); refresh(); }
  });
}
const needPro = reason => (state.pro ? true : (window.PeakLicense ? window.PeakLicense.requirePro(reason) : false));

/* ---------- the worker ---------- */
function getWorker() {
  if (worker) return worker;
  try { worker = new Worker(new URL('./worker.js', import.meta.url), { type: 'module' }); } catch (e) { worker = null; return null; }
  worker.onmessage = onWorker;
  worker.onerror = e => { if (e.preventDefault) e.preventDefault(); fail('noworker'); };
  return worker;
}
function call(type, data = {}, onProgress, full = false, transfer) {
  const w = getWorker();
  if (!w) return Promise.reject(new Error('noworker'));
  const id = ++seq;
  return new Promise((resolve, reject) => { waiting.set(id, { resolve, reject, onProgress, full }); w.postMessage(Object.assign({ type, id }, data), transfer || []); });
}
function onWorker(ev) {
  const m = ev.data || {};
  if (m.type === 'progress' && m.id == null) { setBar(m.p); $('busy-sub').textContent = { reading: T.stepReading, decoding: T.stepDecoding, entries: T.stepEntries }[m.step] || ''; return; }
  if (m.type === 'opened') { loaded(m.meta); return; }
  const w = m.id != null && waiting.get(m.id);
  if (m.type === 'progress' && w) { if (w.onProgress) w.onProgress(m); return; }
  if (m.type === 'error' && (m.during === 'open' || m.during === 'sample')) { fail(m.code, m.detail); return; }
  if (!w) return;
  waiting.delete(m.id);
  if (m.type === 'error') w.reject(Object.assign(new Error(m.detail || m.code), { code: m.code })); else w.resolve(w.full ? m : (m.blob || m.data));
}

/* ---------- opening a backup ---------- */
function stage(name) {
  ['idle', 'busy', 'error', 'done'].forEach(s => { $('stage-' + s).hidden = s !== name; });
  $('panel').dataset.state = name;
}
const focusEl = el => { if (el) el.focus({ preventScroll: true }); };
function setBar(p) {
  const v = Math.max(0, Math.min(100, Math.round(p || 0)));
  $('busy-bar').setAttribute('aria-valuenow', String(v));
  $('busy-bar').firstElementChild.style.width = v + '%';
}
function fail(code, detail) {
  const [title, text] = T.errors[code] || T.errors.internal;
  $('error-title').textContent = title;
  $('error-text').textContent = fill(text, { detail: detail || code });
  stage('error');
  focusEl($('error-title'));
}
function openFile(file) {
  if (!file) return;
  const w = getWorker();
  if (!w) return fail('noworker');
  resetResults();
  $('busy-title').textContent = fill(T.reading, { name: file.name || 'backup' });
  $('busy-sub').textContent = T.stepReading;
  setBar(4);
  stage('busy');
  focusEl($('busy-title'));
  w.postMessage({ type: 'open', file, lang: LANG });
}
function openSample() {
  const w = getWorker();
  if (!w) return fail('noworker');
  resetResults();
  $('busy-title').textContent = T.readingSample;
  $('busy-sub').textContent = T.stepEntries;
  setBar(50);
  stage('busy');
  w.postMessage({ type: 'sample', lang: LANG });
}
function resetResults() {
  for (const u of state.urls) URL.revokeObjectURL(u);
  state.urls = [];
  state.meta = null;
  $('journal').hidden = true;
}

function loaded(meta) {
  state.meta = meta;
  state.moodById = new Map(meta.moods.map(m => [m.id, m]));
  state.tagById = new Map(meta.tags.map(t => [t.id, t]));
  state.groupById = new Map(meta.groups.map(g => [g.id, g]));
  setBar(100);
  if (!meta.count) {
    $('done-title').textContent = T.emptyTitle;
    $('done-sub').textContent = T.emptyText;
    $('btn-see').hidden = true;
    stage('done');
    focusEl($('done-title'));
    return;
  }
  state.years = meta.years.map(r => r.y);
  state.free = freeYears(state.years);
  state.year = state.free[state.free.length - 1];
  state.month = null; state.day = null; state.q = ''; $('q').value = '';
  const from = fDateShort.format(dateOf(meta.first)), to = fDateShort.format(dateOf(meta.last));
  $('done-title').textContent = meta.count === 1 ? fill(T.doneTitleOne, { from }) : fill(T.doneTitle, { n: nf.format(meta.count), from, to });
  const photos = !meta.photos ? T.photosNone : meta.photosFound < meta.photos ? fill(T.photosMissing, { n: nf.format(meta.photosFound), m: nf.format(meta.photos) }) : meta.photos === 1 ? T.photosOne : fill(T.photosLine, { n: nf.format(meta.photos) });
  $('done-sub').textContent = meta.sample ? T.doneSample : fill(T.doneSub, { name: meta.name || 'backup', photos });
  $('btn-see').hidden = false;
  stage('done');
  $('journal').hidden = false;
  renderYears();
  fillSaveOptions();
  setView('journal', false);
  refresh();
  focusEl($('done-title'));
}
// the years the free version shows (stats.js freeYears, kept here so the page does not load the stats module)
function freeYears(years, now = new Date()) {
  if (!years.length) return [];
  const last = Math.max(...years);
  const out = [last];
  if (now.getMonth() < 2 && last === now.getFullYear() && years.includes(last - 1)) out.push(last - 1);
  return out.sort((a, b) => a - b);
}
const allowed = y => state.pro || state.free.includes(y);
const shownYears = () => (state.year === 'all' ? state.years.filter(allowed) : [state.year]);
const rangeLabel = ys => (ys.length > 1 ? `${ys[0]}\u2013${ys[ys.length - 1]}` : String(ys[0]));

/* ---------- year chips and tabs ---------- */
function renderYears() {
  const box = $('years');
  const chips = state.years.map(y => `<button type="button" data-year="${y}" aria-pressed="${state.year === y}"${allowed(y) ? '' : ' class="is-locked"'}>${y}${allowed(y) ? '' : LOCK}</button>`);
  if (state.years.length > 1) chips.push(`<button type="button" data-year="all" aria-pressed="${state.year === 'all'}"${state.pro ? '' : ' class="is-locked"'}>${esc(T.yearsAll)}${state.pro ? '' : LOCK}</button>`);
  box.innerHTML = chips.join('');
  const m = state.meta;
  const cov = fill(T.coverage, { entries: nf.format(m.count), days: nf.format(m.years.reduce((a, r) => a + r.days, 0)), range: rangeLabel(state.years) });
  $('coverage').textContent = state.pro || state.years.length === state.free.length ? cov : `${cov} ${fill(T.coverageFree, { years: state.free.join(', ') })}`;
}
function pickYear(v) {
  const y = v === 'all' ? 'all' : Number(v);
  if (y === 'all' ? !state.pro : !allowed(y)) { needPro(T.needYears); return; }
  state.year = y; state.month = null; state.day = null;
  renderYears();
  refresh();
}
function setView(v, focus = true) {
  state.view = v;
  if (v !== 'search') state.lastView = v;
  document.querySelectorAll('[role=tab]').forEach(t => { const on = t.dataset.view === v; t.setAttribute('aria-selected', String(on)); t.tabIndex = on ? 0 : -1; });
  ['journal', 'pixels', 'moods', 'acts', 'save', 'search'].forEach(n => { $('view-' + n).hidden = n !== v; });
  if (focus && v !== 'search') focusEl(document.querySelector(`[role=tab][data-view="${v}"]`));
}
async function refresh() {
  if (!state.meta || !state.meta.count) return;
  const ys = shownYears();
  state.summary = await call('summary', { years: ys });
  renderStats();
  if (state.view === 'journal') await renderJournal();
  if (state.view === 'pixels') await renderPixels();
  if (state.view === 'moods') await renderMoods();
  if (state.view === 'acts') await renderActs();
  if (state.view === 'save') renderPosterPreview();
  if (state.view === 'search') await runSearch();
}

/* ---------- journal: calendar and entries ---------- */
function renderStats() {
  const s = state.summary;
  const items = [
    [T.statEntries, nf.format(s.entries)], [T.statDays, nf.format(s.days)],
    [T.statAvg, s.avg == null ? '' : fill(T.avgOf, { v: nf1.format(s.avg) })],
    [T.statStreak, s.streak.days === 1 ? T.streakDay : fill(T.streakDays, { n: nf.format(s.streak.days) })],
    [T.statPhotos, nf.format(s.photos)], [T.statWords, nf.format(s.words)],
  ];
  $('ystats').innerHTML = items.map(([k, v]) => `<div><dt>${esc(k)}</dt><dd>${esc(v)}</dd></div>`).join('');
}
function monthsAvailable() {
  const ys = shownYears();
  const list = [];
  for (const y of ys) for (let m = 0; m < 12; m++) list.push({ y, m });
  return list;
}
function defaultMonth() {
  const last = state.meta.last.split('-').map(Number);
  const ys = shownYears();
  if (ys.includes(last[0])) return { y: last[0], m: last[1] - 1 };
  // the last month with entries in the shown year
  const s = state.summary;
  let m = 11;
  while (m > 0 && !s.months[m].n) m--;
  return { y: ys[ys.length - 1], m };
}
async function renderJournal() {
  if (!state.month || !shownYears().includes(state.month.y)) state.month = defaultMonth();
  const { y, m } = state.month;
  const list = monthsAvailable();
  const at = list.findIndex(x => x.y === y && x.m === m);
  $('cal-prev').disabled = at <= 0; $('cal-next').disabled = at >= list.length - 1;
  $('cal-title').textContent = fMonth.format(new Date(Date.UTC(y, m, 1)));
  const data = await call('month', { y, m });
  if (!state.month || state.month.y !== y || state.month.m !== m) return;
  drawCalendar(y, m, data.days);
  drawEntries(data.entries, $('entries'), fill(T.noEntriesMonth, { month: fMonth.format(new Date(Date.UTC(y, m, 1))) }));
}
function drawCalendar(y, m, days) {
  const byDay = new Map(days.map(d => [d.d, d]));
  const len = new Date(Date.UTC(y, m + 1, 0)).getUTCDate();
  const startDow = new Date(Date.UTC(y, m, 1)).getUTCDay();
  const lead = (startDow - firstDay + 7) % 7;
  const head = [];
  for (let i = 0; i < 7; i++) { const dow = (firstDay + i) % 7; head.push(`<th scope="col" abbr="${esc(new Intl.DateTimeFormat(LOC, { weekday: 'long', timeZone: 'UTC' }).format(new Date(Date.UTC(2023, 0, 1 + dow))))}">${esc(fWeekShort.format(new Date(Date.UTC(2023, 0, 1 + dow))))}</th>`); }
  const cells = [];
  for (let i = 0; i < lead; i++) cells.push('<td></td>');
  for (let d = 1; d <= len; d++) {
    const x = byDay.get(d);
    const label = fDate.format(new Date(Date.UTC(y, m, d)));
    if (!x) { cells.push(`<td><span class="df-day">${d}</span></td>`); continue; }
    const mood = x.level ? T.moodNames[5 - x.level] : '';
    const sel = state.day === d ? ' aria-pressed="true"' : ' aria-pressed="false"';
    cells.push(`<td><button type="button" class="df-day is-on" data-day="${d}" data-level="${x.level || 0}"${sel} style="--c:${x.level ? MOOD[x.level] : 'var(--line)'};--ci:${x.level ? MOOD_INK[x.level] : 'var(--ink)'}" aria-label="${esc(`${label}: ${x.n === 1 ? T.dayOne : fill(T.dayCount, { n: x.n })}${mood ? `, ${mood}` : ''}`)}">${d}${x.n > 1 ? '<i aria-hidden="true"></i>' : ''}</button></td>`);
  }
  while (cells.length % 7) cells.push('<td></td>');
  const rows = [];
  for (let i = 0; i < cells.length; i += 7) rows.push(`<tr>${cells.slice(i, i + 7).join('')}</tr>`);
  $('cal').innerHTML = `<caption class="sr-only">${esc(fMonth.format(new Date(Date.UTC(y, m, 1))))}</caption><thead><tr>${head.join('')}</tr></thead><tbody>${rows.join('')}</tbody>`;
}
function moodLabel(id) { const md = state.moodById.get(id); return md ? (md.name || T.moodNames[(md.pre || md.group) - 1]) : ''; }
function entryHtml(e, withYear) {
  const date = withYear ? fDate.format(new Date(Date.UTC(e.y, e.m, e.d))) : fDay.format(new Date(Date.UTC(e.y, e.m, e.d)));
  const acts = e.tags.map(t => state.tagById.get(t)).filter(Boolean).map(t => esc(t.name)).join(', ');
  const photos = e.assets.filter(a => a.type === 'photo'), voice = e.assets.filter(a => a.type === 'audio');
  const media = photos.map(a => (a.found ? `<button type="button" class="df-photo" data-asset="${a.id}" aria-label="${esc(date)}"><img alt="" data-asset="${a.id}" width="160" height="120"></button>` : `<p class="df-photo-missing">${esc(T.photoMissing)}</p>`)).join('')
    + voice.map(a => (a.found ? `<button type="button" class="btn btn-sm df-voice" data-voice="${a.id}">${esc(T.voiceNote)}</button>` : '')).join('');
  return `<article class="df-entry" data-key="${e.key}" style="--m:${e.score ? MOOD[e.score] : 'var(--line-2)'}">
<header class="df-entry-head"><h4>${esc(date)}</h4><span class="df-time">${String(e.h).padStart(2, '0')}:${String(e.mi).padStart(2, '0')}</span>${e.mood != null ? `<span class="df-mood"><i aria-hidden="true"></i>${esc(moodLabel(e.mood))}</span>` : ''}</header>
${acts ? `<p class="df-acts">${acts}</p>` : ''}${e.title ? `<h5 class="df-title">${esc(e.title)}</h5>` : ''}${e.html ? `<div class="df-note">${safeNote(e.html)}</div>` : ''}${media ? `<div class="df-media">${media}</div>` : ''}
</article>`;
}
function drawEntries(list, box, emptyText, withYear = false) {
  let shown = list;
  let note = '';
  if (state.day && box === $('entries')) {
    shown = list.filter(e => e.d === state.day);
    note = `<p class="df-dayfilter">${esc(fill(T.showDay, { date: fDate.format(new Date(Date.UTC(state.month.y, state.month.m, state.day))) }))} <button type="button" class="df-link" id="show-month">${esc(T.showMonth)}</button></p>`;
  }
  box.innerHTML = shown.length ? note + shown.map(e => entryHtml(e, withYear)).join('') : `<p class="df-empty">${esc(emptyText)}</p>`;
  observePhotos(box);
}
const io = 'IntersectionObserver' in window ? new IntersectionObserver(entries => {
  for (const en of entries) if (en.isIntersecting) { io.unobserve(en.target); loadThumb(en.target); }
}, { rootMargin: '400px' }) : null;
function observePhotos(box) { box.querySelectorAll('img[data-asset]').forEach(img => (io ? io.observe(img) : loadThumb(img))); }
async function loadThumb(img) {
  const id = Number(img.dataset.asset);
  try {
    const p = await call('photo', { asset: id, max: 480 });
    if (!p) return;
    if (!/^image\/(jpeg|png|webp|gif|avif)$/.test(p.mime)) {
      const btn = img.closest('button');
      if (btn) btn.outerHTML = `<p class="df-photo-missing">${esc(fill(T.photoNoShow, { type: p.mime.split('/')[1].toUpperCase() }))}</p>`;
      return;
    }
    const url = URL.createObjectURL(new Blob([p.bytes], { type: p.mime }));
    state.urls.push(url);
    if (p.w && p.h) { img.width = p.w; img.height = p.h; }
    img.src = url;
  } catch (e) { /* the photo stays empty */ }
}
async function openPhoto(id) {
  const d = $('photo-dialog');
  const img = $('photo-big');
  img.removeAttribute('src');
  if (typeof d.showModal === 'function') d.showModal();
  const p = await call('photo', { asset: id, max: 2000 });
  if (!p) return;
  const url = URL.createObjectURL(new Blob([p.bytes], { type: p.mime }));
  state.urls.push(url);
  img.src = url;
}
async function playVoice(btn) {
  const p = await call('photo', { asset: Number(btn.dataset.voice) });
  if (!p) return;
  const url = URL.createObjectURL(new Blob([p.bytes], { type: p.mime }));
  state.urls.push(url);
  const a = document.createElement('audio');
  a.controls = true; a.src = url; a.className = 'df-audio';
  btn.replaceWith(a);
  a.play().catch(() => {});
}

/* ---------- Year in Pixels ---------- */
async function renderPixels() {
  const ys = shownYears();
  const blocks = [];
  for (const y of ys) blocks.push({ y, grid: await call('pixels', { y }) });
  $('pix-title').textContent = fill(T.pixTitle, { y: rangeLabel(ys) });
  $('pix').innerHTML = blocks.map(b => pixTable(b.y, b.grid, ys.length > 1)).join('');
  $('pix').classList.toggle('is-many', ys.length > 1);
  const dl = state.summary ? state.summary.dayLevels : [];
  const count = n => `<small>${esc(n === 1 ? T.dayOneDay : fill(T.daysN, { n: nf.format(n || 0) }))}</small>`;
  $('legend').innerHTML = [5, 4, 3, 2, 1].map(lv => `<li><i style="background:${MOOD[lv]}" aria-hidden="true"></i><span>${esc(levelNames(lv))}</span>${count(dl[lv])}</li>`).join('') + `<li><i class="is-empty" aria-hidden="true"></i><span>${esc(T.legendNone)}</span></li>`;
}
function levelNames(lv) {
  const own = state.meta.moods.filter(m => m.score === lv && m.state !== 1).map(m => m.name || T.moodNames[(m.pre || m.group) - 1]);
  return [...new Set(own.length ? own : [T.moodNames[5 - lv]])].join(', ');
}
function pixTable(y, grid, small) {
  const head = Array.from({ length: 12 }, (_, m) => `<th scope="col" abbr="${esc(fMonthName.format(new Date(Date.UTC(y, m, 1))))}">${esc(fMonthLetter.format(new Date(Date.UTC(y, m, 1))))}</th>`).join('');
  const rows = [];
  for (let d = 0; d < 31; d++) {
    const cells = [];
    for (let m = 0; m < 12; m++) {
      const v = grid[m][d];
      if (v < 0) { cells.push('<td></td>'); continue; }
      const date = fDate.format(new Date(Date.UTC(y, m, d + 1)));
      const tip = v ? fill(T.pixDay, { date, mood: levelNames(v) }) : fill(T.pixEmpty, { date });
      cells.push(v ? `<td><button type="button" data-goto="${y}-${m}-${d + 1}" style="background:${MOOD[v]}" title="${esc(tip)}" aria-label="${esc(tip)}" tabindex="-1"></button></td>` : `<td><span title="${esc(tip)}"></span></td>`);
    }
    rows.push(`<tr><th scope="row">${(d + 1) % 5 === 0 || d === 0 ? d + 1 : `<span class="sr-only">${d + 1}</span>`}</th>${cells.join('')}</tr>`);
  }
  return `<figure class="df-pixfig${small ? ' is-small' : ''}">${small ? `<figcaption>${y}</figcaption>` : ''}<table class="df-pixgrid"><caption class="sr-only">${esc(fill(T.pixTitle, { y }))}</caption><thead><tr><td></td>${head}</tr></thead><tbody>${rows.join('')}</tbody></table></figure>`;
}

/* ---------- moods ---------- */
async function renderMoods() {
  const s = state.summary;
  // month by month: the share of each mood level, stacked; the average under each month
  const W = 640, H = 230, padL = 6, padB = 44, bw = (W - padL) / 12;
  let bars = '';
  s.months.forEach((M, i) => {
    const total = M.levels.reduce((a, b) => a + b, 0);
    const x = padL + i * bw + bw * 0.14, w = bw * 0.72;
    let yy = H - padB;
    if (total) for (let lv = 1; lv <= 5; lv++) {
      const h = ((H - padB - 8) * M.levels[lv]) / total;
      if (!h) continue;
      yy -= h;
      bars += `<rect x="${x.toFixed(1)}" y="${yy.toFixed(1)}" width="${w.toFixed(1)}" height="${h.toFixed(1)}" fill="${MOOD[lv]}"><title>${esc(`${fMonthName.format(new Date(Date.UTC(2024, i, 1)))}: ${levelNames(lv)} ${nf.format(M.levels[lv])}`)}</title></rect>`;
    } else bars += `<rect x="${x.toFixed(1)}" y="${(H - padB - 2).toFixed(1)}" width="${w.toFixed(1)}" height="2" fill="var(--line-2)"/>`;
    bars += `<text x="${(x + w / 2).toFixed(1)}" y="${H - padB + 18}" text-anchor="middle" class="df-ax">${esc(fMonthShort.format(new Date(Date.UTC(2024, i, 1))))}</text>`;
    if (M.avg != null) bars += `<text x="${(x + w / 2).toFixed(1)}" y="${H - padB + 36}" text-anchor="middle" class="df-ax df-ax-v">${nf1.format(M.avg)}</text>`;
  });
  $('ch-months').innerHTML = `<svg viewBox="0 0 ${W} ${H}" role="img" aria-label="${esc(T.chartMonths)}">${bars}</svg>`;
  // how often each mood (days, by level)
  const totalDays = s.dayLevels.reduce((a, b) => a + b, 0) || 1;
  $('ch-dist').innerHTML = `<ul class="df-dist">${[5, 4, 3, 2, 1].map(lv => {
    const n = s.dayLevels[lv], pct = Math.round((n / totalDays) * 100);
    return `<li><span class="df-dist-name">${esc(levelNames(lv))}</span><span class="df-dist-bar"><i style="width:${(n / totalDays) * 100}%;background:${MOOD[lv]}"></i></span><span class="df-dist-n">${nf.format(n)} <small>${pct}%</small></span></li>`;
  }).join('')}</ul>`;
  // by weekday: the average of the days
  const order = Array.from({ length: 7 }, (_, i) => (firstDay + i) % 7);
  $('ch-week').innerHTML = `<ul class="df-week">${order.map(dow => {
    const w = s.weekdays[dow];
    const pos = w.avg == null ? 0 : ((w.avg - 1) / 4) * 100;
    return `<li><span>${esc(new Intl.DateTimeFormat(LOC, { weekday: 'long', timeZone: 'UTC' }).format(new Date(Date.UTC(2023, 0, 1 + dow))))}</span><span class="df-week-track">${w.avg == null ? '' : `<i style="left:${pos}%;background:${MOOD[Math.round(w.avg)]}"></i>`}</span><span class="df-week-v">${w.avg == null ? '' : nf1.format(w.avg)}</span></li>`;
  }).join('')}</ul>`;
  // every year (Pro): one row per year
  const yb = $('years-block');
  yb.hidden = !(state.year === 'all' && state.pro);
  if (!yb.hidden) {
    const rows = await call('byYear');
    $('ch-years').innerHTML = `<ul class="df-dist df-dist-years">${rows.map(r => {
      const tot = r.dayLevels.reduce((a, b) => a + b, 0) || 1;
      return `<li><span class="df-dist-name">${r.y}</span><span class="df-dist-bar df-stack">${[5, 4, 3, 2, 1].map(lv => `<i style="width:${(r.dayLevels[lv] / tot) * 100}%;background:${MOOD[lv]}"></i>`).join('')}</span><span class="df-dist-n">${r.avg == null ? '' : nf1.format(r.avg)}</span></li>`;
    }).join('')}</ul>`;
  }
}

/* ---------- activities ---------- */
async function renderActs() {
  const ys = shownYears();
  const c = await call('acts', { years: ys });
  if (!c.rows.length) { $('acts-table').innerHTML = `<p class="df-empty">${esc(fill(T.actsEmpty, { years: rangeLabel(ys) }))}</p>`; }
  else {
    const H = T.actsHead;
    const oneYear = ys.length === 1;
    const lastDay = key => (oneYear ? fDayMonth.format(dateOf(key)) : fDateShort.format(dateOf(key)));
    $('acts-table').innerHTML = `<div class="df-table-scroll"><table class="df-table"><thead><tr><th scope="col">${esc(H[0])}</th><th scope="col" class="df-col-group">${esc(H[1])}</th><th scope="col" class="num">${esc(H[2])}</th><th scope="col" class="num">${esc(H[3])}</th><th scope="col">${esc(H[4])}</th></tr></thead><tbody>${c.rows.map(r => {
      const t = state.tagById.get(r.id) || { name: '#' + r.id };
      const g = t.group != null && state.groupById.get(t.group);
      const share = c.totalDays ? Math.round((r.days / c.totalDays) * 100) : 0;
      return `<tr><th scope="row">${esc(t.name)}</th><td class="df-col-group">${esc(g ? g.name : '')}</td><td class="num">${nf.format(r.days)} <small>${share}%</small></td><td class="num">${nf.format(r.entries)}</td><td>${r.last ? esc(lastDay(r.last)) : esc(T.actsNever)}</td></tr>`;
    }).join('')}</tbody></table></div>`;
  }
  const p = await call('actMoods', { years: ys });
  const box = $('patterns');
  if (!p.rows.length) { box.innerHTML = `<p class="df-empty">${esc(fill(T.patNone, { n: p.min, years: rangeLabel(ys) }))}</p>`; return; }
  if (!state.pro) {
    box.innerHTML = `<p>${esc(fill(T.patLocked, { n: nf.format(p.rows.length), years: rangeLabel(ys) }))}</p><ul class="df-pat-locked">${p.rows.slice(0, 12).map(r => `<li>${LOCK}${esc((state.tagById.get(r.id) || {}).name || '')}</li>`).join('')}</ul><button type="button" class="btn btn-pro" id="btn-patterns">${esc(T.patBtn)}</button>`;
    return;
  }
  box.innerHTML = `<p class="df-pat-axis" aria-hidden="true"><span>1</span><span>${esc(T.patAxis)}</span><span>5</span></p><ul class="df-pat">${p.rows.map(r => {
    const name = (state.tagById.get(r.id) || {}).name || '';
    const a = ((r.without - 1) / 4) * 100, b = ((r.with - 1) / 4) * 100;
    const lo = Math.min(a, b), hi = Math.max(a, b);
    return `<li><p class="df-pat-name">${esc(fill(T.patRow, { name, w: nf1.format(r.with), wo: nf1.format(r.without) }))}</p><span class="df-pat-track" aria-hidden="true"><span class="df-pat-span" style="left:${lo}%;width:${hi - lo}%"></span><i class="is-without" style="left:${a}%"></i><i class="is-with" style="left:${b}%;background:${MOOD[Math.round(r.with)]}"></i></span><p class="df-pat-days">${esc(fill(T.patDays, { a: nf.format(r.withDays), b: nf.format(r.withoutDays) }))}</p></li>`;
  }).join('')}</ul>`;
}

/* ---------- search ---------- */
let searchTimer = null;
function onSearchInput() {
  clearTimeout(searchTimer);
  searchTimer = setTimeout(async () => {
    state.q = $('q').value.trim();
    if (!state.q) { setView(state.lastView, false); refresh(); return; }
    if (state.view !== 'search') setView('search', false);
    await runSearch();
  }, 220);
}
async function runSearch() {
  const q = state.q;
  const box = $('search-list');
  if (q.length < 2) { $('search-title').textContent = T.searchShort; $('search-more').textContent = ''; box.innerHTML = ''; return; }
  const ys = shownYears();
  const r = await call('search', { q, years: ys });
  if (q !== state.q) return;
  $('search-title').textContent = r.total === 0 ? fill(T.searchNone, { q, years: rangeLabel(ys) }) : r.total === 1 ? fill(T.searchOne, { q }) : fill(T.searchCount, { n: nf.format(r.total), q });
  const others = Object.keys(r.elsewhere).map(Number).filter(y => !ys.includes(y)).sort((a, b) => a - b);
  const more = others.reduce((a, y) => a + r.elsewhere[y], 0);
  $('search-more').innerHTML = (more ? `${esc(fill(T.searchMore, { n: nf.format(more), years: others.join(', ') }))} ` : '') + (r.total > r.shown.length ? esc(T.searchCapped) : '');
  box.innerHTML = r.shown.map(e => entryHtml(e, true)).join('');
  // the matches are marked in the text of each note
  const needle = q.toLocaleLowerCase();
  box.querySelectorAll('.df-note, .df-title, .df-acts').forEach(el => markText(el, needle));
  observePhotos(box);
}
function markText(el, needle) {
  const walker = document.createTreeWalker(el, NodeFilter.SHOW_TEXT);
  const nodes = [];
  while (walker.nextNode()) nodes.push(walker.currentNode);
  for (const n of nodes) {
    const low = n.data.toLocaleLowerCase();
    let i = low.indexOf(needle);
    if (i < 0 || low.length !== n.data.length) continue;
    const frag = document.createDocumentFragment();
    let last = 0;
    while (i >= 0) {
      frag.append(n.data.slice(last, i));
      const mk = document.createElement('mark'); mk.textContent = n.data.slice(i, i + needle.length); frag.append(mk);
      last = i + needle.length;
      i = low.indexOf(needle, last);
    }
    frag.append(n.data.slice(last));
    n.replaceWith(frag);
  }
}

/* ---------- save and print (Pro) ---------- */
function yearOptions(sel, withAll) {
  const opts = state.years.slice().reverse().map(y => `<option value="${y}">${y}</option>`);
  if (withAll && state.years.length > 1) opts.unshift(`<option value="all">${esc(fill(T.yearsChoiceAll, { from: state.years[0], to: state.years[state.years.length - 1] }))}</option>`);
  sel.innerHTML = opts.join('');
}
function fillSaveOptions() {
  ['book-years', 'md-years', 'csv-years'].forEach(id => yearOptions($(id), true));
  yearOptions($('poster-year'), false);
  state.posterYear = state.years[state.years.length - 1];
  $('poster-year').value = String(state.posterYear);
  if (!$('book-title').value) $('book-title').value = T.bookTitle;
  if (!$('poster-title').value) $('poster-title').value = T.posterTitle;
}
const chosen = id => ($(id).value === 'all' ? state.years.slice() : [Number($(id).value)]);
const fileTag = ys => (ys.length > 1 ? `${ys[0]}-${ys[ys.length - 1]}` : String(ys[0]));
function status(id, text) { $(id).textContent = text; }
function busy(btn, on) { btn.disabled = on; btn.setAttribute('aria-busy', String(on)); }

async function saveBook() {
  if (!needPro(T.needBook)) return;
  const btn = $('btn-book');
  const ys = chosen('book-years');
  busy(btn, true);
  try {
    await fontsReady();
    status('book-status', fill(T.bookWorking, { n: 1 }));
    const data = await call('book', { years: ys, lang: LANG });
    if (!data.entries.length) { status('book-status', T.bookEmpty); return; }
    const paper = document.querySelector('#book-paper [aria-pressed="true"]').dataset.value;
    const { blob, pages } = await makeBook(data, {
      paper, photos: $('book-photos').checked, title: $('book-title').value.trim() || T.bookTitle, locale: LOC,
      labels: { entries: T.bookEntries, from: T.bookFrom, days: T.bookDays },
      getPhoto: id => call('photo', { asset: id, max: paper === 'A4' ? 1600 : 1300 }),
      onProgress: n => status('book-status', fill(T.bookWorking, { n: nf.format(n) })),
    });
    const file = `dayfold-journal-${fileTag(ys)}-${paper}.pdf`;
    window.PeakUI.download(blob, file);
    status('book-status', fill(T.bookDone, { file, pages: nf.format(pages) }));
  } catch (e) { status('book-status', fill(T.failed, { detail: e.message || e })); }
  finally { busy(btn, false); }
}
async function saveMarkdown() {
  if (!needPro(T.needMd)) return;
  const btn = $('btn-md');
  const ys = chosen('md-years');
  busy(btn, true);
  try {
    status('md-status', fill(T.mdWorking, { p: 0 }));
    // the answer carries the counts with the ZIP
    const res = await call('markdown', { years: ys, lang: LANG }, m => status('md-status', fill(T.mdWorking, { p: m.p })), true);
    const file = `dayfold-markdown-${fileTag(ys)}.zip`;
    window.PeakUI.download(res.blob, file);
    status('md-status', fill(T.mdDone, { file, days: nf.format(res.days), photos: nf.format(res.photos) }));
  } catch (e) { status('md-status', fill(T.failed, { detail: e.message || e })); }
  finally { busy(btn, false); }
}
async function saveCsv() {
  if (!needPro(T.needCsv)) return;
  const ys = chosen('csv-years');
  try {
    const blob = await call('csv', { years: ys, lang: LANG });
    const file = `dayfold-entries-${fileTag(ys)}.csv`;
    window.PeakUI.download(blob, file);
    const rows = state.meta.years.filter(r => ys.includes(r.y)).reduce((a, r) => a + r.entries, 0);
    status('csv-status', fill(T.csvDone, { file, n: nf.format(rows) }));
  } catch (e) { status('csv-status', fill(T.failed, { detail: e.message || e })); }
}

let fontsOk = null;
function fontsReady() {
  if (!fontsOk) fontsOk = Promise.all(['800 40px "Dayfold Sans"', '700 40px "Dayfold Sans"', '400 40px "Dayfold Sans"', '400 40px "Dayfold Serif"', '600 40px "Dayfold Serif"', 'italic 400 40px "Dayfold Serif"'].map(f => document.fonts.load(f).catch(() => null)));
  return fontsOk;
}
async function posterOpts() {
  const y = Number($('poster-year').value);
  const grid = await call('pixels', { y });
  const s = await call('summary', { years: [y] });
  return {
    y, grid, theme: document.querySelector('#poster-theme [aria-pressed="true"]').dataset.value,
    title: $('poster-title').value.trim(),
    monthLetters: Array.from({ length: 12 }, (_, m) => fMonthLetter.format(new Date(Date.UTC(2024, m, 1)))),
    moodNames: [5, 4, 3, 2, 1].map(levelNames), noEntry: T.legendNone,
    stats: [[T.statDays, nf.format(s.days)], [T.statAvg, s.avg == null ? '' : fill(T.avgOf, { v: nf1.format(s.avg) })], [T.statStreak, s.streak.days === 1 ? T.streakDay : fill(T.streakDays, { n: nf.format(s.streak.days) })]],
    dist: s.dayLevels, credit: 'Dayfold, peakappsstudio.com/daylio-viewer',
  };
}
let posterTimer = null;
function renderPosterPreview() {
  clearTimeout(posterTimer);
  posterTimer = setTimeout(async () => {
    if (!state.meta || !state.meta.count) return;
    const y = Number($('poster-year').value);
    const c = $('poster-preview');
    if (!allowed(y)) { c.hidden = true; $('poster-locked').hidden = false; return; }
    c.hidden = false; $('poster-locked').hidden = true;
    await fontsReady();
    drawPoster(c, await posterOpts(), 0.16);
  }, 120);
}
async function savePoster(kind) {
  if (!needPro(T.needPoster)) return;
  const btns = document.querySelectorAll('[data-poster]');
  btns.forEach(b => busy(b, true));
  try {
    status('poster-status', T.posterWorking);
    await fontsReady();
    const opts = await posterOpts();
    const c = document.createElement('canvas');
    drawPoster(c, opts, 1);
    const base = `dayfold-year-in-pixels-${opts.y}`;
    if (kind === 'png') {
      const blob = await new Promise(r => c.toBlob(r, 'image/png'));
      window.PeakUI.download(blob, `${base}.png`);
      status('poster-status', fill(T.posterDone, { file: `${base}.png` }));
    } else {
      const rgba = c.getContext('2d').getImageData(0, 0, PW, PH).data.buffer;
      const bytes = await call('deflate', { rgba }, null, false, [rgba]);
      const [w, h] = PAPER[kind];
      const pdf = new PdfWriter({ title: `${opts.title || 'Year in Pixels'} ${opts.y}` });
      pdf.addImagePage(w, h, { bytes, w: PW, h: PH, filter: 'FlateDecode' });
      const file = `${base}-${kind}.pdf`;
      window.PeakUI.download(pdf.finish(), file);
      status('poster-status', fill(T.posterDone, { file }));
    }
  } catch (e) { status('poster-status', fill(T.failed, { detail: e.message || e })); }
  finally { btns.forEach(b => busy(b, false)); }
}

/* ---------- wiring ---------- */
function wire() {
  const input = $('file-input');
  $('btn-choose').addEventListener('click', () => input.click());
  input.addEventListener('change', () => { if (input.files && input.files[0]) openFile(input.files[0]); input.value = ''; });
  $('btn-sample').addEventListener('click', openSample);
  $('btn-error-sample').addEventListener('click', openSample);
  $('btn-retry').addEventListener('click', () => { stage('idle'); input.click(); });
  $('btn-reset').addEventListener('click', () => { resetResults(); stage('idle'); focusEl($('drop-title')); });
  $('btn-see').addEventListener('click', e => { e.preventDefault(); const j = $('journal'); j.scrollIntoView({ behavior: reduceMotion() ? 'auto' : 'smooth' }); focusEl(j); });
  const drop = $('drop');
  ['dragenter', 'dragover'].forEach(ev => drop.addEventListener(ev, e => { e.preventDefault(); drop.classList.add('is-over'); }));
  ['dragleave', 'drop'].forEach(ev => drop.addEventListener(ev, e => { e.preventDefault(); drop.classList.remove('is-over'); }));
  drop.addEventListener('drop', e => { const f = e.dataTransfer && e.dataTransfer.files && e.dataTransfer.files[0]; if (f) openFile(f); });
  // the whole page accepts a dropped file too, so a near miss does not open the file in the browser
  window.addEventListener('dragover', e => e.preventDefault());
  window.addEventListener('drop', e => { e.preventDefault(); if (!drop.contains(e.target)) { const f = e.dataTransfer && e.dataTransfer.files && e.dataTransfer.files[0]; if (f) openFile(f); } });

  $('years').addEventListener('click', e => { const b = e.target.closest('button[data-year]'); if (b) pickYear(b.dataset.year); });
  const tabs = [...document.querySelectorAll('[role=tab]')];
  tabs.forEach(t => t.addEventListener('click', () => { $('q').value = ''; state.q = ''; setView(t.dataset.view, false); refresh(); }));
  $('tablist').addEventListener('keydown', e => {
    const i = tabs.indexOf(document.activeElement);
    if (i < 0 || !['ArrowLeft', 'ArrowRight', 'Home', 'End'].includes(e.key)) return;
    e.preventDefault();
    const j = e.key === 'Home' ? 0 : e.key === 'End' ? tabs.length - 1 : (i + (e.key === 'ArrowRight' ? 1 : -1) + tabs.length) % tabs.length;
    tabs[j].click(); tabs[j].focus();
  });
  $('cal-prev').addEventListener('click', () => stepMonth(-1));
  $('cal-next').addEventListener('click', () => stepMonth(1));
  $('cal').addEventListener('click', e => { const b = e.target.closest('button[data-day]'); if (!b) return; const d = Number(b.dataset.day); state.day = state.day === d ? null : d; renderJournal(); });
  document.addEventListener('click', e => {
    const sm = e.target.closest('#show-month'); if (sm) { state.day = null; renderJournal(); return; }
    const ph = e.target.closest('.df-photo'); if (ph) { openPhoto(Number(ph.dataset.asset)); return; }
    const vo = e.target.closest('[data-voice]'); if (vo) { playVoice(vo); return; }
    const go = e.target.closest('[data-goto]');
    if (go && go.dataset.goto.includes('-')) { const [y, m, d] = go.dataset.goto.split('-').map(Number); state.month = { y, m }; state.day = d; setView('journal'); refresh(); return; }
    if (go) { setView(go.dataset.goto); refresh(); return; }
    const pat = e.target.closest('#btn-patterns'); if (pat) { needPro(T.needPatterns); return; }
    const hit = e.target.closest('#view-search .df-entry');
    if (hit && !e.target.closest('button')) { const [y, m, d] = hit.dataset.key.split('-').map(Number); $('q').value = ''; state.q = ''; state.month = { y, m: m - 1 }; state.day = d; setView('journal'); refresh(); }
  });
  $('q').addEventListener('input', onSearchInput);
  $('photo-close').addEventListener('click', () => $('photo-dialog').close());
  $('photo-dialog').addEventListener('click', e => { if (e.target === $('photo-dialog')) $('photo-dialog').close(); });
  $('btn-book').addEventListener('click', saveBook);
  $('btn-md').addEventListener('click', saveMarkdown);
  $('btn-csv').addEventListener('click', saveCsv);
  document.querySelectorAll('[data-poster]').forEach(b => b.addEventListener('click', () => savePoster(b.dataset.poster)));
  ['book-paper', 'poster-theme'].forEach(id => $(id).addEventListener('click', e => {
    const b = e.target.closest('button[data-value]'); if (!b) return;
    $(id).querySelectorAll('button').forEach(x => x.setAttribute('aria-pressed', String(x === b)));
    if (id === 'poster-theme') renderPosterPreview();
  }));
  $('poster-year').addEventListener('change', renderPosterPreview);
  $('poster-title').addEventListener('input', renderPosterPreview);
}
function stepMonth(dir) {
  const list = monthsAvailable();
  const at = list.findIndex(x => x.y === state.month.y && x.m === state.month.m);
  const next = list[at + dir];
  if (!next) return;
  state.month = next; state.day = null;
  renderJournal();
}

setupLicense();
wire();
if (!window.PeakLicense) window.addEventListener('DOMContentLoaded', setupLicense, { once: true });
