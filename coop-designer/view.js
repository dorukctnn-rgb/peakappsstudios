/* Coop Designer: the HTML for the title block, the checks table and the shopping list, from an engine result.
 * The page (tool.js) and the build (_build/pages.mjs, which writes the sample into index.html so the first paint needs
 * no script) both use these functions, so the two always print the same rows.
 * Works in the browser (window.CoopView) and in Node. */
(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory();
  else root.CoopView = factory();
})(typeof self !== 'undefined' ? self : this, function () {
  'use strict';
  const esc = s => String(s == null ? '' : s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const ICON = {
    fits: '<svg viewBox="0 0 16 16" aria-hidden="true"><ellipse cx="8" cy="8.6" rx="5.4" ry="6.4" fill="currentColor"/></svg>',
    check: '<svg viewBox="0 0 16 16" aria-hidden="true"><path d="M8 1.8 15 14H1z" fill="currentColor"/></svg>',
    fail: '<svg viewBox="0 0 16 16" aria-hidden="true"><rect x="2.5" y="2.5" width="11" height="11" fill="currentColor"/></svg>',
    info: '<svg viewBox="0 0 16 16" aria-hidden="true"><circle cx="8" cy="8" r="5.5" fill="none" stroke="currentColor" stroke-width="1.6"/></svg>',
  };
  const WORD = { fits: 'Fits', check: 'Check', fail: 'Fail', info: 'Note' };
  const TOPIC = { space: 'Space for the flock', nests: 'Nest boxes', roosts: 'Roosts', air: 'Air and climate', predators: 'Predators', roof: 'Roof', materials: 'Materials', rules: 'Before you build' };
  const srcLinks = s => s.map(x => `<a href="${esc(x.url)}" rel="noopener" target="_blank" title="${esc(x.title)}, read ${esc(x.checked)}">${esc(x.short)}</a>`).join(', ');
  const money = x => (x == null ? '' : x.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 }));

  function title(model, E) { return model.sample ? 'Sample hen house' : (model.name || `Your ${E.TYPE_SHORT[model.type]}`); }
  function summary(r, E) {
    const m = r.m, u = m.units, d = r.design, L = (x) => E.len(x, u, 'dim');
    const birds = `${m.birds} ${m.size === 'bantam' ? (m.birds === 1 ? 'bantam' : 'bantams') : (m.birds === 1 ? 'hen' : 'hens')}`;
    let dims;
    if (m.type === 'house') dims = `${L(m.coop.w)} by ${L(m.coop.d)} hen house on ${L(m.coop.legs)} legs over a ${L(d.run.L)} run`;
    else if (m.type === 'walkin') dims = `${L(m.coop.w)} by ${L(m.coop.d)} walk-in coop with a ${L(d.run.L)} run`;
    else if (m.type === 'aframe') dims = `${L(d.run.L)} by ${L(m.af.w)} A-frame, ${L(m.af.h)} tall, the house over ${L(m.af.hl)}`;
    else dims = `${L(m.tr.l)} by ${L(m.tr.w)} tractor, the house over ${L(m.tr.hl)}`;
    return `${dims}, ${d.lumber.label} frame, ${birds}`;
  }
  function counts(c) {
    return ['fits', 'check', 'fail'].map(k => `<span class="co-count ct-${k}"><b>${c[k]}</b><span>${k === 'fits' ? 'fit' : k === 'check' ? 'to check' : c[k] === 1 ? 'fails' : 'fail'}</span></span>`).join('');
  }
  function checkRows(r) {
    const rows = []; let last = '';
    for (const c of r.checks) {
      if (c.topic !== last) { rows.push(`<tr class="co-group"><td colspan="5">${esc(TOPIC[c.topic] || c.topic)}</td></tr>`); last = c.topic; }
      rows.push(`<tr data-id="${esc(c.id)}" class="is-${c.status}"><td class="co-st st-${c.status}"><span>${ICON[c.status]}${WORD[c.status]}</span></td><td><b>${esc(c.title)}</b></td><td data-h="Yours">${esc(c.yours)}</td><td data-h="Guide">${esc(c.limit)}</td><td data-h="Why" class="co-why">${esc(c.reason)}${c.sources.length ? `<span class="co-src"> ${srcLinks(c.sources)}</span>` : ''}</td></tr>`);
    }
    return rows.join('');
  }
  function shopRows(r, E) {
    const rows = []; let last = '';
    for (const it of r.shop.items) {
      if (it.group !== last) { rows.push(`<tr class="co-group"><td colspan="4">${esc(it.group)}</td></tr>`); last = it.group; }
      rows.push(`<tr data-item="${esc(it.id)}"><td><b>${esc(it.label)}</b>${it.note ? `<span class="co-src" style="display:block">${esc(it.note)}</span>` : ''}</td><td data-h="Quantity" class="num">${it.qty} ${esc(E.unit(it.qty, it.unit))}</td><td data-h="Your unit price" class="num"><input type="number" inputmode="decimal" min="0" step="0.01" data-price="${esc(it.id)}" aria-label="Unit price for ${esc(it.label)}" value="${it.price != null ? it.price : ''}"></td><td data-h="Cost" class="num" data-cost="${esc(it.id)}">${it.cost != null ? money(it.cost) : ''}</td></tr>`);
    }
    rows.push(`<tr class="co-total"><td colspan="3">Total of the prices you entered</td><td class="num" id="shop-total">${r.shop.priced ? money(r.shop.total) : ''}</td></tr>`);
    return rows.join('');
  }
  const shopSig = (r, units) => r.shop.items.map(i => `${i.id}:${i.qty}`).join('|') + units;
  function shopCaption(r, model, E) {
    const secs = r.cut.sections.map(s => `${s.boards.length} ${s.boards.length === 1 ? 'board' : 'boards'} of ${s.lumber.label}`).join(' and ');
    return `Quantities for this design: ${secs} from ${E.stockLabel(model.stock, model.units)} lengths, the hardware cloth with its apron, and a tenth spare on screws.`;
  }
  return { esc, ICON, WORD, TOPIC, money, title, summary, counts, checkRows, shopRows, shopSig, shopCaption };
});
