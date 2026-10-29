/* What Threadkeep saves. Free: one conversation as text, the list of communities as text. Pro: every saved post and comment
 * as a bookmarks file (the Netscape format every browser and Raindrop.io import), and one ZIP with the whole export as
 * pages that open offline, Markdown notes and clean spreadsheets. Everything is built in this tab; nothing is sent. */
import { writeZip } from './zip.js';
import { toCsv } from './csv.js';

export const esc = s => String(s ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&#39;');
export const isoDay = ms => (ms == null ? '' : new Date(ms).toISOString().slice(0, 10));
export const isoTime = ms => (ms == null ? '' : new Date(ms).toISOString().replace('T', ' ').slice(0, 16) + ' UTC');

const COMBINING = new RegExp('[' + String.fromCharCode(0x300) + '-' + String.fromCharCode(0x36f) + ']', 'g');
export function safeName(s, max = 60) {
  const t = String(s ?? '').normalize('NFKD').replace(COMBINING, '').replace(/[^A-Za-z0-9._ -]+/g, '').trim().replace(/\s+/g, '-').replace(/-+/g, '-');
  return (t || 'reddit').slice(0, max).replace(/[-.]+$/, '') || 'reddit';
}
export function savedTitle(s) {
  const t = s.title || (s.kind === 'comment' ? 'A comment' : 'A post');
  return s.kind === 'comment' ? `Comment on: ${t}` : t;
}
const sortCommunities = (a, b) => a.localeCompare(b, 'en', { sensitivity: 'base' });
function groupBySub(list) {
  const m = new Map();
  for (const s of list) { const k = s.sub || 'No community'; if (!m.has(k)) m.set(k, []); m.get(k).push(s); }
  return [...m.entries()].sort((a, b) => sortCommunities(a[0], b[0]));
}

/* ------------------------------------------------------------------ free */
export function conversationText(c, { kind = 'messages', account = '' } = {}) {
  const lines = [`${c.title}`, kind === 'messages' ? 'Reddit private messages' : 'Reddit chat'];
  if (c.people && c.people.length) lines.push(`With: ${c.people.join(', ')}`);
  if (account) lines.push(`Account: u/${account}`);
  lines.push(`Saved with Threadkeep (peakappsstudio.com/reddit-data-export-viewer/) from a Reddit data request. Times in UTC.`, '');
  for (const m of c.items) {
    const who = kind === 'messages' ? (m.from || 'unknown') : (m.user || 'unknown');
    lines.push(`[${isoTime(m.date)}] ${who}${kind === 'messages' && m.to ? ` to ${m.to}` : ''}`);
    if (kind === 'messages' && m.subject) lines.push(`Subject: ${m.subject}`);
    lines.push(String(kind === 'messages' ? m.body : m.text).replace(/\r\n/g, '\n'), '');
  }
  return lines.join('\n');
}
export function communitiesText(model) {
  const c = model.communities;
  const out = [`Communities${model.account.name ? ` of u/${model.account.name}` : ''}, from a Reddit data request`, ''];
  out.push(`Joined (${c.joined.length})`, ...c.joined.map(s => `r/${s}`), '');
  if (c.moderated.length) out.push(`Moderated (${c.moderated.length})`, ...c.moderated.map(s => `r/${s}`), '');
  if (c.feeds.length) {
    out.push(`Custom feeds (${c.feeds.length})`);
    for (const f of c.feeds) out.push(`${f.name}: ${f.subs.map(s => `r/${s}`).join(', ')}`);
    out.push('');
  }
  return out.join('\n');
}

/* ------------------------------------------------------------------ Pro: bookmarks */
export function bookmarksHtml(saved, { date = new Date(), folder = 'Reddit saved' } = {}) {
  const t = Math.floor(date.getTime() / 1000);
  const rows = ['<!DOCTYPE NETSCAPE-Bookmark-file-1>', '<!-- This is an automatically generated file.', '     It will be read and overwritten.', '     DO NOT EDIT! -->',
    '<META HTTP-EQUIV="Content-Type" CONTENT="text/html; charset=UTF-8">', '<TITLE>Bookmarks</TITLE>', '<H1>Bookmarks</H1>', '<DL><p>',
    `    <DT><H3 ADD_DATE="${t}" LAST_MODIFIED="${t}">${esc(folder)}</H3>`, '    <DL><p>'];
  for (const [sub, items] of groupBySub(saved.filter(s => s.href))) {
    rows.push(`        <DT><H3 ADD_DATE="${t}" LAST_MODIFIED="${t}">${esc(sub)}</H3>`, '        <DL><p>');
    for (const s of items) rows.push(`            <DT><A HREF="${esc(s.href)}" ADD_DATE="${t}">${esc(savedTitle(s))}</A>`);
    rows.push('        </DL><p>');
  }
  rows.push('    </DL><p>', '</DL><p>', '');
  return rows.join('\n');
}

/* ------------------------------------------------------------------ Pro: the archive */
const CSS = `body{margin:0;background:#f2f6f3;color:#17211c;font:17px/1.55 -apple-system,"Segoe UI",Roboto,Helvetica,Arial,sans-serif}
main{max-width:860px;margin:0 auto;padding:28px 18px 60px}h1{font-size:28px;line-height:1.2;margin:0 0 6px}h2{font-size:21px;margin:34px 0 10px;padding-top:6px;border-top:3px solid #13795b}
a{color:#0f6a50}p.meta{color:#4c5a53;margin:0 0 18px}nav a{margin-right:14px}ul.items{list-style:none;padding:0;margin:0}ul.items li{background:#fff;border-left:4px solid #13795b;border-radius:4px;padding:10px 14px;margin:0 0 8px}
.k{display:inline-block;font-size:13px;font-weight:700;color:#4c5a53;margin-right:8px}.body{white-space:pre-wrap;overflow-wrap:anywhere;margin:6px 0 0}.msg{background:#fff;border-radius:4px;padding:10px 14px;margin:0 0 8px;border-left:4px solid #c9d8cf}
.msg.me{border-left-color:#13795b}.when{font-size:13px;color:#4c5a53}@media print{body{background:#fff}ul.items li,.msg{break-inside:avoid}}`;
function page(title, body, { up = 'index.html' } = {}) {
  return `<!doctype html>\n<html lang="en">\n<head>\n<meta charset="utf-8">\n<meta name="viewport" content="width=device-width, initial-scale=1">\n<title>${esc(title)}</title>\n<style>${CSS}</style>\n</head>\n<body>\n<main>\n${up ? `<nav><a href="${up}">Contents</a></nav>\n` : ''}${body}\n</main>\n</body>\n</html>\n`;
}
const link = (href, text) => (href ? `<a href="${esc(href)}" rel="noopener noreferrer">${esc(text)}</a>` : esc(text));

function savedPage(model) {
  const groups = groupBySub(model.saved);
  const body = [`<h1>Saved posts and comments</h1>`, `<p class="meta">${model.saved.length.toLocaleString('en-US')} saved items from the data request, every one Reddit listed, in ${groups.length} communities. Titles come from the links, so they are short and in lower case.</p>`];
  for (const [sub, items] of groups) {
    body.push(`<h2 id="${esc(safeName(sub))}">${esc(sub)} (${items.length})</h2>`, '<ul class="items">');
    for (const s of items) body.push(`<li><span class="k">${s.kind === 'comment' ? 'Comment' : 'Post'}</span>${link(s.href, s.title || (s.kind === 'comment' ? 'A comment' : 'A post'))}</li>`);
    body.push('</ul>');
  }
  return page('Saved posts and comments', body.join('\n'));
}
function postsPage(model) {
  const body = [`<h1>Your posts</h1>`, `<p class="meta">${model.posts.length.toLocaleString('en-US')} posts, newest first. Times in UTC.</p>`, '<ul class="items">'];
  for (const p of model.posts) {
    body.push(`<li><span class="k">${esc(p.sub)}</span><span class="when">${esc(isoTime(p.date))}</span><br>${link(p.href, p.title || 'A post')}${p.url ? `<br><span class="when">Link: ${link(p.url, p.url)}</span>` : ''}${p.body ? `<div class="body">${esc(p.body)}</div>` : ''}</li>`);
  }
  body.push('</ul>');
  return page('Your posts', body.join('\n'));
}
function commentsPage(model) {
  const body = [`<h1>Your comments</h1>`, `<p class="meta">${model.comments.length.toLocaleString('en-US')} comments, newest first. Times in UTC.</p>`, '<ul class="items">'];
  for (const c of model.comments) {
    body.push(`<li><span class="k">${esc(c.sub)}</span><span class="when">${esc(isoTime(c.date))}</span>${c.on ? `<br>On: ${link(c.postHref, c.on)}` : ''}<div class="body">${esc(c.body)}</div>${c.href ? `<span class="when">${link(c.href, 'Open the comment on Reddit')}</span>` : ''}</li>`);
  }
  body.push('</ul>');
  return page('Your comments', body.join('\n'));
}
function conversationsPage(title, list, kind, me) {
  const body = [`<h1>${esc(title)}</h1>`, `<p class="meta">${list.length.toLocaleString('en-US')} conversations, the most recent first. Times in UTC.</p>`, '<ul>'];
  list.forEach((c, i) => body.push(`<li><a href="#c${i + 1}">${esc(c.title)}</a> <span class="when">(${c.items.length})</span></li>`));
  body.push('</ul>');
  list.forEach((c, i) => {
    body.push(`<h2 id="c${i + 1}">${esc(c.title)}</h2>`);
    if (c.people && c.people.length) body.push(`<p class="meta">With ${esc(c.people.join(', '))}</p>`);
    for (const m of c.items) {
      const who = kind === 'messages' ? m.from : m.user;
      body.push(`<div class="msg${who && who === me ? ' me' : ''}"><span class="k">${esc(who || 'unknown')}</span><span class="when">${esc(isoTime(m.date))}</span>${kind === 'messages' && m.subject ? `<br><strong>${esc(m.subject)}</strong>` : ''}<div class="body">${esc(kind === 'messages' ? m.body : m.text)}</div></div>`);
    }
  });
  return page(title, body.join('\n'));
}
function indexPage(model, files) {
  const c = model.counts;
  const who = model.account.name ? `u/${model.account.name}` : 'your account';
  const rows = [
    ['saved.html', 'Saved posts and comments', c.saved], ['posts.html', 'Your posts', c.posts], ['comments.html', 'Your comments', c.comments],
    ['messages.html', 'Private messages', c.messages], ['chats.html', 'Chats', c.chatMessages], ['bookmarks.html', 'Saved items as a bookmarks file to import into a browser', c.saved],
  ].filter(r => files.includes(r[0]));
  const body = [`<h1>Reddit data of ${esc(who)}</h1>`,
    `<p class="meta">Made with Threadkeep from a Reddit data request${model.account.exported ? ` exported on ${esc(isoDay(model.account.exported))}` : ''}. These pages open without internet; links to Reddit need it.</p>`,
    '<ul class="items">', ...rows.map(([f, t, n]) => `<li><a href="${f}">${esc(t)}</a> <span class="when">${Number(n).toLocaleString('en-US')}</span></li>`), '</ul>',
    '<h2>Also in this folder</h2>', '<ul>', '<li><code>markdown/</code>: the same as notes for Obsidian, Notion or any text editor.</li>',
    '<li><code>spreadsheets/</code>: saved items, posts, comments, votes, messages and chats as CSV files for Excel, Numbers or Google Sheets.</li>', '</ul>'];
  return page(`Reddit data of ${who}`, body.join('\n'), { up: '' });
}

function mdEsc(s) { return String(s ?? '').replace(/([\\[\]])/g, '\\$1'); }
function savedMd(model) {
  const out = ['# Saved posts and comments', '', `${model.saved.length} saved items from a Reddit data request. Titles come from the links.`, ''];
  for (const [sub, items] of groupBySub(model.saved)) {
    out.push(`## ${sub} (${items.length})`, '');
    for (const s of items) out.push(s.href ? `- [${mdEsc(savedTitle(s))}](${s.href})` : `- ${mdEsc(savedTitle(s))}`);
    out.push('');
  }
  return out.join('\n');
}
function postsMd(model) {
  const out = ['# Your posts', ''];
  for (const p of model.posts) {
    out.push(`## ${mdEsc(p.title || 'A post')}`, '', `${p.sub}, ${isoTime(p.date)}${p.href ? `, [on Reddit](${p.href})` : ''}`, '');
    if (p.url) out.push(`Link: ${p.url}`, '');
    if (p.body) out.push(p.body.replace(/\r\n/g, '\n'), '');
  }
  return out.join('\n');
}
function commentsMd(model) {
  const out = ['# Your comments', ''];
  for (const c of model.comments) {
    out.push(`## ${c.sub}, ${isoTime(c.date)}`, '');
    if (c.on) out.push(`On: ${c.postHref ? `[${mdEsc(c.on)}](${c.postHref})` : mdEsc(c.on)}`, '');
    out.push(c.body.replace(/\r\n/g, '\n'), '');
    if (c.href) out.push(`[The comment on Reddit](${c.href})`, '');
  }
  return out.join('\n');
}
function conversationsMd(title, list, kind) {
  const out = [`# ${title}`, ''];
  for (const c of list) {
    out.push(`## ${mdEsc(c.title)}`, '');
    for (const m of c.items) {
      out.push(`**${kind === 'messages' ? m.from || 'unknown' : m.user || 'unknown'}**, ${isoTime(m.date)}${kind === 'messages' && m.subject ? `: ${mdEsc(m.subject)}` : ''}`, '');
      out.push(String(kind === 'messages' ? m.body : m.text).replace(/\r\n/g, '\n'), '');
    }
  }
  return out.join('\n');
}

export function savedCsv(saved) {
  return toCsv(['Type', 'Community', 'Title from the link', 'Link', 'Post id', 'Comment id', 'Line in the export'],
    saved.map(s => [s.kind, s.sub, s.title, s.href, s.postId, s.commentId, s.kind === 'comment' ? s.order - 1e6 + 1 : s.order + 1]));
}

/* Builds the archive ZIP. Returns { blob, files } (files: the names inside, for the tests and the page). */
export async function archiveZip(model, { date = new Date(), onProgress } = {}) {
  const root = `threadkeep-${safeName(model.account.name || 'reddit', 40)}-${isoDay(model.account.exported ?? date.getTime()) || 'export'}`;
  const items = [];
  const add = (name, data) => items.push({ name: `${root}/${name}`, data });
  const say = t => onProgress && onProgress(t);
  const pages = [];
  if (model.saved.length) { say('Saved items'); add('saved.html', savedPage(model)); add('bookmarks.html', bookmarksHtml(model.saved, { date })); add('markdown/saved.md', savedMd(model)); add('spreadsheets/saved.csv', savedCsv(model.saved)); pages.push('saved.html', 'bookmarks.html'); }
  if (model.posts.length) {
    say('Posts'); add('posts.html', postsPage(model)); add('markdown/posts.md', postsMd(model)); pages.push('posts.html');
    add('spreadsheets/posts.csv', toCsv(['Date (UTC)', 'Community', 'Title', 'Text', 'Link to', 'On Reddit'], model.posts.map(p => [isoTime(p.date), p.sub, p.title, p.body, p.url, p.href])));
  }
  if (model.comments.length) {
    say('Comments'); add('comments.html', commentsPage(model)); add('markdown/comments.md', commentsMd(model)); pages.push('comments.html');
    add('spreadsheets/comments.csv', toCsv(['Date (UTC)', 'Community', 'On the post', 'Comment', 'On Reddit'], model.comments.map(c => [isoTime(c.date), c.sub, c.on, c.body, c.href])));
  }
  if (model.votes.length) add('spreadsheets/votes.csv', toCsv(['Vote', 'Type', 'Community', 'Title from the link', 'Link'], model.votes.map(v => [v.dir, v.kind, v.sub, v.title, v.href])));
  if (model.messages.length) {
    say('Messages'); add('messages.html', conversationsPage('Private messages', model.messages, 'messages', model.account.name)); add('markdown/messages.md', conversationsMd('Private messages', model.messages, 'messages')); pages.push('messages.html');
    add('spreadsheets/messages.csv', toCsv(['Conversation', 'Date (UTC)', 'From', 'To', 'Subject', 'Message'], model.messages.flatMap(t => t.items.map(m => [t.title, isoTime(m.date), m.from, m.to, m.subject, m.body]))));
  }
  if (model.chats.length) {
    say('Chats'); add('chats.html', conversationsPage('Chats', model.chats, 'chats', model.account.name)); add('markdown/chats.md', conversationsMd('Chats', model.chats, 'chats')); pages.push('chats.html');
    add('spreadsheets/chats.csv', toCsv(['Chat', 'Date (UTC)', 'From', 'Message'], model.chats.flatMap(c => c.items.map(m => [c.title, isoTime(m.date), m.user, m.text]))));
  }
  if (model.communities.joined.length || model.communities.feeds.length) add('markdown/communities.md', communitiesText(model));
  add('index.html', indexPage(model, pages));
  items.unshift(items.pop());
  say('Packing the ZIP');
  const blob = await writeZip(items, { date });
  return { blob, name: `${root}.zip`, files: items.map(i => i.name) };
}
