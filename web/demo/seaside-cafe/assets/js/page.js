// Kuşluk demo: page controller. One rAF owns scroll -> rail -> sun -> scene,
// so the DOM labels and the WebGL objects never disagree by a frame.
import { DAY, clamp, smooth, minutesAt, tAt, parseHour, fmtHour, sunAngles, period, palette } from './sun.js';

const I = JSON.parse(document.getElementById('i18n').textContent);
const root = document.documentElement;
const reduce = matchMedia('(prefers-reduced-motion: reduce)').matches;
const lowPower = matchMedia('(pointer: coarse)').matches || innerWidth < 760;
const params = new URLSearchParams(location.search);
const CAPTURE = params.get('capture');
const SEP = I.timeSep || '.';
const PERF = params.has('perf') ? [] : null;

// ------------------------------------------------------------ mount engine
const act = document.getElementById('koleksiyon');
if (reduce) act.setAttribute('data-sc-span', '1.25'); // the rail scrolls natively instead
// The close holds as a pinned plate where it fits; on short or narrow screens
// the plate and footer are taller than one viewport, so it becomes a flow section.
const closeAct = document.getElementById('rezervasyon');
if (innerWidth < 760 || innerHeight < 760) { closeAct.setAttribute('data-sc-act', 'flow'); closeAct.classList.add('close--flow'); }
const engine = window.ScrollCraft ? window.ScrollCraft.mount(document.body) : null;

const stage = act.querySelector('.sc-stage');
const rail = document.getElementById('rail');
const items = Array.from(rail.children);
const win = stage.querySelector('.window');
const canvas = document.getElementById('gl');
const fgBloom = stage.querySelector('.fg--bloom');
const fgAwning = stage.querySelector('.fg--awning');
const fgLights = stage.querySelector('.fg--lights');
if (!reduce) root.classList.add('rail-settle');
if (CAPTURE) root.classList.add('capture');

// --------------------------------------------------------------- geometry
const G = { top: 0, h: 1, vw: 1, vh: 1, over: 0, items: [], anchors: [] };
function measure() {
  G.vw = stage.clientWidth || innerWidth;
  G.vh = innerHeight;
  G.top = act.getBoundingClientRect().top + scrollY;
  G.h = act.offsetHeight;
  G.over = Math.max(rail.scrollWidth - G.vw, 0);
  G.items = items.map((el) => {
    const slot = el.querySelector('.ex__slot');
    const left = el.offsetLeft;
    return {
      el, id: el.id, obj: el.dataset.obj || null,
      cx: slot ? left + slot.offsetLeft + slot.offsetWidth / 2 : left + el.offsetWidth / 2,
      center: left + el.offsetWidth / 2, left, w: el.offsetWidth,
      t: tAt(parseHour(el.dataset.hour || '07.30')),
      label: el.querySelector('.ex__label'), settle: -1,
    };
  });
  let prev = -Infinity;
  G.anchors = G.items.map((it) => {
    let x = clamp(it.center - G.vw / 2, 0, G.over);
    if (x <= prev) x = prev + 1;
    prev = x;
    return { x, t: it.t };
  });
  const find = (id) => G.items.find((i) => i.id === id);
  const fgBase = (id, w, k) => { const it = find(id); const a = clamp(it.center - G.vw / 2, 0, G.over); return G.vw / 2 - w / 2 + a * k; };
  G.awnBase = fgBase('wall-ogle', fgAwning.offsetWidth, 1.3);
  G.lightsBase = fgBase('ex-tonik', fgLights.offsetWidth, 1.3) + G.vw * 0.35;
  lastX = -1;
}

function railX() {
  if (reduce) return stage.scrollLeft;
  const p = clamp((scrollY - G.top) / Math.max(G.h - G.vh, 1), 0, 1);
  return p * G.over;
}
function autoT(x) {
  if (!reduce && scrollY > G.top + G.h - G.vh + 2) return G.anchors[G.anchors.length - 1].t;
  const A = G.anchors;
  if (x <= A[0].x) return A[0].t;
  for (let i = 1; i < A.length; i++) {
    if (x <= A[i].x) { const f = (x - A[i - 1].x) / (A[i].x - A[i - 1].x); return A[i - 1].t + (A[i].t - A[i - 1].t) * f; }
  }
  return A[A.length - 1].t;
}

