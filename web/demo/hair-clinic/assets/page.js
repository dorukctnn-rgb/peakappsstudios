/* Tutam demo: page glue.
   Scroll is the calendar. This file turns the scroll position into a story
   state (months since the procedure, camera, head turn, marker ink), smooths
   it, hands it to the live head, drives the month rail, the plan labels, the
   poster fallback and the demo dialog. The scrollcraft engine pins the acts
   and fades the copy; it is used as shipped. */
const doc = document.documentElement;
const reduce = matchMedia('(prefers-reduced-motion: reduce)').matches;
const fine = matchMedia('(hover: hover) and (pointer: fine)').matches;
const params = new URLSearchParams(location.search);
const CAPTURE = params.has('capture');
const phoneMQ = matchMedia('(max-width: 760px), (max-aspect-ratio: 4/5)');
const isPhone = () => phoneMQ.matches;
if (CAPTURE) doc.classList.add('capture');

/* ------------------------------------------------------- story keyframes --
   Per act, keyed to pinned progress p. Values fill forward; `m` overrides the
   composition on phones (head above the copy instead of beside it). */
const ACTS = [
  { id: 'before', kf: [
    [0, { T: -1, az: 158, el: 27, dist: 1.1, yaw: 0, ty: 0.02, ox: 0.2, oy: 0.02, draw: 0, ink: 0, m: { ox: -0.05, oy: -0.17, dist: 1.04 } }],
    [1, { az: 170, el: 33 }]] },
  { id: 'thinning', kf: [
    [0, { az: 214, el: 34, ox: -0.17, oy: 0.01, m: { ox: -0.08, oy: -0.19, dist: 1.1 } }],
    [0.55, { az: 262, el: 26 }],
    [1, { T: -0.95, az: 268, el: 30 }]] },
  { id: 'day-0', kf: [
    [0, { T: -0.72, az: 262, el: 40, ox: 0.18, oy: 0.03, m: { ox: -0.07, oy: -0.19, dist: 1.08 } }],
    [0.24, { T: -0.42, az: 238, el: 42 }],
    [0.32, { draw: 0, ink: 1 }],
    [0.58, { T: -0.29, az: 382, el: 54, draw: 0.8 }],
    [0.68, { draw: 1 }],
    [0.92, { T: 0.0, az: 386, el: 52 }],
    [1, { T: 0.04 }]] },
  { id: 'months', kf: [
    [0, { T: 0.85, az: 390, el: 50, ox: 0.13, oy: 0.04, ink: 0, m: { ox: 0.02, oy: -0.13, dist: 1.12 } }],
    [0.04, { T: 1, az: 394, el: 48 }],
    [0.21, { T: 3, az: 414, el: 42 }],
    [0.40, { T: 6, az: 448, el: 36 }],
    [0.60, { T: 9, az: 482, el: 33 }],
    [0.79, { T: 12, az: 510, el: 30, ox: 0.19, oy: 0.03, m: { ox: -0.02, oy: -0.14 } }],
    [1, { az: 516, el: 29 }]] },
  // the close: a three-quarter view, the face turned toward the copy, so the
  // finished hairline reads in profile instead of a mannequin staring back
  { id: 'consult', kf: [
    [0, { yaw: 30, az: 517, el: 25 }],
    [0.55, { yaw: 97, el: 17, ty: -0.1, dist: 1.0, ox: 0.2, oy: 0.03, m: { ox: -0.04, oy: -0.3, dist: 1.5 } }],
    [1, { yaw: 100, el: 16 }]] },
];
const FIELDS = ['T', 'az', 'el', 'dist', 'yaw', 'ty', 'ox', 'oy', 'draw', 'ink'];
const EPS = { T: 0.002, az: 0.05, el: 0.05, dist: 0.0005, yaw: 0.05, ty: 0.0005, ox: 0.0005, oy: 0.0005, draw: 0.002, ink: 0.002 };
const GO = { before: ['before', 0], day0: ['day-0', 0.62], m1: ['months', 0.04], m3: ['months', 0.21], m6: ['months', 0.40], m9: ['months', 0.60], m12: ['months', 0.79] };

