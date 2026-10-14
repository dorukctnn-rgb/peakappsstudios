/* Sim Rig Designer: the HTML for the title block, the angle readout, the checks table and the shopping list, from an
 * engine result. The page (tool.js) and the build (_build/pages.mjs, which writes the sample into index.html so the
 * first paint needs no script) both use these functions, so the two always print the same rows. Words come from
 * i18n.js. Works in the browser (window.SimRigView) and in Node. */
(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory(require('./i18n.js'));
  else root.SimRigView = factory(root.SimRigI18n);
})(typeof self !== 'undefined' ? self : this, function (I) {
  'use strict';
  const T = (k, p) => I.t(k, p);
  const esc = s => String(s == null ? '' : s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  // the status marks are the marshals' flags: green, yellow, red, and a plain flag for a note
  const flag = cls => `<svg viewBox="0 0 16 16" aria-hidden="true"><path d="M3 1.5v13" stroke="currentColor" stroke-width="1.6" stroke-linecap="round"/><path class="${cls}" d="M4 2.2h9.2l-1.9 3.1 1.9 3.1H4z" fill="currentColor"/></svg>`;
  const ICON = { fits: flag('f'), check: flag('f'), fail: flag('f'), info: '<svg viewBox="0 0 16 16" aria-hidden="true"><path d="M3 1.5v13" stroke="currentColor" stroke-width="1.6" stroke-linecap="round"/><path d="M4 2.2h9.2l-1.9 3.1 1.9 3.1H4z" fill="none" stroke="currentColor" stroke-width="1.4"/></svg>' };
  // read from the dictionary each time, so the words follow the page's language
  function named(prefix, keys) { const o = {}; for (const k of keys) Object.defineProperty(o, k, { get: () => T(`${prefix}.${k}`), enumerable: true }); return o; }
  const WORD = named('v.word', ['fits', 'check', 'fail', 'info']);
  const TOPIC = named('v.topic', ['seat', 'legs', 'wheel', 'screen', 'frame']);
  // a source's short name: the language's own wording where it has one (src.<id>), else the name in the table
  const short = x => (x.id && I.has(`src.${x.id}`) ? T(`src.${x.id}`) : x.short);
  const srcLinks = s => s.map(x => `<a href="${esc(x.url)}" rel="noopener" target="_blank" title="${esc(T('v.read', { title: x.title, date: x.checked }))}">${esc(short(x))}</a>`).join(', ');
  const money = x => (x == null ? '' : I.money(x));

  function title(model, E) { return model.sample ? T('sample.name') : (model.name || T('v.your', { what: E.BUILD_SHORT[model.build] })); }
  function summary(r, E) {
    const m = r.m, u = m.units, d = r.design;
    return T('v.summary', { style: E.STYLE_NAME[m.style], build: m.build, lumber: d.lumber.label, h: E.height(m.driver.h, u), seat: m.seat.type, dd: m.gear.base === 'dd', kind: m.screen.kind, size: m.screen.size });
  }
  function counts(c) {
    return ['fits', 'check', 'fail'].map(k => `<span class="sr-count ct-${k}">${ICON[k]}<b>${c[k]}</b><span>${esc(T(`v.count.${k}`, { n: c[k] }))}</span></span>`).join('');
  }
  // the readout: the five numbers a driver sets a rig by, each with the colour of its check
  function readout(r) {
    const p = r.posture, st = id => { const x = r.checks.find(c => c.id === id); return x ? x.status : 'info'; };
    const far = T('v.far');
    const cells = [
      [T('v.knee'), p.rest.reach === 'far' ? far : `${Math.round(p.rest.knee)}°`, st('knee')],
      [T('v.hip'), `${Math.round(p.hip)}°`, st('hip')],
      [T('v.elbow'), p.armReach === 'far' ? far : `${Math.round(p.elbow)}°`, st('elbow')],
      [T('v.back'), `${Math.round(p.back)}°`, st('torso')],
      [T('v.fov'), `${Math.round(r.fov.h)}°`, 'info'],
    ];
    return cells.map(([k, v, s]) => `<div class="sr-read sr-read-${s}"><b>${esc(v)}</b><span>${esc(k)}</span></div>`).join('');
  }
  function checkRows(r) {
    const rows = []; let last = '';
    for (const c of r.checks) {
      if (c.topic !== last) { rows.push(`<tr class="sr-group"><td colspan="5">${esc(TOPIC[c.topic] || c.topic)}</td></tr>`); last = c.topic; }
      rows.push(`<tr data-id="${esc(c.id)}" class="is-${c.status}"><td class="sr-st st-${c.status}"><span>${ICON[c.status]}${esc(WORD[c.status])}</span></td><td><b>${esc(c.title)}</b></td><td data-h="${esc(T('v.h.yours'))}">${esc(c.yours)}</td><td data-h="${esc(T('v.h.guide'))}">${esc(c.limit)}</td><td data-h="${esc(T('v.h.why'))}" class="sr-why">${esc(c.reason)}${c.sources.length ? `<span class="sr-src"> ${srcLinks(c.sources)}</span>` : ''}</td></tr>`);
    }
    return rows.join('');
  }
  function shopRows(r, E) {
    const rows = []; let last = '';
    for (const it of r.shop.items) {
      if (it.group !== last) { rows.push(`<tr class="sr-group"><td colspan="4">${esc(it.group)}</td></tr>`); last = it.group; }
      const q = Number.isInteger(it.qty) ? it.qty : I.fixed(it.qty, 2);
      rows.push(`<tr data-item="${esc(it.id)}"><td><b>${esc(it.label)}</b>${it.note ? `<span class="sr-src" style="display:block">${esc(it.note)}</span>` : ''}</td><td data-h="${esc(T('v.h.qty'))}" class="num">${q} ${esc(E.unit(it.qty, it.unit))}</td><td data-h="${esc(T('v.h.price'))}" class="num"><input type="number" inputmode="decimal" min="0" step="0.01" data-price="${esc(it.id)}" aria-label="${esc(T('v.priceFor', { label: it.label }))}" value="${it.price != null ? it.price : ''}"></td><td data-h="${esc(T('v.h.cost'))}" class="num" data-cost="${esc(it.id)}">${it.cost != null ? money(it.cost) : ''}</td></tr>`);
    }
    rows.push(`<tr class="sr-total"><td colspan="3">${esc(T('v.total'))}</td><td class="num" id="shop-total">${r.shop.priced ? money(r.shop.total) : ''}</td></tr>`);
    return rows.join('');
  }
  const shopSig = (r, units) => r.shop.items.map(i => `${i.id}:${i.qty}`).join('|') + units;
  function shopCaption(r, model, E) {
    if (model.build === 'alu') return T('v.capAlu', { list: r.bom.sections.map(s => T('v.capProfile', { m: s.total / 1000, label: s.profile.label })).join(T('v.and')), brackets: r.bom.brackets });
    return T('v.capWood', { boards: r.cut.boards.length, lumber: r.design.lumber.label, stock: E.stockLabel(model.stock, model.units), sheets: r.sheets.count });
  }
  return { esc, ICON, WORD, TOPIC, money, title, summary, counts, readout, checkRows, shopRows, shopSig, shopCaption };
});
