/* The sample library: fourteen made-up works (our own text, invented fandoms) saved as the files AO3 documents, so a visitor can try the
 * whole tool without a download. ao3Html() writes the layout described in AO3's help for its HTML downloads: a preface with the title,
 * the byline and a <dl class="tags"> list, the summary and notes in <blockquote class="userstuff">, then #chapters with a
 * <div class="meta group"> heading before each chapter's <div class="userstuff">. The tests build their other files from the same
 * function. No real AO3 file was available when this was written (AO3 was down); the page says so. Nothing here touches the network. */
import { readHtmlWork } from './parse.js';
import { workToEpub } from './work.js';

const esc = s => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
const link = (kind, v) => `<a class="${kind}" href="https://archiveofourown.org/tags/${encodeURIComponent(v)}/works">${esc(v)}</a>`;
const dd = (kind, vals) => `<dd class="${kind}">${vals.map(v => link('tag', v)).join(', ')}</dd>`;
const group = (dt, kind, vals) => (vals && vals.length ? `<dt>${dt}:</dt>\n${dd(kind, vals)}\n` : '');
const para = t => `<p>${t}</p>`;

/* spec: { id, title, authors, rating, warnings, categories, fandoms, relationships, characters, tags, language, series: [{name, part, id}], published, updated,
 * words, chaptersHave, chaptersTotal, completed (date), summary (html), notes (html), chapters: [{ title, paras (html strings), notes (html) }], endNotes (html) }
 * opts: { page: true writes a page saved from the browser (the site's shell around the same work), bom, crlf, base } */
