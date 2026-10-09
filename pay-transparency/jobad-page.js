/* Pay Transparency Kit: the job ad checker page. The ad is checked on this page as you type; nothing is sent. */
(function () {
  'use strict';
  const J = window.PayTransJobAd;
  if (!J) return;
  const $ = id => document.getElementById(id);
  const esc = s => String(s == null ? '' : s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const LANG = { en: 'English', de: 'German', nl: 'Dutch' };
  const EXAMPLES = {
    en: 'Sales Manager, Dublin\n\nWe are looking for an experienced salesman to lead our regional team. He will report to the Commercial Director.\n\nWhat we offer: a competitive salary, a company car and 25 days of holiday.\n\nTo apply, send your CV and your current salary to jobs@example.com.',
    de: 'Kaufmann für Büromanagement gesucht\n\nWir bieten ein attraktives Gehalt, flexible Arbeitszeiten und ein Jobticket.\n\nBitte nennen Sie in Ihrer Bewerbung Ihr aktuelles Gehalt und Ihren frühesten Eintrittstermin.',
    nl: 'Medewerker klantenservice (32 tot 36 uur per week)\n\nWat je verdient: € 2.800 tot € 3.400 bruto per maand, schaal 6 van de cao Klantcontact.\n\nSolliciteren kan tot 30 november via werkenbij@example.nl.',
  };
  const quote = items => [...new Set(items.map(i => i.text || i.term))].slice(0, 6).map(t => `<q>${esc(t)}</q>`).join(', ');
  const TEXT = {
    pay: f => ({ t: 'A pay figure is in the ad', d: `Found ${quote(f.items)}. Article 5(1)(a): applicants get the starting pay or its range. Say whether it is gross, and per year, month or hour.` }),
    'pay-scale': f => ({ t: 'Pay only as a scale or collective agreement', d: `Found ${quote(f.items)} but no amount. Applicants are entitled to the starting pay or its range (Article 5(1)(a)); a scale name alone may not tell them the amounts, so add them or link the scale.` }),
    'pay-missing': f => ({ t: 'No starting pay or pay range found', d: `${f.items.length ? `The ad says ${quote(f.items)}, which is not a figure. ` : ''}Article 5(1)(a): applicants get the starting pay or its range, for example in the published ad, before the interview or otherwise. Some countries require it in the ad itself.` }),
    'vague-with-figure': f => ({ t: 'Vague pay wording next to the figure', d: `Also found ${quote(f.items)}. With a figure in the ad this is fine; the figure is what counts.` }),
    agreement: f => ({ t: 'Collective agreement or scale named', d: `Found ${quote(f.items)}. Article 5(1)(b) asks for the relevant provisions of the collective agreement that applies to the job, where there is one.` }),
    history: f => ({ t: 'A question about pay history', d: `Found ${quote(f.items)}. Article 5(2): employers may not ask applicants about their pay in their current or previous jobs. Asking what pay they expect is a different question.` }),
    'history-none': () => ({ t: 'No question about current or past pay', d: 'Nothing from the pay history list below. Article 5(2) bans asking about pay in current or previous jobs.' }),
    gendered: f => ({ t: 'Gendered titles or wording', d: `Found ${quote(f.items)}. Article 5(3): job ads and job titles are to be gender-neutral. A neutral title, or wording such as “they will” or “you will”, avoids it.` }),
    'de-marker': () => ({ t: 'German ad without a gender mark', d: 'No (m/w/d), (w/m/d) or inclusive form such as Entwickler:in or Entwickler*in. German ads usually mark the title that way to keep it gender-neutral.' }),
    'gendered-none': () => ({ t: 'No gendered titles or wording found', d: 'Nothing from the gendered word list below. The list cannot judge every phrase, so read the ad once yourself.' }),
  };
  function render() {
    const text = $('ad').value;
    const r = J.check(text);
    if (r.empty) {
      $('results').innerHTML = '<li data-state="info"><span class="ck-body"><strong>Paste a job ad to check it</strong><span class="ck-text">Or try one of the examples. The ad is checked on this page and never sent anywhere.</span></span></li>';
      $('lang-note').textContent = '';
      return;
    }
    $('lang-note').textContent = `Read as ${LANG[r.lang]}, with the English lists too.`;
    $('results').innerHTML = r.findings.map(f => { const x = TEXT[f.id](f); return `<li data-state="${f.state}" data-finding="${f.id}"><span class="ck-body"><strong>${esc(x.t)}</strong><span class="ck-text">${x.d}</span><span class="pt-badge" data-s="${f.state === 'ok' ? 'yes' : f.state === 'fail' ? 'no' : 'partly'}">Article ${esc(f.article)}</span></span></li>`; }).join('');
  }
  let t = null;
  $('ad').addEventListener('input', () => { clearTimeout(t); t = setTimeout(render, 120); });
  document.querySelectorAll('[data-example]').forEach(b => b.addEventListener('click', () => { $('ad').value = EXAMPLES[b.dataset.example]; render(); $('ad').focus(); }));
  $('clear').addEventListener('click', () => { $('ad').value = ''; render(); $('ad').focus(); });
  // The published word lists
  const list = (title, words) => `<h3>${esc(title)}</h3><ul class="pt-words">${words.map(w => `<li>${esc(w)}</li>`).join('')}</ul>`;
  const L = J.LISTS;
  $('lists').innerHTML =
    list('Vague pay wording, English', L.vague.en) + list('Vague pay wording, German', L.vague.de) + list('Vague pay wording, Dutch', L.vague.nl) +
    list('Pay history questions, English', L.history.en) + list('Pay history questions, German', L.history.de) + list('Pay history questions, Dutch', L.history.nl) +
    list('Gendered titles and wording, English', L.gendered.en) + list('Gendered titles, German (skipped when the ad has a gender mark)', L.gendered.de) + list('Gendered titles and wording, Dutch', L.gendered.nl) +
    list('German gender marks', L.deMarkers) + list('Collective agreement and scale terms', L.agreement.en.concat(L.agreement.de, L.agreement.nl));
  render();
})();
