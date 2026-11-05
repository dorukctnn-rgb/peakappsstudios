// Utsushi: turns Ameba Ownd's blocks into HTML.
//  mode 'reader'  the page's reader: cleaned HTML, images only from Ameba Ownd's image server, notes for what cannot be shown
//  mode 'export'  WordPress and Markdown: cleaned HTML with absolute links; a video or a YouTube/Vimeo/X link on its own line (WordPress
//                 turns that into the player); a custom HTML block exactly as the owner wrote it; notes as HTML comments
//  mode 'archive' the offline copy in the Pro package: like export, but custom HTML is cleaned too (the file opens on the owner's computer)
import { sanitizeHtml, escapeHtml, safeUrl, bareImage, decodeEntities, isCdnImage } from './sanitize.js';

const EMBED = /^https:\/\/((www|m)\.youtube\.com\/(watch\?v=|shorts\/|embed\/)|youtu\.be\/|(www\.)?vimeo\.com\/\d|(www\.)?(twitter|x)\.com\/[^/]+\/status\/|(www\.)?instagram\.com\/(p|reel)\/|open\.spotify\.com\/|soundcloud\.com\/)/i;

export function absoluteUrl(u, origin) {
  const s = String(u || '');
  if (!origin || /^(https?:|mailto:|tel:|data:|blob:|#)/i.test(s)) return s;
  try { return new URL(s.replace(/^\.\//, '/'), origin + '/').href; } catch (e) { return s; }
}

function note(text, ctx) {
  if (ctx.mode === 'reader') return `<p class="ut-gone">${escapeHtml(text)}</p>`;
  return `<!-- Ameba Ownd: ${escapeHtml(text).replace(/--/g, '- -')} -->`;
}

function imageTag(url, ctx, { width, height, alt = '' } = {}) {
  const bare = bareImage(url);
  const src = safeUrl(ctx.image ? ctx.image(bare) : bare, { image: true });
  if (!src) return '';
  if (ctx.mode === 'reader' && !isCdnImage(src) && !/^(blob:|data:)/i.test(src)) return note('外部の画像（表示しません）', ctx);
  const wh = (/^\d+$/.test(String(width)) ? ` width="${width}"` : '') + (/^\d+$/.test(String(height)) ? ` height="${height}"` : '');
  const lazy = ctx.mode === 'reader' ? ' loading="lazy" decoding="async"' : '';
  return `<img src="${escapeHtml(src)}" alt="${escapeHtml(alt)}"${wh}${lazy}>`;
}

export function blockToHtml(b, ctx) {
  const abs = u => absoluteUrl(u, ctx.origin);
  const san = h => sanitizeHtml(h, { images: ctx.mode === 'reader' ? 'cdn' : 'keep', absolute: abs, rewriteImage: ctx.image ? (u => ctx.image(bareImage(u))) : (u => bareImage(u)) });
  switch (b.type) {
    case 'text': return san(b.value);
    case 'title': return b.value ? `<h2>${escapeHtml(decodeEntities(b.value))}</h2>` : '';
    case 'divider': return '<hr>';
    case 'image': {
      const img = imageTag(b.url, ctx, b);
      if (!img || img.startsWith('<p') || img.startsWith('<!--')) return img;
      const link = safeUrl(b.link);
      const inner = link ? `<a href="${escapeHtml(abs(link))}"${b.target === '_blank' ? ' target="_blank" rel="noopener"' : ''}>${img}</a>` : img;
      const align = /^(left|right|center)$/.test(b.align) ? ` style="text-align:${b.align}"` : '';
      return `<figure${align}>${inner}</figure>`;
    }
    case 'video': {
      const u = safeUrl(b.url);
      if (!u) return note('動画（アドレスなし）', ctx);
      return ctx.mode === 'reader' ? `<p class="ut-embed">動画: <a href="${escapeHtml(u)}" target="_blank" rel="noopener">${escapeHtml(u)}</a></p>` : `<p>${escapeHtml(u)}</p>`;
    }
    case 'quote': {
      const u = safeUrl(b.url || (b.json && b.json.url));
      if (!u) return '';
      const j = b.json || {};
      if (ctx.mode !== 'reader' && EMBED.test(u)) return `<p>${escapeHtml(u)}</p>`;
      const title = decodeEntities(j.title || u);
      const desc = j.description ? `<br><span>${escapeHtml(decodeEntities(j.description))}</span>` : '';
      const prov = j.provider ? ` <small>${escapeHtml(decodeEntities(j.provider))}</small>` : '';
      return `<blockquote class="ut-link"><p><a href="${escapeHtml(u)}" target="_blank" rel="noopener">${escapeHtml(title)}</a>${prov}${desc}</p></blockquote>`;
    }
    case 'html': {
      const src = String(b.source || b.value || '');
      if (!src.trim()) return '';
      if (ctx.mode === 'export') return `\n<!-- Ameba Ownd: HTML ブロック（そのまま） -->\n${src}\n<!-- /HTML ブロック -->\n`;
      return `<div class="ut-html">${san(src)}</div>`;
    }
    case 'button': {
      const u = safeUrl(b.url);
      if (!u) return b.title ? `<p>${escapeHtml(b.title)}</p>` : '';
      const align = /^(left|right|center)$/.test(b.align) ? ` style="text-align:${b.align}"` : '';
      return `<p${align}><a class="ut-button" href="${escapeHtml(abs(u))}"${b.target === '_blank' ? ' target="_blank" rel="noopener"' : ''}>${escapeHtml(b.title || u)}</a></p>`;
    }
    case 'map': {
      const place = [b.storeName, b.buildingName].filter(Boolean).join(' ');
      const addr = String(b.address || '');
      const q = addr || (b.latLng && b.latLng.lat != null ? `${b.latLng.lat},${b.latLng.lng}` : '');
      if (!q) return note('地図', ctx);
      const link = `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(q)}`;
      return `<p class="ut-map">${place ? `${escapeHtml(place)}<br>` : ''}${escapeHtml(addr || q)}<br><a href="${escapeHtml(link)}" target="_blank" rel="noopener">Google マップで開く</a></p>`;
    }
    case 'post': return note(`ブログ記事の一覧${b.title ? `「${b.title}」` : ''}（WordPress では記事一覧ページやブロックで作り直します）`, ctx);
    case 'instagramAlbum': return note(`Instagram の写真一覧${b.screenName ? `（@${b.screenName}）` : ''}`, ctx);
    case 'facebookAlbum': return note('Facebook の写真一覧', ctx);
    case 'twitter': return note(`X（Twitter）のタイムライン${b.screenName ? `（@${b.screenName}）` : ''}`, ctx);
    case 'facebook': return note('Facebook のタイムライン', ctx);
    case 'news': return note('お知らせの一覧', ctx);
    case 'shop': case 'shopItem': case 'shopItemQuote': return note('ショップの商品（BASE で引き続き表示できます）', ctx);
    case 'reblog': return note('リブログした記事', ctx);
    default: return note(`この部品（${String(b.type).slice(0, 40)}）は移せません`, ctx);
  }
}

export function blocksToHtml(blocks, ctx) {
  return (blocks || []).map(b => blockToHtml(b, ctx)).filter(Boolean).join('\n');
}

export function pageToHtml(page, ctx) {
  const parts = [];
  for (const cols of page.rows) {
    if (cols.length === 1) { const h = blocksToHtml(cols[0], ctx); if (h) parts.push(h); continue; }
    const inner = cols.map(c => `<div class="ut-col">${blocksToHtml(c, ctx)}</div>`).join('');
    parts.push(`<div class="ut-cols ut-cols-${Math.min(cols.length, 4)}">${inner}</div>`);
  }
  return parts.join('\n');
}

export function postToHtml(post, ctx) {
  if (post.blocks) return blocksToHtml(post.blocks, ctx);
  const abs = u => absoluteUrl(u, ctx.origin);
  return sanitizeHtml(post.html, { images: ctx.mode === 'reader' ? 'cdn' : 'keep', absolute: abs, rewriteImage: ctx.image ? (u => ctx.image(bareImage(u))) : (u => bareImage(u)) });
}

export function itemHtml(item, ctx) { return item.rows ? pageToHtml(item, ctx) : postToHtml(item, ctx); }
