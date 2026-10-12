/* Catio Designer: the live 3D model. An ES module loaded only when the 3D view starts, never on first paint.
 * Draws the design the engine built, piece by piece in cedar: every board of the frame, the mesh as a fine wire
 * grid with a metal sheen, the roof panels, the plywood floor, shelves and ramp, the door, the tunnel and the
 * add-ons; and round it the house wall with its sash window (or the balcony, or the lawn), at golden hour.
 * A marmalade tabby and a small bird, both our own low-poly models built here from primitives, need no asset licence.
 * Modes: the whole catio, the frame only, and the build steps (boards slide in, in assembly order). The sun can be
 * moved through the longest day; the cat can walk its path from the window over the shelves.
 * The same module renders the offline hero images, the Open Graph image and the views in the Pro PDF.
 * three.js 0.185.1 (MIT), shared with Without Planning from /without-planning/vendor/. */
import * as THREE from '/without-planning/vendor/three.module.min.js';

const K = 0.001; // millimetres to metres
const COL = {
  skyTop: 0xcfc4f2, skyLow: 0xffd9b8, ground: 0x9fb27a, patio: 0xc9bfae, slab: 0xc9c4bf,
  cedar: 0xc98a4b, cedarDark: 0xa86f38, cedarLight: 0xd99c5d, ply: 0xe2c89a, wire: 0x6f767e,
  siding: 0xe9e4ef, sidingLine: 0xc9c1d6, brick: 0xa45a46, stucco: 0xe8dfd3, trim: 0xfbfaf7, glass: 0x9fb8cc, inside: 0x2a1f38,
  poly: 0xe6f0f6, solid: 0x7b7f8c, cloth: 0x3b3150, cat: 0xff8a3d, catDark: 0xc4581a, catLight: 0xffd2a8, bird: 0x2e5bff, birdBreast: 0xff8a3d,
  leaf: 0x4f8a3a, leafDark: 0x3b6e2c, bark: 0x6b4a33, highlight: 0xff8a3d, plum: 0x24123a, fits: 0x2bb673, fail: 0xc2253d,
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
// one cell of welded mesh: wire along two edges, transparent inside
const wireTex = rep => canvasTex('wire', 64, (x, s) => { x.clearRect(0, 0, s, s); x.fillStyle = 'rgba(255,255,255,0.92)'; x.fillRect(0, 0, s, 3); x.fillRect(0, 0, 3, s); x.fillStyle = '#ffffff'; x.fillRect(0, 0, 5, 5); }, rep);
const sidingTex = rep => canvasTex('siding', 256, (x, s) => {
  x.fillStyle = '#e9e4ef'; x.fillRect(0, 0, s, s);
  for (let i = 0; i < 4; i++) { const y = i * s / 4; const g = x.createLinearGradient(0, y, 0, y + s / 4); g.addColorStop(0, '#f3effa'); g.addColorStop(0.85, '#e4deec'); g.addColorStop(1, '#c9c1d6'); x.fillStyle = g; x.fillRect(0, y, s, s / 4); }
}, rep);
const brickTex = rep => canvasTex('brick', 256, (x, s) => {
  x.fillStyle = '#d8cfc6'; x.fillRect(0, 0, s, s);
  const bh = s / 8, bw = s / 4;
  for (let r = 0; r < 8; r++) for (let k = -1; k < 5; k++) { const off = r % 2 ? bw / 2 : 0; const sh = 150 + ((r * 7 + k * 13) % 5) * 9; x.fillStyle = `rgb(${sh},${80 + (k * 5 + r * 3) % 20},${62 + (r * 11) % 14})`; x.fillRect(k * bw + off + 2, r * bh + 2, bw - 4, bh - 4); }
}, rep);
const grassTex = rep => canvasTex('grass', 256, (x, s) => {
  x.fillStyle = '#9db27a'; x.fillRect(0, 0, s, s);
  let seed = 7; const rnd = () => (seed = (seed * 16807) % 2147483647) / 2147483647;
  for (let i = 0; i < 5200; i++) { const g = 100 + Math.floor(rnd() * 70); x.fillStyle = `rgba(${60 + Math.floor(rnd() * 50)},${g},${45 + Math.floor(rnd() * 30)},${0.18 + rnd() * 0.3})`; x.fillRect(rnd() * s, rnd() * s, 1 + rnd() * 2, 2 + rnd() * 3); }
}, rep);
const paverTex = rep => canvasTex('paver', 256, (x, s) => {
  x.fillStyle = '#cbc1b1'; x.fillRect(0, 0, s, s); x.strokeStyle = 'rgba(110,98,84,0.5)'; x.lineWidth = 3;
  for (let i = 0; i <= 2; i++) { x.beginPath(); x.moveTo(0, i * s / 2); x.lineTo(s, i * s / 2); x.stroke(); x.beginPath(); x.moveTo(i * s / 2, 0); x.lineTo(i * s / 2, s); x.stroke(); }
}, rep);
const grainTex = () => canvasTex('grain', 256, (x, s) => {
  x.fillStyle = '#ffffff'; x.fillRect(0, 0, s, s);
  for (let i = 0; i < 90; i++) { x.strokeStyle = `rgba(120,70,30,${0.05 + (i % 7) * 0.012})`; x.lineWidth = 1 + (i % 3); x.beginPath(); const y = (i * 53) % s; x.moveTo(0, y); x.bezierCurveTo(s * 0.3, y + 6, s * 0.7, y - 6, s, y + 2); x.stroke(); }
});

// ---------- the cat and the bird: low-poly, built from primitives ----------
function stripes(geo, axis = 'x', freq = 26, dark = COL.catDark, base = COL.cat, belly = COL.catLight) {
  const pos = geo.attributes.position, colors = [], c = new THREE.Color();
  for (let i = 0; i < pos.count; i++) {
    const v = pos.getComponent(i, axis === 'x' ? 0 : axis === 'y' ? 1 : 2), y = pos.getY(i);
    if (y < -0.55) c.setHex(belly); else c.setHex(Math.sin(v * freq) > 0.45 ? dark : base);
    colors.push(c.r, c.g, c.b);
  }
  geo.setAttribute('color', new THREE.Float32BufferAttribute(colors, 3));
  return geo;
}
export function makeCat() {
  const g = new THREE.Group();
  const fur = new THREE.MeshStandardMaterial({ vertexColors: true, flatShading: true, roughness: 0.95 });
  const solid = c => new THREE.MeshStandardMaterial({ color: c, flatShading: true, roughness: 0.9 });
  // sitting tabby, about 0.30 m tall to the ears, facing +z
  const body = new THREE.Mesh(stripes(new THREE.IcosahedronGeometry(1, 1).toNonIndexed(), 'y', 9), fur);
  body.scale.set(0.085, 0.115, 0.1); body.position.set(0, 0.11, 0); body.rotation.x = -0.18; g.add(body);
  const haunch = new THREE.Mesh(stripes(new THREE.IcosahedronGeometry(1, 1).toNonIndexed(), 'x', 7), fur);
  haunch.scale.set(0.1, 0.07, 0.11); haunch.position.set(0, 0.06, -0.035); g.add(haunch);
  const head = new THREE.Mesh(stripes(new THREE.IcosahedronGeometry(1, 1).toNonIndexed(), 'x', 6), fur);
  head.scale.set(0.062, 0.055, 0.058); head.position.set(0, 0.235, 0.035); g.add(head);
  const muzzle = new THREE.Mesh(new THREE.IcosahedronGeometry(1, 0), solid(COL.catLight)); muzzle.scale.set(0.028, 0.02, 0.022); muzzle.position.set(0, 0.218, 0.083); g.add(muzzle);
  const nose = new THREE.Mesh(new THREE.TetrahedronGeometry(0.008), solid(0xd77a8a)); nose.position.set(0, 0.228, 0.1); g.add(nose);
  for (const s of [-1, 1]) {
    const ear = new THREE.Mesh(new THREE.ConeGeometry(0.022, 0.05, 3), solid(COL.cat)); ear.position.set(s * 0.034, 0.29, 0.03); ear.rotation.set(0.1, 0, -s * 0.28); g.add(ear);
    const inner = new THREE.Mesh(new THREE.ConeGeometry(0.012, 0.03, 3), solid(0xf2b9a4)); inner.position.set(s * 0.034, 0.286, 0.04); inner.rotation.set(0.1, 0, -s * 0.28); g.add(inner);
    const eye = new THREE.Mesh(new THREE.SphereGeometry(0.009, 8, 6), solid(0x6fa24a)); eye.position.set(s * 0.024, 0.245, 0.083); g.add(eye);
    const pupil = new THREE.Mesh(new THREE.BoxGeometry(0.003, 0.012, 0.002), solid(0x1a1222)); pupil.position.set(s * 0.024, 0.245, 0.092); g.add(pupil);
    const leg = new THREE.Mesh(new THREE.CylinderGeometry(0.014, 0.017, 0.13, 6), solid(COL.cat)); leg.position.set(s * 0.03, 0.065, 0.055); g.add(leg);
    const paw = new THREE.Mesh(new THREE.IcosahedronGeometry(0.018, 0), solid(COL.catLight)); paw.scale.set(1, 0.6, 1.3); paw.position.set(s * 0.03, 0.008, 0.065); g.add(paw);
  }
  const tailCurve = new THREE.CatmullRomCurve3([new THREE.Vector3(0, 0.03, -0.12), new THREE.Vector3(0.09, 0.015, -0.08), new THREE.Vector3(0.11, 0.012, 0.02), new THREE.Vector3(0.06, 0.02, 0.09)]);
  const tail = new THREE.Mesh(stripes(new THREE.TubeGeometry(tailCurve, 14, 0.016, 5, false).toNonIndexed(), 'x', 60), fur); g.add(tail);
  g.traverse(o => { if (o.isMesh) { o.castShadow = true; o.receiveShadow = true; } });
  g.userData.height = 0.31;
  return g;
}
export function makeBird() {
  const g = new THREE.Group();
  const m = c => new THREE.MeshStandardMaterial({ color: c, flatShading: true, roughness: 0.8 });
  const body = new THREE.Mesh(new THREE.IcosahedronGeometry(1, 1), m(COL.bird)); body.scale.set(0.045, 0.04, 0.065); body.position.y = 0.045; g.add(body);
  const breast = new THREE.Mesh(new THREE.IcosahedronGeometry(1, 1), m(COL.birdBreast)); breast.scale.set(0.036, 0.032, 0.04); breast.position.set(0, 0.04, 0.03); g.add(breast);
  const head = new THREE.Mesh(new THREE.IcosahedronGeometry(0.03, 1), m(COL.bird)); head.position.set(0, 0.085, 0.045); g.add(head);
  const beak = new THREE.Mesh(new THREE.ConeGeometry(0.008, 0.024, 4), m(0x3a2a1a)); beak.rotation.x = Math.PI / 2; beak.position.set(0, 0.083, 0.08); g.add(beak);
  const tail = new THREE.Mesh(new THREE.BoxGeometry(0.03, 0.008, 0.06), m(0x2440c9)); tail.position.set(0, 0.05, -0.07); tail.rotation.x = -0.35; g.add(tail);
  for (const s of [-1, 1]) { const eye = new THREE.Mesh(new THREE.SphereGeometry(0.005, 6, 4), m(0x111111)); eye.position.set(s * 0.018, 0.092, 0.062); g.add(eye); const wing = new THREE.Mesh(new THREE.IcosahedronGeometry(1, 0), m(0x2347d6)); wing.scale.set(0.012, 0.03, 0.055); wing.position.set(s * 0.04, 0.05, -0.005); wing.rotation.x = 0.2; g.add(wing); }
  g.traverse(o => { if (o.isMesh) { o.castShadow = true; } });
  return g;
}

// ---------- the scene ----------
export function createScene(canvas, opts = {}) {
  const reduced = opts.reducedMotion ?? (typeof matchMedia === 'function' && matchMedia('(prefers-reduced-motion: reduce)').matches);
  const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, preserveDrawingBuffer: !!opts.preserve, powerPreference: 'low-power', alpha: false });
  renderer.setPixelRatio(Math.min(opts.pixelRatio || window.devicePixelRatio || 1, 2));
  renderer.shadowMap.enabled = true; renderer.shadowMap.type = THREE.PCFSoftShadowMap;
  renderer.outputColorSpace = THREE.SRGBColorSpace; renderer.toneMapping = THREE.ACESFilmicToneMapping; renderer.toneMappingExposure = 1.08;
  const scene = new THREE.Scene();
  scene.background = canvasTex('sky', 256, (x, s) => { const g = x.createLinearGradient(0, 0, 0, s); g.addColorStop(0, '#cbbff0'); g.addColorStop(0.62, '#f2d9e2'); g.addColorStop(1, '#ffd2ad'); x.fillStyle = g; x.fillRect(0, 0, s, s); });
  scene.background.wrapS = scene.background.wrapT = THREE.ClampToEdgeWrapping;
  const persp = new THREE.PerspectiveCamera(36, 1, 0.05, 200);
  const ortho = new THREE.OrthographicCamera(-1, 1, 1, -1, 0.05, 400);
  let camera = persp;
  const hemi = new THREE.HemisphereLight(0xe9dcff, 0xd2a37a, 1.15); scene.add(hemi);
  const sun = new THREE.DirectionalLight(0xffd6a6, 3.2);
  sun.castShadow = true; sun.shadow.mapSize.set(2048, 2048); sun.shadow.bias = -0.0005; sun.shadow.normalBias = 0.02; sun.shadow.radius = 3;
  scene.add(sun, sun.target);
  const world = new THREE.Group(); scene.add(world);
  const labelsLayer = opts.labels || null;
  let labels = [];
  const orbit = { theta: 0.62, phi: 1.12, radius: 6, target: new THREE.Vector3() };
  let dirty = true, raf = 0, anim = null, mode = 'full', last = null, frameInst = null, cat = null, bird = null, path = [], fitPts = [];
  let sunDir = new THREE.Vector3(-0.5, 0.45, 0.75).normalize();
  const groups = {};

  function build(res) {
    disposeTree(world); world.clear(); labels = []; frameInst = null; path = [];
    const d = res.design, m = res.m;
    const W = d.W * K, Dp = d.D * K, Hb = d.Hb * K, Hf = d.Hf * K;
    const top = z => d.top(z / K) * K;
    for (const k of ['env', 'frame', 'mesh', 'cover', 'ply', 'life']) { groups[k] = new THREE.Group(); groups[k].name = k; world.add(groups[k]); }

    // ---- surroundings ----
    const groundY = m.type === 'window' ? -0.95 : 0;
    const gw = Math.max(14, W + 10), gd = Math.max(14, Dp + 10);
    const grass = new THREE.Mesh(new THREE.PlaneGeometry(gw, gd), std(0xffffff, { map: grassTex([gw / 1.5, gd / 1.5]), roughness: 1 }));
    grass.rotation.x = -Math.PI / 2; grass.position.set(W / 2, groundY - 0.002, gd / 2 - 2.5); grass.receiveShadow = true; groups.env.add(grass);
    if (m.type === 'leanto' || (m.type === 'free' && m.floor !== 'ground' && m.floor !== 'meshfloor')) {
      const pw = W + 1.2, pd = Dp + 1.0;
      const patio = new THREE.Mesh(new THREE.PlaneGeometry(pw, pd), std(0xffffff, { map: paverTex([pw / 0.9, pd / 0.9]), roughness: 0.95 }));
      patio.rotation.x = -Math.PI / 2; patio.position.set(W / 2, groundY + 0.001, pd / 2 - 0.1); patio.receiveShadow = true; groups.env.add(patio);
    }
    const wallZ = m.type === 'free' ? -(m.tunnel.l * K) : 0;
    if (m.type !== 'free' || m.tunnel.l > 0) {
      // the house wall, with its cladding and the window or door the cat comes through
      const hw = W + 3.2, hh = Math.max(Hb + 1.6, 3.2) - groundY, hx = W / 2;
      const map = m.wall === 'masonry' ? brickTex([hw / 1.2, hh / 0.6]) : sidingTex([hw / 1.6, hh / 0.8]);
      const wallMat = m.wall === 'stucco' ? std(COL.stucco, { roughness: 1 }) : std(0xffffff, { map, roughness: 0.9 });
      const house = box(hw, hh, 0.3, wallMat); house.position.set(hx, groundY + hh / 2, wallZ - 0.15); house.castShadow = false; groups.env.add(house);
      const ww = m.win.w * K, wh = m.win.h * K, wy = (m.type === 'free' ? m.win.sill : m.win.sill) * K, wx = m.type === 'free' ? (d.tunnel ? (d.tunnel.x0 + d.tunnel.w / 2) * K : W / 2) : W / 2;
      const trim = std(COL.trim, { roughness: 0.6 });
      const tw = 0.07;
      const inside = new THREE.Mesh(new THREE.PlaneGeometry(ww, wh), std(COL.inside, { roughness: 1 })); inside.position.set(wx, wy + wh / 2, wallZ + 0.002); groups.env.add(inside);
      for (const [x, y, w2, h2] of [[wx, wy - tw / 2, ww + 2 * tw, tw], [wx, wy + wh + tw / 2, ww + 2 * tw, tw], [wx - ww / 2 - tw / 2, wy + wh / 2, tw, wh], [wx + ww / 2 + tw / 2, wy + wh / 2, tw, wh]]) { const b = box(w2, h2, 0.06, trim); b.position.set(x, y, wallZ + 0.03); groups.env.add(b); }
      if (m.type !== 'balcony' && wh < 2.0) {
        // a sash window above the opening: the lower sash is raised behind the upper one
        const sashH = wh * 0.9, sy = wy + wh + tw;
        const frame = box(ww + 2 * tw, sashH + tw, 0.06, trim); frame.position.set(wx, sy + sashH / 2, wallZ + 0.03); groups.env.add(frame);
        const glass = new THREE.Mesh(new THREE.PlaneGeometry(ww - 0.04, sashH - 0.06), std(COL.glass, { roughness: 0.08, metalness: 0.3, transparent: true, opacity: 0.85 })); glass.position.set(wx, sy + sashH / 2, wallZ + 0.064); groups.env.add(glass);
        const bar = box(ww, 0.035, 0.03, trim); bar.position.set(wx, sy + sashH / 2, wallZ + 0.07); groups.env.add(bar);
        const sill = box(ww + 0.2, 0.04, 0.12, trim); sill.position.set(wx, wy - tw - 0.02, wallZ + 0.06); if (m.type !== 'window') groups.env.add(sill);
      }
    }
    if (m.type === 'balcony') {
      const slab = box(W + 2.4, 0.2, Dp + 1.4, std(COL.slab, { roughness: 0.95 })); slab.position.set(W / 2, -0.1, (Dp + 1.4) / 2); groups.env.add(slab);
      if (d.ceiling) { const ceil = box(W + 2.4, 0.16, Dp + 0.5, std(COL.slab, { roughness: 0.95 })); ceil.position.set(W / 2, Hb + 0.08, (Dp + 0.5) / 2); ceil.castShadow = true; ceil.userData.ceiling = true; groups.env.add(ceil); }
      for (const [s, x] of [['left', -0.1], ['right', W + 0.1]]) if (m.bal[s]) { const wl = box(0.2, Hb, Dp + 1.2, std(COL.stucco, { roughness: 1 })); wl.position.set(x, Hb / 2, (Dp + 1.2) / 2); groups.env.add(wl); }
    }

    // ---- the frame: every member, one instanced mesh ----
    const mem = d.members;
    const geo = new THREE.BoxGeometry(1, 1, 1);
    const mat = new THREE.MeshStandardMaterial({ color: 0xffffff, map: grainTex(), roughness: 0.78, metalness: 0 });
    frameInst = new THREE.InstancedMesh(geo, mat, Math.max(1, mem.length));
    frameInst.castShadow = true; frameInst.receiveShadow = true;
    const base = [], centre = new THREE.Vector3(W / 2, Hb / 2, Dp / 2);
    const tmp = new THREE.Matrix4(), col = new THREE.Color();
    mem.forEach((x, i) => {
      const p0 = new THREE.Vector3(...x.p0).multiplyScalar(K), p1 = new THREE.Vector3(...x.p1).multiplyScalar(K);
      const dir = p1.clone().sub(p0); const L = dir.length(); dir.normalize();
      let up = x.up ? new THREE.Vector3(...x.up) : Math.abs(dir.y) < 0.9 ? new THREE.Vector3(0, 1, 0) : new THREE.Vector3(0, 0, 1);
      up.sub(dir.clone().multiplyScalar(up.dot(dir))).normalize();
      if (!x.up && x.kind === 'brace') { const n = dir.clone().cross(new THREE.Vector3(0, 1, 0)); if (n.lengthSq() < 1e-6) n.set(1, 0, 0); up = n.normalize().cross(dir).normalize(); if (Math.abs(dir.x) > Math.abs(dir.z) && Math.abs(dir.y) > 0.2) up = new THREE.Vector3(0, 0, 1).sub(dir.clone().multiplyScalar(dir.z)).normalize(); }
      const side = dir.clone().cross(up).normalize();
      const c = p0.clone().add(p1).multiplyScalar(0.5);
      tmp.makeBasis(dir, up, side).scale(new THREE.Vector3(Math.max(L, 0.001), x.a * K, x.b * K)).setPosition(c);
      frameInst.setMatrixAt(i, tmp);
      const shade = [COL.cedar, COL.cedarLight, COL.cedarDark][(i * 7) % 3];
      col.setHex(shade).lerp(new THREE.Color(COL.cedar), 0.55);
      frameInst.setColorAt(i, col);
      const away = c.clone().sub(centre); if (away.lengthSq() < 1e-6) away.set(0, 1, 0);
      base.push({ m: tmp.clone(), c, step: x.step, dir: away.normalize(), color: col.clone(), len: L });
    });
    frameInst.instanceMatrix.needsUpdate = true; if (frameInst.instanceColor) frameInst.instanceColor.needsUpdate = true;
    frameInst.userData.base = base;
    groups.frame.add(frameInst);

    // ---- mesh ----
    const me = res.mesh.mesh;
    const pitch = (me && me.open ? me.open[1] : 12.7) * K;
    const meshMat = (w, h) => new THREE.MeshStandardMaterial({ color: me && me.kind === 'screen' ? 0x6c6f78 : me && me.kind === 'vinyl' ? 0x2b3a2e : COL.wire, metalness: me && me.kind === 'screen' ? 0 : 0.45, roughness: 0.45, alphaMap: null, map: wireTex([w / pitch, h / pitch]), transparent: true, depthWrite: false, side: THREE.DoubleSide, opacity: me && me.kind === 'screen' ? 0.55 : 1 });
    const addPlane = (pts, step) => {
      // pts: four or more corners in metres, in a plane; UVs from the longest edge
      const shape = new THREE.Shape();
      const a = new THREE.Vector3(...pts[0]), u = new THREE.Vector3(...pts[1]).sub(a), v = new THREE.Vector3(...pts[pts.length - 1]).sub(a);
      const uL = u.length(), vL = v.length(); const ux = u.clone().normalize(), vy = v.clone().sub(ux.clone().multiplyScalar(v.dot(ux))).normalize();
      const flat = pts.map(p => { const q = new THREE.Vector3(...p).sub(a); return [q.dot(ux), q.dot(vy)]; });
      shape.moveTo(...flat[0]); for (const f of flat.slice(1)) shape.lineTo(...f); shape.closePath();
      const g = new THREE.ShapeGeometry(shape);
      const uvs = g.attributes.uv; for (let i = 0; i < uvs.count; i++) uvs.setXY(i, g.attributes.position.getX(i) / uL, g.attributes.position.getY(i) / vL);
      const mesh = new THREE.Mesh(g, meshMat(uL, vL));
      const basis = new THREE.Matrix4().makeBasis(ux, vy, ux.clone().cross(vy)); mesh.applyMatrix4(basis); mesh.position.copy(a);
      mesh.userData.step = step; mesh.castShadow = false; mesh.receiveShadow = false;
      groups.mesh.add(mesh); return mesh;
    };
    const out = 0.004;
    const zF = Dp + out;
    if (d.door) {
      const xa = (d.door.xa + d.t) * K, xb = d.door.xb * K, hT = top(d.D);
      addPlane([[0, 0, zF], [xa, 0, zF], [xa, hT, zF], [0, hT, zF]], 6);
      addPlane([[xb, 0, zF], [W, 0, zF], [W, hT, zF], [xb, hT, zF]], 6);
      if (d.door.header) addPlane([[xa, d.door.hdrY * K, zF], [xb, d.door.hdrY * K, zF], [xb, hT, zF], [xa, hT, zF]], 6);
      const x0 = d.door.x0 * K, y0 = d.door.y0 * K, dw = d.door.w * K, dh = d.door.h * K;
      addPlane([[x0, y0, zF + 0.002], [x0 + dw, y0, zF + 0.002], [x0 + dw, y0 + dh, zF + 0.002], [x0, y0 + dh, zF + 0.002]], 6);
      // hinges and latch
      const hw2 = std(0x55505c, { metalness: 0.7, roughness: 0.35 });
      for (const y of (dh >= 1.5 ? [0.18, dh / 2, dh - 0.18] : [0.18, dh - 0.18])) { const h = box(0.03, 0.09, 0.012, hw2); h.position.set(x0 + 0.012, y0 + y, zF + 0.008); groups.cover.add(h); }
      const latch = box(0.06, 0.03, 0.03, hw2); latch.position.set(x0 + dw - 0.04, y0 + dh * 0.55, zF + 0.02); groups.cover.add(latch);
    } else {
      const hT = top(d.D);
      addPlane([[0, 0, zF], [W, 0, zF], [W, hT, zF], [0, hT, zF]], 6);
    }
    const zb0 = 0;
    if (d.hasLeft) addPlane([[-out, 0, Dp], [-out, 0, zb0], [-out, top(0), zb0], [-out, top(d.D), Dp]], 6);
    if (d.hasRight) addPlane([[W + out, 0, zb0], [W + out, 0, Dp], [W + out, top(d.D), Dp], [W + out, top(0), zb0]], 6);
    if (!d.attached) addPlane([[W, 0, -out], [0, 0, -out], [0, top(0), -out], [W, top(0), -out]], 6);
    const roofY = z => top(z) + (d.hasRoof ? d.t * K : 0);
    if (d.hasRoof && m.roof === 'mesh') addPlane([[0, roofY(0) + out, 0], [W, roofY(0) + out, 0], [W, roofY(d.D) + out, Dp], [0, roofY(d.D) + out, Dp]], 9);
    if (m.floor === 'meshfloor') addPlane([[0, 0.003, 0], [0, 0.003, Dp], [W, 0.003, Dp], [W, 0.003, 0]], 6);
    if (d.tunnel) {
      const T = d.tunnel, x0 = T.x0 * K, x1 = (T.x0 + T.w) * K, y0 = T.y * K, y1 = (T.y + T.h) * K, z1 = -T.l * K;
      addPlane([[x0 - out, y0, 0], [x0 - out, y0, z1], [x0 - out, y1, z1], [x0 - out, y1, 0]], 7);
      addPlane([[x1 + out, y0, z1], [x1 + out, y0, 0], [x1 + out, y1, 0], [x1 + out, y1, z1]], 7);
      addPlane([[x0, y1 + out, 0], [x1, y1 + out, 0], [x1, y1 + out, z1], [x0, y1 + out, z1]], 7);
    }
    if (d.bridge) {
      const B = d.bridge, z0 = B.z0 * K, z1 = (B.z0 + B.w) * K, y0 = B.y * K, y1 = (B.y + B.h) * K, x0 = B.x0 * K, x1 = B.x1 * K;
      addPlane([[x0, y0, z1 + out], [x1, y0, z1 + out], [x1, y1, z1 + out], [x0, y1, z1 + out]], 8);
      addPlane([[x1, y0, z0 - out], [x0, y0, z0 - out], [x0, y1, z0 - out], [x1, y1, z0 - out]], 8);
      addPlane([[x0, y1 + out, z0], [x1, y1 + out, z0], [x1, y1 + out, z1], [x0, y1 + out, z1]], 8);
    }

    // ---- roof covering: corrugated panels, shade cloth ----
    if (d.roofCover) {
      const P = res.roof, cols = P.cols, pw = m.panel.w * K, lap = m.panel.lap * K;
      const slopeL = Math.hypot(Dp, Hb - Hf) + 0.05;
      const ang = Math.atan2(Hb - Hf, Dp);
      const mat2 = m.roof === 'poly' ? std(COL.poly, { roughness: 0.12, metalness: 0.05, transparent: true, opacity: 0.42, side: THREE.DoubleSide, depthWrite: false }) : std(COL.solid, { roughness: 0.55, metalness: 0.4, side: THREE.DoubleSide });
      for (let c = 0; c < cols; c++) {
        const g = new THREE.PlaneGeometry(pw, slopeL, 26, 1);
        const pos = g.attributes.position; for (let i = 0; i < pos.count; i++) pos.setZ(i, Math.sin(pos.getX(i) / pw * Math.PI * 2 * 8) * 0.008);
        g.computeVertexNormals();
        const panel = new THREE.Mesh(g, mat2); panel.castShadow = m.roof === 'solid'; panel.receiveShadow = true;
        panel.rotation.x = -Math.PI / 2 + ang; const x = pw / 2 + c * (pw - lap);
        panel.position.set(Math.min(x, W - pw / 2 + 0.03), (roofY(0) + roofY(d.D)) / 2 + 0.012 + c * 0.0015, Dp / 2 + 0.025);
        panel.userData.step = 9; groups.cover.add(panel);
      }
    }
    if (d.hasRoof && m.shade > 0) {
      const sl = Math.hypot(Dp, Hb - Hf) * m.shade;
      const cloth = new THREE.Mesh(new THREE.PlaneGeometry(W + 0.04, sl), std(COL.cloth, { roughness: 1, transparent: true, opacity: 0.9, side: THREE.DoubleSide }));
      cloth.castShadow = true; cloth.rotation.x = -Math.PI / 2 + Math.atan2(Hb - Hf, Dp);
      const zc = Dp * m.shade / 2; cloth.position.set(W / 2, roofY(zc / K) + 0.03, zc); cloth.userData.step = 9; groups.cover.add(cloth);
    }
    // ---- plywood: floor, shelves, ramp, tunnel floor, add-ons ----
    const plyMat = std(COL.ply, { map: grainTex(), roughness: 0.85 });
    const st = (m.units === 'metric' ? 18 : 19.05) * K;
    for (const sh of d.sheets) {
      if (sh.shelf) {
        const s = sh.shelf, L = (s.s1 - s.s0) * K, dpt = s.depth * K, y = s.y * K;
        const b = box(s.axis === 'x' ? L : dpt, st, s.axis === 'x' ? dpt : L, plyMat);
        if (s.axis === 'x') b.position.set((s.s0 * K) + L / 2, y - st / 2, s.inner * K - dpt / 2); else b.position.set(s.inner * K + s.sign * dpt / 2, y - st / 2, (s.s0 * K) + L / 2);
        b.userData.step = 6; groups.ply.add(b);
        path.push({ id: `shelf-${s.k + 1}`, p: new THREE.Vector3(b.position.x, y, b.position.z) });
      } else if (sh.at) {
        const isTier = sh.id === 'tier-deck', isLid = sh.id === 'litter-lid';
        const w = (sh.id.startsWith('tunnel') || sh.id.startsWith('bridge') ? sh.w : sh.w) * K, l = sh.l * K;
        let b;
        if (sh.id === 'floor') { b = box(w, st, l, plyMat); b.position.set(sh.at[0] * K + w / 2, sh.at[1] * K + st / 2, sh.at[2] * K + l / 2); }
        else if (sh.id === 'tunnel-floor') { b = box(w, st, l, plyMat); b.position.set(sh.at[0] * K + w / 2, sh.at[1] * K - st / 2, sh.at[2] * K + l / 2); }
        else if (sh.id === 'bridge-floor') { b = box(l, st, w, plyMat); b.position.set(sh.at[0] * K + l / 2, sh.at[1] * K - st / 2, sh.at[2] * K + w / 2); }
        else if (isTier) { b = box(l, st, w, plyMat); b.position.set(sh.at[0] * K + l / 2, sh.at[1] * K + st / 2, sh.at[2] * K + w / 2); path.push({ id: 'tier', p: b.position.clone().setY(sh.at[1] * K + st) }); }
        else if (isLid) { b = box(l, st, w, plyMat); b.position.set(sh.at[0] * K + l / 2, sh.at[1] * K + st / 2, sh.at[2] * K + w / 2); }
        if (b) { b.userData.step = sh.step || 3; groups.ply.add(b); }
      }
    }
    if (d.litter) {
      const L = d.litter, lw = L.w * K, ld = L.d * K, lh = (L.h - (m.units === 'metric' ? 18 : 19.05)) * K;
      for (const [w, h, dd, x, y, z] of [[lw, lh, st, L.x0 * K + lw / 2, lh / 2, L.z0 * K + st / 2], [lw, lh, st, L.x0 * K + lw / 2, lh / 2, (L.z0 + L.d) * K - st / 2], [st, lh, ld, L.x0 * K + st / 2, lh / 2, L.z0 * K + ld / 2], [st, lh, ld, (L.x0 + L.w) * K - st / 2, lh / 2, L.z0 * K + ld / 2]]) { const b = box(w, h, dd, plyMat); b.position.set(x, y, z); b.userData.step = 8; groups.ply.add(b); }
      const hole = new THREE.Mesh(new THREE.CircleGeometry(0.1, 20), std(0x2a1f38)); hole.position.set(L.x0 * K + lw * 0.75, 0.14, (L.z0 + L.d) * K + 0.002); groups.ply.add(hole);
    }
    if (d.ramp) {
      const r = d.ramp, s = r.shelf, run = r.run * K, rise = r.rise * K, rw = r.w * K;
      const g = box(rw, st, Math.hypot(run, rise), plyMat);
      if (s.axis === 'x') { const x = s.s0 * K + 0.15, zTop = s.inner * K - s.depth * K; g.position.set(x, rise / 2, zTop - run / 2); g.rotation.x = Math.atan2(rise, run); }
      else { const z = s.s0 * K + 0.15, xTop = s.inner * K + s.sign * s.depth * K; g.rotation.order = 'YXZ'; g.rotation.y = s.sign > 0 ? -Math.PI / 2 : Math.PI / 2; g.rotation.x = Math.atan2(rise, run); g.position.set(xTop + s.sign * run / 2, rise / 2, z); }
      g.userData.step = 6; groups.ply.add(g);
    }
    if (d.insert) {
      const I = d.insert, wx = W / 2, iw = I.w * K, ih = I.h * K;
      const panel = box(iw, ih, st, plyMat); panel.position.set(wx, m.win.sill * K + (I.kind === 'sash' ? m.win.h * K - ih / 2 : ih / 2), 0.03); panel.userData.step = 8; groups.ply.add(panel);
      const flap = box(I.flap[0] * K, I.flap[1] * K, st * 1.6, std(0x3b3150, { roughness: 0.4 })); flap.position.copy(panel.position).add(new THREE.Vector3(0, I.kind === 'sash' ? 0 : -ih / 2 + I.flap[1] * K, 0.01)); groups.ply.add(flap);
    }

    // ---- life: the cat on the top shelf, a bird on a branch outside ----
    cat = makeCat();
    const perchTop = path.length ? path.reduce((a, b) => (b.p.y > a.p.y ? b : a)) : { p: new THREE.Vector3(W / 2, 0.02, Dp / 2) };
    cat.position.copy(perchTop.p).add(new THREE.Vector3(0, 0.002, 0));
    groups.life.add(cat);
    bird = makeBird();
    // a small tree to the left of the catio, a branch reaching towards it, the bird near its tip
    const bx = -0.32, bz = Dp + 0.42, by = Math.max(0.5, perchTop.p.y + 0.12);
    const tx = bx - 0.7, tz = bz + 0.1;
    const trunk = new THREE.Mesh(new THREE.CylinderGeometry(0.045, 0.075, by - groundY + 0.7, 7), std(COL.bark, { flatShading: true })); trunk.position.set(tx, (by + groundY + 0.7) / 2, tz); trunk.castShadow = true; groups.life.add(trunk);
    const branch = new THREE.Mesh(new THREE.CylinderGeometry(0.012, 0.028, 1.0, 6), std(COL.bark, { flatShading: true }));
    branch.position.set((tx + bx) / 2 + 0.05, by - 0.015, (tz + bz) / 2); branch.rotation.z = Math.PI / 2 + 0.12; branch.rotation.y = -0.15; branch.castShadow = true; groups.life.add(branch);
    for (let i = 0; i < 11; i++) { const lf = new THREE.Mesh(new THREE.IcosahedronGeometry(0.13 + (i % 3) * 0.04, 0), std(i % 2 ? COL.leaf : COL.leafDark, { flatShading: true, roughness: 1 })); lf.position.set(tx - 0.2 + (i % 4) * 0.16, by + 0.2 + ((i * 7) % 5) * 0.08, tz - 0.2 + ((i * 5) % 4) * 0.12); lf.castShadow = true; groups.life.add(lf); }
    bird.position.set(bx + 0.05, by + 0.005, bz); bird.rotation.y = Math.PI * 0.62; groups.life.add(bird);
    cat.rotation.y = Math.atan2(bird.position.x - cat.position.x, bird.position.z - cat.position.z);
    // the cat's path: the window, the floor, then up the shelves
    const entry = { id: 'entry', p: new THREE.Vector3(m.type === 'free' && d.tunnel ? (d.tunnel.x0 + d.tunnel.w / 2) * K : W / 2, d.perches.find(x => x.id === 'entry').y * K, m.type === 'free' && !d.tunnel ? Dp - 0.25 : 0.12) };
    const floor = { id: 'floor', p: new THREE.Vector3(W * 0.42, (m.floor === 'plywood' ? st + d.t * K : 0.005), Dp * 0.55) };
    path.sort((a, b) => a.p.y - b.p.y);
    path = [entry, floor].concat(path);
    if (d.ramp) path.splice(2, 0, { id: 'ramp', p: path[2] ? new THREE.Vector3().lerpVectors(floor.p, path[2].p, 0.5) : floor.p.clone(), walk: true });

    // what the camera has to show
    fitPts = [[0, 0, 0], [W, 0, 0], [0, 0, Dp], [W, 0, Dp], [0, Hb, 0], [W, Hb, 0], [0, Hf, Dp], [W, Hf, Dp]].map(p => new THREE.Vector3(...p));
    if (m.type === 'window') fitPts.push(new THREE.Vector3(W / 2, -0.75, 0.2));
    if (d.tunnel) fitPts.push(new THREE.Vector3(W / 2, 0, -m.tunnel.l * K));
    if (d.bridge) fitPts.push(new THREE.Vector3(W + d.bridge.l * K, 0, Dp / 2));
    fitPts.push(new THREE.Vector3(bx, by, bz), new THREE.Vector3(tx - 0.2, by + 0.3, tz));
    const span = Math.max(W, Dp, Hb) + 3;
    Object.assign(sun.shadow.camera, { left: -span, right: span, top: span, bottom: -span, near: 0.5, far: 60 });
    sun.shadow.camera.updateProjectionMatrix();
    placeSun();
    applyMode(mode, false);
    // dimension labels
    addLabel([W / 2, -0.02 + (m.type === 'window' ? 0 : 0), Dp + 0.06], `${res.E.len(d.W, m.units, 'dim')} wide`, 'dim', 3);
    addLabel([W + 0.05, Hf / 2, Dp], `${res.E.len(d.Hf, m.units, 'dim')} high`, 'dim', 3);
    addLabel([W + 0.05, 0.02, Dp / 2], `${res.E.len(d.D, m.units, 'dim')} deep`, 'dim', 2);
    dirty = true;
  }
  function placeSun() {
    const c = new THREE.Vector3((last ? last.design.W * K : 1) / 2, 0, (last ? last.design.D * K : 1) / 2);
    sun.position.copy(c).addScaledVector(sunDir, 18); sun.target.position.copy(c);
  }

  // ---------- modes: whole catio, frame only, build steps ----------
  function setVisible(k, v) { if (groups[k]) groups[k].visible = v; }
  function applyMode(md, animate = true) {
    mode = md;
    const full = md === 'full';
    setVisible('mesh', md !== 'frame'); setVisible('cover', full || md === 'steps'); setVisible('ply', md !== 'frame' || true); setVisible('life', full);
    if (md === 'steps' && animate && !reduced) anim = { kind: 'steps', t0: performance.now(), ms: 5200 };
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
  }
  function animateSteps(t) {
    // boards arrive step by step: each step slides in from its exploded place
    const steps = [...new Set(frameInst.userData.base.map(b => b.step))].sort((a, b) => a - b).concat([6, 9]);
    const uniq = [...new Set(steps)];
    const n = uniq.length, per = 1 / n;
    const base = frameInst.userData.base, tmp = new THREE.Matrix4(), off = new THREE.Vector3();
    base.forEach((b, i) => {
      const idx = uniq.indexOf(b.step), s0 = idx * per, local = Math.min(1, Math.max(0, (t - s0) / per));
      const e = 1 - (1 - Math.pow(1 - local, 3));
      off.copy(b.dir).multiplyScalar((0.35 + 0.05 * b.step) * e).add(new THREE.Vector3(0, 0.25 * e, 0));
      tmp.copy(b.m); if (t < s0) tmp.scale(new THREE.Vector3(0, 0, 0));
      tmp.elements[12] = b.c.x + off.x; tmp.elements[13] = b.c.y + off.y; tmp.elements[14] = b.c.z + off.z;
      frameInst.setMatrixAt(i, tmp);
    });
    frameInst.instanceMatrix.needsUpdate = true;
    for (const k of ['mesh', 'cover', 'ply']) groups[k].children.forEach(o => { const s = o.userData.step || 0; const idx = uniq.indexOf(s); o.visible = idx < 0 || t >= (idx + 0.6) * per; });
  }
  // the cat walks its path; jumps flagged by the checks show in red
  function animateCat(t) {
    if (!cat || path.length < 2) return;
    const segs = path.length - 1, f = Math.min(segs - 1e-6, t * segs), i = Math.floor(f), u = f - i;
    const a = path[i].p, b = path[i + 1].p;
    const p = new THREE.Vector3().lerpVectors(a, b, u);
    if (!path[i + 1].walk && !path[i].walk) p.y += Math.sin(u * Math.PI) * (0.12 + Math.abs(b.y - a.y) * 0.35);
    cat.position.copy(p);
    const dx = b.x - a.x, dz = b.z - a.z; if (Math.abs(dx) + Math.abs(dz) > 1e-4) cat.rotation.y = Math.atan2(dx, dz);
  }

  // ---------- labels ----------
  function addLabel(pos, text, tone, priority) { labels.push({ p: new THREE.Vector3(...pos), text, tone, priority: priority || 1 }); }
  function placed(width, height, measure, list = labels) {
    const out = [];
    for (const lb of list.slice().sort((a, b) => b.priority - a.priority)) {
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
  function measureFn(px) { if (!measurer) measurer = document.createElement('canvas').getContext('2d'); measurer.font = `600 ${px}px "Familjen Grotesk", "Segoe UI", sans-serif`; return t => measurer.measureText(t).width + Math.round(px * 0.95); }
  function layoutLabels() {
    if (!labelsLayer) return;
    labelsLayer.textContent = '';
    const list = mode === 'frame' ? labels : catLabels;
    if (!list.length) return;
    const r = canvas.getBoundingClientRect();
    for (const t of placed(r.width, r.height, measureFn(13.5), list)) {
      const el = document.createElement('span');
      el.className = 'cd-tag cd-tag-' + t.tone; el.textContent = t.text;
      el.style.transform = `translate(${Math.round(t.x)}px, ${Math.round(t.y)}px) translate(-50%, -100%)`;
      labelsLayer.appendChild(el);
    }
  }
  let catLabels = [];

  // ---------- cameras ----------
  function aim() {
    const t = orbit.target, r = orbit.radius;
    persp.position.set(t.x + r * Math.sin(orbit.phi) * Math.sin(orbit.theta), t.y + r * Math.cos(orbit.phi), t.z + r * Math.sin(orbit.phi) * Math.cos(orbit.theta));
    persp.lookAt(t); persp.updateProjectionMatrix(); persp.updateMatrixWorld();
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
    const d = last.design, W = d.W * K, Dp = d.D * K, H = Math.max(d.Hb, d.Hf) * K;
    let cx, cy, cz, hw, hh;
    if (v === 'front') { cx = W / 2; cy = H / 2; hw = W / 2; hh = H / 2; ortho.up.set(0, 1, 0); ortho.position.set(cx, cy, 100); ortho.lookAt(cx, cy, 0); }
    else if (v === 'side') { cz = Dp / 2; cy = H / 2; hw = Dp / 2; hh = H / 2; ortho.up.set(0, 1, 0); ortho.position.set(100, cy, cz); ortho.lookAt(0, cy, cz); }
    else { cx = W / 2; cz = Dp / 2; hw = W / 2; hh = Dp / 2; ortho.up.set(0, 0, -1); ortho.position.set(cx, 100, cz); ortho.lookAt(cx, 0, cz); }
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
      const t = Math.min(1, (performance.now() - anim.t0) / anim.ms);
      if (anim.kind === 'steps') animateSteps(t);
      if (anim.kind === 'cat') animateCat(t);
      if (t >= 1) { const k = anim.kind; anim = null; if (k === 'steps') explode(0, 99); if (k === 'cat' && opts.onCatDone) opts.onCatDone(); }
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
    const step = { ArrowLeft: [0.12, 0], ArrowRight: [-0.12, 0], ArrowUp: [0, -0.08], ArrowDown: [0, 0.08] }[e.key];
    if (step) { e.preventDefault(); orbit.theta += step[0]; orbit.phi = Math.min(1.5, Math.max(0.3, orbit.phi + step[1])); invalidate(); }
    if (e.key === '+' || e.key === '=') { zoomBy(0.9); invalidate(); }
    if (e.key === '-') { zoomBy(1.1); invalidate(); }
  });
  const ro = typeof ResizeObserver === 'function' ? new ResizeObserver(() => { resize(); invalidate(); }) : null;
  if (ro) ro.observe(canvas);

  return {
    update(res) {
      const keepView = last && last.m.type === res.m.type;
      last = res; build(res); catLabels = [];
      const { w, h } = size(); persp.aspect = (w || 16) / (h || 10);
      if (!keepView) { const leftOpen = res.m.type === 'balcony' && res.m.bal.right && !res.m.bal.left; orbit.theta = leftOpen ? -0.62 : 0.62; orbit.phi = res.m.type === 'balcony' ? 1.42 : 1.12; }
      fit(); resize(); invalidate();
    },
    setMode(md) { applyMode(md, true); },
    get mode() { return mode; },
    // the sun for an hour of the longest day: altitude and compass bearing in degrees, and the way the catio faces
    setSun(alt, bearing, facing) {
      const F = facing * Math.PI / 180, b = bearing * Math.PI / 180, a = alt * Math.PI / 180;
      const e = Math.cos(a) * Math.sin(b), n = Math.cos(a) * Math.cos(b);
      sunDir = new THREE.Vector3(e * Math.cos(F) - n * Math.sin(F), Math.max(0.02, Math.sin(a)), e * Math.sin(F) + n * Math.cos(F)).normalize();
      // low sun is golden and strong against a cooler sky; the midday sun is white
      sun.intensity = alt > 0 ? (alt < 20 ? 3.6 : 2.6 + 0.8 * Math.min(1, alt / 50)) : 0.2;
      sun.color.setHex(alt < 12 ? 0xffb070 : alt < 22 ? 0xffc489 : alt < 38 ? 0xffdcb4 : 0xfff3e4);
      hemi.intensity = alt < 22 ? 1.0 : 1.2;
      placeSun(); invalidate();
    },
    walkCat(steps) {
      if (!cat) return;
      // a tag at each landing: the height of the jump, coloured by its check
      catLabels = (steps || []).map(f => {
        const at = path.find(p => p.id === f.st.to) || path[path.length - 1];
        const txt = f.st.walk ? 'Ramp' : `${last.E.len(f.st.rise, last.m.units)} ${f.st.down ? 'down' : 'up'}`;
        return { p: at.p.clone().add(new THREE.Vector3(0, 0.36, 0)), text: txt, tone: f.status === 'info' ? 'dim' : f.status, priority: f.status === 'fail' ? 9 : f.status === 'check' ? 7 : 4 };
      });
      applyMode('full', false);
      anim = reduced ? null : { kind: 'cat', t0: performance.now(), ms: 1400 * Math.max(2, path.length - 1) };
      if (reduced) animateCat(1);
      invalidate();
    },
    get path() { return path.map(p => ({ id: p.id, x: p.p.x, y: p.p.y, z: p.p.z, walk: !!p.walk })); },
    // one image: a view ('iso', 'hero', 'front', 'side', 'plan'), with build steps up to `upTo` and `hi` highlighted
    snapshot({ width, height, view = 'iso', type = 'image/png', quality = 0.92, theta, phi, zoom, upTo = 99, hi = null, explodeBy = 0, labelPx = 14, catOn = true, envOn = true } = {}) {
      const saved = { theta: orbit.theta, phi: orbit.phi, radius: orbit.radius, target: orbit.target.clone(), pr: renderer.getPixelRatio(), mode };
      anim = null;
      renderer.setPixelRatio(1); renderer.setSize(width, height, false);
      setVisible('life', catOn && view !== 'front' && view !== 'side' && view !== 'plan'); setVisible('env', envOn);
      setVisible('mesh', true); setVisible('cover', true); setVisible('ply', true);
      explode(explodeBy, upTo, hi);
      if (view === 'front' || view === 'side' || view === 'plan') { orthoView(view, width / height); camera = ortho; }
      else { camera = persp; persp.aspect = width / height; if (theta != null) orbit.theta = theta; if (phi != null) orbit.phi = phi; fit(view === 'hero' ? 0.98 : 0.9); if (zoom) orbit.radius *= zoom; aim(); }
      renderer.render(scene, camera);
      const url = canvas.toDataURL(type, quality);
      const tags = placed(width, height, measureFn(labelPx)).map(t => ({ x: t.x, y: t.y, text: t.text, tone: t.tone }));
      orbit.theta = saved.theta; orbit.phi = saved.phi; orbit.radius = saved.radius; orbit.target.copy(saved.target);
      setVisible('env', true); camera = persp;
      renderer.setPixelRatio(saved.pr); resize(); applyMode(saved.mode, false);
      return { url, tags };
    },
    // the model for SketchUp or Blender: the catio itself, without the house and the garden
    exportObject() {
      const g = new THREE.Group(); g.name = 'catio';
      // every board as its own box, so SketchUp, Blender and OBJ readers see the pieces (an instanced mesh would not survive OBJ)
      if (frameInst) {
        const frame = new THREE.Group(); frame.name = 'frame';
        const mat = new THREE.MeshStandardMaterial({ color: COL.cedar, roughness: 0.78 });
        const mm = new THREE.Matrix4();
        last.design.members.forEach((x, i) => { frameInst.getMatrixAt(i, mm); const b = new THREE.Mesh(new THREE.BoxGeometry(1, 1, 1), mat); b.applyMatrix4(mm); b.name = `${x.id} ${x.where}`; frame.add(b); });
        g.add(frame);
      }
      for (const k of ['mesh', 'cover', 'ply']) if (groups[k]) { const c = groups[k].clone(true); c.name = k; g.add(c); }
      return g;
    },
    get three() { return THREE; },
    dispose() { cancelAnimationFrame(raf); if (ro) ro.disconnect(); disposeTree(world); renderer.dispose(); },
  };
}
