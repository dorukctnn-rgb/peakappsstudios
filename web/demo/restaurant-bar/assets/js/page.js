// Kehribar demo page: personalisation from data, the booking composer, and the scroll that steers the 3D drink.
// A personalised draft is the same page with #d=<base64url JSON> (or #z= for deflate-raw). Only what the data carries is shown;
// everything else turns into a clearly marked placeholder. Nothing from the data is ever written as HTML (textContent only).
const doc = document.documentElement;
const reduced = matchMedia('(prefers-reduced-motion: reduce)').matches;
const coarse = matchMedia('(pointer: coarse)').matches;
const T = JSON.parse(document.getElementById('i18n').textContent);
const params = new URLSearchParams(location.search);
const capture = params.has('capture');
const $ = (s, r = document) => r.querySelector(s);
const $$ = (s, r = document) => [...r.querySelectorAll(s)];
const fill = (tpl, o) => tpl.replace(/\{(\w+)\}/g, (_, k) => (o[k] ?? ''));

// ---------------------------------------------------------------- colours
const hexRgb = (h) => [1, 3, 5].map((i) => parseInt(h.slice(i, i + 2), 16));
const rgbHex = (c) => `#${c.map((v) => Math.max(0, Math.min(255, Math.round(v))).toString(16).padStart(2, '0')).join('')}`;
const lin = (v) => { v /= 255; return v <= 0.04045 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4; };
const lum = (h) => { const [r, g, b] = hexRgb(h); return 0.2126 * lin(r) + 0.7152 * lin(g) + 0.0722 * lin(b); };
const contrast = (a, b) => { const x = lum(a); const y = lum(b); return (Math.max(x, y) + 0.05) / (Math.min(x, y) + 0.05); };
function rgbHsl([r, g, b]) { r /= 255; g /= 255; b /= 255; const mx = Math.max(r, g, b); const mn = Math.min(r, g, b); const l = (mx + mn) / 2; if (mx === mn) return [0, 0, l]; const d = mx - mn; const s = l > 0.5 ? d / (2 - mx - mn) : d / (mx + mn); const h = mx === r ? (g - b) / d + (g < b ? 6 : 0) : mx === g ? (b - r) / d + 2 : (r - g) / d + 4; return [h * 60, s, l]; }
function hslHex([h, s, l]) { h = (((h % 360) + 360) % 360) / 360; const f = (p, q, t) => { if (t < 0) t += 1; if (t > 1) t -= 1; if (t < 1 / 6) return p + (q - p) * 6 * t; if (t < 1 / 2) return q; if (t < 2 / 3) return p + (q - p) * (2 / 3 - t) * 6; return p; }; if (s === 0) return rgbHex([l * 255, l * 255, l * 255]); const q = l < 0.5 ? l * (1 + s) : l + s - l * s; const p = 2 * l - q; return rgbHex([f(p, q, h + 1 / 3) * 255, f(p, q, h) * 255, f(p, q, h - 1 / 3) * 255]); }
const NIGHT = '#0d0a08';
function lighten(hex, against, min) { // move lightness up until the contrast is reached (hue kept)
  let [h, s, l] = rgbHsl(hexRgb(hex));
  for (let i = 0; i < 60 && contrast(hslHex([h, s, l]), against) < min; i++) l = Math.min(1, l + 0.015);
  return hslHex([h, s, l]);
}

