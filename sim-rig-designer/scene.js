/* Sim Rig Designer: the live 3D model. An ES module loaded only when the 3D view starts, never on first paint.
 * Draws the rig the engine built, part by part: every frame member in lumber (grain) or 40-series profile (with its
 * slots), the plates and panels in plywood, MDF or aluminium, the seat, the wheel base and rim, the pedals, the shifter
 * and the screens on their stand; round it a room in daylight, the screens lit with a race track drawn in code. The
 * driver is our own silhouette built here from the posture the engine solved (no asset licence involved), and the
 * ergonomics lines draw its torso, thigh, shin, foot and arm lines with the angle at each joint.
 * Toggles: the frame, the plates and panels, the driver, and the angle lines. Views: 3D, side, front, from above. The
 * build steps slide the parts in, in assembly order. The same module renders the offline hero images, the Open Graph
 * image and the views in the Pro PDF.
 * three.js 0.185.1 (MIT), shared with Without Planning from /without-planning/vendor/. */
import * as THREE from '/without-planning/vendor/three.module.min.js';

const K = 0.001; // millimetres to metres
const COL = {
  floor: 0xb8875a, floorDark: 0x9a6c43, wall: 0xdfe2e9, wall2: 0xd2d6df, skirting: 0xf4f5f8, rug: 0x34323b,
  pine: 0xdcae72, pineDark: 0xc4935a, pineLight: 0xebc48e, ply: 0xe2c79a, plyEdge: 0xc9a46d, mdf: 0xb98b5c,
  alu: 0xc3c7cf, aluDark: 0x8d929c, black: 0x1c1b21, carbon: 0x24222b, seat: 0x2b2932, seatInsert: 0x46434f, stitch: 0xffd23f,
  metal: 0x5d606a, rim: 0x232128, grip: 0x3a3742, bezel: 0x17161b, driver: 0x2c2a35, driverHi: 0x3c3948,
  sector: 0x6a2ee8, line: 0x8a5bff, yellow: 0xffd23f, kerbRed: 0xe1262d, white: 0xffffff,
};

function disposeTree(obj) {
  obj.traverse(o => {
    if (o.geometry) o.geometry.dispose();
    if (o.material) (Array.isArray(o.material) ? o.material : [o.material]).forEach(m => { for (const k of ['map', 'emissiveMap', 'roughnessMap']) if (m[k] && !m[k].userData.shared) m[k].dispose(); m.dispose(); });
  });
}
const std = (color, o = {}) => new THREE.MeshStandardMaterial(Object.assign({ color, roughness: 0.8, metalness: 0 }, o));
function box(w, h, d, mat) { const m = new THREE.Mesh(new THREE.BoxGeometry(Math.max(w, 1e-4), Math.max(h, 1e-4), Math.max(d, 1e-4)), mat); m.castShadow = true; m.receiveShadow = true; return m; }
function rbox(w, h, d, r, mat, seg = 3) { // a box with rounded vertical edges, extruded along z
  const s = new THREE.Shape(), x = w / 2, y = h / 2, rr = Math.min(r, x - 1e-4, y - 1e-4);
  s.moveTo(-x + rr, -y); s.lineTo(x - rr, -y); s.quadraticCurveTo(x, -y, x, -y + rr); s.lineTo(x, y - rr); s.quadraticCurveTo(x, y, x - rr, y); s.lineTo(-x + rr, y); s.quadraticCurveTo(-x, y, -x, y - rr); s.lineTo(-x, -y + rr); s.quadraticCurveTo(-x, -y, -x + rr, -y);
  const g = new THREE.ExtrudeGeometry(s, { depth: d, bevelEnabled: true, bevelSize: Math.min(rr * 0.6, d * 0.3), bevelThickness: Math.min(rr * 0.6, d * 0.3), bevelSegments: seg, curveSegments: 6 });
  g.translate(0, 0, -d / 2); g.computeVertexNormals();
  const m = new THREE.Mesh(g, mat); m.castShadow = true; m.receiveShadow = true; return m;
}
// a capsule from a to b (THREE.Vector3), radius r, scaled across by sx and sz
function limb(a, b, r, mat, sx = 1, sz = 1) {
  const dir = b.clone().sub(a), L = dir.length();
  const g = new THREE.CapsuleGeometry(r, Math.max(1e-4, L), 6, 14);
  const m = new THREE.Mesh(g, mat);
  m.scale.set(sx, 1, sz);
  m.position.copy(a).add(b).multiplyScalar(0.5);
  m.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), dir.normalize());
  m.castShadow = true; m.receiveShadow = true; return m;
}
function tube(points, r, mat) {
  const curve = new THREE.CatmullRomCurve3(points, false, 'centripetal', 0);
  const m = new THREE.Mesh(new THREE.TubeGeometry(curve, Math.max(2, points.length * 6), r, 8, false), mat);
  return m;
}
function seg(a, b, r, mat) { const dir = b.clone().sub(a), L = dir.length(); const m = new THREE.Mesh(new THREE.CylinderGeometry(r, r, L, 8), mat); m.position.copy(a).add(b).multiplyScalar(0.5); m.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), dir.normalize()); return m; }

