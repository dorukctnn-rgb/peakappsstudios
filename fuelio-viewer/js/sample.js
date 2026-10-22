/* Fillbook's sample: two made-up vehicles, written in the same sectioned CSV a real log is saved in and read by the same
 * code your own file goes through. About three years up to the day you open it. Nothing here is anyone's real car. */
const p2 = n => String(n).padStart(2, '0');
const iso = (y, m, d) => `${y}-${p2(m)}-${p2(d)}`;
const q = s => `"${String(s == null ? '' : s).replace(/"/g, '""')}"`;
const line = cells => cells.map(q).join(',');
function rng(seed) { let a = seed >>> 0; return () => { a = (a + 0x6d2b79f5) >>> 0; let t = Math.imul(a ^ (a >>> 15), 1 | a); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; }; }

const NAMES = {
  en: { car: 'Sample hatchback (made up)', van: 'Sample van (made up)', cats: { 1: 'Service', 2: 'Maintenance', 4: 'Registration', 5: 'Parking', 6: 'Wash', 7: 'Tolls', 8: 'Fines', 31: 'Insurance', 32: 'Purchase', 33: 'Accessories', 34: 'Tyres' }, titles: { service: 'Annual service', oil: 'Oil and filters', insurance: 'Insurance, 12 months', tyres: 'Winter tyres, set of four', wash: 'Car wash', parking: 'Parking', toll: 'Motorway toll', fine: 'Speeding ticket', mats: 'Boot liner', brakes: 'Front brake pads', buy: 'Bought the car', reg: 'Road tax' }, city: ['Home', 'Station on the ring road', 'Motorway services', 'Supermarket'] },
  pl: { car: 'Przykładowy hatchback (zmyślony)', van: 'Przykładowy van (zmyślony)', cats: { 1: 'Serwis', 2: 'Naprawy', 4: 'Opłaty urzędowe', 5: 'Parking', 6: 'Mycie', 7: 'Opłaty drogowe', 8: 'Mandaty', 31: 'Ubezpieczenie', 32: 'Zakup', 33: 'Akcesoria', 34: 'Opony' }, titles: { service: 'Przegląd roczny', oil: 'Olej i filtry', insurance: 'OC i AC, 12 miesięcy', tyres: 'Opony zimowe, komplet', wash: 'Myjnia', parking: 'Parking', toll: 'Autostrada', fine: 'Mandat za prędkość', mats: 'Mata do bagażnika', brakes: 'Klocki hamulcowe z przodu', buy: 'Zakup auta', reg: 'Opłata rejestracyjna' }, city: ['Dom', 'Stacja przy obwodnicy', 'Stacja na autostradzie', 'Hipermarket'] },
};

