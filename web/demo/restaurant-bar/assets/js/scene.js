// Kehribar demo scene: a drink on a stone bar top under one warm lamp.
// Everything optical is analytic and shared by two programs:
//  - the glass is ray traced per pixel (thin wall, thick base, liquid with a rippled surface, Fresnel, total internal reflection,
//    Beer-Lambert absorption, one trace per colour channel for dispersion);
//  - the caustics are the same rays shot from the lamp through a dense grid; each grid vertex lands where its ray hits the bar top
//    and the brightness is the change of area (Evan Wallace's method), so shadow, focus lines and colour come from one pass.
// three.js r180 (MIT). Technique inspired by drei <Caustics> / MeshTransmissionMaterial (pmndrs, MIT); no code or model copied.
import * as THREE from 'three';

const GLSL_COMMON = /* glsl */ `
#define NB 24
uniform float uR; uniform float uW; uniform float uB; uniform float uH; uniform float uHl;
uniform float uIorL; uniform float uIorG; uniform float uDisp;
uniform vec3 uSigma; uniform vec3 uSigmaG;
uniform float uTime;
uniform vec4 uRip[4];
uniform float uMen;
uniform vec2 uFlute;
uniform float uWave;
uniform vec3 uLightDir; uniform vec3 uLightCol; uniform vec3 uAmb;
uniform vec2 uSpot; uniform vec2 uSpotR;
uniform sampler2D uCaus; uniform vec4 uCausRect;
uniform sampler2D uStone;
uniform sampler2D uCoasterTex; uniform vec3 uCoasterGeo;
uniform float uEdgeZ;
uniform vec4 uBokeh[NB]; uniform vec3 uBokehCol[NB];
uniform vec3 uSoftA; uniform vec3 uSoftB;

const float PI = 3.14159265;

// ---- liquid surface: idle swell + meniscus + tap ripples (gradient only, the surface is the plane y = uHl) ----
vec2 surfGrad(vec2 p) {
  vec2 g = vec2(0.0);
  float t = uTime;
  // three slow travelling waves (periods divide 8 s so a recorded loop closes)
  vec2 k1 = vec2(21.0, 9.0), k2 = vec2(-14.0, 23.0), k3 = vec2(31.0, -26.0);
  g += k1 * -sin(dot(k1, p) - t * 1.5707963) * 0.0011 * uWave;
  g += k2 * -sin(dot(k2, p) + t * 2.3561945) * 0.0009 * uWave;
  g += k3 * -sin(dot(k3, p) - t * 3.1415927) * 0.00045 * uWave;
  float r = length(p) + 1e-5;
  float Rin = uR - uW;
  float dw = max(Rin - r, 0.0);
  g += (p / r) * (uMen / 0.022) * exp(-dw / 0.022);
  for (int i = 0; i < 4; i++) {
    vec4 rp = uRip[i];
    float age = t - rp.z;
    if (age > 0.0 && age < 5.0 && rp.w > 0.0) {
      vec2 d = p - rp.xy;
      float rr = length(d) + 1e-5;
      float front = 0.05 + age * 0.55;
      float env = exp(-age * 1.1) * smoothstep(front + 0.04, front - 0.25, rr) * smoothstep(0.0, 0.08, rr + 0.02);
      float ph = 46.0 * rr - 34.0 * age;
      g += (d / rr) * (rp.w * env * 46.0 * cos(ph));
    }
  }
  return g;
}
vec3 surfNormal(vec2 p) { vec2 g = surfGrad(p); return normalize(vec3(-g.x, 1.0, -g.y)); }

// ---- the room as seen in reflections and behind the bar: two strip softboxes, the lamp, out-of-focus bar lights ----
uniform samplerCube uEnvMap;
vec3 roomDir(vec3 d, float blur) {
  float el = asin(clamp(d.y, -1.0, 1.0));
  float az = atan(d.x, d.z);
  float azb = atan(d.x, -d.z);
  // the room: near-black, a warm back-bar glow around eye level behind the glass
  vec3 c = mix(vec3(0.0035, 0.0028, 0.0025), vec3(0.010, 0.0075, 0.006), smoothstep(-0.4, 0.5, d.y));
  float back = smoothstep(1.6, 0.2, abs(azb));
  c += vec3(0.034, 0.018, 0.009) * exp(-pow((el + 0.03) / 0.09, 2.0)) * back;
  c += vec3(0.010, 0.0055, 0.003) * exp(-pow((el - 0.10) / 0.30, 2.0)) * back;
  float e = 0.025 + blur;
  float s1 = smoothstep(0.11 + e, 0.11 - e, abs(az - 0.78)) * smoothstep(0.52 + e, 0.40 - e, abs(el - 0.22));
  float s2 = smoothstep(0.05 + e, 0.05 - e, abs(az + 0.95)) * smoothstep(0.60 + e, 0.48 - e, abs(el - 0.12));
  c += uSoftA * s1 + uSoftB * s2;
  for (int i = 0; i < NB; i++) {
    vec4 b = uBokeh[i];
    float dd = length(vec2(azb - b.x, el - b.y));
    float rad = b.z + blur * 0.4;
    float disc = smoothstep(rad, rad * 0.78, dd);
    float rim = smoothstep(rad * 0.6, rad * 0.95, dd) * disc;
    c += uBokehCol[i] * b.w * (disc * 0.65 + rim * 0.5);
  }
  return c;
}

vec3 envDir(vec3 d, float blur, float lampK) {
  vec3 c = textureLod(uEnvMap, d, blur * 40.0).rgb;
  float lamp = smoothstep(0.9975, 0.9993, dot(d, -uLightDir));
  return c + uLightCol * lamp * 2.4 * lampK;
}

vec3 causAt(vec2 q, float lod) {
  if (uCausRect.w < 0.5) return vec3(1.0);
  vec2 uv = (q - uCausRect.xy) / uCausRect.z;
  if (uv.x <= 0.0 || uv.y <= 0.0 || uv.x >= 1.0 || uv.y >= 1.0) return vec3(1.0);
  if (lod > 0.5) return max(textureLod(uCaus, uv, lod).rgb, vec3(0.0));
  float px = uCausRect.w > 1.5 ? 1.0 / uCausRect.w : 1.0 / 640.0;
  vec3 c = texture2D(uCaus, uv).rgb * 0.4;
  c += texture2D(uCaus, uv + vec2(px, 0.0)).rgb * 0.15;
  c += texture2D(uCaus, uv - vec2(px, 0.0)).rgb * 0.15;
  c += texture2D(uCaus, uv + vec2(0.0, px)).rgb * 0.15;
  c += texture2D(uCaus, uv - vec2(0.0, px)).rgb * 0.15;
  return max(c, vec3(0.0));
}

// ---- the bar top: honed dark stone, a printed coaster under the glass, lamp pool, caustics, contact shade, glossy sheen ----
vec3 shadeTable(vec3 p, vec3 rd, float lod) {
  vec2 q = p.xz;
  float n = texture2D(uStone, q * 0.16).r;
  float vein = texture2D(uStone, q * 0.16 + 0.37).g;
  vec3 alb = mix(vec3(0.036, 0.031, 0.028), vec3(0.068, 0.057, 0.049), n);
  alb += vec3(0.10, 0.08, 0.06) * vein * 0.16;
  float specK = 1.0;
  vec2 cq = q - uCoasterGeo.xy;
  float rc = length(cq);
  if (rc < uCoasterGeo.z) {
    vec4 ct = texture2D(uCoasterTex, cq / (2.0 * uCoasterGeo.z) + 0.5);
    alb = ct.rgb;
    specK = 0.35 + ct.a * 1.6;
  }
  float edgeRing = smoothstep(0.012, 0.0, abs(rc - uCoasterGeo.z)) * 0.6;
  vec3 L = -uLightDir;
  float ndl = max(L.y, 0.0);
  vec2 sp = (q - uSpot) / uSpotR;
  float spot = pow(smoothstep(1.0, 0.0, length(sp)), 1.6);
  vec3 caus = causAt(q, lod);
  vec3 col = alb * uLightCol * ndl * spot * caus;
  float rg = length(q);
  float ao = 1.0 - 0.55 * exp(-max(rg - uR, 0.0) * 16.0);
  col += alb * uAmb * ao * (0.6 + 0.4 * spot);
  vec3 V = -rd;
  float fr = 0.035 + 0.965 * pow(1.0 - clamp(V.y, 0.0, 1.0), 5.0);
  col += fr * envDir(reflect(rd, vec3(0.0, 1.0, 0.0)), 0.07, 0.0) * 0.28 * specK;
  vec3 Hh = normalize(L + V);
  col += uLightCol * pow(max(Hh.y, 0.0), 60.0) * 0.012 * spot * specK * min(caus, vec3(3.0));
  col += uLightCol * edgeRing * 0.02 * spot;
  return col;
}

vec3 shadeWorld(vec3 ro, vec3 rd) {
  if (rd.y < -1e-4) {
    float t = -ro.y / rd.y;
    vec3 p = ro + rd * t;
    vec3 c = shadeTable(p, rd, 0.0);
    float fog = smoothstep(2.5, 9.0, t);
    return fog > 0.001 ? mix(c, roomDir(rd, 0.0), fog) : c;
  }
  return roomDir(rd, 0.0);
}
// the same, for rays that come out of the glass (blurred room from the cube map)
vec3 shadeWorldSoft(vec3 ro, vec3 rd) {
  if (rd.y < -1e-4) {
    float t = -ro.y / rd.y;
    vec3 p = ro + rd * t;
    vec3 c = shadeTable(p, rd, 2.0);
    float fog = smoothstep(2.5, 9.0, t);
    return mix(c, envDir(rd, 0.02, 0.0), fog);
  }
  return envDir(rd, 0.02, 0.0);
}

// ---- the drink: outer cylinder R, wall w, solid base b, rim at H, liquid up to Hl ----
float cylT(vec3 o, vec3 d, float r, bool far) {
  float a = dot(d.xz, d.xz);
  if (a < 1e-9) return -1.0;
  float b = dot(o.xz, d.xz);
  float c = dot(o.xz, o.xz) - r * r;
  float disc = b * b - a * c;
  if (disc < 0.0) return -1.0;
  float s = sqrt(disc);
  return far ? (-b + s) / a : (-b - s) / a;
}
float planeT(vec3 o, vec3 d, float y) { return abs(d.y) < 1e-7 ? -1.0 : (y - o.y) / d.y; }
float iorOf(int m, float iL, float iG) { return m == 1 ? iG : (m == 2 ? iL : 1.0); }
// fluted outer wall: the radial normal leans left and right with the flutes (a normal map; the hit stays on the cylinder)
vec3 outerNormal(vec3 o) {
  vec3 n = vec3(o.x, 0.0, o.z) / uR;
  if (uFlute.x < 1.0) return n;
  float th = atan(o.z, o.x);
  float tilt = sin(th * uFlute.x) * uFlute.y * smoothstep(0.015, 0.08, o.y) * smoothstep(uH - 0.01, uH - 0.09, o.y);
  vec3 tg = vec3(-n.z, 0.0, n.x);
  return normalize(n * cos(tilt) + tg * sin(tilt));
}

// Fresnel (Schlick) for a dielectric pair
float fres(float ci, float na, float nb) { float r0 = (na - nb) / (na + nb); r0 *= r0; return r0 + (1.0 - r0) * pow(1.0 - ci, 5.0); }
// refraction that keeps the ray on the far side of the real (unbumped) surface
vec3 refr(vec3 d, vec3 N, vec3 Ng, float eta, out bool tir) {
  float sIn = dot(d, Ng) > 0.0 ? 1.0 : -1.0;
  if (dot(d, N) > 0.0) N = -N;
  vec3 t = refract(d, N, eta);
  tir = dot(t, t) < 1e-6;
  if (tir) { t = reflect(d, N); float k = dot(t, Ng) * sIn; if (k > -0.01) t = normalize(t - Ng * sIn * (k + 0.02)); return t; }
  float k = dot(t, Ng) * sIn; if (k < 0.01) t = normalize(t + Ng * sIn * (0.02 - k));
  return t;
}

// result: 0 left the glass (o,d outside), 1 reached the bar top under the base (o on y=0), 2 lost, 3 never touched the glass
// The side wall is treated as a thin shell (two refractions, no light piping inside it); the base is a solid block.
int traceDrink(inout vec3 o, inout vec3 d, float iL, float iG, inout float thr, inout vec3 refl, inout float lLiq, inout float lGlass, bool wantRefl) {
  int med = 0;
  float Rin = uR - uW;
  const float EPS = 1e-4;
  bool entered = false;
  bool tir;
  for (int i = 0; i < 10; i++) {
    float tb = 1e9;
    int sid = 0;
    if (med == 0) {
      float t = cylT(o, d, uR, false);
      if (t > EPS) { float y = o.y + d.y * t; if (y > 0.0 && y < uH) { tb = t; sid = 1; } }
      if (d.y < 0.0) {
        float t2 = planeT(o, d, uH);
        if (t2 > EPS && t2 < tb) { float r = length(o.xz + d.xz * t2); if (r < uR) { tb = t2; sid = r < Rin ? 3 : 2; } }
      }
      if (sid == 0) return entered ? 0 : 3;
    } else if (med == 1) {
      float t = cylT(o, d, uR, true);
      if (t > EPS) { float y = o.y + d.y * t; if (y >= -1e-3 && y <= uH + 1e-3) { tb = t; sid = 1; } }
      if (d.y > 0.0) { float t2 = planeT(o, d, uH); if (t2 > EPS && t2 < tb) { float r = length(o.xz + d.xz * t2); if (r >= Rin - 1e-3) { tb = t2; sid = 2; } } }
      float t3 = cylT(o, d, Rin, false);
      if (t3 > EPS && t3 < tb) { float y = o.y + d.y * t3; if (y > uB && y < uH) { tb = t3; sid = 4; } }
      if (d.y > 0.0) { float t4 = planeT(o, d, uB); if (t4 > EPS && t4 < tb) { float r = length(o.xz + d.xz * t4); if (r < Rin) { tb = t4; sid = 5; } } }
      if (d.y < 0.0) { float t5 = planeT(o, d, 0.0); if (t5 > EPS && t5 < tb) { tb = t5; sid = 6; } }
    } else if (med == 2) {
      float t = cylT(o, d, Rin, true);
      if (t > EPS) { tb = t; sid = 4; }
      if (d.y < 0.0) { float t2 = planeT(o, d, uB); if (t2 > EPS && t2 < tb) { tb = t2; sid = 5; } }
      if (d.y > 0.0) { float t3 = planeT(o, d, uHl); if (t3 > EPS && t3 < tb) { tb = t3; sid = 7; } }
    } else {
      float t = cylT(o, d, Rin, true);
      if (t > EPS) { tb = t; sid = 4; }
      if (d.y < 0.0) { float t2 = planeT(o, d, uHl); if (t2 > EPS && t2 < tb) { tb = t2; sid = 7; } }
      if (d.y > 0.0) { float t3 = planeT(o, d, uH); if (t3 > EPS && t3 < tb) { tb = t3; sid = 3; } }
    }
    if (sid == 0) return 2;
    if (med == 2) lLiq += tb;
    if (med == 1) lGlass += tb;
    o += d * tb;
    if (sid == 6) return 1;
    if (sid == 3) { med = med == 0 ? 3 : 0; entered = true; if (med == 0) return 0; continue; }

    // thin side wall, from outside: in through the fluted face, out through the smooth inner face
    if (sid == 1 && med == 0 && o.y > uB) {
      vec3 Ng = vec3(o.x, 0.0, o.z) / uR;
      vec3 N = outerNormal(o);
      float ci = abs(dot(d, N));
      float F = fres(ci, 1.0, iG);
      if (wantRefl) refl += thr * F * envDir(reflect(d, dot(d, N) > 0.0 ? -N : N), 0.0, entered ? 0.0 : 1.0);
      thr *= 1.0 - F;
      vec3 d1 = refr(d, N, Ng, 1.0 / iG, tir);
      float t1 = cylT(o, d1, Rin, false);
      entered = true;
      if (t1 > 0.0 && t1 < 0.5) {
        o += d1 * t1; lGlass += t1;
        int nxt = o.y < uHl ? 2 : 3;
        vec3 Ni = vec3(o.x, 0.0, o.z) / Rin;
        float nb = nxt == 2 ? iL : 1.0;
        vec3 d2 = refr(d1, Ni, Ni, iG / nb, tir);
        if (tir) { // back out through the outer face
          float t2 = cylT(o, d2, uR, true); o += d2 * max(t2, 0.0); lGlass += max(t2, 0.0);
          d = refr(d2, outerNormal(o), vec3(o.x, 0.0, o.z) / uR, iG, tir); return 0;
        }
        thr *= 1.0 - fres(abs(dot(d1, Ni)), iG, nb);
        d = normalize(d2); med = nxt; continue;
      }
      // grazing: the ray stays in the wall and leaves through the outer face again
      float t2 = cylT(o, d1, uR, true); o += d1 * max(t2, 0.0); lGlass += max(t2, 0.0);
      d = refr(d1, outerNormal(o), vec3(o.x, 0.0, o.z) / uR, iG, tir);
      return 0;
    }
    // thin side wall, from inside (liquid or air): out through the inner face, then the fluted outer face
    if (sid == 4 && (med == 2 || med == 3) && o.y > uB) {
      vec3 Ni = vec3(o.x, 0.0, o.z) / Rin;
      float na = med == 2 ? iL : 1.0;
      vec3 d1 = refr(d, Ni, Ni, na / iG, tir);
      if (tir) { d = d1; continue; }
      thr *= 1.0 - fres(abs(dot(d, Ni)), na, iG);
      float t2 = cylT(o, d1, uR, true);
      o += d1 * max(t2, 0.0); lGlass += max(t2, 0.0);
      vec3 Ng = vec3(o.x, 0.0, o.z) / uR;
      vec3 N = outerNormal(o);
      vec3 d2 = refr(d1, N, Ng, iG, tir);
      if (tir) { // reflected back inside: step back through the inner face
        float t3 = cylT(o, d2, Rin, false);
        if (t3 > 0.0) { o += d2 * t3; d = refr(d2, Ni, Ni, iG / na, tir); continue; }
        return 2;
      }
      thr *= 1.0 - fres(abs(dot(d1, N)), iG, 1.0);
      d = d2;
      return 0;
    }

    vec3 N; vec3 Ng; int nxt;
    if (sid == 1) { Ng = vec3(o.x, 0.0, o.z) / uR; N = outerNormal(o); nxt = med == 0 ? 1 : 0; }
    else if (sid == 2) { Ng = vec3(0.0, 1.0, 0.0); N = Ng; nxt = med == 0 ? 1 : 0; }
    else if (sid == 4) { Ng = vec3(o.x, 0.0, o.z) / Rin; N = Ng; nxt = med == 1 ? (o.y < uHl ? 2 : 3) : 1; }
    else if (sid == 5) { Ng = vec3(0.0, 1.0, 0.0); N = Ng; nxt = med == 1 ? 2 : 1; }
    else { Ng = vec3(0.0, 1.0, 0.0); N = surfNormal(o.xz); if (med == 2) N = normalize(mix(Ng, N, 0.35)); nxt = med == 2 ? 3 : 2; }
    float na = iorOf(med, iL, iG);
    float nb = iorOf(nxt, iL, iG);
    vec3 No = dot(d, N) > 0.0 ? -N : N;
    float F = fres(clamp(-dot(d, No), 0.0, 1.0), na, nb);
    if (wantRefl && (med == 0 || med == 3) && nxt != 0) refl += thr * F * envDir(reflect(d, No), 0.0, entered ? 0.0 : 1.0);
    vec3 nd = refr(d, N, Ng, na / nb, tir);
    entered = true;
    d = nd;
    if (tir) continue;
    thr *= 1.0 - F;
    med = nxt;
    if (med == 0) return 0;
  }
  return 2;
}
`;

