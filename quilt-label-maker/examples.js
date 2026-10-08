/* Wording guide: draws each example as a real label with the label maker's renderer.
 * The wording and design come from the example's "Use this wording" link. */
import { layoutLabel, toSvg, fontsFor, clearMeasureCache, LAYOUTS, LETTERING, INKS } from './label.js';

const W = 6 * 72, H = 4 * 72;
const cards = [...document.querySelectorAll('.ql-example.has-fig')].map(card => {
  const link = card.querySelector('a[href*="?"]');
  const q = new URL(link.href, location.href).searchParams;
  const fields = {};
  for (const k of ['title', 'forLead', 'for', 'byLead', 'by', 'date', 'place', 'message', 'care']) fields[k] = q.get(k) || '';
  const pick = (v, table, d) => (v && table[v] ? v : d);
  return {
    fig: card.querySelector('.ql-fig'),
    spec: {
      w: W, h: H, kind: 'quilt', fields,
      layout: pick(q.get('layout'), LAYOUTS, 'stitched'),
      lettering: pick(q.get('lettering'), LETTERING, 'script'),
      borderInk: INKS.some(i => i.id === q.get('ink')) ? q.get('ink') : 'red',
      textInk: 'charcoal',
    },
  };
});

function draw() {
  for (const c of cards) {
    const res = layoutLabel(c.spec);
    c.fig.innerHTML = `<svg viewBox="0 0 ${W} ${H}"><rect width="${W}" height="${H}" fill="#fffefb"/>${toSvg(res)}</svg>`;
  }
}
if (cards.length && 'IntersectionObserver' in window) {
  let started = false;
  const io = new IntersectionObserver(entries => {
    if (started || !entries.some(e => e.isIntersecting)) return;
    started = true; io.disconnect();
    const fonts = [...new Set(cards.flatMap(c => fontsFor(c.spec.lettering)))];
    Promise.all(fonts.map(f => document.fonts.load(f, 'AaQq’'))).catch(() => {}).then(() => { clearMeasureCache(); draw(); });
  }, { rootMargin: '400px' });
  cards.forEach(c => io.observe(c.fig));
}
