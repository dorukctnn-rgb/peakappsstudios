// Unframe page: open a Microsoft Publisher .pub file, show its text and pictures page by page, and save them as a Word file,
// text, Markdown, a web page or a ZIP of pictures. The file is read in a Web Worker (worker.js) on this device; nothing is
// uploaded, and this script makes no requests (the only scripts it loads are the two picture drawing libraries of this site,
// and only when a file holds clip art).
import { escHtml, plural, formatBytes, positionLabel } from './util.js';
import { PRO_READY } from './pro.js';

const $ = id => document.getElementById(id);
const S = { summary: null, sample: false, name: '', page: 1, files: [], fromList: false, pics: new Map(), thumbUrl: '', urls: [] };

/* ---------------- the worker ---------------- */
let worker = null;
let seq = 0;
const waiting = new Map();
function getWorker() {
  if (worker) return worker;
  try { worker = new Worker(new URL('./worker.js', import.meta.url), { type: 'module' }); } catch { worker = null; return null; }
  worker.onmessage = ev => { const w = waiting.get(ev.data.id); if (w) { waiting.delete(ev.data.id); w(ev.data); } };
  worker.onerror = e => { for (const [, w] of waiting) w({ type: 'error', code: 'worker', detail: String(e.message || '') }); waiting.clear(); worker = null; };
  return worker;
}
function ask(msg, transfer) {
  const w = getWorker();
  if (!w) return Promise.resolve({ type: 'error', code: 'worker' });
  const id = ++seq;
  return new Promise(resolve => { waiting.set(id, resolve); w.postMessage({ ...msg, id }, transfer || []); });
}

/* ---------------- stages in the sheet ---------------- */
function stage(name) {
  for (const s of ['idle', 'busy', 'error', 'list', 'done']) $(`stage-${s}`).hidden = s !== name;
  $('panel').dataset.state = name;
}
function busy(title, sub) {
  $('busy-title').textContent = title;
  $('busy-sub').textContent = sub;
  stage('busy');
}
const ERRORS = {
  empty: ['This file is empty', 'There is nothing in it. Copy the file again from where you got it, and choose the new copy.'],
  'too-big': ['This file is too large', 'Unframe opens files up to 1.5 GB. A Publisher file is usually far smaller, so this is probably another kind of file.'],
  'is-pdf': ['This is a PDF, not a Publisher file', 'A PDF opens in your browser and in any PDF viewer. To open a Publisher file, choose the one that ends in .pub.'],
  'is-zip': ['This is a ZIP file, not a .pub file', 'Unzip it on your computer first, then choose the .pub file inside it, or choose the whole folder.'],
  'is-rtf': ['This is a Rich Text file, not a Publisher file', 'Word and WordPad open it. To open a Publisher file, choose the one that ends in .pub.'],
  'is-key': ['This .pub file is an SSH key, not a Publisher document', 'Files that end in .pub are also used for the public keys that SSH and Git log in with. This one starts like a key, so there is nothing to convert: paste its text where the service asks for a public key.'],
  'is-word': ['This is a Word file, not a Publisher file', 'Open it in Word. To open a Publisher file, choose the one that ends in .pub.'],
  'is-excel': ['This is an Excel file, not a Publisher file', 'Open it in Excel. To open a Publisher file, choose the one that ends in .pub.'],
  'is-powerpoint': ['This is a PowerPoint file, not a Publisher file', 'Open it in PowerPoint. To open a Publisher file, choose the one that ends in .pub.'],
  'old-version': ['This is a Publisher 98 or 2000 file', 'Unframe reads files saved by Publisher 2002 and later. Publisher 98 and 2000 saved an older kind of file that it does not read. LibreOffice Draw may open it.'],
  encrypted: ['This file needs a password', 'Unframe cannot open a password-protected file. Open it in Publisher with the password and save a copy without one, or ask the person who made it.'],
  'not-publisher': ['This does not look like a Publisher file', 'Unframe opens .pub files made by Microsoft Publisher. This one may be damaged, or it may be a different kind of file with a .pub name.'],
  truncated: ['The file ends too early', 'Part of it is missing, usually because the copy or download stopped early. Copy it again and choose the new copy.'],
  corrupt: ['This file could not be read', 'It may be damaged, or it may use a part of the Publisher format that Unframe does not read. If Publisher opens it, use File, Save As there to make a copy, and try the copy.'],
  'no-text': ['No text could be found in this file', 'The file is a Publisher file, but its text part is missing or empty, so there is nothing to show. If Publisher opens it, save a copy there and try the copy.'],
  'no-pub': ['There are no .pub files in that selection', 'Choose a folder that holds Publisher files, or choose a single .pub file.'],
  worker: ['This browser could not open the file', 'Try again in a current version of Chrome, Edge, Firefox or Safari.'],
};
function showError(code) {
  const [title, text] = ERRORS[code] || ERRORS.corrupt;
  $('error-title').textContent = title;
  $('error-text').textContent = text;
  stage('error');
  $('error-title').focus();
}
const SHORT = {
  empty: 'Empty file', 'too-big': 'Too large', 'is-pdf': 'A PDF', 'is-zip': 'A ZIP file', 'is-rtf': 'A Rich Text file', 'is-key': 'An SSH key', 'is-word': 'A Word file', 'is-excel': 'An Excel file', 'is-powerpoint': 'A PowerPoint file',
  'old-version': 'Publisher 98 or 2000: not read', encrypted: 'Password protected: not read', 'not-publisher': 'Not a Publisher file', truncated: 'Cut short', corrupt: 'Could not be read', 'no-text': 'No text part',
};