// ------------------------------------------------------------ the rail
const slots = {};
let lastX = -1, activeId = '';
const indexLinks = Array.from(document.querySelectorAll('.index__list a'));
function applyRail(x) {
  if (!reduce) rail.style.transform = `translate3d(${(-x).toFixed(2)}px,0,0)`;
  const vw = G.vw;
  for (const it of G.items) {
    if (it.obj) {
      const sx = it.cx - x;
      slots[it.obj] = sx > -0.45 * vw && sx < 1.45 * vw ? sx : null;
    }
    if (!reduce && it.label && it !== G.items[0]) {
      const enter = (vw * 1.02 - (it.left - x)) / (vw * 0.42);
      const s = Math.round((0.55 + 0.45 * smooth(0, 1, enter)) * 100) / 100;
      if (s !== it.settle) { it.settle = s; it.label.style.setProperty('--settle', s); }
    }
  }
  if (!reduce) {
    fgBloom.style.transform = `translate3d(${(-x * 1.3).toFixed(1)}px,0,0)`;
    fgAwning.style.transform = `translate3d(${(G.awnBase - x * 1.3).toFixed(1)}px,0,0)`;
    fgLights.style.transform = `translate3d(${(G.lightsBase - x * 1.3).toFixed(1)}px,0,0)`;
  }
  // index: the object nearest the middle of the screen
  let best = null, bd = Infinity;
  const inPan = scrollY < G.top + G.h - G.vh * 0.5;
  if (inPan) for (const it of G.items) { const d = Math.abs(it.center - x - vw / 2); if (d < bd && it.obj) { bd = d; best = it.id; } }
  else {
    for (const id of ['rezervasyon', 'saatler', 'menu']) { const r = document.getElementById(id).getBoundingClientRect(); if (r.top < G.vh * 0.5) { best = id; break; } }
  }
  if (best !== activeId) {
    activeId = best;
    indexLinks.forEach((a) => a.setAttribute('aria-current', a.dataset.jump === best ? 'true' : 'false'));
  }
}

// ------------------------------------------------------------ the sun
const S = { t: G.anchors.length ? G.anchors[0].t : tAt(450), mode: 'auto', from: 0, to: 0, t0: 0, dur: 0, applied: -1 };
const follow = document.getElementById('sun-follow');
const disc = document.getElementById('sun-disc');
const track = document.getElementById('sun-track');
const timeEl = document.getElementById('sun-time');
const nowEl = document.getElementById('sun-now');
const pathEl = document.getElementById('sun-path');
const doneEl = document.getElementById('sun-done');
const presets = Array.from(document.querySelectorAll('[data-preset]'));
const menuCols = Array.from(document.querySelectorAll('.menu__col'));
const metaTheme = document.querySelector('meta[name="theme-color"]');

const VB_W = 300, HOR_Y = 34;
const yOf = (t) => HOR_Y - sunAngles(t).elev / 58 * 28;
(function drawPath() {
  let d = '';
  for (let i = 0; i <= 80; i++) { const t = i / 80; d += (i ? 'L' : 'M') + (t * VB_W).toFixed(1) + ' ' + yOf(t).toFixed(1); }
  pathEl.setAttribute('d', d);
})();

function setManual(t, animate, from) {
  S.mode = 'manual';
  follow.hidden = false;
  if (from !== 'res') res.lockT = null;
  t = clamp(t, 0, 1);
  if (animate && !reduce) { S.from = S.t; S.to = t; S.t0 = performance.now(); S.dur = 650 + Math.abs(t - S.t) * 500; root.classList.add('regrade'); }
  else { S.dur = 0; S.t = t; }
}
follow.addEventListener('click', () => {
  S.mode = 'auto'; follow.hidden = true; res.lockT = null;
  const t = autoT(railX());
  S.from = S.t; S.to = t; S.t0 = performance.now(); S.dur = reduce ? 0 : 600; if (!reduce) root.classList.add('regrade');
  disc.focus({ preventScroll: true });
});

const tokens = {};
function setToken(k, v) { if (tokens[k] !== v) { tokens[k] = v; root.style.setProperty(k, v); } }
function partOfDay(m) { for (const [lim, name] of I.parts) if (m < lim) return name; return I.parts[I.parts.length - 1][1]; }

