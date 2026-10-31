/* Splitlight: reads a Prism export in this tab. Takes what was chosen (the "Export all projects" ZIP, one project's ZIP,
 * several ZIPs, an unzipped folder or loose files), finds the projects in it, the chats folder and export-errors.json,
 * and checks each project the way Overleaf and a TeX run will see it. Nothing is uploaded; js/zip.js reads the ZIP from
 * the disk a piece at a time, and only text files are read in full. */
import { readZip, entryText, entryBlob, sniff, ZipError } from './zip.js';
import * as T from './tex.js';

export class ExportError extends Error {
  constructor(code, detail = '') { super(detail || code); this.code = code; this.detail = detail; }
}

/* Overleaf's limits, from its own documentation (docs.overleaf.com, "Plan limits" and "Uploading a project", read
 * October 30, 2026): 50 MB and 180 files per upload, 2,000 files per project, 7 MB of editable text per project and
 * 2 MB for one editable file. Parts are planned with a margin under the 50 MB. */
export const OVERLEAF = { uploadBytes: 50e6, partBytes: 48e6, uploadFiles: 180, projectFiles: 2000, editableBytes: 7e6, editableFile: 2e6 };

const JUNK = /(^|\/)(__MACOSX\/|\.DS_Store$|Thumbs\.db$|desktop\.ini$|\._[^/]*$|\.git\/|\.svn\/|\.Trash)/i;
const CHAT_DIR = /(^|\/)(conversations?|chats?|chat[-_ ]?history|threads)\//i;
const ERRORS_FILE = /(^|\/)export[-_ ]?errors?\.json$/i;
const READ_TEXT_MAX = 8e6;

/* ------------------------------------------------------------------ gathering what was chosen */
function pathOfFile(f) { return String(f._path || f.webkitRelativePath || f.name).replace(/\\/g, '/'); }
const stripZip = n => n.replace(/\.zip$/i, '');

/* A file of the export: { path, size, stored, entry?, file? } plus read helpers. stored = the bytes it takes inside a
 * ZIP we write (a ZIP entry keeps its compressed size; a loose file is stored as it is). */
function fromEntry(e, prefix = '') { return { path: prefix + e.name, size: e.size, stored: e.compSize, entry: e }; }
function fromFile(f, path) { return { path, size: f.size, stored: f.size, file: f }; }
export async function textOf(it) {
  if (it.entry) return entryText(it.entry);
  return new TextDecoder('utf-8').decode(new Uint8Array(await it.file.arrayBuffer()));
}
export async function blobOf(it, type = '') {
  if (it.entry) return entryBlob(it.entry, type);
  return type ? it.file.slice(0, it.file.size, type) : it.file;
}

/* Reads the chosen files into groups: { name, items }. A ZIP is one group; a ZIP inside a ZIP (a project exported on its
 * own and kept in the archive) becomes its own group; folders and loose files are one group. */
export async function collect(chosen, { label = '' } = {}) {
  const files = [...chosen];
  if (!files.length) throw new ExportError('nothing');
  const groups = [];
  const loose = [];
  for (const f of files) {
    const p = pathOfFile(f);
    const kind = files.length === 1 || /\.zip$/i.test(p) ? await sniff(f) : null;
    if (files.length === 1 && kind !== 'zip' && !/\.(tex|ltx)$/i.test(p)) throw new ExportError(`wrong-${kind}`, f.name);
    if (kind === 'zip' || /\.zip$/i.test(p)) {
      if (kind !== 'zip') continue;
      let z;
      try { z = await readZip(f); } catch (e) { if (files.length === 1) throw zipFail(e); continue; }
      if (z.entries.some(x => x.encrypted && !x.dir)) { if (files.length === 1) throw new ExportError('encrypted'); continue; }
      groups.push({ name: stripZip(f.name), items: z.entries.filter(x => !x.dir).map(x => fromEntry(x)) });
    } else loose.push(fromFile(f, p));
  }
  if (loose.length) groups.push({ name: label || commonTop(loose.map(i => i.path)) || 'chosen files', items: loose });
  /* ZIPs inside: open each as its own group (one level down) */
  const out = [];
  for (const g of groups) {
    const keep = [];
    for (const it of g.items) {
      if (/\.zip$/i.test(it.path) && !JUNK.test(it.path)) {
        try {
          const blob = await blobOf(it);
          if ((await sniff(blob)) !== 'zip') { keep.push(it); continue; }
          const z = await readZip(blob);
          out.push({ name: stripZip(T.baseOf(it.path)), items: z.entries.filter(x => !x.dir).map(x => fromEntry(x)), nested: it.path, parent: g.name });
        } catch { keep.push(it); }
      } else keep.push(it);
    }
    out.unshift({ ...g, items: keep });
  }
  const all = out.filter(g => g.items.length);
  if (!all.length) throw new ExportError('empty');
  return all;
}
function commonTop(paths) {
  const tops = new Set(paths.map(p => (p.includes('/') ? p.split('/')[0] : '')));
  return tops.size === 1 ? [...tops][0] : '';
}
function zipFail(e) {
  if (e instanceof ZipError) return new ExportError(e.code === 'truncated' || e.code === 'not-zip' ? 'truncated' : e.code === 'encrypted' ? 'encrypted' : 'damaged', e.message);
  return new ExportError('damaged', String(e && e.message || e));
}

