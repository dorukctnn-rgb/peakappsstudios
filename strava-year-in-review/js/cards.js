/* Yearlap story cards: 1080 x 1920 PNGs (9:16, the size of a phone story), drawn on a canvas in this tab from your numbers.
 * Every card carries the page's address at the foot, small, so a shared card says where it came from. */
import { fill } from './i18n.js';
import { CAT } from './engine.js';

export const W = 1080, H = 1920;
export const DISPLAY = '"Yearlap Display", "Arial Black", sans-serif';
export const TEXT = '"Yearlap Text", "Segoe UI", system-ui, sans-serif';
export const C = { night: '#0f1b2d', deep: '#18283f', red: '#ff3d57', glacier: '#b9e4f4', chalk: '#eef2f4', white: '#ffffff', gold: '#ffc53d', muted: '#93a3b8', ink: '#0f1b2d' };
export const FAM = { run: '#ff3d57', ride: '#b9e4f4', swim: '#6fd8c4', walk: '#ffc53d', winter: '#ffffff', water: '#8fb4ff', gym: '#d2b6ff', other: '#93a3b8' };

export const CARD_TYPES = [
  { id: 'year', free: true },
  { id: 'sports', free: true },
  { id: 'clock', free: true },
  { id: 'months' },
  { id: 'highlights' },
  { id: 'compare', needs: 'compare' },
  { id: 'alltime', needs: 'alltime' },
  { id: 'gear', needs: 'gear' },
  { id: 'routes', needs: 'routes' },
];