const ROOM_FS = /* glsl */ `
#define NB 24
uniform vec4 uBokeh[NB]; uniform vec3 uBokehCol[NB]; uniform vec3 uSoftA; uniform vec3 uSoftB;
varying vec3 vDir;
vec3 roomDir(vec3 d, float blur) {
  float el = asin(clamp(d.y, -1.0, 1.0));
  float az = atan(d.x, d.z);
  float azb = atan(d.x, -d.z);
  // the room: near-black, a warm back-bar glow around eye level behind the glass
  vec3 c = mix(vec3(0.0035, 0.0028, 0.0025), vec3(0.010, 0.0075, 0.006), smoothstep(-0.4, 0.5, d.y));
  float back = smoothstep(1.6, 0.2, abs(azb));
  c += vec3(0.034, 0.018, 0.009) * exp(-pow((el + 0.03) / 0.09, 2.0)) * back;
  c += vec3(0.010, 0.0055, 0.003) * exp(-pow((el - 0.10) / 0.30, 2.0)) * back;
  float e = 0.025 + blur;
  float s1 = smoothstep(0.11 + e, 0.11 - e, abs(az - 0.78)) * smoothstep(0.52 + e, 0.40 - e, abs(el - 0.22));
  float s2 = smoothstep(0.05 + e, 0.05 - e, abs(az + 0.95)) * smoothstep(0.60 + e, 0.48 - e, abs(el - 0.12));
  c += uSoftA * s1 + uSoftB * s2;
  for (int i = 0; i < NB; i++) {
    vec4 b = uBokeh[i];
    float dd = length(vec2(azb - b.x, el - b.y));
    float rad = b.z + blur * 0.4;
    float disc = smoothstep(rad, rad * 0.78, dd);
    float rim = smoothstep(rad * 0.6, rad * 0.95, dd) * disc;
    c += uBokehCol[i] * b.w * (disc * 0.65 + rim * 0.5);
  }
  return c;
}

void main() { gl_FragColor = vec4(roomDir(normalize(vDir), 0.0), 1.0); }
`;
const ROOM_VS = /* glsl */ `
varying vec3 vDir;
void main() { vDir = position; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }
`;

