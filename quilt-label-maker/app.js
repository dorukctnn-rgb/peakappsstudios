/* Quilt Label Maker: page logic. Everything runs in the browser; nothing is uploaded.
 * pdf-lib (./vendor) loads on the first PDF export. */
import { LAYOUTS, LAYOUT_IDS, LETTERING, FACES, INKS, layoutLabel, toSvg, thumbSvg, clearMeasureCache } from './label.js';
import { planSheets, SHEETS, toPt, fromPt, fmtSize, PT_PER_IN, PT_PER_CM } from './pack.js';
import { rowsToLabels, checkQov } from './batch.js';
import { buildSinglePdf, buildSheetPdf, buildPng, ensureFonts } from './export.js';

/* ---- Gumroad Pro product. The owner pastes the product id here once the product exists
 *      (Gumroad requires product_id for products created after 2023; until then the permalink is used). */
const QUILT_PRO_PRODUCT_ID = 'Wl19CINWdJa42OOguS5fxw==';
const QUILT_PRO_PERMALINK = 'quilt-label-pro';
const QUILT_PRO_BUY_URL = 'https://dorukctn.gumroad.com/l/quilt-label-pro';
/* The Quilt of Valor wording stays free on purpose: the QOVF manual (section 2.3 C) does not allow the
 * Quilts of Valor name on items listed for sale online without written permission, and its users are volunteers.
 * Set to true to put it behind Pro. */
const QOV_PRESET_PRO = false;

const $ = id => document.getElementById(id);
const toast = msg => (window.PeakUI ? window.PeakUI.toast(msg) : console.log(msg));
const isPro = () => !!(window.PeakLicense && window.PeakLicense.isPro());
const usLike = /^(en-US|en-CA|es-US|fr-CA|es-MX|en-PH)/i.test(navigator.language || '');

const DESIGNS = {
  quilt: { layout: 'stitched', lettering: 'script', borderInk: 'red', textInk: 'charcoal' },
  qov: { layout: 'stars', lettering: 'heirloom', borderInk: 'red', textInk: 'navy' },
};
const SAMPLE = { title: 'Evening Star', forLead: 'Made for', for: 'Nora Bennett', byLead: 'Made by', by: 'her grandmother, Ruth Ellis', date: 'May 2026', place: 'Ames, Iowa', message: 'For naps, forts and cold mornings.', care: '' };
/* One-click examples. Made-up quilts, written to show what each quilt-block border looks like on a real label. */
const EXAMPLES = [
  { name: 'Baby quilt', size: [5, 3],
    fields: { title: 'Evening Star', forLead: 'Made for', for: 'Nora Bennett', byLead: 'Made by', by: 'her grandmother, Ruth Ellis', date: 'May 2026', place: 'Ames, Iowa', message: 'For naps, forts and cold mornings.', care: 'Wash cold, tumble dry low.' },
    design: { layout: 'sawtooth', lettering: 'script', borderInk: 'red', textInk: 'charcoal' } },
  { name: 'Wedding gift', size: [6, 4],
    fields: { title: 'Double Wedding Ring', forLead: 'For', for: 'Amara and Theo', byLead: 'Pieced and quilted by', by: 'the Cedar Street Quilters', date: '14 June 2026', place: 'Portland, Oregon', message: 'Pieced from forty scraps, one from every guest.', care: '' },
    design: { layout: 'stars', lettering: 'heirloom', borderInk: 'navy', textInk: 'charcoal' } },
  { name: 'Memory quilt', size: [6, 4],
    fields: { title: 'Shirts and Sundays', forLead: 'For', for: 'the Okonkwo family', byLead: 'Made by', by: 'Ada Okonkwo', date: 'October 2026', place: 'Leeds', message: 'Cut from my father’s work shirts. He wore every one of them.', care: 'Hand wash. Dry flat, out of the sun.' },
    design: { layout: 'geese', lettering: 'typewriter', borderInk: 'walnut', textInk: 'charcoal' } },
  { name: 'Charity quilt', size: [4, 3],
    fields: { title: '', forLead: 'Made for', for: 'a neighbour we have not met', byLead: 'Made by', by: 'Harbour Lane Guild', date: '2026', place: 'Hull', message: '', care: 'Wash warm. Dry flat.' },
    design: { layout: 'cornerstones', lettering: 'modern', borderInk: 'forest', textInk: 'charcoal' } },
];
const EMPTY_QOV = { awardee: '', piecer: '', piecerState: '', quilter: '', quilterState: '', binder: '', binderState: '', date: '', place: '', message: '', care: '', donor: '', mark: true };
const QOVF_CARE = 'Wash in cold water with a mild detergent and a color catcher the first time. Tumble dry low.';

const PRESETS = {
  in: [[4, 3], [5, 3], [5, 4], [6, 4], [7, 5], [8, 6], [6, 6]],
  cm: [[10, 7], [12, 8], [15, 10], [18, 13], [20, 15], [15, 15]],
};
const ALLOWANCES = {
  in: [[0, 'None (fusible, or edges in the binding)'], [0.25, '1/4 in'], [0.375, '3/8 in'], [0.5, '1/2 in']],
  cm: [[0, 'None (fusible, or edges in the binding)'], [0.6, '6 mm'], [0.75, '7.5 mm'], [1, '1 cm']],
};
const MARGINS = { in: [[0.125, '1/8 in'], [0.25, '1/4 in'], [0.375, '3/8 in'], [0.5, '1/2 in']], cm: [[0.3, '3 mm'], [0.6, '6 mm'], [1, '1 cm'], [1.3, '13 mm']] };
const GAPS = { in: [[0, 'None, shared cut lines'], [0.125, '1/8 in'], [0.25, '1/4 in']], cm: [[0, 'None, shared cut lines'], [0.3, '3 mm'], [0.6, '6 mm']] };
const LIMITS = { min: 1.5 * 72, max: 10 * 72 };

