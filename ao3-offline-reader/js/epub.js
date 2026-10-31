/* EPUB for Ficshelf: reading one (the AO3 layout and any ordinary EPUB) and writing a clean EPUB 3 (one work, or several in one book).
 * An EPUB is a ZIP: META-INF/container.xml names the package file (OPF), the OPF lists the files (manifest) and their reading order
 * (spine) and holds dc: metadata, and a navigation document (nav) or a toc.ncx gives the chapter titles. AO3's own EPUB puts a
 * preface with the same <dl class="tags"> list as its HTML before the chapters; that is read first, and the OPF fills what it lacks.
 * What this writes opens in Kindle's Send to Kindle, Apple Books and Kobo apps: a mimetype entry first and stored, container.xml, an
 * OPF with an identifier, a title, authors, a language and a modified time, a nav and a toc.ncx, one XHTML file per chapter.
 * Nothing here touches the network. */
import { readZip, safeEntries, head, writeZip, ZipError } from './zip.js';
import { parseHtml, findAll, q, textOf, hasClass, clean, escapeHtml as esc, escapeAttr as escA } from './html.js';
import { metaFromTree, emptyMeta, fold, isoDate, fromName, readHtmlWork } from './parse.js';
import { readBlob, decodeText, hash53, MAX_NESTED } from './source.js';

export class EpubError extends Error { constructor(code, message) { super(message || code); this.code = code; } }

const FROM = String.fromCharCode;
const XML_BAD = new RegExp('[' + FROM(0) + '-' + FROM(8) + FROM(11) + FROM(12) + FROM(14) + '-' + FROM(31) + FROM(0xfffe) + FROM(0xffff) + ']', 'g');
const xt = s => esc(String(s ?? '').replace(XML_BAD, ''));
const xa = s => escA(String(s ?? '').replace(XML_BAD, ''));

/* ------------------------------------------------------------------ paths */
const dirOf = p => (p.includes('/') ? p.slice(0, p.lastIndexOf('/') + 1) : '');
export function resolvePath(base, href) {
  let h = String(href || '').split('#')[0].split('?')[0];
  if (!h || /^[a-z][a-z0-9+.-]*:/i.test(h)) return null;
  try { h = decodeURIComponent(h); } catch { /* keep as it is */ }
  const parts = (h.startsWith('/') ? h.slice(1) : dirOf(base) + h).split('/');
  const out = [];
  for (const s of parts) {
    if (s === '' || s === '.') continue;
    if (s === '..') { if (!out.length) return null; out.pop(); } else out.push(s);
  }
  return out.join('/');
}

/* ------------------------------------------------------------------ reading */
export async function textOfEntry(e, max = 8 * 1024 * 1024) { return decodeText(await head(e, max)); }

function plainText(s) {
  const t = String(s || '');
  if (/<[a-z][^>]*>/i.test(t)) return fold(textOf(parseHtml(t).root));
  return fold(t);
}

export function parseOpf(text, opfPath) {
  const { root } = parseHtml(text);
  const md = q(root, 'metadata') || root;
  const all = tag => findAll(md, tag).map(e => fold(textOf(e))).filter(Boolean);
  const meta = {
    works: 0, title: all('dc:title')[0] || '', creators: all('dc:creator'), language: all('dc:language')[0] || '', description: plainText(all('dc:description')[0] || ''),
    subjects: all('dc:subject'), date: all('dc:date')[0] || '', identifiers: all('dc:identifier'), series: null,
  };
  const metas = findAll(root, 'meta');
  const byName = n => { const m = metas.find(x => (x.attrs.name || '').toLowerCase() === n); return m ? fold(m.attrs.content || '') : ''; };
  meta.works = Number(byName('ficshelf:works')) || 0;
  const cs = byName('calibre:series');
  if (cs) meta.series = { name: cs, part: Number(byName('calibre:series_index')) || null };
  else {
    const coll = metas.find(x => (x.attrs.property || '') === 'belongs-to-collection');
    if (coll) {
      const pos = metas.find(x => x.attrs.refines === `#${coll.attrs.id}` && x.attrs.property === 'group-position');
      meta.series = { name: fold(textOf(coll)), part: pos ? Number(fold(textOf(pos))) || null : null };
    }
  }
  const manifest = new Map();
  for (const it of findAll(root, 'item')) manifest.set(it.attrs.id, { id: it.attrs.id, href: resolvePath(opfPath, it.attrs.href), type: (it.attrs['media-type'] || '').toLowerCase(), props: it.attrs.properties || '' });
  const sp = q(root, 'spine');
  const spine = findAll(root, 'itemref').map(r => r.attrs.idref).filter(Boolean);
  return { meta, manifest, spine, tocId: sp ? sp.attrs.toc || '' : '', rtl: !!(sp && /rtl/i.test(sp.attrs['page-progression-direction'] || '')) };
}

