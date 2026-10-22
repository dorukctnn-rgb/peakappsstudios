/* Dayfold: the mood colours, and the printable Year in Pixels poster (Pro). The poster is drawn on a canvas at
 * 3000 x 4243 pixels, the shape of A3 and A4 paper (254 dpi on A3, 360 dpi on A4), then saved as a PNG or placed on a
 * PDF page. */
export const MOOD = { 5: '#e2702f', 4: '#f2b65e', 3: '#cfc8b8', 2: '#86a9d4', 1: '#3c4a86' };
export const MOOD_INK = { 5: '#ffffff', 4: '#2a2130', 3: '#2a2130', 2: '#1d2440', 1: '#ffffff' };
export const PW = 3000, PH = 4243;
export const FONT_SANS = '"Dayfold Sans", "Alegreya Sans", system-ui, sans-serif';
export const FONT_SERIF = '"Dayfold Serif", "Alegreya", Georgia, serif';

const THEMES = {
  paper: { bg: '#f5f5f0', ink: '#262033', muted: '#6b6577', empty: '#dcdad2', rule: '#e4e2da' },
  night: { bg: '#1f2236', ink: '#f2eff7', muted: '#aaa6ba', empty: '#3a3e58', rule: '#2c3049' },
};

function rounded(g, x, y, w, h, r) {
  g.beginPath();
  g.moveTo(x + r, y); g.lineTo(x + w - r, y); g.quadraticCurveTo(x + w, y, x + w, y + r);
  g.lineTo(x + w, y + h - r); g.quadraticCurveTo(x + w, y + h, x + w - r, y + h);
  g.lineTo(x + r, y + h); g.quadraticCurveTo(x, y + h, x, y + h - r);
  g.lineTo(x, y + r); g.quadraticCurveTo(x, y, x + r, y);
  g.closePath();
}

/* opts: { y, grid (pixels(): 12 x 31 of 0..5, -1 = no such date), theme, title, monthLetters [12], moodNames [5..1 as
 * index 0..4 = level 5..1], noEntry, stats: [[label, value], ...], dist [counts by level 1..5], credit } */
export function drawPoster(canvas, opts, scale = 1) {
  const W = Math.round(PW * scale), H = Math.round(PH * scale);
  canvas.width = W; canvas.height = H;
  const g = canvas.getContext('2d');
  const T = THEMES[opts.theme] || THEMES.paper;
  g.setTransform(scale, 0, 0, scale, 0, 0);
  g.fillStyle = T.bg; g.fillRect(0, 0, PW, PH);
  const M = 230;
  // title block
  g.fillStyle = T.ink;
  g.textBaseline = 'alphabetic';
  g.font = `800 360px ${FONT_SANS}`;
  g.fillText(String(opts.y), M - 12, M + 300);
  g.font = `500 112px ${FONT_SERIF}`;
  g.fillStyle = T.ink;
  const title = String(opts.title || '').slice(0, 60);
  fitText(g, title, M, M + 470, PW - 2 * M, 112, FONT_SERIF, 500);
  // the grid: 12 months across, 31 days down
  const top = 1010, bottom = PH - 300;
  const pitch = Math.min((bottom - top) / 31.6, 100);
  const cell = Math.round(pitch * 0.84);
  const labelW = 120;
  const gx = M + labelW, gy = top + pitch * 0.6;
  g.font = `700 52px ${FONT_SANS}`;
  g.textAlign = 'center';
  g.fillStyle = T.muted;
  for (let m = 0; m < 12; m++) g.fillText(opts.monthLetters[m], gx + m * pitch + cell / 2, top + 10);
  g.textAlign = 'right';
  g.font = `400 40px ${FONT_SANS}`;
  for (let d = 0; d < 31; d++) if (d === 0 || (d + 1) % 5 === 0) g.fillText(String(d + 1), gx - 30, gy + d * pitch + cell * 0.72);
  for (let m = 0; m < 12; m++) {
    for (let d = 0; d < 31; d++) {
      const v = opts.grid[m][d];
      if (v < 0) continue;
      const x = gx + m * pitch, y = gy + d * pitch;
      rounded(g, x, y, cell, cell, cell * 0.2);
      if (v > 0) { g.fillStyle = MOOD[v]; g.fill(); }
      else { g.lineWidth = 4; g.strokeStyle = T.empty; g.stroke(); }
    }
  }
  // the side column: legend, numbers, the share of each mood
  const sx = gx + 12 * pitch + 150, sw = PW - M - sx;
  let y = top + 20;
  g.textAlign = 'left';
  for (let lv = 5; lv >= 1; lv--) {
    rounded(g, sx, y, 74, 74, 15); g.fillStyle = MOOD[lv]; g.fill();
    g.fillStyle = T.ink; g.font = `500 64px ${FONT_SANS}`;
    fitText(g, opts.moodNames[5 - lv], sx + 110, y + 58, sw - 110, 64, FONT_SANS, 500);
    y += 118;
  }
  rounded(g, sx, y, 74, 74, 15); g.lineWidth = 4; g.strokeStyle = T.empty; g.stroke();
  g.fillStyle = T.muted; g.font = `400 64px ${FONT_SANS}`;
  fitText(g, opts.noEntry, sx + 110, y + 58, sw - 110, 64, FONT_SANS, 400);
  y += 230;
  g.strokeStyle = T.rule; g.lineWidth = 4; g.beginPath(); g.moveTo(sx, y - 90); g.lineTo(sx + sw, y - 90); g.stroke();
  for (const [label, value] of opts.stats || []) {
    g.fillStyle = T.ink; g.font = `800 120px ${FONT_SANS}`;
    fitText(g, String(value), sx, y + 30, sw, 120, FONT_SANS, 800);
    g.fillStyle = T.muted; g.font = `400 54px ${FONT_SANS}`;
    fitText(g, label, sx, y + 105, sw, 54, FONT_SANS, 400);
    y += 250;
  }
  // share of days at each level, as one bar
  const dist = opts.dist || [];
  const total = [1, 2, 3, 4, 5].reduce((a, lv) => a + (dist[lv] || 0), 0);
  if (total) {
    let x = sx;
    const bh = 64;
    for (let lv = 5; lv >= 1; lv--) {
      const w = (sw * (dist[lv] || 0)) / total;
      if (w <= 0) continue;
      g.fillStyle = MOOD[lv]; g.fillRect(x, y, w, bh); x += w;
    }
  }
  // credit
  g.fillStyle = T.muted; g.font = `400 40px ${FONT_SANS}`; g.textAlign = 'left';
  g.fillText(opts.credit || '', M, PH - 150);
  g.setTransform(1, 0, 0, 1, 0, 0);
  return canvas;
}

// write a line, shrinking the font until it fits the width
export function fitText(g, text, x, y, maxW, size, family, weight) {
  let s = size;
  g.font = `${weight} ${s}px ${family}`;
  while (s > 12 && g.measureText(text).width > maxW) { s -= 4; g.font = `${weight} ${s}px ${family}`; }
  g.fillText(text, x, y);
}
