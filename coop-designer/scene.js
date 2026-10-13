/* Coop Designer: the live 3D model. An ES module loaded only when the 3D view starts, never on first paint.
 * Draws the design the engine built, piece by piece: every board of the frame in pine, the plywood siding painted
 * duck-egg with its doors, pop door, window and vents cut out, the corrugated roof, the hardware cloth as a fine wire
 * grid with a metal sheen, the nest boxes with eggs, the roosts, the ramp, the tractor's wheels; and round it a
 * backyard in the morning: a lawn, a garden bed, a fence and a tree. The hens are our own low-poly models built here
 * from primitives, so no asset licence is involved.
 * Modes: the whole coop, the frame only, and the build steps (boards slide in, in assembly order). The sun moves
 * through a June day; a hen walks its path from the run up the ramp to the nest box and the roost.
 * The same module renders the offline hero images, the Open Graph image and the views in the Pro PDF.
 * three.js 0.185.1 (MIT), shared with Without Planning from /without-planning/vendor/. */
import * as THREE from '/without-planning/vendor/three.module.min.js';

const K = 0.001; // millimetres to metres
const COL = {
  grass: 0x93b56b, dirt: 0xb99a72, straw: 0xe3c879, soil: 0x6e5038,
  pine: 0xd9a35f, pineDark: 0xbf8846, pineLight: 0xe9bd80, ply: 0xe3c79a, siding: 0xa9d3c9, sidingDark: 0x8fc0b4, trim: 0xf7f3ea,
  roof: 0xa3aab0, poly: 0xe6f0f6, wire: 0x6c737a, inside: 0x3a2e24, door: 0x93c6ba,
  bark: 0x6b4a33, leaf: 0x5f9a3e, leafDark: 0x447a2c, leafLight: 0x8cbf5a, fence: 0xece5d6, bed: 0xa77a4c, tomato: 0xd8402f,
  comb: 0xd6262f, beak: 0xf2b33d, leg: 0xe8b13a, highlight: 0xffb000, choc: 0x2e1a12,
  eggs: [0xf6f1e7, 0xb9ded7, 0x6d3b23, 0xead2b0, 0x97a466, 0xc78f5f, 0xa8d3cb, 0x4e2617, 0xefe2cc, 0xd6a676],
};
const BREEDS = {
  red: { body: 0x8e3b1f, dark: 0x5c2412, light: 0xb2552c, tail: 0x2b1d17 },
  buff: { body: 0xe2ad62, dark: 0xc78d43, light: 0xf0c784, tail: 0xc78d43 },
  black: { body: 0x23211f, dark: 0x151413, light: 0x34403a, tail: 0x1b2621 },
  white: { body: 0xf3f0e8, dark: 0xdcd6c8, light: 0xffffff, tail: 0xe8e3d6 },
  barred: { body: 0x8d8f92, dark: 0x3a3b3e, light: 0xd9dadb, tail: 0x3a3b3e, barred: true },
};

function disposeTree(obj) {
  obj.traverse(o => {
    if (o.geometry) o.geometry.dispose();
    if (o.material) (Array.isArray(o.material) ? o.material : [o.material]).forEach(m => { for (const k of ['map', 'alphaMap']) if (m[k]) m[k].dispose(); m.dispose(); });
  });
}
const std = (color, o = {}) => new THREE.MeshStandardMaterial(Object.assign({ color, roughness: 0.82, metalness: 0 }, o));
function box(w, h, d, mat) { const m = new THREE.Mesh(new THREE.BoxGeometry(Math.max(w, 1e-4), Math.max(h, 1e-4), Math.max(d, 1e-4)), mat); m.castShadow = true; m.receiveShadow = true; return m; }

// ---------- textures, drawn on canvases ----------
const texCache = {};
function canvasTex(key, size, draw, repeat) {
  if (!texCache[key]) {
    const c = document.createElement('canvas'); c.width = c.height = size;
    draw(c.getContext('2d'), size);
    const t = new THREE.CanvasTexture(c);
    t.wrapS = t.wrapT = THREE.RepeatWrapping; t.colorSpace = THREE.SRGBColorSpace; t.anisotropy = 8;
    texCache[key] = t;
  }
  const t = texCache[key].clone(); t.needsUpdate = true;
  if (repeat) t.repeat.set(repeat[0], repeat[1]);
  return t;
}
// one cell of welded hardware cloth: wire along two edges, transparent inside
const wireTex = rep => canvasTex('wire', 64, (x, s) => { x.clearRect(0, 0, s, s); x.fillStyle = 'rgba(255,255,255,0.92)'; x.fillRect(0, 0, s, 3); x.fillRect(0, 0, 3, s); x.fillStyle = '#ffffff'; x.fillRect(0, 0, 5, 5); }, rep);
// chicken wire: hexagons
const hexTex = rep => canvasTex('hex', 64, (x, s) => { x.clearRect(0, 0, s, s); x.strokeStyle = 'rgba(255,255,255,0.9)'; x.lineWidth = 2.5; x.beginPath(); x.moveTo(0, s * 0.25); x.lineTo(s * 0.5, 0); x.lineTo(s, s * 0.25); x.moveTo(0, s * 0.25); x.lineTo(0, s * 0.75); x.lineTo(s * 0.5, s); x.lineTo(s, s * 0.75); x.lineTo(s, s * 0.25); x.stroke(); }, rep);
const grassTex = rep => canvasTex('grass', 256, (x, s) => {
  x.fillStyle = '#93b56b'; x.fillRect(0, 0, s, s);
  let seed = 11; const rnd = () => (seed = (seed * 16807) % 2147483647) / 2147483647;
  for (let i = 0; i < 5600; i++) { const g = 120 + Math.floor(rnd() * 60); x.fillStyle = `rgba(${70 + Math.floor(rnd() * 50)},${g},${50 + Math.floor(rnd() * 30)},${0.16 + rnd() * 0.3})`; x.fillRect(rnd() * s, rnd() * s, 1 + rnd() * 2, 2 + rnd() * 3); }
}, rep);
const strawTex = rep => canvasTex('straw', 256, (x, s) => {
  x.fillStyle = '#c9ab7c'; x.fillRect(0, 0, s, s);
  let seed = 5; const rnd = () => (seed = (seed * 16807) % 2147483647) / 2147483647;
  for (let i = 0; i < 900; i++) { x.strokeStyle = `rgba(${220 + Math.floor(rnd() * 30)},${190 + Math.floor(rnd() * 30)},${100 + Math.floor(rnd() * 40)},${0.5 + rnd() * 0.4})`; x.lineWidth = 1 + rnd(); x.beginPath(); const px = rnd() * s, py = rnd() * s, a = rnd() * Math.PI, l = 6 + rnd() * 14; x.moveTo(px, py); x.lineTo(px + Math.cos(a) * l, py + Math.sin(a) * l); x.stroke(); }
}, rep);
const grainTex = () => canvasTex('grain', 256, (x, s) => {
  x.fillStyle = '#ffffff'; x.fillRect(0, 0, s, s);
  for (let i = 0; i < 90; i++) { x.strokeStyle = `rgba(120,80,30,${0.05 + (i % 7) * 0.012})`; x.lineWidth = 1 + (i % 3); x.beginPath(); const y = (i * 53) % s; x.moveTo(0, y); x.bezierCurveTo(s * 0.3, y + 6, s * 0.7, y - 6, s, y + 2); x.stroke(); }
});
// board-and-batten siding: vertical boards with a shadow line every 8 in
const sidingTex = rep => canvasTex('siding', 128, (x, s) => {
  x.fillStyle = '#ffffff'; x.fillRect(0, 0, s, s);
  x.fillStyle = 'rgba(40,70,64,0.16)'; x.fillRect(s - 6, 0, 6, s);
  x.fillStyle = 'rgba(255,255,255,0.5)'; x.fillRect(0, 0, 3, s);
}, rep);

