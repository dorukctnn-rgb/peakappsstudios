/* Tutam demo: procedural bust, hair roots and the surgical-marker plan.
   ---------------------------------------------------------------------------
   The head is a signed-distance sculpture (smooth unions of ellipsoids and
   capsules) meshed with surface nets. Hair roots are cast onto that surface,
   sorted into the zones a hair-transplant plan uses (native horseshoe, the
   thinning area that receives grafts, the donor band at the back), and given
   the timings the page plays against scroll: shave, graft placement, shedding,
   regrowth. No scanned data, no downloads: everything here is computed.

   Runs inside a module worker (headgen-worker.js) or on the main thread.
   The zone maths is mirrored in GLSL inside scene.js; keep the two in sync. */

export const HAIR_CENTER = [0, 0.12, -0.08];
export const HAIR_RADII = [0.80, 0.90, 0.98];

/* ---------------------------------------------------------------- SDF -- */
function smin(a, b, k) { const h = Math.max(k - Math.abs(a - b), 0) / k; return Math.min(a, b) - h * h * k * 0.25; }
function smax(a, b, k) { return -smin(-a, -b, k); }
function ell(x, y, z, cx, cy, cz, rx, ry, rz) {
  const X = (x - cx) / rx, Y = (y - cy) / ry, Z = (z - cz) / rz;
  const k0 = Math.sqrt(X * X + Y * Y + Z * Z);
  const k1 = Math.sqrt(X * X / (rx * rx) + Y * Y / (ry * ry) + Z * Z / (rz * rz));
  return k1 > 1e-9 ? k0 * (k0 - 1) / k1 : -Math.min(rx, ry, rz);
}
function capsule(x, y, z, ax, ay, az, bx, by, bz, r1, r2) {
  const pax = x - ax, pay = y - ay, paz = z - az, bax = bx - ax, bay = by - ay, baz = bz - az;
  let h = (pax * bax + pay * bay + paz * baz) / (bax * bax + bay * bay + baz * baz);
  h = h < 0 ? 0 : h > 1 ? 1 : h;
  const dx = pax - bax * h, dy = pay - bay * h, dz = paz - baz * h;
  return Math.sqrt(dx * dx + dy * dy + dz * dz) - (r1 + (r2 - r1) * h);
}
function rcyl(x, y, z, cy, r, hh, rr) {
  const dxz = Math.sqrt(x * x + z * z) - r + rr, dy = Math.abs(y - cy) - hh + rr;
  const ox = Math.max(dxz, 0), oy = Math.max(dy, 0);
  return Math.min(Math.max(dxz, dy), 0) + Math.sqrt(ox * ox + oy * oy) - rr;
}

const EAR_T = 0.24, EAR_C = Math.cos(EAR_T), EAR_S = Math.sin(EAR_T);

