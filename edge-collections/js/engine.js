// Stashback engine: turns the Collections database Microsoft Edge keeps on disk (collectionsSQLite) into plain data,
// and that data into files other browsers and apps can open. No network, no storage: bytes in, objects and strings out.
// Table and column names come from the file itself (see _tests/fixtures.mjs for the schema we test against, which is the
// schema of a real Edge 156 file on Windows 11, read on October 27, 2026).
import { openSqlite, SqliteError } from './sqlite.js';

export const MAX_FILE = 512 * 1024 * 1024;

export class OpenError extends Error {
  constructor(code, message) { super(message); this.code = code; }
}

const td = new TextDecoder('utf-8', { fatal: false });
const asText = v => (v == null ? '' : v instanceof Uint8Array ? td.decode(v) : String(v));

/** Edge stores times as milliseconds since 1970; a few website rows hold seconds. Returns an ISO string or null. */
export function toDate(v) {
  const n = typeof v === 'number' ? v : Number(v);
  if (!Number.isFinite(n) || n <= 0) return null;
  let ms;
  if (n > 1e15) ms = n / 1000 - 11644473600000; // microseconds since 1601 (Chromium's own clock), just in case
  else if (n > 1e11) ms = n;
  else if (n > 1e8) ms = n * 1000;
  else return null;
  const d = new Date(ms);
  const y = d.getUTCFullYear();
  if (!(y >= 1995 && y <= 2100)) return null;
  return d.toISOString();
}

const IMG_MAGIC = [
  [[0x89, 0x50, 0x4e, 0x47], 'image/png'],
  [[0xff, 0xd8, 0xff], 'image/jpeg'],
  [[0x47, 0x49, 0x46, 0x38], 'image/gif'],
  [[0x52, 0x49, 0x46, 0x46], 'image/webp'],
  [[0x42, 0x4d], 'image/bmp'],
];
export function imageType(bytes) {
  if (!(bytes instanceof Uint8Array) || bytes.length < 8) return null;
  for (const [sig, type] of IMG_MAGIC) if (sig.every((x, i) => bytes[i] === x)) {
    if (type === 'image/webp' && !(bytes[8] === 0x57 && bytes[9] === 0x45 && bytes[10] === 0x42 && bytes[11] === 0x50)) continue;
    return type;
  }
  return null;
}

