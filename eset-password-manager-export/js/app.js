// Rekey, ESET page: opens the CSV that ESET Password Manager exports, shows the records, says which file takes which of them,
// writes the Apple Passwords and Google files (free) and, with Pro, the Bitwarden file (logins, cards, identities and notes), the
// record sheet and the change list as CSV. The reader and the Bitwarden file are this folder's (eset.js, export.js); the order to
// change passwords in and the Apple, Google and change-list files are the engine of the mSecure page, imported from
// /msecure-export/js/. Nothing read here leaves the browser: this file makes no network request, and nothing from the vault is
// stored. The change list keeps only SHA-256 keys of the logins you ticked (no name, no password) in localStorage under
// "rekey:eset:changed".
import { checklist, reuseGroups, GROUPS, changeUrl, homeUrl, itemKey } from '../../msecure-export/js/rank.js';
import { appleCsv, googleCsvParts, checklistCsv, GOOGLE_LIMIT } from '../../msecure-export/js/export.js';
import { readEsetVault, countsEset, sniff } from './eset.js';
import { bitwardenJson, recordSheet, routes } from './export.js';
import { sampleCsv, SAMPLE_NAME } from './sample.js';
import { PRO, PRO_PITCH, FREE_ROWS } from './pro.js';

const $ = id => document.getElementById(id);
const DONE_KEY = 'rekey:eset:changed';
let vault = null; // { records, columns, extraColumns, unknownTypes, file }
let keys = new Map(); // record n -> key
let done = new Set(load());
let tab = 'all';
let pro = false;
const TABS = ['all', 'login', 'card', 'identity', 'note', 'other'];

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
// "2 cards, 1 identity and 3 notes" (kinds with none left out)
function kindsText(c) {
  const parts = [];
  if (c.card) parts.push(plural(c.card, 'card'));
  if (c.identity) parts.push(plural(c.identity, 'identity', 'identities'));
  if (c.note) parts.push(plural(c.note, 'note'));
  if (c.other) parts.push(`${n(c.other)} of another kind`);
  return parts.length > 1 ? `${parts.slice(0, -1).join(', ')} and ${parts[parts.length - 1]}` : parts[0] || '';
}

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
const WRONG = {
  json: 'This is a JSON file. ESET Password Manager writes JSON only for its Password-protected file, which is encrypted and which Rekey cannot open. Export again from ESET (menu > Settings > Data > Export data) and choose CSV.',
  msecure: 'This looks like an mSecure export, not an ESET one. Rekey reads that too, on its own page: /msecure-export/.',
  plain: 'This CSV has the columns of a browser export (url, username, password) but no modelType column, which ESET Password Manager adds to every row. Choose the CSV that ESET exported (menu > Settings > Data > Export data > CSV).',
  unknown: 'This file does not look like an ESET Password Manager export. Rekey reads the CSV from ESET (menu > Settings > Data > Export data > CSV); its first row names the columns, starting with modelType.',
};
async function openText(text, name) {
  showError('');
  const what = sniff(text);
  if (what !== 'eset') { showError(WRONG[what] || WRONG.unknown); return; }
  busy('Reading the file');
  try {
    const v = readEsetVault(text);
    if (!v.records.length) { showError('The file opened, but it holds no records.'); return; }
    vault = { ...v, file: name };
    keys = new Map();
    await Promise.all(vault.records.filter(r => r.kind === 'login').map(async r => keys.set(r.n, await itemKey(r))));
    render();
  } finally { busy(''); }
}
async function openFile(file) {
  if (!file) return;
  if (file.size > 40 * 1024 * 1024) { showError('That file is larger than 40 MB, which is far more than an ESET export. Choose the CSV from ESET Password Manager.'); return; }
  let text = '';
  try { text = await file.text(); } catch (e) { showError('The file could not be read. Try choosing it again.'); return; }
  await openText(text, file.name);
}

