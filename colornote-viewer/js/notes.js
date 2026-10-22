/* Turns the records of a ColorNote backup into notes, and notes into the files Notelift saves. Plain functions with no
 * browser APIs, so the worker, the page and the Node tests all use the same code. Nothing here sends or stores anything.
 *
 * Record fields (checked on real ColorNote 4.x backups): title, note (the text; a checklist is one line per item, "[ ]"
 * open and "[V]" ticked), note_ext (JSON with format_list: bold, italic, underline, strike, headline1, headline2, bg_color,
 * url, each with start and end offsets in the text), type (0 text, 16 checklist, 128 folder, 256 settings), color_index
 * (1 red, 2 orange, 3 yellow, 4 green, 5 blue, 6 purple, 7 black, 8 gray, 9 white), folder_id, space (16 archived),
 * active_state (0 shown, 16 in the trash, 32 deleted for good, 256 kept by the app itself), encrypted (1: locked in
 * ColorNote with its own password; the text is not readable from the backup), created_date and modified_date
 * (milliseconds), reminder_type (16 a day, 32 a day and time), reminder_date, reminder_base, reminder_repeat
 * (0 once, 16 daily, 32 and 48 weekly, 80 and 96 monthly, 112 yearly), tags, uuid. A folder record carries its name in
 * title and {"folder_id": n} in note. */

export const COLOR_KEYS = ['none', 'red', 'orange', 'yellow', 'green', 'blue', 'purple', 'black', 'gray', 'white'];
export const COLOR_HEX = { none: '#d9dde0', red: '#e85b4a', orange: '#f29a3f', yellow: '#f3cf45', green: '#68bb6c', blue: '#5ea2e4', purple: '#a57ed6', black: '#3b4046', gray: '#a8afb4', white: '#ffffff' };
export const FOLDER_NONE = 0, FOLDER_CALENDAR = 16;
const REPEAT = { 0: 'once', 16: 'day', 32: 'week', 48: 'week', 80: 'month', 96: 'month', 112: 'year' };
const FORMATS = new Set(['bold', 'italic', 'underline', 'strike', 'headline1', 'headline2', 'bg_color', 'url']);

const num = v => (typeof v === 'number' && Number.isFinite(v) ? v : typeof v === 'string' && /^-?\d+$/.test(v) ? Number(v) : null);
const date = v => { const n = num(v); return n != null && n > 9.4e11 && n < 4.2e12 ? n : null; };
const str = v => (typeof v === 'string' ? v : v == null ? '' : String(v));
const lf = s => s.replace(/\r\n?/g, '\n');

/** "[ ] milk" / "[V] eggs" lines of a checklist note. Lines without a box are kept as unticked items. */
export function checklistItems(text) {
  const lines = lf(text).split('\n');
  while (lines.length && lines[lines.length - 1] === '') lines.pop();
  return lines.map(line => {
    const m = /^\[([ VvXx])\] ?(.*)$/.exec(line);
    return m ? { done: m[1] !== ' ', text: m[2] } : { done: false, text: line, bare: true };
  });
}

function formatList(ext, textLength) {
  if (!ext || typeof ext !== 'string') return null;
  let j;
  try { j = JSON.parse(ext); } catch (e) { return null; }
  const list = j && Array.isArray(j.format_list) ? j.format_list : null;
  if (!list) return null;
  const out = [];
  for (const f of list) {
    if (!f || !FORMATS.has(f.format)) continue;
    const s = num(f.start), e = num(f.end);
    if (s == null || e == null || s < 0 || e <= s || s >= textLength) continue;
    out.push({ f: f.format, s, e: Math.min(e, textLength), a: typeof f.attribute === 'string' ? f.attribute.slice(0, 2048) : '' });
  }
  return out.length ? out : null;
}

function reminderOf(r) {
  const at = date(r.reminder_date) || date(r.reminder_base);
  if (!at) return null;
  const type = num(r.reminder_type);
  const rep = num(r.reminder_repeat) || 0;
  return { at, allDay: type === 16, repeat: REPEAT[rep] || 'once' };
}

/**
 * The notes, folders and counts of a backup's records. Locked notes keep their title and dates; their text stays out.
 * Settings, folder records, notes deleted for good and the app's own empty records are counted, not shown.
 */
