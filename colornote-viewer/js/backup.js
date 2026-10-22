/* Reads a ColorNote backup (.backup, and the older .dat/.doc files) in the browser. Runs in the worker; also loads in
 * Node for the tests. Nothing here makes a network request, stores anything or writes to the file.
 *
 * What a backup is (checked on real ColorNote 4.x backups from January 2026, and against the MIT-licensed decoders by
 * olejorgenb and theluckystrike, which were read as references):
 *  - a 28-byte header: "NOTE" in UTF-16 (8 bytes), the format version as two big-endian 32-bit numbers (8.1 today), the
 *    time the backup was made (64-bit, milliseconds) and the number of notes ColorNote counted (32-bit);
 *  - then AES-128 in CBC mode with PKCS#7 padding. The key is MD5(password + "ColorNote Fixed Salt"); this follows
 *    OpenSSL's EVP_BytesToKey, which also gives MD5(key + password + salt) as an IV, but the plain text decodes cleanly
 *    from the first byte with an all-zero IV, so that is what is used here (only the first 16 bytes depend on it);
 *  - the plain text is a run of sections: a section number and a record count (two 32-bit numbers), then that many
 *    records, each a 32-bit length and that many bytes of UTF-8 JSON. Section 1 holds the account the phone was signed
 *    in with (sign-in tokens): it is skipped without being parsed and never kept. Section 2 holds the notes, the
 *    folders and two settings records.
 * Older files without the header are tried from the first byte. When the sections do not line up (an older layout),
 * the records are found by their length prefixes, and as a last resort by matching braces. */
import { md5 } from './md5.js';

export class BackupError extends Error {
  constructor(code, detail) { super(code); this.code = code; this.detail = detail || ''; }
}

const SALT = new TextEncoder().encode('ColorNote Fixed Salt');
const MAGIC = [0, 0x4e, 0, 0x4f, 0, 0x54, 0, 0x45]; // "NOTE" in UTF-16 big-endian
const HEADER = 28;
export const MAX_BYTES = 256 * 1024 * 1024;
export const DEFAULT_PASSWORD = '0000';

const cat = (...parts) => { const out = new Uint8Array(parts.reduce((n, p) => n + p.length, 0)); let at = 0; for (const p of parts) { out.set(p, at); at += p.length; } return out; };
const u32 = (b, o) => ((b[o] << 24) | (b[o + 1] << 16) | (b[o + 2] << 8) | b[o + 3]) >>> 0;
const subtle = () => (globalThis.crypto && globalThis.crypto.subtle) || null;

/** What the first bytes say the file is. */
export function sniff(head) {
  const b = head;
  if (b.length >= 8 && MAGIC.every((v, i) => b[i] === v)) return 'colornote';
  if (b.length >= 4 && b[0] === 0x50 && b[1] === 0x4b && (b[2] === 3 || b[2] === 5) && (b[3] === 4 || b[3] === 6)) return 'zip';
  if (b.length >= 15 && String.fromCharCode(...b.subarray(0, 15)) === 'SQLite format 3') return 'sqlite';
  if (b.length >= 4 && b[0] === 0x25 && b[1] === 0x50 && b[2] === 0x44 && b[3] === 0x46) return 'pdf';
  if (b.length >= 3 && b[0] === 0xff && b[1] === 0xd8 && b[2] === 0xff) return 'image';
  if (b.length >= 4 && b[0] === 0x89 && b[1] === 0x50 && b[2] === 0x4e && b[3] === 0x47) return 'image';
  if (b.length >= 12 && b[4] === 0x66 && b[5] === 0x74 && b[6] === 0x79 && b[7] === 0x70) return 'media';
  let i = 0; while (i < b.length && (b[i] === 0x20 || b[i] === 0x0a || b[i] === 0x0d || b[i] === 0x09 || b[i] === 0xef || b[i] === 0xbb || b[i] === 0xbf)) i++;
  if (b[i] === 0x7b || b[i] === 0x5b) return 'json';
  return 'unknown';
}

/** The header of a backup with the NOTE signature. */
export function readHeader(bytes) {
  if (bytes.length < HEADER || !MAGIC.every((v, i) => bytes[i] === v)) return null;
  const hi = u32(bytes, 16), lo = u32(bytes, 20);
  const made = hi * 4294967296 + lo;
  return { major: u32(bytes, 8), minor: u32(bytes, 12), made: made > 9.4e11 && made < 4.2e12 ? made : null, count: u32(bytes, 24) };
}