let track = [];
let geo = {};
function layoutTrack() {
  const vh = innerHeight, phone = isPhone();
  track = []; geo = {};
  let last = {};
  for (const act of ACTS) {
    const el = document.getElementById(act.id);
    const top = el.getBoundingClientRect().top + scrollY, h = el.offsetHeight;
    const y0 = top, y1 = top + Math.max(h - vh, 1);
    geo[act.id] = { y0, y1 };
    for (const [p, v] of act.kf) {
      const val = { ...last, ...v, ...(phone && v.m ? v.m : {}) };
      delete val.m;
      last = val;
      track.push({ y: y0 + p * (y1 - y0), v: val });
    }
  }
}
const sstep = (x) => x * x * (3 - 2 * x);
function sample(y) {
  if (!track.length) return null;
  if (y <= track[0].y) return { ...track[0].v };
  for (let i = 1; i < track.length; i++) {
    const a = track[i - 1], b = track[i];
    if (y <= b.y) {
      const t = sstep(Math.min(1, Math.max(0, (y - a.y) / Math.max(b.y - a.y, 1))));
      const o = {};
      for (const f of FIELDS) o[f] = a.v[f] + (b.v[f] - a.v[f]) * t;
      return o;
    }
  }
  return { ...track[track.length - 1].v };
}
const actP = (id) => { const g = geo[id]; return g ? Math.min(1, Math.max(0, (scrollY - g.y0) / (g.y1 - g.y0))) : 0; };

/* ------------------------------------------------------------ the rail -- */
const rail = document.querySelector('.rail');
const railFill = rail.querySelector('.rail__fill'), railDot = rail.querySelector('.rail__dot');
const railItems = [...rail.querySelectorAll('li')];
// Stops sit close to their place on a twelve-month line, eased apart just
// enough that day 0 and month 1 stay separate tap targets on a short phone rail.
// The stops themselves are placed in tutam.css (same fractions), so they are
// in place on the first paint.
const RAIL_T = [-1, 0, 1, 3, 6, 9, 12], RAIL_F = [0, 0.14, 0.26, 0.42, 0.62, 0.81, 1];
const railFrac = (T) => {
  if (T <= RAIL_T[0]) return 0;
  for (let i = 1; i < RAIL_T.length; i++) if (T <= RAIL_T[i]) return RAIL_F[i - 1] + (RAIL_F[i] - RAIL_F[i - 1]) * (T - RAIL_T[i - 1]) / (RAIL_T[i] - RAIL_T[i - 1]);
  return 1;
};
let lastRail = '';
function updateRail(T) {
  const f = railFrac(T);
  const h = rail.querySelector('.rail__track').getBoundingClientRect().height;
  railFill.style.transform = `scaleY(${f.toFixed(4)})`;
  railDot.style.transform = `translateY(${(f * h).toFixed(1)}px)`;
  // the current stop: the last one the calendar has reached
  let cur = railItems[0];
  for (const li of railItems) if (T >= parseFloat(li.dataset.t) - 0.35) cur = li;
  if (cur.dataset.t !== lastRail) {
    lastRail = cur.dataset.t;
    railItems.forEach((li) => { const a = li.querySelector('a'); if (li === cur) a.setAttribute('aria-current', 'step'); else a.removeAttribute('aria-current'); });
  }
}
rail.addEventListener('click', (e) => {
  const a = e.target.closest('a[data-go]');
  if (!a) return;
  const [id, p] = GO[a.dataset.go];
  const g = geo[id];
  if (!g) return;
  e.preventDefault();
  window.scrollTo({ top: Math.round(g.y0 + p * (g.y1 - g.y0)), behavior: reduce ? 'instant' : 'smooth' });
});

/* ------------------------------------------------------------- posters -- */
/* The stills are the page until the live head takes over, and the whole film
   with reduced motion or without WebGL. Only the first is in the HTML; the
   others load as the reader nears them, and a still is shown only once it
   has decoded, so a stop never flashes an empty frame. */