export function normalise(records) {
  const folders = new Map();
  const notes = [];
  const skipped = { settings: 0, deleted: 0, internal: 0 };
  for (const r of records) {
    if (num(r.type) === 128) {
      let fid = null;
      try { const j = JSON.parse(str(r.note)); fid = num(j && j.folder_id); } catch (e) { /* not a folder record after all */ }
      if (fid != null) folders.set(fid, { id: fid, name: str(r.title).trim(), color: COLOR_KEYS[num(r.color_index)] || 'none', order: num(r._id) || 0 });
    }
  }
  for (const r of records) {
    const type = num(r.type) || 0;
    const state = num(r.active_state) || 0;
    if (type === 128) continue;
    if (type === 256 || r.title === 'syncable_settings' || r.title === 'name_master_password') { skipped.settings++; continue; }
    if (state === 32) { skipped.deleted++; continue; }
    if (state === 256) { skipped.internal++; continue; }
    const locked = num(r.encrypted) === 1 || r.encrypted === true;
    const text = locked ? '' : lf(str(r.note));
    const kind = type === 16 ? 'list' : 'text';
    const title = lf(str(r.title)).trim();
    const folder = num(r.folder_id) || 0;
    const tags = str(r.tags).split(/[,\n]/).map(t => t.trim()).filter(Boolean).slice(0, 50);
    const n = {
      n: notes.length,
      id: num(r._id),
      uuid: str(r.uuid) || null,
      title,
      text,
      kind,
      items: kind === 'list' && !locked ? checklistItems(text) : null,
      color: COLOR_KEYS[num(r.color_index)] ? num(r.color_index) : 0,
      folder,
      where: state === 16 ? 'trash' : num(r.space) === 16 ? 'archive' : 'notes',
      locked,
      created: date(r.created_date),
      modified: date(r.modified_date) || date(r.created_date),
      reminder: reminderOf(r),
      tags,
      fmt: kind === 'text' && !locked ? formatList(r.note_ext, text.length) : null,
    };
    if (!folders.has(folder) && folder !== FOLDER_NONE && folder !== FOLDER_CALENDAR) folders.set(folder, { id: folder, name: '', color: 'none', order: 1e9 + folder });
    notes.push(n);
  }
  const folderList = [...folders.values()].sort((a, b) => a.order - b.order);
  return { notes, folders: folderList, skipped };
}

/** The title a note is shown with: its own, else the first line of its text (as ColorNote does), else ''. */
export function shownTitle(n) {
  if (n.title) return n.title;
  const first = n.kind === 'list' && n.items && n.items.length ? n.items[0].text : (n.text.split('\n').find(l => l.trim()) || '');
  return first.trim().slice(0, 120);
}

// search: case-insensitive, and accents on Latin letters do not matter (nao finds não), other scripts as written
export const fold = s => String(s).toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').normalize('NFC');
export const haystack = n => fold(`${n.title}\n${n.text}\n${n.tags.join(' ')}`);

/** The note as plain text, the way the TXT files have it. L: the page's words (see i18n.js `labels`). */
export function noteBody(n, L) {
  if (n.locked) return L.lockedBody;
  if (n.kind === 'list') return n.items.map(i => (i.bare ? i.text : `[${i.done ? 'x' : ' '}] ${i.text}`)).join('\n');
  return n.text;
}

const pad2 = v => String(v).padStart(2, '0');
export function isoLocal(ms) {
  if (!ms) return '';
  const d = new Date(ms);
  return `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())} ${pad2(d.getHours())}:${pad2(d.getMinutes())}`;
}
export function isoDay(ms, utc = false) {
  if (!ms) return '';
  const d = new Date(ms);
  return utc ? `${d.getUTCFullYear()}-${pad2(d.getUTCMonth() + 1)}-${pad2(d.getUTCDate())}` : `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())}`;
}
// an all-day reminder is stored as midnight UTC of its day
export const reminderText = (r, L) => (r ? `${r.allDay ? isoDay(r.at, true) : isoLocal(r.at)}${r.repeat !== 'once' ? ` (${L.repeat[r.repeat]})` : ''}` : '');

