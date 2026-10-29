/* Readback's reader for the chat downloads Meta gives you. Three formats, told apart by their content, not their names:
 *  1. Facebook "Download your information" in JSON: <root>/your_facebook_activity/messages/<folder>/<thread>/message_N.json
 *     (older downloads: <root>/messages/...), folders inbox, archived_threads, filtered_threads, message_requests and
 *     e2ee_cutover, newest message first, file message_1 the newest part.
 *     { participants: [{ name }], messages: [{ sender_name, timestamp_ms, content, photos, videos, audio_files, gifs, files,
 *       sticker, share, reactions: [{ reaction, actor }], call_duration, type, is_unsent }], title, thread_path }
 *  2. Instagram's download, the same shape under your_instagram_activity/messages/<folder>/<thread>/message_N.json.
 *  3. Messenger's end-to-end encrypted chats ("Download secure storage data"): <Name>_N.json files and a media/ folder.
 *     { participants: ["Name"], threadName: "Name_N", messages: [{ senderName, timestamp, text, type, media: [{ uri }],
 *       reactions: [{ actor, reaction }], isUnsent }] }
 * Meta writes text in the JSON downloads as UTF-8 bytes read as Latin-1 ("CafÃ©" for "Café", "ð" for emoji); fixText
 * turns it back. Everything is read in this tab; nothing is sent anywhere. */
import { sniff, readZip, entryBlob, entryText, ZipError } from '/messenger-json-viewer/js/zip.js';

export class ExportError extends Error {
  constructor(code, detail = '') { super(code); this.code = code; this.detail = detail; }
}

const LATIN1_ONLY = /^[\u0000-ÿ]*$/;
const HIGH = /[\u0080-ÿ]/;
const STRICT = new TextDecoder('utf-8', { fatal: true });
export function fixText(s) {
  if (typeof s !== 'string' || !HIGH.test(s) || !LATIN1_ONLY.test(s)) return s;
  const b = new Uint8Array(s.length);
  for (let i = 0; i < s.length; i++) b[i] = s.charCodeAt(i);
  try { return STRICT.decode(b); } catch { return s; }
}

const DYI_RE = /(?:^|\/)messages\/([^/]+)\/([^/]+)\/message_(\d+)\.json$/i;
const DYI_HTML_RE = /(?:^|\/)messages\/([^/]+)\/([^/]+)\/message_(\d+)\.html?$/i;
const FOLDER_LABEL = { inbox: 'Caixa de entrada', archived_threads: 'Arquivadas', filtered_threads: 'Filtradas', message_requests: 'Solicitações de mensagem', e2ee_cutover: 'Passou para as conversas criptografadas' };
export const folderLabel = f => FOLDER_LABEL[f] || (f ? f.replace(/_/g, ' ') : '');
export const PLATFORM_LABEL = { messenger: 'Messenger', instagram: 'Instagram' };

const base = p => p.slice(p.lastIndexOf('/') + 1);
const dirOf = p => (p.includes('/') ? p.slice(0, p.lastIndexOf('/') + 1) : '');

/* ------------------------------------------------------------------ collecting files */
// A record is one file of the download: { path, size, blob() } and, for a file inside a ZIP, its entry.
function zipRecord(entry, zipName) {
  return { path: entry.name, size: entry.size, zipName, entry, blob: (type) => entryBlob(entry, type) };
}
function fileRecord(file, path) {
  return { path: (path || file.webkitRelativePath || file.name).replace(/\\/g, '/'), size: file.size, file, blob: async (type) => (type ? file.slice(0, file.size, type) : file) };
}

