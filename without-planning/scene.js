/* Without Planning: the 3D scene. An ES module loaded only when the 3D view starts (never on first paint).
 * Draws the plot with its red site line, the house, the neighbours it is joined to, the proposal, and the envelope the
 * national rules allow (translucent survey-blue volumes, red hatched boundary bands). Failing conditions turn their
 * part red. Plan and elevation views use an orthographic camera, like the drawings a council asks for.
 * The same module renders the offline hero images and the views in the Pro PDF.
 * three.js 0.185.1 (MIT), vendored in ./vendor with its licence. */
import * as THREE from './vendor/three.module.min.js';

const C = {
  film: 0xedf1f5, ground: 0xe3e8ee, road: 0xb4bcc5, kerb: 0xd3d9df, lawn: 0x74b977, lawnNeighbour: 0xc9d8c6,
  brick: 0xb4553a, brickDark: 0x96462f, slate: 0x3a4450, ink: 0x1e2731, white: 0xf6f8fa, glass: 0x2a3743,
  red: 0xd9262b, redSoft: 0xf3c9ca, blue: 0x1f48c7, neighbour: 0xcfd6de, neighbourRoof: 0x8a939d, unit2: 0xd99a62,
};
const EPS = 0.004;

function disposeTree(obj) {
  obj.traverse(o => {
    if (o.geometry) o.geometry.dispose();
    if (o.material) (Array.isArray(o.material) ? o.material : [o.material]).forEach(m => { if (m.map) m.map.dispose(); m.dispose(); });
  });
}
function boxMesh(w, h, d, color, opts = {}) {
  const geo = new THREE.BoxGeometry(Math.max(w, 0.001), Math.max(h, 0.001), Math.max(d, 0.001));
  const mat = opts.transparent
    ? new THREE.MeshBasicMaterial({ color, transparent: true, opacity: opts.opacity ?? 0.15, depthWrite: false, side: THREE.DoubleSide })
    : new THREE.MeshStandardMaterial({ color, roughness: opts.roughness ?? 0.9, metalness: 0 });
  const m = new THREE.Mesh(geo, mat);
  m.castShadow = !opts.transparent && opts.cast !== false;
  m.receiveShadow = !opts.transparent;
  return m;
}
function edges(mesh, color, opts = {}) {
  const g = new THREE.EdgesGeometry(mesh.geometry, 20);
  const mat = opts.dashed
    ? new THREE.LineDashedMaterial({ color, dashSize: 0.3, gapSize: 0.2, transparent: true, opacity: opts.opacity ?? 0.95 })
    : new THREE.LineBasicMaterial({ color, transparent: true, opacity: opts.opacity ?? 0.85 });
  const l = new THREE.LineSegments(g, mat);
  if (opts.dashed) l.computeLineDistances();
  l.position.copy(mesh.position); l.rotation.copy(mesh.rotation); l.scale.copy(mesh.scale);
  return l;
}
function roofGeometry(type, w, d, e, r) {
  const x0 = -w / 2, x1 = w / 2, z0 = -d / 2, z1 = d / 2;
  let pos, idx;
  if (type === 'gable') {
    pos = [x0, e, z0, x1, e, z0, x1, e, z1, x0, e, z1, x0, r, 0, x1, r, 0];
    idx = [0, 4, 5, 0, 5, 1, 3, 2, 5, 3, 5, 4, 0, 3, 4, 1, 5, 2];
  } else if (type === 'hip') {
    const inset = Math.min(w, d) / 2;
    const rx0 = Math.min(0, x0 + inset), rx1 = Math.max(0, x1 - inset);
    pos = [x0, e, z0, x1, e, z0, x1, e, z1, x0, e, z1, rx0, r, 0, rx1, r, 0];
    idx = [0, 4, 5, 0, 5, 1, 3, 2, 5, 3, 5, 4, 0, 3, 4, 1, 5, 2];
  } else { // mono: high at z0 (against the house), low at z1
    pos = [x0, r, z0, x1, r, z0, x1, e, z1, x0, e, z1, x0, e, z0, x1, e, z0];
    idx = [0, 3, 2, 0, 2, 1, 0, 4, 3, 1, 2, 5, 4, 5, 2, 4, 2, 3];
  }
  let g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setIndex(idx);
  g = g.toNonIndexed();
  g.computeVertexNormals();
  return g;
}
// alongZ: the ridge runs front to back (a gable-fronted house) instead of across the width
function roofMesh(type, w, d, e, r, color, alongZ) {
  const m = new THREE.Mesh(roofGeometry(type, alongZ ? d : w, alongZ ? w : d, e, r), new THREE.MeshStandardMaterial({ color, roughness: 0.78, side: THREE.DoubleSide }));
  if (alongZ) m.rotation.y = Math.PI / 2;
  m.castShadow = true; m.receiveShadow = true;
  return m;
}
let hatchTex = null;
function hatch(strong) {
  // diagonal red hatching, as a drawing marks a restricted zone
  const c = document.createElement('canvas'); c.width = c.height = 64;
  const x = c.getContext('2d');
  x.fillStyle = strong ? 'rgba(217,38,43,0.30)' : 'rgba(217,38,43,0.10)'; x.fillRect(0, 0, 64, 64);
  x.strokeStyle = strong ? 'rgba(217,38,43,0.95)' : 'rgba(217,38,43,0.75)'; x.lineWidth = strong ? 5 : 3.2;
  for (let i = -64; i <= 128; i += 16) { x.beginPath(); x.moveTo(i, 64); x.lineTo(i + 64, 0); x.stroke(); }
  const t = new THREE.CanvasTexture(c);
  t.wrapS = t.wrapT = THREE.RepeatWrapping; t.anisotropy = 4; t.colorSpace = THREE.SRGBColorSpace;
  return t;
}
function groundRect(x0, z0, x1, z1, color, y = EPS, opts = {}) {
  const w = Math.max(x1 - x0, 0.001), d = Math.max(z1 - z0, 0.001);
  const g = new THREE.PlaneGeometry(w, d);
  let mat;
  if (opts.hatch) {
    const t = hatch(opts.strong); t.repeat.set(w / 1.2, d / 1.2);
    mat = new THREE.MeshBasicMaterial({ map: t, transparent: true, depthWrite: false });
  } else if (opts.transparent) mat = new THREE.MeshBasicMaterial({ color, transparent: true, opacity: opts.opacity ?? 0.2, depthWrite: false });
  else mat = new THREE.MeshStandardMaterial({ color, roughness: 1 });
  const m = new THREE.Mesh(g, mat);
  m.rotation.x = -Math.PI / 2;
  m.position.set((x0 + x1) / 2, y, (z0 + z1) / 2);
  m.receiveShadow = !opts.transparent && !opts.hatch;
  return m;
}
function ribbon(points, color, width, y = 0.02) {
  const grp = new THREE.Group();
  for (let i = 0; i < points.length - 1; i++) {
    const a = points[i], b = points[i + 1];
    const len = Math.hypot(b[0] - a[0], b[1] - a[1]);
    const m = new THREE.Mesh(new THREE.PlaneGeometry(len + width, width), new THREE.MeshBasicMaterial({ color }));
    m.rotation.x = -Math.PI / 2;
    m.rotation.z = -Math.atan2(b[1] - a[1], b[0] - a[0]);
    m.position.set((a[0] + b[0]) / 2, y, (a[1] + b[1]) / 2);
    grp.add(m);
  }
  return grp;
}
function line(a, b, color) {
  return new THREE.Line(new THREE.BufferGeometry().setFromPoints([new THREE.Vector3(...a), new THREE.Vector3(...b)]), new THREE.LineBasicMaterial({ color }));
}