/* ------------------------------------------------------------------ chats and export-errors.json */
const asNum = v => (typeof v === 'number' ? v : typeof v === 'string' && v.trim() !== '' && !Number.isNaN(+v) ? +v : null);
export function toMs(v) {
  if (v == null || v === '') return null;
  const n = asNum(v);
  if (n != null) return n < 1e11 ? Math.round(n * 1000) : Math.round(n);
  const t = Date.parse(v);
  return Number.isNaN(t) ? null : t;
}
function textIn(c, depth = 0) {
  if (c == null || depth > 6) return '';
  if (typeof c === 'string') return c;
  if (typeof c === 'number' || typeof c === 'boolean') return String(c);
  if (Array.isArray(c)) return c.map(x => textIn(x, depth + 1)).filter(Boolean).join('\n');
  if (typeof c === 'object') {
    for (const k of ['text', 'parts', 'content', 'value', 'markdown', 'message', 'body']) if (c[k] != null) { const t = textIn(c[k], depth + 1); if (t) return t; }
    if (c.content_type === 'code' && c.text) return c.text;
  }
  return '';
}
const ROLE_WORDS = { user: 'You', human: 'You', me: 'You', you: 'You', assistant: 'Prism', ai: 'Prism', model: 'Prism', bot: 'Prism', gpt: 'Prism', system: 'System', tool: 'Tool', function: 'Tool' };
function roleOf(m) {
  if (!m || typeof m !== 'object') return null;
  const r = m.role ?? (m.author && (m.author.role ?? m.author.name)) ?? m.sender ?? m.from ?? m.speaker ?? m.participant ?? (typeof m.type === 'string' && ROLE_WORDS[m.type.toLowerCase()] ? m.type : null) ?? (typeof m.is_user === 'boolean' ? (m.is_user ? 'user' : 'assistant') : null);
  return typeof r === 'string' ? r : r && typeof r === 'object' ? (r.role || r.name || null) : null;
}
function msgText(m) { return textIn(m.content ?? m.text ?? m.message ?? m.parts ?? m.body ?? m.value); }
const isMsg = m => m && typeof m === 'object' && !Array.isArray(m) && roleOf(m) && msgText(m).trim() !== '';
export function roleLabel(r) {
  const k = String(r || '').toLowerCase();
  return ROLE_WORDS[k] || (r ? String(r).slice(0, 30) : 'Unknown');
}
function normMsg(m) {
  return { role: roleLabel(roleOf(m)), rawRole: String(roleOf(m)), text: msgText(m).replace(/\r\n/g, '\n'), ts: toMs(m.create_time ?? m.created_at ?? m.createdAt ?? m.timestamp ?? m.time ?? m.date ?? m.sent_at) };
}
/* A ChatGPT-style tree ({ mapping: { id: { message, parent, children } } }): the branch that ends at current_node, or
 * every message by time. */
