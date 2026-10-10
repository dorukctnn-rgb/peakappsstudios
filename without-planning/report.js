/* Without Planning (Pro): the PDF report and the next-step pack.
 * Pure functions over the engine's result; pdf-lib is passed in (loaded only when a Pro user asks for the PDF).
 * The PDF, the text download and the page all read the same result, so they always agree.
 * Works in the browser (window.WPReport) and in Node for the tests. */
(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory();
  else root.WPReport = factory();
})(typeof self !== 'undefined' ? self : this, function () {
  'use strict';

  // Standard PDF fonts use WinAnsi: keep its characters (’ “ ” € £ ² ³ ×), replace anything else.
  const WIN = '€‚ƒ„…†‡ˆ‰Š‹ŒŽ‘’“”•–—˜™š›œžŸ';
  const MAP = { '≤': '<=', '≥': '>=', '→': 'to', '−': '-', ' ': ' ', ' ': ' ', ' ': ' ' };
  const safe = s => String(s == null ? '' : s).replace(/[\s\S]/g, c => {
    const n = c.charCodeAt(0);
    if (c === '\n' || (n >= 32 && n < 127) || (n >= 0xa0 && n <= 0xff) || WIN.includes(c)) return c;
    return MAP[c] != null ? MAP[c] : '';
  });
  const STATUS = { pass: 'Pass', fail: 'Fail', check: 'Check', info: 'Applies' };
  const longDate = (iso, R) => { const [y, m, d] = iso.split('-').map(Number); return `${d} ${R.MONTHS[m - 1]} ${y}`; };
  const fmt = (E, x) => E.fmt(Math.round(x * 100) / 100);

  // ---------- What the project is, in words (for letters and the notice) ----------
  function describe(model, E) {
    const p = model.p, k = model.kind, f = x => fmt(E, Number(x) || 0);
    const storeys = Number(p.storeys) > 1 ? 'two-storey' : 'single-storey';
    const roof = p.roof === 'flat' || p.roof === 'other' ? 'a flat roof' : p.roof === 'pitched-tiled' ? 'a tiled or slated pitched roof' : p.roof === 'dual' ? 'a dual-pitched roof' : p.roof === 'hipped' ? 'a hipped roof' : p.roof === 'mono' ? 'a mono-pitch roof' : 'a pitched roof';
    switch (k) {
      case 'en-rear': return `A ${storeys} rear extension projecting ${f(p.depth)} m beyond the rear wall, ${f(p.width)} m wide, ${f(p.height)} m high with eaves at ${f(p.eaves)} m and ${roof}${p.materials === 'match' ? ', in materials to match the house' : ''}.`;
      case 'en-side': return `A ${storeys} side extension on the ${p.side} side, coming out ${f(p.width)} m from the side wall and ${f(p.depth)} m long, set back ${f(p.setback)} m from the front wall, ${f(p.height)} m high with eaves at ${f(p.eaves)} m and ${roof}.`;
      case 'en-out': return `A detached single-storey ${({ office: 'garden room for use as a home office', gym: 'garden room for use as a gym', hobby: 'garden room for use as a hobby room', store: 'store', garage: 'garage' })[p.use] || 'outbuilding'} in the ${p.location === 'side' ? 'side' : 'rear'} garden, ${f(p.width)} m by ${f(p.depth)} m, ${f(p.height)} m high with eaves at ${f(p.eaves)} m and ${roof}, ${f(p.x)} m from the left boundary and ${f(p.y)} m from the rear boundary.`;
      case 'en-ashp': return `An air source heat pump (${p.use === 'both' ? 'heating and cooling' : p.use === 'cooling' ? 'cooling only' : 'heating'}), outdoor unit ${f(p.w)} m by ${f(p.d)} m by ${f(p.h)} m, ${p.mount === 'ground' ? 'on the ground' : p.mount === 'wall' ? 'on a wall' : 'on a roof'} ${p.place === 'front' ? 'in front of' : p.place === 'side' ? 'beside' : 'behind'} the house.`;
      case 'ie-ext': return `A ${storeys} extension to the rear of the house, projecting ${f(p.depth)} m and ${f(p.width)} m wide (${f((Number(p.depth) || 0) * (Number(p.width) || 0) * (Number(p.storeys) > 1 ? 2 : 1))} m² of floor area), walls ${f(p.walls)} m high and ${f(p.height)} m to the top, with ${roof}.`;
      case 'ie-shed': return `A ${({ office: 'garden room for use as a home office', gym: 'garden room for use as a gym', hobby: 'garden room', store: 'shed', garage: 'garage' })[p.use] || 'garden structure'} in the ${p.location === 'side' ? 'side' : 'rear'} garden, ${f(p.width)} m by ${f(p.depth)} m (${f((Number(p.width) || 0) * (Number(p.depth) || 0))} m²), ${f(p.height)} m high, with ${roof}.`;
      case 'ie-dad': return `A detached auxiliary dwelling in the rear garden of the principal house, ${f(p.width)} m by ${f(p.depth)} m (${f((Number(p.width) || 0) * (Number(p.depth) || 0))} m²), ${f(p.height)} m high, with ${roof}, served through the main house’s connections.`;
      case 'ie-hp': return `An air source heat pump, outdoor unit ${f(p.w)} m by ${f(p.d)} m by ${f(p.h)} m, ${p.mount === 'ground' ? 'on the ground' : p.mount === 'wall' ? 'on a wall' : 'on a roof'} ${p.place === 'front' ? 'in front of' : p.place === 'side' ? 'beside' : 'behind'} the house.`;
      case 'ie-split': return `The subdivision of the house into ${Number(p.units) || 2} self-contained homes of ${f(p.area1)} m² and ${f(p.area2)} m², within the existing building.`;
    }
    return '';
  }
  const SI = { 'ie-ext': 'S.I. No. 338 of 2026', 'ie-shed': 'S.I. No. 338 of 2026', 'ie-dad': 'S.I. No. 340 of 2026', 'ie-hp': 'S.I. No. 342 of 2026', 'ie-split': 'S.I. No. 339 of 2026' };
  const CLASS_LONG = { 'en-rear': 'Class A of Part 1', 'en-side': 'Class A of Part 1', 'en-out': 'Class E of Part 1', 'en-ashp': 'Class G of Part 14' };

  // ---------- The next-step pack, as data: the PDF and the text file both print it ----------
  function packs({ model, result, E }) {
    const R = E.RULES[model.j], L = R.LIMITS;
    const out = [];
    const by = id => result.results.filter(r => r.id === id);
    const tick = ids => {
      const rows = [].concat(...ids.map(by));
      if (!rows.length) return 'not checked';
      if (rows.some(r => r.status === 'fail')) return 'does not meet this as entered';
      if (rows.some(r => r.status === 'check')) return 'needs a check';
      return 'meets this as entered';
    };
    const desc = describe(model, E);
    if (model.j === 'en') {
      const prior = result.route === 'prior';
      if (prior) {
        const depth = result.results.find(r => r.id === 'en.a.depth1');
        out.push({ kind: 'letter', title: 'Notification of a larger home extension (paragraph A.4)', paras: [
          '[Your name]\n[Your address]\n[Date]', 'To the planning department, [council name]',
          'Notification of a proposed larger home extension under paragraph A.4 of Class A of Part 1 of Schedule 2 to the Town and Country Planning (General Permitted Development) (England) Order 2015',
          'Site: [address of the property]',
          `Proposal: ${desc}`,
          `Written description under paragraph A.4(2)(a): the enlarged part extends ${depth ? depth.value.replace(/ beyond the rear wall.*$/, '') : fmt(E, Number(model.p.depth) || 0) + ' m'} beyond the rear wall of the original house; its maximum height is ${fmt(E, Number(model.p.height) || 0)} m; the height of its eaves is ${fmt(E, Number(model.p.eaves) || 0)} m.${model.existing && model.existing.joins !== 'no' && model.screen.previous === 'yes' ? ' These figures are for the total enlargement, with the existing extension it joins.' : ''}`,
          'Enclosed: a plan indicating the site and showing the proposed development; the addresses of the adjoining premises; my contact address and email address; the fee of £249.',
          'Yours faithfully,\n[Name]',
        ] });
        out.push({ kind: 'checklist', title: 'Larger home extension: prior approval checklist', items: [
          { text: 'Written description: depth beyond the rear wall, maximum height and eaves height, for the total enlargement if it joins an earlier one (A.4(2)(a)).' },
          { text: 'A plan indicating the site and showing the proposed development, and any existing enlargement it joins (A.4(2)(b)). The plan in this report can be used.' },
          { text: 'The addresses of any adjoining premises (A.4(2)(c)).' },
          { text: 'Your contact address (A.4(2)(d)), and your email address if you are content to receive communications electronically (A.4(2)(e)).' },
          { text: `The fee: £${L.fees.priorApproval} from 1 April 2026 (Fees Regulations 2012, regulations 14(1)(zab) and 18A).` },
          { text: 'The council serves notice on each adjoining owner or occupier, giving at least 21 days for representations (A.4(5)).' },
          { text: 'Do not start until you have the council’s written notice that prior approval is not required, or is given, or 42 days have passed without a decision (A.4(10)).' },
          { text: 'Build it as described, or as approved (A.4(11)).' },
        ] });
      }
      out.push({ kind: 'letter', title: 'Lawful development certificate (proposed): cover letter', paras: [
        '[Your name]\n[Your address]\n[Date]', 'To the planning department, [council name]',
        'Application for a lawful development certificate for a proposed development under section 192 of the Town and Country Planning Act 1990',
        'Site: [address of the property]',
        `Proposal: ${desc}`,
        `I ask for a certificate that the proposal would be lawful because it is permitted development under ${CLASS_LONG[model.kind]} of Schedule 2 to the Town and Country Planning (General Permitted Development) (England) Order 2015.${prior ? ' It relies on paragraph A.1(g) and the prior approval process in paragraph A.4.' : ''} The enclosed report lists each limitation and condition of that class, with the figures of the proposal against each, and a dimensioned plan and elevations.`,
        `Enclosed: the completed application form; a site location plan to an identified scale showing the direction of North; the drawings and the report; a statement of my interest in the land; the fee of £${L.fees.ldcProposed}.`,
        'Yours faithfully,\n[Name]',
      ] });
      out.push({ kind: 'checklist', title: 'Lawful development certificate: document checklist', items: [
        { text: 'The application on the form published by the Secretary of State, describing the land and the operations (DMPO 2015, article 39(1)).' },
        { text: 'A plan identifying the land, drawn to an identified scale and showing the direction of North (article 39(2)(a)).' },
        { text: 'The evidence verifying the application: the drawings and this report (article 39(2)(b)).' },
        { text: 'A statement of your interest in the land, naming anyone else with an interest and whether they have been told (article 39(2)(c)).' },
        { text: 'A precise description of what is applied for, not just the class (Planning Practice Guidance).' },
        { text: `The fee: half the planning application fee, so £${L.fees.ldcProposed} for householder works from 1 April 2026 (Fees Regulations 2012, regulation 11(3)(c)).` },
        { text: 'The council must decide within 8 weeks of a valid application, unless you agree longer in writing (article 39(10)).' },
      ] });
    } else {
      const S = R.SECTION5;
      if (model.kind === 'ie-dad' || model.kind === 'ie-split') {
        const cls = model.kind === 'ie-dad' ? '3A' : '1A';
        const ids3A = [['ie.c3a.period'], ['ie.c3a.occupancy'], [], ['ie.c3a.temporary'], ['ie.c3a.height'], ['ie.c3a.area'], ['ie.c3a.split'], ['ie.c3a.open'], ['ie.c3a.access'], ['ie.c3a.utilities'], ['ie.c3a.wastewater'], ['ie.c3a.gap'], ['ie.c3a.windows'], ['ie.c3a.letting'], ['ie.c3a.owner']];
        const ids1A = [['ie.c1a.period'], [], ['ie.c1a.units', 'ie.c1a.size'], ['ie.c1a.self'], ['ie.c1a.dad']];
        const ids = cls === '3A' ? ids3A : ids1A;
        const allMet = result.counts.fail === 0 && result.counts.check === 0;
        out.push({ kind: 'notice', title: `Class ${cls}: the 14-day notification (content of Appendix I, Circular PLR 02/2026)`, intro: 'Copy this onto your council’s own notification form. The suggested template in Appendix I of Circular PLR 02/2026 has these fields.', fields: [
          ['Notification to', '[Planning authority]'],
          ['Exemption', R.NOTICE.classes[cls]],
          ['1. Location of the proposed development', '[Address of the property]'],
          ['Eircode', '[Eircode]'],
          ['2. Date notification received', '[Filled in by the council]'],
          ['Proposed date of commencement of works', model.p.start || '[Date, at least 14 days after the notice]'],
          ['3. Exemption being notified (1A or 3A)', cls],
          ['Does the site and proposed development meet all requirements set out in the Regulations (Yes or No)', allMet ? 'Yes' : 'Not yet: the checklist below shows what is open'],
          ['Reason for intended use', '[In your words, for example: a home for a parent near family]'],
        ], footnote: R.NOTICE.footnote, checklist: R.NOTICE.checklist[cls].map((text, i) => ({ text, status: ids[i] && ids[i].length ? tick(ids[i]) : 'a building control matter, not checked here' })) });
      }
      out.push({ kind: 'letter', title: 'Section 5 declaration: cover letter', paras: [
        '[Your name]\n[Your address]\n[Date]', 'To the planning department, [council name]',
        'Request for a declaration under section 5 of the Planning and Development Act 2000',
        'Site: [address of the property], Eircode [Eircode]',
        `Question: whether the following is or is not exempted development: ${desc}`,
        `I consider it exempted development under Class ${E.PROJECTS[model.kind].cls.replace(/^Class /, '')} of Part 1 of Schedule 2 to the Planning and Development Regulations 2001, as amended by ${SI[model.kind]}, and that none of the restrictions in article 9 applies. The enclosed report lists each condition and limitation, with the figures of the proposal against each, and a dimensioned plan and elevations.`,
        'Enclosed: the council’s section 5 form; the fee of €80; a site location map with the site boundary in red; a scaled site layout plan and elevations of the existing and proposed works; this report.',
        'Yours faithfully,\n[Name]',
      ] });
      out.push({ kind: 'checklist', title: 'Section 5 declaration: checklist', items: [
        { text: `${S.who.text} (${S.who.ref}).` },
        { text: `${S.fee.text} (${S.fee.ref}).` },
        { text: `${S.docs.text}` },
        { text: `${S.time.text} (${S.time.ref}).` },
        { text: `${S.review.text} (${S.review.ref}).` },
      ] });
    }
    return out;
  }

  function packText(ctx) {
    const { model, result, E } = ctx;
    const R = E.RULES[model.j];
    const lines = [];
    lines.push(`WITHOUT PLANNING: NEXT-STEP PACK`, `${E.PROJECTS[model.kind].name}, ${R.name}, ${E.PROJECTS[model.kind].cls}`, `Rules as of ${R.RULES_AS_OF} (rule set ${R.RULES_VERSION}). Not a formal decision.`, '');
    lines.push(`Verdict: ${result.verdict.title}. ${result.verdict.text}`, '');
    for (const p of packs(ctx)) {
      lines.push('='.repeat(72), p.title.toUpperCase(), '='.repeat(72), '');
      if (p.intro) lines.push(p.intro, '');
      if (p.paras) p.paras.forEach(t => lines.push(t, ''));
      if (p.fields) { p.fields.forEach(([k, v]) => lines.push(`${k}: ${v}`)); lines.push('', `Note: ${p.footnote}`, ''); }
      if (p.checklist) { lines.push('Checklist for compliance (tick on the council’s form):'); p.checklist.forEach((c, i) => lines.push(`[ ] ${i + 1}. ${c.text}`, `      This project: ${c.status}.`)); lines.push(''); }
      if (p.items) { p.items.forEach((c, i) => lines.push(`[ ] ${i + 1}. ${c.text}`)); lines.push(''); }
    }
    lines.push('Made with Without Planning, https://peakappsstudio.com/without-planning/ . Check every figure before you send anything.');
    return lines.join('\r\n') + '\r\n';
  }

  // ---------- PDF ----------
  async function pdf(PDFLib, ctx) {
    const { model, result, E, shots = [] } = ctx;
    const { PDFDocument, StandardFonts, rgb } = PDFLib;
    const R = E.RULES[model.j];
    const P = result.plan;
    const doc = await PDFDocument.create();
    doc.setTitle(safe(`Planning check: ${E.PROJECTS[model.kind].name}, ${R.name}`));
    doc.setAuthor('Without Planning (Peak Apps Studio)');
    doc.setSubject(safe(`Rules as of ${R.RULES_AS_OF}, rule set ${R.RULES_VERSION}`));
    doc.setCreator('Without Planning, peakappsstudio.com/without-planning/');
    doc.setProducer('pdf-lib');
    const F = await doc.embedFont(StandardFonts.Helvetica), B = await doc.embedFont(StandardFonts.HelveticaBold);
    const C = { ink: rgb(0.118, 0.153, 0.192), muted: rgb(0.357, 0.4, 0.447), line: rgb(0.8, 0.83, 0.86), film: rgb(0.93, 0.945, 0.96), red: rgb(0.851, 0.149, 0.169), blue: rgb(0.122, 0.282, 0.78), green: rgb(0.141, 0.451, 0.227), amber: rgb(0.541, 0.333, 0), brick: rgb(0.706, 0.333, 0.227), grey: rgb(0.78, 0.8, 0.83), white: rgb(1, 1, 1), lawn: rgb(0.85, 0.93, 0.85) };
    const W = 595.28, H = 841.89, M = 48;
    const pages = [];
    let page, y;
    const footer = pg => {
      pg.drawLine({ start: { x: M, y: 40 }, end: { x: W - M, y: 40 }, thickness: 0.5, color: C.line });
      pg.drawText(safe(`Without Planning. Rules as of ${R.RULES_AS_OF}, rule set ${R.RULES_VERSION}. Not a formal decision: ${model.j === 'en' ? 'a lawful development certificate is.' : 'a section 5 declaration is.'}`), { x: M, y: 28, size: 7.5, font: F, color: C.muted });
    };
    const newPage = () => { page = doc.addPage([W, H]); pages.push(page); y = H - M; footer(page); return page; };
    const wrap = (text, font, size, width) => {
      const out = [];
      for (const para of safe(text).split('\n')) {
        const words = para.split(/\s+/).filter(Boolean);
        let line = '';
        for (const w of words) {
          const t = line ? line + ' ' + w : w;
          if (font.widthOfTextAtSize(t, size) <= width) line = t;
          else { if (line) out.push(line); line = w; while (font.widthOfTextAtSize(line, size) > width && line.length > 4) { let i = line.length - 1; while (i > 1 && font.widthOfTextAtSize(line.slice(0, i), size) > width) i--; out.push(line.slice(0, i)); line = line.slice(i); } }
        }
        out.push(line);
      }
      return out;
    };
    const text = (t, o = {}) => {
      const size = o.size || 10, font = o.bold ? B : F, lh = o.lh || size * 1.38, width = o.width || W - 2 * M, x = o.x || M;
      for (const ln of wrap(t, font, size, width)) {
        if (y - lh < 56) { newPage(); }
        page.drawText(ln, { x, y: y - size, size, font, color: o.color || C.ink });
        y -= lh;
      }
      y -= o.after != null ? o.after : 4;
    };
    const heading = (t, size = 16) => { if (y < 140) newPage(); y -= 6; page.drawText(safe(t), { x: M, y: y - size, size, font: B, color: C.ink }); y -= size + 4; page.drawLine({ start: { x: M, y }, end: { x: W - M, y }, thickness: 1.2, color: C.red }); y -= 12; };
    const statusColor = s => (s === 'pass' ? C.green : s === 'fail' ? C.red : s === 'info' ? C.muted : C.amber);
    const vColor = s => (s === 'pass' ? C.green : s === 'fail' ? C.red : C.amber);

    // ---------- Page 1: the verdict and the 3D view ----------
    newPage();
    page.drawText('Planning check', { x: M, y: y - 26, size: 26, font: B, color: C.ink }); y -= 34;
    text(`${E.PROJECTS[model.kind].name}, ${R.name}, ${E.PROJECTS[model.kind].cls}${model.sample ? ' (the sample house, not a real property)' : ''}`, { size: 12, color: C.muted, after: 2 });
    text(`Made on ${longDate(new Date().toISOString().slice(0, 10), R)}. Rules as of ${R.RULES_AS_OF}, rule set ${R.RULES_VERSION}.`, { size: 9, color: C.muted, after: 12 });
    // the title block: measure the text first, then draw the box around it
    const tbTop = y, tw = W - 2 * M - 150;
    const tLines = wrap(result.verdict.title, B, 15, tw).length, xLines = wrap(result.verdict.text, F, 9.5, tw).length, fLines = wrap(result.verdict.formal, F, 9, tw).length;
    const tbH = Math.max(92, 24 + tLines * 20.7 + xLines * 13.1 + fLines * 12.4 + 10);
    page.drawRectangle({ x: M, y: tbTop - tbH, width: W - 2 * M, height: tbH, borderColor: C.ink, borderWidth: 1, color: C.white });
    page.drawRectangle({ x: M, y: tbTop - tbH, width: 6, height: tbH, color: vColor(result.verdict.status) });
    y = tbTop - 12;
    const saveY = y;
    text(result.verdict.title, { x: M + 18, size: 15, bold: true, width: tw, after: 2 });
    text(result.verdict.text, { x: M + 18, size: 9.5, width: tw, after: 2 });
    text(result.verdict.formal, { x: M + 18, size: 9, width: tw, color: C.muted });
    const cx = W - M - 112;
    page.drawLine({ start: { x: cx - 12, y: tbTop }, end: { x: cx - 12, y: tbTop - tbH }, thickness: 0.6, color: C.line });
    [['Pass', result.counts.pass, C.green], ['Fail', result.counts.fail, C.red], ['Check', result.counts.check, C.amber]].forEach(([k, v, col], i) => {
      page.drawText(k, { x: cx, y: saveY - 14 - i * 24, size: 10, font: F, color: col });
      page.drawText(String(v), { x: cx + 70, y: saveY - 16 - i * 24, size: 16, font: B, color: col });
    });
    y = tbTop - tbH - 16;
    const designated = (result.flags || []).filter(f => f.answer === 'yes');
    if (designated.length) text(`National rules may not apply as entered: you told us about ${designated.map(f => E.QUESTIONS[model.j][f.key].name).join(', ')}. Ask the council before relying on this report.`, { size: 10, bold: true, color: C.red });
    // the 3D view
    const persp = shots.find(s => s.label === 'The project in 3D');
    if (persp) {
      const img = persp.url.startsWith('data:image/png') ? await doc.embedPng(persp.url) : await doc.embedJpg(persp.url);
      const iw = W - 2 * M, ih = iw * img.height / img.width;
      if (y - ih < 70) newPage();
      page.drawImage(img, { x: M, y: y - ih, width: iw, height: ih });
      page.drawRectangle({ x: M, y: y - ih, width: iw, height: ih, borderColor: C.line, borderWidth: 0.6 });
      for (const t of persp.tags || []) {
        const sx = iw / (img.width), tx = M + t.x * sx, ty = y - t.y * sx;
        const label = safe(t.text), tw = B.widthOfTextAtSize(label, 7.5) + 6;
        page.drawRectangle({ x: tx - tw / 2, y: ty + 1, width: tw, height: 11, color: t.tone === 'bad' ? C.red : C.white, opacity: 0.92 });
        page.drawText(label, { x: tx - tw / 2 + 3, y: ty + 4, size: 7.5, font: B, color: t.tone === 'bad' ? C.white : t.tone === 'limit' ? C.blue : t.tone === 'band' ? C.red : C.ink });
      }
      y -= ih + 6;
      text('The project in 3D. Blue: the limits the rules allow. Red line: the site boundary. Hatched red: a boundary band with a stricter limit.', { size: 8.5, color: C.muted });
    } else text('The 3D views need WebGL, which this browser did not provide. The plan and elevations follow.', { size: 9, color: C.muted });
    text(`Project: ${describe(model, E)}`, { size: 10, after: 6 });

    // ---------- Page 2: the dimensioned plan and elevations ----------
    newPage();
    heading('Plan and elevations');
    text('Drawn from the sizes entered. Check them against the property before you rely on them.', { size: 9, color: C.muted, after: 8 });
    drawPlan();
    y -= 8;
    drawElevations();

    // ---------- The rule-by-rule table ----------
    newPage();
    heading('Every condition, with its source');
    text(`Each condition as the tool read it on ${R.RULES_AS_OF}, the figure from this project, the limit and the legal reference. Pass means every figure it needs was entered and inside the limit; Check means an answer is missing or a term needs judgement.`, { size: 9, color: C.muted, after: 8 });
    const colX = [M, M + 44, M + 226, M + 330, M + 412], colW = [40, 178, 100, 78, W - M - (M + 412)];
    const row = (cells, o = {}) => {
      const sizes = o.head ? 8 : 8.3;
      const lines = cells.map((c, i) => wrap(c, o.head || i === 0 ? B : F, sizes, colW[i] - 4));
      const h = Math.max(...lines.map(l => l.length)) * sizes * 1.32 + 8;
      if (y - h < 56) { newPage(); }
      if (o.fill) page.drawRectangle({ x: M, y: y - h, width: W - 2 * M, height: h, color: o.fill });
      lines.forEach((ls, i) => ls.forEach((ln, j) => page.drawText(ln, { x: colX[i] + 2, y: y - 6 - sizes - j * sizes * 1.32, size: sizes, font: o.head || i === 0 ? B : F, color: i === 0 && o.status ? statusColor(o.status) : o.head ? C.muted : i === 4 ? C.muted : C.ink })));
      y -= h;
      page.drawLine({ start: { x: M, y }, end: { x: W - M, y }, thickness: 0.4, color: C.line });
    };
    row(['Result', 'Condition', 'This project', 'Limit', 'Reference'], { head: true, fill: C.film });
    const used = [];
    for (const r of result.results) {
      if (!used.includes(r.source)) used.push(r.source);
      row([STATUS[r.status], r.rule, r.value + (r.note ? `. ${r.note}` : ''), r.limit || '', r.ref], { status: r.status });
    }
    y -= 10;
    text('Sources, each read on the date shown', { size: 10, bold: true, after: 3 });
    for (const key of used) { const src = R.SOURCES[key]; text(`${src.label}. ${src.url} (checked ${longDate(src.checked, R)})`, { size: 8.3, color: C.muted, after: 3 }); }
    text(model.j === 'en' ? 'Crown copyright material from legislation.gov.uk and GOV.UK is re-used under the Open Government Licence v3.0.' : 'Irish Statute Book material is re-used under the Oireachtas (Open Data) PSI Licence, which incorporates CC BY 4.0.', { size: 8.3, color: C.muted, after: 4 });

    // ---------- Designated land checklist ----------
    y -= 10;
    heading('Designated land and other restrictions');
    text('The tool does not look these up. Each answer below is yours; a yes, or no answer, changes what the national rules allow.', { size: 9, color: C.muted, after: 6 });
    for (const key of E.SCREEN_KEYS[model.j]) {
      const q = E.QUESTIONS[model.j][key], a = (model.screen || {})[key];
      text(`${a === 'yes' ? 'Yes' : a === 'no' ? 'No' : 'Not answered'}: ${q.q}`, { size: 9.5, bold: true, after: 0, color: a === 'yes' ? C.red : a === 'no' ? C.ink : C.amber });
      text(q.effect, { size: 9, color: C.muted, after: 5 });
    }
    text('Where to look:', { size: 9.5, bold: true, after: 1 });
    for (const mp of R.MAPS) text(`${mp.label}: ${mp.url}`, { size: 8.5, color: C.blue, after: 1 });

    // ---------- Building regulations ----------
    y -= 8;
    heading('Building regulations: a separate question');
    text('Planning and building regulations are separate. These are the points that apply to this kind of project.', { size: 9, color: C.muted, after: 6 });
    for (const b of E.buildingFor(model)) text(`${b.text} (${R.SOURCES[b.source].short})`, { size: 9.5, after: 5 });

    // ---------- The next-step pack ----------
    for (const p of packs(ctx)) {
      newPage();
      heading(p.title, 14);
      if (p.intro) text(p.intro, { size: 9, color: C.muted, after: 8 });
      if (p.paras) p.paras.forEach((t, i) => text(t, { size: 10.5, bold: i === 2, after: 9 }));
      if (p.fields) {
        for (const [k, v] of p.fields) { text(k, { size: 8.5, color: C.muted, after: 0 }); text(v, { size: 10.5, bold: true, after: 6 }); }
        text(`Note: ${p.footnote}`, { size: 9, color: C.muted, after: 10 });
        text('Checklist for compliance with the requirements of the relevant Regulation', { size: 10.5, bold: true, after: 4 });
        p.checklist.forEach((c, i) => { text(`[  ]  ${i + 1}. ${c.text}`, { size: 9.5, after: 1 }); text(`This project: ${c.status}.`, { size: 8.5, color: /does not/.test(c.status) ? C.red : /needs/.test(c.status) ? C.amber : C.muted, x: M + 22, width: W - 2 * M - 22, after: 5 }); });
      }
      if (p.items) p.items.forEach((c, i) => text(`[  ]  ${i + 1}. ${c.text}`, { size: 10, after: 5 }));
    }

    pages.forEach((pg, i) => pg.drawText(`${i + 1} / ${pages.length}`, { x: W - M - 30, y: 28, size: 7.5, font: F, color: C.muted }));
    return doc.save();

    // ---------- drawings ----------
    function drawPlan() {
      // landscape plan: the road on the left, the garden running to the right
      const top = y, availW = W - 2 * M, availH = 300;
      const mm = 72 / 25.4;
      const s = [100, 200, 250, 500, 1000].find(sc => ((P.L + 3) * 1000 / sc) * mm <= availW - 50 && (P.W * 1000 / sc) * mm <= availH - 50) || 1000;
      const k = 1000 / s * mm; // points per metre
      const ox = M + 18, oy = top - 26 - Math.max(0, (availH - 50 - P.W * k) / 2);
      const PX = d => ox + (d + 2.4) * k, PY = x => oy - x * k;
      const rect = (x0, y0, x1, y1, o) => page.drawRectangle(Object.assign({ x: PX(y0), y: PY(x1), width: (y1 - y0) * k, height: (x1 - x0) * k }, o));
      const hp = P.house, hw = hp.x1 - hp.x0;
      // the road and pavement
      page.drawRectangle({ x: PX(-2.2), y: PY(P.W + (P.att.right ? hw : 0)) - 6, width: 2 * k, height: (P.W + (P.att.left ? hw : 0) + (P.att.right ? hw : 0)) * k + 12, color: C.film });
      page.drawText('Road', { x: PX(-2.2) + 2, y: PY(P.W / 2), size: 8, font: F, color: C.muted, rotate: PDFLib.degrees(90) });
      // neighbours joined to the house
      if (P.att.left) rect(-hw, hp.y0, 0, hp.y1, { borderColor: C.grey, borderWidth: 0.8, color: C.film });
      if (P.att.right) rect(P.W, hp.y0, P.W + hw, hp.y1, { borderColor: C.grey, borderWidth: 0.8, color: C.film });
      rect(0, 0, P.W, P.L, { color: C.lawn });
      const bandW = { 'en-rear': 2, 'en-side': 2, 'en-out': 2, 'ie-dad': 0.6 }[model.kind] || (model.kind === 'ie-ext' && Number(model.p.storeys) > 1 ? 2 : 0);
      if (bandW) rect(bandW, hp.y1, Math.max(bandW, P.W - bandW), Math.max(hp.y1, P.L - bandW), { borderColor: C.red, borderWidth: 0.6, borderDashArray: [3, 2] });
      rect(0, 0, P.W, P.L, { borderColor: C.red, borderWidth: 1.6 });
      rect(hp.x0, hp.y0, hp.x1, hp.y1, { color: rgb(0.88, 0.8, 0.77), borderColor: C.ink, borderWidth: 1 });
      page.drawText('House', { x: PX(hp.y0) + 4, y: PY((hp.x0 + hp.x1) / 2) - 3, size: 8, font: B, color: C.ink });
      if (result.existingRect) { const e = result.existingRect; rect(e.x0, e.y0, e.x1, e.y1, { color: rgb(0.8, 0.7, 0.66), borderColor: C.ink, borderWidth: 0.8 }); }
      const bad = result.counts.fail > 0, r = result.rect;
      if (model.kind === 'ie-split') {
        const share = (Number(model.p.area1) || 1) / ((Number(model.p.area1) || 1) + (Number(model.p.area2) || 1));
        const xs = hp.x0 + hw * share;
        page.drawLine({ start: { x: PX(hp.y0), y: PY(xs) }, end: { x: PX(hp.y1), y: PY(xs) }, thickness: 1.6, color: C.blue });
      } else if (r) {
        rect(r.x0, r.y0, r.x1, r.y1, { color: C.white, borderColor: bad ? C.red : C.ink, borderWidth: 1.6 });
        dimD(r.y0, r.y1, r.x1 + 0.8, `${fmt(E, r.y1 - r.y0)} m`);
        dimA(r.x0, r.x1, r.y1 + 0.8, `${fmt(E, r.x1 - r.x0)} m`);
        if (['en-out', 'ie-shed', 'ie-dad'].includes(model.kind) && model.p.location === 'rear') { dimD(r.y1, P.L, Math.max(0.4, (r.x0 + r.x1) / 2), `${fmt(E, P.L - r.y1)} m`); dimA(0, r.x0, (r.y0 + r.y1) / 2, `${fmt(E, r.x0)} m`); }
      }
      dimD(0, P.L, -1.0, `${fmt(E, P.L)} m`);
      dimA(0, P.W, P.L + 1.0, `${fmt(E, P.W)} m`);
      const sb = 10 * k, by = PY(P.W + (P.att.right ? hw : 0)) - 22;
      page.drawRectangle({ x: M, y: by, width: sb / 2, height: 4, color: C.ink });
      page.drawRectangle({ x: M + sb / 2, y: by, width: sb / 2, height: 4, borderColor: C.ink, borderWidth: 0.6 });
      page.drawText(`0, 5, 10 m. Scale 1:${s} on A4, printed at 100%. Red line: the site boundary.`, { x: M + sb + 8, y: by, size: 8, font: F, color: C.muted });
      page.drawText('Plan', { x: M, y: by - 16, size: 11, font: B, color: C.ink });
      y = by - 30;
      function dimD(a, b, xx, label) { // along the depth (horizontal on the page)
        const yp = PY(xx);
        page.drawLine({ start: { x: PX(a), y: yp }, end: { x: PX(b), y: yp }, thickness: 0.6, color: C.ink });
        [a, b].forEach(v => page.drawLine({ start: { x: PX(v), y: yp - 3 }, end: { x: PX(v), y: yp + 3 }, thickness: 0.6, color: C.ink }));
        const t = safe(label), tw = F.widthOfTextAtSize(t, 7.5);
        page.drawText(t, { x: (PX(a) + PX(b)) / 2 - tw / 2, y: yp + 2.5, size: 7.5, font: F, color: C.ink });
      }
      function dimA(a, b, yy, label) { // across the plot (vertical on the page)
        const xp = PX(yy);
        page.drawLine({ start: { x: xp, y: PY(a) }, end: { x: xp, y: PY(b) }, thickness: 0.6, color: C.ink });
        [a, b].forEach(v => page.drawLine({ start: { x: xp - 3, y: PY(v) }, end: { x: xp + 3, y: PY(v) }, thickness: 0.6, color: C.ink }));
        page.drawText(safe(label), { x: xp - 2.5, y: (PY(a) + PY(b)) / 2 - F.widthOfTextAtSize(safe(label), 7.5) / 2, size: 7.5, font: F, color: C.ink, rotate: PDFLib.degrees(90) });
      }
    }
    function drawElevations() {
      // two elevations stacked at one true scale, each the full width of the page
      const h = model.house, eaves = Number(h.eaves) || 0, ridge = Math.max(Number(h.ridge) || eaves, eaves);
      const hp = P.house, r = result.rect, p = model.p, L = R.LIMITS;
      const top = Number(p.height || p.h) || 0;
      const isUnit = model.kind === 'en-ashp' || model.kind === 'ie-hp';
      const width = W - 2 * M, mm = 72 / 25.4;
      const maxH = Math.max(ridge, top, 4.2) + 0.8;
      const sideEnd = P.L, sideStart = 0;
      const s = [100, 200, 250, 500, 1000].find(sc => { const k = 1000 / sc * mm; return (sideEnd - sideStart + 2) * k <= width && (P.W + 2) * k <= width && maxH * k <= 150; }) || 1000;
      const k = 1000 / s * mm;
      const panelH = maxH * k;
      const limitLine = (X, Yv, a, b, hgt, label, col, below) => {
        page.drawLine({ start: { x: X(a), y: Yv(hgt) }, end: { x: X(b), y: Yv(hgt) }, thickness: 0.8, color: col, dashArray: [4, 3] });
        const t = safe(label), tw = F.widthOfTextAtSize(t, 7);
        page.drawText(t, { x: X(b) + 4, y: Yv(hgt) + (below ? -8 : 1), size: 7, font: F, color: col });
      };
      // the roof seen from the rear is a slope (or a gable end when the ridge runs front to back); from the side, the reverse
      const houseShape = (X, Yv, a, b, side) => {
        page.drawRectangle({ x: X(a), y: Yv(0), width: (b - a) * k, height: eaves * k, color: rgb(0.88, 0.8, 0.77), borderColor: C.ink, borderWidth: 0.8 });
        if (h.roof === 'flat') { page.drawRectangle({ x: X(a), y: Yv(eaves), width: (b - a) * k, height: Math.max(0.2, ridge - eaves) * k, color: rgb(0.45, 0.5, 0.56), borderColor: C.ink, borderWidth: 0.8 }); return; }
        const gableEnd = side ? !h.gableRear : !!h.gableRear;
        const inset = h.roof === 'hip' && !gableEnd ? Math.min((b - a) / 2, (side ? hp.x1 - hp.x0 : hp.y1 - hp.y0) / 2) : 0;
        const path = gableEnd
          ? `M ${X(a)} ${-Yv(eaves)} L ${(X(a) + X(b)) / 2} ${-Yv(ridge)} L ${X(b)} ${-Yv(eaves)} Z`
          : `M ${X(a)} ${-Yv(eaves)} L ${X(a + inset)} ${-Yv(ridge)} L ${X(b - inset)} ${-Yv(ridge)} L ${X(b)} ${-Yv(eaves)} Z`;
        page.drawSvgPath(path, { x: 0, y: 0, color: rgb(0.45, 0.5, 0.56), borderColor: C.ink, borderWidth: 0.8 });
      };
      const panel = (span, from, title, draw) => {
        if (y - panelH - 40 < 60) newPage();
        const base = y - panelH - 4;
        const x0 = M + (width - (span + 2) * k) / 2;
        const X = v => x0 + (v - from + 1) * k, Yv = v => base + v * k;
        page.drawLine({ start: { x: M, y: base }, end: { x: W - M, y: base }, thickness: 1, color: C.ink });
        draw(X, Yv);
        page.drawText(title, { x: M, y: base - 22, size: 11, font: B, color: C.ink });
        y = base - 36;
      };
      const proposalUnit = (X, Yv, a, b) => page.drawRectangle({ x: X(a), y: Yv(p.mount === 'wall' ? (p.aboveGround === 'yes' ? 3.2 : 0.5) : p.mount === 'flatRoof' || p.mount === 'roof' ? eaves : 0), width: (b - a) * k, height: (Number(p.h) || 0.9) * k, color: C.white, borderColor: C.ink, borderWidth: 1 });
      const bad = result.counts.fail ? C.red : C.ink;
      panel(P.W, 0, 'Rear elevation', (X, Yv) => {
        houseShape(X, Yv, hp.x0, hp.x1, false);
        [0, P.W].forEach(v => page.drawLine({ start: { x: X(v), y: Yv(0) - 4 }, end: { x: X(v), y: Yv(0) + 8 }, thickness: 1.4, color: C.red }));
        if (r && !isUnit && model.kind !== 'ie-split') {
          page.drawRectangle({ x: X(r.x0), y: Yv(0), width: (r.x1 - r.x0) * k, height: top * k, color: C.white, borderColor: bad, borderWidth: 1.2 });
          page.drawText(`${fmt(E, top)} m high`, { x: X(r.x0) + 3, y: Yv(top / 2) - 3, size: 7, font: B, color: C.ink });
        }
        if (isUnit && r) proposalUnit(X, Yv, r.x0, r.x1);
        if (model.kind === 'en-rear' || model.kind === 'en-side') {
          if (Number(p.storeys) <= 1) limitLine(X, Yv, -0.5, P.W + 0.5, Math.min(L.a.singleHeight, ridge), '4 m single-storey limit', C.blue);
          limitLine(X, Yv, -0.5, P.W + 0.5, L.a.nearBoundaryEaves, 'eaves 3 m within 2 m of a boundary', C.red, true);
        }
        if (model.kind === 'en-out') { limitLine(X, Yv, -0.5, P.W + 0.5, L.e.nearBoundaryHeight, '2.5 m within 2 m of a boundary', C.red, true); limitLine(X, Yv, -0.5, P.W + 0.5, p.roof === 'dual' || p.roof === 'hipped' ? L.e.dualPitched : L.e.other, p.roof === 'dual' || p.roof === 'hipped' ? '4 m with a dual-pitched roof' : '3 m', C.blue); }
        if (model.kind === 'ie-shed' || model.kind === 'ie-dad') limitLine(X, Yv, -0.5, P.W + 0.5, p.roof === 'pitched-tiled' ? 4 : 3, p.roof === 'pitched-tiled' ? '4 m, tiled or slated pitched roof' : '3 m', C.blue);
        if (model.kind === 'ie-ext') limitLine(X, Yv, -0.5, P.W + 0.5, p.roof === 'flat' ? eaves : ridge, p.roof === 'flat' ? 'flat roof: no higher than the eaves' : 'no higher than the top of the house roof', C.blue);
      });
      panel(sideEnd - sideStart, sideStart, 'Side elevation', (X, Yv) => {
        houseShape(X, Yv, hp.y0, hp.y1, true);
        [0, P.L].forEach(v => page.drawLine({ start: { x: X(v), y: Yv(0) - 4 }, end: { x: X(v), y: Yv(0) + 8 }, thickness: 1.4, color: C.red }));
        if (r && !isUnit && model.kind !== 'ie-split') page.drawRectangle({ x: X(r.y0), y: Yv(0), width: (r.y1 - r.y0) * k, height: top * k, color: C.white, borderColor: bad, borderWidth: 1.2 });
        if (isUnit && r) proposalUnit(X, Yv, r.y0, r.y1);
        if (model.kind === 'en-rear') {
          const det = h.type === 'detached', two = Number(p.storeys) > 1;
          const lims = two ? [[L.a.twoStoreyDepth, '3 m']] : [[det ? 4 : 3, `${det ? 4 : 3} m`], [det ? 8 : 6, `${det ? 8 : 6} m with prior approval`]];
          lims.forEach(([d, label], i) => {
            const xx = X(hp.y1 + d), hy = Math.min(4, ridge) + 0.6 + i * 0.8;
            page.drawLine({ start: { x: xx, y: Yv(0) }, end: { x: xx, y: Yv(hy) }, thickness: 0.8, color: C.blue, dashArray: [4, 3] });
            page.drawText(safe(label), { x: xx + 2, y: Yv(hy) - 7, size: 7, font: F, color: C.blue });
          });
          if (two) { const xx = X(P.L - L.a.rearBoundary); page.drawLine({ start: { x: xx, y: Yv(0) }, end: { x: xx, y: Yv(ridge) }, thickness: 0.8, color: C.red, dashArray: [4, 3] }); page.drawText('7 m to the rear boundary', { x: xx + 2, y: Yv(ridge) - 8, size: 7, font: F, color: C.red }); }
        }
        page.drawText('Road side', { x: X(0) + 3, y: Yv(0) - 9, size: 7, font: F, color: C.muted });
        page.drawText('Rear boundary', { x: X(P.L) - F.widthOfTextAtSize('Rear boundary', 7) - 3, y: Yv(0) - 9, size: 7, font: F, color: C.muted });
      });
      page.drawText(`Elevations at 1:${s} on A4, printed at 100%. Red marks: the boundaries. Dashed: the limits.`, { x: M, y: y - 2, size: 8, font: F, color: C.muted });
      y -= 16;
    }
  }

  return { pdf, packText, packs, describe, safe };
});
