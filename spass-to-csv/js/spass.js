// Decant: opens a Samsung Pass export (.spass) in the browser. The format, as the open-source decryptors read it (spass-manager,
// spasstocsv, spass-decryptor, SpassConverter and samsung-pass-to-bitwarden agree on every number below):
//   file    = base64( salt[20] | iv[16] | AES-256-CBC ciphertext, PKCS#7 padded )
//   key     = PBKDF2-HMAC-SHA256( the export password as UTF-8, salt, 70,000 rounds, 32 bytes )
//   text    = line 1 the version number (25 in current exports), line 2 four flags (passwords;cards;addresses;notes), then
//             tables separated by a line "next_table"; each table is a ';'-separated header row, then one row per record with
//             every value base64-encoded (UTF-8); the text "&&&NULL&&&" stands for no value.
// Everything runs on Web Crypto in this page. Nothing here touches the network, the page or storage.

export const SALT_BYTES = 20;
export const IV_BYTES = 16;
export const ROUNDS = 70000;
export const NULL_MARK = '&&&NULL&&&';
const BOM_RE = new RegExp('^' + String.fromCharCode(0xfeff));

export class SpassError extends Error {
  constructor(code, message) { super(message || code); this.code = code; }
}

/* ------------------------------------------------------------------ bytes */
export function b64ToBytes(str) {
  let s = String(str || '').replace(BOM_RE, '').replace(/\s+/g, '');
  if (!s) throw new SpassError('empty');
  if (!/^[A-Za-z0-9+/_-]+={0,2}$/.test(s)) throw new SpassError('not-base64');
  s = s.replace(/-/g, '+').replace(/_/g, '/');
  while (s.length % 4) s += '=';
  let bin;
  try { bin = atob(s); } catch (e) { throw new SpassError('not-base64'); }
  const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return out;
}
export function bytesToB64(bytes) {
  let bin = '';
  for (let i = 0; i < bytes.length; i += 0x8000) bin += String.fromCharCode.apply(null, bytes.subarray(i, i + 0x8000));
  return btoa(bin);
}

async function keyFor(password, salt, usage) {
  const material = await crypto.subtle.importKey('raw', new TextEncoder().encode(String(password)), 'PBKDF2', false, ['deriveKey']);
  return crypto.subtle.deriveKey({ name: 'PBKDF2', salt, iterations: ROUNDS, hash: 'SHA-256' }, material, { name: 'AES-CBC', length: 256 }, false, [usage]);
}

/* ------------------------------------------------------------------ decrypt (and encrypt, for the sample and the tests) */
export async function decryptSpass(b64Text, password) {
  if (!String(password || '').length) throw new SpassError('no-password');
  const data = b64ToBytes(b64Text);
  if (data.length < SALT_BYTES + IV_BYTES + 16) throw new SpassError('too-short');
  const salt = data.slice(0, SALT_BYTES);
  const iv = data.slice(SALT_BYTES, SALT_BYTES + IV_BYTES);
  const body = data.slice(SALT_BYTES + IV_BYTES);
  if (body.length % 16) throw new SpassError('misaligned');
  const key = await keyFor(password, salt, 'decrypt');
  let plain;
  // Web Crypto removes the PKCS#7 padding itself and throws when it is wrong: what almost every wrong password produces
  try { plain = new Uint8Array(await crypto.subtle.decrypt({ name: 'AES-CBC', iv }, key, body)); } catch (e) { throw new SpassError('wrong-password'); }
  let text;
  try { text = new TextDecoder('utf-8', { fatal: true }).decode(plain); } catch (e) { throw new SpassError('wrong-password'); }
  text = text.replace(BOM_RE, '');
  if (!/(^|\r?\n)next_table(\r?\n|$)/.test(text)) throw new SpassError('not-spass');
  return text;
}

// the inverse, to write a file of this layout (the sample file and the tests use it; the salt and IV can be fixed for a test)
export async function encryptSpass(text, password, { salt, iv } = {}) {
  salt = salt || crypto.getRandomValues(new Uint8Array(SALT_BYTES));
  iv = iv || crypto.getRandomValues(new Uint8Array(IV_BYTES));
  const key = await keyFor(password, salt, 'encrypt');
  const body = new Uint8Array(await crypto.subtle.encrypt({ name: 'AES-CBC', iv }, key, new TextEncoder().encode(text)));
  const all = new Uint8Array(SALT_BYTES + IV_BYTES + body.length);
  all.set(salt, 0); all.set(iv, SALT_BYTES); all.set(body, SALT_BYTES + IV_BYTES);
  return bytesToB64(all);
}

