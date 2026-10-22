/* Wristory Pro's PDF report: A4 pages drawn on a canvas in this tab and put into a PDF as images by pdfmini.js (no
 * library, nothing sent anywhere). Plain numbers only: averages for the period, the days as a strip, week by week, then
 * every blood pressure and weight reading and the workouts. No advice and no reading of the numbers. */
import { PdfWriter, PAPER } from './pdfmini.js';
import { fill } from './i18n.js';
import { STAGE_ORDER, STAGE_HEX } from './charts.js';

const PW = 1240, PH = 1754, M = 96; // A4 at 150 dpi
const INK = '#13211f', MUTED = '#4f605c', LINE = '#d7e0dd', BAND = '#123f37', STEPS = '#f2a516', SOFT = '#eef3f1';

function fonts(lang) {
  const ko = lang === 'ko' ? '"Wristory KO", "Malgun Gothic", "Apple SD Gothic Neo", "Noto Sans KR", ' : '';
  const koT = lang === 'ko' ? '"Malgun Gothic", "Apple SD Gothic Neo", "Noto Sans KR", ' : '';
  return { d: `${ko}"Wristory Display", "Arial Narrow", sans-serif`, t: `"Wristory Text", ${koT}system-ui, sans-serif` };
}
async function fontsReady(f) {
  try { await Promise.all([`800 40px ${f.d}`, `400 20px ${f.t}`, `700 20px ${f.t}`].map(s => document.fonts.load(s))); } catch (e) { /* the system font is used */ }
}

function newPage(ctx0) {
  const c = document.createElement('canvas'); c.width = PW; c.height = PH;
  const ctx = c.getContext('2d');
  ctx.fillStyle = '#ffffff'; ctx.fillRect(0, 0, PW, PH);
  return { c, ctx };
}
function chrome(p, o, f, n, total) {
  const { ctx } = p;
  ctx.fillStyle = BAND; ctx.fillRect(0, 0, PW, 14);
  ctx.textBaseline = 'alphabetic';
  ctx.fillStyle = INK; ctx.font = `800 30px ${f.d}`; ctx.textAlign = 'left';
  ctx.fillText('Wristory', M, 74);
  ctx.font = `500 19px ${f.t}`; ctx.fillStyle = MUTED; ctx.textAlign = 'right';
  ctx.fillText(fill(o.T.pdfSub, { from: o.F.date(o.from), to: o.F.date(o.to) }), PW - M, 74);
  ctx.strokeStyle = LINE; ctx.lineWidth = 2; ctx.beginPath(); ctx.moveTo(M, 94); ctx.lineTo(PW - M, 94); ctx.stroke();
  ctx.textAlign = 'left'; ctx.font = `400 16px ${f.t}`; ctx.fillStyle = MUTED;
  wrap(ctx, o.T.pdfMade + (o.sample ? ` (sample)` : ''), M, PH - 70, PW - 2 * M - 160, 22);
  ctx.textAlign = 'right'; ctx.fillText(fill(o.T.pdfPage, { n, t: total }), PW - M, PH - 70);
  ctx.textAlign = 'left';
}
function wrap(ctx, text, x, y, maxW, lh) {
  const cjk = /[　-鿿가-힯]/.test(text);
  const words = cjk ? String(text).split(/(?<=\s)/) : String(text).split(' ');
  let line = '', yy = y;
  for (const w of words) {
    const test = line ? (cjk ? line + w : line + ' ' + w) : w;
    if (ctx.measureText(test).width > maxW && line) { ctx.fillText(line.trim(), x, yy); line = w; yy += lh; }
    else line = test;
  }
  if (line) ctx.fillText(line.trim(), x, yy);
  return yy + lh;
}
// a table: cols [{label, w, align}], rows of strings; returns the next y, or -1 when the page is full (rest = rows left)
function table(ctx, f, x, y, cols, rows, maxY) {
  const rh = 34;
  let xx = x;
  if (cols.some(c => c.label)) {
    ctx.font = `700 17px ${f.t}`;
    ctx.fillStyle = SOFT; ctx.fillRect(x, y, cols.reduce((s, c) => s + c.w, 0), rh + 4); ctx.fillStyle = INK;
    for (const c of cols) { ctx.textAlign = c.align || 'left'; fit(ctx, c.label, c.align === 'right' ? xx + c.w - 10 : xx + 10, y + 25, c.w - 16, 700, 17, f); xx += c.w; }
    y += rh + 6;
  }
  ctx.font = `400 17px ${f.t}`;
  let i = 0;
  for (; i < rows.length; i++) {
    if (y + rh > maxY) break;
    xx = x;
    rows[i].forEach((v, k) => { const c = cols[k]; ctx.textAlign = c.align || 'left'; ctx.fillStyle = k ? INK : MUTED; fit(ctx, String(v == null ? '' : v), c.align === 'right' ? xx + c.w - 10 : xx + 10, y + 23, c.w - 16, 400, 17, f); xx += c.w; });
    ctx.strokeStyle = LINE; ctx.lineWidth = 1; ctx.beginPath(); ctx.moveTo(x, y + rh); ctx.lineTo(xx, y + rh); ctx.stroke();
    y += rh;
  }
  ctx.textAlign = 'left';
  return { y, done: i };
}
// text that must stay inside its column: the size steps down until it fits (never below 12 px)
function fit(ctx, text, x, y, maxW, weight, size, f) {
  let px = size;
  ctx.font = `${weight} ${px}px ${f.t}`;
  while (px > 12 && ctx.measureText(text).width > maxW) { px -= 1; ctx.font = `${weight} ${px}px ${f.t}`; }
  ctx.fillText(text, x, y);
  ctx.font = `${weight} ${size}px ${f.t}`;
}
function heading(ctx, f, text, y) { ctx.fillStyle = INK; ctx.font = `800 40px ${f.d}`; ctx.textAlign = 'left'; ctx.fillText(text, M, y); return y + 26; }

