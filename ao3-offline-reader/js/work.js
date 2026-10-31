/* One work, opened: the reader's pages, plain text, a printable page and the clean EPUB (one work, or several in one book).
 * loadWork() reads a whole HTML download or EPUB into { meta, summary, notes, endNotes, chapters: [{ title, nodes, notes, endNotes }] }
 * (the nodes are the parsed tree of html.js; clean() writes them safe). A PDF is never read as text. Nothing here touches the network. */
import { readText, formatOf } from './source.js';
import { readHtmlWork, fold } from './parse.js';
import { readEpubWork, buildEpub, langCode, isRtl } from './epub.js';
import { clean, htmlToText, escapeHtml as esc, escapeAttr as escA } from './html.js';

export const MAX_READ = 24 * 1024 * 1024;
export async function loadWork(src) {
  const f = formatOf(src);
  if (f === 'epub') return readEpubWork(src);
  if (f === 'html') {
    const { text, cut } = await readText(src, MAX_READ);
    const w = readHtmlWork(text, src.name);
    w.truncated = w.truncated || cut;
    return w;
  }
  const e = new Error('not readable as text');
  e.code = 'not-text';
  throw e;
}

/* ------------------------------------------------------------------ the reader's pages */
const notesBlock = (nodes, label, cls, opts) => (nodes && nodes.length ? `<aside class="${cls}"><p class="label">${label}</p>${clean(nodes, opts).html}</aside>` : '');
/* The HTML of chapter i for the reader: the work's summary and notes above the first chapter, its end notes below the last. */
export function chapterHtml(work, i, { libraryHas = null } = {}) {
  const opts = { link: 'reader', libraryHas };
  const c = work.chapters[i];
  if (!c) return '';
  let h = '';
  if (i === 0) {
    h += notesBlock(work.summary, 'Summary', 'notes', opts);
    h += notesBlock(work.notes, 'Notes', 'notes', opts);
  }
  h += notesBlock(c.notes, work.chapters.length > 1 ? 'Chapter notes' : 'Notes', 'notes', opts);
  const body = clean(c.nodes, opts).html;
  h += body.trim() ? body : '<p class="empty">This chapter is empty in the file.</p>';
  h += notesBlock(c.endNotes, 'End notes', 'notes', opts);
  if (i === work.chapters.length - 1) h += notesBlock(work.endNotes, 'End notes', 'notes', opts);
  return h;
}
export function chapterText(work, i) {
  const c = work.chapters[i];
  return c ? htmlToText(clean(c.nodes, {}).html) : '';
}

/* ------------------------------------------------------------------ plain text */
export function workToText(work) {
  const m = work.meta;
  const L = [m.title, m.authors.length ? `by ${m.authors.join(', ')}` : '', ''];
  const tags = [['Rating', m.rating], ['Fandom', m.fandoms.join(', ')], ['Relationship', m.relationships.join(', ')], ['Characters', m.characters.join(', ')], ['Tags', m.tags.join(', ')], ['Language', m.language]];
  for (const [k, v] of tags) if (v) L.push(`${k}: ${v}`);
  if (m.words != null) L.push(`Words: ${m.words}${m.chapters.have != null ? `   Chapters: ${m.chapters.have}/${m.chapters.total == null ? '?' : m.chapters.total}` : ''}`);
  const sum = work.summary && work.summary.length ? htmlToText(clean(work.summary).html) : m.summary;
  if (sum) L.push('', 'Summary', sum);
  const nt = work.notes && work.notes.length ? htmlToText(clean(work.notes).html) : '';
  if (nt) L.push('', 'Notes', nt);
  work.chapters.forEach((c, i) => {
    L.push('', '', `${work.chapters.length > 1 ? `${c.title}` : 'Text'}`, '='.repeat(Math.min(60, Math.max(8, c.title.length))), '');
    const cn = c.notes && c.notes.length ? htmlToText(clean(c.notes).html) : '';
    if (cn) L.push(`Notes: ${cn}`, '');
    L.push(chapterText(work, i));
    const ce = c.endNotes && c.endNotes.length ? htmlToText(clean(c.endNotes).html) : '';
    if (ce) L.push('', `End notes: ${ce}`);
  });
  const en = work.endNotes && work.endNotes.length ? htmlToText(clean(work.endNotes).html) : '';
  if (en) L.push('', '', 'End notes', en);
  return L.join('\n') + '\n';
}

