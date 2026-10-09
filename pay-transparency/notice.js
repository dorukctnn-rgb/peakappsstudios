/* Pay Transparency Kit: the yearly notice page (Article 7(3)). A free preview of the notice; the full notice in
 * English, German or Dutch, as PDF and text, is part of Pro. Nothing typed here is sent or stored. */
(function () {
  'use strict';
  // Same Gumroad product as the answer tool (pay-transparency-kit-pro). Fail closed while the id is 'PENDING'.
  const PAYTRANS_PRO_PRODUCT_ID = '26Kg2nlZ-D23_Uylq2MXOQ==';
  const PRO_READY = !!PAYTRANS_PRO_PRODUCT_ID && PAYTRANS_PRO_PRODUCT_ID !== 'PENDING';
  const LICENSE = {
    tool: 'pay-transparency',
    productId: PRO_READY ? PAYTRANS_PRO_PRODUCT_ID : 'PENDING',
    permalink: 'pay-transparency-kit-pro',
    buyUrl: 'https://dorukctn.gumroad.com/l/pay-transparency-kit-pro',
    pitch: 'Pro gives the full yearly notice in English, German and Dutch as PDF and text, the answer tool’s figures and letters, the request log and the criteria template. $99, once, per organisation.',
  };
  const R = window.PayTransRules, LT = window.PayTransLetters;
  if (!R || !LT) return;
  const $ = id => document.getElementById(id);
  const esc = s => String(s == null ? '' : s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const today = (() => { const d = new Date(); return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`; })();
  let pro = false;

  function data() {
    const country = $('n-country').value;
    const o = country === 'DE' ? { de200: 'no' } : country === 'BE' ? { beSector: $('n-be').value } : {};
    return { lang: $('n-lang').value, country, opts: o, date: today, employer: $('n-employer').value, contact: $('n-contact').value, representatives: $('n-reps').value, criteriaWhere: $('n-criteria').value, signatory: $('n-signatory').value };
  }
  function html(L, preview) {
    const mark = s => esc(s).replace(/\[[^\]]+\]/g, m => `<mark>${m}</mark>`);
    let h = '';
    if (L.sender && L.sender.length) h += `<div class="pt-l-sender">${L.sender.map(mark).join('<br>')}</div>`;
    if (L.recipient && L.recipient.length) h += `<div class="pt-l-recipient">${L.recipient.map(mark).join('<br>')}</div>`;
    if (L.dateLine) h += `<div class="pt-l-date">${esc(L.dateLine)}</div>`;
    if (L.subject) h += `<p class="pt-l-subject">${mark(L.subject)}</p>`;
    if (L.salutation) h += `<p>${mark(L.salutation)}</p>`;
    // The free preview shows the opening and what workers can ask for; the steps and the rest are Pro.
    const blocks = preview ? L.blocks.slice(0, 3) : L.blocks;
    let body = '';
    for (const b of blocks) {
      if (b.h) body += `<p class="pt-l-h">${mark(b.h)}</p>`;
      else if (b.p) body += `<p>${mark(b.p)}</p>`;
      else if (b.list) body += `<ol>${LT.listItems(L, b).map(it => { const m = /^(\S+)\s([\s\S]*)$/.exec(it); return `<li><span>${esc(m[1])}</span><span>${mark(m[2])}</span></li>`; }).join('')}</ol>`;
    }
    if (preview) return h + `<div class="pt-fade">${body}</div>`;
    return h + body + `<div class="pt-l-sign"><p class="pt-l-close">${esc(L.closing)}</p>${(L.signature || []).map(s => `<p>${mark(s)}</p>`).join('')}</div>`;
  }
  function render() {
    const d = data();
    $('n-be-f').hidden = d.country !== 'BE';
    const L = LT.annualNotice(d);
    $('n-paper').innerHTML = html(L, !pro);
    $('n-paper').setAttribute('lang', d.lang);
    $('n-lock').hidden = pro;
    const rule = R.ruleFor(d.country, d.opts, today);
    $('n-rule').textContent = rule.mode === 'statutory' && rule.regime.kind === 'art7'
      ? `The notice cites ${rule.regime.short.en}, the rule in force in ${R.BY_CODE[d.country].names.en}, and its ${LT.period('en', rule.regime.deadline)} for answers.`
      : R.BY_CODE[d.country].status === 'unknown'
        ? `We could not confirm a national rule for ${R.BY_CODE[d.country].names.en} on an official source, so the notice refers to Article 7 of the directive and its two months.`
        : `No national rule for the notice is in force in ${R.BY_CODE[d.country].names.en} yet, so it refers to Article 7 of the directive and its two months.`;
  }
  function loadScript(src) { return new Promise((resolve, reject) => { const s = document.createElement('script'); s.src = src; s.onload = resolve; s.onerror = () => reject(new Error('Could not load ' + src)); document.head.appendChild(s); }); }
  async function exportNotice(kind) {
    if (!(PRO_READY && PeakLicense.requirePro('The full yearly notice in three languages, as PDF and text, is part of Pro. The preview stays free.'))) return;
    const d = data();
    const L = LT.annualNotice(d);
    const base = `pay-information-yearly-notice-${d.lang}-${today}`;
    try {
      if (kind === 'pdf') {
        if (!window.PayGapReport) await loadScript('/pay-gap-report/report.js');
        if (!window.PDFLib) await loadScript('/pay-gap-report/vendor/pdf-lib.min.js');
        if (!window.PayTransPDF) await loadScript('/pay-transparency/letterpdf.js');
        const bytes = await window.PayTransPDF.letterPDF(window.PDFLib, L, { title: L.subject, author: d.employer });
        PeakUI.download(new Blob([bytes], { type: 'application/pdf' }), base + '.pdf');
      } else PeakUI.download(new Blob(['﻿' + LT.toText(L).replace(/\n/g, '\r\n')], { type: 'text/plain;charset=utf-8' }), base + '.txt');
      PeakUI.toast('Yearly notice downloaded.');
    } catch (e) { console.error(e); PeakUI.toast('The export failed. Try again, or use the text version.'); }
  }

  const cs = R.COUNTRIES.slice().sort((a, b) => a.names.en.localeCompare(b.names.en));
  $('n-country').innerHTML = cs.map(c => `<option value="${c.code}">${esc(c.names.en)}</option>`).join('');
  try {
    const q = (new URLSearchParams(location.search).get('country') || '').toUpperCase();
    const region = (((navigator.languages && navigator.languages[0]) || navigator.language || '').split('-')[1] || '').toUpperCase();
    $('n-country').value = R.BY_CODE[q] ? q : R.BY_CODE[region] ? region : 'IE';
  } catch (e) { $('n-country').value = 'IE'; }
  $('n-form').addEventListener('input', render);
  $('n-form').addEventListener('change', render);
  $('n-form').addEventListener('submit', e => e.preventDefault());
  $('n-pdf').addEventListener('click', () => exportNotice('pdf'));
  $('n-txt').addEventListener('click', () => exportNotice('txt'));
  PeakLicense.setup(LICENSE);
  pro = PRO_READY && PeakLicense.isPro();
  PeakLicense.onChange(p => { pro = PRO_READY && p; render(); });
  render();
})();
