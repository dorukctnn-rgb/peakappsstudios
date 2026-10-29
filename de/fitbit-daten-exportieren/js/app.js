/* Tallyband page logic. The archive is read in a worker in this tab (js/worker.js); nothing is sent anywhere. The only
 * network call the page can make is Gumroad's licence check (/assets/license.js), and only when a Pro key is pasted. */
import { PRO, PRO_READY, PRO_PITCH } from '/export-fitbit-data/js/pro.js';

const $ = id => document.getElementById(id);
const esc = s => String(s).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
const fmt = n => Number(n).toLocaleString('de-DE');
const UNITS = {"day":["Tag","Tage"],"night":["Nacht","Nächte"],"weigh-in":["Gewichtseintrag","Gewichtseinträge"],"workout":["Workout","Workouts"],"file":["Datei","Dateien"],"row":["Zeile","Zeilen"]};
const plural = (n, one, many) => { const u = UNITS[one] || [one, many]; return `${fmt(n)} ${u[n === 1 ? 0 : 1]}`; };
const reduced = () => matchMedia('(prefers-reduced-motion: reduce)').matches;

let worker = null, meta = null, pro = false, busy = false, seq = 0;
const waiting = new Map();

/* ------------------------------------------------------------------ Pro */
function setupPro() {
  if (!window.PeakLicense) return;
  PeakLicense.setup({ tool: 'tallyband', productId: PRO_READY ? PRO.productId : 'PENDING', permalink: PRO.permalink, buyUrl: PRO.url, pitch: "Pro speichert alles für deinen Zeitraum auf einmal: eine Excel-Datei mit einem Blatt pro Datenart oder jede Tabelle als CSV-Datei in einer ZIP-Datei, dazu jede Herzfrequenz-Messung, Schritte Minute für Minute und jede Schlafphase. 8 US-Dollar, einmalig.", strings: {"title":"Pro holen","buy":"Pro bei Gumroad kaufen","keyLabel":"Schon gekauft? Füge deinen Lizenzschlüssel ein","verify":"Aktivieren","close":"Schließen","checking":"Prüfung bei Gumroad läuft…","badKey":"Das sieht nicht nach einem Lizenzschlüssel aus. Du findest ihn in der Kaufbestätigung von Gumroad.","network":"Gumroad war nicht erreichbar, um den Schlüssel zu prüfen. Prüfe deine Verbindung und versuche es noch einmal.","ok":"Pro ist in diesem Browser aktiv. Danke.","refunded":"Dieser Kauf wurde erstattet oder ist beendet, deshalb ist Pro aus.","rejected":"Dieser Lizenzschlüssel wurde nicht akzeptiert.","active":"Pro ist in diesem Browser aktiv."}, localMessages: true });
  pro = PRO_READY && PeakLicense.isPro();
  document.body.classList.toggle('is-pro', pro);
  PeakLicense.onChange(p => { pro = PRO_READY && p; document.body.classList.toggle('is-pro', pro); proNote(); renderDownloads(); });
}
function proNote() {
  $('pro-note').textContent = pro ? 'Pro ist in diesem Browser aktiv. Wähle ein Format.' : 'Eine Excel-Datei mit einem Blatt pro Tabelle, oder jede Tabelle als CSV-Datei in einer ZIP-Datei. 8 US-Dollar, einmalig.';
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
  const what = m.stage === 'list' ? 'Durchsuche' : m.stage === 'export' ? 'Verarbeite' : 'Lese';
  $('busy-sub').textContent = `${what} ${m.file || ''}`.trim();
  const pct = m.n ? Math.min(100, Math.round(((m.i || 0) + 1) / m.n * 100)) : 0;
  $('busy-bar').style.width = pct + '%';
}
const ERRORS = {
  empty: ['Die Datei ist leer', 'Sie enthält keine Bytes. Wenn der Download vorzeitig abgebrochen wurde, lade das Archiv noch einmal von Google Takeout herunter.'],
  zip: ['Die ZIP-Datei konnte nicht gelesen werden', 'Sie wurde beim Herunterladen vermutlich abgeschnitten. Lade sie noch einmal über den Link in der E-Mail von Google herunter. Jeder Teil gilt etwa eine Woche.'],
  encrypted: ['Die ZIP-Datei ist passwortgeschützt', 'Google versieht Takeout-Archive nie mit einem Passwort, diese Datei wurde also nach dem Download verändert. Nimm die ursprüngliche ZIP-Datei.'],
  pdf: ['Das ist eine PDF-Datei, kein Fitbit-Archiv', 'Das Archiv ist eine ZIP-Datei von Google Takeout. Einen als PDF gespeicherten Bericht öffnet jedes PDF-Programm.'],
  rar: ['Das ist eine RAR-Datei', 'Takeout liefert ZIP-Dateien. Entpacke die Datei zuerst und wähle dann die ZIP-Datei oder den Fitbit-Ordner darin aus.'],
  '7z': ['Das ist eine 7-Zip-Datei', 'Takeout liefert ZIP-Dateien. Entpacke die Datei zuerst und wähle dann die ZIP-Datei oder den Fitbit-Ordner darin aus.'],
  tgz: ['Das ist ein .tgz-Archiv', 'Wähle beim Erstellen des Takeout-Exports .zip als Dateityp und öffne die ZIP-Datei dann hier. Oder entpacke das .tgz und wähle den Fitbit-Ordner.'],
  type: ['Diese Datei gehört nicht zu einem Fitbit-Archiv', 'Wähle die ZIP-Datei von Google Takeout oder JSON- und CSV-Dateien aus deren Fitbit-Ordner.'],
  unknown: ['Für diese Datei kennt Tallyband keine Regel', 'Es ist eine JSON- oder CSV-Datei, aber keine aus einem Fitbit-Archiv. Wähle stattdessen die ganze Takeout-ZIP-Datei.'],
  nofitbit: ['In dieser ZIP-Datei sind keine Fitbit-Daten', 'Dieses Takeout-Archiv enthält andere Google-Produkte. Erstelle einen neuen Export, bei dem nur Google Health (oder Fitbit) angehakt ist, oder wähle die anderen Teile des Exports.'],
  worker: ['Dein Browser hat den Leser gestoppt', 'Das Archiv ist vielleicht zu groß für den Speicher, den dieser Tab hat. Schließe andere Tabs und versuche es noch einmal, oder wähle nur den Fitbit-Ordner des entpackten Archivs.'],
};
function showError(e) {
  const [t, d] = ERRORS[e && e.code] || ['Das Archiv konnte nicht gelesen werden', `Es stoppte bei: ${e && e.message ? e.message : e}. Wenn das ein Takeout-Archiv ist, lade es noch einmal herunter.`];
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
  $('busy-title').textContent = sample ? 'Ein Beispielarchiv wird erstellt' : 'Dein Archiv wird gelesen';
  $('busy-sub').textContent = 'In deinem Browser, auf diesem Gerät.';
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
  bits.push(m.tzFrom === 'profile' ? `Zeitzone aus deinem Fitbit-Profil (${m.tz}).` : m.tzFrom === 'you' ? `Von dir gewählte Zeitzone (${m.tz}).` : `Dein Archiv nennt keine Zeitzone, deshalb gilt die Zone dieses Geräts (${$('tz').value}). Ändere sie, falls du anderswo gelebt hast.`);
  if (m.weight.basis === 'bmi') bits.push(`Die Gewichte sehen nach ${m.weight.unit === 'kg' ? 'Kilogramm' : 'Pfund (lb)'} aus, beurteilt am gespeicherten BMI (${plural(m.weight.n, 'weigh-in', 'weigh-ins')} mit BMI).`);
  else if (m.counts.weights) bits.push('Das Archiv speichert keinen BMI zu deinen Gewichtseinträgen. Vergleiche deshalb einen Wert mit der App und wähle die Einheit selbst.');
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
  const chips = [['Letzte 30 Tage', addDays(last, -29), last], ['Letzte 12 Monate', addDays(last, -364), last]];
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
  const parts = [`${plural(c.days, 'day', 'days')} vom ${c.first} bis ${c.last}`];
  if (n.nights) parts.push(plural(n.nights, 'night', 'nights'));
  if (n.weights) parts.push(plural(n.weights, 'weigh-in', 'weigh-ins'));
  if (n.workouts) parts.push(plural(n.workouts, 'workout', 'workouts'));
  $('res-meta').textContent = parts.join(', ') + '.';
  optNote();
}
const COLS = [['date', 'Datum'], ['steps', 'Schritte'], ['distance_km', 'km'], ['calories_kcal', 'kcal'], ['resting_heart_rate', 'Ruhepuls'], ['sleep_min', 'Schlaf min'], ['sleep_score', 'Schlafwert'], ['weight_kg', 'kg']];
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
    : '<tbody><tr><td>Für diesen Zeitraum gibt es keine Daten.</td></tr></tbody>';
  $('prev-sub').textContent = r.total ? `Die ersten ${Math.min(8, r.total)} von ${plural(r.total, 'day', 'days')} zwischen ${from} und ${to}. Die CSV-Datei hat ${Object.keys(r.rows[0] || {}).length} Spalten.` : '';
  counts = r.counts;
  renderDownloads();
}
let counts = {};
const MAIN = [
  ['daily', 'Tageszusammenfassung', 'Schritte, Strecke, Kalorien, aktive Minuten, Ruhepuls, Schlaf, Schlafwert, HRV, SpO2, Gewicht', false],
  ['sleep', 'Schlaf', 'Eine Zeile pro Nacht oder Nickerchen: Zeiten, Minuten im Schlaf und wach, Schlafphasen, Effizienz, Schlafwert', false],
  ['weight', 'Gewicht', 'Jede Wiegung in kg und lb, mit BMI, Körperfett und der Waage oder App, von der sie kam', false],
  ['workouts', 'Workouts', 'Eine Zeile pro Workout: Aktivität, Dauer, Kalorien, Schritte, Strecke, durchschnittliche Herzfrequenz', false],
  ['stages', 'Schlafphasen', 'Jede Phase jeder Nacht (leicht, tief, REM, wach) mit Beginn und Länge', true],
  ['minutes', 'Schritte pro Minute', 'Schritte, Kalorien und Strecke für jede Minute, bis zu einem Jahr auf einmal', true],
  ['hr', 'Herzfrequenz-Messwerte', 'Jede Messung mit Uhrzeit, bis zu 31 Tage auf einmal', true],
];
function renderDownloads() {
  if (!meta) return;
  const rows = MAIN.filter(([k]) => (k === 'minutes' ? meta.has.minutes : k === 'hr' ? meta.has.hr : k === 'stages' ? meta.has.stages : true)).map(([k, name, what, isPro]) => {
    const n = counts[k];
    return `<tr><th scope="row">${esc(name)}${isPro ? ' <span class="tb-tag">Pro</span>' : ''}</th><td>${esc(what)}</td><td class="tb-num">${n === undefined ? '' : fmt(n)}</td><td><button type="button" class="tb-btn tb-btn-sm ${isPro ? 'tb-btn-plain' : 'tb-btn-main'}" data-csv="${k}"${isPro ? ' data-pro-csv' : ''}${n === 0 ? ' disabled' : ''}>CSV</button></td></tr>`;
  });
  for (const f of meta.others) rows.push(`<tr><th scope="row">${esc(f.label)}</th><td>${esc(plural(f.files, 'file', 'files'))} im Archiv${f.first ? `, ${esc(f.first)} bis ${esc(f.last)}` : ''}</td><td class="tb-num"></td><td><button type="button" class="tb-btn tb-btn-sm tb-btn-plain" data-csv="${esc(f.id)}">CSV</button></td></tr>`);
  $('downloads').tBodies[0].innerHTML = rows.join('');
}
function renderFound() {
  const p = meta.problems.filter(x => x.reason !== 'nofitbit' || meta.archives.length === 1);
  const lines = [`<p>${meta.archives.length ? `Gelesen aus ${esc(meta.archives.join(', '))}: ` : ''}${plural(meta.fileCount, 'file', 'files')}, die Tallyband lesen kann. Konto-, Anmelde- und Einstellungsdateien bleiben außen vor.</p>`];
  if (meta.others.length) lines.push(`<p>Weitere Daten im Archiv, als eigene CSV-Datei angeboten: ${meta.others.map(f => esc(f.label)).join(', ')}.</p>`);
  if (p.length) lines.push(`<p>Dateien, die nicht gelesen werden konnten: ${p.map(x => `${esc(x.name)} (${esc(ERRORS[x.reason] ? ERRORS[x.reason][0].toLowerCase() : x.reason)})`).join('; ')}.</p>`);
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
const RANGE_ERR = { 'hr-range': 'Herzfrequenz-Messwerte kommen bis zu 31 Tage auf einmal heraus (ein Monat sind schon etwa eine halbe Million Zeilen). Wähle einen kürzeren Zeitraum und lade noch einmal herunter.', 'minute-range': 'Minutendaten kommen bis zu einem Jahr auf einmal heraus. Wähle einen kürzeren Zeitraum und lade noch einmal herunter.' };
async function download(what, btn) {
  const { from, to } = range();
  const old = btn ? btn.textContent : '';
  if (btn) { btn.disabled = true; btn.textContent = 'Verarbeite'; }
  $('dl-note').textContent = '';
  try {
    if (what === 'xlsx' || what === 'csvzip') {
      const r = await ask({ type: what, from, to, sep: $('sep').value });
      save(`tallyband-${from}-to-${to}.${what === 'xlsx' ? 'xlsx' : 'zip'}`, new Blob([r.bytes], { type: what === 'xlsx' ? 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' : 'application/zip' }));
      $('dl-note').textContent = `${plural(r.rows, 'row', 'rows')} gespeichert, ${from} bis ${to}.`;
    } else {
      const r = await ask({ type: 'csv', what, from, to, sep: $('sep').value });
      save(`tallyband-${FILE[what] || slug(what)}-${from}-to-${to}.csv`, r.text, 'text/csv;charset=utf-8');
      $('dl-note').textContent = `${plural(r.rows, 'row', 'rows')} gespeichert${r.note === 'nodates' ? '. In dieser Datei gibt es keine Datumsangaben, die Tallyband lesen kann, deshalb sind alle Zeilen enthalten' : ''}.`;
    }
  } catch (e) {
    $('dl-note').textContent = RANGE_ERR[e.code] || `Der Download ist fehlgeschlagen: ${e.message || e.code}.`;
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
    if (b.hasAttribute('data-pro-csv') && !needPro('Jede Messung und jede Minute gehören zu Tallyband Pro.')) return;
    download(b.dataset.csv, b);
  });
  document.querySelectorAll('[data-pro]').forEach(b => b.addEventListener('click', () => { if (needPro('Alles auf einmal zu speichern gehört zu Tallyband Pro.')) download(b.dataset.pro, b); }));
}

wire();
if (document.readyState === 'complete') setupPro(); else addEventListener('load', setupPro);
proNote();