export function sdf(x, y, z) {
  const ax = Math.abs(x);
  // cranium and the upper face volume
  let d = ell(x, y, z, 0, 0.16, -0.10, 0.745, 0.845, 0.935);
  d = smin(d, ell(x, y, z, 0, 0.03, 0.22, 0.665, 0.74, 0.66), 0.12);
  // face: kept soft and simplified, a sculptor's head rather than a portrait.
  // Thirds: hairline to brow, brow to nose base, nose base to chin.
  // The box only skips work where the face terms cannot reach. It reaches back
  // to z -0.46 (lower face volume plus its blend); a tighter box cut the field
  // and left a hard crease down the neck under each ear.
  if (z > -0.48 && y < 0.3 && y > -1.3 && ax < 0.82) {
    d = smin(d, ell(x, y, z, 0, -0.34, 0.30, 0.55, 0.54, 0.54), 0.16);
    d = smin(d, ell(x, y, z, 0, -0.62, 0.22, 0.42, 0.27, 0.48), 0.18);
    d = smin(d, capsule(ax, y, z, 0.33, -0.60, 0.06, 0.11, -0.82, 0.48, 0.08, 0.09), 0.18);
    d = smin(d, ell(x, y, z, 0, -0.81, 0.53, 0.16, 0.115, 0.14), 0.12);
    d = smin(d, ell(ax, y, z, 0.39, -0.24, 0.53, 0.16, 0.11, 0.12), 0.12);
    d = smin(d, ell(x, y, z, 0, -0.02, 0.73, 0.48, 0.115, 0.13), 0.15);
    // soft eye hollows, then closed lids
    d = smax(d, -ell(ax, y, z, 0.245, -0.145, 0.93, 0.145, 0.082, 0.12), 0.09);
    d = smin(d, ell(ax, y, z, 0.245, -0.155, 0.795, 0.112, 0.068, 0.10), 0.06);
    d = smax(d, -ell(ax, y, z, 0.245, -0.162, 0.884, 0.088, 0.0045, 0.028), 0.006);
    // nose
    d = smin(d, capsule(x, y, z, 0, -0.06, 0.835, 0, -0.38, 0.985, 0.045, 0.066), 0.06);
    d = smin(d, ell(ax, y, z, 0.068, -0.41, 0.925, 0.054, 0.044, 0.05), 0.05);
    // lips and the line between them
    d = smin(d, ell(x, y, z, 0, -0.545, 0.83, 0.15, 0.036, 0.05), 0.07);
    d = smin(d, ell(x, y, z, 0, -0.62, 0.815, 0.125, 0.04, 0.05), 0.07);
    d = smax(d, -ell(x, y, z, 0, -0.583, 0.878, 0.15, 0.0055, 0.045), 0.01);
  }
  // ears
  if (ax > 0.5 && y > -0.55 && y < 0.2 && z > -0.42 && z < 0.25) {
    const ly0 = y + 0.17, lz0 = z + 0.08;
    const lx = ax - 0.715 + (z + 0.08) * 0.16;
    const ly = ly0 * EAR_C - lz0 * EAR_S, lz = ly0 * EAR_S + lz0 * EAR_C;
    let e = ell(lx, ly, lz, 0, 0, 0, 0.062, 0.238, 0.148);
    e = smax(e, -ell(lx, ly, lz, 0.058, -0.02, 0.016, 0.05, 0.14, 0.086), 0.02);
    e = Math.min(e, ell(ax, y, z, 0.665, -0.33, -0.07, 0.07, 0.09, 0.08));   // fills the gap behind the lobe
    d = smin(d, e, 0.06);
  }
  // neck, cut clean, on a two-step socle
  if (y < 0.2) {
    d = smin(d, capsule(x, y, z, 0, -0.36, -0.22, 0, -1.5, -0.08, 0.44, 0.62), 0.2);
    d = smax(d, -(y + 1.42), 0.03);
    const zz = z + 0.07;
    if (y < -1.25) {
      d = smin(d, rcyl(x, y, zz, -1.51, 0.64, 0.09, 0.03), 0.03);
      d = smin(d, rcyl(x, y, zz, -1.67, 0.74, 0.075, 0.022), 0.008);
    }
  }
  return d;
}

/* ---------------------------------------------------------- zone maths --
   Angles around the hair centre: th from the top (0) down, az from the face
   (0) round to the back (pi). The tables are mirrored in scene.js. */
const CAP_A = [0.00, 0.40, 0.62, 0.95, 1.16, 1.30, 1.44, 1.78, 2.06, 2.45, 3.1416];
const CAP_T = [1.07, 1.03, 1.09, 1.36, 1.80, 1.74, 1.52, 1.54, 1.86, 2.04, 2.16];
const NAT_A = [0.00, 0.82, 0.88, 1.06, 1.32, 3.1416];
const NAT_T = [9.00, 9.00, 1.95, 1.48, 1.22, 1.24];
function table(xs, ys, x) {
  if (x <= xs[0]) return ys[0];
  for (let i = 1; i < xs.length; i++) {
    if (x <= xs[i]) { const t = (x - xs[i - 1]) / (xs[i] - xs[i - 1]); return ys[i - 1] + (ys[i] - ys[i - 1]) * t; }
  }
  return ys[ys.length - 1];
}
const irregular = (az) => 0.016 * Math.sin(az * 7.0 + 1.3) + 0.008 * Math.sin(az * 19.0 + 0.4) + 0.004 * Math.sin(az * 47.0 + 2.1);
export const capTheta = (az) => table(CAP_A, CAP_T, Math.abs(az)) + irregular(az);
const capSmooth = (az) => table(CAP_A, CAP_T, Math.abs(az));
export const natTheta = (az) => table(NAT_A, NAT_T, Math.abs(az)) + irregular(az * 1.7) * 1.5;
const sstep = (a, b, x) => { const t = Math.min(Math.max((x - a) / (b - a), 0), 1); return t * t * (3 - 2 * t); };

