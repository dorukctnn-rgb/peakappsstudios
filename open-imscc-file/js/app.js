/* Cubby page logic. The course export is read here, in this tab (js/course.js); nothing is sent anywhere. The only
 * network call the page can make is Gumroad's licence check (/assets/license.js), and only when a Pro key is pasted. */
import { openCourse, fileBytes, mimeOf, isImage, summaryOf } from './course.js';
import { itemBodyHtml, quizHtml, detailsOf, itemText, courseBook, quizzesZip, filesZip, safeName, rubricHtml, KIND_LABEL } from './export.js';
import { htmlToText, esc } from './html.js';
import { questionsOf } from './qti.js';
import { PRO, PRO_READY, PRO_PITCH } from './pro.js';
import { sampleBytes, SAMPLE_NAME } from './sample.js';

const $ = id => document.getElementById(id);
const BASE = '/open-imscc-file/';
const TAPES = ['var(--t1)', 'var(--t2)', 'var(--t3)', 'var(--t4)', 'var(--t5)', 'var(--t6)'];
const ICON = {
  page: '<path d="M5 2.5h7l3.5 3.5v11.5H5z" fill="none" stroke="currentColor" stroke-width="1.6"/><path d="M7.5 9h5.5M7.5 12h5.5M7.5 15h3.5" stroke="currentColor" stroke-width="1.5"/>',
  assignment: '<path d="M4 15.5 13.5 6l2.5 2.5L6.5 18H4z" fill="none" stroke="currentColor" stroke-width="1.6"/><path d="M12 7.5l2.5 2.5" stroke="currentColor" stroke-width="1.6"/>',
  quiz: '<path d="M3.5 5.5l1.5 1.5 3-3M3.5 11.5l1.5 1.5 3-3" fill="none" stroke="currentColor" stroke-width="1.6"/><path d="M10 6h7M10 12h7M4 17.5h13" stroke="currentColor" stroke-width="1.6"/>',
  bank: '<rect x="3.5" y="3.5" width="13" height="4" fill="none" stroke="currentColor" stroke-width="1.6"/><rect x="3.5" y="9" width="13" height="4" fill="none" stroke="currentColor" stroke-width="1.6"/><rect x="3.5" y="14.5" width="13" height="3" fill="none" stroke="currentColor" stroke-width="1.6"/>',
  discussion: '<path d="M3 4h10v7H7l-3 3v-3H3z" fill="none" stroke="currentColor" stroke-width="1.6"/><path d="M15 8h2v7h-1v2.5L13.5 15H9v-2" fill="none" stroke="currentColor" stroke-width="1.6"/>',
  announcement: '<path d="M3 8v4h3l6 4V4L6 8z" fill="none" stroke="currentColor" stroke-width="1.6"/><path d="M15 7.5c1.5 1.3 1.5 3.7 0 5" fill="none" stroke="currentColor" stroke-width="1.6"/>',
  link: '<path d="M8.5 11.5a3 3 0 0 0 4.2 0l3-3a3 3 0 0 0-4.2-4.2l-1 1M11.5 8.5a3 3 0 0 0-4.2 0l-3 3a3 3 0 0 0 4.2 4.2l1-1" fill="none" stroke="currentColor" stroke-width="1.6"/>',
  tool: '<path d="M8 3h4v3a2 2 0 1 1 0 0v0h3v4h-3a2 2 0 1 0 0 0v0 0h0v4H8v-3a2 2 0 1 0 0 0H5V10h3a2 2 0 1 0 0 0V6z" fill="none" stroke="currentColor" stroke-width="1.4"/>',
  file: '<path d="M13 6.5 7.8 11.7a1.7 1.7 0 0 0 2.4 2.4l5.6-5.6a3.2 3.2 0 0 0-4.5-4.5L5.6 9.7a4.6 4.6 0 0 0 6.5 6.5L16.5 12" fill="none" stroke="currentColor" stroke-width="1.6"/>',
  syllabus: '<rect x="4" y="2.5" width="12" height="15" fill="none" stroke="currentColor" stroke-width="1.6"/><path d="M7 7h6M7 10h6M7 13h4" stroke="currentColor" stroke-width="1.5"/>',
};
const icon = k => `<svg viewBox="0 0 20 20" aria-hidden="true" focusable="false">${ICON[k] || ICON.page}</svg>`;

let course = null;
let current = null;
let showAnswers = false;
let blobs = new Map();
let index = new Map();
let pro = false;

