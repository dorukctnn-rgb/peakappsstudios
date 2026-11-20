/* The Pro offer at the moment of need, shared by Chatbound and Decant (an ES module that each tool's script loads; nothing else
 * loads it, so a page that does not load a tool script is unchanged).
 *
 *   const offer = createOffer({ tool, price, words, theme, isPro, buy, turnOn, count?, refundHref? });
 *   await offer.choose(ctx)   a free save is about to start. Once per browser session, when the visitor is not Pro and Pro would add
 *                             something for THIS file (ctx.worth), a window puts the free result and Pro side by side with the numbers
 *                             of the open file. Resolves 'free' (go on and save; also when no window was shown), 'closed' (Escape, the
 *                             close button or a click outside: save nothing) or 'pro' (Get Pro was pressed: the checkout opens).
 *   offer.gate(ctx)           a button that only Pro unlocks was pressed: the same window with the price, what Pro adds and a way out.
 *   offer.next(slot, ctx)     a dismissible panel placed after a free save: what to do next, and what the free file leaves out.
 *   offer.tag(el)             a small Pro tag on a button that only Pro unlocks.
 *
 * The free path is never blocked: the free button has the focus, comes before Pro and takes one press, the window never opens for
 * a Pro visitor, never twice in a session and never when Pro would add nothing for this file.
 *
 * Counting stays inside what the pages say about their counter (a Pro button pressed, the Pro window opening on its own, the key box
 * opening): "gate" when this window opens by itself (place "choice", or "gate-<what>"), "click" when Get Pro is pressed in it (place
 * "choice", "gate" or "next"). Turn Pro on presses the page's own key button, which pro-source.js counts as "key". Each note is the
 * five short fields of pro-source.js and no number or word from the visitor's file is ever sent. Tests: src/assets/_tests/pro-offer.test.mjs and the tools' e2e-offer.mjs.
 */
const CSS_HREF = '/assets/pro-offer.css';
const NS = 'http://www.w3.org/2000/svg';

// "gate-<what>" must fit the counter's place rule (^[a-z0-9][a-z0-9#._-]{0,39}$)
export const slug = s => String(s == null ? '' : s).toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 24);
export const placeOf = (mode, id) => (mode === 'gate' && slug(id) ? `gate-${slug(id)}` : mode);

// once per browser session, kept in sessionStorage when the browser allows it and in memory when it does not
export function makeSeen(getStorage, key) {
  let mem = false;
  const store = () => { try { return getStorage(); } catch (e) { return null; } };
  return {
    has() { if (mem) return true; try { const s = store(); return !!(s && s.getItem(key)); } catch (e) { return false; } },
    set() { mem = true; try { const s = store(); if (s) s.setItem(key, '1'); } catch (e) { /* private mode: the memory flag holds for this page */ } },
  };
}

// whether a window may open at all: a free visitor, the first time in this session, and only when Pro adds something for this file
export function mayChoose({ pro, seen, worth }) { return !pro && !seen && worth !== false; }

function h(tag, attrs, ...kids) {
  const e = document.createElement(tag);
  for (const [k, v] of Object.entries(attrs || {})) {
    if (v == null || v === false) continue;
    if (k === 'class') e.className = v; else if (k === 'text') e.textContent = v; else e.setAttribute(k, v === true ? '' : v);
  }
  for (const k of kids.flat()) if (k != null && k !== false) e.append(k);
  return e;
}
function closeIcon() {
  const s = document.createElementNS(NS, 'svg');
  s.setAttribute('viewBox', '0 0 24 24'); s.setAttribute('width', '20'); s.setAttribute('height', '20'); s.setAttribute('aria-hidden', 'true'); s.setAttribute('focusable', 'false');
  const p = document.createElementNS(NS, 'path');
  p.setAttribute('d', 'M6 6l12 12M18 6L6 18'); p.setAttribute('stroke', 'currentColor'); p.setAttribute('stroke-width', '2'); p.setAttribute('stroke-linecap', 'round'); p.setAttribute('fill', 'none');
  s.append(p);
  return s;
}

