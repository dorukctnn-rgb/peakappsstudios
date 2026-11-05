// Rekey: reads the CSV that mSecure 5 and 6 for Mac or Windows export (File > Export > CSV on a Mac, Settings > Backups on
// Windows). The file has no header row. Each row is one record:
//   Name|id, Type, Tag, Note, Label|type|value, Label|type|value, ...
// (Bitwarden's own importer reads it the same way: libs/importer/src/importers/msecure-csv-importer.ts; a "|" inside a field
// value is written as "||", seen in msecure2bitwarden's test file). Older exports (mSecure 3.5 and 4, type "Web Logins") put
// the values without labels; they are read by position. A file whose first row is a header (someone added one by hand, as
// mSecure's forum suggests for Apple Passwords) is read too. Nothing here touches the network or the page.

/* ------------------------------------------------------------------ CSV (RFC 4180, quotes, CRLF, BOM) */
export function parseCsv(text) {
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
    if (c === ',') { row.push(cell); cell = ''; continue; }
    if (c === '\r') { if (s[i + 1] === '\n') i++; row.push(cell); rows.push(row); row = []; cell = ''; continue; }
    if (c === '\n') { row.push(cell); rows.push(row); row = []; cell = ''; continue; }
    cell += c;
  }
  if (cell !== '' || row.length) { row.push(cell); rows.push(row); }
  return rows.filter(r => r.some(x => x.trim() !== ''));
}

