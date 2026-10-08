/* Quilt Label Maker: sheet maths. Pure functions, no DOM, so the node tests can import them.
 * All lengths are PDF points (1 in = 72 pt). Sheet coordinates start at the top-left corner. */

export const PT_PER_IN = 72;
export const PT_PER_CM = 72 / 2.54;
export const PT_PER_MM = 72 / 25.4;
const EPS = 1e-6;

/* Printable fabric sheets sold for home printers. 8.5 x 11 in is the size of the common brands;
 * EQ Printables also sells 11 x 17 and 13 x 19 in for wide-format printers; A4 is the paper size outside North America. */
export const SHEETS = {
  letter: { w: 8.5 * 72, h: 11 * 72, name: 'US Letter', size: '8.5 × 11 in' },
  a4: { w: 210 * PT_PER_MM, h: 297 * PT_PER_MM, name: 'A4', size: '210 × 297 mm' },
  tabloid: { w: 11 * 72, h: 17 * 72, name: 'Tabloid', size: '11 × 17 in' },
  superb: { w: 13 * 72, h: 19 * 72, name: 'Super B', size: '13 × 19 in' },
};

export const toPt = (v, unit) => Number(v) * (unit === 'cm' ? PT_PER_CM : unit === 'mm' ? PT_PER_MM : PT_PER_IN);
export const fromPt = (pt, unit) => pt / (unit === 'cm' ? PT_PER_CM : unit === 'mm' ? PT_PER_MM : PT_PER_IN);

/** How many items of `size` fit along `len` with `gap` between neighbours. */
export function fitCount(len, size, gap = 0) {
  if (!(size > 0) || size > len + EPS) return 0;
  return Math.floor((len + gap + EPS) / (size + gap));
}

function gridCells(x0, y0, cols, rows, w, h, gap, rot) {
  const cells = [];
  for (let r = 0; r < rows; r++) for (let c = 0; c < cols; c++) cells.push({ x: x0 + c * (w + gap), y: y0 + r * (h + gap), w, h, rot });
  return cells;
}

/**
 * Fit as many cells (label + allowance on every side) on a sheet as possible.
 * Tries an upright grid, a rotated grid, and every split where a block of one orientation
 * is followed by a grid of the other orientation in the leftover strip (to the right or below).
 * Returns { count, cells, rotated, usedW, usedH, ox, oy } with cells placed and the block centred on the sheet.
 */
export function packSheet({ sheetW, sheetH, margin = 18, cellW, cellH, gap = 0, allowRotate = true }) {
  const aw = sheetW - 2 * margin, ah = sheetH - 2 * margin;
  const empty = { count: 0, cells: [], rotated: 0, usedW: 0, usedH: 0, ox: margin, oy: margin, aw, ah };
  if (!(cellW > 0 && cellH > 0) || aw <= 0 || ah <= 0) return empty;

  const orients = allowRotate && Math.abs(cellW - cellH) > EPS ? [false, true] : [false];
  const options = [];
  for (const rot of orients) {
    const a = rot ? cellH : cellW, b = rot ? cellW : cellH; // this block's cell width/height
    const cols = fitCount(aw, a, gap), rows = fitCount(ah, b, gap);
    if (cols && rows) options.push({ cells: gridCells(0, 0, cols, rows, a, b, gap, rot), blocks: 1 });
    if (orients.length < 2) continue;
    const a2 = b, b2 = a; // the other orientation
    // k columns of this orientation, the rest of the width in the other orientation
    for (let k = 1; k <= cols; k++) {
      const x2 = k * (a + gap), rw = aw - x2;
      const c2 = fitCount(rw, a2, gap), r2 = fitCount(ah, b2, gap);
      if (rows && c2 && r2) options.push({ cells: [...gridCells(0, 0, k, rows, a, b, gap, rot), ...gridCells(x2, 0, c2, r2, a2, b2, gap, !rot)], blocks: 2 });
    }
    // k rows of this orientation, the rest of the height in the other orientation
    for (let k = 1; k <= rows; k++) {
      const y2 = k * (b + gap), rh = ah - y2;
      const c2 = fitCount(aw, a2, gap), r2 = fitCount(rh, b2, gap);
      if (cols && c2 && r2) options.push({ cells: [...gridCells(0, 0, cols, k, a, b, gap, rot), ...gridCells(0, y2, c2, r2, a2, b2, gap, !rot)], blocks: 2 });
    }
  }
  if (!options.length) return empty;
  const rotCount = o => o.cells.filter(c => c.rot).length;
  options.sort((p, q) => q.cells.length - p.cells.length || rotCount(p) - rotCount(q) || p.blocks - q.blocks);
  const best = options[0];
  const usedW = Math.max(...best.cells.map(c => c.x + c.w));
  const usedH = Math.max(...best.cells.map(c => c.y + c.h));
  const ox = margin + (aw - usedW) / 2, oy = margin + (ah - usedH) / 2;
  const cells = best.cells
    .map(c => ({ ...c, x: c.x + ox, y: c.y + oy }))
    .sort((p, q) => p.y - q.y || p.x - q.x);
  return { count: cells.length, cells, rotated: rotCount(best), usedW, usedH, ox, oy, aw, ah };
}

/** Plan for a whole job: the packing for one sheet and the number of sheets for `labels` labels. */
export function planSheets({ sheet, margin, labelW, labelH, allowance, gap = 0, labels = 0, allowRotate = true }) {
  const s = typeof sheet === 'string' ? SHEETS[sheet] : sheet;
  const cellW = labelW + 2 * allowance, cellH = labelH + 2 * allowance;
  const pack = packSheet({ sheetW: s.w, sheetH: s.h, margin, cellW, cellH, gap, allowRotate });
  const pages = pack.count ? Math.max(1, Math.ceil(labels / pack.count)) : 0;
  return { ...pack, cellW, cellH, sheetW: s.w, sheetH: s.h, pages };
}

/* ------------------------------------------------------------------ formatting */
const FRACTIONS = [[0, ''], [1, '1/8'], [2, '1/4'], [3, '3/8'], [4, '1/2'], [5, '5/8'], [6, '3/4'], [7, '7/8']];
/** Inches as a quilter writes them: 6, 4 1/2, 1/4. Falls back to two decimals when not a multiple of 1/8. */
export function fmtInches(pt) {
  const v = pt / 72;
  const eighths = Math.round(v * 8);
  if (Math.abs(v * 8 - eighths) > 0.02) return (Math.round(v * 100) / 100).toString();
  const whole = Math.floor(eighths / 8), frac = FRACTIONS[eighths % 8][1];
  if (!whole && !frac) return '0';
  return whole ? (frac ? `${whole} ${frac}` : String(whole)) : frac;
}
export function fmtCm(pt) {
  const v = Math.round((pt / PT_PER_CM) * 10) / 10;
  return String(v);
}
export function fmtLen(pt, unit) { return unit === 'cm' ? `${fmtCm(pt)} cm` : `${fmtInches(pt)} in`; }
export function fmtSize(w, h, unit) { return unit === 'cm' ? `${fmtCm(w)} × ${fmtCm(h)} cm` : `${fmtInches(w)} × ${fmtInches(h)} in`; }

/** The largest canvas resolution (dots per inch) that keeps a w × h pt bitmap under maxPixels. */
export function safeDpi(wPt, hPt, wanted, maxPixels = 16e6) {
  const wi = wPt / 72, hi = hPt / 72;
  const cap = Math.floor(Math.sqrt(maxPixels / (wi * hi)));
  return Math.max(72, Math.min(wanted, cap));
}