export function folderName(id, folders, L) {
  if (id === FOLDER_NONE) return L.folderNone;
  if (id === FOLDER_CALENDAR) return L.folderCalendar;
  const f = folders.find(x => x.id === id);
  return f && f.name ? f.name : L.folderNumber.replace('{n}', String(id));
}

function metaLines(n, folders, L) {
  const out = [];
  if (n.created) out.push(`${L.created}: ${isoLocal(n.created)}`);
  if (n.modified && n.modified !== n.created) out.push(`${L.modified}: ${isoLocal(n.modified)}`);
  out.push(`${L.colour}: ${L.colors[COLOR_KEYS[n.color]]}`);
  out.push(`${L.folder}: ${folderName(n.folder, folders, L)}`);
  if (n.where !== 'notes') out.push(`${L.place}: ${L.places[n.where]}`);
  if (n.reminder) out.push(`${L.reminder}: ${reminderText(n.reminder, L)}`);
  if (n.tags.length) out.push(`${L.tags}: ${n.tags.join(', ')}`);
  return out;
}

/** Several notes in one text file, each under its title and its details. */
export function textBundle(notes, folders, L) {
  return '﻿' + notes.map(n => {
    const t = shownTitle(n) || L.untitled;
    return [t, '='.repeat(Math.min(60, Math.max(3, [...t].length))), ...metaLines(n, folders, L), '', noteBody(n, L)].join('\r\n');
  }).join('\r\n\r\n\r\n') + '\r\n';
}

/** One note as a text file of its own. */
export const noteFileText = (n, folders, L) => textBundle([n], folders, L);

const yamlStr = s => JSON.stringify(String(s));
/** One note as Markdown with its details in front matter (Obsidian, Bear, Joplin and Apple Notes read it). */
export function noteMarkdown(n, folders, L, plain = false) {
  if (plain) {
    // for Notes on a Mac: the title as the first line (Notes makes it the note's title), the details in one line at the end
    const body = n.locked ? L.lockedBody : n.kind === 'list' ? n.items.map(i => (i.bare ? i.text : `- [${i.done ? 'x' : ' '}] ${i.text}`)).join('\n') : markdownText(n.text, n.fmt);
    return `# ${shownTitle(n) || L.untitled}\n\n${body}\n\n*${metaLines(n, folders, L).join('; ')}*\n`;
  }
  const fm = ['---', `title: ${yamlStr(shownTitle(n) || L.untitled)}`];
  if (n.created) fm.push(`created: ${new Date(n.created).toISOString()}`);
  if (n.modified) fm.push(`modified: ${new Date(n.modified).toISOString()}`);
  fm.push(`colour: ${COLOR_KEYS[n.color]}`, `folder: ${yamlStr(folderName(n.folder, folders, L))}`);
  if (n.where !== 'notes') fm.push(`place: ${n.where}`);
  if (n.reminder) fm.push(`reminder: ${yamlStr(reminderText(n.reminder, L))}`);
  if (n.locked) fm.push('locked: true');
  const tags = n.tags.map(t => t.replace(/\s+/g, '-')).concat(n.color ? [`colornote/${COLOR_KEYS[n.color]}`] : []);
  if (tags.length) fm.push(`tags: [${tags.map(yamlStr).join(', ')}]`);
  fm.push('---', '');
  let body;
  if (n.locked) body = L.lockedBody;
  else if (n.kind === 'list') body = n.items.map(i => (i.bare ? i.text : `- [${i.done ? 'x' : ' '}] ${i.text}`)).join('\n');
  else body = markdownText(n.text, n.fmt);
  return fm.join('\n') + body + '\n';
}