const FULL_VS = /* glsl */ `
varying vec2 vUv;
void main() { vUv = uv; gl_Position = vec4(position.xy, 0.0, 1.0); }
`;

const WORLD_FS = /* glsl */ `
${GLSL_COMMON}
uniform mat4 uInvPV; uniform vec3 uCam;
varying vec2 vUv;
void main() {
  vec2 ndc = vUv * 2.0 - 1.0;
  vec4 a = uInvPV * vec4(ndc, -1.0, 1.0);
  vec4 b = uInvPV * vec4(ndc, 1.0, 1.0);
  vec3 rd = normalize(b.xyz / b.w - a.xyz / a.w);
  gl_FragColor = vec4(shadeWorld(uCam, rd), 1.0);
}
`;

const GLASS_VS = /* glsl */ `
varying vec3 vWorld;
void main() { vec4 w = modelMatrix * vec4(position, 1.0); vWorld = w.xyz; gl_Position = projectionMatrix * viewMatrix * w; }
`;

const GLASS_FS = /* glsl */ `
${GLSL_COMMON}
uniform vec3 uCam;
uniform float uChannels; uniform float uAA; uniform vec2 uPix;
varying vec3 vWorld;
vec3 shadeExit(int r, vec3 o, vec3 d) {
  if (r == 1) return shadeTable(o, d, 2.0);
  return shadeWorldSoft(o, d);
}
// one camera ray through the drink; returns colour (all channels from one ior set)
vec3 shootRay(vec3 rd, float k, out bool miss) {
  vec3 o = uCam, d = rd; float thr = 1.0; vec3 refl = vec3(0.0); float lL = 0.0, lG = 0.0;
  int r = traceDrink(o, d, uIorL + k * uDisp * 0.25, uIorG + k * uDisp, thr, refl, lL, lG, true);
  miss = r == 3;
  vec3 tr = exp(-uSigma * lL - uSigmaG * lG);
  vec3 bg = r == 2 ? envDir(d, 0.05, 0.0) : shadeExit(r, o, d);
  // light from the lamp scattered forward inside the liquid: the glow of a backlit drink
  float ph = pow(max(dot(-rd, uLightDir) * 0.5 + 0.5, 0.0), 3.0);
  vec3 glow = uLightCol * exp(-uSigma * 0.85) * (1.0 - exp(-lL * 1.2)) * (0.004 + 0.022 * ph);
  return refl + thr * (tr * bg + glow);
}
void main() {
  vec3 base = vWorld - uCam;
  vec3 dx = dFdx(base), dy = dFdy(base);
  vec3 col = vec3(0.0);
  float hits = 0.0;
  int n = uAA > 1.5 ? 2 : 1;
  for (int s = 0; s < 2; s++) {
    if (s >= n) break;
    vec2 j = n == 2 ? (s == 0 ? vec2(0.25, -0.25) : vec2(-0.25, 0.25)) : vec2(0.0);
    vec3 rd = normalize(base + dx * j.x + dy * j.y);
    bool miss;
    if (uChannels > 1.5) {
      vec3 cR = shootRay(rd, -1.0, miss); if (miss) continue;
      vec3 cG = shootRay(rd, 0.0, miss);
      vec3 cB = shootRay(rd, 1.0, miss);
      col += vec3(cR.r, cG.g, cB.b);
    } else {
      vec3 c = shootRay(rd, 0.0, miss); if (miss) continue;
      col += c;
    }
    hits += 1.0;
  }
  if (hits < 0.5) discard;
  gl_FragColor = vec4(min(col / hits, vec3(5.0)), 1.0);
}
`;

