/* Chatbound page logic. The heavy work (unzipping, decrypting, reading JSON, searching, writing files) runs in
 * js/worker.js; this file only draws the page. Nothing here sends your file anywhere: the only network call the page
 * can make is Gumroad's licence check (/assets/license.js), and only when a Pro key is pasted. */
(function () {
  'use strict';

  // ---- Gumroad Pro product (permalink chatbound-pro). The licence check sends the product id, never the permalink.
  // Fail closed: while this is 'PENDING' (or empty) Pro never turns on, whatever the browser has stored.
  const GUMROAD = {
    productId: 'NMvU8_Syifdn0_oUTvzyWA==',
    permalink: 'chatbound-pro',
    url: 'https://dorukctn.gumroad.com/l/chatbound-pro',
    price: 'US$ 8',
  };
  const PRO_READY = !!GUMROAD.productId && GUMROAD.productId !== 'PENDING';
  const LICENSE = {
    tool: 'chatbound', localMessages: true, strings: { title: 'Activar Pro', buy: 'Comprar Pro en Gumroad', keyLabel: '¿Ya compraste Pro? Pega aquí tu clave de licencia', verify: 'Activar', close: 'Cerrar', checking: 'Comprobando con Gumroad…', badKey: 'Eso no parece una clave de licencia. Viene en el correo del recibo de Gumroad.', network: 'No se pudo conectar con Gumroad para comprobar la clave. Revisa tu conexión e inténtalo de nuevo.', ok: 'Pro está activo en este navegador. Gracias.', refunded: 'Esta compra se reembolsó o ya no es válida, así que Pro está desactivado.', rejected: 'No se aceptó esa clave de licencia.', active: 'Pro está activo en este navegador.' },
    productId: PRO_READY ? GUMROAD.productId : 'PENDING',
    permalink: GUMROAD.permalink,
    buyUrl: GUMROAD.url,
    pitch: `Pro guarda y traslada todo el archivo: todos los personajes y chats como tarjetas y archivos de chat para SillyTavern y otras apps en un solo ZIP, todos los chats en un libro sin conexión con búsqueda, un PDF y un EPUB, y varias exportaciones unidas en una. ${GUMROAD.price}, un solo pago.`,
  };

  const BASE = '/character-ai-export-viewer/';
  const $ = (id) => document.getElementById(id);
  const esc = (s) => String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const fmtN = (n) => Number(n || 0).toLocaleString('es');
  const plural = (n, one, many) => `${fmtN(n)} ${n === 1 ? one : many}`;
  const LOCALE = 'es';
  let DF, DD;
  try { DF = new Intl.DateTimeFormat(LOCALE, { dateStyle: 'medium', timeStyle: 'short' }); DD = new Intl.DateTimeFormat(LOCALE, { dateStyle: 'medium' }); } catch (e) { DF = new Intl.DateTimeFormat('en', { dateStyle: 'medium', timeStyle: 'short' }); DD = new Intl.DateTimeFormat('en', { dateStyle: 'medium' }); }
  const day = (t) => (Number.isFinite(t) ? DD.format(new Date(t)) : '');
  const when = (m) => (Number.isFinite(m.ts) ? DF.format(new Date(m.ts)) : m.time || '');
  function range(s) { const a = day(s.start), b = day(s.end); return !a ? '' : a === b || !b ? a : `del ${a} al ${b}`; }

  // ---------------------------------------------------------------- the worker
  let worker = null, seq = 0;
  const waiting = new Map();
  function startWorker() {
    if (worker) return worker;
    worker = new Worker('/es/visor-exportacion-character-ai/js/worker.js?v=2');
    worker.onmessage = (e) => {
      const m = e.data || {};
      if (m.type === 'progress') return onProgress(m);
      const w = waiting.get(m.id);
      if (!w) return;
      waiting.delete(m.id);
      if (m.ok) w.resolve(m.result); else w.reject(Object.assign(new Error(m.error.message), { code: m.error.code }));
    };
    worker.onerror = (e) => { for (const w of waiting.values()) w.reject(new Error(e.message || 'El lector se detuvo.')); waiting.clear(); };
    return worker;
  }
  function call(cmd, args) {
    startWorker();
    return new Promise((resolve, reject) => { const id = ++seq; waiting.set(id, { resolve, reject }); worker.postMessage({ id, cmd, args }); });
  }

  // ---------------------------------------------------------------- the request counter
  let openedAt = null, sent = 0;
  const ownStatic = (u) => { try { const x = new URL(u, location.href); return x.origin === location.origin && /^\/character-ai-export-viewer\/(img|fonts)\//.test(x.pathname); } catch (e) { return false; } };
  function countRequests(list) {
    if (openedAt == null) return;
    for (const e of list) if (e.startTime >= openedAt && !/^(blob|data):/.test(e.name) && !ownStatic(e.name)) sent++;
    $('cb-sent').textContent = String(sent);
  }
  try { new PerformanceObserver((l) => countRequests(l.getEntries())).observe({ type: 'resource', buffered: false }); } catch (e) { /* old browser: the counter stays as it is */ }
  function armCounter() {
    if (openedAt != null) return;
    openedAt = performance.now();
    $('cb-sent-label').textContent = 'solicitudes de red desde que abriste el archivo';
  }

  // ---------------------------------------------------------------- start panel states
  const PANELS = ['cb-idle', 'cb-pass', 'cb-busy', 'cb-error', 'cb-merge'];
  function show(id) { for (const p of PANELS) $(p).hidden = p !== id; }
  let items = [];        // [{ file, path }]
  let passwords = {};    // file index -> typed email (memory only)
  let allowMerge = false;
  let passFor = null;
  let pro = false;
  const hooks = { open: [], close: [] };

  const ERRORS = {
    not_export: 'Esto no parece una exportación de Character.AI. Abre el ZIP del correo de la exportación o el message.json que lleva dentro.',
    truncated: 'Falta el final de este ZIP, como si la descarga se hubiera cortado antes de tiempo. Vuelve a descargarlo desde el correo mientras el enlace siga activo (7 días).',
    only_images: 'Estos archivos son solo imágenes. Añade también el ZIP de la exportación o su message.json.',
    empty: 'El archivo se abrió, pero no tiene mensajes ni personajes.',
    read: 'El navegador no pudo leer este archivo. Si todavía se está descargando, espera a que termine y vuelve a intentarlo.',
  };

  function onProgress(m) {
    if (m.phase === 'reading' && m.total) {
      const pct = Math.min(100, Math.round((m.done / m.total) * 100));
      $('cb-bar').style.width = pct + '%';
      $('cb-busy-text').textContent = `Leyendo ${m.name || 'la exportación'}: ${pct}%`;
    } else if (m.phase === 'sorting') {
      $('cb-bar').style.width = '100%';
      $('cb-busy-text').textContent = 'Ordenando los chats…';
    } else if (m.phase === 'writing') {
      toast(m.name === 'epub' ? 'Creando el EPUB…' : m.name === 'zip' ? `Creando el ZIP: ${fmtN(m.done)} de ${fmtN(m.total)} chats…` : 'Creando el libro…');
    }
  }

  async function openItems() {
    armCounter();
    show('cb-busy');
    $('cb-bar').style.width = '0';
    $('cb-busy-text').textContent = 'Leyendo el archivo…';
    let r;
    try {
      r = await call('open', { items, passwords, allowMerge });
    } catch (e) {
      return fail(e.code && ERRORS[e.code] ? ERRORS[e.code] : `No se pudo abrir el archivo: ${e.message}`);
    }
    if (r.status === 'password') {
      passFor = r.index;
      show('cb-pass');
      const many = items.length > 1;
      $('cb-email-label').textContent = many ? `Correo de la cuenta que generó ${r.name}` : 'Correo de tu cuenta de Character.AI';
      $('cb-pass-err').hidden = !r.wrong;
      const input = $('cb-email');
      input.value = passwords[r.index] || '';
      input.focus();
      return;
    }
    if (r.status === 'merge') {
      show('cb-merge');
      $('cb-merge-text').textContent = `Añadiste ${r.units} exportaciones (${r.names.join(', ')}). Leerlas juntas como un solo archivo, sin los mensajes repetidos, forma parte de Pro. También puedes abrir solo la primera ahora.`;
      return;
    }
    if (r.status === 'error') return fail(ERRORS[r.code] || r.message || ERRORS.not_export);
    ready(r);
  }
  function fail(text) { show('cb-error'); $('cb-error-text').textContent = text; }

  function reset() {
    items = []; passwords = {}; allowMerge = false; passFor = null;
    show('cb-idle');
    $('cb-app-wrap').hidden = true;
    clearReader();
    hooks.close.forEach((fn) => { try { fn(); } catch (e) { /* a part of the page */ } });
    call('close', {}).catch(() => {});
  }

  // ---------------------------------------------------------------- choosing files
  async function entriesFromDrop(dt) {
    const out = [];
    const list = dt.items ? [...dt.items] : [];
    const roots = list.map((it) => (it.webkitGetAsEntry ? it.webkitGetAsEntry() : null)).filter(Boolean);
    if (!roots.length) return [...(dt.files || [])].map((f) => ({ file: f, path: f.name }));
    async function walk(entry, prefix) {
      if (entry.isFile) {
        const file = await new Promise((res, rej) => entry.file(res, rej));
        out.push({ file, path: prefix + file.name });
      } else if (entry.isDirectory) {
        const reader = entry.createReader();
        let batch;
        do {
          batch = await new Promise((res, rej) => reader.readEntries(res, rej));
          for (const e of batch) await walk(e, prefix + entry.name + '/');
        } while (batch.length);
      }
    }
    for (const r of roots) await walk(r, '');
    return out;
  }
  function take(list, add) {
    const fresh = list.filter((x) => x.file);
    if (!fresh.length) return;
    if (add) { items = items.concat(fresh); allowMerge = true; } else { items = fresh; passwords = {}; allowMerge = false; }
    openItems();
  }

  const drop = $('cb-drop'), fileInput = $('cb-file');
  $('cb-choose').addEventListener('click', () => fileInput.click());
  fileInput.addEventListener('change', () => { const add = fileInput.dataset.add === '1'; fileInput.dataset.add = ''; take([...fileInput.files].map((f) => ({ file: f, path: f.webkitRelativePath || f.name })), add); fileInput.value = ''; });
  ['dragenter', 'dragover'].forEach((t) => document.addEventListener(t, (e) => { if (e.dataTransfer && [...(e.dataTransfer.types || [])].includes('Files')) { e.preventDefault(); drop.classList.add('is-over'); } }));
  ['dragleave', 'dragend'].forEach((t) => document.addEventListener(t, (e) => { if (!e.relatedTarget) drop.classList.remove('is-over'); }));
  document.addEventListener('drop', async (e) => {
    if (!e.dataTransfer || !e.dataTransfer.files || !e.dataTransfer.files.length) return;
    e.preventDefault();
    drop.classList.remove('is-over');
    const appOpen = !$('cb-app-wrap').hidden;
    const list = await entriesFromDrop(e.dataTransfer);
    if (appOpen) {
      if (!(PRO_READY && PeakLicense.requirePro('Añadir una segunda exportación a la que está abierta, sin los mensajes repetidos, forma parte de Pro.'))) return;
      take(list, true);
    } else take(list, false);
  });
  $('cb-sample').addEventListener('click', async () => {
    show('cb-busy');
    $('cb-busy-text').textContent = 'Preparando la exportación de ejemplo…';
    try {
      const f = await call('sample', {});
      items = [{ file: f, path: f.name }]; passwords = {}; allowMerge = false;
      openItems();
    } catch (e) { fail(`No se pudo preparar el ejemplo: ${e.message}`); }
  });
  $('cb-pass').addEventListener('submit', (e) => {
    e.preventDefault();
    const v = $('cb-email').value.trim().toLowerCase();
    if (!v) { $('cb-email').focus(); return; }
    passwords[passFor] = v;
    openItems();
  });
  document.querySelectorAll('[data-cb-reset]').forEach((b) => b.addEventListener('click', () => { reset(); $('cb-start').focus(); }));
  document.querySelectorAll('[data-cb-close]').forEach((b) => b.addEventListener('click', () => { reset(); $('cb-start').scrollIntoView({ block: 'start' }); $('cb-start').focus(); }));
  $('cb-merge-first').addEventListener('click', () => {
    // keep the first export and every file that is not an export of its own (pictures)
    const first = items.find((x) => !/\.(png|jpe?g|webp|gif|avif)$/i.test(x.path));
    items = items.filter((x) => x === first || /\.(png|jpe?g|webp|gif|avif)$/i.test(x.path));
    allowMerge = false;
    openItems();
  });
  $('cb-merge-pro').addEventListener('click', () => {
    if (!(PRO_READY && PeakLicense.requirePro('Unir varias exportaciones en un solo archivo forma parte de Pro.'))) return;
    allowMerge = true;
    openItems();
  });
  $('cb-add').addEventListener('click', () => {
    if (!(PRO_READY && PeakLicense.requirePro('Añadir otra exportación a esta, sin los mensajes repetidos, forma parte de Pro.'))) return;
    fileInput.dataset.add = '1';
    fileInput.click();
  });

  // ---------------------------------------------------------------- the open archive
  let OV = null;           // overview from the worker
  let current = null;      // { id, total, from }
  let names = {};
  try { names = JSON.parse(localStorage.getItem('chatbound:names') || '{}') || {}; } catch (e) { names = {}; }
  const saveNames = () => { try { localStorage.setItem('chatbound:names', JSON.stringify(names)); } catch (e) { /* private mode */ } };
  const titleOf = (s) => names[s.id] || s.name || (Number.isFinite(s.start) ? `Chat del ${DD.format(new Date(s.start))}` : 'Chat');
  const owner = () => (OV.user && OV.user.first_name) || OV.usernames[0] || '';

  function ready(r) {
    OV = r;
    show('cb-idle');
    $('cb-app-wrap').hidden = false;
    $('cb-owner').textContent = owner() ? `Exportación de ${owner()}` : 'Tu exportación';
    const c = r.counts;
    $('cb-summary').textContent = [plural(c.chats, 'chat', 'chats'), plural(c.messages, 'mensaje', 'mensajes'), c.characters ? plural(c.characters, 'personaje', 'personajes') : '', c.duplicates ? `${fmtN(c.duplicates)} mensajes repetidos eliminados` : ''].filter(Boolean).join(', ');
    $('tab-chars').textContent = `Personajes (${fmtN(c.characters)})`;
    $('cb-q').value = '';
    renderList();
    renderChars();
    renderFile();
    hooks.open.forEach((fn) => { try { fn(r); } catch (e) { /* a part of the page */ } });
    selectTab(c.chats ? 'tab-chats' : c.characters ? 'tab-chars' : 'tab-file');
    clearReader();
    if (c.chats && window.matchMedia('(min-width: 900px)').matches) openChat(r.chats[0].id, 0);
    $('cb-app-wrap').scrollIntoView({ block: 'start', behavior: 'smooth' });
  }

  // chat list, in batches so thousands of chats stay quick
  let listShown = 0;
  function itemHtml(s) {
    const meta = [plural(s.count, 'mensaje', 'mensajes'), range(s)].filter(Boolean).join(', ');
    return `<li><button type="button" class="cb-item" data-chat="${esc(s.id)}"${current && current.id === s.id ? ' aria-current="true"' : ''}><b>${esc(titleOf(s))}</b><small>${esc(meta)}${s.greetingOf ? `. Empieza con el saludo de ${esc(s.greetingOf)}` : ''}</small><span>${esc(s.snippet)}</span></button></li>`;
  }
  function renderList(more) {
    const list = $('cb-list');
    const chats = OV.chats;
    const end = Math.min(chats.length, (more ? listShown : 0) + 200);
    const html = chats.slice(more ? listShown : 0, end).map(itemHtml).join('');
    if (more) { list.querySelector('.cb-more-li') && list.querySelector('.cb-more-li').remove(); list.insertAdjacentHTML('beforeend', html); } else list.innerHTML = html;
    listShown = end;
    if (end < chats.length) list.insertAdjacentHTML('beforeend', `<li class="cb-more-li"><button type="button" class="cb-item" data-more-chats><b>Mostrar más chats</b><small>${fmtN(chats.length - end)} más</small></button></li>`);
    $('cb-count').textContent = chats.length ? `${plural(chats.length, 'chat', 'chats')}, del más reciente al más antiguo` : 'Ningún chat en esta exportación';
  }
  $('cb-list').addEventListener('click', (e) => {
    const b = e.target.closest('button');
    if (!b) return;
    if (b.hasAttribute('data-more-chats')) return renderList(true);
    if (b.dataset.chat) openChat(b.dataset.chat, b.dataset.at != null ? Number(b.dataset.at) : 0, b.dataset.at != null ? Number(b.dataset.at) : null);
  });

  // search
  let qTimer = null, lastQ = '';
  $('cb-q').addEventListener('input', () => { clearTimeout(qTimer); qTimer = setTimeout(runSearch, 220); });
  async function runSearch() {
    const q = $('cb-q').value.trim();
    lastQ = q;
    if (!q) { renderList(); return; }
    $('cb-count').textContent = 'Buscando…';
    const r = await call('search', { q, limit: 300 });
    if (r.cancelled || q !== lastQ) return;
    const byId = new Map(OV.chats.map((s) => [s.id, s]));
    $('cb-count').textContent = r.total ? `${plural(r.total, 'mensaje coincide', 'mensajes coinciden')}${r.total > r.hits.length ? `, se muestran los primeros ${fmtN(r.hits.length)}` : ''}` : 'Ningún mensaje coincide';
    $('cb-list').innerHTML = r.hits.map((h) => {
      const s = byId.get(h.id) || { id: h.id };
      return `<li><button type="button" class="cb-item" data-chat="${esc(h.id)}" data-at="${h.i}"><b>${esc(titleOf(s))}</b><span>${esc(h.before)}<mark>${esc(h.match)}</mark>${esc(h.after)}</span></button></li>`;
    }).join('');
  }

  // reading a chat
  let blobUrls = [];
  function clearReader() {
    blobUrls.forEach((u) => URL.revokeObjectURL(u)); blobUrls = [];
    current = null;
    $('cb-reader').innerHTML = '<div class="cb-empty"><p>Elige un chat de la lista de la izquierda. Los chats aparecen del más reciente al más antiguo.</p></div>';
    $('cb-chats').classList.remove('is-reading');
  }
  function textHtml(t) {
    return String(t).split(/\n{2,}/).map((p) => `<p>${esc(p).replace(/\*\*([^*\n][^*\n]*?)\*\*/g, '<strong>$1</strong>').replace(/\*([^*\n][^*\n]*?)\*/g, '<em>$1</em>').replace(/\n/g, '<br>')}</p>`).join('');
  }
  function markIn(el, q) {
    if (!q) return;
    const re = new RegExp(q.replace(/[.*+?^${}()|[\]\\]/g, '\\$&').replace(/\s+/g, '\\s+'), 'gi');
    const walker = document.createTreeWalker(el, NodeFilter.SHOW_TEXT);
    const nodes = [];
    while (walker.nextNode()) nodes.push(walker.currentNode);
    for (const n of nodes) {
      const t = n.nodeValue;
      re.lastIndex = 0;
      if (!re.test(t)) continue;
      re.lastIndex = 0;
      const frag = document.createDocumentFragment();
      let last = 0, m;
      while ((m = re.exec(t))) { frag.append(t.slice(last, m.index)); const mk = document.createElement('mark'); mk.textContent = m[0]; frag.append(mk); last = m.index + m[0].length; if (!m[0].length) re.lastIndex++; }
      frag.append(t.slice(last));
      n.parentNode.replaceChild(frag, n);
    }
  }
  const PAGE = 300;
  async function openChat(id, at, target) {
    const s = OV.chats.find((x) => x.id === id);
    if (!s) return;
    const from = target != null ? Math.max(0, Math.floor(target / PAGE) * PAGE) : at || 0;
    const page = await call('chatPage', { id, from, count: PAGE });
    blobUrls.forEach((u) => URL.revokeObjectURL(u)); blobUrls = [];
    current = { id, total: page.total, from: page.from };
    document.querySelectorAll('.cb-item[aria-current]').forEach((b) => b.removeAttribute('aria-current'));
    const btn = document.querySelector(`.cb-item[data-chat="${CSS.escape(id)}"]:not([data-at])`);
    if (btn) btn.setAttribute('aria-current', 'true');
    const meta = [plural(s.count, 'mensaje', 'mensajes'), range(s)].filter(Boolean).join(', ');
    const pager = (dir) => {
      if (dir < 0 && page.from > 0) return `<div class="cb-pager"><button class="cb-btn cb-btn-sm" type="button" data-page="${Math.max(0, page.from - PAGE)}">Mostrar los ${fmtN(Math.min(PAGE, page.from))} mensajes anteriores</button></div>`;
      const next = page.from + page.msgs.length;
      if (dir > 0 && next < page.total) return `<div class="cb-pager"><button class="cb-btn cb-btn-sm" type="button" data-page="${next}">Mostrar los siguientes ${fmtN(Math.min(PAGE, page.total - next))} de ${fmtN(page.total - next)} restantes</button></div>`;
      return '';
    };
    const msgs = page.msgs.map((m) => `<article class="cb-msg${target === m.i ? ' is-target' : ''}" id="msg-${m.i}"><time>${esc(when(m))}${m.who ? `<span class="who">${esc(m.who)}</span>` : ''}</time><div class="cb-text">${m.text ? textHtml(m.text) : ''}${m.img ? `<img alt="Imagen del chat" data-img="${esc(m.img)}">` : ''}</div></article>`).join('');
    const flag = OV.speakers ? '' : '<p class="cb-flag">La exportación no registra quién envió cada mensaje, así que se muestran en orden cronológico y sin nombres. El texto entre asteriscos aparece en color, como Character.AI muestra las acciones.</p>';
    $('cb-reader').innerHTML = `<header class="cb-chat-head">
      <button class="cb-btn cb-btn-sm cb-back" type="button" data-back>Todos los chats</button>
      <label class="sr-only" for="cb-name">Ponle nombre a este chat</label>
      <input class="cb-name" id="cb-name" value="${esc(names[id] || '')}" placeholder="${esc(s.name || titleOf(Object.assign({}, s, { id: '' })))}" maxlength="120" title="Ponle un nombre a este chat. Se guarda en este navegador y se usa en los archivos que guardes.">
      <p class="cb-chat-meta">${esc(meta)}${s.greetingOf ? `. Empieza con el saludo de ${esc(s.greetingOf)}, un personaje que creaste` : ''}</p>
      <div class="cb-save"><span>Guardar este chat:</span>
        <button class="cb-btn cb-btn-sm" type="button" data-save="html">HTML</button>
        <button class="cb-btn cb-btn-sm" type="button" data-save="txt">Texto</button>
        <button class="cb-btn cb-btn-sm" type="button" data-save="md">Markdown</button>
        <button class="cb-btn cb-btn-sm" type="button" data-save="pdf">PDF <span class="cb-pro">Pro</span></button>
      </div>${flag}
    </header>
    <div class="cb-msgs">${pager(-1)}${msgs}${pager(1)}</div>`;
    $('cb-chats').classList.add('is-reading');
    const reader = $('cb-reader');
    if (lastQ && $('cb-q').value.trim()) markIn(reader.querySelector('.cb-msgs'), lastQ);
    reader.querySelectorAll('img[data-img]').forEach(async (img) => {
      const b = await call('image', { path: img.dataset.img }).catch(() => null);
      if (b) { const u = URL.createObjectURL(b); blobUrls.push(u); img.src = u; } else img.replaceWith(Object.assign(document.createElement('p'), { className: 'cb-note', textContent: `[imagen que no está en la exportación: ${img.dataset.img}]` }));
    });
    const t = target != null ? document.getElementById(`msg-${target}`) : null;
    if (t) t.scrollIntoView({ block: 'center' }); else reader.scrollTop = 0;
    if (!window.matchMedia('(min-width: 900px)').matches) $('cb-app-wrap').scrollIntoView({ block: 'start' });
  }
  $('cb-reader').addEventListener('click', (e) => {
    const b = e.target.closest('button');
    if (!b || !current) return;
    if (b.dataset.page != null) return openChat(current.id, Number(b.dataset.page));
    if (b.hasAttribute('data-back')) { $('cb-chats').classList.remove('is-reading'); return; }
    if (b.dataset.save) return saveChat(b.dataset.save);
  });
  $('cb-reader').addEventListener('change', (e) => {
    if (e.target.id !== 'cb-name' || !current) return;
    const v = e.target.value.trim();
    if (v) names[current.id] = v; else delete names[current.id];
    saveNames();
    const item = document.querySelector(`.cb-item[data-chat="${CSS.escape(current.id)}"]:not([data-at]) b`);
    const s = OV.chats.find((x) => x.id === current.id);
    if (item && s) item.textContent = titleOf(s);
  });

  // ---------------------------------------------------------------- saving files
  function download(blob, name) {
    const u = URL.createObjectURL(blob);
    const a = Object.assign(document.createElement('a'), { href: u, download: name });
    document.body.appendChild(a); a.click(); a.remove();
    setTimeout(() => URL.revokeObjectURL(u), 60000);
  }
  const exportOpts = () => ({ names, locale: LOCALE, lang: 'es', owner: owner(), title: owner() ? `Chats de ${owner()}` : 'Archivo de chats' });
  async function saveChat(kind) {
    if (kind === 'pdf') return pdfDialog();
    const r = await call('export', { kind, id: current.id, opts: exportOpts() });
    download(r.blob, r.name);
    toast(`Guardado: ${r.name}`);
  }
  const needPro = (why) => PRO_READY && PeakLicense.requirePro(why);
  document.querySelectorAll('[data-cb-all]').forEach((b) => b.addEventListener('click', async () => {
    const kind = b.dataset.cbAll;
    if (!OV) return;
    if (kind === 'print') return pdfDialog(true);
    if (!needPro(kind === 'book' ? 'El libro sin conexión con todos los chats forma parte de Pro.' : 'El EPUB con todos los chats forma parte de Pro.')) return;
    b.disabled = true;
    const label = b.innerHTML;
    b.textContent = 'Creando…';
    try {
      const r = await call('export', { kind, opts: exportOpts() });
      download(r.blob, r.name);
      toast(`Guardado: ${r.name}`);
    } catch (e) { toast(`No funcionó: ${e.message}`); }
    b.disabled = false; b.innerHTML = label;
  }));

  function pdfDialog(all) {
    if (!needPro('Guardar chats como PDF forma parte de Pro.')) return;
    const d = $('cb-pdf-dialog');
    const total = OV.counts.messages;
    const s = current ? OV.chats.find((x) => x.id === current.id) : null;
    const cur = d.querySelector('input[value="current"]');
    cur.disabled = !s;
    $('cb-pdf-current').textContent = s ? `${titleOf(s)}, ${plural(s.count, 'mensaje', 'mensajes')}` : 'Abre un chat primero';
    $('cb-pdf-all').textContent = `${plural(OV.counts.chats, 'chat', 'chats')}, ${plural(total, 'mensaje', 'mensajes')}${total > 20000 ? '. Tantas páginas pueden tardar minutos y consumir mucha memoria; el libro en HTML es más ligero.' : ''}`;
    d.querySelector(`input[value="${all || !s ? 'all' : 'current'}"]`).checked = true;
    d.returnValue = '';
    d.showModal();
  }
  $('cb-pdf-dialog').addEventListener('close', async () => {
    const d = $('cb-pdf-dialog');
    if (d.returnValue !== 'go') return;
    const scope = d.querySelector('input[name="scope"]:checked').value;
    const ids = scope === 'current' && current ? [current.id] : null;
    const ios = /iP(hone|ad|od)/.test(navigator.userAgent) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);
    const r = await call('export', { kind: 'print', ids, opts: Object.assign(exportOpts(), ios ? { screenNote: 'Para guardarlo como PDF: toca Compartir, luego Imprimir y después Guardar en Archivos (en algunas versiones, antes separa dos dedos sobre la vista previa).' } : {}) });
    const u = URL.createObjectURL(r.blob);
    if (ios) { window.open(u, '_blank'); return; }
    const f = document.createElement('iframe');
    f.style.cssText = 'position:fixed;right:0;bottom:0;width:1px;height:1px;border:0;opacity:0';
    f.title = 'Diseño de impresión';
    f.src = u;
    f.onload = () => { try { f.contentWindow.focus(); f.contentWindow.print(); } catch (e) { window.open(u, '_blank'); } setTimeout(() => { f.remove(); URL.revokeObjectURL(u); }, 120000); };
    document.body.appendChild(f);
    toast('Abriendo la ventana de impresión…');
  });

  // ---------------------------------------------------------------- characters and the file
  function renderChars() {
    const p = $('cb-chars-pane');
    if (!OV.characters.length) { p.innerHTML = '<p class="cb-empty" style="padding:0">Esta exportación no incluye ningún personaje. El archivo de personajes solo contiene los que creó tu cuenta.</p>'; return; }
    p.innerHTML = '<p class="cb-note" style="margin:0 0 8px">Los personajes que creó tu cuenta, tal como los lista la exportación.</p>' + OV.characters.map((c, i) => {
      const rows = [['Lema', c.title], ['Descripción', c.description], ['Saludo', c.greeting], ['Definición', c.definition], ['Creado', c.created], ['Actualizado', c.updated]].concat(Object.entries(c.extra || {})).filter(([, v]) => v);
      return `<section class="cb-char"><h3>${esc(c.name)}</h3><dl>${rows.map(([k, v]) => `<dt>${esc(k)}</dt><dd>${esc(v)}</dd>`).join('')}</dl><div class="cb-row"><button class="cb-btn cb-btn-sm" type="button" data-copy="${i}">Copiar la definición</button><button class="cb-btn cb-btn-sm" type="button" data-char-save="${i}">Guardar como texto</button></div></section>`;
    }).join('');
  }
  $('cb-chars-pane').addEventListener('click', async (e) => {
    const b = e.target.closest('button');
    if (!b) return;
    const c = OV.characters[Number(b.dataset.copy != null ? b.dataset.copy : b.dataset.charSave)];
    if (!c) return;
    const sheet = [`Nombre: ${c.name}`, c.title && `Lema: ${c.title}`, c.description && `Descripción:\n${c.description}`, c.greeting && `Saludo:\n${c.greeting}`, c.definition && `Definición:\n${c.definition}`].filter(Boolean).join('\n\n');
    if (b.dataset.copy != null) {
      try { await navigator.clipboard.writeText(c.definition || sheet); toast('Definición copiada'); } catch (err) { toast('La copia está bloqueada aquí. Selecciona el texto y cópialo a mano.'); }
    } else download(new Blob([sheet + '\n'], { type: 'text/plain;charset=utf-8' }), `${(c.name || 'personaje').normalize('NFKD').replace(/[\u0300-\u036f]/g, '').replace(/[^\w-]+/g, '-').toLowerCase()}.txt`);
  });
  function renderFile() {
    const u = OV.user || {};
    const userRows = Object.entries(u).map(([k, v]) => `<tr><th scope="row">${esc(k)}</th><td>${esc(String(v))}</td></tr>`).join('');
    const src = OV.sources.map((s) => `<tr><th scope="row">${esc(s.name)}</th><td>${esc(s.kind === 'zip' ? (s.method === 'aes' ? 'ZIP protegido con cifrado AES' : s.method === 'zipcrypto' ? 'ZIP protegido con contraseña' : 'ZIP') : 'Archivo JSON')}, ${esc((s.size / 1048576).toFixed(1))} MB</td></tr>`).join('');
    const notes = OV.notes.concat((OV.ignored || []).map((x) => `${x.name}: omitido, ${x.why}.`));
    $('cb-file-pane').innerHTML = `<h3 style="margin-top:0">Cuenta</h3>${userRows ? `<table class="cb-facts">${userRows}</table>` : '<p class="cb-note">Esta exportación no incluye user.json.</p>'}
      <h3>Archivos leídos</h3><table class="cb-facts">${src}</table>
      <h3>Lo que se encontró</h3><table class="cb-facts"><tr><th scope="row">Chats</th><td>${fmtN(OV.counts.chats)}</td></tr><tr><th scope="row">Mensajes</th><td>${fmtN(OV.counts.messages)}</td></tr><tr><th scope="row">Personajes</th><td>${fmtN(OV.counts.characters)}</td></tr><tr><th scope="row">Imágenes</th><td>${fmtN(OV.counts.images)}</td></tr>${OV.counts.duplicates ? `<tr><th scope="row">Mensajes repetidos eliminados</th><td>${fmtN(OV.counts.duplicates)}</td></tr>` : ''}<tr><th scope="row">Formato</th><td>${OV.format === 'cai' ? 'Exportación de datos de Character.AI' : OV.format === 'generic' ? 'Formato distinto del habitual: leído como JSON genérico' : 'Solo personajes'}</td></tr></table>
      ${notes.length ? `<h3>Notas</h3><ul>${notes.map((n) => `<li>${esc(n)}</li>`).join('')}</ul>` : ''}`;
  }

  // ---------------------------------------------------------------- tabs
  const tabs = ['tab-chats', 'tab-chars', 'tab-move', 'tab-file'];
  function selectTab(id) {
    for (const t of tabs) {
      const on = t === id;
      $(t).setAttribute('aria-selected', String(on));
      $(t).tabIndex = on ? 0 : -1;
      $($(t).getAttribute('aria-controls')).hidden = !on;
    }
  }
  tabs.forEach((t, i) => {
    $(t).addEventListener('click', () => selectTab(t));
    $(t).addEventListener('keydown', (e) => {
      if (e.key !== 'ArrowRight' && e.key !== 'ArrowLeft') return;
      const n = tabs[(i + (e.key === 'ArrowRight' ? 1 : tabs.length - 1)) % tabs.length];
      selectTab(n); $(n).focus();
    });
  });

  // ---------------------------------------------------------------- small things
  let toastEl = null, toastTimer = null;
  function toast(text) {
    if (!toastEl) { toastEl = document.createElement('div'); toastEl.setAttribute('role', 'status'); toastEl.style.cssText = 'position:fixed;left:50%;bottom:20px;transform:translateX(-50%);background:#1c1724;color:#fff;padding:10px 16px;border-radius:8px;font:500 15px/1.4 var(--sans);z-index:50;max-width:calc(100vw - 32px);box-shadow:0 10px 30px -10px rgba(0,0,0,.4)'; document.body.appendChild(toastEl); }
    toastEl.textContent = text; toastEl.hidden = false;
    clearTimeout(toastTimer); toastTimer = setTimeout(() => { toastEl.hidden = true; }, 3200);
  }

  // when the export should arrive (help centre: 3 to 4 weeks; link valid 7 days)
  const asked = $('cb-asked');
  if (asked) {
    asked.max = new Date().toISOString().slice(0, 10);
    asked.addEventListener('change', () => {
      const t = Date.parse(asked.value + 'T12:00:00');
      if (!Number.isFinite(t)) { $('cb-asked-out').textContent = 'Elige la fecha en que pulsaste Export Data.'; return; }
      const d = (n) => DD.format(new Date(t + n * 864e5));
      $('cb-asked-out').innerHTML = `El correo debería llegar entre el <b>${esc(d(21))}</b> y el <b>${esc(d(28))}</b>. Descarga el ZIP en los 7 días siguientes al correo; pasado ese plazo, el enlace deja de funcionar y tendrías que pedir la exportación otra vez.`;
    });
  }

  // ---------------------------------------------------------------- Pro
  function proState() {
    const el = $('cb-pro-state');
    if (!el) return;
    el.textContent = !PRO_READY ? 'Pro llegará en unos días. Todo lo de arriba ya es gratis.' : pro ? 'Pro está activo en este navegador.' : 'Paga una vez en Gumroad y pega aquí la clave de licencia de tu recibo.';
  }
  function setupPro() {
    if (!window.PeakLicense) return;
    if (!PRO_READY) document.querySelectorAll('[data-buy-pro], [data-enter-key]').forEach((b) => { b.setAttribute('aria-disabled', 'true'); b.addEventListener('click', (e) => { e.preventDefault(); toast('Pro llegará en unos días.'); }, true); });
    PeakLicense.setup(LICENSE);
    pro = PRO_READY && PeakLicense.isPro();
    PeakLicense.onChange((p) => { pro = PRO_READY && p; proState(); document.body.classList.toggle('is-pro', pro); });
    proState();
  }

  // start the worker early, so its scripts are here before you open a file (and the page works offline after this)
  const warm = () => { try { startWorker(); } catch (e) { /* the first open will start it */ } };
  if ('requestIdleCallback' in window) requestIdleCallback(warm, { timeout: 1500 }); else setTimeout(warm, 300);
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', setupPro); else setupPro();
  window.Chatbound = {
    call, toast, download, esc, owner: () => (OV ? owner() : ''), names: () => names, selectTab,
    needPro: (why) => needPro(why), get pro() { return pro; }, get overview() { return OV; },
    onOpen: (fn) => hooks.open.push(fn), onClose: (fn) => hooks.close.push(fn),
  };
})();
