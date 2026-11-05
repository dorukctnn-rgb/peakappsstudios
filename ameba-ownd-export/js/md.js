// Utsushi: cleaned HTML to Markdown (for Hugo, Astro, Ghost, note-taking apps or simply a readable copy). The input is the output of
// sanitizeHtml, so every tag is closed in order; it is read into a small tree and written out. Tables stay HTML (Markdown allows it).
import { decodeEntities } from './sanitize.js';

function tree(html) {
  const root = { tag: '#root', attrs: {}, kids: [] };
  const stack = [root];
  const re = /<(\/?)([a-z][a-z0-9]*)([^>]*)>|([^<]+)/gi;
  let m;
  while ((m = re.exec(String(html || '')))) {
    const top = stack[stack.length - 1];
    if (m[4] !== undefined) { top.kids.push({ text: decodeEntities(m[4]) }); continue; }
    const name = m[2].toLowerCase();
    if (m[1]) { for (let i = stack.length - 1; i > 0; i--) if (stack[i].tag === name) { stack.length = i; break; } continue; }
    const attrs = {};
    m[3].replace(/([a-z-]+)="([^"]*)"/gi, (x, k, v) => { attrs[k.toLowerCase()] = decodeEntities(v); return x; });
    const node = { tag: name, attrs, kids: [] };
    top.kids.push(node);
    if (!/^(br|hr|img|col)$/.test(name)) stack.push(node);
  }
  return root;
}

const esc = s => s.replace(/([\\`*_[\]])/g, '\\$1');
function inline(n) {
  if (n.text !== undefined) return esc(n.text.replace(/\s+/g, ' '));
  const inner = () => n.kids.map(inline).join('');
  switch (n.tag) {
    case 'br': return '\u0001';
    case 'strong': case 'b': { const t = inner().trim(); return t ? `**${t}**` : ''; }
    case 'em': case 'i': { const t = inner().trim(); return t ? `*${t}*` : ''; }
    case 's': case 'del': case 'strike': { const t = inner().trim(); return t ? `~~${t}~~` : ''; }
    case 'code': return '`' + n.kids.map(k => k.text || '').join('') + '`';
    case 'a': { const t = inner().trim() || n.attrs.href || ''; return n.attrs.href ? `[${t}](${n.attrs.href.replace(/\)/g, '%29').replace(/ /g, '%20')})` : t; }
    case 'img': return n.attrs.src ? `![${esc(n.attrs.alt || '')}](${n.attrs.src.replace(/\)/g, '%29')})` : '';
    default: return inner();
  }
}
function outerHtml(n) {
  if (n.text !== undefined) return n.text.replace(/[&<>]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;' }[c]));
  const a = Object.entries(n.attrs).map(([k, v]) => ` ${k}="${String(v).replace(/"/g, '&quot;')}"`).join('');
  if (/^(br|hr|img|col)$/.test(n.tag)) return `<${n.tag}${a}>`;
  return `<${n.tag}${a}>${n.kids.map(outerHtml).join('')}</${n.tag}>`;
}
const BLOCK = /^(p|div|h[1-6]|ul|ol|li|blockquote|pre|hr|table|figure|figcaption|dl|dt|dd|section)$/;
function blocks(nodes, depth = 0) {
  const out = [];
  let line = [];
  // a hard line break is a sentinel until the line is trimmed, then two spaces and a newline (Markdown's own break)
  const flush = () => { const t = line.join('').replace(/[ \t]+\n/g, '\n').trim().replace(/^\u0001+|\u0001+$/g, '').replace(/\s*\u0001\s*/g, '  \n'); if (t) out.push(t); line = []; };
  for (const n of nodes) {
    if (n.text !== undefined || !BLOCK.test(n.tag)) { line.push(inline(n)); continue; }
    flush();
    switch (n.tag) {
      case 'h1': case 'h2': case 'h3': case 'h4': case 'h5': case 'h6': {
        const t = n.kids.map(inline).join('').replace(/\s*\n\s*/g, ' ').trim();
        if (t) out.push(`${'#'.repeat(Number(n.tag[1]))} ${t}`);
        break;
      }
      case 'hr': out.push('---'); break;
      case 'ul': case 'ol': {
        let i = Number(n.attrs.start) || 1;
        const items = [];
        for (const li of n.kids) {
          if (li.tag !== 'li') continue;
          const body = blocks(li.kids, depth + 1).split('\n').join('\n' + '   ');
          items.push(`${n.tag === 'ol' ? `${i++}.` : '-'} ${body}`.trimEnd());
        }
        if (items.length) out.push(items.join('\n'));
        break;
      }
      case 'blockquote': { const t = blocks(n.kids, depth + 1); if (t) out.push(t.split('\n').map(l => `> ${l}`.trimEnd()).join('\n')); break; }
      case 'pre': out.push('```\n' + n.kids.map(k => (k.text !== undefined ? k.text : outerHtml(k).replace(/<[^>]+>/g, ''))).join('').replace(/\n+$/, '') + '\n```'); break;
      case 'table': out.push(outerHtml(n)); break;
      default: { const t = blocks(n.kids, depth + 1); if (t) out.push(t); }
    }
  }
  flush();
  return out.join('\n\n');
}

export function htmlToMarkdown(html) {
  // HTML comments (the notes of the export mode) become nothing; a custom HTML block stays as HTML
  const clean = String(html || '').replace(/<!--[\s\S]*?-->/g, '');
  return blocks(tree(clean).kids).replace(/\n{3,}/g, '\n\n').trim() + '\n';
}

const yaml = s => JSON.stringify(String(s == null ? '' : s));
export function frontMatter(fields) {
  const lines = ['---'];
  for (const [k, v] of Object.entries(fields)) {
    if (v == null || v === '' || (Array.isArray(v) && !v.length)) continue;
    lines.push(Array.isArray(v) ? `${k}: [${v.map(yaml).join(', ')}]` : `${k}: ${yaml(v)}`);
  }
  lines.push('---', '');
  return lines.join('\n');
}