/* ------------------------------------------------------------------ a printable page */
export function workToHtml(work, { date = new Date() } = {}) {
  const m = work.meta;
  const lang = langCode(m.language);
  const opts = { link: 'reader' };
  const toc = work.chapters.length > 1 ? `<nav aria-label="Chapters"><h2>Chapters</h2><ol>${work.chapters.map((c, i) => `<li><a href="#c${i + 1}">${esc(c.title)}</a></li>`).join('')}</ol></nav>` : '';
  const body = work.chapters.map((c, i) => `<section id="c${i + 1}"><h2>${esc(c.title)}</h2>${chapterHtml(work, i)}</section>`).join('\n');
  return `<!doctype html>
<html lang="${escA(lang)}"${isRtl(lang) ? ' dir="rtl"' : ''}><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1">
<meta http-equiv="Content-Security-Policy" content="default-src 'none'; style-src 'unsafe-inline'; img-src data:">
<title>${esc(m.title)}</title>
<style>body{font:18px/1.65 Georgia,"Times New Roman",serif;max-width:42em;margin:0 auto;padding:24px 18px 64px;color:#1c1b19;background:#fff}h1{font-size:30px;line-height:1.2;margin:0 0 4px}h2{font-size:23px;margin:42px 0 12px;border-top:1px solid #999;padding-top:18px}.by{margin:0 0 18px;color:#4a4742}.meta{font:15px/1.5 system-ui,sans-serif;color:#4a4742;margin:0 0 22px}.notes{border-left:3px solid #999;padding-left:12px;margin:16px 0;font-size:16px}.label{font:700 14px system-ui,sans-serif;margin:0 0 4px}.center{text-align:center}.right{text-align:right}img{max-width:100%;height:auto}.noimg{font-style:italic}@media print{h2{break-after:avoid}section{break-before:auto}body{max-width:none;padding:0}}</style></head>
<body><h1>${esc(m.title)}</h1><p class="by">${m.authors.length ? `by ${esc(m.authors.join(', '))}` : ''}</p>
<p class="meta">${[m.rating, m.fandoms.join(', '), m.words != null ? `${m.words.toLocaleString('en-US')} words` : '', m.language].filter(Boolean).map(esc).join(' | ')}<br>Saved ${date.toISOString().slice(0, 10)} with Ficshelf (peakappsstudio.com/ao3-offline-reader/). This page opens offline; print it to save a PDF.</p>
${toc}
${body}
</body></html>
`;
}

/* ------------------------------------------------------------------ EPUB */
const list = (label, vals) => (vals && vals.length ? `<dt>${label}:</dt>\n<dd>${vals.map(esc).join(', ')}</dd>\n` : '');
function statsLine(m) {
  const p = [];
  if (m.published) p.push(`Published: ${m.published}`);
  if (m.updated && m.updated !== m.published) p.push(`Updated: ${m.updated}`);
  if (m.complete && m.chapters.have > 1) p.push(`Completed: ${m.updated || m.published}`);
  if (m.words != null) p.push(`Words: ${m.words}`);
  if (m.chapters.have != null) p.push(`Chapters: ${m.chapters.have}/${m.chapters.total == null ? '?' : m.chapters.total}`);
  for (const k of ['comments', 'kudos', 'bookmarks', 'hits']) if (m.stats && m.stats[k] != null) p.push(`${k[0].toUpperCase()}${k.slice(1)}: ${m.stats[k]}`);
  return p.join(' ');
}
function prefaceBody(work, { heading = 'h1' } = {}) {
  const m = work.meta;
  const opts = { xml: true, link: 'web' };
  const sum = work.summary && work.summary.length ? clean(work.summary, opts).html : m.summary ? `<p>${esc(m.summary)}</p>` : '';
  const nt = work.notes && work.notes.length ? clean(work.notes, opts).html : '';
  const series = (m.series || []).map(s => (s.part ? `Part ${s.part} of ${s.name}` : s.name));
  return `<div class="meta">
<${heading}>${esc(m.title)}</${heading}>
${m.authors.length ? `<div class="byline">by ${m.authors.map(a => `<a rel="author" href="#">${esc(a)}</a>`).join(', ')}</div>\n` : ''}<dl class="tags">
${m.rating ? `<dt>Rating:</dt>\n<dd>${esc(m.rating)}</dd>\n` : ''}${list('Archive Warning', m.warnings)}${list('Category', m.categories)}${list('Fandom', m.fandoms)}${list('Relationship', m.relationships)}${list('Character', m.characters)}${list('Additional Tags', m.tags)}${m.language ? `<dt>Language:</dt>\n<dd>${esc(m.language)}</dd>\n` : ''}${series.length ? `<dt>Series:</dt>\n<dd>${series.map(esc).join('; ')}</dd>\n` : ''}${list('Collections', m.collections)}<dt>Stats:</dt>
<dd>${esc(statsLine(m))}</dd>
</dl>
</div>
${sum ? `<p class="label">Summary</p>\n<blockquote class="userstuff">${sum}</blockquote>\n` : ''}${nt ? `<p class="label">Notes</p>\n<blockquote class="userstuff">${nt}</blockquote>\n` : ''}${m.ao3Id ? `<p class="source">Source: https://archiveofourown.org/works/${m.ao3Id}</p>\n` : ''}`;
}
function chapterBody(c, i, total, work) {
  const opts = { xml: true, link: 'web' };
  const text = clean(c.nodes, opts).html || '<p>(empty chapter)</p>';
  const n = c.notes && c.notes.length ? `<div class="chapter-notes"><p class="label">Notes</p>${clean(c.notes, opts).html}</div>\n` : '';
  const e = c.endNotes && c.endNotes.length ? `<div class="chapter-endnotes"><p class="label">End notes</p>${clean(c.endNotes, opts).html}</div>\n` : '';
  const last = i === total - 1 && work.endNotes && work.endNotes.length ? `<div class="chapter-endnotes"><p class="label">End notes</p>${clean(work.endNotes, opts).html}</div>\n` : '';
  return `<section class="chapter">\n<h2 class="chapter-title">${esc(c.title)}</h2>\n${n}<div class="chapter-text">${text}</div>\n${e}${last}</section>`;
}
function workDocs(work, prefix) {
  const docs = [{ file: `${prefix}preface.xhtml`, title: work.meta.title || 'Untitled', body: prefaceBody(work) }];
  work.chapters.forEach((c, i) => docs.push({ file: `${prefix}chapter-${String(i + 1).padStart(3, '0')}.xhtml`, title: c.title, body: chapterBody(c, i, work.chapters.length, work) }));
  return docs;
}

