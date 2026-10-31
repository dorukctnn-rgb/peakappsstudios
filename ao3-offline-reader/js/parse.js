/* Ficshelf's reader of what an AO3 download holds. The layout is the one AO3 documents for its HTML and EPUB downloads (and
 * for a page saved from the browser): a preface with the title, the byline and a list of tags (<dl class="tags">, each <dt>
 * a label such as Rating: or Fandom:, each <dd> the values and, for Stats:, "Published: 2024-01-02 Words: 12,345 Chapters:
 * 3/5"), the summary and notes in <blockquote class="userstuff">, then the chapters under #chapters. It was written from that
 * description, with every selector tolerant, because no real AO3 file could be fetched while AO3 was down (see the page).
 * Whatever is not recognised is kept under "other fields", and a file with none of it still gets a title from its name.
 * Nothing here touches the network. */
import { parseHtml, findAll, q, textOf, hasClass } from './html.js';

const FROM = String.fromCharCode;
const COMBINING = new RegExp('[' + FROM(0x300) + '-' + FROM(0x36f) + ']', 'g');
export const fold = s => String(s ?? '').normalize('NFC').replace(/\s+/g, ' ').trim();
export const keyOf = s => fold(s).normalize('NFD').replace(COMBINING, '').toLowerCase();

const LABELS = [
  [/^ratings?$/, 'rating'], [/^archive warnings?$|^warnings?$/, 'warnings'], [/^categor(?:y|ies)$/, 'categories'], [/^fandoms?$/, 'fandoms'],
  [/^relationships?$|^ships?$/, 'relationships'], [/^characters?$/, 'characters'], [/^additional tags?$|^freeform tags?$|^tags?$/, 'tags'],
  [/^language$/, 'language'], [/^series$/, 'series'], [/^collections?$/, 'collections'], [/^stats?$/, 'stats'],
  [/^(published|updated|completed|words|chapters|comments|kudos|bookmarks|hits)$/, 'stat'],
];
const LIST_FIELDS = ['warnings', 'categories', 'fandoms', 'relationships', 'characters', 'tags', 'collections'];
const MAX_VALUES = 600;
const MAX_VALUE_LENGTH = 240;

export function emptyMeta() {
  return {
    title: '', authors: [], summary: '', rating: '', warnings: [], categories: [], fandoms: [], relationships: [], characters: [], tags: [],
    language: '', series: [], collections: [], other: {}, words: null, wordsEstimated: false, chapters: { have: null, total: null }, complete: null,
    published: '', updated: '', stats: {}, ao3Id: null, source: 'html', notes: [],
  };
}

