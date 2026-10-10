/* Menopause adjustments at work: page logic. Data and the letter: adjust.js (window.MenoAdjust).
 * Nothing is stored (no localStorage) and nothing is sent: the choices are about health, so they live in the tab only.
 * pdf-lib and the Pay Gap Report's WinAnsi text filter load only when the PDF is asked for. */
(function () {
  'use strict';
  const M = window.MenoAdjust;
  const $ = id => document.getElementById(id);
  const esc = s => String(s == null ? '' : s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const S = { symptoms: new Set(), situations: new Set(), ideas: new Set(), all: false, touched: false };
  const say = msg => { $('status').textContent = msg; if (msg) PeakUI.toast(msg); };

  function checks(el, items, set, name) {
    el.innerHTML = items.map(x => `<label class="ma-chip"><input type="checkbox" name="${name}" value="${x.id}"${set.has(x.id) ? ' checked' : ''}> <span>${esc(x.name)}</span></label>`).join('');
  }
  function renderIdeas() {
    const list = S.all ? M.IDEAS.map(x => ({ idea: x, because: [] })) : M.suggest([...S.symptoms], [...S.situations]);
    // Until the reader ticks an idea themselves, the best matches start ticked
    if (!S.touched) { S.ideas = new Set(list.filter(x => x.because.length).slice(0, 5).map(x => x.idea.id)); }
    $('ideas').innerHTML = list.map(({ idea, because }) => `<li class="ma-idea" data-idea="${idea.id}"><label class="ma-idea-pick"><input type="checkbox" value="${idea.id}"${S.ideas.has(idea.id) ? ' checked' : ''}> <strong>${esc(idea.title)}</strong></label>` +
      `<p class="ma-quote">“${esc(idea.quote.charAt(0).toUpperCase() + idea.quote.slice(1))}”</p>` +
      (idea.note ? `<p class="ma-note">${esc(idea.note)}</p>` : '') +
      `<p class="ma-src">${idea.sources.map(s => `<a href="${esc(s.url)}" rel="noopener">${esc(s.label.replace(/ \(updated [^)]*\)$/, ''))}</a>`).join('; ')}${because.length ? `<span class="ma-why">For: ${esc(because.join(', ').toLowerCase())}</span>` : ''}</p></li>`).join('');
    const none = !S.symptoms.size && !S.situations.size;
    $('show-all').hidden = none;
    $('show-all').textContent = S.all ? 'Show only the changes for my choices' : 'Show every change in the guidance';
    $('show-all').setAttribute('aria-expanded', String(S.all));
  }
  function currentLetter() {
    return M.letter({
      name: $('l-name').value, role: $('l-role').value, manager: $('l-manager').value, date: new Date(),
      ideas: M.IDEAS.filter(x => S.ideas.has(x.id)).map(x => x.id), symptoms: [...S.symptoms], situations: [...S.situations],
      mentionSymptoms: $('l-symptoms').checked, mentionWork: $('l-work').checked, writing: $('l-writing').checked,
      confidential: $('l-confidential').checked, someoneElse: $('l-hr').checked ? 'HR' : '', reply: $('l-reply').value,
    });
  }
  function renderLetter() { $('letter').textContent = M.letterText(currentLetter()); }
  function render() { renderIdeas(); renderLetter(); }

  const scripts = {};
  const load = (src, ready) => ready() ? Promise.resolve() : (scripts[src] = scripts[src] || new Promise((res, rej) => {
    const el = document.createElement('script'); el.src = src;
    el.onload = () => (ready() ? res() : rej(new Error(src))); el.onerror = () => { delete scripts[src]; rej(new Error(src)); };
    document.head.appendChild(el);
  }));
  function copy(text) {
    const ok = () => say('Letter copied.');
    if (navigator.clipboard && window.isSecureContext) return navigator.clipboard.writeText(text).then(ok, fallback);
    fallback();
    function fallback() {
      const ta = document.createElement('textarea'); ta.value = text; ta.setAttribute('readonly', ''); ta.style.position = 'fixed'; ta.style.opacity = '0';
      document.body.appendChild(ta); ta.select();
      try { document.execCommand('copy'); ok(); } catch (e) { say('Copy did not work in this browser. Select the letter and copy it.'); }
      ta.remove();
    }
  }

  checks($('symptoms'), M.SYMPTOMS, S.symptoms, 'symptom');
  checks($('situations'), M.SITUATIONS, S.situations, 'situation');
  $('symptoms').addEventListener('change', e => { const v = e.target.value; e.target.checked ? S.symptoms.add(v) : S.symptoms.delete(v); render(); });
  $('situations').addEventListener('change', e => {
    const v = e.target.value; e.target.checked ? S.situations.add(v) : S.situations.delete(v);
    if (v === 'manager') $('l-hr').checked = e.target.checked;
    render();
  });
  $('ideas').addEventListener('change', e => { const v = e.target.value; if (!v) return; S.touched = true; e.target.checked ? S.ideas.add(v) : S.ideas.delete(v); renderLetter(); });
  $('show-all').addEventListener('click', () => { S.all = !S.all; renderIdeas(); });
  ['l-name', 'l-role', 'l-manager'].forEach(id => $(id).addEventListener('input', renderLetter));
  ['l-symptoms', 'l-work', 'l-writing', 'l-confidential', 'l-hr', 'l-reply'].forEach(id => $(id).addEventListener('change', renderLetter));
  $('copy').addEventListener('click', () => copy(M.letterText(currentLetter())));
  $('txt').addEventListener('click', () => { PeakUI.download(new Blob([M.letterText(currentLetter()).replace(/\n/g, '\r\n')], { type: 'text/plain;charset=utf-8' }), 'request-for-support-at-work.txt'); say('Letter downloaded.'); });
  $('pdf').addEventListener('click', async () => {
    const btn = $('pdf'), label = btn.textContent;
    try {
      btn.disabled = true; btn.textContent = 'Preparing the PDF…';
      await load('/pay-gap-report/report.js', () => window.PayGapReport);
      await load('/pay-gap-report/vendor/pdf-lib.min.js', () => window.PDFLib);
      const bytes = await M.letterPDF(window.PDFLib, window.PayGapReport.pdfText, currentLetter());
      PeakUI.download(new Blob([bytes], { type: 'application/pdf' }), 'request-for-support-at-work.pdf');
      say('PDF downloaded.');
    } catch (e) { console.error(e); say('The PDF could not be made. Copy the letter instead, or try again.'); }
    finally { btn.disabled = false; btn.textContent = label; }
  });
  render();
})();
