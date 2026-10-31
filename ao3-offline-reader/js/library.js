/* The library as a list of records: AO3-like filters, sorting, facet counts, the duplicate and old-copy finder, the summary and
 * the size and colour of each book spine. Pure functions on plain records (js/scan.js makes them), so they run in a page, a
 * worker and Node. Nothing here touches the network. */
import { keyOf } from './parse.js';
import { hash53 } from './source.js';

export const LIST_FACETS = ['fandoms', 'relationships', 'characters', 'tags', 'warnings', 'categories'];
export const FACET_LABELS = { fandoms: 'Fandom', relationships: 'Relationship', characters: 'Character', tags: 'Additional tag', warnings: 'Warning', categories: 'Category', rating: 'Rating', language: 'Language' };

export const workKey = w => (w.ao3Id ? `ao3:${w.ao3Id}` : `f:${w.id}`);

export function emptyFilters() {
  const lists = {};
  for (const f of LIST_FACETS) lists[f] = { inc: [], exc: [], mode: 'or' };
  return { q: '', lists, rating: [], language: [], format: [], wordsMin: '', wordsMax: '', status: 'any', pubFrom: '', pubTo: '', updFrom: '', updTo: '', series: '', onlyDup: false };
}
export function filtersActive(f) {
  return !!(f.q || f.rating.length || f.language.length || f.format.length || f.wordsMin !== '' || f.wordsMax !== '' || f.status !== 'any' || f.pubFrom || f.pubTo || f.updFrom || f.updTo || f.series || f.onlyDup
    || LIST_FACETS.some(k => f.lists[k].inc.length || f.lists[k].exc.length));
}

/* per-record search index, kept off the record so a record stays small */
const IDX = new WeakMap();
function idx(w) {
  let x = IDX.get(w);
  if (x) return x;
  x = { hay: keyOf([w.title, w.authors.join(' '), w.summary, w.fandoms.join(' '), w.relationships.join(' '), w.characters.join(' '), w.tags.join(' '), w.series.map(s => s.name).join(' ')].join(' \n ')) };
  for (const k of LIST_FACETS) x[k] = new Set(w[k].map(keyOf));
  x.rating = keyOf(w.rating); x.language = keyOf(w.language); x.series = new Set(w.series.map(s => keyOf(s.name)));
  IDX.set(w, x);
  return x;
}

export function applyFilters(works, f, { dupIds = null } = {}) {
  const terms = keyOf(f.q).split(' ').filter(Boolean);
  const rating = new Set(f.rating.map(keyOf)), lang = new Set(f.language.map(keyOf)), fmt = new Set(f.format);
  const lists = LIST_FACETS.map(k => [k, f.lists[k].inc.map(keyOf), f.lists[k].exc.map(keyOf), f.lists[k].mode]).filter(([, i, e]) => i.length || e.length);
  const wmin = f.wordsMin === '' ? null : Number(f.wordsMin), wmax = f.wordsMax === '' ? null : Number(f.wordsMax);
  const ser = f.series ? keyOf(f.series) : '';
  return works.filter(w => {
    const x = idx(w);
    for (const t of terms) if (!x.hay.includes(t)) return false;
    if (rating.size && !rating.has(x.rating)) return false;
    if (lang.size && !lang.has(x.language)) return false;
    if (fmt.size && !fmt.has(w.format)) return false;
    for (const [k, inc, exc, mode] of lists) {
      const set = x[k];
      if (exc.some(v => set.has(v))) return false;
      if (inc.length && !(mode === 'and' ? inc.every(v => set.has(v)) : inc.some(v => set.has(v)))) return false;
    }
    if (wmin != null && !(w.words != null && w.words >= wmin)) return false;
    if (wmax != null && !(w.words != null && w.words <= wmax)) return false;
    if (f.status === 'complete' && w.complete !== true) return false;
    if (f.status === 'ongoing' && w.complete !== false) return false;
    if (f.pubFrom && !(w.published && w.published >= f.pubFrom)) return false;
    if (f.pubTo && !(w.published && w.published <= f.pubTo)) return false;
    if (f.updFrom && !((w.updated || w.published) && (w.updated || w.published) >= f.updFrom)) return false;
    if (f.updTo && !((w.updated || w.published) && (w.updated || w.published) <= f.updTo)) return false;
    if (ser && !x.series.has(ser)) return false;
    if (f.onlyDup && !(dupIds && dupIds.has(w.id))) return false;
    return true;
  });
}

const SORTS = {
  title: (a, b) => keyOf(a.title).localeCompare(keyOf(b.title)),
  author: (a, b) => keyOf(a.authors[0] || '').localeCompare(keyOf(b.authors[0] || '')) || keyOf(a.title).localeCompare(keyOf(b.title)),
  words: (a, b) => (a.words || 0) - (b.words || 0),
  updated: (a, b) => String(a.updated || a.published || '').localeCompare(String(b.updated || b.published || '')),
  added: (a, b) => (a.addedAt || 0) - (b.addedAt || 0),
};
export const SORT_KEYS = Object.keys(SORTS);
export function sortWorks(works, key = 'title', dir = 'asc') {
  const cmp = SORTS[key] || SORTS.title;
  const out = works.slice().sort((a, b) => cmp(a, b) || a.id.localeCompare(b.id));
  return dir === 'desc' ? out.reverse() : out;
}

