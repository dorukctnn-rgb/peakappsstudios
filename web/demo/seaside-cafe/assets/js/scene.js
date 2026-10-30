// Kuşluk demo: the bay and the objects on the table, one three.js scene.
// The page owns the clock (rAF) and the sun value; this module builds the
// scene, places each object under its DOM slot, regrades everything from one
// sun value, and renders. The camera never moves: depth in the walk comes from
// the sea and the ridges sliding at their own rates while the table and the
// objects follow the DOM rail 1:1.
import * as THREE from 'three';
import { Sky } from 'three/addons/objects/Sky.js';
import { Water } from 'three/addons/objects/Water.js';
import { DAY, clamp, smooth, sunAngles } from './sun.js';

const NEAR = 1; // layer for table + objects (kept out of the water's mirror pass)
const DEG = Math.PI / 180;
const lerp = (a, b, t) => a + (b - a) * t;
const VIEW_AZ = 252; // the camera looks W-SW across the bay toward Beydağları
const SEA = -44;     // the sea is 44 m below the terrace

function sunVector(elev, az, out) {
  const d = (az - VIEW_AZ) * DEG; // + is to the right of the view
  const e = elev * DEG;
  return out.set(Math.sin(d) * Math.cos(e), Math.sin(e), -Math.cos(d) * Math.cos(e));
}

// Keyframed look of the world, keyed by minute of day.
const K = [
  { m: 420, turb: 2.2, ray: 2.2, mie: 0.004, g: 0.82, exp: 0.34, tint: '#f2f4ff', sat: 0.55, water: '#1a6f9a', ridge: '#7b8db0', mid: '#687c9a', near: '#52667d', haze: '#c3d3e6', glow: '#ffc9a8', glowAmt: 0.3, sunCol: '#ffd4a6', sunI: 5.2, hemiSky: '#b8d2ee', hemiGround: '#c9b9a2', hemiI: 1.6, lamp: 0 },
  { m: 600, turb: 2.0, ray: 2.0, mie: 0.0035, g: 0.8, exp: 0.3, tint: '#eef3ff', sat: 0.6, water: '#167fae', ridge: '#7f94b4', mid: '#6a829f', near: '#53697f', haze: '#cddcec', glow: '#ffffff', glowAmt: 0.0, sunCol: '#fff0da', sunI: 6.0, hemiSky: '#c2daf2', hemiGround: '#cfc0a8', hemiI: 1.7, lamp: 0 },
  { m: 780, turb: 1.9, ray: 1.8, mie: 0.003, g: 0.78, exp: 0.27, tint: '#ecf3ff', sat: 0.65, water: '#1196c8', ridge: '#8aa1bf', mid: '#71889f', near: '#5a7085', haze: '#d4e3f0', glow: '#ffffff', glowAmt: 0.0, sunCol: '#fff8ec', sunI: 6.5, hemiSky: '#c9e0f5', hemiGround: '#d2c4ad', hemiI: 1.8, lamp: 0 },
  { m: 990, turb: 2.6, ray: 2.0, mie: 0.004, g: 0.82, exp: 0.3, tint: '#f6f4fb', sat: 0.45, water: '#1479a6', ridge: '#7d8aad', mid: '#657395', near: '#4e5c76', haze: '#d9d8d6', glow: '#ffd6b4', glowAmt: 0.12, sunCol: '#ffe6c4', sunI: 6.0, hemiSky: '#c6d6ea', hemiGround: '#cdb898', hemiI: 1.6, lamp: 0 },
  { m: 1095, turb: 4.0, ray: 2.6, mie: 0.005, g: 0.88, exp: 0.36, tint: '#fff2ea', sat: 0.25, water: '#2a6080', ridge: '#655f86', mid: '#544e72', near: '#3f3b5c', haze: '#d8b2a4', glow: '#f0a890', glowAmt: 0.45, sunCol: '#ffb879', sunI: 5.0, hemiSky: '#c4b7c8', hemiGround: '#c49a76', hemiI: 1.25, lamp: 0 },
  { m: 1150, turb: 5.5, ray: 3.0, mie: 0.006, g: 0.92, exp: 0.48, tint: '#fff0e6', sat: 0.2, water: '#2f4366', ridge: '#433b62', mid: '#352f52', near: '#272541', haze: '#cf8c7a', glow: '#e88e7a', glowAmt: 0.6, sunCol: '#ff9152', sunI: 3.2, hemiSky: '#a68aa6', hemiGround: '#9c6e58', hemiI: 0.9, lamp: 0.2 },
  { m: 1185, turb: 6.5, ray: 3.2, mie: 0.006, g: 0.93, exp: 0.8, tint: '#f4ecf6', sat: 0.15, water: '#1a2540', ridge: '#2e2a48', mid: '#24223b', near: '#1b1a2f', haze: '#9c6a80', glow: '#b86a80', glowAmt: 0.3, sunCol: '#ff7a4a', sunI: 0.6, hemiSky: '#5f6494', hemiGround: '#353446', hemiI: 0.6, lamp: 0.9 },
  { m: 1230, turb: 6.5, ray: 3.2, mie: 0.006, g: 0.93, exp: 0.95, tint: '#e6ecff', sat: 0.2, water: '#101a2c', ridge: '#1f1f36', mid: '#19192d', near: '#121223', haze: '#3a4068', glow: '#6a5a8a', glowAmt: 0.1, sunCol: '#ff7a4a', sunI: 0.0, hemiSky: '#3c4a7c', hemiGround: '#2a2c3c', hemiI: 0.5, lamp: 1 },
];
const _ca = new THREE.Color(), _cb = new THREE.Color();
function look(m) {
  let i = 0;
  while (i < K.length - 2 && m > K[i + 1].m) i++;
  const A = K[i], B = K[i + 1];
  const t = smooth(0, 1, clamp((m - A.m) / (B.m - A.m), 0, 1));
  const out = {};
  for (const k in A) {
    if (k === 'm') continue;
    if (typeof A[k] === 'number') out[k] = lerp(A[k], B[k], t);
    else out[k] = _ca.set(A[k]).lerp(_cb.set(B[k]), t).getHex();
  }
  return out;
}

// ------------------------------------------------------------ small helpers
function rng(seed) { let s = seed >>> 0; return () => ((s = (s * 1664525 + 1013904223) >>> 0) / 4294967296); }
function noise1(seed) {
  const r = rng(seed); const v = Array.from({ length: 512 }, r);
  return (x) => { const i = Math.floor(x), f = x - i, a = v[((i % 512) + 512) % 512], b = v[(((i + 1) % 512) + 512) % 512]; const u = f * f * (3 - 2 * f); return a + (b - a) * u; };
}
function fbm(n, x, oct = 5) { let s = 0, a = 0.5, f = 1, w = 0; for (let i = 0; i < oct; i++) { s += a * n(x * f); w += a; a *= 0.5; f *= 2.03; } return s / w; }

function roundedBox(w, h, d, r, seg = 3) {
  const g = new THREE.BoxGeometry(w, h, d, seg * 2, seg * 2, seg * 2);
  const p = g.attributes.position, v = new THREE.Vector3(), c = new THREE.Vector3();
  const hx = w / 2 - r, hy = h / 2 - r, hz = d / 2 - r;
  for (let i = 0; i < p.count; i++) {
    v.fromBufferAttribute(p, i);
    c.set(clamp(v.x, -hx, hx), clamp(v.y, -hy, hy), clamp(v.z, -hz, hz));
    v.sub(c).normalize().multiplyScalar(r).add(c);
    p.setXYZ(i, v.x, v.y, v.z);
  }
  g.computeVertexNormals();
  return g;
}

