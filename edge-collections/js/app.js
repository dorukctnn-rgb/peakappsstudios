// Stashback page: open Edge's Collections file, show what it holds, save it as bookmarks or a spreadsheet.
// The file is read in a Web Worker (worker.js) on this device; nothing is uploaded, and this script makes no requests.
import { bookmarksHtml, itemsCsv, linksText, escHtml, stamp } from './engine.js';
import { PRO_READY } from './pro.js';

const $ = id => document.getElementById(id);
const PAGE = 150;
const state = { files: [], result: null, sample: false, adding: false, tab: 'all', q: '', shown: PAGE, urls: [] };
let worker = null;
let pending = null;

function getWorker() {
  if (worker) return worker;
  try { worker = new Worker(new URL('./worker.js', import.meta.url), { type: 'module' }); } catch { worker = null; return null; }
  worker.onmessage = ev => { const p = pending; pending = null; if (p) p.resolve(ev.data); };
  worker.onerror = e => { const p = pending; pending = null; if (p) p.resolve({ type: 'error', code: 'worker', detail: String(e.message || '') }); };
  return worker;
}
function ask(msg) {
  const w = getWorker();
  if (!w) return Promise.resolve({ type: 'error', code: 'worker', detail: 'This browser could not start the reader.' });
  return new Promise(resolve => { pending = { resolve }; w.postMessage(msg); });
}

function stage(name) {
  for (const s of ['idle', 'busy', 'error', 'done']) $(`stage-${s}`).hidden = s !== name;
  $('panel').dataset.state = name;
}
function busy(title, sub) {
  $('busy-title').textContent = title;
  $('busy-sub').textContent = sub;
  stage('busy');
}

const ERRORS = {
  'not-sqlite': ['This is not the Collections file', 'Pick the file called collectionsSQLite, inside the Collections folder of your Edge profile. Shortcuts, web pages and files ending in -journal will not open.'],
  zero: ['This file is empty', 'It is probably collectionsSQLite-journal, a helper file Edge keeps next to the real one. Pick collectionsSQLite, the file beside it.'],
  history: ['This is Edge\'s History file', 'It holds the pages you visited, not your collections. Go to the Collections folder in the same profile and pick collectionsSQLite.'],
  favicons: ['This is Edge\'s icon cache', 'It holds the small website icons Edge shows, not your collections. Go to the Collections folder in the same profile and pick collectionsSQLite.'],
  logins: ['This is Edge\'s password file', 'Stashback does not open it. Go to the Collections folder in the same profile and pick collectionsSQLite.'],
  other: ['This database is not the Collections file', 'It is a database, but not the one Edge keeps for Collections. Pick collectionsSQLite, inside the Collections folder of your Edge profile.'],
  corrupt: ['The file could not be read', 'It may have been copied while Edge was writing to it. Close Edge, then choose the file again. If it still fails, copy the whole Collections folder to your desktop and open the copy.'],
  'too-big': ['This file is too large', 'Stashback opens files up to 512 MB. A Collections file is usually far smaller, so this is probably a different file.'],
  worker: ['This browser could not open the file', 'Try again in a current version of Chrome, Edge, Firefox or Safari.'],
};
function showError(code, detail) {
  const key = code === 'not-collections' ? (ERRORS[detail] ? detail : 'other') : (ERRORS[code] ? code : 'corrupt');
  const [title, text] = ERRORS[key];
  $('error-title').textContent = title;
  $('error-text').textContent = text;
  $('error-list').innerHTML = '';
  stage('error');
  $('error-title').focus();
}