export function font(ctx, size, family, weight = 400) { ctx.font = `${family === DISPLAY ? 'italic 800' : weight} ${size}px ${family}`; }
export function fit(ctx, text, maxW, size, family, weight = 400, min = 24) {
  let s = size;
  font(ctx, s, family, weight);
  while (ctx.measureText(text).width > maxW && s > min) { s -= 2; font(ctx, s, family, weight); }
  let t = String(text);
  if (ctx.measureText(t).width > maxW) {
    while (t.length > 1 && ctx.measureText(t + '…').width > maxW) t = t.slice(0, -1);
    t = t.trimEnd() + '…';
  }
  return { text: t, size: s };
}
export function write(ctx, text, x, y, maxW, size, family, color, weight = 400, align = 'left', min) {
  const r = fit(ctx, String(text), maxW, size, family, weight, min);
  ctx.fillStyle = color; ctx.textAlign = align; ctx.textBaseline = 'alphabetic';
  ctx.fillText(r.text, x, y);
  return r.size;
}
function lines(ctx, text, x, y, maxW, size, family, color, lh = 1.3, weight = 400) {
  font(ctx, size, family, weight);
  ctx.fillStyle = color; ctx.textAlign = 'left'; ctx.textBaseline = 'alphabetic';
  let line = '', yy = y;
  for (const w of String(text).split(' ')) {
    const test = line ? line + ' ' + w : w;
    if (ctx.measureText(test).width > maxW && line) { ctx.fillText(line, x, yy); line = w; yy += size * lh; } else line = test;
  }
  if (line) ctx.fillText(line, x, yy);
  return yy;
}
// the lap mark: a running-track oval with the year's progress as the red part
export function lapMark(ctx, x, y, w, color, accent, share = 0.72) {
  const h = w * 0.56, r = h / 2, lw = Math.max(2, w * 0.11);
  ctx.save();
  ctx.lineWidth = lw; ctx.lineCap = 'round';
  const path = () => { ctx.beginPath(); ctx.moveTo(x + r, y); ctx.lineTo(x + w - r, y); ctx.arc(x + w - r, y + r, r, -Math.PI / 2, Math.PI / 2); ctx.lineTo(x + r, y + h); ctx.arc(x + r, y + r, r, Math.PI / 2, Math.PI * 1.5); };
  ctx.strokeStyle = color; path(); ctx.stroke();
  ctx.strokeStyle = accent; ctx.setLineDash([(2 * (w - h) + Math.PI * h) * share, 9999]); path(); ctx.stroke();
  ctx.restore();
}
function frame(ctx, bg, ink, label, d) {
  ctx.fillStyle = bg; ctx.fillRect(0, 0, W, H);
  lapMark(ctx, 80, 110, 70, ink === C.white ? 'rgba(255,255,255,0.28)' : 'rgba(15,27,45,0.22)', C.red);
  write(ctx, 'Yearlap', 172, 150, 420, 46, DISPLAY, ink);
  if (label) write(ctx, label, W - 80, 150, 460, 34, TEXT, ink, 600, 'right');
  ctx.globalAlpha = 0.78;
  write(ctx, fill(d.T.made, { addr: d.address }), W / 2, H - 70, W - 160, 28, TEXT, ink, 500, 'center', 18);
  ctx.globalAlpha = 1;
}
// the headline number with its unit on the same line when it fits, else under it
function bigNumber(ctx, value, unit, y, size, color, unitColor) {
  const s = write(ctx, value, 80, y, W - 160, size, DISPLAY, color, 400, 'left', 110);
  font(ctx, s, DISPLAY);
  const vw = ctx.measureText(value).width;
  font(ctx, 72, DISPLAY);
  const uw = ctx.measureText(unit).width;
  if (80 + vw + 24 + uw <= W - 80) write(ctx, unit, 80 + vw + 24, y, uw + 4, 72, DISPLAY, unitColor);
  else write(ctx, unit, 86, y + Math.max(70, s * 0.3), 400, 64, DISPLAY, unitColor);
}
const periodLabel = d => (d.year === 'all' ? d.T.allTime : String(d.year));
// the year strip: one tick per day; gold for the biggest day
export function drawStrip(ctx, strip, x, y, w, h, colors, bigIndex = -1) {
  const n = strip.length, step = w / n;
  const max = Math.max(1, ...strip);
  ctx.fillStyle = colors.base;
  ctx.fillRect(x, y + h - 2, w, 2);
  for (let i = 0; i < n; i++) {
    const v = strip[i];
    if (!v) continue;
    const hh = Math.max(4, Math.sqrt(v / max) * h);
    ctx.fillStyle = i === bigIndex ? colors.big : colors.tick;
    ctx.fillRect(x + i * step, y + h - hh, Math.max(1, step * 0.62), hh);
  }
}
export function drawClock(ctx, clock, x, y, w, rows, colors, f, o = {}) {
  const lab = o.lab || 120, gap = o.gap || 6;
  const cw = (w - lab) / 24, ch = cw * 1.25;
  const fs = o.fs || Math.round(ch * 0.62), hs = o.hs || 26;
  const max = Math.max(1, ...clock);
  for (let wd = 0; wd < 7; wd++) {
    write(ctx, f.wdS[wd], x, y + wd * (ch + gap) + ch * 0.5 + fs * 0.36, lab - 6, fs, TEXT, colors.label, 600, 'left', 8);
    for (let h = 0; h < 24; h++) {
      const v = clock[wd * 24 + h];
      ctx.fillStyle = colors.empty;
      ctx.fillRect(x + lab + h * cw, y + wd * (ch + gap), cw - Math.max(1, cw * 0.12), ch);
      if (v) { ctx.globalAlpha = 0.25 + 0.75 * Math.sqrt(v / max); ctx.fillStyle = colors.full; ctx.fillRect(x + lab + h * cw, y + wd * (ch + gap), cw - Math.max(1, cw * 0.12), ch); ctx.globalAlpha = 1; }
    }
  }
  [0, 6, 12, 18].forEach(h => write(ctx, `${String(h).padStart(2, '0')}:00`, x + lab + h * cw, y + 7 * (ch + gap) + hs * 1.3, cw * 6 - 4, hs, TEXT, colors.label, 500, 'left', 8));
  return 7 * (ch + gap) + hs * 1.6;
}
export function bigIndexOf(s) {
  if (!s.biggestDay || !s.strip || s.year === 'all') return -1;
  const [y, m, d] = s.biggestDay.day.split('-').map(Number);
  return Math.round((Date.UTC(y, m - 1, d) - Date.UTC(s.year, 0, 1)) / 864e5);
}
// fits routes into a grid of cells; every route keeps its own shape and scale inside its cell
export function drawRoutes(ctx, routes, x, y, w, h, opts = {}) {
  const n = routes.length;
  if (!n) return;
  const ratio = w / h;
  let cols = Math.max(1, Math.round(Math.sqrt(n * ratio)));
  let rowsN = Math.ceil(n / cols);
  while (cols * rowsN < n) cols++;
  const cell = Math.min(w / cols, h / rowsN);
  const gx = x + (w - cell * cols) / 2, gy = y + (h - cell * Math.ceil(n / cols)) / 2;
  const pad = cell * (opts.pad || 0.12);
  ctx.lineCap = 'round'; ctx.lineJoin = 'round';
  routes.forEach((r, i) => {
    const cx = gx + (i % cols) * cell, cy = gy + Math.floor(i / cols) * cell;
    const p = r.pts;
    let minX = Infinity, maxX = -Infinity, minY = Infinity, maxY = -Infinity;
    const lat0 = p[0] * Math.PI / 180, k = Math.cos(lat0);
    for (let j = 0; j < p.length; j += 2) { const X = p[j + 1] * k, Y = -p[j]; if (X < minX) minX = X; if (X > maxX) maxX = X; if (Y < minY) minY = Y; if (Y > maxY) maxY = Y; }
    const span = Math.max(maxX - minX, maxY - minY) || 1e-6;
    const sc = (cell - pad * 2) / span;
    const ox = cx + (cell - (maxX - minX) * sc) / 2, oy = cy + (cell - (maxY - minY) * sc) / 2;
    ctx.strokeStyle = (opts.colors && opts.colors[r.cat]) || opts.color || C.red;
    ctx.lineWidth = Math.max(1.2, cell * (opts.line || 0.022));
    ctx.beginPath();
    for (let j = 0; j < p.length; j += 2) {
      const X = ox + (p[j + 1] * k - minX) * sc, Y = oy + (-p[j] - minY) * sc;
      if (j) ctx.lineTo(X, Y); else ctx.moveTo(X, Y);
    }
    ctx.stroke();
  });
}