// Two speeds. The control and the 3D scene follow the sun every frame; the
// page tokens (a style recalculation of the whole document) and the DOM that
// depends on the period update when the value has moved enough, and while the
// visitor drags at most every 90 ms (220 ms on phones). No CSS transitions
// on the grounds: a transition on html/body re-styles the document every
// frame, which cost more than the drag itself on a throttled phone.
// No layout is read here.
const T = { tw: 1, th: 1, lastTok: -1, tokAt: 0, per: '', hhmm: '', resM: -1 };
function measureTrack() { T.tw = track.clientWidth; T.th = track.clientHeight; }
function setText(el, v) { if (el.textContent !== v) el.textContent = v; }
function applySun(t, force) {
  if (!force && Math.abs(t - S.applied) < 0.0004) return;
  S.applied = t;
  const m = minutesAt(t);
  disc.style.transform = `translate3d(${(t * T.tw).toFixed(1)}px,${(yOf(t) / 46 * T.th).toFixed(1)}px,0)`;
  const k = Math.round(t * 80);
  let d = '';
  for (let i = 0; i <= k; i++) { const u = i / 80; d += (i ? 'L' : 'M') + (u * VB_W).toFixed(1) + ' ' + yOf(u).toFixed(1); }
  doneEl.setAttribute('d', d + 'L' + (t * VB_W).toFixed(1) + ' ' + yOf(t).toFixed(1));
  const hhmm = fmtHour(m, SEP);
  if (hhmm !== T.hhmm) {
    T.hhmm = hhmm;
    setText(timeEl, hhmm);
    disc.setAttribute('aria-valuenow', String(Math.round(m)));
    disc.setAttribute('aria-valuetext', `${hhmm}, ${partOfDay(m)}`);
  }
  stage.dataset.scVerifyState = `${Math.round(lastX)}|${Math.round(m)}`;
  const now = performance.now();
  const tq = Math.round(t * 300) / 300;
  if (!force && tq === T.lastTok) return;
  if (!force && (dragging || S.dur > 0) && now - T.tokAt < (lowPower ? 220 : 90)) return;
  T.lastTok = tq; T.tokAt = now;
  const P = palette(t);
  setToken('--ground', P.ground); setToken('--ink', P.ink); setToken('--ink-soft', P.soft);
  setToken('--accent', P.accent); setToken('--accent-ink', P.aink); setToken('--sun-disc', P.disc);
  if (P.dusk !== root.hasAttribute('data-dusk')) { if (P.dusk) root.setAttribute('data-dusk', ''); else root.removeAttribute('data-dusk'); }
  setToken('--lamps', smooth(DAY.lamps - 5, DAY.lamps + 5, m).toFixed(2));
  if (metaTheme && metaTheme.content !== P.ground) metaTheme.content = P.ground;
  const per = period(m);
  if (per !== T.per) {
    T.per = per;
    setText(nowEl, `${I.now}: ${I.service[per]}`);
    presets.forEach((b) => b.setAttribute('aria-pressed', period(parseHour(b.dataset.preset)) === per ? 'true' : 'false'));
    menuCols.forEach((c) => { if (c.dataset.period === per) c.setAttribute('data-now', ''); else c.removeAttribute('data-now'); });
  }
  // the reservation follows the sun unless the visitor just chose a time there
  if (res.lockT == null) {
    const rm = clamp(Math.round(m / 30) * 30, 420, 1350);
    if (rm !== T.resM) { T.resM = rm; resTime.value = fmtHour(rm, SEP); updatePreview(); }
  }
}

function tickSun(now) {
  if (S.dur > 0) {
    const f = clamp((now - S.t0) / S.dur, 0, 1);
    const e = 1 - Math.pow(1 - f, 3);
    S.t = S.from + (S.to - S.from) * e;
    if (f >= 1) { S.dur = 0; S.t = S.to; applySun(S.t, true); setTimeout(() => root.classList.remove('regrade'), 450); if (scene) scene.flushEnv(); }
  } else if (S.mode === 'auto') {
    S.t = autoT(lastX < 0 ? 0 : lastX);
  }
}

