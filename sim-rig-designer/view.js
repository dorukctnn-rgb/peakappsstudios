/* Sim Rig Designer: the HTML for the title block, the angle readout, the checks table and the shopping list, from an
 * engine result. The page (tool.js) and the build (_build/pages.mjs, which writes the sample into index.html so the
 * first paint needs no script) both use these functions, so the two always print the same rows.
 * Works in the browser (window.SimRigView) and in Node. */
(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory();
  else root.SimRigView = factory();
})(typeof self !== 'undefined' ? self : this, function () {
  'use strict';
  const esc = s => String(s == null ? '' : s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  // the status marks are the marshals' flags: green, yellow, red, and a plain flag for a note
  const flag = cls => `<svg viewBox="0 0 16 16" aria-hidden="true"><path d="M3 1.5v13" stroke="currentColor" stroke-width="1.6" stroke-linecap="round"/><path class="${cls}" d="M4 2.2h9.2l-1.9 3.1 1.9 3.1H4z" fill="currentColor"/></svg>`;
  const ICON = { fits: flag('f'), check: flag('f'), fail: flag('f'), info: '<svg viewBox="0 0 16 16" aria-hidden="true"><path d="M3 1.5v13" stroke="currentColor" stroke-width="1.6" stroke-linecap="round"/><path d="M4 2.2h9.2l-1.9 3.1 1.9 3.1H4z" fill="none" stroke="currentColor" stroke-width="1.4"/></svg>' };
  const WORD = { fits: 'Fits', check: 'Check', fail: 'Fail', info: 'Note' };
  const TOPIC = { seat: 'The seat', legs: 'Legs and pedals', wheel: 'Arms and wheel', screen: 'The screen', frame: 'The frame and your room' };
  const srcLinks = s => s.map(x => `<a href="${esc(x.url)}" rel="noopener" target="_blank" title="${esc(x.title)}, read ${esc(x.checked)}">${esc(x.short)}</a>`).join(', ');
  const money = x => (x == null ? '' : x.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 }));

  function title(model, E) { return model.sample ? 'Sample GT rig' : (model.name || `Your ${E.BUILD_SHORT[model.build]}`); }
  function summary(r, E) {
    const m = r.m, u = m.units, d = r.design;
    const what = m.build === 'alu' ? '40-series aluminium rig' : m.build === 'stand' ? 'plywood wheel stand' : `${d.lumber.label} wood rig`;
    const seat = { bucket: 'bucket seat', car: 'car seat on sliders', office: 'office chair' }[m.seat.type];
    const scr = m.screen.kind === 'triple' ? `three ${m.screen.size} in screens` : m.screen.kind === 'tv' ? `a ${m.screen.size} in TV` : `a ${m.screen.size} in screen`;
    return `${E.STYLE_NAME[m.style]} ${what} for a driver ${E.height(m.driver.h, u)} tall, ${seat}, ${m.gear.base === 'dd' ? 'direct drive base' : 'belt or gear base'}, ${scr}`;
  }
  function counts(c) {
    return ['fits', 'check', 'fail'].map(k => `<span class="sr-count ct-${k}">${ICON[k]}<b>${c[k]}</b><span>${k === 'fits' ? 'fit' : k === 'check' ? 'to check' : c[k] === 1 ? 'fails' : 'fail'}</span></span>`).join('');
  }
  // the readout: the five numbers a driver sets a rig by, each with the colour of its check
  function readout(r) {
    const p = r.posture, st = id => { const x = r.checks.find(c => c.id === id); return x ? x.status : 'info'; };
    const cells = [
      ['Knee', p.rest.reach === 'far' ? 'out of reach' : `${Math.round(p.rest.knee)}°`, st('knee')],
      ['Hip', `${Math.round(p.hip)}°`, st('hip')],
      ['Elbow', p.armReach === 'far' ? 'out of reach' : `${Math.round(p.elbow)}°`, st('elbow')],
      ['Seat back', `${Math.round(p.back)}°`, st('torso')],
      ['Field of view', `${Math.round(r.fov.h)}°`, 'info'],
    ];
    return cells.map(([k, v, s]) => `<div class="sr-read sr-read-${s}"><b>${esc(v)}</b><span>${esc(k)}</span></div>`).join('');
  }
  function checkRows(r) {
    const rows = []; let last = '';
    for (const c of r.checks) {
      if (c.topic !== last) { rows.push(`<tr class="sr-group"><td colspan="5">${esc(TOPIC[c.topic] || c.topic)}</td></tr>`); last = c.topic; }
      rows.push(`<tr data-id="${esc(c.id)}" class="is-${c.status}"><td class="sr-st st-${c.status}"><span>${ICON[c.status]}${WORD[c.status]}</span></td><td><b>${esc(c.title)}</b></td><td data-h="Yours">${esc(c.yours)}</td><td data-h="Guide">${esc(c.limit)}</td><td data-h="Why" class="sr-why">${esc(c.reason)}${c.sources.length ? `<span class="sr-src"> ${srcLinks(c.sources)}</span>` : ''}</td></tr>`);
    }
    return rows.join('');
  }
  function shopRows(r, E) {
    const rows = []; let last = '';
    for (const it of r.shop.items) {
      if (it.group !== last) { rows.push(`<tr class="sr-group"><td colspan="4">${esc(it.group)}</td></tr>`); last = it.group; }
      const q = Number.isInteger(it.qty) ? it.qty : it.qty.toFixed(2);
      rows.push(`<tr data-item="${esc(it.id)}"><td><b>${esc(it.label)}</b>${it.note ? `<span class="sr-src" style="display:block">${esc(it.note)}</span>` : ''}</td><td data-h="Quantity" class="num">${q} ${esc(E.unit(it.qty, it.unit))}</td><td data-h="Your unit price" class="num"><input type="number" inputmode="decimal" min="0" step="0.01" data-price="${esc(it.id)}" aria-label="Unit price for ${esc(it.label)}" value="${it.price != null ? it.price : ''}"></td><td data-h="Cost" class="num" data-cost="${esc(it.id)}">${it.cost != null ? money(it.cost) : ''}</td></tr>`);
    }
    rows.push(`<tr class="sr-total"><td colspan="3">Total of the prices you entered</td><td class="num" id="shop-total">${r.shop.priced ? money(r.shop.total) : ''}</td></tr>`);
    return rows.join('');
  }
  const shopSig = (r, units) => r.shop.items.map(i => `${i.id}:${i.qty}`).join('|') + units;
  function shopCaption(r, model, E) {
    if (model.build === 'alu') return `Quantities for this design: ${r.bom.sections.map(s => `${(s.total / 1000).toFixed(2)} m of ${s.profile.label}`).join(' and ')}, cut to length, with ${r.bom.brackets} corner brackets and a T-nut and bolt for every fixing.`;
    return `Quantities for this design: ${r.cut.boards.length} ${r.cut.boards.length === 1 ? 'board' : 'boards'} of ${r.design.lumber.label} from ${E.stockLabel(model.stock, model.units)} lengths, ${r.sheets.count} ${r.sheets.count === 1 ? 'sheet' : 'sheets'} for the decks and plates, and a tenth spare on screws.`;
  }
  return { esc, ICON, WORD, TOPIC, money, title, summary, counts, readout, checkRows, shopRows, shopSig, shopCaption };
});
