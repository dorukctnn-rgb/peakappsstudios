/* Tallyband page logic. The archive is read in a worker in this tab (js/worker.js); nothing is sent anywhere. The only
 * network call the page can make is Gumroad's licence check (/assets/license.js), and only when a Pro key is pasted. */
import { PRO, PRO_READY, PRO_PITCH } from '/export-fitbit-data/js/pro.js';

const $ = id => document.getElementById(id);
const esc = s => String(s).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
const fmt = n => Number(n).toLocaleString('nl-NL');
const UNITS = {"day":["dag","dagen"],"night":["nacht","nachten"],"weigh-in":["weging","wegingen"],"workout":["training","trainingen"],"file":["bestand","bestanden"],"row":["rij","rijen"]};
const plural = (n, one, many) => { const u = UNITS[one] || [one, many]; return `${fmt(n)} ${u[n === 1 ? 0 : 1]}`; };
const reduced = () => matchMedia('(prefers-reduced-motion: reduce)').matches;

let worker = null, meta = null, pro = false, busy = false, seq = 0;
const waiting = new Map();

/* ------------------------------------------------------------------ Pro */
function setupPro() {
  if (!window.PeakLicense) return;
  PeakLicense.setup({ tool: 'tallyband', productId: PRO_READY ? PRO.productId : 'PENDING', permalink: PRO.permalink, buyUrl: PRO.url, pitch: "Met Pro bewaar je alles voor jouw datums in één keer: één Excel-bestand met een tabblad per soort gegevens, of elke tabel als CSV-bestand in één ZIP, plus elke hartslagmeting, stappen per minuut en elke slaapfase. 8 dollar, eenmalig.", strings: {"title":"Pro nemen","buy":"Koop Pro op Gumroad","keyLabel":"Al gekocht? Plak je licentiesleutel","verify":"Activeren","close":"Sluiten","checking":"Controleren bij Gumroad…","badKey":"Dat lijkt geen licentiesleutel. Je vindt hem in de bevestigingsmail van Gumroad.","network":"Gumroad is niet bereikbaar om de sleutel te controleren. Controleer je verbinding en probeer het opnieuw.","ok":"Pro is actief in deze browser. Bedankt.","refunded":"Deze aankoop is terugbetaald of beëindigd, dus Pro staat uit.","rejected":"Die licentiesleutel is niet geaccepteerd.","active":"Pro is actief in deze browser."}, localMessages: true });
  pro = PRO_READY && PeakLicense.isPro();
  document.body.classList.toggle('is-pro', pro);
  PeakLicense.onChange(p => { pro = PRO_READY && p; document.body.classList.toggle('is-pro', pro); proNote(); renderDownloads(); });
}
function proNote() {
  $('pro-note').textContent = pro ? 'Pro staat aan in deze browser. Kies een formaat.' : 'Eén Excel-bestand met een tabblad per tabel, of elke tabel als CSV-bestand in één ZIP. 8 dollar, eenmalig.';
}
function needPro(why) {
  if (PRO_READY && window.PeakLicense && PeakLicense.isPro()) return true;
  if (window.PeakLicense) PeakLicense.open(why); else window.open(PRO.url, '_blank', 'noopener');
  return false;
}

/* ------------------------------------------------------------------ worker */
function getWorker() {
  if (worker) return worker;
  worker = new Worker(new URL('/export-fitbit-data/js/worker.js', import.meta.url), { type: 'module' });
  worker.onmessage = ev => {
    const m = ev.data || {};
    if (m.type === 'progress') { progress(m); return; }
    if (m.type === 'loaded') { loaded(m.meta); return; }
    const w = waiting.get(m.id);
    if (w) { waiting.delete(m.id); (m.type === 'fail' ? w.reject : w.resolve)(m); }
    else if (m.type === 'fail') showError({ code: m.code, message: m.message });
  };
  worker.onerror = e => { e.preventDefault(); showError({ code: 'worker', message: e.message }); };
  return worker;
}
function ask(msg) {
  const id = ++seq;
  return new Promise((resolve, reject) => { waiting.set(id, { resolve, reject }); getWorker().postMessage(Object.assign({ id }, msg)); });
}