/* ------------------------------------------------------------------ state */
const store = {
  get(k, d) { try { const v = localStorage.getItem('ql:' + k); return v == null ? d : JSON.parse(v); } catch (e) { return d; } },
  set(k, v) { try { localStorage.setItem('ql:' + k, JSON.stringify(v)); } catch (e) { /* private mode */ } },
};
function defaults() {
  const metric = !usLike;
  return {
    v: 1, kind: 'quilt', fields: { ...SAMPLE }, qov: { ...EMPTY_QOV }, designs: JSON.parse(JSON.stringify(DESIGNS)),
    unit: metric ? 'cm' : 'in', w: metric ? toPt(15, 'cm') : 6 * 72, h: metric ? toPt(10, 'cm') : 4 * 72, allowance: metric ? toPt(0.6, 'cm') : 18,
    mode: 'single', page: metric ? 'a4' : 'letter', square: true, sheet: metric ? 'a4' : 'letter', margin: metric ? toPt(0.6, 'cm') : 18, gap: 0, mirror: false, list: '',
  };
}
function loadState() {
  const d = defaults();
  const saved = store.get('state:v1', null);
  const s = saved && saved.v === 1 ? { ...d, ...saved, fields: { ...d.fields, ...saved.fields }, qov: { ...d.qov, ...saved.qov }, designs: { quilt: { ...d.designs.quilt, ...(saved.designs || {}).quilt }, qov: { ...d.designs.qov, ...(saved.designs || {}).qov } } } : d;
  // Links from the guides prefill the wording: ?preset=qov, or ?title=…&for=…&by=…
  const q = new URLSearchParams(location.search);
  if (q.get('preset') === 'qov') s.kind = 'qov';
  const keys = ['title', 'forLead', 'for', 'byLead', 'by', 'date', 'place', 'message', 'care'];
  if (keys.some(k => q.has(k))) {
    s.kind = 'quilt';
    s.fields = { title: '', forLead: 'Made for', for: '', byLead: 'Made by', by: '', date: '', place: '', message: '', care: '' };
    for (const k of keys) if (q.has(k)) s.fields[k] = q.get(k).slice(0, 400);
  }
  if (q.get('layout') && LAYOUTS[q.get('layout')]) s.designs[s.kind].layout = q.get('layout');
  if (q.get('lettering') && LETTERING[q.get('lettering')]) s.designs[s.kind].lettering = q.get('lettering');
  if (q.get('ink') && INKS.some(i => i.id === q.get('ink'))) s.designs[s.kind].borderInk = q.get('ink');
  s.w = clampLen(s.w); s.h = clampLen(s.h);
  if (!['single', 'sheet', 'batch'].includes(s.mode)) s.mode = 'single';
  return s;
}
const clampLen = v => Math.min(LIMITS.max, Math.max(LIMITS.min, Number(v) || 4 * 72));
const S = loadState();
let saveT = 0;
function persist() { clearTimeout(saveT); saveT = setTimeout(() => store.set('state:v1', S), 350); }
const design = () => S.designs[S.kind];

const ui = {
  view: $('view'), svg: $('preview'), readout: $('readout'), warn: $('warn'), pager: $('pager'), prev: $('prev'), next: $('next'), pageLabel: $('pageLabel'),
  summary: $('summary'), pdf: $('downloadPdf'), png: $('downloadPng'), busy: $('busy'), busyBar: $('busyBar'),
  quiltFields: $('quiltFields'), qovFields: $('qovFields'), qovCheck: $('qovCheck'),
  layouts: $('layouts'), lettering: $('lettering'), borderInk: $('borderInk'), textInk: $('textInk'),
  w: $('w'), h: $('h'), presets: $('presets'), allowance: $('allowance'), swap: $('swap'),
  page: $('page'), square: $('square'), sheet: $('sheet'), margin: $('margin'), gap: $('gap'), list: $('list'), csv: $('csv'), listInfo: $('listInfo'), mirror: $('mirror'),
  saveName: $('saveName'), saveDesign: $('saveDesign'), savedList: $('savedList'),
};
const view = { mode: 'label', zoom: 'fit', index: 0, sheetPage: 0 };

/* ------------------------------------------------------------------ specs */
function baseSpec() {
  const d = design();
  return { w: S.w, h: S.h, layout: d.layout, lettering: d.lettering, borderInk: d.borderInk, textInk: d.textInk, kind: S.kind, fields: { ...S.fields }, qov: { ...S.qov } };
}
let batchCache = { key: '', res: null };
function batch() {
  if (S.mode !== 'batch' || !S.list.trim()) return null;
  const template = S.kind === 'qov' ? S.qov : S.fields;
  const key = S.kind + '|' + S.list + '|' + JSON.stringify(template);
  if (batchCache.key !== key) batchCache = { key, res: rowsToLabels(S.list, S.kind, template) };
  return batchCache.res;
}
function specAt(i) {
  const b = batch(), s = baseSpec();
  if (!b || !b.labels.length) return s;
  const f = b.labels[Math.min(i, b.labels.length - 1)];
  if (S.kind === 'qov') s.qov = { ...S.qov, ...f }; else s.fields = { ...S.fields, ...f };
  return s;
}
function allSpecs() {
  const b = batch();
  if (!b || !b.labels.length) return [baseSpec()];
  return b.labels.map((_, i) => specAt(i));
}
function sheetPlan(labels) {
  return planSheets({ sheet: S.sheet, margin: S.margin, labelW: S.w, labelH: S.h, allowance: S.allowance, gap: S.gap, labels });
}

