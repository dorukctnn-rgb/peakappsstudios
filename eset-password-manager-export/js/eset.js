// Rekey, second source: ESET Password Manager. Reads the CSV that ESET Password Manager 3 exports (menu > Settings > Data >
// Export data > CSV) and turns every row into a Rekey record, the same record shape rank.js and export.js work on, so the
// change order and the Apple Passwords, Google and change-list files come from the one engine that reads the mSecure export.
//
// The format is ESET's own, from its Online Help ("Supported import formats", ESET Password Manager 3, read 19 Nov 2026):
//   - a header row with a modelType column; "the CSV file must have a specific and exact structure ... It does not matter what
//     order they are in", so columns are found by name, never by position;
//   - modelType is Account (modelVersion 3), Identity, CreditCard or Note (modelVersion 1);
//   - the columns of ESET's example header: modelType, modelVersion, name, cardName, number, securityCode, pinCode, type,
//     expirationDateMonth, expirationDateYear, notes, title, text, color, url, username, password, favorite, firstName,
//     lastName, country, zip, city, street, street2, company, county, region, email, phoneNumber;
//   - values are quoted, empty ones are not, and a double quote inside a value is written as two.
// A shorter header that is seen in the wild (no card columns) reads the same way, because a missing column is an empty one.
// Nothing here touches the network or the page; nothing is dropped without being counted or kept as a named field.
import { hostOf, fullUrl, otpOf } from '../../msecure-export/js/parse.js';

