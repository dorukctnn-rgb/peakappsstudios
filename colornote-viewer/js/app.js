/* Notelift page logic (English, Japanese, Korean, Spanish and Portuguese pages). The backup and its password go to the
 * worker (worker.js) in this tab; the page shows the notes the worker reads. The one network request the page itself
 * can make is the Pro license check, to Gumroad, when you paste a key. Your notes and your password are never uploaded
 * or stored, and the backup is never changed. */
import { strings, labels, fill, LOCALE } from './i18n.js';
import { COLOR_KEYS, COLOR_HEX, shownTitle, noteHtml, noteBody, haystack, fold, folderName, reminderText, compareNotes, lineDiff, restoreList, escHtml, FOLDER_NONE, FOLDER_CALENDAR } from './notes.js';

// ---- Gumroad Pro product, permalink notelift-pro. The license check sends this product id, never the permalink.
// Fail closed: while this is 'PENDING' (or empty) Pro never turns on, whatever the browser has stored.
const NOTELIFT_PRO_PRODUCT_ID = 'GnGOkEXUr06TKgh8dfbsZw==';
const NOTELIFT_PRO_URL = 'https://dorukctn.gumroad.com/l/notelift-pro';
const PRO_READY = !!NOTELIFT_PRO_PRODUCT_ID && NOTELIFT_PRO_PRODUCT_ID !== 'PENDING';
const FREE_TXT = 20;
const PAGE = 300;

const LANG = ((document.documentElement.lang || 'en').slice(0, 2)).toLowerCase();
const T = strings(LANG);
const L = labels(LANG);
const LOC = LOCALE[LANG] || 'en-GB';
const $ = id => document.getElementById(id);
const nf = new Intl.NumberFormat(LOC);
const fWhen = new Intl.DateTimeFormat(LOC, { dateStyle: 'medium', timeStyle: 'short' });
const fDay = new Intl.DateTimeFormat(LOC, { dateStyle: 'medium' });
const fDayUtc = new Intl.DateTimeFormat(LOC, { dateStyle: 'medium', timeZone: 'UTC' });
const fShort = new Intl.DateTimeFormat(LOC, { day: 'numeric', month: 'short', year: 'numeric' });
const LOCK = '<svg class="cn-lock" viewBox="0 0 20 20" aria-hidden="true" focusable="false"><path d="M6 9V6.5a4 4 0 0 1 8 0V9" fill="none" stroke="currentColor" stroke-width="1.8"/><rect x="4" y="9" width="12" height="8.5" rx="2" fill="currentColor"/></svg>';
const BOX = done => `<svg class="cn-box" viewBox="0 0 20 20" aria-hidden="true" focusable="false"><rect x="2.5" y="2.5" width="15" height="15" rx="3.5" fill="${done ? 'currentColor' : 'none'}" stroke="currentColor" stroke-width="1.8"/>${done ? '<path d="M6 10.2 8.8 13 14.2 7" fill="none" stroke="#fff" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"/>' : ''}</svg>`;

const state = {
  pro: false, book: null, other: null, // the open backups
  scope: 'notes', color: null, folder: null, kind: null, sort: 'modified', q: '',
  list: [], shown: PAGE, sel: null, hay: [], view: 'notes', pwFor: 'main',
};
let worker = null, seq = 0;
const waiting = new Map();

/* ---------- license ---------- */
const LICENSE_WORDS = {
  ja: { title: 'Pro を購入', buy: 'Gumroad で Pro を購入', keyLabel: '購入済みの方は、ライセンスキーを貼り付けてください', verify: '有効にする', close: '閉じる', checking: 'Gumroad で確認しています…', badKey: 'ライセンスキーの形式ではないようです。Gumroad の購入確認メールに記載されています。', network: 'Gumroad に接続できませんでした。接続を確認して、もう一度お試しください。', ok: 'このブラウザで Pro が有効になりました。ありがとうございます。', refunded: 'この購入は返金済みか終了しているため、Pro は無効です。', rejected: 'このライセンスキーは使用できません。', active: 'このブラウザで Pro が有効です。' },
  ko: { title: 'Pro 구매', buy: 'Gumroad에서 Pro 구매', keyLabel: '이미 구매하셨나요? 라이선스 키를 붙여 넣으세요', verify: '활성화', close: '닫기', checking: 'Gumroad에서 확인하는 중…', badKey: '라이선스 키 형식이 아닌 것 같습니다. Gumroad 구매 확인 메일에 있습니다.', network: 'Gumroad에 연결하지 못했습니다. 인터넷 연결을 확인한 뒤 다시 시도해 주세요.', ok: '이 브라우저에서 Pro가 활성화되었습니다. 감사합니다.', refunded: '환불되었거나 종료된 구매라서 Pro가 꺼졌습니다.', rejected: '이 라이선스 키는 사용할 수 없습니다.', active: '이 브라우저에서 Pro가 활성화되어 있습니다.' },
  es: { title: 'Obtener Pro', buy: 'Comprar Pro en Gumroad', keyLabel: '¿Ya lo compraste? Pega tu clave de licencia', verify: 'Activar', close: 'Cerrar', checking: 'Comprobando con Gumroad…', badKey: 'Eso no parece una clave de licencia. Está en el correo de compra de Gumroad.', network: 'No se pudo contactar con Gumroad. Revisa la conexión y vuelve a intentarlo.', ok: 'Pro está activo en este navegador. Gracias.', refunded: 'Esta compra se reembolsó o terminó, así que Pro está desactivado.', rejected: 'Esa clave de licencia no se aceptó.', active: 'Pro está activo en este navegador.' },
  pt: { title: 'Obter o Pro', buy: 'Comprar o Pro no Gumroad', keyLabel: 'Já comprou? Cole sua chave de licença', verify: 'Ativar', close: 'Fechar', checking: 'Verificando com o Gumroad…', badKey: 'Isso não parece uma chave de licença. Ela está no e-mail de compra do Gumroad.', network: 'Não foi possível falar com o Gumroad. Verifique a conexão e tente de novo.', ok: 'O Pro está ativo neste navegador. Obrigado.', refunded: 'Esta compra foi reembolsada ou terminou, então o Pro está desligado.', rejected: 'Essa chave de licença não foi aceita.', active: 'O Pro está ativo neste navegador.' },
};
function setupLicense() {
  if (!window.PeakLicense) return;
  const extra = LICENSE_WORDS[LANG] ? { strings: LICENSE_WORDS[LANG], localMessages: true } : {};
  window.PeakLicense.setup(Object.assign({ tool: 'notelift', productId: PRO_READY ? NOTELIFT_PRO_PRODUCT_ID : 'PENDING', permalink: 'notelift-pro', buyUrl: NOTELIFT_PRO_URL, pitch: T.pitch }, extra));
  window.PeakLicense.onChange(isPro => {
    state.pro = PRO_READY && !!isPro;
    $('pro-state').textContent = state.pro ? T.proActive : T.proOff;
    document.body.classList.toggle('cn-is-pro', state.pro);
    if (state.book) { renderTabs(); if (state.view === 'restore') renderRestore(); }
  });
}
const needPro = reason => (state.pro ? true : (window.PeakLicense ? window.PeakLicense.requirePro(reason) : false));