export function createOffer(cfg) {
  const w = cfg.words;
  const seen = makeSeen(() => window.sessionStorage, `peak-offer:${cfg.tool}`);
  const count = (event, where) => {
    try { if (cfg.count) cfg.count(event, where); else if (window.PeakSource && window.PeakSource.count) window.PeakSource.count(event, where); } catch (e) { /* the offer works the same without the counter */ }
  };
  const isPro = () => { try { return !!cfg.isPro(); } catch (e) { return false; } };

  // ---- the stylesheet, requested now so it is here when a window opens
  let cssReady = null;
  function loadCss() {
    if (cssReady) return cssReady;
    cssReady = new Promise(resolve => {
      let link = document.querySelector('link[data-peak-offer]');
      if (link && link.sheet) return resolve();
      if (!link) { link = h('link', { rel: 'stylesheet', href: CSS_HREF, 'data-peak-offer': true }); document.head.append(link); }
      const done = () => resolve();
      link.addEventListener('load', done, { once: true });
      link.addEventListener('error', done, { once: true });
      setTimeout(done, 1500);
    });
    return cssReady;
  }
  loadCss();

  // ---- the window
  let dlg = null;
  let settle = null;
  let nextDismissed = false; // the panel after a save stays away for the rest of the page once it is dismissed
  function dialog() {
    if (dlg && dlg.isConnected) return dlg;
    dlg = h('dialog', { class: 'po', id: 'po-dialog', 'aria-labelledby': 'po-title' });
    for (const [k, v] of Object.entries(cfg.theme || {})) dlg.style.setProperty(k, v);
    dlg.addEventListener('cancel', e => { e.preventDefault(); end('closed'); });
    dlg.addEventListener('click', e => { if (e.target === dlg) end('closed'); });
    document.body.append(dlg);
    return dlg;
  }
  function end(result) {
    const d = dlg;
    if (d && d.open) d.close();
    const s = settle; settle = null;
    if (s) s(result);
  }
  function priceTag() { return h('span', { class: 'po-price', text: cfg.price }); }

  function ledger(ctx) {
    const rows = ctx.rows || [];
    if (!rows.length) return null;
    const head = h('tr', {}, h('th', { scope: 'col', class: 'po-h-what' }, h('span', { class: 'po-sr', text: w.columnWhat })),
      h('th', { scope: 'col', class: 'po-h-free', text: w.free }),
      h('th', { scope: 'col', class: 'po-h-pro' }, w.pro, ' ', priceTag(), ' ', h('span', { class: 'po-once', text: w.once })));
    const body = rows.map(r => h('tr', { class: r.hot ? 'po-hot' : null },
      h('th', { scope: 'row', text: r.label }),
      h('td', { class: 'po-c-free', text: r.free }),
      h('td', { class: 'po-c-pro', text: r.pro })));
    return h('div', { class: 'po-scroll' }, h('table', { class: 'po-ledger' }, h('thead', {}, head), h('tbody', {}, body)));
  }
  function trust() {
    const lines = [
      h('li', {}, w.trustPay, ' ', h('a', { href: cfg.refundHref || '/legal/refund/', target: '_blank', rel: 'noopener', text: w.refund }), w.trustPayEnd || ''),
      h('li', { text: w.trustLocal }),
    ];
    if (w.trustRefund) lines.splice(1, 0, h('li', { text: w.trustRefund }));
    return h('ul', { class: 'po-trust' }, lines);
  }

  function show(ctx, mode) {
    const d = dialog();
    const id = ctx.id || '';
    d.className = `po po-${mode}`;
    d.replaceChildren();
    const buy = h('button', { type: 'button', class: 'po-btn po-btn-pro', 'data-po': 'buy' }, ctx.buyLabel || w.buy);
    const free = ctx.freeLabel ? h('button', { type: 'button', class: 'po-btn po-btn-free', 'data-po': 'free' }, ctx.freeLabel) : null;
    const quiet = mode === 'gate' && !free ? h('button', { type: 'button', class: 'po-btn po-btn-free', 'data-po': 'close' }, w.notNow) : null;
    const actions = mode === 'choose' ? [free, buy] : [buy, free || quiet];
    const title = h('h2', { id: 'po-title', text: ctx.title });
    d.append(
      h('button', { type: 'button', class: 'po-x', 'data-po': 'close', 'aria-label': w.close }, closeIcon()),
      title,
      ctx.lede ? h('p', { class: 'po-lede', text: ctx.lede }) : null,
      ledger(ctx),
      h('div', { class: 'po-actions' }, actions.filter(Boolean)),
      trust(),
      h('p', { class: 'po-already' }, w.already, ' ', h('button', { type: 'button', class: 'po-link', 'data-po': 'key', text: w.turnOn })),
    );
    d.onclick = e => {
      const b = e.target.closest && e.target.closest('[data-po]');
      if (!b) return;
      const what = b.getAttribute('data-po');
      if (what === 'close') return end('closed');
      if (what === 'free') return end('free');
      if (what === 'buy') { count('click', mode === 'choose' ? 'choice' : 'gate'); end('pro'); setTimeout(() => { try { cfg.buy(); } catch (err) { /* the Pro window is the fallback in license.js */ } }, 0); return; }
      if (what === 'key') { end('closed'); setTimeout(() => { try { cfg.turnOn(); } catch (err) { /* ignore */ } }, 0); }
    };
    count('gate', placeOf(mode === 'choose' ? 'choice' : 'gate', id));
    if (typeof d.showModal === 'function') d.showModal(); else d.setAttribute('open', '');
    const first = d.querySelector(mode === 'choose' ? '[data-po="free"]' : '[data-po="buy"]');
    if (first) first.focus({ preventScroll: true });
  }

  return {
    // the free save is about to start: resolves 'free' when it may go on
    async choose(ctx) {
      if (!mayChoose({ pro: isPro(), seen: seen.has(), worth: ctx.worth })) return 'free';
      seen.set();
      await loadCss();
      if (settle) end('closed');
      return new Promise(resolve => { settle = resolve; show(ctx, 'choose'); });
    },
    // a Pro-only button was pressed
    async gate(ctx) {
      if (isPro()) return;
      await loadCss();
      if (settle) end('closed');
      return new Promise(resolve => { settle = resolve; show(ctx, 'gate'); });
    },
    // the panel after a free save, placed in `slot` (an element); the Pro part is left out when Pro adds nothing for this file
    next(slot, ctx) {
      document.querySelectorAll('.po-next').forEach(e => e.remove());
      if (isPro() || !slot || nextDismissed) return null;
      const hook = ctx.hook;
      const panel = h('aside', { class: 'po-next', 'aria-label': ctx.label || ctx.title, style: Object.entries(cfg.theme || {}).map(([k, v]) => `${k}:${v}`).join(';') },
        h('div', { class: 'po-next-main' },
          h('p', { class: 'po-next-title', text: ctx.title }),
          ctx.steps && ctx.steps.length ? h('ol', { class: 'po-next-steps' }, ctx.steps.map(s => h('li', {}, s))) : null),
        hook ? h('div', { class: 'po-next-pro' },
          h('p', { text: hook.text }),
          h('button', { type: 'button', class: 'po-btn po-btn-pro', 'data-po': 'buy' }, hook.button || w.buy)) : null,
        h('button', { type: 'button', class: 'po-next-x', 'data-po': 'dismiss', 'aria-label': w.dismiss }, closeIcon()));
      panel.addEventListener('click', e => {
        const b = e.target.closest && e.target.closest('[data-po]');
        if (!b) return;
        const what = b.getAttribute('data-po');
        if (what === 'dismiss') { panel.remove(); nextDismissed = true; return; }
        if (what === 'buy') { count('click', 'next'); try { cfg.buy(); } catch (err) { /* ignore */ } }
      });
      if (ctx.after) slot.insertAdjacentElement('afterend', panel); else slot.append(panel);
      loadCss();
      try { panel.scrollIntoView({ block: 'nearest', behavior: window.matchMedia('(prefers-reduced-motion: reduce)').matches ? 'auto' : 'smooth' }); } catch (e) { /* older browsers */ }
      return panel;
    },
    // a small Pro tag at the end of a button that only Pro unlocks (once)
    tag(el) {
      if (!el || el.querySelector('.po-tag')) return;
      const t = cfg.theme || {};
      const style = [t['--po-chip-bg'] && `background:${t['--po-chip-bg']}`, t['--po-chip-ink'] && `color:${t['--po-chip-ink']}`].filter(Boolean).join(';');
      el.append(' ', h('span', { class: 'po-tag', text: w.pro, style: style || null }));
    },
    // Pro turned on: nothing of the offer stays on the page
    proOn() { document.querySelectorAll('.po-next').forEach(e => e.remove()); if (dlg && dlg.open) end('closed'); },
    seen,
  };
}
