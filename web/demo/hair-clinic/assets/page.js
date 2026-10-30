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
  { id: 'consult', kf: [
    [0, { yaw: 30, az: 517, el: 25 }],
    [0.55, { yaw: 131, el: 22, ty: -0.1, dist: 1.0, ox: 0.2, oy: 0.03, m: { ox: -0.04, oy: -0.3, dist: 1.5 } }],
    [1, { yaw: 133, el: 21 }]] },
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
const railFrac = (T) => (T < 0 ? 0.13 * (1 + Math.max(-1, T)) : 0.13 + 0.87 * Math.min(12, T) / 12);
railItems.forEach((li) => { li.style.top = (railFrac(parseFloat(li.dataset.t)) * 100).toFixed(2) + '%'; });
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
const posters = [...document.querySelectorAll('.scene__posters img')];
let postersReady = false;
function loadPosters() {
  if (postersReady) return;
  postersReady = true;
  const phone = isPhone();
  posters.forEach((img) => { const s = phone ? img.dataset.srcM : img.dataset.srcD; if (s && !img.getAttribute('src')) img.src = s; });
}
let lastPoster = 'before';
function updatePosters(s) {
  let stop = 'before';
  if (actP('consult') > 0.3 && scrollY > geo.consult.y0 - 1) stop = 'close';
  else if (s.T >= 10.5) stop = 'm12';
  else if (s.T >= 7.5) stop = 'm9';
  else if (s.T >= 4.5) stop = 'm6';
  else if (s.T >= 2) stop = 'm3';
  else if (s.T >= 0.5) stop = 'm1';
  else if (scrollY > geo['day-0'].y0 - innerHeight * 0.5) stop = 'day0';
  else if (scrollY > geo.thinning.y0 - innerHeight * 0.5) stop = 'thin';
  if (stop === lastPoster) return;
  lastPoster = stop;
  posters.forEach((img) => img.classList.toggle('is-on', img.dataset.stop === stop));
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
const frameTimes = [];
let qualityChecked = false;
const TAU = reduce ? 0 : 140;

function frame(now) {
  raf = 0;
  const dt = Math.min(80, now - (lastNow || now));
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
    if (!qualityChecked && dt > 0 && dt < 80) {
      frameTimes.push(dt);
      if (frameTimes.length >= 50) {
        qualityChecked = true;
        const m = frameTimes.slice().sort((a, b) => a - b)[25];
        if (m > 24) sc.setDprCap(1);  // a slow GPU gets fewer pixels, not a slower page
      }
    }
  }
  updateRail(cur.T);
  updatePosters(cur);
  doc.style.setProperty('--gx', ((0.5 + cur.ox) * 100).toFixed(1) + '%');
  doc.style.setProperty('--gy', ((0.46 + cur.oy) * 100).toFixed(1) + '%');
  doc.classList.toggle('at-close', actP('consult') > 0.35 && scrollY >= geo.consult.y0 - 2);
  canvas.dataset.scVerifyState = [cur.T.toFixed(2), cur.az.toFixed(1), cur.el.toFixed(1), cur.yaw.toFixed(1), cur.draw.toFixed(2), cur.ox.toFixed(3)].join('|');
  const hold = actP('consult') > 0.6 && scrollY >= geo.consult.y0;
  if (hold) canvas.setAttribute('data-sc-verify-hold', 'true'); else canvas.removeAttribute('data-sc-verify-hold');
  if (moving || drag.on) kick();
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

function webglOK() {
  try { const c = document.createElement('canvas'); return !!c.getContext('webgl2'); } catch { return false; }
}

async function bootScene() {
  if (reduce || !webglOK() || params.has('posters')) { loadPosters(); doc.classList.add('posters-only'); return; }
  const phone = isPhone() || matchMedia('(pointer: coarse)').matches;
  const opts = { cell: phone ? 0.032 : 0.026, strands: phone ? 13000 : 30000 };
  let data;
  try {
    data = await new Promise((resolve, reject) => {
      const w = new Worker(new URL('./headgen-worker.js', import.meta.url), { type: 'module' });
      w.onmessage = (e) => { resolve(e.data); w.terminate(); };
      w.onerror = (e) => { reject(e); w.terminate(); };
      w.postMessage(opts);
    });
  } catch {
    const { generate } = await import('./headgen.js');
    data = generate(opts);
  }
  try {
    const { createScene } = await import('./scene.js');
    sc = createScene(canvas, data, { small: phone, capture: CAPTURE, dprCap: CAPTURE ? 2 : undefined });
    sc.resize(innerWidth, innerHeight);
    anchors = data.anchors;
    canvas.addEventListener('webglcontextlost', (e) => { e.preventDefault(); sc = null; doc.classList.remove('is-live'); loadPosters(); });
    cur = null;
    frame(performance.now());
    requestAnimationFrame(() => { doc.classList.add('is-live'); window.__tutamReady = true; });
  } catch (err) {
    console.warn('[tutam] live head unavailable, showing stills', err);
    sc = null; loadPosters(); doc.classList.add('posters-only');
  }
}

if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', startEngine); else startEngine();
bootScene();

// capture helpers for the poster and share renders (headless only)
window.__tutamSettled = () => !raf;
window.__tutam = { get scene() { return sc; }, get anchors() { return anchors; }, get state() { return cur; } };
