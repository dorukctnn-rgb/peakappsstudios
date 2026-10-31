/* Ficshelf page logic. The files are read here, in this tab or in its Web Worker (js/scan.js, js/work.js, js/epub.js); nothing is sent
 * anywhere. The only network call the page can make is Gumroad's licence check (/assets/license.js), and only when a Pro key is pasted.
 * The page never contacts AO3. */
import { expandSources, sourceId, readBlob } from './source.js';
import { scanAll } from './scan.js';
import { loadWork, workToEpub, workToText, workToHtml, workFileName } from './work.js';
import * as L from './library.js';
import { libraryCsv, libraryJson, readingListMd, tidyZip, mergeToEpub, isoDay } from './export.js';
import { sampleFiles, SAMPLE_COUNT } from './sample.js';
import { searchLibrary, parseQuery } from './search.js';
import { PRO, PRO_READY, PRO_PITCH } from './pro.js';
import * as store from './store.js';
import { createReader, readKeys } from './reader.js';
import { escapeHtml as esc } from './html.js';

const $ = id => document.getElementById(id);
const num = n => Number(n).toLocaleString('en-US');
const PAGE = 120;
const SAMPLE_PREFIX = 'Ficshelf sample/';
const FACETS = ['fandoms', 'relationships', 'characters', 'tags', 'warnings', 'categories', 'rating', 'language'];
const ls = {
  get(k) { try { return localStorage.getItem(k); } catch { return null; } },
  set(k, v) { try { localStorage.setItem(k, v); } catch { /* private mode */ } },
};

const state = {
  works: [], sources: new Map(), sel: new Set(), filters: L.emptyFilters(), view: 'shelf', sort: 'title', dir: 'asc', page: 1, open: null,
  notices: [], fxOpen: new Set(), fxQ: {}, fxLimit: {}, facetData: null, dups: [], dupIds: new Set(), filtered: [], pro: false, sample: false, busy: false,
  memory: { restored: 0 },
};
let reader = null;

/* ------------------------------------------------------------------ Pro */
function setupPro() {
  if (!window.PeakLicense) return;
  PeakLicense.setup({ tool: 'ficshelf', productId: PRO_READY ? PRO.productId : 'PENDING', permalink: PRO.permalink, buyUrl: PRO.url, pitch: PRO_PITCH });
  state.pro = PRO_READY && PeakLicense.isPro();
  document.body.classList.toggle('is-pro', state.pro);
  PeakLicense.onChange(p => { state.pro = PRO_READY && p; document.body.classList.toggle('is-pro', state.pro); proNote(); });
}
function proNote(text) {
  const n = $('pro-note');
  if (n) n.textContent = text || (state.pro ? 'Pro is on in this browser.' : 'Opening, filtering, reading and saving one fic as EPUB are free. Pro adds these for $8, paid once.');
}
function needPro(why) {
  if (PRO_READY && window.PeakLicense && PeakLicense.isPro()) return true;
  if (window.PeakLicense) PeakLicense.open(why); else window.open(PRO.url, '_blank', 'noopener');
  return false;
}

/* ------------------------------------------------------------------ helpers */
const toast = msg => { if (window.PeakUI && PeakUI.toast) PeakUI.toast(msg); };
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
  nothing: ['Nothing to list here', 'Choose a folder or files with EPUB, HTML or PDF downloads from AO3, or a ZIP that holds them.'],
  empty: ['No EPUB, HTML or PDF files found', 'The files you chose hold none. AO3 downloads are .epub, .html and .pdf files; a ZIP of them also works.'],
  kindle: ['These are MOBI or AZW3 files', 'Ficshelf does not read MOBI or AZW3. Download the EPUB from AO3 instead and choose that.'],
  failed: ['This could not be listed', 'Something went wrong while reading the files. Try again with fewer files, or choose the folder once more.'],
};
function showError(code, detail) {
  const [t, x] = ERRORS[code] || ERRORS.failed;
  $('error-title').textContent = t;
  $('error-text').textContent = detail ? `${x} (${detail})` : x;
  stage('error');
  $('error-title').focus();
}

/* ------------------------------------------------------------------ the worker */
let worker = null;
let jobSeq = 0;
const jobs = new Map();
let localCancel = false;
function getWorker() {
  if (worker !== null) return worker;
  try {
    worker = new Worker(new URL('./worker.js', import.meta.url), { type: 'module' });
    worker.onmessage = e => { const j = jobs.get(e.data.id); if (j) j(e.data); };
    worker.onerror = () => { for (const j of jobs.values()) j({ type: 'error', message: 'worker failed' }); worker = false; };
  } catch { worker = false; }
  return worker;
}
/* Lists items [{ path, file }]. Resolves { works, sources, skipped, cancelled }. */
function runScan(items, onProgress) {
  const w = getWorker();
  if (!w) return runScanLocal(items, onProgress);
  return new Promise((resolve, reject) => {
    const id = ++jobSeq;
    jobs.set(id, m => {
      if (m.type === 'progress') { onProgress && onProgress(m); return; }
      jobs.delete(id);
      if (m.type === 'done') resolve(m); else if (m.message === 'worker failed') runScanLocal(items, onProgress).then(resolve, reject); else reject(new Error(m.message));
    });
    w.postMessage({ type: 'scan', id, items });
  });
}
async function runScanLocal(items, onProgress) {
  localCancel = false;
  const { sources, skipped } = await expandSources(items, { isCancelled: () => localCancel });
  const r = await scanAll(sources, { isCancelled: () => localCancel, onProgress: p => onProgress && onProgress({ phase: 'scan', ...p }) });
  const ids = new Set(r.works.map(x => x.id));
  return { works: r.works, sources: sources.filter(s => ids.has(sourceId(s))), skipped, cancelled: r.cancelled };
}
function cancelWork() { localCancel = true; if (worker) worker.postMessage({ type: 'cancel' }); }