/* ------------------------------------------------------------------ stages */
function stage(name) {
  for (const s of ['idle', 'busy', 'error']) $('stage-' + s).hidden = s !== name;
  $('panel').dataset.state = name;
}
function progress(m) {
  const what = m.stage === 'list' ? 'Bestanden opsommen' : m.stage === 'export' ? 'Voorbereiden' : 'Lezen';
  $('busy-sub').textContent = `${what} ${m.file || ''}`.trim();
  const pct = m.n ? Math.min(100, Math.round(((m.i || 0) + 1) / m.n * 100)) : 0;
  $('busy-bar').style.width = pct + '%';
}
const ERRORS = {
  empty: ['Het bestand is leeg', 'Er zit niets in. Is de download onderbroken, download het archief dan opnieuw via Google Takeout.'],
  zip: ['De ZIP kon niet worden gelezen', 'Mogelijk is de download halverwege afgebroken. Download hem opnieuw via de link in de e-mail van Google. Elk deel is ongeveer een week geldig.'],
  encrypted: ['De ZIP is met een wachtwoord beveiligd', 'Google zet nooit een wachtwoord op Takeout-archieven. Dit bestand is dus na het downloaden aangepast. Gebruik de originele ZIP.'],
  pdf: ['Dit is een PDF, geen Fitbit-archief', 'Het archief is een ZIP van Google Takeout. Heb je een rapport als PDF opgeslagen, dan open je dat in een gewone PDF-lezer.'],
  rar: ['Dit is een RAR-bestand', 'Takeout levert ZIP-bestanden. Pak het eerst uit en kies de ZIP of de Fitbit-map erin.'],
  '7z': ['Dit is een 7-Zip-bestand', 'Takeout levert ZIP-bestanden. Pak het eerst uit en kies de ZIP of de Fitbit-map erin.'],
  tgz: ['Dit is een .tgz-archief', 'Kies .zip als bestandstype bij het maken van de Takeout-export en open de ZIP dan hier. Of pak de .tgz uit en kies de Fitbit-map.'],
  type: ['Dit bestand hoort niet bij een Fitbit-archief', 'Kies de ZIP van Google Takeout, of JSON- en CSV-bestanden uit de Fitbit-map.'],
  unknown: ['Tallyband kent dit bestand niet', 'Het is een JSON- of CSV-bestand, maar niet uit een Fitbit-archief. Kies in plaats daarvan de hele Takeout-ZIP.'],
  nofitbit: ['Deze ZIP bevat geen Fitbit-gegevens', 'Deze Takeout-export bevat andere Google-producten. Maak een nieuwe export waarbij alleen Google Health (of Fitbit) is aangevinkt, of kies de andere delen van de export.'],
  worker: ['Je browser heeft de lezer gestopt', 'Het archief is misschien te groot voor het geheugen van dit tabblad. Sluit andere tabbladen en probeer het opnieuw, of kies alleen de Fitbit-map van het uitgepakte archief.'],
};
function showError(e) {
  const [t, d] = ERRORS[e && e.code] || ['Het archief kon niet worden gelezen', `Het stopte bij: ${e && e.message ? e.message : e}. Is dit een Takeout-archief, download het dan opnieuw.`];
  $('error-title').textContent = t;
  $('error-text').textContent = d;
  stage('error');
  $('error-title').focus();
}

/* ------------------------------------------------------------------ open */
function start(files, sample = false) {
  if (busy) return;
  busy = true;
  stage('busy');
  $('busy-title').textContent = sample ? 'Voorbeeldarchief maken' : 'Je archief lezen';
  $('busy-sub').textContent = 'In je browser, op dit apparaat.';
  $('busy-bar').style.width = '0%';
  $('busy-title').focus();
  getWorker().postMessage(sample ? { type: 'sample' } : { type: 'open', files });
}
function loaded(m) {
  busy = false;
  meta = m;
  if (!m.coverage.days) {
    const p = m.problems[0];
    showError(p ? { code: p.reason, message: p.detail || p.name } : { code: 'nofitbit' });
    return;
  }
  stage('idle');
  $('results').hidden = false;
  $('sample-note').hidden = !m.sample;
  fillSettings(m);
  setRange(defaultRange(m));
  renderMeta();
  renderFound();
  refresh();
  $('results').scrollIntoView({ behavior: reduced() ? 'auto' : 'smooth', block: 'start' });
  $('res-title').focus({ preventScroll: true });
}

