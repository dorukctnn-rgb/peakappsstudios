/* Peelback: reads Windows Sticky Notes files into one list of notes.
 *  - plum.sqlite (Sticky Notes 3 and later, Windows 10 1607 and Windows 11) with its plum.sqlite-wal beside it when there is one:
 *    the Note table. Each body line starts with a block anchor "\id=<guid> "; times are .NET ticks (100 ns since year 1); the
 *    Theme is a word (Yellow, Blue, Green, Pink, Purple, Gray, Charcoal); DeletedAt is set while a deleted note is still in the
 *    table. Sources that document this and that I read: github.com/iamhunggy/StickyParser (MIT, plum and .snt), github.com/
 *    JeanTheMan/winotes (MIT, the \id= blocks, themes, ticks), github.com/kacos2000/Win10 StickyNotes (the Note columns and the
 *    LastServerVersion JSON), github.com/BasedHardware/omi stickyNotes.ts (MIT, WAL and tick handling).
 *  - StickyNotes.snt (Windows 7 and early Windows 10): a compound file with one storage per note (named by a GUID), the note as
 *    RTF in its stream "0" and as plain text in "3" (StickyParser reads "0" because "3" is cut short on long notes).
 * Nothing here touches the page or the network. */
import { Sqlite, SqliteError, isSqlite, isWal, applyWal } from './sqlite.js';
import { readCfb, isCfb, CfbError } from './cfb.js';

export class StickyError extends Error {
  constructor(msg, code = 'damaged', info = {}) { super(msg); this.code = code; this.info = info; }
}

export const THEMES = ['Yellow', 'Pink', 'Blue', 'Green', 'Purple', 'Gray', 'Charcoal'];
const ANCHOR = /^\\id=[0-9a-f]{8}(?:-[0-9a-f]{4}){3}-[0-9a-f]{12} ?/i;
const TICKS_AT_UNIX = 621355968000000000n;

/** .NET ticks (number or bigint) to milliseconds since 1970; 0 when empty or out of a sane range (1990 to 2100). */
export function ticksToMs(t) {
  if (t === null || t === undefined || t === '' || t === 0) return 0;
  let big;
  try { big = typeof t === 'bigint' ? t : BigInt(Math.trunc(Number(t))); } catch (e) { return 0; }
  const ms = Number((big - TICKS_AT_UNIX) / 10000n);
  return ms > 631152000000 && ms < 4102444800000 ? ms : 0;
}

/** The text of a plum.sqlite body: the anchors removed, one line per block. */
export function plainFromAnchors(raw) {
  if (!raw) return '';
  return String(raw).split(/\r\n|\r|\n/).map(l => l.replace(ANCHOR, '')).join('\n').replace(/\u0000/g, '').replace(/[ \t]+$/gm, '').replace(/\n{4,}/g, '\n\n\n').replace(/^\n+|\n+$/g, '');
}

// the structured copy Windows keeps of a synced note (LastServerVersion): document.blocks[].content[].text
function textFromServerJson(s) {
  if (!s || typeof s !== 'string') return { text: '', media: 0 };
  let j;
  try { j = JSON.parse(s); } catch (e) { return { text: '', media: 0 }; }
  const lines = [];
  const walk = blocks => {
    for (const bl of Array.isArray(blocks) ? blocks : []) {
      if (Array.isArray(bl.content)) {
        const t = bl.content.map(c => (typeof c.text === 'string' ? c.text : '')).join('');
        if (t) lines.push(t);
        else if (bl.type && bl.content.length === 0) lines.push('');
      }
      if (Array.isArray(bl.blocks)) walk(bl.blocks);
    }
  };
  walk(j && j.document && j.document.blocks);
  return { text: lines.join('\n').trim(), media: Array.isArray(j && j.media) ? j.media.length : 0 };
}

export function titleOf(text, max = 80) {
  const first = String(text || '').split('\n').map(s => s.trim()).find(Boolean) || '';
  const chars = Array.from(first);
  return chars.length > max ? chars.slice(0, max - 1).join('') + '…' : first;
}

