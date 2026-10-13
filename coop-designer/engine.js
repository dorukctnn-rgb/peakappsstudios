/* Coop Designer: the engine. Pure functions from a design (the numbers the user typed) to:
 *  - a size for the flock and the yard (sizeFor), unless the user sets the sizes;
 *  - the frame, member by member, in standard lumber (build), with the assembly step of each piece; the siding and
 *    floor sheets, the nest boxes, roosts, doors, vents, ramp and the hardware-cloth faces and apron;
 *  - the cut list, packed first-fit-decreasing onto stock lengths (ffd, cutList);
 *  - the hardware cloth cut into strips for the roll width with overlaps, the apron included, packed onto rolls;
 *  - plywood pieces on sheets and roof panels on panel lengths;
 *  - the shopping list (quantities, and totals only from prices the user types);
 *  - the checks, each with a reason and the sources it rests on (data.js);
 *  - the share code kept after the # sign (encode, decode).
 * Lengths are millimetres inside; the page shows inches or millimetres. Coordinates: x along the length (0 at the
 * hen-house end), y up, z across the depth (0 at the back, the front at the far side). Works in the browser
 * (window.CoopEngine) and in Node for the tests. Guidance for a hobby build, never an engineering guarantee. */
(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory(require('./data.js'));
  else root.CoopEngine = factory(root.CoopData);
})(typeof self !== 'undefined' ? self : this, function (D) {
  'use strict';
  const IN = D.IN, FT = D.FT, SQFT = D.SQFT;
  const RU = D.RULES;
  const clamp = (x, a, b) => Math.min(b, Math.max(a, x));
  const num = (x, d) => (x === '' || x === null || x === undefined || !Number.isFinite(Number(x)) ? d : Number(x));
  const r1 = x => Math.round(x * 100) / 100;
  const TYPES = ['house', 'walkin', 'aframe', 'tractor'];
  const TYPE_NAME = { house: 'Hen house on legs with a run', walkin: 'Walk-in coop with a run', aframe: 'A-frame coop', tractor: 'Chicken tractor' };
  const TYPE_SHORT = { house: 'hen house on legs', walkin: 'walk-in coop', aframe: 'A-frame coop', tractor: 'chicken tractor' };
  const CLIMATES = ['mild', 'cold', 'hot'];
  const PREDATORS = ['low', 'medium', 'high'];
  const ROOFS = ['solid', 'poly'];
  const ROOF_NAME = { solid: 'Opaque corrugated panels', poly: 'Clear corrugated polycarbonate' };
  const TOPS = ['mesh', 'solid', 'poly', 'open'];
  const TOP_NAME = { mesh: 'Hardware cloth', solid: 'Opaque corrugated panels', poly: 'Clear corrugated polycarbonate', open: 'Open, no top' };
  const APRONS = ['lshape', 'buried', 'skirt', 'none'];
  const APRON_NAME = { lshape: 'L-shaped apron, buried', buried: 'Buried straight down, foot turned out', skirt: 'Skirt laid flat on the ground', none: 'No apron' };

  // ---------- starting designs per type (before sizing): imperial in inches, metric in millimetres ----------
  // house and walkin: c = coop width, depth, back height, front height; legs = floor height; run = length, height.
  // aframe: a = length, base width, apex height, house floor height, house length.
  // tractor: t = length, width, run height, house floor height, house length, house wall height.
  const DEF = {
    house: { birds: 4, c: [48, 48, 42, 36], legs: 24, run: [120, 48], lumber: '2x3' },
    walkin: { birds: 8, c: [66, 72, 90, 78], legs: 8, run: [168, 72], lumber: '2x4' },
    aframe: { birds: 4, a: [120, 60, 60, 24, 72], lumber: '2x3' },
    tractor: { birds: 3, t: [96, 48, 36, 24, 36, 30], lumber: '2x3' },
  };
  const DEF_M = {
    house: { c: [1200, 1200, 1050, 900], legs: 600, run: [3000, 1200] },
    walkin: { c: [1650, 1800, 2250, 1950], legs: 200, run: [4200, 1800] },
    aframe: { a: [3000, 1500, 1500, 600, 1800] },
    tractor: { t: [2400, 1200, 900, 600, 900, 750] },
  };
  const meshById = id => D.MESH.find(x => x.id === id) || null;
  const lumberList = units => D.LUMBER[units === 'metric' ? 'metric' : 'imperial'];
  function lumberOf(m) { const list = lumberList(m.units); return list.find(l => l.id === m.lumber) || list[1]; }
  // a roll listed in millimetres (900 x 6000) rather than in inches (914.4 x 15240)
  const isMetricRoll = r => Math.abs(r[0] / IN - Math.round(r[0] / IN)) > 1e-6;
  function defaultRoll(meshId, units) {
    const me = meshById(meshId);
    const rolls = me && me.rolls.length ? me.rolls.filter(r => (units === 'metric') === isMetricRoll(r)) : [];
    const pick = rolls.length ? rolls[0] : D.ROLL_DEFAULT[units];
    return { w: pick[0], l: pick[1] };
  }
  const nestSide = size => (size === 'bantam' ? RU.nestSize.bantam : RU.nestSize.standard) * IN;
  const autoNests = birds => Math.max(1, Math.ceil(birds / RU.nestsAuto));

  function base(type, units) {
    const d = DEF[type], dm = DEF_M[type], metric = units === 'metric';
    const arr = k => (metric ? dm[k] : d[k].map(x => x * IN));
    const o = {
      birds: d.birds, yard: metric ? { w: 6000, d: 4000 } : { w: 20 * FT, d: 12 * FT },
      lumber: metric ? D.SWAP[d.lumber] : d.lumber, spacing: metric ? 600 : 24 * IN, mesh: metric ? 'wm13-19' : 'hc12-19',
      coop: { w: 1200, d: 1200, h: 1050, h2: 900, legs: 600 }, run: { l: 3000, h: 1200 },
      af: { l: 3000, w: 1500, h: 1500, f: 600, hl: 1800 }, tr: { l: 2400, w: 1200, rh: 900, f: 600, hl: 900, th: 750 },
    };
    if (d.c) { const c = arr('c'), r = arr('run'); o.coop = { w: c[0], d: c[1], h: c[2], h2: c[3], legs: metric ? dm.legs : d.legs * IN }; o.run = { l: r[0], h: r[1] }; }
    if (d.a) { const a = arr('a'); o.af = { l: a[0], w: a[1], h: a[2], f: a[3], hl: a[4] }; }
    if (d.t) { const t = arr('t'); o.tr = { l: t[0], w: t[1], rh: t[2], f: t[3], hl: t[4], th: t[5] }; }
    return o;
  }

  function fresh(type, units) {
    type = TYPES.includes(type) ? type : 'house';
    units = units === 'metric' ? 'metric' : 'imperial';
    const b = base(type, units);
    const meshId = b.mesh;
    const m = {
      v: 1, name: '', type, units,
      birds: b.birds, size: 'standard', climate: 'mild', predators: 'medium',
      yard: b.yard, auto: true,
      coop: b.coop, run: b.run, af: b.af, tr: b.tr,
      lumber: b.lumber, stock: D.STOCK[units][0].mm, spacing: b.spacing,
      mesh: meshId, roll: defaultRoll(meshId, units), overlap: units === 'metric' ? 25 : 1 * IN,
      roof: 'solid', top: 'mesh',
      panel: units === 'metric' ? { w: 860, l: 2400, lap: 75 } : { w: 26 * IN, l: 8 * FT, lap: 3 * IN },
      nests: autoNests(b.birds), roostH: 24 * IN,
      apron: { kind: type === 'tractor' ? 'none' : 'lshape', depth: units === 'metric' ? 300 : 12 * IN },
      window: false,
      prices: {},
      addons: { nests: { on: false, n: 1 }, droppings: { on: false }, run2: { on: false, l: units === 'metric' ? 1800 : 72 * IN }, walkDoor: { on: false }, legs: { on: false, h: units === 'metric' ? 450 : 18 * IN } },
      sample: false,
    };
    return normalize(sizeFor(m));
  }

  // The sample: a hen house on legs over a run for six standard hens. Marked "Sample" wherever it shows.
  function sample() {
    const m = fresh('house', 'imperial');
    Object.assign(m, { name: 'Sample hen house', birds: 6, size: 'standard', climate: 'mild', predators: 'medium', yard: { w: 20 * FT, d: 12 * FT }, auto: true, sample: true });
    return normalize(sizeFor(m));
  }

  // ---------- Size a design for its flock and its yard ----------
  // The coop gets the top of Virginia Tech's range per bird and the run its figure (data.js RULES), in sizes that cut
  // well from standard lumber and sheets: coop sizes in 6 in steps, run lengths in whole feet (100 and 300 mm in metric).
  function sizeFor(src) {
    const m = JSON.parse(JSON.stringify(src));
    if (m.auto === false) return m;
    const metric = m.units === 'metric';
    const up6 = x => (metric ? Math.ceil(x / 100 - 1e-9) * 100 : Math.ceil(x / (6 * IN) - 1e-9) * 6 * IN);
    const up12 = x => (metric ? Math.ceil(x / 300 - 1e-9) * 300 : Math.ceil(x / FT - 1e-9) * FT);
    const inch = x => (metric ? Math.round(x * IN / 10) * 10 : x * IN);           // a size given in inches, 10 mm steps in metric
    const ft = x => (metric ? Math.round(x * FT / 300) * 300 : x * FT);
    const sz = m.size === 'bantam' ? 'bantam' : 'standard';
    const birds = clamp(Math.round(num(m.birds, 4)), 1, 40);
    const coopA = birds * RU.coop[sz].auto * SQFT * 1e6;   // mm2
    const runA = birds * RU.run[sz].auto * SQFT * 1e6;
    const nests = autoNests(birds);
    m.nests = nests;
    const nw = nestSide(sz);
    const yw = num(m.yard && m.yard.w, 20 * FT), yd = num(m.yard && m.yard.d, 12 * FT);
    const drop = d => Math.max(inch(6), metric ? Math.ceil(d * 0.16 / 10) * 10 : Math.ceil(d * 0.16 / IN) * IN);    // the roof falls about 9 degrees front to back
    if (m.type === 'house') {
      let best = null;
      for (const dft of [3, 4, 5, 6]) {
        const d = ft(dft);
        const w = Math.max(ft(3), up6(coopA / d));
        const l = Math.max(w + ft(3), up12(runA / d));
        const fitsNests = nests * nw + 4 * IN <= d;
        const over = Math.max(0, l + nw - yw) + Math.max(0, d - yd);
        const score = over * 10 + (fitsNests ? 0 : 1e7) + Math.abs(l / d - 2.6) * 100 + Math.abs(w / d - 1) * 50;
        if (!best || score < best.score) best = { d, w, l, score };
      }
      const l = Math.min(best.l, Math.max(best.w + ft(2), Math.floor((yw - nw) / (metric ? 300 : FT)) * (metric ? 300 : FT)));
      const h = birds <= 4 ? inch(42) : inch(48);
      Object.assign(m.coop, { w: best.w, d: best.d, h, h2: h - drop(best.d), legs: inch(24) });
      Object.assign(m.run, { l, h: inch(48) });
    } else if (m.type === 'walkin') {
      const d = birds <= 6 ? ft(4) : birds <= 14 ? ft(6) : birds <= 24 ? ft(8) : ft(10);
      const w = Math.max(ft(4), up6(coopA / d));
      let rl = Math.max(ft(4), up12(runA / d));
      rl = Math.min(rl, Math.max(ft(4), Math.floor((yw - w) / (metric ? 300 : FT)) * (metric ? 300 : FT)));
      const h2 = inch(78);
      Object.assign(m.coop, { w, d, h: h2 + drop(d), h2, legs: inch(8) });
      Object.assign(m.run, { l: rl, h: ft(6) });
    } else if (m.type === 'aframe') {
      // the house floor sits at the height f, where the A is wf = w (1 - f / h) wide
      let w = ft(5), h = ft(5);
      if (birds > 5) { w = ft(6); h = ft(6); }
      if (birds > 9) { w = ft(8); h = ft(7); }
      const f = inch(24);
      const wf = w * (1 - f / h);
      const hl = Math.max(ft(3), up6(coopA / wf));
      let l = Math.max(hl + ft(3), up12(runA / w));
      l = Math.min(l, Math.max(hl + ft(2), Math.floor((yw - nw) / (metric ? 300 : FT)) * (metric ? 300 : FT)));
      Object.assign(m.af, { l, w, h, f, hl });
    } else {
      const w = birds <= 4 ? ft(4) : ft(5);
      const hl = Math.max(ft(2.5), up6(coopA / w));
      const l = Math.min(Math.max(hl + ft(3), up12(runA / w)), Math.max(hl + ft(2), Math.floor((yw - nw - inch(18)) / (metric ? 300 : FT)) * (metric ? 300 : FT)));
      Object.assign(m.tr, { l, w, rh: ft(3), f: inch(24), hl, th: inch(30) });
    }
    m.roostH = inch(sz === 'bantam' ? 15 : 24);
    if (m.type === 'tractor' || (m.type === 'aframe' && m.af.h - m.af.f < 40 * IN)) m.roostH = inch(sz === 'bantam' ? 12 : 18);
    m.window = m.climate === 'hot' && (m.type === 'walkin' || m.type === 'house');
    return m;
  }

  // ---------- Normalise anything (a form, a decoded link) into a valid design ----------
  function normalize(src) {
    const s = src && typeof src === 'object' ? src : {};
    const type = TYPES.includes(s.type) ? s.type : 'house';
    const units = s.units === 'metric' ? 'metric' : 'imperial';
    const b = base(type, units);
    const lim = (x, a, z, d) => clamp(num(x, d), a, z);
    const m = { v: 1, name: String(s.name || '').slice(0, 60), type, units };
    m.birds = Math.round(lim(s.birds, 1, 40, b.birds));
    m.size = s.size === 'bantam' ? 'bantam' : 'standard';
    m.climate = CLIMATES.includes(s.climate) ? s.climate : 'mild';
    m.predators = PREDATORS.includes(s.predators) ? s.predators : 'medium';
    const y = s.yard || {};
    m.yard = { w: lim(y.w, 1200, 60000, b.yard.w), d: lim(y.d, 900, 60000, b.yard.d) };
    m.auto = s.auto === undefined ? true : !!s.auto;
    const c = s.coop || {}, bc = b.coop;
    m.coop = { w: lim(c.w, 600, 6000, bc.w), d: lim(c.d, 600, 4800, bc.d), h: lim(c.h, 450, 3000, bc.h), h2: 0, legs: lim(c.legs, 0, 1200, bc.legs) };
    m.coop.h2 = lim(c.h2, 400, m.coop.h, Math.min(m.coop.h, bc.h2));
    const r = s.run || {}, br = b.run;
    m.run = { l: lim(r.l, 600, 20000, br.l), h: lim(r.h, 450, 3000, br.h) };
    if (type === 'house') { m.coop.legs = clamp(m.coop.legs, 300, 1200); m.run.l = Math.max(m.run.l, m.coop.w + 300); m.run.h = Math.max(m.run.h, m.coop.legs + 450); }
    if (type === 'walkin') { m.coop.legs = clamp(m.coop.legs, 100, 600); m.coop.w = Math.max(m.coop.w, 1200); m.coop.h2 = Math.max(m.coop.h2, 1700); m.coop.h = Math.max(m.coop.h, m.coop.h2); m.run.h = Math.max(m.run.h, 1200); }
    const a = s.af || {}, ba = b.af;
    m.af = { l: lim(a.l, 1200, 9000, ba.l), w: lim(a.w, 900, 3600, ba.w), h: lim(a.h, 900, 3000, ba.h), f: 0, hl: 0 };
    m.af.f = lim(a.f, 300, m.af.h * 0.6, Math.min(ba.f, m.af.h * 0.6));
    m.af.hl = lim(a.hl, 600, m.af.l - 300, Math.min(ba.hl, m.af.l - 300));
    const t = s.tr || {}, bt = b.tr;
    m.tr = { l: lim(t.l, 1200, 4800, bt.l), w: lim(t.w, 600, 2400, bt.w), rh: lim(t.rh, 450, 1500, bt.rh), f: 0, hl: 0, th: lim(t.th, 450, 1200, bt.th) };
    m.tr.f = lim(t.f, 200, m.tr.rh, Math.min(bt.f, m.tr.rh));
    m.tr.hl = lim(t.hl, 600, m.tr.l - 300, Math.min(bt.hl, m.tr.l - 300));
    const list = lumberList(units);
    m.lumber = list.some(l => l.id === s.lumber) ? s.lumber : b.lumber;
    const stocks = D.STOCK[units].map(x => x.mm);
    m.stock = stocks.reduce((p, q) => (Math.abs(q - num(s.stock, stocks[0])) < Math.abs(p - num(s.stock, stocks[0])) ? q : p));
    m.spacing = lim(s.spacing, 300, 1220, b.spacing);
    m.mesh = meshById(s.mesh) ? s.mesh : b.mesh;
    const roll = s.roll || defaultRoll(m.mesh, units);
    m.roll = { w: lim(roll.w, 300, 3000, 914.4), l: lim(roll.l, 600, 60000, 15240) };
    m.overlap = lim(s.overlap, 0, m.roll.w / 3, 25.4);
    m.roof = ROOFS.includes(s.roof) ? s.roof : 'solid';
    m.top = TOPS.includes(s.top) ? s.top : 'mesh';
    if (type === 'aframe' || type === 'tractor') m.top = 'mesh';
    const p = s.panel || {};
    m.panel = { w: lim(p.w, 300, 2000, 26 * IN), l: lim(p.l, 600, 8000, 8 * FT), lap: lim(p.lap, 0, 300, 3 * IN) };
    if (m.panel.lap >= m.panel.w / 2) m.panel.lap = m.panel.w / 4;
    m.nests = Math.round(lim(s.nests, 0, 12, autoNests(m.birds)));
    m.roostH = lim(s.roostH, 150, 1500, (m.size === 'bantam' ? 15 : 24) * IN);
    const ap = s.apron || {};
    m.apron = { kind: APRONS.includes(ap.kind) ? ap.kind : (type === 'tractor' ? 'none' : 'lshape'), depth: lim(ap.depth, 0, 900, 12 * IN) };
    if (type === 'tractor') m.apron.kind = 'none';
    m.window = !!s.window && (type === 'walkin' || type === 'house');
    m.prices = {};
    if (s.prices && typeof s.prices === 'object') for (const [k, v] of Object.entries(s.prices)) { const n = Number(v); if (/^[\w:.\-x]{1,60}$/.test(k) && Number.isFinite(n) && n >= 0 && n < 1e6) m.prices[k] = Math.round(n * 100) / 100; }
    const ad = s.addons || {};
    m.addons = {
      nests: { on: !!(ad.nests && ad.nests.on), n: Math.round(lim((ad.nests || {}).n, 1, 4, 1)) },
      droppings: { on: !!(ad.droppings && ad.droppings.on) },
      run2: { on: !!(ad.run2 && ad.run2.on) && type !== 'tractor', l: lim((ad.run2 || {}).l, 900, 6000, units === 'metric' ? 1800 : 72 * IN) },
      walkDoor: { on: !!(ad.walkDoor && ad.walkDoor.on) && (type === 'house' || type === 'aframe') },
      legs: { on: !!(ad.legs && ad.legs.on) && type === 'walkin', h: lim((ad.legs || {}).h, 300, 900, units === 'metric' ? 450 : 18 * IN) },
    };
    m.sample = !!s.sample;
    return m;
  }

  // ---------- Units ----------
  function fracIn(mm, step = 8) {
    const x = Math.round(mm / IN * step) / step;
    const whole = Math.floor(x + 1e-9), f = Math.round((x - whole) * step);
    if (!f) return `${whole}`;
    let n = f, d = step; while (n % 2 === 0 && d > 1) { n /= 2; d /= 2; }
    return whole ? `${whole} ${n}/${d}` : `${n}/${d}`;
  }
  const fmtIn = mm => `${fracIn(mm)} in`;
  function fmtFtIn(mm) {
    const inches = Math.round(mm / IN * 8) / 8;
    if (inches < 24) return `${fracIn(mm)} in`;
    const ftv = Math.floor(inches / 12), rest = inches - ftv * 12;
    return rest ? `${ftv} ft ${fracIn(rest * IN)} in` : `${ftv} ft`;
  }
  const fmtMm = mm => `${Math.round(mm)} mm`;
  function len(mm, units, kind = 'cut') { return units === 'metric' ? fmtMm(mm) : kind === 'dim' ? fmtFtIn(mm) : fmtIn(mm); }
  const both = (mm, units, kind = 'cut') => (units === 'metric' ? `${fmtMm(mm)} (${fmtIn(mm)})` : `${len(mm, units, kind)} (${fmtMm(mm)})`);
  function area(m2, units) { return units === 'metric' ? `${(Math.round(m2 * 100) / 100).toFixed(2)} m²` : `${(Math.round(m2 / SQFT * 10) / 10).toFixed(1)} sq ft`; }
  const sqft = m2 => m2 / SQFT;
  function stockLabel(mm, units) { const s = D.STOCK[units].concat(D.STOCK[units === 'metric' ? 'imperial' : 'metric']).find(x => Math.abs(x.mm - mm) < 1); return s ? s.label : len(mm, units, 'dim'); }
  function toInput(mm, units) { return units === 'metric' ? String(Math.round(mm) / 10) : String(Math.round(mm / IN * 8) / 8); }
  function fromInput(str, units) { const n = Number(String(str).replace(',', '.')); if (!Number.isFinite(n)) return NaN; return units === 'metric' ? n * 10 : n * IN; }
  const deg = r => r * 180 / Math.PI;
  const unit = (qty, word) => (qty === 1 ? String(word).replace(/([^s])s$/, '$1').replace(/^boxe$/, 'box') : word);

  // ---------- The frame ----------
  // Every member: a box from p0 to p1 (its centre line), a by b in section, a measured along `up`. len is the cut length.
  function build(m) {
    const L = lumberOf(m), t = L.t, w = L.w;
    const metric = m.units === 'metric';
    const S = m.spacing, stock = m.stock - endTrim(m.units); // the longest piece a board gives, its end squared
    const M = [], sheets = [], faces = [], notes = [], parts = {};
    let seq = 0;
    const add = (kind, step, p0, p1, up, o = {}) => {
      const length = Math.hypot(p1[0] - p0[0], p1[1] - p0[1], p1[2] - p0[2]);
      const mem = Object.assign({ id: `${kind}-${++seq}`, kind, step, p0, p1, up, a: t, b: w, len: length, sec: L.id }, o);
      if (o.len == null) mem.len = length;
      M.push(mem); return mem;
    };
    function splitRun(a, b, joints) {
      const cuts = [a]; let start = a;
      const js = joints.filter(j => j > a + 1 && j < b - 1).sort((x, y) => x - y);
      while (b - start > stock) { const ok = js.filter(j => j - start <= stock && j > start + 1); const j = ok.length ? ok[ok.length - 1] : start + stock; cuts.push(j); start = j; }
      cuts.push(b);
      const out = []; for (let i = 0; i < cuts.length - 1; i++) out.push([cuts[i], cuts[i + 1]]);
      return out;
    }
    const evenly = (a, b, maxGap, width) => {
      const span = b - a - width;
      if (span <= 0) return [(a + b) / 2];
      const n = Math.max(1, Math.ceil(span / (maxGap + width))) + 1;
      return Array.from({ length: n }, (_, i) => a + width / 2 + span * i / (n - 1));
    };
    const rect = (wid, h0, h1) => ({ w: wid, h0, h1: h1 == null ? h0 : h1 });
    const brace = 6 * IN;
    const sh = D.SHEET[m.units];
    const sz = m.size === 'bantam' ? 'bantam' : 'standard';
    const nW = nestSide(sz), nD = nW, nH = nW;
    const pop = sz === 'bantam' ? { w: 10 * IN, h: 12 * IN } : { w: 12 * IN, h: 14 * IN };
    const T = m.type;
    const legsOn = T === 'walkin' && m.addons.legs.on;
    const runFaces = new Set(['rfront', 'rback', 'rend', 'rtop', 'rdoor', 'rnear', 'legs', 'base', 'aback', 'afront', 'under']);

    // a straight wall along x (at z = at) or along z (at x = at), from a to b, rising from y0 to top(s): bottom and
    // top plates (split to stock), studs no further apart than the spacing, king studs beside each opening.
    function wall(o) {
      const { axis, at, a, b, y0, top, step, face, name } = o;
      const P = (s, yy) => (axis === 'x' ? [s, yy, at] : [at, yy, s]);
      let studs = evenly(a, b, S, t);
      for (const [s0, s1] of (o.skip || [])) { studs = studs.filter(cc => cc + t / 2 < s0 - 1 || cc - t / 2 > s1 + 1); studs.push(s0 - t / 2, s1 + t / 2); }
      studs = [...new Set(studs.map(x => Math.round(x * 100) / 100))].filter(cc => cc - t / 2 >= a - 1 && cc + t / 2 <= b + 1).sort((x, yy) => x - yy);
      const sloped = Math.abs(top(a) - top(b)) > 1;
      for (const [s0, s1] of splitRun(a, b, studs)) {
        if (!o.noBottom) add('plate', step, P(s0, y0 + t / 2), P(s1, y0 + t / 2), [0, 1, 0], { face, where: `${name}, bottom plate` });
        const ya = top(s0) - t / 2, yb = top(s1) - t / 2;
        if (!sloped) add('plate', step, P(s0, ya), P(s1, yb), [0, 1, 0], { face, where: `${name}, top plate` });
        else { const ds = s1 - s0, dy = yb - ya, l = Math.hypot(ds, dy); add('plate', step, P(s0, ya), P(s1, yb), axis === 'x' ? [-dy / l, ds / l, 0] : [0, ds / l, -dy / l], { face, where: `${name}, top plate, ends cut to the slope`, angled: true }); }
      }
      for (const cc of studs) {
        const yt = top(cc) - t, yb0 = o.noBottom ? y0 : y0 + t;
        if (yt - yb0 > 20) add('stud', step, P(cc, yb0), P(cc, yt), axis === 'x' ? [1, 0, 0] : [0, 0, 1], { face, where: `${name}, stud${sloped ? ', top cut to the slope' : ''}`, angled: sloped });
      }
      return studs;
    }
    // a floor frame: rim joists along x at the front and back, joists across z between them, on edge; top at y
    function floorFrame(x0, x1, z0, z1, yTop, step, name) {
      const yc = yTop - w / 2;
      for (const [a2, b2] of splitRun(x0, x1, [])) for (const zc of [z0 + t / 2, z1 - t / 2]) add('rim', step, [a2, yc, zc], [b2, yc, zc], [0, 1, 0], { face: 'floor', where: `${name}, rim joist`, a: w, b: t });
      for (const xc of evenly(x0, x1, Math.min(S, 16 * IN), t)) add('joist', step, [xc, yc, z0 + t], [xc, yc, z1 - t], [0, 1, 0], { face: 'floor', where: `${name}, joist`, a: w, b: t });
    }
    // a header (or sill) across an opening in a wall
    const across = (step, face, name, axis, at, s0, s1, yy) => add('header', step, axis === 'x' ? [s0, yy, at] : [at, yy, s0], axis === 'x' ? [s1, yy, at] : [at, yy, s1], [0, 1, 0], { face, where: name });

    // ======== the hen house: a box with a shed roof ========
    // x0..x1, z0..z1; floor top at fy; the walls rise h at the back (z0) and h2 at the front (z1) above the floor
    function henHouse(o) {
      const { x0, x1, z0, z1, fy, h, h2, steps } = o;
      const name = o.name || 'Hen house';
      const top = z => fy + h + (h2 - h) * clamp((z - z0) / (z1 - z0), 0, 1);
      const W = x1 - x0, Dd = z1 - z0;
      floorFrame(x0, x1, z0, z1, fy - sh.floor.t, steps.floor, `${name} floor`);
      sheets.push({ id: 'floor', where: `${name} floor`, w: Dd, l: W, t: 'floor', step: steps.floor, at: [x0, fy - sh.floor.t, z0], dims: [W, sh.floor.t, Dd] });
      const skipFront = [], skipSide = [], skipBack = [];
      if (o.door) skipFront.push([o.door.x0, o.door.x0 + o.door.w]);
      if (o.clean) skipFront.push([o.clean.x0, o.clean.x0 + o.clean.w]);
      if (o.popZ != null) skipSide.push([o.popZ - pop.w / 2, o.popZ + pop.w / 2]);
      if (o.window) skipBack.push([o.window.x0, o.window.x0 + o.window.w]);
      wall({ axis: 'x', at: z1 - w / 2, a: x0, b: x1, y0: fy, top: () => top(z1), step: steps.walls, face: 'cfront', name: `${name}, front wall`, skip: skipFront });
      wall({ axis: 'x', at: z0 + w / 2, a: x0, b: x1, y0: fy, top: () => top(z0), step: steps.walls, face: 'cback', name: `${name}, back wall`, skip: skipBack });
      wall({ axis: 'z', at: x0 + w / 2, a: z0 + w, b: z1 - w, y0: fy, top: z => top(z), step: steps.walls, face: 'cleft', name: `${name}, left wall` });
      wall({ axis: 'z', at: x1 - w / 2, a: z0 + w, b: z1 - w, y0: fy, top: z => top(z), step: steps.walls, face: 'cright', name: `${name}, right wall`, skip: skipSide });
      if (o.door) across(steps.walls, 'cfront', `${name}, door header`, 'x', z1 - w / 2, o.door.x0, o.door.x0 + o.door.w, fy + o.door.h + t / 2);
      if (o.clean && fy + o.clean.h + t < top(z1) - t) across(steps.walls, 'cfront', `${name}, clean-out door header`, 'x', z1 - w / 2, o.clean.x0, o.clean.x0 + o.clean.w, fy + o.clean.h + t / 2);
      if (o.popZ != null) across(steps.walls, 'cright', `${name}, pop door header`, 'z', x1 - w / 2, o.popZ - pop.w / 2, o.popZ + pop.w / 2, fy + pop.h + t / 2);
      if (o.window) {
        across(steps.walls, 'cback', `${name}, window header`, 'x', z0 + w / 2, o.window.x0, o.window.x0 + o.window.w, o.window.y + o.window.h + t / 2);
        across(steps.walls, 'cback', `${name}, window sill`, 'x', z0 + w / 2, o.window.x0, o.window.x0 + o.window.w, o.window.y - t / 2);
      }
      // the roof: rafters front to back on edge over the walls, an overhang all round, corrugated panels on top
      const over = metric ? 150 : 6 * IN;
      const rz0 = z0 - over, rz1 = z1 + over;
      const slope = (h2 - h) / Dd;
      const ry = z => fy + h + slope * (z - z0) + w / 2;        // the rafter's centre line
      const rafters = evenly(x0 - over / 2, x1 + over / 2, Math.min(S, RU.purlinEnd), t);
      for (const xc of rafters) {
        const ya = ry(rz0), yb = ry(rz1), dz = rz1 - rz0, dy = yb - ya, l = Math.hypot(dz, dy);
        add('rafter', steps.roof, [xc, ya, rz0], [xc, yb, rz1], [0, dz / l, -dy / l], { face: 'roof', where: `${name}, rafter, ends cut to the slope`, angled: true, a: w, b: t });
      }
      const pitch = deg(Math.atan2(h - h2, Dd));
      roofs.push({ id: o.roofId || 'coop', label: `${name} roof`, x0: x0 - over, x1: x1 + over, z0: rz0, z1: rz1, y0: ry(rz0) + w / 2, y1: ry(rz1) + w / 2, w: W + 2 * over, slope: Math.hypot(rz1 - rz0, ry(rz1) - ry(rz0)), pitch, kind: m.roof, bars: rafters.length, step: steps.roof });
      // siding: one piece per wall, openings cut out of it (the cut-outs make the small doors)
      const back = top(z0) - fy, front = top(z1) - fy;
      sheets.push({ id: 'side-front', where: `${name}, front siding`, w: front + sh.floor.t, l: W, t: 'wall', step: steps.siding, face: 'cfront' });
      sheets.push({ id: 'side-back', where: `${name}, back siding`, w: back + sh.floor.t, l: W, t: 'wall', step: steps.siding, face: 'cback' });
      sheets.push({ id: 'side-left', where: `${name}, left siding (top cut to the slope)`, w: Math.max(back, front) + sh.floor.t, l: Dd, t: 'wall', step: steps.siding, face: 'cleft' });
      sheets.push({ id: 'side-right', where: `${name}, right siding (top cut to the slope)`, w: Math.max(back, front) + sh.floor.t, l: Dd, t: 'wall', step: steps.siding, face: 'cright' });
      // vents: a strip under the eaves of the front and back walls, covered with hardware cloth
      const floorA = W * Dd / 1e6;
      const want = RU.ventStart * floorA * 1e6;
      const vlen = 2 * (W - 2 * t);
      const vh = clamp(want / vlen, 2 * IN, 8 * IN);
      const vents = [
        { id: 'vent-front', where: 'under the front eave', w: W - 2 * t, h: vh, x0: x0 + t, y: top(z1) - t - vh, z: z1, face: 'cfront' },
        { id: 'vent-back', where: 'under the back eave', w: W - 2 * t, h: vh, x0: x0 + t, y: top(z0) - t - vh, z: z0, face: 'cback' },
      ];
      const ventPerm = vents.reduce((s2, v) => s2 + v.w * v.h, 0);
      return { x0, x1, z0, z1, fy, h, h2, top, W, D: Dd, floorA, vents, ventPerm, window: o.window || null, name, roofPitch: pitch };
    }
    // the nest boxes: a row of n boxes along z, hung on the outside of an end wall or standing inside
    function nestRow(o) {
      const { n, x, z, y, outward, step } = o;
      if (n <= 0) return null;
      const rowL = n * nW;
      const lip = 4 * IN;
      sheets.push({ id: 'nest-bottom', where: 'Nest boxes, bottom', w: nD, l: rowL, t: 'wall', step, nest: true });
      if (!o.outside) sheets.push({ id: 'nest-back', where: 'Nest boxes, back', w: nH, l: rowL, t: 'wall', step, nest: true });
      sheets.push({ id: 'nest-lip', where: 'Nest boxes, front lip', w: lip, l: rowL, t: 'wall', step, nest: true });
      for (let i = 0; i <= n; i++) sheets.push({ id: `nest-end-${i}`, where: i === 0 || i === n ? 'Nest boxes, end' : 'Nest boxes, divider', w: nH, l: nD, t: 'wall', step, nest: true });
      sheets.push({ id: 'nest-lid', where: o.outside ? 'Nest boxes, hinged lid' : 'Nest boxes, sloped top', w: nD + 2 * IN, l: rowL + 2 * IN, t: 'wall', step, nest: true });
      return { n, x, z, y, outward, w: nW, d: nD, h: nH, rowL, lip, outside: !!o.outside };
    }
    // roost bars along x at the height h above the floor, enough for the flock at the tool's size per bird
    function roosts(o) {
      const { x0, x1, z0, fy, depth, step } = o;
      const per = RU.roost[sz].auto * IN;
      const need = m.birds * per;
      const bl = x1 - x0;
      const cold = m.climate === 'cold';
      const gap = (RU.roostGap + 2) * IN;
      const maxBars = Math.max(1, Math.floor((depth - 12 * IN) / gap + 0.05) + 1);
      const want = Math.max(1, Math.ceil(need / bl - 1e-9));
      const n = Math.min(maxBars, want);
      const sec = cold ? (metric ? { a: 38, b: 89, id: '38x89' } : { a: 1.5 * IN, b: 3.5 * IN, id: '2x4' }) : (metric ? { a: 45, b: 45, id: '45x45' } : { a: 1.5 * IN, b: 1.5 * IN, id: '2x2' });
      const yy = fy + o.h;
      const zs = [];
      for (let i = 0; i < n; i++) {
        const zc = z0 + 12 * IN + i * gap;
        zs.push(zc);
        const segs = Math.max(1, Math.ceil(bl / (stock - 1) - 1e-9));
        for (let k = 0; k < segs; k++) {
          const sa = x0 + bl * k / segs, sb = x0 + bl * (k + 1) / segs;
          add('roost', step, [sa, yy - sec.a / 2, zc], [sb, yy - sec.a / 2, zc], [0, 1, 0], { face: 'roost', where: `Roost bar ${i + 1}${segs > 1 ? `, piece ${k + 1} of ${segs}` : ''}${cold ? ', laid flat, wide face up' : ''}`, a: sec.a, b: sec.b, sec: sec.id, roostSec: true });
          if (k > 0) add('post', step, [sa, fy, zc], [sa, yy - sec.a, zc], [1, 0, 0], { face: 'roost', where: `Roost bar ${i + 1}, support post at the joint` });
        }
        for (const xe of [x0 + t / 2, x1 - t / 2]) add('cleat', step, [xe, yy - sec.a - 4 * IN, zc], [xe, yy - sec.a, zc], [1, 0, 0], { face: 'roost', where: `Roost bar ${i + 1}, end cleat` });
      }
      return { bars: n, len: bl, total: n * bl, need, h: o.h, flat: cold, zs, x0, x1, fy, short: n < want, sec: sec.id };
    }
    // a run: posts, plates and cross bars on top, wrapped in hardware cloth; a door near the far end of the front side
    function runBox(o) {
      const { x0, x1, z0, z1, h, step } = o;
      const name = 'Run';
      const dz = o.doorW;
      const dX0 = x1 - (metric ? 300 : 12 * IN) - dz;
      wall({ axis: 'x', at: z1 - w / 2, a: x0, b: x1, y0: 0, top: () => h, step, face: 'rfront', name: `${name}, front side`, skip: [[dX0, dX0 + dz]] });
      wall({ axis: 'x', at: z0 + w / 2, a: x0, b: x1, y0: 0, top: () => h, step, face: 'rback', name: `${name}, back side` });
      wall({ axis: 'z', at: x1 - w / 2, a: z0 + w, b: z1 - w, y0: 0, top: () => h, step, face: 'rend', name: `${name}, far end` });
      for (const [za, sx] of [[z1 - w / 2, 1], [z0 + w / 2, 1]]) {
        add('brace', step, [x1 - t, h - t - brace / Math.SQRT2, za], [x1 - t - brace / Math.SQRT2, h - t, za], null, { face: za > z0 + w ? 'rfront' : 'rback', where: 'Corner brace, 45 degree cuts', angled: true });
        add('brace', step, [x0 + t, h - t - brace / Math.SQRT2, za], [x0 + t + sx * brace / Math.SQRT2, h - t, za], null, { face: za > z0 + w ? 'rfront' : 'rback', where: 'Corner brace, 45 degree cuts', angled: true });
      }
      const bars = evenly(x0, x1, Math.min(S, RU.purlinEnd), t);
      if (o.top !== 'open') for (const xc of bars) add('bar', step, [xc, h + w / 2, z0], [xc, h + w / 2, z1], [0, 1, 0], { face: 'rtop', where: `${name}, top cross bar`, a: w, b: t });
      const dh = Math.min(h - t - 12, metric ? 1950 : 77 * IN);
      across(step, 'rfront', `${name}, door header`, 'x', z1 - w / 2, dX0, dX0 + dz, dh + t / 2 + 6);
      const dx = dX0 + 6, dw = dz - 12, dy0 = t + 6, dhh = dh - t - 12;
      add('stile', step, [dx + t / 2, dy0, z1 + w / 2 + t / 2], [dx + t / 2, dy0 + dhh, z1 + w / 2 + t / 2], [1, 0, 0], { face: 'rdoor', where: `${name} door, hinge stile` });
      add('stile', step, [dx + dw - t / 2, dy0, z1 + w / 2 + t / 2], [dx + dw - t / 2, dy0 + dhh, z1 + w / 2 + t / 2], [1, 0, 0], { face: 'rdoor', where: `${name} door, latch stile` });
      for (const yy of [dy0 + t / 2, dy0 + dhh - t / 2]) add('rail', step, [dx + t, yy, z1 + w / 2 + t / 2], [dx + dw - t, yy, z1 + w / 2 + t / 2], [0, 1, 0], { face: 'rdoor', where: `${name} door, rail` });
      add('brace', step, [dx + t, dy0 + t, z1 + w / 2 + t / 2], [dx + dw - t, dy0 + dhh - t, z1 + w / 2 + t / 2], null, { face: 'rdoor', where: `${name} door, diagonal brace (hinge side low)`, angled: true });
      return { x0, x1, z0, z1, h, L: x1 - x0, D: z1 - z0, bars: bars.length, door: { x0: dX0, w: dz, h: dh, z: z1, leaf: { x0: dx, w: dw, y0: dy0, h: dhh } }, name };
    }

    let coop = null, run = null, nests = null, ro = null, ramp = null, door = null, top = 'mesh';
    const roofs = [];
    const nestN = m.nests + (m.addons.nests.on ? m.addons.nests.n : 0);
    const angRamp = 35 * Math.PI / 180;
    const rampOf = (x0, y0, z, maxRun, y1 = 0) => { const rise = y0 - y1; if (rise < 3 * IN) return null; const runL = clamp(rise / Math.tan(angRamp), 200, Math.max(200, maxRun)); return { x0, y0, x1: x0 + runL, y1, z, w: pop.w, len: Math.hypot(rise, runL), angle: deg(Math.atan2(rise, runL)) }; };

    if (T === 'house') {
      // the run spans the whole length; the hen house stands over its near end on four legs
      const C = m.coop, R = m.run;
      const RH = m.addons.walkDoor.on ? Math.max(R.h, metric ? 1830 : 72 * IN) : R.h;
      const RL = R.l + (m.addons.run2.on ? m.addons.run2.l : 0);
      const fy = C.legs, under = fy - sh.floor.t - w;
      for (const [xc, zc] of [[t / 2, w / 2], [C.w - t / 2, w / 2], [t / 2, C.d - w / 2], [C.w - t / 2, C.d - w / 2]]) add('post', 1, [xc, 0, zc], [xc, under, zc], [1, 0, 0], { face: 'legs', where: 'Leg under the hen house' });
      for (const [xc, zc, sx] of [[t, w / 2, 1], [C.w - t, w / 2, -1], [t, C.d - w / 2, 1], [C.w - t, C.d - w / 2, -1]]) add('brace', 1, [xc, under - 9 * IN, zc], [xc + sx * 9 * IN, under, zc], null, { face: 'legs', where: 'Leg brace, 45 degree cuts', angled: true });
      // sills under the house on the three outer sides, for the hardware cloth and the apron
      for (const [a2, b2] of splitRun(t, C.w - t, [])) for (const zc of [w / 2, C.d - w / 2]) add('sill', 1, [a2, t / 2, zc], [b2, t / 2, zc], [0, 1, 0], { face: 'legs', where: 'Sill under the hen house' });
      add('sill', 1, [t / 2, t / 2, w], [t / 2, t / 2, C.d - w], [0, 1, 0], { face: 'legs', where: 'Sill under the hen house, end' });
      const cw = clamp(C.w - 2 * t - 6 * IN, 12 * IN, metric ? 1200 : 48 * IN);
      const clean = { x0: (C.w - cw) / 2, w: cw, h: Math.max(10 * IN, C.h2 - 6 * IN) };
      coop = henHouse({ x0: 0, x1: C.w, z0: 0, z1: C.d, fy, h: C.h, h2: C.h2, steps: { floor: 2, walls: 3, siding: 3, roof: 4 }, clean, popZ: C.d / 2,
        window: m.window ? { x0: t + 4 * IN, w: Math.min(24 * IN, C.w - 2 * t - 8 * IN), y: fy + 14 * IN, h: Math.max(8 * IN, Math.min(16 * IN, C.h - 24 * IN)) } : null });
      coop.clean = Object.assign({ y0: fy, z: C.d }, clean);
      for (const yy of [fy + 3 * IN, fy + clean.h - 3 * IN]) add('rail', 3, [clean.x0 + 2 * IN, yy, C.d + sh.wall.t + t / 2], [clean.x0 + clean.w - 2 * IN, yy, C.d + sh.wall.t + t / 2], [0, 0, 1], { face: 'cdoor', where: 'Clean-out door, batten (the door is the siding cut-out)', a: t, b: w });
      coop.pop = { side: 'right', x: C.w, z: C.d / 2, y: fy, w: pop.w, h: pop.h };
      run = runBox({ x0: C.w, x1: RL, z0: 0, z1: C.d, h: RH, step: 5, doorW: m.addons.walkDoor.on ? (metric ? 760 : 30 * IN) : (metric ? 600 : 24 * IN), top: m.top });
      run.L = RL; run.x0 = 0; run.under = { x0: 0, x1: C.w, h: under };
      nests = nestRow({ n: nestN, x: 0, z: C.d / 2, y: fy, outward: -1, outside: true, step: 6 });
      ro = roosts({ x0: t, x1: C.w - t, z0: w, fy, depth: C.d - 2 * w, h: m.roostH, step: 6 });
      ramp = rampOf(C.w, fy, C.d / 2, RL - C.w - 300);
      if (ramp) sheets.push({ id: 'ramp', where: 'Ramp (glue on cleats every 6 in from offcuts)', w: pop.w, l: ramp.len, t: 'wall', step: 6 });
      top = m.top;
    } else if (T === 'walkin') {
      const C = m.coop, R = m.run;
      const fy = legsOn ? m.addons.legs.h : C.legs;
      const below = fy - sh.floor.t - w;
      if (legsOn) {
        for (const [xc, zc] of [[t / 2, w / 2], [C.w - t / 2, w / 2], [t / 2, C.d - w / 2], [C.w - t / 2, C.d - w / 2]]) add('post', 1, [xc, 0, zc], [xc, below, zc], [1, 0, 0], { face: 'legs', where: 'Leg under the coop' });
        for (const [a2, b2] of splitRun(t, C.w - t, [])) for (const zc of [w / 2, C.d - w / 2]) add('sill', 1, [a2, t / 2, zc], [b2, t / 2, zc], [0, 1, 0], { face: 'legs', where: 'Sill under the coop' });
      } else for (const zc of [w / 2, C.d - w / 2]) for (const [a2, b2] of splitRun(0, C.w, [])) add('skid', 1, [a2, below / 2, zc], [b2, below / 2, zc], [0, 1, 0], { face: 'legs', where: 'Skid under the floor, on pavers or blocks', a: Math.max(t, below), b: t });
      const dw = metric ? 760 : 30 * IN;
      const doorX0 = clamp(C.w * 0.62 - dw / 2, t + 2 * IN, C.w - dw - t - 2 * IN);
      const dh = Math.min(C.h2 - t - 2 * IN, metric ? 1830 : 72 * IN);
      door = { x0: doorX0, w: dw, h: dh, z: C.d };
      coop = henHouse({ x0: 0, x1: C.w, z0: 0, z1: C.d, fy, h: C.h, h2: C.h2, steps: { floor: 1, walls: 2, siding: 3, roof: 4 }, door, popZ: C.d * 0.72,
        window: m.window ? { x0: t + 8 * IN, w: Math.min(30 * IN, C.w - 2 * t - 16 * IN), y: fy + 30 * IN, h: 20 * IN } : null, name: 'Coop' });
      coop.pop = { side: 'right', x: C.w, z: C.d * 0.72, y: fy, w: pop.w, h: pop.h };
      coop.door = door;
      const lx = doorX0 + 6, lw = dw - 12, ly = fy + 6, lh = dh - 12, lz = C.d + sh.wall.t + t / 2;
      add('stile', 5, [lx + t / 2, ly, lz], [lx + t / 2, ly + lh, lz], [1, 0, 0], { face: 'cdoor', where: 'Coop door, hinge stile' });
      add('stile', 5, [lx + lw - t / 2, ly, lz], [lx + lw - t / 2, ly + lh, lz], [1, 0, 0], { face: 'cdoor', where: 'Coop door, latch stile' });
      for (const yy of [ly + t / 2, ly + lh / 2, ly + lh - t / 2]) add('rail', 5, [lx + t, yy, lz], [lx + lw - t, yy, lz], [0, 1, 0], { face: 'cdoor', where: 'Coop door, rail' });
      add('brace', 5, [lx + t, ly + t, lz], [lx + lw - t, ly + lh / 2 - t / 2, lz], null, { face: 'cdoor', where: 'Coop door, diagonal brace (hinge side low)', angled: true });
      sheets.push({ id: 'door-leaf', where: 'Coop door, siding', w: lw, l: lh, t: 'wall', step: 5 });
      door.leaf = { x0: lx, w: lw, y0: ly, h: lh };
      // nests inside along the left wall on a stand, about 2 ft off the ground; roosts behind them, higher
      const ny = Math.max(fy + 6 * IN, RU.nestHeight * IN);
      const nz = clamp(C.d * 0.55, nW * nestN / 2 + w, C.d - w - nW * nestN / 2);
      nests = nestRow({ n: nestN, x: w, z: nz, y: ny, outward: 1, outside: false, step: 6 });
      if (nests) for (const zc of [nz - nests.rowL / 2 + t / 2, nz + nests.rowL / 2 - t / 2]) add('post', 6, [w + nD - t / 2, fy, zc], [w + nD - t / 2, ny - sh.wall.t, zc], [1, 0, 0], { face: 'nest', where: 'Nest stand leg' });
      ro = roosts({ x0: nests ? w + nD + 6 * IN : w, x1: C.w - w, z0: w, fy, depth: Math.max(C.d * 0.55, 26 * IN), h: nests ? Math.max(m.roostH, ny + nH - fy + 2 * IN) : m.roostH, step: 6 });
      const RL = R.l + (m.addons.run2.on ? m.addons.run2.l : 0);
      run = runBox({ x0: C.w, x1: C.w + RL, z0: 0, z1: C.d, h: R.h, step: 7, doorW: metric ? 760 : 30 * IN, top: m.top });
      ramp = rampOf(C.w, fy, C.d * 0.72, 1200);
      if (ramp) sheets.push({ id: 'ramp', where: 'Ramp (glue on cleats every 6 in from offcuts)', w: pop.w, l: ramp.len, t: 'wall', step: 6 });
      top = m.top;
    } else if (T === 'aframe') {
      const A = m.af;
      const Lr = A.l + (m.addons.run2.on ? m.addons.run2.l : 0);
      const W = A.w, H = A.h, F = A.f, HL = A.hl;
      const ang = Math.atan2(H, W / 2), slant = Math.hypot(H, W / 2);
      const wf = W * (1 - F / H);
      for (const zc of [w / 2, W - w / 2]) for (const [a2, b2] of splitRun(0, Lr, [])) add('sill', 1, [a2, t / 2, zc], [b2, t / 2, zc], [0, 1, 0], { face: 'base', where: 'Base sill' });
      for (const xc of [t / 2, Lr - t / 2]) add('sill', 1, [xc, t / 2, w], [xc, t / 2, W - w], [0, 1, 0], { face: 'base', where: 'Base end' });
      const xs = evenly(0, Lr, S, t);
      for (const xc of xs) for (const side of [-1, 1]) {
        const zb = side < 0 ? w / 2 : W - w / 2;
        const p0 = [xc, t, zb], p1 = [xc, H - 1 * IN, W / 2];
        const dy = p1[1] - p0[1], dz = p1[2] - p0[2], l = Math.hypot(dy, dz);
        add('rafter', 2, p0, p1, [0, -dz / l, dy / l], { face: side < 0 ? 'aback' : 'afront', where: 'A-frame rafter, both ends cut to the angle', angled: true, a: w, b: t, len: slant - 1 * IN });
      }
      for (const [a2, b2] of splitRun(0, Lr, xs)) add('ridge', 2, [a2, H - 1 * IN - w / 2, W / 2], [b2, H - 1 * IN - w / 2, W / 2], [0, 1, 0], { face: 'ridge', where: 'Ridge board', a: w, b: t });
      // the house floor: a tie across each A within the house length, on edge, the plywood on top
      const hx = xs.filter(x => x <= HL + 1);
      if (!hx.length || hx[hx.length - 1] < HL - t) hx.push(HL - t / 2);
      const zf0 = (W - wf) / 2, zf1 = (W + wf) / 2;
      const tieY = F - sh.floor.t - w / 2;
      for (const xc of hx) { const half = (W / 2) * (1 - (tieY - w / 2) / H); add('tie', 3, [xc + (xc < HL / 2 ? t : -t), tieY, W / 2 - half], [xc + (xc < HL / 2 ? t : -t), tieY, W / 2 + half], [0, 1, 0], { face: 'afloor', where: 'House floor tie, ends cut to the angle', angled: true, a: w, b: t }); }
      sheets.push({ id: 'floor', where: 'House floor', w: wf, l: HL, t: 'floor', step: 3, at: [0, F - sh.floor.t, zf0], dims: [HL, sh.floor.t, wf] });
      const sideSlant = (H - F) / Math.sin(ang);
      sheets.push({ id: 'aside-back', where: 'House side, hinged for cleaning', w: sideSlant, l: HL, t: 'wall', step: 4 });
      sheets.push({ id: 'aside-front', where: 'House side', w: sideSlant, l: HL, t: 'wall', step: 4 });
      sheets.push({ id: 'aend', where: 'House end, triangle above the floor', w: H - F, l: wf, t: 'wall', step: 4 });
      sheets.push({ id: 'apart', where: 'House partition with the pop door, triangle', w: H - F, l: wf, t: 'wall', step: 4 });
      coop = { x0: 0, x1: HL, z0: zf0, z1: zf1, fy: F, h: H - F, h2: 0, W: HL, D: wf, floorA: HL * wf / 1e6, aframe: true, name: 'House' };
      roofs.push({ id: 'aback', label: 'House roof, back slope', x0: -50, x1: HL + 50, w: HL + 100, slope: sideSlant + 2 * IN, pitch: deg(ang), kind: m.roof, bars: hx.length, step: 4, aframe: -1 });
      roofs.push({ id: 'afront', label: 'House roof, front slope', x0: -50, x1: HL + 50, w: HL + 100, slope: sideSlant + 2 * IN, pitch: deg(ang), kind: m.roof, bars: hx.length, step: 4, aframe: 1 });
      // vents: a triangle under the ridge at both house ends, covered with hardware cloth
      const want = RU.ventStart * coop.floorA * 1e6;
      const vh = clamp(Math.sqrt(want / (2 * (W / 2) / H)), 3 * IN, (H - F) * 0.45);
      const vw = 2 * vh * (W / 2) / H;
      coop.vents = [{ id: 'vent-end', where: 'at the top of the house end', w: vw, h: vh, x0: 0, y: H - vh, z: W / 2, tri: true }, { id: 'vent-part', where: 'at the top of the partition', w: vw, h: vh, x0: HL, y: H - vh, z: W / 2, tri: true }];
      const ends = coop.vents.reduce((s2, v) => s2 + v.w * v.h / 2, 0);
      if (ends < want - 1) { const rh = clamp((want - ends) / (2 * HL), 1 * IN, 4 * IN); coop.vents.push({ id: 'vent-ridge', where: 'along the ridge, both slopes', w: HL, h: rh * 2, x0: 0, y: H - rh, z: W / 2, ridge: true }); }
      coop.ventPerm = coop.vents.reduce((s2, v) => s2 + (v.tri ? v.w * v.h / 2 : v.w * v.h), 0);
      coop.pop = { side: 'part', x: HL, z: W / 2, y: F, w: pop.w, h: pop.h };
      coop.clean = null;
      nests = nestRow({ n: nestN, x: 0, z: W / 2, y: F, outward: -1, outside: true, step: 5 });
      ro = roosts({ x0: t, x1: HL - t, z0: W / 2 - 12 * IN, fy: F, depth: 12 * IN + (RU.roostGap + 2) * IN, h: m.roostH, step: 5 });
      ramp = rampOf(HL, F, W / 2, Lr - HL - 200);
      if (ramp) sheets.push({ id: 'ramp', where: 'Ramp (glue on cleats every 6 in from offcuts)', w: pop.w, l: ramp.len, t: 'wall', step: 5 });
      const big = m.addons.walkDoor.on;
      run = { x0: 0, x1: Lr, z0: 0, z1: W, h: H, L: Lr, D: W, aframe: true, name: 'Run', bars: xs.length };
      run.door = { end: 'far', w: Math.min(W * (big ? 0.55 : 0.4), big ? 30 * IN : 20 * IN), h: Math.min(H * (big ? 0.8 : 0.5), big ? 60 * IN : 30 * IN), x: Lr };
      for (const zc of [W / 2 - run.door.w / 2 - t / 2, W / 2 + run.door.w / 2 + t / 2]) add('stud', 7, [Lr - t / 2, t, zc], [Lr - t / 2, run.door.h + t, zc], [0, 0, 1], { face: 'afar', where: 'Far end, door post' });
      add('header', 7, [Lr - t / 2, run.door.h + 1.5 * t, W / 2 - run.door.w / 2 - t], [Lr - t / 2, run.door.h + 1.5 * t, W / 2 + run.door.w / 2 + t], [0, 1, 0], { face: 'afar', where: 'Far end, door header' });
      top = 'mesh';
      parts.aframe = { W, H, F, HL, wf, slant, ang: deg(ang), xs, Lr };
    } else {
      // the tractor: a low run on skids, a hen house over the wheel end, handles at the other end
      const Tr = m.tr;
      const W = Tr.w, Lr = Tr.l, RH = Tr.rh, F = Tr.f, HL = Tr.hl, TH = Tr.th;
      for (const zc of [w / 2, W - w / 2]) for (const [a2, b2] of splitRun(0, Lr, [])) add('skid', 1, [a2, w / 2, zc], [b2, w / 2, zc], [0, 1, 0], { face: 'base', where: 'Skid (runner), ends cut at 45 degrees to slide', a: w, b: t, angled: true });
      for (const xc of evenly(0, Lr, Math.min(S, 36 * IN), t)) add('sill', 1, [xc, w / 2, t], [xc, w / 2, W - t], [0, 1, 0], { face: 'base', where: 'Base cross piece', a: w, b: t });
      wall({ axis: 'x', at: W - w / 2, a: HL, b: Lr, y0: w, top: () => RH, step: 2, face: 'rfront', name: 'Run, front side', noBottom: true });
      wall({ axis: 'x', at: w / 2, a: HL, b: Lr, y0: w, top: () => RH, step: 2, face: 'rback', name: 'Run, back side', noBottom: true });
      wall({ axis: 'z', at: Lr - w / 2, a: w, b: W - w, y0: w, top: () => RH, step: 2, face: 'rend', name: 'Run, far end', noBottom: true });
      for (const xc of evenly(HL, Lr, Math.min(S, RU.purlinEnd), t)) add('bar', 2, [xc, RH + w / 2, 0], [xc, RH + w / 2, W], [0, 1, 0], { face: 'rtop', where: 'Run, top cross bar', a: w, b: t });
      const under = F - sh.floor.t - w;
      for (const [xc, zc] of [[t / 2, w / 2], [HL - t / 2, w / 2], [t / 2, W - w / 2], [HL - t / 2, W - w / 2]]) add('post', 3, [xc, w, zc], [xc, under, zc], [1, 0, 0], { face: 'legs', where: 'House post' });
      const cw2 = clamp(HL - 2 * t - 6 * IN, 10 * IN, metric ? 1200 : 48 * IN);
      const clean = { x0: (HL - cw2) / 2, w: cw2, h: Math.max(8 * IN, TH - 12 * IN) };
      coop = henHouse({ x0: 0, x1: HL, z0: 0, z1: W, fy: F, h: TH, h2: TH - (metric ? 150 : 6 * IN), steps: { floor: 3, walls: 3, siding: 4, roof: 4 }, clean, name: 'House' });
      coop.clean = Object.assign({ y0: F, z: W }, clean);
      coop.pop = { side: 'floor', x: HL - t - pop.w / 2, z: W / 2, y: F, w: pop.w, h: pop.h };
      nests = nestRow({ n: nestN, x: 0, z: W / 2, y: F, outward: -1, outside: true, step: 5 });
      ro = roosts({ x0: t, x1: HL - t, z0: w, fy: F, depth: W - 2 * w, h: Math.min(m.roostH, TH - 12 * IN), step: 5 });
      ramp = rampOf(HL, F, W / 2, Lr - HL - 300, w);
      if (ramp) sheets.push({ id: 'ramp', where: 'Ramp (glue on cleats every 6 in from offcuts)', w: pop.w, l: ramp.len, t: 'wall', step: 5 });
      for (const zc of [w + t / 2, W - w - t / 2]) add('handle', 6, [Lr - 24 * IN, RH * 0.6, zc], [Lr + 18 * IN, RH * 0.6, zc], [0, 1, 0], { face: 'handle', where: 'Handle, bolted to the run frame' });
      parts.wheels = { x: 3 * IN, r: 5 * IN, z: [-1.75 * IN, W + 1.75 * IN] };
      run = { x0: 0, x1: Lr, z0: 0, z1: W, h: RH, L: Lr, D: W, name: 'Run', tractor: true, door: { end: 'far', w: Math.min(W - 2 * w, metric ? 600 : 24 * IN), h: RH - 2 * t, x: Lr } };
      top = 'mesh';
    }

    // ---- the droppings board (Pro add-on) under the roosts ----
    let droppings = null;
    if (m.addons.droppings.on && ro) {
      const z0 = Math.min(...ro.zs) - 8 * IN, z1 = Math.max(...ro.zs) + 8 * IN;
      const yy = ro.fy + Math.max(6 * IN, ro.h - 9 * IN);
      droppings = { x0: ro.x0, x1: ro.x1, z0, z1, y: yy };
      sheets.push({ id: 'droppings', where: 'Droppings board under the roosts', w: z1 - z0, l: ro.x1 - ro.x0, t: 'wall', step: 6, at: [ro.x0, yy, z0], addon: 'droppings' });
      for (const zc of [z0 + t / 2, z1 - t / 2]) add('cleat', 6, [ro.x0, yy - w / 2, zc], [ro.x1, yy - w / 2, zc], [0, 1, 0], { face: 'roost', where: 'Droppings board, support cleat', addon: 'droppings' });
    }

    // ---- hardware-cloth faces ----
    if (T === 'house') {
      const C = m.coop, RL = run.L, RH = run.h, un = run.under.h;
      faces.push({ id: 'rfront', label: 'Run, front side', rects: [rect(RL - C.w, RH)] });
      faces.push({ id: 'rback', label: 'Run, back side', rects: [rect(RL - C.w, RH)] });
      faces.push({ id: 'rend', label: 'Run, far end', rects: [rect(C.d, RH)] });
      faces.push({ id: 'under', label: 'Under the hen house', rects: [rect(C.w, un), rect(C.w, un), rect(C.d, un)] });
      if (top === 'mesh') faces.push({ id: 'rtop', label: 'Run, top', rects: [rect(RL - C.w, C.d)] });
      faces.push({ id: 'rdoor', label: 'Run door', rects: [rect(run.door.leaf.w, run.door.leaf.h)] });
    } else if (T === 'walkin') {
      const RL = run.L, RH = run.h;
      faces.push({ id: 'rfront', label: 'Run, front side', rects: [rect(RL, RH)] });
      faces.push({ id: 'rback', label: 'Run, back side', rects: [rect(RL, RH)] });
      faces.push({ id: 'rend', label: 'Run, far end', rects: [rect(m.coop.d, RH)] });
      if (top === 'mesh') faces.push({ id: 'rtop', label: 'Run, top', rects: [rect(RL, m.coop.d)] });
      faces.push({ id: 'rdoor', label: 'Run door', rects: [rect(run.door.leaf.w, run.door.leaf.h)] });
      if (legsOn) { const hh = m.addons.legs.h - sh.floor.t - w; faces.push({ id: 'under', label: 'Under the coop', rects: [rect(m.coop.w, hh), rect(m.coop.w, hh), rect(m.coop.d, hh)] }); }
    } else if (T === 'aframe') {
      const P = parts.aframe;
      const lowSlant = P.F / Math.sin(P.ang * Math.PI / 180);
      faces.push({ id: 'aback', label: 'Back slope', rects: [rect(P.HL, lowSlant), rect(P.Lr - P.HL, P.slant)] });
      faces.push({ id: 'afront', label: 'Front slope', rects: [rect(P.HL, lowSlant), rect(P.Lr - P.HL, P.slant)] });
      faces.push({ id: 'aend', label: 'Near end, under the house', rects: [rect(P.wf, P.F), rect((P.W - P.wf) / 2, 0, P.F), rect((P.W - P.wf) / 2, P.F, 0)] });
      faces.push({ id: 'afar', label: 'Far end', rects: [rect(P.W / 2, 0, P.H), rect(P.W / 2, P.H, 0)] });
      faces.push({ id: 'adoor', label: 'Far end door', rects: [rect(run.door.w, run.door.h)] });
    } else {
      const Tr = m.tr;
      faces.push({ id: 'rfront', label: 'Run, front side', rects: [rect(Tr.l - Tr.hl, Tr.rh - w), rect(Tr.hl, Tr.f - w)] });
      faces.push({ id: 'rback', label: 'Run, back side', rects: [rect(Tr.l - Tr.hl, Tr.rh - w), rect(Tr.hl, Tr.f - w)] });
      faces.push({ id: 'rend', label: 'Run, far end', rects: [rect(Tr.w, Tr.rh - w)] });
      faces.push({ id: 'under', label: 'Under the house, wheel end', rects: [rect(Tr.w, Tr.f - w)] });
      faces.push({ id: 'rtop', label: 'Run, top', rects: [rect(Tr.l - Tr.hl, Tr.w)] });
    }
    // vents and windows are covered with the same hardware cloth
    const ventRects = (coop.vents || []).map(v => rect(v.w + 2 * IN, v.h + 2 * IN));
    if (coop.window) ventRects.push(rect(coop.window.w + 2 * IN, coop.window.h + 2 * IN));
    if (ventRects.length) faces.push({ id: 'vents', label: coop.window ? 'Vents and window' : 'Vents', rects: ventRects, small: true });

    // ---- run roof panels, when the run is roofed ----
    if ((T === 'house' || T === 'walkin') && (top === 'solid' || top === 'poly')) {
      roofs.push({ id: 'run', label: 'Run roof', x0: run.x0 === 0 && T === 'house' ? m.coop.w : run.x0, x1: run.x1, z0: -50, z1: run.D + 50, w: run.x1 - (T === 'house' ? m.coop.w : run.x0), slope: run.D + 100, pitch: 0, kind: top, bars: run.bars, step: 8, flat: true });
      notes.push('Panels on a flat run top shed water poorly: give the top a slope of at least 5 degrees, or keep hardware cloth there and roof only part of it.');
    }

    // ---- the apron, round the run ----
    let apron = null;
    const ak = m.apron.kind;
    if (T !== 'tractor' && ak !== 'none') {
      let sides;
      if (T === 'house') sides = [['front', run.L], ['far end', run.D], ['back', run.L], ['near end', run.D]];
      else if (T === 'walkin') sides = [['front', run.L], ['far end', run.D], ['back', run.L]].concat(legsOn ? [['under the coop, front', m.coop.w], ['under the coop, end', m.coop.d], ['under the coop, back', m.coop.w]] : []);
      else sides = [['front', run.L], ['far end', run.D], ['back', run.L], ['near end', run.D]];
      const depth = ak === 'skirt' ? 0 : m.apron.depth;
      const rollW = m.roll.w;
      let out, width;
      if (ak === 'lshape') { width = rollW; out = Math.max(0, rollW - depth); }
      else if (ak === 'buried') { out = RU.apronToe * IN; width = Math.min(rollW, depth + out); }
      else { out = rollW; width = rollW; }
      const perWidth = Math.max(1, Math.floor(rollW / Math.max(width, 1) + 1e-9));
      apron = { kind: ak, sides, per: sides.reduce((s2, x) => s2 + x[1], 0), depth, out, width, perWidth, label: APRON_NAME[ak] };
    }

    return { m, lumber: L, t, w, members: M, sheets, faces, coop, run, nests, roosts: ro, ramp, door, roofs, top, apron, droppings, notes, parts, pop, runFaces };
  }

  // ---------- First-fit decreasing, for boards, hardware cloth and roof panels ----------
  // trim: kept spare on each board to square its end (lumber only; the mesh and the roof panels are cut from a true edge)
  function endTrim(units) { return units === 'metric' ? 5 : IN / 4; }
  function ffd(cuts, stocks, preferred, kerf = 0, trim = 0) {
    const all = stocks.slice().sort((a, b) => a - b);
    const items = cuts.slice().sort((a, b) => b.len - a.len || String(a.where || '').localeCompare(String(b.where || '')));
    const bins = [], tooLong = [];
    for (const c of items) {
      let bin = bins.find(b => b.left + 1e-6 >= c.len + (b.cuts.length ? kerf : 0));
      if (!bin) {
        const L = c.len <= preferred - trim + 1e-6 ? preferred : all.find(s => s - trim + 1e-6 >= c.len);
        if (!L) { tooLong.push(c); continue; }
        bin = { stock: L, cuts: [], left: L - trim };
        bins.push(bin);
      }
      bin.left -= c.len + (bin.cuts.length ? kerf : 0);
      bin.cuts.push(c);
    }
    for (const b of bins) { b.used = b.stock - b.left; b.leftover = Math.max(0, b.left - kerf); }
    return { bins, tooLong };
  }

  // ---------- The cut list: one packing per lumber section (the frame, and the roost bars when they differ) ----------
  function cutList(design) {
    const m = design.m;
    const kerf = m.units === 'metric' ? 3 : IN / 8, trim = endTrim(m.units);
    const stocks = D.STOCK[m.units].map(s => s.mm);
    const roundUp = x => (m.units === 'metric' ? Math.ceil(x - 0.01) : Math.ceil(x / IN * 16 - 0.01) / 16 * IN);
    const all = design.members.map(mem => ({ id: mem.id, len: roundUp(mem.len), where: mem.where, kind: mem.kind, angled: !!mem.angled, step: mem.step, addon: mem.addon || null, sec: mem.roostSec ? mem.sec : design.lumber.id }));
    const groups = {};
    for (const c of all) (groups[c.sec] = groups[c.sec] || []).push(c);
    const sections = [], byStock = {};
    let n = 0, total = 0, bought = 0, tooLong = [];
    const order = Object.keys(groups).sort((a, b) => (a === design.lumber.id ? -1 : b === design.lumber.id ? 1 : a.localeCompare(b)));
    for (const sec of order) {
      const r = ffd(groups[sec], stocks, m.stock, kerf, trim);
      r.bins.forEach(b => { b.n = ++n; b.sec = sec; b.cuts.sort((x, y) => y.len - x.len); byStock[`${sec}:${b.stock}`] = (byStock[`${sec}:${b.stock}`] || 0) + 1; });
      const lum = D.LUMBER[m.units].find(l => l.id === sec) || { id: sec, label: sec, actual: '', source: 'ps20' };
      sections.push({ sec, lumber: lum, boards: r.bins });
      tooLong = tooLong.concat(r.tooLong);
      total += groups[sec].reduce((s, c) => s + c.len, 0);
      bought += r.bins.reduce((s, b) => s + b.stock, 0);
    }
    const boards = sections.flatMap(s => s.boards);
    return { kerf, trim, cuts: all, boards, sections, byStock, tooLong, total, bought, waste: bought ? 1 - total / bought : 0, section: design.lumber };
  }

  // ---------- Plywood pieces on sheets, by thickness: pieces in strips along the sheet, strips packed across it ----------
  function sheetLayout(design) {
    const m = design.m;
    const out = {};
    const kerf = m.units === 'metric' ? 3 : IN / 8;
    for (const kind of ['wall', 'floor']) {
      const sh = D.SHEET[m.units][kind];
      const pieces = [];
      for (const p of design.sheets.filter(x => x.t === kind)) {
        const acr = Math.max(1, Math.ceil(Math.min(p.w, p.l) / sh.w - 1e-9)), alg = Math.max(1, Math.ceil(Math.max(p.w, p.l) / sh.l - 1e-9));
        const pw = Math.min(p.w, p.l) / acr, pl = Math.max(p.w, p.l) / alg;
        for (let i = 0; i < acr * alg; i++) pieces.push({ id: p.id + (acr * alg > 1 ? `.${i + 1}` : ''), where: p.where, w: Math.min(sh.w, Math.ceil(pw)), l: Math.min(sh.l, Math.ceil(pl)), addon: p.addon || null });
      }
      const sorted = pieces.slice().sort((a, b) => b.w - a.w || b.l - a.l);
      const strips = [];
      for (const p of sorted) {
        let s = strips.find(x => x.width >= p.w && x.left + 1e-6 >= p.l + (x.pieces.length ? kerf : 0));
        if (!s) { s = { width: p.w, left: sh.l, pieces: [] }; strips.push(s); }
        s.left -= p.l + (s.pieces.length ? kerf : 0); s.pieces.push(p);
      }
      const { bins, tooLong } = ffd(strips.map((s, i) => ({ len: s.width, where: `strip ${i + 1}`, strip: s })), [sh.w], sh.w, kerf);
      out[kind] = { sheet: sh, pieces, sheets: bins.map(b => ({ strips: b.cuts.map(c => c.strip), left: b.leftover })), count: bins.length, tooLong: tooLong.length, area: pieces.reduce((a, p) => a + p.w * p.l, 0) / 1e6 };
    }
    out.count = out.wall.count + out.floor.count;
    return out;
  }

  // ---------- Hardware cloth: strips for the roll width with overlaps, the apron, then packed onto rolls ----------
  function stripsFor(rect, R, o, pitch) {
    const up = x => Math.ceil(x / pitch - 1e-9) * pitch;
    const hmax = Math.max(rect.h0, rect.h1), hmin = Math.min(rect.h0, rect.h1);
    const hAt = x => rect.h0 + (rect.h1 - rect.h0) * (x / rect.w);
    const count = span => (span <= R + 1e-6 ? 1 : 1 + Math.ceil((span - R) / (R - o) - 1e-9));
    const nv = count(rect.w), vert = [];
    for (let i = 0; i < nv; i++) { const a = i * (R - o), b = Math.min(rect.w, a + R); vert.push({ len: up(Math.max(hAt(a), hAt(b))), cover: b - a, at: a }); }
    const nh = count(hmax), horiz = [];
    for (let j = 0; j < nh; j++) {
      const y = j * (R - o);
      let l = rect.w;
      if (y > hmin + 1e-6 && Math.abs(rect.h1 - rect.h0) > 1e-6) l = rect.w * (hmax - y) / (hmax - hmin);
      horiz.push({ len: up(l), cover: Math.min(R, hmax - y), at: y });
    }
    const sum = a => a.reduce((s, x) => s + x.len, 0);
    const pickV = sum(vert) < sum(horiz) - 1e-6 || (Math.abs(sum(vert) - sum(horiz)) < 1e-6 && vert.length < horiz.length);
    return { orient: pickV ? 'vertical' : 'horizontal', strips: pickV ? vert : horiz, seams: (pickV ? vert : horiz).length - 1 };
  }
  const meshOf = m => meshById(m.mesh);
  function meshLayout(design) {
    const m = design.m, R = m.roll.w, o = Math.min(m.overlap, R / 3);
    const me = meshOf(m);
    const pitch = me && me.open ? Math.min(me.open[1], 25.4) : 12.7;
    const faces = design.faces.map(f => ({ id: f.id, label: f.label, small: !!f.small, rects: f.rects.filter(r => r.w > 1 && Math.max(r.h0, r.h1) > 1).map(r => Object.assign({ rect: r }, stripsFor(r, R, o, pitch))) }));
    const cuts = [];
    for (const f of faces) for (const [ri, r] of f.rects.entries()) for (const [si, s] of r.strips.entries()) {
      let rest = s.len, part = 0;
      while (rest > 0) { const l = Math.min(rest, m.roll.l); cuts.push({ len: l, where: `${f.label}${f.rects.length > 1 ? `, part ${ri + 1}` : ''}, strip ${si + 1}${part ? ' (continued)' : ''}`, face: f.id }); rest = rest - l > 0 ? rest - l + o : 0; part++; if (part > 20) break; }
    }
    // the apron: one length per side, overlapping the next side at the corners; narrow aprons are cut lengthwise,
    // so one length of roll gives perWidth strips (the longest of each group sets the length cut)
    const apronCuts = [];
    const ap = design.apron;
    if (ap) {
      const pieces = [];
      for (const [name, sideLen] of ap.sides) {
        let rest = sideLen + o, k = 0;
        while (rest > 0) { const l = Math.min(m.roll.l, rest); pieces.push({ name, len: Math.ceil(l) }); rest = rest - l > 0 ? rest - l + o : 0; k++; if (k > 40) break; }
      }
      pieces.sort((a, b) => b.len - a.len);
      for (let i = 0; i < pieces.length; i += ap.perWidth) {
        const g = pieces.slice(i, i + ap.perWidth);
        apronCuts.push({ len: g[0].len, where: `Apron, ${g.map(x => x.name).join(' and ')}${g.length > 1 ? ' (cut lengthwise)' : ''}`, face: 'apron', parts: g });
      }
    }
    const { bins } = ffd(cuts.concat(apronCuts), [m.roll.l], m.roll.l, 0);
    const total = cuts.concat(apronCuts).reduce((a, c) => a + c.len, 0);
    const seamLen = faces.reduce((a, f) => a + f.rects.reduce((b, r) => b + r.seams * (r.orient === 'vertical' ? Math.max(r.rect.h0, r.rect.h1) : r.rect.w), 0), 0);
    return { roll: m.roll, overlap: o, faces, cuts, apronCuts, apron: ap, rolls: bins, count: bins.length, total, seamLen, mesh: me };
  }

  // ---------- Roof panels: columns across the width, pieces down the slope, cut from panel lengths ----------
  function roofLayout(design) {
    const m = design.m;
    if (!design.roofs.length) return null;
    const P = m.panel, over = m.units === 'metric' ? 50 : 2 * IN, endLap = 200;
    const cuts = [], planes = [];
    let fixings = 0;
    for (const rc of design.roofs) {
      const cols = Math.max(1, Math.ceil((rc.w - P.lap) / (P.w - P.lap) - 1e-9));
      const need = rc.slope + over;
      for (let c = 0; c < cols; c++) {
        if (need <= P.l + 1e-6) cuts.push({ len: Math.ceil(need), where: `${rc.label}, column ${c + 1}`, kind: rc.kind });
        else { const k = Math.ceil((need - endLap) / (P.l - endLap) - 1e-9); for (let i = 0; i < k; i++) cuts.push({ len: i < k - 1 ? P.l : Math.ceil(need - (k - 1) * (P.l - endLap)), where: `${rc.label}, column ${c + 1}, row ${i + 1}`, kind: rc.kind }); }
      }
      fixings += cols * Math.max(2, rc.bars) * 3;
      planes.push({ id: rc.id, label: rc.label, cols, need, pitch: rc.pitch, kind: rc.kind });
    }
    const byKind = {};
    for (const kind of ['solid', 'poly']) {
      const list = cuts.filter(c => c.kind === kind);
      if (!list.length) continue;
      const { bins } = ffd(list, [P.l], P.l, 0);
      byKind[kind] = { panels: bins, count: bins.length };
    }
    return { panel: P, planes, cuts, byKind, count: Object.values(byKind).reduce((a, x) => a + x.count, 0), fixings: Math.ceil(fixings) };
  }

  // ---------- The shopping list ----------
  function shopping(design, cut, mesh, sheets, roof) {
    const m = design.m, u = m.units, L = design.lumber;
    const items = [];
    const push = (id, group, label, qty, unit2, note, source) => { if (qty > 0) items.push({ id, group, label, qty, unit: unit2, note: note || '', source: source || null }); };
    for (const s of cut.sections) {
      const counts = {};
      for (const b of s.boards) counts[b.stock] = (counts[b.stock] || 0) + 1;
      const roostOnly = s.sec !== L.id;
      for (const [stock, n] of Object.entries(counts).sort((a, b) => a[0] - b[0])) push(`lumber:${s.sec}:${Math.round(stock)}`, 'Lumber', `${s.lumber.label} x ${stockLabel(Number(stock), u)}${roostOnly ? ', for the roost bars' : ''}`, n, 'boards',
        roostOnly ? (design.roosts && design.roosts.flat ? 'Laid flat, wide face up.' : 'Round the top edges.') : `Actual size ${s.lumber.actual}. Use lumber rated for ground contact where the frame meets the ground.`, s.lumber.source || 'ps20');
    }
    if (sheets.wall.count) push('sheet:wall', 'Sheet goods', D.SHEET[u].wall.label, sheets.wall.count, 'sheets', 'Siding, nest boxes, ramp and any droppings board.', D.SHEET[u].wall.source);
    if (sheets.floor.count) push('sheet:floor', 'Sheet goods', D.SHEET[u].floor.label, sheets.floor.count, 'sheets', 'The hen-house floor.', D.SHEET[u].floor.source);
    if (mesh.count) push(`mesh:${mesh.mesh.id}:${Math.round(m.roll.w)}x${Math.round(m.roll.l)}`, 'Hardware cloth', `${mesh.mesh.label}, roll ${len(m.roll.w, u)} x ${len(m.roll.l, u, 'dim')}`, mesh.count, 'rolls', `${len(mesh.total, u, 'dim')} of strips${design.apron ? ', the apron included' : ''}, with ${len(mesh.overlap, u)} overlaps.`, mesh.mesh.sources[0] || null);
    if (roof) for (const [kind, r] of Object.entries(roof.byKind)) push(`panel:${kind}`, 'Roof', `${kind === 'poly' ? 'Clear corrugated polycarbonate' : 'Opaque corrugated'} panels, ${len(m.panel.w, u)} x ${len(m.panel.l, u, 'dim')}`, r.count, 'panels', `Side lap ${len(m.panel.lap, u)}.`, 'palram');
    if (roof) push('roofscrews', 'Fasteners', 'Roofing screws with sealing washers', roof.fixings, 'screws', 'An estimate: about three per panel column at each rafter. Follow the panel maker\'s fixing pattern.', 'palram');
    const sl = u === 'metric' ? (L.t + L.w > 120 ? '90 mm' : '75 mm') : (L.id === '2x4' ? '3 1/2 in' : '3 in');
    push('screws-frame', 'Fasteners', `Exterior wood screws, ${sl}`, Math.ceil(design.members.length * 4 * 1.1), 'screws', 'Two at each end of every piece, plus a tenth spare.', null);
    const ply = sheets.wall.pieces.concat(sheets.floor.pieces).reduce((s, p) => s + Math.ceil(2 * (p.w + p.l) / (u === 'metric' ? 200 : 8 * IN)), 0);
    if (ply) push('screws-ply', 'Fasteners', `Exterior wood screws for the plywood, ${u === 'metric' ? '32 mm' : '1 1/4 in'}`, ply, 'screws', 'About one every 8 in (200 mm) round each piece.', null);
    if (mesh.count) {
      const runLen = design.members.filter(x => design.runFaces.has(x.face)).reduce((s, x) => s + x.len, 0);
      const sp = u === 'metric' ? 75 : 3 * IN;
      push('staples', 'Fasteners', `Staples, ${u === 'metric' ? '13 mm' : '1/2 in'} or longer, for a heavy-duty stapler`, Math.ceil(runLen / sp), 'staples', `About one every ${len(sp, u)} along every member under the hardware cloth.`, null);
      const edge = design.faces.reduce((s, f) => s + f.rects.reduce((a, r) => a + 2 * (r.w + Math.max(r.h0, r.h1)), 0), 0);
      push('washers', 'Fasteners', `Washer-head screws or screws with fender washers, ${u === 'metric' ? '30 mm' : '1 1/4 in'}`, Math.ceil(edge / (u === 'metric' ? 300 : 12 * IN)), 'screws', `One every ${len(u === 'metric' ? 300 : 12 * IN, u)} round the edge of each piece, between the staples.`, null);
      const ringLen = mesh.seamLen + (design.apron ? design.apron.per : 0);
      if (ringLen > 0) push('rings', 'Fasteners', 'Hog rings or stainless zip ties', Math.ceil(ringLen / (u === 'metric' ? 150 : 6 * IN)), 'rings', 'One every 6 in (150 mm) along overlaps between members and where the apron meets the walls.', null);
    }
    if (design.apron && design.apron.kind === 'skirt') push('pins', 'Fasteners', 'Landscape staples (ground pins)', Math.ceil(design.apron.per / (u === 'metric' ? 300 : 12 * IN)) * 2, 'pins', 'Two rows, about one every 12 in (300 mm), so nothing can lift the skirt.', null);
    const hinges = (design.door ? 3 : 0) + 2 + (design.coop.clean ? 2 : 0) + (design.nests && design.nests.outside ? 2 : 0) + (design.coop.window ? 2 : 0) + (m.type === 'aframe' ? 2 : 0);
    push('hinges', 'Hardware', 'Exterior hinges', hinges, 'hinges', 'The doors, the clean-out door, the nest lid and any window shutter.', null);
    const latches = (design.door ? 1 : 0) + 1 + (design.coop.clean ? 1 : 0) + (design.nests && design.nests.outside ? 1 : 0) + (m.type === 'aframe' ? 1 : 0) + 1;
    push('latches', 'Hardware', 'Latches that need two actions to open, or hasps with snap hooks', latches, 'latches', 'Every door, lid and the pop door. A raccoon can work a simple latch open.', null);
    push('popdoor', 'Hardware', `Pop door ${len(design.pop.w, u)} x ${len(design.pop.h, u)} in a pair of grooved runners, or a bought one`, 1, 'door', 'Shut it every night.', null);
    if (m.type === 'tractor') push('wheels', 'Hardware', 'Wheels about 10 in (250 mm) across, with an axle bolt or threaded rod, washers and nuts', 2, 'wheels', 'At the hen-house end: lift the handles and roll it.', null);
    let total = 0, priced = 0;
    for (const it of items) { const p = m.prices[it.id]; if (p != null) { it.price = p; it.cost = r1(p * it.qty); total += it.cost; priced++; } }
    return { items, total: r1(total), priced };
  }

  // ---------- Areas and footprint ----------
  function areas(design) {
    const m = design.m;
    const coopA = design.coop.floorA;
    let runA = design.run.L * design.run.D / 1e6, under = 0;
    if (m.type === 'house') under = m.coop.w * m.coop.d / 1e6;
    else if (m.type === 'walkin' && m.addons.legs.on) { under = m.coop.w * m.coop.d / 1e6; runA += under; }
    else if (m.type === 'aframe') under = m.af.hl * m.af.w / 1e6;
    else if (m.type === 'tractor') under = m.tr.hl * m.tr.w / 1e6;
    return { coopA, runA, under };
  }
  function footprint(design) {
    const m = design.m, nd = design.nests && design.nests.outside ? design.nests.d : 0;
    if (m.type === 'house') return { x: design.run.L + nd, z: design.run.D };
    if (m.type === 'walkin') return { x: m.coop.w + design.run.L, z: m.coop.d };
    if (m.type === 'aframe') return { x: design.run.L + nd, z: design.run.D };
    return { x: m.tr.l + nd + 18 * IN, z: m.tr.w + 4 * IN };
  }

  // ---------- The checks ----------
  const SRC = id => (id && D.SOURCES[id] ? Object.assign({ id }, D.SOURCES[id]) : null);
  function checks(m, design) {
    const u = m.units, rows = [];
    const row = (id, topic, status, title, yours, limit, reason, src) => rows.push({ id, topic, status, title, yours, limit, reason, sources: (src || []).map(SRC).filter(Boolean) });
    const sz = m.size === 'bantam' ? 'bantam' : 'standard';
    const birds = m.birds;
    const A = areas(design);
    const sq = x => (u === 'metric' ? `${(x * SQFT).toFixed(2)} m²` : `${(Math.round(x * 10) / 10).toFixed(1)} sq ft`);
    const sqr = (a, b) => (u === 'metric' ? `${(a * SQFT).toFixed(2)} to ${(b * SQFT).toFixed(2)} m²` : `${a} to ${b} sq ft`);
    const ins = x => (u === 'metric' ? `${Math.round(x * IN)} mm` : `${fracIn(x * IN)} in`);
    const bird = sz === 'bantam' ? 'bantam' : 'hen';
    // ---- space ----
    const cr = RU.coop[sz], cp = sqft(A.coopA) / birds;
    const cst = cp >= cr.fits - 1e-9 ? 'fits' : cp >= cr.low - 1e-9 ? 'check' : 'fail';
    row('coop-area', 'space', cst, `Coop floor per ${bird}`, `${sq(cp)} each (${sq(sqft(A.coopA))} for ${birds})`, `${sqr(cr.range[0], cr.range[1])} a bird; ${sq(cr.fits)} or more fits`,
      cst === 'fits' ? `At or above ${sq(cr.fits)}, the lower end Virginia Tech's 2023 table gives for ${sz === 'bantam' ? 'bantams (2 to 3 sq ft)' : 'laying hens (3 to 4 sq ft)'}. The guides range from ${sqr(cr.range[0], cr.range[1])} a bird.`
        : cst === 'check' ? `Meets the older, smaller figures (${sz === 'bantam' ? 'Penn State and Maryland: 1 sq ft for bantams; Kentucky: 0.75 to 1 sq ft for small breeds' : 'Penn State and Maryland: 1.5 sq ft for laying hens, 2 for large chickens'}) but not the ${sz === 'bantam' ? '2 to 3' : '3 to 4'} sq ft in Virginia Tech's 2023 table. Give more room if the hens spend whole days inside in bad weather.`
          : `Below every published figure we read; the smallest is ${sq(cr.low)} a bird. Make the hen house bigger or keep fewer birds.`,
      sz === 'bantam' ? ['vtHousing', 'psuHousing', 'pecHousing'] : ['vtHousing', 'psuHousing', 'osuCoop', 'pecSpace']);
    const rr = RU.run[sz], rp = sqft(A.runA) / birds;
    const rst = rp >= rr.fits - 1e-9 ? 'fits' : rp >= rr.low - 1e-9 ? 'check' : 'fail';
    row('run-area', 'space', rst, `Run per ${bird}`, `${sq(rp)} each (${sq(sqft(A.runA))}${A.under > 0 && m.type !== 'walkin' ? `, ${sq(sqft(A.under))} of it under the hen house` : ''})`, `${sqr(rr.range[0], rr.range[1])} a bird; ${sq(rr.fits)} or more fits`,
      rst === 'fits' ? `At or above ${sq(rr.fits)}, ${sz === 'bantam' ? 'the low end of Virginia Tech\'s 5 to 8 sq ft for bantams' : 'the figure Virginia Tech and the Poultry Extension Collaborative give for laying hens and Penn State for large chickens'}.`
        : rst === 'check' ? `Within the published figures (${sz === 'bantam' ? 'Penn State and Maryland: 4 sq ft for bantams' : 'Cornell, Warren County: 4 to 5 sq ft; Penn State: 8 sq ft for laying hens'}) but under the ${sq(rr.fits)} of Virginia Tech's 2023 table. A longer run, or time out of it each day, helps.`
          : `Below every published figure we read; the smallest is ${sq(rr.low)} a bird. Make the run longer.`,
      sz === 'bantam' ? ['vtHousing', 'psuHousing', 'umdHousing'] : ['vtHousing', 'psuHousing', 'pecSpace', 'cornellWarren']);
    const fp = footprint(design), yw = m.yard.w, yd = m.yard.d;
    const fitsYard = (fp.x <= yw + 1 && fp.z <= yd + 1) || (fp.x <= yd + 1 && fp.z <= yw + 1);
    row('yard', 'space', fitsYard ? 'fits' : 'fail', 'Fits your yard', `${len(fp.x, u, 'dim')} by ${len(fp.z, u, 'dim')}${design.nests && design.nests.outside ? ' with the nest box' : ''}${m.type === 'tractor' ? ' and handles' : ''}`, `Your space: ${len(yw, u, 'dim')} by ${len(yd, u, 'dim')}`,
      fitsYard ? 'The footprint fits the space you entered. Leave room to walk round it, open the doors and reach the nest box.' : 'Larger than the space you entered. Make the run shorter or narrower, or try another type.', []);
    // ---- nests ----
    const n = m.nests + (m.addons.nests.on ? m.addons.nests.n : 0);
    const need5 = Math.ceil(birds / RU.nestsFits), need3 = Math.ceil(birds / 3);
    const psu = birds <= 4 ? 2 : 2 + Math.ceil((birds - 4) / 4);
    const nst = n <= 0 ? 'fail' : n >= need5 ? 'fits' : 'check';
    row('nests', 'nests', nst, 'Nest boxes', `${n} for ${birds} ${birds === 1 ? 'hen' : 'hens'}`, `${need5} to ${Math.max(need3, psu)} for ${birds}: one per 3 to 5 hens`,
      nst === 'fits' ? `Hens share nest boxes. The guides ask for one per 4 to 5 hens (Maryland, Virginia Tech), one per 4 (Oregon State), one per 5 (Maine, Florida) or one per 3 to 4 (Delaware); Penn State, two for the first four hens and one for each four more (${psu} here).`
        : nst === 'check' ? 'Fewer than one per 5 hens, the most generous count in the guides. Add a box.' : 'There is no nest box. Hens lay where they can: add at least one per 5 hens.',
      ['osuCoop', 'umdHousing', 'vtHousing', 'psuHousing', 'udel']);
    row('nest-size', 'nests', 'fits', 'Nest box size', `${ins(RU.nestSize[sz])} square, ${ins(RU.nestSize[sz])} tall`, sz === 'bantam' ? '10 x 10 in (Maryland)' : 'At least 12 x 12 in (Penn State); 12 x 12 x 12 in (Oregon State, Florida)',
      sz === 'bantam' ? 'The tool uses Maryland\'s 10 x 10 in box for bantams; the other guides size theirs for standard hens. A 3 to 4 in lip at the front keeps the nesting material in (Penn State).' : 'The size the guides give. A 3 to 4 in lip at the front keeps the nesting material in (Penn State).',
      sz === 'bantam' ? ['umdHousing', 'psuHousing'] : ['psuHousing', 'osuCoop', 'ufAN239']);
    const nb = design.nests, R2 = design.roosts;
    if (nb && R2) {
      const roostTop = R2.fy + R2.h;
      const nhOK = nb.y >= RU.nestHeight * IN - 12;
      const above = roostTop > nb.y + 1;
      const st = nhOK && above ? 'fits' : 'check';
      row('nest-height', 'nests', st, 'Nest box height', `Box floor ${len(nb.y, u)} off the ground; roost ${len(roostTop, u)}`, 'About 2 ft off the ground, the roost higher',
        st === 'fits' ? 'About 2 ft off the ground (Penn State, Florida; Maryland: 24 in above the floor). Maryland keeps the roost higher so the hens sleep on it, not in the nests; Oregon State would rather the boxes were not lower than the roosts, to keep them clean, and Penn State puts the two 4 ft apart. The tool follows Maryland.'
          : !nhOK ? 'Lower than the 2 ft off the ground the guides give. Raise the boxes on a stand.' : 'Keep the roost higher than the nest boxes so the hens do not sleep in them (Maryland). Raise the roost or lower the boxes.',
        st === 'fits' ? ['psuHousing', 'ufAN239', 'umdHousing', 'osuCoop'] : ['psuHousing', 'ufAN239', 'umdHousing']);
    }
    // ---- roosts ----
    if (R2) {
      const rr2 = RU.roost[sz];
      const per = R2.total / birds / IN;
      const st = per >= rr2.fits - 1e-9 ? 'fits' : per >= rr2.low - 1e-9 ? 'check' : sz === 'bantam' ? 'check' : 'fail';
      row('roost-length', 'roosts', st, 'Roost length', `${len(R2.total, u, 'dim')} on ${R2.bars} ${R2.bars === 1 ? 'bar' : 'bars'}: ${ins(per)} a bird`, sz === 'bantam' ? `${ins(4)} a bantam (Penn State)` : `${ins(5)} to ${ins(10)} a bird; ${ins(8)} or more fits`,
        st === 'fits' ? (sz === 'bantam' ? 'At or above the 4 in Penn State gives for bantams; Virginia Tech gives 8 to 10 in for chickens in general.' : 'At or above the 8 to 10 in of Virginia Tech\'s 2023 table: every hen can roost at once, side by side.')
          : st === 'check' ? (sz === 'bantam' ? 'Under the 4 in Penn State gives for bantams. Make the bars longer or add one.' : 'Meets Penn State (6 in), Maryland (6 to 7 in) or the low end of Oregon State (5 to 10 in), not Virginia Tech\'s 8 to 10 in. Add a bar if the hens crowd.')
            : 'Under the 5 in a bird of the smallest guide: not every hen can roost. Make the bars longer or add one.',
        sz === 'bantam' ? ['psuHousing', 'vtHousing'] : ['vtHousing', 'psuHousing', 'umdHousing', 'osuCoop']);
      const hr = RU.roostHeight[sz], hh = R2.h / IN;
      const hst = hh >= hr[0] - 0.3 && hh <= hr[1] + 0.3 ? 'fits' : 'check';
      row('roost-height', 'roosts', hst, 'Roost height', `${ins(hh)} above the floor${R2.bars > 1 ? `, bars ${ins(RU.roostGap + 2)} apart` : ''}`, `${ins(hr[0])} to ${ins(hr[1])} above the floor`,
        hst === 'fits' ? `Penn State gives ${sz === 'bantam' ? '12 to 18 in for bantams' : '18 to 24 in for standard hens'} and never more than 4 ft; Oregon State, 2 ft, with 10 in between bars.`
          : hh < hr[0] ? `Lower than the ${ins(hr[0])} Penn State gives. Raise the bar if the house is tall enough.` : 'Higher than the 4 ft Penn State gives as the most: heavy hens can hurt their feet jumping down.',
        ['psuHousing', 'osuCoop']);
      row('roost-bar', 'roosts', 'info', 'Roost bars', R2.flat ? `${u === 'metric' ? '38 x 89 mm' : '2x4'} laid flat` : `${u === 'metric' ? '45 x 45 mm' : '2x2'}, top edges rounded`, R2.flat ? 'Wide perches in the cold' : '1 to 2 in, edges rounded',
        R2.flat ? 'In a cold climate a wide perch lets the hens cover their toes against frostbite (Colorado State). Use wood: metal and plastic hold the cold (Arkansas).' : 'Oregon State suggests 1 to 2 in square lumber with the top edges rounded; Maryland, rods or branches at least 2 in across. Use wood: metal and plastic hold the cold (Arkansas).',
        R2.flat ? ['csuBoulder', 'uaexCold'] : ['osuCoop', 'umdHousing', 'uaexCold']);
    }
    // ---- ventilation ----
    const C = design.coop;
    const vRatio = C.ventPerm / 1e6 / C.floorA;
    const vst = C.ventPerm <= 0 ? 'fail' : vRatio >= RU.ventStart - 1e-6 ? 'fits' : 'check';
    const ventArea = u === 'metric' ? `${Math.round(C.ventPerm / 100)} cm²` : `${Math.round(C.ventPerm / 645.16)} sq in`;
    row('vent', 'air', vst, 'Ventilation', `${ventArea} of vents high on the walls, ${Math.round(vRatio * 100)}% of the floor${C.window ? ', and a summer window' : ''}`, 'Vents high, away from the roost; no draft on the birds',
      (vst === 'fail' ? 'There are no vents. ' : '') + 'None of the extension guides we read gives a vent area for a backyard coop. They ask for windows or vents high on one side, enough that the litter stays dry and there is no ammonia smell, with no draft on the roosting birds. The tool starts every coop with 1 sq ft of vent for each 10 sq ft of floor, a rule common in keepers\' guides that we could not trace to an extension source; open more if the litter gets damp.',
      ['psuHousing', 'pecHousing', 'uaexCold']);
    if (m.climate === 'cold') row('climate', 'air', 'info', 'Cold climate', 'Vents open all winter; wide roosts', 'Ventilate in winter too',
      'Coops need air exchange even in frigid weather, to carry out moisture and ammonia: keep vents in the roof or windows partly open, with burlap over them if you like, and repair any draft (Arkansas). Oregon State says a coop does not need insulation if there are no drafts; Arkansas suggests insulating the walls and 4 to 8 in of wood shavings. A heat lamp is a fire risk.',
      ['uaexCold', 'osuCoop', 'csuBoulder']);
    else if (m.climate === 'hot') row('climate', 'air', 'info', 'Hot climate', `${C.window ? 'A hardware-cloth window for summer; ' : ''}shade on the run`, 'More air and shade',
      `Chickens stress more in heat than cold: give plenty of water and ventilation, especially for heat; chickens can die at ${RU.heatDeath} F (Colorado State). Oregon State suggests fans in hot, humid spells. Roof part of the run for shade and keep the water out of the sun.`,
      ['csuBoulder', 'osuCoop', 'ufAN239']);
    // ---- hardware cloth and predators ----
    const me = meshOf(m);
    const pr = m.predators;
    if (me) {
      let st, reason;
      if (me.kind === 'poultry') {
        st = pr === 'low' ? 'check' : 'fail';
        reason = 'Chicken wire keeps hens in but is not a barrier to predators: most can tear through it and rats bite through the thin wire (Utah State); UConn and Colorado State say to use hardware cloth instead. Florida\'s AN239 does say chicken wire gives some protection. It is fine as a top against hawks (Colorado State).';
      } else if (me.open[0] > RU.openMax + 0.5) {
        st = pr === 'low' ? 'check' : 'fail';
        reason = 'Openings over 1 in let a raccoon reach through and pull a bird (UNH, Maryland). Colorado State says you lose fewer birds with 1 x 2 in or smaller welded wire than with 2 x 3 in.';
      } else if (me.open[1] > RU.openMax + 0.5) {
        st = pr === 'high' ? 'check' : 'fits';
        reason = 'Colorado State: you lose fewer birds with 1 x 2 in or smaller welded wire, and Oregon State builds runs of 1 by 2 in mesh. UNH asks for openings smaller than 1 in so nothing can reach through; Utah State, 1/4 to 1/2 in hardware cloth.';
      } else {
        st = 'fits';
        reason = me.open[0] <= 6.4 ? 'Hardware cloth of 1/4 in keeps out rats and young rodents too; Utah State recommends 1/4 to 1/2 in. The smallest weasels can still pass a 1/4 in hole (extension.org).' : 'Hardware cloth of 1/4 to 1/2 in gives the best protection (Utah State), and openings under 1 in stop a raccoon reaching through (UNH). The smallest weasels can pass a 1/4 in hole (extension.org).';
      }
      row('mesh', 'predators', st, 'Run walls', me.label, pr === 'low' ? 'Hardware cloth; openings under 1 in' : 'Hardware cloth, 1/4 to 1/2 in', reason,
        me.kind === 'poultry' ? ['usu', 'uconn', 'csuBoulder', 'ufAN239'] : me.open[0] > RU.openMax + 0.5 ? ['unh', 'umdPredation', 'csuPredators'] : ['usu', 'unh', 'csuPredators', 'pecPredators']);
    }
    if (m.type === 'tractor') row('apron', 'predators', 'info', 'Digging', 'A mobile tractor: no apron', 'Move it; shut the house at night',
      'A tractor sits on fresh grass, so it has no buried apron; extension.org describes floorless pens moved round the pasture, often daily. Shut the hens in the house every night and check that nothing has dug under the skids.', ['pecPredators', 'unh']);
    else {
      const ap = design.apron, k = m.apron.kind;
      let st, yours, reason;
      if (k === 'none') { st = pr === 'low' ? 'check' : 'fail'; yours = 'None'; reason = 'Foxes, dogs, raccoons and rats dig under a run. The guides bury the wire at least 12 in deep and turn it out about 6 in (Penn State, Virginia Tech, extension.org), or lay it 1 ft down and 1 ft out in an L (Colorado State).'; }
      else if (k === 'skirt') { st = 'check'; yours = `${len(ap.width, u)} skirt pinned on the surface`; reason = 'No extension guide we read gives a width for a skirt laid on the ground: they bury the hardware cloth at least 12 in deep (Penn State, UNH, extension.org) or in an L, 1 ft down and 1 ft out (Colorado State). A skirt is the no-dig option; pin it every 12 in and let the grass grow through it.'; }
      else {
        const dd = m.apron.depth / IN;
        const deepOK = dd >= RU.apronDepth - 0.3;
        const outOK = k === 'buried' ? true : ap.out / IN >= RU.apronOut - 0.3;
        st = deepOK && outOK ? 'fits' : dd >= RU.apronLow - 0.3 ? 'check' : 'fail';
        yours = k === 'lshape' ? `${ins(dd)} down, ${len(ap.out, u)} out` : `${ins(dd)} down, turned out ${ins(RU.apronToe)}`;
        reason = st === 'fits' ? (k === 'lshape' ? 'Colorado State: bury hardware cloth 1 ft down and one foot out in an L so nothing digs under; Florida, 12 to 18 in in an L. The tool lays the rest of the roll width out flat, so nothing is cut lengthwise.' : 'Bury the wire at least 12 in deep and toe it out about 6 in (Penn State, Virginia Tech, extension.org); Maryland, in a trench 12 in to 1.5 ft deep.')
          : st === 'check' ? (!outOK && deepOK ? 'The flat part is narrower than the 1 ft out of Colorado State\'s L: use a wider roll or bury it deeper.' : 'Shallower than the 12 in most guides give (Penn State, UNH, extension.org), though within Oregon State\'s 6 in to 1 ft and Cornell\'s at least 6 in.')
            : 'Shallower than every figure we read; the least is 6 in (Oregon State, Cornell). Dig deeper or lay an L.';
      }
      row('apron', 'predators', st, 'Apron against digging', yours, '12 in down, turned out; or 1 ft down and 1 ft out', reason, k === 'skirt' ? ['psuHousing', 'csuBoulder', 'unh'] : ['csuBoulder', 'psuHousing', 'vtHousing', 'pecPredators'].concat(k === 'buried' ? ['umdPredation'] : [], ['osuCoop']));
    }
    const open = (m.type === 'house' || m.type === 'walkin') && design.top === 'open';
    row('run-top', 'predators', open ? (pr === 'low' ? 'check' : 'fail') : 'fits', 'Run top', m.type === 'aframe' ? 'Closed: the sides meet at the ridge' : TOP_NAME[design.top], 'Covered',
      'A covered run is the easiest protection from hawks and owls (extension.org, UNH); a hawk gets through any loose spot, so fasten the cover well. Raccoons climb, so a top keeps them out too.', ['pecPredators', 'unh', 'umdPredation']);
    // ---- roofs ----
    for (const rc of design.roofs) {
      if (rc.aframe) continue;
      const p = rc.pitch;
      row(`roof-pitch-${rc.id}`, 'roof', p >= RU.roofPitchMin - 0.05 ? 'fits' : 'check', `${rc.label} slope`, `${p.toFixed(1)} degrees`, `At least ${RU.roofPitchMin} degrees for corrugated sheet`,
        p >= RU.roofPitchMin - 0.05 ? 'Steep enough for rain to run off corrugated sheet; Palram\'s guide asks for at least 5 degrees. Follow your panel maker\'s guide.' : 'Corrugated sheet needs a slope of at least 5 degrees (88 mm per metre) to shed water (Palram). Make the back taller than the front.', ['palram']);
    }
    row('snow', 'roof', 'info', 'Snow and wind', ROOF_NAME[m.roof], 'Check locally', 'This tool does not size the frame for snow or wind. If you get heavy snow or strong wind, ask a local builder, anchor the coop and keep snow off the roof.', []);
    // ---- materials and rules ----
    row('lumber', 'materials', 'info', 'Lumber', `${design.lumber.label}, actual ${design.lumber.actual}`, 'Treated lumber only where it meets the ground',
      'Treated lumber is wood impregnated with a pesticide, and old arsenic-treated (CCA) boards still turn up second hand (US EPA). Use lumber rated for ground contact only where the frame meets the ground, and keep treated wood where the hens cannot peck it.', ['epa']);
    row('rules', 'rules', 'info', 'Local rules', `${birds} ${sz === 'bantam' ? (birds === 1 ? 'bantam' : 'bantams') : (birds === 1 ? 'hen' : 'hens')}`, 'Check before you build', 'Many towns limit the number of hens, ban roosters or set how far a coop must stand from a boundary. Check your town\'s rules and any HOA or lease first. This tool gives no legal advice.', []);
    return rows;
  }

  // ---------- Everything at once ----------
  function evaluate(src) {
    const m = normalize(sizeFor(normalize(src)));
    const design = build(m);
    const cut = cutList(design);
    const sheets = sheetLayout(design);
    const mesh = meshLayout(design);
    const roof = roofLayout(design);
    const shop = shopping(design, cut, mesh, sheets, roof);
    const rows = checks(m, design);
    const counts = { fits: 0, check: 0, fail: 0, info: 0 };
    for (const r of rows) counts[r.status]++;
    return { m, design, cut, sheets, mesh, roof, shop, checks: rows, counts, areas: areas(design), footprint: footprint(design), steps: STEPS(design), path: henPath(design) };
  }

  // the assembly order, as the PDF prints it and the exploded view plays it
  function STEPS(design) {
    const m = design.m, T = m.type;
    const has = k => design.members.some(x => x.step === k) || design.sheets.some(x => x.step === k);
    const s = [];
    if (T === 'house') {
      s.push({ n: 1, title: 'Legs and sills', text: 'Cut the four legs and the sills that join them at the ground, brace each leg at 45 degrees and stand the frame on pavers, level.' });
      s.push({ n: 2, title: 'Hen-house floor', text: 'Build the floor frame flat, square it by measuring the diagonals, fix it to the legs and screw the plywood floor down.' });
      s.push({ n: 3, title: 'Walls and siding', text: 'Build each wall flat with its openings (the clean-out door at the front, the pop door on the run side), stand them on the floor and screw the corners. Fix the siding, leaving the vent strip open under the eaves; the cut-outs make the doors.' });
      s.push({ n: 4, title: 'Roof', text: 'Fix the rafters on edge across the walls with the overhang all round, then the corrugated panels, overlapped as the maker says, with sealing-washer screws into each rafter.' });
      s.push({ n: 5, title: 'Run frame and door', text: 'Build the run sides and the far end from the hen house out, square them, fix the top cross bars and hang the run door.' });
      s.push({ n: 6, title: 'Nest boxes, roosts and ramp', text: 'Build the nest boxes on the outside of the end wall with a hinged lid, fix the roost bars on their cleats, higher than the boxes, and hang the ramp from the pop door.' });
    } else if (T === 'walkin') {
      s.push({ n: 1, title: m.addons.legs.on ? 'Legs and floor frame' : 'Skids and floor frame', text: 'Set the skids level on pavers or blocks, build the floor frame on them, square it by the diagonals and screw down the plywood floor.' });
      s.push({ n: 2, title: 'Walls', text: 'Build each wall flat with its openings (the door, the pop door, any window), stand them up and screw the corners together.' });
      s.push({ n: 3, title: 'Siding', text: 'Fix the siding to the walls, cutting out the openings and leaving the vent strip open under the eaves.' });
      s.push({ n: 4, title: 'Roof', text: 'Fix the rafters on edge with the overhang, then the corrugated panels with sealing-washer screws into each rafter.' });
      s.push({ n: 5, title: 'Door', text: 'Build the door flat with its brace running up from the bottom hinge, side it, hang it on three hinges and fit a latch that needs two actions.' });
      s.push({ n: 6, title: 'Nest boxes and roosts', text: 'Build the nest boxes on their stand along the side wall and fix the roost bars on cleats, higher than the boxes.' });
      s.push({ n: 7, title: 'Run', text: 'Build the run sides and the far end against the coop, fix the top cross bars and hang the run door.' });
    } else if (T === 'aframe') {
      s.push({ n: 1, title: 'Base', text: 'Build the base frame on level ground and square it by the diagonals.' });
      s.push({ n: 2, title: 'A-frames and ridge', text: 'Cut the rafters with both ends at the angle, fix each pair to the base, and join their tops with the ridge board.' });
      s.push({ n: 3, title: 'House floor', text: 'Fix a floor tie across each A-frame at the house end, then the plywood floor on the ties.' });
      s.push({ n: 4, title: 'House sides, ends and roof', text: 'Fix the plywood sides over the house, one of them hinged for cleaning, the end triangle and the partition with the pop door, then the corrugated panels.' });
      s.push({ n: 5, title: 'Nest box, roost and ramp', text: 'Hang the nest box on the end, fix the roost inside and the ramp from the pop door to the ground.' });
      s.push({ n: 7, title: 'Far-end door', text: 'Fix the door posts and header in the far end and hang the door.' });
    } else {
      s.push({ n: 1, title: 'Skids and base', text: 'Cut the skids with their ends at 45 degrees so they slide, and join them with the cross pieces.' });
      s.push({ n: 2, title: 'Run frame', text: 'Stand the posts on the skids, fix the top rails and the cross bars.' });
      s.push({ n: 3, title: 'Hen-house floor and walls', text: 'Stand the house posts over the wheel end, build the floor on them, then the walls with the clean-out door.' });
      s.push({ n: 4, title: 'House siding and roof', text: 'Fix the siding and the corrugated roof panels.' });
      s.push({ n: 5, title: 'Nest box, roost and ramp', text: 'Hang the nest box on the end wall, fix the roost and the ramp from the pop door in the floor.' });
      s.push({ n: 6, title: 'Wheels and handles', text: 'Bolt the axle and wheels at the house end and the handles at the far end. Lift the handles and roll to move it.' });
    }
    s.push({ n: 9, title: 'Hardware cloth and apron', text: design.apron ? `Staple the hardware cloth to the outside of the frame strip by strip with the overlaps the layout shows and add washer-head screws round every edge. Dig the trench and lay the apron (${design.apron.label.toLowerCase()}), tied to the wall mesh with hog rings.` : 'Staple the hardware cloth to the outside of the frame strip by strip with the overlaps the layout shows and add washer-head screws round every edge.' });
    return s.filter(x => x.n === 9 || has(x.n)).sort((a, b) => a.n - b.n);
  }

  // the hen's way: from the run, up the ramp, through the pop door, to the nest box and the roost
  function henPath(design) {
    const out = [];
    const R = design.run, C = design.coop, rp = design.ramp, nb = design.nests, ro = design.roosts;
    if (!C || !R) return out;
    const runX = design.m.type === 'house' ? (C.x1 + R.x1) / 2 : design.m.type === 'walkin' ? (R.x0 + R.x1) / 2 : (C.x1 + R.x1) / 2;
    out.push({ id: 'run', label: 'Run', p: [runX, design.m.type === 'tractor' ? design.w : 0, (R.z0 + R.z1) / 2] });
    if (rp) { out.push({ id: 'ramp', label: 'Ramp', p: [rp.x1, rp.y1, rp.z], walk: true }); out.push({ id: 'pop', label: 'Pop door', p: [rp.x0, rp.y0, rp.z], walk: true }); }
    else if (C.pop) out.push({ id: 'pop', label: 'Pop door', p: [C.pop.x, C.pop.y, C.pop.z], walk: true });
    if (nb) out.push({ id: 'nest', label: 'Nest box', p: [nb.outside ? nb.x - nb.d / 2 : nb.x + nb.d / 2, nb.y, nb.z] });
    if (ro) out.push({ id: 'roost', label: 'Roost', p: [(ro.x0 + ro.x1) / 2, ro.fy + ro.h, ro.zs[0]] });
    return out;
  }

  // ---------- The share code: the whole design after the # sign, never sent anywhere ----------
  // Only what differs from the type's starting design (fresh) is written, so links stay short. The starting designs
  // are part of format v1: changing DEF, sizeFor or fresh() means a new version number here.
  function diff(o, b) {
    if (o === null || typeof o !== 'object' || Array.isArray(o)) return JSON.stringify(o) === JSON.stringify(b) ? undefined : o;
    const r = {};
    for (const k of Object.keys(o)) { const d = diff(o[k], b && typeof b === 'object' ? b[k] : undefined); if (d !== undefined) r[k] = d; }
    return Object.keys(r).length ? r : undefined;
  }
  function merge(b, o) {
    if (!o || typeof o !== 'object' || Array.isArray(o)) return o === undefined ? b : o;
    const r = Object.assign({}, b);
    for (const k of Object.keys(o)) r[k] = b && b[k] && typeof b[k] === 'object' && !Array.isArray(b[k]) ? merge(b[k], o[k]) : o[k];
    return r;
  }
  function round(o) {
    if (Array.isArray(o)) return o.map(round);
    if (o && typeof o === 'object') { const r = {}; for (const [k, v] of Object.entries(o)) r[k] = round(v); return r; }
    return typeof o === 'number' ? Math.round(o * 100) / 100 : o;
  }
  function encode(m) {
    const n = round(normalize(m));
    const d = diff(n, round(fresh(n.type, n.units))) || {};
    const json = JSON.stringify(Object.assign({ v: 1, type: n.type, units: n.units }, d));
    const b64 = typeof Buffer !== 'undefined' ? Buffer.from(json, 'utf8').toString('base64') : btoa(unescape(encodeURIComponent(json)));
    return b64.replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
  }
  function decode(code) {
    try {
      if (!/^[A-Za-z0-9_-]{8,8000}$/.test(String(code))) return null;
      const b64 = String(code).replace(/-/g, '+').replace(/_/g, '/');
      const json = typeof Buffer !== 'undefined' ? Buffer.from(b64, 'base64').toString('utf8') : decodeURIComponent(escape(atob(b64)));
      const o = JSON.parse(json);
      if (!o || o.v !== 1 || !TYPES.includes(o.type)) return null;
      return normalize(merge(fresh(o.type, o.units), o));
    } catch (e) { return null; }
  }

  return { TYPES, TYPE_NAME, TYPE_SHORT, CLIMATES, PREDATORS, ROOFS, ROOF_NAME, TOPS, TOP_NAME, APRONS, APRON_NAME, IN, FT, SQFT,
    fresh, sample, sizeFor, normalize, lumberOf, meshOf, defaultRoll, autoNests, build, ffd, cutList, sheetLayout, stripsFor, meshLayout, roofLayout, shopping, checks, areas, footprint, evaluate, steps: STEPS, henPath,
    encode, decode, round, unit, fracIn, fmtIn, fmtFtIn, fmtMm, len, both, area, sqft, stockLabel, toInput, fromInput, D };
});
