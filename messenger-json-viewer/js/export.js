/* What Readback saves. Free: one chat as plain text (and printing it). Pro: every chat at once, as an archive of offline
 * pages with the photos, videos and voice messages beside them, one spreadsheet of every message, and every chat as text.
 * The archive copies each attachment's bytes straight out of the download, so it costs little memory. */
import { messagesHtml, staticMedia, esc, fmtDate, SAVED_CSS, mediaLabel } from './render.js';
import { PLATFORM_LABEL, callLine, folderLabel } from './parse.js';
import { writeZip } from './zip.js';

const pad = n => String(n).padStart(2, '0');
const localDate = ts => { const d = new Date(ts); return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`; };
const localTime = ts => { const d = new Date(ts); return `${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())}`; };

export function safeName(s, max = 60) {
  const n = String(s || '').normalize('NFKD').replace(/[̀-ͯ]/g, '').replace(/[^A-Za-z0-9 ._-]+/g, ' ').replace(/\s+/g, ' ').trim().slice(0, max).trim();
  return n || 'chat';
}
const slugOf = s => safeName(s).toLowerCase().replace(/[ .]+/g, '-').replace(/-+/g, '-').replace(/^-|-$/g, '') || 'chat';

function messageLine(m) {
  const who = m.sender || 'Unknown';
  const bits = [];
  if (m.kind === 'call') bits.push(callLine(m));
  else if (m.unsent && !m.text && !m.media.length) bits.push('(unsent message)');
  else if (m.text) bits.push(m.text);
  for (const x of m.media) bits.push(`[${mediaLabel(x.type)}: ${x.name}]`);
  if (m.share) bits.push(`[Link: ${m.share.link || ''}${m.share.text ? ' ' + m.share.text : ''}]`.replace(/ \]$/, ']'));
  if (m.reactions.length) bits.push(`(reactions: ${m.reactions.map(r => `${r.r} ${r.actor}`.trim()).join(', ')})`);
  const when = m.ts ? `${localDate(m.ts)} ${localTime(m.ts).slice(0, 5)}` : 'undated';
  return m.kind === 'system' ? `[${when}] ${bits.join(' ') || 'Chat update'}` : `[${when}] ${who}: ${bits.join(' ')}`;
}

export function chatHeader(chat) {
  const span = chat.first ? `${localDate(chat.first)} to ${localDate(chat.last)}` : 'no dates';
  const tags = [PLATFORM_LABEL[chat.platform] || 'Chat', ...chat.folders.filter(f => !['inbox', 'encrypted', 'e2ee_cutover'].includes(f)).map(folderLabel)];
  if (chat.encrypted) tags.push('includes the encrypted chats download');
  return [chat.title, `${tags.join(', ')}. ${chat.messages.length} messages, ${span}.`, `People: ${chat.participants.join(', ') || 'unknown'}`];
}

export function chatText(chat) {
  return [...chatHeader(chat), '', ...chat.messages.map(messageLine), ''].join('\r\n');
}

const csvCell = v => { const s = String(v ?? ''); return /[",\r\n]/.test(s) || /^[=+\-@\t]/.test(s) ? `"${(/^[=+\-@\t]/.test(s) ? "'" : '') + s.replace(/"/g, '""')}"` : s; };
export function csvAll(chats) {
  const rows = [['chat', 'platform', 'date', 'time', 'utc', 'sender', 'message', 'attachments', 'link', 'reactions', 'kind', 'source']];
  for (const c of chats) for (const m of c.messages) {
    rows.push([
      c.title, PLATFORM_LABEL[c.platform] || '', m.ts ? localDate(m.ts) : '', m.ts ? localTime(m.ts) : '', m.ts ? new Date(m.ts).toISOString() : '',
      m.sender, m.kind === 'call' ? callLine(m) : m.unsent && !m.text ? '(unsent message)' : m.text,
      m.media.map(x => `${mediaLabel(x.type)}: ${x.name}`).join('; '), m.share ? m.share.link : '', m.reactions.map(r => `${r.r} ${r.actor}`.trim()).join('; '),
      m.kind, m.src === 'e2ee' ? 'encrypted chats download' : 'Download your information',
    ]);
  }
  return '﻿' + rows.map(r => r.map(csvCell).join(',')).join('\r\n') + '\r\n';
}

function pageShell(title, body, css = SAVED_CSS) {
  return `<!doctype html>\n<html lang="en">\n<head>\n<meta charset="utf-8">\n<meta name="viewport" content="width=device-width, initial-scale=1">\n<meta name="robots" content="noindex">\n<title>${esc(title)}</title>\n<style>${css}</style>\n</head>\n<body>\n<main>\n${body}\n</main>\n</body>\n</html>\n`;
}

