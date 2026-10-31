/* The sample export: three made-up projects, laid out the way OpenAI's guide describes the "Export all projects" archive
 * (one folder per project, a conversations folder of JSON files, export-errors.json for a project that failed). Nobody
 * has published a real archive, so the layout is our reading of the guide, and the tool reads other layouts too.
 * Every name, number and sentence in it is invented. Used by "Open the sample export" and by the tests. */
import { writeZip, crc32 } from './zip.js';

export const SAMPLE_NAME = 'prism-export-sample.zip';

/* ------------------------------------------------------------------ tiny PNG figures */
function adler32(b) { let a = 1, c = 0; for (let i = 0; i < b.length; i++) { a = (a + b[i]) % 65521; c = (c + a) % 65521; } return ((c << 16) | a) >>> 0; }
function chunk(type, data) {
  const out = new Uint8Array(12 + data.length);
  const v = new DataView(out.buffer);
  v.setUint32(0, data.length);
  for (let i = 0; i < 4; i++) out[4 + i] = type.charCodeAt(i);
  out.set(data, 8);
  v.setUint32(8 + data.length, crc32(out.subarray(4, 8 + data.length)));
  return out;
}
function png(w, h, draw) {
  const raw = new Uint8Array((w * 3 + 1) * h);
  for (let y = 0; y < h; y++) {
    raw[y * (w * 3 + 1)] = 0;
    for (let x = 0; x < w; x++) { const [r, g, b] = draw(x, y); const o = y * (w * 3 + 1) + 1 + x * 3; raw[o] = r; raw[o + 1] = g; raw[o + 2] = b; }
  }
  const blocks = [];
  for (let o = 0; o < raw.length; o += 65535) {
    const part = raw.subarray(o, Math.min(raw.length, o + 65535));
    const hd = new Uint8Array(5);
    hd[0] = o + 65535 >= raw.length ? 1 : 0; hd[1] = part.length & 255; hd[2] = part.length >> 8; hd[3] = ~part.length & 255; hd[4] = (~part.length >> 8) & 255;
    blocks.push(hd, part);
  }
  const zlen = 2 + blocks.reduce((a, b) => a + b.length, 0) + 4;
  const z = new Uint8Array(zlen);
  z[0] = 0x78; z[1] = 0x01;
  let p = 2;
  for (const b of blocks) { z.set(b, p); p += b.length; }
  new DataView(z.buffer).setUint32(p, adler32(raw));
  const ihdr = new Uint8Array(13);
  const iv = new DataView(ihdr.buffer);
  iv.setUint32(0, w); iv.setUint32(4, h); ihdr[8] = 8; ihdr[9] = 2;
  const sig = new Uint8Array([137, 80, 78, 71, 13, 10, 26, 10]);
  const parts = [sig, chunk('IHDR', ihdr), chunk('IDAT', z), chunk('IEND', new Uint8Array(0))];
  const out = new Uint8Array(parts.reduce((a, b) => a + b.length, 0));
  let q = 0;
  for (const b of parts) { out.set(b, q); q += b.length; }
  return out;
}
/* A small chart: axes and one line, in the colour given. */
function chart(w, h, color, f) {
  const ys = []; for (let x = 0; x < w; x++) ys.push(Math.round(h - 8 - f(x / w) * (h - 16)));
  return png(w, h, (x, y) => {
    if (x === 6 || y === h - 6) return [40, 44, 52];
    if (x > 6 && Math.abs(y - ys[x]) <= 1) return color;
    return [255, 255, 255];
  });
}
function spectrum(i) {
  const peak = 0.2 + ((i * 37) % 60) / 100;
  return chart(14, 12, [11, 114, 133], t => Math.exp(-((t - peak) ** 2) / 0.02));
}

/* ------------------------------------------------------------------ the projects */
const KELP = 'Kelp forest carbon budget';
const THESIS = 'Spectral imaging thesis';
const RESP = 'Reviewer response';