/* ------------------------------------------------------------------ Pro */
function setupPro() {
  if (!window.PeakLicense) return;
  PeakLicense.setup({ tool: 'cubby', productId: PRO_READY ? PRO.productId : 'PENDING', permalink: PRO.permalink, buyUrl: PRO.url, pitch: PRO_PITCH });
  pro = PRO_READY && PeakLicense.isPro();
  PeakLicense.onChange(p => { pro = PRO_READY && p; document.body.classList.toggle('is-pro', pro); proNote(); });
}
function proNote() {
  const n = $('save-note');
  if (n) n.textContent = pro ? 'Pro is on in this browser. Choose what to save.' : 'Reading, printing and copying one item at a time is free. Pro saves everything in one go for $8, paid once.';
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
  setTimeout(() => URL.revokeObjectURL(url), 60000);
}
function blobFor(path) {
  if (blobs.has(path)) return blobs.get(path);
  const bytes = fileBytes(course, path);
  if (!bytes) return null;
  const url = URL.createObjectURL(new Blob([bytes], { type: mimeOf(path) }));
  blobs.set(path, url);
  return url;
}
const imageSrc = path => (isImage(path) ? blobFor(path) : null);
function fmtSize(n) { return n < 1024 ? `${n} bytes` : n < 1048576 ? `${(n / 1024).toFixed(n < 10240 ? 1 : 0)} KB` : `${(n / 1048576).toFixed(1)} MB`; }
const plural = (n, one, many) => `${n.toLocaleString('en-US')} ${n === 1 ? one : many}`;

/* ------------------------------------------------------------------ stages */
function stage(name) {
  for (const s of ['idle', 'busy', 'error']) $('stage-' + s).hidden = s !== name;
  $('panel').dataset.state = name;
}
const ERRORS = {
  empty: ['The file is empty', 'It has no bytes in it. If the download stopped early, download the export again.'],
  pdf: ['This is a PDF, not a course export', 'A Canvas course export is a ZIP file whose name ends in .imscc. If you saved pages as PDFs, they open in any PDF reader.'],
  html: ['This is a web page, not a course export', 'Browsers sometimes save a sign-in page under the export\'s name when the download link has expired. Download the export again while you are signed in to Canvas.'],
  'office-old': ['This is an Office file, not a course export', 'A Canvas course export is a ZIP file whose name ends in .imscc.'],
  rar: ['This is a RAR archive', 'Open it with an unpacking app first; if an .imscc file is inside, choose that one here.'],
  '7z': ['This is a 7-Zip archive', 'Open it with an unpacking app first; if an .imscc file is inside, choose that one here.'],
  'not-zip': ['This file is not a course export', 'A Canvas course export is a ZIP file whose name ends in .imscc. This file is not a ZIP, or it is damaged. If the download was interrupted, download the export again.'],
  encrypted: ['The ZIP is password protected', 'Canvas never adds a password to its exports, so this file was changed after the download. Use the original .imscc file.'],
  'no-manifest': ['This ZIP is not a course export', 'Every course export starts with a contents list called imsmanifest.xml, and this ZIP has none. If you unzipped the export and zipped the folder again, choose the original .imscc file, or zip the files inside the folder rather than the folder.'],
  nested: ['This ZIP holds course exports', 'It contains .imscc files. Unzip it first, then open the .imscc files here one at a time.'],
  'bad-manifest': ['The contents list could not be read', 'The file imsmanifest.xml inside the export is damaged. Export the course again if you still can.'],
  'manifest-only': ['This is only the contents list', 'imsmanifest.xml lists what a course export holds but not the course itself. Choose the whole .imscc file instead.'],
};
function showError(e) {
  const [t, d] = ERRORS[e && e.code] || ['The file could not be opened', `It stopped at: ${e && e.message ? e.message : e}. If it is a Canvas course export, try downloading it again.`];
  $('error-title').textContent = t;
  $('error-text').textContent = d;
  stage('error');
  $('error-title').focus();
}