function angles(px, py, pz) {
  const x = px - HAIR_CENTER[0], y = py - HAIR_CENTER[1], z = pz - HAIR_CENTER[2];
  const l = Math.sqrt(x * x + y * y + z * z) || 1;
  return { th: Math.acos(Math.max(-1, Math.min(1, y / l))), az: Math.atan2(x, z) };
}
function dirFromAngles(th, az) { return [Math.sin(th) * Math.sin(az), Math.cos(th), Math.sin(th) * Math.cos(az)]; }

/* ----------------------------------------------------- seeded random -- */
function rng(seed) { let s = seed >>> 0; return () => { s = (s + 0x6D2B79F5) >>> 0; let t = s; t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; }; }

/* --------------------------------------------------- surface helpers -- */
function grad(x, y, z, e, out) {
  out[0] = sdf(x + e, y, z) - sdf(x - e, y, z);
  out[1] = sdf(x, y + e, z) - sdf(x, y - e, z);
  out[2] = sdf(x, y, z + e) - sdf(x, y, z - e);
  const l = Math.hypot(out[0], out[1], out[2]) || 1;
  out[0] /= l; out[1] /= l; out[2] /= l;
  return out;
}
// March from outside the head toward the hair centre until the surface.
function castToSurface(dx, dy, dz) {
  let t = 1.9;
  for (let i = 0; i < 90; i++) {
    const x = HAIR_CENTER[0] + dx * t, y = HAIR_CENTER[1] + dy * t, z = HAIR_CENTER[2] + dz * t;
    const d = sdf(x, y, z);
    if (d < 2e-4) return [x, y, z];
    t -= Math.max(d * 0.8, 4e-4);
    if (t < 0.2) return null;
  }
  return null;
}
const inEarZone = (x, y, z) => Math.abs(x) > 0.66 && y < 0.1 && y > -0.52 && z > -0.36 && z < 0.2;

