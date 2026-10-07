/* Print Only Your Size: PDF engine.
 *
 * Takes a layered PDF (optional content groups) and writes a copy in which the layers
 * you switched off are really gone from the page drawing, so every viewer prints only
 * what you chose, including Apple Preview and iPad, which ignore layer settings.
 *
 * How: each page's content stream is tokenised. Inside marked content that belongs to a
 * hidden layer (/OC /MCx BDC … EMC), painting operators are removed while every
 * graphics-state operator (q/Q, cm, colours, clipping, text positioning) is kept, which is
 * exactly how the PDF spec says a viewer must treat hidden content. Form XObjects are
 * filtered recursively; images, forms and annotations tagged with a hidden layer are dropped.
 * Page boxes are never touched, so scale stays 100%.
 *
 * No DOM access: the same module runs in the browser and in Node tests.
 * Pass the pdf-lib namespace (window.PDFLib or the npm package) to the exported functions.
 */

/* ------------------------------------------------------------------ lexer */

const WS = new Uint8Array(256);
for (const c of [0, 9, 10, 12, 13, 32]) WS[c] = 1;
const DL = new Uint8Array(256);
for (const c of '()<>[]{}/%') DL[c.charCodeAt(0)] = 1;

const T_EOF = 0, T_NUM = 1, T_NAME = 2, T_STR = 3, T_AOPEN = 4, T_ACLOSE = 5, T_DOPEN = 6, T_DCLOSE = 7, T_KW = 8;
const T_COMPOSITE = 9;

function ascii(b, s, e) {
  let out = '';
  for (let i = s; i < e; i++) out += String.fromCharCode(b[i]);
  return out;
}

class Lexer {
  constructor(b) { this.b = b; this.n = b.length; this.p = 0; this.s = 0; this.e = 0; }
  next() {
    const b = this.b, n = this.n;
    let p = this.p;
    for (;;) {
      if (p >= n) break;
      const c = b[p];
      if (WS[c]) { p++; continue; }
      if (c === 37) { while (p < n && b[p] !== 10 && b[p] !== 13) p++; continue; }
      break;
    }
    this.s = p;
    if (p >= n) { this.p = this.e = p; return T_EOF; }
    const c = b[p];
    if (c === 47) { // /Name
      p++;
      while (p < n && !WS[b[p]] && !DL[b[p]]) p++;
      this.p = this.e = p; return T_NAME;
    }
    if (c === 40) { // (literal string)
      let depth = 1; p++;
      while (p < n && depth) {
        const d = b[p++];
        if (d === 92) p++;
        else if (d === 40) depth++;
        else if (d === 41) depth--;
      }
      this.p = this.e = Math.min(p, n); return T_STR;
    }
    if (c === 60) {
      if (b[p + 1] === 60) { this.p = this.e = p + 2; return T_DOPEN; }
      p++;
      while (p < n && b[p] !== 62) p++;
      this.p = this.e = Math.min(p + 1, n); return T_STR;
    }
    if (c === 62) {
      if (b[p + 1] === 62) { this.p = this.e = p + 2; return T_DCLOSE; }
      this.p = this.e = p + 1; return T_KW;
    }
    if (c === 91) { this.p = this.e = p + 1; return T_AOPEN; }
    if (c === 93) { this.p = this.e = p + 1; return T_ACLOSE; }
    if (c === 123 || c === 125 || c === 41) { this.p = this.e = p + 1; return T_KW; }
    while (p < n && !WS[b[p]] && !DL[b[p]]) p++;
    if (p === this.s) p++; // never stall on an unexpected byte
    this.p = this.e = p;
    if ((c >= 48 && c <= 57) || c === 43 || c === 45 || c === 46) return T_NUM;
    return T_KW;
  }
}

// Byte length of an unfiltered inline image, or -1 when it can't be known up front.
function inlineImageLength(dict) {
  if (dict.F || dict.Filter) return -1;
  const w = +(dict.W ?? dict.Width), h = +(dict.H ?? dict.Height);
  if (!(w > 0 && h > 0)) return -1;
  const mask = dict.IM === 'true' || dict.ImageMask === 'true';
  let bpc = mask ? 1 : +(dict.BPC ?? dict.BitsPerComponent ?? 8);
  let comps = 1;
  if (!mask) {
    const cs = String(dict.CS ?? dict.ColorSpace ?? '');
    if (/^\/?(RGB|DeviceRGB|CalRGB)$/.test(cs)) comps = 3;
    else if (/^\/?(CMYK|DeviceCMYK)$/.test(cs)) comps = 4;
    else if (/^\/?(G|DeviceGray|CalGray|I|Indexed)$/.test(cs) || cs.startsWith('[')) comps = 1;
    else return -1;
  }
  return Math.ceil((w * comps * bpc) / 8) * h;
}

// Skips the binary data of an inline image. `p` is just after the ID keyword.
// Returns the offset just after "EI".
function skipInlineImage(b, p, dict) {
  const n = b.length;
  if (WS[b[p]]) p++; // exactly one white-space byte after ID
  const len = inlineImageLength(dict);
  if (len >= 0) {
    let q = p + len;
    while (q < n && WS[b[q]]) q++;
    if (b[q] === 69 && b[q + 1] === 73 && (q + 2 >= n || WS[b[q + 2]] || DL[b[q + 2]])) return q + 2;
  }
  // Search for whitespace + "EI" + delimiter, followed by something that looks like content-stream text.
  for (let q = p; q < n - 1; q++) {
    if (b[q] === 69 && b[q + 1] === 73 && (q === p || WS[b[q - 1]]) && (q + 2 >= n || WS[b[q + 2]])) {
      let ok = true;
      for (let k = q + 2, m = Math.min(n, q + 40); k < m; k++) {
        const c = b[k];
        if (c > 127 || (c < 32 && !WS[c])) { ok = false; break; }
      }
      if (ok) return q + 2;
    }
  }
  return n;
}

