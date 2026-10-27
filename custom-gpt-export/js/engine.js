/* Skillcase engine: plain functions shared by the worker, the page and the tests. It turns what you paste from a custom
 * GPT's editor (name, description, instructions, conversation starters, action schemas) plus the knowledge files you
 * pick into a portable backup and into skill folders in the open Agent Skills format (SKILL.md), and it reads the
 * conversations.json of a ChatGPT data export to find the chats you had with each GPT. No network, no storage: every
 * function takes data and returns data. Dates in files are written in UTC so a backup reads the same everywhere. */
import { zipSync, strToU8 } from '../vendor/fflate.js';

export const TOOL_URL = 'https://peakappsstudio.com/custom-gpt-export/';
export const TOOL_NAME = 'Skillcase';
export const SKILL_BODY_LINES = 500; // the Agent Skills specification: keep the main SKILL.md under 500 lines
export const GEMINI_MAX_BYTES = 100 * 1024 * 1024; // Google: uploaded skill files must total no more than 100 MB

/* ---------------- small text helpers ---------------- */
const pad2 = v => String(v).padStart(2, '0');
/** "2026-03-02 14:05 UTC" from seconds or milliseconds since 1970, or '' */
export function stamp(t) {
  if (t == null || !isFinite(t)) return '';
  const ms = t < 1e11 ? t * 1000 : t;
  const d = new Date(ms);
  if (isNaN(d)) return '';
  return `${d.getUTCFullYear()}-${pad2(d.getUTCMonth() + 1)}-${pad2(d.getUTCDate())} ${pad2(d.getUTCHours())}:${pad2(d.getUTCMinutes())} UTC`;
}
export const dayOf = t => stamp(t).slice(0, 10);
export const oneLine = s => String(s == null ? '' : s).replace(/[\u0000-\u001f\u007f]+/g, ' ').replace(/\s+/g, ' ').trim();
/** cut a single-line text to at most n characters, at a word boundary when one is near, with an ellipsis */
export function clip(s, n) {
  s = oneLine(s);
  if (s.length <= n) return s;
  let cut = s.slice(0, n - 1);
  const sp = cut.lastIndexOf(' ');
  if (sp > n * 0.6) cut = cut.slice(0, sp);
  return cut.replace(/[\s,;:.]+$/, '') + '\u2026';
}
/** a YAML double-quoted scalar (always quoted: safe for colons, hashes and quotes) */
export const yamlStr = s => '"' + oneLine(s).replace(/\\/g, '\\\\').replace(/"/g, '\\"') + '"';
/** keep the text's own line breaks but use \n only, without trailing spaces at the end */
export const tidy = s => String(s == null ? '' : s).replace(/\r\n?/g, '\n').replace(/[ \t]+$/gm, '').replace(/^\n+|\n+$/g, '');
const firstSentence = s => { const m = oneLine(s).match(/^(.{20,300}?[.!?])(\s|$)/); return m ? m[1] : clip(s, 300); };

/* ---------------- names ---------------- */
/** A skill name under the Agent Skills rules: 1-64 characters, a-z, 0-9 and single hyphens, no hyphen at either end. */
export function skillName(name) {
  let s = String(name || '').replace(/ı/g, 'i').replace(/ß/g, 'ss').replace(/[æÆ]/g, 'ae').replace(/[øØ]/g, 'o').replace(/[œŒ]/g, 'oe').replace(/[łŁ]/g, 'l').replace(/[đĐ]/g, 'd');
  s = s.normalize('NFKD').replace(/[\u0300-\u036f]/g, '').toLowerCase();
  s = s.replace(/[^a-z0-9]+/g, '-').replace(/-+/g, '-').replace(/^-|-$/g, '');
  if (s.length > 64) s = s.slice(0, 64).replace(/-+$/, '');
  return s || 'my-gpt';
}
export const isValidSkillName = s => typeof s === 'string' && s.length >= 1 && s.length <= 64 && /^[a-z0-9]+(-[a-z0-9]+)*$/.test(s);

/** A file name that is safe inside a ZIP on Windows, macOS and Linux (no folders, no reserved characters). */
export function safeFileName(name, fallback = 'file') {
  let s = String(name || '').split(/[\\/]/).pop().normalize('NFC');
  s = s.replace(/[\u0000-\u001f\u007f<>:"|?*]+/g, '-').replace(/^[\s.]+|[\s.]+$/g, '');
  if (/^(con|prn|aux|nul|com\d|lpt\d)(\.|$)/i.test(s)) s = '_' + s;
  if (s.length > 120) { const dot = s.lastIndexOf('.'); const ext = dot > 0 && s.length - dot <= 12 ? s.slice(dot) : ''; s = s.slice(0, 120 - ext.length).trim() + ext; }
  return s || fallback;
}
/** The same list of names with "(2)", "(3)"... added where two would collide (case-insensitive, as on Windows). */
export function uniqueNames(names) {
  const seen = new Set();
  return names.map(n => {
    let out = n, i = 2;
    const dot = n.lastIndexOf('.');
    const base = dot > 0 ? n.slice(0, dot) : n, ext = dot > 0 ? n.slice(dot) : '';
    while (seen.has(out.toLowerCase())) out = `${base} (${i++})${ext}`;
    seen.add(out.toLowerCase());
    return out;
  });
}
const slugTitle = (s, n = 60) => skillName(clip(s, n)).slice(0, n).replace(/-+$/, '') || 'chat';

/* ---------------- files ---------------- */
const TEXT_EXT = new Set(['txt', 'md', 'markdown', 'csv', 'tsv', 'json', 'jsonl', 'xml', 'html', 'htm', 'yaml', 'yml', 'js', 'mjs', 'ts', 'py', 'java', 'c', 'h', 'cpp', 'cs', 'go', 'rb', 'php', 'sql', 'sh', 'css', 'ini', 'toml', 'log', 'tex', 'rst', 'srt', 'vtt']);
export const extOf = name => { const m = /\.([A-Za-z0-9]{1,10})$/.exec(String(name || '')); return m ? m[1].toLowerCase() : ''; };
/** Plain text: a known text extension and no NUL byte in the first 8 KB. PDFs, Word and Excel files are not. */
export function isPlainText(name, bytes) {
  if (!TEXT_EXT.has(extOf(name))) return false;
  const n = Math.min(bytes ? bytes.length : 0, 8192);
  for (let i = 0; i < n; i++) if (bytes[i] === 0) return false;
  return true;
}

/* ---------------- secrets ---------------- */
const SECRET_RES = [
  /\bsk-[A-Za-z0-9_-]{16,}/,
  /\b(?:ghp|gho|github_pat)_[A-Za-z0-9_]{20,}/,
  /\bAIza[0-9A-Za-z_-]{30,}/,
  /\bxox[abpr]-[A-Za-z0-9-]{10,}/,
  /\bBearer\s+[A-Za-z0-9._~+/-]{20,}=*/i,
  /\b(?:api[_-]?key|client[_-]?secret|access[_-]?token|password)["']?\s*[:=]\s*["'][^"'\s]{12,}["']/i,
];
/** true when a pasted text holds something that looks like a key or token (the page warns and asks to remove it) */
export const looksSecret = s => SECRET_RES.some(re => re.test(String(s || '')));

/* ---------------- the GPT you pasted ---------------- */
export const CAPABILITIES = [
  ['web', 'Web search'],
  ['image', 'Image generation'],
  ['code', 'Code Interpreter and data analysis'],
  ['canvas', 'Canvas'],
];
/** Cleans the form's values into the shape every output uses. */
export function normalizeGpt(input = {}) {
  const starters = (Array.isArray(input.starters) ? input.starters : String(input.starters || '').split(/\r?\n/))
    .map(oneLine).filter(Boolean).slice(0, 12);
  const caps = {};
  for (const [k] of CAPABILITIES) caps[k] = !!(input.capabilities && input.capabilities[k]);
  const actions = (input.actions || []).map(a => ({ schema: tidy(a && a.schema), auth: ['none', 'api_key', 'oauth'].includes(a && a.auth) ? a.auth : 'unknown', privacy: oneLine(a && a.privacy) }))
    .filter(a => a.schema);
  const gptId = /^g-[A-Za-z0-9-]{4,}$/.test(oneLine(input.gptId)) ? oneLine(input.gptId) : '';
  return { name: oneLine(input.name).slice(0, 200), description: oneLine(input.description).slice(0, 2000), instructions: tidy(input.instructions), starters, capabilities: caps, actions, gptId };
}
export const gptLabel = g => g.name || 'My GPT';

/** what is filled in, for the page's manifest and the README */
export function manifest(g, files = [], chats = []) {
  return [
    { key: 'name', label: 'Name', state: g.name ? 'kept' : 'empty' },
    { key: 'description', label: 'Description', state: g.description ? 'kept' : 'empty' },
    { key: 'instructions', label: 'Instructions', state: g.instructions ? 'kept' : 'empty', detail: g.instructions ? `${g.instructions.length.toLocaleString('en-US')} characters` : '' },
    { key: 'starters', label: 'Conversation starters', state: g.starters.length ? 'kept' : 'empty', detail: g.starters.length ? `${g.starters.length}` : '' },
    { key: 'files', label: 'Knowledge files', state: files.length ? 'kept' : 'empty', detail: files.length ? `${files.length}` : '' },
    { key: 'actions', label: 'Action schemas', state: g.actions.length ? 'rebuild' : 'empty', detail: g.actions.length ? `${g.actions.length}` : '' },
    { key: 'chats', label: 'Chats with the GPT', state: chats.length ? 'kept' : 'empty', detail: chats.length ? `${chats.length}` : '' },
  ];
}

/* ---------------- action schemas (OpenAPI) ---------------- */
/** Reads what a pasted schema says about itself: JSON or YAML, its title, servers and operations. Never throws. */
export function summarizeSchema(text) {
  const t = tidy(text);
  const out = { format: 'text', valid: false, title: '', version: '', servers: [], operations: [] };
  if (!t) return out;
  if (/^[\[{]/.test(t)) {
    try {
      const j = JSON.parse(t);
      out.format = 'json';
      out.valid = !!(j && typeof j === 'object' && (j.openapi || j.swagger) && j.paths);
      out.title = oneLine(j && j.info && j.info.title);
      out.version = oneLine(j && (j.openapi || j.swagger));
      out.servers = Array.isArray(j && j.servers) ? j.servers.map(s => oneLine(s && s.url)).filter(Boolean).slice(0, 5) : [];
      for (const [path, ops] of Object.entries((j && j.paths) || {})) {
        for (const [method, op] of Object.entries(ops || {})) {
          if (!/^(get|put|post|delete|patch|head|options)$/i.test(method)) continue;
          out.operations.push({ method: method.toUpperCase(), path, id: oneLine(op && (op.operationId || op.summary)) });
        }
      }
      return out;
    } catch { out.format = 'json'; out.error = 'This schema is not valid JSON. It is saved exactly as pasted.'; return out; }
  }
  // YAML: read the few lines we need without a YAML parser
  out.format = /^(openapi|swagger)\s*:/m.test(t) || /^\s*paths\s*:/m.test(t) ? 'yaml' : 'text';
  const ver = /^(?:openapi|swagger)\s*:\s*["']?([^"'\n]+)/m.exec(t); if (ver) out.version = oneLine(ver[1]);
  const title = /^\s+title\s*:\s*["']?([^"'\n]+)/m.exec(t); if (title) out.title = oneLine(title[1]);
  for (const m of t.matchAll(/^\s*-\s*url\s*:\s*["']?([^"'\s]+)/gm)) out.servers.push(m[1]);
  let path = null;
  for (const line of t.split('\n')) {
    const pm = /^ {2}(\/[^:]*)\s*:\s*$/.exec(line) || /^ {2}["'](\/[^"']*)["']\s*:\s*$/.exec(line);
    if (pm) { path = pm[1]; continue; }
    const om = /^ {4}(get|put|post|delete|patch|head|options)\s*:\s*$/i.exec(line);
    if (om && path) { out.operations.push({ method: om[1].toUpperCase(), path, id: '' }); continue; }
    const im = /^ {6}operationId\s*:\s*["']?([^"'\n]+)/.exec(line);
    if (im && out.operations.length && !out.operations[out.operations.length - 1].id) out.operations[out.operations.length - 1].id = oneLine(im[1]);
    if (/^\S/.test(line) && !/^paths\s*:/.test(line)) path = null;
  }
  out.servers = out.servers.slice(0, 5);
  out.valid = out.format === 'yaml' && !!out.version && out.operations.length > 0;
  return out;
}
const AUTH_WORDS = { none: 'None', api_key: 'API key', oauth: 'OAuth', unknown: 'Not recorded' };
const actionFile = (a, i) => `action-${i + 1}.${summarizeSchema(a.schema).format === 'json' ? 'json' : summarizeSchema(a.schema).format === 'yaml' ? 'yaml' : 'txt'}`;

/** A Markdown note about one action: what it called and how to rebuild it. */
export function actionMd(g, a, i) {
  const s = summarizeSchema(a.schema);
  const lines = [`# Action ${i + 1}${s.title ? `: ${s.title}` : ''}`, '', `The OpenAPI schema is in \`${actionFile(a, i)}\`, saved exactly as you pasted it.`, ''];
  lines.push(`- Format: ${s.format === 'json' ? 'JSON' : s.format === 'yaml' ? 'YAML' : 'plain text'}${s.version ? ` (OpenAPI ${s.version})` : ''}`);
  if (s.servers.length) lines.push(`- Server: ${s.servers.join(', ')}`);
  lines.push(`- Authentication: ${AUTH_WORDS[a.auth]}`);
  if (a.privacy) lines.push(`- Privacy policy: ${a.privacy}`);
  if (s.operations.length) {
    lines.push('', '## Operations', '', '| Method | Path | Operation |', '| --- | --- | --- |');
    for (const o of s.operations.slice(0, 200)) lines.push(`| ${o.method} | \`${o.path.replace(/\|/g, '\\|')}\` | ${(o.id || '').replace(/\|/g, '\\|')} |`);
  }
  lines.push('', '## Rebuilding it', '',
    'Custom actions do not move with a GPT. OpenAI says GPT custom actions do not transfer through its plugin migration and need to be rebuilt with a supported app connector or a custom MCP server.',
    'Keys, tokens and OAuth client secrets are not in this backup. Enter them again where you rebuild the connection.');
  return lines.join('\n') + '\n';
}

/* ---------------- the skill (SKILL.md) ---------------- */
/** The skill's description: what it does (the GPT's description or the instructions' first sentence) and when to use it
 *  (the conversation starters), at most 1024 characters, as the Agent Skills specification asks. */
export function skillDescription(g) {
  const name = gptLabel(g);
  let d = g.description || (g.instructions ? firstSentence(g.instructions) : '');
  d = oneLine(d);
  let out = d || `Instructions carried over from the custom GPT "${name}".`;
  if (!/[.!?]$/.test(out)) out += '.';
  const st = g.starters.slice(0, 3).map(s => clip(s, 120));
  if (st.length) out += ` Use it for requests like ${st.map(s => `"${s}"`).join(', ')}.`;
  else if (d) out += ` Carried over from the custom GPT "${name}".`;
  return clip(out, 1024);
}

/** The files a skill holds: every knowledge file for Claude and ChatGPT; plain text only for Gemini. */
export function skillFiles(files, variant) {
  const names = uniqueNames(files.map(f => safeFileName(f.name)));
  const kept = [], left = [];
  let total = 0;
  files.forEach((f, i) => {
    const item = { name: names[i], size: f.bytes ? f.bytes.length : (f.size || 0), bytes: f.bytes };
    if (variant === 'gemini' && !isPlainText(item.name, f.bytes)) { left.push({ ...item, why: 'not plain text' }); return; }
    if (variant === 'gemini' && total + item.size > GEMINI_MAX_BYTES) { left.push({ ...item, why: 'over the 100 MB total' }); return; }
    total += item.size;
    kept.push(item);
  });
  return { kept, left };
}

/** SKILL.md for the skill folder. variant 'claude' (Claude and ChatGPT) or 'gemini'. */
export function skillMd(g, { files = [], variant = 'claude', today = '' } = {}) {
  const name = skillName(g.name);
  const { kept, left } = skillFiles(files, variant);
  const fm = ['---', `name: ${name}`, `description: ${yamlStr(skillDescription(g))}`, 'metadata:', `  source: ${yamlStr('ChatGPT custom GPT')}`, `  gpt-name: ${yamlStr(gptLabel(g))}`];
  if (g.gptId) fm.push(`  gpt-id: ${yamlStr(g.gptId)}`);
  if (today) fm.push(`  exported-on: ${yamlStr(today)}`);
  fm.push(`  exported-with: ${yamlStr('Skillcase, peakappsstudio.com/custom-gpt-export')}`, '---', '');
  const body = [`# ${gptLabel(g)}`, ''];
  body.push(g.instructions || '(The GPT had no instructions in this backup.)');
  if (g.starters.length) body.push('', '## Conversation starters', '', 'These were the GPT\'s suggested first messages:', '', ...g.starters.map(s => `- ${s}`));
  if (kept.length) body.push('', '## Reference files', '', 'These files were the GPT\'s knowledge. Read the one a request needs:', '', ...kept.map(f => `- [${f.name}](references/${encodeURI(f.name)})`));
  const notes = [];
  if (g.actions.length) notes.push(`The GPT called ${g.actions.length === 1 ? 'an outside service' : 'outside services'} through custom actions. ${g.actions.length === 1 ? 'That action does' : 'Those actions do'} not run from this skill; the OpenAPI ${g.actions.length === 1 ? 'schema is' : 'schemas are'} in \`assets/actions/\` for whoever rebuilds the connection.`);
  const caps = CAPABILITIES.filter(([k]) => g.capabilities[k]).map(([, l]) => l);
  if (caps.length) notes.push(`The GPT had these ChatGPT capabilities turned on: ${caps.join(', ')}. Whether they are available here depends on the assistant and its settings.`);
  if (left.length) notes.push(`Left out of this ${variant === 'gemini' ? 'Gemini ' : ''}skill: ${left.map(f => `${f.name} (${f.why})`).join(', ')}. ${variant === 'gemini' ? 'Google says skills take plain-text files; convert these to text, or keep them in the full backup.' : ''}`.trim());
  if (notes.length) body.push('', '## Not carried over', '', ...notes.map(n => `- ${n}`));
  return fm.join('\n') + body.join('\n') + '\n';
}

/** The files of one skill folder, as { path: bytes }. Claude wants the folder inside the ZIP (named like the skill);
 *  Gemini takes a ZIP "with a SKILL.md file in its main folder", so its ZIP has SKILL.md at the top. */
export function skillEntries(g, { files = [], variant = 'claude', today = '' } = {}) {
  const name = skillName(g.name);
  const root = variant === 'gemini' ? '' : `${name}/`;
  const out = { [`${root}SKILL.md`]: strToU8(skillMd(g, { files, variant, today })) };
  for (const f of skillFiles(files, variant).kept) out[`${root}references/${f.name}`] = f.bytes || new Uint8Array(0);
  g.actions.forEach((a, i) => { out[`${root}assets/actions/${actionFile(a, i)}`] = strToU8(a.schema + '\n'); });
  return out;
}
export const skillBodyLines = g => (g.instructions || '').split('\n').length + g.starters.length + 12;

/* ---------------- Claude project and Ollama ---------------- */
/** project-instructions.md: the steps and the text to paste into a Claude project's instructions. */
export function claudeProjectMd(g, { files = [] } = {}) {
  const names = uniqueNames(files.map(f => safeFileName(f.name)));
  const lines = [`# ${gptLabel(g)} as a Claude project`, '',
    '1. In Claude, create a project and name it after your GPT.',
    '2. Paste everything under "Instructions" below into the project\'s instructions.',
    names.length ? '3. Upload the files listed under "Files" to the project\'s knowledge. They are in the backup\'s `knowledge` folder.' : '3. This GPT had no knowledge files in the backup, so there is nothing to upload.',
    '', 'Anthropic says projects are available on every Claude plan, free included, and that free accounts can have up to five projects.', '', '## Instructions', '', g.instructions || '(The GPT had no instructions in this backup.)'];
  if (g.starters.length) lines.push('', '## Conversation starters (for you, not for the instructions)', '', ...g.starters.map(s => `- ${s}`));
  if (names.length) lines.push('', '## Files', '', ...names.map(n => `- ${n}`));
  return lines.join('\n') + '\n';
}
/** A Modelfile for Ollama: FROM a base model you have pulled, SYSTEM with the GPT's instructions. */
export function modelfile(g, { base = 'llama3.2', today = '' } = {}) {
  const sys = (g.instructions || '').replace(/"""/g, "'''");
  const lines = [
    `# Modelfile made from the custom GPT "${oneLine(gptLabel(g)).replace(/"/g, "'")}" with Skillcase${today ? ` on ${today}` : ''}.`,
    `# Replace ${base} with any model you have pulled, then run: ollama create ${skillName(g.name)} -f Modelfile`,
    '# A Modelfile has no place for documents: the knowledge files are in the backup\'s knowledge folder.',
  ];
  if (/"""/.test(g.instructions || '')) lines.push("# Triple double quotes in the instructions were changed to ''' so the SYSTEM block stays closed.");
  lines.push(`FROM ${base}`, `SYSTEM """${sys}"""`);
  return lines.join('\n') + '\n';
}

/* ---------------- ChatGPT data export: conversations.json ---------------- */
/** The conversations in one export file's text (an array, or an object with a "conversations" array). Throws a coded
 *  error when the text is not JSON or holds no conversations. */
export function parseConversations(text) {
  let j;
  try { j = JSON.parse(text); } catch { const e = new Error('not json'); e.code = 'badjson'; throw e; }
  const list = Array.isArray(j) ? j : j && Array.isArray(j.conversations) ? j.conversations : null;
  if (!list) { const e = new Error('no conversations'); e.code = 'notexport'; throw e; }
  const convs = list.filter(c => c && typeof c === 'object' && c.mapping && typeof c.mapping === 'object');
  if (list.length && !convs.length) { const e = new Error('no conversations'); e.code = 'notexport'; throw e; }
  return convs;
}
/** 'project' for a ChatGPT project (its id starts with g-p-), else 'gpt' */
export const gizmoKind = (id, type) => (type === 'snorlax' || /^g-p-/.test(String(id || '')) ? 'project' : 'gpt');

const cleanText = s => String(s || '').replace(/[\ue000-\uf8ff]/g, '').replace(/\u3010[^\u3011]{0,40}\u2020[^\u3011]{0,40}\u3011/g, '').replace(/\r\n?/g, '\n').trim();
/** The readable text of one message, or null when it is internal (tool calls, reasoning, hidden system text). */
export function messageText(msg) {
  if (!msg || !msg.content) return null;
  const meta = msg.metadata || {};
  const role = msg.author && msg.author.role;
  const ct = msg.content.content_type;
  const recipient = msg.recipient == null ? 'all' : msg.recipient;
  if (meta.is_visually_hidden_from_conversation) return null;
  if (role === 'system') return null;
  if (role === 'assistant' && recipient !== 'all') return null;
  if (ct === 'thoughts' || ct === 'reasoning_recap' || ct === 'tether_browsing_display' || ct === 'user_editable_context' || ct === 'system_error') return null;
  if (role === 'tool' && !['execution_output', 'multimodal_text', 'tether_quote'].includes(ct)) return null;
  let text = '';
  if (ct === 'text') text = (msg.content.parts || []).filter(p => typeof p === 'string').join('\n');
  else if (ct === 'multimodal_text') {
    text = (msg.content.parts || []).map(p => {
      if (typeof p === 'string') return p;
      if (!p || typeof p !== 'object') return '';
      if (p.content_type === 'image_asset_pointer') return '[image]';
      if (p.content_type === 'audio_transcription') return p.text || '';
      if (p.content_type === 'audio_asset_pointer' || p.content_type === 'real_time_user_audio_video_asset_pointer') return '[audio]';
      return '';
    }).filter(Boolean).join('\n');
  } else if (ct === 'code') text = '```' + (msg.content.language && msg.content.language !== 'unknown' ? msg.content.language : '') + '\n' + (msg.content.text || '') + '\n```';
  else if (ct === 'execution_output') text = '```\n' + (msg.content.text || '') + '\n```';
  else if (ct === 'tether_quote') text = '> ' + String(msg.content.text || '').replace(/\n/g, '\n> ') + (msg.content.url ? `\n> (${msg.content.url})` : '');
  else return null;
  text = cleanText(text);
  return text ? text : null;
}
/** The conversation as shown in ChatGPT: the branch that ends at current_node, oldest first. */
export function linearize(conv) {
  const mapping = conv.mapping || {};
  let id = conv.current_node;
  if (!id || !mapping[id]) {
    // no current node: take the newest message and walk up from it
    let best = null;
    for (const [k, n] of Object.entries(mapping)) { const t = n && n.message && n.message.create_time; if (t != null && (!best || t > best.t)) best = { k, t }; }
    id = best ? best.k : null;
  }
  const chain = [];
  const seen = new Set();
  while (id && mapping[id] && !seen.has(id)) { seen.add(id); chain.push(mapping[id]); id = mapping[id].parent; }
  chain.reverse();
  const out = [];
  for (const node of chain) {
    const msg = node.message;
    const text = messageText(msg);
    if (text == null) continue;
    const role = msg.author.role;
    out.push({ role, tool: role === 'tool' ? oneLine(msg.author.name) : '', time: msg.create_time != null ? msg.create_time : null, text, gizmo: oneLine(msg.metadata && msg.metadata.gizmo_id) });
  }
  return out;
}

/** Reads every conversation once and keeps only the chats with a GPT or a project, already flattened. Returns
 *  { groups: [{ id, kind, chats, mentions, first, last }], total, plain }. A chat where a GPT answered after an @ mention
 *  is listed under that GPT as a mention. */
export function collectGizmoChats(convs) {
  const groups = new Map();
  const group = (id, kind) => groups.get(id) || groups.set(id, { id, kind, chats: [], mentions: [], first: null, last: null }).get(id);
  let plain = 0;
  for (const c of convs) {
    const gid = oneLine(c.gizmo_id);
    const messages = linearize(c);
    const chat = { id: oneLine(c.conversation_id || c.id), title: oneLine(c.title) || 'Untitled chat', created: c.create_time != null ? c.create_time : null, updated: c.update_time != null ? c.update_time : null, gizmo: gid, messages };
    if (gid) group(gid, gizmoKind(gid, c.gizmo_type)).chats.push(chat);
    else plain++;
    const mentioned = new Set(messages.map(m => m.gizmo).filter(x => x && x !== gid && /^g-/.test(x)));
    for (const m of mentioned) group(m, gizmoKind(m)).mentions.push(chat);
  }
  for (const g of groups.values()) {
    for (const ch of g.chats.concat(g.mentions)) {
      const t0 = ch.created, t1 = ch.updated != null ? ch.updated : ch.created;
      if (t0 != null && (g.first == null || t0 < g.first)) g.first = t0;
      if (t1 != null && (g.last == null || t1 > g.last)) g.last = t1;
    }
    const byTime = (a, b) => (b.updated || b.created || 0) - (a.updated || a.created || 0);
    g.chats.sort(byTime); g.mentions.sort(byTime);
  }
  const list = [...groups.values()].sort((a, b) => (a.kind === b.kind ? 0 : a.kind === 'gpt' ? -1 : 1) || (b.chats.length + b.mentions.length) - (a.chats.length + a.mentions.length));
  return { groups: list, total: convs.length, plain };
}
/** What the page lists for one GPT or project (no message text) */
export const groupSummary = g => ({
  id: g.id, kind: g.kind, chats: g.chats.length, mentions: g.mentions.length, first: g.first, last: g.last,
  messages: g.chats.concat(g.mentions).reduce((n, c) => n + c.messages.length, 0),
  titles: g.chats.concat(g.mentions).slice(0, 4).map(c => c.title), url: `https://chatgpt.com/g/${g.id}`,
});

/** One chat as Markdown. `label` is the name shown for the GPT's answers. */
export function chatMd(chat, label = 'GPT') {
  const lines = [`# ${chat.title}`, ''];
  lines.push(`- GPT: ${label}${chat.gizmo ? ` (${chat.gizmo})` : ''}`);
  if (chat.created != null) lines.push(`- Started: ${stamp(chat.created)}`);
  if (chat.updated != null && chat.updated !== chat.created) lines.push(`- Last change: ${stamp(chat.updated)}`);
  lines.push(`- Messages: ${chat.messages.length}`);
  if (chat.id) lines.push(`- Chat id: ${chat.id}`);
  for (const m of chat.messages) {
    const who = m.role === 'user' ? 'You' : m.role === 'tool' ? `Tool${m.tool ? ` (${m.tool})` : ''}` : label;
    lines.push('', `### ${who}${m.time != null ? `, ${stamp(m.time)}` : ''}`, '', m.text);
  }
  return lines.join('\n') + '\n';
}
/** Every chat of one GPT in one Markdown file (the easiest form to add to a Claude project's knowledge). */
export function allChatsMd(chats, label = 'GPT') {
  const head = [`# Chats with ${label}`, '', `${chats.length} chat${chats.length === 1 ? '' : 's'}, newest first. Saved with Skillcase from a ChatGPT data export.`, ''];
  return head.join('\n') + chats.map(c => chatMd(c, label).replace(/^# /, '## ').replace(/^### /gm, '#### ')).join('\n---\n\n');
}
/** chats.json: the same chats as plain data */
export const chatsJson = (chats, label) => JSON.stringify({ format: 'skillcase-gpt-chats', version: 1, gpt: label, chats: chats.map(c => ({ id: c.id, title: c.title, gpt_id: c.gizmo || null, created: c.created, updated: c.updated, messages: c.messages.map(m => ({ role: m.role, tool: m.tool || undefined, time: m.time, text: m.text })) })) }, null, 2) + '\n';
/** file names for chats: "2026-03-02 trail-snacks-for-a-3-day-hike.md", unique */
export function chatFileNames(chats) {
  return uniqueNames(chats.map(c => `${dayOf(c.created) || 'undated'} ${slugTitle(c.title)}.md`));
}

/* ---------------- the backup ---------------- */
/** gpt.json: the portable record of the GPT (no file contents, no secrets) */
export function gptJson(g, { files = [], chats = [], today = '', now = Date.now() } = {}) {
  const names = uniqueNames(files.map(f => safeFileName(f.name)));
  return JSON.stringify({
    format: 'skillcase-gpt-backup', version: 1,
    exported_at: new Date(now).toISOString(), exported_on: today || undefined, exported_with: `${TOOL_NAME}, ${TOOL_URL}`,
    source: { product: 'ChatGPT custom GPT', gpt_id: g.gptId || null, url: g.gptId ? `https://chatgpt.com/g/${g.gptId}` : null },
    name: g.name, description: g.description, instructions: g.instructions, conversation_starters: g.starters,
    capabilities: { web_search: g.capabilities.web, image_generation: g.capabilities.image, code_interpreter: g.capabilities.code, canvas: g.capabilities.canvas },
    knowledge_files: files.map((f, i) => ({ name: names[i], size: f.bytes ? f.bytes.length : f.size || 0, type: f.type || '', path: `knowledge/${names[i]}` })),
    actions: g.actions.map((a, i) => { const s = summarizeSchema(a.schema); return { file: `actions/${actionFile(a, i)}`, format: s.format, title: s.title, openapi: s.version, servers: s.servers, operations: s.operations, auth: a.auth, privacy_policy_url: a.privacy || null }; }),
    skill_name: skillName(g.name),
    chats: chats.length ? { count: chats.length, folder: 'chats/' } : null,
  }, null, 2) + '\n';
}

/** README.md: what is in the backup and how to put it back to work */
export function readmeMd(g, { files = [], chats = [], today = '', checked = '' } = {}) {
  const name = skillName(g.name);
  const geminiLeft = skillFiles(files, 'gemini').left;
  const rows = [
    ['gpt.json', 'Everything about the GPT as data: name, description, instructions, starters, capabilities, file list, actions'],
    ['instructions.md', 'The instructions, exactly as pasted'],
  ];
  if (g.starters.length) rows.push(['conversation-starters.md', 'The conversation starters']);
  if (files.length) rows.push(['knowledge/', `The ${files.length} knowledge file${files.length === 1 ? '' : 's'} you added`]);
  if (g.actions.length) rows.push(['actions/', 'Each action\'s OpenAPI schema and a note on rebuilding it']);
  rows.push([`skill/${name}/`, 'The GPT as a skill folder (SKILL.md) for Claude and ChatGPT']);
  rows.push(['skill-for-claude-and-chatgpt.zip', 'The same skill folder as a ZIP, ready to upload']);
  rows.push(['skill-for-gemini.zip', `The skill for Gemini: SKILL.md at the top, plain-text files only${geminiLeft.length ? ` (${geminiLeft.length} left out)` : ''}`]);
  rows.push(['claude-project/project-instructions.md', 'The steps and text for a Claude project']);
  rows.push(['ollama/Modelfile', 'The instructions as a Modelfile for Ollama']);
  if (chats.length) rows.push(['chats/', `${chats.length} chat${chats.length === 1 ? '' : 's'} with the GPT from your ChatGPT export: one Markdown file each, all-chats.md and chats.json`]);
  const L = [`# ${gptLabel(g)}: GPT backup`, '',
    `Saved with Skillcase (${TOOL_URL})${today ? ` on ${today}` : ''}. Skillcase is an independent tool by Peak Apps Studio and is not affiliated with OpenAI, Anthropic, Google or Ollama.`, '',
    '## What is in this folder', '', '| Path | What it is |', '| --- | --- |', ...rows.map(([p, w]) => `| \`${p}\` | ${w} |`), '',
    '## Put it back to work', '',
    '### ChatGPT', '',
    'OpenAI is moving custom GPTs to plugins: its migration turns a GPT\'s instructions into a skill and copies the knowledge files. If you created the GPT and see "Migrate to plugin" next to it in My GPTs, use that first. OpenAI\'s skills follow the open Agent Skills format, the same SKILL.md folder as `skill/`.', '',
    '### Claude', '',
    'Skill: in Claude, open Customize, then Skills, click +, choose Create skill, then Upload a skill, and pick `skill-for-claude-and-chatgpt.zip`. Anthropic says skills need code execution turned on in Settings.',
    'Project: follow `claude-project/project-instructions.md`.', '',
    '### Gemini', '',
    'In the Gemini app, create a skill by uploading `skill-for-gemini.zip` (or the SKILL.md file inside it). Google says skills take plain-text files up to 100 MB in total, and that you must be 18 or over with Keep Activity on.', '',
    '### A model on your own computer (Ollama)', '',
    'Edit the FROM line of `ollama/Modelfile` to a model you have pulled, then run `ollama create ' + name + ' -f Modelfile`.', '',
    '## Not in this backup', '',
    '- API keys, tokens and OAuth secrets of actions. Enter them again where you rebuild a connection.',
    '- The model the GPT was set to use. OpenAI says the selected model does not carry over in its migration either.',
    '- Knowledge files you did not add on the Skillcase page.',
  ];
  if (geminiLeft.length) L.push(`- In the Gemini skill only: ${geminiLeft.map(f => f.name).join(', ')} (not plain text). They are in \`knowledge/\`.`);
  L.push('', '## Sources', '',
    '- OpenAI, Moving your custom GPT workflows to plugins: https://learn.chatgpt.com/docs/migrate-custom-gpts',
    '- OpenAI, Custom GPT retirement and migration FAQ: https://help.openai.com/en/articles/20001519-custom-gpt-retirement-and-migration-faq',
    '- OpenAI, Build skills: https://learn.chatgpt.com/docs/build-skills',
    '- Agent Skills specification: https://agentskills.io/specification',
    '- Anthropic, Using Skills in Claude: https://support.claude.com/en/articles/12512180-using-skills-in-claude',
    '- Anthropic, What are projects?: https://support.claude.com/en/articles/9517075-what-are-projects',
    '- Google, Create and manage skills for Gemini Apps: https://support.google.com/gemini/answer/17094296',
    '- Ollama, Modelfile reference: https://github.com/ollama/ollama/blob/main/docs/modelfile.mdx',
    checked ? `\nLast checked: ${checked}.` : '');
  return L.join('\n').replace(/\n+$/, '') + '\n';
}

/** Every file of the backup ZIP, as { path: bytes }. files: [{ name, type, bytes }]; chats: flattened chats. */
export function backupEntries(g, { files = [], chats = [], label = '', today = '', now = Date.now(), checked = '' } = {}) {
  const name = skillName(g.name);
  const root = `${name}-gpt-backup/`;
  const out = {};
  const put = (p, s) => { out[root + p] = typeof s === 'string' ? strToU8(s) : s; };
  put('README.md', readmeMd(g, { files, chats, today, checked }));
  put('gpt.json', gptJson(g, { files, chats, today, now }));
  put('instructions.md', `# ${gptLabel(g)}: instructions\n\n${g.instructions || '(empty)'}\n`);
  if (g.starters.length) put('conversation-starters.md', `# ${gptLabel(g)}: conversation starters\n\n${g.starters.map(s => `- ${s}`).join('\n')}\n`);
  const names = uniqueNames(files.map(f => safeFileName(f.name)));
  files.forEach((f, i) => put(`knowledge/${names[i]}`, f.bytes || new Uint8Array(0)));
  g.actions.forEach((a, i) => { put(`actions/${actionFile(a, i)}`, a.schema + '\n'); put(`actions/action-${i + 1}.md`, actionMd(g, a, i)); });
  for (const [p, b] of Object.entries(skillEntries(g, { files, variant: 'claude', today }))) put(`skill/${p}`, b);
  put('skill-for-claude-and-chatgpt.zip', zipEntries(skillEntries(g, { files, variant: 'claude', today })));
  put('skill-for-gemini.zip', zipEntries(skillEntries(g, { files, variant: 'gemini', today })));
  put('claude-project/project-instructions.md', claudeProjectMd(g, { files }));
  put('ollama/Modelfile', modelfile(g, { today }));
  if (chats.length) {
    const who = label || gptLabel(g);
    const fnames = chatFileNames(chats);
    chats.forEach((c, i) => put(`chats/${fnames[i]}`, chatMd(c, who)));
    put('chats/all-chats.md', allChatsMd(chats, who));
    put('chats/chats.json', chatsJson(chats, who));
  }
  return out;
}
/** The chats alone, for people who only want to keep their chats with a GPT (no setup pasted). */
export function chatsEntries(chats, { label = 'GPT', folder = 'gpt-chats' } = {}) {
  const root = `${skillName(folder)}/`;
  const out = {};
  const fnames = chatFileNames(chats);
  chats.forEach((c, i) => { out[`${root}${fnames[i]}`] = strToU8(chatMd(c, label)); });
  out[`${root}all-chats.md`] = strToU8(allChatsMd(chats, label));
  out[`${root}chats.json`] = strToU8(chatsJson(chats, label));
  return out;
}
/** zip { path: bytes } with fixed dates, so the same input gives the same file */
export function zipEntries(entries) {
  const d = new Date(Date.UTC(2026, 0, 1));
  const o = {};
  for (const [p, b] of Object.entries(entries)) o[p] = [b, { mtime: d, level: /\.(zip|png|jpe?g|gif|webp|mp4|mp3|gz|7z|docx|xlsx|pptx)$/i.test(p) ? 0 : 6 }];
  return zipSync(o);
}