function themeName(v) {
  const s = String(v || '').trim();
  const hit = THEMES.find(t => t.toLowerCase() === s.toLowerCase());
  return hit || (s ? s : 'Yellow');
}

/** Notes from the bytes of plum.sqlite (and, optionally, plum.sqlite-wal). */
export function notesFromPlum(dbBytes, walBytes) {
  let bytes = dbBytes, walFrames = 0;
  if (walBytes && walBytes.length && isWal(walBytes)) { const r = applyWal(dbBytes, walBytes); bytes = r.db; walFrames = r.frames; }
  let sql;
  try { sql = new Sqlite(bytes); } catch (e) { throw new StickyError(e instanceof SqliteError ? e.message : 'The database could not be read.', 'damaged'); }
  let t;
  try { t = sql.table('Note'); } catch (e) { throw new StickyError('The database could not be read.', 'damaged'); }
  if (!t) {
    const names = sql.schema().filter(s => s.type === 'table').map(s => s.name);
    throw new StickyError(names.length ? `This database has no "Note" table, so it is not Sticky Notes' plum.sqlite (it has: ${names.slice(0, 6).join(', ')}).` : 'This database has no tables, or its pages are damaged.', names.length ? 'nonote' : 'damaged', { tables: names.slice(0, 6).join(', ') });
  }
  const out = [];
  for (const r of t.rows) {
    const raw = typeof r.Text === 'string' ? r.Text : '';
    let text = plainFromAnchors(raw);
    const server = textFromServerJson(r.LastServerVersion);
    // a note that was edited on another device can hold only "\id=guid json field" in Text: the server copy has the words
    if ((!text || /^json field$/i.test(text.trim())) && server.text) text = server.text;
    const deletedAt = ticksToMs(r.DeletedAt);
    out.push({
      id: String(r.Id || `row${r.rowid}`), text, title: titleOf(text), theme: themeName(r.Theme),
      created: ticksToMs(r.CreatedAt), modified: ticksToMs(r.UpdatedAt), deleted: deletedAt || (r.DeletedAt ? 1 : 0),
      pictures: server.media, source: 'plum', open: r.IsOpen === 1 || r.IsOpen === true,
    });
  }
  return { notes: out, walFrames, pageSize: sql.pageSize, encoding: sql.enc, sql };
}

/** Notes recovered from released pages of plum.sqlite: leaf pages on the free list that still hold Note rows. */
export function recoverFromFreePages(sql, known) {
  const t = sql.schema().find(s => s.type === 'table' && String(s.name).toLowerCase() === 'note');
  if (!t) return [];
  const { names } = Sqlite.columns(t.sql);
  const col = n => names.indexOf(n);
  const iText = col('Text'), iId = col('Id');
  if (iText < 0) return [];
  const have = new Set(known.map(n => n.id));
  const out = [];
  for (const { page, trunk } of sql.freePages()) {
    if (trunk) continue;
    let rows;
    try { rows = sql.rowsOfPage(page); } catch (e) { continue; }
    for (const { values } of rows) {
      if (values.length < names.length - 2 || typeof values[iText] !== 'string' || !/\\id=/.test(values[iText])) continue;
      const id = iId >= 0 && typeof values[iId] === 'string' ? values[iId] : `free${page}-${out.length}`;
      if (have.has(id)) continue;
      have.add(id);
      const text = plainFromAnchors(values[iText]);
      if (!text) continue;
      out.push({
        id, text, title: titleOf(text), theme: themeName(values[col('Theme')]), created: ticksToMs(values[col('CreatedAt')]),
        modified: ticksToMs(values[col('UpdatedAt')]), deleted: 1, recovered: true, pictures: 0, source: 'plum', open: false,
      });
    }
  }
  return out;
}

