/* Lastleaf: note bodies that arrive as HTML. A note can be plain text or a piece of HTML (the way a web editor saves
 * bold text, lists and line breaks). Both functions here work on the string itself, with no DOM, so the worker and the
 * Node tests run the same code:
 *   htmlToText(html)  the note as plain text, with paragraphs, line breaks and list items kept as lines
 *   safeHtml(html)    the note as HTML that is safe to show: only a short list of formatting tags, no attributes except
 *                     a checked http(s) or mailto link, and no scripts, styles, images, frames, forms or event handlers.
 * Nothing here fetches anything: images and links are never loaded by this page. */

const ENTITIES = { amp: '&', lt: '<', gt: '>', quot: '"', apos: "'", nbsp: '\u00a0', ndash: '\u2013', mdash: '\u2014', hellip: '\u2026', lsquo: '\u2018', rsquo: '\u2019', ldquo: '\u201c', rdquo: '\u201d', bull: '\u2022', middot: '\u00b7', copy: '\u00a9', reg: '\u00ae', trade: '\u2122', euro: '\u20ac', pound: '\u00a3', yen: '\u00a5', cent: '\u00a2', deg: '\u00b0', times: '\u00d7', divide: '\u00f7', laquo: '\u00ab', raquo: '\u00bb', shy: '', aacute: '\u00e1', agrave: '\u00e0', acirc: '\u00e2', auml: '\u00e4', atilde: '\u00e3', aring: '\u00e5', aelig: '\u00e6', ccedil: '\u00e7', eacute: '\u00e9', egrave: '\u00e8', ecirc: '\u00ea', euml: '\u00eb', iacute: '\u00ed', igrave: '\u00ec', icirc: '\u00ee', iuml: '\u00ef', ntilde: '\u00f1', oacute: '\u00f3', ograve: '\u00f2', ocirc: '\u00f4', ouml: '\u00f6', otilde: '\u00f5', oslash: '\u00f8', uacute: '\u00fa', ugrave: '\u00f9', ucirc: '\u00fb', uuml: '\u00fc', yacute: '\u00fd', szlig: '\u00df' };

export function decodeEntities(s) {
  return String(s).replace(/&(#x[0-9a-f]{1,6}|#[0-9]{1,7}|[a-z][a-z0-9]{1,31});?/gi, (m, e) => {
    if (e[0] === '#') {
      const cp = e[1] === 'x' || e[1] === 'X' ? parseInt(e.slice(2), 16) : parseInt(e.slice(1), 10);
      if (!Number.isFinite(cp) || cp <= 0 || cp > 0x10ffff || (cp >= 0xd800 && cp <= 0xdfff)) return '\ufffd';
      return String.fromCodePoint(cp);
    }
    if (ENTITIES[e] != null) return ENTITIES[e];
    const low = ENTITIES[e.toLowerCase()];
    if (low == null) return m;
    return /^[A-Z]/.test(e) && /^[a-z]+(acute|grave|circ|uml|tilde|ring|cedil|slash|elig)$/.test(e.toLowerCase()) ? low.toUpperCase() : low;
  });
}

export const escHtml = s => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

// Does this string look like HTML markup rather than text that happens to contain a "<"?
const TAG_HINT = /<\s*\/?\s*(p|div|br|span|b|i|u|s|strong|em|ul|ol|li|h[1-6]|font|table|tr|td|th|a|blockquote|pre|code|hr|strike|del|sup|sub|center)\b[^>]*>/i;
export const looksLikeHtml = s => typeof s === 'string' && TAG_HINT.test(s);

// the parts of an HTML string: text runs, tags and the bodies of elements whose content is never shown
const DROP_WITH_CONTENT = new Set(['script', 'style', 'head', 'title', 'template', 'noscript', 'iframe', 'object', 'embed', 'svg', 'math', 'textarea', 'select', 'option', 'xml']);
function* tokens(html) {
  const s = String(html);
  let i = 0;
  while (i < s.length) {
    const lt = s.indexOf('<', i);
    if (lt < 0) { yield { t: 'text', v: s.slice(i) }; return; }
    if (lt > i) yield { t: 'text', v: s.slice(i, lt) };
    if (s.startsWith('<!--', lt)) { const end = s.indexOf('-->', lt + 4); i = end < 0 ? s.length : end + 3; continue; }
    if (s[lt + 1] === '!' || s[lt + 1] === '?') { const end = s.indexOf('>', lt); i = end < 0 ? s.length : end + 1; continue; }
    const m = /^<\s*(\/?)\s*([a-zA-Z][a-zA-Z0-9:-]*)([^>]*)>/.exec(s.slice(lt, lt + 4096));
    if (!m) { yield { t: 'text', v: '<' }; i = lt + 1; continue; }
    const name = m[2].toLowerCase();
    const close = m[1] === '/';
    i = lt + m[0].length;
    if (!close && DROP_WITH_CONTENT.has(name) && !/\/\s*$/.test(m[3])) {
      const re = new RegExp(`<\\s*/\\s*${name}\\s*>`, 'i');
      const rest = s.slice(i);
      const e = re.exec(rest);
      i = e ? i + e.index + e[0].length : s.length;
      continue;
    }
    yield { t: close ? 'close' : 'open', name, attrs: m[3] };
  }
}