/* ------------------------------------------------------------------ preview */
const NS = 'http://www.w3.org/2000/svg';
const f2 = n => (Math.round(n * 100) / 100).toString();
function matGrid(x0, y0, vw, vh, px) {
  // Cutting-mat grid in the label's own units, with 0 at the finished label's top-left corner.
  const step = S.unit === 'cm' ? PT_PER_CM : PT_PER_IN;
  const minor = S.unit === 'cm' ? 0 : PT_PER_IN / 2;
  let lines = '', minorLines = '', nums = '';
  const every = Math.max(1, Math.ceil(26 / (step * px)));
  const fs = 10.5 / px;
  for (let i = Math.ceil(x0 / step); i * step <= x0 + vw; i++) {
    const x = i * step; lines += `M${f2(x)} ${f2(y0)}V${f2(y0 + vh)}`;
    if (i > 0 && i % every === 0) nums += `<text x="${f2(x + 4 / px)}" y="${f2(y0 + 14 / px)}" font-size="${f2(fs)}">${i}</text>`;
  }
  for (let j = Math.ceil(y0 / step); j * step <= y0 + vh; j++) {
    const y = j * step; lines += `M${f2(x0)} ${f2(y)}H${f2(x0 + vw)}`;
    if (j > 0 && j % every === 0) nums += `<text x="${f2(x0 + 5 / px)}" y="${f2(y - 4 / px)}" font-size="${f2(fs)}">${j}</text>`;
  }
  if (minor && minor * px >= 9) {
    for (let i = Math.ceil(x0 / minor); i * minor <= x0 + vw; i++) if (i % 2) minorLines += `M${f2(i * minor)} ${f2(y0)}V${f2(y0 + vh)}`;
    for (let j = Math.ceil(y0 / minor); j * minor <= y0 + vh; j++) if (j % 2) minorLines += `M${f2(x0)} ${f2(j * minor)}H${f2(x0 + vw)}`;
  }
  return `<rect x="${f2(x0)}" y="${f2(y0)}" width="${f2(vw)}" height="${f2(vh)}" fill="var(--mat)"/>`
    + (minorLines ? `<path d="${minorLines}" stroke="rgba(240,236,226,.07)" stroke-width="${f2(1 / px)}" fill="none"/>` : '')
    + `<path d="${lines}" stroke="var(--mat-line)" stroke-width="${f2(1 / px)}" fill="none"/>`
    + `<g fill="rgba(240,236,226,.55)" font-family="Geist Mono, ui-monospace, monospace">${nums}</g>`;
}
function shadowDef(px) {
  return `<defs><filter id="qlShadow" x="-20%" y="-20%" width="140%" height="150%"><feDropShadow dx="0" dy="${f2(3 / px)}" stdDeviation="${f2(7 / px)}" flood-color="#0b0f0d" flood-opacity=".42"/></filter></defs>`;
}
function pieceSvg(res, a, px, { fold = true } = {}) {
  const W = S.w, H = S.h, pw = W + 2 * a, ph = H + 2 * a;
  let s = `<rect x="${f2(-a)}" y="${f2(-a)}" width="${f2(pw)}" height="${f2(ph)}" fill="#fffefb"/>`;
  if (a > 0 && fold) {
    s += `<path d="M${f2(-a)} ${f2(-a)}h${f2(pw)}v${f2(ph)}h${f2(-pw)}Z M0 0v${f2(H)}h${f2(W)}v${f2(-H)}Z" fill="rgba(70,60,45,.06)" fill-rule="evenodd"/>`;
    s += `<rect x="0" y="0" width="${f2(W)}" height="${f2(H)}" fill="none" stroke="rgba(60,55,45,.32)" stroke-width="${f2(0.8 / px)}" stroke-dasharray="${f2(4 / px)} ${f2(3 / px)}"/>`;
  }
  return s + toSvg(res);
}
function viewSize() { const r = ui.view.getBoundingClientRect(); return { cw: Math.max(200, r.width), ch: Math.max(160, r.height) }; }

