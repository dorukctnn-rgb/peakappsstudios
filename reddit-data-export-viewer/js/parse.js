/* Threadkeep's reader for the Reddit data request: the ZIP of CSV files Reddit prepares from reddit.com/settings/data-request.
 * It takes the ZIP, its unzipped folder or single CSV files, joins files Reddit splits into numbered parts (post_votes_1.csv,
 * post_votes_2.csv), and turns each file into lists the page can show: saved posts and comments, your posts, comments,
 * votes, archived private messages, chats, communities and the account's own figures. Nothing here touches the network. */
import { readZip, entryText, sniff, ZipError } from './zip.js';
import { csvObjects } from './csv.js';

export class ExportError extends Error {
  constructor(code, detail = '') { super(detail || code); this.code = code; this.detail = detail; }
}

/* Every file name seen in a Reddit data request (checked against an export made in June 2026 and the open source importer
 * of Epicenter, github.com/EpicenterHQ/epicenter). Files that hold IP addresses, payment or verification identifiers are
 * recognised, so the export is known, but never shown. */
export const KNOWN = [
  'posts', 'post_headers', 'comments', 'comment_headers', 'saved_posts', 'saved_comments', 'hidden_posts',
  'post_votes', 'comment_votes', 'poll_votes', 'messages', 'message_headers', 'messages_archive', 'messages_archive_headers',
  'chat_history', 'subscribed_subreddits', 'moderated_subreddits', 'approved_submitter_subreddits', 'multireddits',
  'drafts', 'friends', 'statistics', 'user_preferences', 'checkfile', 'ip_logs', 'gilded_content', 'gold_received',
  'purchases', 'subscriptions', 'payouts', 'announcements', 'scheduled_posts', 'account_gender', 'birthdate',
  'linked_identities', 'linked_phone_number', 'persona', 'sensitive_ads_preferences', 'stripe', 'twitter',
];
const KNOWN_SET = new Set(KNOWN);
/* What each file is, in words, for the account view and the guide. */
export const FILE_LABEL = {
  posts: 'Your posts, with title, link and text', post_headers: 'Your posts, without their text',
  comments: 'Your comments, with their text', comment_headers: 'Your comments, without their text',
  saved_posts: 'Posts you saved (links)', saved_comments: 'Comments you saved (links)', hidden_posts: 'Posts you hid (links)',
  post_votes: 'Posts you voted on', comment_votes: 'Comments you voted on', poll_votes: 'Poll answers',
  messages: 'Private messages', message_headers: 'Private messages, without their text',
  messages_archive: 'Archived private messages', messages_archive_headers: 'Archived private messages, without their text',
  chat_history: 'Chat messages', subscribed_subreddits: 'Communities you joined', moderated_subreddits: 'Communities you moderate',
  approved_submitter_subreddits: 'Communities that approved you to post', multireddits: 'Custom feeds',
  drafts: 'Drafts', friends: 'People you follow or added as friends', statistics: 'Account name, sign-up date and export time',
  user_preferences: 'Your settings', checkfile: 'A checksum of every file in the export', ip_logs: 'IP addresses of recent log-ins',
  gilded_content: 'Awards you gave', gold_received: 'Awards you received', purchases: 'Purchases', subscriptions: 'Premium subscriptions',
  payouts: 'Contributor payouts', announcements: 'Announcements Reddit sent you', scheduled_posts: 'Scheduled posts',
  account_gender: 'Gender, if you set it', birthdate: 'Birth date, if you gave it', linked_identities: 'Linked sign-in accounts',
  linked_phone_number: 'Linked phone number', persona: 'Identity check status', sensitive_ads_preferences: 'Ad topic settings',
  stripe: 'Payment account reference', twitter: 'Linked X (Twitter) account',
};