/* ------------------------------------------------------------------ settings */
const ZONES = (() => { try { return ['UTC'].concat(Intl.supportedValuesOf('timeZone').filter(z => z !== 'UTC')); } catch { return ['UTC', 'Europe/London', 'Europe/Berlin', 'America/New_York', 'America/Chicago', 'America/Denver', 'America/Los_Angeles', 'Australia/Sydney', 'Asia/Tokyo']; } })();
const DEVICE_TZ = (() => { try { return Intl.DateTimeFormat().resolvedOptions().timeZone || 'UTC'; } catch { return 'UTC'; } })();
function fillSettings(m) {
  const tz = m.tz || DEVICE_TZ;
  const list = ZONES.includes(tz) ? ZONES : [tz].concat(ZONES);
  $('tz').innerHTML = list.map(z => `<option${z === tz ? ' selected' : ''}>${esc(z)}</option>`).join('');
  if (!m.tz) ask({ type: 'settings', tz, auto: true }).then(r => { meta = r.meta; renderMeta(); refresh(); });
  $('unit').value = m.unit || 'lb';
  optNote();
}
function optNote() {
  const m = meta, bits = [];
  bits.push(m.tzFrom === 'profile' ? `Tijdzone uit je Fitbit-profiel (${m.tz}).` : m.tzFrom === 'you' ? `Tijdzone door jou ingesteld (${m.tz}).` : `Je archief noemt geen tijdzone, dus de tijdzone van dit apparaat wordt gebruikt (${$('tz').value}). Pas hem aan als je ergens anders woonde.`);
  if (m.weight.basis === 'bmi') bits.push(`De gewichten lijken in ${m.weight.unit === 'kg' ? 'kilogram' : 'ponden'} te staan, afgeleid uit de BMI die bij ${plural(m.weight.n, 'weigh-in', 'weigh-ins')} is opgeslagen.`);
  else if (m.counts.weights) bits.push('Het archief bewaart geen BMI bij je wegingen. Vergelijk dus één waarde met de app en kies de eenheid zelf.');
  $('opt-note').textContent = bits.join(' ');
}
function defaultRange(m) {
  const last = m.coverage.last, first = m.coverage.first;
  const yearAgo = addDays(last, -364);
  return { from: yearAgo > first ? yearAgo : first, to: last };
}
const addDays = (d, n) => new Date(Date.parse(d + 'T00:00:00Z') + n * 864e5).toISOString().slice(0, 10);
function setRange(r) {
  const { first, last } = meta.coverage;
  $('from').min = $('to').min = first; $('from').max = $('to').max = last;
  $('from').value = r.from; $('to').value = r.to;
  renderChips();
}
function range() {
  let from = $('from').value || meta.coverage.first, to = $('to').value || meta.coverage.last;
  if (from > to) [from, to] = [to, from];
  return { from, to };
}
function renderChips() {
  const { first, last } = meta.coverage;
  const y0 = +first.slice(0, 4), y1 = +last.slice(0, 4);
  const chips = [['Laatste 30 dagen', addDays(last, -29), last], ['Laatste 12 maanden', addDays(last, -364), last]];
  for (let y = y1; y >= Math.max(y0, y1 - 5); y--) chips.push([String(y), `${y}-01-01`, `${y}-12-31`]);
  chips.push(['Alles', first, last]);
  const cur = range();
  $('chips').innerHTML = chips.map(([t, a, b]) => {
    const f = a < first ? first : a, l = b > last ? last : b;
    return `<button type="button" class="tb-chip" data-from="${f}" data-to="${l}" aria-pressed="${cur.from === f && cur.to === l}">${esc(t)}</button>`;
  }).join('');
}

