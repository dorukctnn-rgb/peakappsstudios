/* Tutam demo: the live head.
   One fixed WebGL canvas for the whole page. The page writes a story state
   (months since the procedure, camera, head turn, marker progress) and this
   module paints it. Rendering is on demand: when nothing moves, nothing draws. */
import * as THREE from 'three';
import { HAIR_CENTER, HAIR_RADII } from './headgen.js';

const GLSL_ZONES = /* glsl */`
  const vec3 HC = vec3(${HAIR_CENTER.join(',')});
  float sstep(float a, float b, float x) { float t = clamp((x - a) / (b - a), 0.0, 1.0); return t * t * (3.0 - 2.0 * t); }
  float tbl11(float x) {
    float A[11] = float[11](0.00, 0.40, 0.62, 0.95, 1.16, 1.30, 1.44, 1.78, 2.06, 2.45, 3.1416);
    float T[11] = float[11](0.98, 0.94, 0.99, 1.30, 1.80, 1.74, 1.52, 1.54, 1.86, 2.04, 2.16);
    float r = T[10];
    for (int i = 1; i < 11; i++) { if (x <= A[i]) { r = mix(T[i - 1], T[i], (x - A[i - 1]) / (A[i] - A[i - 1])); break; } }
    return r;
  }
  float tbl6(float x) {
    float A[6] = float[6](0.00, 0.82, 0.88, 1.06, 1.32, 3.1416);
    float T[6] = float[6](9.00, 9.00, 1.95, 1.48, 1.22, 1.24);
    float r = T[5];
    for (int i = 1; i < 6; i++) { if (x <= A[i]) { r = mix(T[i - 1], T[i], (x - A[i - 1]) / (A[i] - A[i - 1])); break; } }
    return r;
  }
  float irregular(float az) { return 0.016 * sin(az * 7.0 + 1.3) + 0.008 * sin(az * 19.0 + 0.4) + 0.004 * sin(az * 47.0 + 2.1); }
  float capTheta(float az) { return tbl11(abs(az)) + irregular(az); }
  float natTheta(float az) { return tbl6(abs(az)) + irregular(az * 1.7) * 1.5; }
  vec3 tonemap(vec3 c) { c *= 1.05; return clamp((c * (2.51 * c + 0.03)) / (c * (2.43 * c + 0.59) + 0.14), 0.0, 1.0); }
  vec3 toSRGB(vec3 c) { return mix(c * 12.92, 1.055 * pow(c, vec3(1.0 / 2.4)) - 0.055, step(0.0031308, c)); }
`;

const LIGHT_UNIFORMS = () => ({
  uKeyDir: { value: new THREE.Vector3(0.35, 1.0, 0.18).normalize() },
  uKeyCol: { value: new THREE.Color(1.0, 0.95, 0.9).multiplyScalar(1.9) },
  uFillDir: { value: new THREE.Vector3(0, 0, 1) },
  uFillCol: { value: new THREE.Color(0.45, 0.58, 0.56) },
  uRimDir: { value: new THREE.Vector3(0, 0, -1) },
  uRimCol: { value: new THREE.Color(0.85, 0.95, 1.0).multiplyScalar(1.4) },
  uSky: { value: new THREE.Color(0.10, 0.14, 0.13) },
  uGround: { value: new THREE.Color(0.025, 0.04, 0.035) },
  uCamPos: { value: new THREE.Vector3() },
  uT: { value: -1 },
});

/* ------------------------------------------------------------- head -- */
const headVert = /* glsl */`
  attribute float aAO;
  varying vec3 vObj; varying vec3 vN; varying vec3 vW; varying float vAO;
  void main() {
    vObj = position;
    vec4 w = modelMatrix * vec4(position, 1.0);
    vW = w.xyz;
    vN = normalize(mat3(modelMatrix) * normal);
    vAO = aAO;
    gl_Position = projectionMatrix * viewMatrix * w;
  }`;
