// Rekey, third source: Synology C2 Password. Reads the file that C2 Password's web portal exports (account icon > Export >
// Download) and turns every item into a Rekey record, the same record shape rank.js and export.js work on, so the change order
// and the Apple Passwords, Google and change-list files come from the one engine that reads the mSecure export.
//
// What is known about the file, and where it comes from (read 19 Nov 2026; no real export was available):
//   - Synology's help ("Export data from C2 Password to another password manager") says the download is a CSV, that file
//     attachments are not exported, and names the columns: Display_Name, Login_URLs, Login_Username, Login_Password, Notes,
//     Login_TOTP, Login_URL_Match_Rules, Tag, Tag_Color, Favorite, and an "Others" field.
//   - Two open-source converters (read, never run) show what "Others" holds: a JSON text with a Type (card, secure, id, bank,
//     driver, router), the typed values (Card_Number, Card_Name, Card_Type, Card_Expiry, Card_CVV, Card_PIN, Card_Phone,
//     Card_URL, Secure_Note, ID_*, Bank_*, Driver_*, Router_*) and a Custom list of user-made fields.
//   - Another converter documents a JSON export in Bitwarden's own shape: {"items":[{name, notes, favorite, fields[{type, name,
//     value}], type 1 login, 2 secure note, 3 card, 4 contact information, login{...}, card{...}, identity{...}}]}.
// So columns are found by name (never by position, case and punctuation ignored), the Others text is read as JSON with the
// slips a hand-edited file has, the JSON variant is read as well, and a value that has no place is kept as a named field:
// nothing is dropped without being counted. Nothing here touches the network or the page.
import { hostOf, fullUrl, otpOf } from '../../msecure-export/js/parse.js';

/* ------------------------------------------------------------------ bytes to text */
// the file as bytes: UTF-8 (with or without a BOM), UTF-16 with a BOM, else Windows-1252 (what a spreadsheet may have saved)
export function decodeBytes(buf) {
  const b = buf instanceof Uint8Array ? buf : new Uint8Array(buf);
  if (b.length >= 2 && b[0] === 0xff && b[1] === 0xfe) return new TextDecoder('utf-16le').decode(b.subarray(2));
  if (b.length >= 2 && b[0] === 0xfe && b[1] === 0xff) return new TextDecoder('utf-16be').decode(b.subarray(2));
  try { return new TextDecoder('utf-8', { fatal: true }).decode(b); } catch (e) { return new TextDecoder('windows-1252').decode(b); }
}

/* ------------------------------------------------------------------ CSV (RFC 4180; comma, or semicolon from a spreadsheet) */
export function parseDelimited(text, delim = ',') {
  let s = String(text || '');
  if (s.charCodeAt(0) === 0xfeff) s = s.slice(1);
  const rows = [];
  let row = [];
  let cell = '';
  let q = false;
  for (let i = 0; i < s.length; i++) {
    const c = s[i];
    if (q) {
      if (c === '"') {
        if (s[i + 1] === '"') { cell += '"'; i++; } else q = false;
      } else cell += c;
      continue;
    }
    if (c === '"') { q = true; continue; }
    if (c === delim) { row.push(cell); cell = ''; continue; }
    if (c === '\r') { if (s[i + 1] === '\n') i++; row.push(cell); rows.push(row); row = []; cell = ''; continue; }
    if (c === '\n') { row.push(cell); rows.push(row); row = []; cell = ''; continue; }
    cell += c;
  }
  if (cell !== '' || row.length) { row.push(cell); rows.push(row); }
  return rows.filter(r => r.some(x => x.trim() !== ''));
}
export function delimiterOf(text) {
  const first = String(text || '').replace(/^﻿/, '').split(/\r?\n/, 1)[0] || '';
  const count = ch => first.split(ch).length - 1;
  return count(';') > count(',') ? ';' : ',';
}