async function openBytes(bytes, name) {
  stage('busy');
  $('busy-sub').textContent = `Reading ${name || 'your file'} in your browser.`;
  $('busy-title').focus();
  await new Promise(r => setTimeout(r, 30));
  let c;
  try { c = openCourse(bytes, { fileName: name }); } catch (e) { showError(e); return; }
  for (const u of blobs.values()) URL.revokeObjectURL(u);
  blobs = new Map();
  course = c; current = null; showAnswers = false;
  buildIndex();
  renderReader();
  stage('idle');
  $('reader').hidden = false;
  const first = c.items.get('syllabus') ? 'syllabus' : firstItem();
  if (first) showItem(first, { focus: false });
  $('reader').scrollIntoView({ behavior: matchMedia('(prefers-reduced-motion: reduce)').matches ? 'auto' : 'smooth', block: 'start' });
  $('course-title').focus({ preventScroll: true });
}
async function openFile(f) {
  if (!f) return;
  const buf = new Uint8Array(await f.arrayBuffer());
  openBytes(buf, f.name);
}
function firstItem() {
  for (const m of course.modules) for (const it of m.items) if (!it.header && course.items.has(it.ref)) return it.ref;
  for (const g of course.groups) if (g.items.length) return g.items[0].id;
  return course.files[0] ? 'file:' + course.files[0].path : null;
}

/* ------------------------------------------------------------------ search index */
function buildIndex() {
  index = new Map();
  for (const it of new Set(course.items.values())) {
    let t = it.title + ' ' + (it.html ? htmlToText(it.html) : '');
    if (it.quiz) for (const q of questionsOf(it.quiz)) t += ' ' + htmlToText(q.html) + ' ' + q.choices.map(c => htmlToText(c.html)).join(' ');
    if (it.kind === 'file') t += ' ' + (it.folder || '');
    if (it.url) t += ' ' + it.url;
    index.set(it.id, t.toLowerCase());
  }
}

/* ------------------------------------------------------------------ the shelf */
function itemButton(id, title, kind, extra = '', indent = 0) {
  const off = extra ? `<span class="cb-off">${esc(extra)}</span>` : '';
  return `<li${indent ? ` style="padding-left:${Math.min(indent, 4) * 14}px"` : ''}><button type="button" class="cb-it" data-id="${esc(id)}">${icon(kind)}<span>${esc(title)}${off}</span></button></li>`;
}
function renderReader() {
  $('course-title').textContent = course.title || 'Course';
  const what = course.kind === 'canvas-course' ? 'Canvas course export' : course.kind === 'qti' ? 'Quiz file' : 'Common Cartridge';
  const parts = summaryOf(course);
  $('course-meta').textContent = `${what}${course.code ? ` (${course.code})` : ''}: ${parts.join(', ') || 'nothing that Cubby can show'}.`;
  const rows = [];
  if (course.syllabus) rows.push(`<div class="cb-row" style="--tape:var(--t3)"><ul class="cb-row-items" style="padding-top:6px">${itemButton('syllabus', 'Syllabus', 'syllabus')}</ul></div>`);
  if (course.modules.length) {
    rows.push(`<h3>Modules</h3>`);
    course.modules.forEach((m, k) => {
      const lis = m.items.map(it => {
        if (it.header) return `<li class="cb-sub">${esc(it.title)}</li>`;
        const item = course.items.get(it.ref);
        if (!item) return `<li><span class="cb-it" aria-disabled="true">${icon('page')}<span>${esc(it.title)}<span class="cb-off">not in this export</span></span></span></li>`;
        return itemButton(item.id, it.title || item.title, item.kind, item.published === false || it.published === false ? 'unpublished' : '', it.indent);
      }).join('');
      const n = m.items.filter(i => !i.header).length;
      rows.push(`<div class="cb-row" style="--tape:${TAPES[k % TAPES.length]}" data-open="true"><button type="button" class="cb-row-label" aria-expanded="true">${esc(m.title)}${m.published ? '' : ' (unpublished)'}<span class="cb-count">${n}</span></button><ul class="cb-row-items">${lis}</ul></div>`);
    });
  }
  const groups = course.groups.filter(g => g.items.length);
  if (groups.length || course.files.length) rows.push(`<h3>${course.modules.length ? 'Everything in the course' : 'In this file'}</h3>`);
  const closed = !!course.modules.length;
  for (const g of groups) {
    rows.push(`<div class="cb-row" style="--tape:var(--line-2)" data-open="${!closed}"><button type="button" class="cb-row-label" aria-expanded="${!closed}">${esc(g.title)}<span class="cb-count">${g.items.length}</span></button><ul class="cb-row-items">${g.items.map(i => itemButton(i.id, i.title, i.kind, g.notInModules && course.modules.length && !inAnyModule(i.id) ? 'in no module' : '')).join('')}</ul></div>`);
  }
  if (course.files.length) {
    let lis = '', folder = null;
    for (const f of course.files) {
      if (f.folder !== folder) { folder = f.folder; if (folder) lis += `<li class="cb-sub">${esc(folder)}</li>`; }
      lis += itemButton('file:' + f.path, f.title, 'file', '', folder ? 1 : 0);
    }
    rows.push(`<div class="cb-row" style="--tape:var(--line-2)" data-open="${!closed}"><button type="button" class="cb-row-label" aria-expanded="${!closed}">Files<span class="cb-count">${course.files.length}</span></button><ul class="cb-row-items">${lis}</ul></div>`);
  }
  $('shelf').innerHTML = rows.join('');
  $('search').value = '';
  $('search-note').hidden = true;
  const hasQuiz = course.stats.quizzes + course.stats.banks > 0;
  document.querySelector('[data-pro="quizzes"]').hidden = !hasQuiz;
  document.querySelector('[data-pro="files"]').hidden = !course.files.length;
  document.querySelector('[data-pro="book"]').hidden = course.kind === 'qti';
}
let moduleIds = null;
function inAnyModule(id) {
  if (!moduleIds) moduleIds = new Set();
  if (!moduleIds.size) for (const m of course.modules) for (const it of m.items) if (it.ref) moduleIds.add(it.ref);
  return moduleIds.has(id);
}

