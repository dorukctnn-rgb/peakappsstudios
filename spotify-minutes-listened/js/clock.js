/* The listening record: a day of listening drawn as a record. Twenty-four segments around the label, one per hour,
 * midnight at the top and running clockwise; the longer the segment, the more minutes in that hour. Used for the hero
 * (built into the page from the sample), the results and the share cards (cards.js draws the same geometry on canvas). */

export function recordGeometry(hours, size = 400) {
  const c = size / 2;
  const max = Math.max(1, ...hours);
  const rLabel = size * 0.2, r0 = size * 0.235, r1 = size * 0.47;
  const step = (Math.PI * 2) / 24, gap = step * 0.14;
  const bars = hours.map((v, h) => {
    const len = (r1 - r0) * Math.max(v > 0 ? 0.05 : 0.02, v / max);
    const a0 = -Math.PI / 2 + h * step + gap / 2, a1 = a0 + step - gap;
    return { h, v, a0, a1, rIn: r0, rOut: r0 + len, share: v / max };
  });
  return { c, rLabel, r0, r1, bars, size };
}

const f1 = n => Math.round(n * 10) / 10;
function sector(cx, cy, rIn, rOut, a0, a1) {
  const p = (r, a) => `${f1(cx + r * Math.cos(a))} ${f1(cy + r * Math.sin(a))}`;
  return `M${p(rIn, a0)}L${p(rOut, a0)}A${f1(rOut)} ${f1(rOut)} 0 0 1 ${p(rOut, a1)}L${p(rIn, a1)}A${f1(rIn)} ${f1(rIn)} 0 0 0 ${p(rIn, a0)}Z`;
}

const esc = s => String(s).replace(/[&<>"]/g, ch => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[ch]));

// hours: 24 numbers (minutes or ms, any unit). label: the word on the record's label. Returns SVG markup.
export function recordSvg(hours, { size = 400, label = 'Earhours', title = '', id = 'rec' } = {}) {
  const g = recordGeometry(hours, size);
  const { c } = g;
  const grooves = [];
  for (let r = g.r0 + 4; r < g.r1 + 6; r += size * 0.018) grooves.push(`<circle cx="${c}" cy="${c}" r="${f1(r)}"/>`);
  const bars = g.bars.map(b => `<path d="${sector(c, c, b.rIn, b.rOut, b.a0, b.a1)}" fill-opacity="${f1(0.45 + 0.55 * b.share)}"/>`).join('');
  const ticks = [0, 6, 12, 18].map(h => {
    const a = -Math.PI / 2 + h * (Math.PI / 12) + Math.PI / 24;
    const r = g.rLabel * 0.72;
    return `<text x="${f1(c + r * Math.cos(a))}" y="${f1(c + r * Math.sin(a))}">${String(h).padStart(2, '0')}</text>`;
  }).join('');
  return `<svg class="eh-rec" viewBox="0 0 ${size} ${size}" role="img"${title ? ` aria-labelledby="${id}-t"` : ' aria-hidden="true"'} focusable="false">`
    + (title ? `<title id="${id}-t">${esc(title)}</title>` : '')
    + `<circle class="eh-rec-disc" cx="${c}" cy="${c}" r="${f1(size * 0.495)}"/>`
    + `<g class="eh-rec-grooves" fill="none">${grooves.join('')}</g>`
    + `<g class="eh-rec-bars">${bars}</g>`
    + `<circle class="eh-rec-label" cx="${c}" cy="${c}" r="${f1(g.rLabel)}"/>`
    + `<g class="eh-rec-ticks" text-anchor="middle" dominant-baseline="central">${ticks}</g>`
    + `<text class="eh-rec-name" x="${c}" y="${f1(c - g.rLabel * 0.34)}" text-anchor="middle" dominant-baseline="central">${esc(label)}</text>`
    + `<circle class="eh-rec-hole" cx="${c}" cy="${c}" r="${f1(size * 0.012)}"/>`
    + `</svg>`;
}
