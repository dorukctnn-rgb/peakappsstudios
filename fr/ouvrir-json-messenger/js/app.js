/* Readback page logic. The download is read here, in this tab (js/parse.js, js/zip.js); nothing is sent anywhere. The only
 * network call the page can make is Gumroad's licence check (/assets/license.js), and only when a Pro key is pasted. */
import { collect, openExport, ExportError, PLATFORM_LABEL, folderLabel, searchText, mimeOf } from './parse.js';
import { messagesHtml, esc, fmtDate, mediaLabel } from './render.js';
import { chatText, csvAll, archiveZip, safeName } from './export.js';
import { PRO, PRO_READY, PRO_PITCH } from '/messenger-json-viewer/js/pro.js';

const $ = id => document.getElementById(id);
const PAGE = 400;
const LOCALE = 'fr-FR';

let result = null;
let owner = null;
let current = -1;
let start = 0;
let term = '';
let hitAt = -1;
let urls = [];
let observer = null;
let pro = false;
let lc = new Map();

/* ------------------------------------------------------------------ Pro */
function setupPro() {
  if (!window.PeakLicense) return;
  PeakLicense.setup({ tool: 'readback', productId: PRO_READY ? PRO.productId : 'PENDING', permalink: PRO.permalink, buyUrl: PRO.url, pitch: "Pro enregistre toutes vos conversations d’un coup : des pages hors connexion avec les photos, vidéos et messages vocaux à côté des messages, tous les messages dans un seul tableur, et chaque conversation en texte brut. 8 $ US, en une fois.", strings: {"title":"Passer à Pro","buy":"Acheter Pro sur Gumroad","keyLabel":"Déjà acheté ? Collez votre clé de licence","verify":"Activer","close":"Fermer","checking":"Vérification auprès de Gumroad…","badKey":"Cela ne ressemble pas à une clé de licence. Elle se trouve dans l’e-mail de reçu de Gumroad.","network":"Impossible de joindre Gumroad pour vérifier la clé. Vérifiez votre connexion et réessayez.","ok":"Pro est actif dans ce navigateur. Merci.","refunded":"Cet achat a été remboursé ou a pris fin, donc Pro est désactivé.","rejected":"Cette clé de licence n’a pas été acceptée.","active":"Pro est actif dans ce navigateur."}, localMessages: true });
  pro = PRO_READY && PeakLicense.isPro();
  PeakLicense.onChange(p => { pro = PRO_READY && p; document.body.classList.toggle('is-pro', pro); proNote(); });
}
function proNote() {
  const n = $('save-note');
  if (n) n.textContent = pro ? 'Pro est actif dans ce navigateur. Choisissez ce que vous voulez enregistrer.' : 'Lire, chercher, imprimer et enregistrer une conversation à la fois reste gratuit. Pro enregistre toutes les conversations d’un coup : 8 $ US, en une fois.';
}
function needPro(why) {
  if (PRO_READY && window.PeakLicense && PeakLicense.isPro()) return true;
  if (window.PeakLicense) PeakLicense.open(why); else window.open(PRO.url, '_blank', 'noopener');
  return false;
}