function render() {
  if (view.mode === 'sheet') renderSheet(); else renderLabel();
  renderSummary();
  renderQovCheck();
}
function renderLabel() {
  const b = batch();
  const n = b && b.labels.length ? b.labels.length : 0;
  view.index = Math.min(view.index, Math.max(0, n - 1));
  const spec = specAt(view.index);
  const res = layoutLabel(spec);
  const a = S.allowance, pw = S.w + 2 * a, ph = S.h + 2 * a;
  const { cw, ch } = viewSize();
  const pad = cw < 500 ? 22 : 44;
  let px = view.zoom === 'actual' ? 96 / 72 : Math.min((cw - 2 * pad) / pw, (ch - 2 * pad) / ph, 3.2);
  const svgW = Math.max(cw, pw * px + 2 * pad), svgH = Math.max(ch, ph * px + 2 * pad);
  const vw = svgW / px, vh = svgH / px, x0 = S.w / 2 - vw / 2, y0 = S.h / 2 - vh / 2;
  ui.view.classList.toggle('is-actual', view.zoom === 'actual' && (svgW > cw + 1 || svgH > ch + 1));
  ui.svg.setAttribute('viewBox', `${f2(x0)} ${f2(y0)} ${f2(vw)} ${f2(vh)}`);
  if (ui.view.classList.contains('is-actual')) { ui.svg.setAttribute('width', Math.round(svgW)); ui.svg.setAttribute('height', Math.round(svgH)); }
  else { ui.svg.removeAttribute('width'); ui.svg.removeAttribute('height'); }
  ui.svg.setAttribute('preserveAspectRatio', 'xMidYMid meet');
  ui.svg.innerHTML = `<title id="previewTitle">${escapeHtml(labelSummary(spec))}</title>` + shadowDef(px) + matGrid(x0, y0, vw, vh, px)
    + `<g filter="url(#qlShadow)">${pieceSvg(res, a, px)}</g>`;
  ui.readout.innerHTML = escapeHtml(fmtSize(S.w, S.h, S.unit)) + (a > 0 ? `<span class="ql-cut">, cut ${escapeHtml(fmtSize(pw, ph, S.unit))}</span>` : '');
  const warns = [...res.warnings];
  if (n > 1) { ui.pager.hidden = false; ui.pageLabel.textContent = `Label ${view.index + 1} of ${n}`; ui.prev.disabled = view.index === 0; ui.next.disabled = view.index >= n - 1; }
  else ui.pager.hidden = true;
  if (S.mode === 'single') {
    const P = SHEETS[S.page];
    if (pw > P.w - 36 || ph > P.h - 36) warns.push(`This label is too big for ${P.name}. Make it smaller or print it on a wider sheet with Pro.`);
  }
  ui.warn.textContent = warns.join(' ');
}
function renderSheet() {
  const a = S.allowance, pw = S.w + 2 * a, ph = S.h + 2 * a;
  const { cw, ch } = viewSize();
  const single = S.mode === 'single';
  const Sh = SHEETS[single ? S.page : S.sheet];
  const pad = cw < 500 ? 16 : 30;
  const px = Math.min((cw - 2 * pad) / Sh.w, (ch - 2 * pad) / Sh.h);
  const vw = cw / px, vh = ch / px, x0 = Sh.w / 2 - vw / 2, y0 = Sh.h / 2 - vh / 2;
  ui.view.classList.remove('is-actual'); ui.svg.removeAttribute('width'); ui.svg.removeAttribute('height');
  ui.svg.setAttribute('viewBox', `${f2(x0)} ${f2(y0)} ${f2(vw)} ${f2(vh)}`);
  let body = '';
  const grey = `stroke="#9a9a9a" stroke-width="${f2(0.9 / px)}" fill="none"`;
  let pages = 1, perSheet = 1;
  if (single) {
    const res = layoutLabel(specAt(view.index));
    const x = (Sh.w - pw) / 2, top = ph + 72 + 110 <= Sh.h ? 72 : (Sh.h - ph) / 2;
    body += `<g transform="translate(${f2(x + a)} ${f2(top + a)})">${pieceSvg(res, a, px, { fold: false })}</g><rect x="${f2(x)}" y="${f2(top)}" width="${f2(pw)}" height="${f2(ph)}" ${grey}/>`;
    const ty = top + ph + 22;
    if (Sh.h - ty > 60) {
      body += `<rect x="${f2(x)}" y="${f2(ty - 6)}" width="${f2(Math.min(pw, 330))}" height="4" rx="2" fill="#d8d4cc"/><rect x="${f2(x)}" y="${f2(ty + 5)}" width="${f2(Math.min(pw, 290))}" height="4" rx="2" fill="#d8d4cc"/>`;
      const sq = S.unit === 'cm' ? PT_PER_CM * 2 : 72;
      if (S.square) body += `<rect x="${f2(x)}" y="${f2(ty + 22)}" width="${f2(sq)}" height="${f2(sq)}" stroke="#777" stroke-width="${f2(0.8 / px)}" fill="none"/>`;
    }
  } else {
    const specs = S.mode === 'batch' && batch() && batch().labels.length ? allSpecs() : null;
    const plan = sheetPlan(specs ? specs.length : 0);
    perSheet = plan.count;
    if (!plan.count) {
      body += `<text x="${f2(Sh.w / 2)}" y="${f2(Sh.h / 2)}" text-anchor="middle" font-size="${f2(14 / px)}" fill="#8a857c" font-family="Geist, sans-serif">Too big for this sheet</text>`;
    } else {
      pages = specs ? plan.pages : 1;
      view.sheetPage = Math.min(view.sheetPage, pages - 1);
      const list = specs ? specs.slice(view.sheetPage * plan.count, (view.sheetPage + 1) * plan.count) : Array(plan.count).fill(null);
      let defs = '';
      if (!specs) defs = `<symbol id="qlOne" overflow="visible">${pieceSvg(layoutLabel(baseSpec()), a, px, { fold: false })}</symbol>`;
      body += `<rect x="${f2(S.margin)}" y="${f2(S.margin)}" width="${f2(Sh.w - 2 * S.margin)}" height="${f2(Sh.h - 2 * S.margin)}" fill="none" stroke="#cfc9bf" stroke-width="${f2(0.8 / px)}" stroke-dasharray="${f2(3 / px)} ${f2(3 / px)}"/>`;
      list.forEach((sp, i) => {
        const c = plan.cells[i];
        const tf = c.rot ? `translate(${f2(c.x)} ${f2(c.y + pw)}) rotate(-90) translate(${f2(a)} ${f2(a)})` : `translate(${f2(c.x + a)} ${f2(c.y + a)})`;
        body += sp ? `<g transform="${tf}">${pieceSvg(layoutLabel(sp), a, px, { fold: false })}</g>` : `<use href="#qlOne" transform="${tf}"/>`;
      });
      list.forEach((_, i) => { const c = plan.cells[i]; body += `<rect x="${f2(c.x)}" y="${f2(c.y)}" width="${f2(c.w)}" height="${f2(c.h)}" ${grey}/>`; });
      body = defs + body;
    }
  }
  ui.svg.innerHTML = `<title id="previewTitle">${escapeHtml(`${Sh.name} sheet preview`)}</title>` + shadowDef(px) + matGrid(x0, y0, vw, vh, px)
    + `<g filter="url(#qlShadow)"><rect x="0" y="0" width="${f2(Sh.w)}" height="${f2(Sh.h)}" fill="#fdfcf9"/></g>` + body;
  ui.readout.textContent = `${Sh.name}, ${Sh.size}`;
  if (pages > 1) { ui.pager.hidden = false; ui.pageLabel.textContent = `Sheet ${view.sheetPage + 1} of ${pages}`; ui.prev.disabled = view.sheetPage === 0; ui.next.disabled = view.sheetPage >= pages - 1; }
  else ui.pager.hidden = true;
  const res = layoutLabel(specAt(0));
  ui.warn.textContent = res.warnings.join(' ') || (!single && !perSheet ? 'The label is bigger than this sheet’s printable area.' : '');
}
function labelSummary(spec) {
  const f = spec.kind === 'qov' ? ['Quilt of Valor', spec.qov.awardee] : [spec.fields.title, spec.fields.for, spec.fields.by];
  return `Label preview, ${fmtSize(S.w, S.h, S.unit)}: ` + f.filter(Boolean).join(', ');
}
const escapeHtml = s => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