const URL_RE = /\bhttps?:\/\/[^\s"'<>]+/i;
/** The source column holds a small JSON blob, {"url": "...", "websiteName": "..."}. Tolerates text and stray bytes. */
export function parseSource(v) {
  const s = asText(v).replace(/^﻿/, '').replace(/\u0000+$/, '').trim();
  if (!s) return { url: '', site: '' };
  try {
    const j = JSON.parse(s);
    if (j && typeof j === 'object') {
      const url = typeof j.url === 'string' ? j.url : typeof j.href === 'string' ? j.href : '';
      const site = typeof j.websiteName === 'string' ? j.websiteName : typeof j.siteName === 'string' ? j.siteName : '';
      return { url: url.trim(), site: site.trim() };
    }
  } catch { /* not JSON */ }
  const m = URL_RE.exec(s);
  return { url: m ? m[0] : '', site: '' };
}

/** Only addresses a browser can open as a bookmark; javascript:, data: and file: links are dropped from exports. */
export function safeUrl(u) {
  const s = String(u || '').trim();
  return /^(https?|ftp):\/\//i.test(s) ? s : '';
}

const ENT = { amp: '&', lt: '<', gt: '>', quot: '"', apos: "'", nbsp: ' ', '#39': "'" };
/** Visible text of the small HTML snippets Edge keeps for notes and clipped text. Does not run or load anything. */
export function htmlToText(html) {
  return String(html || '')
    .replace(/<(script|style)[\s\S]*?<\/\1>/gi, '')
    .replace(/<br\s*\/?>/gi, '\n')
    .replace(/<\/(p|div|li|h[1-6]|tr|blockquote)>/gi, '\n')
    .replace(/<li[^>]*>/gi, '- ')
    .replace(/<[^>]+>/g, '')
    .replace(/&(#x?[0-9a-f]+|[a-z]+);/gi, (m, e) => {
      const k = e.toLowerCase();
      if (ENT[k] != null) return ENT[k];
      if (k[0] === '#') { const n = k[1] === 'x' ? parseInt(k.slice(2), 16) : parseInt(k.slice(1), 10); return Number.isFinite(n) && n > 0 && n < 0x110000 ? String.fromCodePoint(n) : ''; }
      return m;
    })
    .replace(/[ \t]+\n/g, '\n')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}

function kindOf(type, url, text, hasImage) {
  const t = String(type || '').toLowerCase();
  if (t.includes('note')) return 'note';
  if (t.includes('image')) return 'image';
  if (t === 'text' || t.includes('snippet') || t.includes('quote')) return url ? 'clip' : 'note';
  if (url) return 'link';
  if (hasImage) return 'image';
  if (text) return 'note';
  return 'other';
}

/**
 * Read one collectionsSQLite file.
 * @returns {{ collections: Array, loose: Array, names: string[], stats: object, warnings: string[] }}
 */
export function readCollections(bytes, { label = '' } = {}) {
  let db;
  try { db = openSqlite(bytes); } catch (e) {
    if (e instanceof SqliteError && e.code === 'not-sqlite') throw new OpenError('not-sqlite', e.message);
    throw new OpenError('corrupt', e.message);
  }
  const need = ['collections', 'items', 'collections_items_relationship'];
  if (!need.every(t => db.has(t))) {
    const tables = db.tables();
    const hint = tables.includes('urls') && tables.includes('visits') ? 'history' : tables.includes('favicon_bitmaps') ? 'favicons' : tables.includes('logins') ? 'logins' : 'other';
    throw new OpenError('not-collections', hint);
  }
  const warnings = [];
  let rawCollections, rawItems, rels, comments = [], favicons = [], prism = [];
  try {
    rawCollections = db.rows('collections');
    rawItems = db.rows('items');
    rels = db.rows('collections_items_relationship');
    if (db.has('comments')) comments = db.rows('comments');
    if (db.has('favicons')) favicons = db.rows('favicons');
    if (db.has('collections_prism')) prism = db.rows('collections_prism');
  } catch (e) {
    throw new OpenError('corrupt', e.message);
  }
  if (db.lost.rows || db.lost.pages) warnings.push('damaged');

  const fav = new Map();
  for (const f of favicons) {
    const bytesF = f.data instanceof Uint8Array ? f.data : null;
    const type = imageType(bytesF);
    if (type && bytesF.length <= 64 * 1024) fav.set(asText(f.url), { type, bytes: bytesF });
  }
  const notesByItem = new Map();
  for (const c of comments) {
    const t = asText(c.text).trim();
    if (!t) continue;
    const k = asText(c.parent_id);
    if (!notesByItem.has(k)) notesByItem.set(k, []);
    notesByItem.get(k).push(t);
  }

  let skippedDeleted = 0;
  const items = new Map();
  for (const r of rawItems) {
    const id = asText(r.id);
    if (Number(r.is_marked_for_deletion) === 1) { skippedDeleted++; continue; }
    const { url: rawUrl, site } = parseSource(r.source);
    const url = safeUrl(rawUrl);
    const text = asText(r.text_content).trim();
    const htmlText = htmlToText(asText(r.html_content));
    let image = null;
    const imgBytes = r.canonical_image_data instanceof Uint8Array ? r.canonical_image_data : null;
    const imgType = imageType(imgBytes);
    if (imgType) image = { type: imgType, bytes: imgBytes };
    else {
      const iu = asText(r.canonical_image_url || (imgBytes ? imgBytes : '')).trim();
      const m = /^data:(image\/(png|jpeg|gif|webp));base64,([a-z0-9+/=\s]+)$/i.exec(iu);
      if (m) {
        try {
          const bin = atob(m[3].replace(/\s+/g, ''));
          const arr = new Uint8Array(bin.length);
          for (let i = 0; i < bin.length; i++) arr[i] = bin.charCodeAt(i);
          if (imageType(arr)) image = { type: m[1].toLowerCase(), bytes: arr };
        } catch { /* broken data URL */ }
      }
    }
    const remoteImage = !image && /^https?:\/\//i.test(asText(r.canonical_image_url)) ? asText(r.canonical_image_url).trim() : '';
    const noteText = text || htmlText;
    const kind = kindOf(r.type, url, noteText, !!image || !!remoteImage);
    items.set(id, {
      id,
      title: asText(r.title).trim(),
      url,
      rawUrl: rawUrl && !url ? rawUrl : '',
      site,
      type: asText(r.type),
      kind,
      text: noteText,
      notes: notesByItem.get(id) || [],
      image,
      remoteImage,
      favicon: fav.get(asText(r.favicon_url)) || null,
      created: toDate(r.date_created),
      modified: toDate(r.date_modified),
    });
  }

  const cols = [];
  let skippedCollections = 0;
  for (const c of rawCollections) {
    if (Number(c.is_marked_for_deletion) === 1) { skippedCollections++; continue; }
    const thumbBytes = c.thumbnail instanceof Uint8Array ? c.thumbnail : null;
    const thumbType = imageType(thumbBytes);
    cols.push({
      id: asText(c.id),
      title: asText(c.title).trim() || 'Untitled collection',
      position: Number(c.position) || 0,
      created: toDate(c.date_created),
      modified: toDate(c.date_modified),
      thumbnail: thumbType ? { type: thumbType, bytes: thumbBytes } : null,
      items: [],
    });
  }
  cols.sort((a, b) => a.position - b.position || a.title.localeCompare(b.title));
  const byId = new Map(cols.map(c => [c.id, c]));
  const placed = new Set();
  const relSorted = rels.map(r => ({ item: asText(r.item_id), parent: asText(r.parent_id), pos: Number(r.position) || 0 })).sort((a, b) => a.pos - b.pos);
  for (const r of relSorted) {
    const col = byId.get(r.parent);
    const it = items.get(r.item);
    if (!col || !it) continue;
    col.items.push(it);
    placed.add(r.item);
  }
  const loose = [...items.values()].filter(it => !placed.has(it.id));
  loose.sort((a, b) => String(b.created || '').localeCompare(String(a.created || '')));

  // names Edge kept for collections that live on Bing (the prism table holds only a title and a date)
  const known = new Set(cols.map(c => c.title.toLowerCase()));
  const names = [...new Set(prism.map(p => asText(p.title).trim()).filter(t => t && !known.has(t.toLowerCase())))];

  const all = cols.flatMap(c => c.items).concat(loose);
  const stats = {
    label,
    collections: cols.length,
    items: all.length,
    links: all.filter(i => i.url).length,
    notes: all.filter(i => i.text || i.notes.length).length,
    images: all.filter(i => i.image).length,
    skippedDeleted,
    skippedCollections,
    lostRows: db.lost.rows,
    cloudNames: names.length,
    newest: all.map(i => i.modified || i.created).filter(Boolean).sort().pop() || null,
  };
  if (!cols.length && !loose.length) warnings.push(names.length ? 'cloud-only' : 'empty');
  return { collections: cols, loose, names, stats, warnings };
}

/** Merge several opened files (Default, Profile 1, ...) into one list; collection titles get the file's label when >1. */
export function mergeResults(results) {
  if (results.length === 1) return results[0];
  const collections = [];
  const loose = [];
  const names = [];
  const warnings = [];
  results.forEach((r, i) => {
    const tag = r.stats.label || `File ${i + 1}`;
    for (const c of r.collections) collections.push({ ...c, id: `${i}:${c.id}`, source: tag });
    for (const it of r.loose) loose.push({ ...it, source: tag });
    for (const n of r.names) names.push(n);
    for (const w of r.warnings) if (w !== 'empty' && w !== 'cloud-only' && !warnings.includes(w)) warnings.push(w);
  });
  const sum = k => results.reduce((a, r) => a + (r.stats[k] || 0), 0);
  const stats = {
    label: '', collections: collections.length, items: sum('items'), links: sum('links'), notes: sum('notes'), images: sum('images'),
    skippedDeleted: sum('skippedDeleted'), skippedCollections: sum('skippedCollections'), lostRows: sum('lostRows'), cloudNames: names.length,
    newest: results.map(r => r.stats.newest).filter(Boolean).sort().pop() || null, files: results.length,
  };
  if (!collections.length && !loose.length) warnings.push(names.length ? 'cloud-only' : 'empty');
  return { collections, loose, names: [...new Set(names)], stats, warnings };
}

export const escHtml = s => String(s ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
const secs = iso => (iso ? Math.floor(Date.parse(iso) / 1000) : 0);

/** The file every browser imports: Netscape bookmark HTML, one folder per collection, inside an "Edge Collections" folder. */
export function bookmarksHtml(result, { now = new Date() } = {}) {
  const stamp = Math.floor(now.getTime() / 1000);
  const lines = [
    '<!DOCTYPE NETSCAPE-Bookmark-file-1>',
    '<!-- This is an automatically generated file.',
    '     It will be read and overwritten.',
    '     DO NOT EDIT! -->',
    '<META HTTP-EQUIV="Content-Type" CONTENT="text/html; charset=UTF-8">',
    '<TITLE>Bookmarks</TITLE>',
    '<H1>Bookmarks</H1>',
    '<DL><p>',
    `    <DT><H3 ADD_DATE="${stamp}" LAST_MODIFIED="${stamp}">Edge Collections</H3>`,
    '    <DL><p>',
  ];
  const link = (it, pad) => {
    if (!it.url) return;
    const add = secs(it.created);
    const title = it.title || it.site || it.url;
    lines.push(`${pad}<DT><A HREF="${escHtml(it.url)}"${add ? ` ADD_DATE="${add}"` : ''}>${escHtml(title)}</A>`);
    const note = [it.kind === 'clip' ? it.text : '', ...it.notes].filter(Boolean).join(' / ');
    if (note) lines.push(`${pad}<DD>${escHtml(note.replace(/\s+/g, ' ').slice(0, 2000))}`);
  };
  const folder = (title, list, created, modified) => {
    if (!list.some(i => i.url)) return;
    lines.push(`        <DT><H3${secs(created) ? ` ADD_DATE="${secs(created)}"` : ''}${secs(modified) ? ` LAST_MODIFIED="${secs(modified)}"` : ''}>${escHtml(title)}</H3>`);
    lines.push('        <DL><p>');
    for (const it of list) link(it, '            ');
    lines.push('        </DL><p>');
  };
  for (const c of result.collections) folder(c.source ? `${c.title} (${c.source})` : c.title, c.items, c.created, c.modified);
  folder('Not in a collection', result.loose, null, null);
  lines.push('    </DL><p>', '</DL><p>', '');
  return lines.join('\n');
}

const csvCell = v => {
  let s = String(v ?? '');
  if (/^[=+\-@\t\r]/.test(s)) s = "'" + s; // keep spreadsheet apps from running a cell as a formula
  return /[",\r\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
};
/** One row per saved item; opens in Excel, Numbers and Google Sheets (UTF-8 with a byte order mark). */
export function itemsCsv(result) {
  const head = ['Collection', 'Title', 'Address', 'Kind', 'Text or note', 'Site', 'Added', 'Changed'];
  const rows = [head];
  const add = (col, it) => rows.push([col, it.title, it.url || it.rawUrl, it.kind, [it.text, ...it.notes].filter(Boolean).join('\n'), it.site, (it.created || '').slice(0, 10), (it.modified || '').slice(0, 10)]);
  for (const c of result.collections) for (const it of c.items) add(c.source ? `${c.title} (${c.source})` : c.title, it);
  for (const it of result.loose) add('Not in a collection', it);
  return '﻿' + rows.map(r => r.map(csvCell).join(',')).join('\r\n') + '\r\n';
}

/** Plain list of addresses, one per line, grouped by collection (for pasting into an email or a notes app). */
export function linksText(result) {
  const out = [];
  const block = (title, list) => {
    const urls = list.filter(i => i.url);
    if (!urls.length) return;
    out.push(title, ...urls.map(i => `${i.title ? i.title + ' - ' : ''}${i.url}`), '');
  };
  for (const c of result.collections) block(c.title, c.items);
  block('Not in a collection', result.loose);
  return out.join('\n');
}

export function counts(result) {
  const all = result.collections.flatMap(c => c.items).concat(result.loose);
  return { collections: result.collections.length, items: all.length, links: all.filter(i => i.url).length };
}

/** A safe file name stamp: edge-collections-2026-10-27 */
export function stamp(now = new Date()) {
  return now.toISOString().slice(0, 10);
}