/* ---------- the worker ---------- */
function getWorker() {
  if (worker) return worker;
  try { worker = new Worker(new URL('./worker.js', import.meta.url), { type: 'module' }); } catch (e) { worker = null; return null; }
  worker.onmessage = onWorker;
  worker.onerror = e => { if (e.preventDefault) e.preventDefault(); fail('main', 'noworker'); };
  return worker;
}
function call(kind, data = {}) {
  const w = getWorker();
  if (!w) return Promise.reject(new Error('noworker'));
  const id = ++seq;
  return new Promise((resolve, reject) => { waiting.set(id, { resolve, reject }); w.postMessage(Object.assign({ type: 'export', id, kind, lang: LANG }, data)); });
}
function onWorker(ev) {
  const m = ev.data || {};
  if (m.id != null) {
    const w = waiting.get(m.id);
    if (!w) return;
    waiting.delete(m.id);
    if (m.type === 'error') w.reject(Object.assign(new Error(m.detail || m.code), { code: m.code })); else w.resolve(m.blob);
    return;
  }
  const purpose = m.purpose === 'compare' ? 'compare' : 'main';
  if (m.type === 'progress') { if (purpose === 'main') { $('busy-sub').textContent = T.steps[m.step] || ''; setBar({ reading: 25, decrypt: 60, notes: 90 }[m.step] || 10); } else $('cmp-status').textContent = T.steps[m.step] || ''; return; }
  if (m.type === 'password') { askPassword(purpose, m.code, m.retry, m.name); return; }
  if (m.type === 'error') { fail(purpose, m.code, m.detail); return; }
  if (m.type === 'opened') { if (purpose === 'main') loaded(m.data); else comparedLoaded(m.data); }
}

/* ---------- the open panel ---------- */
function stage(name) {
  ['idle', 'busy', 'password', 'error', 'done'].forEach(s => { $('stage-' + s).hidden = s !== name; });
  $('panel').dataset.state = name;
}
const focusEl = el => { if (el) el.focus({ preventScroll: true }); };
function setBar(p) {
  const v = Math.max(0, Math.min(100, Math.round(p || 0)));
  $('busy-bar').setAttribute('aria-valuenow', String(v));
  $('busy-bar').firstElementChild.style.width = v + '%';
}
function fail(purpose, code, detail) {
  const [title, text] = T.errors[code] || T.errors.internal;
  if (purpose === 'compare') { cmpStage('error'); $('cmp-error').textContent = `${title} ${fill(text, { detail: detail || code })}`; focusEl($('cmp-error')); return; }
  $('error-title').textContent = title;
  $('error-text').textContent = fill(text, { detail: detail || code });
  stage('error');
  focusEl($('error-title'));
}
function openFile(file, purpose = 'main') {
  if (!file) return;
  const w = getWorker();
  if (!w) return fail(purpose, 'noworker');
  if (purpose === 'main') {
    $('busy-title').textContent = fill(T.reading, { name: file.name || 'backup' });
    $('busy-sub').textContent = T.steps.reading;
    setBar(8);
    stage('busy');
    focusEl($('busy-title'));
  } else { cmpStage('busy'); $('cmp-status').textContent = fill(T.reading, { name: file.name || 'backup' }); }
  w.postMessage({ type: 'open', file, purpose });
}
function openSample() {
  const w = getWorker();
  if (!w) return fail('main', 'noworker');
  $('busy-title').textContent = T.readingSample;
  $('busy-sub').textContent = T.steps.notes;
  setBar(60);
  stage('busy');
  w.postMessage({ type: 'sample', lang: LANG });
}
function askPassword(purpose, code, retry, name) {
  if (purpose === 'compare') {
    cmpStage('password');
    $('cmp-pw-note').textContent = retry ? (code === 'nosig' ? T.pwWrongNosig : T.pwWrong) : fill(code === 'nosig' ? T.pwTextNosig : T.pwText, { name });
    $('cmp-pw').value = '';
    focusEl($('cmp-pw'));
    return;
  }
  $('pw-title').textContent = T.pwTitle;
  $('pw-text').textContent = fill(code === 'nosig' ? T.pwTextNosig : T.pwText, { name: name || 'backup' });
  $('pw-wrong').textContent = retry ? (code === 'nosig' ? T.pwWrongNosig : T.pwWrong) : '';
  $('pw-wrong').hidden = !retry;
  $('pw').value = '';
  $('pw').setAttribute('aria-invalid', String(!!retry));
  stage('password');
  focusEl($('pw'));
}
function sendPassword(purpose) {
  const input = purpose === 'compare' ? $('cmp-pw') : $('pw');
  const pw = input.value;
  if (!pw) { focusEl(input); return; }
  input.value = '';
  if (purpose === 'main') { $('busy-title').textContent = T.pwChecking; $('busy-sub').textContent = T.steps.decrypt; setBar(50); stage('busy'); }
  else { cmpStage('busy'); $('cmp-status').textContent = T.pwChecking; }
  getWorker().postMessage({ type: 'password', purpose, password: pw });
}