// caustics: one vertex per lamp ray; the vertex lands where its ray meets the bar top
const CAUS_VS = /* glsl */ `
${GLSL_COMMON}
uniform vec2 uFootO; uniform vec2 uFootA; uniform vec2 uFootB;
uniform float uMode; uniform float uChan;
varying vec3 vP0; varying vec3 vP1; varying vec3 vW;
void main() {
  vec2 p0 = uFootO + uv.x * uFootA + uv.y * uFootB;
  vec3 P0 = vec3(p0.x, 0.0, p0.y);
  vec3 o = P0 - uLightDir * 4.0;
  vec3 d = uLightDir;
  float thr = 1.0; vec3 refl = vec3(0.0); float lL = 0.0, lG = 0.0;
  float k = uChan < -0.5 ? 0.0 : uChan - 1.0;
  int r = traceDrink(o, d, uIorL + k * uDisp * 0.5, uIorG + k * uDisp, thr, refl, lL, lG, false);
  vec3 P1 = P0; vec3 w = vec3(0.0);
  if (uMode < 0.5) {
    w = r == 3 ? vec3(0.0) : vec3(-1.0);
  } else if (r == 1) {
    P1 = o; w = thr * exp(-uSigma * lL - uSigmaG * lG);
  } else if (r == 0 && d.y < -1e-3) {
    P1 = o + d * (-o.y / d.y); w = thr * exp(-uSigma * lL - uSigmaG * lG);
  }
  if (uChan > -0.5) { vec3 m = vec3(uChan < 0.5 ? 1.0 : 0.0, abs(uChan - 1.0) < 0.5 ? 1.0 : 0.0, uChan > 1.5 ? 1.0 : 0.0); w *= m; }
  vP0 = P0; vP1 = P1; vW = w;
  vec2 c = (P1.xz - uCausRect.xy) / uCausRect.z;
  gl_Position = vec4(c * 2.0 - 1.0, 0.0, 1.0);
}
`;

const CAUS_FS = /* glsl */ `
varying vec3 vP0; varying vec3 vP1; varying vec3 vW;
void main() {
  float a0 = length(cross(dFdx(vP0), dFdy(vP0)));
  float a1 = length(cross(dFdx(vP1), dFdy(vP1)));
  float ratio = clamp(a0 / max(a1, 1e-12), 0.0, 14.0);
  gl_FragColor = vec4(vW * ratio, 0.0);
}
`;

// stone: domain-warped value noise, drawn once into a tiling texture
const STONE_FS = /* glsl */ `
varying vec2 vUv;
float h(vec2 p) { p = fract(p * vec2(123.34, 456.21)); p += dot(p, p + 45.32); return fract(p.x * p.y); }
float vn(vec2 p, float per) {
  vec2 i = floor(p), f = fract(p); vec2 u = f * f * (3.0 - 2.0 * f);
  float a = h(mod(i, per)), b = h(mod(i + vec2(1, 0), per)), c = h(mod(i + vec2(0, 1), per)), d = h(mod(i + vec2(1, 1), per));
  return mix(mix(a, b, u.x), mix(c, d, u.x), u.y);
}
float fbm(vec2 p, float per) { float s = 0.0, a = 0.5; for (int i = 0; i < 6; i++) { s += a * vn(p, per); p *= 2.0; per *= 2.0; a *= 0.5; } return s; }
void main() {
  vec2 p = vUv * 6.0;
  vec2 w = vec2(fbm(p + 1.7, 6.0), fbm(p + 9.2, 6.0));
  float base = fbm(p + 3.0 * w, 6.0);
  float v = abs(sin((p.x * 0.8 + p.y * 0.35 + 4.0 * fbm(p * 0.9 + w, 6.0)) * 3.14159));
  float vein = 1.0 - smoothstep(0.0, 0.05, v);
  float grain = vn(vUv * 384.0, 384.0);
  gl_FragColor = vec4(clamp(base * 0.85 + grain * 0.15, 0.0, 1.0), vein, grain, 1.0);
}
`;

const BRIGHT_FS = /* glsl */ `
uniform sampler2D tHdr; varying vec2 vUv;
void main() { vec3 c = texture2D(tHdr, vUv).rgb; float l = max(c.r, max(c.g, c.b)); gl_FragColor = vec4(c * smoothstep(0.85, 2.2, l), 1.0); }
`;

