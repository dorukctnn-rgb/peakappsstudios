// Reads the quiz files of a course export: QTI 1.2, the format Canvas writes for Classic Quizzes and question banks
// (non_cc_assessments/<id>.xml.qti, the full version with every question type) and the Common Cartridge version of the
// same quiz (<id>/assessment_qti.xml, which other systems also write). Each question comes back with its text, its
// choices and which of them are correct, worked out from the scoring rules in the file (resprocessing).
import { parseXml, El } from './xml.js';
import { esc } from './html.js';

export const TYPE_LABEL = {
  multiple_choice_question: 'Multiple choice',
  true_false_question: 'True or false',
  multiple_answers_question: 'Multiple answers',
  short_answer_question: 'Fill in the blank',
  fill_in_multiple_blanks_question: 'Fill in multiple blanks',
  multiple_dropdowns_question: 'Multiple dropdowns',
  matching_question: 'Matching',
  numerical_question: 'Numerical answer',
  calculated_question: 'Formula question',
  essay_question: 'Essay',
  file_upload_question: 'File upload',
  text_only_question: 'Text, no question',
  unknown: 'Question',
};
const CC_PROFILE = {
  'cc.multiple_choice.v0p1': 'multiple_choice_question',
  'cc.true_false.v0p1': 'true_false_question',
  'cc.multiple_response.v0p1': 'multiple_answers_question',
  'cc.fib.v0p1': 'short_answer_question',
  'cc.pattern_match.v0p1': 'short_answer_question',
  'cc.essay.v0p1': 'essay_question',
};

export function metaOf(el) {
  const m = {};
  if (!el) return m;
  for (const f of el.all('qtimetadatafield')) {
    const k = f.kid('fieldlabel'), v = f.kid('fieldentry');
    if (k) m[k.text.trim()] = v ? v.text.trim() : '';
  }
  return m;
}

/** The HTML of a <material> (or of every material directly inside an element). Plain text is escaped. */
export function materialHtml(el) {
  if (!el) return '';
  const mats = el.name === 'material' ? [el] : el.kids('material');
  let out = '';
  for (const m of mats) {
    for (const c of m.children) {
      if (!(c instanceof El)) continue;
      if (c.name === 'mattext' || c.name === 'mattextxhtml') {
        const t = c.text;
        const type = (c.attr('texttype') || '').toLowerCase();
        out += type.includes('html') ? t : esc(t).replace(/\n/g, '<br>');
      } else if (c.name === 'matbreak') out += '<br>';
      else if (c.name === 'matimage' && c.attr('uri')) out += `<img src="${esc(c.attr('uri'))}" alt="">`;
    }
  }
  return out.trim();
}

const num = v => { const n = parseFloat(v); return Number.isFinite(n) ? n : null; };
const plain = html => html.replace(/<[^>]*>/g, ' ').replace(/&nbsp;/g, ' ').replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"').replace(/&#39;/g, "'").replace(/\s+/g, ' ').trim();

// responses in document order, wherever they sit inside <presentation> (Canvas puts them directly inside it, other
// exporters inside <flow>)
function responsesOf(pres) {
  const out = [];
  const walk = (e) => {
    for (const c of e.children) {
      if (!(c instanceof El)) continue;
      if (c.name === 'response_lid' || c.name === 'response_str' || c.name === 'response_num' || c.name === 'response_grp') {
        const choices = c.all('response_label').map(l => ({ id: l.attr('ident') || '', html: materialHtml(l.find('material')) }));
        out.push({ ident: c.attr('ident') || '', kind: c.name, multiple: /multiple/i.test(c.attr('rcardinality') || ''), label: materialHtml(c.kid('material')), choices, fib: !!c.find('render_fib') });
      } else walk(c);
    }
  };
  if (pres) walk(pres);
  return out;
}

