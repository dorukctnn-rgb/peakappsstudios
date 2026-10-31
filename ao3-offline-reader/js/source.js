/* Where Ficshelf's files come from. A "source" is one file of the library, either a file the visitor chose or one entry of a ZIP:
 *   { path, name, size, modified, file }    a File or Blob (its path is the folder path the browser gave, or its name)
 *   { path, name, size, modified, entry }   an entry of a ZIP (path is "archive.zip!/inner/path.html")
 * Both are plain data, so a list of them can be handed to a Web Worker. Only the top of a file is read to list it
 * (readHead); the rest is read when the work is opened. Nothing here touches the network. */
import { readZip, safeEntries, head, entryBlob, ZipError } from './zip.js';

export const MAX_NESTED = 300 * 1024 * 1024;
export function formatOfName(name) {
  const m = /\.([a-z0-9]+)$/i.exec(String(name || ''));
  const e = m ? m[1].toLowerCase() : '';
  if (e === 'html' || e === 'htm' || e === 'xhtml') return 'html';
  if (e === 'epub') return 'epub';
  if (e === 'pdf') return 'pdf';
  if (e === 'zip') return 'zip';
  if (e === 'mobi' || e === 'azw3' || e === 'azw' || e === 'kfx') return 'kindle';
  return null;
}
const baseName = p => String(p).split('/').pop();

export function fileSource(file, path) {
  const p = path || file.webkitRelativePath || file._path || file.name;
  return { path: String(p).replace(/\\/g, '/'), name: file.name, size: file.size, modified: file.lastModified || 0, file };
}

/* Turns the chosen files into sources: a .zip is opened and its html, epub and pdf entries become sources of their own (an EPUB
 * that was saved with a .zip name is kept whole). Returns { sources, skipped: [{ path, reason }] }. `isCancelled` is polled. */
export async function expandSources(items, { isCancelled = () => false } = {}) {
  const sources = [];
  const skipped = [];
  for (const item of items) {
    if (isCancelled()) break;
    const file = item.file;
    const path = item.path || file.webkitRelativePath || file.name;
    const fmt = formatOfName(file.name);
    if (fmt === 'zip') {
      try {
        const { entries } = await readZip(file);
        const safe = safeEntries(entries);
        for (const n of safe.notes) skipped.push({ path, reason: n });
        const names = new Set(safe.entries.map(e => e.name));
        if (names.has('META-INF/container.xml') && (names.has('mimetype') || [...names].some(n => /\.opf$/i.test(n)))) { sources.push(fileSource(file, path)); sources[sources.length - 1].forceFormat = 'epub'; continue; }
        for (const e of safe.entries) {
          if (isCancelled()) break;
          const f = formatOfName(e.name);
          if (f === 'zip') { skipped.push({ path: `${path}!/${e.name}`, reason: 'a ZIP inside a ZIP; open it on its own' }); continue; }
          if (f === 'kindle') { skipped.push({ path: `${path}!/${e.name}`, reason: 'MOBI and AZW3 are not read; download the EPUB from AO3' }); continue; }
          if (!f) continue;
          sources.push({ path: `${path}!/${e.name}`, name: baseName(e.name), size: e.size, modified: file.lastModified || 0, entry: e });
        }
      } catch (e) {
        skipped.push({ path, reason: e instanceof ZipError ? (e.code === 'truncated' ? 'a ZIP that stops part way' : 'not a readable ZIP') : 'not a readable ZIP' });
      }
      continue;
    }
    if (fmt === 'kindle') { skipped.push({ path, reason: 'MOBI and AZW3 are not read; download the EPUB from AO3' }); continue; }
    if (!fmt) continue;
    sources.push(fileSource(file, path));
  }
  return { sources, skipped };
}

export const formatOf = src => src.forceFormat || formatOfName(src.name);

/* The first n bytes of a source (a ZIP entry is inflated only that far). */
export async function readHead(src, n) {
  if (src.entry) return head(src.entry, n);
  return new Uint8Array(await src.file.slice(0, n).arrayBuffer());
}
/* The whole source as a Blob; max (bytes) refuses a bigger one. */
export async function readBlob(src, max = Infinity) {
  if (src.size > max) throw new ZipError('too-big', 'file too large');
  if (src.entry) return entryBlob(src.entry);
  return src.file;
}

/* Bytes to text: a byte order mark decides UTF-16 or UTF-8; otherwise UTF-8 (a cut at the end of a slice costs one character). */
export function decodeText(bytes) {
  let b = bytes;
  if (b.length >= 2 && b[0] === 0xff && b[1] === 0xfe) return new TextDecoder('utf-16le').decode(b.subarray(2));
  if (b.length >= 2 && b[0] === 0xfe && b[1] === 0xff) return new TextDecoder('utf-16be').decode(b.subarray(2));
  if (b.length >= 3 && b[0] === 0xef && b[1] === 0xbb && b[2] === 0xbf) b = b.subarray(3);
  return new TextDecoder('utf-8').decode(b);
}
export async function readText(src, max = 25 * 1024 * 1024) {
  const blob = await readBlob(src);
  const cut = blob.size > max;
  const text = decodeText(new Uint8Array(await blob.slice(0, max).arrayBuffer()));
  return { text, cut };
}

/* A stable key for a source in the library (the path and the size; the same file added again gets the same key). */
export function hash53(str, seed = 0) {
  let h1 = 0xdeadbeef ^ seed, h2 = 0x41c6ce57 ^ seed;
  for (let i = 0; i < str.length; i++) {
    const ch = str.charCodeAt(i);
    h1 = Math.imul(h1 ^ ch, 2654435761);
    h2 = Math.imul(h2 ^ ch, 1597334677);
  }
  h1 = Math.imul(h1 ^ (h1 >>> 16), 2246822507) ^ Math.imul(h2 ^ (h2 >>> 13), 3266489909);
  h2 = Math.imul(h2 ^ (h2 >>> 16), 2246822507) ^ Math.imul(h1 ^ (h1 >>> 13), 3266489909);
  return (4294967296 * (2097151 & h2) + (h1 >>> 0)).toString(36);
}
export const sourceId = src => hash53(`${src.path}|${src.size}`);
