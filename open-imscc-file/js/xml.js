// A small XML reader for the files inside a course export: imsmanifest.xml, the QTI quiz files and Canvas's own
// metadata files. It runs the same way in the browser and in Node (the unit tests), with no DOM. Elements keep their
// local name only (lomimscc:title becomes title), attributes too. It is strict enough for these machine-written files and
// lenient about the rest: an unclosed element is closed at its parent's end tag, an unknown entity is kept as written.

const NAMED = { lt: '<', gt: '>', amp: '&', quot: '"', apos: "'", nbsp: String.fromCharCode(160) };

export function decodeEntities(s) {
  if (s.indexOf('&') < 0) return s;
  return s.replace(/&(#x[0-9a-fA-F]+|#[0-9]+|[a-zA-Z]+);/g, (m, e) => {
    if (e[0] === '#') {
      const n = e[1] === 'x' || e[1] === 'X' ? parseInt(e.slice(2), 16) : parseInt(e.slice(1), 10);
      return Number.isFinite(n) && n > 0 && n <= 0x10ffff ? String.fromCodePoint(n) : m;
    }
    return Object.prototype.hasOwnProperty.call(NAMED, e) ? NAMED[e] : m;
  });
}

const local = name => { const i = name.indexOf(':'); return i < 0 ? name : name.slice(i + 1); };

class El {
  constructor(name, attrs) { this.name = name; this.attrs = attrs; this.children = []; }
  /** direct child elements, optionally by local name */
  kids(name) { return this.children.filter(c => c instanceof El && (!name || c.name === name)); }
  /** the first direct child element with this local name */
  kid(name) { return this.children.find(c => c instanceof El && c.name === name) || null; }
  /** follows a path of direct children: el.at('lom', 'general', 'title') */
  at(...names) { let e = this; for (const n of names) { e = e && e.kid(n); } return e || null; }
  /** every descendant element with this local name, in document order */
  all(name) {
    const out = [];
    const walk = e => { for (const c of e.children) if (c instanceof El) { if (c.name === name) out.push(c); walk(c); } };
    walk(this);
    return out;
  }
  /** the first descendant element with this local name */
  find(name) {
    for (const c of this.children) if (c instanceof El) { if (c.name === name) return c; const f = c.find(name); if (f) return f; }
    return null;
  }
  /** all the text inside, entities decoded */
  get text() { return this.children.map(c => (c instanceof El ? c.text : c)).join(''); }
  attr(name) { return Object.prototype.hasOwnProperty.call(this.attrs, name) ? this.attrs[name] : null; }
}

export class XmlError extends Error { constructor(message) { super(message); this.code = 'bad-xml'; } }

function readAttrs(s) {
  const attrs = {};
  const re = /([^\s=/>]+)\s*(?:=\s*(?:"([^"]*)"|'([^']*)'|([^\s"'>]+)))?/g;
  let m;
  while ((m = re.exec(s))) {
    const name = local(m[1]);
    if (name === 'xmlns' || m[1].startsWith('xmlns:')) continue;
    attrs[name] = decodeEntities(m[2] ?? m[3] ?? m[4] ?? '');
  }
  return attrs;
}

/** Parses an XML string into a tree of El. Throws XmlError when there is no root element at all. */
export function parseXml(src) {
  if (typeof src !== 'string') src = String(src ?? '');
  if (src.charCodeAt(0) === 0xfeff) src = src.slice(1);
  const root = new El('#document', {});
  const stack = [root];
  let i = 0;
  const n = src.length;
  while (i < n) {
    const lt = src.indexOf('<', i);
    const top = stack[stack.length - 1];
    if (lt < 0) { if (stack.length > 1) top.children.push(decodeEntities(src.slice(i))); break; }
    if (lt > i && stack.length > 1) top.children.push(decodeEntities(src.slice(i, lt)));
    if (src.startsWith('<!--', lt)) { const e = src.indexOf('-->', lt + 4); i = e < 0 ? n : e + 3; continue; }
    if (src.startsWith('<![CDATA[', lt)) {
      const e = src.indexOf(']]>', lt + 9);
      if (stack.length > 1) top.children.push(src.slice(lt + 9, e < 0 ? n : e));
      i = e < 0 ? n : e + 3; continue;
    }
    if (src.startsWith('<?', lt)) { const e = src.indexOf('?>', lt + 2); i = e < 0 ? n : e + 2; continue; }
    if (src.startsWith('<!', lt)) { const e = src.indexOf('>', lt + 2); i = e < 0 ? n : e + 1; continue; }
    // find the end of the tag, skipping quoted attribute values (they may contain >)
    let j = lt + 1, q = '';
    for (; j < n; j++) {
      const ch = src[j];
      if (q) { if (ch === q) q = ''; } else if (ch === '"' || ch === "'") q = ch; else if (ch === '>') break;
    }
    if (j >= n) break;
    const body = src.slice(lt + 1, j);
    i = j + 1;
    if (body[0] === '/') {
      const name = local(body.slice(1).trim());
      // close up to the matching element; an end tag with no open match is ignored
      for (let k = stack.length - 1; k > 0; k--) if (stack[k].name === name) { stack.length = k; break; }
      continue;
    }
    const selfClose = body.endsWith('/');
    const inner = selfClose ? body.slice(0, -1) : body;
    const sp = inner.search(/\s/);
    const name = local(sp < 0 ? inner : inner.slice(0, sp));
    if (!name) continue;
    const el = new El(name, sp < 0 ? {} : readAttrs(inner.slice(sp)));
    top.children.push(el);
    if (!selfClose) stack.push(el);
  }
  const first = root.kids()[0];
  if (!first) throw new XmlError('No XML element found.');
  return first;
}

export { El };
