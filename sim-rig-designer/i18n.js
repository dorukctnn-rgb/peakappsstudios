/* Sim Rig Designer: the language layer. One dictionary per language (i18n/en.js, fr.js, es.js, it.js...), each a flat object of
 * keys to strings with {placeholders} or to small functions where the grammar needs them (plurals, gender, optional
 * parts). The engine, the view, the page, the 3D labels and the PDF all take their words from here, so a design reads
 * the same in every place, and a key missing from one language fails the tests (i18n.test.mjs), never the page.
 * Numbers: a decimal point in English, a decimal comma in the other editions; long numbers grouped the local way.
 * French typography: the space before : ; ? ! is a no-break space, added here so no dictionary has to type it.
 * The language is part of the page (its <html lang>), never of the design, so a share link opens in any language.
 * Works in the browser (window.SimRigI18n, over window.SimRigStrings) and in Node for the tests and the build. */
(function (root, factory) {
  if (typeof module === 'object' && module.exports) {
    // in Node (tests, build): every dictionary there is; a language whose file is not written yet is simply absent
    const all = {};
    for (const l of ['en', 'de', 'pt', 'es', 'fr', 'it']) {
      try { all[l] = require(`./i18n/${l}.js`); } catch (e) { if (!/ENOENT|Cannot find/.test(e.message)) throw e; }
    }
    module.exports = factory(all);
  }
  else root.SimRigI18n = factory(root.SimRigStrings || {});
})(typeof self !== 'undefined' ? self : this, function (S) {
  'use strict';
  // the languages with a dictionary (in the browser: English and the page's own); TAG is each one's BCP 47 tag
  const LANGS = Object.keys(S).length ? Object.keys(S) : ['en'];
  const TAG = { en: 'en', fr: 'fr', es: 'es', it: 'it', pt: 'pt-BR', nl: 'nl', de: 'de' };
  const NBSP = ' ';
  let lang = 'en';

  // ---------- numbers ----------
  const SEP = { en: { dec: '.', group: '' }, fr: { dec: ',', group: NBSP }, es: { dec: ',', group: '.' }, it: { dec: ',', group: '.' }, pt: { dec: ',', group: '.' }, nl: { dec: ',', group: '.' }, de: { dec: ',', group: '.' } };
  // x with d decimals, in the language's own way; long whole parts grouped by thousands (English never groups here,
  // as the tool always printed it: 15240 mm)
  function fixed(x, d = 0, l = lang) {
    const s = SEP[l] || SEP.en;
    let str = (Math.round(x * 10 ** d) / 10 ** d).toFixed(d);
    if (str === '-0' || /^-0[.]0+$/.test(str)) str = str.slice(1);
    let [whole, frac] = str.split('.');
    if (s.group && /^-?\d{5,}$/.test(whole)) whole = whole.replace(/\B(?=(\d{3})+(?!\d))/g, s.group);
    return frac ? `${whole}${s.dec}${frac}` : whole;
  }
  // a number already written with a decimal point ("2.32", from toFixed or a table), in the language's own way
  function dec(str, l = lang) {
    const s = SEP[l] || SEP.en;
    let [whole, frac] = String(str).split('.');
    if (s.group && /^-?\d{5,}$/.test(whole)) whole = whole.replace(/\B(?=(\d{3})+(?!\d))/g, s.group);
    return frac != null ? `${whole}${s.dec}${frac}` : whole;
  }
  // up to d decimals, trailing zeros dropped: 1,2 and 3 rather than 1,20 and 3,00
  function trim(x, d = 2, l = lang) {
    const r = Math.round(x * 10 ** d) / 10 ** d;
    const dd = Number.isInteger(r) ? 0 : String(r).split('.')[1].length;
    return fixed(r, Math.min(d, dd), l);
  }
  // money: two decimals, grouped as each country writes prices (1,234.50; 1 234,50; 1234,50)
  const LOCALE = { en: 'en-US', fr: 'fr-FR', es: 'es-ES', it: 'it-IT', pt: 'pt-BR', nl: 'nl-NL', de: 'de-DE' };
  function money(x, l = lang) {
    if (x == null) return '';
    try { return x.toLocaleString(LOCALE[l] || 'en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 }); }
    catch (e) { return fixed(x, 2, l); }
  }

  // ---------- dates: 12 October 2026; 12 octobre 2026 (1er octobre); 12 de octubre de 2026; 12 ottobre 2026;
  // 12 de outubro de 2026 (1º de outubro); 12 oktober 2026; 12. Oktober 2026 ----------
  const MONTHS = {
    en: ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'],
    fr: ['janvier', 'février', 'mars', 'avril', 'mai', 'juin', 'juillet', 'août', 'septembre', 'octobre', 'novembre', 'décembre'],
    es: ['enero', 'febrero', 'marzo', 'abril', 'mayo', 'junio', 'julio', 'agosto', 'septiembre', 'octubre', 'noviembre', 'diciembre'],
    it: ['gennaio', 'febbraio', 'marzo', 'aprile', 'maggio', 'giugno', 'luglio', 'agosto', 'settembre', 'ottobre', 'novembre', 'dicembre'],
    pt: ['janeiro', 'fevereiro', 'março', 'abril', 'maio', 'junho', 'julho', 'agosto', 'setembro', 'outubro', 'novembro', 'dezembro'],
    nl: ['januari', 'februari', 'maart', 'april', 'mei', 'juni', 'juli', 'augustus', 'september', 'oktober', 'november', 'december'],
    de: ['Januar', 'Februar', 'März', 'April', 'Mai', 'Juni', 'Juli', 'August', 'September', 'Oktober', 'November', 'Dezember'],
  };
  function date(iso, l = lang) {
    const [y, m, d] = String(iso).split('-').map(Number);
    const mo = (MONTHS[l] || MONTHS.en)[m - 1];
    if (l === 'fr') return `${d === 1 ? '1er' : d} ${mo} ${y}`;
    if (l === 'es') return `${d} de ${mo} de ${y}`;
    if (l === 'pt') return `${d === 1 ? '1º' : d} de ${mo} de ${y}`;
    if (l === 'de') return `${d}. ${mo} ${y}`;
    return `${d} ${mo} ${y}`;
  }

  // ---------- plurals: French counts 0 and 1 as singular; the other languages only 1 ----------
  function plural(n, one, many, l = lang) { return (l === 'fr' ? Math.abs(n) < 2 : n === 1) ? one : many; }

  // ---------- typography ----------
  // French: a no-break space before the high punctuation marks, and none doubled
  const frType = s => String(s).replace(/[  ]+([:;!?])(?=\s|$|[)<])/g, `${NBSP}$1`);
  const finish = (s, l) => (l === 'fr' ? frType(s) : s);

  // ---------- lookups ----------
  const fill = (s, p) => String(s).replace(/\{(\w+)\}/g, (m, k) => (p && p[k] != null ? String(p[k]) : m));
  function raw(key, l) { const d = S[l]; return d && Object.prototype.hasOwnProperty.call(d, key) ? d[key] : undefined; }
  function t(key, p, l = lang) {
    let v = raw(key, l);
    if (v === undefined && l !== 'en') v = raw(key, 'en');
    if (v === undefined) return `[${key}]`;
    const out = typeof v === 'function' ? v(p || {}, api(l)) : fill(v, p);
    return finish(out, l);
  }
  const has = (key, l = lang) => raw(key, l) !== undefined;
  // the helpers a dictionary function gets: the same formatting, fixed to its language
  function api(l) {
    return { n: (x, d) => fixed(x, d, l), trim: (x, d) => trim(x, d, l), dec: s => dec(s, l), date: iso => date(iso, l), plural: (n, a, b) => plural(n, a, b, l), t: (k, p) => t(k, p, l), lang: l };
  }

  function setLang(l) { if (!LANGS.includes(l)) throw new Error(`no language ${l}`); lang = l; return lang; }
  function getLang() { return lang; }
  // run fn in another language and come back (the build makes all three editions in one process)
  function withLang(l, fn) { const was = lang; setLang(l); try { return fn(); } finally { lang = was; } }

  return { LANGS, TAG, NBSP, setLang, getLang, withLang, t, has, raw, fixed, dec, trim, money, date, plural, frType, dict: S };
});
