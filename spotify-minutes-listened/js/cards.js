/* Earhours share cards: 1080 x 1920 PNGs (9:16, the size of a phone story), drawn on a canvas in this tab. Every card
 * carries the tool's address at the foot, small, so a shared card says where it came from. */
import { recordGeometry } from './clock.js';

export const W = 1080, H = 1920;
const DISPLAY = '"Earhours Display", "Arial Black", sans-serif';
const TEXT = '"Earhours Text", "Segoe UI", system-ui, sans-serif';
const C = { plum: '#1d1030', ultra: '#3b2bff', pink: '#ff8fb8', lilac: '#d9d3ff', paper: '#ecebf4', white: '#ffffff', butter: '#ffe27a' };
export const ADDRESS = 'peakappsstudio.com/spotify-minutes-listened';

export const CARD_TYPES = [
  { id: 'summary', name: 'Year so far', free: true },
  { id: 'artists', name: 'Top artists' },
  { id: 'songs', name: 'Top songs' },
  { id: 'clock', name: 'Listening clock' },
  { id: 'streak', name: 'Streak and biggest day' },
  { id: 'compare', name: 'Year against year', needs: 'compare' },
  { id: 'alltime', name: 'All time', needs: 'alltime' },
];

const num = n => Math.round(n).toLocaleString('en-US');
const mins = ms => Math.round(ms / 60000);
const MONTHS = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];
const longDate = iso => { const [y, m, d] = iso.split('-').map(Number); return `${d} ${MONTHS[m - 1]} ${y}`; };
const shortDate = iso => { const [, m, d] = iso.split('-').map(Number); return `${d} ${MONTHS[m - 1].slice(0, 3)}`; };