function fromMapping(c) {
  const map = c.mapping;
  const nodes = Object.values(map).filter(n => n && n.message);
  let chain = [];
  if (c.current_node && map[c.current_node]) {
    let id = c.current_node;
    const guard = new Set();
    while (id && map[id] && !guard.has(id)) { guard.add(id); if (map[id].message) chain.push(map[id].message); id = map[id].parent; }
    chain.reverse();
  } else chain = nodes.map(n => n.message).sort((a, b) => (toMs(a.create_time) ?? 0) - (toMs(b.create_time) ?? 0));
  return chain.filter(m => isMsg(m) && !/^(system|tool)$/i.test(roleOf(m))).map(normMsg);
}
function biggestMessageArray(v, depth = 0, best = null) {
  if (depth > 6 || v == null || typeof v !== 'object') return best;
  if (Array.isArray(v)) {
    const n = v.filter(isMsg).length;
    if (n && n >= v.length / 2 && (!best || n > best.filter(isMsg).length)) best = v;
    for (const x of v.slice(0, 200)) best = biggestMessageArray(x, depth + 1, best);
    return best;
  }
  for (const k of Object.keys(v)) best = biggestMessageArray(v[k], depth + 1, best);
  return best;
}
const pick = (o, keys) => { for (const k of keys) if (o && typeof o[k] === 'string' && o[k].trim()) return o[k].trim(); return ''; };
function oneConversation(c, file, fallbackTitle) {
  let messages = [];
  if (c && typeof c === 'object' && c.mapping && typeof c.mapping === 'object') messages = fromMapping(c);
  else {
    const arr = Array.isArray(c) && c.filter(isMsg).length ? c : biggestMessageArray(c);
    messages = arr ? arr.filter(isMsg).map(normMsg) : [];
  }
  if (!messages.length) return null;
  const o = Array.isArray(c) ? {} : c || {};
  const first = messages.find(m => m.role === 'You') || messages[0];
  const title = pick(o, ['title', 'name', 'conversation_title', 'subject', 'topic']) || fallbackTitle || first.text.split('\n')[0].slice(0, 70);
  const project = pick(o, ['project', 'project_name', 'projectName', 'project_title', 'projectTitle', 'workspace']) || (o.project && typeof o.project === 'object' ? pick(o.project, ['name', 'title']) : '');
  return { file, title, project, created: toMs(o.create_time ?? o.created_at ?? o.createdAt) ?? messages.find(m => m.ts != null)?.ts ?? null, messages };
}
/* Every conversation in one chat JSON file. A file the reader cannot read as a chat comes back as { raw }. */
export function parseChatFile(path, text) {
  let v;
  try { v = JSON.parse(String(text).replace(/^﻿/, '')); } catch { return { convs: [], raw: { path, text: String(text).slice(0, 200000), reason: 'not valid JSON' } }; }
  const folder = path.split('/').slice(0, -1);
  const fb = T.baseOf(path).replace(/\.json$/i, '').replace(/[-_]+/g, ' ');
  const sub = folder.length >= 2 && !CHAT_DIR.test(`${folder[folder.length - 1]}/`) ? folder[folder.length - 1] : '';
  let list = [];
  if (Array.isArray(v) && v.length && v.every(x => x && typeof x === 'object' && !isMsg(x)) && v.some(x => x.mapping || x.messages || x.chat_messages || x.turns)) list = v;
  else if (v && typeof v === 'object' && !Array.isArray(v) && Array.isArray(v.conversations)) list = v.conversations;
  else list = [v];
  const convs = [];
  list.forEach((c, i) => {
    const conv = oneConversation(c, path, list.length > 1 ? '' : fb);
    if (conv) { if (!conv.project && sub) conv.project = sub; convs.push(conv); }
    else if (list.length > 1) convs.push(null);
  });
  const ok = convs.filter(Boolean);
  if (!ok.length) return { convs: [], raw: { path, text: JSON.stringify(v, null, 2).slice(0, 200000), reason: 'no messages we could tell apart' } };
  return { convs: ok, raw: null };
}

/* export-errors.json: OpenAI's guide says to look in it when an export fails. Its exact layout is not published, so
 * every object in it is shown with the fields that name a project, a file and an error. */