const headFrag = /* glsl */`
  uniform vec3 uKeyDir, uKeyCol, uFillDir, uFillCol, uRimDir, uRimCol, uSky, uGround, uCamPos;
  uniform float uT;
  uniform vec3 uSkin, uHairDark, uStone, uStoneVein;
  varying vec3 vObj; varying vec3 vN; varying vec3 vW; varying float vAO;
  ${GLSL_ZONES}
  float hash(vec3 p) { p = fract(p * 0.3183099 + 0.1); p *= 17.0; return fract(p.x * p.y * p.z * (p.x + p.y + p.z)); }
  float vnoise(vec3 x) {
    vec3 i = floor(x), f = fract(x); f = f * f * (3.0 - 2.0 * f);
    return mix(mix(mix(hash(i), hash(i + vec3(1,0,0)), f.x), mix(hash(i + vec3(0,1,0)), hash(i + vec3(1,1,0)), f.x), f.y),
               mix(mix(hash(i + vec3(0,0,1)), hash(i + vec3(1,0,1)), f.x), mix(hash(i + vec3(0,1,1)), hash(i + vec3(1,1,1)), f.x), f.y), f.z);
  }
  void main() {
    vec3 N = normalize(vN);
    vec3 V = normalize(uCamPos - vW);
    vec3 d = normalize(vObj - HC);
    float th = acos(clamp(d.y, -1.0, 1.0));
    float az = atan(d.x, d.z);
    float ear = step(0.66, abs(vObj.x)) * step(vObj.y, 0.1) * step(-0.52, vObj.y) * step(-0.36, vObj.z) * step(vObj.z, 0.2);
    float cap = sstep(capTheta(az) + 0.035, capTheta(az) - 0.05, th) * (1.0 - ear);
    float nat = sstep(natTheta(az) - 0.05, natTheta(az) + 0.07, th);
    float T = uT;
    // native horseshoe: full, clipped on the day, back within weeks
    float tShave = -0.58 + (1.0 - abs(az) / 3.14159) * 0.12;
    float shaved = sstep(tShave, tShave + 0.03, T);
    float covN = mix(0.9, 0.16, shaved);
    covN = mix(covN, 0.9, sstep(-0.42, 1.9, T));
    // graft area: thinning before, clipped, bare through the shedding months, then filling in
    float edge = max(natTheta(az) - th, 0.0);
    float covB = (0.05 + 0.34 * exp(-edge / 0.14)) * 0.85;
    float covG = mix(covB, 0.02, sstep(-0.52, -0.48, T));
    covG = mix(covG, 0.95, pow(sstep(2.6, 11.4, T), 0.85));
    float cover = cap * mix(covG, covN, nat);
    // the crown whorl never reads as a bald spot once the hair is in
    float whorl = sstep(0.93, 0.995, dot(d, normalize(vec3(0.14, 0.60, -0.79))));
    cover = max(cover, whorl * cap * sstep(4.0, 11.0, T) * 0.98);
    float grain = vnoise(vObj * 70.0) * 0.6 + vnoise(vObj * 190.0) * 0.4;
    vec3 skin = uSkin * (0.94 + 0.08 * vnoise(vObj * 9.0));
    // fresh graft sites read slightly pink for a few days
    float pink = cap * (1.0 - nat) * sstep(-0.25, -0.05, T) * (1.0 - sstep(0.15, 0.55, T));
    skin = mix(skin, skin * vec3(1.06, 0.80, 0.78), pink * 0.5);
    vec3 albedo = mix(skin, uHairDark * (0.75 + 0.5 * grain), clamp(cover * (0.94 + 0.25 * (grain - 0.5)), 0.0, 1.0));
    // the socle: a dark green stone
    float stone = step(vObj.y, -1.405);
    float vein = sstep(0.82, 0.98, sin(vObj.x * 7.0 + vObj.z * 4.0 + vnoise(vObj * 3.0) * 6.0) * 0.5 + 0.5);
    albedo = mix(albedo, mix(uStone, uStoneVein, vein * 0.6) * (0.85 + 0.3 * vnoise(vObj * 6.0)), stone);
    float skinMask = (1.0 - stone) * (1.0 - cover);

    vec3 L = normalize(uKeyDir);
    float ndl = dot(N, L);
    float wrap = mix(0.18, 0.42, skinMask);
    float diff = max((ndl + wrap) / (1.0 + wrap), 0.0);
    vec3 sss = vec3(0.5, 0.17, 0.1) * sstep(-0.4, 0.2, ndl) * (1.0 - sstep(0.2, 0.85, ndl)) * 0.2 * skinMask;
    float fill = max(dot(N, normalize(uFillDir)), 0.0);
    vec3 hemi = mix(uGround, uSky, N.y * 0.5 + 0.5);
    float fres = pow(1.0 - max(dot(N, V), 0.0), 3.0);
    float rim = fres * sstep(-0.3, 0.6, dot(N, normalize(uRimDir)));
    vec3 H = normalize(L + V);
    float shin = mix(14.0, 18.0, stone);
    float spec = pow(max(dot(N, H), 0.0), shin) * mix(0.075, 0.06, stone) * (1.0 - cover * 0.9) * step(0.0, ndl);
    float ao = mix(1.0, vAO, 0.85);
    vec3 col = albedo * (uKeyCol * diff * mix(0.55, 1.0, ao) + uFillCol * fill * 0.32 * ao + hemi * ao * 2.2)
             + albedo * sss + uRimCol * rim * mix(0.55, 0.22, cover) * ao + uKeyCol * spec * ao;
    gl_FragColor = vec4(toSRGB(tonemap(col)), 1.0);
  }`;

