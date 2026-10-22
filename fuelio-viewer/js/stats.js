/* Fillbook: the numbers. Everything is worked out in kilometres, litres and l/100 km inside, and shown in the units the
 * vehicle is set to. Consumption follows the usual full-tank method: the fuel put in since the last full tank, divided by
 * the distance since that fill-up. Nothing here touches the network. */
import { dayNumber, dayParts, L_PER_GAL, KM_PER_MI, OWN_KM, OWN_MI } from './parse.js';

/* ---------- units ---------- */
// l100 is the amount per 100 km inside: litres for petrol, diesel and LPG, or the file's own unit (kWh, kg, m3) for OWN
export const consDisplay = (l100, unit) => {
  if (!(l100 > 0)) return NaN;
  switch (unit) {
    case 1: return 235.214583 / l100;
    case 2: return 282.480936 / l100;
    case 3: return 100 / l100;
    case 4: return (100 / l100) * L_PER_GAL[1];
    case 5: return (100 / l100) * L_PER_GAL[2];
    case OWN_MI: return l100 * KM_PER_MI;
    case OWN_KM:
    default: return l100;
  }
};
// l/100 km and the own units per 100 km or miles go down as the car does better; mpg, km/l and km/gal go up
export const consLowerIsBetter = unit => unit <= 0;
export const distDisplay = (km, unit) => (unit === 1 ? km / KM_PER_MI : km);
export const volDisplay = (litres, unit) => litres / (L_PER_GAL[unit] || 1);
export const perUnitPrice = (perLitre, unit) => perLitre * (L_PER_GAL[unit] || 1);
export const perDistCost = (perKm, unit) => (unit === 1 ? perKm * KM_PER_MI : perKm);

/* ---------- consumption, fill-up by fill-up ---------- */
export const oddCons = c => !(c >= 1 && c <= 80);

// adds .cons (l/100 km), .ivFuel (litres) and .ivDist (km) to the fill-ups that close a full-tank interval, and builds the
// odometer events the distance in a period is read from. Safe to call again.
export function prepare(v) {
  for (const r of v.log) { delete r.cons; delete r.ivFuel; delete r.ivDist; }
  let backwards = 0;
  const tanks = [...new Set(v.log.map(r => r.tank))].sort((a, b) => a - b);
  for (const t of tanks) {
    let anchor = null, acc = 0;
    for (const r of v.log) {
      if (r.tank !== t || r.alt) continue;
      const hasOdo = r.odo > 0;
      if (r.missed > 0 || r.exclude) { anchor = r.full && hasOdo ? r : null; acc = 0; continue; }
      if (!anchor) { if (r.full && hasOdo) { anchor = r; acc = 0; } continue; }
      acc += r.litres || 0;
      if (!r.full || !hasOdo) continue;
      if (r.odo <= anchor.odo) { backwards++; continue; }
      const dist = r.odo - anchor.odo;
      r.cons = (acc / dist) * 100; r.ivFuel = acc; r.ivDist = dist;
      anchor = r; acc = 0;
    }
  }
  // odometer readings by day (the day's highest, never going down), for reading a distance off any period
  const src = v.log.some(r => r.odo > 0) ? v.log : v.costs;
  const byDay = new Map();
  for (const r of src) if (r.odo > 0) byDay.set(r.day, Math.max(byDay.get(r.day) || 0, r.odo));
  const events = [...byDay.entries()].sort((a, b) => a[0] - b[0]).map(([day, odo]) => ({ day, odo }));
  let top = 0;
  for (const e of events) { if (e.odo < top) { backwards++; e.odo = top; } else top = e.odo; }
  v.events = events;
  v.tanksUsed = tanks;
  const days = [...v.log.map(r => r.day), ...v.costs.map(c => c.day)];
  v.first = Math.min(...days); v.last = Math.max(...days);
  v.notes.backwards = backwards;
  v.notes.odd = v.log.filter(r => r.cons != null && oddCons(r.cons)).length;
  return v;
}

