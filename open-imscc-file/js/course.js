// Opens a course export (.imscc, the IMS Common Cartridge ZIP that Canvas writes under Settings > Export Course Content)
// and turns it into the course as a teacher saw it: modules with their items, and every page, assignment, quiz,
// discussion, link and file. It also reads a Canvas quiz export (the QTI .zip) and Common Cartridges from other systems.
// The ZIP is read in the browser; text files are unpacked at once and the course files only when one is opened.
// Canvas's export format, as written by its exporter (instructure/canvas-lms, lib/cc): imsmanifest.xml lists the
// resources and the module tree; course_settings/ holds Canvas's own files (module_meta.xml, assignment_groups.xml,
// rubrics.xml, syllabus.html, course_settings.xml, canvas_export.txt); wiki_content/ the pages; web_resources/ the course
// files; one folder per assignment and quiz; non_cc_assessments/ the full quiz files.
import { unzipSync, strFromU8 } from '../vendor/fflate.js';
import { parseXml, El } from './xml.js';
import { parseQti, questionsOf } from './qti.js';

export class CourseError extends Error {
  constructor(code, message) { super(message); this.code = code; }
}

const TEXT_EXT = /\.(xml|html?|qti|txt|json)$/i;
const MAX_TEXT = 25 * 1024 * 1024;
const T = {
  LOR: 'associatedcontent/imscc_xmlv1p1/learning-application-resource',
  WEB: 'webcontent',
};
const isType = (t, re) => re.test(t || '');
const BOM = new RegExp('^' + String.fromCharCode(0xfeff));

function sniff(bytes) {
  const b = bytes;
  if (!b || !b.length) return 'empty';
  if (b[0] === 0x50 && b[1] === 0x4b && (b[2] === 3 || b[2] === 5 || b[2] === 7)) return 'zip';
  const head = strFromU8(b.subarray(0, 512), true).replace(BOM, '').trimStart().toLowerCase();
  if (head.startsWith('%pdf')) return 'pdf';
  if (head.startsWith('<!doctype html') || head.startsWith('<html')) return 'html';
  if (head.startsWith('<?xml') || head.startsWith('<questestinterop') || head.startsWith('<manifest')) return 'xml';
  if (b[0] === 0xd0 && b[1] === 0xcf && b[2] === 0x11 && b[3] === 0xe0) return 'office-old';
  if (b[0] === 0x52 && b[1] === 0x61 && b[2] === 0x72 && b[3] === 0x21) return 'rar';
  if (b[0] === 0x37 && b[1] === 0x7a && b[2] === 0xbc) return '7z';
  return 'other';
}

const decodePath = p => { try { return decodeURIComponent(p); } catch { return p; } };
const norm = p => {
  const parts = [];
  for (const s of String(p).replace(/\\/g, '/').split('/')) { if (!s || s === '.') continue; if (s === '..') parts.pop(); else parts.push(s); }
  return parts.join('/');
};
const join = (dir, rel) => norm((dir ? dir + '/' : '') + rel);
const dirOf = p => (p.lastIndexOf('/') < 0 ? '' : p.slice(0, p.lastIndexOf('/')));
const baseOf = p => p.slice(p.lastIndexOf('/') + 1);
const textOf = (el, ...names) => { const e = el ? el.at(...names) : null; return e ? e.text.trim() : ''; };

const MIME = {
  pdf: 'application/pdf', jpg: 'image/jpeg', jpeg: 'image/jpeg', png: 'image/png', gif: 'image/gif', webp: 'image/webp', svg: 'image/svg+xml', bmp: 'image/bmp',
  mp4: 'video/mp4', m4v: 'video/mp4', mov: 'video/quicktime', webm: 'video/webm', mp3: 'audio/mpeg', m4a: 'audio/mp4', wav: 'audio/wav', ogg: 'audio/ogg',
  doc: 'application/msword', docx: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document', xls: 'application/vnd.ms-excel',
  xlsx: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet', ppt: 'application/vnd.ms-powerpoint',
  pptx: 'application/vnd.openxmlformats-officedocument.presentationml.presentation', txt: 'text/plain', csv: 'text/csv', zip: 'application/zip',
  html: 'text/html', htm: 'text/html', rtf: 'application/rtf', odt: 'application/vnd.oasis.opendocument.text',
};
export const mimeOf = name => MIME[(name.split('.').pop() || '').toLowerCase()] || 'application/octet-stream';
export const isImage = name => /^image\/(jpeg|png|gif|webp|bmp)$/.test(mimeOf(name));

