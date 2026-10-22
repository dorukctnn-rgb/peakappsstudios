/* Share cards, 1080 by 1920 pixels (a phone story), drawn on a canvas in this tab from the person's own numbers. */
import { STAGE, drawWeave, eveningMin } from './charts.js';
import { fill, ADDRESS } from './i18n.js';

export const CARD_TYPES = ['recent', 'year', 'weave', 'best', 'clock', 'hrv'];
export const FREE_CARDS = ['recent'];
const CW = 1080, CH = 1920;
const NIGHT = '#14183a', INK = '#ffffff', SOFT = '#c9cdee', DAWN = '#f4a259';

function fonts(lang) {
  const ja = lang === 'ja' ? ', "Hiragino Sans", "Hiragino Kaku Gothic ProN", "Yu Gothic", "Meiryo", "Noto Sans JP"' : '';
  return { d: `"Nightjar Display"${ja}, "Nightjar JA", system-ui, sans-serif`, t: `"Nightjar Text"${ja}, system-ui, sans-serif` };
}
function wrapText(ctx, text, x, y, maxW, lh) {
  const words = /[　-鿿]/.test(text) ? [...text] : text.split(' ');
  const joiner = /[　-鿿]/.test(text) ? '' : ' ';
  let line = '', yy = y;
  for (const w of words) {
    const test = line ? line + joiner + w : w;
    if (ctx.measureText(test).width > maxW && line) { ctx.fillText(line, x, yy); line = w; yy += lh; } else line = test;
  }
  if (line) ctx.fillText(line, x, yy);
  return yy;
}
function frame(ctx, F, T, lang, title) {
  const f = fonts(lang);
  ctx.fillStyle = NIGHT; ctx.fillRect(0, 0, CW, CH);
  // brand mark: four steps of a night
  const mark = [['4', 0], ['2', 1], ['1', 2], ['3', 1]];
  mark.forEach(([c, lv], i) => { ctx.fillStyle = STAGE[c]; ctx.beginPath(); ctx.roundRect(84 + i * 22, 112 + lv * 12, 18, 30 - lv * 4, 4); ctx.fill(); });
  ctx.fillStyle = INK; ctx.font = `800 40px ${f.d}`; ctx.textBaseline = 'alphabetic'; ctx.textAlign = 'left';
  ctx.fillText('Nightjar', 190, 146);
  ctx.font = `800 84px ${f.d}`;
  wrapText(ctx, title, 84, 300, CW - 168, 92);
  ctx.font = `500 30px ${f.t}`; ctx.fillStyle = SOFT;
  wrapText(ctx, T.cardFoot, 84, CH - 132, CW - 168, 40);
  ctx.font = `700 30px ${f.t}`; ctx.fillStyle = DAWN;
  ctx.fillText(ADDRESS, 84, CH - 78);
  return f;
}
function stat(ctx, f, x, y, big, label, color = INK) {
  ctx.textAlign = 'left';
  let size = 96;
  ctx.font = `800 ${size}px ${f.d}`;
  while (size > 48 && ctx.measureText(big).width > 450) { size -= 4; ctx.font = `800 ${size}px ${f.d}`; }
  ctx.fillStyle = color; ctx.fillText(big, x, y);
  ctx.fillStyle = SOFT; ctx.font = `500 32px ${f.t}`; wrapText(ctx, label, x, y + 48, 440, 38);
}
function legend(ctx, f, T, y) {
  ctx.font = `600 28px ${f.t}`; ctx.textAlign = 'left';
  let x = 84;
  for (const [c, k] of [['1', 'deep'], ['2', 'light'], ['3', 'rem'], ['4', 'awake']]) {
    ctx.fillStyle = STAGE[c]; ctx.beginPath(); ctx.roundRect(x, y - 22, 26, 26, 6); ctx.fill();
    ctx.fillStyle = SOFT; ctx.fillText(T.stages[k], x + 36, y);
    x += 36 + ctx.measureText(T.stages[k]).width + 34;
  }
}
function weaveInto(ctx, nights, x, y, w, h) {
  const off = document.createElement('canvas');
  drawWeave(off, nights, { width: w, height: h, dpr: 2, pad: { l: 0, r: 0, t: 0, b: 0 }, bg: NIGHT });
  ctx.drawImage(off, x, y, w, h);
}