const BLOCK = new Set(['p', 'div', 'section', 'article', 'header', 'footer', 'blockquote', 'pre', 'h1', 'h2', 'h3', 'h4', 'h5', 'h6', 'ul', 'ol', 'table', 'tr', 'center', 'address', 'dl', 'dt', 'dd', 'figure', 'hr']);

/** The note as plain text: block elements and <br> become line breaks, list items get "- " (or "1. "), table cells a tab. */
export function htmlToText(html) {
  let out = '';
  const lists = [];
  const nl = () => { if (out && !out.endsWith('\n')) out += '\n'; };
  for (const k of tokens(html)) {
    if (k.t === 'text') { out += decodeEntities(k.v.replace(/[\r\n\t ]+/g, ' ')); continue; }
    const n = k.name;
    if (n === 'br') { out += '\n'; continue; }
    if (k.t === 'open') {
      if (n === 'ul' || n === 'ol') { nl(); lists.push({ ol: n === 'ol', i: 0 }); continue; }
      if (n === 'li') { nl(); const l = lists[lists.length - 1]; out += l && l.ol ? `${++l.i}. ` : '- '; continue; }
      if (n === 'td' || n === 'th') { if (out && !out.endsWith('\n')) out += '\t'; continue; }
      if (BLOCK.has(n)) nl();
    } else {
      if (n === 'ul' || n === 'ol') { lists.pop(); nl(); continue; }
      if (n === 'li' || BLOCK.has(n)) nl();
    }
  }
  return out.replace(/\u00a0/g, ' ').split('\n').map(l => l.replace(/[ \t]+$/g, '').replace(/^ +/, '')).join('\n').replace(/\n{3,}/g, '\n\n').trim();
}

// the formatting a note may keep; everything else is dropped (its text stays)
const KEEP = { p: 'p', div: 'p', br: 'br', b: 'strong', strong: 'strong', i: 'em', em: 'em', u: 'u', s: 's', strike: 's', del: 's', ul: 'ul', ol: 'ol', li: 'li', h1: 'h4', h2: 'h4', h3: 'h4', h4: 'h4', h5: 'h4', h6: 'h4', blockquote: 'blockquote', pre: 'pre', code: 'code', sup: 'sup', sub: 'sub', hr: 'hr', a: 'a', table: 'table', tr: 'tr', td: 'td', th: 'td', tbody: null, thead: null };
const VOID = new Set(['br', 'hr']);
function safeHref(attrs) {
  const m = /\bhref\s*=\s*("([^"]*)"|'([^']*)'|([^\s>]+))/i.exec(attrs || '');
  if (!m) return null;
  const raw = decodeEntities(m[2] ?? m[3] ?? m[4] ?? '').replace(/[\u0000- \u007f-\u009f]+/g, '');
  if (!/^(https?:\/\/|mailto:)/i.test(raw) || raw.length > 2048) return null;
  return raw;
}

/** Safe HTML for the reading pane. Tags outside the list are dropped but their text is kept; attributes are dropped
 *  except a checked link address (shown as a link that opens in a new tab with no referrer). Unclosed tags are closed. */
export function safeHtml(html) {
  let out = '';
  const open = [];
  for (const k of tokens(html)) {
    if (k.t === 'text') { out += escHtml(decodeEntities(k.v)); continue; }
    const tag = KEEP[k.name];
    if (!tag) continue;
    if (k.t === 'open') {
      if (VOID.has(tag)) { out += `<${tag}>`; continue; }
      if (tag === 'a') {
        const href = safeHref(k.attrs);
        if (!href) { open.push(null); continue; }
        out += `<a href="${escHtml(href)}" rel="noopener noreferrer nofollow" target="_blank">`;
      } else out += `<${tag}>`;
      open.push(tag);
    } else {
      if (VOID.has(tag)) continue;
      const at = open.lastIndexOf(tag);
      const nullAt = tag === 'a' ? open.lastIndexOf(null) : -1;
      if (nullAt > at) { open.splice(nullAt, 1); continue; }
      if (at < 0) continue;
      while (open.length > at) { const t = open.pop(); if (t) out += `</${t}>`; }
    }
  }
  while (open.length) { const t = open.pop(); if (t) out += `</${t}>`; }
  return out.replace(/(<p>\s*<\/p>)+/g, '').trim();
}
