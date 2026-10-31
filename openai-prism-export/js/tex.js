/* Splitlight's LaTeX reader. It reads the .tex files of a project the way a TeX run would find them, without running TeX:
 * which file is the main document, which files it pulls in (\input, \include, \subfile, \import), which figures and
 * bibliography files it asks for and whether they are in the export, which engine it needs (pdfLaTeX, XeLaTeX or LuaLaTeX),
 * the title, authors, abstract and section headings, a rough word count, and one .tex with every \input pulled in.
 * Pure functions on strings; nothing here touches the network or the page. */

export const TEXT_EXT = new Set(['tex', 'ltx', 'bib', 'bbl', 'sty', 'cls', 'bst', 'bbx', 'cbx', 'lbx', 'dbx', 'def', 'cfg', 'clo', 'dtx', 'ins', 'txt', 'md', 'csv', 'tsv', 'dat', 'json', 'yaml', 'yml', 'xml', 'r', 'py', 'm', 'jl', 'gp', 'tikz', 'pgf', 'latexmkrc', 'gitignore', 'bat', 'sh', 'lua', 'cpp', 'c', 'h', 'java', 'js', 'html', 'svg', 'ris', 'enl', 'nbib']);
export const IMAGE_EXT = new Set(['png', 'jpg', 'jpeg', 'gif', 'pdf', 'eps', 'ps', 'svg', 'tif', 'tiff', 'bmp', 'webp']);
/* What a TeX run leaves behind; Overleaf makes these again on every compile, so they stay out of an upload. */
export const BUILD_EXT = new Set(['aux', 'log', 'out', 'toc', 'lof', 'lot', 'fls', 'fdb_latexmk', 'blg', 'bcf', 'nav', 'snm', 'vrb', 'xdv', 'dvi', 'synctex', 'idx', 'ilg', 'ind', 'glo', 'gls', 'glg', 'acn', 'acr', 'alg', 'ist', 'thm', 'loa', 'lol', 'run.xml', 'synctex.gz', 'synctex(busy)', 'bak', 'sav', 'tdo', 'listing', 'auxlock']);
const LATEX_OK_EXT = new Set([...TEXT_EXT, ...IMAGE_EXT, 'ttf', 'otf', 'pfb', 'afm', 'tfm', 'map', 'enc', 'vf', 'mf', 'bbl']);

export function extOf(path) {
  const base = String(path).split('/').pop().toLowerCase();
  if (base.endsWith('.synctex.gz')) return 'synctex.gz';
  if (base.endsWith('.run.xml')) return 'run.xml';
  if (base === 'latexmkrc' || base === '.latexmkrc') return 'latexmkrc';
  const i = base.lastIndexOf('.');
  return i <= 0 ? '' : base.slice(i + 1);
}
export function kindOf(path) {
  const e = extOf(path);
  if (e === 'tex' || e === 'ltx') return 'tex';
  if (e === 'bib') return 'bib';
  if (BUILD_EXT.has(e)) return 'build';
  if (['sty', 'cls', 'bst', 'bbx', 'cbx', 'lbx', 'dbx', 'def', 'cfg', 'clo'].includes(e)) return 'style';
  if (IMAGE_EXT.has(e)) return 'figure';
  if (TEXT_EXT.has(e)) return 'text';
  return 'other';
}
export const isText = path => TEXT_EXT.has(extOf(path)) || BUILD_EXT.has(extOf(path)) && ['log', 'aux', 'toc', 'out', 'blg'].includes(extOf(path));
/* File types Overleaf's upload help says a project should hold (text and the image types a compiler reads). */
export const latexFriendly = path => LATEX_OK_EXT.has(extOf(path)) || BUILD_EXT.has(extOf(path)) || extOf(path) === '';

/* ------------------------------------------------------------------ paths */
export function normPath(p) {
  const out = [];
  for (const part of String(p).replace(/\\/g, '/').split('/')) {
    if (!part || part === '.') continue;
    if (part === '..') { if (out.length && out[out.length - 1] !== '..') out.pop(); else out.push('..'); continue; }
    out.push(part);
  }
  return out.join('/');
}
export const dirOf = p => { const i = p.lastIndexOf('/'); return i < 0 ? '' : p.slice(0, i); };
export const baseOf = p => p.slice(p.lastIndexOf('/') + 1);
export const joinPath = (a, b) => normPath(a ? `${a}/${b}` : b);

