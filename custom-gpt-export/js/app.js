/* Skillcase page logic. What you type stays in this page; the files and the ChatGPT export you pick go to the worker
 * (worker.js) in this tab, which reads them and builds the ZIP files. The page makes no network request of its own:
 * nothing is uploaded or stored, and your files are never changed. Pro is not part of this version. The page packs a
 * custom GPT or, with "A Gemini Gem" ticked (or ?from=gem in the address), a Gemini Gem. */
const $ = id => document.getElementById(id);
const nf = new Intl.NumberFormat('en-US');
const fDay = new Intl.DateTimeFormat('en-US', { month: 'long', day: 'numeric', year: 'numeric', timeZone: 'UTC' });
const plural = (n, one, many) => `${nf.format(n)} ${n === 1 ? one : many}`;
const esc = s => String(s == null ? '' : s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
const today = () => { const d = new Date(); return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`; };
const CHECKED = 'October 27, 2026';
const size = b => b >= 1048576 ? `${(b / 1048576).toFixed(1)} MB` : b >= 1024 ? `${Math.round(b / 1024)} KB` : `${b} bytes`;
const dayOfT = t => (t == null ? '' : fDay.format(new Date(t < 1e11 ? t * 1000 : t)));

const state = { mode: 'gpt', files: [], fileSeq: 0, info: {}, chats: null, pick: '', only: new Set(), labels: {}, sample: false, dirty: false, skillName: 'my-gpt' };
const gemMode = () => state.mode === 'gem';
let worker = null, seq = 0, previewSeq = 0, previewTimer = 0;
const waiting = new Map();

/* ---------- the worker ---------- */
function getWorker() {
  if (worker) return worker;
  try { worker = new Worker(new URL('./worker.js', import.meta.url), { type: 'module' }); } catch (e) { return null; }
  worker.onmessage = onWorker;
  worker.onerror = e => { if (e.preventDefault) e.preventDefault(); say('dl-status', 'This browser could not start the part of the page that builds the files. Try a current Chrome, Edge, Firefox or Safari.', true); };
  return worker;
}
function call(msg) {
  const w = getWorker();
  if (!w) return Promise.reject(Object.assign(new Error('noworker'), { code: 'noworker' }));
  const id = ++seq;
  return new Promise((resolve, reject) => { waiting.set(id, { resolve, reject }); w.postMessage(Object.assign({ id }, msg)); });
}
function onWorker(ev) {
  const m = ev.data || {};
  if (m.id != null && waiting.has(m.id) && (m.type === 'result' || m.type === 'error')) {
    const w = waiting.get(m.id);
    waiting.delete(m.id);
    if (m.type === 'error') w.reject(Object.assign(new Error(m.detail || m.code), { code: m.code })); else w.resolve(m);
    return;
  }
  if (m.type === 'preview') showPreview(m);
  else if (m.type === 'sample-gpt') fillSample(m);
  else if (m.type === 'sample-gem') fillSampleGem(m);
  else if (m.type === 'chats') showChats(m.data);
  else if (m.type === 'chats-failed') chatsFailed(m);
  else if (m.type === 'step') say('chats-status', m.text);
  else if (m.type === 'error') say('chats-status', 'Something went wrong while reading the export. Try again, or try the file in another browser.', true);
}
function say(id, text, bad = false) { const el = $(id); el.textContent = text; el.classList.toggle('is-bad', !!bad); }

/* ---------- the form ---------- */
const form = $('your-gpt');
function gptId() {
  const v = $('f-link').value.trim();
  const m = /(?:^|\/g\/|\s)(g-[A-Za-z0-9]{4,})/.exec(v) || /^(g-[A-Za-z0-9]{4,})/.exec(v);
  return m ? m[1] : '';
}
function actionBlocks() { return [...document.querySelectorAll('.sc-action')]; }
function gptInput() {
  return {
    name: $('f-name').value, description: $('f-desc').value, instructions: $('f-instr').value, starters: $('f-starters').value,
    capabilities: Object.fromEntries([...form.querySelectorAll('input[name="cap"]')].map(c => [c.value, c.checked])),
    actions: actionBlocks().map(b => ({ schema: b.querySelector('textarea').value, auth: b.querySelector('select').value, privacy: b.querySelector('input').value })),
    gptId: gptId(),
    source: state.mode,
    gemTools: [...form.querySelectorAll('input[name="gemtool"]:checked')].map(c => c.value),
  };
}
const fileMsg = () => state.files.map(f => ({ key: f.key, name: f.name, size: f.size, type: f.type, file: f.file, sample: f.sample, plain: f.plain }));

/* ---------- a GPT or a Gem ---------- */
const swaps = [...document.querySelectorAll('[data-gem]')];
swaps.forEach(el => { el.dataset.gpt = el.textContent; });
function setMode(mode, { push = true } = {}) {
  state.mode = mode === 'gem' ? 'gem' : 'gpt';
  document.body.dataset.mode = state.mode;
  const radio = document.querySelector(`input[name="mode"][value="${state.mode}"]`);
  if (radio) radio.checked = true;
  swaps.forEach(el => { el.textContent = gemMode() ? el.dataset.gem : el.dataset.gpt; });
  if (push && history.replaceState) {
    const u = new URL(location.href);
    if (gemMode()) u.searchParams.set('from', 'gem'); else u.searchParams.delete('from');
    history.replaceState(null, '', u.pathname + u.search + u.hash);
  }
  renderFiles();
  // on load there is nothing to preview yet, so the worker is not started until the page is used
  if (push) changed(false); else renderManifest();
}

function addAction(a = {}) {
  const n = actionBlocks().length + 1;
  const box = document.createElement('div');
  box.className = 'sc-action';
  const id = `act-${Date.now().toString(36)}-${n}`;
  box.innerHTML = `<div class="sc-action-head"><p class="sc-label">Action <span class="sc-act-n">${n}</span></p><button type="button" class="btn sc-quiet sc-remove">Remove</button></div>
<label for="${id}-s" class="sr-only">Schema of action ${n}</label>
<textarea class="input sc-mono" id="${id}-s" rows="7" spellcheck="false" placeholder="Paste the OpenAPI schema (JSON or YAML)"></textarea>
<p class="sc-meta sc-act-sum" aria-live="polite"></p>
<div class="sc-two">
<label for="${id}-a">Authentication<select class="select" id="${id}-a"><option value="unknown">Not sure</option><option value="none">None</option><option value="api_key">API key</option><option value="oauth">OAuth</option></select></label>
<label for="${id}-p">Privacy policy link<input class="input" id="${id}-p" inputmode="url" spellcheck="false"></label>
</div>`;
  box.querySelector('textarea').value = a.schema || '';
  box.querySelector('select').value = a.auth || 'unknown';
  box.querySelector('input').value = a.privacy || '';
  box.querySelector('.sc-remove').addEventListener('click', () => { box.remove(); renumber(); changed(); $('btn-action').focus(); });
  $('actions').appendChild(box);
  return box;
}
function renumber() { actionBlocks().forEach((b, i) => { b.querySelector('.sc-act-n').textContent = String(i + 1); }); }

function fileChips(key) {
  const i = state.info[key];
  if (!i) return '';
  const chips = [];
  if (gemMode() && i.moved) chips.push(`<span class="sc-chip sc-chip-warn">Google's move leaves it out (${esc(i.moved)}): kept in the backup</span>`);
  if (i.gemini === 'convert') chips.push('<span class="sc-chip sc-chip-note">Word file: turned into text for the Gemini skill</span>');
  else if (i.gemini === 'no' && !(gemMode() && i.moved)) chips.push('<span class="sc-chip sc-chip-warn">a file type Gemini skills do not take: left out of the Gemini skill</span>');
  return chips.join('');
}
const movedCount = () => state.files.filter(f => state.info[f.key] && state.info[f.key].moved).length;
function renderFiles() {
  $('files-list').innerHTML = state.files.map(f => `<li data-key="${f.key}"><span class="sc-file-name">${esc(f.name)}</span><span class="sc-file-meta">${size(f.size)}${fileChips(f.key)}</span><button type="button" class="btn sc-quiet sc-remove" data-remove="${f.key}" aria-label="Remove ${esc(f.name)}">Remove</button></li>`).join('');
  const moved = movedCount();
  const note = $('moved-note');
  note.hidden = !(gemMode() && moved);
  const which = moved === state.files.length ? (moved === 1 ? 'this file' : `all ${nf.format(moved)} of these files`) : `${nf.format(moved)} of these files`;
  note.textContent = moved ? `Google's move to skills leaves ${which} out. Your copies stay in the backup's knowledge folder; on personal accounts the Gem and its files are removed on December 17, 2026.` : '';
}
function addFiles(list) {
  for (const file of [...(list || [])]) {
    if (!file || !file.name) continue;
    state.files.push({ key: `f${++state.fileSeq}`, name: file.name, size: file.size, type: file.type || '', file });
  }
  renderFiles();
  changed();
}

/* ---------- the case: manifest, preview ---------- */
function chatCount() {
  if (gemMode() || !state.chats || !state.pick) return 0;
  const g = state.chats.groups.find(x => x.id === state.pick);
  return g ? g.chats + g.mentions : 0;
}
function renderManifest() {
  const v = gptInput();
  const starters = v.starters.split(/\r?\n/).filter(s => s.trim()).length;
  const acts = v.actions.filter(a => a.schema.trim()).length;
  const head = [
    ['Name', v.name.trim() ? 'in' : 'empty', v.name.trim() ? esc(v.name.trim().slice(0, 40)) : ''],
    ['Description', v.description.trim() ? 'in' : 'empty', ''],
    ['Instructions', v.instructions.trim() ? 'in' : 'empty', v.instructions.trim() ? `${nf.format(v.instructions.length)} characters` : ''],
  ];
  const files = ['Knowledge files', state.files.length ? 'in' : 'empty', state.files.length ? nf.format(state.files.length) : ''];
  const moved = movedCount();
  const rows = gemMode() ? [...head, files,
    ['Files Google\'s move leaves out', !state.files.length ? 'empty' : moved ? 'rebuild' : 'in', moved ? nf.format(moved) : '', !state.files.length ? 'Not added' : moved ? 'Kept here only' : 'None'],
    ['Gemini tools', v.gemTools.length ? 'rebuild' : 'empty', v.gemTools.length ? nf.format(v.gemTools.length) : '', v.gemTools.length ? 'Not in skills yet' : 'None ticked'],
  ] : [...head,
    ['Conversation starters', starters ? 'in' : 'empty', starters ? nf.format(starters) : ''],
    files,
    ['Action schemas', acts ? 'rebuild' : 'empty', acts ? nf.format(acts) : ''],
    ['Chats with the GPT', chatCount() ? 'in' : 'empty', chatCount() ? nf.format(chatCount()) : ''],
  ];
  const word = { in: 'Packed', empty: 'Not added', rebuild: 'Packed, rebuild later' };
  $('manifest').innerHTML = rows.map(([label, st, detail, chip]) => `<li class="is-${st}"><span class="sc-m-label">${label}${detail ? ` <span class="sc-m-detail">${detail}</span>` : ''}</span><span class="sc-chip">${chip || word[st]}</span></li>`).join('');
  $('instr-count').textContent = `${nf.format(v.instructions.length)} characters, ${nf.format(v.instructions ? v.instructions.split('\n').length : 0)} lines`;
}
function changed(dirty = true) {
  if (dirty) state.dirty = true;
  if ($('dl-status').classList.contains('is-bad')) say('dl-status', '');
  renderManifest();
  clearTimeout(previewTimer);
  previewTimer = setTimeout(() => {
    const w = getWorker();
    if (w) w.postMessage({ type: 'preview', seq: ++previewSeq, gpt: gptInput(), files: fileMsg(), today: today() });
  }, 250);
}
function showPreview(m) {
  if (m.seq !== previewSeq) return;
  $('preview').textContent = m.text;
  state.skillName = m.skillName;
  $('instr-long').hidden = !m.long;
  for (const f of m.files || []) state.info[f.key] = { plain: f.plain, gemini: f.gemini, moved: f.moved };
  renderFiles();
  renderManifest();
  actionBlocks().forEach((b, i) => {
    const a = m.actions[i];
    const el = b.querySelector('.sc-act-sum');
    if (!a || !b.querySelector('textarea').value.trim()) { el.textContent = ''; el.classList.remove('is-bad'); return; }
    let t;
    if (a.error) t = a.error;
    else if (a.valid) t = `OpenAPI ${a.version}${a.title ? `, "${a.title}"` : ''}, ${plural(a.operations, 'operation', 'operations')}${a.servers.length ? ` on ${a.servers[0].replace(/^https?:\/\//, '')}` : ''}. Saved exactly as pasted.`;
    else t = `This does not look like a full OpenAPI schema (${a.format === 'yaml' ? 'YAML' : a.format === 'json' ? 'JSON' : 'text'}). It is saved exactly as pasted.`;
    if (a.secret) t += ' It looks like it holds a key or token: remove it before you download.';
    el.textContent = t;
    el.classList.toggle('is-bad', !!(a.error || a.secret));
  });
  const warn = $('secret-warn');
  if (warn) warn.hidden = !m.secret;
}

/* ---------- the sample ---------- */
function fillSample(m) {
  const g = m.gpt;
  $('f-name').value = g.name; $('f-desc').value = g.description; $('f-instr').value = g.instructions; $('f-starters').value = g.starters.join('\n');
  form.querySelectorAll('input[name="cap"]').forEach(c => { c.checked = !!g.capabilities[c.value]; });
  $('actions').innerHTML = '';
  g.actions.forEach(a => addAction(a));
  $('f-link').value = `https://chatgpt.com/g/${g.gptId}-sourdough-coach`;
  state.files = m.files.map(f => ({ key: `f${++state.fileSeq}`, name: f.name, size: f.size, type: f.type, sample: true, plain: f.plain }));
  state.sample = true;
  $('sample-tag').hidden = false;
  renderFiles();
  changed();
  state.dirty = false;
  $('gpt-h').focus({ preventScroll: true });
  $('your-gpt').scrollIntoView({ behavior: matchMedia('(prefers-reduced-motion: reduce)').matches ? 'auto' : 'smooth', block: 'start' });
}

function fillSampleGem(m) {
  const g = m.gem;
  $('f-name').value = g.name; $('f-desc').value = g.description; $('f-instr').value = g.instructions;
  form.querySelectorAll('input[name="gemtool"]').forEach(c => { c.checked = g.gemTools.includes(c.value); });
  state.files = m.files.map(f => ({ key: `f${++state.fileSeq}`, name: f.name, size: f.size, type: f.type, sample: true, plain: f.plain }));
  state.sample = true;
  $('sample-tag').hidden = false;
  renderFiles();
  changed();
  state.dirty = false;
  $('gpt-h').focus({ preventScroll: true });
  $('your-gpt').scrollIntoView({ behavior: matchMedia('(prefers-reduced-motion: reduce)').matches ? 'auto' : 'smooth', block: 'start' });
}

/* ---------- chats from the ChatGPT export ---------- */
const CHAT_ERRORS = {
  badjson: 'not complete or has a typing error',
  notexport: 'not a ChatGPT data export',
  noconv: 'a ZIP without a conversations file in it (is it the ChatGPT export?)',
  ourzip: 'a Skillcase backup or a skill, not the ChatGPT export',
  toobig: 'too large for the browser (over 500 MB of chats in one file)',
  truncated: 'cut off at the end: the download may have stopped early',
  corrupt: 'damaged',
  password: 'locked with a password',
  read: 'not readable by the browser',
  unsupported: 'packed in a way this page cannot open',
  notzip: 'not a ZIP',
  internal: 'not readable',
};
function openChats(list) {
  const files = [...(list || [])].filter(Boolean);
  if (!files.length) return;
  const w = getWorker();
  if (!w) return say('chats-status', 'This browser could not start the part of the page that reads the export.', true);
  say('chats-status', files.length === 1 ? `Opening ${files[0].name} on this device` : `Opening ${plural(files.length, 'file', 'files')} on this device`);
  w.postMessage({ type: 'chats', files });
}
function chatsFailed(m) {
  const lines = (m.problems || []).map(p => `${p.name.split(' > ').pop()} is ${CHAT_ERRORS[p.code] || CHAT_ERRORS.internal}.`);
  say('chats-status', m.empty ? 'The export opened, but it holds no chats.' : (lines.join(' ') || 'No chats were found.') + ' Open the ZIP from ChatGPT\'s export email, or the conversations.json inside it.', true);
}
function groupHtml(g, radio) {
  const span = g.first != null ? (dayOfT(g.first) === dayOfT(g.last) ? dayOfT(g.first) : `${dayOfT(g.first)} to ${dayOfT(g.last)}`) : '';
  const titles = g.titles.length ? `Latest: ${g.titles.slice(0, 3).map(t => `"${esc(t)}"`).join(', ')}` : '';
  const mentions = g.mentions ? ` Plus ${plural(g.mentions, 'chat', 'chats')} where you called it with @.` : '';
  const label = state.labels[g.id] || '';
  return `<div class="sc-gpt" data-id="${esc(g.id)}">
<div class="sc-gpt-top">${radio ? `<label class="sc-pick"><input type="radio" name="gpt-pick" value="${esc(g.id)}"${state.pick === g.id ? ' checked' : ''}> Put these chats in the backup</label>` : ''}<label class="sc-pick"><input type="checkbox" data-only="${esc(g.id)}"${state.only.has(g.id) ? ' checked' : ''}> Tick to save on its own</label></div>
<p class="sc-gpt-id"><span class="sc-mono">${esc(g.id)}</span> <a href="${esc(g.url)}" target="_blank" rel="noopener nofollow">Open it in ChatGPT</a></p>
<p class="sc-small">${plural(g.chats, 'chat', 'chats')}, ${plural(g.messages, 'message', 'messages')}${span ? `, ${span}` : ''}.${mentions}</p>
${titles ? `<p class="sc-small sc-titles">${titles}</p>` : ''}
<label class="sc-gpt-label">Name for its answers<input class="input" data-label="${esc(g.id)}" value="${esc(label)}" placeholder="${radio ? 'The GPT\'s name' : 'The project\'s name'}" spellcheck="false"></label>
</div>`;
}
function showChats(d) {
  state.chats = d;
  const gpts = d.groups.filter(g => g.kind === 'gpt');
  const projects = d.groups.filter(g => g.kind === 'project');
  const linked = gptId();
  if (!state.pick || !gpts.some(g => g.id === state.pick)) state.pick = linked && gpts.some(g => g.id === linked) ? linked : gpts.length === 1 ? gpts[0].id : '';
  if (d.sample && !state.labels[state.pick] && state.pick) state.labels[state.pick] = 'Sourdough Coach';
  $('chats-result').hidden = false;
  const notes = (d.problems || []).map(p => `${p.name.split(' > ').pop()} is ${CHAT_ERRORS[p.code] || CHAT_ERRORS.internal}.`).join(' ');
  $('chats-summary').textContent = `${d.sample ? 'Sample export, made up by Skillcase. ' : ''}${plural(d.total, 'chat', 'chats')} in the export: ${plural(gpts.length, 'GPT', 'GPTs')}, ${plural(projects.length, 'project', 'projects')}, ${plural(d.plain, 'other chat', 'other chats')} (left out).${notes ? ' ' + notes : ''}`;
  $('gpt-list').innerHTML = gpts.length ? `<label class="sc-pick sc-none"><input type="radio" name="gpt-pick" value=""${state.pick ? '' : ' checked'}> Leave chats out of the backup</label>` + gpts.map(g => groupHtml(g, true)).join('') : '<p class="sc-small">No chats with a GPT were found in this export.</p>';
  $('projects-box').hidden = !projects.length;
  $('projects-sum').textContent = `Also found: ${plural(projects.length, 'ChatGPT project', 'ChatGPT projects')} (their ids start with g-p-; they are not GPTs)`;
  $('project-list').innerHTML = projects.map(g => groupHtml(g, false)).join('');
  say('chats-status', gpts.length ? (state.pick ? 'Chats found. The ticked GPT\'s chats go into the backup.' : 'Chats found. Pick the GPT whose chats go into the backup.') : 'The export opened.');
  renderManifest();
}

/* ---------- downloads ---------- */
function download(blob, name) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url; a.download = name; document.body.appendChild(a); a.click(); a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 60000);
}
const BUILD_ERRORS = { filestoobig: 'The knowledge files add up to more than 600 MB, too much to pack in a browser tab. Leave the largest out and keep them next to the backup.', nochats: 'Tick at least one GPT or project first.', noworker: 'This browser could not start the part of the page that builds the files.' };
async function build(kind) {
  const v = gptInput();
  const hasAny = v.name.trim() || v.instructions.trim() || state.files.length || chatCount();
  if (kind === 'backup' && !hasAny) return say('dl-status', gemMode() ? 'The case is empty. Paste your Gem\'s instructions or add its files first.' : 'The case is empty. Paste your GPT\'s instructions, add files or open your ChatGPT export first.', true);
  if (kind !== 'backup' && !v.instructions.trim()) return say('dl-status', 'Paste the instructions first: the skill and the Modelfile are made from them.', true);
  const labels = Object.assign({}, state.labels);
  if (state.pick && !labels[state.pick] && v.name.trim()) labels[state.pick] = v.name.trim();
  say('dl-status', 'Packing on this device');
  try {
    const r = await call({ type: 'build', kind, gpt: v, files: fileMsg(), chatIds: !gemMode() && state.pick ? [state.pick] : [], labels, today: today(), checked: CHECKED });
    download(r.blob, r.name);
    state.dirty = false;
    say('dl-status', `Saved ${r.name} (${size(r.blob.size)}).`);
  } catch (e) {
    say('dl-status', BUILD_ERRORS[e.code] || 'Something went wrong while packing. Try again; if it happens again, try another browser.', true);
  }
}
async function buildChatsOnly() {
  const ids = [...state.only];
  if (!ids.length) return say('chats-status', 'Tick "Tick to save on its own" on at least one GPT or project first.', true);
  try {
    const r = await call({ type: 'build', kind: 'chats', gpt: {}, chatIds: ids, labels: state.labels, today: today() });
    download(r.blob, r.name);
    say('chats-status', `Saved ${r.name} (${size(r.blob.size)}).`);
  } catch (e) {
    say('chats-status', BUILD_ERRORS[e.code] || 'Something went wrong while packing the chats.', true);
  }
}
async function copyProject() {
  const v = gptInput();
  if (!v.instructions.trim()) return say('dl-status', 'Paste the instructions first.', true);
  try {
    await navigator.clipboard.writeText(v.instructions.replace(/\r\n?/g, '\n').replace(/^\n+|\n+$/g, ''));
    say('dl-status', state.files.length ? `Copied. Paste it into your Claude project's instructions, then upload the ${plural(state.files.length, 'knowledge file', 'knowledge files')} to the project.` : 'Copied. Paste it into your Claude project\'s instructions.');
  } catch {
    say('dl-status', 'This browser did not allow copying. Select the instructions box, copy it, and paste it into the project.', true);
  }
}

/* ---------- drop zones ---------- */
function dropZone(zone, onFiles) {
  zone.addEventListener('dragover', e => { e.preventDefault(); zone.classList.add('is-over'); });
  zone.addEventListener('dragleave', () => zone.classList.remove('is-over'));
  zone.addEventListener('drop', e => { e.preventDefault(); zone.classList.remove('is-over'); onFiles(e.dataTransfer && e.dataTransfer.files); });
}

/* ---------- wiring ---------- */
form.addEventListener('input', changed);
form.addEventListener('change', changed);
form.addEventListener('submit', e => e.preventDefault());
$('btn-action').addEventListener('click', () => { const b = addAction(); renumber(); changed(); b.querySelector('textarea').focus(); });
$('btn-files').addEventListener('click', () => $('files-input').click());
$('files-input').addEventListener('change', e => { addFiles(e.target.files); e.target.value = ''; });
$('files-list').addEventListener('click', e => {
  const key = e.target.closest('[data-remove]') && e.target.closest('[data-remove]').dataset.remove;
  if (!key) return;
  state.files = state.files.filter(f => f.key !== key);
  renderFiles(); changed(); $('btn-files').focus();
});
dropZone($('files-drop'), addFiles);
$('btn-chats').addEventListener('click', () => $('chats-input').click());
$('chats-input').addEventListener('change', e => { openChats(e.target.files); e.target.value = ''; });
dropZone($('chats-drop'), openChats);
$('chats-result').addEventListener('change', e => {
  const t = e.target;
  if (t.name === 'gpt-pick') { state.pick = t.value; renderManifest(); }
  else if (t.dataset.only) { if (t.checked) state.only.add(t.dataset.only); else state.only.delete(t.dataset.only); }
});
$('chats-result').addEventListener('input', e => { const t = e.target; if (t.dataset.label) state.labels[t.dataset.label] = t.value.trim(); });
$('btn-chats-only').addEventListener('click', buildChatsOnly);
$('btn-chats-clear').addEventListener('click', () => {
  state.chats = null; state.pick = ''; state.only.clear();
  $('chats-result').hidden = true; say('chats-status', 'The export is closed. Nothing from it is kept.');
  if (worker) worker.postMessage({ type: 'clear-chats' });
  renderManifest();
});
document.querySelectorAll('[data-kind]').forEach(b => b.addEventListener('click', () => build(b.dataset.kind)));
$('dl-project').addEventListener('click', copyProject);
function loadSample(kind) {
  const w = getWorker();
  if (!w) return;
  if (state.dirty && !confirm(`Replace what you typed with the sample ${kind === 'gem' ? 'Gem' : 'GPT'}?`)) return;
  if (state.mode !== kind) setMode(kind);
  w.postMessage({ type: kind === 'gem' ? 'sample-gem' : 'sample-gpt' });
}
$('btn-sample').addEventListener('click', () => loadSample('gpt'));
$('btn-sample-gem').addEventListener('click', () => loadSample('gem'));
$('mode').addEventListener('change', e => { if (e.target.name === 'mode') setMode(e.target.value); });
document.querySelectorAll('[data-mode-link]').forEach(a => a.addEventListener('click', e => {
  e.preventDefault();
  setMode(a.dataset.modeLink);
  $('tool').scrollIntoView({ behavior: matchMedia('(prefers-reduced-motion: reduce)').matches ? 'auto' : 'smooth', block: 'start' });
  const r = document.querySelector(`input[name="mode"][value="${state.mode}"]`);
  if (r) r.focus({ preventScroll: true });
}));
window.addEventListener('beforeunload', e => { if (state.dirty) { e.preventDefault(); e.returnValue = ''; } });
// the secret warning lives under the instructions box
{
  const p = document.createElement('p');
  p.className = 'sc-warn'; p.id = 'secret-warn'; p.hidden = true;
  p.textContent = 'Something here looks like a key or token. Remove it before you download: a backup should never hold one.';
  $('f-instr').closest('.sc-field').appendChild(p);
}
{
  const q = new URLSearchParams(location.search);
  setMode(q.get('from') === 'gem' || location.hash === '#gem' ? 'gem' : 'gpt', { push: false });
  state.dirty = false;
}
renderManifest();
