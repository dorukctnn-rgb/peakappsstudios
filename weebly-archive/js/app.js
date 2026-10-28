// Rehoused page: open a Weebly site archive, show the site room by room, and save it as a clean static website.
// The archive is read in a Web Worker (worker.js) on this device; nothing is uploaded, and this script makes no requests.
// The preview is drawn in a sandboxed frame with scripts off; its pictures come from the archive as blob: addresses.
import { escHtml, stamp, safeAccent, DEFAULTS } from './util.js';
import { PRO_READY } from './pro.js';

const $ = id => document.getElementById(id);
const state = { summary: null, sample: false, file: '', mode: 'wide', opts: { ...DEFAULTS }, urls: [], folder: 'website' };
let worker = null;
let pending = null;

function getWorker() {
  if (worker) return worker;
  try { worker = new Worker(new URL('./worker.js', import.meta.url), { type: 'module' }); } catch { worker = null; return null; }
  worker.onmessage = ev => { const p = pending; pending = null; if (p) p.resolve(ev.data); };
  worker.onerror = e => { const p = pending; pending = null; if (p) p.resolve({ type: 'error', code: 'worker', detail: String(e.message || '') }); };
  return worker;
}
function ask(msg, transfer) {
  const w = getWorker();
  if (!w) return Promise.resolve({ type: 'error', code: 'worker' });
  return new Promise(resolve => { pending = { resolve }; w.postMessage(msg, transfer || []); });
}

function stage(name) {
  for (const s of ['idle', 'busy', 'error', 'pick', 'done']) $(`stage-${s}`).hidden = s !== name;
  $('panel').dataset.state = name;
}
function busy(title, sub) {
  $('busy-title').textContent = title;
  $('busy-sub').textContent = sub;
  stage('busy');
}

const ERRORS = {
  empty: ['This file is empty', 'The download may have stopped early. Download the archive again from the link in Weebly\'s email, then choose the new file.'],
  'too-big': ['This file is too large', 'Rehoused opens archives up to 1.9 GB. A Weebly archive is usually far smaller, so this is probably a different file.'],
  'single-page': ['This is one web page, not the archive', 'Weebly\'s archive is a ZIP file that holds every page. Choose the .zip you downloaded from Weebly\'s email.'],
  'not-zip': ['This is not a ZIP file', 'Choose the archive ZIP from Weebly\'s email. If your computer unzipped it already, choose the unzipped folder with "My computer unzipped it" instead.'],
  'no-pages': ['There are no web pages in this ZIP', 'A Weebly archive holds index.html and one HTML file for each page. This ZIP has none, so it may be a different download, such as a folder of pictures.'],
  folder: ['This folder has no web pages', 'Choose the folder that holds index.html: the one you got when the archive ZIP was unzipped.'],
  corrupt: ['The archive could not be read', 'The file may be damaged or cut short. Download the archive again from Weebly\'s email and choose the new file.'],
  worker: ['This browser could not open the archive', 'Try again in a current version of Chrome, Edge, Firefox or Safari.'],
};
function showError(code) {
  const [title, text] = ERRORS[code] || ERRORS.corrupt;
  $('error-title').textContent = title;
  $('error-text').textContent = text;
  stage('error');
  $('error-title').focus();
}

const plural = (n, one, many) => `${Number(n).toLocaleString('en-US')} ${n === 1 ? one : many}`;
const ROOM_KIND = { blog: 'Blog page: posts not in the archive', store: 'Store page: products not in the archive', empty: 'No content found' };

