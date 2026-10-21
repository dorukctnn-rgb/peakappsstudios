/* The route poster (Pro): every route of the year side by side, drawn from the GPS files in your export, in date order.
 * Full size is 3000 x 4243 pixels (the A-series ratio: A3 at about 250 dpi, A4 at about 360 dpi); the preview is the same
 * drawing, smaller. */
import { fill } from './i18n.js';
import { DISPLAY, TEXT, C, FAM, drawRoutes, lapMark } from './cards.js';

export const PW = 3000, PH = 4243;
const THEMES = {
  night: { bg: C.night, ink: C.white, sub: C.glacier, colors: FAM },
  chalk: { bg: '#f4f6f7', ink: C.night, sub: '#4b5a6e', colors: { run: '#e8213f', ride: '#1f7fae', swim: '#119b85', walk: '#c98a00', winter: '#5b6f8f', water: '#3f66c9', gym: '#8b5bd6', other: '#6b7a8f' } },
};

function txt(ctx, text, x, y, maxW, size, fam, color, align = 'left', weight = 400) {
  let s = size;
  const set = () => { ctx.font = `${fam === DISPLAY ? 'italic 800' : weight} ${s}px ${fam}`; };
  set();
  while (ctx.measureText(text).width > maxW && s > 10) { s -= 2; set(); }
  ctx.fillStyle = color; ctx.textAlign = align; ctx.textBaseline = 'alphabetic';
  ctx.fillText(text, x, y);
}

// o: { routes, year, name, theme, f, T, address, sport }
export function drawPoster(canvas, o, scale = 1) {
  const w = Math.round(PW * scale), h = Math.round(PH * scale);
  canvas.width = w; canvas.height = h;
  const ctx = canvas.getContext('2d');
  ctx.save();
  ctx.scale(scale, scale);
  const th = THEMES[o.theme] || THEMES.night;
  ctx.fillStyle = th.bg; ctx.fillRect(0, 0, PW, PH);
  const M = 200;
  const yearTxt = o.year === 'all' ? '' : String(o.year);
  txt(ctx, yearTxt || fill(o.T.posterTitleAll, {}), M - 10, 560, PW - M * 2, 440, DISPLAY, th.ink);
  const title = o.year === 'all' ? o.T.posterTitleAll : fill(o.T.posterTitle, { y: o.year });
  txt(ctx, (o.sport ? `${o.sport}. ` : '') + title, M, 700, PW - M * 2, 96, TEXT, th.sub, 'left', 700);
  if (o.name) txt(ctx, o.name, PW - M, 700, PW * 0.45, 96, TEXT, th.ink, 'right', 800);
  drawRoutes(ctx, o.routes, M - 30, 820, PW - (M - 30) * 2, PH - 820 - 520, { colors: th.colors, line: 0.024, pad: 0.1 });
  const total = o.routes.reduce((x, r) => x + r.dist, 0);
  ctx.fillStyle = th.ink; ctx.globalAlpha = 0.25; ctx.fillRect(M, PH - 400, PW - M * 2, 4); ctx.globalAlpha = 1;
  txt(ctx, fill(o.T.posterLine, { dist: o.f.distRound(total), n: o.f.n(o.routes.length) }), M, PH - 260, PW * 0.6, 92, DISPLAY, th.ink);
  lapMark(ctx, PW - M - 170, PH - 330, 170, th.ink === C.white ? 'rgba(255,255,255,0.3)' : 'rgba(15,27,45,0.25)', C.red, 0.8);
  txt(ctx, fill(o.T.posterMade, { addr: o.address }), M, PH - 160, PW - M * 2, 46, TEXT, th.sub, 'left', 500);
  ctx.restore();
}
