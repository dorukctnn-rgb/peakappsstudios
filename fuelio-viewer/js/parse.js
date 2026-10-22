/* Fillbook: reads the CSV a fuel and cost log app saves (the sectioned file: "## Vehicle", "## Log", "## CostCategories",
 * "## Costs"). The layout is public: the field order is written down by the open-source FuelioImport converter (MIT,
 * github.com/Programistyk/FuelioImport, lib/fuelioimporter/fueliobackupbuilder.class.php) and the app's own sample file.
 * The reader works from the section name and from each column's header, never from a position, so extra columns, other
 * column orders, quotes or no quotes, comma or semicolon, a byte order mark, and sections it does not know all read
 * fine. Nothing here touches the network; the file is read in this tab and is never changed. */

export class LogError extends Error {
  constructor(code, detail) { super(detail || code); this.code = code; this.detail = detail || ''; }
}

const MAX_BYTES = 40 * 1024 * 1024;
const DAY = 86400000;

/* ---------- text ---------- */
export function decodeText(bytes, fallback = 'windows-1252') {
  if (bytes.length > MAX_BYTES) throw new LogError('toolarge');
  let b = bytes;
  if (b.length >= 3 && b[0] === 0xef && b[1] === 0xbb && b[2] === 0xbf) b = b.subarray(3);
  // a UTF-16 file (some spreadsheet exports) announces itself with its own byte order mark
  if (b.length >= 2 && ((b[0] === 0xff && b[1] === 0xfe) || (b[0] === 0xfe && b[1] === 0xff))) {
    try { return new TextDecoder(b[0] === 0xff ? 'utf-16le' : 'utf-16be').decode(b.subarray(2)); } catch (e) { /* fall through */ }
  }
  try { return new TextDecoder('utf-8', { fatal: true }).decode(b); } catch (e) { /* not UTF-8 */ }
  try { return new TextDecoder(fallback).decode(b); } catch (e) { return new TextDecoder('utf-8').decode(b); }
}

// a file that is not text at all (a photo, a PDF, a spreadsheet) has NUL bytes or a lot of control characters early on
export function looksBinary(bytes) {
  const n = Math.min(bytes.length, 4096);
  let bad = 0;
  for (let i = 0; i < n; i++) {
    const c = bytes[i];
    if (c === 0) { if (!(n >= 2 && (bytes[0] === 0xff || bytes[0] === 0xfe))) return true; }
    if (c < 9 || (c > 13 && c < 32)) bad++;
  }
  return n > 0 && bad / n > 0.1;
}

/* ---------- CSV ---------- */
const clean = s => String(s == null ? '' : s).replace(/﻿/g, '').trim();

// the field separator: whichever of comma and semicolon (or tab) the first non-empty lines use most outside quotes
export function sniffDelimiter(text) {
  const lines = text.split(/\r?\n/).filter(l => l.trim()).slice(0, 8);
  const score = { ',': 0, ';': 0, '\t': 0 };
  for (const l of lines) {
    let q = false;
    for (const ch of l) { if (ch === '"') q = !q; else if (!q && ch in score) score[ch]++; }
  }
  let best = ',', n = -1;
  for (const d of [',', ';', '\t']) if (score[d] > n) { best = d; n = score[d]; }
  return best;
}

export function parseCsv(text, delim) {
  const rows = [];
  let row = [], cell = '', q = false, wasQuoted = false;
  const endCell = () => { row.push(wasQuoted ? cell : cell.trim()); cell = ''; wasQuoted = false; };
  const endRow = () => { endCell(); if (row.length > 1 || row[0] !== '') rows.push(row); row = []; };
  for (let i = 0; i < text.length; i++) {
    const ch = text[i];
    if (q) {
      if (ch === '"') { if (text[i + 1] === '"') { cell += '"'; i++; } else q = false; }
      else cell += ch;
    } else if (ch === '"' && (cell === '' || /^\s*$/.test(cell))) { q = true; wasQuoted = true; cell = ''; }
    else if (ch === delim) endCell();
    else if (ch === '\n') endRow();
    else if (ch === '\r') { if (text[i + 1] !== '\n') endRow(); }
    else cell += ch;
  }
  if (cell !== '' || row.length) endRow();
  return rows;
}