const posters = [...document.querySelectorAll('.scene__posters img')];
const posterAt = Object.fromEntries(posters.map((img) => [img.dataset.stop, img]));
const STOPS = posters.map((img) => img.dataset.stop);
let live = false;
function ensurePoster(img) {
  if (!img || img.getAttribute('src') || !img.dataset.srcD) return;
  img.src = isPhone() ? img.dataset.srcM : img.dataset.srcD;
}
let shownStop = 'before';
function showPoster(stop) {
  const img = posterAt[stop];
  const show = () => { if (lastPoster === stop) { shownStop = stop; posters.forEach((p) => p.classList.toggle('is-on', p === img)); kick(); } };
  ensurePoster(img);
  if (img.complete && img.naturalWidth) show();
  else img.decode().then(show, () => {});
  if (!live) { const i = STOPS.indexOf(stop); ensurePoster(posterAt[STOPS[i + 1]]); ensurePoster(posterAt[STOPS[i - 1]]); }
}
// Where each still was rendered (act, pinned progress). Resting there, the
// still and the live head are the same picture.
const STILL_AT = { before: ['before', 0], thin: ['thinning', 0.55], day0: ['day-0', 0.92], m1: ['months', 0.04], m3: ['months', 0.21], m6: ['months', 0.4], m9: ['months', 0.6], m12: ['months', 0.79], close: ['consult', 1] };
const stillY = (stop) => { const [id, p] = STILL_AT[stop]; const g = geo[id]; return Math.round(g.y0 + p * (g.y1 - g.y0)); };
function onStill(s) {
  const img = posterAt[lastPoster];
  if (!img || !img.classList.contains('is-on') || !img.complete) return false;
  const t = sample(stillY(lastPoster));
  return Math.abs(t.az - s.az) < 4 && Math.abs(t.el - s.el) < 3 && Math.abs(t.yaw - s.yaw) < 4 && Math.abs(t.T - s.T) < 0.3
    && Math.abs(t.ox - s.ox) < 0.02 && Math.abs(t.oy - s.oy) < 0.02 && Math.abs(t.dist - s.dist) < 0.03 && Math.abs(t.draw - s.draw) < 0.1;
}
let lastPoster = 'before';
function stopFor(s) {
  let stop = 'before';
  if (actP('consult') > 0.3 && scrollY > geo.consult.y0 - 1) stop = 'close';
  else if (s.T >= 10.5) stop = 'm12';
  else if (s.T >= 7.5) stop = 'm9';
  else if (s.T >= 4.5) stop = 'm6';
  else if (s.T >= 2) stop = 'm3';
  else if (s.T >= 0.5) stop = 'm1';
  else if (scrollY > geo['day-0'].y0 - innerHeight * 0.5) stop = 'day0';
  else if (scrollY > geo.thinning.y0 - innerHeight * 0.5) stop = 'thin';
  return stop;
}
function updatePosters(s, force) {
  const stop = stopFor(s);
  if (stop === lastPoster && !force) return;
  lastPoster = stop;
  if (live) { posters.forEach((img) => img.classList.toggle('is-on', img.dataset.stop === stop && !!img.getAttribute('src'))); return; }
  showPoster(stop);
}

/* -------------------------------------------------------- plan labels -- */
const tags = [...document.querySelectorAll('.tag')];
let anchors = null;
function updateLabels(sc, s) {
  if (!anchors) return;
  const W = innerWidth, H = innerHeight;
  for (const tag of tags) {
    const key = tag.dataset.anchor, a = anchors[key];
    let on = false;
    if (a && s.T < 0.08 && s.T > -0.5) {
      const pr = sc.project(a);
      const want = key === 'hairline' ? s.draw > 0.3 : key === 'crown' ? s.draw > 0.62 : true;
      on = want && pr.facing > (key === 'donor' ? 0.08 : 0.22);
      if (on) tag.style.transform = `translate3d(${(pr.x * W + 12).toFixed(1)}px, ${(pr.y * H - 30).toFixed(1)}px, 0)`;
    }
    tag.classList.toggle('is-on', on);
  }
}