/** The passwords to try for what was typed: as UTF-8, and, if it has letters outside ASCII, byte by byte as older
 * Java code turned characters into bytes. Spaces at either end are tried off as well. */
export function passwordBytes(pw) {
  const out = [], seen = new Set();
  const add = b => { const k = Array.from(b).join(','); if (!seen.has(k)) { seen.add(k); out.push(b); } };
  for (const p of [pw, String(pw).trim()]) {
    add(new TextEncoder().encode(p));
    if (/[^\x00-\x7f]/.test(p)) add(Uint8Array.from(Array.from(p), c => c.charCodeAt(0) & 0xff));
  }
  return out;
}

export function deriveKey(pw) {
  return { key: md5(cat(pw, SALT)), iv: new Uint8Array(16) };
}

/** AES-128-CBC decryption of the whole cipher text without a padding check (WebCrypto checks PKCS#7 padding, so one
 * block is appended that decrypts to a full block of padding: E = AES(padding XOR last cipher block)). This tells a
 * wrong password apart from a file cut short, and lets the notes before the cut be read. */
export async function decryptRaw(cipher, pw) {
  const s = subtle();
  if (!s) throw new BackupError('nocrypto');
  const { key, iv } = deriveKey(pw);
  try {
    const k = await s.importKey('raw', key, { name: 'AES-CBC' }, false, ['encrypt', 'decrypt']);
    const last = cipher.slice(cipher.length - 16);
    const e = new Uint8Array(await s.encrypt({ name: 'AES-CBC', iv: last }, k, new Uint8Array(16).fill(16))).subarray(0, 16);
    return new Uint8Array(await s.decrypt({ name: 'AES-CBC', iv }, k, cat(cipher, e)));
  } finally { key.fill(0); }
}

/** The plain text without its PKCS#7 padding, or null when the padding is not there (wrong key or a cut file). */
export function unpad(p) {
  const n = p[p.length - 1];
  if (!n || n > 16 || n > p.length) return null;
  for (let i = p.length - n; i < p.length; i++) if (p[i] !== n) return null;
  return p.subarray(0, p.length - n);
}

const decoder = () => new TextDecoder('utf-8', { fatal: true });
// sign-in data never becomes a record, even when an older layout puts it among the notes
const ACCOUNT_KEYS = ['auth_token', 'fb_access', 'client_uuid', 'access_token'];
const isNoteRecord = r => r && typeof r === 'object' && !Array.isArray(r) && ('note' in r || 'title' in r) && !ACCOUNT_KEYS.some(k => k in r);

function parseJson(bytes, td) {
  try { return JSON.parse(td.decode(bytes)); } catch (e) { return undefined; }
}

/** Does the plain text start like the section layout (section 1, a sane count)? A wrong password gives noise here. */
export const looksLikeSections = p => p.length >= 8 && u32(p, 0) >= 1 && u32(p, 0) <= 255 && u32(p, 4) <= 10_000_000;

/**
 * The section layout (ColorNote 4.x): the records of every section but the account one. Strict: null unless every
 * byte is accounted for. Lenient (a file cut short): the complete records before the damage, with cut: true.
 */
export function parseSections(p, lenient = false) {
  const td = decoder();
  let o = 0;
  const records = [];
  let sections = 0;
  const stop = () => (lenient && records.length ? { records, cut: true } : null);
  while (o < p.length) {
    if (o + 8 > p.length) return stop();
    const id = u32(p, o), count = u32(p, o + 4);
    o += 8;
    if (id === 0 || id > 255 || count > 10_000_000) return stop();
    sections++;
    for (let i = 0; i < count; i++) {
      if (o + 4 > p.length) return stop();
      const len = u32(p, o);
      o += 4;
      if (len > p.length - o) return stop();
      if (id !== 1 && len) {
        const r = parseJson(p.subarray(o, o + len), td);
        if (r === undefined) return stop();
        if (isNoteRecord(r)) records.push(r);
      }
      o += len;
    }
  }
  return sections ? { records, cut: false } : null;
}

/** Length-prefixed records without section headers: the earliest start from which the chain runs exactly to the end. */
export function parseChain(p) {
  const td = decoder();
  for (let s = 0; s + 6 <= p.length; s++) {
    if (p[s + 4] !== 0x7b || p[s + 5] !== 0x22) continue;
    const first = u32(p, s);
    if (first < 2 || first > p.length - s - 4 || p[s + 4 + first - 1] !== 0x7d) continue;
    let o = s;
    const out = [];
    let ok = true;
    while (o < p.length) {
      if (o + 4 > p.length) { ok = false; break; }
      const len = u32(p, o);
      if (len < 2 || len > p.length - o - 4 || p[o + 4] !== 0x7b) { ok = false; break; }
      const r = parseJson(p.subarray(o + 4, o + 4 + len), td);
      if (r === undefined) { ok = false; break; }
      out.push(r);
      o += 4 + len;
    }
    if (ok && o === p.length && out.length) return out.filter(isNoteRecord);
  }
  return null;
}