/* Takes the files the visitor chose or dropped: ZIP parts, an unzipped folder, single JSON files, in any mix. */
export async function collect(files) {
  const records = [];
  const odd = [];
  for (const f of files) {
    const path = f._path || f.webkitRelativePath || f.name;
    const kind = await sniff(f);
    if (kind === 'zip') {
      let z;
      try { z = await readZip(f); } catch (e) { odd.push({ name: f.name, kind: e instanceof ZipError ? (e.code === 'truncated' ? 'truncated' : 'damaged') : 'damaged' }); continue; }
      if (z.entries.some(e => e.encrypted)) { odd.push({ name: f.name, kind: 'encrypted' }); continue; }
      for (const e of z.entries) if (!e.dir) records.push(zipRecord(e, f.name));
    } else if (kind === 'json' || (/\//.test(path) && /\.(jpe?g|png|gif|webp|bmp|mp4|m4v|webm|m4a|aac|mp3|wav|ogg|opus|mov|heic|pdf|docx?|txt|zip)$/i.test(path))) {
      // a loose file is only taken when it is JSON, or an attachment inside a chosen folder
      records.push(fileRecord(f, path));
    } else if (/\.html?$/i.test(path) && kind === 'html') {
      records.push(fileRecord(f, path));
    } else {
      odd.push({ name: f.name, kind });
    }
  }
  return { records, odd };
}

/* ------------------------------------------------------------------ reading */
function platformHint(rec) {
  const p = (rec.path + ' ' + (rec.zipName || '')).toLowerCase();
  if (/your_instagram_activity|(^|[\/ ])instagram[-_ ]/.test(p)) return 'instagram';
  if (/your_facebook_activity|(^|[\/ ])facebook[-_ ]|e2ee_cutover|messenger/.test(p)) return 'messenger';
  return null;
}
function globalPlatform(records) {
  let ig = 0, fb = 0;
  for (const r of records) {
    const p = r.path.toLowerCase();
    if (/your_instagram_activity|followers_and_following|instagram_ads|saved_posts\.json|liked_posts\.json|story_interactions/.test(p) || /instagram/.test((r.zipName || '').toLowerCase())) ig++;
    if (/your_facebook_activity|profile_information|facebook_marketplace|e2ee_cutover|groups_and_events/.test(p) || /facebook/.test((r.zipName || '').toLowerCase())) fb++;
  }
  return ig > fb ? 'instagram' : 'messenger';
}

function mediaIndex(records) {
  const full = new Map(), tail = new Map(), name = new Map();
  for (const r of records) {
    const lc = r.path.toLowerCase();
    full.set(lc, r);
    const i = lc.lastIndexOf('messages/');
    if (i >= 0) tail.set(lc.slice(i), r);
    const b = base(lc);
    if (!name.has(b)) name.set(b, []);
    name.get(b).push(r);
  }
  return { full, tail, name };
}
function resolve(idx, uri, relDir = '') {
  if (!uri || /^[a-z]+:/i.test(uri)) return null;
  const u = uri.replace(/\\/g, '/').replace(/^\.\//, '').replace(/^\/+/, '').toLowerCase();
  if (relDir) { const r = idx.full.get((relDir + u).toLowerCase()); if (r) return r; }
  const f = idx.full.get(u); if (f) return f;
  const i = u.lastIndexOf('messages/');
  if (i >= 0) { const t = idx.tail.get(u.slice(i)); if (t) return t; }
  for (const [p, r] of idx.full) if (p.endsWith('/' + u)) return r;
  const byName = idx.name.get(base(u));
  return byName && byName.length === 1 ? byName[0] : null;
}

const toMs = t => (typeof t === 'number' && isFinite(t) ? (t < 1e11 ? t * 1000 : t) : typeof t === 'string' && /^\d+$/.test(t) ? toMs(Number(t)) : null);

function dyiMessage(m, idx) {
  const media = [];
  const add = (list, type) => { for (const a of list || []) if (a && a.uri) media.push({ type, uri: a.uri, rec: resolve(idx, a.uri), name: base(a.uri) }); };
  add(m.photos, 'photo'); add(m.gifs, 'gif'); add(m.videos, 'video'); add(m.audio_files, 'audio'); add(m.files, 'file');
  if (m.sticker && m.sticker.uri) media.push({ type: 'sticker', uri: m.sticker.uri, rec: resolve(idx, m.sticker.uri), name: base(m.sticker.uri) });
  const type = String(m.type || 'Generic');
  const text = fixText(m.content || '');
  const msg = {
    ts: toMs(m.timestamp_ms) || 0,
    sender: fixText(m.sender_name || ''),
    text,
    media,
    reactions: (m.reactions || []).filter(r => r && r.reaction).map(r => ({ r: fixText(r.reaction), actor: fixText(r.actor || '') })),
    unsent: !!m.is_unsent,
    kind: type === 'Call' ? 'call' : type === 'Subscribe' || type === 'Unsubscribe' ? 'system' : 'msg',
    src: 'dyi',
  };
  if (m.share && (m.share.link || m.share.share_text)) msg.share = { link: m.share.link || '', text: fixText(m.share.share_text || '') };
  if (msg.kind === 'call') { msg.callDur = Number(m.call_duration) || 0; msg.missed = !!m.missed || msg.callDur === 0; }
  return msg;
}

function e2eeMessage(m, idx, relDir) {
  const media = [];
  for (const a of m.media || []) {
    const uri = typeof a === 'string' ? a : a && a.uri;
    if (!uri) continue;
    const ext = (uri.split('.').pop() || '').toLowerCase();
    const type = /^(jpe?g|png|webp|heic|bmp)$/.test(ext) ? 'photo' : ext === 'gif' ? 'gif' : /^(mp4|mov|m4v|webm)$/.test(ext) ? 'video' : /^(m4a|aac|mp3|wav|ogg|opus)$/.test(ext) ? 'audio' : 'file';
    media.push({ type, uri, rec: resolve(idx, uri, relDir), name: base(uri) });
  }
  const type = String(m.type || 'text').toLowerCase();
  return {
    ts: toMs(m.timestamp) || 0,
    sender: fixText(m.senderName || ''),
    text: fixText(m.text || ''),
    media,
    reactions: (m.reactions || []).filter(r => r && (r.reaction || r.emoji)).map(r => ({ r: fixText(r.reaction || r.emoji), actor: fixText(r.actor || r.senderName || '') })),
    unsent: !!m.isUnsent,
    kind: type === 'call' ? 'call' : type === 'system' || type === 'admin' ? 'system' : 'msg',
    src: 'e2ee',
  };
}

const keyOf = (platform, names) => platform + '|' + [...new Set(names.map(n => n.trim().toLowerCase()))].sort().join('|');

/* Reads every chat in the records. Returns { chats, owner, platforms, counts, skipped }. */
export async function openExport(records, { onProgress } = {}) {
  if (!records.length) throw new ExportError('nothing');
  const idx = mediaIndex(records);
  const fallback = globalPlatform(records);
  const dyi = [], e2ee = [], htmlParts = [];
  for (const r of records) {
    const p = r.path;
    if (DYI_RE.test(p)) dyi.push(r);
    else if (DYI_HTML_RE.test(p)) htmlParts.push(r);
    else if (/\.json$/i.test(p) && !/(^|\/)messages\//i.test(p)) {
      // the encrypted chats download: <Name>_N.json next to media/; a single JSON file chosen on its own also counts
      const loose = !r.entry;
      if (/_\d+\.json$/i.test(p) || loose || records.length < 400) e2ee.push(r);
    }
  }
  const metaDownload = records.some(r => /(^|\/)(your_facebook_activity|your_instagram_activity|personal_information|profile_information)\//i.test(r.path));
  if (!dyi.length && !e2ee.length) {
    if (htmlParts.length) throw new ExportError('html-export');
    if (records.every(r => /\.html?$/i.test(r.path))) throw new ExportError('html');
    throw new ExportError(metaDownload ? 'no-messages' : 'not-chats');
  }

  const threads = new Map();
  let done = 0;
  const total = dyi.length + e2ee.length;
  const tick = () => { done++; if (onProgress && (done % 25 === 0 || done === total)) onProgress(done, total); };
  let bad = 0;

  for (const r of dyi) {
    const m = r.path.match(DYI_RE);
    let j;
    try { j = JSON.parse(await textOf(r)); } catch { bad++; tick(); continue; }
    tick();
    if (!j || !Array.isArray(j.messages)) { bad++; continue; }
    const platform = platformHint(r) || fallback;
    const folder = m[1].toLowerCase();
    const id = `${platform}:${folder}/${m[2].toLowerCase()}`;
    let t = threads.get(id);
    if (!t) {
      t = { id, platform, folder, title: '', participants: [], messages: [], sources: new Set(), parts: 0 };
      threads.set(id, t);
    }
    t.parts++;
    t.sources.add('dyi');
    const names = (j.participants || []).map(p => fixText(typeof p === 'string' ? p : p && p.name)).filter(Boolean);
    for (const n of names) if (!t.participants.includes(n)) t.participants.push(n);
    if (j.title && !t.title) t.title = fixText(j.title);
    for (const msg of j.messages) if (msg && typeof msg === 'object') t.messages.push(dyiMessage(msg, idx));
  }

  for (const r of e2ee) {
    let j;
    try { j = JSON.parse(await textOf(r)); } catch { tick(); continue; }
    tick();
    if (!j || !Array.isArray(j.messages) || !Array.isArray(j.participants)) continue;
    const looksE2ee = 'threadName' in j || typeof j.participants[0] === 'string' || j.messages.some(m => m && ('senderName' in m || 'isUnsent' in m));
    const looksDyi = j.messages.some(m => m && 'sender_name' in m);
    if (!looksE2ee && !looksDyi) continue;
    if (looksDyi) {
      // a message_N.json chosen on its own, outside its folders
      const platform = platformHint(r) || fallback;
      const id = `${platform}:file/${r.path.toLowerCase()}`;
      const names = (j.participants || []).map(p => fixText(typeof p === 'string' ? p : p && p.name)).filter(Boolean);
      threads.set(id, { id, platform, folder: 'inbox', title: fixText(j.title || ''), participants: names, messages: j.messages.filter(Boolean).map(m => dyiMessage(m, idx)), sources: new Set(['dyi']), parts: 1 });
      continue;
    }
    const names = j.participants.map(p => fixText(typeof p === 'string' ? p : p && (p.name || p.senderName))).filter(Boolean);
    const relDir = dirOf(r.path);
    const id = `messenger:e2ee/${r.path.toLowerCase()}`;
    threads.set(id, {
      id, platform: 'messenger', folder: 'encrypted',
      title: fixText(String(j.threadName || '')).replace(/_\d+$/, ''),
      participants: names,
      messages: j.messages.filter(m => m && typeof m === 'object').map(m => e2eeMessage(m, idx, relDir)),
      sources: new Set(['e2ee']), parts: 1,
    });
  }
  if (!threads.size) throw new ExportError(bad ? 'damaged-json' : htmlParts.length ? 'html-export' : metaDownload ? 'no-messages' : 'not-chats');

  // the owner: the one name in (nearly) every chat
  const seen = new Map();
  for (const t of threads.values()) for (const n of new Set(t.participants)) seen.set(n, (seen.get(n) || 0) + 1);
  let owner = null, best = 0;
  for (const [n, c] of seen) if (c > best) { best = c; owner = n; }
  if (threads.size < 2 || best < Math.max(2, threads.size * 0.6)) owner = null;

  // one chat per set of people: the regular download and the encrypted download of the same chat become one timeline
  const merged = new Map();
  for (const t of threads.values()) {
    const people = t.participants.length ? t.participants : [...new Set(t.messages.map(m => m.sender).filter(Boolean))];
    const k = keyOf(t.platform, people.length ? people : [t.id]);
    const m = merged.get(k);
    if (!m) { merged.set(k, { ...t, participants: people, sources: new Set(t.sources), folders: new Set([t.folder]) }); continue; }
    m.messages.push(...t.messages);
    for (const s of t.sources) m.sources.add(s);
    m.folders.add(t.folder);
    if (!m.title && t.title) m.title = t.title;
  }

  const chats = [];
  for (const t of merged.values()) {
    const dedup = new Map();
    for (const m of t.messages) {
      const k = `${m.ts}|${m.sender}|${m.text}|${m.media.length}`;
      if (!dedup.has(k)) dedup.set(k, m);
    }
    const messages = [...dedup.values()].sort((a, b) => a.ts - b.ts);
    const others = t.participants.filter(n => n !== owner);
    let title = t.title && !/^_?\d*$/.test(t.title) ? t.title : '';
    if (!title) title = (others.length ? others : t.participants).join(', ') || 'Conversa sem título';
    chats.push({
      id: t.id,
      platform: t.platform,
      folder: t.folders.has('inbox') ? 'inbox' : [...t.folders][0],
      folders: [...t.folders],
      title,
      participants: t.participants,
      group: t.participants.length > 2,
      messages,
      encrypted: t.sources.has('e2ee'),
      regular: t.sources.has('dyi'),
      first: messages.length ? messages[0].ts : 0,
      last: messages.length ? messages[messages.length - 1].ts : 0,
      mediaCount: messages.reduce((n, m) => n + m.media.length, 0),
    });
  }
  chats.sort((a, b) => b.last - a.last || a.title.localeCompare(b.title));
  const platforms = [...new Set(chats.map(c => c.platform))];
  const messageCount = chats.reduce((n, c) => n + c.messages.length, 0);
  const missingMedia = chats.reduce((n, c) => n + c.messages.reduce((k, m) => k + m.media.filter(x => !x.rec).length, 0), 0);
  return { chats, owner, platforms, messageCount, missingMedia, skipped: bad, htmlParts: htmlParts.length };
}

async function textOf(r) {
  if (r.entry) return entryText(r.entry);
  return new TextDecoder('utf-8').decode(new Uint8Array(await r.file.arrayBuffer()));
}

/* ------------------------------------------------------------------ helpers for the page and the exports */
export const MIME = { jpg: 'image/jpeg', jpeg: 'image/jpeg', png: 'image/png', gif: 'image/gif', webp: 'image/webp', bmp: 'image/bmp', heic: 'image/heic', mp4: 'video/mp4', m4v: 'video/mp4', mov: 'video/quicktime', webm: 'video/webm', m4a: 'audio/mp4', aac: 'audio/aac', mp3: 'audio/mpeg', wav: 'audio/wav', ogg: 'audio/ogg', opus: 'audio/ogg', pdf: 'application/pdf', txt: 'text/plain' };
export const mimeOf = p => MIME[(p.split('.').pop() || '').toLowerCase()] || 'application/octet-stream';

export function searchText(m) {
  return `${m.text} ${m.share ? m.share.text + ' ' + m.share.link : ''} ${m.media.map(x => x.name).join(' ')}`.toLowerCase();
}

export function callText(m) {
  if (m.kind !== 'call') return '';
  if (m.missed || !m.callDur) return 'Chamada perdida';
  const h = Math.floor(m.callDur / 3600), mi = Math.floor((m.callDur % 3600) / 60), s = m.callDur % 60;
  return `Chamada de ${h ? h + ' h ' : ''}${mi ? mi + ' min ' : ''}${!h ? s + ' s' : ''}`.trim();
}

/* A call as one line: what the download says about it, then how long it lasted. */
export function callLine(m) {
  return [String(m.text || '').replace(/[.\s]+$/, ''), callText(m)].filter(Boolean).join('. ');
}
