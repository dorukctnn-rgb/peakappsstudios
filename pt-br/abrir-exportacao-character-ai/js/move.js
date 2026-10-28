/* Chatbound: the "Move to another app" tab. Turns the open export into Character Card V2 files (PNG and JSON) and
 * SillyTavern chat files (JSONL), on this device. The cards are drawn and filled here (js/migrate.js); the chat files
 * and the ZIP are written by the worker. Nothing is sent anywhere.
 * Free: one character (its card and its chats). Pro: every character and chat in one ZIP. */
(function () {
  'use strict';
  const CB = window.Chatbound, M = window.CaiMove;
  if (!CB || !M) return;
  const $ = (id) => document.getElementById(id);
  const esc = CB.esc;
  const fmtN = (n) => Number(n || 0).toLocaleString('pt-BR');
  const plural = (n, one, many) => `${fmtN(n)} ${n === 1 ? one : many}`;
  let DD;
  try { DD = new Intl.DateTimeFormat('pt-BR', { dateStyle: 'medium' }); } catch (e) { DD = new Intl.DateTimeFormat('en', { dateStyle: 'medium' }); }
  const day = (t) => (Number.isFinite(t) ? DD.format(new Date(t)) : '');
  const short = (t, n) => { const s = String(t || '').replace(/\s+/g, ' ').trim(); return s.length > n ? s.slice(0, n - 1).replace(/\s+\S*$/, '') + '…' : s; };

  const store = {
    get(k, d) { try { const v = localStorage.getItem(k); return v ? JSON.parse(v) : d; } catch (e) { return d; } },
    set(k, v) { try { localStorage.setItem(k, JSON.stringify(v)); } catch (e) { /* private mode: kept for this visit only */ } },
  };
  let charNames = store.get('chatbound:characters', {}) || {};
  let free = store.get('chatbound:free-character', null);

  let IDX = null;            // { people: [...] } from the worker
  let person = null;         // the character shown on the right
  let chatId = null;         // its chat shown in the preview
  let shown = 40;            // messages in the preview
  const layouts = new Map(); // chat id -> { mode, flips }
  const texts = new Map();   // chat id -> first messages, for the card's first message
  const descs = new Map();   // person key -> description the reader wrote
  const pictures = new Map(); // person key -> { png: Uint8Array, url }
  let plainUrl = null;
  let userName = '';

  const layoutOf = (id) => layouts.get(id) || { mode: 'char', flips: [] };
  const nameOf = (p) => (p.kind === 'own' ? (charNames[p.key] || p.name) : (charNames[p.key] || p.name || '')).trim();
  const label = (p) => nameOf(p) || 'Personagem sem nome';

  // ---------------------------------------------------------------- open and close
  CB.onOpen(async () => {
    reset();
    const ov = CB.overview;
    userName = (ov.user && ov.user.first_name) || '';
    try { IDX = await CB.call('moveIndex', {}); } catch (e) { IDX = { people: [] }; }
    $('tab-move').textContent = `Levar para outro app (${fmtN(IDX.people.length)})`;
    renderList();
    if (IDX.people.length) pick(IDX.people[0].key, false); else $('cb-mv-detail').innerHTML = '<p class="cb-empty" style="padding:0">Não há personagens nem conversas neste arquivo para levar.</p>';
  });
  CB.onClose(reset);
  function reset() {
    IDX = null; person = null; chatId = null;
    layouts.clear(); texts.clear(); descs.clear();
    for (const p of pictures.values()) URL.revokeObjectURL(p.url);
    pictures.clear();
    if (plainUrl) { URL.revokeObjectURL(plainUrl); plainUrl = null; }
    if ($('cb-move')) $('cb-move').classList.remove('is-reading');
    if ($('cb-mv-list')) $('cb-mv-list').innerHTML = '';
    if ($('cb-mv-detail')) $('cb-mv-detail').innerHTML = '';
  }

  // ---------------------------------------------------------------- the list
  function renderList() {
    const list = $('cb-mv-list');
    list.innerHTML = IDX.people.map((p) => {
      const meta = [p.chats.length ? plural(p.chats.length, 'conversa', 'conversas') : 'sem conversas', p.messages ? plural(p.messages, 'mensagem', 'mensagens') : ''].filter(Boolean).join(', ');
      return `<li><button type="button" class="cb-item" data-person="${esc(p.key)}"${person && person.key === p.key ? ' aria-current="true"' : ''}><b>${esc(label(p))}</b><small>${esc(meta)}. ${p.kind === 'own' ? 'Criado por você' : 'Conhecido pelas suas conversas'}</small><span>${esc(short(p.first, 110))}</span></button></li>`;
    }).join('');
    $('cb-mv-count').textContent = `${plural(IDX.people.filter((p) => p.kind === 'own').length, 'personagem', 'personagens')} que você criou, ${plural(IDX.people.filter((p) => p.kind === 'chat').length, 'outro', 'outros')} das suas conversas`;
  }
  $('cb-mv-list').addEventListener('click', (e) => {
    const b = e.target.closest('[data-person]');
    if (b) pick(b.dataset.person, true);
  });

  // ---------------------------------------------------------------- one character
  async function pick(key, focus) {
    person = IDX.people.find((p) => p.key === key) || null;
    if (!person) return;
    document.querySelectorAll('#cb-mv-list .cb-item[aria-current]').forEach((b) => b.removeAttribute('aria-current'));
    const btn = document.querySelector(`#cb-mv-list [data-person="${CSS.escape(key)}"]`);
    if (btn) btn.setAttribute('aria-current', 'true');
    chatId = person.chats.length ? person.chats[0].id : null;
    shown = 40;
    renderDetail();
    if (focus) {
      $('cb-move').classList.add('is-reading');
      if (!window.matchMedia('(min-width: 900px)').matches) $('cb-app-wrap').scrollIntoView({ block: 'start' });
    }
    await Promise.all([drawCardPicture(), chatId ? loadPreview() : null]);
    renderFields();
  }

  function renderDetail() {
    const p = person;
    const own = p.kind === 'own';
    const ch = own ? CB.overview.characters[p.char] : null;
    $('cb-mv-detail').innerHTML = `
      <button class="cb-btn cb-btn-sm cb-back" type="button" data-mv-back>Todos os personagens</button>
      <div class="cb-mv-head">
        <label for="cb-mv-name">Nome do personagem</label>
        <input class="cb-input cb-mv-name" id="cb-mv-name" value="${esc(nameOf(p))}" placeholder="${own ? '' : 'O nome pelo qual você conhecia este personagem'}" maxlength="80" autocomplete="off" spellcheck="false">
        <p class="cb-note">${own ? 'Um personagem criado pela sua conta. O cartão leva a definição do character.json, campo por campo.' : 'Conhecido só pelas suas conversas: a exportação não diz com qual personagem era cada conversa, então digite o nome. Ele fica salvo neste navegador.'}</p>
      </div>
      <div class="cb-mv-card">
        <figure class="cb-mv-pic">
          <img id="cb-mv-img" alt="" width="160" height="240">
          <figcaption id="cb-mv-pic-note"></figcaption>
          <div class="cb-row"><button class="cb-btn cb-btn-sm" type="button" data-mv="pic">Usar minha própria imagem</button><button class="cb-btn cb-btn-sm" type="button" data-mv="pic-reset" hidden>Imagem simples</button></div>
        </figure>
        <div class="cb-mv-fields-wrap">
          <h3>No cartão</h3>
          <table class="cb-facts cb-mv-fields" id="cb-mv-fields"></table>
          ${own ? '' : `<label class="cb-mv-label" for="cb-mv-desc">Descrição (opcional)</label>
          <textarea class="cb-input cb-mv-desc" id="cb-mv-desc" rows="4" maxlength="20000" placeholder="Quem é o personagem e como ele fala, com as suas palavras.">${esc(descs.get(p.key) || '')}</textarea>
          <p class="cb-note">A exportação não traz descrição dos personagens feitos por outras pessoas. O que você escrever aqui vai para o cartão exatamente como está. O Janitor AI não salva um personagem sem ela (no campo Personality), então você também pode preencher lá.</p>`}
          <div class="cb-row cb-mv-get"><button class="cb-btn cb-btn-cloth" type="button" data-mv="png">Salvar o cartão (PNG)</button><button class="cb-btn" type="button" data-mv="json">Cartão em JSON</button></div>
        </div>
      </div>
      ${p.chats.length ? `<section class="cb-mv-chat" aria-labelledby="cb-mv-chat-h">
        <h3 id="cb-mv-chat-h">${p.chats.length === 1 ? 'A conversa' : `Conversas (${fmtN(p.chats.length)})`}</h3>
        ${p.chats.length > 1 ? `<label class="cb-mv-label" for="cb-mv-chat-pick">Conversa a salvar</label><select class="cb-input" id="cb-mv-chat-pick">${p.chats.map((c) => `<option value="${esc(c.id)}">${esc(chatLabel(c))}</option>`).join('')}</select>` : `<p class="cb-chat-meta">${esc(chatLabel(p.chats[0]))}</p>`}
        <fieldset class="cb-mv-layout" id="cb-mv-layout">
          <legend>Quem escreveu cada mensagem</legend>
          <p class="cb-note">A exportação não registra isso. Uma conversa do Character.AI começa com a saudação do personagem e depois alterna os turnos, então esse é o ponto de partida. Confira a pré-visualização: onde a ordem sair do compasso, use o botão “Trocar a partir daqui” na primeira mensagem errada.</p>
          <label class="cb-choice"><input type="radio" name="cb-mv-mode" value="char"><span>Turnos alternados, começando pelo personagem</span></label>
          <label class="cb-choice"><input type="radio" name="cb-mv-mode" value="user"><span>Turnos alternados, começando por você</span></label>
          <label class="cb-choice"><input type="radio" name="cb-mv-mode" value="none"><span>Todas as mensagens sob o nome do personagem</span></label>
        </fieldset>
        <label class="cb-mv-label" for="cb-mv-you">Seu nome na conversa</label>
        <input class="cb-input cb-mv-you" id="cb-mv-you" value="${esc(userName)}" placeholder="Você" maxlength="60" autocomplete="off">
        <ol class="cb-mv-preview" id="cb-mv-preview" aria-live="polite"></ol>
        <div class="cb-row cb-mv-get"><button class="cb-btn cb-btn-cloth" type="button" data-mv="jsonl">Salvar esta conversa (JSONL)</button></div>
      </section>` : `<p class="cb-note">Nenhuma conversa desta exportação abre com a saudação deste personagem, então só há o cartão.</p>`}
      <p class="cb-mv-free" id="cb-mv-free"></p>`;
    if (p.chats.length) setModeRadios();
    renderFree();
  }
  function chatLabel(c) {
    const t = (CB.names()[c.id] || c.name || '').trim();
    const range = day(c.start) && day(c.end) && day(c.start) !== day(c.end) ? `${day(c.start)} a ${day(c.end)}` : day(c.start);
    return [t, plural(c.count, 'mensagem', 'mensagens'), range].filter(Boolean).join(', ');
  }
  function setModeRadios() {
    const l = layoutOf(chatId);
    document.querySelectorAll('input[name="cb-mv-mode"]').forEach((r) => { r.checked = r.value === l.mode; });
  }
  function renderFree() {
    const el = $('cb-mv-free');
    if (!el) return;
    if (CB.pro) { el.textContent = 'O Pro está ativo: converta qualquer personagem ou, abaixo, todos os personagens e conversas de uma vez.'; return; }
    if (!free) { el.textContent = 'Grátis: um personagem, com o cartão e as conversas dele. Converter todos de uma vez faz parte do Pro.'; return; }
    el.textContent = free.key === person.key ? 'Este é o seu personagem gratuito: o cartão e todas as conversas dele são grátis.' : `Seu personagem gratuito é ${free.name || 'outro'}. Converter este também faz parte do Pro.`;
  }

  // the fields that go on the card, as the export has them
  function cardFor(p, firstMes) {
    const name = nameOf(p);
    if (p.kind === 'own') return M.cardFromCharacter(CB.overview.characters[p.char], { name });
    return M.cardFromChat({ name, description: descs.get(p.key) || '', first_mes: firstMes });
  }
  function firstMesOf(p) {
    if (p.kind === 'own' || !p.chats.length) return p.first;
    const id = p.chats[0].id;
    const t = texts.get(id);
    return t ? M.firstCharMessage(t, layoutOf(id)) : p.first;
  }
  function renderFields() {
    if (!person || !$('cb-mv-fields')) return;
    const c = cardFor(person, firstMesOf(person)).data;
    const none = '<span class="cb-mv-none">Não está na sua exportação</span>';
    const cell = (v, n = 260) => (v && v.trim() ? esc(short(v, n)) : none);
    const own = person.kind === 'own';
    const rows = [
      ['Nome', c.name ? esc(c.name) : '<span class="cb-mv-none">Digite um nome acima</span>'],
      ['Descrição', own ? cell(c.description) : c.description.trim() ? esc(short(c.description, 260)) : '<span class="cb-mv-none">Não está na sua exportação (escreva uma abaixo, se quiser)</span>'],
      ['Primeira mensagem', c.first_mes.trim() ? esc(short(c.first_mes, 260)) + (own ? '' : '<br><small class="cb-mv-src">A primeira mensagem que o personagem envia na conversa</small>') : none],
      ['Mensagens de exemplo', own ? cell(c.mes_example) + (c.mes_example.trim() ? '<br><small class="cb-mv-src">Vem da definição do Character.AI</small>' : '') : none],
      ['Notas do criador', own ? cell(c.creator_notes) + (c.creator_notes.trim() ? '<br><small class="cb-mv-src">O slogan</small>' : '') : none],
      ['Personalidade, cenário', '<span class="cb-mv-none">Vazio: o Character.AI não tem esses campos</span>'],
    ];
    $('cb-mv-fields').innerHTML = rows.map(([k, v]) => `<tr><th scope="row">${esc(k)}</th><td>${v}</td></tr>`).join('');
  }

  // ---------------------------------------------------------------- the card picture
  async function plainPng(name) {
    const W = 512, H = 768;
    const cv = document.createElement('canvas');
    cv.width = W; cv.height = H;
    const g = cv.getContext('2d');
    try { await Promise.all([document.fonts.load('700 200px Kalnia'), document.fonts.load('600 36px Commissioner')]); } catch (e) { /* the fallback faces draw it */ }
    g.fillStyle = '#7b1830'; g.fillRect(0, 0, W, H);
    g.fillStyle = '#5e0f24'; g.fillRect(0, 0, 44, H);
    g.fillStyle = '#f2c14e'; g.fillRect(44, 0, 4, H);
    g.strokeStyle = 'rgba(242,193,78,.75)'; g.lineWidth = 2; g.strokeRect(76, 30, W - 106, H - 60);
    const initial = [...(name || '?').trim()][0] || '?';
    g.fillStyle = '#f2c14e'; g.textAlign = 'center'; g.textBaseline = 'alphabetic';
    g.font = '700 250px Kalnia, Georgia, serif';
    g.fillText(initial.toUpperCase(), (W + 48) / 2, 380);
    g.fillStyle = '#ffffff';
    let size = 40;
    const words = String(name || '').trim().split(/\s+/);
    let lines;
    for (;;) {
      g.font = `600 ${size}px Commissioner, Arial, sans-serif`;
      lines = [];
      let line = '';
      for (const w of words) { const t = line ? line + ' ' + w : w; if (g.measureText(t).width > W - 150 && line) { lines.push(line); line = w; } else line = t; }
      if (line) lines.push(line);
      if ((lines.length <= 3 && lines.every((l) => g.measureText(l).width <= W - 150)) || size <= 22) break;
      size -= 2;
    }
    lines.slice(0, 3).forEach((l, i) => g.fillText(l, (W + 48) / 2, 520 + i * size * 1.25));
    g.fillStyle = '#f2c14e'; g.fillRect((W + 48) / 2 - 40, 470, 80, 3);
    const blob = await new Promise((res) => cv.toBlob(res, 'image/png'));
    return new Uint8Array(await blob.arrayBuffer());
  }
  async function pictureFor(p) {
    const own = pictures.get(p.key);
    if (own) return own.png;
    return plainPng(nameOf(p) || 'Personagem sem nome');
  }
  async function drawCardPicture() {
    if (!person || !$('cb-mv-img')) return;
    const p = person;
    const mine = pictures.get(p.key);
    if (plainUrl) { URL.revokeObjectURL(plainUrl); plainUrl = null; }
    let url = mine && mine.url;
    if (!url) { plainUrl = URL.createObjectURL(new Blob([await plainPng(nameOf(p) || 'Personagem sem nome')], { type: 'image/png' })); url = plainUrl; }
    if (person !== p) return;
    $('cb-mv-img').src = url;
    $('cb-mv-img').alt = `Imagem do cartão de ${label(p)}`;
    $('cb-mv-pic-note').textContent = mine ? 'Sua imagem. O cartão vai dentro dela.' : 'A exportação não tem imagens dos personagens, então o cartão usa uma imagem simples com a inicial. Você pode usar a sua.';
    document.querySelector('[data-mv="pic-reset"]').hidden = !mine;
  }
  const picInput = Object.assign(document.createElement('input'), { type: 'file', accept: 'image/png,image/jpeg,image/webp,image/gif', hidden: true });
  document.body.appendChild(picInput);
  picInput.addEventListener('change', async () => {
    const f = picInput.files && picInput.files[0];
    picInput.value = '';
    if (!f || !person) return;
    try {
      const png = await toPng(f);
      const old = pictures.get(person.key);
      if (old) URL.revokeObjectURL(old.url);
      pictures.set(person.key, { png, url: URL.createObjectURL(new Blob([png], { type: 'image/png' })) });
      drawCardPicture();
    } catch (e) { CB.toast('Não foi possível ler essa imagem. Tente um PNG ou JPEG.'); }
  });
  // any picture as a PNG, at most 1024 px on the long side (Janitor AI takes images up to 10 MB)
  async function toPng(file) {
    const url = URL.createObjectURL(file);
    try {
      const img = await new Promise((res, rej) => { const i = new Image(); i.onload = () => res(i); i.onerror = rej; i.src = url; });
      const k = Math.min(1, 1024 / Math.max(img.naturalWidth, img.naturalHeight));
      const cv = document.createElement('canvas');
      cv.width = Math.max(1, Math.round(img.naturalWidth * k)); cv.height = Math.max(1, Math.round(img.naturalHeight * k));
      cv.getContext('2d').drawImage(img, 0, 0, cv.width, cv.height);
      const blob = await new Promise((res) => cv.toBlob(res, 'image/png'));
      return new Uint8Array(await blob.arrayBuffer());
    } finally { URL.revokeObjectURL(url); }
  }

  // ---------------------------------------------------------------- the chat preview
  async function loadPreview() {
    const id = chatId;
    const page = await CB.call('chatPage', { id, from: 0, count: shown });
    if (id !== chatId || !$('cb-mv-preview')) return;
    texts.set(id, page.msgs.slice(0, 40).map((m) => m.text));
    const who = M.speakers(page.msgs.length, layoutOf(id));
    const you = ($('cb-mv-you') && $('cb-mv-you').value.trim()) || 'Você';
    const them = nameOf(person) || 'Personagem';
    $('cb-mv-preview').innerHTML = page.msgs.map((m, i) => `<li class="${who[i] === 'user' ? 'is-user' : 'is-char'}"><span class="who">${esc(who[i] === 'user' ? you : them)}</span><p>${esc(short(m.text || (m.img ? '[imagem]' : ''), 280))}</p>${layoutOf(id).mode === 'none' ? '' : `<button type="button" class="cb-link" data-flip="${m.i}">Trocar a partir daqui</button>`}</li>`).join('')
      + (page.total > page.msgs.length ? `<li class="cb-mv-more"><button type="button" class="cb-btn cb-btn-sm" data-mv-more>Mostrar mais ${fmtN(Math.min(40, page.total - page.msgs.length))} de ${fmtN(page.total - page.msgs.length)}</button></li>` : '');
  }

  // ---------------------------------------------------------------- events in the panel
  const detail = $('cb-mv-detail');
  detail.addEventListener('input', (e) => {
    if (e.target.id === 'cb-mv-name') {
      const v = e.target.value.trim();
      if (v && v !== person.name) charNames[person.key] = v; else delete charNames[person.key];
      store.set('chatbound:characters', charNames);
      const b = document.querySelector(`#cb-mv-list [data-person="${CSS.escape(person.key)}"] b`);
      if (b) b.textContent = label(person);
      renderFields();
      clearTimeout(detail._t); detail._t = setTimeout(() => { drawCardPicture(); if (chatId) loadPreview(); }, 350);
    } else if (e.target.id === 'cb-mv-desc') {
      descs.set(person.key, e.target.value);
      renderFields();
    } else if (e.target.id === 'cb-mv-you') {
      userName = e.target.value.trim();
      clearTimeout(detail._u); detail._u = setTimeout(loadPreview, 250);
    }
  });
  detail.addEventListener('change', (e) => {
    if (e.target.name === 'cb-mv-mode') {
      layouts.set(chatId, { mode: e.target.value, flips: [] });
      loadPreview().then(renderFields);
    } else if (e.target.id === 'cb-mv-chat-pick') {
      chatId = e.target.value; shown = 40;
      setModeRadios();
      loadPreview();
    }
  });
  detail.addEventListener('click', async (e) => {
    const b = e.target.closest('button');
    if (!b || !person) return;
    if (b.hasAttribute('data-mv-back')) { $('cb-move').classList.remove('is-reading'); return; }
    if (b.dataset.flip != null) { layouts.set(chatId, M.toggleFlip(layoutOf(chatId), Number(b.dataset.flip))); await loadPreview(); renderFields(); const again = document.querySelector(`#cb-mv-preview [data-flip="${b.dataset.flip}"]`); if (again) again.focus(); return; }
    if (b.hasAttribute('data-mv-more')) { shown += 40; loadPreview(); return; }
    const what = b.dataset.mv;
    if (what === 'pic') return picInput.click();
    if (what === 'pic-reset') { const old = pictures.get(person.key); if (old) URL.revokeObjectURL(old.url); pictures.delete(person.key); drawCardPicture(); return; }
    if (what === 'png' || what === 'json' || what === 'jsonl') save(what, b);
  });

  function allowed() {
    if (CB.pro) return true;
    if (!free) { free = { key: person.key, name: nameOf(person) }; store.set('chatbound:free-character', free); renderFree(); return true; }
    if (free.key === person.key) return true;
    return CB.needPro(`Seu personagem gratuito é ${free.name || 'o que você já escolheu'}. Converter mais personagens, ou todos de uma vez, faz parte do Pro.`);
  }
  async function save(what, b) {
    const name = nameOf(person);
    if (!name) { CB.toast('Digite primeiro o nome do personagem.'); $('cb-mv-name').focus(); return; }
    if (!allowed()) return;
    b.disabled = true;
    try {
      if (what === 'jsonl') {
        const r = await CB.call('moveChat', { id: chatId, layout: layoutOf(chatId), charName: name, userName: userName || 'Você', fileName: name });
        CB.download(r.blob, r.name);
        CB.toast(`Salvo: ${r.name}`);
      } else {
        const c = cardFor(person, firstMesOf(person));
        const errs = M.validateCard(c);
        if (errs.length) throw new Error(errs.join('; '));
        const stem = M.slug(name, 'character');
        if (what === 'json') CB.download(new Blob([JSON.stringify(c, null, 2)], { type: 'application/json' }), `${stem}.json`);
        else CB.download(new Blob([M.pngWithCard(await pictureFor(person), JSON.stringify(c))], { type: 'image/png' }), `${stem}.png`);
        CB.toast(`Salvo: ${stem}.${what}`);
      }
    } catch (err) { CB.toast(`Não deu certo: ${err.message}`); }
    b.disabled = false;
    renderFree();
  }

  // ---------------------------------------------------------------- Pro: everything in one ZIP
  $('cb-mv-all').addEventListener('click', async (e) => {
    const b = e.currentTarget;
    if (!IDX || !IDX.people.length) return;
    if (!CB.needPro('Converter todos os personagens e conversas de uma vez, em um único ZIP de cartões e arquivos de conversa, faz parte do Pro.')) return;
    b.disabled = true;
    const label0 = b.innerHTML;
    b.textContent = 'Gerando os cartões…';
    try {
      let unnamed = 0;
      const people = [];
      for (const p of IDX.people) {
        const name = nameOf(p) || `Personagem sem nome ${++unnamed}`;
        if (p.kind === 'chat' && p.chats.length && layoutOf(p.chats[0].id).mode !== 'char' && !texts.has(p.chats[0].id)) {
          const pg = await CB.call('chatPage', { id: p.chats[0].id, from: 0, count: 40 });
          texts.set(p.chats[0].id, pg.msgs.map((m) => m.text));
        }
        const c = p.kind === 'own' ? M.cardFromCharacter(CB.overview.characters[p.char], { name }) : M.cardFromChat({ name, description: descs.get(p.key) || '', first_mes: firstMesOf(p) });
        const errs = M.validateCard(c);
        if (errs.length) throw new Error(`${name}: ${errs.join('; ')}`);
        const pic = pictures.get(p.key);
        const json = JSON.stringify(c);
        people.push({ name, cardJson: json, png: M.pngWithCard(pic ? pic.png : await plainPng(name), json), chats: p.chats.map((ch) => ({ id: ch.id, layout: layoutOf(ch.id), title: CB.names()[ch.id] || '' })) });
      }
      b.textContent = 'Gerando o ZIP…';
      const r = await CB.call('moveZip', { people, userName: userName || 'Você', owner: CB.owner() });
      CB.download(r.blob, r.name);
      CB.toast(`Salvo ${r.name}: ${plural(people.length, 'personagem', 'personagens')}, ${plural(r.chats, 'conversa', 'conversas')}`);
    } catch (err) { CB.toast(`Não deu certo: ${err.message}`); }
    b.disabled = false; b.innerHTML = label0;
  });
})();