/* ---------------- opening ---------------- */
function resetPictures() {
  for (const u of S.urls) URL.revokeObjectURL(u);
  S.urls = [];
  S.pics = new Map();
  S.thumbUrl = '';
}
const MAX_FILE = 1500 * 1024 * 1024;
async function openOne(file, fromList) {
  if (file.size > MAX_FILE) { showError('too-big'); return; }
  busy('Opening your file', 'Reading it on this computer.');
  let bytes;
  try { bytes = await file.arrayBuffer(); } catch { showError('corrupt'); return; }
  S.fromList = !!fromList;
  handle(await ask({ type: 'open', bytes, name: file.name }, [bytes]), false);
}
async function openSample() {
  busy('Opening the sample file', 'A small real Publisher file, read on this computer.');
  S.fromList = false;
  handle(await ask({ type: 'sample' }), true);
}
function handle(msg, sample) {
  if (msg.type !== 'opened') { showError(msg.code); return; }
  S.sample = sample;
  show(msg);
}
function pickFiles(list) {
  const all = [...list];
  if (!all.length) return;
  const pubs = all.filter(f => /\.pub$/i.test(f.name));
  if (all.length === 1) { openOne(all[0], false); return; }
  if (!pubs.length) { showError('no-pub'); return; }
  if (pubs.length === 1) { openOne(pubs[0], false); return; }
  showList(pubs);
}