function loaded(data) {
  state.book = data;
  state.other = null;
  state.hay = data.notes.map(haystack);
  state.scope = 'notes'; state.color = null; state.folder = null; state.kind = null; state.q = ''; state.sel = null; state.shown = PAGE;
  $('q').value = '';
  setBar(100);
  const n = data.notes.length;
  if (!n) {
    $('done-title').textContent = T.emptyTitle;
    $('done-sub').textContent = T.emptyText;
    $('btn-see').hidden = true;
    stage('done');
    focusEl($('done-title'));
    $('notes').hidden = true;
    return;
  }
  const c = counts();
  $('done-title').textContent = data.sample ? T.doneSampleTitle : n === 1 ? T.doneTitleOne : fill(T.doneTitle, { n: nf.format(n) });
  const parts = [];
  if (data.folders.length) parts.push(fill(data.folders.length === 1 ? T.sumFolder : T.sumFolders, { n: nf.format(data.folders.length) }));
  if (c.archive) parts.push(fill(T.sumArchive, { n: nf.format(c.archive) }));
  if (c.trash) parts.push(fill(T.sumTrash, { n: nf.format(c.trash) }));
  if (c.locked) parts.push(fill(c.locked === 1 ? T.sumLockedOne : T.sumLocked, { n: nf.format(c.locked) }));
  let sub = data.sample ? T.doneSample : fill(T.doneSub, { name: data.name });
  if (parts.length) sub += ' ' + parts.join(T.listSep) + '.';
  if (data.cut) sub += ' ' + T.doneCut;
  $('done-sub').textContent = sub;
  $('btn-see').hidden = false;
  stage('done');
  $('notes').hidden = false;
  renderRail();
  renderTabs();
  setView('notes', false);
  refresh();
  resetCompare();
  focusEl($('done-title'));
}

