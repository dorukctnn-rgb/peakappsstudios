/* Skillcase worker: reads your ChatGPT data export and the files you add (a Word file is read to turn it into text for
 * the Gemini skill) and builds the ZIP files you save, in this browser tab. It makes no
 * network request; nothing it reads is stored or sent anywhere, and your files are only read, never changed. From an
 * export it keeps only the chats with GPTs and projects, already flattened, and only while this tab is open. */
import { strFromU8 } from '../vendor/fflate.js';
import { isZip, readIndex, readEntryBytes } from './zipread.js';
import * as E from './engine.js';
import { sampleExport, sampleFiles, sampleGemFiles, allSampleFiles, SAMPLE_GPT, SAMPLE_GEM } from './sample.js';

export const MAX_JSON = 500 * 1024 * 1024; // a browser cannot hold a much longer text in one piece
const MAX_FILES_TOTAL = 600 * 1024 * 1024;
const CONV_RE = /(^|\/)conversations(-\d+)?\.json$/i;
let groups = new Map(); // id -> { id, kind, chats, mentions }
let sample = false;
const post = (type, data) => self.postMessage(Object.assign({ type }, data));
const fail = (code, extra = {}) => Object.assign(new Error(code), { code }, extra);

async function textOf(file) {
  if (file.size > MAX_JSON) throw fail('toobig');
  return strFromU8(new Uint8Array(await file.arrayBuffer()));
}
async function readExport(files, onStep) {
  const convs = [], sources = [], problems = [];
  for (const f of files) {
    const name = String(f.name || 'file').slice(0, 200);
    try {
      if (await isZip(f)) {
        const { entries } = await readIndex(f);
        const wanted = entries.filter(e => !e.dir && CONV_RE.test(e.name)).sort((a, b) => a.name.localeCompare(b.name));
        if (!wanted.length) { problems.push({ name, code: entries.some(e => /(^|\/)SKILL\.md$/i.test(e.name) || /gpt\.json$/i.test(e.name)) ? 'ourzip' : 'noconv' }); continue; }
        for (const e of wanted) {
          if (e.size > MAX_JSON) { problems.push({ name: `${name} > ${e.name}`, code: 'toobig' }); continue; }
          onStep(`Reading ${e.name.split('/').pop()}`);
          const bytes = await readEntryBytes(f, e);
          convs.push(...E.parseConversations(strFromU8(bytes)));
          sources.push(`${name} > ${e.name}`);
        }
      } else if (/\.json$/i.test(name) || f.type === 'application/json') {
        onStep(`Reading ${name}`);
        convs.push(...E.parseConversations(await textOf(f)));
        sources.push(name);
      } else problems.push({ name, code: 'notexport' });
    } catch (e) {
      problems.push({ name, code: e && e.code ? e.code : 'internal' });
    }
  }
  return { convs, sources, problems };
}

function remember(result, isSample) {
  groups = new Map(result.groups.map(g => [g.id, g]));
  sample = isSample;
  return { groups: result.groups.map(E.groupSummary), total: result.total, plain: result.plain, sample: isSample };
}

/** the chats of the chosen GPTs and projects, newest first, each once (a chat can be both "with" and "mention") */
function chatsFor(ids) {
  const seen = new Set(), out = [];
  for (const id of ids || []) {
    const g = groups.get(id);
    if (!g) continue;
    for (const c of g.chats.concat(g.mentions)) { const key = c.id || c.title + c.created; if (!seen.has(key)) { seen.add(key); out.push(c); } }
  }
  return out.sort((a, b) => (b.updated || b.created || 0) - (a.updated || a.created || 0));
}

async function filesOf(list) {
  let total = 0;
  const out = [];
  for (const f of list || []) {
    if (f.sample) { out.push(...allSampleFiles().filter(s => s.name === f.name)); continue; }
    total += f.file.size;
    if (total > MAX_FILES_TOTAL) throw fail('filestoobig');
    out.push({ name: f.name, type: f.file.type || '', bytes: new Uint8Array(await f.file.arrayBuffer()) });
  }
  return out;
}

const blob = (bytes, type = 'application/zip') => new Blob([bytes], { type });
// plain text or not, from the file's name and its first 8 KB (remembered per file, so typing does not re-read files)
const plainCache = new Map();
async function plainOf(f) {
  if (f.sample) return f.plain;
  const key = `${f.name}|${f.size}|${f.file && f.file.lastModified}`;
  if (!plainCache.has(key)) plainCache.set(key, E.isPlainText(f.name, new Uint8Array(await f.file.slice(0, 8192).arrayBuffer())));
  return plainCache.get(key);
}