// The answers a scoring rule rewards. Only rules that give points count (setvar Set > 0 or Add > 0); inside them, every
// varequal that is not under <not> names a correct response, and vargte/varlte name a range.
function positives(item) {
  const correct = new Map(); // respident -> Set of values
  const numeric = [];        // { resp, exact, lo, hi }
  let other = false;
  const add = (resp, v) => { if (!correct.has(resp)) correct.set(resp, new Set()); correct.get(resp).add(v); };
  for (const rc of item.all('respcondition')) {
    const sets = rc.kids('setvar');
    const gives = sets.some(s => { const v = num(s.text); const a = (s.attr('action') || 'Set').toLowerCase(); return v !== null && v > 0 && (a === 'set' || a === 'add'); });
    if (!gives) continue;
    const cv = rc.kid('conditionvar');
    if (!cv) continue;
    if (cv.kid('other')) { other = true; continue; }
    const walk = (e, ctx) => {
      for (const c of e.children) {
        if (!(c instanceof El)) continue;
        if (c.name === 'not') continue;
        if (c.name === 'varequal') add(c.attr('respident') || '', c.text.trim());
        else if (c.name === 'and') {
          const lo = c.kid('vargte') || c.kid('vargt'), hi = c.kid('varlte') || c.kid('varlt');
          if (lo && hi && !c.kid('varequal')) numeric.push({ resp: lo.attr('respident') || '', lo: num(lo.text), hi: num(hi.text) });
          walk(c, 'and');
        } else if (c.name === 'or') {
          const eq = c.kid('varequal'), and = c.kid('and');
          if (eq && and) {
            const lo = and.kid('vargte') || and.kid('vargt'), hi = and.kid('varlte') || and.kid('varlt');
            numeric.push({ resp: eq.attr('respident') || '', exact: num(eq.text), lo: lo ? num(lo.text) : null, hi: hi ? num(hi.text) : null });
            add(eq.attr('respident') || '', eq.text.trim());
          } else walk(c, 'or');
        } else if ((c.name === 'vargte' || c.name === 'vargt') && ctx !== 'and') {
          const hi = e.kid('varlte') || e.kid('varlt');
          if (hi) numeric.push({ resp: c.attr('respident') || '', lo: num(c.text), hi: num(hi.text) });
        }
      }
    };
    walk(cv, '');
  }
  return { correct, numeric, other };
}

function feedbackOf(item) {
  const fb = {};
  for (const f of item.kids('itemfeedback')) {
    const id = f.attr('ident') || '';
    const html = materialHtml(f.find('material'));
    if (!html) continue;
    if (id === 'general_fb') fb.general = html;
    else if (id === 'correct_fb') fb.correct = html;
    else if (id === 'general_incorrect_fb') fb.incorrect = html;
    else if (id.endsWith('_fb')) (fb.answers || (fb.answers = {}))[id.slice(0, -3)] = html;
  }
  return fb;
}

function guessType(resps, item) {
  if (!resps.length) return 'text_only_question';
  const r = resps[0];
  if (resps.length > 1 && resps.every(x => x.kind === 'response_lid')) return 'matching_question';
  if (r.kind === 'response_str' || r.fib) return item.find('vargte') ? 'numerical_question' : 'short_answer_question';
  return r.multiple ? 'multiple_answers_question' : 'multiple_choice_question';
}

function fmtNum(n) { return n === null || n === undefined ? '' : String(Math.round(n * 1e6) / 1e6); }

