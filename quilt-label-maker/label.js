/* Quilt Label Maker: label design. Borders are drawn as vector paths (quilt-block motifs built from
 * triangles, squares and stitches, no clip art). Text is measured with the real fonts, wrapped and
 * fitted, then emitted as a display list that renders identically to SVG (preview) and canvas (PNG/PDF). */
import { qovMakerLines } from './batch.js';

/* ------------------------------------------------------------------ colours and type */
export const INKS = [
  { id: 'charcoal', name: 'Charcoal', hex: '#2b2926' },
  { id: 'navy', name: 'Navy', hex: '#1f3657' },
  { id: 'red', name: 'Barn red', hex: '#9a2f28' },
  { id: 'forest', name: 'Forest', hex: '#2d5139' },
  { id: 'plum', name: 'Plum', hex: '#5d2f52' },
  { id: 'walnut', name: 'Walnut', hex: '#6a4a33' },
];
export const inkHex = id => (INKS.find(i => i.id === id) || INKS[0]).hex;
export function tint(hex, amount) {
  const n = parseInt(hex.slice(1), 16), r = n >> 16, g = (n >> 8) & 255, b = n & 255;
  const m = v => Math.round(v * amount + 255 * (1 - amount)).toString(16).padStart(2, '0');
  return `#${m(r)}${m(g)}${m(b)}`;
}

/* k: optical size factor so faces look the same size; lh: line height; bo: baseline offset from the line's middle. */
export const FACES = {
  script: { family: 'QL Script', weight: 600, style: 'normal', k: 1.2, lh: 1.18, bo: 0.3 },
  serif: { family: 'QL Caslon', weight: 400, style: 'normal', k: 1, lh: 1.34, bo: 0.33 },
  serifItalic: { family: 'QL Caslon', weight: 400, style: 'italic', k: 1, lh: 1.34, bo: 0.33 },
  serifBold: { family: 'QL Caslon', weight: 700, style: 'normal', k: 1, lh: 1.25, bo: 0.33 },
  hand: { family: 'QL Hand', weight: 500, style: 'normal', k: 1.34, lh: 1.08, bo: 0.3 },
  handBold: { family: 'QL Hand', weight: 700, style: 'normal', k: 1.34, lh: 1.05, bo: 0.3 },
  type: { family: 'QL Type', weight: 400, style: 'normal', k: 0.96, lh: 1.32, bo: 0.32 },
  typeItalic: { family: 'QL Type', weight: 400, style: 'italic', k: 0.96, lh: 1.32, bo: 0.32 },
  typeBold: { family: 'QL Type', weight: 700, style: 'normal', k: 0.96, lh: 1.25, bo: 0.32 },
  sans: { family: 'Geist', weight: 400, style: 'normal', k: 0.96, lh: 1.34, bo: 0.34 },
  sansSemi: { family: 'Geist', weight: 600, style: 'normal', k: 0.96, lh: 1.22, bo: 0.34 },
};
export const LETTERING = {
  script: { name: 'Script and serif', title: 'script', names: 'script', lead: 'serifItalic', text: 'serif', message: 'serifItalic', caps: 'serif', upper: true },
  heirloom: { name: 'Heirloom serif', title: 'serifItalic', names: 'serifItalic', lead: 'serif', text: 'serif', message: 'serifItalic', caps: 'serif', upper: true, titleK: 1.08 },
  hand: { name: 'Handwritten', title: 'handBold', names: 'handBold', lead: 'hand', text: 'hand', message: 'hand', caps: 'hand', upper: false },
  typewriter: { name: 'Typewriter', title: 'typeBold', names: 'typeBold', lead: 'type', text: 'type', message: 'typeItalic', caps: 'type', upper: true, titleK: 0.86 },
  modern: { name: 'Modern', title: 'sansSemi', names: 'sansSemi', lead: 'sans', text: 'sans', message: 'sans', caps: 'sansSemi', upper: true, titleK: 0.9 },
};
export const fontCss = (face, size) => `${face.style === 'italic' ? 'italic ' : ''}${face.weight} ${Math.max(1, size)}px "${face.family}"`;
/** CSS font strings (for document.fonts.load) needed by a lettering choice. */
export function fontsFor(letteringId) {
  const L = LETTERING[letteringId] || LETTERING.script;
  return [...new Set([L.title, L.names, L.lead, L.text, L.message, L.caps].map(k => fontCss(FACES[k], 24)))];
}

/* ------------------------------------------------------------------ text measuring (cached, linear in size) */
let mctx = null;
const wcache = new Map();
function ctx2d() {
  if (!mctx) { const c = document.createElement('canvas'); c.width = c.height = 4; mctx = c.getContext('2d'); }
  return mctx;
}
export function clearMeasureCache() { wcache.clear(); }
export function textWidth(face, size, text) {
  if (!text) return 0;
  const key = face.family + face.weight + face.style + '|' + text;
  let w = wcache.get(key);
  if (w == null) { const c = ctx2d(); c.font = fontCss(face, 100); w = c.measureText(text).width; wcache.set(key, w); }
  return (w * size) / 100;
}

