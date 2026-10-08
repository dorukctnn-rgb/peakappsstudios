/* Pay Gap Report engine: reads a payroll export (CSV or XLSX), maps its columns, runs the data checks and
 * works out the statutory gender pay gap measures for:
 *   UK private and voluntary sector: The Equality Act 2010 (Gender Pay Gap Information) Regulations 2017, SI 2017/172
 *   UK public sector: The Equality Act 2010 (Specific Duties and Public Authorities) Regulations 2017, SI 2017/353, Sch. 1
 *   Ireland: S.I. No. 264 of 2022, as amended by S.I. No. 259 of 2024 and S.I. No. 212 of 2025
 *   EU: Directive (EU) 2023/970, Article 9 (indicators a to g) and the Article 10 threshold of 5%
 * Rules checked against the official texts on 8 October 2026. Pure functions, no DOM:
 * window.PayGap in the browser, module.exports in Node (unit tests). Nothing here touches the network. */
(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory();
  else root.PayGap = factory();
})(typeof self !== 'undefined' ? self : this, function () {
  'use strict';

  const CHECKED = '8 October 2026';
  // Ireland: Reg. 4(1)(b)(i) of S.I. 264/2022 as amended by S.I. 259/2024 (A / 12 x 52.18). Also used to turn weekly hours into a year.
  const WEEKS_PER_YEAR = 52.18;
  // UK: reg. 6(2) and 6(3) of SI 2017/172. The multiplier is 7 divided by the days in the pay period; a month counts as 30.44 days.
  const PERIOD_DAYS = { weekly: 7, fortnightly: 14, 'four-weekly': 28, monthly: 30.44 };
  const BANDS = ['Lower', 'Lower middle', 'Upper middle', 'Upper'];
  const FREE = new Set(['mean_hourly', 'median_hourly']);
  const OUTLIER_FACTOR = 10;

  // ---------- Regimes ----------
  const REGIMES = {
    uk_private: {
      id: 'uk_private', name: 'UK, private and voluntary sector', short: 'UK private and voluntary', area: 'uk',
      currency: 'GBP', locale: 'en-GB', basis: 'uk', threshold: 250, statement: true,
      law: 'The Equality Act 2010 (Gender Pay Gap Information) Regulations 2017 (SI 2017/172)',
      lawShort: 'SI 2017/172',
      refs: { mean_hourly: 'reg. 2(1)(a) and 8', median_hourly: 'reg. 2(1)(b) and 9', mean_bonus: 'reg. 2(1)(c) and 10', median_bonus: 'reg. 2(1)(d) and 11', bonus_share: 'reg. 2(1)(e) and 12', quartiles: 'reg. 2(1)(f) and 13' },
    },
    uk_public: {
      id: 'uk_public', name: 'UK, public sector (England and listed bodies)', short: 'UK public sector', area: 'uk',
      currency: 'GBP', locale: 'en-GB', basis: 'uk', threshold: 250, statement: false,
      law: 'The Equality Act 2010 (Specific Duties and Public Authorities) Regulations 2017 (SI 2017/353), Schedule 1',
      lawShort: 'SI 2017/353, Schedule 1',
      refs: { mean_hourly: 'Sch. 1 paras 2(1)(a) and 8', median_hourly: 'Sch. 1 paras 2(1)(b) and 9', mean_bonus: 'Sch. 1 paras 2(1)(c) and 10', median_bonus: 'Sch. 1 paras 2(1)(d) and 11', bonus_share: 'Sch. 1 paras 2(1)(e) and 12', quartiles: 'Sch. 1 paras 2(1)(f) and 13' },
    },
    ireland: {
      id: 'ireland', name: 'Ireland', short: 'Ireland', area: 'ie',
      currency: 'EUR', locale: 'en-IE', basis: 'period', threshold: 50, statement: false,
      law: 'Employment Equality Act 1998 (Section 20A) (Gender Pay Gap Information) Regulations 2022 (S.I. No. 264 of 2022), as amended by S.I. No. 259 of 2024 and S.I. No. 212 of 2025',
      lawShort: 'S.I. No. 264 of 2022, as amended',
      refs: { mean_hourly: 'Reg. 7(1)(a)', median_hourly: 'Reg. 8(1)(a)', mean_hourly_pt: 'Reg. 7(1)(b)', median_hourly_pt: 'Reg. 8(1)(b)', mean_hourly_temp: 'Reg. 7(1)(c)', median_hourly_temp: 'Reg. 8(1)(c)', mean_bonus: 'Reg. 9(1)(a)', median_bonus: 'Reg. 9(1)(b)', bonus_share: 'Reg. 9(1)(c)', bik_share: 'Reg. 9(1)(d)', quartiles: 'Reg. 10' },
    },
    eu: {
      id: 'eu', name: 'EU Pay Transparency Directive', short: 'EU directive', area: 'eu',
      currency: 'EUR', locale: 'en-IE', basis: 'period', threshold: 100, statement: false,
      law: 'Directive (EU) 2023/970 of the European Parliament and of the Council of 10 May 2023',
      lawShort: 'Directive (EU) 2023/970',
      refs: { mean_hourly: 'Art. 9(1)(a)', mean_annual: 'Art. 9(1)(a)', mean_bonus: 'Art. 9(1)(b)', median_hourly: 'Art. 9(1)(c)', median_annual: 'Art. 9(1)(c)', median_bonus: 'Art. 9(1)(d)', bonus_share: 'Art. 9(1)(e)', quartiles: 'Art. 9(1)(f)', categories: 'Art. 9(1)(g) and 10' },
    },
  };

  const LABELS = {
    uk: {
      mean_hourly: 'Mean gender pay gap in hourly pay',
      median_hourly: 'Median gender pay gap in hourly pay',
      mean_bonus: 'Mean gender pay gap in bonus pay',
      median_bonus: 'Median gender pay gap in bonus pay',
      bonus_share: 'Proportion of men and women paid bonus pay',
      quartiles: 'Proportion of men and women in each quartile pay band',
    },
    ie: {
      mean_hourly: 'Mean hourly remuneration gap, all employees',
      median_hourly: 'Median hourly remuneration gap, all employees',
      mean_hourly_pt: 'Mean hourly remuneration gap, part-time employees',
      median_hourly_pt: 'Median hourly remuneration gap, part-time employees',
      mean_hourly_temp: 'Mean hourly remuneration gap, employees on temporary contracts',
      median_hourly_temp: 'Median hourly remuneration gap, employees on temporary contracts',
      mean_bonus: 'Mean bonus remuneration gap',
      median_bonus: 'Median bonus remuneration gap',
      bonus_share: 'Percentage of men and women paid bonus remuneration',
      bik_share: 'Percentage of men and women who received benefits in kind',
      quartiles: 'Percentage of men and women in each quartile pay band',
    },
    eu: {
      mean_hourly: '(a) Gender pay gap, mean, gross hourly pay',
      mean_annual: '(a) Gender pay gap, mean, gross annual pay',
      mean_bonus: '(b) Gender pay gap in complementary or variable components, mean',
      median_hourly: '(c) Median gender pay gap, gross hourly pay',
      median_annual: '(c) Median gender pay gap, gross annual pay',
      median_bonus: '(d) Median gender pay gap in complementary or variable components',
      bonus_share: '(e) Proportion of female and male workers receiving complementary or variable components',
      quartiles: '(f) Proportion of female and male workers in each quartile pay band',
      categories: '(g) Gender pay gap by category of workers, basic and complementary or variable pay',
    },
  };
  const ORDER = {
    uk: ['mean_hourly', 'median_hourly', 'mean_bonus', 'median_bonus', 'bonus_share', 'quartiles'],
    ie: ['mean_hourly', 'median_hourly', 'mean_hourly_pt', 'median_hourly_pt', 'mean_hourly_temp', 'median_hourly_temp', 'mean_bonus', 'median_bonus', 'bonus_share', 'bik_share', 'quartiles'],
    eu: ['mean_hourly', 'mean_annual', 'mean_bonus', 'median_hourly', 'median_annual', 'median_bonus', 'bonus_share', 'quartiles', 'categories'],
  };
  function measureList(regimeId) {
    const R = REGIMES[regimeId];
    return ORDER[R.area].map(id => ({ id, label: LABELS[R.area][id], ref: R.refs[id], free: FREE.has(id) }));
  }

  // ---------- Fields of the payroll file ----------
  // What each column means depends on the regime; the labels below are what the mapping screen shows.
  const FIELDS = [
    { key: 'id', need: 'all' },
    { key: 'sex', need: 'all', required: true },
    { key: 'hourly', need: 'all' },
    { key: 'ordinary', need: 'all' },
    { key: 'bonusPeriod', need: 'uk' },
    { key: 'hours', need: 'all' },
    { key: 'payPeriod', need: 'uk' },
    { key: 'bonus', need: 'all' },
    { key: 'fullPay', need: 'uk' },
    { key: 'partTime', need: 'ie' },
    { key: 'temporary', need: 'ie' },
    { key: 'bik', need: 'ie' },
    { key: 'category', need: 'eu' },
  ];
  function fieldLabel(key, regimeId) {
    const a = REGIMES[regimeId].area;
    const L = {
      id: 'Employee ID',
      sex: 'Sex',
      hourly: a === 'uk' ? 'Hourly rate of pay, if already worked out' : a === 'ie' ? 'Hourly remuneration, if already worked out' : 'Gross hourly pay, if already worked out',
      ordinary: a === 'uk' ? 'Ordinary pay in the relevant pay period' : a === 'ie' ? 'Ordinary pay, 12 months to the snapshot date' : 'Ordinary basic wage or salary, reference year',
      bonusPeriod: 'Bonus pay in the relevant pay period (prorated)',
      hours: a === 'uk' ? 'Weekly working hours' : a === 'ie' ? 'Working hours, 12 months to the snapshot date' : 'Hours paid, reference year',
      payPeriod: 'Pay period (weekly, fortnightly, four-weekly or monthly)',
      bonus: a === 'uk' ? 'Bonus pay, 12 months to the snapshot date' : a === 'ie' ? 'Bonus remuneration, 12 months to the snapshot date' : 'Complementary or variable components, reference year',
      fullPay: 'Full-pay relevant employee (Y or N)',
      partTime: 'Part-time employee (Y or N)',
      temporary: 'Temporary contract (Y or N)',
      bik: 'Received benefits in kind (Y or N)',
      category: 'Category of workers',
    };
    return L[key];
  }
  function fieldsFor(regimeId) {
    const a = REGIMES[regimeId].area;
    return FIELDS.filter(f => f.need === 'all' || f.need === a).map(f => Object.assign({ label: fieldLabel(f.key, regimeId) }, f));
  }

  const SYN = {
    id: ['employeeid', 'employeeno', 'employeenumber', 'employeeref', 'empid', 'empno', 'employee', 'staffid', 'staffno', 'staffnumber', 'payrollid', 'payrollno', 'payrollnumber', 'personnelnumber', 'personnelno', 'worksnumber', 'id', 'ref', 'reference'],
    sex: ['sex', 'gender', 'legalsex', 'biologicalsex', 'sexatbirth'],
    hourly: ['hourlypay', 'hourlyrate', 'hourlyrateofpay', 'hourlyremuneration', 'hourlypaylevel', 'grosshourlypay', 'rateperhour', 'payperhour', 'hourly'],
    ordinary: ['ordinarypay', 'basicpay', 'basicsalary', 'basicwage', 'basic', 'grossbasicpay', 'grosspay', 'ordinarypayinperiod', 'payinperiod', 'salary', 'annualsalary', 'annualbasicpay', 'basicannualpay', 'pay', 'wages'],
    bonusPeriod: ['bonusinperiod', 'bonusinpayperiod', 'bonuspayinperiod', 'bonusthisperiod', 'periodbonus', 'bonusinrelevantpayperiod', 'proratedbonus', 'bonusprorated'],
    hours: ['hours', 'weeklyhours', 'weeklyworkinghours', 'contractedhours', 'contractualhours', 'workinghours', 'hoursperweek', 'annualhours', 'hoursworked', 'totalhours', 'hoursinperiod', 'totalworkinghours', 'hourspaid'],
    payPeriod: ['payperiod', 'payfrequency', 'frequency', 'payrollfrequency', 'payfreq', 'paycycle'],
    bonus: ['bonuspay', 'bonus', 'bonus12months', 'bonus12m', 'bonuspay12months', 'bonuspaid', 'annualbonus', 'bonusremuneration', 'variablepay', 'variable', 'complementaryorvariablepay', 'complementaryorvariable', 'variablecomponents', 'commission', 'bonusandcommission'],
    fullPay: ['fullpay', 'fullpayrelevant', 'fullpayrelevantemployee', 'fullpayemployee', 'onfullpay'],
    partTime: ['parttime', 'pt', 'parttimeemployee', 'ftpt', 'fulltimeparttime', 'workingpattern'],
    temporary: ['temporary', 'temp', 'temporarycontract', 'fixedterm', 'contracttype', 'contract', 'permanenttemporary'],
    bik: ['benefitinkind', 'benefitsinkind', 'bik', 'receivedbik', 'receivedbenefitsinkind'],
    category: ['category', 'workercategory', 'categoryofworkers', 'workerscategory', 'jobcategory', 'jobfamily', 'paygrade', 'grade', 'jobgrade', 'band', 'level', 'role'],
  };
  const norm = s => String(s == null ? '' : s).toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^a-z0-9]/g, '');

  // Best column for each field: exact header names first, then the longest known name the header contains.
  function detectMapping(headers) {
    const H = headers.map(norm);
    const pairs = [];
    for (const key of Object.keys(SYN)) {
      H.forEach((h, idx) => {
        if (!h) return;
        let score = 0;
        for (const s of SYN[key]) {
          if (h === s) score = Math.max(score, 1000 + s.length);
          else if (s.length >= 4 && h.includes(s)) score = Math.max(score, s.length);
          else if (s.length >= 3 && h.startsWith(s)) score = Math.max(score, s.length);
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
  // The header is the row (among the first ten) that names the most known columns.
  function findHeaderRow(rows) {
    let best = 0, bestScore = -1;
    const all = new Set([].concat(...Object.values(SYN)));
    for (let i = 0; i < Math.min(rows.length, 10); i++) {
      const sc = rows[i].filter(c => all.has(norm(c))).length;
      if (sc > bestScore) { best = i; bestScore = sc; }
    }
    return bestScore > 0 ? best : 0;
  }

  // ---------- Reading values ----------
  const MALE = new Set(['m', 'male', 'man', 'men', 'h', 'homme', 'mann', 'mannlich', 'maennlich']);
  const FEMALE = new Set(['f', 'female', 'woman', 'women', 'w', 'v', 'femme', 'frau', 'weiblich', 'vrouw']);
  function parseSex(raw, sexMap) {
    const key = String(raw == null ? '' : raw).trim();
    const n = norm(key);
    if (sexMap && Object.prototype.hasOwnProperty.call(sexMap, key)) return sexMap[key] === 'M' || sexMap[key] === 'F' ? sexMap[key] : null;
    if (MALE.has(n)) return 'M';
    if (FEMALE.has(n)) return 'F';
    return null;
  }

  // Numbers as payroll files write them: 1,234.56 | 1.234,56 | 1 234,56 | £1,234 | (12.50) | -12.5 | 12.5-
  function parseNumber(raw, decimalComma) {
    if (raw == null) return null;
    if (typeof raw === 'number') return Number.isFinite(raw) ? raw : NaN;
    let s = String(raw).trim();
    if (!s) return null;
    let neg = false;
    if (/^\(.*\)$/.test(s)) { neg = true; s = s.slice(1, -1).trim(); }
    s = s.replace(/[\s    ']/g, '').replace(/^(GBP|EUR|USD)/i, '').replace(/(GBP|EUR|USD)$/i, '').replace(/[£€$]/g, '');
    if (/^[-−]/.test(s)) { neg = !neg; s = s.slice(1); }
    if (/-$/.test(s)) { neg = !neg; s = s.slice(0, -1); }
    s = s.replace(/^[£€$]/, '');
    const dot = s.lastIndexOf('.'), comma = s.lastIndexOf(',');
    if (dot > -1 && comma > -1) {
      s = comma > dot ? s.replace(/\./g, '').replace(',', '.') : s.replace(/,/g, '');
    } else if (comma > -1) {
      if (decimalComma && s.indexOf(',') === comma) s = s.replace(',', '.');
      else if (/^\d{1,3}(,\d{3})+$/.test(s)) s = s.replace(/,/g, '');
      else if (s.indexOf(',') === comma) s = s.replace(',', '.');
      else return NaN;
    } else if (dot > -1 && decimalComma && /^\d{1,3}(\.\d{3})+$/.test(s)) {
      s = s.replace(/\./g, '');
    }
    if (!/^(\d+\.?\d*|\.\d+)$/.test(s)) return NaN;
    const v = Number(s);
    return neg ? -v : v;
  }
  // A file uses decimal commas when values end in ",5" or ",50" and none end in ".5" or ".50".
  function detectDecimalComma(values, delimiter) {
    let comma = 0, dot = 0;
    for (const v of values) {
      if (typeof v !== 'string') continue;
      const s = v.trim();
      if (/\d,\d{1,2}$/.test(s) && !/^\d{1,3}(,\d{3})+$/.test(s)) comma++;
      if (/\d\.\d{1,2}$/.test(s) && !/^\d{1,3}(\.\d{3})+$/.test(s)) dot++;
    }
    if (comma || dot) return comma > dot;
    return delimiter === ';';
  }
  function parseFlag(raw, kind) {
    if (raw == null) return { v: null };
    if (typeof raw === 'boolean') return { v: raw };
    if (typeof raw === 'number') return { v: raw !== 0 };
    const s = String(raw).trim().toLowerCase().replace(/\s+/g, ' ');
    if (!s) return { v: null };
    if (/^(y|yes|true|1|x)$/.test(s)) return { v: true };
    if (/^(n|no|false|0)$/.test(s)) return { v: false };
    if (kind === 'partTime') {
      if (/^(pt|p\/t|part[ -]?time)$/.test(s)) return { v: true };
      if (/^(ft|f\/t|full[ -]?time)$/.test(s)) return { v: false };
    }
    if (kind === 'temporary') {
      if (/^(temp|temporary|fixed[ -]?term|fixed)$/.test(s)) return { v: true };
      if (/^(perm|permanent|indefinite|open[ -]?ended)$/.test(s)) return { v: false };
    }
    if (kind === 'fullPay') {
      if (/^(full|full[ -]?pay|full[ -]?pay relevant)$/.test(s)) return { v: true };
      if (/^(reduced|reduced[ -]?pay|nil|nil[ -]?pay|no pay|unpaid)$/.test(s)) return { v: false };
    }
    if (kind === 'bik') {
      const n = parseNumber(s, false);
      if (Number.isFinite(n)) return { v: n !== 0 };
    }
    return { v: null, bad: true };
  }
  function parsePeriodDays(raw) {
    if (raw == null) return { v: null };
    if (typeof raw === 'number') return raw > 0 ? { v: raw } : { v: null, bad: true };
    const s = String(raw).trim().toLowerCase().replace(/\s+/g, ' ');
    if (!s) return { v: null };
    if (/^(w|wk|week|weekly|1 ?w|1 week)$/.test(s)) return { v: PERIOD_DAYS.weekly };
    if (/^(2 ?w|fortnight|fortnightly|bi-?weekly|2 ?weekly|two[ -]?weekly)$/.test(s)) return { v: PERIOD_DAYS.fortnightly };
    if (/^(4 ?w|four[ -]?weekly|4[ -]?weekly|lunar|lunar monthly)$/.test(s)) return { v: PERIOD_DAYS['four-weekly'] };
    if (/^(m|mth|month|monthly|calendar monthly)$/.test(s)) return { v: PERIOD_DAYS.monthly };
    const n = Number(s.replace(/ ?days?$/, ''));
    if (Number.isFinite(n) && n > 0) return { v: n };
    return { v: null, bad: true };
  }

  // ---------- Statistics ----------
  function mean(xs) { if (!xs.length) return null; let s = 0; for (const x of xs) s += x; return s / xs.length; }
  function median(xs) {
    if (!xs.length) return null;
    const a = xs.slice().sort((p, q) => p - q), n = a.length, h = n >> 1;
    return n % 2 ? a[h] : (a[h - 1] + a[h]) / 2;
  }
  // (A - B) / A x 100, with A the figure for men. Positive: men are paid more.
  function gap(male, female) {
    if (male == null || female == null || !(male > 0)) return null;
    return (male - female) / male * 100;
  }
  function share(part, whole) { return whole > 0 ? part * 100 / whole : null; }
  // One decimal place. An exact half goes to the even digit, so a quarter split such as 16.25 and 83.75
  // shows as 16.2 and 83.8 and still adds up to 100.0.
  function round1(x) {
    if (x == null || !Number.isFinite(x)) return null;
    const v = x * 10, f = Math.floor(v), d = v - f;
    const r = Math.abs(d - 0.5) < 1e-9 ? (f % 2 === 0 ? f : f + 1) : Math.round(v);
    return r / 10 || 0;
  }
  const tieKey = x => Math.round(x * 1e6);

  // Quartile pay bands as the regulations and the GOV.UK guidance set them out:
  // rank by hourly pay, split into four groups as equal as possible (one left over goes to the lower band;
  // two to the lower and upper middle; three to the lower, lower middle and upper middle), and where people
  // on the same hourly pay straddle a dividing line, give each band the same mix of men and women.
  function quartileSizes(n) {
    const k = Math.floor(n / 4), r = n % 4;
    return [k + (r >= 1 ? 1 : 0), k + (r >= 3 ? 1 : 0), k + (r >= 2 ? 1 : 0), k];
  }
  function quartiles(people) {
    const n = people.length;
    const sizes = quartileSizes(n);
    const edge = [0, sizes[0], sizes[0] + sizes[1], sizes[0] + sizes[1] + sizes[2], n];
    const sorted = people.slice().sort((a, b) => a.hourly - b.hourly);
    const bands = BANDS.map((name, i) => ({ band: name, size: sizes[i], men: 0, women: 0, min: null, max: null, split: false }));
    let pos = 0;
    for (let i = 0; i < sorted.length;) {
      let j = i;
      const key = tieKey(sorted[i].hourly);
      while (j < sorted.length && tieKey(sorted[j].hourly) === key) j++;
      const group = sorted.slice(i, j), gs = group.length;
      const gm = group.filter(p => p.sex === 'M').length;
      const over = edge.slice(0, 4).map((lo, b) => Math.max(0, Math.min(pos + gs, edge[b + 1]) - Math.max(pos, lo)));
      const exact = over.map(c => gm * c / gs);
      const men = exact.map(Math.floor);
      let left = gm - men.reduce((a, b) => a + b, 0);
      const order = [0, 1, 2, 3].filter(b => over[b] > 0).sort((a, b) => (exact[b] - men[b]) - (exact[a] - men[a]) || a - b);
      for (const b of order) { if (left <= 0) break; if (exact[b] - men[b] > 1e-12) { men[b]++; left--; } }
      const touched = over.filter(c => c > 0).length;
      over.forEach((c, b) => {
        if (!c) return;
        const B = bands[b];
        B.men += men[b]; B.women += c - men[b];
        const v = group[0].hourly;
        B.min = B.min == null ? v : Math.min(B.min, v); B.max = B.max == null ? v : Math.max(B.max, v);
        if (touched > 1) B.split = true;
      });
      pos += gs; i = j;
    }
    return bands.map(B => Object.assign(B, { menPct: share(B.men, B.men + B.women), womenPct: share(B.women, B.men + B.women) }));
  }

  // ---------- CSV ----------
  function parseCSV(text) {
    let s = String(text || '');
    if (s.charCodeAt(0) === 0xFEFF) s = s.slice(1);
    const first = (s.match(/^[^\r\n]*/) || [''])[0];
    const count = ch => { let n = 0, q = false; for (const c of first) { if (c === '"') q = !q; else if (c === ch && !q) n++; } return n; };
    const cands = [',', ';', '\t', '|'].map(d => [d, count(d)]).sort((a, b) => b[1] - a[1]);
    const delim = cands[0][1] > 0 ? cands[0][0] : ',';
    const rows = [];
    let row = [], field = '', q = false, i = 0;
    while (i < s.length) {
      const c = s[i];
      if (q) {
        if (c === '"') { if (s[i + 1] === '"') { field += '"'; i += 2; continue; } q = false; i++; continue; }
        field += c; i++; continue;
      }
      if (c === '"' && field === '') { q = true; i++; continue; }
      if (c === delim) { row.push(field); field = ''; i++; continue; }
      if (c === '\r' || c === '\n') {
        row.push(field); rows.push(row); row = []; field = '';
        if (c === '\r' && s[i + 1] === '\n') i++;
        i++; continue;
      }
      field += c; i++;
    }
    if (field !== '' || row.length) { row.push(field); rows.push(row); }
    while (rows.length && rows[rows.length - 1].every(c => String(c).trim() === '')) rows.pop();
    return { rows, delimiter: delim };
  }

  // ---------- XLSX (first worksheet; a small reader so no spreadsheet library is needed) ----------
  async function inflateRawDefault(bytes) {
    const ds = new DecompressionStream('deflate-raw');
    const stream = new Blob([bytes]).stream().pipeThrough(ds);
    return new Uint8Array(await new Response(stream).arrayBuffer());
  }
  function unzipIndex(u8) {
    const dv = new DataView(u8.buffer, u8.byteOffset, u8.byteLength);
    let eocd = -1;
    for (let i = u8.length - 22; i >= Math.max(0, u8.length - 22 - 65535); i--) if (dv.getUint32(i, true) === 0x06054b50) { eocd = i; break; }
    if (eocd < 0) throw new Error('not a zip');
    const count = dv.getUint16(eocd + 10, true);
    let p = dv.getUint32(eocd + 16, true);
    const files = {};
    const dec = new TextDecoder();
    for (let k = 0; k < count; k++) {
      if (dv.getUint32(p, true) !== 0x02014b50) throw new Error('bad zip directory');
      const method = dv.getUint16(p + 10, true), csize = dv.getUint32(p + 20, true), size = dv.getUint32(p + 24, true);
      const nlen = dv.getUint16(p + 28, true), xlen = dv.getUint16(p + 30, true), clen = dv.getUint16(p + 32, true), off = dv.getUint32(p + 42, true);
      const name = dec.decode(u8.subarray(p + 46, p + 46 + nlen));
      files[name] = { method, csize, size, off };
      p += 46 + nlen + xlen + clen;
    }
    return { files, dv };
  }
  async function unzipRead(u8, idx, name, inflateRaw) {
    const f = idx.files[name];
    if (!f) return null;
    if (f.size > 200 * 1024 * 1024) throw new Error('too large');
    const dv = idx.dv;
    if (dv.getUint32(f.off, true) !== 0x04034b50) throw new Error('bad zip entry');
    const start = f.off + 30 + dv.getUint16(f.off + 26, true) + dv.getUint16(f.off + 28, true);
    const data = u8.subarray(start, start + f.csize);
    const raw = f.method === 0 ? data : f.method === 8 ? await inflateRaw(data) : null;
    if (!raw) throw new Error('unsupported compression');
    return new TextDecoder().decode(raw);
  }
  const xmlText = s => String(s).replace(/_x([0-9A-Fa-f]{4})_/g, (_, h) => String.fromCharCode(parseInt(h, 16)))
    .replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"').replace(/&apos;/g, "'")
    .replace(/&#x([0-9a-f]+);/gi, (_, h) => String.fromCodePoint(parseInt(h, 16))).replace(/&#(\d+);/g, (_, d) => String.fromCodePoint(Number(d))).replace(/&amp;/g, '&');
  const colIndex = ref => { let n = 0; for (const ch of ref) n = n * 26 + (ch.charCodeAt(0) - 64); return n - 1; };
  async function parseXLSX(bytes, inflateRaw) {
    const u8 = bytes instanceof Uint8Array ? bytes : new Uint8Array(bytes);
    const idx = unzipIndex(u8);
    const inflate = inflateRaw || inflateRawDefault;
    let sheetPath = 'xl/worksheets/sheet1.xml', sheetName = '';
    const wb = await unzipRead(u8, idx, 'xl/workbook.xml', inflate);
    const rels = await unzipRead(u8, idx, 'xl/_rels/workbook.xml.rels', inflate);
    if (wb && rels) {
      const sh = wb.match(/<(?:\w+:)?sheet\b[^>]*>/);
      if (sh) {
        const rid = (sh[0].match(/\br:id="([^"]+)"/) || sh[0].match(/\b\w+:id="([^"]+)"/) || [])[1];
        sheetName = xmlText((sh[0].match(/\bname="([^"]*)"/) || [])[1] || '');
        const rel = rid && rels.match(new RegExp(`<(?:\\w+:)?Relationship\\b[^>]*Id="${rid}"[^>]*>`));
        const target = rel && (rel[0].match(/Target="([^"]+)"/) || [])[1];
        if (target) sheetPath = target.startsWith('/') ? target.slice(1) : 'xl/' + target.replace(/^\.\//, '');
      }
    }
    const shared = [];
    const ss = await unzipRead(u8, idx, 'xl/sharedStrings.xml', inflate);
    if (ss) for (const m of ss.matchAll(/<(?:\w+:)?si\b[^>]*>([\s\S]*?)<\/(?:\w+:)?si>/g)) {
      const body = m[1].replace(/<(?:\w+:)?rPh\b[\s\S]*?<\/(?:\w+:)?rPh>/g, '');
      shared.push([...body.matchAll(/<(?:\w+:)?t\b[^>]*>([\s\S]*?)<\/(?:\w+:)?t>/g)].map(t => xmlText(t[1])).join(''));
    }
    const sheet = await unzipRead(u8, idx, sheetPath, inflate);
    if (!sheet) throw new Error('no worksheet');
    const rows = [];
    for (const rm of sheet.matchAll(/<(?:\w+:)?row\b([^>]*)>([\s\S]*?)<\/(?:\w+:)?row>/g)) {
      const rnum = Number((rm[1].match(/\br="(\d+)"/) || [])[1]) || rows.length + 1;
      const cells = [];
      let next = 0;
      for (const cm of rm[2].matchAll(/<(?:\w+:)?c\b([^>]*?)(?:\/>|>([\s\S]*?)<\/(?:\w+:)?c>)/g)) {
        const attrs = cm[1], body = cm[2] || '';
        const ref = (attrs.match(/\br="([A-Z]+)\d+"/) || [])[1];
        const ci = ref ? colIndex(ref) : next;
        next = ci + 1;
        const t = (attrs.match(/\bt="(\w+)"/) || [])[1] || 'n';
        const v = (body.match(/<(?:\w+:)?v\b[^>]*>([\s\S]*?)<\/(?:\w+:)?v>/) || [])[1];
        let val = null;
        if (t === 's') val = v != null ? shared[Number(v)] : null;
        else if (t === 'inlineStr') val = [...body.matchAll(/<(?:\w+:)?t\b[^>]*>([\s\S]*?)<\/(?:\w+:)?t>/g)].map(x => xmlText(x[1])).join('');
        else if (t === 'str' || t === 'e') val = v != null ? xmlText(v) : null;
        else if (t === 'b') val = v === '1';
        else val = v != null && v !== '' ? Number(v) : null;
        cells[ci] = val;
      }
      while (rows.length < rnum - 1) rows.push([]);
      rows.push(Array.from(cells, c => (c === undefined ? null : c)));
    }
    while (rows.length && rows[rows.length - 1].every(c => c == null || String(c).trim() === '')) rows.pop();
    return { rows, sheetName };
  }

  // A table from a file: { headers, body: [{ n, cells }], kind, delimiter, sheetName }
  // Excel on Windows often saves CSV as Windows-1252, where £ is not valid UTF-8.
  function decodeText(u8) {
    try { return new TextDecoder('utf-8', { fatal: true }).decode(u8); } catch (e) { /* not UTF-8 */ }
    try { return new TextDecoder('windows-1252').decode(u8); } catch (e) { return new TextDecoder().decode(u8); }
  }
  async function readTable(name, data, inflateRaw) {
    let rows, kind, delimiter = null, sheetName = '';
    const u8 = typeof data === 'string' ? null : data instanceof Uint8Array ? data : new Uint8Array(data);
    if (u8 && u8.length >= 4 && u8[0] === 0x50 && u8[1] === 0x4b) {
      const x = await parseXLSX(u8, inflateRaw);
      rows = x.rows; kind = 'xlsx'; sheetName = x.sheetName;
    } else if (u8 && u8.length >= 4 && u8[0] === 0xD0 && u8[1] === 0xCF && u8[2] === 0x11 && u8[3] === 0xE0) {
      throw new Error('xls');
    } else {
      const text = typeof data === 'string' ? data : decodeText(u8);
      const c = parseCSV(text);
      rows = c.rows; kind = 'csv'; delimiter = c.delimiter;
    }
    const h = findHeaderRow(rows);
    const headers = (rows[h] || []).map(c => (c == null ? '' : String(c).trim()));
    const body = [];
    for (let i = h + 1; i < rows.length; i++) {
      const cells = rows[i] || [];
      if (cells.every(c => c == null || String(c).trim() === '')) continue;
      body.push({ n: i + 1, cells });
    }
    return { name, kind, delimiter, sheetName, headers, body };
  }

  // ---------- Records ----------
  // settings: { regime, mapping, payPeriod: 'monthly', hoursMode: 'total' | 'weekly', sexMap: { raw: 'M' | 'F' | 'X' } }
  function buildRecords(table, settings) {
    const R = REGIMES[settings.regime];
    const map = settings.mapping || detectMapping(table.headers);
    const has = k => map[k] != null && map[k] > -1;
    const numericKeys = ['hourly', 'ordinary', 'bonusPeriod', 'hours', 'bonus'].filter(has);
    const values = [];
    for (const r of table.body) for (const k of numericKeys) values.push(r.cells[map[k]]);
    const decimalComma = settings.decimalComma != null ? settings.decimalComma : detectDecimalComma(values, table.delimiter);
    const defaultDays = PERIOD_DAYS[settings.payPeriod || 'monthly'] || PERIOD_DAYS.monthly;
    const weekly = settings.hoursMode === 'weekly';
    const records = table.body.map(({ n, cells }) => {
      const get = k => (has(k) ? cells[map[k]] : null);
      const r = { row: n, id: '', sexRaw: '', sex: null, unreadable: [] };
      const idv = get('id');
      r.id = idv == null ? '' : String(idv).trim();
      const sv = get('sex');
      r.sexRaw = sv == null ? '' : String(sv).trim();
      r.sex = parseSex(r.sexRaw, settings.sexMap);
      const num = k => {
        if (!has(k)) return null;
        const v = parseNumber(get(k), decimalComma);
        if (Number.isNaN(v)) { r.unreadable.push(k); return null; }
        return v;
      };
      r.hourlyGiven = num('hourly');
      r.ordinary = num('ordinary');
      r.bonusPeriod = R.basis === 'uk' ? num('bonusPeriod') : null;
      r.hours = num('hours');
      r.bonus = num('bonus');
      const flag = k => { if (!has(k)) return null; const f = parseFlag(get(k), k); if (f.bad) r.unreadable.push(k); return f.v; };
      r.fullPay = R.basis === 'uk' ? flag('fullPay') : null;
      r.partTime = R.area === 'ie' ? flag('partTime') : null;
      r.temporary = R.area === 'ie' ? flag('temporary') : null;
      r.bik = R.area === 'ie' ? flag('bik') : null;
      const cv = R.area === 'eu' ? get('category') : null;
      r.category = cv == null ? '' : String(cv).trim();
      if (R.basis === 'uk') {
        let days = defaultDays;
        if (has('payPeriod')) { const p = parsePeriodDays(get('payPeriod')); if (p.bad) r.unreadable.push('payPeriod'); if (p.v) days = p.v; }
        r.periodDays = days;
      }
      r.negative = ['hourlyGiven', 'ordinary', 'bonusPeriod', 'hours', 'bonus'].some(k => r[k] != null && r[k] < 0);
      // Hourly pay
      r.hourly = null; r.annual = null; r.basicHourly = null; r.variableHourly = null; r.hoursUsed = null;
      if (r.hourlyGiven != null && r.hourlyGiven > 0) r.hourly = r.hourlyGiven;
      if (R.basis === 'uk') {
        // SI 2017/172 reg. 6: (ordinary pay + bonus pay in the relevant pay period) x (7 / days in the pay period) / weekly working hours
        if (r.hourly == null && r.ordinary != null && r.hours > 0) r.hourly = (r.ordinary + (r.bonusPeriod || 0)) * 7 / r.periodDays / r.hours;
      } else {
        const h = r.hours != null && r.hours > 0 ? (weekly ? r.hours * WEEKS_PER_YEAR : r.hours) : null;
        r.hoursUsed = h;
        // Ireland Reg. 3: (ordinary pay + bonus remuneration in the 12 months) / total working hours in the 12 months.
        // EU: gross hourly pay level = (basic pay + complementary or variable components) / hours paid in the year.
        if (r.hourly == null && r.ordinary != null && h) r.hourly = (r.ordinary + (r.bonus || 0)) / h;
        if (r.ordinary != null) r.annual = r.ordinary + (r.bonus || 0);
        if (r.ordinary != null && h) { r.basicHourly = r.ordinary / h; r.variableHourly = (r.bonus || 0) / h; }
      }
      if (r.hourly != null && !(r.hourly > 0 && Number.isFinite(r.hourly))) r.hourly = null;
      return r;
    });
    return { records, decimalComma, mapping: map };
  }

  // ---------- Data checks ----------
  // choices: { duplicates: 'first' | 'all', outliers: 'keep' | 'drop', noPay: 'hourly' | 'all' }
  function review(records, regimeId, choices) {
    const R = REGIMES[regimeId];
    const c = Object.assign({ duplicates: 'first', outliers: 'keep', noPay: 'hourly' }, choices || {});
    const checks = [];
    for (const r of records) { r.out = null; r.outHourly = null; r.flags = []; }
    const leave = (r, code, text) => { if (!r.out) r.out = { code, text }; r.flags.push(code); };
    const leaveHourly = (r, code, text) => { if (!r.outHourly) r.outHourly = { code, text }; r.flags.push(code); };
    const rowsOf = list => list.map(r => ({ row: r.row, id: r.id }));

    // Example rows left in from the template
    const ex = records.filter(r => /^example/i.test(r.id));
    ex.forEach(r => leave(r, 'example', 'Example row from the template'));
    if (ex.length) checks.push({ id: 'example', state: 'info', count: ex.length, title: `${ex.length} example row${ex.length > 1 ? 's' : ''} from the template`, text: 'Rows whose employee ID starts with EXAMPLE are left out.', rows: rowsOf(ex) });

    // Duplicate employee IDs
    const seen = new Map();
    const dupRows = [];
    for (const r of records) {
      if (r.out || !r.id) continue;
      const k = r.id.toLowerCase();
      if (seen.has(k)) { dupRows.push(r); if (c.duplicates === 'first') leave(r, 'duplicate', `Same employee ID as row ${seen.get(k).row}`); }
      else seen.set(k, r);
    }
    const dupIds = new Set(dupRows.map(r => r.id.toLowerCase())).size;
    checks.push(dupRows.length
      ? { id: 'duplicates', state: 'check', count: dupRows.length, title: `${dupIds} employee ID${dupIds > 1 ? 's' : ''} on more than one row`, text: c.duplicates === 'first' ? `Only the first row for each ID is used; ${dupRows.length} later row${dupRows.length > 1 ? 's are' : ' is'} left out. If they are separate jobs or contracts, count every row instead.` : 'Every row is counted as a separate employee or contract. The GOV.UK guidance allows counting someone with two jobs once or once per contract, if you are consistent.', rows: rowsOf(dupRows), choice: { name: 'duplicates', value: c.duplicates, options: [['first', 'Use the first row only'], ['all', 'Count every row']] } }
      : { id: 'duplicates', state: 'ok', count: 0, title: 'No duplicate employee IDs', text: '' });

    // Negative values
    const neg = records.filter(r => !r.out && r.negative);
    neg.forEach(r => leave(r, 'negative', 'Negative pay, bonus or hours'));
    checks.push(neg.length
      ? { id: 'negative', state: 'check', count: neg.length, title: `${neg.length} row${neg.length > 1 ? 's' : ''} with a negative amount`, text: 'Pay, bonus and hours cannot be negative, so these rows are left out of every figure. Correct them in the payroll export and drop the file again.', rows: rowsOf(neg) }
      : { id: 'negative', state: 'ok', count: 0, title: 'No negative amounts', text: '' });

    // Sex not recorded as male or female
    const unk = records.filter(r => !r.out && !r.sex);
    const vals = new Map();
    unk.forEach(r => { const k = r.sexRaw; vals.set(k, (vals.get(k) || 0) + 1); leave(r, 'sex', r.sexRaw ? `Sex recorded as "${r.sexRaw}"` : 'Sex not recorded'); });
    const sexText = R.area === 'uk'
      ? 'The GOV.UK guidance (updated 21 May 2026) says reporting must be based on each employee’s biological sex. These rows are left out of every figure until the value is corrected or matched below.'
      : R.area === 'ie'
        ? 'The Department’s FAQ for employers (Q5) says an employee who does not identify as male or female may be omitted from the calculations. They still count in your headcount.'
        : 'The directive reports on female and male workers and says nothing about other entries. These rows are left out of the figures and counted here; check your national rules once they are in force.';
    checks.push(unk.length
      ? { id: 'sex', state: 'check', count: unk.length, title: `${unk.length} row${unk.length > 1 ? 's' : ''} not recorded as male or female`, text: sexText, rows: rowsOf(unk), values: [...vals.entries()].map(([raw, count]) => ({ raw, count })) }
      : { id: 'sex', state: 'ok', count: 0, title: 'Every row is recorded as male or female', text: '' });

    // UK: not full-pay relevant employees (on reduced or nil pay because of leave)
    if (R.basis === 'uk') {
      const nf = records.filter(r => !r.out && r.fullPay === false);
      nf.forEach(r => leaveHourly(r, 'notfull', 'Not a full-pay relevant employee (reduced or nil pay because of leave)'));
      if (nf.length) checks.push({ id: 'notfull', state: 'info', count: nf.length, title: `${nf.length} employee${nf.length > 1 ? 's' : ''} on reduced or nil pay because of leave`, text: 'They are relevant employees but not full-pay relevant employees, so they count in the bonus figures and are left out of the hourly pay figures and the quartiles, as the Regulations require.', rows: rowsOf(nf) });
    }

    // No usable hourly pay
    const np = records.filter(r => !r.out && !r.outHourly && r.hourly == null);
    np.forEach(r => (c.noPay === 'all' ? leave : leaveHourly)(r, 'nopay', 'No hourly pay: pay or hours missing or zero'));
    const npText = R.area === 'ie'
      ? 'The FAQ (Q12) says someone not yet paid in the 12 months is left out of the hourly pay calculations. They stay in the headcount and, unless you choose otherwise, in the bonus and benefits in kind percentages.'
      : R.area === 'uk'
        ? 'Left out of the hourly pay figures and the quartiles. As relevant employees they stay in the bonus figures unless you choose otherwise.'
        : 'Left out of the hourly and annual pay figures, the quartiles and the categories. They stay in the variable pay figures unless you choose otherwise.';
    checks.push(np.length
      ? { id: 'nopay', state: 'check', count: np.length, title: `${np.length} row${np.length > 1 ? 's' : ''} without hourly pay`, text: npText, rows: rowsOf(np), choice: { name: 'noPay', value: c.noPay, options: [['hourly', 'Leave out of the hourly figures only'], ['all', 'Leave out of every figure']] } }
      : { id: 'nopay', state: 'ok', count: 0, title: 'Every row has hourly pay', text: '' });

    // Extreme values: hourly pay more than ten times, or less than a tenth of, the median
    const pool = records.filter(r => !r.out && !r.outHourly && r.sex && r.hourly > 0);
    const med = median(pool.map(r => r.hourly));
    const ext = med ? pool.filter(r => r.hourly > med * OUTLIER_FACTOR || r.hourly < med / OUTLIER_FACTOR) : [];
    if (c.outliers === 'drop') ext.forEach(r => leave(r, 'outlier', 'Extreme hourly pay'));
    checks.push(ext.length
      ? { id: 'outliers', state: 'check', count: ext.length, title: `${ext.length} extreme hourly rate${ext.length > 1 ? 's' : ''}`, text: `More than ${OUTLIER_FACTOR} times, or less than a tenth of, the median hourly pay. Often a salary in the hourly column or hours for the wrong period. Kept unless you leave them out.`, rows: ext.map(r => ({ row: r.row, id: r.id, hourly: r.hourly })), median: med, choice: { name: 'outliers', value: c.outliers, options: [['keep', 'Keep them'], ['drop', 'Leave them out']] } }
      : { id: 'outliers', state: 'ok', count: 0, title: 'No extreme hourly rates', text: med ? `Nothing above ${OUTLIER_FACTOR} times or below a tenth of the median.` : '' });

    // Values that could not be read
    const bad = records.filter(r => r.unreadable.length);
    if (bad.length) checks.push({ id: 'unreadable', state: 'check', count: bad.length, title: `${bad.length} row${bad.length > 1 ? 's' : ''} with a value that could not be read`, text: 'Those cells are treated as blank. Numbers can use a decimal point or a decimal comma; flags can be Y or N.', rows: bad.map(r => ({ row: r.row, id: r.id, fields: r.unreadable.slice() })) });

    // Rows without an ID
    const noId = records.filter(r => !r.out && !r.id);
    if (noId.length) checks.push({ id: 'noid', state: 'info', count: noId.length, title: `${noId.length} row${noId.length > 1 ? 's' : ''} without an employee ID`, text: 'They are counted. Without an ID they cannot be checked for duplicates, and the audit file names them by row number.', rows: rowsOf(noId) });

    return { checks, median: med };
  }

  // ---------- Measures ----------
  function stats(list, get) {
    const m = list.filter(r => r.sex === 'M').map(get), w = list.filter(r => r.sex === 'F').map(get);
    return { men: { n: m.length, mean: mean(m), median: median(m) }, women: { n: w.length, mean: mean(w), median: median(w) } };
  }
  function why(st, what) {
    if (!st.men.n && !st.women.n) return `No ${what}`;
    if (!st.men.n) return `No men among ${what}`;
    if (!st.women.n) return `No women among ${what}`;
    return null;
  }
  function gapFigure(id, st, kind, what, extra) {
    const male = st.men[kind], female = st.women[kind];
    const value = gap(male, female);
    let note = why(st, what);
    if (!note && value == null) note = `Men’s ${kind} is zero, so the gap cannot be expressed as a percentage of it`;
    return Object.assign({ id, kind: 'gap', stat: kind, value, men: { n: st.men.n, value: male }, women: { n: st.women.n, value: female }, money: true, note }, extra || {});
  }

  function compute(records, regimeId, opts) {
    const R = REGIMES[regimeId];
    opts = opts || {};
    const mapping = opts.mapping || {};
    const mapped = k => mapping[k] != null && mapping[k] > -1;
    const counted = records.filter(r => !(r.out && (r.out.code === 'example' || r.out.code === 'duplicate')));
    const relevant = records.filter(r => !r.out && r.sex);
    const hourlyPop = relevant.filter(r => !r.outHourly && r.hourly > 0);
    const headcount = {
      total: counted.length,
      men: counted.filter(r => r.sex === 'M').length,
      women: counted.filter(r => r.sex === 'F').length,
      neither: counted.filter(r => !r.sex).length,
      relevant: relevant.length,
      hourlyMen: hourlyPop.filter(r => r.sex === 'M').length,
      hourlyWomen: hourlyPop.filter(r => r.sex === 'F').length,
      leftOut: records.filter(r => r.out).length,
      leftOutHourly: records.filter(r => !r.out && r.outHourly).length,
    };
    const F = {};
    const hs = stats(hourlyPop, r => r.hourly);
    const popWord = R.area === 'uk' ? 'full-pay relevant employees with hourly pay' : R.area === 'ie' ? 'relevant employees with hourly remuneration' : 'workers with hourly pay';
    F.mean_hourly = gapFigure('mean_hourly', hs, 'mean', popWord, { basis: 'hourly' });
    F.median_hourly = gapFigure('median_hourly', hs, 'median', popWord, { basis: 'hourly' });

    // Bonus (UK, Ireland) and complementary or variable components (EU): among the relevant employees paid one
    const bonusMapped = mapped('bonus');
    const recipients = relevant.filter(r => r.bonus > 0);
    const bs = stats(recipients, r => r.bonus);
    const bonusWord = R.area === 'eu' ? 'workers paid complementary or variable components' : 'employees paid a bonus';
    F.mean_bonus = gapFigure('mean_bonus', bs, 'mean', bonusWord, { basis: 'bonus' });
    F.median_bonus = gapFigure('median_bonus', bs, 'median', bonusWord, { basis: 'bonus' });
    const relM = relevant.filter(r => r.sex === 'M').length, relW = relevant.filter(r => r.sex === 'F').length;
    F.bonus_share = { id: 'bonus_share', kind: 'share', men: { n: relM, count: recipients.filter(r => r.sex === 'M').length }, women: { n: relW, count: recipients.filter(r => r.sex === 'F').length } };
    F.bonus_share.men.value = share(F.bonus_share.men.count, relM);
    F.bonus_share.women.value = share(F.bonus_share.women.count, relW);
    if (!bonusMapped) for (const k of ['mean_bonus', 'median_bonus', 'bonus_share']) { F[k].note = R.area === 'eu' ? 'Match the complementary or variable pay column to work this out' : 'Match the bonus column to work this out'; F[k].value = null; if (k === 'bonus_share') { F[k].men.value = null; F[k].women.value = null; } }
    else if (!recipients.length) { F.mean_bonus.note = F.median_bonus.note = R.area === 'eu' ? 'No complementary or variable components were paid' : 'No bonuses were paid in the period'; }

    if (R.area === 'ie') {
      const pt = hourlyPop.filter(r => r.partTime === true), tmp = hourlyPop.filter(r => r.temporary === true);
      const ps = stats(pt, r => r.hourly), ts = stats(tmp, r => r.hourly);
      F.mean_hourly_pt = gapFigure('mean_hourly_pt', ps, 'mean', 'part-time employees', { basis: 'hourly' });
      F.median_hourly_pt = gapFigure('median_hourly_pt', ps, 'median', 'part-time employees', { basis: 'hourly' });
      F.mean_hourly_temp = gapFigure('mean_hourly_temp', ts, 'mean', 'employees on temporary contracts', { basis: 'hourly' });
      F.median_hourly_temp = gapFigure('median_hourly_temp', ts, 'median', 'employees on temporary contracts', { basis: 'hourly' });
      if (!mapped('partTime')) for (const k of ['mean_hourly_pt', 'median_hourly_pt']) { F[k].value = null; F[k].note = 'Match the part-time column to work this out'; }
      if (!mapped('temporary')) for (const k of ['mean_hourly_temp', 'median_hourly_temp']) { F[k].value = null; F[k].note = 'Match the temporary contract column to work this out'; }
      const bikM = relevant.filter(r => r.sex === 'M' && r.bik === true).length, bikW = relevant.filter(r => r.sex === 'F' && r.bik === true).length;
      F.bik_share = { id: 'bik_share', kind: 'share', men: { n: relM, count: bikM, value: share(bikM, relM) }, women: { n: relW, count: bikW, value: share(bikW, relW) } };
      if (!mapped('bik')) { F.bik_share.note = 'Match the benefits in kind column to work this out'; F.bik_share.men.value = F.bik_share.women.value = null; }
    }

    if (R.area === 'eu') {
      const annPop = hourlyPop.filter(r => r.annual != null && r.annual > 0);
      const as = stats(annPop, r => r.annual);
      F.mean_annual = gapFigure('mean_annual', as, 'mean', 'workers with annual pay', { basis: 'annual' });
      F.median_annual = gapFigure('median_annual', as, 'median', 'workers with annual pay', { basis: 'annual' });
      if (!annPop.length) for (const k of ['mean_annual', 'median_annual']) F[k].note = 'Match the basic pay column to work this out';
      // (g) Categories of workers
      const cats = new Map();
      for (const r of hourlyPop) { if (!r.category) continue; if (!cats.has(r.category)) cats.set(r.category, []); cats.get(r.category).push(r); }
      const rowsG = [...cats.entries()].sort((a, b) => a[0].localeCompare(b[0])).map(([name, list]) => {
        const t = stats(list, r => r.hourly);
        const withBasic = list.filter(r => r.basicHourly != null);
        const b = stats(withBasic, r => r.basicHourly), v = stats(withBasic, r => r.variableHourly);
        const a = stats(list.filter(r => r.annual != null && r.annual > 0), r => r.annual);
        const g = {
          name, men: t.men.n, women: t.women.n,
          hourly: gap(t.men.mean, t.women.mean), basic: gap(b.men.mean, b.women.mean), variable: gap(v.men.mean, v.women.mean), annual: gap(a.men.mean, a.women.mean),
          menMean: t.men.mean, womenMean: t.women.mean,
        };
        // Article 10(1)(a): a difference in average pay level of at least 5% in a category, in either direction.
        // The flag uses hourly pay; annual pay is marked separately because part-time and part-year work move it.
        const hit = x => x != null && Math.abs(round1(x)) >= 5;
        g.flag = hit(g.hourly);
        g.annualFlag = hit(g.annual);
        g.note = !t.men.n ? 'No men in this category' : !t.women.n ? 'No women in this category' : null;
        return g;
      });
      const noCat = hourlyPop.filter(r => !r.category).length;
      F.categories = { id: 'categories', kind: 'categories', rows: rowsG, uncategorised: noCat, flagged: rowsG.filter(g => g.flag).length };
      if (!mapped('category')) F.categories.note = 'Match the category of workers column to work this out';
    }

    F.quartiles = { id: 'quartiles', kind: 'quartiles', bands: hourlyPop.length ? quartiles(hourlyPop) : [], n: hourlyPop.length };
    if (!hourlyPop.length) F.quartiles.note = 'No employees with hourly pay';

    const figures = measureList(regimeId).map(m => Object.assign({}, F[m.id], { id: m.id, label: m.label, ref: m.ref, free: m.free }));
    return { regime: regimeId, currency: R.currency, headcount, hourly: hs, bonus: bs, figures, byId: Object.fromEntries(figures.map(f => [f.id, f])) };
  }

  // ---------- Formatting ----------
  const MINUS = '−';
  function pct(x, opts) {
    const v = round1(x);
    if (v == null) return opts && opts.blank != null ? opts.blank : 'n/a';
    const s = Math.abs(v).toFixed(1);
    return (v < 0 ? (opts && opts.ascii ? '-' : MINUS) : '') + s + '%';
  }
  function money(x, currency, opts) {
    if (x == null || !Number.isFinite(x)) return 'n/a';
    const locale = currency === 'GBP' ? 'en-GB' : 'en-IE';
    const s = new Intl.NumberFormat(locale, { style: 'currency', currency, minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(Math.abs(x));
    return (x < 0 ? (opts && opts.ascii ? '-' : MINUS) : '') + s;
  }

  // ---------- Dates ----------
  const MONTHS = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];
  const longDate = d => `${d.getUTCDate()} ${MONTHS[d.getUTCMonth()]} ${d.getUTCFullYear()}`;
  const ymd = d => d.toISOString().slice(0, 10);
  const utc = (y, m, d) => new Date(Date.UTC(y, m - 1, d));
  function addMonths(d, n) {
    const y = d.getUTCFullYear(), m = d.getUTCMonth() + n, day = d.getUTCDate();
    const last = new Date(Date.UTC(y, m + 1, 0)).getUTCDate();
    return new Date(Date.UTC(y, m, Math.min(day, last)));
  }
  // period: { year } for the UK and the EU, { date: 'YYYY-06-DD' } for Ireland
  function dates(regimeId, period) {
    const R = REGIMES[regimeId];
    if (regimeId === 'uk_private' || regimeId === 'uk_public') {
      const y = period.year;
      const snap = regimeId === 'uk_private' ? utc(y, 4, 5) : utc(y, 3, 31);
      const due = regimeId === 'uk_private' ? utc(y + 1, 4, 4) : utc(y + 1, 3, 30);
      return { snapshot: snap, deadline: due, bonusFrom: new Date(addMonths(snap, -12).getTime() + 864e5), bonusTo: snap, label: `Snapshot date ${longDate(snap)}`, yearLabel: `${y} to ${y + 1}`, R };
    }
    if (regimeId === 'ireland') {
      const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(period.date || '');
      const snap = m ? utc(+m[1], +m[2], +m[3]) : utc(2026, 6, 30);
      const from = new Date(addMonths(snap, -12).getTime() + 864e5);
      // Reg. 6(1) as amended by S.I. 212/2025: not later than 5 months after the relevant date
      return { snapshot: snap, deadline: addMonths(snap, 5), periodFrom: from, periodTo: snap, label: `Snapshot date ${longDate(snap)}`, yearLabel: String(snap.getUTCFullYear()), R };
    }
    const y = period.year;
    return { referenceYear: y, periodFrom: utc(y, 1, 1), periodTo: utc(y, 12, 31), deadline: utc(y + 1, 6, 7), label: `Reference year ${y} (1 January to 31 December)`, yearLabel: String(y), R };
  }
  // EU reporting schedule by size (Art. 9(2) to 9(5))
  function euSchedule(workers) {
    if (workers >= 250) return { band: '250 or more workers', text: 'Report by 7 June 2027 on 2026, then every year on the previous calendar year (Art. 9(2)).' };
    if (workers >= 150) return { band: '150 to 249 workers', text: 'Report by 7 June 2027 on 2026, then every three years (Art. 9(3)).' };
    if (workers >= 100) return { band: '100 to 149 workers', text: 'Report by 7 June 2031 on 2030, then every three years (Art. 9(4)).' };
    return { band: 'fewer than 100 workers', text: 'Not required by the directive; reporting is voluntary unless national law requires it (Art. 9(5)).' };
  }

  // ---------- The synthetic sample company ----------
  function prng(seed) { let a = seed >>> 0; return () => { a = (a + 0x6D2B79F5) >>> 0; let t = a; t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; }; }
  const r2 = x => Math.round(x * 100) / 100;
  const GROUPS = [
    { cat: 'Warehouse operative', n: 52, men: 44, lo: 12.6, hi: 14.4, hours: 39, pt: 5, ptHours: 20, temp: 10, bonusP: 0.6, b: [180, 520], period: 'weekly', bik: 0, quarterly: true },
    { cat: 'Driver', n: 26, men: 24, lo: 14.1, hi: 16.3, hours: 42.5, pt: 0, temp: 2, bonusP: 0.5, b: [300, 800], period: 'weekly', bik: 0 },
    { cat: 'Customer service', n: 34, men: 8, lo: 12.7, hi: 14.1, hours: 37.5, pt: 17, ptHours: 20, temp: 6, bonusP: 0.4, b: [150, 400], period: 'monthly', bik: 0 },
    { cat: 'Administration', n: 22, men: 5, lo: 13.2, hi: 16.4, hours: 37.5, pt: 7, ptHours: 24, temp: 2, bonusP: 0.2, b: [200, 600], period: 'monthly', bik: 0 },
    { cat: 'Team leader', n: 16, men: 9, lo: 16.2, hi: 19.1, hours: 39, pt: 1, ptHours: 30, temp: 0, bonusP: 0.7, b: [600, 1500], period: 'monthly', bik: 0 },
    { cat: 'Specialist', n: 16, men: 9, lo: 21.5, hi: 27.5, hours: 37.5, pt: 2, ptHours: 30, temp: 1, bonusP: 0.6, b: [1200, 3200], period: 'monthly', bik: 0.3 },
    { cat: 'Manager', n: 10, men: 7, lo: 30, hi: 38, hours: 37.5, pt: 0, temp: 0, bonusP: 1, b: [3000, 8500], period: 'monthly', bik: 1, womenFactor: 0.92 },
    { cat: 'Director', n: 4, men: 3, lo: 55, hi: 82, hours: 37.5, pt: 0, temp: 0, bonusP: 1, b: [14000, 38000], period: 'monthly', bik: 1 },
  ];
  function samplePeople() {
    const rnd = prng(20260405);
    const people = [];
    let seq = 0;
    for (const g of GROUPS) {
      for (let i = 0; i < g.n; i++) {
        const sex = i < g.men ? 'M' : 'F';
        const u = rnd();
        let base = g.lo + (g.hi - g.lo) * u;
        if (sex === 'F' && g.womenFactor) base *= g.womenFactor;
        base = r2(base);
        const pt = i % Math.max(1, Math.floor(g.n / Math.max(1, g.pt))) === 1 && people.filter(p => p.cat === g.cat && p.pt).length < g.pt;
        const hours = pt ? g.ptHours : g.hours;
        const temp = people.filter(p => p.cat === g.cat && p.temp).length < g.temp && (i % 5 === 3 || i >= g.n - g.temp);
        const gotBonus = rnd() < g.bonusP;
        const bonus = gotBonus ? Math.round(g.b[0] + (g.b[1] - g.b[0]) * rnd()) : 0;
        const bik = rnd() < g.bik;
        seq++;
        people.push({ id: 'S' + String(seq).padStart(3, '0'), sex, cat: g.cat, base, hours, pt, temp, bonus, bik, period: g.period, quarterly: !!g.quarterly && gotBonus, weeks: temp ? 12 + Math.floor(rnd() * 28) : WEEKS_PER_YEAR, leave: null });
      }
    }
    // A few real-life cases for the checks to show: leave on reduced pay, a starter not yet paid, a sex not recorded.
    const pick = (cat, sex, nth) => people.filter(p => p.cat === cat && p.sex === sex && !p.leave && !p.starter)[nth];
    pick('Customer service', 'F', 2).leave = 'maternity';
    pick('Administration', 'F', 1).leave = 'maternity';
    pick('Warehouse operative', 'M', 6).leave = 'sick';
    const starter = pick('Customer service', 'F', 9); starter.starter = true; starter.bonus = 0; starter.quarterly = false;
    pick('Customer service', 'F', 12).sex = 'Not recorded';
    return people;
  }
  const SAMPLE_COLUMNS = ['employee_id', 'sex', 'ordinary_pay', 'bonus_in_period', 'hours', 'pay_period', 'hourly_pay', 'bonus_pay', 'full_pay', 'part_time', 'temporary', 'benefit_in_kind', 'category'];
  function sampleCSV(regimeId) {
    const R = REGIMES[regimeId];
    const people = samplePeople();
    const csvCell = v => { const s = v == null ? '' : String(v); return /[",\r\n]/.test(s) ? '"' + s.replace(/"/g, '""') + '"' : s; };
    const lines = [SAMPLE_COLUMNS.join(',')];
    const yn = b => (b ? 'Y' : 'N');
    for (const p of people) {
      let ordinary, bonusPeriod = '', hours, fullPay = 'Y';
      if (R.basis === 'uk') {
        const days = PERIOD_DAYS[p.period];
        ordinary = r2(p.base * p.hours * days / 7);
        if (p.leave === 'maternity') { ordinary = r2(ordinary * 0.4); fullPay = 'N'; }
        if (p.leave === 'sick') { ordinary = r2(ordinary * 0.5); fullPay = 'N'; }
        if (p.starter) ordinary = 0;
        // Quarterly productivity bonus paid in the snapshot pay period, prorated to a weekly period (reg. 6, step 3)
        if (p.quarterly) bonusPeriod = r2(p.bonus / 4 / (3 * 30.44) * days);
        hours = p.hours;
      } else {
        const weeks = p.starter ? 0 : p.weeks;
        ordinary = r2(p.base * p.hours * weeks);
        hours = r2(p.hours * weeks);
        if (p.leave === 'maternity') ordinary = r2(ordinary * 0.78);
        if (p.leave === 'sick') ordinary = r2(ordinary * 0.86);
      }
      lines.push([p.id, p.sex === 'M' ? 'M' : p.sex === 'F' ? 'F' : p.sex, ordinary.toFixed(2), bonusPeriod === '' ? '' : Number(bonusPeriod).toFixed(2), hours, R.basis === 'uk' ? p.period : '', '', p.bonus ? p.bonus.toFixed(2) : '0.00', fullPay, yn(p.pt), yn(p.temp), yn(p.bik), p.cat].map(csvCell).join(','));
    }
    return lines.join('\r\n') + '\r\n';
  }
  const SAMPLE = { employer: 'Sample Company Ltd', note: 'Synthetic data: 180 made-up employees' };

  return {
    CHECKED, WEEKS_PER_YEAR, PERIOD_DAYS, BANDS, REGIMES, FIELDS, SYN, SAMPLE, SAMPLE_COLUMNS, OUTLIER_FACTOR,
    measureList, fieldsFor, fieldLabel, detectMapping, findHeaderRow, norm,
    parseSex, parseNumber, parseFlag, parsePeriodDays, detectDecimalComma,
    mean, median, gap, share, round1, quartileSizes, quartiles,
    parseCSV, parseXLSX, readTable, decodeText, buildRecords, review, compute,
    pct, money, dates, longDate, ymd, addMonths, euSchedule,
    samplePeople, sampleCSV,
  };
});