/* ------------------------------------------------------------------ writer */

class Out {
  constructor(cap) { this.a = new Uint8Array(Math.max(4096, cap | 0)); this.n = 0; }
  ensure(k) {
    if (this.n + k <= this.a.length) return;
    let c = this.a.length * 2;
    while (c < this.n + k) c *= 2;
    const a = new Uint8Array(c); a.set(this.a.subarray(0, this.n)); this.a = a;
  }
  copy(src, s, e) { if (e <= s) return; const k = e - s; this.ensure(k); this.a.set(src.subarray(s, e), this.n); this.n += k; }
  text(t) {
    this.ensure(t.length + 2);
    this.a[this.n++] = 10;
    for (let i = 0; i < t.length; i++) this.a[this.n++] = t.charCodeAt(i) & 255;
    this.a[this.n++] = 10;
  }
  bytes() { return this.a.subarray(0, this.n); }
}

const fmt = v => {
  if (!isFinite(v)) return '0';
  const r = Math.round(v * 10000) / 10000;
  return String(r === 0 ? 0 : r);
};

/* ------------------------------------------------------------------ content filter */

const PATH_OPS = new Set(['m', 'l', 'c', 'v', 'y', 'h', 're']);
const PAINT_OPS = new Set(['S', 's', 'f', 'F', 'f*', 'B', 'B*', 'b', 'b*', 'n']);
const TEXT_SHOW = new Set(['Tj', 'TJ', "'", '"']);

/**
 * Rewrites one content stream.
 * env.propHidden(name) -> true if /OC /name BDC starts hidden content
 * env.xobject(name) -> 'drop' | 'keep' (and filters forms recursively)
 * env.lineScale -> multiply every line width (projector output), 0/1 = off
 * Returns { bytes, changed, qDepth }.
 */