function renderSummary() {
  const size = fmtSize(S.w, S.h, S.unit);
  const pro = isPro();
  let html = '';
  ui.pdf.innerHTML = 'Download PDF';
  if (S.mode === 'single') {
    const Sh = SHEETS[S.page];
    const fit = sheetPlan(1);
    html = `One <b>${size}</b> label on ${Sh.name}.` + (fit.count > 1 ? ` ${fit.count} fit on a ${SHEETS[S.sheet].size} fabric sheet with Pro.` : '');
  } else {
    const b = batch();
    const count = S.mode === 'batch' ? (b ? b.labels.length : 0) : null;
    const plan = sheetPlan(count || 0);
    const Sh = SHEETS[S.sheet];
    if (!plan.count) html = `A ${size} label doesn’t fit on a ${Sh.size} sheet with this margin.`;
    else if (S.mode === 'sheet') html = `<b>${plan.count} label${plan.count > 1 ? 's' : ''}</b> of ${size} on one ${Sh.size} sheet` + (plan.rotated ? `, ${plan.rotated} turned sideways.` : '.');
    else if (!count) html = 'Paste names or spreadsheet rows to make one label each.';
    else html = `<b>${count} label${count > 1 ? 's' : ''}</b> on <b>${plan.pages} sheet${plan.pages > 1 ? 's' : ''}</b> of ${Sh.size}, ${plan.count} per sheet.`;
    if (!pro) ui.pdf.innerHTML = 'Download PDF <b class="pro-tag">Pro</b>';
  }
  ui.summary.innerHTML = html;
}

/* ------------------------------------------------------------------ Quilt of Valor check */
const ICON_OK = '<svg viewBox="0 0 16 16" aria-hidden="true"><circle cx="8" cy="8" r="7" fill="var(--ok)"/><path d="m4.8 8.2 2.1 2.1 4.3-4.6" fill="none" stroke="#fff" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"/></svg>';
const ICON_TODO = '<svg viewBox="0 0 16 16" aria-hidden="true"><circle cx="8" cy="8" r="6.2" fill="none" stroke="var(--warn)" stroke-width="1.5"/></svg>';
function renderQovCheck() {
  if (S.kind !== 'qov') return;
  const b = batch();
  const target = b && b.labels.length ? { ...S.qov, ...b.labels[Math.min(view.index, b.labels.length - 1)] } : S.qov;
  const r = checkQov(target);
  ui.qovCheck.innerHTML = `<p class="group-title">${r.ok ? 'This label has what QOVF requires' : 'QOVF requires'}</p><ul>`
    + r.items.map(i => `<li class="${i.ok ? 'ok' : 'todo'}">${i.ok ? ICON_OK : ICON_TODO}<span>${escapeHtml(i.label)}${i.ok ? '' : '<span class="sr-only"> (missing)</span>'}</span></li>`).join('')
    + '</ul>' + r.notes.map(n => `<p class="${n.level === 'warn' ? 'warn' : ''}">${escapeHtml(n.text)}</p>`).join('');
}

/* ------------------------------------------------------------------ controls */
let raf = 0;
function update() { cancelAnimationFrame(raf); raf = requestAnimationFrame(render); persist(); }

function syncInputs() {
  document.querySelectorAll('[data-f]').forEach(el => { el.value = S.fields[el.dataset.f] ?? ''; });
  document.querySelectorAll('[data-q]').forEach(el => { if (el.type === 'checkbox') el.checked = S.qov[el.dataset.q] !== false; else el.value = S.qov[el.dataset.q] ?? ''; });
  ui.quiltFields.hidden = S.kind !== 'quilt';
  ui.qovFields.hidden = S.kind !== 'qov';
  setPressed($('kindSeg'), S.kind);
  syncDesign(); syncSize(); syncPrint();
}
function setPressed(root, value) { root.querySelectorAll('button[data-value]').forEach(b => b.setAttribute('aria-pressed', String(b.dataset.value === value))); }

document.querySelectorAll('[data-f]').forEach(el => el.addEventListener('input', () => { S.fields[el.dataset.f] = el.value; update(); }));
document.querySelectorAll('[data-q]').forEach(el => el.addEventListener(el.type === 'checkbox' ? 'change' : 'input', () => { S.qov[el.dataset.q] = el.type === 'checkbox' ? el.checked : el.value; update(); }));
$('qovCare').addEventListener('click', () => { S.qov.care = QOVF_CARE; $('q-care').value = QOVF_CARE; update(); });

/* Examples: a finished label, border and all, in one click. */
$('examples').innerHTML = EXAMPLES.map((ex, i) => `<button type="button" class="ql-chip" data-ex="${i}">${escapeHtml(ex.name)}</button>`).join('');
$('examples').addEventListener('click', e => {
  const b = e.target.closest('[data-ex]'); if (!b) return;
  const ex = EXAMPLES[+b.dataset.ex];
  S.kind = 'quilt';
  S.fields = { ...ex.fields };
  S.designs.quilt = { ...ex.design };
  if (S.unit === 'in') { S.w = ex.size[0] * 72; S.h = ex.size[1] * 72; }
  else { S.w = toPt(Math.round(ex.size[0] * 2.54 * 2) / 2, 'cm'); S.h = toPt(Math.round(ex.size[1] * 2.54 * 2) / 2, 'cm'); }
  batchCache.key = '';
  $('examples').querySelectorAll('[data-ex]').forEach(x => x.setAttribute('aria-pressed', String(x === b)));
  syncInputs();
  ensureFonts([ex.design.lettering]).then(() => { clearMeasureCache(); update(); }).catch(() => {});
  update();
  toast(`Example loaded: ${ex.name}, ${LAYOUTS[ex.design.layout].name} border.`);
});

