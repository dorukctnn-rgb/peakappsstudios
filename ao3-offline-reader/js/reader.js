/* The reader: one fic at a time in a clean page. Chapters, text size, light, dark and sepia themes, line spacing, bold, a remembered
 * place (chapter and scroll position, in this browser's local storage), the arrow keys, printing, and the exports of the one fic
 * (EPUB, plain text, a printable page). A search result opens it at the first match, marked, with a Next match button.
 * The chapter text is the cleaned copy from work.js: no script, no outside image, no link to AO3. Nothing here touches the network. */
import { loadWork, chapterHtml, chapterText, workToEpub, workToText, workToHtml, workFileName } from './work.js';
import { parseQuery, foldPlain } from './search.js';
import { workKey } from './library.js';
import { escapeHtml as esc } from './html.js';

const $ = id => document.getElementById(id);
const SETTINGS = 'ficshelf:reader';
const POS = id => `ficshelf:pos:${id}`;
const store = {
  get(k) { try { return JSON.parse(localStorage.getItem(k) || 'null'); } catch { return null; } },
  set(k, v) { try { localStorage.setItem(k, JSON.stringify(v)); } catch { /* private mode */ } },
};
export function readPosition(rec) { return store.get(POS(workKey(rec))); }
export function readKeys(records) { const s = new Set(); for (const r of records) if (readPosition(r)) s.add(workKey(r)); return s; }

const DEFAULTS = { size: 20, theme: 'light', spacing: '1.7', bold: false };
const mq = typeof matchMedia === 'function' ? matchMedia('(prefers-color-scheme: dark)') : null;

