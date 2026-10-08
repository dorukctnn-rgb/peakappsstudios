/* Name Cut Files engine (Peak Apps Tools).
 * Text -> glyph outlines (opentype.js) -> flattened contours -> welded outline per name (Clipper union)
 * -> sized in inches -> optional backing (Clipper offset) -> packed on a mat -> SVG in inch units.
 * Works in the browser (window.NameCutEngine) and in Node (module.exports) for the tests.
 * The caller passes the parsed opentype font and the ClipperLib object; nothing here touches the DOM.
 */
(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory();
  else root.NameCutEngine = factory();
})(typeof self !== 'undefined' ? self : this, function () {
  'use strict';

  const EM = 1000;      // glyphs are laid out at this font size: 1 layout unit = 1/1000 em
  const CS = 1000;      // Clipper works in integers: 1 Clipper unit = 1/1000 layout unit
  const PT = 72;        // SVG user unit = 1/72 in (width/height carry "in"; the viewBox is in points)
  const TOL_IN = 0.0012; // largest gap between a true curve and its flattened version, in inches (0.03 mm)

  // ---------- 1. text to contours ----------

  // Characters the font has no glyph for (spaces are fine).
  function missingChars(font, text) {
    const out = [];
    for (const ch of Array.from(text)) {
      if (/\s/.test(ch)) continue;
      if (font.charToGlyphIndex(ch) === 0 && !out.includes(ch)) out.push(ch);
    }
    return out;
  }

  // Path commands for the whole name, laid out at EM units, baseline at y = 0, y pointing down.
  // tracking is in thousandths of an em (same as most design apps' letter spacing).
  // The layout is done here rather than with font.getPath() so that a font with OpenType lookups
  // opentype.js can't run (it throws) still works: ligatures are dropped, letters and kerning stay.
  // Returns one entry per glyph: its path commands at EM size, baseline y = 0, y pointing down.
  function layoutGlyphs(font, text, tracking) {
    const scale = EM / font.unitsPerEm;
    let glyphs;
    try { glyphs = font.stringToGlyphs(text); } catch (e) { glyphs = Array.from(text).map(ch => font.charToGlyph(ch)); }
    let kern = null;
    try { kern = font.position.getKerningTables(font.position.getDefaultScriptName()); } catch (e) { kern = null; }
    const kv = (a, b) => {
      try { return kern ? font.position.getKerningValue(kern, a.index, b.index) : font.getKerningValue(a, b); } catch (e) { return 0; }
    };
    // the font's render options carry the variation settings of a variable font (font.variation.set)
    const ropt = Object.assign({}, font.defaultRenderOptions || {}, { drawLayers: false, drawSVG: false, hinting: false });
    const out = [];
    let x = 0;
    glyphs.forEach((g, i) => {
      let p = null;
      // a character the font lacks maps to glyph 0 (.notdef, usually a box): never cut that box
      if (g.index !== 0) { try { p = g.getPath(x, 0, EM, ropt, font); } catch (e) { p = null; } }
      out.push({ cmds: p ? p.commands.slice() : [] });
      x += (g.advanceWidth || 0) * scale;
      if (i < glyphs.length - 1) x += (kv(g, glyphs[i + 1]) || 0) * scale + (tracking || 0) / 1000 * EM;
    });
    return out;
  }
  function textCommands(font, text, tracking) {
    const cmds = [];
    for (const g of layoutGlyphs(font, text, tracking)) for (const c of g.cmds) cmds.push(c);
    return cmds;
  }

  // Exact-ish bounds of the commands (control points), only used to estimate the final scale.
  function commandBounds(cmds) {
    let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
    const add = (x, y) => { if (x < x0) x0 = x; if (x > x1) x1 = x; if (y < y0) y0 = y; if (y > y1) y1 = y; };
    for (const c of cmds) {
      if (c.x != null) add(c.x, c.y);
      if (c.x1 != null) add(c.x1, c.y1);
      if (c.x2 != null) add(c.x2, c.y2);
    }
    return x0 === Infinity ? null : { x0, y0, x1, y1, w: x1 - x0, h: y1 - y0 };
  }

  // Curves to polylines. tol is the largest allowed deviation in layout units.
  // Segment counts come from the second-derivative bound, so flat curves get few points and tight curves many.
  function flatten(cmds, tol) {
    const contours = [];
    let cur = null, x = 0, y = 0, sx = 0, sy = 0;
    const close = () => {
      if (cur && cur.length > 2) {
        const a = cur[0], b = cur[cur.length - 1];
        if (Math.abs(a[0] - b[0]) < 1e-9 && Math.abs(a[1] - b[1]) < 1e-9) cur.pop();
        if (cur.length > 2) contours.push(cur);
      }
      cur = null;
    };
    for (const c of cmds) {
      switch (c.type) {
        case 'M': close(); cur = [[c.x, c.y]]; x = sx = c.x; y = sy = c.y; break;
        case 'L': if (!cur) cur = [[x, y]]; cur.push([c.x, c.y]); x = c.x; y = c.y; break;
        case 'Q': {
          if (!cur) cur = [[x, y]];
          const d = Math.hypot(x - 2 * c.x1 + c.x, y - 2 * c.y1 + c.y);
          const n = Math.min(200, Math.max(1, Math.ceil(Math.sqrt(d / (4 * tol)))));
          for (let i = 1; i <= n; i++) {
            const t = i / n, m = 1 - t;
            cur.push([m * m * x + 2 * m * t * c.x1 + t * t * c.x, m * m * y + 2 * m * t * c.y1 + t * t * c.y]);
          }
          x = c.x; y = c.y; break;
        }
        case 'C': {
          if (!cur) cur = [[x, y]];
          const d1 = Math.hypot(x - 2 * c.x1 + c.x2, y - 2 * c.y1 + c.y2);
          const d2 = Math.hypot(c.x1 - 2 * c.x2 + c.x, c.y1 - 2 * c.y2 + c.y);
          const n = Math.min(240, Math.max(1, Math.ceil(Math.sqrt(3 * Math.max(d1, d2) / (4 * tol)))));
          for (let i = 1; i <= n; i++) {
            const t = i / n, m = 1 - t;
            const a = m * m * m, b = 3 * m * m * t, e = 3 * m * t * t, f = t * t * t;
            cur.push([a * x + b * c.x1 + e * c.x2 + f * c.x, a * y + b * c.y1 + e * c.y2 + f * c.y]);
          }
          x = c.x; y = c.y; break;
        }
        case 'Z': close(); x = sx; y = sy; break;
        default: break;
      }
    }
    close();
    return contours;
  }

  const toClipper = contours => contours.map(pts => pts.map(p => ({ X: Math.round(p[0] * CS), Y: Math.round(p[1] * CS) })));

  // ---------- 2. Clipper helpers ----------

  function union(C, paths, fill) {
    const c = new C.Clipper();
    c.AddPaths(paths, C.PolyType.ptSubject, true);
    const out = new C.Paths();
    const ft = fill === 'positive' ? C.PolyFillType.pftPositive : C.PolyFillType.pftNonZero;
    c.Execute(C.ClipType.ctUnion, out, ft, ft);
    return out;
  }
  function intersect(C, a, b) {
    const c = new C.Clipper();
    c.AddPaths(a, C.PolyType.ptSubject, true);
    c.AddPaths(b, C.PolyType.ptClip, true);
    const out = new C.Paths();
    c.Execute(C.ClipType.ctIntersection, out, C.PolyFillType.pftNonZero, C.PolyFillType.pftNonZero);
    return out;
  }
  const area = (C, p) => C.Clipper.Area(p);
  function bounds(paths) {
    let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
    for (const p of paths) for (const q of p) {
      if (q.X < x0) x0 = q.X; if (q.X > x1) x1 = q.X; if (q.Y < y0) y0 = q.Y; if (q.Y > y1) y1 = q.Y;
    }
    return x0 === Infinity ? null : { x0, y0, x1, y1, w: x1 - x0, h: y1 - y0 };
  }
  // Rounded bar (stadium) from x0 to x1 between y0 and y1, counter-clockwise like Clipper outers.
  function stadium(x0, x1, y0, y1, step) {
    const r = (y1 - y0) / 2, cy = (y0 + y1) / 2;
    const a = x0 + r, b = Math.max(a, x1 - r);
    const n = Math.max(8, Math.ceil(Math.PI * r / step));
    const pts = [];
    for (let i = 0; i <= n; i++) { const t = -Math.PI / 2 + Math.PI * i / n; pts.push({ X: Math.round(b + r * Math.cos(t)), Y: Math.round(cy + r * Math.sin(t)) }); }
    for (let i = 0; i <= n; i++) { const t = Math.PI / 2 + Math.PI * i / n; pts.push({ X: Math.round(a + r * Math.cos(t)), Y: Math.round(cy + r * Math.sin(t)) }); }
    return pts;
  }

  // Pieces = separate outer outlines. "Small" pieces are dots and accents: tiny next to the biggest
  // piece and much shorter than the whole name.
  function countPieces(C, paths) {
    const all = bounds(paths);
    const outers = paths.filter(p => area(C, p) > 0).map(p => ({ a: area(C, p), b: bounds([p]) })).sort((x, y) => y.a - x.a);
    const big = outers.length ? outers[0].a : 0;
    const small = outers.filter(o => o.a < big * 0.08 && all && o.b.h < all.h * 0.32).length;
    return { pieces: outers.length, small, holes: paths.length - outers.length };
  }

  // ---------- 3. one name ----------
  // opt: { tracking, bar: { on, thickness (em fraction) }, mode, width, height (inches), tolIn }
  // Returns the welded outline in Clipper units (y down) with its bounds; no sizing yet.
  // Layout only (cheap): glyph commands and their bounds. The UI caches this per font/text/spacing.
  function prepare(font, text, tracking) {
    const glyphs = layoutGlyphs(font, text, tracking || 0);
    return { text, glyphs, cb: commandBounds([].concat(...glyphs.map(g => g.cmds))), missing: missingChars(font, text) };
  }
  // Flattening tolerance in layout units for the requested size, rounded down to a power of two
  // so that small size changes reuse the cached outline.
  function tolFor(cb, opt) {
    const k0 = scaleFor({ w: cb.w, h: cb.h }, opt.mode, opt.width, opt.height);
    const t = Math.min(4, Math.max(0.02, (opt.tolIn || TOL_IN) / k0));
    return Math.pow(2, Math.floor(Math.log2(t)));
  }

  function weldName(font, C, text, opt) {
    opt = opt || {};
    const prep = opt.prepared || prepare(font, text, opt.tracking || 0);
    const glyphs = prep.glyphs, cb = prep.cb;
    if (!cb || cb.w <= 0 || cb.h <= 0) return { text, empty: true, missing: prep.missing };
    const tol = opt.tol || tolFor(cb, opt);
    const gp = glyphs.map(g => toClipper(flatten(g.cmds, tol)));
    const joins = opt.join ? joinGlyphs(C, gp, opt.joinOverlap) : 0;
    let paths = union(C, [].concat(...gp), 'nonzero');
    if (opt.bar && opt.bar.on && paths.length) {
      const t = (opt.bar.thickness || 0.06) * EM * CS;
      const lift = opt.bar.lift != null ? opt.bar.lift : 0.5;   // share of the bar above the baseline
      // the bar spans the ink that reaches the baseline, so swashes above it don't stretch the bar
      const band = [[{ X: -1e9, Y: -0.05 * EM * CS }, { X: 1e9, Y: -0.05 * EM * CS }, { X: 1e9, Y: 0.03 * EM * CS }, { X: -1e9, Y: 0.03 * EM * CS }]];
      const touch = bounds(intersect(C, paths, band)) || bounds(paths);
      const bar = stadium(touch.x0, touch.x1, -t * lift, t * (1 - lift), tol * CS);
      paths = union(C, paths.concat([bar]), 'nonzero');
    }
    C.Clipper.CleanPolygons(paths, Math.max(1, tol * CS * 0.08));
    paths = paths.filter(p => p.length > 2);
    const b = bounds(paths);
    const pc = countPieces(C, paths);
    return { text, paths, bounds: b, pieces: pc.pieces, smallPieces: pc.small, holes: pc.holes, joins, missing: prep.missing, tol };
  }

  // Script fonts often leave capitals (and a few lowercase pairs) just short of the next letter.
  // For each pair that doesn't overlap enough, slide the right letter (and everything after it) left
  // until the overlap reaches a minimum area, the way you would nudge letters before welding by hand.
  // Pairs further apart than 0.3 em (a space, a hyphen gap) are left alone. Returns how many pairs moved.
  function joinGlyphs(C, gp, overlapEm) {
    const U = EM * CS;
    const minArea = Math.pow((overlapEm || 0.022) * U, 2);
    const maxShift = 0.3 * U, step = 0.02 * U;
    const shifted = (paths, d) => paths.map(p => p.map(q => ({ X: q.X - d, Y: q.Y })));
    const overlap = (left, right, d) => {
      const r = intersect(C, left, shifted(right, d));
      let a = 0; for (const p of r) a += Math.abs(area(C, p));
      return a;
    };
    let total = 0, moved = 0;
    for (let i = 0; i < gp.length; i++) {
      if (total) gp[i] = shifted(gp[i], total);
      if (i === 0 || !gp[i].length || !gp[i - 1].length) continue;
      const left = gp[i - 1].concat(i > 1 ? gp[i - 2] : []);
      if (overlap(left, gp[i], 0) >= minArea) continue;
      let lo = 0, hi = -1;
      for (let d = step; d <= maxShift + 1; d += step) { if (overlap(left, gp[i], d) >= minArea) { hi = d; break; } lo = d; }
      if (hi < 0) continue;
      for (let k = 0; k < 9; k++) { const mid = (lo + hi) / 2; if (overlap(left, gp[i], mid) >= minArea) hi = mid; else lo = mid; }
      const d = Math.round(hi);
      gp[i] = shifted(gp[i], d);
      total += d; moved++;
    }
    return moved;
  }

  // inches per unit for a box of w × h units
  function scaleFor(box, mode, W, H) {
    if (mode === 'height') return H / box.h;
    if (mode === 'fit') return Math.min(W / box.w, H / box.h);
    return W / box.w;
  }

  // Size a welded name. Returns geometry in inches relative to the item's top-left corner.
  // backing: { on, offset (inches) } -> adds a solid offset outline (holes removed) under the name.
  function sizeName(C, welded, opt) {
    const b = welded.bounds;
    const k = scaleFor({ w: b.w, h: b.h }, opt.mode, opt.width, opt.height) ; // inches per Clipper unit
    const out = { text: welded.text, k, nameW: b.w * k, nameH: b.h * k, pieces: welded.pieces, smallPieces: welded.smallPieces, missing: welded.missing };
    let ox = b.x0, oy = b.y0;
    let backing = null;
    if (opt.backing && opt.backing.on && opt.backing.offset > 0) {
      const co = new C.ClipperOffset(2, Math.max(1, (opt.tolIn || TOL_IN) / k));
      co.AddPaths(welded.paths, C.JoinType.jtRound, C.EndType.etClosedPolygon);
      let off = new C.Paths();
      co.Execute(off, opt.backing.offset / k);
      off = union(C, off, 'nonzero').filter(p => area(C, p) > 0);   // solid: drop the holes
      C.Clipper.CleanPolygons(off, Math.max(1, (opt.tolIn || TOL_IN) / k * 0.08));
      const bb = bounds(off);
      ox = bb.x0; oy = bb.y0;
      backing = off;
      out.backingPieces = off.length;
      out.w = bb.w * k; out.h = bb.h * k;
    } else {
      out.w = out.nameW; out.h = out.nameH;
    }
    const tr = paths => paths.map(p => p.map(q => [(q.X - ox) * k, (q.Y - oy) * k]));
    out.name = tr(welded.paths);
    out.backing = backing ? tr(backing) : null;
    out.nameOffset = [(b.x0 - ox) * k, (b.y0 - oy) * k];   // where the name sits inside the item (both outlines are already item-relative)
    return out;
  }

  // ---------- 4. packing on mats ----------
  // items: [{ w, h }] in inches. mat: { w, h, margin, gap }. Keeps the input order (rows, left to right).
  function pack(items, mat) {
    const E = 1e-9;
    const uw = mat.w - 2 * mat.margin, uh = mat.h - 2 * mat.margin;
    const place = new Array(items.length);
    let matIndex = 0, y = 0, row = null;
    const startRow = () => { row = { mat: matIndex, y, h: 0, x: 0, n: 0 }; };
    startRow();
    items.forEach((it, i) => {
      const tooBig = it.w > uw + E || it.h > uh + E;
      if (row.n && row.x + it.w > uw + E) { y += row.h + mat.gap; startRow(); }
      if (y + Math.max(row.h, it.h) > uh + E) {
        if (row.n) { if (it.h <= uh + E) { matIndex++; y = 0; startRow(); } }
        else if (y > 0) { matIndex++; y = 0; row.mat = matIndex; row.y = 0; }
      }
      row.n++;
      place[i] = { mat: row.mat, x: mat.margin + row.x, row, tooBig };
      row.x += it.w + mat.gap;
      row.h = Math.max(row.h, it.h);
    });
    // centre each item vertically in its row
    let mats = 1;
    items.forEach((it, i) => {
      const p = place[i];
      p.y = mat.margin + p.row.y + (p.row.h - it.h) / 2;
      delete p.row;
      mats = Math.max(mats, p.mat + 1);
    });
    return { place, mats, usable: { w: uw, h: uh } };
  }

  // ---------- 5. SVG ----------
  const n3 = v => { const s = (Math.round(v * 1000) / 1000).toFixed(3).replace(/\.?0+$/, ''); return s === '-0' || s === '' ? '0' : s; };
  // polygons (inches) -> path data in points, offset by (dx, dy) inches; optional mirror inside a width
  function pathData(polys, dx, dy, mirrorW) {
    let d = '';
    for (const poly of polys) {
      if (poly.length < 3) continue;
      for (let i = 0; i < poly.length; i++) {
        let x = poly[i][0] + dx;
        if (mirrorW != null) x = mirrorW - x;
        d += (i === 0 ? 'M' : i === 1 ? 'L' : ' ') + n3(x * PT) + ' ' + n3((poly[i][1] + dy) * PT);
      }
      d += 'Z';
    }
    return d;
  }
  function xmlId(s) {
    const t = String(s).normalize('NFKD').replace(/[̀-ͯ]/g, '').replace(/[^A-Za-z0-9_-]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 40);
    return t || 'name';
  }
  const esc = s => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
  const inch = v => n3(v) + 'in';

  // One SVG with every name. mats are stacked top to bottom with a 1 in gap when there is more than one.
  // sized: output of sizeName. layout: output of pack. mat: { w, h }.
  function svgSheet(sized, layout, mat, o) {
    o = o || {};
    const GAP = 1;
    const H = layout.mats * mat.h + (layout.mats - 1) * GAP;
    const body = [];
    sized.forEach((s, i) => {
      const p = layout.place[i];
      const dx = p.x, dy = p.y + p.mat * (mat.h + GAP);
      const id = String(i + 1).padStart(2, '0') + '-' + xmlId(s.text);
      const parts = [];
      if (s.backing) parts.push(`<path id="backing-${id}" fill="${o.backingColor || '#c9a66b'}" fill-rule="evenodd" d="${pathData(s.backing, dx, dy)}"/>`);
      parts.push(`<path id="name-${id}" fill="${o.nameColor || '#000000'}" fill-rule="evenodd" d="${pathData(s.name, dx, dy)}"/>`);
      body.push(`<g id="g-${id}"><title>${esc(s.text)}</title>${parts.join('')}</g>`);
    });
    return `<?xml version="1.0" encoding="UTF-8"?>\n<svg xmlns="http://www.w3.org/2000/svg" version="1.1" width="${inch(mat.w)}" height="${inch(H)}" viewBox="0 0 ${n3(mat.w * PT)} ${n3(H * PT)}">\n<title>${esc(o.title || 'Name cut file')}</title>\n${body.join('\n')}\n</svg>\n`;
  }
  // One SVG for one name, document size = the name (or its backing).
  function svgSingle(s, o) {
    o = o || {};
    const id = xmlId(s.text);
    const parts = [];
    if (s.backing) parts.push(`<path id="backing-${id}" fill="${o.backingColor || '#c9a66b'}" fill-rule="evenodd" d="${pathData(s.backing, 0, 0)}"/>`);
    parts.push(`<path id="name-${id}" fill="${o.nameColor || '#000000'}" fill-rule="evenodd" d="${pathData(s.name, 0, 0)}"/>`);
    return `<?xml version="1.0" encoding="UTF-8"?>\n<svg xmlns="http://www.w3.org/2000/svg" version="1.1" width="${inch(s.w)}" height="${inch(s.h)}" viewBox="0 0 ${n3(s.w * PT)} ${n3(s.h * PT)}">\n<title>${esc(s.text)}</title>\n${parts.join('\n')}\n</svg>\n`;
  }

  // DXF (AutoCAD R12, inches) for Silhouette Studio Basic Edition, which can't open SVG files.
  // Every outline is a closed POLYLINE; names on layer NAMES, backings on layer BACKING. Y points up in DXF.
  function dxfSheet(sized, layout, mat) {
    const GAP = 1;
    const H = layout.mats * mat.h + (layout.mats - 1) * GAP;
    const f = v => (Math.round(v * 10000) / 10000).toString();
    const o = ['0', 'SECTION', '2', 'HEADER', '9', '$ACADVER', '1', 'AC1009', '9', '$INSUNITS', '70', '1',
      '9', '$EXTMIN', '10', '0', '20', '0', '9', '$EXTMAX', '10', f(mat.w), '20', f(H), '0', 'ENDSEC',
      '0', 'SECTION', '2', 'TABLES', '0', 'TABLE', '2', 'LAYER', '70', '2',
      '0', 'LAYER', '2', 'NAMES', '70', '0', '62', '7', '6', 'CONTINUOUS',
      '0', 'LAYER', '2', 'BACKING', '70', '0', '62', '3', '6', 'CONTINUOUS', '0', 'ENDTAB', '0', 'ENDSEC',
      '0', 'SECTION', '2', 'ENTITIES'];
    const poly = (pts, dx, dy, layer) => {
      o.push('0', 'POLYLINE', '8', layer, '66', '1', '10', '0', '20', '0', '30', '0', '70', '1');
      for (const p of pts) o.push('0', 'VERTEX', '8', layer, '10', f(p[0] + dx), '20', f(H - (p[1] + dy)), '30', '0');
      o.push('0', 'SEQEND', '8', layer);
    };
    sized.forEach((s, i) => {
      const p = layout.place[i];
      const dx = p.x, dy = p.y + p.mat * (mat.h + GAP);
      if (s.backing) s.backing.forEach(q => poly(q, dx, dy, 'BACKING'));
      s.name.forEach(q => poly(q, dx, dy, 'NAMES'));
    });
    o.push('0', 'ENDSEC', '0', 'EOF');
    return o.join('\r\n') + '\r\n';
  }

  // ---------- 6. small helpers shared with the UI and tests ----------
  const IN_PER_CM = 1 / 2.54;
  function toInches(v, unit) { return unit === 'cm' ? v * IN_PER_CM : v; }
  function fromInches(v, unit) { return unit === 'cm' ? v * 2.54 : v; }
  function applyCase(s, mode) {
    if (mode === 'upper') return s.toLocaleUpperCase();
    if (mode === 'title') return s.toLocaleLowerCase().replace(/(^|[\s\-'’.])(\p{L})/gu, (m, a, b) => a + b.toLocaleUpperCase());
    return s;
  }
  function fileSafe(s) {
    return String(s).normalize('NFC').replace(/[\\/:*?"<>|\u0000-\u001f]+/g, '').replace(/\s+/g, ' ').trim().slice(0, 60) || 'name';
  }

  return { EM, CS, PT, TOL_IN, missingChars, layoutGlyphs, textCommands, joinGlyphs, prepare, tolFor, dxfSheet, flatten, weldName, sizeName, scaleFor, pack, pathData, svgSheet, svgSingle, xmlId, toInches, fromInches, applyCase, fileSafe, countPieces, bounds };
});