export async function openEpub(src) {
  const blob = await readBlob(src, MAX_NESTED);
  let zip;
  try { zip = await readZip(blob); } catch (e) { throw new EpubError(e instanceof ZipError && e.code === 'truncated' ? 'truncated' : 'not-zip'); }
  const safe = safeEntries(zip.entries);
  if (safe.bomb && !safe.entries.length) throw new EpubError('bomb', safe.notes.join('; '));
  const map = new Map(safe.entries.map(e => [e.name, e]));
  const notes = safe.notes.slice();
  if (safe.bomb) notes.push('some entries were refused (compression ratio)');
  let opfPath = null;
  const c = map.get('META-INF/container.xml');
  if (c) {
    const { root } = parseHtml(await textOfEntry(c, 200000));
    opfPath = findAll(root, 'rootfile').map(r => resolvePath('', r.attrs['full-path'])).find(p => p && map.has(p)) || null;
  }
  if (!opfPath) opfPath = [...map.keys()].find(n => /\.opf$/i.test(n)) || null;
  if (!opfPath) throw new EpubError('no-opf', 'no package file (OPF) in this EPUB');
  const opf = parseOpf(await textOfEntry(map.get(opfPath), 4 * 1024 * 1024), opfPath);
  const dupItems = new Set();
  return { map, notes, opfPath, ...opf, dupItems, src };
}

/* The spine's documents that hold text (not the navigation document, not an image page). */
export function contentDocs(ep) {
  const out = [];
  const seen = new Set();
  for (const idref of ep.spine) {
    const it = ep.manifest.get(idref);
    if (!it || !it.href || seen.has(it.href)) continue;
    if (!/xhtml|html|xml/.test(it.type) && !/\.(x?html?)$/i.test(it.href)) continue;
    if (/\bnav\b/.test(it.props)) continue;
    const entry = ep.map.get(it.href);
    if (!entry) continue;
    seen.add(it.href);
    out.push({ path: it.href, entry, id: it.id });
  }
  return out;
}

export async function tocTitles(ep) {
  const titles = new Map();
  const add = (base, href, label) => { const p = resolvePath(base, href); const t = fold(label).slice(0, 240); if (p && t && !titles.has(p)) titles.set(p, t); };
  try {
    const nav = [...ep.manifest.values()].find(i => /\bnav\b/.test(i.props) && ep.map.has(i.href));
    if (nav) {
      const { root } = parseHtml(await textOfEntry(ep.map.get(nav.href), 1024 * 1024));
      const toc = findAll(root, 'nav').find(n => /toc/.test(n.attrs['epub:type'] || '') || n.attrs.id === 'toc') || root;
      for (const a of findAll(toc, 'a')) add(nav.href, a.attrs.href, textOf(a));
    }
    const ncx = ep.manifest.get(ep.tocId) || [...ep.manifest.values()].find(i => /dtbncx/.test(i.type));
    if (ncx && ep.map.has(ncx.href) && !titles.size) {
      const { root } = parseHtml(await textOfEntry(ep.map.get(ncx.href), 1024 * 1024));
      for (const np of findAll(root, 'navpoint')) {
        const ct = q(np, 'content'), lb = q(np, 'navlabel');
        if (ct && lb) add(ncx.href, ct.attrs.src, textOf(lb));
      }
    }
  } catch { /* titles are optional */ }
  return titles;
}

