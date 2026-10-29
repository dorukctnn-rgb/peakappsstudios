/* Tallyband page logic. The archive is read in a worker in this tab (js/worker.js); nothing is sent anywhere. The only
 * network call the page can make is Gumroad's licence check (/assets/license.js), and only when a Pro key is pasted. */
import { PRO, PRO_READY, PRO_PITCH } from './pro.js';

const $ = id => document.getElementById(id);
const esc = s => String(s).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
const fmt = n => Number(n).toLocaleString('en-US');
const plural = (n, one, many) => `${fmt(n)} ${n === 1 ? one : many}`;
const reduced = () => matchMedia('(prefers-reduced-motion: reduce)').matches;

let worker = null, meta = null, pro = false, busy = false, seq = 0;
const waiting = new Map();

/* ------------------------------------------------------------------ Pro */
function setupPro() {
  if (!window.PeakLicense) return;
  PeakLicense.setup({ tool: 'tallyband', productId: PRO_READY ? PRO.productId : 'PENDING', permalink: PRO.permalink, buyUrl: PRO.url, pitch: PRO_PITCH });
  pro = PRO_READY && PeakLicense.isPro();
  document.body.classList.toggle('is-pro', pro);
  PeakLicense.onChange(p => { pro = PRO_READY && p; document.body.classList.toggle('is-pro', pro); proNote(); renderDownloads(); });
}
function proNote() {
  $('pro-note').textContent = pro ? 'Pro is on in this browser. Choose a format.' : 'One Excel file with a sheet for each table, or every table as a CSV file in one ZIP. $8, paid once.';
}
function needPro(why) {
  if (PRO_READY && window.PeakLicense && PeakLicense.isPro()) return true;
  if (window.PeakLicense) PeakLicense.open(why); else window.open(PRO.url, '_blank', 'noopener');
  return false;
}

/* ------------------------------------------------------------------ worker */
function getWorker() {
  if (worker) return worker;
  worker = new Worker(new URL('./worker.js', import.meta.url), { type: 'module' });
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
  const what = m.stage === 'list' ? 'Listing' : m.stage === 'export' ? 'Preparing' : 'Reading';
  $('busy-sub').textContent = `${what} ${m.file || ''}`.trim();
  const pct = m.n ? Math.min(100, Math.round(((m.i || 0) + 1) / m.n * 100)) : 0;
  $('busy-bar').style.width = pct + '%';
}
const ERRORS = {
  empty: ['The file is empty', 'It has no bytes in it. If the download stopped early, download the archive again from Google Takeout.'],
  zip: ['The ZIP could not be read', 'It may have been cut short while downloading. Download it again from the link in Google\'s email; each part is valid for about a week.'],
  encrypted: ['The ZIP is password protected', 'Google never adds a password to Takeout archives, so this file was changed after the download. Use the original ZIP.'],
  pdf: ['This is a PDF, not a Fitbit archive', 'The archive is a ZIP from Google Takeout. If you saved a report as a PDF, it opens in any PDF reader.'],
  rar: ['This is a RAR file', 'Takeout gives ZIP files. Unpack it first and choose the ZIP or the Fitbit folder inside.'],
  '7z': ['This is a 7-Zip file', 'Takeout gives ZIP files. Unpack it first and choose the ZIP or the Fitbit folder inside.'],
  tgz: ['This is a .tgz archive', 'Choose .zip as the file type when you create the Takeout export, then open the ZIP here. Or unpack the .tgz and choose the Fitbit folder.'],
  type: ['This file is not part of a Fitbit archive', 'Choose the ZIP from Google Takeout, or JSON and CSV files from its Fitbit folder.'],
  unknown: ['Tallyband has no rule for this file', 'It is a JSON or CSV file, but not one from a Fitbit archive. Choose the whole Takeout ZIP instead.'],
  nofitbit: ['There is no Fitbit data in this ZIP', 'This Takeout archive holds other Google products. Create a new export with only Google Health (or Fitbit) ticked, or choose the other parts of the export.'],
  worker: ['Your browser stopped the reader', 'The archive may be too big for the memory this tab has. Close other tabs and try again, or choose only the Fitbit folder of the unzipped archive.'],
};
function showError(e) {
  const [t, d] = ERRORS[e && e.code] || ['The archive could not be read', `It stopped at: ${e && e.message ? e.message : e}. If this is a Takeout archive, try downloading it again.`];
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
  $('busy-title').textContent = sample ? 'Making a made-up archive' : 'Reading your archive';
  $('busy-sub').textContent = 'In your browser, on this device.';
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
  bits.push(m.tzFrom === 'profile' ? `Time zone from your Fitbit profile (${m.tz}).` : m.tzFrom === 'you' ? `Time zone set by you (${m.tz}).` : `Your archive names no time zone, so this device's zone is used (${$('tz').value}). Change it if you lived elsewhere.`);
  if (m.weight.basis === 'bmi') bits.push(`Weights look like ${m.weight.unit === 'kg' ? 'kilograms' : 'pounds'}, judged from the BMI saved with ${plural(m.weight.n, 'weigh-in', 'weigh-ins')}.`);
  else if (m.counts.weights) bits.push('The archive saves no BMI with your weigh-ins, so check one value against the app and pick the unit.');
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
  const chips = [['Last 30 days', addDays(last, -29), last], ['Last 12 months', addDays(last, -364), last]];
  for (let y = y1; y >= Math.max(y0, y1 - 5); y--) chips.push([String(y), `${y}-01-01`, `${y}-12-31`]);
  chips.push(['Everything', first, last]);
  const cur = range();
  $('chips').innerHTML = chips.map(([t, a, b]) => {
    const f = a < first ? first : a, l = b > last ? last : b;
    return `<button type="button" class="tb-chip" data-from="${f}" data-to="${l}" aria-pressed="${cur.from === f && cur.to === l}">${esc(t)}</button>`;
  }).join('');
}

