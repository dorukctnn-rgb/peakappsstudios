// Rehoused engine: open a Weebly site archive (the ZIP from Settings > General > Archive), read every page, and write a
// clean static site that works without Weebly: the same page file names, the pictures and files that are in the archive,
// slideshows and galleries as plain image grids, no Weebly scripts, no trackers, links made relative. Also a report of
// what the archive could not bring (missing pictures, blog and store pages, contact forms).
// Pure functions, no DOM and no network: it runs in the page's worker and in Node (unit tests).
import { unzipSync, zipSync, strToU8 } from '../vendor/fflate.js';
import { parseHtml, isEl, hasClass, classes, findAll, find, textOf, cleanText, walk } from './html.js';
import { escHtml, stamp, DEFAULTS, safeAccent } from './util.js';
export { escHtml, stamp, DEFAULTS, safeAccent };

export const MAX_FILE = 1900 * 1024 * 1024;
export class OpenError extends Error {
  constructor(code, detail = '') { super(detail || code); this.code = code; }
}

const utf8 = new TextDecoder('utf-8');
const decode = bytes => utf8.decode(bytes).replace(/^﻿/, '');

const IMG_EXT = /\.(jpe?g|png|gif|webp|svg|bmp|ico|avif)$/i;
const PAGE_EXT = /\.html?$/i;
const MIME = { jpg: 'image/jpeg', jpeg: 'image/jpeg', png: 'image/png', gif: 'image/gif', webp: 'image/webp', svg: 'image/svg+xml', bmp: 'image/bmp', ico: 'image/x-icon', avif: 'image/avif', pdf: 'application/pdf', mp3: 'audio/mpeg', mp4: 'video/mp4' };
export const mimeOf = p => MIME[(p.split('.').pop() || '').toLowerCase()] || 'application/octet-stream';

/* ---------------- paths ---------------- */
const dirOf = p => (p.includes('/') ? p.slice(0, p.lastIndexOf('/') + 1) : '');
function normPath(p) {
  const out = [];
  for (const part of p.split('/')) {
    if (!part || part === '.') continue;
    if (part === '..') { out.pop(); continue; }
    out.push(part);
  }
  return out.join('/');
}
/** relative link from the page at `from` to the site path `to` (both relative to the site root) */
export function relPath(from, to) {
  const a = dirOf(from).split('/').filter(Boolean);
  const b = to.split('/');
  let i = 0;
  while (i < a.length && i < b.length - 1 && a[i] === b[i]) i++;
  return '../'.repeat(a.length - i) + b.slice(i).join('/');
}
const safeDecodeUri = s => { try { return decodeURIComponent(s); } catch { return s; } };

/* ---------------- opening the ZIP ---------------- */
function unzip(bytes) {
  try { return unzipSync(bytes); } catch (e) { throw new OpenError('not-zip', String(e && e.message || e)); }
}
const isJunk = p => /(^|\/)(__MACOSX|\.DS_Store|Thumbs\.db|desktop\.ini)(\/|$)/i.test(p);

/** Find the site folders in a ZIP: a folder with an index.html (the shallowest), or with the most pages. */
function sitesIn(entries) {
  const paths = Object.keys(entries).filter(p => !isJunk(p) && !p.endsWith('/'));
  const pages = paths.filter(p => PAGE_EXT.test(p));
  if (!pages.length) return [];
  const indexDirs = pages.filter(p => /(^|\/)index\.html?$/i.test(p)).map(dirOf).sort((x, y) => x.split('/').length - y.split('/').length || x.length - y.length);
  let root;
  if (indexDirs.length) root = indexDirs[0];
  else {
    const counts = {};
    for (const p of pages) counts[dirOf(p)] = (counts[dirOf(p)] || 0) + 1;
    root = Object.entries(counts).sort((x, y) => y[1] - x[1] || x[0].length - y[0].length)[0][0];
  }
  const files = new Map();
  for (const p of paths) if (p.startsWith(root)) files.set(p.slice(root.length), entries[p]);
  return [{ root, files }];
}

/**
 * Open a ZIP and return the Weebly site(s) in it: [{ key, root, files: Map<path, Uint8Array> }].
 * A "Download My Data" package may hold site archives as ZIPs inside the ZIP; those are opened one level deep.
 */
export function openArchive(bytes) {
  if (!bytes || !bytes.length) throw new OpenError('empty');
  if (bytes.length > MAX_FILE) throw new OpenError('too-big');
  if (!(bytes[0] === 0x50 && bytes[1] === 0x4b)) {
    const head = decode(bytes.subarray(0, Math.min(bytes.length, 2048))).toLowerCase();
    if (head.includes('<html') || head.includes('<!doctype')) throw new OpenError('single-page');
    throw new OpenError('not-zip');
  }
  const entries = unzip(bytes);
  let sites = sitesIn(entries);
  if (!sites.length) {
    const inner = Object.keys(entries).filter(p => /\.zip$/i.test(p) && !isJunk(p));
    for (const z of inner) {
      let sub;
      try { sub = unzipSync(entries[z]); } catch { continue; }
      for (const s of sitesIn(sub)) sites.push({ ...s, root: `${z}/${s.root}` });
    }
  }
  if (!sites.length) throw new OpenError('no-pages', Object.keys(entries).slice(0, 12).join(', '));
  return sites.map((s, i) => ({ key: String(i), ...s }));
}