/* ------------------------------------------------------------------ small parsers */
const NUM = s => { const d = String(s ?? '').replace(/[^0-9]/g, ''); return d ? Math.min(Number(d), 1e10) : null; };
const MONTHS = { jan: 1, feb: 2, mar: 3, apr: 4, may: 5, jun: 6, jul: 7, aug: 8, sep: 9, oct: 10, nov: 11, dec: 12 };
export function isoDate(s) {
  const t = String(s ?? '').trim();
  let m = /(\d{4})-(\d{1,2})-(\d{1,2})/.exec(t);
  if (m) return `${m[1]}-${m[2].padStart(2, '0')}-${m[3].padStart(2, '0')}`;
  m = /(\d{1,2})\s+([A-Za-z]{3})[a-z]*\.?,?\s+(\d{4})/.exec(t);
  if (m && MONTHS[m[2].toLowerCase()]) return `${m[3]}-${String(MONTHS[m[2].toLowerCase()]).padStart(2, '0')}-${m[1].padStart(2, '0')}`;
  m = /([A-Za-z]{3})[a-z]*\.?\s+(\d{1,2}),?\s+(\d{4})/.exec(t);
  if (m && MONTHS[m[1].toLowerCase()]) return `${m[3]}-${String(MONTHS[m[1].toLowerCase()]).padStart(2, '0')}-${m[2].padStart(2, '0')}`;
  return '';
}
/* "Published: 2024-01-02 Updated: 2024-02-03 Words: 12,345 Chapters: 3/5 Kudos: 20" in any order and with any separators. */
export function parseStats(text, into = {}) {
  const t = String(text ?? '');
  const date = name => { const m = new RegExp(name + '\\s*:?\\s*(\\d{4}-\\d{1,2}-\\d{1,2}|\\d{1,2}\\s+[A-Za-z]{3,9}\\.?,?\\s+\\d{4})', 'i').exec(t); return m ? isoDate(m[1]) : ''; };
  const count = name => { const m = new RegExp('\\b' + name + '\\s*:?\\s*(\\d[\\d,.\\s]*)', 'i').exec(t); return m ? NUM(m[1]) : null; };
  const published = date('Published'), updated = date('Updated'), completed = date('Completed');
  if (published) into.published = published;
  if (updated) into.updated = updated;
  if (completed) into.completed = completed;
  const words = count('Words');
  if (words != null) into.words = words;
  const ch = /\bChapters\s*:?\s*(\d+)\s*\/\s*(\d+|\?)/i.exec(t);
  if (ch) { into.chaptersHave = Number(ch[1]); into.chaptersTotal = ch[2] === '?' ? null : Number(ch[2]); into.chaptersSeen = true; }
  else { const one = /\bChapters\s*:?\s*(\d+)\b/i.exec(t); if (one) { into.chaptersHave = Number(one[1]); into.chaptersSeen = true; } }
  for (const k of ['Comments', 'Kudos', 'Bookmarks', 'Hits']) { const v = count(k); if (v != null) (into.counts = into.counts || {})[k.toLowerCase()] = v; }
  return into;
}
export function parseSeriesText(text) {
  const out = [];
  const t = fold(text);
  const re = /Part\s+(\d+)\s+of\s+(.+?)(?=\s+Part\s+\d+\s+of\s|$)/gi;
  let m;
  while ((m = re.exec(t))) out.push({ name: fold(m[2]), part: Number(m[1]), id: null });
  if (!out.length && t) out.push({ name: t, part: null, id: null });
  return out;
}

function valuesOf(dd) {
  const links = findAll(dd, 'a');
  let vals;
  if (links.length) vals = links.map(a => fold(textOf(a)));
  else {
    const lis = findAll(dd, 'li');
    vals = lis.length ? lis.map(li => fold(textOf(li))) : fold(textOf(dd)).split(/\s*,\s*/);
  }
  return vals.map(v => v.slice(0, MAX_VALUE_LENGTH)).filter(Boolean);
}
const unique = list => { const seen = new Set(); return list.filter(v => { const k = keyOf(v); if (seen.has(k)) return false; seen.add(k); return true; }); };
const labelOf = s => fold(s).replace(/:$/, '').replace(/\s*:\s*$/, '').toLowerCase();
function fieldFor(label) { for (const [re, f] of LABELS) if (re.test(label)) return f; return null; }

/* The <dl> that holds the tags: class tags first, then one whose labels look like AO3's. */
function pickDl(root) {
  const dls = findAll(root, 'dl', { limit: 60 });
  const score = dl => {
    let n = 0;
    for (const k of dl.kids) if (k.t === 'el' && k.tag === 'dt' && fieldFor(labelOf(textOf(k)))) n++;
    return n + (hasClass(dl, 'tags') ? 3 : 0) + (hasClass(dl, 'work') ? 1 : 0);
  };
  let best = null, bestScore = 0;
  for (const dl of dls) { const sc = score(dl); if (sc > bestScore) { best = dl; bestScore = sc; } }
  return bestScore >= 2 ? best : null;
}

