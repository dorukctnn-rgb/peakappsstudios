/* Threadkeep page logic. The export is read here, in this tab (js/parse.js, js/zip.js, js/csv.js); nothing is sent anywhere.
 * The only network call the page can make is Gumroad's licence check (/assets/license.js), and only when a Pro key is pasted.
 * Links to Reddit open only when you click them. */
import { collect, openExport, ExportError, savedCommunities, sortSaved } from './parse.js';
import { archiveZip, bookmarksHtml, conversationText, communitiesText, esc, isoDay, isoTime, safeName } from './export.js';
import { sampleFiles, SAMPLE_NAME } from './sample.js';
import { PRO, PRO_READY, PRO_PITCH } from './pro.js';

const $ = id => document.getElementById(id);
const STEP = 100;
const num = n => Number(n).toLocaleString('en-US');
const plural = (n, one, many) => `${num(n)} ${n === 1 ? one : many}`;
const day = ms => (ms == null ? '' : new Date(ms).toLocaleDateString('en-US', { year: 'numeric', month: 'short', day: 'numeric', timeZone: 'UTC' }));
const stamp = ms => (ms == null ? '' : `${day(ms)}, ${new Date(ms).toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit', timeZone: 'UTC' })} UTC`);

let model = null;
let label = '';
let tab = 'saved';
let term = '';
let pro = false;
const st = { sub: '', kind: 'all', sort: 'file', shown: STEP, posts: STEP, comments: STEP, votes: STEP, dir: 'all', conv: { messages: 0, chats: 0 } };

/* ------------------------------------------------------------------ Pro */
function setupPro() {
  if (!window.PeakLicense) return;
  PeakLicense.setup({ tool: 'threadkeep', productId: PRO_READY ? PRO.productId : 'PENDING', permalink: PRO.permalink, buyUrl: PRO.url, pitch: PRO_PITCH });
  pro = PRO_READY && PeakLicense.isPro();
  document.body.classList.toggle('is-pro', pro);
  PeakLicense.onChange(p => { pro = PRO_READY && p; document.body.classList.toggle('is-pro', pro); proNote(); });
}
function proNote() {
  const n = $('save-note');
  if (n) n.textContent = pro ? 'Pro is on in this browser. Choose what to save.' : 'Reading, searching and sorting are free, and so are one conversation as text and your list of communities. Pro saves everything at once for $8, paid once.';
}
function needPro(why) {
  if (PRO_READY && window.PeakLicense && PeakLicense.isPro()) return true;
  if (window.PeakLicense) PeakLicense.open(why); else window.open(PRO.url, '_blank', 'noopener');
  return false;
}

