/* Equality Action Plan exports (Pro): the sign-off pack PDF, the website plan page (self-contained HTML and PDF), the
 * measures tracker PDF and the staff consultation kit. Pure functions over a "view" built by pro.js; pdf-lib is passed in
 * (the copy vendored with the Pay Gap Report, loaded only when a PDF is asked for) and text goes through the Pay Gap
 * Report's pdfText(), which keeps it inside the WinAnsi set of the standard fonts.
 * Works in the browser (window.EAPPack) and in Node for the tests. */
(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory(() => require('../pay-gap-report/report.js'), require('./rules.js'), require('./engine.js'));
  else root.EAPPack = factory(() => root.PayGapReport, root.EAPRules, root.EAP);
})(typeof self !== 'undefined' ? self : this, function (getReport, R, E) {
  'use strict';

  const W = 595.28, H = 841.89, M = 50, CW = W - 2 * M;
  const MONTHS = R.MONTHS;
  const longDate = d => `${d.getUTCDate()} ${MONTHS[d.getUTCMonth()]} ${d.getUTCFullYear()}`;
  const plural = (n, one, many) => `${n} ${n === 1 ? one : (many || one + 's')}`;

  // ---------- The view: everything an export prints, worked out once ----------
  // input: { plan, analysis (EAPAnalysis.analyse result or null), analysisFile, previous (parsed tracker rows or null), today (Date) }
  function view(input) {
    const plan = input.plan;
    const check = E.checkPlan(plan);
    const ry = R.reportingYear(plan.sector, plan.year);
    const rows = E.trackerRows(plan);
    return {
      plan, check, ry, employer: String(plan.employer || '').trim(), sample: !!plan.sample,
      generated: longDate(input.today || new Date()),
      diagnosis: E.diagnose(plan.figures || {}),
      figures: E.cleanFigures(plan.figures || {}),
      analysis: input.analysis || null, analysisFile: input.analysisFile || null,
      tracker: rows, compare: input.previous ? E.compareTracker(rows, input.previous) : null,
      planned: check.list.filter(x => x.status === 'new'), embedded: check.list.filter(x => x.status === 'embedded'),
    };
  }
  const groupName = id => R.GROUPS.find(g => g.id === id).name;
  const statusLine = v => v.ry.status === 'voluntary'
    ? `Voluntary for the ${v.ry.label} reporting year. GOV.UK says plans will become mandatory from spring 2027, subject to secondary legislation.`
    : `For the ${v.ry.label} reporting year. Whether a plan is required depends on regulations that had not been made when the rules were checked.`;

  // ---------- PDF layout helpers ----------
  async function makeDoc(PDFLib, meta) {
    const { PDFDocument, StandardFonts, rgb } = PDFLib;
    const pdfText = getReport().pdfText;
    const doc = await PDFDocument.create();
    doc.setTitle(pdfText(meta.title));
    if (meta.author) doc.setAuthor(pdfText(meta.author));
    doc.setCreator('Peak Apps Equality Action Plan');
    doc.setProducer('pdf-lib');
    doc.setLanguage('en-GB');
    const F = await doc.embedFont(StandardFonts.Helvetica), B = await doc.embedFont(StandardFonts.HelveticaBold), I = await doc.embedFont(StandardFonts.HelveticaOblique);
    const C = {
      INK: rgb(0.08, 0.08, 0.09), INK2: rgb(0.22, 0.23, 0.25), MUTED: rgb(0.4, 0.41, 0.44), RULE: rgb(0.82, 0.82, 0.8), SOFT: rgb(0.962, 0.955, 0.94),
      ACCENT: rgb(0x7b / 255, 0x2d / 255, 0x3b / 255), ACCENT_SOFT: rgb(0.972, 0.94, 0.94), MEN: rgb(0.6, 0.61, 0.64), OK: rgb(0.17, 0.42, 0.25), WARN: rgb(0.6, 0.29, 0.07), WHITE: rgb(1, 1, 1),
    };
    const L = { doc, F, B, I, C, pdfText, pages: [], page: null, y: 0 };
    L.newPage = () => { L.page = doc.addPage([W, H]); L.pages.push(L.page); L.y = H - M; return L.page; };
    L.ensure = h => { if (L.y - h < M + 30) L.newPage(); };
    L.width = (s, size, font) => (font || F).widthOfTextAtSize(pdfText(s), size);
    L.text = (s, x, y, o = {}) => {
      const f = o.bold ? B : o.italic ? I : F, size = o.size || 9.5, t = pdfText(s);
      const tw = f.widthOfTextAtSize(t, size);
      L.page.drawText(t, { x: o.right ? x - tw : o.center ? x - tw / 2 : x, y, size, font: f, color: o.color || C.INK });
      return tw;
    };
    L.wrap = (s, size, max, font) => {
      const f = font || F, out = [];
      for (const para of pdfText(s).split('\n')) {
        const words = para.split(/\s+/).filter(Boolean);
        if (!words.length) { out.push(''); continue; }
        let cur = '';
        for (const w of words) {
          const t = cur ? cur + ' ' + w : w;
          if (f.widthOfTextAtSize(t, size) > max && cur) { out.push(cur); cur = w; } else cur = t;
        }
        if (cur) out.push(cur);
      }
      return out;
    };
    L.para = (s, o = {}) => {
      const size = o.size || 9.5, lead = o.lead || size * 1.42, f = o.bold ? B : o.italic ? I : F;
      for (const line of L.wrap(s, size, o.width || CW, f)) { L.ensure(lead); if (line) L.text(line, o.x || M, L.y, { size, bold: o.bold, italic: o.italic, color: o.color }); L.y -= lead; }
    };
    L.rule = (y, c = C.RULE, t = 0.6, x0 = M, x1 = W - M) => L.page.drawLine({ start: { x: x0, y }, end: { x: x1, y }, thickness: t, color: c });
    L.h2 = (s, o = {}) => {
      L.ensure(o.keep || 60);
      L.y -= 6;
      L.text(s, M, L.y, { bold: true, size: 13 });
      L.y -= 8; L.rule(L.y, C.INK, 0.8); L.y -= 16;
    };
    L.label = (s, o = {}) => { L.text(s.toUpperCase(), o.x || M, L.y, { size: 7.5, bold: true, color: o.color || C.ACCENT }); };
    // A simple table: cols [{ w, align }], rows of strings; the first row is the head
    L.table = (cols, rows, o = {}) => {
      const size = o.size || 8.5, lead = size + 3.4;
      const xs = []; let x = M; for (const c of cols) { xs.push(x); x += c.w; }
      rows.forEach((r, ri) => {
        const head = ri === 0 && !o.noHead;
        const lines = r.map((cell, ci) => L.wrap(String(cell == null ? '' : cell), size, cols[ci].w - 8, head ? B : F));
        const h = Math.max(...lines.map(l => l.length)) * lead + 5;
        L.ensure(h + 4);
        if (head) { L.page.drawRectangle({ x: M, y: L.y - h + lead - 1, width: CW, height: h, color: C.SOFT }); }
        lines.forEach((ls, ci) => ls.forEach((ln, li) => {
          const c = cols[ci], yy = L.y - li * lead;
          if (c.align === 'right') L.text(ln, xs[ci] + c.w - 4, yy, { size, bold: head, color: head ? C.INK2 : C.INK, right: true });
          else L.text(ln, xs[ci] + 4, yy, { size, bold: head || (o.boldFirst && ci === 0), color: head ? C.INK2 : C.INK });
        }));
        L.y -= h;
        L.rule(L.y + lead - 2, C.RULE, 0.4);
      });
      L.y -= 6;
    };
    // 100% bars of women and men, one per row
    L.bars = (items, o = {}) => {
      const lw = o.labelWidth || 120, nw = 92, bw = CW - lw - nw - 10;
      for (const it of items) {
        L.ensure(22);
        const n = it.women + it.men, wW = n ? bw * it.women / n : 0;
        L.text(it.label, M, L.y - 9, { size: 8.5 });
        L.page.drawRectangle({ x: M + lw, y: L.y - 13, width: bw, height: 13, color: C.SOFT });
        if (wW > 0) L.page.drawRectangle({ x: M + lw, y: L.y - 13, width: wW, height: 13, color: C.ACCENT });
        if (bw - wW > 0 && n) L.page.drawRectangle({ x: M + lw + wW, y: L.y - 13, width: bw - wW, height: 13, color: C.MEN });
        const pct = n ? (it.women * 100 / n) : null;
        if (pct != null && wW > 38) L.text(`${pct.toFixed(1)}%`, M + lw + 5, L.y - 9.5, { size: 7.5, bold: true, color: C.WHITE });
        L.text(`${it.women} women, ${it.men} men`, W - M, L.y - 9, { size: 7.5, color: C.MUTED, right: true });
        L.y -= 19;
      }
      L.ensure(16);
      L.page.drawRectangle({ x: M + lw, y: L.y - 6, width: 8, height: 8, color: C.ACCENT }); L.text('Women', M + lw + 12, L.y - 5, { size: 7.5, color: C.MUTED });
      L.page.drawRectangle({ x: M + lw + 60, y: L.y - 6, width: 8, height: 8, color: C.MEN }); L.text('Men', M + lw + 72, L.y - 5, { size: 7.5, color: C.MUTED });
      L.y -= 16;
    };
    L.footer = (left) => {
      const t = pdfText(left);
      L.pages.forEach((p, i) => {
        p.drawLine({ start: { x: M, y: M - 12 }, end: { x: W - M, y: M - 12 }, thickness: 0.5, color: C.RULE });
        const fs = 7.5;
        let s = t; while (F.widthOfTextAtSize(s, fs) > CW - 70 && s.length > 20) s = s.slice(0, -2);
        p.drawText(s === t ? s : s + '.', { x: M, y: M - 24, size: fs, font: F, color: C.MUTED });
        const pg = `Page ${i + 1} of ${L.pages.length}`;
        p.drawText(pg, { x: W - M - F.widthOfTextAtSize(pg, fs), y: M - 24, size: fs, font: F, color: C.MUTED });
      });
    };
    return L;
  }

  function kv(L, rows, o = {}) {
    const kw = o.keyWidth || 130;
    for (const [k, v] of rows) {
      const lines = L.wrap(v, 9.5, CW - kw);
      L.ensure(13 * lines.length + 4);
      L.text(k, M, L.y, { size: 8.5, color: L.C.MUTED });
      lines.forEach((l, i) => L.text(l, M + kw, L.y - i * 13, { size: 9.5 }));
      L.y -= 13 * lines.length + 5;
    }
  }

  function figureRows(v) {
    const f = v.figures, fmt = x => (x == null ? 'not given' : E.fmt(x));
    return [
      ['Measure', 'Figure', 'Service field'],
      ['Mean gender pay gap in hourly pay', fmt(f.mh), E.FIG_FIELD.mh],
      ['Median gender pay gap in hourly pay', fmt(f.md), E.FIG_FIELD.md],
      ['Mean gender pay gap in bonus pay', fmt(f.mb), E.FIG_FIELD.mb],
      ['Median gender pay gap in bonus pay', fmt(f.db), E.FIG_FIELD.db],
      ['Men paid bonus pay', fmt(f.bm), E.FIG_FIELD.bm],
      ['Women paid bonus pay', fmt(f.bw), E.FIG_FIELD.bw],
      ['Women in the lower quartile', fmt(f.q1), E.FIG_FIELD.q1],
      ['Women in the lower middle quartile', fmt(f.q2), E.FIG_FIELD.q2],
      ['Women in the upper middle quartile', fmt(f.q3), E.FIG_FIELD.q3],
      ['Women in the upper quartile', fmt(f.q4), E.FIG_FIELD.q4],
    ];
  }

  // ---------- The sign-off pack ----------
  async function signOffPDF(PDFLib, v) {
    const employer = v.employer || 'Employer name';
    const L = await makeDoc(PDFLib, { title: `Equality action plan ${v.ry.label}: ${employer}`, author: employer });
    const { C } = L;

    // Page 1: cover and summary
    L.newPage();
    L.label('Equality action plan: sign-off pack');
    L.text(`Prepared ${v.generated}`, W - M, L.y, { size: 8, color: C.MUTED, right: true });
    L.y -= 30;
    for (const l of L.wrap(employer, 22, CW, L.B)) { L.text(l, M, L.y, { bold: true, size: 22 }); L.y -= 26; }
    L.y += 4;
    L.text(`Action plan for the ${v.ry.label} reporting year`, M, L.y, { size: 12.5, color: C.INK2 });
    L.y -= 24;
    const resp = v.check.responsible;
    kv(L, [
      ['Employer type', R.SECTORS[v.ry.sector].name],
      ['Snapshot date', v.ry.snapshot.long],
      ['Deadline', `${v.ry.deadline.long}, with the gender pay gap figures`],
      ['Status', statusLine(v)],
      ['Responsible person', resp.name ? [resp.name, resp.title].filter(Boolean).join(', ') : resp.required ? 'Not named yet (required for private and voluntary sector employers)' : 'Not required for most public authority employers'],
      ['Rules', `Checked against the GOV.UK guidance (Creating an action plan: guidance for employers). ${R.asOfLine()}.`],
    ]);
    if (v.sample) { L.y -= 2; L.para('Sample plan: a synthetic company with made-up figures, to show what the pack contains.', { size: 8.5, color: C.WARN }); }
    L.y -= 14;
    // The three rules
    const boxH = 22 + v.check.rules.length * 17;
    L.ensure(boxH + 10);
    L.page.drawRectangle({ x: M, y: L.y - boxH + 12, width: CW, height: boxH, color: C.SOFT });
    L.text('The rules in Step 2 of the guidance', M + 12, L.y, { size: 9, bold: true });
    L.y -= 18;
    for (const r of v.check.rules) {
      L.page.drawCircle({ x: M + 17, y: L.y + 3, size: 4.2, color: r.ok ? C.OK : C.WHITE, borderColor: r.ok ? C.OK : C.WARN, borderWidth: 1.2 });
      L.text(`${r.ok ? 'Met' : 'Not met'}: ${r.title.charAt(0).toLowerCase() + r.title.slice(1)}`, M + 28, L.y, { size: 9 });
      L.text(r.ok ? `${r.count}` : `${r.count} of ${r.need}`, W - M - 12, L.y, { size: 9, bold: true, right: true, color: r.ok ? C.INK : C.WARN });
      L.y -= 17;
    }
    L.y -= 10;
    // The actions at a glance
    for (const [title, items] of [['Planned actions (new or in progress)', v.planned], ['Embedded actions', v.embedded]]) {
      if (!items.length) continue;
      L.ensure(40);
      L.y -= 4;
      L.text(title, M, L.y, { size: 10.5, bold: true });
      L.y -= 7; L.rule(L.y, C.INK, 0.6); L.y -= 13;
      for (const x of items) {
        const t = v.check.texts.find(tt => tt.id === x.id);
        const lines = L.wrap(x.action.name, 9.5, CW - 90, L.B);
        L.ensure(lines.length * 12 + 22);
        lines.forEach((l, i) => L.text(l, M, L.y - i * 12, { size: 9.5, bold: true }));
        L.text(`${t.words} / ${t.limit} words`, W - M, L.y, { size: 8, color: t.over ? C.WARN : C.MUTED, right: true });
        L.y -= lines.length * 12;
        L.text(`${groupName(x.action.group)}. ${R.KIND[x.action.kind].name}.`, M, L.y, { size: 8, color: C.MUTED });
        L.y -= 15;
      }
    }

    const cover = L.page, coverY = L.y;
    const toc = [];
    // The actions in full
    L.newPage();
    toc.push(['The actions and their supporting text', L.pages.length]);
    L.h2('The actions and their supporting text');
    L.para('Each action is from the government’s list of 18. The supporting text is what will be entered on the gender pay gap service: up to 100 words, with no links. New or in progress actions say why the action was chosen and how it will be tracked; embedded actions may say how it was embedded and its results.', { size: 8.5, color: C.MUTED });
    L.y -= 8;
    for (const [title, items] of [['Planned actions', v.planned], ['Embedded actions', v.embedded]]) {
      if (!items.length) continue;
      L.ensure(70);
      L.label(title, { color: C.ACCENT }); L.y -= 16;
      for (const x of items) {
        const t = v.check.texts.find(tt => tt.id === x.id);
        L.ensure(80);
        const nameLines = L.wrap(x.action.name, 11, CW, L.B);
        nameLines.forEach(l => { L.text(l, M, L.y, { size: 11, bold: true }); L.y -= 14; });
        L.text(`${R.STATUSES[x.status].name}. ${groupName(x.action.group)}. ${R.KIND[x.action.kind].name}.`, M, L.y, { size: 8, color: C.ACCENT });
        L.y -= 13;
        L.para(`About this action: ${x.action.summary}`, { size: 8.5, color: C.MUTED });
        L.y -= 3;
        const body = x.text.trim();
        if (body) L.para(body, { size: 10, lead: 14.5 });
        else L.para(x.status === 'new' ? 'Supporting text still to be written: why this action was chosen and how it will be tracked.' : 'No supporting text (optional for embedded actions).', { size: 9.5, italic: true, color: x.status === 'new' ? C.WARN : C.MUTED });
        L.text(`${t.words} of ${t.limit} words${t.links.length ? '. Contains a link, which the service does not allow' : ''}`, M, L.y - 1, { size: 7.5, color: t.over || t.links.length ? C.WARN : C.MUTED });
        L.y -= 20;
      }
    }
    L.ensure(90);
    toc.push(['Supporting narrative', L.pages.length]);
    L.h2('Supporting narrative');
    const narr = String(v.plan.narrative || '').trim();
    if (narr) L.para(narr, { size: 10, lead: 14.5 }); else L.para('No overall narrative (optional).', { size: 9.5, italic: true, color: C.MUTED });
    L.text(`${v.check.narrative.words} of ${v.check.narrative.limit} words`, M, L.y - 1, { size: 7.5, color: v.check.narrative.over ? C.WARN : C.MUTED });
    L.y -= 20;
    if (v.check.website.url) { kv(L, [['Link on the service', v.check.website.url]]); }

    // Data appendix
    L.newPage();
    toc.push(['Data appendix: figures, diagnosis' + (v.analysis ? ', Step 1 analysis' : '') + (v.tracker.some(r => r.baseline || r.latest || r.target || r.owner || r.review) ? ', measures tracker' : ''), L.pages.length]);
    L.h2('Data appendix');
    L.para('The figures behind the choice of actions. The published figures are as entered in the builder; the diagnosis states what they show and links each pattern to the actions GOV.UK says may be useful for it. It does not estimate causes or effects.', { size: 8.5, color: C.MUTED });
    L.y -= 6;
    L.text('Published gender pay gap figures', M, L.y, { size: 10.5, bold: true }); L.y -= 14;
    L.table([{ w: 250 }, { w: 80, align: 'right' }, { w: CW - 330 }], figureRows(v), { size: 8.5 });
    const d = v.diagnosis;
    if (d.any) {
      L.ensure(60);
      L.text('What the figures show', M, L.y, { size: 10.5, bold: true }); L.y -= 15;
      for (const n of d.notes.filter(n => n.id === 'gap' || n.id === 'gap-negative')) { L.para(n.text, { size: 9 }); L.y -= 3; }
      for (const p of d.patterns) {
        L.ensure(40);
        L.para(p.text, { size: 9, bold: true });
        L.para(`Actions GOV.UK links to this: ${p.actions.map(a => a.name + (v.plan.actions[a.id] ? ' (in this plan)' : '')).join('; ')}.`, { size: 8.5, color: C.INK2, x: M + 10, width: CW - 10 });
        L.y -= 4;
      }
      for (const n of d.notes.filter(n => n.id !== 'gap' && n.id !== 'gap-negative')) { L.para(n.text, { size: 8.5, color: C.MUTED }); L.y -= 3; }
    }
    const a = v.analysis;
    if (a) {
      L.ensure(80);
      L.y -= 6;
      L.text('Step 1 analysis from the HR export', M, L.y, { size: 10.5, bold: true }); L.y -= 14;
      L.para(`${v.analysisFile ? v.analysisFile + ': ' : ''}${a.headcount.staff} current employees (${a.headcount.women} women, ${a.headcount.men} men) and ${plural(a.headcount.leavers, 'leaver')} in the 12 months from ${a.period ? longDate(new Date(a.period.from)) + ' to ' + longDate(new Date(a.period.to)) : 'the analysis period'}. Worked out in the browser; the file was not uploaded.`, { size: 8.5, color: C.MUTED });
      for (const c of a.checks || []) L.para(c, { size: 8.5, color: C.WARN });
      L.y -= 4;
      for (const s of a.sections) {
        if (!s.ok) continue;
        L.ensure(90);
        L.text(s.title, M, L.y, { size: 9.5, bold: true }); L.y -= 12;
        if (s.facts && s.facts[0]) { L.para(s.facts[0], { size: 8.5 }); }
        L.y -= 2;
        if (s.bars && (s.id === 'quartiles' || s.id === 'grades')) L.bars(s.bars.slice().reverse(), { labelWidth: 130 });
        else if (s.table) {
          const n = s.table.head.length, first = Math.min(190, CW * 0.42), rest = (CW - first) / (n - 1);
          L.table([{ w: first }].concat(Array.from({ length: n - 1 }, () => ({ w: rest, align: 'right' }))), [s.table.head].concat(s.table.rows), { size: 8 });
        }
        if (s.basis) { L.para(s.basis, { size: 7.5, color: C.MUTED }); }
        L.y -= 6;
      }
      const skipped = a.sections.filter(s => !s.ok);
      if (skipped.length) {
        L.ensure(30);
        L.para(`Not worked out: ${skipped.map(s => `${s.title.toLowerCase()} (${s.missing && s.missing.length ? 'needs ' + s.missing.join(', ').toLowerCase() : s.empty || 'no data'})`).join('; ')}.`, { size: 8, color: C.MUTED });
      }
    }
    if (v.tracker.some(r => r.baseline || r.latest || r.target || r.owner || r.review)) {
      L.ensure(80);
      L.y -= 6;
      L.text('Measures tracker', M, L.y, { size: 10.5, bold: true }); L.y -= 14;
      L.table([{ w: 140 }, { w: 130 }, { w: 55, align: 'right' }, { w: 55, align: 'right' }, { w: 55, align: 'right' }, { w: CW - 435 }],
        [['Action', 'Metric', 'Baseline', 'Latest', 'Target', 'Owner, review']].concat(v.tracker.map(r => [r.action, r.metric, r.baseline, r.latest, r.target, [r.owner, r.review].filter(Boolean).join(', ')])), { size: 7.5 });
    }

    // Approval page
    L.newPage();
    toc.push(['Approval by the responsible person', L.pages.length]);
    L.label('Approval');
    L.y -= 22;
    L.text('Approval of the equality action plan', M, L.y, { size: 16, bold: true });
    L.y -= 22;
    kv(L, [['Employer', employer], ['Reporting year', `${v.ry.label} (snapshot date ${v.ry.snapshot.long})`], ['To be submitted by', `${v.ry.deadline.long}, on the gender pay gap service`]]);
    L.y -= 8;
    if (resp.required) {
      L.para('GOV.UK: private and voluntary sector employers must include the name of a responsible person when they submit the plan. The responsible person should usually be a director, partner or senior officer. “They will be responsible for confirming that the information you have submitted is accurate.”', { size: 8.5, color: C.MUTED });
    } else {
      L.para('Most public authority employers do not need to name a responsible person on the service. This page records the plan’s internal approval.', { size: 8.5, color: C.MUTED });
    }
    L.y -= 12;
    L.para('I confirm that the information in this action plan is accurate.', { size: 11 });
    L.y -= 30;
    const line = (label, value, x0, x1) => {
      L.page.drawLine({ start: { x: x0, y: L.y }, end: { x: x1, y: L.y }, thickness: 0.7, color: C.INK });
      if (value) L.text(value, x0 + 2, L.y + 6, { size: 10.5 });
      L.text(label, x0, L.y - 12, { size: 8, color: C.MUTED });
    };
    line('Name', resp.name, M, M + CW / 2 - 14);
    line('Role or job title', resp.title, M + CW / 2 + 14, W - M);
    L.y -= 56;
    line('Signature', '', M, M + CW / 2 - 14);
    line('Date', '', M + CW / 2 + 14, W - M);
    L.y -= 46;
    L.text('Before submitting', M, L.y, { size: 10.5, bold: true });
    L.y -= 7; L.rule(L.y, C.INK, 0.6); L.y -= 15;
    const items = [
      [v.check.rulesOk, 'The three rules in Step 2 are met.'],
      [v.check.textsOk && !v.check.narrative.over && !v.check.narrative.links.length, 'Every supporting text and the narrative is inside its word limit, with no links.'],
      [!!v.check.website.url, 'The link to the page on the employer’s website is ready.'],
      [null, 'There is a plan for each separate legal entity with 250 or more employees.'],
      [null, 'The text was checked again in the gender pay gap service before submission.'],
    ];
    for (const [ok, t] of items) {
      L.ensure(16);
      L.page.drawRectangle({ x: M, y: L.y - 2, width: 9, height: 9, borderColor: C.INK2, borderWidth: 0.8 });
      if (ok) { L.page.drawLine({ start: { x: M + 1.8, y: L.y + 2.6 }, end: { x: M + 3.9, y: L.y + 0.2 }, thickness: 1.3, color: C.OK }); L.page.drawLine({ start: { x: M + 3.9, y: L.y + 0.2 }, end: { x: M + 7.6, y: L.y + 5.6 }, thickness: 1.3, color: C.OK }); }
      L.text(t, M + 16, L.y, { size: 9 });
      if (ok === false) L.text('Not yet', W - M, L.y, { size: 8.5, color: C.WARN, right: true });
      L.y -= 16;
    }
    L.y -= 8;
    L.para(`The checks above were made by the Peak Apps Equality Action Plan builder against the GOV.UK guidance. ${R.asOfLine()}. This pack is not legal advice; the employer is responsible for what it submits.`, { size: 7.5, color: C.MUTED });

    // Contents, on the cover
    {
      const page = L.page, y0 = L.y, top = M + 44 + toc.length * 15 + 21;
      if (coverY - 16 >= top) {
        L.page = cover; L.y = top;
        L.text('In this pack', M, L.y, { size: 10.5, bold: true });
        L.y -= 7; L.rule(L.y, C.INK, 0.6); L.y -= 14;
        for (const [t, n] of toc) { L.text(t, M, L.y, { size: 9 }); L.text(`page ${n}`, W - M, L.y, { size: 9, color: C.MUTED, right: true }); L.y -= 15; }
        L.page = page; L.y = y0;
      }
    }
    L.footer(`${employer}, equality action plan ${v.ry.label}. ${R.asOfLine()}. Not legal advice.`);
    return L.doc.save();
  }

  // ---------- The website plan page ----------
  const h = s => String(s == null ? '' : s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const paras = s => String(s || '').trim().split(/\n{2,}/).map(p => `<p>${h(p).replace(/\n/g, '<br>')}</p>`).join('');
  function webHTML(v) {
    const employer = v.employer || 'Our organisation';
    const title = `${employer}: equality action plan ${v.ry.label}`;
    const act = x => `<section class="action"><h3>${h(x.action.name)}</h3><p class="about">${h(x.action.summary)} <a href="${h(x.action.url)}">About this action on GOV.UK</a></p>${x.text.trim() ? paras(x.text) : ''}</section>`;
    const f = v.figures, fig = k => (f[k] == null ? '' : `<tr><th scope="row">${h(E.FIG_LABEL[k])}</th><td>${h(E.fmt(f[k]))}</td></tr>`);
    const figs = E.FIG_KEYS.map(fig).join('');
    return `<!doctype html>
<html lang="en-GB">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>${h(title)}</title>
<meta name="description" content="${h(`The actions ${employer} is taking to address its gender pay gap and support employees experiencing menopause, for the ${v.ry.label} reporting year.`)}">
<style>
  :root { color-scheme: light dark; --ink: #17181b; --muted: #5d6068; --line: #d9d8d3; --paper: #ffffff; --soft: #f6f5f1; --accent: #7b2d3b; }
  @media (prefers-color-scheme: dark) { :root { --ink: #eceef1; --muted: #a2a6ae; --line: #34363b; --paper: #141518; --soft: #1c1d21; --accent: #e6a3ae; } }
  * { box-sizing: border-box; }
  body { margin: 0; background: var(--paper); color: var(--ink); font: 17px/1.6 Georgia, "Iowan Old Style", "Times New Roman", serif; }
  main { max-width: 760px; margin: 0 auto; padding: 48px 20px 64px; }
  h1, h2, h3 { font-family: system-ui, -apple-system, "Segoe UI", sans-serif; line-height: 1.2; letter-spacing: -0.01em; }
  h1 { font-size: 34px; margin: 0 0 10px; }
  h2 { font-size: 22px; margin: 44px 0 12px; padding-bottom: 8px; border-bottom: 1px solid var(--line); }
  h3 { font-size: 18px; margin: 0 0 6px; }
  .lede { color: var(--muted); margin: 0 0 8px; }
  .action { padding: 18px 0; border-bottom: 1px solid var(--line); }
  .about { font: 14.5px/1.5 system-ui, -apple-system, "Segoe UI", sans-serif; color: var(--muted); margin: 0 0 8px; }
  a { color: var(--accent); }
  table { width: 100%; border-collapse: collapse; font: 15px/1.4 system-ui, -apple-system, "Segoe UI", sans-serif; }
  th, td { text-align: left; padding: 8px 10px; border-bottom: 1px solid var(--line); }
  td { text-align: right; font-variant-numeric: tabular-nums; white-space: nowrap; }
  .note { font: 13.5px/1.5 system-ui, -apple-system, "Segoe UI", sans-serif; color: var(--muted); margin-top: 36px; }
  @media print { body { font-size: 12pt; } main { padding: 0; } a { color: inherit; } }
</style>
</head>
<body>
<main>
  <h1>${h(employer)}: equality action plan</h1>
  <p class="lede">${h(`For the ${v.ry.label} reporting year, alongside our gender pay gap figures for the snapshot date of ${v.ry.snapshot.long}. Published ${v.generated}.`)}</p>
  <h2>Introduction</h2>
  <p>This plan shows the steps we are taking to address our gender pay gap and to support employees experiencing menopause. We chose the actions from the government’s list of evidence-informed actions. ${v.ry.status === 'voluntary' ? 'Action plans are voluntary for the 2026 to 2027 reporting year.' : ''}</p>
  ${String(v.plan.narrative || '').trim() ? paras(v.plan.narrative) : ''}
  ${v.planned.length ? `<h2>Planned actions</h2>\n  <p>Actions we are working on for the first time, or building on, in the ${h(v.ry.label)} reporting year.</p>\n  ${v.planned.map(act).join('\n  ')}` : ''}
  ${v.embedded.length ? `<h2>Embedded actions</h2>\n  <p>Actions that are already an established part of how we work.</p>\n  ${v.embedded.map(act).join('\n  ')}` : ''}
  ${figs ? `<h2>Our gender pay gap figures</h2>\n  <table><tbody>${figs}</tbody></table>` : ''}
  <p class="note">The actions are from the government’s <a href="https://www.gov.uk/government/collections/action-plans-list-of-actions">list of actions</a>. This plan is also published on the <a href="https://gender-pay-gap.service.gov.uk/">gender pay gap service</a>.</p>
</main>
</body>
</html>
`;
  }

  async function webPDF(PDFLib, v) {
    const employer = v.employer || 'Our organisation';
    const L = await makeDoc(PDFLib, { title: `${employer}: equality action plan ${v.ry.label}`, author: employer });
    const { C } = L;
    L.newPage();
    L.label('Equality action plan');
    L.y -= 28;
    for (const l of L.wrap(employer, 22, CW, L.B)) { L.text(l, M, L.y, { bold: true, size: 22 }); L.y -= 26; }
    L.para(`For the ${v.ry.label} reporting year, alongside our gender pay gap figures for the snapshot date of ${v.ry.snapshot.long}. Published ${v.generated}.`, { size: 10, color: C.MUTED });
    L.h2('Introduction');
    L.para(`This plan shows the steps we are taking to address our gender pay gap and to support employees experiencing menopause. We chose the actions from the government’s list of evidence-informed actions.${v.ry.status === 'voluntary' ? ' Action plans are voluntary for the 2026 to 2027 reporting year.' : ''}`, { size: 10.5, lead: 15 });
    const narr = String(v.plan.narrative || '').trim();
    if (narr) { L.y -= 4; L.para(narr, { size: 10.5, lead: 15 }); }
    for (const [title, intro, items] of [['Planned actions', `Actions we are working on for the first time, or building on, in the ${v.ry.label} reporting year.`, v.planned], ['Embedded actions', 'Actions that are already an established part of how we work.', v.embedded]]) {
      if (!items.length) continue;
      L.h2(title);
      L.para(intro, { size: 9.5, color: C.MUTED });
      L.y -= 6;
      for (const x of items) {
        L.ensure(70);
        L.para(x.action.name, { size: 11.5, bold: true, lead: 15 });
        L.para(x.action.summary, { size: 9, color: C.MUTED });
        L.y -= 2;
        if (x.text.trim()) L.para(x.text.trim(), { size: 10.5, lead: 15 });
        L.y -= 12;
      }
    }
    const figs = E.FIG_KEYS.filter(k => v.figures[k] != null);
    if (figs.length) {
      L.h2('Our gender pay gap figures');
      L.table([{ w: CW - 100 }, { w: 100, align: 'right' }], figs.map(k => [E.FIG_LABEL[k], E.fmt(v.figures[k])]), { size: 9.5, noHead: true });
    }
    L.y -= 6;
    L.para('The actions are from the government’s list of actions (gov.uk/government/collections/action-plans-list-of-actions). This plan is also published on the gender pay gap service.', { size: 8.5, color: C.MUTED });
    L.footer(`${employer}, equality action plan ${v.ry.label}.`);
    return L.doc.save();
  }

  // ---------- The measures tracker PDF ----------
  async function trackerPDF(PDFLib, v) {
    const employer = v.employer || 'Employer name';
    const L = await makeDoc(PDFLib, { title: `Measures tracker ${v.ry.label}: ${employer}`, author: employer });
    const { C } = L;
    L.newPage();
    L.label('Measures tracker');
    L.text(`Prepared ${v.generated}`, W - M, L.y, { size: 8, color: C.MUTED, right: true });
    L.y -= 26;
    L.text(employer, M, L.y, { size: 18, bold: true }); L.y -= 20;
    L.para(`Equality action plan, ${v.ry.label} reporting year. GOV.UK Step 5: record each action’s metrics before you start it (the baseline), then measure at regular intervals with the same analysis. Step 6: once plans are mandatory, the plan is reviewed every reporting year.`, { size: 9, color: C.MUTED });
    L.y -= 8;
    for (const r of v.tracker) {
      const cmp = v.compare && v.compare.rows.find(x => x.current.id === r.id);
      L.ensure(96);
      L.para(r.action, { size: 10.5, bold: true, lead: 14 });
      L.text(`${r.status}`, M, L.y, { size: 8, color: C.ACCENT }); L.y -= 13;
      kv(L, [
        ['Metric', r.metric || 'Not set'],
        ['Baseline', r.baseline || 'Not recorded'],
        ['Latest', r.latest || 'Not measured yet'],
        ['Target', r.target || 'Not set'],
        ['Owner', r.owner || 'Not set'],
        ['Review date', r.review || 'Not set'],
      ].concat(r.notes ? [['Notes', r.notes]] : []).concat(cmp && cmp.previous ? [['Last year', `${cmp.previous.year || 'Previous file'}: baseline ${cmp.previous.baseline || 'n/a'}, latest ${cmp.previous.latest || 'n/a'}, target ${cmp.previous.target || 'n/a'}. ${cmp.change == null ? 'No change worked out (different or missing values).' : `Change since last year’s ${cmp.against}: ${cmp.change > 0 ? '+' : ''}${cmp.change}${cmp.unit === '%' ? ' points' : cmp.unit ? ' ' + cmp.unit : ''}.`}`]] : []), { keyWidth: 90 });
      L.y -= 4; L.rule(L.y + 6, C.RULE, 0.4); L.y -= 8;
    }
    if (v.compare && v.compare.dropped.length) {
      L.ensure(40);
      L.para(`In last year’s file but not in this plan: ${v.compare.dropped.map(d => d.action || d.id).join('; ')}. GOV.UK Step 6: you must be working on at least 2 actions at any time, so add a new action if you remove one.`, { size: 8.5, color: C.WARN });
    }
    if (!v.tracker.length) L.para('No actions in the plan yet.', { size: 10, color: C.MUTED });
    L.footer(`${employer}, measures tracker ${v.ry.label}. ${R.asOfLine()}.`);
    return L.doc.save();
  }

  // ---------- The staff consultation kit ----------
  // Questions drawn from the GOV.UK action pages (adjustments, risk assessment, support groups, occupational health) and
  // Acas, Menopause at work (Supporting workers; Talking with workers). Anonymous: no names, and groups only where large.
  const SURVEY = [
    { id: 'aware', type: 'one', q: 'Do you know what support for menopause our organisation offers?', options: ['Yes', 'Partly', 'No'] },
    { id: 'affected', type: 'one', q: 'Have menopause symptoms affected your work, now or in the past?', options: ['Yes, often', 'Sometimes', 'No', 'Prefer not to say'] },
    { id: 'helps', type: 'many', q: 'Which of these would help you, or would have helped?', options: ['Flexible start and finish times', 'Breaks when needed', 'A private area to rest', 'Working from home when practical', 'Time off on a day you cannot carry on working', 'Changes to some duties', 'Control over your working environment, such as a fan or a window that opens', 'A cooler or more comfortable uniform', 'Easy access to toilets', 'Cold drinking water', 'Occupational health advice', 'A support group or network', 'A manager trained to talk about menopause', 'Someone other than your manager to talk to'] },
    { id: 'harder', type: 'many', q: 'Does anything at work make symptoms harder to manage?', options: ['Temperature or ventilation', 'Uniform', 'Nowhere suitable to rest', 'Toilets hard to get to', 'No cold drinking water', 'Long shifts', 'Little flexibility in the job', 'Nothing'] },
    { id: 'talk', type: 'one', q: 'Would you feel comfortable talking to your manager about how menopause affects you at work?', options: ['Yes', 'Not sure', 'No'] },
    { id: 'why', type: 'many', q: 'If not, why not?', options: ['It feels private', 'It would be embarrassing', 'I do not know my manager well enough', 'I am not sure my manager would be sympathetic', 'I would not be taken seriously', 'Worries about confidentiality', 'I would be seen as less able to do my job', 'Worries about job security or promotion'] },
    { id: 'other', type: 'many', q: 'Who else would you be comfortable talking to?', options: ['Someone in HR', 'A trade union representative', 'An employee assistance counsellor', 'A menopause or wellbeing champion', 'Nobody at work'] },
    { id: 'age', type: 'one', q: 'Your age group (optional)', options: ['Under 40', '40 to 60', 'Over 60', 'Prefer not to say'] },
    { id: 'change', type: 'text', q: 'What one change would help most? Please leave out anything that could identify you.' },
  ];
  const FOCUS = [
    { h: 'Before the session', items: ['Invite a range of staff, managers and employee networks, and say the session is about workplace support, not anyone’s health.', 'Agree with the group that what is said stays in the room, and that nobody is asked about their own symptoms.', 'Record themes, not names or anything that could identify someone. Agree who will see the notes.', 'If you collect any health information, get advice from your data protection lead first: it is special category personal data.'] },
    { h: 'Questions', items: ['What support for menopause do people know about here, and how did they find out?', 'What about the work itself, such as shifts, uniform, temperature or breaks, makes symptoms harder to manage?', 'Which changes would make the most difference, and in which teams or roles?', 'How would people prefer to raise it: with their manager, HR, a union representative or a champion?', 'What should managers know, and how should they respond to a request?', 'How will we know whether a change is working?'] },
    { h: 'After the session', items: ['Share a short summary of the themes with the group, and what you will do next.', 'Feed the themes into the choice of menopause actions and their supporting text.', 'Repeat the survey before, during and after the actions, with the same questions, so the results compare.'] },
  ];
  const SOURCES_KIT = 'Sources: GOV.UK, Step 1. Understand the issues in your organisation, and the action pages Offer workplace adjustments, Conduct a menopause risk assessment, Set up menopause support groups and networks and Offer occupational health advice for employees experiencing menopause; Acas, Menopause at work: Supporting workers and Talking with workers (updated 7 April 2026).';
  function surveyText() {
    const L = ['Anonymous survey: support for menopause at work', '', 'This survey is anonymous. Please do not write your name or anything that could identify you. Answers help us choose and check the support we offer.', ''];
    SURVEY.forEach((s, i) => {
      L.push(`${i + 1}. ${s.q}${s.type === 'many' ? ' (choose any)' : ''}`);
      if (s.options) s.options.forEach(o => L.push(`   [ ] ${o}`)); else L.push('   ______________________________________________');
      L.push('');
    });
    L.push(SOURCES_KIT);
    return L.join('\n') + '\n';
  }
  function focusText() {
    const L = ['Focus group guide: support for menopause at work', ''];
    for (const b of FOCUS) { L.push(b.h); b.items.forEach((x, i) => L.push(`${i + 1}. ${x}`)); L.push(''); }
    L.push(SOURCES_KIT);
    return L.join('\n') + '\n';
  }
  const csvCell = v => { const s = v == null ? '' : String(v); return /[",\n\r]/.test(s) || (/^[=+\-@\t]/.test(s) && !/^-?\d/.test(s)) ? '"' + s.replace(/"/g, '""') + '"' : s; };
  function responsesCSV(responses) {
    const head = ['Response'].concat(SURVEY.map(s => s.q));
    const rows = responses.map((r, i) => [i + 1].concat(SURVEY.map(s => { const v = r[s.id]; return Array.isArray(v) ? v.join('; ') : v || ''; })));
    return '﻿' + [head].concat(rows).map(r => r.map(csvCell).join(',')).join('\r\n') + '\r\n';
  }
  function tally(responses) {
    return SURVEY.filter(s => s.options).map(s => ({
      id: s.id, q: s.q, n: responses.filter(r => s.type === 'many' ? (r[s.id] || []).length : r[s.id]).length,
      counts: s.options.map(o => ({ option: o, count: responses.filter(r => s.type === 'many' ? (r[s.id] || []).includes(o) : r[s.id] === o).length })),
    }));
  }

  // The survey on paper, and the focus group guide
  async function consultPDF(PDFLib, v) {
    const employer = v && v.employer ? v.employer : '';
    const L = await makeDoc(PDFLib, { title: 'Staff consultation kit: support for menopause at work', author: employer || 'Peak Apps' });
    const { C } = L;
    L.newPage();
    L.label('Anonymous survey');
    L.y -= 24;
    L.text('Support for menopause at work', M, L.y, { size: 17, bold: true }); L.y -= 20;
    L.para(`${employer ? employer + ' wants' : 'We want'} to understand how menopause may affect people at work and which support would help. This survey is anonymous: please do not write your name or anything that could identify you.`, { size: 9.5, color: C.INK2 });
    L.y -= 8;
    SURVEY.forEach((s, i) => {
      const h = s.options ? 18 + Math.ceil(s.options.length / 2) * 14 : 70;
      L.ensure(Math.min(h, 140));
      L.para(`${i + 1}. ${s.q}${s.type === 'many' ? ' (tick any)' : s.type === 'one' ? ' (tick one)' : ''}`, { size: 10, bold: true });
      L.y -= 2;
      if (s.options) {
        const colW = CW / 2;
        for (let k = 0; k < s.options.length; k += 2) {
          const cells = [s.options[k], s.options[k + 1]].filter(o => o != null).map(o => L.wrap(o, 9, colW - 24));
          const rowH = Math.max(...cells.map(c => c.length)) * 11 + 5;
          L.ensure(rowH);
          cells.forEach((lines, col) => {
            const x = M + 4 + col * colW;
            L.page.drawRectangle({ x, y: L.y - 2, width: 8, height: 8, borderColor: C.INK2, borderWidth: 0.7 });
            lines.forEach((l, j) => L.text(l, x + 14, L.y - j * 11, { size: 9 }));
          });
          L.y -= rowH;
        }
      } else {
        for (let k = 0; k < 3; k++) { L.y -= 18; L.rule(L.y, C.RULE, 0.6); }
        L.y -= 6;
      }
      L.y -= 8;
    });
    L.newPage();
    L.label('Focus group guide');
    L.y -= 24;
    L.text('Talking about support for menopause at work', M, L.y, { size: 17, bold: true }); L.y -= 22;
    for (const b of FOCUS) {
      L.ensure(60);
      L.text(b.h, M, L.y, { size: 11, bold: true }); L.y -= 7; L.rule(L.y, C.INK, 0.6); L.y -= 14;
      b.items.forEach((x, i) => { const lines = L.wrap(x, 9.5, CW - 18); L.ensure(lines.length * 13.5 + 4); L.text(`${i + 1}.`, M, L.y, { size: 9.5, color: C.ACCENT }); lines.forEach((l, j) => L.text(l, M + 18, L.y - j * 13.5, { size: 9.5 })); L.y -= lines.length * 13.5 + 5; });
      L.y -= 8;
    }
    L.para(SOURCES_KIT, { size: 7.5, color: C.MUTED });
    L.footer('Staff consultation kit: support for menopause at work. Anonymous.');
    return L.doc.save();
  }

  return { view, signOffPDF, webHTML, webPDF, trackerPDF, consultPDF, SURVEY, FOCUS, surveyText, focusText, responsesCSV, tally, figureRows };
});
