/* Lastleaf page logic. The files you pick go to the worker (worker.js) in this tab; the page shows the notes the worker
 * finds. The page makes no network request of its own: your notes are never uploaded or stored, and the file is never
 * changed. Pro is off in this version (pro.js): no licence code is loaded. */
import { shownTitle, haystack, fold } from './notes.js';
import { noteText, stamp } from './export.js';
import { escHtml } from './html.js';

const PAGE = 300;
const $ = id => document.getElementById(id);
const nf = new Intl.NumberFormat('en-US');
const fWhen = new Intl.DateTimeFormat('en-US', { dateStyle: 'medium', timeStyle: 'short' });
const fDay = new Intl.DateTimeFormat('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
const plural = (n, one, many) => `${nf.format(n)} ${n === 1 ? one : many}`;

const ERRORS = {
  badjson: ['This file is not complete', 'It looks like the right kind of file (JSON), but it stops part way or has a typing error in it. Download the file from Yahoo\'s email again and open the new copy.'],
  notjson: ['This is not the Notepad file', 'Lastleaf opens the .json or .zip file from Yahoo\'s email. Check that you picked that file, not a photo, a document or the email itself.'],
  emptyfile: ['This file is empty', 'The file has nothing in it. Download it from Yahoo\'s email again; if it is still empty, ask Yahoo for a new download.'],
  zipbad: ['This ZIP file is damaged', 'It could not be opened. Download it from Yahoo\'s email again and open the new copy here.'],
  zipempty: ['This ZIP file is empty', 'There is nothing inside it. Download it from Yahoo\'s email again.'],
  zipdeep: ['This ZIP file has ZIPs inside ZIPs', 'Unpack the outer ZIP on your computer and open the files inside it here.'],
  toobig: ['This file is too large for the browser', 'Files over 512 MB cannot be opened here. If the download is a ZIP, unpack it on your computer and open only the Notepad files.'],
  calendaronly: ['This file holds your calendar, not your notes', 'Yahoo sends the calendar and Notepad together. Look for the Notepad part: another file from the same download, often in the same ZIP.'],
  nonotes: ['No notes were found', 'The file opened, but no notes were found in it. If you had notes in Notepad, ask Yahoo for the download again, or write to info@peakappsstudio.com and we will help you read it.'],
  noworker: ['This browser cannot open the file', 'Try a current version of Chrome, Edge, Firefox or Safari.'],
  internal: ['Something went wrong while opening the file', 'Try again. If it happens again, try the file in another browser.'],
};
const PROBLEM_WORDS = { badjson: 'not complete or has a typing error', notjson: 'not a JSON file', emptyfile: 'empty', zipbad: 'a damaged ZIP', zipempty: 'an empty ZIP', zipdeep: 'too many ZIPs inside ZIPs', toobig: 'too large' };

const state = { book: null, hay: [], folder: null, q: '', sort: 'new', list: [], shown: PAGE, sel: null, map: null };
let worker = null, seq = 0;
const waiting = new Map();

/* ---------- the worker ---------- */
function getWorker() {
  if (worker) return worker;
  try { worker = new Worker(new URL('./worker.js', import.meta.url), { type: 'module' }); } catch (e) { worker = null; return null; }
  worker.onmessage = onWorker;
  worker.onerror = e => { if (e.preventDefault) e.preventDefault(); fail('noworker'); };
  return worker;
}
function call(kind) {
  const w = getWorker();
  if (!w) return Promise.reject(new Error('noworker'));
  const id = ++seq;
  return new Promise((resolve, reject) => { waiting.set(id, { resolve, reject }); w.postMessage({ type: 'export', id, kind }); });
}
function onWorker(ev) {
  const m = ev.data || {};
  if (m.id != null && waiting.has(m.id)) {
    const w = waiting.get(m.id);
    waiting.delete(m.id);
    if (m.type === 'error') w.reject(Object.assign(new Error(m.detail || m.code), { code: m.code })); else w.resolve(m.blob);
    return;
  }
  if (m.type === 'opened') loaded(m.data);
  else if (m.type === 'map') showMap(m.data);
  else if (m.type === 'preview') showPreview(m.data);
  else if (m.type === 'failed') { failed(m); askReport(); }
  else if (m.type === 'report') showReport(m.text);
  else if (m.type === 'error') fail('internal', m.detail);
}

/* ---------- the panel ---------- */
const STAGES = ['idle', 'busy', 'map', 'error', 'done'];
function stage(name) {
  STAGES.forEach(s => { $('stage-' + s).hidden = s !== name; });
  $('panel').dataset.state = name;
}
const focusEl = el => { if (el) el.focus({ preventScroll: true }); };
function fail(code, detail, list = []) {
  const [title, text] = ERRORS[code] || ERRORS.internal;
  $('error-title').textContent = title;
  $('error-text').textContent = text;
  $('error-list').innerHTML = list.map(t => `<li>${escHtml(t)}</li>`).join('');
  stage('error');
  focusEl($('error-title'));
}
const shortName = n => String(n).split(' > ').pop().split('/').pop();
const problemLines = problems => problems.map(p => `Not read: ${shortName(p.name)} (${PROBLEM_WORDS[p.code] || 'could not be read'}).`);
function failed(m) {
  const problems = m.problems || [], calendars = m.calendars || [];
  if (m.nonotes) return fail('nonotes', '', problemLines(problems));
  if (!problems.length && calendars.length) return fail('calendaronly', '', calendars.map(c => `Set aside: ${shortName(c)} (calendar).`));
  const first = problems[0];
  const code = first ? first.code : 'nonotes';
  fail(code, first && first.detail, problems.length > 1 || calendars.length ? problemLines(problems).concat(calendars.map(c => `Set aside: ${shortName(c)} (calendar).`)) : []);
}
function busy(title, sub) {
  $('busy-title').textContent = title;
  $('busy-sub').textContent = sub;
  stage('busy');
  focusEl($('busy-title'));
}
function openFiles(list) {
  const files = [...(list || [])].filter(Boolean);
  if (!files.length) return;
  const w = getWorker();
  if (!w) return fail('noworker');
  fromFile = true; showReport('');
  busy(files.length === 1 ? `Opening ${shortName(files[0].name)}` : `Opening ${plural(files.length, 'file', 'files')}`, 'Reading it on this computer. Nothing is uploaded.');
  w.postMessage({ type: 'open', files });
}
function openSample() {
  const w = getWorker();
  if (!w) return fail('noworker');
  fromFile = false; showReport('');
  busy('Opening the sample notes', 'These notes are made up by Lastleaf.');
  w.postMessage({ type: 'sample' });
}

/* ---------- mapping: point at the fields ---------- */
const typeHint = k => {
  const t = Object.entries(k.types).sort((a, b) => b[1] - a[1]).map(([name, c]) => `${name} ${nf.format(c)}`).join(', ');
  return `${k.key} (${t})`;
};
function fillSelect(sel, keys, chosen, optional) {
  sel.innerHTML = (optional ? '<option value="">(none)</option>' : '') + keys.map(k => `<option value="${escHtml(k.value)}"${k.value === chosen ? ' selected' : ''}>${escHtml(k.label)}</option>`).join('');
  if (chosen == null && optional) sel.value = '';
}
function showMap(data) {
  state.map = data;
  $('map-text').textContent = `We could not tell which parts of ${data.name} are the notes. Pick them below; the preview shows the first notes as you choose.${data.found ? ` ${plural(data.found, 'note was', 'notes were')} already found in your other files and will be kept.` : ''}`;
  $('map-list').innerHTML = data.candidates.map((c, i) => `<option value="${i}">${escHtml(c.label)} (${plural(c.count, 'item', 'items')})</option>`).join('');
  $('map-report').textContent = data.report;
  $('map-copied').textContent = '';
  if (!data.candidates.length) {
    $('map-form').hidden = true;
    $('map-text').textContent = `We found no list of notes in ${data.name}. You can skip this file, or copy the structure report below and send it to us.`;
  } else { $('map-form').hidden = false; pickList(0); }
  stage('map');
  focusEl($('map-title'));
}
function pickList(i) {
  const c = state.map.candidates[i];
  const keys = c.keys.map(k => ({ value: k.key, label: typeHint(k) }));
  const g = c.guess || {};
  fillSelect($('map-key-title'), keys, g.title, true);
  fillSelect($('map-key-body'), keys, g.body ?? (c.keys.find(k => k.types.text) || {}).key, false);
  fillSelect($('map-key-created'), keys, g.created, true);
  fillSelect($('map-key-modified'), keys, g.modified, true);
  const parents = (c.parentKeys || []).map(k => ({ value: `parent:${k}`, label: k === '#key' ? 'the name each list is filed under' : `${k} (from the list above the notes)` }));
  fillSelect($('map-key-folder'), keys.concat(parents), g.folder ?? (parents[0] && parents[0].value), true);
  sendPreview();
}
function currentMapping() {
  const c = state.map.candidates[Number($('map-list').value) || 0];
  const v = id => $(id).value || null;
  return { path: c.path, title: v('map-key-title'), body: v('map-key-body'), created: v('map-key-created'), modified: v('map-key-modified'), folder: v('map-key-folder') };
}
function sendPreview() { getWorker().postMessage({ type: 'preview', mapping: currentMapping() }); }
function showPreview(p) {
  const rows = p.first.map(n => `<li><strong>${escHtml(n.title || '(no title)')}</strong>${n.folder ? ` <span class="yn-small">in ${escHtml(n.folder)}</span>` : ''}${n.modified || n.created ? ` <span class="yn-small">${escHtml(fDay.format(n.modified || n.created))}</span>` : ''}<br>${escHtml(n.text || '(empty)')}</li>`).join('');
  $('map-preview').innerHTML = `<p style="margin:0">With these choices: ${plural(p.count, 'note', 'notes')}. The first ones:</p>${rows ? `<ol>${rows}</ol>` : '<p style="margin:6px 0 0">None yet. Try another list or another text field.</p>'}`;
}
async function copyReport() {
  const text = $('map-report').textContent;
  let ok = false;
  try { await navigator.clipboard.writeText(text); ok = true; } catch (e) { ok = copyFallback(text); }
  $('map-copied').textContent = ok ? 'Copied. Paste it into an email to info@peakappsstudio.com if you would like our help.' : 'Copying did not work in this browser. Select the report above and copy it.';
}
function copyFallback(text) {
  const ta = document.createElement('textarea');
  ta.value = text; ta.setAttribute('readonly', ''); ta.style.position = 'fixed'; ta.style.opacity = '0';
  document.body.appendChild(ta); ta.select();
  let ok = false;
  try { ok = document.execCommand('copy'); } catch (e) { ok = false; }
  ta.remove();
  return ok;
}

/* ---------- the structure report after a file opens or fails (keys only) ---------- */
let fromFile = false;
function askReport() { if (fromFile && worker) worker.postMessage({ type: 'report' }); }
function showReport(text) {
  $('report-box').hidden = !text;
  $('report-text').textContent = text || '';
  $('report-copied').textContent = '';
}
async function copyAfterReport() {
  const text = $('report-text').textContent;
  let ok = false;
  try { await navigator.clipboard.writeText(text); ok = true; } catch (e) { ok = copyFallback(text); }
  $('report-copied').textContent = ok ? 'Copied. Paste it into an email to info@peakappsstudio.com.' : 'Copying did not work in this browser. Open "See exactly what is copied" and copy the text.';
}

/* ---------- opened ---------- */
function loaded(data) {
  state.book = data;
  state.hay = data.notes.map(haystack);
  state.folder = null; state.q = ''; state.sel = null; state.shown = PAGE; state.sort = 'new';
  $('q').value = ''; $('sort').value = 'new';
  const n = data.notes.length;
  if (!data.sample) askReport(); else showReport('');
  if (!n) return failed({ nonotes: true, problems: data.problems, calendars: data.calendars });
  const books = data.folders.filter(f => f.name).length;
  $('done-title').textContent = data.sample ? `${plural(n, 'sample note is', 'sample notes are')} open` : `${plural(n, 'note is', 'notes are')} open`;
  const from = data.sample ? 'These notes are made up by Lastleaf, so you can try every button.' : `From ${data.sources.map(shortName).join(', ')}${books ? `, in ${plural(books, 'notebook', 'notebooks')}` : ''}.`;
  $('done-sub').textContent = from;
  $('done-list').innerHTML = data.calendars.map(c => `<li>Set aside: ${escHtml(shortName(c))} (your calendar; Lastleaf reads notes only).</li>`).concat(problemLines(data.problems).map(t => `<li>${escHtml(t)}</li>`)).join('');
  $('sample-tag').hidden = !data.sample;
  $('save-status').textContent = '';
  $('btn-save-all').textContent = `Save all ${plural(n, 'note', 'notes')} as text`;
  stage('done');
  $('notes').hidden = false;
  renderRail();
  refresh();
  focusEl($('done-title'));
}

/* ---------- notebooks, the list ---------- */
function renderRail() {
  const f = state.book.folders;
  const btn = (value, label, n) => `<button type="button" data-folder="${escHtml(value)}"><span>${escHtml(label)}</span><span class="yn-count">${nf.format(n)}</span></button>`;
  const all = btn('*', 'All notes', state.book.notes.length);
  const named = f.filter(x => x.name).map(x => btn(x.name, x.name, x.count));
  const none = f.find(x => !x.name);
  $('rail-list').innerHTML = all + named.join('') + (none && named.length ? btn('', 'Not in a notebook', none.count) : '');
  $('rail').hidden = !named.length;
  syncRail();
}
function syncRail() {
  document.querySelectorAll('#rail-list button').forEach(b => b.setAttribute('aria-pressed', String((b.dataset.folder === '*' && state.folder == null) || (state.folder != null && b.dataset.folder === state.folder))));
}
function filtered() {
  const words = fold(state.q.trim()).split(/\s+/).filter(Boolean);
  const out = [];
  const notes = state.book.notes;
  for (let i = 0; i < notes.length; i++) {
    const n = notes[i];
    if (state.folder != null && n.folder !== state.folder) continue;
    if (words.length && !words.every(w => state.hay[i].includes(w))) continue;
    out.push(n);
  }
  if (state.sort === 'old') out.sort((a, b) => (a.modified ?? Infinity) - (b.modified ?? Infinity) || a.n - b.n);
  else if (state.sort === 'title') out.sort((a, b) => (shownTitle(a) || '\uffff').localeCompare(shownTitle(b) || '\uffff', 'en', { sensitivity: 'base' }));
  return out;
}
const narrow = () => window.matchMedia('(max-width: 860px)').matches;
function refresh(keepSel = false) {
  state.list = filtered();
  if (!keepSel) state.shown = PAGE;
  syncRail();
  renderList();
  if (!state.list.length) showNote(null);
  else if (keepSel && state.list.some(n => n.n === state.sel)) showNote(state.sel, false);
  else showNote(narrow() ? null : state.list[0].n, false);
}
function snippet(n) {
  const t = n.title ? n.text : n.text.split('\n').slice(1).join(' ');
  return t.replace(/\s+/g, ' ').trim().slice(0, 160);
}
function renderList() {
  const total = state.book.notes.length;
  const k = state.list.length;
  let head = state.q.trim() ? `${plural(k, 'note matches', 'notes match')} "${state.q.trim()}"` : `${plural(k, 'note', 'notes')}`;
  if (state.folder != null) head += ` in ${state.folder || 'no notebook'}`;
  if (k !== total && !state.q.trim() && state.folder == null) head += ` of ${nf.format(total)}`;
  $('list-head').textContent = head;
  const box = $('list');
  if (!k) {
    box.innerHTML = `<li class="yn-empty">${state.q.trim() ? 'No note has those words. Check the spelling, or try fewer words.' : 'No notes here.'}</li>`;
    $('list-more').hidden = true;
    return;
  }
  box.innerHTML = state.list.slice(0, state.shown).map(n => {
    const date = n.modified ?? n.created;
    return `<li><button type="button" class="yn-item" data-n="${n.n}" aria-current="${n.n === state.sel}"><span class="yn-item-title" dir="auto">${escHtml(shownTitle(n) || '(no title)')}</span><span class="yn-item-snip" dir="auto">${escHtml(snippet(n) || (n.text ? '' : 'Empty note'))}</span><span class="yn-item-date">${date != null ? escHtml(fDay.format(date)) : 'No date'}${n.folder && state.folder == null ? `, in ${escHtml(n.folder)}` : ''}</span></button></li>`;
  }).join('');
  if (state.q.trim()) markIn(box, state.q);
  const left = k - state.shown;
  $('list-more').hidden = left <= 0;
  $('list-more').textContent = `Show ${nf.format(Math.min(PAGE, left))} more`;
}
function markIn(root, q) {
  const words = fold(q.trim()).split(/\s+/).filter(w => w.length > 0);
  if (!words.length) return;
  const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT);
  const nodes = [];
  while (walker.nextNode()) nodes.push(walker.currentNode);
  for (const node of nodes) {
    const text = node.nodeValue;
    const f = fold(text);
    if (f.length !== text.length) continue;
    const hits = [];
    for (const w of words) { let i = f.indexOf(w); while (i >= 0) { hits.push([i, i + w.length]); i = f.indexOf(w, i + w.length); } }
    if (!hits.length) continue;
    hits.sort((a, b) => a[0] - b[0]);
    const frag = document.createDocumentFragment();
    let at = 0;
    for (const [s, e] of hits) {
      if (s < at) continue;
      if (s > at) frag.appendChild(document.createTextNode(text.slice(at, s)));
      const m = document.createElement('mark'); m.className = 'yn-hit'; m.textContent = text.slice(s, e); frag.appendChild(m);
      at = e;
    }
    if (at < text.length) frag.appendChild(document.createTextNode(text.slice(at)));
    node.parentNode.replaceChild(frag, node);
  }
}

