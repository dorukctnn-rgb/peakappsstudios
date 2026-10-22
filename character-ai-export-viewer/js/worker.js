/* Chatbound worker: everything heavy happens here, off the page's main thread. It reads the dropped files (ZIP or
 * JSON), keeps the archive in memory and answers the page: chat pages, search, images and the files to save.
 * Nothing in this worker uses the network: it has no fetch, XMLHttpRequest or WebSocket, and reads only the File
 * objects the page hands it. */
'use strict';
importScripts('../vendor/fflate.min.js?v=0.8.2', 'aes.js?v=1', 'zip.js?v=1', 'parse.js?v=1', 'render.js?v=1', 'sample.js?v=1', 'migrate.js?v=1');

const Z = self.CaiZip, P = self.CaiParse, R = self.CaiRender, M = self.CaiMove;
let AR = null;           // the open archive
let SOURCES = [];        // [{ file, name, kind, zip, entries, password }]
let IMAGES = new Map();  // relative path -> { blob } | { src, entry }
let searchSeq = 0;

const post = (msg, transfer) => self.postMessage(msg, transfer || []);
const progress = (phase, done, total, name) => post({ type: 'progress', phase, done, total, name });

const IMG_EXT = /\.(png|jpe?g|webp|gif|avif)$/i;
const base = (p) => p.split('/').pop().toLowerCase();
const roleByName = (p) => {
  const b = base(p);
  if (/^messages?\.jsonl?$/.test(b)) return 'messages';
  if (/^characters?\.jsonl?$/.test(b)) return 'characters';
  if (/^users?\.jsonl?$/.test(b)) return 'user';
  return /\.(json|jsonl|ndjson|txt)$/.test(b) ? 'json' : null;
};
const normPath = (p) => String(p || '').replace(/\\/g, '/').replace(/^\.?\//, '');

async function looksLikeJson(file) {
  const head = new TextDecoder().decode(await file.slice(0, 64).arrayBuffer()).replace(/^﻿/, '').trimStart();
  return head.startsWith('[') || head.startsWith('{');
}

function sniffImage(b) {
  if (b[0] === 0x89 && b[1] === 0x50) return 'image/png';
  if (b[0] === 0xff && b[1] === 0xd8) return 'image/jpeg';
  if (b[0] === 0x47 && b[1] === 0x49) return 'image/gif';
  if (b[0] === 0x52 && b[1] === 0x49 && b[8] === 0x57 && b[9] === 0x45) return 'image/webp';
  if (b[4] === 0x66 && b[5] === 0x74 && b[6] === 0x79 && b[7] === 0x70) return 'image/avif';
  return '';
}

// ---------------------------------------------------------------- open
async function classify(items) {
  const sources = [];
  const images = new Map();
  const ignored = [];
  for (let i = 0; i < items.length; i++) {
    const { file, path } = items[i];
    const name = normPath(path || file.name);
    if (await Z.isZip(file)) {
      const idx = await Z.readIndex(file);
      const files = idx.entries.filter((e) => !e.dir);
      const data = [];
      for (const e of files) {
        const role = roleByName(e.name);
        if (role) data.push({ entry: e, role, path: e.name });
        else if (IMG_EXT.test(e.name)) images.set(normPath(e.name), { src: i, entry: e });
      }
      // a ZIP with named export files uses only those; otherwise every JSON in it is read as messages
      const named = data.filter((d) => d.role !== 'json');
      const use = named.length ? named : data.map((d) => Object.assign(d, { role: 'messages' }));
      const msgPath = (use.find((d) => d.role === 'messages') || use[0] || {}).path || '';
      const parts = msgPath.split('/');
      const di = parts.findIndex((s) => s.toLowerCase() === 'data');
      const username = di > 0 ? parts[di - 1] : '';
      sources.push({ index: i, file, name, kind: 'zip', parts: use, username, encrypted: use.some((d) => d.entry.encrypted), method: use.some((d) => d.entry.aes) ? 'aes' : use.some((d) => d.entry.encrypted) ? 'zipcrypto' : 'none' });
      if (!use.length) ignored.push({ name, why: 'no JSON files inside' });
    } else if (IMG_EXT.test(name)) {
      images.set(name, { src: i, blob: file });
    } else if (roleByName(name) || await looksLikeJson(file)) {
      const role = roleByName(name);
      sources.push({ index: i, file, name, kind: 'json', parts: [{ role: role && role !== 'json' ? role : 'messages', path: name }], username: '', encrypted: false, method: 'none' });
    } else {
      ignored.push({ name, why: 'not a ZIP or JSON file' });
    }
  }
  return { sources, images, ignored };
}

async function readText(src, part) {
  if (src.kind === 'json') return (await src.file.text()).replace(/^﻿/, '');
  const bytes = await Z.readEntryBytes(src.file, part.entry, { password: src.password });
  return new TextDecoder().decode(bytes).replace(/^﻿/, '');
}

// streams a message-type file record by record; records are sorted by shape, so a file that turns out to hold
// characters or the account still lands in the right place
async function readRecords(src, part, done0, grand) {
  const dec = new TextDecoder('utf-8');
  const stats = { records: 0, bad: 0, generic: [], mode: null, complete: true };
  let order = 0;
  const sp = new P.RecordSplitter((text) => {
    let o;
    try { o = JSON.parse(text); } catch (e) { stats.bad++; return; }
    stats.records++;
    if (P.isCaiMessage(o)) { P.addCaiMessage(AR, o, order++); return; }
    if (o && typeof o === 'object' && !Array.isArray(o) && typeof o.name === 'string' && ('greeting' in o || 'definition' in o)) { P.addCharacters(AR, [o]); return; }
    if (o && typeof o === 'object' && !Array.isArray(o) && ('date_joined' in o || ('first_name' in o && 'email' in o))) { P.addUser(AR, o); return; }
    stats.generic.push(o);
  });
  const feed = (bytes) => sp.push(dec.decode(bytes, { stream: true }));
  if (src.kind === 'json') {
    const f = src.file, step = 4 << 20;
    for (let p = 0; p < f.size; p += step) {
      feed(new Uint8Array(await f.slice(p, Math.min(f.size, p + step)).arrayBuffer()));
      progress('reading', done0 + Math.min(f.size, p + step), grand, src.name);
    }
  } else {
    await Z.readEntry(src.file, part.entry, {
      password: src.password, onChunk: feed,
      onProgress: (d) => progress('reading', done0 + d, grand, part.path.split('/').pop()),
    });
  }
  sp.push(dec.decode());
  stats.mode = sp.mode;
  stats.complete = sp.end();
  if (sp.mode === 'bad') throw Object.assign(new Error(`${part.path.split('/').pop()} is not a JSON file.`), { code: 'not_json' });
  if (stats.generic.length) {
    const label = part.path.split('/').pop().replace(/\.(json|jsonl|ndjson|txt)$/i, '');
    P.addGeneric(AR, sp.mode === 'objects' && stats.generic.length === 1 ? stats.generic[0] : stats.generic, label);
    stats.generic = null;
  }
  return stats;
}

async function open({ items, passwords = {}, allowMerge = false }) {
  AR = null; SOURCES = []; IMAGES = new Map();
  let cl;
  try { cl = await classify(items); } catch (e) { return { status: 'error', code: e.code || 'error', message: e.message }; }
  const { sources, images, ignored } = cl;
  const withMessages = sources.filter((s) => s.parts.some((p) => p.role === 'messages'));
  if (!sources.length) {
    return { status: 'error', code: images.size ? 'only_images' : 'not_export', ignored };
  }
  const units = withMessages.length;
  if (units > 1 && !allowMerge) return { status: 'merge', units, names: withMessages.map((s) => s.name) };
  // passwords: the one typed for this file first, then any other typed in this session
  const known = [...new Set(Object.values(passwords).filter(Boolean))];
  for (const s of sources) {
    if (!s.encrypted) continue;
    const target = s.parts.find((p) => p.entry.encrypted).entry;
    const tries = [...new Set([passwords[s.index], ...known].filter(Boolean))];
    let ok = null;
    for (const pw of tries) {
      for (const v of [pw, pw.trim(), pw.trim().toLowerCase()]) {
        if (await Z.checkPassword(s.file, target, v)) { ok = v; break; }
      }
      if (ok) break;
    }
    if (!ok) return { status: 'password', index: s.index, name: s.name, wrong: passwords[s.index] != null, method: s.method };
    s.password = ok;
  }
  AR = P.newArchive();
  SOURCES = sources;
  IMAGES = images;
  const grand = sources.reduce((n, s) => n + s.parts.reduce((m, p) => m + (p.entry ? p.entry.compSize : s.file.size), 0), 0);
  let done = 0;
  const report = [];
  for (const s of sources) {
    AR.sources.push({ name: s.name, kind: s.kind, size: s.file.size, encrypted: s.encrypted, method: s.method });
    if (s.username) AR.usernames.push(s.username);
    // small files first, so the characters are known when the messages arrive
    const order = { user: 0, characters: 1, messages: 2 };
    for (const part of [...s.parts].sort((a, b) => order[a.role] - order[b.role])) {
      const size = part.entry ? part.entry.compSize : s.file.size;
      try {
        if (part.role === 'user' || part.role === 'characters') {
          const text = await readText(s, part);
          let v = null;
          try { v = JSON.parse(text); } catch (e) {
            const recs = [];
            const sp = new P.RecordSplitter((t) => { try { recs.push(JSON.parse(t)); } catch (x) { /* skip */ } });
            sp.push(text);
            v = recs;
          }
          if (part.role === 'user') P.addUser(AR, v); else P.addCharacters(AR, v);
          report.push({ file: part.path, role: part.role, ok: true });
        } else {
          const st = await readRecords(s, part, done, grand);
          report.push({ file: part.path, role: 'messages', ok: true, records: st.records, bad: st.bad, complete: st.complete });
          if (!st.complete) AR.notes.push(`${part.path.split('/').pop()} ends early, as if the download stopped. Everything before that point is shown.`);
          if (st.bad) AR.notes.push(`${st.bad.toLocaleString('en')} damaged ${st.bad === 1 ? 'entry' : 'entries'} in ${part.path.split('/').pop()} could not be read and ${st.bad === 1 ? 'was' : 'were'} skipped.`);
        }
      } catch (e) {
        if (e.code === 'bad_password') return { status: 'password', index: s.index, name: s.name, wrong: true, method: s.method };
        report.push({ file: part.path, role: part.role, ok: false, error: e.message, code: e.code || 'error' });
        if (part.role === 'messages') AR.notes.push(e.message);
      }
      done += size;
      progress('reading', done, grand, '');
    }
  }
  AR.imageCount = images.size;
  AR.format = AR.chats.size && [...AR.chats.keys()].some((k) => !k.startsWith('g')) ? 'cai' : AR.chats.size ? 'generic' : AR.characters.length ? 'characters' : 'empty';
  progress('sorting', 1, 1, '');
  P.finish(AR);
  const failed = report.filter((r) => !r.ok);
  if (!AR.summaries.length && !AR.characters.length && !AR.users.length) {
    const code = failed.length ? failed[0].code : 'empty';
    return { status: 'error', code, message: failed.length ? failed[0].error : '', ignored };
  }
  return { status: 'ok', ...overview(), ignored, report };
}

function overview() {
  const user = Object.assign({}, ...AR.users);
  return {
    format: AR.format, speakers: AR.speakers,
    chats: AR.summaries,
    characters: AR.characters,
    user, usernames: [...new Set(AR.usernames)],
    counts: { chats: AR.summaries.length, messages: AR.messageCount, characters: AR.characters.length, images: AR.imageCount, duplicates: AR.duplicates },
    notes: AR.notes, sources: AR.sources,
  };
}

// ---------------------------------------------------------------- queries
function chatPage({ id, from = 0, count = 300 }) {
  const c = AR && AR.chats.get(id);
  if (!c) return { id, total: 0, from: 0, msgs: [] };
  const start = Math.max(0, Math.min(from, c.msgs.length));
  return { id, total: c.msgs.length, from: start, msgs: c.msgs.slice(start, start + count).map((m, k) => ({ i: start + k, ts: m.ts, time: m.time || '', text: m.text, who: m.who || '', img: m.img || '' })) };
}

async function search({ q, limit = 300, chatId = null }) {
  const seq = ++searchSeq;
  const re = P.makeMatcher(q);
  if (!re || !AR) return { q, total: 0, hits: [], done: true };
  const hits = [];
  let total = 0, n = 0;
  const chats = chatId ? [AR.chats.get(chatId)].filter(Boolean) : AR.summaries.map((s) => AR.chats.get(s.id));
  for (const c of chats) {
    for (let i = 0; i < c.msgs.length; i++) {
      const t = c.msgs[i].text;
      const m = re.exec(t);
      if (m) {
        total++;
        if (hits.length < limit) {
          const a = Math.max(0, m.index - 70);
          hits.push({ id: c.id, i, before: (a ? '…' : '') + t.slice(a, m.index).replace(/\s+/g, ' '), match: m[0], after: t.slice(m.index + m[0].length, m.index + m[0].length + 110).replace(/\s+/g, ' ') });
        }
      }
      if (++n % 25000 === 0) {
        await new Promise((r) => setTimeout(r, 0));
        if (seq !== searchSeq) return { q, cancelled: true };
      }
    }
  }
  return { q, total, hits, done: true };
}

async function imageBytes(path) {
  const want = normPath(path);
  let hit = IMAGES.get(want);
  if (!hit) for (const [k, v] of IMAGES) if (k.endsWith('/' + want) || want.endsWith('/' + k) || base(k) === base(want)) { hit = v; break; }
  if (!hit) return null;
  let bytes;
  if (hit.blob) bytes = new Uint8Array(await hit.blob.arrayBuffer());
  else { const s = SOURCES.find((x) => x.index === hit.src); bytes = await Z.readEntryBytes(s.file, hit.entry, { password: s ? s.password : null }); }
  const type = sniffImage(bytes);
  return type ? { bytes, type } : null;
}

async function image({ path }) {
  const r = await imageBytes(path);
  return r ? new Blob([r.bytes], { type: r.type }) : null;
}

function b64(bytes) {
  let s = '';
  for (let i = 0; i < bytes.length; i += 0x8000) s += String.fromCharCode.apply(null, bytes.subarray(i, i + 0x8000));
  return btoa(s);
}
async function imagesFor(chats, cap, asBytes) {
  const out = {};
  let used = 0;
  for (const c of chats) for (const m of c.msgs) {
    if (!m.img || out[m.img]) continue;
    const r = await imageBytes(m.img).catch(() => null);
    if (!r || used + r.bytes.length > cap) continue;
    used += r.bytes.length;
    out[m.img] = asBytes ? r : `data:${r.type};base64,${b64(r.bytes)}`;
  }
  return out;
}

const fileSlug = (s) => String(s || 'chat').normalize('NFKD').replace(/[̀-ͯ]/g, '').replace(/[^A-Za-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 60).toLowerCase() || 'chat';

function selected(ids) {
  const list = ids && ids.length ? ids.map((id) => AR.chats.get(id)).filter(Boolean) : AR.summaries.map((s) => AR.chats.get(s.id));
  // oldest first in a book
  return list.slice().sort((a, b) => (Number.isFinite(a.summary.start) ? a.summary.start : Infinity) - (Number.isFinite(b.summary.start) ? b.summary.start : Infinity));
}

async function exportFile({ kind, id, ids, opts }) {
  if (!AR) throw new Error('Open an export first.');
  const o = Object.assign({ speakers: AR.speakers }, opts);
  const today = new Date().toISOString().slice(0, 10);
  if (kind === 'txt' || kind === 'md' || kind === 'html') {
    const c = AR.chats.get(id);
    if (!c) throw new Error('That chat is not in the open file.');
    const name = `${fileSlug(R.chatTitle(c, o))}.${kind}`;
    if (kind === 'txt') return { blob: new Blob([R.chatTxt(c, o)], { type: 'text/plain;charset=utf-8' }), name };
    if (kind === 'md') return { blob: new Blob([R.chatMd(c, o)], { type: 'text/markdown;charset=utf-8' }), name };
    return { blob: new Blob([R.chatHtml(c, o, await imagesFor([c], 40 << 20))], { type: 'text/html;charset=utf-8' }), name };
  }
  const chats = selected(ids);
  const stem = `chat-archive-${fileSlug(o.owner || 'character-ai')}-${today}`;
  if (kind === 'book') {
    progress('writing', 0, 1, 'book');
    const parts = R.bookHtml(chats, o, await imagesFor(chats, 60 << 20));
    return { blob: new Blob(parts, { type: 'text/html;charset=utf-8' }), name: `${stem}.html` };
  }
  if (kind === 'print') {
    const parts = R.printHtml(chats, o, await imagesFor(chats, 60 << 20));
    return { blob: new Blob(parts, { type: 'text/html;charset=utf-8' }), name: `${stem}-print.html` };
  }
  if (kind === 'epub') {
    progress('writing', 0, 1, 'epub');
    const parts = R.epub(chats, o, await imagesFor(chats, 120 << 20, true));
    return { blob: new Blob(parts, { type: 'application/epub+zip' }), name: `${stem}.epub` };
  }
  throw new Error('Unknown file type.');
}

// ---------------------------------------------------------------- moving to another app
// The characters to convert: those your account created (character.json), with the chats that open with their exact
// greeting, then the other chats, put together when they open with the same message (Character.AI starts every chat
// with the character's greeting, so the same opening means the same character). Short openings are never grouped.
function moveIndex() {
  if (!AR) return { people: [] };
  const people = AR.characters.map((c, i) => ({ key: `own:${P.hashText(c.name + '|' + c.created + '|' + c.greeting)}`, kind: 'own', name: c.name, char: i, first: c.greeting, chats: [] }));
  const byGreeting = new Map();
  for (const p of people) { const g = p.first.trim(); if (g.length >= 12 && !byGreeting.has(g)) byGreeting.set(g, p); }
  const groups = new Map();
  for (const s of AR.summaries) {
    const chat = AR.chats.get(s.id);
    const firstText = chat.msgs[0] ? chat.msgs[0].text : '';
    const first = firstText.trim();
    const row = { id: s.id, count: s.count, start: s.start, end: s.end, name: s.name || '' };
    const own = first.length >= 12 ? byGreeting.get(first) : null;
    if (own) { own.chats.push(row); continue; }
    let g = first.length >= 12 ? groups.get(first) : null;
    if (!g) {
      g = { key: first.length >= 12 ? `chat:${P.hashText(first)}` : `one:${s.id}`, kind: 'chat', name: s.name || '', first: firstText, chats: [] };
      people.push(g);
      if (first.length >= 12) groups.set(first, g);
    }
    g.chats.push(row);
  }
  for (const p of people) p.messages = p.chats.reduce((n, c) => n + c.count, 0);
  return { people, speakers: AR.speakers };
}

function moveMsgs(id) {
  const c = AR && AR.chats.get(id);
  if (!c) throw new Error('That chat is not in the open file.');
  return c;
}

// one chat as a SillyTavern chat file
function moveChat({ id, layout, charName, userName, fileName }) {
  const c = moveMsgs(id);
  const text = M.chatLines(c.msgs, { charName, userName, layout });
  const day = Number.isFinite(c.summary.start) ? new Date(c.summary.start).toISOString().slice(0, 10) : 'chat';
  return { blob: new Blob([text], { type: 'application/jsonl' }), name: `${M.slug(fileName || charName, 'character')}-${day}.jsonl` };
}

// everything at once: one ZIP of cards (PNG and JSON) and chat files, with a note on importing them
// people: [{ name, cardJson, png (Uint8Array), chats: [{ id, layout, title }] }]
function moveZip({ people, userName, owner }) {
  if (!AR) throw new Error('Open an export first.');
  const fl = self.fflate;
  const te = new TextEncoder();
  const out = [];
  let failed = null;
  const zip = new fl.Zip((err, data) => { if (err) failed = err; else out.push(data); });
  const now = new Date();
  const add = (name, bytes, stored) => { const e = stored ? new fl.ZipPassThrough(name) : new fl.ZipDeflate(name, { level: 6 }); e.mtime = now; zip.add(e); e.push(typeof bytes === 'string' ? te.encode(bytes) : bytes, true); };
  const today = now.toISOString().slice(0, 10);
  const root = `character-ai-cards-and-chats-${M.slug(owner, 'export')}-${today}/`;
  const slugs = M.uniqueSlugs(people.map((p) => p.name), 'character');
  let chats = 0, messages = 0;
  const total = people.reduce((n, p) => n + p.chats.length, 0);
  people.forEach((p, k) => {
    const s = slugs[k];
    if (p.png) add(`${root}cards/${s}.png`, p.png, true);
    add(`${root}cards/${s}.json`, JSON.stringify(JSON.parse(p.cardJson), null, 2));
    const used = new Set();
    for (const ch of p.chats) {
      const c = AR.chats.get(ch.id);
      if (!c) continue;
      const day = Number.isFinite(c.summary.start) ? new Date(c.summary.start).toISOString().slice(0, 10) : 'chat';
      let fname = ch.title ? `${day}-${M.slug(ch.title, 'chat')}` : day;
      for (let n = 2; used.has(fname); n++) fname = `${day}-${n}`;
      used.add(fname);
      add(`${root}chats/${s}/${fname}.jsonl`, M.chatLines(c.msgs, { charName: p.name, userName, layout: ch.layout }));
      chats++; messages += c.msgs.length;
      if (chats % 25 === 0) progress('writing', chats, total, 'zip');
    }
  });
  add(`${root}README.txt`, M.readme({ characters: people.length, chats, messages, date: today }));
  zip.end();
  if (failed) throw failed;
  return { blob: new Blob(out, { type: 'application/zip' }), name: `${root.slice(0, -1)}.zip`, chats, messages };
}

async function sample() {
  const bytes = self.CaiSample.zipBytes(self.fflate);
  return new File([bytes], 'sample-character-ai-export.zip', { type: 'application/zip' });
}

const HANDLERS = {
  open, chatPage, search, image, export: exportFile, sample, moveIndex, moveChat, moveZip,
  close: () => { AR = null; SOURCES = []; IMAGES = new Map(); return true; },
};

self.onmessage = async (e) => {
  const { id, cmd, args } = e.data || {};
  const fn = HANDLERS[cmd];
  if (!fn) return post({ id, ok: false, error: { message: 'unknown command ' + cmd } });
  try {
    const result = await fn(args || {});
    post({ id, ok: true, result });
  } catch (err) {
    post({ id, ok: false, error: { message: err && err.message ? err.message : String(err), code: err && err.code ? err.code : 'error' } });
  }
};