// ---------- opening ----------
async function openFile(file) {
  busy('Opening your archive', 'Reading it on this computer.');
  let bytes;
  try { bytes = await file.arrayBuffer(); } catch { showError('corrupt'); return; }
  handle(await ask({ type: 'open', bytes }, [bytes]), false);
}
// a folder (the archive, unzipped by the computer): packed into a ZIP here, stored, so the worker reads it the same way
async function openFolder(list) {
  const files = list.filter(x => x.path && !/(^|\/)(__MACOSX|\.DS_Store)(\/|$)/.test(x.path));
  if (!files.some(x => /\.html?$/i.test(x.path))) { showError('folder'); return; }
  busy('Opening your folder', `Reading ${plural(files.length, 'file', 'files')} on this computer.`);
  const z = {};
  try {
    for (const x of files) z[x.path] = [new Uint8Array(await x.file.arrayBuffer()), { level: 0 }];
  } catch { showError('corrupt'); return; }
  let bytes;
  try { const { zipSync } = await import('../vendor/fflate.js'); bytes = zipSync(z).buffer; } catch { showError('corrupt'); return; }
  handle(await ask({ type: 'open', bytes }, [bytes]), false);
}
async function openSample() {
  busy('Opening the sample archive', 'A made-up Weebly site, read on this computer.');
  handle(await ask({ type: 'sample' }), true);
}
function handle(msg, sample) {
  if (msg.type === 'sites') { showPick(msg.sites); return; }
  if (msg.type !== 'done') { showError(msg.code); return; }
  state.sample = sample;
  show(msg);
}
function showPick(sites) {
  const list = $('pick-list');
  list.innerHTML = sites.map(s => `<button type="button" class="btn rh-quiet rh-pick" data-key="${escHtml(s.key)}"><b>${escHtml(s.title || s.root)}</b><span>${plural(s.pages, 'page', 'pages')}</span></button>`).join('');
  stage('pick');
  $('pick-title').focus();
}

// ---------- the summary in the house ----------
function count(kinds) { return state.summary.issues.filter(i => kinds.includes(i.kind)).length; }
function show(msg) {
  const s = msg.summary;
  state.summary = s;
  state.folder = (s.title || 'website').toLowerCase().normalize('NFKD').replace(/[^\w]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 40) || 'website';
  const st = s.stats;
  $('done-title').textContent = `Found ${plural(s.pages.length, 'page', 'pages')} of ${s.title || 'your site'}`;
  const needs = s.issues.length;
  $('done-sub').textContent = `${plural(st.images, 'picture', 'pictures')} and ${plural(st.files, 'other file', 'other files')} from the archive come along. ${needs ? `${plural(needs, 'thing needs', 'things need')} you, listed next to the preview.` : 'Nothing is missing.'}${s.isWeebly ? '' : ' This archive does not look like it came from Weebly; Rehoused opened its pages anyway.'}`;
  const list = $('done-list');
  list.innerHTML = s.pages.slice(0, 12).map(p => `<li>${escHtml(p.navTitle || p.title || p.file)}</li>`).join('') + (s.pages.length > 12 ? `<li>and ${plural(s.pages.length - 12, 'more page', 'more pages')}</li>` : '');
  stage('done');
  $('done-title').focus();
  $('plan').hidden = false;
  $('sample-tag').hidden = !state.sample;
  renderRooms();
  renderNeeds();
  renderChanged();
  $('save-status').textContent = '';
  const home = s.pages.find(p => p.file.toLowerCase() === 'index.html') || s.pages[0];
  preview(home.file);
}

// the rooms in the order of the site's menu: each page, and a dashed room where the menu points to a page the archive lacks
function roomOrder() {
  const s = state.summary;
  const byFile = new Map(s.pages.map(p => [p.file, p]));
  const missing = new Map(s.issues.filter(i => i.kind === 'missing-page').map(i => [i.detail, i]));
  const seen = new Set();
  const out = [];
  const walk = items => {
    for (const it of items || []) {
      if (it.kind === 'page' && it.path && byFile.has(it.path) && !seen.has(it.path)) { seen.add(it.path); out.push({ page: byFile.get(it.path) }); }
      else if (it.kind === 'missing' && it.path && !seen.has(it.path)) { seen.add(it.path); out.push({ missing: missing.get(it.path) || { detail: it.path, ref: it.title } }); }
      walk(it.children);
    }
  };
  walk(s.nav);
  for (const p of s.pages) if (!seen.has(p.file)) out.push({ page: p });
  return out;
}
function renderRooms() {
  const rooms = roomOrder().map(r => {
    if (r.missing) return `<div class="rh-room is-missing"><b>${escHtml(r.missing.ref || r.missing.detail)}</b><span class="rh-room-file">${escHtml(r.missing.detail)}</span><span>In your menu, not in the archive</span></div>`;
    const p = r.page;
    const facts = [p.kind in ROOM_KIND ? ROOM_KIND[p.kind] : `${plural(p.words, 'word', 'words')}`, p.images ? plural(p.images, 'picture', 'pictures') : ''].filter(Boolean).join(', ');
    return `<button type="button" class="rh-room${p.kind !== 'page' ? ' is-' + p.kind : ''}" data-file="${escHtml(p.file)}" aria-pressed="${p.file === state.file}"><b>${escHtml(p.navTitle || p.title || p.file)}</b><span class="rh-room-file">${escHtml(p.file)}</span><span>${escHtml(facts)}</span></button>`;
  });
  $('rooms').innerHTML = rooms.join('');
}

