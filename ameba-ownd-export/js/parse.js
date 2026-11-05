// Utsushi: reads what a person can get out of an Ameba Ownd site today and turns it into one model of the site.
//  - the site's feed (/rss.xml): the newest 30 posts with their full HTML (Ameba Ownd lets any page read it)
//  - a page of the site saved from the browser, or fetched by the collector: the data Ameba Ownd puts in every page
//    (<script id="__NEXT_DATA__">), with posts block by block and pages row by row
//  - the backup file our collector (the bookmark) writes: every post and page of the site in one JSON file
// No DOM is needed, so the same code runs in the page, in the worker and in the tests.
import { decodeEntities, htmlToText, bareImage, isCdnImage } from './sanitize.js';

export const BACKUP_FORMAT = 'utsushi-ownd-backup';

export function emptySite() {
  return { origin: '', title: '', tagline: '', copyright: '', logoUrl: '', iconUrl: '', coverImageUrl: '', homePageId: '', navigations: [],
    posts: new Map(), pages: new Map(), sources: new Set(), complete: false, total: 0, notes: [] };
}

const str = v => (v == null ? '' : String(v));
const cleanId = v => (/^\d{1,15}$/.test(str(v)) ? str(v) : '');
function originOf(u) {
  try { const x = new URL(u); return /^https?:$/.test(x.protocol) ? x.origin : ''; } catch (e) { return ''; }
}
const validDate = s => { const d = new Date(s); return Number.isFinite(d.getTime()) && d.getUTCFullYear() > 1990 ? d.toISOString() : ''; };

/* ------------------------------------------------------------------ the feed */
function tagText(xml, tag) {
  const m = new RegExp(`<${tag}(?:\\s[^>]*)?>([\\s\\S]*?)</${tag}>`, 'i').exec(xml);
  if (!m) return '';
  const v = m[1].trim();
  const cd = /^<!\[CDATA\[([\s\S]*?)\]\]>$/.exec(v);
  return cd ? cd[1] : decodeEntities(v);
}
export function looksLikeFeed(text) { return /<rss[\s>]/i.test(String(text).slice(0, 2000)) && /<channel[\s>]/i.test(text); }

export function readFeed(xml) {
  const s = String(xml || '');
  if (!looksLikeFeed(s)) throw new Error('not-feed');
  const head = s.split(/<item[\s>]/i)[0];
  const site = { title: tagText(head, 'title'), link: tagText(head, 'link'), tagline: tagText(head, 'description') };
  const posts = [];
  const re = /<item(?:\s[^>]*)?>([\s\S]*?)<\/item>/gi;
  let m;
  while ((m = re.exec(s))) {
    const it = m[1];
    const link = tagText(it, 'link') || tagText(it, 'guid');
    const id = cleanId((/\/posts\/(\d+)/.exec(link) || [])[1]);
    if (!id) continue;
    const enc = /<enclosure[^>]*url="([^"]+)"/i.exec(it);
    posts.push({
      id, title: tagText(it, 'title'), url: link, path: pathOf(link),
      publishedAt: validDate(tagText(it, 'pubDate')), updatedAt: '', categories: [], author: tagText(it, 'dc:creator'),
      blocks: null, html: tidyFeedHtml(tagText(it, 'description')), image: enc ? bareImage(decodeEntities(enc[1])) : '', from: 'feed',
    });
  }
  return { site, posts };
}
// the feed wraps every block in <div> with tabs and line breaks between them
function tidyFeedHtml(h) {
  return str(h).replace(/>\s*\n\s*</g, '><').replace(/^\s+|\s+$/g, '');
}
function pathOf(u) { try { return new URL(u).pathname; } catch (e) { return ''; } }

/* ------------------------------------------------------------------ data inside a page */
export function looksLikeOwndPage(text) { return /<script[^>]+id="__NEXT_DATA__"/i.test(String(text)) && /siteConfig|amebaowndme/i.test(String(text)); }

export function nextState(html) {
  const m = /<script[^>]*id="__NEXT_DATA__"[^>]*>([\s\S]*?)<\/script>/i.exec(String(html || ''));
  if (!m) return null;
  let j;
  try { j = JSON.parse(m[1]); } catch (e) { return null; }
  const st = j && j.props && j.props.pageProps && j.props.pageProps.state;
  return st && typeof st === 'object' ? st : null;
}