export function parseErrors(path, text) {
  let v;
  try { v = JSON.parse(String(text).replace(/^﻿/, '')); } catch { return { path, items: [], raw: String(text).slice(0, 20000) }; }
  let arr = Array.isArray(v) ? v : null;
  if (!arr && v && typeof v === 'object') {
    for (const k of ['errors', 'failed', 'failures', 'items', 'projects', 'results']) if (Array.isArray(v[k])) { arr = v[k]; break; }
    if (!arr) arr = Object.entries(v).map(([k, x]) => (x && typeof x === 'object' ? { project: k, ...x } : { project: k, error: x }));
  }
  const items = (arr || []).map(x => {
    if (typeof x === 'string') return { project: '', file: '', error: x };
    if (!x || typeof x !== 'object') return { project: '', file: '', error: String(x) };
    const p = pick(x, ['project_name', 'projectName', 'project_title', 'project', 'name', 'title']) || (x.project && typeof x.project === 'object' ? pick(x.project, ['name', 'title', 'id']) : '') || (x.project_id != null ? String(x.project_id) : x.id != null ? String(x.id) : '');
    const f = pick(x, ['file', 'path', 'file_path', 'filename', 'entry']);
    const err = pick(x, ['error', 'message', 'reason', 'detail', 'details', 'status', 'code']) || (x.error && typeof x.error === 'object' ? pick(x.error, ['message', 'code', 'type']) : '');
    return { project: p, file: f, error: err || JSON.stringify(x).slice(0, 300) };
  });
  return { path, items, raw: items.length ? null : JSON.stringify(v, null, 2).slice(0, 20000) };
}

/* ------------------------------------------------------------------ projects */
const slugKey = s => String(s || '').toLowerCase().normalize('NFKD').replace(/[^a-z0-9]+/g, '');

/* Splits one group's files into projects. The "Export all projects" archive is read as one folder per project; a single
 * project's ZIP (files at the top, or inside one folder) is one project. Folders and files that hold no .tex at all stay
 * with the archive as "other files". */
async function splitProjects(group) {
  let items = group.items.filter(it => !JUNK.test(it.path));
  const specials = { chats: [], errors: [], other: [] };
  const rest = [];
  for (const it of items) {
    if (ERRORS_FILE.test(it.path)) specials.errors.push(it);
    else if (CHAT_DIR.test(it.path) && /\.json$/i.test(it.path)) specials.chats.push(it);
    else rest.push(it);
  }
  items = rest;
  const texts = new Map();
  for (const it of items) if (T.kindOf(it.path) === 'tex' && it.size < READ_TEXT_MAX) { try { texts.set(it.path, await textOf(it)); } catch { /* unreadable entry: reported later */ } }
  const isRootAt = dir => [...texts].some(([p, s]) => T.dirOf(p) === dir && T.hasDocumentclass(s));
  /* strip wrapper folders that hold everything but no document of their own */
  let prefix = '';
  for (;;) {
    const firsts = new Set(items.map(it => it.path.slice(prefix.length).split('/')[0]));
    const allNested = items.every(it => it.path.slice(prefix.length).includes('/'));
    if (firsts.size !== 1 || !allNested) break;
    const f = [...firsts][0];
    if (isRootAt(prefix + f)) break;
    prefix += `${f}/`;
  }
  const rel = it => it.path.slice(prefix.length);
  const projects = [];
  const other = [];
  if (isRootAt(prefix.replace(/\/$/, '')) || [...texts.keys()].some(p => p.startsWith(prefix) && !p.slice(prefix.length).includes('/'))) {
    const name = prefix ? prefix.replace(/\/$/, '').split('/').pop() : group.name;
    projects.push({ name, items: items.map(it => ({ ...it, rel: rel(it) })) });
  } else {
    const byTop = new Map();
    for (const it of items) {
      const r = rel(it);
      if (!r.includes('/')) { other.push({ ...it, rel: r }); continue; }
      const top = r.split('/')[0];
      if (!byTop.has(top)) byTop.set(top, []);
      byTop.get(top).push({ ...it, rel: r.slice(top.length + 1) });
    }
    for (const [top, list] of byTop) {
      if (list.some(it => T.kindOf(it.rel) === 'tex')) projects.push({ name: top, items: list });
      else for (const it of list) other.push({ ...it, rel: `${top}/${it.rel}` });
    }
  }
  /* inside a project, strip one more wrapper folder when every file sits in it */
  for (const p of projects) {
    for (;;) {
      const firsts = new Set(p.items.map(it => it.rel.split('/')[0]));
      if (firsts.size !== 1 || !p.items.every(it => it.rel.includes('/'))) break;
      const f = [...firsts][0];
      p.items = p.items.map(it => ({ ...it, rel: it.rel.slice(f.length + 1) }));
    }
    p.texts = new Map();
    for (const it of p.items) {
      const full = it.path;
      if (texts.has(full)) p.texts.set(it.rel, texts.get(full));
    }
  }
  return { projects, specials, other };
}