// pointer drag on the track
let dragging = false;
function tFromEvent(e) { const r = track.getBoundingClientRect(); return clamp((e.clientX - r.left) / r.width, 0, 1); }
track.addEventListener('pointerdown', (e) => {
  dragging = true; track.setPointerCapture && track.setPointerCapture(e.pointerId);
  setManual(tFromEvent(e), e.target !== disc && !reduce);
  if (e.target === disc) S.dur = 0;
  disc.focus({ preventScroll: true });
  e.preventDefault();
});
track.addEventListener('pointermove', (e) => { if (!dragging) return; S.dur = 0; setManual(tFromEvent(e), false); });
const endDrag = () => { if (!dragging) return; dragging = false; root.classList.remove('regrade'); applySun(S.t, true); if (scene) scene.flushEnv(); };
track.addEventListener('pointerup', endDrag);
track.addEventListener('pointercancel', endDrag);
disc.addEventListener('keydown', (e) => {
  const m = minutesAt(S.dur ? S.to : S.t);
  let n = null;
  if (e.key === 'ArrowRight' || e.key === 'ArrowUp') n = m + 15;
  else if (e.key === 'ArrowLeft' || e.key === 'ArrowDown') n = m - 15;
  else if (e.key === 'PageUp') n = m + 60;
  else if (e.key === 'PageDown') n = m - 60;
  else if (e.key === 'Home') n = DAY.start;
  else if (e.key === 'End') n = DAY.end;
  if (n == null) return;
  e.preventDefault();
  setManual(tAt(Math.round(n / 15) * 15), false);
});
presets.forEach((b) => b.addEventListener('click', () => setManual(tAt(parseHour(b.dataset.preset)), true)));

// ------------------------------------------------------------ reservation
const form = document.getElementById('plate');
const resTime = document.getElementById('res-time');
const resN = document.getElementById('res-n');
const preview = document.querySelector('#res-preview span');
const res = { n: 2, lockT: null };
for (let m = 420; m <= 1350; m += 30) { const o = document.createElement('option'); o.value = o.textContent = fmtHour(m, SEP); resTime.appendChild(o); }
function message() {
  const fd = new FormData(form);
  return I.msg.replace('{day}', I.days[fd.get('day')] || '').replace('{time}', resTime.value).replace('{n}', String(res.n)).replace('{table}', I.tables[fd.get('table')] || '');
}
const zones = Array.from(document.querySelectorAll('.plan__zone'));
function updatePreview() {
  preview.textContent = message();
  const tb = new FormData(form).get('table');
  zones.forEach((z) => { if (z.dataset.table === tb) z.setAttribute('data-on', ''); else z.removeAttribute('data-on'); });
}
zones.forEach((z) => z.addEventListener('click', () => {
  const r = form.querySelector(`input[name="table"][value="${z.dataset.table}"]`);
  if (r) { r.checked = true; updatePreview(); }
}));
resTime.addEventListener('change', () => {
  const m = parseHour(resTime.value);
  const t = tAt(Math.min(m, DAY.end));
  res.lockT = t;
  setManual(t, true, 'res');
  updatePreview();
});
form.addEventListener('change', (e) => { if (e.target !== resTime) updatePreview(); });
form.querySelectorAll('[data-step]').forEach((b) => b.addEventListener('click', () => {
  res.n = clamp(res.n + Number(b.dataset.step), 1, 12);
  resN.textContent = String(res.n);
  form.querySelector('[data-step="-1"]').disabled = res.n <= 1;
  form.querySelector('[data-step="1"]').disabled = res.n >= 12;
  updatePreview();
}));
const dlg = document.getElementById('wa');
form.addEventListener('submit', (e) => {
  e.preventDefault();
  document.getElementById('wa-msg').textContent = message();
  if (dlg.showModal) dlg.showModal(); else dlg.setAttribute('open', '');
});
document.getElementById('wa-close').addEventListener('click', () => dlg.close());
dlg.addEventListener('click', (e) => { if (e.target === dlg) dlg.close(); });

// ------------------------------------------------------------ index + jumps
const indexNav = document.querySelector('.index');
const indexBtn = document.querySelector('.index__toggle');
function setIndex(open) { if (open) indexNav.setAttribute('data-open', ''); else indexNav.removeAttribute('data-open'); indexBtn.setAttribute('aria-expanded', String(open)); }
indexBtn.addEventListener('click', () => setIndex(!indexNav.hasAttribute('data-open')));
document.addEventListener('keydown', (e) => { if (e.key === 'Escape' && indexNav.hasAttribute('data-open')) { setIndex(false); indexBtn.focus(); } });
document.addEventListener('click', (e) => { if (indexNav.hasAttribute('data-open') && !indexNav.contains(e.target)) setIndex(false); });