/* ------------------------------------------------------------------ helpers */
function toast(msg) { if (window.PeakUI && PeakUI.toast) PeakUI.toast(msg); }
function download(name, data, type) {
  const blob = data instanceof Blob ? data : new Blob([data], { type: type || 'application/octet-stream' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url; a.download = name; a.rel = 'noopener';
  document.body.appendChild(a); a.click(); a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 120000);
}
const num = n => n.toLocaleString('fr-FR');
const UNITS = {"chat":["conversation","conversations"],"message":["message","messages"],"attachment":["pièce jointe","pièces jointes"],"file":["fichier","fichiers"],"chat includes":["conversation inclut","conversations incluent"],"attachment is":["pièce jointe figure","pièces jointes figurent"],"message matches":["message correspond","messages correspondent"]};
const plural = (n, one, many) => { const u = UNITS[one] || [one, many]; return `${num(n)} ${u[n === 1 || n === 0 ? 0 : 1]}`; };
const reduced = () => matchMedia('(prefers-reduced-motion: reduce)').matches;

/* ------------------------------------------------------------------ stages */
function stage(name) {
  for (const s of ['idle', 'busy', 'error']) $('stage-' + s).hidden = s !== name;
  $('panel').dataset.state = name;
}
const ERRORS = {
  empty: ['Le fichier est vide', 'Il ne contient aucun octet. Si le téléchargement s’est arrêté en route, recommencez-le depuis l’e-mail envoyé par Meta.'],
  pdf: ['Ceci est un PDF, pas un téléchargement de conversations', 'Facebook et Instagram envoient vos messages dans un fichier ZIP. Choisissez ce ZIP, ou les fichiers message_1.json qu’il contient.'],
  html: ['Ceci est une page web du téléchargement', 'Les pages HTML d’un téléchargement s’ouvrent déjà dans un navigateur : double-cliquez sur message_1.html. Pour chercher dans vos conversations et les enregistrer ici, refaites la demande de téléchargement en choisissant le format JSON.'],
  'html-export': ['Ce téléchargement est en HTML, pas en JSON', 'Ses conversations sont des pages web (message_1.html) qui s’ouvrent seules dans un navigateur. Readback lit le format JSON : refaites une demande et choisissez JSON sous Format. Le guide pour télécharger une conversation Messenger montre où.'],
  'no-messages': ['Ce téléchargement ne contient aucun message', 'C’est bien un téléchargement Facebook ou Instagram, mais les messages ne faisaient pas partie des informations choisies. Refaites une demande en cochant les messages.'],
  'not-chats': ['Aucune conversation dans ces fichiers', 'Readback ouvre les téléchargements Facebook et Instagram en JSON (ils contiennent des fichiers message_1.json) et le téléchargement des conversations chiffrées de Messenger. Rien dans ces fichiers n’y ressemble.'],
  'damaged-json': ['Les fichiers de conversation sont illisibles', 'Les fichiers message_1.json de ce téléchargement sont endommagés. Téléchargez-les à nouveau depuis l’e-mail envoyé par Meta.'],
  damaged: ['Le fichier ZIP est endommagé', 'Il n’a pas pu être ouvert. Si le téléchargement a été interrompu, recommencez-le ; le lien de l’e-mail de Meta reste actif quelques jours.'],
  truncated: ['Le fichier ZIP est incomplet', 'Sa fin est absente, ce qui arrive quand un téléchargement s’arrête en route. Téléchargez-le à nouveau depuis l’e-mail envoyé par Meta.'],
  encrypted: ['Le ZIP est protégé par un mot de passe', 'Meta n’ajoute jamais de mot de passe à ses téléchargements, donc ce fichier a été modifié après coup. Utilisez le fichier d’origine.'],
  whatsapp: ['Ceci est un export de conversation WhatsApp', 'Readback ouvre les téléchargements Facebook Messenger et Instagram. Un export WhatsApp est un fichier texte que n’importe quel éditeur de texte ouvre.'],
  rar: ['Ceci est une archive RAR', 'Décompressez-la d’abord, puis choisissez le ZIP ou le dossier qu’elle contient.'],
  '7z': ['Ceci est une archive 7-Zip', 'Décompressez-la d’abord, puis choisissez le ZIP ou le dossier qu’elle contient.'],
  gzip: ['Ceci est une archive compressée que Readback n’ouvre pas', 'Décompressez-la d’abord, puis choisissez les fichiers qu’elle contient.'],
  'office-old': ['Ceci est un fichier Office, pas un téléchargement de conversations', 'Facebook et Instagram envoient vos messages dans un fichier ZIP.'],
  nothing: ['Aucun fichier choisi', 'Choisissez le ZIP de Facebook ou d’Instagram, son dossier décompressé, ou les fichiers message_1.json.'],
};
function showError(code, detail) {
  const [t, d] = ERRORS[code] || ['Les fichiers n’ont pas pu être ouverts', `Arrêt à : ${detail || code}. S’il s’agit d’un téléchargement Facebook ou Instagram, essayez de le télécharger à nouveau.`];
  $('error-title').textContent = t;
  $('error-text').textContent = d;
  stage('error');
  $('error-title').focus();
}

async function openFiles(list) {
  const files = [...list].filter(f => f && f.size !== undefined);
  if (!files.length) return showError('nothing');
  stage('busy');
  $('busy-sub').textContent = files.length === 1 ? `Lecture de ${files[0].name} dans votre navigateur.` : `Lecture de ${plural(files.length, 'file', 'files')} dans votre navigateur.`;
  $('busy-title').focus();
  await new Promise(r => setTimeout(r, 30));
  let r;
  try {
    const { records, odd } = await collect(files);
    if (!records.length) {
      const k = odd[0] ? odd[0].kind : 'nothing';
      return showError(k === 'text' || k === 'binary' ? 'not-chats' : k);
    }
    r = await openExport(records, { onProgress: (d, t) => { $('busy-sub').textContent = `Lecture des fichiers de conversation : ${num(d)} sur ${num(t)}.`; } });
  } catch (e) {
    return showError(e instanceof ExportError ? e.code : e && e.code ? e.code : 'other', e && e.message);
  }
  for (const u of urls) URL.revokeObjectURL(u);
  urls = [];
  result = r; owner = r.owner; current = -1; term = ''; lc = new Map();
  $('search').value = '';
  renderReader();
  stage('idle');
  $('reader').hidden = false;
  openChat(0, { focus: false });
  $('reader').scrollIntoView({ behavior: reduced() ? 'auto' : 'smooth', block: 'start' });
  $('reader-title').focus({ preventScroll: true });
}

/* ------------------------------------------------------------------ reader */
function renderReader() {
  const c = result.chats;
  const plats = result.platforms.map(p => PLATFORM_LABEL[p]).join(' et ');
  const enc = c.filter(x => x.encrypted).length;
  $('reader-meta').textContent = `${plural(c.length, 'chat', 'chats')}, ${plural(result.messageCount, 'message', 'messages')}, provenance : ${plats}${enc ? `; ${plural(enc, 'chat includes', 'chats include')} le téléchargement des conversations chiffrées` : ''}.${result.missingMedia ? ` ${plural(result.missingMedia, 'attachment is', 'attachments are')} dans le téléchargement, mais pas dans les fichiers que vous avez choisis.` : ''}`;
  const sel = $('owner');
  const names = new Map();
  for (const ch of c) for (const p of ch.participants) names.set(p, (names.get(p) || 0) + 1);
  sel.innerHTML = `<option value="">Personne (tout à gauche)</option>` + [...names.entries()].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0])).slice(0, 200).map(([n]) => `<option value="${esc(n)}"${n === owner ? ' selected' : ''}>${esc(n)}</option>`).join('');
  $('list').innerHTML = c.map((ch, i) => {
    const tags = [];
    if (result.platforms.length > 1) tags.push(PLATFORM_LABEL[ch.platform]);
    for (const f of ch.folders) if (['archived_threads', 'filtered_threads', 'message_requests'].includes(f)) tags.push(folderLabel(f));
    if (ch.encrypted) tags.push('partie chiffrée');
    return `<li><button type="button" class="rb-chat" data-i="${i}" aria-pressed="false"><span class="rb-chat-name">${esc(ch.title)}</span><span class="rb-chat-sub">${ch.last ? esc(fmtDate(ch.last, LOCALE)) : 'sans date'}, ${plural(ch.messages.length, 'message', 'messages')}${tags.length ? ` <em>${esc(tags.join(', '))}</em>` : ''}</span></button></li>`;
  }).join('');
}