/* ---------------------------------------------------------------- RTF (the notes of StickyNotes.snt) */
const CP = { 932: 'shift_jis', 936: 'gbk', 949: 'euc-kr', 950: 'big5', 1250: 'windows-1250', 1251: 'windows-1251', 1252: 'windows-1252', 1253: 'windows-1253', 1254: 'windows-1254', 1255: 'windows-1255', 1256: 'windows-1256', 1257: 'windows-1257', 1258: 'windows-1258', 874: 'windows-874', 65001: 'utf-8' };
const SKIP_DEST = new Set(['fonttbl', 'colortbl', 'stylesheet', 'info', 'pict', 'object', 'header', 'footer', 'generator', 'listtable', 'listoverridetable', 'rsidtbl', 'themedata', 'colorschememapping', 'latentstyles', 'datastore', 'xmlnstbl', 'fldinst', 'pntxtb', 'pntxta']);

/** RTF text to plain text with one line per paragraph. Handles groups, \par, \line, \tab, \'hh bytes in the file's code page,
 *  \uN (with \ucN skipped bytes), bullets and the special characters; formatting is dropped. */
export function rtfToText(src) {
  const s = String(src);
  let cp = 1252, i = 0, out = '', skipDepth = -1, depth = 0, uc = 1, skipChars = 0;
  const stack = [];
  let bytes = [];
  const flush = () => {
    if (!bytes.length) return;
    try { out += new TextDecoder(CP[cp] || 'windows-1252').decode(Uint8Array.from(bytes)); } catch (e) { out += String.fromCharCode(...bytes); }
    bytes = [];
  };
  const emit = t => { if (skipDepth < 0) { flush(); out += t; } };
  while (i < s.length) {
    const c = s[i];
    if (c === '{') { stack.push(uc); depth++; i++; continue; }
    if (c === '}') { flush(); if (skipDepth === depth) skipDepth = -1; depth--; uc = stack.pop() ?? 1; i++; continue; }
    if (c === '\\') {
      const n = s[i + 1];
      if (n === "'") {
        const hex = s.substr(i + 2, 2); i += 4;
        if (skipChars > 0) { skipChars--; continue; }
        if (skipDepth < 0) bytes.push(parseInt(hex, 16) || 0);
        continue;
      }
      if (n === '\\' || n === '{' || n === '}') { emit(n); i += 2; continue; }
      if (n === '*') { if (skipDepth < 0) skipDepth = depth; i += 2; continue; }
      if (n === '~') { emit(' '); i += 2; continue; }
      if (n === '_') { emit('-'); i += 2; continue; }
      if (n === '\n' || n === '\r') { emit('\n'); i += 2; continue; }
      const m = /^\\([a-zA-Z]+)(-?\d+)? ?/.exec(s.slice(i, i + 40));
      if (!m) { i += 2; continue; }
      i += m[0].length;
      const w = m[1], arg = m[2] === undefined ? null : parseInt(m[2], 10);
      if (SKIP_DEST.has(w)) { if (skipDepth < 0) skipDepth = depth; continue; }
      if (w === 'ansicpg' && arg) cp = arg;
      else if (w === 'uc' && arg !== null) uc = arg;
      else if (w === 'u' && arg !== null) { emit(String.fromCodePoint(arg < 0 ? arg + 65536 : arg)); skipChars = uc; }
      else if (w === 'par' || w === 'line') emit('\n');
      else if (w === 'tab') emit('\t');
      else if (w === 'bullet') emit('•');
      else if (w === 'emdash') emit('—'); else if (w === 'endash') emit('–');
      else if (w === 'lquote') emit('‘'); else if (w === 'rquote') emit('’');
      else if (w === 'ldblquote') emit('“'); else if (w === 'rdblquote') emit('”');
      else if (w === 'pard' || w === 'plain') { /* formatting reset */ }
      continue;
    }
    if (c === '\r' || c === '\n') { i++; continue; }
    if (skipChars > 0) { skipChars--; i++; continue; }
    emit(c); i++;
  }
  flush();
  return out.replace(/\u0000/g, '').replace(/[ \t]+$/gm, '').replace(/\n{4,}/g, '\n\n\n').replace(/^\n+|\n+$/g, '');
}