/** Last resort for older layouts: every complete JSON object in the text, found by matching braces outside strings.
 * Only run when the text names note fields at all, and each object is looked for within 4 MB, so noise stays cheap. */
export function parseScan(p) {
  const text = new TextDecoder('utf-8', { fatal: false }).decode(p);
  if (!text.includes('"note"') && !text.includes('"title"')) return null;
  const out = [];
  let i = 0;
  while (i < text.length) {
    const start = text.indexOf('{"', i);
    if (start < 0) break;
    let depth = 0, inStr = false, esc = false, end = -1;
    const limit = Math.min(text.length, start + 4_000_000);
    for (let j = start; j < limit; j++) {
      const c = text.charCodeAt(j);
      if (inStr) {
        if (esc) esc = false; else if (c === 92) esc = true; else if (c === 34) inStr = false;
        continue;
      }
      if (c === 34) inStr = true;
      else if (c === 123) depth++;
      else if (c === 125 && --depth === 0) { end = j; break; }
    }
    if (end < 0) { i = start + 1; continue; }
    let r;
    try { r = JSON.parse(text.slice(start, end + 1)); } catch (e) { r = undefined; }
    if (r !== undefined && isNoteRecord(r)) { out.push(r); i = end + 1; } else i = start + 1;
  }
  return out.length ? out : null;
}

/**
 * Opens a backup. `bytes` is the whole file; `password` what the reader typed (null tries ColorNote's default "0000").
 * Resolves to { header, records, layout, cut, password: 'default' | 'typed' } or throws BackupError with a code:
 *  empty, toobig, zip, sqlite, notbackup (another kind of file), nosig (no ColorNote signature and the password did not
 *  open it: an older backup with another password, or not a backup), password (a backup the password does not open),
 *  damaged (the password is right but the notes cannot be read), nocrypto.
 * A file cut short opens with the notes before the cut and cut: true.
 */
export async function openBackup(bytes, password = null) {
  if (!bytes || !bytes.length) throw new BackupError('empty');
  if (bytes.length > MAX_BYTES) throw new BackupError('toobig');
  const kind = sniff(bytes.subarray(0, 64));
  if (kind === 'zip') throw new BackupError('zip');
  if (kind === 'sqlite') throw new BackupError('sqlite');
  if (kind !== 'colornote' && kind !== 'unknown') throw new BackupError('notbackup', kind);
  const header = readHeader(bytes);
  if (header && bytes.length < HEADER + 16) throw new BackupError('damaged');
  const offsets = header ? [HEADER] : [0, HEADER];
  const usable = offsets.filter(o => bytes.length - o >= 32 && (header || (bytes.length - o) % 16 === 0));
  if (!usable.length) throw new BackupError(header ? 'damaged' : 'notbackup');
  const tries = password == null ? [new TextEncoder().encode(DEFAULT_PASSWORD)] : passwordBytes(password);
  const result = (records, layout, cut) => ({ header, records, layout, cut: !!cut, password: password == null ? 'default' : 'typed' });
  let rightKey = false;
  for (const pw of tries) {
    for (const off of usable) {
      const cipher = bytes.subarray(off, off + Math.floor((bytes.length - off) / 16) * 16);
      const raw = await decryptRaw(cipher, pw);
      try {
        if (header && !looksLikeSections(raw)) continue;
        const body = unpad(raw);
        const whole = !!body && cipher.length === bytes.length - off;
        const plain = body || raw;
        const s = parseSections(plain, !whole);
        if (s) return result(s.records, 'sections', s.cut || !whole);
        if (header) { rightKey = true; continue; }
        if (!whole || bytes.length > 64e6) continue;
        const c = parseChain(plain);
        if (c && c.length) return result(c, 'chain', false);
        const x = parseScan(plain);
        if (x) return result(x, 'scan', false);
      } finally { raw.fill(0); }
    }
    pw.fill(0);
  }
  if (header) throw new BackupError(rightKey ? 'damaged' : 'password');
  throw new BackupError('nosig');
}