function openChat(i, { at = null, focus = true } = {}) {
  const ch = result.chats[i];
  if (!ch) return;
  current = i;
  for (const b of document.querySelectorAll('#list .rb-chat')) { const on = Number(b.dataset.i) === i; b.classList.toggle('is-on', on); b.setAttribute('aria-pressed', on ? 'true' : 'false'); }
  $('results').hidden = true;
  $('chat').hidden = false;
  $('chat').classList.toggle('from-search', at != null && !!term);
  $('chat-title').textContent = ch.title;
  const span = ch.first ? `du ${fmtDate(ch.first, LOCALE)} au ${fmtDate(ch.last, LOCALE)}` : 'Sans dates';
  const tags = [PLATFORM_LABEL[ch.platform]];
  if (ch.group) tags.push('groupe');
  if (ch.encrypted && ch.regular) tags.push('téléchargements ordinaire et chiffré réunis sur une seule chronologie');
  else if (ch.encrypted) tags.push('issue du téléchargement des conversations chiffrées');
  $('chat-meta').textContent = `${span}. ${plural(ch.messages.length, 'message', 'messages')}${ch.mediaCount ? `, ${plural(ch.mediaCount, 'attachment', 'attachments')}` : ''}. ${tags.join(', ')}.`;
  $('chat-people').textContent = `Participants : ${ch.participants.join(', ') || 'inconnus'}`;
  // months for the jump list
  const months = [];
  let last = '';
  ch.messages.forEach((m, k) => { if (!m.ts) return; const d = new Date(m.ts); const key = `${d.getFullYear()}-${d.getMonth()}`; if (key !== last) { months.push({ k, label: d.toLocaleDateString(LOCALE, { year: 'numeric', month: 'long' }) }); last = key; } });
  $('month').innerHTML = months.map(o => `<option value="${o.k}">${esc(o.label)}</option>`).join('');
  $('month-wrap').hidden = months.length < 2;
  const target = at == null ? 0 : at;
  start = Math.max(0, Math.floor(target / PAGE) * PAGE);
  hitAt = at == null ? -1 : at;
  renderPage();
  if (at != null) {
    const el = document.getElementById('m' + at);
    if (el) el.scrollIntoView({ block: 'center', behavior: reduced() ? 'auto' : 'smooth' });
  } else if (focus) {
    $('chat-title').focus({ preventScroll: true });
    if (matchMedia('(max-width: 860px)').matches) $('chat').scrollIntoView({ behavior: reduced() ? 'auto' : 'smooth', block: 'start' });
  }
}