/* ------------------------------------------------------------------ adding files */
function setProgress(p) {
  const bar = $('busy-bar');
  if (p.phase === 'open' || !p.total) { bar.classList.add('is-wait'); bar.removeAttribute('aria-valuenow'); $('busy-sub').textContent = 'Opening the folder.'; return; }
  const pct = Math.round((p.done / p.total) * 100);
  bar.classList.remove('is-wait');
  bar.setAttribute('aria-valuenow', String(pct));
  bar.firstElementChild.style.width = `${pct}%`;
  $('busy-sub').textContent = `Listed ${num(p.done)} of ${num(p.total)} files.`;
}
async function addFiles(items, { sample = false } = {}) {
  if (!items.length || state.busy) return;
  state.busy = true;
  stage('busy');
  $('busy-title').focus();
  $('busy-bar').classList.add('is-wait');
  $('busy-bar').firstElementChild.style.width = '0';
  $('busy-sub').textContent = items.length === 1 ? `Reading ${items[0].file.name}.` : `Reading ${num(items.length)} files.`;
  try {
    const r = await runScan(items, setProgress);
    if (!r.works.length) {
      if (r.cancelled) { stage('idle'); return; }
      const kindle = r.skipped.some(s => /MOBI|AZW3/.test(s.reason));
      if (state.works.length) { stage('idle'); state.notices = r.skipped; renderNotices(); return; }
      showError(kindle ? 'kindle' : 'empty');
      return;
    }
    merge(r.works, r.sources);
    state.sample = state.works.every(w => w.path.startsWith(SAMPLE_PREFIX));
    state.notices = r.skipped;
    stage('idle');
    afterChange();
    $('lib').hidden = false;
    $('lib').scrollIntoView({ block: 'start' });
    $('lib-title').focus({ preventScroll: true });
    if (r.cancelled) toast('Stopped. The files listed so far are on the shelf.');
  } catch (e) {
    console.error(e);
    showError('failed', e && e.message);
  } finally { state.busy = false; }
}
function merge(works, sources) {
  const byId = new Map(state.works.map(w => [w.id, w]));
  const now = Date.now();
  works.forEach((w, i) => { const old = byId.get(w.id); w.addedAt = old ? old.addedAt : now + i; byId.set(w.id, w); });
  state.works = [...byId.values()];
  for (const s of sources) state.sources.set(sourceId(s), s);
}
const srcOf = w => state.sources.get(w.id) || null;

/* ------------------------------------------------------------------ remembering */
let persistTimer = 0;
function remembering() { return $('remember').checked; }
function persist() {
  clearTimeout(persistTimer);
  persistTimer = setTimeout(() => {
    if (!remembering()) return;
    const real = state.works.filter(w => !w.path.startsWith(SAMPLE_PREFIX));
    if (real.length) store.saveWorks(real); else store.saveWorks([]);
  }, 400);
}
async function restore() {
  const pref = ls.get('ficshelf:remember');
  $('remember').checked = pref !== '0';
  if (!remembering()) return;
  const works = await store.loadWorks();
  if (works.length && !state.works.length) {
    state.works = works;
    state.memory.restored = works.length;
    $('lib').hidden = false;
    afterChange();
  }
  const h = await store.loadHandle();
  if (h && h.name) { $('reconnect').hidden = false; $('reconnect-text').textContent = `Last time you used the folder "${h.name}".`; state.handle = h; }
}

