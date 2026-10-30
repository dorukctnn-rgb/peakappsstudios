// Procedural barber-shop objects for Üç Koltuk. Shared by the live hero pole and the
// offline render harness, so the pre-rendered cut images and the live scene come from
// one set of models and one set of materials.
import * as THREE from 'three';
import { RoomEnvironment } from './vendor/RoomEnvironment.js';
import { RoundedBoxGeometry } from './vendor/RoundedBoxGeometry.js';

export const PAL = {
  red: '#CF2A26', white: '#F3F5F2', black: '#141619', mint: '#A6DCC9',
  oxblood: '#4E1820', chrome: '#C9CDD1', lemon: '#EBD24A', wood: '#C98F55'
};

export function makeEnv(renderer) {
  const pm = new THREE.PMREMGenerator(renderer);
  const tex = pm.fromScene(new RoomEnvironment(), 0.035).texture;
  pm.dispose();
  return tex;
}

export function materials() {
  return {
    chrome: new THREE.MeshStandardMaterial({ color: 0xdfe3e7, metalness: 1, roughness: 0.16 }),
    steel: new THREE.MeshStandardMaterial({ color: 0xc4c9ce, metalness: 1, roughness: 0.26 }),
    blackPlastic: new THREE.MeshStandardMaterial({ color: 0x17191c, metalness: 0, roughness: 0.42 }),
    horn: new THREE.MeshStandardMaterial({ color: 0x1b1412, metalness: 0, roughness: 0.22 }),
    leather: new THREE.MeshStandardMaterial({ color: 0x5a1b24, metalness: 0, roughness: 0.48 }),
    red: new THREE.MeshStandardMaterial({ color: 0xcf2a26, metalness: 0, roughness: 0.38 }),
    white: new THREE.MeshStandardMaterial({ color: 0xf1f3f0, metalness: 0, roughness: 0.6 })
  };
}

// --- textures -----------------------------------------------------------------------
// Diagonal red/white bands that wrap seamlessly around a cylinder (u) and along it (v).
export function stripeTexture(bands = 2) {
  const c = document.createElement('canvas');
  c.width = 256; c.height = 256;
  const g = c.getContext('2d');
  g.fillStyle = PAL.white; g.fillRect(0, 0, 256, 256);
  g.fillStyle = PAL.red;
  const w = 256 / bands;
  for (let i = -bands - 1; i <= bands + 1; i++) {
    const x = i * w;
    g.beginPath();
    g.moveTo(x, 256); g.lineTo(x + w * 0.5, 256); g.lineTo(x + w * 0.5 + 256, 0); g.lineTo(x + 256, 0);
    g.closePath(); g.fill();
  }
  // a hairline of darker red on the leading edge reads as painted enamel
  const t = new THREE.CanvasTexture(c);
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  t.colorSpace = THREE.SRGBColorSpace;
  t.anisotropy = 4;
  return t;
}