function mediaSlot(x, i, j) {
  if (!x.rec) return `<span class="rb-missing">${esc(mediaLabel(x.type))} introuvable dans le téléchargement : ${esc(x.name)}</span>`;
  const key = `${current}:${i}:${j}`;
  const label = esc(mediaLabel(x.type));
  if (x.type === 'photo' || x.type === 'gif' || x.type === 'sticker') return `<span class="rb-slot rb-slot-img${x.type === 'sticker' ? ' rb-st' : ''}" data-media="${key}"><span class="rb-slot-label">${label}</span></span>`;
  if (x.type === 'video' || x.type === 'audio') return `<span class="rb-slot rb-slot-${x.type}" data-media="${key}"><span class="rb-slot-label">${label}</span></span>`;
  return `<button type="button" class="rb-file" data-file="${key}">${esc(x.name)}</button>`;
}
function mediaOf(key) {
  const [c, i, j] = key.split(':').map(Number);
  const m = result.chats[c] && result.chats[c].messages[i];
  return m && m.media[j];
}
async function fillSlot(el) {
  const x = mediaOf(el.dataset.media);
  if (!x || !x.rec || el.dataset.done) return;
  el.dataset.done = '1';
  try {
    const blob = await x.rec.blob(mimeOf(x.name));
    const u = URL.createObjectURL(blob);
    urls.push(u);
    if (x.type === 'video' || x.type === 'audio') {
      const v = document.createElement(x.type);
      v.controls = true; v.preload = 'metadata'; v.src = u;
      el.replaceChildren(v);
    } else {
      const img = document.createElement('img');
      img.alt = mediaLabel(x.type); img.src = u; img.decoding = 'async';
      const a = document.createElement('a');
      a.href = u; a.target = '_blank'; a.rel = 'noopener'; a.title = 'Ouvrir l’image en grand';
      a.appendChild(img);
      el.replaceChildren(a);
    }
    el.classList.add('is-loaded');
  } catch {
    el.replaceChildren(Object.assign(document.createElement('span'), { className: 'rb-missing', textContent: `${mediaLabel(x.type)} illisible : ${x.name}` }));
  }
}
function watchMedia(root) {
  if (observer) observer.disconnect();
  const slots = root.querySelectorAll('[data-media]');
  if (!('IntersectionObserver' in window)) { slots.forEach(fillSlot); return; }
  observer = new IntersectionObserver(es => { for (const e of es) if (e.isIntersecting) { observer.unobserve(e.target); fillSlot(e.target); } }, { rootMargin: '600px 0px' });
  slots.forEach(s => observer.observe(s));
}