const ADVICE = {
  'missing-image': ['picture is not in the archive', 'pictures are not in the archive', 'Weebly linked these to its own servers. Add your own copies to the folders named in the moving report.'],
  'missing-background': ['background picture is kept on Weebly\'s servers', 'background pictures are kept on Weebly\'s servers', 'Save them from your live site while it is still up, or pick new ones. The pages work without them.'],
  'missing-file': ['linked file is not in the archive', 'linked files are not in the archive', 'Upload these files next to the pages, under the names in the moving report.'],
  'missing-page': ['menu link goes to a page the archive does not have', 'menu links go to pages the archive does not have', 'Usually the blog or the store. Copy those pages by hand, or take the links out.'],
  form: ['contact form only worked on Weebly', 'contact forms only worked on Weebly', 'Add your email on the right and each form becomes an email link, or use a form service on your new host.'],
  blog: ['blog page came without its posts', 'blog pages came without their posts', 'Weebly leaves posts out of the archive. Copy them from Weebly before your login ends.'],
  store: ['store page came without its products', 'store pages came without their products', 'Weebly leaves products out of the archive. Export them from your Weebly store before your login ends.'],
  'custom-code': ['custom code element to check', 'custom code elements to check', 'Rehoused kept what it could. Open the page on your new host and check it works.'],
  'weebly-only': ['Weebly element was left out', 'Weebly elements were left out', 'These only work inside Weebly, such as its sign-up and search boxes.'],
  flash: ['Flash element was left out', 'Flash elements were left out', 'Browsers stopped playing Flash in 2021.'],
  empty: ['page has no content', 'pages have no content', 'Check them on Weebly; they may only hold a blog, a store or an element the archive does not keep.'],
};
function renderNeeds() {
  const s = state.summary;
  const out = [];
  for (const [kind, [one, many, how]] of Object.entries(ADVICE)) {
    const list = s.issues.filter(i => i.kind === kind);
    if (!list.length) continue;
    const pages = [...new Set(list.map(i => i.page).filter(Boolean))];
    out.push(`<li><b>${list.length} ${escHtml(list.length === 1 ? one : many)}</b><span>${escHtml(how)}${pages.length ? ` On ${escHtml(pages.slice(0, 4).join(', '))}${pages.length > 4 ? ` and ${pages.length - 4} more` : ''}.` : ''}</span></li>`);
  }
  $('issues').innerHTML = out.length ? out.join('') : '<li><b>Nothing</b><span>Every page, picture and file the pages use is in the archive.</span></li>';
}
function renderChanged() {
  const st = state.summary.stats;
  const items = [
    `${plural(state.summary.pages.length, 'page keeps its', 'pages keep their')} Weebly file name, so old links still work.`,
    st.weeblyScripts || st.scripts ? `Weebly's scripts are left out: nothing on the new pages loads from Weebly.` : '',
    st.trackers ? `${plural(st.trackers, 'tracking script is', 'tracking scripts are')} left out.` : '',
    st.slideshows ? `${plural(st.slideshows, 'slideshow becomes a picture grid', 'slideshows become picture grids')}.` : '',
    st.galleries ? `${plural(st.galleries, 'gallery becomes a plain picture grid', 'galleries become plain picture grids')}.` : '',
    st.forms ? (state.opts.email ? `${plural(st.forms, 'contact form becomes an email link', 'contact forms become email links')} to ${state.opts.email}.` : `${plural(st.forms, 'contact form is', 'contact forms are')} replaced with a note in the page source.`) : '',
    st.remoteImages ? `${plural(st.remoteImages, 'picture from another website stays', 'pictures from other websites stay')} linked to that site.` : '',
    'Every page gets the same plain layout that fits phones, with your menu at the top.',
  ].filter(Boolean);
  $('fixed').innerHTML = items.map(t => `<li>${escHtml(t)}</li>`).join('');
}