/* ------------------------------------------------------------------ the result */
function render() {
  const c = countsEset(vault.records);
  $('result').hidden = false;
  $('res-title').textContent = vault.file === SAMPLE_NAME ? 'Sample vault (made-up records)' : 'Your vault';
  $('res-counts').textContent = `${plural(c.all, 'record')}: ${plural(c.login, 'login')}, ${plural(c.card, 'card')}, ${plural(c.identity, 'identity', 'identities')}, ${plural(c.note, 'note')}` + (c.other ? `, ${n(c.other)} of another kind` : '') + '.';
  const warn = [];
  if (c.noUrl) warn.push(`${plural(c.noUrl, 'login')} ${c.noUrl === 1 ? 'has' : 'have'} no website address (an app link, or none). Apple and Google may skip ${c.noUrl === 1 ? 'it' : 'them'}; ${c.noUrl === 1 ? 'it stays' : 'they stay'} in the Bitwarden file and on the change list.`);
  if (c.login > GOOGLE_LIMIT) warn.push(`Google imports up to ${n(GOOGLE_LIMIT)} passwords per file, so the Google file comes in ${Math.ceil(c.login / GOOGLE_LIMIT)} parts.`);
  if (vault.unknownTypes.length) warn.push(`${plural(c.other, 'row')} had a type Rekey does not know (${vault.unknownTypes.slice(0, 4).join(', ')}). ${c.other === 1 ? 'It is' : 'They are'} kept as secure notes with every value written out.`);
  if (vault.extraColumns.length) warn.push(`The file has columns that are not in ESET's documented list (${vault.extraColumns.slice(0, 5).join(', ')}). Their values are kept as named fields.`);
  if (c.rounded) warn.push(`${plural(c.rounded, 'card number')} look${c.rounded === 1 ? 's' : ''} rounded, like 4.11111E+15: a spreadsheet changed ${c.rounded === 1 ? 'it' : 'them'}. Export again from ESET and open the new file here without saving it in a spreadsheet.`);
  $('res-warn').textContent = warn.join(' ');
  $('res-warn').hidden = !warn.length;
  $('apple-note').firstChild.textContent = `${plural(c.login, 'login')} with notes${c.withOtp ? ' and one-time codes' : ''}. Mac: Passwords, File > Import Passwords from File. `;
  for (const k of TABS) { $(`n-${k}`).textContent = n(k === 'all' ? c.all : c[k]); $(`tab-${k}`).hidden = k === 'other' && !c.other; }
  if (tab === 'other' && !c.other) tab = 'all';
  selectTab(tab);
  renderRoutes(c);
  renderChange();
  renderReuse();
  $('res-title').focus();
}