/* ------------------------------------------------------------------ rendering */
function afterChange() {
  state.dups = L.findDuplicates(state.works);
  state.dupIds = L.duplicateIds(state.dups);
  state.facetData = null;
  renderNotices();
  renderLibrary();
  renderFacets();
  renderExtra();
  persist();
}
function renderNotices() {
  const box = $('notices');
  const bits = [];
  if (state.memory.restored && state.works.some(w => !state.sources.has(w.id))) {
    const missing = state.works.filter(w => !state.sources.has(w.id)).length;
    bits.push(`<p class="fs-notice" role="note">Your shelf was remembered from last time (${num(state.memory.restored)} fics). ${num(missing)} of them need their file again: choose the folder to read them. Nothing was uploaded.</p>`);
  }
  if (state.notices.length) {
    bits.push(`<div class="fs-notice" role="note"><strong>${num(state.notices.length)} file${state.notices.length === 1 ? ' was' : 's were'} left out.</strong><ul>${state.notices.slice(0, 8).map(n => `<li>${esc(n.path)}: ${esc(n.reason)}</li>`).join('')}</ul>${state.notices.length > 8 ? `<p class="fs-small">and ${num(state.notices.length - 8)} more.</p>` : ''}</div>`);
  }
  const damaged = state.works.filter(w => w.damaged);
  if (damaged.length) bits.push(`<div class="fs-notice" role="note"><strong>${num(damaged.length)} file${damaged.length === 1 ? ' could' : 's could'} not be read in full.</strong><ul>${damaged.slice(0, 5).map(w => `<li>${esc(w.name)}: ${esc(w.notes[0] || 'unreadable')}</li>`).join('')}</ul></div>`);
  box.innerHTML = bits.join('');
}
function compute() {
  const f = L.applyFilters(state.works, state.filters, { dupIds: state.dupIds });
  state.filtered = L.sortWorks(f, state.sort, state.dir);
}
const label = w => `${w.title}${w.authors.length ? ` by ${w.authors.join(', ')}` : ''}, ${w.format.toUpperCase()}${w.words != null ? `, ${num(w.words)} words` : ''}${w.chapters.have != null ? `, ${L.describeCopy(w)}` : ''}`;
const CJK = /[぀-ヿ㐀-鿿가-힯]/;
function fit(title, max) {
  let units = 0, out = '';
  for (const ch of title) { units += CJK.test(ch) ? 1.9 : 1; if (units > max) return `${out.trimEnd()}...`; out += ch; }
  return out;
}
function spineHtml(w) {
  const s = L.spineOf(w);
  const W = s.width, H = s.height;
  const sel = state.sel.has(w.id);
  const fileMissing = !state.sources.has(w.id);
  const t = esc(fit(w.title, Math.floor((H - 54) / 6.4)));
  return `<li><button type="button" class="spine${sel ? ' is-sel' : ''}" data-id="${w.id}" aria-current="${state.open === w.id}" aria-label="${esc(label(w))}" title="${esc(w.title)}"><svg width="${W}" height="${H}" viewBox="0 0 ${W} ${H}" aria-hidden="true" focusable="false"><rect width="${W}" height="${H}" rx="3" fill="${L.SPINE_COLORS[s.color]}"/><rect y="12" width="${W}" height="5" fill="#f2a65a"/><rect y="${H - 22}" width="${W}" height="2" fill="#f2a65a" opacity=".7"/><text transform="translate(${Math.round(W / 2 + 5)} ${H - 30}) rotate(-90)" fill="#fbf4ea" font-size="13" font-family="system-ui,sans-serif">${t}</text><text x="${W / 2}" y="${H - 7}" text-anchor="middle" fill="#fbf4ea" opacity="${fileMissing ? '.5' : '1'}" font-size="8" font-family="system-ui,sans-serif">${w.format.toUpperCase()}</text></svg></button></li>`;
}
function tableHtml(list) {
  return `<div class="fs-table-wrap"><table class="fs-tbl"><caption>${num(state.filtered.length)} fics in the library</caption><thead><tr><th scope="col"><span class="sr-only">Select for merging</span></th><th scope="col">Title</th><th scope="col">Author</th><th scope="col">Fandom</th><th scope="col" class="n">Words</th><th scope="col">Chapters</th><th scope="col">Updated</th><th scope="col">File</th></tr></thead><tbody>
${list.map(w => `<tr data-row="${w.id}" aria-selected="${state.open === w.id}"><td><input type="checkbox" data-sel="${w.id}" aria-label="Select ${esc(w.title)}"${state.sel.has(w.id) ? ' checked' : ''}></td><td><button type="button" class="t" data-id="${w.id}">${esc(w.title)}</button>${state.dupIds.has(w.id) ? '<span class="fs-tag warn">copy</span>' : ''}</td><td data-l="Author">${esc(w.authors.join(', '))}</td><td data-l="Fandom">${esc(w.fandoms.slice(0, 2).join(', '))}${w.fandoms.length > 2 ? ` +${w.fandoms.length - 2}` : ''}</td><td class="n" data-l="Words">${w.words != null ? `${w.wordsEstimated ? '~' : ''}${num(w.words)}` : ''}</td><td data-l="Chapters">${w.chapters.have != null ? `${w.chapters.have}/${w.chapters.total == null ? '?' : w.chapters.total}` : ''}</td><td data-l="Updated">${esc(w.updated || w.published)}</td><td data-l="File">${w.format.toUpperCase()}</td></tr>`).join('')}
</tbody></table></div>`;
}
function renderLibrary() {
  compute();
  const total = state.works.length;
  const words = state.works.reduce((n, w) => n + (w.words || 0), 0);
  $('lib-meta').textContent = `${num(total)} fic${total === 1 ? '' : 's'}, about ${num(words)} words. Read in this browser; nothing was uploaded.`;
  const shown = state.filtered.slice(0, state.page * PAGE);
  $('result-count').textContent = state.filtered.length === total ? `${num(total)} fics` : `${num(state.filtered.length)} of ${num(total)} fics match`;
  $('results').innerHTML = !state.filtered.length ? '<p class="fs-small">No fic matches these filters.</p>'
    : state.view === 'shelf' ? `<ul class="fs-shelf" aria-label="Your fics, one book spine each">${shown.map(spineHtml).join('')}</ul>` : tableHtml(shown);
  $('more-wrap').hidden = shown.length >= state.filtered.length;
  $('more').textContent = `Show more (${num(state.filtered.length - shown.length)} left)`;
  for (const [id, v] of [['btn-view-shelf', 'shelf'], ['btn-view-table', 'table']]) $(id).setAttribute('aria-pressed', String(state.view === v));
  renderDetail();
  renderSel();
}
function renderSel() {
  const n = state.sel.size;
  $('sel-wrap').hidden = !n;
  $('sel-count').textContent = `${num(n)} selected`;
}
const pills = (key, vals) => `<span class="fs-pills">${vals.slice(0, 40).map(v => `<button type="button" data-add="${key}" data-v="${esc(v)}" title="Show only fics with this">${esc(v)}</button>`).join('')}${vals.length > 40 ? `<span class="fs-small"> and ${num(vals.length - 40)} more</span>` : ''}</span>`;
function renderDetail() {
  const box = $('detail');
  const w = state.works.find(x => x.id === state.open);
  if (!w) { box.hidden = true; box.innerHTML = ''; return; }
  const flags = [];
  const un = L.unfinishedNote(w);
  if (un) flags.push(['warn', `${esc(un)}. ${w.complete === false && w.chapters.total == null ? 'The author may have added chapters since.' : 'Download it again from AO3 for the full work.'}`]);
  const group = state.dups.find(g => g.items.some(i => i.work.id === w.id));
  if (group) {
    const me = group.items.find(i => i.work.id === w.id);
    flags.push([me.keep ? 'good' : 'warn', `${esc(me.keep ? 'This is the best copy of this work in your library.' : me.reason)}. Other copies: ${group.items.filter(i => i.work.id !== w.id).map(i => esc(`${i.work.name} (${i.work.format.toUpperCase()}, ${L.describeCopy(i.work)})`)).join('; ')}.`]);
  }
  if (!srcOf(w)) flags.push(['warn', 'This fic was remembered from last time. Choose its folder again to read or save it.']);
  if (w.damaged) flags.push(['bad', esc(w.notes[0] || 'This file could not be read.')]);
  else if (w.notes[0] && w.format !== 'pdf') flags.push(['warn', esc(w.notes[0])]);
  if (w.format === 'pdf') flags.push(['warn', 'A PDF is listed from its file name. Your browser opens it; Ficshelf does not read its text.']);
  const kv = [];
  if (w.rating) kv.push(['Rating', esc(w.rating)]);
  if (w.warnings.length) kv.push(['Warnings', pills('warnings', w.warnings)]);
  if (w.categories.length) kv.push(['Category', pills('categories', w.categories)]);
  if (w.fandoms.length) kv.push(['Fandom', pills('fandoms', w.fandoms)]);
  if (w.relationships.length) kv.push(['Relationships', pills('relationships', w.relationships)]);
  if (w.characters.length) kv.push(['Characters', pills('characters', w.characters)]);
  if (w.tags.length) kv.push(['Tags', pills('tags', w.tags)]);
  if (w.language) kv.push(['Language', esc(w.language)]);
  if (w.series.length) kv.push(['Series', w.series.map(s => `<button type="button" class="fs-link" data-series="${esc(s.name)}">${esc(s.name)}</button>${s.part ? ` (part ${s.part})` : ''}`).join('; ')]);
  kv.push(['Length', `${w.words != null ? `${w.wordsEstimated ? 'about ' : ''}${num(w.words)} words` : 'not counted'}${w.chapters.have != null ? `, ${esc(L.describeCopy(w))}` : ''}${w.complete === true ? ', complete' : w.complete === false ? ', in progress' : ''}`]);
  if (w.published || w.updated) kv.push(['Dates', esc([w.published && `published ${w.published}`, w.updated && `updated ${w.updated}`].filter(Boolean).join(', '))]);
  for (const [k, v] of Object.entries(w.other || {})) kv.push([esc(k), esc(v.join(', '))]);
  kv.push(['File', `<code>${esc(w.path)}</code> (${w.format.toUpperCase()}, ${num(Math.max(1, Math.round(w.size / 1024)))} KB)`]);
  const can = !!srcOf(w) && !w.damaged;
  box.innerHTML = `<h3 id="detail-title" tabindex="-1">${esc(w.title)}</h3>
<p class="sub">${w.authors.length ? `by ${esc(w.authors.join(', '))}` : 'Author not found in the file'}</p>
${w.summary ? `<p class="fs-summary-text">${esc(w.summary)}</p>` : ''}
<div class="fs-actions">
${w.format === 'pdf' ? `<button type="button" class="fs-btn fs-btn-sm" data-act="pdf"${can ? '' : ' disabled'}>Open the PDF</button>` : `<button type="button" class="fs-btn fs-btn-sm" data-act="read"${can ? '' : ' disabled'}>Read it</button>
<button type="button" class="fs-btn fs-btn-plain fs-btn-sm" data-act="epub"${can ? '' : ' disabled'}>Save as clean EPUB</button>
<button type="button" class="fs-btn fs-btn-plain fs-btn-sm" data-act="text"${can ? '' : ' disabled'}>Text</button>
<button type="button" class="fs-btn fs-btn-plain fs-btn-sm" data-act="html"${can ? '' : ' disabled'}>Printable page</button>`}
<button type="button" class="fs-btn fs-btn-plain fs-btn-sm" data-act="select" aria-pressed="${state.sel.has(w.id)}">${state.sel.has(w.id) ? 'Remove from selection' : 'Add to selection'}</button>
${w.series.length ? '<button type="button" class="fs-btn fs-btn-plain fs-btn-sm" data-act="select-series">Select the whole series</button>' : ''}
<button type="button" class="fs-btn fs-btn-plain fs-btn-sm" data-act="close">Close</button>
</div>
${flags.length ? `<ul class="fs-flags">${flags.map(([c, t]) => `<li class="fs-flag ${c}">${t}</li>`).join('')}</ul>` : ''}
<dl class="fs-kv">${kv.map(([k, v]) => `<dt>${k}</dt><dd>${v}</dd>`).join('')}</dl>`;
  box.hidden = false;
}