/* ------------------------------------------------------------------ columns */
const norm = h => String(h == null ? '' : h).replace(/^﻿/, '').trim().toLowerCase().replace(/[^a-z0-9]/g, '');
// the column names Synology's help gives, and the names a CSV has after the help's "rename the headers" steps for Chrome, Apple
// Passwords and Bitwarden. The value is the job of the column here.
export const C2_COLUMNS = ['Display_Name', 'Login_URLs', 'Login_Username', 'Login_Password', 'Notes', 'Login_TOTP', 'Login_URL_Match_Rules', 'Tag', 'Tag_Color', 'Favorite', 'Others'];
const ROLE_OF = new Map(Object.entries({
  displayname: 'name', name: 'name', title: 'name',
  loginurls: 'url', loginurl: 'url', urls: 'url', url: 'url', website: 'url', loginuri: 'url', uri: 'url',
  loginusername: 'username', username: 'username', loginuser: 'username', user: 'username', login: 'username',
  loginpassword: 'password', password: 'password', loginpass: 'password', pass: 'password',
  logintotp: 'totp', totp: 'totp', otpauth: 'totp', otp: 'totp', otpsecret: 'totp', loginotp: 'totp',
  email: 'email',
  notes: 'note', note: 'note',
  favorite: 'favorite', favourite: 'favorite', fav: 'favorite',
  tag: 'tag', tags: 'tag', folder: 'tag', group: 'tag', grouping: 'tag',
  tagcolor: 'left', loginurlmatchrules: 'left', // C2 settings no other manager has: counted as left behind
  others: 'others', other: 'others',
  type: 'type',
}));
// a header that only C2 writes
const C2_ONLY = new Set(C2_COLUMNS.map(norm).filter(h => !['notes', 'tag', 'favorite'].includes(h)));

// keys inside the Others text and flat columns that belong to a typed record (prefixes C2 uses)
const TYPED_KEY = /^(card|id|bank|driver|router|contact|secure)/;

/* ------------------------------------------------------------------ what a file is */
// 'c2' (a C2 CSV, or a CSV whose headers were renamed as Synology's help describes), 'c2json', 'jsonenc' (an encrypted JSON),
// 'json' (some other JSON), 'eset', 'msecure', 'unknown'
export function sniff(text) {
  const t = String(text || '').replace(/^﻿/, '');
  const head = t.trimStart().slice(0, 1);
  if (head === '{' || head === '[') {
    let d = null;
    try { d = JSON.parse(t); } catch (e) { return 'json'; }
    if (d && !Array.isArray(d) && (d.encrypted === true || (typeof d.data === 'string' && !d.items))) return 'jsonenc';
    return itemsOf(d) ? 'c2json' : 'json';
  }
  const rows = parseDelimited(t.slice(0, 200000), delimiterOf(t));
  if (!rows.length) return 'unknown';
  const header = rows[0].map(norm);
  if (header.includes('modeltype')) return 'eset';
  if (header.some(h => C2_ONLY.has(h))) return 'c2';
  const roles = new Set(header.map(h => ROLE_OF.get(h)).filter(Boolean));
  if (roles.has('password') && roles.has('name')) return 'c2';
  const typed = rows.slice(0, 40).filter(r => r.length >= 2 && (/\|\d+$/.test(r[0]) || r.slice(4).some(c => /^[^|]*\|\d{1,3}\|/.test(c))));
  if (typed.length >= Math.max(1, Math.ceil(Math.min(rows.length, 40) * 0.5))) return 'msecure';
  return 'unknown';
}
export const looksLikeC2 = text => ['c2', 'c2json'].includes(sniff(text));

// the header row of a CSV that was not recognised, when it is safe to show: short cells that hold no address or secret
export function headerPreview(text) {
  const rows = parseDelimited(String(text || '').slice(0, 20000), delimiterOf(text));
  const h = rows[0] || [];
  const ok = h.length >= 2 && h.length <= 60 && h.every(c => c.length <= 40 && !/@|:\/\/|\s{2,}/.test(c));
  return ok ? h.map(c => c.trim()) : null;
}

/* ------------------------------------------------------------------ small readers */
const text = v => (v == null ? '' : typeof v === 'boolean' ? (v ? 'true' : 'false') : String(v));
const notesText = s => text(s).replace(/\r\n?/g, '\n').trim();
const truthy = v => /^(true|1|yes|y|on|favorite|favourite)$/i.test(text(v).trim());
// a label that names a secret (Password, PIN, Security code, Card_CVV, one-time keys); a ZIP or postal code is not one
const SECRET_WORDS = /(^|[^a-z])(pass(word|code|phrase)?|pin|secret|code|key|totp|otp|2fa|token|cvv|cvc)([^a-z]|$)/i;
const SECRET_LABEL = { test: l => SECRET_WORDS.test(String(l)) && !/zip|postal|area|country|dial|post ?code/i.test(String(l)) };
const BASE32 = /^[A-Z2-7]{16,}=*$/;