/* '2026-05-24 03:19:35 UTC' (the export's form), ISO, or a plain date: milliseconds since 1970, or null. */
export function parseDate(s) {
  const t = String(s ?? '').trim();
  if (!t) return null;
  let m = /^(\d{4})-(\d{2})-(\d{2})[ T](\d{2}):(\d{2})(?::(\d{2}))?(?:\.\d+)?\s*(?:UTC|GMT|Z|\+00:?00)?$/i.exec(t);
  if (m) return Date.UTC(+m[1], +m[2] - 1, +m[3], +m[4], +m[5], +(m[6] || 0));
  m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(t);
  if (m) return Date.UTC(+m[1], +m[2] - 1, +m[3]);
  const d = Date.parse(t);
  return Number.isNaN(d) ? null : d;
}

/* The parts of a Reddit link: community, post id, the short title Reddit writes into the link, comment id. Takes the full
 * address or the path. */
export function linkInfo(permalink) {
  let p = String(permalink ?? '').trim();
  if (/^https?:\/\//i.test(p)) { try { p = new URL(p).pathname; } catch { p = ''; } }
  const seg = p.split('/').filter(Boolean);
  const out = { sub: '', user: '', postId: '', slug: '', commentId: '' };
  let i = 0;
  if (seg[0] === 'r' && seg[1]) { out.sub = seg[1]; i = 2; } else if ((seg[0] === 'user' || seg[0] === 'u') && seg[1]) { out.user = seg[1]; i = 2; }
  if (out.sub.toLowerCase().startsWith('u_')) out.user = out.sub.slice(2);
  if (seg[i] === 'comments' && seg[i + 1]) { out.postId = seg[i + 1]; out.slug = seg[i + 2] || ''; out.commentId = seg[i + 3] || ''; }
  return out;
}

/* The short title from a link: 'how_to_keep_a_starter_alive' becomes 'How to keep a starter alive'. Reddit writes only the
 * start of the title, in lower case, without punctuation, so this is a hint of the title, not the title. */
export function slugTitle(slug) {
  let t = String(slug ?? '');
  try { t = decodeURIComponent(t); } catch { /* keep as is */ }
  t = t.replace(/_+/g, ' ').replace(/\s+/g, ' ').trim();
  t = t.replace(/(^| )i( |$)/g, '$1I$2');
  return t ? t[0].toUpperCase() + t.slice(1) : '';
}

/* 'r/Sourdough', or 'u/name' for a post on a profile. */
export function communityLabel(sub, user) {
  if (user) return `u/${user}`;
  return sub ? `r/${sub}` : '';
}

/* A safe address to open on Reddit: only reddit.com links, or a path that becomes one. Anything else (a javascript: link
 * in a damaged file) gives ''. */
export function redditHref(permalink) {
  const p = String(permalink ?? '').trim();
  if (/^https:\/\/((www|old|new|np)\.)?reddit\.com\//i.test(p)) return p;
  if (/^\/(r|u|user)\//.test(p)) return `https://www.reddit.com${p}`;
  return '';
}
/* An outside link a post points to: http(s) only. */
export const safeUrl = u => (/^https?:\/\/[^\s"<>]+$/i.test(String(u ?? '').trim()) ? String(u).trim() : '');

/* Reddit ids count up in base 36, so a larger id is a later post or comment. */
export function idOrder(id) {
  const t = String(id ?? '').toLowerCase().replace(/^t[1-6]_/, '');
  if (!/^[0-9a-z]{1,13}$/.test(t)) return -1;
  return parseInt(t, 36);
}

/* ------------------------------------------------------------------ collecting the files */
function baseOf(path) {
  const name = String(path).split('/').pop().toLowerCase();
  const m = /^(.+)\.csv$/.exec(name);
  if (!m) return null;
  let base = m[1];
  let part = 0;
  const pm = /^(.+?)_(\d+)$/.exec(base);
  if (pm && KNOWN_SET.has(pm[1])) { base = pm[1]; part = +pm[2]; }
  return { base, part, name };
}

/* Takes the files the visitor chose or dropped: the ZIP, an unzipped folder, or single CSV files. Returns the CSV files found
 * (each with a text() that reads it only when asked) and the files that were something else. */
export async function collect(files) {
  const records = [];
  const odd = [];
  for (const f of files) {
    const path = (f._path || f.webkitRelativePath || f.name || '').replace(/\\/g, '/');
    const kind = await sniff(f);
    if (kind === 'zip') {
      let z;
      try { z = await readZip(f); } catch (e) { odd.push({ name: f.name, kind: e instanceof ZipError && e.code === 'truncated' ? 'truncated' : 'damaged' }); continue; }
      const csvs = z.entries.filter(e => !e.dir && /\.csv$/i.test(e.name));
      if (csvs.some(e => e.encrypted)) { odd.push({ name: f.name, kind: 'encrypted' }); continue; }
      if (!csvs.length) { odd.push({ name: f.name, kind: z.entries.some(e => /\.json$/i.test(e.name)) ? 'zip-json' : 'zip-other' }); continue; }
      for (const e of csvs) records.push({ path: e.name, size: e.size, text: () => entryText(e) });
    } else if (/\.csv$/i.test(path) && (kind === 'text' || kind === 'empty')) {
      records.push({ path, size: f.size, text: () => f.text() });
    } else if (/\//.test(path) && !/\.csv$/i.test(path)) {
      // another file inside a chosen folder (a README, a system file): not part of the data, nothing to say about it
    } else {
      odd.push({ name: f.name, kind });
    }
  }
  return { records, odd };
}

/* ------------------------------------------------------------------ reading the export */
const by = (key, dir = -1) => (a, b) => ((a[key] ?? -Infinity) < (b[key] ?? -Infinity) ? -dir : (a[key] ?? -Infinity) > (b[key] ?? -Infinity) ? dir : 0);

function savedItem(kind, r, order) {
  const info = linkInfo(r.permalink);
  const id = String(r.id || '').trim();
  const postId = info.postId || (kind === 'post' ? id : '');
  const commentId = kind === 'comment' ? (info.commentId || id) : '';
  return {
    kind, id, order,
    href: redditHref(r.permalink),
    sub: communityLabel(info.sub, info.user),
    title: slugTitle(info.slug),
    postId, commentId,
    age: idOrder(postId || id),
  };
}

function threadPeople(items, me) {
  const set = new Set();
  for (const m of items) for (const p of [m.from, m.to]) if (p && p !== me) set.add(p);
  return [...set];
}

/* Reads every CSV of the export and returns the model the page shows. onProgress(text) is told what is being read. */
export async function openExport(records, { onProgress } = {}) {
  const groups = new Map();
  for (const r of records) {
    const b = baseOf(r.path);
    if (!b) continue;
    if (!groups.has(b.base)) groups.set(b.base, []);
    groups.get(b.base).push({ ...r, part: b.part, name: b.name });
  }
  const known = [...groups.keys()].filter(k => KNOWN_SET.has(k));
  if (!known.length) throw new ExportError(records.length ? 'not-reddit' : 'nothing', [...groups.keys()].slice(0, 6).join(', '));

  const tables = {};
  const files = [];
  for (const base of known) {
    const parts = groups.get(base).sort((a, b) => a.part - b.part);
    const rows = [];
    let header = [];
    for (const p of parts) {
      if (onProgress) onProgress(`Reading ${p.name}`);
      let text;
      try { text = await p.text(); } catch (e) { throw new ExportError(e instanceof ZipError && e.code === 'encrypted' ? 'encrypted' : 'damaged', p.name); }
      const t = csvObjects(text);
      if (!header.length) header = t.header;
      rows.push(...t.records);
    }
    tables[base] = rows;
    files.push({ base, names: parts.map(p => p.name), rows: rows.length, header, label: FILE_LABEL[base] || '' });
  }
  files.sort((a, b) => KNOWN.indexOf(a.base) - KNOWN.indexOf(b.base));

  // the account
  const stats = Object.fromEntries((tables.statistics || []).map(r => [String(r.statistic || '').trim().toLowerCase(), String(r.value ?? '').trim()]));
  const account = {
    name: stats['account name'] || '',
    registered: parseDate(stats['registration date']),
    exported: parseDate(stats['export time']),
  };
  const me = account.name;

  // saved and hidden
  const saved = [
    ...(tables.saved_posts || []).map((r, k) => savedItem('post', r, k)),
    ...(tables.saved_comments || []).map((r, k) => savedItem('comment', r, k + 1e6)),
  ].filter(x => x.id || x.href);
  const hidden = (tables.hidden_posts || []).map((r, k) => savedItem('post', r, k)).filter(x => x.id || x.href);

  // votes
  const voteRow = kind => (r, k) => ({ ...savedItem(kind, r, k), dir: String(r.direction || '').trim().toLowerCase() });
  const votes = [...(tables.post_votes || []).map(voteRow('post')), ...(tables.comment_votes || []).map(voteRow('comment'))]
    .filter(v => v.dir === 'up' || v.dir === 'down');

  // your posts and comments (the full files if they are there, the header-only files if not)
  const postsFull = !!tables.posts;
  const posts = (tables.posts || tables.post_headers || []).map(r => {
    const info = linkInfo(r.permalink);
    return {
      id: String(r.id || '').trim(), href: redditHref(r.permalink), date: parseDate(r.date),
      sub: communityLabel(r.subreddit && !info.user ? r.subreddit : info.sub, info.user) || (r.subreddit ? `r/${r.subreddit}` : ''),
      title: String(r.title ?? '').trim() || slugTitle(info.slug), url: safeUrl(r.url) && !redditHref(r.url) ? safeUrl(r.url) : '',
      body: String(r.body ?? ''), slugOnly: !String(r.title ?? '').trim(),
    };
  }).sort(by('date'));
  const commentsFull = !!tables.comments;
  const comments = (tables.comments || tables.comment_headers || []).map(r => {
    const info = linkInfo(r.permalink || r.link);
    const post = linkInfo(r.link || r.permalink);
    return {
      id: String(r.id || '').trim(), href: redditHref(r.permalink), date: parseDate(r.date),
      sub: communityLabel(info.sub || r.subreddit, info.user) || (r.subreddit ? `r/${r.subreddit}` : ''),
      on: slugTitle(post.slug), postHref: redditHref(r.link), body: String(r.body ?? ''), media: safeUrl(r.media),
    };
  }).sort(by('date'));

  // private messages: the archive and any older messages file, one thread per thread id
  const msgRows = [...(tables.messages_archive || tables.messages_archive_headers || []), ...(tables.messages || tables.message_headers || [])];
  const seen = new Set();
  const threadsMap = new Map();
  for (const r of msgRows) {
    const id = String(r.id || '').trim();
    if (id && seen.has(id)) continue;
    if (id) seen.add(id);
    const key = String(r.thread_id || '').trim() || id || `m${threadsMap.size}`;
    if (!threadsMap.has(key)) threadsMap.set(key, { key, items: [] });
    threadsMap.get(key).items.push({ id, date: parseDate(r.date), from: String(r.from ?? '').trim(), to: String(r.to ?? '').trim(), subject: String(r.subject ?? '').trim(), body: String(r.body ?? ''), href: redditHref(r.permalink) });
  }
  const messages = [...threadsMap.values()].map(t => {
    t.items.sort(by('date', 1));
    const people = threadPeople(t.items, me);
    const subject = (t.items.find(m => m.subject) || {}).subject || '';
    return { ...t, subject, people, first: t.items[0]?.date ?? null, last: t.items[t.items.length - 1]?.date ?? null, title: subject || (people.length ? `With ${people.join(', ')}` : 'Message') };
  }).sort(by('last'));

  // chats: one conversation per channel
  const chatMap = new Map();
  for (const r of tables.chat_history || []) {
    const key = String(r.channel_url || '').trim() || String(r.channel_name || '').trim() || 'chat';
    if (!chatMap.has(key)) chatMap.set(key, { key, name: String(r.channel_name || '').trim(), sub: String(r.subreddit || '').trim(), type: String(r.conversation_type || '').trim(), items: [] });
    const c = chatMap.get(key);
    if (!c.name && r.channel_name) c.name = String(r.channel_name).trim();
    c.items.push({ id: String(r.message_id || '').trim(), date: parseDate(r.created_at), user: String(r.username ?? '').trim(), text: String(r.message ?? ''), parent: String(r.thread_parent_message_id || '').trim() });
  }
  const chats = [...chatMap.values()].map(c => {
    c.items.sort(by('date', 1));
    const people = [...new Set(c.items.map(m => m.user).filter(u => u && u !== me))];
    const title = c.name || (c.sub ? `r/${c.sub}` : people.length ? `With ${people.slice(0, 4).join(', ')}${people.length > 4 ? ` and ${people.length - 4} more` : ''}` : 'Chat');
    return { ...c, people, title, first: c.items[0]?.date ?? null, last: c.items[c.items.length - 1]?.date ?? null };
  }).sort(by('last'));

  // communities and the rest
  const subList = rows => [...new Set((rows || []).map(r => String(r.subreddit || '').trim()).filter(Boolean))].sort((a, b) => a.localeCompare(b, 'en', { sensitivity: 'base' }));
  const communities = {
    joined: subList(tables.subscribed_subreddits),
    moderated: subList(tables.moderated_subreddits),
    approved: subList(tables.approved_submitter_subreddits),
    feeds: (tables.multireddits || []).map(r => ({ name: String(r.display_name || r.id || '').trim(), subs: String(r.subreddits || '').split(/[,\s]+/).map(s => s.replace(/^r\//, '')).filter(Boolean), description: String(r.description || '').trim(), privacy: String(r.privacy || '').trim() })).filter(f => f.name),
  };
  const drafts = (tables.drafts || []).map(r => ({ id: String(r.id || ''), title: String(r.title || '').trim(), body: String(r.body ?? ''), sub: r.subreddit ? `r/${String(r.subreddit).replace(/^r\//, '')}` : '', date: parseDate(r.created) })).filter(d => d.title || d.body).sort(by('date'));

  return {
    account, files, saved, hidden, votes, posts, comments, messages, chats, communities, drafts,
    partial: { posts: !postsFull && !!tables.post_headers, comments: !commentsFull && !!tables.comment_headers },
    counts: {
      saved: saved.length, savedPosts: saved.filter(s => s.kind === 'post').length, savedComments: saved.filter(s => s.kind === 'comment').length,
      posts: posts.length, comments: comments.length, messages: messages.reduce((n, t) => n + t.items.length, 0), threads: messages.length,
      chats: chats.length, chatMessages: chats.reduce((n, c) => n + c.items.length, 0), up: votes.filter(v => v.dir === 'up').length,
      down: votes.filter(v => v.dir === 'down').length, joined: communities.joined.length, hidden: hidden.length, drafts: drafts.length,
    },
  };
}

/* The communities of the saved items, most saved first: [{ sub, n }]. */
export function savedCommunities(saved) {
  const m = new Map();
  for (const s of saved) { const k = s.sub || ''; m.set(k, (m.get(k) || 0) + 1); }
  return [...m.entries()].map(([sub, n]) => ({ sub, n })).sort((a, b) => b.n - a.n || a.sub.localeCompare(b.sub, 'en', { sensitivity: 'base' }));
}

/* Sorts saved items: 'file' (the order of the export's file), 'newest' or 'oldest' (by the post's id, which counts up). */
export function sortSaved(list, how) {
  const a = list.slice();
  if (how === 'newest') a.sort((x, y) => y.age - x.age || x.order - y.order);
  else if (how === 'oldest') a.sort((x, y) => (x.age < 0) - (y.age < 0) || x.age - y.age || x.order - y.order);
  else a.sort((x, y) => x.order - y.order);
  return a;
}
