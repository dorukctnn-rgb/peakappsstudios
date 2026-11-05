// Utsushi: a small HTML allowlist that works the same in the browser and in Node (no DOM). It reads the HTML of an Ameba Ownd
// text block (or a custom HTML block) as tags and text, keeps the tags a post needs, keeps only safe attributes, and drops
// scripts, styles, frames, forms, event handlers and javascript: links. The result is inserted into the reader with innerHTML,
// under a Content-Security-Policy that already blocks inline script; this is the second wall, not the only one.

const KEEP = new Set(['p', 'br', 'b', 'strong', 'i', 'em', 'u', 's', 'strike', 'del', 'ins', 'sub', 'sup', 'small', 'mark', 'span', 'div',
  'h1', 'h2', 'h3', 'h4', 'h5', 'h6', 'ul', 'ol', 'li', 'dl', 'dt', 'dd', 'blockquote', 'q', 'cite', 'pre', 'code', 'hr', 'a', 'img',
  'figure', 'figcaption', 'table', 'thead', 'tbody', 'tfoot', 'tr', 'th', 'td', 'caption', 'colgroup', 'col', 'ruby', 'rt', 'rp', 'font', 'center']);
const VOID = new Set(['br', 'hr', 'img', 'col']);
// tags whose whole content is dropped with them
const DROP = new Set(['script', 'style', 'iframe', 'object', 'embed', 'noscript', 'template', 'textarea', 'select', 'button', 'form',
  'svg', 'math', 'video', 'audio', 'canvas', 'head', 'title', 'link', 'meta', 'base', 'frame', 'frameset', 'applet', 'xmp', 'plaintext']);
const ATTRS = { a: ['href', 'title', 'target'], img: ['src', 'alt', 'title', 'width', 'height'], td: ['colspan', 'rowspan'], th: ['colspan', 'rowspan', 'scope'], col: ['span'], ol: ['start', 'type'] };
const ALIGN = new Set(['left', 'right', 'center', 'justify']);

