// Rekey: the files it writes. All of them are made in this page from the records parse.js read; none is sent anywhere.
//   Apple Passwords CSV   Title,URL,Username,Password,Notes,OTPAuth (the columns of the Passwords app's own export; Mac:
//                         File > Import Passwords from File)
//   Google / Chrome CSV   name,url,username,password,note (Google Password Manager: the first line names url, username and
//                         password; up to 3,000 rows per import; 1Password's Chrome import reads the same file)
//   Bitwarden JSON        an unencrypted Bitwarden export: folders from mSecure tags, logins with every extra field, cards as
//                         cards, notes and other records as secure notes with named fields (Bitwarden and KeePassXC import it)
//   checklist CSV         the logins in the order to change them, with no password in it
//   record sheet (HTML)   cards, bank accounts, notes and other records on paper-friendly pages
import { csvLine } from './parse.js';
import { checklist, changeUrl, GROUPS } from './rank.js';

const esc = s => String(s == null ? '' : s).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
const CRLF = '\r\n';

// the fields a destination has no column for, written into its notes so nothing is lost
export function extrasText(rec, { withSecrets = true } = {}) {
  const lines = [];
  for (const f of rec.fields) {
    if (f.used || String(f.value).trim() === '') continue;
    if (!withSecrets && f.secret) { lines.push(`${f.label}: (hidden)`); continue; }
    lines.push(`${f.label}: ${f.value}`);
  }
  return lines;
}
function notesFor(rec, opts) {
  const parts = [];
  if (rec.note) parts.push(rec.note);
  const ex = extrasText(rec, opts);
  if (ex.length) parts.push(ex.join('\n'));
  if (rec.tags.length) parts.push(`mSecure tags: ${rec.tags.join(', ')}`);
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
// Google takes 3,000 passwords per file: the CSV split into files of that size
export function googleCsvParts(records) {
  const all = logins(records);
  if (all.length <= GOOGLE_LIMIT) return [googleCsv(records)];
  const parts = [];
  for (let i = 0; i < all.length; i += GOOGLE_LIMIT) parts.push(googleCsv(all.slice(i, i + GOOGLE_LIMIT)));
  return parts;
}

/* ------------------------------------------------------------------ Bitwarden JSON (Pro) */
// Bitwarden's export format (libs/common/src/models/export/*.export.ts): item types 1 login, 2 secure note, 3 card; custom
// field types 0 text, 1 hidden. Ids are made up here; Bitwarden gives every item a new one on import.
function uuid(i, salt) {
  const h = (i * 2654435761 + salt * 40503) >>> 0;
  const hex = (h.toString(16) + '00000000').slice(0, 8);
  return `${hex}-0000-4000-8000-${String(i).padStart(12, '0')}`;
}
export function bitwardenJson(records) {
  const folderNames = [...new Set(records.map(r => r.tags[0]).filter(Boolean))].sort((a, b) => a.localeCompare(b));
  const folderId = Object.fromEntries(folderNames.map((n, i) => [n, uuid(i + 1, 7)]));
  const items = records.map((r, i) => {
    const fields = r.fields.filter(f => !f.used && String(f.value).trim() !== '').map(f => ({ name: f.label, value: String(f.value), type: f.secret ? 1 : 0, linkedId: null }));
    const tagsLine = r.tags.length > 1 ? `mSecure tags: ${r.tags.join(', ')}` : '';
    const notes = [r.note, tagsLine].filter(Boolean).join('\n\n') || null;
    const base = { id: uuid(i + 1, 3), organizationId: null, folderId: r.tags[0] ? folderId[r.tags[0]] : null, type: 2, reprompt: 0, name: r.name, notes, favorite: false, fields, collectionIds: null };
    if (r.kind === 'login') {
      return { ...base, type: 1, login: { uris: r.url ? [{ match: null, uri: r.url }] : [], username: r.username || null, password: r.password || null, totp: r.otp || null, fido2Credentials: [] } };
    }
    if (r.kind === 'card' && r.card) {
      return { ...base, type: 3, card: { cardholderName: r.card.holder || null, brand: r.card.brand || null, number: r.card.number || null, expMonth: r.card.expMonth || null, expYear: r.card.expYear || null, code: r.card.code || null } };
    }
    // notes, bank accounts, identities and the rest: a secure note that keeps each field by its name
    return { ...base, type: 2, secureNote: { type: 0 }, name: r.kind === 'note' ? r.name : `${r.type}: ${r.name}` };
  });
  return JSON.stringify({ encrypted: false, folders: folderNames.map(n => ({ id: folderId[n], name: n })), items }, null, 2);
}

/* ------------------------------------------------------------------ checklist CSV (Pro; no passwords) */
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
export function recordSheet(records, { title = 'mSecure records', made = new Date() } = {}) {
  const others = records.filter(r => r.kind !== 'login');
  const block = r => {
    const rows = [];
    if (r.kind === 'card' && r.card) {
      if (r.card.holder) rows.push(['Name on card', r.card.holder]);
      if (r.card.number) rows.push(['Card number', r.card.number]);
      if (r.card.expMonth || r.card.expYear) rows.push(['Expires', `${r.card.expMonth}/${r.card.expYear}`]);
      if (r.card.code) rows.push(['Security code', r.card.code]);
      if (r.card.brand) rows.push(['Bank', r.card.brand]);
    }
    for (const f of r.fields) if (!f.used && String(f.value).trim() !== '') rows.push([f.label, f.value]);
    return `<section class="rec"><h2>${esc(r.name)}</h2><p class="type">${esc(r.type)}${r.tags.length ? ` (tags: ${esc(r.tags.join(', '))})` : ''}</p>
${rows.length ? `<table>${rows.map(([k, v]) => `<tr><th scope="row">${esc(k)}</th><td>${esc(v).replace(/\n/g, '<br>')}</td></tr>`).join('')}</table>` : ''}
${r.note ? `<p class="note">${esc(r.note).replace(/\n/g, '<br>')}</p>` : ''}</section>`;
  };
  const when = made.toISOString().slice(0, 10);
  return `<!doctype html>
<html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1">
<meta http-equiv="Content-Security-Policy" content="default-src 'none'; style-src 'unsafe-inline'">
<title>${esc(title)} (${when})</title>
<style>
body { font: 15px/1.5 system-ui, -apple-system, "Segoe UI", sans-serif; color: #1c1718; margin: 32px auto; max-width: 760px; padding: 0 20px; }
h1 { font-size: 24px; margin: 0 0 4px; } .lead { color: #5d5552; margin: 0 0 24px; }
.rec { border: 1px solid #d8d3cf; border-radius: 10px; padding: 14px 16px; margin: 0 0 14px; break-inside: avoid; }
.rec h2 { font-size: 17px; margin: 0; } .type { color: #5d5552; margin: 2px 0 8px; font-size: 13px; }
table { border-collapse: collapse; width: 100%; } th, td { text-align: left; padding: 4px 8px 4px 0; vertical-align: top; border-top: 1px solid #eee9e5; }
th { width: 34%; font-weight: 600; } td { font-variant-numeric: tabular-nums; overflow-wrap: anywhere; }
.note { white-space: normal; background: #f6f4f2; padding: 8px 10px; border-radius: 8px; overflow-wrap: anywhere; }
@media print { body { margin: 0; } .rec { border-color: #999; } }
</style></head><body>
<h1>${esc(title)}</h1>
<p class="lead">${others.length} records that are not logins, from an mSecure export, written by Rekey on ${when}. This page holds secrets in plain text: print it or save it as a PDF, keep it somewhere safe, then delete this file.</p>
${others.map(block).join('\n')}
</body></html>
`;
}

/* ------------------------------------------------------------------ the read-me that goes with the files */
export function readme(records, made = new Date()) {
  const n = logins(records).length;
  return [
    'Rekey: files made from an mSecure CSV export',
    `Made ${made.toISOString().slice(0, 10)} at https://peakappsstudio.com/msecure-export/ (in your browser; nothing was uploaded).`,
    '',
    `apple-passwords.csv   ${n} logins for Apple Passwords. Mac: Passwords > File > Import Passwords from File.`,
    `google-passwords.csv  ${n} logins for Google Password Manager (Chrome > Passwords and autofill > Google Password Manager > Settings > Import) and for 1Password (File > Import > Chrome).`,
    `bitwarden.json        every record for Bitwarden (Tools > Import data > Bitwarden (json)) or KeePassXC (Database > Import > Bitwarden).`,
    'change-checklist.csv  the logins in the order to change them. No passwords in it.',
    'records.html          cards, bank accounts and notes on printable pages.',
    '',
    'Every file except change-checklist.csv holds your passwords in plain text. Delete them, and the mSecure CSV, once the import',
    'has worked, then empty the trash.',
    '',
  ].join(CRLF);
}