/* ------------------------------------------------------------------ the text: tables of base64 values */
// ';'-separated values (the quotes a spreadsheet might add are honoured; real exports have none, base64 never holds a ';')
function splitRow(line) {
  const out = [];
  let cell = '';
  let q = false;
  for (let i = 0; i < line.length; i++) {
    const c = line[i];
    if (q) { if (c === '"') { if (line[i + 1] === '"') { cell += '"'; i++; } else q = false; } else cell += c; continue; }
    if (c === '"' && cell === '') { q = true; continue; }
    if (c === ';') { out.push(cell); cell = ''; continue; }
    cell += c;
  }
  out.push(cell);
  return out;
}
// a value: base64 of UTF-8 text. A value that is not (older or hand-made files) is kept as it is.
export function decodeValue(raw) {
  const v = String(raw == null ? '' : raw).trim();
  if (v === '') return '';
  if (/^[A-Za-z0-9+/_-]+={0,2}$/.test(v)) {
    try {
      const bytes = b64ToBytes(v);
      const s = new TextDecoder('utf-8', { fatal: true }).decode(bytes);
      // a decoded value with control characters is a plain word that happened to look like base64 ("true", "legacy")
      if (!/[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/.test(s)) return s === NULL_MARK ? '' : s;
    } catch (e) { /* kept as typed */ }
  }
  return v === NULL_MARK ? '' : v;
}

const KINDS = ['login', 'card', 'address', 'note'];
// the column names each table kind is recognised by (lower case, without a leading underscore)
const HINTS = {
  login: ['password_value', 'username_value', 'origin_url', 'host_url', 'action_url', 'credential_memo'],
  card: ['card_number_encrypted', 'card_number', 'name_on_card', 'expiration_month', 'last_four_digit', 'card_security_code', 'security_code'],
  address: ['street_address', 'full_name', 'zipcode', 'postal_code', 'country_code'],
  note: ['note_title', 'note_details', 'note_detail'],
};
// the columns of each table in the order of the current format (spass-manager's model), used when a table has no readable header
const POSITIONAL = {
  login: ['id', 'origin_url', 'action_url', 'username_element', 'username_value', 'id_tz_enc', 'password_element', 'password_value', 'pw_tz_enc', 'host_url', 'ssl_valid', 'preferred', 'blacklisted_by_user', 'use_additional_auth', 'cm_api_support', 'created_time', 'modified_time', 'title', 'favicon', 'source_type', 'app_name', 'package_name', 'package_signature', 'reserved_1', 'reserved_2', 'reserved_3', 'reserved_4', 'reserved_5', 'reserved_6', 'reserved_7', 'reserved_8', 'credential_memo', 'otp', 'root_id', 'parent_id'],
  card: ['id', 'card_number_encrypted', 'card_security_code', 'first_six_digit', 'last_four_digit', 'name_on_card', 'expiration_month', 'expiration_year', 'billing_address_id', 'vault_status', 'date_modified', 'reserved_4', 'reserved_5', 'reserved_6', 'is_encrypted'],
  address: ['id', 'full_name', 'company_name', 'street_address', 'city', 'state', 'zipcode', 'country_code', 'phone_number', 'email', 'date_modified', 'reserved_4', 'reserved_5', 'reserved_6'],
  note: ['id', 'note_title', 'note_details', 'date_modified'],
};
const norm = h => String(h || '').trim().toLowerCase().replace(/^_+/, '');
const kindOfHeader = names => { for (const k of KINDS) if (names.some(n => HINTS[k].includes(n))) return k; return null; };

// the text -> { version, flags, tables: [{ kind, rows: [{ column: value }], rawColumns }], warnings }
export function parseText(text) {
  const lines = String(text || '').replace(/\r\n?/g, '\n').split('\n');
  const first = lines.findIndex(l => l.trim() === 'next_table');
  if (first < 0) throw new SpassError('not-spass');
  const head = lines.slice(0, first).map(l => l.trim()).filter(Boolean);
  const version = head.find(l => /^\d+$/.test(l)) || (head.find(l => /^version:/i.test(l)) || '').replace(/^version:\s*/i, '') || '';
  const flagLine = head.find(l => /^(true|false)(;(true|false))+$/i.test(l)) || '';
  const flags = flagLine ? flagLine.toLowerCase().split(';').map(x => x === 'true') : [];
  const chunks = [];
  let cur = null;
  for (let i = first; i < lines.length; i++) {
    const l = lines[i].trim();
    if (l === 'next_table') { cur = []; chunks.push(cur); continue; }
    if (l && cur) cur.push(l);
  }
  const warnings = [];
  const tables = [];
  chunks.forEach((chunk, idx) => {
    if (!chunk.length) return;
    let header = splitRow(chunk[0]).map(norm);
    let kind = kindOfHeader(header);
    let dataLines = chunk.slice(1);
    if (!kind) {
      // no readable header: the table is read in the current format's column order, by its place in the file
      kind = KINDS[idx] || null;
      if (!kind) { warnings.push({ code: 'unknown-table', table: idx + 1 }); return; }
      header = POSITIONAL[kind];
      dataLines = chunk;
      warnings.push({ code: 'no-header', table: idx + 1, kind });
    }
    const rows = [];
    for (const l of dataLines) {
      const cells = splitRow(l);
      const row = {};
      header.forEach((h, i) => { row[h] = decodeValue(cells[i]); });
      // columns beyond the header are kept under their number, so nothing is lost
      for (let i = header.length; i < cells.length; i++) { const v = decodeValue(cells[i]); if (v) row[`extra_${i + 1}`] = v; }
      if (cells.length > header.length && !warnings.some(w => w.code === 'extra-columns' && w.table === idx + 1)) warnings.push({ code: 'extra-columns', table: idx + 1 });
      rows.push(row);
    }
    tables.push({ kind, columns: header, rows });
  });
  return { version, flags, tables, warnings };
}

/* ------------------------------------------------------------------ records */
const BASE32 = /^[A-Z2-7]{16,}=*$/;
export const hostOf = u => {
  const s = String(u || '').trim();
  if (!s) return '';
  try {
    const url = new URL(/^[a-z][a-z0-9+.-]*:\/\//i.test(s) ? s : `https://${s}`);
    if (!/^https?:$/.test(url.protocol)) return '';
    const h = url.hostname.toLowerCase().replace(/^www\./, '');
    return /^[a-z0-9.-]+\.[a-z]{2,}$/.test(h) || /^[a-z0-9-]+\.[a-z0-9-]+$/.test(h) ? h : '';
  } catch (e) { return ''; }
};
export const fullUrl = u => {
  const s = String(u || '').trim();
  if (!s) return '';
  if (/^https?:\/\//i.test(s)) return s;
  if (/^[a-z][a-z0-9+.-]*:/i.test(s)) return '';
  return hostOf(s) ? `https://${s}` : '';
};
const clean = s => String(s == null ? '' : s).replace(/\\n/g, '\n').replace(/\r\n?/g, '\n').trim();

// an Android app login is stored with an address of the form android://<signature>@<package>/ (the form Chrome uses too)
export function androidPackage(row) {
  const u = String(row.origin_url || row.host_url || row.action_url || '').trim();
  const m = /^android:\/\/[^@]*@([A-Za-z0-9._]+)/.exec(u);
  if (m) return m[1];
  return /^[A-Za-z][A-Za-z0-9_]*(\.[A-Za-z0-9_]+)+$/.test(String(row.package_name || '').trim()) && !/^https?:/i.test(u) ? String(row.package_name).trim() : '';
}
// well-known apps and the website of the same service (an app login has no website in Samsung Pass; Decant offers this one and marks it)
export const APP_SITES = {
  'com.facebook.katana': 'facebook.com', 'com.facebook.orca': 'messenger.com', 'com.instagram.android': 'instagram.com', 'com.twitter.android': 'x.com',
  'com.whatsapp': 'whatsapp.com', 'org.telegram.messenger': 'telegram.org', 'com.snapchat.android': 'snapchat.com', 'com.zhiliaoapp.musically': 'tiktok.com',
  'com.linkedin.android': 'linkedin.com', 'com.pinterest': 'pinterest.com', 'com.reddit.frontpage': 'reddit.com', 'com.discord': 'discord.com',
  'com.google.android.gm': 'gmail.com', 'com.google.android.youtube': 'youtube.com', 'com.netflix.mediaclient': 'netflix.com', 'com.spotify.music': 'spotify.com',
  'com.amazon.mShop.android.shopping': 'amazon.com', 'com.paypal.android.p2pmobile': 'paypal.com', 'com.ebay.mobile': 'ebay.com', 'com.dropbox.android': 'dropbox.com',
  'com.github.android': 'github.com', 'com.airbnb.android': 'airbnb.com', 'com.ubercab': 'uber.com', 'us.zoom.videomeetings': 'zoom.us', 'com.Slack': 'slack.com',
  'com.disney.disneyplus': 'disneyplus.com', 'com.walmart.android': 'walmart.com', 'com.target.ui': 'target.com', 'com.duolingo': 'duolingo.com',
  'com.booking': 'booking.com', 'com.revolut.revolut': 'revolut.com', 'com.coinbase.android': 'coinbase.com', 'tv.twitch.android.app': 'twitch.tv',
  'com.microsoft.office.outlook': 'outlook.com', 'com.microsoft.teams': 'microsoft.com', 'com.amazon.avod.thirdpartyclient': 'primevideo.com',
};

const MS = n => (n > 1e12 ? n : n > 1e9 ? n * 1000 : 0);
const dateOf = v => {
  const n = Number(String(v || '').replace(/\D/g, '') ? String(v).replace(/[^\d]/g, '') : 0);
  const ms = MS(n);
  if (!ms) return '';
  const d = new Date(ms);
  const y = d.getUTCFullYear();
  return y >= 2000 && y <= 2100 ? d.toISOString().slice(0, 10) : '';
};

function otpFrom(value, rec) {
  const v = String(value || '').trim();
  if (!v) return '';
  if (/^otpauth:\/\/totp\//i.test(v)) return v;
  const s = v.replace(/\s+/g, '').toUpperCase();
  if (!BASE32.test(s)) return '';
  const issuer = rec.host || rec.name;
  return `otpauth://totp/${encodeURIComponent(issuer)}${rec.username ? ':' + encodeURIComponent(rec.username) : ''}?secret=${s.replace(/=+$/, '')}&issuer=${encodeURIComponent(issuer)}`;
}

function loginRecord(row, n) {
  const pkg = androidPackage(row);
  const webUrl = ['origin_url', 'host_url', 'action_url'].map(k => row[k]).find(u => fullUrl(u)) || '';
  let url = fullUrl(webUrl);
  let host = hostOf(webUrl);
  let guessed = false;
  if (!url && pkg && APP_SITES[pkg]) { url = `https://${APP_SITES[pkg]}`; host = APP_SITES[pkg]; guessed = true; }
  const name = (row.title || row.app_name || '').trim() || host || pkg || '(no name)';
  const rec = {
    n, id: row.id || '', name, type: pkg ? 'App login' : 'Login', kind: 'login', tags: [], note: clean(row.credential_memo || row.memo),
    fields: [], url, host, username: row.username_value || '', password: row.password_value || '', otp: '', card: null, address: null,
    app: pkg ? { pkg, name: row.app_name || '', guessed } : null, modified: dateOf(row.modified_time), created: dateOf(row.created_time),
  };
  rec.otp = otpFrom(row.otp, rec);
  if (pkg) rec.fields.push({ label: 'Android app', value: pkg, type: '0', role: 'other', secret: false, used: false });
  return rec;
}

const BRANDS = [[/^4/, 'Visa'], [/^(5[1-5]|2(2[2-9][1-9]|2[3-9]\d|[3-6]\d\d|7[01]\d|720))/, 'Mastercard'], [/^3[47]/, 'Amex'], [/^(6011|65|64[4-9])/, 'Discover'], [/^3(0[0-5]|[68])/, 'Diners Club'], [/^35(2[89]|[3-8])/, 'JCB'], [/^62/, 'UnionPay']];
const brandOf = num => { const d = String(num).replace(/\D/g, ''); for (const [re, b] of BRANDS) if (re.test(d)) return b; return ''; };
const yearOf = y => { const s = String(y || '').replace(/\D/g, ''); return s.length === 2 ? `20${s}` : s.length === 4 ? s : ''; };

function cardRecord(row, n) {
  const raw = String(row.card_number_encrypted || row.card_number || '').trim();
  const digits = raw.replace(/[\s-]/g, '');
  const readable = /^\d{12,19}$/.test(digits);
  const last4 = String(row.last_four_digit || '').trim() || (readable ? digits.slice(-4) : '');
  const first6 = String(row.first_six_digit || '').trim();
  const holder = String(row.name_on_card || '').trim();
  const mm = String(row.expiration_month || '').replace(/\D/g, '');
  const brand = readable ? brandOf(digits) : brandOf(first6);
  const name = [brand || 'Card', last4 ? `ending ${last4}` : ''].filter(Boolean).join(' ');
  return {
    n, id: row.id || '', name, type: 'Card', kind: 'card', tags: [], note: '', fields: [], url: '', host: '', username: '', password: '', otp: '', address: null, app: null,
    card: { number: readable ? digits : '', locked: !readable && !!raw, first6, last4, holder, brand, expMonth: mm ? mm.padStart(2, '0').slice(-2) : '', expYear: yearOf(row.expiration_year), code: String(row.card_security_code || row.security_code || '').trim() },
    modified: dateOf(row.date_modified),
  };
}

function addressRecord(row, n) {
  const full = String(row.full_name || row.name || '').trim();
  const parts = full.split(/\s+/).filter(Boolean);
  const a = {
    fullName: full, first: parts.length > 1 ? parts.slice(0, -1).join(' ') : parts[0] || '', last: parts.length > 1 ? parts[parts.length - 1] : '',
    company: String(row.company_name || '').trim(), street: String(row.street_address || '').trim(), city: String(row.city || '').trim(), state: String(row.state || '').trim(),
    postal: String(row.zipcode || row.postal_code || '').trim(), country: String(row.country_code || '').trim(), phone: String(row.phone_number || '').trim(), email: String(row.email || '').trim(),
  };
  return {
    n, id: row.id || '', name: full || a.street || a.company || 'Address', type: 'Address', kind: 'address', tags: [], note: '', fields: [], url: '', host: '', username: '', password: '', otp: '', card: null, app: null,
    address: a, modified: dateOf(row.date_modified),
  };
}

function noteRecord(row, n) {
  const title = String(row.note_title || '').trim();
  const body = clean(row.note_details || row.note_detail);
  return { n, id: row.id || '', name: title || body.split('\n')[0].slice(0, 60) || 'Note', type: 'Note', kind: 'note', tags: [], note: body, fields: [], url: '', host: '', username: '', password: '', otp: '', card: null, address: null, app: null, modified: dateOf(row.date_modified) };
}

export function readRecords(parsed) {
  const records = [];
  let skipped = 0;
  for (const t of parsed.tables) {
    for (const row of t.rows) {
      let rec = null;
      if (t.kind === 'login') { if (row.password_value || row.username_value || row.origin_url || row.host_url || row.title || row.app_name || row.package_name) rec = loginRecord(row, records.length); }
      else if (t.kind === 'card') { if (row.card_number_encrypted || row.card_number || row.last_four_digit || row.name_on_card) rec = cardRecord(row, records.length); }
      else if (t.kind === 'address') { if (row.full_name || row.street_address || row.email) rec = addressRecord(row, records.length); }
      else if (t.kind === 'note') { if (row.note_title || row.note_details || row.note_detail) rec = noteRecord(row, records.length); }
      if (rec) records.push(rec); else skipped++;
    }
  }
  return { records, skipped, version: parsed.version, warnings: parsed.warnings };
}

// the whole path: the file's text and the export password -> the records
export async function openSpass(b64Text, password) {
  const text = await decryptSpass(b64Text, password);
  return readRecords(parseText(text));
}

// is this text plausibly a .spass file (base64, long enough), before any password is asked?
export function looksLikeSpass(text) {
  const s = String(text || '').replace(BOM_RE, '').replace(/\s+/g, '');
  return s.length >= 80 && /^[A-Za-z0-9+/_-]+={0,2}$/.test(s);
}

export function counts(records) {
  const c = { all: records.length, login: 0, card: 0, note: 0, address: 0, app: 0, noUrl: 0, guessed: 0, lockedCards: 0 };
  for (const r of records) {
    c[r.kind]++;
    if (r.kind === 'login') { if (r.app) c.app++; if (!r.url) c.noUrl++; if (r.app && r.app.guessed) c.guessed++; }
    if (r.kind === 'card' && r.card.locked) c.lockedCards++;
  }
  return c;
}