/* ------------------------------------------------------------------ the item */
function showItem(id, { focus = true } = {}) {
  const it = course && course.items.get(id);
  if (!it) return;
  current = it;
  for (const b of document.querySelectorAll('.cb-it[aria-current]')) b.removeAttribute('aria-current');
  for (const b of document.querySelectorAll(`.cb-it[data-id="${CSS.escape(id)}"]`)) {
    b.setAttribute('aria-current', 'true');
    const row = b.closest('.cb-row');
    if (row && row.dataset.open === 'false') { row.dataset.open = 'true'; row.querySelector('.cb-row-label').setAttribute('aria-expanded', 'true'); }
  }
  const art = $('article');
  const kind = it.syllabus ? 'Syllabus' : KIND_LABEL[it.kind] || '';
  const d = detailsOf(it);
  let tools = '<button type="button" class="cb-btn cb-btn-sm" data-act="print">Print this</button><button type="button" class="cb-btn cb-btn-sm" data-act="copy">Copy the text</button>';
  let body = '';
  const opt = { images: imageSrc };
  if (it.kind === 'quiz' || it.kind === 'bank') {
    tools = `<button type="button" class="cb-btn cb-btn-sm" data-act="answers" aria-pressed="${showAnswers}">Show answers</button>` + tools;
    body = (it.html ? `<div class="cb-body">${itemBodyHtml(course, it, opt)}</div>` : '') + `<div class="cb-body cb-quiz">${quizHtml(course, it, { answers: showAnswers, images: imageSrc, files: p => `#file=${encodeURIComponent(p)}`, links: x => `#item=${encodeURIComponent(x)}` })}</div>`;
    if (!questionsOf(it.quiz).length) body += '<p class="cb-empty">This quiz has no questions in the export. Questions drawn from a question bank only appear if the bank was exported with the course.</p>';
  } else if (it.kind === 'file') {
    tools = '<button type="button" class="cb-btn cb-btn-sm cb-btn-teal" data-act="download">Download this file</button>';
    body = filePreview(it);
  } else if (it.kind === 'link' || it.kind === 'tool') {
    tools = '<button type="button" class="cb-btn cb-btn-sm" data-act="copy">Copy the address</button>';
    body = it.url && /^https?:\/\//i.test(it.url) ? `<p class="cb-body"><a href="${esc(it.url)}" target="_blank" rel="noopener noreferrer">${esc(it.url)}</a></p>` : `<p class="cb-body cb-empty">${it.url ? esc(it.url) : 'The export has no address for this link.'}</p>`;
    if (it.kind === 'tool') body += '<p class="cb-note">This was an external tool (LTI) inside Canvas. Its content lives on the tool maker\'s site, not in the export.</p>';
  } else {
    body = `<div class="cb-body">${it.html ? itemBodyHtml(course, it, opt) : '<p class="cb-empty">This item has no text in the export.</p>'}</div>`;
    if (it.rubric) body += `<div class="cb-body cb-rubric">${rubricHtml(it.rubric)}</div>`;
    if (it.attachments && it.attachments.length) body += `<p class="cb-note">Attached in Canvas: ${it.attachments.map(a => esc(decodeURIComponent(a.replace(/^.*\//, '')))).join(', ')}</p>`;
    if (it.kind === 'discussion' || it.kind === 'announcement') body += '<p class="cb-note">A course export holds the prompt only. Student replies are never part of it.</p>';
  }
  art.innerHTML = `<span class="cb-kind">${esc(kind)}</span><h3 class="cb-item-title">${esc(it.title)}</h3>${d.length ? `<p class="cb-details">${esc(d.join(', '))}</p>` : ''}<div class="cb-item-tools">${tools}</div>${body}`;
  const q = $('search').value.trim();
  if (q) highlight(art.querySelector('.cb-body, .cb-quiz') ? art : art, q);
  history.replaceState(null, '', `#item=${encodeURIComponent(id)}`);
  if (focus) {
    art.focus({ preventScroll: true });
    if (matchMedia('(max-width: 980px)').matches) art.scrollIntoView({ block: 'start' });
  }
}
function filePreview(f) {
  const info = `<p class="cb-details">${esc([f.folder, fmtSize(f.size || 0), mimeOf(f.path).replace('application/', '')].filter(Boolean).join(', '))}</p>`;
  if (isImage(f.path)) { const u = blobFor(f.path); return info + (u ? `<div class="cb-file-preview"><img src="${esc(u)}" alt="${esc(f.title)}"></div>` : ''); }
  if (/\.(txt|csv|md|html?)$/i.test(f.path) && (f.size || 0) < 400000) {
    const b = fileBytes(course, f.path);
    if (b) return info + `<div class="cb-file-preview"><pre>${esc(new TextDecoder().decode(b))}</pre></div>`;
  }
  return info + '<p class="cb-note">Cubby shows pictures and text files here. Download this file to open it in the app that made it.</p>';
}
function highlight(root, q) {
  const re = new RegExp(q.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'gi');
  const walker = document.createTreeWalker(root.querySelector('.cb-body') ? root : root, NodeFilter.SHOW_TEXT);
  const nodes = [];
  while (walker.nextNode()) if (re.test(walker.currentNode.nodeValue) && !walker.currentNode.parentElement.closest('button, .cb-kind')) nodes.push(walker.currentNode);
  for (const n of nodes.slice(0, 200)) {
    const span = document.createElement('span');
    span.innerHTML = esc(n.nodeValue).replace(new RegExp(esc(q).replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'gi'), m => `<mark>${m}</mark>`);
    n.replaceWith(...span.childNodes);
  }
}