/* ------------------------------------------------------------------ helpers */
function toast(msg) { if (window.PeakUI && PeakUI.toast) PeakUI.toast(msg); }
function download(name, data, type) {
  const blob = data instanceof Blob ? data : new Blob([data], { type: type || 'application/octet-stream' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url; a.download = name; a.rel = 'noopener';
  document.body.appendChild(a); a.click(); a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 120000);
}
const reEsc = s => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
function hl(text) {
  const e = esc(text);
  if (!term) return e;
  return e.replace(new RegExp(reEsc(esc(term)), 'gi'), m => `<mark>${m}</mark>`);
}
const has = (...parts) => !term || parts.some(p => String(p ?? '').toLowerCase().includes(term.toLowerCase()));
const out = (href, text) => (href ? `<a href="${esc(href)}" target="_blank" rel="noopener noreferrer">${text}</a>` : text);

/* ------------------------------------------------------------------ stages and errors */
function stage(name) {
  for (const s of ['idle', 'busy', 'error']) $('stage-' + s).hidden = s !== name;
  $('panel').dataset.state = name;
}
const ERRORS = {
  nothing: ['No files were chosen', 'Choose the ZIP Reddit sent you, its unzipped folder, or the CSV files inside it.'],
  empty: ['The file is empty', 'It has no bytes in it. If the download stopped early, download the ZIP again from the link Reddit sent you.'],
  'not-reddit': ['No Reddit export files here', 'Threadkeep opens the ZIP of CSV files Reddit prepares from reddit.com/settings/data-request, with files such as saved_posts.csv, comments.csv and statistics.csv. These files are something else.'],
  'zip-other': ['No Reddit export files in this ZIP', 'Threadkeep opens the ZIP of CSV files Reddit prepares from reddit.com/settings/data-request, with files such as saved_posts.csv and comments.csv. This ZIP has no CSV files.'],
  'zip-json': ['This ZIP holds JSON files, not Reddit\'s CSV files', 'It looks like a download from another site; Facebook, Instagram and Discord send JSON. Reddit\'s data request is a ZIP of CSV files such as saved_posts.csv.'],
  json: ['This is a JSON file, not a Reddit data request', 'Threadkeep opens the ZIP of CSV files Reddit prepares from reddit.com/settings/data-request. A JSON file saved by another tool is not that export.'],
  pdf: ['This is a PDF, not a Reddit export', 'Reddit sends your data as a ZIP of CSV files. Choose that ZIP, or the CSV files inside it.'],
  html: ['This is a web page, not the export', 'Reddit\'s data request is a ZIP of CSV files. If the browser saved the download page instead of the file, open the link from Reddit again and download the ZIP.'],
  damaged: ['The ZIP file is damaged', 'It could not be opened. If the download was interrupted, download it again from the link Reddit sent you.'],
  truncated: ['The ZIP file is cut short', 'Its end is missing, which happens when a download stops early. Download it again from the link Reddit sent you.'],
  encrypted: ['The ZIP is password protected', 'Reddit does not put a password on its export, so this file was changed afterwards. Use the original file.'],
  rar: ['This is a RAR archive', 'Unpack it first, then choose the ZIP or the CSV files inside.'],
  '7z': ['This is a 7-Zip archive', 'Unpack it first, then choose the ZIP or the CSV files inside.'],
  gzip: ['This is a compressed archive Threadkeep does not open', 'Unpack it first, then choose the CSV files inside.'],
  'office-old': ['This is an Office file, not a Reddit export', 'Reddit sends your data as a ZIP of CSV files.'],
};
function showError(code, detail) {
  const [t, d] = ERRORS[code] || ['These files could not be opened', 'Threadkeep opens the ZIP of CSV files from Reddit\'s data request, its unzipped folder or the CSV files themselves. Nothing in these files looks like that export.'];
  $('error-title').textContent = t;
  $('error-text').textContent = d;
  stage('error');
  $('error-title').focus();
  if (detail && code === 'unknown') console.warn(detail);
}

/* ------------------------------------------------------------------ opening */
async function openFiles(chosen, name) {
  const files = [...(chosen || [])];
  if (!files.length) return showError('nothing');
  stage('busy');
  $('busy-sub').textContent = 'Reading in your browser.';
  $('busy-title').focus();
  try {
    const { records, odd } = await collect(files);
    if (!records.length) throw new ExportError(odd.length ? odd[0].kind : 'nothing');
    const m = await openExport(records, { onProgress: t => { $('busy-sub').textContent = t; } });
    show(m, name || (files.length === 1 ? files[0].name : plural(files.length, 'file', 'files')));
  } catch (e) {
    showError(e && e.code ? e.code : 'unknown', e && e.message);
  }
}
function openSample() {
  const files = Object.entries(sampleFiles()).map(([n, t]) => new File([t], n, { type: 'text/csv' }));
  openFiles(files, `${SAMPLE_NAME} (the sample)`);
}
function show(m, name) {
  model = m; label = name; tab = 'saved'; term = '';
  Object.assign(st, { sub: '', kind: 'all', sort: 'file', shown: STEP, posts: STEP, comments: STEP, votes: STEP, dir: 'all', conv: { messages: 0, chats: 0 } });
  $('search').value = '';
  const a = m.account;
  const bits = [];
  if (a.name) bits.push(`u/${a.name}`);
  if (a.exported != null) bits.push(`exported ${day(a.exported)}`);
  if (a.registered != null) bits.push(`account since ${day(a.registered)}`);
  bits.push(`${plural(m.counts.saved, 'saved item', 'saved items')}`);
  $('reader-meta').textContent = `${bits.join(', ')}. From ${name}.`;
  if (!m.counts.saved) tab = m.counts.posts ? 'posts' : m.counts.comments ? 'comments' : 'account';
  $('reader').hidden = false;
  stage('idle');
  render();
  $('reader').scrollIntoView({ behavior: matchMedia('(prefers-reduced-motion: reduce)').matches ? 'auto' : 'smooth', block: 'start' });
  $('reader-title').focus({ preventScroll: true });
}

/* ------------------------------------------------------------------ lists after the search */
function lists() {
  const m = model;
  return {
    saved: m.saved.filter(s => has(s.title, s.sub)),
    posts: m.posts.filter(p => has(p.title, p.body, p.sub, p.url)),
    comments: m.comments.filter(c => has(c.body, c.on, c.sub)),
    messages: m.messages.filter(t => has(t.title, ...t.items.map(x => `${x.subject} ${x.body} ${x.from} ${x.to}`))),
    chats: m.chats.filter(c => has(c.title, ...c.items.map(x => `${x.text} ${x.user}`))),
    votes: m.votes.filter(v => has(v.title, v.sub)),
    communities: m.communities.joined.filter(s => has(s)),
  };
}
const TABS = [['saved', 'Saved'], ['posts', 'Posts'], ['comments', 'Comments'], ['messages', 'Messages'], ['chats', 'Chats'], ['votes', 'Votes'], ['communities', 'Communities'], ['account', 'Account']];

function render() {
  const L = lists();
  $('tabs').innerHTML = TABS.map(([k, t]) => {
    const n = k === 'account' ? '' : `<span class="n">${num(L[k].length)}</span>`;
    return `<button type="button" role="tab" class="tk-tab" id="tab-${k}" data-tab="${k}" aria-selected="${k === tab}" aria-controls="view" tabindex="${k === tab ? 0 : -1}">${t}${n}</button>`;
  }).join('');
  $('view').setAttribute('aria-labelledby', `tab-${tab}`);
  const note = $('search-note');
  if (term) {
    const total = ['saved', 'posts', 'comments', 'messages', 'chats', 'votes', 'communities'].reduce((n, k) => n + L[k].length, 0);
    note.hidden = false;
    note.textContent = total ? `"${term}": ${plural(total, 'match', 'matches')}. The number on each tab is what matches there.` : `Nothing matches "${term}".`;
  } else note.hidden = true;
  const views = { saved: viewSaved, posts: viewPosts, comments: viewComments, messages: () => viewConvs('messages', L.messages), chats: () => viewConvs('chats', L.chats), votes: viewVotes, communities: viewCommunities, account: viewAccount };
  $('view').innerHTML = views[tab](L);
}

function moreButton(shown, total, key) {
  if (shown >= total) return '';
  return `<p class="tk-more"><button type="button" class="tk-btn tk-btn-plain tk-btn-sm" data-more="${key}">Show ${num(Math.min(STEP * 5, total - shown))} more (${num(total - shown)} left)</button></p>`;
}

function viewSaved(L) {
  const m = model;
  if (!m.saved.length) return `<p class="tk-empty">This export has no saved posts or comments. Either you never saved any, or <code>saved_posts.csv</code> and <code>saved_comments.csv</code> were not among the files you chose.</p>`;
  const subs = savedCommunities(L.saved);
  const top = subs.slice(0, 14);
  if (st.sub && !top.some(s => s.sub === st.sub)) { const cur = subs.find(s => s.sub === st.sub); if (cur) top.push(cur); }
  let list = L.saved.filter(s => (!st.sub || s.sub === st.sub) && (st.kind === 'all' || s.kind === st.kind));
  list = sortSaved(list, st.sort);
  const shown = list.slice(0, st.shown);
  const more = subs.length > top.length ? `<label>More communities <select id="sub-more"><option value="">Choose one</option>${subs.filter(s => !top.includes(s)).map(s => `<option value="${esc(s.sub)}">${esc(s.sub || 'No community')} (${num(s.n)})</option>`).join('')}</select></label>` : '';
  return `<p class="tk-small" style="margin:0 0 12px">${plural(m.counts.savedPosts, 'saved post', 'saved posts')} and ${plural(m.counts.savedComments, 'saved comment', 'saved comments')} in the export${m.counts.saved > 1000 ? `, ${num(m.counts.saved - 1000)} more than the 1,000 Reddit's saved list shows` : ''}. The titles come from the links, so they are short and lower case. <a href="/reddit-data-export-viewer/saved-posts-data-request/">Why</a></p>
<div class="tk-subs" role="group" aria-label="Filter by community"><button type="button" class="tk-sub" data-sub="" aria-pressed="${!st.sub}">All<span class="n">${num(L.saved.length)}</span></button>${top.map(s => `<button type="button" class="tk-sub" data-sub="${esc(s.sub)}" aria-pressed="${st.sub === s.sub}">${esc(s.sub || 'No community')}<span class="n">${num(s.n)}</span></button>`).join('')}</div>
<div class="tk-toolbar">${more}<label>Show <select id="kind"><option value="all"${st.kind === 'all' ? ' selected' : ''}>Posts and comments</option><option value="post"${st.kind === 'post' ? ' selected' : ''}>Posts only</option><option value="comment"${st.kind === 'comment' ? ' selected' : ''}>Comments only</option></select></label><label>Order <select id="sort"><option value="file"${st.sort === 'file' ? ' selected' : ''}>As in the export</option><option value="newest"${st.sort === 'newest' ? ' selected' : ''}>Newest posts first</option><option value="oldest"${st.sort === 'oldest' ? ' selected' : ''}>Oldest posts first</option></select></label></div>
<p class="tk-small" style="margin:0 0 10px" id="saved-count">${plural(list.length, 'item', 'items')}${st.sub ? ` in ${esc(st.sub || 'no community')}` : ''}.</p>
${list.length ? `<ul class="tk-list" id="saved-list">${shown.map(s => `<li class="tk-row${s.kind === 'comment' ? ' is-comment' : ''}"><div class="tk-row-top"><span class="k">${s.kind === 'comment' ? 'Comment' : 'Post'}</span><span>${hl(s.sub || 'No community')}</span></div><p class="tk-row-title">${out(s.href, hl(s.title || (s.kind === 'comment' ? 'A comment (no title in the link)' : 'A post (no title in the link)')))}</p></li>`).join('')}</ul>` : '<p class="tk-empty">Nothing here with these filters.</p>'}
${moreButton(shown.length, list.length, 'shown')}`;
}

function bodyHtml(text) {
  const t = String(text ?? '');
  if (!t.trim()) return '';
  const long = t.length > 700 || t.split('\n').length > 8;
  return `<div class="tk-row-body${long && !term ? ' is-long' : ''}">${hl(t)}</div>${long && !term ? '<button type="button" class="tk-link" data-expand>Show all of it</button>' : ''}`;
}
function viewPosts(L) {
  if (!model.posts.length) return '<p class="tk-empty">No posts in this export.</p>';
  const list = L.posts;
  const shown = list.slice(0, st.posts);
  return `${model.partial.posts ? '<p class="tk-small" style="margin:0 0 10px">Only <code>post_headers.csv</code> was chosen, so the posts have no text. Choose <code>posts.csv</code> too to read them.</p>' : ''}
<ul class="tk-list">${shown.map(p => `<li class="tk-row"><div class="tk-row-top"><span class="k">${hl(p.sub)}</span><span>${esc(stamp(p.date))}</span></div><p class="tk-row-title">${out(p.href, hl(p.title || 'A post'))}</p>${p.url ? `<p class="tk-small" style="margin:2px 0 0">Link: ${out(p.url, hl(p.url))}</p>` : ''}${bodyHtml(p.body)}</li>`).join('')}</ul>
${list.length ? '' : '<p class="tk-empty">No posts match.</p>'}${moreButton(shown.length, list.length, 'posts')}`;
}
function viewComments(L) {
  if (!model.comments.length) return '<p class="tk-empty">No comments in this export.</p>';
  const list = L.comments;
  const shown = list.slice(0, st.comments);
  return `${model.partial.comments ? '<p class="tk-small" style="margin:0 0 10px">Only <code>comment_headers.csv</code> was chosen, so the comments have no text. Choose <code>comments.csv</code> too to read them.</p>' : ''}
<ul class="tk-list">${shown.map(c => `<li class="tk-row"><div class="tk-row-top"><span class="k">${hl(c.sub)}</span><span>${esc(stamp(c.date))}</span></div>${c.on ? `<p class="tk-row-title" style="font-size:16px">On: ${out(c.postHref, hl(c.on))}</p>` : ''}${bodyHtml(c.body)}${c.href ? `<p class="tk-small" style="margin:4px 0 0">${out(c.href, 'Open the comment on Reddit')}</p>` : ''}</li>`).join('')}</ul>
${list.length ? '' : '<p class="tk-empty">No comments match.</p>'}${moreButton(shown.length, list.length, 'comments')}`;
}
function convHtml(kind, c, me) {
  return c.items.map(x => {
    const who = kind === 'messages' ? x.from : x.user;
    return `<div class="tk-msg${who && who === me ? ' me' : ''}"><span class="who">${hl(who || 'unknown')}</span>${kind === 'messages' && x.to ? `<span class="when">to ${hl(x.to)}</span>` : ''}<span class="when">${esc(stamp(x.date))}</span>${kind === 'messages' && x.subject ? `<div><strong>${hl(x.subject)}</strong></div>` : ''}<div class="txt">${hl(kind === 'messages' ? x.body : x.text)}</div></div>`;
  }).join('');
}
function viewConvs(kind, list) {
  const all = kind === 'messages' ? model.messages : model.chats;
  if (!all.length) return `<p class="tk-empty">${kind === 'messages' ? 'No archived private messages in this export (<code>messages_archive.csv</code>).' : 'No chats in this export (<code>chat_history.csv</code>).'}</p>`;
  if (!list.length) return `<p class="tk-empty">No ${kind === 'messages' ? 'messages' : 'chats'} match.</p>`;
  const i = Math.min(st.conv[kind], list.length - 1);
  const c = list[i];
  return `<div class="tk-convs"><ul class="tk-conv-list" aria-label="${kind === 'messages' ? 'Conversations' : 'Chats'}">${list.map((x, k) => `<li><button type="button" data-conv="${k}" aria-current="${k === i}">${hl(x.title)}<small>${plural(x.items.length, 'message', 'messages')}, last ${esc(day(x.last))}</small></button></li>`).join('')}</ul>
<div class="tk-conv" id="conv"><div class="tk-conv-head"><div><h3 id="conv-title" tabindex="-1">${hl(c.title)}</h3>${c.people.length ? `<p class="tk-small" style="margin:0">With ${hl(c.people.join(', '))}</p>` : ''}</div><div class="tk-actions" style="margin:0"><button type="button" class="tk-btn tk-btn-plain tk-btn-sm" id="btn-conv-text">Save it as text</button><button type="button" class="tk-btn tk-btn-plain tk-btn-sm" id="btn-conv-print">Print it</button></div></div>${convHtml(kind, c, model.account.name)}</div></div>`;
}
function viewVotes(L) {
  if (!model.votes.length) return '<p class="tk-empty">No upvotes or downvotes in this export.</p>';
  const list = L.votes.filter(v => st.dir === 'all' || v.dir === st.dir);
  const shown = list.slice(0, st.votes);
  return `<div class="tk-toolbar"><label>Show <select id="dir"><option value="all"${st.dir === 'all' ? ' selected' : ''}>Upvotes and downvotes</option><option value="up"${st.dir === 'up' ? ' selected' : ''}>Upvotes (${num(model.counts.up)})</option><option value="down"${st.dir === 'down' ? ' selected' : ''}>Downvotes (${num(model.counts.down)})</option></select></label></div>
<ul class="tk-list">${shown.map(v => `<li class="tk-row${v.kind === 'comment' ? ' is-comment' : ''}"><div class="tk-row-top"><span class="tk-vote ${v.dir}">${v.dir === 'up' ? 'Upvoted' : 'Downvoted'}</span><span>${v.kind === 'comment' ? 'Comment' : 'Post'}</span><span>${hl(v.sub)}</span></div><p class="tk-row-title">${out(v.href, hl(v.title || 'No title in the link'))}</p></li>`).join('')}</ul>
${list.length ? '' : '<p class="tk-empty">Nothing here.</p>'}${moreButton(shown.length, list.length, 'votes')}`;
}
function viewCommunities(L) {
  const c = model.communities;
  if (!c.joined.length && !c.moderated.length && !c.feeds.length) return '<p class="tk-empty">No communities in this export (<code>subscribed_subreddits.csv</code>).</p>';
  return `<div class="tk-conv-head"><p class="tk-small" style="margin:0">${plural(c.joined.length, 'community', 'communities')} joined${c.moderated.length ? `, ${num(c.moderated.length)} moderated` : ''}${c.feeds.length ? `, ${plural(c.feeds.length, 'custom feed', 'custom feeds')}` : ''}.</p><button type="button" class="tk-btn tk-btn-plain tk-btn-sm" id="btn-subs-text">Save the list as text</button></div>
<h3>Joined</h3><ul class="tk-cols2">${L.communities.map(s => `<li>${out(`https://www.reddit.com/r/${encodeURIComponent(s)}/`, hl(`r/${s}`))}</li>`).join('') || '<li class="tk-empty">None match.</li>'}</ul>
${c.moderated.length ? `<h3>Moderated</h3><ul class="tk-cols2">${c.moderated.map(s => `<li>r/${esc(s)}</li>`).join('')}</ul>` : ''}
${c.feeds.length ? `<h3>Custom feeds</h3><ul class="tk-list">${c.feeds.map(f => `<li class="tk-row"><p class="tk-row-title">${esc(f.name)}</p><p class="tk-small" style="margin:2px 0 0">${esc(f.subs.map(s => `r/${s}`).join(', '))}</p></li>`).join('')}</ul>` : ''}`;
}
function viewAccount() {
  const m = model;
  const a = m.account;
  const rows = m.files.map(f => `<tr><td><code>${esc(f.names.join(', '))}</code></td><td>${esc(f.label || 'Not shown by Threadkeep')}</td><td>${num(f.rows)}</td></tr>`).join('');
  return `<dl class="tk-dl"><dt>Account</dt><dd>${a.name ? `u/${esc(a.name)}` : 'Not in the files chosen'}</dd><dt>Signed up</dt><dd>${a.registered != null ? esc(stamp(a.registered)) : 'Not in the files chosen'}</dd><dt>Export made</dt><dd>${a.exported != null ? esc(stamp(a.exported)) : 'Not in the files chosen'}</dd>${m.counts.drafts ? `<dt>Drafts</dt><dd>${num(m.counts.drafts)}</dd>` : ''}${m.counts.hidden ? `<dt>Hidden posts</dt><dd>${num(m.counts.hidden)}</dd>` : ''}</dl>
<table class="tk-table"><caption>The files in this export</caption><thead><tr><th scope="col">File</th><th scope="col">What it holds</th><th scope="col">Rows</th></tr></thead><tbody>${rows}</tbody></table>
<p class="tk-small">Files with IP addresses, payment references and verification details are counted here and never shown.</p>`;
}

/* ------------------------------------------------------------------ actions */
function currentConv() {
  const L = lists();
  const list = L[tab];
  if (!list || !list.length) return null;
  return list[Math.min(st.conv[tab], list.length - 1)];
}
function printConv() {
  const c = currentConv();
  if (!c) return;
  const area = $('print-area');
  area.innerHTML = `<h1 style="font-size:24px">${esc(c.title)}</h1><p>${tab === 'messages' ? 'Reddit private messages' : 'Reddit chat'}${c.people.length ? `, with ${esc(c.people.join(', '))}` : ''}. Times in UTC.</p>${convHtml(tab, c, model.account.name).replace(/<mark>|<\/mark>/g, '')}`;
  document.body.classList.add('is-printing');
  const done = () => { document.body.classList.remove('is-printing'); area.innerHTML = ''; window.removeEventListener('afterprint', done); };
  window.addEventListener('afterprint', done);
  window.print();
  setTimeout(done, 1500);
}
async function proSave(what) {
  if (!model) return;
  if (!needPro(what === 'bookmarks' ? 'Saving every saved item as bookmarks is part of Threadkeep Pro.' : 'Saving the whole export as an archive is part of Threadkeep Pro.')) return;
  const who = safeName(model.account.name || 'reddit', 40);
  if (what === 'bookmarks') {
    if (!model.saved.length) return toast('This export has no saved items.');
    download(`threadkeep-saved-${who}.html`, bookmarksHtml(model.saved), 'text/html');
    toast(`Saved ${plural(model.saved.filter(s => s.href).length, 'bookmark', 'bookmarks')}.`);
  } else {
    const note = $('save-note');
    note.textContent = 'Building the archive in your browser.';
    const a = await archiveZip(model, { onProgress: t => { note.textContent = `Building the archive: ${t}.`; } });
    download(a.name, a.blob, 'application/zip');
    proNote();
    toast('Archive saved.');
  }
}

/* ------------------------------------------------------------------ events */
function wire() {
  const fileInput = $('file-input');
  const folderInput = $('folder-input');
  $('btn-choose').addEventListener('click', () => fileInput.click());
  $('btn-folder').addEventListener('click', () => folderInput.click());
  fileInput.addEventListener('change', () => { openFiles(fileInput.files); fileInput.value = ''; });
  folderInput.addEventListener('change', () => { openFiles(folderInput.files, 'the chosen folder'); folderInput.value = ''; });
  $('btn-sample').addEventListener('click', openSample);
  $('btn-error-sample').addEventListener('click', openSample);
  $('btn-retry').addEventListener('click', () => { stage('idle'); $('drop-title').focus(); fileInput.click(); });
  $('btn-another').addEventListener('click', () => { $('panel').scrollIntoView({ block: 'center' }); stage('idle'); $('drop-title').focus({ preventScroll: true }); });

  const drop = $('drop');
  const over = on => drop.classList.toggle('is-over', on);
  for (const el of [drop, $('panel')]) {
    el.addEventListener('dragover', e => { e.preventDefault(); over(true); });
    el.addEventListener('dragleave', () => over(false));
    el.addEventListener('drop', async e => { e.preventDefault(); over(false); openFiles(await droppedFiles(e.dataTransfer)); });
  }

  let timer = null;
  $('search').addEventListener('input', e => {
    clearTimeout(timer);
    timer = setTimeout(() => { term = e.target.value.trim(); st.shown = st.posts = st.comments = st.votes = STEP; st.conv.messages = st.conv.chats = 0; if (model) render(); }, 180);
  });

  $('tabs').addEventListener('click', e => { const b = e.target.closest('[data-tab]'); if (b) { tab = b.dataset.tab; render(); $(`tab-${tab}`).focus(); } });
  $('tabs').addEventListener('keydown', e => {
    if (!['ArrowLeft', 'ArrowRight', 'Home', 'End'].includes(e.key)) return;
    const keys = TABS.map(t => t[0]);
    let k = keys.indexOf(tab);
    k = e.key === 'Home' ? 0 : e.key === 'End' ? keys.length - 1 : (k + (e.key === 'ArrowRight' ? 1 : -1) + keys.length) % keys.length;
    tab = keys[k]; render(); $(`tab-${tab}`).focus(); e.preventDefault();
  });

  $('view').addEventListener('click', e => {
    const t = e.target;
    const sub = t.closest('[data-sub]');
    if (sub) { st.sub = sub.dataset.sub; st.shown = STEP; render(); return; }
    const more = t.closest('[data-more]');
    if (more) { const k = more.dataset.more; st[k] += STEP * 5; render(); return; }
    const conv = t.closest('[data-conv]');
    if (conv) { st.conv[tab] = +conv.dataset.conv; render(); const h = $('conv-title'); if (h) { h.focus({ preventScroll: true }); if (matchMedia('(max-width: 860px)').matches) $('conv').scrollIntoView({ block: 'start' }); } return; }
    if (t.closest('[data-expand]')) { const b = t.closest('[data-expand]'); const body = b.previousElementSibling; if (body) body.classList.remove('is-long'); b.remove(); return; }
    if (t.closest('#btn-conv-text')) { const c = currentConv(); if (c) download(`reddit-${tab === 'messages' ? 'messages' : 'chat'}-${safeName(c.title, 40)}.txt`, conversationText(c, { kind: tab, account: model.account.name }), 'text/plain;charset=utf-8'); return; }
    if (t.closest('#btn-conv-print')) { printConv(); return; }
    if (t.closest('#btn-subs-text')) { download(`reddit-communities-${safeName(model.account.name || 'reddit', 40)}.txt`, communitiesText(model), 'text/plain;charset=utf-8'); }
  });
  $('view').addEventListener('change', e => {
    const t = e.target;
    if (t.id === 'kind') { st.kind = t.value; st.shown = STEP; render(); $('kind').focus(); }
    else if (t.id === 'sort') { st.sort = t.value; st.shown = STEP; render(); $('sort').focus(); }
    else if (t.id === 'sub-more' && t.value) { st.sub = t.value; st.shown = STEP; render(); }
    else if (t.id === 'dir') { st.dir = t.value; st.votes = STEP; render(); $('dir').focus(); }
  });
  for (const b of document.querySelectorAll('[data-pro]')) b.addEventListener('click', () => proSave(b.dataset.pro));
}

/* Files and folders dropped on the page; folders are walked so their CSV files come along with their paths. */
async function droppedFiles(dt) {
  const items = [...(dt.items || [])];
  const entries = items.map(i => (i.webkitGetAsEntry ? i.webkitGetAsEntry() : null)).filter(Boolean);
  if (!entries.length || entries.every(e => e.isFile)) return [...(dt.files || [])];
  const outFiles = [];
  const walk = async (entry, prefix) => {
    if (entry.isFile) { const f = await new Promise((res, rej) => entry.file(res, rej)); f._path = prefix + f.name; outFiles.push(f); return; }
    const reader = entry.createReader();
    for (;;) {
      const batch = await new Promise((res, rej) => reader.readEntries(res, rej));
      if (!batch.length) break;
      for (const e of batch) await walk(e, `${prefix}${entry.name}/`);
    }
  };
  for (const e of entries) await walk(e, '');
  return outFiles;
}

/* The page's state for the browser tests: the export that is open, and the files Pro would save. */
window.__threadkeep = {
  get model() { return model; },
  archive: (date) => archiveZip(model, { date: date ? new Date(date) : new Date() }),
  bookmarks: () => bookmarksHtml(model.saved),
  isoDay, isoTime,
};

wire();
if (document.readyState === 'complete') setupPro(); else window.addEventListener('load', setupPro);
proNote();
