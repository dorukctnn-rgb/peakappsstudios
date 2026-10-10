/* Without Planning: the engine. Takes one project (house, plot, screening answers and the proposal) and returns every
 * condition with pass, fail or check, the figure that was compared, the limit and the legal citation. Pure functions,
 * no DOM: window.WPEngine in the browser, module.exports in Node (unit tests). Rules come from rules-en.js and rules-ie.js.
 *
 * Plan geometry (metres): x runs across the plot from the left boundary, y runs from the front boundary (the road side)
 * to the rear boundary. The house is a rectangle; every proposal is a rectangle on that plan.
 * Verdicts are conservative: an unknown answer, or a term that needs judgement, never produces a pass.
 * Status "info" marks an obligation that applies after you build (it is listed, not scored). */
(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory(require('./rules-en.js'), require('./rules-ie.js'));
  else root.WPEngine = factory(root.WPRules.en, root.WPRules.ie);
})(typeof self !== 'undefined' ? self : this, function (EN, IE) {
  'use strict';

  const RULES = { en: EN, ie: IE };
  const EPS = 1e-9;
  const num = v => (v === '' || v == null || !Number.isFinite(Number(v)) ? null : Number(v));
  const r2 = x => (x == null ? null : Math.round(x * 100) / 100);
  function fmt(x) {
    if (x == null || !Number.isFinite(x)) return '';
    const v = Math.round(x * 100) / 100;
    return Number.isInteger(v) ? String(v) : String(v);
  }
  const m = x => (x == null ? 'not given' : `${fmt(x)} m`);
  const m2 = x => (x == null ? 'not given' : `${fmt(x)} m²`);
  const yes = v => v === 'yes';
  const no = v => v === 'no';
  const unsure = v => !yes(v) && !no(v);

  // ---------- Projects the tool knows ----------
  const PROJECTS = {
    'en-rear': { j: 'en', cls: 'Class A', name: 'Rear extension', page: '/without-planning/rear-extension/' },
    'en-side': { j: 'en', cls: 'Class A', name: 'Side extension', page: '/without-planning/rear-extension/' },
    'en-out': { j: 'en', cls: 'Class E', name: 'Garden room or outbuilding', page: '/without-planning/garden-room/' },
    'en-ashp': { j: 'en', cls: 'Part 14, Class G', name: 'Heat pump or air conditioning', page: '/without-planning/air-conditioning-heat-pump/' },
    'ie-ext': { j: 'ie', cls: 'Class 1', name: 'Rear extension', page: '/without-planning/ireland/extension/' },
    'ie-shed': { j: 'ie', cls: 'Class 3', name: 'Shed, garden room or log cabin', page: '/without-planning/ireland/garden-room-shed/' },
    'ie-dad': { j: 'ie', cls: 'Class 3A', name: 'Detached house in the rear garden', page: '/without-planning/ireland/detached-auxiliary-dwelling/' },
    'ie-hp': { j: 'ie', cls: 'Class 2(d)', name: 'Heat pump', page: '/without-planning/air-conditioning-heat-pump/' },
    'ie-split': { j: 'ie', cls: 'Class 1A', name: 'Split the house into two homes', page: '/without-planning/ireland-2026/' },
  };
  // The screening questions: how each is asked, the short name used in a warning, and what a yes changes.
  const QUESTIONS = {
    en: {
      flat: { q: 'Is it a flat or maisonette?', help: 'Householder rights are for houses.', name: 'a flat or maisonette', effect: 'Householder permitted development (Part 1) does not apply to flats. Class G heat pumps have their own limits for a block of flats: one unit, 0.6 m³.' },
      listed: { q: 'Is it a listed building?', name: 'a listed building', effect: 'Class E outbuildings and Class G heat pumps are not permitted at a listed building. Ask the council about listed building consent before any work.' },
      conservation: { q: 'Is it in a conservation area?', name: 'a conservation area', effect: 'Article 2(3) land: no side extension, no rear extension of more than one storey, no cladding, no larger home extension, no outbuilding beside the house, and no heat pump on a wall or roof facing a road.' },
      park: { q: 'Is it in a National Park, a National Landscape (AONB) or the Broads?', name: 'a National Park, National Landscape or the Broads', effect: 'Article 2(3) land, with the same limits as a conservation area, and no more than 10 m² of buildings more than 20 m from the house.' },
      whs: { q: 'Is it in a World Heritage Site?', name: 'a World Heritage Site', effect: 'Article 2(3) land, the 10 m² limit beyond 20 m, and the heat pump limits for walls and roofs facing a road.' },
      sssi: { q: 'Is it on a site of special scientific interest?', name: 'a site of special scientific interest', effect: 'No larger home extension under paragraph A.1(g).' },
      monument: { q: 'Is it on a scheduled monument?', name: 'a scheduled monument', effect: 'No Class G heat pump on a scheduled monument.' },
      article4: { q: 'Has the council made an Article 4 direction for this area?', name: 'an Article 4 direction', effect: 'The direction can remove some or all of these rights; it says which.' },
      condition: { q: 'Does a planning condition remove permitted development rights?', help: 'Check the permission the house was built under, especially newer homes.', name: 'a condition removing permitted development rights', effect: 'Nothing in the Order permits development contrary to a condition of a planning permission (article 3(4)).' },
      changeOfUse: { q: 'Was the house created from another use under permitted development?', help: 'A shop, office, barn or other conversion, or a house built under Part 20.', name: 'a house created by a change of use', effect: 'Classes A and E are not available.' },
      unlawful: { q: 'Was any part of the house built without the permission it needed?', name: 'work built without permission', effect: 'Permitted development rights do not apply to an unlawful building or use (article 3(5)).' },
      previous: { q: 'Has the house been extended since it was built?', help: 'Or since 1 July 1948, for older houses.', name: 'earlier extensions', effect: 'Earlier extensions count towards the depth, height, width and coverage limits.' },
    },
    ie: {
      flat: { q: 'Is it an apartment or flat?', help: 'Classes 1, 2 and 3 are for houses.', name: 'an apartment or flat', effect: 'Classes 1, 2 and 3 do not apply to an apartment or flat (article 5(1)).' },
      listed: { q: 'Is it a protected structure, or proposed for protection?', name: 'a protected structure', effect: 'Works are exempt only if they would not materially affect its character (section 57). The council can say which works would, in a section 57 declaration.' },
      conservation: { q: 'Is it in an architectural conservation area?', name: 'an architectural conservation area', effect: 'Exterior works that would materially affect the character of the area are not exempt (article 9(1)(a)(xii)).' },
      saao: { q: 'Is it in an area with a special amenity area order?', name: 'a special amenity area order', effect: 'Classes 1 and 3 are not exempt there, and the order can limit other classes (article 9(1)(b)).' },
      european: { q: 'Is it in or next to an SAC, SPA or Natural Heritage Area?', name: 'a European site or Natural Heritage Area', effect: 'Not exempt if appropriate assessment is needed, or a Natural Heritage Area would be harmed (article 9(1)(a)(viiB) and (viiC)).' },
      monument: { q: 'Is there a recorded monument on or next to the site?', name: 'a recorded monument', effect: 'Not exempt if it would affect a monument in the Record of Monuments and Places (article 9(1)(a)(viiA)).' },
      condition: { q: 'Does a condition of an earlier permission restrict extensions or garden buildings?', name: 'a condition of an earlier permission', effect: 'Not exempt if it breaches a condition of a planning permission (article 9(1)(a)(i)).' },
      unlawful: { q: 'Was any existing extension or structure built without the permission it needed?', name: 'an unauthorised structure', effect: 'Not exempt if it extends or alters an unauthorised structure (article 9(1)(a)(viii)).' },
      previous: { q: 'Has the house been extended since 1 October 1964?', help: 'Earlier extensions count towards the 45 m².', name: 'earlier extensions', effect: 'Extensions built since 1 October 1964 count towards the 45 m² and the above-ground limits.' },
    },
  };
  const SCREEN_KEYS = {
    en: ['flat', 'listed', 'conservation', 'park', 'whs', 'sssi', 'monument', 'article4', 'condition', 'changeOfUse', 'unlawful', 'previous'],
    ie: ['flat', 'listed', 'conservation', 'saao', 'european', 'monument', 'condition', 'unlawful', 'previous'],
  };

  // ---------- The sample house (shown as a sample wherever it is used) ----------
  const SAMPLE_P = {
    'en-rear': { depth: 3, width: 6.2, offset: 0, height: 3.4, eaves: 2.8, storeys: 1, roof: 'flat', joins: 'no', balcony: 'no', roofAlter: 'no', materials: 'match', cladding: 'no', sideWindows: 'none', pitch: 'yes' },
    'en-side': { side: 'right', width: 2.6, depth: 5.5, setback: 1.0, height: 3.6, eaves: 2.7, storeys: 1, roof: 'pitched', balcony: 'no', roofAlter: 'no', materials: 'match', cladding: 'no', sideWindows: 'none', pitch: 'yes' },
    'en-out': { width: 4.0, depth: 3.0, x: 1.0, y: 1.0, height: 2.5, eaves: 2.3, roof: 'flat', storeys: 1, use: 'office', platform: 'no', location: 'rear' },
    'en-ashp': { units: 1, w: 1.0, d: 0.4, h: 0.9, mount: 'ground', edge: '', frontsHighway: 'no', aboveGround: 'no', nearerHighway: 'no', use: 'heating', wind: 'no', lw: 58, q: 4, r: 7, barrier: 'none', mcsDone: 'yes', place: 'rear', x: 4.6, y: 0.3 },
    'ie-ext': { depth: 4.5, width: 6.2, offset: 0, storeys: 1, above: '', height: 3.2, walls: 3.0, roof: 'flat', joins: 'no', balcony: 'no', position: 'rear', winGround: ['rear'], winAbove: [] },
    'ie-shed': { width: 6.0, depth: 4.5, x: 1.0, y: 1.0, height: 3.0, roof: 'other', location: 'rear', use: 'office', finishes: 'match' },
    'ie-dad': { width: 7.0, depth: 5.5, x: 1.0, y: 1.2, height: 3.0, roof: 'other', location: 'rear', winFaces: ['front'], occupancy: 'yes', temporary: 'no', newAccess: 'no', ownAccess: 'yes', utilities: 'shared', wastewater: 'mains', letting: 'no', owner: 'yes', split: 'no', start: '2027-03-01', notice: '2027-02-08', finish: '2027-09-30' },
    'ie-hp': { w: 1.0, d: 0.4, h: 0.9, mount: 'ground', edge: '', road: 'no', ground: 0, use: 'heating', noise: 38, background: '', lw: 58, q: 4, r: 6, barrier: 'none', place: 'rear', x: 4.6, y: 0.3 },
    'ie-split': { units: 2, area1: 58, area2: 41, self: 'yes', dad: 'no', start: '2027-03-01', notice: '2027-02-08', finish: '2027-09-30' },
  };
  function blankScreen(j, value) { return Object.fromEntries(SCREEN_KEYS[j].map(k => [k, value])); }
  function sample(kind) {
    const k = PROJECTS[kind] ? kind : 'en-rear';
    const j = PROJECTS[k].j;
    return {
      v: 1, j, kind: k, sample: true,
      house: { type: 'semi', attached: 'left', endTerrace: false, width: 6.2, depth: 8.0, eaves: 5.2, ridge: 8.3, roof: 'gable', rearWall: 5.2, gableRear: false },
      plot: { gapL: 0, gapR: 3.2, front: 6.0, rear: 14.0, rearIsRoad: 'no', sideHighway: 'none' },
      screen: blankScreen(j, 'no'),
      judge: { original: 'yes', principal: 'yes', curtilage: 'yes', openSpace: 'yes' },
      existing: { extDepth: 0, extWidth: 0, extStoreys: 1, extHeight: 0, joins: 'no', outArea: 0, hard: 0, heatPumps: 0, hpArea: 0, farArea: 0 },
      p: JSON.parse(JSON.stringify(SAMPLE_P[k])),
    };
  }
  // A project of another kind for the same property: the house, plot, earlier extensions and judgements carry over,
  // and so do the screening answers when the jurisdiction is the same. Without "from": the sample's sizes with every
  // question unanswered, so nothing passes until the visitor has answered it.
  function fresh(kind, from) {
    const s = sample(kind);
    s.sample = false;
    if (from) {
      s.house = Object.assign({}, from.house);
      s.plot = Object.assign({}, from.plot);
      s.existing = Object.assign({}, s.existing, from.existing);
      s.judge = Object.assign({}, from.judge);
      s.screen = from.j === s.j ? Object.assign({}, blankScreen(s.j, ''), from.screen) : blankScreen(s.j, '');
    } else {
      s.screen = blankScreen(s.j, '');
      s.judge = { original: '', principal: '', curtilage: '', openSpace: '' };
    }
    return s;
  }

  // ---------- Plan geometry ----------
  function attachedSides(h) {
    if (h.type === 'detached') return { left: false, right: false };
    if (h.type === 'terrace' && !h.endTerrace) return { left: true, right: true };
    return h.attached === 'right' ? { left: false, right: true } : { left: true, right: false };
  }
  function plan(model) {
    const h = model.house, pl = model.plot;
    const att = attachedSides(h);
    const gapL = att.left ? 0 : Math.max(0, num(pl.gapL) || 0);
    const gapR = att.right ? 0 : Math.max(0, num(pl.gapR) || 0);
    const hw = num(h.width) || 0, hd = num(h.depth) || 0;
    const front = Math.max(0, num(pl.front) || 0);
    const rear = Math.max(0, num(pl.rear) || 0);
    const house = { x0: gapL, x1: gapL + hw, y0: front, y1: front + hd };
    return { W: gapL + hw + gapR, L: front + hd + rear, gapL, gapR, front, rear, house, att };
  }
  const rect = (x0, y0, x1, y1) => ({ x0: Math.min(x0, x1), y0: Math.min(y0, y1), x1: Math.max(x0, x1), y1: Math.max(y0, y1) });
  const area = r => (r ? (r.x1 - r.x0) * (r.y1 - r.y0) : 0);
  const gaps = (r, P) => ({ left: r.x0, right: P.W - r.x1, front: r.y0, rear: P.L - r.y1 });
  function rectGap(a, b) {
    const dx = Math.max(0, b.x0 - a.x1, a.x0 - b.x1), dy = Math.max(0, b.y0 - a.y1, a.y0 - b.y1);
    return Math.hypot(dx, dy);
  }
  function rectFar(a, b) {
    let far = 0;
    for (const [x, y] of [[a.x0, a.y0], [a.x1, a.y0], [a.x0, a.y1], [a.x1, a.y1]]) far = Math.max(far, rectGap({ x0: x, x1: x, y0: y, y1: y }, b));
    return far;
  }
  const inside = (r, P) => r.x0 >= -1e-6 && r.y0 >= -1e-6 && r.x1 <= P.W + 1e-6 && r.y1 <= P.L + 1e-6;
  const overlaps = (a, b) => a.x0 < b.x1 - 1e-6 && b.x0 < a.x1 - 1e-6 && a.y0 < b.y1 - 1e-6 && b.y0 < a.y1 - 1e-6;

  // Earlier extension: footprint behind the rear wall, placed relative to the new extension.
  function existingRect(model, P) {
    const ex = model.existing || {}, H = P.house, p = model.p || {};
    const d = num(ex.extDepth) || 0, w = Math.min(num(ex.extWidth) || 0, H.x1 - H.x0);
    if (!(d > 0 && w > 0)) return null;
    const rearKinds = model.kind === 'en-rear' || model.kind === 'ie-ext';
    if (rearKinds && ex.joins === 'end') { const x0 = H.x0 + (num(p.offset) || 0); return rect(x0, H.y1, Math.min(x0 + w, H.x1), H.y1 + d); }
    if (rearKinds) {
      const nx0 = H.x0 + (num(p.offset) || 0), nx1 = nx0 + (num(p.width) || 0);
      const gap = ex.joins === 'beside' ? 0 : 0.3;
      if (H.x1 - nx1 >= w + gap - 1e-6) return rect(nx1 + gap, H.y1, nx1 + gap + w, H.y1 + d);
      if (nx0 - H.x0 >= w + gap - 1e-6) return rect(nx0 - gap - w, H.y1, nx0 - gap, H.y1 + d);
      return rect(H.x1 - w, H.y1, H.x1, H.y1 + d);
    }
    return rect(H.x0, H.y1, H.x0 + w, H.y1 + d);
  }
  // Where the proposal sits on the plan, for the engine and the 3D scene alike.
  function proposalRect(model, P) {
    const p = model.p || {}, k = model.kind, H = P.house, ex = model.existing || {};
    if (k === 'en-rear' || k === 'ie-ext') {
      const start = ex.joins === 'end' && num(ex.extDepth) > 0 && num(ex.extWidth) > 0 ? H.y1 + num(ex.extDepth) : H.y1;
      const x0 = H.x0 + (num(p.offset) || 0);
      return rect(x0, start, x0 + (num(p.width) || 0), start + (num(p.depth) || 0));
    }
    if (k === 'en-side') {
      const y0 = H.y0 + (num(p.setback) || 0), w = num(p.width) || 0, d = num(p.depth) || 0;
      return p.side === 'left' ? rect(H.x0 - w, y0, H.x0, y0 + d) : rect(H.x1, y0, H.x1 + w, y0 + d);
    }
    if (k === 'en-out' || k === 'ie-shed' || k === 'ie-dad') {
      const w = num(p.width) || 0, d = num(p.depth) || 0;
      if (p.location === 'front') { const y1 = Math.max(d, H.y0 - 0.5); const x0 = Math.min(Math.max(0, num(p.x) || 0), Math.max(0, P.W - w)); return rect(x0, y1 - d, x0 + w, y1); }
      if (p.location === 'side') {
        const onRight = P.gapR >= P.gapL;
        const room = onRight ? P.gapR : P.gapL;
        const x0 = onRight ? H.x1 + Math.max(0, (room - w) / 2) : Math.max(0, (room - w) / 2);
        return rect(x0, H.y0 + 0.5, x0 + w, H.y0 + 0.5 + d);
      }
      const y1 = P.L - (num(p.y) || 0), x0 = num(p.x) || 0;
      return rect(x0, y1 - d, x0 + w, y1);
    }
    if (k === 'en-ashp' || k === 'ie-hp') {
      // place: rear (behind the rear wall), side (in the side passage) or front (in front of the front wall)
      const w = num(p.w) || 1, d = num(p.d) || 0.4, off = num(p.y) != null ? Math.max(0, num(p.y)) : 0.3;
      if (p.place === 'front') { const x0 = num(p.x) != null ? num(p.x) : H.x0 + 0.6; return rect(x0, H.y0 - off - d, x0 + w, H.y0 - off); }
      if (p.place === 'side') {
        const right = P.gapR >= P.gapL, room = right ? P.gapR : P.gapL;
        const x0 = right ? H.x1 + Math.min(off, Math.max(0, room - d)) : Math.max(0, H.x0 - Math.min(off, Math.max(0, room - d)) - d);
        return rect(x0, H.y0 + 1.5, x0 + d, H.y0 + 1.5 + w);
      }
      const x0 = num(p.x) != null ? num(p.x) : H.x1 - w - 0.6;
      return rect(x0, H.y1 + off, x0 + w, H.y1 + off + d);
    }
    return null;
  }

  // ---------- Results ----------
  function makeCtx(model) {
    const R = RULES[model.j];
    const out = [];
    const add = (id, status, o) => {
      const c = R.BY_ID[id];
      if (!c) throw new Error('unknown condition ' + id);
      out.push(Object.assign({ id, status, cls: c.cls, ref: c.ref, rule: c.text, source: c.source, sourceLabel: R.SOURCES[c.source].short, url: R.SOURCES[c.source].url, checked: c.checked, value: '', limit: '', note: '' }, o || {}));
    };
    return { R, out, add };
  }
  function cmp(value, limit, op) {
    if (value == null || !Number.isFinite(value) || limit == null || !Number.isFinite(limit)) return 'check';
    if (op === 'le') return value <= limit + 1e-6 ? 'pass' : 'fail';
    if (op === 'ge') return value >= limit - 1e-6 ? 'pass' : 'fail';
    throw new Error('op');
  }
  const soften = (status, judged) => (status === 'pass' && judged ? 'check' : status);
  const tri = v => (yes(v) ? true : no(v) ? false : null);
  const joinNotes = (...n) => n.filter(Boolean).join(' ');

  // ---------- Screening: before any class ----------
  function screening(model, ctx) {
    const s = model.screen || {}, j = model.j, k = model.kind;
    if (j === 'en') {
      if (k !== 'en-ashp') {
        if (yes(s.flat)) ctx.add('en.o.flat', 'fail', { value: 'A flat or maisonette', note: 'Householder rights in Part 1 do not apply. Ask the council what permission you need.' });
        else if (unsure(s.flat)) ctx.add('en.o.flat', 'check', { value: 'Not answered', note: 'Confirm the property is a house, not a flat or maisonette.' });
      }
      if (yes(s.condition)) ctx.add('en.o.condition', 'check', { value: 'A condition may remove the rights', note: 'Read the conditions on the planning permission for the house. If one removes this class, you need planning permission.' });
      else if (unsure(s.condition)) ctx.add('en.o.condition', 'check', { value: 'Not answered', note: 'Check the planning history of the house for a condition removing permitted development rights.' });
      if (yes(s.article4)) ctx.add('en.o.article4', 'check', { value: 'An Article 4 direction applies', note: 'Ask the council which classes the direction removes.' });
      else if (unsure(s.article4)) ctx.add('en.o.article4', 'check', { value: 'Not answered', note: 'Look for Article 4 direction areas on the Planning Data map, then confirm with the council.' });
      if (yes(s.unlawful)) ctx.add('en.o.unlawful', 'fail', { value: 'Part of the house was built without permission', note: 'Permitted development rights do not apply to an unlawful building. Regularise it first.' });
      else if (unsure(s.unlawful)) ctx.add('en.o.unlawful', 'check', { value: 'Not answered', note: 'Confirm earlier extensions had permission or were permitted development.' });
    } else {
      if (['ie-ext', 'ie-shed', 'ie-hp'].includes(k)) {
        if (yes(s.flat)) ctx.add('ie.a5.flat', 'fail', { value: 'An apartment or flat', note: 'Classes 1, 2 and 3 do not apply to apartments. Ask the council, or request a section 5 declaration.' });
        else if (unsure(s.flat)) ctx.add('ie.a5.flat', 'check', { value: 'Not answered', note: 'Confirm the property is a house, not a flat or apartment.' });
      } else if (!no(s.flat)) ctx.add('ie.a5.flat', 'check', { value: yes(s.flat) ? 'An apartment or flat' : 'Not answered', note: 'Classes 1A and 3A assume a principal house. Ask the council before relying on them.' });
      if (yes(s.listed)) ctx.add('ie.a9.protected', 'check', { value: 'A protected structure', note: 'Ask the council for a section 57 declaration before relying on any class.' });
      else if (unsure(s.listed)) ctx.add('ie.a9.protected', 'check', { value: 'Not answered', note: 'Check the Record of Protected Structures in the county or city development plan.' });
      if (yes(s.conservation)) ctx.add('ie.a9.aca', 'check', { value: 'In an architectural conservation area', note: 'Exterior works that would materially affect the character of the area are not exempt. Ask the council.' });
      else if (unsure(s.conservation)) ctx.add('ie.a9.aca', 'check', { value: 'Not answered', note: 'Check the development plan maps for architectural conservation areas.' });
      const c13 = k === 'ie-ext' || k === 'ie-shed';
      if (yes(s.saao)) ctx.add('ie.a9.saao', c13 ? 'fail' : 'check', { value: 'Under a special amenity area order', note: c13 ? 'Classes 1 and 3 are not exempt there. You need planning permission.' : 'Read the order: it can limit this class.' });
      else if (unsure(s.saao)) ctx.add('ie.a9.saao', 'check', { value: 'Not answered', note: 'Special amenity area orders cover few areas. Confirm with the council.' });
      if (yes(s.european)) ctx.add('ie.a9.european', 'check', { value: 'In or next to a European site or NHA', note: 'If the works would need appropriate assessment, they are not exempt. Ask the council.' });
      else if (unsure(s.european)) ctx.add('ie.a9.european', 'check', { value: 'Not answered', note: 'Look the site up on the NPWS maps.' });
      if (yes(s.monument)) ctx.add('ie.a9.monument', 'check', { value: 'A recorded monument on or near the site', note: 'Works that would affect it are not exempt. Ask the council and the National Monuments Service.' });
      else if (unsure(s.monument)) ctx.add('ie.a9.monument', 'check', { value: 'Not answered', note: 'Look the site up on the Historic Environment Viewer.' });
      if (yes(s.condition)) ctx.add('ie.a9.condition', 'fail', { value: 'A permission condition restricts it', note: 'Development that breaches a condition is not exempt. Apply for permission, or ask the council.' });
      else if (unsure(s.condition)) ctx.add('ie.a9.condition', 'check', { value: 'Not answered', note: 'Read the conditions on the planning permission for the house.' });
      if (yes(s.unlawful)) ctx.add('ie.a9.unauthorised', 'fail', { value: 'Built onto an unauthorised structure', note: 'Extending or altering an unauthorised structure is not exempt. Regularise it first.' });
      else if (unsure(s.unlawful)) ctx.add('ie.a9.unauthorised', 'check', { value: 'Not answered', note: 'Confirm earlier extensions had permission or were exempt.' });
    }
    return SCREEN_KEYS[j].filter(key => key !== 'previous' && !no(s[key])).map(key => ({ key, answer: yes(s[key]) ? 'yes' : 'unsure' }));
  }

  // ---------- England: Class A ----------
  function englandA(model, ctx, P) {
    const p = model.p, h = model.house, s = model.screen || {}, jd = model.judge || {}, ex = model.existing || {};
    const side = model.kind === 'en-side';
    const r = proposalRect(model, P);
    const L = EN.LIMITS.a;
    const detached = h.type === 'detached';
    const storeys = Number(p.storeys) || 1;
    const art23 = yes(s.conservation) || yes(s.park) || yes(s.whs);
    const art23Unsure = unsure(s.conservation) || unsure(s.park) || unsure(s.whs);
    const sssi = yes(s.sssi), sssiUnsure = unsure(s.sssi);
    const prevUnsure = unsure(s.previous);
    const originalUnsure = jd.original !== 'yes' || prevUnsure;
    const height = num(p.height), eaves = num(p.eaves);
    const exD = num(ex.extDepth) || 0, exW = num(ex.extWidth) || 0, exH = num(ex.extHeight) || 0, exS = Number(ex.extStoreys) || 1;
    const hasEx = yes(s.previous) && exD > 0 && exW > 0;
    const joined = !side && hasEx && (ex.joins === 'end' || ex.joins === 'beside');

    if (yes(s.changeOfUse)) ctx.add('en.a.use', 'fail', { value: 'Created by a change-of-use right, or built under Part 20', note: 'Class A is not available. Apply for planning permission.' });
    else if (unsure(s.changeOfUse)) ctx.add('en.a.use', 'check', { value: 'Not answered', note: 'Ask the council whether the house was created under Part 3 or built under Part 20.' });
    else ctx.add('en.a.use', 'pass', { value: 'A house in its original use' });

    // (b) half of the curtilage
    const curtilage = P.W * P.L - area(P.house);
    const covered = (hasEx ? exD * exW : 0) + (num(ex.outArea) || 0) + area(r);
    const share = curtilage > 0 ? covered / curtilage : null;
    ctx.add('en.a.coverage', soften(cmp(share, L.coverage, 'le'), jd.curtilage !== 'yes' || prevUnsure), { value: share == null ? 'not given' : `${Math.round(share * 1000) / 10}% (${fmt(r2(covered))} m² of ${fmt(r2(curtilage))} m²)`, limit: '50% of the curtilage', note: jd.curtilage !== 'yes' ? 'Assumes the whole plot is the curtilage of the house. Confirm where it ends.' : '' });
    // (c), (d)
    ctx.add('en.a.height', cmp(height, num(h.ridge), 'le'), { value: m(height), limit: `${m(num(h.ridge))}, the existing roof` });
    ctx.add('en.a.eaves', cmp(eaves, num(h.eaves), 'le'), { value: m(eaves), limit: `${m(num(h.eaves))}, the existing eaves` });
    // (e)
    const forward = r.y0 < P.house.y0 - 1e-6;
    const sideOnHighway = side && model.plot.sideHighway === p.side;
    if (forward) ctx.add('en.a.front', 'fail', { value: `${m(r2(P.house.y0 - r.y0))} forward of the front wall`, limit: 'Not beyond the principal elevation' });
    else if (sideOnHighway) ctx.add('en.a.front', 'fail', { value: 'Beyond a side wall that fronts a highway', limit: 'Not beyond a side elevation fronting a highway' });
    else ctx.add('en.a.front', soften('pass', jd.principal !== 'yes'), { value: side ? 'Behind the front wall' : 'At the rear', note: jd.principal !== 'yes' ? 'Assumes the wall facing the road you entered is the principal elevation. On a corner plot, confirm which wall it is.' : '' });

    // depth beyond the rear wall (f), (g), (h), as one enlargement with a joined extension (ja)
    const beyondRear = Math.max(0, r.y1 - P.house.y1);
    const totalDepth = joined ? (ex.joins === 'end' ? exD + (num(p.depth) || 0) : Math.max(exD, num(p.depth) || 0)) : beyondRear;
    const totalStoreys = joined ? Math.max(storeys, exS) : storeys;
    const totalHeight = joined ? Math.max(height || 0, exH) : height;
    let route = 'none';
    if (!side || beyondRear > 1e-6) {
      if (totalStoreys <= 1) {
        const base = detached ? L.depthDetached : L.depthOther, larger = detached ? L.largerDetached : L.largerOther;
        const largerOk = !art23 && !sssi;
        let st, note = '', limit = `${base} m for a ${detached ? 'detached house' : 'semi-detached or terraced house'}`;
        if (totalDepth <= base + 1e-6) st = 'pass';
        else if (totalDepth <= larger + 1e-6 && largerOk) {
          route = 'prior';
          st = art23Unsure || sssiUnsure ? 'check' : 'pass';
          limit = `${base} m, or ${larger} m with prior approval`;
          note = art23Unsure || sssiUnsure ? 'The larger extension is not available on article 2(3) land or an SSSI. Confirm the designations first.' : 'Beyond the standard limit, so this needs the larger home extension prior approval.';
        } else {
          st = 'fail';
          if (totalDepth <= larger + 1e-6) note = 'The larger home extension route is not available on article 2(3) land or an SSSI.';
        }
        ctx.add('en.a.depth1', soften(st, originalUnsure), { value: `${m(r2(totalDepth))} beyond the rear wall${joined ? ', with the extension it joins' : ''}`, limit, note: joinNotes(note, originalUnsure ? 'Measured from the rear wall of the original house (as built, or as it stood on 1 July 1948). Confirm the wall is original and every earlier extension is entered.' : '') });
        ctx.add('en.a.height1', cmp(totalHeight, L.singleHeight, 'le'), { value: m(totalHeight), limit: '4 m' });
      } else {
        ctx.add('en.a.depth2', soften(cmp(totalDepth, L.twoStoreyDepth, 'le'), originalUnsure), { value: `${m(r2(totalDepth))} beyond the rear wall`, limit: '3 m', note: originalUnsure ? 'Measured from the rear wall of the original house. Confirm the wall is original.' : '' });
        const toRear = P.L - r.y1;
        ctx.add('en.a.rear7', cmp(toRear, L.rearBoundary, 'ge'), { value: `${m(r2(toRear))} from the rear boundary`, limit: 'at least 7 m' });
      }
    }
    // (i)
    const g = gaps(r, P);
    const near = Math.min(g.left, g.right, g.rear);
    const within = near < L.nearBoundary - 1e-6;
    ctx.add('en.a.eaves2m', within ? cmp(eaves, L.nearBoundaryEaves, 'le') : 'pass', { value: within ? `Eaves ${m(eaves)}, ${m(r2(Math.max(0, near)))} from a boundary` : `${m(r2(near))} from the nearest boundary`, limit: within ? 'eaves 3 m within 2 m of a boundary' : 'over 2 m away, so no extra limit' });
    // (j)
    const outside = r.x0 < P.house.x0 - 1e-6 || r.x1 > P.house.x1 + 1e-6;
    if (side || outside) {
      const widthOut = side ? (num(p.width) || 0) : Math.max(0, P.house.x0 - r.x0) + Math.max(0, r.x1 - P.house.x1);
      const half = (num(h.width) || 0) * L.sideWidthShare;
      const fails = [];
      if (!(height <= L.sideHeight + 1e-6)) fails.push(`${m(height)} high`);
      if (storeys > 1) fails.push('more than one storey');
      if (!(widthOut <= half + 1e-6)) fails.push(`${m(r2(widthOut))} wide`);
      ctx.add('en.a.side', height == null ? 'check' : fails.length ? 'fail' : soften('pass', originalUnsure), { value: fails.length ? fails.join(', ') : `${m(r2(widthOut))} wide, ${m(height)} high, one storey`, limit: `4 m high, one storey, ${m(r2(half))} wide (half the house)` });
    }
    if (joined) ctx.add('en.a.total', 'pass', { value: `Checked as one enlargement: ${m(r2(totalDepth))} deep, ${totalStoreys === 1 ? 'one storey' : 'two storeys'}`, note: 'The depth, height and boundary limits use the earlier extension and the new one together.' });
    // (k)
    const extras = [];
    if (yes(p.balcony)) extras.push('a balcony, verandah or raised platform');
    if (yes(p.roofAlter)) extras.push('a change to the roof of the house');
    ctx.add('en.a.extras', extras.length ? 'fail' : unsure(p.balcony) ? 'check' : 'pass', { value: extras.length ? `Includes ${extras.join(' and ')}` : 'None of these', note: yes(p.roofAlter) ? 'Roof changes fall under Classes B and C, with their own limits.' : '' });
    // A.2
    if (art23) {
      const bad = [];
      if (side || outside) bad.push('it goes beyond a side wall');
      if (storeys > 1) bad.push('it has more than one storey at the rear');
      if (yes(p.cladding)) bad.push('it adds cladding in a listed material');
      ctx.add('en.a.art23', bad.length ? 'fail' : unsure(p.cladding) ? 'check' : 'pass', { value: bad.length ? `On article 2(3) land ${bad.join(', ')}` : 'Single storey at the rear, no cladding', limit: 'On article 2(3) land: rear, single storey, no cladding' });
    } else if (art23Unsure) ctx.add('en.a.art23', side || storeys > 1 ? 'check' : 'pass', { value: 'Designations not confirmed', note: 'Conservation areas, National Parks, National Landscapes, the Broads and World Heritage Sites add limits. Check the maps, then the council.' });
    // A.3
    if (p.materials === 'different') ctx.add('en.a.materials', 'fail', { value: 'Different-looking materials', limit: 'Similar appearance to the house' });
    else if (p.materials === 'match' || p.materials === 'conservatory') ctx.add('en.a.materials', 'pass', { value: p.materials === 'conservatory' ? 'A conservatory, which is exempt from this' : 'Materials to match the house' });
    else ctx.add('en.a.materials', 'check', { value: 'Not decided' });
    if (storeys > 1) {
      if (p.sideWindows === 'clear') ctx.add('en.a.sideWindows', 'fail', { value: 'Clear or opening upper-floor side windows', limit: 'Obscure-glazed, fixed below 1.7 m' });
      else ctx.add('en.a.sideWindows', p.sideWindows === 'none' || p.sideWindows === 'obscured' ? 'pass' : 'check', { value: p.sideWindows === 'obscured' ? 'Obscure-glazed and fixed below 1.7 m' : p.sideWindows === 'none' ? 'No upper-floor side windows' : 'Not decided' });
      ctx.add('en.a.pitch', yes(p.pitch) ? 'pass' : no(p.pitch) ? 'fail' : 'check', { value: yes(p.pitch) ? 'Same pitch as the house' : no(p.pitch) ? 'A different pitch' : 'Not decided' });
    }
    if (route === 'prior') ctx.add('en.a.prior', 'info', { value: 'Prior approval before you start', limit: `£${EN.LIMITS.fees.priorApproval} from 1 April 2026; 42 days`, note: 'Send the council a written description, a site plan and the neighbours’ addresses. Start only after its written answer, or 42 days without one.' });
    return { route, rect: r };
  }

  // ---------- England: Class E ----------
  function englandE(model, ctx, P) {
    const p = model.p, s = model.screen || {}, jd = model.judge || {}, ex = model.existing || {};
    const L = EN.LIMITS.e;
    const r = proposalRect(model, P);
    if (yes(s.changeOfUse)) ctx.add('en.e.use', 'fail', { value: 'Created by a change-of-use right, or built under Part 20', note: 'Class E is not available. Apply for planning permission.' });
    else if (unsure(s.changeOfUse)) ctx.add('en.e.use', 'check', { value: 'Not answered' });
    else ctx.add('en.e.use', 'pass', { value: 'A house in its original use' });
    const uses = { office: 'A home office', gym: 'A gym', store: 'Storage', hobby: 'A hobby room or studio', garage: 'A garage' };
    if (p.use === 'sleeping' || p.use === 'annex') ctx.add('en.e.incidental', 'fail', { value: p.use === 'annex' ? 'Separate living accommodation' : 'A bedroom or other primary living space', note: 'That is not incidental to the house, so it needs planning permission.' });
    else ctx.add('en.e.incidental', uses[p.use] ? 'pass' : 'check', { value: uses[p.use] || 'Use not given' });
    const hasEx = yes(s.previous) && num(ex.extDepth) > 0 && num(ex.extWidth) > 0;
    const curtilage = P.W * P.L - area(P.house);
    const covered = (hasEx ? num(ex.extDepth) * num(ex.extWidth) : 0) + (num(ex.outArea) || 0) + area(r);
    const share = curtilage > 0 ? covered / curtilage : null;
    ctx.add('en.e.coverage', soften(cmp(share, L.coverage, 'le'), jd.curtilage !== 'yes' || unsure(s.previous)), { value: share == null ? 'not given' : `${Math.round(share * 1000) / 10}% (${fmt(r2(covered))} m² of ${fmt(r2(curtilage))} m²)`, limit: '50% of the curtilage', note: jd.curtilage !== 'yes' ? 'Assumes the whole plot is the curtilage of the house.' : '' });
    if (p.location === 'front') ctx.add('en.e.front', 'fail', { value: 'Forward of the front wall', limit: 'Behind the principal elevation' });
    else ctx.add('en.e.front', soften('pass', jd.principal !== 'yes'), { value: p.location === 'side' ? 'Beside the house, behind the front wall' : 'In the rear garden', note: jd.principal !== 'yes' ? 'Assumes the wall facing the road is the principal elevation.' : '' });
    ctx.add('en.e.storeys', Number(p.storeys) > 1 ? 'fail' : 'pass', { value: Number(p.storeys) > 1 ? 'More than one storey' : 'One storey' });
    const height = num(p.height), eaves = num(p.eaves);
    const g = gaps(r, P), near = Math.min(g.left, g.right, g.rear, g.front);
    const within = near < L.nearBoundary - 1e-6;
    const dual = p.roof === 'dual' || p.roof === 'hipped';
    const limitH = within ? L.nearBoundaryHeight : dual ? L.dualPitched : L.other;
    ctx.add('en.e.height', cmp(height, limitH, 'le'), { value: `${m(height)}, ${m(r2(Math.max(0, near)))} from the nearest boundary`, limit: within ? '2.5 m within 2 m of a boundary' : dual ? '4 m, dual-pitched or hipped roof' : '3 m', note: 'Measured from the highest ground next to the building.' });
    ctx.add('en.e.eaves', cmp(eaves, L.eaves, 'le'), { value: m(eaves), limit: '2.5 m' });
    if (yes(s.listed)) ctx.add('en.e.listed', 'fail', { value: 'The house is listed', limit: 'Not in the curtilage of a listed building' });
    else if (unsure(s.listed)) ctx.add('en.e.listed', 'check', { value: 'Not answered', note: 'Search the National Heritage List for England.' });
    else ctx.add('en.e.listed', 'pass', { value: 'Not listed' });
    ctx.add('en.e.platform', yes(p.platform) ? 'fail' : unsure(p.platform) ? 'check' : 'pass', { value: yes(p.platform) ? 'A verandah, balcony or decking over 0.3 m' : 'No raised platform' });
    const e2 = yes(s.park) || yes(s.whs), e2Unsure = unsure(s.park) || unsure(s.whs);
    if (e2 || e2Unsure) {
      const nearest = rectGap(r, P.house), farthest = rectFar(r, P.house), exFar = num(ex.farArea) || 0;
      let st, value;
      if (nearest > L.farDistance + 1e-6) { const total = area(r) + exFar; st = cmp(total, L.farArea, 'le'); value = `${m2(r2(total))} more than 20 m from the house`; }
      else if (farthest > L.farDistance + 1e-6) { st = 'check'; value = 'Partly more than 20 m from the house'; }
      else { st = cmp(exFar, L.farArea, 'le'); value = `Within 20 m of the house${exFar ? `; ${m2(exFar)} already further out` : ''}`; }
      ctx.add('en.e.far', e2 ? st : soften(st, true), { value, limit: '10 m² beyond 20 m', note: e2Unsure && !e2 ? 'Applies in a National Park, National Landscape, the Broads or a World Heritage Site. Confirm on Defra’s countryside designations map.' : '' });
    }
    const art23 = yes(s.conservation) || yes(s.park) || yes(s.whs);
    const art23Unsure = unsure(s.conservation) || unsure(s.park) || unsure(s.whs);
    if (art23 || art23Unsure) ctx.add('en.e.side', p.location === 'side' ? (art23 ? 'fail' : 'check') : 'pass', { value: p.location === 'side' ? 'Beside the house' : 'Not beside the house', limit: 'On article 2(3) land: nothing between a side wall and the boundary' });
    return { route: 'none', rect: r };
  }

  // ---------- England: Part 14 Class G ----------
  // MCS 020 a): Lp = Lw + 10 log10(Q / (4 pi r^2)) - barrier attenuation, rounded to 0.1, limit 37.0 dB(A).
  const BARRIER = { none: 0, 't1-none': 10, 't1-partial': 5, 't1-full': 0, 't2-none': 5, 't2-partial': 2.5, 't2-full': 0 };
  function mcs020a(lw, q, r, barrier, units) {
    const LW = num(lw), Q = Number(q), R = num(r);
    if (LW == null || R == null || !(R > 0)) return null;
    if (!(Q === 2 || Q === 4 || Q === 8)) return { lp: null, reason: 'More than three reflecting surfaces does not meet MCS 020 a).' };
    const ab = BARRIER[barrier] || 0;
    const one = LW + 10 * Math.log10(Q / (4 * Math.PI * R * R)) - ab;
    const n = Math.max(1, Number(units) || 1);
    const total = 10 * Math.log10(n * Math.pow(10, one / 10));
    return { lp: Math.round(total * 10) / 10, single: one, ab };
  }
  function englandG(model, ctx, P) {
    const p = model.p, s = model.screen || {}, h = model.house, ex = model.existing || {};
    const L = EN.LIMITS.g;
    const flat = yes(s.flat);
    const units = (Number(p.units) || 1) + (Number(ex.heatPumps) || 0);
    const max = flat ? L.unitsOther : h.type === 'detached' ? L.unitsDetached : L.unitsOther;
    const calc = mcs020a(p.lw, p.q, p.r, p.barrier, p.units);
    if (calc && calc.lp == null) ctx.add('en.g.mcs', 'fail', { value: calc.reason, limit: '37.0 dB(A)' });
    else if (calc) ctx.add('en.g.mcs', calc.lp > L.noise + 1e-6 ? 'fail' : yes(p.mcsDone) ? 'pass' : 'check', { value: `${calc.lp.toFixed(1)} dB(A) on the figures entered`, limit: '37.0 dB(A)', note: yes(p.mcsDone) ? 'Your installer’s completed MCS 020 a) table is the record that counts.' : 'Ask your MCS installer for the completed MCS 020 a) table for every assessment position.' });
    else ctx.add('en.g.mcs', 'check', { value: 'No sound figures entered', note: 'Enter the sound power level and the distance to the nearest neighbour’s window, or ask your installer for the MCS 020 a) table.' });
    ctx.add('en.g.count', units <= max ? 'pass' : 'fail', { value: `${units} on the property`, limit: flat ? 'one at a block of flats' : h.type === 'detached' ? 'two at a detached house' : 'one at a house that is not detached' });
    ctx.add('en.g.wind', yes(p.wind) ? 'fail' : unsure(p.wind) ? 'check' : 'pass', { value: yes(p.wind) ? 'A wind turbine is installed' : 'No wind turbine' });
    const w = num(p.w) || 0, d = num(p.d) || 0, hh = num(p.h) || 0, vol = w * d * hh;
    const vmax = flat ? L.volumeFlats : L.volumeHouse;
    ctx.add('en.g.volume', vol > 0 ? cmp(vol, vmax, 'le') : 'check', { value: `${(Math.round(vol * 100) / 100).toFixed(2)} m³ (${fmt(w)} × ${fmt(d)} × ${fmt(hh)} m)`, limit: `${vmax} m³` });
    if (p.mount === 'pitchedRoof') ctx.add('en.g.roof', 'fail', { value: 'On a pitched roof', limit: 'Not on a pitched roof' });
    else if (p.mount === 'flatRoof') ctx.add('en.g.roof', cmp(num(p.edge), L.flatRoofEdge, 'ge'), { value: `${m(num(p.edge))} from the roof edge`, limit: 'at least 1 m from the edge' });
    else ctx.add('en.g.roof', 'pass', { value: p.mount === 'wall' ? 'On a wall' : 'On the ground' });
    if (yes(s.monument)) ctx.add('en.g.monument', 'fail', { value: 'A scheduled monument' });
    else if (unsure(s.monument)) ctx.add('en.g.monument', 'check', { value: 'Not answered' });
    else ctx.add('en.g.monument', 'pass', { value: 'Not a scheduled monument' });
    if (yes(s.listed)) ctx.add('en.g.listed', 'fail', { value: 'The house is listed', note: 'Class G does not apply. Ask the council about planning permission and listed building consent.' });
    else if (unsure(s.listed)) ctx.add('en.g.listed', 'check', { value: 'Not answered' });
    else ctx.add('en.g.listed', 'pass', { value: 'Not listed' });
    const ca = yes(s.conservation) || yes(s.whs), caUnsure = unsure(s.conservation) || unsure(s.whs);
    if (ca || caUnsure) {
      const bad = (p.mount !== 'ground' && yes(p.frontsHighway)) || yes(p.nearerHighway);
      const open = (p.mount !== 'ground' && unsure(p.frontsHighway)) || unsure(p.nearerHighway);
      ctx.add('en.g.conservation', bad ? (ca ? 'fail' : 'check') : open || !ca ? 'check' : 'pass', { value: bad ? (yes(p.nearerHighway) ? 'Nearer to the road than the house' : 'On a wall or roof facing a road') : 'Away from walls and roofs facing a road', note: !ca ? 'This applies only in a conservation area or World Heritage Site. Confirm the designation.' : '' });
    }
    if (!ca) {
      const bad = p.mount === 'wall' && yes(p.frontsHighway) && yes(p.aboveGround);
      const open = p.mount === 'wall' && (unsure(p.frontsHighway) || (yes(p.frontsHighway) && unsure(p.aboveGround)));
      ctx.add('en.g.wall', bad ? 'fail' : open ? 'check' : 'pass', { value: bad ? 'Above the ground floor on a wall facing a road' : p.mount === 'wall' ? 'Not above the ground floor on a road-facing wall' : 'Not on a road-facing wall' });
    }
    ctx.add('en.g.cooling', p.use === 'cooling' ? 'fail' : p.use === 'heating' || p.use === 'both' ? 'pass' : 'check', { value: p.use === 'cooling' ? 'Used only for cooling (air conditioning)' : p.use === 'both' ? 'Heating and cooling' : p.use === 'heating' ? 'Heating' : 'Use not given', note: p.use === 'cooling' ? 'Class G does not cover a cooling-only unit. Ask the council whether it needs planning permission.' : '' });
    ctx.add('en.g.siting', 'info', { value: 'Applies once installed' });
    return { route: 'none', rect: proposalRect(model, P), mcs: calc };
  }

  // ---------- Ireland ----------
  function earlierIE(model) {
    const ex = model.existing || {}, s = model.screen || {};
    if (!yes(s.previous)) return { foot: 0, floor: 0, above: 0 };
    const foot = (num(ex.extDepth) || 0) * (num(ex.extWidth) || 0), st = Number(ex.extStoreys) || 1;
    return { foot, floor: foot * st, above: foot * Math.max(0, st - 1) };
  }
  function openSpaceIE(model, P, newFoot) {
    const ex = model.existing || {};
    const rearGarden = P.W * P.rear, sideGardens = (P.gapL + P.gapR) * (P.house.y1 - P.house.y0);
    const used = earlierIE(model).foot + (num(ex.outArea) || 0) + (num(ex.hard) || 0) + (newFoot || 0);
    return { total: rearGarden + sideGardens - used, rearGarden, sideGardens, used };
  }
  function irelandC1(model, ctx, P) {
    const p = model.p, h = model.house, jd = model.judge || {}, s = model.screen || {};
    const L = IE.LIMITS.c1;
    const r = proposalRect(model, P);
    const detached = h.type === 'detached';
    const storeys = Number(p.storeys) || 1;
    const prevUnsure = unsure(s.previous);
    if (p.position === 'side') ctx.add('ie.c1.rear', 'fail', { value: 'A side extension', note: 'Class 1 covers extensions to the rear. A side extension needs planning permission.' });
    else if (r.x0 < P.house.x0 - 1e-6 || r.x1 > P.house.x1 + 1e-6) ctx.add('ie.c1.rear', 'check', { value: 'Wider than the house', note: 'Part of it sits beyond a side wall. Ask the council whether it is still an extension to the rear.' });
    else ctx.add('ie.c1.rear', 'pass', { value: 'To the rear of the house' });
    const ground = area(r);
    const above = storeys > 1 ? (num(p.above) > 0 ? num(p.above) : ground) : 0;
    const prev = earlierIE(model);
    const total = ground + above + prev.floor;
    ctx.add('ie.c1.area', soften(cmp(total, L.area, 'le'), prevUnsure), { value: `${m2(r2(total))}${prev.floor ? ` (${fmt(r2(ground + above))} m² new, ${fmt(r2(prev.floor))} m² earlier)` : ''}`, limit: '45 m², with every extension since 1 October 1964', note: prevUnsure ? 'Earlier extensions not confirmed: any built since 1 October 1964 count, with or without permission.' : '' });
    const aboveLimit = detached ? L.aboveDetached : L.aboveTerraceSemi;
    ctx.add('ie.c1.above', soften(cmp(above + prev.above, aboveLimit, 'le'), prevUnsure), { value: m2(r2(above + prev.above)), limit: `${aboveLimit} m² above ground (${detached ? 'detached' : 'terraced or semi-detached'})` });
    const g = gaps(r, P);
    if (storeys > 1) {
      const party = [g.left, g.right].concat(model.plot.rearIsRoad === 'yes' ? [] : [g.rear]);
      const near = Math.min.apply(null, party);
      ctx.add('ie.c1.party', cmp(near, L.partyAbove, 'ge'), { value: `${m(r2(Math.max(0, near)))} from the nearest party boundary`, limit: 'at least 2 m above the ground floor' });
    } else ctx.add('ie.c1.party', 'pass', { value: 'No floor above ground level' });
    const wallLimit = num(h.rearWall) || num(h.eaves);
    ctx.add('ie.c1.walls', cmp(num(p.walls), wallLimit, 'le'), { value: m(num(p.walls)), limit: `${m(wallLimit)}, the ${h.gableRear ? 'side walls' : 'rear wall'} of the house` });
    const roofLimit = p.roof === 'flat' ? num(h.eaves) : num(h.ridge);
    ctx.add('ie.c1.roof', cmp(num(p.height), roofLimit, 'le'), { value: m(num(p.height)), limit: p.roof === 'flat' ? `${m(roofLimit)}, the eaves (flat roof)` : `${m(roofLimit)}, the top of the house roof` });
    const os = openSpaceIE(model, P, ground);
    ctx.add('ie.c1.open', soften(cmp(os.total, L.openSpace, 'ge'), jd.openSpace !== 'yes' || prevUnsure), { value: `${m2(r2(os.total))} left`, limit: 'at least 25 m²', note: joinNotes('Counted from the rear and side gardens, less buildings and parking.', jd.openSpace !== 'yes' ? 'Confirm which areas are private open space for the occupants only.' : '') });
    const face = f => (f === 'rear' ? g.rear : f === 'left' ? g.left : g.right);
    const wg = (p.winGround || []).map(f => [f, face(f)]);
    const wa = storeys > 1 ? (p.winAbove || []).map(f => [f, face(f)]) : [];
    const worst = list => (list.length ? Math.min.apply(null, list.map(x => x[1])) : null);
    ctx.add('ie.c1.winGround', wg.length ? cmp(worst(wg), L.winGround, 'ge') : 'pass', { value: wg.length ? wg.map(([f, d]) => `${f} ${m(r2(d))}`).join(', ') : 'No ground-floor windows', limit: 'at least 1 m from the boundary faced' });
    ctx.add('ie.c1.winAbove', wa.length ? cmp(worst(wa), L.winAbove, 'ge') : 'pass', { value: wa.length ? wa.map(([f, d]) => `${f} ${m(r2(d))}`).join(', ') : 'No windows above ground level', limit: 'at least 8 m from the boundary faced' });
    ctx.add('ie.c1.balcony', yes(p.balcony) ? 'fail' : unsure(p.balcony) ? 'check' : 'pass', { value: yes(p.balcony) ? 'The roof used as a balcony or terrace' : 'Roof not used as a balcony' });
    ctx.add('ie.c1.principal', 'pass', { value: 'The principal house' });
    return { route: 'none', rect: r, openSpace: os };
  }
  function irelandC3(model, ctx, P) {
    const p = model.p, ex = model.existing || {}, jd = model.judge || {};
    const L = IE.LIMITS.c3;
    const r = proposalRect(model, P);
    ctx.add('ie.c3.front', p.location === 'front' ? 'fail' : 'pass', { value: p.location === 'front' ? 'Forward of the front wall' : p.location === 'side' ? 'To the side of the house' : 'In the rear garden' });
    const a = area(r), prev = num(ex.outArea) || 0;
    ctx.add('ie.c3.area', cmp(a + prev, L.area, 'le'), { value: `${m2(r2(a + prev))}${prev ? ` (${fmt(r2(a))} m² new, ${fmt(prev)} m² existing)` : ''}`, limit: '30 m² in total' });
    const os = openSpaceIE(model, P, a);
    ctx.add('ie.c3.open', soften(cmp(os.total, L.openSpace, 'ge'), jd.openSpace !== 'yes'), { value: `${m2(r2(os.total))} left to the rear and side`, limit: 'at least 25 m²' });
    if (p.location === 'side') ctx.add('ie.c3.finish', p.finishes === 'match' ? 'pass' : p.finishes === 'different' ? 'fail' : 'check', { value: p.finishes === 'match' ? 'Finishes match the house' : p.finishes === 'different' ? 'Different finishes' : 'Not decided' });
    else ctx.add('ie.c3.finish', 'pass', { value: 'Not to the side of the house' });
    const pitched = p.roof === 'pitched-tiled';
    ctx.add('ie.c3.height', cmp(num(p.height), pitched ? L.heightPitched : L.heightOther, 'le'), { value: m(num(p.height)), limit: pitched ? '4 m, tiled or slated pitched roof' : '3 m', note: 'Measured from the lowest ground next to it (article 5(2)).' });
    const uses = { store: 'Storage', office: 'A home office', gym: 'A gym', hobby: 'A hobby room', garage: 'A garage' };
    if (p.use === 'habitation') ctx.add('ie.c3.use', 'fail', { value: 'Somewhere to live or sleep', note: 'Class 3 does not allow habitation. Class 3A covers a detached house in the rear garden, with its own conditions.' });
    else if (p.use === 'animals') ctx.add('ie.c3.use', 'fail', { value: 'Keeping animals that Class 3 excludes' });
    else ctx.add('ie.c3.use', uses[p.use] ? 'pass' : 'check', { value: uses[p.use] || 'Use not given' });
    return { route: 'none', rect: r, openSpace: os };
  }
  const day = s => { if (!s || !/^\d{4}-\d{2}-\d{2}$/.test(s)) return null; const [y, mo, d] = s.split('-').map(Number); return Date.UTC(y, mo - 1, d) / 864e5; };
  function datesIE(ctx, p, L, idPeriod, idNotice) {
    const start = day(p.start), finish = day(p.finish), notice = day(p.notice);
    let st, value;
    if (start == null || finish == null) { st = 'check'; value = 'Dates not given'; }
    else { st = start < day(L.start) || finish > day(L.end) || finish < start ? 'fail' : 'pass'; value = `Starts ${p.start}, finishes ${p.finish}`; }
    ctx.add(idPeriod, st, { value, limit: '16 July 2026 to 31 December 2030' });
    if (start == null || notice == null) ctx.add(idNotice, 'check', { value: 'Notice date not given', limit: 'at least 14 days before, with the Eircode' });
    else { const gap = start - notice; ctx.add(idNotice, gap >= L.noticeDays ? 'pass' : 'fail', { value: `${gap} days before work starts`, limit: 'at least 14 days before, with the Eircode' }); }
  }
  function irelandC3A(model, ctx, P) {
    const p = model.p, ex = model.existing || {}, jd = model.judge || {};
    const L = IE.LIMITS.c3a;
    const r = proposalRect(model, P);
    ctx.add('ie.c3a.rear', p.location === 'rear' ? 'pass' : 'fail', { value: p.location === 'rear' ? 'In the rear garden' : p.location === 'side' ? 'To the side of the house' : 'In the front garden' });
    datesIE(ctx, p, L, 'ie.c3a.period', 'ie.c3a.notice');
    const c = (id, ok, good, bad) => ctx.add(id, ok === true ? 'pass' : ok === false ? 'fail' : 'check', { value: ok === true ? good : ok === false ? bad : 'Not confirmed' });
    c('ie.c3a.occupancy', tri(p.occupancy), 'Occupied with the main house, not sold separately', 'To be sold or used apart from the main house');
    c('ie.c3a.temporary', no(p.temporary) ? true : yes(p.temporary) ? false : null, 'A permanent building', 'A caravan, mobile home or other temporary structure');
    const pitched = p.roof === 'pitched-tiled';
    ctx.add('ie.c3a.height', cmp(num(p.height), pitched ? L.heightPitched : L.heightOther, 'le'), { value: m(num(p.height)), limit: pitched ? '4 m, tiled or slated pitched roof' : '3 m' });
    const a = area(r), prev = num(ex.outArea) || 0;
    ctx.add('ie.c3a.area', a < L.min - 1e-6 ? 'fail' : cmp(a + prev, L.max, 'le'), { value: `${m2(r2(a))}${prev ? `; ${fmt(r2(a + prev))} m² with the Class 3 structures already there` : ''}`, limit: 'at least 32 m², at most 45 m² in total' });
    c('ie.c3a.split', no(p.split) ? true : yes(p.split) ? false : null, 'The house has not been subdivided', 'The house has been subdivided under Class 1A');
    const os = openSpaceIE(model, P, a);
    ctx.add('ie.c3a.open', soften(cmp(os.total, L.openSpace, 'ge'), jd.openSpace !== 'yes'), { value: `${m2(r2(os.total))} left`, limit: 'at least 25 m²' });
    c('ie.c3a.access', no(p.newAccess) && yes(p.ownAccess) ? true : yes(p.newAccess) || no(p.ownAccess) ? false : null, 'No new access onto a road; its own path within the plot', yes(p.newAccess) ? 'A new access onto a road' : 'No independent access within the plot');
    c('ie.c3a.utilities', p.utilities === 'shared' ? true : p.utilities === 'separate' ? false : null, 'Served through the main house’s connections', 'Its own utility connection');
    if (p.wastewater === 'mains') ctx.add('ie.c3a.wastewater', 'pass', { value: 'On the public sewer' });
    else ctx.add('ie.c3a.wastewater', 'check', { value: p.wastewater === 'septic' ? 'Septic tank or other on-site treatment' : 'Not given', note: 'Confirm the percolation area stays clear and the system has the capacity, under the EPA Code of Practice.' });
    const g = gaps(r, P);
    const toHouse = rectGap(r, P.house), exR = existingRect(model, P), toExt = exR && yes((model.screen || {}).previous) ? rectGap(r, exR) : Infinity;
    const near = Math.min(g.left, g.right, g.rear, toHouse, toExt);
    ctx.add('ie.c3a.gap', cmp(near, L.gap, 'ge'), { value: `${m(r2(Math.max(0, near)))} from the nearest wall or boundary`, limit: 'at least 0.6 m', note: 'Includes the walls of the house. Check sheds and other structures too.' });
    const facing = f => (f === 'rear' ? g.rear : f === 'left' ? g.left : f === 'right' ? g.right : g.front);
    const faces = (p.winFaces || []).map(f => [f, facing(f)]);
    const worst = faces.length ? Math.min.apply(null, faces.map(x => x[1])) : null;
    ctx.add('ie.c3a.windows', faces.length ? cmp(worst, L.windowGap, 'ge') : 'pass', { value: faces.length ? faces.map(([f, d]) => `${f === 'front' ? 'towards the house' : f} ${m(r2(d))}`).join(', ') : 'No windows entered', limit: 'at least 0.6 m from the boundary faced' });
    c('ie.c3a.letting', no(p.letting) ? true : yes(p.letting) ? false : null, 'Not for short-term letting', 'For short-term letting');
    c('ie.c3a.owner', tri(p.owner), 'The owner’s sole or main residence', 'Not the owner’s main residence');
    return { route: 'notice', rect: r, openSpace: os };
  }
  function irelandC1A(model, ctx) {
    const p = model.p, L = IE.LIMITS.c1a;
    datesIE(ctx, p, L, 'ie.c1a.period', 'ie.c1a.notice');
    const units = Number(p.units) || 0;
    ctx.add('ie.c1a.units', units ? (units <= L.units ? 'pass' : 'fail') : 'check', { value: units ? `${units} units` : 'not given', limit: 'two units' });
    const areas = [num(p.area1), num(p.area2)];
    const smallest = areas.some(a => a == null) ? null : Math.min(areas[0], areas[1]);
    ctx.add('ie.c1a.size', cmp(smallest, L.minArea, 'ge'), { value: areas.map(m2).join(' and '), limit: 'at least 32 m² each' });
    ctx.add('ie.c1a.self', yes(p.self) ? 'pass' : no(p.self) ? 'fail' : 'check', { value: yes(p.self) ? 'Each unit self-contained' : no(p.self) ? 'Shares internal space beyond access' : 'Not confirmed' });
    ctx.add('ie.c1a.dad', no(p.dad) ? 'pass' : yes(p.dad) ? 'fail' : 'check', { value: no(p.dad) ? 'No Class 3A house in the garden' : yes(p.dad) ? 'A Class 3A house has been built' : 'Not confirmed' });
    return { route: 'notice', rect: null };
  }
  function irelandC2d(model, ctx, P) {
    const p = model.p, ex = model.existing || {};
    const L = IE.LIMITS.c2d;
    ctx.add('ie.c2d.type', p.use === 'cooling' ? 'check' : p.use === 'heating' || p.use === 'both' ? 'pass' : 'check', { value: p.use === 'cooling' ? 'Used only for cooling (air conditioning)' : p.use === 'both' ? 'An air source heat pump that heats and cools' : p.use === 'heating' ? 'An air source heat pump' : 'Use not given', note: p.use === 'cooling' ? 'Class 2(d) describes heat pumps. For a cooling-only unit, ask the council or request a section 5 declaration.' : '' });
    const ground = num(p.ground);
    ctx.add('ie.c2d.ground', ground == null ? 'check' : cmp(Math.abs(ground), L.ground, 'le'), { value: ground ? `${m(Math.abs(ground))} change in ground level` : 'No change in ground level', limit: 'no more than 1 m' });
    const w = num(p.w) || 0, d = num(p.d) || 0, hh = num(p.h) || 0, prev = num(ex.hpArea) || 0;
    const foot = w * d + prev, face = w * hh + prev;
    let st;
    if (!(w && d && hh)) st = 'check';
    else if (Math.max(foot, face) <= L.area + 1e-6) st = 'pass';
    else if (Math.min(foot, face) > L.area + 1e-6) st = 'fail';
    else st = 'check';
    ctx.add('ie.c2d.area', st, { value: `${m2(r2(foot))} footprint, ${m2(r2(face))} front face${prev ? ', with the existing units' : ''}`, limit: '2.5 m² in total', note: st === 'check' && w && d && hh ? 'The Regulations do not say which area is measured. One reading passes and one fails, so ask the council.' : '' });
    if (p.mount === 'wall' || p.mount === 'roof') ctx.add('ie.c2d.edge', cmp(num(p.edge), L.edge, 'ge'), { value: `${m(num(p.edge))} from the nearest edge of the ${p.mount}`, limit: 'at least 50 cm' });
    else ctx.add('ie.c2d.edge', 'pass', { value: 'On the ground' });
    ctx.add('ie.c2d.road', yes(p.road) ? 'fail' : unsure(p.road) ? 'check' : 'pass', { value: yes(p.road) ? 'Over a public road or footpath' : 'Within the property' });
    const lvl = num(p.noise), bg = num(p.background);
    const limit = bg != null ? Math.max(L.noise, bg + L.aboveBackground) : L.noise;
    let ns = 'check', nv = 'No noise figure entered';
    if (lvl != null) { ns = lvl <= limit + 1e-6 ? 'pass' : bg == null ? 'check' : 'fail'; nv = `${fmt(lvl)} dB(A) at the nearest neighbouring house`; }
    const est = mcs020a(p.lw, p.q, p.r, p.barrier, 1);
    ctx.add('ie.c2d.noise', ns, { value: nv, limit: bg != null ? `${fmt(limit)} dB(A) (background ${fmt(bg)} plus 5)` : '43 dB(A), or background plus 5 if higher', note: joinNotes(ns === 'check' && lvl != null ? 'Above 43 dB(A): measure the background noise to see whether the higher limit applies.' : '', est && est.lp != null && lvl == null ? `A free-field estimate from the sound power level gives about ${est.lp.toFixed(1)} dB(A). Ask your installer for the figure at the neighbour’s house.` : '') });
    return { route: 'none', rect: proposalRect(model, P), mcs: est };
  }

  // ---------- Evaluate ----------
  function validate(model) {
    const errs = [];
    const h = (model && model.house) || {};
    if (!model || !PROJECTS[model.kind]) return ['Choose a project.'];
    if (PROJECTS[model.kind].j !== model.j) errs.push('That project belongs to the other jurisdiction.');
    for (const [k, label] of [['width', 'house width'], ['depth', 'house depth'], ['eaves', 'eaves height'], ['ridge', 'roof height']]) if (!(num(h[k]) > 0)) errs.push(`Enter the ${label}.`);
    if (num(h.ridge) != null && num(h.eaves) != null && num(h.ridge) < num(h.eaves) - 1e-6) errs.push('The roof height must be at least the eaves height.');
    if (errs.length || model.kind === 'ie-split') return errs;
    const P = plan(model), r = proposalRect(model, P), p = model.p || {};
    const dims = { 'en-rear': ['width', 'depth', 'height', 'eaves'], 'en-side': ['width', 'depth', 'height', 'eaves'], 'ie-ext': ['width', 'depth', 'height', 'walls'], 'en-out': ['width', 'depth', 'height', 'eaves'], 'ie-shed': ['width', 'depth', 'height'], 'ie-dad': ['width', 'depth', 'height'], 'en-ashp': ['w', 'd', 'h'], 'ie-hp': ['w', 'd', 'h'] }[model.kind] || [];
    for (const k of dims) if (!(num(p[k]) > 0)) { errs.push('Enter every size of the project.'); break; }
    if (errs.length) return errs;
    if (model.kind === 'en-side' && (p.side === 'left' ? P.att.left : P.att.right)) errs.push('That side of the house is attached to the neighbour. Choose the other side.');
    else if (r && !inside(r, P)) errs.push('As entered, the project goes past a boundary of the plot. Check the plot and project sizes.');
    else if (r && model.kind !== 'en-side' && overlaps(r, P.house)) errs.push('As entered, the project overlaps the house. Move it into the garden.');
    if (model.kind === 'en-rear' || model.kind === 'ie-ext') {
      if ((num(p.offset) || 0) < -1e-6 || (num(p.offset) || 0) + (num(p.width) || 0) > (P.house.x1 - P.house.x0) + Math.max(P.gapL, P.gapR) + 1e-6) errs.push('The extension is wider than the space behind the house.');
    }
    return errs;
  }

  function evaluate(model) {
    const errors = validate(model);
    if (errors.length) return { ok: false, errors, results: [], counts: { pass: 0, fail: 0, check: 0, info: 0 }, verdict: { status: 'incomplete', title: 'Finish the drawing first', text: errors[0] } };
    const ctx = makeCtx(model);
    const P = plan(model);
    const flags = screening(model, ctx);
    let extra = {};
    switch (model.kind) {
      case 'en-rear': case 'en-side': extra = englandA(model, ctx, P); break;
      case 'en-out': extra = englandE(model, ctx, P); break;
      case 'en-ashp': extra = englandG(model, ctx, P); break;
      case 'ie-ext': extra = irelandC1(model, ctx, P); break;
      case 'ie-shed': extra = irelandC3(model, ctx, P); break;
      case 'ie-dad': extra = irelandC3A(model, ctx, P); break;
      case 'ie-hp': extra = irelandC2d(model, ctx, P); break;
      case 'ie-split': extra = irelandC1A(model, ctx, P); break;
    }
    const results = ctx.out;
    const counts = { pass: 0, fail: 0, check: 0, info: 0 };
    results.forEach(r => { counts[r.status]++; });
    return { ok: true, errors: [], results, counts, verdict: verdictFor(model, counts, extra.route, flags), plan: P, rect: extra.rect || null, existingRect: yes((model.screen || {}).previous) ? existingRect(model, P) : null, route: extra.route, flags, mcs: extra.mcs || null, openSpace: extra.openSpace || null, rulesVersion: ctx.R.RULES_VERSION, rulesAsOf: ctx.R.RULES_AS_OF };
  }

  function verdictFor(model, counts, route, flags) {
    const en = model.j === 'en';
    const formal = en ? 'For certainty, apply to the council for a lawful development certificate for proposed works: £274 for householder works from 1 April 2026, decided within 8 weeks.' : 'For certainty, ask the council for a declaration under section 5: €80, answered within 4 weeks.';
    const notFormal = 'This is not a formal decision.';
    const designated = flags.filter(f => f.answer === 'yes').map(f => f.key);
    const plural = (n, one, many) => `${n} ${n === 1 ? one : many}`;
    if (counts.fail) return { status: 'fail', title: en ? 'Needs planning permission as drawn' : 'Not exempt as drawn', text: `${plural(counts.fail, 'condition fails', 'conditions fail')}. Change the design to fit, or apply for planning permission. ${notFormal}`, formal, designated };
    if (en && route === 'prior') return { status: 'prior', title: 'Fits with the larger home extension prior approval', text: `Tell the council before you start; it consults the neighbours and has 42 days.${counts.check ? ` ${plural(counts.check, 'point needs', 'points need')} a check.` : ''} ${notFormal}`, formal, designated };
    if (counts.check) return { status: 'check', title: en ? 'Fits the limits entered, with points to check' : 'Fits the conditions entered, with points to check', text: `${plural(counts.check, 'point needs', 'points need')} a check before you rely on this. ${notFormal}`, formal, designated };
    const notice = route === 'notice' ? ' Send the council the 14-day notice before work starts.' : '';
    return { status: 'pass', title: en ? 'Fits permitted development as entered' : 'Fits the exemption as entered', text: `Every condition this tool checks passes.${notice} ${notFormal}`, formal, designated };
  }

  // ---------- Share link: the whole project in the URL fragment, never sent to a server ----------
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
      if (!mdl || mdl.v !== 1 || !PROJECTS[mdl.kind] || PROJECTS[mdl.kind].j !== mdl.j) return null;
      return mdl;
    } catch (e) { return null; }
  }

  // The building regulations points that apply to a project (kept apart from planning)
  function buildingFor(model) {
    const k = model.kind, R = RULES[model.j];
    const pick = model.j === 'en'
      ? (k === 'en-out' ? /^en\.br\.(out15|out30|sleep|other)$/ : k === 'en-ashp' ? /^en\.br\.other$/ : /^en\.br\.(ext|other)$/)
      : (k === 'ie-dad' ? /^ie\.bc\.(applies|dad)$/ : k === 'ie-split' ? /^ie\.bc\.(applies|split)$/ : k === 'ie-ext' ? /^ie\.bc\.(applies|ext45)$/ : /^ie\.bc\.applies$/);
    return R.BUILDING.filter(b => pick.test(b.id));
  }

  return { PROJECTS, SCREEN_KEYS, QUESTIONS, RULES, buildingFor, sample, fresh, plan, proposalRect, existingRect, evaluate, validate, mcs020a, encode, decode, attachedSides, rectGap, area, fmt };
});