function kelp() {
  const f = {};
  const d = `${KELP}/`;
  f[`${d}main.tex`] = String.raw`\documentclass[11pt]{article}
\usepackage[utf8]{inputenc}
\usepackage{graphicx}
\usepackage{amsmath}
\usepackage[round]{natbib}
\usepackage{hyperref}

\title{A carbon budget for a temperate kelp forest\thanks{Sample project, made up for Splitlight.}}
\author{Ana Moreno \and Kai Halvorsen \and Priya Raman}
\date{October 2026}

\begin{document}
\maketitle

\begin{abstract}
We estimate how much carbon a 40 hectare kelp forest takes up and exports over one year, from monthly biomass
surveys and drifting sediment traps. Net uptake was 312 g C per square metre, and about a fifth of it left the
forest as detritus.
\end{abstract}

\input{sections/introduction}
\input{sections/methods}
\input{sections/results}

\section{Discussion}
Export to deeper water is the part of the budget with the widest error bars, and the one that matters most for
any claim about storage \citep{moreno2025}.
% \input{sections/old-discussion}

\bibliographystyle{plainnat}
\bibliography{references}
\end{document}
`;
  f[`${d}sections/introduction.tex`] = String.raw`\section{Introduction}
Kelp forests grow fast and lose much of what they grow \citep{halvorsen2024, raman2023}. Whether that loss is
stored or returned to the air depends on where the detritus goes.
`;
  f[`${d}sections/methods.tex`] = String.raw`\section{Methods}
\subsection{Site}
The forest lies on a rocky shelf between 4 and 18 m deep (Figure~\ref{fig:site}).
\begin{figure}[h]
  \centering
  \includegraphics[width=0.7\linewidth]{figures/site-map}
  \caption{Survey transects across the forest.}
  \label{fig:site}
\end{figure}
\subsection{Biomass and export}
Monthly biomass $B_t$ came from 24 quadrats; export $E_t$ from six drifting traps, so that
\begin{equation}
  U_t = (B_{t+1} - B_t) + E_t .
\end{equation}
`;
  f[`${d}sections/results.tex`] = String.raw`\section{Results}
Standing biomass peaked in August (Figure~\ref{fig:biomass}) and export in the first winter storms
(Figure~\ref{fig:flux}).
\begin{figure}[h]
  \centering
  \includegraphics[width=0.48\linewidth]{figures/biomass.png}
  \includegraphics[width=0.48\linewidth]{figures/flux.png}
  \caption{Biomass and carbon export by month.}
  \label{fig:biomass}\label{fig:flux}
\end{figure}
`;
  f[`${d}references.bib`] = `@article{moreno2025,
  author = {Moreno, Ana and Raman, Priya},
  title = {Where does kelp carbon go?},
  journal = {Journal of Made-up Ecology},
  year = {2025},
  volume = {12},
  pages = {1--14}
}
@article{halvorsen2024,
  author = {Halvorsen, Kai},
  title = {Growth and erosion of a kelp canopy},
  journal = {Sample Marine Letters},
  year = {2024}
}
@book{raman2023,
  author = {Raman, Priya},
  title = {Coastal carbon, an invented textbook},
  publisher = {Nowhere Press},
  year = {2023}
}
@misc{traps2026,
  author = {Halvorsen, Kai},
  title = {Sediment trap log},
  year = {2026},
  note = {Sample data}
}
@string{jme = {Journal of Made-up Ecology}}
`;
  f[`${d}figures/site-map.png`] = chart(120, 80, [31, 122, 77], t => 0.5 + 0.35 * Math.sin(t * 9));
  f[`${d}figures/biomass.png`] = chart(120, 80, [11, 114, 133], t => Math.sin(t * Math.PI) * 0.9);
  f[`${d}figures/flux.png`] = chart(120, 80, [103, 65, 217], t => t ** 3);
  f[`${d}figures/old-draft-plot.png`] = chart(60, 40, [120, 120, 120], t => t);
  f[`${d}main.aux`] = '\\relax\n\\citation{moreno2025}\n';
  f[`${d}main.log`] = 'This is pdfTeX, Version 3.141592653 (sample log)\n';
  return f;
}

function thesis() {
  const f = {};
  const d = `${THESIS}/`;
  f[`${d}thesis.tex`] = String.raw`% !TEX program = xelatex
\documentclass[12pt,oneside]{report}
\usepackage{fontspec}
\usepackage{graphicx}
\graphicspath{{figures/}}
\usepackage[backend=biber,style=authoryear]{biblatex}
\addbibresource{thesis.bib}

\title{Hyperspectral imaging of leaf water stress}
\author{Lena Okafor}
\date{Draft, October 2026}

\begin{document}
\maketitle
\tableofcontents
\include{chapters/introduction}
\include{chapters/background}
\include{chapters/spectra}
\include{chapters/results}
\include{chapters/conclusion}
\printbibliography
\end{document}
`;
  const ch = (title, body) => `\\chapter{${title}}\n${body}\n`;
  f[`${d}chapters/introduction.tex`] = ch('Introduction', 'Plants close their stomata before a leaf looks dry. This thesis asks whether a camera can see that earlier \\parencite{okafor2025}.');
  f[`${d}chapters/background.tex`] = ch('Background', '\\section{Water in the leaf}\nReflectance near 970 nm and 1450 nm falls as water content rises.\n\\section{Cameras}\nPush-broom sensors record one line of the scene at a time.');
  let grid = '';
  for (let i = 1; i <= 40; i++) grid += `  \\includegraphics[width=0.18\\linewidth]{spectrum-${String(i).padStart(3, '0')}}${i % 5 ? '' : '\\\\'}\n`;
  f[`${d}chapters/spectra.tex`] = ch('Spectra', `The first forty spectra of the 230 recorded are below; Figure~\\ref{fig:overview} shows them together.\n\\begin{figure}[p]\n  \\centering\n${grid}  \\caption{Spectra 1 to 40.}\n\\end{figure}\n\\begin{figure}[h]\n  \\centering\n  \\includegraphics[width=0.8\\linewidth]{Overview}\n  \\caption{All 230 spectra.}\n  \\label{fig:overview}\n\\end{figure}`);
  f[`${d}chapters/results.tex`] = ch('Results', 'Stress showed in the 1450 nm band two days before wilting \\parencite{okafor2026}.');
  f[`${d}chapters/conclusion.tex`] = ch('Conclusion', 'A cheaper camera with two bands may be enough.');
  f[`${d}thesis.bib`] = `@thesis{okafor2025, author = {Okafor, Lena}, title = {Leaf water and light}, type = {Master's thesis}, institution = {Sample University}, year = {2025}}
@article{okafor2026, author = {Okafor, Lena and Berg, Tomas}, title = {Two bands are enough}, journaltitle = {Invented Plant Methods}, date = {2026}}
`;
  for (let i = 1; i <= 230; i++) f[`${d}figures/spectrum-${String(i).padStart(3, '0')}.png`] = spectrum(i);
  f[`${d}figures/overview.png`] = chart(160, 90, [11, 114, 133], t => 0.5 + 0.4 * Math.sin(t * 20) * Math.exp(-t * 2));
  return f;
}