// which file takes which records, in words, counted from the same records the files are made from
function renderRoutes(c) {
  const r = routes(vault.records, GOOGLE_LIMIT);
  const rest = kindsText(c);
  const body = $('routes-body');
  body.replaceChildren();
  // data-label: on a phone each value is shown with its column's name (eset.css)
  const td = (text, label) => { const e = el('td', { textContent: text }); e.setAttribute('data-label', label); return e; };
  const add = (file, inFile, left, isPro) => body.append(el('tr', {}, el('th', { scope: 'row', textContent: file }, isPro ? el('span', { className: 'rk-pro-tag', textContent: 'Pro' }) : null), td(inFile, 'What goes in'), td(left, 'What is left out')));
  add('Apple Passwords file', `${plural(r.counts.login, 'login')}` + (r.counts.withOtp ? `, ${n(r.counts.withOtp)} with a one-time code` : ''), r.counts.rest ? `${rest}: Passwords imports logins only` : 'Nothing', false);
  add('Google and Chrome file, also for 1Password', `${plural(r.counts.login, 'login')}` + (r.google.parts > 1 ? ` in ${r.google.parts} files` : ''), r.counts.rest ? `${rest}: Chrome imports logins only` : 'Nothing', false);
  add('Bitwarden and KeePassXC file', `All ${plural(c.all, 'record')}: logins, cards, identities and notes`, 'Nothing', true);
  add('Record sheet', r.counts.rest ? `${rest}, on printable pages` : 'No records besides logins', 'The logins (they are in the files above)', true);
  $('routes-note').textContent = r.counts.rest
    ? `${plural(r.counts.rest, 'record')} cannot go into the Apple or Google file. Without Pro they stay in ESET's own CSV, which you keep until the import has worked.`
    : 'Every record in this file is a login, so the free files take all of it.';
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
    $('change-more-text').textContent = `${plural(more, 'more login')} on the list` + (reusedHidden ? `, ${n(reusedHidden)} of them sharing a password with another login` : '') + '. Pro shows the whole list in order, keeps your ticks and saves it as a CSV with no passwords in it.';
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
  const idText = r.identity ? Object.values(r.identity).join(' ') : '';
  const cardText = r.card ? `${r.card.holder} ${r.card.brand}` : '';
  const hay = [r.name, r.host, r.username, r.type, r.note, idText, cardText, ...r.fields.filter(f => !f.secret).map(f => `${f.label} ${f.value}`)].join(' ').toLowerCase();
  return q.split(/\s+/).every(w => hay.includes(w));
}
function subline(r) {
  if (r.kind === 'login') return [r.host, r.username].filter(Boolean).join(', ') || (r.note ? r.note.slice(0, 80) : '');
  if (r.kind === 'card' && r.card) return [r.card.brand, r.card.number ? `ending ${r.card.number.slice(-4)}` : '', r.card.holder].filter(Boolean).join(', ');
  if (r.kind === 'identity' && r.identity) return [[r.identity.firstName, r.identity.lastName].filter(Boolean).join(' '), r.identity.city, r.identity.country].filter(Boolean).join(', ');
  return (r.note ? r.note.replace(/\s+/g, ' ').slice(0, 80) : '');
}
function renderRecords() {
  const q = $('q').value.trim().toLowerCase();
  const ul = $('rec-list');
  ul.replaceChildren();
  const rows = vault.records.filter(r => (tab === 'all' || r.kind === tab) && matches(r, q));
  for (const r of rows.slice(0, 400)) {
    const b = el('button', { type: 'button' },
      el('span', {}, el('span', { className: 'rk-rec-name', textContent: r.name }), el('span', { className: 'rk-rec-sub', textContent: subline(r) })),
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
  $('dt-meta').textContent = [r.type, r.favorite ? 'favorite' : ''].filter(Boolean).join(', ');
  const dl = $('dt-fields');
  dl.replaceChildren();
  const add = (k, v, secret) => {
    if (v == null || String(v).trim() === '') return;
    dl.append(el('dt', { textContent: k }), el('dd', { className: secret && !showSecrets ? 'rk-masked' : '', textContent: secret && !showSecrets ? '(hidden)' : String(v) }));
  };
  if (r.kind === 'login') { add('Website', r.url || r.host); add('Username', r.username); add('Password', r.password, true); if (r.otp) add('One-time password link', r.otp, true); }
  if (r.kind === 'card' && r.card) { add('Name on card', r.card.holder); add('Card number', r.card.number, true); add('Expires', r.card.expMonth || r.card.expYear ? `${r.card.expMonth}/${r.card.expYear}` : ''); add('Security code', r.card.code, true); add('Card type', r.card.brand); }
  if (r.kind === 'identity' && r.identity) {
    const d = r.identity;
    add('Name', [d.firstName, d.lastName].filter(Boolean).join(' ')); add('Company', d.company); add('Street', d.street); add('Street, line 2', d.street2); add('City', d.city); add('State or region', d.region); add('Postal code', d.zip); add('Country', d.country); add('E-mail', d.email); add('Phone', d.phone);
  }
  for (const f of r.fields) if (!f.used) add(f.label, f.value, f.secret);
  $('dt-note').textContent = r.note || '';
  $('dt-note').hidden = !r.note;
  $('dt-show').textContent = showSecrets ? 'Hide secrets' : 'Show secrets';
  $('dt-show').setAttribute('aria-pressed', String(showSecrets));
}

/* ------------------------------------------------------------------ saves */
const stamp = () => new Date().toISOString().slice(0, 10);
function saveApple() { download(`eset-apple-passwords-${stamp()}.csv`, appleCsv(vault.records), 'text/csv;charset=utf-8'); toast('Saved. Import it on a Mac, then delete it.'); }
function saveGoogle() {
  const parts = googleCsvParts(vault.records);
  parts.forEach((p, i) => download(`eset-google-passwords-${stamp()}${parts.length > 1 ? `-part${i + 1}` : ''}.csv`, p, 'text/csv;charset=utf-8'));
  toast(parts.length > 1 ? `Saved in ${parts.length} parts of up to ${n(GOOGLE_LIMIT)}.` : 'Saved. Import it, then delete it.');
}
function saveBitwarden() { if (!needPro('Bitwarden and KeePassXC file')) return; download(`eset-bitwarden-${stamp()}.json`, bitwardenJson(vault.records), 'application/json'); toast('Saved. Bitwarden: Tools > Import, Bitwarden (json).'); }
function saveSheet() { if (!needPro('Record sheet')) return; download(`eset-records-${stamp()}.html`, recordSheet(vault.records), 'text/html;charset=utf-8'); toast('Saved. Print it or save it as a PDF, then delete the file.'); }
function saveChecklist() { if (!needPro('Change list')) return; download(`eset-change-checklist-${stamp()}.csv`, checklistCsv(vault.records, done, keys), 'text/csv;charset=utf-8'); toast('Saved. It holds no passwords.'); }

/* ------------------------------------------------------------------ wiring */
const shownTabs = () => TABS.filter(k => !$(`tab-${k}`).hidden);
function selectTab(t) {
  tab = t;
  for (const k of TABS) $(`tab-${k}`).setAttribute('aria-selected', String(k === t));
  $('rec-pane').setAttribute('aria-labelledby', `tab-${t}`);
  renderRecords();
}
function reset() {
  vault = null; keys = new Map();
  $('result').hidden = true;
  $('rec-list').replaceChildren(); $('change-list').replaceChildren(); $('reuse-list').replaceChildren(); $('routes-body').replaceChildren();
  $('file-input').value = '';
  $('q').value = '';
  tab = 'all';
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
  TABS.forEach(k => {
    const b = $(`tab-${k}`);
    b.addEventListener('click', () => selectTab(k));
    b.addEventListener('keydown', e => {
      if (e.key !== 'ArrowRight' && e.key !== 'ArrowLeft') return;
      e.preventDefault();
      const vis = shownTabs();
      const i = vis.indexOf(k);
      const next = vis[(i + (e.key === 'ArrowRight' ? 1 : vis.length - 1)) % vis.length];
      selectTab(next); $(`tab-${next}`).focus();
    });
  });
  $('dt-close').addEventListener('click', () => $('detail').close());
  $('dt-show').addEventListener('click', () => { showSecrets = !showSecrets; fillDetail(); });
  $('detail').addEventListener('close', () => { current = null; $('dt-fields').replaceChildren(); });
  $('detail').addEventListener('click', e => { if (e.target === $('detail')) $('detail').close(); });
}
init();
