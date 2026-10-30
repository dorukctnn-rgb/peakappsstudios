/* What Agelens saves. Free: one conversation as text, and the age report as text. Pro: one ZIP with every conversation
 * as a page that opens offline and as text, all messages in one spreadsheet (CSV) and the age report. Everything is built in
 * this tab; nothing is sent. */
import { writeZip } from './zip.js';
import { toCsv } from './csv.js';
import { verdict, topOf, safeUrl } from './parse.js';

export const esc = s => String(s ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&#39;');
export const isoDay = ms => (ms == null ? '' : new Date(ms).toISOString().slice(0, 10));
export const isoTime = ms => (ms == null ? '' : new Date(ms).toISOString().replace('T', ' ').slice(0, 16) + ' UTC');
const pct = p => `${Math.round(p * 1000) / 10}%`;

const COMBINING = new RegExp('[' + String.fromCharCode(0x300) + '-' + String.fromCharCode(0x36f) + ']', 'g');
export function safeName(s, max = 60) {
  const t = String(s ?? '').normalize('NFKD').replace(COMBINING, '').replace(/[^A-Za-z0-9._ -]+/g, '').trim().replace(/\s+/g, '-').replace(/-+/g, '-');
  return (t || 'discord').slice(0, max).replace(/[-.]+$/, '') || 'discord';
}
export const KIND_LABEL = { dm: 'Direct message', group: 'Group message', server: 'Server channel', other: 'Channel' };
export function convLabel(c) {
  if (c.kind === 'server') return `${c.title}${c.server ? ` in ${c.server}` : ''}`;
  return c.title;
}
export function accountName(model) {
  const a = model.account;
  if (!a) return '';
  return a.username ? `${a.username}${a.discriminator ? `#${a.discriminator}` : ''}` : a.globalName || '';
}

/* ------------------------------------------------------------------ free */
export function conversationText(c, { account = '' } = {}) {
  const lines = [convLabel(c), KIND_LABEL[c.kind] || 'Channel'];
  if (c.people && c.people.length && c.kind !== 'server') lines.push(`With: ${c.people.join(', ')}`);
  if (account) lines.push(`Account: ${account}`);
  lines.push('Saved with Agelens (peakappsstudio.com/discord-data-package-viewer/) from a Discord data package.',
    'A data package holds only the messages you sent. Times in UTC.', '');
  for (const m of c.items) {
    lines.push(`[${isoTime(m.ts)}]`);
    if (m.text) lines.push(String(m.text).replace(/\r\n/g, '\n'));
    for (const a of m.att) lines.push(`Attachment: ${a}`);
    lines.push('');
  }
  return lines.join('\n');
}

/* The age signals as plain text, with what each one means. scan: the result of scanEvents, or null. */
export function ageReportText(model, scan = null) {
  const s = model.age;
  const v = verdict(s);
  const L = ['Your Discord age signals', `Account: ${accountName(model) || 'not in the files chosen'}`,
    'Read with Agelens (peakappsstudio.com/discord-data-package-viewer/) from a Discord data package.', ''];
  if (!model.user) {
    L.push('This package has no Account folder (user.json), which is where Discord writes the age signals.',
      'Request the package again and tick Account. In the Discord app: User Settings > Data & Privacy > Request Data.');
    return L.join('\n');
  }
  L.push(`Age group the signals point to: ${v ? `${v.label}, from ${v.from}` : 'none written in this package'}`, '');
  if (s.dob) {
    L.push(`date_of_birth: ${s.dob.raw}`);
    L.push(s.dob.kind === 'adult-hidden' ? '  The birthday you gave says 18 or older. Discord hides an adult\'s birthday as 01-01-0001.'
      : s.dob.kind === 'month' ? `  The birthday you gave, cut to the month: ${String(s.dob.month).padStart(2, '0')}/${s.dob.year} (about ${s.dob.age} now).`
        : '  Written in a form Agelens does not know; shown as it is.');
  }
  if (s.inferred) L.push(`inferred_age_group: ${s.inferred.raw}`, `  The group Discord's age estimation model put the account in: ${s.inferred.label}.`);
  if (s.estimated) L.push(`estimated_age_group: ${s.estimated.raw}`, `  The outcome of an age check you did (or the latest one): ${s.estimated.label}.`);
  if (s.predicted) {
    L.push(`predicted_age: ${s.predicted.value ?? '(probabilities only)'}`, '  A separate model Discord uses for features. Discord says it does not decide your age group.');
    if (s.predicted.probs) for (const p of s.predicted.probs) L.push(`    ${p.label}: ${pct(p.p)}`);
  }
  if (s.gender) {
    L.push(`predicted_gender: ${s.gender.value ?? '(probabilities only)'}`);
    if (s.gender.probs) for (const p of s.gender.probs) L.push(`    ${p.label}: ${pct(p.p)}`);
  }
  if (s.attempts.length) {
    L.push('', 'Age checks (age_assurance):');
    for (const a of s.attempts) L.push(`  ${a.when ? isoTime(a.when) : 'date not given'}: ${a.method || 'method not given'}${a.vendor ? `, by ${a.vendor}` : ''}${a.group ? `, result ${a.group.label}` : ''}${a.regionalAdult === true ? ', adult where you live' : a.regionalAdult === false ? ', not an adult where you live' : ''}`);
  }
  if (s.other.length) {
    L.push('', 'Other age-related fields:');
    for (const o of s.other) L.push(`  ${o.path}: ${typeof o.value === 'object' ? JSON.stringify(o.value) : String(o.value)}`);
  }
  if (scan && (scan.age.length || scan.gender.length)) {
    L.push('', `Guesses in the activity files (${scan.age.length} for age, ${scan.gender.length} for gender):`);
    for (const e of scan.age) { const t = topOf(e.probs); L.push(`  ${isoDay(e.day) || 'no date'} age: ${e.value ?? (t ? t.label : '')}${e.probs ? ` (${e.probs.map(p => `${p.label} ${pct(p.p)}`).join(', ')})` : ''}`); }
    for (const e of scan.gender) { const t = topOf(e.probs); L.push(`  ${isoDay(e.day) || 'no date'} gender: ${e.value ?? (t ? t.label : '')}${e.probs ? ` (${e.probs.map(p => `${p.label} ${pct(p.p)}`).join(', ')})` : ''}`); }
  }
  L.push('', 'To check or change your age group: Discord > User Settings > Account Status.',
    'More: peakappsstudio.com/discord-data-package-viewer/age-group-wrong/');
  return L.join('\n');
}

/* ------------------------------------------------------------------ Pro */
export function messagesCsv(model) {
  const rows = [];
  for (const c of model.convs) for (const m of c.items) rows.push([KIND_LABEL[c.kind] || 'Channel', c.server, c.title, isoTime(m.ts), m.text, m.att.join(' '), m.id, c.id]);
  return toCsv(['Kind', 'Server', 'Conversation', 'Time (UTC)', 'Message', 'Attachments', 'Message ID', 'Channel ID'], rows);
}

const PAGE_CSS = 'body{font:17px/1.55 system-ui,-apple-system,"Segoe UI",sans-serif;max-width:860px;margin:0 auto;padding:24px 16px;color:#1d1b2e;background:#f6f4fb}h1{font-size:26px;line-height:1.2;margin:0 0 6px}p.meta{color:#5d5873;margin:0 0 18px}.m{background:#fff;border:1px solid #dcd7ea;border-left:4px solid #c2410c;border-radius:6px;padding:8px 12px;margin:0 0 8px;overflow-wrap:anywhere}.t{font-size:14px;color:#5d5873}.x{white-space:pre-wrap;margin:2px 0 0}a{color:#9a330a}ul{padding-left:1.2em}li{margin:0 0 4px}@media (prefers-color-scheme:dark){body{background:#15131f;color:#ece9f6}.m{background:#1e1b2c;border-color:#34304a}.t,p.meta{color:#aaa4c2}a{color:#ffb38a}}';
function convPage(c, account) {
  const msgs = c.items.map(m => `<div class="m"><div class="t">${esc(isoTime(m.ts))}</div>${m.text ? `<div class="x">${esc(m.text)}</div>` : ''}${m.att.map(a => { const u = safeUrl(a); return u ? `<div class="t"><a href="${esc(u)}" rel="noopener noreferrer">${esc(u.split('?')[0].split('/').pop() || 'attachment')}</a></div>` : ''; }).join('')}</div>`).join('\n');
  return `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><meta http-equiv="Content-Security-Policy" content="default-src 'none'; style-src 'unsafe-inline'; img-src 'none'"><title>${esc(convLabel(c))}</title><style>${PAGE_CSS}</style></head><body><p class="meta"><a href="../index.html">All conversations</a></p><h1>${esc(convLabel(c))}</h1><p class="meta">${esc(KIND_LABEL[c.kind] || 'Channel')}${c.people.length && c.kind !== 'server' ? `, with ${esc(c.people.join(', '))}` : ''}. ${c.count} messages you sent${account ? ` as ${esc(account)}` : ''}, ${esc(isoDay(c.first))} to ${esc(isoDay(c.last))}. Times in UTC.</p>\n${msgs}\n</body></html>\n`;
}

/* The whole package as one ZIP. Returns { name, blob }. */
export async function archiveZip(model, { date = new Date(), scan = null, onProgress = () => {} } = {}) {
  const account = accountName(model);
  const who = safeName(account || 'discord', 40);
  const items = [];
  const used = new Set();
  const list = [];
  model.convs.forEach((c, i) => {
    let n = `${String(i + 1).padStart(3, '0')}-${safeName(c.kind === 'server' ? `${c.server} ${c.title}` : c.title, 50)}`;
    while (used.has(n)) n += '-2';
    used.add(n);
    items.push({ name: `conversations/${n}.html`, data: convPage(c, account) });
    items.push({ name: `conversations/${n}.txt`, data: conversationText(c, { account }) });
    list.push(`<li><a href="conversations/${esc(n)}.html">${esc(convLabel(c))}</a> <span class="t">${esc(KIND_LABEL[c.kind] || 'Channel')}, ${c.count} messages, last ${esc(isoDay(c.last))}</span></li>`);
    if (i % 50 === 0) onProgress(`${i + 1} of ${model.convs.length} conversations`);
  });
  const age = ageReportText(model, scan);
  items.unshift({ name: 'index.html', data: `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><meta http-equiv="Content-Security-Policy" content="default-src 'none'; style-src 'unsafe-inline'; img-src 'none'"><title>Discord data package of ${esc(account || 'your account')}</title><style>${PAGE_CSS}</style></head><body><h1>Your Discord messages</h1><p class="meta">${esc(account || 'Your account')}: ${model.counts.messages} messages you sent in ${model.convs.length} conversations. Saved with Agelens on ${esc(isoDay(date.getTime()))}. A data package holds only the messages you sent.</p><p><a href="age-report.txt">Your age signals</a> and <a href="all-messages.csv">every message in one spreadsheet</a>.</p><ul>${list.join('\n')}</ul></body></html>\n` });
  onProgress('the spreadsheet');
  items.push({ name: 'all-messages.csv', data: messagesCsv(model) });
  items.push({ name: 'age-report.txt', data: age });
  items.push({ name: 'README.txt', data: `Your Discord data package, saved with Agelens (peakappsstudio.com/discord-data-package-viewer/) on ${isoDay(date.getTime())}.\n\nindex.html        every conversation; open it in a browser, it works offline\nconversations/    one page and one text file per conversation\nall-messages.csv  every message in one spreadsheet (Excel, Numbers, Google Sheets)\nage-report.txt    the age signals in your package and what they mean\n\nAttachments are links to Discord's servers and may stop working; download the ones you want to keep.\n` });
  const blob = await writeZip(items, { date });
  return { name: `agelens-${who}-${isoDay(date.getTime())}.zip`, blob };
}
