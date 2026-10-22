/* Wristory Pro's year poster: the year as one strip, one line per day, steps rising above the middle line and the
 * night's sleep hanging below it in its stages, with the year's totals. Drawn on a canvas in this tab (A4 proportions,
 * 2480 by 3508 pixels) and saved as a PNG, or as a PDF for A3 or A4 with the pixels deflated (no JPEG blur). */
import { PdfWriter, PAPER } from './pdfmini.js';
import { zlibSync } from '../vendor/fflate.js';
import { fill } from './i18n.js';
import { STAGE_ORDER, STAGE_HEX } from './charts.js';

export const PW = 2480, PH = 3508;
const BG = '#123f37', INK = '#f3f6f1', MUTED = '#a9c2b9', STEPS = '#f2a516', STEPS_HI = '#ffd166', LINE = '#2c5a50';

function fonts(lang) {
  const ko = lang === 'ko' ? '"Wristory KO", "Malgun Gothic", "Apple SD Gothic Neo", "Noto Sans KR", ' : '';
  const koT = lang === 'ko' ? '"Malgun Gothic", "Apple SD Gothic Neo", "Noto Sans KR", ' : '';
  return { d: `"Wristory Display", ${ko}"Arial Narrow", sans-serif`, k: `${ko}"Wristory Display", sans-serif`, t: `"Wristory Text", ${koT}system-ui, sans-serif` };
}

export function drawPoster(c, o) {
  c.width = PW; c.height = PH;
  const ctx = c.getContext('2d'), f = fonts(o.lang), T = o.T, F = o.F, M = 190;
  ctx.fillStyle = BG; ctx.fillRect(0, 0, PW, PH);
  ctx.textBaseline = 'alphabetic';
  ctx.fillStyle = MUTED; ctx.font = `700 54px ${f.d}`; ctx.fillText('Wristory', M, 260);
  ctx.fillStyle = INK; ctx.font = `800 620px ${f.d}`; ctx.fillText(String(o.year), M - 22, 840);
  ctx.fillStyle = MUTED; ctx.font = `500 62px ${f.k}`; ctx.fillText(T.posterSub, M, 960);
  // the strip
  const days = o.sheet, n = days.length, w = PW - 2 * M, cw = w / n, mid = 1900, up = 640, down = 640;
  const max = Math.max(14000, ...days.map(d => d.steps || 0));
  ctx.fillStyle = LINE;
  days.forEach((d, i) => { if (d.day.slice(8) === '01') ctx.fillRect(M + i * cw, mid - up - 30, 2, up + down + 60); });
  days.forEach((d, i) => {
    const x = M + i * cw, bw = Math.max(1.5, cw - 1.6);
    if (d.steps) { const h = (d.steps / max) * up; ctx.fillStyle = d.steps >= 10000 ? STEPS_HI : STEPS; ctx.fillRect(x, mid - 4 - h, bw, h); }
    if (d.asleep) {
      let y = mid + 4;
      const parts = d.staged ? STAGE_ORDER.map(k => [k, d[k] || 0]) : [['asleep', d.asleep]];
      for (const [k, v] of parts) { const h = (v / 660) * down; ctx.fillStyle = STAGE_HEX[k]; ctx.fillRect(x, y, bw, Math.min(h, mid + down - y)); y += h; }
    }
  });
  ctx.fillStyle = MUTED; ctx.fillRect(M, mid - 2, w, 4);
  ctx.font = `600 44px ${f.t}`;
  days.forEach((d, i) => { if (d.day.slice(8) === '01') ctx.fillText(F.month(+d.day.slice(5, 7) - 1), M + i * cw + 10, mid + down + 90); });
  ctx.font = `600 46px ${f.k}`; ctx.fillStyle = STEPS; ctx.fillText(T.posterUp, M, mid - up - 60);
  ctx.fillStyle = STAGE_HEX.light; ctx.fillText(T.posterDown, M, mid + down + 170);
  // the totals
  const s = o.summary, items = [];
  if (s.steps) items.push([F.n(s.steps.total), T.posterSteps], [F.n(Math.round(s.steps.km)), T.posterKm || 'km']);
  if (s.sleep) items.push([F.n(s.sleep.nights), T.posterNights], [F.dur(s.sleep.asleep), T.posterAvgSleep]);
  if (s.workouts) items.push([F.n(s.workouts.n), T.posterWorkouts]);
  const cols = Math.min(3, items.length || 1), colW = w / cols;
  items.forEach(([v, l], i) => {
    const x = M + (i % cols) * colW, y = 2900 + Math.floor(i / cols) * 230;
    ctx.fillStyle = INK; ctx.font = `800 132px ${f.d}`; ctx.fillText(v, x, y);
    ctx.fillStyle = MUTED; ctx.font = `500 46px ${f.k}`; ctx.fillText(l, x, y + 64);
  });
  ctx.fillStyle = MUTED; ctx.font = `400 34px ${f.t}`;
  ctx.fillText(`peakappsstudio.com/samsung-health-viewer${o.sample ? '  (sample, made up)' : ''}`, M, PH - 120);
  return c;
}

export async function makePoster(o) {
  const f = fonts(o.lang);
  try { await Promise.all([`800 100px ${f.d}`, `500 40px ${f.t}`, `500 40px ${f.k}`].map(s => document.fonts.load(s))); } catch (e) { /* system font */ }
  const c = drawPoster(document.createElement('canvas'), o);
  if (o.kind === 'png') return new Promise(r => c.toBlob(r, 'image/png'));
  const src = c.getContext('2d').getImageData(0, 0, PW, PH).data;
  const rgb = new Uint8Array((src.length / 4) * 3);
  for (let i = 0, j = 0; i < src.length; i += 4, j += 3) { rgb[j] = src[i]; rgb[j + 1] = src[i + 1]; rgb[j + 2] = src[i + 2]; }
  const bytes = zlibSync(rgb, { level: 6 });
  const [w, h] = PAPER[o.kind] || PAPER.A4;
  const pdf = new PdfWriter({ title: `Wristory ${o.year}` });
  pdf.addImagePage(w, h, { bytes, w: PW, h: PH, filter: 'FlateDecode' });
  return pdf.finish();
}
