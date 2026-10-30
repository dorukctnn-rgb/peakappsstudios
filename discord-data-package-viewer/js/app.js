/* Agelens page logic. The package is read here, in this tab (js/parse.js, js/zip.js, js/csv.js); nothing is sent anywhere.
 * The only network call the page can make is Gumroad's licence check (/assets/license.js), and only when a Pro key is pasted.
 * Attachment links open only when you click them. */
import { collect, openPackage, scanEvents, verdict, topOf, matchConv, PackageError, safeUrl } from './parse.js';
import { archiveZip, ageReportText, conversationText, convLabel, accountName, esc, isoDay, isoTime, safeName, KIND_LABEL } from './export.js';
import { sampleFiles, SAMPLE_NAME } from './sample.js';
import { PRO, PRO_READY, PRO_PITCH } from './pro.js';

const $ = id => document.getElementById(id);
const STEP = 300;
const num = n => Number(n).toLocaleString('en-US');
const plural = (n, one, many) => `${num(n)} ${n === 1 ? one : many}`;
const day = ms => (ms == null ? '' : new Date(ms).toLocaleDateString('en-US', { year: 'numeric', month: 'short', day: 'numeric', timeZone: 'UTC' }));
const stamp = ms => (ms == null ? 'no date' : `${day(ms)}, ${new Date(ms).toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit', timeZone: 'UTC' })} UTC`);
const pct = p => `${Math.round(p * 1000) / 10}%`;
const size = b => (b >= 1e9 ? `${(b / 1e9).toFixed(1)} GB` : b >= 1e6 ? `${Math.round(b / 1e6)} MB` : `${Math.max(1, Math.round(b / 1e3))} KB`);

let model = null;
let label = '';
let tab = 'age';
let term = '';
let pro = false;
let scan = null;
let scanCtl = null;
const st = { kind: 'all', conv: 0, shown: STEP, order: 'old', scanShown: 12 };

/* ------------------------------------------------------------------ Pro */
function setupPro() {
  if (!window.PeakLicense) return;
  PeakLicense.setup({ tool: 'agelens', productId: PRO_READY ? PRO.productId : 'PENDING', permalink: PRO.permalink, buyUrl: PRO.url, pitch: PRO_PITCH });
  pro = PRO_READY && PeakLicense.isPro();
  document.body.classList.toggle('is-pro', pro);
  PeakLicense.onChange(p => { pro = PRO_READY && p; document.body.classList.toggle('is-pro', pro); proNote(); });
}
function proNote() {
  const n = $('save-note');
  if (n) n.textContent = pro ? 'Pro is on in this browser.' : 'Reading, searching, the age report and one conversation at a time are free. Pro saves every conversation at once for $8, paid once.';
}
function needPro(why) {
  if (PRO_READY && window.PeakLicense && PeakLicense.isPro()) return true;
  if (window.PeakLicense) PeakLicense.open(why); else window.open(PRO.url, '_blank', 'noopener');
  return false;
}