/* --------------------------------------------------------- frame loop -- */
const canvas = document.querySelector('.scene__gl');
let sc = null;
let cur = null;
let raf = 0, lastNow = 0;
const drag = { on: false, yaw: 0, pitch: 0, vx: 0, lastX: 0, lastY: 0, idle: 0 };
const TAU = reduce ? 0 : 140;
// Frame pacing: a slow GPU gets fewer pixels first; one that still cannot
// follow a scroll (software rendering, an old phone) hands the story back to
// the stills, which tell it better than a head that lags a second behind.
const frameTimes = [];
let chained = false, quality = 0;
const KEEP_LIVE = CAPTURE || params.has('live');  // poster renders and tests
let slowRun = 0;
function govern(ms) {
  slowRun = ms > 250 ? slowRun + 1 : 0;
  if (slowRun >= 4) { quality = 2; retire(); return; }
  frameTimes.push(ms);
  const n = frameTimes.length;
  const m = frameTimes.slice().sort((a, b) => a - b)[n >> 1];
  if (n < 12 || (n < 36 && m < 120)) return;
  // each step down gets a fresh measurement before the next decision
  frameTimes.length = 0;
  if (m > 150) { quality = 2; retire(); return; }
  if (m > 24 && sc.dpr > 1) { sc.setDprCap(sc.dpr > 1.3 ? 1.25 : 1); quality = 1; return; }
  quality = 2;
  if (m > 70) retire();
}

function frame(now) {
  raf = 0;
  const wasChained = chained;
  chained = false;
  const gap = now - (lastNow || now);
  const dt = Math.min(250, gap);
  lastNow = now;
  const target = sample(scrollY);
  if (!target) return;
  if (!cur) cur = { ...target };
  const k = TAU ? 1 - Math.exp(-dt / TAU) : 1;
  let moving = false;
  for (const f of FIELDS) {
    const d = target[f] - cur[f];
    if (Math.abs(d) > EPS[f]) { cur[f] += d * k; moving = true; } else cur[f] = target[f];
  }
  // a released drag drifts back once the reader scrolls on or leaves it alone
  if (!drag.on && (drag.yaw || drag.pitch)) {
    drag.idle += dt;
    const back = drag.idle > 2600 || drag.scrolled ? 1 - Math.exp(-dt / 420) : 0;
    drag.yaw *= 1 - back; drag.pitch *= 1 - back;
    if (Math.abs(drag.yaw) < 0.002 && Math.abs(drag.pitch) < 0.002) { drag.yaw = 0; drag.pitch = 0; drag.scrolled = false; }
    moving = true;
  }
  if (sc) {
    Object.assign(sc.state, cur, { draw: cur.draw, markerFade: cur.ink, dragYaw: drag.yaw, dragPitch: drag.pitch });
    sc.render();
    updateLabels(sc, cur);
    if (wasChained && live && quality < 2 && gap > 0 && !KEEP_LIVE) govern(gap);
  }
  updateRail(cur.T);
  updatePosters(cur);
  // the glow sits behind the head on screen: the live one, or the still's
  const g = live ? cur : sample(stillY(shownStop));
  doc.style.setProperty('--gx', ((0.5 + g.ox) * 100).toFixed(1) + '%');
  doc.style.setProperty('--gy', ((0.46 + g.oy) * 100).toFixed(1) + '%');
  doc.classList.toggle('at-close', actP('consult') > 0.35 && scrollY >= geo.consult.y0 - 2);
  canvas.dataset.scVerifyState = [cur.T.toFixed(2), cur.az.toFixed(1), cur.el.toFixed(1), cur.yaw.toFixed(1), cur.draw.toFixed(2), cur.ox.toFixed(3)].join('|');
  const hold = actP('consult') > 0.6 && scrollY >= geo.consult.y0;
  if (hold) canvas.setAttribute('data-sc-verify-hold', 'true'); else canvas.removeAttribute('data-sc-verify-hold');
  if (moving || drag.on) { kick(); chained = true; }
}
function kick() { if (!raf && !document.hidden) raf = requestAnimationFrame(frame); }

addEventListener('scroll', () => { if (drag.yaw || drag.pitch) drag.scrolled = true; kick(); }, { passive: true });
let lastW = innerWidth;
addEventListener('resize', () => {
  requestAnimationFrame(() => {
    layoutTrack();
    if (sc) sc.resize(innerWidth, innerHeight);
    if (innerWidth !== lastW) { lastW = innerWidth; cur = null; }
    kick();
  });
});
document.addEventListener('visibilitychange', () => { if (!document.hidden) { lastNow = 0; kick(); } });