/* ---------- one note ---------- */
function showNote(id, focus = true) {
  state.sel = id;
  document.querySelectorAll('#list .yn-item').forEach(b => b.setAttribute('aria-current', String(Number(b.dataset.n) === id)));
  const pane = $('pane');
  const n = id == null ? null : state.book.notes[id];
  document.body.classList.toggle('yn-reading', !!n && narrow());
  if (!n) { pane.innerHTML = `<p class="yn-pane-empty">${state.list.length ? 'Pick a note to read it.' : ''}</p>`; return; }
  const meta = [['Notebook', n.folder || 'None']];
  if (n.created != null) meta.push(['Created', fWhen.format(n.created)]);
  if (n.modified != null && n.modified !== n.created) meta.push(['Last changed', fWhen.format(n.modified)]);
  const body = n.html ? `<div class="yn-body" dir="auto">${n.html}</div>` : `<div class="yn-body is-text" dir="auto">${n.text ? escHtml(n.text) : '<span class="yn-pane-empty">This note is empty.</span>'}</div>`;
  pane.innerHTML = `<article class="yn-note" aria-labelledby="note-title">
<button type="button" class="btn yn-quiet yn-back" id="pane-back">Back to the list</button>
<h3 id="note-title" tabindex="-1" dir="auto">${escHtml(shownTitle(n) || '(no title)')}</h3>
<dl class="yn-meta">${meta.map(([k, v]) => `<div><dt>${escHtml(k)}:</dt><dd>${escHtml(v)}</dd></div>`).join('')}</dl>
${body}
<div class="yn-note-actions"><button type="button" class="btn btn-primary" id="note-copy">Copy this note</button><button type="button" class="btn yn-quiet" id="note-print">Print this note</button></div>
<p class="yn-status" id="note-status" role="status"></p>
</article>`;
  if (state.q.trim()) markIn(pane.querySelector('.yn-body') || pane, state.q);
  if (focus) focusEl($('note-title'));
}
async function copyNote() {
  const n = state.book.notes[state.sel];
  if (!n) return;
  const text = noteText(n);
  let ok = false;
  try { await navigator.clipboard.writeText(text); ok = true; } catch (e) { ok = copyFallback(text); }
  $('note-status').textContent = ok ? 'Copied. Paste it into any notes app or email.' : 'Copying did not work in this browser. Select the text and copy it.';
}
function printNote() {
  const n = state.book.notes[state.sel];
  if (!n) return;
  const meta = [n.folder ? `Notebook: ${n.folder}` : '', n.created != null ? `Created: ${fWhen.format(n.created)}` : '', n.modified != null && n.modified !== n.created ? `Last changed: ${fWhen.format(n.modified)}` : ''].filter(Boolean).join('. ');
  const box = $('print-area');
  box.innerHTML = `<h1 dir="auto">${escHtml(shownTitle(n) || '(no title)')}</h1><p class="yn-print-meta">${escHtml(meta)}</p>${n.html ? `<div dir="auto">${n.html}</div>` : `<div class="yn-print-body" dir="auto">${escHtml(n.text || 'This note is empty.')}</div>`}<p class="yn-print-foot">From Yahoo Notepad, printed with Lastleaf (peakappsstudio.com/yahoo-notepad).</p>`;
  document.body.classList.add('yn-printing');
  const done = () => { document.body.classList.remove('yn-printing'); box.innerHTML = ''; window.removeEventListener('afterprint', done); };
  window.addEventListener('afterprint', done);
  window.print();
  setTimeout(() => { if (!window.matchMedia('print').matches) done(); }, 1500);
}
async function saveAll(btn) {
  btn.disabled = true;
  $('save-status').textContent = 'Making the file...';
  try {
    const blob = await call('txt-all');
    const day = stamp(Date.now()).slice(0, 10);
    const file = state.book.sample ? `lastleaf-sample-notes-${day}.txt` : `yahoo-notepad-notes-${day}.txt`;
    window.PeakUI.download(blob, file);
    $('save-status').textContent = `Saved ${file} with ${plural(state.book.notes.length, 'note', 'notes')}. Look in your Downloads folder.`;
  } catch (e) { $('save-status').textContent = 'The file could not be made. Try again.'; }
  finally { btn.disabled = false; }
}