/** Reads the HTML page Canvas writes for a page or an assignment: its <title>, its <meta> fields and its <body>. */
export function readHtmlPage(src) {
  const s = String(src || '');
  const title = ((/<title[^>]*>([\s\S]*?)<\/title>/i.exec(s) || [])[1] || '').trim();
  const meta = {};
  for (const m of s.matchAll(/<meta\s+name="([^"]+)"\s+content="([^"]*)"\s*\/?>/gi)) meta[m[1]] = m[2];
  const b = /<body[^>]*>([\s\S]*?)<\/body>/i.exec(s);
  return { title: decodeBasic(title), meta, body: (b ? b[1] : s.replace(/<head[\s\S]*?<\/head>/i, '').replace(/<\/?(html|body)[^>]*>/gi, '')).trim() };
}
const decodeBasic = s => s.replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"').replace(/&#39;/g, "'").replace(/&amp;/g, '&');

/**
 * Opens the bytes of a course export. Returns the course model:
 *   { kind: 'canvas-course'|'cartridge'|'qti', title, code, version, modules, items (Map), groups, files, syllabus, stats, ... }
 * Throws CourseError with a code the page explains: empty, pdf, html, office-old, rar, 7z, not-zip, encrypted,
 * no-manifest, bad-manifest, too-big.
 */
export function openCourse(bytes, { fileName = '' } = {}) {
  const kind = sniff(bytes);
  if (kind === 'empty') throw new CourseError('empty', 'The file is empty.');
  if (kind === 'xml') return openLooseXml(bytes, fileName);
  if (kind !== 'zip') throw new CourseError(kind === 'other' ? 'not-zip' : kind, 'This is not a course export.');
  const entries = [];
  let texts;
  try {
    texts = unzipSync(bytes, {
      filter(f) {
        if (f.name.endsWith('/')) return false;
        entries.push({ path: f.name, size: f.originalSize, csize: f.size });
        return TEXT_EXT.test(f.name) && f.originalSize <= MAX_TEXT && !/^web_resources\//.test(stripPrefixGuess(f.name)) || /imsmanifest\.xml$/i.test(f.name);
      },
    });
  } catch (e) {
    if (/encrypt/i.test(String(e && e.message))) throw new CourseError('encrypted', 'The ZIP is password protected.');
    throw new CourseError('not-zip', 'The ZIP could not be read: ' + (e && e.message ? e.message : e));
  }
  return buildCourse(bytes, entries, texts, fileName);
}
// web_resources HTML files are course files (a teacher's uploaded HTML), loaded on demand like the rest
function stripPrefixGuess(p) { const i = p.indexOf('web_resources/'); return i > 0 ? p.slice(i) : p; }

function openLooseXml(bytes, fileName) {
  // a single QTI file (some people unzip the quiz export and choose the XML inside)
  let root;
  try { root = parseXml(strFromU8(bytes)); } catch { throw new CourseError('not-zip', 'This XML file is not a course export.'); }
  if (root.name === 'manifest') throw new CourseError('manifest-only', 'This is only the list of contents of a course export.');
  if (root.name !== 'questestinterop') throw new CourseError('not-zip', 'This XML file is not a course export.');
  const files = new Map([['quiz.xml', bytes]]);
  return buildCourse(bytes, [{ path: 'quiz.xml', size: bytes.length }], Object.fromEntries(files), fileName, { looseQti: true });
}