export function ao3Html(s, opts = {}) {
  const stats = [`Published: ${s.published}`, s.updated && s.updated !== s.published ? `Updated: ${s.updated}` : '', s.completed ? `Completed: ${s.completed}` : '', `Words: ${(s.words ?? 0).toLocaleString('en-US')}`,
    `Chapters: ${s.chaptersHave}/${s.chaptersTotal == null ? '?' : s.chaptersTotal}`].filter(Boolean).join(' ');
  const series = (s.series || []).map(x => `Part <strong>${x.part}</strong> of <a href="https://archiveofourown.org/series/${x.id || 1}">${esc(x.name)}</a>`).join(', ');
  const head = `<dl class="tags">
<dt>Rating:</dt>
${dd('rating', [s.rating || 'Not Rated'])}
${group('Archive Warning', 'warning', s.warnings || ['No Archive Warnings Apply'])}${group('Category', 'category', s.categories)}${group('Fandom', 'fandom', s.fandoms)}${group('Relationship', 'relationship', s.relationships)}${group('Character', 'character', s.characters)}${group('Additional Tags', 'freeform', s.tags)}<dt>Language:</dt>
<dd>${esc(s.language || 'English')}</dd>
${series ? `<dt>Series:</dt>\n<dd>${series}</dd>\n` : ''}<dt>Stats:</dt>
<dd>${esc(stats)}</dd>
</dl>`;
  const chapters = s.chapters.map((c, i) => `<div class="meta group">
<h2 class="heading">Chapter ${i + 1}</h2>
${c.title ? `<h3 class="title">${esc(c.title)}</h3>\n` : ''}${c.notes ? `<p>Chapter Notes</p>\n<blockquote class="userstuff">${para(c.notes)}</blockquote>\n` : ''}</div>
<div class="userstuff">
${(c.paras || []).map(para).join('\n')}
</div>`).join('\n');
  const body = `<div id="preface">
<p class="message"><a href="https://archiveofourown.org/works/${s.id}">Posted originally on the Archive of Our Own</a></p>
<div class="meta">
<h1>${esc(s.title)}</h1>
<div class="byline">by ${(s.authors || ['Anonymous']).map(a => `<a rel="author" href="https://archiveofourown.org/users/${encodeURIComponent(a)}/pseuds/${encodeURIComponent(a)}">${esc(a)}</a>`).join(', ')}</div>
${head}
</div>
<p>Summary</p>
<blockquote class="userstuff">${s.summary ? s.summary : para('')}</blockquote>
${s.notes ? `<p>Notes</p>\n<blockquote class="userstuff">${s.notes}</blockquote>\n` : ''}</div>
<div id="chapters">
${chapters}
</div>
${s.endNotes ? `<div id="afterword"><div class="meta"><h2 class="heading">Afterword</h2></div><p>End Notes</p>\n<blockquote class="userstuff">${s.endNotes}</blockquote></div>` : ''}`;
  const lang = /Русский/.test(s.language || '') ? 'ru' : /中文/.test(s.language || '') ? 'zh' : /العربية/.test(s.language || '') ? 'ar' : 'en';
  const dir = lang === 'ar' ? ' dir="rtl"' : '';
  let html;
  if (opts.page) {
    html = `<!DOCTYPE html>
<html lang="${lang}"${dir}>
<head>
<meta charset="utf-8">
<title>${esc(s.title)} - ${esc((s.authors || ['Anonymous']).join(', '))} - ${esc((s.fandoms || [''])[0])} [Archive of Our Own]</title>
<link rel="canonical" href="https://archiveofourown.org/works/${s.id}">
<style>body{font-family:sans-serif}#header{background:#900;color:#fff}.landmark{position:absolute;left:-9999px}</style>
</head>
<body class="logged-out">
<div id="outer" class="wrapper"><div id="header"><h1 class="heading"><a href="/">Archive of Our Own</a></h1><ul class="primary navigation actions"><li><a href="/media">Fandoms</a></li><li><a href="/people">People</a></li></ul></div>
<div id="inner" class="wrapper"><div id="main" class="works-show region" role="main">
<div class="work">
<div class="wrapper"><dl class="work meta group">
<dt class="rating tags">Rating:</dt><dd class="rating tags"><ul class="commas"><li><a class="tag" href="/tags/x">${esc(s.rating || 'Not Rated')}</a></li></ul></dd>
<dt class="warning tags">Archive Warning:</dt><dd class="warning tags"><ul class="commas">${(s.warnings || ['No Archive Warnings Apply']).map(w => `<li><a class="tag" href="/tags/x">${esc(w)}</a></li>`).join('')}</ul></dd>
<dt class="category tags">Category:</dt><dd class="category tags"><ul class="commas">${(s.categories || []).map(w => `<li><a class="tag" href="/tags/x">${esc(w)}</a></li>`).join('')}</ul></dd>
<dt class="fandom tags">Fandom:</dt><dd class="fandom tags"><ul class="commas">${(s.fandoms || []).map(w => `<li><a class="tag" href="/tags/x">${esc(w)}</a></li>`).join('')}</ul></dd>
<dt class="relationship tags">Relationship:</dt><dd class="relationship tags"><ul class="commas">${(s.relationships || []).map(w => `<li><a class="tag" href="/tags/x">${esc(w)}</a></li>`).join('')}</ul></dd>
<dt class="freeform tags">Additional Tags:</dt><dd class="freeform tags"><ul class="commas">${(s.tags || []).map(w => `<li><a class="tag" href="/tags/x">${esc(w)}</a></li>`).join('')}</ul></dd>
<dt class="language">Language:</dt><dd class="language">${esc(s.language || 'English')}</dd>
<dt class="stats">Stats:</dt><dd class="stats"><dl class="stats"><dt class="published">Published:</dt><dd class="published">${s.published}</dd>${s.updated && s.updated !== s.published ? `<dt class="status">Updated:</dt><dd class="status">${s.updated}</dd>` : ''}<dt class="words">Words:</dt><dd class="words">${s.words ?? 0}</dd><dt class="chapters">Chapters:</dt><dd class="chapters">${s.chaptersHave}/${s.chaptersTotal == null ? '?' : s.chaptersTotal}</dd></dl></dd>
</dl></div>
<div id="workskin"><div class="preface group"><h2 class="title heading">${esc(s.title)}</h2><h3 class="byline heading">${(s.authors || ['Anonymous']).map(a => `<a rel="author" href="/users/${encodeURIComponent(a)}/pseuds/${encodeURIComponent(a)}">${esc(a)}</a>`).join(', ')}</h3>
<div class="summary module"><h3 class="heading">Summary:</h3><blockquote class="userstuff">${s.summary || para('')}</blockquote></div></div>
<div id="chapters" class="userstuff">${s.chapters.map((c, i) => `<div class="chapter" id="chapter-${i + 1}"><div class="chapter preface group" role="complementary"><h3 class="title"><a href="/works/${s.id}/chapters/${i + 1}">Chapter ${i + 1}</a>${c.title ? `: ${esc(c.title)}` : ''}</h3></div><div class="userstuff module" role="article"><h3 class="landmark heading" id="work">Chapter Text</h3>${(c.paras || []).map(para).join('')}</div></div>`).join('')}</div>
</div></div></div></div><div id="footer"><ul class="navigation actions"><li><a href="/tos">Terms of Service</a></li></ul></div></div>
</body>
</html>
`;
  } else {
    html = `<!DOCTYPE html PUBLIC "-//W3C//DTD XHTML 1.0 Strict//EN" "http://www.w3.org/TR/xhtml1/DTD/xhtml1-strict.dtd">
<html xmlns="http://www.w3.org/1999/xhtml" xml:lang="${lang}" lang="${lang}"${dir}>
<head>
${opts.base ? '<base href="https://example.invalid/base/">\n' : ''}<meta http-equiv="Content-Type" content="text/html; charset=utf-8" />
<title>${esc(s.title)} - ${esc((s.authors || ['Anonymous']).join(', '))} - ${esc((s.fandoms || [''])[0])}</title>
<style type="text/css">body{font-family:Georgia,serif;margin:2em}.meta{margin-bottom:1em}dt{font-weight:bold}blockquote.userstuff{margin:1em 2em}</style>
</head>
<body>
${body}
</body>
</html>
`;
  }
  if (opts.crlf) html = html.replace(/\r?\n/g, '\r\n');
  return (opts.bom ? String.fromCharCode(0xfeff) : '') + html;
}