/* ---------------------------------------------------------- strands -- */
const SEG = 6;
const strandVert = /* glsl */`
  attribute float aS; attribute float aSide;
  attribute vec3 iRoot; attribute vec3 iNorm; attribute vec3 iFlow;
  attribute vec4 iA; attribute vec4 iB;
  uniform float uT, uPx, uWidthPx;
  uniform vec3 uKeyDir, uKeyCol, uRimDir, uRimCol, uSky, uGround, uCamPos, uFillDir, uFillCol;
  uniform vec3 uHair, uHairYoung, uScab;
  varying vec3 vCol; varying float vSide;
  ${GLSL_ZONES}
  const vec3 HR = vec3(${HAIR_RADII.join(',')});
  vec3 strandAt(float s, float L, vec3 u0, vec3 fq, vec3 b, float R0, float a0, float lam, float wav) {
    float Lq = L / 0.9;
    float stepL = Lq / float(${SEG});
    float r = -0.004, arc = 0.0;
    float target = s * float(${SEG});
    for (int i = 0; i < ${SEG}; i++) {
      float fi = float(i);
      if (fi >= target) break;
      float part = min(1.0, target - fi);
      float l = (fi + 0.5 * part) * stepL;
      float al = a0 + (1.5708 - a0 - 0.08) * (1.0 - exp(-l / lam));
      r += cos(al) * stepL * part; arc += sin(al) * stepL * part;
    }
    float R = R0 + r;
    float ang = arc / R;
    vec3 q = (u0 * cos(ang) + fq * sin(ang)) * R + b * sin(arc * 38.0 + wav) * 0.012 * sstep(0.04, 0.16, L);
    return HC + q * HR;
  }
  void main() {
    float kind = floor(iA.x + 0.001), flatW = fract(iA.x + 0.001) * 2.0, sa = iA.y, sb = iA.z, T = uT;
    float L = 0.0, W = 1.0, red = 0.0, young = 0.0;
    if (kind < 1.5) {
      float tShave = iA.w;
      float Lb = iB.z;
      float shaved = sstep(tShave, tShave + 0.025, T);
      L = mix(Lb, min(Lb, 0.008 + 0.105 * max(T + 0.42, 0.0)), shaved);
      if (kind > 0.5) {
        float takenAt = -0.47 + sa * 0.08;
        if (T > takenAt) { L = 0.011 * (1.0 - sstep(0.25, 0.6, T)); W = 2.4; red = 1.0 - sstep(0.1, 0.45, T); }
      }
    } else {
      float tAppear = iA.w, tStart = iB.x, tShed = iB.y, Ls = iB.z, Lb = iB.w;
      L = mix(Lb, 0.0, sstep(-0.52, -0.49, T));
      W = 0.42; young = 0.55;
      if (T >= tAppear && T < tShed) {
        bool lead = kind > 2.5;
        float k = 1.0 - sstep(tShed - 0.1, tShed, T);
        L = lead ? 0.011 * k * sstep(tAppear, tAppear + 0.008, T) : 0.0;
        W = 2.2;
        red = 1.0 - sstep(0.06, 0.42, T);
        young = 0.0;
      }
      if (T > tStart) {
        float age = T - tStart;
        L = min(Ls, 0.004 + 0.1 * age);
        W = mix(0.36, 1.0, sstep(0.0, 5.5, age));
        young = 1.0 - sstep(0.3, 4.5, age);
        red = 0.0;
      }
    }
    if (L < 0.0015) { gl_Position = vec4(2.0, 2.0, 2.0, 1.0); vCol = vec3(0.0); vSide = 0.0; return; }

    vec3 q0 = (iRoot - HC) / HR;
    float R0 = length(q0);
    vec3 u0 = q0 / R0;
    vec3 fq = iFlow / HR; fq = normalize(fq - u0 * dot(fq, u0));
    vec3 b = cross(u0, fq);
    float a0 = mix(0.3 + 0.4 * sa, 1.2, flatW);
    float lam = mix(0.035 + 0.07 * sb, 0.015, flatW);
    float wav = sa * 6.2831;
    vec3 P = strandAt(aS, L, u0, fq, b, R0, a0, lam, wav);
    vec3 P2 = strandAt(min(aS + 0.12, 1.0), L, u0, fq, b, R0, a0, lam, wav);
    vec3 Pb = strandAt(max(aS - 0.12, 0.0), L, u0, fq, b, R0, a0, lam, wav);
    vec3 tanO = normalize(P2 - Pb + iNorm * 1e-4);

    vec4 mv = modelViewMatrix * vec4(P, 1.0);
    vec3 tanV = normalize(mat3(modelViewMatrix) * tanO);
    vec3 side = normalize(cross(tanV, normalize(-mv.xyz)) + vec3(1e-5));
    float taper = 1.0 - 0.7 * aS * aS;
    float halfW = 0.5 * uWidthPx * W * taper * uPx * (-mv.z);
    mv.xyz += side * aSide * halfW;
    gl_Position = projectionMatrix * mv;
    vSide = aSide;

    // Kajiya-Kay style shading, per vertex
    vec3 Tw = normalize(mat3(modelMatrix) * tanO);
    vec3 Nr = normalize(mat3(modelMatrix) * iNorm);
    vec3 Wp = (modelMatrix * vec4(P, 1.0)).xyz;
    vec3 V = normalize(uCamPos - Wp);
    vec3 Lk = normalize(uKeyDir);
    float tl = dot(Tw, Lk);
    float kd = sqrt(max(1.0 - tl * tl, 0.0));
    float occl = 0.22 + 0.78 * sstep(-0.25, 0.55, dot(Nr, Lk));
    float ao = mix(0.45, 1.0, sstep(0.0, 0.7, aS)) * mix(0.75, 1.0, sstep(0.05, 0.25, L) * aS + (1.0 - sstep(0.05, 0.25, L)));
    vec3 Hk = normalize(Lk + V);
    float th = dot(Tw, Hk);
    float spec = pow(sqrt(max(1.0 - th * th, 0.0)), 44.0);
    vec3 Lr = normalize(uRimDir);
    vec3 Hr = normalize(Lr + V);
    float tr = dot(Tw, Hr);
    float rim = pow(sqrt(max(1.0 - tr * tr, 0.0)), 24.0) * sstep(-0.2, 0.5, dot(Nr, Lr));
    vec3 base = mix(uHair * (0.82 + 0.36 * sb), uHairYoung, young);
    vec3 hemi = mix(uGround, uSky, Nr.y * 0.5 + 0.5);
    vec3 col = base * (uKeyCol * kd * occl * 0.85 + hemi * 2.4 + uFillCol * 0.25 * max(dot(Nr, normalize(uFillDir)), 0.0)) * ao
             + uKeyCol * mix(base * 4.0, vec3(0.06), 0.35) * spec * occl * mix(0.6, 1.0, sb) + uRimCol * rim * 0.34;
    col = mix(col, uScab * (0.6 + 0.6 * occl), red);
    vCol = toSRGB(tonemap(col));
  }`;
