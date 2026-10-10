/* Pay Transparency Kit: the worker's request letter page (English, German and Dutch pages share this script).
 * Everything typed here stays on this page: no request is sent, nothing is stored, there are no analytics.
 * pdf-lib and the Pay Gap Report's PDF text helper load only when the PDF is asked for. */
(function () {
  'use strict';
  const R = window.PayTransRules, LT = window.PayTransLetters;
  const $ = id => document.getElementById(id);
  const lang = (document.documentElement.lang || 'en').slice(0, 2);
  const esc = s => String(s == null ? '' : s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

  const T = {
    en: {
      badge: { statutory: 'In force', upcoming: 'From', voluntary: 'Not in force yet', unknown: 'Not confirmed' },
      name: '[Your name]', employer: '[Employer]', comparison: '[comparison activity]',
      statutory: (c, reg, from, per) => `<strong>${c}: ${reg}</strong><span>In force since ${from}. The answer is due within ${per}. The letter cites this rule.</span>`,
      upcoming: (c, reg, from) => `<strong>${c}: ${reg}</strong><span>Applies from ${from}. Until then the letter asks voluntarily and says when the rule starts.</span>`,
      voluntary: (c, st) => `<strong>${c}: ${st === 'bill' ? 'a bill is before parliament' : st === 'partly' ? 'transposed in part' : 'not transposed yet'}</strong><span>The right to this information is not in force yet, so the letter asks voluntarily and cites the directive. It promises nothing the law does not give.</span>`,
      unknown: c => `<strong>${c}: not confirmed</strong><span>We could not confirm the national position on an official source. The letter cites the directive and claims no national rule.</span>`,
      checked: 'Last checked 8 October 2026.', table: 'All 27 countries', copied: 'Letter copied.', copyFail: 'Copy did not work in this browser. Select the letter and copy it.',
      pdfDone: 'PDF downloaded.', txtDone: 'Text file downloaded.', pdfFail: 'The PDF could not be made. Use the text file instead.', making: 'Preparing the PDF…',
      file: 'pay-information-request', needComparison: 'Name the comparison activity: the same or equal-value work you want to compare with.',
    },
    de: {
      badge: { statutory: 'In Kraft', upcoming: 'Ab', voluntary: 'Noch nicht in Kraft', unknown: 'Nicht bestätigt' },
      name: '[Ihr Name]', employer: '[Arbeitgeber]', comparison: '[Vergleichstätigkeit]',
      statutory: (c, reg, from, per) => `<strong>${c}: ${reg}</strong><span>In Kraft seit ${from}. Die Antwort ist innerhalb von ${per} fällig. Das Schreiben stützt sich auf diese Regel.</span>`,
      upcoming: (c, reg, from) => `<strong>${c}: ${reg}</strong><span>Gilt ab ${from}. Bis dahin bittet das Schreiben um freiwillige Auskunft und nennt den Starttermin.</span>`,
      voluntary: (c, st) => `<strong>${c}: ${st === 'bill' ? 'Gesetzentwurf im Parlament' : st === 'partly' ? 'teilweise umgesetzt' : 'noch nicht umgesetzt'}</strong><span>Das Auskunftsrecht gilt noch nicht. Das Schreiben bittet deshalb um freiwillige Auskunft und beruft sich auf die Richtlinie, ohne einen Anspruch zu behaupten, den es noch nicht gibt.</span>`,
      unknown: c => `<strong>${c}: nicht bestätigt</strong><span>Den nationalen Stand konnten wir in keiner amtlichen Quelle bestätigen. Das Schreiben beruft sich auf die Richtlinie und behauptet keine nationale Regel.</span>`,
      checked: 'Zuletzt geprüft am 8. Oktober 2026.', table: 'Alle 27 Länder (Englisch)', copied: 'Schreiben kopiert.', copyFail: 'Kopieren hat in diesem Browser nicht geklappt. Markieren und kopieren Sie den Text.',
      pdfDone: 'PDF heruntergeladen.', txtDone: 'Textdatei heruntergeladen.', pdfFail: 'Das PDF konnte nicht erstellt werden. Nutzen Sie die Textdatei.', making: 'PDF wird erstellt…',
      file: 'gehaltsauskunft-anfrage', needComparison: 'Nennen Sie die Vergleichstätigkeit: die gleiche oder gleichwertige Tätigkeit, mit der Sie sich vergleichen möchten.',
    },
    nl: {
      badge: { statutory: 'Van kracht', upcoming: 'Vanaf', voluntary: 'Nog niet van kracht', unknown: 'Niet bevestigd' },
      name: '[Uw naam]', employer: '[Werkgever]', comparison: '[vergelijkingsfunctie]',
      statutory: (c, reg, from, per) => `<strong>${c}: ${reg}</strong><span>Van kracht sinds ${from}. Het antwoord moet binnen ${per} komen. De brief beroept zich op deze regel.</span>`,
      upcoming: (c, reg, from) => `<strong>${c}: ${reg}</strong><span>Geldt vanaf ${from}. Tot dan vraagt de brief de informatie vrijwillig en noemt hij de startdatum.</span>`,
      voluntary: (c, st) => `<strong>${c}: ${st === 'bill' ? 'wetsvoorstel bij het parlement' : st === 'partly' ? 'gedeeltelijk omgezet' : 'nog niet omgezet'}</strong><span>Het recht op deze informatie geldt nog niet. De brief vraagt daarom om vrijwillige informatie en verwijst naar de richtlijn, zonder een recht te claimen dat er nog niet is.</span>`,
      unknown: c => `<strong>${c}: niet bevestigd</strong><span>We konden de nationale stand in geen officiële bron bevestigen. De brief verwijst naar de richtlijn en claimt geen nationale regel.</span>`,
      checked: 'Laatst gecontroleerd op 8 oktober 2026.', table: 'Alle 27 landen (Engels)', copied: 'Brief gekopieerd.', copyFail: 'Kopiëren lukte niet in deze browser. Selecteer de brief en kopieer hem.',
      pdfDone: 'PDF gedownload.', txtDone: 'Tekstbestand gedownload.', pdfFail: 'De pdf kon niet worden gemaakt. Gebruik het tekstbestand.', making: 'Pdf wordt gemaakt…',
      file: 'informatieverzoek-beloning', needComparison: 'Noem de vergelijkingsfunctie: het gelijke of gelijkwaardige werk waarmee je wilt vergelijken.',
    },
  }[lang] || null;
  if (!T || !R || !LT) return;

  const today = (() => { const d = new Date(); return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`; })();
  const radio = name => { const el = document.querySelector(`input[name="${name}"]:checked`); return el ? el.value : ''; };
  const val = id => ($(id) ? $(id).value : '');
  const on = id => !!($(id) && $(id).checked);

  function input() {
    const country = val('pt-country');
    const opts = {};
    if (country === 'DE') { opts.de200 = radio('de200') || 'unsure'; opts.deCouncil = radio('deCouncil') || 'no'; opts.deTariff = radio('deTariff') || 'unsure'; opts.deExecutive = on('pt-exec'); }
    if (country === 'BE') opts.beSector = radio('beSector') || 'other';
    return {
      lang, country, opts,
      date: R.parseISO(val('pt-date')) ? val('pt-date') : today,
      name: val('pt-name').trim() || T.name,
      employer: val('pt-employer').trim() || T.employer,
      recipient: val('pt-recipient'), salutation: val('pt-salutation'),
      role: val('pt-role'), department: val('pt-dept'),
      ask: { own: on('pt-own'), averages: on('pt-avg'), criteria: on('pt-crit'), variable: on('pt-var') },
      comparison: val('pt-comparison').trim() || T.comparison, components: val('pt-components'),
    };
  }

  function letterHTML(L) {
    const mark = s => esc(s).replace(/\[[^\]]+\]/g, m => `<mark>${m}</mark>`);
    let h = '';
    if (L.sender && L.sender.length) h += `<div class="pt-l-sender">${L.sender.map(mark).join('<br>')}</div>`;
    if (L.recipient && L.recipient.length) h += `<div class="pt-l-recipient">${L.recipient.map(mark).join('<br>')}</div>`;
    if (L.dateLine) h += `<div class="pt-l-date">${esc(L.dateLine)}</div>`;
    if (L.subject) h += `<p class="pt-l-subject">${mark(L.subject)}</p>`;
    if (L.salutation) h += `<p>${mark(L.salutation)}</p>`;
    for (const b of L.blocks) {
      if (b.h) h += `<p class="pt-l-h">${mark(b.h)}</p>`;
      else if (b.p) h += `<p>${mark(b.p)}</p>`;
      else if (b.list) h += `<ol>${LT.listItems(L, b).map(it => { const m = /^(\S+)\s([\s\S]*)$/.exec(it); return `<li><span>${esc(m[1])}</span><span>${mark(m[2])}</span></li>`; }).join('')}</ol>`;
    }
    h += `<div class="pt-l-sign"><p class="pt-l-close">${esc(L.closing)}</p>${(L.signature || []).map(s => `<p>${mark(s)}</p>`).join('')}</div>`;
    return h;
  }

  let current = null;
  function render() {
    const inp = input();
    const L = LT.workerLetter(inp);
    current = L;
    const rule = L.rule, c = R.BY_CODE[inp.country], cname = c.names[lang];
    const isDe = inp.country === 'DE', isBe = inp.country === 'BE';
    $('pt-de').hidden = !isDe;
    $('pt-be').hidden = !isBe;
    const entg = rule.regime && rule.regime.kind === 'entg';
    $('pt-de-more').hidden = !(isDe && inp.opts.de200 === 'yes');
    $('pt-ask').hidden = entg;
    $('pt-comparison-warn').hidden = !(entg && !val('pt-comparison').trim());
    // Status of the chosen country
    let badge, body;
    if (rule.mode === 'statutory') {
      badge = `<span class="pt-badge" data-s="statutory">${esc(T.badge.statutory)}</span>`;
      body = T.statutory(esc(cname), esc(rule.regime.short[lang]), esc(LT.longDate(lang, rule.regime.from)), esc(LT.period(lang, rule.regime.deadline)));
    } else if (rule.mode === 'upcoming') {
      badge = `<span class="pt-badge" data-s="upcoming">${esc(T.badge.upcoming)} ${esc(LT.longDate(lang, rule.upcoming.from))}</span>`;
      body = T.upcoming(esc(cname), esc(rule.upcoming.short[lang]), esc(LT.longDate(lang, rule.upcoming.from)));
    } else if (rule.status === 'unknown') {
      badge = `<span class="pt-badge" data-s="unknown">${esc(T.badge.unknown)}</span>`;
      body = T.unknown(esc(cname));
    } else {
      badge = `<span class="pt-badge" data-s="voluntary">${esc(T.badge.voluntary)}</span>`;
      body = T.voluntary(esc(cname), rule.status);
    }
    $('pt-status').innerHTML = badge + body;
    $('pt-paper').innerHTML = letterHTML(L);
    $('pt-paper').setAttribute('lang', lang);
    const next = LT.nextSteps(inp);
    $('pt-steps').innerHTML = next.steps.map(s => `<li><span>${esc(s)}</span></li>`).join('');
    const srcs = R.sourceList(inp.country).concat(R.SRC.directive && !R.sourceList(inp.country).includes(R.SRC.directive) ? [R.SRC.directive] : []);
    $('pt-sources').innerHTML = srcs.map(s => `<li><a href="${esc(s.url)}" rel="noopener">${esc(s.label)}</a></li>`).join('') + `<li class="muted">${esc(T.checked)} <a href="/pay-transparency/#countries">${esc(T.table)}</a></li>`;
  }

  function text() { return current ? LT.toText(current).replace(/\n/g, '\r\n') : ''; }
  function fileBase() { return `${T.file}-${current ? current.date : today}`; }
  function say(msg) { $('pt-live').textContent = msg; if (window.PeakUI) PeakUI.toast(msg); }

  async function copy() {
    const t = text();
    try { await navigator.clipboard.writeText(t); say(T.copied); return; } catch (e) { /* fall back */ }
    const ta = document.createElement('textarea');
    ta.value = t; ta.setAttribute('readonly', ''); ta.style.position = 'fixed'; ta.style.opacity = '0';
    document.body.appendChild(ta); ta.select();
    let ok = false; try { ok = document.execCommand('copy'); } catch (e) { ok = false; }
    ta.remove();
    say(ok ? T.copied : T.copyFail);
  }
  function loadScript(src) {
    return new Promise((resolve, reject) => { const s = document.createElement('script'); s.src = src; s.onload = resolve; s.onerror = () => reject(new Error('Could not load ' + src)); document.head.appendChild(s); });
  }
  let libs = null;
  function pdfLibs() {
    if (!libs) libs = (async () => {
      if (!window.PayGapReport) await loadScript('/pay-gap-report/report.js');
      if (!window.PDFLib) await loadScript('/pay-gap-report/vendor/pdf-lib.min.js');
      if (!window.PEPdf) await loadScript('/assets/pe-pdf.js');
      if (!window.PayTransPDF) await loadScript('/pay-transparency/letterpdf.js');
      return window.PDFLib;
    })().catch(e => { libs = null; throw e; });
    return libs;
  }
  async function pdf() {
    const btn = $('pt-pdf'), label = btn.textContent;
    try {
      btn.disabled = true; btn.textContent = T.making;
      const PDFLib = await pdfLibs();
      render();
      const bytes = await window.PayTransPDF.letterPDF(PDFLib, current, { title: current.subject, author: current.sender[0] });
      PeakUI.download(new Blob([bytes], { type: 'application/pdf' }), fileBase() + '.pdf');
      say(T.pdfDone);
    } catch (e) {
      console.error(e);
      say(T.pdfFail);
    } finally { btn.disabled = false; btn.textContent = label; }
  }
  function txt() {
    render();
    PeakUI.download(new Blob(['﻿' + text()], { type: 'text/plain;charset=utf-8' }), fileBase() + '.txt');
    say(T.txtDone);
  }

  // Country from the address (?country=MT), then from the browser's region, then the page's own country.
  function startCountry() {
    try { const q = new URLSearchParams(location.search).get('country'); if (q && R.BY_CODE[q.toUpperCase()]) return q.toUpperCase(); } catch (e) { /* no query */ }
    const region = ((navigator.languages && navigator.languages[0]) || navigator.language || '').split('-')[1];
    const fallback = { en: 'IE', de: 'DE', nl: 'NL' }[lang];
    if (region && R.BY_CODE[region.toUpperCase()]) {
      const r = region.toUpperCase();
      // Only take the region when it fits the page's language, so a German page in Ireland still opens on Germany.
      const fits = { en: ['IE', 'MT'], de: ['DE', 'AT', 'LU', 'BE'], nl: ['NL', 'BE'] }[lang];
      if (fits.includes(r)) return r;
    }
    return fallback;
  }

  $('pt-date').value = today;
  $('pt-country').value = startCountry();
  $('pt-form').addEventListener('input', render);
  $('pt-form').addEventListener('change', render);
  $('pt-form').addEventListener('submit', e => e.preventDefault());
  $('pt-copy').addEventListener('click', copy);
  $('pt-pdf').addEventListener('click', pdf);
  $('pt-txt').addEventListener('click', txt);
  render();
})();
