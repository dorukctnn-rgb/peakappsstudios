// Seven-segment digits like the date stamp of an old film camera. Unlit segments stay faintly visible.
// segmentMarkup() is used by the build (static first paint) and by the page script (live readouts).

const H = (x1, x2, y) => `${x1},${y} ${x1 + 1.6},${y - 1.6} ${x2 - 1.6},${y - 1.6} ${x2},${y} ${x2 - 1.6},${y + 1.6} ${x1 + 1.6},${y + 1.6}`;
const V = (x, y1, y2) => `${x},${y1} ${x + 1.6},${y1 + 1.6} ${x + 1.6},${y2 - 1.6} ${x},${y2} ${x - 1.6},${y2 - 1.6} ${x - 1.6},${y1 + 1.6}`;
const SEGS = {
  a: H(3.6, 16.4, 2.6),
  b: V(17.4, 3.6, 16.4),
  c: V(17.4, 17.6, 30.4),
  d: H(3.6, 16.4, 31.4),
  e: V(2.6, 17.6, 30.4),
  f: V(2.6, 3.6, 16.4),
  g: H(3.6, 16.4, 17),
};
const MAP = {
  0: 'abcdef',
  1: 'bc',
  2: 'abged',
  3: 'abgcd',
  4: 'fgbc',
  5: 'afgcd',
  6: 'afgecd',
  7: 'abc',
  8: 'abcdefg',
  9: 'abcdfg',
  '-': 'g',
  ' ': '',
};

export function digitSvg(ch) {
  const on = MAP[ch] ?? '';
  const polys = Object.entries(SEGS)
    .map(([k, pts]) => `<polygon class="s${on.includes(k) ? ' on' : ''}" points="${pts}"/>`)
    .join('');
  return `<svg viewBox="0 0 20 34" aria-hidden="true" focusable="false"><g transform="skewX(-7) translate(2.4 0)">${polys}</g></svg>`;
}

// right-aligned in a fixed number of cells
export function segmentMarkup(value, cells) {
  let s = String(value);
  if (s.length > cells) s = '9'.repeat(cells);
  s = s.padStart(cells, ' ');
  return [...s].map(digitSvg).join('');
}

export function setSegments(el, value, cells, unit = '') {
  const html = segmentMarkup(value, cells) + (unit ? `<span class="unit">${unit}</span>` : '');
  if (el.dataset.v !== `${value}${unit}`) {
    el.innerHTML = html;
    el.dataset.v = `${value}${unit}`;
  }
}
