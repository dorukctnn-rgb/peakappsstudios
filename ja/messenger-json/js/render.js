/* Turns messages into HTML for the page and for the saved files. Every piece of text from the download is escaped;
 * links are only kept when they are http or https, and open in a new tab without a referrer. */
import { callLine } from './parse.js';

export const esc = s => String(s ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&#39;');
const safeUrl = u => (/^https?:\/\/[^\s<>"']+$/i.test(String(u || '').trim()) ? String(u).trim() : null);

const URL_RE = /\bhttps?:\/\/[^\s<>"']+[^\s<>"'.,;:!?)\]]/gi;
/* Escapes text, marks the search term and turns web addresses into links. */
export function textHtml(text, term = '') {
  const out = [];
  let last = 0;
  const s = String(text || '');
  for (const m of s.matchAll(URL_RE)) {
    out.push(mark(s.slice(last, m.index), term));
    out.push(`<a href="${esc(m[0])}" target="_blank" rel="noopener noreferrer nofollow">${mark(m[0], term)}</a>`);
    last = m.index + m[0].length;
  }
  out.push(mark(s.slice(last), term));
  return out.join('').replace(/\r?\n/g, '<br>');
}
function mark(s, term) {
  if (!term) return esc(s);
  const lc = s.toLowerCase(), t = term.toLowerCase();
  let i = 0, out = '';
  for (let j = lc.indexOf(t); j >= 0; j = lc.indexOf(t, i)) { out += esc(s.slice(i, j)) + '<mark>' + esc(s.slice(j, j + t.length)) + '</mark>'; i = j + t.length; }
  return out + esc(s.slice(i));
}

const DAY = { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' };
const TIME = { hour: 'numeric', minute: '2-digit' };
export const dayKey = ts => { const d = new Date(ts); return `${d.getFullYear()}-${d.getMonth()}-${d.getDate()}`; };
export const fmtDay = (ts, locale) => new Date(ts).toLocaleDateString(locale, DAY);
export const fmtTime = (ts, locale) => new Date(ts).toLocaleTimeString(locale, TIME);
export const fmtDate = (ts, locale) => new Date(ts).toLocaleDateString(locale, { year: 'numeric', month: 'short', day: 'numeric' });

const LABEL = { photo: '写真', gif: 'GIF', sticker: 'スタンプ', video: '動画', audio: 'ボイスメッセージ', file: 'ファイル' };
export const mediaLabel = t => LABEL[t] || '添付ファイル';

/* Media for a saved file: the path the archive puts the file at, or a note when the download did not include it. */
export function staticMedia(x, src) {
  if (!src) return `<span class="rb-missing">${esc(mediaLabel(x.type))}はダウンロードに含まれていません：${esc(x.name)}</span>`;
  const s = esc(src);
  if (x.type === 'photo' || x.type === 'gif' || x.type === 'sticker') return `<a class="rb-ph${x.type === 'sticker' ? ' rb-st' : ''}" href="${s}"><img src="${s}" alt="${esc(mediaLabel(x.type))}" loading="lazy"></a>`;
  if (x.type === 'video') return `<video controls preload="none" src="${s}"></video>`;
  if (x.type === 'audio') return `<audio controls preload="none" src="${s}"></audio>`;
  return `<a class="rb-file" href="${s}" download>${esc(x.name)}</a>`;
}

/* The messages from..to of a chat. media(x, i, j) returns the HTML of attachment j of message i. */
export function messagesHtml(chat, from, to, { owner = null, term = '', locale, media, hit = -1 } = {}) {
  const out = [];
  let prevDay = from > 0 && chat.messages[from - 1] ? dayKey(chat.messages[from - 1].ts) : null;
  let prevSender = from > 0 && chat.messages[from - 1] ? chat.messages[from - 1].sender : null;
  for (let i = from; i < to && i < chat.messages.length; i++) {
    const m = chat.messages[i];
    const dk = m.ts ? dayKey(m.ts) : 'none';
    if (dk !== prevDay) {
      out.push(`<p class="rb-day"><span>${m.ts ? esc(fmtDay(m.ts, locale)) : '日付なし'}</span></p>`);
      prevDay = dk; prevSender = null;
    }
    const id = ` id="m${i}"`;
    const hitCls = i === hit ? ' is-hit' : '';
    if (m.kind === 'system') {
      out.push(`<p class="rb-sys${hitCls}"${id}>${textHtml(m.text || 'チャットの更新', term)} <time>${m.ts ? esc(fmtTime(m.ts, locale)) : ''}</time></p>`);
      prevSender = null;
      continue;
    }
    if (m.kind === 'call') {
      const words = callLine(m);
      out.push(`<p class="rb-sys rb-call${hitCls}"${id}>${textHtml(words, term)} <time>${m.ts ? esc(fmtTime(m.ts, locale)) : ''}</time></p>`);
      prevSender = null;
      continue;
    }
    const me = owner && m.sender === owner;
    const showName = m.sender !== prevSender && !me;
    prevSender = m.sender;
    const parts = [];
    if (m.unsent && !m.text && !m.media.length) parts.push('<p class="rb-unsent">送信が取り消されたメッセージ</p>');
    if (m.text) parts.push(`<p>${textHtml(m.text, term)}</p>`);
    if (m.media.length) parts.push(`<div class="rb-media">${m.media.map((x, j) => media(x, i, j)).join('')}</div>`);
    if (m.share) {
      const u = safeUrl(m.share.link);
      parts.push(`<p class="rb-share">${u ? `<a href="${esc(u)}" target="_blank" rel="noopener noreferrer nofollow">${mark(m.share.text || u, term)}</a>` : textHtml(m.share.text, term)}</p>`);
    }
    if (!parts.length) parts.push('<p class="rb-unsent">テキストなし</p>');
    const react = m.reactions.length ? `<p class="rb-react">${m.reactions.map(r => `<span title="${esc(r.actor)}">${esc(r.r)}<span class="rb-react-who"> ${esc(r.actor)}</span></span>`).join('')}</p>` : '';
    out.push(`<div class="rb-msg${me ? ' is-me' : ''}${hitCls}"${id}>${showName ? `<p class="rb-who">${esc(m.sender || '不明')}</p>` : ''}<div class="rb-bub">${parts.join('')}</div><p class="rb-meta"><time>${m.ts ? esc(fmtTime(m.ts, locale)) : ''}</time>${m.src === 'e2ee' ? '<span class="rb-lock" title="暗号化チャットのダウンロードから">暗号化</span>' : ''}</p>${react}</div>`);
  }
  return out.join('\n');
}

/* The CSS of a saved chat page (kept here so the saved file looks like the page and needs nothing else). */
export const SAVED_CSS = `
:root{--ink:#14213d;--muted:#545f73;--line:#cfd9e8;--me:#22408f;--wall:#eef2f8;--mark:#ffe08a}
*{box-sizing:border-box}body{margin:0;font:17px/1.55 system-ui,-apple-system,"Segoe UI",Helvetica,Arial,sans-serif;color:var(--ink);background:#fff}
main{max-width:760px;margin:0 auto;padding:28px 18px 60px}h1{font:800 28px/1.15 Georgia,serif;margin:0 0 4px}
.rb-sub{color:var(--muted);margin:0 0 22px;font-size:15px}a{color:#22408f}
.rb-day{text-align:center;margin:22px 0 10px;color:var(--muted);font-size:14px}.rb-day span{background:var(--wall);padding:3px 12px;border-radius:999px}
.rb-sys{text-align:center;color:var(--muted);font-size:14px;margin:8px 0}.rb-sys time{margin-left:4px}
.rb-msg{display:flex;flex-direction:column;align-items:flex-start;margin:2px 0 6px;break-inside:avoid}
.rb-msg.is-me{align-items:flex-end}.rb-who{font-size:13px;color:var(--muted);margin:8px 0 2px 12px}
.rb-bub{max-width:min(560px,86%);border:1px solid var(--line);border-radius:16px;padding:8px 13px;background:#fff;overflow-wrap:anywhere}
.is-me .rb-bub{background:var(--me);color:#fff;border-color:var(--me)}.is-me .rb-bub a{color:#fff}
.rb-bub p{margin:0}.rb-bub p+p,.rb-bub p+div,.rb-bub div+p{margin-top:6px}
.rb-media{display:flex;flex-wrap:wrap;gap:6px}.rb-media img{display:block;max-width:240px;max-height:240px;border-radius:10px}
.rb-st img{max-width:96px}.rb-media video{max-width:280px;border-radius:10px}.rb-media audio{max-width:260px}
.rb-missing{font-size:13px;opacity:.8;font-style:italic}.rb-unsent{font-style:italic;opacity:.75}
.rb-meta{margin:2px 10px 0;font-size:12px;color:var(--muted)}.rb-lock{margin-left:6px}
.rb-react{margin:2px 10px 0;font-size:13px}.rb-react>span{margin-right:8px}.rb-react-who{color:var(--muted)}
mark{background:var(--mark);color:inherit}
@media print{main{max-width:none;padding:0}.rb-media video,.rb-media audio{display:none}}
`;