/* ------------------------------------------------------------------ search */
let searchTimer = 0;
function search() {
  const q = $('search').value.trim().toLowerCase();
  const note = $('search-note');
  const buttons = [...document.querySelectorAll('#shelf .cb-it[data-id]')];
  if (!q) {
    buttons.forEach(b => { b.parentElement.hidden = false; b.classList.remove('is-hit'); });
    document.querySelectorAll('#shelf .cb-sub, #shelf .cb-row, #shelf h3').forEach(e => { e.hidden = false; });
    note.hidden = true;
    return;
  }
  const hits = new Set();
  for (const [id, t] of index) if (t.includes(q)) hits.add(id);
  buttons.forEach(b => { const on = hits.has(b.dataset.id); b.parentElement.hidden = !on; b.classList.toggle('is-hit', on); });
  document.querySelectorAll('#shelf .cb-sub').forEach(e => { e.hidden = true; });
  document.querySelectorAll('#shelf .cb-row').forEach(r => { const any = r.querySelector('.cb-it.is-hit'); r.hidden = !any; if (any) { r.dataset.open = 'true'; r.querySelector('.cb-row-label') && r.querySelector('.cb-row-label').setAttribute('aria-expanded', 'true'); } });
  document.querySelectorAll('#shelf h3').forEach(h => { h.hidden = true; });
  note.hidden = false;
  note.textContent = hits.size ? `${plural(hits.size, 'item matches', 'items match')} "${$('search').value.trim()}". Matches are marked in the text.` : `Nothing in the course matches "${$('search').value.trim()}".`;
  if (current && hits.has(current.id)) showItem(current.id, { focus: false });
}

