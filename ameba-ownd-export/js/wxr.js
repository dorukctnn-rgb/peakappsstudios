// Utsushi: a WordPress export file (WXR 1.2), the file WordPress reads in Tools > Import > WordPress.
// What WordPress's importer does with it (read in WordPress/wordpress-importer, class-wp-import.php, 5 Nov 2026):
//  - every item is inserted with import_id = <wp:post_id>, so a post keeps its Ameba Ownd number when that number is free in the
//    new site (a fresh WordPress has only 1-3); with the permalink /posts/%post_id%/ the old addresses stay the same
//  - with "Download and import file attachments" ticked it downloads every attachment from <wp:attachment_url> and then replaces that
//    address in every post with the new one (url_remap); so the images must be written with exactly the same address in the posts
//  - a post with the same title, date and type as one already there is skipped, so importing twice does not double the site
// Posts and pages come first and the attachments after them (an attachment's number never takes a post's number), numbered above
// the highest Ameba Ownd number so no two items share one.
import { escapeHtml, isCdnImage } from './sanitize.js';
import { itemHtml } from './blocks.js';
import { sortedPosts, sortedPages, collectImages } from './parse.js';

const XML_BAD = /[\u0000-\u0008\u000b\u000c\u000e-\u001f￾￿]/g;
export const cdata = s => `<![CDATA[${String(s == null ? '' : s).replace(XML_BAD, '').replace(/\]\]>/g, ']]]]><![CDATA[>')}]]>`;
const x = s => escapeHtml(String(s == null ? '' : s).replace(XML_BAD, ''));

const pad = n => String(n).padStart(2, '0');
// WordPress's own date format; Japan has had no daylight saving time, so JST is UTC+9 all year
export function wpDate(iso, offsetHours = 0) {
  const d = new Date(iso);
  if (!Number.isFinite(d.getTime())) return '0000-00-00 00:00:00';
  const t = new Date(d.getTime() + offsetHours * 3600e3);
  return `${t.getUTCFullYear()}-${pad(t.getUTCMonth() + 1)}-${pad(t.getUTCDate())} ${pad(t.getUTCHours())}:${pad(t.getUTCMinutes())}:${pad(t.getUTCSeconds())}`;
}
const rfc = iso => { const d = new Date(iso); return Number.isFinite(d.getTime()) ? d.toUTCString().replace('GMT', '+0000') : ''; };

// a slug WordPress accepts as it is: Latin letters, digits and hyphens; anything else falls back to post-<id> / page-<id>
export function slugFor(item, kind) {
  const s = String(item.urlPath || '').toLowerCase().replace(/[^a-z0-9-]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 80);
  if (s && !/^\d+$/.test(s) && !/^page_\d+$/.test(item.urlPath || '') && !/^page-\d{6,}$/.test(s)) return s;
  return `${kind}-${item.id}`;
}
export const catSlug = label => encodeURIComponent(String(label).trim().toLowerCase().replace(/\s+/g, '-')).toLowerCase().slice(0, 190) || 'uncategorized';

/**
 * @param site the model from parse.js
 * @param opts.posts / opts.pages: the items to write (default: all); opts.images: 'attach' (WordPress downloads them from Ameba Ownd)
 *   or 'local' (the images were uploaded by hand to opts.localBase: no attachments, addresses point there)
 */
