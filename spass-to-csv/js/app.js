// Decant: the page. Opens a Samsung Pass export (.spass) with the export password, shows the records, writes the Apple Passwords and
// Google files (free) and, with Pro, the Bitwarden file, the record sheet and the change list as CSV; lists the logins in the order
// to change them. Nothing read here leaves the browser: this file makes no network request, the file and the password are kept only
// in memory (the password box is emptied once the file is open), and nothing from the export is stored. The change list keeps
// only SHA-256 keys of the logins you ticked (no name, no password) in localStorage under "decant:changed".
import { openSpass, looksLikeSpass, counts, SpassError } from './spass.js';
import { checklist, reuseGroups, changeUrl, homeUrl, itemKey } from './rank.js';
import { appleCsv, googleCsvParts, bitwardenJson, checklistCsv, recordSheet, GOOGLE_LIMIT } from './export.js';
import { sampleSpass, SAMPLE_NAME, SAMPLE_PASSWORD } from './sample.js';
import { PRO, PRO_PITCH, FREE_ROWS } from './pro.js';
import { STR, langOf } from './i18n.js';

const $ = id => document.getElementById(id);
const L = langOf();
const S = STR[L];
const DONE_KEY = 'decant:changed';
let fileText = null; // the chosen file's text, until it is opened
let fileName = '';
let vault = null; // { records, warnings, file }
let keys = new Map(); // record n -> key
let done = new Set(load());
let tab = 'all';
let pro = false;
let searchTimer = 0;

