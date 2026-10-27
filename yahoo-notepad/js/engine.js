/* Lastleaf engine: turns the files Yahoo sends for "Calendar and Notepad" into a list of notes. Plain functions with no
 * browser APIs, so the worker, the page and the Node tests all use the same code. Nothing here sends or stores anything.
 *
 * Yahoo does not publish the layout of the Notepad download, and we have not seen a real one yet. So the engine does not
 * expect one layout: it looks through the JSON for objects that look like notes (a text field, usually with a title and
 * dates), keeps the notebook they sit in, and reads dates in seconds, milliseconds or written form. When it cannot tell
 * which parts are the notes, it says so and the page asks the person to point at the fields (mapping), using the key
 * names only. A calendar file in the same download is recognised and set aside.
 *
 *   readFiles([{ name, bytes }])  -> { docs: [{ name, json }], calendars: [names], problems: [{ name, code, detail }] }
 *   findNotes(json, name)         -> { notes: [raw], certain } (raw = { title, body, html, created, modified, folder, id })
 *   describe(json)                -> the shape of the file: key names, types and counts, never a value
 *   listCandidates(shape)         -> the lists in the file that could hold the notes, for the mapping screen
 *   applyMapping(json, mapping)   -> raw notes from the fields the person picked
 *   structureReport(docs)         -> the keys-only text the "copy the structure report" button puts on the clipboard
 *   normalise(raws)               -> { notes, folders }: numbered notes, sorted newest first, and the notebook list */
import { unzipSync } from '../vendor/fflate.js';
import { looksLikeHtml, htmlToText, safeHtml } from './html.js';

export const MAX_FILE = 512 * 1024 * 1024;
export const MAX_NOTES = 250000;

export class ReadError extends Error {
  constructor(code, detail = '') { super(code); this.code = code; this.detail = detail; }
}

/* ---------------- reading the files ---------------- */

const isZip = b => b.length >= 4 && b[0] === 0x50 && b[1] === 0x4b && (b[2] === 3 || b[2] === 5) && (b[3] === 4 || b[3] === 6);
const isImage = b => b.length > 4 && ((b[0] === 0x89 && b[1] === 0x50) || (b[0] === 0xff && b[1] === 0xd8) || (b[0] === 0x47 && b[1] === 0x49 && b[2] === 0x46) || (b[0] === 0x25 && b[1] === 0x50 && b[2] === 0x44 && b[3] === 0x46));

export function decodeText(b) {
  if (b.length >= 2 && b[0] === 0xff && b[1] === 0xfe) return new TextDecoder('utf-16le').decode(b.subarray(2));
  if (b.length >= 2 && b[0] === 0xfe && b[1] === 0xff) return new TextDecoder('utf-16be').decode(b.subarray(2));
  const s = new TextDecoder('utf-8').decode(b);
  return s.charCodeAt(0) === 0xfeff ? s.slice(1) : s;
}

/** JSON, or JSON Lines (one value per line). Throws ReadError('badjson') with the parser's own words. */
export function parseJson(text, name = '') {
  const t = text.trim();
  if (!t) throw new ReadError('emptyfile', name);
  try { return JSON.parse(t); } catch (e) {
    const lines = t.split(/\r?\n/).map(l => l.trim()).filter(Boolean);
    if (lines.length > 1) {
      const out = [];
      let ok = true;
      for (const l of lines) { try { out.push(JSON.parse(l)); } catch (e2) { ok = false; break; } }
      if (ok) return out;
    }
    throw new ReadError('badjson', `${name}: ${String(e && e.message || e).slice(0, 160)}`);
  }
}

const EVENT_KEYS = new Set(['start', 'end', 'startdate', 'enddate', 'starttime', 'endtime', 'dtstart', 'dtend', 'allday', 'location', 'recurrence', 'rrule', 'attendees', 'organizer', 'timezone', 'tzid', 'duration', 'busy', 'transparency']);
const looksLikeCalendarName = n => /calend|\.ics$|\.ical$|\.vcs$|events?\b/i.test(n || '');
const isCalendarText = t => /^\s*BEGIN:VCALENDAR/i.test(t);