/** One <item> as a question. */
export function parseItem(item, defaults = {}) {
  const meta = metaOf(item.at('itemmetadata', 'qtimetadata'));
  const pres = item.kid('presentation');
  const resps = responsesOf(pres);
  let type = meta.question_type || CC_PROFILE[meta.cc_profile] || guessType(resps, item);
  if (!TYPE_LABEL[type]) type = 'unknown';
  if (type === 'unknown' && resps.length) type = guessType(resps, item);
  const { correct, numeric, other } = positives(item);
  const isCorrect = (resp, id) => correct.has(resp) && correct.get(resp).has(id);
  const q = {
    id: item.attr('ident') || '',
    title: item.attr('title') || '',
    type,
    typeLabel: TYPE_LABEL[type],
    points: meta.points_possible !== undefined ? num(meta.points_possible) : (defaults.points ?? null),
    html: materialHtml(pres ? (pres.kid('material') ? pres : pres.find('flow') || pres) : null) || materialHtml(pres && pres.find('material')),
    choices: [], blanks: [], pairs: [], answers: [], numeric: [], formula: null,
    feedback: feedbackOf(item),
  };
  if (type === 'multiple_choice_question' || type === 'true_false_question' || type === 'multiple_answers_question' || (type === 'unknown' && resps[0] && resps[0].choices.length)) {
    const r = resps[0] || { ident: '', choices: [] };
    q.choices = r.choices.map(c => ({ id: c.id, html: c.html, correct: isCorrect(r.ident, c.id) }));
  } else if (type === 'short_answer_question') {
    const r = resps[0] || { ident: '' };
    q.answers = [...(correct.get(r.ident) || [])].filter(Boolean);
  } else if (type === 'fill_in_multiple_blanks_question' || type === 'multiple_dropdowns_question') {
    for (const r of resps) {
      const name = plain(r.label) || r.ident.replace(/^response_/, '');
      q.blanks.push({ name, choices: r.choices.map(c => ({ id: c.id, html: c.html, correct: isCorrect(r.ident, c.id) })) });
    }
  } else if (type === 'matching_question') {
    const used = new Set();
    for (const r of resps) {
      const right = r.choices.filter(c => isCorrect(r.ident, c.id));
      right.forEach(c => used.add(c.id));
      q.pairs.push({ left: r.label, right: right.map(c => c.html), options: r.choices.map(c => c.html) });
    }
    const all = resps[0] ? resps[0].choices : [];
    q.distractors = all.filter(c => !used.has(c.id)).map(c => c.html);
  } else if (type === 'numerical_question') {
    for (const n of numeric) {
      if (n.exact !== undefined && n.exact !== null) {
        const margin = n.lo !== null && n.hi !== null ? Math.round(((n.hi - n.lo) / 2) * 1e9) / 1e9 : 0;
        q.numeric.push({ exact: n.exact, margin, text: margin ? `${fmtNum(n.exact)} (give or take ${fmtNum(margin)})` : fmtNum(n.exact) });
      } else if (n.lo !== null && n.hi !== null) q.numeric.push({ lo: n.lo, hi: n.hi, text: `between ${fmtNum(n.lo)} and ${fmtNum(n.hi)}` });
    }
    if (!q.numeric.length) for (const v of [...(correct.values().next().value || [])]) q.numeric.push({ exact: num(v), margin: 0, text: v });
  } else if (type === 'calculated_question') {
    const calc = item.find('calculated');
    if (calc) {
      const vars = calc.all('var').filter(v => v.kid('min')).map(v => ({ name: v.attr('name') || '', min: num(v.kid('min').text), max: num(v.kid('max') ? v.kid('max').text : ''), scale: num(v.attr('scale')) }));
      const examples = calc.all('var_set').slice(0, 5).map(s => ({
        vars: s.kids('var').map(v => ({ name: v.attr('name') || '', value: v.text.trim() })),
        answer: s.kid('answer') ? s.kid('answer').text.trim() : '',
      }));
      q.formula = {
        formulas: calc.all('formula').map(f => f.text.trim()).filter(Boolean),
        tolerance: calc.kid('answer_tolerance') ? calc.kid('answer_tolerance').text.trim() : '',
        vars, examples,
      };
    }
    q.otherScored = other;
  }
  return q;
}