// ---------- textures, drawn on canvases ----------
const texCache = {};
function canvasTex(key, w, h, draw, repeat) {
  if (!texCache[key]) {
    const c = document.createElement('canvas'); c.width = w; c.height = h;
    draw(c.getContext('2d'), w, h);
    const t = new THREE.CanvasTexture(c);
    t.wrapS = t.wrapT = THREE.RepeatWrapping; t.colorSpace = THREE.SRGBColorSpace; t.anisotropy = 8;
    texCache[key] = t;
  }
  const t = texCache[key].clone(); t.needsUpdate = true;
  if (repeat) t.repeat.set(repeat[0], repeat[1]);
  return t;
}
const rnd0 = seed => () => (seed = (seed * 16807) % 2147483647) / 2147483647;
const grainTex = () => canvasTex('grain', 512, 64, (x, w, h) => {
  x.fillStyle = '#ffffff'; x.fillRect(0, 0, w, h);
  const r = rnd0(7);
  for (let i = 0; i < 46; i++) { x.strokeStyle = `rgba(120,78,30,${0.05 + r() * 0.08})`; x.lineWidth = 0.6 + r() * 1.6; x.beginPath(); const y = r() * h; x.moveTo(0, y); for (let s = 0; s <= 8; s++) x.lineTo(s * w / 8, y + Math.sin(s * 0.9 + i) * (1 + r() * 2.5)); x.stroke(); }
  for (let k = 0; k < 3; k++) { const kx = r() * w, ky = r() * h; const g = x.createRadialGradient(kx, ky, 0, kx, ky, 7); g.addColorStop(0, 'rgba(110,60,20,0.45)'); g.addColorStop(1, 'rgba(110,60,20,0)'); x.fillStyle = g; x.beginPath(); x.ellipse(kx, ky, 9, 4, 0, 0, Math.PI * 2); x.fill(); }
});
// 40-series profile: one slot to each 40 mm of a face, along the length (v across the face, repeating)
const slotTex = () => canvasTex('slot', 16, 64, (x, w, h) => {
  x.fillStyle = '#ffffff'; x.fillRect(0, 0, w, h);
  x.fillStyle = 'rgba(0,0,0,0.62)'; x.fillRect(0, h * 0.4, w, h * 0.2);
  x.fillStyle = 'rgba(0,0,0,0.18)'; x.fillRect(0, h * 0.36, w, h * 0.04); x.fillRect(0, h * 0.6, w, h * 0.04);
  x.fillStyle = 'rgba(255,255,255,0.5)'; x.fillRect(0, 0, w, 2); x.fillRect(0, h - 2, w, 2);
});
const plyTex = rep => canvasTex('ply', 512, 512, (x, w, h) => {
  x.fillStyle = '#e8cfa3'; x.fillRect(0, 0, w, h);
  const r = rnd0(19);
  for (let i = 0; i < 70; i++) { x.strokeStyle = `rgba(150,105,55,${0.04 + r() * 0.07})`; x.lineWidth = 1 + r() * 3; x.beginPath(); const y = r() * h; x.moveTo(0, y); x.bezierCurveTo(w * 0.3, y + (r() - 0.5) * 30, w * 0.7, y + (r() - 0.5) * 30, w, y + (r() - 0.5) * 10); x.stroke(); }
}, rep);
const floorTex = rep => canvasTex('floor', 512, 512, (x, w, h) => {
  const r = rnd0(31), boards = 6;
  for (let b = 0; b < boards; b++) {
    const y0 = b * h / boards, tone = 150 + Math.floor(r() * 30);
    x.fillStyle = `rgb(${tone + 40},${tone - 2},${tone - 50})`; x.fillRect(0, y0, w, h / boards);
    for (let i = 0; i < 26; i++) { x.strokeStyle = `rgba(90,55,25,${0.05 + r() * 0.08})`; x.lineWidth = 0.8 + r() * 1.5; x.beginPath(); const yy = y0 + r() * h / boards; x.moveTo(0, yy); x.bezierCurveTo(w * 0.3, yy + (r() - 0.5) * 6, w * 0.7, yy + (r() - 0.5) * 6, w, yy); x.stroke(); }
    x.fillStyle = 'rgba(60,35,15,0.35)'; x.fillRect(0, y0, w, 2);
    const cut = r() * w; x.fillRect(cut, y0, 2, h / boards);
  }
}, rep);
const fabricTex = rep => canvasTex('fabric', 128, 128, (x, w, h) => {
  x.fillStyle = '#ffffff'; x.fillRect(0, 0, w, h);
  const r = rnd0(3);
  for (let i = 0; i < 2600; i++) { x.fillStyle = `rgba(0,0,0,${r() * 0.12})`; x.fillRect(r() * w, r() * h, 1, 1); }
}, rep);
const carbonTex = rep => canvasTex('carbon', 64, 64, (x, w, h) => {
  x.fillStyle = '#2a2830'; x.fillRect(0, 0, w, h);
  for (let i = 0; i < 4; i++) for (let j = 0; j < 4; j++) { const g = x.createLinearGradient(i * 16, j * 16, i * 16 + 16, j * 16 + 16); const on = (i + j) % 2; g.addColorStop(0, on ? '#3a3842' : '#25232a'); g.addColorStop(1, on ? '#2c2a32' : '#33313a'); x.fillStyle = g; x.fillRect(i * 16, j * 16, 16, 16); }
}, rep);
// the race track the screens show: our own drawing, a left-hand bend with kerbs, one image across all three screens
function trackCanvas(w, h) {
  const c = document.createElement('canvas'); c.width = w; c.height = h; const x = c.getContext('2d');
  const sky = x.createLinearGradient(0, 0, 0, h * 0.5); sky.addColorStop(0, '#5ea8ea'); sky.addColorStop(1, '#cfe6f6');
  x.fillStyle = sky; x.fillRect(0, 0, w, h * 0.5);
  x.fillStyle = '#9fbf7c'; x.beginPath(); x.moveTo(0, h * 0.46); for (let i = 0; i <= 20; i++) x.lineTo(i * w / 20, h * (0.43 + 0.03 * Math.sin(i * 1.7))); x.lineTo(w, h * 0.5); x.lineTo(0, h * 0.5); x.fill();
  const grass = x.createLinearGradient(0, h * 0.48, 0, h); grass.addColorStop(0, '#6f9f45'); grass.addColorStop(1, '#4f8a32');
  x.fillStyle = grass; x.fillRect(0, h * 0.48, w, h * 0.52);
  // the track: from the full width at the bottom to a bend at the horizon, offset left
  const vx = w * 0.42, vy = h * 0.5;
  const road = (k, col) => { x.fillStyle = col; x.beginPath(); x.moveTo(w * 0.5 - w * 0.62 * k, h); x.bezierCurveTo(w * 0.47 - w * 0.2 * k, h * 0.72, vx - w * 0.06 * k, h * 0.56, vx - w * 0.012 * k, vy); x.lineTo(vx + w * 0.012 * k, vy); x.bezierCurveTo(vx + w * 0.07 * k, h * 0.56, w * 0.53 + w * 0.22 * k, h * 0.72, w * 0.5 + w * 0.62 * k, h); x.fill(); };
  road(1.18, '#e8e8e2');                // the run-off line
  road(1.12, '#55565c');
  road(1.0, '#6a6b72');
  // kerbs on the inside of the bend: red and white blocks along the left edge
  for (let i = 0; i < 22; i++) {
    const t0 = i / 22, t1 = (i + 1) / 22;
    const pt = t => { const k = 1.06; const ax = w * 0.5 - w * 0.62 * k, ay = h, bx = w * 0.47 - w * 0.2 * k, by = h * 0.72, cx = vx - w * 0.06 * k, cy = h * 0.56, dx = vx - w * 0.012 * k, dy = vy; const u = 1 - t; return [u * u * u * ax + 3 * u * u * t * bx + 3 * u * t * t * cx + t * t * t * dx, u * u * u * ay + 3 * u * u * t * by + 3 * u * t * t * cy + t * t * t * dy]; };
    const [x0, y0] = pt(t0 * 0.95), [x1, y1] = pt(t1 * 0.95);
    const wd = 26 * (1 - t0 * 0.92);
    x.fillStyle = i % 2 ? '#ffffff' : '#e1262d';
    x.beginPath(); x.moveTo(x0, y0); x.lineTo(x1, y1); x.lineTo(x1 + wd * (1 - t1 * 0.92) / (1 - t0 * 0.92), y1); x.lineTo(x0 + wd, y0); x.fill();
  }
  // the dashed centre-line of grip, a braking board, a car ahead
  x.fillStyle = '#f5f5f0'; x.fillRect(w * 0.665, h * 0.6, 16, 34); x.fillStyle = '#2b2b30'; x.font = 'bold 18px sans-serif'; x.fillText('100', w * 0.662, h * 0.6 + 24);
  x.fillStyle = '#1f2f6b'; x.beginPath(); x.ellipse(w * 0.455, h * 0.6, 26, 9, 0, 0, Math.PI * 2); x.fill(); x.fillStyle = '#ffd23f'; x.fillRect(w * 0.447, h * 0.592, 16, 6);
  // the trees and the grandstand on the horizon
  for (let i = 0; i < 26; i++) { const tx = (i * 137.5) % w, ty = h * 0.47 - (i % 3) * 4; x.fillStyle = i % 2 ? '#3f6a33' : '#4b7a3a'; x.beginPath(); x.arc(tx, ty, 10 + (i % 4) * 4, 0, Math.PI * 2); x.fill(); }
  x.fillStyle = '#d9d9d6'; x.fillRect(w * 0.7, h * 0.43, w * 0.18, h * 0.05); x.fillStyle = '#6a2ee8'; x.fillRect(w * 0.7, h * 0.43, w * 0.18, h * 0.012);
  return c;
}