/** Opens every file (and every file inside a ZIP) and parses the JSON. Calendars are named, not read. */
export function readFiles(files) {
  const docs = [], calendars = [], problems = [];
  const one = (name, bytes, depth) => {
    if (!bytes || !bytes.length) { problems.push({ name, code: 'emptyfile' }); return; }
    if (bytes.length > MAX_FILE) { problems.push({ name, code: 'toobig' }); return; }
    if (isZip(bytes)) {
      if (depth > 2) { problems.push({ name, code: 'zipdeep' }); return; }
      let entries;
      try { entries = unzipSync(bytes, { filter: f => f.originalSize < MAX_FILE && !/\/$/.test(f.name) && !/(^|\/)(__MACOSX|\.DS_Store|\._)/.test(f.name) }); }
      catch (e) { problems.push({ name, code: 'zipbad', detail: String(e && e.message || e).slice(0, 120) }); return; }
      const names = Object.keys(entries).sort();
      if (!names.length) { problems.push({ name, code: 'zipempty' }); return; }
      for (const n of names) one(`${name} > ${n}`, entries[n], depth + 1);
      return;
    }
    if (isImage(bytes)) { problems.push({ name, code: 'notjson' }); return; }
    const text = decodeText(bytes);
    if (!text.trim()) { problems.push({ name, code: 'emptyfile' }); return; }
    if (isCalendarText(text)) { calendars.push(name); return; }
    const first = text.trimStart()[0];
    if (first !== '{' && first !== '[') {
      if (/\.json$/i.test(name)) problems.push({ name, code: 'badjson', detail: `${name}: the file does not start like JSON` });
      else problems.push({ name, code: 'notjson' });
      return;
    }
    try { docs.push({ name, json: parseJson(text, name), bytes: bytes.length }); }
    catch (e) { problems.push({ name, code: e.code || 'badjson', detail: e.detail || '' }); }
  };
  for (const f of files) one(f.name || 'file', f.bytes, 0);
  return { docs, calendars, problems };
}

/* ---------------- dates ---------------- */

