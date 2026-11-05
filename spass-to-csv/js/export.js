// Decant: the files it writes. All of them are made in this page from the records spass.js read; none is sent anywhere.
//   Apple Passwords CSV   Title,URL,Username,Password,Notes,OTPAuth (the columns of the Passwords app's own export; Mac:
//                         File > Import Passwords from File)
//   Google / Chrome CSV   name,url,username,password,note (Google Password Manager; Bitwarden, 1Password and Proton Pass read it as
//                         a Chrome file; up to 3,000 rows per Google import)
//   Bitwarden JSON        an unencrypted Bitwarden export: logins with every extra field and one-time codes, cards as cards, addresses
//                         as identities, notes as secure notes (Bitwarden and KeePassXC import it)
//   change list CSV       the logins in the order to change them, with no password in it
//   record sheet (HTML)   cards, addresses and notes on paper-friendly pages
import { checklist, changeUrl, GROUPS } from './rank.js';

export const csvCell = v => { const s = v == null ? '' : String(v); return /[",\r\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s; };
export const csvLine = cells => cells.map(csvCell).join(',');
const esc = s => String(s == null ? '' : s).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
const CRLF = '\r\n';

// the fields a destination has no column for, written into its notes so nothing is lost
export function extrasText(rec) {
  const lines = [];
  for (const f of rec.fields) {
    if (f.used || String(f.value).trim() === '') continue;
    lines.push(`${f.label}: ${f.value}`);
  }
  return lines;
}
function notesFor(rec) {
  const parts = [];
  if (rec.note) parts.push(rec.note);
  const ex = extrasText(rec);
  if (ex.length) parts.push(ex.join('\n'));
  return parts.join('\n\n');
}
const logins = records => records.filter(r => r.kind === 'login');

/* ------------------------------------------------------------------ Apple Passwords */
export function appleCsv(records) {
  const rows = [csvLine(['Title', 'URL', 'Username', 'Password', 'Notes', 'OTPAuth'])];
  for (const r of logins(records)) rows.push(csvLine([r.name, r.url, r.username, r.password, notesFor(r), r.otp]));
  return rows.join(CRLF) + CRLF;
}

/* ------------------------------------------------------------------ Google Password Manager / Chrome */
export const GOOGLE_LIMIT = 3000;
export function googleCsv(records) {
  const rows = [csvLine(['name', 'url', 'username', 'password', 'note'])];
  for (const r of logins(records)) rows.push(csvLine([r.name, r.url, r.username, r.password, notesFor(r)]));
  return rows.join(CRLF) + CRLF;
}
export function googleCsvParts(records) {
  const all = logins(records);
  if (all.length <= GOOGLE_LIMIT) return [googleCsv(records)];
  const parts = [];
  for (let i = 0; i < all.length; i += GOOGLE_LIMIT) parts.push(googleCsv(all.slice(i, i + GOOGLE_LIMIT)));
  return parts;
}

/* ------------------------------------------------------------------ Bitwarden JSON (Pro) */
// Bitwarden's export format (libs/common/src/models/export/*.export.ts): item types 1 login, 2 secure note, 3 card, 4 identity; custom
// field types 0 text, 1 hidden. Ids are made up here; Bitwarden gives every item a new one on import.
function uuid(i, salt) {
  const h = (i * 2654435761 + salt * 40503) >>> 0;
  const hex = (h.toString(16) + '00000000').slice(0, 8);
  return `${hex}-0000-4000-8000-${String(i).padStart(12, '0')}`;
}
export const FOLDER_NAME = 'Samsung Pass';
export function bitwardenJson(records) {
  const folderId = uuid(1, 7);
  const items = records.map((r, i) => {
    const fields = r.fields.filter(f => !f.used && String(f.value).trim() !== '').map(f => ({ name: f.label, value: String(f.value), type: f.secret ? 1 : 0, linkedId: null }));
    const base = { id: uuid(i + 1, 3), organizationId: null, folderId, type: 2, reprompt: 0, name: r.name, notes: r.note || null, favorite: false, fields, collectionIds: null };
    if (r.kind === 'login') {
      const uris = [];
      if (r.url) uris.push({ match: null, uri: r.url });
      if (r.app) uris.push({ match: null, uri: `androidapp://${r.app.pkg}` });
      return { ...base, type: 1, login: { uris, username: r.username || null, password: r.password || null, totp: r.otp || null, fido2Credentials: [] } };
    }
    if (r.kind === 'card') {
      const c = r.card;
      const note = c.locked ? `Samsung Pass kept this card number in a form Decant cannot read${c.last4 ? ` (it ends in ${c.last4})` : ''}.` : '';
      return { ...base, type: 3, notes: [r.note, note].filter(Boolean).join('\n\n') || null, card: { cardholderName: c.holder || null, brand: c.brand || null, number: c.number || null, expMonth: c.expMonth ? String(Number(c.expMonth)) : null, expYear: c.expYear || null, code: c.code || null } };
    }
    if (r.kind === 'address') {
      const a = r.address;
      return { ...base, type: 4, identity: { title: null, firstName: a.first || null, middleName: null, lastName: a.last || null, address1: a.street || null, address2: null, address3: null, city: a.city || null, state: a.state || null, postalCode: a.postal || null, country: a.country || null, company: a.company || null, email: a.email || null, phone: a.phone || null, ssn: null, username: null, passportNumber: null, licenseNumber: null } };
    }
    return { ...base, type: 2, secureNote: { type: 0 } };
  });
  return JSON.stringify({ encrypted: false, folders: [{ id: folderId, name: FOLDER_NAME }], items }, null, 2);
}

/* ------------------------------------------------------------------ change list CSV (Pro; no passwords) */
export function checklistCsv(records, done = new Set(), keys = new Map()) {
  const names = Object.fromEntries(GROUPS.map(g => [g.id, g.name]));
  const rows = [csvLine(['Order', 'Group', 'Name', 'Website', 'Username', 'Same password on', 'Two-factor to re-enrol', 'Change page', 'Changed'])];
  checklist(records).forEach((c, i) => {
    const k = keys.get(c.rec.n);
    rows.push(csvLine([i + 1, names[c.group], c.rec.name, c.rec.host, c.rec.username, c.reused ? `${c.reused} logins` : '', c.twofa ? 'yes' : '', changeUrl(c.rec), k && done.has(k) ? 'yes' : '']));
  });
  return rows.join(CRLF) + CRLF;
}

/* ------------------------------------------------------------------ record sheet (Pro) */
export function recordSheet(records, { title = 'Samsung Pass records', made = new Date() } = {}) {
  const others = records.filter(r => r.kind !== 'login');
  const block = r => {
    const rows = [];
    if (r.kind === 'card' && r.card) {
      const c = r.card;
      if (c.holder) rows.push(['Name on card', c.holder]);
      if (c.number) rows.push(['Card number', c.number]);
      else if (c.last4) rows.push(['Card number', `not readable (ends in ${c.last4})`]);
      if (c.expMonth || c.expYear) rows.push(['Expires', `${c.expMonth}/${c.expYear}`]);
      if (c.code) rows.push(['Security code', c.code]);
    }
    if (r.kind === 'address' && r.address) {
      const a = r.address;
      for (const [k, v] of [['Name', a.fullName], ['Company', a.company], ['Street', a.street], ['City', a.city], ['State', a.state], ['Postal code', a.postal], ['Country', a.country], ['Phone', a.phone], ['E-mail', a.email]]) if (v) rows.push([k, v]);
    }
    for (const f of r.fields) if (!f.used && String(f.value).trim() !== '') rows.push([f.label, f.value]);
    return `<section class="rec"><h2>${esc(r.name)}</h2><p class="type">${esc(r.type)}</p>
${rows.length ? `<table>${rows.map(([k, v]) => `<tr><th scope="row">${esc(k)}</th><td>${esc(v).replace(/\n/g, '<br>')}</td></tr>`).join('')}</table>` : ''}
${r.note ? `<p class="note">${esc(r.note).replace(/\n/g, '<br>')}</p>` : ''}</section>`;
  };
  const when = made.toISOString().slice(0, 10);
  return `<!doctype html>
<html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1">
<meta http-equiv="Content-Security-Policy" content="default-src 'none'; style-src 'unsafe-inline'">
<title>${esc(title)} (${when})</title>
<style>
body { font: 15px/1.5 system-ui, -apple-system, "Segoe UI", sans-serif; color: #14231c; margin: 32px auto; max-width: 760px; padding: 0 20px; }
h1 { font-size: 24px; margin: 0 0 4px; } .lead { color: #5a6660; margin: 0 0 24px; }
.rec { border: 1px solid #d3d9d5; border-radius: 10px; padding: 14px 16px; margin: 0 0 14px; break-inside: avoid; }
.rec h2 { font-size: 17px; margin: 0; } .type { color: #5a6660; margin: 2px 0 8px; font-size: 13px; }
table { border-collapse: collapse; width: 100%; } th, td { text-align: left; padding: 4px 8px 4px 0; vertical-align: top; border-top: 1px solid #e6ebe8; }
th { width: 34%; font-weight: 600; } td { font-variant-numeric: tabular-nums; overflow-wrap: anywhere; }
.note { background: #f1f4f2; padding: 8px 10px; border-radius: 8px; overflow-wrap: anywhere; }
@media print { body { margin: 0; } .rec { border-color: #999; } }
</style></head><body>
<h1>${esc(title)}</h1>
<p class="lead">${others.length} records that are not logins, from a Samsung Pass export, written by Decant on ${when}. This page holds secrets in plain text: print it or save it as a PDF, keep it somewhere safe, then delete this file.</p>
${others.map(block).join('\n')}
</body></html>
`;
}

/* ------------------------------------------------------------------ the read-me that goes with the files */
export function readme(records, made = new Date()) {
  const n = logins(records).length;
  return [
    'Decant: files made from a Samsung Pass export',
    `Made ${made.toISOString().slice(0, 10)} at https://peakappsstudio.com/spass-to-csv/ (in your browser; nothing was uploaded).`,
    '',
    `apple-passwords.csv   ${n} logins for Apple Passwords. Mac: Passwords > File > Import Passwords from File.`,
    `google-passwords.csv  ${n} logins for Google Password Manager (Chrome > Passwords and autofill > Google Password Manager > Settings > Import), and for Bitwarden, 1Password and Proton Pass (import as Chrome).`,
    `bitwarden.json        every record for Bitwarden (Tools > Import data > Bitwarden (json)) or KeePassXC (Database > Import > Bitwarden).`,
    'change-list.csv       the logins in the order to change them. No passwords in it.',
    'records.html          cards, addresses and notes on printable pages.',
    '',
    'Every file except change-list.csv holds your passwords in plain text. Delete them, and the .spass file once the import has',
    'worked, then empty the trash.',
    '',
  ].join(CRLF);
}