/* ---------------- a list of files: which can be read ---------------- */
function rowHtml(f, i) {
  let res = '<span class="unf-small">Waiting</span>';
  let open = '';
  if (f.status === 'checking') res = '<span class="unf-small">Checking</span>';
  else if (f.status === 'ok') {
    res = `<span class="unf-st-ok">Readable</span><br><span class="unf-small">${plural(f.pages, 'page', 'pages')}, ${plural(f.words, 'word', 'words')}, ${plural(f.pictures, 'picture', 'pictures')}${f.savedBy ? `, ${escHtml(f.savedBy)}` : ''}</span>`;
    open = `<button type="button" class="btn unf-quiet" data-open="${i}" style="min-height:40px;padding:8px 12px;font-size:15px">Open</button>`;
  } else if (f.status === 'bad') res = `<span class="unf-st-bad">${escHtml(SHORT[f.code] || 'Could not be read')}</span>`;
  return `<tr><td>${escHtml(f.path)}<br><span class="unf-small">${formatBytes(f.file.size)}</span></td><td>${res}${open ? `<br>${open}` : ''}</td></tr>`;
}
function paintList() { $('file-rows').innerHTML = S.files.map(rowHtml).join(''); }
async function showList(files) {
  S.files = files.map(f => ({ file: f, path: f.webkitRelativePath || f.name, status: 'queued' })).sort((x, y) => x.path.localeCompare(y.path, 'en', { numeric: true, sensitivity: 'base' }));
  $('list-sub').textContent = `${plural(files.length, 'Publisher file', 'Publisher files')} found. Unframe checks each one here, on this computer.`;
  paintList();
  stage('list');
  $('list-title').focus();
  const token = {};
  S.listToken = token;
  let ok = 0, bad = 0;
  for (let i = 0; i < S.files.length; i++) {
    if (S.listToken !== token) return;
    const f = S.files[i];
    f.status = 'checking';
    paintList();
    let r;
    if (f.file.size > MAX_FILE) { f.status = 'bad'; f.code = 'too-big'; bad++; paintList(); continue; }
    try { const bytes = await f.file.arrayBuffer(); r = await ask({ type: 'check', bytes, name: f.file.name }, [bytes]); } catch { r = { type: 'checked', ok: false, code: 'corrupt' }; }
    if (S.listToken !== token) return;
    if (r.ok) { f.status = 'ok'; f.pages = r.pages; f.words = r.words; f.pictures = r.pictures; f.savedBy = r.savedBy; ok++; }
    else { f.status = 'bad'; f.code = r.code || 'corrupt'; bad++; }
    paintList();
    $('list-sub').textContent = `${plural(files.length, 'Publisher file', 'Publisher files')} found: ${ok} readable, ${bad} not readable${ok + bad < files.length ? `, ${files.length - ok - bad} still to check` : ''}.`;
  }
}
function listCsv() {
  const q = v => `"${String(v ?? '').replace(/"/g, '""')}"`;
  const rows = [['file', 'size_bytes', 'result', 'pages', 'words', 'pictures', 'saved_by']];
  for (const f of S.files) rows.push([f.path, f.file.size, f.status === 'ok' ? 'readable' : f.status === 'bad' ? (SHORT[f.code] || 'could not be read') : f.status, f.pages ?? '', f.words ?? '', f.pictures ?? '', f.savedBy ?? '']);
  // a leading apostrophe keeps a spreadsheet from running a cell that starts with = + - @
  const safe = v => (/^[=+\-@]/.test(String(v)) ? `'${v}` : v);
  return String.fromCharCode(0xfeff) + rows.map(r => r.map(v => q(safe(v))).join(',')).join('\r\n') + '\r\n';
}