// one CSV value for the files Rekey writes (quoted when it has to be; a formula sign at the start is kept as typed)
export function csvCell(v) {
  const s = v == null ? '' : String(v);
  return /[",\r\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}
export const csvLine = cells => cells.map(csvCell).join(',');

/* ------------------------------------------------------------------ record kinds */
// mSecure's record types (5 and 6, and the plural names of 3.5 and 4) and the kind Rekey treats them as
const KIND_OF = [
  [/^(web )?logins?$/i, 'login'],
  [/^email accounts?$/i, 'login'],
  [/^credit cards?$/i, 'card'],
  [/^(secure )?notes?$/i, 'note'],
  [/^unassigned$/i, 'note'],
];
export function kindOf(type, fields) {
  for (const [re, k] of KIND_OF) if (re.test(String(type || '').trim())) return k;
  // any other record with a password and a username or a website is a login too (Wi-Fi, servers, apps and so on)
  const hasPw = fields.some(f => f.role === 'password');
  const hasUser = fields.some(f => f.role === 'username' || f.role === 'url');
  return hasPw && hasUser ? 'login' : 'other';
}

/* ------------------------------------------------------------------ fields */
// mSecure's field type numbers, as they appear in real exports (Bitwarden's tests, msecure2bitwarden's file): 0 text, 2 URL,
// 4 phone, 6 number, 7 username, 8 password, 9 secret (PIN, security code), 11 date, 12 card number. Labels decide the rest.
const SECRET_TYPES = new Set(['8', '9']);
function roleOf(label, t) {
  const l = String(label || '').trim().toLowerCase();
  if (t === '2' || /^(website|web site|url|web address|address \(url\)|site)$/.test(l)) return 'url';
  if (t === '7' || /^(user ?name|login|user ?id|login name|account name)$/.test(l)) return 'username';
  if (t === '8' && !/\b(2|second|old|previous|pin)\b/.test(l)) return 'password';
  if (/^password$/.test(l)) return 'password';
  if (t === '12' || /^card ?(no\.?|number|#)$/.test(l)) return 'cardNumber';
  if (t === '11' || /^(expiration|expiry|exp\.?)( date)?$/.test(l)) return 'expiry';
  if (/^(security code|cvv|cvc|cvv2|csc)$/.test(l)) return 'cvv';
  if (/^name on card$|^card ?holder/.test(l)) return 'cardholder';
  if (/^(issuing bank|bank|card type|brand)$/.test(l)) return 'brand';
  if (/^(email|e-mail|email address)$/.test(l)) return 'email';
  return 'other';
}
// a field that holds a one-time-password secret, an otpauth link or backup codes (things to re-enrol after the incident)
export const OTP_LABEL = /(one[- ]?time|\botp\b|\b2fa\b|two[- ]?factor|totp|authenticator|verification code|backup codes?|recovery codes?|mfa)/i;
const BASE32 = /^[A-Z2-7]{16,}=*$/;

function splitField(raw) {
  // "Label|type|value": the label never holds a pipe; the value may (written as "||")
  const m = /^([^|]*)\|(\d{1,3})\|([\s\S]*)$/.exec(raw);
  if (!m) return null;
  return { label: m[1].trim(), type: m[2], value: m[3].replace(/\|\|/g, '|') };
}
const notesText = s => String(s || '').replace(/\\n/g, '\n').replace(/\r\n?/g, '\n').trim();

// legacy rows (mSecure 3.5 and 4): values by position, no labels
const LEGACY = {
  login: ['Website', 'Username', 'Password'],
  card: ['Card Number', 'Expiration Date', 'Name on Card', 'PIN', 'Bank', 'Security Code'],
  email: ['Username', 'Password', 'POP3 Host', 'SMTP Host'],
};

/* ------------------------------------------------------------------ one row, the whole file */
function nameAndId(cell) {
  const c = String(cell || '');
  const m = /^([\s\S]*)\|(\d+)$/.exec(c);
  if (m) return { name: m[1].replace(/\|\|/g, '|').trim(), id: m[2] };
  return { name: c.trim(), id: '' };
}
function isHeader(row) {
  const a = row.map(c => c.trim().toLowerCase());
  return (a[0] === 'name' || a[0] === 'title') && (a.includes('type') || a.includes('url') || a.includes('password') || a.includes('username'));
}
export function hostOf(u) {
  const s = String(u || '').trim();
  if (!s) return '';
  try {
    const url = new URL(/^[a-z][a-z0-9+.-]*:\/\//i.test(s) ? s : `https://${s}`);
    if (!/^https?:$/.test(url.protocol)) return '';
    const h = url.hostname.toLowerCase().replace(/^www\./, '');
    return /^[a-z0-9.-]+\.[a-z]{2,}$/.test(h) || /^[a-z0-9-]+\.[a-z0-9-]+$/.test(h) ? h : '';
  } catch (e) { return ''; }
}
// the website as an importer wants it (scheme included); a bare "chase.com" becomes "https://chase.com"
export function fullUrl(u) {
  const s = String(u || '').trim();
  if (!s) return '';
  if (/^https?:\/\//i.test(s)) return s;
  if (/^[a-z][a-z0-9+.-]*:/i.test(s)) return '';
  return hostOf(s) ? `https://${s}` : '';
}

export function readRow(row, index) {
  if (!row || !row.length) return null;
  const { name, id } = nameAndId(row[0]);
  const type = String(row[1] || '').trim();
  const tagCell = String(row[2] || '').trim();
  const tags = tagCell && !/^unassigned$/i.test(tagCell) ? tagCell.split(/\s*;\s*/).filter(Boolean) : [];
  const note = notesText(row[3]);
  const fields = [];
  const loose = [];
  for (const raw of row.slice(4)) {
    if (raw == null || raw === '') continue;
    const f = splitField(raw);
    if (f) fields.push({ ...f, role: roleOf(f.label, f.type), secret: SECRET_TYPES.has(f.type) || /pass|pin|secret|code|key/i.test(f.label) });
    else loose.push(raw);
  }
  let legacy = false;
  if (loose.length && !fields.length) {
    legacy = true;
    const t = type.toLowerCase();
    const names = /login/.test(t) ? LEGACY.login : /card/.test(t) ? LEGACY.card : /email/.test(t) ? LEGACY.email : [];
    loose.forEach((v, i) => {
      const label = names[i] || `Field ${i + 1}`;
      const tt = /login/.test(t) ? (['2', '7', '8'][i] || '0') : '0';
      fields.push({ label, type: tt, value: v, role: roleOf(label, tt), secret: /pass|pin|code/i.test(label) });
    });
  } else if (loose.length) {
    // a value without a label next to labelled fields: kept, so nothing is lost
    loose.forEach((v, i) => fields.push({ label: `Field ${i + 1}`, type: '0', value: v, role: 'other', secret: false }));
  }
  if (!name && !fields.length && !note) return null;
  // the first non-empty field of a role; it is marked as used, so the other exports list only the fields left over
  const pick = role => { const f = fields.find(x => x.role === role && !x.used && String(x.value).trim() !== ''); if (!f) return ''; f.used = true; return f.value; };
  const kind = kindOf(type, fields);
  const rec = {
    n: index, id, name: name || '(no name)', type: type || 'Unassigned', kind, tags, note, fields, legacy,
    url: '', host: '', username: '', password: '', otp: '', card: null,
  };
  if (kind === 'login') {
    const u = pick('url');
    rec.url = fullUrl(u);
    rec.host = hostOf(u);
    if (u && !rec.url) { const f = fields.find(x => x.value === u); if (f) f.used = false; } // an app link or a bare name stays a field
    rec.username = pick('username') || pick('email');
    rec.password = pick('password');
  }
  if (kind === 'card') {
    const exp = pick('expiry');
    const m = /^\s*(\d{1,2})\s*\/\s*(\d{2,4})\s*$/.exec(exp);
    let year = m ? m[2] : '';
    if (/^00\d\d$/.test(year)) year = `20${year.slice(2)}`; // "04/0029" in old exports
    else if (/^\d\d$/.test(year)) year = `20${year}`;
    rec.card = { number: pick('cardNumber'), expMonth: m ? String(Number(m[1])).padStart(2, '0') : '', expYear: year, code: pick('cvv'), holder: pick('cardholder'), brand: pick('brand') };
  }
  rec.otp = otpOf(rec);
  return rec;
}

// an otpauth:// link for the one-time-password field, if the record has one Apple Passwords and Bitwarden can use
export function otpOf(rec) {
  for (const f of rec.fields) {
    const v = String(f.value || '').trim();
    if (/^otpauth:\/\/totp\//i.test(v)) return v;
  }
  for (const f of rec.fields) {
    if (!OTP_LABEL.test(f.label)) continue;
    const v = String(f.value || '').replace(/\s+/g, '').toUpperCase();
    if (BASE32.test(v)) {
      const issuer = rec.host || rec.name;
      return `otpauth://totp/${encodeURIComponent(issuer)}${rec.username ? ':' + encodeURIComponent(rec.username) : ''}?secret=${v.replace(/=+$/, '')}&issuer=${encodeURIComponent(issuer)}`;
    }
  }
  return '';
}

export function readVault(text) {
  const rows = parseCsv(text);
  const out = { records: [], skipped: 0, header: false, legacy: 0 };
  rows.forEach((row, i) => {
    if (i === 0 && isHeader(row)) { out.header = true; return; }
    const rec = readRow(row, out.records.length);
    if (rec) { out.records.push(rec); if (rec.legacy) out.legacy++; } else out.skipped++;
  });
  return out;
}

// is this text an mSecure export at all? (another password manager's CSV has a header row and no "Label|n|value" cells)
export function looksLikeMsecure(text) {
  const rows = parseCsv(String(text || '').slice(0, 200000)).slice(0, 40);
  if (!rows.length) return false;
  const body = isHeader(rows[0]) ? rows.slice(1) : rows;
  if (!body.length) return false;
  const typed = body.filter(r => r.length >= 2 && (/\|\d+$/.test(r[0]) || r.slice(4).some(c => /^[^|]*\|\d{1,3}\|/.test(c)) || /^(web logins|login|credit cards?|email accounts?|notes?|unassigned|bank accounts?)$/i.test(String(r[1] || '').trim())));
  return typed.length >= Math.max(1, Math.ceil(body.length * 0.5));
}

export function counts(records) {
  const c = { all: records.length, login: 0, card: 0, note: 0, other: 0, noUrl: 0, tags: new Set() };
  for (const r of records) {
    c[r.kind]++;
    if (r.kind === 'login' && !r.url) c.noUrl++;
    r.tags.forEach(t => c.tags.add(t));
  }
  c.tagCount = c.tags.size;
  return c;
}