/* Everything we report about one project. */
async function analyseProject(p, group) {
  const files = p.items.map(it => ({ ...it, kind: T.kindOf(it.rel) }));
  const paths = files.map(f => f.rel);
  const find = T.makeResolver(paths);
  for (const f of files) {
    if ((f.kind === 'bib' || f.kind === 'style' || T.extOf(f.rel) === 'bbl') && f.size < READ_TEXT_MAX && !p.texts.has(f.rel)) { try { p.texts.set(f.rel, await textOf(f)); } catch { /* skip */ } }
  }
  const roots = T.findRoots(p.texts, p.name);
  const docs = roots.map(path => {
    const w = T.walk(path, p.texts, find);
    const eng = T.engineOf(path, p.texts, w.inputs);
    const bib = T.bibSystem(path, p.texts, w.inputs);
    const flat = T.flatten(path, p.texts, find);
    const ol = T.outline(flat.text);
    return { path, ...w, engine: eng.engine, engineWhy: eng.why, bibSystem: bib.system, bibBackend: bib.backend, outline: ol, words: T.wordCount(flat.text), flatMissing: flat.missing };
  });
  const used = new Set();
  for (const d of docs) { used.add(d.path); for (const k of ['inputs', 'graphics', 'bib', 'styles']) for (const x of d[k]) used.add(x); }
  let bibCount = 0;
  const bibFiles = files.filter(f => f.kind === 'bib');
  for (const f of bibFiles) bibCount += T.bibEntries(p.texts.get(f.rel) || '').length;
  const junk = files.filter(f => f.kind === 'build');
  const figures = files.filter(f => f.kind === 'figure');
  const isCompiled = rel => /\.pdf$/i.test(rel) && roots.some(r => r.replace(/\.(tex|ltx)$/i, '.pdf') === rel);
  const unusedFigures = docs.length ? figures.filter(f => !used.has(f.rel) && !isCompiled(f.rel)) : [];
  const compiledPdf = files.filter(f => isCompiled(f.rel)).map(f => f.rel);
  const project = {
    id: `${group.name}/${p.name}`,
    name: p.name,
    group: group.name,
    nested: group.nested || null,
    files,
    texts: p.texts,
    find,
    docs,
    main: docs[0] || null,
    bibCount,
    bibFiles: bibFiles.map(f => f.rel),
    junk: junk.map(f => f.rel),
    figures: figures.length,
    unusedFigures: unusedFigures.map(f => f.rel),
    compiledPdf,
    size: files.reduce((a, f) => a + f.size, 0),
    chats: [],
  };
  project.overleaf = planOverleaf(project);
  return project;
}

/* How the project goes into Overleaf: one upload when it fits (50 MB, 180 files), else a first part that creates the
 * project (every text file first, so it compiles as soon as its figures follow) and further parts of figures and data.
 * Build files are left out (Overleaf makes them again); a file over 50 MB cannot be uploaded at all. */