/* ------------------------------------------------------- drag to turn -- */
if (fine && !reduce) {
  canvas.addEventListener('pointerdown', (e) => {
    if (e.button !== 0 || !sc) return;
    drag.on = true; drag.lastX = e.clientX; drag.lastY = e.clientY; drag.idle = 0; drag.scrolled = false;
    canvas.classList.add('is-dragging');
    kick();
  });
  addEventListener('pointermove', (e) => {
    if (!drag.on) return;
    drag.yaw -= (e.clientX - drag.lastX) * 0.0085;
    drag.pitch = Math.max(-0.45, Math.min(0.45, drag.pitch + (e.clientY - drag.lastY) * 0.004));
    drag.yaw = Math.max(-3.2, Math.min(3.2, drag.yaw));
    drag.lastX = e.clientX; drag.lastY = e.clientY; drag.idle = 0;
    kick();
  });
  const end = () => { if (!drag.on) return; drag.on = false; drag.idle = 0; canvas.classList.remove('is-dragging'); kick(); };
  addEventListener('pointerup', end);
  addEventListener('pointercancel', end);
}

/* --------------------------------------------------------------- dialog -- */
const dlg = document.querySelector('.demo-dialog');
const ctaBtn = document.querySelector('[data-demo-cta]');
ctaBtn.addEventListener('click', () => { if (typeof dlg.showModal === 'function') dlg.showModal(); else dlg.setAttribute('open', ''); });
dlg.querySelector('[data-close]').addEventListener('click', () => dlg.close());
dlg.addEventListener('click', (e) => { if (e.target === dlg) dlg.close(); });
dlg.addEventListener('close', () => ctaBtn.focus({ preventScroll: true }));
// Keyboard users reaching the close: park the act where the plate is open.
document.getElementById('consult').addEventListener('focusin', () => {
  setTimeout(() => {
    const g = geo.consult;
    if (g && scrollY < g.y1 - 2) window.scrollTo({ top: g.y1, behavior: 'instant' });
  }, 0);
});

/* ---------------------------------------------------------------- boot -- */
function startEngine() {
  if (window.ScrollCraft) window.ScrollCraft.mount(document.body);
  layoutTrack();
  updateRail(sample(scrollY).T);
  kick();
}

// WebGL 2 on real graphics hardware. A software renderer (no GPU, or a
// blocklisted one) would stall the page compiling the hair, so it keeps the stills.
function webglOK() {
  try {
    const gl = document.createElement('canvas').getContext('webgl2');
    if (!gl) return false;
    let name = String(gl.getParameter(gl.RENDERER));
    if (/^webkit webgl$/i.test(name)) {
      const info = gl.getExtension('WEBGL_debug_renderer_info');
      if (info) name = String(gl.getParameter(info.UNMASKED_RENDERER_WEBGL));
    }
    const lose = gl.getExtension('WEBGL_lose_context');
    if (lose) lose.loseContext();
    return KEEP_LIVE || !/swiftshader|llvmpipe|softpipe|software|basic render/i.test(name);
  } catch { return false; }
}

function postersOnly() {
  live = false;
  if (sc) { const old = sc; sc = null; requestAnimationFrame(() => old.dispose()); }
  doc.classList.remove('is-live');
  doc.classList.add('posters-only');
  if (cur) updatePosters(cur, true);
  kick();
}
// leave the live head only once the still for this moment has decoded
let retiring = false;
function retire() {
  if (retiring || !cur) return;
  retiring = true;
  const img = posterAt[stopFor(cur)];
  ensurePoster(img);
  let done = false;
  const go = () => { if (!done) { done = true; postersOnly(); } };
  img.decode().then(go, go);
  setTimeout(go, 2500);
}

function timeFrames(n) {
  return new Promise((resolve) => {
    const gaps = [];
    let last = performance.now();
    const step = (t) => {
      gaps.push(t - last); last = t;
      if (sc) sc.render();
      if (gaps.length < n && sc) requestAnimationFrame(step); else resolve(gaps);
    };
    requestAnimationFrame(step);
  });
}