/* ---------- facets ---------- */
function facetValues(f) {
  if (!state.facetData) state.facetData = {};
  return state.facetData[f] || (state.facetData[f] = L.facetCounts(state.works, f));
}
function activeOf(f) {
  if (f === 'rating' || f === 'language') return { inc: state.filters[f], exc: [] };
  return state.filters.lists[f];
}
function renderFacets() {
  const box = $('facets');
  const focus = document.activeElement && box.contains(document.activeElement) ? { fid: document.activeElement.dataset.fid, start: document.activeElement.selectionStart, end: document.activeElement.selectionEnd } : null;
  const x = state.filters;
  const parts = [];
  for (const f of FACETS) {
    const all = facetValues(f);
    if (!all.length) continue;
    const act = activeOf(f);
    const q = (state.fxQ[f] || '').toLowerCase();
    const isList = f !== 'rating' && f !== 'language';
    const key = v => v.toLowerCase();
    const activeSet = new Set([...act.inc, ...act.exc].map(key));
    let vals = all.filter(([v]) => !q || v.toLowerCase().includes(q));
    const limit = state.fxLimit[f] || 8;
    const activeVals = vals.filter(([v]) => activeSet.has(key(v)));
    const rest = vals.filter(([v]) => !activeSet.has(key(v)));
    const shown = [...activeVals, ...rest.slice(0, Math.max(0, limit - activeVals.length))];
    const n = act.inc.length + act.exc.length;
    parts.push(`<details class="fs-fx" data-fx="${f}"${state.fxOpen.has(f) ? ' open' : ''}><summary>${L.FACET_LABELS[f]}${n ? `<span class="n">${n}</span>` : ''}</summary>
<div class="fs-fx-tools"><input type="search" data-fid="q-${f}" data-fxq="${f}" placeholder="Find" aria-label="Find a ${L.FACET_LABELS[f].toLowerCase()}" value="${esc(state.fxQ[f] || '')}" autocomplete="off">${isList ? `<label>Match <select data-fid="m-${f}" data-mode="${f}" aria-label="${L.FACET_LABELS[f]}: match any or all"><option value="or"${x.lists[f].mode === 'or' ? ' selected' : ''}>any</option><option value="and"${x.lists[f].mode === 'and' ? ' selected' : ''}>all</option></select></label>` : ''}</div>
<ul class="fs-fx-list">${shown.map(([v, c]) => `<li><span>${esc(v)} <small>(${num(c)})</small></span><button type="button" class="fs-chip" data-fid="i-${f}-${esc(v)}" data-chip="${f}" data-v="${esc(v)}" data-m="inc" aria-pressed="${act.inc.map(key).includes(key(v))}" aria-label="Include ${esc(v)}">Include</button>${isList ? `<button type="button" class="fs-chip exc" data-fid="e-${f}-${esc(v)}" data-chip="${f}" data-v="${esc(v)}" data-m="exc" aria-pressed="${act.exc.map(key).includes(key(v))}" aria-label="Exclude ${esc(v)}">Exclude</button>` : '<span></span>'}</li>`).join('')}</ul>
${vals.length > shown.length ? `<button type="button" class="fs-link" data-fid="more-${f}" data-fxmore="${f}">Show more (${num(vals.length - shown.length)})</button>` : ''}</details>`);
  }
  const series = [...new Set(state.works.flatMap(w => w.series.map(s => s.name)))].sort((a, b) => a.localeCompare(b));
  parts.push(`<details class="fs-fx" data-fx="more"${state.fxOpen.has('more') ? ' open' : ''}><summary>Length, status and dates</summary>
<div class="fs-range"><label>Words from<input type="number" min="0" data-fid="wmin" data-f="wordsMin" value="${esc(x.wordsMin)}"></label><label>Words to<input type="number" min="0" data-fid="wmax" data-f="wordsMax" value="${esc(x.wordsMax)}"></label></div>
<fieldset style="border:0;padding:0;margin:10px 0 0"><legend class="sr-only">Status</legend>${[['any', 'Any status'], ['complete', 'Complete'], ['ongoing', 'In progress']].map(([v, t]) => `<label class="row"><input type="radio" name="status" data-fid="st-${v}" data-status="${v}"${x.status === v ? ' checked' : ''}> ${t}</label>`).join('')}</fieldset>
<div class="fs-range"><label>Published from<input type="date" data-fid="pf" data-f="pubFrom" value="${esc(x.pubFrom)}"></label><label>Published to<input type="date" data-fid="pt" data-f="pubTo" value="${esc(x.pubTo)}"></label><label>Updated from<input type="date" data-fid="uf" data-f="updFrom" value="${esc(x.updFrom)}"></label><label>Updated to<input type="date" data-fid="ut" data-f="updTo" value="${esc(x.updTo)}"></label></div>
${series.length ? `<label class="fs-small" style="display:block;margin-top:10px">Series<select data-fid="series" data-f="series"><option value="">Any series</option>${series.map(s => `<option value="${esc(s)}"${x.series === s ? ' selected' : ''}>${esc(s)}</option>`).join('')}</select></label>` : ''}
<fieldset style="border:0;padding:0;margin:10px 0 0"><legend class="sr-only">File type</legend>${['epub', 'html', 'pdf'].map(f => `<label class="row"><input type="checkbox" data-fid="fmt-${f}" data-format="${f}"${x.format.includes(f) ? ' checked' : ''}> ${f.toUpperCase()} files</label>`).join('')}</fieldset>
<label class="row"><input type="checkbox" data-fid="dup" data-f="onlyDup"${x.onlyDup ? ' checked' : ''}> Only duplicates and older copies</label></details>
<p style="margin:12px 0 0"><button type="button" class="fs-btn fs-btn-plain fs-btn-sm" id="btn-clear-filters"${L.filtersActive(x) ? '' : ' disabled'}>Clear all filters</button></p>`);
  box.innerHTML = parts.join('');
  if (focus && focus.fid) {
    const el = [...box.querySelectorAll('[data-fid]')].find(e => e.dataset.fid === focus.fid);
    if (el) { el.focus({ preventScroll: true }); if (focus.start != null && el.setSelectionRange && el.type !== 'number' && el.type !== 'date') { try { el.setSelectionRange(focus.start, focus.end); } catch { /* not a text field */ } } }
  }
}
function refresh() { state.page = 1; renderLibrary(); renderFacets(); }
let refreshTimer = 0;
const refreshSoon = () => { clearTimeout(refreshTimer); refreshTimer = setTimeout(refresh, 140); };