// "## Vehicle,,,," or "\"## Log\"" -> "log"; anything that is not a section line -> null
function sectionName(row) {
  const first = clean(row[0]);
  if (!first.startsWith('##')) return null;
  if (row.slice(1).some(c => clean(c))) return null;
  return first.replace(/^#+/, '').trim().toLowerCase().replace(/[^a-z0-9]/g, '');
}

export function sections(rows) {
  const out = [];
  let cur = null;
  for (const r of rows) {
    const name = sectionName(r);
    if (name != null) { cur = { name, header: null, rows: [] }; out.push(cur); continue; }
    if (!cur) continue;
    if (!cur.header) cur.header = r.map(clean); else cur.rows.push(r);
  }
  return out;
}

/* ---------- headers ---------- */
const keyOf = h => clean(h).replace(/\(.*?\)/g, '').replace(/[^a-z0-9]/gi, '').toLowerCase();
const CONS_RE = /(l\/100|mpg|km\/l|km\/gal|mi\/l|l100)/i;
function columns(header) {
  const idx = {};
  header.forEach((h, i) => {
    let k = keyOf(h);
    if (CONS_RE.test(h)) k = 'consumption';
    if (k && !(k in idx)) idx[k] = i;
  });
  return idx;
}
const pick = (idx, names) => { for (const n of names) if (n in idx) return idx[n]; return -1; };
const cellAt = (row, i) => (i >= 0 && i < row.length ? row[i] : '');

/* ---------- values ---------- */
export function num(s) {
  let t = clean(s).replace(/[\s  ']/g, '');
  if (t === '' || /^(null|<null>|nan|-)$/i.test(t)) return NaN;
  t = t.replace(/[^\d.,+-]/g, '');
  if (!/\d/.test(t)) return NaN;
  if (t.includes(',') && t.includes('.')) t = t.lastIndexOf(',') > t.lastIndexOf('.') ? t.replace(/\./g, '').replace(',', '.') : t.replace(/,/g, '');
  else if (t.includes(',')) t = (t.match(/,/g) || []).length > 1 ? t.replace(/,/g, '') : t.replace(',', '.');
  const v = Number(t);
  return Number.isFinite(v) ? v : NaN;
}

const p2 = n => String(n).padStart(2, '0');
export const dayNumber = (y, m, d) => Math.round(Date.UTC(y, m - 1, d) / DAY);
export function dayParts(day) { const d = new Date(day * DAY); return { y: d.getUTCFullYear(), m: d.getUTCMonth() + 1, d: d.getUTCDate() }; }
export const dayKey = day => { const { y, m, d } = dayParts(day); return `${y}-${p2(m)}-${p2(d)}`; };

// the order of the parts in the dates of a column: from the vehicle's own date format when it names one, else from the
// values themselves (a part above 12 gives it away), else day first
export function dateOrder(samples, hint = '') {
  const h = String(hint || '').toLowerCase();
  const iso = samples.length && samples.every(s => /^\d{4}[-./]\d{1,2}[-./]\d{1,2}/.test(clean(s)));
  if (iso) return 'ymd';
  const first = h.search(/[dmy]/);
  const hintOrder = (() => {
    const pos = { d: h.indexOf('d'), m: h.indexOf('m'), y: h.indexOf('y') };
    if (pos.d < 0 || pos.m < 0 || pos.y < 0) return '';
    return Object.entries(pos).sort((a, b) => a[1] - b[1]).map(e => e[0]).join('');
  })();
  let a = 0, b = 0;
  for (const s of samples) {
    const m = clean(s).match(/^(\d{1,2})[-./](\d{1,2})[-./](\d{2,4})/);
    if (!m) continue;
    if (Number(m[1]) > 12) a++;
    if (Number(m[2]) > 12) b++;
  }
  if (a && !b) return 'dmy';
  if (b && !a) return 'mdy';
  if (hintOrder && first >= 0) return hintOrder;
  return 'dmy';
}

export function parseDate(s, order = 'dmy') {
  const t = clean(s);
  let y, m, d, mm;
  if ((mm = t.match(/^(\d{4})[-./](\d{1,2})[-./](\d{1,2})/))) { y = +mm[1]; m = +mm[2]; d = +mm[3]; }
  else if ((mm = t.match(/^(\d{1,2})[-./](\d{1,2})[-./](\d{2,4})/))) {
    const a = +mm[1], b = +mm[2]; y = +mm[3];
    if (y < 100) y += 2000;
    if (order === 'mdy') { m = a; d = b; } else { d = a; m = b; }
  } else return NaN;
  if (y < 1950 || y > 2100 || m < 1 || m > 12 || d < 1 || d > 31) return NaN;
  const day = dayNumber(y, m, d);
  const back = dayParts(day);
  return back.m === m && back.d === d ? day : NaN;
}

/* ---------- zips ---------- */
// The CSV files in a zip: the one Backup All makes (a CSV per vehicle, and pictures.data, a zip of the photos that is never
// opened), the per-vehicle zips of the Google Drive backup (vehicle-1-sync.csv.zip), or a folder a cloud drive packed into
// one zip with those zips inside, read one level down. unzipSync is fflate's, passed in so this file never loads it.
export const isZip = b => b.length > 4 && b[0] === 0x50 && b[1] === 0x4b && b[2] === 3 && b[3] === 4;
const HIDDEN = /(^|\/)(__MACOSX|\.)/;
export function csvsInZip(bytes, unzipSync, depth = 0) {
  const inner = n => depth === 0 && /\.(zip|fuelio)$/i.test(n);
  const got = unzipSync(bytes, { filter: e => !HIDDEN.test(e.name) && e.originalSize < MAX_BYTES && (/\.(csv|txt)$/i.test(e.name) || inner(e.name)) });
  const out = [];
  for (const n of Object.keys(got).sort()) {
    if (inner(n)) {
      // a broken or empty zip inside is left out; the others still open
      if (isZip(got[n])) { try { out.push(...csvsInZip(got[n], unzipSync, depth + 1)); } catch (e) { /* skipped */ } }
      continue;
    }
    out.push({ name: n.split('/').pop() || n, bytes: got[n] });
  }
  return out;
}

/* ---------- units ---------- */
// The vehicle row's numbers: DistUnit 0 km, 1 miles; FuelUnit 0 litres, 1 US gallons, 2 UK gallons; ConsumptionUnit 0 l/100 km,
// 1 mpg US, 2 mpg UK, 3 km/l, 4 km/gal US, 5 km/gal UK (FuelioImport's Vehicle class). The app also logs electric, LPG and CNG
// vehicles (its store page), and the numbers of their units are not written down anywhere public: a fuel unit that is not
// 0, 1 or 2 is OWN, read as it is in the file (never turned into litres) and named by the "Fuel (...)" column, with
// consumption shown as that unit per 100 km or 100 miles (OWN_KM, OWN_MI).
export const L_PER_GAL = { 0: 1, 1: 3.785411784, 2: 4.54609 };
export const KM_PER_MI = 1.609344;
export const OWN = -1, OWN_KM = -1, OWN_MI = -2;
const LIQUID = u => u === 0 || u === 1 || u === 2;
// the unit a column header names ("Odo (mi)", "Fuel (us gallons)"), or null
function headerUnit(h, kind) {
  const t = clean(h).toLowerCase();
  if (kind === 'dist') return /\(\s*(mi|miles?)\s*\)/.test(t) ? 1 : /\(\s*km\s*\)/.test(t) ? 0 : null;
  if (/\(\s*us\s*gal/.test(t)) return 1;
  if (/\(\s*(uk|imp\w*)\s*gal/.test(t)) return 2;
  if (/\(\s*(l|lit\w*)\s*\)/.test(t)) return 0;
  return null;
}
// the words in a header's brackets ("Fuel (kWh)" -> "kWh"), when they name a unit that is not litres or gallons
function headerLabel(h) {
  const m = clean(h).match(/\(\s*([^()]{1,12}?)\s*\)/);
  if (!m || /gal|^l(it|tr|\.|$)|optional/i.test(m[1])) return '';
  return m[1];
}
const toKm = (v, unit) => (unit === 1 ? v * KM_PER_MI : v);
const toLitres = (v, unit) => v * (L_PER_GAL[unit] || 1);

/* ---------- one file -> one vehicle ---------- */
const TEMPLATE_WORDS = /^(1|true|yes)$/i;
// sections the app writes that hold no fill-ups or costs (favourite stations, trip categories, photo list): left out quietly
const QUIET_SECTIONS = ['favstations', 'category', 'pictures'];

export function readVehicleFile(text, fileName = '') {
  const delim = sniffDelimiter(text);
  const secs = sections(parseCsv(text, delim));
  const find = n => secs.find(s => s.name === n);
  const vSec = find('vehicle'), lSec = find('log'), cSec = find('costs'), catSec = find('costcategories');
  if (!vSec && !lSec && !cSec) throw new LogError('format');
  const notes = { skippedLog: 0, skippedCosts: 0, templates: 0, backwards: 0, altTank: 0, unknownSections: secs.filter(s => !['vehicle', 'log', 'costs', 'costcategories', ...QUIET_SECTIONS].includes(s.name)).map(s => s.name).filter(Boolean) };

  // the vehicle row
  const vIdx = vSec && vSec.header ? columns(vSec.header) : {};
  const vRow = (vSec && vSec.rows[0]) || [];
  const vget = (names) => clean(cellAt(vRow, pick(vIdx, names)));
  const intOr = (s, d) => { const v = num(s); return Number.isFinite(v) ? Math.round(v) : d; };
  const code = names => intOr(vget(names), null);
  const lh = lSec && lSec.header ? lSec.header : [];
  const lIdx = columns(lh);
  const odoHeader = lh[pick(lIdx, ['odo', 'odometer', 'mileage'])] || '';
  const fuelHeader = lh[pick(lIdx, ['fuel', 'litres', 'liters', 'volume'])] || '';
  // Units: the vehicle row first, as the app reads it on import. The app's own export names the same units in the Log
  // headers ("Odo (mi)"), but the open-source converter writes "Odo(km)" and "Fuel(litres)" whatever the unit, so a header
  // that names litres, gallons, km or miles only decides when the vehicle row does not say. A header that names another
  // unit ("Fuel (kWh)") is never the converter's, so that one always wins.
  const dCode = code(['distunit']);
  let distUnit = dCode === 0 || dCode === 1 ? dCode : headerUnit(odoHeader, 'dist');
  if (distUnit == null) distUnit = 0;
  const fCode = code(['fuelunit']);
  const ownLabel = headerLabel(fuelHeader);
  let fuelUnit, volLabel = '';
  if (ownLabel) { fuelUnit = OWN; volLabel = ownLabel; }
  else if (fCode != null) fuelUnit = LIQUID(fCode) ? fCode : OWN;
  else { const h = headerUnit(fuelHeader, 'fuel'); fuelUnit = h != null ? h : 0; }
  const cCode = code(['consumptionunit']);
  let consUnit = cCode != null && cCode >= 0 && cCode <= 5 ? cCode : 0;
  if (fuelUnit === OWN || (cCode != null && (cCode < 0 || cCode > 5))) consUnit = distUnit === 1 ? OWN_MI : OWN_KM;
  const tanks = Math.max(1, intOr(vget(['tankcount']), 1));
  // a second tank in another unit (a plug-in hybrid in kWh, petrol and CNG): its fill-ups count in the money, but their
  // amounts are not added to the first tank's and give no consumption. Two liquid units are both turned into litres.
  const f2 = tanks > 1 ? code(['fuelunittank2']) : null;
  const tank2 = f2 == null || f2 === fCode ? 'same' : LIQUID(f2) && fuelUnit !== OWN ? f2 : 'other';
  const vehicle = {
    name: vget(['name']) || fileName.replace(/\.[^.]+$/, '') || 'Vehicle',
    description: vget(['description']), distUnit, fuelUnit, consUnit, volLabel,
    vin: vget(['vin']), plate: vget(['plate']), make: vget(['make']), model: vget(['model']), year: intOr(vget(['year']), 0) || null,
    tanks,
    dateFormat: vget(['importcsvdateformat']),
    log: [], costs: [], cats: new Map(), file: fileName, notes,
  };

  // cost categories
  if (catSec && catSec.header) {
    const ci = columns(catSec.header);
    const iId = pick(ci, ['costtypeid', 'id']), iName = pick(ci, ['name']), iCol = pick(ci, ['color', 'colour']);
    for (const r of catSec.rows) {
      const id = intOr(cellAt(r, iId), NaN);
      if (!Number.isFinite(id)) continue;
      vehicle.cats.set(id, { id, name: clean(cellAt(r, iName)) || `#${id}`, color: clean(cellAt(r, iCol)) });
    }
  }

  // fill-ups
  if (lSec && lSec.header) {
    const iDate = pick(lIdx, ['data', 'date']), iOdo = pick(lIdx, ['odo', 'odometer', 'mileage']), iFuel = pick(lIdx, ['fuel', 'litres', 'liters', 'volume']);
    const iFull = pick(lIdx, ['full', 'fulltank']), iPrice = pick(lIdx, ['price', 'cost', 'total']), iCons = pick(lIdx, ['consumption']);
    const iCity = pick(lIdx, ['city']), iNotes = pick(lIdx, ['notes', 'note']), iMissed = pick(lIdx, ['missed']), iTank = pick(lIdx, ['tanknumber', 'tank']);
    const iVol = pick(lIdx, ['volumeprice', 'priceperunit']), iExcl = pick(lIdx, ['excludedistance']);
    if (iDate < 0 || (iFuel < 0 && iPrice < 0)) throw new LogError('format');
    const order = dateOrder(lSec.rows.map(r => cellAt(r, iDate)), vehicle.dateFormat);
    lSec.rows.forEach((r, n) => {
      const day = parseDate(cellAt(r, iDate), order);
      let fuel = num(cellAt(r, iFuel));
      let odo = num(cellAt(r, iOdo));
      let price = num(cellAt(r, iPrice));
      const ppu = num(cellAt(r, iVol));
      if (!Number.isFinite(day) || (!(fuel > 0) && !(price > 0))) { vehicle.notes.skippedLog++; return; }
      if (!(fuel > 0)) fuel = NaN;
      if (!Number.isFinite(price) && Number.isFinite(ppu) && fuel > 0) price = ppu * fuel;
      const fullRaw = clean(cellAt(r, iFull));
      const tank = Math.max(1, intOr(cellAt(r, iTank), 1)) || 1;
      const alt = tank === 2 && tank2 === 'other';
      if (alt) vehicle.notes.altTank++;
      vehicle.log.push({
        n, day, odoRaw: Number.isFinite(odo) && odo > 0 ? odo : NaN,
        odo: Number.isFinite(odo) && odo > 0 ? toKm(odo, distUnit) : NaN,
        fuelRaw: fuel, litres: !Number.isFinite(fuel) || alt ? NaN : toLitres(fuel, tank === 2 && typeof tank2 === 'number' ? tank2 : fuelUnit), alt,
        // 1 is a full tank. The app also writes 2, for a part fill-up where the gauge reading after it was entered: it
        // still works out the full-tank figure across it, so 2 counts as part of the next full tank, as 0 does (checked
        // against the figures the app wrote in a real 42-fill-up export: all 33 the same).
        full: iFull < 0 ? true : /^(1|true|yes)$/i.test(fullRaw),
        price: Number.isFinite(price) && price >= 0 ? price : NaN,
        ppu: Number.isFinite(ppu) && ppu > 0 ? ppu : (Number.isFinite(price) && fuel > 0 ? price / fuel : NaN),
        fileCons: num(cellAt(r, iCons)),
        city: clean(cellAt(r, iCity)), notes: clean(cellAt(r, iNotes)),
        missed: Math.max(0, intOr(cellAt(r, iMissed), 0)), tank,
        // the app writes a distance here ("0.0" when there is none); anything above 0 leaves that stretch out of consumption
        exclude: iExcl >= 0 && (TEMPLATE_WORDS.test(clean(cellAt(r, iExcl))) || num(cellAt(r, iExcl)) > 0),
      });
    });
  }

  // other costs
  if (cSec && cSec.header) {
    const ci = columns(cSec.header);
    const iTitle = pick(ci, ['costtitle', 'title']), iDate = pick(ci, ['date', 'data']), iOdo = pick(ci, ['odo', 'odometer']);
    const iType = pick(ci, ['costtypeid', 'typeid']), iNotes = pick(ci, ['notes', 'note']), iCost = pick(ci, ['cost', 'amount', 'price']);
    const iTpl = pick(ci, ['istemplate', 'template']), iInc = pick(ci, ['isincome', 'income']);
    if (iDate < 0 || iCost < 0) throw new LogError('format');
    const order = dateOrder(cSec.rows.map(r => cellAt(r, iDate)), vehicle.dateFormat);
    cSec.rows.forEach((r, n) => {
      if (TEMPLATE_WORDS.test(clean(cellAt(r, iTpl)))) { vehicle.notes.templates++; return; }
      const day = parseDate(cellAt(r, iDate), order);
      const cost = num(cellAt(r, iCost));
      if (!Number.isFinite(day) || !Number.isFinite(cost)) { vehicle.notes.skippedCosts++; return; }
      const odo = num(cellAt(r, iOdo));
      const typeId = intOr(cellAt(r, iType), 0);
      const cat = vehicle.cats.get(typeId);
      const income = TEMPLATE_WORDS.test(clean(cellAt(r, iInc))) || cost < 0;
      vehicle.costs.push({
        n, day, odo: Number.isFinite(odo) && odo > 0 ? toKm(odo, distUnit) : NaN,
        title: clean(cellAt(r, iTitle)), typeId, category: cat ? cat.name : `#${typeId}`,
        notes: clean(cellAt(r, iNotes)), amount: income ? -Math.abs(cost) : cost,
      });
    });
  }
  if (!vehicle.log.length && !vehicle.costs.length) throw new LogError('nodata');
  vehicle.log.sort((a, b) => a.day - b.day || (a.odo || 0) - (b.odo || 0) || a.n - b.n);
  vehicle.costs.sort((a, b) => a.day - b.day || a.n - b.n);
  return vehicle;
}

// a stable short fingerprint of a vehicle's rows, so the same file opened twice is one vehicle
export function fingerprint(v) {
  let h = 2166136261;
  const mix = s => { for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 16777619) >>> 0; } };
  mix(v.name);
  for (const r of v.log) mix(`${r.day}|${r.odoRaw}|${r.fuelRaw}|${r.price}|${r.full}|${r.tank};`);
  for (const c of v.costs) mix(`${c.day}|${c.title}|${c.amount}|${c.typeId};`);
  return h.toString(36);
}
