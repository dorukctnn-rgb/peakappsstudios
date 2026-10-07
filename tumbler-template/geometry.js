/* Tumbler & cone template geometry (Peak Apps Tools).
 * Shared by the tumbler generator, the cone page, the warp worker and the Node tests.
 * Pure functions, no DOM. Works as a browser global (TumblerGeo), in a worker (importScripts) and in Node (require).
 *
 * A tapered cup is a frustum (truncated cone). Unrolled flat it is an annular sector:
 *   slant  s = sqrt(h^2 + ((D1 - D2) / 2)^2)
 *   outer  R = s * Dbig / (Dbig - Dsmall)      (distance from the cone's apex to the wide rim)
 *   inner  r = R - s
 *   angle  theta = pi * Dbig / R = pi * (Dbig - Dsmall) / s   (radians)
 * With equal diameters the template is a rectangle pi*D wide and h tall.
 * Because s >= |D1 - D2| / 2, theta can only reach 2*pi when the side is entered as a slant shorter than
 * half the diameter difference, which no real cup can have; that input is rejected.
 *
 * Coordinates: shapes are built in an "apex frame" (y up, apex at the origin, a point at radius rho and
 * angle phi from the +y axis is (rho*sin(phi), rho*cos(phi))). layout() converts them to a "page frame"
 * (y down, origin at the top-left of the bounding box) in the same length unit as the input.
 */