// rows are produced oldest first, then written in the order asked
function car(lang, today, order) {
  const W = NAMES[lang] || NAMES.en;
  const r = rng(7311);
  const end = new Date(Date.UTC(today.getFullYear(), today.getMonth(), today.getDate() - 3));
  let t = Date.UTC(today.getFullYear() - 3, today.getMonth(), 1);
  let odo = 48200;
  const rows = [], costs = [];
  let n = 0;
  while (t < end.getTime()) {
    const d = new Date(t);
    const month = d.getUTCMonth();
    const winter = month === 11 || month <= 1;
    const dist = 430 + Math.round(r() * 260);
    const cons = (winter ? 7.4 : 6.3) + r() * 0.9 + (month >= 5 && month <= 7 ? 0.35 : 0);
    const litres = Math.round(dist * cons) / 100;
    const ppl = Math.round((1.52 + 0.07 * Math.sin((t / 864e5) / 58) + r() * 0.06 + (d.getUTCFullYear() - 2023) * 0.03) * 1000) / 1000;
    odo += dist;
    n++;
    const partial = n % 11 === 0;
    const missed = n === 31 ? 1 : 0;
    rows.push({ t, odo, litres: partial ? Math.round(litres * 55) / 100 : litres, price: Math.round((partial ? litres * 0.55 : litres) * ppl * 100) / 100, full: partial ? 0 : 1, ppl, missed, city: W.city[Math.floor(r() * W.city.length)] });
    t += (9 + Math.round(r() * 5)) * 864e5;
  }
  const y0 = today.getFullYear() - 3;
  const push = (t0, odoAt, title, type, cost) => { if (t0 < end.getTime()) costs.push({ t: t0, odo: odoAt, title, type, cost }); };
  const at = (y, m, dd) => Date.UTC(y, m, dd);
  const odoNear = tt => { let o = 48200; for (const x of rows) { if (x.t <= tt) o = x.odo; } return o; };
  push(Date.UTC(y0, today.getMonth(), 1), 48200, W.titles.buy, 32, 9400);
  for (let k = 0; k < 4; k++) {
    const y = y0 + k;
    push(at(y, today.getMonth() + 1, 4), odoNear(at(y, today.getMonth() + 1, 4)), W.titles.insurance, 31, 520 + k * 18);
    push(at(y, today.getMonth() + 2, 12), odoNear(at(y, today.getMonth() + 2, 12)), W.titles.service, 1, 410 + k * 20);
    push(at(y, 3, 20), odoNear(at(y, 3, 20)), W.titles.reg, 4, 85);
    push(at(y, 10, 8), odoNear(at(y, 10, 8)), W.titles.tyres, 34, k === 1 ? 640 : 0);
  }
  push(at(y0 + 1, 5, 17), odoNear(at(y0 + 1, 5, 17)), W.titles.brakes, 2, 310);
  push(at(y0 + 2, 1, 9), odoNear(at(y0 + 2, 1, 9)), W.titles.oil, 1, 95);
  push(at(y0 + 2, 6, 3), odoNear(at(y0 + 2, 6, 3)), W.titles.mats, 33, 48);
  push(at(y0 + 2, 8, 21), odoNear(at(y0 + 2, 8, 21)), W.titles.fine, 8, 120);
  for (let k = 0; k < 16; k++) {
    const tt = t0Of(y0, today, k);
    push(tt, odoNear(tt), W.titles.wash, 6, 11 + (k % 3) * 2);
    if (k % 3 === 0) push(tt + 864e5 * 6, odoNear(tt), W.titles.parking, 5, 6 + (k % 4));
    if (k % 4 === 1) push(tt + 864e5 * 9, odoNear(tt), W.titles.toll, 7, 18 + (k % 3) * 4);
  }
  const ok = costs.filter(c => c.cost > 0).sort((a, b) => a.t - b.t);
  return { name: W.car, vehicle: ['', '0', '0', '0', 'yyyy-MM-dd', '', '', '', 'Sample', 'Hatchback', y0 + 3 - 4, 1], rows: order === 'newest' ? rows.slice().sort((a, b) => b.t - a.t) : rows, costs: ok, cats: W.cats };
}
function t0Of(y0, today, k) { return Date.UTC(y0, today.getMonth(), 20) + k * 71 * 864e5; }

