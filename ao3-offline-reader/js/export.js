/* What Ficshelf saves from the whole library (the Pro part, plus the text of the catalog): library.csv (formula-safe), library.json, a
 * reading list in Markdown, an index.html catalog that opens offline, and the tidy ZIP: every work as a clean EPUB in
 * "Fandom/Author - Title [id].epub" (a PDF is copied as it is), with the catalog beside them. Everything is built in this tab.
 * Nothing here touches the network. */
import { writeZip } from './zip.js';
import { toCsv } from './csv.js';
import { loadWork, workToEpub, safeFileName, workFileName } from './work.js';
import { readBlob } from './source.js';
import { escapeHtml as esc } from './html.js';
import { workKey } from './library.js';

export const TOOL_URL = 'peakappsstudio.com/ao3-offline-reader/';
export const isoDay = d => d.toISOString().slice(0, 10);
const join = a => (a || []).join('; ');
const status = w => (w.complete === true ? 'complete' : w.complete === false ? 'in progress' : 'unknown');

export const CSV_HEADER = ['title', 'authors', 'ao3_work_id', 'fandoms', 'relationships', 'characters', 'additional_tags', 'rating', 'warnings', 'categories', 'language',
  'words', 'words_estimated', 'chapters_have', 'chapters_total', 'status', 'published', 'updated', 'series', 'kudos', 'hits', 'format', 'file', 'file_size_bytes', 'notes'];
export function catalogRows(works) {
  return works.map(w => [w.title, join(w.authors), w.ao3Id || '', join(w.fandoms), join(w.relationships), join(w.characters), join(w.tags), w.rating, join(w.warnings), join(w.categories),
    w.language, w.words ?? '', w.wordsEstimated ? 'yes' : '', w.chapters.have ?? '', w.chapters.total ?? '', status(w), w.published, w.updated,
    w.series.map(s => (s.part ? `${s.name} #${s.part}` : s.name)).join('; '), w.stats.kudos ?? '', w.stats.hits ?? '', w.format, w.path, w.size, join(w.notes)]);
}
export const libraryCsv = works => toCsv(CSV_HEADER, catalogRows(works));
export function libraryJson(works, { date = new Date() } = {}) {
  return JSON.stringify({ made_by: `Ficshelf (${TOOL_URL})`, date: isoDay(date), count: works.length, works: works.map(w => ({ ...w, id: undefined })) }, null, 2) + '\n';
}
export function readingListMd(works, { date = new Date(), readKeys = new Set() } = {}) {
  const groups = new Map();
  for (const w of works) { const k = w.fandoms[0] || 'No fandom listed'; (groups.get(k) || groups.set(k, []).get(k)).push(w); }
  const words = works.reduce((n, w) => n + (w.words || 0), 0);
  const L = ['# Reading list', '', `Saved with Ficshelf (${TOOL_URL}) on ${isoDay(date)}. ${works.length} work${works.length === 1 ? '' : 's'}, about ${words.toLocaleString('en-US')} words.`, ''];
  for (const [fandom, list] of [...groups].sort((a, b) => a[0].localeCompare(b[0]))) {
    L.push(`## ${fandom} (${list.length})`, '');
    for (const w of list.sort((a, b) => a.title.localeCompare(b.title))) {
      const bits = [w.authors.length ? `by ${w.authors.join(', ')}` : '', w.words != null ? `${w.wordsEstimated ? '~' : ''}${w.words.toLocaleString('en-US')} words` : '',
        w.chapters.have != null ? `${w.chapters.have}/${w.chapters.total ?? '?'} chapters` : '', status(w) === 'unknown' ? '' : status(w), w.rating].filter(Boolean);
      L.push(`- [${readKeys.has(workKey(w)) ? 'x' : ' '}] **${w.title.replace(/([*_`[\]])/g, '\\$1')}** ${bits.join(', ')}${w.relationships.length ? ` (${w.relationships.slice(0, 3).join('; ')})` : ''}`);
    }
    L.push('');
  }
  return L.join('\n');
}
/* index.html for the ZIP: a table with a filter box, no network, its own tiny script. */
export function catalogHtml(works, { date = new Date(), files = new Map() } = {}) {
  const rows = works.map(w => {
    const f = files.get(w.id);
    return `<tr><td>${f ? `<a href="${esc(encodeURI(f))}">${esc(w.title)}</a>` : esc(w.title)}</td><td>${esc(w.authors.join(', '))}</td><td>${esc(w.fandoms.join(', '))}</td><td class="n">${w.words != null ? `${w.wordsEstimated ? '~' : ''}${w.words.toLocaleString('en-US')}` : ''}</td><td>${esc(status(w))}</td><td>${esc(w.rating)}</td></tr>`;
  }).join('\n');
  return `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1">
