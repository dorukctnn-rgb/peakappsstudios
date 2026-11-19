// Rekey, ESET source: the files that only an ESET export needs. The Apple Passwords, Google and change-list files come from the
// engine as it is (../../msecure-export/js/export.js: appleCsv, googleCsvParts, checklistCsv); this file adds what that engine
// cannot say for ESET's four kinds of record:
//   Bitwarden JSON  logins, secure notes, cards AND identities (Bitwarden item type 4), with every extra field kept by name
//   record sheet    the records that are not logins (identities, cards, notes), on printable pages
//   routes          where each kind of record goes, in words, for the result panel
// All of it is made in the page from the records eset.js read; none of it is sent anywhere.

const esc = s => String(s == null ? '' : s).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
const blank = v => (v == null || String(v).trim() === '' ? null : String(v));

/* ------------------------------------------------------------------ Bitwarden JSON (Pro) */
// Bitwarden's export format (libs/common/src/models/export/*.export.ts): item types 1 login, 2 secure note, 3 card, 4 identity;
// custom field types 0 text, 1 hidden. Ids are made up here; Bitwarden gives every item a new one on import. The identity's own
// "title" is a salutation (Mr, Ms), not a name, so ESET's title becomes the item name and the salutation stays empty.
function uuid(i) {
  const h = (i * 2654435761 + 3 * 40503) >>> 0;
  const hex = (h.toString(16) + '00000000').slice(0, 8);
  return `${hex}-0000-4000-8000-${String(i).padStart(12, '0')}`;
}
export function bitwardenJson(records) {
  const items = records.map((r, i) => {
    // a login saved from a phone app has an app link (androidapp://...) where the website would be: Bitwarden takes that as a URI
    const appLink = r.kind === 'login' && !r.url ? r.fields.find(f => f.label === 'Website' && /^[a-z][a-z0-9+.-]*:\/\//i.test(f.value)) : null;
    const fields = r.fields.filter(f => !f.used && f !== appLink && String(f.value).trim() !== '').map(f => ({ name: f.label, value: String(f.value), type: f.secret ? 1 : 0, linkedId: null }));
    const base = { id: uuid(i + 1), organizationId: null, folderId: null, type: 2, reprompt: 0, name: r.name, notes: blank(r.note), favorite: !!r.favorite, fields, collectionIds: null };
    if (r.kind === 'login') {
      const uris = r.url ? [{ match: null, uri: r.url }] : appLink ? [{ match: null, uri: appLink.value.trim() }] : [];
      return { ...base, type: 1, login: { uris, username: blank(r.username), password: blank(r.password), totp: blank(r.otp), fido2Credentials: [] } };
    }
    if (r.kind === 'card' && r.card) {
      const c = r.card;
      return { ...base, type: 3, card: { cardholderName: blank(c.holder), brand: blank(c.brand), number: blank(c.number), expMonth: blank(c.expMonth), expYear: blank(c.expYear), code: blank(c.code) } };
    }
    if (r.kind === 'identity' && r.identity) {
      const d = r.identity;
      return { ...base, type: 4, identity: { title: null, firstName: blank(d.firstName), middleName: null, lastName: blank(d.lastName), address1: blank(d.street), address2: blank(d.street2), address3: null, city: blank(d.city), state: blank(d.region), postalCode: blank(d.zip), country: blank(d.country), company: blank(d.company), email: blank(d.email), phone: blank(d.phone), ssn: null, username: null, passportNumber: null, licenseNumber: null } };
    }
    // notes, and rows of a type ESET's help does not list: a secure note that keeps each field by its name
    return { ...base, type: 2, secureNote: { type: 0 }, name: r.kind === 'note' ? r.name : `${r.type}: ${r.name}` };
  });
  return JSON.stringify({ encrypted: false, folders: [], items }, null, 2);
}

/* ------------------------------------------------------------------ record sheet (Pro) */
export function recordSheet(records, { title = 'ESET Password Manager records', made = new Date() } = {}) {
  const others = records.filter(r => r.kind !== 'login');
  const block = r => {
    const rows = [];
    if (r.kind === 'card' && r.card) {
      const c = r.card;
      if (c.holder) rows.push(['Name on card', c.holder]);
      if (c.number) rows.push(['Card number', c.number]);
      if (c.expMonth || c.expYear) rows.push(['Expires', `${c.expMonth}/${c.expYear}`]);
      if (c.code) rows.push(['Security code', c.code]);
      if (c.brand) rows.push(['Card type', c.brand]);
    }
    if (r.kind === 'identity' && r.identity) {
      const d = r.identity;
      const lines = [['Name', [d.firstName, d.lastName].filter(Boolean).join(' ')], ['Company', d.company], ['Street', d.street], ['Street, line 2', d.street2], ['City', d.city], ['County', d.county], ['State or region', d.region], ['Postal code', d.zip], ['Country', d.country], ['E-mail', d.email], ['Phone', d.phone]];
      for (const [k, v] of lines) if (v) rows.push([k, v]);
    }
    for (const f of r.fields) if (!f.used && String(f.value).trim() !== '' && !(r.kind === 'identity' && f.label === 'County')) rows.push([f.label, f.value]);
    return `<section class="rec"><h2>${esc(r.name)}</h2><p class="type">${esc(r.type)}${r.favorite ? ' (favorite)' : ''}</p>
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
<p class="lead">${others.length} records that are not logins (identities, cards and notes), from an ESET Password Manager CSV export, written by Rekey on ${when}. This page holds secrets in plain text: print it or save it as a PDF, keep it somewhere safe, then delete this file.</p>
${others.map(block).join('\n')}
</body></html>
`;
}

/* ------------------------------------------------------------------ where each kind of record goes */
// One line per file: what is in it, and what is not. The result panel shows these lines and the e2e test reads them back, so the
// wording on the page is the contents of the files, counted from the same records.
export function routes(records, googleLimit = 3000) {
  const n = k => records.filter(r => r.kind === k).length;
  const login = n('login'), card = n('card'), identity = n('identity'), note = n('note'), other = n('other');
  const rest = card + identity + note + other;
  const withOtp = records.filter(r => r.kind === 'login' && r.otp).length;
  return {
    counts: { login, card, identity, note, other, rest, withOtp },
    apple: { file: 'Apple Passwords file', takes: login, left: rest, pro: false },
    google: { file: 'Google and Chrome file (also for 1Password)', takes: login, left: rest, pro: false, parts: Math.max(1, Math.ceil(login / googleLimit)) },
    bitwarden: { file: 'Bitwarden and KeePassXC file', takes: records.length, left: 0, pro: true },
    sheet: { file: 'Record sheet', takes: rest, left: 0, pro: true },
  };
}
