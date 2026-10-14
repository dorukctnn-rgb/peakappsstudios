/* Coop Designer: the HTML for the title block, the checks table and the shopping list, from an engine result.
 * The page (tool.js) and the build (_build/pages.mjs, which writes the sample into index.html so the first paint needs
 * no script) both use these functions, so the two always print the same rows. Words come from i18n.js.
 * Works in the browser (window.CoopView) and in Node. */
(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory(require('./i18n.js'));
  else root.CoopView = factory(root.CoopI18n);
})(typeof self !== 'undefined' ? self : this, function (I) {
  'use strict';
  const T = (k, p) => I.t(k, p);
  const esc = s => String(s == null ? '' : s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const ICON = {
    fits: '<svg viewBox="0 0 16 16" aria-hidden="true"><ellipse cx="8" cy="8.6" rx="5.4" ry="6.4" fill="currentColor"/></svg>',
    check: '<svg viewBox="0 0 16 16" aria-hidden="true"><path d="M8 1.8 15 14H1z" fill="currentColor"/></svg>',
    fail: '<svg viewBox="0 0 16 16" aria-hidden="true"><rect x="2.5" y="2.5" width="11" height="11" fill="currentColor"/></svg>',
    info: '<svg viewBox="0 0 16 16" aria-hidden="true"><circle cx="8" cy="8" r="5.5" fill="none" stroke="currentColor" stroke-width="1.6"/></svg>',
  };
  // read from the dictionary each time, so the words follow the page's language
  function named(prefix, keys) { const o = {}; for (const k of keys) Object.defineProperty(o, k, { get: () => T(`${prefix}.${k}`), enumerable: true }); return o; }
  const WORD = named('v.word', ['fits', 'check', 'fail', 'info']);
  const TOPIC = named('v.topic', ['space', 'nests', 'roosts', 'air', 'predators', 'roof', 'materials', 'rules']);
  // a source's short name: the language's own wording where it has one (src.<id>), else the name in the table
  const short = x => (x.id && I.has(`src.${x.id}`) ? T(`src.${x.id}`) : x.short);
  const srcLinks = s => s.map(x => `<a href="${esc(x.url)}" rel="noopener" target="_blank" title="${esc(T('v.read', { title: x.title, date: x.checked }))}">${esc(short(x))}</a>`).join(', ');
  const money = x => (x == null ? '' : I.money(x));

  function title(model, E) { return model.sample ? T('sample.name') : (model.name || T('v.your', { type: E.TYPE_SHORT[model.type] })); }
  function summary(r, E) {
    const m = r.m, u = m.units, d = r.design, L = (x) => E.len(x, u, 'dim');
    const birds = T('v.birds', { n: m.birds, bantam: m.size === 'bantam' });
    let dims;
    if (m.type === 'house') dims = T('v.dims.house', { w: L(m.coop.w), d: L(m.coop.d), legs: L(m.coop.legs), run: L(d.run.L) });
    else if (m.type === 'walkin') dims = T('v.dims.walkin', { w: L(m.coop.w), d: L(m.coop.d), run: L(d.run.L) });
    else if (m.type === 'aframe') dims = T('v.dims.aframe', { l: L(d.run.L), w: L(m.af.w), h: L(m.af.h), hl: L(m.af.hl) });
    else dims = T('v.dims.tractor', { l: L(m.tr.l), w: L(m.tr.w), hl: L(m.tr.hl) });
    return T('v.summary', { dims, lumber: d.lumber.label, birds });
  }
  function counts(c) {
    return ['fits', 'check', 'fail'].map(k => `<span class="co-count ct-${k}"><b>${c[k]}</b><span>${esc(T(`v.count.${k}`, { n: c[k] }))}</span></span>`).join('');
  }
  function checkRows(r) {
    const rows = []; let last = '';
    const hY = esc(T('v.h.yours')), hG = esc(T('v.h.guide')), hW = esc(T('v.h.why'));
    for (const c of r.checks) {
      if (c.topic !== last) { rows.push(`<tr class="co-group"><td colspan="5">${esc(TOPIC[c.topic] || c.topic)}</td></tr>`); last = c.topic; }
      rows.push(`<tr data-id="${esc(c.id)}" class="is-${c.status}"><td class="co-st st-${c.status}"><span>${ICON[c.status]}${WORD[c.status]}</span></td><td><b>${esc(c.title)}</b></td><td data-h="${hY}">${esc(c.yours)}</td><td data-h="${hG}">${esc(c.limit)}</td><td data-h="${hW}" class="co-why">${esc(c.reason)}${c.sources.length ? `<span class="co-src"> ${srcLinks(c.sources)}</span>` : ''}</td></tr>`);
    }
    return rows.join('');
  }
  function shopRows(r, E) {
    const rows = []; let last = '';
    const hQ = esc(T('v.h.qty')), hP = esc(T('v.h.price')), hC = esc(T('v.h.cost'));
    for (const it of r.shop.items) {
      if (it.group !== last) { rows.push(`<tr class="co-group"><td colspan="4">${esc(it.group)}</td></tr>`); last = it.group; }
      rows.push(`<tr data-item="${esc(it.id)}"><td><b>${esc(it.label)}</b>${it.note ? `<span class="co-src" style="display:block">${esc(it.note)}</span>` : ''}</td><td data-h="${hQ}" class="num">${it.qty} ${esc(E.unit(it.qty, it.unit))}</td><td data-h="${hP}" class="num"><input type="number" inputmode="decimal" min="0" step="0.01" data-price="${esc(it.id)}" aria-label="${esc(T('v.priceFor', { label: it.label }))}" value="${it.price != null ? it.price : ''}"></td><td data-h="${hC}" class="num" data-cost="${esc(it.id)}">${it.cost != null ? money(it.cost) : ''}</td></tr>`);
    }
    rows.push(`<tr class="co-total"><td colspan="3">${esc(T('v.total'))}</td><td class="num" id="shop-total">${r.shop.priced ? money(r.shop.total) : ''}</td></tr>`);
    return rows.join('');
  }
  const shopSig = (r, units) => r.shop.items.map(i => `${i.id}:${i.qty}`).join('|') + units + I.getLang();
  function shopCaption(r, model, E) {
    const secs = r.cut.sections.map(s => T('v.cap.sec', { n: s.boards.length, lumber: s.lumber.label, stock: [...new Set(s.boards.map(b => b.stock))].sort((a, b) => a - b).map(x => E.stockLabel(x, model.units)).join(T('v.and')) })).join(T('v.and'));
    return T('v.cap', { secs, stock: E.stockLabel(model.stock, model.units) });
  }
  return { esc, ICON, WORD, TOPIC, money, short, title, summary, counts, checkRows, shopRows, shopSig, shopCaption };
});