<meta http-equiv="Content-Security-Policy" content="default-src 'none'; style-src 'unsafe-inline'; script-src 'unsafe-inline'">
<title>My library, saved ${isoDay(date)}</title>
<style>body{font:16px/1.5 system-ui,sans-serif;max-width:1100px;margin:0 auto;padding:20px 16px 60px;color:#1c1b19;background:#fbf4ea}h1{font-size:28px;margin:0 0 4px}input{font:inherit;padding:8px 10px;width:100%;max-width:420px;border:1px solid #8c8478;border-radius:6px;margin:12px 0}table{border-collapse:collapse;width:100%}th,td{text-align:left;padding:6px 8px;border-bottom:1px solid #d9cfc0;vertical-align:top}.n{text-align:right}a{color:#4b2142}</style></head>
<body><h1>My library</h1><p>${works.length} works, saved with Ficshelf (${esc(TOOL_URL)}) on ${isoDay(date)}. This page opens offline.</p>
<label>Filter <input id="f" type="search" placeholder="Title, author, fandom" autocomplete="off"></label>
<table><thead><tr><th>Title</th><th>Author</th><th>Fandom</th><th class="n">Words</th><th>Status</th><th>Rating</th></tr></thead><tbody id="b">
${rows}
</tbody></table>
<script>document.getElementById('f').addEventListener('input',function(e){var t=e.target.value.toLowerCase();document.querySelectorAll('#b tr').forEach(function(r){r.hidden=t&&r.textContent.toLowerCase().indexOf(t)<0})})</script>
</body></html>
`;
}

/* ------------------------------------------------------------------ the tidy ZIP */
/* items: [{ work (a record), src (its source) }]. Returns { blob, name, converted, copied, failed: [{ title, reason }] }. */
export async function tidyZip(items, { onProgress = null, isCancelled = () => false, date = new Date(), readKeys = new Set() } = {}) {
  const files = [];
  const names = new Set();
  const nameOf = new Map();
  const failed = [];
  let converted = 0, copied = 0;
  const unique = path => {
    let p = path, n = 2;
    const dot = path.lastIndexOf('.');
    while (names.has(p.toLowerCase())) { p = `${path.slice(0, dot)} (${n++})${path.slice(dot)}`; }
    names.add(p.toLowerCase());
    return p;
  };
  let done = 0;
  for (const { work, src } of items) {
    if (isCancelled()) return null;
    const folder = safeFileName(work.fandoms[0] || 'No fandom listed', 60);
    try {
      if (work.format === 'pdf') {
        const p = unique(`${folder}/${workFileName(work, 'pdf')}`);
        files.push({ name: p, data: await readBlob(src), store: true }); nameOf.set(work.id, p); copied++;
      } else {
        if (work.damaged) throw new Error('the file could not be read');
        const full = await loadWork(src);
        full.meta.ao3Id = full.meta.ao3Id || work.ao3Id;
        const blob = await workToEpub(full, { date });
        const p = unique(`${folder}/${workFileName(work, 'epub')}`);
        files.push({ name: p, data: blob, store: true }); nameOf.set(work.id, p); converted++;
      }
    } catch (e) {
      failed.push({ title: work.title, reason: e && e.message ? String(e.message).slice(0, 100) : 'error' });
      try {
        const ext = work.format === 'epub' ? 'epub' : work.format === 'pdf' ? 'pdf' : 'html';
        const p = unique(`Not converted/${workFileName(work, ext)}`);
        files.push({ name: p, data: await readBlob(src), store: true }); nameOf.set(work.id, p);
      } catch { /* the original cannot be read either */ }
    }
    done++;
    if (onProgress) onProgress({ done, total: items.length, name: work.title });
  }
  const works = items.map(i => i.work);
  files.push({ name: 'library.csv', data: libraryCsv(works) });
  files.push({ name: 'index.html', data: catalogHtml(works, { date, files: nameOf }) });
  files.push({ name: 'README.txt', data: `This folder was sorted by Ficshelf (${TOOL_URL}) on ${isoDay(date)}.\n\nEach work is a clean EPUB in a folder named for its first fandom: Author - Title [AO3 work id].epub. PDFs are copied as they were.\nlibrary.csv lists every work and its tags for a spreadsheet; index.html opens offline and has a filter box.\n${failed.length ? `\n${failed.length} work${failed.length === 1 ? ' was' : 's were'} not converted and sit in "Not converted" as the original file:\n${failed.map(f => `- ${f.title}: ${f.reason}`).join('\n')}\n` : ''}` });
  const blob = await writeZip(files, { date, deflate: true });
  return { blob, name: `ficshelf-library-${isoDay(date)}.zip`, converted, copied, failed };
}

/* Several works as one EPUB. items: [{ work, src }]. */
export async function mergeToEpub(items, { title, onProgress = null, isCancelled = () => false, date = new Date() } = {}) {
  const { worksToEpub } = await import('./work.js');
  const loaded = [];
  let done = 0;
  for (const { work, src } of items) {
    if (isCancelled()) return null;
    const full = await loadWork(src);
    full.meta.ao3Id = full.meta.ao3Id || work.ao3Id;
    if (!full.meta.title) full.meta.title = work.title;
    loaded.push(full);
    done++;
    if (onProgress) onProgress({ done, total: items.length, name: work.title });
  }
  return worksToEpub(loaded, { title, date });
}