function response() {
  const f = {};
  const d = `${RESP}/`;
  f[`${d}response.tex`] = String.raw`\documentclass{article}
\usepackage{xcolor}
\newcommand{\reply}[1]{\par\noindent\textcolor{teal}{#1}\par}
\title{Response to the reviewers}
\author{Ana Moreno}
\begin{document}
\maketitle
\section{Reviewer 1}
\textbf{The trap data need a map.} \reply{Added as Figure 1.}
\section{Reviewer 2}
\input{reviewer2-points}
\end{document}
`;
  return f;
}

function conversations() {
  const f = {};
  f['conversations/kelp-forest-carbon-budget.json'] = JSON.stringify({
    title: 'Tighten the methods section',
    project_name: KELP,
    created_at: '2026-09-14T08:12:00Z',
    messages: [
      { role: 'user', content: 'Can you make the Methods section shorter without losing the equation?', created_at: '2026-09-14T08:12:00Z' },
      { role: 'assistant', content: 'Here is a version with the site description cut to one sentence. The equation for uptake stays as it is, with U_t defined right after it.', created_at: '2026-09-14T08:12:20Z' },
      { role: 'user', content: 'Good. Add a reference for the trap method.', created_at: '2026-09-14T08:15:41Z' },
      { role: 'assistant', content: 'Added \\citep{traps2026} after the trap sentence; the entry is already in references.bib.', created_at: '2026-09-14T08:15:58Z' },
    ],
  }, null, 2);
  const nodes = {
    root: { id: 'root', message: null, parent: null, children: ['a'] },
    a: { id: 'a', parent: 'root', children: ['b'], message: { author: { role: 'user' }, create_time: 1789459200, content: { content_type: 'text', parts: ['Why does my thesis fail with "fontspec requires XeTeX or LuaTeX"?'] } } },
    b: { id: 'b', parent: 'a', children: ['c'], message: { author: { role: 'assistant' }, create_time: 1789459230, content: { content_type: 'text', parts: ['The thesis loads fontspec, which pdfLaTeX cannot run. Compile with XeLaTeX; the first line of thesis.tex already asks for it.'] } } },
    c: { id: 'c', parent: 'b', children: [], message: { author: { role: 'user' }, create_time: 1789459300, content: { content_type: 'text', parts: ['Thanks, that fixed it.'] } } },
  };
  f['conversations/spectral-imaging-thesis.json'] = JSON.stringify({ title: 'fontspec error', project: { name: THESIS }, create_time: 1789459200, mapping: nodes, current_node: 'c' }, null, 2);
  f['conversations/other-chats.json'] = JSON.stringify([
    { title: 'Abstract word limit', messages: [{ author: { role: 'user' }, content: { parts: ['How many words is my abstract?'] } }, { author: { role: 'assistant' }, content: { parts: ['About 52 words, under the 250 the journal allows.'] } }] },
    { title: 'Reviewer 2, point 3', messages: [{ sender: 'user', text: 'Draft a polite reply to point 3.' }, { sender: 'assistant', text: 'Thank you for this point. We now report the trap losses in Table 2.' }] },
  ], null, 2);
  f['export-errors.json'] = JSON.stringify({ errors: [{ project_name: 'Lab notebook 2026', error: 'Export timed out. Retry from the project menu.' }] }, null, 2);
  return f;
}

/* path -> string or Uint8Array */
export function sampleFiles() {
  return { ...kelp(), ...thesis(), ...response(), ...conversations() };
}
export async function sampleZip({ date = new Date('2026-10-30T09:00:00Z') } = {}) {
  const files = sampleFiles();
  return writeZip(Object.keys(files).sort().map(name => ({ name, data: files[name] })), { date });
}