/* ------------------------------------------------------------------ the preface */
const SECTION = /^(summary|notes?|end notes?|chapter summary|chapter notes?|chapter end notes?)\s*:?$/i;
/* Blocks that follow a label such as "Summary:" or "Notes": [{ label, nodes }] in document order. Skips the subtree of `skip`. */
function labelled(root, skip = null) {
  const out = [];
  const walk = el => {
    const kids = el.kids || [];
    for (let i = 0; i < kids.length; i++) {
      const k = kids[i];
      if (k.t !== 'el' || k === skip || k.tag === 'blockquote') continue;
      if (['p', 'h2', 'h3', 'h4', 'strong', 'b', 'dt', 'div', 'span'].includes(k.tag) && !k.kids.some(c => c.t === 'el' && ['p', 'div', 'blockquote'].includes(c.tag))) {
        const tx = fold(textOf(k));
        if (tx.length < 24 && SECTION.test(tx)) {
          let j = i + 1;
          while (j < kids.length && (kids[j].t === 'text' || ['br'].includes(kids[j].tag)) && (kids[j].t !== 'text' || !kids[j].text.trim())) j++;
          const nx = kids[j];
          if (nx && nx.t === 'el' && (nx.tag === 'blockquote' || hasClass(nx, 'userstuff'))) out.push({ label: tx.toLowerCase().replace(/:$/, '').trim(), nodes: nx.kids });
          continue;
        }
      }
      walk(k);
    }
  };
  walk(root);
  return out;
}

function fromTitleTag(root) {
  const tt = q(root, 'title');
  if (!tt) return '';
  let t = fold(textOf(tt)).replace(/\s*\[Archive of Our Own\]\s*$/i, '');
  const parts = t.split(' - ');
  if (parts.length >= 3) t = parts[0];
  return t.slice(0, 300);
}

/* Reads metadata from a parsed HTML tree. `raw` is the text it came from (for the work link); `name` the file name. */
export function metaFromTree(root, raw = '', name = '') {
  const m = emptyMeta();
  const dl = pickDl(root);
  let ao3 = false;
  if (dl) {
    ao3 = true;
    let label = null, rawLabel = '';
    const stats = {};
    for (const k of dl.kids) {
      if (k.t !== 'el') continue;
      if (k.tag === 'dt') { label = labelOf(textOf(k)); rawLabel = fold(textOf(k)).replace(/\s*:$/, ''); continue; }
      if (k.tag !== 'dd' || label == null) continue;
      const field = fieldFor(label);
      if (!field) { if (label) { const key = rawLabel.slice(0, 60); (m.other[key] = m.other[key] || []).push(...valuesOf(k).slice(0, 50)); } continue; }
      if (field === 'stats') { parseStats(fold(textOf(k)), stats); continue; }
      if (field === 'stat') { parseStats(`${label} ${fold(textOf(k))}`, stats); continue; }
      if (field === 'language') { m.language = fold(textOf(k)).slice(0, 60); continue; }
      if (field === 'rating') { m.rating = valuesOf(k)[0] || ''; continue; }
      if (field === 'series') {
        const text = fold(textOf(k));
        const links = findAll(k, 'a').map(a => ({ name: fold(textOf(a)), id: ((a.attrs.href || '').match(/\/series\/(\d+)/) || [])[1] || null }));
        let list = parseSeriesText(text);
        if (links.length && list.length === 1 && list[0].part == null) list = links.map(l => ({ name: l.name, part: null, id: l.id }));
        else list.forEach((s, i) => { const l = links.find(x => keyOf(x.name) === keyOf(s.name)) || links[i]; if (l) s.id = l.id; });
        m.series.push(...list.slice(0, 20));
        continue;
      }
      if (LIST_FIELDS.includes(field)) m[field].push(...valuesOf(k));
    }
    for (const f of LIST_FIELDS) m[f] = unique(m[f]).slice(0, MAX_VALUES);
    for (const [k, v] of Object.entries(m.other)) m.other[k] = unique(v);
    applyStats(m, stats);
  }
  // title and authors
  const titleEl = q(root, '.meta h1') || q(root, 'h2.title') || q(root, 'h1.title') || q(root, 'h1');
  m.title = (titleEl && fold(textOf(titleEl))) || fromTitleTag(root);
  const authors = findAll(root, 'a[rel=author]', { limit: 40 }).map(a => fold(textOf(a))).filter(Boolean);
  if (authors.length) m.authors = unique(authors);
  else {
    const by = q(root, '.byline') || q(root, 'h3.byline');
    if (by) { const t = fold(textOf(by)).replace(/^by\s+/i, ''); if (t) m.authors = unique(t.split(/\s*,\s*/)).slice(0, 20); }
  }
  // summary and notes (outside the chapters)
  const chapters = q(root, '#chapters');
  const blocks = labelled(root, chapters);
  const sum = blocks.find(b => b.label === 'summary');
  if (sum) m.summary = fold(textOf({ t: 'el', tag: 'div', kids: sum.nodes })).slice(0, 800);
  // the work link
  const sample = String(raw).slice(0, 400000);
  const id = /(?:archiveofourown\.(?:org|net|com)|ao3\.org)\/works\/(\d{1,12})/i.exec(sample);
  if (id) m.ao3Id = id[1];
  const hasSkin = !!q(root, '#workskin') || !!q(root, 'dl.work');
  m.source = ao3 ? (hasSkin ? 'saved-page' : 'ao3-html') : 'html';
  const fn = fromName(name);
  if (!m.ao3Id && fn.ao3Id) m.ao3Id = fn.ao3Id;
  if (!m.title) m.title = fn.title;
  if (!m.authors.length && fn.author) m.authors = [fn.author];
  return { meta: m, ao3 };
}
function applyStats(m, s) {
  if (s.published) m.published = s.published;
  if (s.updated) m.updated = s.updated;
  if (s.words != null) m.words = s.words;
  if (s.chaptersSeen) { m.chapters.have = s.chaptersHave; m.chapters.total = s.chaptersTotal; }
  m.complete = s.completed ? true : m.chapters.total != null && m.chapters.have != null ? m.chapters.have >= m.chapters.total : m.chapters.have != null && s.chaptersSeen ? false : null;
  if (s.counts) m.stats = s.counts;
  if (!m.updated && s.completed) m.updated = s.completed;
}