export function odoAt(events, day) {
  if (!events.length) return NaN;
  if (day <= events[0].day) return events[0].odo;
  const last = events[events.length - 1];
  if (day >= last.day) return last.odo;
  let lo = 0, hi = events.length - 1;
  while (hi - lo > 1) { const mid = (lo + hi) >> 1; if (events[mid].day <= day) lo = mid; else hi = mid; }
  const a = events[lo], b = events[hi];
  return a.odo + ((b.odo - a.odo) * (day - a.day)) / (b.day - a.day);
}

/* ---------- periods ---------- */
export const monthStart = (y, m) => dayNumber(y, m, 1);
export const monthEnd = (y, m) => dayNumber(m === 12 ? y + 1 : y, m === 12 ? 1 : m + 1, 1) - 1;
export function monthsIn(from, to) {
  const out = [];
  let { y, m } = dayParts(from);
  const end = dayParts(to);
  while (y < end.y || (y === end.y && m <= end.m)) {
    out.push({ y, m, start: monthStart(y, m), end: monthEnd(y, m), key: `${y}-${String(m).padStart(2, '0')}` });
    m++; if (m > 12) { m = 1; y++; }
  }
  return out;
}
// the free period: twelve calendar months ending with the month of the latest entry
export function freeWindow(v) {
  const { y, m } = dayParts(v.last);
  const first = dayParts(Date.UTC(y, m - 12, 1) / 86400000);
  return { from: monthStart(first.y, first.m), to: v.last, id: 'last12' };
}
export const yearWindow = y => ({ from: dayNumber(y, 1, 1), to: dayNumber(y, 12, 31), id: String(y) });
export const allWindow = v => ({ from: v.first, to: v.last, id: 'all' });
export function yearsOf(v) {
  const s = new Set();
  for (const r of v.log) s.add(dayParts(r.day).y);
  for (const c of v.costs) s.add(dayParts(c.day).y);
  return [...s].sort((a, b) => a - b);
}

/* ---------- cost categories ---------- */
const PURCHASE = /(purchase|bought|sale|sold|zakup|kupno|sprzeda|kauf|verkauf|compra|venta|achat|vente|acquist|vendita|aankoop|verkoop|compr)/i;
// categories that are not running costs (buying or selling the car) start unticked, so cost per km is not a purchase price
export function defaultExcluded(v) {
  const out = new Set();
  for (const c of v.cats.values()) if (PURCHASE.test(c.name)) out.add(c.id);
  return out;
}

