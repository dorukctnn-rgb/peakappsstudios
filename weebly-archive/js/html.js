// A small, forgiving HTML parser for Rehoused. Web Workers have no DOMParser, and the unit tests run in Node, so the
// pages of a Weebly archive are parsed here: tags and attributes, comments, raw text (script, style, textarea, title),
// void elements, the usual implied end tags (p, li, td, tr, option, dt, dd) and named and numeric character references.
// It builds a plain tree: { type: 'el', tag, attrs, children, parent } and { type: 'text', text, parent }.
// Nothing here runs the page's scripts or loads anything: the tree is data.

const VOID = new Set(['area', 'base', 'br', 'col', 'embed', 'hr', 'img', 'input', 'link', 'meta', 'param', 'source', 'track', 'wbr', 'keygen', 'command', 'basefont', 'frame']);
const RAW = new Set(['script', 'style', 'textarea', 'title', 'xmp', 'noembed', 'noframes']);
// an opening tag of the key closes an open element of these kinds first (only up to the nearest table or list)
const CLOSES = {
  p: ['p'], div: ['p'], ul: ['p'], ol: ['p'], table: ['p'], h1: ['p'], h2: ['p'], h3: ['p'], h4: ['p'], h5: ['p'], h6: ['p'],
  blockquote: ['p'], pre: ['p'], form: ['p'], hr: ['p'], section: ['p'], article: ['p'], header: ['p'], footer: ['p'], nav: ['p'],
  li: ['li', 'p'], dt: ['dt', 'dd', 'p'], dd: ['dt', 'dd', 'p'], tr: ['tr', 'td', 'th'], td: ['td', 'th'], th: ['td', 'th'],
  tbody: ['tbody', 'thead', 'tfoot', 'tr', 'td', 'th'], thead: ['tbody', 'thead', 'tfoot', 'tr', 'td', 'th'], tfoot: ['tbody', 'thead', 'tfoot', 'tr', 'td', 'th'],
  option: ['option'], optgroup: ['option', 'optgroup'],
};
const SCOPE = new Set(['table', 'ul', 'ol', 'dl', 'select', 'html', 'body', 'td', 'th']);

// Latin-1 names in code point order from 160, then the common typographic and Latin Extended ones
const LATIN1 = 'nbsp iexcl cent pound curren yen brvbar sect uml copy ordf laquo not shy reg macr deg plusmn sup2 sup3 acute micro para middot cedil sup1 ordm raquo frac14 frac12 frac34 iquest Agrave Aacute Acirc Atilde Auml Aring AElig Ccedil Egrave Eacute Ecirc Euml Igrave Iacute Icirc Iuml ETH Ntilde Ograve Oacute Ocirc Otilde Ouml times Oslash Ugrave Uacute Ucirc Uuml Yacute THORN szlig agrave aacute acirc atilde auml aring aelig ccedil egrave eacute ecirc euml igrave iacute icirc iuml eth ntilde ograve oacute ocirc otilde ouml divide oslash ugrave uacute ucirc uuml yacute thorn yuml'.split(' ');
const ENT = { amp: 38, lt: 60, gt: 62, quot: 34, apos: 39, OElig: 338, oelig: 339, Scaron: 352, scaron: 353, Yuml: 376, fnof: 402, circ: 710, tilde: 732,
  ensp: 8194, emsp: 8195, thinsp: 8201, zwnj: 8204, zwj: 8205, lrm: 8206, rlm: 8207, ndash: 8211, mdash: 8212, lsquo: 8216, rsquo: 8217, sbquo: 8218,
  ldquo: 8220, rdquo: 8221, bdquo: 8222, dagger: 8224, Dagger: 8225, bull: 8226, hellip: 8230, permil: 8240, prime: 8242, Prime: 8243, lsaquo: 8249,
  rsaquo: 8250, oline: 8254, euro: 8364, trade: 8482, larr: 8592, uarr: 8593, rarr: 8594, darr: 8595, harr: 8596, hearts: 9829, spades: 9824, clubs: 9827,
  diams: 9830, Alpha: 913, alpha: 945, beta: 946, gamma: 947, delta: 948, pi: 960, mu: 956, Omega: 937, omega: 969, sigma: 963, infin: 8734, ne: 8800,
  le: 8804, ge: 8805, minus: 8722, radic: 8730, sum: 8721, check: 10003, star: 9734, starf: 9733, Gbreve: 286, gbreve: 287, Idot: 304, inodot: 305,
  Scedil: 350, scedil: 351, Ccaron: 268, ccaron: 269, Zcaron: 381, zcaron: 382, Lstrok: 321, lstrok: 322 };
LATIN1.forEach((n, i) => { ENT[n] = 160 + i; });

export function decodeEntities(s) {
  if (!s || s.indexOf('&') < 0) return s;
  return s.replace(/&(#x[0-9a-fA-F]{1,6}|#[0-9]{1,7}|[A-Za-z][A-Za-z0-9]{1,31});?/g, (m, ref) => {
    let cp;
    if (ref[0] === '#') cp = ref[1] === 'x' || ref[1] === 'X' ? parseInt(ref.slice(2), 16) : parseInt(ref.slice(1), 10);
    else cp = ENT[ref];
    if (cp === undefined || Number.isNaN(cp)) return m;
    if (cp === 0 || cp > 0x10ffff || (cp >= 0xd800 && cp <= 0xdfff)) return '�';
    // Windows-1252 numbers that pages often use for curly quotes
    if (cp >= 128 && cp <= 159) cp = [8364, 129, 8218, 402, 8222, 8230, 8224, 8225, 710, 8240, 352, 8249, 338, 141, 381, 143, 144, 8216, 8217, 8220, 8221, 8226, 8211, 8212, 732, 8482, 353, 8250, 339, 157, 382, 376][cp - 128];
    return String.fromCodePoint(cp);
  });
}

