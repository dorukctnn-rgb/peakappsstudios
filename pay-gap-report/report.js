/* Pay Gap Report exports (Pro): the figures CSV, the excluded rows CSV and the PDF report.
 * Pure functions over a "view" built by tool.js; pdf-lib is passed in (loaded only when the PDF is asked for).
 * The on-screen table, the CSV and the PDF all read their numbers from figureRows(), so they always agree.
 * Works in the browser (window.PayGapReport) and in Node for the tests. */
(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory();
  else root.PayGapReport = factory();
})(typeof self !== 'undefined' ? self : this, function () {
  'use strict';

  const UK_FIELDS = {
    mean_hourly: 'DiffMeanHourlyPercent', median_hourly: 'DiffMedianHourlyPercent', mean_bonus: 'DiffMeanBonusPercent', median_bonus: 'DiffMedianBonusPercent',
    bonus_share: ['MaleBonusPercent', 'FemaleBonusPercent'],
    quartiles: [['MaleLowerQuartile', 'FemaleLowerQuartile'], ['MaleLowerMiddleQuartile', 'FemaleLowerMiddleQuartile'], ['MaleUpperMiddleQuartile', 'FemaleUpperMiddleQuartile'], ['MaleTopQuartile', 'FemaleTopQuartile']],
  };
  const csvCell = v => { const s = v == null ? '' : String(v); return /[",\n\r]/.test(s) || (/^[=+\-@]/.test(s) && !/^-?\d/.test(s)) ? '"' + s.replace(/"/g, '""') + '"' : s; };
  const csv = rows => String.fromCharCode(0xFEFF) + rows.map(r => r.map(csvCell).join(',')).join('\r\n') + '\r\n';
  const fixed1 = (P, x) => { const v = P.round1(x); return v == null ? '' : v.toFixed(1); };
  const fixed2 = x => (x == null || !Number.isFinite(x) ? '' : x.toFixed(2));
  const plural = (n, a, b) => `${n} ${n === 1 ? a : b || a + 's'}`;

  // ---------- One list of every published number ----------
  // { id, measure, ref, part, value (number, unrounded), unit: '%' | currency, field, note, band }
  function figureRows(view) {
    const P = view.P, R = view.R, res = view.res, cur = res.currency, uk = R.area === 'uk';
    const rows = [];
    const lawRef = ref => `${R.lawShort}, ${ref}`;
    for (const f of res.figures) {
      if (f.kind === 'gap') {
        const stat = f.stat === 'mean' ? 'Mean' : 'Median';
        const what = f.basis === 'bonus' ? (R.area === 'eu' ? 'complementary or variable pay' : 'bonus pay') : f.basis === 'annual' ? 'annual pay' : 'hourly pay';
        rows.push({ id: f.id, measure: f.label, ref: lawRef(f.ref), part: 'Gap', value: f.value, unit: '%', field: uk ? UK_FIELDS[f.id] : '', note: f.value == null ? f.note : '' });
        rows.push({ id: f.id, measure: f.label, ref: lawRef(f.ref), part: `${stat} ${what}, men (${f.men.n})`, value: f.men.value, unit: cur, sub: true });
        rows.push({ id: f.id, measure: f.label, ref: lawRef(f.ref), part: `${stat} ${what}, women (${f.women.n})`, value: f.women.value, unit: cur, sub: true });
      } else if (f.kind === 'share') {
        rows.push({ id: f.id, measure: f.label, ref: lawRef(f.ref), part: `Men (${f.men.count} of ${f.men.n})`, value: f.men.value, unit: '%', field: uk ? UK_FIELDS[f.id][0] : '', note: f.men.value == null ? f.note : '' });
        rows.push({ id: f.id, measure: f.label, ref: lawRef(f.ref), part: `Women (${f.women.count} of ${f.women.n})`, value: f.women.value, unit: '%', field: uk ? UK_FIELDS[f.id][1] : '', note: f.women.value == null ? f.note : '' });
      } else if (f.kind === 'quartiles') {
        f.bands.forEach((b, i) => {
          rows.push({ id: f.id, measure: f.label, ref: lawRef(f.ref), part: `${b.band} band, men (${b.men} of ${b.men + b.women})`, value: b.menPct, unit: '%', field: uk ? UK_FIELDS.quartiles[i][0] : '', band: i });
          rows.push({ id: f.id, measure: f.label, ref: lawRef(f.ref), part: `${b.band} band, women (${b.women} of ${b.men + b.women})`, value: b.womenPct, unit: '%', field: uk ? UK_FIELDS.quartiles[i][1] : '', band: i });
        });
      } else if (f.kind === 'categories') {
        for (const g of f.rows) {
          const m = `${f.label}: ${g.name}`;
          rows.push({ id: f.id, measure: m, ref: lawRef(f.ref), part: `Gap, gross hourly pay (${g.men} men, ${g.women} women)`, value: g.hourly, unit: '%', note: g.note || '' });
          rows.push({ id: f.id, measure: m, ref: lawRef(f.ref), part: 'Gap, basic pay per hour', value: g.basic, unit: '%', sub: true });
          rows.push({ id: f.id, measure: m, ref: lawRef(f.ref), part: 'Gap, complementary or variable pay per hour', value: g.variable, unit: '%', sub: true });
          rows.push({ id: f.id, measure: m, ref: lawRef(f.ref), part: 'Gap, gross annual pay', value: g.annual, unit: '%', sub: true });
          rows.push({ id: f.id, measure: m, ref: lawRef('Art. 10(1)(a)'), part: 'Hourly gap of 5% or more', text: g.flag ? 'Yes' : 'No', unit: '', sub: true });
        }
      }
    }
    return rows.map(r => Object.assign(r, { display: r.text != null ? r.text : r.unit === '%' ? fixed1(P, r.value) : fixed2(r.value) }));
  }

  function figuresCSV(view) {
    const uk = view.R.area === 'uk';
    const head = ['Measure', 'Reference', 'Figure', 'Value', 'Unit'].concat(uk ? ['GOV.UK service field'] : []).concat(['Note']);
    const out = [head];
    for (const r of figureRows(view)) out.push([r.measure, r.ref, r.part, r.display, r.unit === '%' ? 'percent' : r.unit].concat(uk ? [r.field || ''] : []).concat([r.note || '']));
    return csv(out);
  }

  function exclusionsCSV(view) {
    const out = [['Row in file', 'Employee ID', 'Sex as recorded', 'Left out of', 'Reason']];
    for (const r of view.records) {
      if (r.out) out.push([r.row, r.id, r.sexRaw, 'Every figure', r.out.text]);
      else if (r.outHourly) out.push([r.row, r.id, r.sexRaw, view.R.area === 'eu' ? 'Hourly and annual pay figures, quartiles and categories' : 'Hourly pay figures and quartiles', r.outHourly.text]);
    }
    return csv(out);
  }

  // ---------- Words ----------
  function dateWords(view) {
    const P = view.P, d = view.dates, R = view.R;
    if (R.area === 'eu') return { when: `reference year ${d.referenceYear}`, snapshot: `${d.referenceYear}`, due: P.euSchedule(view.res.headcount.total).text };
    return { when: `snapshot date ${P.longDate(d.snapshot)}`, snapshot: P.longDate(d.snapshot), due: P.longDate(d.deadline) };
  }
  function narrativeTemplate(view) {
    const P = view.P, R = view.R, res = view.res, h = res.headcount, w = dateWords(view);
    const name = view.employer || '[Employer name]';
    const mean = P.pct(res.byId.mean_hourly.value, { ascii: true }), med = P.pct(res.byId.median_hourly.value, { ascii: true });
    const who = R.area === 'eu' ? 'workers' : 'employees';
    const lead = R.area === 'eu'
      ? `${name} employed ${h.total} ${who} in ${w.snapshot}. Our mean gender pay gap in gross hourly pay was ${mean} and our median gap ${med}.`
      : `${name} had ${h.total} ${who} on our snapshot date, ${w.snapshot}. Our mean ${R.area === 'ie' ? 'hourly remuneration gap' : 'gender pay gap in hourly pay'} is ${mean} and our median gap is ${med}.`;
    if (R.area === 'ie') {
      return `${lead}\n\nThe reasons for the differences\n[Regulation 6(4)(a): set out, in your opinion, the reasons for the differences in remuneration referable to gender.]\n\nThe measures we are taking\n[Regulation 6(4)(b): set out the measures being taken, or proposed to be taken, to eliminate or reduce the differences.]`;
    }
    if (R.area === 'eu') {
      const flagged = (res.byId.categories && res.byId.categories.rows || []).filter(g => g.flag).map(g => `${g.name} (${P.pct(g.hourly, { ascii: true })})`);
      return `${lead}\n\nCategories of workers with an hourly gap of 5% or more: ${flagged.length ? flagged.join(', ') : 'none'}.\n[For each, state whether the difference is justified on objective, gender-neutral criteria, or how it will be remedied within six months of submitting this report.]\n\nExplanation\n[Explain any gender pay differences shown in these figures.]`;
    }
    return `${lead}\n\nWhy we have a gap\n[Explain the main reasons in your own words, for example how men and women are spread across roles and pay levels. The quartile figures show the share of women in each pay band.]\n\nWhat we are doing about it\n[Describe the actions taken in the past year and those planned, with dates.]`;
  }

  function methodology(view) {
    const R = view.R, res = view.res, h = res.headcount, uk = R.area === 'uk', pub = R.id === 'uk_public';
    const reg = n => (pub ? `Sch. 1 para. ${n}` : `reg. ${n}`);
    const given = view.hourlyGiven ? ' Hourly figures were taken from the file as supplied where a row had one.' : '';
    const sexLine = h.neither ? ` ${plural(h.neither, 'row')} not recorded as male or female ${h.neither === 1 ? 'was' : 'were'} left out of the figures and counted in the headcount.` : '';
    const q = 'Ranked by hourly pay and divided into four bands as equal as possible. As the GOV.UK guidance sets out, one person left over goes to the lower band, two to the lower and upper middle bands, and three to the lower, lower middle and upper middle bands. Where people on the same hourly pay fall into more than one band, each band has the same proportion of men and women as far as possible';
    const round = 'Figures were calculated unrounded and are shown to one decimal place. An exact half is rounded to the even digit, so the two shares in each band add up to 100.0.';
    if (uk) return [
      ['Who is included', `Relevant employees are the people employed on the snapshot date (${reg(1)}). Full-pay relevant employees are those not paid at a reduced rate or nil in the relevant pay period because of leave; only they are in the hourly pay figures and the quartile pay bands. The bonus figures use all relevant employees.`],
      ['Hourly rate of pay', `Ordinary pay and bonus pay paid in the pay period that includes the snapshot date, with bonus pay for a longer period prorated to that pay period, multiplied by 7 over the number of days in the pay period (a month counts as 30.44 days) and divided by the employee's weekly working hours (${reg(6)} and ${reg(7)}).${given}`],
      ['Ordinary pay', `Basic pay, allowances, pay for piecework, pay for leave and shift premium pay, before deductions at source. It excludes overtime, redundancy or termination pay, pay in lieu of leave and remuneration not in money (${reg(3)}).`],
      ['Bonus pay', `Remuneration in money, vouchers, securities, securities options or interests in securities that relates to profit sharing, productivity, performance, incentive or commission (${reg(4)}). The bonus figures cover the 12 months ending with the snapshot date; the means and medians are of those paid a bonus (${reg(10)} to ${reg(12)}).`],
      ['The gaps', `(A - B) / A x 100, with A the figure for men and B the figure for women (${reg(8)} to ${reg(11)}). A positive gap means men are paid more. The median of an even count is the mean of the two middle values.`],
      ['Quartile pay bands', `${q} (${reg(13)}).`],
      ['Sex', `The GOV.UK guidance (updated 21 May 2026) says gender pay gap reporting must be based on employees' biological sex.${sexLine}`],
      ['Rounding', `${round} The GOV.UK guidance accepts whole numbers or one decimal place.`],
      ['Publishing', pub
        ? 'Within 12 months of the snapshot date, on the authority\'s website, accessible to employees and the public for at least three years, and on the government\'s gender pay gap service (Sch. 1 paras 2(2) and 14). Public authorities do not need a written statement.'
        : 'Within 12 months of the snapshot date, on the employer\'s website, accessible to employees and the public for at least three years, with a written statement confirming the information is accurate, signed by an appropriate person, and on the government\'s gender pay gap service with that person\'s name and job title (regs. 2(2), 14 and 15).'],
    ];
    if (R.area === 'ie') return [
      ['Who is included', `Relevant employees are those employed on the snapshot date in June (Reg. 2). Employees not paid in the 12 months are left out of the hourly figures, as the Department's FAQ for employers (Q12) says.`],
      ['Hourly remuneration', `Ordinary pay plus bonus remuneration paid in the 12 months ending on the snapshot date, divided by the total working hours in that period (Reg. 3 and Reg. 4; for variable hours, the hours of the last 12 weeks divided by 12 and multiplied by 52.18).${given}`],
      ['Ordinary pay', 'Basic pay, allowances, pay for piece-work, shift premium pay and overtime pay, before statutory deductions; it excludes redundancy or termination payments and remuneration other than money (Reg. 2). Basic pay includes payments made during maternity, adoptive, parent\'s and paternity leave (S.I. No. 259 of 2024).'],
      ['Bonus remuneration', 'Money, vouchers or shares relating to profit sharing, productivity, performance, incentive or commission; it excludes ordinary pay, overtime, redundancy or termination payments and benefits in kind (Reg. 5). Benefits in kind include share options and interests in shares (S.I. No. 259 of 2024). The bonus gaps compare those paid bonus remuneration.'],
      ['The gaps', '(A - B) / A x 100, with A the figure for men and B the figure for women (Reg. 7 to Reg. 9). Part-time employees have the meaning in the Protection of Employees (Part-Time Work) Act 2001; temporary contracts are as recorded by the employer, since the Regulations do not define them.'],
      ['Quartile pay bands', `${q} (Reg. 10). The Regulations do not say where a remainder goes, so this report follows the GOV.UK method.`],
      ['Sex', `The Department's FAQ for employers (Q5) says an employee who does not identify as male or female may be omitted from the calculations.${sexLine}`],
      ['Rounding', round],
      ['Publishing', 'Not later than 5 months after the snapshot date (Reg. 6(1), as amended by S.I. No. 212 of 2025), on the employer\'s website for at least 3 years, with a statement of the reasons for any differences and the measures taken or proposed (Reg. 6(4)). For the 2026 cycle the Department also asks employers with 50 or more employees to report on the Gender Pay Gap Portal.'],
    ];
    return [
      ['Workers and period', `Everyone in the file with an employment contract or relationship (Art. 2(2)), for the reference year: the previous calendar year (Art. 9(2) to 9(4)).`],
      ['Pay and pay levels', `Pay is the ordinary basic or minimum wage or salary and any other consideration, in cash or in kind (complementary or variable components) (Art. 3(1)(a)). Pay levels are gross annual pay and the corresponding gross hourly pay (Art. 3(1)(b), recital 22): annual pay is basic plus complementary or variable pay for the year, and hourly pay is that divided by the hours paid.${given}`],
      ['The gaps', '(A - B) / A x 100, with A the figure for men and B the figure for women, for the mean and the median pay level (Art. 3(1)(c) and (e)). A positive gap means men are paid more.'],
      ['Complementary or variable components', 'Indicators (b), (d) and (e). The directive does not say whether these averages cover all workers or only those who received such pay; this report uses those who received it, as UK and Irish rules do for bonuses. Check your national rules.'],
      ['Quartile pay bands', `${q} (Art. 3(1)(f)).`],
      ['Categories of workers', 'Indicator (g): categories as grouped by the employer on gender-neutral criteria (Art. 3(1)(h)), with the gap split into basic pay and complementary or variable pay, each per hour. Article 10: where the reporting shows a difference in average pay level of at least 5% in a category, not justified on objective, gender-neutral criteria and not remedied within six months of submitting the report, the employer must carry out a joint pay assessment with workers\' representatives. The flag here uses hourly pay; annual differences of 5% or more are marked separately.'],
      ['Sex', `The directive reports on female and male workers.${sexLine}`],
      ['Rounding', round],
      ['Reporting', 'Employers with 250 or more workers report by 7 June 2027 and every year after; 150 to 249 by 7 June 2027 and every three years; 100 to 149 by 7 June 2031 and every three years (Art. 9(2) to 9(4)). Management confirms the accuracy after consulting workers\' representatives (Art. 9(6)), the figures go to the national monitoring body (Art. 9(7)) and indicator (g) goes to all workers and their representatives (Art. 9(9)). National law transposing the directive sets the details.'],
    ];
  }

  // ---------- PDF ----------
  const WINANSI_EXTRA = '€‚ƒ„…†‡ˆ‰Š‹ŒŽ‘’“”•–—˜™š›œžŸ';
  function pdfText(s) {
    return Array.from(String(s == null ? '' : s).replace(/−/g, '-').replace(/[   ]/g, ' ')).map(ch => {
      const c = ch.codePointAt(0);
      if ((c >= 32 && c <= 126) || (c >= 160 && c <= 255) || WINANSI_EXTRA.includes(ch)) return ch;
      const base = ch.normalize('NFD').replace(/[̀-ͯ]/g, '');
      if (base && base.length === 1 && base.charCodeAt(0) < 127) return base;
      return c === 9 ? ' ' : c < 32 ? '' : '?';
    }).join('');
  }

  async function pdf(PDFLib, view) {
    const P = view.P, R = view.R, res = view.res, h = res.headcount, cur = res.currency;
    const { PDFDocument, StandardFonts, rgb } = PDFLib;
    const doc = await PDFDocument.create();
    const w = dateWords(view);
    const employer = view.employer || 'Employer name';
    const title = R.area === 'eu' ? 'Pay gap report under Directive (EU) 2023/970' : 'Gender pay gap report';
    doc.setTitle(pdfText(`${title}: ${employer}, ${w.when}`));
    doc.setAuthor(pdfText(employer));
    doc.setCreator('Peak Apps Pay Gap Report');
    doc.setProducer('pdf-lib');
    const F = await doc.embedFont(StandardFonts.Helvetica), B = await doc.embedFont(StandardFonts.HelveticaBold);
    const W = 595.28, H = 841.89, M = 48, CW = W - 2 * M;
    const INK = rgb(0.08, 0.08, 0.09), MUTED = rgb(0.4, 0.41, 0.44), RULE = rgb(0.82, 0.82, 0.8), SOFT = rgb(0.955, 0.95, 0.935);
    const ACCENT = rgb(0x1e / 255, 0x4f / 255, 0x6e / 255), MEN = rgb(0.55, 0.56, 0.6), WARN = rgb(0.6, 0.29, 0.07);
    let page, y;
    const pages = [];
    const newPage = () => { page = doc.addPage([W, H]); pages.push(page); y = H - M; };
    const ensure = hh => { if (y - hh < M + 26) newPage(); };
    const text = (str, x, yy, o = {}) => { const f = o.bold ? B : F, s = o.size || 9.5; const t = pdfText(str); const tw = f.widthOfTextAtSize(t, s); page.drawText(t, { x: o.right ? x - tw : o.center ? x - tw / 2 : x, y: yy, size: s, font: f, color: o.color || INK }); return tw; };
    const wrap = (str, font, s, max) => {
      const out = [];
      for (const para of pdfText(str).split('\n')) {
        const words = para.split(/\s+/).filter(Boolean); let cur = '';
        if (!words.length) { out.push(''); continue; }
        for (const wd of words) { const t = cur ? cur + ' ' + wd : wd; if (font.widthOfTextAtSize(t, s) > max && cur) { out.push(cur); cur = wd; } else cur = t; }
        if (cur) out.push(cur);
      }
      return out;
    };
    const para = (str, o = {}) => { const s = o.size || 9, f = o.bold ? B : F; for (const l of wrap(str, f, s, o.width || CW)) { ensure(s + 4); if (l) text(l, o.x || M, y, { size: s, bold: o.bold, color: o.color }); y -= s + (o.lead || 3.6); } };
    const rule = (yy, c = RULE, t = 0.6, x0 = M, x1 = W - M) => page.drawLine({ start: { x: x0, y: yy }, end: { x: x1, y: yy }, thickness: t, color: c });
    const h2 = str => { const ls = wrap(str, B, 12.5, CW); ensure(34 + 15 * ls.length); y -= 12; ls.forEach((l, i) => text(l, M, y - i * 15, { bold: true, size: 12.5 })); y -= 15 * (ls.length - 1) + 8; rule(y, INK, 0.8); y -= 15; };

    // ---- Cover ----
    newPage();
    text(R.area === 'eu' ? 'PAY GAP REPORT' : 'GENDER PAY GAP REPORT', M, y, { size: 8, color: ACCENT, bold: true });
    text(`Prepared ${view.generated}`, W - M, y, { size: 8, color: MUTED, right: true });
    y -= 30;
    for (const l of wrap(employer, B, 22, CW)) { text(l, M, y, { bold: true, size: 22 }); y -= 26; }
    y += 4;
    text(R.area === 'eu' ? `Pay gap reporting for the reference year ${w.snapshot}` : `${title}, ${w.when}`, M, y, { size: 12, color: INK });
    y -= 24;
    const info = [
      ['Rules', R.law],
      [R.area === 'eu' ? 'Reporting' : 'Publish by', R.area === 'eu' ? `${P.euSchedule(h.total).band} in this file. ${w.due}` : `${w.due} (${R.area === 'ie' ? 'not later than 5 months after the snapshot date' : 'within 12 months of the snapshot date'})`],
      [R.area === 'eu' ? 'Workers counted' : 'Employees counted', `${h.total}: ${h.men} men, ${h.women} women${h.neither ? `, ${h.neither} recorded as neither (left out of the figures)` : ''}`],
      [R.area === 'uk' ? 'In the hourly pay figures' : 'With hourly pay', `${h.hourlyMen} men, ${h.hourlyWomen} women${R.area === 'uk' ? ' (full-pay relevant employees)' : ''}`],
    ];
    for (const [k, v] of info) {
      const lines = wrap(v, F, 9.5, CW - 130);
      ensure(14 * lines.length);
      text(k, M, y, { size: 9, color: MUTED });
      lines.forEach((l, i) => text(l, M + 130, y - i * 12.5, { size: 9.5 }));
      y -= 12.5 * lines.length + 5;
    }
    y -= 6;
    // Key figures
    const keyIds = R.area === 'eu' ? ['mean_hourly', 'median_hourly', 'mean_bonus', 'median_bonus'] : ['mean_hourly', 'median_hourly', 'mean_bonus', 'median_bonus'];
    const keyLabel = { mean_hourly: R.area === 'uk' ? 'Mean hourly pay gap' : R.area === 'ie' ? 'Mean hourly gap' : '(a) Mean hourly gap', median_hourly: R.area === 'eu' ? '(c) Median hourly gap' : R.area === 'ie' ? 'Median hourly gap' : 'Median hourly pay gap', mean_bonus: R.area === 'eu' ? '(b) Mean variable pay gap' : 'Mean bonus gap', median_bonus: R.area === 'eu' ? '(d) Median variable pay gap' : 'Median bonus gap' };
    const bh = 54; ensure(bh + 10);
    page.drawRectangle({ x: M, y: y - bh, width: CW, height: bh, color: SOFT });
    keyIds.forEach((id, i) => {
      const f = res.byId[id], x = M + 12 + i * (CW / 4);
      text(keyLabel[id], x, y - 17, { size: 7.5, color: MUTED });
      text(f && f.value != null ? P.pct(f.value, { ascii: true }) : 'n/a', x, y - 39, { size: 17, bold: true });
    });
    y -= bh + 10;
    para('Positive figures mean men are paid more on average; negative figures mean women are. Each gap is the difference between men\'s and women\'s pay as a percentage of men\'s.', { size: 8.5, color: MUTED });

    // ---- Figures table ----
    h2(R.area === 'eu' ? 'Indicators (Article 9(1))' : 'The figures');
    const cMen = M + CW - 200, cWomen = M + CW - 110, cVal = W - M;
    text('Measure', M, y, { size: 8, color: MUTED });
    text('Men', cMen, y, { size: 8, color: MUTED, right: true }); text('Women', cWomen, y, { size: 8, color: MUTED, right: true }); text('Figure', cVal, y, { size: 8, color: MUTED, right: true });
    y -= 6; rule(y); y -= 13;
    const money = v => P.money(v, cur, { ascii: true });
    for (const f of res.figures) {
      if (f.kind === 'categories' || f.kind === 'quartiles') continue;
      const lines = wrap(f.label, B, 9, cMen - M - 70);
      const refLine = `${R.lawShort}, ${f.ref}`;
      ensure(16 + lines.length * 11 + 10);
      lines.forEach((l, i) => text(l, M, y - i * 11, { size: 9, bold: true }));
      const top = y;
      if (f.kind === 'gap') {
        text(f.men.value != null ? money(f.men.value) : 'n/a', cMen, top, { size: 9, right: true });
        text(f.women.value != null ? money(f.women.value) : 'n/a', cWomen, top, { size: 9, right: true });
        text(f.value != null ? P.pct(f.value, { ascii: true }) : 'n/a', cVal, top, { size: 10, bold: true, right: true });
      } else {
        text(f.men.value != null ? P.pct(f.men.value, { ascii: true }) : 'n/a', cMen, top, { size: 9.5, bold: true, right: true });
        text(f.women.value != null ? P.pct(f.women.value, { ascii: true }) : 'n/a', cWomen, top, { size: 9.5, bold: true, right: true });
      }
      y -= lines.length * 11;
      text(refLine, M, y, { size: 7.5, color: ACCENT });
      const sub = f.kind === 'gap' ? `${f.stat === 'mean' ? 'Means' : 'Medians'} of ${f.men.n} men and ${f.women.n} women` : `${f.men.count} of ${f.men.n} men, ${f.women.count} of ${f.women.n} women`;
      text(sub, cWomen, y, { size: 7.5, color: MUTED, right: true });
      y -= 9;
      const note = (f.value == null && f.kind === 'gap') || (f.kind === 'share' && f.men.value == null) ? f.note : '';
      if (note) { for (const l of wrap(note, F, 7.5, CW - 120)) { text(l, M, y, { size: 7.5, color: WARN }); y -= 9; } }
      y -= 5; rule(y + 3, RULE, 0.4);
      y -= 9;
    }

    // ---- Quartiles ----
    const qf = res.byId.quartiles;
    if (qf && qf.bands.length) {
      ensure(40 + 4 * 34 + 30);
      h2(qf.label);
      const lw = 112, bw = CW - lw - 112, bx = M + lw;
      // Highest band first, as the bands read from top to bottom
      [...qf.bands].reverse().forEach(b => {
        const n = b.men + b.women;
        text(`${b.band} band`, M, y - 13, { size: 9.5, bold: true });
        text(`${n} people, ${b.min != null ? money(b.min) : ''} to ${b.max != null ? money(b.max) : ''}`, M, y - 24, { size: 7.5, color: MUTED });
        const wW = n ? bw * b.women / n : 0;
        page.drawRectangle({ x: bx, y: y - 26, width: bw, height: 22, color: SOFT });
        if (wW > 0) page.drawRectangle({ x: bx, y: y - 26, width: wW, height: 22, color: ACCENT });
        if (bw - wW > 0) page.drawRectangle({ x: bx + wW, y: y - 26, width: bw - wW, height: 22, color: MEN });
        const wl = `${P.pct(b.womenPct, { ascii: true })} women`, ml = `${P.pct(b.menPct, { ascii: true })} men`;
        if (wW > F.widthOfTextAtSize(pdfText(wl), 8) + 10) text(wl, bx + 6, y - 18, { size: 8, color: rgb(1, 1, 1), bold: true });
        if (bw - wW > F.widthOfTextAtSize(pdfText(ml), 8) + 10) text(ml, bx + bw - 6, y - 18, { size: 8, color: rgb(1, 1, 1), bold: true, right: true });
        text(`${b.women} women`, W - M, y - 12, { size: 8.5, right: true });
        text(`${b.men} men`, W - M, y - 23, { size: 8.5, right: true });
        y -= 36;
      });
      y -= 6;
      page.drawRectangle({ x: M, y: y - 1, width: 8, height: 8, color: ACCENT }); text('Women', M + 12, y, { size: 8, color: MUTED });
      page.drawRectangle({ x: M + 60, y: y - 1, width: 8, height: 8, color: MEN }); text('Men', M + 72, y, { size: 8, color: MUTED });
      text(`${qf.n} ${R.area === 'uk' ? 'full-pay relevant employees' : R.area === 'ie' ? 'relevant employees' : 'workers'} ranked by hourly pay. ${R.lawShort}, ${qf.ref}.`, M + 110, y, { size: 8, color: MUTED });
      y -= 16;
    }

    // ---- EU categories ----
    const cf = res.byId.categories;
    if (cf) {
      h2(cf.label);
      const cols = [M, M + 150, M + 205, M + 262, M + 322, M + 392, W - M];
      const heads = ['Category', 'Men', 'Women', 'Hourly', 'Basic', 'Variable', 'Annual'];
      heads.forEach((t, i) => text(t, i === 0 ? cols[0] : cols[i], y, { size: 8, color: MUTED, right: i > 0 }));
      y -= 6; rule(y); y -= 12;
      if (!cf.rows.length) { para(cf.note || 'No categories in the file.', { size: 8.5, color: MUTED }); }
      for (const g of cf.rows) {
        ensure(28);
        if (g.flag) page.drawRectangle({ x: M - 4, y: y - 4, width: CW + 8, height: 14, color: rgb(0.99, 0.95, 0.91) });
        text(g.name.length > 34 ? g.name.slice(0, 33) + '.' : g.name, cols[0], y, { size: 8.5, bold: g.flag });
        text(String(g.men), cols[1], y, { size: 8.5, right: true }); text(String(g.women), cols[2], y, { size: 8.5, right: true });
        [g.hourly, g.basic, g.variable, g.annual].forEach((v, i) => text(v == null ? 'n/a' : P.pct(v, { ascii: true }), cols[3 + i], y, { size: 8.5, right: true, bold: i === 0 && g.flag }));
        y -= 11;
        const tag = g.flag ? 'Hourly gap of 5% or more: Article 10 applies unless justified or remedied' : g.annualFlag ? 'Annual gap of 5% or more; hourly gap under 5%' : g.note || '';
        if (tag) { text(tag, cols[0], y, { size: 7.5, color: g.flag ? WARN : MUTED }); y -= 10; }
        y -= 3;
      }
      if (cf.uncategorised) para(`${plural(cf.uncategorised, 'worker')} without a category ${cf.uncategorised === 1 ? 'is' : 'are'} not in this table.`, { size: 8, color: MUTED });
      y -= 2;
      para('Gaps per hour: basic is the ordinary basic wage or salary, variable is complementary or variable pay, each divided by hours paid. Annual is gross pay for the year. Article 10 requires a joint pay assessment with workers\' representatives where a difference of at least 5% in a category is not justified on objective, gender-neutral criteria and not remedied within six months of submitting the report.', { size: 8, color: MUTED });
    }

    // ---- Methodology: on a fresh page unless most of a page is left ----
    if (y < H * 0.45) newPage();
    h2('How these figures were worked out');
    for (const [k, v] of methodology(view)) {
      ensure(30);
      text(k, M, y, { size: 9, bold: true }); y -= 11.5;
      para(v, { size: 8.5, lead: 3.4 });
      y -= 5;
    }

    // ---- Data used ----
    h2('Data used');
    const outs = new Map();
    const reasonOf = o => (o.code === 'duplicate' ? 'Duplicate employee ID, later row left out' : o.code === 'sex' ? 'Not recorded as male or female' : o.text);
    for (const r of view.records) { const o = r.out || r.outHourly; if (o) { const k = reasonOf(o); outs.set(k, (outs.get(k) || 0) + 1); } }
    para(`${view.file.name}: ${plural(view.records.length, 'row')} read${view.sample ? ' (synthetic sample data)' : ''}.`, { size: 8.5 });
    if (outs.size) {
      for (const [k, n] of outs) para(`${n} x ${k}`, { size: 8.5, x: M + 10, width: CW - 10 });
      para('The excluded rows CSV lists each one by row number and employee ID.', { size: 8, color: MUTED });
    } else para('No rows were left out.', { size: 8.5 });

    // ---- Narrative ----
    const narrTitle = R.area === 'ie' ? 'Statement of reasons and measures (Regulation 6(4))' : R.area === 'eu' ? 'Explanation of the figures' : 'Supporting narrative';
    newPage();
    text(narrTitle, M, y, { bold: true, size: 12.5 }); y -= 8; rule(y, INK, 0.8); y -= 16;
    const narrative = String(view.narrative || '').trim() || narrativeTemplate(view);
    for (const block of narrative.split(/\n{2,}/)) {
      const lines = block.split('\n');
      if (lines.length > 1 && lines[0].length < 70 && !/[.:]$/.test(lines[0])) { ensure(30); text(lines[0], M, y, { size: 10, bold: true }); y -= 14; para(lines.slice(1).join('\n'), { size: 9.5, lead: 4 }); }
      else para(block, { size: 9.5, lead: 4 });
      y -= 8;
    }

    // ---- Written statement (UK private and voluntary sector) ----
    if (R.statement) {
      ensure(170);
      y -= 10;
      h2('Written statement');
      para('I confirm that the information in this gender pay gap report is accurate.', { size: 10 });
      y -= 6;
      para('Signed in accordance with regulation 14 of the Equality Act 2010 (Gender Pay Gap Information) Regulations 2017: by a director or equivalent for a body corporate, a designated member for a limited liability partnership, a general or other partner for a partnership, a member of the governing body or a senior officer for an unincorporated body, or otherwise the most senior employee.', { size: 8, color: MUTED });
      y -= 16;
      const line = (label, value, x0, x1) => { page.drawLine({ start: { x: x0, y }, end: { x: x1, y }, thickness: 0.6, color: INK }); if (value) text(value, x0 + 2, y + 5, { size: 10 }); text(label, x0, y - 11, { size: 8, color: MUTED }); };
      line('Name', view.signer && view.signer.name, M, M + CW / 2 - 12);
      line('Job title', view.signer && view.signer.title, M + CW / 2 + 12, W - M);
      y -= 46;
      line('Signature', '', M, M + CW / 2 - 12);
      line('Date', '', M + CW / 2 + 12, W - M);
      y -= 26;
    }

    // ---- Footer ----
    const foot = pdfText(`${employer}, ${w.when}. Calculated from payroll data; not legal advice.`);
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

  return { figureRows, figuresCSV, exclusionsCSV, narrativeTemplate, methodology, pdf, pdfText, UK_FIELDS };
});