/* ------------------------------------------------------------------ the made-up works */
const P = {
  lamp: 'The lamp over the harbour office had been lit by hand every dusk for as long as Isolde could remember, and tonight the wick refused to catch. She tried twice, swore quietly at the damp, and tried again.',
  ledger: 'Corwin kept the amber ledger on the shelf above the kettle, where it could not be spilled on. Every small hour of every night shift went into it: the tide, the weather, who had come through the gate and who had only meant to.',
  stair: 'The salt had eaten the third stair years ago. Nobody mended it, because everybody knew to step over it, and a stair that everybody knows about is a kind of friend.',
  letter: 'He wrote the letter three times and posted none of them. The fourth draft was shorter, and that was the one that told the truth.',
  rain: 'It rained on the quay for nine days. On the tenth the clouds went out like a tide and left a washed sky the colour of a new coin.',
  tea: 'She made tea the way her grandmother had, too strong and with the milk in first, and set the second cup down without being asked.',
  quiet: 'They sat without talking for a long time. It was the good kind of quiet, the kind that has room in it.',
  map: 'The old chart had a coastline that no longer existed and a harbour that did. Between the two, in a hand nobody recognised, someone had written: ask the keeper.',
};
const w = (id, o) => ({ id, authors: ['Marlowe Finch'], rating: 'Teen And Up Audiences', warnings: ['No Archive Warnings Apply'], categories: ['Gen'], fandoms: ['The Brightwater Chronicles'], relationships: [], characters: [], tags: [], language: 'English', series: [], published: '2025-03-02', updated: '', words: 3000, chaptersHave: 1, chaptersTotal: 1, summary: '', notes: '', chapters: [], endNotes: '', ...o });
const ch = (title, ...paras) => ({ title, paras });