const MIN_T = Date.UTC(1990, 0, 1), MAX_T = Date.UTC(2100, 0, 1);
const inRange = t => (Number.isFinite(t) && t >= MIN_T && t < MAX_T ? t : null);
/** A moment in milliseconds from epoch seconds, milliseconds or microseconds, an ISO or written date, or {$date}. */
export function parseDate(v) {
  if (v == null || v === '' || typeof v === 'boolean') return null;
  if (typeof v === 'number') {
    const a = Math.abs(v);
    if (a >= 1e14) return inRange(v / 1000);
    if (a >= 1e11) return inRange(v);
    if (a >= 1e8) return inRange(v * 1000);
    return null;
  }
  if (typeof v === 'object') {
    if (Array.isArray(v)) return null;
    if ('$date' in v) return parseDate(v.$date);
    if ('seconds' in v || '_seconds' in v) return parseDate(Number(v.seconds ?? v._seconds));
    if ('timestamp' in v) return parseDate(v.timestamp);
    return null;
  }
  const s = String(v).trim();
  if (/^-?\d{9,17}(\.\d+)?$/.test(s)) return parseDate(Number(s));
  let t = Date.parse(s);
  if (!Number.isFinite(t) && /^\d{4}-\d{2}-\d{2}[ ]\d{1,2}:\d{2}/.test(s)) t = Date.parse(s.replace(' ', 'T'));
  if (!Number.isFinite(t) && /^\d{4}\/\d{2}\/\d{2}/.test(s)) t = Date.parse(s.replace(/\//g, '-').replace(' ', 'T'));
  return inRange(t);
}

/* ---------------- finding the notes ---------------- */

const norm = k => String(k).toLowerCase().replace(/[\s_.\-]/g, '');
const BODY = ['body', 'content', 'text', 'note', 'notetext', 'notebody', 'notecontent', 'bodytext', 'bodyhtml', 'html', 'contenthtml', 'htmlcontent', 'plaintext', 'message', 'description', 'memo', 'details', 'contents'];
const TITLE = ['title', 'subject', 'name', 'heading', 'notetitle', 'header', 'caption', 'headline'];
const CREATED = ['created', 'createdat', 'createdon', 'createdate', 'creationdate', 'creationtime', 'createdtime', 'createtime', 'createdts', 'datecreated', 'timecreated', 'ctime', 'createdtimestamp', 'creationtimestamp', 'created_ms'];
const MODIFIED = ['modified', 'modifiedat', 'modifiedon', 'modifieddate', 'modifiedtime', 'lastmodified', 'lastmodifieddate', 'lastmodifiedtime', 'datemodified', 'updated', 'updatedat', 'updatedon', 'updatedtime', 'lastupdated', 'lastupdate', 'edited', 'editedat', 'lastedited', 'mtime', 'timemodified', 'timeupdated', 'updatetime', 'modifytime', 'changed'];
const DATE = ['date', 'time', 'timestamp', 'ts', 'datetime', 'when', 'savedat', 'saved'];
const FOLDER = ['folder', 'foldername', 'notebook', 'notebookname', 'category', 'categoryname', 'group', 'groupname', 'parentname', 'collection', 'section', 'book'];
const ID = ['id', 'uuid', 'guid', 'noteid', 'key', 'uid'];
// a note that points at its notebook by id ({ notebookId: 3 }, with the notebooks listed elsewhere in the file)
const FOLDER_REF = ['notebookid', 'folderid', 'parentid', 'categoryid', 'groupid', 'notebookuuid', 'folderuuid', 'notebookkey', 'folderkey'];
const CONTAINER_NAME = ['name', 'title', 'notebookname', 'foldername', 'label', 'displayname', 'notebook', 'folder', 'categoryname'];
const STRUCTURAL = new Set(['notes', 'note', 'notepad', 'items', 'data', 'list', 'entries', 'records', 'results', 'children', 'content', 'contents', 'values', 'rows', 'documents', 'docs', 'objects', 'payload', 'export', 'body', 'response', 'notebooks', 'folders', 'categories', 'groups', 'sections']);

const pickKey = (o, list) => {
  const keys = Object.keys(o);
  for (const want of list) { const k = keys.find(x => norm(x) === want); if (k !== undefined) return k; }
  return null;
};
const fuzzyKey = (o, re, not) => Object.keys(o).find(k => re.test(norm(k)) && !(not && not.test(norm(k)))) ?? null;
const isObj = v => v !== null && typeof v === 'object' && !Array.isArray(v);

/** A body value as text: a string, the text inside a small object ({ text }, { html }, { content }), or lines in an array. */
function bodyValue(v, depth = 0) {
  if (v == null) return null;
  if (typeof v === 'string') return v;
  if (typeof v === 'number') return String(v);
  if (Array.isArray(v)) {
    if (v.every(x => typeof x === 'string')) return v.join('\n');
    if (depth < 2 && v.every(x => isObj(x))) { const parts = v.map(x => bodyValue(x, depth + 1)).filter(x => x != null); return parts.length ? parts.join('\n') : null; }
    return null;
  }
  if (isObj(v) && depth < 2) {
    const k = pickKey(v, ['text', 'plaintext', 'html', 'content', 'value', 'body', 'data', 'markdown']);
    if (k) return bodyValue(v[k], depth + 1);
  }
  return null;
}

// an object that could be a note: a text field, or a title with a date
const smellsLikeNote = x => isObj(x) && !isEvent(x) && (pickKey(x, BODY) != null || (pickKey(x, TITLE) != null && (pickKey(x, CREATED) ?? pickKey(x, MODIFIED) ?? pickKey(x, DATE)) != null));
// a list (or a map) with such objects in it
const holdsNotes = v => (Array.isArray(v) ? v : isObj(v) ? Object.values(v) : []).slice(0, 200).some(smellsLikeNote);

function isEvent(o) {
  let n = 0;
  for (const k of Object.keys(o)) if (EVENT_KEYS.has(norm(k))) n++;
  return n >= 2;
}

/** The fields of one object, if it looks like a note. */
function noteFields(o) {
  if (!isObj(o) || isEvent(o)) return null;
  const bodyKey = pickKey(o, BODY);
  let body = bodyKey ? bodyValue(o[bodyKey]) : null;
  if (body != null && typeof o[bodyKey] === 'object' && holdsNotes(o[bodyKey])) body = null; // a list of notes, not a body
  const titleKey = pickKey(o, TITLE);
  const title = titleKey && (typeof o[titleKey] === 'string' || typeof o[titleKey] === 'number') ? String(o[titleKey]) : null;
  const createdKey = pickKey(o, CREATED) ?? fuzzyKey(o, /creat/, /creator|createdby/);
  const modifiedKey = pickKey(o, MODIFIED) ?? fuzzyKey(o, /modif|updat|edited/, /by$/);
  const dateKey = pickKey(o, DATE);
  const created = createdKey ? parseDate(o[createdKey]) : null;
  const modified = modifiedKey ? parseDate(o[modifiedKey]) : null;
  const plain = dateKey ? parseDate(o[dateKey]) : null;
  const hasDate = created != null || modified != null || plain != null;
  // a note has a text field; a note with no text but a title and a date counts too (an empty note)
  if (body == null && !(title != null && hasDate)) return null;
  // a container (notebook) is not a note: it has a list of notes inside
  for (const v of Object.values(o)) if (v && typeof v === 'object' && holdsNotes(v)) return null;
  const folderKey = pickKey(o, FOLDER);
  const folder = folderKey ? folderName(o[folderKey]) : null;
  const idKey = pickKey(o, ID);
  const refKey = pickKey(o, FOLDER_REF);
  const folderRef = refKey && (typeof o[refKey] === 'string' || typeof o[refKey] === 'number') ? String(o[refKey]) : null;
  return { title, body: body ?? '', created: created ?? (modified == null ? plain : null), modified: modified ?? (created != null ? plain : null), folder, id: idKey ? String(o[idKey]).slice(0, 80) : null, folderRef };
}
const folderName = v => {
  if (typeof v === 'string') return v.trim().slice(0, 120) || null;
  if (isObj(v)) { const k = pickKey(v, CONTAINER_NAME); return k && typeof v[k] === 'string' ? v[k].trim().slice(0, 120) || null : null; }
  return null;
};

/** Every note-like object in the file, with the notebook it sits in. certain: true when notes were found by a text
 *  field. Objects found only by a title and a date (an empty note) are kept when they sit in the same list as notes with
 *  text, so an account record or a header elsewhere in the file is not mistaken for a note. */
export function findNotes(json) {
  let raws = [];
  const named = new Map(); // id -> name of every non-note object with both (notebooks listed by id)
  const walk = (v, folder, depth, list) => {
    if (raws.length > MAX_NOTES || depth > 24) return;
    if (Array.isArray(v)) { for (const x of v) walk(x, folder, depth + 1, v); return; }
    if (!isObj(v)) return;
    const nameKey = pickKey(v, CONTAINER_NAME);
    const idKey = pickKey(v, ID);
    // remember every object with an id and a name that is not a note with text: notes may point at it by id
    if (nameKey && idKey && pickKey(v, BODY) == null && typeof v[nameKey] === 'string' && v[nameKey].trim() && (typeof v[idKey] === 'string' || typeof v[idKey] === 'number')) named.set(String(v[idKey]), v[nameKey].trim().slice(0, 120));
    const f = noteFields(v);
    if (f) {
      raws.push(Object.assign(f, { folder: f.folder ?? folder ?? null, _list: list, _text: pickKey(v, BODY) != null }));
      return;
    }
    // a notebook: an object with its own name and a list of notes inside
    const ownName = nameKey && typeof v[nameKey] === 'string' && v[nameKey].trim() && holdsAnyNotes(v) ? v[nameKey].trim().slice(0, 120) : null;
    const many = Object.keys(v).length;
    for (const [k, child] of Object.entries(v)) {
      if (child === null || typeof child !== 'object') continue;
      // a map from notebook names to lists of notes ({ "Recipes": [...] }) names the notebook by its key
      const keyAsName = !ownName && !STRUCTURAL.has(norm(k)) && (holdsNotes(child) || (isObj(child) && holdsAnyNotes(child))) ? k.trim().slice(0, 120) : null;
      walk(child, ownName ?? keyAsName ?? folder, depth + 1, many > 1 && !Array.isArray(child) && isObj(child) && Object.values(child).every(isObj) ? child : list);
    }
  };
  walk(json, null, 0, null);
  const withText = raws.filter(r => r._text);
  if (withText.length) {
    const lists = new Set(withText.map(r => r._list));
    raws = raws.filter(r => r._text || (r._list && lists.has(r._list)));
  }
  for (const r of raws) {
    if (r.folder == null && r.folderRef != null && named.has(r.folderRef)) r.folder = named.get(r.folderRef);
    delete r._list; delete r._text; delete r.folderRef;
  }
  return { notes: raws, certain: withText.length > 0 };
}
const holdsAnyNotes = o => Object.values(o).some(v => v && typeof v === 'object' && holdsNotes(v));

/* ---------------- the shape of the file (key names only) ---------------- */

// a key name is shown in the report when it reads like a field name (starts lower case or with _ and has no spaces) or is a
// word every export uses; a key that reads like someone's words ("Recipes", "Gift ideas", "\u00d6l\u00e7\u00fcler") is counted, not shown
const KNOWN = new Set([...BODY, ...TITLE, ...CREATED, ...MODIFIED, ...DATE, ...FOLDER, ...ID, ...CONTAINER_NAME, ...STRUCTURAL, 'type', 'kind', 'version', 'count', 'total', 'color', 'colour', 'tags', 'tag', 'labels', 'pinned', 'deleted', 'archived', 'trashed', 'starred', 'user', 'account', 'owner', 'meta', 'metadata', 'format', 'encoding', 'calendar', 'calendars', 'events', 'event']);
const SAFE_KEY = { test: k => (/^[a-z_$][A-Za-z0-9_$\-]{0,47}$/.test(k)) || (/^[A-Za-z][A-Za-z0-9_]{0,47}$/.test(k) && KNOWN.has(norm(k))) };
const typeOf = v => (v === null ? 'null' : Array.isArray(v) ? 'array' : typeof v === 'string' ? (v === '' ? 'empty text' : 'text') : typeof v);
function newShape() { return { n: 0, types: {}, keys: new Map(), item: null, hidden: 0, map: false }; }
/** Merges the shape of a value into a shape node. Objects with many or non-name keys (a map from notebook names or ids
 *  to notes) are kept as one merged "entries" node, so the report never shows a key that might be someone's words. */
function addShape(node, v, depth = 0) {
  node.n++;
  const t = typeOf(v);
  node.types[t] = (node.types[t] || 0) + 1;
  if (depth > 20) return node;
  if (t === 'array') { if (!node.item) node.item = newShape(); const lim = Math.min(v.length, 5000); for (let i = 0; i < lim; i++) addShape(node.item, v[i], depth + 1); node.len = (node.len || 0) + v.length; }
  else if (t === 'object') {
    const keys = Object.keys(v);
    const hiddenKeys = keys.filter(k => !SAFE_KEY.test(k)).length;
    const mapLike = keys.length > 40 || (hiddenKeys >= 2 && hiddenKeys * 2 >= keys.length && keys.every(k => v[k] !== null && typeof v[k] === 'object'));
    if (mapLike) {
      node.map = true;
      if (!node.item) node.item = newShape();
      for (const k of keys.slice(0, 5000)) addShape(node.item, v[k], depth + 1);
      node.len = (node.len || 0) + keys.length;
      return node;
    }
    for (const k of keys) {
      const shown = SAFE_KEY.test(k) ? k : null;
      if (!shown) { node.hidden++; continue; }
      if (!node.keys.has(shown)) node.keys.set(shown, newShape());
      addShape(node.keys.get(shown), v[k], depth + 1);
    }
  }
  return node;
}
export function describe(json) { return addShape(newShape(), json); }

const typesText = node => Object.entries(node.types).sort((a, b) => b[1] - a[1]).map(([t, c]) => `${t} ${c}`).join(', ');
function reportLines(node, label, indent, out) {
  const pad = '  '.repeat(indent);
  const kind = node.map ? `entries keyed by name or id (${node.len || 0}, names hidden)` : node.item ? `list (${node.len || 0} items)` : typesText(node);
  out.push(`${pad}${label}: ${kind}`);
  if (node.keys.size || node.hidden) {
    for (const [k, child] of node.keys) reportLines(child, k, indent + 1, out);
    if (node.hidden) out.push(`${pad}  (${node.hidden} key${node.hidden === 1 ? '' : 's'} with other characters, names hidden)`);
  }
  if (node.item) reportLines(node.item, node.map ? '[each entry]' : '[each item]', indent + 1, out);
  if (out.length > 400) return;
}

/** The text the "Copy the structure report" button copies: key names, value types and counts. No note text, no
 *  titles, no notebook names, no file names. The page shows exactly this text before it is copied. */
const extOf = name => (/\.([a-z0-9]{1,8})$/i.exec(String(name).split(' > ').pop()) || [])[1] || 'none';
export function structureReport(docs, extra = {}) {
  const out = ['Lastleaf structure report (key names and counts only; no note text, titles, names or dates)', `Made ${new Date().toISOString().slice(0, 10)}`];
  docs.forEach((d, i) => {
    const ext = extOf(d.name);
    out.push('', `File ${i + 1}: .${ext.toLowerCase()}, ${Math.max(1, Math.round((d.bytes || 0) / 1024))} KB${String(d.name).includes(' > ') ? ', inside a ZIP' : ''}`);
    reportLines(describe(d.json), 'top level', 1, out);
  });
  if (extra.calendars) out.push('', `Calendar files set aside: ${extra.calendars}`);
  if (Array.isArray(extra.problems) && extra.problems.length) {
    out.push('', 'Files that could not be read (type, size and reason only):');
    for (const p of extra.problems.slice(0, 50)) {
      const x = extOf(p.name);
      out.push(`  .${x.toLowerCase()}${p.bytes ? `, ${Math.max(1, Math.round(p.bytes / 1024))} KB` : ''}${String(p.name).includes(' > ') ? ', inside a ZIP' : ''}: ${p.code}`);
    }
  } else if (extra.problems) out.push(`Files that could not be read: ${extra.problems}`);
  if (!docs.length) out.push('', 'No file could be read as JSON, so there are no key names to show.');
  return out.slice(0, 600).join('\n');
}

/** The lists in a file that could hold the notes: every list (or map) of objects, with the keys their items share. */
export function listCandidates(json) {
  const found = [];
  const visit = (node, path) => {
    if (node.item) {
      const it = node.item;
      if (it.types.object) found.push({ path: path.concat(node.map ? '{}' : '[]'), count: node.len || 0, keys: [...it.keys.entries()].map(([k, s]) => ({ key: k, n: s.n, types: s.types })) });
      visit(it, path.concat(node.map ? '{}' : '[]'));
    }
    for (const [k, child] of node.keys) visit(child, path.concat(k));
  };
  visit(describe(json), []);
  return found.sort((a, b) => b.count - a.count).slice(0, 40);
}
export const pathLabel = p => (p.length ? p.map(s => (s === '[]' ? '[list]' : s === '{}' ? '[entries]' : s)).join(' > ') : 'the whole file');

/** The objects at a path such as ['notebooks', '[]', 'notes', '[]'], each with its parents (for the notebook name). */
function collect(json, path) {
  let level = [{ v: json, parents: [] }];
  for (const seg of path) {
    const next = [];
    for (const { v, parents } of level) {
      if (seg === '[]') { if (Array.isArray(v)) for (const x of v) next.push({ v: x, parents: parents.concat([v]) }); }
      else if (seg === '{}') { if (isObj(v)) for (const [k, x] of Object.entries(v)) next.push({ v: x, parents: parents.concat([{ __key: k }]) }); }
      else if (isObj(v) && seg in v) next.push({ v: v[seg], parents: parents.concat([v]) });
    }
    level = next;
    if (level.length > MAX_NOTES) level = level.slice(0, MAX_NOTES);
  }
  return level;
}

/** Notes from the fields the person picked. mapping: { path, title, body, created, modified, folder } (keys of the
 *  items), where folder may also be 'parent:<key>' (a field of the object that holds the list) or 'parent:#key'. */
export function applyMapping(json, m) {
  const items = collect(json, m.path || []);
  const out = [];
  for (const { v, parents } of items) {
    if (!isObj(v)) continue;
    let folder = null;
    if (m.folder && m.folder.startsWith('parent:')) {
      const k = m.folder.slice(7);
      for (let i = parents.length - 1; i >= 0 && folder == null; i--) {
        const p = parents[i];
        if (k === '#key' && p && p.__key != null) folder = String(p.__key).slice(0, 120);
        else if (isObj(p) && !p.__key && k in p) folder = folderName(p[k]);
      }
    } else if (m.folder) folder = folderName(v[m.folder]);
    const body = m.body ? bodyValue(v[m.body]) : null;
    const title = m.title != null && v[m.title] != null && typeof v[m.title] !== 'object' ? String(v[m.title]) : null;
    out.push({ title, body: body ?? '', created: m.created ? parseDate(v[m.created]) : null, modified: m.modified ? parseDate(v[m.modified]) : null, folder, id: null });
  }
  return out;
}

/** A first guess for the mapping screen, from the key names of the candidate's items. */
export function guessMapping(cand) {
  const keys = Object.fromEntries(cand.keys.map(k => [k.key, true]));
  const pick = list => pickKey(keys, list);
  return { path: cand.path, title: pick(TITLE), body: pick(BODY), created: pick(CREATED) ?? pick(DATE), modified: pick(MODIFIED), folder: pick(FOLDER) };
}

/* ---------------- the notes, ready to show ---------------- */

const lf = s => String(s).replace(/\r\n?/g, '\n');
/** Numbered notes with text and safe HTML, newest first (notes with no date last), and the notebooks with their counts. */
export function normalise(raws, source = '') {
  const notes = [];
  for (const r of raws) {
    if (notes.length >= MAX_NOTES) break;
    const raw = lf(r.body ?? '');
    const isHtml = looksLikeHtml(raw);
    const text = isHtml ? htmlToText(raw) : raw.replace(/[ \t]+$/gm, '').replace(/^\n+|\n+$/g, '');
    const title = lf(r.title ?? '').replace(/\s+/g, ' ').trim().slice(0, 300);
    const created = r.created ?? null, modified = r.modified ?? null;
    notes.push({
      n: 0,
      title,
      text,
      html: isHtml ? safeHtml(raw) : null,
      folder: (r.folder ?? '').toString().trim(),
      created,
      modified: modified ?? created,
      src: r.src ?? source,
      id: r.id ?? null,
    });
  }
  notes.sort((a, b) => (b.modified ?? -Infinity) - (a.modified ?? -Infinity) || a.title.localeCompare(b.title));
  notes.forEach((x, i) => { x.n = i; });
  const counts = new Map();
  for (const x of notes) counts.set(x.folder, (counts.get(x.folder) || 0) + 1);
  const folders = [...counts.entries()].map(([name, count]) => ({ name, count })).sort((a, b) => (a.name === '' ? 1 : b.name === '' ? -1 : a.name.localeCompare(b.name)));
  return { notes, folders };
}

export { shownTitle, fold, haystack, search } from './notes.js';

/* ---------------- the whole job: files in, notes out ---------------- */

/** Reads the files and finds the notes. When a file's notes cannot be found with confidence, it is returned in
 *  `unsure` for the mapping screen; the notes that were found are kept. */
export function openFiles(files) {
  const { docs, calendars, problems } = readFiles(files);
  const raws = [];
  const unsure = [];
  const calendarDocs = [];
  for (const d of docs) {
    const f = findNotes(d.json);
    if (f.certain) { for (const r of f.notes) r.src = d.name; raws.push(...f.notes); continue; }
    if (!f.notes.length && looksLikeCalendarDoc(d)) { calendarDocs.push(d.name); continue; }
    unsure.push({ name: d.name, guess: f.notes.length, candidates: listCandidates(d.json) });
  }
  return { raws, unsure, calendars: calendars.concat(calendarDocs), problems, docs };
}
function looksLikeCalendarDoc(d) {
  if (looksLikeCalendarName(d.name)) return true;
  let events = 0, seen = 0;
  const walk = (v, depth) => {
    if (seen > 2000 || depth > 12) return;
    if (Array.isArray(v)) { for (const x of v) walk(x, depth + 1); return; }
    if (!isObj(v)) return;
    seen++;
    if (isEvent(v)) { events++; return; }
    for (const x of Object.values(v)) if (x && typeof x === 'object') walk(x, depth + 1);
  };
  walk(d.json, 0);
  return events > 0;
}