function railYFor(x) { return G.top + (G.over ? x / G.over : 0) * (G.h - G.vh); }
function jumpTo(id, instant) {
  const it = G.items.find((i) => i.id === id);
  const behavior = instant || reduce ? 'instant' : 'smooth';
  let heading;
  if (it) {
    const x = clamp(it.center - G.vw / 2, 0, G.over);
    if (reduce) { stage.scrollTo({ left: x, behavior: 'instant' }); window.scrollTo({ top: G.top, behavior: 'instant' }); }
    else window.scrollTo({ top: railYFor(x) + 1, behavior });
    heading = it.el.querySelector('h1, h2');
  } else {
    const el = document.getElementById(id);
    if (!el) return;
    const y = el.getBoundingClientRect().top + scrollY - (id === 'rezervasyon' ? 0 : 40);
    window.scrollTo({ top: y + (id === 'rezervasyon' ? Math.round(innerHeight * 0.3) : 0), behavior });
    heading = el.querySelector('h2');
  }
  if (heading) { heading.setAttribute('tabindex', '-1'); heading.focus({ preventScroll: true }); }
}
document.addEventListener('click', (e) => {
  const a = e.target.closest('[data-jump]');
  if (!a) return;
  e.preventDefault();
  setIndex(false);
  jumpTo(a.dataset.jump);
});
// Keyboard focus that lands inside the rail brings its object to the middle.
rail.addEventListener('focusin', (e) => {
  const item = e.target.closest('.ex');
  if (!item) return;
  const it = G.items.find((i) => i.el === item);
  if (!it) return;
  const sx = it.left - railX();
  if (sx < 0 || sx + it.w > G.vw) jumpTo(it.id, true);
});