// d: { type, title, nights (nightList), avg (summary.avg), best (night detail or null), monthly: [{ m, v }], lang, year }
export function drawCard(canvas, d, T, F) {
  canvas.width = CW; canvas.height = CH;
  const ctx = canvas.getContext('2d');
  const lang = d.lang || 'en';
  const titles = { recent: T.cardRecent, year: fill(T.cardYear, { y: d.year }), weave: fill(T.cardYear, { y: d.year }), best: T.cardNames.best, clock: T.cardNames.clock, hrv: T.cardNames.hrv };
  const f = frame(ctx, F, T, lang, titles[d.type] || T.cardRecent);
  const A = d.avg || {};
  const v = k => (A[k] ? A[k].avg : null);
  const withPhases = (d.nights || []).filter(n => n.phases);
  if (d.type === 'recent' || d.type === 'year') {
    weaveInto(ctx, d.nights || [], 84, 460, CW - 168, 560);
    legend(ctx, f, T, 1080);
    if (d.type === 'recent') {
      stat(ctx, f, 84, 1250, F.durShort(v('total')), T.cardAvgSleep);
      stat(ctx, f, 580, 1250, F.n(v('hrv')) + ' ms', T.cardHrv, '#7fe0d4');
      stat(ctx, f, 84, 1500, F.n(v('hrLow')) + ' bpm', T.cardRhr, '#ffb3a3');
      stat(ctx, f, 580, 1500, F.clock(v('bedtime')), T.cardBed, DAWN);
    } else {
      const hours = withPhases.reduce((s, n) => s + (n.total || 0), 0) / 3600;
      stat(ctx, f, 84, 1250, F.n(hours), T.cardHours);
      stat(ctx, f, 580, 1250, F.n((d.nights || []).filter(n => !n.none).length), T.cardNights);
      stat(ctx, f, 84, 1500, F.durShort(v('total')), T.cardAvgSleep);
      stat(ctx, f, 580, 1500, F.n(v('hrv')) + ' ms', T.cardHrv, '#7fe0d4');
    }
  } else if (d.type === 'weave') {
    weaveInto(ctx, d.nights || [], 84, 440, CW - 168, 1180);
    legend(ctx, f, T, 1680);
  } else if (d.type === 'best') {
    const b = d.best;
    if (b && b.phases) {
      // the night as four lanes
      const lanes = ['4', '3', '2', '1'], x0 = 84, w = CW - 168, y0 = 560, lh = 120;
      ctx.font = `600 28px ${f.t}`; ctx.fillStyle = SOFT; ctx.textAlign = 'left';
      lanes.forEach((c, i) => { ctx.fillStyle = 'rgba(255,255,255,0.06)'; ctx.fillRect(x0, y0 + i * lh, w, lh - 10); });
      let k = 0; const ph = b.phases;
      while (k < ph.length) { let j = k; while (j < ph.length && ph[j] === ph[k]) j++; const lane = lanes.indexOf(ph[k]); ctx.fillStyle = STAGE[ph[k]]; ctx.fillRect(x0 + (k / ph.length) * w, y0 + lane * lh + 8, Math.max(2, ((j - k) / ph.length) * w), lh - 26); k = j; }
      ctx.fillStyle = SOFT; ctx.font = `600 30px ${f.t}`;
      ctx.fillText(F.clock(b.start ? b.start.min : null), x0, y0 + 4 * lh + 40);
      ctx.textAlign = 'right'; ctx.fillText(F.clock(b.end ? b.end.min : null), x0 + w, y0 + 4 * lh + 40); ctx.textAlign = 'left';
      ctx.fillText(F.dateWd(b.day), x0, 500);
      stat(ctx, f, 84, 1320, F.n(b.sleepScore), T.cardScore, DAWN);
      stat(ctx, f, 580, 1320, F.durShort(b.total), T.cardHours);
      stat(ctx, f, 84, 1570, F.n(b.hrv) + ' ms', T.cardHrv, '#7fe0d4');
      stat(ctx, f, 580, 1570, F.n(b.hrLow) + ' bpm', T.cardRhr, '#ffb3a3');
    }
  } else if (d.type === 'clock') {
    // a 24-hour dial: every night an arc from bedtime to waking, midnight at the top
    const cx = CW / 2, cy = 900, R = 360;
    ctx.strokeStyle = 'rgba(255,255,255,0.12)'; ctx.lineWidth = 2;
    ctx.beginPath(); ctx.arc(cx, cy, R + 40, 0, Math.PI * 2); ctx.stroke();
    ctx.font = `600 30px ${f.t}`; ctx.fillStyle = SOFT; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    for (const hh of [0, 6, 12, 18]) { const a = (hh / 24) * Math.PI * 2 - Math.PI / 2; ctx.fillText(`${String(hh).padStart(2, '0')}:00`, cx + Math.cos(a) * (R + 90), cy + Math.sin(a) * (R + 90)); }
    ctx.textBaseline = 'alphabetic';
    const list = withPhases.slice(-365);
    list.forEach((n, i) => {
      const r = 120 + (i / Math.max(1, list.length - 1)) * (R - 120);
      const s = n.start, e = (n.start + n.phases.length * 5) % 1440;
      const a0 = (s / 1440) * Math.PI * 2 - Math.PI / 2, a1 = (e / 1440) * Math.PI * 2 - Math.PI / 2;
      ctx.strokeStyle = 'rgba(147,166,236,0.55)'; ctx.lineWidth = Math.max(1.2, (R - 120) / list.length * 0.8);
      ctx.beginPath(); ctx.arc(cx, cy, r, a0, a1 < a0 ? a1 + Math.PI * 2 : a1); ctx.stroke();
    });
    const bed = v('bedtime');
    stat(ctx, f, 84, 1500, F.clock(bed), T.cardBed, DAWN);
    stat(ctx, f, 580, 1500, F.durShort(v('total')), T.cardAvgSleep);
  } else if (d.type === 'hrv') {
    const m = d.monthly || [];
    const x0 = 84, w = CW - 168, y0 = 520, h = 760;
    const max = Math.max(10, ...m.map(p => p.v || 0));
    const bw = w / Math.max(1, m.length);
    ctx.textAlign = 'center'; ctx.font = `600 26px ${f.t}`;
    m.forEach((p, i) => {
      const bh = p.v ? (p.v / max) * (h - 80) : 0;
      ctx.fillStyle = '#43c0b3'; ctx.beginPath(); ctx.roundRect(x0 + i * bw + bw * 0.15, y0 + h - 60 - bh, bw * 0.7, bh, 10); ctx.fill();
      ctx.fillStyle = INK; ctx.font = `700 28px ${f.t}`; if (p.v) ctx.fillText(F.n(p.v), x0 + i * bw + bw / 2, y0 + h - 72 - bh);
      ctx.fillStyle = SOFT; ctx.font = `600 24px ${f.t}`; ctx.fillText(p.label, x0 + i * bw + bw / 2, y0 + h - 20);
    });
    stat(ctx, f, 84, 1500, F.n(v('hrv')) + ' ms', T.cardHrv, '#7fe0d4');
    stat(ctx, f, 580, 1500, F.n(v('hrLow')) + ' bpm', T.cardRhr, '#ffb3a3');
  }
  return canvas;
}

export function cardFileName(type, year) { return `nightjar-${type}${year ? '-' + year : ''}.png`; }
export { eveningMin };
