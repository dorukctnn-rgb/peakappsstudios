/* Pay Transparency Kit: a job ad checker for Article 5 of Directive (EU) 2023/970.
 * It reads a pasted job ad in English, German or Dutch and looks for: a starting pay or pay range (Art. 5(1)(a)),
 * vague pay wording with no figure, a reference to a collective agreement or pay scale (Art. 5(1)(b)), questions about
 * current or past pay (Art. 5(2)), and gendered job titles or wording (Art. 5(3)).
 * The word lists are published on the page; nothing here is a legal judgement. Pure functions, no DOM. */
(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory();
  else root.PayTransJobAd = factory();
})(typeof self !== 'undefined' ? self : this, function () {
  'use strict';

  const LISTS = {
    vague: {
      en: ['competitive salary', 'competitive pay', 'competitive package', 'attractive salary', 'attractive package', 'market rate', 'market-rate', 'salary negotiable', 'negotiable salary', 'depending on experience', 'commensurate with experience', 'salary to be discussed', 'excellent salary', 'generous salary'],
      de: ['attraktives gehalt', 'attraktive vergütung', 'leistungsgerechte vergütung', 'leistungsgerechtes gehalt', 'marktgerechte vergütung', 'marktübliche vergütung', 'marktübliches gehalt', 'überdurchschnittliche bezahlung', 'überdurchschnittliche vergütung', 'gehalt nach vereinbarung', 'vergütung nach vereinbarung', 'angemessene vergütung', 'gutes gehalt', 'faire bezahlung', 'faire vergütung'],
      nl: ['marktconform salaris', 'marktconforme beloning', 'goed salaris', 'aantrekkelijk salaris', 'uitstekend salaris', 'salaris in overleg', 'salaris nader overeen te komen', 'competitief salaris', 'passend salaris', 'salaris naar ervaring', 'prima salaris', 'goede arbeidsvoorwaarden'],
    },
    history: {
      en: ['current salary', 'current compensation', 'current pay', 'current package', 'current ctc', 'present salary', 'salary history', 'pay history', 'compensation history', 'previous salary', 'past salary', 'last salary', 'most recent salary', 'prior salary', 'earnings history', 'what you earn now', 'what you currently earn'],
      de: ['aktuelles gehalt', 'aktuellen gehalt', 'derzeitiges gehalt', 'derzeitigen gehalts', 'jetziges gehalt', 'bisheriges gehalt', 'bisherigen gehalt', 'letztes gehalt', 'letzten gehalts', 'gehaltshistorie', 'gehaltsnachweis', 'aktuelle vergütung', 'derzeitige vergütung', 'bisherige vergütung', 'aktuelles einkommen', 'derzeitiges einkommen'],
      nl: ['huidige salaris', 'huidig salaris', 'laatst verdiende salaris', 'laatstverdiende salaris', 'laatst verdiend salaris', 'vorige salaris', 'vorig salaris', 'salarisgeschiedenis', 'huidige beloning', 'huidig loon', 'huidige loon', 'eerdere salaris', 'eerder salaris'],
    },
    gendered: {
      en: ['salesman', 'salesmen', 'saleswoman', 'chairman', 'foreman', 'handyman', 'workman', 'craftsman', 'fireman', 'policeman', 'cameraman', 'deliveryman', 'repairman', 'businessman', 'draughtsman', 'warehouseman', 'waitress', 'stewardess', 'hostess', 'headmaster', 'headmistress', 'manageress', 'seamstress', 'cleaning lady', 'tea lady', 'girl friday', 'manpower', 'he will', 'he should', 'he must', 'he has', 'he is', 'she will', 'she should', 'she must', 'she has', 'she is'],
      de: ['sekretärin', 'kauffrau', 'kaufmann', 'krankenschwester', 'putzfrau', 'hausmeister', 'fachmann', 'vorarbeiter', 'empfangsdame', 'zimmermädchen', 'kellnerin', 'verkäuferin', 'friseurin', 'assistentin', 'sachbearbeiterin', 'buchhalterin'],
      nl: ['secretaresse', 'schoonmaakster', 'verkoopster', 'medewerkster', 'gastvrouw', 'kapster', 'verpleegster', 'serveerster', 'werkster', 'timmerman', 'vakman', 'zakenman', 'brandweerman', 'stuurman', 'kassajuffrouw', 'hij is', 'hij heeft', 'hij kan', 'hij moet', 'hij zal'],
    },
    // A German ad is gender-neutral in practice when it marks the title, for example (m/w/d), or uses an inclusive form.
    deMarkers: ['m/w/d', 'w/m/d', 'd/m/w', 'm/f/d', 'f/m/d', 'm/w/x', 'w/m/x', '(gn)', '(all genders)', '(alle geschlechter)', 'Entwickler*in, Entwickler:in, Entwickler_in, EntwicklerInnen, Entwickler/-in'],
    agreement: {
      en: ['collective agreement', 'collective bargaining agreement', 'pay scale', 'salary scale', 'pay band', 'salary band', 'grade'],
      de: ['tarifvertrag', 'tarifvertrags', 'tariflich', 'tvöd', 'tv-l', 'tv-h', 'entgeltgruppe', 'entgeltstufe', 'gehaltsband', 'gehaltsstufe', 'eingruppierung'],
      nl: ['cao', 'collectieve arbeidsovereenkomst', 'salarisschaal', 'loonschaal', 'functieschaal', 'schaal', 'trede'],
    },
  };

  const STOP = {
    en: ['the', 'and', 'you', 'with', 'for', 'our', 'we', 'will', 'your', 'are', 'to', 'of'],
    de: ['und', 'die', 'der', 'das', 'mit', 'für', 'wir', 'sie', 'bei', 'ihre', 'ihr', 'eine', 'einen', 'ein', 'zu', 'auf', 'im', 'nach', 'bis', 'unser', 'unsere', 'ist', 'sind', 'als', 'von', 'den', 'dem', 'des', 'oder', 'auch', 'gesucht', 'suchen', 'wird', 'werden'],
    nl: ['en', 'de', 'het', 'je', 'jij', 'wij', 'we', 'met', 'voor', 'bij', 'een', 'van', 'ons', 'onze', 'jouw', 'naar', 'ook', 'als', 'wat', 'zijn', 'zoeken', 'wordt', 'heb', 'per', 'tot'],
  };
  function detectLang(text) {
    const words = String(text || '').toLowerCase().match(/[a-zäöüßéëï]+/g) || [];
    const score = { en: 0, de: 0, nl: 0 };
    for (const w of words) for (const l of Object.keys(STOP)) if (STOP[l].includes(w)) score[l]++;
    const best = Object.entries(score).sort((a, b) => b[1] - a[1])[0];
    return best[1] ? best[0] : 'en';
  }

  const CUR = '(?:€|eur|euro|euros|£|gbp|\\$|usd|chf|pln|zł|czk|kč|sek|dkk|huf|ron|bgn|lei)';
  const NUM = '\\d{1,3}(?:[.,\\s  ]\\d{3})*(?:[.,]\\d{1,2})?|\\d+(?:[.,]\\d{1,2})?';
  const AMOUNT = new RegExp(`(?:${CUR}\\s?(?:${NUM})\\s?k?|(?:${NUM})\\s?k?\\s?${CUR}|\\b\\d{2,3}\\s?k\\b)`, 'gi');
  const PAY_WORD = /\b(salary|salaries|pay|wage|wages|compensation|remuneration|gehalt|gehälter|vergütung|entgelt|lohn|bruttojahresgehalt|jahresgehalt|monatsgehalt|salaris|loon|beloning|bruto|brutto|gross)\b/i;
  const PER = /\b(per (?:year|annum|month|hour)|a year|an hour|p\.?\s?a\.?|pro (?:jahr|monat|stunde)|jährlich|monatlich|im jahr|im monat|per (?:jaar|maand|uur)|bruto per)\b/i;

  function findAll(text, list) {
    const low = text.toLowerCase();
    const found = [];
    for (const w of list) {
      const isWord = /^[a-zäöüßéëï ]+$/.test(w);
      const re = isWord ? new RegExp(`(^|[^a-zäöüßéëï])(${w.replace(/[.*+?^${}()|[\]\\/]/g, '\\$&')})(?=$|[^a-zäöüßéëï])`, 'g') : new RegExp(w.replace(/[.*+?^${}()|[\]\\/]/g, '\\$&'), 'g');
      let m;
      while ((m = re.exec(low))) {
        const at = isWord ? m.index + m[1].length : m.index;
        found.push({ term: w, at, text: text.slice(at, at + w.length), context: context(text, at, w.length) });
        if (!re.global) break;
      }
    }
    return found.sort((a, b) => a.at - b.at);
  }
  function context(text, at, len) {
    const a = Math.max(0, at - 40), b = Math.min(text.length, at + len + 40);
    return (a > 0 ? '…' : '') + text.slice(a, b).replace(/\s+/g, ' ').trim() + (b < text.length ? '…' : '');
  }

  // A pay figure: an amount with a currency (or 45k), near a pay word or a "per year" style period.
  function payFigures(text) {
    const out = [];
    let m;
    AMOUNT.lastIndex = 0;
    while ((m = AMOUNT.exec(text))) {
      const around = text.slice(Math.max(0, m.index - 120), Math.min(text.length, m.index + m[0].length + 120));
      if (PAY_WORD.test(around) || PER.test(around) || /€|£|\$/.test(m[0])) out.push({ text: m[0].trim(), at: m.index, context: context(text, m.index, m[0].length) });
    }
    return out;
  }

  function check(text, forceLang) {
    const t = String(text || '');
    const lang = forceLang || detectLang(t);
    // The ad's own language, plus English, which turns up in ads written in any language.
    const langs = lang === 'en' ? ['en'] : [lang, 'en'];
    const figures = payFigures(t);
    const vague = [].concat(...langs.map(l => findAll(t, LISTS.vague[l])));
    const history = [].concat(...langs.map(l => findAll(t, LISTS.history[l])));
    // A German title marked (m/w/d) or written in an inclusive form is read as gender-neutral, whatever the word.
    const gendered = [].concat(...langs.map(l => (l === 'de' && hasDeMarker(t) ? [] : findAll(t, LISTS.gendered[l]))));
    const agreement = [].concat(...langs.map(l => findAll(t, LISTS.agreement[l])));
    const findings = [];
    const empty = !t.trim();
    if (empty) return { lang, empty: true, findings: [], figures: [], vague: [], history: [], gendered: [], agreement: [] };
    if (figures.length) findings.push({ id: 'pay', state: 'ok', article: '5(1)(a)', items: figures });
    else if (agreement.length) findings.push({ id: 'pay-scale', state: 'check', article: '5(1)(a) and (b)', items: agreement });
    else findings.push({ id: 'pay-missing', state: 'fail', article: '5(1)(a)', items: vague });
    if (vague.length && figures.length) findings.push({ id: 'vague-with-figure', state: 'info', article: '5(1)(a)', items: vague });
    if (agreement.length && figures.length) findings.push({ id: 'agreement', state: 'ok', article: '5(1)(b)', items: agreement });
    findings.push(history.length ? { id: 'history', state: 'fail', article: '5(2)', items: history } : { id: 'history-none', state: 'ok', article: '5(2)', items: [] });
    const neutral = [];
    if (gendered.length) neutral.push({ id: 'gendered', state: 'check', article: '5(3)', items: gendered });
    if (lang === 'de' && !hasDeMarker(t)) neutral.push({ id: 'de-marker', state: 'check', article: '5(3)', items: [] });
    if (!neutral.length) neutral.push({ id: 'gendered-none', state: 'ok', article: '5(3)', items: [] });
    findings.push(...neutral);
    return { lang, empty: false, findings, figures, vague, history, gendered, agreement };
  }
  function hasDeMarker(text) {
    const low = text.toLowerCase();
    if (LISTS.deMarkers.slice(0, -1).some(m => low.includes(m))) return true;
    if (/[a-zäöü](\*|:|_)in(nen)?\b/i.test(text)) return true; // Entwickler*in, Entwickler:innen
    if (/[a-zäöü]Innen\b/.test(text)) return true; // EntwicklerInnen
    return /[a-zäöü]\/-?in\b/i.test(text); // Entwickler/-in, Entwickler/in
  }

  return { LISTS, detectLang, payFigures, check, findAll, hasDeMarker };
});