// ------------------------------------------------------------ foreground art
function drawBloom(cv) {
  const box = cv.getBoundingClientRect();
  const dpr = Math.min(devicePixelRatio || 1, 1.5);
  const w = Math.max(1, Math.round(box.width * dpr)), h = Math.max(1, Math.round(box.height * dpr));
  cv.width = w; cv.height = h;
  const g = cv.getContext('2d');
  const off = document.createElement('canvas'); off.width = w; off.height = h;
  const o = off.getContext('2d');
  let s = 17; const r = () => ((s = (s * 16807) % 2147483647) / 2147483647);
  const S0 = Math.min(w, h * 1.4);
  // branch
  o.strokeStyle = '#4a3324'; o.lineCap = 'round';
  const branch = [[-0.05, 0.02], [0.22, 0.12], [0.42, 0.18], [0.62, 0.3], [0.78, 0.5]];
  o.lineWidth = S0 * 0.014; o.beginPath();
  branch.forEach(([x, y], i) => (i ? o.lineTo(x * w, y * h) : o.moveTo(x * w, y * h))); o.stroke();
  o.lineWidth = S0 * 0.008; o.beginPath(); o.moveTo(0.3 * w, 0.15 * h); o.quadraticCurveTo(0.36 * w, 0.42 * h, 0.3 * w, 0.66 * h); o.stroke();
  const leaf = (x, y, a, L) => {
    o.save(); o.translate(x, y); o.rotate(a);
    const gr = o.createLinearGradient(0, -L * 0.3, 0, L * 0.3); gr.addColorStop(0, '#4f7a35'); gr.addColorStop(1, '#2f5222');
    o.fillStyle = gr; o.beginPath(); o.moveTo(0, 0); o.bezierCurveTo(L * 0.3, -L * 0.32, L * 0.75, -L * 0.22, L, 0); o.bezierCurveTo(L * 0.75, L * 0.22, L * 0.3, L * 0.32, 0, 0); o.fill(); o.restore();
  };
  const bract = (x, y, a, L, hue) => {
    o.save(); o.translate(x, y); o.rotate(a);
    const gr = o.createRadialGradient(L * 0.15, 0, L * 0.05, L * 0.4, 0, L * 0.75);
    gr.addColorStop(0, `hsl(${hue}, 66%, 58%)`); gr.addColorStop(0.65, `hsl(${hue}, 64%, 42%)`); gr.addColorStop(1, `hsl(${hue - 8}, 60%, 30%)`);
    o.fillStyle = gr; o.beginPath(); o.moveTo(0, 0);
    o.bezierCurveTo(L * 0.25, -L * 0.55, L * 0.95, -L * 0.45, L, 0); o.bezierCurveTo(L * 0.95, L * 0.45, L * 0.25, L * 0.55, 0, 0); o.fill();
    o.strokeStyle = `hsla(${hue - 10}, 60%, 30%, 0.35)`; o.lineWidth = Math.max(1, L * 0.02); o.beginPath(); o.moveTo(L * 0.05, 0); o.lineTo(L * 0.9, 0); o.stroke();
    o.restore();
  };
  const clusters = [];
  for (let i = 0; i < 34; i++) {
    const f = r(); const k = Math.min(Math.floor(f * (branch.length - 1)), branch.length - 2);
    const u = f * (branch.length - 1) - k;
    const x = (branch[k][0] + (branch[k + 1][0] - branch[k][0]) * u) * w + (r() - 0.5) * S0 * 0.22;
    const y = (branch[k][1] + (branch[k + 1][1] - branch[k][1]) * u) * h + (r() - 0.2) * S0 * 0.16;
    clusters.push([x, y]);
  }
  for (let i = 0; i < 44; i++) { const [x, y] = clusters[i % clusters.length]; leaf(x + (r() - 0.5) * 40, y + (r() - 0.5) * 30, r() * Math.PI * 2, S0 * (0.07 + r() * 0.05)); }
  clusters.forEach(([x, y]) => {
    const L = S0 * (0.04 + r() * 0.03), base = r() * Math.PI * 2, hue = 318 + r() * 12;
    for (let j = 0; j < 3; j++) bract(x, y, base + j * 2.1 + (r() - 0.5) * 0.4, L, hue);
    o.fillStyle = '#f4ecd0'; o.beginPath(); o.arc(x, y, L * 0.09, 0, Math.PI * 2); o.fill();
  });
  g.filter = `blur(${(3.2 * dpr).toFixed(1)}px)`;
  g.drawImage(off, 0, 0);
  g.filter = 'none';
}
function buildLights(svg) {
  const NS = 'http://www.w3.org/2000/svg';
  const el = (n, a) => { const e = document.createElementNS(NS, n); for (const k in a) e.setAttribute(k, a[k]); return e; };
  const defs = el('defs', {});
  const rg = el('radialGradient', { id: 'lightsGlow' });
  rg.append(el('stop', { offset: '0', 'stop-color': '#ffd28a', 'stop-opacity': '0.85' }), el('stop', { offset: '0.35', 'stop-color': '#ffb85c', 'stop-opacity': '0.28' }), el('stop', { offset: '1', 'stop-color': '#ff9c40', 'stop-opacity': '0' }));
  defs.append(rg); svg.append(defs);
  const spans = [[0, 26, 520, 22], [520, 22, 1180, 30], [1180, 30, 2000, 18]];
  const glows = el('g', {}), bulbs = el('g', {});
  let d = '';
  for (const [x0, y0, x1, y1] of spans) {
    const sag = 92;
    const at = (u) => [x0 + (x1 - x0) * u, y0 + (y1 - y0) * u + sag * 4 * u * (1 - u)];
    d += `M${x0} ${y0}`;
    for (let i = 1; i <= 40; i++) { const [x, y] = at(i / 40); d += `L${x.toFixed(1)} ${y.toFixed(1)}`; }
    const n = Math.round((x1 - x0) / 64);
    for (let i = 1; i < n; i++) {
      const [x, y] = at(i / n);
      glows.append(el('circle', { class: 'lights__glow', cx: x.toFixed(1), cy: (y + 14).toFixed(1), r: 40 }));
      bulbs.append(el('line', { x1: x.toFixed(1), y1: y.toFixed(1), x2: x.toFixed(1), y2: (y + 8).toFixed(1), stroke: '#2a2622', 'stroke-width': 1.2 }));
      bulbs.append(el('ellipse', { class: 'lights__bulb', cx: x.toFixed(1), cy: (y + 14).toFixed(1), rx: 5.5, ry: 7 }));
      bulbs.append(el('ellipse', { class: 'lights__on', cx: x.toFixed(1), cy: (y + 14).toFixed(1), rx: 5.5, ry: 7 }));
    }
  }
  svg.append(glows, el('path', { class: 'lights__wire', d }), bulbs);
}
buildLights(document.getElementById('lights'));