(function (root) {
  'use strict';
  const PI = Math.PI, TAU = 2 * Math.PI;
  const PT_PER_UNIT = { in: 72, cm: 72 / 2.54, mm: 72 / 25.4 };
  const UNIT_PER_IN = { in: 1, cm: 2.54, mm: 25.4 };

  function fail(message, field) { return { error: message, field: field || null }; }
  const fmt = (v, unit) => (Math.round(v * (unit === 'in' ? 1000 : 100)) / (unit === 'in' ? 1000 : 100)) + ' ' + unit;

  /**
   * solve({ top, bottom, height, heightMode, measure, gap, bleed, tab, unit })
   *   top, bottom  diameters (or circumferences when measure === 'circumference'), unit-agnostic
   *   height       vertical height (heightMode 'vertical') or slant height along the side (heightMode 'slant')
   *   gap          handle gap measured along the top rim (template is shortened by this much at the top)
   *   bleed        extra margin added outside the cut line on every side
   *   tab          glue tab width along the right-hand seam (cone/lampshade templates)
   */
  function solve(o) {
    const unit = o.unit || 'in';
    let D1 = Number(o.top), D2 = Number(o.bottom);
    const H = Number(o.height);
    if (!isFinite(D1) || o.top === '' || o.top == null) return fail('Enter the top measurement.', 'top');
    if (!isFinite(D2) || o.bottom === '' || o.bottom == null) return fail('Enter the bottom measurement.', 'bottom');
    if (!isFinite(H) || o.height === '' || o.height == null) return fail('Enter the height.', 'height');
    if (D1 < 0 || D2 < 0) return fail('Measurements can’t be negative.', D1 < 0 ? 'top' : 'bottom');
    if (D1 === 0 && D2 === 0) return fail('The top and bottom can’t both be zero.', 'top');
    if (!(H > 0)) return fail('The height must be more than zero.', 'height');
    if (o.measure === 'circumference') { D1 /= PI; D2 /= PI; }
    const gap = Math.max(0, Number(o.gap) || 0);
    const bleed = Math.max(0, Number(o.bleed) || 0);
    const tab = Math.max(0, Number(o.tab) || 0);
    const dD = Math.abs(D1 - D2);
    const big = Math.max(D1, D2), small = Math.min(D1, D2);
    let s, h;
    if (o.heightMode === 'slant') {
      s = H;
      if (s <= dD / 2 + 1e-12) {
        return fail(`A side (slant) length of ${fmt(s, unit)} is impossible for these diameters: it has to be longer than half their difference (${fmt(dD / 2, unit)}). Did you mean the straight-up height?`, 'height');
      }
      h = Math.sqrt(s * s - (dD / 2) * (dD / 2));
    } else {
      h = H;
      s = Math.sqrt(h * h + (dD / 2) * (dD / 2));
    }
    const base = { unit, D1, D2, h, s, gap, bleed, tab, circTop: PI * D1, circBottom: PI * D2, topIsOuter: D1 >= D2 };

    // Straight cylinder (or a taper too small to matter: under one part in a million of the diameter).
    if (dD <= big * 1e-6) {
      const C = PI * D1;
      const W = C - gap;
      if (W <= 0) return fail(`The handle gap (${fmt(gap, unit)}) is as wide as the whole circumference (${fmt(C, unit)}).`, 'gap');
      return finish(Object.assign(base, { kind: 'rect', W, topArc: W, bottomArc: W, R: Infinity, r: Infinity, theta: 0, span: 0, gapAngle: 0 }));
    }

    const R = s * big / dD;
    const r = R - s;
    const theta = PI * dD / s; // == PI * big / R
    if (!(theta < TAU - 1e-9)) return fail('These measurements describe a flat ring, not a cup. Check the height.', 'height');
    const rTop = base.topIsOuter ? R : r;
    let gapAngle = 0;
    if (gap > 0) {
      if (rTop <= 0) return fail('A handle gap needs a top diameter above zero.', 'gap');
      gapAngle = gap / rTop;
    }
    const span = theta - gapAngle;
    if (span <= 1e-9) return fail(`The handle gap (${fmt(gap, unit)}) is as wide as the whole top rim (${fmt(PI * D1, unit)}).`, 'gap');
    const rBottom = base.topIsOuter ? r : R;
    return finish(Object.assign(base, { kind: 'arc', R, r, theta, span, gapAngle, topArc: span * rTop, bottomArc: span * rBottom }));
  }

  // ---------- shapes (apex frame) ----------
  const P = (rho, phi) => ({ x: rho * Math.sin(phi), y: rho * Math.cos(phi) });

  function arcShapes(g) {
    const a = g.span / 2, R = g.R, r = g.r, b = g.bleed, t = g.tab;
    const trim = [];
    const po = P(R, -a);
    trim.push({ t: 'M', x: po.x, y: po.y });
    trim.push({ t: 'A', cx: 0, cy: 0, rad: R, a0: -a, a1: a });
    let cut = null;
    if (r > 1e-12) {
      const pi = P(r, a);
      trim.push({ t: 'L', x: pi.x, y: pi.y });
      trim.push({ t: 'A', cx: 0, cy: 0, rad: r, a0: a, a1: -a });
    } else {
      trim.push({ t: 'L', x: 0, y: 0 });
    }
    trim.push({ t: 'Z' });

    let tabPath = null, fold = null;
    if (t > 0) {
      // Glue tab outside the right-hand seam (phi = +a): a trapezoid with 45-degree-ish chamfered ends.
      const e = { x: Math.sin(a), y: Math.cos(a) }, n = { x: Math.cos(a), y: -Math.sin(a) };
      const c = Math.min(t, g.s / 3);
      const Po = P(R, a), Pi = r > 1e-12 ? P(r, a) : { x: 0, y: 0 };
      const To = { x: Po.x + t * n.x - c * e.x, y: Po.y + t * n.y - c * e.y };
      const Ti = { x: Pi.x + t * n.x + c * e.x, y: Pi.y + t * n.y + c * e.y };
      tabPath = [{ t: 'M', x: Po.x, y: Po.y }, { t: 'L', x: To.x, y: To.y }, { t: 'L', x: Ti.x, y: Ti.y }, { t: 'L', x: Pi.x, y: Pi.y }];
      fold = [{ t: 'M', x: Po.x, y: Po.y }, { t: 'L', x: Pi.x, y: Pi.y }];
      // Outer cut contour = template with the right seam replaced by the tab outline.
      cut = [{ t: 'M', x: po.x, y: po.y }, { t: 'A', cx: 0, cy: 0, rad: R, a0: -a, a1: a },
        { t: 'L', x: To.x, y: To.y }, { t: 'L', x: Ti.x, y: Ti.y }, { t: 'L', x: Pi.x, y: Pi.y }];
      if (r > 1e-12) cut.push({ t: 'A', cx: 0, cy: 0, rad: r, a0: a, a1: -a });
      cut.push({ t: 'Z' });
    }

    let bleedPath = null;
    if (b > 0) {
      // True offset: arcs grow by b, straight seams move outward by b (parallel lines).
      const Ro = R + b, aO = a + Math.asin(Math.min(1, b / Ro));
      const ri = r - b;
      bleedPath = [];
      const s0 = P(Ro, -aO);
      bleedPath.push({ t: 'M', x: s0.x, y: s0.y });
      bleedPath.push({ t: 'A', cx: 0, cy: 0, rad: Ro, a0: -aO, a1: aO });
      const aI = ri > b ? a + Math.asin(b / ri) : Infinity;
      if (ri > b && aI < PI - 1e-9) {
        const q = P(ri, aI);
        bleedPath.push({ t: 'L', x: q.x, y: q.y });
        bleedPath.push({ t: 'A', cx: 0, cy: 0, rad: ri, a0: aI, a1: -aI });
      } else {
        // The two offset seams meet before reaching the inner circle: mitre point on the axis.
        const sa = Math.sin(a);
        bleedPath.push({ t: 'L', x: 0, y: sa > 1e-6 ? -b / sa : -Ro });
      }
      bleedPath.push({ t: 'Z' });
    }
    return { trim, cut: cut || trim, bleed: bleedPath, tab: tabPath, fold };
  }

  function rectShapes(g) {
    const W = g.W, h = g.h, b = g.bleed, t = g.tab;
    const trim = [{ t: 'M', x: 0, y: h }, { t: 'L', x: W, y: h }, { t: 'L', x: W, y: 0 }, { t: 'L', x: 0, y: 0 }, { t: 'Z' }];
    let cut = trim, tabPath = null, fold = null, bleedPath = null;
    if (t > 0) {
      const c = Math.min(t, h / 3);
      tabPath = [{ t: 'M', x: W, y: h }, { t: 'L', x: W + t, y: h - c }, { t: 'L', x: W + t, y: c }, { t: 'L', x: W, y: 0 }];
      fold = [{ t: 'M', x: W, y: h }, { t: 'L', x: W, y: 0 }];
      cut = [{ t: 'M', x: 0, y: h }, { t: 'L', x: W, y: h }, { t: 'L', x: W + t, y: h - c }, { t: 'L', x: W + t, y: c }, { t: 'L', x: W, y: 0 }, { t: 'L', x: 0, y: 0 }, { t: 'Z' }];
    }
    if (b > 0) bleedPath = [{ t: 'M', x: -b, y: h + b }, { t: 'L', x: W + b, y: h + b }, { t: 'L', x: W + b, y: -b }, { t: 'L', x: -b, y: -b }, { t: 'Z' }];
    return { trim, cut, bleed: bleedPath, tab: tabPath, fold };
  }

  // Bounding box of a path in the apex frame (arcs contribute their axis extremes).
  function bbox(paths) {
    let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
    const add = (x, y) => { if (x < minX) minX = x; if (x > maxX) maxX = x; if (y < minY) minY = y; if (y > maxY) maxY = y; };
    for (const path of paths) {
      if (!path) continue;
      for (const c of path) {
        if (c.t === 'M' || c.t === 'L') add(c.x, c.y);
        else if (c.t === 'A') {
          const lo = Math.min(c.a0, c.a1), hi = Math.max(c.a0, c.a1);
          const pt = phi => add(c.cx + c.rad * Math.sin(phi), c.cy + c.rad * Math.cos(phi));
          pt(c.a0); pt(c.a1);
          for (let k = -4; k <= 4; k++) { const phi = k * PI / 2; if (phi > lo && phi < hi) pt(phi); }
        }
      }
    }
    return { minX, minY, maxX, maxY };
  }

  function finish(g) {
    const shapes = g.kind === 'rect' ? rectShapes(g) : arcShapes(g);
    const box = bbox([shapes.bleed || shapes.trim, shapes.cut, shapes.tab]);
    const flip = g.kind === 'arc' && !g.topIsOuter; // wide end at the bottom: apex above the shape
    g.shapes = shapes;
    g.flip = flip;
    g.box = box;
    g.width = box.maxX - box.minX;
    g.height = box.maxY - box.minY;
    const tbox = bbox([shapes.trim]);
    g.trimWidth = tbox.maxX - tbox.minX;
    g.trimHeight = tbox.maxY - tbox.minY;
    g.thetaDeg = g.theta * 180 / PI;
    g.spanDeg = g.span * 180 / PI;
    // Suggested flat design size (top arc by slant): a rectangle of this shape bends onto the template
    // with no stretching along the top rim.
    g.designW = g.topArc; g.designH = g.s;
    return g;
  }

  // ---------- page frame ----------
  // Page frame: y down, origin at the bounding box's top-left. Arcs use canvas-style screen angles psi
  // (point = c + rad*(cos psi, sin psi)).
  function toPage(g, path, ox = 0, oy = 0) {
    if (!path) return null;
    const b = g.box, flip = g.flip;
    const X = x => x - b.minX + ox;
    const Y = y => (flip ? y - b.minY : b.maxY - y) + oy;
    const psi = phi => (flip ? PI / 2 - phi : phi - PI / 2);
    return path.map(c => {
      if (c.t === 'M' || c.t === 'L') return { t: c.t, x: X(c.x), y: Y(c.y) };
      if (c.t === 'A') {
        const p0 = psi(c.a0), p1 = psi(c.a1);
        return { t: 'A', cx: X(c.cx), cy: Y(c.cy), rad: c.rad, a0: p0, a1: p1,
          x0: X(c.cx) + c.rad * Math.cos(p0), y0: Y(c.cy) + c.rad * Math.sin(p0),
          x1: X(c.cx) + c.rad * Math.cos(p1), y1: Y(c.cy) + c.rad * Math.sin(p1) };
      }
      return { t: 'Z' };
    });
  }

  // SVG path data from a page-frame path, scaled by k (page units -> SVG user units).
  function svgPath(pp, k = 1, dec = 4) {
    const n = v => +(v * k).toFixed(dec);
    let d = '';
    for (const c of pp) {
      if (c.t === 'M') d += `M${n(c.x)} ${n(c.y)}`;
      else if (c.t === 'L') d += `L${n(c.x)} ${n(c.y)}`;
      else if (c.t === 'A') {
        const delta = c.a1 - c.a0;
        d += `L${n(c.x0)} ${n(c.y0)}`; // no-op when already there; keeps arcs self-contained
        d += `A${n(c.rad)} ${n(c.rad)} 0 ${Math.abs(delta) > PI ? 1 : 0} ${delta > 0 ? 1 : 0} ${n(c.x1)} ${n(c.y1)}`;
      } else d += 'Z';
    }
    return d;
  }

  // Trace a page-frame path onto a CanvasRenderingContext2D (or Path2D), scaled by k and offset.
  function tracePath(ctx, pp, k = 1, ox = 0, oy = 0) {
    for (const c of pp) {
      if (c.t === 'M') ctx.moveTo(ox + c.x * k, oy + c.y * k);
      else if (c.t === 'L') ctx.lineTo(ox + c.x * k, oy + c.y * k);
      else if (c.t === 'A') ctx.arc(ox + c.cx * k, oy + c.cy * k, c.rad * k, c.a0, c.a1, c.a1 < c.a0);
      else ctx.closePath();
    }
  }

  // Cubic Bezier segments (each <= 90 degrees) for a page-frame arc command. Returns [[x1,y1,x2,y2,x3,y3], ...].
  function arcToBeziers(c) {
    const out = [];
    const total = c.a1 - c.a0;
    const n = Math.max(1, Math.ceil(Math.abs(total) / (PI / 2) - 1e-9));
    const step = total / n;
    const k = 4 / 3 * Math.tan(step / 4);
    for (let i = 0; i < n; i++) {
      const p = c.a0 + i * step, q = p + step;
      const x0 = c.cx + c.rad * Math.cos(p), y0 = c.cy + c.rad * Math.sin(p);
      const x3 = c.cx + c.rad * Math.cos(q), y3 = c.cy + c.rad * Math.sin(q);
      out.push([x0 - k * c.rad * Math.sin(p), y0 + k * c.rad * Math.cos(p), x3 + k * c.rad * Math.sin(q), y3 - k * c.rad * Math.cos(q), x3, y3]);
    }
    return out;
  }

  // ---------- warp ----------
  /** Parameters for warping a W x H design onto the template at `ppu` pixels per unit. */
  function warpParams(g, opts) {
    const o = Object.assign({ ppu: 300, mirror: false, fit: 'stretch', srcW: 1, srcH: 1 }, opts);
    const W = Math.max(1, Math.round(g.width * o.ppu)), H = Math.max(1, Math.round(g.height * o.ppu));
    return {
      kind: g.kind, ppu: o.ppu, outW: W, outH: H,
      minX: g.box.minX, minY: g.box.minY, maxY: g.box.maxY, flip: g.flip,
      half: g.span / 2, span: g.span, R: g.R, r: g.r, s: g.s, topIsOuter: g.topIsOuter,
      rectW: g.W || 0, h: g.h, bleed: g.bleed,
      mirror: !!o.mirror, fit: o.fit, srcW: o.srcW, srcH: o.srcH,
      tAspect: g.designW / g.designH, sAspect: o.srcW / o.srcH,
    };
  }

  /**
   * Fill rows [y0, y1) of dst (RGBA Uint8ClampedArray, outW x outH) by sampling src (RGBA, srcW x srcH).
   * Each output pixel is converted to polar coordinates around the apex (rho, phi) and sampled at
   *   u = (phi + span/2) / span * W,   v = (R - rho) / s * H   (bilinear).
   * Pixels in the bleed take the nearest edge colour; pixels clearly outside get alpha 0
   * (the caller masks the final edge with the exact vector outline).
   */
  function warpRows(dst, src, p, y0, y1) {
    const W = p.srcW, H = p.srcH, ow = p.outW, ppu = p.ppu;
    const margin = p.bleed + 2 / ppu;
    const rhoMax = p.R + margin, rhoMin = p.r - margin;
    // Where the design sits in normalised template space (0..1 each way): it spans
    // u in [ou, ou + su] and v in [ov, ov + sv]. Stretch fills exactly; Fill overflows one way
    // (the overflow is cropped); Fit falls short one way (the rest stays empty).
    let su = 1, sv = 1, ou = 0, ov = 0, clampOut = true;
    if (p.fit === 'fill' || p.fit === 'fit') {
      const wider = p.sAspect > p.tAspect;
      const k = p.sAspect / p.tAspect; // > 1 when the design is wider than the template shape
      if (p.fit === 'fill') {
        if (wider) su = k; else sv = 1 / k;
      } else {
        clampOut = false;
        if (wider) sv = 1 / k; else su = k;
      }
      ou = (1 - su) / 2; ov = (1 - sv) / 2;
    }
    for (let py = y0; py < y1; py++) {
      const Y = (py + 0.5) / ppu;
      let di = py * ow * 4;
      for (let px = 0; px < ow; px++, di += 4) {
        const X = (px + 0.5) / ppu;
        let u, v;
        if (p.kind === 'rect') {
          const x = X + p.minX, y = p.maxY - Y;
          u = x / p.rectW; v = (p.h - y) / p.h;
        } else {
          const x = X + p.minX, y = p.flip ? Y + p.minY : p.maxY - Y;
          const rho = Math.sqrt(x * x + y * y);
          if (rho > rhoMax || rho < rhoMin) { dst[di + 3] = 0; continue; }
          const phi = Math.atan2(x, y);
          u = (phi + p.half) / p.span;
          v = p.topIsOuter ? (p.R - rho) / p.s : (rho - p.r) / p.s;
          if (u < -0.5 || u > 1.5) { dst[di + 3] = 0; continue; }
        }
        if (p.mirror) u = 1 - u;
        // Template space -> design space.
        let du = (u - ou) / su, dv = (v - ov) / sv;
        if (fitOutside(du, dv, clampOut)) { dst[di + 3] = 0; continue; }
        if (du < 0) du = 0; else if (du > 1) du = 1;
        if (dv < 0) dv = 0; else if (dv > 1) dv = 1;
        sample(src, W, H, du * W - 0.5, dv * H - 0.5, dst, di);
      }
    }
  }
  function fitOutside(du, dv, clampOut) {
    if (clampOut) return false;
    // In "fit" mode the design does not cover the whole template: leave the rest empty (still allow the bleed).
    const e = 1e-6;
    return du < -e || du > 1 + e || dv < -e || dv > 1 + e;
  }
  function sample(src, W, H, x, y, dst, di) {
    if (x < 0) x = 0; else if (x > W - 1) x = W - 1;
    if (y < 0) y = 0; else if (y > H - 1) y = H - 1;
    const x0 = x | 0, y0 = y | 0, x1 = x0 + 1 < W ? x0 + 1 : x0, y1 = y0 + 1 < H ? y0 + 1 : y0;
    const fx = x - x0, fy = y - y0;
    const i00 = (y0 * W + x0) * 4, i10 = (y0 * W + x1) * 4, i01 = (y1 * W + x0) * 4, i11 = (y1 * W + x1) * 4;
    const w00 = (1 - fx) * (1 - fy), w10 = fx * (1 - fy), w01 = (1 - fx) * fy, w11 = fx * fy;
    // Premultiplied blend so transparent pixels don't bleed dark fringes.
    const a00 = src[i00 + 3] * w00, a10 = src[i10 + 3] * w10, a01 = src[i01 + 3] * w01, a11 = src[i11 + 3] * w11;
    const a = a00 + a10 + a01 + a11;
    if (a <= 0) { dst[di] = dst[di + 1] = dst[di + 2] = 0; dst[di + 3] = 0; return; }
    dst[di] = (src[i00] * a00 + src[i10] * a10 + src[i01] * a01 + src[i11] * a11) / a;
    dst[di + 1] = (src[i00 + 1] * a00 + src[i10 + 1] * a10 + src[i01 + 1] * a01 + src[i11 + 1] * a11) / a;
    dst[di + 2] = (src[i00 + 2] * a00 + src[i10 + 2] * a10 + src[i01 + 2] * a01 + src[i11 + 2] * a11) / a;
    dst[di + 3] = a;
  }

  // ---------- tiling (Pro) ----------
  /** Split a W x H area onto sheets (pw x ph) with a printer margin and overlap. Picks the orientation with fewer sheets. */
  function tile(W, H, paper, margin, overlap) {
    const opt = (pw, ph) => {
      const aw = pw - 2 * margin, ah = ph - 2 * margin;
      if (aw <= overlap || ah <= overlap) return null;
      const cols = W <= aw ? 1 : Math.ceil((W - overlap) / (aw - overlap));
      const rows = H <= ah ? 1 : Math.ceil((H - overlap) / (ah - overlap));
      return { pw, ph, aw, ah, cols, rows, count: cols * rows, stepX: aw - overlap, stepY: ah - overlap };
    };
    const a = opt(paper.w, paper.h), b = opt(paper.h, paper.w);
    if (!a && !b) return null;
    if (!a) return Object.assign(b, { landscape: true });
    if (!b) return Object.assign(a, { landscape: false });
    return b.count < a.count ? Object.assign(b, { landscape: true }) : Object.assign(a, { landscape: false });
  }

  // ---------- helpers ----------
  function convert(v, from, to) { return v / UNIT_PER_IN[from] * UNIT_PER_IN[to]; }
  /** Nearest 1/16 inch as a readable fraction, e.g. 10.996 -> "11", 8.639 -> "8 5/8". */
  function fraction16(v) {
    const n = Math.round(v * 16);
    const whole = Math.floor(n / 16);
    let rem = n - whole * 16, den = 16;
    while (rem && rem % 2 === 0) { rem /= 2; den /= 2; }
    return rem ? (whole ? `${whole} ${rem}/${den}` : `${rem}/${den}`) : String(whole);
  }
  // Length of a page-frame path (arcs exact), for tests and readouts.
  function pathLength(pp) {
    let L = 0, x = 0, y = 0, sx = 0, sy = 0;
    for (const c of pp) {
      if (c.t === 'M') { x = sx = c.x; y = sy = c.y; }
      else if (c.t === 'L') { L += Math.hypot(c.x - x, c.y - y); x = c.x; y = c.y; }
      else if (c.t === 'A') { L += Math.hypot(c.x0 - x, c.y0 - y) + Math.abs(c.a1 - c.a0) * c.rad; x = c.x1; y = c.y1; }
      else { L += Math.hypot(sx - x, sy - y); x = sx; y = sy; }
    }
    return L;
  }

  const api = { solve, toPage, svgPath, tracePath, arcToBeziers, warpParams, warpRows, tile, convert, fraction16, pathLength, bbox, PT_PER_UNIT, UNIT_PER_IN };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  root.TumblerGeo = api;
})(typeof globalThis !== 'undefined' ? globalThis : self);