function font(ctx, size, family, weight = 400) { ctx.font = `${weight} ${size}px ${family}`; }
// shrink the text until it fits, then cut it with an ellipsis if it still does not
function fit(ctx, text, maxW, size, family, weight = 400, min = 28) {
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
function write(ctx, text, x, y, maxW, size, family, color, weight = 400, align = 'left', min) {
  const r = fit(ctx, text, maxW, size, family, weight, min);
  ctx.fillStyle = color; ctx.textAlign = align; ctx.textBaseline = 'alphabetic';
  ctx.fillText(r.text, x, y);
  return r.size;
}
function lines(ctx, text, x, y, maxW, size, family, color, lh = 1.25, weight = 400) {
  font(ctx, size, family, weight);
  ctx.fillStyle = color; ctx.textAlign = 'left'; ctx.textBaseline = 'alphabetic';
  const words = String(text).split(' ');
  let line = '', yy = y;
  for (const w of words) {
    const test = line ? line + ' ' + w : w;
    if (ctx.measureText(test).width > maxW && line) { ctx.fillText(line, x, yy); line = w; yy += size * lh; } else line = test;
  }
  if (line) ctx.fillText(line, x, yy);
  return yy;
}

function frame(ctx, bg, ink, label) {
  ctx.fillStyle = bg; ctx.fillRect(0, 0, W, H);
  write(ctx, 'Earhours', 80, 150, 500, 44, DISPLAY, ink);
  if (label) write(ctx, label, W - 80, 150, 520, 34, TEXT, ink, 600, 'right');
  ctx.globalAlpha = 0.8;
  write(ctx, 'made with ' + ADDRESS, W / 2, H - 70, W - 160, 30, TEXT, ink, 500, 'center', 20);
  ctx.globalAlpha = 1;
}

function drawRecord(ctx, hours, cx, cy, size, colors) {
  const g = recordGeometry(hours, size);
  const ox = cx - size / 2, oy = cy - size / 2;
  ctx.save();
  ctx.translate(ox, oy);
  ctx.fillStyle = colors.disc; ctx.beginPath(); ctx.arc(g.c, g.c, size * 0.495, 0, Math.PI * 2); ctx.fill();
  ctx.strokeStyle = colors.groove; ctx.lineWidth = Math.max(1, size / 400);
  for (let r = g.r0 + 4; r < g.r1 + 6; r += size * 0.018) { ctx.beginPath(); ctx.arc(g.c, g.c, r, 0, Math.PI * 2); ctx.stroke(); }
  for (const b of g.bars) {
    ctx.globalAlpha = 0.45 + 0.55 * b.share;
    ctx.fillStyle = colors.bar;
    ctx.beginPath(); ctx.arc(g.c, g.c, b.rOut, b.a0, b.a1); ctx.arc(g.c, g.c, b.rIn, b.a1, b.a0, true); ctx.closePath(); ctx.fill();
  }
  ctx.globalAlpha = 1;
  ctx.fillStyle = colors.label; ctx.beginPath(); ctx.arc(g.c, g.c, g.rLabel, 0, Math.PI * 2); ctx.fill();
  font(ctx, Math.round(size * 0.034), TEXT, 600);
  ctx.fillStyle = colors.labelInk; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
  [0, 6, 12, 18].forEach(h => { const a = -Math.PI / 2 + h * (Math.PI / 12) + Math.PI / 24; const r = g.rLabel * 0.72; ctx.fillText(String(h).padStart(2, '0'), g.c + r * Math.cos(a), g.c + r * Math.sin(a)); });
  font(ctx, Math.round(size * 0.042), DISPLAY);
  ctx.fillText('Earhours', g.c, g.c - g.rLabel * 0.34);
  ctx.fillStyle = colors.disc; ctx.beginPath(); ctx.arc(g.c, g.c, size * 0.012, 0, Math.PI * 2); ctx.fill();
  ctx.restore();
}

const periodLabel = d => (d.year === 'all' ? 'All time' : d.running ? `${d.year} so far` : String(d.year));
const peakHour = hours => hours.reduce((b, v, h) => (v > hours[b] ? h : b), 0);

function rankList(ctx, items, y0, colors, sub) {
  let y = y0;
  items.slice(0, 5).forEach((it, i) => {
    write(ctx, String(i + 1), 80, y, 90, 96, DISPLAY, colors.num);
    write(ctx, it.name, 200, y - 30, W - 280, 64, TEXT, colors.ink, 700);
    write(ctx, sub(it), 200, y + 22, W - 280, 38, TEXT, colors.ink, 400);
    y += 215;
  });
}

// d: { year, running, stats, compare?, alltime? }
export function drawCard(canvas, type, d) {
  canvas.width = W; canvas.height = H;
  const ctx = canvas.getContext('2d');
  const s = d.stats;
  if (type === 'summary') {
    frame(ctx, C.ultra, C.white, periodLabel(d));
    const size = write(ctx, num(mins(s.totalMs)), 80, 560, W - 160, 230, DISPLAY, C.white, 400, 'left', 90);
    write(ctx, d.year === 'all' ? 'minutes of listening, all time' : d.running ? `minutes of listening in ${d.year}, so far` : `minutes of listening in ${d.year}`, 80, 560 + Math.max(70, size * 0.42), W - 160, 46, TEXT, C.white, 500);
    drawRecord(ctx, s.hours, W - 290, 960, 400, { disc: C.plum, groove: 'rgba(255,255,255,0.07)', bar: C.pink, label: C.butter, labelInk: C.plum });
    let y = 1320;
    if (s.topArtists[0]) { write(ctx, 'Top artist', 80, y, 600, 38, TEXT, C.lilac, 600); write(ctx, s.topArtists[0].name, 80, y + 84, W - 160, 80, DISPLAY, C.white); y += 210; }
    if (s.topTracks[0]) { write(ctx, 'Top song', 80, y, 600, 36, TEXT, C.lilac, 600); write(ctx, s.topTracks[0].name, 80, y + 76, W - 160, 64, TEXT, C.white, 700); write(ctx, s.topTracks[0].artist, 80, y + 130, W - 160, 40, TEXT, C.white, 400); }
    else if (s.topShows[0]) { write(ctx, 'Top podcast', 80, y, 600, 36, TEXT, C.lilac, 600); write(ctx, s.topShows[0].name, 80, y + 76, W - 160, 64, TEXT, C.white, 700); }
    write(ctx, `${num(s.streams)} plays`, 80, 900, 440, 56, TEXT, C.white, 700);
    write(ctx, `${num(s.distinctArtists)} artists`, 80, 980, 440, 56, TEXT, C.white, 700);
    write(ctx, `${num(s.distinctTracks)} different songs`, 80, 1060, 440, 56, TEXT, C.white, 700);
    return;
  }
  if (type === 'artists') {
    frame(ctx, C.pink, C.plum, periodLabel(d));
    write(ctx, 'My top artists', 80, 400, W - 160, 120, DISPLAY, C.plum);
    rankList(ctx, s.topArtists, 660, { num: C.ultra, ink: C.plum }, a => `${num(mins(a.ms))} minutes`);
    return;
  }
  if (type === 'songs') {
    frame(ctx, C.plum, C.white, periodLabel(d));
    write(ctx, 'My top songs', 80, 400, W - 160, 120, DISPLAY, C.pink);
    rankList(ctx, s.topTracks, 660, { num: C.pink, ink: C.white }, t => `${t.artist}, ${num(t.streams)} plays`);
    return;
  }
  if (type === 'clock') {
    frame(ctx, C.paper, C.plum, periodLabel(d));
    write(ctx, 'When I listen', 80, 380, W - 160, 120, DISPLAY, C.plum);
    drawRecord(ctx, s.hours, W / 2, 900, 820, { disc: C.plum, groove: 'rgba(255,255,255,0.07)', bar: C.pink, label: C.butter, labelInk: C.plum });
    const h = peakHour(s.hours);
    write(ctx, `Busiest hour: ${String(h).padStart(2, '0')}:00 to ${String((h + 1) % 24).padStart(2, '0')}:00`, 80, 1480, W - 160, 56, TEXT, C.plum, 700);
    if (s.night.ms > 0) lines(ctx, `${num(mins(s.night.ms))} minutes between midnight and 5 am${s.night.topArtist ? `, mostly ${s.night.topArtist.name}` : ''}.`, 80, 1570, W - 160, 44, TEXT, C.plum, 1.3);
    return;
  }
  if (type === 'streak') {
    frame(ctx, C.ultra, C.white, periodLabel(d));
    const st = s.longestStreak;
    write(ctx, st ? num(st.days) : '0', 80, 640, W - 160, 300, DISPLAY, C.butter, 400, 'left', 90);
    write(ctx, st && st.days === 1 ? 'day in a row' : 'days in a row', 80, 740, W - 160, 64, TEXT, C.white, 700);
    if (st) write(ctx, `${longDate(st.from)} to ${longDate(st.to)}`, 80, 810, W - 160, 40, TEXT, C.white, 400);
    if (s.biggestDay) {
      write(ctx, 'Biggest day', 80, 1060, 600, 40, TEXT, C.lilac, 600);
      write(ctx, `${num(mins(s.biggestDay.ms))} minutes`, 80, 1170, W - 160, 110, DISPLAY, C.white);
      write(ctx, longDate(s.biggestDay.day), 80, 1240, W - 160, 44, TEXT, C.white, 500);
    }
    write(ctx, `${num(s.activeDays)} days with music or podcasts`, 80, 1420, W - 160, 50, TEXT, C.white, 700);
    if (s.skips.of) write(ctx, s.skips.info ? `Skipped ${Math.round(s.skips.rate * 100)}% of songs` : `${Math.round(s.skips.rate * 100)}% of songs stopped before 30 seconds`, 80, 1500, W - 160, 44, TEXT, C.white, 500);
    return;
  }
  if (type === 'compare') {
    frame(ctx, C.plum, C.white, 'Year against year');
    write(ctx, 'My years in minutes', 80, 400, W - 160, 104, DISPLAY, C.pink);
    const years = (d.compare || []).slice(-6);
    const max = Math.max(1, ...years.map(y => y.ms));
    let y = 600;
    years.forEach(e => {
      write(ctx, String(e.year), 80, y + 62, 220, 64, DISPLAY, C.white);
      const w = Math.max(12, (W - 520) * (e.ms / max));
      ctx.fillStyle = e.year === years[years.length - 1].year ? C.pink : C.lilac;
      ctx.fillRect(300, y + 10, w, 64);
      write(ctx, num(mins(e.ms)), 300 + w + 20, y + 60, W - 320 - w - 40 > 120 ? W - 320 - w - 40 : 180, 40, TEXT, C.white, 600, 'left', 22);
      if (e.topArtist) write(ctx, e.topArtist, 300, y + 120, W - 380, 34, TEXT, C.lilac, 500);
      y += 190;
    });
    return;
  }
  if (type === 'alltime') {
    const a = d.alltime || s;
    frame(ctx, C.pink, C.plum, 'All time');
    write(ctx, num(mins(a.totalMs)), 80, 560, W - 160, 230, DISPLAY, C.plum, 400, 'left', 90);
    write(ctx, 'minutes of listening, all time', 80, 660, W - 160, 50, TEXT, C.plum, 600);
    if (a.firstDay) write(ctx, `Since ${longDate(a.firstDay)}`, 80, 730, W - 160, 40, TEXT, C.plum, 400);
    write(ctx, 'Most played artists', 80, 900, 700, 40, TEXT, C.ultra, 700);
    a.topArtists.slice(0, 5).forEach((x, i) => write(ctx, `${i + 1}. ${x.name}`, 80, 990 + i * 92, W - 160, 60, TEXT, C.plum, 700));
    if (a.topTracks[0]) { write(ctx, 'Most played song', 80, 1520, 700, 40, TEXT, C.ultra, 700); write(ctx, `${a.topTracks[0].name}, ${a.topTracks[0].artist}`, 80, 1590, W - 160, 52, TEXT, C.plum, 600); }
  }
}

export function cardFileName(type, d) {
  const p = d.year === 'all' ? 'all-time' : String(d.year);
  return `earhours-${p}-${type}.png`;
}

export { shortDate, longDate };