/* ---------------- reading a page ---------------- */
const TRACKERS = /(google-analytics\.com|googletagmanager\.com|gtag\(|ga\('create'|connect\.facebook\.net|fbq\(|hotjar|clarity\.ms|snap\.licdn|static\.ads-twitter|quantserve|statcounter)/i;
const WEEBLY_SCRIPT = /(editmysite\.com|weebly\.com|_W\.|wSlideshow|initPublishedFlyoutMenus|IS_ARCHIVE|STATIC_BASE|templateArtifacts|main-customer-accounts|stl\.js|footerSignup)/i;

/** The images of a wSlideshow.render({ elementID: "...", images: [...] }) call, by element id */
export function slideshowsIn(scriptText) {
  const out = {};
  const re = /wSlideshow\.render\s*\(\s*\{/g;
  let m;
  while ((m = re.exec(scriptText))) {
    const start = m.index + m[0].length - 1;
    const obj = matchBracket(scriptText, start);
    if (!obj) continue;
    const id = /elementID\s*:\s*["']?([\w-]+)/.exec(obj);
    const at = /\bimages\s*:\s*\[/.exec(obj);
    if (!id || !at) continue;
    const arr = matchBracket(obj, at.index + at[0].length - 1);
    let list = [];
    try { list = JSON.parse(arr); } catch {
      const r2 = /"?url"?\s*:\s*"((?:[^"\\]|\\.)*)"(?:[^{}]*?"?caption"?\s*:\s*"((?:[^"\\]|\\.)*)")?/g;
      let k;
      while ((k = r2.exec(arr || ''))) list.push({ url: k[1].replace(/\\\//g, '/'), caption: (k[2] || '').replace(/\\\//g, '/') });
    }
    out[id[1]] = (Array.isArray(list) ? list : []).filter(x => x && typeof x.url === 'string').map(x => ({ url: x.url, caption: typeof x.caption === 'string' ? x.caption : '' }));
  }
  return out;
}
function matchBracket(s, start) {
  const open = s[start];
  const close = open === '{' ? '}' : ']';
  let depth = 0;
  let q = null;
  for (let i = start; i < s.length; i++) {
    const c = s[i];
    if (q) { if (c === '\\') { i++; continue; } if (c === q) q = null; continue; }
    if (c === '"' || c === "'") { q = c; continue; }
    if (c === open) depth++;
    else if (c === close) { depth--; if (depth === 0) return s.slice(start, i + 1); }
  }
  return null;
}

function cssUrls(css) {
  const out = [];
  const re = /url\(\s*(['"]?)([^'")]+)\1\s*\)/gi;
  let m;
  while ((m = re.exec(css || ''))) out.push(m[2].trim());
  return out;
}

class Ctx {
  constructor(site, page) {
    this.site = site;
    this.page = page;
  }
  issue(kind, detail, ref = '') { this.site.issues.push({ page: this.page.file, kind, detail, ref }); }

  /** a picture or file reference → the site path of a file in the archive, or null */
  asset(ref) {
    if (!ref) return null;
    let r = String(ref).trim().replace(/\\\//g, '/');
    if (/^(data|blob|javascript|about):/i.test(r)) return null;
    r = r.split('#')[0].split('?')[0];
    let p;
    const abs = /^(?:https?:)?\/\/([^/]+)(\/[^]*)?$/i.exec(r);
    if (abs) {
      const host = abs[1].toLowerCase();
      const own = host.endsWith('editmysite.com') || host.endsWith('weebly.com') || host.endsWith('weeblysite.com') || this.site.hosts.has(host);
      if (!own) return null;
      p = normPath(safeDecodeUri(abs[2] || '/'));
    } else if (r.startsWith('/')) p = normPath(safeDecodeUri(r));
    else p = normPath(dirOf(this.page.file) + safeDecodeUri(r));
    return this.site.findFile(p);
  }
  /** a link → { href, kind: 'page' | 'file' | 'external' | 'missing' | 'anchor' | 'drop', path } */
  link(href) {
    const h = String(href || '').trim();
    if (!h) return { kind: 'drop' };
    if (h.startsWith('#')) return { kind: 'anchor', href: h };
    if (/^(javascript|vbscript|data):/i.test(h.replace(/\s+/g, ''))) return { kind: 'drop' };
    if (/^(mailto|tel|sms):/i.test(h)) return { kind: 'external', href: h };
    const abs = /^(?:https?:)?\/\/([^/?#]+)([^]*)$/i.exec(h);
    let p;
    let hash = '';
    if (abs) {
      const host = abs[1].toLowerCase().replace(/:\d+$/, '');
      const own = this.site.hosts.has(host) || host.endsWith('.weebly.com') || host.endsWith('.weeblysite.com');
      if (!own) return /^https?:/i.test(h) ? { kind: 'external', href: h } : { kind: 'external', href: `https:${h}` };
      const rest = abs[2] || '/';
      hash = rest.includes('#') ? rest.slice(rest.indexOf('#')) : '';
      p = normPath(safeDecodeUri(rest.split('#')[0].split('?')[0]));
    } else if (/^[a-z][a-z0-9+.-]*:/i.test(h)) {
      return { kind: 'drop' };
    } else {
      hash = h.includes('#') ? h.slice(h.indexOf('#')) : '';
      const bare = h.split('#')[0].split('?')[0];
      p = normPath(bare.startsWith('/') ? safeDecodeUri(bare) : dirOf(this.page.file) + safeDecodeUri(bare));
    }
    if (p === '' || p === 'index') p = 'index.html';
    const page = this.site.pageFor(p);
    if (page) return { kind: 'page', path: page, hash };
    const file = this.site.findFile(p);
    if (file) return { kind: 'file', path: file, hash };
    return { kind: 'missing', path: p, hash, href: h };
  }
}

const INLINE_KEEP = { b: 'strong', strong: 'strong', i: 'em', em: 'em', u: 'u', sup: 'sup', sub: 'sub', s: 's', strike: 's', del: 's', code: 'code', small: 'small', mark: 'mark', big: null, font: null, span: null, abbr: null, cite: 'em', q: null, label: null, tt: 'code', kbd: 'code', var: 'em', ins: 'u', time: null, nobr: null, center: null };
const BLOCK = new Set(['div', 'p', 'ul', 'ol', 'li', 'h1', 'h2', 'h3', 'h4', 'h5', 'h6', 'table', 'tbody', 'thead', 'tfoot', 'tr', 'td', 'th', 'blockquote', 'pre', 'hr', 'form', 'section', 'article', 'header', 'footer', 'nav', 'aside', 'figure', 'figcaption', 'iframe', 'object', 'embed', 'video', 'audio', 'dl', 'dt', 'dd', 'fieldset', 'address', 'main']);
const DROP = new Set(['script', 'style', 'noscript', 'link', 'meta', 'input', 'button', 'select', 'textarea', 'option', 'svg', 'canvas', 'template', 'map', 'area', 'param', 'source', 'base', 'head', 'title']);

/** Inline content → safe HTML (only tags from a short list, every attribute rebuilt by us) */
function inlineHtml(nodes, ctx) {
  let out = '';
  for (const n of nodes) {
    if (n.type === 'text') { if (!n.raw) out += escHtml(n.text); continue; }
    if (n.type !== 'el' || DROP.has(n.tag)) continue;
    if (n.tag === 'br') { out += '<br>'; continue; }
    if (n.tag === 'img') { out += imgTag(n, ctx); continue; }
    if (n.tag === 'a') {
      const inner = inlineHtml(n.children, ctx);
      const l = ctx.link(n.attrs.href);
      if (l.kind === 'drop' || !inner.replace(/<br>/g, '').trim()) { out += inner; continue; }
      // a link to a page or file the archive does not have: keep the words, drop the dead link, report it
      if (l.kind === 'missing') { noteLink(l, ctx); out += inner; continue; }
      out += `<a href="${escHtml(linkHref(l, ctx))}"${l.kind === 'external' && /^https?:/i.test(l.href) ? ' rel="noopener"' : ''}>${inner}</a>`;
      noteLink(l, ctx);
      continue;
    }
    const keep = INLINE_KEEP[n.tag];
    const inner = inlineHtml(n.children, ctx);
    if (keep && inner.trim()) out += `<${keep}>${inner}</${keep}>`;
    else out += inner;
  }
  return out;
}
function linkHref(l, ctx) {
  if (l.kind === 'page' || l.kind === 'file') { ctx.site.used.add(l.path); return relPath(ctx.page.file, l.path) + (l.hash || ''); }
  if (l.kind === 'missing') return relPath(ctx.page.file, l.path) + (l.hash || '');
  return l.href;
}
function noteLink(l, ctx) {
  if (l.kind !== 'missing') return;
  const kind = PAGE_EXT.test(l.path) || !/\.[a-z0-9]{2,5}$/i.test(l.path) ? 'missing-page' : 'missing-file';
  const key = `${kind}|${l.path}`;
  if (ctx.page.seenLinks.has(key)) return;
  ctx.page.seenLinks.add(key);
  ctx.issue(kind, l.path, l.href);
}
/** a picture on another website (not Weebly's servers): kept as a link to that site, over https */
function remoteImage(ref) {
  const r = String(ref || '').trim();
  const m = /^(?:https?:)?\/\/([^/]+)\//i.exec(r);
  if (!m) return null;
  const host = m[1].toLowerCase();
  if (/(^|\.)(editmysite|weebly|weeblysite)\.com$/.test(host)) return null;
  return r.replace(/^(https?:)?\/\//i, 'https://');
}
/** Weebly's own interface pictures (file-type icons, buttons): not your content, left out without a word */
const weeblyChrome = ref => /^(?:https?:)?\/\/[^/]*(editmysite|weebly)\.com\/(?!uploads\/)/i.test(String(ref || '').trim());
function imgTag(n, ctx) {
  const ref = n.attrs.src || n.attrs['data-src'] || '';
  const p = ctx.asset(ref);
  if (!p) {
    const remote = remoteImage(ref);
    if (remote) { ctx.site.stats.remoteImages++; return `<img src="${escHtml(remote)}" alt="${escHtml(cleanText(n.attrs.alt || ''))}" loading="lazy">`; }
    if (ref && !/^data:/i.test(ref) && !weeblyChrome(ref)) missingImage(ctx, ref);
    return '';
  }
  ctx.site.used.add(p);
  ctx.page.images.add(p);
  return `<img src="${escHtml(relPath(ctx.page.file, p))}" alt="${escHtml(cleanText(n.attrs.alt || ''))}" loading="lazy">`;
}
function missingImage(ctx, ref) {
  const key = `img|${ref}`;
  if (ctx.page.seenLinks.has(key)) return;
  ctx.page.seenLinks.add(key);
  ctx.issue('missing-image', 'picture not in the archive', ref);
}
const isEmptyHtml = h => !h.replace(/<br>/g, '').replace(/&nbsp;| /g, '').trim();

function attrsWidth(n) {
  const m = /width\s*:\s*([\d.]+)%/i.exec(n.attrs.style || '');
  return m ? Math.max(5, Math.min(100, Number(m[1]))) : null;
}

/** Block-level content of a container → our blocks */
function blocksOf(node, ctx, out = []) {
  let buf = [];
  const flush = () => {
    if (!buf.length) return;
    const html = inlineHtml(buf, ctx).replace(/^(\s|<br>)+|(\s|<br>)+$/g, '');
    buf = [];
    if (!isEmptyHtml(html)) out.push({ t: 'p', html });
  };
  for (const n of node.children) {
    if (n.type === 'text') { if (!n.raw) buf.push(n); continue; }
    if (n.type !== 'el') continue;
    if (n.tag === 'script') { continue; }
    if (DROP.has(n.tag)) continue;
    const special = specialBlock(n, ctx);
    if (special) { flush(); if (special !== true) out.push(...[].concat(special)); continue; }
    if (!BLOCK.has(n.tag) && !hasBlockInside(n)) { buf.push(n); continue; }
    flush();
    blockElement(n, ctx, out);
  }
  flush();
  return out;
}
function hasBlockInside(n) {
  let hit = false;
  walk(n, x => { if (hit) return false; if (x !== n && x.type === 'el' && (BLOCK.has(x.tag) || isSpecial(x))) { hit = true; return false; } return true; });
  return hit;
}
const isSpecial = n => hasClass(n, 'wsite-image') || hasClass(n, 'wsite-multicol') || hasClass(n, 'imageGallery') || /-slideshow$/.test(n.attrs.id || '') || hasClass(n, 'wsite-button') || hasClass(n, 'wsite-social') || hasClass(n, 'wcustomhtml');

function blockElement(n, ctx, out) {
  const tag = n.tag;
  if (/^h[1-6]$/.test(tag)) {
    const html = inlineHtml(n.children, ctx).replace(/^(\s|<br>)+|(\s|<br>)+$/g, '');
    if (!isEmptyHtml(html)) out.push({ t: 'h', level: Math.min(4, Math.max(2, Number(tag[1]))), html });
    return;
  }
  if (tag === 'hr') { out.push({ t: 'hr' }); return; }
  if (tag === 'ul' || tag === 'ol') {
    const items = n.children.filter(c => isEl(c, 'li')).map(li => inlineHtml(li.children.filter(c => !(isEl(c, 'ul') || isEl(c, 'ol'))), ctx).trim()).filter(h => !isEmptyHtml(h));
    if (items.length) out.push({ t: 'list', ordered: tag === 'ol', items });
    return;
  }
  if (tag === 'blockquote') {
    const inner = blocksOf(n, ctx, []);
    if (inner.length) out.push({ t: 'quote', blocks: inner });
    return;
  }
  if (tag === 'pre') {
    const text = textOf(n);
    if (text.trim()) out.push({ t: 'pre', text });
    return;
  }
  if (tag === 'iframe' || tag === 'embed' || tag === 'object' || tag === 'video' || tag === 'audio') { const b = mediaBlock(n, ctx); if (b) out.push(b); return; }
  if (tag === 'form') { out.push(formBlock(n, ctx)); return; }
  if (tag === 'table') { tableBlock(n, ctx, out); return; }
  if (tag === 'li' || tag === 'dt' || tag === 'dd') {
    const html = inlineHtml(n.children, ctx).trim();
    if (!isEmptyHtml(html)) out.push({ t: 'p', html });
    return;
  }
  blocksOf(n, ctx, out);
}

function tableBlock(n, ctx, out) {
  const rows = findAll(n, x => x.tag === 'tr' && closestTable(x) === n);
  const grid = rows.map(r => r.children.filter(c => isEl(c, 'td') || isEl(c, 'th')).map(c => {
    if (hasBlockInside(c) && findAll(c, x => isSpecial(x) || x.tag === 'img').length) return { blocks: blocksOf(c, ctx, []) };
    return { html: inlineHtml(c.children, ctx).trim(), head: c.tag === 'th' };
  })).filter(r => r.length);
  if (!grid.length) return;
  // a one-column or layout table: just its content
  if (grid.every(r => r.length === 1)) { for (const r of grid) out.push(...(r[0].blocks || (isEmptyHtml(r[0].html) ? [] : [{ t: 'p', html: r[0].html }]))); return; }
  if (grid.some(r => r.some(c => c.blocks))) { out.push({ t: 'cols', cols: grid[0].map(c => c.blocks || [{ t: 'p', html: c.html }]), widths: [] }); for (const r of grid.slice(1)) out.push({ t: 'cols', cols: r.map(c => c.blocks || [{ t: 'p', html: c.html }]), widths: [] }); return; }
  out.push({ t: 'table', rows: grid.map(r => r.map(c => ({ html: c.html, head: !!c.head }))) });
}
const closestTable = n => { let p = n.parent; while (p && p.tag !== 'table') p = p.parent; return p; };

function mediaBlock(n, ctx) {
  const src = n.attrs.src || n.attrs.data || '';
  const flash = n.tag === 'object' || n.tag === 'embed' ? JSON.stringify(n.attrs) + findAll(n, x => x.tag === 'param').map(x => x.attrs.value || '').join(' ') : '';
  const mp3 = /([^"'\s=&]+\.mp3)/i.exec(flash || '');
  if (mp3) {
    const p = ctx.asset(safeDecodeUri(mp3[1]));
    if (p) { ctx.site.used.add(p); return { t: 'audio', src: p, name: p.split('/').pop() }; }
    ctx.issue('missing-file', 'audio not in the archive', mp3[1]);
    return null;
  }
  if (n.tag === 'video' || n.tag === 'audio') {
    const s = src || (find(n, x => x.tag === 'source') || { attrs: {} }).attrs.src;
    const p = ctx.asset(s);
    if (p) { ctx.site.used.add(p); return { t: n.tag, src: p, name: p.split('/').pop() }; }
    return null;
  }
  if (/swf/i.test(src) || /swf/i.test(flash)) { ctx.issue('flash', 'Flash element left out (no browser plays Flash)', src); return null; }
  return embedFrom(src, ctx);
}
function embedFrom(src, ctx) {
  let u = String(src || '').trim();
  if (!u) return null;
  if (u.startsWith('//')) u = `https:${u}`;
  if (!/^https?:\/\//i.test(u)) { ctx.issue('custom-code', 'embedded frame with a local address left out', src); return null; }
  u = u.replace(/^http:/i, 'https:');
  const host = (/^https:\/\/([^/]+)/i.exec(u) || [])[1] || '';
  if (/editmysite\.com|weebly\.com/i.test(host)) { ctx.issue('weebly-only', /generateMap/i.test(u) ? 'Weebly map left out: it only works on Weebly' : 'Weebly element left out: it only works on Weebly', src); return null; }
  const kind = /youtube(-nocookie)?\.com|youtu\.be|vimeo\.com/i.test(host) ? 'video' : /google\.[a-z.]+$/i.test(host) && /maps/i.test(u) ? 'map' : 'frame';
  ctx.page.embeds++;
  return { t: 'embed', kind, src: u };
}

function formBlock(n, ctx) {
  const labels = findAll(n, x => hasClass(x, 'wsite-form-label') || x.tag === 'label').map(x => cleanText(textOf(x)).replace(/\*$/, '').trim()).filter(Boolean);
  const fields = [...new Set(labels)].slice(0, 12);
  ctx.page.forms++;
  ctx.issue('form', fields.length ? `contact form (${fields.join(', ')})` : 'contact form', '');
  return { t: 'form', fields };
}

/** Weebly's own elements: images, slideshows, galleries, columns, buttons, social links, custom code */
function specialBlock(n, ctx) {
  const id = n.attrs.id || '';
  if (hasClass(n, 'wsite-image') || (hasClass(n, 'wsite-image-border-none') && find(n, x => x.tag === 'img'))) return imageBlock(n, ctx);
  const sm = /^(\d+)-slideshow$/.exec(id) || (hasClass(n, 'wslide') && /^(\d+)/.exec(id));
  if (sm) {
    const list = ctx.page.slides[sm[1]];
    let items = [];
    if (list && list.length) {
      for (const it of list) {
        const ref = /^(https?:)?\/\//i.test(it.url) || it.url.startsWith('/') || /(^|\/)uploads\//.test(it.url) ? it.url : `/uploads/${it.url}`;
        const p = ctx.asset(ref);
        if (p) { ctx.site.used.add(p); ctx.page.images.add(p); items.push({ src: p, caption: cleanText(it.caption), alt: cleanText(it.caption) }); } else missingImage(ctx, it.url);
      }
    } else items = imagesInside(n, ctx);
    ctx.page.slideshows++;
    return items.length ? { t: 'gallery', items, from: 'slideshow' } : true;
  }
  if (hasClass(n, 'imageGallery') || hasClass(n, 'wsite-imageGallery') || /-gallery$/.test(id)) {
    const items = [];
    for (const holder of findAll(n, x => hasClass(x, 'galleryImageHolder'))) {
      const img = find(holder, x => x.tag === 'img');
      const a = find(holder, x => x.tag === 'a' && x.attrs.href);
      const full = a ? ctx.asset(a.attrs.href) : null;
      const thumb = img ? ctx.asset(img.attrs.src || img.attrs['data-src']) : null;
      const src = full || thumb;
      const cap = cleanText(textOf(find(holder, x => hasClass(x, 'galleryCaptionInnerText')) || { type: 'text', text: '' }));
      if (src) { ctx.site.used.add(src); ctx.page.images.add(src); items.push({ src, caption: cap, alt: cleanText(img && img.attrs.alt) || cap }); } else if (img) missingImage(ctx, img.attrs.src || '');
    }
    const list = items.length ? items : imagesInside(n, ctx);
    ctx.page.galleries++;
    return list.length ? { t: 'gallery', items: list, from: 'gallery' } : true;
  }
  if (hasClass(n, 'wsite-multicol')) {
    const table = find(n, x => x.tag === 'table');
    if (!table) return blocksOf(n, ctx, []);
    const row = find(table, x => x.tag === 'tr');
    const tds = row ? row.children.filter(c => isEl(c, 'td')) : [];
    const cols = tds.map(td => blocksOf(td, ctx, []));
    const widths = tds.map(attrsWidth);
    const nonEmpty = cols.filter(c => c.length);
    if (nonEmpty.length <= 1) return nonEmpty[0] || true;
    return { t: 'cols', cols, widths };
  }
  if (n.tag === 'a' && hasClass(n, 'wsite-button')) return buttonBlock(n, ctx) || true;
  if (hasClass(n, 'wsite-social')) {
    const links = findAll(n, x => x.tag === 'a' && x.attrs.href).map(a => {
      const net = (classes(a).find(c => /^wsite-social-(?!item)/.test(c)) || '').replace('wsite-social-', '');
      const l = ctx.link(a.attrs.href);
      return l.kind === 'external' ? { href: l.href, label: SOCIAL[net] || net || hostLabel(l.href) } : null;
    }).filter(Boolean);
    return links.length ? { t: 'social', links } : true;
  }
  if (hasClass(n, 'wcustomhtml')) {
    ctx.issue('custom-code', 'custom code element: check it on the new page', '');
    const inner = blocksOf(n, ctx, []);
    return inner.length ? inner : true;
  }
  if (hasClass(n, 'wsite-spacer')) return true;
  if (hasClass(n, 'styled-hr') || (n.tag === 'div' && hasClass(n, 'wsite-divider'))) return { t: 'hr' };
  if (hasClass(n, 'wsite-form-container') || (n.tag === 'div' && find(n, x => x.tag === 'form') && hasClassPrefixAny(n, 'wsite-form'))) {
    const form = find(n, x => x.tag === 'form') || n;
    return formBlock(form, ctx);
  }
  if (hasClass(n, 'wsite-youtube') || hasClass(n, 'wsite-map') || hasClass(n, 'wsite-video')) {
    const fr = find(n, x => x.tag === 'iframe' || x.tag === 'embed' || x.tag === 'object');
    return fr ? mediaBlock(fr, ctx) || true : true;
  }
  return null;
}
const hasClassPrefixAny = (n, p) => classes(n).some(c => c.startsWith(p));
const SOCIAL = { facebook: 'Facebook', twitter: 'X (Twitter)', linkedin: 'LinkedIn', instagram: 'Instagram', pinterest: 'Pinterest', youtube: 'YouTube', mail: 'Email', plus: 'Google+', flickr: 'Flickr', vimeo: 'Vimeo', tumblr: 'Tumblr', yelp: 'Yelp', rss: 'RSS', etsy: 'Etsy', tiktok: 'TikTok' };
const hostLabel = h => { const m = /^(?:https?:)?\/\/(?:www\.)?([^/]+)/i.exec(h); return m ? m[1] : h.replace(/^mailto:/, ''); };

function imagesInside(n, ctx) {
  const items = [];
  for (const img of findAll(n, x => x.tag === 'img')) {
    const p = ctx.asset(img.attrs.src || img.attrs['data-src']);
    if (p) { ctx.site.used.add(p); ctx.page.images.add(p); items.push({ src: p, caption: '', alt: cleanText(img.attrs.alt) }); } else if (img.attrs.src && !weeblyChrome(img.attrs.src) && !remoteImage(img.attrs.src)) missingImage(ctx, img.attrs.src);
  }
  return items;
}
function imageBlock(n, ctx) {
  const img = find(n, x => x.tag === 'img');
  if (!img) return true;
  const ref = img.attrs.src || img.attrs['data-src'] || '';
  let p = ctx.asset(ref);
  const a = find(n, x => x.tag === 'a' && x.attrs.href);
  let href = null;
  if (a) {
    const l = ctx.link(a.attrs.href);
    if (l.kind === 'file' && IMG_EXT.test(l.path)) { if (!p) p = l.path; else ctx.site.used.add(l.path); href = l.path === p ? null : { kind: 'file', path: l.path }; }
    else if (l.kind === 'missing') noteLink(l, ctx);
    else if (l.kind !== 'drop' && l.kind !== 'anchor') href = l;
  }
  if (!p) {
    const remote = remoteImage(ref);
    if (remote) { ctx.site.stats.remoteImages++; return { t: 'img', remote, src: null, alt: cleanText(img.attrs.alt), caption: '', href: href ? linkHref(href, ctx) : null, external: !!(href && href.kind === 'external'), align: 'center' }; }
    if (!weeblyChrome(ref)) missingImage(ctx, ref);
    return true;
  }
  ctx.site.used.add(p);
  ctx.page.images.add(p);
  const capNode = findAll(n, x => x.tag === 'div' && !find(x, y => y.tag === 'img') && cleanText(textOf(x)))[0];
  const caption = capNode ? cleanText(textOf(capNode)) : '';
  const rawAlt = cleanText(img.attrs.alt);
  const style = (n.attrs.style || '') + ' ' + ((n.parent && n.parent.attrs && n.parent.attrs.style) || '');
  const align = /text-align\s*:\s*(left|right|center)/i.exec(style);
  if (href) noteLink(href, ctx);
  return { t: 'img', src: p, alt: rawAlt && rawAlt !== 'Picture' ? rawAlt : caption || rawAlt, caption, href: href ? linkHref(href, ctx) : null, external: !!(href && href.kind === 'external'), align: align ? align[1].toLowerCase() : 'center' };
}
function buttonBlock(a, ctx) {
  const text = cleanText(textOf(a));
  const l = ctx.link(a.attrs.href);
  if (!text) return null;
  if (l.kind === 'drop') return { t: 'p', html: escHtml(text) };
  // a button to a page the archive does not have (often the blog or the store) is left out and reported
  if (l.kind === 'missing') { noteLink(l, ctx); return null; }
  return { t: 'button', text, href: linkHref(l, ctx), external: l.kind === 'external' };
}

/* ---------------- the whole site ---------------- */
function pageTitleFrom(titleTag, siteTitle) {
  const t = cleanText(titleTag);
  if (!t) return '';
  const parts = t.split(/\s+[-|–—]\s+/);
  if (parts.length > 1) {
    if (siteTitle && cleanText(parts[0]).toLowerCase() === siteTitle.toLowerCase()) return parts.slice(1).join(' - ');
    if (siteTitle && cleanText(parts[parts.length - 1]).toLowerCase() === siteTitle.toLowerCase()) return parts.slice(0, -1).join(' - ');
    return parts.slice(1).join(' - ');
  }
  return t;
}

function navFrom(root, ctx) {
  const ul = find(root, x => (x.tag === 'ul' && (hasClass(x, 'wsite-menu-default') || x.attrs.id === 'navigation')) || (x.tag === 'div' && hasClass(x, 'wsite-menu-default')));
  const items = [];
  if (ul) {
    const top = ul.tag === 'ul' ? ul : find(ul, x => x.tag === 'ul');
    for (const li of top ? top.children.filter(c => isEl(c, 'li')) : []) {
      const a = find(li, x => x.tag === 'a');
      if (!a) continue;
      const title = cleanText(textOf(find(a, x => hasClass(x, 'wsite-menu-title')) || a));
      const sub = find(li, x => x.tag === 'ul' && x !== top);
      const children = sub ? findAll(sub, x => x.tag === 'a' && (hasClass(x, 'wsite-menu-subitem') || x.attrs.href)).map(s => ({ title: cleanText(textOf(find(s, x => hasClass(x, 'wsite-menu-title')) || s)), href: s.attrs.href || '' })).filter(c => c.title) : [];
      if (title) items.push({ title, href: a.attrs.href || '', children });
    }
  }
  if (!items.length) {
    // the flyout data in the page script: initPublishedFlyoutMenus([{ "title", "url" }, ...])
    for (const sc of findAll(root, x => x.tag === 'script')) {
      const raw = sc.children.map(c => c.text || '').join('');
      const at = raw.indexOf('initPublishedFlyoutMenus(');
      if (at < 0) continue;
      const arr = matchBracket(raw, raw.indexOf('[', at));
      try { for (const it of JSON.parse(arr)) if (it && it.title) items.push({ title: cleanText(it.title), href: it.url || '', children: [] }); } catch { /* not JSON */ }
      if (items.length) break;
    }
  }
  return items.map(it => resolveNav(it, ctx)).filter(Boolean);
}
function resolveNav(it, ctx) {
  const l = ctx.link(it.href);
  const children = (it.children || []).map(c => resolveNav(c, ctx)).filter(Boolean);
  if (l.kind === 'drop' && !children.length) return null;
  return { title: it.title, kind: l.kind, path: l.path || null, href: l.kind === 'external' || l.kind === 'anchor' ? l.href : null, children };
}

/** Read every page of one site: the model the page shows and the clean site is written from. */
export function readSite(files) {
  const all = [...files.keys()];
  const lower = new Map(all.map(p => [p.toLowerCase(), p]));
  const pagePaths = all.filter(p => PAGE_EXT.test(p)).sort((a, b) => (a === 'index.html' ? -1 : b === 'index.html' ? 1 : a.split('/').length - b.split('/').length || a.localeCompare(b)));
  const site = {
    title: '', logo: null, lang: 'en', isWeebly: false, hosts: new Set(), pages: [], nav: [], footer: [], issues: [], used: new Set(),
    stats: { pages: 0, images: 0, files: 0, remoteImages: 0, scripts: 0, trackers: 0, weeblyScripts: 0, slideshows: 0, galleries: 0, forms: 0, embeds: 0, words: 0, archiveFiles: all.length },
  };
  site.findFile = p => {
    if (!p) return null;
    if (files.has(p)) return p;
    const lc = lower.get(p.toLowerCase());
    if (lc) return lc;
    // Weebly keeps a full-size copy as name_orig.ext and resized copies in published/ and editor/ folders
    const m = /^(.*?)(_orig)?(\.[a-z0-9]+)$/i.exec(p);
    if (m) {
      const alt = m[2] ? `${m[1]}${m[3]}` : `${m[1]}_orig${m[3]}`;
      if (files.has(alt)) return alt;
      const d = dirOf(p);
      const base = p.slice(d.length);
      for (const sub of ['published/', 'editor/']) if (files.has(d + sub + base)) return d + sub + base;
      if (/\/(published|editor)\/$/.test(d)) { const up = d.replace(/(published|editor)\/$/, '') + base; if (files.has(up)) return up; }
    }
    return null;
  };
  const pageSet = new Map(pagePaths.map(p => [p.toLowerCase(), p]));
  site.pageFor = p => {
    const k = p.toLowerCase();
    if (pageSet.has(k)) return pageSet.get(k);
    if (pageSet.has(`${k}.html`)) return pageSet.get(`${k}.html`);
    if (pageSet.has(`${k.replace(/\/$/, '')}/index.html`)) return pageSet.get(`${k.replace(/\/$/, '')}/index.html`);
    return null;
  };

  // first pass: parse, find the site's own host names and the site title
  const parsed = pagePaths.map(file => {
    const html = decode(files.get(file));
    const root = parseHtml(html);
    if (/IS_ARCHIVE|editmysite\.com|wsite-/i.test(html)) site.isWeebly = true;
    for (const x of findAll(root, y => (y.tag === 'link' && /canonical/i.test(y.attrs.rel || '')) || (y.tag === 'meta' && /og:url/i.test(y.attrs.property || '')))) {
      const u = x.attrs.href || x.attrs.content || '';
      const m = /^https?:\/\/([^/:]+)/i.exec(u);
      if (m) site.hosts.add(m[1].toLowerCase());
    }
    return { file, html, root };
  });
  for (const h of [...site.hosts]) { site.hosts.add(h.replace(/^www\./, '')); site.hosts.add(`www.${h.replace(/^www\./, '')}`); }
  const index = parsed.find(p => p.file.toLowerCase() === 'index.html') || parsed[0];
  if (index) {
    const htmlEl = find(index.root, x => x.tag === 'html');
    if (htmlEl && /^[a-z]{2}(-[a-z0-9]+)?$/i.test(htmlEl.attrs.lang || '')) site.lang = htmlEl.attrs.lang;
    const t = find(index.root, x => x.attrs.id === 'wsite-title');
    const logoEl = find(index.root, x => hasClass(x, 'wsite-logo'));
    const logoImg = logoEl ? find(logoEl, x => x.tag === 'img') : null;
    const titleTag = cleanText(textOf(find(index.root, x => x.tag === 'title')));
    site.title = cleanText(textOf(t)) || cleanText(logoImg && logoImg.attrs.alt) || cleanText(titleTag.split(/\s+[-|–—]\s+/)[0]) || 'My website';
    if (logoImg) {
      const ctx = new Ctx(site, { file: index.file, images: new Set(), seenLinks: new Set() });
      const p = ctx.asset(logoImg.attrs.src);
      if (p) { site.logo = p; site.used.add(p); }
    }
  }

  for (const { file, root, html } of parsed) {
    const page = { file, title: '', images: new Set(), seenLinks: new Set(), slides: {}, blocks: [], hero: null, kind: 'page', words: 0, forms: 0, embeds: 0, slideshows: 0, galleries: 0, description: '' };
    const ctx = new Ctx(site, page);
    const scripts = findAll(root, x => x.tag === 'script');
    for (const sc of scripts) {
      const raw = sc.children.map(c => c.text || '').join('');
      const src = sc.attrs.src || '';
      site.stats.scripts++;
      if (TRACKERS.test(src) || TRACKERS.test(raw)) site.stats.trackers++;
      if (raw.includes('wSlideshow')) Object.assign(page.slides, slideshowsIn(raw));
      if (WEEBLY_SCRIPT.test(src) || WEEBLY_SCRIPT.test(raw)) site.stats.weeblyScripts++;
    }
    page.title = pageTitleFrom(textOf(find(root, x => x.tag === 'title')), site.title) || site.title;
    const desc = find(root, x => x.tag === 'meta' && (x.attrs.name || '').toLowerCase() === 'description');
    page.description = cleanText(desc && desc.attrs.content);
    const bodyEl = find(root, x => x.tag === 'body') || root;
    if (find(bodyEl, x => hasClass(x, 'blog-post') || hasClass(x, 'blog-header') || x.attrs.id === 'blogTable' || hasClassPrefixAny(x, 'wsite-blog'))) page.kind = 'blog';
    else if (find(bodyEl, x => classes(x).some(c => /^wsite-com-(product|category|store|checkout|cart)/.test(c)))) page.kind = 'store';

    // background pictures: the theme's banner and page background
    const bgRefs = [];
    for (const st of findAll(root, x => x.tag === 'style')) {
      const css = st.children.map(c => c.text || '').join('');
      for (const rule of css.split('}')) if (/wsite-background|banner|header/i.test(rule.split('{')[0] || '')) bgRefs.push(...cssUrls(rule));
    }
    for (const x of findAll(root, y => /background(-image)?\s*:[^;]*url\(/i.test(y.attrs.style || '') && (hasClass(y, 'wsite-background') || /banner|header/i.test(`${y.attrs.id || ''} ${y.attrs.class || ''}`)))) bgRefs.push(...cssUrls(x.attrs.style));
    for (const ref of [...new Set(bgRefs)]) {
      const p = ctx.asset(ref);
      if (p && IMG_EXT.test(p)) { if (!page.bg) { page.bg = p; site.used.add(p); } }
      else if (IMG_EXT.test(ref.split('?')[0])) {
        const key = `bg|${ref}`;
        if (!page.seenLinks.has(key)) { page.seenLinks.add(key); ctx.issue('missing-background', 'background picture kept on Weebly\'s servers, not in the archive', ref); }
      }
    }

    // the banner text some themes show above the content
    const headline = find(root, x => hasClass(x, 'wsite-headline'));
    if (headline) {
      const para = find(root, x => hasClass(x, 'wsite-headline-paragraph'));
      const bannerWrap = headline.parent && (function up(n) { let p = n; for (let i = 0; i < 6 && p; i++) { if (/banner/i.test(`${p.attrs?.id || ''} ${p.attrs?.class || ''}`)) return p; p = p.parent; } return null; })(headline);
      const buttons = bannerWrap ? findAll(bannerWrap, x => x.tag === 'a' && hasClass(x, 'wsite-button')).map(a => buttonBlock(a, ctx)).filter(b => b && b.t === 'button') : [];
      const ht = cleanText(textOf(headline));
      if (ht) page.hero = { title: ht, text: para ? cleanText(textOf(para)) : '', buttons };
    }

    const content = find(root, x => x.attrs.id === 'wsite-content') || find(root, x => hasClass(x, 'wsite-elements') && hasClass(x, 'wsite-not-footer'));
    if (content) blocksOf(content, ctx, page.blocks);
    else {
      const body = find(root, x => x.tag === 'body') || root;
      // no Weebly content area: take the body without header, navigation and footer
      const clone = { ...body, children: body.children.filter(c => !(isEl(c) && (/^(header|nav|footer)$/.test(c.tag) || /(header|footer|nav|menu)/i.test(`${c.attrs.id || ''} ${c.attrs.class || ''}`)))) };
      blocksOf(clone, ctx, page.blocks);
    }
    const footerEl = find(root, x => hasClass(x, 'wsite-footer') && hasClass(x, 'wsite-elements'));
    page.footer = footerEl ? blocksOf(footerEl, ctx, []) : [];
    if (page.kind === 'blog') ctx.issue('blog', 'blog page: Weebly says blog posts are not included in the archive', '');
    if (page.kind === 'store') ctx.issue('store', 'store page: Weebly says store pages are not included in the archive', '');

    page.words = wordsIn(page.blocks) + (page.hero ? (page.hero.title + ' ' + page.hero.text).split(/\s+/).filter(Boolean).length : 0);
    if (!page.description) page.description = firstText(page.blocks, page.hero);
    site.stats.words += page.words;
    site.stats.slideshows += page.slideshows;
    site.stats.galleries += page.galleries;
    site.stats.forms += page.forms;
    site.stats.embeds += page.embeds;
    if (index && file === index.file) site.nav = navFrom(root, ctx);
    site.pages.push(page);
  }
  if (!site.nav.length) site.nav = site.pages.filter(p => p.kind === 'page').slice(0, 12).map(p => ({ title: p.title, kind: 'page', path: p.file, href: null, children: [] }));
  // nav labels name the pages better than <title>
  const label = new Map();
  const walkNav = items => { for (const it of items) { if (it.kind === 'page' && it.path && !label.has(it.path)) label.set(it.path, it.title); walkNav(it.children); } };
  walkNav(site.nav);
  for (const p of site.pages) {
    p.navTitle = label.get(p.file) || p.title;
    if (!p.hero && !p.blocks.length && p.kind === 'page') { p.kind = 'empty'; site.issues.push({ page: p.file, kind: 'empty', detail: 'no content found on this page', ref: '' }); }
  }
  // links in the menu to pages the archive does not have (most often the blog and the store)
  const missingNav = [];
  const scanNav = items => { for (const it of items) { if (it.kind === 'missing') missingNav.push(it); scanNav(it.children); } };
  scanNav(site.nav);
  for (const it of missingNav) if (!site.issues.some(i => i.kind === 'missing-page' && i.detail === it.path)) site.issues.push({ page: index ? index.file : '', kind: 'missing-page', detail: it.path, ref: it.title });
  site.footer = (site.pages.find(p => p.file === (index && index.file)) || { footer: [] }).footer;
  site.stats.pages = site.pages.length;
  site.stats.images = [...site.used].filter(p => IMG_EXT.test(p)).length;
  site.stats.files = [...site.used].filter(p => !IMG_EXT.test(p)).length;
  return site;
}
function wordsIn(blocks) {
  let n = 0;
  const count = h => String(h || '').replace(/<[^>]+>/g, ' ').replace(/&[a-z#0-9]+;/gi, ' ').split(/\s+/).filter(Boolean).length;
  for (const b of blocks) {
    if (b.t === 'p' || b.t === 'h') n += count(b.html);
    else if (b.t === 'list') n += b.items.reduce((a, h) => a + count(h), 0);
    else if (b.t === 'quote') n += wordsIn(b.blocks);
    else if (b.t === 'cols') n += b.cols.reduce((a, c) => a + wordsIn(c), 0);
    else if (b.t === 'table') n += b.rows.flat().reduce((a, c) => a + count(c.html), 0);
    else if (b.t === 'img' || b.t === 'gallery') n += count(b.caption || (b.items || []).map(i => i.caption).join(' '));
    else if (b.t === 'button') n += count(b.text);
  }
  return n;
}
function firstText(blocks, hero) {
  const texts = [];
  if (hero && hero.text) texts.push(hero.text);
  const take = list => { for (const b of list) { if (texts.join(' ').length > 160) return; if (b.t === 'p') texts.push(b.html.replace(/<[^>]+>/g, ' ')); else if (b.t === 'cols') b.cols.forEach(take); else if (b.t === 'list') texts.push(b.items.join(' ').replace(/<[^>]+>/g, ' ')); } };
  take(blocks);
  const t = cleanText(texts.join(' ').replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"'));
  return t.length > 155 ? `${t.slice(0, 152).replace(/\s+\S*$/, '')}...` : t;
}

/* ---------------- writing the clean site ---------------- */
export function siteCss(opts) {
  const accent = safeAccent(opts.accent);
  const head = opts.headings === 'sans' ? 'system-ui, -apple-system, "Segoe UI", Roboto, "Helvetica Neue", Arial, sans-serif' : 'Georgia, "Times New Roman", "Noto Serif", serif';
  return `/* Your site, written by Rehoused from your Weebly archive. Plain CSS, no web fonts, no scripts. Change the colours here. */
:root { --accent: ${accent}; --ink: #1d1f24; --muted: #5b606b; --line: #dde1e7; --soft: #f3f5f8; --paper: #ffffff; --max: 1080px; }
* { box-sizing: border-box; }
html { -webkit-text-size-adjust: 100%; }
body { margin: 0; font-family: system-ui, -apple-system, "Segoe UI", Roboto, "Helvetica Neue", Arial, sans-serif; font-size: 18px; line-height: 1.6; color: var(--ink); background: var(--paper); }
img { max-width: 100%; height: auto; }
a { color: var(--accent); text-underline-offset: 3px; }
a:hover { color: var(--ink); }
h1, h2, h3, h4 { font-family: ${head}; line-height: 1.2; margin: 1.4em 0 0.4em; }
h1 { font-size: clamp(30px, 4vw, 44px); margin-top: 0.6em; }
h2 { font-size: clamp(24px, 3vw, 32px); }
h3 { font-size: 22px; }
p, ul, ol, blockquote, table, figure, .cols, .gallery, .embed, .buttons { margin: 0 0 1.1em; }
.wrap { max-width: var(--max); margin: 0 auto; padding: 0 20px; }
.skip { position: absolute; left: -9999px; }
.skip:focus { left: 12px; top: 12px; background: #fff; padding: 8px 12px; z-index: 9; }
:focus-visible { outline: 3px solid var(--accent); outline-offset: 2px; }
.site-head { border-bottom: 1px solid var(--line); background: var(--paper); }
.site-head .wrap { display: flex; flex-wrap: wrap; align-items: center; justify-content: space-between; gap: 10px 24px; padding-top: 14px; padding-bottom: 14px; }
.site-name { font-family: ${head}; font-size: 24px; font-weight: 700; color: var(--ink); text-decoration: none; display: inline-flex; align-items: center; gap: 10px; }
.site-name img { max-height: 56px; width: auto; }
.menu { list-style: none; margin: 0; padding: 0; display: flex; flex-wrap: wrap; gap: 4px 6px; }
.menu > li { position: relative; }
.menu a, .menu summary { display: block; padding: 8px 10px; color: var(--ink); text-decoration: none; border-radius: 6px; cursor: pointer; }
.menu a:hover, .menu summary:hover { background: var(--soft); }
.menu a[aria-current="page"] { color: var(--accent); font-weight: 700; }
.menu details ul { list-style: none; margin: 0; padding: 6px; background: var(--paper); border: 1px solid var(--line); border-radius: 8px; min-width: 200px; }
@media (min-width: 720px) { .menu details ul { position: absolute; z-index: 5; box-shadow: 0 10px 30px -12px rgba(0,0,0,.25); } }
.hero { background: var(--accent); color: #fff; background-size: cover; background-position: center; }
.hero.has-bg { background-color: #1d1f24; }
.hero .wrap { padding-top: clamp(48px, 9vw, 110px); padding-bottom: clamp(48px, 9vw, 110px); }
.hero.has-bg .wrap { text-shadow: 0 1px 12px rgba(0,0,0,.55); }
.hero h1 { color: #fff; margin: 0; max-width: 20ch; }
.hero p { font-size: 20px; max-width: 46ch; margin: 14px 0 0; }
.hero .buttons { margin: 24px 0 0; }
.hero .button { background: #fff; color: var(--ink); }
.page { padding-top: 12px; padding-bottom: 48px; }
.button { display: inline-block; background: var(--accent); color: #fff; text-decoration: none; font-weight: 700; padding: 12px 20px; border-radius: 8px; }
.button:hover { color: #fff; filter: brightness(1.12); }
.buttons { display: flex; flex-wrap: wrap; gap: 10px; }
figure { margin-left: 0; margin-right: 0; }
figure.left { text-align: left; } figure.right { text-align: right; } figure.center { text-align: center; }
figcaption { font-size: 15px; color: var(--muted); margin-top: 6px; }
.gallery { display: grid; grid-template-columns: repeat(auto-fill, minmax(180px, 1fr)); gap: 10px; padding: 0; list-style: none; }
.gallery li { margin: 0; }
.gallery img { width: 100%; aspect-ratio: 4 / 3; object-fit: cover; border-radius: 6px; display: block; }
.gallery a { display: block; }
.cols { display: grid; gap: 24px; grid-template-columns: var(--cols, repeat(2, minmax(0, 1fr))); }
@media (max-width: 720px) { .cols { grid-template-columns: minmax(0, 1fr); } }
.cols > div > :first-child { margin-top: 0; }
.embed { position: relative; aspect-ratio: 16 / 9; background: var(--soft); border-radius: 8px; overflow: hidden; }
.embed iframe { position: absolute; inset: 0; width: 100%; height: 100%; border: 0; }
blockquote { border-left: 4px solid var(--accent); padding: 4px 0 4px 18px; color: var(--muted); margin-left: 0; }
table { border-collapse: collapse; width: 100%; display: block; overflow-x: auto; }
td, th { border: 1px solid var(--line); padding: 8px 10px; text-align: left; vertical-align: top; }
hr { border: 0; border-top: 1px solid var(--line); margin: 2em 0; }
pre { white-space: pre-wrap; background: var(--soft); padding: 12px; border-radius: 6px; }
.social { list-style: none; padding: 0; display: flex; flex-wrap: wrap; gap: 8px 18px; }
.contact { background: var(--soft); border-radius: 8px; padding: 16px 18px; }
.site-foot { border-top: 1px solid var(--line); background: var(--soft); color: var(--muted); font-size: 16px; }
.site-foot .wrap { padding-top: 28px; padding-bottom: 32px; }
.site-foot p { margin: 0 0 8px; }
`;
}

function blockHtml(b, page, opts, preview) {
  const rel = p => relPath(page.file, p);
  const src = p => (preview ? `data-rh-src="${escHtml(p)}" src="data:image/gif;base64,R0lGODlhAQABAAAAACw=" ` : `src="${escHtml(rel(p))}" `);
  switch (b.t) {
    case 'h': return `<h${b.level}>${b.html}</h${b.level}>`;
    case 'p': return `<p>${b.html}</p>`;
    case 'hr': return '<hr>';
    case 'list': return `<${b.ordered ? 'ol' : 'ul'}>${b.items.map(i => `<li>${i}</li>`).join('')}</${b.ordered ? 'ol' : 'ul'}>`;
    case 'quote': return `<blockquote>${b.blocks.map(x => blockHtml(x, page, opts, preview)).join('\n')}</blockquote>`;
    case 'pre': return `<pre>${escHtml(b.text)}</pre>`;
    case 'img': {
      const img = b.remote ? (preview ? `<img src="data:image/gif;base64,R0lGODlhAQABAAAAACw=" data-rh-remote="${escHtml(b.remote)}" alt="${escHtml(b.alt)}">` : `<img src="${escHtml(b.remote)}" alt="${escHtml(b.alt)}" loading="lazy">`) : `<img ${src(b.src)}alt="${escHtml(b.alt)}" loading="lazy">`;
      const inner = b.href ? `<a href="${escHtml(b.href)}"${b.external ? ' rel="noopener"' : ''}>${img}</a>` : img;
      return `<figure class="${b.align || 'center'}">${inner}${b.caption ? `<figcaption>${escHtml(b.caption)}</figcaption>` : ''}</figure>`;
    }
    case 'gallery': return `<ul class="gallery">${b.items.map(i => `<li><a href="${escHtml(rel(i.src))}"><img ${src(i.src)}alt="${escHtml(i.alt || i.caption || '')}" loading="lazy"></a>${i.caption ? `<p><small>${escHtml(i.caption)}</small></p>` : ''}</li>`).join('')}</ul>`;
    case 'cols': {
      const w = b.widths && b.widths.length === b.cols.length && b.widths.every(Boolean) ? b.widths.map(x => `minmax(0, ${Math.round(x)}fr)`).join(' ') : `repeat(${b.cols.length}, minmax(0, 1fr))`;
      return `<div class="cols" style="--cols: ${w}">${b.cols.map(c => `<div>${c.map(x => blockHtml(x, page, opts, preview)).join('\n')}</div>`).join('')}</div>`;
    }
    case 'button': return `<p class="buttons"><a class="button" href="${escHtml(b.href)}"${b.external ? ' rel="noopener"' : ''}>${escHtml(b.text)}</a></p>`;
    case 'embed':
      if (preview) return `<p class="contact">${b.kind === 'map' ? 'Map' : b.kind === 'video' ? 'Video' : 'Embedded page'} from ${escHtml(hostLabel(b.src))} (shown on your new site; not loaded in this preview)</p>`;
      return `<div class="embed"><iframe src="${escHtml(b.src)}" title="${b.kind === 'map' ? 'Map' : b.kind === 'video' ? 'Video' : 'Embedded content'}" loading="lazy" allowfullscreen referrerpolicy="strict-origin-when-cross-origin"></iframe></div>`;
    case 'audio': return `<p><audio controls preload="none" src="${escHtml(rel(b.src))}"></audio><br><a href="${escHtml(rel(b.src))}">${escHtml(b.name)}</a></p>`;
    case 'video': return `<p><video controls preload="none" src="${escHtml(rel(b.src))}" style="max-width:100%"></video></p>`;
    case 'table': return `<table>${b.rows.map(r => `<tr>${r.map(c => (c.head ? `<th>${c.html}</th>` : `<td>${c.html}</td>`)).join('')}</tr>`).join('')}</table>`;
    case 'social': return `<ul class="social">${b.links.map(l => `<li><a href="${escHtml(l.href)}" rel="noopener">${escHtml(l.label)}</a></li>`).join('')}</ul>`;
    case 'form':
      if (opts.email) return `<p class="contact">Write to us at <a href="mailto:${escHtml(opts.email)}">${escHtml(opts.email)}</a>.</p>`;
      return `<!-- A Weebly contact form was here${b.fields.length ? ` (fields: ${escHtml(b.fields.join(', ')).replace(/--/g, '- -')})` : ''}. Weebly forms only work on Weebly: add your new host's form or an email link. -->`;
    default: return '';
  }
}

function navHtml(all, page) {
  const items = all.map(it => ({ ...it, children: it.children.filter(c => c.kind !== 'missing') })).filter(it => it.kind !== 'missing' || it.children.length);
  const href = it => (it.kind === 'page' || it.kind === 'file' || it.kind === 'missing' ? relPath(page.file, it.path) : it.href || '#');
  const link = it => `<a href="${escHtml(href(it))}"${it.kind === 'page' && it.path === page.file ? ' aria-current="page"' : ''}${it.kind === 'external' ? ' rel="noopener"' : ''}>${escHtml(it.title)}</a>`;
  return `<ul class="menu">${items.map(it => (it.children.length
    ? `<li><details><summary>${escHtml(it.title)}</summary><ul>${it.kind !== 'drop' && it.kind !== 'missing' ? `<li>${link(it)}</li>` : ''}${it.children.map(c => `<li>${link(c)}</li>`).join('')}</ul></details></li>`
    : `<li>${link(it)}</li>`)).join('')}</ul>`;
}

/** One clean page. `preview` swaps picture addresses for data-rh-src (the page fills them in) and leaves embeds out. */
export function pageHtml(site, page, options = {}, preview = false) {
  const opts = { ...DEFAULTS, ...options };
  const rel = p => relPath(page.file, p);
  const isHome = page.file.toLowerCase() === 'index.html';
  const blocks = page.blocks.slice();
  const hasH1 = !page.hero && blocks.length && blocks[0].t === 'h';
  if (hasH1) blocks[0] = { ...blocks[0], level: 1 };
  const docTitle = isHome ? (page.title && page.title.toLowerCase() !== site.title.toLowerCase() ? `${site.title}: ${page.title}` : site.title) : `${page.navTitle || page.title} | ${site.title}`;
  const domain = String(opts.domain || '').trim().replace(/\/+$/, '');
  const canonical = /^https?:\/\/[^\s/]+$/i.test(domain) ? `${domain}/${isHome ? '' : page.file}` : '';
  const hero = page.hero ? `<section class="hero${page.bg ? ' has-bg' : ''}"${page.bg ? (preview ? ` data-rh-bg="${escHtml(page.bg)}"` : ` style="background-image: linear-gradient(rgba(0,0,0,.35), rgba(0,0,0,.35)), url('${escHtml(rel(page.bg))}')"`) : ''}><div class="wrap"><h1>${escHtml(page.hero.title)}</h1>${page.hero.text ? `<p>${escHtml(page.hero.text)}</p>` : ''}${page.hero.buttons.length ? `<p class="buttons">${page.hero.buttons.map(b => `<a class="button" href="${escHtml(b.href)}">${escHtml(b.text)}</a>`).join('')}</p>` : ''}</div></section>` : '';
  const h1 = !page.hero && !hasH1 ? `<h1>${escHtml(page.navTitle || page.title || site.title)}</h1>` : '';
  const notice = page.kind === 'blog' || page.kind === 'store' ? `<!-- Weebly did not include the ${page.kind} content of this page in the archive. -->` : '';
  const logo = site.logo ? (preview ? `<img data-rh-src="${escHtml(site.logo)}" src="data:image/gif;base64,R0lGODlhAQABAAAAACw=" alt="${escHtml(site.title)}">` : `<img src="${escHtml(rel(site.logo))}" alt="${escHtml(site.title)}">`) : escHtml(site.title);
  const footer = (page.footer && page.footer.length ? page.footer : site.footer).map(b => blockHtml(b, page, opts, preview)).join('\n');
  const year = opts.year || new Date().getFullYear();
  return `<!doctype html>
<html lang="${escHtml(site.lang)}">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>${escHtml(docTitle)}</title>
${page.description ? `<meta name="description" content="${escHtml(page.description)}">\n` : ''}${canonical ? `<link rel="canonical" href="${escHtml(canonical)}">\n` : ''}${preview ? `<style>${siteCss(opts)}</style>` : `<link rel="stylesheet" href="${escHtml(rel('assets/site.css'))}">`}
</head>
<body>
<a class="skip" href="#content">Skip to content</a>
<header class="site-head"><div class="wrap">
<a class="site-name" href="${escHtml(rel('index.html'))}">${logo}</a>
<nav aria-label="Main">${navHtml(site.nav, page)}</nav>
</div></header>
<main id="content">
${hero}
<div class="wrap page">
${notice}${h1}
${blocks.map(b => blockHtml(b, page, opts, preview)).join('\n')}
</div>
</main>
<footer class="site-foot"><div class="wrap">
${footer}
<p>&copy; ${year} ${escHtml(site.title)}</p>
</div></footer>
</body>
</html>
`;
}

const csvCell = v => {
  let s = String(v ?? '');
  if (/^[=+\-@\t\r]/.test(s)) s = `'${s}`;
  return /[",\n\r]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
};
export const KIND_LABEL = {
  'missing-image': 'Picture not in the archive', 'missing-background': 'Background picture not in the archive', 'missing-page': 'Link to a page not in the archive',
  'missing-file': 'Linked file not in the archive', form: 'Contact form (does not work outside Weebly)', blog: 'Blog page (posts not in the archive)',
  store: 'Store page (products not in the archive)', 'custom-code': 'Custom code to check', 'weebly-only': 'Weebly element left out', flash: 'Flash element left out', empty: 'Page with no content',
};
export function reportCsv(site) {
  const rows = [['Page', 'What', 'Detail', 'Original address']];
  for (const i of site.issues) rows.push([i.page, KIND_LABEL[i.kind] || i.kind, i.detail, i.ref]);
  return '﻿' + rows.map(r => r.map(csvCell).join(',')).join('\r\n') + '\r\n';
}

function readme(site, opts) {
  const n = k => site.issues.filter(i => i.kind === k).length;
  const lines = [
    `${site.title}: your Weebly site, rebuilt as a plain static website`,
    '',
    `Written by Rehoused (https://peakappsstudio.com/weebly-archive/) on ${stamp(new Date())} from your Weebly archive.`,
    '',
    'What is in this folder',
    `- ${site.pages.length} page${site.pages.length === 1 ? '' : 's'}, with the same file names as on Weebly (index.html is the home page), so old links keep working once your domain points here.`,
    `- ${site.stats.images} picture${site.stats.images === 1 ? '' : 's'} and ${site.stats.files} other file${site.stats.files === 1 ? '' : 's'} from the archive, in their original folders.`,
    '- assets/site.css: the look of every page. Change the colour at the top.',
    '- moving-report.csv: everything the archive could not bring, page by page.',
    '',
    'What was changed',
    `- Weebly's scripts and ${site.stats.trackers ? `${site.stats.trackers} tracking script${site.stats.trackers === 1 ? '' : 's'}` : 'any tracking scripts'} were left out. Nothing on these pages loads from Weebly.`,
    `- ${site.stats.slideshows} slideshow${site.stats.slideshows === 1 ? '' : 's'} and ${site.stats.galleries} galler${site.stats.galleries === 1 ? 'y' : 'ies'} became plain picture grids.`,
    '- Links between your pages were made relative, so the site also works from a folder on your computer.',
    '',
    'What needs you (details in moving-report.csv)',
    `- Pictures not in the archive: ${n('missing-image') + n('missing-background')}`,
    `- Links to pages not in the archive (often the blog or the store): ${n('missing-page')}`,
    `- Contact forms: ${n('form')}${opts.email ? ` (replaced with an email link to ${opts.email})` : ' (left out: Weebly forms only work on Weebly)'}`,
    `- Blog and store pages: ${n('blog') + n('store')} (Weebly does not put posts or products in the archive)`,
    '',
    'To put it online for free',
    '- Netlify: sign in, open app.netlify.com/drop and drag this folder (not the ZIP) onto the page.',
    '- Cloudflare Pages: in the dashboard open Workers & Pages, Create application, Get started, Drag and drop your files, then drag this folder in (up to 1,000 files).',
    '- GitHub Pages: upload the files to a repository, turn on Pages in its settings and choose the branch. On a free account the repository is public.',
    'Then point your domain at the new host (move it away from Weebly before December 26, 2026 if Weebly is closing in your country).',
    '',
    'Rehoused is an independent tool by Peak Apps Studio and is not affiliated with Weebly or Square.',
  ];
  return lines.join('\r\n') + '\r\n';
}

/** Every file of the clean site: { path: Uint8Array } */
export function buildCleanSite(site, files, options = {}) {
  const opts = { ...DEFAULTS, ...options };
  const out = {};
  for (const page of site.pages) out[page.file] = strToU8(pageHtml(site, page, opts));
  out['assets/site.css'] = strToU8(siteCss(opts));
  for (const p of site.used) if (files.has(p) && !(p in out)) out[p] = files.get(p);
  const notFound = { file: '404.html', title: 'Page not found', navTitle: 'Page not found', blocks: [{ t: 'p', html: `This page is not here. <a href="index.html">Go to the home page</a>.` }], footer: [], hero: null, kind: 'page', description: '' };
  if (!out['404.html']) out['404.html'] = strToU8(pageHtml(site, notFound, opts));
  const domain = String(opts.domain || '').trim().replace(/\/+$/, '');
  const okDomain = /^https?:\/\/[^\s/]+$/i.test(domain);
  out['robots.txt'] = strToU8(`User-agent: *\nAllow: /\n${okDomain ? `Sitemap: ${domain}/sitemap.xml\n` : ''}`);
  if (okDomain) out['sitemap.xml'] = strToU8(`<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n${site.pages.filter(p => p.kind !== 'empty').map(p => `<url><loc>${escHtml(`${domain}/${p.file.toLowerCase() === 'index.html' ? '' : p.file}`)}</loc></url>`).join('\n')}\n</urlset>\n`);
  out['moving-report.csv'] = strToU8(reportCsv(site));
  out['README.txt'] = strToU8(readme(site, opts));
  return out;
}

/** The clean site as one ZIP inside a folder named after the site. Pictures are stored, text is compressed. */
export function zipCleanSite(site, files, options = {}) {
  const out = buildCleanSite(site, files, options);
  const folder = (site.title || 'website').toLowerCase().normalize('NFKD').replace(/[^\w]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 40) || 'website';
  const z = {};
  for (const [p, bytes] of Object.entries(out)) z[`${folder}/${p}`] = [bytes, { level: /\.(jpe?g|png|gif|webp|mp3|mp4|zip|pdf|avif)$/i.test(p) ? 0 : 6, mtime: new Date('2026-01-01T00:00:00Z') }];
  return { bytes: zipSync(z), folder, count: Object.keys(out).length };
}

/** What the page shows: the model without the file bytes and without the parser's internals */
export function summaryOf(site) {
  return {
    title: site.title, lang: site.lang, isWeebly: site.isWeebly, logo: site.logo,
    stats: site.stats, issues: site.issues,
    nav: site.nav,
    pages: site.pages.map(p => ({ file: p.file, title: p.title, navTitle: p.navTitle, kind: p.kind, words: p.words, images: p.images.size, blocks: p.blocks.length, hero: !!p.hero, forms: p.forms, slideshows: p.slideshows, galleries: p.galleries, embeds: p.embeds })),
  };
}