// ---------------------------------------------------------------- data
const HEX = /^#[0-9a-f]{6}$/i;
const clean = (s, max) => (typeof s === 'string' ? s.replace(/[\u0000-\u001f\u007f<>]/g, ' ').replace(/\s+/g, ' ').trim().slice(0, max) : '');
const https = (u) => { try { const x = new URL(String(u)); return x.protocol === 'https:' && x.href.length <= 400 ? x.href : null; } catch { return null; } };
function b64urlBytes(s) { const b = atob(s.replace(/-/g, '+').replace(/_/g, '/') + '==='.slice((s.length + 3) % 4)); return Uint8Array.from(b, (c) => c.charCodeAt(0)); }
async function readData() {
  const src = `${location.hash.slice(1)}&${location.search.slice(1)}`;
  const m = /(?:^|&)(d|z)=([A-Za-z0-9_-]{8,12000})/.exec(src);
  if (!m) return null;
  try {
    let bytes = b64urlBytes(m[2]);
    if (m[1] === 'z') {
      if (!('DecompressionStream' in window)) return null;
      const st = new Blob([bytes]).stream().pipeThrough(new DecompressionStream('deflate-raw'));
      bytes = new Uint8Array(await new Response(st).arrayBuffer());
    }
    const j = JSON.parse(new TextDecoder().decode(bytes));
    const name = clean(j.n, 60);
    if (!name) return null;
    return {
      name,
      kind: clean(j.k, 24),
      logo: https(j.l),
      plate: j.lt === 'dark',
      colours: (Array.isArray(j.c) ? j.c : []).filter((c) => HEX.test(c)).slice(0, 3),
      menu: (Array.isArray(j.m) ? j.m : []).slice(0, 6).map((x) => ({ n: clean(x && x.n, 60), d: clean(x && x.d, 140), p: clean(x && x.p, 16) })).filter((x) => x.n),
      site: clean(j.s, 80).replace(/^https?:\/\//, '').replace(/\/.*$/, ''),
    };
  } catch { return null; }
}

// ---------------------------------------------------------------- drinks (glass shape + liquid colour)
const DRINKS = [
  { R: 0.40, W: 0.028, B: 0.13, H: 0.92, Hl: 0.66, flutes: 26, F: 0.32, colour: [1.0, 0.52, 0.15] },
  { R: 0.40, W: 0.028, B: 0.13, H: 0.92, Hl: 0.62, flutes: 0, F: 0, colour: [0.86, 0.07, 0.08] },
  { R: 0.30, W: 0.022, B: 0.17, H: 1.36, Hl: 1.12, flutes: 30, F: 0.28, colour: [0.80, 0.95, 0.55] },
];
// a brand colour as a drink: same hue, a saturation and lightness that still read as liquid
function liquidFrom(hex, light = 0.5) {
  const [h, s] = rgbHsl(hexRgb(hex));
  const c = hexRgb(hslHex([h, Math.max(0.55, Math.min(0.95, s)), light]));
  return c.map((v) => Math.max(0.05, lin(v)));
}

let data = null;
let brand = { accentText: '#f0b45a', coasterInk: '#d9b77a', coasterBase: '#1c130f', bokeh: [] };

function applyData(d) {
  doc.classList.add('is-draft');
  const nameLong = d.name.length > 14;
  for (const el of $$('[data-name]')) { el.textContent = d.name; if (nameLong && !el.closest('.brand')) el.classList.add('is-long'); }
  document.title = fill(T.title, { name: d.name });
  const flag = $('[data-flag]'); flag.textContent = fill(T.flag, { name: d.name });
  const kind = T.kinds[d.kind] || T.kinds['restaurant-bar'];
  $('[data-kind]').textContent = kind;
  const line = $('[data-line]'); line.textContent = T.lead; line.classList.add('is-ph');
  // logo: shown only when it loads; a dark logo sits on a light plate
  if (d.logo) {
    const img = $('.brand__logo'); const b = $('[data-brand]');
    img.referrerPolicy = 'no-referrer';
    img.onload = () => { img.hidden = false; b.classList.add('has-logo'); if (d.plate) b.classList.add('is-plate'); };
    img.onerror = () => { img.remove(); };
    img.alt = d.name;
    img.src = d.logo;
  }
  // colours
  if (d.colours.length) {
    const p = d.colours[0];
    const btn = contrast(p, '#14100c') >= 4.5 ? { bg: p, ink: '#14100c' } : contrast(p, '#ffffff') >= 4.5 ? { bg: p, ink: '#ffffff' } : { bg: lighten(p, '#14100c', 4.6), ink: '#14100c' };
    const text = lighten(p, NIGHT, 5.0);
    doc.style.setProperty('--accent', btn.bg);
    doc.style.setProperty('--accent-ink', btn.ink);
    doc.style.setProperty('--accent-text', text);
    const [h, s] = rgbHsl(hexRgb(p));
    brand.coasterBase = hslHex([h, Math.min(0.45, s), 0.09]);
    brand.coasterInk = lighten(hslHex([h, Math.min(0.6, s), 0.62]), brand.coasterBase, 6);
    brand.accentText = text;
    brand.bokeh = d.colours.slice(0, 2).map((c) => hexRgb(lighten(c, NIGHT, 6)).map((v) => lin(v) * 0.9));
    DRINKS[1].colour = liquidFrom(p, 0.46);
    DRINKS[2].colour = liquidFrom(d.colours[1] || hslHex([h + 35, s, 0.5]), 0.6);
  }
  // signature drinks become placeholders
  $('[data-sig-title]').textContent = T.sigTitle;
  for (const it of $$('.sig__item')) {
    it.classList.add('is-ph-item');
    $('[data-sig-name]', it).textContent = T.sigItem;
    $('[data-sig-desc]', it).textContent = T.sigText;
    $('[data-sig-price]', it).textContent = '00';
  }
  $('[data-sig-note]').textContent = T.sigNote;
  // menu: real items from the business's own site, the rest placeholders
  const cols = $$('.menu__col');
  const row = (n, desc, price, cls) => {
    const li = document.createElement('li'); li.className = `dish ${cls}`;
    const a = document.createElement('span'); a.className = 'dish__name'; a.textContent = n;
    const lead = document.createElement('span'); lead.className = 'dish__lead'; lead.setAttribute('aria-hidden', 'true');
    const pr = document.createElement('span'); pr.className = 'dish__price'; pr.textContent = price;
    const ds = document.createElement('span'); ds.className = 'dish__desc'; ds.textContent = desc;
    li.append(a, lead, pr, ds); return li;
  };
  const ph = (k) => Array.from({ length: k }, () => row(T.dishHere, T.dishDesc, '00', 'is-ph'));
  if (d.menu.length) {
    $('[data-col-title]', cols[0]).textContent = T.menuReal;
    $('ul', cols[0]).replaceChildren(...d.menu.map((x) => row(x.n, x.d, x.p, 'is-real')));
    $('[data-col-title]', cols[1]).textContent = T.more;
    $('ul', cols[1]).replaceChildren(...ph(3));
    $('[data-menu-note]').textContent = fill(T.menuNoteReal, { site: d.site || '' });
  } else {
    for (const c of cols) $('ul', c).replaceChildren(...ph(4));
    $('[data-menu-note]').textContent = T.menuNoteNone;
  }
  $('[data-menu-lede]').textContent = T.menuLede;
  $('[data-book-text]').textContent = T.bookText;
  // room, hours
  const room = $('.room'); room.classList.add('is-ph');
  for (const f of $$('.shot', room)) f.dataset.ph = T.photos;
  $('[data-room-text]').textContent = T.roomText;
  const fmt = new Intl.DateTimeFormat(T.locale, { weekday: 'long' });
  const days = Array.from({ length: 7 }, (_, i) => fmt.format(new Date(Date.UTC(2024, 0, 1 + i, 12))));
  $('[data-hours]').replaceChildren(...days.map((dname) => { const w = document.createElement('div'); const dt = document.createElement('dt'); dt.textContent = dname.charAt(0).toLocaleUpperCase(T.locale) + dname.slice(1); const dd = document.createElement('dd'); dd.textContent = '00:00–00:00'; w.append(dt, dd); return w; }));
  $('.hours').classList.add('is-ph');
  $('[data-hours-note]').textContent = T.hoursHere;
  $('[data-foot]').textContent = fill(d.menu.length && d.site ? T.footReal : T.foot, { name: d.name, site: d.site });
}

// ---------------------------------------------------------------- header, language links, composer
const bar = $('#bar');
const onScrollBar = () => bar.classList.toggle('is-scrolled', scrollY > 40);
addEventListener('scroll', onScrollBar, { passive: true }); onScrollBar();
const keepHash = () => { for (const a of $$('[data-keep-hash]')) { const base = a.getAttribute('href').split('#')[0]; if (data && location.hash) a.href = base + location.hash; } };

const form = $('[data-composer]');
const msg = $('[data-msg]');
const toast = $('[data-toast]');
function compose() {
  const f = new FormData(form);
  const name = data ? data.name : 'Kehribar';
  msg.textContent = fill(T.msg, { name, n: f.get('n'), day: T.dayWords[f.get('day')] || '', time: f.get('time') });
}
form.addEventListener('change', () => { compose(); toast.hidden = true; });
$('[data-send]').addEventListener('click', () => { toast.textContent = T.toast; toast.hidden = false; });

// ---------------------------------------------------------------- 3D
const stage = $('#stage');
const canvas = $('.stage__gl');
const items = $$('.sig__item');
const hint = $('[data-hint]');
if (coarse && hint) hint.textContent = hint.dataset.touch;
let sc = null;

function view() {
  const w = innerWidth; const h = innerHeight;
  const tall = h > w * 1.05 || w < 760;
  if (tall) return { tall, shiftX: 0, shiftY: -0.30, fov: 34, d: 5.5 };
  return { tall, shiftX: -0.44, shiftY: 0.02, fov: 24, d: 4.6 };
}
let V = view();
const lerp = (a, b, t) => a + (b - a) * t;
const clamp = (x, a, b) => Math.max(a, Math.min(b, x));
// camera and lamp for the hero (h) and for each drink
const KEYS = [
  { yaw: -0.30, pitch: 0.30, dk: 0.92, laz: 0.18, lel: 0.40, ty: 0.36 },
  { yaw: 0.28, pitch: 0.22, dk: 0.92, laz: -0.38, lel: 0.44, ty: 0.36 },
  { yaw: -0.12, pitch: 0.20, dk: 1.12, laz: 0.04, lel: 0.34, ty: 0.62 },
];
const HERO = { yaw: 0.0, pitch: 0.24, dk: 1.0, laz: -0.15, lel: 0.36, ty: 0.36 };
let lastActive = -1;
function steer() {
  const vh = innerHeight;
  const hp = clamp(scrollY / vh, 0, 1);
  let f = 0;
  let best = 1e9;
  items.forEach((el, i) => { const r = el.getBoundingClientRect(); const c = r.top + r.height / 2; const dd = (vh / 2 - c) / r.height; if (Math.abs(dd) < best) { best = Math.abs(dd); f = i + clamp(dd, -0.5, 0.5); } });
  f = clamp(f, 0, items.length - 1);
  const i0 = Math.floor(f); const i1 = Math.min(items.length - 1, i0 + 1); const t = f - i0;
  const e = (k) => lerp(KEYS[i0][k], KEYS[i1][k], t);
  const k = (key) => lerp(HERO[key], e(key), hp);
  const active = hp > 0.6 ? Math.round(f) : -1;
  if (active !== lastActive) { items.forEach((el, i) => el.classList.toggle('is-active', i === active)); lastActive = active; }
  if (!sc) return;
  const drink = hp < 0.85 ? 0 : f;
  sc.set({ yaw: k('yaw') * (V.tall ? 0.6 : 1), pitch: k('pitch'), dist: V.d * k('dk'), lightAz: k('laz'), lightEl: k('lel'), ty: k('ty'), drink });
  if (reduced || (capture && !params.has('video'))) { sc.snap(); sc.renderAt(window.__kbT ?? 1.3); }
}
let ticking = false;
addEventListener('scroll', () => { if (!ticking) { ticking = true; requestAnimationFrame(() => { ticking = false; steer(); }); } }, { passive: true });
addEventListener('resize', () => { V = view(); if (sc) { sc.setView({ shiftX: V.shiftX, shiftY: V.shiftY, fov: V.fov }); sc.resize(); } steer(); });
steer();

function pickQuality() {
  if (params.get('q')) return params.get('q');
  const small = Math.min(screen.width, screen.height) < 820;
  if (coarse && small) return 'low';
  if ((navigator.hardwareConcurrency || 8) <= 4) return 'mid';
  return 'high';
}
function webgl2() { try { const c = document.createElement('canvas'); return !!c.getContext('webgl2'); } catch { return false; } }

let booting = false;
async function startGL() {
  if (booting) return; booting = true;
  if (!webgl2() || (navigator.connection && navigator.connection.saveData)) return;
  try {
    const mod = await import('../app/scene.js');
    try { await Promise.race([document.fonts.ready, new Promise((r) => setTimeout(r, 1500))]); } catch { /* ignore */ }
    sc = await mod.createScene({
      canvas, quality: pickQuality(), drinks: DRINKS, reduced: reduced || (capture && !params.has('video')), bokehColours: brand.bokeh,
      coaster: { text: data ? data.name : 'Kehribar', ink: brand.coasterInk, base: brand.coasterBase, font: '"Kb Display", Georgia, serif' },
      autoSway: coarse,
    });
    V = view();
    sc.setView({ shiftX: V.shiftX, shiftY: V.shiftY, fov: V.fov });
    steer(); sc.snap();
    sc.renderAt(1.3);
    if (!reduced && !capture) watch();
    requestAnimationFrame(() => doc.classList.add('gl-on'));
    window.__kb = { sc, steer, view: () => V };
  } catch (e) { if (capture) window.__kbErr = String(e && e.stack || e); }
}
// render only while the stage is on screen and the tab is visible
function watch() {
  let onScreen = true;
  const sync = () => { if (onScreen && !document.hidden) sc.start(); else sc.stop(); };
  new IntersectionObserver((es) => { onScreen = es[0].isIntersecting; sync(); }, { rootMargin: '0px' }).observe(stage);
  document.addEventListener('visibilitychange', sync);
  sync();
}
// the lamp follows the cursor; a click or tap on the scene rings the drink
addEventListener('pointermove', (e) => { if (sc && e.pointerType === 'mouse') sc.pointer((e.clientX / innerWidth) * 2 - 1, (e.clientY / innerHeight) * 2 - 1); }, { passive: true });
stage.addEventListener('pointerdown', (e) => {
  if (!sc || e.target.closest('a, button, input, label')) return;
  const r = canvas.getBoundingClientRect();
  if (sc.tap(((e.clientX - r.left) / r.width) * 2 - 1, -(((e.clientY - r.top) / r.height) * 2 - 1)) && reduced) sc.renderAt(1.3);
});

// ---------------------------------------------------------------- go
(async () => {
  data = await readData();
  if (data) applyData(data);
  keepHash();
  compose();
  if (capture) { if (params.has('bare')) doc.classList.add('is-bare'); await startGL(); window.__kbReady = true; return; }
  const kicks = ['scroll', 'wheel', 'touchstart', 'pointerdown', 'pointermove', 'keydown'];
  const go = () => { kicks.forEach((k) => removeEventListener(k, go)); startGL(); };
  kicks.forEach((k) => addEventListener(k, go, { passive: true, once: true }));
  // a wide screen with a mouse also starts on its own after a short wait; phones wait for the first touch or scroll
  if (!coarse && Math.min(innerWidth, innerHeight) >= 700) {
    const idle = () => ('requestIdleCallback' in window ? requestIdleCallback(go, { timeout: 2000 }) : go());
    if (document.readyState === 'complete') setTimeout(idle, 3500); else addEventListener('load', () => setTimeout(idle, 3500), { once: true });
  }
})();