// ColorNote's formatting as Markdown: bold, italic, strike, headings and links; underline and highlight have no Markdown
function markdownText(text, fmt) {
  if (!fmt) return text;
  const segs = segments(text, fmt);
  let out = '';
  for (const g of segs) {
    let t = g.text;
    const has = f => g.f.some(x => x.f === f);
    const parts = t.split('\n');
    t = parts.map(p => {
      if (!p.trim()) return p;
      const lead = p.match(/^\s*/)[0], trail = p.match(/\s*$/)[0];
      let core = p.slice(lead.length, p.length - trail.length);
      const url = g.f.find(x => x.f === 'url');
      if (url && /^https?:\/\//i.test(url.a || core)) core = `[${core}](${url.a || core})`;
      if (has('strike')) core = `~~${core}~~`;
      if (has('italic')) core = `*${core}*`;
      if (has('bold')) core = `**${core}**`;
      return lead + core + trail;
    }).join('\n');
    out += t;
  }
  // headings: a line that is wholly inside a headline span
  const lines = out.split('\n');
  let at = 0;
  const plainLines = text.split('\n');
  return lines.map((line, i) => {
    const start = at, end = at + (plainLines[i] || '').length;
    at = end + 1;
    const h = fmt.find(x => (x.f === 'headline1' || x.f === 'headline2') && x.s <= start && x.e >= end && end > start);
    return h ? `${h.f === 'headline1' ? '#' : '##'} ${line.replace(/^\*\*(.*)\*\*$/, '$1')}` : line;
  }).join('\n');
}

/** The text cut where formatting starts or stops, each piece with the formats that cover all of it. */
export function segments(text, fmt) {
  const cuts = new Set([0, text.length]);
  for (const f of fmt || []) { cuts.add(Math.min(f.s, text.length)); cuts.add(Math.min(f.e, text.length)); }
  const pts = [...cuts].sort((a, b) => a - b);
  const out = [];
  for (let i = 0; i < pts.length - 1; i++) {
    const s = pts[i], e = pts[i + 1];
    if (e > s) out.push({ text: text.slice(s, e), f: (fmt || []).filter(x => x.s <= s && x.e >= e) });
  }
  return out;
}

const escHtml = s => String(s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
export { escHtml };
const HIGHLIGHT = /^highlight_(red|orange|yellow|green|blue|purple|black|gray|white)$/;

/** A text note as safe HTML for the reading pane: everything escaped, formatting as b, i, u, s, mark, strong.cn-h1/h2,
 * and links only for http and https addresses (opened in a new tab without a referrer). Line breaks stay as text
 * (the pane uses white-space: pre-wrap). */
export function noteHtml(text, fmt) {
  if (!fmt) return escHtml(text);
  return segments(text, fmt).map(g => {
    let h = escHtml(g.text);
    const has = f => g.f.some(x => x.f === f);
    if (has('strike')) h = `<s>${h}</s>`;
    if (has('underline')) h = `<u>${h}</u>`;
    if (has('italic')) h = `<i>${h}</i>`;
    if (has('bold')) h = `<b>${h}</b>`;
    const bg = g.f.find(x => x.f === 'bg_color');
    if (bg) { const m = HIGHLIGHT.exec(bg.a || ''); h = `<mark class="cn-mark cn-mark-${m ? m[1] : 'yellow'}">${h}</mark>`; }
    const hl = g.f.find(x => x.f === 'headline1' || x.f === 'headline2');
    if (hl) h = `<strong class="cn-${hl.f === 'headline1' ? 'h1' : 'h2'}">${h}</strong>`;
    const url = g.f.find(x => x.f === 'url');
    const href = url && (/^https?:\/\/[^\s"'<>]+$/i.test(url.a) ? url.a : /^https?:\/\/[^\s"'<>]+$/i.test(g.text.trim()) ? g.text.trim() : null);
    if (href) h = `<a href="${escHtml(href)}" target="_blank" rel="noopener noreferrer nofollow">${h}</a>`;
    return h;
  }).join('');
}

/** CSV for a spreadsheet: one row per note. Cells that a spreadsheet would run as a formula start with an apostrophe. */
export function notesCsv(notes, folders, L) {
  const cell = v => {
    let s = v == null ? '' : String(v);
    if (/^[=+\-@\t\r]/.test(s)) s = `'${s}`;
    return /[",\r\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
  };
  const head = L.csvHead; // title, text, type, colour, folder, place, locked, created, modified, reminder, ticked, items, id
  const rows = notes.map(n => [
    shownTitle(n), noteBody(n, L), L.kinds[n.kind], L.colors[COLOR_KEYS[n.color]], folderName(n.folder, folders, L), L.places[n.where],
    n.locked ? L.yes : '', isoLocal(n.created), isoLocal(n.modified), reminderText(n.reminder, L),
    n.items ? n.items.filter(i => i.done).length : '', n.items ? n.items.length : '', n.uuid || n.id,
  ].map(cell).join(','));
  return '﻿' + [head.map(cell).join(','), ...rows].join('\r\n') + '\r\n';
}

/** JSON for other programs: the notes as Notelift reads them (no account data; the backup's sign-in record is never read). */
export function notesJson(notes, folders) {
  return JSON.stringify({
    format: 'notelift-notes', version: 1,
    folders: folders.map(f => ({ id: f.id, name: f.name, colour: f.color })),
    notes: notes.map(n => ({
      id: n.id, uuid: n.uuid, title: n.title, text: n.locked ? null : n.text, type: n.kind,
      checklist: n.items ? n.items.map(i => ({ done: i.done, text: i.text })) : undefined,
      colour: COLOR_KEYS[n.color], folder: n.folder, place: n.where, locked: n.locked,
      created: n.created ? new Date(n.created).toISOString() : null, modified: n.modified ? new Date(n.modified).toISOString() : null,
      reminder: n.reminder ? { at: new Date(n.reminder.at).toISOString(), allDay: n.reminder.allDay, repeat: n.reminder.repeat } : null,
      tags: n.tags, formatting: n.fmt || undefined,
    })),
  }, null, 2);
}

const xml = s => String(s).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c])).replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f￾￿]/g, '');
const enDate = ms => new Date(ms).toISOString().replace(/[-:]/g, '').replace(/\.\d+Z$/, 'Z');