function parseSection(sec, defaults) {
  const sel = sec.at('selection_ordering', 'selection');
  const pick = sel && sel.kid('selection_number') ? num(sel.kid('selection_number').text) : null;
  const ext = sel && sel.kid('selection_extension');
  const pointsEach = ext && ext.kid('points_per_item') ? num(ext.kid('points_per_item').text) : null;
  const bankRef = sel && sel.kid('sourcebank_ref') ? sel.kid('sourcebank_ref').text.trim() : '';
  const entries = [];
  for (const c of sec.children) {
    if (!(c instanceof El)) continue;
    if (c.name === 'item') entries.push({ kind: 'question', q: parseItem(c, { points: pointsEach ?? defaults.points }) });
    else if (c.name === 'section') entries.push(parseSection(c, { points: pointsEach ?? defaults.points }));
  }
  return { kind: 'group', id: sec.attr('ident') || '', title: sec.attr('title') || '', pick, pointsEach, bankRef, entries };
}

export class QtiError extends Error { constructor(message) { super(message); this.code = 'bad-qti'; } }

/**
 * A whole QTI file: { kind: 'assessment'|'bank', id, title, meta, entries } where entries are
 * { kind: 'question', q } or { kind: 'group', title, pick, pointsEach, bankRef, entries }.
 */
export function parseQti(xml) {
  const root = typeof xml === 'string' ? parseXml(xml) : xml;
  if (root.name !== 'questestinterop') throw new QtiError('This is not a QTI quiz file.');
  const asm = root.kid('assessment');
  if (asm) {
    const meta = metaOf(asm.kid('qtimetadata'));
    const entries = [];
    for (const sec of asm.kids('section')) {
      const g = parseSection(sec, {});
      // the root section is only a wrapper: its contents are the quiz
      if (g.id === 'root_section' || (!g.title && !g.pick)) entries.push(...g.entries); else entries.push(g);
    }
    for (const it of asm.kids('item')) entries.push({ kind: 'question', q: parseItem(it) });
    return { kind: 'assessment', id: asm.attr('ident') || '', title: asm.attr('title') || '', meta, entries };
  }
  const bank = root.kid('objectbank');
  if (bank) {
    const meta = metaOf(bank.kid('qtimetadata'));
    const entries = [];
    for (const c of bank.children) {
      if (!(c instanceof El)) continue;
      if (c.name === 'item') entries.push({ kind: 'question', q: parseItem(c) });
      else if (c.name === 'section') entries.push(parseSection(c, {}));
    }
    return { kind: 'bank', id: bank.attr('ident') || '', title: meta.bank_title || '', meta, entries };
  }
  // a bare list of items (some exporters)
  const items = root.kids('item');
  if (items.length) return { kind: 'assessment', id: '', title: '', meta: {}, entries: items.map(it => ({ kind: 'question', q: parseItem(it) })) };
  throw new QtiError('This QTI file holds no quiz and no question bank.');
}

/** Every question of a quiz, groups opened up, in order. */
export function questionsOf(quiz) {
  const out = [];
  const walk = (entries) => { for (const e of entries) e.kind === 'question' ? out.push(e.q) : walk(e.entries); };
  walk(quiz ? quiz.entries : []);
  return out;
}

/** The correct answer of a question in plain words, for the answer key, the reader and the spreadsheet. */
export function answerText(q) {
  const t = h => plain(h);
  switch (q.type) {
    case 'multiple_choice_question': case 'true_false_question': case 'multiple_answers_question': case 'unknown':
      return q.choices.filter(c => c.correct).map(c => t(c.html)).join('; ');
    case 'short_answer_question': return q.answers.join('; ');
    case 'fill_in_multiple_blanks_question': case 'multiple_dropdowns_question':
      return q.blanks.map(b => `[${b.name}] ${b.choices.filter(c => c.correct).map(c => t(c.html)).join(' or ')}`).join('; ');
    case 'matching_question': return q.pairs.map(p => `${t(p.left)} = ${p.right.map(t).join(' or ')}`).join('; ');
    case 'numerical_question': return q.numeric.map(n => n.text).join('; ');
    case 'calculated_question': return q.formula && q.formula.formulas.length ? `Formula: ${q.formula.formulas.join('; ')}` : '';
    default: return '';
  }
}
