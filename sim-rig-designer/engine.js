/* Sim Rig Designer: the engine. Pure functions from a design (the numbers the user typed) to:
 *  - the driver's body, scaled from ANSUR II by height and inside leg (body);
 *  - the seated posture in side view: hip, shoulder, eye, knee, ankle, ball of the foot, and the angles SAE J1100
 *    names (torso L40, hip L42, knee L44, foot L46), at rest and at full brake (posture);
 *  - a rig fitted to that body for the driving style (sizeFor), unless the user sets the positions by hand;
 *  - the frame member by member in lumber or 40-series aluminium profile, or the panels of a plywood wheel stand, with
 *    the decks, the plates and their hole patterns, and the assembly step of each part (build);
 *  - the cut list packed first-fit decreasing onto stock lengths, the plywood pieces on sheets, the aluminium bill of
 *    materials (brackets, T-nuts, bolts, end caps) and the DXF of each plate (dxf);
 *  - the shopping list (quantities, and totals only from prices the user types);
 *  - the checks, each with a reason and the sources it rests on (data.js);
 *  - the share code kept after the # sign (encode, decode).
 * Lengths are millimetres inside; the page shows inches or millimetres. Coordinates: x forward from the back of the
 * rig toward the pedals, y up from the floor, z across (positive to the driver's right). Works in the browser
 * (window.SimRigEngine) and in Node for the tests. Guidance for a hobby build, never an engineering guarantee.
 * Every word it writes comes from i18n.js in the page's language; the market of that language (data.js MARKETS)
 * supplies the metric lumber, its lengths, the sheets and the profile listing sold there. Imperial sizes are the same
 * everywhere, and English keeps the tables it always had. */