const strandFrag = /* glsl */`
  varying vec3 vCol; varying float vSide;
  void main() {
    float a = 1.0 - smoothstep(0.45, 1.0, abs(vSide));
    if (a < 0.02) discard;
    gl_FragColor = vec4(vCol, a);
  }`;

/* ----------------------------------------------------------- marker -- */
const markerVert = /* glsl */`
  attribute float aU; attribute float aAcross; attribute float aDash;
  varying float vU; varying float vAcross; varying float vDash; varying vec3 vN; varying vec3 vObj;
  void main() {
    vU = aU; vAcross = aAcross; vDash = aDash; vObj = position;
    vN = normalize(mat3(modelMatrix) * normalize(position - vec3(${HAIR_CENTER.join(',')})));
    gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
  }`;
const markerFrag = /* glsl */`
  uniform float uDraw, uFade; uniform vec3 uInk, uKeyDir;
  varying float vU; varying float vAcross; varying float vDash; varying vec3 vN; varying vec3 vObj;
  ${GLSL_ZONES}
  void main() {
    if (vU > uDraw) discard;
    if (vDash >= 0.0 && fract(vDash) > 0.56) discard;
    float edge = 1.0 - smoothstep(0.55, 1.0, abs(vAcross));
    float ink = 0.78 + 0.22 * sin(vObj.x * 310.0 + vObj.z * 170.0);
    float lit = 0.55 + 0.45 * max(dot(normalize(vN), normalize(uKeyDir)), 0.0);
    vec3 c = toSRGB(tonemap(uInk * lit * 2.2));
    gl_FragColor = vec4(c, edge * uFade * ink);
  }`;