export function createReader({ libraryOpen, download, toast }) {
  const st = { rec: null, work: null, i: 0, query: null, opener: null, key: '', marks: [], saveTimer: 0 };
  let settings = { ...DEFAULTS, ...(store.get(SETTINGS) || {}) };
  if (!store.get(SETTINGS) && mq && mq.matches) settings.theme = 'dark';

  function applySettings() {
    const r = $('reader');
    r.dataset.theme = settings.theme;
    r.style.setProperty('--rd-size', `${settings.size}px`);
    r.style.setProperty('--rd-lh', settings.spacing);
    r.style.setProperty('--rd-weight', settings.bold ? '700' : '400');
    $('rd-theme').value = settings.theme; $('rd-spacing').value = settings.spacing; $('rd-bold').checked = !!settings.bold;
    store.set(SETTINGS, settings);
  }
  const savePos = () => { if (st.rec) store.set(POS(st.key), { chapter: st.i, y: Math.round($('rd-scroll').scrollTop), t: Date.now() }); };

  /* wraps the words of the query in <mark> inside the text nodes of the page */
  function highlight(root) {
    if (!st.query) return;
    const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT);
    const nodes = [];
    while (walker.nextNode()) nodes.push(walker.currentNode);
    for (const node of nodes) {
      const folded = foldPlain(node.data);
      const ranges = [];
      for (const t of st.query.terms) { t.re.lastIndex = 0; let m; while ((m = t.re.exec(folded))) { ranges.push([m.index, m.index + m[0].length]); if (!m[0].length) t.re.lastIndex++; } }
      if (!ranges.length) continue;
      ranges.sort((a, b) => a[0] - b[0]);
      const merged = [];
      for (const r of ranges) { const last = merged[merged.length - 1]; if (last && r[0] <= last[1]) last[1] = Math.max(last[1], r[1]); else merged.push(r.slice()); }
      const frag = document.createDocumentFragment();
      let at = 0;
      for (const [a, b] of merged) {
        if (a > at) frag.append(node.data.slice(at, a));
        const mk = document.createElement('mark'); mk.textContent = node.data.slice(a, b); frag.append(mk); at = b;
      }
      if (at < node.data.length) frag.append(node.data.slice(at));
      node.replaceWith(frag);
    }
  }
  const chapterHas = i => { if (!st.query) return false; const t = foldPlain(chapterText(st.work, i)); return st.query.terms.some(x => { x.re.lastIndex = 0; return x.re.test(t); }); };

  function show(i, { y = 0, mark = false } = {}) {
    const w = st.work;
    st.i = Math.max(0, Math.min(w.chapters.length - 1, i));
    const c = w.chapters[st.i];
    const body = $('rd-body');
    body.innerHTML = chapterHtml(w, st.i, { libraryHas: id => !!libraryOpen(id, true) });
    $('rd-chapter-title').textContent = w.chapters.length > 1 ? c.title : '';
    $('rd-chapter-title').hidden = w.chapters.length <= 1;
    const sel = $('rd-chapter');
    if (sel.options.length !== w.chapters.length) sel.innerHTML = w.chapters.map((x, k) => `<option value="${k}">${esc(x.title)}</option>`).join('');
    sel.value = String(st.i);
    sel.parentElement.hidden = w.chapters.length <= 1;
    $('rd-pos').textContent = w.chapters.length > 1 ? `Chapter ${st.i + 1} of ${w.chapters.length}` : '';
    for (const id of ['rd-prev', 'rd-prev2']) $(id).disabled = st.i === 0;
    for (const id of ['rd-next', 'rd-next2']) $(id).disabled = st.i >= w.chapters.length - 1;
    for (const id of ['rd-prev', 'rd-next', 'rd-prev2', 'rd-next2']) $(id).hidden = w.chapters.length <= 1;
    $('rd-page').lang = (document.documentElement.lang || 'en');
    const lang = (w.meta.language || '').toLowerCase();
    const rtl = /العربية|עברית|فارسی|arabic|hebrew|persian|urdu/.test(lang);
    body.dir = rtl ? 'rtl' : 'auto';
    st.marks = [];
    if (st.query) { highlight(body); st.marks = [...body.querySelectorAll('mark')]; }
    $('rd-find-next').hidden = !st.query;
    const sc = $('rd-scroll');
    if (mark && st.marks[0]) st.marks[0].scrollIntoView({ block: 'center' }); else sc.scrollTop = y;
    savePos();
  }
  function nextMatch() {
    if (!st.query) return;
    const sc = $('rd-scroll');
    const top = sc.getBoundingClientRect().top;
    const next = st.marks.find(m => m.getBoundingClientRect().top > top + 80);
    if (next) { next.scrollIntoView({ block: 'center' }); return; }
    for (let k = st.i + 1; k < st.work.chapters.length; k++) if (chapterHas(k)) { show(k, { mark: true }); return; }
    for (let k = 0; k <= st.i; k++) if (chapterHas(k)) { show(k, { mark: true }); return; }
    toast('No more matches in this fic.');
  }

  async function open(rec, src, { query = '', chapter = null, opener = null } = {}) {
    if (!src) { toast('Add this fic\'s file again to read it.'); return false; }
    if (rec.format === 'pdf') return false;
    let work;
    try { work = await loadWork(src); } catch (e) { toast(e && e.code === 'not-text' ? 'This file cannot be read as text.' : 'This file could not be opened.'); return false; }
    st.rec = rec; st.work = work; st.key = workKey(rec); st.opener = opener || document.activeElement;
    st.query = query ? parseQuery(query) : null;
    if (st.query && !st.query.terms.length) st.query = null;
    $('rd-title').textContent = work.meta.title || rec.title;
    $('rd-by').textContent = work.meta.authors.length ? `by ${work.meta.authors.join(', ')}` : '';
    $('rd-chapter').innerHTML = '';
    const pos = readPosition(rec);
    let i = chapter != null ? chapter : pos ? pos.chapter : 0;
    let mark = false;
    if (st.query) { const k = Array.from({ length: work.chapters.length }, (_, n) => n).find(chapterHas); if (k != null) { i = k; mark = true; } }
    $('reader').hidden = false;
    document.body.classList.add('reading');
    applySettings();
    show(i, { y: !mark && pos && pos.chapter === i ? pos.y : 0, mark });
    if (work.truncated) toast('This file is very large: only the first part is shown.');
    $('rd-scroll').focus({ preventScroll: true });
    return true;
  }
  function close() {
    if ($('reader').hidden) return;
    savePos();
    $('reader').hidden = true;
    document.body.classList.remove('reading');
    st.work = null;
    if (st.opener && document.contains(st.opener)) st.opener.focus({ preventScroll: true }); else $('lib-title').focus({ preventScroll: true });
    window.dispatchEvent(new CustomEvent('ficshelf:closed'));
  }
  const go = d => { if (st.work) show(st.i + d); };

  function wire() {
    $('rd-back').addEventListener('click', close);
    for (const id of ['rd-prev', 'rd-prev2']) $(id).addEventListener('click', () => go(-1));
    for (const id of ['rd-next', 'rd-next2']) $(id).addEventListener('click', () => go(1));
    $('rd-chapter').addEventListener('change', e => show(Number(e.target.value)));
    $('rd-smaller').addEventListener('click', () => { settings.size = Math.max(14, settings.size - 2); applySettings(); });
    $('rd-larger').addEventListener('click', () => { settings.size = Math.min(34, settings.size + 2); applySettings(); });
    $('rd-theme').addEventListener('change', e => { settings.theme = e.target.value; applySettings(); });
    $('rd-spacing').addEventListener('change', e => { settings.spacing = e.target.value; applySettings(); });
    $('rd-bold').addEventListener('change', e => { settings.bold = e.target.checked; applySettings(); });
    $('rd-find-next').addEventListener('click', nextMatch);
    $('rd-print').addEventListener('click', () => window.print());
    $('rd-epub').addEventListener('click', async () => { const b = await workToEpub(st.work); download(workFileName({ ...st.work.meta, ao3Id: st.work.meta.ao3Id || st.rec.ao3Id }, 'epub'), b, 'application/epub+zip'); toast('EPUB saved.'); });
    $('rd-text').addEventListener('click', () => { download(workFileName({ ...st.work.meta, ao3Id: st.work.meta.ao3Id || st.rec.ao3Id }, 'txt'), workToText(st.work), 'text/plain;charset=utf-8'); toast('Text saved.'); });
    $('rd-html').addEventListener('click', () => { download(workFileName({ ...st.work.meta, ao3Id: st.work.meta.ao3Id || st.rec.ao3Id }, 'html'), workToHtml(st.work), 'text/html;charset=utf-8'); toast('Printable page saved.'); });
    $('rd-scroll').addEventListener('scroll', () => { clearTimeout(st.saveTimer); st.saveTimer = setTimeout(savePos, 300); });
    $('rd-body').addEventListener('click', e => {
      const a = e.target.closest('a[data-work]');
      if (a) { e.preventDefault(); const id = a.dataset.work; const target = libraryOpen(id, false); if (target) open(target.rec, target.src, { opener: st.opener }); }
    });
    document.addEventListener('keydown', e => {
      if ($('reader').hidden) return;
      const tag = (e.target.tagName || '').toLowerCase();
      if (e.key === 'Escape') { e.preventDefault(); close(); return; }
      if (tag === 'select' || tag === 'input' || e.ctrlKey || e.metaKey || e.altKey) {
        if (e.key !== 'Tab') return;
      }
      if (e.key === 'Tab') {
        const f = [...$('reader').querySelectorAll('button:not([disabled]):not([hidden]), select, input, a[href], [tabindex="0"], #rd-scroll')].filter(x => !x.closest('[hidden]') && x.offsetParent !== null);
        if (!f.length) return;
        const first = f[0], last = f[f.length - 1];
        if (e.shiftKey && document.activeElement === first) { e.preventDefault(); last.focus(); } else if (!e.shiftKey && document.activeElement === last) { e.preventDefault(); first.focus(); }
        return;
      }
      if (e.key === 'ArrowRight') { e.preventDefault(); go(1); } else if (e.key === 'ArrowLeft') { e.preventDefault(); go(-1); }
      else if (e.key === '+' || e.key === '=') { settings.size = Math.min(34, settings.size + 2); applySettings(); } else if (e.key === '-') { settings.size = Math.max(14, settings.size - 2); applySettings(); }
    });
    applySettings();
  }
  wire();
  return { open, close, get state() { return st; }, settings: () => settings, show };
}
