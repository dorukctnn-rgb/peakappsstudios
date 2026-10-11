/* Dropped Kerb Check: the 3D street-to-house section. An ES module loaded only when the 3D view starts, never on
 * first paint. Draws the carriageway, the kerb with the dropped section and its transition kerbs at their real heights,
 * the verge and footway, the crossing the council would build, the front wall, the drive, the car inside the
 * boundary and the house; then the rules: the visibility splays capped by the 0.6 m plane, the sight lines along the
 * road, the ruler to the junction, the clearance rings round a tree, a lamp column and other street furniture.
 * A rule that fails turns its part red. Plan and section views use an orthographic camera, like a council drawing.
 * The same module renders the offline heroes and the views in the Pro PDF.
 * three.js 0.185.1 (MIT), shared with Without Planning from /without-planning/vendor/. */
import * as THREE from '/without-planning/vendor/three.module.min.js';

const C = {
  sky: 0xe7e8e3, ground: 0xd6d5cc, asphalt: 0x41474b, asphaltLight: 0x4b5256, lining: 0xeeeee8,
  kerb: 0xa3a8a9, kerbTop: 0xb9bdbd, footway: 0xd8ccb0, crossing: 0x575d60, verge: 0x93ad7c, lawn: 0x86a56f, hedge: 0x55784a,
  brick: 0xa96d52, brickDark: 0x86523d, roof: 0x4d555a, glass: 0x2b3439, door: 0x1f2629, frame: 0xf1efe9,
  neighbour: 0xcfcfc8, neighbourRoof: 0x9da1a1, car: 0x8b959b, carDark: 0x3a4246,
  paving: { permeable: 0xa59a87, porous: 0x6b6f6f, gravel: 0xc4bba7, grid: 0x8aa874, block: 0x9a8f80, concrete: 0xbcbbb4, tarmac: 0x4d5356, undecided: 0xb3ab9c },
  pass: 0x3f7d3a, fail: 0xc8201e, check: 0xd9952a, water: 0x0b6f80, ink: 0x1f2629, white: 0xffffff,
  trunk: 0x6d5a47, canopy: 0x5f8b4c, lamp: 0x596164, cabinet: 0x2f4b3c, plate: 0xc8201e,
};
const ROAD = 0, UP = 0.125, DROP = 0.025, KERBW = 0.15;