// ---------- the scene ----------
export function createScene(canvas, opts = {}) {
  const reduced = opts.reducedMotion ?? (typeof matchMedia === 'function' && matchMedia('(prefers-reduced-motion: reduce)').matches);
  const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, preserveDrawingBuffer: !!opts.preserve, powerPreference: 'low-power', alpha: false });
  renderer.setPixelRatio(Math.min(opts.pixelRatio || window.devicePixelRatio || 1, 2));
  renderer.shadowMap.enabled = true; renderer.shadowMap.type = THREE.PCFSoftShadowMap;
  renderer.outputColorSpace = THREE.SRGBColorSpace; renderer.toneMapping = THREE.ACESFilmicToneMapping; renderer.toneMappingExposure = 1.0;
  const scene = new THREE.Scene();
  scene.background = new THREE.Color(0xe9ebf0);
  const persp = new THREE.PerspectiveCamera(34, 1, 0.05, 100);
  const ortho = new THREE.OrthographicCamera(-1, 1, 1, -1, 0.05, 200);
  let camera = persp;
  const hemi = new THREE.HemisphereLight(0xf4f6ff, 0x9c7a58, 1.25); scene.add(hemi);
  const key = new THREE.DirectionalLight(0xfff1de, 2.4);
  key.castShadow = true; key.shadow.mapSize.set(2048, 2048); key.shadow.bias = -0.0004; key.shadow.normalBias = 0.02; key.shadow.radius = 3;
  scene.add(key, key.target);
  const glow = new THREE.Group(); scene.add(glow);
  const world = new THREE.Group(); scene.add(world);
  const labelsLayer = opts.labels || null;
  let labels = [], angleTags = [];
  const orbit = { theta: -0.95, phi: 1.12, radius: 5, target: new THREE.Vector3() };
  let dirty = true, raf = 0, anim = null, last = null, frameInst = [], fitPts = [], arm3 = {};
  const show = { frame: true, plates: true, driver: true, angles: false };
  const groups = {};

  function build(res) {
    disposeTree(world); world.clear(); glow.clear(); labels = []; angleTags = []; frameInst = []; fitPts = [];
    const d = res.design, m = res.m, E = res.E, p = res.posture, Lo = d.lay, b = res.body;
    const T = (k, o) => (E.t ? E.t(k, o) : k);
    for (const k of ['room', 'frame', 'plates', 'gear', 'seat', 'screens', 'driver', 'angles']) { groups[k] = new THREE.Group(); groups[k].name = k; world.add(groups[k]); }
    const V = (x, y, z = 0) => new THREE.Vector3(x * K, y * K, z * K);
    const X1 = d.parts.len, W = d.parts.W;
    const fx0 = Math.min(0, d.full.x0 || 0), fx1 = Math.max(X1, d.parts.stand ? d.parts.stand.x + 300 : X1);

    // ---- the room: an oak floor, two walls, a rug under the rig ----
    const rw = Math.max(6, (fx1 - fx0) * K + 3.6), rd = Math.max(5, W * K + 3.8);
    const cx = (fx0 + fx1) / 2 * K;
    const floor = new THREE.Mesh(new THREE.PlaneGeometry(rw, rd), std(0xffffff, { map: floorTex([rw / 1.4, rd / 1.4]), roughness: 0.62 }));
    floor.rotation.x = -Math.PI / 2; floor.position.set(cx, 0, 0); floor.receiveShadow = true; groups.room.add(floor);
    const rug = new THREE.Mesh(new THREE.PlaneGeometry((fx1 - fx0) * K + 0.7, W * K + 1.1), std(COL.rug, { map: fabricTex([8, 6]), roughness: 1 }));
    rug.rotation.x = -Math.PI / 2; rug.position.set(cx, 0.002, 0); rug.receiveShadow = true; groups.room.add(rug);
    const wallX = fx1 * K + 0.55;
    const backWall = new THREE.Mesh(new THREE.PlaneGeometry(rd, 2.7), std(COL.wall, { roughness: 0.95 }));
    backWall.position.set(wallX, 1.35, 0); backWall.rotation.y = -Math.PI / 2; backWall.receiveShadow = true; groups.room.add(backWall);
    const sideWall = new THREE.Mesh(new THREE.PlaneGeometry(rw, 2.7), std(COL.wall2, { roughness: 0.95 }));
    sideWall.position.set(cx, 1.35, -rd / 2); sideWall.receiveShadow = true; groups.room.add(sideWall);
    for (const [len, pos, ry] of [[rd, [wallX - 0.01, 0.05, 0], -Math.PI / 2], [rw, [cx, 0.05, -rd / 2 + 0.01], 0]]) { const s = box(len, 0.1, 0.012, std(COL.skirting, { roughness: 0.6 })); s.position.set(...pos); s.rotation.y = ry; groups.room.add(s); }

    // ---- the frame: one instanced mesh for each kind of section ----
    const aluMat = new THREE.MeshStandardMaterial({ color: COL.alu, metalness: 0.55, roughness: 0.38, map: slotTex() });
    const woodMat = new THREE.MeshStandardMaterial({ color: 0xffffff, map: grainTex(), roughness: 0.74 });
    const bySec = {};
    for (const mem of d.members) (bySec[`${mem.sec}|${mem.a}|${mem.b}`] = bySec[`${mem.sec}|${mem.a}|${mem.b}`] || []).push(mem);
    const tmp = new THREE.Matrix4(), col = new THREE.Color();
    const centre = V(X1 / 2, 400, 0);
    for (const [k, list] of Object.entries(bySec)) {
      const [sec, a, bb] = k.split('|'); const isAlu = sec === 'p4040' || sec === 'p4080';
      const geo = new THREE.BoxGeometry(1, 1, 1);
      if (isAlu) { // one slot to each 40 mm of every long face
        const uv = geo.attributes.uv, nrm = geo.attributes.normal;
        for (let i = 0; i < uv.count; i++) { const ny = Math.abs(nrm.getY(i)), nz = Math.abs(nrm.getZ(i)); if (nz > 0.5) uv.setY(i, uv.getY(i) * Number(a) / 40); else if (ny > 0.5) uv.setY(i, uv.getY(i) * Number(bb) / 40); }
      }
      const inst = new THREE.InstancedMesh(geo, isAlu ? aluMat : woodMat, list.length);
      inst.castShadow = true; inst.receiveShadow = true;
      const base = [];
      list.forEach((x, i) => {
        const p0 = V(...x.p0), p1 = V(...x.p1);
        const dir = p1.clone().sub(p0); const L = dir.length(); dir.normalize();
        let up = x.up ? new THREE.Vector3(...x.up) : null;
        if (!up) { const n = dir.clone().cross(new THREE.Vector3(0, 0, 1)); up = n.lengthSq() > 1e-6 ? n.cross(dir).normalize() : new THREE.Vector3(0, 1, 0); if (Math.abs(dir.z) > 0.5) up = new THREE.Vector3(0, 1, 0); }
        up.sub(dir.clone().multiplyScalar(up.dot(dir))); if (up.lengthSq() < 1e-8) up.set(dir.y > 0.9 ? 1 : 0, 0, 1); up.normalize();
        const side = dir.clone().cross(up).normalize();
        const c = p0.clone().add(p1).multiplyScalar(0.5);
        tmp.makeBasis(dir, up, side).scale(new THREE.Vector3(Math.max(L, 0.001), x.a * K, x.b * K)).setPosition(c);
        inst.setMatrixAt(i, tmp);
        if (isAlu) col.setHex(COL.alu); else { col.setHex([COL.pine, COL.pineLight, COL.pineDark][(i * 7) % 3]).lerp(new THREE.Color(COL.pine), 0.5); }
        inst.setColorAt(i, col);
        const away = c.clone().sub(centre); if (away.lengthSq() < 1e-6) away.set(0, 1, 0);
        base.push({ m: tmp.clone(), c, step: x.step, dir: away.normalize(), color: col.clone() });
        fitPts.push(p0, p1);
      });
      inst.instanceMatrix.needsUpdate = true; if (inst.instanceColor) inst.instanceColor.needsUpdate = true;
      inst.userData.base = base;
      groups.frame.add(inst); frameInst.push(inst);
    }

    // ---- the plates and panels ----
    const sheetKind = d.sheet.kind === 'MDF' ? 'mdf' : 'ply';
    const slabMat = (mat, L, Wd) => mat === 'alu' ? new THREE.MeshStandardMaterial({ color: COL.alu, metalness: 0.6, roughness: 0.32 }) : sheetKind === 'mdf' ? std(COL.mdf, { roughness: 0.85, map: fabricTex([2, 2]) }) : std(0xffffff, { map: plyTex([L / 0.8, Wd / 0.8]), roughness: 0.7 });
    for (const s of d.slabs) {
      let mesh;
      if (s.poly) {
        const shape = new THREE.Shape(); shape.moveTo(s.poly[0][0] * K, s.poly[0][1] * K); for (const q of s.poly.slice(1)) shape.lineTo(q[0] * K, q[1] * K); shape.closePath();
        const g = new THREE.ExtrudeGeometry(shape, { depth: (s.z1 - s.z0) * K, bevelEnabled: false });
        mesh = new THREE.Mesh(g, slabMat(s.mat, 1, 1)); mesh.position.z = s.z0 * K; mesh.castShadow = true; mesh.receiveShadow = true;
        for (const q of s.poly) fitPts.push(V(q[0], q[1], s.z0), V(q[0], q[1], s.z1));
      } else {
        mesh = box(s.size[0] * K, s.size[1] * K, s.size[2] * K, slabMat(s.mat, s.size[0] * K, s.size[2] * K));
        mesh.position.copy(V(...s.c)); mesh.rotation.z = s.rotZ || 0;
        fitPts.push(V(s.c[0] - s.size[0] / 2, s.c[1], s.c[2] - s.size[2] / 2), V(s.c[0] + s.size[0] / 2, s.c[1], s.c[2] + s.size[2] / 2));
      }
      mesh.userData.step = s.step; mesh.userData.slab = s.id;
      groups.plates.add(mesh);
    }

    // ---- the seat ----
    const H = V(...Lo.H), bk = p.back * Math.PI / 180;
    const tdir = new THREE.Vector3(-Math.sin(bk), Math.cos(bk), 0), nfwd = new THREE.Vector3(Math.cos(bk), Math.sin(bk), 0);
    const seatType = m.seat.type;
    const fab = std(COL.seat, { map: fabricTex([4, 4]), roughness: 0.95 });
    const ins = std(COL.seatInsert, { map: fabricTex([6, 6]), roughness: 1 });
    const panY = H.y - b.hipSeat * K, backOff = b.hipBack * K;
    const S = (o) => { const g = new THREE.Group(); groups.seat.add(g); return g; };
    if (seatType === 'office') {
      const g = S();
      const sw = 0.5, sd2 = 0.48;
      const cushion = rbox(sd2, 0.08, sw, 0.03, fab); cushion.position.set(H.x + 0.12, panY - 0.04, 0); g.add(cushion);
      const back = rbox(0.07, 0.6, 0.46, 0.05, fab); back.position.copy(H.clone().addScaledVector(nfwd, -backOff - 0.04).addScaledVector(tdir, 0.33)); back.position.z = 0; back.rotation.z = bk; g.add(back);
      const post = new THREE.Mesh(new THREE.CylinderGeometry(0.025, 0.03, panY - 0.12, 12), std(COL.metal, { metalness: 0.7, roughness: 0.35 })); post.position.set(H.x + 0.1, (panY - 0.12) / 2 + 0.06, 0); g.add(post);
      for (let i = 0; i < 5; i++) { const a = i / 5 * Math.PI * 2; const leg = box(0.32, 0.03, 0.04, std(COL.black, { roughness: 0.5 })); leg.position.set(H.x + 0.1 + Math.cos(a) * 0.16, 0.06, Math.sin(a) * 0.16); leg.rotation.y = -a; g.add(leg); const wh = new THREE.Mesh(new THREE.CylinderGeometry(0.025, 0.025, 0.025, 12), std(COL.black)); wh.rotation.x = Math.PI / 2; wh.position.set(H.x + 0.1 + Math.cos(a) * 0.31, 0.025, Math.sin(a) * 0.31); g.add(wh); }
      for (const z of [-1, 1]) { const arm = rbox(0.26, 0.04, 0.06, 0.02, std(COL.black, { roughness: 0.7 })); arm.position.set(H.x + 0.06, panY + 0.2, z * 0.27); g.add(arm); const ap = box(0.03, 0.2, 0.03, std(COL.black)); ap.position.set(H.x - 0.02, panY + 0.1, z * 0.27); g.add(ap); }
    } else {
      const g = S();
      const st = d.parts.barTop != null ? d.parts.barTop * K : panY - 0.1;
      const sw = (seatType === 'car' ? 0.54 : 0.5), depth = (seatType === 'car' ? 0.5 : 0.46);
      const panA = 0.13;   // the cushion rises a little toward the front, as in a car
      const pan = new THREE.Group();
      const cushion = rbox(depth, 0.07, sw - 0.12, 0.03, ins); cushion.position.set(depth / 2 - 0.04, 0.035, 0); pan.add(cushion);
      for (const z of [-1, 1]) { const bol = rbox(depth * 0.92, seatType === 'car' ? 0.09 : 0.12, 0.08, 0.035, fab); bol.position.set(depth / 2 - 0.05, 0.06, z * (sw / 2 - 0.05)); pan.add(bol); }
      const shellBase = rbox(depth + 0.04, 0.05, sw, 0.03, fab); shellBase.position.set(depth / 2 - 0.05, -0.02, 0); pan.add(shellBase);
      pan.position.set(H.x - backOff * 0.55, panY - 0.03, 0); pan.rotation.z = panA; g.add(pan);
      const backH = (seatType === 'car' ? 0.62 : 0.78);
      const bg = new THREE.Group();
      const bc = rbox(0.07, backH * 0.82, sw - 0.14, 0.04, ins); bc.position.set(0.035, backH * 0.43, 0); bg.add(bc);
      for (const z of [-1, 1]) { const bol = rbox(0.12, backH * 0.6, 0.08, 0.035, fab); bol.position.set(0.05, backH * 0.32, z * (sw / 2 - 0.05)); bg.add(bol); }
      const shell = rbox(0.06, backH, sw, 0.05, fab); shell.position.set(-0.025, backH / 2, 0); bg.add(shell);
      if (seatType === 'bucket') { for (const z of [-1, 1]) { const slot = box(0.065, 0.07, 0.05, std(0x121116)); slot.position.set(-0.005, backH * 0.83, z * 0.08); bg.add(slot); } const seam = box(0.005, backH * 0.7, 0.008, std(COL.stitch, { roughness: 0.6 })); seam.position.set(0.072, backH * 0.43, sw / 2 - 0.105); bg.add(seam); const seam2 = seam.clone(); seam2.position.z = -seam.position.z; bg.add(seam2); }
      else { const hr = rbox(0.08, 0.16, 0.26, 0.04, fab); hr.position.set(0.02, backH + 0.12, 0); bg.add(hr); for (const z of [-1, 1]) { const pp = seg(new THREE.Vector3(0.02, backH - 0.02, z * 0.07), new THREE.Vector3(0.02, backH + 0.06, z * 0.07), 0.006, std(COL.metal, { metalness: 0.8, roughness: 0.3 })); bg.add(pp); } }
      const bp = H.clone().addScaledVector(nfwd, -backOff).addScaledVector(tdir, -0.07);
      bg.position.copy(bp); bg.rotation.z = bk; g.add(bg);
      // brackets (or sliders) from the shell down to the seat bars
      const brMat = std(seatType === 'car' ? COL.metal : COL.black, { metalness: 0.6, roughness: 0.4 });
      for (const z of [-1, 1]) {
        const br = box(Math.max(0.3, depth * 0.85), Math.max(0.02, panY - 0.05 - st), 0.006, brMat); br.position.set(H.x + 0.08, st + (panY - 0.05 - st) / 2, z * (sw / 2 + 0.004)); g.add(br);
        if (seatType === 'car') { const rail = box(0.42, 0.03, 0.03, brMat); rail.position.set(H.x + 0.08, st + 0.015, z * (sw / 2 - 0.08)); g.add(rail); }
      }
    }

    // ---- the gear: wheel base, quick release, rim; pedals; shifter ----
    const ax = d.axis.d, up2 = d.axis.up;
    const Wc = V(...Lo.wheel), axV = new THREE.Vector3(ax[0], ax[1], 0), upV = new THREE.Vector3(up2[0], up2[1], 0);
    const g = m.gear, rimR = g.rim / 2 * K;
    const metal = std(COL.metal, { metalness: 0.75, roughness: 0.32 });
    const dark = std(COL.black, { roughness: 0.55, metalness: 0.3 });
    {
      const gg = new THREE.Group(); groups.gear.add(gg);
      const face = Wc.clone().addScaledVector(axV, g.wb.qr * K);
      const L = g.wb.l * K;
      let body;
      const bodyC = face.clone().addScaledVector(axV, L / 2);
      if (g.base === 'dd') {
        const rr = Math.min(g.wb.axis, g.wb.w / 2) * K * 0.95;
        body = new THREE.Mesh(new THREE.CylinderGeometry(rr, rr, L, 40), std(0x26252c, { metalness: 0.55, roughness: 0.42 }));
        const ring = new THREE.Mesh(new THREE.TorusGeometry(rr * 0.99, 0.006, 8, 40), std(COL.sector, { roughness: 0.4 })); ring.position.y = -L / 2 + 0.03; ring.rotation.x = Math.PI / 2; body.add(ring);
        body.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), axV.clone());
      } else {
        body = box(L, g.wb.axis * 1.7 * K, g.wb.w * K, std(0x26252c, { roughness: 0.6 }));
        body.quaternion.setFromRotationMatrix(new THREE.Matrix4().makeBasis(axV.clone(), upV.clone(), new THREE.Vector3(0, 0, 1)));
      }
      body.position.copy(bodyC); body.castShadow = true; gg.add(body);
      const foot = box(L * 0.9, (g.wb.axis * 0.25) * K, g.wb.w * 0.9 * K, dark); foot.position.copy(face.clone().addScaledVector(axV, L / 2).addScaledVector(upV, -g.wb.axis * 0.85 * K)); foot.rotation.z = Math.atan2(ax[1], ax[0]); gg.add(foot);
      const qr = new THREE.Mesh(new THREE.CylinderGeometry(0.022, 0.026, g.wb.qr * K, 20), metal); qr.position.copy(Wc.clone().addScaledVector(axV, g.wb.qr * K / 2)); qr.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), axV.clone()); gg.add(qr);
      // the rim: round for GT and rally, a formula wheel with two grips for formula
      const rim = new THREE.Group();
      const rimMat = std(COL.rim, { roughness: 0.7, map: fabricTex([6, 1]) });
      if (m.style === 'formula') {
        const w2 = g.rim * K, h2 = g.rim * 0.52 * K;
        const plate = rbox(w2 * 0.78, h2, 0.022, 0.03, new THREE.MeshStandardMaterial({ color: 0xffffff, map: carbonTex([3, 2]), roughness: 0.4, metalness: 0.2 })); rim.add(plate);
        for (const z of [-1, 1]) { const grip = limb(new THREE.Vector3(z * w2 * 0.42, -h2 * 0.42, 0.01), new THREE.Vector3(z * w2 * 0.46, h2 * 0.42, 0.01), 0.022, rimMat); rim.add(grip); }
        const dash = box(w2 * 0.3, h2 * 0.3, 0.004, new THREE.MeshStandardMaterial({ color: 0x0c0c10, emissive: 0x3b2a8a, emissiveIntensity: 0.6 })); dash.position.set(0, h2 * 0.12, -0.014); rim.add(dash);
        for (let i = 0; i < 6; i++) { const bt = new THREE.Mesh(new THREE.CylinderGeometry(0.008, 0.008, 0.006, 12), std([COL.yellow, COL.kerbRed, COL.white, COL.sector][i % 4])); bt.rotation.x = Math.PI / 2; bt.position.set((i % 3 - 1) * w2 * 0.12, -h2 * 0.2 - Math.floor(i / 3) * 0.022, -0.014); rim.add(bt); }
      } else {
        const torus = new THREE.Mesh(new THREE.TorusGeometry(rimR, m.style === 'rally' ? 0.016 : 0.014, 14, 64), rimMat); rim.add(torus);
        const hub = new THREE.Mesh(new THREE.CylinderGeometry(0.04, 0.04, 0.03, 24), metal); hub.rotation.x = Math.PI / 2; hub.position.z = m.style === 'rally' ? 0.05 : 0.01; rim.add(hub);
        const dz2 = m.style === 'rally' ? 0.03 : 0.006;
        for (const [ux, uy] of [[-1, 0], [1, 0], [0, -1]]) { const sp = box(ux ? rimR - 0.02 : 0.034, ux ? 0.034 : rimR - 0.02, 0.008, metal); sp.position.set(ux * rimR / 2, uy * rimR / 2, dz2); rim.add(sp); }
        const mark = box(0.012, 0.03, 0.006, std(COL.yellow)); mark.position.set(0, rimR, 0); rim.add(mark);
      }
      // the rim's plane: its normal is the axis, its up the deck's up
      const basis = new THREE.Matrix4().makeBasis(new THREE.Vector3(0, 0, 1), upV.clone(), axV.clone().negate());
      rim.quaternion.setFromRotationMatrix(basis); rim.position.copy(Wc);
      rim.traverse(o => { if (o.isMesh) { o.castShadow = true; } });
      gg.add(rim);
    }
    {
      // the pedals: a base plate on the deck and three pedals, clutch, brake and throttle, left to right
      const pp = d.parts.pedalPlate, a = pp.angle * Math.PI / 180, u = new THREE.Vector3(Math.cos(a), Math.sin(a), 0), n = new THREE.Vector3(-Math.sin(a), Math.cos(a), 0);
      const g2 = new THREE.Group(); groups.gear.add(g2);
      const top = V(pp.x0, pp.y0, 0);
      const baseC = top.clone().addScaledVector(u, (60 + g.ped.d / 2) * K).addScaledVector(n, 0.012);
      const bp = box(g.ped.d * K, 0.024, g.ped.w * K, dark); bp.position.copy(baseC); bp.rotation.z = a; g2.add(bp);
      const heelRest = box(0.06, 0.03, g.ped.w * 0.8 * K, std(COL.carbon, { roughness: 0.6 })); heelRest.position.copy(top.clone().addScaledVector(u, 0.03).addScaledVector(n, 0.03)); heelRest.rotation.z = a; g2.add(heelRest);
      const faceA = (pp.angle + g.face) * Math.PI / 180;
      const fu = new THREE.Vector3(Math.cos(faceA), Math.sin(faceA), 0);
      const pz = [-0.11, 0, 0.11].map(z => z * Math.min(1.2, g.ped.w / 420));
      ['clutch', 'brake', 'throttle'].forEach((nm, i) => {
        const hinge = top.clone().addScaledVector(u, 0.14 + (i === 1 ? 0.01 : 0)).addScaledVector(n, 0.024);
        const armL = nm === 'throttle' ? 0.22 : 0.2;
        const arm = seg(hinge, hinge.clone().addScaledVector(fu, armL), 0.009, metal); g2.add(arm);
        const pad = box(nm === 'brake' ? 0.1 : 0.085, 0.007, 0.072, std(COL.alu, { metalness: 0.7, roughness: 0.3 }));
        pad.position.copy(hinge.clone().addScaledVector(fu, armL * 0.82)); pad.position.z = pz[i];
        pad.quaternion.setFromRotationMatrix(new THREE.Matrix4().makeBasis(fu.clone(), new THREE.Vector3(-fu.y, fu.x, 0), new THREE.Vector3(0, 0, 1)));
        g2.add(pad);
        arm.position.z = pz[i];
        const unit = rbox(0.05, 0.05, 0.05, 0.01, dark); unit.position.copy(hinge.clone().addScaledVector(u, 0.07)); unit.position.z = pz[i]; g2.add(unit);
      });
    }
    if (d.parts.shifterPlate) {
      const q = d.parts.shifterPlate, g3 = new THREE.Group(); groups.gear.add(g3);
      const top = V(q.x, q.y, q.z);
      const units = g.shifter && g.handbrake ? [['shifter', -q.d / 4], ['handbrake', q.d / 4]] : [[g.shifter ? 'shifter' : 'handbrake', 0]];
      for (const [nm, dx] of units) {
        const c = top.clone(); c.x += dx * K;
        const bx = rbox(0.11, 0.07, 0.1, 0.012, dark); bx.position.set(c.x, c.y + 0.035, c.z); g3.add(bx);
        const lever = seg(new THREE.Vector3(c.x, c.y + 0.06, c.z), new THREE.Vector3(c.x - (nm === 'handbrake' ? 0.06 : 0.01), c.y + (nm === 'handbrake' ? 0.26 : 0.19), c.z), nm === 'handbrake' ? 0.012 : 0.007, metal); g3.add(lever);
        const knob = new THREE.Mesh(nm === 'handbrake' ? new THREE.CapsuleGeometry(0.018, 0.07, 4, 10) : new THREE.SphereGeometry(0.024, 20, 14), std(nm === 'handbrake' ? COL.kerbRed : COL.black, { roughness: 0.45 }));
        knob.position.set(c.x - (nm === 'handbrake' ? 0.07 : 0.01), c.y + (nm === 'handbrake' ? 0.29 : 0.205), c.z); if (nm === 'handbrake') knob.rotation.z = 0.25; g3.add(knob);
      }
    }

    // ---- the screens, lit with the track ----
    {
      const sc = d.parts.screen, g4 = new THREE.Group(); groups.screens.add(g4);
      const n = sc.kind === 'triple' ? 3 : 1;
      const cvs = trackCanvas(1024 * n, 576);
      const parts2 = [];
      for (let i = 0; i < n; i++) {
        const c2 = document.createElement('canvas'); c2.width = 1024; c2.height = 576; c2.getContext('2d').drawImage(cvs, i * 1024, 0, 1024, 576, 0, 0, 1024, 576);
        const t = new THREE.CanvasTexture(c2); t.colorSpace = THREE.SRGBColorSpace; parts2.push(t);
      }
      const sw = sc.w * K, sh = sc.h * K, bz = Math.max(0.004, sc.bezel * K), dep = sc.kind === 'tv' ? 0.05 : 0.035;
      const C = V(sc.x, sc.y, 0);
      const makeScreen = (tex) => {
        const grp = new THREE.Group();
        const shell = box(dep, sh + 2 * bz, sw + 2 * bz, std(COL.bezel, { roughness: 0.5 })); grp.add(shell);
        const face = new THREE.Mesh(new THREE.PlaneGeometry(sw, sh), new THREE.MeshStandardMaterial({ color: 0x000000, emissive: 0xffffff, emissiveMap: tex, emissiveIntensity: 1.05, roughness: 0.3 }));
        face.rotation.y = -Math.PI / 2; face.position.x = -dep / 2 - 0.0008; grp.add(face);
        return grp;
      };
      if (n === 1) { const s1 = makeScreen(parts2[0]); s1.position.copy(C); g4.add(s1); }
      else {
        const side = sc.side * Math.PI / 180, half = sw / 2 + bz;
        const mid = makeScreen(parts2[1]); mid.position.copy(C); g4.add(mid);
        for (const s of [-1, 1]) {
          const scr = makeScreen(parts2[s < 0 ? 0 : 2]);
          // turned in toward the driver about the inner edge of its face, which meets the centre screen's edge
          const pivot = new THREE.Vector3(C.x - dep / 2, C.y, s * half);
          scr.position.copy(pivot).add(new THREE.Vector3(-Math.sin(side) * half + Math.cos(side) * dep / 2, 0, s * (Math.cos(side) * half + Math.sin(side) * dep / 2)));
          scr.rotation.y = -s * side;
          g4.add(scr);
        }
      }
      // the glow the screens throw back over the rig and the driver
      const gl = new THREE.PointLight(0xbfd8ff, 2.2, 3.2, 1.6); gl.position.set(C.x - 0.45, C.y, 0); glow.add(gl);
      if (n === 3) for (const s of [-1, 1]) { const g5 = new THREE.PointLight(0xc8e0ff, 1.1, 2.4, 1.8); g5.position.set(C.x - 0.7, C.y, s * 0.6); glow.add(g5); }
      fitPts.push(V(sc.x, sc.y + sc.h / 2, (n === 3 ? sc.w * 1.4 : sc.w / 2)), V(sc.x, sc.y - sc.h / 2, -(n === 3 ? sc.w * 1.4 : sc.w / 2)));
    }

    // ---- the driver: a silhouette from the solved posture ----
    {
      const skin = std(COL.driver, { roughness: 0.62, metalness: 0.05 });
      const suit = std(COL.driverHi, { roughness: 0.7 });
      const dz = g2z => g2z * K;
      const hipJ = b.hips * 0.25;
      const P2 = (q, z) => V(q[0], q[1], z);
      const Hm = P2(Lo.H, 0), Sm = P2(p.S, 0);
      // pelvis and torso
      const pelvis = new THREE.Mesh(new THREE.SphereGeometry(1, 20, 14), suit); pelvis.scale.set(0.14, 0.11, b.hips / 2 * K * 0.92); pelvis.position.copy(Hm.clone().addScaledVector(nfwd, -0.02).add(new THREE.Vector3(0, 0.02, 0))); groups.driver.add(pelvis);
      const chestD = b.chest * K;
      const tl = Sm.distanceTo(Hm);
      const torso = new THREE.Mesh(new THREE.SphereGeometry(1, 28, 20), suit);
      torso.scale.set(chestD / 2 * 1.12, tl * 0.58, b.shoulders / 2 * K * 0.8);
      torso.position.copy(Hm.clone().addScaledVector(tdir, tl * 0.5).addScaledVector(nfwd, 0.03)); torso.rotation.z = bk; groups.driver.add(torso);
      const yoke = new THREE.Mesh(new THREE.SphereGeometry(1, 24, 16), suit);
      yoke.scale.set(chestD / 2 * 0.9, 0.09, b.shoulders / 2 * K * 0.95);
      yoke.position.copy(Sm.clone().addScaledVector(tdir, -0.05).addScaledVector(nfwd, 0.02)); yoke.rotation.z = bk; groups.driver.add(yoke);
      // the head held level, the neck from the shoulders
      const Em = P2(p.E, 0);
      const headC = Em.clone().add(new THREE.Vector3(-b.eyeFwd * K * 0.95, 0.0, 0));
      const head = new THREE.Mesh(new THREE.SphereGeometry(1, 24, 18), skin); head.scale.set(b.head / 2 * K * 0.88, 0.098, 0.07); head.position.copy(headC); groups.driver.add(head);
      groups.driver.add(limb(Sm.clone().add(new THREE.Vector3(0.01, 0.0, 0)), headC.clone().add(new THREE.Vector3(-0.01, -0.07, 0)), 0.045, skin));
      // the arms: shoulders to the rim at 9 and 3, the elbows dropped and out
      arm3 = {};
      const grip = s => Wc.clone().add(new THREE.Vector3(0, 0, s * rimR * (m.style === 'formula' ? 0.95 : 1)));
      for (const s of [-1, 1]) {
        const sh3 = Sm.clone().add(new THREE.Vector3(0, -0.02, s * (b.shoulders / 2 - 22) * K));
        const g3 = grip(s), U = b.upperArm * K, F2 = b.forearm * K;
        const dv = g3.clone().sub(sh3), dd = Math.min(dv.length(), U + F2 - 1e-4);
        const aa = (U * U - F2 * F2 + dd * dd) / (2 * dd), hh = Math.sqrt(Math.max(0, U * U - aa * aa));
        const dirn = dv.clone().normalize();
        const pole = new THREE.Vector3(0, -1, s * 0.6); pole.sub(dirn.clone().multiplyScalar(pole.dot(dirn))).normalize();
        const el = sh3.clone().addScaledVector(dirn, aa).addScaledVector(pole, hh);
        groups.driver.add(limb(sh3, el, 0.045, suit)); groups.driver.add(limb(el, g3, 0.038, suit));
        const hand = new THREE.Mesh(new THREE.SphereGeometry(0.04, 14, 10), skin); hand.scale.set(1, 1.15, 0.8); hand.position.copy(g3); groups.driver.add(hand);
        if (s > 0) { arm3.elbow = el; arm3.shoulder = sh3; arm3.grip = g3; }
      }
      // the legs: hips, knees, ankles; the right foot on the brake and throttle, the left on the clutch
      for (const s of [-1, 1]) {
        const z = s * hipJ, zf = s * 85;
        const h3 = P2(Lo.H, z), k3 = P2(p.rest.K, s * (hipJ + 20)), a3 = P2(p.rest.A, zf);
        groups.driver.add(limb(h3, k3, 0.068, suit, 1, 0.92));
        groups.driver.add(limb(k3, a3, 0.05, suit));
        const knee = new THREE.Mesh(new THREE.SphereGeometry(0.058, 14, 10), suit); knee.position.copy(k3); groups.driver.add(knee);
        const P0 = P2(p.rest.P, zf), B0 = P2(p.rest.B, zf), toe = P0.clone().add(B0.clone().sub(P0).multiplyScalar(b.foot / b.ball * 1.0));
        const shoe = limb(P0.clone().add(new THREE.Vector3(0, 0.03, 0)), toe.clone().add(new THREE.Vector3(0, 0.02, 0)), 0.04, std(0x17161c, { roughness: 0.6 }), 1, 0.85);
        groups.driver.add(shoe);
      }
      groups.driver.traverse(o => { if (o.isMesh) { o.castShadow = true; o.receiveShadow = true; } });
      fitPts.push(headC.clone().add(new THREE.Vector3(0, 0.15, 0)));
    }

    // ---- the angle lines, drawn on the near side of the driver ----
    {
      const lm = new THREE.MeshBasicMaterial({ color: COL.line, depthTest: false, transparent: true, opacity: 0.95 });
      const zN = Math.max(b.shoulders / 2, b.hips / 2) * K + 0.06;
      const P3 = q => V(q[0], q[1]).setZ(zN);
      const r = 0.004;
      const pts = { S: P3(p.S), H: P3(Lo.H), K: P3(p.rest.K), A: P3(p.rest.A), B: P3(p.rest.B), P: P3(p.rest.P), W: P3(Lo.wheel) };
      const add = mesh => { mesh.renderOrder = 10; groups.angles.add(mesh); };
      for (const [a2, c2] of [['S', 'H'], ['H', 'K'], ['K', 'A'], ['P', 'B']]) add(seg(pts[a2], pts[c2], r, lm));
      if (arm3.elbow) { const e3 = arm3.elbow.clone().setZ(zN), s3 = arm3.shoulder.clone().setZ(zN), g3 = arm3.grip.clone().setZ(zN); add(seg(s3, e3, r, lm)); add(seg(e3, g3, r, lm)); pts.Eb = e3; pts.Gr = g3; pts.Sh = s3; }
      // the vertical through the hip point, for the back angle
      const dash = new THREE.MeshBasicMaterial({ color: COL.line, depthTest: false, transparent: true, opacity: 0.5 });
      add(seg(pts.H, pts.H.clone().add(new THREE.Vector3(0, 0.36, 0)), r * 0.7, dash));
      const arc = (c, u1, u2, rr, out = 1.6) => { // an arc at c from direction u1 to u2 (the smaller angle); the label point out along its bisector
        const a1 = Math.atan2(u1.y, u1.x); let a2 = Math.atan2(u2.y, u2.x); let da = a2 - a1; while (da > Math.PI) da -= 2 * Math.PI; while (da < -Math.PI) da += 2 * Math.PI;
        const list = []; for (let i = 0; i <= 18; i++) { const t = a1 + da * i / 18; list.push(new THREE.Vector3(c.x + Math.cos(t) * rr, c.y + Math.sin(t) * rr, c.z)); }
        add(tube(list, r * 0.9, lm)); return new THREE.Vector3(c.x + Math.cos(a1 + da / 2) * rr * out, c.y + Math.sin(a1 + da / 2) * rr * out, c.z);
      };
      const dir = (a2, c2) => pts[c2].clone().sub(pts[a2]).normalize();
      const st = id => { const row = res.checks.find(x => x.id === id); return row ? row.status : 'info'; };
      const tags = [];
      tags.push({ p: arc(pts.H, new THREE.Vector3(0, 1, 0), dir('H', 'S'), 0.2, 1.25).add(new THREE.Vector3(-0.05, 0.02, 0)), text: T('g3.back', { v: Math.round(p.back) }), tone: st('torso') });
      tags.push({ p: arc(pts.H, dir('H', 'S'), dir('H', 'K'), 0.1, 1.9), text: T('g3.hip', { v: Math.round(p.hip) }), tone: st('hip') });
      tags.push({ p: arc(pts.K, dir('K', 'H'), dir('K', 'A'), 0.09), text: T('g3.knee', { v: Math.round(p.rest.knee) }), tone: st('knee') });
      tags.push({ p: arc(pts.A, dir('A', 'K'), dir('P', 'B'), 0.07), text: T('g3.ankle', { v: Math.round(p.rest.ankle) }), tone: st('ankle') });
      if (pts.Eb) tags.push({ p: arc(pts.Eb, pts.Sh.clone().sub(pts.Eb).normalize(), pts.Gr.clone().sub(pts.Eb).normalize(), 0.08), text: T('g3.elbow', { v: Math.round(p.elbow) }), tone: st('elbow') });
      for (const k of ['S', 'H', 'K', 'A', 'Eb']) if (pts[k]) { const dot = new THREE.Mesh(new THREE.SphereGeometry(0.011, 12, 8), new THREE.MeshBasicMaterial({ color: 0xffffff, depthTest: false })); dot.position.copy(pts[k]); dot.renderOrder = 11; groups.angles.add(dot); }
      angleTags = tags.map(t => ({ p: t.p, text: t.text, tone: t.tone, priority: t.tone === 'fail' ? 9 : t.tone === 'check' ? 7 : 5 }));
    }

    // ---- dimension labels (frame view) ----
    const fp = d.full;
    labels.push({ p: V(X1 / 2, 0, W / 2 + 80), text: T('g3.long', { len: E.len(X1, m.units, 'dim') }), tone: 'dim', priority: 3 });
    labels.push({ p: V(X1 + 60, 0, 0), text: T('g3.wide', { len: E.len(W, m.units, 'dim') }), tone: 'dim', priority: 3 });
    labels.push({ p: V(Lo.wheel[0], Lo.wheel[1] + g.rim / 2 + 40, 0), text: T('g3.wheelUp', { len: E.len(Lo.wheel[1], m.units, 'dim') }), tone: 'dim', priority: 2 });
    labels.push({ p: V(Lo.H[0], Lo.H[1] - 120, W / 2), text: T('g3.hipUp', { len: E.len(Lo.H[1], m.units, 'dim') }), tone: 'dim', priority: 2 });
    void fp;
    applyShow(); placeKey();
    dirty = true;
  }
  function placeKey() {
    const c = new THREE.Vector3(last ? last.design.parts.len * K / 2 : 0.7, 0, 0);
    key.position.copy(c).add(new THREE.Vector3(-1.6, 3.4, 2.6)); key.target.position.copy(c);
    key.shadow.camera.left = -3; key.shadow.camera.right = 3; key.shadow.camera.top = 3; key.shadow.camera.bottom = -3; key.shadow.camera.updateProjectionMatrix();
  }

  // ---------- light: day for the live view; dusk, the room dim and the screens glowing, for the hero images ----------
  function setMood(md) {
    const dusk = md === 'dusk';
    key.intensity = dusk ? 0.55 : 2.4; key.color.setHex(dusk ? 0xffb877 : 0xfff1de);
    hemi.intensity = dusk ? 0.22 : 1.25; hemi.color.setHex(dusk ? 0x8e98c0 : 0xf4f6ff);
    scene.background.setHex(dusk ? 0x24232c : 0xe9ebf0);
    glow.children.forEach(l => { if (l.userData.base == null) l.userData.base = l.intensity; l.intensity = l.userData.base * (dusk ? 3.2 : 1); });
    world.traverse(o => { if (o.material && o.material.emissiveMap) o.material.emissiveIntensity = dusk ? 2.1 : 1.05; });
    renderer.toneMappingExposure = dusk ? 0.6 : 1.0;
    dirty = true;
  }

  // ---------- what shows: frame, plates, driver, angle lines ----------
  function applyShow() {
    if (!groups.frame) return;
    groups.frame.visible = show.frame;
    groups.plates.visible = show.plates;
    groups.driver.visible = show.driver;
    groups.angles.visible = show.angles;
    dirty = true; invalidate();
  }
  // build steps: e 0 assembled, 1 apart; upTo: the steps shown; hi: the step to highlight
  function explode(e, upTo = 99, hi = null) {
    const tmp = new THREE.Matrix4(), off = new THREE.Vector3(), col = new THREE.Color();
    for (const inst of frameInst) {
      inst.userData.base.forEach((b0, i) => {
        const hide = b0.step > upTo, k = hi == null ? e : b0.step === hi ? e : 0;
        off.copy(b0.dir).multiplyScalar((0.12 + 0.04 * b0.step) * k).add(new THREE.Vector3(0, 0.05 * b0.step * k, 0));
        tmp.copy(b0.m); if (hide) tmp.scale(new THREE.Vector3(0, 0, 0));
        tmp.elements[12] = b0.c.x + off.x; tmp.elements[13] = b0.c.y + off.y; tmp.elements[14] = b0.c.z + off.z;
        inst.setMatrixAt(i, tmp);
        col.copy(b0.color); if (hi != null && b0.step === hi) col.setHex(COL.yellow);
        inst.setColorAt(i, col);
      });
      inst.instanceMatrix.needsUpdate = true; if (inst.instanceColor) inst.instanceColor.needsUpdate = true;
    }
    if (groups.plates) groups.plates.children.forEach(o => { o.visible = (o.userData.step || 0) <= upTo; });
  }
  function animateSteps(tt) {
    const steps = [...new Set(frameInst.flatMap(i => i.userData.base.map(b0 => b0.step)))].sort((a, b) => a - b);
    const n = steps.length || 1, per = 1 / n;
    const tmp = new THREE.Matrix4(), off = new THREE.Vector3();
    for (const inst of frameInst) {
      inst.userData.base.forEach((b0, i) => {
        const idx = steps.indexOf(b0.step), s0 = idx * per, local = Math.min(1, Math.max(0, (tt - s0) / per));
        const e = 1 - (1 - Math.pow(1 - local, 3));
        off.copy(b0.dir).multiplyScalar((0.3 + 0.04 * b0.step) * e).add(new THREE.Vector3(0, 0.22 * e, 0));
        tmp.copy(b0.m); if (tt < s0) tmp.scale(new THREE.Vector3(0, 0, 0));
        tmp.elements[12] = b0.c.x + off.x; tmp.elements[13] = b0.c.y + off.y; tmp.elements[14] = b0.c.z + off.z;
        inst.setMatrixAt(i, tmp);
      });
      inst.instanceMatrix.needsUpdate = true;
    }
    groups.plates.children.forEach(o => { const idx = steps.indexOf(o.userData.step); o.visible = idx < 0 || tt >= (idx + 0.6) * per; });
    groups.gear.visible = tt >= 0.98; groups.seat.visible = tt >= 0.98;
  }

  // ---------- labels ----------
  function placed(width, height, measure, list) {
    const out = [];
    for (const lb of list.slice().sort((a, b) => b.priority - a.priority)) {
      const v = lb.p.clone().project(camera);
      if (v.z > 1 || Math.abs(v.x) > 1.02 || Math.abs(v.y) > 1.02) continue;
      const wpx = measure(lb.text), hpx = 22;
      let x = (v.x + 1) / 2 * width, y = (1 - v.y) / 2 * height;
      const rect = () => ({ x0: x - wpx / 2 - 3, x1: x + wpx / 2 + 3, y0: y - hpx - 3, y1: y + 3 });
      let tries = 0;
      while (out.some(o => { const a2 = rect(), b2 = o.rect; return a2.x0 < b2.x1 && b2.x0 < a2.x1 && a2.y0 < b2.y1 && b2.y0 < a2.y1; }) && tries < 5) { y -= hpx + 4; tries++; }
      if (tries >= 5) continue;
      x = Math.min(width - wpx / 2 - 6, Math.max(wpx / 2 + 6, x)); y = Math.max(hpx + 6, Math.min(height - 4, y));
      out.push({ x, y, text: lb.text, tone: lb.tone, rect: rect() });
    }
    return out;
  }
  let measurer = null;
  function measureFn(px) { if (!measurer) measurer = document.createElement('canvas').getContext('2d'); measurer.font = `600 ${px}px "Instrument Sans", "Segoe UI", sans-serif`; return tx => measurer.measureText(tx).width + Math.round(px * 1.0); }
  function currentLabels() { return show.angles && show.driver ? angleTags : !show.plates && show.frame ? labels : []; }
  function layoutLabels() {
    if (!labelsLayer) return;
    labelsLayer.textContent = '';
    const list = currentLabels(); if (!list.length) return;
    const r = canvas.getBoundingClientRect();
    for (const tg of placed(r.width, r.height, measureFn(13.5), list)) {
      const el = document.createElement('span');
      el.className = 'sr-tag sr-tag-' + tg.tone; el.textContent = tg.text;
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
  function fit(margin = 0.9, pts0) {
    const pts = pts0 || (fitPts.length ? fitPts : [new THREE.Vector3(), new THREE.Vector3(1, 1, 1)]);
    const c = pts.reduce((a, q) => a.add(q), new THREE.Vector3()).multiplyScalar(1 / pts.length);
    orbit.target.copy(c);
    const right = new THREE.Vector3(), upv = new THREE.Vector3();
    let r = orbit.radius || 5;
    for (let i = 0; i < 14; i++) {
      orbit.radius = r; aim();
      let x0 = Infinity, x1 = -Infinity, y0 = Infinity, y1 = -Infinity;
      for (const q of pts) { const v = q.clone().project(persp); x0 = Math.min(x0, v.x); x1 = Math.max(x1, v.x); y0 = Math.min(y0, v.y); y1 = Math.max(y1, v.y); }
      const dist = persp.position.distanceTo(orbit.target);
      const hh = Math.tan(THREE.MathUtils.degToRad(persp.fov / 2)) * dist, ww = hh * persp.aspect;
      right.setFromMatrixColumn(persp.matrixWorld, 0); upv.setFromMatrixColumn(persp.matrixWorld, 1);
      orbit.target.addScaledVector(right, (x0 + x1) / 2 * ww).addScaledVector(upv, (y0 + y1) / 2 * hh);
      r = r * Math.max((x1 - x0) / 2 / margin, (y1 - y0) / 2 / (margin * 0.92));
    }
    orbit.radius = r;
  }
  function orthoView(v, aspect) {
    const pts = fitPts.length ? fitPts : [new THREE.Vector3(), new THREE.Vector3(1, 1, 1)];
    const xs = pts.map(q => q.x), ys = pts.map(q => q.y), zs = pts.map(q => q.z);
    const [xa, xb, ya, yb, za, zb] = [Math.min(...xs), Math.max(...xs), Math.min(...ys), Math.max(...ys), Math.min(...zs), Math.max(...zs)];
    let hw, hh;
    if (v === 'side') { hw = (xb - xa) / 2; hh = (yb - ya) / 2; ortho.up.set(0, 1, 0); ortho.position.set((xa + xb) / 2, (ya + yb) / 2, 60); ortho.lookAt((xa + xb) / 2, (ya + yb) / 2, 0); }
    else if (v === 'front') { hw = (zb - za) / 2; hh = (yb - ya) / 2; ortho.up.set(0, 1, 0); ortho.position.set(-60, (ya + yb) / 2, (za + zb) / 2); ortho.lookAt(0, (ya + yb) / 2, (za + zb) / 2); }
    else { hw = (xb - xa) / 2; hh = (zb - za) / 2; ortho.up.set(0, 0, -1); ortho.position.set((xa + xb) / 2, 60, (za + zb) / 2); ortho.lookAt((xa + xb) / 2, 0, (za + zb) / 2); }
    hw *= 1.12; hh *= 1.12;
    if (hw / hh < aspect) hw = hh * aspect; else hh = hw / aspect;
    Object.assign(ortho, { left: -hw, right: hw, top: hh, bottom: -hh, zoom: 1 }); ortho.updateProjectionMatrix(); ortho.updateMatrixWorld();
  }
  let view = 'iso';
  function size() { return { w: canvas.clientWidth || canvas.width, h: canvas.clientHeight || canvas.height }; }
  function resize() { const { w, h } = size(); if (!w || !h) return; renderer.setSize(w, h, false); persp.aspect = w / h; dirty = true; }
  function render() {
    const { w, h } = size();
    if (view === 'side' || view === 'front' || view === 'plan') { orthoView(view, w / h); camera = ortho; groups.room && (groups.room.visible = false); }
    else { camera = persp; persp.aspect = w / h; aim(); groups.room && (groups.room.visible = true); }
    if (anim) {
      const tt = Math.min(1, (performance.now() - anim.t0) / anim.ms);
      if (anim.kind === 'steps') animateSteps(tt);
      if (tt >= 1) { anim = null; explode(0, 99); groups.gear.visible = true; groups.seat.visible = true; }
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
    if (view !== 'iso') { view = 'iso'; if (opts.onView) opts.onView(view); }
    if (pointers.size === 2) { const [a, b] = [...pointers.values()]; const dd = Math.hypot(a.x - b.x, a.y - b.y); if (pinch0) zoomBy(pinch0 / dd); pinch0 = dd; }
    else { orbit.theta -= (e.clientX - prev.x) * 0.008; orbit.phi = Math.min(1.5, Math.max(0.3, orbit.phi - (e.clientY - prev.y) * 0.006)); }
    invalidate();
  });
  const upE = e => { pointers.delete(e.pointerId); if (pointers.size < 2) pinch0 = 0; };
  canvas.addEventListener('pointerup', upE); canvas.addEventListener('pointercancel', upE);
  function zoomBy(f) { orbit.radius = Math.min(30, Math.max(0.6, orbit.radius * f)); }
  canvas.addEventListener('wheel', e => { e.preventDefault(); zoomBy(Math.pow(1.0015, e.deltaY)); invalidate(); }, { passive: false });
  canvas.addEventListener('keydown', e => {
    const stp = { ArrowLeft: [0.12, 0], ArrowRight: [-0.12, 0], ArrowUp: [0, -0.08], ArrowDown: [0, 0.08] }[e.key];
    if (stp) { e.preventDefault(); if (view !== 'iso') { view = 'iso'; if (opts.onView) opts.onView(view); } orbit.theta += stp[0]; orbit.phi = Math.min(1.5, Math.max(0.3, orbit.phi + stp[1])); invalidate(); }
    if (e.key === '+' || e.key === '=') { zoomBy(0.9); invalidate(); }
    if (e.key === '-') { zoomBy(1.1); invalidate(); }
  });
  const ro = typeof ResizeObserver === 'function' ? new ResizeObserver(() => { resize(); invalidate(); }) : null;
  if (ro) ro.observe(canvas);

  return {
    update(res) {
      const keep = last && last.m.build === res.m.build;
      last = res; build(res);
      const { w, h } = size(); persp.aspect = (w || 16) / (h || 10);
      if (!keep) { orbit.theta = -0.95; orbit.phi = 1.12; }
      fit(); resize(); invalidate();
    },
    // which parts show: { frame, plates, driver, angles }
    setShow(o) { Object.assign(show, o); applyShow(); },
    get show() { return Object.assign({}, show); },
    setView(v) { view = ['iso', 'side', 'front', 'plan'].includes(v) ? v : 'iso'; if (view === 'iso') fit(); invalidate(); },
    get view() { return view; },
    playSteps() { if (reduced) { explode(1, 99); invalidate(); setTimeout(() => { explode(0, 99); invalidate(); }, 1600); return; } anim = { kind: 'steps', t0: performance.now(), ms: 5200 }; invalidate(); },
    // one image: a view ('iso', 'hero', 'side', 'front', 'plan'), the build steps up to `upTo` with `hi` lifted out
    snapshot({ width, height, view: v = 'iso', type = 'image/png', quality = 0.92, theta, phi, zoom, upTo = 99, hi = null, explodeBy = 0, labelPx = 14, driverOn = true, anglesOn = false, roomOn = true, screensOn = true, gearOn = true, seatOn = true, mood = 'day' } = {}) {
      const saved = { theta: orbit.theta, phi: orbit.phi, radius: orbit.radius, target: orbit.target.clone(), pr: renderer.getPixelRatio(), show: Object.assign({}, show), view };
      setMood(mood);
      anim = null;
      renderer.setPixelRatio(1); renderer.setSize(width, height, false);
      show.frame = true; show.plates = true; show.driver = driverOn; show.angles = anglesOn; applyShow();
      groups.room.visible = roomOn && !['side', 'front', 'plan'].includes(v); groups.screens.visible = screensOn; groups.gear.visible = gearOn; groups.seat.visible = seatOn;
      explode(explodeBy, upTo, hi);
      if (['side', 'front', 'plan'].includes(v)) { orthoView(v, width / height); camera = ortho; }
      else { camera = persp; persp.aspect = width / height; if (theta != null) orbit.theta = theta; if (phi != null) orbit.phi = phi; fit(v === 'hero' ? 0.97 : 0.9); if (zoom) orbit.radius *= zoom; aim(); }
      renderer.render(scene, camera);
      const url = canvas.toDataURL(type, quality);
      const tags = placed(width, height, measureFn(labelPx), anglesOn ? angleTags : []).map(tg => ({ x: tg.x, y: tg.y, text: tg.text, tone: tg.tone }));
      orbit.theta = saved.theta; orbit.phi = saved.phi; orbit.radius = saved.radius; orbit.target.copy(saved.target);
      Object.assign(show, saved.show); view = saved.view; groups.screens.visible = true; groups.gear.visible = true; groups.seat.visible = true; setMood('day');
      explode(0, 99); applyShow(); camera = persp;
      renderer.setPixelRatio(saved.pr); resize(); invalidate();
      return { url, tags };
    },
    // the model for SketchUp or Blender: the rig itself, its plates and the gear, without the room and the driver
    exportObject() {
      const gOut = new THREE.Group(); gOut.name = 'sim-rig';
      const frame = new THREE.Group(); frame.name = 'frame';
      const mm = new THREE.Matrix4();
      for (const inst of frameInst) for (let i = 0; i < inst.count; i++) { inst.getMatrixAt(i, mm); const mesh = new THREE.Mesh(new THREE.BoxGeometry(1, 1, 1), new THREE.MeshStandardMaterial({ color: inst.material.color.getHex() === 0xffffff ? COL.pine : COL.alu })); mesh.applyMatrix4(mm); frame.add(mesh); }
      gOut.add(frame);
      for (const k of ['plates', 'gear', 'seat', 'screens']) if (groups[k]) { const c = groups[k].clone(true); c.name = k; gOut.add(c); }
      return gOut;
    },
    get three() { return THREE; },
    dispose() { cancelAnimationFrame(raf); if (ro) ro.disconnect(); disposeTree(world); renderer.dispose(); },
  };
}