/* ------------------------------------------------------------------ render */
function renderMeta() {
  const c = meta.coverage, n = meta.counts;
  const parts = [`${plural(c.days, 'day', 'days')} van ${c.first} tot ${c.last}`];
  if (n.nights) parts.push(plural(n.nights, 'night', 'nights'));
  if (n.weights) parts.push(plural(n.weights, 'weigh-in', 'weigh-ins'));
  if (n.workouts) parts.push(plural(n.workouts, 'workout', 'workouts'));
  $('res-meta').textContent = parts.join(', ') + '.';
  optNote();
}
const COLS = [['date', 'Datum'], ['steps', 'Stappen'], ['distance_km', 'km'], ['calories_kcal', 'kcal'], ['resting_heart_rate', 'Rusthartslag'], ['sleep_min', 'Slaap min'], ['sleep_score', 'Score'], ['weight_kg', 'kg']];
let previewToken = 0;
async function refresh() {
  if (!meta) return;
  const t = ++previewToken;
  const { from, to } = range();
  renderChips();
  const r = await ask({ type: 'preview', from, to, limit: 8 });
  if (t !== previewToken) return;
  const cols = COLS.filter(([k]) => k === 'date' || r.rows.some(x => x[k] !== ''));
  $('preview').innerHTML = r.rows.length
    ? `<thead><tr>${cols.map(([k, h]) => `<th scope="col"${k === 'date' ? '' : ' class="tb-num"'}>${esc(h)}</th>`).join('')}</tr></thead><tbody>${r.rows.map(x => `<tr>${cols.map(([k]) => (k === 'date' ? `<th scope="row">${esc(x[k])}</th>` : `<td class="tb-num">${x[k] === '' ? '' : esc(typeof x[k] === 'number' ? fmt(x[k]) : x[k])}</td>`)).join('')}</tr>`).join('')}</tbody>`
    : '<tbody><tr><td>Geen gegevens tussen deze datums.</td></tr></tbody>';
  $('prev-sub').textContent = r.total ? `De eerste ${Math.min(8, r.total)} van ${plural(r.total, 'day', 'days')} tussen ${from} en ${to}. De CSV heeft ${Object.keys(r.rows[0] || {}).length} kolommen.` : '';
  counts = r.counts;
  renderDownloads();
}
let counts = {};
const MAIN = [
  ['daily', 'Dagoverzicht', 'Stappen, afstand, calorieën, actieve minuten, rusthartslag, slaap, score, HRV, SpO2, gewicht', false],
  ['sleep', 'Slaap', 'Eén rij per nacht of dutje: tijden, minuten slaap en wakker, fases, efficiëntie, score', false],
  ['weight', 'Gewicht', 'Elke weging in kg en lb, met BMI, vetpercentage en de weegschaal of app waar die van kwam', false],
  ['workouts', 'Trainingen', 'Eén rij per training: activiteit, duur, calorieën, stappen, afstand, gemiddelde hartslag', false],
  ['stages', 'Slaapfases', 'Elke fase van elke nacht (licht, diep, REM, wakker) met begin en duur', true],
  ['minutes', 'Stappen per minuut', 'Stappen, calorieën en afstand voor elke minuut, tot een jaar per keer', true],
  ['hr', 'Hartslagmetingen', 'Elke meting met tijdstip, tot 31 dagen per keer', true],
];
function renderDownloads() {
  if (!meta) return;
  const rows = MAIN.filter(([k]) => (k === 'minutes' ? meta.has.minutes : k === 'hr' ? meta.has.hr : k === 'stages' ? meta.has.stages : true)).map(([k, name, what, isPro]) => {
    const n = counts[k];
    return `<tr><th scope="row">${esc(name)}${isPro ? ' <span class="tb-tag">Pro</span>' : ''}</th><td>${esc(what)}</td><td class="tb-num">${n === undefined ? '' : fmt(n)}</td><td><button type="button" class="tb-btn tb-btn-sm ${isPro ? 'tb-btn-plain' : 'tb-btn-main'}" data-csv="${k}"${isPro ? ' data-pro-csv' : ''}${n === 0 ? ' disabled' : ''}>CSV</button></td></tr>`;
  });
  for (const f of meta.others) rows.push(`<tr><th scope="row">${esc(f.label)}</th><td>${esc(plural(f.files, 'file', 'files'))} in het archief${f.first ? `, ${esc(f.first)} tot ${esc(f.last)}` : ''}</td><td class="tb-num"></td><td><button type="button" class="tb-btn tb-btn-sm tb-btn-plain" data-csv="${esc(f.id)}">CSV</button></td></tr>`);
  $('downloads').tBodies[0].innerHTML = rows.join('');
}
function renderFound() {
  const p = meta.problems.filter(x => x.reason !== 'nofitbit' || meta.archives.length === 1);
  const lines = [`<p>${meta.archives.length ? `Gelezen uit ${esc(meta.archives.join(', '))}: ` : ''}${plural(meta.fileCount, 'file', 'files')} die Tallyband kan lezen. Account-, inlog- en instellingenbestanden blijven buiten beschouwing.</p>`];
  if (meta.others.length) lines.push(`<p>Andere gegevens in het archief, aangeboden als eigen CSV: ${meta.others.map(f => esc(f.label)).join(', ')}.</p>`);
  if (p.length) lines.push(`<p>Bestanden die niet gelezen konden worden: ${p.map(x => `${esc(x.name)} (${esc(ERRORS[x.reason] ? ERRORS[x.reason][0] : x.reason)})`).join('; ')}.</p>`);
  $('found-body').innerHTML = lines.join('');
}