/* ---------- summary and duplicates ---------- */
function renderExtra() {
  const s = L.summarize(state.works, readKeys(state.works));
  const top = list => (list.length ? `<ul>${list.map(([v, n]) => `<li><button type="button" class="fs-link" data-add="${list === s.topFandoms ? 'fandoms' : 'relationships'}" data-v="${esc(v)}">${esc(v)}</button> (${num(n)})</li>`).join('')}</ul>` : '<p class="fs-small">None found in these files.</p>');
  $('summary-body').innerHTML = `<div class="fs-big"><div><b>${num(s.count)}</b><span>fics</span></div><div><b>${num(s.words)}</b><span>words in all</span></div><div><b>${num(s.ongoing)}</b><span>in progress</span></div></div>
<p class="fs-small">${num(s.byFormat.epub)} EPUB, ${num(s.byFormat.html)} HTML, ${num(s.byFormat.pdf)} PDF. ${num(s.complete)} complete.</p>
<h4 style="margin:14px 0 4px">Most common fandoms</h4>${top(s.topFandoms)}
<h4 style="margin:14px 0 4px">Most common relationships</h4>${top(s.topRelationships)}
<h4 style="margin:14px 0 4px">In progress and not opened yet (${num(s.ongoingUnread.length)})</h4>
${s.ongoingUnread.length ? `<ul>${s.ongoingUnread.slice(0, 6).map(w => `<li><button type="button" class="fs-link" data-id="${w.id}">${esc(w.title)}</button> (${esc(L.describeCopy(w))})</li>`).join('')}</ul>${s.ongoingUnread.length > 6 ? `<button type="button" class="fs-link" data-show-ongoing>Show all ${num(s.ongoingUnread.length)} in progress</button>` : ''}` : '<p class="fs-small">None.</p>'}`;
  $('dups-body').innerHTML = state.dups.length ? `<p class="fs-small">Fics that share an AO3 work id. Nothing is deleted or changed; this only shows which copy to keep.</p>${state.dups.map(g => `<div class="fs-dupgroup"><h4>${esc(g.title)} <span class="fs-small">(work ${esc(g.ao3Id)})</span></h4><ul>${g.items.map(i => `<li>${i.keep ? '<span class="keep">Keep:</span>' : 'Older or repeated:'} <button type="button" class="fs-link" data-id="${i.work.id}">${esc(i.work.name)}</button> (${i.work.format.toUpperCase()}, ${esc(L.describeCopy(i.work))}). ${esc(i.reason)}.</li>`).join('')}</ul></div>`).join('')}<p><button type="button" class="fs-btn fs-btn-plain fs-btn-sm" id="btn-only-dups">Show only these in the library</button></p>`
    : '<p class="fs-small">No two files share an AO3 work id. Two fics with the same title but different ids are two different works and are not listed here.</p>';
}