$('kindSeg').addEventListener('click', e => {
  const b = e.target.closest('button[data-value]'); if (!b || b.dataset.value === S.kind) return;
  if (b.dataset.value === 'qov' && QOV_PRESET_PRO && !isPro()) { window.PeakLicense && window.PeakLicense.requirePro('The Quilt of Valor wording and check are part of Pro.'); return; }
  S.kind = b.dataset.value; batchCache.key = '';
  syncInputs(); update();
});

/* Radio-style button groups with arrow keys and a roving tab stop. */
function radioGroup(root, items, current, onPick) {
  root.innerHTML = '';
  items.forEach(it => {
    const b = document.createElement('button');
    b.type = 'button'; b.setAttribute('role', 'radio'); b.dataset.value = it.value; b.className = it.className;
    if (it.label) b.setAttribute('aria-label', it.label);
    if (it.style) b.setAttribute('style', it.style);
    b.innerHTML = it.html || '';
    root.appendChild(b);
  });
  const mark = v => root.querySelectorAll('[role=radio]').forEach(b => { const on = b.dataset.value === v; b.setAttribute('aria-checked', String(on)); b.tabIndex = on ? 0 : -1; });
  mark(current);
  root.onclick = e => { const b = e.target.closest('[role=radio]'); if (!b) return; mark(b.dataset.value); onPick(b.dataset.value); };
  root.onkeydown = e => {
    if (!['ArrowRight', 'ArrowDown', 'ArrowLeft', 'ArrowUp'].includes(e.key)) return;
    const all = [...root.querySelectorAll('[role=radio]')], i = all.indexOf(document.activeElement);
    if (i < 0) return;
    e.preventDefault();
    const n = all[(i + (e.key === 'ArrowRight' || e.key === 'ArrowDown' ? 1 : all.length - 1)) % all.length];
    n.focus(); mark(n.dataset.value); onPick(n.dataset.value);
  };
  return mark;
}
function syncDesign() {
  const d = design();
  radioGroup(ui.layouts, LAYOUT_IDS.map(id => ({ value: id, className: 'ql-layout', html: thumbSvg(id, d.borderInk) + `<span>${LAYOUTS[id].name}</span>` })), d.layout, v => { design().layout = v; update(); });
  const sample = S.kind === 'qov' ? 'Quilt of Valor' : (S.fields.title || 'Evening Star').slice(0, 22);
  radioGroup(ui.lettering, Object.entries(LETTERING).map(([id, L]) => {
    const fc = FACES[L.title];
    return { value: id, className: 'ql-letter', html: `<span class="sample" style="font-family:'${fc.family}';font-weight:${fc.weight};font-style:${fc.style};font-size:${Math.round(20 * fc.k * (L.titleK || 1))}px">${escapeHtml(sample)}</span><span class="name">${L.name}</span>` };
  }), d.lettering, v => { design().lettering = v; ensureFonts([v]).then(() => { clearMeasureCache(); update(); }); update(); });
  const sw = () => INKS.map(i => ({ value: i.id, className: 'ql-swatch', label: i.name, style: `--sw:${i.hex}` }));
  radioGroup(ui.borderInk, sw(), d.borderInk, v => { design().borderInk = v; syncDesign(); update(); });
  radioGroup(ui.textInk, sw(), d.textInk, v => { design().textInk = v; update(); });
}

/* Size */
function fmtNum(pt) { const v = fromPt(pt, S.unit); return String(Math.round(v * (S.unit === 'cm' ? 10 : 1000)) / (S.unit === 'cm' ? 10 : 1000)); }
function optionList(sel, list, currentPt) {
  sel.innerHTML = list.map(([v, label]) => `<option value="${v}">${label}</option>`).join('');
  const best = list.reduce((m, [v]) => (Math.abs(toPt(v, S.unit) - currentPt) < Math.abs(toPt(m, S.unit) - currentPt) ? v : m), list[0][0]);
  sel.value = String(best);
  return toPt(best, S.unit);
}
function syncSize() {
  setPressed($('unitSeg'), S.unit);
  document.querySelectorAll('.unitTxt').forEach(i => { i.textContent = S.unit; });
  const step = S.unit === 'cm' ? 0.5 : 0.25;
  for (const el of [ui.w, ui.h]) { el.step = step; el.min = fmtNum(LIMITS.min); el.max = fmtNum(LIMITS.max); }
  ui.w.value = fmtNum(S.w); ui.h.value = fmtNum(S.h);
  ui.presets.innerHTML = PRESETS[S.unit].map(([w, h]) => {
    const on = Math.abs(toPt(w, S.unit) - S.w) < 0.5 && Math.abs(toPt(h, S.unit) - S.h) < 0.5;
    return `<button type="button" class="ql-chip" data-w="${w}" data-h="${h}" aria-pressed="${on}">${w} × ${h}</button>`;
  }).join('');
  S.allowance = optionList(ui.allowance, ALLOWANCES[S.unit], S.allowance);
}
$('unitSeg').addEventListener('click', e => { const b = e.target.closest('button[data-value]'); if (!b || b.dataset.value === S.unit) return; S.unit = b.dataset.value; syncSize(); syncPrint(); update(); });
ui.presets.addEventListener('click', e => { const b = e.target.closest('[data-w]'); if (!b) return; S.w = toPt(b.dataset.w, S.unit); S.h = toPt(b.dataset.h, S.unit); syncSize(); update(); });
for (const [el, k] of [[ui.w, 'w'], [ui.h, 'h']]) {
  el.addEventListener('input', () => { const v = parseFloat(el.value); if (v > 0) { const pt = toPt(v, S.unit); if (pt >= LIMITS.min && pt <= LIMITS.max) { S[k] = pt; markPresets(); update(); } } });
  el.addEventListener('change', () => { const v = parseFloat(el.value); S[k] = clampLen(v > 0 ? toPt(v, S.unit) : S[k]); el.value = fmtNum(S[k]); markPresets(); update(); });
}
function markPresets() { ui.presets.querySelectorAll('[data-w]').forEach(b => b.setAttribute('aria-pressed', String(Math.abs(toPt(b.dataset.w, S.unit) - S.w) < 0.5 && Math.abs(toPt(b.dataset.h, S.unit) - S.h) < 0.5))); }
ui.swap.addEventListener('click', () => { [S.w, S.h] = [S.h, S.w]; syncSize(); update(); });
ui.allowance.addEventListener('change', () => { S.allowance = toPt(parseFloat(ui.allowance.value), S.unit); update(); });