/* ---------- counts, filters, the list ---------- */
function counts() {
  const c = { notes: 0, archive: 0, trash: 0, locked: 0, list: 0, reminder: 0, colors: new Array(10).fill(0), folders: new Map() };
  for (const n of state.book.notes) {
    c[n.where]++;
    if (n.where !== 'notes') continue;
    if (n.locked) c.locked++;
    if (n.kind === 'list') c.list++;
    if (n.reminder) c.reminder++;
    c.colors[n.color]++;
    c.folders.set(n.folder, (c.folders.get(n.folder) || 0) + 1);
  }
  return c;
}
const folderLabel = id => folderName(id, state.book.folders, L);
function renderRail() {
  const c = counts();
  const btn = (attrs, label, n, extra = '') => `<button type="button" ${attrs}${extra}><span class="cn-rail-label">${label}</span><span class="cn-count">${nf.format(n)}</span></button>`;
  const show = [btn('data-kind=""', escHtml(T.allNotes), c.notes)];
  if (c.list) show.push(btn('data-kind="list"', escHtml(T.checklists), c.list));
  if (c.reminder) show.push(btn('data-kind="reminder"', escHtml(T.reminders), c.reminder));
  if (c.locked) show.push(btn('data-kind="locked"', escHtml(T.lockedF), c.locked));
  $('rail-show').innerHTML = show.join('');
  $('rail-colors').innerHTML = COLOR_KEYS.map((k, i) => (i && c.colors[i] ? `<button type="button" class="cn-tab" data-color="${i}" style="--note:${COLOR_HEX[k]}" aria-label="${escHtml(fill(T.colourCount, { colour: L.colors[k], n: nf.format(c.colors[i]) }))}"><span class="cn-tab-chip" aria-hidden="true"></span><span class="cn-rail-label">${escHtml(L.colors[k])}</span><span class="cn-count">${nf.format(c.colors[i])}</span></button>` : '')).join('');
  const fids = [...c.folders.keys()].sort((a, b) => (a === FOLDER_NONE ? -1 : b === FOLDER_NONE ? 1 : a === FOLDER_CALENDAR ? 1 : b === FOLDER_CALENDAR ? -1 : folderLabel(a).localeCompare(folderLabel(b), LOC)));
  $('rail-folders').innerHTML = fids.map(id => btn(`data-folder="${id}"`, escHtml(folderLabel(id)), c.folders.get(id))).join('');
  $('rail-folders-block').hidden = fids.length < 2;
  $('rail-places').innerHTML = [btn('data-scope="archive"', escHtml(L.places.archive), c.archive), btn('data-scope="trash"', escHtml(L.places.trash), c.trash)].join('');
  syncRail();
}
function syncRail() {
  const on = (sel, yes) => document.querySelectorAll(sel).forEach(b => b.setAttribute('aria-pressed', String(yes(b))));
  on('#rail-show button', b => state.scope === 'notes' && (b.dataset.kind || null) === state.kind && state.color == null && state.folder == null);
  on('#rail-colors button', b => Number(b.dataset.color) === state.color);
  on('#rail-folders button', b => Number(b.dataset.folder) === state.folder);
  on('#rail-places button', b => b.dataset.scope === state.scope);
  $('rail-clear').hidden = !(state.color != null || state.folder != null || state.kind || state.scope !== 'notes' || state.q);
}
function filtered() {
  const q = fold(state.q.trim());
  const words = q ? q.split(/\s+/).filter(Boolean) : [];
  const out = [];
  const notes = state.book.notes;
  for (let i = 0; i < notes.length; i++) {
    const n = notes[i];
    if (q) { if (!words.every(w => state.hay[i].includes(w))) continue; }
    else if (n.where !== state.scope) continue;
    if (state.color != null && n.color !== state.color) continue;
    if (state.folder != null && n.folder !== state.folder) continue;
    if (state.kind === 'list' && n.kind !== 'list') continue;
    if (state.kind === 'reminder' && !n.reminder) continue;
    if (state.kind === 'locked' && !n.locked) continue;
    out.push(n);
  }
  const by = {
    modified: (a, b) => (b.modified || 0) - (a.modified || 0),
    created: (a, b) => (b.created || 0) - (a.created || 0),
    title: (a, b) => (shownTitle(a) || '￿').localeCompare(shownTitle(b) || '￿', LOC, { sensitivity: 'base' }),
    color: (a, b) => (a.color || 99) - (b.color || 99) || (b.modified || 0) - (a.modified || 0),
  }[state.sort];
  return out.sort(by);
}
function refresh(keepSel = false) {
  state.list = filtered();
  if (!keepSel) state.shown = PAGE;
  syncRail();
  renderList();
  if (!state.list.length) showNote(null);
  else if (!keepSel || !state.list.some(n => n.n === state.sel)) showNote(window.matchMedia('(max-width: 860px)').matches ? null : state.list[0].n, false);
  else showNote(state.sel, false);
}
function snippet(n) {
  if (n.locked) return T.lockedTitle;
  if (n.kind === 'list') { const d = n.items.filter(i => i.done).length; return `${fill(T.ticked, { d: nf.format(d), n: nf.format(n.items.length) })} ${n.items.slice(0, 4).map(i => i.text).join(', ')}`; }
  const t = n.title ? n.text : n.text.split('\n').slice(1).join(' ');
  return t.replace(/\s+/g, ' ').trim().slice(0, 160);
}
function heading() {
  const k = state.q ? fill(state.list.length === 1 ? T.foundOne : T.found, { n: nf.format(state.list.length), q: state.q.trim() })
    : fill(state.list.length === 1 ? T.listCountOne : T.listCount, { n: nf.format(state.list.length) });
  const where = [];
  if (!state.q && state.scope !== 'notes') where.push(L.places[state.scope]);
  if (state.kind) where.push({ list: T.checklists, reminder: T.reminders, locked: T.lockedF }[state.kind]);
  if (state.color != null) where.push(L.colors[COLOR_KEYS[state.color]]);
  if (state.folder != null) where.push(folderLabel(state.folder));
  return where.length ? `${k} (${where.join(', ')})` : k;
}
function renderList() {
  $('list-head').textContent = heading();
  const box = $('list');
  if (!state.list.length) {
    box.innerHTML = `<li class="cn-empty">${escHtml(state.q ? T.listEmptySearch : T.listEmpty)}</li>`;
    $('list-more').hidden = true;
    return;
  }
  const html = state.list.slice(0, state.shown).map(n => {
    const t = shownTitle(n) || T.untitled;
    const date = n.modified ? fShort.format(n.modified) : '';
    const flags = [n.locked ? LOCK : '', n.reminder ? `<svg class="cn-bell" viewBox="0 0 20 20" aria-hidden="true" focusable="false"><path d="M10 2.6a5 5 0 0 0-5 5v3.2L3.4 14h13.2L15 10.8V7.6a5 5 0 0 0-5-5zM8 16a2 2 0 0 0 4 0" fill="currentColor"/></svg>` : ''].join('');
    return `<li><button type="button" class="cn-item" data-n="${n.n}" aria-current="${n.n === state.sel}" style="--note:${COLOR_HEX[COLOR_KEYS[n.color]]}"><span class="cn-item-top"><span class="cn-item-title">${escHtml(t)}</span>${flags}</span><span class="cn-item-snip">${escHtml(snippet(n))}</span><span class="cn-item-date">${escHtml(date)}${state.q && n.where !== 'notes' ? ` <span class="cn-where">${escHtml(L.places[n.where])}</span>` : ''}</span></button></li>`;
  }).join('');
  box.innerHTML = html;
  if (state.q) markIn(box, state.q);
  const left = state.list.length - state.shown;
  $('list-more').hidden = left <= 0;
  $('list-more').textContent = fill(T.showMore, { n: nf.format(Math.min(PAGE, left)) });
}
function markIn(root, q) {
  const words = fold(q.trim()).split(/\s+/).filter(w => w.length > 0);
  if (!words.length) return;
  const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT);
  const nodes = [];
  while (walker.nextNode()) nodes.push(walker.currentNode);
  for (const node of nodes) {
    const text = node.nodeValue;
    const f = fold(text);
    if (f.length !== text.length) continue; // folding changed the length (rare letters): leave it unmarked
    const hits = [];
    for (const w of words) { let i = f.indexOf(w); while (i >= 0) { hits.push([i, i + w.length]); i = f.indexOf(w, i + w.length); } }
    if (!hits.length) continue;
    hits.sort((a, b) => a[0] - b[0]);
    const frag = document.createDocumentFragment();
    let at = 0;
    for (const [s, e] of hits) {
      if (s < at) continue;
      if (s > at) frag.appendChild(document.createTextNode(text.slice(at, s)));
      const m = document.createElement('mark'); m.className = 'cn-hit'; m.textContent = text.slice(s, e); frag.appendChild(m);
      at = e;
    }
    if (at < text.length) frag.appendChild(document.createTextNode(text.slice(at)));
    node.parentNode.replaceChild(frag, node);
  }
}