export function planOverleaf(project) {
  const zipCost = f => f.stored + 76 + 2 * new TextEncoder().encode(f.rel).length;
  const keep = project.files.filter(f => f.kind !== 'build');
  const tooBig = keep.filter(f => f.size > OVERLEAF.uploadBytes);
  const ok = keep.filter(f => f.size <= OVERLEAF.uploadBytes);
  const isTextual = f => ['tex', 'bib', 'style', 'text'].includes(f.kind) || T.extOf(f.rel) === 'bbl' || T.extOf(f.rel) === 'latexmkrc';
  const used = new Set(project.docs.flatMap(d => [...d.graphics, ...d.inputs, ...d.bib, ...d.styles]));
  const order = [
    ...ok.filter(isTextual).sort((a, b) => a.rel.localeCompare(b.rel)),
    ...ok.filter(f => !isTextual(f) && used.has(f.rel)).sort((a, b) => a.rel.localeCompare(b.rel)),
    ...ok.filter(f => !isTextual(f) && !used.has(f.rel)).sort((a, b) => a.rel.localeCompare(b.rel)),
  ];
  const parts = [];
  let cur = [];
  let bytes = 22;
  for (const f of order) {
    const c = zipCost(f);
    if (cur.length && (cur.length >= OVERLEAF.uploadFiles || bytes + c > OVERLEAF.partBytes)) { parts.push(cur); cur = []; bytes = 22; }
    cur.push(f); bytes += c;
  }
  if (cur.length) parts.push(cur);
  const editable = keep.filter(f => isTextual(f) && f.size <= OVERLEAF.editableFile);
  const editableBytes = editable.reduce((a, f) => a + f.size, 0);
  const bigText = keep.filter(f => isTextual(f) && f.size > OVERLEAF.editableFile).map(f => f.rel);
  const zipBytes = keep.reduce((a, f) => a + zipCost(f), 22);
  const nonLatex = keep.filter(f => !T.latexFriendly(f.rel)).map(f => f.rel);
  const problems = [];
  if (!project.main) problems.push('no-main');
  if (tooBig.length) problems.push('file-over-50mb');
  if (keep.length > OVERLEAF.projectFiles) problems.push('over-2000-files');
  if (editableBytes > OVERLEAF.editableBytes) problems.push('over-7mb-text');
  if (bigText.length) problems.push('text-over-2mb');
  return {
    files: keep.length, zipBytes, parts: parts.map(list => list.map(f => f.rel)), tooBig: tooBig.map(f => f.rel), editableBytes, bigText, nonLatex,
    fitsOne: parts.length <= 1 && !tooBig.length, problems,
  };
}

/* ------------------------------------------------------------------ the whole export */
export async function openExport(groups, { label = '' } = {}) {
  const projects = [];
  const chats = [];
  const rawChats = [];
  const errors = [];
  const other = [];
  for (const g of groups) {
    const { projects: ps, specials, other: o } = await splitProjects(g);
    for (const p of ps) projects.push(await analyseProject(p, g));
    for (const it of specials.chats) {
      let text = '';
      try { text = await textOf(it); } catch { rawChats.push({ path: it.path, text: '', reason: 'could not be read' }); continue; }
      const r = parseChatFile(it.path, text);
      chats.push(...r.convs);
      if (r.raw) rawChats.push(r.raw);
    }
    for (const it of specials.errors) {
      try { errors.push(parseErrors(it.path, await textOf(it))); } catch { errors.push({ path: it.path, items: [], raw: 'could not be read' }); }
    }
    for (const it of o) other.push({ path: it.path, size: it.size });
  }
  /* each chat goes with the project of the same name, when there is one */
  const byKey = new Map(projects.map(p => [slugKey(p.name), p]));
  for (const c of chats) {
    const p = byKey.get(slugKey(c.project));
    c.projectId = p ? p.id : null;
    if (p) p.chats.push(c);
  }
  if (!projects.length && !chats.length && !errors.length) {
    const any = groups.flatMap(g => g.items);
    if (any.some(it => /\.(docx?|odt|rtf)$/i.test(it.path))) throw new ExportError('no-tex-word');
    if (any.some(it => /\.(pdf)$/i.test(it.path)) && !any.some(it => /\.(tex|ltx)$/i.test(it.path))) throw new ExportError('no-tex-pdf');
    throw new ExportError('no-tex');
  }
  /* same project name twice (two ZIPs of one project): keep both, tell them apart */
  const seen = new Map();
  for (const p of projects) { const k = slugKey(p.name); seen.set(k, (seen.get(k) || 0) + 1); if (seen.get(k) > 1) p.label = `${p.name} (${seen.get(k)})`; }
  for (const p of projects) p.label = p.label || p.name;
  return {
    label: label || (groups.length === 1 ? groups[0].name : `${groups.length} archives`),
    projects,
    chats,
    rawChats,
    errors,
    other,
    totalSize: groups.reduce((a, g) => a + g.items.reduce((b, it) => b + it.size, 0), 0),
  };
}
