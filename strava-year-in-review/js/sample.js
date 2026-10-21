/* The sample: a made-up athlete built in your browser, so you can see every part of Yearlap before your export arrives.
 * Two years of runs, rides, swims, hikes and gym sessions (last year and this year up to today), three pieces of gear,
 * and a drawn route for every outdoor activity. Nothing here is anyone's real data. */

function rng(seed) {
  let a = seed >>> 0;
  return () => { a = (a + 0x6d2b79f5) >>> 0; let t = a; t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
}
const DAY = 864e5;

// activities.csv rows in the English layout of a 2026 export (the second block of raw numbers included)
export const SAMPLE_HEADER = ['Activity ID', 'Activity Date', 'Activity Name', 'Activity Type', 'Activity Description', 'Elapsed Time', 'Distance', 'Max Heart Rate', 'Relative Effort', 'Commute', 'Activity Private Note', 'Activity Gear', 'Filename', 'Athlete Weight', 'Bike Weight', 'Elapsed Time', 'Moving Time', 'Distance', 'Max Speed', 'Average Speed', 'Elevation Gain', 'Elevation Loss'];

export function makeSampleActivities(today = new Date()) {
  const r = rng(20261122);
  const Y = today.getUTCFullYear();
  const start = Date.UTC(Y - 1, 0, 1);
  const end = Date.UTC(today.getUTCFullYear(), today.getUTCMonth(), today.getUTCDate());
  const acts = [];
  let id = 15000000000;
  const add = (t, type, name, km, paceMin, elev, gear, outdoor = true) => {
    const moving = Math.round(km > 0 ? km * paceMin * 60 : paceMin * 60);
    const elapsed = Math.round(moving * (1.03 + r() * 0.08));
    id += 1 + Math.floor(r() * 9000);
    acts.push({ id: String(id), t, name, type, dist: Math.round(km * 1000 * 10) / 10, moving, elapsed, elev: Math.round(elev), gear, file: outdoor ? `activities/${id + 7}.gpx` : '' });
  };
  for (let d = start; d <= end; d += DAY) {
    const date = new Date(d);
    const wd = (date.getUTCDay() + 6) % 7; // Mon 0
    const mo = date.getUTCMonth();
    const yearN = date.getUTCFullYear() - (Y - 1); // 0 last year, 1 this year
    const winter = mo < 2 || mo === 11;
    const fit = 1 + yearN * 0.12 + Math.sin((mo - 2) / 12 * Math.PI * 2) * 0.12;
    const skip = r() < 0.12; // life happens
    if (skip) continue;
    const at = (h, m) => d + (h * 60 + m) * 60000;
    const shoe = d < Date.UTC(Y, 3, 1) ? 'Sample trainers (blue)' : 'Sample trainers (orange)';
    if (wd === 1 || wd === 3) add(at(5, 40 + Math.floor(r() * 30)), 'Run', 'Morning Run', (6 + r() * 4) * fit, 5.3 - r() * 0.4, 30 + r() * 60, shoe);
    if (wd === 6) add(at(7, 10), 'Run', r() < 0.2 ? 'Long run by the river' : 'Sunday long run', (14 + r() * 8) * fit * (mo === 9 && date.getUTCDate() > 7 && date.getUTCDate() < 15 ? 1.9 : 1), 5.6 - r() * 0.3, 80 + r() * 150, shoe);
    if (wd === 5 && !winter) add(at(6, 30), 'Ride', r() < 0.3 ? 'Hill loop' : 'Saturday ride', (55 + r() * 45) * fit, 60 / (26 + r() * 5), 400 + r() * 900, 'Sample road bike');
    if (wd === 5 && winter && r() < 0.6) add(at(17, 0), 'Virtual Ride', 'Indoor ride', (30 + r() * 15), 60 / 30, 250 + r() * 200, 'Sample road bike', false);
    if (wd === 2 && r() < 0.55) add(at(18, 15), 'Swim', 'Evening Swim', 1.6 + r() * 1.4, 21 + r() * 3, 0, '', false);
    if (wd === 0 && r() < 0.65) add(at(19, 0), 'Weight Training', 'Strength', 0, 40 + r() * 20, 0, '', false);
    if (wd === 4 && r() < 0.35) add(at(12, 20), 'Walk', 'Lunch walk', 3 + r() * 2, 11.5, 10 + r() * 20, '');
    if (wd === 6 && date.getUTCDate() <= 7 && !winter) add(at(9, 0), 'Hike', 'Mountain day', 14 + r() * 8, 14, 700 + r() * 600, '');
  }
  // the year's big ride: a summer century
  add(Date.UTC(Y - 1, 6, 12, 5, 20), 'Ride', 'Century before breakfast', 162.4, 60 / 27.5, 2140, 'Sample road bike');
  if (end > Date.UTC(Y, 6, 20)) add(Date.UTC(Y, 6, 19, 5, 10), 'Ride', 'Century, the long way round', 171.8, 60 / 28.1, 2380, 'Sample road bike');
  acts.sort((a, b) => a.t - b.t);
  return acts;
}

// the same activities as an activities.csv text (dates in the English export style, times in UTC)
const MON = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
export function enDate(t) {
  const d = new Date(t);
  const h = d.getUTCHours();
  const hh = h % 12 === 0 ? 12 : h % 12;
  const p = n => String(n).padStart(2, '0');
  return `${MON[d.getUTCMonth()]} ${d.getUTCDate()}, ${d.getUTCFullYear()}, ${hh}:${p(d.getUTCMinutes())}:${p(d.getUTCSeconds())} ${h < 12 ? 'AM' : 'PM'}`;
}
export function sampleCsv(acts) {
  const q = s => (/[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s);
  const lines = [SAMPLE_HEADER.join(',')];
  for (const a of acts) {
    lines.push([a.id, q(enDate(a.t)), q(a.name), a.type, '', a.elapsed, (a.dist / 1000).toFixed(2), '', '', 'false', '', q(a.gear), a.file, '', '', a.elapsed.toFixed(1), a.moving.toFixed(1), a.dist.toFixed(1), '', a.moving ? (a.dist / a.moving).toFixed(3) : '', a.elev.toFixed(1), a.elev.toFixed(1)].join(','));
  }
  return lines.join('\n') + '\n';
}

// a drawn route for a sample activity: a street-like loop (or an out-and-back) whose length matches the distance
export function sampleRoute(act) {
  const r = rng(Number(String(act.id).slice(-8)) || 7);
  const km = Math.max(1, act.dist / 1000);
  const lat0 = 46.2 + r() * 0.3, lon0 = 7.1 + r() * 0.4; // no map is drawn, only the shape
  const kx = 1 / (111.32 * Math.cos((lat0 * Math.PI) / 180)), ky = 1 / 110.57;
  const outBack = r() < 0.25;
  const n = 240;
  let x = 0, y = 0, h = r() * Math.PI * 2;
  const turnEvery = 0.025 + r() * 0.035;
  const pts = [[0, 0]];
  for (let i = 1; i < n; i++) {
    if (r() < turnEvery) h += (r() < 0.5 ? -1 : 1) * (Math.PI / 10 + r() * Math.PI / 4);
    else h += (r() - 0.5) * 0.05;
    // a loop bends round to come home
    if (!outBack) h += (Math.PI * 2) / n * 0.9;
    x += Math.cos(h); y += Math.sin(h);
    pts.push([x, y]);
  }
  if (outBack) { for (let i = pts.length - 2; i >= 0; i--) pts.push([pts[i][0] + 0.6, pts[i][1] + 0.6]); }
  else {
    const [ex, ey] = pts[pts.length - 1];
    for (let i = 0; i < pts.length; i++) { const t = i / (pts.length - 1); pts[i] = [pts[i][0] - ex * t, pts[i][1] - ey * t]; }
  }
  let len = 0;
  for (let i = 1; i < pts.length; i++) len += Math.hypot(pts[i][0] - pts[i - 1][0], pts[i][1] - pts[i - 1][1]);
  const sc = km / (len || 1);
  const out = [];
  for (const [px, py] of pts) out.push(lat0 + py * sc * ky, lon0 + px * sc * kx);
  return Float64Array.from(out);
}