/* ------------------------------------------------------------------ downloads */
function save(name, data, type) {
  const blob = data instanceof Blob ? data : new Blob([data], { type });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url; a.download = name; a.rel = 'noopener';
  document.body.appendChild(a); a.click(); a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 60000);
}
const FILE = { daily: 'daily-summary', sleep: 'sleep', stages: 'sleep-stages', weight: 'weight', workouts: 'workouts', hr: 'heart-rate-readings', minutes: 'steps-per-minute' };
const slug = s => String(s).toLowerCase().replace(/^(csv|json):/, '').replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '') || 'data';
const RANGE_ERR = { 'hr-range': 'Hartslagmetingen komen er tot 31 dagen per keer uit (één maand is al ongeveer een half miljoen rijen). Kies een kortere periode en download opnieuw.', 'minute-range': 'Gegevens per minuut komen er tot een jaar per keer uit. Kies een kortere periode en download opnieuw.' };
async function download(what, btn) {
  const { from, to } = range();
  const old = btn ? btn.textContent : '';
  if (btn) { btn.disabled = true; btn.textContent = 'Voorbereiden'; }
  $('dl-note').textContent = '';
  try {
    if (what === 'xlsx' || what === 'csvzip') {
      const r = await ask({ type: what, from, to, sep: $('sep').value });
      save(`tallyband-${from}-to-${to}.${what === 'xlsx' ? 'xlsx' : 'zip'}`, new Blob([r.bytes], { type: what === 'xlsx' ? 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' : 'application/zip' }));
      $('dl-note').textContent = `${plural(r.rows, 'row', 'rows')} opgeslagen, van ${from} tot ${to}.`;
    } else {
      const r = await ask({ type: 'csv', what, from, to, sep: $('sep').value });
      save(`tallyband-${FILE[what] || slug(what)}-${from}-to-${to}.csv`, r.text, 'text/csv;charset=utf-8');
      $('dl-note').textContent = `${plural(r.rows, 'row', 'rows')} opgeslagen${r.note === 'nodates' ? '. Dit bestand heeft geen datums die Tallyband kan lezen, dus alle rijen zijn meegenomen' : ''}.`;
    }
  } catch (e) {
    $('dl-note').textContent = RANGE_ERR[e.code] || `Downloaden is mislukt: ${e.message || e.code}.`;
  } finally {
    if (btn) { btn.disabled = false; btn.textContent = old; }
  }
}

/* ------------------------------------------------------------------ wiring */
function wire() {
  const input = $('file-input'), folder = $('folder-input');
  $('btn-choose').addEventListener('click', () => input.click());
  $('btn-folder').addEventListener('click', () => folder.click());
  $('btn-retry').addEventListener('click', () => { stage('idle'); input.click(); });
  for (const id of ['btn-sample', 'btn-error-sample']) $(id).addEventListener('click', () => start(null, true));
  $('btn-another').addEventListener('click', () => { $('results').hidden = true; stage('idle'); $('panel').scrollIntoView({ behavior: reduced() ? 'auto' : 'smooth', block: 'center' }); $('drop-title').focus({ preventScroll: true }); });
  input.addEventListener('change', () => { if (input.files.length) start([...input.files]); input.value = ''; });
  folder.addEventListener('change', () => { if (folder.files.length) start([...folder.files].filter(f => /\.(json|csv)$/i.test(f.name) || /^User(Sleeps|SleepStages)_/i.test(f.name)).map(f => ({ file: f, path: f.webkitRelativePath || f.name }))); folder.value = ''; });
  const drop = $('drop');
  ['dragenter', 'dragover'].forEach(ev => drop.addEventListener(ev, e => { e.preventDefault(); drop.classList.add('is-over'); }));
  ['dragleave', 'drop'].forEach(ev => drop.addEventListener(ev, e => { e.preventDefault(); drop.classList.remove('is-over'); }));
  drop.addEventListener('drop', e => { if (e.dataTransfer.files.length) start([...e.dataTransfer.files]); });
  for (const id of ['from', 'to']) $(id).addEventListener('change', () => refresh());
  $('chips').addEventListener('click', e => { const b = e.target.closest('.tb-chip'); if (!b) return; $('from').value = b.dataset.from; $('to').value = b.dataset.to; refresh(); });
  $('tz').addEventListener('change', async () => { const r = await ask({ type: 'settings', tz: $('tz').value }); meta = r.meta; renderMeta(); refresh(); });
  $('unit').addEventListener('change', async () => { const r = await ask({ type: 'settings', unit: $('unit').value }); meta = r.meta; renderMeta(); refresh(); });
  $('downloads').addEventListener('click', e => {
    const b = e.target.closest('[data-csv]'); if (!b) return;
    if (b.hasAttribute('data-pro-csv') && !needPro('Elke meting en elke minuut horen bij Tallyband Pro.')) return;
    download(b.dataset.csv, b);
  });
  document.querySelectorAll('[data-pro]').forEach(b => b.addEventListener('click', () => { if (needPro('Alles in één keer opslaan hoort bij Tallyband Pro.')) download(b.dataset.pro, b); }));
}

wire();
if (document.readyState === 'complete') setupPro(); else addEventListener('load', setupPro);
proNote();