export const SAMPLE_SPECS = [
  w('51000001', { title: 'A Ledger of Small Hours', authors: ['Marlowe Finch'], categories: ['M/F'], relationships: ['Isolde Marsh/Corwin Vale'], characters: ['Isolde Marsh', 'Corwin Vale', 'The Harbourmaster'],
    tags: ['Slow Burn', 'Night Shift', 'Found Family', 'Tea', 'Lighthouses', 'Comfort'], series: [{ name: 'The Ledger Cycle', part: 1, id: 7001 }], published: '2025-03-02', updated: '2025-04-11', completed: '2025-04-11', words: 18400, chaptersHave: 4, chaptersTotal: 4,
    summary: '<p>Isolde takes the night shift at the harbour office to be left alone. Corwin has kept the ledger there for twenty years and has opinions about <em>everyone</em> who is not left alone.</p>', notes: '<p>Thank you to the readers who asked for more tea.</p>',
    chapters: [ch('The Wick', P.lamp, P.ledger), ch('The Third Stair', P.stair, P.tea), ch('Ten Days of Rain', P.rain, P.quiet), ch('Ask the Keeper', P.map, P.letter)], endNotes: '<p>The harbour is invented; the tides are not.</p>' }),
  w('51000002', { title: 'Salt on the Stair', authors: ['Marlowe Finch'], categories: ['M/F'], relationships: ['Isolde Marsh/Corwin Vale'], characters: ['Isolde Marsh', 'Corwin Vale'], tags: ['Slow Burn', 'Sequel', 'Weather'],
    series: [{ name: 'The Ledger Cycle', part: 2, id: 7001 }], published: '2025-06-20', updated: '2025-09-30', words: 9100, chaptersHave: 3, chaptersTotal: null,
    summary: '<p>The second winter at the harbour office, and the stair has finally given way.</p>', chapters: [ch('Footing', P.stair, P.rain), ch('The Mender', P.tea, P.map), ch('Snow Over the Quay', P.quiet, P.lamp)] }),
  w('51000003', { title: 'Night Shift at Harbour Lights', authors: ['Marlowe Finch'], rating: 'General Audiences', fandoms: ['Harbour Lights (Fictional TV)'], relationships: ['Dana Reyes & Pim'], characters: ['Dana Reyes', 'Pim'], tags: ['One Shot', 'Cozy'],
    published: '2025-08-14', words: 3200, summary: '<p>Dana covers a night shift for a friend and learns what the lamp room is really for.</p>', chapters: [ch('', P.lamp, P.tea, P.quiet)] }),
  w('51000004', { title: 'Quillfeather Reunion', authors: ['Sunniva Oak'], rating: 'General Audiences', categories: ['Gen', 'Multi'], fandoms: ['Quillfeather Academy', 'The Brightwater Chronicles', 'Harbour Lights (Fictional TV)', 'Tidewater Tales'],
    characters: ['Wren Ashby', 'Isolde Marsh', 'Dana Reyes'], tags: ['Crossover', 'Reunion', 'Ensemble Cast'], published: '2025-02-01', words: 6800, summary: '<p>Four friends from four different stories meet on one platform in the rain.</p>', chapters: [ch('', P.rain, P.quiet, P.map)] }),
  w('51000005', { title: 'The Tidewater Letters', authors: ['Sunniva Oak'], rating: 'Mature', warnings: ['Creator Chose Not To Use Archive Warnings'], categories: ['F/F'], fandoms: ['Tidewater Tales'], relationships: ['Wren Ashby/Odile Frost'], characters: ['Wren Ashby', 'Odile Frost'],
    tags: ['Epistolary', 'Letters', 'Angst with a Happy Ending'], published: '2025-04-05', updated: '2025-09-09', completed: '2025-09-09', words: 41000, chaptersHave: 5, chaptersTotal: 5,
    summary: '<p>Five letters across one year. <a href="https://example.com/readme">The author\'s notes are here</a>.</p><ul><li>No cliffhangers</li><li>One storm</li></ul>',
    chapters: [ch('Spring', P.letter, P.rain), ch('Summer', P.tea, P.lamp), ch('Autumn', P.stair, P.quiet), ch('Winter', P.map, P.rain), ch('Spring Again', P.letter, P.quiet)] }),
  w('51000006', { title: 'Огни гавани', authors: ['Мара Ветрова'], language: 'Русский', rating: 'General Audiences', fandoms: ['Harbour Lights (Fictional TV)'], tags: ['Уют', 'Ночная смена'], published: '2025-07-07', words: 2100,
    summary: '<p>Ночная смена в порту, чай и тишина.</p>', chapters: [ch('', 'Лампа над портовой конторой горела всю ночь. Дана пила чай и слушала, как море перебирает гальку.', 'Утром пришёл смотритель и ничего не спросил. Это было лучше любых слов.')] }),
  w('51000007', { title: '灯塔守夜人', authors: ['林夏'], language: '中文-普通话 國語', rating: 'General Audiences', fandoms: ['Harbour Lights (Fictional TV)'], tags: ['日常', '夜班'], published: '2025-07-09', words: 1800,
    summary: '<p>海边的夜班，一盏灯，一壶茶。</p>', chapters: [ch('', '港口办公室的灯每晚都由人点亮。今晚的灯芯受了潮，怎么也点不着。', '她泡了一壶浓茶，把第二只杯子放在桌上，没有人问为什么。')] }),
  w('51000008', { title: 'مصباح الميناء', authors: ['ليلى حداد'], language: 'العربية', rating: 'General Audiences', fandoms: ['Harbour Lights (Fictional TV)'], tags: ['هدوء'], published: '2025-07-11', words: 1500,
    summary: '<p>ليلة هادئة في مكتب الميناء.</p>', chapters: [ch('', 'كان المصباح فوق مكتب الميناء يُضاء باليد كل مساء، وفي هذه الليلة رفضت الفتيلة أن تشتعل.', 'صنعت الشاي كما كانت جدتها تفعل، وسكبت الفنجان الثاني دون أن يطلب أحد.')] }),
  w('51000010', { title: 'Cold Iron Season', authors: ['Sunniva Oak'], rating: 'Explicit', warnings: ['Graphic Depictions Of Violence', 'Major Character Death'], categories: ['M/M'], fandoms: ['Quillfeather Academy'], relationships: ['Cael Brandt/Tobias Wick'],
    characters: ['Cael Brandt', 'Tobias Wick'], tags: ['Angst', 'Hurt/Comfort', 'Winter'], published: '2024-11-30', updated: '2025-01-15', completed: '2025-01-15', words: 27500, chaptersHave: 3, chaptersTotal: 3,
    summary: '<p>A hard winter at the academy, told in three cold chapters.</p>', chapters: [ch('First Frost', P.rain, P.stair), ch('Iron', P.map, P.quiet), ch('Thaw', P.tea, P.letter)] }),
];