/** Evernote's ENEX: Notes on a Mac imports it (File > Import to Notes) with each note's dates and ticked boxes. */
export function notesEnex(notes, L) {
  const body = notes.map(n => {
    let content;
    if (n.locked) content = `<div>${xml(L.lockedBody)}</div>`;
    else if (n.kind === 'list') content = n.items.map(i => `<div>${i.bare ? '' : `<en-todo checked="${i.done}"/>`}${xml(i.text) || '<br/>'}</div>`).join('');
    else content = n.text.split('\n').map(l => `<div>${xml(l) || '<br/>'}</div>`).join('');
    const tags = n.tags.map(t => `<tag>${xml(t)}</tag>`).join('');
    return `<note><title>${xml(shownTitle(n) || L.untitled)}</title><content><![CDATA[<?xml version="1.0" encoding="UTF-8" standalone="no"?><!DOCTYPE en-note SYSTEM "http://xml.evernote.com/pub/enml2.dtd"><en-note>${content.replace(/]]>/g, ']]]]><![CDATA[>')}</en-note>]]></content>${n.created ? `<created>${enDate(n.created)}</created>` : ''}${n.modified ? `<updated>${enDate(n.modified)}</updated>` : ''}${tags}</note>`;
  }).join('\n');
  return `<?xml version="1.0" encoding="UTF-8"?>\n<!DOCTYPE en-export SYSTEM "http://xml.evernote.com/pub/evernote-export4.dtd">\n<en-export application="Notelift" version="1">\n${body}\n</en-export>\n`;
}

/** One HTML document with every note under its own heading; Google Docs opens it as one document. */
export function notesDocHtml(notes, folders, L, lang) {
  const parts = notes.map(n => {
    const t = escHtml(shownTitle(n) || L.untitled);
    const meta = escHtml(metaLines(n, folders, L).join(' | '));
    let body;
    if (n.locked) body = `<p><em>${escHtml(L.lockedBody)}</em></p>`;
    else if (n.kind === 'list') body = `<ul>${n.items.map(i => `<li>${i.bare ? '' : i.done ? '☑ ' : '☐ '}${escHtml(i.text)}</li>`).join('')}</ul>`;
    else body = n.text.split(/\n{2,}/).map(p => `<p>${escHtml(p).replace(/\n/g, '<br>')}</p>`).join('');
    return `<h2>${t}</h2>\n<p style="color:#5b6670;font-size:10pt">${meta}</p>\n${body}`;
  });
  return `<!doctype html>\n<html lang="${escHtml(lang || 'en')}"><head><meta charset="utf-8"><title>${escHtml(L.docTitle)}</title></head><body>\n<h1>${escHtml(L.docTitle)}</h1>\n${parts.join('\n')}\n</body></html>\n`;
}

