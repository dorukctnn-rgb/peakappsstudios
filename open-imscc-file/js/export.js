// What Cubby saves. Every function here works on the course model from course.js and returns a string or bytes; nothing
// is sent anywhere. Pro (js/pro.js decides who may call them): the whole course as one web page to read offline or print
// to PDF, every quiz as two Word files (questions, and answer key), every question in one spreadsheet (CSV) and in
// Moodle XML, and every course file in one ZIP.
import { zipSync, strToU8 } from '../vendor/fflate.js';
import { sanitizeHtml, htmlToBlocks, htmlToText, esc, oneLine } from './html.js';
import { questionsOf, answerText, TYPE_LABEL } from './qti.js';
import { fileBytes, resolveFilePath, resolveItemRef, mimeOf, isImage } from './course.js';

const NL = String.fromCharCode(10);
const BOM = String.fromCharCode(0xfeff);
const XML_BAD = new RegExp('[' + String.fromCharCode(0) + '-' + String.fromCharCode(8) + String.fromCharCode(11, 12) + String.fromCharCode(14) + '-' + String.fromCharCode(31) + String.fromCharCode(0xfffe, 0xffff) + ']', 'g');
const xmlText = s => esc(String(s ?? '').replace(XML_BAD, ''));
const mtime = new Date('2026-01-01T12:00:00');

export const KIND_LABEL = {
  page: 'Page', assignment: 'Assignment', quiz: 'Quiz', bank: 'Question bank', discussion: 'Discussion', announcement: 'Announcement',
  link: 'Link', tool: 'External tool', file: 'File',
};