/* ---------- one period of one vehicle ---------- */
export function aggregate(v, win, excluded = new Set()) {
  const { from, to } = win;
  const inWin = d => d >= from && d <= to;
  const fills = v.log.filter(r => inWin(r.day));
  const costs = v.costs.filter(c => inWin(c.day) && !excluded.has(c.typeId));
  const priced = fills.filter(r => r.price >= 0 && r.litres > 0);
  const fuelCost = fills.reduce((a, r) => a + (r.price >= 0 ? r.price : 0), 0);
  const measured = fills.filter(r => r.litres > 0);
  const litres = measured.reduce((a, r) => a + r.litres, 0);
  const otherCost = costs.reduce((a, c) => a + c.amount, 0);
  const total = fuelCost + otherCost;
  // distance between the odometer readings that fall in the period
  const lo = Math.max(from, v.first), hi = Math.min(to, v.last);
  const distance = v.events.length && lo < hi ? Math.max(0, odoAt(v.events, hi) - odoAt(v.events, lo)) : 0;
  // consumption: every full-tank interval that closes in the period
  const series = fills.filter(r => r.cons != null && !oddCons(r.cons)).map(r => ({ day: r.day, cons: r.cons, tank: r.tank, odo: r.odo }));
  const ivF = fills.filter(r => r.cons != null && !oddCons(r.cons)).reduce((a, r) => a + r.ivFuel, 0);
  const ivD = fills.filter(r => r.cons != null && !oddCons(r.cons)).reduce((a, r) => a + r.ivDist, 0);
  const byTank = {};
  for (const t of v.tanksUsed) {
    const rows = fills.filter(r => r.tank === t && r.cons != null && !oddCons(r.cons));
    const f = rows.reduce((a, r) => a + r.ivFuel, 0), d = rows.reduce((a, r) => a + r.ivDist, 0);
    byTank[t] = { n: rows.length, avg: d > 0 ? (f / d) * 100 : NaN, best: rows.length ? Math.min(...rows.map(r => r.cons)) : NaN, worst: rows.length ? Math.max(...rows.map(r => r.cons)) : NaN };
  }
  const main = v.tanksUsed.length ? v.tanksUsed.slice().sort((a, b) => (byTank[b].n - byTank[a].n) || a - b)[0] : 1;
  // categories
  const cats = new Map();
  for (const c of v.costs.filter(x => inWin(x.day))) {
    const k = c.typeId;
    const e = cats.get(k) || { id: k, name: c.category, color: (v.cats.get(k) || {}).color || '', total: 0, n: 0, excluded: excluded.has(k) };
    e.total += c.amount; e.n++;
    cats.set(k, e);
  }
  // months
  const mFrom = Math.max(from, v.first), mTo = Math.min(to, v.last);
  const months = (mFrom <= mTo ? monthsIn(mFrom, mTo) : []).map(mo => {
    const a = Math.max(mo.start, from), b = Math.min(mo.end, to);
    const f = v.log.filter(r => r.day >= a && r.day <= b);
    const c = v.costs.filter(x => x.day >= a && x.day <= b && !excluded.has(x.typeId));
    const fuel = f.reduce((s, r) => s + (r.price >= 0 ? r.price : 0), 0);
    const other = c.reduce((s, x) => s + x.amount, 0);
    const whole = v.events.length && v.events[0].day <= mo.start && v.events[v.events.length - 1].day >= mo.end && a === mo.start && b === mo.end;
    const dist = whole ? Math.max(0, odoAt(v.events, mo.end) - odoAt(v.events, mo.start)) : null;
    return { ...mo, fuel, other, litres: f.reduce((s, r) => s + (r.litres > 0 ? r.litres : 0), 0), n: f.length, dist, cpk: dist > 0.5 ? (fuel + other) / dist : null, partial: !(a === mo.start && b === mo.end) || v.last < mo.end };
  });
  const monthCount = months.length || 1;
  return {
    from, to, fills: fills.length, costN: costs.length, litres, fuelCost, otherCost, total, distance,
    consAvg: ivD > 0 ? (ivF / ivD) * 100 : NaN, consN: series.length, series, byTank, mainTank: main,
    consBest: series.length ? Math.min(...series.map(s => s.cons)) : NaN, consWorst: series.length ? Math.max(...series.map(s => s.cons)) : NaN,
    pricePerLitre: priced.length ? priced.reduce((a, r) => a + r.price, 0) / priced.reduce((a, r) => a + r.litres, 0) : NaN,
    costPerKm: distance > 1 ? total / distance : NaN,
    fuelPerKm: distance > 1 ? fuelCost / distance : NaN,
    perMonth: total / monthCount, monthCount, avgFill: measured.length ? litres / measured.length : NaN,
    cats: [...cats.values()].sort((a, b) => b.total - a.total), months,
  };
}

/* ---------- the year by year table ---------- */
export function byYear(v, excluded) {
  return yearsOf(v).map(y => ({ y, ...aggregate(v, yearWindow(y), excluded) }));
}

/* ---------- the entries of a period, newest first, fill-ups and costs together ---------- */
export function entriesOf(v, win, excluded = new Set()) {
  const rows = [];
  for (const r of v.log) if (r.day >= win.from && r.day <= win.to) rows.push({ kind: 'fuel', day: r.day, odo: r.odo, r });
  for (const c of v.costs) if (c.day >= win.from && c.day <= win.to) rows.push({ kind: 'cost', day: c.day, odo: c.odo, c, off: excluded.has(c.typeId) });
  rows.sort((a, b) => b.day - a.day || (b.odo || 0) - (a.odo || 0));
  return rows;
}
