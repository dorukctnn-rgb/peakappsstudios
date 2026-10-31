/* Ficshelf's small HTML reader and cleaner. It works in a page, in a Web Worker and in Node (no DOM is needed), and it is
 * tolerant: a file cut off in the middle (the first 64 KB of a download) still gives a tree, unclosed tags are closed, and a
 * hostile file (100,000 nested tags, one 50 MB line) cannot make it run away: the depth and the node count are capped.
 * parseHtml(text) gives a tree of { t: 'el', tag, attrs, kids } and { t: 'text', text } nodes; find/findAll/q ask it
 * questions; clean() writes a safe copy of a part of it (an allowlist of tags and attributes, no script, no external
 * image, no link that runs code), as HTML or as XHTML for an EPUB. Nothing here touches the network. */

const FROM = String.fromCharCode;
const VOID = new Set(['area', 'base', 'br', 'col', 'embed', 'hr', 'img', 'input', 'link', 'meta', 'param', 'source', 'track', 'wbr']);
const RAW = new Set(['script', 'style']);
const BLOCK = new Set(['address', 'article', 'aside', 'blockquote', 'center', 'details', 'div', 'dl', 'fieldset', 'figure', 'footer', 'form', 'h1', 'h2', 'h3', 'h4', 'h5', 'h6', 'header', 'hr', 'main', 'nav', 'ol', 'p', 'pre', 'section', 'table', 'ul']);
const CLOSES = { li: ['li'], dt: ['dt', 'dd'], dd: ['dt', 'dd'], tr: ['tr', 'td', 'th'], td: ['td', 'th'], th: ['td', 'th'], option: ['option'], thead: ['tbody', 'tfoot'], tbody: ['thead', 'tbody', 'tfoot'] };

const ENT = {
  amp: '&', lt: '<', gt: '>', quot: '"', apos: "'", nbsp: FROM(160), copy: '©', reg: '®', trade: '™', hellip: '…',
  mdash: '—', ndash: '–', lsquo: '‘', rsquo: '’', ldquo: '“', rdquo: '”', sbquo: '‚', bdquo: '„', bull: '•',
  middot: '·', times: '×', divide: '÷', deg: '°', plusmn: '±', frac12: '½', frac14: '¼', frac34: '¾',
  laquo: '«', raquo: '»', iexcl: '¡', iquest: '¿', euro: '€', pound: '£', yen: '¥', cent: '¢', sect: '§',
  para: '¶', dagger: '†', eacute: 'é', egrave: 'è', agrave: 'à', aacute: 'á', uuml: 'ü', ouml: 'ö', auml: 'ä',
  ntilde: 'ñ', ccedil: 'ç', szlig: 'ß', oacute: 'ó', iacute: 'í', uacute: 'ú', ecirc: 'ê', acirc: 'â',
  larr: '←', rarr: '→', hearts: '♥', shy: FROM(173), zwj: FROM(0x200d), zwnj: FROM(0x200c), ensp: FROM(0x2002), emsp: FROM(0x2003), thinsp: FROM(0x2009),
};
export function decode(s) {
  if (s.indexOf('&') < 0) return s;
  return s.replace(/&(#x[0-9a-f]{1,6}|#[0-9]{1,7}|[a-z][a-z0-9]{1,9});/gi, (m, e) => {
    if (e[0] === '#') {
      const n = e[1] === 'x' || e[1] === 'X' ? parseInt(e.slice(2), 16) : parseInt(e.slice(1), 10);
      if (!(n > 0) || n > 0x10ffff || (n >= 0xd800 && n < 0xe000)) return FROM(0xfffd);
      return String.fromCodePoint(n);
    }
    const v = ENT[e] ?? ENT[e.toLowerCase()];
    return v === undefined ? m : v;
  });
}