/* ---------------------------------------------------------- shadow -- */
const shadowFrag = /* glsl */`
  varying vec2 vUv; uniform float uAlpha;
  void main() { float r = length(vUv - 0.5) * 2.0; float a = (1.0 - smoothstep(0.25, 1.0, r)) * uAlpha; gl_FragColor = vec4(0.02, 0.05, 0.045, a); }`;

const sRGBtoLinear = (hex) => new THREE.Color(hex).convertSRGBToLinear();

export function createScene(canvas, data, opts = {}) {
  const small = !!opts.small;
  const renderer = new THREE.WebGLRenderer({
    canvas, antialias: true, alpha: true, premultipliedAlpha: true,
    powerPreference: 'high-performance', preserveDrawingBuffer: !!opts.capture,
  });
  renderer.setClearColor(0x000000, 0);
  renderer.outputColorSpace = THREE.LinearSRGBColorSpace; // shaders write display-ready sRGB
  // Phones start at the stills' own resolution (2x) so the hand-over from the
  // opening still is exact; page.js steps down if the GPU cannot keep up.
  let dprCap = opts.dprCap || (small ? 2 : 1.35);
  // Strand width follows the head: it is set against the stills (phone 390x844
  // at 2x, desktop 1600x1000 at 1x) and scales with the head's size on screen
  // and the drawing resolution, so the hair keeps its weight on every screen.
  const STRAND_W = small ? 1.7 : 2.1;
  const ref = opts.still || (small ? { w: 390, h: 844, dpr: 2 } : { w: 1600, h: 1000, dpr: 1 });
  const headPx = (w, h) => Math.min(0.6 * h, 0.8 * w);   // the camera fit below, in pixels

  const scene = new THREE.Scene();
  const camera = new THREE.PerspectiveCamera(28, 1, 0.1, 60);
  const lights = LIGHT_UNIFORMS();
  const group = new THREE.Group();
  scene.add(group);

  // head
  const hg = new THREE.BufferGeometry();
  hg.setAttribute('position', new THREE.BufferAttribute(data.head.positions, 3));
  hg.setAttribute('normal', new THREE.BufferAttribute(data.head.normals, 3));
  hg.setAttribute('aAO', new THREE.BufferAttribute(data.head.ao, 1));
  hg.setIndex(new THREE.BufferAttribute(data.head.indices, 1));
  const headMat = new THREE.ShaderMaterial({
    vertexShader: headVert, fragmentShader: headFrag,
    uniforms: {
      ...lights,
      uSkin: { value: sRGBtoLinear('#b49c8e') },
      uHairDark: { value: sRGBtoLinear('#2b1d16') },
      uStone: { value: sRGBtoLinear('#3a423e') },
      uStoneVein: { value: sRGBtoLinear('#56605a') },
    },
  });
  const head = new THREE.Mesh(hg, headMat);
  group.add(head);

  // strands
  const roots = data.roots;
  const count = roots.length / 17;
  const base = new THREE.InstancedBufferGeometry();
  const sArr = [], sideArr = [], idx = [];
  for (let i = 0; i <= SEG; i++) { sArr.push(i / SEG, i / SEG); sideArr.push(-1, 1); if (i < SEG) { const q = i * 2; idx.push(q, q + 1, q + 3, q, q + 3, q + 2); } }
  base.setAttribute('aS', new THREE.Float32BufferAttribute(sArr, 1));
  base.setAttribute('aSide', new THREE.Float32BufferAttribute(sideArr, 1));
  base.setAttribute('position', new THREE.Float32BufferAttribute(new Array(sArr.length * 3).fill(0), 3));
  base.setIndex(idx);
  const ib = new THREE.InstancedInterleavedBuffer(roots, 17, 1);
  base.setAttribute('iRoot', new THREE.InterleavedBufferAttribute(ib, 3, 0));
  base.setAttribute('iNorm', new THREE.InterleavedBufferAttribute(ib, 3, 3));
  base.setAttribute('iFlow', new THREE.InterleavedBufferAttribute(ib, 3, 6));
  base.setAttribute('iA', new THREE.InterleavedBufferAttribute(ib, 4, 9));
  base.setAttribute('iB', new THREE.InterleavedBufferAttribute(ib, 4, 13));
  base.instanceCount = count;
  const strandMat = new THREE.ShaderMaterial({
    vertexShader: strandVert, fragmentShader: strandFrag,
    uniforms: {
      ...lights,
      uPx: { value: 0.001 }, uWidthPx: { value: STRAND_W },
      uHair: { value: sRGBtoLinear('#4a3427') },
      uHairYoung: { value: sRGBtoLinear('#5f4636') },
      uScab: { value: sRGBtoLinear('#7c2a20') },
    },
    alphaToCoverage: true, side: THREE.DoubleSide,
  });
  const strands = new THREE.Mesh(base, strandMat);
  strands.frustumCulled = false;
  group.add(strands);

  // marker plan
  const mg = new THREE.BufferGeometry();
  mg.setAttribute('position', new THREE.BufferAttribute(data.marker.positions, 3));
  mg.setAttribute('aU', new THREE.BufferAttribute(data.marker.u, 1));
  mg.setAttribute('aAcross', new THREE.BufferAttribute(data.marker.across, 1));
  mg.setAttribute('aDash', new THREE.BufferAttribute(data.marker.dash, 1));
  mg.setIndex(new THREE.BufferAttribute(data.marker.indices, 1));
  const markerMat = new THREE.ShaderMaterial({
    vertexShader: markerVert, fragmentShader: markerFrag, transparent: true, depthWrite: false,
    polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -2,
    side: THREE.DoubleSide,
    uniforms: { uDraw: { value: 0 }, uFade: { value: 0 }, uInk: { value: sRGBtoLinear('#6a2db4') }, uKeyDir: lights.uKeyDir },
  });
  const marker = new THREE.Mesh(mg, markerMat);
  marker.renderOrder = 2;
  group.add(marker);

  // soft contact shadow under the socle
  const shadow = new THREE.Mesh(new THREE.PlaneGeometry(2.6, 2.6), new THREE.ShaderMaterial({
    vertexShader: 'varying vec2 vUv; void main(){ vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position,1.0); }',
    fragmentShader: shadowFrag, transparent: true, depthWrite: false, uniforms: { uAlpha: { value: 0.55 } },
  }));
  shadow.rotation.x = -Math.PI / 2; shadow.position.set(0, -1.746, -0.07);
  scene.add(shadow);

  const allMats = [headMat, strandMat];
  const state = { T: -1, az: 150, el: 30, dist: 1, yaw: 0, ty: 0.15, ox: 0, oy: 0, draw: 0, markerFade: 0, dragYaw: 0, dragPitch: 0 };
  let W = 1, H = 1, dpr = 1;

  function resize(w, h) {
    W = Math.max(1, w); H = Math.max(1, h);
    dpr = Math.min(window.devicePixelRatio || 1, dprCap);
    strandMat.uniforms.uWidthPx.value = Math.max(1.35, STRAND_W * (dpr / ref.dpr) * (headPx(W, H) / headPx(ref.w, ref.h)));
    renderer.setPixelRatio(dpr);
    renderer.setSize(W, H, false);
    camera.aspect = W / H;
    camera.updateProjectionMatrix();
  }

  const tmp = new THREE.Vector3(), camDir = new THREE.Vector3(), right = new THREE.Vector3(), up = new THREE.Vector3(0, 1, 0);
  function apply() {
    const s = state;
    lights.uT.value = s.T;
    const az = THREE.MathUtils.degToRad(s.az) + s.dragYaw, el = THREE.MathUtils.degToRad(Math.max(-10, Math.min(85, s.el + s.dragPitch * 57.3)));
    // Fit the head: vertical fit on wide screens, horizontal on tall ones.
    const tanH = Math.tan(THREE.MathUtils.degToRad(camera.fov / 2));
    const headR = 1.05;
    const fitV = headR / (tanH * 0.6), fitH = headR / (tanH * camera.aspect * 0.8);
    const D = Math.max(fitV, fitH) * s.dist;
    const target = tmp.set(0, s.ty, -0.05);
    camera.position.set(target.x + D * Math.cos(el) * Math.sin(az), target.y + D * Math.sin(el), target.z + D * Math.cos(el) * Math.cos(az));
    camera.up.set(0, 1, 0);
    camera.lookAt(target);
    // place the head off centre through the view offset, so the copy has its side
    if (s.ox || s.oy) camera.setViewOffset(W, H, -s.ox * W, -s.oy * H, W, H); else camera.clearViewOffset();
    camera.updateMatrixWorld();
    group.rotation.y = THREE.MathUtils.degToRad(s.yaw);
    group.updateMatrixWorld();
    // camera-relative fill and rim, world-fixed key
    camDir.copy(camera.position).sub(target).normalize();
    right.crossVectors(up, camDir).normalize();
    lights.uKeyDir.value.copy(camDir).multiplyScalar(0.62).addScaledVector(up, 0.95).addScaledVector(right, -0.5).normalize();
    lights.uFillDir.value.copy(camDir).addScaledVector(right, 0.7).addScaledVector(up, 0.1).normalize();
    lights.uRimDir.value.copy(camDir).negate().addScaledVector(right, 0.5).addScaledVector(up, 0.35).normalize();
    lights.uCamPos.value.copy(camera.position);
    strandMat.uniforms.uPx.value = 2 * tanH / (H * dpr);
    markerMat.uniforms.uDraw.value = s.draw;
    markerMat.uniforms.uFade.value = s.markerFade;
    marker.visible = s.markerFade > 0.001 && s.draw > 0.001;
  }

  function render() { apply(); renderer.render(scene, camera); }

  const projV = new THREE.Vector3(), nrmV = new THREE.Vector3();
  // screen position (0..1) of a head-space point and whether it faces the camera
  function project(p) {
    projV.set(p[0], p[1], p[2]).applyMatrix4(group.matrixWorld);
    nrmV.set(p[3], p[4], p[5]).transformDirection(group.matrixWorld);
    const facing = nrmV.dot(tmp.copy(camera.position).sub(projV).normalize());
    projV.project(camera);
    return { x: (projV.x + 1) / 2, y: (1 - projV.y) / 2, facing };
  }

  function setDprCap(v) { dprCap = v; resize(W, H); }
  // Compile every program before the first visible frame. Where the driver
  // offers KHR_parallel_shader_compile this happens off the main thread, so
  // the reader's first scroll does not stall on shader linking.
  async function warm() {
    if (!renderer.extensions.has('KHR_parallel_shader_compile')) return; // the first render compiles instead
    apply();
    marker.visible = true;
    try { await renderer.compileAsync(scene, camera); } catch { /* same: the first render compiles */ }
    apply();
  }
  return { state, resize, render, warm, project, setDprCap, get dpr() { return dpr; }, renderer, camera, strandsCount: count, dispose: () => renderer.dispose() };
}