function decodeSntText(b) {
  if (!b || !b.length) return '';
  let nul = 0;
  for (let i = 1; i < Math.min(b.length, 64); i += 2) if (b[i] === 0) nul++;
  if (nul > 8) return new TextDecoder('utf-16le').decode(b).replace(/\u0000/g, '');
  return new TextDecoder('utf-8').decode(b);
}

/** Notes from the bytes of StickyNotes.snt. */
export function notesFromSnt(bytes) {
  let c;
  try { c = readCfb(bytes); } catch (e) { throw new StickyError(e instanceof CfbError ? e.message : 'The file could not be read.', 'damaged'); }
  const notes = [];
  // a compound-file name holds at most 31 characters, so the note's GUID is cut there: 8-4-4-4 and the first characters of the last group
  const GUID = /^[0-9a-f]{8}(-[0-9a-f]{4}){3}(-[0-9a-f]{0,12})?$/i;
  for (const k of c.root.kids) {
    const e = k.entry;
    if (e.type !== 1 || !GUID.test(e.name)) continue;
    const s0 = k.kids.find(x => x.entry.name === '0' && x.entry.type === 2);
    const s3 = k.kids.find(x => x.entry.name === '3' && x.entry.type === 2);
    let text = '';
    if (s0) {
      const raw = c.stream(s0.entry);
      const head = new TextDecoder('latin1').decode(raw.subarray(0, 8));
      text = /^\{\\rtf/.test(head) ? rtfToText(new TextDecoder('latin1').decode(raw)) : decodeSntText(raw);
    }
    if (!text && s3) text = decodeSntText(c.stream(s3.entry)).trim();
    notes.push({ id: e.name, text, title: titleOf(text), theme: 'Yellow', created: e.ctime, modified: e.mtime, deleted: 0, pictures: 0, source: 'snt', open: false });
  }
  return { notes };
}

/** What a file is: 'plum' (SQLite), 'wal', 'shm', 'snt' (compound file), 'zip' or 'unknown'. */
export function sniffFile(b, name = '') {
  if (isSqlite(b)) return 'plum';
  if (isWal(b)) return 'wal';
  if (isCfb(b)) return 'snt';
  if (b && b.length >= 4 && b[0] === 0x50 && b[1] === 0x4b) return 'zip';
  if (/-shm$/i.test(name)) return 'shm';
  return 'unknown';
}

/** Opens a set of files (each { name, bytes }) and returns { notes, info } or throws StickyError with words for the page. */
export function openFiles(files) {
  const kinds = files.map(f => ({ f, kind: sniffFile(f.bytes, f.name) }));
  const plum = kinds.find(k => k.kind === 'plum'), wal = kinds.find(k => k.kind === 'wal');
  const snt = kinds.filter(k => k.kind === 'snt');
  const info = { files: files.map(f => f.name), wal: 0, free: 0, source: '' };
  let notes = [];
  if (plum) {
    const r = notesFromPlum(plum.f.bytes, wal ? wal.f.bytes : null);
    notes = r.notes; info.source = 'plum'; info.wal = r.walFrames; info.sql = r.sql; info.hadWal = !!wal;
  } else if (snt.length) {
    for (const k of snt) notes = notes.concat(notesFromSnt(k.f.bytes).notes);
    info.source = 'snt';
  } else if (wal) {
    throw new StickyError('Only the -wal file was added. Add plum.sqlite too: the wal file holds the latest changes, plum.sqlite holds the rest.', 'onlywal');
  } else if (kinds.some(k => k.kind === 'zip')) {
    throw new StickyError('This is a ZIP file. Unzip it first, then add plum.sqlite (and plum.sqlite-wal) or StickyNotes.snt from inside.', 'zip');
  } else {
    throw new StickyError(files.length ? 'This is not a Sticky Notes file. Look for plum.sqlite (Windows 10 and 11) or StickyNotes.snt (Windows 7 and early Windows 10).' : 'No file was added.', files.length ? 'unknown' : 'nofile');
  }
  return { notes, info };
}
