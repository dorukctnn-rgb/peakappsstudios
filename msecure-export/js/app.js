// Rekey: the page. Opens the CSV mSecure exports, shows the records, writes the Apple Passwords and Google files (free) and, with
// Pro, the Bitwarden file, the record sheet and the change list as CSV; lists the logins in the order to change them.
// Nothing read here leaves the browser: this file makes no network request, and nothing from the vault is stored. The change
// list keeps only SHA-256 keys of the logins you ticked (no name, no password) in localStorage under "rekey:changed".
import { readVault, looksLikeMsecure, counts } from './parse.js';
import { checklist, reuseGroups, GROUPS, changeUrl, homeUrl, itemKey } from './rank.js';
import { appleCsv, googleCsvParts, bitwardenJson, checklistCsv, recordSheet, GOOGLE_LIMIT } from './export.js';
import { sampleCsv, SAMPLE_NAME } from './sample.js';
import { PRO, PRO_PITCH, FREE_ROWS } from './pro.js';

const $ = id => document.getElementById(id);
const DONE_KEY = 'rekey:changed';
let vault = null; // { records, header, legacy, skipped, file }
let keys = new Map(); // record n -> key
let done = new Set(load());
let tab = 'all';
let pro = false;

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
const n = v => Number(v).toLocaleString('en-US');
const plural = (k, one, many = one + 's') => `${n(k)} ${k === 1 ? one : many}`;
const el = (tag, props = {}, ...kids) => { const e = Object.assign(document.createElement(tag), props); for (const k of kids) if (k != null) e.append(k); return e; };
function busy(text) { $('busy').hidden = !text; if (text) $('busy-text').textContent = text; }
function showError(msg) { const e = $('load-error'); e.textContent = msg; e.hidden = !msg; }

function setupPro() {
  if (!window.PeakLicense) return;
  PeakLicense.setup({ tool: 'rekey', productId: PRO.productId, permalink: PRO.permalink, buyUrl: PRO.url, pitch: PRO_PITCH });
  pro = PeakLicense.isPro();
  PeakLicense.onChange(p => { pro = p; document.body.classList.toggle('is-pro', p); if (vault) { renderChange(); renderReuse(); } });
}
function needPro(why) {
  if (window.PeakLicense && PeakLicense.isPro()) return true;
  if (window.PeakLicense) PeakLicense.open(why);
  return false;
}

/* ------------------------------------------------------------------ open a file */
const NOT_MSECURE = 'This file does not look like an mSecure export. Rekey reads the CSV from mSecure for Mac (File > Export > CSV) or Windows (Settings > Backups). A file from another password manager has a header row and plain columns; most managers import those directly.';
async function openText(text, name) {
  showError('');
  if (!looksLikeMsecure(text)) { showError(NOT_MSECURE); return; }
  busy('Reading the file');
  try {
    const v = readVault(text);
    if (!v.records.length) { showError('The file opened, but it holds no records.'); return; }
    vault = { ...v, file: name };
    keys = new Map();
    await Promise.all(vault.records.filter(r => r.kind === 'login').map(async r => keys.set(r.n, await itemKey(r))));
    render();
  } finally { busy(''); }
}
async function openFile(file) {
  if (!file) return;
  if (file.size > 40 * 1024 * 1024) { showError('That file is larger than 40 MB, which is far more than an mSecure export. Choose the CSV from mSecure.'); return; }
  let text = '';
  try { text = await file.text(); } catch (e) { showError('The file could not be read. Try choosing it again.'); return; }
  await openText(text, file.name);
}

