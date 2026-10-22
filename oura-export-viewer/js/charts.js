/* Nightjar's charts: the night weave (canvas, every night as a column of sleep stages), and small SVG charts for one
 * night and for trends. Colours of the stages are fixed; the rest take the page's colours through CSS classes. */

export const STAGE = { '1': '#2b2f85', '2': '#93a6ec', '3': '#43c0b3', '4': '#f4a259' };
export const STAGE_KEY = { '1': 'deep', '2': 'light', '3': 'rem', '4': 'awake' };
const esc = s => String(s).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));

// minutes after 18:00 of the evening before (a 01:30 start is 450, a 23:00 start is 300)
export const eveningMin = m => (m >= 720 ? m - 1080 : m + 360);

/* ---------- the weave ---------- */
// nights: [{ day, start (minutes after midnight), phases ('1'..'4' per 5 minutes) }]; returns the geometry for clicks.
export function weaveGeometry(nights, w, h, pad = { l: 46, r: 8, t: 10, b: 22 }) {
  let lo = Infinity, hi = -Infinity;
  for (const n of nights) {
    if (n.start === null || n.start === undefined || !n.phases) continue;
    const s = eveningMin(n.start);
    lo = Math.min(lo, s); hi = Math.max(hi, s + n.phases.length * 5);
  }
  if (!Number.isFinite(lo)) { lo = 300; hi = 840; }
  lo = Math.max(0, Math.floor(lo / 60) * 60); hi = Math.min(1440, Math.ceil(hi / 60) * 60);
  const colW = (w - pad.l - pad.r) / Math.max(1, nights.length);
  return { lo, hi, pad, colW, w, h, x0: pad.l, top: pad.t, bottom: h - pad.b, yOf: m => pad.t + ((m - lo) / (hi - lo)) * (h - pad.t - pad.b) };
}

export function drawWeave(canvas, nights, opts = {}) {
  const dpr = opts.dpr || Math.min(2, (typeof window !== 'undefined' && window.devicePixelRatio) || 1);
  const w = opts.width || canvas.clientWidth || 900, h = opts.height || canvas.clientHeight || 300;
  canvas.width = Math.round(w * dpr); canvas.height = Math.round(h * dpr);
  const ctx = canvas.getContext('2d');
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  const g = weaveGeometry(nights, w, h, opts.pad);
  ctx.fillStyle = opts.bg || '#14183a';
  ctx.fillRect(0, 0, w, h);
  // hour lines and labels
  ctx.font = `500 ${opts.labelSize || 11}px ${opts.font || 'system-ui, sans-serif'}`;
  ctx.textBaseline = 'middle';
  ctx.textAlign = 'right';
  const step = g.hi - g.lo > 720 ? 180 : 120;
  for (let m = Math.ceil(g.lo / step) * step; m <= g.hi; m += step) {
    const y = Math.round(g.yOf(m)) + 0.5;
    ctx.strokeStyle = 'rgba(255,255,255,0.10)'; ctx.lineWidth = 1;
    ctx.beginPath(); ctx.moveTo(g.x0, y); ctx.lineTo(w - g.pad.r, y); ctx.stroke();
    const clock = (m + 1080) % 1440;
    ctx.fillStyle = 'rgba(255,255,255,0.62)';
    ctx.fillText(`${String(Math.floor(clock / 60)).padStart(2, '0')}:00`, g.x0 - 8, y);
  }
  const gap = g.colW > 5 ? 1 : 0;
  const slot = (g.yOf(g.lo + 5) - g.yOf(g.lo));
  nights.forEach((n, i) => {
    const x = g.x0 + i * g.colW;
    if (n.start === null || n.start === undefined || !n.phases) {
      ctx.fillStyle = 'rgba(255,255,255,0.05)';
      ctx.fillRect(x, g.top, Math.max(1, g.colW - gap), g.bottom - g.top);
      return;
    }
    const s = eveningMin(n.start);
    let k = 0;
    const ph = n.phases;
    while (k < ph.length) {
      let j = k; while (j < ph.length && ph[j] === ph[k]) j++;
      ctx.fillStyle = STAGE[ph[k]] || '#555';
      const y = g.yOf(s + k * 5);
      ctx.fillRect(x, y, Math.max(1, g.colW - gap), Math.max(slot * (j - k), 0.6));
      k = j;
    }
  });
  if (opts.selected !== undefined && opts.selected !== null && opts.selected >= 0) {
    const x = g.x0 + opts.selected * g.colW;
    ctx.strokeStyle = '#ffffff'; ctx.lineWidth = 2;
    ctx.strokeRect(x - 1.5, g.top - 3, Math.max(3, g.colW - gap) + 3, g.bottom - g.top + 6);
  }
  // month marks along the foot
  if (opts.monthLabel) {
    ctx.textAlign = 'left'; ctx.textBaseline = 'alphabetic'; ctx.fillStyle = 'rgba(255,255,255,0.62)';
    let lastX = -1e9;
    nights.forEach((n, i) => {
      if (n.day.slice(8) !== '01' && i !== 0) return;
      const x = g.x0 + i * g.colW;
      if (x - lastX < 46) return;
      ctx.fillText(opts.monthLabel(n.day), x, h - 6); lastX = x;
    });
  }
  return g;
}