self.onmessage = async ev => {
  const m = ev.data || {};
  try {
    if (m.type === 'chats') {
      const r = await readExport(m.files || [], step => post('step', { text: step }));
      if (!r.convs.length) { post('chats-failed', { problems: r.problems, empty: r.sources.length > 0 }); return; }
      post('chats', { data: Object.assign(remember(E.collectGizmoChats(r.convs), false), { sources: r.sources, problems: r.problems }) });
      return;
    }
    if (m.type === 'sample-chats') {
      post('chats', { data: Object.assign(remember(E.collectGizmoChats(sampleExport()), true), { sources: ['sample'], problems: [] }) });
      return;
    }
    if (m.type === 'clear-chats') { groups = new Map(); sample = false; return; }
    if (m.type === 'sample-gpt') {
      post('sample-gpt', { gpt: SAMPLE_GPT, files: sampleFiles().map(f => ({ name: f.name, size: f.bytes.length, type: f.type, plain: E.isPlainText(f.name, f.bytes), sample: true })) });
      post('chats', { data: Object.assign(remember(E.collectGizmoChats(sampleExport()), true), { sources: ['sample'], problems: [] }) });
      return;
    }
    if (m.type === 'sample-gem') {
      post('sample-gem', { gem: SAMPLE_GEM, files: sampleGemFiles().map(f => ({ name: f.name, size: f.bytes.length, type: f.type, plain: E.isPlainText(f.name, f.bytes), sample: true })) });
      return;
    }
    if (m.type === 'preview') {
      const g = E.normalizeGpt(m.gpt);
      const files = [];
      for (const f of m.files || []) files.push({ key: f.key, name: f.name, size: f.size, plain: await plainOf(f) });
      const moved = g.source === 'gem' ? E.gemMovePlan(files) : [];
      post('preview', {
        seq: m.seq,
        // a Gem's preview is its Gemini skill (where it is going first); a GPT's is the skill for Claude and ChatGPT
        text: E.skillMd(g, { files: files.map(f => ({ name: f.name, size: f.size, plain: f.plain })), variant: g.source === 'gem' ? 'gemini' : 'claude', today: m.today }),
        actions: (m.gpt.actions || []).map(a => { const s = E.summarizeSchema(a.schema); return { format: s.format, valid: s.valid, title: s.title, version: s.version, servers: s.servers, operations: s.operations.length, error: s.error || '', secret: E.looksSecret(a.schema) || E.looksSecret(a.privacy) }; }),
        secret: E.looksSecret(m.gpt.instructions) || E.looksSecret(m.gpt.description) || E.looksSecret(m.gpt.starters),
        long: E.skillBodyLines(g) > E.SKILL_BODY_LINES,
        files: files.map((f, i) => ({ key: f.key, plain: f.plain, gemini: E.geminiUpload(f.name, null, f.plain), moved: (moved.find(x => x.index === i) || {}).why || '' })),
        skillName: E.skillNameOf(g),
      });
      return;
    }
    if (m.type === 'build') {
      const g = E.normalizeGpt(m.gpt);
      const today = m.today || '';
      const name = E.skillNameOf(g);
      if (m.kind === 'chats') {
        const entries = {};
        for (const id of m.chatIds || []) {
          const label = (m.labels && m.labels[id]) || id;
          Object.assign(entries, E.chatsEntries(chatsFor([id]), { label, folder: `${label}` === id ? id : `${label}` }));
        }
        if (!Object.keys(entries).length) throw fail('nochats');
        post('result', { id: m.id, blob: blob(E.zipEntries(entries)), name: `gpt-chats-${today || 'saved'}.zip` });
        return;
      }
      const files = await filesOf(m.files);
      const chats = chatsFor(m.chatIds);
      const label = (m.labels && m.chatIds && m.labels[m.chatIds[0]]) || E.gptLabel(g);
      if (m.kind === 'backup') {
        const entries = E.backupEntries(g, { files, chats, label, today, checked: m.checked || '' });
        post('result', { id: m.id, blob: blob(E.zipEntries(entries)), name: `${name}-${g.source === 'gem' ? 'gem' : 'gpt'}-backup-${today || 'saved'}.zip` });
      } else if (m.kind === 'claude') {
        post('result', { id: m.id, blob: blob(E.zipEntries(E.skillEntries(g, { files, variant: 'claude', today }))), name: `${name}-skill-claude-chatgpt.zip` });
      } else if (m.kind === 'gemini') {
        post('result', { id: m.id, blob: blob(E.zipEntries(E.skillEntries(g, { files, variant: 'gemini', today }))), name: `${name}-skill-gemini.zip` });
      } else if (m.kind === 'modelfile') {
        post('result', { id: m.id, blob: blob(E.modelfile(g, { today }), 'application/octet-stream'), name: 'Modelfile' }); // octet-stream, so no browser adds .txt
      } else throw fail('unknown');
      return;
    }
  } catch (e) {
    post('error', { id: m.id, code: e && e.code ? e.code : 'internal', detail: String(e && e.message || e).slice(0, 200) });
  }
};