/* ------------------------------------------------------------------ the result */
function render() {
  const c = counts(vault.records);
  $('result').hidden = false;
  $('res-title').textContent = vault.file === SAMPLE_NAME ? 'Sample vault (made-up records)' : 'Your vault';
  $('res-counts').textContent = `${plural(c.all, 'record')}: ${plural(c.login, 'login')}, ${plural(c.card, 'card')}, ${plural(c.note, 'note')}, ${n(c.other)} other` + (c.tagCount ? `; ${plural(c.tagCount, 'tag')}` : '') + '.';
  const warn = [];
  if (vault.legacy) warn.push(`${plural(vault.legacy, 'record')} came from an older mSecure export without field names; their values are named by position (Field 1, Field 2). Check them after the import.`);
  if (c.noUrl) warn.push(`${plural(c.noUrl, 'login')} ${c.noUrl === 1 ? 'has' : 'have'} no website. Apple and Google may skip ${c.noUrl === 1 ? 'it' : 'them'}; they stay in the Bitwarden file and on the change list.`);
  if (c.login > GOOGLE_LIMIT) warn.push(`Google imports up to ${n(GOOGLE_LIMIT)} passwords per file, so the Google file comes in ${Math.ceil(c.login / GOOGLE_LIMIT)} parts.`);
  if (vault.header) warn.push('The first row was a header row and was skipped.');
  $('res-warn').textContent = warn.join(' ');
  $('res-warn').hidden = !warn.length;
  $('apple-note').firstChild.textContent = `${plural(c.login, 'login')} with notes and one-time codes. Mac: Passwords, File > Import Passwords from File. `;
  for (const k of ['all', 'login', 'card', 'note', 'other']) $(`n-${k}`).textContent = n(k === 'all' ? c.all : c[k]);
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
  const names = Object.fromEntries(GROUPS.map(g => [g.id, g]));
  let last = '';
  shown.forEach((c, i) => {
    if (c.group !== last) {
      last = c.group;
      ol.append(el('li', { className: 'rk-group-h', role: 'presentation' }, names[c.group].name, el('small', { textContent: names[c.group].why })));
    }
    const r = c.rec;
    const key = keys.get(r.n);
    const isDone = key && done.has(key);
    const li = el('li', { className: `rk-tag${isDone ? ' is-done' : ''}` });
    const badges = el('span', { className: 'rk-badges' });
    if (c.reused) badges.append(el('span', { className: 'rk-badge', textContent: `same password on ${c.reused} logins` }));
    if (c.twofa) badges.append(el('span', { className: 'rk-badge rk-badge-2fa', textContent: 'two-factor to set up again' }));
    const main = el('div', { className: 'rk-tag-main' },
      el('div', { className: 'rk-tag-name', textContent: r.name }),
      el('div', { className: 'rk-tag-sub', textContent: [r.host || (r.url ? r.url : 'no website'), r.username].filter(Boolean).join(', ') }),
      badges.childNodes.length ? badges : null);
    const act = el('div', { className: 'rk-tag-act' });
    if (r.host) {
      act.append(el('a', { href: changeUrl(r), target: '_blank', rel: 'noopener noreferrer', textContent: 'Change page' }));
      act.append(el('a', { href: homeUrl(r), target: '_blank', rel: 'noopener noreferrer', textContent: 'Site' }));
    }
    const box = el('input', { type: 'checkbox', checked: !!isDone });
    box.setAttribute('aria-label', `I changed the password for ${r.name}`);
    box.addEventListener('change', () => {
      if (!key) return;
      if (box.checked) done.add(key); else done.delete(key);
      saveDone();
      li.classList.toggle('is-done', box.checked);
      summary(list);
    });
    act.append(el('label', { className: 'rk-tick' }, box, 'Changed'));
    li.append(el('span', { className: 'rk-tag-n', textContent: String(i + 1), ariaHidden: 'true' }), main, act);
    ol.append(li);
  });
  const more = list.length - shown.length;
  $('change-more').hidden = more <= 0;
  if (more > 0) {
    const reusedHidden = list.slice(FREE_ROWS).filter(x => x.reused).length;
    $('change-more-text').textContent = `${plural(more, 'more login')} to change` + (reusedHidden ? `, ${n(reusedHidden)} of them sharing a password with another login` : '') + '. Pro shows the whole list in order, keeps your ticks and saves it as a CSV with no passwords in it.';
  }
  summary(list);
}
function summary(list) {
  const total = list.length;
  const ticked = list.filter(c => { const k = keys.get(c.rec.n); return k && done.has(k); }).length;
  $('change-summary').textContent = total ? `${n(ticked)} of ${plural(total, 'login')} changed. E-mail first, then money, then the accounts that hold other accounts.` : 'There are no logins in this file.';
}