/* ------------------------------------------------------------------ actions */
async function bookImages() {
  const map = new Map();
  let total = 0;
  for (const f of course.files) {
    if (!isImage(f.path) || (f.size || 0) > 4 * 1048576 || total > 60 * 1048576) continue;
    const b = fileBytes(course, f.path);
    if (!b) continue;
    let s = '';
    for (let i = 0; i < b.length; i += 0x8000) s += String.fromCharCode.apply(null, b.subarray(i, i + 0x8000));
    map.set(f.path, `data:${mimeOf(f.path)};base64,${btoa(s)}`);
    total += b.length;
  }
  return map;
}
async function proAction(kind) {
  const reasons = {
    book: 'Saving the whole course as one file is part of Pro.',
    quizzes: 'Saving every quiz as Word files with answer keys, a spreadsheet and Moodle XML is part of Pro.',
    files: 'Saving all the course files in one ZIP is part of Pro.',
  };
  if (!course || !needPro(reasons[kind])) return;
  const stem = safeName(course.title || 'course', 60);
  if (kind === 'book') { const imgs = await bookImages(); download(`${stem}.html`, courseBook(course, { images: p => imgs.get(p) || null }), 'text/html'); }
  if (kind === 'quizzes') download(`${stem} quizzes.zip`, quizzesZip(course), 'application/zip');
  if (kind === 'files') download(`${stem} files.zip`, filesZip(course), 'application/zip');
  toast('Saved to your downloads.');
}
async function itemAction(act) {
  if (!current) return;
  if (act === 'print') window.print();
  if (act === 'copy') {
    const t = current.kind === 'link' || current.kind === 'tool' ? current.url || '' : itemText(course, current);
    try { await navigator.clipboard.writeText(t); toast('Copied.'); } catch { toast('Your browser did not allow copying. Select the text and copy it instead.'); }
  }
  if (act === 'answers') { showAnswers = !showAnswers; showItem(current.id, { focus: false }); const b = document.querySelector('[data-act="answers"]'); if (b) b.focus(); }
  if (act === 'download' && current.kind === 'file') { const b = fileBytes(course, current.path); if (b) download(current.title, b, mimeOf(current.path)); }
}

/* ------------------------------------------------------------------ wiring */
function init() {
  setupPro();
  proNote();
  const input = $('file-input');
  $('btn-choose').addEventListener('click', () => input.click());
  $('btn-retry').addEventListener('click', () => { stage('idle'); input.click(); });
  input.addEventListener('change', () => { const f = input.files && input.files[0]; input.value = ''; openFile(f); });
  const sample = () => openBytes(sampleBytes(), SAMPLE_NAME);
  $('btn-sample').addEventListener('click', sample);
  $('btn-error-sample').addEventListener('click', sample);
  $('btn-another').addEventListener('click', () => { stage('idle'); $('panel').scrollIntoView({ block: 'center' }); $('drop-title').focus({ preventScroll: true }); });
  const drop = $('drop'), box = $('panel');
  for (const ev of ['dragenter', 'dragover']) box.addEventListener(ev, e => { e.preventDefault(); drop.classList.add('is-over'); });
  for (const ev of ['dragleave', 'dragend']) box.addEventListener(ev, e => { if (!box.contains(e.relatedTarget)) drop.classList.remove('is-over'); });
  box.addEventListener('drop', e => { e.preventDefault(); drop.classList.remove('is-over'); const f = e.dataTransfer && e.dataTransfer.files && e.dataTransfer.files[0]; if (f) openFile(f); });
  $('shelf').addEventListener('click', e => {
    const b = e.target.closest('.cb-it[data-id]');
    if (b) { showItem(b.dataset.id); return; }
    const l = e.target.closest('.cb-row-label');
    if (l) { const row = l.closest('.cb-row'); const open = row.dataset.open !== 'true'; row.dataset.open = String(open); l.setAttribute('aria-expanded', String(open)); }
  });
  $('article').addEventListener('click', e => {
    const a = e.target.closest('a[data-item], a[data-file], button[data-act]');
    if (!a) return;
    if (a.dataset.act) { itemAction(a.dataset.act); return; }
    e.preventDefault();
    if (a.dataset.item) showItem(a.dataset.item);
    else if (a.dataset.file) showItem('file:' + a.dataset.file);
  });
  document.querySelectorAll('[data-pro]').forEach(b => b.addEventListener('click', () => proAction(b.dataset.pro)));
  $('search').addEventListener('input', () => { clearTimeout(searchTimer); searchTimer = setTimeout(search, 160); });
  window.addEventListener('hashchange', () => { const m = /^#item=(.+)$/.exec(location.hash); if (m && course) showItem(decodeURIComponent(m[1])); });
}
if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init); else init();