// card brands, as Bitwarden spells them
const BRANDS = { visa: 'Visa', mastercard: 'Mastercard', mc: 'Mastercard', americanexpress: 'Amex', amex: 'Amex', dinersclub: 'Diners Club', diners: 'Diners Club', discover: 'Discover', jcb: 'JCB', unionpay: 'UnionPay', maestro: 'Maestro', rupay: 'RuPay' };
export function brandOf(t) {
  const k = norm(t);
  if (!k || k === 'generic' || k === 'other' || k === 'unknown') return '';
  return BRANDS[k] || 'Other';
}
// "MM/YY", "MM/YYYY", "MM-YY", "MMYY", or a month and a year in two cells
export function parseExpiry(month, year) {
  let m = text(month).trim();
  let y = text(year).trim();
  if (m && !y) {
    const x = /^(\d{1,2})\s*[/\-.]\s*(\d{2,4})$/.exec(m) || /^(\d{2})(\d{2})$/.exec(m);
    if (!x) return { month: '', year: '', raw: m };
    m = x[1]; y = x[2];
  }
  if (!m && !y) return { month: '', year: '', raw: '' };
  const mn = /^\d{1,2}$/.test(m) ? Number(m) : 0;
  if (/^\d\d$/.test(y)) y = `20${y}`;
  const okM = mn >= 1 && mn <= 12;
  const okY = /^\d{4}$/.test(y);
  return { month: okM ? String(mn) : '', year: okY ? y : '', raw: okM && okY ? '' : [m, y].filter(Boolean).join('/') };
}
const cardNumber = v => { const s = text(v).trim(); return /^[\d\s-]+$/.test(s) ? s.replace(/[\s-]/g, '') : s; };

