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
    tool: 'chatbound', localMessages: true, strings: { title: 'Ativar o Pro', buy: 'Comprar o Pro no Gumroad', keyLabel: 'Já comprou? Cole aqui a sua chave de licença', verify: 'Ativar', close: 'Fechar', checking: 'Verificando no Gumroad…', badKey: 'Isso não parece uma chave de licença. Ela vem no e-mail do recibo do Gumroad.', network: 'Não foi possível se conectar ao Gumroad para verificar a chave. Confira a sua conexão e tente de novo.', ok: 'O Pro está ativo neste navegador. Obrigado.', refunded: 'Esta compra foi reembolsada ou encerrada, então o Pro está desativado.', rejected: 'Essa chave de licença não foi aceita.', active: 'O Pro está ativo neste navegador.' },
    productId: PRO_READY ? GUMROAD.productId : 'PENDING',
    permalink: GUMROAD.permalink,
    buyUrl: GUMROAD.url,
    pitch: `O Pro guarda e leva o histórico completo: todos os personagens e conversas como cartões e arquivos de conversa para o SillyTavern e outros apps em um único ZIP, todas as conversas em um livro offline com busca, um PDF e um EPUB, e várias exportações reunidas em uma só. ${GUMROAD.price}, pagamento único.`,
  };

  const BASE = '/character-ai-export-viewer/';
  const $ = (id) => document.getElementById(id);
  const esc = (s) => String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const fmtN = (n) => Number(n || 0).toLocaleString('pt-BR');
  const plural = (n, one, many) => `${fmtN(n)} ${n === 1 ? one : many}`;
  const LOCALE = 'pt-BR';
  let DF, DD;
  try { DF = new Intl.DateTimeFormat(LOCALE, { dateStyle: 'medium', timeStyle: 'short' }); DD = new Intl.DateTimeFormat(LOCALE, { dateStyle: 'medium' }); } catch (e) { DF = new Intl.DateTimeFormat('en', { dateStyle: 'medium', timeStyle: 'short' }); DD = new Intl.DateTimeFormat('en', { dateStyle: 'medium' }); }
  const day = (t) => (Number.isFinite(t) ? DD.format(new Date(t)) : '');
  const when = (m) => (Number.isFinite(m.ts) ? DF.format(new Date(m.ts)) : m.time || '');
  function range(s) { const a = day(s.start), b = day(s.end); return !a ? '' : a === b || !b ? a : `${a} a ${b}`; }

  // ---------------------------------------------------------------- the worker
  let worker = null, seq = 0;
  const waiting = new Map();
  function startWorker() {
    if (worker) return worker;
    worker = new Worker('/pt-br/abrir-exportacao-character-ai/js/worker.js?v=2');
    worker.onmessage = (e) => {
      const m = e.data || {};
      if (m.type === 'progress') return onProgress(m);
      const w = waiting.get(m.id);
      if (!w) return;
      waiting.delete(m.id);
      if (m.ok) w.resolve(m.result); else w.reject(Object.assign(new Error(m.error.message), { code: m.error.code }));
    };
    worker.onerror = (e) => { for (const w of waiting.values()) w.reject(new Error(e.message || 'O leitor parou de funcionar.')); waiting.clear(); };
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
    $('cb-sent-label').textContent = 'requisições de rede desde que você abriu o arquivo';
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
    not_export: 'Isto não parece uma exportação do Character.AI. Abra o ZIP que veio no e-mail da exportação ou o message.json que está dentro dele.',
    truncated: 'Falta o final deste ZIP, como se o download tivesse parado antes da hora. Baixe de novo pelo e-mail enquanto o link ainda funciona (7 dias).',
    only_images: 'Estes arquivos são só imagens. Adicione também o ZIP da exportação ou o message.json dele.',
    empty: 'O arquivo abriu, mas não tem mensagens nem personagens.',
    read: 'O navegador não conseguiu ler este arquivo. Se o download ainda estiver em andamento, espere terminar e tente de novo.',
  };

  function onProgress(m) {
    if (m.phase === 'reading' && m.total) {
      const pct = Math.min(100, Math.round((m.done / m.total) * 100));
      $('cb-bar').style.width = pct + '%';
      $('cb-busy-text').textContent = `Lendo ${m.name || 'a exportação'}: ${pct}%`;
    } else if (m.phase === 'sorting') {
      $('cb-bar').style.width = '100%';
      $('cb-busy-text').textContent = 'Colocando as conversas em ordem…';
    } else if (m.phase === 'writing') {
      toast(m.name === 'epub' ? 'Gerando o EPUB…' : m.name === 'zip' ? `Gerando o ZIP: ${fmtN(m.done)} de ${fmtN(m.total)} conversas…` : 'Gerando o livro…');
    }
  }

  async function openItems() {
    armCounter();
    show('cb-busy');
    $('cb-bar').style.width = '0';
    $('cb-busy-text').textContent = 'Lendo o arquivo…';
    let r;
    try {
      r = await call('open', { items, passwords, allowMerge });
    } catch (e) {
      return fail(e.code && ERRORS[e.code] ? ERRORS[e.code] : `Não foi possível abrir o arquivo: ${e.message}`);
    }
    if (r.status === 'password') {
      passFor = r.index;
      show('cb-pass');
      const many = items.length > 1;
      $('cb-email-label').textContent = many ? `E-mail da conta que gerou ${r.name}` : 'E-mail da sua conta do Character.AI';
      $('cb-pass-err').hidden = !r.wrong;
      const input = $('cb-email');
      input.value = passwords[r.index] || '';
      input.focus();
      return;
    }
    if (r.status === 'merge') {
      show('cb-merge');
      $('cb-merge-text').textContent = `Você adicionou ${r.units} exportações (${r.names.join(', ')}). Ler todas juntas, como um único arquivo e sem as mensagens repetidas, faz parte do Pro. Você também pode abrir só a primeira agora.`;
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
      if (!(PRO_READY && PeakLicense.requirePro('Adicionar uma segunda exportação à que está aberta, sem as mensagens repetidas, faz parte do Pro.'))) return;
      take(list, true);
    } else take(list, false);
  });
  $('cb-sample').addEventListener('click', async () => {
    show('cb-busy');
    $('cb-busy-text').textContent = 'Preparando a exportação de exemplo…';
    try {
      const f = await call('sample', {});
      items = [{ file: f, path: f.name }]; passwords = {}; allowMerge = false;
      openItems();
    } catch (e) { fail(`Não foi possível preparar o exemplo: ${e.message}`); }
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
    if (!(PRO_READY && PeakLicense.requirePro('Reunir várias exportações em um único arquivo faz parte do Pro.'))) return;
    allowMerge = true;
    openItems();
  });
  $('cb-add').addEventListener('click', () => {
    if (!(PRO_READY && PeakLicense.requirePro('Adicionar outra exportação a esta, sem as mensagens repetidas, faz parte do Pro.'))) return;
    fileInput.dataset.add = '1';
    fileInput.click();
  });

  // ---------------------------------------------------------------- the open archive
  let OV = null;           // overview from the worker
  let current = null;      // { id, total, from }
  let names = {};
  try { names = JSON.parse(localStorage.getItem('chatbound:names') || '{}') || {}; } catch (e) { names = {}; }
  const saveNames = () => { try { localStorage.setItem('chatbound:names', JSON.stringify(names)); } catch (e) { /* private mode */ } };
  const titleOf = (s) => names[s.id] || s.name || (Number.isFinite(s.start) ? `Conversa de ${DD.format(new Date(s.start))}` : 'Conversa');
  const owner = () => (OV.user && OV.user.first_name) || OV.usernames[0] || '';

  function ready(r) {
    OV = r;
    show('cb-idle');
    $('cb-app-wrap').hidden = false;
    $('cb-owner').textContent = owner() ? `Exportação de ${owner()}` : 'Sua exportação';
    const c = r.counts;
    $('cb-summary').textContent = [plural(c.chats, 'conversa', 'conversas'), plural(c.messages, 'mensagem', 'mensagens'), c.characters ? plural(c.characters, 'personagem', 'personagens') : '', c.duplicates ? `${fmtN(c.duplicates)} mensagens repetidas removidas` : ''].filter(Boolean).join(', ');
    $('tab-chars').textContent = `Personagens (${fmtN(c.characters)})`;
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
    const meta = [plural(s.count, 'mensagem', 'mensagens'), range(s)].filter(Boolean).join(', ');
    return `<li><button type="button" class="cb-item" data-chat="${esc(s.id)}"${current && current.id === s.id ? ' aria-current="true"' : ''}><b>${esc(titleOf(s))}</b><small>${esc(meta)}${s.greetingOf ? `. Abre com a saudação de ${esc(s.greetingOf)}` : ''}</small><span>${esc(s.snippet)}</span></button></li>`;
  }
  function renderList(more) {
    const list = $('cb-list');
    const chats = OV.chats;
    const end = Math.min(chats.length, (more ? listShown : 0) + 200);
    const html = chats.slice(more ? listShown : 0, end).map(itemHtml).join('');
    if (more) { list.querySelector('.cb-more-li') && list.querySelector('.cb-more-li').remove(); list.insertAdjacentHTML('beforeend', html); } else list.innerHTML = html;
    listShown = end;
    if (end < chats.length) list.insertAdjacentHTML('beforeend', `<li class="cb-more-li"><button type="button" class="cb-item" data-more-chats><b>Mostrar mais conversas</b><small>mais ${fmtN(chats.length - end)}</small></button></li>`);
    $('cb-count').textContent = chats.length ? `${plural(chats.length, 'conversa', 'conversas')}, das mais recentes às mais antigas` : 'Nenhuma conversa nesta exportação';
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
    $('cb-count').textContent = r.total ? `${plural(r.total, 'mensagem encontrada', 'mensagens encontradas')}${r.total > r.hits.length ? `, mostrando as ${fmtN(r.hits.length)} primeiras` : ''}` : 'Nenhuma mensagem encontrada';
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
    $('cb-reader').innerHTML = '<div class="cb-empty"><p>Escolha uma conversa na lista à esquerda. As conversas aparecem da mais recente para a mais antiga.</p></div>';
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
    const meta = [plural(s.count, 'mensagem', 'mensagens'), range(s)].filter(Boolean).join(', ');
    const pager = (dir) => {
      if (dir < 0 && page.from > 0) return `<div class="cb-pager"><button class="cb-btn cb-btn-sm" type="button" data-page="${Math.max(0, page.from - PAGE)}">Mostrar as ${fmtN(Math.min(PAGE, page.from))} mensagens anteriores</button></div>`;
      const next = page.from + page.msgs.length;
      if (dir > 0 && next < page.total) return `<div class="cb-pager"><button class="cb-btn cb-btn-sm" type="button" data-page="${next}">Mostrar as próximas ${fmtN(Math.min(PAGE, page.total - next))} de ${fmtN(page.total - next)} restantes</button></div>`;
      return '';
    };
    const msgs = page.msgs.map((m) => `<article class="cb-msg${target === m.i ? ' is-target' : ''}" id="msg-${m.i}"><time>${esc(when(m))}${m.who ? `<span class="who">${esc(m.who)}</span>` : ''}</time><div class="cb-text">${m.text ? textHtml(m.text) : ''}${m.img ? `<img alt="Imagem da conversa" data-img="${esc(m.img)}">` : ''}</div></article>`).join('');
    const flag = OV.speakers ? '' : '<p class="cb-flag">A exportação não registra quem enviou cada mensagem, por isso elas aparecem em ordem cronológica, sem nomes. O texto entre asteriscos aparece colorido, como o Character.AI mostra as ações.</p>';
    $('cb-reader').innerHTML = `<header class="cb-chat-head">
      <button class="cb-btn cb-btn-sm cb-back" type="button" data-back>Todas as conversas</button>
      <label class="sr-only" for="cb-name">Dar um nome a esta conversa</label>
      <input class="cb-name" id="cb-name" value="${esc(names[id] || '')}" placeholder="${esc(s.name || titleOf(Object.assign({}, s, { id: '' })))}" maxlength="120" title="Dê um nome a esta conversa. O nome fica salvo neste navegador e vai para os arquivos que você salvar.">
      <p class="cb-chat-meta">${esc(meta)}${s.greetingOf ? `. Abre com a saudação de ${esc(s.greetingOf)}, um personagem que você criou` : ''}</p>
      <div class="cb-save"><span>Salvar esta conversa:</span>
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
      if (b) { const u = URL.createObjectURL(b); blobUrls.push(u); img.src = u; } else img.replaceWith(Object.assign(document.createElement('p'), { className: 'cb-note', textContent: `[imagem que não está na exportação: ${img.dataset.img}]` }));
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
  const exportOpts = () => ({ names, locale: LOCALE, lang: 'pt-BR', owner: owner(), title: owner() ? `Conversas de ${owner()}` : 'Arquivo de conversas' });
  async function saveChat(kind) {
    if (kind === 'pdf') return pdfDialog();
    const r = await call('export', { kind, id: current.id, opts: exportOpts() });
    download(r.blob, r.name);
    toast(`Salvo: ${r.name}`);
  }
  const needPro = (why) => PRO_READY && PeakLicense.requirePro(why);
  document.querySelectorAll('[data-cb-all]').forEach((b) => b.addEventListener('click', async () => {
    const kind = b.dataset.cbAll;
    if (!OV) return;
    if (kind === 'print') return pdfDialog(true);
    if (!needPro(kind === 'book' ? 'O livro offline com todas as conversas faz parte do Pro.' : 'O EPUB com todas as conversas faz parte do Pro.')) return;
    b.disabled = true;
    const label = b.innerHTML;
    b.textContent = 'Gerando…';
    try {
      const r = await call('export', { kind, opts: exportOpts() });
      download(r.blob, r.name);
      toast(`Salvo: ${r.name}`);
    } catch (e) { toast(`Não deu certo: ${e.message}`); }
    b.disabled = false; b.innerHTML = label;
  }));

  function pdfDialog(all) {
    if (!needPro('Salvar conversas em PDF faz parte do Pro.')) return;
    const d = $('cb-pdf-dialog');
    const total = OV.counts.messages;
    const s = current ? OV.chats.find((x) => x.id === current.id) : null;
    const cur = d.querySelector('input[value="current"]');
    cur.disabled = !s;
    $('cb-pdf-current').textContent = s ? `${titleOf(s)}, ${plural(s.count, 'mensagem', 'mensagens')}` : 'Abra uma conversa primeiro';
    $('cb-pdf-all').textContent = `${plural(OV.counts.chats, 'conversa', 'conversas')}, ${plural(total, 'mensagem', 'mensagens')}${total > 20000 ? '. Tantas páginas podem levar minutos e muita memória; o livro em HTML é mais leve.' : ''}`;
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
    const r = await call('export', { kind: 'print', ids, opts: Object.assign(exportOpts(), ios ? { screenNote: 'Para salvar em PDF: toque em Compartilhar, depois em Imprimir e em Salvar em Arquivos (em algumas versões, primeiro afaste dois dedos sobre a pré-visualização).' } : {}) });
    const u = URL.createObjectURL(r.blob);
    if (ios) { window.open(u, '_blank'); return; }
    const f = document.createElement('iframe');
    f.style.cssText = 'position:fixed;right:0;bottom:0;width:1px;height:1px;border:0;opacity:0';
    f.title = 'Layout de impressão';
    f.src = u;
    f.onload = () => { try { f.contentWindow.focus(); f.contentWindow.print(); } catch (e) { window.open(u, '_blank'); } setTimeout(() => { f.remove(); URL.revokeObjectURL(u); }, 120000); };
    document.body.appendChild(f);
    toast('Abrindo a janela de impressão…');
  });

  // ---------------------------------------------------------------- characters and the file
  function renderChars() {
    const p = $('cb-chars-pane');
    if (!OV.characters.length) { p.innerHTML = '<p class="cb-empty" style="padding:0">Esta exportação não lista nenhum personagem. O arquivo de personagens só contém os que a sua conta criou.</p>'; return; }
    p.innerHTML = '<p class="cb-note" style="margin:0 0 8px">Os personagens que a sua conta criou, como a exportação os lista.</p>' + OV.characters.map((c, i) => {
      const rows = [['Slogan', c.title], ['Descrição', c.description], ['Saudação', c.greeting], ['Definição', c.definition], ['Criado em', c.created], ['Atualizado em', c.updated]].concat(Object.entries(c.extra || {})).filter(([, v]) => v);
      return `<section class="cb-char"><h3>${esc(c.name)}</h3><dl>${rows.map(([k, v]) => `<dt>${esc(k)}</dt><dd>${esc(v)}</dd>`).join('')}</dl><div class="cb-row"><button class="cb-btn cb-btn-sm" type="button" data-copy="${i}">Copiar a definição</button><button class="cb-btn cb-btn-sm" type="button" data-char-save="${i}">Salvar como texto</button></div></section>`;
    }).join('');
  }
  $('cb-chars-pane').addEventListener('click', async (e) => {
    const b = e.target.closest('button');
    if (!b) return;
    const c = OV.characters[Number(b.dataset.copy != null ? b.dataset.copy : b.dataset.charSave)];
    if (!c) return;
    const sheet = [`Nome: ${c.name}`, c.title && `Slogan: ${c.title}`, c.description && `Descrição:\n${c.description}`, c.greeting && `Saudação:\n${c.greeting}`, c.definition && `Definição:\n${c.definition}`].filter(Boolean).join('\n\n');
    if (b.dataset.copy != null) {
      try { await navigator.clipboard.writeText(c.definition || sheet); toast('Definição copiada'); } catch (err) { toast('A cópia está bloqueada aqui. Selecione o texto e copie manualmente.'); }
    } else download(new Blob([sheet + '\n'], { type: 'text/plain;charset=utf-8' }), `${(c.name || 'personagem').normalize('NFKD').replace(/[\u0300-\u036f]/g, '').replace(/[^\w-]+/g, '-').toLowerCase()}.txt`);
  });
  function renderFile() {
    const u = OV.user || {};
    const userRows = Object.entries(u).map(([k, v]) => `<tr><th scope="row">${esc(k)}</th><td>${esc(String(v))}</td></tr>`).join('');
    const src = OV.sources.map((s) => `<tr><th scope="row">${esc(s.name)}</th><td>${esc(s.kind === 'zip' ? (s.method === 'aes' ? 'ZIP protegido com criptografia AES' : s.method === 'zipcrypto' ? 'ZIP protegido por senha' : 'ZIP') : 'Arquivo JSON')}, ${esc((s.size / 1048576).toFixed(1))} MB</td></tr>`).join('');
    const notes = OV.notes.concat((OV.ignored || []).map((x) => `${x.name}: ignorado, ${x.why}.`));
    $('cb-file-pane').innerHTML = `<h3 style="margin-top:0">Conta</h3>${userRows ? `<table class="cb-facts">${userRows}</table>` : '<p class="cb-note">Esta exportação não tem user.json.</p>'}
      <h3>Arquivos lidos</h3><table class="cb-facts">${src}</table>
      <h3>O que foi encontrado</h3><table class="cb-facts"><tr><th scope="row">Conversas</th><td>${fmtN(OV.counts.chats)}</td></tr><tr><th scope="row">Mensagens</th><td>${fmtN(OV.counts.messages)}</td></tr><tr><th scope="row">Personagens</th><td>${fmtN(OV.counts.characters)}</td></tr><tr><th scope="row">Imagens</th><td>${fmtN(OV.counts.images)}</td></tr>${OV.counts.duplicates ? `<tr><th scope="row">Mensagens repetidas removidas</th><td>${fmtN(OV.counts.duplicates)}</td></tr>` : ''}<tr><th scope="row">Formato</th><td>${OV.format === 'cai' ? 'Exportação de dados do Character.AI' : OV.format === 'generic' ? 'Formato diferente do habitual: lido como JSON genérico' : 'Somente personagens'}</td></tr></table>
      ${notes.length ? `<h3>Observações</h3><ul>${notes.map((n) => `<li>${esc(n)}</li>`).join('')}</ul>` : ''}`;
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
      if (!Number.isFinite(t)) { $('cb-asked-out').textContent = 'Escolha a data em que você tocou em Export Data.'; return; }
      const d = (n) => DD.format(new Date(t + n * 864e5));
      $('cb-asked-out').innerHTML = `O e-mail deve chegar entre <b>${esc(d(21))}</b> e <b>${esc(d(28))}</b>. Baixe o ZIP em até 7 dias depois do e-mail; passado esse prazo, o link deixa de funcionar e você precisa pedir de novo.`;
    });
  }

  // ---------------------------------------------------------------- Pro
  function proState() {
    const el = $('cb-pro-state');
    if (!el) return;
    el.textContent = !PRO_READY ? 'O Pro chega em poucos dias. Tudo o que está acima dele já é gratuito.' : pro ? 'O Pro está ativo neste navegador.' : 'Pague uma vez no Gumroad e cole aqui a chave de licença que está no recibo.';
  }
  function setupPro() {
    if (!window.PeakLicense) return;
    if (!PRO_READY) document.querySelectorAll('[data-buy-pro], [data-enter-key]').forEach((b) => { b.setAttribute('aria-disabled', 'true'); b.addEventListener('click', (e) => { e.preventDefault(); toast('O Pro chega em poucos dias.'); }, true); });
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