export function filterContent(src, env) {
  const lex = new Lexer(src);
  const out = new Out(src.length + 256);
  const scale = env.lineScale && env.lineScale !== 1 ? env.lineScale : 0;
  let pend = 0;          // start of the source region not yet copied to out
  let changed = false;
  const mc = [];         // marked-content stack: true = this level hides content
  let hidden = 0;        // number of hiding levels currently open
  let tr = 0; const trStack = [];
  let qDepth = 0;
  let pathStart = -1, pathClip = false;

  // operands of the current operator
  const oT = [], oS = [], oE = [];
  let nOps = 0, opStart = -1;

  const flush = upto => { if (upto > pend) out.copy(src, pend, upto); };
  const drop = (s, e) => { flush(s); pend = e; changed = true; };
  const replace = (s, e, text) => { flush(s); out.text(text); pend = e; changed = true; };
  const num = i => parseFloat(ascii(src, oS[i], oE[i]));
  const name = i => ascii(src, oS[i] + 1, oE[i]);

  for (;;) {
    const t = lex.next();
    if (t === T_EOF) break;
    if (opStart < 0) opStart = lex.s;
    if (t === T_AOPEN || t === T_DOPEN) { // composite operand: read to the matching close
      const s = lex.s; let depth = 1;
      while (depth > 0) {
        const u = lex.next();
        if (u === T_EOF) break;
        if (u === T_AOPEN || u === T_DOPEN) depth++;
        else if (u === T_ACLOSE || u === T_DCLOSE) depth--;
      }
      oT[nOps] = T_COMPOSITE; oS[nOps] = s; oE[nOps] = lex.e; nOps++;
      continue;
    }
    if (t !== T_KW) { oT[nOps] = t; oS[nOps] = lex.s; oE[nOps] = lex.e; nOps++; continue; }

    const ks = lex.s, ke = lex.e;
    const len = ke - ks;
    let op;
    if (len === 1) op = String.fromCharCode(src[ks]);
    else if (len === 2) op = String.fromCharCode(src[ks], src[ks + 1]);
    else if (len === 3) op = String.fromCharCode(src[ks], src[ks + 1], src[ks + 2]);
    else op = ascii(src, ks, ke);
    if (op === 'true' || op === 'false' || op === 'null') { oT[nOps] = T_NUM; oS[nOps] = ks; oE[nOps] = ke; nOps++; continue; }

    const s = opStart; let e = ke;
    opStart = -1;

    if (op === 'BI') { // inline image: BI <dict> ID <data> EI
      const dict = {}; let key = null;
      for (;;) {
        const u = lex.next();
        if (u === T_EOF) break;
        if (u === T_KW && lex.e - lex.s === 2 && src[lex.s] === 73 && src[lex.s + 1] === 68) break; // ID
        let val;
        if (u === T_AOPEN || u === T_DOPEN) {
          const vs = lex.s; let depth = 1;
          while (depth > 0) { const w = lex.next(); if (w === T_EOF) break; if (w === T_AOPEN || w === T_DOPEN) depth++; else if (w === T_ACLOSE || w === T_DCLOSE) depth--; }
          val = ascii(src, vs, lex.e);
        } else val = ascii(src, lex.s, lex.e);
        if (key === null) key = val.replace(/^\//, ''); else { dict[key] = val; key = null; }
      }
      e = skipInlineImage(src, lex.p, dict);
      lex.p = e;
      if (hidden) drop(s, e);
      nOps = 0; continue;
    }

    switch (op) {
      case 'BDC': {
        let hides = false;
        if (nOps >= 2 && oT[0] === T_NAME && ascii(src, oS[0], oE[0]) === '/OC' && oT[1] === T_NAME) {
          hides = !!env.propHidden(name(1));
        }
        mc.push(hides); if (hides) hidden++;
        break;
      }
      case 'BMC': mc.push(false); break;
      case 'EMC':
        if (mc.length) {
          if (pathStart >= 0) { pathStart = -1; pathClip = false; } // malformed: path left open, keep as is
          if (mc.pop()) hidden--;
        }
        break;
      case 'q': qDepth++; trStack.push(tr); break;
      case 'Q': if (qDepth > 0) { qDepth--; tr = trStack.pop(); } break;
      case 'Tr': if (nOps) tr = num(nOps - 1) | 0; break;
      case 'w':
        if (scale && nOps) {
          const v = num(nOps - 1);
          replace(s, e, `${fmt((v > 0 ? v : 0.35) * scale)} w`);
        }
        break;
      default: break;
    }

    if (hidden) {
      if (PATH_OPS.has(op)) {
        if (pathStart < 0) { pathStart = s; pathClip = false; }
      } else if (op === 'W' || op === 'W*') {
        if (pathStart < 0) { pathStart = s; }
        pathClip = true;
      } else if (PAINT_OPS.has(op)) {
        if (pathStart >= 0 && pathClip) {
          if (op !== 'n') replace(s, e, 'n'); // keep the clip, paint nothing
        } else if (pathStart >= 0) {
          drop(pathStart, e);
        } else if (op !== 'n') {
          drop(s, e);
        }
        pathStart = -1; pathClip = false;
      } else if (TEXT_SHOW.has(op)) {
        // Keep the text (it advances the text position) but make it invisible.
        // Rendering mode 3 = neither fill nor stroke; 7 = add to clip only.
        const mode = tr >= 4 ? 7 : 3;
        flush(s); out.text(`${mode} Tr`); out.copy(src, s, e); out.text(`${tr} Tr`); pend = e; changed = true;
      } else if (op === 'Do' || op === 'sh') {
        drop(s, e);
      }
    } else if (op === 'Do' && nOps) {
      if (env.xobject(name(nOps - 1)) === 'drop') drop(s, e);
    }
    nOps = 0;
  }
  flush(src.length);
  return { bytes: out.bytes(), changed, qDepth };
}

/* ------------------------------------------------------------------ helpers on pdf-lib objects */

export function ocgId(ref) {
  return ref.generationNumber ? `${ref.objectNumber}R${ref.generationNumber}` : `${ref.objectNumber}R`;
}

function libParts(L) {
  const N = s => L.PDFName.of(s);
  return {
    N,
    isRef: o => o instanceof L.PDFRef,
    isDict: o => o instanceof L.PDFDict,
    isArr: o => o instanceof L.PDFArray,
    isNum: o => o instanceof L.PDFNumber,
    isStream: o => o instanceof L.PDFStream,
  };
}

function decodeStream(L, stream) {
  if (stream instanceof L.PDFRawStream) {
    const filter = stream.dict.lookup(L.PDFName.of('Filter'));
    if (!filter) return stream.contents;
    return L.decodePDFRawStream(stream).decode();
  }
  if (typeof stream.getUnencodedContents === 'function') return stream.getUnencodedContents();
  return stream.getContents();
}

function concatBytes(parts) {
  if (parts.length === 1) return parts[0];
  let n = 0; for (const p of parts) n += p.length + 1;
  const out = new Uint8Array(n); let o = 0;
  for (const p of parts) { out.set(p, o); o += p.length; out[o++] = 10; }
  return out;
}

const tick = () => new Promise(r => setTimeout(r, 0));

/** Visibility evaluator for OCGs and OCMDs (policy and visibility expressions). */
function makeOcEval(L, ctx, isOn) {
  const { N, isRef, isDict, isArr } = libParts(L);
  const cache = new Map();
  function ve(arr, depth) {
    if (depth > 12 || arr.size() < 2) return true;
    const opName = arr.lookup(0);
    const op = opName && opName.asString ? opName.asString().replace('/', '') : String(opName).replace('/', '');
    const vals = [];
    for (let i = 1; i < arr.size(); i++) {
      const raw = arr.get(i);
      if (isRef(raw)) {
        const obj = ctx.lookup(raw);
        vals.push(isArr(obj) ? ve(obj, depth + 1) : isOn(ocgId(raw)));
      } else if (isArr(raw)) vals.push(ve(raw, depth + 1));
    }
    if (op === 'Not') return !vals[0];
    if (op === 'And') return vals.every(Boolean);
    if (op === 'Or') return vals.some(Boolean);
    return true;
  }
  function visible(o) {
    let key = null;
    if (isRef(o)) { key = o.tag; if (cache.has(key)) return cache.get(key); }
    const obj = isRef(o) ? ctx.lookup(o) : o;
    let v = true;
    if (isDict(obj)) {
      const type = obj.get(N('Type'));
      if (type === N('OCMD')) {
        const VE = obj.lookup(N('VE'));
        if (isArr(VE)) v = ve(VE, 0);
        else {
          const raw = obj.get(N('OCGs'));
          const refs = isRef(raw) && !isArr(ctx.lookup(raw)) ? [raw] : (() => {
            const a = isArr(raw) ? raw : (isRef(raw) ? ctx.lookup(raw) : null);
            return a && isArr(a) ? a.asArray().filter(isRef) : [];
          })();
          if (refs.length) {
            const states = refs.map(r => isOn(ocgId(r)));
            const P = obj.get(N('P'));
            const policy = P ? P.asString().replace('/', '') : 'AnyOn';
            if (policy === 'AllOn') v = states.every(Boolean);
            else if (policy === 'AnyOff') v = states.some(s => !s);
            else if (policy === 'AllOff') v = states.every(s => !s);
            else v = states.some(Boolean);
          }
        }
      } else if (isRef(o)) {
        v = isOn(ocgId(o));
      }
    }
    if (key) cache.set(key, v);
    return v;
  }
  return visible;
}

/* ------------------------------------------------------------------ geometry */

export const PAPERS = {
  a4: { w: 595.276, h: 841.89, label: 'A4' },
  letter: { w: 612, h: 792, label: 'US Letter' },
};

/** Tile plan for a displayed sheet (pt). Chooses the orientation that needs fewer pages. */
export function planTiles(sheetW, sheetH, paperKey, margin, overlap) {
  const paper = PAPERS[paperKey] || PAPERS.a4;
  const one = (pw, ph, orientation) => {
    const cw = pw - 2 * margin, ch = ph - 2 * margin;
    const stepX = cw - overlap, stepY = ch - overlap;
    const count = (total, c, step) => total <= c + 0.5 ? 1 : Math.ceil((total - c - 0.5) / step) + 1;
    const cols = count(sheetW, cw, stepX), rows = count(sheetH, ch, stepY);
    return { pw, ph, cw, ch, stepX, stepY, cols, rows, n: cols * rows, orientation, margin, overlap, paper: paperKey, paperLabel: paper.label };
  };
  const p = one(paper.w, paper.h, 'portrait');
  const l = one(paper.h, paper.w, 'landscape');
  return l.n < p.n ? l : p;
}

/** Window of a tile in displayed-sheet coordinates (origin bottom-left, pt). */
export function tileWindow(plan, sheetH, r, c) {
  const x0 = c * plan.stepX;
  const top = sheetH - r * plan.stepY;
  return { x0, x1: x0 + plan.cw, y0: top - plan.ch, y1: top };
}

export function rowLabel(r) {
  let s = ''; r += 1;
  while (r > 0) { const m = (r - 1) % 26; s = String.fromCharCode(65 + m) + s; r = Math.floor((r - 1) / 26); }
  return s;
}

/** Page geometry: crop box, rotation and user unit, plus the matrix from user space to displayed space. */
function pageGeometry(L, node) {
  const { N, isNum } = libParts(L);
  const nums = arr => arr.asArray().map(x => { const v = node.context.lookup(x); return isNum(v) ? v.asNumber() : 0; });
  const mb = nums(node.MediaBox());
  const media = [Math.min(mb[0], mb[2]), Math.min(mb[1], mb[3]), Math.max(mb[0], mb[2]), Math.max(mb[1], mb[3])];
  let crop = media.slice();
  const cbArr = node.CropBox();
  if (cbArr) {
    const cb = nums(cbArr);
    const c = [Math.min(cb[0], cb[2]), Math.min(cb[1], cb[3]), Math.max(cb[0], cb[2]), Math.max(cb[1], cb[3])];
    crop = [Math.max(c[0], media[0]), Math.max(c[1], media[1]), Math.min(c[2], media[2]), Math.min(c[3], media[3])];
    if (crop[2] - crop[0] < 1 || crop[3] - crop[1] < 1) crop = media.slice();
  }
  const rotObj = node.Rotate();
  let rot = rotObj ? ((rotObj.asNumber() % 360) + 360) % 360 : 0;
  if (rot % 90) rot = 0;
  const uuObj = node.lookup(N('UserUnit'));
  const uu = isNum(uuObj) ? uuObj.asNumber() || 1 : 1;
  const [x0, y0, x1, y1] = crop;
  const cw = x1 - x0, ch = y1 - y0;
  let m;
  if (rot === 0) m = [1, 0, 0, 1, -x0, -y0];
  else if (rot === 90) m = [0, -1, 1, 0, -y0, x0 + cw];
  else if (rot === 180) m = [-1, 0, 0, -1, x0 + cw, y0 + ch];
  else m = [0, 1, -1, 0, y0 + ch, -x0];
  m = m.map(v => v * uu);
  const w = (rot % 180 ? ch : cw) * uu, h = (rot % 180 ? cw : ch) * uu;
  return { media, crop, rot, uu, w, h, toDisplay: m };
}

/* ------------------------------------------------------------------ text helpers (WinAnsi only) */

const WIN_ANSI_EXTRA = '€‚ƒ„…†‡ˆ‰Š‹ŒŽ‘’“”•–—˜™š›œžŸ';
function winAnsi(s) {
  let out = '';
  for (const ch of String(s)) {
    const c = ch.codePointAt(0);
    if ((c >= 32 && c <= 126) || (c >= 160 && c <= 255) || WIN_ANSI_EXTRA.includes(ch)) out += ch;
    else if (c === 8722) out += '-';
    else out += '?';
  }
  return out;
}

/* ------------------------------------------------------------------ main entry */

/**
 * Builds the output PDF.
 * opts.visibleIds  array of OCG ids (pdf.js format "12R") that stay visible
 * opts.mode        'pages' | 'tiles' | 'projector'
 * opts.lineScale   projector line weight multiplier (1 = as drawn)
 * opts.tiles       { paper:'a4'|'letter', margin, overlap, skip:Set("page:r:c"), fileName, layerNames }
 * opts.onProgress  (fraction, label) => void
 * Throws if pdf-lib can't open the file (e.g. encrypted); the caller then uses the raster path.
 */
export async function buildOutput(L, srcBytes, opts = {}) {
  const { N, isRef, isDict, isArr } = libParts(L);
  const progress = opts.onProgress || (() => {});
  const mode = opts.mode || 'pages';
  const lineScale = mode === 'projector' ? (opts.lineScale || 1) : 0;

  progress(0.02, 'Reading the PDF');
  const doc = await L.PDFDocument.load(srcBytes, { updateMetadata: false, throwOnInvalidObject: false, parseSpeed: 2000 });
  const ctx = doc.context;
  const catalog = doc.catalog;

  // ---- layers
  const ocProps = catalog.lookup(N('OCProperties'));
  const known = new Set();
  const allOcgRefs = [];
  if (isDict(ocProps)) {
    const ocgs = ocProps.lookup(N('OCGs'));
    if (isArr(ocgs)) for (const r of ocgs.asArray()) if (isRef(r) && !known.has(ocgId(r))) { known.add(ocgId(r)); allOcgRefs.push(r); }
  }
  const visibleSet = new Set(opts.visibleIds || [...known]);
  const isOn = id => !known.has(id) || visibleSet.has(id);
  const ocVisible = makeOcEval(L, ctx, isOn);
  const anyHidden = [...known].some(id => !visibleSet.has(id));

  // ---- per-resources environment
  const formDone = new Map();   // ref tag -> true
  const gsDone = new Set();
  const scaleExtGStates = res => {
    if (!lineScale || !isDict(res)) return;
    const gsDict = res.lookup(N('ExtGState'));
    if (!isDict(gsDict)) return;
    for (const [, v] of gsDict.entries()) {
      const key = isRef(v) ? v.tag : v;
      if (gsDone.has(key)) continue; gsDone.add(key);
      const gs = isRef(v) ? ctx.lookup(v) : v;
      if (!isDict(gs)) continue;
      const lw = gs.lookup(N('LW'));
      if (lw instanceof L.PDFNumber) gs.set(N('LW'), L.PDFNumber.of((lw.asNumber() > 0 ? lw.asNumber() : 0.35) * lineScale));
    }
  };

  const makeEnv = res => {
    scaleExtGStates(res);
    const props = isDict(res) ? res.lookup(N('Properties')) : null;
    const xobjs = isDict(res) ? res.lookup(N('XObject')) : null;
    return {
      lineScale,
      propHidden(name) {
        if (!anyHidden || !isDict(props)) return false;
        const entry = props.get(N(name));
        if (!entry) return false;
        return !ocVisible(entry);
      },
      xobject(name) {
        if (!isDict(xobjs)) return 'keep';
        const ref = xobjs.get(N(name));
        const xo = isRef(ref) ? ctx.lookup(ref) : ref;
        if (!xo || !xo.dict) return 'keep';
        const oc = xo.dict.get(N('OC'));
        if (oc && anyHidden && !ocVisible(oc)) return 'drop';
        if (isRef(ref) && xo.dict.get(N('Subtype')) === N('Form')) filterForm(ref, xo, res);
        return 'keep';
      },
    };
  };

  function filterForm(ref, stream, parentRes) {
    if (formDone.has(ref.tag)) return;
    formDone.set(ref.tag, true);
    if (!anyHidden && !lineScale) return;
    let res = stream.dict.lookup(N('Resources'));
    if (!isDict(res)) res = parentRes;
    const bytes = decodeStream(L, stream);
    const r = filterContent(bytes, makeEnv(res));
    if (!r.changed) return;
    const dict = stream.dict.clone(ctx);
    dict.delete(N('Filter')); dict.delete(N('DecodeParms')); dict.delete(N('Length')); dict.delete(N('DL'));
    const fresh = ctx.flateStream(r.bytes);
    for (const [k, v] of dict.entries()) fresh.dict.set(k, v);
    ctx.assign(ref, fresh);
  }

  const pages = doc.getPages();
  const sheets = [];
  const invertName = 'PeakInvert';
  let invertRef = null;
  if (lineScale) invertRef = ctx.register(ctx.obj({ Type: 'ExtGState', BM: 'Difference', CA: 1, ca: 1, AIS: false }));

  for (let i = 0; i < pages.length; i++) {
    progress(0.05 + 0.75 * (i / pages.length), `Page ${i + 1} of ${pages.length}`);
    await tick();
    const node = pages[i].node;
    const res = node.Resources();
    const geo = pageGeometry(L, node);

    // annotations tagged with a hidden layer
    if (anyHidden) {
      const annots = node.lookup(N('Annots'));
      if (isArr(annots)) {
        for (let k = annots.size() - 1; k >= 0; k--) {
          const a = annots.lookup(k);
          if (isDict(a)) { const oc = a.get(N('OC')); if (oc && !ocVisible(oc)) annots.remove(k); }
        }
      }
    }

    // content
    const raw = node.get(N('Contents'));
    const streams = [];
    const resolved = isRef(raw) ? ctx.lookup(raw) : raw;
    if (isArr(resolved)) { for (const x of resolved.asArray()) { const s = isRef(x) ? ctx.lookup(x) : x; if (s && s.dict) streams.push(s); } }
    else if (resolved && resolved.dict) streams.push(resolved);
    const parts = [];
    for (const s of streams) { try { parts.push(decodeStream(L, s)); } catch (e) { throw new Error('unsupported-content-encoding'); } }
    const content = parts.length ? concatBytes(parts) : new Uint8Array(0);
    const r = (anyHidden || lineScale) ? filterContent(content, makeEnv(res)) : { bytes: content, changed: false, qDepth: 0 };
    let bytes = r.bytes;

    if (lineScale) {
      const [mx0, my0, mx1, my1] = geo.media;
      const rect = `${fmt(mx0)} ${fmt(my0)} ${fmt(mx1 - mx0)} ${fmt(my1 - my0)} re`;
      const head = `q 1 1 1 rg ${rect} f Q\nq ${fmt(lineScale)} w\n`;
      const tail = '\n' + 'Q\n'.repeat(r.qDepth) + `Q\nq /${invertName} gs 1 1 1 rg ${rect} f Q\n`;
      const enc = t => Uint8Array.from(t, ch => ch.charCodeAt(0));
      bytes = concatBytes([enc(head), bytes, enc(tail)]);
      // register the blend-mode graphics state on this page
      let pageRes = node.get(N('Resources'));
      if (!pageRes) { pageRes = res && isDict(res) ? res : ctx.obj({}); node.set(N('Resources'), pageRes); }
      const resDict = isRef(pageRes) ? ctx.lookup(pageRes) : pageRes;
      let gsd = resDict.lookup(N('ExtGState'));
      if (!isDict(gsd)) { gsd = ctx.obj({}); resDict.set(N('ExtGState'), gsd); }
      gsd.set(N(invertName), invertRef);
    }

    if (mode === 'tiles') {
      sheets.push({ geo, bytes, res: node.get(N('Resources')) || res || ctx.obj({}), group: node.get(N('Group')) });
    } else if (r.changed || lineScale) {
      const ref = ctx.register(ctx.flateStream(bytes));
      node.set(N('Contents'), ref);
    }
  }

  // ---- default layer configuration: only the chosen layers are on, everywhere
  if (isDict(ocProps) && known.size) {
    const D = ocProps.lookup(N('D'));
    const on = allOcgRefs.filter(r => visibleSet.has(ocgId(r)));
    const off = allOcgRefs.filter(r => !visibleSet.has(ocgId(r)));
    const cfg = isDict(D) ? D : ctx.obj({});
    if (!isDict(D)) ocProps.set(N('D'), cfg);
    cfg.set(N('BaseState'), N('ON'));
    cfg.set(N('ON'), ctx.obj(on));
    cfg.set(N('OFF'), ctx.obj(off));
    cfg.delete(N('AS'));          // usage rules could switch hidden sizes back on when printing
    cfg.delete(N('RBGroups'));
    const order = cfg.lookup(N('Order'));
    if (isArr(order)) {
      const prune = arr => {
        const outArr = [];
        for (const item of arr.asArray()) {
          if (isRef(item)) {
            const target = ctx.lookup(item);
            if (isArr(target)) { const sub = prune(target); if (sub.length) outArr.push(ctx.obj(sub)); }
            else if (!known.has(ocgId(item)) || visibleSet.has(ocgId(item))) outArr.push(item);
          } else if (isArr(item)) {
            const sub = prune(item);
            const hasLayer = sub.some(x => isRef(x) || isArr(x));
            if (hasLayer) outArr.push(ctx.obj(sub));
          } else outArr.push(item);
        }
        return outArr;
      };
      cfg.set(N('Order'), ctx.obj(prune(order)));
    }
    ocProps.delete(N('Configs'));
    for (const r of on) { const g = ctx.lookup(r); if (isDict(g)) g.delete(N('Usage')); }
  }

  if (mode === 'tiles') {
    progress(0.82, 'Laying out pages');
    await layoutTiles(L, doc, sheets, opts.tiles || {});
  }

  progress(0.9, 'Cleaning up');
  collectGarbage(L, doc);
  await tick();
  progress(0.94, 'Saving');
  const out = await doc.save({ useObjectStreams: true, addDefaultPage: false, updateFieldAppearances: false, objectsPerTick: 2000 });
  progress(1, 'Done');
  return out;
}

/* ------------------------------------------------------------------ tiling (Pro) */

async function layoutTiles(L, doc, sheets, t) {
  const { N } = libParts(L);
  const ctx = doc.context;
  const paperKey = t.paper === 'letter' ? 'letter' : 'a4';
  const margin = t.margin ?? 28.35;
  const overlap = t.overlap ?? 0;
  const skip = t.skip || new Set();
  const font = await doc.embedFont(L.StandardFonts.Helvetica);
  const bold = await doc.embedFont(L.StandardFonts.HelveticaBold);
  const ink = L.rgb(0.08, 0.08, 0.1), grey = L.rgb(0.45, 0.46, 0.5), faint = L.rgb(0.78, 0.78, 0.8);
  const accent = L.rgb(0.66, 0.25, 0.17);

  // forms: one per sheet, shared by every tile of that sheet
  const forms = sheets.map(sh => {
    const [x0, y0, x1, y1] = sh.geo.media;
    const dict = { Type: 'XObject', Subtype: 'Form', BBox: [x0, y0, x1, y1], Resources: sh.res };
    if (sh.group) dict.Group = sh.group;
    return ctx.register(ctx.flateStream(sh.bytes, dict));
  });

  // drop original pages and the catalog entries that point into them
  for (let k = doc.getPageCount() - 1; k >= 0; k--) doc.removePage(k);
  for (const key of ['StructTreeRoot', 'MarkInfo', 'Outlines', 'Dests', 'PageLabels', 'OpenAction', 'AcroForm', 'Names', 'PageMode', 'Threads', 'AA']) doc.catalog.delete(N(key));

  const totalSheets = sheets.length;
  const plans = sheets.map(sh => planTiles(sh.geo.w, sh.geo.h, paperKey, margin, overlap));
  const totalPrinted = plans.reduce((acc, p, si) => {
    let n = 0; for (let r = 0; r < p.rows; r++) for (let c = 0; c < p.cols; c++) if (!skip.has(`${si}:${r}:${c}`)) n++;
    return acc + n;
  }, 0);
  let pageNo = 0;
  const totalPages = totalPrinted + totalSheets;

  const text = (page, s, x, y, size, f = font, color = ink, opt = {}) =>
    page.drawText(winAnsi(s), { x, y, size, font: f, color, ...opt });
  const textW = (s, size, f = font) => f.widthOfTextAtSize(winAnsi(s), size);

  for (let si = 0; si < sheets.length; si++) {
    const sh = sheets[si], plan = plans[si], form = forms[si];
    const { pw, ph, cw, ch } = plan;
    const sheetTag = totalSheets > 1 ? `Sheet ${si + 1} · ` : '';
    const printedHere = [];
    for (let r = 0; r < plan.rows; r++) for (let c = 0; c < plan.cols; c++) if (!skip.has(`${si}:${r}:${c}`)) printedHere.push([r, c]);

    // ---------- assembly map
    {
      const page = doc.addPage([pw, ph]);
      pageNo++;
      const xo = page.node.newXObject('Sheet', form);
      const m = Math.max(margin, 28);
      let y = ph - m - 16;
      text(page, `Assembly map${totalSheets > 1 ? ` · sheet ${si + 1} of ${totalSheets}` : ''}`, m, y, 16, bold);
      y -= 16;
      if (t.fileName) { text(page, t.fileName, m, y, 9, font, grey); y -= 12; }
      if (t.layerNames && t.layerNames.length) {
        const line = 'Layers: ' + t.layerNames.join(', ');
        let s = line; while (textW(s, 9) > pw - 2 * m && s.length > 10) s = s.slice(0, -2);
        if (s !== line) s = s.slice(0, -1) + '…';
        text(page, s, m, y, 9, font, grey); y -= 12;
      }
      const sheetInch = v => (v / 72).toFixed(1);
      const sheetMm = v => Math.round(v / 72 * 25.4);
      text(page, `Sheet ${sheetMm(sh.geo.w)} × ${sheetMm(sh.geo.h)} mm (${sheetInch(sh.geo.w)} × ${sheetInch(sh.geo.h)} in) on ${plan.cols} × ${plan.rows} ${plan.paperLabel} pages, ${plan.orientation}, ${printedHere.length} printed`, m, y, 9, font, grey);
      y -= 12;
      const ovTxt = overlap > 0 ? `${(overlap / 72 * 25.4).toFixed(0)} mm (${(overlap / 72).toFixed(2)} in) overlap` : 'no overlap (butt the edges together)';
      text(page, `Margin ${(margin / 72 * 25.4).toFixed(0)} mm, ${ovTxt}`, m, y, 9, font, grey);
      y -= 18;

      // map area
      const footer = 72 / 2.54 * 5 + 22;
      const areaW = pw - 2 * m, areaH = y - m - footer;
      const s = Math.min(areaW / sh.geo.w, areaH / sh.geo.h);
      const mw = sh.geo.w * s, mh = sh.geo.h * s;
      const ox = m + (areaW - mw) / 2, oy = m + footer + (areaH - mh) / 2;
      const T = sh.geo.toDisplay;
      page.pushOperators(
        L.pushGraphicsState(),
        L.rectangle(ox, oy, mw, mh), L.clip(), L.endPath(),
        L.concatTransformationMatrix(T[0] * s, T[1] * s, T[2] * s, T[3] * s, T[4] * s + ox, T[5] * s + oy),
        L.drawObject(xo),
        L.popGraphicsState(),
      );
      page.drawRectangle({ x: ox, y: oy, width: mw, height: mh, borderColor: grey, borderWidth: 0.5 });
      for (let r = 0; r < plan.rows; r++) for (let c = 0; c < plan.cols; c++) {
        const w = tileWindow(plan, sh.geo.h, r, c);
        const x0 = ox + w.x0 * s, y0 = oy + w.y0 * s, ww = plan.cw * s, hh = plan.ch * s;
        const cx0 = Math.max(x0, ox), cy0 = Math.max(y0, oy), cx1 = Math.min(x0 + ww, ox + mw), cy1 = Math.min(y0 + hh, oy + mh);
        if (cx1 <= cx0 || cy1 <= cy0) continue;
        const skipped = skip.has(`${si}:${r}:${c}`);
        if (skipped) page.drawRectangle({ x: cx0, y: cy0, width: cx1 - cx0, height: cy1 - cy0, color: L.rgb(0.93, 0.93, 0.94), opacity: 0.85 });
        page.drawRectangle({ x: cx0, y: cy0, width: cx1 - cx0, height: cy1 - cy0, borderColor: accent, borderWidth: 0.6, borderOpacity: 0.9 });
        const label = `${rowLabel(r)}${c + 1}`;
        const fs = Math.max(5, Math.min(12, (cx1 - cx0) / 4, (cy1 - cy0) / 3));
        const lw = textW(label, fs, bold);
        page.drawRectangle({ x: cx0 + 2, y: cy1 - fs - 4, width: lw + 4, height: fs + 2.5, color: L.rgb(1, 1, 1), opacity: 0.85 });
        text(page, label, cx0 + 4, cy1 - fs - 2.2, fs, bold, skipped ? grey : accent);
      }

      // test squares (bottom left) and instructions (wrapped to the right of them)
      const inch = 72, cm5 = 72 / 2.54 * 5;
      const sy = m + 4;
      page.drawRectangle({ x: m, y: sy, width: cm5, height: cm5, borderColor: ink, borderWidth: 0.6 });
      text(page, '5 cm', m + 5, sy + cm5 - 13, 9, bold);
      page.drawRectangle({ x: m, y: sy, width: inch, height: inch, borderColor: ink, borderWidth: 0.6 });
      text(page, '1 in', m + 5, sy + inch - 13, 9, bold);
      const tx = m + cm5 + 16, maxW = pw - m - tx;
      const paras = [
        ['Check the scale first', 'Print this page at 100% (Actual size, no fit or shrink) and measure the squares: 1 inch and 5 cm. If they are off, fix the print settings before printing the rest.'],
        ['Put it together', overlap > 0
          ? 'Trim the top and left margin of each page along the grey line (not on row A or column 1). Lay the cut edge on the red tick marks of the page above or to the left, line up the pattern lines and tape.'
          : 'Trim the margins along the grey line and butt the edges together. The labels in each margin name the neighbouring page.'],
        ['Order', 'Rows run A, B, C from the top, columns 1, 2, 3 from the left. Grey cells on the map were empty and are not printed.'],
      ];
      const wrap = (str, size, f) => {
        const words = winAnsi(str).split(' '); const lines = []; let cur = '';
        for (const wd of words) { const tryS = cur ? cur + ' ' + wd : wd; if (f.widthOfTextAtSize(tryS, size) > maxW && cur) { lines.push(cur); cur = wd; } else cur = tryS; }
        if (cur) lines.push(cur); return lines;
      };
      let ly = sy + cm5 - 9;
      for (const [head, body] of paras) {
        text(page, head, tx, ly, 8.5, bold); ly -= 11;
        for (const ln of wrap(body, 8, font)) { text(page, ln, tx, ly, 8, font, ink); ly -= 10; }
        ly -= 5;
      }
      text(page, `Page ${pageNo} of ${totalPages}`, pw - m - textW(`Page ${pageNo} of ${totalPages}`, 7), Math.max(8, m - 16), 7, font, grey);
    }

    // ---------- tiles
    const T = sh.geo.toDisplay;
    for (const [r, c] of printedHere) {
      const page = doc.addPage([pw, ph]);
      pageNo++;
      const xo = page.node.newXObject('Sheet', form);
      const w = tileWindow(plan, sh.geo.h, r, c);
      const tx = margin - w.x0, ty = margin - w.y0;
      page.pushOperators(
        L.pushGraphicsState(),
        L.rectangle(margin, margin, cw, ch), L.clip(), L.endPath(),
        L.concatTransformationMatrix(T[0], T[1], T[2], T[3], T[4] + tx, T[5] + ty),
        L.drawObject(xo),
        L.popGraphicsState(),
      );
      // trim line
      page.drawRectangle({ x: margin, y: margin, width: cw, height: ch, borderColor: grey, borderWidth: 0.4 });
      // corner marks reaching into the margin
      const cm = Math.min(margin - 4, 14);
      for (const [x, y, dx, dy] of [[margin, margin, -1, -1], [margin + cw, margin, 1, -1], [margin, margin + ch, -1, 1], [margin + cw, margin + ch, 1, 1]]) {
        page.drawLine({ start: { x, y: y + dy * 2 }, end: { x, y: y + dy * cm }, thickness: 0.4, color: ink });
        page.drawLine({ start: { x: x + dx * 2, y }, end: { x: x + dx * cm, y }, thickness: 0.4, color: ink });
      }
      // overlap ticks: where the next page's cut edge goes
      if (overlap > 0) {
        if (c < plan.cols - 1) {
          const x = margin + plan.stepX;
          page.drawLine({ start: { x, y: margin + ch + 2 }, end: { x, y: margin + ch + Math.min(10, margin - 6) }, thickness: 0.6, color: accent });
          page.drawLine({ start: { x, y: margin - 2 }, end: { x, y: margin - Math.min(10, margin - 6) }, thickness: 0.6, color: accent });
        }
        if (r < plan.rows - 1) {
          const y = margin + overlap;
          page.drawLine({ start: { x: margin - 2, y }, end: { x: margin - Math.min(10, margin - 6), y }, thickness: 0.6, color: accent });
          page.drawLine({ start: { x: margin + cw + 2, y }, end: { x: margin + cw + Math.min(10, margin - 6), y }, thickness: 0.6, color: accent });
        }
      }
      // labels
      const label = `${rowLabel(r)}${c + 1}`;
      const fsz = Math.min(11, margin * 0.42);
      text(page, label, margin, margin + ch + (margin - fsz) / 2, fsz, bold, accent);
      const info = `${sheetTag}page ${pageNo} of ${totalPages}`;
      text(page, info, margin + textW(label, fsz, bold) + 8, margin + ch + (margin - fsz) / 2 + 1, Math.min(7, fsz * 0.7), font, grey);
      const small = Math.min(7.5, margin * 0.3);
      const neigh = (rr, cc) => (rr >= 0 && rr < plan.rows && cc >= 0 && cc < plan.cols) ? `${rowLabel(rr)}${cc + 1}` : null;
      const tri = (x, y, dir) => {
        const sz = 3;
        const pts = dir === 'up' ? `M ${x - sz} ${-y} L ${x + sz} ${-y} L ${x} ${-(y + sz * 1.3)} Z` :
          dir === 'down' ? `M ${x - sz} ${-y} L ${x + sz} ${-y} L ${x} ${-(y - sz * 1.3)} Z` :
          dir === 'left' ? `M ${x} ${-(y - sz)} L ${x} ${-(y + sz)} L ${x - sz * 1.3} ${-y} Z` :
          `M ${x} ${-(y - sz)} L ${x} ${-(y + sz)} L ${x + sz * 1.3} ${-y} Z`;
        page.drawSvgPath(pts, { x: 0, y: 0, color: grey, borderWidth: 0 });
      };
      const up = neigh(r - 1, c), down = neigh(r + 1, c), left = neigh(r, c - 1), right = neigh(r, c + 1);
      const midX = margin + cw / 2, midY = margin + ch / 2;
      const capY = margin + ch + margin / 2 - small / 2;
      if (up) { tri(midX - textW(up, small) / 2 - 6, capY + small * 0.35, 'up'); text(page, up, midX - textW(up, small) / 2, capY, small, font, grey); }
      if (down) { const y = margin / 2 - small / 2; tri(midX - textW(down, small) / 2 - 6, y + small * 0.35 + 1.5, 'down'); text(page, down, midX - textW(down, small) / 2, y, small, font, grey); }
      if (left) { const x = Math.max(2, margin / 2 - textW(left, small) / 2); tri(x + textW(left, small) / 2, midY + small + 3, 'left'); text(page, left, x, midY - small / 2, small, font, grey); }
      if (right) { const x = margin + cw + margin / 2 - textW(right, small) / 2; tri(x + textW(right, small) / 2, midY + small + 3, 'right'); text(page, right, x, midY - small / 2, small, font, grey); }
      if ((pageNo & 7) === 0) await tick();
    }
  }
}

/* ------------------------------------------------------------------ garbage collection */

/** Deletes indirect objects that are no longer reachable from the trailer, so replaced
 *  content and dropped pages don't stay in the saved file. */
export function collectGarbage(L, doc) {
  const ctx = doc.context;
  const seen = new Set();
  const stack = [];
  const visit = o => {
    if (!o) return;
    if (o instanceof L.PDFRef) {
      if (seen.has(o.tag)) return;
      seen.add(o.tag);
      const t = ctx.lookup(o);
      if (t) stack.push(t);
    } else if (o instanceof L.PDFDict) stack.push(o);
    else if (o instanceof L.PDFArray) stack.push(o);
    else if (o instanceof L.PDFStream) stack.push(o.dict);
  };
  const ti = ctx.trailerInfo;
  [ti.Root, ti.Info, ti.Encrypt, ti.ID].forEach(visit);
  while (stack.length) {
    const o = stack.pop();
    if (o instanceof L.PDFDict) for (const [, v] of o.entries()) visit(v);
    else if (o instanceof L.PDFArray) for (const v of o.asArray()) visit(v);
    else if (o instanceof L.PDFStream) visit(o.dict);
  }
  let removed = 0;
  for (const [ref] of ctx.enumerateIndirectObjects()) {
    if (!seen.has(ref.tag)) { ctx.delete(ref); removed++; }
  }
  return removed;
}