// A vessel from its outer profile (bottom centre to rim): walls `t`, base `tb`.
function vessel(outer, t, tb, seg = 64) {
  const pts = outer.map(([x, y]) => new THREE.Vector2(x, y));
  const rim = outer[outer.length - 1];
  const inner = [];
  for (let i = outer.length - 1; i >= 1; i--) {
    const [x, y] = outer[i];
    if (y < tb) continue;
    inner.push(new THREE.Vector2(Math.max(x - t, 0.0005), Math.min(y, rim[1] - 0.0001)));
  }
  inner.push(new THREE.Vector2(Math.max(innerR(outer, tb) - t, 0.0005), tb));
  inner.push(new THREE.Vector2(0, tb));
  const all = [new THREE.Vector2(0, 0), ...pts.slice(outer[0][0] === 0 ? 1 : 0), new THREE.Vector2(rim[0] - t * 0.5, rim[1] + t * 0.15), ...inner];
  return new THREE.LatheGeometry(all, seg);
}
function innerR(outer, y) {
  for (let i = 1; i < outer.length; i++) {
    const [x0, y0] = outer[i - 1], [x1, y1] = outer[i];
    if (y >= y0 && y <= y1) return x0 + (x1 - x0) * ((y - y0) / Math.max(y1 - y0, 1e-6));
  }
  return outer[outer.length - 1][0];
}
// The liquid inside a vessel: inner wall up to `fill`, flat top.
function liquid(outer, t, tb, fill, seg = 48) {
  const pts = [new THREE.Vector2(0, tb + 0.0004)];
  const steps = 18;
  for (let i = 0; i <= steps; i++) {
    const y = tb + 0.0004 + (fill - tb - 0.0004) * (i / steps);
    pts.push(new THREE.Vector2(Math.max(innerR(outer, y) - t - 0.0004, 0.0003), y));
  }
  pts.push(new THREE.Vector2(0, fill));
  return new THREE.LatheGeometry(pts, seg);
}
function lathe(points, seg = 64) { return new THREE.LatheGeometry(points.map(([x, y]) => new THREE.Vector2(x, y)), seg); }

function canvasTex(w, h, draw, srgb = true) {
  const c = document.createElement('canvas'); c.width = w; c.height = h;
  draw(c.getContext('2d'), w, h);
  const tx = new THREE.CanvasTexture(c);
  if (srgb) tx.colorSpace = THREE.SRGBColorSpace;
  return tx;
}

// ------------------------------------------------------------------ textures
function stoneTexture() {
  return canvasTex(1024, 512, (g, w, h) => {
    const base = g.createLinearGradient(0, 0, w, h);
    base.addColorStop(0, '#dcceb7'); base.addColorStop(0.5, '#d5c6ae'); base.addColorStop(1, '#dccfb9');
    g.fillStyle = base; g.fillRect(0, 0, w, h);
    const r = rng(7);
    for (let i = 0; i < 3200; i++) { // fine grain
      const x = r() * w, y = r() * h, s = r() * 2.2 + 0.4;
      g.fillStyle = `rgba(${r() < 0.5 ? '118,104,86' : '252,248,240'},${0.06 + r() * 0.14})`;
      g.fillRect(x, y, s, s * (0.6 + r()));
    }
    for (let i = 0; i < 110; i++) { // travertine pores, stretched along the bedding
      const x = r() * w, y = r() * h, rw = 3 + r() * 18, rh = 1 + r() * 3;
      g.fillStyle = `rgba(132,116,94,${0.22 + r() * 0.25})`;
      g.beginPath(); g.ellipse(x, y, rw, rh, 0, 0, Math.PI * 2); g.fill();
    }
    g.globalAlpha = 0.22; g.strokeStyle = '#a28f74';
    for (let i = 0; i < 10; i++) { // bedding veins
      g.lineWidth = 0.6 + r() * 1.6; g.beginPath();
      let y = r() * h; g.moveTo(0, y);
      for (let x = 0; x <= w; x += 24) { y += (r() - 0.5) * 5; g.lineTo(x, y); }
      g.stroke();
    }
    g.globalAlpha = 1;
  });
}
function citrusTexture(peel, flesh) {
  return canvasTex(256, 256, (g, w, h) => {
    g.fillStyle = peel; g.beginPath(); g.arc(w / 2, h / 2, w / 2, 0, Math.PI * 2); g.fill();
    g.fillStyle = '#fbf3df'; g.beginPath(); g.arc(w / 2, h / 2, w / 2 - 10, 0, Math.PI * 2); g.fill();
    for (let i = 0; i < 10; i++) {
      const a0 = (i / 10) * Math.PI * 2 + 0.04, a1 = ((i + 1) / 10) * Math.PI * 2 - 0.04;
      g.fillStyle = flesh; g.beginPath(); g.moveTo(w / 2 + Math.cos((a0 + a1) / 2) * 8, h / 2 + Math.sin((a0 + a1) / 2) * 8);
      g.arc(w / 2, h / 2, w / 2 - 16, a0, a1); g.closePath(); g.fill();
    }
    g.fillStyle = '#fbf3df'; g.beginPath(); g.arc(w / 2, h / 2, 8, 0, Math.PI * 2); g.fill();
  });
}
function bumpTexture(seed, n, smin, smax) {
  return canvasTex(256, 256, (g, w, h) => {
    g.fillStyle = '#808080'; g.fillRect(0, 0, w, h);
    const r = rng(seed);
    for (let i = 0; i < n; i++) {
      const x = r() * w, y = r() * h, s = smin + r() * (smax - smin);
      g.fillStyle = `rgba(40,40,40,${0.25 + r() * 0.3})`; g.beginPath(); g.arc(x, y, s, 0, Math.PI * 2); g.fill();
    }
  }, false);
}
function radialTexture(stops) {
  return canvasTex(128, 128, (g, w, h) => {
    const grd = g.createRadialGradient(w / 2, h / 2, 0, w / 2, h / 2, w / 2);
    stops.forEach(([o, c]) => grd.addColorStop(o, c));
    g.fillStyle = grd; g.fillRect(0, 0, w, h);
  }, false);
}
function woodTexture() {
  return canvasTex(256, 64, (g, w, h) => {
    g.fillStyle = '#a7774a'; g.fillRect(0, 0, w, h);
    const r = rng(3);
    for (let i = 0; i < 40; i++) { g.strokeStyle = `rgba(${r() < 0.5 ? '90,56,30' : '200,160,110'},${0.15 + r() * 0.2})`; g.lineWidth = 1 + r() * 2; g.beginPath(); const y = r() * h; g.moveTo(0, y); g.bezierCurveTo(w * 0.3, y + (r() - 0.5) * 8, w * 0.6, y + (r() - 0.5) * 8, w, y + (r() - 0.5) * 6); g.stroke(); }
  });
}