// ---------- eggs and hens: low-poly, built from primitives ----------
let eggGeo = null;
function makeEgg(color, scale = 1) {
  if (!eggGeo) {
    const pts = [];
    for (let i = 0; i <= 12; i++) { const t = i / 12, a = t * Math.PI; const r = Math.sin(a) * (1 - 0.18 * Math.cos(a)) * 0.0215; pts.push(new THREE.Vector2(r, -Math.cos(a) * 0.028)); }
    eggGeo = new THREE.LatheGeometry(pts, 14);
  }
  const m = new THREE.Mesh(eggGeo, std(color, { roughness: 0.55 }));
  m.scale.setScalar(scale); m.castShadow = true;
  return m;
}
function shade(geo, fn) {
  const pos = geo.attributes.position, colors = [], c = new THREE.Color();
  for (let i = 0; i < pos.count; i++) { c.setHex(fn(pos.getX(i), pos.getY(i), pos.getZ(i))); colors.push(c.r, c.g, c.b); }
  geo.setAttribute('color', new THREE.Float32BufferAttribute(colors, 3));
  return geo;
}
export function makeHen(breed = 'red', pose = 'stand', scale = 1) {
  const B = BREEDS[breed] || BREEDS.red;
  const g = new THREE.Group();
  const flat = c => new THREE.MeshStandardMaterial({ color: c, flatShading: true, roughness: 0.9 });
  const fur = new THREE.MeshStandardMaterial({ vertexColors: true, flatShading: true, roughness: 0.95 });
  const col = (x, y, z) => (B.barred ? (Math.sin(y * 11 + z * 3) > 0.15 ? B.dark : B.light) : y < -0.5 ? B.light : y > 0.6 ? B.light : B.body);
  // a hen facing +z, about 0.4 m tall standing: a plump body tipped tail-up, a neck, a small head held forward
  const peck = pose === 'peck', sit = pose === 'sit';
  const by = sit ? 0.1 : 0.19;
  const body = new THREE.Mesh(shade(new THREE.IcosahedronGeometry(1, 1).toNonIndexed(), col), fur);
  body.scale.set(0.1, 0.105, 0.165); body.position.set(0, by, -0.01); body.rotation.x = peck ? 0.2 : -0.28; g.add(body);
  // the tail: a fan of four feathers standing up at the back
  for (const [sx, rz, h] of [[-0.03, 0.18, 0.13], [-0.01, 0.06, 0.16], [0.01, -0.06, 0.16], [0.03, -0.18, 0.13]]) {
    const f = new THREE.Mesh(new THREE.ConeGeometry(0.034, h, 4), flat(B.tail));
    f.scale.set(1, 1, 0.28); f.position.set(sx, by + 0.1 + (peck ? 0.05 : 0), -0.15); f.rotation.set(-0.55 - (peck ? 0.3 : 0), 0, rz); g.add(f);
  }
  for (const s of [-1, 1]) {
    const wing = new THREE.Mesh(shade(new THREE.IcosahedronGeometry(1, 0).toNonIndexed(), () => B.dark), fur);
    wing.scale.set(0.022, 0.065, 0.12); wing.position.set(s * 0.093, by + 0.01, -0.02); wing.rotation.set(peck ? 0.25 : -0.22, 0, s * 0.1); g.add(wing);
  }
  // the neck and the head
  const head = new THREE.Group();
  const skull = new THREE.Mesh(new THREE.IcosahedronGeometry(0.042, 1), flat(B.body)); head.add(skull);
  const beak = new THREE.Mesh(new THREE.ConeGeometry(0.012, 0.032, 4), flat(COL.beak)); beak.rotation.x = Math.PI / 2; beak.position.set(0, -0.008, 0.05); head.add(beak);
  for (let i = 0; i < 4; i++) { const c = new THREE.Mesh(new THREE.IcosahedronGeometry(0.012 + (i === 1 || i === 2 ? 0.004 : 0), 0), flat(COL.comb)); c.position.set(0, 0.04 + (i === 1 || i === 2 ? 0.007 : 0), 0.028 - i * 0.016); head.add(c); }
  for (const s of [-1, 1]) {
    const wt = new THREE.Mesh(new THREE.IcosahedronGeometry(0.01, 0), flat(COL.comb)); wt.scale.set(1, 1.6, 1); wt.position.set(s * 0.008, -0.038, 0.036); head.add(wt);
    const eye = new THREE.Mesh(new THREE.SphereGeometry(0.0065, 6, 4), flat(0x1a120c)); eye.position.set(s * 0.032, 0.01, 0.02); head.add(eye);
  }
  const neck = new THREE.Mesh(shade(new THREE.CylinderGeometry(0.03, 0.05, 0.13, 6).toNonIndexed(), () => (B.barred ? B.light : B.light)), fur);
  if (sit) { head.position.set(0, 0.24, 0.12); neck.position.set(0, 0.17, 0.09); neck.rotation.x = 0.35; }
  else if (peck) { head.position.set(0, 0.07, 0.24); head.rotation.x = 1.0; neck.position.set(0, 0.15, 0.17); neck.rotation.x = 1.15; }
  else { head.position.set(0, 0.36, 0.11); neck.position.set(0, 0.28, 0.08); neck.rotation.x = 0.3; }
  g.add(neck); g.add(head);
  if (!sit) for (const s of [-1, 1]) {
    const leg = new THREE.Mesh(new THREE.CylinderGeometry(0.008, 0.009, 0.11, 5), flat(COL.leg)); leg.position.set(s * 0.038, 0.055, 0.01); g.add(leg);
    const foot = new THREE.Mesh(new THREE.BoxGeometry(0.034, 0.008, 0.05), flat(COL.leg)); foot.position.set(s * 0.038, 0.004, 0.025); g.add(foot);
  }
  g.traverse(o => { if (o.isMesh) { o.castShadow = true; o.receiveShadow = true; } });
  g.scale.setScalar(scale);
  g.userData.height = 0.4 * scale;
  return g;
}