function van(lang, today) {
  const W = NAMES[lang] || NAMES.en;
  const r = rng(404);
  const end = new Date(Date.UTC(today.getFullYear(), today.getMonth(), today.getDate() - 9));
  let t = Date.UTC(today.getFullYear() - 2, today.getMonth() + 1, 3);
  let odo = 112400;
  const rows = [], costs = [];
  while (t < end.getTime()) {
    const dist = 520 + Math.round(r() * 420);
    const cons = 8.9 + r() * 1.5;
    const litres = Math.round(dist * cons) / 100;
    const ppl = Math.round((1.61 + r() * 0.1) * 1000) / 1000;
    odo += dist;
    rows.push({ t, odo, litres, price: Math.round(litres * ppl * 100) / 100, full: 1, ppl, missed: 0, city: W.city[1] });
    t += (6 + Math.round(r() * 6)) * 864e5;
  }
  const y = today.getFullYear();
  const odoNear = tt => { let o = 112400; for (const x of rows) { if (x.t <= tt) o = x.odo; } return o; };
  const add = (tt, title, type, cost) => { if (tt < end.getTime()) costs.push({ t: tt, odo: odoNear(tt), title, type, cost }); };
  add(Date.UTC(y - 2, 8, 12), W.titles.service, 1, 520);
  add(Date.UTC(y - 1, 8, 15), W.titles.service, 1, 560);
  add(Date.UTC(y - 2, 9, 2), W.titles.insurance, 31, 910);
  add(Date.UTC(y - 1, 9, 2), W.titles.insurance, 31, 940);
  add(Date.UTC(y, 0, 22), W.titles.tyres, 34, 780);
  add(Date.UTC(y, 3, 9), W.titles.brakes, 2, 430);
  for (let k = 0; k < 9; k++) { const tt = Date.UTC(y - 2, 10, 5) + k * 83 * 864e5; add(tt, W.titles.toll, 7, 40 + (k % 4) * 15); }
  return { name: W.van, vehicle: ['', '0', '0', '3', 'yyyy-MM-dd', '', '', '', 'Sample', 'Van', y - 6, 1], rows, costs: costs.sort((a, b) => a.t - b.t), cats: W.cats };
}

function toCsv(x, F = 1) {
  const out = [];
  out.push(q('## Vehicle'));
  out.push(line(['Name', 'Description', 'DistUnit', 'FuelUnit', 'ConsumptionUnit', 'ImportCSVDateFormat', 'VIN', 'Insurance', 'Plate', 'Make', 'Model', 'Year', 'TankCount', 'Tank1Type', 'Tank2Type']));
  out.push(line([x.name, '', x.vehicle[1], x.vehicle[2], x.vehicle[3], 'yyyy-MM-dd', '', '', '', x.vehicle[8], x.vehicle[9], x.vehicle[10], '1', '100', '0']));
  out.push(q('## Log'));
  out.push(line(['Data', 'Odo (km)', 'Fuel (litres)', 'Full', 'Price (optional)', 'l/100km (optional)', 'latitude (optional)', 'longitude (optional)', 'City (optional)', 'Notes (optional)', 'Missed', 'TankNumber', 'FuelType', 'VolumePrice', 'StationID (optional)']));
  for (const r of x.rows) {
    const d = new Date(r.t);
    out.push(line([iso(d.getUTCFullYear(), d.getUTCMonth() + 1, d.getUTCDate()), r.odo, r.litres.toFixed(2), r.full, (r.price * F).toFixed(2), '', '', '', r.city, '', r.missed, 1, 0, (r.ppl * F).toFixed(3), '']));
  }
  out.push(q('## CostCategories'));
  out.push(line(['CostTypeID', 'Name', 'priority', 'color']));
  for (const [id, name] of Object.entries(x.cats)) out.push(line([id, name, 0, '#795548']));
  out.push(q('## Costs'));
  out.push(line(['CostTitle', 'Date', 'Odo', 'CostTypeID', 'Notes', 'Cost', 'flag', 'idR', 'read', 'RemindOdo', 'RemindDate', 'isTemplate', 'RepeatOdo', 'RepeatMonths']));
  for (const c of x.costs) {
    const d = new Date(c.t);
    out.push(line([c.title, iso(d.getUTCFullYear(), d.getUTCMonth() + 1, d.getUTCDate()), c.odo, c.type, '', Math.round(c.cost * F), 0, 0, 1, 0, '2011-01-01', 0, 0, 0]));
  }
  return out.join('\r\n') + '\r\n';
}

// two made-up vehicles as the files an app would have saved: { name, text }
export function sampleFiles(lang = 'en', today = new Date()) {
  const a = car(lang, today, 'newest');
  const b = van(lang, today);
  const F = lang === 'pl' ? 4.3 : 1;
  return [{ name: 'sample-hatchback.csv', text: toCsv(a, F) }, { name: 'sample-van.csv', text: toCsv(b, F) }];
}
