/* Dayfold: reads the data inside a Daylio backup. Pure functions, no DOM and no network, so the same code runs in the
 * page's worker and in the Node tests.
 * The format is documented by github.com/JoelOtter/dayligo (MIT; structure.go, file.go) and
 * github.com/mbafford/daylio-markdown-export (README): a ZIP with "backup.daylio" (the journal as JSON, written in
 * base64, often in 76-character lines) and the photos under assets/photos/<year>/<month>/<checksum>. Entries carry
 * datetime (ms), timeZoneOffset (ms), year, month (0 for January), day, hour, minute, mood (a customMoods id), note
 * (HTML), note_title, tags (activity ids) and assets (asset ids). Backups made on an iPhone have no android_metadata on
 * their assets, and fields can be missing in older versions, so nothing here relies on any one of them being present.
 * The backup also holds the app's PIN in plain text; Dayfold never reads it. */

// The five built-in moods. predefined_name_id 1 to 5 (mbafford's table); a custom mood has -1 and its own name.
export const PREDEFINED = { 1: 'rad', 2: 'good', 3: 'meh', 4: 'bad', 5: 'awful' };

export class BackupError extends Error {
  constructor(code, detail) { super(code); this.code = code; this.detail = detail || ''; }
}

const num = (v, d = null) => (typeof v === 'number' && Number.isFinite(v) ? v : typeof v === 'string' && v.trim() !== '' && Number.isFinite(Number(v)) ? Number(v) : d);
const str = v => (typeof v === 'string' ? v : v == null ? '' : String(v));
const arr = v => (Array.isArray(v) ? v : []);
const p2 = n => String(n).padStart(2, '0');

/* ---------- the backup text: base64 of UTF-8 JSON (or the JSON itself) ---------- */
export function decodeBackupText(text) {
  const t = str(text).replace(/^\uFEFF/, '').trim();
  if (!t) throw new BackupError('empty');
  let json = t;
  if (t[0] !== '{') {
    const b64 = t.replace(/\s+/g, '');
    if (!/^[A-Za-z0-9+/_-]+={0,2}$/.test(b64)) throw new BackupError('notbackup');
    let bin;
    try { bin = atob(b64.replace(/-/g, '+').replace(/_/g, '/')); } catch (e) { throw new BackupError('base64'); }
    const bytes = new Uint8Array(bin.length);
    for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
    json = new TextDecoder('utf-8').decode(bytes).replace(/^\uFEFF/, '');
  }
  let data;
  try { data = JSON.parse(json); } catch (e) { throw new BackupError(t[0] === '{' ? 'json' : 'base64'); }
  if (!data || typeof data !== 'object' || Array.isArray(data)) throw new BackupError('notdaylio');
  if (!('dayEntries' in data) && !('customMoods' in data) && !('tags' in data)) throw new BackupError('notdaylio');
  return data;
}