function disposeTree(obj) {
  obj.traverse(o => {
    if (o.geometry) o.geometry.dispose();
    if (o.material) (Array.isArray(o.material) ? o.material : [o.material]).forEach(m => { if (m.map) m.map.dispose(); m.dispose(); });
  });
}
const std = (color, o = {}) => new THREE.MeshStandardMaterial({ color, roughness: o.roughness ?? 0.92, metalness: 0, side: o.side || THREE.FrontSide, transparent: !!o.opacity, opacity: o.opacity ?? 1, depthWrite: o.opacity ? false : true });
function box(w, h, d, color, o = {}) {
  const m = new THREE.Mesh(new THREE.BoxGeometry(Math.max(w, 0.001), Math.max(h, 0.001), Math.max(d, 0.001)), o.material || std(color, o));
  m.castShadow = o.cast !== false && !o.opacity; m.receiveShadow = !o.opacity;
  return m;
}
function edges(mesh, color, opacity = 0.6) {
  const l = new THREE.LineSegments(new THREE.EdgesGeometry(mesh.geometry, 25), new THREE.LineBasicMaterial({ color, transparent: true, opacity }));
  l.position.copy(mesh.position); l.rotation.copy(mesh.rotation); l.scale.copy(mesh.scale);
  return l;
}
// a flat polygon on the ground, from [x, z] points, at height y
function flat(points, y, mat) {
  const shape = new THREE.Shape(points.map(([x, z]) => new THREE.Vector2(x, -z)));
  const g = new THREE.ShapeGeometry(shape);
  g.rotateX(-Math.PI / 2);
  const m = new THREE.Mesh(g, mat);
  m.position.y = y; m.receiveShadow = true;
  return m;
}
const rect = (x0, z0, x1, z1, y, mat) => flat([[x0, z0], [x1, z0], [x1, z1], [x0, z1]], y, mat);
// a surface from rows of [x, y, z] points (each row the same length), for the crossing ramp and the sloping drive
function sheet(rows, mat) {
  const pos = [], uv = [], idx = [], n = rows[0].length;
  rows.forEach(r => r.forEach(p => { pos.push(p[0], p[1], p[2]); uv.push(p[0], p[2]); }));
  for (let i = 0; i < rows.length - 1; i++) for (let j = 0; j < n - 1; j++) {
    const a = i * n + j, b = a + 1, c = a + n, d = c + 1;
    idx.push(a, c, b, b, c, d);
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3)); g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2)); g.setIndex(idx); g.computeVertexNormals();
  const m = new THREE.Mesh(g, mat); m.receiveShadow = true;
  return m;
}
// one kerb unit with its top sloping from h0 to h1 (a transition kerb), the road face at z = 0
function kerbUnit(x0, x1, h0, h1, mat) {
  const z0 = 0, z1 = KERBW;
  const v = [[x0, 0, z0], [x1, 0, z0], [x1, h1, z0], [x0, h0, z0], [x0, 0, z1], [x1, 0, z1], [x1, h1, z1], [x0, h0, z1]];
  const faces = [[0, 1, 2, 3], [5, 4, 7, 6], [3, 2, 6, 7], [4, 5, 1, 0], [4, 0, 3, 7], [1, 5, 6, 2]];
  const pos = [];
  for (const f of faces) for (const k of [0, 1, 2, 0, 2, 3]) pos.push(...v[f[k]]);
  const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3)); g.computeVertexNormals();
  const m = new THREE.Mesh(g, mat); m.castShadow = true; m.receiveShadow = true;
  return m;
}
let textures = {};
function paverTexture(kind, color) {
  const key = kind + color;
  if (textures[key]) return textures[key];
  const c = document.createElement('canvas'); c.width = c.height = 128;
  const x = c.getContext('2d');
  const hex = '#' + color.toString(16).padStart(6, '0');
  x.fillStyle = hex; x.fillRect(0, 0, 128, 128);
  if (kind === 'gravel') {
    for (let i = 0; i < 900; i++) { x.fillStyle = `rgba(${60 + (i * 37) % 80},${55 + (i * 53) % 70},${45 + (i * 29) % 60},0.35)`; x.fillRect((i * 97) % 128, (i * 61) % 128, 2, 2); }
  } else if (kind === 'grid') {
    x.strokeStyle = 'rgba(70,80,70,0.55)'; x.lineWidth = 6;
    for (let i = 0; i <= 128; i += 32) { x.beginPath(); x.moveTo(i, 0); x.lineTo(i, 128); x.stroke(); x.beginPath(); x.moveTo(0, i); x.lineTo(128, i); x.stroke(); }
  } else if (kind === 'flags') {
    x.strokeStyle = 'rgba(120,108,84,0.45)'; x.lineWidth = 2;
    for (let i = 0; i <= 128; i += 64) { x.beginPath(); x.moveTo(i, 0); x.lineTo(i, 128); x.stroke(); x.beginPath(); x.moveTo(0, i); x.lineTo(128, i); x.stroke(); }
  } else if (kind !== 'tarmac' && kind !== 'concrete' && kind !== 'porous') {
    // stretcher-bond blocks, 200 by 100 mm; permeable blocks get wider, darker joints
    x.strokeStyle = kind === 'permeable' ? 'rgba(52,70,48,0.7)' : 'rgba(80,72,60,0.5)'; x.lineWidth = kind === 'permeable' ? 3 : 1.5;
    for (let r = 0; r < 8; r++) {
      const yy = r * 16; x.beginPath(); x.moveTo(0, yy); x.lineTo(128, yy); x.stroke();
      for (let k = 0; k <= 4; k++) { const xx = k * 32 + (r % 2 ? 16 : 0); x.beginPath(); x.moveTo(xx, yy); x.lineTo(xx, yy + 16); x.stroke(); }
    }
  }
  const t = new THREE.CanvasTexture(c);
  t.wrapS = t.wrapT = THREE.RepeatWrapping; t.colorSpace = THREE.SRGBColorSpace; t.anisotropy = 4;
  textures[key] = t;
  return t;
}
const TILE = { flags: 1.2, permeable: 0.8, block: 0.8, gravel: 0.8, grid: 1.0 };
function texMat(kind, color) {
  const t = paverTexture(kind, color).clone(); t.needsUpdate = true; const s = 1 / (TILE[kind] || 1); t.repeat.set(s, s);
  return new THREE.MeshStandardMaterial({ map: t, roughness: 0.95, metalness: 0 });
}
function ring(x, z, r, y, color, dashed = true) {
  const pts = [];
  for (let i = 0; i <= 96; i++) { const a = i / 96 * Math.PI * 2; pts.push(new THREE.Vector3(x + Math.cos(a) * r, y, z + Math.sin(a) * r)); }
  const g = new THREE.BufferGeometry().setFromPoints(pts);
  const l = new THREE.Line(g, dashed ? new THREE.LineDashedMaterial({ color, dashSize: 0.22, gapSize: 0.14 }) : new THREE.LineBasicMaterial({ color }));
  if (dashed) l.computeLineDistances();
  return l;
}
function line(a, b, color, dashed) {
  const l = new THREE.Line(new THREE.BufferGeometry().setFromPoints([new THREE.Vector3(...a), new THREE.Vector3(...b)]), dashed ? new THREE.LineDashedMaterial({ color, dashSize: 0.5, gapSize: 0.3 }) : new THREE.LineBasicMaterial({ color }));
  if (dashed) l.computeLineDistances();
  return l;
}
function prism(tri, y0, y1, color, opacity) {
  // a triangular prism from ground to a height, for the visibility splay
  const shape = new THREE.Shape(tri.map(([x, z]) => new THREE.Vector2(x, -z)));
  const g = new THREE.ExtrudeGeometry(shape, { depth: y1 - y0, bevelEnabled: false });
  g.rotateX(-Math.PI / 2);
  const m = new THREE.Mesh(g, new THREE.MeshBasicMaterial({ color, transparent: true, opacity, depthWrite: false, side: THREE.DoubleSide }));
  m.position.y = y0;
  return m;
}