const FINAL_FS = /* glsl */ `
uniform sampler2D tHdr; uniform sampler2D tBloom; uniform vec2 uTexel; uniform float uBloomK; uniform float uExposure; uniform float uTime; uniform float uFade;
varying vec2 vUv;
vec3 aces(vec3 x) { const float a = 2.51, b = 0.03, c = 2.43, d = 0.59, e = 0.14; return clamp((x * (a * x + b)) / (x * (c * x + d) + e), 0.0, 1.0); }
vec3 lod4(float l) { vec2 o = uTexel * exp2(l) * 0.5; return (textureLod(tBloom, vUv + vec2(o.x, o.y), l).rgb + textureLod(tBloom, vUv + vec2(-o.x, o.y), l).rgb + textureLod(tBloom, vUv + vec2(o.x, -o.y), l).rgb + textureLod(tBloom, vUv - o, l).rgb) * 0.25; }
float hash(vec2 p) { return fract(sin(dot(p, vec2(12.9898, 78.233)) + uTime * 0.0) * 43758.5453); }
void main() {
  vec3 c = texture2D(tHdr, vUv).rgb;
  vec3 b = textureLod(tBloom, vUv, 1.0).rgb * 0.30 + lod4(3.0) * 0.30 + lod4(4.5) * 0.25 + lod4(6.0) * 0.25;
  c += b * uBloomK;
  c *= uExposure;
  vec2 q = vUv - 0.5;
  c *= 1.0 - dot(q, q) * 0.65;
  c = aces(c);
  c = pow(c, vec3(1.0 / 2.2));
  c += (hash(gl_FragCoord.xy) - 0.5) / 255.0 * 1.5;
  gl_FragColor = vec4(c * uFade, 1.0);
}
`;

const v3 = (x, y, z) => new THREE.Vector3(x, y, z);
const lerp = (a, b, t) => a + (b - a) * t;
const damp = (a, b, k, dt) => lerp(a, b, 1 - Math.exp(-k * dt));

function rng(seed) { let s = seed >>> 0; return () => { s = (s + 0x6d2b79f5) >>> 0; let t = s; t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; }; }
const srgbToLin = (v) => (v <= 0.04045 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4);
export function hexToLin(hex) { const x = hex.replace('#', ''); return [0, 2, 4].map((i) => srgbToLin(parseInt(x.slice(i, i + 2), 16) / 255)); }
// transmitted colour after 0.7 units -> absorption per unit
export function sigmaFrom(lin, len = 0.7) { return lin.map((c) => -Math.log(Math.max(0.02, Math.min(0.995, c))) / len); }

const QUALITY = {
  high: { dpr: 1.5, grid: 220, map: 640, chan: 3, causChan: 1, bloom: true, aa: 2 },
  mid: { dpr: 1.25, grid: 180, map: 512, chan: 3, causChan: 1, bloom: true, aa: 1 },
  low: { dpr: 1.0, grid: 140, map: 512, chan: 1, causChan: 1, bloom: true, aa: 1 },
  min: { dpr: 0.75, grid: 100, map: 384, chan: 1, causChan: 1, bloom: false, aa: 1 },
};