function renderPage() {
  const ch = result.chats[current];
  const end = Math.min(ch.messages.length, start + PAGE);
  for (const u of urls) URL.revokeObjectURL(u);
  urls = [];
  $('messages').innerHTML = messagesHtml(ch, start, end, { owner, term, locale: LOCALE, media: mediaSlot, hit: hitAt });
  watchMedia($('messages'));
  const many = ch.messages.length > PAGE;
  $('pager').hidden = !many;
  $('pager-bottom').hidden = !many;
  const pos = `Messages ${num(start + 1)} à ${num(end)} sur ${num(ch.messages.length)}`;
  $('pager-pos').textContent = pos;
  $('pager-pos-2').textContent = pos;
  for (const id of ['btn-earlier', 'btn-earlier-2']) $(id).disabled = start === 0;
  for (const id of ['btn-later', 'btn-later-2']) $(id).disabled = end >= ch.messages.length;
  const sel = $('month');
  let best = 0;
  for (const o of sel.options) if (Number(o.value) <= start + PAGE - 1) best = o.index;
  sel.selectedIndex = best;
}
function page(delta) {
  const ch = result.chats[current];
  start = Math.min(Math.max(0, start + delta * PAGE), Math.max(0, Math.floor((ch.messages.length - 1) / PAGE) * PAGE));
  hitAt = -1;
  renderPage();
  $('chat').scrollIntoView({ behavior: 'auto', block: 'start' });
}

/* ------------------------------------------------------------------ search */
function chatLc(i) {
  if (!lc.has(i)) lc.set(i, result.chats[i].messages.map(searchText));
  return lc.get(i);
}
let searchTimer = 0;
function runSearch() {
  const q = $('search').value.trim();
  term = q.length >= 2 ? q : '';
  if (!term) {
    $('search-note').hidden = true;
    $('results').hidden = true;
    $('chat').hidden = false;
    if (current >= 0) renderPage();
    return;
  }
  const t = term.toLowerCase();
  const hits = [];
  let total = 0;
  const chatsHit = new Set();
  result.chats.forEach((ch, i) => {
    const l = chatLc(i);
    for (let k = 0; k < l.length; k++) if (l[k].includes(t)) { total++; chatsHit.add(i); if (hits.length < 200) hits.push([i, k]); }
  });
  $('search-note').hidden = false;
  $('search-note').textContent = total ? `${plural(total, 'message matches', 'messages match')} à votre recherche, dans ${plural(chatsHit.size, 'chat', 'chats')}.${total > 200 ? ' Les 200 premiers sont listés.' : ''}` : 'Aucun message ne correspond. La recherche porte sur le texte des messages, les liens et les noms de fichiers.';
  $('results').hidden = false;
  $('chat').hidden = true;
  $('results-list').innerHTML = hits.map(([i, k]) => {
    const ch = result.chats[i], m = ch.messages[k];
    const s = (m.text || (m.share && m.share.text) || m.media.map(x => x.name).join(' ') || '');
    const at = s.toLowerCase().indexOf(t);
    const from = Math.max(0, at - 60);
    const snippet = (from ? '...' : '') + s.slice(from, at + t.length + 90);
    return `<li><button type="button" class="rb-hit" data-i="${i}" data-k="${k}"><span class="rb-hit-head">${esc(ch.title)}, ${m.ts ? esc(fmtDate(m.ts, LOCALE)) : 'sans date'}, ${esc(m.sender || '')}</span><span class="rb-hit-text">${markHtml(snippet, term)}</span></button></li>`;
  }).join('');
}
function markHtml(s, q) {
  const lcS = s.toLowerCase(), t = q.toLowerCase();
  let i = 0, out = '';
  for (let j = lcS.indexOf(t); j >= 0; j = lcS.indexOf(t, i)) { out += esc(s.slice(i, j)) + '<mark>' + esc(s.slice(j, j + t.length)) + '</mark>'; i = j + t.length; }
  return out + esc(s.slice(i));
}