function woodTexture() {
  const c = document.createElement('canvas');
  c.width = 512; c.height = 128;
  const g = c.getContext('2d');
  g.fillStyle = '#c48a52'; g.fillRect(0, 0, 512, 128);
  let seed = 7;
  const rnd = () => { seed = (seed * 16807) % 2147483647; return seed / 2147483647; };
  for (let i = 0; i < 70; i++) {
    const y = rnd() * 128;
    g.strokeStyle = `rgba(${110 + rnd() * 40 | 0},${62 + rnd() * 20 | 0},${30 + rnd() * 10 | 0},${0.18 + rnd() * 0.25})`;
    g.lineWidth = 0.6 + rnd() * 2.2;
    g.beginPath();
    g.moveTo(0, y);
    for (let x = 0; x <= 512; x += 32) g.lineTo(x, y + Math.sin(x * 0.012 + i) * (2 + rnd() * 3));
    g.stroke();
  }
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

function terryTexture() {
  const c = document.createElement('canvas');
  c.width = 256; c.height = 256;
  const g = c.getContext('2d');
  g.fillStyle = '#f4f5f2'; g.fillRect(0, 0, 256, 256);
  let seed = 3;
  const rnd = () => { seed = (seed * 16807) % 2147483647; return seed / 2147483647; };
  for (let i = 0; i < 2600; i++) {
    const v = 205 + rnd() * 40 | 0;
    g.fillStyle = `rgb(${v},${v + 2},${v})`;
    g.fillRect(rnd() * 256, rnd() * 256, 2, 2);
  }
  const t = new THREE.CanvasTexture(c);
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

function castAll(o) {
  o.traverse((m) => { if (m.isMesh) { m.castShadow = true; m.receiveShadow = false; } });
  return o;
}

// --- barber pole (wall mounted, vertical) ------------------------------------------
export function makePole(M) {
  const g = new THREE.Group();
  const tex = stripeTexture(2);
  tex.repeat.set(1, 1.6);
  const H = 3.0, R = 0.4;
  const inner = new THREE.Mesh(
    new THREE.CylinderGeometry(R * 0.88, R * 0.88, H, 56, 1, true),
    new THREE.MeshStandardMaterial({ map: tex, roughness: 0.32, metalness: 0 })
  );
  g.add(inner);
  const glass = new THREE.Mesh(
    new THREE.CylinderGeometry(R, R, H, 56, 1, true),
    new THREE.MeshStandardMaterial({ color: 0xffffff, metalness: 0, roughness: 0.04, transparent: true, opacity: 0.16, envMapIntensity: 2.2, depthWrite: false })
  );
  g.add(glass);
  // chrome collars and domes
  const capProfile = [
    [0, 0.62], [0.16, 0.6], [0.3, 0.52], [0.4, 0.4], [0.46, 0.26], [0.47, 0.16], [0.5, 0.14], [0.5, 0.04], [0.45, 0.02], [0.45, 0]
  ].map(([x, y]) => new THREE.Vector2(x, y));
  const capGeo = new THREE.LatheGeometry(capProfile, 64);
  const top = new THREE.Mesh(capGeo, M.chrome); top.position.y = H / 2; g.add(top);
  const knob = new THREE.Mesh(new THREE.SphereGeometry(0.11, 32, 16), M.chrome); knob.position.y = H / 2 + 0.68; g.add(knob);
  const bot = new THREE.Mesh(capGeo, M.chrome); bot.rotation.x = Math.PI; bot.position.y = -H / 2; g.add(bot);
  const tip = new THREE.Mesh(new THREE.ConeGeometry(0.09, 0.3, 32), M.chrome); tip.rotation.x = Math.PI; tip.position.y = -H / 2 - 0.76; g.add(tip);
  // wall bracket: two arms back to a plate
  for (const y of [H / 2 + 0.28, -H / 2 - 0.28]) {
    const arm = new THREE.Mesh(new THREE.CylinderGeometry(0.05, 0.05, 0.9, 16), M.chrome);
    arm.rotation.x = Math.PI / 2; arm.position.set(0, y, -0.55); g.add(arm);
  }
  const plate = new THREE.Mesh(new RoundedBoxGeometry(0.34, H + 1.0, 0.08, 3, 0.04), M.chrome);
  plate.position.set(0, 0, -1.0); g.add(plate);
  castAll(g);
  glass.castShadow = false;
  return { group: g, stripe: tex };
}

// --- straight razor (ustura), open ---------------------------------------------------
export function makeRazor(M) {
  const g = new THREE.Group();
  // blade: straight spine on top, a slight smile on the edge, square point
  const blade = new THREE.Shape();
  blade.moveTo(0.05, 0.16);
  blade.lineTo(0.45, 0.2);
  blade.lineTo(2.35, 0.24);
  blade.lineTo(2.42, 0.18);
  blade.lineTo(2.42, -0.36);
  blade.quadraticCurveTo(1.4, -0.42, 0.55, -0.26);
  blade.lineTo(0.42, -0.1);
  blade.quadraticCurveTo(0.2, -0.08, 0.05, -0.12);
  blade.quadraticCurveTo(-0.05, 0.02, 0.05, 0.16);
  const bGeo = new THREE.ExtrudeGeometry(blade, { depth: 0.04, bevelEnabled: true, bevelSize: 0.012, bevelThickness: 0.012, bevelSegments: 2, curveSegments: 24 });
  bGeo.translate(0, 0, -0.02);
  g.add(new THREE.Mesh(bGeo, M.steel));
  // the hollow grind reads as a brighter band along the edge
  const grind = new THREE.Shape();
  grind.moveTo(0.6, -0.08); grind.lineTo(2.36, -0.06); grind.lineTo(2.36, -0.3);
  grind.quadraticCurveTo(1.4, -0.36, 0.62, -0.22); grind.lineTo(0.6, -0.08);
  const gm = new THREE.Mesh(new THREE.ShapeGeometry(grind, 16), M.chrome);
  gm.position.z = 0.034; g.add(gm);
  // tail of the tang, curling down
  const tail = new THREE.Mesh(new THREE.TorusGeometry(0.16, 0.045, 12, 24, Math.PI * 0.9), M.steel);
  tail.position.set(-0.08, -0.02, 0); tail.rotation.z = Math.PI * 0.55; g.add(tail);
  // scales (handle), swung open behind the pivot
  const sc = new THREE.Shape();
  sc.moveTo(0, -0.14);
  sc.quadraticCurveTo(1.3, -0.22, 2.55, -0.13);
  sc.quadraticCurveTo(2.72, 0, 2.55, 0.13);
  sc.quadraticCurveTo(1.3, 0.22, 0, 0.14);
  sc.quadraticCurveTo(-0.14, 0, 0, -0.14);
  const sGeo = new THREE.ExtrudeGeometry(sc, { depth: 0.14, bevelEnabled: true, bevelSize: 0.03, bevelThickness: 0.03, bevelSegments: 3, curveSegments: 24 });
  sGeo.translate(0, 0, -0.07);
  const handle = new THREE.Group();
  handle.add(new THREE.Mesh(sGeo, M.horn));
  for (const x of [0.12, 2.42]) {
    const pin = new THREE.Mesh(new THREE.CylinderGeometry(0.045, 0.045, 0.26, 20), M.chrome);
    pin.rotation.x = Math.PI / 2; pin.position.set(x, 0, 0); handle.add(pin);
  }
  handle.position.set(0.12, 0.02, -0.06);
  handle.rotation.z = Math.PI + 0.38;
  g.add(handle);
  return castAll(g);
}

// --- clipper (makine) ----------------------------------------------------------------
export function makeClipper(M) {
  const g = new THREE.Group();
  const body = new THREE.Mesh(new RoundedBoxGeometry(1.0, 2.7, 0.62, 5, 0.26), M.blackPlastic);
  g.add(body);
  // chrome face plate with a knurled grip band
  const plate = new THREE.Mesh(new RoundedBoxGeometry(0.78, 1.5, 0.08, 3, 0.04), M.chrome);
  plate.position.set(0, 0.25, 0.3); g.add(plate);
  for (let i = 0; i < 9; i++) {
    const r = new THREE.Mesh(new THREE.BoxGeometry(0.66, 0.035, 0.04), M.blackPlastic);
    r.position.set(0, -0.24 + i * 0.08, 0.35); g.add(r);
  }
  // blade head
  const head = new THREE.Mesh(new RoundedBoxGeometry(1.08, 0.3, 0.42, 2, 0.05), M.steel);
  head.position.set(0, 1.46, 0.02); g.add(head);
  const teeth = new THREE.InstancedMesh(new THREE.BoxGeometry(0.035, 0.16, 0.05), M.steel, 22);
  const m4 = new THREE.Matrix4();
  for (let i = 0; i < 22; i++) { m4.makeTranslation(-0.5 + i * (1.0 / 21), 1.66, 0.12); teeth.setMatrixAt(i, m4); }
  g.add(teeth);
  // taper lever
  const lever = new THREE.Mesh(new RoundedBoxGeometry(0.12, 0.5, 0.12, 2, 0.04), M.chrome);
  lever.position.set(0.56, 0.95, 0.05); lever.rotation.z = -0.25; g.add(lever);
  // the one red thing: power switch
  const sw = new THREE.Mesh(new RoundedBoxGeometry(0.26, 0.4, 0.1, 2, 0.04), M.red);
  sw.position.set(0, -0.82, 0.32); g.add(sw);
  // cord
  const curve = new THREE.CatmullRomCurve3([
    new THREE.Vector3(0, -1.35, 0), new THREE.Vector3(0.05, -1.9, -0.05), new THREE.Vector3(0.5, -2.4, -0.1),
    new THREE.Vector3(1.3, -2.55, -0.1), new THREE.Vector3(1.9, -2.2, -0.1), new THREE.Vector3(2.6, -2.5, -0.1)
  ]);
  const cord = new THREE.Mesh(new THREE.TubeGeometry(curve, 80, 0.06, 12), M.blackPlastic);
  g.add(cord);
  const strain = new THREE.Mesh(new THREE.CylinderGeometry(0.1, 0.07, 0.35, 20), M.blackPlastic);
  strain.position.set(0, -1.45, 0); g.add(strain);
  return castAll(g);
}

// --- scissors (makas) ----------------------------------------------------------------
export function makeScissors(M) {
  const g = new THREE.Group();
  const blade = (flip) => {
    const s = new THREE.Shape();
    s.moveTo(0, 0);
    s.lineTo(2.3, flip * 0.03);
    s.quadraticCurveTo(1.3, flip * 0.3, 0.2, flip * 0.34);
    s.lineTo(-0.3, flip * 0.18);
    s.lineTo(0, 0);
    const geo = new THREE.ExtrudeGeometry(s, { depth: 0.04, bevelEnabled: true, bevelSize: 0.01, bevelThickness: 0.01, bevelSegments: 1, curveSegments: 16 });
    return new THREE.Mesh(geo, M.steel);
  };
  const shank = (flip) => {
    const grp = new THREE.Group();
    const sh = new THREE.Mesh(new RoundedBoxGeometry(0.9, 0.16, 0.08, 2, 0.03), M.steel);
    sh.position.set(-0.62, flip * 0.24, 0.02); sh.rotation.z = flip * 0.32; grp.add(sh);
    const ring = new THREE.Mesh(new THREE.TorusGeometry(0.26, 0.09, 20, 48), M.steel);
    ring.position.set(-1.3, flip * 0.5, 0.02); ring.scale.set(1.25, 1, 1); grp.add(ring);
    if (flip < 0) {
      const tang = new THREE.Mesh(new THREE.CylinderGeometry(0.035, 0.02, 0.45, 12), M.steel);
      tang.position.set(-1.42, -0.7, 0.02); tang.rotation.z = 0.5; grp.add(tang);
    }
    return grp;
  };
  const a = new THREE.Group(); a.add(blade(1)); a.add(shank(1)); a.rotation.z = 0.13; g.add(a);
  const b = new THREE.Group(); b.add(blade(-1)); b.add(shank(-1)); b.rotation.z = -0.13; b.position.z = 0.07; g.add(b);
  const screw = new THREE.Mesh(new THREE.CylinderGeometry(0.07, 0.07, 0.2, 24), M.chrome);
  screw.rotation.x = Math.PI / 2; screw.position.z = 0.05; g.add(screw);
  return castAll(g);
}

// --- comb (tarak) --------------------------------------------------------------------
export function makeComb(M, teeth = 30) {
  const s = new THREE.Shape();
  const L = 3.0, spine = 0.26, tooth = 0.42;
  s.moveTo(0, 0);
  s.lineTo(L, 0);
  s.lineTo(L, -spine);
  const step = L / teeth;
  for (let i = teeth - 1; i >= 0; i--) {
    const x = i * step;
    const len = i < teeth * 0.45 ? tooth * 1.05 : tooth * 0.9;
    s.lineTo(x + step * 0.78, -spine);
    s.lineTo(x + step * 0.7, -spine - len);
    s.lineTo(x + step * 0.3, -spine - len);
    s.lineTo(x + step * 0.22, -spine);
  }
  s.lineTo(0, -spine);
  s.lineTo(0, 0);
  const geo = new THREE.ExtrudeGeometry(s, { depth: 0.07, bevelEnabled: true, bevelSize: 0.012, bevelThickness: 0.012, bevelSegments: 1 });
  geo.translate(-L / 2, 0.3, -0.035);
  return castAll(new THREE.Mesh(geo, M.blackPlastic));
}

// --- lemon cologne bottle (kolonya) ----------------------------------------------------
export function makeKolonya(M) {
  const g = new THREE.Group();
  const prof = [
    [0, 0], [0.62, 0], [0.7, 0.06], [0.72, 0.2], [0.72, 1.7], [0.68, 1.9], [0.5, 2.12], [0.26, 2.3], [0.2, 2.36], [0.2, 2.62], [0, 2.62]
  ].map(([x, y]) => new THREE.Vector2(x, y));
  const glass = new THREE.Mesh(new THREE.LatheGeometry(prof, 64),
    new THREE.MeshStandardMaterial({ color: 0xffffff, transparent: true, opacity: 0.2, roughness: 0.03, metalness: 0, envMapIntensity: 2.4, depthWrite: false }));
  const liq = [
    [0, 0.05], [0.64, 0.05], [0.66, 0.2], [0.66, 1.55], [0, 1.55]
  ].map(([x, y]) => new THREE.Vector2(x, y));
  const liquid = new THREE.Mesh(new THREE.LatheGeometry(liq, 64),
    new THREE.MeshStandardMaterial({ color: 0xead04a, transparent: true, opacity: 0.86, roughness: 0.1, metalness: 0, emissive: 0x4a3a00, emissiveIntensity: 0.25 }));
  g.add(liquid); g.add(glass);
  // paper label band, plain
  const label = new THREE.Mesh(new THREE.CylinderGeometry(0.728, 0.728, 0.7, 64, 1, true),
    new THREE.MeshStandardMaterial({ color: 0x4e1820, roughness: 0.7, side: THREE.DoubleSide }));
  label.position.y = 0.85; g.add(label);
  const stripe = new THREE.Mesh(new THREE.CylinderGeometry(0.732, 0.732, 0.06, 64, 1, true),
    new THREE.MeshStandardMaterial({ color: 0xead04a, roughness: 0.5, side: THREE.DoubleSide }));
  stripe.position.y = 1.08; g.add(stripe);
  const cap = new THREE.Mesh(new RoundedBoxGeometry(0.5, 0.5, 0.5, 3, 0.08), M.chrome);
  cap.scale.set(1, 1, 1); cap.position.y = 2.82;
  const capC = new THREE.Mesh(new THREE.CylinderGeometry(0.27, 0.27, 0.5, 40), M.chrome);
  capC.position.y = 2.82; g.add(capC);
  castAll(g); glass.castShadow = true;
  return g;
}

// --- rolled hot towel ----------------------------------------------------------------
export function makeTowel() {
  const g = new THREE.Group();
  const terry = terryTexture();
  terry.repeat.set(3, 1);
  const body = new THREE.Mesh(new THREE.CylinderGeometry(0.62, 0.62, 2.6, 64, 1, true),
    new THREE.MeshStandardMaterial({ map: terry, roughness: 0.95, side: THREE.DoubleSide }));
  body.rotation.z = Math.PI / 2;
  g.add(body);
  // spiral end caps
  const c = document.createElement('canvas'); c.width = c.height = 256;
  const x = c.getContext('2d');
  x.fillStyle = '#eef0ec'; x.fillRect(0, 0, 256, 256);
  x.strokeStyle = 'rgba(120,128,124,0.55)'; x.lineWidth = 3;
  x.beginPath();
  for (let a = 0; a < Math.PI * 2 * 5; a += 0.05) {
    const r = 8 + a * 3.7;
    const px = 128 + Math.cos(a) * r, py = 128 + Math.sin(a) * r;
    if (a === 0) x.moveTo(px, py); else x.lineTo(px, py);
  }
  x.stroke();
  const capTex = new THREE.CanvasTexture(c); capTex.colorSpace = THREE.SRGBColorSpace;
  for (const s of [-1, 1]) {
    const cap = new THREE.Mesh(new THREE.CircleGeometry(0.62, 64), new THREE.MeshStandardMaterial({ map: capTex, roughness: 0.95 }));
    cap.rotation.y = s * Math.PI / 2; cap.position.x = s * 1.3; g.add(cap);
  }
  return castAll(g);
}

// --- kids' plank across the chair arms, with a striped lollipop ------------------------
export function makePlank(M) {
  const g = new THREE.Group();
  for (const x of [-1.5, 1.5]) {
    const arm = new THREE.Mesh(new RoundedBoxGeometry(0.5, 0.36, 2.6, 4, 0.14), M.leather);
    arm.position.set(x, 0, 0); g.add(arm);
    const trim = new THREE.Mesh(new RoundedBoxGeometry(0.54, 0.08, 2.64, 2, 0.03), M.chrome);
    trim.position.set(x, -0.2, 0); g.add(trim);
    for (const z of [-0.9, 0.9]) {
      const post = new THREE.Mesh(new THREE.CylinderGeometry(0.07, 0.07, 1.0, 20), M.chrome);
      post.position.set(x, -0.7, z); g.add(post);
    }
  }
  const wood = new THREE.MeshStandardMaterial({ map: woodTexture(), roughness: 0.62 });
  const plank = new THREE.Mesh(new RoundedBoxGeometry(3.9, 0.14, 1.0, 2, 0.04), wood);
  plank.position.set(0, 0.25, 0.1); g.add(plank);
  // lollipop: the pole's stripes on a candy
  const ltex = stripeTexture(3); ltex.repeat.set(1, 1);
  const candy = new THREE.Mesh(new THREE.SphereGeometry(0.26, 40, 24), new THREE.MeshStandardMaterial({ map: ltex, roughness: 0.25 }));
  candy.position.set(0.55, 0.58, 0.22); candy.rotation.set(0.6, 0.2, 0.9); g.add(candy);
  const stick = new THREE.Mesh(new THREE.CylinderGeometry(0.03, 0.03, 1.0, 12), M.white);
  stick.rotation.z = Math.PI / 2 - 0.25; stick.rotation.y = 0.35;
  stick.position.set(-0.05, 0.4, 0.05); g.add(stick);
  return castAll(g);
}

// --- shared stage: hard key light, shadow catcher ---------------------------------------
export function hardLight(scene, { dir = [-4, 7, 5], intensity = 3.2, size = 6, map = 2048 } = {}) {
  const key = new THREE.DirectionalLight(0xffffff, intensity);
  key.position.set(...dir);
  key.castShadow = true;
  key.shadow.mapSize.set(map, map);
  const c = key.shadow.camera;
  c.left = -size; c.right = size; c.top = size; c.bottom = -size; c.near = 0.5; c.far = 40;
  key.shadow.bias = -0.0004;
  key.shadow.normalBias = 0.02;
  key.shadow.radius = 1;
  scene.add(key);
  scene.add(key.target);
  const fill = new THREE.HemisphereLight(0xffffff, 0x404040, 0.35);
  scene.add(fill);
  return key;
}

export function shadowCatcher(w = 30, h = 30, opacity = 0.3, color = 0x1a0a08) {
  const m = new THREE.Mesh(new THREE.PlaneGeometry(w, h), new THREE.ShadowMaterial({ opacity, color }));
  m.receiveShadow = true;
  return m;
}