/* two more works that are saved in other ways: the old copy of The Tidewater Letters (2 of 5 chapters, as an HTML file saved in May) and a page saved from the browser */
const OLD_COPY = () => w('51000005', { ...SAMPLE_SPECS[4], updated: '2025-05-01', completed: '', words: 15200, chaptersHave: 2, chaptersTotal: 5, chapters: SAMPLE_SPECS[4].chapters.slice(0, 2) });
const SAVED_PAGE = () => w('51000009', { title: 'Quiet Hours', authors: ['Marlowe Finch'], rating: 'General Audiences', fandoms: ['The Brightwater Chronicles'], characters: ['Isolde Marsh'], tags: ['Saved From The Browser'], published: '2025-10-01', words: 2600,
  summary: '<p>A short piece, saved from the browser as a web page.</p>', chapters: [ch('', P.quiet, P.tea)] });

const GENERIC_EPUB_TEXT = {
  title: 'A Short Guide to Tide Tables', author: 'Harbour Authority Staff', subjects: ['reference', 'tides', 'navigation'], description: 'How to read a printed tide table, with two worked examples.',
  chapters: [['Reading the columns', 'Each row of a tide table gives a time and a height. Heights are measured from chart datum, the level below which the water rarely falls.'], ['A worked example', 'To find the water over a sandbank at 14:00, take the nearest high water, subtract the time, and read the rule of twelfths.']],
};
function minimalPdf(title) {
  const text = `(${title.replace(/[()\\]/g, '')}) Tj`;
  const objs = ['<< /Type /Catalog /Pages 2 0 R >>', '<< /Type /Pages /Kids [3 0 R] /Count 1 >>', '<< /Type /Page /Parent 2 0 R /MediaBox [0 0 300 144] /Contents 4 0 R /Resources << /Font << /F1 5 0 R >> >> >>',
    `<< /Length ${text.length + 30} >>\nstream\nBT /F1 18 Tf 20 70 Td ${text} ET\nendstream`, '<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>'];
  let out = '%PDF-1.4\n';
  const offs = [];
  objs.forEach((o, i) => { offs.push(out.length); out += `${i + 1} 0 obj\n${o}\nendobj\n`; });
  const xref = out.length;
  out += `xref\n0 ${objs.length + 1}\n0000000000 65535 f \n${offs.map(o => `${String(o).padStart(10, '0')} 00000 n \n`).join('')}trailer\n<< /Size ${objs.length + 1} /Root 1 0 R >>\nstartxref\n${xref}\n%%EOF\n`;
  return out;
}
export { minimalPdf };