/* ------------------------------------------------------- surface nets -- */
function meshHead(h) {
  const x0 = -0.95, y0 = -1.8, z0 = -1.12, x1 = 0.95, y1 = 1.1, z1 = 1.2;
  const nx = Math.ceil((x1 - x0) / h) + 1, ny = Math.ceil((y1 - y0) / h) + 1, nz = Math.ceil((z1 - z0) / h) + 1;
  // Coarse pass, then exact values only near the surface.
  const H = h * 4, cx = Math.ceil((x1 - x0) / H) + 2, cy = Math.ceil((y1 - y0) / H) + 2, cz = Math.ceil((z1 - z0) / H) + 2;
  const coarse = new Float32Array(cx * cy * cz);
  for (let k = 0; k < cz; k++) for (let j = 0; j < cy; j++) for (let i = 0; i < cx; i++)
    coarse[i + cx * (j + cy * k)] = sdf(x0 + i * H, y0 + j * H, z0 + k * H);
  const vals = new Float32Array(nx * ny * nz);
  const band = H * 2.2;
  for (let k = 0; k < nz; k++) {
    const z = z0 + k * h, fk = (z - z0) / H, ck = Math.min(Math.floor(fk), cz - 2), tk = fk - ck;
    for (let j = 0; j < ny; j++) {
      const y = y0 + j * h, fj = (y - y0) / H, cj = Math.min(Math.floor(fj), cy - 2), tj = fj - cj;
      for (let i = 0; i < nx; i++) {
        const x = x0 + i * h, fi = (x - x0) / H, ci = Math.min(Math.floor(fi), cx - 2), ti = fi - ci;
        const c = (a, b, e) => coarse[(ci + a) + cx * ((cj + b) + cy * (ck + e))];
        const v = (1 - tk) * ((1 - tj) * ((1 - ti) * c(0, 0, 0) + ti * c(1, 0, 0)) + tj * ((1 - ti) * c(0, 1, 0) + ti * c(1, 1, 0)))
          + tk * ((1 - tj) * ((1 - ti) * c(0, 0, 1) + ti * c(1, 0, 1)) + tj * ((1 - ti) * c(0, 1, 1) + ti * c(1, 1, 1)));
        vals[i + nx * (j + ny * k)] = Math.abs(v) < band ? sdf(x, y, z) : v;
      }
    }
  }
  const V = (i, j, k) => vals[i + nx * (j + ny * k)];
  const cnx = nx - 1, cny = ny - 1;
  const cellVert = new Int32Array((nx - 1) * (ny - 1) * (nz - 1)).fill(-1);
  const pos = [];
  const corners = [[0, 0, 0], [1, 0, 0], [0, 1, 0], [1, 1, 0], [0, 0, 1], [1, 0, 1], [0, 1, 1], [1, 1, 1]];
  const edges = [[0, 1], [2, 3], [4, 5], [6, 7], [0, 2], [1, 3], [4, 6], [5, 7], [0, 4], [1, 5], [2, 6], [3, 7]];
  const cv = new Float32Array(8);
  for (let k = 0; k < nz - 1; k++) for (let j = 0; j < ny - 1; j++) for (let i = 0; i < nx - 1; i++) {
    let mask = 0;
    for (let c = 0; c < 8; c++) { const o = corners[c]; cv[c] = V(i + o[0], j + o[1], k + o[2]); if (cv[c] < 0) mask |= 1 << c; }
    if (mask === 0 || mask === 255) continue;
    let sx = 0, sy = 0, sz = 0, n = 0;
    for (const [a, b] of edges) {
      const va = cv[a], vb = cv[b];
      if ((va < 0) === (vb < 0)) continue;
      const t = va / (va - vb), A = corners[a], B = corners[b];
      sx += A[0] + (B[0] - A[0]) * t; sy += A[1] + (B[1] - A[1]) * t; sz += A[2] + (B[2] - A[2]) * t; n++;
    }
    cellVert[i + cnx * (j + cny * k)] = pos.length / 3;
    pos.push(x0 + (i + sx / n) * h, y0 + (j + sy / n) * h, z0 + (k + sz / n) * h);
  }
  const cid = (i, j, k) => cellVert[i + cnx * (j + cny * k)];
  const idx = [];
  const quad = (a, b, c, d, flip) => {
    if (a < 0 || b < 0 || c < 0 || d < 0) return;
    if (flip) idx.push(a, c, b, a, d, c); else idx.push(a, b, c, a, c, d);
  };
  for (let k = 1; k < nz - 1; k++) for (let j = 1; j < ny - 1; j++) for (let i = 0; i < nx - 1; i++) {
    const a = V(i, j, k) < 0, b = V(i + 1, j, k) < 0;
    if (a === b) continue;
    quad(cid(i, j - 1, k - 1), cid(i, j, k - 1), cid(i, j, k), cid(i, j - 1, k), !a);
  }
  for (let k = 1; k < nz - 1; k++) for (let j = 0; j < ny - 1; j++) for (let i = 1; i < nx - 1; i++) {
    const a = V(i, j, k) < 0, b = V(i, j + 1, k) < 0;
    if (a === b) continue;
    quad(cid(i - 1, j, k - 1), cid(i - 1, j, k), cid(i, j, k), cid(i, j, k - 1), !a);
  }
  for (let k = 0; k < nz - 1; k++) for (let j = 1; j < ny - 1; j++) for (let i = 1; i < nx - 1; i++) {
    const a = V(i, j, k) < 0, b = V(i, j, k + 1) < 0;
    if (a === b) continue;
    quad(cid(i - 1, j - 1, k), cid(i, j - 1, k), cid(i, j, k), cid(i - 1, j, k), !a);
  }
  // One projection step onto the true surface, normals from the field.
  const nv = pos.length / 3;
  const P = new Float32Array(nv * 3), N = new Float32Array(nv * 3), g = [0, 0, 0];
  for (let v = 0; v < nv; v++) {
    let x = pos[v * 3], y = pos[v * 3 + 1], z = pos[v * 3 + 2];
    grad(x, y, z, h * 0.35, g);
    const d = sdf(x, y, z);
    x -= g[0] * d; y -= g[1] * d; z -= g[2] * d;
    P[v * 3] = x; P[v * 3 + 1] = y; P[v * 3 + 2] = z;
    N[v * 3] = g[0]; N[v * 3 + 1] = g[1]; N[v * 3 + 2] = g[2];
  }
  // Ambient occlusion from the field itself: how quickly free space opens up
  // along the normal. Gives eye sockets, ears and the jaw line their depth.
  const AO = new Float32Array(nv);
  for (let v = 0; v < nv; v++) {
    const x = P[v * 3], y = P[v * 3 + 1], z = P[v * 3 + 2], a = N[v * 3], b = N[v * 3 + 1], c = N[v * 3 + 2];
    let occ = 0, sca = 1;
    for (let i = 1; i <= 5; i++) {
      const hh = 0.012 + 0.075 * i / 5;
      occ += (hh - sdf(x + a * hh, y + b * hh, z + c * hh)) * sca;
      sca *= 0.82;
    }
    AO[v] = Math.max(0, Math.min(1, 1 - 2.6 * occ));
  }
  const I = nv > 65535 ? new Uint32Array(idx) : new Uint16Array(idx);
  return { positions: P, normals: N, indices: I, ao: AO };
}