function buildCourse(bytes, entries, texts, fileName, { looseQti = false } = {}) {
  const text = p => (texts[p] ? strFromU8(texts[p]) : null);
  const manifests = Object.keys(texts).filter(p => /(^|\/)imsmanifest\.xml$/i.test(p)).sort((a, b) => a.split('/').length - b.split('/').length);
  const qtiFiles = Object.keys(texts).filter(p => /\.(xml\.qti|qti)$/i.test(p) || /(^|\/)assessment_qti\.xml$/i.test(p));
  const course = {
    kind: 'cartridge', title: '', code: '', version: '', fileName, exportedAt: '', lms: '',
    modules: [], items: new Map(), groups: [], files: [], syllabus: null, rubrics: new Map(), assignmentGroups: new Map(),
    stats: {}, warnings: [], bytes, entries,
  };
  if (looseQti || (!manifests.length && qtiFiles.length)) {
    course.kind = 'qti';
    const list = looseQti ? ['quiz.xml'] : qtiFiles;
    for (const p of list) {
      try {
        const z = parseQti(text(p));
        const id = z.id || p;
        course.items.set(id, quizItem(id, z.title || baseOf(p), z, null, z.kind === 'bank' ? 'bank' : 'quiz'));
      } catch (e) { course.warnings.push(`${p}: ${e.message}`); }
    }
    if (!course.items.size) throw new CourseError('no-manifest', 'No course or quiz was found in this file.');
    course.title = course.items.size === 1 ? [...course.items.values()][0].title : 'Quizzes';
    finish(course);
    return course;
  }
  if (!manifests.length) {
    if (entries.some(e => /\.imscc$/i.test(e.path))) throw new CourseError('nested', 'The ZIP holds .imscc files, not a course.');
    throw new CourseError('no-manifest', 'No imsmanifest.xml in this ZIP.');
  }
  const mpath = manifests[0];
  const base = dirOf(mpath);
  const at = rel => join(base, decodePath(rel));
  let man;
  try { man = parseXml(text(mpath)); } catch (e) { throw new CourseError('bad-manifest', 'imsmanifest.xml could not be read.'); }
  if (man.name !== 'manifest') throw new CourseError('bad-manifest', 'imsmanifest.xml is not a manifest.');
  const md = man.kid('metadata');
  course.version = textOf(md, 'schemaversion');
  course.title = textOf(md, 'lom', 'general', 'title', 'string') || textOf(md, 'lom', 'general', 'title', 'langstring') || '';
  course.exportedAt = textOf(md, 'lom', 'lifeCycle', 'contribute', 'date', 'dateTime');
  const isCanvas = texts[at('course_settings/canvas_export.txt')] !== undefined || entries.some(e => e.path === at('course_settings/canvas_export.txt'));
  course.kind = isCanvas ? 'canvas-course' : 'cartridge';
  course.lms = isCanvas ? 'Canvas' : '';

  // ---- resources
  const res = new Map();
  for (const r of man.all('resource')) {
    const id = r.attr('identifier') || '';
    res.set(id, {
      id, type: r.attr('type') || '', href: r.attr('href') ? at(r.attr('href')) : '', intendeduse: r.attr('intendeduse') || '',
      files: r.kids('file').map(f => at(f.attr('href') || '')), deps: r.kids('dependency').map(d => d.attr('identifierref') || ''),
    });
  }
  const firstFile = r => r.href || r.files[0] || '';

  // ---- Canvas course settings
  if (isCanvas) {
    const cs = text(at('course_settings/course_settings.xml'));
    if (cs) { try { const x = parseXml(cs); course.title = textOf(x, 'title') || course.title; course.code = textOf(x, 'course_code'); } catch { /* keep the manifest title */ } }
    const ag = text(at('course_settings/assignment_groups.xml'));
    if (ag) { try { for (const g of parseXml(ag).kids('assignmentGroup')) course.assignmentGroups.set(g.attr('identifier'), { title: textOf(g, 'title'), weight: textOf(g, 'group_weight') }); } catch { /* optional */ } }
    const rb = text(at('course_settings/rubrics.xml'));
    if (rb) { try { for (const r of parseXml(rb).kids('rubric')) course.rubrics.set(r.attr('identifier'), readRubric(r)); } catch { /* optional */ } }
  }

  // ---- items, one per resource that is something a teacher made
  const metaFor = new Map(); // quiz id -> assessment_meta.xml path; topic meta
  for (const r of res.values()) {
    const p = firstFile(r);
    if (isType(r.type, /learning-application-resource/) && /assessment_meta\.xml$/i.test(p)) metaFor.set(r.id, r);
  }
  const usedRes = new Set();
  for (const r of res.values()) {
    try {
      const item = readResource(r, { text, at, res, course, isCanvas });
      if (item) { course.items.set(r.id, item); usedRes.add(r.id); }
    } catch (e) { course.warnings.push(`${firstFile(r) || r.id}: ${e.message}`); }
  }
  // question banks Canvas keeps in non_cc_assessments/ without a quiz (resources with an objectbank)
  for (const p of qtiFiles) {
    if (!/non_cc_assessments\//.test(p)) continue;
    const id = baseOf(p).replace(/\.xml\.qti$/i, '');
    if (course.items.has(id) || [...course.items.values()].some(i => i.qtiPath === p)) continue;
    try {
      const z = parseQti(text(p));
      if (z.kind === 'bank') course.items.set(z.id || id, quizItem(z.id || id, z.title || 'Question bank', z, null, 'bank', p));
    } catch (e) { course.warnings.push(`${p}: ${e.message}`); }
  }

  // ---- files: Canvas keeps them in web_resources/; other cartridges list them as webcontent resources
  const fileSet = new Map();
  for (const e of entries) {
    const rel = base ? (e.path.startsWith(base + '/') ? e.path.slice(base.length + 1) : null) : e.path;
    if (rel === null) continue;
    if (/^web_resources\//.test(rel)) fileSet.set(e.path, e);
  }
  if (!isCanvas) {
    for (const r of res.values()) {
      if (r.type !== T.WEB) continue;
      for (const f of r.files) { const e = entries.find(x => x.path === f); if (e && !/\.html?$/i.test(f)) fileSet.set(f, e); }
    }
  }
  for (const [path, e] of fileSet) {
    const rel = base && path.startsWith(base + '/') ? path.slice(base.length + 1) : path;
    const shown = rel.replace(/^web_resources\//, '');
    const id = 'file:' + path;
    const item = { id, kind: 'file', title: baseOf(shown), path, folder: dirOf(shown), size: e.size, mime: mimeOf(path) };
    course.files.push(item);
    if (!course.items.has(id)) course.items.set(id, item);
  }
  course.files.sort((a, b) => (a.folder + '/' + a.title).localeCompare(b.folder + '/' + b.title, 'en'));
  // a webcontent resource that points at a course file is the same thing as that file
  for (const r of res.values()) {
    if (r.type === T.WEB && course.items.get(r.id) === undefined) {
      const p = firstFile(r);
      if (p && fileSet.has(p)) course.items.set(r.id, course.items.get('file:' + p));
    }
  }

  // ---- syllabus
  for (const r of res.values()) {
    if (r.intendeduse === 'syllabus' || /course_settings\/syllabus\.html$/i.test(firstFile(r))) {
      const h = text(firstFile(r));
      if (h && readHtmlPage(h).body.replace(/<[^>]*>/g, '').trim()) course.syllabus = { id: 'syllabus', kind: 'page', title: 'Syllabus', html: readHtmlPage(h).body, syllabus: true };
    }
  }
  if (course.syllabus) course.items.set('syllabus', course.syllabus);

  // ---- modules
  const mm = isCanvas ? text(at('course_settings/module_meta.xml')) : null;
  if (mm) {
    try {
      const x = parseXml(mm);
      for (const m of x.kids('module')) {
        const mod = { id: m.attr('identifier') || '', title: textOf(m, 'title') || 'Module', published: textOf(m, 'workflow_state') !== 'unpublished', items: [] };
        const items = m.kid('items');
        for (const it of items ? items.kids('item') : []) {
          const type = textOf(it, 'content_type');
          const ref = textOf(it, 'identifierref');
          mod.items.push({
            id: it.attr('identifier') || ref, ref, type, title: textOf(it, 'title'), url: textOf(it, 'url'),
            indent: Math.min(5, parseInt(textOf(it, 'indent'), 10) || 0), published: textOf(it, 'workflow_state') !== 'unpublished',
            header: type === 'ContextModuleSubHeader',
          });
        }
        course.modules.push(mod);
      }
    } catch (e) { course.warnings.push('course_settings/module_meta.xml: ' + e.message); }
  }
  if (!course.modules.length) {
    const org = man.find('organization');
    const root = org ? (org.kid('item') || org) : null;
    if (root) {
      const loose = { id: 'loose', title: 'Course content', published: true, items: [] };
      const walkMod = (el, mod, depth) => {
        for (const it of el.kids('item')) {
          const title = textOf(it, 'title');
          const ref = it.attr('identifierref') || '';
          if (it.kids('item').length && !ref) {
            if (!mod) { const m = { id: it.attr('identifier') || '', title: title || 'Module', published: true, items: [] }; course.modules.push(m); walkMod(it, m, 0); }
            else { mod.items.push({ id: it.attr('identifier') || '', header: true, title, indent: depth }); walkMod(it, mod, depth + 1); }
          } else (mod || loose).items.push({ id: it.attr('identifier') || ref, ref, title, indent: Math.min(5, depth), published: true });
        }
      };
      walkMod(root, null, 0);
      if (loose.items.length) course.modules.unshift(loose);
    }
  }
  // module links to web addresses (Canvas writes them as weblink resources; module_meta gives the address too)
  for (const m of course.modules) for (const it of m.items) {
    if (it.header) continue;
    if (!it.ref || !course.items.has(it.ref)) {
      if (it.url) { const id = 'link:' + it.id; course.items.set(id, { id, kind: it.type === 'ContextExternalTool' ? 'tool' : 'link', title: it.title, url: it.url }); it.ref = id; }
    }
  }
  if (!course.title) course.title = fileName.replace(/\.(imscc|zip)$/i, '') || 'Course';
  finish(course);
  return course;
}

function readRubric(r) {
  const crit = r.all('criterion').map(c => ({
    description: textOf(c, 'description'), long: textOf(c, 'long_description'), points: parseFloat(textOf(c, 'points')) || 0,
    ratings: c.all('rating').map(x => ({ description: textOf(x, 'description'), long: textOf(x, 'long_description'), points: parseFloat(textOf(x, 'points')) || 0 })),
  }));
  return { title: textOf(r, 'title'), points: parseFloat(textOf(r, 'points_possible')) || crit.reduce((s, c) => s + c.points, 0), criteria: crit };
}

function quizItem(id, title, z, meta, kind = 'quiz', qtiPath = '') {
  const qs = questionsOf(z);
  return {
    id, kind, title: title || (kind === 'bank' ? 'Question bank' : 'Quiz'), quiz: z, qtiPath,
    html: meta ? meta.description : '', points: meta ? meta.points : null, timeLimit: meta ? meta.timeLimit : (z.meta.qmd_timelimit || ''),
    attempts: meta ? meta.attempts : (z.meta.cc_maxattempts || ''), quizType: meta ? meta.quizType : '', due: meta ? meta.due : '',
    published: meta ? meta.published : true, questionCount: qs.length,
  };
}

function readQuizMeta(x) {
  const asg = x.kid('assignment');
  return {
    title: textOf(x, 'title'), description: textOf(x, 'description'), points: parseFloat(textOf(x, 'points_possible')) || null,
    timeLimit: textOf(x, 'time_limit'), attempts: textOf(x, 'allowed_attempts'), quizType: textOf(x, 'quiz_type'),
    due: textOf(x, 'due_at') || (asg ? textOf(asg, 'due_at') : ''), published: textOf(x, 'available') !== 'false' && textOf(x, 'workflow_state') !== 'unpublished',
    shuffle: textOf(x, 'shuffle_answers') === 'true', assignmentGroup: asg ? textOf(asg, 'assignment_group_identifierref') : '',
  };
}

function readResource(r, { text, at, res, course, isCanvas }) {
  const p = r.href || r.files[0] || '';
  const t = r.type;
  // ---- quizzes
  if (isType(t, /^imsqti_xmlv1p2\/imscc_xmlv1p\d\/assessment$/) || t === 'imsqti_xmlv1p2' || isType(t, /^imsqti_xmlv1p2p1/)) {
    let meta = null, metaPath = '', full = '';
    for (const dep of r.deps.map(d => res.get(d)).filter(Boolean)) {
      for (const f of [dep.href, ...dep.files]) {
        if (/assessment_meta\.xml$/i.test(f)) metaPath = f;
        if (/non_cc_assessments\/.*\.xml\.qti$/i.test(f)) full = f;
      }
    }
    if (!metaPath) { const guess = at(`${r.id}/assessment_meta.xml`); if (text(guess) !== null) metaPath = guess; }
    if (!full) { const guess = at(`non_cc_assessments/${r.id}.xml.qti`); if (text(guess) !== null) full = guess; }
    if (metaPath && text(metaPath)) { try { meta = readQuizMeta(parseXml(text(metaPath))); } catch { meta = null; } }
    const qtiPath = full || p;
    const src = text(qtiPath);
    if (src === null) throw new Error('quiz file missing');
    const z = parseQti(src);
    return quizItem(r.id, (meta && meta.title) || z.title, z, meta, 'quiz', qtiPath);
  }
  if (isType(t, /question-bank$/)) {
    const src = text(p);
    if (src === null) return null;
    const z = parseQti(src);
    return quizItem(r.id, z.title || 'Question bank', z, null, 'bank', p);
  }
  // ---- discussions and announcements
  if (isType(t, /^imsdt_xmlv1p\d$/)) {
    const x = parseXml(text(p) || '');
    const atts = x.kid('attachments') ? x.kid('attachments').kids('attachment').map(a => a.attr('href') || '') : [];
    let announcement = false, graded = null;
    // Canvas keeps a second file with the type (topic or announcement), the meta resource depending on this one
    for (const m of res.values()) {
      if (!m.deps.includes(r.id) && !(r.deps || []).includes(m.id)) continue;
      const mp = m.href || m.files[0];
      if (!mp || !text(mp)) continue;
      try {
        const mx = parseXml(text(mp));
        if (mx.name === 'topicMeta') { announcement = textOf(mx, 'type') === 'announcement'; const a = mx.kid('assignment'); if (a) graded = { points: parseFloat(textOf(a, 'points_possible')) || null, due: textOf(a, 'due_at') }; }
      } catch { /* optional */ }
    }
    return { id: r.id, kind: announcement ? 'announcement' : 'discussion', title: textOf(x, 'title') || 'Discussion', html: textOf(x, 'text'), attachments: atts, graded };
  }
  // ---- web links and external tools
  if (isType(t, /^imswl_xmlv1p\d$/)) {
    const x = parseXml(text(p) || '');
    const u = x.kid('url');
    return { id: r.id, kind: 'link', title: textOf(x, 'title') || 'Link', url: u ? u.attr('href') || '' : '' };
  }
  if (isType(t, /^imsbasiclti_xmlv1p\d$/)) {
    const src = text(p);
    let title = 'External tool', url = '';
    if (src) { try { const x = parseXml(src); title = textOf(x, 'title') || title; url = textOf(x, 'launch_url') || textOf(x, 'secure_launch_url'); } catch { /* keep defaults */ } }
    return { id: r.id, kind: 'tool', title, url };
  }
  // ---- assignments: Common Cartridge 1.3 (assignment.xml) or Canvas's own (assignment_settings.xml next to an .html)
  if (t === 'assignment_xmlv1p0') {
    const x = parseXml(text(p) || '');
    const ext = x.find('assignment') && x.find('assignment') !== x ? x.find('assignment') : null;
    const a = ext ? readAssignmentSettings(ext, course) : {};
    const g = x.kid('gradable');
    return {
      id: r.id, kind: 'assignment', title: textOf(x, 'title') || a.title || 'Assignment', html: textOf(x, 'text'),
      points: a.points ?? (g ? parseFloat(g.attr('points_possible')) || null : null),
      submission: a.submission || (x.kid('submission_formats') ? x.kid('submission_formats').kids('format').map(f => f.attr('type')).join(', ') : ''),
      ...stripUndef(a, ['title', 'points', 'submission']),
    };
  }
  if (isType(t, /learning-application-resource$/)) {
    const settings = r.files.find(f => /assignment_settings\.xml$/i.test(f));
    if (settings && /\.html?$/i.test(p)) {
      const page = readHtmlPage(text(p) || '');
      let a = {};
      try { a = readAssignmentSettings(parseXml(text(settings) || ''), course); } catch { /* the description alone */ }
      return { id: r.id, kind: 'assignment', title: a.title || page.title.replace(/^Assignment:\s*/, '') || 'Assignment', html: page.body, ...a };
    }
    return null; // Canvas's own metadata files (quiz meta, topic meta, course settings)
  }
  // ---- pages
  if (t === T.WEB && /\.html?$/i.test(p) && (/(^|\/)wiki_content\//.test(p) || !/(^|\/)web_resources\//.test(p))) {
    const src = text(p);
    if (src === null) return null;
    const page = readHtmlPage(src);
    return { id: r.id, kind: 'page', title: page.title || baseOf(p).replace(/\.html?$/i, '').replace(/-/g, ' '), html: page.body, path: p, front: page.meta.front_page === 'true', published: page.meta.workflow_state !== 'unpublished', slug: baseOf(p).replace(/\.html?$/i, '') };
  }
  return null;
}

const stripUndef = (o, skip) => Object.fromEntries(Object.entries(o).filter(([k, v]) => v !== undefined && !skip.includes(k)));

function readAssignmentSettings(x, course) {
  const sub = textOf(x, 'submission_types');
  const rubricRef = textOf(x, 'rubric_identifierref');
  const groupRef = textOf(x, 'assignment_group_identifierref');
  return {
    title: textOf(x, 'title') || undefined,
    points: textOf(x, 'points_possible') ? parseFloat(textOf(x, 'points_possible')) : undefined,
    due: textOf(x, 'due_at') || undefined,
    unlock: textOf(x, 'unlock_at') || undefined,
    lock: textOf(x, 'lock_at') || undefined,
    grading: textOf(x, 'grading_type') || undefined,
    submission: sub ? sub.split(',').map(s => SUBMISSION[s.trim()] || s.trim().replace(/_/g, ' ')).join(', ') : undefined,
    published: textOf(x, 'workflow_state') ? textOf(x, 'workflow_state') !== 'unpublished' : undefined,
    group: groupRef && course.assignmentGroups.get(groupRef) ? course.assignmentGroups.get(groupRef).title : undefined,
    rubric: rubricRef && course.rubrics.get(rubricRef) ? course.rubrics.get(rubricRef) : undefined,
    quizRef: textOf(x, 'quiz_identifierref') || undefined,
  };
}
const SUBMISSION = {
  online_upload: 'File upload', online_text_entry: 'Text entry', online_url: 'Website URL', media_recording: 'Media recording',
  on_paper: 'On paper', none: 'No submission', external_tool: 'External tool', online_quiz: 'Quiz', discussion_topic: 'Discussion',
  not_graded: 'Not graded', wiki_page: 'Page', student_annotation: 'Student annotation',
};

const GROUPS = [
  ['page', 'Pages'], ['assignment', 'Assignments'], ['quiz', 'Quizzes'], ['discussion', 'Discussions'],
  ['announcement', 'Announcements'], ['bank', 'Question banks'], ['link', 'Links'], ['tool', 'External tools'],
];

function finish(course) {
  // Canvas writes a quiz's assignment twice (once inside the quiz); keep the quiz only
  for (const [id, it] of course.items) if (it.kind === 'assignment' && it.quizRef && course.items.has(it.quizRef)) course.items.delete(id);
  const inModule = new Set();
  for (const m of course.modules) for (const it of m.items) if (it.ref) inModule.add(it.ref);
  // everything, grouped by kind the way Canvas's own course menu lists it, including what no module holds
  const seen = new Set();
  for (const [kind, title] of GROUPS) {
    const list = [...course.items.values()].filter(i => i.kind === kind && !i.syllabus && !seen.has(i)).sort((a, b) => (b.front ? 1 : 0) - (a.front ? 1 : 0) || a.title.localeCompare(b.title, 'en', { numeric: true }));
    list.forEach(i => seen.add(i));
    if (list.length) course.groups.push({ kind, title, items: list, notInModules: list.filter(i => !inModule.has(i.id)).length });
  }
  const count = k => [...new Set(course.items.values())].filter(i => i.kind === k && !i.syllabus).length;
  let questions = 0;
  for (const i of new Set(course.items.values())) if (i.kind === 'quiz' || i.kind === 'bank') questions += i.questionCount || 0;
  course.stats = {
    modules: course.modules.length, pages: count('page'), assignments: count('assignment'), quizzes: count('quiz'), banks: count('bank'),
    discussions: count('discussion'), announcements: count('announcement'), links: count('link') + count('tool'), files: course.files.length,
    questions, filesBytes: course.files.reduce((s, f) => s + (f.size || 0), 0),
  };
}

/** The bytes of one file inside the export (unpacked on demand). */
export function fileBytes(course, path) {
  if (!course || !course.bytes) return null;
  let out = null;
  try { out = unzipSync(course.bytes, { filter: f => f.name === path })[path] || null; } catch { out = null; }
  return out;
}

/** Finds the file an address inside the course HTML points at ($IMS-CC-FILEBASE$/folder/name.pdf and similar). */
export function resolveFilePath(course, href, fromPath = '') {
  if (!href) return null;
  let h = String(href).replace(/[?#].*$/, '');
  const base = course.entries.length ? (course.files[0] ? course.files[0].path.slice(0, course.files[0].path.indexOf('web_resources/')) : '') : '';
  const m = /^\$IMS[-_]CC[-_]FILEBASE\$\/?(.*)$/.exec(h);
  let cand = [];
  if (m) cand.push(base + 'web_resources/' + decodePath(m[1]));
  else if (!/^[a-z][a-z0-9+.-]*:/i.test(h) && !h.startsWith('$')) {
    cand.push(join(dirOf(fromPath), decodePath(h)));
    cand.push(base + norm(decodePath(h)));
  }
  for (const c of cand) {
    const n = norm(c);
    if (course.items.has('file:' + n)) return n;
    // Canvas sometimes encodes spaces as + or keeps %20
    const alt = course.files.find(f => f.path.toLowerCase() === n.toLowerCase() || f.path === n.replace(/\+/g, ' '));
    if (alt) return alt.path;
  }
  return null;
}

/** Finds the course item a Canvas link points at ($WIKI_REFERENCE$/pages/slug, $CANVAS_OBJECT_REFERENCE$/quizzes/id ...). */
export function resolveItemRef(course, href) {
  const h = String(href || '');
  let m = /^\$WIKI_REFERENCE\$\/pages\/([^?#]+)/.exec(h);
  if (m) {
    const slug = decodePath(m[1]);
    for (const it of course.items.values()) if (it.kind === 'page' && it.slug === slug) return it.id;
    return null;
  }
  m = /^\$CANVAS_OBJECT_REFERENCE\$\/[a-z_]+\/([^?#/]+)/.exec(h);
  if (m && course.items.has(m[1])) return m[1];
  if (/^\$CANVAS_COURSE_REFERENCE\$\/(?:pages|wiki)\/([^?#/]+)/.test(h)) {
    const slug = decodePath(/\/(?:pages|wiki)\/([^?#/]+)/.exec(h)[1]);
    for (const it of course.items.values()) if (it.kind === 'page' && it.slug === slug) return it.id;
  }
  return null;
}

/** Plain list of what the export holds, for the summary line and the tests. */
export function summaryOf(course) {
  const s = course.stats;
  const parts = [];
  const add = (n, one, many) => { if (n) parts.push(`${n} ${n === 1 ? one : many}`); };
  add(s.modules, 'module', 'modules'); add(s.pages, 'page', 'pages'); add(s.assignments, 'assignment', 'assignments');
  add(s.quizzes, 'quiz', 'quizzes'); add(s.questions, 'question', 'questions'); add(s.discussions, 'discussion', 'discussions');
  add(s.announcements, 'announcement', 'announcements'); add(s.banks, 'question bank', 'question banks'); add(s.files, 'file', 'files');
  return parts;
}

export { El };