export function createScene(canvas, opts = {}) {
  const reduced = opts.reducedMotion ?? (typeof matchMedia === 'function' && matchMedia('(prefers-reduced-motion: reduce)').matches);
  const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, preserveDrawingBuffer: !!opts.preserve, powerPreference: 'low-power' });
  renderer.setPixelRatio(Math.min(opts.pixelRatio || window.devicePixelRatio || 1, 2));
  renderer.shadowMap.enabled = true; renderer.shadowMap.type = THREE.PCFShadowMap;
  const scene = new THREE.Scene();
  scene.background = new THREE.Color(C.sky);
  const persp = new THREE.PerspectiveCamera(30, 1, 0.1, 600);
  const ortho = new THREE.OrthographicCamera(-10, 10, 10, -10, 0.1, 800);
  let camera = persp;
  scene.add(new THREE.HemisphereLight(0xffffff, 0xb9b4a6, 1.9));
  const sun = new THREE.DirectionalLight(0xffffff, 2.3);
  sun.castShadow = true; sun.shadow.mapSize.set(2048, 2048); sun.shadow.bias = -0.0004; sun.shadow.normalBias = 0.03;
  scene.add(sun, sun.target);
  const world = new THREE.Group(); scene.add(world);
  const labelsLayer = opts.labels || null;
  let labels = [], drops = [], risers = [];
  let fitStreet = [], fitPlan = { x0: -8, x1: 8, z0: -3, z1: 12 }, fitSection = { z0: -3, z1: 14, y1: 7 };
  const orbit = { theta: Math.PI + 0.62, phi: 1.02, radius: 30, target: new THREE.Vector3() };
  let view = 'street', userZoom = 1, dirty = true, raf = 0, intro = null;

  function build(model, res, E) {
    disposeTree(world); world.clear(); labels = []; drops = []; risers = []; textures = {};
    const P = res.plan;
    const S = {};
    for (const r of res.results || []) if (r.group === 'council') S[r.topic] = r;
    const bad = t => S[t] && S[t].status === 'fail';
    const tone = t => (!S[t] ? 'info' : S[t].status === 'fail' ? 'bad' : S[t].status === 'pass' ? 'ok' : 'check');
    const statusColor = t => (bad(t) ? C.fail : S[t] && S[t].status === 'check' ? C.check : C.pass);
    const yB = P.yB, X = P.cross, park = P.park, plot = P.plot;
    const ext = Math.max(26, (P.junction ? P.junction.x + 14 : 0), -(P.tree ? P.tree.x - 6 : 0));
    const FOOT = UP;
    const lift = Math.max(-0.6, Math.min(0.9, Number(model.level) || 0));

    // ground beyond the street, the carriageway, its edge and centre lines
    world.add(rect(-ext - 20, -18, ext + 20, 40, -0.02, std(C.ground)));
    world.add(rect(-ext, -7.3, ext, 0, ROAD, std(C.asphalt, { roughness: 0.98 })));
    const dash = new THREE.Group();
    for (let x = -ext; x < ext; x += 9) dash.add(rect(x, -3.72, x + 4, -3.58, ROAD + 0.003, std(C.lining)));
    world.add(dash);
    world.add(rect(-ext, -7.3 - 2.2, ext, -7.3, FOOT, std(C.footway)));   // the far footway

    // kerb units along the near side, dropped across the crossing; the flat part drops in the opening animation
    const kmat = std(C.kerb, { roughness: 0.8 });
    const kerbFrom = -ext, kerbTo = P.junction ? P.junction.x : ext;
    const U = 0.914;
    for (let x = kerbFrom; x < kerbTo - 1e-6; x += U) {
      const x0 = x, x1 = Math.min(x + U, kerbTo);
      const h = xx => (xx <= X.x0 || xx >= X.x1 ? UP : xx > X.flat0 && xx < X.flat1 ? DROP : xx <= X.flat0 ? UP - (UP - DROP) * (xx - X.x0) / Math.max(0.01, X.flat0 - X.x0) : DROP + (UP - DROP) * (xx - X.flat1) / Math.max(0.01, X.x1 - X.flat1));
      // split units at the crossing ends so the drop starts exactly where the council's kerbs do
      const cuts = [x0, x1].concat([X.x0, X.flat0, X.flat1, X.x1].filter(c => c > x0 + 1e-6 && c < x1 - 1e-6)).sort((a, b) => a - b);
      for (let i = 0; i < cuts.length - 1; i++) {
        const a = cuts[i], b = cuts[i + 1];
        const mesh = kerbUnit(a, b, h(a + 1e-4), h(b - 1e-4), kmat);
        const inFlat = a >= X.flat0 - 1e-6 && b <= X.flat1 + 1e-6;
        if (inFlat || (a >= X.x0 - 1e-6 && b <= X.x1 + 1e-6)) { mesh.userData.drop = { a, b, from: UP, h0: h(a + 1e-4), h1: h(b - 1e-4) }; drops.push(mesh); }
        world.add(mesh);
      }
    }
    // verge and footway, with the crossing cut through them
    const vergeMat = std(C.verge), footMat = texMat('flags', C.footway);
    const near = KERBW, vEnd = Math.max(near, P.verge);
    const sides = [[-ext, X.x0], [X.x1, kerbTo]];
    for (const [a, b] of sides) {
      if (b - a < 0.01) continue;
      if (vEnd > near + 0.01) world.add(rect(a, near, b, vEnd, FOOT - 0.01, vergeMat));
      world.add(rect(a, vEnd, b, yB, FOOT, footMat));
    }
    // the crossing: dropped at the kerb, ramping up to the back of the footway
    {
      const ramp = Math.min(Math.max(0.9, (yB - near) * 0.55), yB - near);
      const z0 = near, z1 = near + ramp, z2 = yB;
      const lerp = (a, b, t) => a + (b - a) * t;
      const row = (z, t, y) => [[lerp(X.x0, X.rear0, t), FOOT, z], [lerp(X.flat0, X.rear0 + 0.15, t), y, z], [lerp(X.flat1, X.rear1 - 0.15, t), y, z], [lerp(X.x1, X.rear1, t), FOOT, z]];
      const t1 = ramp / (yB - near), mat = std(C.crossing, { roughness: 0.97 });
      const cross = sheet([row(z0, 0, DROP + 0.002), row(z1, t1, FOOT), row(z2, 1, FOOT + 0.002)], mat);
      world.add(cross);
      addLabel([0, 0.3, near + ramp / 2], `Crossing ${E.fmt(X.x1 - X.x0)} m at the kerb`, 'info', 2);
    }

    // the property: front wall (split where a splay applies), drive, lawn, side walls, the house
    const wallH = Math.max(0, Number(model.wall) || 0);
    const gap = P.gap;
    const SP = res.authorityRules && res.authorityRules.pedSplay;
    const splayBad = bad('splay');
    const wallSeg = (x0, x1, inSplay) => {
      if (x1 - x0 < 0.02 || wallH <= 0.01) return;
      const m = box(x1 - x0, wallH, 0.22, inSplay && splayBad ? C.fail : C.brick, { roughness: 0.85 });
      m.position.set((x0 + x1) / 2, FOOT + wallH / 2, yB + 0.11); world.add(m, edges(m, C.brickDark, 0.4));
    };
    const along = SP && SP.kind === 'edge' ? SP.along : SP && SP.kind === 'centre' ? Math.max(0, SP.half - gap / 2) : 0;
    wallSeg(plot.x0, -gap / 2 - along, false); wallSeg(-gap / 2 - along, -gap / 2, along > 0);
    wallSeg(gap / 2, gap / 2 + along, along > 0); wallSeg(gap / 2 + along, plot.x1, false);
    // the drive, sloping by the level difference, in the surface chosen
    {
      const kind = model.surface || 'undecided';
      const col = C.paving[kind] || C.paving.undecided;
      const mat = texMat(kind, col);
      const y0 = FOOT + 0.004, y1 = FOOT + lift;
      world.add(sheet([[[park.x0, y0, park.y0], [park.x1, y0, park.y0]], [[park.x0, y1, park.y1], [park.x1, y1, park.y1]]], mat));
      const lawn = std(C.lawn);
      if (park.x0 - plot.x0 > 0.05) world.add(sheet([[[plot.x0, y0 - 0.02, park.y0], [park.x0, y0 - 0.02, park.y0]], [[plot.x0, y1 - 0.02, park.y1], [park.x0, y1 - 0.02, park.y1]]], lawn));
      if (plot.x1 - park.x1 > 0.05) world.add(sheet([[[park.x1, y0 - 0.02, park.y0], [plot.x1, y0 - 0.02, park.y0]], [[park.x1, y1 - 0.02, park.y1], [plot.x1, y1 - 0.02, park.y1]]], lawn));
    }
    const sideWall = x => { const m = box(0.12, 0.9, park.y1 - yB, C.hedge); m.position.set(x, FOOT + 0.45, (yB + park.y1) / 2); m.userData.context = true; world.add(m); };
    sideWall(plot.x0); sideWall(plot.x1);
    // the house front, its door and windows, with neighbours either side
    const hh = 5.3, hd = 7.5, front = park.y1, hy = FOOT + lift;
    const house = (x0, x1, main) => {
      const g = new THREE.Group();
      const w = x1 - x0;
      const body = box(w, hh, hd, main ? C.brick : C.neighbour, { roughness: 0.88 }); body.position.set((x0 + x1) / 2, hy + hh / 2, front + hd / 2); g.add(body, edges(body, main ? C.brickDark : 0x9a9c97, 0.45));
      const rg = new THREE.BufferGeometry();
      const ry = hy + hh, rt = ry + 2.4, zA = front - 0.25, zB = front + hd + 0.25, zM = front + hd / 2;
      rg.setAttribute('position', new THREE.Float32BufferAttribute([x0 - 0.15, ry, zA, x1 + 0.15, ry, zA, x1 + 0.15, rt, zM, x0 - 0.15, ry, zA, x1 + 0.15, rt, zM, x0 - 0.15, rt, zM, x0 - 0.15, rt, zM, x1 + 0.15, rt, zM, x1 + 0.15, ry, zB, x0 - 0.15, rt, zM, x1 + 0.15, ry, zB, x0 - 0.15, ry, zB], 3));
      rg.computeVertexNormals();
      const roof = new THREE.Mesh(rg, std(main ? C.roof : C.neighbourRoof, { side: THREE.DoubleSide }));
      roof.castShadow = true; g.add(roof);
      if (main) {
        const doorX = model.door === 'yes' ? 0 : Math.min(x1 - 0.9, Math.max(park.x1 + 0.8, x0 + 0.9));
        const d = box(0.95, 2.1, 0.08, C.door, { cast: false }); d.position.set(doorX, hy + 1.05, front - 0.04); g.add(d);
        for (const fx of [0.22, 0.78]) for (const fy of [1.5, 4.0]) {
          const wx = x0 + w * fx; if (Math.abs(wx - doorX) < 1.1 && fy < 3) continue;
          const win = box(Math.min(1.4, w * 0.22), 1.2, 0.06, C.glass, { cast: false }); win.position.set(wx, hy + fy, front - 0.03); g.add(win, edges(win, C.frame, 0.9));
        }
      } else g.userData.context = true;
      return g;
    };
    world.add(house(plot.x0, plot.x1, true));
    for (const dx of [-1, 1]) { const g = house(dx < 0 ? plot.x0 - (plot.x1 - plot.x0) : plot.x1, dx < 0 ? plot.x0 : plot.x1 + (plot.x1 - plot.x0), false); g.traverse(o => { o.userData.context = true; }); world.add(g); }

    // the car (or two), parked inside the boundary; red when the depth rule fails
    {
      const carBad = bad('depth') || bad('width');
      const parallel = P.parallel, two = Number(model.spaces) === 2 && !parallel;
      const L = P.car.length, Wc = P.car.width;
      const place = (cx, cz, rotate) => {
        const g = new THREE.Group();
        const body = box(Wc, 0.75, L, carBad ? C.fail : C.car, { roughness: 0.4 }); body.position.y = 0.55; g.add(body);
        const cab = box(Wc - 0.12, 0.6, L * 0.5, carBad ? 0xe17b75 : 0x9ea8ad, { roughness: 0.3 }); cab.position.set(0, 1.2, -L * 0.04); g.add(cab);
        const glass = box(Wc - 0.1, 0.42, L * 0.46, C.glass, { cast: false }); glass.position.set(0, 1.22, -L * 0.04); g.add(glass);
        for (const sx of [-1, 1]) for (const sz of [-1, 1]) { const wh = new THREE.Mesh(new THREE.CylinderGeometry(0.33, 0.33, 0.24, 20), std(C.carDark)); wh.rotation.z = Math.PI / 2; wh.position.set(sx * (Wc / 2 - 0.08), 0.33, sz * L * 0.32); wh.castShadow = true; g.add(wh); }
        g.position.set(cx, FOOT + Math.max(0, lift) * 0.5, cz); if (rotate) g.rotation.y = Math.PI / 2;
        world.add(g);
      };
      if (parallel) place(0, Math.min(park.y1 - Wc / 2 - 0.4, yB + Math.max(Wc / 2 + 0.3, (park.y1 - yB) / 2)), true);
      else {
        const cz = park.y1 - 0.35 - L / 2;
        if (two) { place(-Math.max(1.2, (park.x1 - park.x0) / 4), cz, false); place(Math.max(1.2, (park.x1 - park.x0) / 4), cz, false); }
        else place(0, cz, false);
        const rear = park.y1 - 0.35 - L;
        if (rear < yB - 0.02) addLabel([0, 1.4, rear], `Overhangs the pavement by ${E.fmt(Math.round((yB - rear) * 100) / 100)} m`, 'bad', 7);
      }
      // the depth dimension on the drive
      const need = S.depth && /([\d.]+) m/.exec(S.depth.limit || '');
      const dx = park.x1 + 0.35;
      world.add(line([dx, FOOT + 0.05, yB], [dx, FOOT + 0.05, park.y1], carBad ? C.fail : C.ink));
      world.add(line([dx - 0.25, FOOT + 0.05, yB], [dx + 0.25, FOOT + 0.05, yB], carBad ? C.fail : C.ink));
      world.add(line([dx - 0.25, FOOT + 0.05, park.y1], [dx + 0.25, FOOT + 0.05, park.y1], carBad ? C.fail : C.ink));
      addLabel([dx + 0.6, 0.3, (yB + park.y1) / 2], `${E.fmt(park.y1 - yB)} m deep${need ? `, ${need[1]} m needed` : ''}`, tone('depth'), bad('depth') ? 8 : 6);
    }

    // the pedestrian visibility splays, capped by the 0.6 m plane
    if (SP && (SP.kind === 'edge' || SP.kind === 'centre')) {
      const col = splayBad ? C.fail : S.splay && S.splay.status === 'check' ? C.check : C.water;
      const tris = SP.kind === 'edge'
        ? [[[-gap / 2, yB], [-gap / 2 - SP.along, yB], [-gap / 2, yB + SP.into]], [[gap / 2, yB], [gap / 2 + SP.along, yB], [gap / 2, yB + SP.into]]]
        : [[[-SP.half, yB], [SP.half, yB], [0, yB + SP.into]]];
      for (const t of tris) {
        const p = prism(t, FOOT, FOOT + SP.h, col, 0.16); p.userData.rise = SP.h; risers.push(p); world.add(p);
        const cap = flat(t, FOOT + SP.h, new THREE.MeshBasicMaterial({ color: col, transparent: true, opacity: 0.34, depthWrite: false, side: THREE.DoubleSide })); cap.userData.rise = SP.h; cap.userData.capY = FOOT + SP.h; risers.push(cap); world.add(cap);
      }
      addLabel([SP.kind === 'edge' ? -gap / 2 - SP.along / 2 : 0, FOOT + SP.h + 0.15, yB + 0.4], `Nothing above ${E.fmt(SP.h)} m in the splay`, splayBad ? 'bad' : 'limit', splayBad ? 8 : 4);
    } else if (SP && SP.kind === 'unsized' && wallH > SP.h) addLabel([-gap / 2 - 0.8, FOOT + wallH + 0.2, yB], `Keep below ${E.fmt(SP.h)} m beside the opening`, 'check', 4);

    // sight lines along the road, from the driver's eye point
    const SL = res.authorityRules && res.authorityRules.sight;
    if (SL && SL.setback) {
      const speed = Number(model.speed) || 30;
      const yv = (SL.y && SL.y[speed]) || null;
      if (yv) {
        const zA = SL.setback, reach = Math.min(yv, ext - 1), eye = 1.05;
        for (const s of [-1, 1]) world.add(line([0, eye, zA], [s * reach, eye, -0.6], C.water, true));
        addLabel([-Math.min(yv, ext - 1) * 0.6, eye + 0.2, -0.4], `${yv} m each way at ${speed} mph`, 'limit', 3);
      }
    }

    // the junction: the side road on this side of the street, and the ruler to it
    if (P.junction) {
      const xj = P.junction.x, R = 6, w = P.junction.width;
      const asph = std(C.asphalt, { roughness: 0.98 });
      world.add(rect(xj + R, 0, xj + R + w, 40, ROAD + 0.001, asph));
      const quarter = []; for (let i = 0; i <= 16; i++) { const a = Math.PI / 2 * i / 16; quarter.push([xj + R - Math.cos(a) * R + 0, R - Math.sin(a) * R]); }
      world.add(flat([[xj, 0]].concat(quarter.map(([x, z]) => [x, z])).concat([[xj + R, 0]]), ROAD + 0.001, asph));
      const jBad = bad('junction'), jc = jBad ? C.fail : S.junction && S.junction.status === 'check' ? C.check : C.ink;
      const z = -0.55;
      world.add(line([X.x1, ROAD + 0.01, z], [xj, ROAD + 0.01, z], jc));
      for (const x of [X.x1, xj]) world.add(line([x, ROAD + 0.01, z - 0.3], [x, ROAD + 0.01, z + 0.3], jc));
      addLabel([(X.x1 + xj) / 2, 0.2, z], `${E.fmt(xj - X.x1)} m to the junction`, tone('junction'), jBad ? 8 : 5);
    }

    // street tree, lamp column, other street furniture and a bus stop, each with its clearance ring
    const ringY = FOOT + 0.015;
    if (P.tree) {
      const t = P.tree, circ = t.circ || 0.9, r = Math.max(0.12, circ / (2 * Math.PI));
      const g = new THREE.Group(); g.userData.context = true;
      const trunk = new THREE.Mesh(new THREE.CylinderGeometry(r * 0.85, r, 3.2, 14), std(C.trunk)); trunk.position.set(t.x, FOOT + 1.6, t.y); trunk.castShadow = true;
      const crown = new THREE.Mesh(new THREE.IcosahedronGeometry(2.3, 1), std(C.canopy, { roughness: 1 })); crown.position.set(t.x, FOOT + 4.9, t.y); crown.castShadow = true;
      g.add(trunk, crown); world.add(g);
      const rad = S.tree && S.tree.radius;
      if (rad) { world.add(ring(t.x, t.y, rad, ringY, bad('tree') ? C.fail : C.pass)); addLabel([t.x, FOOT + 0.3, t.y + Math.min(rad, 3)], `Tree: ${E.fmt(rad)} m clear needed`, tone('tree'), bad('tree') ? 8 : 4); }
      else addLabel([t.x, FOOT + 3.6, t.y], 'Street tree: the tree officer decides', 'check', 3);
    }
    if (P.lamp) {
      const l = P.lamp, g = new THREE.Group();
      const col = new THREE.Mesh(new THREE.CylinderGeometry(0.07, 0.1, 6, 12), std(C.lamp, { roughness: 0.6 })); col.position.set(l.x, FOOT + 3, l.y); col.castShadow = true;
      const arm = box(0.9, 0.08, 0.08, C.lamp); arm.position.set(l.x, FOOT + 5.9, l.y - 0.4); arm.rotation.y = Math.PI / 2;
      const lan = box(0.5, 0.14, 0.24, 0xdfe3e0); lan.position.set(l.x, FOOT + 5.82, l.y - 0.85);
      g.add(col, arm, lan); world.add(g);
      const rad = S.lamp && S.lamp.radius;
      if (rad) { world.add(ring(l.x, l.y, rad, ringY, bad('lamp') ? C.fail : S.lamp.status === 'check' ? C.check : C.pass)); addLabel([l.x, FOOT + 6.4, l.y], `Lamp column: ${E.fmt(rad)} m clear`, tone('lamp'), bad('lamp') ? 7 : 3); }
    }
    if (P.furn) {
      const f = P.furn, cab = box(1.1, 1.25, 0.45, C.cabinet, { roughness: 0.6 }); cab.position.set(f.x, FOOT + 0.62, f.y); world.add(cab, edges(cab, 0x1d3127, 0.5));
      const rad = S.furniture && S.furniture.radius;
      if (rad) world.add(ring(f.x, f.y, rad + 0.45, ringY, bad('furniture') ? C.fail : C.pass));
      addLabel([f.x, FOOT + 1.6, f.y], 'Cabinet', tone('furniture'), bad('furniture') ? 6 : 2);
    }
    if (P.bus) {
      const b = P.bus, pole = new THREE.Mesh(new THREE.CylinderGeometry(0.05, 0.05, 2.9, 10), std(C.lamp)); pole.position.set(b.x, FOOT + 1.45, b.y);
      const plate = box(0.5, 0.5, 0.04, C.plate); plate.position.set(b.x, FOOT + 2.65, b.y); world.add(pole, plate);
      addLabel([b.x, FOOT + 3.1, b.y], 'Bus stop', tone('bus'), bad('bus') ? 6 : 2);
    }

    // what each camera has to show
    const xL = Math.min(plot.x0 - 2, P.tree ? P.tree.x - 2.5 : 0, P.furn ? P.furn.x - 1.5 : 0), xR = Math.max(plot.x1 + 2, P.lamp ? P.lamp.x + 1.5 : 0, P.bus ? P.bus.x + 1 : 0, P.junction && P.junction.x - X.x1 < 20 ? P.junction.x + 3 : 0);
    fitPlan = { x0: xL, x1: xR, z0: -3.2, z1: park.y1 + 1.2 };
    fitSection = { z0: -4, z1: park.y1 + 2.5, y1: hy + hh + 2.6 };
    const pts = [];
    for (const x of [xL, xR]) { pts.push(new THREE.Vector3(x, 0, -2.6)); pts.push(new THREE.Vector3(x, 0.4, yB)); }
    for (const x of [plot.x0, plot.x1]) { pts.push(new THREE.Vector3(x, hy + hh + 2.4, park.y1 + 3.7)); pts.push(new THREE.Vector3(x, hy, park.y1)); }
    fitStreet = pts;
    sun.position.set(-14, 26, -16); sun.target.position.set(0, 0, yB);
    const span = Math.max(xR - xL, park.y1 + 6) * 0.8;
    Object.assign(sun.shadow.camera, { left: -span, right: span, top: span, bottom: -span, near: 1, far: 120 });
    sun.shadow.camera.updateProjectionMatrix();
    dirty = true;
  }

  // ---------- labels: HTML over the canvas, or returned for the offline images and the PDF ----------
  function addLabel(pos, text, tone, priority) { labels.push({ p: new THREE.Vector3(...pos), text, tone, priority: priority || 1 }); }
  function placed(width, height, measure) {
    const out = [];
    for (const lb of labels.slice().sort((a, b) => b.priority - a.priority)) {
      const v = lb.p.clone().project(camera);
      if (v.z > 1 || Math.abs(v.x) > 1.02 || Math.abs(v.y) > 1.02) continue;
      const wpx = measure(lb.text), hpx = 22;
      let x = (v.x + 1) / 2 * width, y = (1 - v.y) / 2 * height;
      const rect = () => ({ x0: x - wpx / 2 - 3, x1: x + wpx / 2 + 3, y0: y - hpx - 3, y1: y + 3 });
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
    measurer.font = `600 ${px}px "Signika", "Segoe UI", sans-serif`;
    return t => measurer.measureText(t).width + Math.round(px * 0.95);
  }
  function layoutLabels() {
    if (!labelsLayer) return;
    labelsLayer.textContent = '';
    const r = canvas.getBoundingClientRect();
    for (const t of placed(r.width, r.height, measureFn(13.5))) {
      const el = document.createElement('span');
      el.className = 'dk-tag dk-tag-' + t.tone; el.textContent = t.text;
      el.style.transform = `translate(${Math.round(t.x)}px, ${Math.round(t.y)}px) translate(-50%, -100%)`;
      labelsLayer.appendChild(el);
    }
  }

  // ---------- cameras ----------
  function aim() {
    const t = orbit.target, r = orbit.radius;
    persp.up.set(0, 1, 0);
    persp.position.set(t.x + r * Math.sin(orbit.phi) * Math.sin(orbit.theta), t.y + r * Math.cos(orbit.phi), t.z + r * Math.sin(orbit.phi) * Math.cos(orbit.theta));
    persp.lookAt(t); persp.updateProjectionMatrix(); persp.updateMatrixWorld();
  }
  function fitPersp() {
    const pts = fitStreet.length ? fitStreet : [new THREE.Vector3(-8, 0, -3), new THREE.Vector3(8, 6, 12)];
    const c = pts.reduce((a, p) => a.add(p), new THREE.Vector3()).multiplyScalar(1 / pts.length);
    orbit.target.set(c.x, 1.2, c.z);
    const right = new THREE.Vector3(), upv = new THREE.Vector3();
    let r = orbit.radius || 30;
    for (let i = 0; i < 12; i++) {
      orbit.radius = r; aim();
      let x0 = Infinity, x1 = -Infinity, y0 = Infinity, y1 = -Infinity;
      for (const p of pts) { const v = p.clone().project(persp); x0 = Math.min(x0, v.x); x1 = Math.max(x1, v.x); y0 = Math.min(y0, v.y); y1 = Math.max(y1, v.y); }
      const dist = persp.position.distanceTo(orbit.target);
      const hh = Math.tan(THREE.MathUtils.degToRad(persp.fov / 2)) * dist, ww = hh * persp.aspect;
      right.setFromMatrixColumn(persp.matrixWorld, 0); upv.setFromMatrixColumn(persp.matrixWorld, 1);
      orbit.target.addScaledVector(right, (x0 + x1) / 2 * ww).addScaledVector(upv, (y0 + y1) / 2 * hh);
      r = r * Math.max((x1 - x0) / 2 / 0.95, (y1 - y0) / 2 / 0.86);
    }
    orbit.radius = r;
  }
  function fitOrtho(v, aspect) {
    let hw, hh, cx, cy, cz;
    if (v === 'plan') {
      // from above, the road at the foot of the picture, as you face the house from the street (as the street view)
      cx = (fitPlan.x0 + fitPlan.x1) / 2; cz = (fitPlan.z0 + fitPlan.z1) / 2; hw = (fitPlan.x1 - fitPlan.x0) / 2; hh = (fitPlan.z1 - fitPlan.z0) / 2;
      ortho.up.set(0, 0, 1); ortho.position.set(cx, 200, cz); ortho.lookAt(cx, 0, cz);
    } else {
      // a section across the street through the middle of the crossing: road on the left, house on the right
      cz = (fitSection.z0 + fitSection.z1) / 2; cy = fitSection.y1 / 2; hw = (fitSection.z1 - fitSection.z0) / 2; hh = fitSection.y1 / 2 + 0.6;
      ortho.up.set(0, 1, 0); ortho.position.set(-300, cy, cz); ortho.lookAt(0, cy, cz);
    }
    hw *= 1.06; hh *= 1.1;
    if (hw / hh < aspect) hw = hh * aspect; else hh = hw / aspect;
    Object.assign(ortho, { left: -hw, right: hw, top: hh, bottom: -hh, zoom: userZoom });
    ortho.updateProjectionMatrix(); ortho.updateMatrixWorld();
  }
  function placeCamera(aspect) {
    sun.castShadow = view === 'street';
    world.traverse(o => { if (o.userData.context) o.visible = view !== 'section'; });
    if (view === 'street') { camera = persp; persp.aspect = aspect; aim(); }
    else { camera = ortho; fitOrtho(view, aspect); }
  }
  function size() { return { w: canvas.clientWidth || canvas.width, h: canvas.clientHeight || canvas.height }; }
  function resize() { const { w, h } = size(); if (!w || !h) return; renderer.setSize(w, h, false); persp.aspect = w / h; dirty = true; }
  function animateIntro(t) {
    const e = 1 - Math.pow(1 - t, 3);
    for (const k of drops) {
      const d = k.userData.drop, pos = k.geometry.attributes.position;
      // lower the dropped and transition kerbs from full height to their own heights
      for (let i = 0; i < pos.count; i++) {
        const y = pos.getY(i); if (y <= 1e-6) continue;
        const x = pos.getX(i), target = Math.abs(x - d.a) < Math.abs(x - d.b) ? d.h0 : d.h1;
        pos.setY(i, UP + (target - UP) * e);
      }
      pos.needsUpdate = true; k.geometry.computeVertexNormals();
    }
    for (const r of risers) r.scale.y = Math.max(0.001, e);
  }
  function render() {
    const { w, h } = size();
    placeCamera(w / h);
    if (intro) { const t = Math.min(1, (performance.now() - intro.t0) / intro.ms); animateIntro(t); if (t >= 1) intro = null; }
    renderer.render(scene, camera);
    layoutLabels();
  }
  function loop() { raf = 0; if (dirty || intro) { dirty = false; render(); } if (intro) raf = requestAnimationFrame(loop); }
  function invalidate() { dirty = true; if (!raf) raf = requestAnimationFrame(loop); }

  // ---------- pointer and keyboard ----------
  const pointers = new Map(); let pinch0 = 0;
  const toStreet = () => { if (view !== 'street') { view = 'street'; opts.onView && opts.onView(view); } };
  canvas.addEventListener('pointerdown', e => { canvas.setPointerCapture(e.pointerId); pointers.set(e.pointerId, { x: e.clientX, y: e.clientY }); });
  canvas.addEventListener('pointermove', e => {
    if (!pointers.has(e.pointerId)) return;
    const prev = pointers.get(e.pointerId); pointers.set(e.pointerId, { x: e.clientX, y: e.clientY });
    if (pointers.size === 2) { const [a, b] = [...pointers.values()]; const d = Math.hypot(a.x - b.x, a.y - b.y); if (pinch0) zoomBy(pinch0 / d); pinch0 = d; }
    else { if (Math.abs(e.clientX - prev.x) + Math.abs(e.clientY - prev.y) < 1) return; toStreet(); orbit.theta -= (e.clientX - prev.x) * 0.008; orbit.phi = Math.min(1.45, Math.max(0.25, orbit.phi - (e.clientY - prev.y) * 0.006)); }
    invalidate();
  });
  const up = e => { pointers.delete(e.pointerId); if (pointers.size < 2) pinch0 = 0; };
  canvas.addEventListener('pointerup', up); canvas.addEventListener('pointercancel', up);
  function zoomBy(f) { if (view === 'street') orbit.radius = Math.min(220, Math.max(5, orbit.radius * f)); else userZoom = Math.min(6, Math.max(0.4, userZoom / f)); }
  canvas.addEventListener('wheel', e => { e.preventDefault(); zoomBy(Math.pow(1.0015, e.deltaY)); invalidate(); }, { passive: false });
  canvas.addEventListener('keydown', e => {
    const step = { ArrowLeft: [0.12, 0], ArrowRight: [-0.12, 0], ArrowUp: [0, -0.08], ArrowDown: [0, 0.08] }[e.key];
    if (step) { e.preventDefault(); toStreet(); orbit.theta += step[0]; orbit.phi = Math.min(1.45, Math.max(0.25, orbit.phi + step[1])); invalidate(); }
    if (e.key === '+' || e.key === '=') { zoomBy(0.9); invalidate(); }
    if (e.key === '-') { zoomBy(1.1); invalidate(); }
  });
  const ro = typeof ResizeObserver === 'function' ? new ResizeObserver(() => { resize(); invalidate(); }) : null;
  if (ro) ro.observe(canvas);

  return {
    update(model, res, E, { animate } = {}) {
      build(model, res, E);
      userZoom = 1;
      const { w, h } = size(); persp.aspect = (w || 16) / (h || 10);
      fitPersp();
      if (animate && !reduced) { intro = { t0: performance.now(), ms: 900 }; animateIntro(0); }
      resize(); invalidate();
    },
    setView(v) { view = v; userZoom = 1; invalidate(); },
    get view() { return view; },
    // one image at a given size and view, for the offline heroes and the PDF; the live canvas is restored after
    snapshot({ width, height, view: v = 'street', type = 'image/png', quality = 0.9, theta, phi, zoom, labelPx = 14 } = {}) {
      const saved = { view, theta: orbit.theta, phi: orbit.phi, radius: orbit.radius, uz: userZoom, pr: renderer.getPixelRatio(), target: orbit.target.clone() };
      view = v; userZoom = 1; intro = null; animateIntro(1);
      if (theta != null) orbit.theta = theta;
      if (phi != null) orbit.phi = phi;
      renderer.setPixelRatio(1); renderer.setSize(width, height, false); persp.aspect = width / height;
      if (v === 'street') { fitPersp(); if (zoom) orbit.radius *= zoom; }
      placeCamera(width / height);
      renderer.render(scene, camera);
      const url = canvas.toDataURL(type, quality);
      const tags = placed(width, height, measureFn(labelPx)).map(t => ({ x: t.x, y: t.y, text: t.text, tone: t.tone }));
      view = saved.view; orbit.theta = saved.theta; orbit.phi = saved.phi; orbit.radius = saved.radius; userZoom = saved.uz; orbit.target.copy(saved.target);
      renderer.setPixelRatio(saved.pr); resize(); invalidate();
      return { url, tags };
    },
    dispose() { cancelAnimationFrame(raf); if (ro) ro.disconnect(); disposeTree(world); renderer.dispose(); },
  };
}