/* ---------- one night ---------- */
const LANES = ['4', '3', '2', '1'];
export function hypnogramSvg(phases, startMin, T, width) {
  if (!phases) return '';
  const W = Math.max(300, Math.round(width || 1000)), H = 190, l = W < 520 ? 78 : 96, r = 8, t = 8, b = 26;
  const laneH = (H - t - b) / 4;
  const x = k => l + (k / phases.length) * (W - l - r);
  let rects = '';
  let k = 0;
  while (k < phases.length) {
    let j = k; while (j < phases.length && phases[j] === phases[k]) j++;
    const lane = LANES.indexOf(phases[k]);
    rects += `<rect x="${x(k).toFixed(1)}" y="${(t + lane * laneH + 3).toFixed(1)}" width="${Math.max(1, x(j) - x(k)).toFixed(1)}" height="${(laneH - 6).toFixed(1)}" rx="2" fill="${STAGE[phases[k]]}"/>`;
    k = j;
  }
  let labels = '';
  LANES.forEach((c, i) => { labels += `<text class="c-lab" x="${l - 10}" y="${(t + i * laneH + laneH / 2 + 4).toFixed(1)}" text-anchor="end">${esc(T.stages[STAGE_KEY[c]])}</text><line class="c-grid" x1="${l}" x2="${W - r}" y1="${(t + (i + 1) * laneH).toFixed(1)}" y2="${(t + (i + 1) * laneH).toFixed(1)}"/>`; });
  let ticks = '';
  const total = phases.length * 5;
  const hstep = W < 560 ? 120 : 60;
  for (let m = 60 - (startMin % 60) + (W < 560 && Math.floor(((startMin + 60 - (startMin % 60)) % 1440) / 60) % 2 ? 60 : 0); m < total; m += hstep) {
    const xx = l + (m / total) * (W - l - r);
    const c = (startMin + m) % 1440;
    ticks += `<text class="c-lab" x="${xx.toFixed(1)}" y="${H - 6}" text-anchor="middle">${String(Math.floor(c / 60)).padStart(2, '0')}:00</text>`;
  }
  return `<svg class="hyp" viewBox="0 0 ${W} ${H}" role="img" aria-label="${esc(T.weaveAxis)}">${labels}${rects}${ticks}</svg>`;
}