// d: { T, f (formatter), year, running, stats, compare, alltime, gear, routes, address }
export function drawCard(canvas, type, d) {
  canvas.width = W; canvas.height = H;
  const ctx = canvas.getContext('2d');
  const s = d.stats, f = d.f, K = d.T.cards;
  if (type === 'year') {
    frame(ctx, C.night, C.white, periodLabel(d), d);
    write(ctx, d.year === 'all' ? K.myAll : fill(d.running ? K.myYearRun : K.myYear, { y: d.year }), 80, 360, W - 160, 84, DISPLAY, C.white);
    const big = s.dist > 0 ? f.distNum(s.dist) : f.n(s.moving / 3600);
    bigNumber(ctx, big, s.dist > 0 ? f.du : 'h', 660, 300, C.red, C.white);
    const kp = [[f.n(s.count), K.acts], [f.hours(s.moving), K.time], [f.elev(s.elev), K.elev], [f.n(s.activeDays), K.days]];
    kp.forEach(([v, l], i) => {
      const x = 80 + (i % 2) * 470, y = 920 + Math.floor(i / 2) * 200;
      write(ctx, v, x, y, 440, 96, DISPLAY, C.white);
      write(ctx, l, x, y + 54, 440, 38, TEXT, C.glacier, 600);
    });
    if (s.strip) {
      drawStrip(ctx, s.strip, 80, 1420, W - 160, 300, { base: 'rgba(255,255,255,0.25)', tick: C.glacier, big: C.gold }, bigIndexOf(s));
      write(ctx, f.dateShort(`${d.year}-01-01`), 80, 1765, 300, 28, TEXT, C.muted, 500);
      write(ctx, f.dateShort(`${d.year}-12-31`), W - 80, 1765, 300, 28, TEXT, C.muted, 500, 'right');
    }
    return;
  }
  if (type === 'sports') {
    frame(ctx, C.chalk, C.ink, periodLabel(d), d);
    write(ctx, K.sports, 80, 380, W - 160, 110, DISPLAY, C.ink);
    const list = s.sports.slice(0, 6);
    const max = Math.max(1, ...list.map(x => x.moving));
    let y = 560;
    list.forEach(x => {
      write(ctx, x.type, 80, y, W - 160, 64, DISPLAY, C.ink);
      ctx.fillStyle = 'rgba(15,27,45,0.08)'; ctx.fillRect(80, y + 26, W - 160, 34);
      ctx.fillStyle = x.cat === CAT.RIDE ? '#3f9cc4' : x.cat === CAT.WALK ? '#e0a400' : x.cat === CAT.WINTER ? '#6e86a8' : (FAM[x.cat] || C.red);
      ctx.fillRect(80, y + 26, Math.max(10, (W - 160) * (x.moving / max)), 34);
      write(ctx, `${f.n(x.count)} ${K.acts}, ${f.hours(x.moving)}${x.dist > 0 ? ', ' + f.dist(x.dist) : ''}`, 80, y + 108, W - 160, 38, TEXT, C.ink, 500);
      y += 210;
    });
    return;
  }
  if (type === 'clock') {
    frame(ctx, C.night, C.white, periodLabel(d), d);
    write(ctx, K.clock, 80, 380, W - 160, 110, DISPLAY, C.white);
    drawClock(ctx, s.clock, 80, 560, W - 160, 7, { label: C.glacier, empty: 'rgba(255,255,255,0.07)', full: C.red }, f);
    if (s.peakHour !== null) {
      const wd = s.weekdays.indexOf(Math.max(...s.weekdays));
      lines(ctx, fill(d.T.clockNote, { h: String(s.peakHour).padStart(2, '0'), wd: f.wdL[wd] }), 80, 1300, W - 160, 52, TEXT, C.white, 1.3, 700);
    }
    lines(ctx, K.clockSub, 80, 1560, W - 160, 36, TEXT, C.glacier, 1.35, 500);
    return;
  }
  if (type === 'months') {
    frame(ctx, C.chalk, C.ink, periodLabel(d), d);
    write(ctx, K.months, 80, 380, W - 160, 110, DISPLAY, C.ink);
    const useDist = s.dist > 0;
    const vals = s.months.map(m => (useDist ? m.dist : m.moving));
    const max = Math.max(1, ...vals);
    const top = vals.indexOf(Math.max(...vals));
    const bw = (W - 160) / 12;
    vals.forEach((v, i) => {
      const h = Math.max(6, (v / max) * 900);
      ctx.fillStyle = i === top ? C.red : C.night;
      ctx.fillRect(80 + i * bw + 8, 1500 - h, bw - 16, h);
      write(ctx, f.monS[i].slice(0, 3), 80 + i * bw + bw / 2, 1550, bw, 28, TEXT, C.ink, 600, 'center', 16);
    });
    write(ctx, `${f.monL[top]}: ${useDist ? f.dist(vals[top]) : f.hours(vals[top])}`, 80, 1660, W - 160, 56, TEXT, C.ink, 700);
    return;
  }
  if (type === 'highlights') {
    frame(ctx, C.night, C.white, periodLabel(d), d);
    write(ctx, K.highlights, 80, 380, W - 160, 110, DISPLAY, C.white);
    const rows = [];
    if (s.longest) rows.push([K.longest, s.longest.dist > 0 ? f.dist(s.longest.dist) : f.dur(s.longest.moving), `${s.longest.name}, ${f.date(s.longest.day)}`]);
    if (s.biggestDay) rows.push([K.biggest, s.biggestDay.dist > 0 ? f.dist(s.biggestDay.dist) : f.hm(s.biggestDay.moving), f.date(s.biggestDay.day)]);
    if (s.streak) rows.push([K.streak, `${f.n(s.streak.days)} ${K.days1}`, fill(d.T.fromTo, { from: f.dateShort(s.streak.from), to: f.dateShort(s.streak.to) })]);
    if (s.mostClimb) rows.push([K.climb, f.elev(s.mostClimb.elev), `${s.mostClimb.name}, ${f.date(s.mostClimb.day)}`]);
    let y = 600;
    rows.forEach(([k, v, sub]) => {
      write(ctx, k, 80, y, W - 160, 38, TEXT, C.glacier, 700);
      write(ctx, v, 80, y + 112, W - 160, 104, DISPLAY, C.red);
      write(ctx, sub, 80, y + 170, W - 160, 36, TEXT, C.white, 500);
      y += 290;
    });
    return;
  }
  if (type === 'compare') {
    frame(ctx, C.chalk, C.ink, K.compare, d);
    write(ctx, K.compare, 80, 380, W - 160, 104, DISPLAY, C.ink);
    const ys = (d.compare || []).slice(-6);
    const useDist = ys.some(e => e.dist > 0);
    const max = Math.max(1, ...ys.map(e => (useDist ? e.dist : e.moving)));
    let y = 560;
    ys.forEach(e => {
      const v = useDist ? e.dist : e.moving;
      write(ctx, String(e.year), 80, y + 62, 220, 70, DISPLAY, C.ink);
      const w = Math.max(12, (W - 520) * (v / max));
      ctx.fillStyle = e.year === ys[ys.length - 1].year ? C.red : C.night;
      ctx.fillRect(300, y + 10, w, 64);
      write(ctx, useDist ? f.distRound(v) : f.hours(v), 300 + w + 20, y + 58, Math.max(160, W - 340 - w), 38, TEXT, C.ink, 700, 'left', 22);
      write(ctx, `${f.n(e.count)} ${K.acts}${e.topSport ? ', ' + e.topSport : ''}`, 300, y + 122, W - 380, 32, TEXT, C.ink, 500);
      y += 200;
    });
    return;
  }
  if (type === 'alltime') {
    const a = d.alltime || s;
    frame(ctx, C.night, C.white, K.alltime, d);
    write(ctx, K.alltime, 80, 380, W - 160, 110, DISPLAY, C.white);
    const big = a.dist > 0 ? f.distNum(a.dist) : f.n(a.moving / 3600);
    bigNumber(ctx, big, a.dist > 0 ? f.du : 'h', 680, 280, C.red, C.white);
    if (a.firstDay) write(ctx, fill(K.since, { date: f.date(a.firstDay) }), 80, 850, W - 160, 44, TEXT, C.glacier, 600);
    const kp = [[f.n(a.count), K.acts], [f.hours(a.moving), K.time], [f.elev(a.elev), K.elev], [f.n(a.activeDays), K.days]];
    kp.forEach(([v, l], i) => {
      const x = 80 + (i % 2) * 470, y = 1060 + Math.floor(i / 2) * 210;
      write(ctx, v, x, y, 440, 96, DISPLAY, C.white);
      write(ctx, l, x, y + 54, 440, 38, TEXT, C.glacier, 600);
    });
    if (a.years && a.years.length > 1) {
      const max = Math.max(1, ...a.years.map(y => y.moving));
      const bw = (W - 160) / a.years.length;
      a.years.forEach((y, i) => { const h = Math.max(4, (y.moving / max) * 180); ctx.fillStyle = C.glacier; ctx.fillRect(80 + i * bw + 3, 1700 - h, Math.max(2, bw - 6), h); });
    }
    return;
  }
  if (type === 'gear') {
    frame(ctx, C.chalk, C.ink, periodLabel(d), d);
    write(ctx, f.imperial ? K.gear : K.gearKm, 80, 380, W - 160, 96, DISPLAY, C.ink);
    const list = (d.gear || []).slice(0, 5);
    let y = 580;
    list.forEach(g => {
      write(ctx, g.name, 80, y, W - 160, 52, TEXT, C.ink, 800);
      write(ctx, f.dist(g.life.dist), 80, y + 100, W - 160, 92, DISPLAY, g.kind === 'bike' ? '#2b86b0' : C.red);
      write(ctx, `${d.year === 'all' ? '' : d.year + ': ' + f.dist(g.year.dist) + ', '}${f.n(g.life.count)} ${K.acts}`, 80, y + 152, W - 160, 34, TEXT, C.ink, 500);
      y += 250;
    });
    return;
  }
  if (type === 'routes') {
    frame(ctx, C.night, C.white, periodLabel(d), d);
    write(ctx, K.routes, 80, 360, W - 160, 104, DISPLAY, C.white);
    const rs = d.routes || [];
    write(ctx, fill(K.routesSub, { n: f.n(rs.length), dist: f.distRound(rs.reduce((x, r) => x + r.dist, 0)) }), 80, 430, W - 160, 40, TEXT, C.glacier, 600);
    drawRoutes(ctx, rs, 70, 500, W - 140, 1240, { colors: FAM, line: 0.03 });
  }
}

export function cardFileName(type, year) {
  return `yearlap-${year === 'all' ? 'all-time' : year}-${type}.png`;
}