const KNOWN_LANG = /^[a-z]{2,3}(-[a-z0-9]{2,8})*$/i;
/* The listing record's fields from an EPUB: { meta, damaged, notes }. Reads the end of the ZIP, the OPF and the preface only. */
export async function scanEpub(src) {
  let ep;
  try { ep = await openEpub(src); } catch (e) {
    const meta = emptyMeta();
    const fn = fromName(src.name);
    meta.title = fn.title; if (fn.author) meta.authors = [fn.author]; meta.ao3Id = fn.ao3Id; meta.source = 'epub-unreadable';
    const why = { truncated: 'the file stops part way', 'not-zip': 'it is not a ZIP', 'no-opf': 'it has no package file (OPF)', bomb: 'its compression ratio is not credible' }[e.code] || 'it could not be read';
    return { meta, damaged: true, notes: [`This EPUB could not be read: ${why}.`] };
  }
  const docs = contentDocs(ep);
  let prefaceIdx = -1;
  let pre = null;
  for (let i = 0; i < Math.min(docs.length, ep.meta.works ? 0 : 6); i++) {
    const text = await textOfEntry(docs[i].entry, 192 * 1024);
    const { root } = parseHtml(text);
    const r = metaFromTree(root, text, src.name);
    if (r.ao3) { pre = r.meta; prefaceIdx = i; break; }
  }
  const o = ep.meta;
  const m = pre || emptyMeta();
  const fn = fromName(src.name);
  if (!pre) {
    m.source = ep.meta.works ? 'merged-epub' : 'generic-epub';
    m.title = o.title || fn.title;
    m.authors = o.creators.slice(0, 20);
    m.tags = [...new Set(o.subjects)].slice(0, 300);
    m.summary = o.description.slice(0, 800);
    m.published = isoDate(o.date);
  } else {
    m.source = 'ao3-epub';
    if (!m.title) m.title = o.title || fn.title;
    if (!m.authors.length) m.authors = o.creators.slice(0, 20);
    if (!m.summary) m.summary = o.description.slice(0, 800);
  }
  if (!m.language && o.language) m.language = o.language;
  if (!m.series.length && o.series) m.series = [{ name: o.series.name, part: o.series.part, id: null }];
  if (!m.ao3Id) { for (const idf of o.identifiers) { const mm = /works\/(\d{1,12})|ao3[:\-_](?:work[:\-_])?(\d{1,12})/i.exec(idf); if (mm) { m.ao3Id = mm[1] || mm[2]; break; } } }
  if (!m.ao3Id && fn.ao3Id) m.ao3Id = fn.ao3Id;
  const bodies = docs.filter((d, i) => i !== prefaceIdx);
  if (m.chapters.have == null) { m.chapters.have = bodies.length || null; }
  if (m.words == null) {
    const bytes = bodies.reduce((n, d) => n + d.entry.size, 0);
    m.words = Math.round(bytes / 7);
    m.wordsEstimated = true;
  }
  if (m.complete == null && m.chapters.total != null && m.chapters.have != null) m.complete = m.chapters.have >= m.chapters.total;
  m.notes = ep.notes;
  return { meta: m, damaged: false, notes: ep.notes };
}

/* The whole work: { meta, summary, notes, endNotes, chapters: [{ title, nodes, notes, endNotes }], rtl }. Images in the book (up to 60,
 * 10 MB) become data: URLs so they can be shown and copied. */
export async function readEpubWork(src) {
  const ep = await openEpub(src);
  const docs = contentDocs(ep);
  const titles = await tocTitles(ep);
  const scanned = await scanEpub(src);
  const meta = scanned.meta;
  let summary = [], notes = [], endNotes = [];
  const chapters = [];
  let prefaceDone = false;
  for (const d of docs) {
    const text = await textOfEntry(d.entry, 24 * 1024 * 1024);
    const { root } = parseHtml(text, { maxNodes: 1500000 });
    if (!prefaceDone && meta.source === 'ao3-epub') {
      const r = metaFromTree(root, text, src.name);
      if (r.ao3) {
        prefaceDone = true;
        const w = readHtmlWork(text, src.name);
        summary = w.summary; notes = w.notes; endNotes = w.endNotes;
        continue;
      }
    }
    const body = q(root, 'body') || root;
    const own = q(body, '.chapter-text');
    let title = titles.get(d.path) || '';
    let nodes;
    let cn = [], ce = [];
    if (own) {
      const t = q(body, '.chapter-title');
      if (t && !title) title = fold(textOf(t));
      nodes = own.kids;
      const a = q(body, '.chapter-notes'), b = q(body, '.chapter-endnotes');
      if (a) cn = a.kids.filter(k => !(k.t === 'el' && hasClass(k, 'label')));
      if (b) ce = b.kids.filter(k => !(k.t === 'el' && hasClass(k, 'label')));
    } else {
      nodes = body.kids;
      if (!title) { const h = q(body, 'h1') || q(body, 'h2') || q(body, 'h3'); if (h) title = fold(textOf(h)).slice(0, 240); }
    }
    chapters.push({ title: title || '', nodes, notes: cn, endNotes: ce, path: d.path });
  }
  chapters.forEach((c, i) => { if (!c.title) c.title = chapters.length > 1 ? `Chapter ${i + 1}` : meta.title; });
  if (!chapters.length) chapters.push({ title: meta.title, nodes: [], notes: [], endNotes: [], path: '' });
  await attachImages(ep, chapters);
  return { meta, summary, notes, endNotes, chapters, rtl: ep.rtl, truncated: false };
}