/* ---------- wiring ---------- */
function wire() {
  const input = $('file-input');
  $('btn-choose').addEventListener('click', () => input.click());
  $('btn-retry').addEventListener('click', () => { stage('idle'); input.click(); });
  $('btn-sample').addEventListener('click', openSample);
  $('btn-error-sample').addEventListener('click', openSample);
  $('btn-reset').addEventListener('click', () => { stage('idle'); showReport(''); focusEl($('drop-title')); });
  input.addEventListener('change', () => { const f = input.files ? [...input.files] : []; input.value = ''; openFiles(f); });
  const drop = $('drop');
  ['dragenter', 'dragover'].forEach(t => drop.addEventListener(t, e => { e.preventDefault(); drop.classList.add('is-over'); }));
  ['dragleave', 'drop'].forEach(t => drop.addEventListener(t, e => { e.preventDefault(); drop.classList.remove('is-over'); }));
  drop.addEventListener('drop', e => { const f = e.dataTransfer && e.dataTransfer.files; if (f && f.length) openFiles(f); });
  $('btn-see').addEventListener('click', e => { e.preventDefault(); $('notes').scrollIntoView({ behavior: matchMedia('(prefers-reduced-motion: reduce)').matches ? 'auto' : 'smooth' }); focusEl($('app-title')); });

  $('map-list').addEventListener('change', () => pickList(Number($('map-list').value) || 0));
  ['map-key-title', 'map-key-body', 'map-key-created', 'map-key-modified', 'map-key-folder'].forEach(id => $(id).addEventListener('change', sendPreview));
  $('map-form').addEventListener('submit', e => { e.preventDefault(); busy('Reading your notes', 'Using the fields you picked.'); getWorker().postMessage({ type: 'mapped', mapping: currentMapping() }); });
  $('map-skip').addEventListener('click', () => { busy('Skipping this file', ''); getWorker().postMessage({ type: 'skip' }); });
  $('map-copy').addEventListener('click', copyReport);
  $('report-copy').addEventListener('click', copyAfterReport);

  let t = null;
  $('q').addEventListener('input', () => { clearTimeout(t); t = setTimeout(() => { state.q = $('q').value; refresh(); }, 150); });
  $('sort').addEventListener('change', () => { state.sort = $('sort').value; refresh(true); });
  $('rail-list').addEventListener('click', e => {
    const b = e.target.closest('button[data-folder]');
    if (!b) return;
    state.folder = b.dataset.folder === '*' ? null : b.dataset.folder;
    refresh();
  });
  $('list').addEventListener('click', e => { const b = e.target.closest('.yn-item'); if (b) showNote(Number(b.dataset.n), narrow()); });
  $('list').addEventListener('keydown', e => {
    if (e.key !== 'ArrowDown' && e.key !== 'ArrowUp') return;
    const items = [...document.querySelectorAll('#list .yn-item')];
    const i = items.indexOf(document.activeElement);
    if (i < 0) return;
    e.preventDefault();
    const next = items[Math.max(0, Math.min(items.length - 1, i + (e.key === 'ArrowDown' ? 1 : -1)))];
    next.focus(); showNote(Number(next.dataset.n), false);
  });
  $('list-more').addEventListener('click', () => { state.shown += PAGE; renderList(); });
  $('pane').addEventListener('click', e => {
    if (e.target.closest('#note-copy')) copyNote();
    else if (e.target.closest('#note-print')) printNote();
    else if (e.target.closest('#pane-back')) { const id = state.sel; showNote(null); focusEl(document.querySelector(`#list .yn-item[data-n="${id}"]`)); }
  });
  document.addEventListener('keydown', e => { if (e.key === 'Escape' && document.body.classList.contains('yn-reading')) { const id = state.sel; showNote(null); focusEl(document.querySelector(`#list .yn-item[data-n="${id}"]`)); } });
  $('btn-save-all').addEventListener('click', e => saveAll(e.currentTarget));
}

wire();
stage('idle');
