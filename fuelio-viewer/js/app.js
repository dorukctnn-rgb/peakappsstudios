/* Fillbook page logic (English and Polish pages). The log files are read in this tab: parse.js reads them, stats.js works
 * the numbers out, and the page only shows the result. The one network request the page itself can make is the Pro
 * license check, to Gumroad, when you paste a key. Your log is never uploaded and the file is never changed. */
import { strings, fill, LOCALE } from './i18n.js';
import { readVehicleFile, decodeText, looksBinary, LogError, fingerprint, dayParts, dayNumber, OWN, OWN_KM, OWN_MI, isZip, csvsInZip } from './parse.js';
import { prepare, aggregate, freeWindow, allWindow, yearWindow, yearsOf, defaultExcluded, consDisplay, consLowerIsBetter, distDisplay, volDisplay, perUnitPrice, perDistCost, entriesOf, byYear } from './stats.js';
import { sampleFiles } from './sample.js';
import { buildCsv } from './export.js';
import { PdfWriter, PAPER } from './pdfmini.js';
import { makeBook } from './book.js';

// ---- Gumroad Pro product, permalink fillbook-pro. The license check sends this product id, never the permalink.
// Fail closed: while this is 'PENDING' (or empty) Pro never turns on, whatever the browser has stored.
const FILLBOOK_PRO_PRODUCT_ID = 'tuCfiREhqFdYorDPHA1p9w==';
const FILLBOOK_PRO_URL = 'https://dorukctn.gumroad.com/l/fillbook-pro';
const PRO_READY = !!FILLBOOK_PRO_PRODUCT_ID && FILLBOOK_PRO_PRODUCT_ID !== 'PENDING';