export function buildWxr(site, opts = {}) {
  const posts = opts.posts || sortedPosts(site);
  const pages = opts.pages || sortedPages(site);
  const mode = opts.images || 'attach';
  const localBase = opts.localBase || '/wp-content/uploads/ameba-ownd/';
  const origin = site.origin || 'https://example.amebaownd.com';
  const now = opts.now || new Date().toISOString();
  const imageFor = mode === 'local' ? (u => (isCdnImage(u) ? localBase + u.split('/').pop() : u)) : null;
  const ctx = { mode: 'export', origin: site.origin, image: imageFor };
  const author = 'ameba-ownd';
  const cats = new Map();
  for (const p of posts) for (const c of p.categories) if (!cats.has(c)) cats.set(c, cats.size + 1);

  const out = [];
  out.push('<?xml version="1.0" encoding="UTF-8" ?>');
  out.push(`<!-- Utsushi (https://peakappsstudio.com/ameba-ownd-export/) から書き出し: ${x(now)} -->`);
  out.push('<!-- WordPress の「ツール」>「インポート」>「WordPress」で読み込めます。 -->');
  out.push('<rss version="2.0" xmlns:excerpt="http://wordpress.org/export/1.2/excerpt/" xmlns:content="http://purl.org/rss/1.0/modules/content/" xmlns:wfw="http://wellformedweb.org/CommentAPI/" xmlns:dc="http://purl.org/dc/elements/1.1/" xmlns:wp="http://wordpress.org/export/1.2/">');
  out.push('<channel>');
  out.push(`\t<title>${x(site.title || 'Ameba Ownd')}</title>`);
  out.push(`\t<link>${x(origin)}</link>`);
  out.push(`\t<description>${x(site.tagline)}</description>`);
  out.push(`\t<pubDate>${x(rfc(now))}</pubDate>`);
  out.push('\t<language>ja</language>');
  out.push('\t<wp:wxr_version>1.2</wp:wxr_version>');
  out.push(`\t<wp:base_site_url>${x(origin)}</wp:base_site_url>`);
  out.push(`\t<wp:base_blog_url>${x(origin)}</wp:base_blog_url>`);
  out.push(`\t<wp:author><wp:author_id>1</wp:author_id><wp:author_login>${cdata(author)}</wp:author_login><wp:author_email>${cdata('')}</wp:author_email><wp:author_display_name>${cdata(site.title || 'Ameba Ownd')}</wp:author_display_name><wp:author_first_name>${cdata('')}</wp:author_first_name><wp:author_last_name>${cdata('')}</wp:author_last_name></wp:author>`);
  for (const [label, id] of cats) out.push(`\t<wp:category><wp:term_id>${id}</wp:term_id><wp:category_nicename>${cdata(catSlug(label))}</wp:category_nicename><wp:category_parent>${cdata('')}</wp:category_parent><wp:cat_name>${cdata(label)}</wp:cat_name></wp:category>`);
  out.push('\t<generator>https://peakappsstudio.com/ameba-ownd-export/</generator>');

  const images = mode === 'attach' ? collectImages({ ...site, posts: new Map(posts.map(p => [p.id, p])), pages: new Map(pages.map(p => [p.id, p])) }) : [];
  let nextId = Math.max(0, ...posts.map(p => Number(p.id)), ...pages.map(p => Number(p.id))) + 1;
  const attId = new Map(images.map(im => [im.url, nextId++]));

  const item = (it, type) => {
    const date = it.publishedAt || it.createdAt || it.updatedAt || now;
    const link = it.url || (origin + it.path);
    const lines = [
      '\t<item>',
      `\t\t<title>${cdata(it.title || (type === 'page' ? 'ページ' : '無題'))}</title>`,
      `\t\t<link>${x(link)}</link>`,
      `\t\t<pubDate>${x(rfc(date))}</pubDate>`,
      `\t\t<dc:creator>${cdata(author)}</dc:creator>`,
      `\t\t<guid isPermaLink="false">${x(link)}</guid>`,
      '\t\t<description></description>',
      `\t\t<content:encoded>${cdata(itemHtml(it, ctx))}</content:encoded>`,
      `\t\t<excerpt:encoded>${cdata('')}</excerpt:encoded>`,
      `\t\t<wp:post_id>${Number(it.id)}</wp:post_id>`,
      `\t\t<wp:post_date>${cdata(wpDate(date, 9))}</wp:post_date>`,
      `\t\t<wp:post_date_gmt>${cdata(wpDate(date, 0))}</wp:post_date_gmt>`,
      `\t\t<wp:post_modified>${cdata(wpDate(it.updatedAt || date, 9))}</wp:post_modified>`,
      `\t\t<wp:post_modified_gmt>${cdata(wpDate(it.updatedAt || date, 0))}</wp:post_modified_gmt>`,
      `\t\t<wp:comment_status>${cdata('closed')}</wp:comment_status>`,
      `\t\t<wp:ping_status>${cdata('closed')}</wp:ping_status>`,
      `\t\t<wp:post_name>${cdata(slugFor(it, type))}</wp:post_name>`,
      `\t\t<wp:status>${cdata('publish')}</wp:status>`,
      '\t\t<wp:post_parent>0</wp:post_parent>',
      `\t\t<wp:menu_order>${type === 'page' ? pages.indexOf(it) : 0}</wp:menu_order>`,
      `\t\t<wp:post_type>${cdata(type)}</wp:post_type>`,
      `\t\t<wp:post_password>${cdata('')}</wp:post_password>`,
      '\t\t<wp:is_sticky>0</wp:is_sticky>',
    ];
    for (const c of it.categories || []) lines.push(`\t\t<category domain="category" nicename="${x(catSlug(c))}">${cdata(c)}</category>`);
    if (type === 'post' && it.image && attId.has(it.image)) lines.push(`\t\t<wp:postmeta><wp:meta_key>${cdata('_thumbnail_id')}</wp:meta_key><wp:meta_value>${cdata(attId.get(it.image))}</wp:meta_value></wp:postmeta>`);
    lines.push(`\t\t<wp:postmeta><wp:meta_key>${cdata('_ameba_ownd_url')}</wp:meta_key><wp:meta_value>${cdata(link)}</wp:meta_value></wp:postmeta>`);
    lines.push('\t</item>');
    return lines.join('\n');
  };
  for (const p of pages) out.push(item(p, 'page'));
  for (const p of posts) out.push(item(p, 'post'));
  for (const im of images) {
    const owner = im.owner;
    const date = (owner && (owner.publishedAt || owner.createdAt)) || now;
    out.push([
      '\t<item>',
      `\t\t<title>${cdata(im.name.replace(/\.[a-z0-9]+$/i, ''))}</title>`,
      `\t\t<link>${x(im.url)}</link>`,
      `\t\t<pubDate>${x(rfc(date))}</pubDate>`,
      `\t\t<dc:creator>${cdata(author)}</dc:creator>`,
      `\t\t<guid isPermaLink="false">${x(im.url)}</guid>`,
      '\t\t<description></description>',
      `\t\t<content:encoded>${cdata('')}</content:encoded>`,
      `\t\t<excerpt:encoded>${cdata('')}</excerpt:encoded>`,
      `\t\t<wp:post_id>${attId.get(im.url)}</wp:post_id>`,
      `\t\t<wp:post_date>${cdata(wpDate(date, 9))}</wp:post_date>`,
      `\t\t<wp:post_date_gmt>${cdata(wpDate(date, 0))}</wp:post_date_gmt>`,
      `\t\t<wp:comment_status>${cdata('closed')}</wp:comment_status>`,
      `\t\t<wp:ping_status>${cdata('closed')}</wp:ping_status>`,
      `\t\t<wp:post_name>${cdata(im.name.replace(/\.[a-z0-9]+$/i, '').toLowerCase().slice(0, 80))}</wp:post_name>`,
      `\t\t<wp:status>${cdata('inherit')}</wp:status>`,
      `\t\t<wp:post_parent>${owner ? Number(owner.id) : 0}</wp:post_parent>`,
      '\t\t<wp:menu_order>0</wp:menu_order>',
      `\t\t<wp:post_type>${cdata('attachment')}</wp:post_type>`,
      `\t\t<wp:post_password>${cdata('')}</wp:post_password>`,
      '\t\t<wp:is_sticky>0</wp:is_sticky>',
      `\t\t<wp:attachment_url>${cdata(im.url)}</wp:attachment_url>`,
      '\t</item>',
    ].join('\n'));
  }
  out.push('</channel>');
  out.push('</rss>');
  return { xml: out.join('\n') + '\n', counts: { posts: posts.length, pages: pages.length, images: images.length, categories: cats.size } };
}

