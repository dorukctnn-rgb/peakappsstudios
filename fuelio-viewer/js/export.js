/* Fillbook Pro: the spreadsheet file. One row per fill-up and per cost in the period, in the units each vehicle is set to,
 * with the same numbers the page and the PDF show. Built in this tab. Dates are written year-month-day so no spreadsheet
 * reads them the wrong way round; "Excel" mode writes semicolons and decimal commas, which is what Excel expects where
 * the decimal separator is a comma. */
import { dayKey } from './parse.js';
import { distDisplay, volDisplay, perUnitPrice } from './stats.js';

export const DIST_LABEL = ['km', 'mi'];
export const VOL_LABEL = ['l', 'gal (US)', 'gal (UK)'];

function textCell(s, delim) {
  let t = String(s == null ? '' : s).replace(/\r?\n/g, ' ');
  if (/^[=+\-@\t]/.test(t)) t = `'${t}`;
  return /["\n\r]/.test(t) || t.includes(delim) ? `"${t.replace(/"/g, '""')}"` : t;
}
function numCell(v, digits, comma) {
  if (!Number.isFinite(v)) return '';
  const t = v.toFixed(digits);
  return comma ? t.replace('.', ',') : t;
}

// headers: { date, vehicle, type, category, description, odometer, volume, pricePerUnit, amount, business, notes, units, fuel, cost }
export function buildCsv({ items, win, includeFuel = true, excludedOf, excel = false, business = null, labels }) {
  const delim = excel ? ';' : ',';
  const comma = excel;
  const head = [labels.date, labels.vehicle, labels.type, labels.category, labels.description, labels.odometer, labels.volume, labels.pricePerUnit, labels.amount];
  if (business != null) head.push(labels.business);
  head.push(labels.notes, labels.units);
  const lines = [head.map(h => textCell(h, delim)).join(delim)];
  let n = 0;
  const rows = [];
  for (const { v, name, dist, vol } of items) {
    const ex = excludedOf(v);
    // the page passes its own words for the units; without them (tests, other callers) the English short forms
    const distText = dist || DIST_LABEL[v.distUnit] || 'km';
    const units = `${distText} / ${vol || (v.fuelUnit === -1 ? v.volLabel || 'units' : VOL_LABEL[v.fuelUnit] || 'l')}`;
    if (includeFuel) {
      for (const r of v.log) {
        if (r.day < win.from || r.day > win.to) continue;
        // a fill-up of a second tank logged in another unit keeps its own amount, named as that tank's unit
        const volume = Number.isFinite(r.litres) ? numCell(volDisplay(r.litres, v.fuelUnit), 2, comma) : r.alt && Number.isFinite(r.fuelRaw) ? numCell(r.fuelRaw, 2, comma) : '';
        rows.push({ day: r.day, sort: r.odo || 0, cells: [dayKey(r.day), name, labels.fuel, labels.fuel, r.city || '', Number.isFinite(r.odoRaw) ? numCell(r.odoRaw, 0, comma) : '', volume, Number.isFinite(r.ppu) ? numCell(r.ppu, 3, comma) : '', Number.isFinite(r.price) ? numCell(r.price, 2, comma) : ''], amount: r.price, notes: r.notes, units: r.alt ? `${distText} / ${labels.tank2 || 'tank 2 unit'}` : units });
      }
    }
    for (const c of v.costs) {
      if (c.day < win.from || c.day > win.to || ex.has(c.typeId)) continue;
      rows.push({ day: c.day, sort: c.odo || 0, cells: [dayKey(c.day), name, labels.cost, c.category, c.title, Number.isFinite(c.odo) ? numCell(distDisplay(c.odo, v.distUnit), 0, comma) : '', '', '', numCell(c.amount, 2, comma)], amount: c.amount, notes: c.notes, units });
    }
  }
  rows.sort((a, b) => a.day - b.day || a.sort - b.sort);
  for (const r of rows) {
    const cells = r.cells.map((c, i) => (i === 0 || i >= 5 ? c : textCell(c, delim)));
    if (business != null) cells.push(Number.isFinite(r.amount) ? numCell((r.amount * business) / 100, 2, comma) : '');
    cells.push(textCell(r.notes, delim), textCell(r.units, delim));
    lines.push(cells.join(delim));
    n++;
  }
  return { text: '﻿' + lines.join('\r\n') + '\r\n', rows: n, total: rows.reduce((a, r) => a + (Number.isFinite(r.amount) ? r.amount : 0), 0) };
}