/* One chat as a page that opens offline. mediaPath(x, i, j) gives the attachment's path relative to the page, or null. */
export function chatPage(chat, { owner, locale, mediaPath, back = '' }) {
  const [title, line, people] = chatHeader(chat);
  const body = `${back ? `<p class="rb-sub"><a href="${esc(back)}">All chats</a></p>\n` : ''}<h1>${esc(title)}</h1>\n<p class="rb-sub">${esc(line)}<br>${esc(people)}</p>\n`
    + messagesHtml(chat, 0, chat.messages.length, { owner, locale, media: (x, i, j) => staticMedia(x, mediaPath(x, i, j)) })
    + `\n<p class="rb-sub" style="margin-top:28px">Saved with Readback (peakappsstudio.com/messenger-json-viewer) from your own download. Nothing was uploaded.</p>`;
  return pageShell(title, body);
}

const INDEX_CSS = SAVED_CSS + `
.rb-list{list-style:none;padding:0;margin:18px 0 0}.rb-list li{border-top:1px solid var(--line);padding:12px 0}
.rb-list a{font-weight:700;font-size:18px;text-decoration:none}.rb-list span{display:block;color:var(--muted);font-size:14px}
#q{width:100%;font:inherit;padding:10px 12px;border:1px solid var(--line);border-radius:10px}`;

/* Every chat at once. Returns a Blob (a ZIP). progress(done, total) is called as chats are written. */
export async function archiveZip(result, { owner, locale, progress, date = new Date() } = {}) {
  const items = [];
  const used = new Set();
  const unique = (s) => { let n = s, k = 2; while (used.has(n)) n = `${s}-${k++}`; used.add(n); return n; };
  const list = [];
  let done = 0;
  for (const chat of result.chats) {
    const slug = unique(slugOf(chat.title));
    const names = new Set();
    const placed = new Map();
    for (const m of chat.messages) for (const x of m.media) {
      if (!x.rec || placed.has(x.rec)) continue;
      let n = safeName(x.name, 80).replace(/ /g, '_'); const dot = n.lastIndexOf('.');
      let k = 2; const stem = dot > 0 ? n.slice(0, dot) : n, ext = dot > 0 ? n.slice(dot) : '';
      while (names.has(n.toLowerCase())) n = `${stem}-${k++}${ext}`;
      names.add(n.toLowerCase());
      const path = `media/${slug}/${n}`;
      placed.set(x.rec, path);
      items.push(x.rec.entry ? { name: path, entry: x.rec.entry } : { name: path, data: x.rec.file });
    }
    const html = chatPage(chat, { owner, locale, back: '../index.html', mediaPath: (x) => (x.rec && placed.has(x.rec) ? `../${placed.get(x.rec)}` : null) });
    items.push({ name: `chats/${slug}.html`, data: html });
    items.push({ name: `text/${slug}.txt`, data: chatText(chat) });
    list.push({ chat, slug });
    done++;
    if (progress) progress(done, result.chats.length);
    if (done % 20 === 0) await new Promise(r => setTimeout(r, 0));
  }
  const idx = `<h1>Your chats</h1>\n<p class="rb-sub">${result.chats.length} chats, ${result.messageCount} messages. Saved with Readback from your own download on ${esc(fmtDate(date.getTime(), locale))}. Open a chat to read it; every page works offline, and the browser can print any of them to PDF.</p>\n<label for="q" class="rb-sub">Find a chat</label>\n<input id="q" type="search" placeholder="Name">\n<ul class="rb-list" id="list">\n`
    + list.map(({ chat, slug }) => `<li><a href="chats/${slug}.html">${esc(chat.title)}</a><span>${esc(PLATFORM_LABEL[chat.platform] || '')}, ${chat.messages.length} messages${chat.first ? `, ${esc(fmtDate(chat.first, locale))} to ${esc(fmtDate(chat.last, locale))}` : ''}</span></li>`).join('\n')
    + `\n</ul>\n<script>document.getElementById('q').addEventListener('input',function(e){var v=e.target.value.toLowerCase();document.querySelectorAll('#list li').forEach(function(li){li.hidden=v&&li.textContent.toLowerCase().indexOf(v)<0;});});</script>`;
  items.unshift({ name: 'messages.csv', data: csvAll(result.chats) });
  items.unshift({ name: 'index.html', data: pageShell('Your chats', idx, INDEX_CSS) });
  items.unshift({ name: 'READ ME.txt', data: 'Open index.html in any browser to read your chats. Every page works without internet.\r\nmessages.csv has every message in one spreadsheet (Excel, Numbers, Google Sheets).\r\nThe text folder has each chat as plain text. The media folder has the photos, videos and voice messages that were in your download.\r\nSaved with Readback, https://peakappsstudio.com/messenger-json-viewer/\r\n' });
  return writeZip(items, { date });
}