/* ------------------------------------------------------------------ actions */
function openDetail(id, { focus = true } = {}) {
  state.open = id;
  renderLibrary();
  const t = $('detail-title');
  if (t && focus) { t.scrollIntoView({ block: 'nearest' }); t.focus({ preventScroll: true }); }
}
async function readWork(w, opts = {}) {
  const src = srcOf(w);
  const ok = await reader.open(w, src, { ...opts, opener: document.activeElement });
  if (ok) renderExtra();
}
async function loadFull(w) { return loadWork(srcOf(w)); }
async function saveOne(w, kind) {
  try {
    const full = await loadFull(w);
    full.meta.ao3Id = full.meta.ao3Id || w.ao3Id;
    if (kind === 'epub') download(workFileName(full.meta, 'epub'), await workToEpub(full), 'application/epub+zip');
    else if (kind === 'text') download(workFileName(full.meta, 'txt'), workToText(full), 'text/plain;charset=utf-8');
    else download(workFileName(full.meta, 'html'), workToHtml(full), 'text/html;charset=utf-8');
    toast(kind === 'epub' ? 'EPUB saved.' : kind === 'text' ? 'Text saved.' : 'Printable page saved.');
  } catch { toast('This file could not be converted.'); }
}
async function openPdf(w) {
  const src = srcOf(w);
  if (!src) return;
  const blob = new Blob([await readBlob(src)], { type: 'application/pdf' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url; a.target = '_blank'; a.rel = 'noopener';
  document.body.appendChild(a); a.click(); a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 600000);
}
function addFilter(facet, value) {
  if (facet === 'rating' || facet === 'language') { if (!state.filters[facet].includes(value)) state.filters[facet].push(value); }
  else if (!state.filters.lists[facet].inc.includes(value)) state.filters.lists[facet].inc.push(value);
  state.fxOpen.add(facet);
  refresh();
  $('results').scrollIntoView({ block: 'nearest' });
}
function chip(facet, value, mode) {
  const key = v => v.toLowerCase();
  const del = (arr, v) => { const i = arr.findIndex(a => key(a) === key(v)); if (i >= 0) arr.splice(i, 1); return i >= 0; };
  if (facet === 'rating' || facet === 'language') { if (!del(state.filters[facet], value)) state.filters[facet].push(value); } else {
    const l = state.filters.lists[facet];
    const target = mode === 'inc' ? l.inc : l.exc;
    const other = mode === 'inc' ? l.exc : l.inc;
    if (!del(target, value)) { target.push(value); del(other, value); }
  }
  refresh();
}
async function runTidy() {
  if (!needPro('Sorting the whole library into one ZIP is part of Ficshelf Pro.')) return;
  const items = state.works.filter(w => srcOf(w)).map(w => ({ work: w, src: srcOf(w) }));
  if (!items.length) { toast('Add the files first: the shelf was remembered without them.'); return; }
  proNote('Building the ZIP in your browser. This can take a while for a big library.');
  $('btn-tidy').disabled = true;
  try {
    const r = await tidyZip(items, { readKeys: readKeys(state.works), onProgress: p => proNote(`Building the ZIP: ${num(p.done)} of ${num(p.total)}.`) });
    download(r.name, r.blob, 'application/zip');
    toast(`Tidy ZIP saved: ${num(r.converted)} EPUB${r.converted === 1 ? '' : 's'}${r.failed.length ? `, ${r.failed.length} kept as they were` : ''}.`);
  } catch { toast('The ZIP could not be built.'); } finally { $('btn-tidy').disabled = false; proNote(); }
}
async function runMerge() {
  if (!needPro('Merging fics into one EPUB is part of Ficshelf Pro.')) return;
  const items = [...state.sel].map(id => state.works.find(w => w.id === id)).filter(w => w && srcOf(w) && w.format !== 'pdf' && !w.damaged).map(w => ({ work: w, src: srcOf(w) }));
  if (!items.length) { toast('Select fics first: tick them in the table, or use Add to selection on a fic.'); return; }
  if (items.length > 200) { toast('Merge up to 200 fics at a time.'); return; }
  const names = [...new Set(items.flatMap(i => i.work.series.map(s => s.name)))];
  const title = names.length === 1 && items.every(i => i.work.series.some(s => s.name === names[0])) ? names[0] : 'Ficshelf selection';
  items.sort((a, b) => ((a.work.series.find(s => s.name === title) || {}).part || 0) - ((b.work.series.find(s => s.name === title) || {}).part || 0) || a.work.title.localeCompare(b.work.title));
  proNote('Merging in your browser.');
  try {
    const blob = await mergeToEpub(items, { title, onProgress: p => proNote(`Merging: ${num(p.done)} of ${num(p.total)}.`) });
    download(workFileName({ title, authors: [], ao3Id: null }, 'epub'), blob, 'application/epub+zip');
    toast(`One EPUB from ${num(items.length)} fic${items.length === 1 ? '' : 's'} saved.`);
  } catch { toast('These could not be merged.'); } finally { proNote(); }
}
function catalog(kind) {
  if (!needPro('Saving the catalog is part of Ficshelf Pro.')) return;
  const works = state.works;
  if (kind === 'csv') download(`ficshelf-library-${isoDay(new Date())}.csv`, libraryCsv(works), 'text/csv;charset=utf-8');
  else if (kind === 'json') download(`ficshelf-library-${isoDay(new Date())}.json`, libraryJson(works), 'application/json');
  else download(`ficshelf-reading-list-${isoDay(new Date())}.md`, readingListMd(works, { readKeys: readKeys(works) }), 'text/markdown;charset=utf-8');
  toast('Catalog saved.');
}

/* ---------- full-text search (Pro) ---------- */
let ftsJob = 0;
function ftsSearch() {
  const qs = $('fts-q').value.trim();
  const query = parseQuery(qs);
  if (!query.terms.length) { $('fts-status').textContent = 'Type a word or a "quoted phrase" first.'; return; }
  const items = state.works.filter(w => w.format !== 'pdf' && !w.damaged && srcOf(w)).map(w => ({ id: w.id, src: srcOf(w) }));
  if (!items.length) { $('fts-status').textContent = 'There is no readable file on the shelf yet. Choose the folder first.'; return; }
  $('fts-results').innerHTML = '';
  $('btn-fts-go').disabled = true; $('btn-fts-cancel').disabled = false;
  let hits = 0;
  const hit = row => {
    hits++;
    const w = state.works.find(x => x.id === row.id);
    const li = document.createElement('li');
    li.className = 'fs-hit';
    li.innerHTML = `<b>${esc(w.title)}</b> <span class="by">${w.authors.length ? `by ${esc(w.authors.join(', '))}` : ''} (${num(row.count)}${row.count >= 500 ? '+' : ''} match${row.count === 1 ? '' : 'es'})</span>${row.snippets.map(s => `<blockquote>${esc(s.before)} <mark>${esc(s.hit)}</mark> ${esc(s.after)}${s.title ? ` <small>(${esc(s.title)})</small>` : ''}</blockquote>`).join('')}<button type="button" class="fs-btn fs-btn-plain fs-btn-sm" data-fts-open="${w.id}">Read it at the first match</button>`;
    $('fts-results').append(li);
  };
  const finish = (cancelled, scanned) => {
    $('btn-fts-go').disabled = false; $('btn-fts-cancel').disabled = true;
    $('fts-status').textContent = `${cancelled ? 'Stopped. ' : ''}${num(hits)} fic${hits === 1 ? '' : 's'} with ${hits === 1 ? 'this' : 'these'} words, from ${num(scanned)} searched.`;
  };
  const w = getWorker();
  if (w) {
    const id = ++jobSeq; ftsJob = id;
    jobs.set(id, m => {
      if (m.type === 'hit') hit(m.row);
      else if (m.type === 'progress') $('fts-status').textContent = `Searching: ${num(m.done)} of ${num(m.total)} fics read. ${num(hits)} found so far.`;
      else { jobs.delete(id); if (m.type === 'done') finish(m.cancelled, m.scanned); else { $('btn-fts-go').disabled = false; $('btn-fts-cancel').disabled = true; $('fts-status').textContent = 'The search could not run.'; } }
    });
    w.postMessage({ type: 'search', id, items, query: qs });
  } else {
    localCancel = false;
    searchLibrary(items, qs, localBlooms, { isCancelled: () => localCancel, onResult: hit, onProgress: p => { $('fts-status').textContent = `Searching: ${num(p.done)} of ${num(p.total)} fics read.`; } })
      .then(r => finish(r.cancelled, r.scanned));
  }
}
const localBlooms = new Map();

/* ------------------------------------------------------------------ events */
async function droppedFiles(dt) {
  const entries = [...(dt.items || [])].map(i => (i.webkitGetAsEntry ? i.webkitGetAsEntry() : null)).filter(Boolean);
  if (!entries.length || entries.every(e => e.isFile)) return [...(dt.files || [])].map(f => ({ path: f.name, file: f }));
  const out = [];
  const walk = async (entry, prefix) => {
    if (entry.isFile) { const f = await new Promise((res, rej) => entry.file(res, rej)); out.push({ path: prefix + f.name, file: f }); return; }
    const reader = entry.createReader();
    for (;;) {
      const batch = await new Promise((res, rej) => reader.readEntries(res, rej));
      if (!batch.length) break;
      for (const e of batch) await walk(e, `${prefix}${entry.name}/`);
    }
  };
  for (const e of entries) await walk(e, '');
  return out;
}
const fromInput = files => [...files].map(f => ({ path: f.webkitRelativePath || f.name, file: f }));
async function walkHandle(dir, prefix, out) {
  for await (const [name, h] of dir.entries()) {
    if (h.kind === 'file') { if (/\.(html?|epub|pdf|zip)$/i.test(name)) out.push({ path: `${prefix}${name}`, file: await h.getFile() }); } else await walkHandle(h, `${prefix}${name}/`, out);
  }
}
async function openHandle(h, remember) {
  try {
    const perm = h.requestPermission ? await h.requestPermission({ mode: 'read' }) : 'granted';
    if (perm !== 'granted') { toast('Permission to read the folder was not given.'); return; }
    const items = [];
    await walkHandle(h, `${h.name}/`, items);
    if (remember && remembering()) store.saveHandle(h);
    await addFiles(items);
  } catch { toast('That folder could not be opened.'); }
}
function wire() {
  const fileInput = $('file-input'), folderInput = $('folder-input');
  $('btn-folder').addEventListener('click', () => folderInput.click());
  $('btn-files').addEventListener('click', () => fileInput.click());
  $('btn-add').addEventListener('click', () => { $('panel').scrollIntoView({ block: 'center' }); $('drop-title').focus({ preventScroll: true }); });
  fileInput.addEventListener('change', () => { addFiles(fromInput(fileInput.files)); fileInput.value = ''; });
  folderInput.addEventListener('change', () => { addFiles(fromInput(folderInput.files)); folderInput.value = ''; });
  $('btn-sample').addEventListener('click', () => sampleFiles().then(f => addFiles(f, { sample: true })));
  $('btn-error-sample').addEventListener('click', () => sampleFiles().then(f => addFiles(f, { sample: true })));
  $('btn-retry').addEventListener('click', () => { stage('idle'); $('drop-title').focus(); });
  $('btn-cancel').addEventListener('click', () => { cancelWork(); $('busy-sub').textContent = 'Stopping.'; });
  if (typeof window.showDirectoryPicker === 'function') {
    $('folder-api').hidden = false;
    $('btn-remember-folder').addEventListener('click', async () => { try { const h = await window.showDirectoryPicker({ mode: 'read' }); await openHandle(h, true); } catch { /* cancelled or not allowed */ } });
    $('btn-reconnect').addEventListener('click', () => { if (state.handle) openHandle(state.handle, true); });
  }
  $('remember').addEventListener('change', () => { ls.set('ficshelf:remember', $('remember').checked ? '1' : '0'); if ($('remember').checked) persist(); else { store.forget(); } });
  let forgetArm = 0;
  $('btn-forget').addEventListener('click', () => {
    if (!forgetArm) { $('btn-forget').textContent = 'Yes, forget it'; forgetArm = setTimeout(() => { forgetArm = 0; $('btn-forget').textContent = 'Forget this shelf'; }, 5000); return; }
    clearTimeout(forgetArm); forgetArm = 0; $('btn-forget').textContent = 'Forget this shelf';
    state.works = []; state.sources.clear(); state.sel.clear(); state.open = null; state.memory.restored = 0; state.filters = L.emptyFilters(); state.notices = [];
    store.forget(); if (worker) worker.postMessage({ type: 'forget' }); localBlooms.clear();
    $('lib').hidden = true; $('reconnect').hidden = true; stage('idle');
    toast('The shelf was forgotten. Your files were not touched.');
    $('drop-title').focus();
  });

  const drop = $('drop');
  const over = on => drop.classList.toggle('is-over', on);
  for (const el of [drop, $('panel')]) {
    el.addEventListener('dragover', e => { e.preventDefault(); over(true); });
    el.addEventListener('dragleave', () => over(false));
    el.addEventListener('drop', async e => { e.preventDefault(); over(false); addFiles(await droppedFiles(e.dataTransfer)); });
  }

  $('q').addEventListener('input', e => { state.filters.q = e.target.value; refreshSoon(); });
  $('sort').addEventListener('change', e => { state.sort = e.target.value; refresh(); });
  $('btn-dir').addEventListener('click', () => { state.dir = state.dir === 'asc' ? 'desc' : 'asc'; const b = $('btn-dir'); b.textContent = state.dir === 'asc' ? 'Ascending' : 'Descending'; b.dataset.dir = state.dir; b.setAttribute('aria-label', `Sort direction: ${state.dir === 'asc' ? 'ascending' : 'descending'}`); refresh(); });
  $('btn-view-shelf').addEventListener('click', () => { state.view = 'shelf'; renderLibrary(); });
  $('btn-view-table').addEventListener('click', () => { state.view = 'table'; renderLibrary(); });
  $('btn-filters').addEventListener('click', () => { const lay = document.querySelector('.fs-layout'); const hide = !lay.classList.contains('no-facets'); lay.classList.toggle('no-facets', hide); $('btn-filters').setAttribute('aria-expanded', String(!hide)); });
  $('more').addEventListener('click', () => { state.page++; renderLibrary(); });

  $('facets').addEventListener('click', e => {
    const c = e.target.closest('[data-chip]');
    if (c) { chip(c.dataset.chip, c.dataset.v, c.dataset.m); return; }
    const m = e.target.closest('[data-fxmore]');
    if (m) { state.fxLimit[m.dataset.fxmore] = (state.fxLimit[m.dataset.fxmore] || 8) + 20; renderFacets(); return; }
    if (e.target.closest('#btn-clear-filters')) { state.filters = L.emptyFilters(); $('q').value = ''; refresh(); }
  });
  $('facets').addEventListener('toggle', e => { const d = e.target; if (d.dataset && d.dataset.fx) { if (d.open) state.fxOpen.add(d.dataset.fx); else state.fxOpen.delete(d.dataset.fx); } }, true);
  $('facets').addEventListener('input', e => {
    const t = e.target;
    if (t.dataset.fxq) { state.fxQ[t.dataset.fxq] = t.value; renderFacets(); return; }
    if (t.dataset.f && (t.type === 'number' || t.type === 'date')) { state.filters[t.dataset.f] = t.value; refreshSoon(); }
  });
  $('facets').addEventListener('change', e => {
    const t = e.target;
    if (t.dataset.mode) { state.filters.lists[t.dataset.mode].mode = t.value; refresh(); return; }
    if (t.dataset.status) { state.filters.status = t.dataset.status; refresh(); return; }
    if (t.dataset.format) { const a = state.filters.format; const i = a.indexOf(t.dataset.format); if (t.checked && i < 0) a.push(t.dataset.format); if (!t.checked && i >= 0) a.splice(i, 1); refresh(); return; }
    if (t.dataset.f === 'onlyDup') { state.filters.onlyDup = t.checked; refresh(); return; }
    if (t.dataset.f === 'series') { state.filters.series = t.value; refresh(); }
  });

  document.addEventListener('click', e => {
    const t = e.target;
    const spine = t.closest('.spine, .t, [data-id]');
    if (spine && spine.dataset.id && !t.closest('#reader')) { openDetail(spine.dataset.id); return; }
    const add = t.closest('[data-add]');
    if (add) { addFilter(add.dataset.add, add.dataset.v); return; }
    const sr = t.closest('[data-series]');
    if (sr) { state.filters.series = sr.dataset.series; state.fxOpen.add('more'); refresh(); return; }
    const act = t.closest('[data-act]');
    if (act) {
      const w = state.works.find(x => x.id === state.open);
      if (!w) return;
      const a = act.dataset.act;
      if (a === 'read') readWork(w);
      else if (a === 'epub' || a === 'text' || a === 'html') saveOne(w, a);
      else if (a === 'pdf') openPdf(w);
      else if (a === 'select') { if (state.sel.has(w.id)) state.sel.delete(w.id); else state.sel.add(w.id); renderLibrary(); }
      else if (a === 'select-series') { for (const x of state.works) if (x.series.some(s => w.series.some(y => y.name === s.name))) state.sel.add(x.id); renderLibrary(); toast(`${num(state.sel.size)} selected.`); }
      else if (a === 'close') { state.open = null; renderLibrary(); }
      return;
    }
    const so = t.closest('[data-show-ongoing]');
    if (so) { state.filters.status = 'ongoing'; refresh(); return; }
    if (t.closest('#btn-only-dups')) { state.filters.onlyDup = true; state.fxOpen.add('more'); refresh(); $('results').scrollIntoView({ block: 'nearest' }); return; }
    const fo = t.closest('[data-fts-open]');
    if (fo) { const w = state.works.find(x => x.id === fo.dataset.ftsOpen); if (w) readWork(w, { query: $('fts-q').value }); }
  });
  $('results').addEventListener('change', e => {
    const c = e.target.closest('[data-sel]');
    if (c) { if (c.checked) state.sel.add(c.dataset.sel); else state.sel.delete(c.dataset.sel); renderSel(); }
  });
  $('btn-sel-clear').addEventListener('click', () => { state.sel.clear(); renderLibrary(); });
  $('btn-tidy').addEventListener('click', runTidy);
  $('btn-merge').addEventListener('click', runMerge);
  $('btn-csv').addEventListener('click', () => catalog('csv'));
  $('btn-json').addEventListener('click', () => catalog('json'));
  $('btn-md').addEventListener('click', () => catalog('md'));
  $('btn-fts').addEventListener('click', () => { if (!needPro('Searching inside every fic is part of Ficshelf Pro.')) return; $('fts').hidden = false; $('fts-title').focus(); });
  $('btn-fts-go').addEventListener('click', ftsSearch);
  $('fts-q').addEventListener('keydown', e => { if (e.key === 'Enter') ftsSearch(); });
  $('btn-fts-cancel').addEventListener('click', () => { localCancel = true; if (worker) worker.postMessage({ type: 'cancel' }); $('fts-status').textContent = 'Stopping.'; });
  window.addEventListener('ficshelf:closed', () => { renderExtra(); });
}

/* ------------------------------------------------------------------ the hero shelf */
function heroSpines() {
  const g = $('hero-spines');
  if (!g || g.childElementCount) return;
  const titles = ['A Ledger of Small Hours', 'Salt on the Stair', 'Night Shift at Harbour Lights', 'Quillfeather Reunion', 'The Tidewater Letters', 'Cold Iron Season', 'Quiet Hours'];
  let x = 6;
  g.innerHTML = titles.map((t, i) => {
    const w = [44, 36, 30, 40, 58, 50, 28][i], h = [118, 104, 92, 110, 124, 100, 88][i];
    const out = `<g transform="translate(${x} ${136 - h})"><rect width="${w}" height="${h}" rx="3" fill="${L.SPINE_COLORS[(i * 3) % 8]}"/><rect y="10" width="${w}" height="4" fill="#f2a65a"/><text transform="translate(${w / 2 + 5} ${h - 14}) rotate(-90)" fill="#fbf4ea" font-size="12" font-family="system-ui,sans-serif">${esc(fit(t, (h - 40) / 6.6))}</text></g>`;
    x += w + 6;
    return out;
  }).join('');
}

/* ------------------------------------------------------------------ test hooks */
window.__ficshelf = {
  get state() { return state; },
  get worker() { return getWorker(); },
  addFiles: items => addFiles(items),
  sample: () => sampleFiles().then(f => addFiles(f, { sample: true })),
  /* lists files without touching the shelf: { ms, count, heap } for the budget tests */
  async scanTimed(files) {
    const t0 = performance.now();
    let peak = 0;
    const timer = setInterval(() => { if (performance.memory) peak = Math.max(peak, performance.memory.usedJSHeapSize); }, 50);
    const r = await runScan(files.map(f => ({ path: f.webkitRelativePath || f.name, file: f })));
    clearInterval(timer);
    return { ms: Math.round(performance.now() - t0), count: r.works.length, heap: Math.max(peak, performance.memory ? performance.memory.usedJSHeapSize : 0), titles: r.works.slice(0, 3).map(w => w.title) };
  },
  async cancelTimed(files, afterMs) {
    const t0 = performance.now();
    let cancelledAt = 0;
    setTimeout(() => { cancelledAt = performance.now(); cancelWork(); }, afterMs);
    const r = await runScan(files.map(f => ({ path: f.name, file: f })));
    return { ms: Math.round(performance.now() - t0), cancelled: r.cancelled, count: r.works.length, afterCancel: Math.round(performance.now() - cancelledAt) };
  },
  tidy: async () => (await tidyZip(state.works.filter(w => srcOf(w)).map(w => ({ work: w, src: srcOf(w) })), { date: new Date(Date.UTC(2026, 9, 31, 12)) })),
  merge: async ids => mergeToEpub(ids.map(id => state.works.find(w => w.id === id)).map(w => ({ work: w, src: srcOf(w) })), { title: 'Merged', date: new Date(Date.UTC(2026, 9, 31, 12)) }),
  csv: () => libraryCsv(state.works),
  json: () => libraryJson(state.works, { date: new Date(Date.UTC(2026, 9, 31, 12)) }),
  md: () => readingListMd(state.works, { date: new Date(Date.UTC(2026, 9, 31, 12)) }),
  epubOf: async id => workToEpub(await loadFull(state.works.find(w => w.id === id)), { date: new Date(Date.UTC(2026, 9, 31, 12)) }),
  search: async q => { const out = []; await searchLibrary(state.works.filter(w => w.format !== 'pdf' && srcOf(w)).map(w => ({ id: w.id, src: srcOf(w) })), q, localBlooms, { onResult: r => out.push(r) }); return out; },
  heap: () => (performance.memory ? performance.memory.usedJSHeapSize : 0),
};

/* ------------------------------------------------------------------ start */
reader = createReader({
  libraryOpen: (ao3Id, probe) => { const w = state.works.find(x => x.ao3Id === ao3Id && x.format !== 'pdf' && srcOf(x)); return probe ? !!w : w ? { rec: w, src: srcOf(w) } : null; },
  download, toast,
});
wire();
heroSpines();
if (typeof matchMedia === 'function' && matchMedia('(max-width: 700px)').matches) $('pro-bar').open = false;
restore();
if (document.readyState === 'complete') setupPro(); else window.addEventListener('load', setupPro);
if ('serviceWorker' in navigator && location.protocol.startsWith('http') && !navigator.webdriver) {
  window.addEventListener('load', () => { navigator.serviceWorker.register('/ao3-offline-reader/sw.js', { scope: '/ao3-offline-reader/' }).catch(() => {}); });
}
window.__ficshelf.registerSw = () => navigator.serviceWorker.register('/ao3-offline-reader/sw.js', { scope: '/ao3-offline-reader/' });
window.__ficshelf.SAMPLE_COUNT = SAMPLE_COUNT;
