// Utsushi: the files it saves. Free: one post or page (HTML, Markdown, text), the list of images, and a WordPress file of the newest
// 30 posts and 3 pages. Pro: the whole site in one package (WordPress files, Markdown, an offline copy that opens without a
// connection, the redirect lines for an own domain, the image list) and every image copied from Ameba Ownd's image server.
import { zipSync, strToU8 } from '../vendor/fflate.js';
import { escapeHtml, htmlToText, bareImage, isCdnImage } from './sanitize.js';
import { itemHtml } from './blocks.js';
import { htmlToMarkdown, frontMatter } from './md.js';
import { buildWxr, htaccess, redirectCsv, csv, slugFor } from './wxr.js';
import { sortedPosts, sortedPages, collectImages } from './parse.js';

export const FREE_POSTS = 30;
export const FREE_PAGES = 3;
export const PART_BYTES = 200 * 1024 * 1024; // one images ZIP stays under 200 MB, so a phone or an old PC can open it

const jst = iso => { const d = new Date(iso); if (!Number.isFinite(d.getTime())) return ''; const t = new Date(d.getTime() + 9 * 3600e3); return `${t.getUTCFullYear()}年${t.getUTCMonth() + 1}月${t.getUTCDate()}日`; };
export const dateLabel = jst;
export function fileStem(item) {
  const base = String(item.title || '').replace(/[\\/:*?"<>|\u0000-\u001f]+/g, ' ').replace(/\s+/g, ' ').trim().slice(0, 60);
  return `${item.rows ? 'page' : 'post'}-${item.id}${base ? ' ' + base : ''}`;
}
export function hostOf(site) { try { return new URL(site.origin).hostname; } catch (e) { return 'ameba-ownd'; } }

const DOC_CSS = 'body{font:17px/1.8 "Hiragino Sans","Yu Gothic","Meiryo",system-ui,sans-serif;color:#1d1a2a;max-width:44rem;margin:2rem auto;padding:0 1rem}img{max-width:100%;height:auto}figure{margin:1.2rem 0}h1{font-size:1.7rem;line-height:1.4}h2{font-size:1.3rem}.meta{color:#5a5868;font-size:.9rem}blockquote{border-left:4px solid #a8c95a;margin:1rem 0;padding:.2rem 1rem}.ut-cols{display:grid;gap:1.2rem;grid-template-columns:repeat(auto-fit,minmax(14rem,1fr))}a{color:#3b2f7a}nav a{margin-right:1rem}';
function doc(title, body, { origin = '', back = '' } = {}) {
  return `<!doctype html>\n<html lang="ja">\n<head>\n<meta charset="utf-8">\n<meta name="viewport" content="width=device-width, initial-scale=1">\n<title>${escapeHtml(title)}</title>\n<style>${DOC_CSS}</style>\n</head>\n<body>\n${back ? `<nav><a href="${escapeHtml(back)}">一覧へ</a></nav>\n` : ''}${body}\n${origin ? `<p class="meta">元のサイト: ${escapeHtml(origin)}（Utsushi で保存）</p>\n` : ''}</body>\n</html>\n`;
}
function itemDoc(site, item, ctx, opts = {}) {
  const meta = [item.publishedAt ? jst(item.publishedAt) : '', (item.categories || []).join('、')].filter(Boolean).join('　');
  const head = `<h1>${escapeHtml(item.title || (item.rows ? 'ページ' : '無題'))}</h1>\n${meta ? `<p class="meta">${escapeHtml(meta)}</p>\n` : ''}`;
  return doc(item.title || site.title, head + itemHtml(item, ctx), { origin: item.url || (site.origin + item.path), back: opts.back });
}

/* ------------------------------------------------------------------ one item (free) */
export function saveOne(site, item, kind) {
  const ctx = { mode: 'archive', origin: site.origin };
  const stem = fileStem(item);
  if (kind === 'html') return { name: `${stem}.html`, data: itemDoc(site, item, ctx), type: 'text/html' };
  if (kind === 'md') {
    const fm = frontMatter({ title: item.title, date: item.publishedAt || item.createdAt, categories: item.categories, ameba_ownd_url: item.url || (site.origin + item.path) });
    return { name: `${stem}.md`, data: fm + htmlToMarkdown(itemHtml(item, { mode: 'export', origin: site.origin })), type: 'text/markdown' };
  }
  const text = `${item.title || ''}\n${item.publishedAt ? jst(item.publishedAt) + '\n' : ''}\n${htmlToText(itemHtml(item, ctx))}\n`;
  return { name: `${stem}.txt`, data: text, type: 'text/plain' };
}

export function imageListCsv(site) {
  const rows = [['url', 'file', 'used_in', 'title']];
  for (const im of collectImages(site)) rows.push([im.url, im.name, im.owner ? (im.owner.url || site.origin + im.owner.path) : '(site)', im.owner ? im.owner.title : '']);
  return csv(rows);
}

/** The free WordPress file: the newest 30 posts and the first 3 pages (the home page first). */
export function freeWxr(site) {
  const posts = sortedPosts(site).slice(0, FREE_POSTS);
  const pages = sortedPages(site).slice(0, FREE_PAGES);
  return { ...buildWxr(site, { posts, pages, images: 'attach' }), whole: posts.length === site.posts.size && pages.length === site.pages.size };
}

/* ------------------------------------------------------------------ the whole site (Pro) */
const README = (site, counts, images, parts) => `Utsushi で保存した Ameba Ownd のサイト
サイト: ${site.title || ''}（${site.origin || ''}）
保存した日: ${jst(new Date().toISOString())}
記事 ${counts.posts} 件、ページ ${counts.pages} 件、画像 ${images} 点${parts ? `（画像は ${parts} 個の ZIP）` : ''}

中身
- wordpress.xml: WordPress の「ツール」>「インポート」>「WordPress」で読み込むファイルです。「添付ファイルをダウンロードしてインポートする」にチェックを入れると、画像を Ameba Ownd から取り込みます（2026年12月24日 11:00 まで。Ameba Ownd が閉じると取り込めません）。
- wordpress-local-images.xml: 画像を自分でアップロードする場合のファイルです。images フォルダの中身を、WordPress の wp-content/uploads/ameba-ownd/ にアップロードしてから読み込みます。
- markdown/: 記事とページを Markdown で。Hugo、Astro、Ghost などに。
- offline/index.html: インターネットなしで開けるサイトの写しです。images フォルダを offline と同じ場所に置くと画像も表示されます。
- htaccess.txt と redirects.csv: 独自ドメインを WordPress に移す人向けの転送設定です。
- images.csv: すべての画像のアドレスと、使われている記事。
- site.json: 読み込んだデータそのもの（記事とページのブロック）。

手順の説明: https://peakappsstudio.com/ameba-ownd-export/wordpress-iko/
Utsushi は Peak Apps Studio が作った独立したツールで、Ameba Ownd（株式会社サイバーエージェント）とは関係ありません。
`;

function siteJson(site) {
  return JSON.stringify({ origin: site.origin, title: site.title, tagline: site.tagline, homePageId: site.homePageId, navigations: site.navigations,
    posts: sortedPosts(site), pages: sortedPages(site) }, null, 1);
}

/** Every file of the package except the images. Returns a map name -> Uint8Array (fflate's input). */
export function packFiles(site) {
  const posts = sortedPosts(site);
  const pages = sortedPages(site);
  const files = {};
  const put = (name, text) => { files[name] = strToU8(text); };
  const attach = buildWxr(site, { posts, pages, images: 'attach' });
  put('wordpress.xml', attach.xml);
  put('wordpress-local-images.xml', buildWxr(site, { posts, pages, images: 'local' }).xml);
  put('htaccess.txt', htaccess(site, { pages }));
  put('redirects.csv', redirectCsv(site, { posts, pages }));
  put('images.csv', imageListCsv(site));
  put('site.json', siteJson(site));
  const offlineImg = u => (isCdnImage(u) ? `../images/${bareImage(u).split('/').pop()}` : u);
  const ctx = { mode: 'archive', origin: site.origin, image: offlineImg };
  const rows = [];
  for (const p of pages) {
    const f = `${slugFor(p, 'page')}.html`;
    put(`offline/pages/${f}`, itemDoc(site, p, { ...ctx, image: u => (offlineImg(u).startsWith('../') ? '../' + offlineImg(u) : u) }, { back: '../index.html' }));
    put(`markdown/pages/${slugFor(p, 'page')}.md`, frontMatter({ title: p.title, date: p.createdAt, ameba_ownd_url: site.origin + p.path }) + htmlToMarkdown(itemHtml(p, { mode: 'export', origin: site.origin })));
    rows.push(`<li><a href="pages/${escapeHtml(f)}">${escapeHtml(p.title || 'ページ')}</a></li>`);
  }
  const postRows = [];
  for (const p of posts) {
    const f = `${p.id}.html`;
    put(`offline/posts/${f}`, itemDoc(site, p, { ...ctx, image: u => (offlineImg(u).startsWith('../') ? '../' + offlineImg(u) : u) }, { back: '../index.html' }));
    put(`markdown/posts/${p.id}.md`, frontMatter({ title: p.title, date: p.publishedAt, categories: p.categories, ameba_ownd_url: p.url || site.origin + p.path }) + htmlToMarkdown(itemHtml(p, { mode: 'export', origin: site.origin })));
    postRows.push(`<li><a href="posts/${f}">${escapeHtml(p.title || '無題')}</a> <span class="meta">${escapeHtml(jst(p.publishedAt))}</span></li>`);
  }
  put('offline/index.html', doc(site.title || 'Ameba Ownd', `<h1>${escapeHtml(site.title || 'Ameba Ownd')}</h1>\n${site.tagline ? `<p>${escapeHtml(site.tagline)}</p>\n` : ''}${rows.length ? `<h2>ページ</h2>\n<ul>\n${rows.join('\n')}\n</ul>\n` : ''}${postRows.length ? `<h2>記事（${postRows.length} 件）</h2>\n<ul>\n${postRows.join('\n')}\n</ul>\n` : ''}`, { origin: site.origin }));
  return { files, counts: attach.counts };
}

export function readme(site, counts, images, parts) { return README(site, counts, images, parts); }

/**
 * Copies every image from Ameba Ownd's image server (it answers any origin). onImage(name, bytes) receives each one;
 * returns { ok, failed: [{url, why}] }. 4 at a time; stop with signal.
 */
export async function fetchImages(list, { onImage, onProgress, signal, fetchImpl = fetch, concurrency = 4 } = {}) {
  let i = 0, ok = 0;
  const failed = [];
  const worker = async () => {
    while (i < list.length) {
      if (signal && signal.aborted) return;
      const im = list[i++];
      try {
        const r = await fetchImpl(im.url, { mode: 'cors', credentials: 'omit', signal });
        if (!r.ok) throw new Error(`HTTP ${r.status}`);
        const buf = new Uint8Array(await r.arrayBuffer());
        if (!buf.length) throw new Error('empty');
        await onImage(im.name, buf, im);
        ok++;
      } catch (e) {
        if (signal && signal.aborted) return;
        failed.push({ url: im.url, why: String(e && e.message || e).slice(0, 80) });
      }
      if (onProgress) onProgress(ok + failed.length, list.length);
    }
  };
  await Promise.all(Array.from({ length: Math.min(concurrency, list.length || 1) }, worker));
  return { ok, failed };
}

// images into ZIP parts of at most PART_BYTES each (stored, not compressed: JPEG and PNG do not shrink)
export function imageZipper(onPart, limit = PART_BYTES) {
  let cur = {}, size = 0, n = 0;
  const flush = async () => {
    if (!Object.keys(cur).length) return;
    n++;
    const bytes = zipSync(cur, { level: 0 });
    cur = {}; size = 0;
    await onPart(n, bytes);
  };
  // the images arrive four at a time: each one waits for the one before it, so a part is never written twice or skipped
  let chain = Promise.resolve();
  const addOne = async (name, bytes) => { if (size + bytes.length > limit && size > 0) await flush(); cur[`images/${name}`] = [bytes, { level: 0 }]; size += bytes.length; };
  return {
    add(name, bytes) { chain = chain.then(() => addOne(name, bytes)); return chain; },
    async end() { await chain; await flush(); return n; },
  };
}

export function zipPack(files) { return zipSync(files, { level: 6 }); }