/* Print */
function syncPrint() {
  document.querySelectorAll('#modes input').forEach(r => { r.checked = r.value === S.mode; });
  document.querySelectorAll('.ql-sub').forEach(el => { el.hidden = !el.dataset.mode.split(' ').includes(S.mode); });
  ui.page.value = S.page; ui.square.checked = S.square; ui.sheet.value = S.sheet; ui.mirror.checked = S.mirror; ui.list.value = S.list;
  S.margin = optionList(ui.margin, MARGINS[S.unit], S.margin);
  S.gap = optionList(ui.gap, GAPS[S.unit], S.gap);
  listInfo();
}
document.querySelectorAll('#modes input').forEach(r => r.addEventListener('change', () => {
  S.mode = r.value; batchCache.key = '';
  syncPrint();
  setView(S.mode === 'single' ? 'label' : 'sheet');
  update();
}));
ui.page.addEventListener('change', () => { S.page = ui.page.value; update(); });
ui.square.addEventListener('change', () => { S.square = ui.square.checked; update(); });
ui.sheet.addEventListener('change', () => { S.sheet = ui.sheet.value; update(); });
ui.margin.addEventListener('change', () => { S.margin = toPt(parseFloat(ui.margin.value), S.unit); update(); });
ui.gap.addEventListener('change', () => { S.gap = toPt(parseFloat(ui.gap.value), S.unit); update(); });
ui.mirror.addEventListener('change', () => { S.mirror = ui.mirror.checked; update(); });
ui.list.addEventListener('input', () => { S.list = ui.list.value.slice(0, 200000); listInfo(); update(); });
ui.csv.addEventListener('change', async () => {
  const f = ui.csv.files && ui.csv.files[0]; if (!f) return;
  if (f.size > 2e6) { toast('That file is over 2 MB. Save just the columns you need as CSV.'); return; }
  S.list = (await f.text()).slice(0, 200000); ui.list.value = S.list; ui.csv.value = '';
  listInfo(); update();
});
const FIELD_NAMES = { title: 'Quilt name', for: 'Made for', by: 'Made by', date: 'Date', place: 'Place', message: 'Message', care: 'Washing note', awardee: 'Awarded to', piecer: 'Pieced by', piecerState: 'Piecer’s state', quilter: 'Quilted by', quilterState: 'Quilter’s state', binder: 'Bound by', binderState: 'Binder’s state', state: 'State', donor: 'Donated by' };
function listInfo() {
  const b = batch();
  if (!b || !b.labels.length) { ui.listInfo.textContent = ''; return; }
  ui.listInfo.textContent = `${b.labels.length} label${b.labels.length > 1 ? 's' : ''}` + (b.header ? `, columns read: ${[...new Set(b.header)].map(k => FIELD_NAMES[k] || k).join(', ')}` : ', one per line') + (b.truncated ? '. Only the first 500 rows are used.' : '.');
}

/* Preview controls */
function setView(m) { view.mode = m; setPressed($('viewSeg'), m); $('zoomSeg').hidden = m === 'sheet'; }
$('viewSeg').addEventListener('click', e => { const b = e.target.closest('button[data-value]'); if (!b) return; setView(b.dataset.value); render(); });
$('zoomSeg').addEventListener('click', e => { const b = e.target.closest('button[data-value]'); if (!b) return; view.zoom = b.dataset.value; setPressed($('zoomSeg'), view.zoom); render(); });
ui.prev.addEventListener('click', () => { if (view.mode === 'sheet') view.sheetPage = Math.max(0, view.sheetPage - 1); else view.index = Math.max(0, view.index - 1); render(); });
ui.next.addEventListener('click', () => { if (view.mode === 'sheet') view.sheetPage++; else view.index++; render(); });

/* Tabs */
const tabs = [...document.querySelectorAll('.ql-tabs [role=tab]')];
function selectTab(t, focus) {
  tabs.forEach(x => { const on = x === t; x.setAttribute('aria-selected', String(on)); x.tabIndex = on ? 0 : -1; $(x.getAttribute('aria-controls')).hidden = !on; });
  if (focus) t.focus();
}
tabs.forEach((t, i) => {
  t.addEventListener('click', () => selectTab(t));
  t.addEventListener('keydown', e => {
    const d = e.key === 'ArrowRight' ? 1 : e.key === 'ArrowLeft' ? -1 : e.key === 'Home' ? -i : e.key === 'End' ? tabs.length - 1 - i : 0;
    if (!d) return; e.preventDefault(); selectTab(tabs[(i + d + tabs.length) % tabs.length], true);
  });
});

