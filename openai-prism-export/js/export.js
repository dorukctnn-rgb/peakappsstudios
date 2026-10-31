/* What Splitlight saves. Free, one project at a time: an Overleaf-ready ZIP (or the parts it needs), the main document as
 * one .tex with every \input pulled in, one chat as Markdown, and the check of the whole export as text. Pro: all of it
 * for every project and every chat in one ZIP, with a spreadsheet of the projects and a page of the chats that opens
 * offline. Everything is built in this tab; nothing is sent. */
import { writeZip } from './zip.js';
import { toCsv } from './csv.js';
import { textOf } from './parse.js';
import * as T from './tex.js';

export const TOOL_URL = 'peakappsstudio.com/openai-prism-export/';
export const esc = s => String(s ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&#39;');
export const isoDay = ms => (ms == null ? '' : new Date(ms).toISOString().slice(0, 10));
export const isoTime = ms => (ms == null ? '' : new Date(ms).toISOString().replace('T', ' ').slice(0, 16) + ' UTC');
export const mb = b => (b >= 1e9 ? `${(b / 1e9).toFixed(2)} GB` : b >= 1e6 ? `${(b / 1e6).toFixed(1)} MB` : `${Math.max(1, Math.round(b / 1e3))} KB`);

const COMBINING = new RegExp('[' + String.fromCharCode(0x300) + '-' + String.fromCharCode(0x36f) + ']', 'g');
export function safeName(s, max = 60) {
  const t = String(s ?? '').normalize('NFKD').replace(COMBINING, '').replace(/[^A-Za-z0-9._ -]+/g, '').trim().replace(/\s+/g, '-').replace(/-+/g, '-');
  return (t || 'project').slice(0, max).replace(/[-.]+$/, '') || 'project';
}

/* ------------------------------------------------------------------ Overleaf */
async function zipItems(project, rels) {
  const byRel = new Map(project.files.map(f => [f.rel, f]));
  return rels.map(rel => {
    const f = byRel.get(rel);
    return f.entry ? { name: rel, entry: f.entry } : { name: rel, data: f.file };
  });
}
/* The ZIP (or ZIPs) to upload to Overleaf: files at the top of the ZIP, never inside a wrapper folder (Overleaf's help
 * asks for that so it finds the main document), build files left out. */
export async function overleafZips(project, { date = new Date() } = {}) {
  const plan = project.overleaf;
  const base = safeName(project.label || project.name, 50);
  const n = plan.parts.length;
  const out = [];
  for (let i = 0; i < n; i++) {
    const blob = await writeZip(await zipItems(project, plan.parts[i]), { date });
    out.push({ name: n === 1 ? `${base}-overleaf.zip` : `${base}-overleaf-part-${i + 1}-of-${n}.zip`, blob, files: plan.parts[i].length, part: i + 1, of: n });
  }
  return out;
}
/* What to do with the parts, in words, for the README and the page. */
export function overleafSteps(project) {
  const p = project.overleaf;
  const L = [];
  if (!p.parts.length) return ['There is nothing to upload in this project.'];
  if (p.parts.length === 1) {
    L.push('In Overleaf: New project > Upload project, then choose the ZIP.');
  } else {
    L.push(`Overleaf takes at most 180 files and 50 MB in one upload, so this project comes in ${p.parts.length} parts.`);
    L.push('1. New project > Upload project, and choose part 1. It holds every .tex, .bib and style file, so the project opens with all its text.');
    L.push('2. For each further part: unzip it on your computer. In the Overleaf file tree, select the folder with the same name (figures, for example; make it with New folder if it is not there yet), choose Upload, and pick the files from that folder of the part.');
  }
  if (project.main) {
    L.push(`Main document: ${project.main.path}. If Overleaf opens another file, set it under Menu > Main document.`);
    if (project.main.engine !== 'pdfLaTeX') L.push(`Compiler: ${project.main.engine} (${project.main.engineWhy}). Overleaf starts with pdfLaTeX; change it under Menu > Compiler.`);
  }
  if (p.tooBig.length) L.push(`Over 50 MB, so Overleaf will not take them: ${p.tooBig.join(', ')}. Make them smaller (a PNG as JPG, a PDF figure exported again) and upload them on their own.`);
  return L;
}

/* ------------------------------------------------------------------ one .tex */
export function singleTex(project, docPath = project.main && project.main.path) {
  if (!docPath) return null;
  const doc = project.docs.find(d => d.path === docPath);
  const bblPath = docPath.replace(/\.(tex|ltx)$/i, '.bbl');
  const bblHit = doc && doc.bibSystem === 'bibtex' ? project.find(bblPath) : null;
  const bbl = bblHit ? project.texts.get(bblHit.path) ?? null : null;
  const r = T.flatten(docPath, project.texts, project.find, { bbl });
  const head = [
    `% One-file copy of ${docPath}, made by Splitlight (${TOOL_URL}) from an OpenAI Prism export.`,
    `% Every \\input, \\include, \\subfile and \\import found in the project is pulled in below, between "%%% begin" and "%%% end" lines.`,
  ];
  const stillNeeded = doc ? [...doc.graphics, ...(bbl ? [] : doc.bib), ...doc.styles] : [];
  if (stillNeeded.length) head.push(`% Still read from the project folder: ${stillNeeded.slice(0, 12).join(', ')}${stillNeeded.length > 12 ? ` and ${stillNeeded.length - 12} more` : ''}.`);
  if (bbl) head.push('% The bibliography (.bbl) is pulled in too, in place of \\bibliography.');
  if (r.missing.length) head.push(`% Not in the export, so left as they were: ${r.missing.join(', ')}.`);
  for (const n of r.notes) head.push(`% ${n}`);
  const lines = r.text.split('\n');
  let k = 0;
  while (k < lines.length && /^\s*%\s*!\s*TeX/i.test(lines[k])) k++;
  const text = [...lines.slice(0, k), ...head, ...lines.slice(k)].join('\n');
  const name = `${safeName(T.baseOf(docPath).replace(/\.(tex|ltx)$/i, ''), 50)}-single-file.tex`;
  return { name, text, pulled: r.pulled, missing: r.missing, bbl: !!bbl };
}

/* ------------------------------------------------------------------ chats */
export function chatMarkdown(c) {
  const L = [`# ${c.title || 'Prism chat'}`, ''];
  if (c.project) L.push(`Project: ${c.project}`);
  if (c.created != null) L.push(`Started: ${isoTime(c.created)}`);
  L.push(`Saved with Splitlight (${TOOL_URL}) from ${c.file}.`, '');
  for (const m of c.messages) {
    L.push(`## ${m.role}${m.ts != null ? ` (${isoTime(m.ts)})` : ''}`, '', m.text, '');
  }
  return L.join('\n');
}
export function chatsHtml(model, { date = new Date() } = {}) {
  const convs = model.chats;
  const toc = convs.map((c, i) => `<li><a href="#c${i}">${esc(c.title)}</a>${c.project ? ` <span class="p">${esc(c.project)}</span>` : ''}</li>`).join('\n');
  const body = convs.map((c, i) => `<section id="c${i}"><h2>${esc(c.title)}</h2><p class="meta">${c.project ? `Project: ${esc(c.project)}. ` : ''}${c.created != null ? `Started ${esc(isoTime(c.created))}. ` : ''}From ${esc(c.file)}.</p>
${c.messages.map(m => `<div class="m ${m.role === 'You' ? 'you' : 'them'}"><p class="who">${esc(m.role)}${m.ts != null ? ` <span>${esc(isoTime(m.ts))}</span>` : ''}</p><div class="t">${esc(m.text)}</div></div>`).join('\n')}
</section>`).join('\n');
  return `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1">
<meta http-equiv="Content-Security-Policy" content="default-src 'none'; style-src 'unsafe-inline'">
<title>Prism chats, saved ${esc(isoDay(date.getTime()))}</title>
<style>body{font:17px/1.6 system-ui,-apple-system,"Segoe UI",sans-serif;max-width:860px;margin:0 auto;padding:24px 18px 60px;color:#16181d;background:#fff}h1{font-size:28px}h2{font-size:22px;margin:42px 0 4px;border-top:2px solid #16181d;padding-top:14px}.meta,.p,.who span{color:#555b66;font-size:15px}.m{margin:12px 0;padding:10px 14px;border-radius:8px;background:#eef0f3}.m.you{background:#e3f4f6}.who{font-weight:700;margin:0 0 4px}.t{white-space:pre-wrap;overflow-wrap:anywhere}@media print{h2{break-before:page}}</style></head>
<body><h1>Prism chats</h1><p class="meta">${convs.length} chats from an OpenAI Prism export, saved with Splitlight (${esc(TOOL_URL)}) on ${esc(isoDay(date.getTime()))}. This page opens offline.</p>
<ol>${toc}</ol>
${body}
</body></html>`;
}

/* ------------------------------------------------------------------ the check, as text and as a spreadsheet */
const PROBLEM_TEXT = {
  'no-main': 'No main document found (no .tex with \\documentclass and \\begin{document}).',
  'file-over-50mb': 'A file is over 50 MB, the most Overleaf takes in one upload.',
  'over-2000-files': 'More than 2,000 files, the most an Overleaf project holds.',
  'over-7mb-text': 'More than 7 MB of text files, the most Overleaf keeps editable in one project.',
  'text-over-2mb': 'A text file is over 2 MB; Overleaf will not open it in the editor.',
};
export function problemText(code) { return PROBLEM_TEXT[code] || code; }
export function checkText(model, { date = new Date() } = {}) {
  const L = ['Prism export check', `Archive: ${model.label}`, `Checked with Splitlight (${TOOL_URL}) on ${isoDay(date.getTime())}. Nothing was uploaded.`, ''];
  L.push(`${model.projects.length} project${model.projects.length === 1 ? '' : 's'}, ${model.chats.length} chat${model.chats.length === 1 ? '' : 's'}.`, '');
  for (const e of model.errors) {
    L.push(`export-errors.json (${e.path}):`);
    if (e.items.length) for (const it of e.items) L.push(`  - ${it.project || 'a project'}${it.file ? `, ${it.file}` : ''}: ${it.error}`);
    else L.push(`  ${String(e.raw || '').slice(0, 2000)}`);
    L.push('  OpenAI\'s guide says to export the project again from its project-title menu, and to email support@openai.com if it is still missing.', '');
  }
  for (const p of model.projects) {
    L.push(`== ${p.label}`);
    L.push(`Files: ${p.files.length} (${mb(p.size)}), figures: ${p.figures}, bibliography entries: ${p.bibCount}.`);
    if (p.main) {
      const d = p.main;
      L.push(`Main document: ${d.path}${p.docs.length > 1 ? ` (other documents: ${p.docs.slice(1).map(x => x.path).join(', ')})` : ''}`);
      if (d.outline.title) L.push(`Title: ${d.outline.title}`);
      if (d.outline.authors.length) L.push(`Authors: ${d.outline.authors.join('; ')}`);
      L.push(`Engine: ${d.engine} (${d.engineWhy}). Bibliography: ${d.bibSystem === 'none' ? 'none found' : `${d.bibSystem}${d.bibBackend !== 'none' ? ` with ${d.bibBackend}` : ''}`}.`);
      L.push(`About ${d.words.toLocaleString('en-US')} words. ${d.outline.sections.length} headings.`);
      if (d.missing.length) { L.push('Referenced but not in the export:'); for (const m of d.missing) L.push(`  - ${m.target} (\\${m.cmd} in ${m.from})`); }
      if (d.caseOnly.length) { L.push('Letter case differs (works on Windows and macOS, fails on Overleaf):'); for (const m of d.caseOnly) L.push(`  - ${m.target} is ${m.actual}`); }
    } else L.push(problemText('no-main'));
    const o = p.overleaf;
    L.push(`Overleaf: ${o.files} files, about ${mb(o.zipBytes)} as a ZIP: ${o.parts.length <= 1 ? 'fits in one upload' : `needs ${o.parts.length} uploads`}.`);
    for (const c of o.problems.filter(x => x !== 'no-main')) L.push(`  ${problemText(c)}`);
    if (p.junk.length) L.push(`Build files left out of the Overleaf ZIP: ${p.junk.length}.`);
    if (p.unusedFigures.length) L.push(`Figures no document uses (as far as the \\includegraphics lines show): ${p.unusedFigures.length}.`);
    L.push('');
  }
  if (model.other.length) { L.push(`Other files in the archive: ${model.other.map(o => o.path).join(', ')}`, ''); }
  if (model.rawChats.length) { L.push(`Chat files we could not read as chats: ${model.rawChats.map(r => r.path).join(', ')}`, ''); }
  L.push('Not in any Prism export, says OpenAI: project history, inline comments, collaborators and the live Zotero connection.');
  return L.join('\n');
}
export function inventoryCsv(model) {
  const header = ['Project', 'Archive', 'Main document', 'Other documents', 'Title', 'Engine', 'Bibliography', 'Bibliography entries', 'Words (about)', 'Files', 'Size (MB)', 'Figures', 'Unused figures', 'Missing files', 'Case mismatches', 'Overleaf uploads needed', 'Overleaf problems', 'Chats'];
  const rows = model.projects.map(p => {
    const d = p.main;
    return [p.label, p.nested || p.group, d ? d.path : '', p.docs.slice(1).map(x => x.path).join('; '), d ? d.outline.title : '', d ? d.engine : '', d ? d.bibSystem : '', p.bibCount, d ? d.words : '', p.files.length, (p.size / 1e6).toFixed(2), p.figures, p.unusedFigures.length,
      d ? d.missing.map(m => m.target).join('; ') : '', d ? d.caseOnly.map(m => `${m.target} > ${m.actual}`).join('; ') : '', p.overleaf.parts.length, p.overleaf.problems.map(problemText).join(' '), p.chats.length];
  });
  return toCsv(header, rows);
}

/* ------------------------------------------------------------------ Pro: everything at once */
export async function bundleZip(model, { date = new Date(), onProgress = () => {} } = {}) {
  const items = [];
  const used = new Set();
  const folderFor = p => { let n = safeName(p.label, 50); let k = 2; while (used.has(n)) n = `${safeName(p.label, 46)}-${k++}`; used.add(n); return n; };
  const readme = [
    'Your OpenAI Prism export, sorted by Splitlight',
    `Made on ${isoDay(date.getTime())} at ${TOOL_URL}, in your browser. Nothing was uploaded.`,
    '',
    'projects/<name>/overleaf/  the ZIP to upload to Overleaf (New project > Upload project). Large projects come in parts; the',
    '                           README in each project folder says what to do with them.',
    'projects/<name>/<document>-single-file.tex  the document with every \\input pulled in: one .tex for tools that compile a',
    '                           single file. Figures and the .bib are still read from the project folder.',
    'chats/                     every Prism chat as Markdown, and all-chats.html, a page that opens offline.',
    'projects.csv               one row per project: main document, engine, files, words, what is missing, Overleaf uploads.',
    'check.txt                  the full check of the export.',
    '',
    'Keep the ZIP you downloaded from Prism as well: it is the original.',
  ];
  items.push({ name: 'README.txt', data: readme.join('\r\n') });
  items.push({ name: 'check.txt', data: checkText(model, { date }) });
  items.push({ name: 'projects.csv', data: inventoryCsv(model) });
  let i = 0;
  for (const p of model.projects) {
    i++;
    onProgress(`project ${i} of ${model.projects.length}`);
    const dir = `projects/${folderFor(p)}`;
    for (const z of await overleafZips(p, { date })) items.push({ name: `${dir}/overleaf/${z.name}`, data: z.blob });
    for (const d of p.docs) { const s = singleTex(p, d.path); if (s) items.push({ name: `${dir}/${s.name}`, data: s.text }); }
    items.push({ name: `${dir}/README.txt`, data: [`${p.label}`, '', ...overleafSteps(p)].join('\r\n') });
  }
  if (model.chats.length) {
    onProgress('chats');
    const names = new Set();
    model.chats.forEach((c, k) => {
      const folder = c.project ? safeName(c.project, 40) : 'other';
      let n = `chats/${folder}/${String(k + 1).padStart(3, '0')}-${safeName(c.title, 50)}.md`;
      while (names.has(n)) n = n.replace(/\.md$/, '-2.md');
      names.add(n);
      items.push({ name: n, data: chatMarkdown(c) });
    });
    items.push({ name: 'chats/all-chats.html', data: chatsHtml(model, { date }) });
  }
  for (const r of model.rawChats) items.push({ name: `chats/not-read-as-chat/${safeName(T.baseOf(r.path).replace(/\.json$/i, ''), 50)}.json`, data: r.text });
  onProgress('writing the ZIP');
  const blob = await writeZip(items, { date });
  return { name: `prism-export-sorted-${isoDay(date.getTime())}.zip`, blob, count: items.length };
}

/* A text file of the project as the page shows it (for the file viewer). */
export async function fileText(project, rel) {
  const f = project.files.find(x => x.rel === rel);
  if (!f) return '';
  if (project.texts.has(rel)) return project.texts.get(rel);
  return textOf(f);
}