function renderReuse() {
  const groups = reuseGroups(vault.records);
  const used = groups.reduce((s, g) => s + g.length, 0);
  const ul = $('reuse-list');
  ul.replaceChildren();
  $('reuse').hidden = false;
  if (!groups.length) { $('reuse-summary').textContent = 'No password in this file is used on more than one login.'; return; }
  $('reuse-summary').textContent = `${plural(groups.length, 'password')} ${groups.length === 1 ? 'is' : 'are'} used on ${plural(used, 'login')}. Change each of them on every site that has it.` + (pro ? '' : ' Pro lists which logins share each one.');
  if (!pro) return;
  groups.forEach((g, i) => ul.append(el('li', {}, el('b', { textContent: `Password ${i + 1}, on ${g.length} logins: ` }), g.map(r => r.name + (r.host ? ` (${r.host})` : '')).join(', '))));
}

function matches(r, q) {
  if (!q) return true;
  const hay = [r.name, r.host, r.username, r.type, r.note, r.tags.join(' '), ...r.fields.filter(f => !f.secret).map(f => `${f.label} ${f.value}`)].join(' ').toLowerCase();
  return q.split(/\s+/).every(w => hay.includes(w));
}
function renderRecords() {
  const q = $('q').value.trim().toLowerCase();
  const ul = $('rec-list');
  ul.replaceChildren();
  const rows = vault.records.filter(r => (tab === 'all' || r.kind === tab) && matches(r, q));
  for (const r of rows.slice(0, 400)) {
    const b = el('button', { type: 'button' },
      el('span', {}, el('span', { className: 'rk-rec-name', textContent: r.name }), el('span', { className: 'rk-rec-sub', textContent: [r.host, r.username].filter(Boolean).join(', ') || (r.note ? r.note.slice(0, 80) : '') })),
      el('span', { className: 'rk-rec-type', textContent: r.type }));
    b.addEventListener('click', () => openDetail(r));
    ul.append(el('li', {}, b));
  }
  if (rows.length > 400) ul.append(el('li', { className: 'rk-small', textContent: `${n(rows.length - 400)} more; search to narrow the list.` }));
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
  $('dt-title').textContent = r.name;
  $('dt-meta').textContent = [r.type, r.tags.length ? `tags: ${r.tags.join(', ')}` : ''].filter(Boolean).join(', ');
  const dl = $('dt-fields');
  dl.replaceChildren();
  const add = (k, v, secret) => {
    if (v == null || String(v).trim() === '') return;
    dl.append(el('dt', { textContent: k }), el('dd', { className: secret && !showSecrets ? 'rk-masked' : '', textContent: secret && !showSecrets ? '(hidden)' : String(v) }));
  };
  if (r.kind === 'login') { add('Website', r.url || r.host); add('Username', r.username); add('Password', r.password, true); if (r.otp) add('One-time password link', r.otp, true); }
  if (r.kind === 'card' && r.card) { add('Name on card', r.card.holder); add('Card number', r.card.number, true); add('Expires', r.card.expMonth || r.card.expYear ? `${r.card.expMonth}/${r.card.expYear}` : ''); add('Security code', r.card.code, true); add('Bank', r.card.brand); }
  for (const f of r.fields) if (!f.used) add(f.label, f.value, f.secret);
  $('dt-note').textContent = r.note || '';
  $('dt-note').hidden = !r.note;
  $('dt-show').textContent = showSecrets ? 'Hide secrets' : 'Show secrets';
  $('dt-show').setAttribute('aria-pressed', String(showSecrets));
}

