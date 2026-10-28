// The HTML inside a course export (pages, assignment descriptions, quiz questions) is written by the teacher in Canvas's
// editor or pasted from elsewhere. Before it is shown it goes through an allowlist: no scripts, no event handlers, no
// styles that load anything, no frames, and every link and picture address is rewritten by the caller (files inside the
// export become blob addresses, links to other course items become in-page links, anything else is dropped). Runs without
// a DOM, so the unit tests can check it in Node.
import { decodeEntities } from './xml.js';

const MORE = {
  copy: 169, reg: 174, trade: 8482, hellip: 8230, mdash: 8212, ndash: 8211, lsquo: 8216, rsquo: 8217, ldquo: 8220,
  rdquo: 8221, laquo: 171, raquo: 187, middot: 183, bull: 8226, deg: 176, plusmn: 177, times: 215, divide: 247,
  frac12: 189, frac14: 188, frac34: 190, sup2: 178, sup3: 179, micro: 181, para: 182, sect: 167, cent: 162,
  pound: 163, euro: 8364, yen: 165, iexcl: 161, iquest: 191, shy: 173, ensp: 8194, emsp: 8195, thinsp: 8201,
  le: 8804, ge: 8805, ne: 8800, asymp: 8776, infin: 8734, pi: 960, alpha: 945, beta: 946, gamma: 947, delta: 948,
  theta: 952, lambda: 955, mu: 956, sigma: 963, omega: 969, Delta: 916, Sigma: 931, Omega: 937, rarr: 8594, larr: 8592,
  harr: 8596, uarr: 8593, darr: 8595, minus: 8722, radic: 8730, sum: 8721, prod: 8719, part: 8706, int: 8747,
  aacute: 225, eacute: 233, iacute: 237, oacute: 243, uacute: 250, ntilde: 241, uuml: 252, ouml: 246, auml: 228,
  agrave: 224, egrave: 232, ccedil: 231, Aacute: 193, Eacute: 201, Ntilde: 209, Uuml: 220, Ouml: 214, Auml: 196, szlig: 223,
};
export function decodeHtml(s) {
  s = decodeEntities(s);
  if (s.indexOf('&') < 0) return s;
  return s.replace(/&([a-zA-Z0-9]+);/g, (m, e) => (MORE[e] ? String.fromCharCode(MORE[e]) : m));
}
export const esc = s => String(s ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

const VOID = new Set(['br', 'hr', 'img', 'col', 'wbr', 'input', 'source', 'track', 'meta', 'link', 'area', 'base', 'param', 'embed']);
// dropped together with everything inside them
const DROP = new Set(['script', 'style', 'noscript', 'template', 'object', 'applet', 'head', 'title', 'select', 'textarea', 'button', 'svg', 'math', 'canvas', 'map', 'frameset', 'noembed', 'noframes']);
// kept as they are (with filtered attributes)
const KEEP = new Set(['p', 'br', 'hr', 'h1', 'h2', 'h3', 'h4', 'h5', 'h6', 'strong', 'b', 'em', 'i', 'u', 's', 'strike', 'sub', 'sup', 'ul', 'ol', 'li',
  'blockquote', 'pre', 'code', 'table', 'thead', 'tbody', 'tfoot', 'tr', 'th', 'td', 'caption', 'colgroup', 'col', 'img', 'a', 'span', 'div',
  'figure', 'figcaption', 'dl', 'dt', 'dd', 'mark', 'small', 'abbr', 'del', 'ins', 'q', 'cite', 'kbd', 'samp', 'var', 'address', 'details', 'summary']);
// shown as their content only (the tag itself is dropped)
const UNWRAP = new Set(['font', 'center', 'section', 'article', 'header', 'footer', 'main', 'nav', 'aside', 'label', 'big', 'time', 'form', 'fieldset', 'legend', 'body', 'html', 'tt', 'u1', 'o:p', 'picture', 'bdi', 'bdo', 'data', 'dfn', 'ruby', 'rt', 'rp', 'tbody0']);
const MEDIA = new Set(['iframe', 'video', 'audio', 'frame', 'embed']);
const STYLE_OK = /^(text-align|font-weight|font-style|text-decoration|color|background-color|vertical-align|text-indent|padding-left|margin-left|list-style-type|width)$/;

/** Splits HTML into tokens: { t: 'text', v } and { t: 'open'|'close', name, raw, self }. Comments and doctypes are dropped. */
export function tokenize(html) {
  const out = [];
  const s = String(html ?? '');
  let i = 0;
  while (i < s.length) {
    const lt = s.indexOf('<', i);
    if (lt < 0) { out.push({ t: 'text', v: s.slice(i) }); break; }
    if (lt > i) out.push({ t: 'text', v: s.slice(i, lt) });
    if (s.startsWith('<!--', lt)) { const e = s.indexOf('-->', lt + 4); i = e < 0 ? s.length : e + 3; continue; }
    if (s[lt + 1] === '!' || s[lt + 1] === '?') { const e = s.indexOf('>', lt); i = e < 0 ? s.length : e + 1; continue; }
    const m = /^<(\/?)([a-zA-Z][a-zA-Z0-9:-]*)/.exec(s.slice(lt, lt + 64));
    if (!m) { out.push({ t: 'text', v: '<' }); i = lt + 1; continue; }
    let j = lt + m[0].length, q = '';
    for (; j < s.length; j++) {
      const ch = s[j];
      if (q) { if (ch === q) q = ''; } else if (ch === '"' || ch === "'") q = ch; else if (ch === '>') break;
    }
    const raw = s.slice(lt + m[0].length, j);
    i = j + 1;
    out.push({ t: m[1] ? 'close' : 'open', name: m[2].toLowerCase(), raw, self: /\/\s*$/.test(raw) });
  }
  return out;
}

export function attrsOf(raw) {
  const a = {};
  const re = /([^\s=/>"']+)\s*(?:=\s*(?:"([^"]*)"|'([^']*)'|([^\s"'>]+)))?/g;
  let m;
  while ((m = re.exec(raw || ''))) a[m[1].toLowerCase()] = decodeHtml(m[2] ?? m[3] ?? m[4] ?? '');
  return a;
}