const plural = (n, one, many) => `${n.toLocaleString('en-US')} ${n === 1 ? one : many}`;
const day = iso => (iso ? new Date(iso).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric', timeZone: 'UTC' }) : '');

function kinds(result) {
  const all = result.collections.flatMap(c => c.items).concat(result.loose);
  const k = t => all.filter(i => i.kind === t).length;
  return { all, pages: k('link'), notes: k('note'), clips: k('clip'), images: k('image') };
}

function summary(msg) {
  const r = msg.result;
  const { all, pages, notes, clips, images } = kinds(r);
  const list = $('done-list');
  list.innerHTML = '';
  const add = text => { const li = document.createElement('li'); li.textContent = text; list.appendChild(li); };
  $('btn-see').hidden = !all.length;
  if (!all.length) {
    if (r.warnings.includes('damaged')) {
      $('done-title').textContent = 'This file is damaged or cut short';
      $('done-sub').textContent = `Stashback could read ${plural(r.collections.length, 'collection name', 'collection names')} but none of the saved items. The file may have been copied while Edge was writing to it. Close Edge, copy the whole Collections folder to your desktop and open the copy.`;
      for (const c of r.collections.slice(0, 40)) add(c.title);
    } else if (r.warnings.includes('cloud-only')) {
      $('done-title').textContent = `Edge kept only the names of ${plural(r.names.length, 'collection', 'collections')} here`;
      $('done-sub').innerHTML = 'Their pages are not in this file: they were kept online. Microsoft says personal accounts can still see their collections at <a href="https://www.bing.com/saves" rel="nofollow noopener">bing.com/saves</a>. <a href="/edge-collections/bing-saves/">How to keep a copy from there</a>.';
      for (const n of r.names.slice(0, 40)) add(n);
    } else {
      $('done-title').textContent = 'This file holds no collections';
      $('done-sub').innerHTML = 'Three common reasons: the collections were in another Edge profile (try the file in <code>Profile 1</code>), they were kept online for a personal Microsoft account (see <a href="/edge-collections/bing-saves/">Bing Saves</a>), or they were moved to Favorites when Edge offered it.';
    }
  } else {
    const parts = [plural(pages, 'web page', 'web pages'), notes && plural(notes, 'note', 'notes'), clips && plural(clips, 'clipped text', 'clipped texts'), images && plural(images, 'picture', 'pictures')].filter(Boolean);
    $('done-title').textContent = `Found ${plural(r.collections.length, 'collection', 'collections')} with ${plural(all.length, 'saved item', 'saved items')}`;
    $('done-sub').textContent = `${parts.join(', ')}.${r.loose.length ? ` ${plural(r.loose.length, 'item is', 'items are')} not in any collection and listed on their own.` : ''}`;
    if (r.stats.newest) add(`Newest item in the file: ${day(r.stats.newest)}. If you saved pages after that date, they may be kept online at bing.com/saves.`);
    if (r.names.length) add(`The file also names ${plural(r.names.length, 'collection', 'collections')} kept online: ${r.names.slice(0, 8).join(', ')}${r.names.length > 8 ? ', and more' : ''}.`);
    if (r.stats.skippedDeleted) add(`${plural(r.stats.skippedDeleted, 'item you had removed is', 'items you had removed are')} left out, as Edge did.`);
    if (r.warnings.includes('damaged')) add('Part of the file is damaged or cut short; everything that could be read is shown.');
    if (msg.skipped && msg.skipped.length) add(`${plural(msg.skipped.length, 'file', 'files')} could not be read and ${msg.skipped.length === 1 ? 'was' : 'were'} left out.`);
  }
  stage('done');
  $('done-title').focus();
}

async function openFiles(fileList) {
  const files = [...fileList];
  if (!files.length) return;
  busy(files.length > 1 ? 'Opening your files' : 'Opening your file', 'Reading it on this computer.');
  const loaded = [];
  for (const f of files) {
    try { loaded.push({ name: f.name, size: f.size, bytes: await f.arrayBuffer() }); } catch { showError('corrupt'); return; }
  }
  const all = state.adding && !state.sample ? state.files.concat(loaded) : loaded;
  state.adding = false;
  const labels = all.map((_, i) => (all.length > 1 ? `File ${i + 1}` : ''));
  const msg = await ask({ type: 'open', files: all, labels });
  if (msg.type !== 'done') { showError(msg.code, msg.detail); return; }
  state.files = all;
  state.sample = false;
  show(msg);
}
async function openSample() {
  busy('Opening the sample file', 'A made-up Collections file, read on this computer.');
  const msg = await ask({ type: 'sample' });
  if (msg.type !== 'done') { showError(msg.code, msg.detail); return; }
  state.files = [];
  state.sample = true;
  show(msg);
}

function show(msg) {
  state.result = msg.result;
  state.tab = 'all';
  state.q = '';
  state.shown = PAGE;
  $('q').value = '';
  summary(msg);
  const has = kinds(msg.result).all.length > 0;
  $('collections').hidden = !has;
  $('sample-tag').hidden = !state.sample;
  $('btn-add').hidden = state.sample;
  if (has) render();
}

// ---------- the reader ----------
function blobUrl(img) {
  if (!img || !img.bytes) return '';
  const u = URL.createObjectURL(new Blob([img.bytes], { type: img.type }));
  state.urls.push(u);
  return u;
}
function freeUrls() { for (const u of state.urls) URL.revokeObjectURL(u); state.urls = []; }

const ICONS = {
  link: '<svg viewBox="0 0 22 22" aria-hidden="true" focusable="false"><circle cx="11" cy="11" r="8" fill="none" stroke="currentColor" stroke-width="1.8"/><path d="M3 11h16M11 3c2.6 2.6 2.6 13.4 0 16M11 3c-2.6 2.6-2.6 13.4 0 16" fill="none" stroke="currentColor" stroke-width="1.5"/></svg>',
  note: '<svg viewBox="0 0 22 22" aria-hidden="true" focusable="false"><path d="M4 3.5h14v10l-5 5H4z" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linejoin="round"/><path d="M13 18.5v-5h5M7.5 8h7M7.5 11.5h5" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round"/></svg>',
  clip: '<svg viewBox="0 0 22 22" aria-hidden="true" focusable="false"><path d="M6 7h10M6 11h10M6 15h6" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"/><path d="M3.5 4v14" stroke="currentColor" stroke-width="2.4" stroke-linecap="round"/></svg>',
  image: '<svg viewBox="0 0 22 22" aria-hidden="true" focusable="false"><rect x="3" y="4" width="16" height="14" rx="2" fill="none" stroke="currentColor" stroke-width="1.8"/><circle cx="8" cy="9" r="1.8" fill="currentColor"/><path d="m4 16 5-5 4 4 2-2 3 3" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linejoin="round"/></svg>',
};
ICONS.other = ICONS.note;

function views() {
  const r = state.result;
  const v = [{ id: 'all', title: 'All saved items', items: r.collections.flatMap(c => c.items.map(it => ({ it, col: c.title }))).concat(r.loose.map(it => ({ it, col: 'Not in a collection' }))) }];
  for (const c of r.collections) v.push({ id: c.id, title: c.source ? `${c.title} (${c.source})` : c.title, items: c.items.map(it => ({ it, col: c.title })) });
  if (r.loose.length) v.push({ id: 'loose', title: 'Not in a collection', items: r.loose.map(it => ({ it, col: 'Not in a collection' })) });
  return v;
}
const fold = s => String(s || '').toLowerCase().normalize('NFKD').replace(/[̀-ͯ]/g, '');
const hay = it => fold([it.title, it.url, it.site, it.text, ...it.notes].join(' '));
function mark(text, q) {
  const t = escHtml(text);
  if (!q) return t;
  const f = fold(text);
  const at = f.indexOf(q);
  if (at < 0 || f.length !== String(text).length) return t;
  return escHtml(text.slice(0, at)) + '<mark class="sb-hit">' + escHtml(text.slice(at, at + q.length)) + '</mark>' + escHtml(text.slice(at + q.length));
}

function render() {
  freeUrls();
  const vs = views();
  const tabs = $('tabs');
  tabs.innerHTML = vs.map(v => `<button type="button" class="sb-tab" data-tab="${escHtml(v.id)}" aria-pressed="${v.id === state.tab}"><span>${escHtml(v.title)}</span><b>${v.items.length.toLocaleString('en-US')}</b></button>`).join('');
  const q = fold(state.q.trim());
  const view = q ? vs[0] : (vs.find(v => v.id === state.tab) || vs[0]);
  const rows = q ? view.items.filter(x => hay(x.it).includes(q)) : view.items;
  $('list-head').textContent = q ? `${plural(rows.length, 'item matches', 'items match')} "${state.q.trim()}" in all collections` : `${view.title}: ${plural(rows.length, 'saved item', 'saved items')}`;
  const list = $('list');
  if (!rows.length) { list.innerHTML = `<li class="sb-empty">${q ? 'Nothing matches. Try a shorter word, or clear the search.' : 'This collection is empty.'}</li>`; $('list-more').hidden = true; return; }
  const part = rows.slice(0, state.shown);
  list.innerHTML = part.map(({ it, col }) => {
    const fav = it.favicon ? `<img src="${blobUrl(it.favicon)}" alt="" width="22" height="22">` : ICONS[it.kind] || ICONS.other;
    const title = it.title || it.site || (it.kind === 'note' ? 'Note' : it.kind === 'image' ? 'Picture' : it.url || 'Saved item');
    const head = it.url ? `<a href="${escHtml(it.url)}" target="_blank" rel="noopener noreferrer">${mark(title, q)}</a>` : mark(title, q);
    const when = it.created || it.modified;
    const meta = [q || state.tab === 'all' ? col : '', it.site, when ? `saved ${day(when)}` : ''].filter(Boolean).join(', ');
    const label = it.kind === 'clip' ? 'Clipped text' : 'Note';
    const texts = [it.text ? `<p class="sb-note"><span class="sb-note-label">${label}:</span> ${mark(it.text, q)}</p>` : '', ...it.notes.map(n => `<p class="sb-note"><span class="sb-note-label">Note:</span> ${mark(n, q)}</p>`)].join('');
    const pic = it.image ? `<p class="sb-pic"><img src="${blobUrl(it.image)}" alt="${escHtml(it.title ? `Picture saved as ${it.title}` : 'Saved picture')}" loading="lazy"></p>` : it.remoteImage ? `<p class="sb-meta">Picture kept online at ${escHtml(it.remoteImage.slice(0, 120))}; Edge did not keep a copy in this file.</p>` : '';
    const url = it.url ? `<span class="sb-url">${mark(it.url, q)}</span>` : it.rawUrl ? `<span class="sb-meta">Address left out of exports: ${escHtml(it.rawUrl.slice(0, 160))}</span>` : '';
    return `<li class="sb-item"><span class="sb-ico">${fav}</span><div><h3>${head}</h3>${meta ? `<p class="sb-meta">${escHtml(meta)}</p>` : ''}${url}${texts}${pic}</div></li>`;
  }).join('');
  const more = rows.length - part.length;
  $('list-more').hidden = more <= 0;
  if (more > 0) $('list-more').textContent = `Show ${Math.min(more, PAGE).toLocaleString('en-US')} more (${more.toLocaleString('en-US')} not shown)`;
}

// ---------- saving ----------
const fileStamp = () => stamp(new Date());
function status(text) { $('save-status').textContent = text; }
function saveBookmarks() {
  const html = bookmarksHtml(state.result);
  const n = (html.match(/<DT><A /g) || []).length;
  window.PeakUI.download(new Blob([html], { type: 'text/html;charset=utf-8' }), `edge-collections-bookmarks-${fileStamp()}.html`);
  status(`Saved a bookmarks file with ${plural(n, 'page', 'pages')}. Import it in your browser's bookmarks settings.`);
}
function saveCsv() {
  const csv = itemsCsv(state.result);
  window.PeakUI.download(new Blob([csv], { type: 'text/csv;charset=utf-8' }), `edge-collections-${fileStamp()}.csv`);
  status('Saved the spreadsheet. It opens in Excel, Numbers and Google Sheets.');
}
async function copyLinks() {
  const t = linksText(state.result);
  try { await navigator.clipboard.writeText(t); status('Copied every link, grouped by collection. Paste it into an email or a note.'); } catch { status('This browser blocked copying. Use "Save the bookmarks file" instead.'); }
}
function printAll() {
  const r = state.result;
  const area = $('print-area');
  const block = (title, list) => `<h2>${escHtml(title)}</h2>${list.map(it => `<div class="p-item"><strong>${escHtml(it.title || it.site || (it.kind === 'note' ? 'Note' : 'Saved item'))}</strong>${it.url ? `<div class="p-url">${escHtml(it.url)}</div>` : ''}${[it.text, ...it.notes].filter(Boolean).map(t => `<div class="p-note">${escHtml(t)}</div>`).join('')}${it.image ? `<div><img src="${blobUrl(it.image)}" alt=""></div>` : ''}</div>`).join('')}`;
  area.innerHTML = `<h1>Edge Collections</h1><p>Printed from Stashback on ${escHtml(day(new Date().toISOString()))}.</p>${r.collections.map(c => block(c.source ? `${c.title} (${c.source})` : c.title, c.items)).join('')}${r.loose.length ? block('Not in a collection', r.loose) : ''}`;
  window.print();
}

async function copyPath(btn) {
  const text = btn.dataset.copy;
  try { await navigator.clipboard.writeText(text); btn.textContent = 'Copied. Now click "Choose the file"'; }
  catch { btn.textContent = text; }
}

function reset() {
  freeUrls();
  state.files = []; state.result = null; state.sample = false;
  $('collections').hidden = true;
  $('file-input').value = '';
  stage('idle');
  $('drop-title').focus();
}

function wire() {
  const input = $('file-input');
  $('btn-choose').addEventListener('click', () => { state.adding = false; input.click(); });
  $('btn-retry').addEventListener('click', () => { state.adding = false; input.click(); });
  input.addEventListener('change', () => { if (input.files.length) openFiles(input.files); input.value = ''; });
  $('btn-sample').addEventListener('click', openSample);
  $('btn-error-sample').addEventListener('click', openSample);
  $('btn-reset').addEventListener('click', reset);
  $('btn-add').addEventListener('click', () => { state.adding = true; input.click(); });
  $('btn-copy-path').addEventListener('click', e => copyPath(e.currentTarget));
  const drop = $('drop');
  ['dragenter', 'dragover'].forEach(t => drop.addEventListener(t, e => { e.preventDefault(); drop.classList.add('is-over'); }));
  ['dragleave', 'drop'].forEach(t => drop.addEventListener(t, e => { e.preventDefault(); drop.classList.remove('is-over'); }));
  drop.addEventListener('drop', e => { if (e.dataTransfer.files.length) openFiles(e.dataTransfer.files); });
  $('tabs').addEventListener('click', e => {
    const b = e.target.closest('[data-tab]');
    if (!b) return;
    state.tab = b.dataset.tab; state.shown = PAGE; state.q = ''; $('q').value = '';
    render();
  });
  let t;
  $('q').addEventListener('input', () => { clearTimeout(t); t = setTimeout(() => { state.q = $('q').value; state.shown = PAGE; render(); }, 120); });
  $('list-more').addEventListener('click', () => { state.shown += PAGE; render(); });
  $('btn-bookmarks').addEventListener('click', saveBookmarks);
  $('btn-csv').addEventListener('click', saveCsv);
  $('btn-links').addEventListener('click', copyLinks);
  $('btn-print').addEventListener('click', printAll);
  // Pro is off in this version: nothing on the page offers it (PRO_READY is false), and no licence code is loaded.
  document.documentElement.dataset.pro = PRO_READY ? 'on' : 'off';
}

if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', wire); else wire();