/* ------------------------------------------------------------------ helpers */
function toast(msg) { if (window.PeakUI && PeakUI.toast) PeakUI.toast(msg); }
function download(name, data, type) {
  const blob = data instanceof Blob ? data : new Blob([data], { type: type || 'application/octet-stream' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url; a.download = name; a.rel = 'noopener';
  document.body.appendChild(a); a.click(); a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 120000);
}
const reEsc = s => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
function hl(text) {
  const e = esc(text);
  if (!term) return e;
  return e.replace(new RegExp(reEsc(esc(term)), 'gi'), m => `<mark>${m}</mark>`);
}

/* ------------------------------------------------------------------ stages and errors */
function stage(name) {
  for (const s of ['idle', 'busy', 'error']) $('stage-' + s).hidden = s !== name;
  $('panel').dataset.state = name;
}
const ERRORS = {
  nothing: ['No files were chosen', 'Choose package.zip from Discord, its unzipped folder, or files from it such as user.json.'],
  empty: ['The file is empty', 'It has no bytes in it. If the download stopped early, download package.zip again from the link in Discord\'s email (it works for 30 days).'],
  partial: ['This download is not finished', 'The browser is still saving it, or it stopped part way. Wait for package.zip to finish downloading, then choose it.'],
  'not-discord': ['No Discord data package files here', 'Agelens opens the package.zip Discord emails you after Data & Privacy > Request Data, with folders such as Account, Messages and Servers. These files are something else.'],
  'zip-csv': ['This ZIP holds CSV files, not a Discord package', 'It looks like a download from another site, such as Reddit\'s data request. A Discord package has Account/user.json and a Messages folder.'],
  'zip-json': ['No Discord files in this ZIP', 'It holds JSON files, but none of the ones a Discord package has (Account/user.json, Messages/index.json, channel.json). Facebook, Instagram and Snapchat downloads look like this.'],
  'zip-other': ['No Discord files in this ZIP', 'A Discord package holds folders such as Account, Messages and Servers, full of JSON files. This ZIP has none of them.'],
  'zip-in-zip': ['There is a ZIP inside this ZIP', 'Unpack the outer one and choose the package.zip inside it.'],
  json: ['This JSON file is not from a Discord package', 'Choose package.zip itself, or user.json, a messages.json or the whole unzipped folder.'],
  text: ['This is a text file, not a Discord package', 'Choose package.zip from Discord, or its unzipped folder.'],
  pdf: ['This is a PDF, not a Discord package', 'Discord sends your data as package.zip. Choose that file.'],
  html: ['This is a web page, not the package', 'If the browser saved the download page instead of the file, open the link in Discord\'s email again and download package.zip.'],
  damaged: ['The ZIP file is damaged', 'It could not be opened. If the download was interrupted, download it again from the link in Discord\'s email.'],
  truncated: ['The ZIP file is cut short', 'Its end is missing, which happens when a large download stops early. Download package.zip again; the link works for 30 days.'],
  encrypted: ['The ZIP is password protected', 'Discord does not put a password on its package, so this file was changed afterwards. Use the original package.zip.'],
  rar: ['This is a RAR archive', 'Unpack it first, then choose the package.zip or the folder inside.'],
  '7z': ['This is a 7-Zip archive', 'Unpack it first, then choose the package.zip or the folder inside.'],
  gzip: ['This is a compressed archive Agelens does not open', 'Unpack it first, then choose the folder inside.'],
  'office-old': ['This is an Office file, not a Discord package', 'Discord sends your data as package.zip.'],
  binary: ['This file is not a Discord package', 'Discord sends your data as package.zip, a ZIP of JSON files.'],
};
function showError(code, detail) {
  const [t, d] = ERRORS[code] || ['These files could not be opened', 'Agelens opens package.zip from Discord, its unzipped folder or files from it. Nothing in these files looks like that package.'];
  $('error-title').textContent = t;
  $('error-text').textContent = d;
  stage('error');
  $('error-title').focus();
  if (detail && code === 'unknown') console.warn(detail);
}

/* ------------------------------------------------------------------ opening */
async function openFiles(chosen, name) {
  const files = [...(chosen || [])];
  if (!files.length) return showError('nothing');
  if (scanCtl) scanCtl.abort();
  stage('busy');
  $('busy-sub').textContent = 'Reading in your browser.';
  $('busy-title').focus();
  try {
    const { records, odd } = await collect(files);
    if (!records.length) throw new PackageError(odd.length ? odd[0].kind : 'nothing');
    const m = await openPackage(records, { onProgress: t => { $('busy-sub').textContent = t; } });
    show(m, name || (files.length === 1 ? files[0].name : plural(files.length, 'file', 'files')));
  } catch (e) {
    showError(e && e.code ? e.code : 'unknown', e && e.message);
  }
}
function openSample() {
  const files = Object.entries(sampleFiles()).map(([n, t]) => { const f = new File([t], n.split('/').pop(), { type: 'application/json' }); f._path = n; return f; });
  openFiles(files, `${SAMPLE_NAME} (the sample)`);
}
function show(m, name) {
  model = m; label = name; term = ''; scan = null;
  Object.assign(st, { kind: 'all', conv: 0, shown: STEP, order: 'old', scanShown: 12 });
  tab = m.user ? 'age' : m.hasMessages ? 'messages' : 'account';
  $('search').value = '';
  const a = m.account;
  const bits = [];
  if (a && accountName(m)) bits.push(accountName(m));
  if (a && a.created) bits.push(`account made ${day(a.created)}`);
  bits.push(`${plural(m.counts.messages, 'message', 'messages')} you sent`);
  $('reader-meta').textContent = `${bits.join(', ')}. From ${name}.`;
  $('reader').hidden = false;
  stage('idle');
  render();
  $('reader').scrollIntoView({ behavior: matchMedia('(prefers-reduced-motion: reduce)').matches ? 'auto' : 'smooth', block: 'start' });
  $('reader-title').focus({ preventScroll: true });
  startScan();
}

/* ------------------------------------------------------------------ the activity scan */
async function startScan() {
  if (!model || !model.events.length) return;
  scanCtl = new AbortController();
  const mine = model;
  const ctl = scanCtl;
  scan = { running: true, done: 0, total: model.eventBytes, age: [], gender: [] };
  if (tab === 'age') render();
  let last = 0;
  const res = await scanEvents(model.events, {
    signal: ctl.signal,
    onProgress: (d, t) => {
      scan.done = d; scan.total = t;
      const now = Date.now();
      if (now - last > 250) { last = now; const el = $('scan-progress'); if (el) el.textContent = `Reading the activity files: ${Math.min(100, Math.round((d / Math.max(t, 1)) * 100))}% of ${size(t)}.`; }
    },
  });
  if (model !== mine) return;
  scan = { ...res, running: false };
  if (tab === 'age') render();
}

/* ------------------------------------------------------------------ views */
const TABS = [['age', 'Age signals'], ['messages', 'Messages'], ['servers', 'Servers'], ['account', 'Account']];
function convList() {
  return model.convs.filter(c => st.kind === 'all' || c.kind === st.kind).map(c => ({ c, n: matchConv(c, term) })).filter(x => x.n !== 0);
}
function render() {
  const L = convList();
  const counts = { messages: L.length, servers: model.servers.length };
  $('tabs').innerHTML = TABS.map(([k, t]) => {
    const n = counts[k] != null ? `<span class="n">${num(counts[k])}</span>` : '';
    return `<button type="button" role="tab" class="ag-tab" id="tab-${k}" data-tab="${k}" aria-selected="${k === tab}" aria-controls="view" tabindex="${k === tab ? 0 : -1}">${t}${n}</button>`;
  }).join('');
  $('view').setAttribute('aria-labelledby', `tab-${tab}`);
  const note = $('search-note');
  if (term) {
    const hits = L.reduce((k, x) => k + Math.max(0, x.n), 0);
    note.hidden = false;
    note.textContent = hits ? `"${term}": ${plural(hits, 'message', 'messages')} in ${plural(L.length, 'conversation', 'conversations')}.` : L.length ? `"${term}" matches ${plural(L.length, 'conversation name', 'conversation names')}.` : `Nothing matches "${term}".`;
  } else note.hidden = true;
  const views = { age: viewAge, messages: () => viewMessages(L), servers: viewServers, account: viewAccount };
  $('view').innerHTML = views[tab]();
}

function bars(list) {
  if (!list || !list.length) return '';
  const top = topOf(list);
  return `<div class="ag-bars">${list.map(p => `<div class="ag-pbar${p === top ? ' is-top' : ''}"><span class="l">${esc(p.label)}</span><span class="track" aria-hidden="true"><i style="width:${Math.max(1, Math.min(100, p.p * 100)).toFixed(1)}%"></i></span><span class="v">${pct(p.p)}</span></div>`).join('')}</div>`;
}
function viewAge() {
  const m = model;
  if (!m.user) {
    return `<div class="ag-badge is-unknown"><p class="ag-badge-k">Age signals</p><p class="ag-badge-v">Not in these files</p></div>
<p>Discord writes the age signals into <code>Account/user.json</code>, and this package has no Account folder. Request the package again and tick <strong>Account</strong>: User Settings &gt; Data &amp; Privacy &gt; Request Data. <a href="/discord-data-package-viewer/how-long/">How long it takes</a></p>`;
  }
  const s = m.age;
  const v = verdict(s);
  const rows = [];
  if (s.dob) rows.push(['date_of_birth', s.dob.raw, s.dob.kind === 'adult-hidden' ? 'The birthday you gave Discord says 18 or older. Discord hides an adult\'s birthday as 01-01-0001.' : s.dob.kind === 'month' ? `The birthday you gave, cut to the month: ${String(s.dob.month).padStart(2, '0')}/${s.dob.year}, about ${s.dob.age} now. Discord keeps only the month for anyone under 18.` : 'Written in a form Agelens does not know; shown as it is.']);
  if (s.inferred) rows.push(['inferred_age_group', s.inferred.raw, `What Discord's age estimation model decided: ${s.inferred.label}. It looks at account age, devices and how the account is used, not at your messages, according to Discord.`]);
  if (s.estimated) rows.push(['estimated_age_group', s.estimated.raw, `The result of an age check (a selfie, ID, card or app store age range): ${s.estimated.label}.`]);
  if (s.predicted) rows.push(['predicted_age', s.predicted.value ?? 'probabilities only', 'A different model Discord uses for features in the app. Discord says this one does not decide your age group.']);
  if (s.gender) rows.push(['predicted_gender', s.gender.value ?? 'probabilities only', 'A guess at gender from how the account is used.']);
  const badge = v
    ? `<div class="ag-badge is-${v.band}"><p class="ag-badge-k">The age group your package points to</p><p class="ag-badge-v">${esc(v.label)}</p><p class="ag-badge-from">From ${esc(v.from)}.</p></div>`
    : `<div class="ag-badge is-unknown"><p class="ag-badge-k">The age group your package points to</p><p class="ag-badge-v">None written</p><p class="ag-badge-from">No age group in this package. Packages made before mid-September 2026 have none.</p></div>`;
  const wrong = v && v.band === 'teen'
    ? `<p class="ag-callout">Placed in the teen group and you are 18 or older? Discord lets you fix it in User Settings &gt; Account Status, with a choice of methods. <a href="/discord-data-package-viewer/age-group-wrong/">What each method shares, and what to do if it fails</a></p>` : '';
  const attempts = s.attempts.length ? `<h3>Age checks on this account</h3>
<table class="ag-table"><caption class="sr-only">Age checks from age_assurance</caption><thead><tr><th scope="col">When</th><th scope="col">How</th><th scope="col">By</th><th scope="col">Result</th></tr></thead><tbody>${s.attempts.map(a => `<tr><td>${esc(a.when ? stamp(a.when) : 'not given')}</td><td>${esc(a.method || 'not given')}</td><td>${esc(a.vendor || 'not given')}</td><td>${esc(a.group ? a.group.label : 'none')}${a.regionalAdult === true ? ', adult where you live' : a.regionalAdult === false ? ', not an adult where you live' : ''}${a.cooldown ? `. Next try after ${esc(day(a.cooldown))}` : ''}</td></tr>`).join('')}</tbody></table>` : '';
  const other = s.other.length ? `<h3>Other age-related fields</h3><p class="ag-small">Shown as written in your file, in case Discord adds fields Agelens does not know yet.</p><ul class="ag-raw">${s.other.map(o => `<li><code>${esc(o.path)}</code>: ${esc(typeof o.value === 'object' ? JSON.stringify(o.value) : String(o.value))}</li>`).join('')}</ul>` : '';
  let activity = '';
  if (m.events.length) {
    if (!scan || scan.running) {
      activity = `<h3>Older guesses in the activity files</h3><p class="ag-small" id="scan-progress" aria-live="polite">Reading the activity files: ${scan ? Math.min(100, Math.round((scan.done / Math.max(scan.total, 1)) * 100)) : 0}% of ${size(m.eventBytes)}.</p><button type="button" class="ag-btn ag-btn-plain ag-btn-sm" id="btn-scan-stop">Stop reading them</button>`;
    } else if (scan.age.length || scan.gender.length) {
      const la = scan.age[scan.age.length - 1], lg = scan.gender[scan.gender.length - 1];
      const hist = scan.age.slice(-st.scanShown).reverse();
      activity = `<h3>Older guesses in the activity files</h3>
<p class="ag-small">${plural(scan.age.length, 'age guess', 'age guesses')} and ${plural(scan.gender.length, 'gender guess', 'gender guesses')} in ${plural(scan.files, 'file', 'files')}${scan.stopped ? ' (stopped before the end)' : ''}. Discord made these from how the account was used.</p>
<div class="ag-cols">${la ? `<div><p class="ag-k">Latest age guess, ${esc(day(la.day))}</p>${bars(la.probs) || `<p>${esc(la.value)}</p>`}</div>` : ''}${lg ? `<div><p class="ag-k">Latest gender guess, ${esc(day(lg.day))}</p>${bars(lg.probs) || `<p>${esc(lg.value)}</p>`}</div>` : ''}</div>
${hist.length ? `<table class="ag-table"><caption>Age guesses over time, newest first</caption><thead><tr><th scope="col">Day</th><th scope="col">Guess</th><th scope="col">13-17</th><th scope="col">18-24</th><th scope="col">25-34</th><th scope="col">35+</th></tr></thead><tbody>${hist.map(e => { const p = Object.fromEntries((e.probs || []).map(x => [x.key, x.p])); const t = topOf(e.probs); return `<tr><td>${esc(day(e.day) || 'no date')}</td><td>${esc(e.value ?? (t ? t.label : ''))}</td>${['prob_13_17', 'prob_18_24', 'prob_25_34', 'prob_35_over'].map(k => `<td class="num">${p[k] != null ? pct(p[k]) : ''}</td>`).join('')}</tr>`; }).join('')}</tbody></table>${scan.age.length > st.scanShown ? `<p><button type="button" class="ag-btn ag-btn-plain ag-btn-sm" id="btn-scan-more">Show all ${num(scan.age.length)}</button></p>` : ''}` : ''}`;
    } else {
      activity = `<h3>Older guesses in the activity files</h3><p class="ag-small">${plural(scan.files, 'activity file', 'activity files')} read${scan.stopped ? ' until you stopped' : ''}: no predicted_age or predicted_gender events in them. Recent packages keep the age signals in user.json instead.</p>`;
    }
  }
  const predicted = s.predicted && s.predicted.probs ? `<h3>predicted_age, as probabilities</h3>${bars(s.predicted.probs)}` : '';
  const gender = s.gender && s.gender.probs ? `<h3>predicted_gender, as probabilities</h3>${bars(s.gender.probs)}` : '';
  return `<div class="ag-age-top">${badge}<div class="ag-age-actions"><button type="button" class="ag-btn ag-btn-sm" id="btn-age-text">Save the age report as text</button><p class="ag-small">Free. What each field below means, in plain words, in one file.</p></div></div>
${wrong}
${rows.length ? `<table class="ag-table ag-signals"><caption>The age signals in Account/user.json</caption><thead><tr><th scope="col">Field</th><th scope="col">In your file</th><th scope="col">What it means</th></tr></thead><tbody>${rows.map(r => `<tr><td><code>${esc(r[0])}</code></td><td>${esc(r[1])}</td><td>${esc(r[2])}</td></tr>`).join('')}</tbody></table>` : '<p>This user.json has no age fields. Packages made before mid-September 2026 have none; request a new one to see them.</p>'}
${predicted}${gender}${attempts}${other}${activity}`;
}

function msgHtml(x) {
  const att = x.att.map(a => { const u = safeUrl(a); return u ? `<a href="${esc(u)}" target="_blank" rel="noopener noreferrer">${esc((u.split('?')[0].split('/').pop()) || 'attachment')}</a>` : ''; }).filter(Boolean).join(' ');
  return `<div class="ag-msg"><span class="when">${esc(stamp(x.ts))}</span>${x.text ? `<div class="txt">${hl(x.text)}</div>` : ''}${att ? `<div class="att">Attachment: ${att}</div>` : ''}</div>`;
}
function viewMessages(L) {
  if (!model.hasMessages) return `<p class="ag-empty">This package has no Messages folder. Request it again and tick <strong>Messages</strong>.</p>`;
  const filters = [['all', 'All'], ['dm', 'Direct'], ['group', 'Groups'], ['server', 'Servers']];
  const bar = `<div class="ag-filter" role="group" aria-label="Show">${filters.map(([k, t]) => `<button type="button" class="ag-chip" data-kind="${k}" aria-pressed="${st.kind === k}">${t}</button>`).join('')}</div>`;
  if (!L.length) return `${bar}<p class="ag-empty">${term ? `No conversation matches "${esc(term)}".` : 'No conversations of this kind.'}</p>`;
  const i = Math.min(st.conv, L.length - 1);
  const c = L[i].c;
  let items = term ? c.items.filter(x => x.text.toLowerCase().includes(term.toLowerCase())) : c.items;
  if (term && !items.length) items = c.items;
  const ordered = st.order === 'new' ? [...items].reverse() : items;
  const shown = ordered.slice(0, st.shown);
  return `${bar}<p class="ag-small ag-mine">A data package holds only the messages you sent, so each conversation shows your side.</p>
<div class="ag-convs"><ul class="ag-conv-list" aria-label="Conversations">${L.map((x, k) => `<li><button type="button" data-conv="${k}" aria-current="${k === i}"><span class="t">${hl(x.c.title)}</span><small>${esc(x.c.kind === 'server' ? x.c.server || 'Server' : KIND_LABEL[x.c.kind])}, ${term && x.n > 0 ? `${plural(x.n, 'match', 'matches')}` : plural(x.c.count, 'message', 'messages')}${x.c.last ? `, last ${esc(day(x.c.last))}` : ''}</small></button></li>`).join('')}</ul>
<div class="ag-conv" id="conv"><div class="ag-conv-head"><div><h3 id="conv-title" tabindex="-1">${hl(convLabel(c))}</h3><p class="ag-small">${esc(KIND_LABEL[c.kind] || 'Channel')}${c.people.length && c.kind !== 'server' ? `, with ${hl(c.people.join(', '))}` : ''}. ${plural(c.count, 'message', 'messages')}${c.first ? `, ${esc(day(c.first))} to ${esc(day(c.last))}` : ''}.</p></div>
<div class="ag-actions ag-tight"><label class="ag-order">Order <select id="order"><option value="old"${st.order === 'old' ? ' selected' : ''}>Oldest first</option><option value="new"${st.order === 'new' ? ' selected' : ''}>Newest first</option></select></label><button type="button" class="ag-btn ag-btn-plain ag-btn-sm" id="btn-conv-text">Save it as text</button><button type="button" class="ag-btn ag-btn-plain ag-btn-sm" id="btn-conv-print">Print it</button></div></div>
${term && items !== c.items ? `<p class="ag-small">${plural(items.length, 'message matches', 'messages match')} "${esc(term)}".</p>` : ''}
${shown.map(msgHtml).join('')}${ordered.length > shown.length ? `<p class="ag-more"><button type="button" class="ag-btn ag-btn-plain ag-btn-sm" id="btn-more">Show ${num(Math.min(STEP * 3, ordered.length - shown.length))} more (${num(ordered.length - shown.length)} left)</button></p>` : ''}</div></div>`;
}
function viewServers() {
  const s = model.servers;
  if (!s.length) return '<p class="ag-empty">No servers in this package. Request it again and tick <strong>Servers</strong> to list them.</p>';
  const list = term ? s.filter(x => x.name.toLowerCase().includes(term.toLowerCase())) : s;
  return `<p class="ag-small">${plural(s.length, 'server', 'servers')} you were in when the package was made. Servers you left earlier may be missing, as Discord's help article says.</p>
<table class="ag-table"><caption class="sr-only">Servers</caption><thead><tr><th scope="col">Server</th><th scope="col">Messages you sent</th><th scope="col">Server made</th></tr></thead><tbody>${list.map(x => `<tr><td>${hl(x.name)}${x.owned ? ' (yours)' : ''}</td><td class="num">${num(x.messages)}</td><td>${esc(day(x.joined))}</td></tr>`).join('') || '<tr><td colspan="3">No server matches.</td></tr>'}</tbody></table>`;
}
function viewAccount() {
  const m = model;
  const a = m.account;
  const dl = a ? `<dl class="ag-dl"><dt>Username</dt><dd>${esc(accountName(m) || 'not given')}</dd>${a.globalName ? `<dt>Display name</dt><dd>${esc(a.globalName)}</dd>` : ''}<dt>User ID</dt><dd>${esc(a.id || 'not given')}</dd><dt>Account made</dt><dd>${a.created ? esc(stamp(a.created)) : 'not given'} <span class="ag-small">(read from the user ID)</span></dd><dt>Friends</dt><dd>${num(a.friends)}${a.blocked ? `, ${num(a.blocked)} blocked` : ''}</dd>${a.connections.length ? `<dt>Connected accounts</dt><dd>${esc(a.connections.map(c => c.type).join(', '))}</dd>` : ''}${a.sessions != null ? `<dt>Active sessions</dt><dd>${num(a.sessions)}</dd>` : ''}${a.notes ? `<dt>Notes on other users</dt><dd>${num(a.notes)}</dd>` : ''}</dl>` : '<p>This package has no Account folder (user.json).</p>';
  const years = m.years.length ? `<table class="ag-table"><caption>Messages you sent, by year</caption><thead><tr><th scope="col">Year</th><th scope="col">Messages</th></tr></thead><tbody>${m.years.map(([y, n]) => `<tr><td>${y}</td><td class="num">${num(n)}</td></tr>`).join('')}</tbody></table>` : '';
  const folders = `<table class="ag-table"><caption>What is in this package</caption><thead><tr><th scope="col">Folder</th><th scope="col">Files</th></tr></thead><tbody>${m.folderNames.map(([f, n]) => `<tr><td>${esc(f)}</td><td class="num">${num(n)}</td></tr>`).join('')}</tbody></table>`;
  return `${dl}<p class="ag-small">Your email, phone number, IP addresses and payment details are in user.json too. Agelens reads past them and never shows them.</p>${years}${folders}${m.counts.unreadable ? `<p class="ag-small">${plural(m.counts.unreadable, 'message file', 'message files')} could not be read.</p>` : ''}`;
}

/* ------------------------------------------------------------------ actions */
function currentConv() {
  const L = convList();
  if (!L.length) return null;
  return L[Math.min(st.conv, L.length - 1)].c;
}
function printConv() {
  const c = currentConv();
  if (!c) return;
  const area = $('print-area');
  area.innerHTML = `<h1 style="font-size:24px">${esc(convLabel(c))}</h1><p>${esc(KIND_LABEL[c.kind] || 'Channel')}. The messages you sent, from a Discord data package. Times in UTC.</p>${c.items.map(msgHtml).join('').replace(/<mark>|<\/mark>/g, '')}`;
  document.body.classList.add('is-printing');
  const done = () => { document.body.classList.remove('is-printing'); area.innerHTML = ''; window.removeEventListener('afterprint', done); };
  window.addEventListener('afterprint', done);
  window.print();
  setTimeout(done, 1500);
}
async function proSave() {
  if (!model) return;
  if (!needPro('Saving every conversation at once is part of Agelens Pro.')) return;
  const note = $('save-note');
  note.textContent = 'Building the archive in your browser.';
  const a = await archiveZip(model, { scan: scan && !scan.running ? scan : null, onProgress: t => { note.textContent = `Building the archive: ${t}.`; } });
  download(a.name, a.blob, 'application/zip');
  proNote();
  toast('Archive saved.');
}

/* ------------------------------------------------------------------ events */
function wire() {
  const fileInput = $('file-input');
  const folderInput = $('folder-input');
  $('btn-choose').addEventListener('click', () => fileInput.click());
  $('btn-folder').addEventListener('click', () => folderInput.click());
  fileInput.addEventListener('change', () => { openFiles(fileInput.files); fileInput.value = ''; });
  folderInput.addEventListener('change', () => { openFiles(folderInput.files, 'the chosen folder'); folderInput.value = ''; });
  $('btn-sample').addEventListener('click', openSample);
  $('btn-error-sample').addEventListener('click', openSample);
  $('btn-retry').addEventListener('click', () => { stage('idle'); $('drop-title').focus(); fileInput.click(); });
  $('btn-another').addEventListener('click', () => { $('panel').scrollIntoView({ block: 'center' }); stage('idle'); $('drop-title').focus({ preventScroll: true }); });

  const drop = $('drop');
  const over = on => drop.classList.toggle('is-over', on);
  for (const el of [drop, $('panel')]) {
    el.addEventListener('dragover', e => { e.preventDefault(); over(true); });
    el.addEventListener('dragleave', () => over(false));
    el.addEventListener('drop', async e => { e.preventDefault(); over(false); openFiles(await droppedFiles(e.dataTransfer)); });
  }

  let timer = null;
  $('search').addEventListener('input', e => {
    clearTimeout(timer);
    timer = setTimeout(() => { term = e.target.value.trim(); st.conv = 0; st.shown = STEP; if (model) { if (term && tab === 'age') tab = 'messages'; render(); } }, 200);
  });

  $('tabs').addEventListener('click', e => { const b = e.target.closest('[data-tab]'); if (b) { tab = b.dataset.tab; render(); $(`tab-${tab}`).focus(); } });
  $('tabs').addEventListener('keydown', e => {
    if (!['ArrowLeft', 'ArrowRight', 'Home', 'End'].includes(e.key)) return;
    const keys = TABS.map(t => t[0]);
    let k = keys.indexOf(tab);
    k = e.key === 'Home' ? 0 : e.key === 'End' ? keys.length - 1 : (k + (e.key === 'ArrowRight' ? 1 : -1) + keys.length) % keys.length;
    tab = keys[k]; render(); $(`tab-${tab}`).focus(); e.preventDefault();
  });

  $('view').addEventListener('click', e => {
    const t = e.target;
    const kind = t.closest('[data-kind]');
    if (kind) { st.kind = kind.dataset.kind; st.conv = 0; st.shown = STEP; render(); const b = document.querySelector(`[data-kind="${st.kind}"]`); if (b) b.focus(); return; }
    const conv = t.closest('[data-conv]');
    if (conv) { st.conv = +conv.dataset.conv; st.shown = STEP; render(); const h = $('conv-title'); if (h) { h.focus({ preventScroll: true }); if (matchMedia('(max-width: 860px)').matches) $('conv').scrollIntoView({ block: 'start' }); } return; }
    if (t.closest('#btn-more')) { st.shown += STEP * 3; render(); return; }
    if (t.closest('#btn-conv-text')) { const c = currentConv(); if (c) download(`discord-${safeName(convLabel(c), 50)}.txt`, conversationText(c, { account: accountName(model) }), 'text/plain;charset=utf-8'); return; }
    if (t.closest('#btn-conv-print')) { printConv(); return; }
    if (t.closest('#btn-age-text')) { download(`discord-age-signals-${safeName(accountName(model) || 'discord', 40)}.txt`, ageReportText(model, scan && !scan.running ? scan : null), 'text/plain;charset=utf-8'); toast('Age report saved.'); return; }
    if (t.closest('#btn-scan-stop')) { if (scanCtl) scanCtl.abort(); return; }
    if (t.closest('#btn-scan-more')) { st.scanShown = 100000; render(); }
  });
  $('view').addEventListener('change', e => {
    if (e.target.id === 'order') { st.order = e.target.value; st.shown = STEP; render(); $('order').focus(); }
  });
  $('btn-archive').addEventListener('click', proSave);
}

/* Files and folders dropped on the page; folders are walked so their files come along with their paths. */
async function droppedFiles(dt) {
  const items = [...(dt.items || [])];
  const entries = items.map(i => (i.webkitGetAsEntry ? i.webkitGetAsEntry() : null)).filter(Boolean);
  if (!entries.length || entries.every(e => e.isFile)) return [...(dt.files || [])];
  const outFiles = [];
  const walk = async (entry, prefix) => {
    if (entry.isFile) { const f = await new Promise((res, rej) => entry.file(res, rej)); f._path = prefix + f.name; outFiles.push(f); return; }
    const reader = entry.createReader();
    for (;;) {
      const batch = await new Promise((res, rej) => reader.readEntries(res, rej));
      if (!batch.length) break;
      for (const e of batch) await walk(e, `${prefix}${entry.name}/`);
    }
  };
  for (const e of entries) await walk(e, '');
  return outFiles;
}

/* The page's state for the browser tests: the package that is open, the scan, and the files Pro would save. */
window.__agelens = {
  get model() { return model; },
  get scan() { return scan; },
  archive: date => archiveZip(model, { date: date ? new Date(date) : new Date(), scan: scan && !scan.running ? scan : null }),
  ageText: () => ageReportText(model, scan && !scan.running ? scan : null),
  isoDay, isoTime,
};

wire();
if (document.readyState === 'complete') setupPro(); else window.addEventListener('load', setupPro);
proNote();