// one-time password: an otpauth link stays; a base-32 secret becomes one (Apple Passwords and Bitwarden take both); else ''
function otpFrom(raw, rec) {
  const v = text(raw).trim();
  if (!v) return '';
  if (/^otpauth:\/\/totp\//i.test(v)) return v;
  const s = v.replace(/\s+/g, '').toUpperCase();
  if (BASE32.test(s)) {
    const issuer = rec.host || rec.name;
    return `otpauth://totp/${encodeURIComponent(issuer)}${rec.username ? ':' + encodeURIComponent(rec.username) : ''}?secret=${s.replace(/=+$/, '')}&issuer=${encodeURIComponent(issuer)}`;
  }
  return '';
}

function newRec(n, name) {
  return { n, id: '', name: name || '(no name)', type: 'Login', kind: 'login', tags: [], note: '', fields: [], legacy: false, url: '', host: '', urls: [], username: '', password: '', otp: '', card: null, identity: null, favorite: false, model: '' };
}
function addField(rec, label, value, secret, role = 'other') {
  const v = typeof value === 'object' && value !== null ? JSON.stringify(value) : text(value);
  if (v.trim() === '') return;
  rec.fields.push({ label, type: '0', value: v, role, secret: secret != null ? secret : SECRET_LABEL.test(label), used: false });
}
function setTags(rec, tags) {
  const list = tags.map(t => t.trim()).filter(Boolean);
  if (!list.length) return;
  rec.c2tags = list;
  addField(rec, 'Tags', list.join(', '), false, 'tags');
}
const splitTags = s => text(s).split(/[\r\n;]+/).map(t => t.trim()).filter(Boolean);
// the websites of a login: each one on its own line (also ", " between full addresses). Web addresses go in order; an app link
// (androidapp://...) or a bare name has no host and stays a named field, so Bitwarden can keep it as a URI.
function setWebsites(rec, raw) {
  const parts = text(raw).split(/\r?\n|,\s+(?=[a-z][a-z0-9+.-]*:\/\/)/i).map(s => s.trim()).filter(Boolean);
  const web = [];
  const other = [];
  for (const p of parts) { const u = fullUrl(p); if (u) web.push(u); else other.push(p); }
  rec.urls = web;
  rec.url = web[0] || '';
  rec.host = hostOf(web[0] || parts[0] || '');
  if (web.length > 1) addField(rec, 'More websites', web.slice(1).join('\n'), false, 'moreurls');
  other.forEach((p, i) => addField(rec, other.length > 1 ? `Website ${i + 1}` : 'Website', p, false, 'applink'));
}

/* ------------------------------------------------------------------ the Others text */
// Others is JSON text. Read it as it is; if that fails, as a text with doubled braces and backslash quotes (a hand-edited file);
// a JSON text inside a JSON string is unwrapped once. Returns { data: object | null, bad: boolean }.
export function parseOthers(raw) {
  const s = text(raw).trim();
  if (!s || s === '{}' || s === 'null' || s === '""') return { data: null, bad: false };
  const tries = [s, s.replace(/\\"/g, '"'), /^\{\{[\s\S]*\}\}$/.test(s) ? s.slice(1, -1) : null, /^\{\{[\s\S]*\}\}$/.test(s) ? s.slice(1, -1).replace(/\\"/g, '"') : null];
  for (const t of tries) {
    if (t == null) continue;
    try {
      let d = JSON.parse(t);
      if (typeof d === 'string') d = JSON.parse(d);
      if (d && typeof d === 'object' && !Array.isArray(d)) return Object.keys(d).length ? { data: d, bad: false } : { data: null, bad: false };
    } catch (e) { /* try the next reading */ }
  }
  return { data: null, bad: true };
}
// a case-blind view of an object's keys: get('Card_Number') finds "card number", "CARD_NUMBER"
function view(obj) {
  const m = new Map();
  if (obj && typeof obj === 'object') for (const [k, v] of Object.entries(obj)) if (!m.has(norm(k))) m.set(norm(k), [k, v]);
  return { get: (...names) => { for (const n of names) { const e = m.get(norm(n)); if (e != null && text(e[1]).trim() !== '' && typeof e[1] !== 'object') return text(e[1]); } return ''; }, has: n => m.has(norm(n)), entries: () => [...m.values()], raw: n => (m.get(norm(n)) || [])[1] };
}
// Others' Type: the kind of item it is
export function kindOfType(t) {
  const k = norm(t);
  if (!k) return { kind: '', label: '' };
  if (['card', 'creditcard', 'paymentcard', 'payment'].includes(k)) return { kind: 'card', label: 'Payment card' };
  if (['secure', 'securenote', 'note', 'notes'].includes(k)) return { kind: 'note', label: 'Secure note' };
  if (['id', 'idcard', 'identitycard', 'nationalid'].includes(k)) return { kind: 'note', label: 'ID card' };
  if (['bank', 'bankaccount'].includes(k)) return { kind: 'note', label: 'Bank account' };
  if (['driver', 'driverlicense', 'driverslicense', 'drivinglicense', 'driverlicence'].includes(k)) return { kind: 'note', label: 'Driver\'s license' };
  if (['router', 'wirelessrouter', 'wifi', 'wifirouter'].includes(k)) return { kind: 'note', label: 'Wireless router' };
  if (['contact', 'contactinformation', 'identity', 'person'].includes(k)) return { kind: 'identity', label: 'Contact information' };
  if (['login', 'password', 'website', 'account'].includes(k)) return { kind: 'login', label: 'Login' };
  return { kind: 'other', label: text(t).trim() };
}

// the Custom list: [{ Type, <Type>_Title, <Type>_Type, <Type>, <Type>_Selector }]
function readCustom(rec, list) {
  if (!Array.isArray(list)) return;
  list.forEach((entry, i) => {
    if (!entry || typeof entry !== 'object') return;
    const kind = text(entry.Type || entry.type).trim();
    let value = kind ? text(entry[kind] != null && typeof entry[kind] !== 'object' ? entry[kind] : '') : '';
    if (!value.trim()) {
      for (const [k, v] of Object.entries(entry)) {
        if (k === 'Type' || k === 'type' || k === kind || /_(Title|Type|Selector)$/.test(k)) continue;
        value = typeof v === 'object' && v ? JSON.stringify(v) : text(v);
        if (value.trim()) break;
      }
    }
    if (!value.trim()) return;
    const title = text(entry[`${kind}_Title`]).trim() || kind || `Custom ${i + 1}`;
    const inputType = text(entry[`${kind}_Type`]).trim().toLowerCase();
    addField(rec, title, value, kind.toLowerCase() === 'password' || inputType === 'password' || SECRET_LABEL.test(title));
  });
}

// the typed values of an Others text: what each kind of item uses, in reading order; the rest become named fields
const CARD_USED = ['cardnumber', 'number', 'cardname', 'cardholder', 'cardtype', 'cardbrand', 'cardexpiry', 'cardexpiration', 'expiry', 'cardcvv', 'cardcode', 'cvv', 'cvc', 'cardpin', 'pin', 'cardphone', 'cardurl', 'securenote'];
function fillCard(rec, o) {
  const exp = parseExpiry(o.get('Card_Expiry', 'Card Expiry', 'Expiry', 'Card_Expiration'), '');
  const num = cardNumber(o.get('Card_Number', 'Card Number', 'Number'));
  rec.card = { number: num, expMonth: exp.month, expYear: exp.year, code: o.get('Card_CVV', 'Card_Code', 'CVV', 'CVC').trim(), holder: o.get('Card_Name', 'Card_Holder', 'Cardholder').trim(), brand: brandOf(o.get('Card_Type', 'Card_Brand')), pin: o.get('Card_PIN', 'PIN').trim(), rounded: !!num && !/^\d+$/.test(num) };
  if (exp.raw) addField(rec, 'Card_Expiry', exp.raw, false);
  const bt = o.get('Card_Type', 'Card_Brand').trim();
  if (!rec.card.brand && bt && !/^(generic|other|unknown)$/i.test(bt)) addField(rec, 'Card type', bt, false);
  if (rec.card.pin) addField(rec, 'PIN', rec.card.pin, true);
  addField(rec, 'Card_Phone', o.get('Card_Phone'), false);
  addField(rec, 'Card_URL', o.get('Card_URL'), false);
  leftover(rec, o, CARD_USED);
  const last4 = rec.card.number.replace(/\D/g, '').slice(-4);
  if (rec.name === '(no name)') rec.name = last4 ? `Card ending ${last4}` : rec.card.holder || '(no name)';
}
// every key of the Others text that the kind of item does not use is a named field (a nested value one field per leaf)
function leftover(rec, o, usedKeys) {
  const skip = new Set([...usedKeys, 'type', 'custom']);
  for (const [k, v] of o.entries()) {
    if (skip.has(norm(k))) continue;
    const val = typeof v === 'object' && v ? flatObject(v, k) : [[k, text(v)]];
    for (const [label, value] of val) addField(rec, label.replace(/_/g, ' '), value, SECRET_LABEL.test(label));
  }
}
// contact information: Bitwarden-style names found by what the key ends in, after the prefix (Contact_, Identity_)
const CONTACT_MAP = [
  ['firstName', /^(first|given)(name)?$/], ['lastName', /^(last|family|sur)(name)?$/], ['middleName', /^middle(name)?$/], ['title', /^(title|salutation|prefix)$/],
  ['company', /^(company|organi[sz]ation|employer)$/], ['email', /^e?mail(address)?$/], ['phone', /^(phone|mobile|tel|telephone|phonenumber|mobilephone)$/],
  ['street', /^(address|address1|street|streetaddress|addressline1)$/], ['street2', /^(address2|addressline2|street2)$/],
  ['city', /^(city|citytown|town|addresscitytown)$/], ['region', /^(state|province|stateprovince|region|addressstateprovince)$/], ['zip', /^(zip|zipcode|postal|postalcode|zippostalcode|addresszipcode)$/], ['country', /^(country|countryregion|addresscountry)$/],
];
function emptyIdentity() { return { title: '', firstName: '', middleName: '', lastName: '', street: '', street2: '', city: '', region: '', zip: '', country: '', company: '', email: '', phone: '', ssn: '', username: '', passport: '', license: '' }; }
function fillContact(rec, o) {
  const id = emptyIdentity();
  const left = [];
  for (const [k, v] of o.entries()) {
    const key = norm(k);
    if (key === 'type' || key === 'custom') continue;
    if (typeof v === 'object' && v) { left.push([k, JSON.stringify(v)]); continue; }
    const bare = key.replace(/^(contact|identity|person)/, '');
    const hit = CONTACT_MAP.find(([f, re]) => re.test(bare) && !id[f]);
    if (hit && text(v).trim()) id[hit[0]] = text(v).trim(); else if (text(v).trim()) left.push([k, text(v)]);
  }
  rec.identity = id;
  if (rec.name === '(no name)') rec.name = [id.firstName, id.lastName].filter(Boolean).join(' ') || id.email || '(no name)';
  for (const [k, v] of left) addField(rec, k.replace(/_/g, ' '), v, SECRET_LABEL.test(k));
}

// one row of a C2 CSV (or one JSON item written like a CSV row): `cols` = { role: value }, `flat` = [[header, value]] of every
// other column
function rowToRecord(n, cols, flat) {
  const rec = newRec(n, text(cols.name).trim());
  rec.favorite = truthy(cols.favorite);
  const note = notesText(cols.note);
  const parsed = parseOthers(cols.others);
  // flat columns named like the typed keys (Card_Number, Secure_Note...) are read as if they were in Others
  const merged = { ...(parsed.data || {}) };
  const extraFlat = [];
  for (const [h, v] of flat) {
    if (text(v).trim() === '') continue;
    if (TYPED_KEY.test(norm(h)) || norm(h) === 'custom') merged[h] = v; else extraFlat.push([h, v]);
  }
  const o = view(merged);
  const hasLogin = [cols.url, cols.username, cols.password, cols.totp, cols.email].some(v => text(v).trim() !== '');
  let t = kindOfType(o.get('Type') || (text(cols.type).toLowerCase() === 'note' ? 'secure' : ''));
  if (!t.kind) {
    if (o.has('Card_Number') && !hasLogin) t = { kind: 'card', label: 'Payment card' };
    else if (hasLogin || !(o.has('Secure_Note') || note)) t = { kind: 'login', label: 'Login' };
    else t = { kind: 'note', label: 'Secure note' };
  }
  rec.kind = t.kind;
  rec.type = t.label || 'Login';
  rec.model = text(o.get('Type'));
  const login = () => {
    setWebsites(rec, cols.url);
    rec.username = text(cols.username) || text(cols.email);
    rec.password = text(cols.password);
  };
  if (rec.kind === 'login') {
    login();
    if (rec.name === '(no name)') rec.name = rec.host || rec.url || text(cols.url).trim().split(/\r?\n/)[0] || '(no name)';
    rec.note = note;
    const otp = otpFrom(cols.totp, rec);
    if (otp) rec.otp = otp; else addField(rec, 'Login_TOTP', cols.totp, true);
    rec.otpBad = !otp && text(cols.totp).trim() !== '';
    leftover(rec, o, []);
  } else {
    // a typed item may also carry login columns (the community converters drop them): kept as named fields
    if (hasLogin) {
      if (text(cols.url).trim()) addField(rec, 'Website', text(cols.url).trim().replace(/\r?\n/g, ', '), false);
      addField(rec, 'Username', cols.username || cols.email, false);
      addField(rec, 'Password', cols.password, true);
      addField(rec, 'Login_TOTP', cols.totp, true);
    }
    if (rec.kind === 'card') { fillCard(rec, o); rec.note = note; }
    else if (rec.kind === 'identity') { fillContact(rec, o); rec.note = note; }
    else {
      // secure note, ID, bank, driver, router, anything unknown: the text first, then every value under its own name
      const body = o.get('Secure_Note', 'Secure Note', 'Note');
      rec.note = [body, note].filter(Boolean).join('\n\n');
      for (const [k, v] of o.entries()) {
        const key = norm(k);
        if (key === 'type' || key === 'custom' || key === 'securenote' || key === 'note') continue;
        const val = typeof v === 'object' && v ? flatObject(v, k) : [[k, text(v)]];
        for (const [label, value] of val) addField(rec, label.replace(/_/g, ' '), value, SECRET_LABEL.test(label));
      }
    }
  }
  readCustom(rec, o.raw('Custom'));
  setTags(rec, splitTags(cols.tag));
  for (const [h, v] of extraFlat) addField(rec, String(h).trim(), notesText(v), SECRET_LABEL.test(h));
  if (rec.kind === 'login' && !rec.otp) rec.otp = otpOf(rec);
  rec.badOthers = parsed.bad;
  if (parsed.bad) addField(rec, 'Others', text(cols.others), false);
  return rec;
}
// a nested value written one leaf per field: "ID_Address Address", "ID_Address City_Town"
function flatObject(v, label) {
  const out = [];
  const walk = (x, l) => {
    if (Array.isArray(x)) x.forEach((y, i) => walk(y, `${l} ${i + 1}`));
    else if (x && typeof x === 'object') for (const [k, y] of Object.entries(x)) walk(y, `${l} ${k}`);
    else if (text(x).trim() !== '') out.push([l, text(x)]);
  };
  walk(v, label);
  return out;
}

/* ------------------------------------------------------------------ the CSV */
export function readC2Csv(textIn) {
  const delim = delimiterOf(textIn);
  const rows = parseDelimited(textIn, delim);
  const out = { records: [], header: false, format: 'csv', columns: [], extraColumns: [], leftColumns: [], unknownTypes: [], badOthers: 0, badTotp: 0, delimiter: delim, renamed: false };
  if (!rows.length) return out;
  const head = rows[0];
  const keys = head.map(h => norm(h));
  const roles = keys.map(k => ROLE_OF.get(k) || null);
  if (!(keys.some(k => C2_ONLY.has(k)) || (roles.includes('password') && roles.includes('name')))) return out;
  out.header = true;
  out.renamed = !keys.some(k => C2_ONLY.has(k));
  const at = new Map();
  roles.forEach((r, i) => { if (r && !at.has(r)) at.set(r, i); });
  out.columns = head.filter((h, i) => roles[i] && at.get(roles[i]) === i && roles[i] !== 'left').map(h => String(h).trim());
  out.leftColumns = head.filter((h, i) => roles[i] === 'left').map(h => String(h).trim());
  // columns with no job (or a second column of a job already taken): read as named fields, or as typed Others keys
  const flatAt = head.map((h, i) => ((roles[i] && at.get(roles[i]) === i) || roles[i] === 'left' || String(h).trim() === '' ? -1 : i)).filter(i => i >= 0);
  out.extraColumns = flatAt.map(i => String(head[i]).trim()).filter(h => !TYPED_KEY.test(norm(h)) && norm(h) !== 'custom');
  const unknown = new Set();
  rows.slice(1).forEach(row => {
    const cell = r => { const i = at.get(r); return i == null || row[i] == null ? '' : String(row[i]); };
    const cols = { name: cell('name'), url: cell('url'), username: cell('username'), email: cell('email'), password: cell('password'), totp: cell('totp'), note: cell('note'), favorite: cell('favorite'), tag: cell('tag'), others: cell('others'), type: cell('type') };
    const flat = flatAt.map(i => [String(head[i]).trim(), row[i] == null ? '' : row[i]]);
    // a row longer than the header: the surplus cells keep a number for a label
    for (let i = head.length; i < row.length; i++) if (String(row[i]).trim() !== '') flat.push([`Column ${i + 1}`, row[i]]);
    const rec = rowToRecord(out.records.length, cols, flat);
    if (rec.kind === 'other') unknown.add(rec.model || rec.type);
    if (rec.badOthers) out.badOthers++;
    if (rec.otpBad) out.badTotp++;
    out.records.push(rec);
  });
  out.unknownTypes = [...unknown];
  return out;
}

/* ------------------------------------------------------------------ the JSON */
function itemsOf(d) {
  if (Array.isArray(d)) return d.length && d.every(x => x && typeof x === 'object') ? d : (d.length === 0 ? d : null);
  if (d && typeof d === 'object') for (const k of ['items', 'Items', 'data', 'entries', 'passwords']) if (Array.isArray(d[k])) return d[k];
  return null;
}
const C2_TYPES = { 1: ['login', 'Login'], 2: ['note', 'Secure note'], 3: ['card', 'Payment card'], 4: ['identity', 'Contact information'] };

function jsonItemToRecord(n, item) {
  // an item written like a CSV row ({"Display_Name": ..., "Others": ...}) is read as one
  const v = view(item);
  if (v.has('Display_Name') || v.has('Login_URLs') || v.has('Login_Username') || v.has('Others')) {
    const cols = { name: v.get('Display_Name', 'name'), url: v.get('Login_URLs', 'Login_URL', 'url'), username: v.get('Login_Username', 'username'), email: '', password: v.get('Login_Password', 'password'), totp: v.get('Login_TOTP', 'totp'), note: v.get('Notes', 'note'), favorite: v.get('Favorite'), tag: v.get('Tag', 'Tags'), others: typeof v.raw('Others') === 'object' ? JSON.stringify(v.raw('Others')) : v.get('Others'), type: '' };
    return rowToRecord(n, cols, []);
  }
  const rec = newRec(n, text(item.name).trim());
  rec.favorite = !!item.favorite;
  const raw = Number(item.type);
  const [kind, label] = C2_TYPES[raw] || ['other', `Item of type ${text(item.type) || '?'}`];
  rec.kind = kind;
  rec.type = label;
  rec.model = text(item.type);
  rec.note = notesText(item.notes);
  const used = new Set(['name', 'notes', 'favorite', 'fields', 'type', 'login', 'secureNote', 'card', 'identity', 'id', 'organizationId', 'folderId', 'collectionIds', 'reprompt', 'passwordHistory', 'revisionDate', 'creationDate', 'deletedDate', 'attachments', 'object']);
  let tags = [];
  const fieldList = Array.isArray(item.fields) ? item.fields : [];
  for (const f of fieldList) {
    if (!f || typeof f !== 'object') continue;
    const name = text(f.name).trim() || 'Field';
    const value = typeof f.value === 'object' && f.value ? JSON.stringify(f.value) : text(f.value);
    if (name === 'Tags') { tags = tags.concat(splitTags(value)); continue; }
    addField(rec, name, value, Number(f.type) === 1);
  }
  if (kind === 'login') {
    const l = item.login && typeof item.login === 'object' ? item.login : {};
    const uris = Array.isArray(l.uris) ? l.uris.map(u => (u && typeof u === 'object' ? text(u.uri) : text(u)).trim()).filter(Boolean) : [];
    setWebsites(rec, uris.join('\n'));
    rec.username = text(l.username);
    rec.password = text(l.password);
    if (rec.name === '(no name)') rec.name = rec.host || rec.url || '(no name)';
    const otp = otpFrom(l.totp, rec);
    if (otp) rec.otp = otp; else if (text(l.totp).trim()) { addField(rec, 'Login_TOTP', l.totp, true); rec.otpBad = true; }
    if (!rec.otp) rec.otp = otpOf(rec);
  } else if (kind === 'card') {
    const c = item.card && typeof item.card === 'object' ? item.card : {};
    const exp = parseExpiry(c.expMonth, c.expYear);
    const num = cardNumber(c.number);
    rec.card = { number: num, expMonth: exp.month, expYear: exp.year, code: text(c.code).trim(), holder: text(c.cardholderName).trim(), brand: brandOf(c.brand), pin: '', rounded: !!num && !/^\d+$/.test(num) };
    if (exp.raw) addField(rec, 'Card expiry', exp.raw, false);
    if (!rec.card.brand && text(c.brand).trim()) addField(rec, 'Card type', c.brand, false);
    // the PIN is a field C2 names "Card PIN": it is also the card's PIN
    const pin = rec.fields.find(f => /^card[ _]?pin$/i.test(f.label));
    if (pin) { rec.card.pin = pin.value; pin.label = 'PIN'; pin.secret = true; }
    for (const [k, val] of Object.entries(c)) if (!['cardholderName', 'brand', 'number', 'expMonth', 'expYear', 'code'].includes(k)) flatObject(val, `Card ${k}`).forEach(([l, x]) => addField(rec, l, x));
    const last4 = num.replace(/\D/g, '').slice(-4);
    if (rec.name === '(no name)') rec.name = last4 ? `Card ending ${last4}` : rec.card.holder || '(no name)';
  } else if (kind === 'identity') {
    const d = item.identity && typeof item.identity === 'object' ? item.identity : {};
    const id = emptyIdentity();
    const map = { title: 'title', firstName: 'firstName', middleName: 'middleName', lastName: 'lastName', address1: 'street', address2: 'street2', city: 'city', state: 'region', postalCode: 'zip', country: 'country', company: 'company', email: 'email', phone: 'phone', ssn: 'ssn', username: 'username', passportNumber: 'passport', licenseNumber: 'license' };
    for (const [k, to] of Object.entries(map)) id[to] = text(d[k]).trim();
    for (const [k, val] of Object.entries(d)) if (!(k in map)) flatObject(val, `Contact ${k}`).forEach(([l, x]) => addField(rec, l, x));
    if (text(d.address3).trim()) addField(rec, 'Contact address3', d.address3, false);
    rec.identity = id;
    if (rec.name === '(no name)') rec.name = [id.firstName, id.lastName].filter(Boolean).join(' ') || id.email || '(no name)';
  } else if (kind === 'other') {
    // a type nobody documented: every key of the item becomes a named field
    for (const [k, val] of Object.entries(item)) if (!used.has(k)) flatObject(val, k).forEach(([l, x]) => addField(rec, l, x));
  }
  // a payload key that does not belong to this kind of item is still a field
  for (const k of ['login', 'card', 'identity']) {
    const own = (kind === 'login' && k === 'login') || (kind === 'card' && k === 'card') || (kind === 'identity' && k === 'identity');
    if (!own && item[k] && typeof item[k] === 'object') flatObject(item[k], k).forEach(([l, x]) => addField(rec, l, x));
  }
  setTags(rec, tags);
  return rec;
}

export function readC2Json(textIn) {
  const out = { records: [], header: false, format: 'json', columns: [], extraColumns: [], leftColumns: [], unknownTypes: [], badOthers: 0, badTotp: 0, delimiter: '', renamed: false };
  let d;
  try { d = JSON.parse(String(textIn || '').replace(/^﻿/, '')); } catch (e) { return out; }
  const items = itemsOf(d);
  if (!items) return out;
  out.header = true;
  const unknown = new Set();
  items.forEach(it => {
    if (!it || typeof it !== 'object') return;
    const rec = jsonItemToRecord(out.records.length, it);
    if (rec.kind === 'other') unknown.add(rec.type);
    if (rec.badOthers) out.badOthers++;
    if (rec.otpBad) out.badTotp++;
    out.records.push(rec);
  });
  out.unknownTypes = [...unknown];
  return out;
}

// the file, whichever of the two it is
export function readC2Vault(textIn) {
  return sniff(textIn) === 'c2json' ? readC2Json(textIn) : readC2Csv(textIn);
}

export function countsC2(records) {
  const c = { all: records.length, login: 0, card: 0, identity: 0, note: 0, other: 0, noUrl: 0, favorites: 0, withOtp: 0, rounded: 0, tagged: 0, manyUrls: 0 };
  for (const r of records) {
    c[r.kind]++;
    if (r.kind === 'login' && !r.url) c.noUrl++;
    if (r.kind === 'login' && r.otp) c.withOtp++;
    if (r.favorite) c.favorites++;
    if (r.card && r.card.rounded) c.rounded++;
    if (r.c2tags) c.tagged++;
    if (r.urls && r.urls.length > 1) c.manyUrls++;
  }
  return c;
}
