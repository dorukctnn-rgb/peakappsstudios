/* Job Evaluation: the methodology record as an A4 PDF (Pro). pdf-lib is passed in (the copy vendored with the Pay Gap
 * Report, loaded only when a PDF is asked for) and every string goes through the Pay Gap Report's pdfText(), which keeps
 * it inside the WinAnsi set of the standard Helvetica font. The record holds what an employer keeps as evidence: the
 * factor plan and every level description, the weights and any change to the defaults, each role's level on every
 * subfactor with its reason, the grades, the categories of work of equal value, the bias checks, the decisions and a
 * sign-off block. Works in the browser (window.JobEvalRecord) and in Node for the tests. */
(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory();
  else root.JobEvalRecord = factory();
})(typeof self !== 'undefined' ? self : this, function () {
  'use strict';

  const MONTHS = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];
  const longDate = iso => { const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(iso || ''); return m ? `${Number(m[3])} ${MONTHS[Number(m[2]) - 1]} ${m[1]}` : ''; };
  const num = (J, x) => (x == null || x === '' ? '' : Number(J.pts(x)).toLocaleString('en-GB', { maximumFractionDigits: 1 }));
  const plural = (n, a, b) => `${n} ${n === 1 ? a : b || a + 's'}`;
  const wm = (w, m) => `${w} ${w === 1 ? 'woman' : 'women'}, ${m} ${m === 1 ? 'man' : 'men'}`;

  // What differs from the default plan of the guidelines, for the record.
  function changes(J, sc) {
    const d = J.defaultScheme(), out = [];
    for (const s of sc.subs) {
      const o = d.subs.find(x => x.id === s.id);
      if (!o) { out.push(`Added: ${s.name} (${J.GROUP[s.group].name.toLowerCase()}), ${num(J, s.weight)}%, levels 0 to ${J.maxLevel(s)}.`); continue; }
      if (Number(s.weight) !== o.weight) out.push(`${s.name}: weight ${num(J, s.weight)}% instead of ${o.weight}%.`);
      if (s.name !== o.name) out.push(`${o.name} renamed “${s.name}”.`);
      if (s.def !== o.def || s.levels.length !== o.levels.length || s.levels.some((t, i) => t !== o.levels[i])) out.push(`${s.name}: description or levels edited (levels 0 to ${J.maxLevel(s)}).`);
    }
    for (const o of d.subs) if (!sc.subs.some(s => s.id === o.id)) out.push(`Removed: ${o.name}.`);
    const same = sc.bands.length === d.bands.length && sc.bands.every((b, i) => b.from === d.bands[i].from && b.name === d.bands[i].name);
    if (!same) out.push(`Grades: ${sc.bands.map((b, i) => `${b.name} from ${b.from}`).join(', ')} (default: ten grades of 120 points).`);
    return out;
  }

  async function pdf(PDFLib, view) {
    const { J, ev, res, checks } = view;
    const pdfText = view.pdfText;
    const sc = ev.scheme;
    const { PDFDocument, StandardFonts, rgb } = PDFLib;
    const doc = await PDFDocument.create();
    const org = String(ev.org || '').trim() || 'Organisation name';
    const evDate = longDate(ev.date);
    doc.setTitle(pdfText(`Job evaluation record: ${org}${evDate ? ', ' + evDate : ''}`));
    doc.setAuthor(pdfText(org));
    doc.setCreator('Peak Apps Job Evaluation');
    doc.setProducer('pdf-lib');
    const F = await doc.embedFont(StandardFonts.Helvetica), B = await doc.embedFont(StandardFonts.HelveticaBold);
    const W = 595.28, H = 841.89, M = 48, CW = W - 2 * M;
    const INK = rgb(0.08, 0.08, 0.09), MUTED = rgb(0.4, 0.41, 0.44), RULE = rgb(0.82, 0.82, 0.8), SOFT = rgb(0.955, 0.95, 0.935);
    const ACCENT = rgb(0x4a / 255, 0x5d / 255, 0x23 / 255), WARN = rgb(0.6, 0.29, 0.07), OK = rgb(0.17, 0.42, 0.25);
    let page, y;
    const pages = [];
    const newPage = () => { page = doc.addPage([W, H]); pages.push(page); y = H - M; };
    const ensure = h => { if (y - h < M + 26) newPage(); };
    const text = (str, x, yy, o = {}) => { const f = o.bold ? B : F, s = o.size || 9.5; const t = pdfText(str); const tw = f.widthOfTextAtSize(t, s); page.drawText(t, { x: o.right ? x - tw : x, y: yy, size: s, font: f, color: o.color || INK }); return tw; };
    const wrap = (str, font, s, max) => {
      const out = [];
      for (const p of pdfText(str).split('\n')) {
        const words = p.split(/\s+/).filter(Boolean); let cur = '';
        if (!words.length) { out.push(''); continue; }
        for (const w of words) {
          let wd = w;
          while (font.widthOfTextAtSize(wd, s) > max && wd.length > 1) { // a single word wider than the column
            let k = wd.length - 1; while (k > 1 && font.widthOfTextAtSize(wd.slice(0, k), s) > max) k--;
            if (cur) { out.push(cur); cur = ''; }
            out.push(wd.slice(0, k)); wd = wd.slice(k);
          }
          const t = cur ? cur + ' ' + wd : wd;
          if (font.widthOfTextAtSize(t, s) > max && cur) { out.push(cur); cur = wd; } else cur = t;
        }
        if (cur) out.push(cur);
      }
      return out;
    };
    const para = (str, o = {}) => { const s = o.size || 9, f = o.bold ? B : F; for (const l of wrap(str, f, s, o.width || CW)) { ensure(s + 4); if (l) text(l, o.x || M, y, { size: s, bold: o.bold, color: o.color }); y -= s + (o.lead || 3.6); } };
    // A list item with a hanging indent
    const bullet = (str, o = {}) => { const x = o.x || M, s = o.size || 9; ensure(s + 4); text('-', x, y, { size: s, color: MUTED }); para(str, Object.assign({}, o, { x: x + 9, width: (o.width || CW) - 9 })); };
    const rule = (yy, c = RULE, t = 0.6, x0 = M, x1 = W - M) => page.drawLine({ start: { x: x0, y: yy }, end: { x: x1, y: yy }, thickness: t, color: c });
    const h2 = (str, keep) => { ensure(48 + (keep || 0)); y -= 12; text(str, M, y, { bold: true, size: 12.5 }); y -= 8; rule(y, INK, 0.8); y -= 15; };
    // A table: cols [{ label, x, w, right }]; rows of cell strings; the widest column wraps.
    function table(cols, rows, o = {}) {
      const size = o.size || 8.5, lead = size + 2.6;
      const head = () => { cols.forEach(c => text(c.label, c.right ? c.x + c.w : c.x, y, { size: 7.5, color: MUTED, right: c.right })); y -= 5; rule(y); y -= 11; };
      ensure(30); head();
      for (const r of rows) {
        const cells = cols.map((c, i) => (c.wrap ? wrap(String(r.cells[i] == null ? '' : r.cells[i]), r.bold ? B : F, size, c.w) : [pdfText(String(r.cells[i] == null ? '' : r.cells[i]))]));
        const h = Math.max(...cells.map(c => c.length)) * lead;
        if (y - h < M + 26) { newPage(); head(); }
        if (r.shade) page.drawRectangle({ x: M - 4, y: y - h + lead - 4, width: CW + 8, height: h + 1, color: SOFT });
        cols.forEach((c, i) => cells[i].forEach((l, k) => text(l, c.right ? c.x + c.w : c.x, y - k * lead, { size, bold: r.bold || (c.bold && !r.muted), right: c.right, color: r.muted ? MUTED : r.color || INK })));
        y -= h; y -= 2.4;
        if (o.lines) rule(y + 5, RULE, 0.3);
      }
      y -= 4;
    }

    const gw = J.groupWeights(sc);
    const subs = sc.subs;
    const done = res.complete;
    const flagged = checks.filter(c => c.state === 'check').length;
    const diff = changes(J, sc);

    // ---- Cover ----
    newPage();
    text('JOB EVALUATION RECORD', M, y, { size: 8, color: ACCENT, bold: true });
    text(`Prepared ${view.generated || ''}`, W - M, y, { size: 8, color: MUTED, right: true });
    y -= 30;
    for (const l of wrap(org, B, 22, CW)) { text(l, M, y, { bold: true, size: 22 }); y -= 26; }
    y += 4;
    text(`Point-factor job evaluation of ${plural(res.rows.length, 'role')}`, M, y, { size: 12 });
    y -= 24;
    const info = [
      ['Method', 'Point-factor job evaluation designed to be gender-neutral. Each role is scored on the four criteria of Article 4(4) of Directive (EU) 2023/970, skills, effort, responsibility and working conditions, through the subfactors below; the levels are added up with the weights to a total out of ' + num(J, sc.total) + ' points.'],
      ['Factor plan', diff.length ? 'Adapted from the default plan of the EU-wide guidelines on gender-neutral job evaluation and classification (European Commission and EIGE, 2026). The changes are listed in section 1.' : 'The default plan of the EU-wide guidelines on gender-neutral job evaluation and classification (European Commission and EIGE, 2026), with its default weights and grades. The guidelines describe the weights as illustrative.'],
      ['Evaluated by', String(ev.evaluators || '').trim() || 'Not recorded'],
      ['Date of evaluation', evDate || 'Not recorded'],
      ['Roles', `${res.rows.length} in this record; ${done.length} fully scored, in ${plural(res.categories.length, 'grade')}${res.incomplete.length ? `; ${res.incomplete.length} not fully scored` : ''}.`],
      ['Grades', `${plural(sc.bands.length, 'grade')} over ${num(J, sc.total)} points. The roles in one grade form one category of work of equal value.`],
    ];
    for (const [k, v] of info) {
      const lines = wrap(v, F, 9.5, CW - 120);
      ensure(14 * lines.length);
      text(k, M, y, { size: 9, color: MUTED });
      lines.forEach((l, i) => text(l, M + 120, y - i * 12.5, { size: 9.5 }));
      y -= 12.5 * lines.length + 5;
    }
    y -= 6;
    const bh = 54; ensure(bh + 10);
    page.drawRectangle({ x: M, y: y - bh, width: CW, height: bh, color: SOFT });
    [['Roles scored', `${done.length} of ${res.rows.length}`], ['Categories', String(res.categories.length)], ['Checks to review', String(flagged)], ['Points scale', `0 to ${num(J, sc.total)}`]].forEach(([k, v], i) => {
      const x = M + 12 + i * (CW / 4);
      text(k, x, y - 17, { size: 7.5, color: MUTED });
      text(v, x, y - 39, { size: 17, bold: true, color: k === 'Checks to review' && flagged ? WARN : INK });
    });
    y -= bh + 12;
    para('This record sets out the factor plan, the level descriptions and weights, the level given to each role on every subfactor with the reason recorded, the grades and the categories of work of equal value that result, and the bias checks. It documents how the categories of workers were set for pay information requests (Article 7), pay reporting (Article 9) and any joint pay assessment (Article 10). It certifies nothing; section 8 lists what the employer still has to do.', { size: 8.5, color: MUTED });

    // ---- 1. The factor plan ----
    h2('1. The factor plan', 120);
    const cols = [{ label: 'Subfactor', x: M, w: 250, wrap: true }, { label: 'Weight', x: M + 262, w: 50, right: true }, { label: 'Points', x: M + 322, w: 50, right: true }, { label: 'Levels', x: M + 384, w: 50, right: true }, { label: 'Per level', x: M + 446, w: CW - 446, right: true }];
    const rows = [];
    for (const g of J.GROUPS) {
      rows.push({ shade: true, bold: true, cells: [g.name, `${num(J, gw[g.id])}%`, num(J, sc.total * gw[g.id] / 100), '', ''] });
      for (const s of subs.filter(x => x.group === g.id)) rows.push({ cells: [s.name, `${num(J, s.weight)}%`, num(J, J.subPoints(s, sc.total)), `0 to ${J.maxLevel(s)}`, num(J, J.subPoints(s, sc.total) / J.maxLevel(s))] });
    }
    rows.push({ bold: true, cells: ['Total', `${num(J, J.weightTotal(sc))}%`, num(J, sc.total), '', ''] });
    table(cols, rows, { lines: true });
    para('Points for a level are the subfactor’s points divided by its top level and multiplied by the level, so level 0 scores nothing and the top level scores the subfactor’s full points.', { size: 8, color: MUTED });
    y -= 4;
    if (diff.length) {
      ensure(30); text('Changes from the default plan', M, y, { bold: true, size: 9.5 }); y -= 13;
      for (const c of diff) bullet(c, { size: 8.5, x: M + 4, width: CW - 4 });
      para('Changes to the weighting need a strong, objective and gender-neutral reason, recorded in section 8 (EU guidelines, Tool 5, step 3).', { size: 8, color: MUTED });
    }

    // ---- 2. Level descriptions ----
    h2('2. What each level means', 80);
    for (const g of J.GROUPS) {
      for (const s of subs.filter(x => x.group === g.id)) {
        ensure(60);
        text(s.name, M, y, { bold: true, size: 10 });
        text(`${g.name}, ${num(J, s.weight)}%, ${num(J, J.subPoints(s, sc.total))} points`, W - M, y, { size: 8, color: MUTED, right: true });
        y -= 13;
        if (s.def) para(s.def, { size: 8.5, color: MUTED });
        y -= 1;
        s.levels.forEach((t, k) => {
          const lines = wrap(t, F, 8.5, CW - 70);
          ensure(lines.length * 11.2 + 2);
          text(String(k), M + 4, y, { size: 8.5, bold: true, color: ACCENT });
          text(num(J, J.levelPoints(s, k, sc.total)), M + 46, y, { size: 8, color: MUTED, right: true });
          lines.forEach((l, i) => text(l, M + 62, y - i * 11.2, { size: 8.5 }));
          y -= lines.length * 11.2 + 1.6;
        });
        y -= 8;
      }
    }

    // ---- 3. Grades ----
    h2('3. Grades', 60);
    table([{ label: 'Grade', x: M, w: 120 }, { label: 'From', x: M + 130, w: 50, right: true }, { label: 'To', x: M + 192, w: 50, right: true }, { label: 'Roles in it', x: M + 262, w: CW - 262, wrap: true }],
      sc.bands.map((b, i) => { const r = J.bandRange(sc, i); const roles = res.rows.filter(x => x.band === i).map(x => x.role.name || 'Unnamed role'); return { cells: [b.name, num(J, r.from), num(J, r.to), roles.length ? roles.join(', ') : 'None'], muted: !roles.length }; }), { lines: true });
    para('A score belongs to the last grade whose lower limit it has reached, as in the guidelines’ workbook.', { size: 8, color: MUTED });

    // ---- 4. Results ----
    h2('4. Points and grade of each role', 60);
    const sorted = res.rows.slice().sort((a, b) => (b.complete - a.complete) || (b.total - a.total) || (a.index - b.index));
    const short = { skills: 'Skills', responsibility: 'Resp.', effort: 'Effort', conditions: 'Cond.' };
    const rc = [{ label: 'Role', x: M, w: 150, wrap: true }].concat(J.GROUPS.map((g, i) => ({ label: short[g.id], x: M + 158 + i * 46, w: 40, right: true }))).concat([{ label: 'Total', x: M + 346, w: 42, right: true }, { label: 'Grade', x: M + 396, w: 52, wrap: true }, { label: 'Women', x: M + 452, w: 24, right: true }, { label: 'Men', x: M + 480, w: CW - 480, right: true }]);
    table(rc, sorted.map(r => ({ muted: !r.complete, cells: [r.role.name || 'Unnamed role'].concat(J.GROUPS.map(g => num(J, r.groups[g.id]))).concat([num(J, r.total), r.complete ? r.category : `${r.scored} of ${r.needed} scored`, r.role.women == null ? '' : String(r.role.women), r.role.men == null ? '' : String(r.role.men)]) })), { lines: true, size: 8 });
    para(`Group totals: skills out of ${num(J, sc.total * gw.skills / 100)}, responsibility out of ${num(J, sc.total * gw.responsibility / 100)}, effort out of ${num(J, sc.total * gw.effort / 100)}, working conditions out of ${num(J, sc.total * gw.conditions / 100)}.${res.incomplete.length ? ` Roles not fully scored have no grade and are not in any category.` : ''}`, { size: 8, color: MUTED });

    // ---- 5. Categories ----
    h2('5. Categories of work of equal value', 60);
    para('Article 3(1)(h) of Directive (EU) 2023/970: workers performing the same work or work of equal value, grouped in a non-arbitrary manner on the objective, gender-neutral criteria of Article 4(4). Each category below is the set of roles whose points fall in one grade.', { size: 8.5, color: MUTED });
    y -= 4;
    if (!res.categories.length) para('No role is fully scored yet, so there are no categories.', { size: 9 });
    for (const c of res.categories) {
      ensure(40);
      text(c.name, M, y, { bold: true, size: 10.5 });
      text(`${num(J, c.from)} to ${num(J, c.to)} points`, M + 110, y, { size: 8.5, color: MUTED });
      text(c.headcountRoles ? `${wm(c.women, c.men)}${c.headcountRoles < c.roles.length ? ` (in ${c.headcountRoles} of ${c.roles.length} roles)` : ''}` : 'No headcounts entered', W - M, y, { size: 8.5, right: true, color: c.headcountRoles ? INK : MUTED });
      y -= 13;
      para(c.roles.map(r => `${r.role.name || 'Unnamed role'} (${num(J, r.total)})`).join(', '), { size: 9, x: M + 10, width: CW - 10 });
      y -= 6;
    }

    // ---- 6. Scores and reasons ----
    h2('6. Every score and its reason', 80);
    for (const r of sorted) {
      ensure(70);
      const title = r.role.name || 'Unnamed role';
      text(title, M, y, { bold: true, size: 10.5 });
      text(r.complete ? `${num(J, r.total)} points, ${r.category}` : `${r.scored} of ${r.needed} subfactors scored`, W - M, y, { size: 9, right: true, color: r.complete ? ACCENT : WARN, bold: true });
      y -= 12.5;
      const meta = [r.role.department ? `Department: ${r.role.department}` : '', r.dom ? `${wm(r.role.women, r.role.men)}${r.dom.kind === 'F' ? ' (women-dominated)' : r.dom.kind === 'M' ? ' (men-dominated)' : ''}` : '', (r.role.aliases || []).length ? `Also matched as: ${r.role.aliases.join(', ')}` : ''].filter(Boolean).join('. ');
      if (meta) para(meta + '.', { size: 8, color: MUTED });
      y -= 2;
      table([{ label: 'Subfactor', x: M, w: 150, wrap: true }, { label: 'Level', x: M + 156, w: 30, right: true }, { label: 'Points', x: M + 192, w: 38, right: true }, { label: 'Reason recorded', x: M + 244, w: CW - 244, wrap: true }],
        subs.map(s => { const l = r.role.levels[s.id]; const note = String(r.role.notes[s.id] || '').trim(); return { muted: l == null, cells: [s.name, l == null ? 'none' : String(l), l == null ? '' : num(J, J.levelPoints(s, l, sc.total)), note || (l == null ? 'Not scored' : 'No reason recorded')] }; }), { size: 8, lines: true });
      y -= 6;
    }

    // ---- 7. Bias checks ----
    h2('7. Bias checks', 60);
    para('Prompts to look again, computed from the scores and weights above. A check marked for review is not proof of bias, and one that passes is not proof of its absence. Women-dominated means 60% or more women among a role’s holders, men-dominated 60% or more men, as in the guidelines’ workbook.', { size: 8.5, color: MUTED });
    y -= 4;
    for (const c of checks) {
      const tag = c.state === 'check' ? 'TO REVIEW' : c.state === 'ok' ? 'PASSED' : 'NOT RUN';
      const lines = wrap(c.title, B, 9.5, CW - 70);
      ensure(lines.length * 12 + 30);
      text(tag, M, y, { size: 7.5, bold: true, color: c.state === 'check' ? WARN : c.state === 'ok' ? OK : MUTED });
      lines.forEach((l, i) => text(l, M + 70, y - i * 12, { size: 9.5, bold: true }));
      y -= lines.length * 12;
      para(c.text, { size: 8.5, x: M + 70, width: CW - 70, color: MUTED });
      for (const it of c.items || []) bullet(it, { size: 8.5, x: M + 72, width: CW - 72 });
      y -= 8;
    }

    // ---- 8. Decisions and what the employer still does ----
    newPage();
    text('8. Decisions and next steps', M, y, { bold: true, size: 12.5 }); y -= 8; rule(y, INK, 0.8); y -= 16;
    const notes = String(ev.notes || '').trim();
    if (notes) { text('Recorded by the evaluators', M, y, { bold: true, size: 10 }); y -= 14; para(notes, { size: 9.5, lead: 4 }); y -= 10; }
    else { para('No decisions recorded. Record here how the criteria were agreed, who was consulted and what was changed after the bias checks.', { size: 9, color: MUTED }); y -= 6; }
    text('What this record does not do', M, y, { bold: true, size: 10 }); y -= 14;
    [
      'It does not certify compliance. No method of job evaluation is approved or certified under the directive; this one is designed to be gender-neutral and follows the EU-wide guidelines and the ILO guide, and the guidelines say their use alone does not certify or guarantee compliance.',
      'Workers’ representatives: Article 4(4) requires the criteria to be agreed with workers’ representatives where such representatives exist, and Article 3(1)(h) refers to their cooperation in grouping workers in accordance with national law. National law may give them consent or co-determination rights over the system and the categories.',
      'Review: the employer reviews the results, including the bias checks in section 7, before relying on them, and reviews the evaluation when jobs change.',
      'Pay: the categories show which work is of equal value. Where pay differs within a category without objective, gender-neutral justification, it has to be remedied (Articles 9(10) and 10).',
    ].forEach(t => { bullet(t, { size: 9, x: M + 4, width: CW - 4, lead: 3.8 }); y -= 3; });
    y -= 14;
    ensure(150);
    text('Sign-off', M, y, { bold: true, size: 10 }); y -= 30;
    const line = (label, x0, x1) => { page.drawLine({ start: { x: x0, y }, end: { x: x1, y }, thickness: 0.6, color: INK }); text(label, x0, y - 11, { size: 8, color: MUTED }); };
    line('Approved by (name)', M, M + CW / 2 - 12); line('Job title', M + CW / 2 + 12, W - M); y -= 44;
    line('Signature', M, M + CW / 2 - 12); line('Date', M + CW / 2 + 12, W - M); y -= 44;
    line('Workers’ representatives consulted (names, body)', M, W - M); y -= 40;

    // ---- 9. Sources ----
    h2('9. Sources', 60);
    [
      `Directive (EU) 2023/970 of the European Parliament and of the Council of 10 May 2023, OJ L 132, 17.5.2023: Articles 3, 4, 7, 9, 10 and 18, and recitals 26 and 31. eur-lex.europa.eu/eli/dir/2023/970/oj`,
      'European Commission and EIGE (2026), EU-wide guidelines on gender-neutral job evaluation and classification: step-by-step toolkit, Tool 5 and section 5.1 (factor and subfactor plan), with the Tool 5 workbook; CC BY 4.0, level descriptions shortened. eige.europa.eu/gender-mainstreaming/toolkits/gender-neutral-job-evaluation',
      'Chicha, M.-T. (2008), Promoting equity: gender-neutral job evaluation for equal pay, a step-by-step guide, International Labour Office, chapters 4 and 7.',
      `All checked on ${J.CHECKED}. Prepared with Peak Apps Job Evaluation (peakappsstudio.com/job-evaluation/). Not legal advice.`,
    ].forEach(t => { para(t, { size: 8.5, color: MUTED }); y -= 3; });

    // ---- Footer ----
    const foot = pdfText(`${org}, job evaluation record${evDate ? ', ' + evDate : ''}. Not legal advice.`);
    pages.forEach((p, i) => {
      p.drawLine({ start: { x: M, y: M - 10 }, end: { x: W - M, y: M - 10 }, thickness: 0.5, color: RULE });
      const fs = 7.5; let t = foot;
      while (F.widthOfTextAtSize(t, fs) > CW - 70 && t.length > 20) t = t.slice(0, -2);
      p.drawText(t === foot ? t : t + '.', { x: M, y: M - 22, size: fs, font: F, color: MUTED });
      const pg = `Page ${i + 1} of ${pages.length}`;
      p.drawText(pg, { x: W - M - F.widthOfTextAtSize(pg, fs), y: M - 22, size: fs, font: F, color: MUTED });
    });
    return doc.save();
  }

  return { pdf, changes };
});