/* ------------------------------------------------------------------ files */
const stamp = Date.UTC(2025, 9, 20, 12, 0, 0);
const mk = (name, data, type) => new File([data], name, { type, lastModified: stamp });
async function epubOf(spec, date) {
  const work = readHtmlWork(ao3Html(spec), 'x.html');
  return workToEpub(work, { date });
}
/* [{ path, file }] for the sample library: a folder "Ficshelf sample" with nine HTML downloads, three EPUBs and two PDFs. */
export async function sampleFiles() {
  const date = new Date(stamp);
  const out = [];
  const add = (name, data, type) => out.push({ path: `Ficshelf sample/${name}`, file: mk(name, data, type) });
  const fname = (s, ext) => `${s.title.replace(/[^\p{L}\p{N}]+/gu, '_').replace(/^_|_$/g, '')}.${ext}`;
  for (const s of SAMPLE_SPECS) {
    if (s.id === '51000005') continue; // below: as an old HTML copy and a finished EPUB
    add(fname(s, 'html'), ao3Html(s), 'text/html');
  }
  add(fname(SAVED_PAGE(), 'html'), ao3Html(SAVED_PAGE(), { page: true }), 'text/html');
  const old = OLD_COPY();
  add('The_Tidewater_Letters_(May).html', ao3Html(old), 'text/html');
  add(fname(SAMPLE_SPECS[4], 'epub'), await epubOf(SAMPLE_SPECS[4], date), 'application/epub+zip');
  add(fname(SAMPLE_SPECS[2], 'epub'), await epubOf(SAMPLE_SPECS[2], date), 'application/epub+zip');
  add(fname(GENERIC_EPUB_TEXT, 'epub').replace('A_Short', 'A_Short'), await genericEpub(date), 'application/epub+zip');
  add('Marlowe Finch - Quiet Hours [51000009].pdf', minimalPdf('Quiet Hours'), 'application/pdf');
  add('Night Shift at Harbour Lights [51000003].pdf', minimalPdf('Night Shift at Harbour Lights'), 'application/pdf');
  return out;
}
async function genericEpub(date) {
  const { buildEpub } = await import('./epub.js');
  const g = GENERIC_EPUB_TEXT;
  const docs = g.chapters.map((c, i) => ({ file: `ch${i + 1}.xhtml`, title: c[0], body: `<h2>${esc(c[0])}</h2><p>${esc(c[1])}</p>` }));
  return buildEpub({ title: g.title, authors: [g.author], language: 'en', description: g.description, subjects: g.subjects, docs, toc: docs.map(d => ({ title: d.title, file: d.file, children: [] })) }, { date });
}
export const SAMPLE_COUNT = 15;