/* ------------------------------------------------------------------ print and save */
async function printChat() {
  const ch = result.chats[current];
  if (!ch) return;
  if (ch.messages.length > 20000 && !confirm(`Cette conversation compte ${num(ch.messages.length)} messages. Tout imprimer peut prendre un moment. Continuer ?`)) return;
  const area = $('print-area');
  area.innerHTML = `<h1>${esc(ch.title)}</h1><p class="rb-print-sub">${esc($('chat-meta').textContent)} ${esc($('chat-people').textContent)}</p>` + messagesHtml(ch, 0, ch.messages.length, { owner, locale: LOCALE, media: (x, i, j) => (x.type === 'photo' || x.type === 'gif' || x.type === 'sticker') && x.rec ? `<span class="rb-slot rb-slot-img" data-print="${current}:${i}:${j}"></span>` : x.rec ? `<span class="rb-missing">${esc(mediaLabel(x.type))}: ${esc(x.name)}</span>` : `<span class="rb-missing">${esc(mediaLabel(x.type))} introuvable dans le téléchargement : ${esc(x.name)}</span>` });
  const slots = [...area.querySelectorAll('[data-print]')].slice(0, 600);
  await Promise.all(slots.map(async el => {
    const x = mediaOf(el.dataset.print);
    try {
      const u = URL.createObjectURL(await x.rec.blob(mimeOf(x.name)));
      urls.push(u);
      const img = new Image();
      img.alt = mediaLabel(x.type);
      await new Promise(res => { img.onload = img.onerror = res; img.src = u; setTimeout(res, 4000); });
      el.replaceChildren(img);
    } catch { /* leave the slot empty */ }
  }));
  document.body.classList.add('rb-printing');
  const done = () => { document.body.classList.remove('rb-printing'); area.innerHTML = ''; window.removeEventListener('afterprint', done); };
  window.addEventListener('afterprint', done);
  window.print();
  setTimeout(() => { if (!matchMedia('print').matches) done(); }, 1500);
}
function saveText() {
  const ch = result.chats[current];
  if (!ch) return;
  download(`${safeName(ch.title)}.txt`, chatText(ch), 'text/plain;charset=utf-8');
  toast('Conversation enregistrée en fichier texte.');
}
async function saveAll(kind) {
  if (!result) return;
  if (!needPro(kind === 'csv' ? 'Le tableur de tous les messages fait partie de Readback Pro.' : 'Enregistrer toutes les conversations avec leurs photos d’un coup fait partie de Readback Pro.')) return;
  const note = $('save-note');
  try {
    if (kind === 'csv') {
      download('messages.csv', csvAll(result.chats), 'text/csv;charset=utf-8');
      note.textContent = 'Fichier messages.csv enregistré.';
    } else {
      note.textContent = 'Création de l’archive…';
      const blob = await archiveZip(result, { owner, locale: LOCALE, progress: (d, t) => { note.textContent = `Écriture de la conversation ${num(d)} sur ${num(t)}…`; } });
      download('readback-chats.zip', blob);
      note.textContent = `Fichier readback-chats.zip enregistré (${(blob.size / 1048576).toFixed(1).replace(".", ",")} Mo). Ouvrez index.html à l’intérieur.`;
    }
  } catch (e) {
    note.textContent = `Enregistrement interrompu : ${e && e.message ? e.message : e}`;
  }
}

