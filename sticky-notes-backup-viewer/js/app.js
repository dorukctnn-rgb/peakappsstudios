// Peelback: the page. Opens plum.sqlite (with plum.sqlite-wal) or StickyNotes.snt, shows the notes as a wall of coloured cards with
// search, colour filters and a reader, copies text and saves the first five notes as a text file (free), and with Pro saves every
// note as text or Markdown files in a ZIP, CSV, JSON, an Evernote file, a Word and Google Docs page or a PDF book and lists the
// deleted notes found in unused space. Nothing read here leaves the browser: this file makes no network request, the files are kept
// in memory only and nothing from the notes is stored.
import { openFiles, StickyError, recoverFromFreePages } from './sticky.js';
import { sampleNotes } from './sample.js';
import { hexOf, stamp, noteText, textBundle, noteMarkdown, notesCsv, notesJson, notesEnex, notesDocHtml, zipText, zipMarkdown, makeBook } from './export.js';
import { PRO, FREE_FIVE, FREE_RECOVERED } from './pro.js';

const $ = id => document.getElementById(id);
const LANG = (document.documentElement.lang || 'en').toLowerCase().split('-')[0].replace('pt', 'pt');
const UI = JSON.parse($('i18n').textContent);
const MAX_BYTES = 400 * 1024 * 1024;
const PAGE = 120;
let state = { notes: [], base: [], recovered: [], info: null, sample: false, theme: 'all', q: '', sort: 'new', showDeleted: false, shown: PAGE };
let pro = false;
let current = []; // the notes on the wall in order (for the reader's next and previous)
let readerAt = -1;
let qTimer = 0;