/* ------------------------------------------------------------------ saves */
const stamp = () => new Date().toISOString().slice(0, 10);
function saveApple() { download(`apple-passwords-${stamp()}.csv`, appleCsv(vault.records), 'text/csv;charset=utf-8'); toast('Saved. Import it on a Mac, then delete it.'); }
function saveGoogle() {
  const parts = googleCsvParts(vault.records);
  parts.forEach((p, i) => download(`google-passwords-${stamp()}${parts.length > 1 ? `-part${i + 1}` : ''}.csv`, p, 'text/csv;charset=utf-8'));
  toast(parts.length > 1 ? `Saved in ${parts.length} parts of up to ${n(GOOGLE_LIMIT)}.` : 'Saved. Import it, then delete it.');
}
function saveBitwarden() { if (!needPro('Bitwarden and KeePassXC file')) return; download(`bitwarden-${stamp()}.json`, bitwardenJson(vault.records), 'application/json'); toast('Saved. Bitwarden: Tools > Import, Bitwarden (json).'); }
function saveSheet() { if (!needPro('Record sheet')) return; download(`records-${stamp()}.html`, recordSheet(vault.records), 'text/html;charset=utf-8'); toast('Saved. Print it or save it as a PDF, then delete the file.'); }
function saveChecklist() { if (!needPro('Change list')) return; download(`change-checklist-${stamp()}.csv`, checklistCsv(vault.records, done, keys), 'text/csv;charset=utf-8'); toast('Saved. It holds no passwords.'); }

/* ------------------------------------------------------------------ wiring */
function selectTab(t) {
  tab = t;
  for (const k of ['all', 'login', 'card', 'note', 'other']) $(`tab-${k}`).setAttribute('aria-selected', String(k === t));
  $('rec-pane').setAttribute('aria-labelledby', `tab-${t}`);
  renderRecords();
}
function reset() {
  vault = null; keys = new Map();
  $('result').hidden = true;
  $('rec-list').replaceChildren(); $('change-list').replaceChildren(); $('reuse-list').replaceChildren();
  $('file-input').value = '';
  $('q').value = '';
  showError('');
  $('btn-files').focus();
}

function init() {
  setupPro();
  const drop = $('drop');
  $('btn-files').addEventListener('click', () => $('file-input').click());
  $('file-input').addEventListener('change', e => openFile(e.target.files[0]));
  drop.addEventListener('dragover', e => { e.preventDefault(); drop.classList.add('is-over'); });
  drop.addEventListener('dragleave', () => drop.classList.remove('is-over'));
  drop.addEventListener('drop', e => { e.preventDefault(); drop.classList.remove('is-over'); openFile(e.dataTransfer.files[0]); });
  $('btn-sample').addEventListener('click', () => openText(sampleCsv(), SAMPLE_NAME));
  $('btn-reset').addEventListener('click', reset);
  $('btn-apple').addEventListener('click', saveApple);
  $('btn-google').addEventListener('click', saveGoogle);
  $('btn-bitwarden').addEventListener('click', saveBitwarden);
  $('btn-sheet').addEventListener('click', saveSheet);
  $('btn-checklist').addEventListener('click', saveChecklist);
  $('hide-done').addEventListener('change', e => $('change-list').classList.toggle('rk-hide-done', e.target.checked));
  let t = 0;
  $('q').addEventListener('input', () => { clearTimeout(t); t = setTimeout(renderRecords, 150); });
  const tabs = ['all', 'login', 'card', 'note', 'other'];
  tabs.forEach((k, i) => {
    const b = $(`tab-${k}`);
    b.addEventListener('click', () => selectTab(k));
    b.addEventListener('keydown', e => {
      if (e.key !== 'ArrowRight' && e.key !== 'ArrowLeft') return;
      e.preventDefault();
      const next = tabs[(i + (e.key === 'ArrowRight' ? 1 : tabs.length - 1)) % tabs.length];
      selectTab(next); $(`tab-${next}`).focus();
    });
  });
  $('dt-close').addEventListener('click', () => $('detail').close());
  $('dt-show').addEventListener('click', () => { showSecrets = !showSecrets; fillDetail(); });
  $('detail').addEventListener('close', () => { current = null; $('dt-fields').replaceChildren(); });
  $('detail').addEventListener('click', e => { if (e.target === $('detail')) $('detail').close(); });
}
init();
