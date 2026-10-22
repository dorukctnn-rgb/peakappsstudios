/* The Pro PDF report: A4 pages drawn on a canvas in this tab and put into a PDF as images by a small writer below (no
 * library, nothing sent anywhere). */
import { STAGE, drawWeave, rolling } from './charts.js';
import { fill } from './i18n.js';

const PW = 1240, PH = 1754, M = 90; // A4 at 150 dpi
const INK = '#171b33', MUTED = '#555b78', LINE = '#dfe3ef', DEEP = '#2b2f85';

function fonts(lang) {
  const ja = lang === 'ja' ? ', "Hiragino Sans", "Hiragino Kaku Gothic ProN", "Yu Gothic", "Meiryo", "Noto Sans JP"' : '';
  return { d: `"Nightjar Display"${ja}, system-ui, sans-serif`, t: `"Nightjar Text"${ja}, system-ui, sans-serif` };
}
function page(f, T, d, n, total) {
  const c = document.createElement('canvas'); c.width = PW; c.height = PH;
  const ctx = c.getContext('2d');
  ctx.fillStyle = '#ffffff'; ctx.fillRect(0, 0, PW, PH);
  ctx.fillStyle = INK; ctx.font = `800 26px ${f.d}`; ctx.textAlign = 'left'; ctx.textBaseline = 'alphabetic';
  ctx.fillText('Nightjar', M, 70);
  ctx.font = `500 20px ${f.t}`; ctx.fillStyle = MUTED; ctx.textAlign = 'right';
  ctx.fillText(fill(T.pdfPeriod, { from: d.F.date(d.from), to: d.F.date(d.to) }), PW - M, 70);
  ctx.strokeStyle = LINE; ctx.lineWidth = 2; ctx.beginPath(); ctx.moveTo(M, 88); ctx.lineTo(PW - M, 88); ctx.stroke();
  ctx.textAlign = 'left'; ctx.font = `500 17px ${f.t}`; ctx.fillStyle = MUTED;
  ctx.fillText(T.pdfMade + (d.sample ? ' ' + T.sampleTag + '.' : ''), M, PH - 50);
  ctx.textAlign = 'right'; ctx.fillText(fill(T.pdfPage, { n, t: total }), PW - M, PH - 50);
  ctx.textAlign = 'left';
  return { c, ctx };
}
function wrap(ctx, text, x, y, maxW, lh) {
  const cjk = /[　-鿿]/.test(text);
  const words = cjk ? [...text] : String(text).split(' ');
  let line = '';
  for (const w of words) {
    const t = line ? line + (cjk ? '' : ' ') + w : w;
    if (ctx.measureText(t).width > maxW && line) { ctx.fillText(line, x, y); y += lh; line = w; } else line = t;
  }
  if (line) { ctx.fillText(line, x, y); y += lh; }
  return y;
}
function lineChart(ctx, f, pts, x, y, w, h, title, axis, zero) {
  ctx.fillStyle = INK; ctx.font = `700 22px ${f.t}`; ctx.fillText(title, x, y);
  y += 16; h -= 16;
  if (!pts.length) return;
  let lo = Math.min(...pts.map(p => p.y)), hi = Math.max(...pts.map(p => p.y));
  if (zero) { lo = Math.min(lo, 0); hi = Math.max(hi, 0); }
  if (hi === lo) { hi += 1; lo -= 1; }
  const pad = (hi - lo) * 0.1; lo -= pad; hi += pad;
  const t0 = Date.parse(pts[0].day), t1 = Date.parse(pts[pts.length - 1].day) || t0 + 1;
  const X = day => x + 70 + ((Date.parse(day) - t0) / Math.max(1, t1 - t0)) * (w - 80);
  const Y = v => y + 10 + (1 - (v - lo) / (hi - lo)) * (h - 30);
  ctx.strokeStyle = LINE; ctx.lineWidth = 1; ctx.font = `500 16px ${f.t}`; ctx.fillStyle = MUTED; ctx.textAlign = 'right';
  for (let i = 0; i <= 3; i++) { const v = lo + ((hi - lo) * i) / 3; const yy = Y(v); ctx.beginPath(); ctx.moveTo(x + 70, yy); ctx.lineTo(x + w, yy); ctx.stroke(); ctx.fillText(axis(v), x + 62, yy + 5); }
  ctx.textAlign = 'left';
  ctx.fillStyle = '#93a6ec';
  for (const p of pts) { ctx.beginPath(); ctx.arc(X(p.day), Y(p.y), pts.length > 200 ? 1.6 : 2.6, 0, Math.PI * 2); ctx.fill(); }
  const avg = rolling(pts, 7);
  ctx.strokeStyle = DEEP; ctx.lineWidth = 3; ctx.beginPath();
  avg.forEach((p, i) => (i ? ctx.lineTo(X(p.day), Y(p.y)) : ctx.moveTo(X(p.day), Y(p.y))));
  ctx.stroke();
}
function bars(ctx, f, list, x, y, w, title) {
  ctx.fillStyle = INK; ctx.font = `700 24px ${f.d}`; ctx.fillText(title, x, y); y += 24;
  for (const r of list) {
    if (r.avg === null) continue;
    ctx.font = `500 18px ${f.t}`; ctx.fillStyle = INK; ctx.fillText(r.label, x, y + 18);
    ctx.textAlign = 'right'; ctx.fillText(String(Math.round(r.avg)), x + w, y + 18); ctx.textAlign = 'left';
    ctx.fillStyle = '#e2e7f3'; ctx.fillRect(x, y + 26, w, 8);
    ctx.fillStyle = r.avg < 70 ? '#f4a259' : DEEP; ctx.fillRect(x, y + 26, (w * r.avg) / 100, 8);
    y += 48;
  }
  return y;
}