/* ------------------------------------------------------------- roots --
   Strand record, 17 floats:
   0-2 root  3-5 normal  6-8 flow (unit tangent)
   9 kind: 0 native, 1 native taken for grafts (donor site), 2 graft hair, 3 graft lead hair (draws the red dot)
   10 seedA  11 seedB  12 tAppear (grafts) / tShave (native)  13 tStart regrowth
   14 tShed  15 style length  16 length before the procedure (0 = not there) */
export const STRIDE = 17;

function tangentFlow(p, n) {
  const u = [p[0] - HAIR_CENTER[0], p[1] - HAIR_CENTER[1], p[2] - HAIR_CENTER[2]];
  const ul = Math.hypot(u[0], u[1], u[2]); u[0] /= ul; u[1] /= ul; u[2] /= ul;
  const { th, az } = angles(p[0], p[1], p[2]);
  const W = [0.14, 0.60, -0.79];                    // crown whorl direction
  const proj = (v) => { const k = v[0] * n[0] + v[1] * n[1] + v[2] * n[2]; return [v[0] - n[0] * k, v[1] - n[1] * k, v[2] - n[2] * k]; };
  const norm = (v) => { const l = Math.hypot(v[0], v[1], v[2]) || 1; return [v[0] / l, v[1] / l, v[2] / l]; };
  const away = norm(proj([u[0] - W[0], u[1] - W[1], u[2] - W[2]]));
  const down = norm(proj([0, -1, 0]));
  const wd = u[0] * W[0] + u[1] * W[1] + u[2] * W[2];
  const swirlW = Math.exp(-Math.acos(Math.min(1, wd)) / 0.2) * 1.6;
  const swirl = norm([n[1] * away[2] - n[2] * away[1], n[2] * away[0] - n[0] * away[2], n[0] * away[1] - n[1] * away[0]]);
  // top: swept back with a slight side sweep, so the new hairline shows
  const back = norm(proj([-0.28, 0.15, -1]));
  const crown = sstep(0.55, 0.15, Math.acos(Math.max(-1, Math.min(1, wd))));   // near the whorl: radial
  const side = sstep(1.0, 1.65, th);                  // sides and back fall
  let f = [0, 0, 0];
  for (let i = 0; i < 3; i++) {
    const top = back[i] * (1 - crown) + away[i] * crown;
    f[i] = top * (1 - side) + down[i] * side * 1.25 + swirl[i] * swirlW;
  }
  return norm(proj(f));
}

