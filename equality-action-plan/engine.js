/* Equality Action Plan engine: word counts, link checks, the plan rules, the quick diagnosis from the published gender
 * pay gap figures, the #prefill= fragment from the Pay Gap Report, the text in the order the guidance sets out, and the
 * measures tracker CSV. Every rule comes from rules.js (window.EAPRules). Pure functions, no DOM and no network:
 * window.EAP in the browser, module.exports in Node (unit tests). */
(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory(require('./rules.js'));
  else root.EAP = factory(root.EAPRules);
})(typeof self !== 'undefined' ? self : this, function (R) {
  'use strict';

  // ---------- Words and links ----------
  // The GOV.UK Design System word counter (govuk-frontend, loaded by the gender pay gap service) counts text.match(/\S+/g):
  // every run of characters between whitespace is one word. "part-time" is 1, "4 April 2027" is 3, a spaced dash is 1.
  function countWords(text) {
    const m = String(text == null ? '' : text).match(/\S+/g);
    return m ? m.length : 0;
  }
  // Web addresses the service would refuse ("cannot add links"): http(s)://, www., and bare domains such as example.co.uk/x.
  const TLD = '(?:com|org|net|uk|co\\.uk|org\\.uk|gov\\.uk|ac\\.uk|nhs\\.uk|ltd\\.uk|plc\\.uk|me\\.uk|sch\\.uk|police\\.uk|io|info|biz|eu|ie|scot|wales|cymru|london|app|dev|co|us|de|fr|nl)';
  const LINK_RE = new RegExp(`(?:https?:\\/\\/|www\\.)[^\\s<>"]+|\\b[a-z0-9](?:[a-z0-9-]*[a-z0-9])?(?:\\.[a-z0-9](?:[a-z0-9-]*[a-z0-9])?)*\\.${TLD}(?:\\/[^\\s<>"]*)?(?![a-z0-9.-]*[a-z0-9])`, 'gi');
  function findLinks(text) {
    const s = String(text == null ? '' : text);
    const out = [];
    for (const m of s.matchAll(LINK_RE)) {
      const v = m[0].replace(/[.,;:!?)\]]+$/, '');
      // An email address is not a web link; skip the domain part of one.
      const before = s.slice(Math.max(0, m.index - 1), m.index);
      if (before === '@') continue;
      out.push(v);
    }
    return out;
  }
  function isWebAddress(s) {
    const v = String(s || '').trim();
    return /^https?:\/\/[^\s/$.?#].[^\s]*$/i.test(v) || /^www\.[^\s]+\.[^\s]+$/i.test(v);
  }

  // ---------- The plan rules (Step 2 and Step 3) ----------
  // plan: { sector: 'private'|'public', actions: { [actionId]: { status: 'new'|'embedded', text } }, narrative, website, responsible: { name, title } }
  function chosen(plan) {
    const acts = (plan && plan.actions) || {};
    return R.ACTIONS.filter(a => acts[a.id] && (acts[a.id].status === 'new' || acts[a.id].status === 'embedded'))
      .map(a => ({ id: a.id, action: a, status: acts[a.id].status, text: String(acts[a.id].text || '') }));
  }
  const GROUP_NAMES = kind => R.GROUPS.filter(g => g.kind === kind).map(g => g.name);
  const listWords = names => names.length < 2 ? names.join('') : names.slice(0, -1).join(', ') + ' or ' + names[names.length - 1];
  const plural = (n, one, many) => `${n} ${n === 1 ? one : (many || one + 's')}`;

  function checkPlan(plan) {
    const list = chosen(plan);
    const paygap = list.filter(x => x.action.kind === 'paygap');
    const meno = list.filter(x => x.action.kind === 'menopause');
    const fresh = list.filter(x => x.status === 'new');
    const embedded = list.filter(x => x.status === 'embedded');
    const rules = [
      {
        id: 'paygap', ok: paygap.length >= R.MINIMUMS.paygap.value, count: paygap.length, need: R.MINIMUMS.paygap.value,
        title: 'At least 1 action that addresses the gender pay gap',
        text: paygap.length ? `Met: ${plural(paygap.length, 'action addresses', 'actions address')} the gender pay gap.` : `Not met yet: choose at least 1 action from ${listWords(GROUP_NAMES('paygap'))}.`,
      },
      {
        id: 'menopause', ok: meno.length >= R.MINIMUMS.menopause.value, count: meno.length, need: R.MINIMUMS.menopause.value,
        title: 'At least 1 action that supports employees experiencing menopause',
        text: meno.length ? `Met: ${plural(meno.length, 'action supports', 'actions support')} employees experiencing menopause.` : 'Not met yet: choose at least 1 action from Supporting employees experiencing menopause.',
      },
      {
        id: 'new', ok: fresh.length >= R.MINIMUMS.newOrInProgress.value, count: fresh.length, need: R.MINIMUMS.newOrInProgress.value,
        title: 'At least 2 actions that are new or in progress',
        text: fresh.length >= 2 ? `Met: ${fresh.length} actions are new or in progress.`
          : `Not met yet: ${fresh.length} of the 2 needed${embedded.length ? `. Your ${plural(embedded.length, 'embedded action is', 'embedded actions are')} welcome in the plan but ${embedded.length === 1 ? 'does' : 'do'} not count towards this` : ''}.`,
      },
    ];
    const limit = R.LIMITS.actionWords.value, nlimit = R.LIMITS.narrativeWords.value;
    const texts = list.map(x => {
      const words = countWords(x.text);
      const links = findLinks(x.text);
      return { id: x.id, status: x.status, words, limit, over: words > limit, links, missing: x.status === 'new' && words === 0 };
    });
    const nWords = countWords(plan && plan.narrative);
    const narrative = { words: nWords, limit: nlimit, over: nWords > nlimit, links: findLinks(plan && plan.narrative) };
    const sector = plan && plan.sector === 'public' ? 'public' : 'private';
    const website = { url: String((plan && plan.website) || '').trim() };
    website.ok = !website.url || isWebAddress(website.url);
    const resp = (plan && plan.responsible) || {};
    const responsible = { required: R.RESPONSIBLE.required[sector], name: String(resp.name || '').trim(), title: String(resp.title || '').trim() };
    responsible.ok = !responsible.required || !!responsible.name;
    const textsOk = texts.every(t => !t.over && !t.links.length && !t.missing);
    const rulesOk = rules.every(r => r.ok);
    return {
      list, rules, texts, narrative, website, responsible,
      counts: { total: list.length, paygap: paygap.length, menopause: meno.length, new: fresh.length, embedded: embedded.length },
      rulesOk, textsOk,
      ready: rulesOk && textsOk && !narrative.over && !narrative.links.length,
    };
  }

  // ---------- Figures typed in, or from the Pay Gap Report ----------
  // keys: mh, md (mean and median hourly pay gap), mb, db (mean and median bonus gap), bm, bw (percentage of men and of
  // women paid a bonus), q1..q4 (percentage of women in the lower, lower middle, upper middle and upper quartile).
  const FIG_KEYS = ['mh', 'md', 'mb', 'db', 'bm', 'bw', 'q1', 'q2', 'q3', 'q4'];
  const FIG_LABEL = {
    mh: 'Mean gender pay gap in hourly pay', md: 'Median gender pay gap in hourly pay',
    mb: 'Mean gender pay gap in bonus pay', db: 'Median gender pay gap in bonus pay',
    bm: 'Men paid bonus pay', bw: 'Women paid bonus pay',
    q1: 'Women in the lower quartile', q2: 'Women in the lower middle quartile', q3: 'Women in the upper middle quartile', q4: 'Women in the upper quartile',
  };
  const FIG_FIELD = { mh: 'DiffMeanHourlyPercent', md: 'DiffMedianHourlyPercent', mb: 'DiffMeanBonusPercent', db: 'DiffMedianBonusPercent', bm: 'MaleBonusPercent', bw: 'FemaleBonusPercent', q1: 'FemaleLowerQuartile', q2: 'FemaleLowerMiddleQuartile', q3: 'FemaleUpperMiddleQuartile', q4: 'FemaleTopQuartile' };
  const QUARTILES = ['lower quartile', 'lower middle quartile', 'upper middle quartile', 'upper quartile'];
  const isGapKey = k => k === 'mh' || k === 'md' || k === 'mb' || k === 'db';
  // "13.6", "13,6", "13.6%", "−5.2", "-5.2 %": a percentage as published. Gaps may be negative (women paid more) and can fall
  // below -100%; shares run from 0 to 100. Anything else is not a figure.
  function parseFigure(raw, key) {
    if (raw == null) return null;
    if (typeof raw === 'number') return Number.isFinite(raw) ? check(raw) : null;
    let s = String(raw).trim().replace(/\s+/g, '').replace(/%$/, '').replace(/^[−–]/, '-');
    if (!s) return null;
    // A decimal comma ("13,6"); "1,234" is a thousands separator and no percentage
    if (/^-?\d+,\d{1,2}$/.test(s)) s = s.replace(',', '.');
    if (!/^-?(\d+\.?\d*|\.\d+)$/.test(s)) return null;
    return check(Number(s));
    function check(v) {
      if (!Number.isFinite(v)) return null;
      if (key && isGapKey(key)) return v <= 100 && v >= -1000 ? v : null;
      if (key) return v >= 0 && v <= 100 ? v : null;
      return v;
    }
  }
  function cleanFigures(obj) {
    const out = {};
    for (const k of FIG_KEYS) out[k] = parseFigure(obj ? obj[k] : null, k);
    return out;
  }
  const r1 = v => (v == null ? null : Math.round(v * 10) / 10);
  const fmt = v => {
    if (v == null) return '';
    const x = r1(v);
    return (x < 0 ? '−' : '') + Math.abs(x).toFixed(1) + '%';
  };

  // #prefill=1&s=private&y=2026&e=Name&mh=13.6&... (a URL fragment: the browser never sends it to a server)
  function buildPrefill(data) {
    const p = new URLSearchParams();
    p.set('prefill', '1');
    if (data.sector === 'public' || data.sector === 'private') p.set('s', data.sector);
    if (data.year) p.set('y', String(data.year));
    if (data.employer) p.set('e', String(data.employer).slice(0, 120));
    const f = data.figures || {};
    for (const k of FIG_KEYS) if (f[k] != null && Number.isFinite(f[k])) p.set(k, r1(f[k]).toFixed(1));
    return '#' + p.toString();
  }
  function parsePrefill(hash) {
    const h = String(hash || '').replace(/^#/, '');
    if (!h) return null;
    let p;
    try { p = new URLSearchParams(h); } catch (e) { return null; }
    if (p.get('prefill') !== '1') return null;
    const figures = {};
    let n = 0;
    for (const k of FIG_KEYS) { const v = parseFigure(p.get(k), k); figures[k] = v; if (v != null) n++; }
    const s = p.get('s');
    const y = Number(p.get('y'));
    const e = (p.get('e') || '').replace(/[\u0000-\u001f\u007f]/g, '').trim().slice(0, 120);
    return { sector: s === 'public' ? 'public' : s === 'private' ? 'private' : null, year: Number.isInteger(y) && y >= 2017 && y <= 2100 ? y : null, employer: e || null, figures, count: n };
  }

  // ---------- Quick diagnosis: factual patterns in the published figures, each linked to the actions GOV.UK says fit ----------
  // No benchmarks and no effect sizes: each pattern states what the figures show, and quotes the action page on when the
  // action may be useful. A difference smaller than 1 percentage point is described as about the same.
  const STEP = 1.0;
  function link(id, why) { return { id, name: R.BY_ID[id].name, why: why || R.BY_ID[id].useful }; }
  function diagnose(input) {
    const f = cleanFigures(input);
    const patterns = [], notes = [];
    const q = [f.q1, f.q2, f.q3, f.q4];
    const haveQ = q.every(v => v != null);
    // Hourly pay gaps: context, not a pattern with actions
    if (f.mh != null || f.md != null) {
      const parts = [];
      if (f.mh != null) parts.push(`the mean gap is ${fmt(f.mh)}`);
      if (f.md != null) parts.push(`the median gap is ${fmt(f.md)}`);
      const pos = [f.mh, f.md].filter(v => v != null);
      const allNeg = pos.every(v => v < 0), allPos = pos.every(v => v > 0);
      notes.push({
        id: allNeg ? 'gap-negative' : 'gap',
        text: `${allPos ? 'On average men are paid more per hour than women' : allNeg ? 'On average women are paid more per hour than men' : 'The hourly pay gaps point in different directions'}: ${parts.join(' and ')}.${allNeg ? ' The guidance says its actions may also support organisations with a negative pay gap.' : ''}`,
        source: 'overview',
      });
      if (f.mh != null && f.md != null && f.mh - f.md >= STEP && f.mh > 0) {
        notes.push({ id: 'mean-above-median', text: `The mean gap (${fmt(f.mh)}) is larger than the median gap (${fmt(f.md)}). A mean moves with the highest and lowest rates of pay, so the difference often sits at the top or the bottom of the pay range; the quartile figures show where.`, source: 'step1' });
      }
    }
    if (haveQ) {
      const fall = q[0] - q[3];
      if (fall >= STEP) {
        patterns.push({
          id: 'quartile-fall', kind: 'representation',
          text: `Women’s share falls from ${fmt(q[0])} in the lower quartile to ${fmt(q[3])} in the upper quartile.`,
          actions: [link('targets'), link('auto-promotion'), link('development-steps'), link('mentoring'), link('transparency'), link('structured-interviews')],
        });
        // Where the share drops most between neighbouring quartiles
        let best = -1, at = -1;
        for (let i = 0; i < 3; i++) { const d = q[i] - q[i + 1]; if (d > best) { best = d; at = i; } }
        if (best >= STEP) {
          patterns.push({
            id: 'quartile-step', kind: 'progression',
            text: `The biggest drop is between the ${QUARTILES[at]} and the ${QUARTILES[at + 1]}: from ${fmt(q[at])} to ${fmt(q[at + 1])}.`,
            question: R.STEP1_QUESTIONS[5],
            actions: [link('development-steps'), link('auto-promotion')],
          });
        }
      } else if (-fall >= STEP) {
        patterns.push({
          id: 'quartile-rise', kind: 'representation',
          text: `Women’s share rises from ${fmt(q[0])} in the lower quartile to ${fmt(q[3])} in the upper quartile, so men are fewer at the top than at the bottom.`,
          actions: [link('range-of-candidates'), link('targets')],
        });
      } else {
        notes.push({ id: 'quartile-flat', text: `Women’s share is about the same in the lower quartile (${fmt(q[0])}) and the upper quartile (${fmt(q[3])}).`, source: 'step1' });
      }
    }
    if (f.mb != null && f.mh != null && f.mb > 0 && f.mb - f.mh >= STEP) {
      const med = f.db != null && f.md != null && f.db > 0 && f.db - f.md >= STEP ? `, and the median bonus gap (${fmt(f.db)}) is larger than the median hourly gap (${fmt(f.md)})` : '';
      patterns.push({
        id: 'bonus-gap-larger', kind: 'bonus',
        text: `The bonus gap is larger than the hourly pay gap: the mean bonus gap is ${fmt(f.mb)} against a mean hourly gap of ${fmt(f.mh)}${med}.`,
        actions: [link('transparency')],
      });
    } else if (f.db != null && f.md != null && f.db > 0 && f.db - f.md >= STEP) {
      patterns.push({
        id: 'bonus-gap-larger', kind: 'bonus',
        text: `The median bonus gap (${fmt(f.db)}) is larger than the median hourly pay gap (${fmt(f.md)}).`,
        actions: [link('transparency')],
      });
    }
    if (f.bm != null && f.bw != null) {
      if (f.bm - f.bw >= STEP) {
        patterns.push({
          id: 'bonus-share', kind: 'bonus',
          text: `A smaller share of women than men received a bonus: ${fmt(f.bw)} of women against ${fmt(f.bm)} of men.`,
          actions: [link('transparency')],
        });
      } else if (f.bw - f.bm >= STEP) {
        notes.push({ id: 'bonus-share-women', text: `A larger share of women than men received a bonus: ${fmt(f.bw)} of women against ${fmt(f.bm)} of men.`, source: 'step1' });
      }
    }
    const any = FIG_KEYS.some(k => f[k] != null);
    if (any) notes.push({ id: 'menopause', text: 'The published figures say nothing about menopause. Step 1 asks you to talk to employees to understand how menopause may affect them at work, through interviews, focus groups or surveys.', source: 'step1' });
    return { figures: f, patterns, notes, any, complete: FIG_KEYS.every(k => f[k] != null) };
  }

  // ---------- The plan as text, in the order the guidance sets out (Steps 2 to 4) ----------
  function meta(plan) {
    const ry = R.reportingYear(plan && plan.sector, plan && plan.year);
    return { ry, employer: String((plan && plan.employer) || '').trim() };
  }
  function serviceBlocks(plan) {
    const c = checkPlan(plan);
    const blocks = [];
    const byGroup = R.GROUPS.map(g => ({ g, items: c.list.filter(x => x.action.group === g.id) })).filter(x => x.items.length);
    blocks.push({
      id: 'actions', step: 'Step 2', title: 'Your actions and their status',
      text: byGroup.map(({ g, items }) => `${g.name}\n` + items.map(x => `${x.action.name}: ${R.STATUSES[x.status].name}`).join('\n')).join('\n\n'),
    });
    for (const x of c.list) {
      const t = c.texts.find(tt => tt.id === x.id);
      blocks.push({ id: 'action:' + x.id, step: 'Step 3', title: x.action.name, status: R.STATUSES[x.status].name, text: x.text.trim(), words: t.words, limit: t.limit, over: t.over, links: t.links, missing: t.missing });
    }
    blocks.push({ id: 'narrative', step: 'Step 3', title: 'Supporting narrative for your overall action plan', text: String((plan && plan.narrative) || '').trim(), words: c.narrative.words, limit: c.narrative.limit, over: c.narrative.over, links: c.narrative.links });
    blocks.push({ id: 'website', step: 'Step 3', title: 'Link to the page on your website', text: c.website.url });
    if (c.responsible.required) blocks.push({ id: 'responsible', step: 'Step 4', title: 'Responsible person', text: [c.responsible.name, c.responsible.title].filter(Boolean).join(', ') });
    return blocks;
  }

  function planText(plan) {
    const c = checkPlan(plan);
    const m = meta(plan);
    const L = [];
    L.push(`Equality action plan, ${m.ry.label} reporting year`);
    if (m.employer) L.push(m.employer);
    L.push(`Snapshot date ${m.ry.snapshot.long}. Deadline ${m.ry.deadline.long} (${R.SECTORS[m.ry.sector].name.toLowerCase()}).`);
    L.push(`${m.ry.status === 'voluntary' ? 'Voluntary for the 2026 to 2027 reporting year.' : 'Whether this year is mandatory depends on regulations not yet made.'} ${R.asOfLine()}.`);
    L.push('');
    L.push('Checks');
    for (const r of c.rules) L.push(`${r.ok ? 'Met' : 'Not met'}: ${r.title.charAt(0).toLowerCase() + r.title.slice(1)}`);
    const sections = [['new', 'Planned actions (new or in progress)'], ['embedded', 'Embedded actions']];
    for (const [st, title] of sections) {
      const items = c.list.filter(x => x.status === st);
      if (!items.length) continue;
      L.push('', title);
      items.forEach((x, i) => {
        const t = c.texts.find(tt => tt.id === x.id);
        const g = R.GROUPS.find(gg => gg.id === x.action.group);
        L.push('', `${i + 1}. ${x.action.name} (${g.name})`);
        L.push(x.text.trim() || (st === 'new' ? '[Supporting text needed: why you chose this action and how you will track it]' : '[Optional: how this was embedded and its results]'));
        L.push(`${t.words} of ${t.limit} words`);
      });
    }
    L.push('', `Supporting narrative (${c.narrative.words} of ${c.narrative.limit} words)`);
    L.push(String((plan && plan.narrative) || '').trim() || '[Optional]');
    if (c.website.url) L.push('', 'Link to your website', c.website.url);
    if (c.responsible.required) L.push('', 'Responsible person', [c.responsible.name, c.responsible.title].filter(Boolean).join(', ') || '[Name and job title]');
    L.push('', 'Prepared with the Peak Apps Equality Action Plan tool (peakappsstudio.com/equality-action-plan/). Not legal advice: check the final text in the gender pay gap service.');
    return L.join('\n') + '\n';
  }

  // ---------- Measures tracker (Steps 5 and 6) ----------
  const TRACK_HEAD = ['Reporting year', 'Action ID', 'Action', 'Status', 'Metric', 'Baseline', 'Latest', 'Target', 'Owner', 'Review date', 'Notes'];
  const csvCell = v => { const s = v == null ? '' : String(v); return /[",\n\r]/.test(s) || (/^[=+\-@\t]/.test(s) && !/^-?\d/.test(s)) ? '"' + s.replace(/"/g, '""') + '"' : s; };
  function trackerRows(plan) {
    const tr = (plan && plan.tracker) || {};
    const m = meta(plan);
    return chosen(plan).map(x => {
      const t = tr[x.id] || {};
      return {
        year: m.ry.label, id: x.id, action: x.action.name, status: R.STATUSES[x.status].name,
        metric: t.metric != null ? t.metric : x.action.metrics[0], baseline: t.baseline || '', latest: t.latest || '', target: t.target || '',
        owner: t.owner || '', review: t.review || '', notes: t.notes || '',
      };
    });
  }
  function trackerCSV(rows) {
    const out = [TRACK_HEAD].concat(rows.map(r => [r.year, r.id, r.action, r.status, r.metric, r.baseline, r.latest, r.target, r.owner, r.review, r.notes]));
    return '﻿' + out.map(r => r.map(csvCell).join(',')).join('\r\n') + '\r\n';
  }
  function parseCSVText(text) {
    let s = String(text || '');
    if (s.charCodeAt(0) === 0xFEFF) s = s.slice(1);
    const first = (s.match(/^[^\r\n]*/) || [''])[0];
    const delim = (first.split(';').length > first.split(',').length) ? ';' : ',';
    const rows = []; let row = [], field = '', q = false;
    for (let i = 0; i < s.length; i++) {
      const ch = s[i];
      if (q) { if (ch === '"') { if (s[i + 1] === '"') { field += '"'; i++; } else q = false; } else field += ch; continue; }
      if (ch === '"' && field === '') { q = true; continue; }
      if (ch === delim) { row.push(field); field = ''; continue; }
      if (ch === '\r' || ch === '\n') { row.push(field); rows.push(row); row = []; field = ''; if (ch === '\r' && s[i + 1] === '\n') i++; continue; }
      field += ch;
    }
    if (field !== '' || row.length) { row.push(field); rows.push(row); }
    return rows.filter(r => r.some(c => String(c).trim() !== ''));
  }
  const keyOf = s => String(s || '').toLowerCase().replace(/[^a-z0-9]/g, '');
  function parseTrackerCSV(text) {
    const rows = parseCSVText(text);
    if (!rows.length) return { rows: [], error: 'empty' };
    const head = rows[0].map(keyOf);
    const col = name => head.indexOf(keyOf(name));
    const need = ['Action', 'Metric'];
    if (need.some(n => col(n) < 0)) return { rows: [], error: 'not-a-tracker' };
    const get = (r, name) => { const i = col(name); return i < 0 ? '' : String(r[i] == null ? '' : r[i]).trim(); };
    const out = rows.slice(1).map(r => {
      let id = get(r, 'Action ID');
      const name = get(r, 'Action');
      if (!R.BY_ID[id]) { const a = R.ACTIONS.find(x => keyOf(x.name) === keyOf(name) || keyOf(x.serviceName) === keyOf(name)); id = a ? a.id : ''; }
      return { year: get(r, 'Reporting year'), id, action: name, status: get(r, 'Status'), metric: get(r, 'Metric'), baseline: get(r, 'Baseline'), latest: get(r, 'Latest'), target: get(r, 'Target'), owner: get(r, 'Owner'), review: get(r, 'Review date'), notes: get(r, 'Notes') };
    }).filter(r => r.action || r.id);
    return { rows: out, error: null };
  }
  // A value as people type it in a tracker: "42", "42%", "1,250", "3.5 days". Returns the number and its unit, or null.
  function measure(v) {
    const s = String(v == null ? '' : v).trim();
    const m = /^([−-]?\d{1,3}(?:,\d{3})+(?:\.\d+)?|[−-]?\d+(?:\.\d+)?)\s*(%|[a-z][a-z ]*)?$/i.exec(s);
    if (!m) return null;
    return { value: Number(m[1].replace(/,/g, '').replace('−', '-')), unit: (m[2] || '').trim().toLowerCase() };
  }
  // change: this year's latest against last year's latest (or its baseline when no latest was recorded)
  function compareTracker(current, previous) {
    const prevBy = new Map();
    for (const p of previous || []) prevBy.set(p.id + '|' + keyOf(p.metric), p);
    const used = new Set();
    const rows = (current || []).map(c => {
      const k = c.id + '|' + keyOf(c.metric);
      let p = prevBy.get(k);
      if (!p) { p = (previous || []).find(x => x.id === c.id && !used.has(x.id + '|' + keyOf(x.metric))); }
      if (p) used.add(p.id + '|' + keyOf(p.metric));
      const now = measure(c.latest), then = p ? (measure(p.latest) || measure(p.baseline)) : null;
      const sameUnit = now && then && now.unit === then.unit;
      return { current: c, previous: p || null, change: sameUnit ? Math.round((now.value - then.value) * 1000) / 1000 : null, unit: sameUnit ? now.unit : '', against: p ? (measure(p.latest) ? 'latest' : 'baseline') : null };
    });
    const dropped = (previous || []).filter(p => !used.has(p.id + '|' + keyOf(p.metric)) && !(current || []).some(c => c.id === p.id));
    return { rows, dropped };
  }

  // ---------- Worked examples for the guides (synthetic) ----------
  // Written for a made-up retail and distribution business with 1,200 staff: mean hourly gap 14.2%, median 9.8%, mean
  // bonus gap 31.0%, women 64% of the lower quartile and 38% of the upper quartile, 31% of store managers. Each follows
  // the Step 3 prompts for a new or in progress action: why it was chosen, and how it will be tracked. The guide pages
  // print the same texts (a unit test keeps them identical), and #example=<id> opens the builder with one filled in.
  const EXAMPLE_EMPLOYER = { staff: 1200, mh: 14.2, md: 9.8, mb: 31.0, q1: 64, q4: 38, storeManagers: 31 };
  const EXAMPLES = {
    'job-descriptions': { status: 'new', text: 'Women make up a fifth of applicants for our distribution centre roles, though the work suits a wider range of people. A review found adverts full of ‘must-haves’ and words such as ‘competitive’. From January 2027 every advert will pass a checklist that removes them, separates essential from desirable criteria and invites requests for adjustments. We will track the share of adverts that pass the checklist, applicants and hires by sex for each role, and how many new starters stay 6 and 12 months, against this year’s figures.' },
    'range-of-candidates': { status: 'new', text: 'Men hold four in five of our distribution centre roles, and most applicants come through two agencies. We will advertise these roles through local return-to-work schemes and community groups, and invite past applicants to apply again. Recruiters will report applicants, interviews and hires by sex every quarter. We will also count the returners we hire and how many new recruits stay 12 months, compared with the last two campaigns.' },
    'cv-screening': { status: 'new', text: 'Store managers shortlist for assistant manager roles from full CVs, and last year women were shortlisted at a lower rate than men. From February 2027 applicants will use an anonymous form that lists experience in years, so a career break does not hide relevant experience. HR will track the share of campaigns using the form and the shortlisting, interview and offer rates of women and men, against last year’s figures.' },
    'structured-interviews': { status: 'new', text: 'Interviews for assistant manager roles differ from store to store, with different questions and no scoring. By June 2027 every interview will use the same scored questions for the role and a panel of two, and every hiring manager will be trained. HR will track the share of interviews that follow the format, shortlisted and successful candidates by sex, and how many new assistant managers stay 12 months, compared with this year.' },
    'advertise-leave': { status: 'new', text: 'Our adverts say ‘competitive benefits’ but not what we offer, though our parental and carer’s leave go beyond the legal minimum. From January 2027 every advert will state our parental, carer’s and compassionate leave. We will track the share of adverts that do, ask new starters in their first month whether the leave policies affected their decision, and count staff who tell us they are unpaid carers, starting from this year’s baseline.' },
    'advertise-flexible': { status: 'new', text: 'Most head office roles can be worked flexibly, but only one advert in ten says so, and women are under a third of applicants for senior head office roles. From January 2027 every advert will say which flexible working arrangements the role allows and that staff can ask for flexible working from their first day. We will track the share of adverts that state it, applicants and hires by sex, and how many candidates name flexibility as a reason to apply.' },
    'auto-promotion': { status: 'new', text: 'Women are 64% of our lower pay quartile but 38% of the upper quartile, and fewer women than men apply for store manager roles. From April 2027 every assistant manager who meets the criteria will be considered for each store manager vacancy, with the choice to opt out. We will track progression from assistant to store manager by sex, applicants and appointments by sex, and candidates’ views of the process, against this year’s figures.' },
    'development-steps': { status: 'new', text: 'Exit interviews show that women at assistant manager level often leave without a clear route to the next role. From January 2027 every appraisal will end with two or three specific development steps and a date to review them, and managers will be trained to give that feedback. We will survey staff on how useful they find their feedback, and track progression and retention by sex at each grade against this year’s baseline.' },
    'mentoring': { status: 'new', text: 'Women hold 38% of our upper quartile roles, and few women in head office have a senior colleague who speaks up for them. In 2027 we will pair 30 employees with senior sponsors for a year, with places open to all and promoted to women in particular. We will track who takes part and their progression by sex, drop-out and its reasons, and whether participants stay longer than colleagues at the same grade who did not take part.' },
    'targets': { status: 'new', text: 'Women are 38% of our upper pay quartile and 31% of store managers. We have set a target of 40% of store managers by April 2029, with a target for each region agreed by its director. Regional directors will report progress to the executive team every quarter, using the same headcount data as our gender pay gap report, and we will record what helped or held back each region.' },
    'transparency': { status: 'new', text: 'Our mean bonus gap is 31.0%, more than twice our hourly pay gap, and fewer women than men receive a bonus. From April 2027 we will publish the pay range for every grade and the criteria for each bonus scheme on our intranet, and explain how decisions are made. We will track bonus awards by sex within each grade, promotion applications and appointments by sex, and staff views on fairness in our annual survey.' },
    'flexible-leave': { status: 'new', text: 'Few men take shared parental leave, and our staff survey shows managers are unsure which flexible working they can agree. In 2027 we will publish one guide to flexible working and leave, brief every manager on it, and share stories from colleagues who have used it. We will track the use of flexible working and each type of leave by sex and grade, and survey staff and managers on how well they understand the policies.' },
    'train-managers': { status: 'new', text: 'In our staff survey, many colleagues said they would not know whom to ask about menopause support. By September 2027 all 140 line managers will complete a 90-minute session on how menopause can affect work, the support we offer and how to hold a private conversation. We will count completions, survey managers before and after, and compare absence and retention of women aged 40 to 60 with this year’s baseline.' },
    'occupational-health': { status: 'new', text: 'Our occupational health service covers injuries at work but not menopause, and staff told us they did not know it existed. From March 2027 employees can book a confidential appointment with an occupational health adviser trained in menopause. We will track awareness of the service in our staff survey, its use by age and sex, absence and retention of women aged 40 to 60, and satisfaction from anonymous feedback.' },
    'support-groups': { status: 'new', text: 'Colleagues in stores told us they had nobody to talk to about menopause at work. We will set up a menopause network open to everyone, with monthly online sessions and a contact in each region, and invite colleagues with related conditions such as endometriosis. We will track how many people join and their feedback, ask in our staff survey whether the support helps, and compare absence and retention of women aged 40 to 60 with this year.' },
    'adjustments': { status: 'new', text: 'Requests for adjustments are handled differently in each store, and some take months. From January 2027 one process will cover menopause adjustments such as flexible start times, rest breaks and uniform changes, with a reply within 10 working days and changes agreed in writing. We will track the share of staff using adjustments by age and sex, absence and retention, and feedback from anonymous surveys and exit interviews.' },
    'risk-assessment': { status: 'new', text: 'Our risk assessments do not consider menopause, and store uniforms and stockroom temperatures came up in focus groups. By June 2027 every site will add menopause to its risk assessment: temperature and ventilation, uniform fit and spares, rest areas, toilets and cold drinking water. We will track how many assessments are completed and acted on, survey staff on the changes, and compare absence and retention with this year’s baseline.' },
    'review-policies': { status: 'new', text: 'Our absence policy counts menopause-related absence towards formal stages, and we have no menopause policy. With a group of colleagues with lived experience, we will review our absence, flexible working and uniform policies and publish a menopause policy by September 2027. We will track absence and retention of women aged 40 to 60, the use of flexible working and adjustments by age and sex, and satisfaction in anonymous surveys.' },
  };

  // ---------- The synthetic sample plan ----------
  // Its figures are the six measures of the synthetic HR export in analysis.js (unit test: the two agree).
  // The six published measures of the synthetic HR export (analysis.js sampleCSV), rounded as published.
  const SAMPLE_FIGURES = { mh: 11.9, md: 8.0, mb: 57.9, db: 20.3, bm: 61.6, bw: 26.1, q1: 65.7, q2: 33.3, q3: 22.9, q4: 27.6 };
  const SAMPLE = {
    employer: 'Sample Company Ltd', sector: 'private', year: 2026, website: 'https://www.example.com/equality',
    responsible: { name: 'Alex Morgan', title: 'Chief People Officer' },
    note: 'Synthetic data: a made-up company of 420 employees, so you can see every step work.',
  };
  const SAMPLE_TEXTS = {
    'targets': { status: 'new', text: 'Women hold over half of our lower-quartile roles but under a third of upper-quartile roles. We will set a target for women in team leader and manager roles for each operations site, agreed with site directors. HR will report progress against each site’s target to the executive team every quarter, using the same headcount data as our gender pay gap report so the numbers compare year on year.' },
    'auto-promotion': { status: 'new', text: 'In our promotion data, a smaller share of women than men moved up a grade last year. From January 2027 every employee who meets the criteria for a team leader or supervisor role will be considered automatically, with the option to opt out. We will track applications, offers and promotions by sex at each grade, and compare them with this year’s baseline at the April 2027 snapshot.' },
    'transparency': { status: 'new', text: 'Our bonus gap is wider than our hourly pay gap, and fewer women than men received a bonus. We will publish the criteria for each bonus scheme and the pay range for every grade on our intranet, and explain how decisions are made. We will track the share of men and women paid a bonus in each grade and ask staff in our annual survey whether reward decisions feel fair.' },
    'train-managers': { status: 'new', text: 'Staff told us in focus groups that they did not know whom to ask about menopause support. All 38 line managers will complete a 90-minute session on menopause, the support we offer and how to hold a private conversation. We will count completions, survey managers before and after, and compare absence and retention for women aged 40 to 60 with this year’s baseline.' },
    'structured-interviews': { status: 'embedded', text: 'Since 2024 every interview uses the same scored questions for each role and a panel of at least two people, one trained in fair recruitment. Hiring managers record scores before discussing candidates. Shortlists and offers by sex are reviewed twice a year by HR.' },
    'adjustments': { status: 'embedded', text: 'Our adjustments policy covers menopause and is agreed in writing with each employee who asks, usually within 10 working days. Desk fans, uniform changes and flexible start times are the most common. Reviews happen every three months.' },
  };
  const SAMPLE_NARRATIVE = 'Sample Company Ltd runs warehouses and delivery depots across England. Most of our operations staff are men, while women hold most customer service and administration roles, which sit in the lower pay quartiles. Our gender pay gap comes mainly from that pattern and from fewer women in team leader and manager posts. This plan concentrates on progression into those posts, on clear rules for pay and bonuses, and on support for colleagues experiencing menopause, which staff raised in our focus groups. We already use structured interviews and offer menopause adjustments, and we report on both. The executive team reviews progress every quarter, and we will report on each action alongside our gender pay gap figures next year.';
  function samplePlan(figures) {
    const actions = {};
    for (const [id, a] of Object.entries(SAMPLE_TEXTS)) actions[id] = { status: a.status, text: a.text };
    return {
      employer: SAMPLE.employer, sector: SAMPLE.sector, year: SAMPLE.year, website: SAMPLE.website,
      responsible: Object.assign({}, SAMPLE.responsible), narrative: SAMPLE_NARRATIVE, actions,
      figures: Object.assign({}, figures || SAMPLE_FIGURES), sample: true,
    };
  }

  return {
    R, countWords, findLinks, isWebAddress, checkPlan, chosen, parseFigure, cleanFigures, buildPrefill, parsePrefill, diagnose,
    serviceBlocks, planText, trackerRows, trackerCSV, parseTrackerCSV, parseCSVText, compareTracker, measure, samplePlan,
    FIG_KEYS, FIG_LABEL, FIG_FIELD, QUARTILES, SAMPLE, SAMPLE_FIGURES, SAMPLE_TEXTS, SAMPLE_NARRATIVE, TRACK_HEAD, EXAMPLES, EXAMPLE_EMPLOYER, fmt, r1,
  };
});