/* ------------------------------------------------------------------ drop, choose, folders */
async function filesFromDrop(dt) {
  const items = dt.items ? [...dt.items] : [];
  const entries = items.map(i => (i.webkitGetAsEntry ? i.webkitGetAsEntry() : null)).filter(Boolean);
  if (!entries.length || !entries.some(e => e.isDirectory)) return [...dt.files];
  const out = [];
  const walk = async (entry, prefix) => {
    if (entry.isFile) {
      const f = await new Promise((res, rej) => entry.file(res, rej));
      f._path = prefix + f.name;
      out.push(f);
    } else if (entry.isDirectory) {
      const reader = entry.createReader();
      let batch;
      do {
        batch = await new Promise((res, rej) => reader.readEntries(res, rej));
        for (const e of batch) await walk(e, prefix + entry.name + '/');
      } while (batch.length);
    }
  };
  for (const e of entries) await walk(e, '');
  return out;
}

function wire() {
  setupPro();
  proNote();
  $('btn-choose').addEventListener('click', () => $('file-input').click());
  $('btn-folder').addEventListener('click', () => $('folder-input').click());
  $('file-input').addEventListener('change', e => { openFiles(e.target.files); e.target.value = ''; });
  $('folder-input').addEventListener('change', e => { openFiles(e.target.files); e.target.value = ''; });
  const sample = async () => { const { sampleBytes, SAMPLE_NAME } = await import('./sample.js'); openFiles([new File([sampleBytes()], SAMPLE_NAME, { type: 'application/zip' })]); };
  $('btn-sample').addEventListener('click', sample);
  $('btn-error-sample').addEventListener('click', sample);
  $('btn-retry').addEventListener('click', () => { stage('idle'); $('btn-choose').focus(); });
  $('btn-another').addEventListener('click', () => { $('reader').hidden = true; stage('idle'); $('panel').scrollIntoView({ behavior: reduced() ? 'auto' : 'smooth', block: 'center' }); $('btn-choose').focus({ preventScroll: true }); });
  const drop = $('drop');
  for (const ev of ['dragenter', 'dragover']) drop.addEventListener(ev, e => { e.preventDefault(); drop.classList.add('is-over'); });
  for (const ev of ['dragleave', 'drop']) drop.addEventListener(ev, () => drop.classList.remove('is-over'));
  drop.addEventListener('drop', async e => { e.preventDefault(); openFiles(await filesFromDrop(e.dataTransfer)); });
  $('list').addEventListener('click', e => { const b = e.target.closest('.rb-chat'); if (b) { $('search').value = ''; term = ''; $('search-note').hidden = true; openChat(Number(b.dataset.i)); } });
  $('results-list').addEventListener('click', e => { const b = e.target.closest('.rb-hit'); if (b) openChat(Number(b.dataset.i), { at: Number(b.dataset.k) }); });
  $('search').addEventListener('input', () => { clearTimeout(searchTimer); searchTimer = setTimeout(runSearch, 220); });
  $('btn-back').addEventListener('click', () => { $('results').hidden = false; $('chat').hidden = true; });
  $('owner').addEventListener('change', e => { owner = e.target.value || null; if (current >= 0) renderPage(); });
  for (const id of ['btn-earlier', 'btn-earlier-2']) $(id).addEventListener('click', () => page(-1));
  for (const id of ['btn-later', 'btn-later-2']) $(id).addEventListener('click', () => page(1));
  $('month').addEventListener('change', e => { start = Math.floor(Number(e.target.value) / PAGE) * PAGE; hitAt = Number(e.target.value); renderPage(); const el = document.getElementById('m' + e.target.value); if (el) el.scrollIntoView({ block: 'start' }); });
  $('btn-print').addEventListener('click', printChat);
  $('btn-text').addEventListener('click', saveText);
  document.querySelectorAll('[data-pro]').forEach(b => b.addEventListener('click', () => saveAll(b.dataset.pro)));
  $('messages').addEventListener('click', e => {
    const b = e.target.closest('[data-file]');
    if (!b) return;
    const x = mediaOf(b.dataset.file);
    if (x && x.rec) x.rec.blob(mimeOf(x.name)).then(bl => download(x.name, bl));
  });
}

if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', wire); else wire();