const IMG_TYPES = { png: 'image/png', jpg: 'image/jpeg', jpeg: 'image/jpeg', gif: 'image/gif', webp: 'image/webp' };
async function attachImages(ep, chapters) {
  let count = 0, total = 0;
  const cache = new Map();
  const walk = async (list, docPath) => {
    for (const nd of list) {
      if (nd.t !== 'el') continue;
      if (nd.tag === 'img' && nd.attrs.src && !/^data:/i.test(nd.attrs.src)) {
        const p = resolvePath(docPath, nd.attrs.src);
        const ext = p ? p.split('.').pop().toLowerCase() : '';
        const e = p && IMG_TYPES[ext] && ep.map.get(p);
        if (e && count < 60 && total + e.size <= 10 * 1024 * 1024 && e.size <= 3 * 1024 * 1024) {
          if (!cache.has(p)) { count++; total += e.size; const bytes = await head(e, e.size); cache.set(p, `data:${IMG_TYPES[ext]};base64,${b64(bytes)}`); }
          nd.attrs.src = cache.get(p);
        }
      } else if (nd.kids) await walk(nd.kids, docPath);
    }
  };
  for (const c of chapters) { await walk(c.nodes, c.path || ''); await walk(c.notes, c.path || ''); await walk(c.endNotes, c.path || ''); }
}
export function b64(bytes) {
  let s = '';
  for (let i = 0; i < bytes.length; i += 0x8000) s += String.fromCharCode.apply(null, bytes.subarray(i, i + 0x8000));
  return btoa(s);
}
const unb64 = s => { const bin = atob(s); const out = new Uint8Array(bin.length); for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i); return out; };

/* ------------------------------------------------------------------ writing */
const LANGS = {
  english: 'en', 'русский': 'ru', 'español': 'es', 'français': 'fr', deutsch: 'de', 'português brasileiro': 'pt-BR', 'português europeu': 'pt-PT', italiano: 'it',
  '日本語': 'ja', '한국어': 'ko', polski: 'pl', 'türkçe': 'tr', 'bahasa indonesia': 'id', nederlands: 'nl', svenska: 'sv', suomi: 'fi', dansk: 'da', norsk: 'no',
  'čeština': 'cs', magyar: 'hu', 'ελληνικά': 'el', 'українська': 'uk', 'العربية': 'ar', 'עברית': 'he', 'فارسی': 'fa', 'tiếng việt': 'vi', 'ไทย': 'th', 'română': 'ro',
};
export function langCode(name) {
  const t = fold(name).toLowerCase();
  if (!t) return 'en';
  if (LANGS[t]) return LANGS[t];
  if (/^中文|chinese|mandarin|國語|普通话/.test(t)) return 'zh';
  if (KNOWN_LANG.test(t)) return t;
  return 'en';
}
const RTL = new Set(['ar', 'he', 'fa', 'ur']);
export const isRtl = code => RTL.has(String(code).toLowerCase().split('-')[0]);