function niceTicks(lo, hi, n = 4) {
  if (!(hi > lo)) { hi = lo + 1; lo = lo - 1; }
  const raw = (hi - lo) / n, mag = Math.pow(10, Math.floor(Math.log10(raw))), f = raw / mag;
  const step = (f < 1.5 ? 1 : f < 3 ? 2 : f < 7 ? 5 : 10) * mag;
  const out = [];
  for (let v = Math.ceil(lo / step) * step; v <= hi + 1e-9; v += step) out.push(Math.round(v / step) * step);
  return { ticks: out, lo: Math.min(lo, out[0]), hi: Math.max(hi, out[out.length - 1]) };
}

export function nightCurveSvg(hr, hrv, startMin, T, width) {
  const W = Math.max(300, Math.round(width || 1000)), H = 230, l = 48, r = 48, t = 12, b = 26;
  const items = s => (s && s.items ? s.items : []);
  const a = items(hr), v = items(hrv);
  const len = Math.max(a.length, v.length);
  if (!len) return '';
  const interval = (hr && hr.interval) || (hrv && hrv.interval) || 300;
  const x = i => l + (i / Math.max(1, len - 1)) * (W - l - r);
  const ext = arr => { const f = arr.filter(z => z !== null); return f.length ? [Math.min(...f), Math.max(...f)] : [0, 1]; };
  const [a0, a1] = ext(a), [v0, v1] = ext(v);
  const A = niceTicks(a0 - 2, a1 + 2, 4), V = niceTicks(Math.max(0, v0 - 5), v1 + 5, 4);
  const ya = z => t + (1 - (z - A.lo) / (A.hi - A.lo)) * (H - t - b);
  const yv = z => t + (1 - (z - V.lo) / (V.hi - V.lo)) * (H - t - b);
  const path = (arr, y) => { let d = '', pen = false; arr.forEach((z, i) => { if (z === null) { pen = false; return; } d += `${pen ? 'L' : 'M'}${x(i).toFixed(1)} ${y(z).toFixed(1)}`; pen = true; }); return d; };
  let grid = '';
  A.ticks.forEach(z => { grid += `<line class="c-grid" x1="${l}" x2="${W - r}" y1="${ya(z).toFixed(1)}" y2="${ya(z).toFixed(1)}"/><text class="c-lab c-hr" x="${l - 8}" y="${(ya(z) + 4).toFixed(1)}" text-anchor="end">${z}</text>`; });
  V.ticks.forEach(z => { grid += `<text class="c-lab c-hrv" x="${W - r + 8}" y="${(yv(z) + 4).toFixed(1)}">${z}</text>`; });
  let ticks = '';
  const total = (len - 1) * interval / 60;
  const hstep2 = W < 560 ? 120 : 60;
  for (let m = 60 - (startMin % 60); m < total; m += hstep2) {
    const xx = l + (m / total) * (W - l - r), c = (startMin + m) % 1440;
    ticks += `<text class="c-lab" x="${xx.toFixed(1)}" y="${H - 6}" text-anchor="middle">${String(Math.floor(c / 60)).padStart(2, '0')}:00</text>`;
  }
  return `<svg class="curve" viewBox="0 0 ${W} ${H}" role="img" aria-label="${esc(T.hrCurve)}">${grid}${ticks}<path class="c-line-hrv" d="${path(v, yv)}"/><path class="c-line-hr" d="${path(a, ya)}"/></svg>`;
}

/* ---------- trends ---------- */
export function rolling(points, days = 7) {
  const out = [];
  const t = points.map(p => Date.parse(p.day + 'T00:00:00Z'));
  let lo = 0, sum = 0;
  for (let i = 0; i < points.length; i++) {
    sum += points[i].y;
    while (t[i] - t[lo] >= days * 864e5) { sum -= points[lo].y; lo++; }
    const n = i - lo + 1;
    if (n >= Math.min(4, days)) out.push({ day: points[i].day, y: sum / n });
  }
  return out;
}