// ------------------------------------------------------------------ the scene
export function createScene(canvas, opts) {
  const low = !!opts.lowPower;
  const capture = !!opts.capture;
  const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, alpha: false, powerPreference: 'high-performance', preserveDrawingBuffer: capture });
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = low ? THREE.PCFShadowMap : THREE.PCFSoftShadowMap;
  renderer.shadowMap.autoUpdate = false;
  if ('transmissionResolutionScale' in renderer) renderer.transmissionResolutionScale = low ? 0.5 : 1;

  const scene = new THREE.Scene();
  const camera = new THREE.PerspectiveCamera(30, 1, 0.02, 160000);
  const CAM_H = 0.13, EDGE = 0.62; // eye 13 cm above the stone, 62 cm back from its front edge
  camera.position.set(0, CAM_H, EDGE);
  camera.layers.enable(NEAR);

  // --- sky (stock Preetham sky + a grade: tint and saturation away from the horizon)
  function gradeSky(sk) {
    const u = sk.material.uniforms;
    u.skyTint = { value: new THREE.Color(1, 1, 1) };
    u.skySat = { value: 0.4 };
    sk.material.fragmentShader = 'uniform vec3 skyTint; uniform float skySat;' + sk.material.fragmentShader.replace(
      'gl_FragColor = vec4( retColor, 1.0 );',
      'vec3 cg = retColor * skyTint; float el = clamp( direction.y * 5.0, 0.0, 1.0 ); float lum = dot( cg, vec3( 0.2126, 0.7152, 0.0722 ) ); cg = mix( vec3( lum ), cg, 1.0 + skySat * el ); gl_FragColor = vec4( max( cg, 0.0 ), 1.0 );');
    sk.material.needsUpdate = true;
  }
  const sky = new Sky();
  gradeSky(sky);
  sky.scale.setScalar(120000);
  sky.renderOrder = -4;
  scene.add(sky);

  // --- ridges across the bay (Beydağları), three layers of haze
  const ridgeMat = (hazeAmt) => new THREE.ShaderMaterial({
    uniforms: { base: { value: new THREE.Color() }, haze: { value: new THREE.Color() }, glow: { value: new THREE.Color() }, glowAmt: { value: 0 }, hazeAmt: { value: hazeAmt }, lit: { value: 0 } },
    vertexShader: 'attribute float aH; attribute float aS; varying float vH; varying float vS; void main(){ vH=aH; vS=aS; gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.0); }',
    fragmentShader: `uniform vec3 base; uniform vec3 haze; uniform vec3 glow; uniform float glowAmt; uniform float hazeAmt; uniform float lit; varying float vH; varying float vS;
      void main(){
        float lowH = 1.0 - smoothstep(0.0, 0.8, vH);
        vec3 c = base * (1.0 + lit * vS * 0.1);
        c = mix(c, haze, clamp(hazeAmt * (0.45 + 0.75 * lowH), 0.0, 1.0));
        c += glow * glowAmt * smoothstep(0.6, 1.0, vH) * 0.45;
        gl_FragColor = vec4(c, 1.0);
        #include <tonemapping_fragment>
        #include <colorspace_fragment>
      }`,
    depthTest: false, depthWrite: false,
  });
  function ridge(seed, a0, a1, Rfn, Hfn, cols, hazeAmt, order) {
    const n = noise1(seed);
    const pos = [], aH = [], aS = [], idx = [];
    const Hs = [];
    for (let i = 0; i <= cols; i++) Hs.push(Hfn(a0 + (a1 - a0) * (i / cols), n));
    for (let i = 0; i <= cols; i++) {
      const a = a0 + (a1 - a0) * (i / cols);
      const R = Rfn(a), H = Hs[i];
      const x = Math.sin(a) * R, z = -Math.cos(a) * R;
      const slope = clamp((Hs[Math.min(i + 4, cols)] - Hs[Math.max(i - 4, 0)]) / 400, -1, 1);
      pos.push(x, H + SEA, z, x, SEA - 900, z);
      aH.push(1, 0); aS.push(slope, slope * 0.3);
      if (i < cols) { const k = i * 2; idx.push(k, k + 1, k + 2, k + 1, k + 3, k + 2); }
    }
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
    g.setAttribute('aH', new THREE.Float32BufferAttribute(aH, 1));
    g.setAttribute('aS', new THREE.Float32BufferAttribute(aS, 1));
    g.setIndex(idx);
    const m = new THREE.Mesh(g, ridgeMat(hazeAmt));
    m.frustumCulled = false; m.renderOrder = order;
    return m;
  }
  const farRidge = ridge(3, -0.85, 1.25, (a) => 33000 + 3000 * Math.sin(a * 1.7),
    (a, n) => {
      const env = smooth(-0.85, -0.38, a) * (1 - 0.2 * smooth(0.7, 1.2, a));
      const peak = 1 + 0.5 * Math.exp(-Math.pow((a + 0.1) / 0.14, 2)); // a Tahtalı-like summit left of the sunset
      return env * peak * (950 + 950 * fbm(n, a * 8 + 3, 6));
    }, 1100, 0.62, -3);
  const midRidge = ridge(5, -0.2, 1.3, (a) => 25000 + 2500 * Math.sin(a * 2.1),
    (a, n) => smooth(-0.2, 0.1, a) * (550 + 700 * fbm(n, a * 11 + 7, 5)), 900, 0.45, -2);
  const nearRidge = ridge(9, 0.3, 1.3, (a) => 16500 + 1800 * Math.sin(a * 2.3),
    (a, n) => smooth(0.3, 0.5, a) * (220 + 420 * fbm(n, a * 14, 5)), 700, 0.28, -1);
  const ridges = [farRidge, midRidge, nearRidge];
  const ridgeGroup = new THREE.Group();
  ridgeGroup.add(...ridges);
  scene.add(ridgeGroup);

  // --- the sea
  let needs = true;
  const waterNormals = new THREE.TextureLoader().load(opts.waterNormals, (t) => { t.wrapS = t.wrapT = THREE.RepeatWrapping; needs = true; });
  waterNormals.wrapS = waterNormals.wrapT = THREE.RepeatWrapping;
  const rt = low ? 192 : 512;
  const water = new Water(new THREE.PlaneGeometry(160000, 160000), {
    textureWidth: rt, textureHeight: rt, waterNormals,
    sunDirection: new THREE.Vector3(), sunColor: 0xffffff, waterColor: 0x0b5670,
    distortionScale: 5.5, fog: false,
  });
  // More body colour than the stock shader (which is nearly a mirror at the
  // grazing angles a cliff-top view sees), so the bay reads as Mediterranean.
  water.material.fragmentShader = water.material.fragmentShader
    .replace('float rf0 = 0.3;', 'float rf0 = 0.02;')
    .replace('vec3 scatter = max( 0.0, dot( surfaceNormal, eyeDirection ) ) * waterColor;', 'vec3 scatter = ( 0.5 + 0.5 * max( 0.0, dot( surfaceNormal, eyeDirection ) ) ) * waterColor;')
    .replace('float reflectance = rf0 + ( 1.0 - rf0 ) * pow( ( 1.0 - theta ), 5.0 );', 'float reflectance = ( rf0 + ( 1.0 - rf0 ) * pow( ( 1.0 - theta ), 5.0 ) ) * 0.36;');
  water.material.needsUpdate = true;
  water.rotation.x = -Math.PI / 2;
  water.position.y = SEA;
  water.material.uniforms.size.value = 2.2;
  // The mirror pass must run once per frame, not again inside the
  // transmission pass that re-renders opaque objects.
  const mirrorPass = water.onBeforeRender;
  let mirrorFrame = -1, frameNo = 0;
  water.onBeforeRender = function (...a) {
    if (mirrorFrame === frameNo) return;
    mirrorFrame = frameNo;
    mirrorPass.apply(this, a);
  };
  scene.add(water);

  // --- lights
  const sun = new THREE.DirectionalLight(0xffffff, 3);
  sun.castShadow = true;
  sun.shadow.mapSize.set(low ? 1024 : 2048, low ? 1024 : 2048);
  sun.shadow.bias = -0.0004;
  sun.shadow.normalBias = 0.003;
  const sc = sun.shadow.camera;
  sc.near = 0.5; sc.far = 14; sc.left = -1.2; sc.right = 1.2; sc.top = 1.2; sc.bottom = -1.2;
  sc.layers.enable(NEAR);
  sun.target.position.set(0, 0, -0.5);
  scene.add(sun, sun.target);
  const hemi = new THREE.HemisphereLight(0xffffff, 0xb0a596, 1);
  scene.add(hemi);
  const lamps = new THREE.PointLight(0xffd0a0, 0, 2.4, 1.8);
  lamps.position.set(0.1, 0.48, -0.35);
  lamps.layers.enable(NEAR);
  scene.add(lamps);

  // --- environment for reflections, from a small sky + sea, refreshed as the sun moves
  const pmrem = new THREE.PMREMGenerator(renderer);
  const envScene = new THREE.Scene();
  const envSky = new Sky(); gradeSky(envSky); envSky.scale.setScalar(400); envScene.add(envSky);
  const envSea = new THREE.Mesh(new THREE.CircleGeometry(300, 32), new THREE.MeshBasicMaterial({ color: 0x1b4555 }));
  envSea.rotation.x = -Math.PI / 2; envSea.position.y = -10; envScene.add(envSea);
  const envStone = new THREE.Mesh(new THREE.CircleGeometry(8, 24), new THREE.MeshBasicMaterial({ color: 0x8c8172 }));
  envStone.rotation.x = -Math.PI / 2; envStone.position.y = -0.4; envScene.add(envStone);
  let envRT = null, envAt = -1, envTime = 0;
  function refreshEnv(t, force) {
    const now = performance.now();
    if (!force && (Math.abs(t - envAt) < 0.008 || now - envTime < (low ? 650 : 180))) return;
    envAt = t; envTime = now;
    const old = envRT;
    envRT = pmrem.fromScene(envScene, 0.03, 0.1, 1000);
    scene.environment = envRT.texture;
    if (old) old.dispose();
  }

  // --- the table: a limestone top; its front face is the page's plinth
  const stone = stoneTexture();
  stone.wrapS = stone.wrapT = THREE.RepeatWrapping;
  stone.anisotropy = renderer.capabilities.getMaxAnisotropy();
  const TABLE_DEPTH = 0.56, TABLE_W = 30;
  stone.repeat.set(TABLE_W / 0.9, TABLE_DEPTH / 0.45);
  const table = new THREE.Mesh(new THREE.PlaneGeometry(TABLE_W, TABLE_DEPTH), new THREE.MeshStandardMaterial({ map: stone, roughness: 0.9, metalness: 0, color: 0xfff0dc, envMapIntensity: 0.12 }));
  table.rotation.x = -Math.PI / 2;
  table.position.set(0, 0, -TABLE_DEPTH / 2);
  table.receiveShadow = true;
  table.layers.set(NEAR);
  scene.add(table);
  const nose = new THREE.Mesh(new THREE.CylinderGeometry(0.014, 0.014, TABLE_W, 16, 1, false), new THREE.MeshStandardMaterial({ color: 0xcfc0a6, roughness: 0.85, envMapIntensity: 0.15 }));
  nose.rotation.z = Math.PI / 2; nose.position.set(0, -0.014, -TABLE_DEPTH);
  nose.receiveShadow = true; nose.layers.set(NEAR);
  scene.add(nose);

  // --- materials
  const glassMat = () => low
    ? new THREE.MeshPhysicalMaterial({ color: 0xffffff, metalness: 0, roughness: 0.03, transparent: true, opacity: 0.16, envMapIntensity: 1.8, specularIntensity: 1, ior: 1.5, depthWrite: false, side: THREE.DoubleSide })
    : new THREE.MeshPhysicalMaterial({ color: 0xffffff, metalness: 0, roughness: 0.0, transmission: 1, thickness: 0.0009, ior: 1.5, envMapIntensity: 1.6, specularIntensity: 1, side: THREE.DoubleSide });
  // Liquids are opaque on purpose: a transmissive glass only refracts opaque
  // objects, so a transmissive liquid inside it would vanish. The glow that
  // makes tea look lit from behind is emissive, driven by the sun.
  // Little diffuse, more emission: a liquid's colour is light that came through it.
  const liquidMat = (color, glow, rough = 0.1, extra = {}) => {
    const m = new THREE.MeshPhysicalMaterial(Object.assign({ color: new THREE.Color(color).multiplyScalar(0.6), roughness: rough, metalness: 0, clearcoat: low ? 0 : 1, clearcoatRoughness: 0.05, emissive: new THREE.Color(glow), emissiveIntensity: 0.12, envMapIntensity: 0.7 }, extra));
    m.userData.baseGlow = 0.12;
    return m;
  };
  const porcelain = (c = 0xf6f4f0) => new THREE.MeshPhysicalMaterial({ color: c, roughness: 0.3, metalness: 0, clearcoat: low ? 0 : 0.7, clearcoatRoughness: 0.12, envMapIntensity: 0.8 });
  const steel = new THREE.MeshStandardMaterial({ color: 0xe4e6e8, metalness: 1, roughness: 0.18, envMapIntensity: 1.25 });
  const copper = new THREE.MeshStandardMaterial({ color: 0xd08a62, metalness: 1, roughness: 0.28, envMapIntensity: 1.15 });
  const brass = new THREE.MeshStandardMaterial({ color: 0xc9a25a, metalness: 1, roughness: 0.32 });
  const gold = new THREE.MeshStandardMaterial({ color: 0xd9b25e, metalness: 1, roughness: 0.25 });
  const redBand = new THREE.MeshStandardMaterial({ color: 0xb3262e, roughness: 0.35 });
  const ice = new THREE.MeshPhysicalMaterial({ color: 0xdfeef3, roughness: 0.12, clearcoat: 1, metalness: 0, emissive: new THREE.Color(0x9fc4d0), emissiveIntensity: 0.06, envMapIntensity: 1.4 });
  const glowTex = radialTexture([[0, 'rgba(255,255,255,1)'], [0.35, 'rgba(255,255,255,0.45)'], [1, 'rgba(255,255,255,0)']]);
  const aoTex = radialTexture([[0, 'rgba(0,0,0,0.75)'], [0.45, 'rgba(0,0,0,0.38)'], [1, 'rgba(0,0,0,0)']]);

  const glows = []; // liquids that light up when the sun is behind them
  function mesh(geo, mat, cast = true) {
    const m = new THREE.Mesh(geo, mat);
    m.castShadow = cast; m.receiveShadow = true; m.layers.set(NEAR);
    return m;
  }
  function contact(g, x, z, rx, rz, a = 0.55) {
    const d = new THREE.Mesh(new THREE.PlaneGeometry(1, 1), new THREE.MeshBasicMaterial({ map: aoTex, transparent: true, opacity: a, depthWrite: false, color: 0x2a2018 }));
    d.rotation.x = -Math.PI / 2; d.position.set(x, 0.0006, z); d.scale.set(rx * 2, rz * 2, 1); d.renderOrder = 0;
    g.add(d);
  }
  function addGlow(group, matLiquid, color, height, strength = 1, ox = 0, oz = 0) {
    // Light that came through the liquid lands on the stone beside the shadow.
    const decal = new THREE.Mesh(new THREE.PlaneGeometry(1, 1), new THREE.MeshBasicMaterial({ map: glowTex, color, transparent: true, opacity: 0, blending: THREE.AdditiveBlending, depthWrite: false }));
    decal.rotation.x = -Math.PI / 2; decal.position.y = 0.0009;
    group.add(decal);
    glows.push({ group, mat: matLiquid, decal, height, strength, ox, oz });
  }

  // ------------------------------------------------------------------ objects
  const objects = {};
  function obj(id, dist, build, scale = 1) {
    const g = new THREE.Group();
    g.userData = { id, dist };
    build(g);
    g.scale.setScalar(scale);
    g.traverse((o) => { o.layers.set(NEAR); });
    g.visible = false;
    scene.add(g);
    objects[id] = g;
    return g;
  }
  function saucer(g, r = 0.058, deep = 0.0) {
    g.add(mesh(lathe([[0, 0.0045], [0.03, 0.0], [0.034, 0.0], [0.036, 0.004], [r * 0.86, 0.008 + deep], [r, 0.0138 + deep], [r + 0.0006, 0.0152 + deep], [r - 0.0012, 0.0152 + deep], [r * 0.84, 0.0098 + deep], [0.035, 0.0062], [0.02, 0.0056], [0, 0.0056]]), porcelain()));
  }

  // Çay: ince belli glass on a saucer with a red band, two sugar cubes.
  const TEA = [[0, 0], [0.0238, 0], [0.0254, 0.0025], [0.0246, 0.011], [0.0216, 0.028], [0.0196, 0.043], [0.021, 0.056], [0.0262, 0.075], [0.0292, 0.09], [0.0302, 0.098]];
  obj('cay', 0.8, (g) => {
    saucer(g);
    contact(g, 0, 0, 0.066, 0.05, 0.5);
    const band = mesh(new THREE.TorusGeometry(0.0585, 0.0009, 8, 96), redBand, false);
    band.rotation.x = Math.PI / 2; band.position.y = 0.0148; g.add(band);
    const glass = mesh(vessel(TEA, 0.0012, 0.006), glassMat());
    glass.position.y = 0.0056; glass.renderOrder = 2; g.add(glass);
    const teaM = liquidMat(0x9a3510, 0xb8400a, 0.08, { clearcoat: 0.5, envMapIntensity: 0.4 });
    const tea = mesh(liquid(TEA, 0.0012, 0.006, 0.086), teaM, false);
    tea.position.y = 0.0056; tea.renderOrder = 1; g.add(tea);
    addGlow(g, teaM, 0xff8a2a, 0.09, 1.3);
    const sugar = new THREE.MeshPhysicalMaterial({ color: 0xfbfaf6, roughness: 0.9, sheen: 0.5 });
    const c1 = mesh(roundedBox(0.0115, 0.0115, 0.0115, 0.0015), sugar); c1.position.set(0.041, 0.0118, 0.016); c1.rotation.y = 0.4; g.add(c1);
    const c2 = mesh(roundedBox(0.0115, 0.0115, 0.0115, 0.0015), sugar); c2.position.set(0.028, 0.0118, 0.033); c2.rotation.y = 1.1; g.add(c2);
    const spoon = mesh(new THREE.CylinderGeometry(0.0012, 0.0016, 0.085, 8), steel, true);
    spoon.position.set(-0.034, 0.016, 0.022); spoon.rotation.set(Math.PI / 2, 0, 0.9); g.add(spoon);
  });

  // Demlik: the double teapot.
  obj('demlik', 1.04, (g) => {
    contact(g, 0, 0, 0.09, 0.08, 0.55);
    g.add(mesh(lathe([[0, 0], [0.066, 0], [0.072, 0.006], [0.076, 0.03], [0.075, 0.08], [0.068, 0.105], [0.052, 0.118], [0.047, 0.122], [0.047, 0.128], [0.0, 0.128]], 72), steel));
    g.add(mesh(new THREE.TubeGeometry(new THREE.CatmullRomCurve3([new THREE.Vector3(0.06, 0.035, 0), new THREE.Vector3(0.095, 0.06, 0), new THREE.Vector3(0.112, 0.1, 0)]), 20, 0.0075, 12), steel));
    const pot = mesh(lathe([[0, 0], [0.036, 0], [0.044, 0.008], [0.054, 0.035], [0.052, 0.062], [0.042, 0.078], [0.036, 0.083], [0.036, 0.088], [0, 0.088]], 72), steel);
    pot.position.y = 0.128; g.add(pot);
    const lid = mesh(lathe([[0, 0.012], [0.008, 0.012], [0.009, 0.006], [0.036, 0.0], [0.0, 0.0]], 48), steel);
    lid.position.y = 0.216; g.add(lid);
    const knob = mesh(new THREE.SphereGeometry(0.008, 16, 12), new THREE.MeshStandardMaterial({ color: 0x1e1a18, roughness: 0.5 }));
    knob.position.y = 0.232; g.add(knob);
    g.add(mesh(new THREE.TubeGeometry(new THREE.CatmullRomCurve3([new THREE.Vector3(0.045, 0.155, 0.0), new THREE.Vector3(0.07, 0.17, 0.0), new THREE.Vector3(0.082, 0.198, 0.0)]), 16, 0.0055, 10), steel));
    const bake = new THREE.MeshStandardMaterial({ color: 0x24201d, roughness: 0.55 });
    const h1 = mesh(new THREE.TorusGeometry(0.04, 0.0045, 10, 40, Math.PI * 1.1), bake);
    h1.position.set(-0.07, 0.072, 0); h1.rotation.z = Math.PI * 0.45; g.add(h1);
    const h2 = mesh(new THREE.TorusGeometry(0.028, 0.0035, 10, 36, Math.PI * 1.1), bake);
    h2.position.set(-0.052, 0.178, 0); h2.rotation.z = Math.PI * 0.45; g.add(h2);
    g.rotation.y = -0.35;
  }, 0.72);

  // Simit: one flat on a plate, one leaning on it.
  function simitMesh() {
    const R = 0.054, r = 0.0165;
    const geo = new THREE.TorusGeometry(R, r, 28, 180);
    const p = geo.attributes.position, nrm = geo.attributes.normal, uv = geo.attributes.uv, col = [];
    const v = new THREE.Vector3(), nv = new THREE.Vector3();
    const cA = new THREE.Color(0xb86a2c), cB = new THREE.Color(0x6e3410), cTop = new THREE.Color(0xd08a45), tmp = new THREE.Color();
    for (let i = 0; i < p.count; i++) {
      v.fromBufferAttribute(p, i); nv.fromBufferAttribute(nrm, i);
      const phi = uv.getX(i) * Math.PI * 2, theta = uv.getY(i) * Math.PI * 2;
      const twist = Math.sin(theta * 2 + phi * 15);
      v.addScaledVector(nv, 0.0024 * twist);
      p.setXYZ(i, v.x, v.y, v.z);
      tmp.copy(cB).lerp(cA, 0.5 + 0.5 * twist).lerp(cTop, Math.max(0, Math.sin(theta)) * 0.35);
      col.push(tmp.r, tmp.g, tmp.b);
    }
    geo.setAttribute('color', new THREE.Float32BufferAttribute(col, 3));
    geo.computeVertexNormals();
    const grp = new THREE.Group();
    const ring = mesh(geo, new THREE.MeshPhysicalMaterial({ vertexColors: true, roughness: 0.5, clearcoat: low ? 0 : 0.35, clearcoatRoughness: 0.4, sheen: 0.3, sheenColor: new THREE.Color(0x8a4a1a) }));
    grp.add(ring);
    // sesame on the outer face (local +z is the top of the tube)
    const seed = new THREE.SphereGeometry(1, 6, 4); seed.scale(0.0016, 0.0008, 0.0006);
    const n = low ? 360 : 650;
    const ses = new THREE.InstancedMesh(seed, new THREE.MeshStandardMaterial({ color: 0xead6a4, roughness: 0.6 }), n);
    const rr = rng(21), m4 = new THREE.Matrix4(), q = new THREE.Quaternion(), pos = new THREE.Vector3(), one = new THREE.Vector3(1, 1, 1), nn = new THREE.Vector3();
    for (let i = 0; i < n; i++) {
      const phi = rr() * Math.PI * 2, th = Math.PI / 2 + (rr() - 0.5) * Math.PI * 1.15;
      nn.set(Math.cos(th) * Math.cos(phi), Math.cos(th) * Math.sin(phi), Math.sin(th));
      pos.set(Math.cos(phi) * R, Math.sin(phi) * R, 0).addScaledVector(nn, r + 0.0012);
      q.setFromUnitVectors(new THREE.Vector3(0, 0, 1), nn).multiply(new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 0, 1), rr() * Math.PI));
      m4.compose(pos, q, one); ses.setMatrixAt(i, m4);
    }
    ses.layers.set(NEAR);
    grp.add(ses);
    return grp;
  }
  obj('simit', 0.86, (g) => {
    g.add(mesh(lathe([[0, 0.003], [0.06, 0], [0.074, 0.004], [0.094, 0.012], [0.095, 0.0135], [0.092, 0.0135], [0.072, 0.0065], [0, 0.0065]], 72), porcelain(0xf3f0ea)));
    contact(g, 0, 0, 0.1, 0.075, 0.45);
    const flat = simitMesh(); flat.rotation.x = -Math.PI / 2; flat.position.set(0.004, 0.0065 + 0.0165, 0.006); g.add(flat);
    const lean = simitMesh(); lean.rotation.set(-0.42, 0.25, 0); lean.position.set(-0.004, 0.072, -0.03); g.add(lean);
  });

  // Serpme kahvaltı: turunç reçeli jar, honey with a dipper, a bowl of olives, white cheese.
  obj('kahvalti', 0.94, (g) => {
    contact(g, 0, -0.01, 0.13, 0.09, 0.4);
    const JAR = [[0, 0], [0.032, 0], [0.034, 0.004], [0.035, 0.06], [0.031, 0.068], [0.03, 0.074]];
    const jar = new THREE.Group(); jar.position.set(-0.06, 0, -0.025); g.add(jar);
    const jg = mesh(vessel(JAR, 0.0015, 0.004), glassMat()); jg.renderOrder = 2; jar.add(jg);
    const jamM = liquidMat(0xc2470c, 0xff6a1a, 0.15);
    jar.add(mesh(liquid(JAR, 0.0015, 0.004, 0.058), jamM, false));
    addGlow(g, jamM, 0xff7a24, 0.06, 0.7, -0.06, -0.025);
    const lidM = new THREE.MeshStandardMaterial({ color: 0xb8322a, metalness: 0.4, roughness: 0.35 });
    const lid = mesh(lathe([[0, 0.012], [0.03, 0.012], [0.0315, 0.01], [0.0315, 0.0], [0.0, 0.0]], 48), lidM);
    lid.position.set(0.045, 0, 0.03); lid.rotation.set(0, 0, 0); jar.add(lid);
    // honey in a small glass bowl, dipper standing in it
    const HB = [[0, 0], [0.024, 0], [0.026, 0.003], [0.034, 0.026], [0.0355, 0.034]];
    const hb = new THREE.Group(); hb.position.set(0.045, 0, -0.04); g.add(hb);
    const hbg = mesh(vessel(HB, 0.0016, 0.004), glassMat()); hbg.renderOrder = 2; hb.add(hbg);
    const honeyM = liquidMat(0xd1800f, 0xffa020, 0.05);
    hb.add(mesh(liquid(HB, 0.0016, 0.004, 0.026), honeyM, false));
    addGlow(g, honeyM, 0xffb030, 0.03, 0.6, 0.045, -0.04);
    const woodM = new THREE.MeshStandardMaterial({ map: woodTexture(), roughness: 0.6 });
    const dipper = mesh(lathe([[0, 0], [0.008, 0.001], [0.0095, 0.004], [0.0075, 0.007], [0.0095, 0.01], [0.0075, 0.013], [0.0095, 0.016], [0.004, 0.02], [0.0028, 0.03], [0.0028, 0.105], [0.0032, 0.11], [0, 0.112]], 24), woodM);
    dipper.position.set(0.004, 0.006, 0); dipper.rotation.z = -0.28; hb.add(dipper);
    // olives heaped in a small porcelain bowl
    const ob = new THREE.Group(); ob.position.set(-0.005, 0, 0.045); g.add(ob);
    ob.add(mesh(lathe([[0, 0], [0.018, 0], [0.02, 0.003], [0.03, 0.017], [0.0335, 0.024], [0.034, 0.025], [0.0325, 0.025], [0.028, 0.017], [0.017, 0.0045], [0, 0.004]], 56), porcelain(0xeef2f3)));
    const rim = mesh(new THREE.TorusGeometry(0.0337, 0.0008, 6, 64), new THREE.MeshStandardMaterial({ color: 0x1d5b8c, roughness: 0.35 }), false);
    rim.rotation.x = Math.PI / 2; rim.position.y = 0.0248; ob.add(rim);
    const ol = new THREE.SphereGeometry(1, 16, 10); ol.scale(0.0088, 0.0064, 0.0064);
    const olM = new THREE.MeshPhysicalMaterial({ color: 0x2c1b25, roughness: 0.2, clearcoat: low ? 0 : 0.9 });
    const rr = rng(4);
    for (let k = 0; k < 13; k++) {
      const o = mesh(ol, olM); const a = rr() * Math.PI * 2, d = (k < 7 ? 0.016 : 0.007) * rr() + (k < 7 ? 0.006 : 0);
      o.position.set(Math.cos(a) * d, k < 7 ? 0.016 + rr() * 0.004 : 0.026 + rr() * 0.006, Math.sin(a) * d); o.rotation.set(rr(), rr() * 3, rr()); ob.add(o);
    }
    // a slab of white cheese
    const ch = mesh(roundedBox(0.05, 0.022, 0.034, 0.0025), new THREE.MeshPhysicalMaterial({ color: 0xf7f3e8, roughness: 0.75, sheen: 0.3 }));
    ch.position.set(0.075, 0.011, 0.035); ch.rotation.y = -0.4; g.add(ch);
  });

  // Limonata: a litre carafe and a glass.
  const CARAFE = [[0, 0], [0.04, 0], [0.046, 0.004], [0.056, 0.03], [0.059, 0.07], [0.054, 0.12], [0.038, 0.16], [0.031, 0.19], [0.032, 0.215], [0.038, 0.232]];
  const TUMBLER = [[0, 0], [0.028, 0], [0.0295, 0.004], [0.0315, 0.05], [0.0335, 0.105]];
  obj('limonata', 1.0, (g) => {
    contact(g, 0.03, 0, 0.11, 0.07, 0.45);
    const lemM = liquidMat(0xe6cf5e, 0xffe066, 0.35, { clearcoat: 0, sheen: 0.4, sheenColor: new THREE.Color(0xfff2b0) });
    const car = mesh(vessel(CARAFE, 0.0018, 0.007), glassMat()); car.renderOrder = 2; g.add(car);
    g.add(mesh(liquid(CARAFE, 0.0018, 0.007, 0.15), lemM, false));
    addGlow(g, lemM, 0xffe066, 0.15, 0.8);
    const sm = new THREE.MeshStandardMaterial({ map: citrusTexture('#e2c21c', '#f4e27a'), roughness: 0.4 });
    const sideM = new THREE.MeshStandardMaterial({ color: 0xdcbc1a, roughness: 0.45 });
    [[0.035, 0.12, 0.02, 1.35], [-0.03, 0.095, 0.03, 1.2], [0.02, 0.06, 0.04, 1.5]].forEach(([x, y, z, a]) => {
      const s = mesh(new THREE.CylinderGeometry(0.021, 0.021, 0.004, 32), [sideM, sm, sm], false);
      s.position.set(x, y, z); s.rotation.set(a, 0.3, 0.2); g.add(s);
    });
    const gl2 = new THREE.Group(); gl2.position.set(0.1, 0, 0.045); g.add(gl2);
    const tm = mesh(vessel(TUMBLER, 0.0016, 0.006), glassMat()); tm.renderOrder = 2; gl2.add(tm);
    gl2.add(mesh(liquid(TUMBLER, 0.0016, 0.006, 0.075), lemM, false));
    const iceG = roundedBox(0.018, 0.016, 0.018, 0.003);
    [[0.004, 0.071, 0.003], [-0.008, 0.073, -0.006]].forEach(([x, y, z], i) => { const c = mesh(iceG, ice, false); c.position.set(x, y, z); c.rotation.set(i, i * 0.6, 0.2); gl2.add(c); });
    g.rotation.y = -0.2;
  });

  // Türk kahvesi: cup, saucer, water, lokum, copper cezve.
  obj('kahve', 0.9, (g) => {
    saucer(g, 0.06, 0.002);
    contact(g, -0.02, -0.02, 0.12, 0.08, 0.45);
    const gb = mesh(new THREE.TorusGeometry(0.0603, 0.0008, 6, 96), gold, false); gb.rotation.x = Math.PI / 2; gb.position.y = 0.0168; g.add(gb);
    const CUP = [[0, 0.0], [0.016, 0], [0.0172, 0.004], [0.016, 0.0055], [0.02, 0.012], [0.026, 0.03], [0.0298, 0.05], [0.031, 0.056]];
    const cup = mesh(vessel(CUP, 0.0018, 0.006), porcelain(0xf7f6f2)); cup.position.y = 0.0056; g.add(cup);
    const cupRim = mesh(new THREE.TorusGeometry(0.0305, 0.0007, 6, 72), gold, false); cupRim.rotation.x = Math.PI / 2; cupRim.position.y = 0.0056 + 0.0562; g.add(cupRim);
    const band = mesh(new THREE.CylinderGeometry(0.0287, 0.0264, 0.009, 72, 1, true), new THREE.MeshStandardMaterial({ color: 0x1f4f7a, roughness: 0.3, side: THREE.DoubleSide }), false);
    band.position.y = 0.0056 + 0.04; band.scale.setScalar(1.04); g.add(band);
    const foam = mesh(new THREE.CircleGeometry(0.0282, 48), new THREE.MeshStandardMaterial({ color: 0x8a5a32, roughness: 0.8 }), false);
    foam.rotation.x = -Math.PI / 2; foam.position.y = 0.0056 + 0.051; g.add(foam);
    const handle = mesh(new THREE.TorusGeometry(0.011, 0.0026, 10, 24, Math.PI * 1.25), porcelain(0xf7f6f2));
    handle.position.set(0.032, 0.0056 + 0.034, 0); handle.rotation.z = -Math.PI * 0.62; g.add(handle);
    const lok = new THREE.MeshPhysicalMaterial({ color: 0xf2d2d3, roughness: 0.95, sheen: 1, sheenColor: new THREE.Color(0xffffff) });
    const l1 = mesh(roundedBox(0.016, 0.014, 0.016, 0.003), lok); l1.position.set(-0.04, 0.0145, 0.022); l1.rotation.y = 0.5; g.add(l1);
    const l2 = mesh(roundedBox(0.016, 0.014, 0.016, 0.003), lok); l2.position.set(-0.026, 0.0145, 0.04); l2.rotation.y = 1.2; g.add(l2);
    const WATER = [[0, 0], [0.025, 0], [0.026, 0.004], [0.0275, 0.08], [0.028, 0.088]];
    const wg = new THREE.Group(); wg.position.set(0.1, 0, -0.03); g.add(wg);
    const w1 = mesh(vessel(WATER, 0.0014, 0.005), glassMat()); w1.renderOrder = 2; wg.add(w1);
    wg.add(mesh(liquid(WATER, 0.0014, 0.005, 0.07), new THREE.MeshPhysicalMaterial({ color: 0xcfe3ea, roughness: 0.05, clearcoat: 1, envMapIntensity: 1.2, transparent: low, opacity: low ? 0.5 : 1 }), false));
    const cz = new THREE.Group(); cz.position.set(-0.095, 0, -0.08); cz.rotation.y = 0.9; g.add(cz);
    cz.add(mesh(lathe([[0, 0], [0.03, 0], [0.034, 0.006], [0.036, 0.03], [0.03, 0.06], [0.027, 0.07], [0.032, 0.08], [0.031, 0.081], [0.025, 0.071], [0.0, 0.071]], 56), copper));
    const hd = mesh(new THREE.CylinderGeometry(0.0035, 0.0045, 0.13, 12), brass);
    hd.position.set(-0.085, 0.085, 0); hd.rotation.z = Math.PI * 0.36; cz.add(hd);
  });

  // Turunç tonik: highball, liquid graded orange, ice, a slice; a whole turunç.
  const HIGHBALL = [[0, 0], [0.03, 0], [0.0315, 0.006], [0.032, 0.12], [0.0322, 0.128]];
  obj('tonik', 0.94, (g) => {
    contact(g, -0.02, 0, 0.1, 0.06, 0.45);
    const gl = mesh(vessel(HIGHBALL, 0.0016, 0.01), glassMat()); gl.renderOrder = 2; g.add(gl);
    const lgeo = liquid(HIGHBALL, 0.0016, 0.01, 0.105);
    const lp = lgeo.attributes.position, cols = [];
    const cLow = new THREE.Color(0xb8380c), cHigh = new THREE.Color(0xf0b84e), tc = new THREE.Color();
    for (let i = 0; i < lp.count; i++) { tc.copy(cLow).lerp(cHigh, smooth(0.02, 0.1, lp.getY(i))); cols.push(tc.r, tc.g, tc.b); }
    lgeo.setAttribute('color', new THREE.Float32BufferAttribute(cols, 3));
    const tM = liquidMat(0xffffff, 0xe8641c, 0.12, { vertexColors: true });
    g.add(mesh(lgeo, tM, false));
    addGlow(g, tM, 0xff7a2a, 0.11, 1.0);
    const iceG = roundedBox(0.022, 0.02, 0.022, 0.003);
    [[0.004, 0.097, 0.002], [-0.007, 0.099, -0.006]].forEach(([x, y, z], i) => { const c = mesh(iceG, ice, false); c.position.set(x, y, z); c.rotation.set(i * 0.7, i, 0.3); g.add(c); });
    const wm = new THREE.MeshStandardMaterial({ map: citrusTexture('#e2661a', '#f08a2c'), roughness: 0.45 });
    const wheel = mesh(new THREE.CylinderGeometry(0.026, 0.026, 0.005, 40), [new THREE.MeshStandardMaterial({ color: 0xe46a14, roughness: 0.5 }), wm, wm], false);
    wheel.position.set(0.026, 0.13, 0.0); wheel.rotation.set(Math.PI / 2, 0, 0.15); g.add(wheel);
    const fruit = mesh(new THREE.SphereGeometry(0.033, 48, 32), new THREE.MeshPhysicalMaterial({ color: 0xe9761c, roughness: 0.42, bumpMap: bumpTexture(5, 1800, 1, 2.5), bumpScale: 0.6, clearcoat: low ? 0 : 0.3, sheen: 0.2 }));
    fruit.scale.y = 0.9; fruit.position.set(-0.075, 0.0297, 0.035); g.add(fruit);
    const leaf = mesh(new THREE.SphereGeometry(1, 16, 8), new THREE.MeshPhysicalMaterial({ color: 0x2f5a24, roughness: 0.35, clearcoat: 0.6 }));
    leaf.scale.set(0.024, 0.0016, 0.0095); leaf.position.set(-0.062, 0.06, 0.03); leaf.rotation.set(0.2, 0.6, -0.3); g.add(leaf);
  });

  // Rakı: tall glass, louche, ice, a water glass, cheese and melon.
  const TALL = [[0, 0], [0.023, 0], [0.024, 0.008], [0.0245, 0.14], [0.0248, 0.148]];
  obj('raki', 0.95, (g) => {
    contact(g, 0, 0.01, 0.13, 0.08, 0.45);
    const gl = mesh(vessel(TALL, 0.0014, 0.012), glassMat()); gl.renderOrder = 2; g.add(gl);
    const rM = liquidMat(0xeef0ec, 0xfff2e0, 0.45, { clearcoat: 0.6, sheen: 0.6, sheenColor: new THREE.Color(0xd8e6ee) });
    g.add(mesh(liquid(TALL, 0.0014, 0.012, 0.11), rM, false));
    addGlow(g, rM, 0xfff0d8, 0.12, 0.7);
    const iceG = roundedBox(0.019, 0.018, 0.019, 0.003);
    [[0.002, 0.108, 0.002], [-0.003, 0.112, -0.003]].forEach(([x, y, z], i) => { const c = mesh(iceG, ice, false); c.position.set(x, y, z); c.rotation.set(i, i * 0.4, 0.4); g.add(c); });
    const wg = new THREE.Group(); wg.position.set(0.062, 0, -0.035); g.add(wg);
    const w1 = mesh(vessel(TALL, 0.0014, 0.012), glassMat()); w1.renderOrder = 2; wg.add(w1);
    wg.add(mesh(liquid(TALL, 0.0014, 0.012, 0.12), new THREE.MeshPhysicalMaterial({ color: 0xcfe3ea, roughness: 0.05, clearcoat: 1, envMapIntensity: 1.2, transparent: low, opacity: low ? 0.5 : 1 }), false));
    const pg = new THREE.Group(); pg.position.set(-0.11, 0, 0.045); g.add(pg);
    pg.add(mesh(lathe([[0, 0.003], [0.04, 0], [0.05, 0.004], [0.072, 0.011], [0.0725, 0.0125], [0.07, 0.0125], [0.048, 0.006], [0, 0.006]], 64), porcelain()));
    const cheese = mesh(roundedBox(0.04, 0.018, 0.028, 0.002), new THREE.MeshPhysicalMaterial({ color: 0xf8f5ec, roughness: 0.7, sheen: 0.3 }));
    cheese.position.set(-0.02, 0.015, 0.008); cheese.rotation.y = 0.3; pg.add(cheese);
    const sh = new THREE.Shape(); sh.absarc(0, 0, 0.045, 0.15, Math.PI - 0.15, false); sh.absarc(0, 0.012, 0.028, Math.PI - 0.35, 0.35, true);
    const mg = new THREE.ExtrudeGeometry(sh, { depth: 0.016, bevelEnabled: true, bevelSize: 0.0015, bevelThickness: 0.0015, bevelSegments: 2, curveSegments: 24 });
    const mp = mg.attributes.position, mc = [], flesh = new THREE.Color(0xeae4a2), rind = new THREE.Color(0x5d7a2e), cc = new THREE.Color();
    for (let i = 0; i < mp.count; i++) { const rr2 = Math.hypot(mp.getX(i), mp.getY(i)); cc.copy(flesh).lerp(rind, smooth(0.041, 0.046, rr2)); mc.push(cc.r, cc.g, cc.b); }
    mg.setAttribute('color', new THREE.Float32BufferAttribute(mc, 3));
    const melon = mesh(mg, new THREE.MeshPhysicalMaterial({ vertexColors: true, roughness: 0.4, clearcoat: low ? 0 : 0.4 }));
    melon.rotation.set(0, 0.5, 0); melon.position.set(0.02, 0.0075, 0.0); melon.scale.setScalar(0.9); pg.add(melon);
  });

  // ------------------------------------------------------------ per frame
  const sunDir = new THREE.Vector3();
  const tmpV = new THREE.Vector3(), tmpV2 = new THREE.Vector3();
  let W = 1, H = 1, curT = -1, lampsOn = 0;
  const ndcRow = {};

  // Solve vertical FOV and pitch so the stone's front edge lands on the
  // canvas bottom (the plinth's top) and the horizon at `horFrac`.
  function solveCamera(horFrac) {
    const A = 1 - 2 * horFrac;        // ndc y of the horizon
    const B = 0.985;                   // -ndc y of the table edge
    const tanA = CAM_H / EDGE;
    const a = A * B * tanA, b = A + B, c = -tanA;
    let T = Math.abs(a) < 1e-6 ? -c / b : (-b + Math.sqrt(b * b - 4 * a * c)) / (2 * a);
    T = clamp(T, 0.05, 1.2);
    camera.fov = 2 * Math.atan(T) / DEG;
    camera.rotation.set(-Math.atan(A * T), 0, 0);
    camera.updateProjectionMatrix();
    camera.updateMatrixWorld();
  }

  function setSize(w, h, dpr, horFrac) {
    W = w; H = h;
    renderer.setPixelRatio(dpr);
    renderer.setSize(w, h, false);
    camera.aspect = w / h;
    solveCamera(horFrac);
    for (const k in lastPx) delete lastPx[k];
    for (const id in objects) {
      tmpV.set(0, 0, EDGE - objects[id].userData.dist).project(camera);
      ndcRow[id] = tmpV.y;
    }
    needs = true;
  }

  // Screen x (canvas px) of an object's slot centre -> world x on its row.
  function worldXAt(px, id) {
    const ndcX = (px / W) * 2 - 1;
    tmpV.set(ndcX, ndcRow[id], 0.5).unproject(camera).sub(camera.position).normalize();
    const tHit = (0 - camera.position.y) / tmpV.y;
    return camera.position.x + tmpV.x * tHit;
  }

  function setSun(t, busy) {
    if (Math.abs(t - curT) < 1e-5) return;
    curT = t;
    const s = sunAngles(t);
    const L = look(s.m);
    sunVector(s.elev, s.az, sunDir);
    for (const U of [sky.material.uniforms, envSky.material.uniforms]) {
      U.turbidity.value = L.turb; U.rayleigh.value = L.ray; U.mieCoefficient.value = L.mie; U.mieDirectionalG.value = L.g;
      U.sunPosition.value.copy(sunDir);
      U.skyTint.value.set(L.tint); U.skySat.value = L.sat;
    }
    renderer.toneMappingExposure = L.exp;
    const wu = water.material.uniforms;
    wu.sunDirection.value.copy(sunDir).normalize();
    wu.sunColor.value.set(L.sunCol).multiplyScalar(smooth(-3, 2, s.elev));
    const gain = 0.66 / L.exp; // keep authored colours readable through tone mapping
    wu.waterColor.value.set(L.water).multiplyScalar(gain * 1.5);
    envSea.material.color.set(L.water).multiplyScalar(0.8);
    const cols = [L.ridge, L.mid, L.near];
    ridges.forEach((r, i) => {
      const u = r.material.uniforms;
      u.base.value.set(cols[i]).multiplyScalar(gain); u.haze.value.set(L.haze).multiplyScalar(gain); u.glow.value.set(L.glow).multiplyScalar(gain); u.glowAmt.value = L.glowAmt * (1 - i * 0.3);
      u.lit.value = s.elev > 0 ? clamp(sunDir.x * -1.5, -1, 1) * smooth(0, 12, s.elev) : 0;
    });
    // The sun light fades as it sinks into the ridge (~4 degrees) and below.
    const vis = smooth(-1, 5, s.elev);
    sun.color.set(L.sunCol);
    sun.intensity = L.sunI * vis;
    sun.position.copy(sun.target.position).addScaledVector(sunDir.y > 0.03 ? sunDir : tmpV2.copy(sunDir).setY(0.03).normalize(), 6);
    hemi.color.set(L.hemiSky); hemi.groundColor.set(L.hemiGround); hemi.intensity = L.hemiI;
    // String lights come on at 19.15.
    lampsOn = smooth(DAY.lamps - 5, DAY.lamps + 5, s.m);
    lamps.intensity = lampsOn * 0.08 * L.lamp;
    // Backlit liquids glow; their light lands on the stone beside the shadow.
    const back = clamp(-sunDir.z, 0, 1) * smooth(-1, 3, s.elev) * (1 - smooth(10, 40, s.elev));
    const shadowLen = 1 / Math.max(Math.tan(Math.max(s.elev, 4) * DEG), 0.05);
    const dayLight = smooth(-4, 10, s.elev);
    tmpV.set(-sunDir.x, 0, -sunDir.z).normalize();
    for (const G of glows) {
      G.mat.emissiveIntensity = (G.mat.userData.baseGlow || 0.05) * (0.6 + 0.4 * dayLight) + back * 0.6 * G.strength + lampsOn * 0.16;
      const len = clamp(G.height * shadowLen, 0.03, 0.4);
      G.decal.position.set(G.ox + tmpV.x * len * 0.5, 0.0009, G.oz + tmpV.z * len * 0.5);
      G.decal.scale.set(0.04 + len * 0.18, 0.05 + len * 0.55, 1);
      G.decal.rotation.z = Math.atan2(tmpV.x, -tmpV.z);
      G.decal.material.opacity = clamp(back * 0.85, 0, 0.75) * G.strength;
    }
    if (!(busy && low)) refreshEnv(t, false); // phones refresh reflections when the drag ends
    renderer.shadowMap.needsUpdate = true;
    needs = true;
  }

  // railPx: how far the DOM rail has travelled (px). slots: {id: screenX|null}
  const lastPx = {};
  function place(railPx, slots) {
    const wpp = 0.62 / H * 2 * Math.tan(camera.fov * DEG / 2); // world m per px at the table edge
    water.position.x = -railPx * 0.12;
    ridgeGroup.position.x = -railPx * 1.4;
    stone.offset.x = (railPx * wpp / TABLE_W) * stone.repeat.x;
    let moved = false;
    for (const id in objects) {
      const o = objects[id], x = slots[id];
      const vis = x != null;
      if (o.visible !== vis) { o.visible = vis; moved = true; }
      if (vis && lastPx[id] !== x) {
        lastPx[id] = x;
        o.position.set(worldXAt(x, id), 0, EDGE - o.userData.dist);
        moved = true;
      }
    }
    if (moved) { renderer.shadowMap.needsUpdate = true; needs = true; }
    if (railPx !== place.last) { place.last = railPx; needs = true; }
  }

  let waterTime = 0;
  function render(dt, animate) {
    if (animate) { waterTime += dt; water.material.uniforms.time.value = waterTime * 0.5; needs = true; }
    if (!needs) return false;
    frameNo++;
    if (!scene.environment) refreshEnv(curT, true);
    renderer.render(scene, camera);
    needs = false;
    return true;
  }

  // Compile every material up front so the first sight of an object along the
  // walk does not stall a frame on shader compilation.
  function precompile() {
    const vis = {};
    for (const id in objects) { vis[id] = objects[id].visible; objects[id].visible = true; }
    const done = () => { for (const id in objects) objects[id].visible = vis[id]; };
    if (renderer.compileAsync) return renderer.compileAsync(scene, camera).then(done, done);
    renderer.compile(scene, camera); done(); return Promise.resolve();
  }

  return {
    setSize, setSun, place, render, renderer, precompile,
    flushEnv: () => refreshEnv(curT, true),
    get lampsOn() { return lampsOn; },
    invalidate() { needs = true; for (const k in lastPx) delete lastPx[k]; },
    dispose() { renderer.dispose(); pmrem.dispose(); },
  };
}
