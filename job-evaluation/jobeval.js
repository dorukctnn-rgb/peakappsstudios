/* Job Evaluation engine: the point-factor scheme, scores, grades, categories of work of equal value, the bias checks,
 * the categories CSV, the payroll merge (adds each worker's category in the column the Pay Gap Report and the Pay
 * Transparency Kit read), save and load, and the synthetic sample company.
 *
 * Default factor plan: the four factors and fourteen subfactors of the EU-wide guidelines on gender-neutral job
 * evaluation and classification (European Commission and EIGE, 2026, Tool 5 and section 5.1), with their default
 * weights on a 1,200-point scale, linear points per level and the ten grouping ranges of the guidelines' workbook.
 * Level descriptors are shortened from that plan (CC BY 4.0). The guidelines say the weights are illustrative.
 * Checked against the official texts on 9 October 2026. Pure functions, no DOM: window.JobEval in the browser,
 * module.exports in Node (unit tests). Nothing here touches the network. */
(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory();
  else root.JobEval = factory();
})(typeof self !== 'undefined' ? self : this, function () {
  'use strict';

  const CHECKED = '9 October 2026';
  const TOTAL = 1200;
  const FREE_ROLES = 5;
  // The column the Pay Gap Report's and the Pay Transparency Kit's detectors rank highest for the category of workers.
  const CATEGORY_COLUMN = 'category_of_workers';
  // EU guidelines, Tool 5 workbook, tab 3: 60% or more women is women-dominated, 40% or less is men-dominated.
  const DOMINANCE = 0.6;
  // Bias check thresholds (stated on the page and in the record).
  const LIMITS = { groupHigh: 50, groupLow: 5, subHigh: 20, pairShare: 0.05, iloRatio: 0.8 };

  const GROUPS = [
    { id: 'skills', name: 'Skills', lower: 'skills' },
    { id: 'responsibility', name: 'Responsibility', lower: 'responsibility' },
    { id: 'effort', name: 'Effort', lower: 'effort' },
    { id: 'conditions', name: 'Working conditions', lower: 'working conditions' },
  ];
  const GROUP = Object.fromEntries(GROUPS.map(g => [g.id, g]));

  // ---------- The default factor plan ----------
  const PLAN = [
    { group: 'skills', id: 'knowledge', name: 'Knowledge', weight: 12,
      def: 'The experience, education, training and basic skills the job requires, however they were learned.',
      watch: 'Rate the knowledge the job needs, not the holder’s degree. Knowledge learned on the job, in care work or in several languages counts.',
      levels: [
        'Does not apply.',
        'Basic general knowledge to carry out simple tasks.',
        'Basic factual knowledge of a field of work: simple thinking and practical knowledge to complete tasks and solve routine problems with basic rules and tools.',
        'Knowledge of facts, principles and general ideas in a job area: choosing and using basic methods, tools, materials and information.',
        'Factual and theoretical knowledge in broad contexts within a field of work, to find solutions to specific problems.',
        'Specialised and theoretical knowledge within a field and an awareness of its limits, to develop creative solutions to abstract problems.',
        'Advanced knowledge with a deep understanding of theories and principles, to solve complex and unexpected problems in a specialised area.',
        'Very specialised knowledge including the newest ideas in the field, combining knowledge from different areas for research and innovation.',
        'Knowledge at the most advanced level of a field and where fields overlap, to solve critical research and innovation problems and change professional practice.',
      ] },
    { group: 'skills', id: 'communication', name: 'Interpersonal and communication skills', weight: 8,
      def: 'Dealing with people inside and outside the organisation: informing, instructing, listening, persuading, negotiating and supporting, face to face, in writing or by phone.',
      watch: 'Calming an upset customer, listening with empathy and reading non-verbal cues are learned skills. Talking with patients or clients counts as much as talking with senior managers.',
      levels: [
        'Not applicable.',
        'Basic: share simple information clearly, with courtesy and respect in simple interactions.',
        'Standard: communicate with colleagues or customers in structured settings, with tact, empathy and basic relationship building.',
        'Effective: adapt communication to different audiences and build trust, cooperation and good working relationships.',
        'Advanced: manage complex interactions, mediate conflicts between people and support group collaboration.',
        'Strong: lead communication strategies, influence decisions and build inclusive, high-trust environments.',
      ] },
    { group: 'skills', id: 'problem_solving', name: 'Problem-solving skills', weight: 8,
      def: 'The judgement needed to find options and choose the right action: how complex and unpredictable the problems are, and how far the holder must work out solutions alone.',
      watch: 'Judgement in sensitive, unpredictable situations, such as adapting care or teaching to one person’s needs, is problem-solving too.',
      levels: [
        'Not applicable: routine tasks with no need for independent judgement.',
        'Routine problems: minor problems that recur, with known solutions that are easy to follow.',
        'Standard problems: defined alternatives, some judgement, with help usually available.',
        'Variable problems: different kinds of problems that need careful thought, research into options or changes to existing ways of working, with limited guidance.',
        'Non-standard problems: complex problems with several factors, solved by careful analysis and adapting current methods.',
        'Complex problems: highly complex, unique problems with no predefined solution, needing innovative solutions and critical thinking.',
      ] },
    { group: 'skills', id: 'planning', name: 'Planning and organisational skills', weight: 6,
      def: 'Planning and organising work: time, resources, priorities and several tasks or projects at once, from daily scheduling to long-term plans.',
      watch: 'Coordinating calendars, rotas and logistics for other people is planning, with or without a management title.',
      levels: [
        'Not applicable.',
        'Limited: tasks are set by others or predefined, with little need to adjust them.',
        'Basic: plan and organise one’s own work within set deadlines, with some say in scheduling and priorities.',
        'Moderate: organise and prioritise several tasks, adjusting plans as circumstances or deadlines change.',
        'Advanced: plan and manage complex, overlapping tasks or schedules, with joint planning across teams or departments.',
        'High-level: long-term strategic plans that handle uncertainty and set the organisation’s direction.',
      ] },
    { group: 'skills', id: 'physical_skills', name: 'Physical skills', weight: 6,
      def: 'Manual dexterity, coordination and sensory skills, and the precision and speed they need, for example on a keyboard, behind the wheel or with fine tools.',
      watch: 'Fine motor skills such as giving injections, fast accurate typing or assembling small parts are skills. The strain of doing them all day belongs under physical effort.',
      levels: [
        'Not applicable: no particular physical skill beyond everyday activity.',
        'Minimal: handling light objects or using simple tools.',
        'Basic: some dexterity beyond everyday needs; handling is needed but precision is not.',
        'Moderate: careful handling of fine tools, materials or people, with dexterity, hand-eye coordination and precision or speed.',
        'High: advanced physical skills or techniques in demanding conditions, with detailed hand-eye and sensory coordination or speed.',
        'Expert: expert coordination, precision, endurance or speed, often in specialised conditions; precise hand or finger dexterity is central to the job.',
      ] },
    { group: 'responsibility', id: 'people', name: 'People', weight: 12,
      def: 'Responsibility for other people: managing, guiding, training and evaluating staff, and the care, safety and well-being of patients, children, clients or colleagues.',
      watch: 'Responsibility for the health, safety and well-being of patients, children or clients counts as fully as managing staff.',
      levels: [
        'Does not apply.',
        'Very limited: no supervision or caregiving; may give basic guidance or help new colleagues settle in.',
        'Basic: support, guidance or advice to individuals or small teams, informal mentoring, some part in others’ safety and comfort with limited authority.',
        'Moderate: overseeing or coordinating the work and well-being of others: supervising, regular support, handling conflicts, responding to individual needs.',
        'High: significant responsibility for others’ well-being and development: managing teams, providing care, teaching, hiring, evaluating and coaching.',
        'Full: complete accountability for the well-being and development of others, including patients or children, or for leading a workforce, including pay and staffing decisions.',
      ] },
    { group: 'responsibility', id: 'goods_equipment', name: 'Goods and equipment', weight: 7,
      def: 'Responsibility for material resources: tools, supplies, stock, vehicles, machinery and buildings, from daily care and safe use to buying, upkeep and disposal.',
      watch: 'Specialised equipment in care, education or hospitality and the upkeep of shared supplies count, not only high-value machinery.',
      levels: [
        'Not applicable.',
        'Limited: care and proper use of low-value tools or materials.',
        'Some: use and maintenance of equipment or stock, making sure resources are used properly and safely.',
        'Moderate: regular use and maintenance of more valuable equipment or materials; may manage resources.',
        'Considerable: oversee valuable resources so they are secure, maintained and working, and decide what to order.',
        'Full: the whole life cycle of goods or equipment, including buying, upkeep, security and disposal, and long-term resource planning.',
      ] },
    { group: 'responsibility', id: 'information', name: 'Information', weight: 8,
      def: 'Responsibility for collecting, keeping, interpreting and protecting information, on paper or in systems. Financial information belongs under financial resources.',
      watch: 'Case files, patient records and student records count as much as databases.',
      levels: [
        'Not applicable.',
        'Very limited: uses basic information, with little or no responsibility for sourcing or protecting it.',
        'Limited: gathers, processes or shares information in a controlled way, following procedures.',
        'Moderate: keeps information accurate, of good quality and secure; may decide how sensitive data is handled.',
        'Considerable: manages large amounts of valuable or sensitive information, deciding what is needed, how it is used and how it is protected.',
        'Full: major responsibility for sourcing, analysing and deciding on the use of information and its compliance across the organisation.',
      ] },
    { group: 'responsibility', id: 'financial', name: 'Financial resources', weight: 8,
      def: 'Accountability for money: handling cash and payments, budgets, spending, financial records and reporting, fundraising and financial planning.',
      watch: 'Preparing budgets, fundraising, grant applications and sales targets count even without final sign-off.',
      levels: [
        'Not applicable.',
        'Very limited: small amounts of cash or simple transactions, basic records.',
        'Limited: small budgets or invoices, taking part in financial planning discussions.',
        'Moderate: significant resources: managing budgets, overseeing spending and being accountable for it.',
        'Considerable: large budgets or portfolios, allocation decisions, the financial integrity of a department.',
        'Full: financial planning and oversight for the whole organisation: budgets, financial policy and strategic financial decisions.',
      ] },
    { group: 'effort', id: 'mental_effort', name: 'Mental effort', weight: 5,
      def: 'How long and how intensely the job requires concentration, attention and alertness: thinking, watching, listening, interpreting.',
      watch: 'Constant vigilance, as when looking after children, and juggling several priorities at once take mental effort.',
      levels: [
        'Not applicable.',
        'Limited: basic attention and simple instructions, with few competing demands.',
        'Moderate: focus on straightforward analysis or repetitive tasks that need attention to detail.',
        'High: frequent concentration on complex tasks, such as interpreting complex data.',
        'Very high: continuous high-level concentration with few or no breaks.',
        'Intense: sustained, intense effort over long periods on complex or new problems.',
      ] },
    { group: 'effort', id: 'emotional_effort', name: 'Psychosocial and emotional effort', weight: 6,
      def: 'The emotional energy the job demands: staying composed under pressure, supporting people in distress, handling conflict and difficult behaviour.',
      watch: 'This is emotional effort, separate from communication skill. Care, health, social and customer-facing work often carry a lot of it.',
      levels: [
        'Not applicable.',
        'Minimal: little need to manage emotional responses; minimal exposure to emotionally demanding situations.',
        'Occasional: minor conflicts or upset people from time to time.',
        'Moderate: regular management of emotional responses with sensitive or challenging people or situations.',
        'High: frequent emotionally charged situations that need significant resilience.',
        'Extreme: constant exposure to highly emotional or stressful circumstances with vulnerable or distressed people.',
      ] },
    { group: 'effort', id: 'physical_effort', name: 'Physical effort', weight: 4,
      def: 'How long and how intensely the job strains the body: lifting, carrying, standing, walking, repetitive movements, awkward positions.',
      watch: 'Lifting patients or children, standing for a whole shift and repetitive work at a till count. Heat, noise and travel belong under working conditions.',
      levels: [
        'Not applicable.',
        'Minimal: light tasks, occasional lifting or moving of light objects.',
        'Low: standing for long periods, occasional lifting, or repetitive movements.',
        'Moderate: regular lifting of moderate weights, manual handling, long standing or walking, repetitive hand or arm movements.',
        'High: frequent heavy lifting, physically demanding repetitive tasks or long spells in physically tough conditions.',
        'Extreme: continuous heavy physical effort with little rest or variation, often in challenging conditions.',
      ] },
    { group: 'conditions', id: 'environment', name: 'Environment (physical, psychological or emotional)', weight: 7,
      def: 'Hazards and strain in the setting of the work: chemicals, machinery, noise, heat, infection, and psychosocial risks such as isolation, aggression, harassment and stress.',
      watch: 'Verbal aggression, working alone, infection risk and cleaning chemicals count, not only machinery and outdoor work.',
      levels: [
        'Not applicable: no unpleasant, dangerous or challenging conditions.',
        'Minimal: little exposure to hazards; minor dust, dirt, noise or poor lighting.',
        'Occasional: mild physical or psychosocial risks a few times a year, such as light machinery or an occasional conflict.',
        'Regular: regular physical hazards or moderate psychological risks, such as isolation or occasional threats of violence, about monthly.',
        'Frequent: frequent physical risks and significant psychosocial risks, such as threats of violence, harassment or prolonged high pressure.',
        'Constant: continuous severe physical hazards and high psychosocial risks, such as constant harassment or crisis work.',
      ] },
    { group: 'conditions', id: 'organisational', name: 'Organisational environment', weight: 3,
      def: 'The demands of the working pattern: night and shift work, irregular hours, weekends and holidays, being reachable after hours, and travel between sites or to clients.',
      watch: 'Split shifts, weekend rotas and travel between clients’ homes count as much as business travel.',
      levels: [
        'Not applicable.',
        'Minimal: standard hours, little travel or contact after hours.',
        'Occasional: occasional weekends or holidays, minimal travel, limited contact after hours.',
        'Regular: regular shifts, nights or irregular hours; moderate travel or frequent contact after hours.',
        'Frequent: frequent night shifts and irregular hours, long periods on call, regular travel between sites.',
        'Constant: constant irregular hours, frequent nights, extensive travel and being reachable at all times, including weekends and holidays.',
      ] },
  ];

  // Bias reminders for a factor group, from the guidelines' list of demands often overlooked in jobs mostly done by women.
  const GROUP_ADVICE = {
    skills: 'Check whether skills in the women-dominated role, such as communication, organising and dexterity, were treated as personal traits or common sense.',
    responsibility: 'Check whether responsibility for people’s care and well-being, for information and for supplies counted as fully as responsibility for staff, money and machinery.',
    effort: 'Check whether emotional effort, mental effort and repetitive or sustained physical effort were assessed as fully as heavy physical effort.',
    conditions: 'Check whether verbal aggression, isolation, infection risk and irregular hours were counted, not only physical hazards.',
  };
  // Subfactors that Article 4(4) and the guidelines single out as often undervalued in work mostly done by women.
  const SOFT = new Set(['communication', 'emotional_effort', 'people', 'planning', 'physical_skills']);

  // ---------- Small helpers ----------
  const clean = x => Math.round(x * 1e6) / 1e6;
  const norm = s => String(s == null ? '' : s).toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/\(.*?\)/g, '').replace(/[^a-z0-9]/g, '');
  const key = s => String(s == null ? '' : s).normalize('NFC').trim().replace(/\s+/g, ' ').toLowerCase();
  const sum = xs => xs.reduce((a, b) => a + b, 0);
  const mean = xs => (xs.length ? sum(xs) / xs.length : null);
  // Points as the page and the record show them: at most one decimal place, no trailing zero.
  const pts = x => (x == null || !Number.isFinite(x) ? '' : String(Math.round(x * 10) / 10));
  const pct = x => `${Math.round(x)}%`;
  function intOrNull(v) {
    if (v == null) return { v: null };
    if (typeof v === 'number') return Number.isInteger(v) && v >= 0 ? { v } : { v: null, bad: true };
    let s = String(v).trim();
    if (!s) return { v: null };
    if (/^\d{1,3}([.,' ]\d{3})+$/.test(s)) s = s.replace(/[.,' ]/g, '');
    const n = Number(s);
    return Number.isInteger(n) && n >= 0 ? { v: n } : { v: null, bad: true };
  }

  // ---------- Scheme ----------
  function equalBands(total, n) {
    const out = [];
    for (let k = 0; k < n; k++) out.push({ name: `Grade ${k + 1}`, from: k === 0 ? 0 : Math.floor(total * k / n) + 1 });
    return out;
  }
  function defaultScheme() {
    return { total: TOTAL, subs: PLAN.map(s => Object.assign({}, s, { levels: s.levels.slice(), custom: false })), bands: equalBands(TOTAL, 10) };
  }
  const maxLevel = s => s.levels.length - 1;
  const subPoints = (s, total) => clean(total * (Number(s.weight) || 0) / 100);
  const levelPoints = (s, level, total) => clean(total * (Number(s.weight) || 0) / 100 * level / maxLevel(s));
  function groupWeights(scheme) {
    const w = Object.fromEntries(GROUPS.map(g => [g.id, 0]));
    for (const s of scheme.subs) w[s.group] = clean(w[s.group] + (Number(s.weight) || 0));
    return w;
  }
  function weightTotal(scheme) { return clean(sum(scheme.subs.map(s => Number(s.weight) || 0))); }

  // Problems that stop the scheme from producing grades.
  function validateScheme(scheme) {
    const out = [];
    const total = weightTotal(scheme);
    if (Math.abs(total - 100) > 1e-6) out.push({ id: 'weights', text: `The weights add up to ${pts(total)}%. They must add up to 100%, so that a role can score at most ${scheme.total} points.` });
    const names = new Map();
    for (const s of scheme.subs) {
      if (!String(s.name || '').trim()) out.push({ id: 'subname', text: 'Every subfactor needs a name.' });
      const k = key(s.name);
      if (k && names.has(k)) out.push({ id: 'subdup', text: `Two subfactors are called “${s.name}”. Give each a distinct name.` });
      names.set(k, true);
      if (!(Number(s.weight) >= 0)) out.push({ id: 'subweight', text: `The weight of ${s.name} must be zero or more.` });
      if (!(s.levels.length >= 2 && s.levels.length <= 9)) out.push({ id: 'sublevels', text: `${s.name} needs between 1 and 8 levels above level 0.` });
    }
    const b = scheme.bands;
    if (!b.length) out.push({ id: 'bands', text: 'Add at least one grade.' });
    else {
      if (b[0].from !== 0) out.push({ id: 'bandstart', text: 'The first grade must start at 0 points.' });
      for (let i = 1; i < b.length; i++) {
        if (!(Number.isInteger(b[i].from) && b[i].from > b[i - 1].from)) out.push({ id: 'bandorder', text: `${b[i].name} must start above ${b[i - 1].name}, at a whole number of points.` });
        else if (b[i].from > scheme.total) out.push({ id: 'bandtop', text: `${b[i].name} starts above the ${scheme.total}-point maximum.` });
      }
      const bn = new Map();
      for (const x of b) {
        const k = key(x.name);
        if (!k) out.push({ id: 'bandname', text: 'Every grade needs a name.' });
        else if (bn.has(k)) out.push({ id: 'banddup', text: `Two grades are called “${x.name}”. The name is the category of workers, so each must be distinct.` });
        bn.set(k, true);
      }
    }
    return out;
  }

  // ---------- Roles and scores ----------
  let seq = 0;
  function newRole(name) {
    seq++;
    return { id: `r${Date.now().toString(36)}${seq}`, name: name || '', department: '', women: null, men: null, aliases: [], levels: {}, notes: {} };
  }
  function score(role, scheme) {
    const groups = Object.fromEntries(GROUPS.map(g => [g.id, 0]));
    let total = 0, scored = 0, needed = 0;
    const missing = [];
    for (const s of scheme.subs) {
      if (!(Number(s.weight) > 0)) continue;
      needed++;
      const l = role.levels[s.id];
      if (l == null) { missing.push(s.id); continue; }
      scored++;
      const p = levelPoints(s, l, scheme.total);
      groups[s.group] = clean(groups[s.group] + p);
      total = clean(total + p);
    }
    return { groups, total, scored, needed, complete: needed > 0 && scored === needed, missing };
  }
  // The grade is the last one whose lower limit the score has reached, as in the guidelines' workbook (120.6 is grade 1).
  function bandIndex(total, bands) {
    let idx = 0;
    for (let i = 0; i < bands.length; i++) if (total + 1e-9 >= bands[i].from) idx = i;
    return idx;
  }
  function bandRange(scheme, i) {
    const b = scheme.bands;
    return { from: b[i].from, to: i + 1 < b.length ? b[i + 1].from - 1 : scheme.total };
  }
  function dominance(role) {
    const w = role.women, m = role.men;
    if (!(Number.isInteger(w) && Number.isInteger(m)) || w + m <= 0) return null;
    const share = w / (w + m);
    const r = Math.round(share * 1e9);
    return { share, women: w, men: m, kind: r >= DOMINANCE * 1e9 ? 'F' : r <= (1 - DOMINANCE) * 1e9 ? 'M' : 'B' };
  }
  function evaluate(ev) {
    const sc = ev.scheme;
    const problems = validateScheme(sc);
    const valid = !problems.length;
    const seen = new Map();
    for (const r of ev.roles) {
      const k = key(r.name);
      if (!k) { problems.push({ id: 'rolename', soft: true, text: 'A role has no name. Name it so it can be found in the payroll merge.' }); continue; }
      if (seen.has(k)) problems.push({ id: 'roledup', soft: true, text: `Two roles are called “${r.name}”. The payroll merge matches workers by role name, so make each name distinct.` });
      seen.set(k, true);
    }
    const rows = ev.roles.map((role, index) => {
      const s = score(role, sc);
      const band = valid && s.complete ? bandIndex(s.total, sc.bands) : null;
      return Object.assign({ role, index, band, category: band == null ? '' : sc.bands[band].name, dom: dominance(role) }, s);
    });
    const categories = [];
    if (valid) sc.bands.forEach((b, i) => {
      const roles = rows.filter(r => r.band === i);
      if (!roles.length) return;
      const counted = roles.filter(r => r.dom);
      categories.push(Object.assign({ index: i, name: b.name, roles, women: sum(counted.map(r => r.dom.women)), men: sum(counted.map(r => r.dom.men)), headcountRoles: counted.length }, bandRange(sc, i)));
    });
    return { rows, categories, problems, valid, complete: rows.filter(r => r.complete), incomplete: rows.filter(r => !r.complete) };
  }

  // ---------- Bias checks ----------
  function checks(ev, res) {
    const sc = ev.scheme, out = [];
    const gw = groupWeights(sc);
    // 1. Weighting
    const wItems = [];
    for (const g of GROUPS) {
      if (gw[g.id] > LIMITS.groupHigh) wItems.push(`${g.name} carries ${pts(gw[g.id])}% of all points, more than half, so it decides most of the ranking on its own.`);
      if (gw[g.id] < LIMITS.groupLow) wItems.push(gw[g.id] > 0
        ? `${g.name} carries only ${pts(gw[g.id])}% of the points. Article 4(4) of the directive names skills, effort, responsibility and working conditions; at this weight one of them barely counts.`
        : `${g.name} carries no weight at all. Article 4(4) of the directive requires the criteria to include skills, effort, responsibility and working conditions.`);
    }
    for (const s of sc.subs) {
      const w = Number(s.weight) || 0;
      if (w > LIMITS.subHigh) wItems.push(`${s.name} carries ${pts(w)}% on its own, more than a fifth of all points.`);
      if (!(w > 0) && !s.custom) wItems.push(SOFT.has(s.id)
        ? `${s.name} has no weight. The guidelines list it among the demands most often overlooked in work mostly done by women, and Article 4(4) says relevant soft skills must not be undervalued.`
        : `${s.name} has no weight, so the roles’ levels on it do not count.`);
    }
    const spread = GROUPS.map(g => `${g.lower} ${pts(gw[g.id])}%`).join(', ');
    out.push(wItems.length
      ? { id: 'weights', state: 'check', title: `Weighting: ${wItems.length} point${wItems.length > 1 ? 's' : ''} to review`, text: `Current weights: ${spread}. A strong, documented, gender-neutral reason is needed for any weighting, and more so for one that leans on a single factor (EU guidelines, Tool 5, step 3).`, items: wItems }
      : { id: 'weights', state: 'ok', title: 'Weighting is spread across the four factor groups', text: `Current weights: ${spread}. No group carries more than half of the points or less than 5%, no subfactor more than a fifth, and every default subfactor counts.` });

    // 2. Spread
    const done = res.rows.filter(r => r.complete);
    if (done.length < 3) out.push({ id: 'spread', state: 'info', title: 'Spread: score at least three roles', text: 'With three or more fully scored roles, this check lists any subfactor on which every role has the same level.' });
    else {
      const flat = sc.subs.filter(s => Number(s.weight) > 0 && new Set(done.map(r => r.role.levels[s.id])).size === 1);
      out.push(flat.length
        ? { id: 'spread', state: 'check', title: `${flat.length} subfactor${flat.length > 1 ? 's give' : ' gives'} every role the same level`, text: 'A subfactor that gives every role the same level adds the same points to all of them and does not affect the ranking. Check that the differences between roles were really assessed, or record why the demand is the same everywhere.', items: flat.map(s => `${s.name}: level ${done[0].role.levels[s.id]} for all ${done.length} roles.`) }
        : { id: 'spread', state: 'ok', title: 'Every subfactor separates at least two roles', text: `Each weighted subfactor gives different levels to at least two of the ${done.length} scored roles.` });
    }

    // 3 and 4 need the number of women and men in each role.
    const fem = done.filter(r => r.dom && r.dom.kind === 'F'), mal = done.filter(r => r.dom && r.dom.kind === 'M');
    const needCounts = !done.some(r => r.dom);
    if (needCounts || !fem.length || !mal.length) {
      const why = needCounts ? 'Add the number of women and men in each role to run these checks.' : `They compare women-dominated roles (60% or more women) with men-dominated roles (60% or more men); this evaluation has ${fem.length} of the first and ${mal.length} of the second among the scored roles.`;
      out.push({ id: 'pairs', state: 'info', title: 'Women-dominated and men-dominated roles: not compared yet', text: why });
      out.push({ id: 'ilo', state: 'info', title: 'Weights of subfactors by gender: not compared yet', text: why });
      return out;
    }
    // 3. Pairs: a women-dominated role a grade below a men-dominated role that it matches, factor group by factor group,
    // on the other three groups (each within 5% of that group’s points), so one group makes the difference.
    const gmax = Object.fromEntries(GROUPS.map(g => [g.id, sc.total * gw[g.id] / 100]));
    const near = (f, m, h) => Math.abs(f.groups[h] - m.groups[h]) <= gmax[h] * LIMITS.pairShare + 1e-9;
    const flags = [];
    for (const f of fem) for (const m of mal) {
      if (!(f.band < m.band)) continue;
      let g = null, best = 0;
      for (const G of GROUPS) {
        const d = m.groups[G.id] - f.groups[G.id];
        if (d > best + 1e-9 && GROUPS.every(H => H.id === G.id || near(f, m, H.id))) { best = d; g = G; }
      }
      if (!g) continue;
      const subs = sc.subs.filter(s => s.group === g.id && Number(s.weight) > 0)
        .map(s => ({ s, lf: f.role.levels[s.id], lm: m.role.levels[s.id], d: levelPoints(s, m.role.levels[s.id], sc.total) - levelPoints(s, f.role.levels[s.id], sc.total) }))
        .filter(x => x.d > 1e-9).sort((a, b) => b.d - a.d);
      const others = GROUPS.filter(H => H.id !== g.id).map(H => `${H.lower} ${pts(f.groups[H.id])} against ${pts(m.groups[H.id])}`).join(', ');
      flags.push({ f, m, group: g, deficit: clean(best), others, subs });
    }
    flags.sort((a, b) => b.deficit - a.deficit);
    const nm = r => r.role.name || 'Unnamed role';
    const close = 'within 5% of that group’s points';
    out.push(flags.length
      ? { id: 'pairs', state: 'check', title: `${flags.length} women-dominated role${flags.length > 1 ? 's sit' : ' sits'} a grade below a comparable men-dominated role`, text: `In each pair the two roles score close on three factor groups (each ${close}), and the fourth puts the women-dominated role in a lower grade. That is a prompt to re-read the scores on that factor, not proof of bias: change them, or record why the difference is justified.`,
        items: flags.map(x => `${nm(x.f)} (${pct(x.f.dom.share * 100)} women, ${x.f.category}) and ${nm(x.m)} (${pct((1 - x.m.dom.share) * 100)} men, ${x.m.category}) score close on ${x.others}, and ${pts(x.deficit)} points apart on ${x.group.lower}. ${x.subs.length ? `Largest differences: ${x.subs.slice(0, 2).map(y => `${y.s.name.toLowerCase()}, level ${y.lf} against ${y.lm}`).join('; ')}. ` : ''}${GROUP_ADVICE[x.group.id]}`), pairs: flags }
      : { id: 'pairs', state: 'ok', title: 'No women-dominated role sits a grade below a comparable men-dominated role', text: `Compared ${fem.length} women-dominated with ${mal.length} men-dominated roles: no pair scores close on three factor groups (each ${close}) and is split into different grades by the fourth.` });

    // 4. The ILO guide's weighting test: do subfactors where women-dominated roles score higher weigh less?
    const female = [], male = [];
    for (const s of sc.subs) {
      if (!(Number(s.weight) > 0)) continue;
      const af = mean(fem.map(r => r.role.levels[s.id] / maxLevel(s))), am = mean(mal.map(r => r.role.levels[s.id] / maxLevel(s)));
      if (af > am + 1e-9) female.push(s); else if (am > af + 1e-9) male.push(s);
    }
    if (!female.length || !male.length) out.push({ id: 'ilo', state: 'ok', title: 'Weights of subfactors by gender: no split to compare', text: 'Women-dominated and men-dominated roles do not score higher on different subfactors, so the weighting cannot favour one group of them.' });
    else {
      const wf = mean(female.map(s => Number(s.weight))), wm = mean(male.map(s => Number(s.weight)));
      const low = wf < LIMITS.iloRatio * wm - 1e-9;
      const list = xs => xs.map(s => s.name.toLowerCase()).join(', ');
      out.push({ id: 'ilo', state: low ? 'check' : 'ok',
        title: low ? 'Subfactors where women-dominated roles score higher weigh less' : 'Subfactors weigh about the same whichever group scores higher on them',
        text: `Women-dominated roles score higher on average on ${female.length} subfactor${female.length > 1 ? 's' : ''} (${list(female)}), which weigh ${pts(wf)}% each on average. Men-dominated roles score higher on ${male.length} (${list(male)}), which weigh ${pts(wm)}% each on average. ${low ? 'The ILO guide uses this comparison to show when a weighting may favour work mostly done by men. It is not proof of bias: re-examine the weights against what the organisation needs and record the reason.' : 'The ILO guide uses this comparison to test a weighting; a gap of a fifth or more would be flagged here.'}`,
        female: female.map(s => s.id), male: male.map(s => s.id), wf, wm });
    }
    return out;
  }

  // ---------- CSV ----------
  // Cells as the Pay Gap Report writes them: quoted when they hold the delimiter, a quote, a line break, or start like a formula.
  const cell = (v, d) => { const s = v == null ? '' : String(v); return s.includes(d || ',') || /["\r\n]/.test(s) || (/^[=+\-@]/.test(s) && !/^-?\d/.test(s)) ? '"' + s.replace(/"/g, '""') + '"' : s; };
  const csvText = (rows, d) => String.fromCharCode(0xFEFF) + rows.map(r => r.map(c => cell(c, d)).join(d || ',')).join('\r\n') + '\r\n';
  const CATEGORY_COLUMNS = ['role', 'department', CATEGORY_COLUMN, 'points', 'points_from', 'points_to', 'women', 'men'];
  function categoriesCSV(ev, res) {
    const rows = res.rows.filter(r => r.complete && r.band != null).slice().sort((a, b) => b.total - a.total || a.index - b.index);
    const out = [CATEGORY_COLUMNS];
    for (const r of rows) {
      const g = bandRange(ev.scheme, r.band);
      out.push([r.role.name, r.role.department || '', r.category, pts(r.total), g.from, g.to, r.role.women == null ? '' : r.role.women, r.role.men == null ? '' : r.role.men]);
    }
    return csvText(out);
  }

  // ---------- Importing roles from a table (read by the Pay Gap Report's reader) ----------
  const ROLE_SYN = {
    role: ['role', 'rolename', 'jobrole', 'jobtitle', 'job', 'title', 'position', 'positiontitle', 'jobname', 'functie', 'functienaam', 'functietitel', 'stelle', 'stellenbezeichnung', 'funktion', 'taetigkeit', 'tatigkeit'],
    department: ['department', 'dept', 'team', 'unit', 'division', 'area', 'afdeling', 'abteilung', 'bereich'],
    women: ['women', 'female', 'females', 'woman', 'numberofwomen', 'headcountwomen', 'womenheadcount', 'frauen', 'weiblich', 'vrouwen'],
    men: ['men', 'male', 'males', 'man', 'numberofmen', 'headcountmen', 'menheadcount', 'manner', 'maenner', 'mannlich', 'maennlich', 'mannen'],
  };
  function detectColumns(headers, scheme) {
    const H = headers.map(norm);
    const map = {};
    for (const k of Object.keys(ROLE_SYN)) {
      let best = -1, bestScore = 0;
      H.forEach((h, i) => { const at = ROLE_SYN[k].indexOf(h); if (at > -1 && 100 - at > bestScore) { best = i; bestScore = 100 - at; } });
      map[k] = best;
    }
    map.levels = {}; map.notes = {};
    for (const s of scheme.subs) {
      const names = [norm(s.id), norm(s.name)];
      map.levels[s.id] = H.findIndex(h => names.includes(h));
      map.notes[s.id] = H.findIndex(h => names.some(n => h === n + 'reason' || h === n + 'rationale' || h === n + 'notes'));
    }
    return map;
  }
  function importRoles(table, scheme) {
    const map = detectColumns(table.headers, scheme);
    const roles = [], skipped = [], problems = [];
    if (map.role < 0) return { roles, skipped, problems: [{ text: 'No column with the role or job title was found. Name it “role”, as in the template.' }], map };
    for (const { n, cells } of table.body) {
      const name = cells[map.role] == null ? '' : String(cells[map.role]).trim();
      if (!name) { skipped.push({ row: n, why: 'no role name' }); continue; }
      if (/^example\b/i.test(name)) { skipped.push({ row: n, why: 'example row from the template' }); continue; }
      const r = newRole(name);
      if (map.department > -1 && cells[map.department] != null) r.department = String(cells[map.department]).trim();
      for (const k of ['women', 'men']) {
        if (map[k] < 0) continue;
        const v = intOrNull(cells[map[k]]);
        if (v.bad) problems.push({ text: `Row ${n}, ${name}: the number of ${k} “${cells[map[k]]}” is not a whole number and was left blank.` });
        r[k] = v.v;
      }
      for (const s of scheme.subs) {
        const i = map.levels[s.id];
        if (i > -1 && cells[i] != null && String(cells[i]).trim() !== '') {
          const v = intOrNull(cells[i]);
          if (v.bad || v.v > maxLevel(s)) problems.push({ text: `Row ${n}, ${name}: ${s.name} “${cells[i]}” is not a level from 0 to ${maxLevel(s)} and was left unscored.` });
          else r.levels[s.id] = v.v;
        }
        const j = map.notes[s.id];
        if (j > -1 && cells[j] != null && String(cells[j]).trim()) r.notes[s.id] = String(cells[j]).trim();
      }
      roles.push(r);
    }
    return { roles, skipped, problems, map };
  }
  // The CSV template: the columns the importer reads, with two example rows it skips.
  function templateRows(scheme) {
    const subs = (scheme || defaultScheme()).subs;
    const head = ['role', 'department', 'women', 'men'].concat(subs.map(s => s.id));
    const ex1 = { communication: 4, emotional_effort: 4, knowledge: 3, problem_solving: 3, planning: 2, physical_skills: 2, people: 1, goods_equipment: 1, information: 3, financial: 1, mental_effort: 3, physical_effort: 1, environment: 3, organisational: 3 };
    const ex2 = { knowledge: 2, communication: 1, problem_solving: 2, planning: 1, physical_skills: 3, people: 0, goods_equipment: 3, information: 1, financial: 0, mental_effort: 2, emotional_effort: 1, physical_effort: 4, environment: 3, organisational: 3 };
    return [head,
      ['EXAMPLE Customer service adviser', 'Operations', 26, 8].concat(subs.map(s => (ex1[s.id] != null ? ex1[s.id] : ''))),
      ['EXAMPLE Warehouse operative', 'Operations', 8, 44].concat(subs.map(s => (ex2[s.id] != null ? ex2[s.id] : '')))];
  }
  function templateCSV(scheme) { return csvText(templateRows(scheme)); }

  // ---------- Adding each worker's category to a payroll export ----------
  const TITLE_SYN = ['jobtitle', 'role', 'rolename', 'jobrole', 'title', 'position', 'positiontitle', 'jobname', 'job', 'functie', 'functienaam', 'functietitel', 'stelle', 'stellenbezeichnung', 'funktion', 'taetigkeit', 'tatigkeit', 'berufsbezeichnung', 'jobcategory', 'category', 'jobfamily'];
  function detectTitleColumn(headers) {
    const H = headers.map(norm);
    let best = -1, bestScore = 0;
    H.forEach((h, i) => {
      const at = TITLE_SYN.indexOf(h);
      let sc = at > -1 ? 1000 - at : 0;
      if (!sc) for (const s of TITLE_SYN) if (s.length >= 5 && h.includes(s)) sc = Math.max(sc, s.length);
      if (sc > bestScore) { best = i; bestScore = sc; }
    });
    return best;
  }
  const plain = v => (v == null ? '' : typeof v === 'boolean' ? (v ? 'TRUE' : 'FALSE') : String(v));
  function mergePayroll(table, ev, res, opts) {
    const o = opts || {};
    const col = o.column != null ? o.column : detectTitleColumn(table.headers);
    const lookup = new Map(), pending = new Map();
    for (const r of res.rows) {
      for (const name of [r.role.name].concat(r.role.aliases || [])) {
        const k = key(name);
        if (!k) continue;
        if (r.complete && r.band != null) { if (!lookup.has(k)) lookup.set(k, r); }
        else if (!pending.has(k)) pending.set(k, r);
      }
    }
    const headers = table.headers.map(h => (h == null ? '' : String(h)));
    let out = headers.findIndex(h => norm(h) === norm(CATEGORY_COLUMN));
    const replaced = out > -1;
    if (!replaced) { out = headers.length; headers.push(CATEGORY_COLUMN); }
    const unmatched = new Map(), unscored = new Map(), perRole = new Map();
    let matched = 0, blank = 0;
    const body = table.body.map(({ cells }) => {
      const row = headers.map((_, i) => plain(cells[i]));
      const raw = col > -1 ? plain(cells[col]).trim() : '';
      const k = key(raw);
      let cat = '';
      if (!k) blank++;
      else if (lookup.has(k)) { const r = lookup.get(k); cat = r.category; matched++; perRole.set(r.role.id, (perRole.get(r.role.id) || 0) + 1); }
      else if (pending.has(k)) unscored.set(raw, (unscored.get(raw) || 0) + 1);
      else unmatched.set(raw, (unmatched.get(raw) || 0) + 1);
      row[out] = cat;
      return row;
    });
    const d = table.kind === 'csv' && table.delimiter ? table.delimiter : ',';
    const list = m => [...m.entries()].map(([value, count]) => ({ value, count })).sort((a, b) => b.count - a.count || a.value.localeCompare(b.value));
    return { csv: csvText([headers].concat(body), d), column: col, columnName: col > -1 ? headers[col] : '', replaced, total: body.length, matched, blank, unmatched: list(unmatched), unscored: list(unscored), perRole, delimiter: d };
  }

  // ---------- Save and load ----------
  const FORMAT = 'peak-job-evaluation';
  function serialize(ev) {
    return JSON.stringify({
      format: FORMAT, version: 1, checked: CHECKED,
      org: ev.org || '', evaluators: ev.evaluators || '', date: ev.date || '', notes: ev.notes || '',
      scheme: { total: ev.scheme.total, subs: ev.scheme.subs.map(s => ({ id: s.id, group: s.group, name: s.name, def: s.def || '', watch: s.watch || '', weight: Number(s.weight) || 0, levels: s.levels.slice(), custom: !!s.custom })), bands: ev.scheme.bands.map(b => ({ name: b.name, from: b.from })) },
      roles: ev.roles.map(r => ({ id: r.id, name: r.name, department: r.department || '', women: r.women, men: r.men, aliases: (r.aliases || []).slice(), levels: Object.assign({}, r.levels), notes: Object.assign({}, r.notes) })),
    }, null, 2);
  }
  function parse(text) {
    let o;
    try { o = JSON.parse(String(text || '').replace(/^﻿/, '')); } catch (e) { return { error: 'That file is not a saved job evaluation: it could not be read as JSON.' }; }
    if (!o || o.format !== FORMAT || !o.scheme || !Array.isArray(o.scheme.subs) || !Array.isArray(o.roles)) return { error: 'That file is not a job evaluation saved by this tool.' };
    if (o.version > 1) return { error: 'That file was saved by a newer version of this tool. Reload the page and try again.' };
    const str = (v, max) => String(v == null ? '' : v).slice(0, max || 2000);
    const subs = [];
    for (const s of o.scheme.subs) {
      if (!s || !GROUP[s.group] || !Array.isArray(s.levels) || s.levels.length < 2 || s.levels.length > 9) return { error: 'The factor plan in that file is damaged.' };
      const id = str(s.id, 60).replace(/[^a-z0-9_]/gi, '_') || `sub_${subs.length + 1}`;
      subs.push({ id, group: s.group, name: str(s.name, 120), def: str(s.def), watch: str(s.watch), weight: Math.max(0, Number(s.weight) || 0), levels: s.levels.map(l => str(l, 600)), custom: !!s.custom });
    }
    const bands = (Array.isArray(o.scheme.bands) ? o.scheme.bands : []).map(b => ({ name: str(b && b.name, 60), from: Math.max(0, Math.round(Number(b && b.from) || 0)) }));
    const total = Number(o.scheme.total) > 0 ? Number(o.scheme.total) : TOTAL;
    const ids = new Set(subs.map(s => s.id));
    const roles = o.roles.slice(0, 5000).map((r, i) => {
      const role = { id: str(r && r.id, 60) || `r${i + 1}`, name: str(r && r.name, 160), department: str(r && r.department, 160), women: intOrNull(r && r.women).v, men: intOrNull(r && r.men).v, aliases: Array.isArray(r && r.aliases) ? r.aliases.map(a => str(a, 160)).filter(Boolean) : [], levels: {}, notes: {} };
      for (const [k, v] of Object.entries((r && r.levels) || {})) { const s = subs.find(x => x.id === k); if (s && Number.isInteger(v) && v >= 0 && v <= maxLevel(s)) role.levels[k] = v; }
      for (const [k, v] of Object.entries((r && r.notes) || {})) if (ids.has(k) && v) role.notes[k] = str(v);
      return role;
    });
    return { ev: { org: str(o.org, 160), evaluators: str(o.evaluators, 300), date: /^\d{4}-\d{2}-\d{2}$/.test(o.date || '') ? o.date : '', notes: str(o.notes, 6000), scheme: { total, subs, bands }, roles, sample: false } };
  }

  // ---------- The synthetic sample company ----------
  // Fifteen made-up roles. Eight carry the job titles of the Pay Gap Report's synthetic company, with its headcounts, so
  // that company's payroll can be merged with these grades. One score is deliberately questionable (the cleaner's
  // physical and mental effort) so that the bias checks have something to find.
  const SAMPLE_ORDER = ['knowledge', 'communication', 'problem_solving', 'planning', 'physical_skills', 'people', 'goods_equipment', 'information', 'financial', 'mental_effort', 'emotional_effort', 'physical_effort', 'environment', 'organisational'];
  const SAMPLE_ROLES = [
    ['Director', 'Management', 1, 3, [6, 5, 5, 5, 0, 5, 4, 5, 5, 4, 3, 0, 1, 4], ['Runs the business; degree-level and long management experience', 'Leads strategy with the board, banks and major customers', 'Decides on new problems with no precedent', 'Sets three-year plans and the yearly budget cycle', 'Office work only', 'Accountable for the whole workforce, pay and staffing', 'Signs off fleet and warehouse investments', 'Owns company and customer data decisions', 'Owns the budget and the accounts', 'Long periods of complex decisions', 'Handles restructuring and difficult staff cases', 'No physical demands', 'Office environment', 'Travel to sites and customers, reachable out of hours']],
    ['Manager', 'Operations', 3, 7, [5, 4, 4, 4, 0, 4, 3, 4, 4, 4, 3, 1, 2, 3], ['Runs a site; professional qualification and experience', 'Negotiates with customers and resolves staff conflicts', 'Solves non-standard operational problems', 'Plans site capacity across teams', 'Office and site walks', 'Manages team leaders, hiring and appraisals', 'Responsible for site equipment and stock', 'Owns site performance and personnel data', 'Manages the site budget', 'Sustained concentration on several priorities', 'Regular difficult conversations', 'Walks the site floor', 'Some exposure to warehouse hazards', 'Rotating out-of-hours cover']],
    ['Specialist', 'Planning and analysis', 7, 9, [5, 3, 4, 3, 1, 1, 2, 4, 2, 4, 1, 1, 1, 2], ['Analytics qualification and specialist knowledge', 'Explains results to managers and customers', 'Analyses complex, non-standard questions', 'Organises own projects and deadlines', 'Keyboard work', 'Helps new colleagues with tools', 'Uses own equipment', 'Manages large operational data sets', 'Prepares cost models', 'Long periods of analytical concentration', 'Little emotional demand', 'Desk work', 'Office environment', 'Occasional late reporting deadlines']],
    ['Team leader', 'Operations', 7, 9, [4, 4, 3, 4, 2, 3, 3, 3, 1, 3, 3, 2, 3, 3], ['Experienced operator with leadership training', 'Mediates conflicts in the team', 'Varied problems on shift', 'Plans shift rotas and handovers', 'Operates equipment when needed', 'Supervises a shift team of 8 to 12', 'Checks equipment and stock on shift', 'Keeps shift records and absence data', 'Approves small shift expenses', 'Frequent concentration on shift flow', 'Regular difficult conversations on shift', 'Standing and walking on the floor', 'Warehouse hazards, noise, cold areas', 'Shifts including nights and weekends']],
    ['Administration', 'Office', 17, 5, [3, 3, 2, 3, 3, 1, 2, 3, 2, 3, 2, 1, 1, 1], ['Office procedures and systems knowledge', 'Deals with staff, drivers and suppliers', 'Standard problems with defined options', 'Organises calendars, meetings and several deadlines', 'Fast, accurate keyboard work', 'Shows new staff the procedures', 'Manages office supplies', 'Keeps records accurate and confidential', 'Processes invoices', 'Frequent concentration and multitasking', 'Occasional upset callers', 'Desk work', 'Office environment', 'Standard hours']],
    ['Customer service', 'Customer service', 26, 8, [3, 4, 3, 2, 2, 1, 1, 3, 1, 3, 4, 1, 3, 3], ['Product, delivery and complaints procedures', 'Handles complaints and calms upset customers', 'Varied delivery problems with limited guidance', 'Plans own call queue and follow-ups', 'Fast keyboard work during calls', 'Helps new advisers', 'Uses own equipment', 'Keeps customer records under data protection rules', 'Issues small refunds', 'Constant attention across several systems', 'Frequent angry or distressed customers', 'Seated work with headset', 'Regular verbal aggression on calls', 'Rotating shifts including weekends']],
    ['Driver', 'Transport', 2, 24, [3, 2, 2, 2, 4, 0, 4, 1, 1, 4, 1, 3, 4, 4], ['Category C licence, driving hours and load rules', 'Deals with customers at delivery', 'Standard route problems', 'Organises own route within time slots', 'Drives a 7.5 to 18 tonne vehicle in traffic', 'No responsibility for others', 'Responsible for vehicle and load', 'Delivery paperwork', 'Fuel card', 'Continuous concentration while driving', 'Occasional difficult customers', 'Loading and unloading', 'Road risks and weather', 'Early starts, nights and overnight trips']],
    ['Warehouse operative', 'Operations', 8, 44, [2, 1, 2, 1, 3, 0, 3, 1, 0, 2, 1, 4, 3, 3], ['Warehouse procedures and forklift certificate', 'Basic information sharing', 'Routine stock problems', 'Picking lists set by the system', 'Forklift and scanner handling with precision', 'No responsibility for others', 'Uses and checks forklifts and stock', 'Scans stock movements', 'No financial responsibility', 'Attention to picking accuracy', 'Little emotional demand', 'Frequent lifting and walking all shift', 'Cold store, moving vehicles, noise', 'Shifts including nights']],
    ['Cleaner', 'Facilities', 9, 2, [1, 1, 2, 2, 3, 0, 3, 1, 0, 1, 1, 2, 3, 3], ['Cleaning procedures and chemical safety', 'Basic contact with staff', 'Standard problems such as spills and access', 'Organises own rounds across the site', 'Careful handling of machines and chemicals', 'No responsibility for others', 'Cleaning machines and supplies', 'Logs cleaning checks and safety data sheets', 'No financial responsibility', 'Light cleaning, little concentration needed', 'Little emotional demand', 'Light cleaning tasks', 'Cleaning chemicals, wet floors, toilets', 'Early morning and evening shifts']],
    ['Receptionist', 'Office', 5, 1, [2, 3, 2, 2, 2, 1, 1, 2, 1, 2, 3, 1, 2, 1], ['Front desk and visitor procedures', 'First point of contact for visitors and callers', 'Standard visitor and booking problems', 'Organises visitor bookings', 'Keyboard and switchboard work', 'Visitor safety on site', 'Front desk equipment', 'Visitor log and access records', 'Petty cash', 'Attention to arrivals and calls together', 'Regularly handles upset or impatient visitors', 'Seated with some walking', 'Occasional difficult visitors', 'Standard hours']],
    ['Maintenance technician', 'Facilities', 0, 6, [4, 2, 4, 3, 4, 1, 4, 2, 1, 3, 1, 3, 4, 3], ['Electrical and mechanical qualification', 'Explains faults to operators', 'Diagnoses non-standard faults', 'Plans preventive maintenance', 'Precise work with tools and controls', 'Guides an apprentice', 'Maintains conveyors, doors and forklifts', 'Maintenance records', 'Orders small parts', 'Concentration on fault finding', 'Little emotional demand', 'Lifting, climbing and awkward positions', 'Electrical and mechanical hazards', 'On-call rota and night repairs']],
    ['Transport planner', 'Transport', 2, 5, [4, 3, 4, 4, 1, 1, 2, 3, 2, 4, 2, 0, 1, 3], ['Transport regulations and planning systems', 'Coordinates drivers and customers', 'Re-plans routes around disruption', 'Plans routes and vehicles across depots', 'Keyboard work', 'Gives drivers guidance', 'Allocates vehicles', 'Keeps route and delivery data', 'Manages fuel and route costs', 'Continuous concentration on live routes', 'Occasional pressure from drivers and customers', 'Desk work', 'Office environment', 'Early starts and weekend rota']],
    ['Payroll officer', 'Finance and HR', 3, 1, [4, 2, 3, 3, 2, 0, 1, 4, 3, 4, 2, 1, 1, 2], ['Payroll, tax and pension rules', 'Answers staff pay queries', 'Varied pay problems', 'Organises the monthly payroll cycle', 'Accurate keyboard work', 'No responsibility for others', 'Uses own equipment', 'Holds sensitive pay data for all staff', 'Processes the monthly payroll', 'Sustained accuracy under deadlines', 'Occasional upset staff over pay', 'Desk work', 'Office environment', 'Month-end peaks']],
    ['IT support technician', 'IT', 1, 4, [4, 3, 4, 2, 2, 1, 3, 4, 0, 3, 2, 1, 1, 2], ['Systems and networking knowledge', 'Explains fixes to users', 'Diagnoses non-standard faults', 'Organises own ticket queue', 'Handles hardware', 'Shows users how to work systems', 'Laptops, scanners and network kit', 'Access rights and system data', 'No financial responsibility', 'Frequent concentration on faults', 'Occasional frustrated users', 'Carries equipment occasionally', 'Office and site environment', 'Occasional out-of-hours changes']],
    ['Health and safety adviser', 'Facilities', 1, 1, [5, 4, 4, 3, 1, 2, 2, 3, 1, 3, 3, 2, 3, 2], ['Health and safety qualification and law', 'Trains staff and investigates incidents', 'Non-standard risk problems', 'Plans audits and training', 'Inspection work', 'Responsible for the safety of others on site', 'Safety equipment', 'Incident and inspection records', 'Small safety budget', 'Frequent concentration on audits', 'Regular distressing incidents', 'Walks and inspects sites', 'Site hazards during inspections', 'Occasional travel between sites']],
  ];
  function sample() {
    const scheme = defaultScheme();
    const roles = SAMPLE_ROLES.map(([name, department, women, men, lv, why], i) => {
      const r = { id: `s${i + 1}`, name, department, women, men, aliases: [], levels: {}, notes: {} };
      SAMPLE_ORDER.forEach((id, j) => { r.levels[id] = lv[j]; r.notes[id] = why[j]; });
      return r;
    });
    return { org: 'Sample Company Ltd', evaluators: 'Job evaluation committee of five (synthetic)', date: '2026-10-01', notes: 'Synthetic data: 15 made-up roles of a made-up company, so every step can be seen working.', scheme, roles, sample: true };
  }

  return {
    CHECKED, TOTAL, FREE_ROLES, CATEGORY_COLUMN, CATEGORY_COLUMNS, DOMINANCE, LIMITS, GROUPS, GROUP, PLAN, GROUP_ADVICE, SOFT,
    norm, key, pts, clean,
    defaultScheme, equalBands, maxLevel, subPoints, levelPoints, groupWeights, weightTotal, validateScheme,
    newRole, score, bandIndex, bandRange, dominance, evaluate, checks,
    categoriesCSV, csvText, detectColumns, importRoles, templateRows, templateCSV,
    detectTitleColumn, mergePayroll, serialize, parse, sample, SAMPLE_ORDER,
  };
});