const LANG = ((document.documentElement.lang || 'en').slice(0, 2)).toLowerCase();
const T = strings(LANG);
const LOC = LOCALE[LANG] || 'en-GB';
const $ = id => document.getElementById(id);
const esc = s => String(s == null ? '' : s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const nf0 = new Intl.NumberFormat(LOC, { maximumFractionDigits: 0 });
const nf1 = new Intl.NumberFormat(LOC, { minimumFractionDigits: 1, maximumFractionDigits: 1 });
const nf2 = new Intl.NumberFormat(LOC, { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const nf3 = new Intl.NumberFormat(LOC, { minimumFractionDigits: 3, maximumFractionDigits: 3 });
const U = { timeZone: 'UTC' };
const fDate = new Intl.DateTimeFormat(LOC, { day: 'numeric', month: 'short', year: 'numeric', ...U });
const fMonth = new Intl.DateTimeFormat(LOC, { month: 'long', year: 'numeric', ...U });
const fMonthShort = new Intl.DateTimeFormat(LOC, { month: 'short', ...U });
const fMonthNarrow = new Intl.DateTimeFormat(LOC, { month: 'narrow', ...U });
const dateOf = day => new Date(day * 86400000);
const reduceMotion = () => window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
const LOCK = '<svg class="fb-lock" viewBox="0 0 20 20" aria-hidden="true" focusable="false"><path d="M6 9V6.5a4 4 0 0 1 8 0V9" fill="none" stroke="currentColor" stroke-width="1.8"/><rect x="4" y="9" width="12" height="8.5" rx="2" fill="currentColor"/></svg>';
const CONS_UNIT_UNITS = [[0, 0], [1, 1], [1, 2], [0, 0], [0, 1], [0, 2]]; // distance and volume unit that go with each consumption unit

const state = {
  vehicles: [], vi: 0, period: 'last12', view: 'overview', pro: false, currency: LANG === 'pl' ? 'zł' : '',
  filter: '', kind: 'all', shown: 300, cmpUnit: null, cmpPeriod: 'all', notes: [], sample: false,
};
const seen = new Set();

/* ---------- license ---------- */
function setupLicense() {
  if (!window.PeakLicense) return;
  const L = LANG === 'en' ? {} : {
    strings: {
      pl: { title: 'Odblokuj Pro', buy: 'Kup Pro w Gumroad', keyLabel: 'Masz już klucz? Wklej klucz licencyjny', verify: 'Aktywuj', close: 'Zamknij', checking: 'Sprawdzam w Gumroad…', badKey: 'To nie wygląda na klucz licencyjny. Znajdziesz go w mailu z potwierdzeniem zakupu z Gumroad.', network: 'Nie udało się połączyć z Gumroad. Sprawdź połączenie i spróbuj ponownie.', ok: 'Pro jest włączone w tej przeglądarce. Dziękujemy.', refunded: 'Ten zakup został zwrócony albo wygasł, więc Pro jest wyłączone.', rejected: 'Ten klucz licencyjny nie został przyjęty.', active: 'Pro jest włączone w tej przeglądarce.' },
    }[LANG],
    localMessages: true,
  };
  window.PeakLicense.setup(Object.assign({ tool: 'fillbook', productId: PRO_READY ? FILLBOOK_PRO_PRODUCT_ID : 'PENDING', permalink: 'fillbook-pro', buyUrl: FILLBOOK_PRO_URL, pitch: T.pitch }, L));
  window.PeakLicense.onChange(isPro => {
    const was = state.pro;
    state.pro = PRO_READY && !!isPro;
    $('pro-state').textContent = state.pro ? T.proActive : T.proOff;
    document.body.classList.toggle('fb-is-pro', state.pro);
    if (was !== state.pro && state.vehicles.length) { if (!state.pro) { state.vi = 0; state.period = 'last12'; } refreshAll(); }
  });
}
const needPro = reason => (state.pro ? true : (window.PeakLicense ? window.PeakLicense.requirePro(reason) : false));

/* ---------- units and numbers ---------- */
const cur = () => state.vehicles[state.vi];
const dUnit = v => T.distUnits[v.distUnit] || 'km';
// a vehicle logged in kWh, kg or m3 keeps the unit its file names ("Fuel (kWh)"); consumption is that unit per 100 km or mi
const vUnit = v => (v.fuelUnit === OWN ? v.volLabel || T.ownUnit : T.volUnits[v.fuelUnit] || 'l');
const cUnit = v => (v.consUnit === OWN_KM || v.consUnit === OWN_MI ? `${vUnit(v)}/100 ${T.distUnits[v.consUnit === OWN_MI ? 1 : 0]}` : T.consUnits[v.consUnit] || T.consUnits[0]);
const altLine = r => fill(T.altLine, { vol: nf2.format(r.fuelRaw) });
function money(x, d = 0) {
  if (!Number.isFinite(x)) return '\u2013';
  const n = (d === 3 ? nf3 : d === 2 ? nf2 : d === 1 ? nf1 : nf0).format(x);
  const c = state.currency.trim();
  if (!c) return n;
  return /^[$€£¥]$/.test(c) ? `${c}${n}` : `${n} ${c}`;
}
const consText = (l100, unit) => (Number.isFinite(l100) && l100 > 0 ? nf1.format(consDisplay(l100, unit)) : '\u2013');
const perKmText = (perKm, distUnit) => { const v = perDistCost(perKm, distUnit); return Number.isFinite(v) ? money(v, v < 1 ? 3 : 2) : '\u2013'; };
function groupDigits(n) { return nf0.format(Math.max(0, Math.round(n))); }
function drum(value, unit) {
  const text = groupDigits(value);
  const chars = [...text];
  const tiles = chars.map((c, i) => (/\d/.test(c) ? `<i${i === chars.length - 1 ? ' class="is-lit"' : ''}>${c}</i>` : '<i class="is-sep"> </i>')).join('');
  return `<span class="fb-drum" role="img" aria-label="${esc(`${text} ${unit}`)}"><span aria-hidden="true" style="display:contents">${tiles}</span></span><span class="fb-drum-unit" aria-hidden="true">${esc(unit)}</span>`;
}
const monthLabel = (mo, narrow) => (narrow ? fMonthNarrow : fMonthShort).format(dateOf(mo.start));

/* ---------- opening files ---------- */
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
async function itemsOf(files) {
  const items = [];
  for (const f of files) {
    const name = f.name || 'file';
    let bytes;
    try { bytes = new Uint8Array(await f.arrayBuffer()); } catch (e) { items.push({ name, error: 'internal', detail: String(e.message || e) }); continue; }
    if (!bytes.length || (bytes.length < 40 && !new TextDecoder().decode(bytes).trim())) { items.push({ name, error: 'empty' }); continue; }
    if (isZip(bytes)) {
      try {
        const { unzipSync } = await import('../vendor/fflate.js');
        const inside = csvsInZip(bytes, unzipSync);
        if (!inside.length) items.push({ name, error: 'zip' });
        items.push(...inside);
      } catch (e) { items.push({ name, error: 'zip' }); }
      continue;
    }
    items.push({ name, bytes });
  }
  return items;
}
function readItem(it) {
  if (it.error) return { name: it.name, error: it.error, detail: it.detail };
  try {
    if (looksBinary(it.bytes)) return { name: it.name, error: 'binary' };
    const text = decodeText(it.bytes, LANG === 'pl' ? 'windows-1250' : 'windows-1252');
    if (!text.trim()) return { name: it.name, error: 'empty' };
    return { name: it.name, v: prepare(readVehicleFile(text, it.name)) };
  } catch (e) { return { name: it.name, error: e instanceof LogError ? e.code : 'internal', detail: e.message }; }
}
async function openFiles(files, add = false) {
  const list = [...files];
  if (!list.length) return;
  if (!add) resetResults();
  if (!add) { $('busy-title').textContent = fill(T.reading, { name: list.length === 1 ? list[0].name : `${list.length}` }); $('busy-sub').textContent = T.stepReading; setBar(8); stage('busy'); focusEl($('busy-title')); }
  await new Promise(r => setTimeout(r, 30));
  const items = await itemsOf(list);
  setBar(45);
  await finishOpen(items.map(readItem), add);
}
async function openSample() {
  resetResults();
  state.sample = true;
  $('busy-title').textContent = T.readingSample;
  $('busy-sub').textContent = T.stepNumbers;
  setBar(40);
  stage('busy');
  await new Promise(r => setTimeout(r, 30));
  const results = sampleFiles(LANG, new Date()).map(f => readItem({ name: f.name, bytes: new TextEncoder().encode(f.text) }));
  await finishOpen(results, false);
}
function resetResults() {
  state.vehicles = []; seen.clear(); state.notes = []; state.vi = 0; state.period = 'last12'; state.sample = false; state.filter = ''; state.kind = 'all'; state.shown = 300;
  $('log').hidden = true;
}
async function finishOpen(results, add) {
  const failed = results.filter(r => r.error);
  const good = results.filter(r => r.v);
  const notes = [];
  for (const r of failed) { const [title] = T.errors[r.error] || T.errors.internal; notes.push({ text: fill(T.skippedFile, { name: r.name, reason: title }), info: false }); }
  let added = 0;
  for (const r of good) {
    const fp = fingerprint(r.v);
    if (seen.has(fp)) { notes.push({ text: fill(T.dupFile, { name: r.name }), info: true }); continue; }
    seen.add(fp);
    state.vehicles.push({ v: r.v, fp, excluded: defaultExcluded(r.v), label: r.v.name });
    added++;
  }
  if (!state.vehicles.length) { fail(failed.length ? failed[0].error : 'format', failed.length ? failed[0].detail : ''); return; }
  state.vehicles.sort((a, b) => b.v.last - a.v.last || b.v.log.length - a.v.log.length);
  const names = new Map();
  for (const ve of state.vehicles) names.set(ve.v.name, (names.get(ve.v.name) || 0) + 1);
  for (const ve of state.vehicles) ve.label = names.get(ve.v.name) > 1 ? `${ve.v.name} (${ve.v.file})` : ve.v.name;
  state.notes = add ? state.notes.concat(notes) : notes;
  setBar(100);
  if (!add) { state.vi = 0; state.period = 'last12'; } else state.vi = Math.min(state.vi, state.vehicles.length - 1);
  const sum = state.vehicles.reduce((a, ve) => ({ fills: a.fills + ve.v.log.length, costs: a.costs + ve.v.costs.length, first: Math.min(a.first, ve.v.first), last: Math.max(a.last, ve.v.last) }), { fills: 0, costs: 0, first: Infinity, last: -Infinity });
  $('done-title').textContent = T.doneTitle({ vehicles: state.vehicles.length, fills: nf0.format(sum.fills), costs: nf0.format(sum.costs) });
  $('done-sub').textContent = state.sample ? T.doneSample : fill(T.doneSub, { from: fDate.format(dateOf(sum.first)), to: fDate.format(dateOf(sum.last)) });
  stage('done');
  $('log').hidden = false;
  if (!add) focusEl($('done-title'));
  fillSaveOptions();
  refreshAll();
}

/* ---------- the shell of the app section ---------- */
const TABS = ['overview', 'costs', 'entries', 'compare', 'save'];
function buildShell() {
  $('tablist').innerHTML = TABS.map((t, i) => `<button type="button" role="tab" id="tab-${t}" data-view="${t}" aria-controls="view-${t}" aria-selected="${i === 0}"${i ? ' tabindex="-1"' : ''}>${esc(T.tabs[t])}${t === 'compare' || t === 'save' ? `<span class="fb-tag">Pro</span>` : ''}</button>`).join('');
  $('tablist').setAttribute('aria-label', T.tabsLabel);
  $('vehicles').setAttribute('aria-label', T.vehiclesLabel);
  $('periods').setAttribute('aria-label', T.periodsLabel);
  $('app-title').textContent = T.tabs.overview;
  $('cur-label').textContent = T.currencyLabel;
  $('currency').value = state.currency;
  $('currency').title = T.currencyHint;
  $('btn-add').textContent = LANG === 'pl' ? 'Dodaj kolejny plik' : 'Add another file';
  $('views').innerHTML = `
<div class="fb-view" id="view-overview" role="tabpanel" aria-labelledby="tab-overview"><div class="fb-odo" id="ov-odo"></div><dl class="fb-stats" id="ov-stats"></dl><div class="fb-charts" id="ov-charts"></div></div>
<div class="fb-view" id="view-costs" role="tabpanel" aria-labelledby="tab-costs" hidden><div id="costs-body"></div></div>
<div class="fb-view" id="view-entries" role="tabpanel" aria-labelledby="tab-entries" hidden>
<h3>${esc(T.entriesH)}</h3>
<div class="fb-filter"><label class="fb-field"><span>${esc(T.filterLabel)}</span><input class="input" id="q" type="search" placeholder="${esc(T.filterPh)}" autocomplete="off" spellcheck="false" enterkeyhint="search"></label>
<label class="fb-field"><span>${esc(T.kindLabel)}</span><select class="select" id="kind"><option value="all">${esc(T.kindAll)}</option><option value="fuel">${esc(T.kindFuel)}</option><option value="cost">${esc(T.kindCost)}</option></select></label></div>
<p class="fb-note" id="entry-count" aria-live="polite"></p>
<ul class="fb-entries" id="entry-list"></ul>
<p class="fb-more"><button type="button" class="btn fb-btn-quiet" id="btn-more" hidden>${esc(T.showMore)}</button></p>
</div>
<div class="fb-view" id="view-compare" role="tabpanel" aria-labelledby="tab-compare" hidden><div id="compare-body"></div></div>
<div class="fb-view" id="view-save" role="tabpanel" aria-labelledby="tab-save" hidden>
<p class="fb-save-intro">${esc(T.saveIntro)}</p>
<div class="fb-saves">
<section class="fb-save" aria-labelledby="book-h"><h3 id="book-h">${esc(LANG === 'pl' ? 'Książka historii (PDF)' : 'History book (PDF)')}</h3>
<p>${esc(LANG === 'pl' ? 'Okładka z pojazdem, sumy za każdy rok i kategorię, a potem każdy serwis i koszt z datą, licznikiem i kwotą. Przydaje się przy sprzedaży auta.' : 'A cover with the vehicle, totals for every year and category, then every service and cost with its date, odometer reading and amount. Handy when you sell the car.')}</p>
<div class="fb-fields">
<label class="fb-field fb-field-wide"><span>${esc(T.lblVehicle)}</span><select class="select" id="book-vehicle"></select></label>
<label class="fb-field"><span>${esc(T.lblYears)}</span><select class="select" id="book-years"></select></label>
<div class="fb-field"><span id="book-paper-l">${esc(T.lblPaper)}</span><div class="fb-seg" id="book-paper" role="group" aria-labelledby="book-paper-l"><button type="button" data-value="A4" aria-pressed="${LANG === 'pl'}">A4</button><button type="button" data-value="LETTER" aria-pressed="${LANG !== 'pl'}">Letter</button></div></div>
<label class="fb-field fb-field-wide"><span>${esc(T.lblCover)}</span><input class="input" id="book-title" maxlength="80"></label>
<label class="fb-check"><input type="checkbox" id="book-plate" checked> ${esc(T.lblPlate)}</label>
<label class="fb-check"><input type="checkbox" id="book-fuel"> ${esc(T.lblFuelLog)}</label>
</div>
<button type="button" class="btn btn-primary" id="btn-book">${esc(T.bookBtn)}<span class="fb-tag">Pro</span></button>
<p class="fb-status" id="book-status" role="status"></p></section>
<section class="fb-save" aria-labelledby="csv-h"><h3 id="csv-h">${esc(LANG === 'pl' ? 'Arkusz do rozliczeń (CSV)' : 'Spreadsheet for expenses (CSV)')}</h3>
<p>${esc(LANG === 'pl' ? 'Jeden wiersz na tankowanie i koszt, daty w formacie rok-miesiąc-dzień, kategorie wyłączone w zakładce Koszty zostają poza plikiem.' : 'One row per fill-up and cost, dates written year-month-day. Categories you switched off on the Costs tab stay out of the file.')}</p>
<div class="fb-fields">
<label class="fb-field fb-field-wide"><span>${esc(T.lblVehicle)}</span><select class="select" id="csv-vehicle"></select></label>
<label class="fb-field"><span>${esc(T.lblYears)}</span><select class="select" id="csv-years"></select></label>
<label class="fb-field"><span>${esc(T.lblBusiness)}</span><input class="input" id="csv-business" inputmode="decimal" maxlength="5" placeholder="100"><span class="fb-hint">${esc(T.lblBusinessHint)}</span></label>
<label class="fb-check"><input type="checkbox" id="csv-fuel" checked> ${esc(T.lblFuelRows)}</label>
<label class="fb-check"><input type="checkbox" id="csv-excel"${LANG === 'pl' ? ' checked' : ''}> ${esc(T.lblExcel)}</label>
</div>
<button type="button" class="btn btn-primary" id="btn-csv">${esc(T.csvBtn)}<span class="fb-tag">Pro</span></button>
<p class="fb-status" id="csv-status" role="status"></p></section>
</div></div>`;
}

/* ---------- allowed in the free version ---------- */
const allowedVehicle = i => state.pro || i === 0;
const allowedPeriod = p => state.pro || p === 'last12';
function windowOf(v, period = state.period) {
  if (period === 'last12') return freeWindow(v);
  if (period === 'all') return allWindow(v);
  return yearWindow(Number(period));
}
const aggOf = (ve, period = state.period) => aggregate(ve.v, windowOf(ve.v, period), ve.excluded);

/* ---------- head: chips, coverage, notes ---------- */
function renderHead() {
  const ve = cur(), v = ve.v;
  $('app-title').textContent = state.vehicles.length > 1 ? T.tabs.overview : ve.label;
  const cov = fill(T.coverage, { fills: nf0.format(v.log.length), costs: nf0.format(v.costs.length), from: fDate.format(dateOf(v.first)), to: fDate.format(dateOf(v.last)) });
  const meta = [v.make && v.model ? `${v.make} ${v.model}` : v.make || v.model, v.year].filter(Boolean).join(', ');
  $('coverage').textContent = (state.vehicles.length > 1 ? `${ve.label}. ` : meta ? `${meta}. ` : '') + cov;
  $('vehicles').hidden = state.vehicles.length < 2;
  $('vehicles').innerHTML = state.vehicles.map((x, i) => `<button type="button" data-vehicle="${i}" aria-pressed="${state.vi === i}"${allowedVehicle(i) ? '' : ' class="is-locked"'}><span>${esc(x.label)}</span>${allowedVehicle(i) ? '' : LOCK}</button>`).join('');
  const years = yearsOf(v);
  const chip = (p, text) => `<button type="button" data-period="${p}" aria-pressed="${state.period === p}"${allowedPeriod(p) ? '' : ' class="is-locked"'}>${esc(text)}${allowedPeriod(p) ? '' : LOCK}</button>`;
  $('periods').innerHTML = chip('last12', T.last12) + years.map(y => chip(String(y), String(y))).join('') + chip('all', T.allTime);
  $('free-note').textContent = state.pro ? '' : T.freeNote;
  $('file-notes').innerHTML = noteLines().map(n => `<li${n.info ? ' class="is-info"' : ''}>${esc(n.text)}</li>`).join('');
}
function noteLines() {
  const out = state.notes.slice();
  const one = (k, a, b) => (k === 1 ? a : b);
  for (const ve of state.vehicles) {
    const n = ve.v.notes, who = state.vehicles.length > 1 ? `${ve.label}: ` : '';
    const skipped = n.skippedLog + n.skippedCosts;
    if (skipped) out.push({ text: who + (LANG === 'pl' ? `Pominięto wiersze bez czytelnej daty lub ilości paliwa: ${skipped}.` : `${skipped} ${one(skipped, 'row was', 'rows were')} skipped (no readable date or no fuel amount or cost).`) });
    if (n.templates) out.push({ text: who + (LANG === 'pl' ? `Pominięto szablony kosztów cyklicznych: ${n.templates}.` : `${n.templates} recurring-cost ${one(n.templates, 'template was', 'templates were')} skipped.`), info: true });
    if (n.backwards) out.push({ text: who + (LANG === 'pl' ? `Licznik cofa się ${n.backwards} razy; te odczyty pominięto przy liczeniu spalania.` : `The odometer goes backwards ${one(n.backwards, 'once', `${n.backwards} times`)}; those readings are left out of consumption.`) });
    if (n.odd) out.push({ text: who + (LANG === 'pl' ? `Tankowań z niemożliwym spalaniem (poniżej 1 lub powyżej 80 l/100 km): ${n.odd}. Nie wchodzą do wykresów ani średnich.` : `${n.odd} ${one(n.odd, 'fill-up gives', 'fill-ups give')} a consumption that cannot be right (below 1 or above 80 l/100 km); ${one(n.odd, 'it is', 'they are')} left out of the charts and averages.`) });
    if (n.altTank) out.push({ text: who + (LANG === 'pl' ? `Zbiornik 2 jest zapisany w innej jednostce (tankowania: ${n.altTank}). Jego tankowania liczą się w kosztach, ale nie w ilości paliwa ani w spalaniu.` : `Tank 2 is logged in another unit (${n.altTank} ${one(n.altTank, 'fill-up', 'fill-ups')}). Its fill-ups count in the money, but not in the fuel amounts or the consumption.`), info: true });
    if (n.unknownSections.length) out.push({ text: who + (LANG === 'pl' ? `Sekcje, których ta strona nie używa: ${n.unknownSections.join(', ')}.` : `Sections this page does not use: ${n.unknownSections.join(', ')}.`), info: true });
  }
  return out;
}

/* ---------- refresh ---------- */
function refreshAll() {
  if (!state.vehicles.length) return;
  if (!allowedVehicle(state.vi)) state.vi = 0;
  if (!allowedPeriod(state.period)) state.period = 'last12';
  if (state.period !== 'last12' && state.period !== 'all' && !yearsOf(cur().v).includes(Number(state.period))) state.period = 'last12';
  renderHead();
  refreshView();
}
function refreshView() {
  const v = state.view;
  document.querySelectorAll('[role=tab]').forEach(t => { const on = t.dataset.view === v; t.setAttribute('aria-selected', String(on)); t.tabIndex = on ? 0 : -1; });
  TABS.forEach(n => { $('view-' + n).hidden = n !== v; });
  if (v === 'overview') renderOverview();
  else if (v === 'costs') renderCosts();
  else if (v === 'entries') renderEntries();
  else if (v === 'compare') renderCompare();
}
function setView(v, focus = true) {
  state.view = v;
  refreshView();
  if (focus) focusEl($('tab-' + v));
}

/* ---------- overview ---------- */
function renderOverview() {
  const ve = cur(), v = ve.v, a = aggOf(ve);
  const dU = dUnit(v);
  $('ov-odo').innerHTML = `<div><span class="fb-odo-label">${esc(T.stat.distance)}</span>${drum(distDisplay(a.distance, v.distUnit), dU)}</div>`
    + `<div><span class="fb-odo-label">${esc(T.stat.spent)}</span>${drum(a.total, state.currency.trim() || '')}</div>`
    + `<div><span class="fb-odo-label">${esc(T.stat.fuelL)}</span>${drum(volDisplay(a.litres, v.fuelUnit), vUnit(v))}</div>`;
  const rows = [];
  if (a.consN) {
    const tanks = v.tanksUsed.filter(t => a.byTank[t].n);
    if (tanks.length > 1) for (const t of tanks) rows.push([`${T.stat.consumption}, ${fill(T.tankN, { n: t })}`, `${consText(a.byTank[t].avg, v.consUnit)} <small>${esc(cUnit(v))}</small>`]);
    else rows.push([T.stat.consumption, `${consText(a.consAvg, v.consUnit)} <small>${esc(cUnit(v))}</small>`]);
    const lo = consLowerIsBetter(v.consUnit) ? a.consBest : a.consWorst, hi = consLowerIsBetter(v.consUnit) ? a.consWorst : a.consBest;
    rows.push([`${T.stat.best} / ${T.stat.worst}`, `${consText(lo, v.consUnit)} / ${consText(hi, v.consUnit)} <small>${esc(cUnit(v))}</small>`]);
  } else rows.push([T.stat.consumption, `<small>${esc(T.noConsumption)}</small>`]);
  rows.push([T.stat.price, Number.isFinite(a.pricePerLitre) ? `${money(perUnitPrice(a.pricePerLitre, v.fuelUnit), 3)} <small>/ ${esc(vUnit(v))}</small>` : '\u2013']);
  rows.push([fill(T.stat.perKm, { unit: T.perKm[v.distUnit] || T.perKm[0] }), perKmText(a.costPerKm, v.distUnit)]);
  rows.push([T.stat.perMonth, money(a.perMonth)]);
  rows.push([T.stat.fuelCost, `${money(a.fuelCost)} <small>${a.total > 0 && a.fuelCost >= 0 ? esc(fill(T.stat.fuelShare, { p: Math.round((a.fuelCost / a.total) * 100) })) : ''}</small>`]);
  rows.push([T.stat.other, money(a.otherCost)]);
  rows.push([T.stat.fills, `${nf0.format(a.fills)} <small>${a.fills ? esc(`${T.stat.avgFill.toLowerCase()} ${nf1.format(volDisplay(a.avgFill, v.fuelUnit))} ${vUnit(v)}`) : ''}</small>`]);
  $('ov-stats').innerHTML = rows.map(([k, val]) => `<div><dt>${esc(k)}</dt><dd>${val}</dd></div>`).join('');
  drawCharts(a, v);
}
function drawCharts(a, v) {
  const box = $('ov-charts');
  const per = T.perKm[v.distUnit] || T.perKm[0];
  box.innerHTML = `
<section class="fb-chart"><h3>${esc(T.chartCons)}</h3><p class="fb-note">${esc(T.chartConsNote)}</p><div class="fb-chart-box" id="ch-cons"></div></section>
<section class="fb-chart"><h3>${esc(T.chartMonthly)}</h3><p class="fb-note">${esc(T.chartMonthlyNote)}</p><div class="fb-chart-box" id="ch-monthly"></div><ul class="fb-legend"><li><i style="background:var(--fuel)"></i>${esc(T.legendFuel)}</li><li><i style="background:var(--other)"></i>${esc(T.legendOther)}</li></ul></section>
<section class="fb-chart"><h3>${esc(fill(T.chartPerKm, { unit: per }))}</h3><p class="fb-note">${esc(T.chartPerKmNote)}</p><div class="fb-chart-box" id="ch-perkm"></div></section>`;
  const width = Math.max(300, Math.floor(box.clientWidth || 640));
  $('ch-cons').innerHTML = consChart(a, v, width);
  $('ch-monthly').innerHTML = monthlyChart(a, width);
  $('ch-perkm').innerHTML = perKmChart(a, v, width);
}
function niceScale(min, max, ticks = 4) {
  if (!(max > min)) { max = min + 1; }
  const raw = (max - min) / ticks;
  const mag = 10 ** Math.floor(Math.log10(raw));
  const n = raw / mag;
  const step = (n <= 1 ? 1 : n <= 2 ? 2 : n <= 2.5 ? 2.5 : n <= 5 ? 5 : 10) * mag;
  const lo = Math.floor(min / step) * step, hi = Math.ceil(max / step) * step;
  const out = [];
  for (let t = lo; t <= hi + step / 2; t += step) out.push(Math.round(t / step) * step);
  return { lo, hi, ticks: out, step };
}
const decimalsFor = step => (step >= 1 ? 0 : step >= 0.1 ? 1 : step >= 0.01 ? 2 : 3);
const fmtTick = (t, step) => new Intl.NumberFormat(LOC, { minimumFractionDigits: decimalsFor(step), maximumFractionDigits: decimalsFor(step) }).format(t);
function monthTicks(months, plotW) {
  const maxLabels = Math.max(2, Math.floor(plotW / 54));
  const k = Math.max(1, Math.ceil(months.length / maxLabels));
  return months.map((mo, i) => ({ mo, show: i % k === 0 }));
}
function axisLabel(mo, i) {
  const short = fMonthShort.format(dateOf(mo.start));
  return mo.m === 1 || i === 0 ? `${short} ’${String(mo.y).slice(2)}` : short;
}
function consChart(a, v, W) {
  if (!a.series.length) return `<p class="fb-empty">${esc(T.noConsumption)}</p>`;
  const H = 250, L = 46, R = 14, Tp = 16, B = 30;
  const unit = v.consUnit;
  const pts = a.series.map(s => ({ ...s, y: consDisplay(s.cons, unit) }));
  const ys = pts.map(p => p.y);
  const avg = consDisplay(a.consAvg, unit);
  const sc = niceScale(Math.min(...ys, avg) - 0.1 * (Math.max(...ys) - Math.min(...ys) || 1), Math.max(...ys, avg) + 0.1 * (Math.max(...ys) - Math.min(...ys) || 1));
  const d0 = Math.max(a.from, v.first), d1 = Math.min(a.to, v.last);
  const span = Math.max(1, d1 - d0);
  const X = d => L + ((d - d0) / span) * (W - L - R);
  const Y = y => Tp + (1 - (y - sc.lo) / (sc.hi - sc.lo)) * (H - Tp - B);
  let g = '';
  for (const t of sc.ticks) g += `<line class="fb-grid-line" x1="${L}" x2="${W - R}" y1="${Y(t).toFixed(1)}" y2="${Y(t).toFixed(1)}"/><text class="fb-ax" x="${L - 8}" y="${(Y(t) + 4).toFixed(1)}" text-anchor="end">${esc(fmtTick(t, sc.step))}</text>`;
  const months = a.months.length ? a.months : [];
  for (const { mo, show } of monthTicks(months, W - L - R).map((m, i) => ({ ...m, i }))) {
    if (!show) continue;
    const x = X(Math.max(mo.start, d0));
    g += `<line class="fb-ax-line" x1="${x.toFixed(1)}" x2="${x.toFixed(1)}" y1="${H - B}" y2="${H - B + 5}"/><text class="fb-ax" x="${x.toFixed(1)}" y="${H - 8}" text-anchor="${x < L + 20 ? 'start' : 'middle'}">${esc(axisLabel(mo, months.indexOf(mo)))}</text>`;
  }
  const colors = ['var(--fuel)', 'var(--tank2)'];
  let lines = '';
  const tanks = [...new Set(pts.map(p => p.tank))].sort();
  tanks.forEach((t, ti) => {
    const mine = pts.filter(p => p.tank === t);
    lines += `<polyline fill="none" stroke="${colors[ti % 2]}" stroke-width="2.2" stroke-linejoin="round" points="${mine.map(p => `${X(p.day).toFixed(1)},${Y(p.y).toFixed(1)}`).join(' ')}"/>`;
    if (mine.length <= 160) for (const p of mine) lines += `<circle cx="${X(p.day).toFixed(1)}" cy="${Y(p.y).toFixed(1)}" r="3.4" fill="var(--sheet)" stroke="${colors[ti % 2]}" stroke-width="2"><title>${esc(`${fDate.format(dateOf(p.day))}: ${nf1.format(p.y)} ${cUnit(v)}${tanks.length > 1 ? `, ${fill(T.tankN, { n: t })}` : ''}`)}</title></circle>`;
  });
  const ay = Y(avg);
  // the dashed average goes under the fill-ups, its label over them (with a halo), so the line never runs through the words
  const avgLine = `<line class="fb-avg-line" x1="${L}" x2="${W - R}" y1="${ay.toFixed(1)}" y2="${ay.toFixed(1)}"/>`;
  const avgText = `<text class="fb-avg-text" x="${W - R}" y="${(ay - 6).toFixed(1)}" text-anchor="end">${esc(`${T.legendAvg} ${nf1.format(avg)} ${cUnit(v)}`)}</text>`;
  const legend = tanks.length > 1 ? `<ul class="fb-legend">${tanks.map((t, i) => `<li><i style="background:${colors[i % 2]}"></i>${esc(fill(T.tankN, { n: t }))}</li>`).join('')}</ul>` : `<p class="fb-note">${esc(cUnit(v))}</p>`;
  return `<svg viewBox="0 0 ${W} ${H}" role="img" aria-label="${esc(T.chartCons)}" width="${W}" height="${H}">${g}${avgLine}${lines}${avgText}</svg>${legend}`;
}
function barFrame(months, W, H, L, R, Tp, B, ymax) {
  const sc = niceScale(0, ymax);
  const Y = y => Tp + (1 - y / sc.hi) * (H - Tp - B);
  const n = months.length;
  const bw = (W - L - R) / n;
  let g = '';
  for (const t of sc.ticks) g += `<line class="fb-grid-line" x1="${L}" x2="${W - R}" y1="${Y(t).toFixed(1)}" y2="${Y(t).toFixed(1)}"/><text class="fb-ax" x="${L - 8}" y="${(Y(t) + 4).toFixed(1)}" text-anchor="end">${esc(fmtTick(t, sc.step))}</text>`;
  const maxLabels = Math.max(2, Math.floor((W - L - R) / 44));
  const k = Math.max(1, Math.ceil(n / maxLabels));
  const narrow = bw < 30;
  months.forEach((mo, i) => {
    if (i % k) return;
    const cx = L + i * bw + bw / 2;
    const lab = narrow ? fMonthNarrow.format(dateOf(mo.start)) : fMonthShort.format(dateOf(mo.start));
    g += `<text class="fb-ax" x="${cx.toFixed(1)}" y="${H - B + 17}" text-anchor="middle">${esc(lab)}</text>`;
    if (mo.m === 1 || i === 0) g += `<text class="fb-ax" x="${cx.toFixed(1)}" y="${H - B + 31}" text-anchor="middle">${mo.y}</text>`;
  });
  g += `<line class="fb-ax-line" x1="${L}" x2="${W - R}" y1="${Y(0).toFixed(1)}" y2="${Y(0).toFixed(1)}"/>`;
  return { g, Y, bw, sc };
}
function monthlyChart(a, W) {
  const months = a.months;
  if (!months.length) return `<p class="fb-empty">${esc(T.noEntries)}</p>`;
  const H = 260, L = 52, R = 10, Tp = 16, B = 44;
  const ymax = Math.max(1, ...months.map(m => Math.max(0, m.fuel) + Math.max(0, m.other)));
  const { g, Y, bw } = barFrame(months, W, H, L, R, Tp, B, ymax);
  let bars = '';
  months.forEach((mo, i) => {
    const x = L + i * bw + bw * 0.14, w = bw * 0.72;
    const fuel = Math.max(0, mo.fuel), other = Math.max(0, mo.other);
    const op = mo.partial ? 0.6 : 1;
    const tip = `${fMonth.format(dateOf(mo.start))}${mo.partial ? ` (${T.partialMonth})` : ''}: ${T.legendFuel} ${money(mo.fuel)}, ${T.legendOther} ${money(mo.other)}`;
    const yFuel = Y(fuel), yAll = Y(fuel + other);
    if (fuel > 0) bars += `<rect x="${x.toFixed(1)}" y="${yFuel.toFixed(1)}" width="${w.toFixed(1)}" height="${(Y(0) - yFuel).toFixed(1)}" fill="var(--fuel)" opacity="${op}"><title>${esc(tip)}</title></rect>`;
    if (other > 0) bars += `<rect x="${x.toFixed(1)}" y="${yAll.toFixed(1)}" width="${w.toFixed(1)}" height="${(yFuel - yAll).toFixed(1)}" fill="var(--other)" opacity="${op}"><title>${esc(tip)}</title></rect>`;
    if (!fuel && !other) bars += `<rect x="${x.toFixed(1)}" y="${(Y(0) - 2).toFixed(1)}" width="${w.toFixed(1)}" height="2" fill="var(--line-2)"><title>${esc(tip)}</title></rect>`;
    if (bw >= 38 && fuel + other > 0) bars += `<text class="fb-ax" x="${(x + w / 2).toFixed(1)}" y="${(yAll - 5).toFixed(1)}" text-anchor="middle">${nf0.format(fuel + other)}</text>`;
  });
  return `<svg viewBox="0 0 ${W} ${H}" role="img" aria-label="${esc(T.chartMonthly)}" width="${W}" height="${H}">${g}${bars}</svg>`;
}
function perKmChart(a, v, W) {
  const months = a.months;
  const vals = months.map(m => (m.cpk != null ? perDistCost(m.cpk, v.distUnit) : null));
  if (!vals.some(x => x != null)) return `<p class="fb-empty">${esc(T.noMonthDist)}</p>`;
  const H = 240, L = 52, R = 10, Tp = 16, B = 44;
  const avg = perDistCost(a.costPerKm, v.distUnit);
  const ymax = Math.max(0.01, ...vals.filter(x => x != null), Number.isFinite(avg) ? avg : 0);
  const { g, Y, bw } = barFrame(months, W, H, L, R, Tp, B, ymax);
  let bars = '';
  months.forEach((mo, i) => {
    const x = L + i * bw + bw * 0.14, w = bw * 0.72;
    const val = vals[i];
    const tip = `${fMonth.format(dateOf(mo.start))}: ${val == null ? T.noMonthDist : perKmText(mo.cpk, v.distUnit)}`;
    if (val == null) { bars += `<rect x="${x.toFixed(1)}" y="${(Y(0) - 2).toFixed(1)}" width="${w.toFixed(1)}" height="2" fill="var(--line-2)"><title>${esc(tip)}</title></rect>`; return; }
    bars += `<rect x="${x.toFixed(1)}" y="${Y(val).toFixed(1)}" width="${w.toFixed(1)}" height="${(Y(0) - Y(val)).toFixed(1)}" fill="var(--ink)" opacity="0.86"><title>${esc(tip)}</title></rect>`;
  });
  let line = '';
  if (Number.isFinite(avg) && avg > 0) line = `<line class="fb-avg-line" x1="${L}" x2="${W - R}" y1="${Y(avg).toFixed(1)}" y2="${Y(avg).toFixed(1)}"/><text class="fb-avg-text" x="${W - R}" y="${(Y(avg) - 6).toFixed(1)}" text-anchor="end">${esc(`${T.legendAvg} ${perKmText(a.costPerKm, v.distUnit)}`)}</text>`;
  return `<svg viewBox="0 0 ${W} ${H}" role="img" aria-label="${esc(fill(T.chartPerKm, { unit: T.perKm[v.distUnit] || T.perKm[0] }))}" width="${W}" height="${H}">${g}${bars}${line}</svg>`;
}

/* ---------- costs ---------- */
function renderCosts() {
  const ve = cur(), v = ve.v, a = aggOf(ve);
  const per = T.perKm[v.distUnit] || T.perKm[0];
  const counted = a.total || 1;
  const catRows = a.cats.map(c => {
    const off = ve.excluded.has(c.id);
    const share = off || counted <= 0 ? 0 : Math.max(0, Math.min(100, (c.total / counted) * 100));
    return `<tr class="${off ? 'is-off' : ''}"><th scope="row"><label class="fb-cat-check"><input type="checkbox" data-cat="${c.id}"${off ? '' : ' checked'}> <span><span class="fb-swatch"${c.color ? ` style="background:${esc(c.color)}"` : ''}></span>${esc(c.name)}${off ? ` <small class="fb-hint">(${esc(T.notCounted)})</small>` : ''}</span></label></th><td class="num">${nf0.format(c.n)}</td><td class="num">${esc(money(c.total))}</td><td><span class="fb-share"><i style="width:${share.toFixed(1)}%"></i></span></td></tr>`;
  }).join('');
  const fuelShare = counted > 0 ? Math.max(0, Math.min(100, (a.fuelCost / counted) * 100)) : 0;
  const catTable = `<div class="fb-table-scroll"><table class="fb-table"><thead><tr>${T.catCols.map((c, i) => `<th scope="col"${i === 1 || i === 2 ? ' class="num"' : ''}>${esc(c)}</th>`).join('')}</tr></thead><tbody>
<tr><th scope="row"><span class="fb-swatch" style="background:var(--fuel)"></span>${esc(T.catFuel)}</th><td class="num">${nf0.format(a.fills)}</td><td class="num">${esc(money(a.fuelCost))}</td><td><span class="fb-share is-fuel"><i style="width:${fuelShare.toFixed(1)}%"></i></span></td></tr>${catRows}</tbody>
<tfoot><tr><th scope="row">${esc(T.catTotal)}</th><td class="num"></td><td class="num">${esc(money(a.total))}</td><td></td></tr></tfoot></table></div>`;
  const mh = T.monthCols.map(c => fill(c, { unit: per }));
  const monthRows = a.months.map(m => `<tr><th scope="row">${esc(fMonth.format(dateOf(m.start)))}${m.partial ? ` <small class="fb-hint">(${esc(T.partialMonth)})</small>` : ''}</th><td class="num">${esc(money(m.fuel))}</td><td class="num">${esc(money(m.other))}</td><td class="num">${esc(money(m.fuel + m.other))}</td><td class="num">${m.dist != null ? esc(`${nf0.format(distDisplay(m.dist, v.distUnit))} ${dUnit(v)}`) : '\u2013'}</td><td class="num">${m.cpk != null ? esc(perKmText(m.cpk, v.distUnit)) : '\u2013'}</td></tr>`).join('');
  const monthTable = `<div class="fb-table-scroll"><table class="fb-table" style="min-width:620px"><thead><tr>${mh.map((c, i) => `<th scope="col"${i ? ' class="num"' : ''}>${esc(c)}</th>`).join('')}</tr></thead><tbody>${monthRows}</tbody></table></div>`;
  let yearBlock = '';
  const years = yearsOf(v);
  if (years.length > 1) {
    if (state.pro) {
      const rows = byYear(v, ve.excluded).map(r => `<tr><th scope="row">${r.y}</th><td class="num">${esc(`${nf0.format(distDisplay(r.distance, v.distUnit))} ${dUnit(v)}`)}</td><td class="num">${esc(r.consN ? `${consText(r.consAvg, v.consUnit)} ${cUnit(v)}` : '\u2013')}</td><td class="num">${esc(money(r.fuelCost))}</td><td class="num">${esc(money(r.otherCost))}</td><td class="num">${esc(money(r.total))}</td><td class="num">${esc(perKmText(r.costPerKm, v.distUnit))}</td></tr>`).join('');
      yearBlock = `<section class="fb-block"><h3>${esc(T.yearsH)}</h3><div class="fb-table-scroll"><table class="fb-table" style="min-width:680px"><thead><tr>${T.yearCols.map((c, i) => `<th scope="col"${i ? ' class="num"' : ''}>${esc(fill(c, { unit: per }))}</th>`).join('')}</tr></thead><tbody>${rows}</tbody></table></div></section>`;
    } else yearBlock = `<section class="fb-block"><h3>${esc(T.yearsH)}<span class="fb-tag">Pro</span></h3><p class="fb-note">${esc(T.needPeriod)}</p><p><button type="button" class="btn fb-btn-quiet" data-need="period">${esc(T.openWithPro)}</button></p></section>`;
  }
  $('costs-body').innerHTML = `<section class="fb-block"><h3>${esc(T.costsH)}</h3><p class="fb-note">${esc(T.costsNote)}</p>${catTable}<p class="fb-note">${esc(T.catIncomeNote)}</p></section><section class="fb-block"><h3>${esc(T.monthH)}</h3>${monthTable}</section>${yearBlock}`;
}

/* ---------- entries ---------- */
function entryHtml(e, v) {
  const date = fDate.format(dateOf(e.day));
  const odo = Number.isFinite(e.odo) ? `<span class="fb-e-odo">${nf0.format(distDisplay(e.odo, v.distUnit))} ${esc(dUnit(v))}</span>` : '';
  if (e.kind === 'fuel') {
    const r = e.r;
    const vol = Number.isFinite(r.litres) ? fill(T.fillLine, { vol: nf2.format(volDisplay(r.litres, v.fuelUnit)), unit: vUnit(v), ppu: Number.isFinite(r.ppu) ? money(r.ppu, 3) : '\u2013' }) : r.alt && Number.isFinite(r.fuelRaw) ? altLine(r) : '';
    const sub = [r.city, !r.full ? T.partialFill : '', r.missed ? T.missedFill : '', r.notes].filter(Boolean).join(' · ');
    const cons = r.cons != null && !(r.cons < 1 || r.cons > 80) ? `${consText(r.cons, v.consUnit)} <small>${esc(cUnit(v))}</small>` : '';
    return `<li><span class="fb-e-date">${esc(date)}${odo}</span><span class="fb-e-main"><span class="fb-e-kind">${esc(T.fillUp)}</span><strong>${esc(vol)}</strong>${sub ? `<span class="fb-e-sub">${esc(sub)}</span>` : ''}</span><span class="fb-e-amt">${Number.isFinite(r.price) ? esc(money(r.price, 2)) : ''}</span><span class="fb-e-cons">${cons}</span></li>`;
  }
  const c = e.c;
  const sub = [c.title && c.notes ? c.notes : '', e.off ? T.notCounted : ''].filter(Boolean).join(' · ');
  return `<li${e.off ? ' class="is-off"' : ''}><span class="fb-e-date">${esc(date)}${odo}</span><span class="fb-e-main"><span class="fb-e-kind is-cost">${esc(c.category)}</span><strong>${esc(c.title || c.category)}</strong>${sub ? `<span class="fb-e-sub">${esc(sub)}</span>` : ''}</span><span class="fb-e-amt">${esc(money(c.amount, 2))}</span><span class="fb-e-cons"></span></li>`;
}
function renderEntries() {
  const ve = cur(), v = ve.v;
  const all = entriesOf(v, windowOf(v), ve.excluded);
  const needle = state.filter.trim().toLocaleLowerCase();
  const list = all.filter(e => {
    if (state.kind === 'fuel' && e.kind !== 'fuel') return false;
    if (state.kind === 'cost' && e.kind !== 'cost') return false;
    if (!needle) return true;
    const hay = e.kind === 'fuel' ? `${e.r.city} ${e.r.notes} ${fDate.format(dateOf(e.day))}` : `${e.c.title} ${e.c.category} ${e.c.notes} ${fDate.format(dateOf(e.day))}`;
    return hay.toLocaleLowerCase().includes(needle);
  });
  const shown = list.slice(0, state.shown);
  $('entry-count').textContent = fill(T.entryCount, { shown: nf0.format(shown.length), n: nf0.format(list.length) });
  $('entry-list').innerHTML = shown.length ? shown.map(e => entryHtml(e, v)).join('') : `<li style="display:block"><span class="fb-empty">${esc(T.noEntries)}</span></li>`;
  $('btn-more').hidden = list.length <= shown.length;
}

/* ---------- compare (Pro) ---------- */
function renderCompare() {
  const box = $('compare-body');
  if (!state.pro) {
    box.innerHTML = `<h3>${esc(T.compareH)}</h3><p class="fb-note">${esc(T.compareNote)}</p><div class="fb-locked"><p>${esc(fill(T.compareLocked, { n: state.vehicles.length }))}</p><ul>${state.vehicles.map(x => `<li>${esc(x.label)}</li>`).join('')}</ul><button type="button" class="btn fb-btn-pro" data-need="compare">${esc(T.openWithPro)}</button></div>`;
    return;
  }
  if (state.vehicles.length < 2) { box.innerHTML = `<h3>${esc(T.compareH)}</h3><p class="fb-note">${esc(T.compareOne)}</p>`; return; }
  // the units picked apply to petrol, diesel and LPG; a vehicle logged in kWh, kg or m3 keeps its own unit and gets no bar
  // in the rows where units differ
  if (state.cmpUnit == null || !CONS_UNIT_UNITS[state.cmpUnit]) { const liq = state.vehicles.find(x => x.v.fuelUnit !== OWN && CONS_UNIT_UNITS[x.v.consUnit]); state.cmpUnit = liq ? liq.v.consUnit : 0; }
  const [dIdx, vIdx] = CONS_UNIT_UNITS[state.cmpUnit];
  const per = T.perKm[dIdx];
  const aggs = state.vehicles.map(ve => aggOf(ve, state.cmpPeriod));
  const unitLabel = T.consUnits[state.cmpUnit];
  const own = ve => ve.v.fuelUnit === OWN;
  const cellOf = (x, fmt, bar = true) => ({ x, text: Number.isFinite(x) ? fmt(x) : '\u2013', bar });
  const metrics = [
    { label: T.compareRows[0], cell: a => cellOf(distDisplay(a.distance, dIdx), x => `${nf0.format(x)} ${T.distUnits[dIdx]}`) },
    { label: T.compareRows[1], cell: (a, ve) => (own(ve) ? cellOf(a.consN ? consDisplay(a.consAvg, dIdx === 1 ? OWN_MI : OWN_KM) : NaN, x => `${nf1.format(x)} ${vUnit(ve.v)}/100 ${T.distUnits[dIdx]}`, false) : cellOf(a.consN ? consDisplay(a.consAvg, state.cmpUnit) : NaN, x => `${nf1.format(x)} ${unitLabel}`)) },
    { label: fill(T.compareRows[2], { unit: per }), cell: a => cellOf(perDistCost(a.costPerKm, dIdx), x => money(x, x < 1 ? 3 : 2)) },
    { label: T.compareRows[3], cell: a => cellOf(a.perMonth, x => money(x)) },
    { label: T.compareRows[4], cell: a => cellOf(a.total, x => money(x)) },
    { label: T.compareRows[5], cell: (a, ve) => (own(ve) ? cellOf(a.pricePerLitre, x => `${money(x, 3)} / ${vUnit(ve.v)}`, false) : cellOf(perUnitPrice(a.pricePerLitre, vIdx), x => `${money(x, 3)} / ${T.volUnits[vIdx]}`)) },
    { label: T.compareRows[6], cell: a => cellOf(a.fills, x => nf0.format(x)) },
  ];
  const body = metrics.map(m => {
    const cells = aggs.map((a, i) => m.cell(a, state.vehicles[i]));
    const max = Math.max(...cells.filter(c => c.bar && Number.isFinite(c.x)).map(c => c.x), 0.0001);
    return `<tr><th scope="row">${esc(m.label)}</th>${cells.map(c => `<td><span class="fb-c-val">${esc(c.text)}</span><span class="fb-c-bar" aria-hidden="true"><i style="width:${c.bar && Number.isFinite(c.x) ? Math.max(2, (c.x / max) * 100).toFixed(1) : 0}%"></i></span></td>`).join('')}</tr>`;
  }).join('');
  const opts = T.unitsOption.map((o, i) => `<option value="${i}"${i === state.cmpUnit ? ' selected' : ''}>${esc(o)}</option>`).join('');
  box.innerHTML = `<h3>${esc(T.compareH)}</h3><p class="fb-note">${esc(T.compareNote)}</p>
<div class="fb-compare-tools"><label class="fb-field"><span>${esc(T.compareUnits)}</span><select class="select" id="cmp-unit">${opts}</select></label>
<div class="fb-field"><span id="cmp-period-l">${esc(T.comparePeriod)}</span><div class="fb-seg" id="cmp-period" role="group" aria-labelledby="cmp-period-l"><button type="button" data-value="last12" aria-pressed="${state.cmpPeriod === 'last12'}">${esc(T.last12)}</button><button type="button" data-value="all" aria-pressed="${state.cmpPeriod === 'all'}">${esc(T.allTime)}</button></div></div></div>
<div class="fb-table-scroll"><table class="fb-compare"><thead><tr><td></td>${state.vehicles.map(ve => `<th scope="col">${esc(ve.label)}</th>`).join('')}</tr></thead><tbody>${body}</tbody></table></div>`;
}

/* ---------- save and print (Pro) ---------- */
const ALL = 'all';
function yearChoices(vehicleIdx) {
  const set = new Set();
  const list = vehicleIdx === ALL ? state.vehicles : [state.vehicles[Number(vehicleIdx)]];
  for (const ve of list) for (const y of yearsOf(ve.v)) set.add(y);
  return [...set].sort((a, b) => a - b);
}
function fillYears(sel, vehicleIdx) {
  const ys = yearChoices(vehicleIdx);
  const opts = ys.slice().reverse().map(y => `<option value="${y}">${y}</option>`);
  if (ys.length > 1) opts.unshift(`<option value="all">${esc(fill(T.yearsAll, { from: ys[0], to: ys[ys.length - 1] }))}</option>`);
  sel.innerHTML = opts.join('');
}
function fillSaveOptions() {
  const opts = state.vehicles.map((ve, i) => `<option value="${i}">${esc(ve.label)}</option>`).join('');
  $('book-vehicle').innerHTML = opts;
  $('csv-vehicle').innerHTML = (state.vehicles.length > 1 ? `<option value="${ALL}">${esc(T.allVehicles)}</option>` : '') + opts;
  fillYears($('book-years'), $('book-vehicle').value);
  fillYears($('csv-years'), $('csv-vehicle').value);
  if (!$('book-title').value) $('book-title').value = T.bookTitle;
}
const yearsWindow = (sel, ys) => (sel === 'all' ? { from: dayNumber(ys[0], 1, 1), to: dayNumber(ys[ys.length - 1], 12, 31) } : yearWindow(Number(sel)));
const status = (id, text) => { $(id).textContent = text; };
const busy = (btn, on) => { btn.disabled = on; btn.setAttribute('aria-busy', String(on)); };
const fileSafe = s => String(s).normalize('NFKD').replace(/[^\w.-]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 40) || 'log';
let fontsOk = null;
function fontsReady() {
  if (!fontsOk) fontsOk = Promise.all(['800 40px "Fillbook Display"', '600 40px "Fillbook Display"', '400 40px "Fillbook Text"', '700 40px "Fillbook Text"'].map(f => document.fonts.load(f).catch(() => null)));
  return fontsOk;
}

async function saveBook() {
  if (!needPro(T.needBook)) return;
  const btn = $('btn-book');
  busy(btn, true);
  try {
    const ve = state.vehicles[Number($('book-vehicle').value)], v = ve.v;
    const ys = yearChoices($('book-vehicle').value);
    const win = yearsWindow($('book-years').value, ys);
    const a = aggregate(v, win, ve.excluded);
    const per = T.perKm[v.distUnit] || T.perKm[0];
    await fontsReady();
    status('book-status', fill(T.bookWorking, { n: 1 }));
    const B = T.book;
    const hist = v.costs.filter(c => c.day >= win.from && c.day <= win.to && !ve.excluded.has(c.typeId));
    const excludedNames = [...ve.excluded].map(id => (v.cats.get(id) || {}).name).filter(Boolean);
    const odos = v.events.filter(e => e.day >= win.from && e.day <= win.to).map(e => e.odo);
    const input = {
      paper: document.querySelector('#book-paper [aria-pressed="true"]').dataset.value,
      title: $('book-title').value.trim() || T.bookTitle, locale: LOC, labels: B,
      vehicle: { name: ve.label, sub: [v.make && v.model ? `${v.make} ${v.model}` : v.make || v.model, v.year ? String(v.year) : ''].filter(Boolean).join(', '), plate: $('book-plate').checked ? v.plate : '', vin: $('book-plate').checked ? v.vin : '' },
      period: fill(B.period, { from: fDate.format(dateOf(Math.max(win.from, v.first))), to: fDate.format(dateOf(Math.min(win.to, v.last))) }),
      odoLine: odos.length ? fill(B.odo, { from: `${nf0.format(distDisplay(odos[0], v.distUnit))} ${dUnit(v)}`, to: `${nf0.format(distDisplay(odos[odos.length - 1], v.distUnit))} ${dUnit(v)}` }) : '',
      made: fill(B.made, { date: fDate.format(new Date()) }),
      figures: [
        [B.distance, `${nf0.format(distDisplay(a.distance, v.distUnit))} ${dUnit(v)}`], [B.fuel, `${nf0.format(volDisplay(a.litres, v.fuelUnit))} ${vUnit(v)}`],
        [B.consumption, a.consN ? `${consText(a.consAvg, v.consUnit)} ${cUnit(v)}` : '\u2013'], [B.price, Number.isFinite(a.pricePerLitre) ? `${money(perUnitPrice(a.pricePerLitre, v.fuelUnit), 3)} / ${vUnit(v)}` : '\u2013'],
        [B.fuelCost, money(a.fuelCost)], [B.otherCost, money(a.otherCost)], [B.total, money(a.total)], [fill(B.perKm, { unit: per }), perKmText(a.costPerKm, v.distUnit)], [B.perMonth, money(a.perMonth)],
      ],
      yearRows: yearsOf(v).filter(y => y >= dayParts(win.from).y && y <= dayParts(win.to).y).map(y => { const r = aggregate(v, yearWindow(y), ve.excluded); return [String(y), money(r.fuelCost), money(r.otherCost), money(r.total), r.distance > 1 ? `${nf0.format(distDisplay(r.distance, v.distUnit))} ${dUnit(v)}` : '\u2013']; }),
      yearCols: [B.year, T.legendFuel, T.legendOther, B.total, B.distance],
      catRows: a.cats.filter(c => !ve.excluded.has(c.id)).map(c => [c.name, nf0.format(c.n), money(c.total)]),
      history: hist.map(c => ({ day: c.day, year: dayParts(c.day).y, date: fDate.format(dateOf(c.day)), odo: Number.isFinite(c.odo) ? `${nf0.format(distDisplay(c.odo, v.distUnit))} ${dUnit(v)}` : '', what: c.title || c.category, cat: (c.title || c.category) === c.category ? '' : c.category, notes: c.notes, amount: money(c.amount, 2), value: c.amount })),
      yearTotals: Object.fromEntries(yearsOf(v).map(y => [y, money(hist.filter(c => dayParts(c.day).y === y).reduce((s, c) => s + c.amount, 0), 2)])),
      fuelRows: $('book-fuel').checked ? v.log.filter(r => r.day >= win.from && r.day <= win.to).map(r => [fDate.format(dateOf(r.day)), Number.isFinite(r.odo) ? `${nf0.format(distDisplay(r.odo, v.distUnit))}` : '', Number.isFinite(r.litres) ? `${nf2.format(volDisplay(r.litres, v.fuelUnit))} ${vUnit(v)}` : r.alt && Number.isFinite(r.fuelRaw) ? altLine(r) : '', Number.isFinite(r.ppu) ? money(r.ppu, 3) : '', Number.isFinite(r.price) ? money(r.price, 2) : '', r.cons != null && !(r.cons < 1 || r.cons > 80) ? consText(r.cons, v.consUnit) : '']) : [],
      noteLine: excludedNames.length ? fill(B.note, { list: excludedNames.join(', ') }) : B.nonNote,
      emptyLine: B.none,
      onProgress: n => status('book-status', fill(T.bookWorking, { n: nf0.format(n) })),
      onText: window.__fbTrace ? t => window.__fbTrace.push(t) : null,
    };
    if (!hist.length && !input.fuelRows.length) { status('book-status', T.bookEmpty); return; }
    const { blob, pages } = await makeBook(input);
    const file = `fillbook-${fileSafe(ve.label)}-${$('book-years').value === 'all' ? `${ys[0]}-${ys[ys.length - 1]}` : $('book-years').value}.pdf`;
    window.PeakUI.download(blob, file);
    status('book-status', fill(T.bookDone, { file, pages: nf0.format(pages) }));
  } catch (e) { status('book-status', fill(T.failed, { detail: e.message || e })); }
  finally { busy(btn, false); }
}

function saveCsv() {
  if (!needPro(T.needCsv)) return;
  try {
    const sel = $('csv-vehicle').value;
    const list = sel === ALL ? state.vehicles : [state.vehicles[Number(sel)]];
    const ys = yearChoices(sel);
    const win = yearsWindow($('csv-years').value, ys);
    const bizRaw = $('csv-business').value.trim().replace(',', '.');
    const biz = bizRaw === '' ? null : Math.max(0, Math.min(100, Number(bizRaw)));
    const res = buildCsv({
      items: list.map(ve => ({ v: ve.v, name: ve.label, dist: dUnit(ve.v), vol: vUnit(ve.v) })), win, includeFuel: $('csv-fuel').checked, excel: $('csv-excel').checked,
      business: Number.isFinite(biz) ? biz : null, labels: T.csvLabels, excludedOf: v => state.vehicles.find(x => x.v === v).excluded,
    });
    const file = `fillbook-${fileSafe(sel === ALL ? 'all-vehicles' : list[0].label)}-${$('csv-years').value === 'all' ? `${ys[0]}-${ys[ys.length - 1]}` : $('csv-years').value}.csv`;
    window.PeakUI.download(new Blob([res.text], { type: 'text/csv;charset=utf-8' }), file);
    status('csv-status', fill(T.csvDone, { file, n: nf0.format(res.rows) }));
  } catch (e) { status('csv-status', fill(T.failed, { detail: e.message || e })); }
}

/* ---------- wiring ---------- */
function wire() {
  const input = $('file-input');
  $('btn-choose').addEventListener('click', () => input.click());
  input.addEventListener('change', () => { if (input.files && input.files.length) openFiles(input.files); input.value = ''; });
  $('btn-sample').addEventListener('click', openSample);
  $('btn-error-sample').addEventListener('click', openSample);
  $('btn-retry').addEventListener('click', () => { stage('idle'); input.click(); });
  $('btn-reset').addEventListener('click', () => { resetResults(); stage('idle'); focusEl($('drop-title')); });
  $('btn-see').addEventListener('click', e => { e.preventDefault(); const j = $('log'); j.scrollIntoView({ behavior: reduceMotion() ? 'auto' : 'smooth' }); focusEl(j); });
  $('btn-add').addEventListener('click', () => $('file-add').click());
  $('file-add').addEventListener('change', () => { const f = $('file-add'); if (f.files && f.files.length) openFiles(f.files, true); f.value = ''; });
  const drop = $('drop');
  ['dragenter', 'dragover'].forEach(ev => drop.addEventListener(ev, e => { e.preventDefault(); drop.classList.add('is-over'); }));
  ['dragleave', 'drop'].forEach(ev => drop.addEventListener(ev, e => { e.preventDefault(); drop.classList.remove('is-over'); }));
  drop.addEventListener('drop', e => { const f = e.dataTransfer && e.dataTransfer.files; if (f && f.length) openFiles(f); });
  window.addEventListener('dragover', e => e.preventDefault());
  window.addEventListener('drop', e => { e.preventDefault(); if (!drop.contains(e.target)) { const f = e.dataTransfer && e.dataTransfer.files; if (f && f.length) openFiles(f, state.vehicles.length > 0); } });

  $('vehicles').addEventListener('click', e => { const b = e.target.closest('button[data-vehicle]'); if (!b) return; const i = Number(b.dataset.vehicle); if (!allowedVehicle(i)) { needPro(T.needVehicle); return; } state.vi = i; state.filter = ''; state.shown = 300; fillBookDefaults(); refreshAll(); });
  $('periods').addEventListener('click', e => { const b = e.target.closest('button[data-period]'); if (!b) return; if (!allowedPeriod(b.dataset.period)) { needPro(T.needPeriod); return; } state.period = b.dataset.period; state.shown = 300; refreshAll(); });
  const tabs = () => [...document.querySelectorAll('[role=tab]')];
  $('tablist').addEventListener('click', e => { const t = e.target.closest('[role=tab]'); if (t) setView(t.dataset.view, false); });
  $('tablist').addEventListener('keydown', e => {
    const list = tabs(), i = list.indexOf(document.activeElement);
    if (i < 0 || !['ArrowLeft', 'ArrowRight', 'Home', 'End'].includes(e.key)) return;
    e.preventDefault();
    const j = e.key === 'Home' ? 0 : e.key === 'End' ? list.length - 1 : (i + (e.key === 'ArrowRight' ? 1 : -1) + list.length) % list.length;
    list[j].click(); list[j].focus();
  });
  $('currency').addEventListener('input', () => { state.currency = $('currency').value.slice(0, 6); if (state.vehicles.length) refreshView(); });
  document.addEventListener('click', e => {
    const need = e.target.closest('[data-need]');
    if (need) { needPro({ compare: T.needCompare, period: T.needPeriod }[need.dataset.need]); return; }
    const more = e.target.closest('#btn-more'); if (more) { state.shown += 300; renderEntries(); return; }
    const seg = e.target.closest('#cmp-period button'); if (seg) { state.cmpPeriod = seg.dataset.value; renderCompare(); return; }
  });
  document.addEventListener('change', e => {
    const cat = e.target.closest('input[data-cat]');
    if (cat) { const id = Number(cat.dataset.cat), ex = cur().excluded; if (cat.checked) ex.delete(id); else ex.add(id); refreshAll(); return; }
    if (e.target.id === 'kind') { state.kind = e.target.value; state.shown = 300; renderEntries(); return; }
    if (e.target.id === 'cmp-unit') { state.cmpUnit = Number(e.target.value); renderCompare(); return; }
    if (e.target.id === 'book-vehicle') fillYears($('book-years'), e.target.value);
    if (e.target.id === 'csv-vehicle') fillYears($('csv-years'), e.target.value);
  });
  let qTimer = null;
  document.addEventListener('input', e => { if (e.target.id !== 'q') return; clearTimeout(qTimer); qTimer = setTimeout(() => { state.filter = e.target.value; state.shown = 300; renderEntries(); }, 180); });
  $('book-paper').addEventListener('click', e => { const b = e.target.closest('button[data-value]'); if (!b) return; $('book-paper').querySelectorAll('button').forEach(x => x.setAttribute('aria-pressed', String(x === b))); });
  $('btn-book').addEventListener('click', saveBook);
  $('btn-csv').addEventListener('click', saveCsv);
  let rTimer = null, lastW = window.innerWidth;
  window.addEventListener('resize', () => { clearTimeout(rTimer); rTimer = setTimeout(() => { if (window.innerWidth !== lastW) { lastW = window.innerWidth; if (state.vehicles.length && state.view === 'overview') renderOverview(); } }, 160); });
}
function fillBookDefaults() { if ($('book-vehicle')) { $('book-vehicle').value = String(state.vi); fillYears($('book-years'), String(state.vi)); } }

buildShell();
setupLicense();
wire();
if (!window.PeakLicense) window.addEventListener('DOMContentLoaded', setupLicense, { once: true });