/* ---------- the reading pane ---------- */
function showNote(id, focus = true) {
  state.sel = id;
  document.querySelectorAll('#list .cn-item').forEach(b => b.setAttribute('aria-current', String(Number(b.dataset.n) === id)));
  const pane = $('pane');
  const n = id == null ? null : state.book.notes[id];
  document.body.classList.toggle('cn-reading', !!n);
  if (!n) { pane.innerHTML = `<p class="cn-pane-empty">${escHtml(state.list.length ? T.paneEmpty : '')}</p>`; return; }
  const key = COLOR_KEYS[n.color];
  const meta = [];
  if (n.created) meta.push([T.created, fWhen.format(n.created)]);
  if (n.modified && n.modified !== n.created) meta.push([T.modified, fWhen.format(n.modified)]);
  meta.push([T.folder, folderLabel(n.folder)]);
  meta.push([T.colour, L.colors[key]]);
  if (n.reminder) meta.push([T.reminder, `${n.reminder.allDay ? fDayUtc.format(n.reminder.at) : fWhen.format(n.reminder.at)}${n.reminder.repeat !== 'once' ? ` (${L.repeat[n.reminder.repeat]})` : ''}`]);
  if (n.where !== 'notes') meta.push([T.place, L.places[n.where]]);
  if (n.tags.length) meta.push([L.tags, n.tags.join(', ')]);
  let body;
  if (n.locked) body = `<div class="cn-locked">${LOCK}<p><strong>${escHtml(T.lockedTitle)}</strong></p><p>${escHtml(T.lockedText)}</p></div>`;
  else if (n.kind === 'list') {
    const d = n.items.filter(i => i.done).length;
    body = `<p class="cn-ticked">${escHtml(fill(T.ticked, { d: nf.format(d), n: nf.format(n.items.length) }))}</p><ul class="cn-check">${n.items.map(i => `<li class="${i.done ? 'is-done' : ''}${i.bare ? ' is-bare' : ''}">${i.bare ? '' : BOX(i.done)}<span>${escHtml(i.text) || '&nbsp;'}</span>${i.bare ? '' : `<span class="sr-only">${escHtml(i.done ? T.srDone : T.srOpen)}</span>`}</li>`).join('')}</ul>`;
  } else body = `<div class="cn-text">${noteHtml(n.text, n.fmt) || `<span class="cn-muted">${escHtml(T.emptyNote)}</span>`}</div>`;
  pane.innerHTML = `<article class="cn-note" style="--note:${COLOR_HEX[key]}" aria-labelledby="note-title">
<div class="cn-note-bar"><button type="button" class="btn cn-btn-quiet cn-back" id="pane-back">${escHtml(T.back)}</button></div>
<h3 id="note-title" tabindex="-1">${escHtml(shownTitle(n) || T.untitled)}</h3>
<dl class="cn-meta">${meta.map(([k, v]) => `<div><dt>${escHtml(k)}</dt><dd>${escHtml(v)}</dd></div>`).join('')}</dl>
${body}
<div class="cn-note-actions">${n.locked ? '' : `<button type="button" class="btn btn-primary" id="note-copy">${escHtml(T.copy)}</button><button type="button" class="btn cn-btn-quiet" id="note-save">${escHtml(T.saveTxt)}</button>`}</div>
<p class="cn-status" id="note-status" role="status"></p>
</article>`;
  if (state.q) markIn(pane.querySelector('.cn-text, .cn-check') || pane, state.q);
  if (focus) focusEl($('note-title'));
}
async function copyNote() {
  const n = state.book.notes[state.sel];
  if (!n) return;
  const text = `${shownTitle(n)}\n\n${noteBody(n, L)}`;
  let ok = false;
  try { await navigator.clipboard.writeText(text); ok = true; } catch (e) {
    const ta = document.createElement('textarea'); ta.value = text; ta.setAttribute('readonly', ''); ta.style.position = 'fixed'; ta.style.opacity = '0';
    document.body.appendChild(ta); ta.select();
    try { ok = document.execCommand('copy'); } catch (e2) { ok = false; }
    ta.remove();
  }
  $('note-status').textContent = ok ? T.copied : T.copyFailed;
}
const stamp = () => { const d = new Date(); return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`; };
const baseName = () => `${T.fileBase}-${stamp()}`;
async function saveNote() {
  const n = state.book.notes[state.sel];
  if (!n) return;
  const blob = await call('note', { ids: [n.n] });
  const name = `${(shownTitle(n) || T.untitled).replace(/[\\/:*?"<>|#^[\]]/g, ' ').replace(/\s+/g, ' ').trim().slice(0, 60) || T.untitled}.txt`;
  window.PeakUI.download(blob, name);
  $('note-status').textContent = fill(T.savedFile, { file: name });
}

/* ---------- tabs ---------- */
function renderTabs() {
  document.querySelectorAll('[data-pro-tag]').forEach(el => { el.hidden = state.pro; });
}
function setView(v, focus = true) {
  state.view = v;
  document.querySelectorAll('#tablist [role=tab]').forEach(t => {
    const on = t.dataset.view === v;
    t.setAttribute('aria-selected', String(on));
    t.tabIndex = on ? 0 : -1;
  });
  ['notes', 'save', 'compare', 'restore'].forEach(k => { $('view-' + k).hidden = k !== v; });
  if (v === 'restore') renderRestore();
  if (v === 'save') renderSave();
  if (focus) focusEl(document.querySelector(`#tablist [data-view="${v}"]`));
}

/* ---------- save and move ---------- */
function exportIds() {
  const which = document.querySelector('input[name="save-which"]:checked');
  if (which && which.value === 'list') return state.list.map(n => n.n);
  const hidden = $('save-hidden').checked;
  return state.book.notes.filter(n => hidden || n.where === 'notes').map(n => n.n);
}
function renderSave() {
  const all = state.book.notes.filter(n => n.where === 'notes').length;
  $('save-which-all').textContent = fill(T.saveAll, { n: nf.format(all) });
  $('save-which-list').textContent = fill(T.saveList, { n: nf.format(state.list.length) });
  const hidden = state.book.notes.length - all;
  $('save-hidden-row').hidden = !hidden;
  $('save-hidden-label').textContent = fill(T.saveHidden, { n: nf.format(hidden) });
}
function status(id, text) { $(id).textContent = text; }
function busy(btn, on) { btn.disabled = on; btn.setAttribute('aria-busy', String(on)); }
async function runSave(btn, statusId, kind, file, pro = true) {
  if (pro && !needPro(T.needSave)) return;
  const ids = exportIds();
  if (!ids.length) { status(statusId, T.nothingToSave); return; }
  busy(btn, true);
  status(statusId, T.working);
  try {
    const blob = await call(kind, { ids: kind === 'txt20' ? ids.slice(0, FREE_TXT) : ids });
    window.PeakUI.download(blob, file);
    status(statusId, kind === 'txt20' && ids.length > FREE_TXT ? fill(T.savedFree, { file, n: FREE_TXT, total: nf.format(ids.length) }) : fill(T.savedFile, { file }));
  } catch (e) { status(statusId, T.failed); }
  finally { busy(btn, false); }
}
async function saveBook(btn) {
  if (!needPro(T.needSave)) return;
  const ids = exportIds();
  if (!ids.length) { status('book-status', T.nothingToSave); return; }
  busy(btn, true);
  status('book-status', T.working);
  try {
    const { makeBook } = await import('./book.js');
    const paper = document.querySelector('#book-paper [aria-pressed="true"]').dataset.value;
    const notes = ids.map(i => state.book.notes[i]);
    const blob = await makeBook(notes, { paper, lang: LANG, locale: LOC, T, L, folders: state.book.folders, title: $('book-title').value.trim() || T.bookDefaultTitle, onProgress: (p, n) => status('book-status', fill(T.bookPages, { p: nf.format(p), n: nf.format(n) })) });
    const file = `${baseName()}-${paper}.pdf`;
    window.PeakUI.download(blob, file);
    status('book-status', fill(T.savedFile, { file }));
  } catch (e) { status('book-status', T.failed); }
  finally { busy(btn, false); }
}
function printNotes() {
  if (!needPro(T.needSave)) return;
  const ids = exportIds();
  if (!ids.length) { status('book-status', T.nothingToSave); return; }
  const box = $('print-area');
  box.innerHTML = `<h1>${escHtml($('book-title').value.trim() || T.bookDefaultTitle)}</h1>` + ids.map(i => {
    const n = state.book.notes[i];
    const meta = [n.modified ? fWhen.format(n.modified) : '', folderLabel(n.folder), L.colors[COLOR_KEYS[n.color]], n.where !== 'notes' ? L.places[n.where] : ''].filter(Boolean).join(', ');
    const body = n.locked ? `<p><em>${escHtml(L.lockedBody)}</em></p>` : n.kind === 'list' ? `<ul class="cn-print-list">${n.items.map(it => `<li>${it.bare ? '' : it.done ? '☑ ' : '☐ '}${escHtml(it.text)}</li>`).join('')}</ul>` : `<div class="cn-print-text">${noteHtml(n.text, n.fmt)}</div>`;
    return `<section class="cn-print-note" style="--note:${COLOR_HEX[COLOR_KEYS[n.color]]}"><h2>${escHtml(shownTitle(n) || T.untitled)}</h2><p class="cn-print-meta">${escHtml(meta)}</p>${body}</section>`;
  }).join('');
  document.body.classList.add('cn-printing');
  const done = () => { document.body.classList.remove('cn-printing'); box.innerHTML = ''; window.removeEventListener('afterprint', done); };
  window.addEventListener('afterprint', done);
  window.print();
  setTimeout(() => { if (!window.matchMedia('print').matches) done(); }, 1500);
}

/* ---------- compare two backups ---------- */
function cmpStage(name) {
  ['idle', 'busy', 'password', 'err', 'done'].forEach(s => { $('cmp-' + s).hidden = s !== (name === 'error' ? 'err' : name); });
}
function resetCompare() {
  state.other = null;
  cmpStage('idle');
  $('cmp-result').innerHTML = '';
}
function chooseCompare() {
  if (!needPro(T.needCompare)) return;
  $('cmp-file').click();
}
function comparedLoaded(data) {
  state.other = data;
  const A = state.book, B = data;
  const aTime = A.header && A.header.made, bTime = B.header && B.header.made;
  const swap = aTime && bTime && aTime > bTime;
  const older = swap ? B : A, newer = swap ? A : B;
  const r = compareNotes(older.notes, newer.notes);
  cmpStage('done');
  const when = b => (b.header && b.header.made ? fWhen.format(b.header.made) : b.name);
  $('cmp-summary').textContent = fill(T.cmpSummary, { a: nf.format(r.added.length), r: nf.format(r.removed.length), c: nf.format(r.changed.length), s: nf.format(r.same) });
  $('cmp-which').textContent = fill(T.cmpWhich, { older: `${older.name} (${when(older)})`, newer: `${newer.name} (${when(newer)})` });
  const item = (n, extra = '') => `<li style="--note:${COLOR_HEX[COLOR_KEYS[n.color]]}"><strong>${escHtml(shownTitle(n) || T.untitled)}</strong> <span class="cn-muted">${escHtml(n.modified ? fShort.format(n.modified) : '')}${n.where !== 'notes' ? ', ' + escHtml(L.places[n.where]) : ''}</span>${extra}</li>`;
  const what = c => c.what.map(w => T.cmpWhat[w]).join(', ');
  const diff = c => {
    if (c.before.locked || c.after.locked || !c.what.includes('text')) return '';
    const d = lineDiff(noteBody(c.before, L), noteBody(c.after, L)).filter(x => x.op !== 'same').slice(0, 40);
    return `<details><summary>${escHtml(T.cmpShow)}</summary><div class="cn-diff">${d.map(x => `<div class="cn-diff-${x.op}"><span class="sr-only">${escHtml(x.op === 'add' ? T.cmpAddedLine : T.cmpRemovedLine)}</span>${escHtml(x.text) || '&nbsp;'}</div>`).join('')}</div></details>`;
  };
  const section = (h, list, render) => `<section class="cn-cmp-block"><h4>${escHtml(fill(h, { n: nf.format(list.length) }))}</h4>${list.length ? `<ul class="cn-cmp-list">${list.slice(0, 500).map(render).join('')}</ul>` : `<p class="cn-muted">${escHtml(T.cmpNone)}</p>`}</section>`;
  $('cmp-result').innerHTML = section(T.cmpAddedH, r.added, n => item(n))
    + section(T.cmpChangedH, r.changed, c => item(c.after, `<span class="cn-what">${escHtml(what(c))}</span>${diff(c)}`))
    + section(T.cmpRemovedH, r.removed, n => item(n));
  state.cmpText = [T.cmpReportTitle, $('cmp-which').textContent, $('cmp-summary').textContent, '',
    fill(T.cmpAddedH, { n: r.added.length }), ...r.added.map(n => `+ ${shownTitle(n) || T.untitled}`), '',
    fill(T.cmpChangedH, { n: r.changed.length }), ...r.changed.map(c => `* ${shownTitle(c.after) || T.untitled} (${what(c)})`), '',
    fill(T.cmpRemovedH, { n: r.removed.length }), ...r.removed.map(n => `- ${shownTitle(n) || T.untitled}`)].join('\n');
  focusEl($('cmp-summary'));
}

/* ---------- restore list ---------- */
function renderRestore() {
  const R = restoreList(state.book.notes);
  const row = n => `<li style="--note:${COLOR_HEX[COLOR_KEYS[n.color]]}"><button type="button" class="cn-linkish" data-open="${n.n}">${escHtml(shownTitle(n) || T.untitled)}</button> <span class="cn-muted">${escHtml(fill(T.restoreRow, { date: n.modified ? fShort.format(n.modified) : '', folder: folderLabel(n.folder) }))}</span></li>`;
  const block = (h, list) => `<section class="cn-cmp-block"><h4>${escHtml(fill(h, { n: nf.format(list.length) }))}</h4>${list.length ? `<ul class="cn-cmp-list">${list.map(row).join('')}</ul>` : `<p class="cn-muted">${escHtml(T.restoreNone)}</p>`}</section>`;
  const locked = !state.pro;
  $('restore-list').innerHTML = locked ? `<p class="cn-muted">${escHtml(fill(T.restoreLocked, { a: nf.format(R.archive.length), t: nf.format(R.trash.length) }))}</p>` : block(T.restoreArchiveH, R.archive) + block(T.restoreTrashH, R.trash);
  $('btn-restore-save').hidden = locked;
  $('btn-restore-pro').hidden = !locked;
}

/* ---------- wiring ---------- */
function wire() {
  const input = $('file-input');
  $('btn-choose').addEventListener('click', () => input.click());
  $('btn-retry').addEventListener('click', () => { stage('idle'); input.click(); });
  $('btn-sample').addEventListener('click', openSample);
  $('btn-error-sample').addEventListener('click', openSample);
  $('btn-reset').addEventListener('click', () => { stage('idle'); focusEl($('drop-title')); });
  $('pw-cancel').addEventListener('click', () => { getWorker().postMessage({ type: 'cancel', purpose: 'main' }); stage('idle'); focusEl($('drop-title')); });
  input.addEventListener('change', () => { const f = input.files && input.files[0]; input.value = ''; openFile(f); });
  $('pw-form').addEventListener('submit', e => { e.preventDefault(); sendPassword('main'); });
  $('pw-toggle').addEventListener('click', () => { const show = $('pw').type === 'password'; $('pw').type = show ? 'text' : 'password'; $('pw-toggle').textContent = show ? T.pwHide : T.pwShow; $('pw-toggle').setAttribute('aria-pressed', String(show)); });
  const drop = $('drop');
  ['dragenter', 'dragover'].forEach(t => drop.addEventListener(t, e => { e.preventDefault(); drop.classList.add('is-over'); }));
  ['dragleave', 'drop'].forEach(t => drop.addEventListener(t, e => { e.preventDefault(); drop.classList.remove('is-over'); }));
  drop.addEventListener('drop', e => { const f = e.dataTransfer && e.dataTransfer.files && e.dataTransfer.files[0]; if (f) openFile(f); });
  $('btn-see').addEventListener('click', e => { e.preventDefault(); $('notes').scrollIntoView({ behavior: matchMedia('(prefers-reduced-motion: reduce)').matches ? 'auto' : 'smooth' }); focusEl($('app-title')); });

  let t = null;
  $('q').addEventListener('input', () => { clearTimeout(t); t = setTimeout(() => { state.q = $('q').value; if (state.view !== 'notes') setView('notes', false); refresh(); }, 140); });
  $('sort').addEventListener('change', () => { state.sort = $('sort').value; refresh(true); });
  $('rail').addEventListener('click', e => {
    const b = e.target.closest('button');
    if (!b) return;
    if (b.id === 'rail-clear') { state.scope = 'notes'; state.color = null; state.folder = null; state.kind = null; state.q = ''; $('q').value = ''; refresh(); return; }
    if (b.dataset.kind != null) { state.kind = b.dataset.kind || null; state.scope = 'notes'; if (!b.dataset.kind) { state.color = null; state.folder = null; } }
    else if (b.dataset.color) state.color = state.color === Number(b.dataset.color) ? null : Number(b.dataset.color);
    else if (b.dataset.folder) state.folder = state.folder === Number(b.dataset.folder) ? null : Number(b.dataset.folder);
    else if (b.dataset.scope) { state.scope = state.scope === b.dataset.scope ? 'notes' : b.dataset.scope; state.kind = null; }
    if (state.q) { state.q = ''; $('q').value = ''; }
    refresh();
  });
  $('list').addEventListener('click', e => { const b = e.target.closest('.cn-item'); if (b) showNote(Number(b.dataset.n), window.matchMedia('(max-width: 860px)').matches); });
  $('list').addEventListener('keydown', e => {
    if (e.key !== 'ArrowDown' && e.key !== 'ArrowUp') return;
    const items = [...document.querySelectorAll('#list .cn-item')];
    const i = items.indexOf(document.activeElement);
    if (i < 0) return;
    e.preventDefault();
    const next = items[Math.max(0, Math.min(items.length - 1, i + (e.key === 'ArrowDown' ? 1 : -1)))];
    next.focus(); showNote(Number(next.dataset.n), false);
  });
  $('list-more').addEventListener('click', () => { state.shown += PAGE; renderList(); });
  $('pane').addEventListener('click', e => {
    if (e.target.closest('#note-copy')) copyNote();
    else if (e.target.closest('#note-save')) saveNote().catch(() => { $('note-status').textContent = T.failed; });
    else if (e.target.closest('#pane-back')) { const id = state.sel; showNote(null); const b = document.querySelector(`#list .cn-item[data-n="${id}"]`); focusEl(b); }
  });
  document.addEventListener('keydown', e => { if (e.key === 'Escape' && document.body.classList.contains('cn-reading') && window.matchMedia('(max-width: 860px)').matches) { const id = state.sel; showNote(null); focusEl(document.querySelector(`#list .cn-item[data-n="${id}"]`)); } });

  const tabs = [...document.querySelectorAll('#tablist [role=tab]')];
  tabs.forEach(tab => tab.addEventListener('click', () => setView(tab.dataset.view)));
  $('tablist').addEventListener('keydown', e => {
    const i = tabs.indexOf(document.activeElement);
    if (i < 0) return;
    let j = null;
    if (e.key === 'ArrowRight') j = (i + 1) % tabs.length; else if (e.key === 'ArrowLeft') j = (i - 1 + tabs.length) % tabs.length; else if (e.key === 'Home') j = 0; else if (e.key === 'End') j = tabs.length - 1;
    if (j != null) { e.preventDefault(); setView(tabs[j].dataset.view); }
  });

  document.querySelectorAll('input[name="save-which"]').forEach(r => r.addEventListener('change', () => { $('save-hidden-row').classList.toggle('is-off', r.value === 'list' && r.checked); }));
  $('btn-txt').addEventListener('click', e => runSave(e.currentTarget, 'txt-status', 'txt20', `${baseName()}.txt`, false));
  $('btn-zip-txt').addEventListener('click', e => runSave(e.currentTarget, 'zip-status', 'zip-txt', `${baseName()}-txt.zip`));
  $('btn-zip-md').addEventListener('click', e => runSave(e.currentTarget, 'zip-status', 'zip-md', `${baseName()}-markdown.zip`));
  $('btn-csv').addEventListener('click', e => runSave(e.currentTarget, 'data-status', 'csv', `${baseName()}.csv`));
  $('btn-json').addEventListener('click', e => runSave(e.currentTarget, 'data-status', 'json', `${baseName()}.json`));
  $('btn-iphone').addEventListener('click', e => runSave(e.currentTarget, 'iphone-status', 'iphone', `${baseName()}-${T.fileIphone}.zip`));
  $('btn-gdocs').addEventListener('click', e => runSave(e.currentTarget, 'gdocs-status', 'gdocs', `${baseName()}-${T.fileGdocs}.zip`));
  $('btn-book').addEventListener('click', e => saveBook(e.currentTarget));
  $('btn-print').addEventListener('click', printNotes);
  $('book-paper').addEventListener('click', e => { const b = e.target.closest('button'); if (!b) return; $('book-paper').querySelectorAll('button').forEach(x => x.setAttribute('aria-pressed', String(x === b))); });

  $('btn-cmp-choose').addEventListener('click', chooseCompare);
  $('btn-cmp-again').addEventListener('click', () => { resetCompare(); chooseCompare(); });
  $('btn-cmp-retry').addEventListener('click', () => { resetCompare(); chooseCompare(); });
  $('cmp-file').addEventListener('change', () => { const f = $('cmp-file').files && $('cmp-file').files[0]; $('cmp-file').value = ''; if (f) openFile(f, 'compare'); });
  $('cmp-pw-form').addEventListener('submit', e => { e.preventDefault(); sendPassword('compare'); });
  $('cmp-pw-cancel').addEventListener('click', () => { getWorker().postMessage({ type: 'cancel', purpose: 'compare' }); resetCompare(); });
  $('btn-cmp-save').addEventListener('click', async e => {
    if (!needPro(T.needCompare) || !state.cmpText) return;
    const blob = await call('compare', { text: state.cmpText });
    const file = `${baseName()}-${T.fileCompare}.txt`;
    window.PeakUI.download(blob, file);
    $('cmp-saved').textContent = fill(T.savedFile, { file });
  });
  $('btn-restore-save').addEventListener('click', e => runSave(e.currentTarget, 'restore-status', 'restore', `${baseName()}-${T.fileRestore}.txt`));
  $('btn-restore-pro').addEventListener('click', () => { if (needPro(T.needRestore)) renderRestore(); });
  $('restore-list').addEventListener('click', e => { const b = e.target.closest('[data-open]'); if (!b) return; const n = state.book.notes[Number(b.dataset.open)]; state.scope = n.where; state.kind = null; state.color = null; state.folder = null; state.q = ''; $('q').value = ''; setView('notes'); refresh(); showNote(n.n, true); });
}

setupLicense();
wire();
stage('idle');