export function smartQuotes(s) {
  return String(s || '')
    .replace(/(^|[\s(\[{“])"/g, '$1“').replace(/"/g, '”')
    .replace(/(\w)'(\w)/g, '$1’$2').replace(/(^|[\s(\[{‘“])'/g, '$1‘').replace(/'/g, '’');
}

/* ------------------------------------------------------------------ geometry helpers */
const f2 = n => (Math.round(n * 100) / 100).toString();
const rectD = (x, y, w, h) => `M${f2(x)} ${f2(y)}H${f2(x + w)}V${f2(y + h)}H${f2(x)}Z`;
function roundRectD(x, y, w, h, r) {
  r = Math.min(r, w / 2, h / 2);
  return `M${f2(x + r)} ${f2(y)}H${f2(x + w - r)}A${f2(r)} ${f2(r)} 0 0 1 ${f2(x + w)} ${f2(y + r)}V${f2(y + h - r)}A${f2(r)} ${f2(r)} 0 0 1 ${f2(x + w - r)} ${f2(y + h)}H${f2(x + r)}A${f2(r)} ${f2(r)} 0 0 1 ${f2(x)} ${f2(y + h - r)}V${f2(y + r)}A${f2(r)} ${f2(r)} 0 0 1 ${f2(x + r)} ${f2(y)}Z`;
}
const polyD = pts => 'M' + pts.map(p => `${f2(p[0])} ${f2(p[1])}`).join('L') + 'Z';
function starD(cx, cy, R, r = R * 0.4, n = 5) {
  const pts = [];
  for (let i = 0; i < 2 * n; i++) { const a = -Math.PI / 2 + (i * Math.PI) / n, rad = i % 2 ? r : R; pts.push([cx + rad * Math.cos(a), cy + rad * Math.sin(a)]); }
  return polyD(pts);
}
const diamondD = (cx, cy, s) => polyD([[cx, cy - s], [cx + s, cy], [cx, cy + s], [cx - s, cy]]);
const lineD = (x1, y1, x2, y2) => `M${f2(x1)} ${f2(y1)}L${f2(x2)} ${f2(y2)}`;
/** Dash pattern adjusted so the stitches meet evenly all the way round a closed path. */
function evenDash(perimeter, dash, gap) {
  const n = Math.max(8, Math.round(perimeter / (dash + gap)));
  const f = perimeter / (n * (dash + gap));
  return [dash * f, gap * f];
}

/* ------------------------------------------------------------------ borders
 * Each returns { prims, box, divider(cx, y, width) -> { prims, h }, style } in label points (0,0 = top-left of the finished label). */
const P = (d, o) => Object.assign({ t: 'path', d }, o);

export const LAYOUTS = {
  stitched: {
    name: 'Hand stitch',
    build(W, H, c, u) {
      const i = u * 0.95, r = u * 0.8, w = W - 2 * i, h = H - 2 * i;
      const per = 2 * (w - 2 * r) + 2 * (h - 2 * r) + 2 * Math.PI * r;
      const dash = evenDash(per, u * 0.5, u * 0.34);
      const sw = Math.max(1, u * 0.09);
      const prims = [P(roundRectD(i, i, w, h, r), { stroke: c.border, sw, dash, cap: 'round' })];
      const inset = i + u * 1.05;
      return {
        prims, style: 'center', box: { x: inset, y: inset, w: W - 2 * inset, h: H - 2 * inset },
        divider(cx, y, width) {
          const s = u * 0.26, len = Math.min(width * 0.36, u * 6.5), d = u * 0.34, g = u * 0.26, out = [P(diamondD(cx, y, s), { fill: c.border })];
          const n = Math.max(1, Math.floor((len / 2 - s - g) / (d + g)));
          for (let k = 0; k < n; k++) {
            const a = s + g + k * (d + g);
            out.push(P(lineD(cx + a, y, cx + a + d, y), { stroke: c.border, sw: sw * 0.85, cap: 'round' }));
            out.push(P(lineD(cx - a, y, cx - a - d, y), { stroke: c.border, sw: sw * 0.85, cap: 'round' }));
          }
          return { prims: out, h: s * 2 };
        },
      };
    },
  },
  sawtooth: {
    name: 'Sawtooth',
    build(W, H, c, u) {
      const o = u * 0.5, b0 = o + u * 0.32, t = u * 0.82, sw = Math.max(0.7, u * 0.06);
      const prims = [P(rectD(o, o, W - 2 * o, H - 2 * o), { stroke: c.border, sw })];
      const teeth = [];
      const edges = [
        { O: [b0 + t, b0], a: [1, 0], n: [0, 1], L: W - 2 * (b0 + t) },
        { O: [W - b0, b0 + t], a: [0, 1], n: [-1, 0], L: H - 2 * (b0 + t) },
        { O: [W - b0 - t, H - b0], a: [-1, 0], n: [0, -1], L: W - 2 * (b0 + t) },
        { O: [b0, H - b0 - t], a: [0, -1], n: [1, 0], L: H - 2 * (b0 + t) },
      ];
      for (const e of edges) {
        const n = Math.max(3, Math.round(e.L / t)), s = e.L / n;
        for (let k = 0; k < n; k++) {
          const p0 = [e.O[0] + e.a[0] * k * s, e.O[1] + e.a[1] * k * s];
          const p1 = [e.O[0] + e.a[0] * (k + 1) * s, e.O[1] + e.a[1] * (k + 1) * s];
          const p2 = [p1[0] + e.n[0] * t, p1[1] + e.n[1] * t];
          teeth.push(polyD([p0, p1, p2]));
        }
      }
      prims.push(P(teeth.join(''), { fill: c.border }));
      const corners = [[b0, b0], [W - b0 - t, b0], [W - b0 - t, H - b0 - t], [b0, H - b0 - t]].map(([x, y]) => rectD(x, y, t, t)).join('');
      prims.push(P(corners, { fill: c.tint }));
      prims.push(P(rectD(b0, b0, W - 2 * b0, H - 2 * b0), { stroke: c.border, sw }));
      prims.push(P(rectD(b0 + t, b0 + t, W - 2 * (b0 + t), H - 2 * (b0 + t)), { stroke: c.border, sw }));
      const inset = b0 + t + u * 1.0;
      return {
        prims, style: 'center', box: { x: inset, y: inset, w: W - 2 * inset, h: H - 2 * inset },
        divider(cx, y, width) {
          const s = u * 0.46, n = 6, x0 = cx - (n * s) / 2, y0 = y - s / 2, d = [];
          for (let k = 0; k < n; k++) d.push(polyD([[x0 + k * s, y0 + s], [x0 + (k + 1) * s, y0 + s], [x0 + (k + 1) * s, y0]]));
          const len = Math.min(width * 0.42, u * 8), yl = y0 + s;
          const rule = len / 2 > (n * s) / 2 + s ? lineD(cx - len / 2, yl, x0 - s * 0.5, yl) + lineD(x0 + n * s + s * 0.5, yl, cx + len / 2, yl) : '';
          return { prims: [P(d.join(''), { fill: c.border }), ...(rule ? [P(rule, { stroke: c.border, sw })] : [])], h: s };
        },
      };
    },
  },
  cornerstones: {
    name: 'Cornerstones',
    build(W, H, c, u) {
      const o = u * 0.6, t = u * 0.68, sw = Math.max(0.7, u * 0.06);
      const band = rectD(o, o, W - 2 * o, H - 2 * o) + rectD(o + t, o + t, W - 2 * (o + t), H - 2 * (o + t));
      const prims = [
        P(band, { fill: c.tint, rule: 'evenodd' }),
        P(rectD(o, o, W - 2 * o, H - 2 * o), { stroke: c.border, sw }),
        P(rectD(o + t, o + t, W - 2 * (o + t), H - 2 * (o + t)), { stroke: c.border, sw }),
        P([[o, o], [W - o - t, o], [W - o - t, H - o - t], [o, H - o - t]].map(([x, y]) => rectD(x, y, t, t)).join(''), { fill: c.border }),
      ];
      const inset = o + t + u * 0.95;
      return {
        prims, style: 'record', box: { x: inset, y: inset, w: W - 2 * inset, h: H - 2 * inset },
        divider(cx, y, width) { return { prims: [P(lineD(cx - width / 2, y, cx + width / 2, y), { stroke: c.border, sw: sw * 0.9 })], h: sw }; },
      };
    },
  },
  geese: {
    name: 'Flying geese',
    build(W, H, c, u) {
      const o = u * 1.0, gs = u * 0.5, th = gs * 2, sw = Math.max(0.7, u * 0.06);
      const n = Math.max(5, Math.min(11, Math.round((W * 0.36) / gs) | 1));
      const flockW = n * gs, x0 = (W - flockW) / 2, gap = u * 0.35;
      const geese = [];
      for (let k = 0; k < n; k++) {
        const x = x0 + k * gs;
        geese.push(polyD([[x, o - th / 2], [x + gs, o], [x, o + th / 2]]));              // top flock flies right
        geese.push(polyD([[x + gs, H - o - th / 2], [x, H - o], [x + gs, H - o + th / 2]])); // bottom flock flies left
      }
      const frame = [
        lineD(o, o, x0 - gap, o), lineD(x0 + flockW + gap, o, W - o, o), lineD(W - o, o, W - o, H - o),
        lineD(W - o, H - o, x0 + flockW + gap, H - o), lineD(x0 - gap, H - o, o, H - o), lineD(o, H - o, o, o),
      ].join('');
      const prims = [P(frame, { stroke: c.border, sw, join: 'miter' }), P(geese.join(''), { fill: c.border })];
      const sideIn = o + u * 1.0, topIn = o + th / 2 + u * 0.8;
      return {
        prims, style: 'center', box: { x: sideIn, y: topIn, w: W - 2 * sideIn, h: H - 2 * topIn },
        divider(cx, y, width) {
          const s = u * 0.28, len = Math.min(width * 0.3, u * 5);
          return { prims: [P(lineD(cx - len / 2, y, cx - s * 1.6, y) + lineD(cx + s * 1.6, y, cx + len / 2, y), { stroke: c.border, sw }), P(polyD([[cx - s * 0.6, y - s], [cx + s * 0.6, y], [cx - s * 0.6, y + s]]), { fill: c.border })], h: s * 2 };
        },
      };
    },
  },
  scallop: {
    name: 'Scallop',
    build(W, H, c, u) {
      const o = u * 0.5, r0 = u * 0.42, sw = Math.max(0.8, u * 0.075);
      const R = { x: o + r0, y: o + r0, w: W - 2 * (o + r0), h: H - 2 * (o + r0) };
      const nH = Math.max(4, Math.round(R.w / (2 * r0))), rH = R.w / (2 * nH);
      const nV = Math.max(3, Math.round(R.h / (2 * r0))), rV = R.h / (2 * nV);
      let d = `M${f2(R.x)} ${f2(R.y)}`;
      for (let k = 1; k <= nH; k++) d += `A${f2(rH)} ${f2(rH)} 0 0 1 ${f2(R.x + k * 2 * rH)} ${f2(R.y)}`;
      for (let k = 1; k <= nV; k++) d += `A${f2(rV)} ${f2(rV)} 0 0 1 ${f2(R.x + R.w)} ${f2(R.y + k * 2 * rV)}`;
      for (let k = 1; k <= nH; k++) d += `A${f2(rH)} ${f2(rH)} 0 0 1 ${f2(R.x + R.w - k * 2 * rH)} ${f2(R.y + R.h)}`;
      for (let k = 1; k <= nV; k++) d += `A${f2(rV)} ${f2(rV)} 0 0 1 ${f2(R.x)} ${f2(R.y + R.h - k * 2 * rV)}`;
      d += 'Z';
      const ii = o + r0 + Math.max(rH, rV) * 0.9 + u * 0.15;
      const inner = rectD(ii, ii, W - 2 * ii, H - 2 * ii);
      const dot = evenDash(2 * (W - 2 * ii) + 2 * (H - 2 * ii), 0.01, u * 0.3);
      const prims = [P(d, { stroke: c.border, sw }), P(inner, { stroke: c.border, sw: sw * 1.1, dash: dot, cap: 'round' })];
      const inset = ii + u * 0.9;
      return {
        prims, style: 'center', box: { x: inset, y: inset, w: W - 2 * inset, h: H - 2 * inset },
        divider(cx, y) {
          const r = u * 0.22; let dd = `M${f2(cx - 3 * r)} ${f2(y)}`;
          for (let k = 1; k <= 3; k++) dd += `A${f2(r)} ${f2(r)} 0 0 1 ${f2(cx - 3 * r + k * 2 * r)} ${f2(y)}`;
          return { prims: [P(dd, { stroke: c.border, sw: sw * 0.9, cap: 'round' })], h: r * 2 };
        },
      };
    },
  },
  stars: {
    name: 'Stars',
    build(W, H, c, u) {
      const o = u * 0.55, g = u * 0.3, sw1 = Math.max(1.1, u * 0.11), sw2 = Math.max(0.6, u * 0.05);
      const prims = [
        P(rectD(o, o, W - 2 * o, H - 2 * o), { stroke: c.border, sw: sw1, join: 'miter' }),
        P(rectD(o + g, o + g, W - 2 * (o + g), H - 2 * (o + g)), { stroke: c.border, sw: sw2, join: 'miter' }),
      ];
      const inset = o + g + u * 1.0;
      return {
        prims, style: 'center', box: { x: inset, y: inset, w: W - 2 * inset, h: H - 2 * inset },
        divider(cx, y, width) {
          const R = u * 0.3, gapS = u * 0.95, len = Math.min(width * 0.62, u * 11);
          const d = starD(cx - gapS, y, R) + starD(cx, y, R * 1.3) + starD(cx + gapS, y, R);
          const e = gapS + R * 2;
          return { prims: [P(d, { fill: c.border }), P(lineD(cx - len / 2, y, cx - e, y) + lineD(cx + e, y, cx + len / 2, y), { stroke: c.border, sw: sw2 })], h: R * 2.6 };
        },
      };
    },
  },
  logcabin: {
    name: 'Log cabin corners',
    build(W, H, c, u) {
      const o = u * 0.55, s = u * 0.3, n = 3, sw = Math.max(0.6, u * 0.05);
      const prims = [P(rectD(o, o, W - 2 * o, H - 2 * o), { stroke: c.border, sw })];
      // Each corner is a quarter of a log cabin block: nested L-shaped logs, dark and light in turn.
      const dark = [], light = [];
      const corner = (cx, cy, sx, sy) => {
        for (let k = 0; k < n; k++) {
          const len = u * 2.6 - k * u * 0.55, off = k * s;
          const L = [[off, off], [off + len, off], [off + len, off + s], [off + s, off + s], [off + s, off + len], [off, off + len]]
            .map(([x, y]) => [cx + sx * x, cy + sy * y]);
          (k % 2 ? light : dark).push(polyD(L));
        }
        const h0 = n * s; // the hearth square the logs are built around
        dark.push(polyD([[h0, h0], [h0 + s * 1.3, h0], [h0 + s * 1.3, h0 + s * 1.3], [h0, h0 + s * 1.3]].map(([x, y]) => [cx + sx * x, cy + sy * y])));
      };
      const i = o + u * 0.3;
      corner(i, i, 1, 1); corner(W - i, i, -1, 1); corner(W - i, H - i, -1, -1); corner(i, H - i, 1, -1);
      prims.push(P(dark.join(''), { fill: c.border }), P(light.join(''), { fill: c.tint }));
      const inset = o + u * 1.25;
      return {
        prims, style: 'center', box: { x: inset + u * 0.6, y: inset, w: W - 2 * (inset + u * 0.6), h: H - 2 * inset },
        divider(cx, y, width) {
          const q = u * 0.24, len = Math.min(width * 0.3, u * 5);
          return { prims: [P(rectD(cx - q, y - q, 2 * q, 2 * q), { fill: c.border }), P(lineD(cx - len / 2, y, cx - q * 2.2, y) + lineD(cx + q * 2.2, y, cx + len / 2, y), { stroke: c.border, sw })], h: q * 2 };
        },
      };
    },
  },
  simple: {
    name: 'Fine line',
    build(W, H, c, u) {
      const o = u * 0.7, sw = Math.max(0.6, u * 0.05);
      const inset = o + u * 1.0;
      return {
        prims: [P(rectD(o, o, W - 2 * o, H - 2 * o), { stroke: c.border, sw })], style: 'center', box: { x: inset, y: inset, w: W - 2 * inset, h: H - 2 * inset },
        divider(cx, y, width) { const len = Math.min(width * 0.18, u * 3); return { prims: [P(lineD(cx - len / 2, y, cx + len / 2, y), { stroke: c.border, sw })], h: sw }; },
      };
    },
  },
};
export const LAYOUT_IDS = Object.keys(LAYOUTS);

/* ------------------------------------------------------------------ content */
function contentBlocks(spec, L) {
  const f = spec.fields || {};
  const q = spec.qov || {};
  const has = v => String(v || '').trim() !== '';
  const T = v => smartQuotes(String(v || '').trim());
  const blocks = [];
  const meta = (place, date) => [T(place), T(date)].filter(Boolean).join(' · ');
  if (spec.kind === 'qov') {
    blocks.push({ kind: 'title', text: 'Quilt of Valor', mark: q.mark !== false });
    blocks.push({ kind: 'divider' });
    blocks.push({ kind: 'person', lead: 'Awarded to', name: T(q.awardee), blank: !has(q.awardee) });
    for (const m of qovMakerLines(q)) blocks.push({ kind: 'person', lead: m.lead, name: T(m.name) });
    if (has(q.place) || has(q.date)) blocks.push({ kind: 'meta', text: meta(q.place, q.date), lead: 'Awarded', place: T(q.place), date: T(q.date) });
    if (has(q.message)) blocks.push({ kind: 'message', text: T(q.message) });
    if (has(q.donor)) blocks.push({ kind: 'small', text: `Label printing donated by ${T(q.donor)}` });
    if (has(q.care)) blocks.push({ kind: 'care', text: T(q.care) });
    return blocks;
  }
  if (has(f.title)) blocks.push({ kind: 'title', text: T(f.title) });
  const people = [];
  if (has(f.for)) people.push({ kind: 'person', lead: T(f.forLead || 'Made for'), name: T(f.for) });
  if (has(f.by)) people.push({ kind: 'person', lead: T(f.byLead || 'Made by'), name: T(f.by) });
  if (blocks.length && (people.length || has(f.place) || has(f.date) || has(f.message))) blocks.push({ kind: 'divider' });
  blocks.push(...people);
  if (has(f.place) || has(f.date)) blocks.push({ kind: 'meta', text: meta(f.place, f.date), place: T(f.place), date: T(f.date) });
  if (has(f.message)) blocks.push({ kind: 'message', text: T(f.message) });
  if (has(f.care)) blocks.push({ kind: 'care', text: T(f.care) });
  return blocks;
}

function wrap(face, size, text, maxW) {
  const out = [];
  for (const para of String(text).split(/\n/)) {
    const words = para.split(/\s+/).filter(Boolean);
    if (!words.length) { out.push(''); continue; }
    let line = words[0];
    for (let i = 1; i < words.length; i++) {
      const t = line + ' ' + words[i];
      if (textWidth(face, size, t) <= maxW) line = t; else { out.push(line); line = words[i]; }
    }
    out.push(line);
  }
  return out;
}

/* A laid-out line: runs share one baseline. Each run: { text?, blank?, face, size, color, dy?, track? } */
function runsWidth(runs) {
  return runs.reduce((s, r) => s + (r.blank ? r.blank : r.track ? trackedWidth(r) : textWidth(r.face, r.size, r.text)), 0);
}
function trackedWidth(r) { let w = 0; for (const ch of r.text) w += textWidth(r.face, r.size, ch) + r.track; return w - r.track; }

/**
 * Lay out the label. spec = { w, h, layout, lettering, borderInk, textInk, kind: 'quilt'|'qov', fields, qov }.
 * Returns { prims, box, scale, minText, overflow, warnings }.
 */
export function layoutLabel(spec) {
  const W = spec.w, H = spec.h;
  const u = Math.max(8.5, Math.min(15, Math.min(W, H) * 0.045));
  const border = inkHex(spec.borderInk), text = inkHex(spec.textInk);
  const colors = { border, text, tint: tint(border, 0.2), tint2: tint(border, 0.07) };
  const layout = LAYOUTS[spec.layout] || LAYOUTS.stitched;
  const B0 = layout.build(W, H, colors, u);
  const L = LETTERING[spec.lettering] || LETTERING.script;
  const F = k => FACES[L[k]];
  const blocks = contentBlocks(spec, L);
  const box = B0.box;
  const record = B0.style === 'record';
  const align = record ? 'left' : 'center';
  const base = Math.max(6, Math.min(14, Math.min(box.h / 9, box.w / 15)));

  function build(k) {
    const B = base * k;
    const items = [];  // { h, gap, bottom, draw(y) -> prims }
    let overflow = false;
    const lineItem = (runs, face, gap, opts = {}) => {
      const lh = Math.max(...runs.map(r => r.size * (r.face.lh || 1.3)));
      const w = runsWidth(runs);
      if (w > box.w + 0.01) overflow = true;
      items.push({
        h: lh, gap, bottom: !!opts.bottom,
        draw(y) {
          let x = align === 'center' ? box.x + (box.w - w) / 2 : box.x + (opts.indent || 0);
          const big = runs.reduce((m, r) => (r.size > m.size ? r : m), runs[0]);
          const baseY = y + lh / 2 + big.size * (big.face.bo || 0.33);
          const out = [];
          for (const r of runs) {
            const rw = r.blank ? r.blank : r.track ? trackedWidth(r) : textWidth(r.face, r.size, r.text);
            if (r.blank) out.push({ t: 'path', d: lineD(x, baseY + r.size * 0.12, x + rw, baseY + r.size * 0.12), stroke: r.color, sw: Math.max(0.6, r.size * 0.06) });
            else out.push({ t: 'text', x, y: baseY + (r.dy || 0), text: r.text, face: r.face, size: r.size, fill: r.color, opacity: r.opacity, track: r.track });
            x += rw;
          }
          return out;
        },
      });
    };
    const paraItems = (textStr, face, size, gap, maxLines, opts = {}) => {
      const lines = wrap(face, size, textStr, box.w - (opts.indent || 0));
      if (lines.length > maxLines) overflow = true;
      lines.forEach((ln, i) => {
        if (textWidth(face, size, ln) > box.w - (opts.indent || 0) + 0.01) overflow = true;
        lineItem([{ text: ln, face, size, color: opts.color || text, opacity: opts.opacity }], face, i === 0 ? gap : 0, opts);
      });
    };
    const capsRun = (s, size, color) => {
      const face = F('caps');
      return L.upper ? { text: s.toUpperCase(), face, size: size * 0.78, color, track: size * 0.12, opacity: 0.88 } : { text: s, face, size: size * face.k, color, opacity: 0.88 };
    };
    const minSizes = [];
    let prevKind = null;
    for (const b of blocks) {
      const g = items.length ? B * 0.42 : 0;
      if (b.kind === 'title') {
        const face = F('title'), size = B * 2.3 * face.k * (L.titleK || 1);
        const lines = wrap(face, size, b.text, box.w);
        if (lines.length > 2) overflow = true;
        lines.forEach((ln, i) => {
          const runs = [{ text: ln, face, size, color: text }];
          if (b.mark && i === lines.length - 1) runs.push({ text: '®', face: F('text'), size: size * 0.32, color: text, dy: -size * 0.42 });
          lineItem(runs, face, i === 0 ? g : -size * 0.08);
        });
        if (record) { const dv = B0.divider(box.x + box.w / 2, 0, box.w); items.push({ h: dv.h, gap: B * 0.5, draw: y => shiftPrims(dv.prims, 0, y + dv.h / 2) }); }
      } else if (b.kind === 'divider') {
        if (record) continue;
        const dv = B0.divider(box.x + box.w / 2, 0, box.w);
        items.push({ h: dv.h, gap: B * 0.55, draw: y => shiftPrims(dv.prims, 0, y + dv.h / 2) });
        prevKind = 'divider';
        continue;
      } else if (b.kind === 'person') {
        const gap = prevKind === 'person' ? B * 0.18 : prevKind === 'divider' ? B * 0.55 : g;
        if (record) {
          recordRow(b.lead, b.blank ? null : b.name, gap, 'names');
        } else {
          const lead = { text: b.lead + ' ', face: F('lead'), size: B * F('lead').k, color: text };
          const nameFace = F('names');
          const name = b.blank ? { blank: Math.min(box.w * 0.5, B * 11), face: nameFace, size: B * 1.3 * nameFace.k, color: text } : { text: b.name, face: nameFace, size: B * 1.3 * nameFace.k, color: text };
          const runs = [lead, name];
          if (runsWidth(runs) <= box.w) lineItem(runs, nameFace, gap);
          else {
            lineItem([{ ...lead, text: b.lead }], lead.face, gap);
            if (name.blank) lineItem([name], nameFace, 0);
            else paraItems(b.name, nameFace, name.size, -B * 0.05, 2);
          }
        }
        minSizes.push(B * F('lead').k);
      } else if (b.kind === 'meta') {
        const gap = prevKind === 'person' ? B * 0.4 : g;
        if (record) {
          if (b.date) recordRow(spec.kind === 'qov' ? 'Awarded' : 'Date', b.date, gap, 'text');
          if (b.place) recordRow('Place', b.place, b.date ? B * 0.18 : gap, 'text');
        } else paraItems(b.text, F('text'), B * 0.92 * F('text').k, gap, 2);
        minSizes.push(B * 0.92 * F('text').k);
      } else if (b.kind === 'message') {
        const face = F('message');
        paraItems(b.text, face, B * 0.98 * face.k, prevKind ? B * 0.6 : 0, 8, { align });
        minSizes.push(B * 0.98 * face.k);
      } else if (b.kind === 'small') {
        paraItems(b.text, F('text'), B * 0.7 * F('text').k, B * 0.5, 2, { opacity: 0.85 });
      } else if (b.kind === 'care') {
        paraItems(b.text, F('text'), B * 0.72 * F('text').k, B * 0.6, 3, { bottom: true, opacity: 0.85 });
        minSizes.push(B * 0.72 * F('text').k);
      }
      prevKind = b.kind;
    }

    function recordRow(leadText, value, gap, faceKey) {
      const lead = capsRun(leadText, B * 0.95, text);
      const leadCol = Math.max(...[...blocks.filter(x => x.kind === 'person').map(x => x.lead), 'Place', spec.kind === 'qov' ? 'Awarded' : 'Date']
        .map(s => runsWidth([capsRun(s, B * 0.95, text)]))) + B * 0.8;
      const face = F(faceKey), size = (faceKey === 'names' ? B * 1.18 : B * 0.95) * face.k;
      const valueW = box.w - leadCol;
      if (valueW < box.w * 0.42) { // too narrow: lead above value
        lineItem([lead], lead.face, gap);
        if (value == null) lineItem([{ blank: box.w * 0.7, face, size, color: text }], face, 0);
        else paraItems(value, face, size, 0, 2);
        return;
      }
      const lines = value == null ? [null] : wrap(face, size, value, valueW);
      if (lines.length > 2) overflow = true;
      lines.forEach((ln, i) => {
        if (ln != null && textWidth(face, size, ln) > valueW + 0.01) overflow = true;
        const lh = size * face.lh;
        items.push({
          h: lh, gap: i === 0 ? gap : 0,
          draw(y) {
            const baseY = y + lh / 2 + size * face.bo;
            const out = [];
            if (i === 0) out.push({ t: 'text', x: box.x, y: baseY, text: lead.text, face: lead.face, size: lead.size, fill: text, opacity: lead.opacity, track: lead.track });
            if (ln == null) out.push({ t: 'path', d: lineD(box.x + leadCol, baseY + size * 0.12, box.x + box.w, baseY + size * 0.12), stroke: text, sw: Math.max(0.6, size * 0.05) });
            else out.push({ t: 'text', x: box.x + leadCol, y: baseY, text: ln, face, size, fill: text });
            return out;
          },
        });
      });
    }

    const main = items.filter(i => !i.bottom), foot = items.filter(i => i.bottom);
    const hOf = arr => arr.reduce((s, it, idx) => s + it.h + (idx ? it.gap : 0), 0);
    const mainH = hOf(main), footH = hOf(foot), footGap = foot.length && main.length ? foot[0].gap : 0;
    const total = mainH + footH + footGap;
    if (total > box.h + 0.01) overflow = true;
    return { items, main, foot, mainH, footH, footGap, overflow, minText: minSizes.length ? Math.min(...minSizes) : B };
  }

  let lo = 0.3, hi = 1, best = null;
  const top = build(1);
  if (!top.overflow) best = { k: 1, r: top };
  else {
    for (let it = 0; it < 14; it++) {
      const mid = (lo + hi) / 2, r = build(mid);
      if (r.overflow) hi = mid; else { lo = mid; best = { k: mid, r }; }
    }
  }
  const overflow = !best;
  if (!best) best = { k: 0.3, r: build(0.3) };
  const { main, foot, mainH, footH, footGap } = best.r;
  const prims = [...B0.prims];
  const avail = box.h - footH - (foot.length ? footGap : 0);
  let y = box.y + Math.max(0, (avail - mainH) / 2);
  main.forEach((it, idx) => { if (idx) y += it.gap; prims.push(...it.draw(y)); y += it.h; });
  let fy = box.y + box.h - footH;
  foot.forEach((it, idx) => { if (idx) fy += it.gap; prims.push(...it.draw(fy)); fy += it.h; });
  const warnings = [];
  if (overflow) warnings.push('The words don’t fit. Shorten the message or make the label bigger.');
  else if (best.r.minText < 7) warnings.push(`The smallest text is ${best.r.minText.toFixed(1)} pt, which can blur on fabric. A bigger label or fewer words will help.`);
  return { prims, box, scale: best.k, minText: best.r.minText, overflow, warnings, colors, u };
}

function shiftPrims(prims, dx, dy) {
  return prims.map(p => (p.t === 'path' ? { ...p, tx: (p.tx || 0) + dx, ty: (p.ty || 0) + dy } : { ...p, x: p.x + dx, y: p.y + dy }));
}

/* ------------------------------------------------------------------ renderers */
const esc = s => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

/** SVG markup for a laid-out label (no outer <svg>), in label points. */
export function toSvg(res) {
  let out = '';
  for (const p of res.prims) {
    if (p.t === 'path') {
      const tr = p.tx || p.ty ? ` transform="translate(${f2(p.tx || 0)} ${f2(p.ty || 0)})"` : '';
      out += `<path d="${p.d}"${tr} fill="${p.fill || 'none'}"${p.rule ? ` fill-rule="${p.rule}"` : ''}${p.stroke ? ` stroke="${p.stroke}" stroke-width="${f2(p.sw || 1)}"` : ''}${p.dash ? ` stroke-dasharray="${p.dash.map(f2).join(' ')}"` : ''}${p.cap ? ` stroke-linecap="${p.cap}"` : ''}${p.join ? ` stroke-linejoin="${p.join}"` : ''}/>`;
    } else {
      const fc = p.face;
      const attrs = `font-family="'${fc.family}'" font-size="${f2(p.size)}" font-weight="${fc.weight}"${fc.style === 'italic' ? ' font-style="italic"' : ''} fill="${p.fill}"${p.opacity && p.opacity < 1 ? ` fill-opacity="${p.opacity}"` : ''}`;
      if (p.track) {
        let x = p.x; const xs = [];
        for (const ch of p.text) { xs.push(f2(x)); x += textWidth(fc, p.size, ch) + p.track; }
        out += `<text x="${xs.join(' ')}" y="${f2(p.y)}" ${attrs}>${esc(p.text)}</text>`;
      } else out += `<text x="${f2(p.x)}" y="${f2(p.y)}" ${attrs} xml:space="preserve">${esc(p.text)}</text>`;
    }
  }
  return out;
}

/** Draw a laid-out label on a 2D canvas context already scaled to points. */
export function drawCanvas(ctx, res) {
  for (const p of res.prims) {
    ctx.save();
    if (p.t === 'path') {
      if (p.tx || p.ty) ctx.translate(p.tx || 0, p.ty || 0);
      const path = new Path2D(p.d);
      if (p.fill && p.fill !== 'none') { ctx.fillStyle = p.fill; ctx.fill(path, p.rule || 'nonzero'); }
      if (p.stroke) {
        ctx.strokeStyle = p.stroke; ctx.lineWidth = p.sw || 1; ctx.lineCap = p.cap || 'butt'; ctx.lineJoin = p.join || 'miter';
        ctx.setLineDash(p.dash || []); ctx.stroke(path);
      }
    } else {
      ctx.font = fontCss(p.face, p.size);
      ctx.fillStyle = p.fill; ctx.globalAlpha = p.opacity || 1; ctx.textBaseline = 'alphabetic'; ctx.textAlign = 'left';
      if (p.track) { let x = p.x; for (const ch of p.text) { ctx.fillText(ch, x, p.y); x += textWidth(p.face, p.size, ch) + p.track; } }
      else ctx.fillText(p.text, p.x, p.y);
    }
    ctx.restore();
  }
}

/** A small preview of a layout's border with grey bars for text (for the layout picker). */
export function thumbSvg(layoutId, borderInk) {
  const W = 216, H = 144, u = Math.max(8.5, Math.min(15, Math.min(W, H) * 0.045));
  const border = inkHex(borderInk);
  const b = LAYOUTS[layoutId].build(W, H, { border, text: border, tint: tint(border, 0.2), tint2: tint(border, 0.07) }, u);
  const res = { prims: b.prims };
  const cx = W / 2, bx = b.box;
  const bar = (w, y, h = 5, o = 0.5) => b.style === 'record'
    ? `<rect x="${f2(bx.x)}" y="${f2(y)}" width="${f2(w)}" height="${h}" rx="${h / 2}" fill="${border}" fill-opacity="${o}"/>`
    : `<rect x="${f2(cx - w / 2)}" y="${f2(y)}" width="${f2(w)}" height="${h}" rx="${h / 2}" fill="${border}" fill-opacity="${o}"/>`;
  const my = bx.y + bx.h / 2;
  let inner = bar(bx.w * 0.62, my - 26, 9, 0.75) + bar(bx.w * 0.5, my - 4) + bar(bx.w * 0.42, my + 7) + bar(bx.w * 0.56, my + 18, 4, 0.35);
  return `<svg viewBox="0 0 ${W} ${H}" aria-hidden="true"><rect width="${W}" height="${H}" fill="#fff"/>${toSvg(res)}${inner}</svg>`;
}
