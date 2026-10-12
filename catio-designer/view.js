/* Catio Designer: the HTML for the title block, the checks table and the shopping list, from an engine result.
 * The page (tool.js) and the build (_build/pages.mjs, which writes the sample into index.html so the first paint needs
 * no script) both use these functions, so the two always print the same rows.
 * Works in the browser (window.CatioView) and in Node. */
(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory();
  else root.CatioView = factory();
})(typeof self !== 'undefined' ? self : this, function () {
  'use strict';
  const esc = s => String(s == null ? '' : s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const ICON = {
    fits: '<svg viewBox="0 0 16 16" aria-hidden="true"><circle cx="8" cy="8" r="6" fill="currentColor"/></svg>',
    check: '<svg viewBox="0 0 16 16" aria-hidden="true"><path d="M8 1.8 15 14H1z" fill="currentColor"/></svg>',
    fail: '<svg viewBox="0 0 16 16" aria-hidden="true"><rect x="2.5" y="2.5" width="11" height="11" fill="currentColor"/></svg>',
    info: '<svg viewBox="0 0 16 16" aria-hidden="true"><circle cx="8" cy="8" r="5.5" fill="none" stroke="currentColor" stroke-width="1.6"/></svg>',
  };
  const WORD = { fits: 'Fits', check: 'Check', fail: 'Fail', info: 'Note' };
  const TOPIC = { mesh: 'Mesh', gap: 'Gaps', roof: 'Roof', shelves: 'Shelves and steps', space: 'Space for the cats', sun: 'Sun and shade', floor: 'Floor', materials: 'Materials', rules: 'Before you build' };
  const srcLinks = s => s.map(x => `<a href="${esc(x.url)}" rel="noopener" target="_blank" title="${esc(x.title)}, read ${esc(x.checked)}">${esc(x.short)}</a>`).join(', ');
  const money = x => (x == null ? '' : x.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 }));

  function title(model, E) { return model.sample ? 'Sample window box' : (model.name || `Your ${E.TYPE_NAME[model.type].toLowerCase()}`); }
  function summary(r, E) {
    const m = r.m, u = m.units, d = r.design;
    const dims = m.type === 'balcony' && d.ceiling ? `${E.len(d.W, u, 'dim')} wide, ${E.len(d.D, u, 'dim')} deep, ${E.len(d.Hb, u, 'dim')} to the ceiling` : `${E.len(d.W, u, 'dim')} wide, ${E.len(d.D, u, 'dim')} deep, ${E.len(d.Hb, u, 'dim')} high at the ${m.type === 'free' ? 'back' : 'wall'}`;
    return `${dims}, ${d.lumber.label} frame, ${m.cats} ${m.cats === 1 ? 'cat' : 'cats'}`;
  }
  function counts(c) {
    return ['fits', 'check', 'fail'].map(k => `<span class="cd-count ct-${k}"><b>${c[k]}</b><span>${k === 'fits' ? 'fit' : k === 'check' ? 'to check' : c[k] === 1 ? 'fails' : 'fail'}</span></span>`).join('');
  }
  function checkRows(r) {
    const rows = []; let last = '';
    for (const c of r.checks) {
      if (c.topic !== last) { rows.push(`<tr class="cd-group"><td colspan="5">${esc(TOPIC[c.topic] || c.topic)}</td></tr>`); last = c.topic; }
      rows.push(`<tr data-id="${esc(c.id)}" class="is-${c.status}"><td class="cd-st st-${c.status}"><span>${ICON[c.status]}${WORD[c.status]}</span></td><td><b>${esc(c.title)}</b></td><td data-h="Yours">${esc(c.yours)}</td><td data-h="Guide">${esc(c.limit)}</td><td data-h="Why" class="cd-why">${esc(c.reason)}${c.sources.length ? `<span class="cd-src"> ${srcLinks(c.sources)}</span>` : ''}</td></tr>`);
    }
    return rows.join('');
  }
  function shopRows(r, E) {
    const rows = []; let last = '';
    for (const it of r.shop.items) {
      if (it.group !== last) { rows.push(`<tr class="cd-group"><td colspan="4">${esc(it.group)}</td></tr>`); last = it.group; }
      rows.push(`<tr data-item="${esc(it.id)}"><td><b>${esc(it.label)}</b>${it.note ? `<span class="cd-src" style="display:block">${esc(it.note)}</span>` : ''}</td><td data-h="Quantity" class="num">${it.qty} ${esc(E.unit(it.qty, it.unit))}</td><td data-h="Your unit price" class="num"><input type="number" inputmode="decimal" min="0" step="0.01" data-price="${esc(it.id)}" aria-label="Unit price for ${esc(it.label)}" value="${it.price != null ? it.price : ''}"></td><td data-h="Cost" class="num" data-cost="${esc(it.id)}">${it.cost != null ? money(it.cost) : ''}</td></tr>`);
    }
    rows.push(`<tr class="cd-total"><td colspan="3">Total of the prices you entered</td><td class="num" id="shop-total">${r.shop.priced ? money(r.shop.total) : ''}</td></tr>`);
    return rows.join('');
  }
  const shopSig = (r, units) => r.shop.items.map(i => `${i.id}:${i.qty}`).join('|') + units;
  function shopCaption(r, model, E) { return `Quantities for this design, ${r.cut.boards.length} boards cut from ${E.stockLabel(model.stock, model.units)} lengths, with a tenth spare on screws.`; }
  return { esc, ICON, WORD, TOPIC, money, title, summary, counts, checkRows, shopRows, shopSig, shopCaption };
});
