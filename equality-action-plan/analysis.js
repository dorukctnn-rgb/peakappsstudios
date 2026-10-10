/* Equality Action Plan: the Step 1 analysis (Pro) from a payroll or HR export, worked out in the browser.
 * It answers the questions GOV.UK's Step 1 asks employers to answer from their own data: the split of men and women at
 * each pay level and grade, starting pay of the year's hires, bonuses, promotion rates at the same grade, leavers,
 * part-time and flexible working by level, performance ratings, and a baseline for women aged 40 to 60 (the target group
 * the menopause action pages name). A column the file does not have is skipped and named, never guessed.
 * The CSV and XLSX reader, number and flag parsing, quartiles (GOV.UK tie and remainder rules) and statistics are the
 * Pay Gap Report's (paygap.js). Pure functions, no DOM, no network: window.EAPAnalysis in the browser, module.exports in Node. */
(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory(() => require('../pay-gap-report/paygap.js'), require('./rules.js'));
  else root.EAPAnalysis = factory(() => root.PayGap, root.EAPRules);
})(typeof self !== 'undefined' ? self : this, function (getPG, R) {
  'use strict';

  const WEEKS = 52.18;
  const FIELDS = [
    { key: 'id', label: 'Employee ID' },
    { key: 'sex', label: 'Sex', required: true },
    { key: 'hourly', label: 'Hourly pay' },
    { key: 'pay', label: 'Pay (salary or pay for the period)' },
    { key: 'hours', label: 'Weekly hours' },
    { key: 'grade', label: 'Grade or pay band' },
    { key: 'startDate', label: 'Start date' },
    { key: 'startingPay', label: 'Starting pay' },
    { key: 'bonus', label: 'Bonus pay in the 12 months' },
    { key: 'promoted', label: 'Promoted in the 12 months (Y or N)' },
    { key: 'gradeBefore', label: 'Grade before the promotion' },
    { key: 'leaver', label: 'Left in the 12 months (Y or N)' },
    { key: 'leaveDate', label: 'Leaving date' },
    { key: 'partTime', label: 'Part-time (Y or N)' },
    { key: 'flexible', label: 'Flexible working arrangement (Y or N)' },
    { key: 'performance', label: 'Performance rating' },
    { key: 'age', label: 'Age' },
    { key: 'dob', label: 'Date of birth' },
    { key: 'absence', label: 'Absence days in the 12 months' },
  ];
  const LABEL = Object.fromEntries(FIELDS.map(f => [f.key, f.label]));
  const SYN = {
    id: ['employeeid', 'employeeno', 'employeenumber', 'empid', 'empno', 'staffid', 'staffno', 'staffnumber', 'payrollid', 'payrollnumber', 'personnelnumber', 'id', 'ref'],
    sex: ['sex', 'gender', 'legalsex', 'biologicalsex', 'sexatbirth'],
    hourly: ['hourlypay', 'hourlyrate', 'hourlyrateofpay', 'payperhour', 'rateperhour', 'hourly', 'grosshourlypay'],
    pay: ['annualsalary', 'salary', 'basicsalary', 'basicpay', 'annualpay', 'ftesalary', 'fullsalary', 'currentsalary', 'pay', 'ordinarypay', 'grosspay'],
    hours: ['weeklyhours', 'contractedhours', 'contractualhours', 'hoursperweek', 'workinghours', 'hours', 'weeklyworkinghours'],
    grade: ['grade', 'paygrade', 'band', 'payband', 'level', 'joblevel', 'jobgrade', 'gradenow', 'currentgrade'],
    startDate: ['startdate', 'hiredate', 'dateofhire', 'datejoined', 'joindate', 'joined', 'employmentstartdate', 'dateofjoining', 'startofemployment'],
    startingPay: ['startingpay', 'startingsalary', 'salaryathire', 'payathire', 'startsalary', 'initialsalary', 'offersalary', 'startingrate', 'startinghourlypay'],
    bonus: ['bonuspay', 'bonus', 'annualbonus', 'bonus12months', 'bonuspaid', 'bonuspay12months'],
    promoted: ['promoted', 'promotion', 'promotedinyear', 'promotedthisyear', 'promotedin12months', 'promotiondate'],
    gradeBefore: ['gradebefore', 'previousgrade', 'priorgrade', 'gradebeforepromotion', 'oldgrade', 'gradeatstart', 'formergrade'],
    leaver: ['leaver', 'left', 'leftinyear', 'hasleft', 'leavingflag', 'leftin12months'],
    leaveDate: ['leavedate', 'leavingdate', 'enddate', 'terminationdate', 'dateleft', 'employmentenddate', 'dateofleaving'],
    partTime: ['parttime', 'ftpt', 'fulltimeparttime', 'workingpattern', 'pt'],
    flexible: ['flexibleworking', 'flexible', 'flexibleworkingarrangement', 'flexiworking', 'flexitime', 'flexiblearrangement'],
    performance: ['performancerating', 'performance', 'rating', 'appraisalrating', 'performancescore', 'appraisal', 'appraisalscore'],
    age: ['age', 'ageyears', 'ageatsnapshot'],
    dob: ['dateofbirth', 'dob', 'birthdate'],
    absence: ['absencedays', 'sicknessdays', 'sickdays', 'daysabsent', 'sicknessabsencedays', 'absence', 'absencedays12months'],
  };

  function detectMapping(headers) {
    const P = getPG();
    const H = headers.map(P.norm);
    const pairs = [];
    for (const key of Object.keys(SYN)) {
      H.forEach((h, idx) => {
        if (!h) return;
        let score = 0;
        for (const s of SYN[key]) {
          if (h === s) score = Math.max(score, 1000 + s.length);
          else if (s.length >= 5 && h.includes(s)) score = Math.max(score, s.length);
        }
        if (score) pairs.push({ key, idx, score });
      });
    }
    pairs.sort((a, b) => b.score - a.score);
    const map = {}, used = new Set();
    for (const p of pairs) { if (map[p.key] != null || used.has(p.idx)) continue; map[p.key] = p.idx; used.add(p.idx); }
    for (const key of Object.keys(SYN)) if (map[key] == null) map[key] = -1;
    return map;
  }

  // ---------- Values ----------
  const MON = { jan: 1, feb: 2, mar: 3, apr: 4, may: 5, jun: 6, jul: 7, aug: 8, sep: 9, sept: 9, oct: 10, nov: 11, dec: 12 };
  const utc = (y, m, d) => { const t = Date.UTC(y, m - 1, d); const x = new Date(t); return x.getUTCFullYear() === y && x.getUTCMonth() === m - 1 && x.getUTCDate() === d ? t : NaN; };
  // ISO dates, UK day/month/year, "5 April 2026", and Excel serial numbers. Returns ms (UTC midnight), null for blank, NaN if unreadable.
  function parseDate(raw) {
    if (raw == null) return null;
    if (raw instanceof Date) return Number.isFinite(raw.getTime()) ? Date.UTC(raw.getUTCFullYear(), raw.getUTCMonth(), raw.getUTCDate()) : NaN;
    if (typeof raw === 'number') {
      if (!Number.isFinite(raw)) return NaN;
      if (raw > 1000 && raw < 80000) return Date.UTC(1899, 11, 30) + Math.floor(raw) * 864e5;
      return NaN;
    }
    const s = String(raw).trim();
    if (!s) return null;
    let m = /^(\d{4})[-/.](\d{1,2})[-/.](\d{1,2})(?:[T\s].*)?$/.exec(s);
    if (m) return utc(+m[1], +m[2], +m[3]);
    m = /^(\d{1,2})[-/.](\d{1,2})[-/.](\d{2}|\d{4})$/.exec(s);
    if (m) {
      let d = +m[1], mo = +m[2], y = +m[3];
      if (y < 100) y += y < 70 ? 2000 : 1900;
      if (mo > 12 && d <= 12) { const t = d; d = mo; mo = t; } // US order when the day cannot be the month
      return utc(y, mo, d);
    }
    m = /^(\d{1,2})[\s-]+([A-Za-z]{3,9})\.?[\s-]+(\d{4})$/.exec(s);
    if (m) { const mo = MON[m[2].toLowerCase()] || MON[m[2].slice(0, 3).toLowerCase()]; return mo ? utc(+m[3], mo, +m[1]) : NaN; }
    if (/^\d{5}(\.\d+)?$/.test(s)) return parseDate(Number(s));
    return NaN;
  }
  function isoOf(ms) { return new Date(ms).toISOString().slice(0, 10); }
  function ageAt(dobMs, atMs) {
    const a = new Date(dobMs), b = new Date(atMs);
    let age = b.getUTCFullYear() - a.getUTCFullYear();
    if (b.getUTCMonth() < a.getUTCMonth() || (b.getUTCMonth() === a.getUTCMonth() && b.getUTCDate() < a.getUTCDate())) age--;
    return age;
  }
  // The analysis period: the 12 months ending on the snapshot date (6 April 2025 to 5 April 2026 for a 5 April 2026 snapshot).
  function period(snapshotIso) {
    const to = parseDate(snapshotIso);
    const d = new Date(to);
    const from = utc(d.getUTCFullYear() - 1, d.getUTCMonth() + 1, d.getUTCDate()) + 864e5;
    return { from, to, fromIso: isoOf(from), toIso: isoOf(to) };
  }

  // ---------- Rows ----------
  // opts: { snapshot: 'YYYY-MM-DD', mapping }
  function build(table, opts) {
    const P = getPG();
    const map = (opts && opts.mapping) || detectMapping(table.headers);
    const has = k => map[k] != null && map[k] > -1;
    const per = period((opts && opts.snapshot) || '2026-04-05');
    const numKeys = ['hourly', 'pay', 'hours', 'startingPay', 'bonus', 'age', 'absence'].filter(has);
    const vals = [];
    for (const r of table.body) for (const k of numKeys) vals.push(r.cells[map[k]]);
    const dc = P.detectDecimalComma(vals, table.delimiter);
    const issues = { sex: [], dates: [], numbers: [], duplicates: [] };
    const seen = new Map();
    const rows = [];
    for (const { n, cells } of table.body) {
      const get = k => (has(k) ? cells[map[k]] : null);
      const r = { row: n, id: get('id') == null ? '' : String(get('id')).trim() };
      if (r.id) { const k = r.id.toLowerCase(); if (seen.has(k)) { issues.duplicates.push(n); continue; } seen.set(k, n); }
      r.sexRaw = get('sex') == null ? '' : String(get('sex')).trim();
      r.sex = P.parseSex(r.sexRaw);
      const num = k => { if (!has(k)) return null; const v = P.parseNumber(get(k), dc); if (Number.isNaN(v)) { issues.numbers.push({ row: n, key: k }); return null; } return v; };
      const date = k => { if (!has(k)) return null; const v = parseDate(get(k)); if (Number.isNaN(v)) { issues.dates.push({ row: n, key: k }); return null; } return v; };
      const flag = (k, kind) => { if (!has(k)) return null; const f = P.parseFlag(get(k), kind || k); return f.bad ? null : f.v; };
      r.hourly = num('hourly'); r.pay = num('pay'); r.hours = num('hours');
      r.grade = has('grade') && get('grade') != null ? String(get('grade')).trim() : '';
      r.gradeBefore = has('gradeBefore') && get('gradeBefore') != null ? String(get('gradeBefore')).trim() : '';
      r.start = date('startDate'); r.startingPay = num('startingPay'); r.bonus = num('bonus');
      // Promoted: Y or N, or the date of the promotion
      r.promoted = null;
      if (has('promoted')) {
        const raw = get('promoted');
        const f = P.parseFlag(raw, 'promoted');
        if (!f.bad) r.promoted = f.v;
        else { const d = parseDate(raw); r.promoted = Number.isFinite(d) ? d >= per.from && d <= per.to : null; }
      }
      r.leaveDate = date('leaveDate');
      const lf = flag('leaver');
      r.leaver = lf === true || (r.leaveDate != null && r.leaveDate >= per.from && r.leaveDate <= per.to) || false;
      if (r.leaveDate != null && r.leaveDate > per.to && lf !== true) r.leaver = false;
      r.partTime = flag('partTime', 'partTime');
      r.flexible = flag('flexible');
      const pv = has('performance') ? get('performance') : null;
      r.performance = null; r.performanceLabel = '';
      if (pv != null && String(pv).trim() !== '') { const x = P.parseNumber(pv, dc); if (Number.isFinite(x)) r.performance = x; else r.performanceLabel = String(pv).trim(); }
      r.age = num('age');
      if (r.age == null && has('dob')) { const d = date('dob'); if (d != null) r.age = ageAt(d, per.to); }
      r.absence = num('absence');
      // A ranking value for pay levels: hourly pay, else pay over weekly hours, else pay as given
      r.rank = r.hourly > 0 ? r.hourly : r.pay > 0 && r.hours > 0 ? r.pay / r.hours : r.pay > 0 ? r.pay : null;
      r.hire = r.start != null && r.start >= per.from && r.start <= per.to;
      if (!r.sex) issues.sex.push({ row: n, raw: r.sexRaw });
      rows.push(r);
    }
    const basis = has('hourly') ? 'hourly' : has('pay') && has('hours') ? 'pay-per-hour' : has('pay') ? 'pay' : null;
    return { rows, mapping: map, has, period: per, basis, issues, decimalComma: dc, fileRows: table.body.length };
  }

  // ---------- Statistics ----------
  const pct = (a, b) => (b > 0 ? a * 100 / b : null);
  function split(list) { const w = list.filter(r => r.sex === 'F'), m = list.filter(r => r.sex === 'M'); return { w, m }; }
  function fmtPct(v) { if (v == null) return 'n/a'; const P = getPG(); const x = P.round1(v); return (x < 0 ? '−' : '') + Math.abs(x).toFixed(1) + '%'; }
  function fmtMoney(v) { if (v == null || !Number.isFinite(v)) return 'n/a'; return '£' + v.toLocaleString('en-GB', { minimumFractionDigits: 2, maximumFractionDigits: 2 }); }
  function fmtNum(v, dp) { if (v == null || !Number.isFinite(v)) return 'n/a'; return v.toLocaleString('en-GB', { minimumFractionDigits: dp == null ? 1 : dp, maximumFractionDigits: dp == null ? 1 : dp }); }
  const pts = v => (v == null || !Number.isFinite(v) ? 'n/a' : `${v >= 0 ? '' : '−'}${Math.abs(getPG().round1(v)).toFixed(1)} points`);
  const diff = (a, b) => (a == null || b == null ? null : a - b);
  // Grades in a sensible order: by median pay when the file has pay, otherwise by the number or letter in the name
  function orderGrades(groups) {
    const P = getPG();
    const med = g => P.median(g.list.filter(r => r.rank > 0).map(r => r.rank));
    const withPay = groups.every(g => med(g) != null);
    const natural = (a, b) => a.name.localeCompare(b.name, 'en-GB', { numeric: true, sensitivity: 'base' });
    return groups.slice().sort((a, b) => withPay ? (med(a) - med(b)) || natural(a, b) : natural(a, b));
  }

  function analyse(built) {
    const P = getPG();
    const { rows, has, period: per, basis } = built;
    const staff = rows.filter(r => r.sex && !r.leaver);
    const leavers = rows.filter(r => r.sex && r.leaver);
    const sections = [];
    const need = (keys) => keys.filter(k => Array.isArray(k) ? !k.some(has) : !has(k)).map(k => Array.isArray(k) ? k.map(x => LABEL[x]).join(' or ') : LABEL[k]);
    const S = (o) => { sections.push(o); return o; };
    const Q = ['Lower quartile', 'Lower middle quartile', 'Upper middle quartile', 'Upper quartile'];

    // 1. Men and women at each pay level
    let qPeople = null, qBands = null;
    {
      const miss = need([['hourly', 'pay']]);
      const sec = S({ id: 'quartiles', title: 'Men and women in each pay quartile', shows: 'the number of women and men in each pay quartile, with a chart', question: R.STEP1_QUESTIONS[0], needs: ['Sex', 'Hourly pay, or pay'], missing: miss, ok: !miss.length });
      if (sec.ok) {
        qPeople = staff.filter(r => r.rank > 0).map(r => ({ sex: r.sex, hourly: r.rank, ref: r }));
        if (qPeople.length >= 4) {
          qBands = P.quartiles(qPeople);
          // Which band each person is in, for the later sections (ties split by the same rule: assign in rank order)
          const sorted = qPeople.slice().sort((a, b) => a.hourly - b.hourly);
          let i = 0; qBands.forEach((b, bi) => { for (let k = 0; k < b.size; k++) sorted[i++].ref.band = bi; });
          sec.bars = qBands.map((b, i) => ({ label: Q[i], women: b.women, men: b.men }));
          sec.table = { head: ['Quartile', 'Women', 'Men', 'Women’s share'], rows: qBands.map((b, i) => [Q[i], String(b.women), String(b.men), fmtPct(b.womenPct)]).reverse() };
          sec.facts = [`Women hold ${fmtPct(qBands[0].womenPct)} of the lower quartile and ${fmtPct(qBands[3].womenPct)} of the upper quartile.`];
          sec.basis = basis === 'hourly' ? 'Ranked by hourly pay.' : basis === 'pay-per-hour' ? 'Ranked by pay divided by weekly hours, since the file has no hourly pay column.' : 'Ranked by the pay column as given. Without weekly hours, part-time pay ranks lower than its hourly rate would.';
          sec.n = qPeople.length;
          sec.data = { bands: qBands.map(b => ({ women: b.women, men: b.men, womenPct: b.womenPct })) };
        } else { sec.ok = false; sec.empty = 'Fewer than 4 people with pay in the file.'; }
      }
    }

    // 2. Men and women in each grade
    let grades = null;
    {
      const miss = need(['grade']);
      const sec = S({ id: 'grades', title: 'Men and women in each grade', shows: 'women and men in each grade, with a chart and the median hourly pay', question: R.STEP1_QUESTIONS[1], needs: ['Grade or pay band'], missing: miss, ok: !miss.length });
      if (sec.ok) {
        const map = new Map();
        for (const r of staff) { if (!r.grade) continue; if (!map.has(r.grade)) map.set(r.grade, []); map.get(r.grade).push(r); }
        grades = orderGrades([...map.entries()].map(([name, list]) => ({ name, list })));
        if (!grades.length) { sec.ok = false; sec.empty = 'No grades in the file.'; }
        else {
          const showPay = has('hourly');
          sec.bars = grades.map(g => { const s = split(g.list); return { label: g.name, women: s.w.length, men: s.m.length }; });
          sec.table = { head: ['Grade', 'Women', 'Men', 'Women’s share'].concat(showPay ? ['Median hourly pay'] : []), rows: grades.map(g => { const s = split(g.list); return [g.name, String(s.w.length), String(s.m.length), fmtPct(pct(s.w.length, g.list.length))].concat(showPay ? [fmtMoney(P.median(g.list.filter(r => r.hourly > 0).map(r => r.hourly)))] : []); }).reverse() };
          const shares = grades.map(g => ({ name: g.name, v: pct(split(g.list).w.length, g.list.length) }));
          const hi = shares.reduce((a, b) => (b.v > a.v ? b : a)), lo = shares.reduce((a, b) => (b.v < a.v ? b : a));
          sec.facts = [`Women’s share is highest in ${hi.name} (${fmtPct(hi.v)}) and lowest in ${lo.name} (${fmtPct(lo.v)}).`];
          sec.basis = has('hourly') || has('pay') ? 'Grades are ordered by their median pay.' : 'Grades are ordered by name.';
          sec.data = { grades: shares };
        }
      }
    }

    // 3. Starting pay of the year's hires
    {
      const miss = need(['startDate', 'startingPay']);
      const sec = S({ id: 'hires', title: 'Starting pay of people hired in the year', shows: 'hires by sex and the gap in their mean and median starting pay', question: R.STEP1_QUESTIONS[2], needs: ['Start date', 'Starting pay'], missing: miss, ok: !miss.length });
      if (sec.ok) {
        const hires = rows.filter(r => r.sex && r.hire && r.startingPay > 0);
        const s = split(hires);
        const mw = P.mean(s.w.map(r => r.startingPay)), mm = P.mean(s.m.map(r => r.startingPay));
        const dw = P.median(s.w.map(r => r.startingPay)), dm = P.median(s.m.map(r => r.startingPay));
        if (!hires.length) { sec.ok = false; sec.empty = `Nobody in the file started between ${fmtDate(per.from)} and ${fmtDate(per.to)} with a starting pay.`; }
        else {
          sec.table = { head: ['', 'Women', 'Men', 'Gap'], rows: [
            ['Hired in the year, with starting pay', String(s.w.length), String(s.m.length), ''],
            ['Mean starting pay', fmtMoney(mw), fmtMoney(mm), fmtPct(P.gap(mm, mw))],
            ['Median starting pay', fmtMoney(dw), fmtMoney(dm), fmtPct(P.gap(dm, dw))],
          ] };
          sec.facts = [dw != null && dm != null ? `Women hired in the year started on a median of ${fmtMoney(dw)} and men on ${fmtMoney(dm)}: a gap of ${fmtPct(P.gap(dm, dw))}.` : 'Only one sex was hired in the year, so there is no gap to compare.'];
          sec.basis = `Hires are people whose start date falls between ${fmtDate(per.from)} and ${fmtDate(per.to)}, including any who have since left. Starting pay is compared as the file gives it; use full-time equivalent or hourly rates so that part-time starters compare fairly.`;
          sec.data = { women: s.w.length, men: s.m.length, meanGap: P.gap(mm, mw), medianGap: P.gap(dm, dw), meanW: mw, meanM: mm, medianW: dw, medianM: dm };
        }
      }
    }

    // 4. Bonus
    {
      const miss = need(['bonus']);
      const sec = S({ id: 'bonus', title: 'Who receives a bonus, and how much', shows: 'the share of women and men paid a bonus, the bonus gaps and bonuses in each quartile', question: R.STEP1_QUESTIONS[2], needs: ['Bonus pay'], missing: miss, ok: !miss.length });
      if (sec.ok) {
        const s = split(staff);
        const rw = s.w.filter(r => r.bonus > 0), rm = s.m.filter(r => r.bonus > 0);
        const mw = P.mean(rw.map(r => r.bonus)), mm = P.mean(rm.map(r => r.bonus)), dw = P.median(rw.map(r => r.bonus)), dm = P.median(rm.map(r => r.bonus));
        sec.table = { head: ['', 'Women', 'Men', 'Gap'], rows: [
          ['Paid a bonus', `${fmtPct(pct(rw.length, s.w.length))} (${rw.length} of ${s.w.length})`, `${fmtPct(pct(rm.length, s.m.length))} (${rm.length} of ${s.m.length})`, ''],
          ['Mean bonus, of those paid one', fmtMoney(mw), fmtMoney(mm), fmtPct(P.gap(mm, mw))],
          ['Median bonus, of those paid one', fmtMoney(dw), fmtMoney(dm), fmtPct(P.gap(dm, dw))],
        ] };
        if (qBands) {
          sec.byLevel = { head: ['Quartile', 'Women paid a bonus', 'Men paid a bonus'], rows: [0, 1, 2, 3].map(b => { const l = staff.filter(r => r.band === b); const x = split(l); return [Q[b], x.w.length ? fmtPct(pct(x.w.filter(r => r.bonus > 0).length, x.w.length)) : 'No women', x.m.length ? fmtPct(pct(x.m.filter(r => r.bonus > 0).length, x.m.length)) : 'No men']; }).reverse() };
        }
        sec.facts = [`${fmtPct(pct(rw.length, s.w.length))} of women and ${fmtPct(pct(rm.length, s.m.length))} of men were paid a bonus.` + (mw != null && mm != null ? ` Among them, the mean bonus gap is ${fmtPct(P.gap(mm, mw))}.` : '')];
        sec.data = { shareW: pct(rw.length, s.w.length), shareM: pct(rm.length, s.m.length), meanGap: P.gap(mm, mw), medianGap: P.gap(dm, dw) };
      }
    }

    // 5. Promotions at the same grade
    {
      const miss = need(['promoted']);
      const sec = S({ id: 'promotions', title: 'Promotion rates at the same grade', shows: 'the promotion rates of women and men in each grade', question: R.STEP1_QUESTIONS[4], needs: ['Promoted in the 12 months', 'Grade (and grade before the promotion)'], missing: miss, ok: !miss.length });
      if (sec.ok) {
        const known = staff.filter(r => r.promoted != null);
        const gOf = r => (r.promoted && r.gradeBefore ? r.gradeBefore : r.grade);
        const s = split(known);
        const pw = s.w.filter(r => r.promoted).length, pm = s.m.filter(r => r.promoted).length;
        const rowsT = [['All grades', `${fmtPct(pct(pw, s.w.length))} (${pw} of ${s.w.length})`, `${fmtPct(pct(pm, s.m.length))} (${pm} of ${s.m.length})`, pts(diff(pct(pw, s.w.length), pct(pm, s.m.length)))]];
        if (has('grade')) {
          const map = new Map();
          for (const r of known) { const g = gOf(r); if (!g) continue; if (!map.has(g)) map.set(g, []); map.get(g).push(r); }
          for (const g of orderGrades([...map.entries()].map(([name, list]) => ({ name, list })))) {
            const x = split(g.list); const a = x.w.filter(r => r.promoted).length, b = x.m.filter(r => r.promoted).length;
            rowsT.push([g.name, x.w.length ? `${fmtPct(pct(a, x.w.length))} (${a} of ${x.w.length})` : 'No women', x.m.length ? `${fmtPct(pct(b, x.m.length))} (${b} of ${x.m.length})` : 'No men', pts(diff(pct(a, x.w.length), pct(b, x.m.length)))]);
          }
        }
        sec.table = { head: ['Grade', 'Women promoted', 'Men promoted', 'Difference'], rows: rowsT };
        sec.facts = [`${fmtPct(pct(pw, s.w.length))} of women and ${fmtPct(pct(pm, s.m.length))} of men were promoted in the 12 months.`];
        sec.basis = !has('grade') ? 'The file has no grade column, so the rates are for everyone together.' : has('gradeBefore') ? 'People who were promoted are counted in the grade they were promoted from.' : 'The file has no grade before the promotion, so people are counted in their grade now. Add a grade_before column to compare at the grade people were promoted from.';
        sec.data = { rateW: pct(pw, s.w.length), rateM: pct(pm, s.m.length) };
      }
    }

    // 6. Leavers
    {
      const miss = need([['leaver', 'leaveDate']]);
      const sec = S({ id: 'leavers', title: 'Leavers by sex', shows: 'the number of women and men who left and their leaving rates', question: R.STEP1_QUESTIONS[7], needs: ['Left in the 12 months, or leaving date'], missing: miss, ok: !miss.length });
      if (sec.ok) {
        const all = rows.filter(r => r.sex);
        const s = split(all), l = split(leavers);
        if (!leavers.length) { sec.empty = 'Nobody in the file left in the 12 months. If the export holds current staff only, add the people who left during the year.'; sec.ok = false; }
        else {
          sec.table = { head: ['', 'Women', 'Men'], rows: [['Left in the 12 months', String(l.w.length), String(l.m.length)], ['Leaving rate', fmtPct(pct(l.w.length, s.w.length)), fmtPct(pct(l.m.length, s.m.length))]] };
          sec.facts = [`${fmtPct(pct(l.w.length, s.w.length))} of women and ${fmtPct(pct(l.m.length, s.m.length))} of men in the file left during the 12 months.`];
          sec.basis = 'The leaving rate is the people who left in the 12 months over everyone in the file, current staff and leavers.';
          sec.data = { rateW: pct(l.w.length, s.w.length), rateM: pct(l.m.length, s.m.length) };
        }
      }
    }

    // 7. Part-time and flexible working by level
    {
      const miss = need([['partTime', 'flexible']]);
      const sec = S({ id: 'flexible', title: 'Part-time and flexible working at each level', shows: 'part-time and flexible working of women and men at each level', question: R.STEP1_QUESTIONS[6], needs: ['Part-time, or flexible working'], missing: miss, ok: !miss.length });
      if (sec.ok) {
        const levels = qBands ? [0, 1, 2, 3].map(b => ({ name: Q[b], list: staff.filter(r => r.band === b) })) : grades ? grades.map(g => ({ name: g.name, list: g.list })) : [{ name: 'Everyone', list: staff }];
        const cols = [];
        if (has('partTime')) cols.push(['Women part-time', r => r.partTime, 'F'], ['Men part-time', r => r.partTime, 'M']);
        if (has('flexible')) cols.push(['Women with flexible working', r => r.flexible, 'F'], ['Men with flexible working', r => r.flexible, 'M']);
        const share = (list, f, sex) => { const l = list.filter(r => r.sex === sex && f(r) != null); return pct(l.filter(f).length, l.length); };
        const cell = (list, f, sex) => (list.some(r => r.sex === sex) ? fmtPct(share(list, f, sex)) : sex === 'F' ? 'No women' : 'No men');
        sec.table = { head: [qBands ? 'Quartile' : grades ? 'Grade' : ''].concat(cols.map(c => c[0])), rows: levels.map(lv => [lv.name].concat(cols.map(([, f, sex]) => cell(lv.list, f, sex)))).reverse() };
        const top = levels[levels.length - 1], bottom = levels[0];
        const f = has('flexible') ? (r => r.flexible) : (r => r.partTime);
        const word = has('flexible') ? 'have a flexible working arrangement' : 'work part-time';
        const at = lv => { const v = lv.list.some(r => r.sex === 'F') ? share(lv.list, f, 'F') : null; return { v, name: lv.name.toLowerCase(), none: !lv.list.some(r => r.sex === 'F') }; };
        const b0 = at(bottom), t0 = at(top);
        if (levels.length === 1) sec.facts = [`${fmtPct(b0.v)} of women ${word}.`];
        else sec.facts = [(b0.none ? `The ${b0.name} has no women` : `In the ${b0.name}, ${fmtPct(b0.v)} of women ${word}`) + '; ' + (t0.none ? `the ${t0.name} has no women.` : `in the ${t0.name}, ${fmtPct(t0.v)}.`)];
        sec.basis = qBands ? 'Levels are the pay quartiles.' : grades ? 'Levels are the grades.' : 'The file has no pay or grade, so this is for everyone together.';
      }
    }

    // 8. Performance ratings
    {
      const miss = need(['performance']);
      const sec = S({ id: 'performance', title: 'Performance ratings by sex', shows: 'the mean and median rating of women and men, or the share given each rating', question: R.STEP1_QUESTIONS[3], needs: ['Performance rating'], missing: miss, ok: !miss.length });
      if (sec.ok) {
        const num = staff.filter(r => r.performance != null), lab = staff.filter(r => r.performanceLabel);
        if (num.length >= lab.length && num.length) {
          const s = split(num);
          sec.table = { head: ['', 'Women', 'Men'], rows: [['Rated', String(s.w.length), String(s.m.length)], ['Mean rating', fmtNum(P.mean(s.w.map(r => r.performance)), 2), fmtNum(P.mean(s.m.map(r => r.performance)), 2)], ['Median rating', fmtNum(P.median(s.w.map(r => r.performance)), 1), fmtNum(P.median(s.m.map(r => r.performance)), 1)]] };
          sec.facts = [`The mean rating is ${fmtNum(P.mean(s.w.map(r => r.performance)), 2)} for women and ${fmtNum(P.mean(s.m.map(r => r.performance)), 2)} for men.`];
        } else if (lab.length) {
          const labels = [...new Set(lab.map(r => r.performanceLabel))].slice(0, 8);
          const s = split(lab);
          sec.table = { head: ['Rating', 'Women', 'Men'], rows: labels.map(l => [l, fmtPct(pct(s.w.filter(r => r.performanceLabel === l).length, s.w.length)), fmtPct(pct(s.m.filter(r => r.performanceLabel === l).length, s.m.length))]) };
          sec.facts = ['The share of women and of men given each rating.'];
        } else { sec.ok = false; sec.empty = 'No ratings in the file.'; }
      }
    }

    // 9. Women aged 40 to 60: the baseline the menopause action pages ask for
    {
      const miss = need([['age', 'dob']]);
      const sec = S({ id: 'age', title: 'Baseline for women aged 40 to 60', shows: 'headcount, leaving rate and absence of women aged 40 to 60 against everyone else', question: 'You should gather data before you start this action. This can help you monitor any changes for your target group, such as women aged 40 to 60 years.', needs: ['Age, or date of birth'], missing: miss, ok: !miss.length });
      if (sec.ok) {
        const inGroup = r => r.sex === 'F' && r.age != null && r.age >= 40 && r.age <= 60;
        const all = rows.filter(r => r.sex && r.age != null);
        const g = all.filter(inGroup), o = all.filter(r => !inGroup(r));
        const gs = g.filter(r => !r.leaver), os = o.filter(r => !r.leaver);
        const head = ['', 'Women aged 40 to 60', 'Everyone else'];
        const rowsT = [['Current staff', String(gs.length), String(os.length)]];
        if (has('leaver') || has('leaveDate')) rowsT.push(['Leaving rate in the 12 months', fmtPct(pct(g.filter(r => r.leaver).length, g.length)), fmtPct(pct(o.filter(r => r.leaver).length, o.length))]);
        if (has('absence')) rowsT.push(['Mean absence days', fmtNum(P.mean(gs.filter(r => r.absence != null).map(r => r.absence)), 1), fmtNum(P.mean(os.filter(r => r.absence != null).map(r => r.absence)), 1)]);
        sec.table = { head, rows: rowsT };
        sec.facts = [`${gs.length} women aged 40 to 60 work here, ${fmtPct(pct(gs.length, gs.length + os.length))} of current staff with an age in the file.`];
        sec.basis = 'Age is as at the snapshot date. Use this table as the baseline for the menopause actions, and compare it next year.';
        sec.data = { group: gs.length, share: pct(gs.length, gs.length + os.length) };
      }
    }

    const checks = [];
    const iss = built.issues;
    if (iss.sex.length) checks.push(`${iss.sex.length} row${iss.sex.length > 1 ? 's' : ''} not recorded as male or female ${iss.sex.length > 1 ? 'are' : 'is'} left out.`);
    if (iss.duplicates.length) checks.push(`${iss.duplicates.length} row${iss.duplicates.length > 1 ? 's repeat' : ' repeats'} an employee ID and ${iss.duplicates.length > 1 ? 'are' : 'is'} left out.`);
    if (iss.dates.length) checks.push(`${iss.dates.length} date${iss.dates.length > 1 ? 's' : ''} could not be read and ${iss.dates.length > 1 ? 'are' : 'is'} treated as blank.`);
    if (iss.numbers.length) checks.push(`${iss.numbers.length} number${iss.numbers.length > 1 ? 's' : ''} could not be read and ${iss.numbers.length > 1 ? 'are' : 'is'} treated as blank.`);
    const s = split(staff), l = split(leavers);
    return {
      sections, checks, period: per,
      headcount: { staff: staff.length, women: s.w.length, men: s.m.length, leavers: leavers.length, leaversW: l.w.length, leaversM: l.m.length, rows: built.fileRows },
      available: sections.filter(x => x.ok).length,
    };
  }
  function fmtDate(ms) { const d = new Date(ms); return `${d.getUTCDate()} ${R.MONTHS[d.getUTCMonth()]} ${d.getUTCFullYear()}`; }

  // ---------- The six published measures, as the Pay Gap Report works them out (used for the sample) ----------
  function publishedFigures(built) {
    const P = getPG();
    const staff = built.rows.filter(r => r.sex && !r.leaver);
    const recs = staff.map(r => ({ sex: r.sex, hourly: r.hourly, bonus: r.bonus || 0, out: null, outHourly: null }));
    const hp = recs.filter(r => r.hourly > 0);
    const hs = (list, f) => ({ m: list.filter(r => r.sex === 'M').map(f), w: list.filter(r => r.sex === 'F').map(f) });
    const h = hs(hp, r => r.hourly);
    const rec = recs.filter(r => r.bonus > 0), b = hs(rec, r => r.bonus);
    const q = P.quartiles(hp);
    const all = hs(recs, r => r);
    return {
      mh: P.gap(P.mean(h.m), P.mean(h.w)), md: P.gap(P.median(h.m), P.median(h.w)),
      mb: P.gap(P.mean(b.m), P.mean(b.w)), db: P.gap(P.median(b.m), P.median(b.w)),
      bm: pct(b.m.length, all.m.length), bw: pct(b.w.length, all.w.length),
      q1: q[0].womenPct, q2: q[1].womenPct, q3: q[2].womenPct, q4: q[3].womenPct,
    };
  }

  // ---------- The synthetic HR export (420 current employees and the people who left in the year) ----------
  function prng(seed) { let a = seed >>> 0; return () => { a = (a + 0x6D2B79F5) >>> 0; let t = a; t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; }; }
  const ROLES = [
    { role: 'Customer service adviser', grade: 'Grade 1', n: 80, w: 62, lo: 12.6, hi: 13.4, hours: 37.5, ptW: 0.4, ptM: 0.1, flexW: 0.45, flexM: 0.2, bonusP: 0.25, b: [150, 400] },
    { role: 'Warehouse operative', grade: 'Grade 1', n: 120, w: 22, lo: 12.8, hi: 14.2, hours: 40, ptW: 0.2, ptM: 0.05, flexW: 0.1, flexM: 0.05, bonusP: 0.6, b: [250, 700] },
    { role: 'Administrator', grade: 'Grade 2', n: 50, w: 36, lo: 13.2, hi: 14.8, hours: 37.5, ptW: 0.35, ptM: 0.1, flexW: 0.5, flexM: 0.3, bonusP: 0.2, b: [200, 500] },
    { role: 'Driver', grade: 'Grade 2', n: 60, w: 4, lo: 14.4, hi: 16.2, hours: 42.5, ptW: 0, ptM: 0, flexW: 0, flexM: 0.03, bonusP: 0.55, b: [400, 900] },
    { role: 'Team leader', grade: 'Grade 3', n: 40, w: 10, lo: 16.5, hi: 19.5, hours: 40, ptW: 0.1, ptM: 0, flexW: 0.3, flexM: 0.15, bonusP: 0.7, b: [700, 1600] },
    { role: 'Specialist', grade: 'Grade 4', n: 34, w: 14, lo: 20, hi: 28, hours: 37.5, ptW: 0.15, ptM: 0.05, flexW: 0.6, flexM: 0.4, bonusP: 0.6, b: [1200, 3000] },
    { role: 'Manager', grade: 'Grade 5', n: 26, w: 7, lo: 28, hi: 38, hours: 37.5, ptW: 0, ptM: 0, flexW: 0.4, flexM: 0.3, bonusP: 1, b: [3000, 9000] },
    { role: 'Director', grade: 'Grade 6', n: 10, w: 2, lo: 45, hi: 75, hours: 37.5, ptW: 0, ptM: 0, flexW: 0.2, flexM: 0.2, bonusP: 1, b: [15000, 40000] },
  ];
  const SAMPLE_SNAPSHOT = '2026-04-05';
  const SAMPLE_COLUMNS = ['employee_id', 'sex', 'role', 'grade', 'hourly_pay', 'weekly_hours', 'part_time', 'flexible_working', 'start_date', 'starting_pay', 'bonus_pay', 'promoted', 'grade_before', 'leaver', 'leave_date', 'performance_rating', 'age', 'absence_days'];
  function samplePeople() {
    const rnd = prng(20270404);
    const people = [];
    let seq = 0;
    const snap = parseDate(SAMPLE_SNAPSHOT);
    const day = 864e5;
    const pick = (lo, hi) => lo + (hi - lo) * rnd();
    for (const g of ROLES) {
      for (let i = 0; i < g.n; i++) {
        const sex = i < g.w ? 'F' : 'M';
        const pt = rnd() < (sex === 'F' ? g.ptW : g.ptM);
        const hours = pt ? Math.round(pick(16, 30)) : g.hours;
        // Women's pay in the same role sits a little lower in the range, so the gap is not all role mix
        const u = sex === 'F' ? rnd() * 0.85 : 0.1 + rnd() * 0.9;
        const hourly = Math.round((g.lo + (g.hi - g.lo) * u) * 100) / 100;
        const age = Math.round(pick(19, 64));
        const hireP = g.grade === 'Grade 1' ? 0.22 : g.grade === 'Grade 6' ? 0.05 : 0.12;
        const hired = rnd() < hireP;
        const start = hired ? snap - Math.floor(pick(5, 360)) * day : snap - Math.floor(pick(400, 5200)) * day;
        const startingPay = hired ? Math.round(hourly * (sex === 'F' ? 0.97 : 0.99) * 100) / 100 : null;
        const bonus = rnd() < g.bonusP * (sex === 'F' ? 0.75 : 1.08) ? Math.round(pick(g.b[0], g.b[1]) * (sex === 'F' ? 0.85 : 1)) : 0;
        const flexible = rnd() < (sex === 'F' ? g.flexW : g.flexM);
        // Promoted into this grade during the year, from the grade below; nobody is promoted into Grade 1
        const promoteP = g.grade === 'Grade 1' ? 0 : sex === 'F' ? 0.05 : 0.1;
        const promoted = !hired && rnd() < promoteP;
        const gi = Number(g.grade.slice(-1));
        const perf = Math.max(1, Math.min(5, Math.round(pick(2, 4.6) + (sex === 'F' ? -0.05 : 0))));
        const absence = Math.max(0, Math.round(pick(0, 9) + (sex === 'F' && age >= 40 && age <= 60 ? pick(0, 4) : 0)));
        seq++;
        people.push({ id: 'E' + String(seq).padStart(4, '0'), sex, role: g.role, grade: g.grade, hourly, hours, pt, flexible, start, startingPay, bonus, promoted, gradeBefore: promoted ? `Grade ${gi - 1}` : '', leaver: false, leaveDate: null, perf, age, absence });
      }
    }
    // People who left during the 12 months (not in the snapshot figures). More women aged 40 to 60 among them, as a pattern to find.
    const leaverRoles = [['Customer service adviser', 9, 6], ['Warehouse operative', 11, 2], ['Administrator', 6, 4], ['Driver', 5, 0], ['Team leader', 3, 1], ['Specialist', 3, 2], ['Manager', 2, 1]];
    for (const [role, n, w] of leaverRoles) {
      const g = ROLES.find(x => x.role === role);
      for (let i = 0; i < n; i++) {
        const sex = i < w ? 'F' : 'M';
        const age = sex === 'F' && i % 2 === 0 ? Math.round(pick(42, 58)) : Math.round(pick(20, 62));
        const leaveDate = snap - Math.floor(pick(10, 350)) * day;
        seq++;
        people.push({ id: 'E' + String(seq).padStart(4, '0'), sex, role, grade: g.grade, hourly: Math.round(pick(g.lo, g.hi) * 100) / 100, hours: g.hours, pt: false, flexible: false, start: leaveDate - Math.floor(pick(200, 3000)) * day, startingPay: null, bonus: 0, promoted: false, gradeBefore: '', leaver: true, leaveDate, perf: 3, age, absence: Math.round(pick(0, 12)) });
      }
    }
    return people;
  }
  function sampleCSV() {
    const yn = b => (b ? 'Y' : 'N');
    const lines = [SAMPLE_COLUMNS.join(',')];
    for (const p of samplePeople()) {
      lines.push([p.id, p.sex, p.role, p.grade, p.hourly.toFixed(2), p.hours, yn(p.pt), yn(p.flexible), isoOf(p.start), p.startingPay == null ? '' : p.startingPay.toFixed(2), p.bonus ? p.bonus.toFixed(2) : '0.00', yn(p.promoted), p.gradeBefore, yn(p.leaver), p.leaveDate == null ? '' : isoOf(p.leaveDate), p.perf, p.age, p.absence].join(','));
    }
    return lines.join('\r\n') + '\r\n';
  }

  return { FIELDS, LABEL, SYN, detectMapping, parseDate, isoOf, ageAt, period, build, analyse, publishedFigures, sampleCSV, samplePeople, SAMPLE_SNAPSHOT, SAMPLE_COLUMNS, fmtPct, fmtMoney, WEEKS };
});