// the period as a strip: steps up, sleep down
function strip(ctx, sheet, x, y, w, h) {
  const n = sheet.length, cw = w / n, mid = y + h * 0.5;
  const max = Math.max(12000, ...sheet.map(d => d.steps || 0));
  sheet.forEach((d, i) => {
    const bx = x + i * cw, bw = Math.max(1, cw - (cw > 4 ? 1 : 0));
    if (d.steps) { const hh = (d.steps / max) * (h * 0.46); ctx.fillStyle = STEPS; ctx.fillRect(bx, mid - hh - 2, bw, hh); }
    if (d.asleep) {
      let yy = mid + 2;
      const parts = d.staged ? STAGE_ORDER.map(k => [k, d[k] || 0]) : [['asleep', d.asleep]];
      for (const [k, v] of parts) { const hh = (v / 600) * (h * 0.46); ctx.fillStyle = STAGE_HEX[k]; ctx.fillRect(bx, yy, bw, hh); yy += hh; }
    }
  });
  ctx.fillStyle = '#9fb1ab'; ctx.fillRect(x, mid - 1, w, 2);
}

// every page of the report as a canvas (the page also shows page 1 as the Pro sample)
export async function reportPages(o) {
  const { T, F } = o, f = fonts(o.lang);
  await fontsReady(f);
  const s = o.summary, pages = [];
  const heartLabel = T.row[o.heart];
  // ---- page 1: averages and the strip
  let p = newPage(); pages.push(p);
  let ctx = p.ctx, y = 190;
  ctx.fillStyle = INK; ctx.font = `800 76px ${f.d}`; ctx.fillText(T.pdfTitle, M, y);
  ctx.font = `400 21px ${f.t}`; ctx.fillStyle = MUTED;
  y = wrap(ctx, `${fill(T.pdfSub, { from: o.F.date(o.from), to: o.F.date(o.to) })}. ${fill(T.pdfDays, { n: F.n(s.days), span: F.n(s.span) })}`, M, y + 48, PW - 2 * M, 30) + 20;
  const rows = [];
  if (s.steps) rows.push([T.pdfCol.steps, F.n(s.steps.avg), `${fill(T.stepsOver, { n: F.n(s.steps.over10k) })}`]);
  if (s.sleep) rows.push([T.row.sleep, F.dur(s.sleep.asleep), s.sleep.bed !== null ? `${F.clock(s.sleep.bed)} - ${F.clock(s.sleep.wake)}` : '']);
  if (s.sleep && s.sleep.staged) rows.push(['', `${T.stage.deep} ${F.dur(s.sleep.deep)}`, `${T.stage.light} ${F.dur(s.sleep.light)}, ${T.stage.rem} ${F.dur(s.sleep.rem)}, ${T.stage.awake} ${F.dur(s.sleep.awake)}`]);
  if (s.heart) {
    const v = o.heart === 'resting' ? s.heart.resting : o.heart === 'sleeping' ? s.heart.sleeping : s.heart.low;
    if (v) rows.push([heartLabel, `${F.n(v)} bpm`, s.heart.avg ? `${T.cmp.hrAvg}: ${F.n(s.heart.avg)} bpm` : '']);
  }
  if (s.weight) rows.push([T.row.weight, `${F.kg(s.weight.first.kg)} - ${F.kg(s.weight.last.kg)}`, `${fill(T.weightChange, { v: F.kgSigned(s.weight.change) }).replace(/\.$/, '')}, ${fill(T.weightN, { n: F.n(s.weight.n) }).replace(/\.$/, '')}`]);
  if (s.bp) rows.push([T.row.bp, `${F.n(s.bp.sys)}/${F.n(s.bp.dia)} mmHg`, fill(T.bpLine, { n: F.n(s.bp.n), sys: F.n(s.bp.sys), dia: F.n(s.bp.dia) }).replace(/,.*$/, '')]);
  if (s.workouts) rows.push([T.row.workouts, F.n(s.workouts.n), F.dur(s.workouts.mins)]);
  if (s.stress) rows.push([T.row.stress, F.n(s.stress.avg), '0-100']);
  if (s.spo2) rows.push([T.row.spo2, F.pct(s.spo2.avg), `min ${F.pct(s.spo2.low)}`]);
  y = heading(ctx, f, T.pdfAverages, y + 30) + 10;
  y = table(ctx, f, M, y, [{ label: '', w: 300 }, { label: '', w: 280, align: 'right' }, { label: '', w: PW - 2 * M - 580 }], rows, PH - 520).y;
  if (o.sheet.length > 1 && (s.steps || s.sleep)) {
    y = heading(ctx, f, `${T.row.steps} / ${T.row.sleep}`, y + 70) + 10;
    strip(ctx, o.sheet, M, y, PW - 2 * M, 300);
    ctx.font = `500 16px ${f.t}`; ctx.fillStyle = MUTED;
    ctx.fillText(o.F.date(o.from), M, y + 330); ctx.textAlign = 'right'; ctx.fillText(o.F.date(o.to), PW - M, y + 330); ctx.textAlign = 'left';
    let lx = M;
    const keys = o.has.staged ? STAGE_ORDER : ['asleep'];
    [[STEPS, T.row.steps]].concat(keys.map(k => [STAGE_HEX[k], T.stage[k]])).forEach(([c, l]) => { ctx.fillStyle = c; ctx.fillRect(lx, y + 352, 16, 16); ctx.fillStyle = INK; ctx.fillText(l, lx + 24, y + 366); lx += ctx.measureText(l).width + 60; });
  }
  // ---- week by week
  const weekRows = [];
  for (let i = 0; i < o.sheet.length; i += 7) {
    const part = o.sheet.slice(i, i + 7);
    const avg = k => { const v = part.map(d => d[k]).filter(x => x !== null && x !== undefined && x !== 0); return v.length ? v.reduce((a, b) => a + b, 0) / v.length : null; };
    weekRows.push({ from: part[0].day, steps: avg('steps'), asleep: avg('asleep'), heart: avg('heart'), kg: avg('kg'), stress: avg('stress'), spo2: avg('spo2') });
  }
  const wcols = [['steps', v => F.n(v)], ['asleep', v => F.dur(v)], ['heart', v => `${F.n(v)} bpm`], ['kg', v => F.kg(v)], ['stress', v => F.n(v)], ['spo2', v => F.pct(Math.round(v * 10) / 10)]].filter(([k]) => weekRows.some(r => r[k] !== null));
  const wW = (PW - 2 * M - 240) / Math.max(1, wcols.length);
  const wTable = { cols: [{ label: T.pdfWeekFrom, w: 240 }].concat(wcols.map(([k]) => ({ label: k === 'heart' ? heartLabel : T.pdfCol[k], w: wW, align: 'right' }))), rows: weekRows.map(r => [o.F.date(r.from)].concat(wcols.map(([k, fm]) => (r[k] === null ? '' : fm(r[k]))))) };
  const sections = [[T.pdfWeekly, wTable]];
  const tb = o.tables;
  sections.push([T.pdfBp, { cols: [{ label: T.logDate, w: 360 }, { label: T.logSys, w: 220, align: 'right' }, { label: T.logDia, w: 220, align: 'right' }, { label: T.logPulse, w: PW - 2 * M - 800, align: 'right' }], rows: tb.bp.map(r => [r.time, `${F.n(r.systolic)} mmHg`, `${F.n(r.diastolic)} mmHg`, r.pulse ? `${F.n(r.pulse)} bpm` : '']), skip: !o.has.bp }]);
  sections.push([T.pdfWeight, { cols: [{ label: T.logDate, w: 360 }, { label: T.logKg, w: 220, align: 'right' }, { label: T.logFat, w: 220, align: 'right' }, { label: T.logMuscle, w: PW - 2 * M - 800, align: 'right' }], rows: tb.weight.map(r => [r.time, F.kg(r.weight_kg), r.body_fat_pct ? F.pct1(r.body_fat_pct) : '', r.muscle_kg ? F.kg(r.muscle_kg) : '']), skip: !o.has.weight }]);
  sections.push([T.pdfWorkouts, { cols: [{ label: T.cols.start, w: 280 }, { label: T.cols.type, w: 300 }, { label: T.woTime, w: 180, align: 'right' }, { label: T.woDist, w: 150, align: 'right' }, { label: 'bpm', w: PW - 2 * M - 910, align: 'right' }], rows: tb.workouts.map(r => [r.start, o.exName(r.type), F.dur(r.duration_min), r.distance_km ? F.km(r.distance_km) : '', r.avg_hr ? F.n(r.avg_hr) : '']), skip: !o.has.workouts }]);
  for (const [title, t] of sections) {
    if (t.skip) continue;
    let rest = t.rows, first = true;
    do {
      p = newPage(); pages.push(p); ctx = p.ctx;
      y = heading(ctx, f, title, 180) + 14;
      if (!rest.length) { ctx.font = `400 19px ${f.t}`; ctx.fillStyle = MUTED; ctx.fillText(T.pdfNoData, M, y + 20); break; }
      const r = table(ctx, f, M, y, t.cols, rest, PH - 120);
      rest = rest.slice(r.done);
      first = false;
    } while (rest.length && !first);
  }
  pages.forEach((pg, i) => chrome(pg, o, f, i + 1, pages.length));
  return pages.map(pg => pg.c);
}

export async function makeReport(o) {
  const pages = await reportPages(o);
  const pdf = new PdfWriter({ title: `Wristory ${o.T.pdfTitle} ${o.from} - ${o.to}` });
  for (let i = 0; i < pages.length; i++) {
    const blob = await new Promise(r => pages[i].toBlob(r, 'image/jpeg', 0.9));
    pdf.addImagePage(PAPER.A4[0], PAPER.A4[1], { bytes: new Uint8Array(await blob.arrayBuffer()), w: PW, h: PH, filter: 'DCTDecode' });
  }
  return { blob: pdf.finish(), pages: pages.length };
}