// .htaccess lines for an own domain moved to WordPress on Apache or LiteSpeed (the usual Japanese rental servers): with the
// permalink /posts/%post_id%/ the post addresses stay as they were; the pages get a line each, the extra part after a post number
// is dropped, and the blog's list pages go to the front page.
export function htaccess(site, opts = {}) {
  const pages = opts.pages || sortedPages(site);
  const lines = ['# Utsushi が作った Ameba Ownd からの転送設定（WordPress の .htaccess の「# BEGIN WordPress」より上に貼ります）',
    '# 前提: WordPress の「設定」>「パーマリンク」を「カスタム構造」/posts/%post_id%/ にしていること', ''];
  lines.push('RedirectMatch 301 ^/posts/([0-9]+)/[^/]+/?$ /posts/$1/');
  for (const p of pages) {
    if (p.id === site.homePageId) { lines.push(`RedirectMatch 301 ^/pages/${p.id}(/.*)?$ /`); continue; }
    lines.push(`RedirectMatch 301 ^/pages/${p.id}(/.*)?$ /${slugFor(p, 'page')}/`);
  }
  lines.push('RedirectMatch 301 ^/posts/page/[0-9]+/?$ /');
  return lines.join('\n') + '\n';
}

export function redirectCsv(site, opts = {}) {
  const posts = opts.posts || sortedPosts(site);
  const pages = opts.pages || sortedPages(site);
  const rows = [['old', 'new', 'title']];
  for (const p of pages) rows.push([`/pages/${p.id}/${p.urlPath}`.replace(/\/$/, ''), p.id === site.homePageId ? '/' : `/${slugFor(p, 'page')}/`, p.title]);
  for (const p of posts) rows.push([`/posts/${p.id}`, `/posts/${p.id}/`, p.title]);
  return csv(rows);
}

// CSV that Excel opens in Japanese (BOM) and that never starts a formula
export function csv(rows) {
  const cell = v => { let s = String(v == null ? '' : v); if (/^[=+\-@\t\r]/.test(s)) s = "'" + s; return /[",\n\r]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s; };
  return '﻿' + rows.map(r => r.map(cell).join(',')).join('\r\n') + '\r\n';
}