/* One work as a clean EPUB 3 (a Blob). */
export async function workToEpub(work, { date = new Date() } = {}) {
  const m = work.meta;
  const docs = workDocs(work, '');
  const toc = [{ title: 'Title page', file: docs[0].file, children: [] }, ...docs.slice(1).map(d => ({ title: d.title, file: d.file, children: [] }))];
  return buildEpub({
    title: m.title, authors: m.authors, language: langCode(m.language), description: m.summary, subjects: [...m.fandoms, ...m.relationships, ...m.characters, ...m.tags],
    series: m.series && m.series[0] ? { name: m.series[0].name, part: m.series[0].part } : null, published: m.published, docs, toc,
  }, { date });
}

/* Several works as one book: a title page, then each work with its own chapters (a work is a part of the contents). */
export async function worksToEpub(works, { title = 'Library', date = new Date() } = {}) {
  const docs = [];
  const toc = [];
  const intro = `<h1>${esc(title)}</h1>\n<p>${works.length} ${works.length === 1 ? 'work' : 'works'}, put together with Ficshelf (peakappsstudio.com/ao3-offline-reader/).</p>\n<ol>${works.map(w => `<li>${esc(w.meta.title)}${w.meta.authors.length ? ` by ${esc(w.meta.authors.join(', '))}` : ''}</li>`).join('')}</ol>`;
  docs.push({ file: 'title.xhtml', title, body: intro });
  toc.push({ title: 'About this book', file: 'title.xhtml', children: [] });
  works.forEach((w, k) => {
    const prefix = `w${String(k + 1).padStart(2, '0')}-`;
    const d = workDocs(w, prefix);
    docs.push(...d);
    toc.push({ title: w.meta.title || `Work ${k + 1}`, file: d[0].file, children: w.chapters.length > 1 ? d.slice(1).map(x => ({ title: x.title, file: x.file, children: [] })) : [] });
  });
  const authors = [...new Set(works.flatMap(w => w.meta.authors))];
  const subjects = [...new Set(works.flatMap(w => [...w.meta.fandoms, ...w.meta.relationships, ...w.meta.characters, ...w.meta.tags]))];
  const langs = works.map(w => langCode(w.meta.language));
  const lang = [...new Set(langs)].sort((a, b) => langs.filter(x => x === b).length - langs.filter(x => x === a).length)[0] || 'en';
  const names = [...new Set(works.flatMap(w => (w.meta.series || []).map(s => s.name)))];
  const series = names.length === 1 && works.every(w => (w.meta.series || []).some(s => s.name === names[0])) ? { name: names[0], part: null } : null;
  return buildEpub({
    title, authors: authors.slice(0, 40), language: lang, description: `${works.length} works: ${works.map(w => w.meta.title).join('; ')}`.slice(0, 1000),
    subjects, series, published: '', docs, toc, works: works.length,
  }, { date });
}

/* The name of a work's file in a folder: "Author - Title [id]" (a name safe on Windows, macOS and Linux). */
const FORBIDDEN = new RegExp('[<>:"/\\\\|?*' + String.fromCharCode(0) + '-' + String.fromCharCode(31) + ']', 'g');
export function safeFileName(s, max = 90) {
  let t = String(s ?? '').normalize('NFC').replace(FORBIDDEN, ' ').replace(/\s+/g, ' ').trim().replace(/[. ]+$/, '');
  if (/^(con|prn|aux|nul|com[1-9]|lpt[1-9])$/i.test(t)) t = `_${t}`;
  if (t.length > max) t = t.slice(0, max).trim().replace(/[. ]+$/, '');
  return t || 'untitled';
}
export function workFileName(meta, ext) {
  const a = meta.authors.length ? meta.authors.slice(0, 2).join(', ') : '';
  const base = `${a ? `${safeFileName(a, 40)} - ` : ''}${safeFileName(meta.title, 80)}${meta.ao3Id ? ` [${meta.ao3Id}]` : ''}`;
  return `${base}.${ext}`;
}
export const textLen = s => fold(s).length;
