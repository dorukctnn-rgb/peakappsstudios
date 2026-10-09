/* Pay Transparency Kit: the employer's calculations for answering a pay information request.
 * The payroll file is read, mapped and checked by the Pay Gap Report engine (paygap.js, window.PayGap): its CSV and XLSX
 * reader, header detection, sex and number parsing, the data checks and the synthetic sample company are used as they
 * are. This file adds what an Article 7 answer needs on top: the full-time equivalent, the job title, the averages by
 * sex in the requester's category, the checks for averages that would disclose a colleague's pay, the German
 * EntgTranspG comparison pay (median of the other sex, full-time monthly), and the request log.
 * Pure functions, no DOM: window.PayTransEngine in the browser, module.exports in Node. */
(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory(require('../pay-gap-report/paygap.js'));
  else root.PayTransEngine = factory(root.PayGap);
})(typeof self !== 'undefined' ? self : this, function (P) {
  'use strict';

  // The columns an answer needs. Keys shared with the Pay Gap Report keep its names (ordinary, bonus, hours, hourly).
  const FIELDS = [
    { key: 'id', label: 'Employee ID' },
    { key: 'name', label: 'Name, for the letter', optional: true },
    { key: 'sex', label: 'Sex', required: true },
    { key: 'category', label: 'Category of workers', required: true, hint: 'Same work or work of equal value (Art. 3(1)(h))' },
    { key: 'title', label: 'Job title', optional: true },
    { key: 'ordinary', label: 'Basic pay for the year' },
    { key: 'bonus', label: 'Complementary or variable pay for the year', hint: 'Bonuses, allowances, benefits in kind' },
    { key: 'hours', label: 'Hours paid' },
    { key: 'fte', label: 'Full-time equivalent', optional: true, hint: 'For example 0.6, or 60 for 60%' },
    { key: 'hourly', label: 'Gross hourly pay, if already worked out', optional: true },
  ];
  const SHARED = ['id', 'sex', 'category', 'ordinary', 'bonus', 'hours', 'hourly'];
  const EXTRA_SYN = {
    fte: ['fte', 'fulltimeequivalent', 'fteratio', 'ftefactor', 'ftepercent', 'ftepercentage', 'fteshare', 'parttimefactor', 'parttimepercentage', 'deeltijdfactor', 'deeltijdpercentage', 'beschaeftigungsgrad', 'beschaftigungsgrad', 'arbeitszeitanteil', 'teilzeitquote', 'teilzeitfaktor', 'vollzeitaequivalent', 'vollzeitaquivalent'],
    title: ['jobtitle', 'title', 'positiontitle', 'position', 'jobname', 'role', 'functie', 'functietitel', 'functienaam', 'stelle', 'stellenbezeichnung', 'funktion', 'berufsbezeichnung', 'taetigkeit', 'tatigkeit'],
    name: ['name', 'fullname', 'employeename', 'workername', 'staffname', 'naam', 'volledigenaam', 'mitarbeitername', 'vollername'],
  };
  const WEEKS_PER_YEAR = P.WEEKS_PER_YEAR;

  // Column detection: the Pay Gap Report's detector for the shared fields, then the extra fields among the columns left.
  function detectMapping(headers) {
    const base = P.detectMapping(headers);
    const map = {};
    for (const k of SHARED) map[k] = base[k] != null ? base[k] : -1;
    const used = new Set(SHARED.map(k => map[k]).filter(i => i > -1));
    const H = headers.map(P.norm);
    const pairs = [];
    for (const key of Object.keys(EXTRA_SYN)) {
      H.forEach((h, idx) => {
        if (!h || used.has(idx)) return;
        let score = 0;
        for (const s of EXTRA_SYN[key]) {
          if (h === s) score = Math.max(score, 1000 + s.length);
          else if (s.length >= 4 && h.includes(s)) score = Math.max(score, s.length);
        }
        if (score) pairs.push({ key, idx, score });
      });
    }
    pairs.sort((a, b) => b.score - a.score);
    for (const p of pairs) { if (map[p.key] != null || used.has(p.idx)) continue; map[p.key] = p.idx; used.add(p.idx); }
    for (const key of Object.keys(EXTRA_SYN)) if (map[key] == null) map[key] = -1;
    return map;
  }

  // The hours column holds a year's hours or weekly hours. As in the Pay Gap Report: a typical value of 80 or less is weekly.
  function guessHoursMode(table, mapping) {
    if (!(mapping.hours > -1)) return 'total';
    const vals = table.body.map(b => P.parseNumber(b.cells[mapping.hours], false)).filter(v => Number.isFinite(v) && v > 0);
    const med = P.median(vals);
    return med != null && med <= 80 ? 'weekly' : 'total';
  }

  // settings: { mapping, hoursMode: 'total'|'weekly', sexMap, fullTimeWeekly: 40 }
  function buildRecords(table, settings) {
    const s = Object.assign({ hoursMode: 'total', fullTimeWeekly: 40 }, settings || {});
    const map = s.mapping || detectMapping(table.headers);
    const pg = {};
    for (const k of Object.keys(P.SYN)) pg[k] = -1;
    for (const k of SHARED) pg[k] = map[k] != null ? map[k] : -1;
    const built = P.buildRecords(table, { regime: 'eu', mapping: pg, hoursMode: s.hoursMode, sexMap: s.sexMap || {} });
    const has = k => map[k] != null && map[k] > -1;
    const fullYearHours = s.fullTimeWeekly > 0 ? s.fullTimeWeekly * WEEKS_PER_YEAR : null;
    built.records.forEach((r, i) => {
      const cells = table.body[i].cells;
      const txt = k => (has(k) && cells[map[k]] != null ? String(cells[map[k]]).trim() : '');
      r.title = txt('title');
      r.name = txt('name');
      r.fte = null; r.fteFrom = null;
      if (has('fte')) {
        const v = P.parseNumber(cells[map.fte], built.decimalComma);
        if (Number.isNaN(v)) r.unreadable.push('fte');
        else if (v != null && v > 0) { r.fte = v > 1.5 && v <= 100 ? v / 100 : v; r.fteFrom = 'column'; }
      }
      if (r.fte == null && r.hoursUsed > 0 && fullYearHours) { r.fte = r.hoursUsed / fullYearHours; r.fteFrom = 'hours'; }
      r.annualFte = r.annual != null && r.fte > 0 ? r.annual / r.fte : null;
      r.variable = r.bonus || 0;
    });
    return { records: built.records, decimalComma: built.decimalComma, mapping: map };
  }

  // The Pay Gap Report's data checks, with the wording of two of them fitted to an answer letter.
  function review(records, choices) {
    const rv = P.review(records, 'eu', choices);
    for (const c of rv.checks) {
      if (c.id === 'nopay' && c.state !== 'ok') c.text = 'They cannot be part of the averages: their pay or hours are missing or zero. They still count in the headcount.';
      if (c.id === 'sex' && c.state !== 'ok') c.text = 'The directive asks for averages broken down by sex and says nothing about other entries. These rows are left out of the averages and counted here. Match a value below if it means male or female.';
    }
    return rv;
  }

  // Who counts in the averages: rows kept by the checks, recorded as male or female, with a category and usable pay.
  const counts = r => !r.out && !r.outHourly && (r.sex === 'M' || r.sex === 'F') && !!r.category && r.hourly > 0;

  function categories(records) {
    const map = new Map();
    for (const r of records) {
      if (r.out && (r.out.code === 'example' || r.out.code === 'duplicate')) continue;
      const name = r.category || '';
      if (!map.has(name)) map.set(name, { name, men: 0, women: 0, other: 0, total: 0, inAverages: 0 });
      const g = map.get(name);
      g.total++;
      if (r.sex === 'M') g.men++; else if (r.sex === 'F') g.women++; else g.other++;
      if (counts(r)) g.inAverages++;
    }
    return [...map.values()].sort((a, b) => (a.name === '') - (b.name === '') || a.name.localeCompare(b.name));
  }

  const mean = xs => P.mean(xs);
  function group(list) {
    const withAnnual = list.filter(r => r.annual != null && r.annual > 0);
    const withFte = list.filter(r => r.annualFte != null && r.annualFte > 0);
    return {
      n: list.length,
      annual: mean(withAnnual.map(r => r.annual)), annualN: withAnnual.length,
      annualFte: mean(withFte.map(r => r.annualFte)), annualFteN: withFte.length,
      hourly: mean(list.map(r => r.hourly)),
      ids: list.map(r => r.row),
    };
  }

  // The answer for one requester. opts: { parttime: 'paid'|'fte' }
  function answerFor(records, requester, opts) {
    const o = Object.assign({ parttime: 'paid' }, opts || {});
    const r = requester;
    if (!r) return { problem: 'Choose the worker who made the request.' };
    if (!r.category) return { problem: 'This worker has no category of workers in the file, so there is no group to compare with.' };
    const pool = records.filter(x => counts(x) && x.category === r.category);
    const women = group(pool.filter(x => x.sex === 'F')), men = group(pool.filter(x => x.sex === 'M'));
    const pick = g => ({ n: g.n, annual: o.parttime === 'fte' ? g.annualFte : g.annual, hourly: g.hourly, annualN: o.parttime === 'fte' ? g.annualFteN : g.annualN });
    const out = {
      category: r.category, requester: r, inPool: pool.includes(r),
      own: { annual: o.parttime === 'fte' ? r.annualFte : r.annual, hourly: r.hourly, annualPaid: r.annual, annualFte: r.annualFte, fte: r.fte },
      women: pick(women), men: pick(men),
      parttime: o.parttime,
      missingFte: o.parttime === 'fte' && pool.some(x => !(x.fte > 0)),
    };
    out.disclosure = disclosure(out, r);
    return out;
  }

  // Averages that would disclose a colleague's pay. No EU-wide minimum group size exists, so this flags only what
  // follows from the arithmetic: a group of one is that person's pay; in a group of two that includes the requester,
  // the requester can work out the other person's pay from the average and their own.
  function disclosure(ans, r) {
    const flags = [];
    for (const [sex, g] of [['F', ans.women], ['M', ans.men]]) {
      const own = r.sex === sex && ans.inPool;
      if (g.n === 1 && !own) flags.push({ sex, level: 'exact', reason: 'one' });
      if (g.n === 2 && own) flags.push({ sex, level: 'exact', reason: 'pair' });
    }
    return flags;
  }

  // Germany, Entgelttransparenzgesetz (in force): the comparison pay is the median of the average monthly gross pay of
  // the employees of the other sex in the comparison activity, converted to full-time equivalents, for a calendar year
  // (§ 11(3)); it is not given where fewer than six of them do that work (§ 12(3)). § 15(4): say whether the comparison
  // activity is done mainly by the other sex.
  function entgFor(records, requester, category) {
    const r = requester;
    if (!r || (r.sex !== 'M' && r.sex !== 'F')) return { problem: 'The requester must be recorded as male or female to name the other sex.' };
    const cat = category || r.category;
    const pool = records.filter(x => counts(x) && x.category === cat);
    const otherSex = r.sex === 'M' ? 'F' : 'M';
    const other = pool.filter(x => x.sex === otherSex);
    const withFte = other.filter(x => x.annualFte > 0);
    const monthly = withFte.map(x => x.annualFte / 12);
    const varMonthly = withFte.map(x => (x.variable || 0) / x.fte / 12);
    const total = pool.length;
    return {
      category: cat, otherSex, n: other.length, nWithFte: withFte.length,
      median: P.median(monthly), variableMedian: varMonthly.some(v => v > 0) ? P.median(varMonthly) : null,
      withheld: other.length < 6, count: other.length, total, share: total ? other.length * 100 / total : null,
      missingFte: withFte.length < other.length,
    };
  }

  // ---------- The request log (CSV) ----------
  const LOG_COLUMNS = ['Request ID', 'Date received', 'Answer due', 'Date answered', 'Country', 'Rule', 'Letter language', 'Employee ID', 'Name', 'Category', 'Women in category', 'Men in category', 'Figures given', 'Own annual pay', 'Own hourly pay', 'Women average annual pay', 'Women average hourly pay', 'Men average annual pay', 'Men average hourly pay', 'Annual pay basis', 'Notes'];
  const cell = v => { const s = v == null ? '' : String(v); return /[",\n\r]/.test(s) || (/^[=+\-@]/.test(s) && !/^-?\d/.test(s)) ? '"' + s.replace(/"/g, '""') + '"' : s; };
  const fixed2 = x => (x == null || !Number.isFinite(x) ? '' : x.toFixed(2));
  function logRow(e) {
    return [e.id, e.received, e.due, e.answered, e.country, e.rule, e.lang, e.employeeId, e.name, e.category, e.women, e.men, e.given, fixed2(e.ownAnnual), fixed2(e.ownHourly), fixed2(e.womenAnnual), fixed2(e.womenHourly), fixed2(e.menAnnual), fixed2(e.menHourly), e.parttime, e.notes];
  }
  function logCSV(entries, previousRows) {
    const rows = [LOG_COLUMNS].concat(previousRows || []).concat(entries.map(logRow));
    return String.fromCharCode(0xFEFF) + rows.map(r => r.map(cell).join(',')).join('\r\n') + '\r\n';
  }
  // A log downloaded earlier, read back so new requests are added to it.
  function readLog(text) {
    const { rows } = P.parseCSV(text);
    if (!rows.length) return { rows: [], error: 'The file is empty.' };
    const head = rows[0].map(h => String(h).trim());
    if (head[0] !== LOG_COLUMNS[0] || head.indexOf('Date received') < 0) return { rows: [], error: 'That file is not a request log from this tool.' };
    const idx = LOG_COLUMNS.map(c => head.indexOf(c));
    return { rows: rows.slice(1).filter(r => r.some(c => String(c).trim())).map(r => idx.map(i => (i > -1 ? r[i] : ''))) };
  }
  function nextRequestId(previousRows, entries) {
    let max = 0;
    for (const r of (previousRows || []).concat((entries || []).map(logRow))) { const m = /^R-(\d+)$/.exec(String(r[0] || '')); if (m) max = Math.max(max, +m[1]); }
    return 'R-' + String(max + 1).padStart(3, '0');
  }

  // ---------- The sample company ----------
  // The Pay Gap Report's synthetic company (180 made-up employees in eight categories), read through the same path as a file.
  async function sampleTable() {
    return P.readTable('sample-company-pay-transparency.csv', P.sampleCSV('eu'));
  }

  return { FIELDS, EXTRA_SYN, detectMapping, guessHoursMode, buildRecords, review, categories, answerFor, disclosure, entgFor, counts, LOG_COLUMNS, logRow, logCSV, readLog, nextRequestId, sampleTable, WEEKS_PER_YEAR };
});