// d: { F, lang, from, to, sample, summary, nights, series (plot points per key), tags (tag stats or null) }
export async function buildReport(d, T, onPage) {
  const f = fonts(d.lang);
  const S = d.summary, A = S.avg, F = d.F;
  const rows = d.nights.filter(n => !n.none);
  const perPage = 44;
  const tablePages = Math.max(1, Math.ceil(Math.min(rows.length, 440) / perPage));
  const total = 3 + tablePages;
  const pages = [];
  // 1: summary and the weave
  {
    onPage && onPage(1, total);
    const { c, ctx } = page(f, T, d, 1, total);
    ctx.fillStyle = INK; ctx.font = `800 54px ${f.d}`; ctx.fillText(T.pdfHead, M, 190);
    ctx.font = `500 24px ${f.t}`; ctx.fillStyle = MUTED; ctx.fillText(fill(T.coverage, { from: F.date(d.from), to: F.date(d.to), nights: S.nights, days: S.days }), M, 236);
    const kp = [['sleepScore', F.n(A.sleepScore.avg)], ['readiness', F.n(A.readiness.avg)], ['activityScore', F.n(A.activityScore.avg)], ['total', F.dur(A.total.avg)], ['hrv', F.ms(A.hrv.avg)], ['hrLow', F.bpm(A.hrLow.avg)], ['tempDev', F.dev(A.tempDev.avg)], ['spo2', F.pct1(A.spo2.avg)], ['steps', F.n(A.steps.avg)], ['bedtime', F.clock(A.bedtime.avg)]];
    kp.forEach(([k, val], i) => {
      const x = M + (i % 5) * ((PW - 2 * M) / 5), y = 310 + Math.floor(i / 5) * 120;
      ctx.fillStyle = MUTED; ctx.font = `600 19px ${f.t}`; ctx.fillText(T.kpi[k], x, y);
      ctx.fillStyle = INK; ctx.font = `800 36px ${f.d}`; ctx.fillText(val || T.none, x, y + 46);
    });
    const wv = document.createElement('canvas');
    drawWeave(wv, d.nights, { width: PW - 2 * M, height: 520, dpr: 1, font: f.t, labelSize: 15, monthLabel: F.month, pad: { l: 64, r: 8, t: 12, b: 26 } });
    ctx.drawImage(wv, M, 600);
    let x = M; ctx.font = `600 20px ${f.t}`;
    for (const [c2, k] of [['1', 'deep'], ['2', 'light'], ['3', 'rem'], ['4', 'awake']]) { ctx.fillStyle = STAGE[c2]; ctx.fillRect(x, 1148, 20, 20); ctx.fillStyle = INK; ctx.fillText(T.stages[k], x + 28, 1165); x += 48 + ctx.measureText(T.stages[k]).width; }
    // the average night
    const mix = [['1', A.deep.avg], ['2', A.light.avg], ['3', A.rem.avg], ['4', A.awake.avg]];
    const sum = mix.reduce((s, [, v]) => s + (v || 0), 0);
    ctx.fillStyle = INK; ctx.font = `700 26px ${f.d}`; ctx.fillText(T.stageMix, M, 1250);
    let xx = M;
    for (const [c2, v] of mix) { const w = sum ? ((v || 0) / sum) * (PW - 2 * M) : 0; ctx.fillStyle = STAGE[c2]; ctx.fillRect(xx, 1272, w, 40); xx += w; }
    xx = M; ctx.font = `600 20px ${f.t}`;
    for (const [c2, v] of mix) { ctx.fillStyle = INK; ctx.fillText(`${T.stages[{ 1: 'deep', 2: 'light', 3: 'rem', 4: 'awake' }[c2]]}: ${F.dur(v)}`, xx, 1350); xx += (PW - 2 * M) / 4; }
    ctx.fillStyle = MUTED; ctx.font = `500 19px ${f.t}`;
    let yy = 1420;
    for (const k of ['hrv', 'hrLow', 'tempDev']) yy = wrap(ctx, `${T.trend[k]}: ${T.explain[k]}`, M, yy, PW - 2 * M, 28) + 10;
    pages.push(c);
  }
  // 2: trends
  {
    onPage && onPage(2, total);
    const { c, ctx } = page(f, T, d, 2, total);
    ctx.fillStyle = INK; ctx.font = `800 40px ${f.d}`; ctx.fillText(T.trendsTitle, M, 170);
    const keys = ['hrv', 'hrLow', 'total', 'tempDev', 'sleepScore', 'readiness', 'spo2', 'steps'];
    const w = (PW - 2 * M - 40) / 2, h = 330;
    keys.forEach((k, i) => {
      const pts = (d.series[k] || []).map(p => ({ day: p.day, y: F.plot(k, p.v) })).filter(p => p.y !== null);
      lineChart(ctx, f, pts, M + (i % 2) * (w + 40), 230 + Math.floor(i / 2) * (h + 40), w, h, T.trend[k], v => F.axis(k, v), k === 'tempDev');
    });
    pages.push(c);
  }
  // 3: contributors, tags, workouts
  {
    onPage && onPage(3, total);
    const { c, ctx } = page(f, T, d, 3, total);
    ctx.fillStyle = INK; ctx.font = `800 40px ${f.d}`; ctx.fillText(T.contribTitle, M, 170);
    const cw = (PW - 2 * M - 60) / 3;
    let maxY = 0;
    ['sc', 'rc', 'ac'].forEach((g, i) => { const y = bars(ctx, f, S.contributors[g].map(r => ({ label: T.contrib[r.key], avg: r.avg })), M + i * (cw + 30), 230, cw, T.contribGroups[g]); maxY = Math.max(maxY, y); });
    let y = maxY + 50;
    ctx.fillStyle = INK; ctx.font = `800 34px ${f.d}`; ctx.fillText(d.tags ? T.tagCorrTitle : T.tagsTitle, M, y); y += 40;
    ctx.font = `500 19px ${f.t}`;
    if (d.tags && d.tags.length) {
      for (const t of d.tags.slice(0, 8)) {
        const name = t.name || T.tagNames[t.code] || t.code;
        for (const k of ['hrv', 'hrLow', 'sleepScore']) {
          const m = t.metrics[k]; if (m.with === null || m.without === null) continue;
          ctx.fillStyle = INK; y = wrap(ctx, fill(T.tagRow, { metric: T.trend[k], tag: name, with: F.metric(k, m.with), without: F.metric(k, m.without), n: m.nWith, m: m.nWithout }), M, y, PW - 2 * M, 28) + 2;
        }
        y += 8; if (y > PH - 380) break;
      }
      ctx.fillStyle = MUTED; y = wrap(ctx, T.tagCorrText, M, y + 10, PW - 2 * M, 28) + 20;
    } else if (S.tags.length) {
      ctx.fillStyle = INK; y = wrap(ctx, S.tags.slice(0, 16).map(t => `${t.name || T.tagNames[t.code] || t.code} (${t.n})`).join(d.lang === 'ja' ? '、' : ', '), M, y, PW - 2 * M, 28) + 20;
    } else { ctx.fillStyle = MUTED; ctx.fillText(T.tagsNone, M, y); y += 50; }
    ctx.fillStyle = INK; ctx.font = `800 34px ${f.d}`; ctx.fillText(T.workoutsTitle, M, y + 20); y += 60;
    ctx.font = `500 19px ${f.t}`;
    for (const a of S.workouts.byActivity.slice(0, 8)) { ctx.fillStyle = INK; ctx.fillText(`${T.activityNames[a.activity] || a.activity}: ${a.n}, ${F.dur(a.dur)}`, M, y); y += 30; if (y > PH - 100) break; }
    pages.push(c);
  }
  // 4+: the nights
  const cols = [['date', T.wCols.date, n => F.dateShort(n.day)], ['bed', T.kpi.bedtime, n => F.clock(n.start)], ['total', T.nightFacts.total, n => F.durShort(n.total)], ['deep', T.stages.deep, n => F.durShort(n.deep)], ['rem', T.stages.rem, n => F.durShort(n.rem)], ['eff', T.nightFacts.eff, n => F.pct(n.eff)], ['hrv', 'HRV', n => F.n(n.hrv)], ['low', T.kpi.hrLow, n => F.n(n.hrLow)], ['score', T.kpi.sleepScore, n => F.n(n.sleepScore)], ['ready', T.kpi.readiness, n => F.n(n.readiness)]];
  const list = rows.slice(-440);
  for (let p = 0; p < tablePages; p++) {
    onPage && onPage(4 + p, total);
    const { c, ctx } = page(f, T, d, 4 + p, total);
    ctx.fillStyle = INK; ctx.font = `800 40px ${f.d}`; ctx.fillText(T.pdfNights, M, 170);
    const cw = (PW - 2 * M) / cols.length;
    ctx.font = `700 15px ${f.t}`; ctx.fillStyle = MUTED;
    cols.forEach(([, h], i) => ctx.fillText(h, M + i * cw, 225, cw - 8));
    ctx.font = `500 18px ${f.t}`;
    list.slice(p * perPage, (p + 1) * perPage).forEach((n, r) => {
      const y = 262 + r * 30;
      if (r % 2 === 0) { ctx.fillStyle = '#f3f5fb'; ctx.fillRect(M - 6, y - 21, PW - 2 * M + 12, 30); }
      ctx.fillStyle = INK;
      cols.forEach(([, , fn], i) => ctx.fillText(fn(n) || '', M + i * cw, y, cw - 8));
    });
    pages.push(c);
  }
  return makePdf(await Promise.all(pages.map(toJpeg)), T.pdfHead);
}

