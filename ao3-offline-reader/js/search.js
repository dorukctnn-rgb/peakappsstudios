/* Full-text search over the library (Pro). The files are read one after another, as streams of text, in the worker: an HTML file is
 * stripped of its tags, an EPUB is opened and each of its pages read. While a work is read, a Bloom filter of its words (4 KB: 32,768
 * bits, four probes) is kept for the session, so a second search skips every work that cannot contain all the words without opening
 * it. A Bloom filter can say "maybe" when the answer is no, never "no" when the answer is yes, so a search never misses a work.
 * Nothing is written to disk: the filters die with the tab. A query is words (whole words) and "quoted phrases", all of which must
 * be in the work; the matching ignores case and accents. Nothing here touches the network. */
import { decode } from './html.js';
import { readBlob, readText, decodeText, formatOf } from './source.js';
import { openEpub, contentDocs, tocTitles, textOfEntry } from './epub.js';

export const BLOOM_BYTES = 4096;
const BITS = BLOOM_BYTES * 8;
const CJK = /[぀-ヿ㐀-鿿가-힯]/;
const CJK_RUN = /[぀-ヿ㐀-鿿가-힯]+/g;
const NON_ASCII = /[^\x00-\x7f]/;
const WORD = /[\p{L}\p{N}]+/gu;
const LATIN_MARKED = /[À-ɏḀ-ỿ]/g;
/* Case and accents folded for matching. One character stays one character (a precomposed Latin letter becomes its base letter), so a
 * position in the folded text is a position in the original. Other scripts are only lowercased. */
const foldWord = w => (NON_ASCII.test(w) ? w.replace(LATIN_MARKED, c => c.normalize('NFD')[0]).toLowerCase() : w.toLowerCase());

function h32(s, seed) {
  let h = 0x811c9dc5 ^ seed;
  for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 16777619); }
  return h >>> 0;
}
export const newBloom = () => new Uint8Array(BLOOM_BYTES);
function bloomAdd(bits, t) {
  const a = h32(t, 0), b = h32(t, 0x9e3779b9) | 1;
  for (let i = 0; i < 4; i++) { const k = (a + Math.imul(i, b)) >>> 0; const bit = k % BITS; bits[bit >> 3] |= 1 << (bit & 7); }
}
function bloomHas(bits, t) {
  const a = h32(t, 0), b = h32(t, 0x9e3779b9) | 1;
  for (let i = 0; i < 4; i++) { const k = (a + Math.imul(i, b)) >>> 0; const bit = k % BITS; if (!(bits[bit >> 3] & (1 << (bit & 7)))) return false; }
  return true;
}
/* the tokens a piece of text is indexed by: its words folded, and for Chinese, Japanese and Korean runs each character and each pair */
function eachToken(text, fn) {
  WORD.lastIndex = 0;
  let m;
  while ((m = WORD.exec(text))) {
    const w = m[0];
    if (!CJK.test(w)) { fn(foldWord(w)); continue; }
    const rest = w.replace(CJK_RUN, '');
    if (rest) fn(foldWord(rest));
    for (const run of w.match(CJK_RUN) || []) {
      for (let i = 0; i < run.length; i++) { fn(run[i]); if (i + 1 < run.length) fn(run.slice(i, i + 2)); }
    }
  }
}
export function indexText(bits, text) { eachToken(text, t => bloomAdd(bits, t)); }
export function tokensOf(text) { const out = []; eachToken(text, t => out.push(t)); return out; }
export function bloomHasAll(bits, tokens) { for (const t of tokens) if (!bloomHas(bits, t)) return false; return true; }