export function normPost(p, from = 'data') {
  if (!p || typeof p !== 'object') return null;
  const id = cleanId(p.id);
  if (!id || (p.status && p.status !== 'publish')) return null;
  const blocks = Array.isArray(p.contents) ? p.contents.filter(b => b && typeof b === 'object' && typeof b.type === 'string') : null;
  return {
    id, title: str(p.title), url: str(p.publishedUrl), path: p.publishedUrl ? pathOf(p.publishedUrl) : `/posts/${id}`,
    urlPath: str(p.urlPath), publishedAt: validDate(p.publishedAt), updatedAt: validDate(p.updatedAt),
    categories: Array.isArray(p.blogCategories) ? p.blogCategories.map(c => str(c && c.label)).filter(Boolean) : [],
    author: str(p.user && p.user.nickname), blocks, html: null, image: bareImage(str(p.ogpImageUrl)), from,
  };
}
export function normPage(d, from = 'data') {
  if (!d || typeof d !== 'object') return null;
  const id = cleanId(d.id);
  if (!id) return null;
  const rows = [];
  const layout = d.contents && d.contents.layout;
  for (const r of (layout && Array.isArray(layout.rows) ? layout.rows : [])) {
    const cols = (r && Array.isArray(r.columns) ? r.columns : []).map(c => (c && Array.isArray(c.blocks) ? c.blocks.filter(b => b && typeof b.type === 'string') : []));
    if (cols.length) rows.push(cols);
  }
  return { id, title: str(d.title), type: str(d.type), urlPath: str(d.urlPath), path: `/pages/${id}/${str(d.urlPath)}`.replace(/\/$/, ''),
    showTitle: d.showTitle !== false, createdAt: validDate(d.createdAt), updatedAt: validDate(d.updatedAt), rows, from };
}
function siteFrom(sc) {
  if (!sc || typeof sc !== 'object') return {};
  return { title: str(sc.title), tagline: str(sc.tagline), copyright: str(sc.copyright), logoUrl: bareImage(str(sc.logoUrl)),
    iconUrl: bareImage(str(sc.iconUrl)), coverImageUrl: bareImage(str(sc.coverImageUrl)), homePageId: cleanId(sc.homePageId),
    navigations: Array.isArray(sc.navigations) ? sc.navigations.map(n => ({ title: str(n && n.title), urlPath: str(n && n.urlPath), pageId: cleanId(n && n.pageId) })) : [] };
}

