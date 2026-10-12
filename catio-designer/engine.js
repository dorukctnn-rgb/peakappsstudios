/* Catio Designer: the engine. Pure functions from a design (the numbers the user typed) to:
 *  - the frame, member by member, in standard lumber (build), with the assembly step of each piece;
 *  - the cut list, packed first-fit-decreasing onto stock lengths (ffd, cutList);
 *  - the mesh strips for the roll width with overlaps, packed onto rolls (meshLayout);
 *  - plywood pieces on sheets and roof panels on panel lengths;
 *  - the shopping list (quantities, and totals only from prices the user types);
 *  - the checks, each with a reason and a source (data.js), and the shade over the longest day (SunCalc);
 *  - the share code kept after the # sign (encode, decode).
 * Lengths are millimetres inside; the page shows inches or millimetres. Coordinates: x along the wall (0 to w),
 * y up, z out from the wall (0 to d). Works in the browser (window.CatioEngine) and in Node for the tests.
 * Guidance for a hobby build, never an engineering guarantee. */
(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory(require('./data.js'));
  else root.CatioEngine = factory(root.CatioData);
})(typeof self !== 'undefined' ? self : this, function (D) {
  'use strict';
  const IN = D.IN, FT = D.FT;
  const RU = D.RULES;
  const clamp = (x, a, b) => Math.min(b, Math.max(a, x));
  const num = (x, d) => (x === '' || x === null || x === undefined || !Number.isFinite(Number(x)) ? d : Number(x));
  const r1 = x => Math.round(x * 100) / 100;
  const TYPES = ['window', 'leanto', 'free', 'balcony'];
  const TYPE_NAME = { window: 'Window box', leanto: 'Lean-to on a wall', free: 'Freestanding', balcony: 'Balcony or deck screen-in' };
  const ROOFS = ['mesh', 'poly', 'solid', 'none'];
  const ROOF_NAME = { mesh: 'Mesh', poly: 'Clear polycarbonate panels', solid: 'Solid (opaque) panels', none: 'No roof' };
  const FLOORS = ['plywood', 'meshfloor', 'ground', 'existing'];
  const FLOOR_NAME = { plywood: 'Plywood floor', meshfloor: 'Mesh under the base frame', ground: 'Open ground', existing: 'Patio, pavers, deck or balcony floor' };

  // ---------- Defaults per type: imperial in inches, metric in millimetres ----------
  const DEF = {
    window: { w: 48, d: 24, h: 36, h2: 33, win: [30, 27, 0], lumber: '2x2', roof: 'poly', shade: 0, floor: 'plywood', shelves: 2, ramp: 1, door: false },
    leanto: { w: 96, d: 48, h: 84, h2: 72, win: [30, 27, 36], lumber: '2x3', roof: 'poly', shade: 0, floor: 'existing', shelves: 3, ramp: 1, door: true },
    free: { w: 96, d: 72, h: 80, h2: 72, win: [24, 24, 0], lumber: '2x3', roof: 'mesh', shade: 0.5, floor: 'meshfloor', shelves: 3, ramp: 1, door: true },
    balcony: { w: 72, d: 48, h: 96, h2: 96, win: [30, 80, 0], lumber: '2x2', roof: 'none', shade: 0, floor: 'existing', shelves: 2, ramp: 1, door: false },
  };
  const DEF_M = {
    window: { w: 1200, d: 600, h: 900, h2: 830, win: [750, 700, 0] },
    leanto: { w: 2400, d: 1200, h: 2100, h2: 1800, win: [750, 700, 900] },
    free: { w: 2400, d: 1800, h: 2000, h2: 1800, win: [600, 600, 0] },
    balcony: { w: 1800, d: 1200, h: 2400, h2: 2400, win: [750, 2000, 0] },
  };
  const meshById = id => D.MESH.find(x => x.id === id) || null;
  const lumberList = units => D.LUMBER[units === 'metric' ? 'metric' : 'imperial'];
  function lumberOf(m) { const list = lumberList(m.units); return list.find(l => l.id === m.lumber) || list[1]; }
  function defaultRoll(meshId, units) {
    const me = meshById(meshId);
    const metricRoll = r => Math.abs(r[0] % 100) < 1e-6;
    const rolls = me && me.rolls.length ? me.rolls.filter(r => (units === 'metric') === metricRoll(r)) : [];
    const pick = rolls.length ? rolls.reduce((a, b) => (b[1] > a[1] ? b : a)) : (me && me.rolls[0]) || D.ROLL_DEFAULT[units];
    return { w: pick[0], l: pick[1] };
  }

  function fresh(type, units) {
    type = TYPES.includes(type) ? type : 'window';
    units = units === 'metric' ? 'metric' : 'imperial';
    const d = DEF[type], dm = DEF_M[type];
    const L = (k) => (units === 'metric' ? dm[k] : d[k] * IN);
    const win = units === 'metric' ? dm.win : d.win.map(x => x * IN);
    const meshId = units === 'metric' ? 'wm13-19' : 'hc12-19';
    return normalize({
      v: 1, name: '', type, units,
      w: L('w'), d: L('d'), h: L('h'), h2: L('h2'),
      win: { w: win[0], h: win[1], sill: win[2] },
      cats: 1, agility: 'athletic',
      lumber: units === 'metric' ? D.SWAP[d.lumber] : d.lumber,
      stock: D.STOCK[units][0].mm,
      spacing: units === 'metric' ? 600 : 24 * IN,
      mesh: meshId, custom: { a: 25.4, b: 25.4, gauge: 16 }, roll: defaultRoll(meshId, units), overlap: units === 'metric' ? 25 : 1 * IN,
      roof: d.roof, shade: d.shade,
      panel: units === 'metric' ? { w: 860, l: 2400, lap: 75 } : { w: 26 * IN, l: 8 * FT, lap: 3 * IN },
      floor: d.floor, door: d.door, doorW: units === 'metric' ? 760 : 30 * IN,
      shelves: d.shelves, ramp: d.ramp,
      tunnel: { l: 0, w: units === 'metric' ? 300 : 12 * IN, h: units === 'metric' ? 300 : 12 * IN },
      bal: { left: false, right: true, ceiling: true, nodrill: true },
      wall: 'wood', facing: 180, lat: null, city: '',
      gaps: { wall: 0, ground: 0, window: 0 },
      prices: {},
      addons: {
        bridge: { on: false, l: units === 'metric' ? 1800 : 72 * IN, h: units === 'metric' ? 900 : 36 * IN },
        litter: { on: false },
        insert: { on: false, kind: 'sash', size: units === 'metric' ? 300 : 12 * IN, flap: units === 'metric' ? [200, 200] : [8 * IN, 8 * IN] },
        tier: { on: false },
      },
      sample: false,
    });
  }

  // The sample: a realistic window box for one cat under a sash window, as on the page. Marked "Sample" wherever it shows.
  function sample() {
    const m = fresh('window', 'imperial');
    Object.assign(m, { name: 'Sample window box', w: 48 * IN, d: 24 * IN, h: 36 * IN, h2: 33 * IN, win: { w: 30 * IN, h: 27 * IN, sill: 0 },
      cats: 1, lumber: '2x2', stock: 8 * FT, mesh: 'hc12-19', roll: { w: 36 * IN, l: 50 * FT }, roof: 'poly', shade: 1,
      floor: 'plywood', shelves: 2, ramp: 1, wall: 'wood', facing: 180, lat: 40.7, city: 'New York, NY', sample: true });
    return normalize(m);
  }

  // ---------- Normalise anything (a form, a decoded link) into a valid design ----------
  function normalize(src) {
    const s = src && typeof src === 'object' ? src : {};
    const type = TYPES.includes(s.type) ? s.type : 'window';
    const units = s.units === 'metric' ? 'metric' : 'imperial';
    const base = DEF[type];
    const lim = (x, a, b, d) => clamp(num(x, d), a, b);
    const m = { v: 1, name: String(s.name || '').slice(0, 60), type, units };
    const minW = type === 'window' ? 400 : 600;
    m.w = lim(s.w, minW, 9000, base.w * IN);
    m.d = lim(s.d, 250, 6000, base.d * IN);
    m.h = lim(s.h, 400, 3600, base.h * IN);
    m.h2 = lim(s.h2, 300, m.h, Math.min(m.h, base.h2 * IN));
    if (type === 'balcony' && s.bal && s.bal.ceiling !== false) m.h2 = m.h;
    const win = s.win || {};
    m.win = { w: lim(win.w, 150, 4000, base.win[0] * IN), h: lim(win.h, 150, 3000, base.win[1] * IN), sill: lim(win.sill, 0, 3000, base.win[2] * IN) };
    m.cats = Math.round(lim(s.cats, 1, 8, 1));
    m.agility = s.agility === 'cautious' ? 'cautious' : 'athletic';
    const list = lumberList(units);
    m.lumber = list.some(l => l.id === s.lumber) ? s.lumber : (units === 'metric' ? D.SWAP[base.lumber] : base.lumber);
    const stocks = D.STOCK[units].map(x => x.mm);
    m.stock = stocks.reduce((a, b) => (Math.abs(b - num(s.stock, stocks[0])) < Math.abs(a - num(s.stock, stocks[0])) ? b : a));
    m.spacing = lim(s.spacing, 300, 1220, units === 'metric' ? 600 : 24 * IN);
    m.mesh = s.mesh === 'custom' || meshById(s.mesh) ? s.mesh : (units === 'metric' ? 'wm13-19' : 'hc12-19');
    const c = s.custom || {};
    m.custom = { a: lim(c.a, 1, 200, 25.4), b: lim(c.b, 1, 300, 25.4), gauge: c.gauge === null || c.gauge === '' ? null : Math.round(lim(c.gauge, 8, 30, 16)) };
    if (m.custom.b < m.custom.a) [m.custom.a, m.custom.b] = [m.custom.b, m.custom.a];
    const roll = s.roll || defaultRoll(m.mesh, units);
    m.roll = { w: lim(roll.w, 300, 3000, 914.4), l: lim(roll.l, 600, 60000, 15240) };
    m.overlap = lim(s.overlap, 0, m.roll.w / 3, 25.4);
    m.roof = ROOFS.includes(s.roof) ? s.roof : base.roof;
    m.shade = [0, 0.5, 1].includes(Number(s.shade)) ? Number(s.shade) : 0;
    const p = s.panel || {};
    m.panel = { w: lim(p.w, 300, 2000, 26 * IN), l: lim(p.l, 600, 8000, 8 * FT), lap: lim(p.lap, 0, 300, 3 * IN) };
    if (m.panel.lap >= m.panel.w / 2) m.panel.lap = m.panel.w / 4;
    m.floor = FLOORS.includes(s.floor) ? s.floor : base.floor;
    if (type === 'window' && (m.floor === 'ground' || m.floor === 'existing')) m.floor = 'plywood';
    m.doorW = lim(s.doorW, 450, 1200, units === 'metric' ? 760 : 30 * IN);
    m.shelves = Math.round(lim(s.shelves, 0, 5, base.shelves));
    m.ramp = s.ramp ? 1 : 0;
    const tu = s.tunnel || {};
    m.tunnel = { l: type === 'free' ? lim(tu.l, 0, 6000, 0) : 0, w: lim(tu.w, 200, 600, 12 * IN), h: lim(tu.h, 200, 600, 12 * IN) };
    const b = s.bal || {};
    m.bal = { left: !!b.left, right: b.right === undefined ? true : !!b.right, ceiling: b.ceiling === undefined ? true : !!b.ceiling, nodrill: b.nodrill === undefined ? true : !!b.nodrill };
    if (!m.bal.ceiling) m.bal.nodrill = false;
    if (type === 'balcony' && m.bal.ceiling) m.roof = 'none';
    m.door = !!s.door && doorFits(m);
    m.wall = D.WALLS[s.wall] ? s.wall : 'wood';
    m.facing = ((Math.round(num(s.facing, 180)) % 360) + 360) % 360;
    m.lat = s.lat === null || s.lat === '' || s.lat === undefined || !Number.isFinite(Number(s.lat)) ? null : clamp(Number(s.lat), -66, 66);
    m.city = String(s.city || '').slice(0, 80);
    const g = s.gaps || {};
    m.gaps = { wall: lim(g.wall, 0, 300, 0), ground: lim(g.ground, 0, 300, 0), window: lim(g.window, 0, 300, 0) };
    m.prices = {};
    if (s.prices && typeof s.prices === 'object') for (const [k, v] of Object.entries(s.prices)) { const n = Number(v); if (/^[\w:.\-x]{1,60}$/.test(k) && Number.isFinite(n) && n >= 0 && n < 1e6) m.prices[k] = Math.round(n * 100) / 100; }
    const a = s.addons || {};
    const ab = a.bridge || {}, ai = a.insert || {};
    m.addons = {
      bridge: { on: !!ab.on, l: lim(ab.l, 600, 6000, 72 * IN), h: lim(ab.h, 300, 2400, 36 * IN) },
      litter: { on: !!(a.litter && a.litter.on) },
      insert: { on: !!ai.on, kind: ai.kind === 'slider' ? 'slider' : 'sash', size: lim(ai.size, 150, 900, 12 * IN), flap: [lim((ai.flap || [])[0], 100, 500, 8 * IN), lim((ai.flap || [])[1], 100, 500, 8 * IN)] },
      tier: { on: !!(a.tier && a.tier.on) && type !== 'window' && m.h >= 1500 },
    };
    m.sample = !!s.sample;
    return m;
  }
  // a walk-in door needs a front wall at least 66 in (1680 mm) tall and wide enough for the door and a stud each side
  function doorFits(m) {
    if (m.type === 'window') return false;
    const L = lumberOf(m);
    return m.h2 >= 1680 && m.w >= m.doorW + 2 * L.t + 300;
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
    const ft = Math.floor(inches / 12), rest = inches - ft * 12;
    return rest ? `${ft} ft ${fracIn(rest * IN)} in` : `${ft} ft`;
  }
  const fmtMm = mm => `${Math.round(mm)} mm`;
  function len(mm, units, kind = 'cut') { return units === 'metric' ? fmtMm(mm) : kind === 'dim' ? fmtFtIn(mm) : fmtIn(mm); }
  const both = (mm, units, kind = 'cut') => (units === 'metric' ? `${fmtMm(mm)} (${fmtIn(mm)})` : `${len(mm, units, kind)} (${fmtMm(mm)})`);
  function area(m2, units) { return units === 'metric' ? `${(Math.round(m2 * 100) / 100).toFixed(2)} m²` : `${(Math.round(m2 * 10.7639 * 10) / 10).toFixed(1)} sq ft`; }
  function stockLabel(mm, units) { const s = D.STOCK[units].concat(D.STOCK[units === 'metric' ? 'imperial' : 'metric']).find(x => Math.abs(x.mm - mm) < 1); return s ? s.label : len(mm, units, 'dim'); }
  // the value shown in a form field: inches to the nearest 1/8 (imperial) or centimetres to 0.1 (metric)
  function toInput(mm, units) { return units === 'metric' ? String(Math.round(mm) / 10) : String(Math.round(mm / IN * 8) / 8); }
  function fromInput(str, units) { const n = Number(String(str).replace(',', '.')); if (!Number.isFinite(n)) return NaN; return units === 'metric' ? n * 10 : n * IN; }
  const deg = r => r * 180 / Math.PI;
  // "1 board", "2 boards"
  const unit = (qty, word) => (qty === 1 ? String(word).replace(/([^s])s$/, '$1') : word);

  // ---------- The frame ----------
  // Every member: a box from p0 to p1 (its centre line), a by b in section, a measured along `up`. len is the cut length.
  function build(m) {
    const L = lumberOf(m), t = L.t, w = L.w;
    const W = m.w, Dp = m.d, Hb = m.h;
    const ceiling = m.type === 'balcony' && m.bal.ceiling;
    const Hf = ceiling ? m.h : m.h2;
    const attached = m.type !== 'free';
    const hasRoof = !ceiling && m.roof !== 'none';
    const barT = hasRoof ? t : 0;
    const top = z => (Hb - barT) + ((Hf - barT) - (Hb - barT)) * clamp(z / Dp, 0, 1);
    const M = [], sheets = [], faces = [], notes = [];
    let seq = 0;
    const add = (kind, step, p0, p1, up, o = {}) => {
      const dir = [p1[0] - p0[0], p1[1] - p0[1], p1[2] - p0[2]];
      const length = Math.hypot(...dir);
      const mem = Object.assign({ id: `${kind}-${++seq}`, kind, step, p0, p1, up, a: t, b: w, len: length, sec: L.id }, o);
      if (o.len == null) mem.len = length;
      M.push(mem); return mem;
    };
    const sideL = x => !(m.type === 'balcony' && ((x === 'L' && m.bal.left) || (x === 'R' && m.bal.right)));
    const hasLeft = sideL('L'), hasRight = sideL('R');
    const stock = m.stock;
    // split a straight run [a, b] at the given joint positions so each piece fits the stock length
    function splitRun(a, b, joints) {
      const cuts = [a];
      let start = a;
      const js = joints.filter(j => j > a + 1 && j < b - 1).sort((x, y) => x - y);
      while (b - start > stock) {
        const ok = js.filter(j => j - start <= stock && j > start + 1);
        const j = ok.length ? ok[ok.length - 1] : start + stock;
        cuts.push(j); start = j;
      }
      cuts.push(b);
      const out = [];
      for (let i = 0; i < cuts.length - 1; i++) out.push([cuts[i], cuts[i + 1]]);
      return out;
    }
    const evenly = (a, b, maxGap, width) => { // centres of members of `width` from a to b, clear gaps at most maxGap
      const span = b - a - width;
      const n = Math.max(1, Math.ceil(span / (maxGap + width))) + 1;
      return Array.from({ length: n }, (_, i) => a + width / 2 + span * i / (n - 1));
    };

    // ---- the front wall, with the door ----
    const S = m.spacing;
    const yF = top(Dp);
    const zF = Dp - w / 2;
    let door = null;
    if (m.door) {
      const gap = 6;
      const Wo = m.doorW + 2 * gap;
      const xa = clamp(W / 2 - Wo / 2 - t, t, W - Wo - 2 * t); // left door stud's left face
      const xb = xa + t + Wo;                                  // right door stud's left face
      const full = yF - 2 * t;
      const dh = Math.min(full - 2 * gap, 78 * IN);
      const header = dh + 2 * gap < full - t;
      door = { xa, xb, x0: xa + t + gap, w: m.doorW, h: dh, y0: t + gap, header, hdrY: t + dh + 2 * gap, gap };
    }
    function wallStuds(a, b, exclude) { // stud left faces along a run, skipping the door opening
      if (!exclude) return evenly(a, b, S, t).map(c => c - t / 2);
      const left = evenly(a, exclude[0] + t, S, t).map(c => c - t / 2);
      const right = evenly(exclude[1], b, S, t).map(c => c - t / 2);
      return left.concat(right);
    }
    const frontStuds = wallStuds(0, W, door ? [door.xa, door.xb] : null);
    const frontStep = attached ? 2 : 1;
    for (const [a, b] of splitRun(0, W, frontStuds.map(x => x + t / 2))) {
      add('plate', frontStep, [a, t / 2, zF], [b, t / 2, zF], [0, 1, 0], { face: 'front', where: 'Front wall, bottom plate' });
      add('plate', frontStep, [a, yF - t / 2, zF], [b, yF - t / 2, zF], [0, 1, 0], { face: 'front', where: 'Front wall, top plate' });
    }
    for (const x of frontStuds) add('stud', frontStep, [x + t / 2, t, zF], [x + t / 2, yF - t, zF], [1, 0, 0], { face: 'front', where: 'Front wall, stud' });
    if (door && door.header) add('header', frontStep, [door.xa + t, door.hdrY + t / 2, zF], [door.xb, door.hdrY + t / 2, zF], [0, 1, 0], { face: 'front', where: 'Front wall, door header' });
    const brace = 6 * IN;
    const braceAt = (step, face, pA, pB) => add('brace', step, pA, pB, null, { face, where: 'Corner brace, 45 degree cuts', angled: true });
    braceAt(frontStep, 'front', [t, yF - t - brace / Math.SQRT2, zF], [t + brace / Math.SQRT2, yF - t, zF]);
    braceAt(frontStep, 'front', [W - t, yF - t - brace / Math.SQRT2, zF], [W - t - brace / Math.SQRT2, yF - t, zF]);

    // ---- the back wall (freestanding only) ----
    const zB = w / 2, yB = top(0);
    let backStuds = [];
    if (!attached) {
      backStuds = wallStuds(0, W, null);
      for (const [a, b] of splitRun(0, W, backStuds.map(x => x + t / 2))) {
        add('plate', 2, [a, t / 2, zB], [b, t / 2, zB], [0, 1, 0], { face: 'back', where: 'Back wall, bottom plate' });
        add('plate', 2, [a, yB - t / 2, zB], [b, yB - t / 2, zB], [0, 1, 0], { face: 'back', where: 'Back wall, top plate' });
      }
      for (const x of backStuds) add('stud', 2, [x + t / 2, t, zB], [x + t / 2, yB - t, zB], [1, 0, 0], { face: 'back', where: 'Back wall, stud' });
      braceAt(2, 'back', [t, yB - t - brace / Math.SQRT2, zB], [t + brace / Math.SQRT2, yB - t, zB]);
      braceAt(2, 'back', [W - t, yB - t - brace / Math.SQRT2, zB], [W - t - brace / Math.SQRT2, yB - t, zB]);
    }

    // ---- the side walls, sloping with the roof ----
    const z0 = attached ? 0 : w, z1 = Dp - w;
    const sideStep = attached ? 1 : 3;
    const sideStudsZ = evenly(z0, z1, S, t);
    const sides = [];
    if (hasLeft) sides.push(['L', w / 2]);
    if (hasRight) sides.push(['R', W - w / 2]);
    for (const [s, xc] of sides) {
      const name = s === 'L' ? 'Left wall' : 'Right wall';
      for (const [a, b] of splitRun(z0, z1, sideStudsZ)) {
        add('plate', sideStep, [xc, t / 2, a], [xc, t / 2, b], [0, 1, 0], { face: 'side' + s, where: `${name}, bottom plate` });
        const ya = top(a) - t / 2, yb = top(b) - t / 2, dz = b - a, dy = yb - ya, l = Math.hypot(dz, dy);
        add('plate', sideStep, [xc, ya, a], [xc, yb, b], [0, dz / l, -dy / l], { face: 'side' + s, where: `${name}, top plate${Math.abs(dy) > 1 ? ', ends cut to the roof slope' : ''}`, angled: Math.abs(dy) > 1 });
      }
      sideStudsZ.forEach((zc, i) => {
        const tall = top(Math.max(z0, zc - t / 2)) - 2 * t;
        const fixed = attached && i === 0 && !(m.type === 'balcony' && m.bal.nodrill);
        add('stud', sideStep, [xc, t, zc], [xc, t + tall, zc], [0, 0, 1], { face: 'side' + s, where: `${name}, stud${fixed ? ', fixed to the house wall' : ''}${Math.abs(Hb - Hf) > 1 ? ', top cut to the slope' : ''}`, wallFix: fixed, len: tall });
      });
      const ya = top(z1) - t;
      braceAt(sideStep, 'side' + s, [xc, ya - brace / Math.SQRT2, z1 - t / 2], [xc, ya, z1 - t / 2 - brace / Math.SQRT2]);
    }

    // ---- the roof frame: bars across the width on top of the walls, beams front to back where the span is long ----
    const bars = [];
    if (hasRoof) {
      const zs = evenly(0, Dp, Math.min(S, RU.purlinEnd), w);
      const inner = W - (hasLeft ? w : 0) - (hasRight ? w : 0);
      const maxSpan = 1220;
      const beamsX = [];
      if (inner > maxSpan) {
        const n = Math.ceil(inner / maxSpan) - 1;
        for (let i = 1; i <= n; i++) {
          const want = W * i / (n + 1);
          const near = frontStuds.map(x => x + t / 2).reduce((a, b) => (Math.abs(b - want) < Math.abs(a - want) ? b : a), want);
          beamsX.push(near);
        }
        for (const xb of beamsX) {
          const a = z0, b = z1;
          const ya = top(a) - t / 2, yb = top(b) - t / 2, dz = b - a, dy = yb - ya, l = Math.hypot(dz, dy);
          add('beam', 4, [xb, ya, a], [xb, yb, b], [0, dz / l, -dy / l], { face: 'roof', where: `Roof beam, front to back${attached ? ', back end fixed to the house wall' : ''}`, wallFix: attached && !(m.type === 'balcony'), angled: Math.abs(dy) > 1 });
        }
      }
      const supports = [w / 2].concat(beamsX, [W - w / 2]);
      zs.forEach((zc, i) => {
        const y = top(zc) + t / 2;
        const back = attached && i === 0;
        for (const [a, b] of splitRun(0, W, supports)) bars.push(add('bar', 4, [a, y, zc], [b, y, zc], [0, 1, 0], { face: 'roof', where: back ? 'Roof bar at the house wall (the ledger)' : 'Roof bar', wallFix: back }));
      });
    }
    const slope = Math.atan2(Hb - Hf, Dp);

    // ---- the floor ----
    const sheetT = D.SHEET[m.units].t;
    if (m.floor === 'plywood' || (m.type === 'window' && m.floor === 'meshfloor')) {
      const fx0 = hasLeft ? w : 0, fx1 = W - (hasRight ? w : 0);
      if (attached) add('ledger', 1, [fx0, t / 2, w / 2], [fx1, t / 2, w / 2], [0, 1, 0], { face: 'floor', where: 'Floor ledger, fixed to the house wall', wallFix: m.type !== 'balcony' || !m.bal.nodrill });
      const ja = attached ? w : w, jb = Dp - w;
      const xs = evenly(fx0, fx1, Math.min(S, 16 * IN), t);
      for (const xc of xs.slice(1, -1)) add('joist', attached ? 1 : 3, [xc, t / 2, ja], [xc, t / 2, jb], [0, 1, 0], { face: 'floor', where: 'Floor joist' });
      if (m.floor === 'plywood') sheets.push({ id: 'floor', where: 'Floor', w: fx1 - fx0, l: jb - ja + (attached ? w : 0), step: 3, at: [fx0, t, attached ? 0 : w] });
    }
    // window box: knee braces under each side wall into a cleat on the house wall
    if (m.type === 'window') {
      const zb = Math.min(Dp - w, 24 * IN);
      for (const [, xc] of sides) {
        add('cleat', 1, [xc, -zb - 150, w / 2], [xc, 0, w / 2], [0, 0, 1], { face: 'under', where: 'Wall cleat under the box, fixed to the house wall', wallFix: true });
        add('brace', 1, [xc, -zb, w], [xc, 0, zb + w], null, { face: 'under', where: 'Knee brace, 45 degree cuts', angled: true });
      }
    }

    // ---- the door leaf ----
    if (door) {
      const x0 = door.x0, y0 = door.y0, dw = door.w, dh = door.h, zd = zF;
      add('stile', 5, [x0 + t / 2, y0, zd], [x0 + t / 2, y0 + dh, zd], [1, 0, 0], { face: 'door', where: 'Door, hinge stile' });
      add('stile', 5, [x0 + dw - t / 2, y0, zd], [x0 + dw - t / 2, y0 + dh, zd], [1, 0, 0], { face: 'door', where: 'Door, latch stile' });
      for (const y of [y0 + t / 2, y0 + dh / 2, y0 + dh - t / 2]) add('rail', 5, [x0 + t, y, zd], [x0 + dw - t, y, zd], [0, 1, 0], { face: 'door', where: 'Door, rail' });
      add('brace', 5, [x0 + t, y0 + t, zd], [x0 + dw - t, y0 + dh / 2 - t / 2, zd], null, { face: 'door', where: 'Door, diagonal brace (hinge side low)', angled: true });
    }

    // ---- the tunnel (freestanding) ----
    let tunnel = null;
    if (m.type === 'free' && m.tunnel.l > 0) {
      const tw = m.tunnel.w, th = m.tunnel.h, tl = m.tunnel.l, ty = m.win.sill;
      const tx0 = clamp(W / 2 - tw / 2, 0, W - tw);
      tunnel = { x0: tx0, w: tw, h: th, l: tl, y: ty, z0: 0, z1: -tl };
      for (const xc of [tx0 + t / 2, tx0 + tw - t / 2]) for (const yc of [ty + t / 2, ty + th - t / 2]) add('rail', 7, [xc, yc, 0], [xc, yc, -tl], [0, 1, 0], { face: 'tunnel', where: 'Tunnel, long rail', a: t, b: t });
      for (const zc of evenly(-tl, 0, 24 * IN, t)) {
        add('stud', 7, [tx0 + t / 2, ty + t, zc], [tx0 + t / 2, ty + th - t, zc], [0, 0, 1], { face: 'tunnel', where: 'Tunnel, frame post', a: t, b: t });
        add('stud', 7, [tx0 + tw - t / 2, ty + t, zc], [tx0 + tw - t / 2, ty + th - t, zc], [0, 0, 1], { face: 'tunnel', where: 'Tunnel, frame post', a: t, b: t });
        if (ty > 50) for (const xc of [tx0 + t / 2, tx0 + tw - t / 2]) add('post', 7, [xc, 0, zc], [xc, ty, zc], [0, 0, 1], { face: 'tunnel', where: 'Tunnel, leg', a: t, b: t });
      }
      sheets.push({ id: 'tunnel-floor', where: 'Tunnel floor', w: tw, l: tl, step: 7, at: [tx0, ty + t, -tl] });
    }

    // ---- add-ons (Pro) ----
    let bridge = null, litter = null, insert = null, tier = null;
    if (m.addons.bridge.on) {
      const bw = m.tunnel.w, bh = m.tunnel.h, bl = m.addons.bridge.l, by = Math.min(m.addons.bridge.h, top(Dp / 2) - bh - t);
      const bz0 = clamp(Dp / 2 - bw / 2, 0, Dp - bw);
      bridge = { z0: bz0, w: bw, h: bh, l: bl, y: by, x0: W, x1: W + bl };
      for (const zc of [bz0 + t / 2, bz0 + bw - t / 2]) for (const yc of [by + t / 2, by + bh - t / 2]) add('rail', 8, [W, yc, zc], [W + bl, yc, zc], [0, 1, 0], { face: 'bridge', where: 'Bridge, long rail', a: t, b: t, addon: 'bridge' });
      for (const xc of evenly(W, W + bl, 24 * IN, t)) {
        for (const zc of [bz0 + t / 2, bz0 + bw - t / 2]) {
          add('stud', 8, [xc, by + t, zc], [xc, by + bh - t, zc], [1, 0, 0], { face: 'bridge', where: 'Bridge, frame post', a: t, b: t, addon: 'bridge' });
        }
      }
      for (const xc of [W + bl / 2, W + bl - t / 2]) for (const zc of [bz0 + t / 2, bz0 + bw - t / 2]) add('post', 8, [xc, 0, zc], [xc, by, zc], [1, 0, 0], { face: 'bridge', where: 'Bridge, leg', addon: 'bridge' });
      sheets.push({ id: 'bridge-floor', where: 'Bridge floor', w: bw, l: bl, step: 8, at: [W, by + t, bz0], addon: 'bridge' });
      notes.push('Cut an opening in the right wall mesh where the bridge joins, and frame it so no gap is left round the bridge.');
    }
    if (m.addons.litter.on) {
      const lw = m.units === 'metric' ? 900 : 36 * IN, ld = m.units === 'metric' ? 450 : 18 * IN, lh = m.units === 'metric' ? 450 : 18 * IN;
      const lx0 = (hasLeft ? w : 0) + 10, lz0 = attached ? 10 : w + 10;
      const fits = lw < W - 2 * w - 20 && ld < Dp - 2 * w - 20;
      if (fits) {
        litter = { x0: lx0, z0: lz0, w: lw, d: ld, h: lh };
        for (const [xc, zc] of [[lx0 + t / 2, lz0 + t / 2], [lx0 + lw - t / 2, lz0 + t / 2], [lx0 + t / 2, lz0 + ld - t / 2], [lx0 + lw - t / 2, lz0 + ld - t / 2]]) add('post', 8, [xc, 0, zc], [xc, lh - sheetT, zc], [0, 0, 1], { face: 'litter', where: 'Litter bench, corner post', a: t, b: t, addon: 'litter' });
        for (const zc of [lz0 + t / 2, lz0 + ld - t / 2]) add('rail', 8, [lx0 + t, lh - sheetT - t / 2, zc], [lx0 + lw - t, lh - sheetT - t / 2, zc], [0, 1, 0], { face: 'litter', where: 'Litter bench, top rail', a: t, b: t, addon: 'litter' });
        sheets.push({ id: 'litter-lid', where: 'Litter bench, hinged lid', w: ld, l: lw, step: 8, at: [lx0, lh - sheetT, lz0], addon: 'litter' });
        sheets.push({ id: 'litter-front', where: 'Litter bench, front with the entry hole', w: lh - sheetT, l: lw, step: 8, addon: 'litter' });
        sheets.push({ id: 'litter-back', where: 'Litter bench, back', w: lh - sheetT, l: lw, step: 8, addon: 'litter' });
        sheets.push({ id: 'litter-end-1', where: 'Litter bench, end', w: lh - sheetT, l: ld - 2 * sheetT, step: 8, addon: 'litter' });
        sheets.push({ id: 'litter-end-2', where: 'Litter bench, end', w: lh - sheetT, l: ld - 2 * sheetT, step: 8, addon: 'litter' });
      } else notes.push('The litter bench does not fit inside this footprint; make the catio larger or leave the bench out.');
    }
    if (m.addons.insert.on && (m.type === 'window' || m.type === 'leanto' || m.type === 'balcony')) {
      const k = m.addons.insert.kind, sz = m.addons.insert.size;
      insert = k === 'sash' ? { kind: k, w: m.win.w, h: sz, flap: m.addons.insert.flap } : { kind: k, w: sz, h: m.win.h, flap: m.addons.insert.flap };
      sheets.push({ id: 'insert', where: `Window insert panel (${k === 'sash' ? 'sash window' : 'sliding window'}), cut-out for the cat flap`, w: Math.min(insert.w, insert.h), l: Math.max(insert.w, insert.h), step: 8, addon: 'insert' });
    }
    if (m.addons.tier.on) {
      const ty = Math.round(Math.min(top(Dp / 2) * 0.5, top(Dp / 2) - 600));
      const td = Math.min(Dp / 2, 24 * IN);
      const tz0 = attached ? 0 : w, tz1 = tz0 + td;
      const tx0 = hasLeft ? w : 0, tx1 = W - (hasRight ? w : 0);
      tier = { y: ty, z0: tz0, z1: tz1, x0: tx0, x1: tx1 };
      for (const [a, b] of splitRun(tx0, tx1, [])) add('beam', 8, [a, ty - t / 2, tz1 - w / 2], [b, ty - t / 2, tz1 - w / 2], [0, 1, 0], { face: 'tier', where: 'Second tier, front beam', addon: 'tier' });
      for (const xc of [tx0 + t / 2, tx1 - t / 2]) add('post', 8, [xc, 0, tz1 - w / 2], [xc, ty - t, tz1 - w / 2], [1, 0, 0], { face: 'tier', where: 'Second tier, post', addon: 'tier' });
      if (attached) add('ledger', 8, [tx0, ty - t / 2, w / 2], [tx1, ty - t / 2, w / 2], [0, 1, 0], { face: 'tier', where: 'Second tier, ledger on the house wall', wallFix: m.type !== 'balcony' || !m.bal.nodrill, addon: 'tier' });
      sheets.push({ id: 'tier-deck', where: 'Second tier deck', w: td, l: tx1 - tx0, step: 8, at: [tx0, ty, tz0], addon: 'tier' });
    }

    // ---- shelves and the ramp ----
    const shelfD = m.units === 'metric' ? 250 : 10 * IN;
    const head = m.units === 'metric' ? 300 : 12 * IN;
    const perches = [];
    // the wall the shelves hang on: the front wall unless the door is there, then a side wall
    let anchor;
    if (!door) anchor = { wall: 'front', axis: 'x', r0: (hasLeft ? w : 0) + 10, r1: W - (hasRight ? w : 0) - 10, inner: Dp - w, sign: -1, H: top(Dp) };
    else if (hasLeft || hasRight) { const xr = hasLeft ? w : W - w; anchor = { wall: hasLeft ? 'sideL' : 'sideR', axis: 'z', r0: (attached ? 0 : w) + 10, r1: Dp - w - 10, inner: xr, sign: hasLeft ? 1 : -1, H: Math.min(top(0), top(Dp)) }; }
    else { const gl = door.xa - (hasLeft ? w : 0), gr = W - (hasRight ? w : 0) - door.xb - t; anchor = gl >= gr ? { wall: 'front', axis: 'x', r0: 10, r1: door.xa - 10, inner: Dp - w, sign: -1, H: top(Dp) } : { wall: 'front', axis: 'x', r0: door.xb + t + 10, r1: W - 10, inner: Dp - w, sign: -1, H: top(Dp) }; }
    const run = Math.max(0, anchor.r1 - anchor.r0);
    const n = m.shelves;
    const shelves = [];
    if (n > 0 && run > 200) {
      const Ls = Math.min(24 * IN, run);
      const pitch = n > 1 ? (run - Ls) / (n - 1) : 0;
      // steps of about 16 in (400 mm): a few shelves stay low and reachable; add shelves to climb higher
      const stepTarget = m.units === 'metric' ? 400 : 16 * IN;
      const yTop = Math.max(150, Math.min(anchor.H - head - t, n * stepTarget));
      for (let k = 0; k < n; k++) {
        const s0 = anchor.r0 + (n > 1 ? k * pitch : (run - Ls) / 2);
        const y = Math.round(yTop * (k + 1) / n);
        const sh = { k, y, s0, s1: s0 + Ls, depth: shelfD, axis: anchor.axis, inner: anchor.inner, sign: anchor.sign, wall: anchor.wall };
        shelves.push(sh);
        sheets.push({ id: `shelf-${k + 1}`, where: `Shelf ${k + 1}`, w: shelfD, l: Ls, step: 6, shelf: sh });
        // two cleats under each shelf, cut from the frame lumber, screwed to the wall frame
        for (const e of [s0 + t, s0 + Ls - t]) {
          if (anchor.axis === 'x') add('cleat', 6, [e, y - sheetT - t / 2, anchor.inner], [e, y - sheetT - t / 2, anchor.inner - shelfD], [0, 1, 0], { face: 'shelf', where: `Shelf ${k + 1}, support cleat`, a: t, b: t });
          else add('cleat', 6, [anchor.inner, y - sheetT - t / 2, e], [anchor.inner + anchor.sign * shelfD, y - sheetT - t / 2, e], [0, 1, 0], { face: 'shelf', where: `Shelf ${k + 1}, support cleat`, a: t, b: t });
        }
      }
    }
    let ramp = null;
    if (m.ramp && shelves.length) {
      const s = shelves[0];
      const room = (anchor.axis === 'x' ? Dp - w - (attached ? 0 : w) : W - 2 * w) - shelfD - 20;
      const rise = s.y;
      const runR = clamp(rise / Math.tan(35 * Math.PI / 180), 100, Math.max(100, room));
      const rw = m.units === 'metric' ? 200 : 8 * IN;
      ramp = { rise, run: runR, angle: deg(Math.atan2(rise, runR)), w: rw, len: Math.hypot(rise, runR), shelf: s };
      sheets.push({ id: 'ramp', where: 'Ramp (add outdoor carpet or sisal for grip)', w: rw, l: ramp.len, step: 6 });
    }
    // perches for the path: the entry, the floor, the tier, the shelves
    const entryY = m.type === 'free' && !tunnel ? 0 : m.type === 'free' ? m.win.sill : m.win.sill;
    perches.push({ id: 'entry', label: tunnel ? 'Tunnel' : m.type === 'free' ? 'Door' : 'Window', y: entryY });
    perches.push({ id: 'floor', label: 'Floor', y: 0 });
    shelves.forEach(s => perches.push({ id: `shelf-${s.k + 1}`, label: `Shelf ${s.k + 1}`, y: s.y, shelf: s }));
    if (tier) perches.push({ id: 'tier', label: 'Second tier', y: tier.y });

    // ---- mesh faces ----
    const hb = top(0), hf = top(Dp);
    const sideH = [hb, hf];
    const rect = (wid, h0, h1) => ({ w: wid, h0, h1: h1 == null ? h0 : h1 });
    if (door) {
      const fr = [rect(door.xa + t, hf), rect(W - door.xb, hf)];
      if (door.header) fr.push(rect(door.xb - door.xa - t, hf - door.hdrY));
      faces.push({ id: 'front', label: 'Front wall', rects: fr });
      faces.push({ id: 'door', label: 'Door', rects: [rect(door.w, door.h)] });
    } else faces.push({ id: 'front', label: 'Front wall', rects: [rect(W, hf)] });
    if (hasLeft) faces.push({ id: 'sideL', label: 'Left wall', rects: [rect(Dp, sideH[0], sideH[1])] });
    if (hasRight) faces.push({ id: 'sideR', label: 'Right wall', rects: [rect(Dp, sideH[0], sideH[1])] });
    if (!attached) faces.push({ id: 'back', label: 'Back wall', rects: [rect(W, hb)] });
    if (hasRoof && m.roof === 'mesh') faces.push({ id: 'roof', label: 'Roof', rects: [rect(W, Math.hypot(Dp, Hb - Hf))] });
    if (m.floor === 'meshfloor') faces.push({ id: 'floor', label: m.type === 'window' ? 'Floor' : 'Floor, under the base frame', rects: [rect(W, Dp)] });
    if (tunnel) faces.push({ id: 'tunnel', label: 'Tunnel', rects: [rect(tunnel.l, tunnel.h), rect(tunnel.l, tunnel.h), rect(tunnel.l, tunnel.w), rect(tunnel.w, tunnel.h)] });
    if (bridge) faces.push({ id: 'bridge', label: 'Bridge', rects: [rect(bridge.l, bridge.h), rect(bridge.l, bridge.h), rect(bridge.l, bridge.w), rect(bridge.w, bridge.h)] });

    // ---- the roof covering ----
    const roofCover = hasRoof && (m.roof === 'poly' || m.roof === 'solid') ? { w: W, slope: Math.hypot(Dp, Hb - Hf), pitch: deg(slope), bars: bars.length } : null;

    // the outline of each wall face and the frame lines on it, for the mesh staples
    const meshOn = new Set(faces.map(f => f.id));
    let stapleRun = 0;
    for (const mem of M) {
      const f = mem.face === 'sideL' || mem.face === 'sideR' || mem.face === 'front' || mem.face === 'back' || mem.face === 'door' || mem.face === 'tunnel' || mem.face === 'bridge' ? mem.face : mem.face === 'roof' && meshOn.has('roof') ? 'roof' : null;
      if (f && (meshOn.has(f) || f === 'door')) stapleRun += mem.len;
    }
    if (m.floor === 'meshfloor') stapleRun += 2 * (W + Dp);

    const tension = m.type === 'balcony' && m.bal.nodrill ? tensionPosts(m, W, Dp, hasLeft, hasRight) : 0;
    return { m, lumber: L, t, w, W, D: Dp, Hb, Hf, top, attached, hasRoof, ceiling, hasLeft, hasRight, slope: deg(slope), members: M, sheets, faces, door, bars, roofCover, shelves, ramp, perches, tunnel, bridge, litter, insert, tier, stapleRun, tension, notes, anchor };
  }
  // tension posts: one at each open corner, and one every 1.8 m (6 ft) or less along the open faces
  function tensionPosts(m, W, Dp, hasLeft, hasRight) {
    const max = 1830;
    let n = 2 + Math.max(0, Math.ceil(W / max) - 1);
    if (hasLeft) n += Math.max(0, Math.ceil(Dp / max) - 1);
    if (hasRight) n += Math.max(0, Math.ceil(Dp / max) - 1);
    return n;
  }

  // ---------- First-fit decreasing, for boards, mesh rolls and roof panels ----------
  // cuts: [{len, ...}]; stocks: available lengths; preferred: the length to open first; kerf: lost per saw cut.
  function ffd(cuts, stocks, preferred, kerf = 0) {
    const all = stocks.slice().sort((a, b) => a - b);
    const items = cuts.slice().sort((a, b) => b.len - a.len || String(a.where || '').localeCompare(String(b.where || '')));
    const bins = [], tooLong = [];
    for (const c of items) {
      let bin = bins.find(b => b.left + 1e-6 >= c.len + (b.cuts.length ? kerf : 0));
      if (!bin) {
        const L = c.len <= preferred + 1e-6 ? preferred : all.find(s => s + 1e-6 >= c.len);
        if (!L) { tooLong.push(c); continue; }
        bin = { stock: L, cuts: [], left: L };
        bins.push(bin);
      }
      bin.left -= c.len + (bin.cuts.length ? kerf : 0);
      bin.cuts.push(c);
    }
    for (const b of bins) { b.used = b.stock - b.left; b.leftover = Math.max(0, b.left - kerf); }
    return { bins, tooLong };
  }

  // ---------- The cut list ----------
  function cutList(design) {
    const m = design.m;
    const kerf = m.units === 'metric' ? 3 : IN / 8;
    const stocks = D.STOCK[m.units].map(s => s.mm);
    const roundUp = x => (m.units === 'metric' ? Math.ceil(x - 0.01) : Math.ceil(x / IN * 16 - 0.01) / 16 * IN);
    const cuts = design.members.map(mem => ({ id: mem.id, len: roundUp(mem.len), where: mem.where, kind: mem.kind, angled: !!mem.angled, step: mem.step, addon: mem.addon || null }));
    const { bins, tooLong } = ffd(cuts, stocks, m.stock, kerf);
    bins.forEach((b, i) => { b.n = i + 1; b.cuts.sort((x, y) => y.len - x.len); });
    const byStock = {};
    for (const b of bins) byStock[b.stock] = (byStock[b.stock] || 0) + 1;
    const total = cuts.reduce((s, c) => s + c.len, 0);
    const bought = bins.reduce((s, b) => s + b.stock, 0);
    return { kerf, cuts, boards: bins, byStock, tooLong, total, bought, waste: bought ? 1 - total / bought : 0, section: design.lumber };
  }

  // ---------- Plywood pieces on sheets: pieces in strips along the sheet, strips packed across it ----------
  function sheetLayout(design) {
    const m = design.m, sh = D.SHEET[m.units];
    const pieces = [];
    for (const p of design.sheets) {
      // tile anything larger than a sheet, seams over the frame
      const across = Math.max(1, Math.ceil(Math.min(p.w, p.l) / sh.w - 1e-9)), along = Math.max(1, Math.ceil(Math.max(p.w, p.l) / sh.l - 1e-9));
      const pw = Math.min(p.w, p.l) / across, pl = Math.max(p.w, p.l) / along;
      for (let i = 0; i < across * along; i++) pieces.push({ id: p.id + (across * along > 1 ? `.${i + 1}` : ''), where: p.where, w: Math.ceil(pw), l: Math.ceil(pl), addon: p.addon || null });
    }
    const kerf = m.units === 'metric' ? 3 : IN / 8;
    // strips: first-fit decreasing by width, each strip as long as the sheet
    const sorted = pieces.slice().sort((a, b) => b.w - a.w || b.l - a.l);
    const strips = [];
    for (const p of sorted) {
      let s = strips.find(x => x.width >= p.w && x.left + 1e-6 >= p.l + (x.pieces.length ? kerf : 0));
      if (!s) { s = { width: p.w, left: sh.l, pieces: [] }; strips.push(s); }
      s.left -= p.l + (s.pieces.length ? kerf : 0); s.pieces.push(p);
    }
    const { bins } = ffd(strips.map((s, i) => ({ len: s.width, where: `strip ${i + 1}`, strip: s })), [sh.w], sh.w, kerf);
    const area = pieces.reduce((a, p) => a + p.w * p.l, 0) / 1e6;
    return { sheet: sh, pieces, sheets: bins.map(b => ({ strips: b.cuts.map(c => c.strip), left: b.leftover })), count: bins.length, area };
  }

  // ---------- Mesh: strips for the roll width, with overlaps, then packed onto rolls ----------
  function stripsFor(rect, R, o, pitch) {
    const up = x => Math.ceil(x / pitch - 1e-9) * pitch;
    const hmax = Math.max(rect.h0, rect.h1), hmin = Math.min(rect.h0, rect.h1);
    const hAt = x => rect.h0 + (rect.h1 - rect.h0) * (x / rect.w);
    const count = span => (span <= R + 1e-6 ? 1 : 1 + Math.ceil((span - R) / (R - o) - 1e-9));
    // vertical strips side by side across the width
    const nv = count(rect.w), vert = [];
    for (let i = 0; i < nv; i++) { const a = i * (R - o), b = Math.min(rect.w, a + R); vert.push({ len: up(Math.max(hAt(a), hAt(b))), cover: b - a, at: a }); }
    // horizontal strips stacked up the height
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
  function meshOf(m) {
    if (m.mesh === 'custom') return { id: 'custom', label: 'Your mesh', kind: 'welded', open: [m.custom.a, m.custom.b], gauge: m.custom.gauge, coat: 'as you entered', rolls: [], sources: [] };
    return meshById(m.mesh);
  }
  function meshLayout(design) {
    const m = design.m, R = m.roll.w, o = Math.min(m.overlap, R / 3);
    const me = meshOf(m);
    const pitch = me.open ? me.open[1] : 12.7;
    const faces = design.faces.map(f => ({ id: f.id, label: f.label, rects: f.rects.map(r => Object.assign({ rect: r }, stripsFor(r, R, o, Math.min(pitch, 25.4)))) }));
    const cuts = [];
    for (const f of faces) for (const [ri, r] of f.rects.entries()) for (const [si, s] of r.strips.entries()) {
      // a strip longer than a roll is cut in two with an end overlap
      let rest = s.len, part = 0;
      while (rest > 0) { const l = Math.min(rest, m.roll.l); cuts.push({ len: l, where: `${f.label}${f.rects.length > 1 ? `, part ${ri + 1}` : ''}, strip ${si + 1}${part ? ` (continued)` : ''}`, face: f.id }); rest = rest - l > 0 ? rest - l + o : 0; part++; if (part > 20) break; }
    }
    const { bins } = ffd(cuts, [m.roll.l], m.roll.l, 0);
    const total = cuts.reduce((a, c) => a + c.len, 0);
    const seamLen = faces.reduce((a, f) => a + f.rects.reduce((b, r) => b + r.seams * (r.orient === 'vertical' ? Math.max(r.rect.h0, r.rect.h1) : r.rect.w), 0), 0);
    return { roll: m.roll, overlap: o, faces, cuts, rolls: bins, count: bins.length, total, seamLen, mesh: me };
  }

  // ---------- Roof panels: columns across the width, pieces down the slope, cut from panel lengths ----------
  function roofLayout(design) {
    const m = design.m, rc = design.roofCover;
    if (!rc) return null;
    const P = m.panel, over = m.units === 'metric' ? 50 : 2 * IN, endLap = 200;
    const cols = Math.max(1, Math.ceil((rc.w - P.lap) / (P.w - P.lap) - 1e-9));
    const need = rc.slope + over;
    const cuts = [];
    for (let c = 0; c < cols; c++) {
      if (need <= P.l + 1e-6) cuts.push({ len: Math.ceil(need), where: `Column ${c + 1}` });
      else { const k = Math.ceil((need - endLap) / (P.l - endLap) - 1e-9); for (let i = 0; i < k; i++) cuts.push({ len: i < k - 1 ? P.l : Math.ceil(need - (k - 1) * (P.l - endLap)), where: `Column ${c + 1}, row ${i + 1}` }); }
    }
    const { bins } = ffd(cuts, [P.l], P.l, 0);
    // fixings: an estimate of five per panel piece at each roof bar it crosses; follow the panel maker's pattern
    const fixings = cuts.length * Math.max(2, design.bars.length / Math.max(1, Math.ceil(need / P.l))) * 5;
    return { panel: P, cols, need, cuts, panels: bins, count: bins.length, fixings: Math.ceil(fixings), pitch: rc.pitch };
  }

  // ---------- The shopping list ----------
  function shopping(design, cut, mesh, sheets, roof) {
    const m = design.m, u = m.units, L = design.lumber;
    const items = [];
    const push = (id, group, label, qty, unit, note, source) => { if (qty > 0) items.push({ id, group, label, qty, unit, note: note || '', source: source || null }); };
    for (const [stock, n] of Object.entries(cut.byStock).sort((a, b) => a[0] - b[0])) push(`lumber:${L.id}:${Math.round(stock)}`, 'Lumber', `${L.label} x ${stockLabel(Number(stock), u)}`, n, 'boards', `Actual size ${L.actual}. Untreated cedar, redwood or pine.`, L.source);
    if (sheets.count) push('sheet', 'Sheet goods', D.SHEET[u].label, sheets.count, 'sheets', 'Floor, shelves, ramp and add-on panels.', D.SHEET[u].source);
    if (mesh.count) push(`mesh:${mesh.mesh.id}:${Math.round(m.roll.w)}x${Math.round(m.roll.l)}`, 'Mesh', `${mesh.mesh.label}, roll ${len(m.roll.w, u)} x ${len(m.roll.l, u, 'dim')}`, mesh.count, 'rolls', `${len(mesh.total, u, 'dim')} of strips with ${len(mesh.overlap, u)} overlaps.`, mesh.mesh.sources[0] || null);
    if (roof) push('panel', 'Roof', `${m.roof === 'poly' ? 'Clear corrugated polycarbonate' : 'Opaque corrugated'} panels, ${len(m.panel.w, u)} x ${len(m.panel.l, u, 'dim')}`, roof.count, 'panels', `${roof.cols} columns; side lap ${len(m.panel.lap, u)}.`, 'palram');
    if (roof) push('roofscrews', 'Fasteners', 'Roofing screws with sealing washers', roof.fixings, 'screws', 'An estimate: about five per panel piece at each roof bar. Follow the panel maker\'s fixing pattern.', 'palram');
    const joints = design.members.length;
    const sl = u === 'metric' ? (L.t + L.w > 120 ? '90 mm' : '75 mm') : (L.id === '2x4' ? '3 1/2 in' : '3 in');
    push('screws-frame', 'Fasteners', `Exterior wood screws, ${sl}`, Math.ceil(joints * 4 * 1.1), 'screws', 'Two at each end of every piece, plus a tenth spare.', 'bcspca');
    const fix = design.members.filter(x => x.wallFix).reduce((s, x) => s + Math.max(2, Math.ceil(x.len / (16 * IN)) + 1), 0);
    if (fix) push('wallfix', 'Fasteners', m.wall === 'masonry' ? 'Masonry anchors for outdoor use' : 'Structural screws or lag screws for the wall fixings', fix, 'fixings', 'One per stud crossing on the wall battens and ledger. See the attachment detail for your wall.', null);
    const ply = sheets.pieces.reduce((s, p) => s + Math.ceil(2 * (p.w + p.l) / (u === 'metric' ? 200 : 8 * IN)), 0);
    if (ply) push('screws-ply', 'Fasteners', `Exterior wood screws for the plywood, ${u === 'metric' ? '32 mm' : '1 1/4 in'}`, ply, 'screws', 'About one every 8 in (200 mm) round each piece.', null);
    if (mesh.count) {
      const sp = u === 'metric' ? 75 : 3 * IN;
      push('staples', 'Fasteners', `Staples, ${u === 'metric' ? '13 mm' : '1/2 in'} or longer, for a heavy-duty stapler`, Math.ceil(design.stapleRun / sp), 'staples', `About one every ${len(sp, u)} along every member under the mesh.`, 'bcspca');
      const per = design.faces.reduce((s, f) => s + f.rects.reduce((a, r) => a + 2 * (r.w + Math.max(r.h0, r.h1)), 0), 0);
      push('washers', 'Fasteners', `Washer-head screws or screws with fender washers, ${u === 'metric' ? '30 mm' : '1 1/4 in'}`, Math.ceil(per / (u === 'metric' ? 300 : 12 * IN)), 'screws', `One every ${len(u === 'metric' ? 300 : 12 * IN, u)} round the edge of each mesh panel, between the staples.`, null);
      if (mesh.seamLen > 0) push('ties', 'Fasteners', 'Hog rings or stainless zip ties for overlaps between members', Math.ceil(mesh.seamLen / (u === 'metric' ? 150 : 6 * IN)), 'ties', 'One every 6 in (150 mm) along each overlap.', null);
    }
    if (design.door) { push('hinges', 'Hardware', 'Exterior door hinges', design.door.h >= 60 * IN ? 3 : 2, 'hinges', 'For the walk-in door.', 'bcspca'); push('latch', 'Hardware', 'Door latch with a safety cord or clip', 1, 'latch', 'A latch the cat cannot nose open.', 'bcspca'); }
    if (design.litter) { push('hinges-lid', 'Hardware', 'Hinges for the litter bench lid', 2, 'hinges', '', null); push('hasp', 'Hardware', 'Hasp or latch for the litter bench lid', 1, 'latch', '', null); }
    if (design.insert) push('catflap', 'Hardware', 'Cat flap for the window insert', 1, 'flap', `Cut-out ${len(design.insert.flap[0], u)} x ${len(design.insert.flap[1], u)}, or the size on the flap's instructions.`, null);
    if (design.tension) push('tension', 'Hardware', `Floor-to-ceiling tension posts, adjustable to ${len(m.h, u, 'dim')}`, design.tension, 'posts', 'No drilling: the frames clamp to the posts.', null);
    let total = 0, priced = 0;
    for (const it of items) { const p = m.prices[it.id]; if (p != null) { it.price = p; it.cost = r1(p * it.qty); total += it.cost; priced++; } }
    return { items, total: r1(total), priced };
  }

  // ---------- Shade over the longest day (SunCalc) ----------
  // The house wall is taken as at least 2.4 m (8 ft) above the catio floor; a solid roof, shade cloth or a balcony
  // ceiling over the catio shade the floor; mesh and clear panels do not.
  function shade(m, design, SunCalc) {
    if (!SunCalc || m.lat == null) return null;
    const lat = m.lat;
    const year = 2026, south = lat < 0;
    const F = m.facing * Math.PI / 180;
    const xh = [Math.cos(F), -Math.sin(F)], zh = [Math.sin(F), Math.cos(F)]; // local x and z in (east, north)
    const W = design.W, Dp = design.D, Hb = design.Hb, Hf = design.Hf;
    const solidRoof = design.ceiling || (design.hasRoof && m.roof === 'solid');
    const cover = solidRoof ? 1 : design.hasRoof ? m.shade : 0;   // the share of the roof, from the back, that blocks sun
    const wallTop = Math.max(Hb, 2438);
    const N = 20;
    const hours = [];
    for (let h = 4; h <= 20; h++) {
      const date = new Date(Date.UTC(year, south ? 11 : 5, 21, h, 0, 0));
      const pos = SunCalc.getPosition(date, lat, 0);
      const alt = pos.altitude;
      if (alt <= 0) continue;
      const bearing = pos.azimuth + Math.PI;
      const e = Math.cos(alt) * Math.sin(bearing), nn = Math.cos(alt) * Math.cos(bearing);
      const s = [e * xh[0] + nn * xh[1], Math.sin(alt), e * zh[0] + nn * zh[1]];
      let shaded = 0;
      for (let i = 0; i < N; i++) for (let j = 0; j < N; j++) {
        const px = (i + 0.5) / N * W, pz = (j + 0.5) / N * Dp;
        let hit = false;
        if (cover > 0) {
          const k = (Hf - Hb) / Dp;
          const den = s[1] - k * s[2];
          if (den > 1e-9) {
            const tt = (Hb + k * pz) / den;
            const x = px + tt * s[0], z = pz + tt * s[2];
            if (x >= 0 && x <= W && z >= 0 && z <= Dp * cover + (design.ceiling ? Dp : 0)) hit = true;
          }
        }
        if (!hit && design.attached && s[2] < -1e-9) {
          const tt = -pz / s[2];
          if (tt * s[1] < wallTop) hit = true;
        }
        if (hit) shaded++;
      }
      hours.push({ h, alt: deg(alt), bearing: (deg(bearing) + 360) % 360, frac: shaded / (N * N) });
    }
    const mid = hours.filter(x => x.h >= RU.shadeFrom && x.h <= RU.shadeTo);
    const worst = mid.reduce((a, b) => (b.frac < a.frac ? b : a), mid[0] || { frac: 1, h: 12 });
    const noon = hours.reduce((a, b) => (b.alt > a.alt ? b : a), hours[0]);
    return { date: `${year}-${south ? '12' : '06'}-21`, lat, hours, worst, noon, sunAll: hours.some(x => x.frac < 1) };
  }

  // ---------- The checks ----------
  const SRC = id => (id && D.SOURCES[id] ? Object.assign({ id }, D.SOURCES[id]) : null);
  function checks(m, design, sun) {
    const u = m.units, rows = [];
    const row = (id, topic, status, title, yours, limit, reason, src) => rows.push({ id, topic, status, title, yours, limit, reason, sources: (src || []).map(SRC).filter(Boolean) });
    const me = meshOf(m);
    // mesh: material, opening, gauge
    if (me.kind === 'screen') row('mesh-material', 'mesh', 'fail', 'Mesh material', me.label, 'Welded wire or hardware cloth', 'Window and porch screen is not sturdy enough for claws, and it is easy for persistent cats and wildlife to get through.', ['csMesh', 'csPred']);
    else if (me.kind === 'poultry') row('mesh-material', 'mesh', 'fail', 'Mesh material', me.label, 'Welded wire or hardware cloth', 'Chicken wire is not very strong, can leave jagged edges when cut and may rust. It ranges from 19 to 22 gauge.', ['csMesh', 'csPred']);
    else if (me.kind === 'vinyl') row('mesh-material', 'mesh', 'check', 'Mesh material', me.label, 'Galvanized welded wire', 'Vinyl-coated wire breaks down and splits over time, and a cat may chew it. Galvanized wire lasts longer.', ['csMesh']);
    else row('mesh-material', 'mesh', 'fits', 'Mesh material', me.label, 'Welded wire or hardware cloth', 'Welded steel mesh, galvanized or stainless, as the catio guides use.', me.sources.length ? me.sources.concat(['csMesh']).slice(0, 3) : ['csMesh']);
    if (me.open) {
      const ok = me.open[0] <= RU.meshMaxOpen[0] + 0.5 && me.open[1] <= RU.meshMaxOpen[1] + 0.5;
      row('mesh-opening', 'mesh', ok ? 'fits' : 'fail', 'Mesh opening', `${len(me.open[0], u)} x ${len(me.open[1], u)}`, `No more than ${len(RU.meshMaxOpen[0], u)} x ${len(RU.meshMaxOpen[1], u)}`, ok ? 'Inside the largest grid opening the catio guides recommend. Smaller openings also keep out more wildlife.' : 'Larger than the largest grid opening the catio guides recommend for keeping a cat in and predators out.', ['csPred', 'bcspca']);
    }
    if (me.kind === 'welded' || me.kind === 'vinyl') {
      const g = me.gauge;
      if (g == null) row('mesh-gauge', 'mesh', 'check', 'Wire gauge', 'Not stated', `${RU.meshGauge} gauge or heavier (a lower number)`, 'The listing gives no wire gauge. Check it on the label: the lower the number, the stronger the wire.', ['csMesh']);
      else if (g <= RU.meshGauge) row('mesh-gauge', 'mesh', 'fits', 'Wire gauge', `${g} gauge`, `${RU.meshGauge} gauge or heavier`, 'As strong as the 16 gauge fencing wire recommended for keeping coyotes out.', ['csPred']);
      else if (g <= RU.poultryGauge[0]) row('mesh-gauge', 'mesh', 'check', 'Wire gauge', `${g} gauge`, `${RU.meshGauge} gauge or heavier`, 'Lighter than the 16 gauge one guide recommends. 19 gauge welded mesh is sold for pet runs; where coyotes, raccoons or dogs visit, choose the heavier wire.', ['csPred', 'sf13']);
      else row('mesh-gauge', 'mesh', 'fail', 'Wire gauge', `${g} gauge`, `${RU.meshGauge} gauge or heavier`, 'Thinner than chicken wire, which ranges from 19 to 22 gauge and is not strong enough for a catio.', ['csPred', 'csMesh']);
    }
    // the largest gap
    const gaps = [['wall', 'between the frame and the house wall', design.attached], ['ground', 'under the bottom plate', true], ['window', 'round the window or cat door', design.attached || !!design.tunnel]].filter(g => g[2]).map(([k, where]) => ({ k, where, mm: m.gaps[k] }));
    if (design.door) gaps.push({ k: 'door', where: 'round the walk-in door', mm: design.door.gap });
    const big = gaps.reduce((a, b) => (b.mm > a.mm ? b : a), gaps[0]);
    const capG = Math.min(RU.gapCap, me.open ? me.open[0] : RU.gapCap);
    row('gap', 'gap', big.mm <= capG + 0.01 ? 'fits' : 'fail', 'Largest gap', `${len(big.mm, u)} ${big.where}`, `No wider than ${len(capG, u)}`, 'There should be no openings a cat could squeeze through, even on top. No guide gives a gap size, so the tool holds every gap to the short side of your mesh opening and never more than 1 in (25 mm).', ['hwCatios']);
    // the roof
    if (!design.hasRoof && !design.ceiling) row('roof', 'roof', 'fail', 'Roof', 'None', 'Mesh or panels over the top', 'Cats climb, so a catio needs a top; a roof also keeps hawks and other climbers out.', ['hwCatios', 'csPred']);
    else if (design.ceiling) row('roof', 'roof', 'check', 'Top', 'The balcony ceiling', 'Closed to the ceiling', 'Close every gap between the frames and the ceiling: there should be no openings, even on top.', ['hwCatios']);
    else row('roof', 'roof', 'fits', 'Roof', ROOF_NAME[m.roof], 'Mesh or panels over the top', 'A covered top keeps the cat in and climbers and birds of prey out.', ['hwCatios', 'csPred']);
    if (design.roofCover) {
      const p = design.roofCover.pitch;
      row('roof-pitch', 'roof', p >= RU.roofPitchMin - 0.05 ? 'fits' : 'check', 'Roof slope for panels', `${p.toFixed(1)} degrees`, `At least ${RU.roofPitchMin} degrees`, p >= RU.roofPitchMin - 0.05 ? 'Steep enough for rain to run off the corrugated panels.' : 'Corrugated panels need a slope of at least 5 degrees (88 mm per metre) to shed water. Lower the front height.', ['palram']);
    }
    row('snow', 'roof', 'info', 'Snow and wind', ROOF_NAME[m.roof], 'Check locally', 'Make sure the roof is strong enough for any snowfall you get. This tool does not size the frame for snow or wind; ask a local builder or your building department if you get heavy snow.', ['hwCatios']);
    // shelves and steps
    const lim = m.agility === 'cautious' ? RU.stepCautious : RU.stepAthletic;
    const steps = pathSteps(design);
    for (const s of steps) {
      const sid = s.from === 'entry' ? 'step-entry' : `step-${s.to}`;
      if (s.walk) { row(sid, 'shelves', 'info', `${s.fromLabel} to ${s.toLabel}`, `Ramp at ${Math.round(design.ramp.angle)} degrees`, 'A ramp', 'A ramp turns this step into a walk. Cover it with outdoor carpet or sisal for grip.', []); continue; }
      const st = s.rise <= lim + 0.5 ? 'fits' : s.rise <= RU.stepAthletic + 0.5 ? 'check' : 'fail';
      row(sid, 'shelves', st, `${s.fromLabel} to ${s.toLabel}`, `${len(s.rise, u)} ${s.down ? 'down' : 'up'}`, `Up to ${len(lim, u)} for ${m.agility === 'cautious' ? 'a kitten, an older or a cautious cat' : 'a young, athletic cat'}`, st === 'fits' ? 'A step the cat can manage.' : st === 'check' ? 'Fine for a young athletic cat, but more than the 12 to 18 in suggested for older or cautious cats.' : 'More than the 24 in suggested even for young, athletic cats. Add a shelf or a ramp.', ['rfShelves']);
      if (s.gap > 0) row(`gap-${s.to}`, 'shelves', s.gap <= RU.gapMax ? 'fits' : 'check', `${s.fromLabel} to ${s.toLabel}, across`, len(s.gap, u), `Under ${len(RU.gapMax, u)}`, s.gap <= RU.gapMax ? 'A short sideways jump.' : 'A long sideways jump between shelves. Move them closer or add one between.', ['rfShelves']);
    }
    if (design.shelves.length) row('shelf-thick', 'shelves', 'fits', 'Shelf thickness', `${len(D.SHEET[u].t, u)} plywood`, `At least ${len(RU.shelfThick, u)} for cats under 15 lb`, `Use 1 in (25 mm) or thicker for larger cats.`, ['rfWalk']);
    // space per cat
    const a = design.W * design.D / 1e6, per = a / m.cats;
    if (m.cats >= 2) row('area', 'space', per >= RU.areaPerCat ? 'fits' : 'check', 'Floor area per cat', `${area(per, u)} each (${area(a, u)} for ${m.cats} cats)`, `${area(RU.areaPerCat, u)} each when cats share`, per >= RU.areaPerCat ? 'At or above the only published figure we found. No official standard for catio size exists.' : 'Below the 2 square metres per cat one enclosure maker gives for cats sharing. Make it larger, or give the cats indoor access. No official standard exists.', ['catnetsFaq', 'catnetsRun']);
    else row('area', 'space', 'info', 'Floor area', area(a, u), 'No published minimum for one cat', 'No official standard exists. Catios range from cat-sized window boxes to rooms; one enclosure maker gives 2 square metres per cat only when cats share, and every cat needs climbing space and places to hide.', ['hwSheet', 'catnetsSize', 'catnetsFaq']);
    row('height', 'space', 'info', 'Height', `${len(design.Hb, u, 'dim')} at the wall, ${len(design.Hf, u, 'dim')} at the front`, 'No published figure', 'No guide we checked gives a height per cat. All cats need vertical climbing space, which the shelves give.', ['catnetsSize']);
    // shade and sun
    if (!sun) row('shade', 'sun', 'info', 'Shade on the longest day', 'Add your latitude or city', `Some shade from ${RU.shadeFrom}:00 to ${RU.shadeTo}:00`, 'Enter a city or a latitude and the facing direction to see the shade over a summer day.', ['csHeat']);
    else {
      const ok = sun.worst.frac >= RU.shadeShare - 1e-9;
      row('shade', 'sun', ok ? 'fits' : 'check', 'Shade on the longest day', `${Math.round(sun.worst.frac * 100)}% of the floor at ${String(sun.worst.h).padStart(2, '0')}:00, the least shaded hour`, `At least ${Math.round(RU.shadeShare * 100)}% shaded every hour, ${RU.shadeFrom}:00 to ${RU.shadeTo}:00 sun time`, ok ? 'There is a shaded place to rest at every hour of the summer day. Keep fresh water out and the way indoors open.' : 'Always include a shaded area where the cat can get out of the sun. Add shade cloth or a solid section over part of the roof, and keep the way indoors open in hot weather.', ['csHeat', 'csLoc', 'hwCatios']);
      row('sun', 'sun', sun.sunAll ? 'info' : 'check', 'Sun', sun.sunAll ? 'Sun reaches the floor for part of the day' : 'No direct sun on the floor', 'A sunny place to rest', 'Cats like a sunny resting spot as well as shade.', ['catnetsSize', 'csLoc']);
    }
    // the ground
    if (m.floor === 'ground') row('dig', 'floor', 'check', 'Digging', FLOOR_NAME.ground, 'Mesh under the base, pavers or a deck', 'Cats can dig, and so can predators. Lay mesh under the base frame or build on pavers or decking.', ['csPred', 'hwCatios']);
    else row('dig', 'floor', 'fits', 'Floor', FLOOR_NAME[m.floor], 'Mesh under the base, pavers or a deck', 'Nothing can dig under it.', ['csPred']);
    // materials, rules, the door
    row('lumber', 'materials', 'info', 'Lumber', `${design.lumber.label}, actual ${design.lumber.actual}`, 'Untreated cedar, redwood or pine', 'Pressure-treated lumber is wood impregnated with a pesticide, and older arsenic-treated (CCA) boards turn up second hand. Cats rub and chew, so choose sturdy, nontoxic materials: untreated cedar, or wood with a pet-safe, water-based finish free of heavy metals.', ['hwCatios', 'epa', 'bcspca']);
    if (design.door) row('latch', 'materials', 'info', 'Door latch', 'Latch with a safety cord', 'A latch the cat cannot open', 'Fit a latch with a safety cord or clip on the walk-in door.', ['bcspca']);
    row('rules', 'rules', 'info', 'HOA and lease rules', m.type === 'balcony' && m.bal.nodrill ? 'No-drill frame' : 'Fixed to the building', 'Check before you build', 'Check HOA and lease rules before you build. If you rent, check with your landlord or management company.', ['hwCatios']);
    return rows;
  }
  // the steps a cat takes, from the entry to the top shelf
  function pathSteps(design) {
    const p = design.perches, out = [];
    const order = p.filter(x => x.id !== 'entry').sort((a, b) => a.y - b.y);
    const entry = p.find(x => x.id === 'entry');
    if (entry && entry.y > 1) { const near = order.reduce((a, b) => (Math.abs(b.y - entry.y) < Math.abs(a.y - entry.y) ? b : a)); out.push({ from: 'entry', fromLabel: entry.label, to: near.id, toLabel: near.label, rise: Math.abs(entry.y - near.y), down: entry.y > near.y, gap: 0 }); }
    for (let i = 0; i < order.length - 1; i++) {
      const a = order[i], b = order[i + 1];
      const walk = a.id === 'floor' && design.ramp && b.shelf === design.ramp.shelf;
      let gap = 0;
      if (a.shelf && b.shelf) gap = Math.max(0, Math.max(a.shelf.s0, b.shelf.s0) - Math.min(a.shelf.s1, b.shelf.s1));
      out.push({ from: a.id, fromLabel: a.label, to: b.id, toLabel: b.label, rise: b.y - a.y, gap, walk });
    }
    return out;
  }

  // ---------- Everything at once ----------
  function evaluate(src, opts = {}) {
    const m = normalize(src);
    const design = build(m);
    const cut = cutList(design);
    const sheets = sheetLayout(design);
    const mesh = meshLayout(design);
    const roof = roofLayout(design);
    const shop = shopping(design, cut, mesh, sheets, roof);
    const sun = shade(m, design, opts.SunCalc || (typeof self !== 'undefined' && self.SunCalc) || null);
    const rows = checks(m, design, sun);
    const counts = { fits: 0, check: 0, fail: 0, info: 0 };
    for (const r of rows) counts[r.status]++;
    return { m, design, cut, sheets, mesh, roof, shop, sun, checks: rows, counts, steps: STEPS(design) };
  }
  // the assembly order, as the PDF prints it and the exploded view plays it
  function STEPS(design) {
    const m = design.m, at = design.attached;
    const s = [];
    const has = k => design.members.some(x => x.step === k) || design.sheets.some(x => x.step === k);
    if (at) s.push({ n: 1, title: m.type === 'window' ? 'Wall fixings, floor frame and side walls' : 'Wall fixings and side walls', text: m.type === 'window' ? 'Fix the two wall cleats and the floor ledger to the house wall, level. Build each side wall flat, then stand it on the ledger line and fix its back stud to the wall. Fit the knee braces and the floor joists.' : 'Build each side wall flat on the ground, square it, then stand it against the house and fix its back stud to the wall.' });
    else s.push({ n: 1, title: 'Front wall', text: 'Build the front wall flat on the ground: plates, studs and the corner braces. Check the diagonals match so it is square.' });
    s.push({ n: 2, title: at ? 'Front wall' : 'Back wall', text: at ? 'Build the front wall flat, with the door opening if there is one, then stand it between the side walls and screw through the end studs.' : 'Build the back wall the same way as the front.' });
    if (!at) s.push({ n: 3, title: 'Side walls', text: 'Build the side walls, stand all four walls up and screw the corners together. Check that the corners are square.' });
    if (has(3) && at) s.push({ n: 3, title: 'Floor', text: 'Lay the plywood floor on the joists and screw it down round the edges and along each joist.' });
    if (has(4)) s.push({ n: 4, title: 'Roof frame', text: `Fix the roof bars across the tops of the walls${design.bars.length && at ? ', the first one against the house wall as the ledger' : ''}${design.members.some(x => x.kind === 'beam' && x.step === 4) ? ', with the beams front to back under long spans' : ''}.` });
    if (has(5)) s.push({ n: 5, title: 'Door', text: 'Build the door leaf flat with its diagonal brace running up from the bottom hinge, hang it on the hinges and fit the latch.' });
    s.push({ n: 6, title: 'Mesh, shelves and ramp', text: 'Staple the mesh to the outside of the frame strip by strip, overlapping each strip as the layout shows, then add the washer-head screws. Fit the shelf cleats, the shelves and the ramp.' });
    if (has(7)) s.push({ n: 7, title: 'Tunnel', text: 'Build the tunnel frames, join them with the long rails, mesh the sides and top, and fix the end to the catio and to the window or cat door.' });
    if (design.roofCover) s.push({ n: 9, title: 'Roof panels', text: 'Lay the panels from the side away from the usual wind, overlap them as the maker says, and screw through the crowns with sealing washers into each roof bar.' });
    if (has(8)) s.push({ n: 8, title: 'Add-ons', text: 'Build the add-ons last: the bridge, the litter bench, the second tier and the window insert.' });
    return s.sort((a, b) => a.n - b.n);
  }

  // ---------- The share code: the whole design after the # sign, never sent anywhere ----------
  // Only what differs from the type's starting design (fresh) is written, so links stay short. The starting designs
  // are part of format v1: changing DEF or fresh() means a new version number here.
  function diff(o, base) {
    if (o === null || typeof o !== 'object' || Array.isArray(o)) return JSON.stringify(o) === JSON.stringify(base) ? undefined : o;
    const r = {};
    for (const k of Object.keys(o)) { const d = diff(o[k], base && typeof base === 'object' ? base[k] : undefined); if (d !== undefined) r[k] = d; }
    return Object.keys(r).length ? r : undefined;
  }
  function merge(base, o) {
    if (!o || typeof o !== 'object' || Array.isArray(o)) return o === undefined ? base : o;
    const r = Object.assign({}, base);
    for (const k of Object.keys(o)) r[k] = base && base[k] && typeof base[k] === 'object' && !Array.isArray(base[k]) ? merge(base[k], o[k]) : o[k];
    return r;
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
  // two decimals of a millimetre are plenty: an eighth of an inch is 3.175 mm
  function round(o) {
    if (Array.isArray(o)) return o.map(round);
    if (o && typeof o === 'object') { const r = {}; for (const [k, v] of Object.entries(o)) r[k] = round(v); return r; }
    return typeof o === 'number' ? Math.round(o * 100) / 100 : o;
  }

  return { TYPES, TYPE_NAME, ROOFS, ROOF_NAME, FLOORS, FLOOR_NAME, IN, FT, fresh, sample, normalize, doorFits, lumberOf, meshOf, defaultRoll, build, ffd, cutList, sheetLayout, stripsFor, meshLayout, roofLayout, shopping, shade, checks, pathSteps, evaluate, steps: STEPS, encode, decode, round, unit, fracIn, fmtIn, fmtFtIn, fmtMm, len, both, area, stockLabel, toInput, fromInput, D };
});