/* ------------------------------------------------------------------ CSV (RFC 4180; comma, or semicolon from a spreadsheet) */
export function parseDelimited(text, delim = ',') {
  const BOM = String.fromCharCode(0xfeff);
  let s = String(text || '');
  if (s.startsWith(BOM)) s = s.slice(1);
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
// a file saved by a spreadsheet in a comma-decimal locale (Turkish, German...) separates with semicolons
function delimiterOf(text) {
  const first = String(text || '').replace(/^﻿/, '').split(/\r?\n/, 1)[0] || '';
  const count = ch => first.split(ch).length - 1;
  return count(';') > count(',') ? ';' : ',';
}

/* ------------------------------------------------------------------ columns */
const norm = h => String(h == null ? '' : h).replace(/^﻿/, '').trim().toLowerCase().replace(/[^a-z0-9]/g, '');
// ESET's column names; the key is what the rest of the file calls the value
export const COLUMNS = ['modelType', 'modelVersion', 'name', 'cardName', 'number', 'securityCode', 'pinCode', 'type', 'expirationDateMonth', 'expirationDateYear', 'notes', 'title', 'text', 'color', 'url', 'username', 'password', 'favorite', 'firstName', 'lastName', 'country', 'zip', 'city', 'street', 'street2', 'company', 'county', 'region', 'email', 'phoneNumber'];
const KNOWN = new Map(COLUMNS.map(c => [norm(c), c]));

// the columns each kind of row uses; any other cell with something in it is kept as a named field, so nothing is lost
const USED = {
  login: ['title', 'url', 'username', 'password', 'favorite', 'notes'],
  identity: ['title', 'firstName', 'lastName', 'country', 'zip', 'city', 'street', 'street2', 'company', 'county', 'region', 'email', 'phoneNumber', 'favorite', 'notes'],
  card: ['name', 'cardName', 'title', 'number', 'securityCode', 'pinCode', 'type', 'expirationDateMonth', 'expirationDateYear', 'notes', 'favorite'],
  note: ['title', 'text', 'notes', 'favorite'],
  other: ['favorite', 'notes'],
};
const ALWAYS_DROPPED = new Set(['modelType', 'modelVersion', 'color']); // the type itself, its version, and a note's color (0 to 7)

export function kindOfModel(t) {
  const k = norm(t);
  if (k === 'account' || k === 'login' || k === 'webaccount' || k === 'appaccount') return 'login';
  if (k === 'identity') return 'identity';
  if (k === 'creditcard' || k === 'card' || k === 'paymentcard') return 'card';
  if (k === 'note' || k === 'securenote') return 'note';
  return 'other';
}
const TYPE_LABEL = { login: 'Account', identity: 'Identity', card: 'Credit card', note: 'Note' };

// ESET's card types (its help: generic card, Visa, Master Card, American-Express, Diners Club, Discover, JCB, UnionPay, Maestro)
// as Bitwarden spells its card brands
const BRANDS = { visa: 'Visa', mastercard: 'Mastercard', americanexpress: 'Amex', amex: 'Amex', dinersclub: 'Diners Club', diners: 'Diners Club', discover: 'Discover', jcb: 'JCB', unionpay: 'UnionPay', maestro: 'Maestro', rupay: 'RuPay' };
export function brandOf(t) {
  const k = norm(t);
  if (!k || k === 'generic' || k === 'genericcard') return '';
  return BRANDS[k] || 'Other';
}
const notesText = s => String(s == null ? '' : s).replace(/\r\n?/g, '\n').trim();

/* ------------------------------------------------------------------ what a file is */
// 'eset' | 'msecure' | 'json' | 'plain' (a browser-style CSV) | 'unknown'
export function sniff(text) {
  const t = String(text || '').replace(/^﻿/, '');
  const head = t.trimStart().slice(0, 1);
  if (head === '{' || head === '[') return 'json';
  const rows = parseDelimited(t.slice(0, 200000), delimiterOf(t));
  if (!rows.length) return 'unknown';
  const header = rows[0].map(norm);
  if (header.includes('modeltype')) return 'eset';
  if (header.includes('url') && header.includes('username') && header.includes('password')) return 'plain';
  const typed = rows.slice(0, 40).filter(r => r.length >= 2 && (/\|\d+$/.test(r[0]) || r.slice(4).some(c => /^[^|]*\|\d{1,3}\|/.test(c))));
  if (typed.length >= Math.max(1, Math.ceil(Math.min(rows.length, 40) * 0.5))) return 'msecure';
  return 'unknown';
}
export const looksLikeEset = text => sniff(text) === 'eset';

/* ------------------------------------------------------------------ one row */
const SECRET_LABEL = /pass|pin|secret|code|key|totp|otp|2fa|token/i;
export function readRecord(get, extras, index) {
  // get(name) = the cell of that ESET column in this row ('' when the column is absent or empty)
  const modelType = get('modelType').trim();
  const kind = kindOfModel(modelType);
  const rec = {
    n: index, id: '', name: '', type: TYPE_LABEL[kind] || modelType || 'Unknown', kind, tags: [], note: '', fields: [], legacy: false,
    url: '', host: '', username: '', password: '', otp: '', card: null, identity: null, favorite: /^(true|1|yes)$/i.test(get('favorite').trim()), model: modelType,
  };
  const field = (label, value, secret) => { if (String(value).trim() !== '') rec.fields.push({ label, type: '0', value: String(value), role: 'other', secret: secret != null ? secret : SECRET_LABEL.test(label), used: false }); };
  const notes = notesText(get('notes'));
  let nameCol = '';

  if (kind === 'login') {
    const rawUrl = get('url').trim();
    rec.url = fullUrl(rawUrl);
    rec.host = hostOf(rawUrl);
    if (rawUrl && !rec.url) field('Website', rawUrl, false); // an app link or a bare name stays a field
    rec.username = get('username');
    rec.password = get('password');
    rec.name = get('title').trim() || rec.host || rawUrl || '(no name)';
    rec.note = notes;
  } else if (kind === 'identity') {
    const id = { firstName: get('firstName').trim(), lastName: get('lastName').trim(), country: get('country').trim(), zip: get('zip').trim(), city: get('city').trim(), street: get('street').trim(), street2: get('street2').trim(), company: get('company').trim(), county: get('county').trim(), region: get('region').trim(), email: get('email').trim(), phone: get('phoneNumber').trim() };
    rec.identity = id;
    rec.name = get('title').trim() || [id.firstName, id.lastName].filter(Boolean).join(' ') || id.email || '(no name)';
    rec.note = notes;
  } else if (kind === 'card') {
    const num = get('number').replace(/[\s-]/g, '');
    const m = /^\s*(\d{1,2})\s*$/.exec(get('expirationDateMonth'));
    let year = get('expirationDateYear').trim();
    if (/^\d\d$/.test(year)) year = `20${year}`;
    const month = m && Number(m[1]) >= 1 && Number(m[1]) <= 12 ? String(Number(m[1])) : '';
    rec.card = { number: num, expMonth: month, expYear: /^\d{4}$/.test(year) ? year : '', code: get('securityCode').trim(), holder: get('name').trim(), brand: brandOf(get('type')), pin: get('pinCode').trim() };
    // a month or a year that is not a plain number stays visible instead of being lost
    if (!month && get('expirationDateMonth').trim()) field('Expiry month', get('expirationDateMonth').trim(), false);
    if (!rec.card.expYear && year) field('Expiry year', year, false);
    if (!rec.card.brand && get('type').trim() && !/^generic/i.test(get('type').trim())) field('Card type', get('type').trim(), false);
    rec.card.rounded = !!num && !/^\d+$/.test(num); // 4.11111E+15: a spreadsheet rounded the number
    const last4 = num.replace(/\D/g, '').slice(-4);
    rec.name = get('cardName').trim() || get('title').trim() || (last4 ? `Card ending ${last4}` : rec.card.holder) || '(no name)';
    if (rec.card.pin) field('PIN', rec.card.pin, true);
    if (get('title').trim() && get('cardName').trim() && get('title').trim() !== get('cardName').trim()) field('title', get('title').trim(), false);
    rec.note = notes;
  } else if (kind === 'note') {
    rec.name = get('title').trim() || '(no name)';
    rec.note = [notesText(get('text')), notes].filter(Boolean).join('\n\n');
  } else {
    // a row of a type ESET's help does not list: the first name-like cell names it, every other cell stays a named field
    nameCol = ['title', 'name', 'cardName'].find(c => get(c).trim() !== '') || '';
    rec.name = nameCol ? get(nameCol).trim() : '(no name)';
    rec.note = notes;
  }

  // everything else in the row that holds something: a named field (so a "totp" column, or a value in a column that does not
  // belong to this kind of row, is kept)
  const used = new Set(USED[kind]);
  if (nameCol) used.add(nameCol);
  for (const c of COLUMNS) {
    if (used.has(c) || ALWAYS_DROPPED.has(c)) continue;
    const v = get(c);
    if (String(v).trim() !== '') field(c, notesText(v), SECRET_LABEL.test(c));
  }
  for (const [label, v] of extras) if (String(v).trim() !== '') field(label, notesText(v), SECRET_LABEL.test(label));
  if (kind === 'login') rec.otp = otpOf(rec);
  if (kind === 'identity' && rec.identity.county) field('County', rec.identity.county, false); // Bitwarden has no county line
  return rec;
}

/* ------------------------------------------------------------------ the whole file */
export function readEsetVault(text) {
  const delim = delimiterOf(text);
  const rows = parseDelimited(text, delim);
  const out = { records: [], header: false, columns: [], extraColumns: [], unknownTypes: [], delimiter: delim };
  if (!rows.length) return out;
  const head = rows[0];
  const keys = head.map(h => KNOWN.get(norm(h)) || null);
  if (!keys.includes('modelType')) return out;
  out.header = true;
  // the first column of a name wins; a repeated or unknown column is kept by its own label
  const at = new Map();
  keys.forEach((k, i) => { if (k && !at.has(k)) at.set(k, i); });
  out.columns = [...at.keys()];
  const extraAt = head.map((h, i) => (keys[i] && at.get(keys[i]) === i ? -1 : i)).filter(i => i >= 0 && String(head[i]).trim() !== '');
  out.extraColumns = extraAt.map(i => String(head[i]).trim());
  const unknown = new Set();
  rows.slice(1).forEach(row => {
    const get = name => { const i = at.get(name); return i == null || row[i] == null ? '' : String(row[i]); };
    const extras = extraAt.map(i => [String(head[i]).trim(), row[i] == null ? '' : row[i]]);
    // a row longer than the header: the surplus cells keep a number for a label
    for (let i = head.length; i < row.length; i++) if (String(row[i]).trim() !== '') extras.push([`Column ${i + 1}`, row[i]]);
    const type = get('modelType').trim();
    const rec = readRecord(get, extras, out.records.length);
    if (rec.kind === 'other') unknown.add(type || '(empty type)');
    out.records.push(rec);
  });
  out.unknownTypes = [...unknown];
  return out;
}

export function countsEset(records) {
  const c = { all: records.length, login: 0, card: 0, identity: 0, note: 0, other: 0, noUrl: 0, favorites: 0, withOtp: 0, rounded: 0 };
  for (const r of records) {
    c[r.kind]++;
    if (r.kind === 'login' && !r.url) c.noUrl++;
    if (r.kind === 'login' && r.otp) c.withOtp++;
    if (r.favorite) c.favorites++;
    if (r.card && r.card.rounded) c.rounded++;
  }
  return c;
}

