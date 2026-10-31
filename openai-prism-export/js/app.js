/* Splitlight page logic. The export is read here, in this tab (js/parse.js, js/tex.js, js/zip.js); nothing is sent anywhere.
 * The only network call the page can make is Gumroad's licence check (/assets/license.js), and only when a Pro key is pasted. */
import { collect, openExport, ExportError, blobOf } from './parse.js';
import { overleafZips, overleafSteps, singleTex, chatMarkdown, checkText, bundleZip, problemText, fileText, esc, isoTime, mb, safeName } from './export.js';
import { kindOf, extOf } from './tex.js';
import { sampleZip, SAMPLE_NAME } from './sample.js';
import { PRO, PRO_READY, PRO_PITCH } from './pro.js';

const $ = id => document.getElementById(id);
const num = n => Number(n).toLocaleString('en-US');
const plural = (n, one, many) => `${num(n)} ${n === 1 ? one : many}`;
const RAYS = ['#f08c00', '#d9a400', '#2fb35a', '#4c9bf5', '#e8590c', '#9775fa'];
const FILE_STEP = 60;

let model = null;
let tab = 'projects';
let pro = false;
const st = { p: 0, c: 0, files: FILE_STEP, preview: null, doc: null };
let previewUrl = null;

/* ------------------------------------------------------------------ Pro */
function setupPro() {
  if (!window.PeakLicense) return;
  PeakLicense.setup({ tool: 'splitlight', productId: PRO_READY ? PRO.productId : 'PENDING', permalink: PRO.permalink, buyUrl: PRO.url, pitch: PRO_PITCH });
  pro = PRO_READY && PeakLicense.isPro();
  document.body.classList.toggle('is-pro', pro);
  PeakLicense.onChange(p => { pro = PRO_READY && p; document.body.classList.toggle('is-pro', pro); proNote(); });
}
function proNote() {
  const n = $('save-note');
  if (n) n.textContent = pro ? 'Pro is on in this browser.' : 'Opening, checking, and saving one project or one chat at a time are free. Pro sorts everything at once for $8, paid once.';
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
function stage(name) {
  for (const s of ['idle', 'busy', 'error']) $(`stage-${s}`).hidden = s !== name;
  $('panel').dataset.state = name;
}
const ERRORS = {
  nothing: ['Nothing was chosen', 'Choose the ZIP from Prism, or the folder you unzipped it into.'],
  empty: ['This ZIP is empty', 'It holds no files. Export again from Prism: Settings > Data Controls > Export all projects (zip).'],
  truncated: ['This ZIP stops part way', 'The download did not finish. Download the export from Prism again and choose the new file.'],
  damaged: ['This ZIP could not be read', 'It looks damaged. Download the export from Prism again; if it fails again, unzip it on your computer and choose the folder.'],
  encrypted: ['This ZIP has a password', 'Prism does not put a password on its exports, so this may be another file. Unzip it with its password and choose the folder.'],
  'no-tex': ['No LaTeX project in these files', 'There is no .tex file here. A Prism export holds one folder of .tex, .bib and figure files per project.'],
  'no-tex-word': ['These are Word files, not a Prism export', 'A Prism export holds .tex files. Choose the ZIP from Prism\'s Export all projects instead.'],
  'no-tex-pdf': ['Only PDFs here', 'A PDF downloaded from Prism\'s viewer is the finished paper, not the project. For the project, use Export (zip) in Prism.'],
  'wrong-pdf': ['This is a PDF', 'It is a finished paper, not the project. In Prism, use Export (zip) from the project menu, or Export all projects in Settings > Data Controls.'],
  'wrong-html': ['This is a web page', 'The browser saved the download page instead of the file. Go back to Prism and download the ZIP again.'],
  'wrong-rar': ['This is a RAR archive', 'Prism exports ZIP files. Unpack this one on your computer and choose the folder.'],
  'wrong-7z': ['This is a 7-Zip archive', 'Prism exports ZIP files. Unpack this one on your computer and choose the folder.'],
  'wrong-gzip': ['This is a .tar.gz', 'Splitlight reads ZIP files and folders. Unpack it on your computer (an arXiv source bundle is a .tar.gz too) and choose the folder.'],
  'wrong-json': ['This is a single JSON file', 'It may be one chat from the export. Choose the whole ZIP, or the unzipped folder, so the projects open with it.'],
  'wrong-text': ['This is a text file, not a ZIP', 'Choose the ZIP from Prism, or several .tex files at once, or a folder.'],
  'wrong-binary': ['This is not a ZIP', 'Choose the ZIP that Prism\'s Export all projects (zip) downloads.'],
  'wrong-empty': ['This file is empty', 'It holds no bytes. Download the export from Prism again.'],
  'wrong-office-old': ['This is an old Office file', 'Choose the ZIP from Prism instead.'],
  'wrong-whatsapp': ['This is a text file, not a ZIP', 'Choose the ZIP from Prism, or several .tex files at once, or a folder.'],
};
function showError(code, detail) {
  const [t, x] = ERRORS[code] || ['This could not be opened', String(detail || code)];
  $('error-title').textContent = t;
  $('error-text').textContent = x;
  stage('error');
  $('error-title').focus();
}

/* ------------------------------------------------------------------ opening */
async function openFiles(chosen, label = '') {
  const files = [...(chosen || [])];
  if (!files.length) return;
  stage('busy');
  $('busy-title').focus();
  $('busy-sub').textContent = files.length === 1 ? `Reading ${files[0].name} in your browser.` : `Reading ${plural(files.length, 'file', 'files')} in your browser.`;
  try {
    const groups = await collect(files, { label });
    $('busy-sub').textContent = 'Checking each project.';
    const m = await openExport(groups, { label });
    show(m);
  } catch (e) {
    if (e instanceof ExportError) showError(e.code, e.detail);
    else { console.error(e); showError('damaged', e && e.message); }
  }
}
async function openSample() {
  const blob = await sampleZip();
  openFiles([new File([blob], SAMPLE_NAME, { type: 'application/zip' })]);
}
function show(m) {
  model = m;
  tab = m.projects.length ? 'projects' : m.chats.length || m.rawChats.length ? 'chats' : 'other';
  st.p = 0; st.c = 0; st.files = FILE_STEP; st.preview = null; st.doc = null;
  stage('idle');
  $('reader').hidden = false;
  const bits = [plural(m.projects.length, 'project', 'projects')];
  if (m.chats.length) bits.push(plural(m.chats.length, 'chat', 'chats'));
  if (m.errors.some(e => e.items.length || e.raw)) bits.push('an export-errors.json');
  bits.push(mb(m.totalSize));
  $('reader-meta').textContent = `${m.label}: ${bits.join(', ')}. Read in this tab; nothing was uploaded.`;
  proNote();
  renderErrors();
  render();
  $('reader').scrollIntoView({ block: 'start' });
  $('reader-title').focus({ preventScroll: true });
}

/* ------------------------------------------------------------------ rendering */
function renderErrors() {
  const box = $('errors');
  if (!model.errors.length) { box.innerHTML = ''; return; }
  box.innerHTML = model.errors.map(e => `<div class="sl-errbox" role="note"><h3>Prism reported a failed export</h3>
<p>From <code>${esc(e.path)}</code>:</p>
${e.items.length ? `<ul>${e.items.map(it => `<li><strong>${esc(it.project || 'A project')}</strong>${it.file ? ` (<code>${esc(it.file)}</code>)` : ''}: ${esc(it.error)}</li>`).join('')}</ul>` : `<pre>${esc(e.raw || '')}</pre>`}
<p class="sl-small">OpenAI's guide: export that project again from its project-title menu with Export (zip), and email support@openai.com if it is still missing. <a href="/openai-prism-export/how-to-export/#export-errors">What export-errors.json means</a></p></div>`).join('');
}
function tabs() {
  const t = [];
  if (model.projects.length) t.push(['projects', `Projects (${num(model.projects.length)})`]);
  if (model.chats.length || model.rawChats.length) t.push(['chats', `Chats (${num(model.chats.length)})`]);
  if (model.other.length) t.push(['other', `Other files (${num(model.other.length)})`]);
  return t;
}
function render() {
  const T = tabs();
  if (!T.some(x => x[0] === tab)) tab = T[0] ? T[0][0] : 'projects';
  $('tabs').innerHTML = T.map(([k, l]) => `<button type="button" role="tab" class="sl-tab" id="tab-${k}" data-tab="${k}" aria-selected="${k === tab}" aria-controls="view" tabindex="${k === tab ? 0 : -1}">${esc(l)}</button>`).join('');
  $('view').setAttribute('aria-labelledby', `tab-${tab}`);
  if (tab === 'projects') viewProjects();
  else if (tab === 'chats') viewChats();
  else viewOther();
}
function statusLine(p) {
  const d = p.main;
  if (!d) return 'No main document found';
  const bits = [];
  if (d.missing.length) bits.push(`${plural(d.missing.length, 'file', 'files')} missing`);
  if (d.caseOnly.length) bits.push(`${plural(d.caseOnly.length, 'name', 'names')} in the wrong case`);
  bits.push(p.overleaf.parts.length > 1 ? `${p.overleaf.parts.length} Overleaf uploads` : '1 Overleaf upload');
  if (!d.missing.length && !d.caseOnly.length && p.overleaf.parts.length <= 1 && !p.overleaf.problems.length) return 'Ready to move';
  return bits.join(', ');
}
function failedHere(p) {
  const key = s => String(s || '').toLowerCase().replace(/[^a-z0-9]+/g, '');
  return model.errors.flatMap(e => e.items).filter(it => it.project && key(it.project) === key(p.name));
}
function viewProjects() {
  const ps = model.projects;
  if (st.p >= ps.length) st.p = 0;
  const p = ps[st.p];
  const list = `<ul class="sl-plist" aria-label="Projects">${ps.map((x, i) => `<li><button type="button" class="sl-pbtn" data-project="${i}" style="--ray:${RAYS[i % RAYS.length]}" aria-current="${i === st.p}"><b>${esc(x.label)}</b><span>${esc(statusLine(x))}</span></button></li>`).join('')}</ul>`;
  $('view').innerHTML = `<div class="sl-cols">${list}<div class="sl-card" id="project">${projectCard(p, st.p)}</div></div>`;
}
function flagsOf(p) {
  const f = [];
  const d = p.main;
  for (const it of failedHere(p)) f.push(['bad', `Prism's export-errors.json lists this project: ${esc(it.error)} Export it again from its project menu.`]);
  if (!d) f.push(['bad', `${esc(problemText('no-main'))} Choose the project's folder or ZIP; if it is there, the main file may need its <code>\\documentclass</code> line.`]);
  else {
    if (d.missing.length) f.push(['bad', `The main document asks for ${plural(d.missing.length, 'file', 'files')} that ${d.missing.length === 1 ? 'is' : 'are'} not in the export:<ul>${d.missing.slice(0, 20).map(m => `<li><code>${esc(m.target)}</code> (<code>\\${esc(m.cmd)}</code> in <code>${esc(m.from)}</code>)</li>`).join('')}${d.missing.length > 20 ? `<li>and ${num(d.missing.length - 20)} more</li>` : ''}</ul>`]);
    if (d.caseOnly.length) f.push(['warn', `Letter case differs, which builds on Windows and macOS but fails on Overleaf:<ul>${d.caseOnly.slice(0, 20).map(m => `<li><code>${esc(m.target)}</code> is <code>${esc(m.actual)}</code></li>`).join('')}</ul>`]);
    if (d.engine !== 'pdfLaTeX') f.push(['warn', `Needs ${esc(d.engine)} (${esc(d.engineWhy)}). In Overleaf: Menu &gt; Compiler &gt; ${esc(d.engine)}.`]);
  }
  for (const c of p.overleaf.problems.filter(x => x !== 'no-main')) f.push([c === 'file-over-50mb' || c === 'over-2000-files' ? 'bad' : 'warn', esc(problemText(c))]);
  if (p.overleaf.parts.length > 1) f.push(['warn', `Too big for one Overleaf upload (${num(p.overleaf.files)} files, about ${esc(mb(p.overleaf.zipBytes))}). It comes in ${p.overleaf.parts.length} parts below.`]);
  if (d && !f.some(x => x[0] === 'bad') && !d.missing.length) f.push(['good', 'Every file the main document asks for is in the export.']);
  return f;
}
function projectCard(p, i) {
  const d = p.main;
  const docs = p.docs;
  if (st.doc && !docs.some(x => x.path === st.doc)) st.doc = null;
  const doc = docs.find(x => x.path === st.doc) || d;
  const parts = p.overleaf.parts;
  const kv = [];
  if (d) {
    kv.push(['Main document', `<code>${esc(d.path)}</code>`]);
    if (docs.length > 1) kv.push(['Other documents', docs.slice(1).map(x => `<code>${esc(x.path)}</code>`).join(', ')]);
    kv.push(['Engine', `${esc(d.engine)} <span class="sl-small">(${esc(d.engineWhy)})</span>`]);
    kv.push(['Bibliography', d.bibSystem === 'none' ? 'None found' : `${esc(d.bibSystem)}${d.bibBackend !== 'none' ? ` with ${esc(d.bibBackend)}` : ''}, ${plural(p.bibCount, 'entry', 'entries')} in ${plural(p.bibFiles.length, '.bib file', '.bib files')}`]);
    kv.push(['Length', `about ${num(d.words)} words, ${plural(d.outline.sections.length, 'heading', 'headings')}`]);
  }
  kv.push(['Files', `${num(p.files.length)} (${esc(mb(p.size))}): ${plural(p.figures, 'figure', 'figures')}${p.unusedFigures.length ? `, ${num(p.unusedFigures.length)} not used by any document` : ''}${p.junk.length ? `, ${plural(p.junk.length, 'build file', 'build files')}` : ''}`]);
  if (p.chats.length) kv.push(['Chats', `${plural(p.chats.length, 'chat', 'chats')} in the conversations folder`]);
  if (p.nested) kv.push(['Found in', `<code>${esc(p.nested)}</code> inside ${esc(p.group)}`]);
  const ol = doc ? doc.outline : null;
  const dlButtons = parts.length <= 1
    ? `<button type="button" class="sl-btn sl-btn-sm" data-overleaf="0">Download for Overleaf (ZIP, ${esc(mb(p.overleaf.zipBytes))})</button>`
    : parts.map((x, k) => `<button type="button" class="sl-btn sl-btn-sm${k ? ' sl-btn-plain' : ''}" data-overleaf="${k}">Part ${k + 1} of ${parts.length} (${plural(x.length, 'file', 'files')})</button>`).join('');
  const steps = overleafSteps(p);
  const docSel = docs.length > 1 ? `<label class="sl-small">Document <select id="doc-pick">${docs.map(x => `<option value="${esc(x.path)}"${x.path === doc.path ? ' selected' : ''}>${esc(x.path)}</option>`).join('')}</select></label>` : '';
  return `<h3 id="project-title" tabindex="-1"><span class="sl-ray" style="--ray:${RAYS[i % RAYS.length]}" aria-hidden="true"></span>${esc(p.label)}</h3>
${ol && ol.title ? `<p class="sl-sub">${esc(ol.title)}${ol.authors.length ? `. ${esc(ol.authors.join(', '))}` : ''}</p>` : ''}
<dl class="sl-kv">${kv.map(([k, v]) => `<dt>${k}</dt><dd>${v}</dd>`).join('')}</dl>
<ul class="sl-flags">${flagsOf(p).map(([c, t]) => `<li class="sl-flag ${c}">${t}</li>`).join('')}</ul>
<div class="sl-dl"><h4>Move it to Overleaf</h4><div class="sl-actions">${parts.length ? dlButtons : '<span class="sl-small">Nothing to upload.</span>'}</div>
<ol>${steps.map(s => `<li>${esc(s.replace(/^\d\.\s*/, ''))}</li>`).join('')}</ol>
<p class="sl-small">Files are at the top of the ZIP, as Overleaf asks, and build files (.aux, .log and the like) are left out. <a href="/openai-prism-export/to-overleaf/">More on Overleaf's limits</a></p></div>
${doc ? `<div class="sl-dl"><h4>One .tex for Codex or a journal</h4>${docSel}<div class="sl-actions"><button type="button" class="sl-btn sl-btn-sm sl-btn-plain" id="btn-single">Download ${esc(doc.path.split('/').pop())} as one file</button></div>
<p class="sl-small">Every <code>\\input</code>, <code>\\include</code>, <code>\\subfile</code> and <code>\\import</code> is pulled in; figures${doc.bib.length ? ' and the .bib' : ''} still sit next to it. <a href="/openai-prism-export/codex/">Why Codex needs this</a></p></div>` : ''}
${ol && (ol.abstract || ol.sections.length) ? `<h4>Outline</h4>${ol.abstract ? `<p class="sl-abstract"><strong>Abstract.</strong> ${esc(ol.abstract.length > 600 ? `${ol.abstract.slice(0, 600)}...` : ol.abstract)}</p>` : ''}${ol.sections.length ? `<ol class="sl-outline">${ol.sections.map(s => `<li class="lv-${s.level}">${esc(s.title)}</li>`).join('')}</ol>` : ''}` : ''}
<div id="preview"></div>
${filesTable(p)}`;
}
function fileStatus(p, f) {
  if (f.kind === 'build') return 'build file, left out';
  if (p.docs.some(d => d.path === f.rel)) return 'document';
  if (p.unusedFigures.includes(f.rel)) return 'not used';
  if (p.compiledPdf.includes(f.rel)) return 'compiled PDF';
  if (p.overleaf.tooBig.includes(f.rel)) return 'over 50 MB';
  if (p.overleaf.parts.length > 1) { const k = p.overleaf.parts.findIndex(x => x.includes(f.rel)); if (k >= 0) return `part ${k + 1}`; }
  return '';
}
function filesTable(p) {
  const files = [...p.files].sort((a, b) => a.rel.localeCompare(b.rel));
  const shown = files.slice(0, st.files);
  const canPreview = f => ['tex', 'bib', 'style', 'text'].includes(f.kind) || /^(png|jpe?g|gif|svg|webp)$/.test(extOf(f.rel)) || ['log', 'aux', 'bbl'].includes(extOf(f.rel));
  return `<table class="sl-files"><caption>Files in the project</caption><thead><tr><th scope="col">File</th><th scope="col">Size</th><th scope="col">Note</th><th scope="col"><span class="sr-only">Open</span></th></tr></thead><tbody>
${shown.map(f => `<tr><td>${esc(f.rel)}</td><td class="n">${esc(mb(f.size))}</td><td>${esc(fileStatus(p, f))}</td><td>${canPreview(f) ? `<button type="button" class="sl-link" data-preview="${esc(f.rel)}">View</button>` : ''}</td></tr>`).join('\n')}
</tbody></table>${files.length > shown.length ? `<p class="sl-more"><button type="button" class="sl-btn sl-btn-sm sl-btn-plain" id="btn-more-files">Show all ${num(files.length)} files</button></p>` : ''}`;
}
async function preview(rel) {
  const p = model.projects[st.p];
  const f = p.files.find(x => x.rel === rel);
  const box = $('preview');
  if (!f || !box) return;
  st.preview = rel;
  if (previewUrl) { URL.revokeObjectURL(previewUrl); previewUrl = null; }
  const head = `<div class="sl-preview-head"><span>${esc(rel)}</span><button type="button" class="sl-link" id="btn-preview-close">Close</button></div>`;
  const ext = extOf(rel);
  if (/^(png|jpe?g|gif|svg|webp)$/.test(ext)) {
    const type = ext === 'svg' ? 'image/svg+xml' : ext === 'jpg' ? 'image/jpeg' : `image/${ext}`;
    previewUrl = URL.createObjectURL(await blobOf(f, type));
    box.innerHTML = `<div class="sl-preview" tabindex="-1" id="preview-box">${head}<img src="${previewUrl}" alt="${esc(rel)}"></div>`;
  } else {
    let t = '';
    try { t = await fileText(p, rel); } catch { t = '(this file could not be read)'; }
    const cut = t.length > 200000;
    box.innerHTML = `<div class="sl-preview" tabindex="-1" id="preview-box">${head}<pre>${esc(cut ? t.slice(0, 200000) : t)}</pre>${cut ? '<p class="sl-small" style="padding:0 12px 10px">Showing the first 200,000 characters.</p>' : ''}</div>`;
  }
  $('preview-box').scrollIntoView({ block: 'nearest' });
  $('preview-box').focus({ preventScroll: true });
}
function viewChats() {
  const cs = model.chats;
  if (st.c >= cs.length) st.c = 0;
  const raw = model.rawChats.length ? `<div class="sl-card" style="margin-top:16px"><h3>Chat files we could not read as chats</h3><p class="sl-small">Shown as they are, so nothing is lost.</p>${model.rawChats.map(r => `<details><summary><code>${esc(r.path)}</code>: ${esc(r.reason)}</summary><pre class="sl-small" style="white-space:pre-wrap;overflow-wrap:anywhere;max-height:300px;overflow:auto">${esc(r.text)}</pre></details>`).join('')}</div>` : '';
  if (!cs.length) { $('view').innerHTML = `<p class="sl-empty">No chats could be read.</p>${raw}`; return; }
  const c = cs[st.c];
  const list = `<ul class="sl-plist" aria-label="Chats">${cs.map((x, i) => `<li><button type="button" class="sl-pbtn" data-chat="${i}" aria-current="${i === st.c}"><b>${esc(x.title)}</b><span>${esc(x.project || 'No project named')}, ${plural(x.messages.length, 'message', 'messages')}</span></button></li>`).join('')}</ul>`;
  const msgs = c.messages.map(m => `<div class="sl-msg ${m.role === 'You' ? 'you' : ''}"><p class="who">${esc(m.role)}${m.ts != null ? ` <span>${esc(isoTime(m.ts))}</span>` : ''}</p><div class="t">${esc(m.text)}</div></div>`).join('');
  $('view').innerHTML = `<div class="sl-cols">${list}<div class="sl-card" id="chat"><h3 id="chat-title" tabindex="-1">${esc(c.title)}</h3><p class="sl-sub">${c.project ? `Project: ${esc(c.project)}. ` : ''}${c.created != null ? `Started ${esc(isoTime(c.created))}. ` : ''}From <code>${esc(c.file)}</code>.</p>
<div class="sl-actions"><button type="button" class="sl-btn sl-btn-sm sl-btn-plain" id="btn-chat-md">Save this chat as Markdown</button></div>
<div class="sl-chat-msgs">${msgs}</div></div></div>${raw}`;
}
function viewOther() {
  $('view').innerHTML = `<div class="sl-card"><h3>Other files in the archive</h3><p class="sl-small">Files outside any project folder. They are not part of the Overleaf ZIPs.</p><table class="sl-files"><thead><tr><th scope="col">File</th><th scope="col">Size</th></tr></thead><tbody>${model.other.map(o => `<tr><td>${esc(o.path)}</td><td class="n">${esc(mb(o.size))}</td></tr>`).join('')}</tbody></table></div>`;
}

/* ------------------------------------------------------------------ saving */
async function saveOverleaf(k) {
  const p = model.projects[st.p];
  const zips = await overleafZips(p);
  const z = zips[k];
  if (!z) return;
  download(z.name, z.blob, 'application/zip');
  toast(z.of > 1 ? `Part ${z.part} of ${z.of} saved.` : 'ZIP for Overleaf saved.');
}
function saveSingle() {
  const p = model.projects[st.p];
  const doc = p.docs.find(x => x.path === st.doc) || p.main;
  const s = singleTex(p, doc.path);
  if (!s) return;
  download(s.name, s.text, 'text/x-tex;charset=utf-8');
  toast(`${s.name} saved.`);
}
async function proSave() {
  if (!model) return;
  if (!needPro('Sorting the whole export at once is part of Splitlight Pro.')) return;
  const note = $('save-note');
  note.textContent = 'Building the ZIP in your browser.';
  const b = await bundleZip(model, { onProgress: t => { note.textContent = `Building the ZIP: ${t}.`; } });
  download(b.name, b.blob, 'application/zip');
  proNote();
  toast('Sorted export saved.');
}

/* ------------------------------------------------------------------ events */
function wire() {
  const fileInput = $('file-input');
  const folderInput = $('folder-input');
  $('btn-choose').addEventListener('click', () => fileInput.click());
  $('btn-folder').addEventListener('click', () => folderInput.click());
  fileInput.addEventListener('change', () => { openFiles(fileInput.files); fileInput.value = ''; });
  folderInput.addEventListener('change', () => { openFiles(folderInput.files); folderInput.value = ''; });
  $('btn-sample').addEventListener('click', openSample);
  $('btn-error-sample').addEventListener('click', openSample);
  $('btn-retry').addEventListener('click', () => { stage('idle'); $('drop-title').focus(); fileInput.click(); });
  $('btn-another').addEventListener('click', () => { $('panel').scrollIntoView({ block: 'center' }); stage('idle'); $('drop-title').focus({ preventScroll: true }); });
  $('btn-check').addEventListener('click', () => { if (model) { download(`prism-export-check-${safeName(model.label, 40)}.txt`, checkText(model), 'text/plain;charset=utf-8'); toast('Check saved.'); } });
  $('btn-bundle').addEventListener('click', proSave);

  const drop = $('drop');
  const over = on => drop.classList.toggle('is-over', on);
  for (const el of [drop, $('panel')]) {
    el.addEventListener('dragover', e => { e.preventDefault(); over(true); });
    el.addEventListener('dragleave', () => over(false));
    el.addEventListener('drop', async e => { e.preventDefault(); over(false); openFiles(await droppedFiles(e.dataTransfer)); });
  }

  $('tabs').addEventListener('click', e => { const b = e.target.closest('[data-tab]'); if (b) { tab = b.dataset.tab; render(); $(`tab-${tab}`).focus(); } });
  $('tabs').addEventListener('keydown', e => {
    if (!['ArrowLeft', 'ArrowRight', 'Home', 'End'].includes(e.key)) return;
    const keys = tabs().map(t => t[0]);
    let k = keys.indexOf(tab);
    k = e.key === 'Home' ? 0 : e.key === 'End' ? keys.length - 1 : (k + (e.key === 'ArrowRight' ? 1 : -1) + keys.length) % keys.length;
    tab = keys[k]; render(); $(`tab-${tab}`).focus(); e.preventDefault();
  });

  $('view').addEventListener('click', e => {
    const t = e.target;
    const pb = t.closest('[data-project]');
    if (pb) { st.p = +pb.dataset.project; st.files = FILE_STEP; st.preview = null; st.doc = null; render(); const h = $('project-title'); if (h) { h.focus({ preventScroll: true }); if (matchMedia('(max-width: 860px)').matches) $('project').scrollIntoView({ block: 'start' }); } return; }
    const cb = t.closest('[data-chat]');
    if (cb) { st.c = +cb.dataset.chat; render(); const h = $('chat-title'); if (h) { h.focus({ preventScroll: true }); if (matchMedia('(max-width: 860px)').matches) $('chat').scrollIntoView({ block: 'start' }); } return; }
    const ob = t.closest('[data-overleaf]');
    if (ob) { saveOverleaf(+ob.dataset.overleaf); return; }
    const pv = t.closest('[data-preview]');
    if (pv) { preview(pv.dataset.preview); return; }
    if (t.closest('#btn-preview-close')) { st.preview = null; $('preview').innerHTML = ''; if (previewUrl) { URL.revokeObjectURL(previewUrl); previewUrl = null; } return; }
    if (t.closest('#btn-more-files')) { st.files = 1e9; render(); return; }
    if (t.closest('#btn-single')) { saveSingle(); return; }
    if (t.closest('#btn-chat-md')) { const c = model.chats[st.c]; if (c) { download(`prism-chat-${safeName(c.title, 50)}.md`, chatMarkdown(c), 'text/markdown;charset=utf-8'); toast('Chat saved.'); } }
  });
  $('view').addEventListener('change', e => {
    if (e.target.id === 'doc-pick') { st.doc = e.target.value; render(); const s = $('doc-pick'); if (s) s.focus(); }
  });
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

/* The page's state for the browser tests: the export that is open and the files Pro would save. */
window.__splitlight = {
  get model() { return model; },
  bundle: date => bundleZip(model, { date: date ? new Date(date) : new Date() }),
  check: () => checkText(model),
  single: (i, path) => singleTex(model.projects[i], path),
  overleaf: i => overleafZips(model.projects[i]),
  kindOf,
};

wire();
if (document.readyState === 'complete') setupPro(); else window.addEventListener('load', setupPro);