/* ---------- notes: Daylio keeps them as HTML. We keep only text and a few inline styles. ---------- */
const NAMED = { amp: '&', lt: '<', gt: '>', quot: '"', apos: "'", nbsp: '\u00a0', ndash: '\u2013', mdash: '\u2014', hellip: '\u2026', lsquo: '\u2018', rsquo: '\u2019', ldquo: '\u201c', rdquo: '\u201d', bull: '\u2022', middot: '\u00b7', euro: '\u20ac', copy: '\u00a9' };
export function decodeEntities(s) {
  return str(s).replace(/&(#x[0-9a-f]+|#[0-9]+|[a-z]+);/gi, (m, e) => {
    if (e[0] === '#') {
      const cp = e[1] === 'x' || e[1] === 'X' ? parseInt(e.slice(2), 16) : parseInt(e.slice(1), 10);
      return cp > 0 && cp <= 0x10ffff && !(cp >= 0xd800 && cp <= 0xdfff) ? String.fromCodePoint(cp) : '';
    }
    const v = NAMED[e.toLowerCase()];
    return v === undefined ? m : v;
  });
}
export const escHtml = s => str(s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const INLINE = { b: 'b', strong: 'b', i: 'i', em: 'i', u: 'u', s: 's', strike: 's', del: 's' };
const MD = { b: '**', i: '*', s: '~~', u: '' };
const BLOCK = new Set(['p', 'div', 'h1', 'h2', 'h3', 'h4', 'h5', 'h6', 'blockquote', 'pre', 'section', 'article', 'header', 'footer', 'tr', 'table']);
const DROP = new Set(['script', 'style', 'head', 'title', 'template', 'iframe', 'object', 'svg', 'math']);

// -> { html: safe HTML (only b, i, u, s, no attributes; line breaks as \n), text: plain text, md: Markdown }
export function noteParts(input) {
  const src = str(input);
  if (!src) return { html: '', text: '', md: '' };
  if (!/[<&]/.test(src)) {
    const t = src.replace(/\r\n?/g, '\n').replace(/\n{3,}/g, '\n\n').trim();
    return { html: escHtml(t), text: t, md: mdEscape(t) };
  }
  let html = '', text = '', md = '';
  const open = [];
  // an inline style around nothing (or only spaces) is dropped instead of written as an empty pair
  const push = k => { open.push({ k, html: html.length, md: md.length }); html += `<${k}>`; md += MD[k]; };
  const shut = o => {
    const inside = html.slice(o.html + o.k.length + 2);
    if (!inside.trim()) { html = html.slice(0, o.html) + inside; md = md.slice(0, o.md) + md.slice(o.md + MD[o.k].length); return; }
    html += `</${o.k}>`; md += MD[o.k];
  };
  const lists = [];
  let skip = 0;
  const nl = () => {
    if (!text || text.endsWith('\n\n')) return;
    html += '\n'; text += '\n'; md += '\n';
  };
  const re = /<!--[\s\S]*?-->|<\s*(\/?)\s*([a-zA-Z][a-zA-Z0-9]*)\b[^>]*?(\/?)\s*>|([^<]+)|(<)/g;
  let m;
  while ((m = re.exec(src))) {
    if (m[0].startsWith('<!--')) continue;
    if (m[2]) {
      const close = !!m[1], tag = m[2].toLowerCase();
      if (DROP.has(tag)) { if (!m[3]) skip += close ? -1 : 1; if (skip < 0) skip = 0; continue; }
      if (skip) continue;
      if (tag === 'br') { html += '\n'; text += '\n'; md += '  \n'; continue; }
      if (INLINE[tag]) {
        const k = INLINE[tag];
        if (!close) push(k);
        else {
          const at = open.map(o => o.k).lastIndexOf(k);
          if (at >= 0) {
            for (let j = open.length - 1; j >= at; j--) shut(open[j]);
            const again = open.slice(at + 1).map(o => o.k);
            open.length = at;
            for (const r of again) push(r);
          }
        }
        continue;
      }
      if (tag === 'ul' || tag === 'ol') {
        if (!close) lists.push({ ordered: tag === 'ol', n: 0 }); else lists.pop();
        nl();
        continue;
      }
      if (tag === 'li') {
        if (close) continue;
        if (text && !text.endsWith('\n')) { html += '\n'; text += '\n'; md += '\n'; }
        const l = lists[lists.length - 1];
        const mark = l && l.ordered ? `${++l.n}. ` : '\u2022 ';
        const mdMark = l && l.ordered ? `${l.n}. ` : '- ';
        const pad = '  '.repeat(Math.max(0, lists.length - 1));
        html += pad + mark; text += pad + mark; md += pad + mdMark;
        continue;
      }
      if (BLOCK.has(tag)) { nl(); if (!close && text && !text.endsWith('\n')) { html += '\n'; text += '\n'; md += '\n'; } continue; }
      continue; // any other tag (span, font, a, img...) is dropped, its text kept
    }
    if (skip) continue;
    const t = decodeEntities(m[4] != null ? m[4] : m[5]).replace(/\r\n?|\n/g, ' ');
    html += escHtml(t); text += t; md += mdEscape(t);
  }
  for (let j = open.length - 1; j >= 0; j--) shut(open[j]);
  const tidy = s => s.replace(/[ \t\u00a0]+\n/g, '\n').replace(/\n{3,}/g, '\n\n').replace(/^\s+|\s+$/g, '');
  // inline tags left empty by the tidy-up (<b></b>) are dropped
  html = tidy(html).replace(/<(b|i|u|s)>(\s*)<\/\1>/g, '$2');
  return { html, text: tidy(text), md: tidy(md) };
}
function mdEscape(t) {
  return t.replace(/([\\`*_[\]<>|])/g, '\\$1').replace(/^(\s*)([#>+=-]|\d+\.)(\s)/gm, '$1\\$2$3');
}

/* ---------- the journal ---------- */
const validDate = (y, m, d) => y >= 1970 && y <= 2200 && m >= 0 && m <= 11 && d >= 1 && d <= new Date(Date.UTC(y, m + 1, 0)).getUTCDate();

export function moodScore(group) { return group >= 1 && group <= 5 ? 6 - group : null; }

export function normalise(data) {
  const problems = { entriesSkipped: 0, unknownMood: 0, unknownTags: 0 };
  // moods
  const moods = [];
  const moodById = new Map();
  for (const m of arr(data.customMoods)) {
    if (!m || typeof m !== 'object') continue;
    const id = num(m.id);
    if (id == null) continue;
    const pre = num(m.predefined_name_id);
    let group = num(m.mood_group_id);
    if (!(group >= 1 && group <= 5)) group = pre >= 1 && pre <= 5 ? pre : null;
    if (group == null) continue;
    const custom = str(m.custom_name).trim();
    const mood = { id, name: custom, pre: !custom && pre >= 1 && pre <= 5 ? pre : null, group, score: moodScore(group), order: num(m.mood_group_order, 0), state: num(m.state, 0) };
    if (!mood.name && !mood.pre) mood.pre = group;
    moods.push(mood);
    moodById.set(id, mood);
  }
  // a backup with no mood list still has the five built-in moods, with ids 1 to 5
  for (let g = 1; g <= 5; g++) if (!moods.some(x => x.pre === g || x.id === g) && !moodById.has(g)) {
    const mood = { id: g, name: '', pre: g, group: g, score: moodScore(g), order: 0, state: 0, implied: true };
    moods.push(mood); moodById.set(g, mood);
  }
  moods.sort((a, b) => a.group - b.group || a.order - b.order || a.id - b.id);

  // activity groups and activities
  const groups = arr(data.tag_groups).filter(g => g && typeof g === 'object' && num(g.id) != null)
    .map(g => ({ id: num(g.id), name: str(g.name).trim(), order: num(g.order, 0) }))
    .sort((a, b) => a.order - b.order);
  const tags = [];
  const tagById = new Map();
  for (const t of arr(data.tags)) {
    if (!t || typeof t !== 'object') continue;
    const id = num(t.id);
    if (id == null || tagById.has(id)) continue;
    const tag = { id, name: str(t.name).trim() || `#${id}`, group: num(t.id_tag_group), order: num(t.order, 0), state: num(t.state, 0) };
    tags.push(tag); tagById.set(id, tag);
  }

  // assets (photos, voice notes)
  const assets = new Map();
  for (const a of arr(data.assets)) {
    if (!a || typeof a !== 'object') continue;
    const id = num(a.id);
    if (id == null) continue;
    const type = num(a.type) === 1 ? 'photo' : num(a.type) === 2 ? 'audio' : 'other';
    let name = '';
    if (typeof a.android_metadata === 'string') { try { name = str((JSON.parse(a.android_metadata) || {}).Name); } catch (e) { /* not needed */ } }
    else if (a.android_metadata && typeof a.android_metadata === 'object') name = str(a.android_metadata.Name);
    const created = num(a.createdAt);
    const ym = created != null ? new Date(created + (num(a.createdAtOffset, 0) || 0)) : null;
    assets.set(id, { id, type, checksum: str(a.checksum).trim(), name, y: ym ? ym.getUTCFullYear() : null, m: ym ? ym.getUTCMonth() + 1 : null });
  }

  // entries
  const entries = [];
  for (const e of arr(data.dayEntries)) {
    if (!e || typeof e !== 'object') { problems.entriesSkipped++; continue; }
    let y = num(e.year), m = num(e.month), d = num(e.day), h = num(e.hour, 0), mi = num(e.minute, 0);
    const dt = num(e.datetime), off = num(e.timeZoneOffset, 0) || 0;
    if (!(y != null && m != null && d != null && validDate(y, m, d))) {
      if (dt == null) { problems.entriesSkipped++; continue; }
      const L = new Date(dt + off);
      y = L.getUTCFullYear(); m = L.getUTCMonth(); d = L.getUTCDate(); h = L.getUTCHours(); mi = L.getUTCMinutes();
      if (!validDate(y, m, d)) { problems.entriesSkipped++; continue; }
    }
    if (!(h >= 0 && h <= 23)) h = 0;
    if (!(mi >= 0 && mi <= 59)) mi = 0;
    const moodId = num(e.mood);
    let mood = moodById.get(moodId);
    if (!mood) { problems.unknownMood++; mood = null; }
    const tagIds = [];
    for (const t of arr(e.tags)) { const id = num(t); if (id == null) continue; if (tagById.has(id)) { if (!tagIds.includes(id)) tagIds.push(id); } else problems.unknownTags++; }
    const note = noteParts(e.note);
    const title = decodeEntities(str(e.note_title)).replace(/<[^>]*>/g, '').replace(/\s+/g, ' ').trim();
    entries.push({
      id: num(e.id, entries.length + 1), y, m, d, h, mi,
      key: `${y}-${p2(m + 1)}-${p2(d)}`, t: Date.UTC(y, m, d, h, mi) + (dt != null ? ((dt % 60000) + 60000) % 60000 : 0),
      dow: new Date(Date.UTC(y, m, d)).getUTCDay(),
      mood: mood ? mood.id : null, score: mood ? mood.score : null,
      title, html: note.html, text: note.text, md: note.md,
      tags: tagIds, assets: arr(e.assets).map(num).filter(a => a != null && assets.has(a)),
    });
  }
  entries.sort((a, b) => a.t - b.t || a.id - b.id);
  const meta = data.metadata && typeof data.metadata === 'object' ? data.metadata : {};
  return {
    version: num(data.version), platform: str(data.platform || meta.platform), moods, tags, groups, assets, entries, problems,
  };
}

/* ---------- photos and voice notes inside the ZIP ---------- */
// Photos sit at assets/photos/<year>/<month>/<checksum> with no extension (mbafford). We match on the file name, so other
// folders and an added extension also work.
export function assetIndex(names) {
  const byName = new Map();
  for (const n of names) {
    const base = n.split('/').pop();
    if (/^backup\.daylio$/i.test(base)) continue;
    if (!base) continue;
    byName.set(base.toLowerCase(), n);
    const dot = base.indexOf('.');
    if (dot > 0) byName.set(base.slice(0, dot).toLowerCase(), n);
  }
  return byName;
}

export function sniffMime(b) {
  if (!b || b.length < 12) return '';
  if (b[0] === 0xff && b[1] === 0xd8 && b[2] === 0xff) return 'image/jpeg';
  if (b[0] === 0x89 && b[1] === 0x50 && b[2] === 0x4e && b[3] === 0x47) return 'image/png';
  if (b[0] === 0x52 && b[1] === 0x49 && b[2] === 0x46 && b[3] === 0x46 && b[8] === 0x57 && b[9] === 0x45 && b[10] === 0x42 && b[11] === 0x50) return 'image/webp';
  if (b[0] === 0x47 && b[1] === 0x49 && b[2] === 0x46) return 'image/gif';
  if (b[4] === 0x66 && b[5] === 0x74 && b[6] === 0x79 && b[7] === 0x70) {
    const brand = String.fromCharCode(b[8], b[9], b[10], b[11]);
    if (/^(heic|heix|hevc|hevx|heim|heis|mif1|msf1)$/.test(brand)) return 'image/heic';
    if (/^avi[fs]$/.test(brand)) return 'image/avif';
    return 'audio/mp4';
  }
  if (b[0] === 0x49 && b[1] === 0x44 && b[2] === 0x33) return 'audio/mpeg';
  if (b[0] === 0x4f && b[1] === 0x67 && b[2] === 0x67 && b[3] === 0x53) return 'audio/ogg';
  if (b[0] === 0x23 && b[1] === 0x21 && b[2] === 0x41 && b[3] === 0x4d && b[4] === 0x52) return 'audio/amr';
  return '';
}
export const EXT = { 'image/jpeg': 'jpg', 'image/png': 'png', 'image/webp': 'webp', 'image/gif': 'gif', 'image/heic': 'heic', 'image/avif': 'avif', 'audio/mp4': 'm4a', 'audio/mpeg': 'mp3', 'audio/ogg': 'ogg', 'audio/amr': 'amr' };