export async function createScene({ canvas, quality = 'high', drinks, coaster, bokehColours = [], reduced = false, onStats = null, tune = null, autoSway = false }) {
  const renderer = new THREE.WebGLRenderer({ canvas, antialias: false, alpha: false, powerPreference: 'high-performance', preserveDrawingBuffer: false });
  renderer.autoClear = false;
  const gl = renderer.getContext();
  const floatOK = !!(gl.getExtension('EXT_color_buffer_float') || gl.getExtension('EXT_color_buffer_half_float'));
  let Q = { ...QUALITY[quality] || QUALITY.high, ...(tune || {}) };

  const camera = new THREE.PerspectiveCamera(24, 1, 0.1, 60);
  const fsCam = new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 1);
  const quad = new THREE.PlaneGeometry(2, 2);

  // ---------- shared uniforms ----------
  const rand = rng(7);
  const bokeh = []; const bokehCol = [];
  const warm = [[1.0, 0.55, 0.22], [1.0, 0.70, 0.38], [0.95, 0.42, 0.16], [1.0, 0.82, 0.55]];
  for (let i = 0; i < 24; i++) {
    const az = (rand() - 0.5) * 1.5;
    const el = -0.14 + rand() * 0.3;
    const big = rand() < 0.35;
    const rad = big ? 0.03 + rand() * 0.035 : 0.006 + rand() * 0.016;
    const inten = big ? 0.03 + rand() * 0.07 : 0.10 + rand() * 0.35;
    bokeh.push(new THREE.Vector4(az, el, rad, inten));
    const bc = bokehColours.length && i % 4 === 1 ? bokehColours[(i >> 2) % bokehColours.length] : warm[i % warm.length];
    bokehCol.push(v3(...bc));
  }
  const U = {
    uR: { value: 0.42 }, uW: { value: 0.03 }, uB: { value: 0.14 }, uH: { value: 0.82 }, uHl: { value: 0.52 },
    uIorL: { value: 1.345 }, uIorG: { value: 1.52 }, uDisp: { value: Q.chan > 1 ? 0.013 : 0.0 },
    uSigma: { value: v3(0, 0.9, 2.5) }, uSigmaG: { value: v3(0.18, 0.05, 0.12) },
    uTime: { value: 0 }, uRip: { value: [0, 1, 2, 3].map(() => new THREE.Vector4(0, 0, -99, 0)) }, uMen: { value: 0.0025 }, uFlute: { value: new THREE.Vector2(0, 0) }, uWave: { value: 1 },
    uLightDir: { value: v3(0.32, -1, 0.62).normalize() }, uLightCol: { value: v3(1.0, 0.79, 0.56).multiplyScalar(7.5) }, uAmb: { value: v3(0.07, 0.05, 0.036) },
    uSpot: { value: new THREE.Vector2(0.0, -0.5) }, uSpotR: { value: new THREE.Vector2(2.6, 2.2) },
    uCaus: { value: null }, uCausRect: { value: new THREE.Vector4(-1, -1, 2.6, 0) },
    uStone: { value: null }, uCoasterTex: { value: null }, uCoasterGeo: { value: v3(0, 0, 0.66) }, uEdgeZ: { value: -2.6 },
    uBokeh: { value: bokeh }, uBokehCol: { value: bokehCol },
    uSoftA: { value: v3(1.0, 0.86, 0.7).multiplyScalar(2.4) }, uSoftB: { value: v3(0.82, 0.9, 1.0).multiplyScalar(0.9) },
  };

  // ---------- render targets ----------
  const hdrType = floatOK ? THREE.HalfFloatType : THREE.UnsignedByteType;
  let hdrRT = new THREE.WebGLRenderTarget(4, 4, { type: hdrType, depthBuffer: false, samples: 0 });
  let bloomRT = new THREE.WebGLRenderTarget(4, 4, { type: hdrType, depthBuffer: false, generateMipmaps: true, minFilter: THREE.LinearMipmapLinearFilter });
  let causRT = null;
  const makeCaus = () => {
    if (causRT) causRT.dispose();
    causRT = floatOK ? new THREE.WebGLRenderTarget(Q.map, Q.map, { type: THREE.HalfFloatType, depthBuffer: false, generateMipmaps: true, minFilter: THREE.LinearMipmapLinearFilter, magFilter: THREE.LinearFilter }) : null;
    U.uCaus.value = causRT ? causRT.texture : null;
    U.uCausRect.value.w = causRT ? Q.map : 0;
  };
  makeCaus();

  // stone texture (once)
  const stoneSize = Q.map >= 1024 ? 1024 : 512;
  const stoneRT = new THREE.WebGLRenderTarget(stoneSize, stoneSize, { depthBuffer: false, generateMipmaps: true, minFilter: THREE.LinearMipmapLinearFilter, wrapS: THREE.RepeatWrapping, wrapT: THREE.RepeatWrapping });
  stoneRT.texture.wrapS = stoneRT.texture.wrapT = THREE.RepeatWrapping;
  stoneRT.texture.anisotropy = 4;
  {
    const s = new THREE.Scene();
    const m = new THREE.Mesh(quad, new THREE.ShaderMaterial({ vertexShader: FULL_VS, fragmentShader: STONE_FS, depthTest: false, depthWrite: false }));
    m.frustumCulled = false; s.add(m);
    renderer.setRenderTarget(stoneRT); renderer.render(s, fsCam); renderer.setRenderTarget(null);
    m.material.dispose();
  }
  U.uStone.value = stoneRT.texture;

  // coaster texture: the business name printed around a felt coaster (canvas text, so no image fetch is needed)
  function coasterTexture({ text, ink = '#d9b77a', base = '#1b1310', font = 'serif' }) {
    const S = 1024; const c = document.createElement('canvas'); c.width = c.height = S;
    const x = c.getContext('2d');
    x.fillStyle = base; x.fillRect(0, 0, S, S);
    // felt grain
    const r = rng(11);
    for (let i = 0; i < 9000; i++) { x.fillStyle = `rgba(255,255,255,${r() * 0.035})`; x.fillRect(r() * S, r() * S, 1.5, 1.5); }
    x.translate(S / 2, S / 2);
    x.strokeStyle = ink; x.globalAlpha = 0.9; x.lineWidth = 3;
    x.beginPath(); x.arc(0, 0, S * 0.47, 0, Math.PI * 2); x.stroke();
    x.lineWidth = 1.5; x.beginPath(); x.arc(0, 0, S * 0.355, 0, Math.PI * 2); x.stroke();
    const label = String(text || '').toUpperCase();
    const unit = `${label}  •  `;
    let rep = unit; while (rep.length < 34) rep += unit;
    x.fillStyle = ink; x.textAlign = 'center'; x.textBaseline = 'middle';
    const fs = Math.round(S * 0.058);
    x.font = `500 ${fs}px ${font}`;
    const rad = S * 0.413;
    const total = x.measureText(rep).width;
    const circ = 2 * Math.PI * rad;
    const scale = Math.min(1, circ / total);
    x.font = `500 ${Math.round(fs * scale)}px ${font}`;
    let ang = -Math.PI / 2;
    for (const ch of rep) {
      const w = x.measureText(ch).width;
      const a = w / rad;
      x.save(); x.rotate(ang + a / 2); x.translate(0, -rad); x.fillText(ch, 0, 0); x.restore();
      ang += a * 1.0 + (circ - total * scale) / rep.length / rad;
    }
    // alpha marks the foil print (shinier)
    const img = x.getImageData(0, 0, S, S);
    const ink3 = hexToLin(ink).map((v) => v * 255);
    for (let i = 0; i < img.data.length; i += 4) {
      const d = Math.abs(img.data[i] - ink3[0]) + Math.abs(img.data[i + 1] - ink3[1]) + Math.abs(img.data[i + 2] - ink3[2]);
      img.data[i + 3] = 255;
      if (d < 220 && img.data[i] > 60) img.data[i + 3] = 254;
    }
    const tex = new THREE.CanvasTexture(c);
    tex.colorSpace = THREE.SRGBColorSpace;
    tex.flipY = false;
    tex.anisotropy = 8;
    tex.generateMipmaps = true;
    tex.minFilter = THREE.LinearMipmapLinearFilter;
    return tex;
  }
  U.uCoasterTex.value = coasterTexture(coaster || { text: 'Kehribar' });
  const uniforms = U;
  const fixNames = (src) => src;

  // ---------- the room, baked once into a cube map (the lamp is added live) ----------
  const envSize = Q.map >= 1024 ? 512 : 256;
  const cubeRT = new THREE.WebGLCubeRenderTarget(envSize, { type: hdrType, generateMipmaps: true, minFilter: THREE.LinearMipmapLinearFilter });
  {
    const s = new THREE.Scene();
    const m = new THREE.Mesh(new THREE.BoxGeometry(10, 10, 10), new THREE.ShaderMaterial({ vertexShader: ROOM_VS, fragmentShader: ROOM_FS, uniforms: { uBokeh: U.uBokeh, uBokehCol: U.uBokehCol, uSoftA: U.uSoftA, uSoftB: U.uSoftB }, side: THREE.BackSide, depthTest: false, depthWrite: false }));
    s.add(m);
    const cc = new THREE.CubeCamera(0.1, 20, cubeRT);
    cc.update(renderer, s);
    m.geometry.dispose(); m.material.dispose();
  }
  U.uEnvMap = { value: cubeRT.texture };

  // ---------- main view: world quad + glass ----------
  const mainScene = new THREE.Scene();
  const worldMat = new THREE.ShaderMaterial({ vertexShader: FULL_VS, fragmentShader: fixNames(WORLD_FS), uniforms: { ...uniforms, uInvPV: { value: new THREE.Matrix4() }, uCam: { value: v3(0, 0, 0) } }, depthTest: false, depthWrite: false });
  const worldMesh = new THREE.Mesh(quad, worldMat); worldMesh.frustumCulled = false; worldMesh.renderOrder = 0;
  mainScene.add(worldMesh);
  const glassGeo = new THREE.CylinderGeometry(1, 1, 1, 96, 1, false);
  glassGeo.translate(0, 0.5, 0);
  const glassMat = new THREE.ShaderMaterial({ vertexShader: GLASS_VS, fragmentShader: fixNames(GLASS_FS), uniforms: { ...uniforms, uCam: worldMat.uniforms.uCam, uChannels: { value: Q.chan }, uAA: { value: Q.aa || 1 }, uPix: { value: new THREE.Vector2() } }, depthTest: false, depthWrite: false, side: THREE.FrontSide });
  const glassMesh = new THREE.Mesh(glassGeo, glassMat); glassMesh.renderOrder = 1; glassMesh.frustumCulled = false;
  mainScene.add(glassMesh);

  // ---------- caustics ----------
  const causScene = new THREE.Scene();
  let gridGeo = null;
  const causMats = [];
  const causUniforms = { uFootO: { value: new THREE.Vector2() }, uFootA: { value: new THREE.Vector2() }, uFootB: { value: new THREE.Vector2() } };
  const mkCausMat = (mode, chan) => new THREE.ShaderMaterial({
    vertexShader: fixNames(CAUS_VS), fragmentShader: CAUS_FS,
    uniforms: { ...uniforms, ...causUniforms, uMode: { value: mode }, uChan: { value: chan } },
    depthTest: false, depthWrite: false, side: THREE.DoubleSide,
    blending: THREE.CustomBlending, blendEquation: THREE.AddEquation, blendSrc: THREE.OneFactor, blendDst: THREE.OneFactor,
    blendEquationAlpha: THREE.AddEquation, blendSrcAlpha: THREE.ZeroFactor, blendDstAlpha: THREE.OneFactor,
  });
  const gridMesh = new THREE.Mesh(undefined, undefined); gridMesh.frustumCulled = false;
  causScene.add(gridMesh);
  const buildCaus = () => {
    if (gridGeo) gridGeo.dispose();
    gridGeo = new THREE.PlaneGeometry(1, 1, Q.grid - 1, Q.grid - 1);
    gridMesh.geometry = gridGeo;
    causMats.forEach((m) => m.dispose()); causMats.length = 0;
    causMats.push(mkCausMat(0, -1));
    if (Q.causChan > 1) { causMats.push(mkCausMat(1, 0), mkCausMat(1, 1), mkCausMat(1, 2)); } else causMats.push(mkCausMat(1, -1));
  };
  buildCaus();

  // ---------- post ----------
  const postScene = new THREE.Scene();
  const brightMat = new THREE.ShaderMaterial({ vertexShader: FULL_VS, fragmentShader: BRIGHT_FS, uniforms: { tHdr: { value: hdrRT.texture } }, depthTest: false, depthWrite: false });
  const finalMat = new THREE.ShaderMaterial({ vertexShader: FULL_VS, fragmentShader: FINAL_FS, uniforms: { tHdr: { value: hdrRT.texture }, tBloom: { value: bloomRT.texture }, uTexel: { value: new THREE.Vector2() }, uBloomK: { value: 0.9 }, uExposure: { value: 1.3 }, uTime: { value: 0 }, uFade: { value: 1 } }, depthTest: false, depthWrite: false });
  const postMesh = new THREE.Mesh(quad, brightMat); postMesh.frustumCulled = false; postScene.add(postMesh);

  // ---------- state ----------
  const S = {
    w: 1, h: 1, shiftX: 0.0, shiftY: 0.0,
    yaw: 0, pitch: 0.2, dist: 4.1, target: v3(0, 0.36, 0), fov: 24,
    lightAz: -0.52, lightEl: 0.98, ptrX: 0, ptrY: 0, pX: 0, pY: 0,
    drink: 0, drinkT: 0, sweep: 0, fade: 1,
  };
  const goal = { yaw: 0, pitch: 0.2, dist: 4.1, lightAz: -0.52, lightEl: 0.98, drink: 0, tx: 0, ty: 0.36 };
  const D = drinks;
  const cur = { R: D[0].R, W: D[0].W, B: D[0].B, H: D[0].H, Hl: D[0].Hl, F: D[0].F || 0, sig: [...D[0].sigma] };

  function resize() {
    const dpr = Math.min(window.devicePixelRatio || 1, Q.dpr);
    const w = canvas.clientWidth || window.innerWidth; const h = canvas.clientHeight || window.innerHeight;
    S.w = w; S.h = h;
    renderer.setPixelRatio(dpr);
    renderer.setSize(w, h, false);
    const W = Math.max(2, Math.round(w * dpr)); const H = Math.max(2, Math.round(h * dpr));
    hdrRT.setSize(W, H);
    bloomRT.setSize(Math.max(2, W >> 1), Math.max(2, H >> 1));
    finalMat.uniforms.uTexel.value.set(2 / W, 2 / H);
    camera.aspect = w / h;
  }

  function setView({ shiftX = 0, shiftY = 0, dist, fov } = {}) { S.shiftX = shiftX; S.shiftY = shiftY; if (dist) goal.dist = dist; if (fov) S.fov = fov; }
  function setPointer(x, y) { S.ptrX = x; S.ptrY = y; }

  function updateCamera() {
    camera.fov = S.fov;
    camera.updateProjectionMatrix();
    // off-axis shift: the glass sits beside the text without bending the perspective
    camera.projectionMatrix.elements[8] = S.shiftX;
    camera.projectionMatrix.elements[9] = S.shiftY;
    camera.projectionMatrixInverse.copy(camera.projectionMatrix).invert();
    const yaw = S.yaw + S.pX * 0.10; const pitch = S.pitch + S.pY * 0.045;
    const t = S.target;
    camera.position.set(t.x + Math.sin(yaw) * Math.cos(pitch) * S.dist, t.y + Math.sin(pitch) * S.dist, t.z + Math.cos(yaw) * Math.cos(pitch) * S.dist);
    camera.lookAt(t);
    camera.updateMatrixWorld();
    const pv = new THREE.Matrix4().multiplyMatrices(camera.projectionMatrix, camera.matrixWorldInverse);
    worldMat.uniforms.uInvPV.value.copy(pv).invert();
    worldMat.uniforms.uCam.value.copy(camera.position);
  }

  function updateGlass() {
    glassMesh.scale.set(cur.R, cur.H, cur.R);
    glassMesh.updateMatrixWorld();
    U.uR.value = cur.R; U.uW.value = cur.W; U.uB.value = cur.B; U.uH.value = cur.H; U.uHl.value = cur.Hl;
    U.uSigma.value.set(...cur.sig);
    const fl = D[Math.round(goal.drink)].flutes || 0;
    U.uFlute.value.set(fl, cur.F);
  }

  function updateLight() {
    const az = S.lightAz + S.pX * 0.42; const el = S.lightEl - S.pY * 0.10;
    // direction the light travels: from above-behind toward the viewer
    const dir = v3(-Math.sin(az) * Math.cos(el), -Math.sin(el), Math.cos(az) * Math.cos(el)).normalize();
    // make it come from behind the glass (negative z) and fall toward +z
    U.uLightDir.value.copy(dir);
    const sx = (dir.x / -dir.y) * cur.H * 0.5; const sz = (dir.z / -dir.y) * cur.H * 0.5;
    U.uSpot.value.set(dir.x / Math.hypot(dir.x, dir.z) * 0.25, dir.z / Math.hypot(dir.x, dir.z) * 0.25);
    // footprint of the glass shadow on the bar top (a stadium: disc R swept along S), as a rectangle
    const S2x = (dir.x / -dir.y) * cur.H; const S2z = (dir.z / -dir.y) * cur.H;
    const len = Math.hypot(S2x, S2z) || 1e-4;
    const ax = S2x / len; const az2 = S2z / len;
    const m = cur.R * 1.06;
    causUniforms.uFootO.value.set(-ax * m - az2 * -m, -az2 * m + ax * -m);
    // origin = -m along S, -m across (across = (-az2, ax))
    const ox = -ax * m + az2 * m; const oz = -az2 * m - ax * m;
    causUniforms.uFootO.value.set(ox, oz);
    causUniforms.uFootA.value.set(ax * (len + 2 * m), az2 * (len + 2 * m));
    causUniforms.uFootB.value.set(-az2 * 2 * m, ax * 2 * m);
    // caustic map: square around the far end of the shadow, big enough for the focus to land inside
    const size = Math.max(2.4, len + cur.R * 5.0);
    const cx = S2x * 0.55; const cz = S2z * 0.55;
    U.uCausRect.value.set(cx - size / 2, cz - size / 2, size, causRT ? Q.map : 0);
  }

  let ripI = 0;
  function ripple(x = 0, z = 0, amp = 0.0011) {
    const r = U.uRip.value[ripI++ % 4];
    r.set(x, z, U.uTime.value, amp);
  }
  // tap: find where the pointer meets the liquid surface; outside the glass the tap still rings the middle
  const ray = new THREE.Raycaster();
  function tap(ndcX, ndcY) {
    ray.setFromCamera(new THREE.Vector2(ndcX, ndcY), camera);
    const o = ray.ray.origin; const d = ray.ray.direction;
    const t = (cur.Hl - o.y) / d.y;
    const Rin = cur.R - cur.W;
    if (t > 0) { const x = o.x + d.x * t; const z = o.z + d.z * t; if (Math.hypot(x, z) < Rin * 0.98) { ripple(x, z, 0.0014); return true; } }
    // the side of the glass: ring from the side facing the camera
    const cyl = (() => { const a = d.x * d.x + d.z * d.z; const b = o.x * d.x + o.z * d.z; const c = o.x * o.x + o.z * o.z - cur.R * cur.R; const disc = b * b - a * c; if (disc < 0) return -1; return (-b - Math.sqrt(disc)) / a; })();
    if (cyl > 0) { const y = o.y + d.y * cyl; if (y > 0 && y < cur.H) { const x = o.x + d.x * cyl; const z = o.z + d.z * cyl; const k = (Rin * 0.85) / Math.hypot(x, z); ripple(x * k, z * k, 0.0012); return true; } }
    return false;
  }
  function screenOfGlass() {
    const p = v3(0, cur.H * 0.5, 0).project(camera);
    return { x: (p.x * 0.5 + 0.5) * S.w, y: (0.5 - p.y * 0.5) * S.h };
  }

  function renderFrame() {
    updateCamera(); updateGlass(); updateLight();
    if (causRT) {
      renderer.setRenderTarget(causRT);
      renderer.setClearColor(0xffffff, 1); renderer.clear(true, false, false);
      for (const m of causMats) { gridMesh.material = m; renderer.render(causScene, fsCam); }
    }
    renderer.setRenderTarget(hdrRT);
    renderer.setClearColor(0x000000, 1); renderer.clear(true, false, false);
    renderer.render(mainScene, camera);
    if (Q.bloom && floatOK) {
      postMesh.material = brightMat; renderer.setRenderTarget(bloomRT); renderer.render(postScene, fsCam);
      finalMat.uniforms.uBloomK.value = 0.9;
    } else finalMat.uniforms.uBloomK.value = 0;
    postMesh.material = finalMat; renderer.setRenderTarget(null); renderer.render(postScene, fsCam);
  }

  // ---------- loop ----------
  let running = false; let last = 0; let raf = 0; let clock = 0;
  const perf = { n: 0, sum: 0, downgraded: 0 };
  function update(dt) {
    if (!reduced) clock += dt;
    U.uTime.value = clock;
    if (autoSway) { S.ptrX = Math.sin(clock * 0.31) * 0.45; S.ptrY = Math.sin(clock * 0.23) * 0.2; }
    S.pX = damp(S.pX, S.ptrX, 3.2, dt); S.pY = damp(S.pY, S.ptrY, 3.2, dt);
    S.yaw = damp(S.yaw, goal.yaw, 3.0, dt); S.pitch = damp(S.pitch, goal.pitch, 3.0, dt); S.dist = damp(S.dist, goal.dist, 3.0, dt);
    S.target.x = damp(S.target.x, goal.tx, 3.0, dt); S.target.y = damp(S.target.y, goal.ty, 3.0, dt);
    S.lightAz = damp(S.lightAz, goal.lightAz, 2.4, dt); S.lightEl = damp(S.lightEl, goal.lightEl, 2.4, dt);
    blendDrink(dt);
    renderFrame();
  }
  function step(now) {
    raf = requestAnimationFrame(step);
    const dt = Math.min(0.05, (now - (last || now)) / 1000); last = now;
    update(dt);
    if (dt > 0) { perf.n++; perf.sum += dt; }
    if (perf.n >= 90) {
      const avg = perf.sum / perf.n; perf.n = 0; perf.sum = 0;
      if (onStats) onStats({ fps: 1 / avg, quality: Q.name });
      if (avg > 1 / 52 && perf.downgraded < 3) downgrade();
    }
  }
  function blendDrink(dt) {
    const i0 = Math.floor(goal.drink); const i1 = Math.min(D.length - 1, i0 + 1); const f = goal.drink - i0;
    const a = D[i0]; const b = D[i1];
    const k = reduced ? 1 : 1 - Math.exp(-4.0 * dt);
    const tgt = { R: lerp(a.R, b.R, f), W: lerp(a.W, b.W, f), B: lerp(a.B, b.B, f), H: lerp(a.H, b.H, f), Hl: lerp(a.Hl, b.Hl, f), F: lerp(a.F || 0, b.F || 0, f) };
    for (const key of Object.keys(tgt)) cur[key] = lerp(cur[key], tgt[key], k);
    for (let c = 0; c < 3; c++) cur.sig[c] = lerp(cur.sig[c], lerp(a.sigma[c], b.sigma[c], f), k);
    const idx = Math.round(goal.drink);
    if (idx !== S.drink) { S.drink = idx; if (!reduced) ripple(0, 0, 0.0016); }
  }
  const ORDER = ['high', 'mid', 'low', 'min'];
  function downgrade() {
    const i = ORDER.indexOf(Q.name);
    if (i < 0 || i >= ORDER.length - 1) return;
    perf.downgraded++;
    setQuality(ORDER[i + 1]);
  }
  function setQuality(name) {
    Q = { ...QUALITY[name], name };
    U.uDisp.value = Q.chan > 1 ? 0.013 : 0.0;
    glassMat.uniforms.uChannels.value = Q.chan; glassMat.uniforms.uAA.value = Q.aa || 1;
    makeCaus(); buildCaus(); resize();
  }
  Q.name = quality in QUALITY ? quality : 'high';

  function start() { if (running) return; running = true; last = 0; raf = requestAnimationFrame(step); }
  function stop() { running = false; cancelAnimationFrame(raf); }

  resize();
  return {
    renderer, camera, uniforms: U, start, stop, resize, tap, ripple, setView, screenOfGlass,
    get running() { return running; },
    set(p) { // scroll / layout driven goals
      if (p.yaw !== undefined) goal.yaw = p.yaw; if (p.pitch !== undefined) goal.pitch = p.pitch; if (p.dist !== undefined) goal.dist = p.dist;
      if (p.lightAz !== undefined) goal.lightAz = p.lightAz; if (p.lightEl !== undefined) goal.lightEl = p.lightEl;
      if (p.drink !== undefined) goal.drink = Math.max(0, Math.min(D.length - 1, p.drink));
      if (p.tx !== undefined) goal.tx = p.tx; if (p.ty !== undefined) goal.ty = p.ty;
    },
    pointer(x, y) { S.ptrX = x; S.ptrY = y; },
    snap() { // jump to the goals (first frame, reduced motion, captures)
      S.yaw = goal.yaw; S.pitch = goal.pitch; S.dist = goal.dist; S.lightAz = goal.lightAz; S.lightEl = goal.lightEl; S.target.x = goal.tx; S.target.y = goal.ty;
      S.pX = S.ptrX; S.pY = S.ptrY;
      const i0 = Math.floor(goal.drink); const i1 = Math.min(D.length - 1, i0 + 1); const f = goal.drink - i0;
      for (const key of ['R', 'W', 'B', 'H', 'Hl']) cur[key] = lerp(D[i0][key], D[i1][key], f);
      cur.F = lerp(D[i0].F || 0, D[i1].F || 0, f);
      for (let c = 0; c < 3; c++) cur.sig[c] = lerp(D[i0].sigma[c], D[i1].sigma[c], f);
      S.drink = Math.round(goal.drink);
    },
    renderAt(t) { U.uTime.value = t; clock = t; renderFrame(); },
    tick(dt) { update(dt); },
    get clock() { return clock; },
    debugCaus() { // dev: the caustic map itself, 0..4 mapped to black..white
      const m = new THREE.ShaderMaterial({ vertexShader: FULL_VS, fragmentShader: 'uniform sampler2D t; varying vec2 vUv; void main(){ vec3 c = texture2D(t, vUv).rgb; gl_FragColor = vec4(pow(c / 4.0, vec3(0.4545)), 1.0); }', uniforms: { t: { value: causRT && causRT.texture } }, depthTest: false });
      postMesh.material = m; renderer.setRenderTarget(null); renderer.render(postScene, fsCam);
    },
    setTime(t) { clock = t; },
    setQuality, quality: () => Q.name,
    setCoaster(c) { const old = U.uCoasterTex.value; U.uCoasterTex.value = coasterTexture(c); if (old) old.dispose(); },
    dispose() { stop(); renderer.dispose(); },
  };
}