/* ---------------- the result ---------------- */
function framesText(frames) {
  return frames.filter(f => f.grid || (f.paragraphs && f.paragraphs.some(p => p.trim()))).map(f => f.grid ? gridText(f.grid) : squeezeParas(f.paragraphs).join('\n')).join('\n\n');
}
function gridText(g) {
  const out = [];
  for (let r = 0; r < g.rows; r++) out.push(g.cells.slice(r * g.cols, (r + 1) * g.cols).map(c => c.replace(/\s*\n\s*/g, ' ')).join('\t'));
  return out.join('\n');
}
function squeezeParas(paras) {
  const out = [];
  for (const p of paras) { if (p.trim() === '') { if (out.length && out[out.length - 1] !== '') out.push(''); } else out.push(p); }
  while (out.length && out[out.length - 1] === '') out.pop();
  return out;
}
function picturePages() {
  const m = new Map();
  for (const p of S.summary.pages) for (const f of p.frames) if (f.image !== null && f.image !== undefined) { if (!m.has(f.image)) m.set(f.image, []); if (!m.get(f.image).includes(p.n)) m.get(f.image).push(p.n); }
  return m;
}
function show(msg) {
  resetPictures();
  const s = msg.summary;
  S.summary = s;
  S.name = msg.name || 'file.pub';
  S.page = 1;
  for (const pv of msg.previews || []) S.pics.set(pv.index, { vector: !!pv.vector, kind: pv.kind });
  // the shown pictures become blob addresses; vector pictures are drawn next
  for (const pv of msg.previews || []) {
    if (!pv.vector) { const url = URL.createObjectURL(new Blob([pv.bytes], { type: pv.mime })); S.urls.push(url); S.pics.get(pv.index).url = url; }
  }
  if (msg.thumb) { const url = URL.createObjectURL(new Blob([msg.thumb.bytes], { type: msg.thumb.mime })); S.urls.push(url); S.thumbUrl = url; }
  const st = s.stats;
  $('done-title').textContent = st.pages ? `Found ${plural(st.pages, 'page', 'pages')} and ${plural(st.words, 'word', 'words')}` : 'Opened, but no pages with content';
  $('done-sub').textContent = `${st.images ? `${plural(st.images, 'picture', 'pictures')} stored in the file. ` : 'No pictures are stored in the file. '}${S.sample ? 'This is the sample file.' : ''}`.trim();
  $('btn-back-list').hidden = !S.fromList;
  stage('done');
  $('done-title').focus();
  $('result').hidden = false;
  $('sample-tag').hidden = !S.sample;
  renderInfo();
  renderMap();
  renderReading();
  $('save-status').textContent = '';
  showPage(1);
  drawVectors(msg.previews || []);
}
function renderInfo() {
  const s = S.summary, st = s.stats;
  const item = (n, label) => `<li><b>${Number(n).toLocaleString('en-US')}</b><span>${label}</span></li>`;
  $('facts-grid').innerHTML = item(st.pages, st.pages === 1 ? 'page with content' : 'pages with content') + item(st.words, st.words === 1 ? 'word' : 'words') + item(st.images, st.images === 1 ? 'picture' : 'pictures') + item(s.links.length, s.links.length === 1 ? 'link' : 'links');
  const bits = [];
  if (s.meta.title) bits.push(`Title: ${s.meta.title}`);
  if (s.meta.author) bits.push(`Author: ${s.meta.author}`);
  if (s.meta.savedBy) bits.push(`Saved by ${s.meta.savedBy}`);
  if (s.meta.modified) bits.push(`Last saved ${new Date(s.meta.modified).toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' })}`);
  bits.push(`File: ${S.name}`);
  $('meta-line').textContent = bits.join('. ') + '.';
  const notes = [];
  if (s.warnings.includes('truncated-text')) notes.push('Some of the text is cut short: the file may be damaged.');
  if (!st.pages) notes.push('The file opened, but no page holds text or pictures. Text that is not on a page is listed below if there is any.');
  $('result-note').textContent = notes.join(' ');
  $('result-note').hidden = !notes.length;
  const info = $('info');
  const old = info.querySelector('.unf-thumb-box');
  if (old) old.remove();
  info.classList.toggle('no-thumb', !S.thumbUrl);
  if (S.thumbUrl) {
    const fig = document.createElement('figure');
    fig.className = 'unf-thumb-box';
    fig.style.margin = '0';
    fig.innerHTML = `<img src="${S.thumbUrl}" alt="The small preview of page 1 that Publisher saved in the file" width="104">` + '<figcaption>Preview of page 1 that Publisher saved in the file</figcaption>';
    info.prepend(fig);
  }
}

/* the page map: each page as a small sheet with its frames where they were */
function renderMap() {
  const s = S.summary;
  const pw = s.pageSize.w || 612, ph = s.pageSize.h || 792;
  const wide = pw >= ph;
  const tw = wide ? 176 : 128, th = Math.round(tw * ph / pw);
  const pct = (v, t) => `${Math.max(0, Math.min(100, v / t * 100)).toFixed(2)}%`;
  const html = s.pages.map(p => {
    const frames = p.frames.filter(f => f.box).map(f => {
      const b = f.box;
      const cls = f.kind === 'table' ? 'unf-fr-table' : f.kind === 'picture' ? 'unf-fr-picture' : f.kind === 'shape' ? 'unf-fr-shape' : 'unf-fr-text';
      return `<i class="unf-fr ${cls}" style="left:${pct(b.x, pw)};top:${pct(b.y, ph)};width:${pct(b.w, pw)};height:${pct(b.h, ph)}"></i>`;
    }).join('');
    const nText = p.frames.filter(f => f.paragraphs && f.paragraphs.some(x => x.trim())).length, nPic = p.frames.filter(f => f.image !== null && f.image !== undefined).length;
    return `<button type="button" class="unf-pg" data-page="${p.n}" aria-pressed="${p.n === S.page}" aria-label="Page ${p.n}: ${plural(nText, 'text box', 'text boxes')}, ${plural(nPic, 'picture', 'pictures')}"><span class="unf-pg-sheet" style="width:${tw}px;height:${th}px">${frames}</span><span class="unf-pg-label">Page ${p.n}</span></button>`;
  }).join('');
  $('map').innerHTML = html || '<p class="unf-small">No page holds any text or pictures.</p>';
  $('map-title').parentElement.hidden = !s.pages.length;
}

