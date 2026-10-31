/* Listing the library: the top of every file is read (not the file), and what it says becomes one small record per work. The
 * budget is fixed and tested: an HTML file is read in slices of 64 KB (growing to 192 KB, then 512 KB only when no tag list is
 * found), an EPUB by its central directory, its package file and its first pages, a PDF not at all beyond its first bytes. No file
 * is held in memory; a record keeps the title, the tags, the counts and a handle on the file. Nothing here touches the network. */
import { parseHtml } from './html.js';
import { metaFromTree, fromName, emptyMeta } from './parse.js';
import { scanEpub } from './epub.js';
import { readHead, decodeText, formatOf, sourceId } from './source.js';

export const HTML_STEPS = [64 * 1024, 192 * 1024, 512 * 1024];

function base(src, fmt, meta) {
  return {
    id: sourceId(src), path: src.path, name: src.name, size: src.size, modified: src.modified || 0, format: fmt,
    ao3Id: meta.ao3Id || null, title: meta.title || fromName(src.name).title || src.name, authors: meta.authors, summary: meta.summary || '', rating: meta.rating || '',
    warnings: meta.warnings, categories: meta.categories, fandoms: meta.fandoms, relationships: meta.relationships, characters: meta.characters, tags: meta.tags,
    language: meta.language || '', series: meta.series, collections: meta.collections, other: meta.other, words: meta.words, wordsEstimated: !!meta.wordsEstimated,
    chapters: meta.chapters, complete: meta.complete, published: meta.published || '', updated: meta.updated || '', stats: meta.stats || {}, source: meta.source,
    damaged: false, notes: meta.notes || [],
  };
}

async function scanHtml(src) {
  let bytes = null, text = '', r = null;
  const limit = Math.min(src.size, HTML_STEPS[HTML_STEPS.length - 1]);
  for (const step of HTML_STEPS) {
    const n = Math.min(step, src.size);
    bytes = await readHead(src, n);
    text = decodeText(bytes);
    const { root } = parseHtml(text, { maxNodes: 250000 });
    r = metaFromTree(root, text, src.name);
    if (r.ao3 || n >= limit) break;
  }
  const m = r.meta;
  const rec = base(src, 'html', m);
  if (bytes.length > 3 && bytes[0] === 0x50 && bytes[1] === 0x4b && bytes[2] === 3) { rec.damaged = true; rec.notes = ['This is a ZIP with an .html name. Rename it to .zip or .epub.']; }
  else if (bytes.length > 4 && bytes[0] === 0x25 && bytes[1] === 0x50 && bytes[2] === 0x44 && bytes[3] === 0x46) { rec.damaged = true; rec.notes = ['This is a PDF with an .html name.']; }
  else {
    let nul = 0;
    for (let i = 0; i < Math.min(bytes.length, 4096); i++) if (bytes[i] === 0) nul++;
    if (nul > 8) { rec.damaged = true; rec.notes = ['This file is not text.']; }
  }
  if (rec.words == null) { rec.words = Math.round(src.size / 7); rec.wordsEstimated = true; }
  if (!r.ao3 && !rec.damaged) rec.notes = ['No AO3 tag list found in this file; the title comes from the page or the file name.'];
  return rec;
}

async function scanPdf(src) {
  const bytes = await readHead(src, 1024);
  const m = emptyMeta();
  const fn = fromName(src.name);
  m.title = fn.title; if (fn.author) m.authors = [fn.author]; m.ao3Id = fn.ao3Id; m.source = 'pdf-name';
  const rec = base(src, 'pdf', m);
  const isPdf = bytes.length > 4 && bytes[0] === 0x25 && bytes[1] === 0x50 && bytes[2] === 0x44 && bytes[3] === 0x46;
  rec.words = null; rec.chapters = { have: null, total: null };
  if (!isPdf) { rec.damaged = true; rec.notes = ['This file does not start like a PDF.']; }
  else rec.notes = ['PDF: listed from its file name; the browser opens it, Ficshelf does not read its text.'];
  return rec;
}

export async function scanSource(src) {
  const fmt = formatOf(src);
  if (fmt === 'epub') {
    const { meta, damaged, notes } = await scanEpub(src);
    const rec = base(src, 'epub', meta);
    rec.damaged = damaged; rec.notes = notes || [];
    return rec;
  }
  if (fmt === 'pdf') return scanPdf(src);
  return scanHtml(src);
}

/* Lists many sources with a few at a time. Records come back in the order of the sources. onProgress({ done, total, name });
 * isCancelled() is checked before each file, so a cancel lands within one file's read. */
export async function scanAll(sources, { onProgress = null, isCancelled = () => false, concurrency = 4 } = {}) {
  const out = new Array(sources.length);
  let next = 0, done = 0, cancelled = false;
  const run = async () => {
    for (;;) {
      if (isCancelled()) { cancelled = true; return; }
      const i = next++;
      if (i >= sources.length) return;
      const s = sources[i];
      try { out[i] = await scanSource(s); } catch (e) {
        const m = emptyMeta();
        const fn = fromName(s.name);
        m.title = fn.title; if (fn.author) m.authors = [fn.author]; m.ao3Id = fn.ao3Id; m.source = 'unreadable';
        const rec = base(s, formatOf(s) || 'html', m);
        rec.damaged = true; rec.notes = [`This file could not be read (${e && e.message ? String(e.message).slice(0, 80) : 'error'}).`];
        out[i] = rec;
      }
      done++;
      if (onProgress) onProgress({ done, total: sources.length, name: s.name });
      if (done % 32 === 0) await new Promise(r => setTimeout(r, 0)); // let a cancel or a progress message through
    }
  };
  await Promise.all(Array.from({ length: Math.max(1, concurrency) }, run));
  return { works: out.filter(Boolean), cancelled };
}