function parseAttrs(s) {
  const attrs = {};
  const re = /([^\s"'<>\/=]+)(?:\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s"'=<>`]+)))?/g;
  let m;
  let n = 0;
  while ((m = re.exec(s)) && n++ < 64) {
    const k = m[1].toLowerCase();
    if (!(k in attrs)) attrs[k] = decode(m[2] ?? m[3] ?? m[4] ?? '');
  }
  return attrs;
}

/* text: the HTML (or XML) as a string. Returns { root, truncated }: truncated is true when the node cap stopped the parse. */
export function parseHtml(text, { maxNodes = 400000, maxDepth = 200 } = {}) {
  const s = String(text);
  const root = { t: 'el', tag: '#root', attrs: {}, kids: [] };
  const stack = [root];
  let overflow = 0;
  let nodes = 0;
  let truncated = false;
  const n = s.length;
  let i = 0;
  const top = () => stack[stack.length - 1];
  const addText = str => {
    if (!str) return;
    const t = top();
    const last = t.kids[t.kids.length - 1];
    if (last && last.t === 'text') last.text += str; else { t.kids.push({ t: 'text', text: str }); nodes++; }
  };
  while (i < n) {
    if (nodes > maxNodes) { truncated = true; break; }
    const lt = s.indexOf('<', i);
    if (lt < 0) { addText(decode(s.slice(i))); break; }
    if (lt > i) addText(decode(s.slice(i, lt)));
    i = lt;
    const c1 = s.charCodeAt(i + 1);
    if (s.startsWith('<!--', i)) { const e = s.indexOf('-->', i + 4); i = e < 0 ? n : e + 3; continue; }
    if (c1 === 33 || c1 === 63) { // <! or <?
      if (s.startsWith('<![CDATA[', i)) { const e = s.indexOf(']]>', i); addText(s.slice(i + 9, e < 0 ? n : e)); i = e < 0 ? n : e + 3; continue; }
      const e = s.indexOf('>', i); i = e < 0 ? n : e + 1; continue;
    }
    if (c1 === 47) { // </tag>
      const e = s.indexOf('>', i);
      const name = s.slice(i + 2, e < 0 ? n : e).trim().split(/[\s/]/)[0].toLowerCase();
      i = e < 0 ? n : e + 1;
      if (!name) continue;
      if (overflow > 0 && stack.length >= maxDepth) { overflow--; continue; }
      for (let k = stack.length - 1; k > 0; k--) if (stack[k].tag === name) { stack.length = k; break; }
      continue;
    }
    if (!((c1 >= 65 && c1 <= 90) || (c1 >= 97 && c1 <= 122))) { addText('<'); i++; continue; }
    // an open tag: find its end, skipping quoted values
    let j = i + 1;
    let q = 0;
    while (j < n) {
      const ch = s.charCodeAt(j);
      if (q) { if (ch === q) q = 0; } else if (ch === 34 || ch === 39) q = ch; else if (ch === 62) break;
      j++;
    }
    const inner = s.slice(i + 1, j);
    const nm = /^[^\s/>]+/.exec(inner)[0];
    const tag = nm.toLowerCase();
    const selfClose = inner.endsWith('/');
    const attrs = parseAttrs(inner.slice(nm.length));
    const after = j < n ? j + 1 : n;
    // implied end tags
    const t0 = top();
    if (CLOSES[tag] && CLOSES[tag].includes(t0.tag) && stack.length > 1) stack.pop();
    else if (BLOCK.has(tag) && t0.tag === 'p' && stack.length > 1) stack.pop();
    const el = { t: 'el', tag, attrs, kids: [] };
    top().kids.push(el);
    nodes++;
    if (RAW.has(tag) && !selfClose) {
      const m = new RegExp('</' + tag + '\\b', 'i').exec(s.slice(after, after + 4000000));
      const e = m ? after + m.index : n;
      if (e > after) el.kids.push({ t: 'text', text: s.slice(after, Math.min(e, after + 200000)) });
      const ce = s.indexOf('>', e);
      i = ce < 0 ? n : ce + 1;
      continue;
    }
    i = after;
    if (VOID.has(tag) || selfClose) continue;
    if (stack.length >= maxDepth) overflow++; else stack.push(el);
  }
  return { root, truncated };
}

/* ------------------------------------------------------------------ questions */
const hasClass = (el, c) => el.t === 'el' && (' ' + (el.attrs.class || '') + ' ').toLowerCase().includes(' ' + c + ' ');
export { hasClass };
function compound(sel) {
  const parts = { tag: null, id: null, classes: [], attrs: [] };
  const m = sel.match(/^[a-z0-9:*-]+/i);
  if (m) { parts.tag = m[0].toLowerCase(); sel = sel.slice(m[0].length); }
  const re = /([#.])([\w-]+)|\[([\w:-]+)(?:([~^$*]?=)"?([^"\]]*)"?)?\]/g;
  let x;
  while ((x = re.exec(sel))) {
    if (x[1] === '#') parts.id = x[2];
    else if (x[1] === '.') parts.classes.push(x[2].toLowerCase());
    else parts.attrs.push([x[3].toLowerCase(), x[4] || null, x[5]]);
  }
  return parts;
}
function matches(el, p) {
  if (el.t !== 'el') return false;
  if (p.tag && p.tag !== '*' && el.tag !== p.tag) return false;
  if (p.id && el.attrs.id !== p.id) return false;
  for (const c of p.classes) if (!hasClass(el, c)) return false;
  for (const [k, op, v] of p.attrs) {
    if (!(k in el.attrs)) return false;
    const a = el.attrs[k];
    if (op === '=' && a !== v) return false;
    if (op === '*=' && !a.includes(v)) return false;
    if (op === '^=' && !a.startsWith(v)) return false;
    if (op === '$=' && !a.endsWith(v)) return false;
    if (op === '~=' && !a.split(/\s+/).includes(v)) return false;
  }
  return true;
}
/* All elements under node (document order) that match a selector: compounds of tag, #id, .class and [attr] joined by a space
 * (descendant) or > (child). It is the small part of CSS the readers need. */
export function findAll(node, selector, { limit = Infinity } = {}) {
  const steps = [];
  for (const piece of selector.replace(/\s*>\s*/g, ' > ').trim().split(/\s+/)) {
    if (piece === '>') steps[steps.length - 1].child = true; else steps.push({ p: compound(piece), child: false });
  }
  const out = [];
  const walk = (el, ancestors) => {
    for (const k of el.kids || []) {
      if (k.t !== 'el') continue;
      if (matches(k, steps[steps.length - 1].p)) {
        // check the chain of ancestors against the earlier steps
        let ok = true;
        let at = ancestors.length - 1;
        for (let si = steps.length - 2; si >= 0 && ok; si--) {
          const needChild = steps[si + 1].child;
          if (needChild) { ok = at >= 0 && matches(ancestors[at], steps[si].p); at--; } else {
            while (at >= 0 && !matches(ancestors[at], steps[si].p)) at--;
            ok = at >= 0; at--;
          }
        }
        if (ok) { out.push(k); if (out.length >= limit) return true; }
      }
      ancestors.push(k);
      const done = walk(k, ancestors);
      ancestors.pop();
      if (done) return true;
    }
    return false;
  };
  walk(node, node.tag === '#root' ? [] : [node]);
  return out;
}
export const q = (node, selector) => findAll(node, selector, { limit: 1 })[0] || null;

/* The text of a node with runs of white space made into one space. */
const SPACED = new Set(['dt', 'dd', 'li', 'tr', 'td', 'th', 'p', 'div', 'br', 'h1', 'h2', 'h3', 'h4', 'h5', 'h6', 'blockquote']);
export function textOf(node, { blocks = false } = {}) {
  let out = '';
  const walk = el => {
    if (el.t === 'text') { out += el.text; return; }
    if (el.tag === 'script' || el.tag === 'style') return;
    if (el.tag === 'br') { out += blocks ? '\n' : ' '; return; }
    const b = blocks && BLOCK.has(el.tag);
    if (b) out += '\n';
    else if (!blocks && SPACED.has(el.tag)) out += ' ';
    for (const k of el.kids) walk(k);
    if (b) out += '\n';
    else if (!blocks && SPACED.has(el.tag)) out += ' ';
  };
  walk(node);
  return blocks ? out.replace(/[ \t\f\v ]+/g, ' ').replace(/ *\n */g, '\n').replace(/\n{3,}/g, '\n\n').trim() : out.replace(/\s+/g, ' ').trim();
}

/* ------------------------------------------------------------------ the cleaner */
const KEEP = new Set(['p', 'br', 'em', 'strong', 'i', 'b', 'u', 's', 'strike', 'del', 'ins', 'a', 'h1', 'h2', 'h3', 'h4', 'h5', 'h6', 'ul', 'ol', 'li', 'blockquote', 'hr',
  'img', 'table', 'thead', 'tbody', 'tfoot', 'tr', 'td', 'th', 'caption', 'div', 'span', 'sup', 'sub', 'small', 'pre', 'code', 'dl', 'dt', 'dd', 'abbr', 'cite', 'q', 'center', 'font', 'big', 'tt', 'mark', 'ruby', 'rt', 'rp']);
const DROP = new Set(['script', 'style', 'iframe', 'object', 'embed', 'noscript', 'template', 'svg', 'math', 'canvas', 'audio', 'video', 'applet', 'frame', 'frameset', 'form', 'input', 'button', 'select', 'textarea', 'link', 'meta', 'base', 'head', 'title', 'head']);
const MAP = { strike: 's', center: 'div', font: 'span', big: 'span', tt: 'code', mark: 'span' };
const esc = s => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
const escAttr = s => esc(s).replace(/"/g, '&quot;');
const XML_BAD = new RegExp('[' + FROM(0) + '-' + FROM(8) + FROM(11) + FROM(12) + FROM(14) + '-' + FROM(31) + FROM(0xfffe) + FROM(0xffff) + ']', 'g');
const URL_JUNK = new RegExp('[' + FROM(0) + '-' + FROM(32) + FROM(127) + '-' + FROM(160) + FROM(0x200b) + '-' + FROM(0x200f) + FROM(0x2028) + FROM(0x2029) + FROM(0xfeff) + ']', 'g');
const DATA_IMG = /^data:image\/(png|jpe?g|gif|webp);base64,[a-z0-9+/=\s]+$/i;
const AO3_HOST = /^https?:\/\/(?:[a-z0-9-]+\.)*(?:archiveofourown\.(?:org|net|com)|ao3\.org)(?:[/:?#]|$)/i;
export const isAo3Url = u => AO3_HOST.test(String(u || '').replace(URL_JUNK, ''));
/* The id in a link to a work (…/works/12345), else null. */
export function workIdOf(url) {
  const m = /^https?:\/\/(?:[a-z0-9-]+\.)*(?:archiveofourown\.(?:org|net|com)|ao3\.org)\/works\/(\d{1,12})(?:[/?#]|$)/i.exec(String(url || '').replace(URL_JUNK, ''));
  return m ? m[1] : null;
}

/* Writes a safe copy of the nodes as a string.
 *  xml: true writes XHTML (every tag closed, no entity but the five), for an EPUB.
 *  image(src, alt): called for each <img>; return a data: URL or a bare file name to keep it, or null to drop it (the alt text stays).
 *  link: 'web' keeps http, https and mailto links (rel set); 'reader' turns links to AO3 into text (the page never sends a visitor there
 *        on its own) or, when libraryHas(id) is true for a work link, into a link to that work in the library (data-work).
 * Returns { html, text, images } where images lists the sources kept. */
export function clean(nodes, { xml = false, image = null, link = 'web', libraryHas = null, maxLength = 40000000 } = {}) {
  const parts = [];
  let length = 0;
  const images = [];
  const emit = s => { if (length < maxLength) { parts.push(s); length += s.length; } };
  const t = s => (xml ? s.replace(XML_BAD, '') : s);
  const walk = (list, depth) => {
    for (const nd of list) {
      if (length >= maxLength) return;
      if (nd.t === 'text') { emit(esc(t(nd.text))); continue; }
      let tag = nd.tag;
      if (DROP.has(tag)) continue;
      if (depth > 120) { emit(esc(textOf(nd))); continue; }
      const attrs = nd.attrs;
      const lang = attrs.lang && /^[a-z]{2,3}(-[a-z0-9]{2,8})*$/i.test(attrs.lang) ? attrs.lang : null;
      const dir = attrs.dir && /^(rtl|ltr)$/i.test(attrs.dir) ? attrs.dir.toLowerCase() : null;
      const common = (lang ? (xml ? ` xml:lang="${escAttr(lang)}" lang="${escAttr(lang)}"` : ` lang="${escAttr(lang)}"`) : '') + (dir ? ` dir="${dir}"` : '');
      if (!KEEP.has(tag)) { walk(nd.kids, depth + 1); continue; }
      let cls = '';
      if (tag === 'center' || (attrs.align || '').toLowerCase() === 'center') cls = ' class="center"';
      else if ((tag === 'p' || tag === 'div') && (attrs.align || '').toLowerCase() === 'right') cls = ' class="right"';
      tag = MAP[tag] || tag;
      if (tag === 'br' || tag === 'hr') { emit(xml ? `<${tag}/>` : `<${tag}>`); continue; }
      if (tag === 'img') {
        const src = String(attrs.src || '').trim();
        const alt = t(attrs.alt || '');
        let keep = null;
        if (DATA_IMG.test(src)) keep = src.replace(/\s+/g, '');
        else if (image) keep = image(src, alt);
        if (keep) { images.push(keep); emit(`<img src="${escAttr(keep)}" alt="${escAttr(alt)}"${xml ? '/' : ''}>`); } else emit(`<span class="noimg">[${esc(alt || 'image')}]</span>`);
        continue;
      }
      if (tag === 'a') {
        const href = String(attrs.href || '').trim().replace(URL_JUNK, '');
        const web = /^(https?:|mailto:)/i.test(href);
        if (web && link === 'reader' && isAo3Url(href)) {
          const id = workIdOf(href);
          if (id && libraryHas && libraryHas(id)) { emit(`<a href="#" data-work="${id}" class="inlib">`); walk(nd.kids, depth + 1); emit('</a>'); } else { emit('<span class="ao3link">'); walk(nd.kids, depth + 1); emit('</span>'); }
        } else if (web) {
          emit(`<a href="${escAttr(href)}" rel="noopener noreferrer nofollow"${link === 'reader' ? ' target="_blank"' : ''}>`);
          walk(nd.kids, depth + 1);
          emit('</a>');
        } else walk(nd.kids, depth + 1);
        continue;
      }
      let extra = '';
      if ((tag === 'td' || tag === 'th')) {
        const cs = parseInt(attrs.colspan, 10), rs = parseInt(attrs.rowspan, 10);
        if (cs > 1 && cs < 100) extra += ` colspan="${cs}"`;
        if (rs > 1 && rs < 100) extra += ` rowspan="${rs}"`;
      }
      if (tag === 'ol') { const st = parseInt(attrs.start, 10); if (st > 0 && st < 100000) extra += ` start="${st}"`; }
      emit(`<${tag}${cls}${common}${extra}>`);
      walk(nd.kids, depth + 1);
      emit(`</${tag}>`);
    }
  };
  walk(nodes, 0);
  return { html: parts.join(''), images };
}

/* Plain text of an HTML string made by clean(): paragraphs separated by a blank line. */
export function htmlToText(html) {
  const { root } = parseHtml(html);
  return textOf(root, { blocks: true });
}
export const escapeHtml = esc;
export const escapeAttr = escAttr;