function cleanStyle(v) {
  const keep = [];
  for (const part of String(v).split(';')) {
    const k = part.slice(0, part.indexOf(':')).trim().toLowerCase();
    const val = part.slice(part.indexOf(':') + 1).trim();
    if (!k || !STYLE_OK.test(k)) continue;
    if (!/^[#(),.%\w\s-]{1,40}$/.test(val) || /url|expression|var\(|image|@/i.test(val)) continue;
    keep.push(`${k}: ${val}`);
  }
  return keep.join('; ');
}

/**
 * Makes teacher HTML safe to show. Options:
 *   link(href)            -> { href, attrs? } to keep a link, or null to show its text only
 *   image(src, attrs)     -> { src } to show a picture, or null to show its description as text
 *   media(src, kind)      -> HTML for an embedded video, audio or frame (already safe), or null to drop it
 *   headingShift          -> how many levels to push headings down (1 makes h1 an h2)
 */
export function sanitizeHtml(html, { link = () => null, image = () => null, media = () => null, headingShift = 0 } = {}) {
  const out = [];
  const open = [];
  let skip = 0, skipName = '';
  for (const tk of tokenize(html)) {
    if (skip) {
      if (tk.t === 'open' && tk.name === skipName && !tk.self) skip++;
      else if (tk.t === 'close' && tk.name === skipName) skip--;
      continue;
    }
    if (tk.t === 'text') { out.push(esc(decodeHtml(tk.v))); continue; }
    let name = tk.name;
    if (tk.t === 'open') {
      if (DROP.has(name)) { if (!tk.self && !VOID.has(name)) { skip = 1; skipName = name; } continue; }
      const a = attrsOf(tk.raw);
      if (MEDIA.has(name)) {
        const src = a.src || '';
        const h = media(src, name, a);
        if (h) out.push(h);
        if (name !== 'embed' && !tk.self) { skip = 1; skipName = name; }
        continue;
      }
      if (name === 'img') {
        const eq = a['data-equation-content'] || (/equation_images\//.test(a.src || '') ? (a.alt || '').replace(/^LaTeX:\s*/, '') : '');
        if (eq) { out.push(`<code class="cb-math">${esc(eq)}</code>`); continue; }
        const r = image(a.src || '', a);
        if (r && r.src) {
          const w = /^\d{1,4}$/.test(a.width || '') ? ` width="${a.width}"` : '';
          const h = /^\d{1,4}$/.test(a.height || '') ? ` height="${a.height}"` : '';
          out.push(`<img src="${esc(r.src)}" alt="${esc(a.alt || '')}"${w}${h} loading="lazy">`);
        } else if (a.alt && a.alt.trim()) out.push(`<span class="cb-missing-img">[Picture: ${esc(a.alt.trim())}]</span>`);
        else out.push('<span class="cb-missing-img">[Picture]</span>');
        continue;
      }
      if (name === 'input' || VOID.has(name) && !KEEP.has(name)) continue;
      if (/^h[1-6]$/.test(name) && headingShift) name = 'h' + Math.min(6, Number(name[1]) + headingShift);
      if (!KEEP.has(name)) { continue; }
      const attrs = [];
      for (const k of ['title', 'lang', 'dir']) if (a[k]) attrs.push(`${k}="${esc(a[k])}"`);
      if (a.style) { const st = cleanStyle(a.style); if (st) attrs.push(`style="${esc(st)}"`); }
      if (name === 'a') {
        const r = a.href ? link(a.href) : null;
        if (!r) { out.push('<span class="cb-deadlink">'); open.push({ name: 'a', tag: 'span' }); continue; }
        attrs.unshift(`href="${esc(r.href)}"`);
        for (const [k, v] of Object.entries(r.attrs || {})) attrs.push(`${k}="${esc(v)}"`);
      }
      if ((name === 'td' || name === 'th') && /^\d{1,3}$/.test(a.colspan || '')) attrs.push(`colspan="${a.colspan}"`);
      if ((name === 'td' || name === 'th') && /^\d{1,3}$/.test(a.rowspan || '')) attrs.push(`rowspan="${a.rowspan}"`);
      if (name === 'th' && /^(row|col|rowgroup|colgroup)$/.test(a.scope || '')) attrs.push(`scope="${a.scope}"`);
      if (name === 'ol' && /^\d{1,5}$/.test(a.start || '')) attrs.push(`start="${a.start}"`);
      if (name === 'ol' && /^[1aAiI]$/.test(a.type || '')) attrs.push(`type="${a.type}"`);
      if (name === 'col' && /^\d{1,3}$/.test(a.span || '')) attrs.push(`span="${a.span}"`);
      out.push(`<${name}${attrs.length ? ' ' + attrs.join(' ') : ''}>`);
      if (!VOID.has(name) && !tk.self) open.push({ name: tk.name, tag: name });
      continue;
    }
    // close tag: close everything opened after the matching element, then the element
    let k = -1;
    for (let x = open.length - 1; x >= 0; x--) if (open[x].name === name) { k = x; break; }
    if (k < 0) continue;
    while (open.length > k) out.push(`</${open.pop().tag}>`);
  }
  while (open.length) out.push(`</${open.pop().tag}>`);
  return out.join('');
}

const BLOCK = new Set(['p', 'div', 'br', 'hr', 'h1', 'h2', 'h3', 'h4', 'h5', 'h6', 'li', 'tr', 'blockquote', 'pre', 'table', 'ul', 'ol', 'dt', 'dd', 'figcaption', 'caption', 'section', 'article', 'header', 'footer', 'address', 'details', 'summary']);

/** Plain text of some HTML: blocks on their own lines, list items with a dash, table cells separated by " | ". */
export function htmlToText(html) {
  let s = '';
  let skip = 0, skipName = '';
  for (const tk of tokenize(html)) {
    if (skip) { if (tk.t === 'open' && tk.name === skipName) skip++; else if (tk.t === 'close' && tk.name === skipName) skip--; continue; }
    if (tk.t === 'text') { s += decodeHtml(tk.v).replace(/\s+/g, ' '); continue; }
    if (tk.t === 'open' && DROP.has(tk.name) && !tk.self) { skip = 1; skipName = tk.name; continue; }
    if (tk.t === 'open' && tk.name === 'img') {
      const a = attrsOf(tk.raw);
      const eq = a['data-equation-content'] || (/equation_images\//.test(a.src || '') ? (a.alt || '').replace(/^LaTeX:\s*/, '') : '');
      s += eq ? eq : a.alt ? `[Picture: ${a.alt}]` : '';
      continue;
    }
    if (tk.t === 'open' && (tk.name === 'td' || tk.name === 'th')) { if (!/\n\s*$/.test(s) && s) s += ' | '; continue; }
    if (tk.t === 'open' && tk.name === 'li') { s += '\n- '; continue; }
    if (BLOCK.has(tk.name) && tk.name !== 'li') s += '\n';
  }
  return s.replace(/[ \t]+\n/g, '\n').replace(/\n[ \t]+/g, '\n').replace(/\n{3,}/g, '\n\n').replace(/\n\n(?=- )/g, '\n').replace(/^\n+|\n+$/g, '').replace(/ {2,}/g, ' ').trim();
}

/** Short one-line text (for titles, previews and spreadsheet cells). */
export function oneLine(html, max = 0) {
  const t = htmlToText(html).replace(/\s+/g, ' ').trim();
  return max && t.length > max ? t.slice(0, max - 1).trimEnd() + String.fromCharCode(8230) : t;
}

/**
 * Paragraph blocks for a Word file: [{ kind: 'p'|'h'|'li', level, runs: [{ text, b, i }] }]. Pictures become their
 * description in brackets, tables one paragraph per row with cells separated by " | ".
 */
export function htmlToBlocks(html) {
  const blocks = [];
  let cur = null, b = 0, i = 0, list = 0, cell = 0;
  let skip = 0, skipName = '';
  const start = (kind, level = 0) => { cur = { kind, level, runs: [] }; blocks.push(cur); };
  const push = (text) => {
    if (!text) return;
    if (!cur) start('p');
    const last = cur.runs[cur.runs.length - 1];
    if (last && last.b === !!b && last.i === !!i) last.text += text; else cur.runs.push({ text, b: !!b, i: !!i });
  };
  for (const tk of tokenize(html)) {
    if (skip) { if (tk.t === 'open' && tk.name === skipName) skip++; else if (tk.t === 'close' && tk.name === skipName) skip--; continue; }
    if (tk.t === 'text') { const t = decodeHtml(tk.v).replace(/\s+/g, ' '); if (t.trim() || (cur && cur.runs.length)) push(t); continue; }
    const n = tk.name;
    if (tk.t === 'open' && DROP.has(n) && !tk.self) { skip = 1; skipName = n; continue; }
    if (tk.t === 'open') {
      if (n === 'b' || n === 'strong') b++;
      else if (n === 'i' || n === 'em') i++;
      else if (n === 'ul' || n === 'ol') list++;
      else if (n === 'li') start('li', Math.max(1, list));
      else if (/^h[1-6]$/.test(n)) start('h', Number(n[1]));
      else if (n === 'tr') { start('p'); cell = 0; }
      else if (n === 'td' || n === 'th') { if (cell++) push(' | '); }
      else if (n === 'br') { if (cur) push('\n'); }
      else if (n === 'img') { const a = attrsOf(tk.raw); const eq = a['data-equation-content']; push(eq ? eq : `[Picture${a.alt ? ': ' + a.alt : ''}]`); }
      else if (BLOCK.has(n)) start('p');
      continue;
    }
    if (n === 'b' || n === 'strong') b = Math.max(0, b - 1);
    else if (n === 'i' || n === 'em') i = Math.max(0, i - 1);
    else if (n === 'ul' || n === 'ol') list = Math.max(0, list - 1);
    if (BLOCK.has(n)) cur = null;
  }
  for (const bl of blocks) { for (const r of bl.runs) r.text = r.text.replace(/ {2,}/g, ' '); if (bl.runs.length) { bl.runs[0].text = bl.runs[0].text.replace(/^\s+/, ''); const l = bl.runs[bl.runs.length - 1]; l.text = l.text.replace(/\s+$/, ''); } }
  return blocks.filter(bl => bl.runs.some(r => r.text.trim()));
}