/* ------------------------------------------------------------------ comments and verbatim */
/* Where the comment on a line starts: the first % that is not escaped by an odd run of backslashes. */
export function commentAt(line) {
  for (let i = 0; i < line.length; i++) {
    if (line[i] !== '%') continue;
    let k = i - 1, n = 0;
    while (k >= 0 && line[k] === '\\') { n++; k--; }
    if (n % 2 === 0) return i;
  }
  return -1;
}
const VERB_ENVS = ['verbatim', 'verbatim*', 'Verbatim', 'Verbatim*', 'lstlisting', 'minted', 'comment', 'filecontents', 'filecontents*', 'alltt', 'BVerbatim', 'LVerbatim'];
const VERB_BEGIN = new RegExp(`\\\\begin\\s*\\{(${VERB_ENVS.map(e => e.replace(/\*/g, '\\*')).join('|')})\\}`);

/* Splits source into lines, each with the part TeX reads as code (before any comment) and whether it sits inside a
 * verbatim-like environment (where nothing is a command). */
export function codeLines(src) {
  const lines = String(src).split('\n');
  const out = [];
  let verb = null;
  for (const raw of lines) {
    const line = raw.replace(/\r$/, '');
    if (verb) {
      const end = line.indexOf(`\\end{${verb}}`);
      if (end >= 0) { out.push({ raw, code: '', verbatim: true }); verb = null; continue; }
      out.push({ raw, code: '', verbatim: true });
      continue;
    }
    const c = commentAt(line);
    const code = c < 0 ? line : line.slice(0, c);
    const m = code.match(VERB_BEGIN);
    if (m && code.indexOf(`\\end{${m[1]}}`, m.index) < 0) {
      out.push({ raw, code: code.slice(0, m.index), verbatim: false });
      verb = m[1];
      continue;
    }
    out.push({ raw, code, verbatim: false });
  }
  return out;
}
export const stripComments = src => codeLines(src).map(l => l.code).join('\n');

/* The text inside the balanced braces that open at s[i] ('{'); returns { text, end } or null. */
export function braced(s, i) {
  if (s[i] !== '{') return null;
  let depth = 0;
  for (let k = i; k < s.length; k++) {
    const c = s[k];
    if (c === '\\') { k++; continue; }
    if (c === '{') depth++;
    else if (c === '}') { depth--; if (depth === 0) return { text: s.slice(i + 1, k), end: k + 1 }; }
  }
  return null;
}
/* Skips spaces and an optional [..] argument starting at i; returns the index of what follows. */
function skipOpt(s, i) {
  while (s[i] === ' ' || s[i] === '\t' || s[i] === '\n') i++;
  if (s[i] === '*') i++;
  while (s[i] === ' ' || s[i] === '\t' || s[i] === '\n') i++;
  while (s[i] === '[') {
    let depth = 0;
    for (; i < s.length; i++) {
      if (s[i] === '[') depth++;
      else if (s[i] === ']') { depth--; if (depth === 0) { i++; break; } }
    }
    while (s[i] === ' ' || s[i] === '\t' || s[i] === '\n') i++;
  }
  return i;
}
/* Every use of \name in code: its (optional-argument-skipped) brace arguments. n = how many brace arguments to take. */
export function commandArgs(code, name, n = 1) {
  const re = new RegExp(`\\\\${name}(?![A-Za-z@])`, 'g');
  const out = [];
  let m;
  while ((m = re.exec(code))) {
    let i = skipOpt(code, m.index + m[0].length);
    const args = [];
    for (let k = 0; k < n; k++) {
      const b = braced(code, i);
      if (!b) break;
      args.push(b.text);
      i = skipOpt(code, b.end);
      if (k < n - 1) while (code[i] === ' ' || code[i] === '\n') i++;
    }
    if (args.length === n) out.push({ args, index: m.index, end: i });
  }
  return out;
}