/* ------------------------------------------------------------------ helpers */
function load() { try { const v = JSON.parse(localStorage.getItem(DONE_KEY) || '[]'); return Array.isArray(v) ? v.filter(k => /^[0-9a-f]{24}$/.test(k)) : []; } catch (e) { return []; } }
function saveDone() { try { localStorage.setItem(DONE_KEY, JSON.stringify([...done])); } catch (e) { /* private mode: ticks last for this visit */ } }
function toast(msg) { if (window.PeakUI && PeakUI.toast) PeakUI.toast(msg); }
function download(name, data, type) {
  const blob = new Blob([data], { type: type || 'text/plain;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url; a.download = name; a.rel = 'noopener';
  document.body.appendChild(a); a.click(); a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 60000);
}
const n = v => Number(v).toLocaleString(L === 'de' ? 'de-DE' : L === 'nl' ? 'nl-NL' : 'en-US');
const el = (tag, props = {}, ...kids) => { const e = Object.assign(document.createElement(tag), props); for (const k of kids) if (k != null) e.append(k); return e; };
function busy(text) { $('busy').hidden = !text; if (text) $('busy-text').textContent = text; }
function showError(msg) { const e = $('load-error'); e.textContent = msg; e.hidden = !msg; }

function setupPro() {
  if (!window.PeakLicense) return;
  PeakLicense.setup({ tool: 'decant', productId: PRO.productId, permalink: PRO.permalink, buyUrl: PRO.url, pitch: PRO_PITCH[L] || PRO_PITCH.en });
  pro = PeakLicense.isPro();
  document.body.classList.toggle('is-pro', pro);
  PeakLicense.onChange(p => { pro = p; document.body.classList.toggle('is-pro', p); if (vault) { renderChange(); renderReuse(); } });
}
function needPro(why) {
  if (window.PeakLicense && PeakLicense.isPro()) return true;
  if (window.PeakLicense) PeakLicense.open(why);
  return false;
}

/* ------------------------------------------------------------------ choose a file, then open it with the password */
async function chooseFile(file) {
  if (!file) return;
  showError('');
  if (file.size > 60 * 1024 * 1024) { showError(S.errors.tooBig); return; }
  let text = '';
  try { text = await file.text(); } catch (e) { showError(S.errors.readFail); return; }
  setFile(text, file.name);
}
function setFile(text, name) {
  fileText = text;
  fileName = name;
  $('file-name').textContent = S.fileChosen(name);
  $('file-name').hidden = false;
  $('drop').classList.add('has-file');
  // a file that is plainly not base64 is said so now, before a password is asked for
  if (!looksLikeSpass(text)) showError(S.errors['not-base64']);
  else $('pw').focus();
}
async function openNow() {
  showError('');
  if (fileText == null) { showError(S.errors.noFile); return; }
  const pw = $('pw').value;
  if (!pw) { showError(S.errors['no-password']); $('pw').focus(); return; }
  busy(S.busyOpen);
  try {
    await new Promise(r => setTimeout(r, 30)); // let the page paint the waiting state before the key is made
    const v = await openSpass(fileText, pw);
    if (!v.records.length) { showError(S.errors.noRecords); return; }
    vault = { ...v, file: fileName };
    keys = new Map();
    await Promise.all(vault.records.filter(r => r.kind === 'login').map(async r => keys.set(r.n, await itemKey(r))));
    $('pw').value = '';
    fileText = null;
    render();
  } catch (e) {
    showError(e instanceof SpassError ? (S.errors[e.code] || S.errors.generic) : S.errors.generic);
    if (e instanceof SpassError && e.code === 'wrong-password') { $('pw').focus(); $('pw').select(); }
  } finally { busy(''); }
}
async function openSample() {
  showError('');
  setFile(await sampleSpass(), SAMPLE_NAME);
  $('pw').value = SAMPLE_PASSWORD;
  await openNow();
}
async function downloadSample() { download(SAMPLE_NAME, await sampleSpass(), 'application/octet-stream'); }

/* ------------------------------------------------------------------ the result */
function render() {
  const c = counts(vault.records);
  $('step-wait').hidden = true;
  $('result').hidden = false;
  $('res-title').textContent = vault.file === SAMPLE_NAME ? S.sampleTitle : S.yourTitle;
  $('res-counts').textContent = S.counts(L, c);
  for (const k of ['login', 'card', 'address', 'note']) $(`big-${k}`).textContent = n(c[k]);
  const warn = [];
  if (c.app) warn.push(S.warnApp(L, c.app));
  if (c.guessed) warn.push(S.warnGuessed(L, c.guessed));
  if (c.noUrl) warn.push(S.warnNoUrl(L, c.noUrl));
  if (c.lockedCards) warn.push(S.warnLocked(L, c.lockedCards));
  if (c.login > GOOGLE_LIMIT) warn.push(S.warnGoogle(L, Math.ceil(c.login / GOOGLE_LIMIT), GOOGLE_LIMIT));
  if (vault.warnings.some(w => w.code === 'no-header')) warn.push(S.warnNoHeader);
  $('res-warn').textContent = warn.join(' ');
  $('res-warn').hidden = !warn.length;
  $('apple-note-text').textContent = S.appleNote(L, c.login);
  for (const k of ['all', 'login', 'card', 'address', 'note']) $(`n-${k}`).textContent = n(k === 'all' ? c.all : c[k]);
  renderChange();
  renderReuse();
  renderRecords();
  $('res-title').focus();
}

function renderChange() {
  const list = checklist(vault.records);
  const ol = $('change-list');
  ol.replaceChildren();
  const shown = pro ? list : list.slice(0, FREE_ROWS);
  let last = '';
  shown.forEach((c, i) => {
    if (c.group !== last) {
      last = c.group;
      const [gname, gwhy] = S.groups[c.group];
      ol.append(el('li', { className: 'dc-group-h', role: 'presentation' }, gname, el('small', { textContent: gwhy })));
    }
    const r = c.rec;
    const key = keys.get(r.n);
    const isDone = key && done.has(key);
    const li = el('li', { className: `dc-row${isDone ? ' is-done' : ''}` });
    const badges = el('span', { className: 'dc-badges' });
    if (c.reused) badges.append(el('span', { className: 'dc-badge', textContent: S.sameOn(c.reused) }));
    if (c.twofa) badges.append(el('span', { className: 'dc-badge dc-badge-2fa', textContent: S.twofa }));
    if (r.app) badges.append(el('span', { className: 'dc-badge dc-badge-app', textContent: S.appBadge }));
    const main = el('div', { className: 'dc-row-main' },
      el('div', { className: 'dc-row-name', textContent: r.name }),
      el('div', { className: 'dc-row-sub', textContent: [r.host || (r.url ? r.url : S.noSite), r.username].filter(Boolean).join(', ') }),
      badges.childNodes.length ? badges : null);
    const act = el('div', { className: 'dc-row-act' });
    if (r.host) {
      act.append(el('a', { href: changeUrl(r), target: '_blank', rel: 'noopener noreferrer', textContent: S.changePage }));
      act.append(el('a', { href: homeUrl(r), target: '_blank', rel: 'noopener noreferrer', textContent: S.site }));
    }
    const box = el('input', { type: 'checkbox', checked: !!isDone });
    box.setAttribute('aria-label', S.changedAria(r.name));
    box.addEventListener('change', () => {
      if (!key) return;
      if (box.checked) done.add(key); else done.delete(key);
      saveDone();
      li.classList.toggle('is-done', box.checked);
      summary(list);
    });
    act.append(el('label', { className: 'dc-tick' }, box, S.changed));
    li.append(el('span', { className: 'dc-row-n', textContent: String(i + 1), ariaHidden: 'true' }), main, act);
    ol.append(li);
  });
  const more = list.length - shown.length;
  $('change-more').hidden = more <= 0;
  if (more > 0) $('change-more-text').textContent = S.changeMore(L, more, list.slice(FREE_ROWS).filter(x => x.reused).length);
  summary(list);
}
function summary(list) {
  const total = list.length;
  const ticked = list.filter(c => { const k = keys.get(c.rec.n); return k && done.has(k); }).length;
  $('change-summary').textContent = S.changeSummary(L, total, ticked);
}

function renderReuse() {
  const groups = reuseGroups(vault.records);
  const used = groups.reduce((s, g) => s + g.length, 0);
  const ul = $('reuse-list');
  ul.replaceChildren();
  $('reuse').hidden = false;
  if (!groups.length) { $('reuse-summary').textContent = S.reuseNone; return; }
  $('reuse-summary').textContent = S.reuseSome(L, groups.length, used, pro);
  if (!pro) return;
  groups.forEach((g, i) => ul.append(el('li', {}, el('b', { textContent: S.reuseItem(i + 1, g.length) }), g.map(r => r.name + (r.host ? ` (${r.host})` : '')).join(', '))));
}

function matches(r, q) {
  if (!q) return true;
  const a = r.address;
  const hay = [r.name, r.host, r.username, r.type, r.note, r.app ? r.app.pkg : '', a ? Object.values(a).join(' ') : '', r.card ? `${r.card.holder} ${r.card.last4}` : '', ...r.fields.filter(f => !f.secret).map(f => `${f.label} ${f.value}`)].join(' ').toLowerCase();
  return q.split(/\s+/).every(w => hay.includes(w));
}
function renderRecords() {
  if (!vault) return; // a search typed just before "Open another file" fires after the reset
  const q = $('q').value.trim().toLowerCase();
  const ul = $('rec-list');
  ul.replaceChildren();
  const rows = vault.records.filter(r => (tab === 'all' || r.kind === tab) && matches(r, q));
  for (const r of rows.slice(0, 400)) {
    const sub = [r.host, r.username].filter(Boolean).join(', ') || (r.kind === 'address' ? [r.address.street, r.address.city].filter(Boolean).join(', ') : r.note ? r.note.slice(0, 80) : '');
    const b = el('button', { type: 'button' },
      el('span', {}, el('span', { className: 'dc-rec-name', textContent: r.name }), el('span', { className: 'dc-rec-sub', textContent: sub })),
      el('span', { className: 'dc-rec-type', textContent: r.app ? S.kinds.app : S.kinds[r.kind] }));
    b.addEventListener('click', () => openDetail(r));
    ul.append(el('li', {}, b));
  }
  if (rows.length > 400) ul.append(el('li', { className: 'dc-small', textContent: S.more(L, rows.length - 400) }));
  $('rec-empty').textContent = S.searchNone;
  $('rec-empty').hidden = rows.length > 0;
}

/* ------------------------------------------------------------------ one record */
let showSecrets = false;
let current = null;
function openDetail(r) {
  current = r;
  showSecrets = false;
  fillDetail();
  $('detail').showModal();
  $('dt-close').focus();
}
function fillDetail() {
  const r = current;
  const D = S.d;
  $('dt-title').textContent = r.name;
  $('dt-meta').textContent = [r.app ? S.kinds.app : S.kinds[r.kind], r.modified ? `${D.modified}: ${r.modified}` : ''].filter(Boolean).join(', ');
  const dl = $('dt-fields');
  dl.replaceChildren();
  const add = (k, v, secret) => {
    if (v == null || String(v).trim() === '') return;
    dl.append(el('dt', { textContent: k }), el('dd', { className: secret && !showSecrets ? 'dc-masked' : '', textContent: secret && !showSecrets ? D.hidden : String(v) }));
  };
  if (r.kind === 'login') { add(D.website, r.url || r.host); add(D.username, r.username); add(D.password, r.password, true); if (r.otp) add(D.otp, r.otp, true); }
  if (r.kind === 'card' && r.card) { const c = r.card; add(D.holder, c.holder); if (c.number) add(D.number, c.number, true); else add(D.number, c.last4 ? `${D.numberLocked} (${c.last4})` : D.numberLocked); add(D.expires, c.expMonth || c.expYear ? `${c.expMonth}/${c.expYear}` : ''); add(D.code, c.code, true); add(D.brand, c.brand); }
  if (r.kind === 'address' && r.address) { const a = r.address; add(D.name, a.fullName); add(D.company, a.company); add(D.street, a.street); add(D.city, a.city); add(D.state, a.state); add(D.postal, a.postal); add(D.country, a.country); add(D.phone, a.phone); add(D.email, a.email); }
  for (const f of r.fields) if (!f.used) add(f.label === 'Android app' ? D.app : f.label, f.value, f.secret);
  $('dt-note').textContent = r.note || '';
  $('dt-note').hidden = !r.note;
  $('dt-show').textContent = showSecrets ? D.hide : D.show;
  $('dt-show').setAttribute('aria-pressed', String(showSecrets));
  $('dt-show').hidden = !(r.kind === 'login' ? r.password || r.otp : r.kind === 'card' ? r.card.number || r.card.code : false);
}

/* ------------------------------------------------------------------ saves */
const stamp = () => new Date().toISOString().slice(0, 10);
function saveApple() { download(`apple-passwords-${stamp()}.csv`, appleCsv(vault.records), 'text/csv;charset=utf-8'); toast(S.toastApple); }
function saveGoogle() {
  const parts = googleCsvParts(vault.records);
  parts.forEach((p, i) => download(`google-passwords-${stamp()}${parts.length > 1 ? `-part${i + 1}` : ''}.csv`, p, 'text/csv;charset=utf-8'));
  toast(parts.length > 1 ? S.toastGoogleParts(L, parts.length, GOOGLE_LIMIT) : S.toastGoogle);
}
function saveBitwarden() { if (!needPro(S.proBitwarden)) return; download(`bitwarden-${stamp()}.json`, bitwardenJson(vault.records), 'application/json'); toast(S.toastBw); }
function saveSheet() { if (!needPro(S.proSheet)) return; download(`records-${stamp()}.html`, recordSheet(vault.records), 'text/html;charset=utf-8'); toast(S.toastSheet); }
function saveChecklist() { if (!needPro(S.proList)) return; download(`change-list-${stamp()}.csv`, checklistCsv(vault.records, done, keys), 'text/csv;charset=utf-8'); toast(S.toastList); }

/* ------------------------------------------------------------------ wiring */
const TABS = ['all', 'login', 'card', 'address', 'note'];
function selectTab(t) {
  tab = t;
  for (const k of TABS) $(`tab-${k}`).setAttribute('aria-selected', String(k === t));
  $('rec-pane').setAttribute('aria-labelledby', `tab-${t}`);
  renderRecords();
}
function reset() {
  clearTimeout(searchTimer);
  vault = null; keys = new Map(); fileText = null; fileName = '';
  selectTab('all');
  $('result').hidden = true;
  $('step-wait').hidden = false;
  $('rec-list').replaceChildren(); $('change-list').replaceChildren(); $('reuse-list').replaceChildren();
  $('file-input').value = '';
  $('file-name').hidden = true;
  $('drop').classList.remove('has-file');
  $('pw').value = '';
  $('q').value = '';
  showError('');
  $('btn-files').focus();
}

function init() {
  setupPro();
  const drop = $('drop');
  $('btn-files').addEventListener('click', () => $('file-input').click());
  $('file-input').addEventListener('change', e => chooseFile(e.target.files[0]));
  drop.addEventListener('dragover', e => { e.preventDefault(); drop.classList.add('is-over'); });
  drop.addEventListener('dragleave', () => drop.classList.remove('is-over'));
  drop.addEventListener('drop', e => { e.preventDefault(); drop.classList.remove('is-over'); chooseFile(e.dataTransfer.files[0]); });
  $('btn-open').addEventListener('click', openNow);
  $('pw').addEventListener('keydown', e => { if (e.key === 'Enter') { e.preventDefault(); openNow(); } });
  $('btn-pw-show').addEventListener('click', () => {
    const shown = $('pw').type === 'text';
    $('pw').type = shown ? 'password' : 'text';
    $('btn-pw-show').setAttribute('aria-pressed', String(!shown));
    $('btn-pw-show').textContent = shown ? $('btn-pw-show').dataset.show : $('btn-pw-show').dataset.hide;
  });
  $('btn-sample').addEventListener('click', openSample);
  $('btn-sample-dl').addEventListener('click', downloadSample);
  $('btn-reset').addEventListener('click', reset);
  $('btn-apple').addEventListener('click', saveApple);
  $('btn-google').addEventListener('click', saveGoogle);
  $('btn-bitwarden').addEventListener('click', saveBitwarden);
  $('btn-sheet').addEventListener('click', saveSheet);
  $('btn-checklist').addEventListener('click', saveChecklist);
  $('hide-done').addEventListener('change', e => $('change-list').classList.toggle('dc-hide-done', e.target.checked));
  $('q').addEventListener('input', () => { clearTimeout(searchTimer); searchTimer = setTimeout(renderRecords, 150); });
  TABS.forEach((k, i) => {
    const b = $(`tab-${k}`);
    b.addEventListener('click', () => selectTab(k));
    b.addEventListener('keydown', e => {
      if (e.key !== 'ArrowRight' && e.key !== 'ArrowLeft') return;
      e.preventDefault();
      const next = TABS[(i + (e.key === 'ArrowRight' ? 1 : TABS.length - 1)) % TABS.length];
      selectTab(next); $(`tab-${next}`).focus();
    });
  });
  $('dt-close').addEventListener('click', () => $('detail').close());
  $('dt-show').addEventListener('click', () => { showSecrets = !showSecrets; fillDetail(); });
  $('detail').addEventListener('close', () => { current = null; $('dt-fields').replaceChildren(); });
  $('detail').addEventListener('click', e => { if (e.target === $('detail')) $('detail').close(); });
}
init();