(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory(require('./data.js'), require('./i18n.js'));
  else root.SimRigEngine = factory(root.SimRigData, root.SimRigI18n);
})(typeof self !== 'undefined' ? self : this, function (D, I) {
  'use strict';
  const IN = D.IN, FT = D.FT;
  const RU = D.RULES;
  const T = (k, p) => I.t(k, p);
  const N = (x, d) => I.fixed(x, d);
  // an object whose values are read from the dictionary each time, so E.BUILD_NAME.wood follows the page's language
  function named(prefix, keys) { const o = {}; for (const k of keys) Object.defineProperty(o, k, { get: () => T(`${prefix}.${k}`), enumerable: true }); return o; }
  const clamp = (x, a, b) => Math.min(b, Math.max(a, x));
  const num = (x, d) => (x === '' || x === null || x === undefined || !Number.isFinite(Number(x)) ? d : Number(x));
  const r1 = x => Math.round(x * 100) / 100;
  const rad = d => d * Math.PI / 180, deg = r => r * 180 / Math.PI;
  const BUILDS = ['wood', 'alu', 'stand'];
  const BUILD_NAME = named('build', BUILDS);
  const BUILD_SHORT = named('buildShort', BUILDS);
  const STYLES = ['gt', 'formula', 'rally'];
  const STYLE_NAME = named('style', STYLES);
  const SEAT_TYPES = ['bucket', 'car', 'office'];
  const SCREENS = ['single', 'triple', 'tv'];
  const ASPECTS = Object.keys(D.ASPECTS);

  // ---------- Units ----------
  function fracIn(mm, step = 16) {
    const x = Math.round(mm / IN * step) / step;
    const whole = Math.floor(x + 1e-9), f = Math.round((x - whole) * step);
    if (!f) return `${whole}`;
    let n = f, d = step; while (n % 2 === 0 && d > 1) { n /= 2; d /= 2; }
    return whole ? `${whole} ${n}/${d}` : `${n}/${d}`;
  }
  const fmtIn = (mm, step) => `${fracIn(mm, step)} in`;
  function fmtFtIn(mm) {
    const inches = Math.round(mm / IN * 8) / 8;
    if (inches < 36) return `${fracIn(mm, 8)} in`;
    const f = Math.floor(inches / 12), rest = inches - f * 12;
    return rest ? `${f} ft ${fracIn(rest * IN, 8)} in` : `${f} ft`;
  }
  const fmtMm = mm => `${N(mm, 0)} mm`;
  const holeMm = mm => `${I.trim(mm, 1)} mm`;
  function len(mm, units, kind = 'cut') { return units === 'metric' ? fmtMm(mm) : kind === 'dim' ? fmtFtIn(mm) : fmtIn(mm); }
  const both = (mm, units, kind = 'cut') => (units === 'metric' ? `${fmtMm(mm)} (${fmtIn(mm, 8)})` : `${len(mm, units, kind)} (${fmtMm(mm)})`);
  function height(mm, units) { if (units === 'metric') return `${N(mm / 10, 0)} cm`; const i = Math.round(mm / IN); return `${Math.floor(i / 12)} ft ${i % 12} in`; }
  function toInput(mm, units) { return units === 'metric' ? String(Math.round(mm) / 10) : String(Math.round(mm / IN * 8) / 8); }
  function fromInput(str, units) { const n = Number(String(str).replace(',', '.')); if (!Number.isFinite(n)) return NaN; return units === 'metric' ? n * 10 : n * IN; }
  // a shopping unit for a quantity: the dictionary's word (unit.boards...) with its plural rule
  const unit = (qty, word) => (I.has(`unit.${word}`) ? T(`unit.${word}`, { n: qty }) : qty === 1 ? String(word).replace(/([^s])s$/, '$1').replace(/^boxe$/, 'box') : word);

  // ---------- the market: the language's own metric materials (English keeps the tables it always had) ----------
  const MK = () => D.MARKETS[I.getLang()] || D.MARKETS.en;
  const lumberList = units => (units === 'metric' ? MK().lumber : D.LUMBER.imperial);
  const allLumber = () => D.LUMBER.imperial.concat(D.LUMBER.metric, ...Object.values(D.MARKETS).map(x => x.lumber));
  const sheetList = units => (units === 'metric' ? MK().sheets : D.SHEETS.imperial);
  const allSheets = () => D.SHEETS.imperial.concat(D.SHEETS.metric, ...Object.values(D.MARKETS).map(x => x.sheets));
  // the lengths a section is sold in: its own listing where the market gives one, otherwise every length of the market
  const stockMm = units => (units === 'metric' ? MK().stock : D.STOCK.imperial.map(s => s.mm));
  function lengthsOf(id, units) { const l = lumberList(units).find(x => x.id === id); return ((l && l.lengths) || stockMm(units)).slice().sort((a, b) => a - b); }
  const stockText = (mm, units) => (units === 'metric' ? T('u.stockM', { mm }) : T('u.stockFt', { ft: Math.round(mm / FT) }));
  function stockLabel(mm, units) {
    const own = stockMm(units).find(x => Math.abs(x - mm) < 1), other = stockMm(units === 'metric' ? 'imperial' : 'metric').find(x => Math.abs(x - mm) < 1);
    return own != null ? stockText(own, units) : other != null ? stockText(other, units === 'metric' ? 'imperial' : 'metric') : len(mm, units, 'dim');
  }
  // the nearest equivalent in this market (the unit switch, or a link made in another language): the market's swap
  // table first, then the section or sheet of this market closest in size
  function swapLumber(id, units) {
    const list = lumberList(units);
    if (list.some(l => l.id === id)) return id;
    const to = (MK().swap || D.SWAP)[id];
    if (to && list.some(l => l.id === to)) return to;
    const from = allLumber().find(l => l.id === id);
    if (!from) return null;
    return list.reduce((p, q) => (Math.abs(q.t * q.w - from.t * from.w) < Math.abs(p.t * p.w - from.t * from.w) ? q : p)).id;
  }
  function swapSheet(id, units) {
    const list = sheetList(units);
    if (list.some(x => x.id === id)) return id;
    const from = allSheets().find(x => x.id === id);
    if (!from) return null;
    const kin = list.filter(x => x.kind === from.kind);
    return (kin.length ? kin : list).reduce((p, q) => (Math.abs(q.t - from.t) < Math.abs(p.t - from.t) ? q : p)).id;
  }
  // a copy of a table row with its words in the page's language (the tables hold sizes and sources only)
  const sayLumber = l => (l ? Object.assign({}, l, { label: T(`lumber.${l.id}`), actual: T(`lumber.${l.id}.actual`) }) : l);
  const saySheet = s => (s ? Object.assign({}, s, { label: T(`${D.SHEETS.imperial.includes(s) ? 'sheetIn' : 'sheet'}.${s.id}`), kindName: T(`sheetKind.${s.kind}`) }) : s);
  const profileOf = sec => { const p = D.PROFILES[sec], o = MK().profiles[sec] || {}; return Object.assign({}, p, o, { label: T(`profile.${sec}`) }); };
  const lumberDefault = units => (units === 'metric' ? MK().lumberDefault : '2x4');
  const sheetDefault = units => (units === 'metric' ? MK().sheetDefault : 'ply');

  // ---------- The body, from ANSUR II (data.js BODY) ----------
  function body(m) {
    const S = clamp(num(m.driver && m.driver.h, 1750), 1400, 2100);
    const typed = num(m.driver && m.driver.inseam, 0);
    const lin = (k, x) => D.BODY[k].ab[0] + D.BODY[k].ab[1] * x;
    const C = typed > 0 ? clamp(typed, 0.40 * S, 0.56 * S) : lin('crotch', S);
    const f = k => { const b = D.BODY[k]; return lin(k, b.on === 'S' ? S : b.on === 'C' ? C : 0); };
    const o = { S, C, typedInseam: typed > 0 };
    for (const k of ['thigh', 'shank', 'ankle', 'foot', 'ball', 'hipSeat', 'shoulderSeat', 'eyeSeat', 'sitting', 'upperArm', 'forearm', 'chestDrop', 'buttock', 'thighTop', 'shoulders', 'hips', 'head', 'chest']) o[k] = f(k);
    o.torso = o.shoulderSeat - o.hipSeat;            // hip joint to shoulder, along the back
    o.eyeUp = o.eyeSeat - o.shoulderSeat;            // eye above the shoulder, head level
    o.eyeFwd = D.MODEL.eyeForward * o.head;
    o.hipBack = D.MODEL.hipFromBack * o.buttock;     // hip joint in front of the seat back
    o.ankleFwd = D.MODEL.ankleFromHeel * o.foot;
    o.outside = S < D.BODY.fit.stature[0] || S > D.BODY.fit.stature[1];
    return o;
  }

  // ---------- Starting designs ----------
  const holesOf = k => Object.assign({ measured: false }, D.GEAR.holes[k]);
  function fresh(build, units, style) {
    build = BUILDS.includes(build) ? build : 'wood';
    units = units === 'metric' ? 'metric' : 'imperial';
    style = STYLES.includes(style) ? style : 'gt';
    const metric = units === 'metric';
    const st = D.STYLES[style];
    const m = {
      v: 1, name: '', units, build, style,
      driver: { h: metric ? 1750 : 69 * IN, inseam: 0 },
      seat: { type: build === 'stand' ? 'office' : 'bucket', pan: D.SEATS.office.pan },
      gear: {
        base: 'dd', pedals: 'loadcell', shifter: true, handbrake: false, slots: true,
        rim: st.rim, face: D.GEAR.pedals.face, travel: D.GEAR.pedals.travel,
        wb: Object.assign({}, D.GEAR.wheelBase), ped: { w: D.GEAR.pedals.w, d: D.GEAR.pedals.d }, sh: Object.assign({}, D.GEAR.shifter),
        holes: { wheel: holesOf('wheel'), pedals: holesOf('pedals'), shifter: holesOf('shifter') },
      },
      screen: { kind: 'single', size: 32, aspect: '16:9', bezel: 8, stand: true },
      room: metric ? { w: 2400, d: 2000 } : { w: 8 * FT, d: 7 * FT },
      auto: true,
      rig: { seatH: 0, back: st.back, h30: st.h30, l53: 700, deck: 0, wheelUp: 300, wheelReach: 400, tilt: st.tilt, screenDist: 800, screenUp: 0 },
      lumber: lumberDefault(units), stock: metric ? MK().stockDefault : D.STOCK.imperial[0].mm, sheet: sheetDefault(units),
      plate: 'sheet',
      prices: {},
      addons: { both: false },
      sample: false,
    };
    return normalize(sizeFor(m));
  }
  // The sample: a 2x4 GT rig with a direct drive base, load cell pedals, a shifter and three 27 in screens, for a
  // driver of 5 ft 9 in. Marked "Sample" wherever it shows. An edition's market may set its own (a metric rig in its
  // timber, for a driver of its height in cm): MARKETS[lang].sample.
  function sample() {
    const s = MK().sample;
    const m = s ? fresh('wood', 'metric', 'gt') : fresh('wood', 'imperial', 'gt');
    Object.assign(m, { name: T('sample.name'), sample: true, screen: { kind: 'triple', size: 27, aspect: '16:9', bezel: 8, stand: true } });
    if (s) Object.assign(m, JSON.parse(JSON.stringify(s)), { driver: Object.assign({}, m.driver, s.driver || {}) });
    return normalize(sizeFor(m));
  }

  // ---------- Normalise anything (a form, a decoded link) into a valid design ----------
  function normalize(src) {
    const s = src && typeof src === 'object' ? src : {};
    const build = BUILDS.includes(s.build) ? s.build : 'wood';
    const units = s.units === 'metric' ? 'metric' : 'imperial';
    const style = STYLES.includes(s.style) ? s.style : 'gt';
    const st = D.STYLES[style];
    const lim = (x, a, z, d) => clamp(num(x, d), a, z);
    const m = { v: 1, name: String(s.name || '').slice(0, 60), units, build, style };
    const dr = s.driver || {};
    m.driver = { h: lim(dr.h, 1400, 2100, 1750), inseam: 0 };
    m.driver.inseam = num(dr.inseam, 0) > 0 ? lim(dr.inseam, 0.40 * m.driver.h, 0.56 * m.driver.h, 0) : 0;
    const se = s.seat || {};
    m.seat = { type: SEAT_TYPES.includes(se.type) ? se.type : 'bucket', pan: lim(se.pan, 300, 650, D.SEATS.office.pan) };
    if (build === 'stand') m.seat.type = 'office';
    const g = s.gear || {}, G = D.GEAR;
    const wb = g.wb || {}, ped = g.ped || {}, sh = g.sh || {};
    m.gear = {
      base: g.base === 'belt' ? 'belt' : 'dd', pedals: g.pedals === 'pot' ? 'pot' : 'loadcell',
      shifter: g.shifter === undefined ? true : !!g.shifter, handbrake: !!g.handbrake, slots: g.slots === undefined ? true : !!g.slots,
      rim: lim(g.rim, 200, 560, st.rim), face: lim(g.face, 10, 75, G.pedals.face), travel: lim(g.travel, 0, 40, G.pedals.travel),
      wb: { l: lim(wb.l, 80, 450, G.wheelBase.l), w: lim(wb.w, 60, 400, G.wheelBase.w), axis: lim(wb.axis, 30, 250, G.wheelBase.axis), qr: lim(wb.qr, 20, 250, G.wheelBase.qr) },
      ped: { w: lim(ped.w, 200, 800, G.pedals.w), d: lim(ped.d, 200, 800, G.pedals.d) },
      sh: { w: lim(sh.w, 80, 400, G.shifter.w), d: lim(sh.d, 80, 400, G.shifter.d) },
      holes: {},
    };
    for (const k of ['wheel', 'pedals', 'shifter']) {
      const h = (g.holes && g.holes[k]) || {}, d0 = G.holes[k];
      m.gear.holes[k] = { cols: Math.round(lim(h.cols, 1, 6, d0.cols)), rows: Math.round(lim(h.rows, 1, 6, d0.rows)), x: lim(h.x, 0, 600, d0.x), y: lim(h.y, 0, 600, d0.y), d: lim(h.d, 2, 20, d0.d), measured: !!h.measured };
    }
    const sc = s.screen || {};
    m.screen = { kind: SCREENS.includes(sc.kind) ? sc.kind : 'single', size: lim(sc.size, 15, 100, 32), aspect: ASPECTS.includes(sc.aspect) ? sc.aspect : '16:9', bezel: lim(sc.bezel, 0, 60, 8), stand: sc.stand === undefined ? true : !!sc.stand };
    if (m.screen.kind === 'triple' && m.screen.size > 49) m.screen.size = 49;
    const ro = s.room || {};
    m.room = { w: lim(ro.w, 600, 20000, units === 'metric' ? 2400 : 8 * FT), d: lim(ro.d, 600, 20000, units === 'metric' ? 2000 : 7 * FT) };
    m.auto = s.auto === undefined ? true : !!s.auto;
    const rg = s.rig || {};
    m.rig = {
      seatH: lim(rg.seatH, 0, 900, 0), back: lim(rg.back, 0, 70, st.back), h30: lim(rg.h30, -300, 700, st.h30), l53: lim(rg.l53, 200, 1400, 700),
      deck: lim(rg.deck, -10, 50, 0), wheelUp: lim(rg.wheelUp, -100, 800, 300), wheelReach: lim(rg.wheelReach, 100, 900, 400), tilt: lim(rg.tilt, 0, 70, st.tilt),
      screenDist: lim(rg.screenDist, 250, 4000, 800), screenUp: lim(rg.screenUp, -600, 600, 0),
    };
    m.lumber = swapLumber(s.lumber, units) || lumberDefault(units);
    const stocks = lengthsOf(m.lumber, units);
    m.stock = stocks.reduce((p, q) => (Math.abs(q - num(s.stock, stocks[0])) < Math.abs(p - num(s.stock, stocks[0])) ? q : p));
    m.sheet = swapSheet(s.sheet, units) || sheetList(units)[0].id;
    m.plate = s.plate === 'alu' ? 'alu' : 'sheet';
    m.prices = {};
    if (s.prices && typeof s.prices === 'object') for (const [k, v] of Object.entries(s.prices)) { const n = Number(v); if (/^[\w:.\-x]{1,60}$/.test(k) && Number.isFinite(n) && n >= 0 && n < 1e6) m.prices[k] = Math.round(n * 100) / 100; }
    m.addons = { both: !!(s.addons && s.addons.both) };
    m.sample = !!s.sample;
    return m;
  }
  const lumberOf = m => { const list = lumberList(m.units); return sayLumber(list.find(l => l.id === m.lumber) || list[1] || list[0]); };
  const sheetOf = m => { const list = sheetList(m.units); return saySheet(list.find(x => x.id === m.sheet) || list[0]); };

  // half the height of the rim: a round GT or rally wheel, or a formula wheel about 0.52 times as tall as it is wide
  const rimHalf = (style, rim) => (style === 'formula' ? rim * 0.26 : rim / 2);

  // ---------- The frame's fixed heights, by build ----------
  // rail: top of the base above the floor; bar: the seat bars laid across it; stack: the pedal deck's own height (its
  // stringers and plate) when it sits straight on the base.
  function frameDims(m) {
    const L = lumberOf(m), sh = sheetOf(m);
    const plateT = m.plate === 'alu' ? 6 : sh.t;
    if (m.build === 'alu') return { rail: 80, bar: 40, stack: 40 + plateT, plateT, t: 40, w: 80 };
    if (m.build === 'stand') return { rail: sh.t, bar: 0, stack: sh.t, plateT: sh.t, t: L.t, w: L.w };
    return { rail: L.w, bar: L.t, stack: L.t + plateT, plateT, t: L.t, w: L.w };
  }
  // the lowest hip point the seat allows (the seat on its bars with no risers); an office chair at its pan height
  function seatMin(m, b, F) { return m.seat.type === 'office' ? m.seat.pan + b.hipSeat : F.rail + F.bar + D.SEATS[m.seat.type].lift; }

  // ---------- Posture: side view, the hip point at the origin unless given ----------
  // R: { hip:[x,y], back, heel:[x,y], foot (sole angle from horizontal), wheel:[x,y], tilt, rim, screen:[x,y] }
  const v = (x, y) => [x, y];
  const add = (a, b) => [a[0] + b[0], a[1] + b[1]];
  const sub = (a, b) => [a[0] - b[0], a[1] - b[1]];
  const mul = (a, k) => [a[0] * k, a[1] * k];
  const lenv = a => Math.hypot(a[0], a[1]);
  const unitv = a => { const l = lenv(a) || 1; return [a[0] / l, a[1] / l]; };
  const dot = (a, b) => a[0] * b[0] + a[1] * b[1];
  const angleBetween = (a, b) => deg(Math.acos(clamp(dot(unitv(a), unitv(b)), -1, 1)));
  const lawAngle = (a, b, c) => deg(Math.acos(clamp((a * a + b * b - c * c) / (2 * a * b), -1, 1))); // angle opposite c
  function legs(b, R, footDeg) {
    const P = R.heel, f = rad(footDeg);
    const fd = v(Math.cos(f), Math.sin(f)), fu = v(-Math.sin(f), Math.cos(f));
    const A = add(add(P, mul(fd, b.ankleFwd)), mul(fu, b.ankle));
    const B = add(P, mul(fd, b.ball));
    const H = R.hip, T = b.thigh, Sh = b.shank;
    const HA = sub(A, H), d = lenv(HA);
    const reach = d <= T + Sh - 0.5 ? (d >= Math.abs(T - Sh) + 1 ? 'ok' : 'close') : 'far';
    const dd = clamp(d, Math.abs(T - Sh) + 1, T + Sh - 0.5);
    const alpha = Math.acos(clamp((T * T + dd * dd - Sh * Sh) / (2 * T * dd), -1, 1));
    const th = Math.atan2(HA[1], HA[0]) + alpha;           // the knee rises above the hip-ankle line
    const K = add(H, mul(v(Math.cos(th), Math.sin(th)), T));
    const knee = reach === 'far' ? 180 : lawAngle(T, Sh, dd);
    return { A, B, K, P, footDeg, reach, knee, ankle: angleBetween(sub(K, A), fd), thighDir: unitv(sub(K, H)), d };
  }
  function posture(b, R) {
    const H = R.hip, bk = rad(R.back);
    const tdir = v(-Math.sin(bk), Math.cos(bk));
    const Sd = add(H, mul(tdir, b.torso));
    const E = add(Sd, v(b.eyeFwd, b.eyeUp));
    const chest = add(Sd, mul(tdir, -b.chestDrop));
    const rest = legs(b, R, R.foot), press = legs(b, R, R.foot - R.travel);
    const hip = angleBetween(tdir, rest.thighDir);
    // the arms: the hands at 9 and 3 o'clock, out to the rim's radius; the shoulders at half their breadth
    const W = R.wheel, dz = Math.abs(b.shoulders / 2 - R.rim / 2);
    const side = lenv(sub(W, Sd)), d3 = Math.hypot(side, dz);
    const U = b.upperArm, F = b.forearm;
    const armReach = d3 <= U + F - 0.5 ? 'ok' : 'far';
    const elbow = armReach === 'far' ? 180 : lawAngle(U, F, Math.max(d3, Math.abs(U - F) + 1));
    // the rim in side view: its plane leans back from the vertical by tilt, the top away from the driver (as in a car)
    const t = rad(R.tilt), r = R.rimHalf != null ? R.rimHalf : R.rim / 2;   // a formula wheel is about half as tall as it is wide
    const ru = v(Math.sin(t), Math.cos(t));
    const rimTop = add(W, mul(ru, r)), rimBottom = add(W, mul(ru, -r));
    return { H, S: Sd, E, chest, tdir, rest, press, hip, elbow, armReach, d3, dz, rimTop, rimBottom, ru, back: R.back };
  }
  // the top of the legs in side view: the thigh's upper surface from the hip to the knee, then the shin's front
  function legTop(b, p) {
    const L = p.rest, n = v(-L.thighDir[1], L.thighDir[0]);   // the thigh's upward normal
    const up = n[1] < 0 ? mul(n, -1) : n;
    const hipTop = add(p.H, mul(up, Math.max(40, b.thighTop - b.hipSeat)));
    const kneeTop = add(L.K, mul(up, 55));
    const shin = unitv(sub(L.A, L.K)), sn = v(-shin[1], shin[0]); const sup = sn[0] > 0 ? sn : mul(sn, -1);
    const ankleFront = add(L.A, mul(sup, 50));
    return [hipTop, kneeTop, ankleFront];
  }
  // how far the rim's lowest point clears the top of the legs (negative: it hits them)
  function rimClearance(b, p) {
    const pts = legTop(b, p), q = p.rimBottom;
    let best = Infinity;
    for (let i = 0; i < pts.length - 1; i++) {
      const a = pts[i], c = pts[i + 1];
      if (q[0] < Math.min(a[0], c[0]) - 1 || q[0] > Math.max(a[0], c[0]) + 1) continue;
      const y = a[1] + (c[1] - a[1]) * (q[0] - a[0]) / ((c[0] - a[0]) || 1);
      best = Math.min(best, q[1] - y);
    }
    if (best === Infinity) best = Math.min(...pts.map(pt => lenv(sub(q, pt)))) - 0;
    return best;
  }

  // the underside of the wheel deck plate in side view, from its back edge to its front edge
  function deckLine(g, wheel, tiltDeg, plateT) {
    const t = rad(tiltDeg), ax = [Math.cos(t), -Math.sin(t)], up = [Math.sin(t), Math.cos(t)];
    const at = (s, h) => [wheel[0] + ax[0] * s + up[0] * h, wheel[1] + ax[1] * s + up[1] * h];
    return [at(g.wb.qr - 30, -g.wb.axis - plateT), at(g.wb.qr + g.wb.l + 30, -g.wb.axis - plateT)];
  }
  // the least height of the line a-c above the top of the legs, where the two overlap (Infinity if they never do)
  function clearanceOver(b, p, a, c) {
    const pts = legTop(b, p); let best = Infinity;
    for (let i = 0; i < pts.length - 1; i++) {
      const l0 = pts[i], l1 = pts[i + 1];
      const x0 = Math.max(Math.min(a[0], c[0]), Math.min(l0[0], l1[0])), x1 = Math.min(Math.max(a[0], c[0]), Math.max(l0[0], l1[0]));
      if (x1 < x0) continue;
      for (let k = 0; k <= 10; k++) {
        const x = x0 + (x1 - x0) * k / 10;
        const yd = a[1] + (c[1] - a[1]) * (x - a[0]) / ((c[0] - a[0]) || 1), yl = l0[1] + (l1[1] - l0[1]) * (x - l0[0]) / ((l1[0] - l0[0]) || 1);
        best = Math.min(best, yd - yl);
      }
    }
    return best;
  }
  // the leg room under the wheel: the rim's lowest point and the deck plate, whichever is closer to the legs
  function legroom(b, p, g, wheel, tiltDeg, plateT) {
    const [a, c] = deckLine(g, wheel, tiltDeg, plateT);
    const rim = rimClearance(b, p), deck = clearanceOver(b, p, a, c);
    return { rim, deck, min: Math.min(rim, deck) };
  }

  // ---------- Screens ----------
  function screenDims(sc) {
    const [aw, ah] = D.ASPECTS[sc.aspect] || [16, 9];
    const diag = sc.size * IN, k = diag / Math.hypot(aw, ah);
    return { w: aw * k, h: ah * k, diag };
  }
  // field of view at the eye: d is the distance from the eye to the centre screen
  function fov(sc, d) {
    const s = screenDims(sc), a = Math.atan(s.w / 2 / d);
    const vert = deg(2 * Math.atan(s.h / 2 / d));
    if (sc.kind !== 'triple') return { h: deg(2 * a), v: vert, side: 0, w: s.w, hgt: s.h };
    const hw = s.w / 2 + sc.bezel, side = 2 * Math.atan(hw / d);
    return { h: deg(2 * (side + a)), v: vert, side: deg(side), w: s.w, hgt: s.h };
  }

  // ---------- Size a rig for the driver and the style ----------
  // The tool's starting points (data.js STYLES): the torso angle, the hip point above the heel, the knee, elbow and
  // ankle angles at rest and where the wheel sits between chest and shoulder. It solves the leg for the knee angle and
  // the pedal deck angle for the ankle, places the wheel for the elbow, lifts it until the rim clears the thighs, and
  // puts the screen centre at eye level just beyond the wheel base.
  function sizeFor(src) {
    const m = JSON.parse(JSON.stringify(src));
    if (m.auto === false) return m;
    const b = body(m), st = D.STYLES[m.style] || D.STYLES.gt, F = frameDims(m);
    const seatType = m.build === 'stand' ? 'office' : (m.seat && m.seat.type) || 'bucket';
    const rec = D.SEATS[seatType].recline;
    const back = clamp(st.back, rec[0], rec[1]);
    const heelMin = F.rail + F.stack;
    const sMin = seatMin(Object.assign({}, m, { seat: Object.assign({}, m.seat, { type: seatType }) }), b, F);
    const want = m.style === 'formula' ? st.h30 : st.h30 * b.C / 825;     // scaled by the inside leg (ANSUR II mean 825 mm)
    const hy = seatType === 'office' ? sMin : Math.max(sMin, heelMin + want);
    const h30 = seatType === 'office' ? Math.min(want, hy - heelMin) : want;
    // the leg: the ankle at the distance from the hip that gives the knee angle; the foot angle for the ankle angle
    const T = b.thigh, Sh = b.shank, dK = Math.sqrt(T * T + Sh * Sh - 2 * T * Sh * Math.cos(rad(st.knee)));
    const face = (m.gear && m.gear.face) || D.GEAR.pedals.face;
    let foot = 40, heel = [700, -h30];
    for (let i = 0; i < 12; i++) {
      const f = rad(foot), o = add(mul(v(Math.cos(f), Math.sin(f)), b.ankleFwd), mul(v(-Math.sin(f), Math.cos(f)), b.ankle));
      const ay = -h30 + o[1];
      const ax = Math.sqrt(Math.max(1, dK * dK - ay * ay));
      heel = [ax - o[0], -h30];
      const L = legs(b, { hip: [0, 0], heel }, foot);
      foot = clamp(foot + (L.ankle - st.ankle), face - 10, face + 45);
    }
    const deck = clamp(Math.round(foot - face), 0, 45);
    foot = deck + face;
    {
      const f = rad(foot), o = add(mul(v(Math.cos(f), Math.sin(f)), b.ankleFwd), mul(v(-Math.sin(f), Math.cos(f)), b.ankle));
      const ay = -h30 + o[1];
      heel = [Math.sqrt(Math.max(1, dK * dK - ay * ay)) - o[0], -h30];
    }
    // the wheel: centre between the chest point and the shoulder; reach for the elbow angle
    const rim = (m.gear && m.gear.rim) || st.rim;
    const R0 = { hip: [0, 0], back, heel, foot, travel: (m.gear && m.gear.travel) || 0, wheel: [400, 300], tilt: st.tilt, rim, rimHalf: rimHalf(m.style, rim) };
    const p0 = posture(b, R0);
    const U = b.upperArm, Fa = b.forearm, d3 = Math.sqrt(U * U + Fa * Fa - 2 * U * Fa * Math.cos(rad(st.elbow)));
    const dz = Math.abs(b.shoulders / 2 - rim / 2), ds = Math.sqrt(Math.max(1, d3 * d3 - dz * dz));
    let wy = p0.chest[1] + st.wheel * (p0.S[1] - p0.chest[1]);
    let wx = 0;
    const gear = Object.assign({}, D.GEAR, m.gear || {}, { wb: (m.gear && m.gear.wb) || D.GEAR.wheelBase });
    for (let i = 0; i < 60; i++) {
      const dy = wy - p0.S[1];
      wx = p0.S[0] + Math.sqrt(Math.max(1, ds * ds - dy * dy));
      const p = posture(b, Object.assign({}, R0, { wheel: [wx, wy] }));
      if (legroom(b, p, gear, [wx, wy], st.tilt, F.plateT).min >= 30) break;
      wy += 10;
    }
    // the screen: centre at eye level, just beyond the front of the wheel base
    const sc = m.screen || { kind: 'single', size: 32, aspect: '16:9', bezel: 8 };
    const wb = (m.gear && m.gear.wb) || D.GEAR.wheelBase, t = rad(st.tilt);
    const baseFront = wx + (wb.qr + wb.l) * Math.cos(t) + wb.axis * Math.sin(t);
    const gap = sc.kind === 'tv' ? 300 : 70;
    const dist = Math.max(baseFront + gap - p0.E[0], 350);
    m.rig = { seatH: Math.round(hy), back, h30: Math.round(h30), l53: Math.round(heel[0]), deck, wheelUp: Math.round(wy), wheelReach: Math.round(wx), tilt: st.tilt, screenDist: Math.round(dist), screenUp: 0 };
    if (m.gear) m.gear.rim = rim;
    if (m.seat) m.seat.type = seatType;
    return m;
  }

  // ---------- Layout: from the design's settings to positions in the rig (x from the back of the base) ----------
  function layout(m, b) {
    const F = frameDims(m), rg = m.rig, g = m.gear;
    const hy = m.seat.type === 'office' ? m.seat.pan + b.hipSeat : Math.max(seatMin(m, b, F), rg.seatH || 0);
    // the hip point at x = 0 for now; the frame is shifted so its back sits at x = 0 below
    const H = [0, hy];
    const heel = [rg.l53, hy - rg.h30];
    const foot = rg.deck + g.face;
    const wheel = [rg.wheelReach, hy + rg.wheelUp];
    const R = { hip: H, back: rg.back, heel, foot, travel: g.travel, wheel, tilt: rg.tilt, rim: g.rim, rimHalf: rimHalf(m.style, g.rim) };
    const p = posture(b, R);
    const screen = [p.E[0] + rg.screenDist, p.E[1] + rg.screenUp];
    // where the base begins: under the seat back, or (an office chair) just behind the pedal deck
    const seated = m.seat.type !== 'office';
    const seatBack = H[0] - b.hipBack - 30;
    const deckRear = heel[0] - 70;
    const x0 = seated ? seatBack - 40 : deckRear - (m.build === 'stand' ? 20 : 40);
    const shift = -x0;
    const sh = q => [q[0] + shift, q[1]];
    return { F, shift, H: sh(H), heel: sh(heel), foot, wheel: sh(wheel), screen: sh(screen), R: Object.assign({}, R, { hip: sh(H), heel: sh(heel), wheel: sh(wheel) }), p: shiftPosture(p, shift), seated, seatBack: seatBack + shift };
  }
  function shiftPosture(p, s) {
    const S = q => [q[0] + s, q[1]];
    const L = x => Object.assign({}, x, { A: S(x.A), B: S(x.B), K: S(x.K), P: S(x.P) });
    return Object.assign({}, p, { H: S(p.H), S: S(p.S), E: S(p.E), chest: S(p.chest), rest: L(p.rest), press: L(p.press), rimTop: S(p.rimTop), rimBottom: S(p.rimBottom) });
  }

  // ---------- The build: members, panels, plates and hardware ----------
  // Every member is a box from p0 to p1 (its centre line), a by b in section, a measured along `up`. len is the cut length.
  function build(m) {
    const b = body(m), Lo = layout(m, b), F = Lo.F, p = Lo.p, g = m.gear;
    const L = lumberOf(m), sh = sheetOf(m);
    const alu = m.build === 'alu', stand = m.build === 'stand';
    const PR = D.PROFILES;
    const t = alu ? 40 : L.t, w = alu ? 80 : L.w;            // the main section: thickness and depth
    const stock = m.stock - endTrim(m.units);
    const M = [], sheets = [], plates = [], notes = [];
    let seq = 0;
    const add3 = (kind, step, p0, p1, up, o = {}) => {
      const length = Math.hypot(p1[0] - p0[0], p1[1] - p0[1], p1[2] - p0[2]);
      const sec = o.sec || (alu ? 'p4080' : L.id);
      const a0 = o.a != null ? o.a : (alu ? PR[sec].b : t), b0 = o.b != null ? o.b : (alu ? PR[sec].a : w);
      const mem = Object.assign({ id: `${kind}-${++seq}`, kind, step, p0, p1, up, a: a0, b: b0, len: length, sec, butts: 0, caps: 0 }, o);
      mem.len = length; mem.a = a0; mem.b = b0;
      M.push(mem); return mem;
    };
    // long pieces of lumber are split at the stock length (aluminium profile is ordered cut to length)
    const runs = (a, z) => { if (alu) return [[a, z]]; const out = []; let s0 = a; while (z - s0 > stock + 1) { out.push([s0, s0 + stock]); s0 += stock; } out.push([s0, z]); return out; };
    const g4040 = { sec: 'p4040', a: 40, b: 40 };

    // ---- the base footprint ----
    const seatW = Lo.seated ? D.SEATS[m.seat.type].width : 0;
    const W = Math.max(seatW + 2 * t + 20, g.ped.w + 2 * t + 20, stand ? g.ped.w + 2 * F.plateT + 40 : 560);
    const zR = W / 2 - t / 2;                                     // the centre line of each side rail
    // the pedal deck: heel 60 mm from its back edge, as deep as the pedal set plus a heel rest
    const pedDeckD = g.ped.d + 80;
    const deckA = rad(m.rig.deck);
    const deckRear = Lo.heel[0] - 60 * Math.cos(deckA);
    const deckFront = deckRear + pedDeckD * Math.cos(deckA);
    // the wheel deck: under the base, which sits on it with its axis parallel to the deck
    const tl = rad(m.rig.tilt), axisD = [Math.cos(tl), -Math.sin(tl)], upD = [Math.sin(tl), Math.cos(tl)];
    const Wc = Lo.wheel;
    const at = (s, h) => [Wc[0] + axisD[0] * s + upD[0] * h, Wc[1] + axisD[1] * s + upD[1] * h];
    const wdS0 = g.wb.qr - 30, wdS1 = g.wb.qr + g.wb.l + 30;      // the deck's extent along the axis
    const wdRear = at(wdS0, -g.wb.axis), wdFront = at(wdS1, -g.wb.axis); // its top surface, back and front edges
    const wheelDeckD = wdS1 - wdS0;
    const postX = (wdRear[0] + wdFront[0]) / 2;                  // the wheel posts stand under the middle of the deck
    const lenB = Math.max(deckFront + 40, wdFront[0] + 60, postX + w / 2 + 40) + (stand ? 0 : 0);
    const x1 = Math.ceil(lenB / 10) * 10;
    const S1 = 1, S2 = 2, S3 = 3, S4 = 4, S5 = 5, S6 = 6;
    const parts = { W, len: x1, zR, postX, deckRear, deckFront, pedDeckD, wheelDeckD, wdRear, wdFront };
    const hw = { screws: 0, bolts: 0, brackets: 0, hinges: 0, tnuts: 0, caps: { p4040: 0, p4080: 0 }, gear: [] };
    const joint = (mem, n) => { mem.butts += n; };

    if (!stand) {
      // ======== base (step 1): two side rails on edge, cross members between them ========
      for (const z of [-zR, zR]) for (const [a, c] of runs(0, x1)) { const r0 = add3('rail', S1, [a, w / 2, z], [c, w / 2, z], [0, 1, 0], { where: T(z < 0 ? 'w.railL' : 'w.railR') }); r0.caps = 2; }
      const crossAt = [t / 2, x1 - t / 2];
      if (Lo.seated) crossAt.push(Lo.H[0] + 60);
      crossAt.push(postX);
      if (deckRear > 120 && Math.abs(deckRear - postX) > 150 && (!Lo.seated || deckRear > Lo.H[0] + 160)) crossAt.push(deckRear + t);
      const seenX = [];
      for (const x of crossAt.sort((a, c) => a - c)) {
        if (seenX.some(s => Math.abs(s - x) < t + 20)) continue; seenX.push(x);
        const c = add3('cross', S1, [x, w / 2, -zR + t / 2], [x, w / 2, zR - t / 2], [0, 1, 0], { where: T('w.cross'), sec: alu ? (x < 10 || x > x1 - 50 ? 'p4080' : 'p4040') : L.id });
        if (alu && c.sec === 'p4040') { c.a = 40; c.b = 40; c.p0[1] = c.p1[1] = 20; }
        joint(c, 2);
      }

      // ======== seat mount (step 2): two bars across the rails, raised on risers if the seat sits higher ========
      if (Lo.seated) {
        const need = Lo.H[1] - (F.rail + F.bar + D.SEATS[m.seat.type].lift);
        const riser = need > 4 ? need : 0;
        const barY = F.rail + riser + F.bar / 2;
        const barXs = [Lo.H[0] - 140, Lo.H[0] + 200];
        for (const bx of barXs) {
          if (riser > 0) for (const z of [-zR, zR]) { const r0 = add3('riser', S2, [bx, F.rail, z], [bx, F.rail + riser, z], [1, 0, 0], { where: T('w.riser'), a: t, b: w, sec: alu ? 'p4040' : L.id }); if (alu) { r0.a = 40; r0.b = 40; } joint(r0, 2); }
          const bar = add3('seatbar', S2, [bx, barY, -W / 2], [bx, barY, W / 2], [0, 1, 0], alu ? Object.assign({ where: T('w.seatbar') }, g4040) : { where: T('w.seatbarFlat'), a: L.t, b: L.w });
          bar.caps = 2; joint(bar, alu ? 2 : 0);
        }
        parts.seatBars = barXs; parts.riser = riser; parts.barTop = barY + F.bar / 2;
        hw.gear.push({ id: 'seat-bolts', label: T(alu ? 'g.seatBoltsAlu' : 'g.seatBolts'), qty: 4, unit: 'sets', note: T('g.seatBoltsNote') });
      }

      // ======== pedal deck (step 3): a plate on two stringers, raised and tilted on posts ========
      {
        const strT = alu ? 40 : L.t, strW = alu ? 40 : L.w;       // the stringers lie flat on the rails (wood) or are 40 x 40
        const plateTop = d => Lo.heel[1] + (d - 60) * Math.sin(deckA); // the deck's top surface at depth d from its back edge
        const strTopAt = d => plateTop(d) - F.plateT;
        const strY = d => strTopAt(d) - strT / 2;
        const xd = d => deckRear + d * Math.cos(deckA);
        const yLow = strY(0) - strT / 2, yHigh = strY(pedDeckD) - strT / 2;
        for (const z of [-zR, zR]) {
          const s0 = add3('stringer', S3, [xd(0), strY(0), z], [xd(pedDeckD), strY(pedDeckD), z], [-Math.sin(deckA), Math.cos(deckA), 0], alu ? Object.assign({ where: T('w.stringer') }, g4040) : { where: T('w.stringerFlat'), a: L.t, b: L.w, angled: m.rig.deck !== 0 });
          s0.caps = 2;
          for (const [d, y0] of [[strW / 2 + 5, yLow], [pedDeckD - strW / 2 - 5, yHigh]]) {
            const gap = y0 - F.rail;
            if (gap > 6) { const post = add3('post', S3, [xd(d), F.rail, z], [xd(d), F.rail + gap, z], [1, 0, 0], alu ? Object.assign({ where: T('w.pedPost') }, g4040) : { where: T(gap < 70 ? (m.rig.deck ? 'w.pedSpacerAngled' : 'w.pedSpacer') : (m.rig.deck ? 'w.pedPostAngled' : 'w.pedPost')), angled: !!m.rig.deck, spacer: gap < 70 }); joint(post, 2); }
            else joint(s0, alu ? 1 : 0);
          }
        }
        // a cross brace under the front of the deck, between the stringers, so the plate cannot rack under braking
        const cb = add3('cross', S3, [xd(pedDeckD - 30), strY(pedDeckD - 30), -zR + t / 2], [xd(pedDeckD - 30), strY(pedDeckD - 30), zR - t / 2], [0, 1, 0], alu ? Object.assign({ where: T('w.pedBrace') }, g4040) : { where: T('w.pedBrace'), a: L.t, b: L.w });
        joint(cb, 2);
        parts.pedalPlate = { x0: deckRear, y0: plateTop(0), angle: m.rig.deck, w: W, d: pedDeckD };
      }

      // ======== wheel deck (step 4): two posts, deck rails on top, braces, and a front panel or cross bars ========
      {
        const railT = alu ? 40 : L.t, railW = alu ? 40 : L.w;
        const rTop = s => at(s, -g.wb.axis - F.plateT);                 // the deck rails' top line
        const rC = s => { const q = rTop(s); return [q[0] - upD[0] * railW / 2, q[1] - upD[1] * railW / 2]; };
        const sMid = (wdS0 + wdS1) / 2;
        for (const z of [-zR, zR]) {
          const a0 = rC(wdS0), a1 = rC(wdS1);
          const dr = add3('deckrail', S4, [a0[0], a0[1], z], [a1[0], a1[1], z], [upD[0], upD[1], 0], alu ? Object.assign({ where: T('w.deckRail') }, g4040) : { where: T(m.rig.tilt ? 'w.deckRailEdgeTilt' : 'w.deckRailEdge'), a: L.w, b: L.t });
          dr.caps = 2;
          const top = rC(sMid);
          const yTop = top[1] - (alu ? 20 : railW / 2) / Math.max(0.3, Math.cos(tl));
          const post = add3('post', S4, [postX, F.rail, z], [postX, yTop, z], [1, 0, 0], { where: T(m.rig.tilt ? 'w.wheelPostTilt' : 'w.wheelPost'), angled: !!m.rig.tilt, sec: alu ? 'p4080' : L.id, a: alu ? 80 : w, b: alu ? 40 : t });
          joint(post, 2);
          // a brace from high on the post back and down to the base rail, clear of the pedal deck ahead
          const hb = Math.max(150, (yTop - F.rail) * 0.7);
          const back0 = Lo.seated ? Lo.H[0] + 280 : t + 40;
          const bx = Math.max(back0, postX - hb * 0.85);
          if (postX - w / 2 - bx > 80) {
            const br = add3('brace', S4, [postX - w / 2, F.rail + hb, z], [bx, F.rail + 10, z], null, alu ? Object.assign({ where: T('w.wheelBraceAlu'), angled: true }, g4040) : { where: T('w.wheelBrace'), angled: true, a: L.t, b: L.w });
            br.angledEnds = 2;
          }
        }
        const postTop = rC(sMid)[1] - (alu ? 20 : railW / 2);
        parts.wheelPlate = { s0: wdS0, s1: wdS1, w: W, d: wheelDeckD, tilt: m.rig.tilt, top: at(sMid, -g.wb.axis) };
        // the legs pass between the posts: anything across them must stay above the shins and knees
        const lt = legTop(b, p);
        let legY = -Infinity;
        for (let i = 0; i < lt.length - 1; i++) { const a0 = lt[i], a1 = lt[i + 1]; for (const xx of [postX - w / 2, postX + w / 2]) if (xx >= Math.min(a0[0], a1[0]) && xx <= Math.max(a0[0], a1[0])) legY = Math.max(legY, a0[1] + (a1[1] - a0[1]) * (xx - a0[0]) / ((a1[0] - a0[0]) || 1)); }
        const free = legY === -Infinity ? postTop - F.rail : postTop - (legY + 40);
        parts.apron = null;
        if (alu) {
          if (free >= 50) { const y = postTop - 20; const c = add3('cross', S4, [postX, y, -zR + 20], [postX, y, zR - 20], [0, 1, 0], Object.assign({ where: T('w.wheelBar') }, g4040)); joint(c, 2); }
        } else if (free >= 70) {
          const h = Math.min(free, 260);
          sheets.push({ id: 'gusset', where: T('w.apron'), w: h, l: W - 2 * t, t: 'deck', step: S4, kind: 'panel', at: [postX + w / 2, postTop - h, 0], plane: 'yz' });
          parts.apron = { y0: postTop - h, h };
          notes.push(T('note.apron'));
        }
      }

      // ======== shifter and handbrake (step 5): an arm out to the right, a post and a plate ========
      if (g.shifter || g.handbrake) {
        const shX = Math.min(Lo.wheel[0] - 60, x1 - 120), zOut = W / 2 + 150;
        const plateTop = (Lo.H[1] + Lo.wheel[1]) / 2 - 40;
        const armY = alu ? 20 : w / 2;
        const arm = add3('arm', S5, [shX, armY, W / 2], [shX, armY, zOut + 30], [0, 1, 0], alu ? Object.assign({ where: T('w.arm') }, g4040) : { where: T('w.armEdge') });
        joint(arm, 1); arm.caps = 1;
        const ph = plateTop - F.plateT;
        const post = add3('post', S5, [shX, alu ? 40 : w, zOut], [shX, ph, zOut], [1, 0, 0], alu ? Object.assign({ where: T('w.shPost') }, g4040) : { where: T('w.shPost') });
        joint(post, 2);
        const br = add3('brace', S5, [shX, alu ? 40 : w, W / 2 + 20], [shX, Math.min(ph - 60, (alu ? 40 : w) + (zOut - W / 2) * 1.6), zOut - t / 2], null, alu ? Object.assign({ where: T('w.shBraceAlu'), angled: true }, g4040) : { where: T('w.shBrace'), angled: true, a: L.t, b: L.w });
        br.angledEnds = 2;
        const pw = g.handbrake && g.shifter ? g.sh.d * 2 + 40 : g.sh.d;
        parts.shifterPlate = { x: shX, z: zOut, y: plateTop, w: g.sh.w, d: pw };
      }
    } else {
      // ======== plywood wheel stand: base board, two side panels, front panel, wheel deck, pedal plate ========
      const TK = sh.t;
      const sideH = s => at(s, -g.wb.axis - TK)[1];
      const deckTopRear = sideH(wdS0), deckTopFront = sideH(wdS1);
      sheets.push({ id: 'base', where: T('w.baseBoard'), w: W, l: x1, t: 'deck', step: S1, kind: 'panel', plane: 'xz', at: [0, 0, -W / 2] });
      const sideL = x1 - 40;
      for (const zs of [-1, 1]) sheets.push({ id: `side-${zs < 0 ? 'l' : 'r'}`, where: T(zs < 0 ? 'w.sideL' : 'w.sideR'), w: Math.max(deckTopRear, deckTopFront), l: sideL, t: 'deck', step: S2, kind: 'panel', plane: 'xy', at: [20, TK, zs * (W / 2 - TK / 2)], profile: { rear: 0.35, x0: Lo.heel[0] + 60 } });
      sheets.push({ id: 'front', where: T('w.front'), w: Math.max(deckTopFront - TK - 40, 120), l: W - 2 * TK, t: 'deck', step: S2, kind: 'panel', plane: 'yz', at: [x1 - TK / 2 - 20, TK, 0] });
      parts.standGeo = { T: TK, sideL, deckTopRear, deckTopFront, frontH: Math.max(deckTopFront - TK - 40, 120), lowX: Lo.heel[0] + 60 };
      // cleats: square battens glued and screwed inside every panel joint
      const cl = (where, a, c) => add3('cleat', S2, a, c, [0, 1, 0], { where, a: L.t, b: L.t, sec: L.id });
      for (const zs of [-1, 1]) {
        cl(T('w.cleatBase'), [40, TK + L.t / 2, zs * (W / 2 - TK - L.t / 2)], [x1 - 60, TK + L.t / 2, zs * (W / 2 - TK - L.t / 2)]);
        cl(T('w.cleatFront'), [x1 - TK - 20 - L.t / 2, TK + L.t, zs * (W / 2 - TK - L.t / 2)], [x1 - TK - 20 - L.t / 2, Math.max(deckTopFront - TK - 40, 150), zs * (W / 2 - TK - L.t / 2)]);
      }
      parts.wheelPlate = { s0: wdS0, s1: wdS1, w: W, d: wheelDeckD, tilt: m.rig.tilt, top: at((wdS0 + wdS1) / 2, -g.wb.axis) };
      parts.pedalPlate = { x0: deckRear, y0: Lo.heel[1] - 60 * Math.sin(deckA), angle: m.rig.deck, w: W - 2 * TK, d: pedDeckD };
      if (Lo.heel[1] - TK > 30 || m.rig.deck > 0) {
        const hr = Math.max(0, Lo.heel[1] - 2 * TK), hf = hr + pedDeckD * Math.sin(deckA);
        sheets.push({ id: 'cheek', where: T('w.cheeks'), w: Math.max(40, hf), l: pedDeckD, t: 'deck', step: S3, kind: 'panel', count: 2 });
      }
      if (g.shifter || g.handbrake) {
        const pw = g.handbrake && g.shifter ? g.sh.d * 2 + 40 : g.sh.d;
        const plateTop = (Lo.H[1] + Lo.wheel[1]) / 2 - 40;
        sheets.push({ id: 'shifter-upright', where: T('w.upright'), w: Math.max(160, plateTop - TK), l: 180, t: 'deck', step: S5, kind: 'panel' });
        parts.shifterPlate = { x: Math.min(Lo.wheel[0] - 60, x1 - 120), z: W / 2 + 100, y: plateTop, w: g.sh.w, d: pw };
      }
    }

    // ---- the plates (decks): sheet parts, each with its DXF ----
    const fix = alu ? 'slot' : 'screw';
    const wp = parts.wheelPlate, pp = parts.pedalPlate;
    const sidePitch = alu ? 40 : t;
    plates.push(plateSpec('wheel', T('p.wheel'), wp.w, wp.d, g.holes.wheel, { fix, edge: sidePitch / 2, slots: g.slots, step: S4, centreY: wp.d / 2 }));
    plates.push(plateSpec('pedals', T('p.pedals'), pp.w, pp.d, g.holes.pedals, { fix, edge: sidePitch / 2, slots: g.slots, step: S3, centreY: pp.d / 2 + 20, stand }));
    if (parts.shifterPlate) plates.push(plateSpec('shifter', T(g.handbrake && g.shifter ? 'p.both' : g.handbrake ? 'p.handbrake' : 'p.shifter'), parts.shifterPlate.w, parts.shifterPlate.d, g.holes.shifter, { fix: alu ? 'slot' : 'screw', edge: 25, slots: false, step: S5, centreY: parts.shifterPlate.d / 2, small: true, twin: !!(g.handbrake && g.shifter) }));
    for (const pl of plates) if (m.plate !== 'alu' || m.build === 'stand') sheets.push({ id: `plate-${pl.id}`, where: pl.label, w: Math.min(pl.w, pl.d), l: Math.max(pl.w, pl.d), t: 'deck', step: pl.step, kind: 'plate' });

    // ---- slabs: every plate and panel as a box (or an extruded outline) with its place, for the 3D model and the
    // drawings. size is along the slab's own axes: [along its depth, its thickness, across]; rotZ tilts it in side view.
    const slabs = [];
    const plateMat = m.plate === 'alu' && !stand ? 'alu' : 'sheet';
    const PT = plateMat === 'alu' ? 6 : sh.t;
    {
      const a = rad(pp.angle), u = [Math.cos(a), Math.sin(a)], n = [-Math.sin(a), Math.cos(a)];
      const c = [pp.x0 + u[0] * pp.d / 2 - n[0] * PT / 2, pp.y0 + u[1] * pp.d / 2 - n[1] * PT / 2, 0];
      slabs.push({ id: 'plate-pedals', kind: 'plate', mat: plateMat, step: S3, c, size: [pp.d, PT, pp.w], rotZ: a });
    }
    {
      const c = [wp.top[0] - upD[0] * PT / 2, wp.top[1] - upD[1] * PT / 2, 0];
      slabs.push({ id: 'plate-wheel', kind: 'plate', mat: plateMat, step: S4, c, size: [wp.d, PT, wp.w], rotZ: -tl });
    }
    if (parts.shifterPlate) { const q = parts.shifterPlate; slabs.push({ id: 'plate-shifter', kind: 'plate', mat: plateMat, step: S5, c: [q.x, q.y - PT / 2, q.z], size: [q.d, PT, q.w], rotZ: 0 }); }
    const gus = sheets.find(x => x.id === 'gusset');
    if (gus) slabs.push({ id: 'gusset', kind: 'panel', mat: 'sheet', step: S4, c: [gus.at[0] + sh.t / 2, gus.at[1] + gus.w / 2, 0], size: [sh.t, gus.w, gus.l], rotZ: 0 });
    if (stand) {
      const G = parts.standGeo, TK = G.T;
      slabs.push({ id: 'base', kind: 'panel', mat: 'sheet', step: S1, c: [x1 / 2, TK / 2, 0], size: [x1, TK, W], rotZ: 0 });
      const xa = 20, xb = 20 + G.sideL, low = TK + 0.35 * Math.max(G.deckTopRear, G.deckTopFront);
      const topAt = x => (x <= wp.top[0] ? G.deckTopRear + (G.deckTopFront - G.deckTopRear) * clamp((x - parts.wdRear[0]) / Math.max(1, parts.wdFront[0] - parts.wdRear[0]), 0, 1) : G.deckTopRear + (G.deckTopFront - G.deckTopRear) * clamp((x - parts.wdRear[0]) / Math.max(1, parts.wdFront[0] - parts.wdRear[0]), 0, 1));
      const xr = Math.max(xa + 40, Math.min(parts.wdRear[0], xb - 40)), xl = Math.max(xa + 20, Math.min(G.lowX, xr - 40));
      const poly = [[xa, TK], [xb, TK], [xb, topAt(xb)], [xr, topAt(xr)], [xl, low], [xa, low]];
      for (const zs of [-1, 1]) slabs.push({ id: `side-${zs < 0 ? 'l' : 'r'}`, kind: 'panel', mat: 'sheet', step: S2, poly, z0: zs * (W / 2) - (zs > 0 ? TK : 0), z1: zs * (W / 2) + (zs > 0 ? 0 : TK) });
      slabs.push({ id: 'front', kind: 'panel', mat: 'sheet', step: S2, c: [x1 - TK / 2 - 20, TK + G.frontH / 2, 0], size: [TK, G.frontH, W - 2 * TK], rotZ: 0 });
      if (sheets.some(x => x.id === 'cheek')) {
        const a = rad(pp.angle), y0 = TK, yr = pp.y0 - PT, yf = pp.y0 + pp.d * Math.sin(a) - PT;
        const cp = [[pp.x0, y0], [pp.x0 + pp.d * Math.cos(a), y0], [pp.x0 + pp.d * Math.cos(a), Math.max(y0 + 2, yf)], [pp.x0, Math.max(y0 + 2, yr)]];
        for (const zs of [-1, 1]) slabs.push({ id: `cheek-${zs < 0 ? 'l' : 'r'}`, kind: 'panel', mat: 'sheet', step: S3, poly: cp, z0: zs * (pp.w / 2) - (zs > 0 ? TK : 0), z1: zs * (pp.w / 2) + (zs > 0 ? 0 : TK) });
      }
      if (parts.shifterPlate) { const q = parts.shifterPlate; slabs.push({ id: 'shifter-upright', kind: 'panel', mat: 'sheet', step: S5, c: [q.x, TK + (q.y - PT - TK) / 2, W / 2 + TK / 2], size: [180, q.y - PT - TK, TK], rotZ: 0 }); }
    }

    // ---- the monitor stand (step 6): two feet, two posts and a bar, standing free beyond the rig ----
    const sd = screenDims(m.screen), sx = Lo.screen[0], syC = Lo.screen[1];
    const fv = fov(m.screen, Lo.screen[0] - p.E[0]);
    const span = m.screen.kind === 'triple' ? sd.w + 2 * m.screen.bezel : sd.w;
    let standW = 0;
    if (m.screen.stand) {
      const pz = Math.max(span / 2 * 0.62, 240);
      const sT = alu ? 40 : L.t, sW = alu ? 40 : L.w;
      const px = sx + 80;
      const barY = syC;
      const g4 = alu ? g4040 : { a: sT, b: sW };
      for (const z of [-pz, pz]) {
        const ft = add3('foot', S6, [px - 260, sT / 2, z], [px + 260, sT / 2, z], [0, 1, 0], Object.assign({ where: T('w.foot') }, alu ? g4040 : { a: L.t, b: L.w })); ft.caps = 2;
        const post = add3('post', S6, [px, sT, z], [px, barY + sW / 2 + 20, z], [1, 0, 0], Object.assign({ where: T('w.standPost') }, g4)); joint(post, 1); post.caps = 1;
      }
      const bar = add3('bar', S6, [px - sT / 2 - 10, barY, -Math.max(pz + 60, span / 2 * 0.98)], [px - sT / 2 - 10, barY, Math.max(pz + 60, span / 2 * 0.98)], [0, 1, 0], Object.assign({ where: T('w.standBar') }, g4)); bar.caps = 2; joint(bar, 0);
      standW = Math.max(2 * pz + 120, span);
      parts.stand = { x: px, z: pz, w: standW, d: 520 };
      hw.gear.push({ id: 'vesa', label: T(m.screen.kind === 'triple' ? 'g.vesa3' : 'g.vesa1'), qty: m.screen.kind === 'triple' ? 3 : 1, unit: 'mounts', note: T('g.vesaNote') });
    }
    parts.screen = { x: sx, y: syC, w: sd.w, h: sd.h, kind: m.screen.kind, side: fv.side, bezel: m.screen.bezel };

    // ---- aluminium hardware: brackets on every butt joint, T-nuts and bolts, end caps on every open end ----
    if (alu) {
      for (const mem of M) {
        const per = mem.sec === 'p4080' ? 4 : 2;
        hw.brackets += mem.butts * per;
        hw.hinges += mem.angledEnds || 0;
        hw.caps[mem.sec] += mem.caps;
      }
      hw.tnuts = 2 * (hw.brackets + hw.hinges);
      hw.bolts = hw.tnuts;
    } else {
      for (const mem of M) hw.screws += (mem.kind === 'cleat' ? 2 : 4) * (mem.butts || (mem.kind === 'rail' || mem.kind === 'seatbar' ? 0 : 2)) + (mem.angledEnds ? 2 : 0);
      hw.screws = Math.ceil(hw.screws * 1.1);
    }
    // gear to its plate: one bolt for each hole of each pattern
    for (const pl of plates) hw.gear.push({ id: `bolts-${pl.id}`, label: T('g.bolts', { plate: pl.label, hole: holeMm(pl.holeD) }), qty: pl.gearHoles * (pl.twin ? 2 : 1), unit: 'sets', note: T('g.boltsNote') });
    // plates to the frame
    const fixCount = plates.reduce((a, pl) => a + pl.fixings.length, 0);

    const footprint = { x: x1, z: W + (parts.shifterPlate ? 2 * 150 + 60 : 0) };
    const front = m.screen.stand ? Math.max(x1, parts.stand.x + 260 + 20) : x1;
    const chairBack = Lo.seated ? 0 : Math.min(0, Lo.H[0] - b.hipBack - 120);   // an office chair stands behind the rig
    const full = { x: front - chairBack, z: Math.max(footprint.z, standW + 40), x0: chairBack };
    return { m, body: b, lay: Lo, posture: p, F, lumber: L, sheet: sh, members: M, sheets, slabs, plates, parts, hw, fixCount, notes, footprint, full, fov: fv, screenSize: sd, alu, stand, axis: { d: axisD, up: upD } };
  }

  // ---------- Plates: outline, the gear's hole pattern (typed by the user) and the fixings to the frame ----------
  function plateSpec(id, label, w, d, holes, o) {
    w = Math.round(w); d = Math.round(d);
    const r = 12;
    const pat = [];
    const cx = w / 2, cy = clamp(o.centreY, 40, d - 40);
    const sets = o.twin ? [cy - d / 4, cy + d / 4] : [cy];
    for (const yc of sets) for (let i = 0; i < holes.cols; i++) for (let j = 0; j < holes.rows; j++) {
      const x = cx + (i - (holes.cols - 1) / 2) * holes.x, y = yc + (j - (holes.rows - 1) / 2) * holes.y;
      if (x < 15 || x > w - 15 || y < 15 || y > d - 15) continue;
      pat.push({ x: r1(x), y: r1(y), d: holes.d, slot: o.slots ? Math.min(30, d / 8) : 0 });
    }
    const fixings = [];
    if (!o.stand) {
      if (o.small) { for (const [x, y] of [[o.edge, o.edge], [w - o.edge, o.edge], [o.edge, d - o.edge], [w - o.edge, d - o.edge]]) fixings.push({ x, y, d: o.fix === 'slot' ? 8.5 : 5, slot: o.fix === 'slot' ? 16 : 0 }); }
      else {
        const n = Math.max(2, Math.round((d - 60) / 140) + 1);
        for (const x of [o.edge, w - o.edge]) for (let k = 0; k < n; k++) { const y = 30 + (d - 60) * k / (n - 1); fixings.push({ x, y: r1(y), d: o.fix === 'slot' ? 8.5 : 5, slot: o.fix === 'slot' ? 20 : 0 }); }
      }
    } else {
      for (const x of [25, w - 25]) for (const y of [30, d - 30]) fixings.push({ x, y, d: 5, slot: 0 });
    }
    return { id, label, w, d, r, holes: pat, holeD: holes.d, gearHoles: holes.cols * holes.rows, measured: holes.measured, fixings, step: o.step, twin: !!o.twin, fix: o.fix };
  }

  // ---------- DXF (AutoCAD R12, ASCII): the outline, the holes and slots, a notes layer ----------
  // Units: millimetres ($INSUNITS 4) or inches ($INSUNITS 1). Layers: CUT_OUTLINE, CUT_HOLES, NOTES (not to be cut).
  function dxf(pl, o = {}) {
    const inch = o.units === 'in', k = inch ? 1 / IN : 1;
    const f = x => (Math.round(x * k * 10000) / 10000).toString();
    const out = [];
    const pair = (c, val) => { out.push(String(c), String(val)); };
    const ent = (type, layer, kv) => { pair(0, type); pair(8, layer); for (const [c, val] of kv) pair(c, val); };
    const line = (layer, a, b) => ent('LINE', layer, [[10, f(a[0])], [20, f(a[1])], [30, '0'], [11, f(b[0])], [21, f(b[1])], [31, '0']]);
    const arc = (layer, c, rr, a0, a1) => ent('ARC', layer, [[10, f(c[0])], [20, f(c[1])], [30, '0'], [40, f(rr)], [50, a0], [51, a1]]);
    const circle = (layer, c, rr) => ent('CIRCLE', layer, [[10, f(c[0])], [20, f(c[1])], [30, '0'], [40, f(rr)]]);
    const text = (layer, c, h, s) => ent('TEXT', layer, [[10, f(c[0])], [20, f(c[1])], [30, '0'], [40, f(h)], [1, s]]);
    const slot = (layer, c, dd, sl) => { // a slot along y, sl long between the centres of its ends, dd wide
      const rr = dd / 2, y0 = c[1] - sl / 2, y1 = c[1] + sl / 2;
      line(layer, [c[0] - rr, y0], [c[0] - rr, y1]); line(layer, [c[0] + rr, y0], [c[0] + rr, y1]);
      arc(layer, [c[0], y1], rr, 0, 180); arc(layer, [c[0], y0], rr, 180, 360);
    };
    const W = pl.w, H = pl.d, R = pl.r;
    // header: version, units, extents
    pair(0, 'SECTION'); pair(2, 'HEADER');
    pair(9, '$ACADVER'); pair(1, 'AC1009');
    pair(9, '$INSUNITS'); pair(70, inch ? 1 : 4);
    pair(9, '$EXTMIN'); pair(10, '0'); pair(20, '0'); pair(30, '0');
    pair(9, '$EXTMAX'); pair(10, f(W)); pair(20, f(H)); pair(30, '0');
    pair(0, 'ENDSEC');
    // tables: the line type and the three layers
    pair(0, 'SECTION'); pair(2, 'TABLES');
    pair(0, 'TABLE'); pair(2, 'LTYPE'); pair(70, 1);
    pair(0, 'LTYPE'); pair(2, 'CONTINUOUS'); pair(70, 0); pair(3, 'Solid line'); pair(72, 65); pair(73, 0); pair(40, '0.0');
    pair(0, 'ENDTAB');
    pair(0, 'TABLE'); pair(2, 'LAYER'); pair(70, 3);
    for (const [name, col] of [['CUT_OUTLINE', 7], ['CUT_HOLES', 1], ['NOTES', 8]]) { pair(0, 'LAYER'); pair(2, name); pair(70, 0); pair(62, col); pair(6, 'CONTINUOUS'); }
    pair(0, 'ENDTAB');
    pair(0, 'ENDSEC');
    // entities
    pair(0, 'SECTION'); pair(2, 'ENTITIES');
    line('CUT_OUTLINE', [R, 0], [W - R, 0]); arc('CUT_OUTLINE', [W - R, R], R, 270, 360);
    line('CUT_OUTLINE', [W, R], [W, H - R]); arc('CUT_OUTLINE', [W - R, H - R], R, 0, 90);
    line('CUT_OUTLINE', [W - R, H], [R, H]); arc('CUT_OUTLINE', [R, H - R], R, 90, 180);
    line('CUT_OUTLINE', [0, H - R], [0, R]); arc('CUT_OUTLINE', [R, R], R, 180, 270);
    for (const h of pl.holes.concat(pl.fixings)) {
      if (h.slot > 0) slot('CUT_HOLES', [h.x, h.y], h.d, h.slot); else circle('CUT_HOLES', [h.x, h.y], h.d / 2);
    }
    const th = Math.max(4, Math.min(10, W / 40)) ;
    text('NOTES', [R + 4, H - R - th * 1.6], th, dxfText(`${pl.label} ${Math.round(W)} X ${Math.round(H)} MM`));
    text('NOTES', [R + 4, H - R - th * 3.2], th * 0.8, dxfText(T(pl.measured ? 'dxf.measured' : 'dxf.example')));
    pair(0, 'ENDSEC'); pair(0, 'EOF');
    return out.join('\r\n') + '\r\n';
  }

  // the NOTES text of a DXF in plain upper-case ASCII, which every CAD and CAM program reads whatever its code page:
  // umlauts written out (AE, OE, UE, SS), other accents dropped (PEDALPLATTE, PEDALEIRA, PLAQUE DU PEDALIER)
  function dxfText(s) {
    // curly apostrophes become straight ones and no-break spaces plain spaces (French: D'EXEMPLE : MESUREZ)
    return String(s).toUpperCase().replace(/Ä/g, 'AE').replace(/Ö/g, 'OE').replace(/Ü/g, 'UE').replace(/ẞ|ß/g, 'SS')
      .replace(/[\u2018\u2019\u02bc]/g, "'").replace(/[\u00a0\u202f]/g, ' ').replace(/\u0152/g, 'OE').replace(/\u00c6/g, 'AE')
      .normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/[^\x20-\x7e]/g, '');
  }

  // ---------- First-fit decreasing, for boards and for profile ----------
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

  // ---------- The cut list (wood: boards from stock lengths) ----------
  function cutList(design) {
    const m = design.m;
    if (design.alu) return { kerf: 0, trim: 0, cuts: [], boards: [], sections: [], tooLong: [], total: 0, bought: 0, waste: 0 };
    const kerf = m.units === 'metric' ? 3 : IN / 8, trim = endTrim(m.units);
    const stocks = lengthsOf(design.lumber.id, m.units);
    const roundUp = x => (m.units === 'metric' ? Math.ceil(x - 0.01) : Math.ceil(x / IN * 16 - 0.01) / 16 * IN);
    const all = design.members.map(mem => ({ id: mem.id, len: roundUp(mem.len), where: mem.where, kind: mem.kind, angled: !!mem.angled, step: mem.step, sec: mem.sec }));
    const r = ffd(all, stocks, m.stock, kerf, trim);
    r.bins.forEach((b, i) => { b.n = i + 1; b.cuts.sort((x, y) => y.len - x.len); });
    const total = all.reduce((s, c) => s + c.len, 0), bought = r.bins.reduce((s, b) => s + b.stock, 0);
    return { kerf, trim, cuts: all, boards: r.bins, sections: [{ sec: design.lumber.id, lumber: design.lumber, boards: r.bins }], tooLong: r.tooLong, total, bought, waste: bought ? 1 - total / bought : 0 };
  }

  // ---------- Aluminium bill of materials: every cut, then what to order ----------
  function aluBom(design) {
    if (!design.alu) return null;
    const m = design.m;
    const groups = {};
    for (const mem of design.members) {
      const L = Math.round(mem.len);
      const g = groups[mem.sec] = groups[mem.sec] || { sec: mem.sec, profile: profileOf(mem.sec), cuts: {}, total: 0, n: 0 };
      const key = `${L}`;
      g.cuts[key] = g.cuts[key] || { len: L, qty: 0, where: new Set(), angled: false };
      g.cuts[key].qty++; g.cuts[key].where.add(mem.where.replace(/ \(.*\)$/, '')); if (mem.angled) g.cuts[key].angled = true;
      g.total += L; g.n++;
    }
    const sections = Object.values(groups).sort((a, b) => (a.sec === 'p4080' ? -1 : 1)).map(g => {
      const cuts = Object.values(g.cuts).sort((a, b) => b.len - a.len).map(c => ({ len: c.len, qty: c.qty, where: [...c.where].join('; '), angled: c.angled }));
      // for those who cut it themselves: the cuts packed onto stock lengths with a 3 mm saw kerf
      const flat = []; for (const c of cuts) for (let i = 0; i < c.qty; i++) flat.push({ len: c.len, where: c.where });
      const pack = ffd(flat, D.PROFILE_STOCK, D.PROFILE_STOCK[D.PROFILE_STOCK.length - 1], 3, 0);
      return { sec: g.sec, profile: g.profile, cuts, total: g.total, n: g.n, kg: g.total / 1000 * g.profile.kg, stock: pack.bins, tooLong: pack.tooLong };
    });
    const hw = design.hw;
    return { sections, brackets: hw.brackets, hinges: hw.hinges, tnuts: hw.tnuts + design.fixCount, bolts: hw.bolts + design.fixCount, caps: hw.caps, kg: sections.reduce((a, s) => a + s.kg, 0) };
  }

  // ---------- Plywood pieces on sheets: pieces in strips along the sheet, strips packed across it ----------
  function sheetLayout(design) {
    const m = design.m, sh = design.sheet;
    const kerf = m.units === 'metric' ? 3 : IN / 8;
    const pieces = [];
    for (const p of design.sheets) {
      const n = p.count || 1;
      for (let i = 0; i < n; i++) {
        const acr = Math.max(1, Math.ceil(Math.min(p.w, p.l) / sh.w - 1e-9)), alg = Math.max(1, Math.ceil(Math.max(p.w, p.l) / sh.l - 1e-9));
        const pw = Math.min(p.w, p.l) / acr, plen = Math.max(p.w, p.l) / alg;
        for (let j = 0; j < acr * alg; j++) pieces.push({ id: p.id + (n > 1 ? `.${i + 1}` : '') + (acr * alg > 1 ? `-${j + 1}` : ''), where: p.where, w: Math.ceil(Math.min(sh.w, pw)), l: Math.ceil(Math.min(sh.l, plen)), step: p.step });
      }
    }
    const sorted = pieces.slice().sort((a, b) => b.w - a.w || b.l - a.l);
    const strips = [];
    for (const p of sorted) {
      let s = strips.find(x => x.width >= p.w && x.left + 1e-6 >= p.l + (x.pieces.length ? kerf : 0));
      if (!s) { s = { width: p.w, left: sh.l, pieces: [] }; strips.push(s); }
      s.left -= p.l + (s.pieces.length ? kerf : 0); s.pieces.push(p);
    }
    const { bins } = ffd(strips.map((s, i) => ({ len: s.width, where: `strip ${i + 1}`, strip: s })), [sh.w], sh.w, kerf);
    return { sheet: sh, pieces, sheets: bins.map(b => ({ strips: b.cuts.map(c => c.strip), left: b.leftover })), count: bins.length, area: pieces.reduce((a, p) => a + p.w * p.l, 0) / 1e6 };
  }

  // ---------- The shopping list ----------
  function shopping(design, cut, bom, sheets) {
    const m = design.m, u = m.units, items = [];
    // gid is the group's id (the words of group follow the language); hw names the market's hardware listing, if any
    const hwSrc = id => (MK().hardware && MK().hardware[id]) || null;
    const push = (id, gid, label, qty, unit2, note, source) => { if (qty > 0) items.push({ id, group: T(`grp.${gid}`), gid, label, qty, unit: unit2, note: note || '', source: source || null }); };
    if (!design.alu) {
      const counts = {}; for (const b of cut.boards) counts[b.stock] = (counts[b.stock] || 0) + 1;
      for (const [stock, n] of Object.entries(counts).sort((a, b) => a[0] - b[0])) push(`lumber:${design.lumber.id}:${Math.round(stock)}`, 'lumber', T('s.lumber', { label: design.lumber.label, stock: stockLabel(Number(stock), u) }), n, 'boards', T('s.lumberNote', { actual: design.lumber.actual }), design.lumber.source);
    } else {
      for (const s of bom.sections) push(`profile:${s.sec}`, 'profile', s.profile.label, Math.ceil(s.total / 10) / 100, 'm', T('s.profileNote', { n: s.n, kg: s.kg }), s.profile.source);
      push('brackets', 'alu', T('s.brackets'), bom.brackets, 'brackets', T('s.bracketsNote'), hwSrc('brackets'));
      push('hinges', 'alu', T('s.hinges'), bom.hinges, 'brackets', T('s.hingesNote'), hwSrc('hinges'));
      push('tnuts', 'alu', T('s.tnuts'), bom.tnuts, 'T-nuts', T('s.tnutsNote'), hwSrc('tnuts'));
      push('bolts', 'alu', T('s.bolts'), bom.bolts, 'bolts', T('s.boltsNote'), hwSrc('bolts'));
      push('caps4040', 'alu', T('s.caps4040'), bom.caps.p4040, 'caps', '', hwSrc('caps4040'));
      push('caps4080', 'alu', T('s.caps4080'), bom.caps.p4080, 'caps', '', hwSrc('caps4080'));
    }
    if (sheets.count) push(`sheet:${design.sheet.id}`, 'sheet', design.sheet.label, sheets.count, 'sheets', T(design.stand ? 's.sheetNoteStand' : 's.sheetNote'), design.sheet.source);
    if (design.alu && m.plate === 'alu') push('plates-alu', 'sheet', T('s.platesAlu'), design.plates.length, 'plates', T('s.platesAluNote'), null);
    if (!design.alu) {
      push('screws-frame', 'fast', T('s.screwsFrame', { size: u === 'metric' ? '5 x 80 mm' : '3 in' }), design.hw.screws, 'screws', T('s.screwsFrameNote'), null);
      const ply = design.plates.reduce((a, p) => a + p.fixings.length, 0) + (design.sheets.filter(s => s.kind === 'panel').length * 12);
      push('screws-ply', 'fast', T('s.screwsPly', { size: u === 'metric' ? '4 x 40 mm' : '1 1/2 in' }), Math.ceil(ply * 1.1), 'screws', T('s.screwsPlyNote'), null);
      push('glue', 'fast', T('s.glue'), 1, 'bottle', T('s.glueNote'), null);
    }
    for (const gx of design.hw.gear) push(gx.id, 'gear', gx.label, gx.qty, gx.unit, gx.note, null);
    let total = 0, priced = 0;
    for (const it of items) { const p = m.prices[it.id]; if (p != null) { it.price = p; it.cost = r1(p * it.qty); total += it.cost; priced++; } }
    return { items, total: r1(total), priced };
  }

  // ---------- The checks ----------
  // The thresholds are the same in every language; the words come from the dictionary (keys c.*), which gets the
  // figures already written in the page's units and number format. A market may cite the same publisher's article in
  // its own language (data.js MARKETS[lang].alias).
  const SRC = id => {
    const a = (id && MK().alias && MK().alias[id]) || id;
    const s = a && (D.LOCAL_SOURCES[a] || D.SOURCES[a]);
    return s ? Object.assign({ id: a }, s) : null;
  };
  const dg = x => T('u.deg', { v: N(x, 0) });
  const rng = (a, b) => T('u.degRange', { a, b });
  function checks(m, design) {
    const u = m.units, rows = [], b = design.body, p = design.posture, Lo = design.lay;
    const row = (id, topic, status, title, yours, limit, reason, src) => rows.push({ id, topic, status, title, yours, limit, reason, sources: (src || []).map(SRC).filter(Boolean) });
    const L = x => len(x, u);
    const halfIn = x => I.dec(String(Math.round(x / IN * 2) / 2));
    const M = x => (u === 'metric' ? `${x} mm` : `${x} mm (${halfIn(x)} in)`);   // a figure the source gives in mm
    const MM = (a, z) => (u === 'metric' ? T('u.mmRange', { a, z }) : T('u.mmRangeIn', { a, z, ai: halfIn(a), zi: halfIn(z) }));
    const st = m.style, R = RU, styleName = STYLE_NAME[st];
    // ---- the seat ----
    const tor = p.back;
    if (st === 'formula') {
      const ok = tor >= R.torso.formula.fits[0] - 0.01;
      row('torso', 'seat', ok ? 'fits' : 'check', T('c.torso.title'), T('c.torso.yours', { deg: dg(tor) }), T('c.torso.limitFormula'),
        T(ok ? 'c.torso.formulaOk' : 'c.torso.formulaUpright'), ['porterGyi', 'qubic', 'fanatecFormula']);
    } else {
      const f = R.torso.gt.fits, car = R.torso.gt.car;
      const s = tor >= f[0] - 0.01 && tor <= f[1] + 0.01 ? 'fits' : 'check';
      const truck = st === 'rally' && tor >= R.torso.rally.truck[0] && tor <= R.torso.rally.truck[1];
      row('torso', 'seat', s, T('c.torso.title'), T('c.torso.yours', { deg: dg(tor) }), st === 'rally' ? T('c.torso.limitRally') : rng(f[0], f[1]),
        s === 'fits' ? T('c.torso.fits', { rally: st === 'rally', truck }) : tor > f[1] ? T('c.torso.reclined', { inCar: tor <= car[1], style: styleName }) : T('c.torso.upright'),
        st === 'rally' ? ['porterGyi', 'j1100'] : ['porterGyi', 'j1100', 'fanatecF1']);
    }
    // the heel point against the seat (H30)
    const h30 = Lo.H[1] - Lo.heel[1];
    if (st === 'formula') {
      const ok = h30 < R.h30.formula.below;
      row('h30', 'seat', ok ? 'fits' : 'check', T('c.h30.title'), T('c.h30.yours', { len: L(h30) }), T('c.h30.limitFormula', { mm: M(127) }),
        ok ? T('c.h30.formulaOk') : T('c.h30.formulaHigh', { range: MM(127, 405) }), ['j1100', 'fanatecFormula', 'qubic']);
    } else {
      const f = st === 'rally' ? R.h30.rally.fits : R.h30.gt.fits;
      const s = h30 >= f[0] - 0.5 && h30 <= f[1] + 0.5 ? 'fits' : 'check';
      row('h30', 'seat', s, T('c.h30.title'), T('c.h30.yours', { len: L(h30) }), MM(f[0], f[1]),
        s === 'fits' ? (st === 'rally' ? T('c.h30.fitsRally', { cars: MM(127, 405), trucks: MM(405, 530) }) : T('c.h30.fits', { cars: MM(127, 405), chosen: MM(283, 335), mean: M(301) }))
          : h30 < f[0] ? T('c.h30.low', { mm: M(127) }) : T('c.h30.high', { rally: st === 'rally', mm: M(f[1]) }),
        st === 'rally' ? ['j1100'] : ['j1100', 'porterGyi']);
    }
    // ---- the legs ----
    const kr = p.rest, kp = p.press;
    if (kr.reach === 'far') row('knee', 'legs', 'fail', T('c.knee.title'), T('c.knee.far'), rng(R.knee.fits[0], R.knee.fits[1]), T('c.knee.farWhy', { len: L(kr.d - b.thigh - b.shank) }), ['porterGyi']);
    else {
      const f = R.knee.fits, s = kr.knee >= f[0] - 0.01 && kr.knee <= f[1] + 0.01 ? 'fits' : 'check';
      row('knee', 'legs', s, T('c.knee.title'), dg(kr.knee), T('c.knee.limit', { range: rng(f[0], f[1]), gt: st === 'gt' }),
        s === 'fits' ? T('c.knee.fits', { gt: st === 'gt', straighter: kr.knee > 120.5 }) : kr.knee < f[0] ? T('c.knee.bent') : T('c.knee.straight'),
        st === 'gt' ? ['porterGyi', 'fanatecGT'] : ['porterGyi']);
      const pk = kp.reach === 'far' ? 180 : kp.knee;
      const ps = kp.reach === 'far' ? 'fail' : pk <= f[1] + 0.01 ? 'fits' : 'check';
      row('knee-press', 'legs', ps, T('c.press.title'), kp.reach === 'far' ? T('c.press.far') : T('c.press.yours', { deg: dg(pk), travel: m.gear.travel }), T('c.press.limit'),
        ps === 'fits' ? T('c.press.fits') : ps === 'check' ? T('c.press.check', { deg: dg(pk), len: L(30) }) : T('c.press.fail'),
        ['fanatecGT', 'fanatecFormula', 'porterGyi']);
    }
    {
      const f = R.hip.fits, s = p.hip >= f[0] - 0.01 && p.hip <= f[1] + 0.01 ? 'fits' : 'check';
      row('hip', 'legs', s, T('c.hip.title'), dg(p.hip), rng(f[0], f[1]),
        s === 'fits' ? T('c.hip.fits') : p.hip < f[0] ? T('c.hip.closed') : T('c.hip.open'),
        ['porterGyi']);
    }
    if (kr.reach !== 'far') {
      const f = R.ankle.fits, s = kr.ankle >= f[0] - 0.01 && kr.ankle <= f[1] + 0.01 ? 'fits' : 'check';
      row('ankle', 'legs', s, T('c.ankle.title'), T('c.ankle.yours', { deg: dg(kr.ankle), deck: dg(m.rig.deck) }), rng(f[0], f[1]),
        s === 'fits' ? T('c.ankle.fits') : kr.ankle < f[0] ? T('c.ankle.up') : T('c.ankle.down'),
        ['porterGyi', 'fanatecGT']);
    }
    // ---- the arms and the wheel ----
    if (p.armReach === 'far') row('elbow', 'wheel', 'fail', T('c.elbow.title'), T('c.elbow.far'), rng(RU.elbow.fits[0], RU.elbow.fits[1]), T('c.elbow.farWhy', { len: L(p.d3 - b.upperArm - b.forearm) }), ['fanatecF1']);
    else {
      const f = R.elbow.fits, s = p.elbow >= f[0] - 0.01 && p.elbow <= f[1] + 0.01 ? 'fits' : 'check';
      row('elbow', 'wheel', s, T('c.elbow.title'), T('c.elbow.yours', { deg: dg(p.elbow) }), rng(f[0], f[1]),
        s === 'fits' ? T('c.elbow.fits') : p.elbow < f[0] ? T('c.elbow.bent') : T('c.elbow.straight'),
        ['fanatecF1', 'qubic', 'porterGyi']);
    }
    {
      const w = Lo.wheel[1], sh = p.S[1], ch = p.chest[1];        // heights above the floor
      const s = w >= ch - 5 && (w <= sh + 5 || st === 'formula') ? 'fits' : 'check';
      const where = w > sh + 5 ? T('c.wh.above', { len: L(w - sh) }) : w < ch - 5 ? T('c.wh.below', { len: L(ch - w) }) : T('c.wh.between', { len: L(sh - w) });
      row('wheel-height', 'wheel', s, T('c.wh.title'), where, T('c.wh.limit'),
        s === 'fits' ? (st === 'formula' && w > sh + 5 ? T('c.wh.fitsFormulaHigh') : T('c.wh.fits', { formula: st === 'formula' }))
          : w > sh + 5 ? T('c.wh.high', { formula: st === 'formula' }) : T('c.wh.low'),
        ['asetekWheel', 'qubic']);
    }
    {
      const lr = legroom(b, p, m.gear, Lo.wheel, m.rig.tilt, design.F.plateT), c = lr.min, what = lr.deck < lr.rim ? 'deck' : 'rim';
      row('legroom', 'wheel', c >= 25 ? 'fits' : c >= 0 ? 'check' : 'fail', T('c.leg.title'), c >= 0 ? T('c.leg.clear', { len: L(c), what }) : T('c.leg.into', { len: L(-c), what }), T('c.leg.limit'),
        c >= 25 ? T('c.leg.fits') : c >= 0 ? T('c.leg.close', { what }) : T('c.leg.hits', { what }),
        ['ansur2']);
    }
    // ---- the screen ----
    {
      const sd = design.screenSize, top = Lo.screen[1] + sd.h / 2, ctr = Lo.screen[1], eye = p.E[1];
      const s = eye >= ctr - 10 && eye <= top + 10 ? 'fits' : 'check';
      row('eye', 'screen', s, T('c.eye.title'), eye >= ctr ? T('c.eye.above', { len: L(eye - ctr) }) : T('c.eye.below', { len: L(ctr - eye) }), T('c.eye.limit'),
        s === 'fits' ? T('c.eye.fits') : eye < ctr ? T('c.eye.low') : T('c.eye.high'),
        ['asetekMonitor', 'asetekErgo', 'fanatecF1']);
      // the rim against the line of sight to the middle of the screen
      const E = p.E, C = Lo.screen, T2 = p.rimTop;
      const yAt = E[1] + (C[1] - E[1]) * (T2[0] - E[0]) / ((C[0] - E[0]) || 1);
      const over = T2[1] - yAt;
      row('view', 'screen', over <= 0 ? 'fits' : 'check', T('c.view.title'), over <= 0 ? T('c.view.under', { len: L(-over) }) : T('c.view.over', { len: L(over) }), T('c.view.limit'),
        T(over <= 0 ? 'c.view.fits' : 'c.view.hides'),
        ['asetekMonitor']);
      const fv = design.fov, d = Lo.screen[0] - p.E[0];
      row('fov', 'screen', 'info', T('c.fov.title'), T('c.fov.yours', { h: fv.h, v: fv.v, side: fv.side, triple: m.screen.kind === 'triple' }), T('c.fov.limit', { size: m.screen.size, kind: m.screen.kind, len: L(d) }),
        T('c.fov.why', { triple: m.screen.kind === 'triple' }),
        ['asetekMonitor']);
    }
    // ---- the frame ----
    {
      const dd = m.gear.base === 'dd';
      const what = design.alu ? T('c.deck.alu') : design.stand ? T('c.deck.stand') : T('c.deck.wood', { lumber: design.lumber.label });
      row('deck', 'frame', dd ? 'check' : 'info', T('c.deck.title'), T('c.deck.yours', { dd, what }), T(dd ? 'c.deck.limitDd' : 'c.deck.limitBelt'),
        T(dd ? 'c.deck.whyDd' : 'c.deck.whyBelt'),
        ['asetekWheel', 'asetekErgo']);
      if (m.gear.pedals === 'loadcell') row('pedal-deck', 'frame', 'info', T('c.ped.title'), T('c.ped.yours'), T('c.ped.limit'), T('c.ped.why'), ['fanatecFormula', 'asetekErgo']);
      const ms = ['wheel', 'pedals', 'shifter'].filter(k => k !== 'shifter' || m.gear.shifter || m.gear.handbrake).filter(k => !m.gear.holes[k].measured);
      row('holes', 'frame', ms.length ? 'check' : 'fits', T('c.holes.title'), ms.length ? T('c.holes.example', { list: ms.map(k => T(`c.holes.n.${k}`)).join(T('c.holes.sep')) }) : T('c.holes.measured'), T('c.holes.limit'),
        T(ms.length ? 'c.holes.whyExample' : 'c.holes.whyMeasured'), []);
      const fp = design.full, rw = m.room.w, rd = m.room.d;
      const fits = (fp.x <= rd + 1 && fp.z <= rw + 1) || (fp.x <= rw + 1 && fp.z <= rd + 1);
      row('room', 'frame', fits ? 'fits' : 'fail', T('c.room.title'), T('c.room.yours', { a: len(fp.x, u, 'dim'), b: len(fp.z, u, 'dim'), stand: m.screen.stand }), T('c.room.limit', { a: len(rd, u, 'dim'), b: len(rw, u, 'dim') }),
        T(fits ? 'c.room.fits' : 'c.room.fails'), []);
    }
    if (b.outside) row('body', 'seat', 'info', T('c.body.title'), T('c.body.yours', { h: height(b.S, u) }), T('c.body.limit'), T('c.body.why'), ['ansur2']);
    return rows;
  }

  // ---------- Everything at once ----------
  function evaluate(src) {
    const m = normalize(sizeFor(normalize(src)));
    const design = build(m);
    const cut = cutList(design);
    const bom = aluBom(design);
    const sheets = sheetLayout(design);
    const shop = shopping(design, cut, bom, sheets);
    const rows = checks(m, design);
    const counts = { fits: 0, check: 0, fail: 0, info: 0 };
    for (const r of rows) counts[r.status]++;
    return { m, design, body: design.body, posture: design.posture, cut, bom, sheets, shop, checks: rows, counts, footprint: design.full, fov: design.fov, steps: STEPS(design), holeMm };
  }

  // the assembly order, as the PDF prints it and the exploded view plays it
  function STEPS(design) {
    const m = design.m, alu = design.alu, s = [];
    const u = m.units;
    if (design.stand) {
      s.push({ n: 1, title: T('st.board.t'), text: T('st.board.x') });
      s.push({ n: 2, title: T('st.panels.t'), text: T('st.panels.x') });
      s.push({ n: 3, title: T('st.pedalPlate.t'), text: T('st.pedalPlate.x') });
      s.push({ n: 4, title: T('st.deck.t'), text: T('st.standDeck.x', { every: u === 'metric' ? '100 mm' : '4 in' }) });
      if (m.gear.shifter || m.gear.handbrake) s.push({ n: 5, title: T('st.upright.t'), text: T('st.upright.x', { shifter: !!m.gear.shifter }) });
    } else {
      s.push({ n: 1, title: T('st.base.t'), text: T(alu ? 'st.base.alu' : 'st.base.wood') });
      if (design.lay.seated) s.push({ n: 2, title: T('st.seat.t'), text: T('st.seat.x', { riser: design.parts.riser > 0 ? len(design.parts.riser, u) : '', hip: len(design.lay.H[1], u) }) });
      const pd = design.members.filter(x => x.step === 3 && x.kind === 'post'), blocks = pd.filter(x => x.spacer).length;
      const on = !pd.length ? 'rails' : blocks === pd.length ? 'blocks' : blocks ? 'mixed' : 'posts';
      s.push({ n: 3, title: T('st.pedal.t'), text: T('st.pedal.x', { deck: m.rig.deck, on, heel: len(60, u) }) });
      s.push({ n: 4, title: T('st.deck.t'), text: T(alu ? 'st.deck.alu' : 'st.deck.wood') });
      if (m.gear.shifter || m.gear.handbrake) s.push({ n: 5, title: T(m.gear.shifter && m.gear.handbrake ? 'st.sh.both' : m.gear.shifter ? 'st.sh.shifter' : 'st.sh.handbrake'), text: T('st.sh.x') });
    }
    if (m.screen.stand) s.push({ n: 6, title: T('st.stand.t'), text: T('st.stand.x', { y: len(design.parts.screen.y, u), d: len(design.parts.screen.x - design.posture.E[0], u) }) });
    s.push({ n: 7, title: T('st.fit.t'), text: T('st.fit.x') });
    return s;
  }

  // ---------- The share code: the whole design after the # sign, never sent anywhere ----------
  // Only what differs from the starting design (fresh) is written, so links stay short. The starting designs are part
  // of format v1: changing fresh() or sizeFor means a new version number here.
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
    if (o && typeof o === 'object') { const r = {}; for (const [k, val] of Object.entries(o)) r[k] = round(val); return r; }
    return typeof o === 'number' ? Math.round(o * 100) / 100 : o;
  }
  function encode(m) {
    const n = round(normalize(m));
    const d = diff(n, round(fresh(n.build, n.units, n.style))) || {};
    const json = JSON.stringify(Object.assign({ v: 1, build: n.build, units: n.units, style: n.style }, d));
    const b64 = typeof Buffer !== 'undefined' ? Buffer.from(json, 'utf8').toString('base64') : btoa(unescape(encodeURIComponent(json)));
    return b64.replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
  }
  function decode(code) {
    try {
      if (!/^[A-Za-z0-9_-]{8,8000}$/.test(String(code))) return null;
      const b64 = String(code).replace(/-/g, '+').replace(/_/g, '/');
      const json = typeof Buffer !== 'undefined' ? Buffer.from(b64, 'base64').toString('utf8') : decodeURIComponent(escape(atob(b64)));
      const o = JSON.parse(json);
      if (!o || o.v !== 1 || !BUILDS.includes(o.build)) return null;
      return normalize(merge(fresh(o.build, o.units, o.style), o));
    } catch (e) { return null; }
  }

  // the tables of the page's market, with their words in its language (the page's selects and the guides use them)
  const lumberOptions = units => lumberList(units).map(sayLumber);
  // the lengths on offer for the frame: those its section is sold in when the listing says (lumber id given)
  const stockOptions = (units, lumber) => (lumber ? lengthsOf(lumber, units) : stockMm(units)).map(mm => ({ mm, label: stockLabel(mm, units) }));
  const sheetOptions = units => sheetList(units).map(saySheet);
  const setLang = l => I.setLang(l);
  const getLang = () => I.getLang();
  return { BUILDS, BUILD_NAME, BUILD_SHORT, STYLES, STYLE_NAME, SEAT_TYPES, SCREENS, ASPECTS, IN, FT,
    fresh, sample, sizeFor, normalize, body, posture, legs, rimHalf, layout, build, plateSpec, dxf, dxfText, ffd, cutList, aluBom, sheetLayout, shopping, checks, evaluate, steps: STEPS,
    screenDims, fov, rimClearance, legTop, legroom, deckLine, clearanceOver, frameDims, lumberOf, sheetOf, profileOf, encode, decode, round, unit, fracIn, fmtIn, fmtFtIn, fmtMm, len, both, height, stockLabel, toInput, fromInput, D,
    swapLumber, swapSheet, lengthsOf, lumberOptions, stockOptions, sheetOptions, market: MK, source: SRC, t: T, I, setLang, getLang };
});
