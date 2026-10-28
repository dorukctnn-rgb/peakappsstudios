/* Reading the export into an archive: a streaming splitter for big JSON arrays and JSON Lines, the Character.AI export
 * shape (message.json, character.json, user.json), a generic fallback for any other JSON with messages in it, merging
 * several exports with repeated messages removed, and search.
 *
 * The Character.AI export, as documented by a hands-on account (AIInsightsNews, 25 May 2026) and by the field names an
 * existing reader uses: a ZIP with <username>/data/user.json (first_name, email, is_active, date_joined),
 * character.json (title, name, description, greeting, definition, created, updated) and message.json, a list of
 * { chat_id, candidate_id, raw_content, create_time, tti_image_rel_path }. There is no field for who sent a message or
 * which character a chat was with, so this reader never guesses either.
 * Classic script: self.CaiParse (worker) and module.exports (Node tests). */
(function (root, factory) {
  const m = factory();
  if (typeof module === 'object' && module.exports) module.exports = m;
  else root.CaiParse = m;
})(typeof self !== 'undefined' ? self : globalThis, function () {
  'use strict';

  // ---------------------------------------------------------------- streaming record splitter
  // Feeds text chunks; calls onRecord(jsonText) for every element of a top-level array, or for every top-level object
  // (one object, JSON Lines, or objects one after another). Strings and escapes are tracked, so braces inside text
  // never confuse it. A record's text is joined only once, when it ends.
  class RecordSplitter {
    constructor(onRecord) {
      this.onRecord = onRecord;
      this.mode = null; // 'array' | 'objects' | 'bad'
      this.depth = 0; this.inStr = false; this.esc = false;
      this.open = false; this.pending = []; this.done = false;
      this.records = 0; this.skipped = 0; this.chars = 0;
    }
    push(chunk) {
      if (this.done || this.mode === 'bad' || !chunk) return;
      this.chars += chunk.length;
      let i = 0;
      const n = chunk.length;
      if (this.mode === null) {
        while (i < n) {
          const c = chunk.charCodeAt(i);
          if (c === 32 || c === 9 || c === 10 || c === 13 || c === 0xfeff) { i++; continue; }
          if (c === 91) { this.mode = 'array'; this.depth = 1; i++; }
          else if (c === 123) this.mode = 'objects';
          else { this.mode = 'bad'; return; }
          break;
        }
        if (this.mode === null) return;
      }
      const recDepth = this.mode === 'array' ? 1 : 0;
      let start = this.open ? 0 : -1;
      let depth = this.depth, inStr = this.inStr, esc = this.esc;
      for (; i < n; i++) {
        const c = chunk.charCodeAt(i);
        if (inStr) {
          if (esc) esc = false;
          else if (c === 92) esc = true;
          else if (c === 34) inStr = false;
          continue;
        }
        if (c === 34) { inStr = true; if (depth === recDepth && start < 0) { this.skipped++; } continue; }
        if (c === 123 || c === 91) {
          if (depth === recDepth) { start = i; this.pending = []; this.open = true; }
          depth++;
        } else if (c === 125 || c === 93) {
          depth--;
          if (depth === recDepth && this.open) {
            const text = this.pending.length ? this.pending.join('') + chunk.slice(start, i + 1) : chunk.slice(start, i + 1);
            this.pending = []; this.open = false; start = -1;
            this.records++;
            this.onRecord(text);
          } else if (depth < recDepth) { this.done = true; break; }
        }
      }
      if (this.open) this.pending.push(chunk.slice(start < 0 ? 0 : start));
      this.depth = depth; this.inStr = inStr; this.esc = esc;
    }
    // true when the text ended cleanly (no open record, no unclosed array)
    end() {
      return this.mode !== 'bad' && !this.open && (this.mode === 'objects' ? this.depth === 0 : this.mode === 'array' ? this.done : false);
    }
  }

  // ---------------------------------------------------------------- time
  // "2026-02-12 14:29:10.450225+00:00" (the export), ISO strings, epoch seconds or milliseconds
  function parseTime(v) {
    if (v == null || v === '') return NaN;
    if (typeof v === 'number') return v > 1e12 ? v : v > 1e8 ? v * 1000 : NaN;
    const s = String(v).trim();
    const m = s.match(/^(\d{4}-\d{2}-\d{2})[ T](\d{2}:\d{2})(:\d{2})?(\.\d+)?\s*(Z|UTC|[+-]\d{2}(?::?\d{2})?)?$/i);
    if (m) {
      let tz = m[5] ? m[5].toUpperCase() : 'Z';
      if (tz === 'UTC') tz = 'Z';
      else if (tz !== 'Z') tz = tz.length === 3 ? tz + ':00' : tz.length === 5 ? tz.slice(0, 3) + ':' + tz.slice(3) : tz;
      const frac = m[4] ? (m[4] + '000').slice(0, 4) : '';
      return Date.parse(`${m[1]}T${m[2]}${m[3] || ':00'}${frac}${tz}`);
    }
    if (/^\d{10}(\.\d+)?$/.test(s)) return Number(s) * 1000;
    if (/^\d{13}$/.test(s)) return Number(s);
    const t = Date.parse(s);
    return Number.isFinite(t) ? t : NaN;
  }

  // ---------------------------------------------------------------- archive
  const isObj = (v) => v !== null && typeof v === 'object' && !Array.isArray(v);
  const str = (v) => (typeof v === 'string' ? v : v == null ? '' : typeof v === 'object' ? '' : String(v));

  function hashText(s) {
    let h = 0x811c9dc5;
    const n = Math.min(s.length, 400);
    for (let i = 0; i < n; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 0x01000193); }
    return (h >>> 0).toString(36) + ':' + s.length;
  }

  function newArchive() {
    return {
      sources: [], users: [], usernames: [], characters: [], charKeys: new Set(),
      chats: new Map(), images: new Map(), imageCount: 0,
      format: null, // 'cai' | 'generic'
      speakers: false, duplicates: 0, notes: [], messageCount: 0,
    };
  }

  function chatFor(ar, id, name) {
    let c = ar.chats.get(id);
    if (!c) { c = { id, name: name || '', msgs: [], seen: new Set(), source: ar.sources.length - 1 }; ar.chats.set(id, c); }
    return c;
  }

  function addMessage(ar, chat, m) {
    const key = m.cid ? 'c:' + m.cid : 't:' + (Number.isFinite(m.ts) ? m.ts : m.time || '') + '|' + (m.who || '') + '|' + hashText(m.text);
    if (chat.seen.has(key)) { ar.duplicates++; return false; }
    chat.seen.add(key);
    chat.msgs.push(m);
    ar.messageCount++;
    return true;
  }

  // one record of message.json in the Character.AI shape
  function isCaiMessage(o) { return isObj(o) && ('raw_content' in o) && ('chat_id' in o || 'candidate_id' in o || 'create_time' in o); }

  function addCaiMessage(ar, o, order) {
    const text = str(o.raw_content);
    const img = typeof o.tti_image_rel_path === 'string' && o.tti_image_rel_path ? o.tti_image_rel_path : null;
    if (!text && !img) return false;
    const chat = chatFor(ar, str(o.chat_id) || 'no-chat-id');
    const ts = parseTime(o.create_time);
    const m = { text, ts, cid: str(o.candidate_id) || null, img, order };
    if (!Number.isFinite(ts) && o.create_time != null) m.time = str(o.create_time);
    return addMessage(ar, chat, m);
  }

  function addCharacters(ar, list) {
    let n = 0;
    for (const o of Array.isArray(list) ? list : isObj(list) ? [list] : []) {
      if (!isObj(o) || typeof o.name !== 'string') continue;
      const c = {
        name: o.name, title: str(o.title), description: str(o.description), greeting: str(o.greeting),
        definition: str(o.definition), created: str(o.created), updated: str(o.updated), extra: {},
      };
      for (const [k, v] of Object.entries(o)) {
        if (k in c) continue;
        if (typeof v === 'string' && v) c.extra[k] = v;
        else if (typeof v === 'number' || typeof v === 'boolean') c.extra[k] = String(v);
      }
      const key = c.name + '|' + c.created + '|' + hashText(c.greeting + c.definition);
      if (ar.charKeys.has(key)) continue;
      ar.charKeys.add(key);
      ar.characters.push(c);
      n++;
    }
    return n;
  }

  function addUser(ar, v) {
    const o = Array.isArray(v) ? v.find(isObj) : v;
    if (!isObj(o)) return false;
    const u = {};
    for (const [k, val] of Object.entries(o)) if (val == null || typeof val !== 'object') u[k] = val;
    ar.users.push(u);
    return true;
  }

  // ---------------------------------------------------------------- generic fallback
  const TEXT_KEYS = ['raw_content', 'text', 'content', 'message', 'msg', 'body', 'utterance', 'mes', 'value'];
  const WHO_KEYS = ['author', 'sender', 'speaker', 'from', 'role', 'name', 'user', 'character', 'participant'];
  const TIME_KEYS = ['create_time', 'created_at', 'created', 'timestamp', 'time', 'date', 'ts', 'send_date', 'sent_at'];
  const CHAT_KEYS = ['chat_id', 'conversation_id', 'history_id', 'chatId', 'conversationId', 'thread_id', 'room_id'];
  const NOT_TEXT = /(^|_)(id|uuid|time|date|created|updated|url|uri|avatar|path|type|role|status|model|lang|locale|email|hash)($|_)|^is_|Id$/i;

  function pickTextKey(objs) {
    const score = new Map();
    const sample = objs.length > 400 ? objs.filter((_, i) => i % Math.ceil(objs.length / 400) === 0) : objs;
    for (const o of sample) {
      for (const [k, v] of Object.entries(o)) {
        if (typeof v !== 'string' || NOT_TEXT.test(k)) continue;
        const s = score.get(k) || { n: 0, len: 0 };
        s.n++; s.len += v.length;
        score.set(k, s);
      }
    }
    let best = null, bestScore = 0;
    for (const [k, s] of score) {
      if (s.n < sample.length * 0.5) continue;
      const known = TEXT_KEYS.indexOf(k);
      const sc = s.len * (known >= 0 ? 4 - known * 0.2 : 1) * (s.len / s.n > 12 ? 1.5 : 1);
      if (sc > bestScore) { best = k; bestScore = sc; }
    }
    return best;
  }

  function whoOf(o, textKey) {
    if (isObj(o.src)) { if (typeof o.src.name === 'string') return o.src.name; if (typeof o.src.is_human === 'boolean') return o.src.is_human ? 'Anda' : 'Karakter'; }
    for (const k of WHO_KEYS) {
      if (k === textKey || !(k in o)) continue;
      const v = o[k];
      if (typeof v === 'string' && v && v.length <= 80) return v;
      if (isObj(v) && typeof v.name === 'string') return v.name;
    }
    if (typeof o.is_human === 'boolean') return o.is_human ? 'Anda' : 'Karakter';
    if (typeof o.isHuman === 'boolean') return o.isHuman ? 'Anda' : 'Karakter';
    if (typeof o.is_user === 'boolean') return o.is_user ? 'Anda' : 'Karakter';
    return '';
  }
  function timeOf(o) { for (const k of TIME_KEYS) if (k in o) { const t = parseTime(o[k]); if (Number.isFinite(t)) return t; } return NaN; }
  function chatKeyOf(objs) {
    for (const k of CHAT_KEYS) {
      const vals = new Set();
      let n = 0;
      for (const o of objs) if (o[k] != null && typeof o[k] !== 'object') { vals.add(String(o[k])); n++; }
      if (n >= objs.length * 0.8 && vals.size >= 1) return k;
    }
    return null;
  }
  function hasObjArray(o) { for (const v of Object.values(o)) if (Array.isArray(v) && v.length && v.some(isObj)) return true; return false; }
  function nameOf(o) {
    for (const k of ['name', 'title', 'character_name', 'char_name', 'bot_name']) if (typeof o[k] === 'string' && o[k] && o[k].length <= 120) return o[k];
    if (isObj(o.character) && typeof o.character.name === 'string') return o.character.name;
    return '';
  }

  // finds arrays of message-like objects anywhere in a value
  function findConversations(value, hint, out, depth = 0) {
    if (depth > 12 || out.length > 5000) return out;
    if (Array.isArray(value)) {
      const objs = value.filter(isObj);
      if (objs.length && objs.length >= value.length * 0.6) {
        const containers = objs.filter(hasObjArray).length;
        if (containers >= objs.length * 0.5) {
          objs.forEach((o, i) => findConversations(o, nameOf(o) || (hint ? `${hint} ${i + 1}` : ''), out, depth + 1));
          return out;
        }
        const tk = pickTextKey(objs);
        if (tk) { out.push({ name: hint, items: objs, textKey: tk }); return out; }
      }
      value.forEach((v, i) => { if (isObj(v) || Array.isArray(v)) findConversations(v, hint, out, depth + 1); });
      return out;
    }
    if (isObj(value)) {
      const own = nameOf(value);
      for (const [k, v] of Object.entries(value)) if (isObj(v) || Array.isArray(v)) findConversations(v, own || hint || k, out, depth + 1);
    }
    return out;
  }

  let genericSeq = 0;
  function addGeneric(ar, value, label) {
    const convs = findConversations(value, '', []);
    let added = 0;
    for (const conv of convs) {
      const ck = chatKeyOf(conv.items);
      const base = `g${++genericSeq}`;
      let order = 0;
      for (const o of conv.items) {
        const text = str(o[conv.textKey]);
        if (!text) continue;
        const id = ck ? `${base}:${o[ck]}` : base;
        const chat = chatFor(ar, id, conv.name || label || '');
        const who = whoOf(o, conv.textKey);
        if (who) ar.speakers = true;
        const m = { text, ts: timeOf(o), cid: null, img: null, order: order++, who };
        if (addMessage(ar, chat, m)) added++;
      }
    }
    if (!added) {
      // nothing that looks like messages: every text value in the file, in order, as one conversation
      const chat = chatFor(ar, `g${++genericSeq}`, label || 'Teks dalam file ini');
      let order = 0;
      (function leaves(v, path, d) {
        if (order > 20000 || d > 30) return;
        if (typeof v === 'string' && v.trim()) { addMessage(ar, chat, { text: v, ts: NaN, cid: null, img: null, order: order++, who: path.slice(-60) }); ar.speakers = true; }
        else if (Array.isArray(v)) v.forEach((x, i) => leaves(x, `${path}[${i}]`, d + 1));
        else if (isObj(v)) for (const [k, x] of Object.entries(v)) leaves(x, path ? `${path}.${k}` : k, d + 1);
      })(value, '', 0);
      added = order;
      if (!chat.msgs.length) ar.chats.delete(chat.id);
    }
    return added;
  }

  // ---------------------------------------------------------------- after loading
  function finish(ar) {
    const greetings = new Map();
    for (const c of ar.characters) { const g = c.greeting.trim(); if (g.length >= 12 && !greetings.has(g)) greetings.set(g, c.name); }
    const summaries = [];
    for (const chat of ar.chats.values()) {
      chat.msgs.sort((a, b) => {
        const ta = Number.isFinite(a.ts) ? a.ts : Infinity, tb = Number.isFinite(b.ts) ? b.ts : Infinity;
        return ta - tb || a.order - b.order;
      });
      chat.seen = null;
    }
    for (const chat of ar.chats.values()) {
      if (!chat.msgs.length) continue;
      const first = chat.msgs[0], last = chat.msgs[chat.msgs.length - 1];
      let start = NaN, end = NaN;
      for (const m of chat.msgs) if (Number.isFinite(m.ts)) { start = m.ts; break; }
      for (let i = chat.msgs.length - 1; i >= 0; i--) if (Number.isFinite(chat.msgs[i].ts)) { end = chat.msgs[i].ts; break; }
      const greetingOf = greetings.get(first.text.trim()) || '';
      const images = chat.msgs.reduce((n, m) => n + (m.img ? 1 : 0), 0);
      summaries.push({ id: chat.id, name: chat.name, start, end, count: chat.msgs.length, snippet: snippet(first.text || (first.img ? '[image]' : ''), 140), lastSnippet: snippet(last.text, 90), greetingOf, images, words: 0 });
      chat.summary = summaries[summaries.length - 1];
    }
    summaries.sort((a, b) => (Number.isFinite(b.end) ? b.end : -Infinity) - (Number.isFinite(a.end) ? a.end : -Infinity) || a.id.localeCompare(b.id));
    ar.summaries = summaries;
    return ar;
  }

  function snippet(t, n) {
    const s = String(t || '').replace(/\s+/g, ' ').trim();
    return s.length > n ? s.slice(0, n - 1).replace(/\s+\S*$/, '') + '…' : s;
  }

  // ---------------------------------------------------------------- search
  function escapeRe(s) { return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'); }
  function makeMatcher(q) {
    const words = String(q || '').trim();
    if (!words) return null;
    return new RegExp(escapeRe(words).replace(/\s+/g, '\\s+'), 'i');
  }

  return { RecordSplitter, parseTime, newArchive, isCaiMessage, addCaiMessage, addCharacters, addUser, addGeneric, findConversations, finish, snippet, makeMatcher, hashText };
});
