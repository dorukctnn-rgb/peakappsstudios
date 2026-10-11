/* Dropped Kerb Check: the engine. Takes one frontage (the council, the measurements, the street and the planning
 * answers) and returns every rule with pass, fail or check, the figure that was compared, the limit and the citation,
 * plus the planning answer, a cost estimate from the council's published fees, and the plan geometry the 3D scene and
 * the PDF drawings use. Pure functions, no DOM: window.DKEngine in the browser, module.exports in Node (unit tests).
 * Rules come from national.js (England) and authorities/<slug>.js (each council), the list from authorities/index.js.
 *
 * Plan geometry (metres): x runs along the kerb, 0 at the centre of the proposed crossing; y runs from the kerb face
 * (0) across the verge and footway to the property boundary (yB) and on to the front of the house.
 * Verdicts are conservative: an unknown answer, or a point the council judges on site, never produces a pass.
 * A council's "will be refused" is a fail; its "may be refused" or "is assessed" is a check. Status "info" is a fact
 * that applies whatever you enter (listed, not scored). Nothing here is an approval: the council decides on site. */
(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory(require('./national.js'), require('./authorities/index.js'));
  else root.DKEngine = factory(root.DKNational, root.DKIndex);
})(typeof self !== 'undefined' ? self : this, function (NAT, IDX) {
  'use strict';

  const KERB = 0.914;            // one kerb unit, 3 ft, the length councils count in
  const CAR = { length: 4.5, width: 1.85 };   // a family car, for the drawing only; the councils' own depths decide
  const num = v => (v === '' || v == null || !Number.isFinite(Number(v)) ? null : Number(v));
  const r2 = x => (x == null ? null : Math.round(x * 100) / 100);
  function fmt(x, dp) {
    if (x == null || !Number.isFinite(x)) return '';
    const v = Math.round(x * 100) / 100;
    return dp != null ? v.toFixed(dp) : String(v);
  }
  const m = x => (x == null ? 'not given' : `${fmt(x)} m`);
  const money = x => (x == null ? '' : `£${Number.isInteger(x) ? x.toLocaleString('en-GB') : x.toFixed(2)}`);
  const yes = v => v === 'yes';
  const no = v => v === 'no';
  const unsure = v => !yes(v) && !no(v);
  const plural = (n, one, many) => `${n} ${n === 1 ? one : many}`;
  const ratio = g => (g > 0 ? `1 in ${1 / g >= 10 ? Math.round(1 / g) : fmt(1 / g, 1).replace(/\.0$/, '')}` : 'level');

  // ---------- The frontage, as the form holds it ----------
  const SCREEN_KEYS = ['conservation', 'listed', 'article4', 'condition', 'changeOfUse'];
  const QUESTIONS = {
    conservation: { q: 'Is the house in a conservation area?', name: 'a conservation area' },
    listed: { q: 'Is it a listed building?', name: 'a listed building' },
    article4: { q: 'Has the council made an Article 4 direction for front gardens or walls here?', name: 'an Article 4 direction' },
    condition: { q: 'Does a condition on the planning permission for the house remove permitted development rights?', help: 'Check the permission the house was built under, especially newer homes.', name: 'a condition removing permitted development rights' },
    changeOfUse: { q: 'Was the house created from another use under permitted development, or built under Part 20?', name: 'a house created by a change of use' },
  };
  const BASE = {
    v: 1, a: 'kent', sample: true,
    depth: 5.6, width: 4.6, mode: 'perp', spaces: 1, door: 'no', gates: 'none', existing: 'no', frontage: 7.5, home: 'house', owner: 'owner', turn: '',
    footway: 2.0, verge: 0, level: 0.12, steep: 'no',
    surface: 'permeable', area: 24, drain: 'garden', soft: 0.4, loose: 'no',
    junction: 26, road: 'unclassified', speed: 30, wall: 0.5,
    tree: 'yes', treeDist: 6.5, treeCirc: 0.9, lamp: 'yes', lampDist: 3.2, furn: 'none', furnDist: '', bus: 'none', busDist: '',
    crossing: 'none', bay: 'none', calming: 'no',
    screen: { conservation: 'no', listed: 'no', article4: 'no', condition: 'no', changeOfUse: 'no' },
    newWall: 'no', newWallH: '', structural: 'no',
  };
  const clone = o => JSON.parse(JSON.stringify(o));
  function authOf(slug, auths) { return (auths && auths[slug]) || null; }
  // The sample house for a council: the base frontage with the council's own sample sizes, so each council's rules show.
  function sample(slug, auths) {
    const s = clone(BASE);
    const a = authOf(slug, auths);
    s.a = IDX.BY_SLUG[slug] ? slug : 'kent';
    const o = a && a.sample;
    if (o) {
      for (const k of ['depth', 'width', 'footway', 'verge', 'junction', 'wall', 'soft']) if (o[k] != null) s[k] = o[k];
      if (o.tree === null) { s.tree = 'none'; s.treeDist = ''; s.treeCirc = ''; }
      else if (o.tree) { s.tree = 'yes'; s.treeDist = o.tree.dist; s.treeCirc = o.tree.circ; }
      if (o.lamp != null) { s.lamp = 'yes'; s.lampDist = o.lamp; }
    }
    return s;
  }
  // Another council, or the visitor's own frontage: keep what they typed; without "from", the sample's sizes with
  // every question unanswered, so nothing passes until it is answered.
  function fresh(slug, from) {
    const s = from ? clone(from) : clone(BASE);
    s.a = slug; s.sample = false;
    if (!from) { s.screen = { conservation: '', listed: '', article4: '', condition: '', changeOfUse: '' }; s.drain = ''; s.road = ''; s.owner = ''; s.home = ''; }
    return s;
  }

  // ---------- Geometry: the crossing a council would build, and where everything sits ----------
  function crossingOf(a) {
    const c = (a && a.rules && a.rules.crossing) || {};
    let length = c.length || (c.kerbs ? (c.kerbs + (c.tapers || 2)) * KERB : 4.5);
    const tapers = c.tapers || 2;
    const taper = c.length ? Math.min(0.914, length * 0.2) : KERB * (tapers / 2);
    return { length: r2(length), taper: r2(taper), flat: r2(length - 2 * taper), double: c.double || null, rearMin: c.rearMin || c.rear || null, maxRear: c.maxRear || c.maxFlat || null, stated: !!(c.length || c.kerbs) };
  }
  function plan(model, a) {
    const verge = Math.max(0, num(model.verge) || 0), footway = Math.max(0.6, num(model.footway) || 1.8);
    const yB = verge + footway;
    const depth = Math.max(0.5, num(model.depth) || 4.8), width = Math.max(1.5, num(model.width) || 2.4);
    const X = crossingOf(a);
    const opening = X.maxRear && Number(model.spaces) !== 2 ? Math.min(width, Math.max(X.maxRear, 2.4)) : width;
    const frontage = Math.max(width + 1.2, num(model.frontage) || 0, 6.2);
    const parallel = model.mode === 'parallel';
    const two = Number(model.spaces) === 2 && !parallel;
    const len = parallel ? Math.max(X.length, Math.min(width, 7.2)) : two ? (X.double || X.length + 3 * KERB) : X.length;
    const cross = { x0: -len / 2, x1: len / 2, flat0: -len / 2 + X.taper, flat1: len / 2 - X.taper, rear0: -opening / 2, rear1: opening / 2, y0: 0, y1: yB };
    const park = { x0: -width / 2, x1: width / 2, y0: yB, y1: yB + depth };
    const plot = { x0: -frontage / 2, x1: frontage / 2, y0: yB, y1: yB + depth };
    const house = { x0: plot.x0 + 0.1, x1: plot.x1 - 0.1, y0: yB + depth, y1: yB + depth + 7.5 };
    const j = num(model.junction);
    const junction = j != null && j < 60 ? { x: cross.x1 + j, radius: 6, width: 7.3 } : null;
    const at = (on, d, side) => (on === 'yes' && num(d) != null ? { x: side < 0 ? cross.x0 - num(d) : cross.x1 + num(d), y: 0 } : null);
    const tree = at(model.tree, model.treeDist, -1);
    if (tree) { tree.y = verge > 0.8 ? verge / 2 : Math.min(0.9, yB / 2); tree.circ = num(model.treeCirc); }
    const lamp = at(model.lamp, model.lampDist, 1); if (lamp) lamp.y = Math.min(0.5, yB / 3);
    const furn = at(model.furn, model.furnDist, -1); if (furn) furn.y = yB - 0.45;
    const bus = at(model.bus, model.busDist, 1); if (bus) bus.y = 0.45;
    return { verge, footway, yB, depth, width, gap: width, frontage, opening: r2(opening), crossing: X, cross, park, plot, house, junction, tree, lamp, furn, bus, parallel, car: CAR };
  }

  // ---------- Results ----------
  function makeCtx(model, a) {
    const out = [];
    const src = key => (a && a.sources && a.sources[key]) || NAT.SOURCES[key] || null;
    const add = (id, topic, status, o) => {
      const s = src(o.source);
      out.push(Object.assign({ id, topic, status, group: 'council', value: '', limit: '', note: '', ref: '', rule: '', sourceLabel: s ? s.short : '', url: s ? s.url : '', checked: s ? s.checked : NAT.CHECKED }, o));
    };
    const nat = (id, status, o) => {
      const r = NAT.BY_ID[id];
      const s = NAT.SOURCES[r.source];
      out.push(Object.assign({ id, topic: id, status, group: r.group, rule: r.text, ref: r.ref, source: r.source, sourceLabel: s.short, url: s.url, checked: r.checked, value: '', limit: '', note: '' }, o || {}));
    };
    return { out, add, nat };
  }
  const RANGE = (IDX && IDX.RANGE) || {};
  // How a topic reads when the council publishes no figure: what the councils we checked use, and a site check.
  function noFigure(topic, extra) {
    const r = RANGE[topic];
    return `${extra ? extra + ' ' : ''}No figure published by this council${r ? `; the councils checked here use ${r}` : ''}. The inspector decides on site.`;
  }

  function councilRules(model, a, P, ctx) {
    const R = a.rules || {};
    const id = t => `${a.slug}.${t}`;
    const short = a.short;
    const depth = num(model.depth), width = num(model.width);
    const parallel = model.mode === 'parallel';
    const door = yes(model.door);
    const classified = model.road === 'classified' || model.road === 'tlrn';
    const roadUnknown = !model.road;

    // depth
    if (R.depth) {
      const d = R.depth;
      let need = parallel ? (door && d.parallelDoor ? d.parallelDoor : d.parallel) : (door && d.door ? d.door : d.perp);
      let why = parallel ? (door && d.parallelDoor ? 'parallel, beside a door or garage' : 'parallel parking') : (door && d.door ? 'in front of a door or garage' : 'parking at right angles');
      if (!parallel && classified && d.classified) { need = Math.max(need, d.classified); why = 'on a classified street'; }
      if (model.gates !== 'none' && d.gates) { need = Math.max(need || 0, d.gates); why += ', with gates'; }
      let st, note = '';
      if (need == null) {
        st = 'check'; note = `${short} publishes no depth for ${why}; ask before applying.`;
        if (parallel && d.parallelOnly === 'nofootway') note = `${short} allows parallel parking only where there is no footway and no on-street parking.`;
      } else if (depth == null) st = 'check';
      else if (depth >= need - 1e-6) st = 'pass';
      else if (!parallel && d.relaxed && depth >= d.relaxed - 1e-6 && width != null && width >= d.relaxedWidth - 1e-6) { st = 'pass'; note = `Relaxed to ${m(d.relaxed)} because the space is at least ${m(d.relaxedWidth)} wide.`; }
      else st = 'fail';
      if (st === 'fail' && depth != null && depth < CAR.length) note = joinNotes(note, `A ${fmt(CAR.length)} m car would overhang the pavement by ${m(r2(CAR.length - depth))}.`);
      ctx.add(id('depth'), 'depth', st, { rule: d.text || `The parking space must be at least ${m(need)} deep.`, value: `${m(depth)} deep`, limit: need != null ? `${m(need)} (${why})` : 'not published', note, ref: d.ref, source: d.source });
    } else ctx.add(id('depth'), 'depth', 'check', { rule: 'The parking space must be deep enough that no part of the car overhangs the pavement.', value: `${m(depth)} deep`, limit: 'not published', note: noFigure('depth'), ref: '', source: a.process.source });

    // width
    if (R.width) {
      const w = R.width;
      const two = Number(model.spaces) === 2 && !parallel;
      let need = parallel ? w.parallel : w.perp, why = parallel ? 'parallel parking' : 'one car at right angles';
      if (!parallel && classified && w.classified) { need = Math.max(need, w.classified); why = 'on a classified street'; }
      const X = crossingOf(a);
      if (!parallel && X.rearMin && X.rearMin > (need || 0)) { need = X.rearMin; why = 'the narrowest crossing it builds'; }
      let unpublished = false;
      if (two) { if (w.two) { need = w.two; why = 'two cars side by side'; } else if (need != null) { need = 2 * need; why = 'two cars: twice the single width, as no figure for two is published'; unpublished = true; } }
      let st = need == null ? 'check' : width == null ? 'check' : width >= need - 1e-6 ? 'pass' : 'fail';
      if (unpublished && st === 'pass') st = 'check';
      ctx.add(id('width'), 'width', st, { rule: w.text || `The parking space must be at least ${m(need)} wide.`, value: `${m(width)} wide`, limit: need != null ? `${m(need)} (${why})` : 'not published', note: need == null ? `${short} publishes no width for ${why}.` : '', ref: w.ref, source: w.source });
    } else {
      const ok = width != null && RANGE.widthMax && width >= RANGE.widthMax - 1e-6 && Number(model.spaces) !== 2 && !parallel;
      ctx.add(id('width'), 'width', ok ? 'pass' : 'check', { rule: 'The parking space must be wide enough for a car and its doors, without the car or the crossing passing your boundary.', value: `${m(width)} wide`, limit: 'not published', note: ok ? `At least the ${m(RANGE.widthMax)} the widest rule among the councils checked here asks for.` : noFigure('width'), ref: '', source: a.process.source });
    }

    // the crossing it builds (information)
    if (R.crossing) ctx.add(id('crossing'), 'crossing', 'info', { rule: R.crossing.text, value: `Drawn at ${m(P.crossing.length)} along the kerb`, limit: '', note: parallel && R.crossing.parallelKerbs ? `Parallel parking: at least ${R.crossing.parallelKerbs} dropped kerbs.` : '', ref: R.crossing.ref, source: R.crossing.source });

    // junction
    const j = num(model.junction);
    if (R.junction && R.junction.min) {
      const J = R.junction;
      const big = classified ? (J.classified || J.major || J.min) : J.min;
      let st, note = '', limit = `${m(big)}${J.classified && classified ? ' on a classified road' : ''}`;
      if (j == null) st = 'check';
      else if (J.absolute && j < J.absolute - 1e-6) st = 'fail';
      else if (j < big - 1e-6) st = J.strict && !J.absolute ? 'fail' : 'check';
      else if (J.major && j < J.major - 1e-6) { st = 'check'; note = `${short} can ask for ${m(J.major)} on a main road or at a busy junction.`; limit += `, ${m(J.major)} on main roads`; }
      else if (J.mainRoad && classified && j < J.mainRoad[1] - 1e-6) { st = 'check'; note = `Near a main road junction ${short} looks at ${J.mainRoad[0]} to ${J.mainRoad[1]} m.`; }
      else st = 'pass';
      if (J.absolute && j != null && j >= J.absolute && j < J.min) note = joinNotes(note, `${m(J.absolute)} is the safety minimum; ${m(J.min)} is the rule.`);
      if (roadUnknown && J.classified && st === 'pass' && j < J.classified - 1e-6) { st = 'check'; note = joinNotes(note, `If the road is classified the distance is ${m(J.classified)}.`); }
      ctx.add(id('junction'), 'junction', st, { rule: J.text || `At least ${m(J.min)} from a junction.`, value: j == null ? 'not given' : `${m(j)} from the nearest junction`, limit, note, ref: J.ref, source: J.source });
    } else {
      const ok = j != null && RANGE.junctionMax && j >= RANGE.junctionMax - 1e-6;
      ctx.add(id('junction'), 'junction', ok ? 'pass' : 'check', { rule: (R.junction && R.junction.text) || 'Not too close to a junction, roundabout or traffic signals.', value: j == null ? 'not given' : `${m(j)} from the nearest junction`, limit: 'not published', note: ok ? `Further than the ${m(RANGE.junctionMax)} the strictest council checked here asks for on main roads.` : noFigure('junction'), ref: R.junction ? R.junction.ref : '', source: R.junction ? R.junction.source : a.process.source });
    }

    // pedestrian visibility splay: walls, hedges and fences beside the opening
    const wall = num(model.wall);
    if (R.pedSplay) {
      const S = R.pedSplay;
      let st, note = '', limit = `nothing above ${m(S.h)}`;
      const inside = S.kind === 'centre' ? P.gap / 2 < S.half - 1e-6 : true;
      if (S.kind === 'edge') limit += ` in a ${fmt(S.along)} m by ${fmt(S.into)} m triangle each side of the opening`;
      if (S.kind === 'centre') limit += ` in a triangle ${fmt(S.half)} m each side of the centre of the access and ${fmt(S.into)} m into the drive`;
      if (S.kind === 'unsized') limit += '; the area is set on site';
      if (wall == null) st = 'check';
      else if (wall <= S.h + 1e-6) st = 'pass';
      else if (!inside) { st = 'pass'; note = `The opening in the wall is ${m(P.gap)} wide, so the triangle stays inside it and the ${m(wall)} wall is outside it.`; }
      else { st = S.strict ? 'fail' : 'check'; note = `Lower the wall, fence or hedge to ${m(S.h)} within the splay, or the council may refuse.`; }
      ctx.add(id('splay'), 'splay', st, { rule: S.text || `Pedestrian visibility: nothing above ${m(S.h)} beside the opening.`, value: wall == null ? 'not given' : wall === 0 ? 'No wall, fence or hedge' : `${m(wall)} high beside the opening`, limit, note, ref: S.ref, source: S.source });
    } else {
      const ok = wall != null && RANGE.splayH && wall <= RANGE.splayH + 1e-6;
      ctx.add(id('splay'), 'splay', ok ? 'pass' : 'check', { rule: 'You must be able to see people on the pavement as you drive out.', value: wall == null ? 'not given' : wall === 0 ? 'No wall, fence or hedge' : `${m(wall)} high beside the opening`, limit: 'not published', note: ok ? `No higher than the ${m(RANGE.splayH)} the councils checked here allow beside an opening.` : noFigure('splay', wall != null && wall > 0.6 ? 'A wall above 0.6 m beside the opening often has to be lowered.' : ''), ref: '', source: a.process.source });
    }

    // sight lines along the road
    if (R.sight) {
      const S = R.sight;
      const sp = num(model.speed);
      const y = S.y && sp != null ? (classified && S.yMajor && S.yMajor[sp] ? S.yMajor[sp] : S.y[sp]) : null;
      let note = '';
      if (S.setback && wall != null && wall > 0.6 && S.setback > P.yB + 1e-6) {
        const off = y ? y * (S.setback - P.yB) / S.setback : null;
        note = `The driver’s eye point is ${m(S.setback)} back from the kerb, inside your boundary, so a ${m(wall)} wall can block the line along the road${off ? ` (the ${y} m line crosses your boundary ${m(r2(off))} from the centre)` : ''}.`;
        if (S.setbackMin && S.setbackMin <= P.yB + 1e-6) note += ` ${short} may accept ${m(S.setbackMin)} for a single home, which your ${m(P.yB)} of pavement and verge already gives.`;
      }
      ctx.add(id('sight'), 'sight', 'check', { rule: S.text || 'You must be able to see along the road.', value: sp != null ? `${sp} mph road` : 'speed limit not given', limit: y ? `${y} m each way at ${sp} mph` : S.kind === 'clear2' ? `${fmt(S.along)} m clear each side` : 'judged on site', note: joinNotes(note, 'Parked cars, bends and neighbours’ walls are judged on site.'), ref: S.ref, source: S.source });
    }

    // trees
    const hasTree = model.tree === 'yes', treeUnknown = !model.tree;
    const td = num(model.treeDist), tc = num(model.treeCirc);
    const T = R.tree;
    if (!hasTree && !treeUnknown) ctx.add(id('tree'), 'tree', 'pass', { rule: T ? T.text : 'Street trees are protected; their roots set how close a crossing can go.', value: 'No street tree near the crossing', limit: '', ref: T ? T.ref : '', source: T ? T.source : a.process.source });
    else if (!T) ctx.add(id('tree'), 'tree', 'check', { rule: 'Street trees are protected; their roots set how close a crossing can go.', value: treeUnknown ? 'not answered' : `${m(td)} from the trunk`, limit: 'not published', note: noFigure('tree'), ref: '', source: a.process.source });
    else {
      let need = null, how = '';
      if (T.kind === 'rpa12d' && tc != null) { need = 12 * tc / 3.14; how = `12 × the ${fmt(r2(tc / 3.14))} m trunk diameter`; }
      if (T.kind === 'circ' && tc != null) { need = T.factor * tc; how = `${T.factor} × the ${m(tc)} circumference`; }
      if (T.kind === 'max' && tc != null) { need = Math.max(T.min, T.factor * tc); how = `${T.factor} × ${m(tc)} circumference, at least ${m(T.min)}`; }
      if (T.kind === 'fixed' || T.kind === 'stem') { need = T.min; how = T.kind === 'stem' ? 'never within 2 m of the stem' : 'from the trunk'; }
      // a council with no radius of its own: beyond the widest root protection rule the checked councils use is clear
      const proxy = tc != null ? Math.max(12 * tc / 3.14, 4 * tc, 2.5) : null;
      const ownRadius = !['stem', 'assess', 'canopy', 'mature'].includes(T.kind);
      let st, note = '';
      if (treeUnknown) st = 'check';
      else if (T.within && td != null && td > T.within) st = 'pass';
      else if (td == null) st = 'check';
      else if (!ownRadius) {
        if (T.kind === 'stem' && td <= need + 1e-6) st = 'fail';
        else if (proxy != null && td > proxy + 1e-6) { st = 'pass'; note = `Further than the widest root protection rule the councils checked here use (${m(r2(proxy))} for this trunk).`; }
        else { st = 'check'; note = T.kind === 'stem' ? 'Inside a root protection area a tree officer’s assessment, paid in advance, and hand digging are needed.' : 'The council’s tree officer decides.'; }
      }
      else if (need == null) st = 'check';
      else if (td > need + 1e-6) st = 'pass';
      else st = T.strict ? 'fail' : 'check';
      ctx.add(id('tree'), 'tree', st, { rule: T.text, value: treeUnknown ? 'not answered' : `${m(td)} from the trunk${tc != null ? `, ${m(tc)} round` : ''}`, limit: need != null ? `more than ${m(r2(need))} (${how})` : 'judged on site', note, ref: T.ref, source: T.source, radius: need != null ? r2(need) : null });
    }

    // street lights and other street furniture
    const item = (key, topic, on, dist, label) => {
      const F = R[key];
      const d = num(dist);
      if (on === 'none') return ctx.add(id(topic), topic, 'pass', { rule: F ? (F.text || `${label} must be clear of the crossing.`) : `${label} must be clear of the crossing.`, value: `No ${label.toLowerCase()} near the crossing`, limit: '', ref: F ? F.ref : '', source: F ? F.source : a.process.source });
      if (!on) return ctx.add(id(topic), topic, 'check', { rule: F && F.text ? F.text : `${label} must be clear of the crossing.`, value: 'not answered', limit: F && F.min ? `${m(F.min)} clear` : '', ref: F ? F.ref : '', source: F ? F.source : a.process.source });
      const widest = RANGE[topic + 'Max'];
      if (!F || !F.min) {
        const st = d == null ? 'check' : widest && d >= widest - 1e-6 ? 'pass' : 'check';
        const kind = F ? F.kind : '';
        const nt = kind === 'move' || kind === 'owner' ? 'Anything that has to move is moved by its owner, at your cost, if it can be moved at all.' : kind === 'covers' ? 'Covers can sometimes be lowered in the works; cabinets cannot be moved by the council.' : '';
        return ctx.add(id(topic), topic, st, { rule: (F && F.text) || `${label} must be clear of the crossing.`, value: d == null ? 'distance not given' : `${m(d)} from the end of the dropped kerb`, limit: 'no distance published', note: joinNotes(nt, st === 'pass' ? `Further away than the ${m(widest)} the councils checked here ask for.` : noFigure(topic)), ref: F ? F.ref : '', source: F ? F.source : a.process.source });
      }
      let st;
      if (d == null) st = 'check';
      else if (d >= F.min - 1e-6) st = 'pass';
      else st = F.within === 'fail' ? 'fail' : 'check';
      const note = st === 'pass' ? '' : F.within === 'move' ? `Inside ${m(F.min)} it has to be moved, if the owner agrees, at your cost${F.cost ? ` (typically ${money(F.cost[0])} to ${money(F.cost[1])})` : ''}.` : F.within === 'inspect' ? 'A specialist inspection is needed, and any move is at your cost.' : F.within === 'assess' ? 'The council makes a technical assessment; any move is charged.' : '';
      ctx.add(id(topic), topic, st, { rule: F.text || `${label} at least ${m(F.min)} from the crossing.`, value: d == null ? 'distance not given' : `${m(d)} from the end of the dropped kerb`, limit: `at least ${m(F.min)}`, note, ref: F.ref, source: F.source, radius: F.min });
    };
    item('lamp', 'lamp', model.lamp, model.lampDist, 'Street light');
    item('furniture', 'furniture', model.furn, model.furnDist, 'Other street furniture');

    // bus stops
    {
      const B = R.busStop, d = num(model.busDist);
      if (model.bus === 'none') ctx.add(id('bus'), 'bus', 'pass', { rule: B && B.text ? B.text : 'Buses must still be able to stop safely.', value: 'No bus stop within 10 m', limit: '', ref: B ? B.ref : '', source: B ? B.source : a.process.source });
      else if (B && B.min) ctx.add(id('bus'), 'bus', d == null ? 'check' : d >= B.min - 1e-6 ? 'pass' : 'fail', { rule: B.text || `At least ${m(B.min)} from a bus stop.`, value: d == null ? 'distance not given' : `${m(d)} from the bus stop`, limit: `at least ${m(B.min)}`, ref: B.ref, source: B.source });
      else ctx.add(id('bus'), 'bus', 'check', { rule: (B && B.text) || 'Buses must still be able to stop safely.', value: !model.bus ? 'not answered' : d == null ? 'A bus stop nearby' : `${m(d)} from the bus stop`, limit: B && B.kind === 'nomove' ? 'bus stops are not moved' : 'judged on site', note: B && B.kind === 'paved' ? 'Likely refused if the footway at the stop is block paved.' : '', ref: B ? B.ref : '', source: B ? B.source : a.process.source });
    }

    // pedestrian crossings
    {
      const C = R.pedCrossing, v = model.crossing;
      let st = 'pass', note = '', limit = '';
      if (!v) st = 'check';
      else if (v !== 'none') {
        if (C && C.controlled && (v === 'near' || v === 'zigzag')) { st = 'fail'; limit = `no crossing within ${m(C.controlled)} of the stop line`; }
        else if (C && C.zigzag === 'fail' && v === 'zigzag') st = 'fail';
        else st = 'check';
        if (v === 'tactile') note = 'A tactile crossing point at the site has to be moved, at your cost, if the council agrees.';
      }
      ctx.add(id('pedx'), 'pedx', st, { rule: (C && C.text) || 'A crossing must not interfere with a pedestrian crossing or its zig-zags.', value: { none: 'No pedestrian crossing nearby', tactile: 'A tactile crossing point at the site', near: 'A controlled crossing within 20 m', zigzag: 'Within the zig-zag markings' }[v] || 'not answered', limit, note, ref: C ? C.ref : '', source: C ? C.source : a.process.source });
    }

    // parking bays and laybys
    {
      const Bq = R.bays, v = model.bay;
      let st = 'pass', note = '';
      if (!v) st = 'check';
      else if (v !== 'none') {
        const rule = Bq ? (Bq[v === 'cpz' ? 'cpz' : v === 'disabled' ? 'disabled' : v === 'layby' ? 'layby' : 'marked'] || Bq.marked) : 'check';
        st = rule === 'fail' ? 'fail' : 'check';
        note = 'Changing a bay needs a traffic order, which takes months, costs you and can fail at consultation.';
      }
      ctx.add(id('bays'), 'bays', st, { rule: (Bq && Bq.text) || 'Marked bays, disabled bays and laybys at the site usually block a crossing.', value: { none: 'No marked bay, layby or disabled bay at the site', marked: 'A marked parking bay at the site', cpz: 'A permit bay in a controlled parking zone', disabled: 'A disabled bay at the site', layby: 'A layby at the site' }[v] || 'not answered', limit: '', note, ref: Bq ? Bq.ref : '', source: Bq ? Bq.source : a.process.source });
    }

    // traffic calming
    if (yes(model.calming) || R.calming) {
      const Cq = R.calming;
      const st = !yes(model.calming) ? (no(model.calming) ? 'pass' : 'check') : Cq && Cq.effect === 'fail' ? 'fail' : 'check';
      ctx.add(id('calming'), 'calming', st, { rule: (Cq && Cq.text) || 'Traffic calming at the site may have to change, if the council allows it.', value: yes(model.calming) ? 'Traffic calming at the site' : no(model.calming) ? 'No traffic calming at the site' : 'not answered', limit: '', ref: Cq ? Cq.ref : '', source: Cq ? Cq.source : a.process.source });
    }

    // grass verge
    {
      const V = R.verge, v = num(model.verge);
      if (v == null || v === 0) ctx.add(id('verge'), 'verge', v == null ? 'check' : 'pass', { rule: (V && V.text) || 'Crossings over grass verges cost more, and wide verges are often refused.', value: v == null ? 'not given' : 'No grass verge', limit: V && V.max ? `less than ${m(V.max)}` : '', ref: V ? V.ref : '', source: V ? V.source : a.process.source });
      else if (V && V.max) ctx.add(id('verge'), 'verge', v < V.max - 1e-6 ? 'pass' : 'fail', { rule: V.text, value: `${m(v)} of verge`, limit: `less than ${m(V.max)}`, ref: V.ref, source: V.source });
      else ctx.add(id('verge'), 'verge', 'check', { rule: (V && V.text) || 'Crossings over grass verges cost more, and wide verges are often refused.', value: `${m(v)} of verge`, limit: 'judged on site', note: V ? '' : noFigure('verge'), ref: V ? V.ref : '', source: V ? V.source : a.process.source });
    }

    // gradient: the driveway from the input; a council's limit on the crossing itself is measured on site
    {
      const G = R.gradient;
      const lv = num(model.level), g = lv != null && depth ? Math.abs(lv) / depth : null;
      if (G && G.scope === 'driveway') {
        const st = g == null ? 'check' : g <= G.max + 1e-9 ? 'pass' : G.strict === false ? 'check' : 'fail';
        ctx.add(id('gradient'), 'gradient', st, { rule: G.text, value: g == null ? 'level difference not given' : `${ratio(g)} (${m(lv)} over ${m(depth)})`, limit: `no steeper than ${ratio(G.max)}`, ref: G.ref, source: G.source });
      } else {
        const flattest = RANGE.gradientMin || 0.05;
        const st = !G && g != null && g <= flattest + 1e-9 && !yes(model.steep) ? 'pass' : 'check';
        const note = G ? `The slope of the crossing itself is set out and measured on site${yes(model.steep) ? '; you said the pavement is steep' : ''}.` : st === 'pass' ? `Flatter than every limit the councils checked here use (${RANGE.gradient}).` : noFigure('gradient');
        ctx.add(id('gradient'), 'gradient', st, { rule: G ? G.text : 'A steep crossing or drive can ground a car and is often refused.', value: g == null ? 'level difference not given' : `Drive ${ratio(g)} (${m(lv)} over ${m(depth)})`, limit: G ? `no steeper than ${ratio(G.max)} across the crossing` : 'not published', note, ref: G ? G.ref : '', source: G ? G.source : a.process.source });
      }
    }

    // a second crossing
    {
      const S2 = R.second, ex = model.existing;
      if (no(ex)) ctx.add(id('second'), 'second', 'pass', { rule: S2 ? S2.text : 'A second crossing at one property is rarely allowed.', value: 'No dropped kerb at the property yet', limit: '', ref: S2 ? S2.ref : '', source: S2 ? S2.source : a.process.source });
      else if (!ex) ctx.add(id('second'), 'second', 'check', { rule: S2 ? S2.text : 'A second crossing at one property is rarely allowed.', value: 'not answered', limit: '', ref: S2 ? S2.ref : '', source: S2 ? S2.source : a.process.source });
      else {
        const fr = num(model.frontage);
        let st = 'check', limit = 'judged on site';
        if (S2 && S2.kind === 'never') { st = 'fail'; limit = 'one access per property'; }
        else if (S2 && S2.kind === 'frontage') { st = fr == null ? 'check' : fr >= S2.frontage - 1e-6 && (!S2.depth || depth >= S2.depth - 1e-6) ? 'check' : 'fail'; limit = `a frontage of at least ${m(S2.frontage)}`; }
        else if (S2 && S2.kind === 'gap' && S2.unclassifiedOnly && classified) { st = 'fail'; limit = 'unclassified roads only'; }
        ctx.add(id('second'), 'second', st, { rule: S2 ? S2.text : 'A second crossing at one property is rarely allowed.', value: `A second dropped kerb${fr != null ? ` on a ${m(fr)} frontage` : ''}`, limit, note: st === 'check' ? 'Even where the rule allows it, the council weighs on-street parking and safety.' : '', ref: S2 ? S2.ref : '', source: S2 ? S2.source : a.process.source });
      }
    }

    // fast roads and turning space
    {
      const sp = num(model.speed);
      const SP = R.speed, CT = R.classifiedTurn, BT = R.busyTurn;
      if (SP && sp != null && sp >= SP.min) {
        if (SP.effect === 'refuse') ctx.add(id('speed'), 'speed', 'fail', { rule: SP.text, value: `${sp} mph limit`, limit: `under ${SP.min} mph`, ref: SP.ref, source: SP.source });
        else ctx.add(id('speed'), 'speed', yes(model.turn) ? 'pass' : no(model.turn) ? 'fail' : 'check', { rule: SP.text, value: `${sp} mph limit; ${yes(model.turn) ? 'room to turn inside' : no(model.turn) ? 'no room to turn inside' : 'turning space not answered'}`, limit: 'turn round inside the property', ref: SP.ref, source: SP.source });
      } else if (SP && sp == null) ctx.add(id('speed'), 'speed', 'check', { rule: SP.text, value: 'speed limit not given', limit: `under ${SP.min} mph`, ref: SP.ref, source: SP.source });
      if (CT && (classified || roadUnknown)) ctx.add(id('turn'), 'turn', classified ? (yes(model.turn) ? 'pass' : no(model.turn) ? 'fail' : 'check') : 'check', { rule: CT.text, value: classified ? (yes(model.turn) ? 'Room to turn inside the property' : no(model.turn) ? 'No room to turn inside the property' : 'turning space not answered') : 'road class not given', limit: 'forward gear in and out', ref: CT.ref, source: CT.source });
      if (BT && (classified || (sp != null && sp >= 40))) ctx.add(id('busy'), 'turn', yes(model.turn) ? 'pass' : 'check', { rule: BT.text, value: yes(model.turn) ? 'Room to turn inside the property' : 'Busy road, turning space not confirmed', limit: '', ref: BT.ref, source: BT.source });
    }

    // in front of the door
    if (R.door) {
      const D = R.door;
      if (D.kind === 'refuse') ctx.add(id('door'), 'door', yes(model.door) ? 'fail' : no(model.door) ? 'pass' : 'check', { rule: D.text, value: yes(model.door) ? 'The car parks in front of the main door' : no(model.door) ? 'The car parks clear of the main door' : 'not answered', limit: 'not in front of the main door', ref: D.ref, source: D.source });
      if (D.kind === 'escape') ctx.add(id('door'), 'door', yes(model.door) ? 'check' : no(model.door) ? 'pass' : 'check', { rule: D.text, value: yes(model.door) ? 'The car parks in front of a door' : no(model.door) ? 'The car parks clear of the doors' : 'not answered', limit: 'a safe way out of the house', ref: D.ref, source: D.source });
    }

    // soft landscaping share
    if (R.soft) {
      const s = num(model.soft);
      ctx.add(id('soft'), 'soft', s == null ? 'check' : s >= R.soft.min - 1e-6 ? 'pass' : 'fail', { rule: R.soft.text, value: s == null ? 'not given' : `${Math.round(s * 100)}% planted`, limit: `at least ${Math.round(R.soft.min * 100)}%`, ref: R.soft.ref, source: R.soft.source });
    }

    // straight in, one movement
    if (R.straightIn) ctx.add(id('straight'), 'straight', model.mode === 'parallel' ? 'fail' : 'pass', { rule: R.straightIn.text, value: model.mode === 'parallel' ? 'Parallel parking' : 'Straight in at right angles', limit: '', ref: R.straightIn.ref, source: R.straightIn.source });

    // gates
    {
      const G = R.gates;
      const st = model.gates === 'outward' ? 'fail' : model.gates ? 'pass' : 'check';
      ctx.add(id('gates'), 'gates', st, { rule: G ? G.text : NAT.BY_ID['nat.gates'].text, value: { none: 'No gates', inward: 'Gates opening inwards', outward: 'Gates opening outwards' }[model.gates] || 'not answered', limit: 'must not open outwards', ref: G ? G.ref : NAT.BY_ID['nat.gates'].ref, source: G ? G.source : 'ha153' });
    }

    // surface and drainage
    {
      const Dr = R.drainage, P2 = R.surfacePermeable, L = R.loose;
      const area = num(model.area);
      const permeable = model.surface === 'permeable' || model.surface === 'porous' || model.surface === 'gravel' || model.surface === 'grid';
      const dst = model.drain === 'road' ? 'fail' : model.drain === 'garden' || model.drain === 'channel' || permeable ? 'pass' : 'check';
      ctx.add(id('drain'), 'drain', dst, { rule: Dr ? Dr.text : NAT.BY_ID['nat.water'].text, value: { garden: 'Drains to the garden or a soakaway', channel: 'A drainage channel at the boundary', road: 'Runs on to the pavement or road' }[model.drain] || (permeable ? 'A permeable surface' : 'not answered'), limit: 'no water on to the highway', ref: Dr ? Dr.ref : NAT.BY_ID['nat.water'].ref, source: Dr ? Dr.source : 'ha163' });
      if (P2) {
        const need = area == null ? true : area > P2.minArea + 1e-6;
        const st = !model.surface || model.surface === 'undecided' ? 'check' : permeable || !need ? 'pass' : 'fail';
        ctx.add(id('surface'), 'surface', st, { rule: P2.text, value: SURFACE[model.surface] || 'not decided', limit: P2.minArea ? `permeable over ${P2.minArea} m²` : 'permeable', ref: P2.ref, source: P2.source });
      }
      if (L && model.surface === 'gravel') {
        const st = L.kind === 'banned' ? 'fail' : 'check';
        const note = L.kind === 'strip' ? `Add a ${m(L.strip)} strip of solid surfacing at the footway.` : L.kind === 'size' ? `Gravel of at least ${Math.round(L.min * 1000)} mm, with a ${m(L.border)} border at the threshold.` : 'Keep the gravel back from the footway with edging or a paved strip.';
        ctx.add(id('loose'), 'loose', st, { rule: L.text || 'Loose gravel must not reach the highway.', value: 'Loose gravel', limit: L.kind === 'banned' ? 'not permitted' : 'held back', note, ref: L.ref, source: L.source });
      }
    }

    // permissions and the evidence the council asks for
    if (R.ownership) ctx.add(id('owner'), 'owner', model.owner === 'owner' ? 'pass' : model.owner === 'tenant' ? 'check' : 'check', { rule: R.ownership.text, value: { owner: 'You own the freehold', tenant: 'You rent or hold a lease' }[model.owner] || 'not answered', limit: '', note: model.owner === 'tenant' ? 'Get the written consent before you pay the fee.' : '', ref: R.ownership.ref, source: R.ownership.source });
    if (a.process.evidence) ctx.add(id('evidence'), 'evidence', 'info', { rule: a.process.evidence, value: '', limit: '', ref: '', source: a.process.source });
  }

  const SURFACE = { permeable: 'Permeable block paving', porous: 'Porous asphalt or concrete', gravel: 'Loose gravel', grid: 'Grass or gravel grid', block: 'Ordinary block paving', concrete: 'Concrete', tarmac: 'Ordinary tarmac', undecided: 'Not decided' };
  const PERMEABLE = new Set(['permeable', 'porous', 'gravel', 'grid']);
  function joinNotes(...n) { return n.filter(Boolean).join(' '); }

  // ---------- The planning question, kept apart from the council's highway consent ----------
  function planningRules(model, a, ctx) {
    const s = model.screen || {};
    const flat = model.home === 'flat';
    const area = num(model.area);
    const permeable = PERMEABLE.has(model.surface) || model.drain === 'garden';
    const council = (a && a.planning) || [];
    const says = when => council.filter(p => p.when === when || p.when === 'list');
    // access (Class B)
    {
      const road = model.road;
      const st = road === 'unclassified' ? (flat ? 'fail' : 'pass') : road === 'classified' || road === 'tlrn' ? 'fail' : 'check';
      const value = { unclassified: 'An unclassified road', classified: 'An A, B or C (classified) road', tlrn: 'A Transport for London red route' }[road] || 'Road class not given';
      ctx.nat('pl.access', st, { value, limit: 'not a trunk or classified road', note: joinNotes(road === 'tlrn' ? NAT.BY_ID['nat.tlrn'].text : '', flat && road === 'unclassified' ? 'For a flat the access is not covered, because no other class permits its hard standing.' : '', !road ? 'Check the council’s list of classified roads.' : '') });
    }
    // dwelling type
    ctx.nat('pl.house', flat ? 'fail' : model.home === 'house' ? 'pass' : 'check', { value: flat ? 'A flat or maisonette' : model.home === 'house' ? 'A house' : 'not answered' });
    // surface (Class F)
    {
      let st, value;
      const decided = model.surface && model.surface !== 'undecided';
      if (flat) { st = 'fail'; value = 'A flat has no Class F rights'; }
      else if (area != null && area <= NAT.LIMITS.surfaceArea + 1e-6) { st = 'pass'; value = `${fmt(area)} m², within 5 m²`; }
      else if (!decided && model.drain !== 'garden') { st = 'check'; value = `${area != null ? fmt(area) + ' m², ' : ''}surface not decided`; }
      else if (permeable) { st = 'pass'; value = `${area != null ? fmt(area) + ' m², ' : ''}${PERMEABLE.has(model.surface) ? SURFACE[model.surface].toLowerCase() : 'draining to the garden'}`; }
      else { st = 'fail'; value = `${area != null ? fmt(area) + ' m² of ' : ''}${(SURFACE[model.surface] || 'hard surface').toLowerCase()}, draining ${model.drain === 'channel' ? 'to a channel' : 'to the road'}`; }
      ctx.nat('pl.surface', st, { value, limit: 'over 5 m²: porous, or drained to a porous area', note: st === 'fail' && !flat ? 'Switch to a permeable surface, or drain it to the lawn or a soakaway, to stay within Class F.' : '' });
    }
    if (yes(s.changeOfUse)) ctx.nat('pl.changeofuse', 'fail', { value: 'Created by a change of use or built under Part 20' });
    else if (unsure(s.changeOfUse)) ctx.nat('pl.changeofuse', 'check', { value: 'not answered' });
    ctx.nat('pl.article4', yes(s.article4) ? 'fail' : no(s.article4) ? 'pass' : 'check', { value: yes(s.article4) ? 'An Article 4 direction applies' : no(s.article4) ? 'No Article 4 direction' : 'not answered', note: yes(s.article4) ? 'Read the direction: if it covers hard surfaces, accesses or front walls, you need planning permission.' : '' });
    ctx.nat('pl.condition', yes(s.condition) ? 'fail' : no(s.condition) ? 'pass' : 'check', { value: yes(s.condition) ? 'A condition removes the rights' : no(s.condition) ? 'No such condition' : 'not answered' });
    // conservation areas and listed buildings: national rules do not remove Class B or F there, councils often say otherwise
    {
      const cons = says('conservation').filter(p => /conservation/.test(p.text));
      const st = yes(s.conservation) ? (cons.length ? 'fail' : 'check') : no(s.conservation) ? 'pass' : 'check';
      ctx.out.push({ id: 'pl.conservation', topic: 'pl.conservation', group: 'planning', status: st, rule: 'Classes B and F still apply in a conservation area, but Article 4 directions are common there, and some councils treat a dropped kerb in one as needing planning permission.', value: yes(s.conservation) ? 'In a conservation area' : no(s.conservation) ? 'Not in a conservation area' : 'not answered', limit: '', note: yes(s.conservation) && cons.length ? `${a.short}: ${cons[0].text}` : '', ref: 'GPDO 2015, article 4, and the council’s guidance', source: 'gpdoArt4', sourceLabel: NAT.SOURCES.gpdoArt4.short, url: NAT.SOURCES.gpdoArt4.url, checked: NAT.CHECKED });
    }
    if (yes(s.listed)) ctx.nat('pl.listed', 'fail', { value: 'A listed building' });
    else if (unsure(s.listed)) ctx.nat('pl.listed', 'check', { value: 'not answered' });
    const wh = num(model.newWallH);
    if (yes(model.newWall)) ctx.nat('pl.wall', wh == null ? 'check' : wh <= NAT.LIMITS.wallNearRoad + 1e-6 && !yes(s.listed) ? 'pass' : 'fail', { value: wh == null ? 'A new wall, gate or fence, height not given' : `A new wall, gate or fence ${m(wh)} high`, limit: '1 m next to the road' });
    if (yes(model.structural)) ctx.nat('pl.structural', 'check', { value: 'Digging out, building up or retaining walls' });
  }

  function planningVerdict(results, a) {
    const rows = results.filter(r => r.group === 'planning');
    const fails = rows.filter(r => r.status === 'fail'), checks = rows.filter(r => r.status === 'check');
    if (fails.length) return { status: 'fail', title: 'Planning permission is needed as entered', text: `${plural(fails.length, 'point needs', 'points need')} planning permission: ${fails.map(r => PL_NAME[r.id] || r.id).join(', ')}. Apply to the planning authority before you apply for the dropped kerb.`, needed: true };
    if (checks.length) return { status: 'check', title: 'Planning permission: check first', text: `${plural(checks.length, 'answer is', 'answers are')} missing or need the council’s view. A certificate of lawfulness for proposed works settles it for £${NAT.LIMITS.ldcFee}.`, needed: null };
    return { status: 'pass', title: 'No planning permission needed as entered', text: `The access and the hard surface fit Classes B and F as entered.${a && (a.process.evidence) ? ' The council still wants written confirmation from the planning authority.' : ''}`, needed: false };
  }
  const PL_NAME = { 'pl.access': 'the access on to a classified road', 'pl.house': 'a flat or maisonette', 'pl.surface': 'the impermeable surface over 5 m²', 'pl.changeofuse': 'a house without Class F rights', 'pl.article4': 'the Article 4 direction', 'pl.condition': 'the condition on the permission', 'pl.conservation': 'the conservation area, as the council treats it', 'pl.listed': 'the listed building', 'pl.wall': 'the new wall or gate over 1 m' };

  // ---------- Costs, from the council's published fees ----------
  function costFor(model, a, results, planning) {
    const lines = [];
    let low = 0, high = 0, atRisk = 0;
    const R = a.rules || {};
    const treeRow = results.find(r => r.topic === 'tree'), lampRow = results.find(r => r.topic === 'lamp');
    const near = {
      tree: model.tree === 'yes' && !!treeRow && treeRow.status !== 'pass' && (num(model.treeDist) == null || num(model.treeDist) <= ((R.tree && R.tree.within) || 15)),
      lamp: model.lamp === 'yes' && (num(model.lampDist) == null || num(model.lampDist) < ((R.lamp && R.lamp.min) || 0.5)),
    };
    const src = key => (a.sources && a.sources[key]) || NAT.SOURCES[key];
    for (const f of a.fees || []) {
      if (f.optional) { lines.push({ label: f.label, amount: f.amount, kind: 'optional', note: f.note || '', source: src(f.source) }); continue; }
      if (f.when) {
        const n = f.when.filter(w => near[w]).length;
        if (!n) continue;
        lines.push({ label: f.label, amount: f.amount * n, kind: 'possible', note: `${n === 1 ? 'One' : n} likely here. ${f.note || ''}`.trim(), source: src(f.source) });
        high += f.amount * n; atRisk += f.amount * n;
        continue;
      }
      lines.push({ label: f.label, amount: f.amount, kind: f.stage === 'proceed' ? 'proceed' : 'fee', note: f.note || '', refundable: f.refundable, source: src(f.source) });
      low += f.amount; high += f.amount;
      if (f.stage !== 'proceed') atRisk += f.refundable === 'partial' ? f.amount - (f.refund || 0) : f.refundable === 'cooling' ? f.amount : f.refundable ? 0 : f.amount;
    }
    const W = a.works || {};
    let works = null;
    if (W.kind === 'range') works = { low: W.min, high: W.max, text: `${W.text}: ${money(W.min)} to ${money(W.max)}` };
    if (W.kind === 'average') works = { low: W.amount, high: W.amount, text: `${W.text} ${money(W.amount)}` };
    if (W.kind === 'from') works = { low: W.amount, high: null, text: `${W.text} ${money(W.amount)}` };
    if (W.kind === 'rate') {
      const P = plan(model, a);
      const areaX = r2(P.footway * (P.crossing.length + P.opening) / 2 + (P.verge * P.crossing.length));
      const c = Math.round(areaX * W.perM2);
      works = { low: c, high: c, text: `${W.text}: about ${fmt(areaX)} m² at ${money(W.perM2)} a m², ${money(c)}`, area: areaX };
    }
    if (W.kind === 'quote') works = { low: null, high: null, text: W.text };
    if (works) lines.push({ label: 'Building the crossing', amount: works.low, amountHigh: works.high, kind: 'works', note: works.text + (W.extra ? ` ${W.extra}` : ''), source: src(W.source) });
    if (works && works.low != null) { low += works.low; high += works.high != null ? works.high : works.low; }
    if (planning && planning.needed) {
      const flat = model.home === 'flat';
      lines.push({ label: flat ? 'Planning application (full, for a flat)' : 'Householder planning application', amount: flat ? null : NAT.LIMITS.planningFee, kind: 'planning', note: flat ? 'The fee for a flat is set by the national fee schedule for other applications; ask the planning authority.' : 'England, from 1 April 2026.', source: NAT.SOURCES.fees2026 });
      if (!flat) { low += NAT.LIMITS.planningFee; high += NAT.LIMITS.planningFee; }
    } else if (planning && planning.needed === null) {
      lines.push({ label: 'Certificate of lawfulness for proposed works (optional)', amount: NAT.LIMITS.ldcFee, kind: 'optional', note: 'Half the householder fee; settles whether planning permission is needed.', source: NAT.SOURCES.fees2026 });
    }
    const move = results.filter(r => r.status !== 'pass' && /must be moved|has to be moved|at your cost/.test(r.note || ''));
    return { lines, low: r2(low), high: r2(high), atRisk: r2(atRisk), openEnded: !works || works.high == null || move.length > 0, missing: a.feeMissing || '', moves: move.map(r => r.topic) };
  }

  // ---------- Evaluate ----------
  function validate(model) {
    const errs = [];
    if (!model || !model.a) return ['Choose your council.'];
    if (!(num(model.depth) > 0)) errs.push('Enter the depth of the front garden, from the back of the pavement to the house.');
    if (!(num(model.width) > 0)) errs.push('Enter the width of the parking space.');
    if (!(num(model.footway) > 0)) errs.push('Enter the width of the pavement.');
    if (num(model.depth) > 60 || num(model.width) > 60) errs.push('Those sizes look too large; enter metres.');
    return errs;
  }
  function evaluate(model, auths) {
    const errors = validate(model);
    const entry = IDX.BY_SLUG[model && model.a];
    const a = authOf(model && model.a, auths);
    if (!errors.length && !entry) errors.push('Choose your council from the list.');
    if (errors.length) return { ok: false, errors, results: [], counts: { pass: 0, fail: 0, check: 0, info: 0 }, verdict: { status: 'incomplete', title: 'Finish the measurements first', text: errors[0] } };
    const ctx = makeCtx(model, a);
    ctx.nat('nat.consent', 'info');
    const verified = !!(a && entry.verified);
    if (verified) councilRules(model, a, plan(model, a), ctx);
    else genericRules(model, entry, ctx);
    if (model.gates === 'outward' && !verified) ctx.nat('nat.gates', 'fail', { value: 'Gates opening outwards' });
    planningRules(model, a || { short: entry.name, planning: [] }, ctx);
    const results = ctx.out;
    const counts = { pass: 0, fail: 0, check: 0, info: 0 };
    results.forEach(r => { counts[r.status]++; });
    const council = results.filter(r => r.group === 'council');
    const cc = { pass: 0, fail: 0, check: 0 };
    council.forEach(r => { if (cc[r.status] != null) cc[r.status]++; });
    const P = plan(model, a);
    const planning = planningVerdict(results, a);
    const verdict = verdictFor(model, a, entry, verified, cc, planning);
    const cost = verified ? costFor(model, a, results, planning) : null;
    return { ok: true, errors: [], results, counts, councilCounts: cc, verdict, planning, cost, plan: P, verified, authority: entry, authorityRules: verified ? a.rules : null, rulesVersion: verified ? a.version : NAT.RULES_VERSION, nationalVersion: NAT.RULES_VERSION, rulesAsOf: verified ? longDate(a.checked) : NAT.RULES_AS_OF };
  }
  // A council not checked yet: the national rules, and each topic as a point to check with the range seen elsewhere.
  function genericRules(model, entry, ctx) {
    const topics = [['depth', 'Depth of the parking space', `${m(num(model.depth))} deep`], ['width', 'Width of the parking space', `${m(num(model.width))} wide`], ['junction', 'Distance from a junction', `${m(num(model.junction))}`], ['splay', 'Walls and hedges beside the opening', `${m(num(model.wall))} high`], ['tree', 'Street trees', model.tree === 'yes' ? `${m(num(model.treeDist))} from the trunk` : model.tree === 'none' ? 'No street tree nearby' : 'not answered'], ['lamp', 'Street lights', model.lamp === 'yes' ? `${m(num(model.lampDist))} away` : model.lamp === 'none' ? 'None nearby' : 'not answered']];
    for (const [t, label, value] of topics) ctx.add(`other.${t}`, t, 'check', { rule: `${label}: ${entry.name}’s own rule is not in this tool yet.`, value, limit: RANGE[t] ? `elsewhere ${RANGE[t]}` : '', note: 'Read the council’s own page before you pay its fee.', ref: '', source: 'govRouter' });
  }
  function verdictFor(model, a, entry, verified, cc, planning) {
    const notFormal = 'The council decides after its own site visit.';
    if (!verified) return { status: 'check', title: `${entry.name}’s own rules are not checked here yet`, text: `The national rules below apply. For its depth, width, junction and tree rules, use the GOV.UK postcode finder to reach ${entry.name}’s page. ${notFormal}`, other: true };
    const fee = (a.fees || []).find(f => f.id === 'application');
    const feeText = fee ? ` Its ${money(fee.amount)} fee is ${fee.refundable === 'partial' ? `only partly refunded (${money(fee.refund)} back)` : fee.refundable === 'cooling' ? 'non-refundable after 14 days' : 'non-refundable'}.` : '';
    if (cc.fail) return { status: 'fail', title: `Does not meet ${a.short}’s published rules as entered`, text: `${plural(cc.fail, 'rule fails', 'rules fail')}, so ${a.short} would be likely to refuse.${feeText} Change the plan, or ask the council before you pay. ${notFormal}`, feeAtRisk: true };
    if (cc.check) return { status: 'check', title: `Meets the ${a.short} rules entered, with points to check`, text: `${plural(cc.check, 'point is', 'points are')} for the inspector to judge on site, or still unanswered. ${notFormal}` };
    return { status: 'pass', title: `Meets every published ${a.short} rule this tool checks`, text: `Nothing entered breaks a published rule. ${notFormal}` };
  }
  function longDate(iso) { const [y, mo, d] = String(iso).split('-').map(Number); return `${d} ${NAT.MONTHS[mo - 1]} ${y}`; }

  // ---------- Side-by-side options (Pro): the same frontage with one change each ----------
  function options(model, auths) {
    const a = authOf(model.a, auths);
    if (!a) return [];
    const base = evaluate(model, auths);
    const out = [{ id: 'as', label: 'As entered', model, result: base }];
    const tryIt = (id, label, fn) => { const m2 = clone(model); fn(m2); m2.sample = model.sample; const r = evaluate(m2, auths); out.push({ id, label, model: m2, result: r }); };
    const wallRow = base.results.find(r => r.topic === 'splay' && r.status !== 'pass');
    if (wallRow && num(model.wall) > 0.6) tryIt('wall', 'Lower the wall beside the opening to 0.6 m', m2 => { m2.wall = 0.6; });
    if (!PERMEABLE.has(model.surface)) tryIt('porous', 'Permeable block paving instead', m2 => { m2.surface = 'permeable'; m2.drain = 'garden'; });
    if (Number(model.spaces) !== 2) tryIt('double', 'A double-width crossing for two cars', m2 => { m2.spaces = 2; });
    else tryIt('single', 'A single crossing for one car', m2 => { m2.spaces = 1; });
    if (yes(model.door) && a.rules.door) tryIt('shift', 'Park clear of the front door', m2 => { m2.door = 'no'; });
    if (model.gates === 'outward') tryIt('gates', 'Rehang the gates to open inwards', m2 => { m2.gates = 'inward'; });
    else if (model.gates === 'inward' && a.rules.depth && a.rules.depth.gates) tryIt('nogates', 'Leave the opening without gates', m2 => { m2.gates = 'none'; });
    const depthRow = base.results.find(r => r.topic === 'depth' && r.status === 'fail');
    if (depthRow && model.mode === 'perp' && a.rules.depth && a.rules.depth.parallel && num(model.width) >= (a.rules.width && a.rules.width.parallel || 6)) tryIt('parallel', 'Park parallel to the road instead', m2 => { m2.mode = 'parallel'; });
    return out.slice(0, 5);
  }

  // ---------- Share link: the whole frontage in the URL fragment, never sent to a server ----------
  function encode(model) {
    const json = JSON.stringify(model);
    const b = typeof Buffer !== 'undefined' ? Buffer.from(json, 'utf8').toString('base64') : btoa(unescape(encodeURIComponent(json)));
    return b.replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
  }
  function decode(str) {
    try {
      const b = String(str).replace(/-/g, '+').replace(/_/g, '/');
      const pad = b + '==='.slice((b.length + 3) % 4);
      const json = typeof Buffer !== 'undefined' ? Buffer.from(pad, 'base64').toString('utf8') : decodeURIComponent(escape(atob(pad)));
      const mdl = JSON.parse(json);
      if (!mdl || mdl.v !== 1 || !IDX.BY_SLUG[mdl.a]) return null;
      return mdl;
    } catch (e) { return null; }
  }

  return { BASE, SCREEN_KEYS, QUESTIONS, SURFACE, KERB, CAR, NAT, IDX, sample, fresh, plan, crossingOf, evaluate, validate, options, encode, decode, costFor, fmt, money, ratio, longDate };
});
