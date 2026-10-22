/* Moving characters and chats out of the export, into apps such as SillyTavern, Janitor AI, Perchance and Sakura.
 *  - Character Card V2, per the public spec (github.com/malfoyslastname/character-card-spec-v2): JSON, and a PNG with
 *    the card in a tEXt chunk named "chara" (base64 of the UTF-8 JSON). The V1 fields are also written at the top
 *    level, as SillyTavern does, because some importers read only those (Janitor AI checks them first).
 *  - Chats as SillyTavern chat files: JSON Lines, a header line (user_name, character_name, create_date,
 *    chat_metadata) and then one message per line (name, is_user, is_system, send_date, mes, extra).
 * Only what the export holds goes in. The export has no field for who sent a message, so the reader chooses how the
 * turns are laid out (see speakerAt) and sees it before saving; nothing is written that the export doesn't contain.
 * Classic script: self.CaiMove (worker and page) and module.exports (Node tests). No network code. */
(function (root, factory) {
  const m = factory();
  if (typeof module === 'object' && module.exports) module.exports = m;
  else root.CaiMove = m;
})(typeof self !== 'undefined' ? self : globalThis, function () {
  'use strict';
  const enc = new TextEncoder();
  const dec = new TextDecoder();
  const str = (v) => (typeof v === 'string' ? v : v == null ? '' : String(v));

  // ---------------------------------------------------------------- base64 of UTF-8 text
  function b64FromBytes(u8) {
    let s = '';
    for (let i = 0; i < u8.length; i += 0x8000) s += String.fromCharCode.apply(null, u8.subarray(i, i + 0x8000));
    return btoa(s);
  }
  const utf8ToB64 = (text) => b64FromBytes(enc.encode(text));
  function b64ToUtf8(b64) {
    const bin = atob(b64);
    const u8 = new Uint8Array(bin.length);
    for (let i = 0; i < bin.length; i++) u8[i] = bin.charCodeAt(i);
    return dec.decode(u8);
  }

  // ---------------------------------------------------------------- PNG chunks
  let CRC = null;
  function crc32(bytes) {
    if (!CRC) {
      CRC = new Int32Array(256);
      for (let n = 0; n < 256; n++) { let c = n; for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1; CRC[n] = c; }
    }
    let c = -1;
    for (let i = 0; i < bytes.length; i++) c = CRC[(c ^ bytes[i]) & 255] ^ (c >>> 8);
    return (c ^ -1) >>> 0;
  }
  const SIG = [137, 80, 78, 71, 13, 10, 26, 10];
  const isPng = (b) => b && b.length > 8 && SIG.every((x, i) => b[i] === x);
  const u32 = (b, o) => ((b[o] << 24) >>> 0) + (b[o + 1] << 16) + (b[o + 2] << 8) + b[o + 3];

  // [{ type, data, crc, ok }] in file order; stops at IEND
  function pngChunks(b) {
    if (!isPng(b)) throw new Error('This is not a PNG file.');
    const out = [];
    let o = 8;
    while (o + 12 <= b.length) {
      const len = u32(b, o);
      if (o + 12 + len > b.length) throw new Error('The PNG file is cut off.');
      const type = String.fromCharCode(b[o + 4], b[o + 5], b[o + 6], b[o + 7]);
      const data = b.subarray(o + 8, o + 8 + len);
      const crc = u32(b, o + 8 + len);
      out.push({ type, data, crc, ok: crc32(b.subarray(o + 4, o + 8 + len)) === crc });
      o += 12 + len;
      if (type === 'IEND') break;
    }
    return out;
  }
  function chunkBytes(type, data) {
    const out = new Uint8Array(12 + data.length);
    const len = data.length;
    out[0] = len >>> 24; out[1] = (len >>> 16) & 255; out[2] = (len >>> 8) & 255; out[3] = len & 255;
    for (let i = 0; i < 4; i++) out[4 + i] = type.charCodeAt(i);
    out.set(data, 8);
    const c = crc32(out.subarray(4, 8 + len));
    out[8 + len] = c >>> 24; out[9 + len] = (c >>> 16) & 255; out[10 + len] = (c >>> 8) & 255; out[11 + len] = c & 255;
    return out;
  }
  const keywordOf = (data) => { const z = data.indexOf(0); return z < 0 ? '' : dec.decode(data.subarray(0, z)); };
  // tEXt is Latin-1; the card goes in as base64, which is plain ASCII
  function textChunk(keyword, text) {
    const data = new Uint8Array(keyword.length + 1 + text.length);
    for (let i = 0; i < keyword.length; i++) data[i] = keyword.charCodeAt(i) & 255;
    data[keyword.length] = 0;
    for (let i = 0; i < text.length; i++) data[keyword.length + 1 + i] = text.charCodeAt(i) & 255;
    return chunkBytes('tEXt', data);
  }
  // the PNG with one tEXt "chara" chunk holding the card, just before IEND; card chunks already in the file
  // (chara, ccv3) are taken out first, so an app never reads an older card from the same picture
  function pngWithCard(png, cardJson) {
    const parts = pngChunks(png);
    if (!parts.length || parts[0].type !== 'IHDR' || parts[parts.length - 1].type !== 'IEND') throw new Error('The PNG file is incomplete.');
    const keep = parts.filter((c) => !(/^(tEXt|iTXt|zTXt)$/.test(c.type) && /^(chara|ccv3)$/i.test(keywordOf(c.data))));
    const pieces = [Uint8Array.from(SIG)];
    for (const c of keep) {
      if (c.type === 'IEND') pieces.push(textChunk('chara', utf8ToB64(cardJson)));
      pieces.push(chunkBytes(c.type, c.data));
    }
    const total = pieces.reduce((n, p) => n + p.length, 0);
    const out = new Uint8Array(total);
    let o = 0;
    for (const p of pieces) { out.set(p, o); o += p.length; }
    return out;
  }
  // every tEXt chunk as { keyword: text } (for checking a card)
  function pngText(png) {
    const out = {};
    for (const c of pngChunks(png)) {
      if (c.type !== 'tEXt') continue;
      const z = c.data.indexOf(0);
      if (z < 0) continue;
      let t = '';
      for (let i = z + 1; i < c.data.length; i++) t += String.fromCharCode(c.data[i]);
      out[keywordOf(c.data)] = t;
    }
    return out;
  }
  // the card inside a PNG, or null
  function readCard(png) {
    const t = pngText(png);
    if (!t.chara) return null;
    return JSON.parse(b64ToUtf8(t.chara));
  }

  // ---------------------------------------------------------------- Character Card V2
  const V1 = ['name', 'description', 'personality', 'scenario', 'first_mes', 'mes_example'];
  const V2_STRINGS = V1.concat(['creator_notes', 'system_prompt', 'post_history_instructions', 'creator', 'character_version']);
  const today = () => new Date().toISOString().slice(0, 10);

  // f: { name, description, first_mes, mes_example, creator_notes, extensions }. Every other field stays empty.
  function card(f) {
    const data = {
      name: str(f.name).trim(),
      description: str(f.description),
      personality: '',
      scenario: '',
      first_mes: str(f.first_mes),
      mes_example: str(f.mes_example),
      creator_notes: str(f.creator_notes),
      system_prompt: '',
      post_history_instructions: '',
      alternate_greetings: [],
      tags: [],
      creator: '',
      character_version: '',
      extensions: f.extensions && typeof f.extensions === 'object' ? f.extensions : {},
    };
    const c = {};
    for (const k of V1) c[k] = data[k];
    c.spec = 'chara_card_v2';
    c.spec_version = '2.0';
    c.data = data;
    return c;
  }
  // a character from character.json: its own definition, field for field
  function cardFromCharacter(ch, opts = {}) {
    const meta = { source: 'Character.AI data export', converted: opts.date || today() };
    if (ch.created) meta.created = str(ch.created);
    if (ch.updated) meta.updated = str(ch.updated);
    return card({
      name: opts.name || ch.name,
      description: ch.description,
      first_mes: ch.greeting,
      mes_example: ch.definition,
      creator_notes: ch.title,
      extensions: { chatbound: meta },
    });
  }
  // a character known only from a chat: the name the reader typed, the chat's first message, and a description only
  // if the reader wrote one
  function cardFromChat(f, opts = {}) {
    return card({
      name: f.name,
      description: f.description || '',
      first_mes: f.first_mes || '',
      mes_example: '',
      creator_notes: '',
      extensions: { chatbound: { source: 'Character.AI data export (chat only)', converted: opts.date || today() } },
    });
  }

  // problems with a card, against the spec's required fields and types; [] when it is valid
  function validateCard(c) {
    const errs = [];
    const isObj = (v) => v !== null && typeof v === 'object' && !Array.isArray(v);
    if (!isObj(c)) return ['not an object'];
    if (c.spec !== 'chara_card_v2') errs.push('spec must be "chara_card_v2"');
    if (c.spec_version !== '2.0') errs.push('spec_version must be "2.0"');
    const d = c.data;
    if (!isObj(d)) return errs.concat('data must be an object');
    for (const k of V2_STRINGS) if (typeof d[k] !== 'string') errs.push(`data.${k} must be a string`);
    for (const k of ['alternate_greetings', 'tags']) if (!Array.isArray(d[k]) || d[k].some((x) => typeof x !== 'string')) errs.push(`data.${k} must be an array of strings`);
    if (!isObj(d.extensions)) errs.push('data.extensions must be an object');
    if (d.character_book !== undefined) {
      const b = d.character_book;
      if (!isObj(b) || !Array.isArray(b.entries) || !isObj(b.extensions)) errs.push('data.character_book is malformed');
    }
    if (typeof d.name === 'string' && !d.name.trim()) errs.push('data.name is empty');
    for (const k of V1) if (k in c && c[k] !== d[k]) errs.push(`top-level ${k} differs from data.${k}`);
    return errs;
  }

  // ---------------------------------------------------------------- who said what
  // layout: { mode: 'char' | 'user' | 'none', flips: [message index, ...] }. 'char': turns alternate starting with the
  // character (a Character.AI chat opens with the character's greeting); 'user': starting with you; 'none': every
  // message under the character's name. Each flip swaps the speaker of that message and of every message after it.
  function speakerAt(i, layout) {
    const mode = (layout && layout.mode) || 'char';
    if (mode === 'none') return 'char';
    let flips = 0;
    for (const f of (layout && layout.flips) || []) if (f <= i) flips++;
    return (i + (mode === 'user' ? 1 : 0) + flips) % 2 === 0 ? 'char' : 'user';
  }
  function speakers(n, layout) {
    const out = new Array(n);
    const mode = (layout && layout.mode) || 'char';
    const flips = new Set((layout && layout.flips) || []);
    let flipCount = 0;
    for (let i = 0; i < n; i++) {
      if (flips.has(i)) flipCount++;
      out[i] = mode === 'none' ? 'char' : (i + (mode === 'user' ? 1 : 0) + flipCount) % 2 === 0 ? 'char' : 'user';
    }
    return out;
  }
  // the first message the layout gives to the character (the card's first message for a chat-only character)
  function firstCharMessage(texts, layout) {
    const who = speakers(texts.length, layout);
    for (let i = 0; i < texts.length; i++) if (who[i] === 'char' && str(texts[i]).trim()) return texts[i];
    return '';
  }
  // toggling a flip at index i (adding it, or taking it away when it is there)
  function toggleFlip(layout, i) {
    const flips = new Set((layout && layout.flips) || []);
    if (flips.has(i)) flips.delete(i); else flips.add(i);
    return { mode: (layout && layout.mode) || 'char', flips: [...flips].sort((a, b) => a - b) };
  }

  // ---------------------------------------------------------------- SillyTavern chat file (JSON Lines)
  const base = (p) => String(p || '').split('/').pop();
  // msgs: [{ text, ts, time, img }] in order. o: { charName, userName, layout }
  function chatLines(msgs, o) {
    const charName = str(o.charName).trim() || 'Character';
    const userName = str(o.userName).trim() || 'You';
    const who = speakers(msgs.length, o.layout);
    const first = msgs.find((m) => Number.isFinite(m.ts));
    const header = { user_name: userName, character_name: charName, create_date: first ? new Date(first.ts).toISOString() : '', chat_metadata: {} };
    const lines = [JSON.stringify(header)];
    msgs.forEach((m, i) => {
      const user = who[i] === 'user';
      const extra = {};
      if (m.img) extra.chatbound_image = str(m.img);
      lines.push(JSON.stringify({
        name: user ? userName : charName,
        is_user: user,
        is_system: false,
        // milliseconds since 1970: SillyTavern and Perchance both read this; '' when the export had no usable time
        send_date: Number.isFinite(m.ts) ? m.ts : '',
        mes: m.text ? str(m.text) : m.img ? `[picture: ${base(m.img)}]` : '',
        extra,
      }));
    });
    return lines.join('\n') + '\n';
  }
  // the lines of a chat file, parsed (for checks)
  function parseLines(text) {
    return String(text).split('\n').filter((l) => l.trim()).map((l) => JSON.parse(l));
  }

  // ---------------------------------------------------------------- names
  const slug = (s, fallback) => String(s || '').normalize('NFKD').replace(/[̀-ͯ]/g, '').replace(/[^A-Za-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 50).toLowerCase() || fallback || 'character';
  function uniqueSlugs(names, fallback) {
    const seen = new Map();
    return names.map((n, i) => {
      const s = slug(n, `${fallback || 'character'}-${i + 1}`);
      const k = (seen.get(s) || 0) + 1;
      seen.set(s, k);
      return k === 1 ? s : `${s}-${k}`;
    });
  }

  // ---------------------------------------------------------------- the note inside the ZIP
  function readme(o) {
    const L = [];
    L.push('Your Character.AI characters and chats, ready to import');
    L.push('Made with Chatbound (https://peakappsstudio.com/character-ai-export-viewer/) on ' + (o.date || today()) + ', from a Character.AI data export, on your own device.');
    L.push('');
    L.push('WHAT IS IN HERE');
    L.push('cards/   one character card per character, as a PNG (the card is inside the picture) and as JSON. Format: Character Card V2.');
    L.push('chats/   one folder per character, one .jsonl file per chat. Format: SillyTavern chat file.');
    L.push('');
    L.push('Characters: ' + o.characters + '. Chats: ' + o.chats + '. Messages: ' + o.messages + '.');
    L.push('');
    L.push('WHAT CAME OVER, AND WHAT DID NOT');
    L.push('- Characters your account created (character.json): name, description, greeting (first message), definition (in "example messages") and tagline (in "creator notes").');
    L.push('- Characters you only chatted with: the export has no definition for them. Their card holds the name you gave it and the first message of the chat. Description, personality and scenario are empty.');
    L.push('- Pictures: the export has no character pictures. Cards use a plain lettered picture unless you chose your own.');
    L.push('- Who sent each message: the export does not record it. These files lay the turns out as you chose in Chatbound (by default: character, you, character, you, starting with the greeting).');
    L.push('- Not in the export at all: pinned memories, chats deleted before the export, voice.');
    L.push('');
    L.push('SILLYTAVERN');
    L.push('1. Click "Character Management" (the card icon at the top right), then "Import Character from File". Choose the PNG files in cards/ (you can pick several at once).');
    L.push('2. Open a character, click the menu button left of the message box, then "Manage chat files", then "Import Chat". Choose that character\'s .jsonl files.');
    L.push('Guide: https://peakappsstudio.com/character-ai-export-viewer/sillytavern/');
    L.push('');
    L.push('JANITOR AI');
    L.push('Click "Create a Character", then choose the character\'s PNG card as its image. Janitor AI asks "Would you like to import this image\'s information?" Click YES, check the fields (Personality is required) and save. Janitor AI has no way to import chat history.');
    L.push('Guide: https://peakappsstudio.com/character-ai-export-viewer/janitor-ai/');
    L.push('');
    L.push('PERCHANCE AI CHARACTER CHAT');
    L.push('Use its "import" button with a PNG card, then again with a .jsonl chat file and choose the character for it.');
    L.push('Guide: https://peakappsstudio.com/character-ai-export-viewer/perchance/');
    L.push('');
    L.push('SAKURA.FM');
    L.push('On the create page, click "Import Character" and choose a PNG or JSON card. Sakura has no chat import.');
    L.push('Guide: https://peakappsstudio.com/character-ai-export-viewer/sakura/');
    L.push('');
    L.push('Chatbound is an independent tool by Peak Apps Studio and is not affiliated with Character Technologies, Janitor AI, SillyTavern, Perchance or Sakura.fm.');
    return L.join('\r\n') + '\r\n';
  }

  return { crc32, utf8ToB64, b64ToUtf8, pngChunks, pngWithCard, pngText, readCard, card, cardFromCharacter, cardFromChat, validateCard, speakerAt, speakers, firstCharMessage, toggleFlip, chatLines, parseLines, slug, uniqueSlugs, readme, V1 };
});