let booted = false;
async function bootScene() {
  if (booted) return;
  booted = true;
  performance.mark('tutam:boot');
  if (!webglOK()) { postersOnly(); return; }
  const phone = isPhone() || matchMedia('(pointer: coarse)').matches;
  const opts = { cell: phone ? 0.032 : 0.026, strands: phone ? 13000 : 30000 };
  // the bust is built in a worker while three.js and the scene module load
  const built = new Promise((resolve, reject) => {
    const w = new Worker(new URL('./headgen-worker.js', import.meta.url), { type: 'module' });
    w.onmessage = (e) => { resolve(e.data); w.terminate(); };
    w.onerror = (e) => { reject(e); w.terminate(); };
    w.postMessage(opts);
  }).catch(async () => (await import('./headgen.js')).generate(opts));
  try {
    const [data, { createScene }] = await Promise.all([built, import('./scene.js')]);
    performance.mark('tutam:loaded');
    const still = isPhone() ? { w: 390, h: 844, dpr: 2 } : { w: 1600, h: 1000, dpr: 1 };  // how the stills were drawn
    const next = createScene(canvas, data, { small: phone, still, capture: CAPTURE, dprCap: CAPTURE ? 2 : undefined });
    next.resize(innerWidth, innerHeight);
    await next.warm();
    performance.mark('tutam:compiled');
    sc = next;
    anchors = data.anchors;
    canvas.addEventListener('webglcontextlost', (e) => { e.preventDefault(); postersOnly(); });
    cur = null;
    frame(performance.now());
    // A few frames behind the still decide whether the head can follow a
    // scroll here at all (software rendering cannot); if not, the stills stay.
    const gaps = await timeFrames(4);
    if (!sc) return;
    if (!KEEP_LIVE && gaps.slice(1).sort((a, b) => a - b)[1] > 120) { postersOnly(); return; }
    performance.mark('tutam:probed');
    // reveal only after that frame has reached the screen; the stills stay
    // opaque underneath until the fade is over, so nothing dims on the way
    requestAnimationFrame(() => requestAnimationFrame(() => {
      if (!sc) return;
      // On a still's own spot the live frame is the same picture and the long
      // dissolve is invisible; between spots the still differs, so cut quicker.
      const exact = onStill(cur);
      doc.style.setProperty('--live-fade', exact ? '600ms' : '320ms');
      doc.style.setProperty('--poster-out', exact ? '0s' : '320ms');
      doc.style.setProperty('--poster-wait', exact ? '640ms' : '0s');
      live = true;
      doc.classList.add('is-live');
      performance.mark('tutam:live');
      window.__tutamReady = true;
    }));
  } catch (err) {
    console.warn('[tutam] live head unavailable, showing stills', err);
    postersOnly();
  }
}

/* The live head is the heaviest thing on the page, so it waits: the first
   still is already the opening frame, and the head is built on the reader's
   first scroll, touch or key, or a few seconds after load once the page is
   idle. Reduced motion keeps the stills for the whole story. */
const WAKE = ['scroll', 'wheel', 'touchstart', 'pointerdown', 'keydown'];
let wakeTimer = 0;
function wake() {
  WAKE.forEach((t) => removeEventListener(t, wake, true));
  clearTimeout(wakeTimer);
  // the reader is moving: have the next stills ready before they are needed
  const i = STOPS.indexOf(lastPoster);
  ensurePoster(posterAt[STOPS[i + 1]]); ensurePoster(posterAt[STOPS[i - 1]]);
  // and build the head between frames, never inside the scroll that woke it
  const idle = window.requestIdleCallback || ((fn) => setTimeout(fn, 1));
  idle(() => bootScene(), { timeout: 600 });
}
function armWake() {
  WAKE.forEach((t) => addEventListener(t, wake, { capture: true, passive: true }));
  const later = () => { wakeTimer = setTimeout(wake, 4500); };
  if (document.readyState === 'complete') later(); else addEventListener('load', later, { once: true });
}

if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', startEngine); else startEngine();
if (reduce || params.has('posters')) postersOnly();
else if (CAPTURE) bootScene();
else armWake();

// capture helpers for the poster and share renders (headless only)
window.__tutamSettled = () => !raf;
window.__tutam = { get scene() { return sc; }, get anchors() { return anchors; }, get state() { return cur; }, posterStops: () => STOPS.map((stop) => ({ stop, y: stillY(stop) })) };