const CSS = `body { font-family: serif; line-height: 1.5; margin: 0 4%; }
h1, h2, h3 { font-family: sans-serif; line-height: 1.25; margin: 1.2em 0 0.5em; }
h1 { font-size: 1.6em; } h2 { font-size: 1.3em; } h3 { font-size: 1.1em; }
p { margin: 0 0 0.9em; text-indent: 0; }
blockquote { margin: 1em 1.5em; }
hr { border: 0; border-top: 1px solid #888; margin: 1.5em 0; }
img { max-width: 100%; height: auto; }
table { border-collapse: collapse; } td, th { border: 1px solid #999; padding: 0.2em 0.5em; }
.center { text-align: center; } .right { text-align: right; }
.noimg { font-style: italic; color: #555; }
.label { font-weight: bold; margin: 1em 0 0.2em; }
.chapter-notes, .chapter-endnotes, .work-notes { border-left: 3px solid #999; padding-left: 0.8em; margin: 1em 0; font-size: 0.95em; }
dl.tags dt { font-weight: bold; margin-top: 0.6em; } dl.tags dd { margin: 0 0 0 1em; }
.byline { margin: 0 0 1em; }
.source { font-size: 0.85em; color: #555; margin-top: 1.5em; }
`;
const NS = 'xmlns="http://www.w3.org/1999/xhtml" xmlns:epub="http://www.idpf.org/2007/ops"';
function xhtml({ title, body, lang, rtl }) {
  return `<?xml version="1.0" encoding="utf-8"?>\n<!DOCTYPE html>\n<html ${NS} lang="${xa(lang)}" xml:lang="${xa(lang)}"${rtl ? ' dir="rtl"' : ''}>\n<head>\n<meta charset="utf-8"/>\n<title>${xt(title || 'Untitled')}</title>\n<link rel="stylesheet" type="text/css" href="styles.css"/>\n</head>\n<body>\n${body}\n</body>\n</html>\n`;
}
const pad = (n, w = 3) => String(n).padStart(w, '0');
const isoStamp = d => d.toISOString().replace(/\.\d+Z$/, 'Z');
export function uuidOf(str) {
  const a = hash53(str, 1).padStart(11, '0'), b = hash53(str, 2).padStart(11, '0'), c = hash53(str, 3).padStart(11, '0');
  const hex = (a + b + c).replace(/[^0-9a-z]/g, '').split('').map(ch => (parseInt(ch, 36) % 16).toString(16)).join('').padEnd(32, '0').slice(0, 32);
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-4${hex.slice(13, 16)}-8${hex.slice(17, 20)}-${hex.slice(20, 32)}`;
}

/* book: { title, authors, language, description, subjects, series: {name, part}, published, identifier, docs: [{ file, title, body }], toc: [{ title, file, children }] }
 * docs[].body is XHTML (what clean({ xml: true }) writes); a data: image in it becomes a file in the EPUB. Returns a Blob. */
export async function buildEpub(book, { date = new Date() } = {}) {
  const lang = book.language || 'en';
  const rtl = isRtl(lang);
  const images = [];
  const docs = book.docs.map(d => ({
    ...d,
    body: d.body.replace(/src="data:image\/(png|jpeg|jpg|gif|webp);base64,([A-Za-z0-9+/=]+)"/g, (m, t, data) => {
      const ext = t === 'jpeg' ? 'jpg' : t;
      const name = `images/img-${pad(images.length + 1)}.${ext}`;
      images.push({ name, type: t === 'jpg' ? 'image/jpeg' : `image/${t}`, bytes: unb64(data) });
      return `src="${name}"`;
    }),
  }));
  const id = book.identifier || `urn:uuid:${uuidOf([book.title, (book.authors || []).join('|'), docs.length].join('~'))}`;
  const items = [];
  const spine = [];
  docs.forEach((d, i) => { const mid = `d${pad(i + 1)}`; items.push(`<item id="${mid}" href="${xa(d.file)}" media-type="application/xhtml+xml"/>`); spine.push(`<itemref idref="${mid}"/>`); });
  images.forEach((im, i) => items.push(`<item id="i${pad(i + 1)}" href="${im.name}" media-type="${im.type}"/>`));
  const subjects = [...new Set((book.subjects || []).map(s => fold(s)).filter(Boolean))].slice(0, 200);
  const published = /^\d{4}-\d{2}-\d{2}$/.test(book.published || '') ? book.published : '';
  const opf = `<?xml version="1.0" encoding="utf-8"?>
<package xmlns="http://www.idpf.org/2007/opf" version="3.0" unique-identifier="bookid" xml:lang="${xa(lang)}">
<metadata xmlns:dc="http://purl.org/dc/elements/1.1/">
<dc:identifier id="bookid">${xt(id)}</dc:identifier>
<dc:title>${xt(book.title || 'Untitled')}</dc:title>
${(book.authors && book.authors.length ? book.authors : ['Unknown']).map(a => `<dc:creator>${xt(a)}</dc:creator>`).join('\n')}
<dc:language>${xt(lang)}</dc:language>
${book.description ? `<dc:description>${xt(book.description.slice(0, 1500))}</dc:description>\n` : ''}${subjects.map(s => `<dc:subject>${xt(s)}</dc:subject>`).join('\n')}${subjects.length ? '\n' : ''}${published ? `<dc:date>${published}</dc:date>\n` : ''}<meta property="dcterms:modified">${isoStamp(date)}</meta>
${book.works ? `<meta name="ficshelf:works" content="${book.works}"/>
` : ''}${book.series && book.series.name ? `<meta name="calibre:series" content="${xa(book.series.name)}"/>\n${book.series.part ? `<meta name="calibre:series_index" content="${book.series.part}"/>\n` : ''}` : ''}</metadata>
<manifest>
<item id="nav" href="nav.xhtml" media-type="application/xhtml+xml" properties="nav"/>
<item id="ncx" href="toc.ncx" media-type="application/x-dtbncx+xml"/>
<item id="css" href="styles.css" media-type="text/css"/>
${items.join('\n')}
</manifest>
<spine toc="ncx"${rtl ? ' page-progression-direction="rtl"' : ''}>
${spine.join('\n')}
</spine>
</package>
`;
  const toc = book.toc && book.toc.length ? book.toc : docs.map(d => ({ title: d.title, file: d.file, children: [] }));
  const li = n => `<li><a href="${xa(n.file)}">${xt(n.title || 'Untitled')}</a>${n.children && n.children.length ? `<ol>${n.children.map(li).join('')}</ol>` : ''}</li>`;
  const nav = xhtml({ title: 'Contents', lang, rtl, body: `<nav epub:type="toc" id="toc">\n<h1>Contents</h1>\n<ol>${toc.map(li).join('\n')}</ol>\n</nav>` });
  let order = 0;
  let depth = 1;
  const np = (n, d) => {
    depth = Math.max(depth, d);
    const me = ++order;
    return `<navPoint id="n${me}" playOrder="${me}"><navLabel><text>${xt(n.title || 'Untitled')}</text></navLabel><content src="${xa(n.file)}"/>${(n.children || []).map(c => np(c, d + 1)).join('')}</navPoint>`;
  };
  const points = toc.map(n => np(n, 1)).join('\n');
  const ncx = `<?xml version="1.0" encoding="utf-8"?>
<ncx xmlns="http://www.daisy.org/z3986/2005/ncx/" version="2005-1">
<head><meta name="dtb:uid" content="${xa(id)}"/><meta name="dtb:depth" content="${depth}"/><meta name="dtb:totalPageCount" content="0"/><meta name="dtb:maxPageNumber" content="0"/></head>
<docTitle><text>${xt(book.title || 'Untitled')}</text></docTitle>
<navMap>
${points}
</navMap>
</ncx>
`;
  const files = [
    { name: 'mimetype', data: 'application/epub+zip', store: true },
    { name: 'META-INF/container.xml', data: '<?xml version="1.0" encoding="utf-8"?>\n<container version="1.0" xmlns="urn:oasis:names:tc:opendocument:xmlns:container">\n<rootfiles><rootfile full-path="OEBPS/content.opf" media-type="application/oebps-package+xml"/></rootfiles>\n</container>\n' },
    { name: 'OEBPS/content.opf', data: opf },
    { name: 'OEBPS/nav.xhtml', data: nav },
    { name: 'OEBPS/toc.ncx', data: ncx },
    { name: 'OEBPS/styles.css', data: CSS },
    ...docs.map(d => ({ name: `OEBPS/${d.file}`, data: xhtml({ title: d.title, body: d.body, lang, rtl }) })),
    ...images.map(im => ({ name: `OEBPS/${im.name}`, data: im.bytes })),
  ];
  const zip = await writeZip(files, { date, deflate: true });
  return new Blob([zip], { type: 'application/epub+zip' });
}
