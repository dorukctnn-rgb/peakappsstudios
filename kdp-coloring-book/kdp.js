/* KDP paperback rules and layout math for the coloring book interior maker.
 * Pure functions, no DOM. Loaded as a classic script (window.KDP) and by the node tests.
 *
 * Every number below comes from Amazon KDP's help pages, last checked 7 October 2026:
 *  - Trim sizes, page ranges, bleed and margins: https://kdp.amazon.com/en_US/help/topic/GVBQ3CMEQW3W2VL6
 *  - Spine factors and cover size:               https://kdp.amazon.com/en_US/help/topic/G201953020
 *  - Groundwood spine factor, 300/600 DPI, odd pages on the right, even page count:
 *                                                https://kdp.amazon.com/en_US/help/topic/G201857950
 *  - Blank page limits (4 in a row, 10 at the end): https://kdp.amazon.com/en_US/help/topic/G201834260
 *  - Barcode size and clearance:                 https://kdp.amazon.com/en_US/help/topic/G5HDYGP4BXLX4RUW
 *  - Printing cost (Amazon.com):                 https://kdp.amazon.com/en_US/help/topic/G201834340
 */
(function (root) {
  'use strict';

  /* ===== Pro license (Gumroad) ==================================================================
   * OWNER: create the Gumroad product with permalink "kdp-interior-pro" ($19, license keys on),
   * then paste its product id here (Gumroad → product → Content/Advanced → "product_id").
   * Gumroad requires product_id for products created after Jan 2023; until then the permalink is sent. */
  const GUMROAD_PRODUCT_ID = 'S3hGaz5J76g-UgyGSYPtjw==';
  const LICENSE = {
    tool: 'kdp-interior', productId: GUMROAD_PRODUCT_ID, permalink: 'kdp-interior-pro',
    buyUrl: 'https://dorukctn.gumroad.com/l/kdp-interior-pro',
    pitch: 'Pro ($19, one-time) adds unlimited pages, every KDP trim size, front pages, page numbers, the cover template and saved setups.',
  };

  const BLEED = 0.125;               // inches, added to top, bottom and outside edge
  const MIN_PAGES = 24;
  const MAX_BLANK_RUN = 4;           // consecutive blank pages allowed at the beginning or middle
  const MAX_BLANK_RUN_END = 10;      // consecutive blank pages allowed at the end
  const MIN_DPI = 300;
  const MAX_DPI = 600;               // KDP's recommended maximum
  const SPINE_TEXT_MIN_PAGES = 79;
  const SPINE_TEXT_CLEARANCE = 0.0625;
  const COVER_SAFE = 0.125;          // keep cover text this far inside the trim lines and the spine folds
  const BARCODE = { w: 2, h: 1.2, clearance: 0.25 };
  const FREE_ART_LIMIT = 24;
  const FREE_TRIM = '8.5x11';
  const NUMBER_BAND = 0.3;           // inches reserved under the art for a page number

  // Ink and paper options. spine = inches per page.
  const INKS = {
    white:      { label: 'Black ink, white paper',       short: 'B&W white',      spine: 0.002252, color: false },
    cream:      { label: 'Black ink, cream paper',       short: 'B&W cream',      spine: 0.0025,   color: false },
    groundwood: { label: 'Black ink, groundwood paper',  short: 'B&W groundwood', spine: 0.00235,  color: false },
    standard:   { label: 'Standard color, white paper',  short: 'Standard color', spine: 0.002252, color: true },
    premium:    { label: 'Premium color, white paper',   short: 'Premium color',  spine: 0.002347, color: true },
  };
  const INK_ORDER = ['white', 'cream', 'groundwood', 'standard', 'premium'];

  // kdp.amazon.com paperback trims: [min, max] pages per ink (null = not available).
  const R828 = { white: [24, 828], cream: [24, 776], groundwood: [24, 812], standard: [72, 600], premium: [24, 828] };
  const R800 = { white: [24, 800], cream: [24, 750], groundwood: [24, 784], standard: [72, 600], premium: [24, 800] };
  const R590 = { white: [24, 590], cream: [24, 550], groundwood: [24, 578], standard: [72, 600], premium: [24, 590] };
  const RA4  = { white: [24, 780], cream: [24, 730], groundwood: [24, 764], standard: null,      premium: [24, 590] };
  const TRIMS = [
    { id: '5x8',        w: 5,    h: 8,     ranges: R828 },
    { id: '5.06x7.81',  w: 5.06, h: 7.81,  ranges: R828 },
    { id: '5.25x8',     w: 5.25, h: 8,     ranges: R828 },
    { id: '5.5x8.5',    w: 5.5,  h: 8.5,   ranges: R828 },
    { id: '6x9',        w: 6,    h: 9,     ranges: R828 },
    { id: '6.14x9.21',  w: 6.14, h: 9.21,  ranges: R828 },
    { id: '6.69x9.61',  w: 6.69, h: 9.61,  ranges: R828 },
    { id: '7x10',       w: 7,    h: 10,    ranges: R828 },
    { id: '7.44x9.69',  w: 7.44, h: 9.69,  ranges: R828 },
    { id: '7.5x9.25',   w: 7.5,  h: 9.25,  ranges: R828 },
    { id: '8x10',       w: 8,    h: 10,    ranges: R828 },
    { id: '8.25x6',     w: 8.25, h: 6,     ranges: R800 },
    { id: '8.25x8.25',  w: 8.25, h: 8.25,  ranges: R800 },
    { id: '8.5x8.5',    w: 8.5,  h: 8.5,   ranges: R590 },
    { id: '8.5x11',     w: 8.5,  h: 11,    ranges: R590 },
    { id: '8.27x11.69', w: 8.27, h: 11.69, ranges: RA4, note: 'A4' },
  ];

  const r4 = n => Math.round(n * 10000) / 10000;
  const fmt = (n, d = 3) => String(Number(n.toFixed(d)));           // 0.375, 8.625, 0.14
  const mm = n => (n * 25.4).toFixed(1);

  function trim(id) { return TRIMS.find(t => t.id === id) || null; }
  function trimLabel(t) { t = typeof t === 'string' ? trim(t) : t; return `${fmt(t.w, 2)} × ${fmt(t.h, 2)} in`; }
  function isLargeTrim(t) { t = typeof t === 'string' ? trim(t) : t; return t.w > 6.12 || t.h > 9; }

  /** KDP's page-count range for a trim and ink. Returns null if the combination isn't offered. */
  function pageRange(trimId, ink) {
    const t = trim(trimId); if (!t) return null;
    const r = t.ranges[ink]; return r ? { min: r[0], max: r[1] } : null;
  }

  /** Inside (gutter) margin from KDP's table. */
  function gutter(pages) {
    if (pages <= 150) return 0.375;
    if (pages <= 300) return 0.5;
    if (pages <= 500) return 0.625;
    if (pages <= 700) return 0.75;
    return 0.875;
  }
  function gutterBand(pages) {
    if (pages <= 150) return '24–150';
    if (pages <= 300) return '151–300';
    if (pages <= 500) return '301–500';
    if (pages <= 700) return '501–700';
    return '701–828';
  }
  /** Minimum top, bottom and outside margin, measured from the edge of the PDF page. */
  function outsideMargin(bleed) { return bleed ? 0.375 : 0.25; }

  /** PDF page size: trim + 0.125 in on the width and + 0.25 in on the height when the interior bleeds. */
  function pageSize(trimId, bleed) {
    const t = trim(trimId);
    return { w: r4(t.w + (bleed ? BLEED : 0)), h: r4(t.h + (bleed ? 2 * BLEED : 0)) };
  }

  /** Where the trimmed page sits inside the PDF page (inches, origin top-left, y down).
   *  side: 'right' = odd page (spine on the left), 'left' = even page (spine on the right). */
  function trimRect(trimId, bleed, side) {
    const t = trim(trimId);
    if (!bleed) return { x: 0, y: 0, w: t.w, h: t.h };
    return { x: side === 'left' ? BLEED : 0, y: BLEED, w: t.w, h: t.h };
  }

  /** KDP's minimum safe area for a page (inches, origin top-left). */
  function safeArea(trimId, bleed, pages, side) {
    const p = pageSize(trimId, bleed), g = gutter(pages), o = outsideMargin(bleed);
    const x0 = side === 'left' ? o : g;
    const x1 = side === 'left' ? p.w - g : p.w - o;
    return { x: r4(x0), y: o, w: r4(x1 - x0), h: r4(p.h - 2 * o) };
  }

  /** The box the artwork is fitted into.
   *  opts: { bleed, pages, side, center (equal side margins), extra (inches on every side), numbers (reserve a band) } */
  function artBox(trimId, opts) {
    const { bleed, pages, side } = opts;
    const g = gutter(pages);
    const fromTrim = 0.25;                         // KDP minimum from the trim line (0.375 from the bleed edge = 0.25 + 0.125)
    const extra = opts.extra || 0;
    let inside = g + extra, outside = (opts.center ? Math.max(g, fromTrim) : fromTrim) + extra;
    let top = fromTrim + extra, bottom = fromTrim + extra + (opts.numbers ? NUMBER_BAND : 0);
    const tr = trimRect(trimId, bleed, side);
    const left = side === 'left' ? outside : inside;
    const right = side === 'left' ? inside : outside;
    return { x: r4(tr.x + left), y: r4(tr.y + top), w: r4(tr.w - left - right), h: r4(tr.h - top - bottom) };
  }

  /** Where the page number sits (center x, baseline y, inches). */
  function numberSlot(trimId, opts) {
    const box = artBox(trimId, opts);
    return { cx: r4(box.x + box.w / 2), y: r4(box.y + box.h + NUMBER_BAND * 0.62), size: 10 };
  }

  /** Place an image of srcW × srcH pixels into a box. mode 'fit' keeps it whole, 'fill' covers the box and crops.
   *  Returns the drawn rectangle (may extend past the box in fill mode), the visible crop in source pixels and the printed DPI. */
  function placeImage(srcW, srcH, box, mode) {
    const s = mode === 'fill' ? Math.max(box.w / srcW, box.h / srcH) : Math.min(box.w / srcW, box.h / srcH); // inches per pixel
    const w = srcW * s, h = srcH * s;
    const x = box.x + (box.w - w) / 2, y = box.y + (box.h - h) / 2;
    // Visible part (fill mode crops to the box).
    const vx = Math.max(x, box.x), vy = Math.max(y, box.y);
    const vw = Math.min(x + w, box.x + box.w) - vx, vh = Math.min(y + h, box.y + box.h) - vy;
    return {
      rect: { x: r4(x), y: r4(y), w: r4(w), h: r4(h) },
      visible: { x: r4(vx), y: r4(vy), w: r4(vw), h: r4(vh) },
      crop: { sx: (vx - x) / s, sy: (vy - y) / s, sw: vw / s, sh: vh / s },
      dpi: Math.round(1 / s),
    };
  }

  /** Build the page sequence.
   *  opts: { art (number of coloring pages), singleSided, belongsTo, testPage, ink, trimId, padToMin }
   *  Returns { pages: [{ n, side, kind, art? }], total, blanks, padded, front, min, max, problems: [] } */
  function layout(opts) {
    const seq = [];
    const push = (kind, extra) => seq.push(Object.assign({ kind }, extra || {}));
    const items = [];
    if (opts.belongsTo) items.push({ kind: 'belongs' });
    if (opts.testPage) items.push({ kind: 'test' });
    for (let i = 0; i < opts.art; i++) items.push({ kind: 'art', art: i });
    for (const it of items) {
      // Single-sided: every printed page starts on a right-hand (odd) page; the left page before it stays blank.
      if (opts.singleSided && seq.length % 2 === 1) push('blank');
      push(it.kind, it.art != null ? { art: it.art } : null);
    }
    // KDP rounds the page count up to an even number; we add that page ourselves so the file matches the book.
    if (seq.length % 2 === 1) push('blank');

    const range = pageRange(opts.trimId, opts.ink);
    const min = range ? range.min : MIN_PAGES, max = range ? range.max : 0;
    let padded = 0;
    const problems = [];
    if (!range) problems.push({ code: 'ink-trim', msg: `${INKS[opts.ink].label} isn't available for ${trimLabel(opts.trimId)}.` });
    if (items.length && seq.length < min) {
      const trailing = trailingBlanks(seq);
      const need = min - seq.length;
      if (opts.padToMin && trailing + need <= MAX_BLANK_RUN_END) {
        for (let i = 0; i < need; i++) push('pad');
        padded = need;
      } else {
        problems.push({ code: 'min', need, msg: `KDP needs at least ${min} pages for this ink and paper; this layout has ${seq.length}.` });
      }
    }
    if (range && seq.length > max) problems.push({ code: 'max', msg: `KDP allows at most ${max} pages for ${trimLabel(opts.trimId)} with ${INKS[opts.ink].label.toLowerCase()}; this layout has ${seq.length}.` });

    seq.forEach((p, i) => { p.n = i + 1; p.side = (i % 2 === 0) ? 'right' : 'left'; });
    const blanks = seq.filter(p => p.kind === 'blank' || p.kind === 'pad').length;
    return { pages: seq, total: seq.length, blanks, padded, front: items.length - opts.art, min, max, problems };
  }

  function isBlank(p) { return p.kind === 'blank' || p.kind === 'pad'; }
  function trailingBlanks(seq) { let n = 0; for (let i = seq.length - 1; i >= 0 && isBlank(seq[i]); i--) n++; return n; }
  /** Longest run of blank pages before the trailing run, and the trailing run. */
  function blankRuns(seq) {
    const trailing = trailingBlanks(seq);
    let longest = 0, run = 0;
    for (let i = 0; i < seq.length - trailing; i++) { run = isBlank(seq[i]) ? run + 1 : 0; longest = Math.max(longest, run); }
    return { inner: longest, trailing };
  }

  /** How many more coloring pages are needed to reach the minimum (padding allowed). */
  function artNeededForMin(opts) {
    for (let k = opts.art; k < opts.art + 200; k++) {
      const l = layout(Object.assign({}, opts, { art: k }));
      if (!l.problems.some(p => p.code === 'min')) return k - opts.art;
    }
    return null;
  }

  function spineWidth(pages, ink) { return r4(pages * INKS[ink].spine); }

  /** Full-wrap paperback cover. Inches, origin top-left. */
  function cover(trimId, pages, ink) {
    const t = trim(trimId), spine = spineWidth(pages, ink);
    const W = r4(BLEED + t.w + spine + t.w + BLEED), H = r4(BLEED + t.h + BLEED);
    const backX = BLEED, spineX = r4(BLEED + t.w), frontX = r4(BLEED + t.w + spine);
    const spineText = pages >= SPINE_TEXT_MIN_PAGES;
    return {
      trim: t, pages, ink, spine, W, H,
      back:  { x: backX, y: BLEED, w: t.w, h: t.h },
      spineRect: { x: spineX, y: BLEED, w: spine, h: t.h },
      front: { x: frontX, y: BLEED, w: t.w, h: t.h },
      backSafe:  { x: r4(backX + COVER_SAFE), y: BLEED + COVER_SAFE, w: r4(t.w - 2 * COVER_SAFE), h: r4(t.h - 2 * COVER_SAFE) },
      frontSafe: { x: r4(frontX + COVER_SAFE), y: BLEED + COVER_SAFE, w: r4(t.w - 2 * COVER_SAFE), h: r4(t.h - 2 * COVER_SAFE) },
      spineSafe: spineText && spine > 2 * SPINE_TEXT_CLEARANCE
        ? { x: r4(spineX + SPINE_TEXT_CLEARANCE), y: BLEED + COVER_SAFE, w: r4(spine - 2 * SPINE_TEXT_CLEARANCE), h: r4(t.h - 2 * COVER_SAFE) } : null,
      spineText,
      barcode: { x: r4(spineX - BARCODE.clearance - BARCODE.w), y: r4(BLEED + t.h - BARCODE.clearance - BARCODE.h), w: BARCODE.w, h: BARCODE.h },
    };
  }

  /** KDP printing cost on Amazon.com in USD (fixed + per page), or null if not applicable. */
  function printCostUSD(trimId, pages, ink) {
    const large = isLargeTrim(trimId);
    const P = {
      white:      [[110, large ? 2.84 : 2.30, 0], [828, 1.00, large ? 0.017 : 0.012]],
      cream:      [[110, large ? 2.84 : 2.30, 0], [828, 1.00, large ? 0.017 : 0.012]],
      groundwood: [[112, large ? 2.75 : 2.23, 0], [828, 1.00, large ? 0.0162 : 0.0114]],
      premium:    [[40,  large ? 4.20 : 3.60, 0], [828, 1.00, large ? 0.08 : 0.065]],
      standard:   [[600, 1.00, large ? 0.0402 : 0.0255]],
    }[ink];
    if (!P || pages < 24) return null;
    for (const [upTo, fixed, per] of P) if (pages <= upTo) return Math.round((fixed + pages * per) * 100) / 100;
    return null;
  }

  // ---- Simple vector drawings (inches, origin top-left) shared by the preview and the PDF ----
  function roundRect(x, y, w, h, r) {
    return `M${x + r} ${y}H${x + w - r}A${r} ${r} 0 0 1 ${x + w} ${y + r}V${y + h - r}A${r} ${r} 0 0 1 ${x + w - r} ${y + h}H${x + r}A${r} ${r} 0 0 1 ${x} ${y + h - r}V${y + r}A${r} ${r} 0 0 1 ${x + r} ${y}Z`;
  }
  function star(cx, cy, R, r) {
    let d = '';
    for (let i = 0; i < 10; i++) {
      const a = -Math.PI / 2 + i * Math.PI / 5, rad = i % 2 ? r : R;
      d += `${i ? 'L' : 'M'}${r4(cx + rad * Math.cos(a))} ${r4(cy + rad * Math.sin(a))}`;
    }
    return d + 'Z';
  }
  /** Shapes for the Pro front-matter pages, laid out inside the art box.
   *  unit: 1 when the box is in inches, 72 when it is in points. Text sizes are always in points. */
  function frontMatter(kind, box, unit = 1) {
    const cx = box.x + box.w / 2, k = Math.min(box.w / 7.75, box.h / 10.5);   // k = 1 at 8.5 × 11 (in units)
    const t = k / unit;                                                        // unitless scale for type sizes
    const s = k;
    const out = [];
    if (kind === 'belongs') {
      const ins = 0.09 * Math.max(s, 0.6 * unit);
      out.push({ type: 'path', d: roundRect(box.x, box.y, box.w, box.h, 0.28 * s), stroke: 1.5 });
      out.push({ type: 'path', d: roundRect(box.x + ins, box.y + ins, box.w - 2 * ins, box.h - 2 * ins, Math.max(0.28 * s - ins, 0.05 * unit)), stroke: 0.75 });
      const ty = box.y + box.h * 0.47;
      out.push({ type: 'path', d: star(cx, ty - 1.25 * s, 0.34 * s, 0.15 * s), stroke: 1.25 });
      out.push({ type: 'path', d: star(cx - 0.72 * s, ty - 1.05 * s, 0.2 * s, 0.09 * s), stroke: 1 });
      out.push({ type: 'path', d: star(cx + 0.72 * s, ty - 1.05 * s, 0.2 * s, 0.09 * s), stroke: 1 });
      out.push({ type: 'text', text: 'This book belongs to', cx, y: ty, size: 38 * t, font: 'serif' });
      const lw = box.w * 0.62;
      out.push({ type: 'line', x1: cx - lw / 2, y1: ty + 1.25 * s, x2: cx + lw / 2, y2: ty + 1.25 * s, stroke: 1 });
    } else if (kind === 'test') {
      out.push({ type: 'text', text: 'Test your colors', cx, y: box.y + 0.62 * s, size: 34 * t, font: 'serif' });
      out.push({ type: 'text', text: 'Try each pen, pencil or marker here before you start a page.', cx, y: box.y + 1.02 * s, size: 10 * Math.max(t, 0.8), font: 'sans' });
      const top = box.y + 1.45 * s, h = box.y + box.h - top;
      const cols = box.w >= 6 * unit ? 5 : 4, cw = box.w / cols;
      const rows = Math.max(3, Math.floor(h / cw)), ch = h / rows;
      const d = Math.min(cw, ch) * 0.74;
      for (let r = 0; r < rows; r++) for (let c = 0; c < cols; c++) {
        out.push({ type: 'circle', cx: box.x + cw * (c + 0.5), cy: top + ch * (r + 0.5), r: d / 2, stroke: 1 });
      }
    }
    return out;
  }

  const api = {
    BLEED, MIN_PAGES, MAX_BLANK_RUN, MAX_BLANK_RUN_END, MIN_DPI, MAX_DPI, SPINE_TEXT_MIN_PAGES, SPINE_TEXT_CLEARANCE,
    LICENSE, COVER_SAFE, BARCODE, FREE_ART_LIMIT, FREE_TRIM, NUMBER_BAND, INKS, INK_ORDER, TRIMS,
    trim, trimLabel, isLargeTrim, pageRange, gutter, gutterBand, outsideMargin, pageSize, trimRect, safeArea, artBox,
    numberSlot, placeImage, layout, blankRuns, artNeededForMin, spineWidth, cover, printCostUSD, frontMatter, fmt, mm,
    SOURCES: {
      margins: 'https://kdp.amazon.com/en_US/help/topic/GVBQ3CMEQW3W2VL6',
      cover: 'https://kdp.amazon.com/en_US/help/topic/G201953020',
      guidelines: 'https://kdp.amazon.com/en_US/help/topic/G201857950',
      blanks: 'https://kdp.amazon.com/en_US/help/topic/G201834260',
      cost: 'https://kdp.amazon.com/en_US/help/topic/G201834340',
    },
  };
  root.KDP = api;
})(typeof window !== 'undefined' ? window : globalThis);