// ---------- the preview ----------
function freeUrls() { for (const u of state.urls) URL.revokeObjectURL(u); state.urls = []; }
let previewTick = 0;
async function preview(file) {
  state.file = file;
  for (const b of $('rooms').querySelectorAll('[data-file]')) b.setAttribute('aria-pressed', String(b.dataset.file === file));
  const p = state.summary.pages.find(x => x.file === file);
  $('view-name').textContent = p ? `${p.navTitle || p.title || p.file} (${p.file})` : file;
  const tick = ++previewTick;
  const msg = await ask({ type: 'preview', file, opts: state.opts });
  if (tick !== previewTick || msg.type !== 'preview') return;
  freeUrls();
  const frame = $('view');
  frame.onload = () => fill(frame, msg.images);
  frame.srcdoc = msg.html;
}
function fill(frame, images) {
  const doc = frame.contentDocument;
  if (!doc) return;
  const url = p => {
    const img = images[p];
    if (!img) return '';
    const u = URL.createObjectURL(new Blob([img.bytes], { type: img.type }));
    state.urls.push(u);
    return u;
  };
  let shown = 0, missing = 0;
  for (const el of doc.querySelectorAll('[data-rh-src]')) { const u = url(el.getAttribute('data-rh-src')); if (u) { el.src = u; shown++; } else { el.classList.add('rh-gone'); missing++; } }
  for (const el of doc.querySelectorAll('[data-rh-bg]')) { const u = url(el.getAttribute('data-rh-bg')); if (u) el.style.backgroundImage = `linear-gradient(rgba(0,0,0,.35), rgba(0,0,0,.35)), url("${u}")`; }
  const remote = doc.querySelectorAll('[data-rh-remote]').length;
  const st = doc.createElement('style');
  st.textContent = 'img.rh-gone,img[data-rh-remote]{min-width:120px;min-height:90px;background:repeating-linear-gradient(45deg,#eef1f4 0 10px,#e2e7ec 10px 20px);border-radius:6px}';
  doc.head.appendChild(st);
  doc.addEventListener('click', e => {
    const a = e.target.closest && e.target.closest('a[href]');
    if (!a) return;
    const href = a.getAttribute('href') || '';
    if (href.startsWith('#')) return;
    e.preventDefault();
    const target = href.split('#')[0].replace(/^(\.\.\/)+/, '').replace(/^\.\//, '');
    const page = state.summary.pages.find(x => x.file === target || x.file === decodeURIComponent(target));
    if (page) { preview(page.file); return; }
    if (/^https?:\/\//i.test(href)) { window.open(href, '_blank', 'noopener,noreferrer'); return; }
    status('view-status', 'This link goes to a file, not a page. It works once the site is on its new host.');
  });
  status('view-status', [shown ? plural(shown, 'picture from the archive', 'pictures from the archive') : '', missing ? `${plural(missing, 'picture', 'pictures')} not in the archive (striped)` : '', remote ? `${plural(remote, 'picture', 'pictures')} from other websites, not loaded in the preview (striped)` : ''].filter(Boolean).join('; ') || 'This page has no pictures.');
}
function setMode(mode) {
  state.mode = mode;
  $('view-wide').setAttribute('aria-pressed', String(mode === 'wide'));
  $('view-phone').setAttribute('aria-pressed', String(mode === 'phone'));
  $('frame-wrap').classList.toggle('is-phone', mode === 'phone');
}

// ---------- saving ----------
function status(id, text) { $(id).textContent = text; }
async function saveZip() {
  const btn = $('btn-zip');
  btn.disabled = true;
  status('save-status', 'Writing your site.');
  const msg = await ask({ type: 'zip', opts: state.opts });
  btn.disabled = false;
  if (msg.type !== 'zip') { status('save-status', 'The site could not be written. Open the archive again and try once more.'); return; }
  window.PeakUI.download(new Blob([msg.bytes], { type: 'application/zip' }), msg.name);
  status('save-status', `Saved ${msg.name} with ${plural(msg.count, 'file', 'files')}. Unzip it and upload the folder to any static host; README.txt inside says how.`);
}
async function saveCsv() {
  const msg = await ask({ type: 'csv' });
  if (msg.type !== 'csv') { status('save-status', 'The report could not be written.'); return; }
  window.PeakUI.download(new Blob([msg.text], { type: 'text/csv;charset=utf-8' }), `${state.folder}-moving-report-${stamp(new Date())}.csv`);
  status('save-status', 'Saved the moving report. It opens in Excel, Numbers and Google Sheets.');
}

function readOpts() {
  const accent = $('opt-accent').value;
  state.opts = {
    ...DEFAULTS,
    accent: safeAccent(accent),
    headings: document.querySelector('input[name="opt-headings"]:checked')?.value === 'sans' ? 'sans' : 'serif',
    domain: $('opt-domain').value.trim(),
    email: /^[^\s@<>"]+@[^\s@<>"]+\.[^\s@<>"]+$/.test($('opt-email').value.trim()) ? $('opt-email').value.trim() : '',
  };
  const note = $('opt-accent-note');
  if (note) note.textContent = state.opts.accent !== accent.toLowerCase() ? `Darkened to ${state.opts.accent} so white text on it stays readable.` : '';
}
let optTimer;
function onOpts() {
  clearTimeout(optTimer);
  optTimer = setTimeout(() => { readOpts(); if (state.summary) { renderChanged(); preview(state.file); } }, 200);
}

function reset() {
  freeUrls();
  state.summary = null; state.sample = false; state.file = '';
  $('plan').hidden = true;
  $('view').srcdoc = '';
  $('file-input').value = '';
  stage('idle');
  $('drop-title').focus();
}

// ---------- folders: the input's file list, or a dropped folder ----------
function fromInput(list) { return [...list].map(f => ({ path: f.webkitRelativePath || f.name, file: f })); }
async function fromEntries(items) {
  const out = [];
  const walk = (entry, prefix) => new Promise(resolve => {
    if (entry.isFile) { entry.file(f => { out.push({ path: prefix + f.name, file: f }); resolve(); }, () => resolve()); return; }
    if (!entry.isDirectory) { resolve(); return; }
    const reader = entry.createReader();
    const all = [];
    const next = () => reader.readEntries(async batch => {
      if (batch.length) { all.push(...batch); next(); return; }
      for (const e of all) await walk(e, `${prefix}${entry.name}/`);
      resolve();
    }, () => resolve());
    next();
  });
  for (const e of items) await walk(e, '');
  return out;
}
async function onDrop(e) {
  const items = [...(e.dataTransfer.items || [])].map(i => (i.webkitGetAsEntry ? i.webkitGetAsEntry() : null)).filter(Boolean);
  if (items.some(x => x.isDirectory)) { openFolder(await fromEntries(items)); return; }
  const f = e.dataTransfer.files[0];
  if (f) openFile(f);
}

function wire() {
  const input = $('file-input');
  const folder = $('folder-input');
  $('btn-choose').addEventListener('click', () => input.click());
  $('btn-retry').addEventListener('click', () => input.click());
  $('btn-folder').addEventListener('click', () => folder.click());
  input.addEventListener('change', () => { if (input.files.length) openFile(input.files[0]); input.value = ''; });
  folder.addEventListener('change', () => { if (folder.files.length) openFolder(fromInput(folder.files)); folder.value = ''; });
  $('btn-sample').addEventListener('click', openSample);
  $('btn-error-sample').addEventListener('click', openSample);
  $('btn-reset').addEventListener('click', reset);
  $('pick-list').addEventListener('click', async e => {
    const b = e.target.closest('[data-key]');
    if (!b) return;
    busy('Opening the site', 'Reading it on this computer.');
    handle(await ask({ type: 'pick', key: b.dataset.key }), false);
  });
  const drop = $('drop');
  ['dragenter', 'dragover'].forEach(t => drop.addEventListener(t, e => { e.preventDefault(); drop.classList.add('is-over'); }));
  ['dragleave', 'drop'].forEach(t => drop.addEventListener(t, e => { e.preventDefault(); drop.classList.remove('is-over'); }));
  drop.addEventListener('drop', onDrop);
  $('rooms').addEventListener('click', e => { const b = e.target.closest('[data-file]'); if (b) preview(b.dataset.file); });
  $('view-wide').addEventListener('click', () => setMode('wide'));
  $('view-phone').addEventListener('click', () => setMode('phone'));
  for (const id of ['opt-accent', 'opt-domain', 'opt-email']) $(id).addEventListener('input', onOpts);
  for (const r of document.querySelectorAll('input[name="opt-headings"]')) r.addEventListener('change', onOpts);
  $('btn-zip').addEventListener('click', saveZip);
  $('btn-csv').addEventListener('click', saveCsv);
  $('btn-see').addEventListener('click', e => { e.preventDefault(); $('plan').scrollIntoView({ behavior: matchMedia('(prefers-reduced-motion: reduce)').matches ? 'auto' : 'smooth' }); $('plan-title').focus({ preventScroll: true }); });
  readOpts();
  // Pro is off in this version: nothing on the page offers it (PRO_READY is false), and no licence code is loaded.
  document.documentElement.dataset.pro = PRO_READY ? 'on' : 'off';
}

if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', wire); else wire();