// points: [{ day, y }] already in plot units; from/to: the period; opts: { zero, axis(v), monthLabel(day), bars }
export function trendSvg(points, from, to, opts = {}) {
  const W = Math.max(300, Math.round(opts.width || 1000)), H = opts.height || 260, l = 56, r = 10, t = 12, b = 28;
  const t0 = Date.parse(from + 'T00:00:00Z'), t1 = Date.parse(to + 'T00:00:00Z');
  const span = Math.max(864e5, t1 - t0);
  const x = day => l + ((Date.parse(day + 'T00:00:00Z') - t0) / span) * (W - l - r);
  if (!points.length) return { svg: `<svg class="trend" viewBox="0 0 ${W} ${H}"></svg>`, x };
  let lo = Math.min(...points.map(p => p.y)), hi = Math.max(...points.map(p => p.y));
  if (opts.zero) { lo = Math.min(lo, 0); hi = Math.max(hi, 0); }
  if (opts.bars) lo = 0;
  const pad = (hi - lo) * 0.08 || 1;
  const Y = niceTicks(opts.bars ? 0 : lo - pad, hi + pad, 4);
  const y = v => t + (1 - (v - Y.lo) / (Y.hi - Y.lo)) * (H - t - b);
  let g = '';
  Y.ticks.forEach(v => { g += `<line class="c-grid${v === 0 && opts.zero ? ' c-zero' : ''}" x1="${l}" x2="${W - r}" y1="${y(v).toFixed(1)}" y2="${y(v).toFixed(1)}"/><text class="c-lab" x="${l - 8}" y="${(y(v) + 4).toFixed(1)}" text-anchor="end">${esc(opts.axis ? opts.axis(v) : v)}</text>`; });
  // month labels
  const d0 = new Date(t0), months = [];
  for (let d = new Date(Date.UTC(d0.getUTCFullYear(), d0.getUTCMonth() + 1, 1)); d.getTime() <= t1; d = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth() + 1, 1))) months.push(d.toISOString().slice(0, 10));
  const every = Math.ceil(months.length / Math.max(3, Math.floor(W / 110))) || 1;
  months.forEach((m, i) => { if (i % every) return; const xx = x(m); g += `<line class="c-grid c-month" x1="${xx.toFixed(1)}" x2="${xx.toFixed(1)}" y1="${t}" y2="${H - b}"/><text class="c-lab" x="${(xx + 4).toFixed(1)}" y="${H - 8}">${esc(opts.monthLabel ? opts.monthLabel(m) : m)}</text>`; });
  let marks = '';
  if (opts.bars) {
    const bw = Math.max(1, ((W - l - r) / Math.max(1, (t1 - t0) / 864e5 + 1)) * 0.7);
    for (const p of points) marks += `<rect class="c-bar" x="${(x(p.day) - bw / 2).toFixed(1)}" y="${y(p.y).toFixed(1)}" width="${bw.toFixed(1)}" height="${Math.max(0, y(0) - y(p.y)).toFixed(1)}"/>`;
  } else {
    const rad = points.length > 200 ? 1.6 : 2.6;
    for (const p of points) marks += `<circle class="c-dot" cx="${x(p.day).toFixed(1)}" cy="${y(p.y).toFixed(1)}" r="${rad}"/>`;
  }
  const avg = rolling(points, 7);
  let line = '';
  if (avg.length > 1) {
    let d = '', prev = null;
    for (const p of avg) { const gapDays = prev ? (Date.parse(p.day) - Date.parse(prev)) / 864e5 : 0; d += `${!prev || gapDays > 6 ? 'M' : 'L'}${x(p.day).toFixed(1)} ${y(p.y).toFixed(1)}`; prev = p.day; }
    line = `<path class="c-avg" d="${d}"/>`;
  }
  return { svg: `<svg class="trend" viewBox="0 0 ${W} ${H}" role="img" aria-label="${esc(opts.label || '')}">${g}${marks}${line}<line class="c-cursor" x1="0" x2="0" y1="${t}" y2="${H - b}" visibility="hidden"/></svg>`, x, W, l, r };
}