function toJpeg(canvas) {
  return new Promise((res) => canvas.toBlob(b => b.arrayBuffer().then(a => res(new Uint8Array(a))), 'image/jpeg', 0.88));
}

// A PDF with one full-page JPEG per page.
export function makePdf(jpegs, title) {
  const enc = new TextEncoder();
  const parts = [], offsets = [];
  let len = 0;
  const push = b => { const u = typeof b === 'string' ? enc.encode(b) : b; parts.push(u); len += u.length; };
  push('%PDF-1.4\n%\xE2\xE3\xCF\xD3\n'.replace(/[\x80-\xff]/g, ''));
  const obj = (n, body) => { offsets[n] = len; push(`${n} 0 obj\n`); for (const b of [].concat(body)) push(b); push('\nendobj\n'); };
  const W = 595.28, H = 841.89, n = jpegs.length;
  // 1 catalog, 2 pages, 3 info, then per page: page, image, content
  const kids = jpegs.map((_, i) => `${4 + i * 3} 0 R`).join(' ');
  obj(1, '<< /Type /Catalog /Pages 2 0 R >>');
  obj(2, `<< /Type /Pages /Count ${n} /Kids [${kids}] >>`);
  const esc = s => String(s).replace(/[\\()]/g, m => '\\' + m).replace(/[^\x20-\x7e]/g, '');
  obj(3, `<< /Title (${esc(title) || 'Nightjar report'}) /Producer (Nightjar, peakappsstudio.com) >>`);
  jpegs.forEach((jpg, i) => {
    const p = 4 + i * 3, im = p + 1, ct = p + 2;
    const dims = jpegSize(jpg);
    obj(p, `<< /Type /Page /Parent 2 0 R /MediaBox [0 0 ${W} ${H}] /Resources << /XObject << /Im${i} ${im} 0 R >> >> /Contents ${ct} 0 R >>`);
    obj(im, [`<< /Type /XObject /Subtype /Image /Width ${dims.w} /Height ${dims.h} /ColorSpace /DeviceRGB /BitsPerComponent 8 /Filter /DCTDecode /Length ${jpg.length} >>\nstream\n`, jpg, '\nendstream']);
    const content = `q ${W} 0 0 ${H} 0 0 cm /Im${i} Do Q`;
    obj(ct, `<< /Length ${content.length} >>\nstream\n${content}\nendstream`);
  });
  const total = 4 + n * 3;
  const xref = len;
  let x = `xref\n0 ${total}\n0000000000 65535 f \n`;
  for (let i = 1; i < total; i++) x += String(offsets[i]).padStart(10, '0') + ' 00000 n \n';
  push(x);
  push(`trailer\n<< /Size ${total} /Root 1 0 R /Info 3 0 R >>\nstartxref\n${xref}\n%%EOF\n`);
  return new Blob(parts, { type: 'application/pdf' });
}

function jpegSize(b) {
  let i = 2;
  while (i < b.length) {
    if (b[i] !== 0xff) { i++; continue; }
    const m = b[i + 1];
    if (m >= 0xc0 && m <= 0xc3) return { h: (b[i + 5] << 8) | b[i + 6], w: (b[i + 7] << 8) | b[i + 8] };
    i += 2 + ((b[i + 2] << 8) | b[i + 3]);
  }
  return { w: PW, h: PH };
}
