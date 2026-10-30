// One sun value for the whole page. t in 0..1 covers 07.00 to 20.30.
// Shared by the page (tokens, menu, control) and the 3D scene (sky, sea, light).
export const DAY = { start: 420, end: 1230, rise: 375, set: 1170, lamps: 1155 };
export const clamp = (x, a, b) => (x < a ? a : x > b ? b : x);
export const smooth = (a, b, x) => { const t = clamp((x - a) / (b - a), 0, 1); return t * t * (3 - 2 * t); };

export function minutesAt(t) { return DAY.start + clamp(t, 0, 1) * (DAY.end - DAY.start); }
export function tAt(m) { return clamp((m - DAY.start) / (DAY.end - DAY.start), 0, 1); }
export function parseHour(s) { const [h, m] = String(s).split(/[.:]/).map(Number); return h * 60 + (m || 0); }
export function fmtHour(m, sep = '.') { m = Math.round(m); const h = Math.floor(m / 60) % 24, mm = m % 60; return String(h).padStart(2, '0') + sep + String(mm).padStart(2, '0'); }

// Sunrise 06.15, sunset 19.30 (behind the ridge a little earlier), dusk after.
export function sunAngles(t) {
  const m = minutesAt(t);
  const f = (m - DAY.rise) / (DAY.set - DAY.rise);
  const elev = m <= DAY.set ? 58 * Math.sin(Math.PI * clamp(f, 0, 1)) : -(m - DAY.set) / 60 * 7;
  const az = 105 + f * 150; // compass: ESE at sunrise, S at noon, W-SW at sunset
  return { elev, az, m };
}

export function period(m) { return m < 690 ? 'sabah' : m < 1020 ? 'ogle' : 'aksam'; }

// Page palette. Two families with a hard switch at 19.15, when the string
// lights come on: every resting position keeps body text above 4.5:1.
const LIGHT = [
  { m: 420, ground: '#DCE5E8', ink: '#0E2431', soft: '#3D5560', accent: '#0A6A87', aink: '#F4F7F6', disc: '#F6C66E' },
  { m: 600, ground: '#E3EBEB', ink: '#0E2431', soft: '#3D5560', accent: '#0A6A87', aink: '#F4F7F6', disc: '#F8D88A' },
  { m: 780, ground: '#F1F3EF', ink: '#0E2431', soft: '#3F5862', accent: '#0A6A87', aink: '#F4F7F6', disc: '#FBE7A8' },
  { m: 960, ground: '#EEEDE8', ink: '#0F2330', soft: '#46525B', accent: '#1F5F7D', aink: '#F4F7F6', disc: '#F7D07A' },
  { m: 1050, ground: '#F0E2DA', ink: '#10222E', soft: '#53464E', accent: '#8C2C66', aink: '#FBF4F7', disc: '#F2A24E' },
  { m: 1120, ground: '#F2D7CF', ink: '#10202C', soft: '#5A4650', accent: '#B4236A', aink: '#FFF6FA', disc: '#EE7F3A' },
  { m: 1154.99, ground: '#EFCDC4', ink: '#10202C', soft: '#5A4650', accent: '#A81F62', aink: '#FFF6FA', disc: '#E2603A' },
];
const DARK = [
  { m: 1155, ground: '#1D2B3D', ink: '#F3EEE8', soft: '#BAC4CE', accent: '#F07DB4', aink: '#1D1020', disc: '#D9583F' },
  { m: 1230, ground: '#0F2230', ink: '#EEF0EA', soft: '#A9B9C0', accent: '#F07DB4', aink: '#1D1020', disc: '#B9506A' },
];
const hex = (h) => [parseInt(h.slice(1, 3), 16), parseInt(h.slice(3, 5), 16), parseInt(h.slice(5, 7), 16)];
const toHex = (c) => '#' + c.map((v) => Math.round(v).toString(16).padStart(2, '0')).join('');
const mix = (a, b, t) => { const A = hex(a), B = hex(b); return toHex(A.map((v, i) => v + (B[i] - v) * t)); };

export function palette(t) {
  const m = minutesAt(t);
  const K = m < DAY.lamps ? LIGHT : DARK;
  let i = 0;
  while (i < K.length - 2 && m > K[i + 1].m) i++;
  const A = K[i], B = K[i + 1];
  const f = clamp((m - A.m) / (B.m - A.m), 0, 1);
  const out = { dusk: m >= DAY.lamps };
  for (const k of ['ground', 'ink', 'soft', 'accent', 'aink', 'disc']) out[k] = mix(A[k], B[k], f);
  return out;
}