// ------------------------------------------------------------ WebGL
let scene = null, noGL = false, stageVisible = true, dprScale = 1;
function webglOK() { try { const c = document.createElement('canvas'); return !!(c.getContext('webgl2') || c.getContext('webgl')); } catch (e) { return false; } }
function glFail(why) {
  noGL = true; root.classList.add('no-gl'); root.classList.remove('gl-on');
  if (why) console.warn('[kusluk] 3D off:', why);
}
function horizonFrac() { return G.vw < 760 ? 0.5 : 0.52; }
function resizeGL() {
  if (!scene) return;
  const w = win.clientWidth, h = win.clientHeight;
  const cap = CAPTURE ? 2 : lowPower ? 1.25 : 1.5;
  scene.setSize(w, h, Math.min(devicePixelRatio || 1, cap) * dprScale, horizonFrac());
}
async function initGL() {
  if (!webglOK()) return glFail('no WebGL');
  try {
    const { createScene } = await import('./scene.js');
    scene = createScene(canvas, { lowPower, capture: !!CAPTURE, waterNormals: new URL('../img/waternormals-512.jpg', import.meta.url).href });
    canvas.addEventListener('webglcontextlost', (e) => { e.preventDefault(); scene = null; glFail('context lost'); });
    resizeGL();
    scene.setSun(S.t);
    scene.place(lastX < 0 ? 0 : lastX, slots);
    scene.flushEnv();
    scene.render(0, false);
    requestAnimationFrame(() => root.classList.add('gl-on'));
    scene.precompile();
  } catch (err) { scene = null; glFail(err && err.message); }
}
if ('IntersectionObserver' in window) {
  new IntersectionObserver((es) => { for (const e of es) stageVisible = e.isIntersecting; }, { rootMargin: '40px' }).observe(stage);
}

// ------------------------------------------------------------ the frame
let last = performance.now(), ft = [], frames = 0;
function frame(now) {
  requestAnimationFrame(frame);
  const dt = Math.min((now - last) / 1000, 0.1); last = now;
  const x = railX();
  if (x !== lastX) { lastX = x; applyRail(x); }
  tickSun(now);
  const ta = performance.now();
  applySun(S.t);
  const tb = performance.now();
  if (scene && stageVisible && !document.hidden) {
    const t0 = performance.now();
    scene.place(x, slots);
    scene.setSun(S.t, dragging);
    const tc = performance.now();
    const drew = scene.render(dt, !reduce && !CAPTURE);
    const td = performance.now();
    if (PERF) PERF.push([+(tb - ta).toFixed(2), +(tc - t0).toFixed(2), +(td - tc).toFixed(2)]);
    // Fill-rate guard: if drawing itself stays slow, render fewer pixels.
    if (drew && !CAPTURE && frames++ > 60) {
      ft.push(td - tc);
      if (ft.length >= 120) {
        ft.sort((a, b) => a - b);
        const med = ft[60]; ft = [];
        if (med > 20 && dprScale > 0.85) { dprScale = Math.max(0.85, dprScale - 0.15); resizeGL(); }
      }
    }
  }
}

function relayout() { measure(); measureTrack(); resizeGL(); applyRail(railX()); applySun(S.t, true); }
let rw = innerWidth;
addEventListener('resize', () => {
  if (lowPower && innerWidth === rw) return; // URL bar show/hide on phones
  rw = innerWidth;
  requestAnimationFrame(relayout);
});

// boot
measure();
measureTrack();
S.t = G.anchors[0].t;
applyRail(railX());
applySun(S.t, true);
updatePreview();
if (!CAPTURE) drawBloom(document.getElementById('bloom'));
if (CAPTURE && params.has('t')) { S.mode = 'manual'; S.t = clamp(Number(params.get('t')), 0, 1); }
document.fonts && document.fonts.ready.then(() => { requestAnimationFrame(relayout); });
requestAnimationFrame(frame);
initGL();

// test hooks for the verification scripts (read-only state + a sun setter)
window.__kusluk = {
  get t() { return S.t; }, get mode() { return S.mode; }, get railX() { return lastX; }, get over() { return G.over; },
  setSun(t) { setManual(t, false); }, auto() { follow.click(); }, get gl() { return !!scene; }, get dpr() { return dprScale; },
  perf: () => PERF,
  geometry: () => ({ top: G.top, h: G.h, vh: G.vh, over: G.over, anchors: G.anchors.map((a) => [Math.round(a.x), +a.t.toFixed(3)]) }),
};