function styleLength(th, az) {
  const top = 1 - sstep(1.0, 1.55, th);
  let L = 0.145 + 0.205 * top;
  if (th > 1.8) L *= 0.78;
  if (Math.abs(az) > 2.4 && th < 1.3) L *= 0.92;   // crown a touch shorter
  return L;
}

function makeRoots(budget, seed) {
  const R = rng(seed);
  const out = [];
  const g = [0, 0, 0];
  // Area estimate per zone, so the budget is split by what each zone covers.
  const probe = 6000; let nat = 0, tr = 0;
  for (let i = 0; i < probe; i++) {
    const y = 1 - (i + 0.5) / probe * 2, r = Math.sqrt(1 - y * y), ph = i * 2.399963;
    const th = Math.acos(y), az = Math.atan2(Math.sin(ph) * r, Math.cos(ph) * r);
    if (th > capTheta(az) + 0.02) continue;
    if (th > natTheta(az)) nat++; else tr++;
  }
  const graftFrac = tr / (nat + tr);
  const nativeTarget = Math.round(budget * (1 - graftFrac) * 0.98);
  const graftStrands = budget - nativeTarget;
  const strandsPerGraft = 2.25;
  const graftTarget = Math.round(graftStrands / strandsPerGraft);
  const hairlineDir = dirFromAngles(capTheta(0), 0);
  const crownDir = dirFromAngles(0.92, Math.PI);

  function fib(nTotal, accept) {
    const res = [];
    for (let i = 0; i < nTotal; i++) {
      const y = 1 - (i + R()) / nTotal * 2, r = Math.sqrt(Math.max(0, 1 - y * y)), ph = i * 2.399963 + R() * 0.6;
      const d = [Math.cos(ph) * r, y, Math.sin(ph) * r];
      const th = Math.acos(y), az = Math.atan2(d[0], d[2]);
      const a = accept(th, az);
      if (!a || R() > a) continue;
      res.push([d, th, az]);
    }
    return res;
  }
  const capP = (th, az) => sstep(capTheta(az) + 0.035, capTheta(az) - 0.045, th);
  const natP = (th, az) => sstep(natTheta(az) - 0.05, natTheta(az) + 0.07, th);

  // native horseshoe
  const nWanted = nativeTarget;
  const nat2 = fib(Math.round(nWanted / Math.max(0.05, (1 - graftFrac)) / 0.62 * 1.1), (th, az) => capP(th, az) * natP(th, az));
  for (const [d, th, az] of nat2.slice(0, nWanted)) {
    const p = castToSurface(d[0], d[1], d[2]);
    if (!p || inEarZone(p[0], p[1], p[2])) continue;
    const n = grad(p[0], p[1], p[2], 0.006, g).slice();
    const L = styleLength(th, Math.abs(az)) * (0.88 + R() * 0.24);
    const donor = th > 1.36 && th < 1.95 && Math.abs(az) > 1.75;
    const taken = donor && R() < 0.17;
    const sweep = Math.abs(az) / Math.PI;             // clippers go back to front
    out.push(p[0], p[1], p[2], n[0], n[1], n[2], ...tangentFlow(p, n),
      taken ? 1 : 0, R(), R(), -0.58 + (1 - sweep) * 0.12 + R() * 0.015, -0.42, 0, L, L);
  }
  // graft area: centres, then 1 to 4 hairs each
  const grafts = fib(Math.round(graftTarget / Math.max(0.05, graftFrac) / 0.62 * 1.1), (th, az) => capP(th, az) * (1 - natP(th, az)));
  const whorl = [0.14, 0.60, -0.79];
  for (const [d, th, az] of grafts.slice(0, graftTarget)) {
    const p = castToSurface(d[0], d[1], d[2]);
    if (!p || inEarZone(p[0], p[1], p[2])) continue;
    const n = grad(p[0], p[1], p[2], 0.006, g).slice();
    // placement order: a wave from the drawn hairline back to the crown
    const dh = Math.acos(Math.min(1, d[0] * hairlineDir[0] + d[1] * hairlineDir[1] + d[2] * hairlineDir[2]));
    const dc = Math.acos(Math.min(1, d[0] * crownDir[0] + d[1] * crownDir[1] + d[2] * crownDir[2]));
    const order = Math.min(1, dh / (dh + dc + 1e-3) * 1.08);
    const tAppear = -0.27 + order * 0.25 + R() * 0.012;
    // diffuse thinning: miniaturised hairs remain near the horseshoe edge
    const edge = natTheta(az) - th;
    const keepP = 0.07 + 0.42 * Math.exp(-Math.max(edge, 0) / 0.14);
    // the very front of the new hairline is finer and shorter, as it is when done well
    const soft = 0.55 + 0.45 * sstep(capTheta(az) - 0.02, capTheta(az) - 0.16, th) + 0.45 * sstep(0.9, 1.4, Math.abs(az));
    const L = styleLength(th, Math.abs(az)) * Math.min(1, soft);
    const count = [1, 2, 2, 2, 3, 3, 4][Math.floor(R() * 7)];
    const wl = Math.acos(Math.max(-1, Math.min(1, d[0] * whorl[0] + d[1] * whorl[1] + d[2] * whorl[2])));
    const frontEdge = Math.max(0, 1 - Math.abs(az) / 1.1) * sstep(capTheta(az) - 0.32, capTheta(az) - 0.02, th);
    const flat = Math.min(0.99, Math.exp(-wl / 0.22) + frontEdge * 0.6);
    const flow = tangentFlow(p, n);
    const t1 = [n[1] * flow[2] - n[2] * flow[1], n[2] * flow[0] - n[0] * flow[2], n[0] * flow[1] - n[1] * flow[0]];
    for (let c = 0; c < count; c++) {
      const ox = (R() - 0.5) * 0.012, oy = (R() - 0.5) * 0.012;
      const q = [p[0] + flow[0] * ox + t1[0] * oy, p[1] + flow[1] * ox + t1[1] * oy, p[2] + flow[2] * ox + t1[2] * oy];
      const tStart = 2.55 + 6.2 * Math.pow(R(), 1.12);
      const keep = R() < keepP;
      out.push(q[0], q[1], q[2], n[0], n[1], n[2], flow[0], flow[1], flow[2],
        (c === 0 ? 3 : 2) + flat * 0.49, R(), R(), tAppear, tStart, 0.32 + R() * 0.8, L * (0.92 + R() * 0.16), keep ? L * (0.3 + R() * 0.25) : 0);
    }
  }
  return new Float32Array(out);
}