/** A file name from a title: no characters Windows, macOS or Android refuse, at most 80 characters, never hidden. */
export function safeName(title, fallback = 'Note') {
  const clean = [...String(title || '').normalize('NFC')].map(c => (c.charCodeAt(0) < 32 ? ' ' : c)).join('')
    .replace(/[\\/:*?"<>|#^[\]]/g, ' ').replace(/\s+/g, ' ').trim();
  const cut = [...clean].slice(0, 80).join('').replace(/^[. ]+|[. ]+$/g, '');
  const reserved = /^(con|prn|aux|nul|com\d|lpt\d)$/i.test(cut);
  return cut && !reserved ? cut : fallback;
}

/** Paths for one file per note: folder/title.ext, numbered when two notes share a title. Archive and Trash get folders. */
export function notePaths(notes, folders, L, ext) {
  const used = new Set();
  return notes.map(n => {
    const dir = [n.where === 'archive' ? safeName(L.places.archive) : n.where === 'trash' ? safeName(L.places.trash) : null, safeName(folderName(n.folder, folders, L), 'Notes')].filter(Boolean).join('/');
    const base = safeName(shownTitle(n), L.untitled);
    let p = `${dir}/${base}.${ext}`, i = 2;
    while (used.has(p.toLowerCase())) p = `${dir}/${base} (${i++}).${ext}`;
    used.add(p.toLowerCase());
    return p;
  });
}

const keyOf = n => n.uuid || `id:${n.id}:${n.created || ''}`;
const sig = n => JSON.stringify([n.title, n.locked ? null : n.text, n.color, n.folder, n.where, n.kind]);
/**
 * What changed between two backups, by each note's ColorNote id (uuid): added (only in the newer one), removed (only in
 * the older one), changed (title, text, colour, folder or place differ), and how many are the same. The older backup is
 * the one ColorNote made first (its header date), else the first one opened.
 */
export function compareNotes(older, newer) {
  const a = new Map(older.map(n => [keyOf(n), n])), b = new Map(newer.map(n => [keyOf(n), n]));
  const added = [], removed = [], changed = [];
  let same = 0;
  for (const [k, n] of b) {
    const o = a.get(k);
    if (!o) added.push(n);
    else if (sig(o) !== sig(n)) changed.push({ before: o, after: n, what: ['title', 'text', 'color', 'folder', 'where'].filter(f => JSON.stringify(o[f]) !== JSON.stringify(n[f])) });
    else same++;
  }
  for (const [k, n] of a) if (!b.has(k)) removed.push(n);
  const byTime = (x, y) => (y.modified || 0) - (x.modified || 0);
  return { added: added.sort(byTime), removed: removed.sort(byTime), changed: changed.sort((x, y) => byTime(x.after, y.after)), same };
}

/** Lines that differ between two texts: a plain longest-common-subsequence diff, for the compare view. */
export function lineDiff(before, after, max = 4000) {
  const A = before.split('\n'), B = after.split('\n');
  if (A.length * B.length > max * max) return [{ op: 'del', text: before }, { op: 'add', text: after }];
  const m = A.length, n = B.length;
  const L = Array.from({ length: m + 1 }, () => new Uint32Array(n + 1));
  for (let i = m - 1; i >= 0; i--) for (let j = n - 1; j >= 0; j--) L[i][j] = A[i] === B[j] ? L[i + 1][j + 1] + 1 : Math.max(L[i + 1][j], L[i][j + 1]);
  const out = [];
  let i = 0, j = 0;
  while (i < m && j < n) {
    if (A[i] === B[j]) { out.push({ op: 'same', text: A[i] }); i++; j++; }
    else if (L[i + 1][j] >= L[i][j + 1]) out.push({ op: 'del', text: A[i++] });
    else out.push({ op: 'add', text: B[j++] });
  }
  while (i < m) out.push({ op: 'del', text: A[i++] });
  while (j < n) out.push({ op: 'add', text: B[j++] });
  return out;
}

/** The notes in the archive and in the trash, newest first, for the restore list. */
export function restoreList(notes) {
  const byTime = (x, y) => (y.modified || 0) - (x.modified || 0);
  return { archive: notes.filter(n => n.where === 'archive').sort(byTime), trash: notes.filter(n => n.where === 'trash').sort(byTime) };
}