/* the reading view: every page is in the page, one shown at a time (all of them print) */
const KIND_LABEL = { text: 'Text', table: 'Table', picture: 'Picture' };
function frameHtml(f, pageSize) {
  const pos = positionLabel(f.box, pageSize);
  const parts = [];
  if (f.grid) {
    const t = ['<table class="unf-table">'];
    for (let r = 0; r < f.grid.rows; r++) t.push('<tr>' + f.grid.cells.slice(r * f.grid.cols, (r + 1) * f.grid.cols).map(c => `<td dir="auto">${escHtml(c)}</td>`).join('') + '</tr>');
    t.push('</table>');
    parts.push(`<div class="unf-frame"><div class="unf-frame-top"><span class="unf-frame-label">Table, ${f.grid.rows} by ${f.grid.cols}${pos ? `, ${pos.toLowerCase()}` : ''}</span><button type="button" class="unf-copy" data-copy-frame>Copy</button></div>${t.join('')}<span hidden data-text="${escHtml(gridText(f.grid))}"></span></div>`);
  } else if (f.paragraphs && f.paragraphs.some(p => p.trim())) {
    const paras = squeezeParas(f.paragraphs);
    const body = paras.filter(p => p !== '').map(p => `<p dir="auto">${escHtml(p)}</p>`).join('');
    const links = f.links && f.links.length ? `<p class="unf-small">Links stored for this box: ${f.links.map(escHtml).join(', ')}</p>` : '';
    parts.push(`<div class="unf-frame"><div class="unf-frame-top"><span class="unf-frame-label">Text${pos ? `, ${pos.toLowerCase()}` : ''}</span><button type="button" class="unf-copy" data-copy-frame>Copy</button></div>${body}${links}<span hidden data-text="${escHtml(paras.join('\n'))}"></span></div>`);
  }
  if (f.image !== null && f.image !== undefined) {
    parts.push(`<div class="unf-frame"><span class="unf-frame-label">Picture ${f.image + 1}${pos ? `, ${pos.toLowerCase()}` : ''}</span>${picInline(f.image)}</div>`);
  }
  return parts.join('');
}
function picInline(index) {
  const info = S.summary.images.find(i => i.index === index);
  const p = S.pics.get(index);
  if (p && p.url) return `<img class="unf-inline-pic" data-pic="${index}" src="${p.url}" alt="Picture ${index + 1} from the file" style="max-width:100%;max-height:340px;height:auto;display:block;margin-top:4px">`;
  if (p && p.vector && !p.failed) return `<span class="unf-small" data-pic-wait="${index}">Drawing this clip art picture.</span>`;
  const why = info && !info.shown && !info.vector ? `This ${info.ext.toUpperCase()} picture cannot be shown in a browser; it is in the pictures ZIP.` : 'This picture could not be drawn here; the original is in the pictures ZIP.';
  return `<span class="unf-small">${why}</span>`;
}
function renderReading() {
  const s = S.summary;
  const N = s.pages.length;
  const out = s.pages.map(p => {
    const inner = p.frames.map(f => frameHtml(f, s.pageSize)).join('');
    const text = framesText(p.frames);
    return `<section class="unf-readpage" data-readpage="${p.n}" aria-label="Page ${p.n}" hidden><div class="unf-readhead"><h3>Page ${p.n} of ${N}</h3>${text ? '<button type="button" class="btn unf-quiet" data-copy-page>Copy this page\'s text</button>' : ''}</div>${inner || '<p class="unf-empty">No text or pictures on this page.</p>'}</section>`;
  });
  // what is not on a page
  const more = [];
  const masterFrames = s.masters.flatMap(m => m.frames);
  const mHtml = masterFrames.map(f => frameHtml(f, s.pageSize)).join('');
  if (mHtml.trim()) more.push(`<h3>Repeated on every page</h3><p class="unf-small">Text and pictures on the master page, which Publisher repeats on each page: headers, footers, logos.</p>${mHtml}`);
  if (s.otherText.length) more.push(`<h3>Text that is not on a page</h3><p class="unf-small">Text boxes that sit off the page edge, or that nothing on a page uses any more. Publisher keeps them in the file.</p>${s.otherText.map(o => `<div class="unf-frame"><div class="unf-frame-top"><span class="unf-frame-label">Text</span><button type="button" class="unf-copy" data-copy-frame>Copy</button></div>${squeezeParas(o.paragraphs).filter(x => x !== '').map(x => `<p dir="auto">${escHtml(x)}</p>`).join('')}<span hidden data-text="${escHtml(squeezeParas(o.paragraphs).join('\n'))}"></span></div>`).join('')}`);
  if (s.images.length) {
    const pp = picturePages();
    const tiles = s.images.map(im => {
      const pg = pp.get(im.index);
      const dims = im.vector ? `Vector picture, ${Math.round(im.wPt)} by ${Math.round(im.hPt)} points` : im.w ? `${im.w} by ${im.h} pixels` : im.ext.toUpperCase();
      const png = im.vector ? `<button type="button" data-save-pic="${im.index}" data-form="png" data-needs-png hidden>Save as PNG</button>` : '';
      return `<div class="unf-pic" data-tile="${im.index}"><div class="unf-pic-img" data-tile-img="${im.index}">${picTile(im.index, im)}</div><div class="unf-pic-body"><b>${escHtml(im.name)}</b><span>${dims}, ${formatBytes(im.size)}</span><span>${pg ? `On page ${pg.join(', ')}` : im.onPage ? 'On a page' : 'Not placed on a page'}</span><div class="unf-pic-actions"><button type="button" data-save-pic="${im.index}" data-form="original">Save original</button>${png}</div></div></div>`;
    }).join('');
    more.push(`<h3>Pictures stored in the file</h3><p class="unf-small">Every picture in the file, including clip art and pictures that no page uses.</p><div class="unf-pics">${tiles}</div>`);
  }
  if (s.links.length) more.push(`<h3>Links stored in the file</h3><p class="unf-small">Publisher keeps these addresses apart from the words they were on, so Unframe lists them as they are. They are not clickable here.</p><ul class="unf-links">${s.links.map(l => `<li>${escHtml(l)}</li>`).join('')}</ul>`);
  $('reading').innerHTML = out.join('') + (more.length ? `<div class="unf-more">${more.join('')}</div>` : '');
}
function picTile(index, im) {
  const p = S.pics.get(index);
  if (p && p.url) return `<img src="${p.url}" alt="Picture ${index + 1}" loading="lazy">`;
  if (p && p.vector && !p.failed) return '<span class="unf-pic-none">Drawing this picture</span>';
  if (im.shown === false && !im.vector) return `<span class="unf-pic-none">${escHtml(im.ext.toUpperCase())} picture. A browser cannot show it; save it to open it in another program.</span>`;
  return '<span class="unf-pic-none">Not shown here. Save the original.</span>';
}
function showPage(n) {
  S.page = n;
  for (const b of $('map').querySelectorAll('.unf-pg')) b.setAttribute('aria-pressed', String(Number(b.dataset.page) === n));
  for (const sec of $('reading').querySelectorAll('.unf-readpage')) sec.hidden = Number(sec.dataset.readpage) !== n;
}