/* ------------------------------------------------------------------ helpers */
const fill = (s, v) => String(s).replace(/\{(\w+)\}/g, (m, k) => (v[k] != null ? v[k] : m));
const nf = new Intl.NumberFormat(LANG);
const dateFmt = new Intl.DateTimeFormat(LANG, { dateStyle: 'medium' });
const toast = msg => { if (window.PeakUI && PeakUI.toast) PeakUI.toast(msg); };
const T = { untitled: UI.untitled, created: UI.created, modified: UI.modified, color: UI.color, deletedTag: UI.deletedTag, themes: UI.themes, deletedFolder: UI.deletedFolder, notesFolder: UI.notesFolder, docTitle: UI.docTitle, bookTitle: UI.bookTitle, bookCount: UI.bookCount, bookRange: UI.bookRange };
const fold = s => String(s).toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').normalize('NFC');
const themeLabel = t => UI.themes[t] || t;
function download(name, data, type) {
  const blob = data instanceof Blob ? data : new Blob([data], { type: type || 'text/plain;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url; a.download = name; a.rel = 'noopener';
  document.body.appendChild(a); a.click(); a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 60000);
}
const day = () => { const d = new Date(); return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`; };
const busy = text => { $('busy').hidden = !text; if (text) $('busy-text').textContent = text; };
const showError = msg => { const e = $('load-error'); e.textContent = msg; e.hidden = !msg; };
const showNotice = msg => { const e = $('load-notice'); e.textContent = msg; e.hidden = !msg; };
const tick = () => new Promise(r => setTimeout(r, 30));

/* ------------------------------------------------------------------ Pro */
function setupPro() {
  if (!window.PeakLicense) return;
  PeakLicense.setup({ tool: PRO.tool, productId: PRO.productId, permalink: PRO.permalink, buyUrl: PRO.url, pitch: UI.pitch, strings: UI.license, localMessages: true });
  pro = PeakLicense.isPro();
  document.body.classList.toggle('is-pro', pro);
  PeakLicense.onChange(p => { const was = pro; pro = p; document.body.classList.toggle('is-pro', p); if (was !== p && state.notes.length) { applyRecovered(); render(); } });
}
function needPro(why) {
  if (window.PeakLicense && PeakLicense.isPro()) return true;
  if (window.PeakLicense) PeakLicense.open(why || UI.proNeeded);
  return false;
}

/* ------------------------------------------------------------------ opening files */
const WANTED = /^(plum\.sqlite(-wal|-shm)?|stickynotes\.snt)$/i;
async function readEntry(entry, out, depth = 0) {
  if (entry.isFile) {
    if (!WANTED.test(entry.name) && !/\.(sqlite|sqlite3|db|snt)(-wal|-shm)?$/i.test(entry.name)) return;
    await new Promise(res => entry.file(f => { out.push(f); res(); }, res));
  } else if (entry.isDirectory && depth < 4 && entry.name.toLowerCase() !== 'media') {
    const reader = entry.createReader();
    for (let guard = 0; guard < 50; guard++) {
      const batch = await new Promise(res => reader.readEntries(res, () => res([])));
      if (!batch.length) break;
      for (const e of batch) await readEntry(e, out, depth + 1);
    }
  }
}
async function filesFromDrop(dt) {
  const out = [];
  const items = dt.items ? [...dt.items] : [];
  const entries = items.map(i => (i.webkitGetAsEntry ? i.webkitGetAsEntry() : null));
  if (entries.some(e => e && e.isDirectory)) { for (const e of entries) if (e) await readEntry(e, out); return out; }
  return [...dt.files];
}
async function openList(list) {
  showError(''); showNotice('');
  if (!list.length) { showError(UI.errNofile); return; }
  busy(UI.opening);
  await tick();
  try {
    const files = [];
    for (const f of list) {
      if (f.size > MAX_BYTES) throw new StickyError('big', 'big');
      files.push({ name: f.name, bytes: new Uint8Array(await f.arrayBuffer()) });
    }
    const { notes, info } = openFiles(files);
    state = { ...state, base: notes, recovered: [], notes, info, sample: false, theme: 'all', q: '', showDeleted: false, shown: PAGE };
    $('q').value = ''; $('show-deleted').checked = false;
    finishOpen(files.map(f => f.name).join(', '), info);
  } catch (e) {
    busy('');
    showError(e instanceof StickyError ? errorText(e) : UI.errDamaged);
    return;
  }
  busy('');
}
function errorText(e) {
  return ({ nofile: UI.errNofile, unknown: UI.errUnknown, onlywal: UI.errOnlywal, zip: UI.errZip, big: UI.errBig, damaged: UI.errDamaged }[e.code]) || (e.code === 'nonote' ? fill(UI.errNonote, { tables: (e.info && e.info.tables) || '' }) : UI.errDamaged);
}
function finishOpen(fileNames, info) {
  $('step-wait').hidden = true;
  $('result').hidden = false; $('save').hidden = false;
  $('res-title').textContent = fill(UI.opened, { n: nf.format(state.base.some(n => !n.deleted) ? state.base.filter(n => !n.deleted).length : state.base.length), files: fileNames });
  const sub = [];
  if (info && info.source === 'plum' && info.wal) sub.push(fill(UI.walUsed, { n: nf.format(info.wal) }));
  if (state.sample) sub.push(UI.sampleTag);
  $('res-sub').textContent = sub.join(' ');
  if (info && info.source === 'plum' && !info.hadWal && !state.sample) showNotice(UI.walMissing);
  const canRecover = !state.sample && info && info.source === 'plum' && info.sql;
  $('recover').hidden = state.sample;
  $('btn-recover').hidden = !canRecover;
  $('recover-note').textContent = canRecover ? UI.recoverNote : UI.recoverSnt;
  $('recover-result').textContent = '';
  render();
  $('res-title').focus({ preventScroll: true });
  $('result').scrollIntoView({ behavior: matchMedia('(prefers-reduced-motion: reduce)').matches ? 'auto' : 'smooth', block: 'start' });
}
function openSample() {
  showError(''); showNotice('');
  const notes = sampleNotes(LANG);
  state = { ...state, base: notes, recovered: [], notes, info: { source: 'sample' }, sample: true, theme: 'all', q: '', showDeleted: false, shown: PAGE };
  $('q').value = ''; $('show-deleted').checked = false;
  finishOpen(UI.sampleName, state.info);
}
function reset() {
  state = { notes: [], base: [], recovered: [], info: null, sample: false, theme: 'all', q: '', sort: 'new', showDeleted: false, shown: PAGE };
  $('result').hidden = true; $('save').hidden = true; $('step-wait').hidden = false;
  showError(''); showNotice(''); $('file-input').value = ''; $('folder-input').value = '';
  $('wall').replaceChildren();
}

/* ------------------------------------------------------------------ the wall */
function applyRecovered() {
  const r = state.recovered;
  state.notes = state.base.concat(pro ? r : r.slice(0, FREE_RECOVERED));
}
function visible() {
  const q = fold(state.q).trim();
  let list = state.notes.filter(n => (state.showDeleted || !n.deleted) && (state.theme === 'all' || n.theme === state.theme));
  if (q) list = list.filter(n => fold(`${n.title}\n${n.text}`).includes(q));
  const by = { new: (a, b) => (b.modified || b.created) - (a.modified || a.created), old: (a, b) => (a.modified || a.created) - (b.modified || b.created), az: (a, b) => (a.title || '').localeCompare(b.title || '', LANG) }[state.sort];
  return list.sort(by);
}
function renderChips() {
  const pool = state.notes.filter(n => state.showDeleted || !n.deleted);
  const counts = new Map();
  for (const n of pool) counts.set(n.theme, (counts.get(n.theme) || 0) + 1);
  const chips = $('chips'); chips.replaceChildren();
  const mk = (key, label, n, hex) => {
    const b = document.createElement('button');
    b.type = 'button'; b.className = 'pb-chip'; b.setAttribute('aria-pressed', String(state.theme === key)); b.dataset.theme = key;
    if (hex) { const s = document.createElement('span'); s.className = 'pb-chip-dot'; s.style.background = hex; s.setAttribute('aria-hidden', 'true'); b.append(s); }
    b.append(`${label} `); const c = document.createElement('span'); c.className = 'pb-chip-n'; c.textContent = nf.format(n); b.append(c);
    chips.append(b);
  };
  mk('all', UI.all, pool.length, '');
  for (const t of ['Yellow', 'Pink', 'Blue', 'Green', 'Purple', 'Gray', 'Charcoal']) if (counts.get(t)) mk(t, themeLabel(t), counts.get(t), hexOf(t));
  for (const [t, n] of counts) if (!['Yellow', 'Pink', 'Blue', 'Green', 'Purple', 'Gray', 'Charcoal'].includes(t)) mk(t, t, n, hexOf(t));
}
function card(n, i) {
  const li = document.createElement('li');
  const b = document.createElement('button');
  b.type = 'button'; b.className = 'pb-note' + (n.deleted ? ' is-deleted' : '') + (n.theme === 'Charcoal' ? ' is-dark' : '');
  b.style.setProperty('--note', hexOf(n.theme)); b.dataset.i = String(i);
  const title = document.createElement('strong'); title.className = 'pb-note-title'; title.textContent = n.title || UI.empty;
  const body = document.createElement('span'); body.className = 'pb-note-body';
  const rest = n.text.split('\n').slice(1).join('\n').trim();
  body.textContent = rest;
  const meta = document.createElement('span'); meta.className = 'pb-note-meta';
  const when = n.modified || n.created;
  meta.textContent = when ? dateFmt.format(when) : '';
  b.append(title, body, meta);
  if (n.deleted) { const tag = document.createElement('span'); tag.className = 'pb-note-tag'; tag.textContent = n.recovered ? UI.recoveredTag : UI.deletedTag; b.append(tag); }
  li.append(b);
  return li;
}
function render() {
  const list = visible();
  current = list;
  renderChips();
  const total = state.notes.filter(n => state.showDeleted || !n.deleted).length;
  $('count').textContent = list.length === total ? fill(UI.count, { n: nf.format(total) }) : fill(UI.countOf, { n: nf.format(list.length), m: nf.format(total) });
  const wall = $('wall'); wall.replaceChildren();
  const frag = document.createDocumentFragment();
  list.slice(0, state.shown).forEach((n, i) => frag.append(card(n, i)));
  wall.append(frag);
  $('wall-empty').hidden = list.length > 0;
  const more = list.length - state.shown;
  $('more-wrap').hidden = more <= 0;
  if (more > 0) $('btn-more').textContent = `${UI.open} +${nf.format(Math.min(more, PAGE))}`;
  $('deleted-toggle').hidden = !state.notes.some(n => n.deleted);
}

/* ------------------------------------------------------------------ the reader */
function showReader(i) {
  const n = current[i];
  if (!n) return;
  readerAt = i;
  $('rd-swatch').style.background = hexOf(n.theme);
  $('rd-title').textContent = n.title || UI.empty;
  $('rd-meta').textContent = [n.created ? `${UI.created}: ${stamp(n.created)}` : '', n.modified ? `${UI.modified}: ${stamp(n.modified)}` : '', `${UI.color}: ${themeLabel(n.theme)}`, n.deleted ? (n.recovered ? UI.recoveredTag : UI.deletedTag) : ''].filter(Boolean).join('   ');
  $('rd-body').textContent = n.text || UI.empty;
  const pics = $('rd-pics'); pics.hidden = !n.pictures; if (n.pictures) pics.textContent = fill(UI.pictures, { n: n.pictures });
  $('rd-pos').textContent = fill(UI.of, { i: nf.format(i + 1), n: nf.format(current.length) });
  $('rd-prev').disabled = i === 0; $('rd-next').disabled = i === current.length - 1;
  const d = $('reader');
  if (!d.open) d.showModal();
  $('rd-body').scrollTop = 0;
}
async function copyText(text, okMsg) {
  try { await navigator.clipboard.writeText(text); toast(okMsg); return true; } catch (e) {
    const ta = document.createElement('textarea'); ta.value = text; ta.setAttribute('readonly', ''); ta.style.cssText = 'position:fixed;left:-9999px';
    document.body.append(ta); ta.select();
    let ok = false; try { ok = document.execCommand('copy'); } catch (er) { /* refused */ }
    ta.remove();
    toast(ok ? okMsg : UI.copyFailed);
    return ok;
  }
}

/* ------------------------------------------------------------------ saving */
const exportNotes = () => state.notes.filter(n => state.showDeleted || !n.deleted);
function saveFive() {
  const list = current.length ? current : exportNotes();
  download(`sticky-notes-${FREE_FIVE}.txt`, '﻿' + textBundle(list.slice(0, FREE_FIVE), T), 'text/plain;charset=utf-8');
  toast(UI.savedFive);
}
async function proSave(kind) {
  if (!needPro()) return;
  const notes = exportNotes();
  busy(UI.building); await tick();
  try {
    if (kind === 'zip-txt') download(`sticky-notes-text-${day()}.zip`, new Blob([zipText(notes, T)], { type: 'application/zip' }));
    else if (kind === 'zip-md') download(`sticky-notes-markdown-${day()}.zip`, new Blob([zipMarkdown(notes, T)], { type: 'application/zip' }));
    else if (kind === 'csv') download(`sticky-notes-${day()}.csv`, notesCsv(notes), 'text/csv;charset=utf-8');
    else if (kind === 'json') download(`sticky-notes-${day()}.json`, notesJson(notes), 'application/json');
    else if (kind === 'enex') download(`sticky-notes-${day()}.enex`, notesEnex(notes, T), 'application/xml');
    else if (kind === 'doc') download(`sticky-notes-${day()}.html`, notesDocHtml(notes, T, LANG), 'text/html;charset=utf-8');
    else if (kind === 'pdf') {
      const blob = await makeBook(notes, { paper: 'A5', title: UI.bookTitle, locale: document.documentElement.lang || 'en', T, onProgress: p => busy(fill(UI.pdfBusy, { p })) });
      download(`sticky-notes-${day()}.pdf`, blob);
    }
    toast(UI.saved);
  } catch (e) { toast(UI.errDamaged); }
  busy('');
}
function recover() {
  if (!state.info || !state.info.sql) return;
  busy(UI.recoverBusy);
  setTimeout(() => {
    let found = [];
    try { found = recoverFromFreePages(state.info.sql, state.base); } catch (e) { found = []; }
    busy('');
    state.recovered = found;
    const out = $('recover-result');
    if (!found.length) { out.textContent = UI.recoverNone; return; }
    state.showDeleted = true; $('show-deleted').checked = true;
    applyRecovered();
    out.textContent = fill(UI.recoverFound, { n: nf.format(found.length) }) + (!pro && found.length > FREE_RECOVERED ? ' ' + fill(UI.recoverFree, { n: nf.format(found.length) }) : '');
    render();
  }, 30);
}

/* ------------------------------------------------------------------ wiring */
function wire() {
  const input = $('file-input'), folder = $('folder-input'), drop = $('drop');
  $('btn-files').addEventListener('click', () => input.click());
  $('btn-folder').addEventListener('click', () => folder.click());
  input.addEventListener('change', () => { if (input.files.length) openList([...input.files]); input.value = ''; });
  folder.addEventListener('change', () => { const l = [...folder.files].filter(f => WANTED.test(f.name) || /\.(sqlite|sqlite3|db|snt)(-wal|-shm)?$/i.test(f.name)); openList(l); folder.value = ''; });
  let depth = 0;
  document.addEventListener('dragenter', e => { if (e.dataTransfer && [...(e.dataTransfer.types || [])].includes('Files')) { depth++; drop.classList.add('is-over'); } });
  document.addEventListener('dragleave', () => { depth = Math.max(0, depth - 1); if (!depth) drop.classList.remove('is-over'); });
  document.addEventListener('dragover', e => { if (e.dataTransfer && [...(e.dataTransfer.types || [])].includes('Files')) e.preventDefault(); });
  document.addEventListener('drop', async e => { if (!e.dataTransfer || ![...(e.dataTransfer.types || [])].includes('Files')) return; e.preventDefault(); depth = 0; drop.classList.remove('is-over'); openList(await filesFromDrop(e.dataTransfer)); });
  $('btn-sample').addEventListener('click', openSample);
  $('btn-reset').addEventListener('click', reset);
  $('q').addEventListener('input', () => { clearTimeout(qTimer); qTimer = setTimeout(() => { state.q = $('q').value; state.shown = PAGE; render(); }, 120); });
  $('sort').addEventListener('change', () => { state.sort = $('sort').value; render(); });
  $('show-deleted').addEventListener('change', () => { state.showDeleted = $('show-deleted').checked; state.shown = PAGE; render(); });
  $('chips').addEventListener('click', e => { const b = e.target.closest('.pb-chip'); if (!b) return; state.theme = b.dataset.theme; state.shown = PAGE; render(); });
  $('wall').addEventListener('click', e => { const b = e.target.closest('.pb-note'); if (b) showReader(Number(b.dataset.i)); });
  $('btn-more').addEventListener('click', () => { state.shown += PAGE; render(); });
  const rd = $('reader');
  $('rd-close').addEventListener('click', () => rd.close());
  rd.addEventListener('click', e => { if (e.target === rd) rd.close(); });
  rd.addEventListener('close', () => { const b = $('wall').querySelector(`.pb-note[data-i="${readerAt}"]`); if (b) b.focus({ preventScroll: true }); });
  $('rd-prev').addEventListener('click', () => showReader(readerAt - 1));
  $('rd-next').addEventListener('click', () => showReader(readerAt + 1));
  rd.addEventListener('keydown', e => { if (e.key === 'ArrowLeft' && readerAt > 0 && e.target.tagName !== 'INPUT') showReader(readerAt - 1); else if (e.key === 'ArrowRight' && readerAt < current.length - 1) showReader(readerAt + 1); });
  $('rd-copy').addEventListener('click', () => { const n = current[readerAt]; if (n) copyText(n.text, UI.copied); });
  $('rd-save').addEventListener('click', () => { const n = current[readerAt]; if (n) { download(`${(n.title || UI.untitled).replace(/[\\/:*?"<>|]/g, ' ').slice(0, 60).trim() || 'note'}.txt`, '﻿' + noteText(n, T)); toast(UI.saved); } });
  $('btn-copyall').addEventListener('click', () => copyText(exportNotes().map(n => n.text).join('\n\n'), UI.copiedAll));
  $('btn-five').addEventListener('click', saveFive);
  for (const k of ['zip-txt', 'zip-md', 'csv', 'json', 'enex', 'doc', 'pdf']) $(`btn-${k}`).addEventListener('click', () => proSave(k));
  $('btn-recover').addEventListener('click', recover);
}
wire();
setupPro();