/* ------------------------------------------------------------------ render */
function renderMeta() {
  const c = meta.coverage, n = meta.counts;
  const parts = [`${plural(c.days, 'day', 'days')} from ${c.first} to ${c.last}`];
  if (n.nights) parts.push(plural(n.nights, 'night', 'nights'));
  if (n.weights) parts.push(plural(n.weights, 'weigh-in', 'weigh-ins'));
  if (n.workouts) parts.push(plural(n.workouts, 'workout', 'workouts'));
  $('res-meta').textContent = parts.join(', ') + '.';
  optNote();
}
const COLS = [['date', 'Date'], ['steps', 'Steps'], ['distance_km', 'km'], ['calories_kcal', 'kcal'], ['resting_heart_rate', 'Resting HR'], ['sleep_min', 'Sleep min'], ['sleep_score', 'Score'], ['weight_kg', 'kg']];
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
    : '<tbody><tr><td>No data between these dates.</td></tr></tbody>';
  $('prev-sub').textContent = r.total ? `The first ${Math.min(8, r.total)} of ${plural(r.total, 'day', 'days')} between ${from} and ${to}. The CSV has ${Object.keys(r.rows[0] || {}).length} columns.` : '';
  counts = r.counts;
  renderDownloads();
}
let counts = {};
const MAIN = [
  ['daily', 'Daily summary', 'Steps, distance, calories, active minutes, resting heart rate, sleep, score, HRV, SpO2, weight', false],
  ['sleep', 'Sleep', 'One row per night or nap: times, minutes asleep and awake, stages, efficiency, score', false],
  ['weight', 'Weight', 'Each weigh-in in kg and lb, with BMI, body fat and the scale or app it came from', false],
  ['workouts', 'Workouts', 'One row per workout: activity, duration, calories, steps, distance, average heart rate', false],
  ['stages', 'Sleep stages', 'Every stage of every night (light, deep, REM, awake) with its start and length', true],
  ['minutes', 'Steps per minute', 'Steps, calories and distance for every minute, up to a year at a time', true],
  ['hr', 'Heart-rate readings', 'Every reading with its time, up to 31 days at a time', true],
];
function renderDownloads() {
  if (!meta) return;
  const rows = MAIN.filter(([k]) => (k === 'minutes' ? meta.has.minutes : k === 'hr' ? meta.has.hr : k === 'stages' ? meta.has.stages : true)).map(([k, name, what, isPro]) => {
    const n = counts[k];
    return `<tr><th scope="row">${esc(name)}${isPro ? ' <span class="tb-tag">Pro</span>' : ''}</th><td>${esc(what)}</td><td class="tb-num">${n === undefined ? '' : fmt(n)}</td><td><button type="button" class="tb-btn tb-btn-sm ${isPro ? 'tb-btn-plain' : 'tb-btn-main'}" data-csv="${k}"${isPro ? ' data-pro-csv' : ''}${n === 0 ? ' disabled' : ''}>CSV</button></td></tr>`;
  });
  for (const f of meta.others) rows.push(`<tr><th scope="row">${esc(f.label)}</th><td>${esc(plural(f.files, 'file', 'files'))} in the archive${f.first ? `, ${esc(f.first)} to ${esc(f.last)}` : ''}</td><td class="tb-num"></td><td><button type="button" class="tb-btn tb-btn-sm tb-btn-plain" data-csv="${esc(f.id)}">CSV</button></td></tr>`);
  $('downloads').tBodies[0].innerHTML = rows.join('');
}
function renderFound() {
  const p = meta.problems.filter(x => x.reason !== 'nofitbit' || meta.archives.length === 1);
  const lines = [`<p>${meta.archives.length ? `Read from ${esc(meta.archives.join(', '))}: ` : ''}${plural(meta.fileCount, 'file', 'files')} Tallyband knows how to read. Account, sign-in and settings files are left out.</p>`];
  if (meta.others.length) lines.push(`<p>Other data in the archive, offered as its own CSV: ${meta.others.map(f => esc(f.label)).join(', ')}.</p>`);
  if (p.length) lines.push(`<p>Files that could not be read: ${p.map(x => `${esc(x.name)} (${esc(ERRORS[x.reason] ? ERRORS[x.reason][0].toLowerCase() : x.reason)})`).join('; ')}.</p>`);
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
const RANGE_ERR = { 'hr-range': 'Heart-rate readings come out at up to 31 days at a time (a month is already about half a million rows). Pick a shorter range and download again.', 'minute-range': 'Minute-by-minute data comes out at up to a year at a time. Pick a shorter range and download again.' };
async function download(what, btn) {
  const { from, to } = range();
  const old = btn ? btn.textContent : '';
  if (btn) { btn.disabled = true; btn.textContent = 'Preparing'; }
  $('dl-note').textContent = '';
  try {
    if (what === 'xlsx' || what === 'csvzip') {
      const r = await ask({ type: what, from, to, sep: $('sep').value });
      save(`tallyband-${from}-to-${to}.${what === 'xlsx' ? 'xlsx' : 'zip'}`, new Blob([r.bytes], { type: what === 'xlsx' ? 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' : 'application/zip' }));
      $('dl-note').textContent = `Saved ${plural(r.rows, 'row', 'rows')} for ${from} to ${to}.`;
    } else {
      const r = await ask({ type: 'csv', what, from, to, sep: $('sep').value });
      save(`tallyband-${FILE[what] || slug(what)}-${from}-to-${to}.csv`, r.text, 'text/csv;charset=utf-8');
      $('dl-note').textContent = `Saved ${plural(r.rows, 'row', 'rows')}${r.note === 'nodates' ? '. This file has no dates Tallyband can read, so every row is included' : ''}.`;
    }
  } catch (e) {
    $('dl-note').textContent = RANGE_ERR[e.code] || `That download failed: ${e.message || e.code}.`;
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
    if (b.hasAttribute('data-pro-csv') && !needPro('Every reading and every minute are part of Tallyband Pro.')) return;
    download(b.dataset.csv, b);
  });
  document.querySelectorAll('[data-pro]').forEach(b => b.addEventListener('click', () => { if (needPro('Saving everything at once is part of Tallyband Pro.')) download(b.dataset.pro, b); }));
}

wire();
if (document.readyState === 'complete') setupPro(); else addEventListener('load', setupPro);
proNote();