/* ---------------- clip art: drawn on the page, then kept as a PNG ---------------- */
const loaded = {};
function loadScript(src) {
  if (loaded[src]) return loaded[src];
  loaded[src] = new Promise((resolve, reject) => { const el = document.createElement('script'); el.src = src; el.onload = resolve; el.onerror = reject; document.head.appendChild(el); });
  return loaded[src];
}
async function vectorToPng(pv, wPt, hPt) {
  await loadScript(pv.kind === 'wmf' ? '/open-pub-file/vendor/wmfjs.min.js' : '/open-pub-file/vendor/emfjs.min.js');
  const lib = pv.kind === 'wmf' ? window.WMFJS : window.EMFJS;
  const buf = pv.bytes.buffer.slice(pv.bytes.byteOffset, pv.bytes.byteOffset + pv.bytes.byteLength);
  const R = new lib.Renderer(buf);
  const w = Math.max(48, Math.min(1400, Math.round((wPt || 120) * 2))), h = Math.max(48, Math.min(1400, Math.round((hPt || 120) * 2)));
  const svg = R.render({ width: `${w}px`, height: `${h}px`, xExt: w, yExt: h, mapMode: 8 });
  svg.setAttribute('xmlns', 'http://www.w3.org/2000/svg');
  const xml = new XMLSerializer().serializeToString(svg);
  const url = URL.createObjectURL(new Blob([xml], { type: 'image/svg+xml' }));
  try {
    const img = new Image();
    await new Promise((res, rej) => { img.onload = res; img.onerror = rej; img.src = url; });
    const c = document.createElement('canvas');
    c.width = w; c.height = h;
    c.getContext('2d').drawImage(img, 0, 0, w, h);
    const blob = await new Promise((res, rej) => c.toBlob(b => (b ? res(b) : rej(new Error('no png'))), 'image/png'));
    return new Uint8Array(await blob.arrayBuffer());
  } finally { URL.revokeObjectURL(url); }
}
async function drawVectors(previews) {
  const token = S.summary;
  for (const pv of previews) {
    if (!pv.vector) continue;
    if (S.summary !== token) return;
    const info = S.summary.images.find(i => i.index === pv.index);
    try {
      const png = await vectorToPng(pv, info && info.wPt, info && info.hPt);
      if (S.summary !== token) return;
      const url = URL.createObjectURL(new Blob([png], { type: 'image/png' }));
      S.urls.push(url);
      S.pics.get(pv.index).url = url;
      const copy = png.slice();
      getWorker().postMessage({ type: 'attach', index: pv.index, png: copy }, [copy.buffer]);
      for (const el of document.querySelectorAll(`[data-pic-wait="${pv.index}"]`)) el.outerHTML = picInline(pv.index);
      const tile = document.querySelector(`[data-tile-img="${pv.index}"]`);
      if (tile) tile.innerHTML = picTile(pv.index, info);
      for (const b of document.querySelectorAll(`[data-save-pic="${pv.index}"][data-needs-png]`)) b.hidden = false;
    } catch {
      const p = S.pics.get(pv.index);
      if (p) p.failed = true;
      for (const el of document.querySelectorAll(`[data-pic-wait="${pv.index}"]`)) el.outerHTML = picInline(pv.index);
      const tile = document.querySelector(`[data-tile-img="${pv.index}"]`);
      if (tile) tile.innerHTML = picTile(pv.index, S.summary.images.find(i => i.index === pv.index));
    }
  }
}