// ---------- the scene ----------
export function createScene(canvas, opts = {}) {
  const reduced = opts.reducedMotion ?? (typeof matchMedia === 'function' && matchMedia('(prefers-reduced-motion: reduce)').matches);
  const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, preserveDrawingBuffer: !!opts.preserve, powerPreference: 'low-power', alpha: false });
  renderer.setPixelRatio(Math.min(opts.pixelRatio || window.devicePixelRatio || 1, 2));
  renderer.shadowMap.enabled = true; renderer.shadowMap.type = THREE.PCFSoftShadowMap;
  renderer.outputColorSpace = THREE.SRGBColorSpace; renderer.toneMapping = THREE.ACESFilmicToneMapping; renderer.toneMappingExposure = 1.05;
  const scene = new THREE.Scene();
  scene.background = canvasTex('sky', 256, (x, s) => { const g = x.createLinearGradient(0, 0, 0, s); g.addColorStop(0, '#9fd0ee'); g.addColorStop(0.55, '#d8ecf0'); g.addColorStop(1, '#fde3c4'); x.fillStyle = g; x.fillRect(0, 0, s, s); });
  scene.background.wrapS = scene.background.wrapT = THREE.ClampToEdgeWrapping;
  const persp = new THREE.PerspectiveCamera(36, 1, 0.05, 200);
  const ortho = new THREE.OrthographicCamera(-1, 1, 1, -1, 0.05, 400);
  let camera = persp;
  const hemi = new THREE.HemisphereLight(0xeaf5ff, 0xc9a77a, 1.15); scene.add(hemi);
  const sun = new THREE.DirectionalLight(0xffd9a8, 3.1);
  sun.castShadow = true; sun.shadow.mapSize.set(2048, 2048); sun.shadow.bias = -0.0005; sun.shadow.normalBias = 0.02; sun.shadow.radius = 3;
  scene.add(sun, sun.target);
  const world = new THREE.Group(); scene.add(world);
  const labelsLayer = opts.labels || null;
  let labels = [], henLabels = [];
  const orbit = { theta: -0.55, phi: 1.12, radius: 6, target: new THREE.Vector3() };
  let dirty = true, raf = 0, anim = null, mode = 'full', last = null, frameInst = null, walker = null, path = [], fitPts = [];
  let sunDir = new THREE.Vector3(0.6, 0.5, 0.6).normalize();
  const groups = {};
  const sidingMats = [];

  function build(res) {
    disposeTree(world); world.clear(); labels = []; henLabels = []; frameInst = null; path = []; sidingMats.length = 0;
    const d = res.design, m = res.m, E = res.E;
    const T = m.type;
    for (const k of ['env', 'frame', 'mesh', 'cover', 'ply', 'life']) { groups[k] = new THREE.Group(); groups[k].name = k; world.add(groups[k]); }
    const st = d.m.units === 'metric' ? 12 * K : 11.9 * K;     // siding thickness
    const ft = d.m.units === 'metric' ? 18 * K : 18.3 * K;     // floor thickness
    const t = d.t * K, w = d.w * K;
    const R = d.run, C = d.coop;
    const runL = R.L * K, runD = R.D * K;
    const x0All = T === 'walkin' ? 0 : 0, x1All = T === 'walkin' ? (m.coop.w + R.L) * K : runL;

    // ---- the yard ----
    const gw = Math.max(18, x1All + 12), gd = Math.max(16, runD + 12);
    const grass = new THREE.Mesh(new THREE.PlaneGeometry(gw, gd), std(0xffffff, { map: grassTex([gw / 1.6, gd / 1.6]), roughness: 1 }));
    grass.rotation.x = -Math.PI / 2; grass.position.set(x1All / 2, -0.002, runD / 2 + 1); grass.receiveShadow = true; groups.env.add(grass);
    // the run floor: worn earth and straw
    const rx0 = T === 'walkin' ? m.coop.w * K : 0, rx1 = T === 'walkin' ? x1All : runL;
    const floorRun = new THREE.Mesh(new THREE.PlaneGeometry(rx1 - rx0, runD), std(0xffffff, { map: strawTex([(rx1 - rx0) / 0.8, runD / 0.8]), roughness: 1 }));
    floorRun.rotation.x = -Math.PI / 2; floorRun.position.set((rx0 + rx1) / 2, 0.001, runD / 2); floorRun.receiveShadow = true; groups.env.add(floorRun);
    // the apron, shown as fresh soil (buried) or a flat skirt of hardware cloth
    if (d.apron) {
      const out = Math.max(0.12, Math.min(d.apron.out * K, 0.6)), skirt = d.apron.kind === 'skirt';
      const mat = skirt ? new THREE.MeshStandardMaterial({ color: COL.wire, metalness: 0.4, roughness: 0.5, map: wireTex([10, 10]), transparent: true, depthWrite: false }) : std(COL.soil, { roughness: 1 });
      const ax0 = T === 'walkin' ? m.coop.w * K : 0;
      const strips = [[ax0 - out, -out, x1All + out, 0], [ax0 - out, runD, x1All + out, runD + out], [x1All, 0, x1All + out, runD]];
      if (T !== 'walkin') strips.push([-out, 0, 0, runD]);
      for (const [a0, b0, a1, b1] of strips) { const p = new THREE.Mesh(new THREE.PlaneGeometry(a1 - a0, b1 - b0), mat); p.rotation.x = -Math.PI / 2; p.position.set((a0 + a1) / 2, 0.003, (b0 + b1) / 2); p.receiveShadow = true; p.userData.step = 9; p.userData.apron = true; groups.env.add(p); }
    }
    // a garden bed, a fence and a tree round the yard
    const bedX = Math.max(0.9, x1All * 0.62), bedZ = -0.85;
    const bed = new THREE.Group();
    const bw = 1.2, bdp = 0.6, bh = 0.25;
    const bedMat = std(COL.bed, { map: grainTex(), roughness: 0.85 });
    for (const [x, z, sx, sz] of [[0, -bdp / 2, bw, 0.04], [0, bdp / 2, bw, 0.04], [-bw / 2, 0, 0.04, bdp], [bw / 2, 0, 0.04, bdp]]) { const b2 = box(sx, bh, sz, bedMat); b2.position.set(x, bh / 2, z); bed.add(b2); }
    const soilTop = box(bw - 0.06, 0.02, bdp - 0.06, std(COL.soil, { roughness: 1 })); soilTop.position.y = bh - 0.03; bed.add(soilTop);
    for (let i = 0; i < 7; i++) { const lf = new THREE.Mesh(new THREE.IcosahedronGeometry(0.11 + (i % 3) * 0.025, 0), std(i % 2 ? COL.leaf : COL.leafLight, { flatShading: true, roughness: 1 })); lf.scale.y = 0.75; lf.position.set(-bw / 2 + 0.15 + i * 0.15, bh + 0.06, ((i * 37) % 3 - 1) * 0.12); lf.castShadow = true; bed.add(lf); }
    for (let i = 0; i < 4; i++) { const tm = new THREE.Mesh(new THREE.IcosahedronGeometry(0.035, 1), std(COL.tomato, { roughness: 0.5 })); tm.position.set(-0.35 + i * 0.24, bh + 0.15, 0.09 * (i % 2 ? 1 : -1)); bed.add(tm); }
    bed.position.set(bedX, 0, bedZ); bed.rotation.y = 0; groups.env.add(bed);
    const fenceZ = -1.6, fenceMat = std(COL.fence, { roughness: 0.8 });
    const fx0 = -3.2, fx1 = x1All + 2.4;
    for (let x = fx0; x <= fx1; x += 0.16) { const p = box(0.09, 1.05, 0.022, fenceMat); p.position.set(x, 0.525, fenceZ); p.castShadow = true; groups.env.add(p); }
    for (const y of [0.3, 0.85]) { const r2 = box(fx1 - fx0, 0.07, 0.03, fenceMat); r2.position.set((fx0 + fx1) / 2, y, fenceZ - 0.025); groups.env.add(r2); }
    const tx = -2.6, tz = -0.9;
    const trunk = new THREE.Mesh(new THREE.CylinderGeometry(0.08, 0.13, 2.4, 7), std(COL.bark, { flatShading: true })); trunk.position.set(tx, 1.2, tz); trunk.castShadow = true; groups.env.add(trunk);
    for (let i = 0; i < 9; i++) { const lf = new THREE.Mesh(new THREE.IcosahedronGeometry(0.55 + (i % 3) * 0.12, 0), std(i % 2 ? COL.leaf : COL.leafDark, { flatShading: true, roughness: 1 })); lf.position.set(tx - 0.5 + (i % 3) * 0.5, 2.5 + ((i * 7) % 4) * 0.22, tz - 0.4 + ((i * 5) % 3) * 0.4); lf.castShadow = true; groups.env.add(lf); }

    // ---- the frame: every member, one instanced mesh ----
    const mem = d.members;
    const mat = new THREE.MeshStandardMaterial({ color: 0xffffff, map: grainTex(), roughness: 0.78, metalness: 0 });
    frameInst = new THREE.InstancedMesh(new THREE.BoxGeometry(1, 1, 1), mat, Math.max(1, mem.length));
    frameInst.castShadow = true; frameInst.receiveShadow = true;
    const base = [], centre = new THREE.Vector3(x1All / 2, 0.6, runD / 2);
    const tmp = new THREE.Matrix4(), col = new THREE.Color();
    mem.forEach((x, i) => {
      const p0 = new THREE.Vector3(...x.p0).multiplyScalar(K), p1 = new THREE.Vector3(...x.p1).multiplyScalar(K);
      const dir = p1.clone().sub(p0); const L = dir.length(); dir.normalize();
      let up = x.up ? new THREE.Vector3(...x.up) : Math.abs(dir.y) < 0.9 ? new THREE.Vector3(0, 1, 0) : new THREE.Vector3(0, 0, 1);
      up.sub(dir.clone().multiplyScalar(up.dot(dir)));
      if (up.lengthSq() < 1e-8) up.set(dir.y > 0.9 ? 1 : 0, 0, 1);
      up.normalize();
      if (!x.up && x.kind === 'brace') { const n = dir.clone().cross(new THREE.Vector3(0, 1, 0)); if (n.lengthSq() < 1e-6) n.set(1, 0, 0); up = n.normalize().cross(dir).normalize(); if (Math.abs(dir.x) > Math.abs(dir.z) && Math.abs(dir.y) > 0.2) up = new THREE.Vector3(0, 0, 1).sub(dir.clone().multiplyScalar(dir.z)).normalize(); }
      const side = dir.clone().cross(up).normalize();
      const c = p0.clone().add(p1).multiplyScalar(0.5);
      tmp.makeBasis(dir, up, side).scale(new THREE.Vector3(Math.max(L, 0.001), x.a * K, x.b * K)).setPosition(c);
      frameInst.setMatrixAt(i, tmp);
      const sh = [COL.pine, COL.pineLight, COL.pineDark][(i * 7) % 3];
      col.setHex(sh).lerp(new THREE.Color(COL.pine), 0.55);
      if (x.kind === 'roost') col.setHex(0xc79a62);
      frameInst.setColorAt(i, col);
      const away = c.clone().sub(centre); if (away.lengthSq() < 1e-6) away.set(0, 1, 0);
      base.push({ m: tmp.clone(), c, step: x.step, dir: away.normalize(), color: col.clone(), len: L });
    });
    frameInst.instanceMatrix.needsUpdate = true; if (frameInst.instanceColor) frameInst.instanceColor.needsUpdate = true;
    frameInst.userData.base = base;
    groups.frame.add(frameInst);

    // ---- hardware cloth ----
    const me = res.mesh.mesh;
    const pitch = (me && me.open ? me.open[1] : 12.7) * K;
    const hex = me && me.kind === 'poultry';
    const meshMat = (uL, vL) => new THREE.MeshStandardMaterial({ color: COL.wire, metalness: 0.45, roughness: 0.45, map: (hex ? hexTex : wireTex)([uL / pitch, vL / pitch]), transparent: true, depthWrite: false, side: THREE.DoubleSide });
    // a flat polygon (3D corners in metres, in a plane) with optional holes (2D, in the plane's own u,v)
    function addPlane(pts, step, holes) {
      const a = new THREE.Vector3(...pts[0]), u = new THREE.Vector3(...pts[1]).sub(a), v = new THREE.Vector3(...pts[pts.length - 1]).sub(a);
      const ux = u.clone().normalize(), vy = v.clone().sub(ux.clone().multiplyScalar(v.dot(ux))).normalize();
      const flat = pts.map(p => { const q = new THREE.Vector3(...p).sub(a); return [q.dot(ux), q.dot(vy)]; });
      const shape = new THREE.Shape(); shape.moveTo(...flat[0]); for (const f of flat.slice(1)) shape.lineTo(...f); shape.closePath();
      for (const hpts of holes || []) { const hp = new THREE.Path(); const hf = hpts.map(p => { const q = new THREE.Vector3(...p).sub(a); return [q.dot(ux), q.dot(vy)]; }); hp.moveTo(...hf[0]); for (const f of hf.slice(1)) hp.lineTo(...f); hp.closePath(); shape.holes.push(hp); }
      const g = new THREE.ShapeGeometry(shape);
      let uMax = 0, vMax = 0; for (const f of flat) { uMax = Math.max(uMax, f[0]); vMax = Math.max(vMax, f[1]); }
      const uvs = g.attributes.uv; for (let i = 0; i < uvs.count; i++) uvs.setXY(i, g.attributes.position.getX(i) / Math.max(uMax, 1e-3), g.attributes.position.getY(i) / Math.max(vMax, 1e-3));
      const mesh = new THREE.Mesh(g, meshMat(Math.max(uMax, 1e-3), Math.max(vMax, 1e-3)));
      mesh.applyMatrix4(new THREE.Matrix4().makeBasis(ux, vy, ux.clone().cross(vy))); mesh.position.copy(a);
      mesh.userData.step = step ?? 9; mesh.castShadow = false;
      groups.mesh.add(mesh); return mesh;
    }
    const out = 0.004;
    const quadX = (xa, xb, ya, yb, z) => [[xa, ya, z], [xb, ya, z], [xb, yb, z], [xa, yb, z]];
    const quadZ = (za, zb, ya, yb, x) => [[x, ya, za], [x, ya, zb], [x, yb, zb], [x, yb, za]];
    // a run box: the front split round the door, back, far end, top
    function runMesh(xa, xb, H, door, topMesh) {
      const zF = runD + out, zB = -out;
      if (door) {
        const dx0 = door.x0 * K, dx1 = (door.x0 + door.w) * K, dh = (door.h + d.t) * K;
        addPlane(quadX(xa, dx0, 0, H, zF)); addPlane(quadX(dx1, xb, 0, H, zF));
        if (H - dh > 0.02) addPlane(quadX(dx0, dx1, dh, H, zF));
        const L2 = door.leaf; addPlane(quadX(L2.x0 * K, (L2.x0 + L2.w) * K, L2.y0 * K, (L2.y0 + L2.h) * K, zF + w / 2 + t + 0.003));
      } else addPlane(quadX(xa, xb, 0, H, zF));
      addPlane(quadX(xa, xb, 0, H, zB));
      addPlane(quadZ(0, runD, 0, H, xb + out));
      if (topMesh) addPlane([[xa, H + w + out, 0], [xb, H + w + out, 0], [xb, H + w + out, runD], [xa, H + w + out, runD]]);
    }
    if (T === 'house') {
      const cw = m.coop.w * K, un = R.under.h * K;
      runMesh(cw, runL, R.h * K, R.door, d.top === 'mesh');
      addPlane(quadX(0, cw, 0, un, runD + out)); addPlane(quadX(0, cw, 0, un, -out)); addPlane(quadZ(0, runD, 0, un, -out));
    } else if (T === 'walkin') {
      const cw = m.coop.w * K;
      runMesh(cw, x1All, R.h * K, R.door, d.top === 'mesh');
      if (m.addons.legs.on) { const un = (m.addons.legs.h - (m.units === 'metric' ? 18 : 18.3)) * K - w; addPlane(quadX(0, cw, 0, un, runD + out)); addPlane(quadX(0, cw, 0, un, -out)); addPlane(quadZ(0, runD, 0, un, -out)); }
    } else if (T === 'aframe') {
      const P = d.parts.aframe, W = P.W * K, H = P.H * K, F = P.F * K, HL = P.HL * K, Lr = P.Lr * K;
      const zAt = (y, s) => (s < 0 ? (W / 2) * (y / H) : W - (W / 2) * (y / H));
      const o2 = 0.02;
      for (const s of [-1, 1]) {
        const zo = s * o2;
        addPlane([[0, 0, zAt(0, s) + zo], [HL, 0, zAt(0, s) + zo], [HL, F, zAt(F, s) + zo], [0, F, zAt(F, s) + zo]]);
        addPlane([[HL, 0, zAt(0, s) + zo], [Lr, 0, zAt(0, s) + zo], [Lr, H, W / 2 + zo * 0.2], [HL, H, W / 2 + zo * 0.2]]);
      }
      addPlane([[-out, 0, 0], [-out, 0, W], [-out, F, zAt(F, 1)], [-out, F, zAt(F, -1)]]);
      const dw = R.door.w * K, dh = R.door.h * K;
      addPlane([[Lr + out, 0, 0], [Lr + out, 0, W], [Lr + out, H, W / 2]], 9, [[[Lr + out, 0, W / 2 - dw / 2], [Lr + out, 0, W / 2 + dw / 2], [Lr + out, dh, W / 2 + dw / 2], [Lr + out, dh, W / 2 - dw / 2]]]);
      addPlane([[Lr + out + 0.02, 0, W / 2 - dw / 2], [Lr + out + 0.02, 0, W / 2 + dw / 2], [Lr + out + 0.02, dh, W / 2 + dw / 2], [Lr + out + 0.02, dh, W / 2 - dw / 2]]);
    } else {
      const Tr = m.tr, W = Tr.w * K, Lr = Tr.l * K, RH = Tr.rh * K, F = Tr.f * K, HL = Tr.hl * K;
      addPlane(quadX(HL, Lr, w, RH, W + out)); addPlane(quadX(HL, Lr, w, RH, -out));
      addPlane(quadX(0, HL, w, F - ft - w, W + out)); addPlane(quadX(0, HL, w, F - ft - w, -out));
      addPlane(quadZ(0, W, w, RH, Lr + out)); addPlane(quadZ(0, W, w, F - ft - w, -out));
      addPlane([[HL, RH + w + out, 0], [Lr, RH + w + out, 0], [Lr, RH + w + out, W], [HL, RH + w + out, W]]);
    }

    // ---- the hen house: siding with its openings, the floor, vents and window ----
    const sidingMat = () => { const m2 = std(COL.siding, { map: sidingTex([1, 1]), roughness: 0.82 }); sidingMats.push(m2); return m2; };
    const darkMat = std(COL.inside, { roughness: 1 });
    // a wall panel: outline and holes in (u, v) metres, extruded st; placed by a basis (u axis, v axis, outward normal)
    function panel(outline, holes, origin, uAxis, nAxis, step, color, uRep) {
      const shape = new THREE.Shape(); shape.moveTo(...outline[0]); for (const p of outline.slice(1)) shape.lineTo(...p); shape.closePath();
      for (const h of holes || []) { const hp = new THREE.Path(); hp.moveTo(h[0], h[1]); hp.lineTo(h[0] + h[2], h[1]); hp.lineTo(h[0] + h[2], h[1] + h[3]); hp.lineTo(h[0], h[1] + h[3]); hp.closePath(); shape.holes.push(hp); }
      const g = new THREE.ExtrudeGeometry(shape, { depth: st, bevelEnabled: false });
      // board-and-batten texture: one board every 8 in (0.2 m) across u
      const uv = g.attributes.uv; for (let i = 0; i < uv.count; i++) uv.setXY(i, g.attributes.position.getX(i) / 0.2, g.attributes.position.getY(i) / 0.2);
      const mat2 = color ? std(color, { roughness: 0.8 }) : sidingMat();
      const mesh = new THREE.Mesh(g, mat2); mesh.castShadow = true; mesh.receiveShadow = true;
      const U = new THREE.Vector3(...uAxis), N = new THREE.Vector3(...nAxis), Vv = N.clone().cross(U).normalize();
      // local x along U, local y up (V), local z along N
      mesh.applyMatrix4(new THREE.Matrix4().makeBasis(U, new THREE.Vector3(0, 1, 0), N)); mesh.position.set(...origin);
      mesh.userData.step = step; mesh.userData.siding = !color;
      groups.ply.add(mesh);
      return mesh;
    }
    function houseSiding(C2, o) {
      const x0 = C2.x0 * K, x1 = C2.x1 * K, z0 = C2.z0 * K, z1 = C2.z1 * K, fy = C2.fy * K;
      const yb = fy - ft;
      const top = z => (C2.fy + C2.h + (C2.h2 - C2.h) * Math.min(1, Math.max(0, (z / K - C2.z0) / (C2.z1 - C2.z0)))) * K;
      const W2 = x1 - x0, D2 = z1 - z0;
      const step = o.step;
      // front (z1): outward +z; local u = x
      const fh = [];
      if (o.door) fh.push([o.door.x0 * K - x0, fy - yb, o.door.w * K, o.door.h * K]);
      for (const v of C2.vents || []) if (v.face === 'cfront') fh.push([v.x0 * K - x0, v.y * K - yb, v.w * K, v.h * K]);
      panel([[0, 0], [W2, 0], [W2, top(z1) - yb], [0, top(z1) - yb]], fh, [x0, yb, z1], [1, 0, 0], [0, 0, 1], step);
      // back (z0): placed so it sits outside the frame
      const bh = [];
      for (const v of C2.vents || []) if (v.face === 'cback') bh.push([v.x0 * K - x0, v.y * K - yb, v.w * K, v.h * K]);
      if (C2.window) bh.push([C2.window.x0 * K - x0, C2.window.y * K - yb, C2.window.w * K, C2.window.h * K]);
      panel([[0, 0], [W2, 0], [W2, top(z0) - yb], [0, top(z0) - yb]], bh, [x0, yb, z0 - st], [1, 0, 0], [0, 0, 1], step);
      // the sides: u runs along z
      // the right side's u runs from the back to the front; the left side's from the front to the back
      const rightOutline = [[0, 0], [D2, 0], [D2, top(z1) - yb], [0, top(z0) - yb]];
      const leftOutline = [[0, 0], [D2, 0], [D2, top(z0) - yb], [0, top(z1) - yb]];
      const rh = [];
      if (o.popRight) rh.push([C2.pop.z * K - z0 - C2.pop.w * K / 2, fy - yb, C2.pop.w * K, C2.pop.h * K]);
      panel(leftOutline, [], [x0 - st, yb, z1], [0, 0, -1], [1, 0, 0], step).position.set(x0 - st, yb, z1);
      panel(rightOutline, rh, [x1, yb, z0], [0, 0, 1], [-1, 0, 0], step).position.set(x1 + st, yb, z0);
      // the clean-out door: the siding cut-out, hinged at its top, a shade darker
      if (C2.clean) { const cl = C2.clean; const dp = box(cl.w * K, cl.h * K, 0.006, std(COL.door, { map: sidingTex([cl.w * K / 0.2, 1]) })); dp.position.set((cl.x0 + cl.w / 2) * K, fy + cl.h * K / 2, z1 + st + 0.003); dp.userData.step = step; groups.ply.add(dp); }
      // the dark inside, seen through the vents, the pop door and the window
      const back = box(W2 - 2 * w, top(z1) - fy - 0.02, D2 - 2 * w, darkMat); back.position.set((x0 + x1) / 2, fy + (top(z1) - fy) / 2, (z0 + z1) / 2); back.castShadow = false; back.userData.step = step; groups.ply.add(back);
      // the floor
      const fl = box(W2, ft, D2, std(COL.ply, { map: grainTex(), roughness: 0.85 })); fl.position.set((x0 + x1) / 2, fy - ft / 2, (z0 + z1) / 2); fl.userData.step = o.floorStep; groups.ply.add(fl);
      // vents and the window: hardware cloth over each opening
      for (const v of C2.vents || []) {
        const zz = v.face === 'cfront' ? z1 + st + 0.003 : z0 - st - 0.003;
        addPlane(quadX(v.x0 * K, (v.x0 + v.w) * K, v.y * K, (v.y + v.h) * K, zz), step);
      }
      if (C2.window) {
        const wn = C2.window;
        addPlane(quadX(wn.x0 * K, (wn.x0 + wn.w) * K, wn.y * K, (wn.y + wn.h) * K, z0 - st - 0.003), step);
        const sh2 = box(wn.w * K, st, wn.h * K * 0.6, std(COL.sidingDark)); sh2.position.set((wn.x0 + wn.w / 2) * K, (wn.y + wn.h) * K + st, z0 - st - wn.h * K * 0.3); sh2.rotation.x = 0; sh2.userData.step = step; groups.ply.add(sh2);
      }
      // the people door (walk-in): a sided leaf in the opening
      if (o.door) { const dl = o.door.leaf; const lf = box(dl.w * K, dl.h * K, st, std(COL.door, { map: sidingTex([dl.w * K / 0.2, 1]) })); lf.position.set((dl.x0 + dl.w / 2) * K, (dl.y0 + dl.h / 2) * K, z1 + st / 2); lf.userData.step = 5; groups.ply.add(lf); }
      // the pop door, slid up in its runners
      if (o.popRight) {
        const pw = C2.pop.w * K, ph = C2.pop.h * K, pz = C2.pop.z * K;
        const pd = box(st, ph, pw + 0.02, std(COL.sidingDark)); pd.position.set(x1 + st * 1.6, fy + ph * 1.5 + 0.02, pz); pd.userData.step = step; groups.ply.add(pd);
        for (const s of [-1, 1]) { const rn = box(0.02, ph * 2.2, 0.03, std(COL.trim)); rn.position.set(x1 + st * 1.5, fy + ph * 1.1, pz + s * (pw / 2 + 0.02)); rn.userData.step = step; groups.ply.add(rn); }
      }
      // white trim on the corners
      const trimMat = std(COL.trim, { roughness: 0.6 });
      for (const [x, z] of [[x0 - st, z0 - st], [x1 + st, z0 - st], [x0 - st, z1 + st], [x1 + st, z1 + st]]) { const tr = box(0.05, top(z) - yb, 0.05, trimMat); tr.position.set(x, yb + (top(z) - yb) / 2, z); tr.userData.step = step; groups.ply.add(tr); }
    }
    if (T === 'house' || T === 'walkin' || T === 'tractor') houseSiding(C, { step: T === 'walkin' ? 3 : T === 'house' ? 3 : 4, floorStep: T === 'walkin' ? 1 : T === 'house' ? 2 : 3, door: T === 'walkin' ? d.door : null, popRight: T !== 'tractor' });
    if (T === 'aframe') {
      const P = d.parts.aframe, W = P.W * K, H = P.H * K, F = P.F * K, HL = P.HL * K, wf = P.wf * K;
      const zf0 = (W - wf) / 2;
      // the floor
      const fl = box(HL, ft, wf, std(COL.ply, { map: grainTex(), roughness: 0.85 })); fl.position.set(HL / 2, F - ft / 2, W / 2); fl.userData.step = 3; groups.ply.add(fl);
      // the two sloped sides above the floor, as thin slabs lying on the slope just outside the rafters
      const ang = Math.atan2(H, W / 2), S2 = Math.hypot(H, W / 2), slant = (H - F) / Math.sin(ang);
      const ym = (F + H) / 2, off = w / 2 + st / 2;
      for (const s of [-1, 1]) {
        const slab = new THREE.Mesh(new THREE.BoxGeometry(HL, st, slant), sidingMat());
        const zm = s < 0 ? (W / 2) * (ym / H) : W - (W / 2) * (ym / H);
        // the outward normal of each slope: (0, W/2, -H)/S at the back, (0, W/2, H)/S at the front
        slab.position.set(HL / 2, ym + off * (W / 2) / S2, zm + s * off * H / S2);
        slab.rotation.x = s < 0 ? -ang : ang - Math.PI;
        slab.castShadow = true; slab.receiveShadow = true; slab.userData.step = 4; slab.userData.siding = true; groups.ply.add(slab);
      }
      // the end triangle and the partition with the pop door
      const tri = [[0, 0], [wf, 0], [wf / 2, H - F]];
      panel(tri, [], [0, F, zf0 + wf], [0, 0, -1], [1, 0, 0], 4).position.set(-st, F, zf0 + wf);
      const pw = C.pop.w * K, ph = C.pop.h * K;
      panel(tri, [[wf / 2 - pw / 2, 0, pw, ph]], [HL, F, zf0], [0, 0, 1], [-1, 0, 0], 4).position.set(HL + st, F, zf0);
      const inside = box(HL - 0.02, (H - F) * 0.5, wf * 0.5, darkMat); inside.position.set(HL / 2, F + (H - F) * 0.25, W / 2); inside.castShadow = false; inside.userData.step = 4; groups.ply.add(inside);
      for (const v of C.vents || []) if (v.ridge) { const strip = box(HL, 0.02, 0.06, std(COL.wire, { metalness: 0.4 })); strip.position.set(HL / 2, H - 0.01, W / 2); strip.userData.step = 4; groups.ply.add(strip); }
    }

    // ---- the roofs: corrugated panels ----
    for (const rc of d.roofs) {
      const poly = rc.kind === 'poly';
        const matR = poly ? std(COL.poly, { roughness: 0.12, metalness: 0.05, transparent: true, opacity: 0.45, side: THREE.DoubleSide, depthWrite: false }) : std(COL.roof, { roughness: 0.5, metalness: 0.35, side: THREE.DoubleSide });
      const P = m.panel, pw = P.w * K, lap = P.lap * K;
      if (rc.aframe) {
        const AP = d.parts.aframe, W = AP.W * K, H = AP.H * K, F = AP.F * K;
        const ang = Math.atan2(H, W / 2), S2 = Math.hypot(H, W / 2), slant = (H - F) / Math.sin(ang) + 0.06;
        const g = new THREE.PlaneGeometry(rc.w * K, slant, Math.max(8, Math.round(rc.w * K / pw * 8)), 1);
        const pos = g.attributes.position; for (let i = 0; i < pos.count; i++) pos.setZ(i, Math.sin(pos.getX(i) / pw * Math.PI * 2 * 8) * 0.008);
        g.computeVertexNormals();
        const s = rc.aframe, ym = (F + H) / 2, off = w / 2 + st + 0.012;
        const pnl = new THREE.Mesh(g, matR); pnl.castShadow = !poly; pnl.receiveShadow = true;
        const zm = s < 0 ? (W / 2) * (ym / H) : W - (W / 2) * (ym / H);
        pnl.position.set((rc.x0 + rc.x1) / 2 * K, ym + off * (W / 2) / S2, zm + s * off * H / S2);
        pnl.rotation.x = s < 0 ? (Math.PI / 2 - ang) : -(Math.PI / 2 - ang);
        pnl.userData.step = rc.step; groups.cover.add(pnl);
        continue;
      }
      const cols = Math.max(1, Math.ceil((rc.w - P.lap) / (P.w - P.lap)));
      const slopeL = Math.hypot((rc.z1 - rc.z0) * K, (rc.y0 - rc.y1) * K);
      const ang = Math.atan2((rc.y0 - rc.y1) * K, (rc.z1 - rc.z0) * K);
      for (let c = 0; c < cols; c++) {
        const g = new THREE.PlaneGeometry(pw, slopeL, 24, 1);
        const pos = g.attributes.position; for (let i = 0; i < pos.count; i++) pos.setZ(i, Math.sin(pos.getX(i) / pw * Math.PI * 2 * 8) * 0.008);
        g.computeVertexNormals();
        const pnl = new THREE.Mesh(g, matR); pnl.castShadow = !poly; pnl.receiveShadow = true;
        pnl.rotation.x = -Math.PI / 2 + ang;
        const x = rc.x0 * K + pw / 2 + c * (pw - lap);
        pnl.position.set(Math.min(x, rc.x1 * K - pw / 2 + 0.01), (rc.y0 + rc.y1) / 2 * K + 0.012 + c * 0.0015, (rc.z0 + rc.z1) / 2 * K);
        pnl.userData.step = rc.step; groups.cover.add(pnl);
      }
    }

    // ---- the nest boxes, with eggs; the ramp; the droppings board; the wheels ----
    const nb = d.nests;
    let nestEggs = [];
    if (nb) {
      const nW = nb.w * K, nD = nb.d * K, nH = nb.h * K, rowL = nb.rowL * K;
      const bx = nb.outside ? nb.x * K - st - nD / 2 : nb.x * K + nD / 2;
      const by = nb.y * K, bz = nb.z * K;
      const nm = std(COL.siding, { map: sidingTex([1, 1]) });
      const ng = new THREE.Group(); ng.userData.step = nb.outside ? 6 : 6;
      const bottom = box(nD, st, rowL, std(COL.ply)); bottom.position.set(0, st / 2, 0); ng.add(bottom);
      const sideHi = nH + 0.04;
      for (const zz of [-rowL / 2, rowL / 2]) { const e = box(nD, sideHi, st, nm); e.position.set(0, sideHi / 2, zz + (zz < 0 ? st / 2 : -st / 2)); ng.add(e); }
      const front = box(st, nb.lip * K, rowL, nm); front.position.set(nb.outside ? -nD / 2 : nD / 2, nb.lip * K / 2, 0); ng.add(front);
      for (let i = 1; i < nb.n; i++) { const dv = box(nD, nH * 0.8, st, std(COL.ply)); dv.position.set(0, nH * 0.4, -rowL / 2 + i * nW); ng.add(dv); }
      // straw and eggs in each box
      for (let i = 0; i < nb.n; i++) {
        const zc = -rowL / 2 + nW * (i + 0.5);
        const straw = box(nD * 0.86, 0.04, nW * 0.86, std(COL.straw, { map: strawTex([1, 1]), roughness: 1 })); straw.position.set(0, st + 0.02, zc); ng.add(straw);
        const ne = i === 0 ? 3 : 2;
        for (let k = 0; k < ne; k++) { const egg = makeEgg(COL.eggs[(i * 3 + k * 4 + 1) % COL.eggs.length], d.m.size === 'bantam' ? 0.8 : 1); egg.rotation.set(Math.PI / 2 * 0.9, 0, (k - 1) * 0.6); egg.position.set((k - 1) * 0.045, st + 0.06, zc + (k % 2 ? 0.035 : -0.03)); ng.add(egg); nestEggs.push(egg); }
      }
      // the lid, hinged at the wall and propped open in the whole view
      const lid = box(nD + 0.05, st, rowL + 0.05, std(COL.sidingDark, { roughness: 0.7 }));
      const hinge = new THREE.Group(); hinge.position.set(nb.outside ? nD / 2 : -nD / 2, sideHi, 0);
      lid.position.set(nb.outside ? -(nD + 0.05) / 2 : (nD + 0.05) / 2, 0, 0); hinge.add(lid);
      hinge.userData.lid = nb.outside ? -1.25 : 1.25; hinge.rotation.z = hinge.userData.lid;
      ng.add(hinge);
      ng.position.set(bx, by, bz);
      ng.traverse(o => { if (o.isMesh) { o.castShadow = true; o.receiveShadow = true; } });
      groups.ply.add(ng);
      path.nest = new THREE.Vector3(bx, by + 0.05, bz);
    }
    if (d.ramp) {
      const r = d.ramp, run = (r.x1 - r.x0) * K, rise = (r.y0 - r.y1) * K, L = Math.hypot(run, rise);
      const g = new THREE.Group();
      const plank = box(L, 0.018, r.w * K, std(COL.ply, { map: grainTex() })); g.add(plank);
      for (let k = 0, n = Math.max(2, Math.floor(L / 0.15)); k < n; k++) { const cl = box(0.02, 0.018, r.w * K * 0.9, std(COL.pineDark)); cl.position.set(-L / 2 + (k + 0.5) * L / n, 0.018, 0); g.add(cl); }
      g.position.set((r.x0 + r.x1) / 2 * K, (r.y0 + r.y1) / 2 * K, r.z * K);
      g.rotation.z = -Math.atan2(rise, run);
      g.userData.step = 6;
      g.traverse(o => { if (o.isMesh) { o.castShadow = true; o.receiveShadow = true; } });
      groups.ply.add(g);
    }
    if (d.droppings) {
      const dp = d.droppings;
      const b2 = box((dp.x1 - dp.x0) * K, st, (dp.z1 - dp.z0) * K, std(COL.ply)); b2.position.set((dp.x0 + dp.x1) / 2 * K, dp.y * K, (dp.z0 + dp.z1) / 2 * K); b2.userData.step = 6; groups.ply.add(b2);
    }
    if (d.parts.wheels) {
      const wh = d.parts.wheels;
      for (const z of wh.z) {
        const tyre = new THREE.Mesh(new THREE.CylinderGeometry(wh.r * K, wh.r * K, 0.06, 18), std(0x2b2b2b, { roughness: 0.9 }));
        tyre.rotation.x = Math.PI / 2; tyre.position.set(wh.x * K, wh.r * K, z * K); tyre.castShadow = true; tyre.userData.step = 6; groups.ply.add(tyre);
        const hub = new THREE.Mesh(new THREE.CylinderGeometry(wh.r * K * 0.45, wh.r * K * 0.45, 0.065, 12), std(0xb7bcc1, { metalness: 0.6, roughness: 0.35 }));
        hub.rotation.x = Math.PI / 2; hub.position.copy(tyre.position); hub.userData.step = 6; groups.ply.add(hub);
      }
    }

    // ---- life: hens in the run and on the lawn, a basket of eggs ----
    const breeds = ['red', 'buff', 'black', 'white', 'barred', 'red', 'buff'];
    const hs = d.m.size === 'bantam' ? 0.72 : 1;
    const runMinX = T === 'walkin' ? m.coop.w * K + 0.35 : T === 'house' ? m.coop.w * K + 0.4 : T === 'tractor' ? m.tr.hl * K + 0.35 : d.parts.aframe ? d.parts.aframe.HL * K + 0.3 : 0.3;
    const runMaxX = (T === 'walkin' ? x1All : runL) - 0.35;
    const nIn = Math.min(4, Math.max(2, Math.round(m.birds / 3)));
    for (let i = 0; i < nIn; i++) {
      const f = (i + 0.5) / nIn;
      const hen = makeHen(breeds[i % breeds.length], i % 2 ? 'peck' : 'stand', hs);
      const zz = runD * (0.3 + 0.4 * ((i * 37) % 10) / 10);
      const yy = T === 'tractor' ? w : 0;
      hen.position.set(runMinX + (runMaxX - runMinX) * f, yy, Math.min(runD - 0.25, Math.max(0.25, zz)));
      hen.rotation.y = (i * 1.7) % (Math.PI * 2);
      groups.life.add(hen);
    }
    // two hens out on the lawn in front, one by the garden bed
    for (const [x, z, b, pose, ry] of [[x1All * 0.22, runD + 0.75, 'buff', 'peck', 1.9], [x1All * 0.5, runD + 0.95, 'red', 'stand', -1.25], [bedX + 0.7, bedZ + 0.55, 'barred', 'peck', -0.4]]) {
      const hen = makeHen(b, pose, hs); hen.position.set(x, 0, z); hen.rotation.y = ry; groups.life.add(hen);
    }
    // a hen on the ramp
    if (d.ramp) {
      const r = d.ramp, f = 0.55;
      const hen = makeHen('white', 'stand', hs);
      hen.position.set((r.x0 + (r.x1 - r.x0) * f) * K, (r.y0 + (r.y1 - r.y0) * f) * K + 0.02, r.z * K);
      hen.rotation.y = -Math.PI / 2;
      groups.life.add(hen);
    }
    // a basket of eggs by the nest box
    if (nb && nb.outside) {
      const basket = new THREE.Group();
      const wv = std(0xb98a52, { roughness: 0.9, flatShading: true });
      const bowl = new THREE.Mesh(new THREE.CylinderGeometry(0.15, 0.11, 0.12, 12, 1, true), wv); bowl.position.y = 0.06; basket.add(bowl);
      const bot = new THREE.Mesh(new THREE.CircleGeometry(0.11, 12), wv); bot.rotation.x = -Math.PI / 2; bot.position.y = 0.002; basket.add(bot);
      const handle = new THREE.Mesh(new THREE.TorusGeometry(0.14, 0.008, 6, 20, Math.PI), wv); handle.position.y = 0.12; basket.add(handle);
      for (let k = 0; k < 7; k++) { const egg = makeEgg(COL.eggs[(k * 3) % COL.eggs.length], 1); egg.rotation.set(1.3, k, 0.4); egg.position.set(Math.cos(k * 0.9) * 0.07, 0.1, Math.sin(k * 0.9) * 0.07); basket.add(egg); }
      basket.traverse(o => { if (o.isMesh) { o.castShadow = true; o.receiveShadow = true; } });
      basket.position.set(nb.x * K - (nb.d * K) - 0.45, 0, nb.z * K + 0.55);
      groups.life.add(basket);
    }

    // ---- the hen path (run, ramp foot, pop door, nest box, roost) and the walker ----
    path = (res.path || []).map(p => ({ id: p.id, label: p.label, p: new THREE.Vector3(p.p[0] * K, p.p[1] * K, p.p[2] * K), walk: !!p.walk }));
    walker = makeHen('red', 'stand', hs); walker.visible = false; groups.life.add(walker);

    // what the camera has to show
    const hTop = Math.max(...d.members.map(x => Math.max(x.p0[1], x.p1[1]))) * K;
    const nx = nb && nb.outside ? nb.x * K - nb.d * K - 0.1 : 0;
    fitPts = [[nx, 0, 0], [x1All, 0, 0], [nx, 0, runD], [x1All, 0, runD], [nx, hTop, 0], [x1All, hTop, 0], [nx, hTop, runD], [x1All, hTop, runD]].map(p => new THREE.Vector3(...p));
    if (T === 'tractor') fitPts.push(new THREE.Vector3(x1All + 0.5, 0.4, runD / 2));
    const span = Math.max(x1All, runD, hTop) + 4;
    Object.assign(sun.shadow.camera, { left: -span, right: span, top: span, bottom: -span, near: 0.5, far: 80 });
    sun.shadow.camera.updateProjectionMatrix();
    placeSun();
    applyMode(mode, false);
    // dimension labels (frame view)
    const fp = res.footprint;
    addLabel([x1All / 2, 0.02, runD + 0.08], `${E.len(fp.x, m.units, 'dim')} long`, 'dim', 3);
    addLabel([x1All + 0.08, 0.02, runD / 2], `${E.len(fp.z, m.units, 'dim')} deep`, 'dim', 3);
    addLabel([C.x0 * K, hTop + 0.05, runD], `${E.len(hTop / K, m.units, 'dim')} to the top`, 'dim', 2);
    dirty = true;
  }
  function placeSun() {
    const c = new THREE.Vector3(last ? (last.m.type === 'walkin' ? (last.m.coop.w + last.design.run.L) : last.design.run.L) * K / 2 : 1, 0, last ? last.design.run.D * K / 2 : 1);
    sun.position.copy(c).addScaledVector(sunDir, 22); sun.target.position.copy(c);
  }

  // ---------- modes: whole coop, frame only, build steps ----------
  function setVisible(k, v) { if (groups[k]) groups[k].visible = v; }
  function applyMode(md, animate = true) {
    mode = md;
    const full = md === 'full';
    setVisible('mesh', md !== 'frame'); setVisible('cover', md !== 'frame'); setVisible('ply', md !== 'frame'); setVisible('life', full);
    groups.env && groups.env.children.forEach(o => { if (o.userData.apron) o.visible = !full; });
    if (md === 'steps' && animate && !reduced) anim = { kind: 'steps', t0: performance.now(), ms: 5600 };
    else { anim = null; explode(md === 'steps' && reduced ? 1 : 0, 99); }
    dirty = true; invalidate();
  }
  // e: 0 assembled, 1 apart; upTo: the steps shown (later ones hidden); hi: the step to highlight
  function explode(e, upTo = 99, hi = null) {
    if (!frameInst) return;
    const base = frameInst.userData.base, tmp = new THREE.Matrix4(), off = new THREE.Vector3(), col = new THREE.Color();
    base.forEach((b, i) => {
      const hide = b.step > upTo;
      const k = hi == null ? e : b.step === hi ? e : 0;
      off.copy(b.dir).multiplyScalar((0.14 + 0.05 * b.step) * k).add(new THREE.Vector3(0, 0.04 * b.step * k, 0));
      tmp.copy(b.m); if (hide) tmp.scale(new THREE.Vector3(0, 0, 0));
      tmp.elements[12] = b.c.x + off.x; tmp.elements[13] = b.c.y + off.y; tmp.elements[14] = b.c.z + off.z;
      frameInst.setMatrixAt(i, tmp);
      col.copy(b.color); if (hi != null && b.step === hi) col.setHex(COL.highlight);
      frameInst.setColorAt(i, col);
    });
    frameInst.instanceMatrix.needsUpdate = true; if (frameInst.instanceColor) frameInst.instanceColor.needsUpdate = true;
    for (const k of ['mesh', 'cover', 'ply']) groups[k] && groups[k].children.forEach(o => { const s = o.userData.step || 0; o.visible = s <= upTo; });
    groups.env && groups.env.children.forEach(o => { if (o.userData.step) o.visible = o.userData.step <= upTo && !(o.userData.apron && mode === 'full'); });
  }
  function animateSteps(tt) {
    const steps = [...new Set(frameInst.userData.base.map(b => b.step))].sort((a, b) => a - b).concat([9]);
    const uniq = [...new Set(steps)];
    const n = uniq.length, per = 1 / n;
    const base = frameInst.userData.base, tmp = new THREE.Matrix4(), off = new THREE.Vector3();
    base.forEach((b, i) => {
      const idx = uniq.indexOf(b.step), s0 = idx * per, local = Math.min(1, Math.max(0, (tt - s0) / per));
      const e = 1 - (1 - Math.pow(1 - local, 3));
      off.copy(b.dir).multiplyScalar((0.35 + 0.05 * b.step) * e).add(new THREE.Vector3(0, 0.25 * e, 0));
      tmp.copy(b.m); if (tt < s0) tmp.scale(new THREE.Vector3(0, 0, 0));
      tmp.elements[12] = b.c.x + off.x; tmp.elements[13] = b.c.y + off.y; tmp.elements[14] = b.c.z + off.z;
      frameInst.setMatrixAt(i, tmp);
    });
    frameInst.instanceMatrix.needsUpdate = true;
    for (const k of ['mesh', 'cover', 'ply']) groups[k].children.forEach(o => { const s = o.userData.step || 0; const idx = uniq.indexOf(s); o.visible = idx < 0 || tt >= (idx + 0.6) * per; });
  }
  // the hen walks its path; the siding fades so she can be seen inside
  function fadeSiding(on) { for (const mt of sidingMats) { mt.transparent = on; mt.opacity = on ? 0.28 : 1; mt.depthWrite = !on; mt.needsUpdate = true; } }
  function animateHen(tt) {
    if (!walker || path.length < 2) return;
    const segs = path.length - 1, f = Math.min(segs - 1e-6, tt * segs), i = Math.floor(f), u = f - i;
    const a = path[i].p, b = path[i + 1].p;
    const p = new THREE.Vector3().lerpVectors(a, b, u);
    if (!path[i + 1].walk && !path[i].walk) p.y += Math.sin(u * Math.PI) * (0.1 + Math.abs(b.y - a.y) * 0.3);
    walker.position.copy(p);
    const dx = b.x - a.x, dz = b.z - a.z; if (Math.abs(dx) + Math.abs(dz) > 1e-4) walker.rotation.y = Math.atan2(dx, dz);
  }

  // ---------- labels ----------
  function addLabel(pos, text, tone, priority) { labels.push({ p: new THREE.Vector3(...pos), text, tone, priority: priority || 1 }); }
  function placed(width, height, measure, list = labels) {
    const outL = [];
    for (const lb of list.slice().sort((a, b) => b.priority - a.priority)) {
      const v = lb.p.clone().project(camera);
      if (v.z > 1 || Math.abs(v.x) > 1.02 || Math.abs(v.y) > 1.02) continue;
      const wpx = measure(lb.text), hpx = 22;
      let x = (v.x + 1) / 2 * width, y = (1 - v.y) / 2 * height;
      const rect = () => ({ x0: x - wpx / 2 - 3, x1: x + wpx / 2 + 3, y0: y - hpx - 3, y1: y + 3 });
      let tries = 0;
      while (outL.some(o => { const a2 = rect(), b2 = o.rect; return a2.x0 < b2.x1 && b2.x0 < a2.x1 && a2.y0 < b2.y1 && b2.y0 < a2.y1; }) && tries < 4) { y -= hpx + 4; tries++; }
      if (tries >= 4) continue;
      x = Math.min(width - wpx / 2 - 6, Math.max(wpx / 2 + 6, x)); y = Math.max(hpx + 6, Math.min(height - 4, y));
      outL.push({ x, y, text: lb.text, tone: lb.tone, rect: rect() });
    }
    return outL;
  }
  let measurer = null;
  function measureFn(px) { if (!measurer) measurer = document.createElement('canvas').getContext('2d'); measurer.font = `600 ${px}px "Geologica", "Segoe UI", sans-serif`; return tx => measurer.measureText(tx).width + Math.round(px * 0.95); }
  function layoutLabels() {
    if (!labelsLayer) return;
    labelsLayer.textContent = '';
    const list = mode === 'frame' ? labels : henLabels;
    if (!list.length) return;
    const r = canvas.getBoundingClientRect();
    for (const tg of placed(r.width, r.height, measureFn(13.5), list)) {
      const el = document.createElement('span');
      el.className = 'co-tag co-tag-' + tg.tone; el.textContent = tg.text;
      el.style.transform = `translate(${Math.round(tg.x)}px, ${Math.round(tg.y)}px) translate(-50%, -100%)`;
      labelsLayer.appendChild(el);
    }
  }

  // ---------- cameras ----------
  function aim() {
    const tg = orbit.target, r = orbit.radius;
    persp.position.set(tg.x + r * Math.sin(orbit.phi) * Math.sin(orbit.theta), tg.y + r * Math.cos(orbit.phi), tg.z + r * Math.sin(orbit.phi) * Math.cos(orbit.theta));
    persp.lookAt(tg); persp.updateProjectionMatrix(); persp.updateMatrixWorld();
  }
  function fit(margin = 0.9) {
    const pts = fitPts.length ? fitPts : [new THREE.Vector3(), new THREE.Vector3(1, 1, 1)];
    const c = pts.reduce((a, p) => a.add(p), new THREE.Vector3()).multiplyScalar(1 / pts.length);
    orbit.target.copy(c);
    const right = new THREE.Vector3(), upv = new THREE.Vector3();
    let r = orbit.radius || 6;
    for (let i = 0; i < 14; i++) {
      orbit.radius = r; aim();
      let x0 = Infinity, x1 = -Infinity, y0 = Infinity, y1 = -Infinity;
      for (const p of pts) { const v = p.clone().project(persp); x0 = Math.min(x0, v.x); x1 = Math.max(x1, v.x); y0 = Math.min(y0, v.y); y1 = Math.max(y1, v.y); }
      const dist = persp.position.distanceTo(orbit.target);
      const hh = Math.tan(THREE.MathUtils.degToRad(persp.fov / 2)) * dist, ww = hh * persp.aspect;
      right.setFromMatrixColumn(persp.matrixWorld, 0); upv.setFromMatrixColumn(persp.matrixWorld, 1);
      orbit.target.addScaledVector(right, (x0 + x1) / 2 * ww).addScaledVector(upv, (y0 + y1) / 2 * hh);
      r = r * Math.max((x1 - x0) / 2 / margin, (y1 - y0) / 2 / (margin * 0.92));
    }
    orbit.radius = r;
  }
  function orthoView(v, aspect) {
    const xs = fitPts.map(p => p.x), ys = fitPts.map(p => p.y), zs = fitPts.map(p => p.z);
    const [xa, xb, ya, yb, za, zb] = [Math.min(...xs), Math.max(...xs), Math.min(...ys), Math.max(...ys), Math.min(...zs), Math.max(...zs)];
    let hw, hh;
    if (v === 'front') { hw = (xb - xa) / 2; hh = (yb - ya) / 2; ortho.up.set(0, 1, 0); ortho.position.set((xa + xb) / 2, (ya + yb) / 2, 100); ortho.lookAt((xa + xb) / 2, (ya + yb) / 2, 0); }
    else if (v === 'side') { hw = (zb - za) / 2; hh = (yb - ya) / 2; ortho.up.set(0, 1, 0); ortho.position.set(100, (ya + yb) / 2, (za + zb) / 2); ortho.lookAt(0, (ya + yb) / 2, (za + zb) / 2); }
    else { hw = (xb - xa) / 2; hh = (zb - za) / 2; ortho.up.set(0, 0, -1); ortho.position.set((xa + xb) / 2, 100, (za + zb) / 2); ortho.lookAt((xa + xb) / 2, 0, (za + zb) / 2); }
    hw *= 1.12; hh *= 1.12;
    if (hw / hh < aspect) hw = hh * aspect; else hh = hw / aspect;
    Object.assign(ortho, { left: -hw, right: hw, top: hh, bottom: -hh, zoom: 1 }); ortho.updateProjectionMatrix(); ortho.updateMatrixWorld();
  }
  function size() { return { w: canvas.clientWidth || canvas.width, h: canvas.clientHeight || canvas.height }; }
  function resize() { const { w, h } = size(); if (!w || !h) return; renderer.setSize(w, h, false); persp.aspect = w / h; dirty = true; }
  function render() {
    const { w, h } = size();
    camera = persp; persp.aspect = w / h; aim();
    if (anim) {
      const tt = Math.min(1, (performance.now() - anim.t0) / anim.ms);
      if (anim.kind === 'steps') animateSteps(tt);
      if (anim.kind === 'hen') animateHen(tt);
      if (tt >= 1) { const k = anim.kind; anim = null; if (k === 'steps') explode(0, 99); if (k === 'hen') { fadeSiding(false); } }
    }
    renderer.render(scene, camera);
    layoutLabels();
  }
  function loop() { raf = 0; if (dirty || anim) { dirty = false; render(); } if (anim) raf = requestAnimationFrame(loop); }
  function invalidate() { dirty = true; if (!raf) raf = requestAnimationFrame(loop); }

  // ---------- pointer and keyboard ----------
  const pointers = new Map(); let pinch0 = 0;
  canvas.addEventListener('pointerdown', e => { canvas.setPointerCapture(e.pointerId); pointers.set(e.pointerId, { x: e.clientX, y: e.clientY }); });
  canvas.addEventListener('pointermove', e => {
    if (!pointers.has(e.pointerId)) return;
    const prev = pointers.get(e.pointerId); pointers.set(e.pointerId, { x: e.clientX, y: e.clientY });
    if (pointers.size === 2) { const [a, b] = [...pointers.values()]; const dd = Math.hypot(a.x - b.x, a.y - b.y); if (pinch0) zoomBy(pinch0 / dd); pinch0 = dd; }
    else { orbit.theta -= (e.clientX - prev.x) * 0.008; orbit.phi = Math.min(1.5, Math.max(0.3, orbit.phi - (e.clientY - prev.y) * 0.006)); }
    invalidate();
  });
  const up = e => { pointers.delete(e.pointerId); if (pointers.size < 2) pinch0 = 0; };
  canvas.addEventListener('pointerup', up); canvas.addEventListener('pointercancel', up);
  function zoomBy(f) { orbit.radius = Math.min(60, Math.max(0.8, orbit.radius * f)); }
  canvas.addEventListener('wheel', e => { e.preventDefault(); zoomBy(Math.pow(1.0015, e.deltaY)); invalidate(); }, { passive: false });
  canvas.addEventListener('keydown', e => {
    const stp = { ArrowLeft: [0.12, 0], ArrowRight: [-0.12, 0], ArrowUp: [0, -0.08], ArrowDown: [0, 0.08] }[e.key];
    if (stp) { e.preventDefault(); orbit.theta += stp[0]; orbit.phi = Math.min(1.5, Math.max(0.3, orbit.phi + stp[1])); invalidate(); }
    if (e.key === '+' || e.key === '=') { zoomBy(0.9); invalidate(); }
    if (e.key === '-') { zoomBy(1.1); invalidate(); }
  });
  const ro = typeof ResizeObserver === 'function' ? new ResizeObserver(() => { resize(); invalidate(); }) : null;
  if (ro) ro.observe(canvas);

  return {
    update(res) {
      const keepView = last && last.m.type === res.m.type;
      last = res; build(res); henLabels = [];
      const { w, h } = size(); persp.aspect = (w || 16) / (h || 10);
      if (!keepView) { orbit.theta = -0.62; orbit.phi = 1.15; }
      fit(); resize(); invalidate();
    },
    setMode(md) { applyMode(md, true); },
    get mode() { return mode; },
    // the sun for an hour of a June day: altitude and compass bearing in degrees, and the way the coop faces
    setSun(alt, bearing, facing) {
      const F = facing * Math.PI / 180, b = bearing * Math.PI / 180, a = alt * Math.PI / 180;
      const e = Math.cos(a) * Math.sin(b), n = Math.cos(a) * Math.cos(b);
      sunDir = new THREE.Vector3(e * Math.cos(F) - n * Math.sin(F), Math.max(0.03, Math.sin(a)), e * Math.sin(F) + n * Math.cos(F)).normalize();
      sun.intensity = alt > 0 ? (alt < 20 ? 3.4 : 2.6 + 0.7 * Math.min(1, alt / 50)) : 0.25;
      sun.color.setHex(alt < 10 ? 0xffb878 : alt < 22 ? 0xffcf98 : alt < 38 ? 0xffe2bd : 0xfff4e6);
      hemi.intensity = alt < 22 ? 1.0 : 1.2;
      placeSun(); invalidate();
    },
    // the hen walks from the run up the ramp to the nest box and the roost; tags name each step
    walkHen(tags) {
      if (!walker || path.length < 2) return;
      henLabels = path.filter(p => tags && tags[p.id]).map(p => ({ p: p.p.clone().add(new THREE.Vector3(0, 0.42, 0)), text: tags[p.id].text, tone: tags[p.id].tone === 'info' ? 'dim' : tags[p.id].tone, priority: tags[p.id].tone === 'fail' ? 9 : tags[p.id].tone === 'check' ? 7 : 4 }));
      applyMode('full', false);
      walker.visible = true; fadeSiding(true);
      anim = reduced ? null : { kind: 'hen', t0: performance.now(), ms: 1300 * Math.max(2, path.length - 1) };
      if (reduced) animateHen(1);
      invalidate();
    },
    get path() { return path.map(p => ({ id: p.id, x: p.p.x, y: p.p.y, z: p.p.z, walk: !!p.walk })); },
    // one image: a view ('iso', 'hero', 'front', 'side', 'plan'), with build steps up to `upTo` and `hi` highlighted;
    // `focus` names a point of the hen path ('nest', 'roost', 'ramp', 'run') to frame close up, `focusR` metres away
    snapshot({ width, height, view = 'iso', type = 'image/png', quality = 0.92, theta, phi, zoom, upTo = 99, hi = null, explodeBy = 0, labelPx = 14, henOn = true, envOn = true, lidOpen = true, focus = null, focusR = 2.4 } = {}) {
      const saved = { theta: orbit.theta, phi: orbit.phi, radius: orbit.radius, target: orbit.target.clone(), pr: renderer.getPixelRatio(), mode };
      anim = null; fadeSiding(false);
      renderer.setPixelRatio(1); renderer.setSize(width, height, false);
      setVisible('life', henOn && view !== 'front' && view !== 'side' && view !== 'plan'); setVisible('env', envOn);
      setVisible('mesh', true); setVisible('cover', true); setVisible('ply', true);
      if (walker) walker.visible = false;
      world.traverse(o => { if (o.userData && o.userData.lid) o.rotation.z = lidOpen ? o.userData.lid : 0; });
      explode(explodeBy, upTo, hi);
      if (view === 'front' || view === 'side' || view === 'plan') { orthoView(view, width / height); camera = ortho; }
      else { camera = persp; persp.aspect = width / height; if (theta != null) orbit.theta = theta; if (phi != null) orbit.phi = phi; fit(view === 'hero' ? 0.98 : 0.9); if (zoom) orbit.radius *= zoom;
        const fp = focus && path.find(p => p.id === focus); if (fp) { orbit.target.copy(fp.p); orbit.radius = focusR; }
        aim(); }
      renderer.render(scene, camera);
      const url = canvas.toDataURL(type, quality);
      const tags = placed(width, height, measureFn(labelPx)).map(tg => ({ x: tg.x, y: tg.y, text: tg.text, tone: tg.tone }));
      orbit.theta = saved.theta; orbit.phi = saved.phi; orbit.radius = saved.radius; orbit.target.copy(saved.target);
      setVisible('env', true); camera = persp;
      renderer.setPixelRatio(saved.pr); resize(); applyMode(saved.mode, false);
      return { url, tags };
    },
    // the model for SketchUp or Blender: the coop itself, without the yard and the hens
    exportObject() {
      const g = new THREE.Group(); g.name = 'coop';
      if (frameInst) {
        const frame = new THREE.Group(); frame.name = 'frame';
        const matE = new THREE.MeshStandardMaterial({ color: COL.pine, roughness: 0.78 });
        const mm = new THREE.Matrix4();
        last.design.members.forEach((x, i) => { frameInst.getMatrixAt(i, mm); const b = new THREE.Mesh(new THREE.BoxGeometry(1, 1, 1), matE); b.applyMatrix4(mm); b.name = `${x.id} ${x.where}`; frame.add(b); });
        g.add(frame);
      }
      for (const k of ['mesh', 'cover', 'ply']) if (groups[k]) { const c = groups[k].clone(true); c.name = k; g.add(c); }
      return g;
    },
    get three() { return THREE; },
    dispose() { cancelAnimationFrame(raf); if (ro) ro.disconnect(); disposeTree(world); renderer.dispose(); },
  };
}