/* Title, author and work id from a file name. Our own tidy names read "Author - Title [12345]"; others are the title. */
export function fromName(name) {
  const base = String(name || '').split('/').pop().replace(/\.(html?|epub|pdf|zip)$/i, '').trim();
  let m = /^(.+?) - (.+) \[(\d{1,12})\]$/.exec(base);
  if (m) return { title: fold(m[2]), author: fold(m[1]), ao3Id: m[3] };
  m = /^(.*?)\s*\[(\d{3,12})\]$/.exec(base);
  if (m) return { title: fold(m[1]) || base, author: '', ao3Id: m[2] };
  const t = !/\s/.test(base) && /_/.test(base) ? base.replace(/_+/g, ' ') : base;
  return { title: fold(t), author: '', ao3Id: null };
}

/* ------------------------------------------------------------------ whole works */
const CHAPTER_START = el => el.t === 'el' && ((el.tag === 'div' && hasClass(el, 'meta') && hasClass(el, 'group')) || (el.tag === 'h2' && (hasClass(el, 'toc-heading') || hasClass(el, 'heading'))));
function withOrder(container) {
  const ord = new Map();
  let n = 0;
  const walk = el => { for (const k of el.kids || []) { if (k.t === 'el') { ord.set(k, n++); walk(k); } } };
  walk(container);
  return ord;
}
function headingOf(container) {
  const h2 = q(container, 'h2.heading') || q(container, 'h2.toc-heading') || q(container, 'h3.title') || q(container, 'h2') || q(container, 'h3');
  const h3 = q(container, 'h3.title');
  let t = h2 ? fold(textOf(h2)) : '';
  if (h3 && h3 !== h2) { const t3 = fold(textOf(h3)); if (t3 && !t.includes(t3)) t = t ? `${t}: ${t3}` : t3; }
  return t.slice(0, 240);
}
/* One chapter's parts from a container (a div.chapter, or the nodes between two chapter headings). */
function splitChapter(container) {
  const ord = withOrder(container);
  const bodies = findAll(container, 'div.userstuff').filter(d => !findAll(container, 'div.userstuff').some(o => o !== d && ord.get(o) < ord.get(d) && contains(o, d)));
  const quotes = findAll(container, 'blockquote.userstuff');
  const firstBody = bodies.length ? Math.min(...bodies.map(b => ord.get(b))) : Infinity;
  const notes = [], endNotes = [];
  for (const b of quotes) {
    if (bodies.some(x => contains(x, b))) continue;
    (ord.get(b) < firstBody ? notes : endNotes).push(...b.kids);
  }
  let nodes;
  if (bodies.length) {
    nodes = bodies.flatMap(b => b.kids).filter(k => !(k.t === 'el' && (hasClass(k, 'landmark') || (k.tag === 'h3' && /^chapter text$/i.test(fold(textOf(k)))))));
  } else {
    nodes = (container.kids || []).filter(k => !(k.t === 'el' && (hasClass(k, 'meta') || hasClass(k, 'preface') || hasClass(k, 'notes') || hasClass(k, 'summary') || /^h[1-3]$/.test(k.tag))));
  }
  return { title: headingOf(container), nodes, notes, endNotes };
}
function contains(a, b) { for (const k of a.kids || []) { if (k === b) return true; if (k.t === 'el' && contains(k, b)) return true; } return false; }