/* [[value, count]] for one facet over the given works, most common first */
export function facetCounts(works, facet) {
  const counts = new Map();
  const names = new Map();
  for (const w of works) {
    const vals = facet === 'rating' || facet === 'language' ? (w[facet] ? [w[facet]] : []) : w[facet];
    for (const v of new Set(vals)) { const k = keyOf(v); counts.set(k, (counts.get(k) || 0) + 1); if (!names.has(k)) names.set(k, v); }
  }
  return [...counts].map(([k, n]) => [names.get(k), n]).sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]));
}

/* ------------------------------------------------------------------ duplicates and old copies */
const FORMAT_RANK = { epub: 3, html: 2, pdf: 1 };
const chaptersOf = w => (w.chapters && w.chapters.have != null ? w.chapters.have : 0);
const when = w => String(w.updated || w.published || '');
export function describeCopy(w) {
  const c = w.chapters || {};
  if (c.have != null && c.total != null) return `${c.have} of ${c.total} chapter${c.total === 1 ? '' : 's'}`;
  if (c.have != null) return `${c.have} chapter${c.have === 1 ? '' : 's'}`;
  return 'chapters unknown';
}
/* Works that share an AO3 work id, best copy first. A different id with the same title is not a duplicate (two writers can pick one title).
 * Returns [{ ao3Id, title, items: [{ work, keep, reason }] }]; nothing is deleted or changed, this only shows. */
export function findDuplicates(works) {
  const byId = new Map();
  for (const w of works) { if (!w.ao3Id) continue; (byId.get(w.ao3Id) || byId.set(w.ao3Id, []).get(w.ao3Id)).push(w); }
  const groups = [];
  for (const [ao3Id, list] of byId) {
    if (list.length < 2) continue;
    const ranked = list.slice().sort((a, b) => (a.damaged - b.damaged) || chaptersOf(b) - chaptersOf(a) || when(b).localeCompare(when(a)) || (b.words || 0) - (a.words || 0)
      || (FORMAT_RANK[b.format] || 0) - (FORMAT_RANK[a.format] || 0) || a.path.localeCompare(b.path));
    const best = ranked[0];
    const items = ranked.map((w, i) => {
      if (i === 0) return { work: w, keep: true, reason: `Best copy: ${describeCopy(w)}${when(w) ? `, ${w.updated ? 'updated' : 'published'} ${when(w)}` : ''}` };
      let reason;
      if (w.damaged) reason = 'Could not be read';
      else if (w.format === 'pdf') reason = 'The same work as a PDF: the browser opens it, Ficshelf does not read its text';
      else if (w.chapters && w.chapters.have != null && chaptersOf(w) < chaptersOf(best)) reason = `Older copy: ${describeCopy(w)}, the best copy has ${chaptersOf(best)}`;
      else if (when(w) && when(best) && when(w) < when(best)) reason = `Older copy: updated ${when(w)}, the best copy ${when(best)}`;
      else if (w.format !== best.format) reason = `Same version as ${best.format.toUpperCase()}, saved as ${w.format.toUpperCase()}`;
      else reason = 'Same version, saved again';
      return { work: w, keep: false, reason };
    });
    groups.push({ ao3Id, title: best.title, items });
  }
  return groups.sort((a, b) => a.title.localeCompare(b.title));
}
export function duplicateIds(groups) { return new Set(groups.flatMap(g => g.items.map(i => i.work.id))); }
/* A single file that was saved before the work was finished: "3 of 5 chapters". */
export function unfinishedNote(w) {
  const c = w.chapters || {};
  if (w.complete === false && c.have != null) return c.total != null && c.have < c.total ? `Saved at ${c.have} of ${c.total} chapters` : `Still going: ${c.have} chapter${c.have === 1 ? '' : 's'} when saved`;
  return '';
}

/* ------------------------------------------------------------------ summary */
export function summarize(works, readKeys = new Set()) {
  const top = facet => facetCounts(works, facet).slice(0, 5);
  const ongoing = works.filter(w => w.complete === false);
  return {
    count: works.length,
    words: works.reduce((n, w) => n + (w.words || 0), 0),
    byFormat: { epub: works.filter(w => w.format === 'epub').length, html: works.filter(w => w.format === 'html').length, pdf: works.filter(w => w.format === 'pdf').length },
    complete: works.filter(w => w.complete === true).length,
    ongoing: ongoing.length,
    ongoingUnread: ongoing.filter(w => !readKeys.has(workKey(w))),
    topFandoms: top('fandoms'), topRelationships: top('relationships'),
    damaged: works.filter(w => w.damaged).length,
  };
}

/* ------------------------------------------------------------------ spines */
export const SPINE_COLORS = ['#4b2142', '#8a4a1a', '#2d5547', '#6e2b4f', '#3d4f6b', '#7a3b2e', '#4a5d2b', '#5b3f78'];
const clamp = (v, lo, hi) => Math.max(lo, Math.min(hi, v));
/* The width follows the word count, the height the chapters, the colour the first fandom. */
export function spineOf(w) {
  const words = w.words || 0;
  const ch = w.chapters && w.chapters.have != null ? w.chapters.have : 1;
  return {
    width: clamp(Math.round(22 + Math.sqrt(words) / 7), 22, 66),
    height: clamp(150 + Math.round(Math.sqrt(ch) * 16), 150, 206),
    color: parseInt(hash53(keyOf(w.fandoms[0] || w.format), 5), 36) % SPINE_COLORS.length,
  };
}