/* ------------------------------------------------- marker plan curves -- */
function surfacePoint(th, az) {
  const d = dirFromAngles(th, az);
  const p = castToSurface(d[0], d[1], d[2]);
  if (!p) return null;
  const n = grad(p[0], p[1], p[2], 0.006, [0, 0, 0]);
  return { p, n };
}
function makeMarker() {
  const curves = [];
  // the new hairline, temple to temple
  const hl = [];
  for (let i = 0; i <= 120; i++) { const az = -1.02 + 2.04 * i / 120; hl.push(surfacePoint(capSmooth(az) + 0.012, az)); }
  curves.push({ pts: hl, u0: 0, u1: 0.46, dash: 0, w: 0.011 });
  // crown, an oval around the whorl
  const cDir = dirFromAngles(0.93, Math.PI);
  const e1 = [1, 0, 0];
  const e2 = [cDir[1] * e1[2] - cDir[2] * e1[1], cDir[2] * e1[0] - cDir[0] * e1[2], cDir[0] * e1[1] - cDir[1] * e1[0]];
  const cr = [];
  for (let i = 0; i <= 90; i++) {
    const ps = i / 90 * Math.PI * 2 + 0.6, rx = 0.36, ry = 0.30;
    const v = [cDir[0] + (e1[0] * Math.cos(ps) * rx + e2[0] * Math.sin(ps) * ry), cDir[1] + (e1[1] * Math.cos(ps) * rx + e2[1] * Math.sin(ps) * ry), cDir[2] + (e1[2] * Math.cos(ps) * rx + e2[2] * Math.sin(ps) * ry)];
    const l = Math.hypot(v[0], v[1], v[2]);
    const p = castToSurface(v[0] / l, v[1] / l, v[2] / l);
    if (p) cr.push({ p, n: grad(p[0], p[1], p[2], 0.006, [0, 0, 0]) });
  }
  curves.push({ pts: cr, u0: 0.48, u1: 0.70, dash: 0, w: 0.009 });
  // donor band, upper and lower limit, dashed
  for (const [th, u0, u1] of [[1.40, 0.72, 0.86], [1.93, 0.86, 1.0]]) {
    const pts = [];
    for (let i = 0; i <= 100; i++) { const t = i / 100, az = (2.02 + (Math.PI * 2 - 4.04) * t) ; pts.push(surfacePoint(th, az > Math.PI ? az - Math.PI * 2 : az)); }
    curves.push({ pts, u0, u1, dash: 1, w: 0.008 });
  }
  const P = [], U = [], A = [], DSH = [], IDX = [];
  for (const c of curves) {
    const pts = c.pts.filter(Boolean);
    const base = P.length / 3;
    for (let i = 0; i < pts.length; i++) {
      const a = pts[Math.max(0, i - 1)].p, b = pts[Math.min(pts.length - 1, i + 1)].p, { p, n } = pts[i];
      let t = [b[0] - a[0], b[1] - a[1], b[2] - a[2]]; const tl = Math.hypot(...t) || 1; t = t.map((v) => v / tl);
      let s = [n[1] * t[2] - n[2] * t[1], n[2] * t[0] - n[0] * t[2], n[0] * t[1] - n[1] * t[0]];
      const u = c.u0 + (c.u1 - c.u0) * i / (pts.length - 1);
      for (const side of [-1, 1]) {
        P.push(p[0] + n[0] * 0.004 + s[0] * c.w * side, p[1] + n[1] * 0.004 + s[1] * c.w * side, p[2] + n[2] * 0.004 + s[2] * c.w * side);
        U.push(u); A.push(side); DSH.push(c.dash ? i / (pts.length - 1) * 26 : -1);
      }
      if (i > 0) { const q = base + (i - 1) * 2; IDX.push(q, q + 1, q + 3, q, q + 3, q + 2); }
    }
  }
  return { positions: new Float32Array(P), u: new Float32Array(U), across: new Float32Array(A), dash: new Float32Array(DSH), indices: new Uint16Array(IDX) };
}

function anchors() {
  const a = (th, az) => { const s = surfacePoint(th, az); return s ? [...s.p, ...s.n] : null; };
  return { hairline: a(capTheta(0) + 0.02, 0.0), crown: a(0.93, Math.PI), donor: a(1.52, Math.PI) };
}

export function generate({ cell = 0.026, strands = 30000, seed = 7 } = {}) {
  const t0 = (typeof performance !== 'undefined' ? performance.now() : Date.now());
  const now = () => (typeof performance !== 'undefined' ? performance.now() : Date.now());
  const a = now(); const head = meshHead(cell);
  const b = now(); const roots = makeRoots(strands, seed);
  const c = now(); const marker = makeMarker();
  const parts = { mesh: Math.round(b - a), roots: Math.round(c - b), marker: Math.round(now() - c) };
  const t1 = (typeof performance !== 'undefined' ? performance.now() : Date.now());
  return { head, roots, marker, anchors: anchors(), ms: Math.round(t1 - t0), parts };
}