export function createScene(canvas, opts = {}) {
  const reduced = opts.reducedMotion ?? (typeof matchMedia === 'function' && matchMedia('(prefers-reduced-motion: reduce)').matches);
  const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, preserveDrawingBuffer: !!opts.preserve, powerPreference: 'low-power' });
  renderer.setPixelRatio(Math.min(opts.pixelRatio || window.devicePixelRatio || 1, 2));
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = THREE.PCFShadowMap;
  const scene = new THREE.Scene();
  scene.background = new THREE.Color(C.film);
  const persp = new THREE.PerspectiveCamera(32, 1, 0.1, 500);
  const ortho = new THREE.OrthographicCamera(-10, 10, 10, -10, 0.1, 600);
  let camera = persp;
  scene.add(new THREE.HemisphereLight(0xffffff, 0xaeb8c2, 1.75));
  const sun = new THREE.DirectionalLight(0xffffff, 2.4);
  sun.castShadow = true;
  sun.shadow.mapSize.set(2048, 2048);
  sun.shadow.bias = -0.0005; sun.shadow.normalBias = 0.03;
  scene.add(sun, sun.target);

  const world = new THREE.Group();
  scene.add(world);
  const labelsLayer = opts.labels || null;
  let labels = [];
  let box = { x0: -5, x1: 5, z0: -10, z1: 10, y1: 8 }, boxAll = box, boxProject = box, ptsAll = [], ptsProject = [], fitPts = [];
  const orbit = { theta: -1.02, phi: 0.92, radius: 40, target: new THREE.Vector3() };
  let view = 'persp', userZoom = 1, lastSide = 0;
  let dirty = true, raf = 0, intro = null;

  // ---------- Build the model ----------
  function build(model, res, E) {
    disposeTree(world); world.clear();
    labels = [];
    const P = res && res.plan ? res.plan : E.plan(model);
    const W = P.W, L = P.L, H = P.house;
    const X = x => x - W / 2, Z = y => y - L / 2;
    const fails = new Set((res && res.results ? res.results : []).filter(r => r.status === 'fail').map(r => r.id));
    const has = re => [...fails].some(id => re.test(id));
    const proposalBad = has(/^(en\.a\.(height|eaves|front|depth1|height1|depth2|side|art23|extras)|en\.e\.(height|eaves|storeys|front|far|side|incidental)|en\.g\.(volume|roof|count|cooling|conservation|wall|listed|monument)|ie\.c1\.(rear|area|above|walls|roof|balcony)|ie\.c3\.(front|area|height|use|finish)|ie\.c3a\.(rear|height|area|temporary)|ie\.c2d\.(area|edge|road|ground)|ie\.c1a\.(units|size|self))$/);
    const bandBad = has(/^(en\.a\.(eaves2m|rear7)|en\.e\.height|ie\.c1\.(party|winGround|winAbove)|ie\.c3a\.(gap|windows))$/);
    const gardenBad = has(/^(en\.a\.coverage|en\.e\.coverage|ie\.c1\.open|ie\.c3\.open|ie\.c3a\.open)$/);
    const noiseBad = has(/^(en\.g\.mcs|ie\.c2d\.noise)$/);
    const h = model.house, hh = Number(h.eaves) || 5, hr = Math.max(Number(h.ridge) || hh, hh + 0.2);
    const hw = H.x1 - H.x0, hd = H.y1 - H.y0;
    const k = model.kind, p = model.p || {};

    // ground, road and pavement in front of the plot
    const ext = Math.max(W, L) * 2.2;
    world.add(groundRect(-ext, -ext, ext, ext, C.ground, 0));
    world.add(groundRect(-ext, Z(-8), ext, Z(-2), C.road, 0.006));
    world.add(groundRect(-ext, Z(-2), ext, Z(0), C.kerb, 0.008));
    world.add(groundRect(X(-W), Z(0), X(0) - 0.08, Z(L), C.lawnNeighbour, 0.004));
    world.add(groundRect(X(W) + 0.08, Z(0), X(2 * W), Z(L), C.lawnNeighbour, 0.004));
    const neighbour = x0 => {
      const g = new THREE.Group();
      const body = boxMesh(hw, hh, hd, C.neighbour); body.position.set(x0 + hw / 2, hh / 2, Z(H.y0) + hd / 2); g.add(body);
      g.add(edges(body, 0x9aa3ad, { opacity: 0.6 }));
      if (h.roof !== 'flat') { const rf = roofMesh(h.roof === 'hip' ? 'hip' : 'gable', hw + 0.02, hd + 0.5, hh, hr, C.neighbourRoof, !!h.gableRear); rf.position.set(x0 + hw / 2, 0, Z(H.y0) + hd / 2); g.add(rf); }
      return g;
    };
    if (P.att.left) world.add(neighbour(X(H.x0) - hw));
    if (P.att.right) world.add(neighbour(X(H.x1)));
    // the plot: lawn, then the red site line
    world.add(groundRect(X(0), Z(0), X(W), Z(L), gardenBad ? 0xecc0bd : C.lawn, 0.01));
    world.add(ribbon([[X(0), Z(0)], [X(W), Z(0)], [X(W), Z(L)], [X(0), Z(L)], [X(0), Z(0)]], C.red, 0.18));
    // the house: brick walls, slate roof, a door and windows front and rear, drawn with edges like a model
    const walls = boxMesh(hw, hh, hd, C.brick);
    walls.position.set(X(H.x0) + hw / 2, hh / 2, Z(H.y0) + hd / 2);
    world.add(walls, edges(walls, 0x5b2a1c, { opacity: 0.55 }));
    if (h.roof === 'flat') {
      const ph = Math.max(0.25, hr - hh);
      const par = boxMesh(hw + 0.1, ph, hd + 0.1, C.slate); par.position.set(walls.position.x, hh + ph / 2, walls.position.z); world.add(par, edges(par, C.ink, { opacity: 0.5 }));
    } else {
      const rf = roofMesh(h.roof === 'hip' ? 'hip' : 'gable', hw + 0.5, hd + 0.5, hh, hr, C.slate, !!h.gableRear);
      rf.position.set(walls.position.x, 0, walls.position.z); world.add(rf, edges(rf, C.ink, { opacity: 0.6 }));
    }
    const win = (x, z, y, w, ht, facing) => { const m = boxMesh(w, ht, 0.07, C.glass, { cast: false }); m.position.set(x, y, z + facing * 0.035); world.add(m); };
    const floors = Math.max(1, Math.min(3, Math.round(hh / 2.6)));
    for (let f = 0; f < floors; f++) {
      const y = 1.4 + f * 2.6;
      for (const fx of [0.27, 0.73]) { win(X(H.x0) + hw * fx, Z(H.y0), y, Math.min(1.3, hw * 0.22), 1.25, -1); win(X(H.x0) + hw * fx, Z(H.y1), y, Math.min(1.3, hw * 0.22), 1.25, 1); }
    }
    const door = boxMesh(0.95, 2.1, 0.09, C.ink, { cast: false }); door.position.set(X(H.x0) + hw * 0.5, 1.05, Z(H.y0) - 0.045); world.add(door);
    if (res && res.existingRect) {
      const r = res.existingRect, ew = r.x1 - r.x0, ed = r.y1 - r.y0, eh = Number(model.existing.extHeight) || 3;
      const b = boxMesh(ew, eh, ed, C.brickDark); b.position.set(X(r.x0) + ew / 2, eh / 2, Z(r.y0) + ed / 2); world.add(b, edges(b, 0x4a2216, { opacity: 0.6 }));
      addLabel([X(r.x0) + ew / 2, eh + 0.2, Z(r.y0) + ed / 2], 'Earlier extension', 'info', 1);
    }

    // ---------- the envelope the rules allow, and the boundary bands ----------
    const focus = [];
    const env = (x0, y0, x1, y1, top, label, o = {}) => {
      if (!(x1 > x0 && y1 > y0 && top > 0)) return;
      if (!o.faint || k === 'en-rear') focus.push([X(x0), Z(y0), X(x1), Z(y1), top]);
      const m = boxMesh(x1 - x0, top, y1 - y0, C.blue, { transparent: true, opacity: o.opacity ?? 0.12 });
      m.position.set(X(x0) + (x1 - x0) / 2, top / 2 + 0.012, Z(y0) + (y1 - y0) / 2);
      m.scale.set(1.006, 1.004, 1.006);
      m.userData.envelope = true;
      const e = edges(m, C.blue, { dashed: true, opacity: o.faint ? 0.55 : 0.95 }); e.userData.envelope = true;
      world.add(m, e);
      if (label) addLabel([X(x0) + (x1 - x0) / 2, top + 0.1, Z(y1)], label, 'limit', 3);
    };
    const band = (width, sides, label, extent) => {
      const y0 = extent ? extent[0] : 0, y1 = extent ? extent[1] : L;
      const o = { hatch: true, strong: bandBad };
      if (sides.includes('left')) world.add(groundRect(X(0), Z(y0), X(Math.min(width, W)), Z(y1), C.red, 0.03, o));
      if (sides.includes('right')) world.add(groundRect(X(Math.max(0, W - width)), Z(y0), X(W), Z(y1), C.red, 0.031, o));
      if (sides.includes('rear')) world.add(groundRect(X(Math.min(width, W)), Z(Math.max(y0, L - width)), X(Math.max(0, W - width)), Z(L), C.red, 0.032, o));
      if (label) addLabel([X(W) - Math.min(width, W) / 2, 0.15, Z(L) - Math.min(width, L) * 0.5], label, bandBad ? 'bad' : 'band', bandBad ? 5 : 2);
    };
    const R = E.RULES[model.j].LIMITS;
    if (k === 'en-rear') {
      const det = h.type === 'detached';
      const art23 = ['conservation', 'park', 'whs', 'sssi'].some(key => (model.screen || {})[key] === 'yes');
      const two = Number(p.storeys) > 1;
      const base = two ? R.a.twoStoreyDepth : det ? R.a.depthDetached : R.a.depthOther;
      const top = two ? Math.min(hr, hh + 1.5) : Math.min(R.a.singleHeight, hr);
      env(H.x0, H.y1, H.x1, Math.min(L, H.y1 + base), top, `${base} m limit`);
      if (!two && !art23) {
        const far = Math.min(L, H.y1 + (det ? R.a.largerDetached : R.a.largerOther));
        env(H.x0, H.y1 + base, H.x1, far, top, null, { opacity: 0.05, faint: true });
        addLabel([X(H.x0) + (H.x1 - H.x0) / 2, 0.1, Z(far)], `${det ? R.a.largerDetached : R.a.largerOther} m with prior approval`, 'limit', 3);
      }
      band(R.a.nearBoundary, ['left', 'right', 'rear'], 'Within 2 m of a boundary: eaves 3 m', [H.y1, L]);
      if (two) band(R.a.rearBoundary, ['rear'], 'No two storeys within 7 m', [H.y1, L]);
    } else if (k === 'en-side') {
      const half = hw * R.a.sideWidthShare, right = p.side !== 'left';
      env(right ? H.x1 : H.x0 - half, H.y0, right ? H.x1 + half : H.x0, H.y1, R.a.sideHeight, 'Half the house width, 4 m high');
      band(R.a.nearBoundary, [right ? 'right' : 'left'], 'Within 2 m: eaves 3 m', [H.y0, L]);
    } else if (k === 'en-out') {
      const dual = p.roof === 'dual' || p.roof === 'hipped';
      const g = R.e.nearBoundary;
      env(Math.min(g, W / 2), H.y1 + 0.3, Math.max(W - g, W / 2), L - g, dual ? R.e.dualPitched : R.e.other, dual ? '4 m with a dual-pitched roof' : '3 m with this roof', { opacity: 0.06, faint: true });
      band(g, ['left', 'right', 'rear'], 'Within 2 m of a boundary: 2.5 m high', [H.y1, L]);
    } else if (k === 'ie-ext') {
      const width = Number(p.width) || hw;
      const earlier = model.screen && model.screen.previous === 'yes' ? (Number(model.existing.extDepth) || 0) * (Number(model.existing.extWidth) || 0) * (Number(model.existing.extStoreys) || 1) : 0;
      const room = Math.max(0, R.c1.area - earlier);
      const depth = Math.min(L - H.y1, room / Math.max(width, 0.5) / (Number(p.storeys) > 1 ? 2 : 1));
      const x0 = H.x0 + (Number(p.offset) || 0);
      env(x0, H.y1, x0 + width, H.y1 + depth, p.roof === 'flat' ? hh : hr, `45 m² at this width: ${E.fmt(Math.round(depth * 10) / 10)} m`);
      if (Number(p.storeys) > 1) band(R.c1.partyAbove, ['left', 'right'].concat(model.plot.rearIsRoad === 'yes' ? [] : ['rear']), 'Upper floor 2 m from party boundaries', [H.y1, L]);
    } else if (k === 'ie-shed') {
      env(0.3, H.y1 + 0.3, W - 0.3, L - 0.3, p.roof === 'pitched-tiled' ? R.c3.heightPitched : R.c3.heightOther, `${p.roof === 'pitched-tiled' ? 4 : 3} m high, 30 m² in total`, { opacity: 0.05, faint: true });
    } else if (k === 'ie-dad') {
      env(R.c3a.gap, H.y1 + R.c3a.gap, W - R.c3a.gap, L - R.c3a.gap, p.roof === 'pitched-tiled' ? R.c3a.heightPitched : R.c3a.heightOther, `0.6 m clear, ${p.roof === 'pitched-tiled' ? 4 : 3} m high`, { opacity: 0.06, faint: true });
      band(R.c3a.gap, ['left', 'right', 'rear'], null, [H.y1, L]);
    }

    // ---------- the proposal ----------
    const r = res && res.rect ? res.rect : null;
    if (r) focus.push([X(r.x0), Z(r.y0), X(r.x1), Z(r.y1), Number(p.height || p.h) || 3]);
    const propMat = proposalBad ? C.redSoft : C.white;
    const propEdge = proposalBad ? C.red : C.ink;
    const tone = proposalBad ? 'bad' : 'ok';
    if (k === 'ie-split') {
      const a1 = Number(p.area1) || 1, a2 = Number(p.area2) || 1, share = a1 / (a1 + a2);
      const cut = X(H.x0) + hw * share;
      const plane = boxMesh(0.1, hh + 0.04, hd + 0.06, proposalBad ? C.red : C.blue); plane.position.set(cut, hh / 2, Z(H.y0) + hd / 2); world.add(plane);
      const tint = boxMesh(hw * (1 - share) - 0.05, hh - 0.02, hd + 0.02, C.unit2); tint.position.set(cut + (hw * (1 - share)) / 2, hh / 2, Z(H.y0) + hd / 2); world.add(tint, edges(tint, 0x6b3d1a, { opacity: 0.5 }));
      addLabel([X(H.x0) + hw * share / 2, hh + 0.4, Z(H.y1)], `Home 1: ${E.fmt(a1)} m²`, tone, 4);
      addLabel([cut + hw * (1 - share) / 2, hh + 0.4, Z(H.y1)], `Home 2: ${E.fmt(a2)} m²`, tone, 4);
    } else if (r) {
      const w = r.x1 - r.x0, d = r.y1 - r.y0;
      const cx = X(r.x0) + w / 2, cz = Z(r.y0) + d / 2;
      if (k === 'en-ashp' || k === 'ie-hp') {
        const uh = Number(p.h) || 0.9;
        const lift = p.mount === 'wall' ? (p.aboveGround === 'yes' ? 3.2 : 0.5) : (p.mount === 'flatRoof' || p.mount === 'roof') ? hh + 0.3 : 0.02;
        const unit = boxMesh(w, uh, d, propMat); unit.position.set(cx, lift + uh / 2, cz); world.add(unit, edges(unit, propEdge));
        const fan = new THREE.Mesh(new THREE.CircleGeometry(Math.min(w, uh) * 0.32, 36), new THREE.MeshBasicMaterial({ color: C.ink }));
        fan.position.set(cx + w * 0.14, lift + uh / 2, cz + d / 2 + 0.006); world.add(fan);
        const dist = Number(p.r) || 0;
        if (dist > 0) {
          const dir = r.x0 <= W - r.x1 ? -1 : 1;
          const across = Math.min(dist, Math.max(2, Math.min(r.x0, W - r.x1) + 3));
          const ax = cx + dir * across, az = cz + Math.sqrt(Math.max(0, dist * dist - across * across)) * 0.35;
          world.add(line([cx, lift + uh * 0.6, cz], [ax, 1.6, az], noiseBad ? C.red : C.blue));
          focus.push([ax - 0.5, az - 0.5, ax + 0.5, az + 0.5, 2]);
          const dot = new THREE.Mesh(new THREE.SphereGeometry(0.17, 18, 12), new THREE.MeshBasicMaterial({ color: noiseBad ? C.red : C.blue })); dot.position.set(ax, 1.6, az); world.add(dot);
          const lp = res && res.mcs && res.mcs.lp != null ? `${res.mcs.lp.toFixed(1)} dB(A) at the neighbour’s window` : `${E.fmt(dist)} m to the neighbour’s window`;
          addLabel([ax, 1.9, az], lp, noiseBad ? 'bad' : 'limit', noiseBad ? 6 : 4);
        }
        addLabel([cx, lift + uh + 0.2, cz], `${E.fmt(w)} × ${E.fmt(d)} × ${E.fmt(uh)} m unit`, tone, proposalBad ? 6 : 3);
      } else {
        const isOut = k === 'en-out' || k === 'ie-shed' || k === 'ie-dad';
        const top = Number(p.height) || 3;
        const flatRoof = p.roof === 'flat' || p.roof === 'other';
        const eav = isOut ? (k === 'en-out' ? Number(p.eaves) || top : flatRoof ? top : top * 0.72) : Number(k === 'ie-ext' ? p.walls : p.eaves) || top;
        const wallTop = flatRoof ? top : Math.min(top, eav);
        const body = boxMesh(w, wallTop, d, propMat); body.position.set(cx, wallTop / 2, cz); world.add(body, edges(body, propEdge));
        if (!flatRoof && top > wallTop + 0.05) {
          const type = isOut ? (p.roof === 'hipped' ? 'hip' : p.roof === 'mono' ? 'mono' : 'gable') : (Number(p.storeys) > 1 ? 'gable' : 'mono');
          const along = type !== 'mono' && d > w;
          const rf = roofMesh(type, w + 0.2, d + 0.2, wallTop, top, proposalBad ? C.red : C.slate, along);
          rf.position.set(cx, 0, cz);
          if (type === 'mono' && k === 'en-side') rf.rotation.y = p.side === 'left' ? -Math.PI / 2 : Math.PI / 2;
          world.add(rf, edges(rf, propEdge, { opacity: 0.6 }));
        }
        addLabel([cx, top + 0.15, cz], `${E.fmt(top)} m high`, tone, proposalBad ? 6 : 4);
        if (k === 'en-rear' || k === 'ie-ext') {
          const xe = X(r.x1) + 0.45;
          world.add(line([xe, 0.06, Z(r.y0)], [xe, 0.06, Z(r.y1)], proposalBad ? C.red : C.ink));
          world.add(line([xe - 0.25, 0.06, Z(r.y1)], [xe + 0.25, 0.06, Z(r.y1)], proposalBad ? C.red : C.ink));
          world.add(line([xe - 0.25, 0.06, Z(r.y0)], [xe + 0.25, 0.06, Z(r.y0)], proposalBad ? C.red : C.ink));
          addLabel([xe + 0.9, 0.1, (Z(r.y0) + Z(r.y1)) / 2], `${E.fmt(Math.round(d * 100) / 100)} m deep`, tone, proposalBad ? 6 : 5);
        } else addLabel([cx, 0.1, Z(r.y1) + 0.6], `${E.fmt(w)} × ${E.fmt(d)} m`, tone, 4);
      }
    }
    // look from the open side, so a joined neighbour sits behind the house rather than in front of it
    const side = P.att.left && !P.att.right ? 1 : -1;
    if (side !== lastSide) { orbit.theta = side * Math.abs(orbit.theta || 1.02); lastSide = side; }
    // what the camera has to show: the house, the plot and a strip of road
    boxAll = { x0: X(0) - (P.att.left ? 1.5 : 0.6), x1: X(W) + (P.att.right ? 1.5 : 0.6), z0: Z(H.y0) - 1.2, z1: Z(L) + 0.4, y1: hr + 0.2 };
    // a tighter frame for the images: the back of the house and the project with its limits
    focus.push([X(H.x0), Z(H.y0 + hd * 0.45), X(H.x1), Z(H.y1), hr]);
    if (k === 'ie-split') focus.push([X(H.x0), Z(H.y0), X(H.x1), Z(H.y1), hr]);
    const fb = focus.reduce((a, f) => ({ x0: Math.min(a.x0, f[0]), z0: Math.min(a.z0, f[1]), x1: Math.max(a.x1, f[2]), z1: Math.max(a.z1, f[3]), y1: Math.max(a.y1, f[4]) }), { x0: Infinity, z0: Infinity, x1: -Infinity, z1: -Infinity, y1: 0 });
    boxProject = { x0: fb.x0 - 1.2, x1: fb.x1 + 1.2, z0: fb.z0 - 1.0, z1: Math.min(fb.z1 + 1.6, boxAll.z1), y1: fb.y1 + 0.3 };
    box = boxAll;
    // the points the perspective camera must see: each part at its own height, not the box's top corners
    const pts = (x0, z0, x1, z1, top) => { const o = []; for (const x of [x0, x1]) for (const z of [z0, z1]) { o.push(new THREE.Vector3(x, 0, z)); o.push(new THREE.Vector3(x, top, z)); } return o; };
    ptsAll = pts(X(0), Z(0), X(W), Z(L), 0.1).concat(pts(X(H.x0), Z(H.y0), X(H.x1), Z(H.y1), hr), ...focus.map(f => pts(f[0], f[1], f[2], f[3], f[4])));
    ptsProject = [].concat(...focus.map(f => pts(f[0] - 0.8, f[1] - 0.6, f[2] + 0.8, f[3] + 1.2, f[4])));
    sun.position.set(box.x0 - 16, 30, (box.z0 + box.z1) / 2 + 4);
    sun.target.position.set((box.x0 + box.x1) / 2, 0, (box.z0 + box.z1) / 2);
    const span = Math.max(box.x1 - box.x0, box.z1 - box.z0) * 0.75;
    Object.assign(sun.shadow.camera, { left: -span, right: span, top: span, bottom: -span, near: 1, far: 140 });
    sun.shadow.camera.updateProjectionMatrix();
    dirty = true;
  }

  // ---------- Labels (HTML over the canvas, or returned for the offline images) ----------
  function addLabel(pos, text, tone, priority) { labels.push({ p: new THREE.Vector3(...pos), text, tone, priority: priority || 1 }); }
  function placed(width, height, measure) {
    // project, then drop or nudge labels that would overlap a more important one
    const out = [];
    const sorted = labels.slice().sort((a, b) => b.priority - a.priority);
    for (const lb of sorted) {
      const v = lb.p.clone().project(camera);
      if (v.z > 1 || Math.abs(v.x) > 1.04 || Math.abs(v.y) > 1.04) continue;
      const wpx = measure(lb.text), hpx = 22;
      let x = (v.x + 1) / 2 * width, y = (1 - v.y) / 2 * height;
      let rect = () => ({ x0: x - wpx / 2 - 3, x1: x + wpx / 2 + 3, y0: y - hpx - 3, y1: y + 3 });
      let tries = 0;
      while (out.some(o => { const a = rect(), b = o.rect; return a.x0 < b.x1 && b.x0 < a.x1 && a.y0 < b.y1 && b.y0 < a.y1; }) && tries < 4) { y -= hpx + 4; tries++; }
      if (tries >= 4) continue;
      x = Math.min(width - wpx / 2 - 6, Math.max(wpx / 2 + 6, x)); y = Math.max(hpx + 6, Math.min(height - 4, y));
      out.push({ x, y, text: lb.text, tone: lb.tone, rect: rect() });
    }
    return out;
  }
  let measurer = null;
  function measureFn(px) {
    if (!measurer) measurer = document.createElement('canvas').getContext('2d');
    measurer.font = `700 ${px}px "Big Shoulders", "Arial Narrow", sans-serif`;
    return t => measurer.measureText(t).width + 12;
  }
  function layoutLabels() {
    if (!labelsLayer) return;
    labelsLayer.textContent = '';
    const rect = canvas.getBoundingClientRect();
    for (const t of placed(rect.width, rect.height, measureFn(15))) {
      const el = document.createElement('span');
      el.className = 'wp-tag wp-tag-' + t.tone;
      el.textContent = t.text;
      el.style.transform = `translate(${Math.round(t.x)}px, ${Math.round(t.y)}px) translate(-50%, -100%)`;
      labelsLayer.appendChild(el);
    }
  }

  // ---------- Cameras ----------
  const corners = () => { const pts = []; for (const x of [box.x0, box.x1]) for (const y of [0, box.y1]) for (const z of [box.z0, box.z1]) pts.push(new THREE.Vector3(x, y, z)); return pts; };
  function aim(target) {
    const t = orbit.target, r = orbit.radius;
    persp.up.set(0, 1, 0);
    persp.position.set(t.x + r * Math.sin(orbit.phi) * Math.sin(orbit.theta), t.y + r * Math.cos(orbit.phi), t.z + r * Math.sin(orbit.phi) * Math.cos(orbit.theta));
    persp.lookAt(target || t);
    persp.updateProjectionMatrix(); persp.updateMatrixWorld();
  }
  function fitPersp() {
    // fit the house and plot to the frame, then centre what is drawn rather than the box
    orbit.target.set((box.x0 + box.x1) / 2, box.y1 * 0.18, (box.z0 + box.z1) / 2);
    const pts = fitPts.length ? fitPts : corners();
    const right = new THREE.Vector3(), upv = new THREE.Vector3();
    let r = orbit.radius || 40;
    for (let i = 0; i < 12; i++) {
      orbit.radius = r; aim();
      let x0 = Infinity, x1 = -Infinity, y0 = Infinity, y1 = -Infinity;
      for (const p of pts) { const v = p.clone().project(persp); x0 = Math.min(x0, v.x); x1 = Math.max(x1, v.x); y0 = Math.min(y0, v.y); y1 = Math.max(y1, v.y); }
      const dist = persp.position.distanceTo(orbit.target);
      const hh = Math.tan(THREE.MathUtils.degToRad(persp.fov / 2)) * dist, ww = hh * persp.aspect;
      right.setFromMatrixColumn(persp.matrixWorld, 0); upv.setFromMatrixColumn(persp.matrixWorld, 1);
      orbit.target.addScaledVector(right, (x0 + x1) / 2 * ww).addScaledVector(upv, (y0 + y1) / 2 * hh);
      r = r * Math.max((x1 - x0) / 2 / 0.94, (y1 - y0) / 2 / 0.88);
    }
    orbit.radius = r;
  }
  function fitOrtho(v, aspect) {
    const cx = (box.x0 + box.x1) / 2, cz = (box.z0 + box.z1) / 2;
    let hw, hh;
    if (v === 'plan') { hw = (box.z1 - box.z0) / 2; hh = (box.x1 - box.x0) / 2; ortho.up.set(1, 0, 0); ortho.position.set(cx, 200, cz); ortho.lookAt(cx, 0, cz); }
    else if (v === 'rear') { hw = (box.x1 - box.x0) / 2; hh = box.y1 / 2; ortho.up.set(0, 1, 0); ortho.position.set(cx, hh, box.z1 + 200); ortho.lookAt(cx, hh, cz); }
    else { hw = (box.z1 - box.z0) / 2; hh = box.y1 / 2; ortho.up.set(0, 1, 0); ortho.position.set(box.x1 + 200, hh, cz); ortho.lookAt(cx, hh, cz); }
    hw *= 1.08; hh *= 1.14;
    if (hw / hh < aspect) hw = hh * aspect; else hh = hw / aspect;
    Object.assign(ortho, { left: -hw, right: hw, top: hh, bottom: -hh });
    ortho.zoom = userZoom;
    ortho.updateProjectionMatrix(); ortho.updateMatrixWorld();
  }
  function placeCamera(aspect) {
    sun.castShadow = view === 'persp';
    if (view === 'persp') { camera = persp; persp.aspect = aspect; aim(); }
    else { camera = ortho; fitOrtho(view, aspect); }
  }
  function size() { return { w: canvas.clientWidth || canvas.width, h: canvas.clientHeight || canvas.height }; }
  function resize() {
    const { w, h } = size();
    if (!w || !h) return;
    renderer.setSize(w, h, false);
    persp.aspect = w / h;
    dirty = true;
  }
  function render() {
    const { w, h } = size();
    placeCamera(w / h);
    if (intro) {
      const t = Math.min(1, (performance.now() - intro.t0) / intro.ms);
      const e = 1 - Math.pow(1 - t, 3);
      world.traverse(o => { if (o.userData.envelope) { if (o.userData.y0 == null) { o.userData.y0 = o.position.y; o.userData.sy = o.scale.y; } o.scale.y = Math.max(0.001, o.userData.sy * e); o.position.y = o.userData.y0 * e; } });
      if (t >= 1) intro = null;
    }
    renderer.render(scene, camera);
    layoutLabels();
  }
  function loop() { raf = 0; if (dirty || intro) { dirty = false; render(); } if (intro) raf = requestAnimationFrame(loop); }
  function invalidate() { dirty = true; if (!raf) raf = requestAnimationFrame(loop); }

  // ---------- Pointer and keyboard controls ----------
  const pointers = new Map();
  let pinch0 = 0;
  const toPersp = () => { if (view !== 'persp') { view = 'persp'; opts.onView && opts.onView(view); } };
  canvas.addEventListener('pointerdown', e => { canvas.setPointerCapture(e.pointerId); pointers.set(e.pointerId, { x: e.clientX, y: e.clientY }); });
  canvas.addEventListener('pointermove', e => {
    if (!pointers.has(e.pointerId)) return;
    const prev = pointers.get(e.pointerId);
    pointers.set(e.pointerId, { x: e.clientX, y: e.clientY });
    if (pointers.size === 2) {
      const [a, b] = [...pointers.values()];
      const d = Math.hypot(a.x - b.x, a.y - b.y);
      if (pinch0) zoomBy(pinch0 / d);
      pinch0 = d;
    } else {
      if (Math.abs(e.clientX - prev.x) + Math.abs(e.clientY - prev.y) < 1) return;
      toPersp();
      orbit.theta -= (e.clientX - prev.x) * 0.008;
      orbit.phi = Math.min(1.42, Math.max(0.22, orbit.phi - (e.clientY - prev.y) * 0.006));
    }
    invalidate();
  });
  const up = e => { pointers.delete(e.pointerId); if (pointers.size < 2) pinch0 = 0; };
  canvas.addEventListener('pointerup', up); canvas.addEventListener('pointercancel', up);
  function zoomBy(f) { if (view === 'persp') orbit.radius = Math.min(260, Math.max(6, orbit.radius * f)); else userZoom = Math.min(6, Math.max(0.4, userZoom / f)); }
  canvas.addEventListener('wheel', e => { e.preventDefault(); zoomBy(Math.pow(1.0015, e.deltaY)); invalidate(); }, { passive: false });
  canvas.addEventListener('keydown', e => {
    const step = { ArrowLeft: [0.12, 0], ArrowRight: [-0.12, 0], ArrowUp: [0, -0.08], ArrowDown: [0, 0.08] }[e.key];
    if (step) { e.preventDefault(); toPersp(); orbit.theta += step[0]; orbit.phi = Math.min(1.42, Math.max(0.22, orbit.phi + step[1])); invalidate(); }
    if (e.key === '+' || e.key === '=') { zoomBy(0.9); invalidate(); }
    if (e.key === '-') { zoomBy(1.1); invalidate(); }
  });
  const ro = typeof ResizeObserver === 'function' ? new ResizeObserver(() => { resize(); invalidate(); }) : null;
  if (ro) ro.observe(canvas);

  return {
    update(model, res, E, { animate } = {}) {
      build(model, res, E);
      userZoom = 1; fitPts = ptsAll;
      const { w, h } = size();
      persp.aspect = (w || 16) / (h || 10);
      fitPersp();
      if (animate && !reduced) intro = { t0: performance.now(), ms: 750 };
      resize(); invalidate();
    },
    setView(v) { view = v; userZoom = 1; invalidate(); },
    get view() { return view; },
    // One image at a given size and view, for the offline heroes and the PDF; the live canvas is restored after.
    snapshot({ width, height, view: v = 'persp', type = 'image/png', quality = 0.9, theta, phi, zoom, labelPx = 15, focus = 'all' } = {}) {
      const saved = { view, theta: orbit.theta, phi: orbit.phi, radius: orbit.radius, uz: userZoom, pr: renderer.getPixelRatio(), target: orbit.target.clone() };
      view = v; userZoom = 1; box = focus === 'project' ? boxProject : boxAll; fitPts = focus === 'project' ? ptsProject : ptsAll;
      if (theta != null) orbit.theta = theta;
      if (phi != null) orbit.phi = phi;
      intro = null;
      world.traverse(o => { if (o.userData.envelope && o.userData.y0 != null) { o.scale.y = o.userData.sy; o.position.y = o.userData.y0; } });
      renderer.setPixelRatio(1);
      renderer.setSize(width, height, false);
      persp.aspect = width / height;
      if (v === 'persp') { fitPersp(); if (zoom) orbit.radius *= zoom; }
      placeCamera(width / height);
      renderer.render(scene, camera);
      const url = canvas.toDataURL(type, quality);
      const tags = placed(width, height, measureFn(labelPx)).map(t => ({ x: t.x, y: t.y, text: t.text, tone: t.tone, visible: true }));
      view = saved.view; orbit.theta = saved.theta; orbit.phi = saved.phi; orbit.radius = saved.radius; userZoom = saved.uz; orbit.target.copy(saved.target); box = boxAll; fitPts = ptsAll;
      renderer.setPixelRatio(saved.pr);
      resize(); invalidate();
      return { url, tags };
    },
    dispose() { cancelAnimationFrame(raf); if (ro) ro.disconnect(); disposeTree(world); renderer.dispose(); },
  };
}