/** A file name that works on Windows, Mac and in a ZIP. */
export function safeName(s, max = 80) {
  const t = String(s || '').replace(/[\\/:*?"<>|\u0000-\u001f]+/g, ' ').replace(/\s+/g, ' ').replace(/^[ .]+|[ .]+$/g, '').slice(0, max).trim();
  return t || 'untitled';
}

function uniqueNamer() {
  const used = new Set();
  return (name) => {
    let n = name, i = 2;
    const dot = name.lastIndexOf('.');
    while (used.has(n.toLowerCase())) { n = dot > 0 ? `${name.slice(0, dot)} (${i})${name.slice(dot)}` : `${name} (${i})`; i++; }
    used.add(n.toLowerCase());
    return n;
  };
}

export function fmtDate(iso) {
  if (!iso) return '';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  return d.toLocaleDateString('en-US', { year: 'numeric', month: 'short', day: 'numeric' });
}
const pts = n => (n === null || n === undefined || n === '' ? '' : `${Math.round(Number(n) * 100) / 100} ${Number(n) === 1 ? 'point' : 'points'}`);

/** One line under an item's title: due date, points, how it is submitted, how many questions. */
export function detailsOf(item) {
  const d = [];
  if (item.kind === 'quiz' || item.kind === 'bank') {
    d.push(`${item.questionCount} ${item.questionCount === 1 ? 'question' : 'questions'}`);
    if (item.points) d.push(pts(item.points));
    if (item.timeLimit) d.push(`${item.timeLimit} minutes`);
    if (item.attempts && item.attempts !== '1' && item.attempts !== '-1' && item.attempts !== 'unlimited') d.push(`${item.attempts} attempts`);
    if (item.attempts === '-1' || item.attempts === 'unlimited') d.push('unlimited attempts');
    if (item.quizType === 'practice_quiz') d.push('practice quiz');
    if (item.quizType === 'survey' || item.quizType === 'graded_survey') d.push('survey');
  }
  if (item.kind === 'assignment') {
    if (item.points !== undefined && item.points !== null) d.push(pts(item.points));
    if (item.submission) d.push(item.submission);
    if (item.group) d.push(item.group);
  }
  if (item.due) d.push(`due ${fmtDate(item.due)}`);
  if (item.graded && item.graded.points) d.push(`graded, ${pts(item.graded.points)}`);
  if (item.published === false) d.push('unpublished');
  return d;
}

/* ------------------------------------------------------------------ HTML of one item (reader, book, print) */

/**
 * The safe HTML of an item's text. links: (itemId) -> href for links to other course items; files: (path) -> href or
 * null for files inside the export; images: (path) -> src or null.
 */
export function itemBodyHtml(course, item, { links = id => `#item=${encodeURIComponent(id)}`, files = p => `#file=${encodeURIComponent(p)}`, images = () => null, headingShift = 1, fromPath = '' } = {}) {
  const html = item.html || '';
  return sanitizeHtml(html, {
    headingShift,
    link(href) {
      if (/^\$(WIKI_REFERENCE|CANVAS_OBJECT_REFERENCE|CANVAS_COURSE_REFERENCE)\$/.test(href)) {
        const id = resolveItemRef(course, href);
        return id ? { href: links(id), attrs: { 'data-item': id } } : null;
      }
      const f = resolveFilePath(course, href, fromPath || item.path || '');
      if (f) { const h = files(f); return h ? { href: h, attrs: { 'data-file': f } } : null; }
      if (/^(https?:|mailto:)/i.test(href)) return { href, attrs: { target: '_blank', rel: 'noopener noreferrer' } };
      return null;
    },
    image(src) {
      const f = resolveFilePath(course, src, fromPath || item.path || '');
      return f ? (images(f) ? { src: images(f) } : null) : null;
    },
    media(src, kind) {
      const f = resolveFilePath(course, src, fromPath || item.path || '');
      if (f) { const h = files(f); const name = f.slice(f.lastIndexOf('/') + 1); return h ? `<p class="cb-media"><a href="${esc(h)}" data-file="${esc(f)}">${kind === 'audio' ? 'Audio' : 'Video'} file: ${esc(name)}</a></p>` : `<p class="cb-media">${kind === 'audio' ? 'Audio' : 'Video'} file: ${esc(name)}</p>`; }
      if (/^https?:\/\//i.test(src)) return `<p class="cb-media">Embedded from the web: <a href="${esc(src)}" target="_blank" rel="noopener noreferrer">${esc(src.replace(/^https?:\/\//, '').slice(0, 80))}</a></p>`;
      return null;
    },
  });
}

/** The safe HTML of a quiz's questions. answers: mark the correct choices and add the answer line. */
export function quizHtml(course, item, { answers = false, images = () => null, files = () => null, links = () => null } = {}) {
  const opt = { images, files, links, headingShift: 2 };
  const body = h => itemBodyHtml(course, { html: h }, opt);
  let n = 0;
  const qHtml = (q) => {
    const num = q.type === 'text_only_question' ? '' : `${++n}.`;
    const meta = [TYPE_LABEL[q.type]];
    if (q.points !== null && q.type !== 'text_only_question') meta.push(pts(q.points));
    let h = `<li class="cb-q" data-type="${esc(q.type)}"><div class="cb-q-head"><span class="cb-q-num">${num}</span><span class="cb-q-meta">${esc(meta.join(', '))}</span></div><div class="cb-q-text">${body(q.html)}</div>`;
    if (q.choices.length) {
      h += `<ol class="cb-choices" type="A">${q.choices.map(c => `<li${answers && c.correct ? ' class="is-correct"' : ''}>${body(c.html)}${answers && c.correct ? ' <span class="cb-tick">Correct</span>' : ''}</li>`).join('')}</ol>`;
    }
    if (q.blanks.length) {
      h += `<dl class="cb-blanks">${q.blanks.map(b => `<dt>[${esc(b.name)}]</dt><dd>${q.type === 'multiple_dropdowns_question' || answers ? b.choices.filter(c => !answers ? true : c.correct).map(c => `<span${answers && c.correct ? ' class="is-correct"' : ''}>${body(c.html)}</span>`).join(' / ') : '__________'}</dd>`).join('')}</dl>`;
    }
    if (q.pairs.length) {
      const opts = [...new Set(q.pairs.flatMap(p => p.options))];
      h += `<table class="cb-match"><tbody>${q.pairs.map(p => `<tr><td>${body(p.left)}</td><td>${answers ? `<span class="is-correct">${p.right.map(body).join(' or ')}</span>` : '__________'}</td></tr>`).join('')}</tbody></table>`;
      if (!answers && opts.length) h += `<p class="cb-q-options">Choose from: ${opts.map(o => body(o)).join('; ')}</p>`;
      if (answers && q.distractors && q.distractors.length) h += `<p class="cb-q-options">Wrong options: ${q.distractors.map(o => body(o)).join('; ')}</p>`;
    }
    if (answers) {
      if (q.type === 'short_answer_question' || q.type === 'numerical_question') h += `<p class="cb-answer">Answer: ${esc(answerText(q)) || '(none in the file)'}</p>`;
      if (q.type === 'calculated_question' && q.formula) {
        h += `<p class="cb-answer">Formula: ${esc(q.formula.formulas.join('; '))}${q.formula.tolerance && q.formula.tolerance !== '0' ? `, tolerance ${esc(q.formula.tolerance)}` : ''}</p>`;
        if (q.formula.examples.length) h += `<p class="cb-q-options">Examples from the quiz: ${q.formula.examples.map(e => esc(e.vars.map(v => `${v.name} = ${v.value}`).join(', ') + ' gives ' + e.answer)).join('; ')}</p>`;
      }
      if (q.type === 'essay_question' || q.type === 'file_upload_question') h += '<p class="cb-answer cb-answer-none">Graded by hand, no answer in the file.</p>';
      if (q.feedback.general) h += `<div class="cb-feedback"><strong>Feedback:</strong> ${body(q.feedback.general)}</div>`;
    } else if (q.type === 'short_answer_question' || q.type === 'numerical_question' || q.type === 'calculated_question') h += '<p class="cb-line">Answer: ____________________</p>';
    else if (q.type === 'essay_question') h += '<div class="cb-essay-lines" aria-hidden="true"></div>';
    return h + '</li>';
  };
  const walk = (entries) => entries.map(e => {
    if (e.kind === 'question') return qHtml(e.q);
    const head = [e.title || 'Question group'];
    if (e.pick) head.push(`students get ${e.pick} of ${e.entries.length || 'the bank'}${e.pointsEach ? `, ${pts(e.pointsEach)} each` : ''}`);
    let bank = '';
    if (e.bankRef) { const b = course.items.get(e.bankRef); bank = b ? ` from the question bank "${esc(b.title)}"` : ' from a question bank that is not in this export'; }
    return `<li class="cb-group"><p class="cb-group-head">${esc(head.join(': '))}${bank}</p><ol class="cb-qs">${walk(e.entries)}</ol></li>`;
  }).join('');
  return `<ol class="cb-qs">${walk(item.quiz ? item.quiz.entries : [])}</ol>`;
}

/* ------------------------------------------------------------------ Word (.docx) */

const W_NS = 'xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"';
const wRun = (text, { b = false, i = false } = {}) => {
  const parts = String(text).split(NL);
  const props = b || i ? `<w:rPr>${b ? '<w:b/>' : ''}${i ? '<w:i/>' : ''}</w:rPr>` : '';
  return parts.map((t, k) => `${k ? '<w:r><w:br/></w:r>' : ''}<w:r>${props}<w:t xml:space="preserve">${xmlText(t)}</w:t></w:r>`).join('');
};
const wPara = (runs, style = '', indent = 0) => `<w:p>${style || indent ? `<w:pPr>${style ? `<w:pStyle w:val="${style}"/>` : ''}${indent ? `<w:ind w:left="${indent}"/>` : ''}</w:pPr>` : ''}${runs}</w:p>`;
const wText = (text, style = '', opts = {}, indent = 0) => wPara(wRun(text, opts), style, indent);
function wBlocks(html, indent = 0) {
  return htmlToBlocks(html).map(b => {
    const runs = b.runs.map(r => wRun(r.text, r)).join('');
    if (b.kind === 'h') return wPara(runs, b.level <= 2 ? 'Heading2' : 'Heading3', indent);
    if (b.kind === 'li') return wPara(wRun('- ') + runs, '', indent + 360 * b.level);
    return wPara(runs, '', indent);
  }).join('');
}

const STYLES = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>${NL}<w:styles ${W_NS}><w:docDefaults><w:rPrDefault><w:rPr><w:rFonts w:ascii="Calibri" w:hAnsi="Calibri" w:cs="Calibri"/><w:sz w:val="22"/></w:rPr></w:rPrDefault><w:pPrDefault><w:pPr><w:spacing w:after="120" w:line="276" w:lineRule="auto"/></w:pPr></w:pPrDefault></w:docDefaults><w:style w:type="paragraph" w:default="1" w:styleId="Normal"><w:name w:val="Normal"/></w:style><w:style w:type="paragraph" w:styleId="Title"><w:name w:val="Title"/><w:basedOn w:val="Normal"/><w:pPr><w:spacing w:after="200"/></w:pPr><w:rPr><w:b/><w:sz w:val="40"/></w:rPr></w:style><w:style w:type="paragraph" w:styleId="Heading2"><w:name w:val="heading 2"/><w:basedOn w:val="Normal"/><w:pPr><w:keepNext/><w:spacing w:before="240" w:after="80"/></w:pPr><w:rPr><w:b/><w:sz w:val="28"/></w:rPr></w:style><w:style w:type="paragraph" w:styleId="Heading3"><w:name w:val="heading 3"/><w:basedOn w:val="Normal"/><w:pPr><w:keepNext/><w:spacing w:before="200" w:after="60"/></w:pPr><w:rPr><w:b/><w:sz w:val="24"/></w:rPr></w:style><w:style w:type="paragraph" w:styleId="Small"><w:name w:val="Small"/><w:basedOn w:val="Normal"/><w:rPr><w:color w:val="555555"/><w:sz w:val="18"/></w:rPr></w:style></w:styles>`;

function docxPackage(title, bodyXml) {
  const doc = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>${NL}<w:document ${W_NS}><w:body>${bodyXml}<w:sectPr><w:pgSz w:w="12240" w:h="15840"/><w:pgMar w:top="1080" w:right="1080" w:bottom="1080" w:left="1080" w:header="708" w:footer="708" w:gutter="0"/></w:sectPr></w:body></w:document>`;
  const ct = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>${NL}<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/><Override PartName="/word/document.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml"/><Override PartName="/word/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.styles+xml"/><Override PartName="/docProps/core.xml" ContentType="application/vnd.openxmlformats-package.core-properties+xml"/></Types>`;
  const rels = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>${NL}<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="word/document.xml"/><Relationship Id="rId2" Type="http://schemas.openxmlformats.org/package/2006/relationships/metadata/core-properties" Target="docProps/core.xml"/></Relationships>`;
  const docRels = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>${NL}<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/styles" Target="styles.xml"/></Relationships>`;
  const core = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>${NL}<cp:coreProperties xmlns:cp="http://schemas.openxmlformats.org/package/2006/metadata/core-properties" xmlns:dc="http://purl.org/dc/elements/1.1/" xmlns:dcterms="http://purl.org/dc/terms/" xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance"><dc:title>${xmlText(title)}</dc:title><dc:creator>Cubby (peakappsstudio.com)</dc:creator></cp:coreProperties>`;
  return zipSync({
    '[Content_Types].xml': [strToU8(ct), { mtime }],
    '_rels/.rels': [strToU8(rels), { mtime }],
    'word/document.xml': [strToU8(doc), { mtime }],
    'word/styles.xml': [strToU8(STYLES), { mtime }],
    'word/_rels/document.xml.rels': [strToU8(docRels), { mtime }],
    'docProps/core.xml': [strToU8(core), { mtime }],
  });
}

const LETTERS = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ';
/** A quiz as a Word file: the questions to print for students, or (key) the same with every answer marked. */
export function quizDocx(course, item, { key = false } = {}) {
  let body = wText(item.title + (key ? ' (answer key)' : ''), 'Title');
  const info = detailsOf(item);
  if (info.length) body += wText(info.join(', '), 'Small');
  if (course.title) body += wText(`From the course: ${course.title}`, 'Small');
  if (item.html) body += wBlocks(item.html);
  let n = 0;
  const q1 = (q, indent) => {
    const head = q.type === 'text_only_question' ? '' : `${++n}. `;
    const meta = q.type === 'text_only_question' ? '' : ` (${TYPE_LABEL[q.type]}${q.points !== null ? ', ' + pts(q.points) : ''})`;
    let x = wPara(wRun(head, { b: true }) + wRun(oneLine(q.html, 0).length > 140 ? '' : oneLine(q.html), { b: true }) + wRun(meta, {}), 'Heading3', indent);
    if (oneLine(q.html).length > 140) x += wBlocks(q.html, indent);
    q.choices.forEach((c, k) => { x += wPara(wRun(`${LETTERS[k] || '-'}. `, { b: key && c.correct }) + wRun(oneLine(c.html), { b: key && c.correct }) + (key && c.correct ? wRun('  (correct)', { i: true }) : ''), '', indent + 360); });
    q.blanks.forEach(b => { x += wText(`[${b.name}] ${q.type === 'multiple_dropdowns_question' && !key ? b.choices.map(c => oneLine(c.html)).join(' / ') : key ? b.choices.filter(c => c.correct).map(c => oneLine(c.html)).join(' or ') : '__________'}`, '', {}, indent + 360); });
    if (q.pairs.length) {
      q.pairs.forEach(p => { x += wText(`${oneLine(p.left)}  =  ${key ? p.right.map(r => oneLine(r)).join(' or ') : '__________'}`, '', {}, indent + 360); });
      if (!key) x += wText('Choose from: ' + [...new Set(q.pairs.flatMap(p => p.options))].map(o => oneLine(o)).join('; '), 'Small', {}, indent + 360);
    }
    if (key && (q.type === 'short_answer_question' || q.type === 'numerical_question' || q.type === 'calculated_question')) x += wText(`Answer: ${answerText(q) || '(none in the file)'}`, '', { b: true }, indent + 360);
    if (!key && (q.type === 'short_answer_question' || q.type === 'numerical_question' || q.type === 'calculated_question')) x += wText('Answer: ______________________', '', {}, indent + 360);
    if (!key && q.type === 'essay_question') x += wText(NL + NL + NL + NL, '', {}, indent);
    if (key && (q.type === 'essay_question' || q.type === 'file_upload_question')) x += wText('Graded by hand.', 'Small', {}, indent + 360);
    if (key && q.feedback.general) x += wText('Feedback: ' + htmlToText(q.feedback.general), 'Small', {}, indent + 360);
    return x;
  };
  const walk = (entries, indent) => entries.map(e => {
    if (e.kind === 'question') return q1(e.q, indent);
    let h = e.title || 'Question group';
    if (e.pick) h += `: students get ${e.pick} of ${e.entries.length || 'the bank'}${e.pointsEach ? `, ${pts(e.pointsEach)} each` : ''}`;
    if (e.bankRef) { const b = course.items.get(e.bankRef); h += b ? ` (from the question bank "${b.title}")` : ' (from a question bank not in this export)'; }
    return wText(h, 'Heading2', {}, indent) + walk(e.entries, indent);
  }).join('');
  body += walk(item.quiz ? item.quiz.entries : [], 0);
  return docxPackage(item.title, body);
}

/* ------------------------------------------------------------------ spreadsheet and Moodle XML */

const csvCell = v => { const s = String(v ?? '').replace(/\r?\n/g, ' ').trim(); return /[",;\n]/.test(s) || /^[=+\-@]/.test(s) ? `"${(/^[=+\-@]/.test(s) ? "'" : '') + s.replace(/"/g, '""')}"` : s; };

/** Every question of every quiz (and bank) in one CSV, one row per question, with up to 10 choices and the answer. */
export function questionsCsv(course) {
  const head = ['Quiz', 'Number', 'Question type', 'Points', 'Question', ...Array.from({ length: 10 }, (_, k) => `Choice ${LETTERS[k]}`), 'Correct answer', 'Feedback'];
  const rows = [head];
  for (const item of quizItems(course)) {
    let n = 0;
    for (const q of questionsOf(item.quiz)) {
      if (q.type === 'text_only_question') continue;
      const choices = q.choices.length ? q.choices.map(c => oneLine(c.html)) : q.blanks.length ? q.blanks.map(b => `[${b.name}] ${b.choices.map(c => oneLine(c.html)).join(' / ')}`) : q.pairs.map(p => `${oneLine(p.left)} = ?`);
      rows.push([item.title, ++n, TYPE_LABEL[q.type], q.points ?? '', htmlToText(q.html), ...Array.from({ length: 10 }, (_, k) => choices[k] || ''), answerText(q), q.feedback.general ? htmlToText(q.feedback.general) : '']);
    }
  }
  return BOM + rows.map(r => r.map(csvCell).join(',')).join('\r\n') + '\r\n';
}

export function quizItems(course) {
  const out = [];
  const seen = new Set();
  for (const it of course.items.values()) if ((it.kind === 'quiz' || it.kind === 'bank') && !seen.has(it)) { seen.add(it); out.push(it); }
  return out;
}

const cdata = s => `<![CDATA[${String(s).replace(/]]>/g, ']]]]><![CDATA[>')}]]>`;
const frac = n => (Math.round((100 / n) * 100000) / 100000).toString();

/** Moodle XML: every quiz as a category of questions, the format Moodle's question bank imports. Formula questions are
 * listed in a comment and left out (Moodle's calculated questions use their own wildcards). */
export function moodleXml(course) {
  const out = ['<?xml version="1.0" encoding="UTF-8"?>', '<quiz>'];
  const skipped = [];
  const txt = h => cdata(sanitizeHtml(h || '', { link: href => (/^https?:/i.test(href) ? { href } : null), image: () => null }));
  for (const item of quizItems(course)) {
    out.push(`  <question type="category"><category><text>${xmlText('$course$/' + (course.title ? course.title.replace(/\//g, '-') + '/' : '') + item.title.replace(/\//g, '-'))}</text></category></question>`);
    let n = 0;
    for (const q of questionsOf(item.quiz)) {
      n++;
      const name = `<name><text>${xmlText((q.title && q.title !== 'Question' ? q.title : `${item.title} Q${n}`).slice(0, 250))}</text></name>`;
      const qt = `<questiontext format="html"><text>${txt(q.html)}</text></questiontext>`;
      const grade = `<defaultgrade>${q.points ?? 1}</defaultgrade>`;
      const fb = q.feedback.general ? `<generalfeedback format="html"><text>${txt(q.feedback.general)}</text></generalfeedback>` : '';
      const ans = (fraction, h, f = '') => `<answer fraction="${fraction}" format="html"><text>${txt(h)}</text>${f ? `<feedback format="html"><text>${txt(f)}</text></feedback>` : ''}</answer>`;
      let x = '';
      switch (q.type) {
        case 'true_false_question': {
          const t = q.choices.find(c => /^true$/i.test(htmlToText(c.html)));
          const isTrue = t ? t.correct : (q.choices[0] && q.choices[0].correct);
          x = `<question type="truefalse">${name}${qt}${grade}${fb}<answer fraction="${isTrue ? 100 : 0}"><text>true</text></answer><answer fraction="${isTrue ? 0 : 100}"><text>false</text></answer></question>`;
          break;
        }
        case 'multiple_choice_question': case 'unknown':
          if (!q.choices.length) { skipped.push(`${item.title} Q${n}`); continue; }
          x = `<question type="multichoice">${name}${qt}${grade}${fb}<single>true</single><shuffleanswers>true</shuffleanswers><answernumbering>abc</answernumbering>${q.choices.map(c => ans(c.correct ? 100 : 0, c.html, q.feedback.answers && q.feedback.answers[c.id])).join('')}</question>`;
          break;
        case 'multiple_answers_question': {
          const right = q.choices.filter(c => c.correct).length || 1, wrong = q.choices.filter(c => !c.correct).length || 1;
          x = `<question type="multichoice">${name}${qt}${grade}${fb}<single>false</single><shuffleanswers>true</shuffleanswers><answernumbering>abc</answernumbering>${q.choices.map(c => ans(c.correct ? frac(right) : '-' + frac(wrong), c.html)).join('')}</question>`;
          break;
        }
        case 'short_answer_question':
          x = `<question type="shortanswer">${name}${qt}${grade}${fb}<usecase>0</usecase>${q.answers.map(a => `<answer fraction="100"><text>${xmlText(a)}</text></answer>`).join('')}</question>`;
          break;
        case 'numerical_question':
          x = `<question type="numerical">${name}${qt}${grade}${fb}${q.numeric.map(v => v.exact !== undefined ? `<answer fraction="100"><text>${v.exact}</text><tolerance>${v.margin || 0}</tolerance></answer>` : `<answer fraction="100"><text>${(v.lo + v.hi) / 2}</text><tolerance>${Math.abs(v.hi - v.lo) / 2}</tolerance></answer>`).join('')}</question>`;
          break;
        case 'essay_question': case 'file_upload_question':
          x = `<question type="essay">${name}${qt}${grade}${fb}<responseformat>editor</responseformat><responsefieldlines>15</responsefieldlines><attachments>${q.type === 'file_upload_question' ? 1 : 0}</attachments></question>`;
          break;
        case 'text_only_question':
          x = `<question type="description">${name}${qt}</question>`;
          break;
        case 'matching_question':
          x = `<question type="matching">${name}${qt}${grade}${fb}<shuffleanswers>true</shuffleanswers>${q.pairs.map(p => `<subquestion format="html"><text>${txt(p.left)}</text><answer><text>${xmlText(oneLine(p.right[0] || ''))}</text></answer></subquestion>`).join('')}${(q.distractors || []).map(d => `<subquestion format="html"><text></text><answer><text>${xmlText(oneLine(d))}</text></answer></subquestion>`).join('')}</question>`;
          break;
        case 'fill_in_multiple_blanks_question': case 'multiple_dropdowns_question': {
          let h = q.html;
          for (const b of q.blanks) {
            const esc2 = s => oneLine(s).replace(/[~=#{}:\\]/g, '\\$&');
            const code = q.type === 'multiple_dropdowns_question'
              ? `{1:MULTICHOICE:${b.choices.map(c => (c.correct ? '=' : '') + esc2(c.html)).join('~')}}`
              : `{1:SHORTANSWER:${b.choices.filter(c => c.correct).map(c => '=' + esc2(c.html)).join('~')}}`;
            h = h.split(`[${b.name}]`).join(code);
          }
          x = `<question type="cloze">${name}<questiontext format="html"><text>${txt(h).replace(/\{1:(MULTICHOICE|SHORTANSWER):[^}]*\}/g, m => m)}</text></questiontext>${fb}</question>`;
          break;
        }
        default:
          skipped.push(`${item.title} Q${n} (${TYPE_LABEL[q.type]})`);
          continue;
      }
      out.push('  ' + x);
    }
  }
  if (skipped.length) out.splice(1, 0, `  <!-- Not included (Moodle needs these rebuilt by hand): ${xmlText(skipped.join('; '))} -->`);
  out.push('</quiz>', '');
  return { xml: out.join(NL), skipped };
}

/* ------------------------------------------------------------------ the course as one web page */

const BOOK_CSS = `body{margin:0;background:#fff;color:#1d2730;font:17px/1.6 system-ui,-apple-system,"Segoe UI",Arial,sans-serif}main{max-width:760px;margin:0 auto;padding:32px 20px 80px}h1{font-size:34px;line-height:1.15;margin:0 0 8px}h2{font-size:26px;margin:48px 0 8px;padding-top:16px;border-top:4px solid #0a7470}h3{font-size:21px;margin:32px 0 6px}h4,h5,h6{font-size:18px}.meta{color:#55616a;font-size:15px;margin:0 0 12px}nav ol{padding-left:22px}img{max-width:100%;height:auto}table{border-collapse:collapse;max-width:100%}td,th{border:1px solid #c9d1d6;padding:4px 8px;vertical-align:top}.item{margin:0 0 24px}.kind{display:inline-block;font-size:13px;font-weight:700;color:#0a7470;margin-right:6px}.cb-qs{padding-left:22px}.cb-q{margin:0 0 18px}.cb-q-head{font-weight:700}.cb-q-meta{font-weight:400;color:#55616a;font-size:14px;margin-left:8px}.is-correct{font-weight:700}.cb-tick{font-size:13px;color:#0a7470;font-weight:700}.cb-answer{font-weight:700}.cb-group-head{font-weight:700;margin:16px 0 6px}.cb-match td{min-width:120px}.cb-missing-img,.cb-deadlink{color:#55616a}.cb-math{font-family:Consolas,monospace}.rubric td,.rubric th{font-size:15px}@media print{h2{break-before:page;border:0}a{color:inherit}}`;

/**
 * The whole course in one HTML file: contents, then every module in order with its items, then what no module holds.
 * Pictures inside pages are embedded (images: path -> data: address); other files are named, not embedded.
 */
export function courseBook(course, { images = () => null } = {}) {
  const parts = [];
  const toc = [];
  const done = new Set();
  const opt = { images, files: () => null, links: id => `#i-${encodeURIComponent(id)}` };
  const itemSection = (it, level = 3) => {
    if (!it || done.has(it.id)) return it ? `<p class="meta">${esc(KIND_LABEL[it.kind] || '')}: ${esc(it.title)} (shown above)</p>` : '';
    done.add(it.id);
    const d = detailsOf(it);
    let h = `<section class="item" id="i-${esc(encodeURIComponent(it.id))}"><h${level}><span class="kind">${esc(KIND_LABEL[it.kind] || '')}</span>${esc(it.title)}</h${level}>`;
    if (d.length) h += `<p class="meta">${esc(d.join(', '))}</p>`;
    if (it.kind === 'file') h += `<p>File: ${esc(it.folder ? it.folder + '/' : '')}${esc(it.title)}</p>`;
    else if (it.kind === 'link' || it.kind === 'tool') h += it.url && /^https?:/i.test(it.url) ? `<p><a href="${esc(it.url)}">${esc(it.url)}</a></p>` : '';
    else if (it.kind === 'quiz' || it.kind === 'bank') h += (it.html ? itemBodyHtml(course, it, opt) : '') + quizHtml(course, it, { answers: true, images });
    else h += itemBodyHtml(course, it, opt);
    if (it.rubric) h += rubricHtml(it.rubric);
    if (it.attachments && it.attachments.length) h += `<p class="meta">Attached: ${it.attachments.map(a => esc(decodeURIComponent(a.replace(/^.*\//, '')))).join(', ')}</p>`;
    return h + '</section>';
  };
  if (course.syllabus) { toc.push(['syllabus-sec', 'Syllabus']); parts.push(`<h2 id="syllabus-sec">Syllabus</h2>${itemBodyHtml(course, course.syllabus, opt)}`); done.add('syllabus'); }
  course.modules.forEach((m, k) => {
    const id = `m-${k + 1}`;
    toc.push([id, m.title]);
    let h = `<h2 id="${id}">${esc(m.title)}</h2>`;
    for (const it of m.items) {
      if (it.header) { h += `<h3>${esc(it.title)}</h3>`; continue; }
      const item = course.items.get(it.ref);
      h += item ? itemSection(item) : `<p class="meta">${esc(it.title)} (not in this export)</p>`;
    }
    parts.push(h);
  });
  const rest = course.groups.map(g => [g, g.items.filter(i => !done.has(i.id))]).filter(([, l]) => l.length);
  if (rest.length) {
    toc.push(['rest', 'Not in any module']);
    parts.push(`<h2 id="rest">Not in any module</h2>` + rest.map(([g, l]) => `<h3>${esc(g.title)}</h3>` + l.map(i => itemSection(i, 4)).join('')).join(''));
  }
  if (course.files.length) {
    toc.push(['files', 'Files']);
    parts.push(`<h2 id="files">Files</h2><p class="meta">${course.files.length} files are in the export. They are not copied into this page.</p><ul>${course.files.map(f => `<li>${esc(f.folder ? f.folder + '/' : '')}${esc(f.title)}</li>`).join('')}</ul>`);
  }
  const title = course.title || 'Course';
  return `<!doctype html>${NL}<html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><title>${esc(title)}</title><style>${BOOK_CSS}</style></head><body><main><h1>${esc(title)}</h1><p class="meta">${esc([course.code, course.lms ? `Exported from ${course.lms}` : '', course.exportedAt ? `on ${fmtDate(course.exportedAt)}` : ''].filter(Boolean).join(', '))}. Saved with Cubby (peakappsstudio.com/open-imscc-file/). Quiz answers are marked.</p><nav aria-label="Contents"><h2 style="border:0;margin-top:24px">Contents</h2><ol>${toc.map(([id, t]) => `<li><a href="#${id}">${esc(t)}</a></li>`).join('')}</ol></nav>${parts.join(NL)}</main></body></html>${NL}`;
}

export function rubricHtml(r) {
  if (!r || !r.criteria || !r.criteria.length) return '';
  return `<table class="rubric"><caption>Rubric: ${esc(r.title)} (${pts(r.points)})</caption><thead><tr><th scope="col">Criterion</th><th scope="col">Ratings</th><th scope="col">Points</th></tr></thead><tbody>${r.criteria.map(c => `<tr><td>${esc(c.description)}${c.long ? `<br><small>${esc(c.long)}</small>` : ''}</td><td>${c.ratings.map(x => `${esc(x.description)} (${x.points})`).join('<br>')}</td><td>${c.points}</td></tr>`).join('')}</tbody></table>`;
}

/* ------------------------------------------------------------------ ZIPs */

/** Every quiz as Word files (questions and answer key), plus every question as CSV and Moodle XML, in one ZIP. */
export function quizzesZip(course) {
  const z = {};
  const name = uniqueNamer();
  for (const item of quizItems(course)) {
    const stem = safeName(item.title, 70);
    z[`Quizzes/${name(stem + ' - questions.docx')}`] = [quizDocx(course, item), { level: 0, mtime }];
    z[`Quizzes/${name(stem + ' - answer key.docx')}`] = [quizDocx(course, item, { key: true }), { level: 0, mtime }];
  }
  const m = moodleXml(course);
  z['All questions.csv'] = [strToU8(questionsCsv(course)), { mtime }];
  z['All questions (Moodle XML).xml'] = [strToU8(m.xml), { mtime }];
  const readme = [`Quizzes from: ${course.title || 'your course'}`, '',
    'Quizzes/            each quiz as a Word file to print, and a second one with the answers marked.',
    'All questions.csv   every question in a spreadsheet, one row each, with the choices and the correct answer.',
    'All questions (Moodle XML).xml   import into Moodle: Question bank > Import > Moodle XML format.',
    m.skipped.length ? `Left out of the Moodle file (rebuild these by hand): ${m.skipped.join('; ')}` : '', '',
    'Made in your browser by Cubby, https://peakappsstudio.com/open-imscc-file/', ''].join('\r\n');
  z['Read me.txt'] = [strToU8(readme), { mtime }];
  return zipSync(z);
}

/** Every course file in one ZIP, in the folders the course used. */
export function filesZip(course) {
  const z = {};
  const name = uniqueNamer();
  for (const f of course.files) {
    const bytes = fileBytes(course, f.path);
    if (!bytes) continue;
    const rel = (f.folder ? f.folder + '/' : '') + f.title;
    z[name(rel.split('/').map(s => safeName(s, 120)).join('/'))] = [bytes, { level: /\.(jpe?g|png|gif|webp|mp4|mov|m4v|mp3|m4a|zip|docx|xlsx|pptx|pdf)$/i.test(f.title) ? 0 : 6, mtime }];
  }
  return zipSync(z);
}

/** The page text of one item as plain text (the copy button). */
export function itemText(course, item) {
  const lines = [item.title];
  const d = detailsOf(item);
  if (d.length) lines.push(d.join(', '));
  if (item.html) lines.push('', htmlToText(item.html));
  if (item.kind === 'quiz' || item.kind === 'bank') {
    let n = 0;
    for (const q of questionsOf(item.quiz)) {
      if (q.type === 'text_only_question') { lines.push('', htmlToText(q.html)); continue; }
      lines.push('', `${++n}. ${htmlToText(q.html)}`);
      q.choices.forEach((c, k) => lines.push(`   ${LETTERS[k]}. ${oneLine(c.html)}`));
      q.blanks.forEach(b => lines.push(`   [${b.name}]`));
      q.pairs.forEach(p => lines.push(`   ${oneLine(p.left)} = ?`));
    }
  }
  if ((item.kind === 'link' || item.kind === 'tool') && item.url) lines.push(item.url);
  return lines.join(NL);
}

export { mimeOf, isImage };