export function escapeHtml(s) {
  return String(s == null ? '' : s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
}

const NAMED = { amp: '&', lt: '<', gt: '>', quot: '"', apos: "'", nbsp: ' ', copy: '©', reg: '®', hellip: '…', mdash: '—', ndash: '–', laquo: '«', raquo: '»', yen: '¥', times: '×', middot: '·' };
export function decodeEntities(s) {
  return String(s == null ? '' : s).replace(/&(#x[0-9a-f]+|#[0-9]+|[a-z][a-z0-9]*);/gi, (m, e) => {
    if (e[0] === '#') {
      const n = e[1] === 'x' || e[1] === 'X' ? parseInt(e.slice(2), 16) : parseInt(e.slice(1), 10);
      if (!Number.isFinite(n) || n <= 0 || n > 0x10ffff || (n >= 0xd800 && n <= 0xdfff)) return '�';
      return String.fromCodePoint(n);
    }
    const v = NAMED[e.toLowerCase()];
    return v === undefined ? m : v;
  });
}

// a link or image address we keep: http(s), mailto, tel, a page-relative path or an anchor; nothing that runs
export function safeUrl(u, { image = false } = {}) {
  const s = decodeEntities(String(u || '')).replace(/[\u0000- \u007f-\u009f]/g, '');
  if (!s) return '';
  if (/^(https?:)?\/\//i.test(s)) return s.startsWith('//') ? 'https:' + s : s;
  if (/^data:/i.test(s)) return image && /^data:image\/(png|jpe?g|gif|webp);base64,[a-z0-9+/=]+$/i.test(s) ? s : '';
  if (/^(mailto|tel):/i.test(s)) return image ? '' : s;
  if (/^[a-z][a-z0-9+.-]*:/i.test(s)) return '';
  return s;
}

function parseAttrs(src) {
  const out = [];
  const re = /([^\s"'<>/=]+)(?:\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s"'=<>`]+)))?/g;
  let m;
  while ((m = re.exec(src))) out.push([m[1].toLowerCase(), m[2] ?? m[3] ?? m[4] ?? '']);
  return out;
}

/**
 * Cleans HTML. Options: images ('keep' | 'cdn' = only Ameba Ownd's image server | 'none'), rewriteImage(url) -> url (to point
 * images at local copies), absolute(url) -> url (resolves page-relative links against the site).
 */
export function sanitizeHtml(html, opts = {}) {
  const images = opts.images || 'keep';
  const src = String(html == null ? '' : html);
  const out = [];
  const open = [];
  let dropping = null; // the tag whose content is being dropped
  let dropDepth = 0;
  const re = /<!--[\s\S]*?(?:-->|$)|<!\[CDATA\[[\s\S]*?(?:\]\]>|$)|<!?[a-zA-Z/?][^>]*>?|<|[^<]+/g;
  let m;
  while ((m = re.exec(src))) {
    const tok = m[0];
    if (tok.startsWith('<!--') || tok.startsWith('<![CDATA[') || tok.startsWith('<!') || tok.startsWith('<?')) continue;
    if (tok === '<') { if (!dropping) out.push('&lt;'); continue; }
    if (tok[0] !== '<') {
      if (!dropping) out.push(escapeHtml(decodeEntities(tok)));
      continue;
    }
    const tm = /^<(\/?)([a-zA-Z][a-zA-Z0-9-]*)([\s\S]*?)(\/?)>?$/.exec(tok);
    if (!tm) { if (!dropping) out.push(escapeHtml(tok)); continue; }
    const closing = tm[1] === '/';
    const name = tm[2].toLowerCase();
    if (dropping) {
      if (name === dropping) { if (closing) { dropDepth--; if (dropDepth <= 0) dropping = null; } else if (!tm[4]) dropDepth++; }
      continue;
    }
    if (DROP.has(name)) { if (!closing && !tm[4] && !VOID.has(name)) { dropping = name; dropDepth = 1; } continue; }
    if (!KEEP.has(name)) continue; // unknown tag: keep its text, drop the tag
    const tag = name === 'font' ? 'span' : name === 'center' ? 'div' : name;
    if (closing) {
      if (VOID.has(name)) continue;
      const at = open.lastIndexOf(tag);
      if (at < 0) continue;
      while (open.length > at) out.push(`</${open.pop()}>`);
      continue;
    }
    const attrs = parseAttrs(tm[3]);
    const keep = [];
    const allowed = ATTRS[name] || [];
    let align = '';
    for (const [k, v] of attrs) {
      if (k === 'style') { const a = /text-align\s*:\s*([a-z]+)/i.exec(v); if (a && ALIGN.has(a[1].toLowerCase())) align = a[1].toLowerCase(); continue; }
      if (k === 'align' && ALIGN.has(v.toLowerCase())) { align = v.toLowerCase(); continue; }
      if (!allowed.includes(k)) continue;
      if (k === 'href') {
        let u = safeUrl(v);
        if (!u) continue;
        if (opts.absolute) u = opts.absolute(u);
        keep.push(`href="${escapeHtml(u)}"`);
      } else if (k === 'src') {
        let u = safeUrl(v, { image: true });
        if (!u) continue;
        if (opts.absolute && !/^data:/i.test(u)) u = opts.absolute(u);
        if (images === 'none') continue;
        if (images === 'cdn' && !isCdnImage(u) && !/^(data|blob):/i.test(u)) continue;
        if (opts.rewriteImage) u = opts.rewriteImage(u);
        keep.push(`src="${escapeHtml(u)}"`);
      } else if (k === 'target') {
        if (v === '_blank') keep.push('target="_blank" rel="noopener"');
      } else if (k === 'width' || k === 'height' || k === 'colspan' || k === 'rowspan' || k === 'span' || k === 'start') {
        if (/^\d{1,5}$/.test(v)) keep.push(`${k}="${v}"`);
      } else {
        keep.push(`${k}="${escapeHtml(decodeEntities(v))}"`);
      }
    }
    if (name === 'img' && !keep.some(a => a.startsWith('src='))) continue;
    if (name === 'img' && !keep.some(a => a.startsWith('alt='))) keep.push('alt=""');
    if (align && /^(p|div|h[1-6]|td|th|li|figure|center)$/.test(name)) keep.push(`style="text-align:${align}"`);
    if (name === 'center' && !align) keep.push('style="text-align:center"');
    out.push(`<${tag}${keep.length ? ' ' + keep.join(' ') : ''}>`);
    if (!VOID.has(name) && !tm[4]) open.push(tag);
  }
  while (open.length) out.push(`</${open.pop()}>`);
  return out.join('');
}

// Ameba Ownd's image server (the images of every site); its files answer any origin, so the browser may copy them. The made-up
// sample site keeps its pictures next to this page (/ameba-ownd-export/img/sample/), and they count as the site's images too.
export const SAMPLE_IMAGE = /^https?:\/\/[a-z0-9.:-]+\/ameba-ownd-export\/img\/sample\/[a-z0-9-]+\.png$/i;
export function isCdnImage(u) {
  const s = String(u || '');
  return /^https:\/\/cdn\.amebaowndme\.com\//i.test(s) || SAMPLE_IMAGE.test(s);
}
// the original file of an image (the pages and the feed add ?width=960 and similar)
export function bareImage(u) {
  const s = String(u || '');
  return isCdnImage(s) ? s.replace(/[?#].*$/, '') : s;
}

// the visible text of some HTML (search, excerpts, plain-text saves)
export function htmlToText(html) {
  return decodeEntities(String(html == null ? '' : html)
    .replace(/<(script|style|iframe|noscript|template)[\s\S]*?<\/\1\s*>/gi, ' ')
    .replace(/<br\s*\/?>/gi, '\n')
    .replace(/<\/(p|div|h[1-6]|li|tr|blockquote|figure|dd|dt|pre|table)\s*>/gi, '\n')
    .replace(/<li[^>]*>/gi, '・')
    .replace(/<[^>]*>/g, ''))
    .replace(/ /g, ' ')
    .replace(/[ \t]+\n/g, '\n')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}