/* The whole work from an HTML download or a saved page: { meta, summary (nodes), notes (nodes), endNotes (nodes), chapters: [{ title, nodes, notes, endNotes }], truncated }. */
export function readHtmlWork(text, name = '') {
  const { root, truncated } = parseHtml(text, { maxNodes: 1500000, maxDepth: 200 });
  const { meta } = metaFromTree(root, text, name);
  const chaptersEl = q(root, '#chapters');
  const blocks = labelled(root, chaptersEl);
  const summary = (blocks.find(b => b.label === 'summary') || {}).nodes || [];
  const notes = (blocks.find(b => b.label === 'notes' || b.label === 'note') || {}).nodes || [];
  const endNotes = (blocks.find(b => b.label === 'end notes' || b.label === 'end note') || {}).nodes || [];
  let chapters = [];
  if (chaptersEl) {
    const kids = chaptersEl.kids.filter(k => k.t === 'el');
    const wrapped = kids.filter(k => k.tag === 'div' && hasClass(k, 'chapter'));
    if (wrapped.length) chapters = wrapped.map(splitChapter);
    else if (kids.some(CHAPTER_START)) {
      let cur = null;
      const groups = [];
      for (const k of chaptersEl.kids) {
        if (CHAPTER_START(k)) { cur = []; groups.push(cur); }
        if (cur) cur.push(k);
      }
      chapters = groups.map(g => splitChapter({ t: 'el', tag: 'div', attrs: {}, kids: g }));
    } else chapters = [splitChapter(chaptersEl)];
  } else {
    const body = q(root, 'body') || root;
    const wk = q(root, '#workskin');
    chapters = [splitChapter(wk || body)];
    if (!chapters[0].nodes.length) chapters = [{ title: '', nodes: (wk || body).kids, notes: [], endNotes: [] }];
  }
  // the end notes of the work sit in #afterword; give the last chapter nothing twice
  if (!chapters.length) chapters = [{ title: '', nodes: [], notes: [], endNotes: [] }];
  chapters.forEach((c, i) => { if (!c.title) c.title = chapters.length > 1 ? `Chapter ${i + 1}` : meta.title; });
  if (meta.chapters.have == null) meta.chapters.have = chapters.length;
  return { meta, summary, notes, endNotes, chapters, truncated };
}

/* A short text of the work for counting words (the first chapter nodes are enough for an estimate). */
export function countWords(text) {
  const t = String(text || '');
  const latin = t.match(/[\p{L}\p{N}][\p{L}\p{N}'’-]*/gu) || [];
  const cjk = (t.match(/[぀-ヿ㐀-鿿가-힯]/g) || []).length;
  return latin.length + cjk;
}