/* ------------------------------------------------------------------ text cleanup for titles and outlines */
const ACCENTS = { "'": '\u0301', '`': '\u0300', '^': '\u0302', '"': '\u0308', '~': '\u0303', '=': '\u0304', '.': '\u0307', u: '\u0306', v: '\u030c', H: '\u030b', c: '\u0327', k: '\u0328' };
const NAMED = { ss: 'ß', o: 'ø', O: 'Ø', ae: 'æ', AE: 'Æ', oe: 'œ', OE: 'Œ', aa: 'å', AA: 'Å', l: 'ł', L: 'Ł', i: 'ı', LaTeX: 'LaTeX', TeX: 'TeX', textendash: '-', textemdash: '-', ldots: '...', dots: '...', textellipsis: '...', S: '§', P: '¶', copyright: '©', textregistered: '®', texttrademark: '™' };
export function plainText(tex) {
  let s = String(tex);
  s = s.replace(/\\(thanks|footnote|footnotemark|label|ref|cite[a-zA-Z]*|eqref|url|href|orcidlink|email|affil|affiliation|inst|textsuperscript|thanksref|corref|fnref)\s*(\[[^\]]*\])?\s*\{(?:[^{}]|\{[^{}]*\})*\}/g, '');
  s = s.replace(/\\([`'^"~=.])\s*\{?([A-Za-z])\}?/g, (m, a, ch) => (ch + ACCENTS[a]).normalize('NFC'));
  s = s.replace(/\\([uvHck])\s*\{([A-Za-z])\}/g, (m, a, ch) => (ch + ACCENTS[a]).normalize('NFC'));
  s = s.replace(/\\([A-Za-z]+)\b\s*(\{\})?/g, (m, n) => (NAMED[n] != null ? NAMED[n] : m));
  s = s.replace(/\\\\(\[[^\]]*\])?/g, ' ').replace(/\\newline|\\linebreak|\\par\b/g, ' ');
  s = s.replace(/\$([^$]*)\$/g, '$1');
  s = s.replace(/\\[&%$#_{}]/g, m => m[1]);
  s = s.replace(/\\[A-Za-z@]+\*?(\[[^\]]*\])?/g, '');
  s = s.replace(/[{}]/g, '').replace(/~/g, ' ').replace(/``|''/g, '"').replace(/--+/g, '-');
  return s.replace(/\s+/g, ' ').trim();
}

/* ------------------------------------------------------------------ the main document */
export const hasDocumentclass = src => codeLines(src).some(l => /\\documentclass(?![A-Za-z@])/.test(l.code) || /\\documentstyle(?![A-Za-z@])/.test(l.code));
const isSubfileDoc = src => /\\documentclass\s*\[[^\]]*\]\s*\{\s*subfiles\s*\}/.test(stripComments(src));
const hasBeginDocument = src => /\\begin\s*\{document\}/.test(stripComments(src));
export function magicRoot(src) {
  const m = String(src).match(/^\s*%\s*!\s*TeX\s+root\s*=\s*(.+?)\s*$/im);
  return m ? m[1] : null;
}
export function magicProgram(src) {
  const m = String(src).match(/^\s*%\s*!\s*TeX\s+(?:TS-)?program\s*=\s*([A-Za-z]+)/im);
  return m ? m[1].toLowerCase() : null;
}

/* The documents of a project: every .tex that starts a document (a \documentclass and \begin{document}), not counting
 * the stand-alone parts of a subfiles project. The main one first: main.tex, then a name like the project's, then the
 * shallowest, then the largest. texts: Map path -> source. */
export function findRoots(texts, projectName = '') {
  const docs = [];
  for (const [path, src] of texts) {
    if (kindOf(path) !== 'tex') continue;
    if (!hasDocumentclass(src) || !hasBeginDocument(src)) continue;
    docs.push({ path, src, subfile: isSubfileDoc(src) });
  }
  const real = docs.filter(d => !d.subfile);
  const list = real.length ? real : docs;
  const want = String(projectName).toLowerCase().replace(/[^a-z0-9]+/g, '');
  const score = d => {
    const b = baseOf(d.path).toLowerCase();
    const stem = b.replace(/\.(tex|ltx)$/, '').replace(/[^a-z0-9]+/g, '');
    let s = 0;
    if (b === 'main.tex') s += 100;
    if (want && stem === want) s += 60;
    if (/^(paper|thesis|manuscript|article|document|report|ms|root)\.tex$/.test(b)) s += 30;
    if (/(response|rebuttal|cover|letter|supp|supplement|appendix|poster|slides|beamer|template|example|sample)/.test(b)) s -= 25;
    s -= d.path.split('/').length * 10;
    s += Math.min(20, d.src.length / 4000);
    return s;
  };
  return list.sort((a, b) => score(b) - score(a) || a.path.localeCompare(b.path)).map(d => d.path);
}

/* ------------------------------------------------------------------ what a document asks for */
const GRAPHIC_EXT = ['', '.pdf', '.png', '.jpg', '.jpeg', '.eps', '.PDF', '.PNG', '.JPG', '.JPEG', '.EPS', '.ps', '.svg'];
const INPUT_CMDS = ['input', 'include', 'subfile', 'subfileinclude'];
const IMPORT_CMDS = ['import', 'subimport', 'inputfrom', 'subinputfrom', 'includefrom', 'subincludefrom'];

/* Finds a file in the project: the exact path first, then the same path with a different letter case (works on Windows
 * and macOS, fails on Overleaf and other Linux machines). Returns { path, caseOnly } or null. */
export function makeResolver(paths) {
  const exact = new Set(paths);
  const lower = new Map();
  for (const p of paths) { const k = p.toLowerCase(); if (!lower.has(k)) lower.set(k, p); }
  return (cand) => {
    const n = normPath(cand);
    if (exact.has(n)) return { path: n, caseOnly: false };
    const l = lower.get(n.toLowerCase());
    return l ? { path: l, caseOnly: true } : null;
  };
}
const cleanArg = a => String(a).trim().replace(/^"(.*)"$/, '$1').replace(/\\string\s*/g, '').replace(/\s*\\space\s*/g, ' ');

/* Walks a document from its main file and lists what it reads: { inputs, graphics, bib, styles, missing, caseOnly,
 * graphicspath, includeonly }. find: a resolver from makeResolver; texts: Map path -> source. */
export function walk(rootPath, texts, find) {
  const rootDir = dirOf(rootPath);
  const seen = new Set();
  const res = { inputs: [], graphics: [], bib: [], styles: [], missing: [], caseOnly: [], graphicspath: [], cycles: [] };
  const note = (kind, from, cmd, target, hit) => {
    if (!hit) { res.missing.push({ kind, from, cmd, target }); return; }
    if (hit.caseOnly) res.caseOnly.push({ kind, from, cmd, target, actual: hit.path });
    const list = kind === 'input' ? res.inputs : kind === 'graphic' ? res.graphics : kind === 'bib' ? res.bib : res.styles;
    if (!list.includes(hit.path)) list.push(hit.path);
  };
  const tryFind = (cands) => { for (const c of cands) { const h = find(c); if (h) return h; } return null; };
  /* \graphicspath can sit anywhere: a chapter, a preamble file, the project's own .cls. Every folder it names anywhere in
   * the project's .tex, .sty and .cls files is a place to look (both branches of an \ifpdf included). */
  for (const [p, src] of texts) {
    if (!['tex', 'style'].includes(kindOf(p))) continue;
    for (const g of commandArgs(stripComments(src), 'graphicspath')) {
      for (const m of g.args[0].matchAll(/\{([^{}]*)\}/g)) { const d = joinPath(rootDir, m[1]); if (!res.graphicspath.includes(d)) res.graphicspath.push(d); }
    }
  }
  const visit = (path, base, depth) => {
    if (seen.has(path)) { res.cycles.push(path); return; }
    if (depth > 30) return;
    seen.add(path);
    const src = texts.get(path);
    if (src == null) return;
    const code = codeLines(src).map(l => l.code).join('\n');
    for (const cmd of INPUT_CMDS) {
      for (const c of commandArgs(code, cmd)) {
        const t = cleanArg(c.args[0]);
        if (!t) continue;
        const cands = [joinPath(base, t), joinPath(base, `${t}.tex`), joinPath(rootDir, t), joinPath(rootDir, `${t}.tex`)];
        const hit = tryFind(cands);
        note('input', path, cmd, t, hit);
        if (hit && kindOf(hit.path) === 'tex') visit(hit.path, base, depth + 1);
      }
    }
    if (/\\input\s+[^\s{\\%]/.test(code)) {
      for (const m of code.matchAll(/\\input\s+([^\s{}\\%]+)/g)) {
        const t = m[1];
        const hit = tryFind([joinPath(base, t), joinPath(base, `${t}.tex`)]);
        note('input', path, 'input', t, hit);
        if (hit && kindOf(hit.path) === 'tex') visit(hit.path, base, depth + 1);
      }
    }
    for (const cmd of IMPORT_CMDS) {
      for (const c of commandArgs(code, cmd, 2)) {
        const d = cleanArg(c.args[0]);
        const f = cleanArg(c.args[1]);
        const nb = cmd.startsWith('sub') ? joinPath(dirOf(path), d) : joinPath(rootDir, d);
        const hit = tryFind([joinPath(nb, f), joinPath(nb, `${f}.tex`)]);
        note('input', path, cmd, `${d}${d.endsWith('/') ? '' : '/'}${f}`, hit);
        if (hit && kindOf(hit.path) === 'tex') visit(hit.path, nb, depth + 1);
      }
    }
    for (const cmd of ['includegraphics', 'includesvg', 'includepdf']) {
      for (const c of commandArgs(code, cmd)) {
        const t = cleanArg(c.args[0]);
        if (!t || /^#\d/.test(t) || t.includes('\\')) continue;
        const exts = cmd === 'includesvg' ? ['', '.svg'] : cmd === 'includepdf' ? ['', '.pdf'] : GRAPHIC_EXT;
        const dirs = [base, ...res.graphicspath.map(g => g)];
        const cands = [];
        for (const d of dirs) for (const e of exts) cands.push(joinPath(d, t + e));
        note('graphic', path, cmd, t, tryFind(cands));
      }
    }
    for (const c of commandArgs(code, 'bibliography')) {
      for (const part of c.args[0].split(',')) {
        const t = cleanArg(part);
        if (!t) continue;
        note('bib', path, 'bibliography', t, tryFind([joinPath(rootDir, t.endsWith('.bib') ? t : `${t}.bib`), joinPath(base, t.endsWith('.bib') ? t : `${t}.bib`)]));
      }
    }
    for (const cmd of ['addbibresource', 'addglobalbib', 'addsectionbib']) {
      for (const c of commandArgs(code, cmd)) {
        const t = cleanArg(c.args[0]);
        if (!t || /^https?:/i.test(t)) continue;
        note('bib', path, cmd, t, tryFind([joinPath(rootDir, t), joinPath(base, t)]));
      }
    }
    for (const c of commandArgs(code, 'documentclass')) {
      const t = cleanArg(c.args[0]);
      const hit = find(joinPath(rootDir, `${t}.cls`));
      if (hit) note('style', path, 'documentclass', t, hit);
    }
    for (const cmd of ['usepackage', 'RequirePackage']) {
      for (const c of commandArgs(code, cmd)) {
        for (const part of c.args[0].split(',')) {
          const t = cleanArg(part);
          if (!t) continue;
          const hit = find(joinPath(rootDir, `${t}.sty`));
          if (hit) note('style', path, cmd, t, hit);
        }
      }
    }
    for (const c of commandArgs(code, 'bibliographystyle')) {
      const t = cleanArg(c.args[0]);
      const hit = find(joinPath(rootDir, `${t}.bst`));
      if (hit) note('style', path, 'bibliographystyle', t, hit);
    }
  };
  visit(rootPath, rootDir, 0);
  return res;
}

/* ------------------------------------------------------------------ engine and bibliography */
export function engineOf(rootPath, texts, inputs = []) {
  const files = [rootPath, ...inputs].map(p => texts.get(p) || '');
  const prog = magicProgram(files[0]);
  if (prog && /xelatex|lualatex|pdflatex|latex/.test(prog)) {
    const e = prog.includes("xe") ? "XeLaTeX" : prog.includes("lua") ? "LuaLaTeX" : "pdfLaTeX";
    return { engine: e, why: `the line % !TEX program = ${prog} at the top` };
  }
  const code = files.map(stripComments).join('\n');
  const pkgs = new Set();
  for (const c of commandArgs(code, 'usepackage')) for (const p of c.args[0].split(',')) pkgs.add(p.trim());
  for (const c of commandArgs(code, 'RequirePackage')) for (const p of c.args[0].split(',')) pkgs.add(p.trim());
  const lua = ['luacode', 'luatexja', 'luatexja-fontspec', 'luacolor', 'lua-visual-debug', 'luaotfload', 'lualatex-math', 'selnolig'].find(p => pkgs.has(p));
  if (lua || /\\directlua\b/.test(code)) return { engine: 'LuaLaTeX', why: lua ? `the ${lua} package` : 'a \\directlua command' };
  const xe = ['fontspec', 'unicode-math', 'polyglossia', 'xeCJK', 'xltxtra', 'xunicode', 'mathspec', 'xepersian', 'bidi', 'xgreek', 'ctex'].find(p => pkgs.has(p));
  if (xe) return { engine: 'XeLaTeX', why: `the ${xe} package` };
  const cls = commandArgs(code, 'documentclass')[0];
  if (cls && /^(ctexart|ctexrep|ctexbook|ltjsarticle|ltjarticle)$/.test(cls.args[0].trim())) return { engine: cls.args[0].startsWith('ltj') ? 'LuaLaTeX' : 'XeLaTeX', why: `the ${cls.args[0].trim()} class` };
  return { engine: 'pdfLaTeX', why: 'no package that needs another engine' };
}
export function bibSystem(rootPath, texts, inputs = []) {
  const code = [rootPath, ...inputs].map(p => stripComments(texts.get(p) || '')).join('\n');
  const pk = commandArgs(code, 'usepackage').find(c => c.args[0].split(',').map(s => s.trim()).includes('biblatex'));
  if (pk) {
    const opt = code.slice(pk.index, pk.end).match(/backend\s*=\s*([a-z]+)/);
    return { system: 'biblatex', backend: opt ? opt[1] : 'biber' };
  }
  if (commandArgs(code, 'bibliography').length) return { system: 'bibtex', backend: 'bibtex' };
  if (/\\begin\s*\{thebibliography\}/.test(code)) return { system: 'inline', backend: 'none' };
  return { system: 'none', backend: 'none' };
}
/* Entries in a .bib file (not @string, @preamble or @comment). */
export function bibEntries(src) {
  const keys = [];
  for (const m of String(src).matchAll(/@\s*([A-Za-z]+)\s*[{(]\s*([^,\s]*)\s*,/g)) {
    if (/^(string|preamble|comment)$/i.test(m[1])) continue;
    keys.push(m[2]);
  }
  return keys;
}

/* How many TeX conditionals (\ifx, \ifpdf, \ifdefined, a \newif switch...) are open at a position of comment-free code.
 * \newif\ifname declares a switch and opens nothing; \ifthenelse{..} and etoolbox's \ifbool{..} take braces and have no \fi. */
export function ifDepthAt(code, pos) {
  let depth = 0;
  const re = /\\(newif\s*\\if[A-Za-z@]*|if[A-Za-z@]*|fi)(?![A-Za-z@])/g;
  let m;
  while ((m = re.exec(code)) && m.index < pos) {
    const w = m[1];
    if (w.startsWith('newif')) continue;
    if (w === 'fi') { depth = Math.max(0, depth - 1); continue; }
    if (/^\s*\{/.test(code.slice(m.index + m[0].length, m.index + m[0].length + 20))) continue;
    depth++;
  }
  return depth;
}

/* ------------------------------------------------------------------ one file, every \input pulled in */
/* Returns { text, pulled: [paths], missing: [targets], notes: [] }. The output keeps every line of every file as it was
 * (comments included), replaces each \input, \include, \subfile and \import of a file found in the project by that
 * file's text between two marker comments, adds the \clearpage that \include would add, honours \includeonly, and keeps
 * only the body of a subfile. A command inside a comment or a verbatim block is left alone. bbl: the .bbl text to put in
 * place of \bibliography{...} (BibTeX projects only), or null to keep \bibliography as it is. */
export function flatten(rootPath, texts, find, { bbl = null } = {}) {
  const rootDir = dirOf(rootPath);
  const pulled = [];
  const missing = [];
  const notes = [];
  const stack = [];
  let includeOnly = null;
  const rootCode = stripComments(texts.get(rootPath) || '');
  const ios = commandArgs(rootCode, 'includeonly');
  /* one \includeonly outside any \if...\fi is a choice the author made; one inside a conditional (a template's
   * "chapter only" switch) or several of them cannot be decided without running TeX, so every \include is kept */
  const io = ios.length === 1 && ifDepthAt(rootCode, ios[0].index) === 0 ? ios[0] : null;
  if (ios.length && !io) notes.push('An \\includeonly inside a condition was left as it was, and every \\include is pulled in.');
  if (io) includeOnly = new Set(io.args[0].split(',').map(s => cleanArg(s)).filter(Boolean).map(s => joinPath(rootDir, s).replace(/\.tex$/, '')));

  const subfileBody = src => {
    const m = String(src).match(/\\begin\s*\{document\}([\s\S]*?)\\end\s*\{document\}/);
    return m ? m[1].replace(/^\r?\n/, '') : src;
  };
  const expand = (path, base, depth) => {
    if (depth > 30) { notes.push(`Stopped at ${path}: more than 30 levels of \\input.`); return texts.get(path) || ''; }
    if (stack.includes(path)) { notes.push(`${path} pulls itself in again; that \\input was left as it was.`); return null; }
    stack.push(path);
    const lines = codeLines(texts.get(path) || '');
    const out = [];
    for (const l of lines) {
      if (l.verbatim || !/\\(input|include|subfile|subfileinclude|import|subimport|inputfrom|subinputfrom|includefrom|subincludefrom|bibliography)(?![A-Za-z@])/.test(l.code)) { out.push(l.raw.replace(/\r$/, '')); continue; }
      const line = l.raw.replace(/\r$/, '');
      const code = l.code;
      const tail = line.slice(code.length);
      let res = '';
      let i = 0;
      const re = /\\(input|include|subfile|subfileinclude|import|subimport|inputfrom|subinputfrom|includefrom|subincludefrom|bibliography)(?![A-Za-z@])/g;
      let m;
      while ((m = re.exec(code))) {
        const cmd = m[1];
        const isImport = IMPORT_CMDS.includes(cmd);
        let j = skipOpt(code, m.index + m[0].length);
        const a1 = braced(code, j);
        if (!a1) {
          if (cmd === 'input') {
            const sp = code.slice(m.index + m[0].length).match(/^\s+([^\s{}\\%]+)/);
            if (sp) {
              const t = sp[1];
              const hit = find(joinPath(base, t)) || find(joinPath(base, `${t}.tex`));
              if (hit && kindOf(hit.path) === 'tex') {
                const body = expand(hit.path, base, depth + 1);
                if (body != null) {
                  res += code.slice(i, m.index) + `%%% begin ${hit.path} (pulled in by Splitlight)\n${body}\n%%% end ${hit.path}\n`;
                  pulled.push(hit.path);
                  i = m.index + m[0].length + sp[0].length;
                  re.lastIndex = i;
                  continue;
                }
              } else if (!hit) missing.push(t);
            }
          }
          continue;
        }
        let a2 = null;
        if (isImport) { let k = a1.end; while (code[k] === ' ') k++; a2 = braced(code, k); if (!a2) continue; }
        const end = isImport ? a2.end : a1.end;
        if (cmd === 'bibliography') {
          if (bbl != null) {
            res += code.slice(i, m.index) + `%%% the .bbl file, put in place of \\bibliography{${a1.text}} by Splitlight\n${bbl.replace(/\r/g, '')}\n`;
            i = end;
            re.lastIndex = i;
          }
          continue;
        }
        let target, nb = base;
        if (isImport) {
          const d = cleanArg(a1.text);
          nb = cmd.startsWith('sub') ? joinPath(dirOf(path), d) : joinPath(rootDir, d);
          target = cleanArg(a2.text);
        } else target = cleanArg(a1.text);
        const hit = find(joinPath(nb, target)) || find(joinPath(nb, `${target}.tex`)) || (isImport ? null : (find(joinPath(rootDir, target)) || find(joinPath(rootDir, `${target}.tex`))));
        if (!hit || kindOf(hit.path) !== 'tex') { if (!hit) missing.push(isImport ? `${cleanArg(a1.text)}/${target}` : target); continue; }
        const isInclude = cmd === 'include' || cmd === 'includefrom' || cmd === 'subincludefrom' || cmd === 'subfileinclude';
        if (isInclude && includeOnly && !includeOnly.has(hit.path.replace(/\.tex$/, ''))) {
          res += code.slice(i, m.index) + `%%% ${hit.path} left out, as \\includeonly says\n`;
          i = end;
          re.lastIndex = i;
          continue;
        }
        let body = expand(hit.path, nb, depth + 1);
        if (body == null) continue;
        if (cmd === 'subfile' || cmd === 'subfileinclude' || isSubfileDoc(texts.get(hit.path) || '')) body = subfileBody(body);
        const pre = isInclude ? '\\clearpage\n' : '';
        const post = isInclude ? '\\clearpage\n' : '';
        res += code.slice(i, m.index) + `${pre}%%% begin ${hit.path} (pulled in by Splitlight)\n${body}\n%%% end ${hit.path}\n${post}`;
        pulled.push(hit.path);
        i = end;
        re.lastIndex = i;
      }
      res += code.slice(i) + tail;
      out.push(res);
    }
    stack.pop();
    return out.join('\n');
  };
  let text = expand(rootPath, rootDir, 0) || '';
  if (includeOnly && io) text = text.replace(/^([^%\n]*?)\\includeonly\s*\{[^}]*\}/m, '$1%%% \\includeonly removed by Splitlight: the parts it named are pulled in above');
  return { text, pulled: [...new Set(pulled)], missing: [...new Set(missing)], notes };
}

/* ------------------------------------------------------------------ outline and word count */
function firstBraced(code, name) {
  const c = commandArgs(code, name)[0];
  return c ? c.args[0] : '';
}
export function outline(flatText) {
  const code = stripComments(flatText);
  const title = plainText(firstBraced(code, 'title'));
  const authorRaw = commandArgs(code, 'author').map(c => c.args[0]);
  const authors = [];
  for (const a of authorRaw) for (const part of a.split(/\\and(?![A-Za-z])|\\AND(?![A-Za-z])/)) { const t = plainText(part.replace(/\\\\[\s\S]*$/, '')); if (t) authors.push(t); }
  const ab = code.match(/\\begin\s*\{abstract\}([\s\S]*?)\\end\s*\{abstract\}/);
  const abstract = ab ? plainText(ab[1]) : plainText(firstBraced(code, 'abstract'));
  const sections = [];
  const re = /\\(part|chapter|section|subsection)(\*?)(?![A-Za-z@])/g;
  let m;
  while ((m = re.exec(code))) {
    const j = skipOpt(code, m.index + m[0].length);
    const b = braced(code, j);
    if (!b) continue;
    const t = plainText(b.text);
    if (t) sections.push({ level: m[1], starred: !!m[2], title: t });
  }
  return { title, authors: [...new Set(authors)].slice(0, 30), abstract: abstract.slice(0, 900), sections: sections.slice(0, 400) };
}
/* A rough count of the words in the document body, in the spirit of texcount: commands, maths, figures' code and
 * environment names are not counted; words inside \section{...}, captions and footnotes are. */
export function wordCount(flatText) {
  let code = stripComments(flatText);
  const b = code.match(/\\begin\s*\{document\}([\s\S]*)\\end\s*\{document\}/);
  if (b) code = b[1];
  code = code.replace(/\\begin\s*\{(equation|align|gather|multline|eqnarray|displaymath|math|tikzpicture|lstlisting|verbatim|minted|figure|table)\*?\}[\s\S]*?\\end\s*\{\1\*?\}/g, m => {
    const caps = [...m.matchAll(/\\caption(?:\[[^\]]*\])?\s*\{((?:[^{}]|\{[^{}]*\})*)\}/g)].map(x => x[1]).join(' ');
    return ` ${caps} `;
  });
  code = code.replace(/\$\$[\s\S]*?\$\$/g, ' ').replace(/\\\[[\s\S]*?\\\]/g, ' ').replace(/\\\([\s\S]*?\\\)/g, ' ').replace(/(?<!\\)\$[^$]*?(?<!\\)\$/g, ' ');
  code = code.replace(/\\(label|ref|eqref|cite[a-zA-Z]*|includegraphics|input|include|bibliography|bibliographystyle|addbibresource|url|vspace|hspace|setlength|newcommand|renewcommand|usepackage|begin|end)\*?\s*(\[[^\]]*\])?\s*\{[^{}]*\}/g, ' ');
  code = code.replace(/\\[A-Za-z@]+\*?/g, ' ').replace(/[{}[\]&~^_\\]/g, ' ');
  const words = code.match(/[A-Za-z\u00C0-\u024F\u0370-\u03FF\u0400-\u04FF0-9][A-Za-z\u00C0-\u024F\u0370-\u03FF\u0400-\u04FF0-9'’-]*/g);
  return words ? words.length : 0;
}