/* ------------------------------------------------------------------ saved designs (Pro) */
function savedDesigns() { return store.get('saved:v1', []); }
function renderSaved() {
  ui.savedList.innerHTML = savedDesigns().map((d, i) => `<li><span>${escapeHtml(d.name)}</span><button type="button" class="btn btn-sm" data-load="${i}">Use</button><button type="button" class="btn btn-sm" data-del="${i}" aria-label="Delete ${escapeHtml(d.name)}">Delete</button></li>`).join('');
}
ui.saveDesign.addEventListener('click', () => {
  if (!window.PeakLicense || !window.PeakLicense.requirePro('Saved designs are part of Pro: keep your border, lettering, size and wording and reuse them.')) return;
  const name = ui.saveName.value.trim() || (S.kind === 'qov' ? 'Quilt of Valor' : S.fields.title || 'My label');
  const list = savedDesigns().filter(d => d.name !== name);
  list.unshift({ name, savedAt: Date.now(), data: { kind: S.kind, fields: S.fields, qov: S.qov, designs: S.designs, unit: S.unit, w: S.w, h: S.h, allowance: S.allowance } });
  store.set('saved:v1', list.slice(0, 50)); ui.saveName.value = ''; renderSaved(); toast(`Saved “${name}”.`);
});
ui.savedList.addEventListener('click', e => {
  const l = e.target.closest('[data-load]'), d = e.target.closest('[data-del]');
  const list = savedDesigns();
  if (l) { const it = list[+l.dataset.load]; if (!it) return; Object.assign(S, JSON.parse(JSON.stringify(it.data))); S.w = clampLen(S.w); S.h = clampLen(S.h); batchCache.key = ''; syncInputs(); ensureFonts([design().lettering]).then(update); toast(`Using “${it.name}”.`); }
  if (d) { list.splice(+d.dataset.del, 1); store.set('saved:v1', list); renderSaved(); }
});

/* ------------------------------------------------------------------ exports */
const slug = s => String(s || '').toLowerCase().normalize('NFKD').replace(/[^\w\s-]/g, '').trim().replace(/[\s_]+/g, '-').slice(0, 40) || 'label';
function fileBase(spec) {
  const name = spec.kind === 'qov' ? 'quilt-of-valor-' + slug(spec.qov.awardee || 'label') : slug(spec.fields.title || spec.fields.for);
  return `${name}-${fmtNum(S.w)}x${fmtNum(S.h)}${S.unit}`;
}
let working = false;
function setBusy(on, frac) {
  working = on; ui.busy.hidden = !on; ui.pdf.disabled = on; ui.png.disabled = on;
  ui.busyBar.style.width = `${Math.round((frac || 0.15) * 100)}%`;
}
ui.pdf.addEventListener('click', async () => {
  if (working) return;
  if (S.mode !== 'single' && !(window.PeakLicense && window.PeakLicense.requirePro('Pro fills a whole fabric sheet with labels and makes a label for every name on a list. $9 once.'))) return;
  setBusy(true, 0.1);
  try {
    let r, name;
    if (S.mode === 'single') {
      const spec = specAt(view.index);
      r = await buildSinglePdf(spec, { page: S.page, allowance: S.allowance, mirror: S.mirror, unit: S.unit, square: S.square });
      name = `quilt-label-${fileBase(spec)}.pdf`;
    } else {
      let specs;
      if (S.mode === 'batch') {
        const b = batch();
        if (!b || !b.labels.length) { toast('Paste a list first: one name per line, or rows from a spreadsheet.'); return; }
        specs = allSpecs();
      } else {
        const plan = sheetPlan(1);
        if (!plan.count) { toast('The label is bigger than the printable area of this sheet.'); return; }
        specs = Array(plan.count).fill(baseSpec());
      }
      r = await buildSheetPdf(specs, { sheet: S.sheet, margin: S.margin, gap: S.gap, allowance: S.allowance, mirror: S.mirror, unit: S.unit, onProgress: (d, n) => setBusy(true, 0.1 + 0.85 * d / n) });
      name = `quilt-labels-${S.mode === 'batch' ? specs.length + '-' : ''}${fileBase(specs[0])}-${S.sheet}.pdf`;
    }
    window.PeakUI.download(new Blob([r.bytes], { type: 'application/pdf' }), name);
    toast(S.mode === 'single' ? 'PDF ready. Print it at 100% (Actual size).' : `PDF ready: ${r.pages} sheet${r.pages > 1 ? 's' : ''}. Print at 100% (Actual size).`);
  } catch (e) {
    console.warn(e); toast(e.message || 'Something went wrong making the PDF.');
  } finally { setBusy(false); }
});
ui.png.addEventListener('click', async () => {
  if (working) return;
  setBusy(true, 0.3);
  try {
    const spec = specAt(view.index);
    const r = await buildPng(spec, S.allowance, { mirror: S.mirror });
    window.PeakUI.download(new Blob([r.bytes], { type: 'image/png' }), `quilt-label-${fileBase(spec)}-300dpi.png`);
    toast(`PNG ready: ${r.width} × ${r.height} px at 300 dpi.`);
  } catch (e) { console.warn(e); toast(e.message || 'Something went wrong making the PNG.'); } finally { setBusy(false); }
});

/* ------------------------------------------------------------------ start */
function start() {
  syncInputs();
  if (S.mode !== 'single') setView('sheet');
  render();
  renderSaved();
  ensureFonts([design().lettering]).then(() => { clearMeasureCache(); render(); }).catch(() => {});
  if (document.fonts) document.fonts.addEventListener('loadingdone', () => { clearMeasureCache(); render(); });
  new ResizeObserver(() => { cancelAnimationFrame(raf); raf = requestAnimationFrame(render); }).observe(ui.view);
  const setup = () => {
    if (!window.PeakLicense) return;
    window.PeakLicense.setup({
      tool: 'quilt-label', productId: QUILT_PRO_PRODUCT_ID, permalink: QUILT_PRO_PERMALINK, buyUrl: QUILT_PRO_BUY_URL,
      pitch: 'Pro fills whole fabric sheets with labels, makes labels from a list or CSV and saves your designs. $9 once.',
    });
    window.PeakLicense.onChange(() => renderSummary());
  };
  if (window.PeakLicense) setup(); else window.addEventListener('DOMContentLoaded', setup);
}
start();