const el = (tag, attrs, parent) => ({ type: 'el', tag, attrs, children: [], parent });

function parseAttrs(src) {
  const attrs = {};
  const re = /([^\s"'>\/=]+)(?:\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s>]+)))?/g;
  let m;
  while ((m = re.exec(src))) {
    const name = m[1].toLowerCase();
    if (name in attrs) continue;
    const v = m[2] !== undefined ? m[2] : m[3] !== undefined ? m[3] : m[4] !== undefined ? m[4] : '';
    attrs[name] = decodeEntities(v);
  }
  return attrs;
}

/** Parse an HTML string into a tree. Returns the root node ({ type: 'el', tag: '#root' }). */
export function parseHtml(html) {
  const s = String(html || '');
  const root = el('#root', {}, null);
  const stack = [root];
  const top = () => stack[stack.length - 1];
  const addText = text => {
    if (!text) return;
    const t = top();
    const last = t.children[t.children.length - 1];
    if (last && last.type === 'text') last.text += text;
    else t.children.push({ type: 'text', text, parent: t });
  };
  const closeTo = i => { stack.length = i; };
  let i = 0;
  const n = s.length;
  while (i < n) {
    const lt = s.indexOf('<', i);
    if (lt < 0) { addText(decodeEntities(s.slice(i))); break; }
    if (lt > i) addText(decodeEntities(s.slice(i, lt)));
    i = lt;
    if (s.startsWith('<!--', i)) {
      const end = s.indexOf('-->', i + 4);
      i = end < 0 ? n : end + 3;
      continue;
    }
    if (s[i + 1] === '!' || s[i + 1] === '?') {
      const end = s.indexOf('>', i);
      i = end < 0 ? n : end + 1;
      continue;
    }
    const close = s[i + 1] === '/';
    const nameM = /^[A-Za-z][A-Za-z0-9:-]*/.exec(s.slice(i + (close ? 2 : 1), i + (close ? 2 : 1) + 64));
    if (!nameM) { addText('<'); i += 1; continue; }
    const tag = nameM[0].toLowerCase();
    // find the end of the tag, skipping quoted attribute values
    let j = i + (close ? 2 : 1) + nameM[0].length;
    let q = null;
    for (; j < n; j++) {
      const c = s[j];
      if (q) { if (c === q) q = null; continue; }
      if (c === '"' || c === "'") { if (/[=\s]/.test(s[j - 1] || '') || s[j - 1] === '=') q = c; continue; }
      if (c === '>') break;
    }
    const inner = s.slice(i + (close ? 2 : 1) + nameM[0].length, j);
    i = j >= n ? n : j + 1;
    if (close) {
      for (let k = stack.length - 1; k > 0; k--) {
        if (stack[k].tag === tag) { closeTo(k); break; }
        if (SCOPE.has(stack[k].tag) && tag !== stack[k].tag && !['table', 'ul', 'ol', 'dl', 'select', 'body', 'html'].includes(tag)) break;
      }
      continue;
    }
    const closes = CLOSES[tag];
    if (closes) {
      for (let k = stack.length - 1; k > 0; k--) {
        const t = stack[k].tag;
        if (closes.includes(t)) { closeTo(k); break; }
        if (SCOPE.has(t) || t === 'div') break;
      }
    }
    const node = el(tag, parseAttrs(inner), top());
    top().children.push(node);
    const selfClose = /\/\s*$/.test(inner);
    if (VOID.has(tag) || selfClose) continue;
    if (RAW.has(tag)) {
      const endRe = new RegExp(`</${tag}\\s*>`, 'i');
      const rest = s.slice(i);
      const m = endRe.exec(rest);
      const body = m ? rest.slice(0, m.index) : rest;
      if (body) node.children.push({ type: 'text', text: tag === 'title' || tag === 'textarea' ? decodeEntities(body) : body, parent: node, raw: true });
      i = m ? i + m.index + m[0].length : n;
      continue;
    }
    stack.push(node);
  }
  return root;
}

/* ---------- small tree helpers ---------- */
export const isEl = (n, tag) => !!n && n.type === 'el' && (!tag || n.tag === tag);
export const classes = n => (isEl(n) && n.attrs.class ? n.attrs.class.split(/\s+/).filter(Boolean) : []);
export const hasClass = (n, c) => classes(n).includes(c);
export const hasClassPrefix = (n, p) => classes(n).some(c => c.startsWith(p));

export function walk(node, fn) {
  const stack = [node];
  while (stack.length) {
    const x = stack.pop();
    if (fn(x) === false) continue;
    if (x.children) for (let k = x.children.length - 1; k >= 0; k--) stack.push(x.children[k]);
  }
}
export function findAll(node, pred) {
  const out = [];
  walk(node, x => { if (x !== node && x.type === 'el' && pred(x)) out.push(x); });
  return out;
}
export function find(node, pred) {
  let hit = null;
  walk(node, x => { if (hit) return false; if (x !== node && x.type === 'el' && pred(x)) { hit = x; return false; } return true; });
  return hit;
}
export const byId = (node, id) => find(node, x => x.attrs.id === id);
export function textOf(node) {
  if (!node) return '';
  if (node.type === 'text') return node.raw && node.parent && (node.parent.tag === 'script' || node.parent.tag === 'style') ? '' : node.text;
  if (node.type !== 'el' || node.tag === 'script' || node.tag === 'style' || node.tag === 'noscript') return '';
  let out = '';
  for (const c of node.children) out += c.type === 'el' && (c.tag === 'br') ? '\n' : textOf(c);
  return out;
}
export const cleanText = s => String(s || '').replace(/[ \s]+/g, ' ').trim();