/* ---------------- saving ---------------- */
function saveStatus(t) { $('save-status').textContent = t; }
async function save(kind, button) {
  if (button) button.disabled = true;
  saveStatus('Making the file on this computer.');
  const r = await ask({ type: 'export', kind });
  if (button) button.disabled = false;
  if (r.type !== 'file') { saveStatus('The file could not be made. Try again, or save a different format.'); return; }
  window.PeakUI.download(new Blob([r.bytes], { type: r.mime }), r.name);
  saveStatus(`Saved ${r.name}.`);
}
async function savePicture(index, form) {
  const r = await ask({ type: 'picture', index, form });
  if (r.type !== 'file') { saveStatus('That picture could not be saved.'); return; }
  window.PeakUI.download(new Blob([r.bytes], { type: r.mime }), r.name);
  saveStatus(`Saved ${r.name}.`);
}
async function copyText(text, el) {
  try { await navigator.clipboard.writeText(text); }
  catch {
    const ta = document.createElement('textarea');
    ta.value = text; ta.setAttribute('readonly', ''); ta.style.position = 'fixed'; ta.style.opacity = '0';
    document.body.appendChild(ta); ta.select();
    try { document.execCommand('copy'); } catch { /* nothing more to try */ }
    ta.remove();
  }
  if (el) { const was = el.textContent; el.textContent = 'Copied'; setTimeout(() => { el.textContent = was; }, 1500); }
}

