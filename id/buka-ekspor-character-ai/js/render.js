/* The files Chatbound writes: one chat as plain text, Markdown or HTML (free), and the whole archive as one offline
 * HTML book with search, a print layout for saving as PDF, and an EPUB (Pro). Everything is made in the browser.
 * Classic script: self.CaiRender (worker) and module.exports (Node tests). EPUB needs self.fflate. */
(function (root, factory) {
  const m = factory(root);
  if (typeof module === 'object' && module.exports) module.exports = m;
  else root.CaiRender = m;
})(typeof self !== 'undefined' ? self : globalThis, function (root) {
  'use strict';
  const SITE = 'https://peakappsstudio.com/character-ai-export-viewer/';
  const NO_SENDER = 'Ekspor Character.AI tidak mencatat siapa pengirim tiap pesan, jadi pesan ditampilkan berurutan menurut waktu tanpa nama.';

  const esc = (s) => String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  // characters XML does not allow (EPUB is XHTML), and lone surrogates
  const xmlSafe = (s) => String(s).replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F￾￿]/g, '').replace(/[\uD800-\uDBFF](?![\uDC00-\uDFFF])|(^|[^\uD800-\uDBFF])[\uDC00-\uDFFF]/g, '$1');

  function dateFmt(locale, withTime = true) {
    try {
      return new Intl.DateTimeFormat(locale || 'en', withTime ? { dateStyle: 'medium', timeStyle: 'short' } : { dateStyle: 'long' });
    } catch (e) {
      return new Intl.DateTimeFormat('en', withTime ? { dateStyle: 'medium', timeStyle: 'short' } : { dateStyle: 'long' });
    }
  }
  function when(m, f) { return Number.isFinite(m.ts) ? f.format(new Date(m.ts)) : m.time || ''; }

  // *action* and **bold**, the way Character.AI shows them; text is escaped first
  function inline(text) {
    let h = esc(text);
    h = h.replace(/\*\*([^*\n][^*\n]*?)\*\*/g, '<strong>$1</strong>').replace(/\*([^*\n][^*\n]*?)\*/g, '<em>$1</em>');
    return h;
  }
  function paragraphs(text, xml) {
    const t = xml ? xmlSafe(text) : String(text);
    return t.split(/\n{2,}/).map((p) => `<p>${inline(p).replace(/\n/g, xml ? '<br/>' : '<br>')}</p>`).join('');
  }

  // the title a chat gets in files: the name the reader gave it, else its start date
  function chatTitle(chat, opts) {
    const named = opts.names && opts.names[chat.id];
    if (named) return named;
    if (chat.name) return chat.name;
    const s = chat.summary || {};
    return Number.isFinite(s.start) ? `Chat dimulai pada ${dateFmt(opts.locale).format(new Date(s.start))}` : 'Chat';
  }
  function rangeText(s, locale) {
    const f = dateFmt(locale, false);
    if (!Number.isFinite(s.start)) return '';
    const a = f.format(new Date(s.start)), b = Number.isFinite(s.end) ? f.format(new Date(s.end)) : a;
    return a === b ? a : `${a} sampai ${b}`;
  }
  const plural = (n, one, many) => `${n.toLocaleString('id')} ${n === 1 ? one : many}`;

  // ---------------------------------------------------------------- one chat
  function chatTxt(chat, opts) {
    const f = dateFmt(opts.locale);
    const s = chat.summary || {};
    const out = [chatTitle(chat, opts), `${plural(chat.msgs.length, 'pesan', 'pesan')}${rangeText(s, opts.locale) ? ', ' + rangeText(s, opts.locale) : ''}`];
    if (s.greetingOf) out.push(`Dibuka dengan sapaan ${s.greetingOf}`);
    if (!opts.speakers) out.push(NO_SENDER);
    out.push('', '');
    for (const m of chat.msgs) {
      out.push(`[${when(m, f)}]${m.who ? ' ' + m.who + ':' : ''}`);
      if (m.text) out.push(m.text);
      if (m.img) out.push(`[gambar: ${m.img}]`);
      out.push('');
    }
    out.push(`Disimpan dengan Chatbound, ${SITE}`);
    return out.join('\n');
  }

  function chatMd(chat, opts) {
    const f = dateFmt(opts.locale);
    const s = chat.summary || {};
    const out = [`# ${chatTitle(chat, opts).replace(/\n/g, ' ')}`, '', `${plural(chat.msgs.length, 'pesan', 'pesan')}${rangeText(s, opts.locale) ? ', ' + rangeText(s, opts.locale) : ''}.`];
    if (s.greetingOf) out.push('', `Dibuka dengan sapaan ${s.greetingOf}.`);
    if (!opts.speakers) out.push('', `_${NO_SENDER}_`);
    out.push('', '---', '');
    for (const m of chat.msgs) {
      out.push(`**${when(m, f)}**${m.who ? ' ' + m.who : ''}`, '');
      if (m.text) out.push(m.text, '');
      if (m.img) out.push(`![gambar](${m.img})`, '');
    }
    out.push('---', '', `Disimpan dengan [Chatbound](${SITE}).`);
    return out.join('\n');
  }

  const READ_CSS = `:root{--paper:#fbfafc;--ink:#1d1622;--soft:#5d5566;--rule:#e3dde8;--mark:#f6d77a;--cloth:#7b1830}
@media (prefers-color-scheme:dark){:root{--paper:#16121a;--ink:#ece6f0;--soft:#a79fb0;--rule:#2e2733;--mark:#6b5410;--cloth:#e0a3b4}}
*{box-sizing:border-box}html{-webkit-text-size-adjust:100%}body{margin:0;background:var(--paper);color:var(--ink);font:17px/1.62 "Iowan Old Style","Palatino Linotype",Palatino,Georgia,"Noto Serif",serif}
main{max-width:44rem;margin:0 auto;padding:40px 20px 80px}h1,h2{font-family:system-ui,-apple-system,"Segoe UI",sans-serif;line-height:1.2;letter-spacing:-.01em}
h1{font-size:30px;margin:0 0 8px}.meta{color:var(--soft);font:14px/1.5 system-ui,-apple-system,"Segoe UI",sans-serif;margin:0 0 4px}
.msg{padding:14px 0;border-top:1px solid var(--rule)}.msg time,.msg .who{display:block;font:12.5px/1.4 system-ui,-apple-system,"Segoe UI",sans-serif;color:var(--soft);margin-bottom:4px;font-variant-numeric:tabular-nums}
.msg .who{display:inline;color:var(--cloth);font-weight:600;margin-left:6px}.msg p{margin:0 0 .7em;overflow-wrap:anywhere}.msg p:last-child{margin-bottom:0}.msg img{max-width:100%;height:auto;border-radius:6px}
mark{background:var(--mark);color:inherit;border-radius:2px}footer{margin-top:40px;color:var(--soft);font:13px/1.5 system-ui,sans-serif}a{color:var(--cloth)}`;

  function msgHtml(m, f, imgSrc) {
    const who = m.who ? `<span class="who">${esc(m.who)}</span>` : '';
    const img = m.img ? (imgSrc ? `<p><img src="${imgSrc}" alt="Gambar dari chat"></p>` : `<p class="meta">[gambar: ${esc(m.img)}]</p>`) : '';
    return `<article class="msg"><time>${esc(when(m, f))}${who}</time>${m.text ? paragraphs(m.text) : ''}${img}</article>`;
  }

  function chatHtml(chat, opts, images = {}) {
    const f = dateFmt(opts.locale);
    const s = chat.summary || {};
    const title = chatTitle(chat, opts);
    const head = `<!doctype html><html lang="${esc(opts.lang || 'en')}"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${esc(title)}</title><style>${READ_CSS}</style></head><body><main><h1>${esc(title)}</h1>`
      + `<p class="meta">${esc(plural(chat.msgs.length, 'pesan', 'pesan'))}${rangeText(s, opts.locale) ? ', ' + esc(rangeText(s, opts.locale)) : ''}</p>`
      + (s.greetingOf ? `<p class="meta">Dibuka dengan sapaan ${esc(s.greetingOf)}</p>` : '')
      + (opts.speakers ? '' : `<p class="meta">${esc(NO_SENDER)}</p>`);
    const parts = [head];
    for (const m of chat.msgs) parts.push(msgHtml(m, f, m.img && images[m.img]));
    parts.push(`<footer>Disimpan dengan <a href="${SITE}">Chatbound</a>. Tidak ada yang diunggah untuk membuat file ini.</footer></main></body></html>`);
    return parts.join('');
  }

  // ---------------------------------------------------------------- the book (Pro): one offline HTML file
  const BOOK_CSS = `:root{--paper:#f6f4f8;--page:#fff;--ink:#1d1622;--soft:#5d5566;--rule:#e3dde8;--mark:#f6d77a;--cloth:#7b1830;--gilt:#f2c14e}
@media (prefers-color-scheme:dark){:root{--paper:#121015;--page:#1b171f;--ink:#ece6f0;--soft:#a79fb0;--rule:#2e2733;--mark:#6b5410;--cloth:#e0a3b4}}
*{box-sizing:border-box}html{-webkit-text-size-adjust:100%}body{margin:0;background:var(--paper);color:var(--ink);font:16px/1.55 system-ui,-apple-system,"Segoe UI",sans-serif}
.cover{background:#7b1830;color:#fff;padding:56px 24px 48px;border-bottom:6px solid #f2c14e}.cover .in{max-width:46rem;margin:0 auto}
.cover h1{font:700 clamp(34px,7vw,58px)/1.02 "Iowan Old Style","Palatino Linotype",Palatino,Georgia,serif;margin:0 0 14px;letter-spacing:-.015em}
.cover p{margin:0 0 6px;color:#f7e3e8}.cover .gilt{color:#f2c14e;font-weight:600}
.bar{position:sticky;top:0;z-index:2;background:var(--paper);border-bottom:1px solid var(--rule)}.bar .in{max-width:46rem;margin:0 auto;padding:10px 20px;display:flex;gap:10px;align-items:center}
.bar input{flex:1;min-width:0;font:inherit;padding:9px 12px;border:1px solid var(--rule);border-radius:8px;background:var(--page);color:var(--ink)}
.bar button,.more{font:inherit;padding:9px 14px;border-radius:8px;border:1px solid var(--rule);background:var(--page);color:var(--ink);cursor:pointer}
main{max-width:46rem;margin:0 auto;padding:24px 20px 80px}h2{font:700 24px/1.2 "Iowan Old Style","Palatino Linotype",Georgia,serif;margin:28px 0 8px}
.toc{list-style:none;margin:0;padding:0}.toc li{border-top:1px solid var(--rule)}.toc a{display:block;padding:12px 4px;color:inherit;text-decoration:none}.toc a:hover{background:var(--page)}
.toc b{display:block}.toc span{color:var(--soft);font-size:14px}.meta{color:var(--soft);font-size:14px;margin:0 0 4px}
.chat{background:var(--page);border:1px solid var(--rule);border-radius:12px;padding:8px 22px 18px;margin-top:12px}
.msg{padding:14px 0;border-top:1px solid var(--rule);font:17px/1.62 "Iowan Old Style","Palatino Linotype",Palatino,Georgia,"Noto Serif",serif}.msg:first-child{border-top:0}
.msg time{display:block;font:12.5px/1.4 system-ui,-apple-system,"Segoe UI",sans-serif;color:var(--soft);margin-bottom:4px;font-variant-numeric:tabular-nums}.msg .who{color:var(--cloth);font-weight:600;margin-left:6px}
.msg p{margin:0 0 .7em;overflow-wrap:anywhere}.msg p:last-child{margin:0}.msg img{max-width:100%;height:auto;border-radius:6px}
mark{background:var(--mark);color:inherit;border-radius:2px}.hit{display:block;padding:10px 4px;border-top:1px solid var(--rule);color:inherit;text-decoration:none}.hit:hover{background:var(--page)}
a{color:var(--cloth)}.back{display:inline-block;margin:6px 0}footer{max-width:46rem;margin:0 auto;padding:0 20px 40px;color:var(--soft);font-size:13px}[hidden]{display:none!important}`;

  const BOOK_JS = `(function(){'use strict';
var toc=JSON.parse(document.getElementById('toc-data').textContent),cache={},PAGE=400;
var $=function(id){return document.getElementById(id)};
function esc(s){return String(s).replace(/[&<>"']/g,function(c){return{'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]})}
function inl(t){return esc(t).replace(/\\*\\*([^*\\n][^*\\n]*?)\\*\\*/g,'<strong>$1</strong>').replace(/\\*([^*\\n][^*\\n]*?)\\*/g,'<em>$1</em>')}
function paras(t){return t.split(/\\n{2,}/).map(function(p){return '<p>'+inl(p).replace(/\\n/g,'<br>')+'</p>'}).join('')}
var F;try{F=new Intl.DateTimeFormat('id',{dateStyle:'medium',timeStyle:'short'})}catch(e){F={format:function(d){return d.toISOString()}}}
function when(m){return typeof m[0]==='number'?F.format(new Date(m[0])):(m[0]||'')}
function chat(i){if(!cache[i]){var el=document.querySelector('script[data-chat="'+i+'"]');cache[i]=el?JSON.parse(el.textContent):[]}return cache[i]}
function img(p){var el=document.querySelector('script[data-img="'+CSS.escape(p)+'"]');return el?el.textContent:''}
function msg(m,i){var who=m[2]?'<span class="who">'+esc(m[2])+'</span>':'',pic='';if(m[3]){var src=img(m[3]);pic=src?'<p><img src="'+src+'" alt="Gambar dari chat"></p>':'<p class="meta">[gambar: '+esc(m[3])+']</p>'}
return '<article class="msg" id="m'+i+'"><time>'+esc(when(m))+who+'</time>'+(m[1]?paras(m[1]):'')+pic+'</article>'}
function showToc(){$('toc').hidden=false;$('reader').hidden=true;$('results').hidden=true;document.title=document.querySelector('.cover h1').textContent}
function showChat(i,at){var c=toc[i],ms=chat(i),end=Math.min(ms.length,Math.max(PAGE,(at||0)+50)),start=at&&at>=PAGE?Math.max(0,at-50):0;
$('toc').hidden=true;$('results').hidden=true;$('reader').hidden=false;document.title=c.t;
var h='<a class="back" href="#">Semua chat</a><h2>'+esc(c.t)+'</h2><p class="meta">'+esc(c.r)+'</p>'+(c.g?'<p class="meta">Dibuka dengan sapaan '+esc(c.g)+'</p>':'');
if(start>0)h+='<button class="more" data-chat="'+i+'" data-to="'+Math.max(0,start-PAGE)+'">Tampilkan pesan sebelumnya</button>';
h+='<div class="chat">';for(var k=start;k<end;k++)h+=msg(ms[k],k);h+='</div>';
if(end<ms.length)h+='<p><button class="more" data-chat="'+i+'" data-to="'+end+'">Tampilkan '+Math.min(PAGE,ms.length-end)+' berikutnya dari '+(ms.length-end)+' yang tersisa</button></p>';
$('reader').innerHTML=h;var t=at!=null?document.getElementById('m'+at):null;if(t){t.scrollIntoView();var q=$('q').value.trim();if(q)mark(t,q)}else window.scrollTo(0,0)}
function mark(el,q){var re=new RegExp(q.replace(/[.*+?^\${}()|[\\]\\\\]/g,'\\\\$&').replace(/\\s+/g,'\\\\s+'),'gi');el.querySelectorAll('p').forEach(function(p){p.innerHTML=p.innerHTML.replace(/(^|>)([^<]+)/g,function(_,a,b){return a+b.replace(re,function(x){return '<mark>'+x+'</mark>'})})})}
function search(q){q=q.trim();if(!q){showToc();return}var re=new RegExp(q.replace(/[.*+?^\${}()|[\\]\\\\]/g,'\\\\$&').replace(/\\s+/g,'\\\\s+'),'i'),hits=[],total=0;
for(var i=0;i<toc.length;i++){var ms=chat(i);for(var k=0;k<ms.length;k++){var t=ms[k][1]||'',m=re.exec(t);if(m){total++;if(hits.length<300){var a=Math.max(0,m.index-60);hits.push([i,k,(a?'…':'')+t.slice(a,m.index),m[0],t.slice(m.index+m[0].length,m.index+m[0].length+90)])}}}}
var h='<p class="meta">'+total+' pesan yang cocok'+(total>300?', menampilkan 300 yang pertama':'')+'</p>';
hits.forEach(function(x){h+='<a class="hit" href="#c'+x[0]+'-'+x[1]+'"><span class="meta">'+esc(toc[x[0]].t)+'</span><br>'+esc(x[2])+'<mark>'+esc(x[3])+'</mark>'+esc(x[4])+'</a>'});
$('results').innerHTML=h;$('results').hidden=false;$('toc').hidden=true;$('reader').hidden=true}
function route(){var m=location.hash.match(/^#c(\\d+)(?:-(\\d+))?$/);if(m&&toc[+m[1]])showChat(+m[1],m[2]!=null?+m[2]:null);else if($('q').value.trim())search($('q').value);else showToc()}
document.addEventListener('click',function(e){var b=e.target.closest('.more');if(b){showChat(+b.dataset.chat,+b.dataset.to)}});
var timer;$('q').addEventListener('input',function(){clearTimeout(timer);timer=setTimeout(function(){if(location.hash)history.replaceState(null,'',location.pathname);search($('q').value)},250)});
$('clear').addEventListener('click',function(){$('q').value='';location.hash='';showToc()});
window.addEventListener('hashchange',route);route()})();`;

  const LS = String.fromCharCode(0x2028), PS = String.fromCharCode(0x2029);
  const BS = String.fromCharCode(92);
  const jsonScript = (v) => JSON.stringify(v).split('<').join(BS + 'u003c').split(LS).join(BS + 'u2028').split(PS).join(BS + 'u2029');

  function coverLines(chats, opts) {
    const total = chats.reduce((n, c) => n + c.msgs.length, 0);
    let start = Infinity, end = -Infinity;
    for (const c of chats) { const s = c.summary || {}; if (Number.isFinite(s.start)) start = Math.min(start, s.start); if (Number.isFinite(s.end)) end = Math.max(end, s.end); }
    const range = Number.isFinite(start) ? rangeText({ start, end }, opts.locale) : '';
    return { total, range, who: opts.owner || '' };
  }

  // returns an array of strings (Blob parts), so a very large archive is never one giant string
  function bookHtml(chats, opts, images = {}) {
    const c = coverLines(chats, opts);
    const title = opts.title || 'Arsip chat';
    const toc = chats.map((ch) => ({ t: chatTitle(ch, opts), r: `${plural(ch.msgs.length, 'pesan', 'pesan')}${rangeText(ch.summary || {}, opts.locale) ? ', ' + rangeText(ch.summary || {}, opts.locale) : ''}`, g: (ch.summary || {}).greetingOf || '' }));
    const parts = [`<!doctype html><html lang="${esc(opts.lang || 'en')}"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta name="robots" content="noindex"><title>${esc(title)}</title><style>${BOOK_CSS}</style></head><body>`
      + `<header class="cover"><div class="in"><h1>${esc(title)}</h1>${c.who ? `<p class="gilt">${esc(c.who)}</p>` : ''}<p>${esc(plural(chats.length, 'chat', 'chat'))}, ${esc(plural(c.total, 'pesan', 'pesan'))}${c.range ? `, ${esc(c.range)}` : ''}</p>`
      + `<p>Dibuat pada ${esc(dateFmt(opts.locale, false).format(new Date(opts.now || Date.now())))} dari ekspor data Character.AI. File ini bisa dipakai offline.</p></div></header>`
      + `<div class="bar"><div class="in"><input id="q" type="search" placeholder="Cari di semua chat" aria-label="Cari di semua chat"><button id="clear" type="button">Daftar isi</button></div></div>`
      + `<main><section id="toc"><h2>Daftar isi</h2>${opts.speakers ? '' : `<p class="meta">${esc(NO_SENDER)}</p>`}<ol class="toc">`
      + toc.map((t, i) => `<li><a href="#c${i}"><b>${esc(t.t)}</b><span>${esc(t.r)}${t.g ? `. Dibuka dengan sapaan ${esc(t.g)}` : ''}</span></a></li>`).join('')
      + `</ol></section><section id="results" hidden></section><section id="reader" hidden></section></main>`
      + `<footer>Dibuat dengan <a href="${SITE}">Chatbound</a>. Tidak berafiliasi dengan Character Technologies, Inc.</footer>`
      + `<script type="application/json" id="toc-data">${jsonScript(toc)}</script>`];
    chats.forEach((ch, i) => {
      parts.push(`<script type="application/json" data-chat="${i}">`);
      // in slices, so no single string holds a whole long chat twice
      const rows = ch.msgs.map((m) => [Number.isFinite(m.ts) ? m.ts : m.time || '', m.text, m.who || '', m.img || '']);
      for (let k = 0; k < rows.length; k += 2000) {
        const piece = jsonScript(rows.slice(k, k + 2000));
        parts.push(k === 0 ? piece.slice(0, -1) : ',' + piece.slice(1, -1));
      }
      parts.push(rows.length ? ']</script>' : '[]</script>');
    });
    for (const [p, src] of Object.entries(images)) parts.push(`<script type="text/plain" data-img="${esc(p)}">${src}</script>`);
    parts.push(`<script>${BOOK_JS}</script></body></html>`);
    return parts;
  }

  // ---------------------------------------------------------------- print layout (Pro): the browser saves it as PDF
  const PRINT_CSS = `@page{size:auto;margin:18mm 16mm 20mm}@page{@bottom-center{content:counter(page);font:10pt system-ui,sans-serif;color:#6b6370}}
*{box-sizing:border-box}html{-webkit-print-color-adjust:exact;print-color-adjust:exact}body{margin:0;color:#1d1622;background:#fff;font:11.5pt/1.55 "Iowan Old Style","Palatino Linotype",Palatino,Georgia,"Noto Serif",serif}
.cover{break-after:page;min-height:240mm;background:#7b1830;color:#fff;padding:30mm 18mm;border-bottom:4mm solid #f2c14e;display:flex;flex-direction:column;justify-content:flex-end}
.cover h1{font-size:36pt;line-height:1.05;margin:0 0 6mm}.cover p{margin:0 0 2mm;color:#f7e3e8;font-family:system-ui,sans-serif;font-size:11pt}.cover .gilt{color:#f2c14e;font-weight:600}
.contents{break-after:page}h2{font-size:18pt;margin:0 0 4mm;break-after:avoid}.contents ol{padding-left:6mm}.contents li{margin:0 0 1.5mm}.contents span{color:#6b6370;font:9.5pt system-ui,sans-serif}
.chat{break-before:page}.meta{color:#6b6370;font:9.5pt/1.4 system-ui,sans-serif;margin:0 0 1.5mm}
.msg{padding:2.6mm 0;border-top:.3mm solid #e3dde8;break-inside:auto}.msg time{display:block;font:8.5pt/1.3 system-ui,sans-serif;color:#6b6370;margin-bottom:1mm;break-after:avoid}.msg .who{color:#7b1830;font-weight:600;margin-left:2mm}
.msg p{margin:0 0 1.6mm;orphans:2;widows:2;overflow-wrap:anywhere}.msg img{max-width:100%;max-height:120mm}.note{font:9pt system-ui,sans-serif;color:#6b6370}
.screen{font:14px/1.5 system-ui,sans-serif;background:#fff6d6;border-bottom:1px solid #e7cf7a;padding:12px 16px}@media print{.screen{display:none}}`;

  function printHtml(chats, opts, images = {}) {
    const f = dateFmt(opts.locale);
    const c = coverLines(chats, opts);
    const title = opts.title || 'Arsip chat';
    const parts = [`<!doctype html><html lang="${esc(opts.lang || 'en')}"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${esc(title)}</title><style>${PRINT_CSS}</style></head><body>`
      + (opts.screenNote ? `<div class="screen">${esc(opts.screenNote)}</div>` : '')
      + `<section class="cover"><h1>${esc(title)}</h1>${c.who ? `<p class="gilt">${esc(c.who)}</p>` : ''}<p>${esc(plural(chats.length, 'chat', 'chat'))}, ${esc(plural(c.total, 'pesan', 'pesan'))}${c.range ? `, ${esc(c.range)}` : ''}</p><p>Dibuat dengan Chatbound dari ekspor data Character.AI.</p></section>`];
    if (chats.length > 1) parts.push(`<section class="contents"><h2>Daftar isi</h2><ol>${chats.map((ch) => `<li>${esc(chatTitle(ch, opts))} <span>${esc(plural(ch.msgs.length, 'pesan', 'pesan'))}</span></li>`).join('')}</ol>${opts.speakers ? '' : `<p class="note">${esc(NO_SENDER)}</p>`}</section>`);
    for (const ch of chats) {
      const s = ch.summary || {};
      parts.push(`<section class="chat"><h2>${esc(chatTitle(ch, opts))}</h2><p class="meta">${esc(plural(ch.msgs.length, 'pesan', 'pesan'))}${rangeText(s, opts.locale) ? ', ' + esc(rangeText(s, opts.locale)) : ''}</p>${s.greetingOf ? `<p class="meta">Dibuka dengan sapaan ${esc(s.greetingOf)}</p>` : ''}`);
      let buf = '';
      for (const m of ch.msgs) { buf += msgHtml(m, f, m.img && images[m.img]); if (buf.length > 200000) { parts.push(buf); buf = ''; } }
      parts.push(buf + '</section>');
    }
    parts.push('</body></html>');
    return parts;
  }

  // ---------------------------------------------------------------- EPUB (Pro)
  const EPUB_CSS = `body{font-family:serif;line-height:1.55;margin:0 4%}h1{font-family:sans-serif;font-size:1.5em;line-height:1.2;margin:1em 0 .3em}
.meta{font-family:sans-serif;font-size:.8em;color:#6b6370;margin:0 0 .3em}.msg{margin:0;padding:.7em 0;border-top:1px solid #ddd}
.msg .t{font-family:sans-serif;font-size:.75em;color:#6b6370;margin:0 0 .2em}.msg .who{color:#7b1830;font-weight:bold}.msg p{margin:0 0 .5em}
.cover{text-align:center;margin-top:20%}.cover h1{font-size:2em}img{max-width:100%}`;

  function uuid() {
    const b = new Uint8Array(16);
    (root.crypto && root.crypto.getRandomValues ? root.crypto.getRandomValues(b) : b.forEach((_, i) => { b[i] = Math.floor(Math.random() * 256); }));
    b[6] = (b[6] & 15) | 64; b[8] = (b[8] & 63) | 128;
    const h = [...b].map((x) => x.toString(16).padStart(2, '0')).join('');
    return `${h.slice(0, 8)}-${h.slice(8, 12)}-${h.slice(12, 16)}-${h.slice(16, 20)}-${h.slice(20)}`;
  }
  const xhtml = (title, body, lang) => `<?xml version="1.0" encoding="utf-8"?>\n<!DOCTYPE html>\n<html xmlns="http://www.w3.org/1999/xhtml" xmlns:epub="http://www.idpf.org/2007/ops" xml:lang="${lang}" lang="${lang}"><head><meta charset="utf-8"/><title>${esc(xmlSafe(title))}</title><link rel="stylesheet" type="text/css" href="style.css"/></head><body>${body}</body></html>`;

  // images: { path: { bytes: Uint8Array, type } }. Returns an array of Uint8Array parts (an EPUB is a ZIP).
  function epub(chats, opts, images = {}) {
    const fl = root.fflate;
    const enc = new TextEncoder();
    const lang = /^[a-z]{2,3}(-[A-Za-z0-9]{2,8})*$/.test(opts.lang || '') ? opts.lang : 'en';
    const f = dateFmt(opts.locale);
    const title = xmlSafe(opts.title || 'Arsip chat');
    const c = coverLines(chats, opts);
    const out = [];
    let failed = null;
    const zip = new fl.Zip((err, data) => { if (err) failed = err; else out.push(data); });
    const addStored = (name, text) => { const e = new fl.ZipPassThrough(name); zip.add(e); e.push(typeof text === 'string' ? enc.encode(text) : text, true); };
    const addDeflated = (name, text) => { const e = new fl.ZipDeflate(name, { level: 2 }); zip.add(e); e.push(typeof text === 'string' ? enc.encode(text) : text, true); };
    addStored('mimetype', 'application/epub+zip');
    addDeflated('META-INF/container.xml', '<?xml version="1.0" encoding="UTF-8"?>\n<container version="1.0" xmlns="urn:oasis:names:tc:opendocument:xmlns:container"><rootfiles><rootfile full-path="OEBPS/content.opf" media-type="application/oebps-package+xml"/></rootfiles></container>');
    addDeflated('OEBPS/style.css', EPUB_CSS);
    const manifest = ['<item id="css" href="style.css" media-type="text/css"/>', '<item id="nav" href="nav.xhtml" media-type="application/xhtml+xml" properties="nav"/>', '<item id="ncx" href="toc.ncx" media-type="application/x-dtbncx+xml"/>', '<item id="cover" href="cover.xhtml" media-type="application/xhtml+xml"/>'];
    const spine = ['<itemref idref="cover"/>'];
    const navItems = [];
    addDeflated('OEBPS/cover.xhtml', xhtml(title, `<div class="cover"><h1>${esc(title)}</h1>${c.who ? `<p>${esc(xmlSafe(c.who))}</p>` : ''}<p class="meta">${esc(plural(chats.length, 'chat', 'chat'))}, ${esc(plural(c.total, 'pesan', 'pesan'))}${c.range ? `, ${esc(c.range)}` : ''}</p><p class="meta">Dibuat dengan Chatbound dari ekspor data Character.AI.</p>${opts.speakers ? '' : `<p class="meta">${esc(NO_SENDER)}</p>`}</div>`, lang));
    const imgFiles = {};
    let imgN = 0;
    for (const [p, im] of Object.entries(images)) {
      const ext = im.type === 'image/png' ? 'png' : im.type === 'image/gif' ? 'gif' : im.type === 'image/webp' ? 'webp' : 'jpg';
      const name = `images/i${++imgN}.${ext}`;
      imgFiles[p] = name;
      addStored(`OEBPS/${name}`, im.bytes);
      manifest.push(`<item id="img${imgN}" href="${name}" media-type="${im.type || 'image/jpeg'}"/>`);
    }
    let fileN = 0;
    chats.forEach((ch, ci) => {
      const ct = xmlSafe(chatTitle(ch, opts));
      const s = ch.summary || {};
      const per = 1200;
      for (let k = 0, part = 0; k < Math.max(1, ch.msgs.length); k += per, part++) {
        const name = `c${String(++fileN).padStart(4, '0')}.xhtml`;
        let body = part === 0 ? `<h1 id="t">${esc(ct)}</h1><p class="meta">${esc(plural(ch.msgs.length, 'pesan', 'pesan'))}${rangeText(s, opts.locale) ? ', ' + esc(rangeText(s, opts.locale)) : ''}</p>${s.greetingOf ? `<p class="meta">Dibuka dengan sapaan ${esc(xmlSafe(s.greetingOf))}</p>` : ''}` : '';
        for (const m of ch.msgs.slice(k, k + per)) {
          const pic = m.img ? (imgFiles[m.img] ? `<p><img src="${imgFiles[m.img]}" alt="Gambar dari chat"/></p>` : `<p class="meta">[gambar: ${esc(xmlSafe(m.img))}]</p>`) : '';
          body += `<div class="msg"><p class="t">${esc(when(m, f))}${m.who ? ` <span class="who">${esc(xmlSafe(m.who))}</span>` : ''}</p>${m.text ? paragraphs(m.text, true) : ''}${pic}</div>`;
        }
        addDeflated(`OEBPS/${name}`, xhtml(ct, body, lang));
        manifest.push(`<item id="f${fileN}" href="${name}" media-type="application/xhtml+xml"/>`);
        spine.push(`<itemref idref="f${fileN}"/>`);
        if (part === 0) navItems.push({ name, title: ct, i: ci });
      }
    });
    addDeflated('OEBPS/nav.xhtml', xhtml('Daftar isi', `<nav epub:type="toc" id="toc"><h1>Daftar isi</h1><ol>${navItems.map((n) => `<li><a href="${n.name}">${esc(n.title)}</a></li>`).join('')}</ol></nav>`, lang));
    const id = 'urn:uuid:' + uuid();
    addDeflated('OEBPS/toc.ncx', `<?xml version="1.0" encoding="UTF-8"?>\n<ncx xmlns="http://www.daisy.org/z3986/2005/ncx/" version="2005-1"><head><meta name="dtb:uid" content="${id}"/></head><docTitle><text>${esc(title)}</text></docTitle><navMap>${navItems.map((n, i) => `<navPoint id="n${i + 1}" playOrder="${i + 1}"><navLabel><text>${esc(n.title)}</text></navLabel><content src="${n.name}"/></navPoint>`).join('')}</navMap></ncx>`);
    const modified = new Date(opts.now || Date.now()).toISOString().replace(/\.\d+Z$/, 'Z');
    addDeflated('OEBPS/content.opf', `<?xml version="1.0" encoding="UTF-8"?>\n<package xmlns="http://www.idpf.org/2007/opf" version="3.0" unique-identifier="bookid" xml:lang="${lang}"><metadata xmlns:dc="http://purl.org/dc/elements/1.1/"><dc:identifier id="bookid">${id}</dc:identifier><dc:title>${esc(title)}</dc:title><dc:language>${lang}</dc:language>${c.who ? `<dc:creator>${esc(xmlSafe(c.who))}</dc:creator>` : ''}<dc:publisher>Dibuat dengan Chatbound</dc:publisher><meta property="dcterms:modified">${modified}</meta></metadata><manifest>${manifest.join('')}</manifest><spine toc="ncx">${spine.join('')}</spine></package>`);
    zip.end();
    if (failed) throw failed;
    return out;
  }

  return { esc, inline, paragraphs, chatTitle, chatTxt, chatMd, chatHtml, bookHtml, printHtml, epub, NO_SENDER, xmlSafe };
});
