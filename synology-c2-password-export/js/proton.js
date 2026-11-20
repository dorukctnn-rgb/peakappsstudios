// Rekey, Proton Pass as a destination for every Rekey source. Two files, both made in the page from the records a reader (c2.js,
// eset.js, parse.js) produced; nothing is sent anywhere.
//
//   protonLoginsCsv   (free)  the logins, in the eight columns of Proton's own import template
//                             (https://pass.proton.me/assets/protonpass-import.csv): name,url,email,username,password,note,totp,vault.
//                             Settings > Import > Generic CSV. Values that Proton has no column for (extra fields, tags, app links)
//                             are written into the note, so nothing is lost.
//   protonFullCsv     (Pro)   the same columns with a `type` column in front, as Proton Pass's own CSV export writes them, so notes,
//                             cards and identities can come in too. The importer is open source (ProtonMail/WebClients,
//                             packages/pass/lib/import/providers/protonpass/protonpass.csv.reader.ts, read 19 Nov 2026): the Generic
//                             CSV and the Proton CSV go through the same reader, which looks at `type`: login (or empty) is a login,
//                             creditCard is a card whose values are a JSON text in the note column, identity is an identity whose
//                             values are a JSON text in the note column, alias is skipped and any other type is a note. Proton's help
//                             page for its Generic CSV does not mention these types and says cards cannot be imported by CSV, so the
//                             file is checked against that code, not against an import into a live account.
import { csvLine } from '../../msecure-export/js/parse.js';

export const PROTON_LOGIN_HEADER = ['name', 'url', 'email', 'username', 'password', 'note', 'totp', 'vault'];
export const PROTON_FULL_HEADER = ['type', ...PROTON_LOGIN_HEADER];
const LF = '\n'; // the reader splits rows on \n and strips \r from values

const EMAIL = /^[^\s@,;:]+@[^\s@,;:]+\.[^\s@,;:]{2,}$/;
// Proton keeps an e-mail address and a username apart: an address goes in `email`, anything else in `username`
export function emailAndUser(username) {
  const u = String(username || '').trim();
  return EMAIL.test(u) ? { email: u, username: '' } : { email: '', username: String(username || '') };
}
// fields without a column, one "Label: value" line each; a field that has its own column is left out
function extraLines(rec, skipRoles = [], skipLabels = []) {
  const out = [];
  for (const f of rec.fields) {
    if (f.used || String(f.value).trim() === '' || skipRoles.includes(f.role) || skipLabels.includes(f.label)) continue;
    out.push(`${f.label}: ${f.value}`);
  }
  return out;
}
const joinNote = (...parts) => parts.filter(p => p && String(p).trim() !== '').join('\n\n');
const urlsOf = rec => (rec.urls && rec.urls.length ? rec.urls : rec.url ? [rec.url] : []).join(', ');

function loginRow(rec, withType) {
  const who = emailAndUser(rec.username);
  const note = joinNote(rec.note, extraLines(rec, ['moreurls']).join('\n'));
  const row = [rec.name, urlsOf(rec), who.email, who.username, rec.password, note, rec.otp || '', ''];
  return withType ? ['login', ...row] : row;
}
const logins = records => records.filter(r => r.kind === 'login');

/* ------------------------------------------------------------------ free: logins */
export function protonLoginsCsv(records) {
  return [csvLine(PROTON_LOGIN_HEADER), ...logins(records).map(r => csvLine(loginRow(r, false)))].join(LF) + LF;
}

/* ------------------------------------------------------------------ Pro: everything */
// the JSON text Proton keeps in the note column of a card row
export function cardNote(rec) {
  const c = rec.card || {};
  const mm = c.expMonth ? String(c.expMonth).padStart(2, '0') : '';
  const note = joinNote(rec.note, extraLines(rec, [], ['PIN']).join('\n'));
  return JSON.stringify({ cardholderName: c.holder || '', cardType: 0, number: c.number || '', verificationNumber: c.code || '', expirationDate: c.expYear && mm ? `${c.expYear}-${mm}` : '', pin: c.pin || '', note });
}
// the JSON text Proton keeps in the note column of an identity row: the full set of keys its own export writes
export function identityNote(rec) {
  const d = rec.identity || {};
  const taken = new Set();
  const take = re => { const f = rec.fields.find(x => !x.used && !taken.has(x) && re.test(x.label) && String(x.value).trim() !== ''); if (f) taken.add(f); return f ? String(f.value) : ''; };
  const county = take(/county|district/i);
  const job = take(/(^|\s)(job|job title|position|role)$/i);
  const site = take(/^(contact )?(url|website|web)$/i);
  const linkedin = take(/linkedin/i);
  const rest = rec.fields.filter(f => !f.used && !taken.has(f) && String(f.value).trim() !== '');
  const section = rest.length ? [{ sectionName: 'Synology C2 Password', sectionFields: rest.map(f => ({ fieldName: f.label, type: f.secret ? 'hidden' : 'text', data: { content: String(f.value) } })) }] : [];
  return JSON.stringify({
    fullName: [d.firstName, d.middleName, d.lastName].filter(Boolean).join(' '), email: d.email || '', phoneNumber: d.phone || '',
    firstName: d.firstName || '', middleName: d.middleName || '', lastName: d.lastName || '', birthdate: '', gender: '', extraPersonalDetails: [],
    organization: d.company || '', streetAddress: [d.street, d.street2].filter(Boolean).join(', '), zipOrPostalCode: d.zip || '', city: d.city || '',
    stateOrProvince: d.region || '', countryOrRegion: d.country || '', floor: '', county, extraAddressDetails: [],
    socialSecurityNumber: d.ssn || '', passportNumber: d.passport || '', licenseNumber: d.license || '', website: site, xHandle: '', secondPhoneNumber: '',
    linkedin, reddit: '', facebook: '', yahoo: '', instagram: '', extraContactDetails: [], company: d.company || '', jobTitle: job, personalWebsite: '',
    workPhoneNumber: '', workEmail: '', extraWorkDetails: [], extraSections: section, note: rec.note || '',
  });
}
export function protonFullCsv(records) {
  const rows = records.map(r => {
    if (r.kind === 'login') return loginRow(r, true);
    if (r.kind === 'card' && r.card) return ['creditCard', r.name, '', '', '', '', cardNote(r), '', ''];
    if (r.kind === 'identity' && r.identity) return ['identity', r.name, '', '', '', '', identityNote(r), '', ''];
    // notes, and rows of a type nobody documented: a note that keeps every field by its name
    const name = r.kind === 'note' && /^(secure )?note$/i.test(r.type) ? r.name : `${r.type}: ${r.name}`;
    return ['note', name, '', '', '', '', joinNote(r.note, extraLines(r).join('\n')), '', ''];
  });
  return [csvLine(PROTON_FULL_HEADER), ...rows.map(csvLine)].join(LF) + LF;
}