/* ---------------- wiring ---------------- */
function reset() {
  S.listToken = null;
  resetPictures();
  S.summary = null;
  $('result').hidden = true;
  for (const el of [$('file-input'), $('folder-input')]) el.value = '';
  stage('idle');
  $('drop-title').focus();
}
function wire() {
  const drop = $('drop');
  $('btn-choose').addEventListener('click', () => $('file-input').click());
  $('btn-folder').addEventListener('click', () => $('folder-input').click());
  $('btn-sample').addEventListener('click', openSample);
  $('btn-error-sample').addEventListener('click', openSample);
  $('file-input').addEventListener('change', e => { const f = [...e.target.files]; e.target.value = ''; if (f.length) pickFiles(f); });
  $('folder-input').addEventListener('change', e => { const f = [...e.target.files]; e.target.value = ''; if (f.length) pickFiles(f); });
  $('btn-retry').addEventListener('click', reset);
  $('btn-reset').addEventListener('click', reset);
  $('btn-list-back').addEventListener('click', reset);
  $('btn-list-csv').addEventListener('click', () => window.PeakUI.download(new Blob([listCsv()], { type: 'text/csv;charset=utf-8' }), 'publisher-files.csv'));
  $('btn-back-list').addEventListener('click', () => { $('result').hidden = true; stage('list'); $('list-title').focus(); });
  $('file-rows').addEventListener('click', e => { const b = e.target.closest('[data-open]'); if (b) openOne(S.files[Number(b.dataset.open)].file, true); });
  ['dragenter', 'dragover'].forEach(ev => document.addEventListener(ev, e => { if (!e.dataTransfer || ![...(e.dataTransfer.types || [])].includes('Files')) return; e.preventDefault(); if ($('panel').dataset.state === 'idle') drop.classList.add('is-over'); }));
  ['dragleave', 'drop'].forEach(ev => document.addEventListener(ev, e => { if (ev === 'dragleave' && e.relatedTarget) return; drop.classList.remove('is-over'); }));
  document.addEventListener('drop', async e => {
    if (!e.dataTransfer || ![...(e.dataTransfer.types || [])].includes('Files')) return;
    e.preventDefault();
    if ($('panel').dataset.state === 'busy') return;
    const files = await filesFromDrop(e.dataTransfer);
    if (files.length) pickFiles(files);
  });
  $('map').addEventListener('click', e => { const b = e.target.closest('.unf-pg'); if (b) showPage(Number(b.dataset.page)); });
  $('reading').addEventListener('click', e => {
    const cp = e.target.closest('[data-copy-page]');
    if (cp) { const sec = cp.closest('.unf-readpage'); const n = Number(sec.dataset.readpage); const page = S.summary.pages.find(p => p.n === n); copyText(framesText(page.frames), cp); return; }
    const cf = e.target.closest('[data-copy-frame]');
    if (cf) { const t = cf.closest('.unf-frame').querySelector('[data-text]'); copyText(t ? t.dataset.text : '', cf); return; }
    const sv = e.target.closest('[data-save-pic]');
    if (sv) savePicture(Number(sv.dataset.savePic), sv.dataset.form);
  });
  for (const [id, kind] of [['save-docx', 'docx'], ['save-txt', 'txt'], ['save-md', 'md'], ['save-html', 'html'], ['save-pictures', 'pictures'], ['save-bundle', 'bundle']]) $(id).addEventListener('click', e => save(kind, e.currentTarget));
  $('btn-print').addEventListener('click', () => window.print());
  void PRO_READY;
}
// a dropped folder: read its entries (Chrome, Edge, Safari and Firefox all give them through webkitGetAsEntry)
async function filesFromDrop(dt) {
  const items = [...(dt.items || [])].filter(i => i.kind === 'file');
  const entries = items.map(i => (i.webkitGetAsEntry ? i.webkitGetAsEntry() : null));
  if (!entries.length || entries.some(en => !en)) return [...dt.files];
  const out = [];
  const walk = async (en, prefix, depth) => {
    if (out.length > 5000 || depth > 12) return;
    if (en.isFile) { const f = await new Promise((res, rej) => en.file(res, rej)); try { Object.defineProperty(f, 'webkitRelativePath', { value: prefix + f.name }); } catch { /* keep the plain name */ } out.push(f); }
    else if (en.isDirectory) {
      const reader = en.createReader();
      for (;;) {
        const batch = await new Promise((res, rej) => reader.readEntries(res, rej));
        if (!batch.length) break;
        for (const child of batch) await walk(child, `${prefix}${en.name}/`, depth + 1);
      }
    }
  };
  try { for (const en of entries) await walk(en, '', 0); } catch { return [...dt.files]; }
  return out;
}
wire();