/** Everything one page of the site carries: the site, its posts (a list page has 9 to 12, a post page one) and its page. */
export function readOwndPage(html, hint = '') {
  const st = nextState(html);
  if (!st) throw new Error('no-data');
  const site = siteFrom(st.siteConfig);
  const posts = [];
  let total = 0;
  for (const v of Object.values(st.postList || {})) {
    for (const p of (v && v.data) || []) { const n = normPost(p); if (n) posts.push(n); }
    const pg = v && v.meta && v.meta.pagination;
    if (pg && Number(pg.total) > total) total = Number(pg.total);
  }
  for (const v of Object.values(st.postDetail || {})) { const n = normPost(v && v.data); if (n) posts.push(n); }
  const pages = [];
  for (const v of Object.values(st.page || {})) { const n = normPage(v && v.data); if (n) pages.push(n); }
  const canon = /<link[^>]+rel="canonical"[^>]+href="([^"]+)"/i.exec(html) || /<meta[^>]+property="og:url"[^>]+content="([^"]+)"/i.exec(html);
  const origin = originOf((posts.find(p => p.url) || {}).url || (canon && decodeEntities(canon[1])) || hint);
  return { site, posts, pages, total, origin };
}

/* ------------------------------------------------------------------ our backup file */
export function readBackup(text) {
  let j;
  try { j = typeof text === 'string' ? JSON.parse(text.replace(/^﻿/, '')) : text; } catch (e) { throw new Error('not-backup'); }
  if (!j || j.format !== BACKUP_FORMAT || !Array.isArray(j.posts)) throw new Error('not-backup');
  return {
    site: siteFrom(j.site), origin: originOf(j.origin), total: Number(j.total) || 0, createdAt: validDate(j.createdAt),
    posts: j.posts.map(p => normPost(p)).filter(Boolean), pages: (Array.isArray(j.pages) ? j.pages : []).map(p => normPage(p)).filter(Boolean),
    missed: Array.isArray(j.missed) ? j.missed.map(str).slice(0, 500) : [],
  };
}

/* ------------------------------------------------------------------ one model */
// a post read from the page data (blocks, categories, dates) wins over the same post read from the feed
export function mergeInto(site, part, source) {
  site.sources.add(source);
  const s = part.site || {};
  for (const k of ['title', 'tagline', 'copyright', 'logoUrl', 'iconUrl', 'coverImageUrl', 'homePageId']) if (s[k] && !site[k]) site[k] = s[k];
  if (s.navigations && s.navigations.length && !site.navigations.length) site.navigations = s.navigations;
  if (part.origin && !site.origin) site.origin = part.origin;
  if (part.site && part.site.link && !site.origin) site.origin = originOf(part.site.link);
  for (const p of part.posts || []) {
    const old = site.posts.get(p.id);
    if (!old || (old.from === 'feed' && p.from !== 'feed')) site.posts.set(p.id, old ? { ...p, image: p.image || old.image } : p);
  }
  for (const p of part.pages || []) if (!site.pages.has(p.id)) site.pages.set(p.id, p);
  if (part.total > site.total) site.total = part.total;
  if (source === 'backup') site.complete = true;
  for (const u of part.missed || []) site.notes.push({ kind: 'missed', url: u });
  return site;
}

/** Recognises a file by its content (never only by its name): our backup, the feed, a saved page. */
export function readText(name, text) {
  const t = String(text || '').replace(/^﻿/, '');
  const head = t.slice(0, 400).trimStart();
  if (head.startsWith('{')) { const b = readBackup(t); return { kind: 'backup', part: b }; }
  if (looksLikeFeed(t)) { const f = readFeed(t); return { kind: 'feed', part: { site: f.site, posts: f.posts, origin: originOf(f.site.link) } }; }
  if (/<html|<!doctype|<script/i.test(t.slice(0, 5000)) || /\.html?$/i.test(name)) {
    if (!looksLikeOwndPage(t)) throw new Error('not-ownd-page');
    return { kind: 'page', part: readOwndPage(t) };
  }
  throw new Error('unknown');
}

/* ------------------------------------------------------------------ what is in it */
export function sortedPosts(site) {
  return [...site.posts.values()].sort((a, b) => (b.publishedAt || '').localeCompare(a.publishedAt || '') || Number(b.id) - Number(a.id));
}
export function sortedPages(site) {
  const nav = site.navigations.map(n => n.pageId).filter(Boolean);
  const rank = id => (id === site.homePageId ? -1 : nav.includes(id) ? nav.indexOf(id) : 1e6);
  return [...site.pages.values()].sort((a, b) => rank(a.id) - rank(b.id) || Number(a.id) - Number(b.id));
}

// every image of the site on Ameba Ownd's image server, once, in the order it first appears, with the item it first belongs to
export function collectImages(site) {
  const seen = new Map();
  const add = (u, owner) => { const b = bareImage(decodeEntities(u)); if (isCdnImage(b) && /\.[a-z0-9]{2,5}$/i.test(b) && !seen.has(b)) seen.set(b, owner); };
  const fromHtml = (h, owner) => { const re = /<img[^>]+src\s*=\s*["']?([^"'\s>]+)/gi; let m; while ((m = re.exec(str(h)))) add(m[1], owner); };
  const fromBlocks = (bs, owner) => { for (const b of bs || []) { if (b.type === 'image' && b.url) add(b.url, owner); if (b.type === 'text' || b.type === 'html') fromHtml(b.value || b.source, owner); } };
  for (const p of sortedPosts(site)) { if (p.blocks) fromBlocks(p.blocks, p); else fromHtml(p.html, p); if (p.image) add(p.image, p); }
  for (const pg of sortedPages(site)) for (const r of pg.rows) for (const c of r) fromBlocks(c, pg);
  for (const u of [site.logoUrl, site.coverImageUrl, site.iconUrl]) if (u) add(u, null);
  return [...seen.entries()].map(([url, owner]) => ({ url, owner, name: url.split('/').pop() }));
}

export function searchText(item) {
  if (item.blocks) return item.blocks.map(b => (b.type === 'text' ? htmlToText(b.value) : b.type === 'title' ? str(b.value) : b.type === 'quote' ? str(b.json && b.json.title) : '')).join('\n');
  if (item.rows) return item.rows.flat(2).map(b => (b.type === 'text' ? htmlToText(b.value) : b.type === 'title' ? str(b.value) : '')).join('\n');
  return htmlToText(item.html);
}

// an address someone types (site name, amebaownd.com address, own domain, a post address) -> the site's feed
export function feedUrlFor(input) {
  let s = String(input || '').trim().replace(/^[　\s]+|[　\s]+$/g, '');
  if (!s) return '';
  if (/^[a-z0-9-]{1,63}$/i.test(s)) s = `${s}.amebaownd.com`;
  if (!/^https?:\/\//i.test(s)) s = 'https://' + s;
  let u;
  try { u = new URL(s); } catch (e) { return ''; }
  if (!/^[a-z0-9.-]+\.[a-z]{2,}$/i.test(u.hostname) || /^(localhost|\d+\.\d+\.\d+\.\d+)$/.test(u.hostname)) return '';
  return `https://${u.hostname.toLowerCase()}/rss.xml`;
}