/* ------------------------------------------------------------------ queries */
const reEsc = s => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
export function parseQuery(q) {
  const pieces = [];
  const re = /"([^"]+)"|(\S+)/g;
  let m;
  while ((m = re.exec(String(q || '')))) pieces.push(m[1] || m[2]);
  const terms = [];
  for (const p of pieces) {
    const words = [];
    WORD.lastIndex = 0;
    let w;
    while ((w = WORD.exec(foldPlain(p)))) words.push(w[0]);
    if (!words.length) continue;
    const first = words[0], last = words[words.length - 1];
    const lead = CJK.test(first[0]) ? '' : '(?<![\\p{L}\\p{N}])';
    const trail = CJK.test(last[last.length - 1]) ? '' : '(?![\\p{L}\\p{N}])';
    terms.push({ text: p, tokens: words.flatMap(x => tokensOf(x)), re: new RegExp(lead + words.map(reEsc).join('[^\\p{L}\\p{N}]+') + trail, 'gu') });
  }
  return { terms, bloomTokens: [...new Set(terms.flatMap(t => t.tokens))] };
}
export const foldPlain = foldWord;
/* ------------------------------------------------------------------ the text of a work */
const WINDOW = 512 * 1024;
export function plainFromHtml(html) {
  const t = String(html).replace(/<(script|style)\b[\s\S]*?<\/\1\s*>/gi, ' ').replace(/<[^>]{0,3000}>/g, ' ');
  return t.indexOf('&') >= 0 ? decode(t) : t;
}
/* Pieces of the work's text, in reading order: { text, title } (an EPUB page is one piece, an HTML file is one piece). */
export async function* pieces(src) {
  const f = formatOf(src);
  if (f === 'html') { const { text } = await readText(src, 24 * 1024 * 1024); yield { text: plainFromHtml(text), title: '' }; return; }
  if (f === 'epub') {
    const ep = await openEpub(src);
    const titles = await tocTitles(ep);
    for (const d of contentDocs(ep)) yield { text: plainFromHtml(await textOfEntry(d.entry, 24 * 1024 * 1024)), title: titles.get(d.path) || '' };
  }
}

/* Matches of one term in a piece: [{ at, end }] in the piece's own text. The text is folded in windows so a big file stays cheap. */
function* matches(text, term) {
  for (let start = 0; start < text.length; start += WINDOW) {
    const slice = text.slice(Math.max(0, start - 200), Math.min(text.length, start + WINDOW));
    const base = Math.max(0, start - 200);
    const folded = foldPlain(slice);
    term.re.lastIndex = 0;
    let m;
    while ((m = term.re.exec(folded))) {
      const at = base + m.index;
      if (start > 0 && at < start) continue; // belongs to the previous window
      yield { at, end: at + m[0].length };
      if (m[0].length === 0) term.re.lastIndex++;
    }
  }
}
const squash = s => s.replace(/\s+/g, ' ');

/* Searches one work. Returns { count, snippets: [{ before, hit, after, title }] } or null when a word is missing. `blooms` is a Map the
 * caller keeps for the session: a work whose filter is there and lacks a word is skipped without being opened. */
export async function searchWork(src, id, query, blooms, { maxSnippets = 3 } = {}) {
  const known = blooms.get(id);
  if (known && !bloomHasAll(known, query.bloomTokens)) return null;
  const bits = known ? null : newBloom();
  const found = query.terms.map(() => 0);
  const snippets = [];
  const first = query.terms[0];
  let count = 0;
  for await (const p of pieces(src)) {
    if (bits) indexText(bits, p.text);
    for (let ti = 0; ti < query.terms.length; ti++) {
      let n = 0;
      for (const m of matches(p.text, query.terms[ti])) {
        n++;
        if (ti === 0 && snippets.length < maxSnippets) {
          const a = Math.max(0, m.at - 90), b = Math.min(p.text.length, m.end + 90);
          snippets.push({ before: squash(p.text.slice(a, m.at)), hit: squash(p.text.slice(m.at, m.end)), after: squash(p.text.slice(m.end, b)), title: p.title });
        }
        if (n >= 500) break;
      }
      found[ti] += n;
      if (ti === 0) count += n;
    }
  }
  if (bits) blooms.set(id, bits);
  return found.every(n => n > 0) ? { count, snippets } : null;
}

/* Searches the items [{ id, src }] one after another (a few at a time); onResult({ id, count, snippets }) fires as each work matches. */
export async function searchLibrary(items, qstr, blooms, { onResult = null, onProgress = null, isCancelled = () => false, concurrency = 3 } = {}) {
  const query = parseQuery(qstr);
  if (!query.terms.length) return { results: [], scanned: 0, cancelled: false, empty: true };
  const results = [];
  let next = 0, done = 0, cancelled = false;
  const run = async () => {
    for (;;) {
      if (isCancelled()) { cancelled = true; return; }
      const i = next++;
      if (i >= items.length) return;
      const it = items[i];
      try {
        const r = await searchWork(it.src, it.id, query, blooms);
        if (r) { const row = { id: it.id, ...r }; results.push(row); if (onResult) onResult(row); }
      } catch { /* an unreadable work simply has no hits */ }
      done++;
      if (onProgress) onProgress({ done, total: items.length });
    }
  };
  await Promise.all(Array.from({ length: Math.max(1, concurrency) }, run));
  return { results, scanned: done, cancelled, empty: false };
}
