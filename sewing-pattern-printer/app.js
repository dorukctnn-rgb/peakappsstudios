/* Print Only Your Size: page logic.
 * pdf.js (preview, layer list) and pdf-lib (writing the copy) are vendored in ./vendor and
 * loaded only when someone opens a file. Everything runs in the browser; nothing is uploaded. */
import { buildOutput, planTiles, tileWindow, rowLabel, PAPERS } from './engine.js';

/* ---- Gumroad Pro product. The owner pastes the product id here once the product exists
 *      (Gumroad requires product_id for products created after 2023; until then the permalink is used). */
const SEWING_PRO_PRODUCT_ID = 'gW4_EpsBZTT_9rbAq_33Ww==';
const SEWING_PRO_PERMALINK = 'sewing-pattern-pro';
const SEWING_PRO_BUY_URL = 'https://dorukctn.gumroad.com/l/sewing-pattern-pro';

const VENDOR = new URL('./vendor/', import.meta.url);
const SAMPLE_URL = new URL('./sample-layered-pattern.pdf', import.meta.url);
const MM = 72 / 25.4, IN = 72;
const MAX_CANVAS_PX = 12e6; // stay well inside iPad Safari's canvas limit

const $ = id => document.getElementById(id);
const ui = {
  tool: $('tool'), drop: $('drop'), file: $('file'), sample: $('sample'), filecard: $('filecard'), fileName: $('fileName'), fileInfo: $('fileInfo'),
  change: $('change'), fileNote: $('fileNote'), stage: $('stage'), pager: $('pager'), prev: $('prev'), next: $('next'), pageLabel: $('pageLabel'),
  sizeLabel: $('sizeLabel'), zoomBar: $('zoomBar'), zoomIn: $('zoomIn'), zoomOut: $('zoomOut'), zoomFit: $('zoomFit'), view: $('view'), sheet: $('sheet'),
  canvas: $('canvas'), overlay: $('overlay'), empty: $('empty'), busy: $('busy'), busyLabel: $('busyLabel'), busyBar: $('busyBar'),
  layers: $('layers'), layersTitle: $('layersTitle'), quick: $('quick'), outputGroup: $('outputGroup'), modes: $('modes'),
  paper: $('paper'), overlap: $('overlap'), margin: $('margin'), skipBlank: $('skipBlank'), tileSummary: $('tileSummary'), weight: $('weight'),
  download: $('download'), openPrint: $('openPrint'),
};

const store = {
  get(k, d) { try { const v = localStorage.getItem('sp:' + k); return v == null ? d : JSON.parse(v); } catch (e) { return d; } },
  set(k, v) { try { localStorage.setItem('sp:' + k, JSON.stringify(v)); } catch (e) { /* private mode */ } },
};
const usLike = /^(en-US|en-CA|es-US|fr-CA|es-MX|en-PH)/i.test(navigator.language || '');

const S = {
  name: '', bytes: null, pdf: null, cfg: null, layers: [], groups: null,
  page: 1, zoom: 1, mode: 'pages',
  paper: store.get('paper', usLike ? 'letter' : 'a4'),
  overlapIdx: store.get('overlapIdx', 2), marginIdx: store.get('marginIdx', 1),
  skipBlank: store.get('skipBlank', true), lineScale: store.get('lineScale', 2),
  sheets: [], perms: null, renderTask: null, renderSeq: 0, busy: false,
  swatches: new Map(), blankCache: new Map(),
};

/* ---------------------------------------------------------------- lazy libraries */
let pdfjsP = null, pdfLibP = null;
function loadPdfjs() {
  pdfjsP ||= import(new URL('pdf.min.js', VENDOR).href).then(m => {
    m.GlobalWorkerOptions.workerSrc = new URL('pdf.worker.min.js', VENDOR).href;
    return m;
  });
  return pdfjsP;
}
function loadPdfLib() {
  pdfLibP ||= new Promise((resolve, reject) => {
    if (window.PDFLib) return resolve(window.PDFLib);
    const s = document.createElement('script');
    s.src = new URL('pdf-lib.min.js', VENDOR).href;
    s.onload = () => resolve(window.PDFLib);
    s.onerror = () => { pdfLibP = null; reject(new Error('Could not load pdf-lib')); };
    document.head.appendChild(s);
  });
  return pdfLibP;
}

/* ---------------------------------------------------------------- helpers */
const toast = msg => (window.PeakUI ? window.PeakUI.toast(msg) : console.log(msg));
const fmtMm = pt => Math.round(pt / MM);
const fmtIn = pt => (pt / IN).toFixed(1).replace(/\.0$/, '');
const NAMED = [
  ['A0', 841, 1189], ['A1', 594, 841], ['A2', 420, 594], ['A3', 297, 420], ['A4', 210, 297],
  ['US Letter', 215.9, 279.4], ['US Legal', 215.9, 355.6], ['Tabloid', 279.4, 431.8],
  ['24 × 36 in', 609.6, 914.4], ['36 × 48 in', 914.4, 1219.2], ['B0', 1000, 1414], ['B1', 707, 1000],
];
function sheetName(w, h) {
  const a = Math.min(w, h) / MM, b = Math.max(w, h) / MM;
  const hit = NAMED.find(([, x, y]) => Math.abs(a - x) < 2.5 && Math.abs(b - y) < 2.5);
  return hit ? hit[0] : null;
}
function sheetText(w, h) {
  const n = sheetName(w, h);
  const dims = `${fmtMm(w)} × ${fmtMm(h)} mm`;
  return n ? `${n} · ${dims}` : `${dims} (${fmtIn(w)} × ${fmtIn(h)} in)`;
}
function isSizeName(raw) {
  const s = String(raw || '').trim().toLowerCase();
  if (!s) return false;
  if (/\bsizes?\b|\bsz\b|\btaille\b|\bgr(ö|oe)(ss|ß)e\b/.test(s)) return true;
  if (/^(us|uk|eu|au|aus|rtw)\s*\d{1,3}$/.test(s)) return true;
  if (/^(xxs|xs|s|m|l|xl|xxl|xxxl|[1-6]x|[1-6]xl|\d{1,2}(\s*[\/-]\s*\d{1,2})?|\d{2,3})$/.test(s)) return true;
  if (/^\d{1,2}\s?(t|m|mo|mos|y|yr|yrs|w|p)$/.test(s)) return true;
  if (/^[a-h]{1,2}([\/-][a-h]{1,2})?\s?cup$/.test(s)) return true;
  return false;
}
function baseName() { return (S.name || 'pattern').replace(/\.pdf$/i, '').replace(/[\\/:*?"<>|]+/g, ' ').trim() || 'pattern'; }
function tick() { return new Promise(r => setTimeout(r, 0)); }

/* ---------------------------------------------------------------- busy state */
function busy(on, label = 'Working…', frac = 0) {
  S.busy = on;
  ui.busy.hidden = !on;
  ui.busyLabel.textContent = label;
  ui.busyBar.style.width = `${Math.round(frac * 100)}%`;
  updateButtons();
}

/* ---------------------------------------------------------------- open a file */
async function whenIdle() { while (S.busy) await new Promise(r => setTimeout(r, 120)); }
async function openBytes(bytes, name) {
  await whenIdle();
  busy(true, 'Opening the pattern…', 0.1);
  try {
    const pdfjs = await loadPdfjs();
    if (S.task) { try { await S.task.destroy(); } catch (e) { /* ignore */ } }
    S.pdf = null; S.cfg = null; S.task = null;
    const task = pdfjs.getDocument({ data: bytes.slice(), isEvalSupported: false, enableXfa: false, verbosity: 0 });
    task.onPassword = (update, reason) => {
      const pw = window.prompt(reason === pdfjs.PasswordResponses.INCORRECT_PASSWORD ? 'That password didn’t work. Try again:' : 'This PDF needs a password to open:');
      if (pw === null) { task.destroy(); } else update(pw);
    };
    const pdf = await task.promise;
    S.task = task; S.pdf = pdf; S.bytes = bytes; S.name = name; S.page = 1; S.zoom = 1;
    S.swatches = new Map(); S.blankCache = new Map();
    const perms = await pdf.getPermissions().catch(() => null); // null, or a Set/array of PermissionFlag values
    S.perms = perms ? [...perms] : null;
    S.cfg = await pdf.getOptionalContentConfig({ intent: 'display' });
    S.sheets = [];
    for (let i = 1; i <= pdf.numPages; i++) {
      const p = await pdf.getPage(i);
      const vp = p.getViewport({ scale: 1 });
      S.sheets.push({ w: vp.width, h: vp.height });
    }
    readLayers();
    ui.tool.classList.add('has-file');
    ui.filecard.hidden = false;
    ui.fileName.textContent = name;
    const sizes = new Set(S.sheets.map(s => sheetName(s.w, s.h) || `${fmtMm(s.w)} × ${fmtMm(s.h)} mm`));
    ui.fileInfo.textContent = `${pdf.numPages} page${pdf.numPages > 1 ? 's' : ''} · ${sizes.size === 1 ? [...sizes][0] : 'mixed sizes'}`;
    const note = [];
    if (S.perms) {
      const PF = pdfjs.PermissionFlag;
      const canPrint = S.perms.includes(PF.PRINT) || S.perms.includes(PF.PRINT_HIGH_QUALITY);
      if (!canPrint) note.push('The designer has switched printing off for this file, so the tool can show it but can’t make a printable copy.');
      else note.push('This PDF is password-locked against editing, so the copy will be made from high-resolution page images instead of lines.');
    }
    ui.fileNote.hidden = !note.length; ui.fileNote.textContent = note.join(' ');
    ui.empty.hidden = true; ui.sheet.hidden = false;
    ui.pager.hidden = pdf.numPages < 2; ui.zoomBar.hidden = false;
    ui.outputGroup.classList.remove('is-disabled');
    renderLayers();
    updateTilesUI();
    await renderPreview();
    computeSwatches().catch(() => {});
  } catch (e) {
    console.warn(e);
    const msg = e && e.name === 'PasswordException' ? 'That PDF needs a password.' : 'That file couldn’t be opened as a PDF.';
    toast(msg);
  } finally {
    busy(false);
  }
}

async function openFile(file) {
  if (!file) return;
  if (!/\.pdf$/i.test(file.name) && file.type !== 'application/pdf') { toast('Choose a PDF file (.pdf).'); return; }
  const bytes = new Uint8Array(await file.arrayBuffer());
  await openBytes(bytes, file.name);
}

/* ---------------------------------------------------------------- layers */
function readLayers() {
  const cfg = S.cfg;
  S.layers = []; S.groups = null;
  if (!cfg) return;
  const all = [...cfg];
  if (!all.length) return;
  const seen = new Set();
  const walk = (items, depth, parentLabel) => {
    for (const it of items) {
      if (typeof it === 'string') {
        if (seen.has(it)) continue; seen.add(it);
        const g = cfg.getGroup(it);
        if (g) S.layers.push({ id: it, name: g.name || 'Unnamed layer', on: g.visible, depth, parent: parentLabel });
      } else if (it && Array.isArray(it.order)) {
        if (it.name) S.layers.push({ label: it.name, depth });
        walk(it.order, it.name ? depth + 1 : depth, it.name || parentLabel);
      }
    }
  };
  walk(cfg.getOrder() || all.map(([id]) => id), 0, null);
  for (const [id, g] of all) if (!seen.has(id)) S.layers.push({ id, name: g.name || 'Unnamed layer', on: g.visible, depth: 0 });
  for (const l of S.layers) if (l.id) { l.size = isSizeName(l.name) || isSizeName(l.parent); cfg.setVisibility(l.id, l.on, false); }
  const sizeCount = S.layers.filter(l => l.size).length;
  S.groups = sizeCount >= 2 && sizeCount < S.layers.filter(l => l.id).length ? 'split' : (sizeCount >= 2 ? 'sizes' : 'flat');
}

function layerRow(l, group) {
  const row = document.createElement('label');
  row.className = 'sp-layer' + (l.on ? '' : ' is-off');
  row.dataset.depth = String(Math.min(2, S.groups === 'split' ? 0 : l.depth));
  row.dataset.id = l.id;
  const cb = document.createElement('input');
  cb.type = 'checkbox'; cb.checked = l.on;
  cb.addEventListener('change', () => setLayer(l, cb.checked));
  const sw = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
  sw.setAttribute('class', 'sw'); sw.setAttribute('viewBox', '0 0 30 12'); sw.setAttribute('aria-hidden', 'true');
  const nm = document.createElement('span');
  nm.className = 'nm'; nm.textContent = l.name; nm.title = l.name;
  const only = document.createElement('button');
  only.type = 'button'; only.className = 'sp-only'; only.textContent = 'only';
  only.setAttribute('aria-label', `Show only ${l.name}${group ? ' among ' + group : ''}`);
  only.addEventListener('click', e => { e.preventDefault(); onlyLayer(l); });
  row.append(cb, sw, nm, only);
  paintSwatch(sw, l.id);
  return row;
}

function renderLayers() {
  const box = ui.layers;
  box.textContent = '';
  const real = S.layers.filter(l => l.id);
  ui.layersTitle.textContent = real.length ? `Layers (${real.length})` : 'Layers';
  ui.quick.hidden = !(S.groups === 'split' || S.groups === 'sizes');
  if (!real.length) {
    const p = document.createElement('p'); p.className = 'hint';
    p.innerHTML = S.pdf
      ? 'This PDF has no layers, so its sizes can’t be separated here. Some designers sell a separate file per size; look for a “layered” file in your download. You can still tile a large sheet with Pro.'
      : 'Open a pattern to see its sizes and other layers here.';
    box.append(p);
    return;
  }
  if (S.groups === 'split') {
    const sizes = document.createElement('div'); sizes.className = 'sp-set';
    const others = document.createElement('div'); others.className = 'sp-set';
    const h1 = document.createElement('p'); h1.textContent = 'Sizes';
    const h2 = document.createElement('p'); h2.textContent = 'Other layers · usually keep these on';
    sizes.append(h1); others.append(h2);
    for (const l of real) (l.size ? sizes : others).append(layerRow(l, l.size ? 'sizes' : 'other layers'));
    box.append(sizes, others);
  } else {
    const set = document.createElement('div'); set.className = 'sp-set';
    for (const l of S.layers) {
      if (l.label) { const d = document.createElement('div'); d.className = 'sp-group-label'; d.textContent = l.label; set.append(d); continue; }
      set.append(layerRow(l, null));
    }
    box.append(set);
  }
}

function syncRows() {
  for (const row of ui.layers.querySelectorAll('.sp-layer')) {
    const l = S.layers.find(x => x.id === row.dataset.id);
    if (!l) continue;
    row.classList.toggle('is-off', !l.on);
    row.querySelector('input').checked = l.on;
  }
}

let layerTimer = null;
function layersChanged() {
  S.blankCache = new Map();
  syncRows();
  clearTimeout(layerTimer);
  layerTimer = setTimeout(() => { renderPreview(); if (S.mode === 'tiles') updateSummary(); }, 60);
  updateButtons();
}
function setLayer(l, on) { l.on = on; S.cfg.setVisibility(l.id, on, false); layersChanged(); }
function onlyLayer(l) {
  const pool = S.groups === 'split' ? S.layers.filter(x => x.id && x.size === l.size) : S.layers.filter(x => x.id);
  for (const x of pool) { x.on = x === l; S.cfg.setVisibility(x.id, x.on, false); }
  layersChanged();
}
ui.quick.addEventListener('click', e => {
  const b = e.target.closest('button[data-all]'); if (!b || !S.cfg) return;
  for (const x of S.layers) if (x.id && x.size) { x.on = b.dataset.all === '1'; S.cfg.setVisibility(x.id, x.on, false); }
  layersChanged();
});

/* Line colour and dash of each layer, read from the first pages' drawing operators. */
async function computeSwatches() {
  if (!S.pdf || !S.layers.some(l => l.id)) return;
  const pdfjs = await loadPdfjs();
  const O = pdfjs.OPS;
  const want = new Set(S.layers.filter(l => l.id).map(l => l.id));
  const pdf = S.pdf;
  for (let p = 1; p <= Math.min(pdf.numPages, 3) && want.size; p++) {
    const page = await pdf.getPage(p);
    const ol = await page.getOperatorList({ intent: 'any' });
    if (pdf !== S.pdf) return;
    if (ol.fnArray.length > 400000) break;
    let st = { stroke: '#000000', fill: '#000000', dash: [] };
    const saved = [], oc = [];
    const cur = () => { for (let i = oc.length - 1; i >= 0; i--) if (oc[i]) return oc[i]; return null; };
    for (let i = 0; i < ol.fnArray.length; i++) {
      const fn = ol.fnArray[i], a = ol.argsArray[i];
      switch (fn) {
        case O.save: case O.paintFormXObjectBegin: saved.push({ ...st }); break;
        case O.restore: case O.paintFormXObjectEnd: if (saved.length) st = saved.pop(); break;
        case O.setStrokeRGBColor: st.stroke = a[0]; break;
        case O.setFillRGBColor: st.fill = a[0]; break;
        case O.setDash: st.dash = Array.isArray(a[0]) ? a[0] : []; break;
        case O.beginMarkedContentProps: {
          let id = null;
          if (a[0] === 'OC' && a[1]) id = a[1].id || (Array.isArray(a[1].ids) && a[1].ids.length === 1 ? a[1].ids[0] : null);
          oc.push(id); break;
        }
        case O.beginMarkedContent: oc.push(null); break;
        case O.endMarkedContent: oc.pop(); break;
        case O.constructPath: {
          const id = cur(); if (!id || !want.has(id) || S.swatches.has(id)) break;
          const op = a[0];
          if (op === O.stroke || op === O.closeStroke || op === O.fillStroke || op === O.eoFillStroke || op === O.closeFillStroke || op === O.closeEOFillStroke) {
            S.swatches.set(id, { color: st.stroke, dash: st.dash.slice(0, 6) }); want.delete(id);
          } else if (op === O.fill || op === O.eoFill) {
            S.swatches.set(id, { color: st.fill, dash: [], fill: true }); want.delete(id);
          }
          break;
        }
        case O.showText: case O.showSpacedText: {
          const id = cur(); if (!id || !want.has(id) || S.swatches.has(id)) break;
          S.swatches.set(id, { color: st.fill, text: true }); want.delete(id); break;
        }
        default: break;
      }
    }
  }
  for (const row of ui.layers.querySelectorAll('.sp-layer')) paintSwatch(row.querySelector('svg.sw'), row.dataset.id);
}
function paintSwatch(svg, id) {
  if (!svg) return;
  const sw = S.swatches.get(id);
  svg.textContent = '';
  const NS = 'http://www.w3.org/2000/svg';
  if (!sw) { const l = document.createElementNS(NS, 'line'); l.setAttribute('x1', 2); l.setAttribute('x2', 28); l.setAttribute('y1', 6); l.setAttribute('y2', 6); l.setAttribute('stroke', 'var(--line-2)'); l.setAttribute('stroke-width', '1.5'); svg.append(l); return; }
  const color = /^#[0-9a-f]{6}$/i.test(sw.color) && sw.color.toLowerCase() !== '#ffffff' ? sw.color : 'var(--ink-2)';
  if (sw.text) {
    const t = document.createElementNS(NS, 'text'); t.setAttribute('x', 2); t.setAttribute('y', 10.5); t.setAttribute('font-size', '11'); t.setAttribute('font-family', 'Geist, sans-serif'); t.setAttribute('fill', color); t.textContent = 'Aa'; svg.append(t); return;
  }
  if (sw.fill) { const r = document.createElementNS(NS, 'rect'); r.setAttribute('x', 2); r.setAttribute('y', 2); r.setAttribute('width', 26); r.setAttribute('height', 8); r.setAttribute('rx', 2); r.setAttribute('fill', color); svg.append(r); return; }
  const l = document.createElementNS(NS, 'line');
  l.setAttribute('x1', 1); l.setAttribute('x2', 29); l.setAttribute('y1', 6); l.setAttribute('y2', 6);
  l.setAttribute('stroke', color); l.setAttribute('stroke-width', '2.2'); l.setAttribute('stroke-linecap', 'butt');
  const dash = (sw.dash || []).filter(v => v > 0);
  if (dash.length) { const k = 6 / Math.max(...dash, 6); l.setAttribute('stroke-dasharray', dash.map(v => Math.max(1.2, v * k * 1.4).toFixed(1)).join(' ')); }
  svg.append(l);
}

/* ---------------------------------------------------------------- preview */
async function renderPreview() {
  if (!S.pdf) return;
  const seq = ++S.renderSeq;
  if (S.renderTask) { try { S.renderTask.cancel(); } catch (e) { /* ignore */ } }
  const page = await S.pdf.getPage(S.page);
  if (seq !== S.renderSeq) return;
  const base = page.getViewport({ scale: 1 });
  const pad = window.innerWidth <= 860 ? 28 : 44;
  const availW = Math.max(120, ui.view.clientWidth - pad), availH = Math.max(120, ui.view.clientHeight - pad);
  const fit = Math.min(availW / base.width, availH / base.height);
  const cssScale = fit * S.zoom;
  const cssW = base.width * cssScale, cssH = base.height * cssScale;
  let px = Math.min(window.devicePixelRatio || 1, 2) * cssScale;
  if (base.width * base.height * px * px > MAX_CANVAS_PX) px = Math.sqrt(MAX_CANVAS_PX / (base.width * base.height));
  const vp = page.getViewport({ scale: px });
  const canvas = document.createElement('canvas');
  canvas.width = Math.floor(vp.width); canvas.height = Math.floor(vp.height);
  ui.stage.classList.add('is-rendering');
  const task = page.render({ canvas, viewport: vp, optionalContentConfigPromise: Promise.resolve(S.cfg) });
  S.renderTask = task;
  try {
    await task.promise;
  } catch (e) {
    if (e && e.name === 'RenderingCancelledException') return;
    console.warn(e); toast('This page couldn’t be drawn.'); return;
  } finally {
    if (seq === S.renderSeq) ui.stage.classList.remove('is-rendering');
  }
  if (seq !== S.renderSeq) return;
  canvas.id = 'canvas';
  canvas.setAttribute('role', 'img');
  const on = S.layers.filter(l => l.id && l.on).map(l => l.name);
  canvas.setAttribute('aria-label', `Preview of page ${S.page}${on.length ? ', showing ' + on.join(', ') : ''}`);
  canvas.style.width = `${cssW}px`; canvas.style.height = `${cssH}px`;
  ui.canvas.replaceWith(canvas); ui.canvas = canvas;
  ui.sheet.style.width = `${cssW}px`; ui.sheet.style.height = `${cssH}px`;
  ui.pageLabel.textContent = `${S.page} / ${S.pdf.numPages}`;
  ui.prev.disabled = S.page <= 1; ui.next.disabled = S.page >= S.pdf.numPages;
  ui.sizeLabel.textContent = sheetText(base.width, base.height);
  ui.zoomFit.textContent = S.zoom === 1 ? 'Fit' : `${Math.round(S.zoom * 100)}%`;
  ui.zoomOut.disabled = S.zoom <= 1; ui.zoomIn.disabled = S.zoom >= 8;
  drawOverlay();
}

function drawOverlay() {
  const svg = ui.overlay;
  svg.textContent = '';
  if (S.mode !== 'tiles' || !S.pdf) return;
  const sh = S.sheets[S.page - 1]; if (!sh) return;
  const plan = currentPlan(sh);
  svg.setAttribute('viewBox', `0 0 ${sh.w} ${sh.h}`);
  svg.setAttribute('preserveAspectRatio', 'none');
  const NS = 'http://www.w3.org/2000/svg';
  const blank = S.blankCache.get(blankKey(S.page - 1, plan));
  const fs = Math.max(10, Math.min(plan.cw, plan.ch) * 0.07);
  for (let r = 0; r < plan.rows; r++) for (let c = 0; c < plan.cols; c++) {
    const w = tileWindow(plan, sh.h, r, c);
    const x = w.x0, y = sh.h - w.y1;
    const rect = document.createElementNS(NS, 'rect');
    rect.setAttribute('x', x); rect.setAttribute('y', y); rect.setAttribute('width', plan.cw); rect.setAttribute('height', plan.ch);
    const skipped = S.skipBlank && blank && blank.has(`${r}:${c}`);
    rect.setAttribute('class', 't' + (skipped ? ' skip' : ''));
    svg.append(rect);
    const label = `${rowLabel(r)}${c + 1}`;
    const bg = document.createElementNS(NS, 'rect');
    bg.setAttribute('class', 'lbl-bg'); bg.setAttribute('x', x + fs * 0.3); bg.setAttribute('y', y + fs * 0.3); bg.setAttribute('width', fs * (0.75 * label.length + 0.6)); bg.setAttribute('height', fs * 1.3);
    const t = document.createElementNS(NS, 'text');
    t.setAttribute('class', 'lbl'); t.setAttribute('x', x + fs * 0.6); t.setAttribute('y', y + fs * 1.25); t.setAttribute('font-size', fs);
    t.textContent = label;
    svg.append(bg, t);
  }
}

/* ---------------------------------------------------------------- tiles */
const OVERLAPS = { letter: [[0, 'None'], [0.25 * IN, '¼ in'], [0.5 * IN, '½ in'], [1 * IN, '1 in']], a4: [[0, 'None'], [5 * MM, '5 mm'], [10 * MM, '10 mm'], [20 * MM, '20 mm']] };
const MARGINS = { letter: [[0.25 * IN, 'Narrow, ¼ in'], [0.375 * IN, 'Standard, ⅜ in'], [0.625 * IN, 'Wide, ⅝ in']], a4: [[6 * MM, 'Narrow, 6 mm'], [10 * MM, 'Standard, 10 mm'], [15 * MM, 'Wide, 15 mm']] };
function fillSelect(sel, list, idx) {
  sel.textContent = '';
  list.forEach(([, label], i) => { const o = document.createElement('option'); o.value = String(i); o.textContent = label; sel.append(o); });
  sel.value = String(Math.min(idx, list.length - 1));
}
function tileSettings() {
  const ov = OVERLAPS[S.paper][Math.min(S.overlapIdx, 3)][0];
  const mg = MARGINS[S.paper][Math.min(S.marginIdx, 2)][0];
  return { paper: S.paper, overlap: ov, margin: mg };
}
function currentPlan(sh) { const t = tileSettings(); return planTiles(sh.w, sh.h, t.paper, t.margin, t.overlap); }
function blankKey(i, plan) { return `${i}|${S.cfg ? S.cfg.getHash() : ''}|${plan.paper}|${plan.orientation}|${plan.margin.toFixed(2)}|${plan.overlap.toFixed(2)}`; }

const lowRes = new Map();
async function blankTiles(i, plan) {
  const key = blankKey(i, plan);
  if (S.blankCache.has(key)) return S.blankCache.get(key);
  const imgKey = `${i}|${S.cfg ? S.cfg.getHash() : ''}`;
  let shot = lowRes.get(imgKey);
  if (!shot) {
    const page = await S.pdf.getPage(i + 1);
    const base = page.getViewport({ scale: 1 });
    const scale = Math.min(0.5, Math.sqrt(6e6 / (base.width * base.height)));
    const vp = page.getViewport({ scale });
    const canvas = document.createElement('canvas');
    canvas.width = Math.ceil(vp.width); canvas.height = Math.ceil(vp.height);
    await page.render({ canvas, viewport: vp, optionalContentConfigPromise: Promise.resolve(S.cfg) }).promise;
    const ctx = canvas.getContext('2d', { willReadFrequently: true });
    shot = { data: ctx.getImageData(0, 0, canvas.width, canvas.height), scale };
    lowRes.clear(); lowRes.set(imgKey, shot);
  }
  const { data, scale } = shot;
  const W = data.width, H = data.height, px = data.data;
  const sh = S.sheets[i];
  const out = new Set();
  for (let r = 0; r < plan.rows; r++) for (let c = 0; c < plan.cols; c++) {
    const w = tileWindow(plan, sh.h, r, c);
    const x0 = Math.max(0, Math.floor(w.x0 * scale) - 1), x1 = Math.min(W, Math.ceil(w.x1 * scale) + 1);
    const y0 = Math.max(0, Math.floor((sh.h - w.y1) * scale) - 1), y1 = Math.min(H, Math.ceil((sh.h - w.y0) * scale) + 1);
    let ink = false;
    for (let y = y0; y < y1 && !ink; y++) {
      let o = (y * W + x0) * 4;
      for (let x = x0; x < x1; x++, o += 4) { if (px[o] < 246 || px[o + 1] < 246 || px[o + 2] < 246) { ink = true; break; } }
    }
    if (!ink) out.add(`${r}:${c}`);
  }
  S.blankCache.set(key, out);
  return out;
}

let summaryTimer = null;
function updateTilesUI() {
  fillSelect(ui.overlap, OVERLAPS[S.paper], S.overlapIdx);
  fillSelect(ui.margin, MARGINS[S.paper], S.marginIdx);
  ui.paper.value = S.paper;
  ui.skipBlank.checked = S.skipBlank;
  clearTimeout(summaryTimer);
  summaryTimer = setTimeout(updateSummary, 30);
}
async function updateSummary() {
  if (!S.pdf || S.mode !== 'tiles') { drawOverlay(); return; }
  let total = 0, printed = 0;
  const plans = S.sheets.map(sh => currentPlan(sh));
  for (const p of plans) total += p.n;
  const label = PAPERS[S.paper].label;
  const head = plans.length === 1
    ? `<b>${plans[0].cols} × ${plans[0].rows}</b> = ${plans[0].n} ${label} pages, ${plans[0].orientation}`
    : `<b>${total}</b> ${label} pages for ${plans.length} sheets`;
  ui.tileSummary.innerHTML = `${head}, plus an assembly map.`;
  drawOverlay();
  if (!S.skipBlank) return;
  try {
    const limit = Math.min(S.sheets.length, 12);
    for (let i = 0; i < limit; i++) printed += plans[i].n - (await blankTiles(i, plans[i])).size;
    if (limit < S.sheets.length) return;
    if (S.mode !== 'tiles') return;
    const skipped = total - printed;
    ui.tileSummary.innerHTML = `${head}. <b>${printed}</b> to print${skipped ? `, ${skipped} empty left out` : ''}, plus an assembly map.`;
    drawOverlay();
  } catch (e) { console.warn(e); }
}

ui.paper.addEventListener('change', () => { S.paper = ui.paper.value; store.set('paper', S.paper); updateTilesUI(); });
ui.overlap.addEventListener('change', () => { S.overlapIdx = +ui.overlap.value; store.set('overlapIdx', S.overlapIdx); updateTilesUI(); });
ui.margin.addEventListener('change', () => { S.marginIdx = +ui.margin.value; store.set('marginIdx', S.marginIdx); updateTilesUI(); });
ui.skipBlank.addEventListener('change', () => { S.skipBlank = ui.skipBlank.checked; store.set('skipBlank', S.skipBlank); updateTilesUI(); });

/* ---------------------------------------------------------------- modes */
ui.modes.addEventListener('change', e => {
  if (e.target.name !== 'mode') return;
  S.mode = e.target.value;
  for (const p of document.querySelectorAll('[data-panel]')) p.hidden = p.dataset.panel !== S.mode;
  ui.stage.classList.toggle('is-projector', S.mode === 'projector');
  const note = document.getElementById('checkText');
  if (note) note.innerHTML = S.mode === 'projector'
    ? 'Before cutting, set the projector so the pattern’s test square or grid measures true on your mat.'
    : S.mode === 'tiles'
      ? 'Print the assembly map first at <strong>100% / Actual size</strong> and measure its squares. <a href="/sewing-pattern-printer/print-to-scale/">How to check</a>'
      : 'Print at <strong>100% / Actual size</strong> and measure the test square first. <a href="/sewing-pattern-printer/print-to-scale/">How to check</a>';
  updateButtons();
  if (S.mode === 'tiles') updateTilesUI(); else drawOverlay();
});
ui.weight.addEventListener('click', e => {
  const b = e.target.closest('button[data-value]'); if (!b) return;
  for (const x of ui.weight.querySelectorAll('button')) x.setAttribute('aria-pressed', String(x === b));
  S.lineScale = +b.dataset.value; store.set('lineScale', S.lineScale);
});
for (const b of ui.weight.querySelectorAll('button')) b.setAttribute('aria-pressed', String(+b.dataset.value === S.lineScale));

function isPro() { return !!(window.PeakLicense && window.PeakLicense.isPro()); }
function updateButtons() {
  const ready = !!S.pdf && !S.busy;
  const pro = S.mode !== 'pages';
  ui.download.disabled = !ready; ui.openPrint.disabled = !ready;
  const what = S.mode === 'tiles' ? 'tiled PDF' : S.mode === 'projector' ? 'projector PDF' : 'PDF';
  ui.download.textContent = pro && !isPro() ? `Get Pro to download` : `Download ${what}`;
  ui.openPrint.hidden = pro && !isPro();
}

/* ---------------------------------------------------------------- output */
function selectionLabel() {
  const on = S.layers.filter(l => l.id && l.on);
  const sizes = on.filter(l => l.size).map(l => l.name);
  if (sizes.length && sizes.length <= 3) return sizes.join(' + ');
  if (!S.layers.some(l => l.id)) return '';
  return 'selected layers';
}
function outputName() {
  const sel = selectionLabel();
  const extra = S.mode === 'tiles' ? ` - ${PAPERS[S.paper].label} pages` : S.mode === 'projector' ? ' - projector' : '';
  return `${baseName()}${sel ? ' - ' + sel : ''}${extra}.pdf`.replace(/\s+/g, ' ');
}

async function rasterCopy(L, onProgress) {
  const doc = await L.PDFDocument.create();
  const n = S.pdf.numPages;
  const canvas = document.createElement('canvas');
  for (let i = 1; i <= n; i++) {
    const page = await S.pdf.getPage(i);
    const base = page.getViewport({ scale: 1 });
    const dpi = base.width * base.height > 842 * 1191 ? 200 : 300;
    const s = dpi / 72;
    const vp = page.getViewport({ scale: s });
    const W = Math.ceil(vp.width), H = Math.ceil(vp.height), T = 2048;
    const out = doc.addPage([base.width, base.height]);
    const steps = Math.ceil(W / T) * Math.ceil(H / T); let k = 0;
    for (let y = 0; y < H; y += T) for (let x = 0; x < W; x += T) {
      const tw = Math.min(T, W - x), th = Math.min(T, H - y);
      canvas.width = tw; canvas.height = th;
      await page.render({ canvas, viewport: vp, transform: [1, 0, 0, 1, -x, -y], background: '#ffffff', optionalContentConfigPromise: Promise.resolve(S.cfg) }).promise;
      const blob = await new Promise(r => canvas.toBlob(r, 'image/jpeg', 0.92));
      const img = await doc.embedJpg(new Uint8Array(await blob.arrayBuffer()));
      out.drawImage(img, { x: x / s, y: base.height - (y + th) / s, width: tw / s, height: th / s });
      onProgress(((i - 1) + (++k / steps)) / n);
    }
    page.cleanup();
  }
  canvas.width = canvas.height = 1;
  return doc.save({ useObjectStreams: true });
}

async function makePdf() {
  if (!S.pdf || S.busy) return null;
  if (S.mode !== 'pages' && !isPro()) {
    window.PeakLicense && window.PeakLicense.requirePro(S.mode === 'tiles'
      ? 'Tiling large sheets onto A4 or Letter pages is part of Pro: $9 once. Choosing your size and printing the same pages stays free.'
      : 'Projector files are part of Pro: $9 once. Choosing your size and printing the same pages stays free.');
    return null;
  }
  const pdfjs = await loadPdfjs();
  const PF = pdfjs.PermissionFlag;
  if (S.perms && !(S.perms.includes(PF.PRINT) || S.perms.includes(PF.PRINT_HIGH_QUALITY))) {
    toast('Printing is switched off for this PDF, so no copy can be made.');
    return null;
  }
  busy(true, 'Preparing…', 0.02);
  try {
    const L = await loadPdfLib();
    const visibleIds = S.layers.filter(l => l.id && l.on).map(l => l.id);
    const tiles = { ...tileSettings(), skip: new Set(), fileName: S.name, layerNames: S.layers.filter(l => l.id && l.on).map(l => l.name) };
    if (S.mode === 'tiles' && S.skipBlank) {
      for (let i = 0; i < S.sheets.length; i++) {
        busy(true, `Finding empty pages · sheet ${i + 1} of ${S.sheets.length}`, 0.02 + 0.1 * i / S.sheets.length);
        const set = await blankTiles(i, currentPlan(S.sheets[i]));
        for (const k of set) tiles.skip.add(`${i}:${k}`);
      }
    }
    const progress = (f, label) => busy(true, label || 'Writing the PDF…', 0.12 + 0.88 * f);
    const opts = { visibleIds, mode: S.mode, lineScale: S.lineScale, tiles, onProgress: progress };
    let bytes = null, route = 'vector';
    if (!S.perms) {
      try {
        bytes = await buildOutput(L, S.bytes, opts);
        const checkTask = pdfjs.getDocument({ data: bytes.slice(), verbosity: 0 });
        const check = await checkTask.promise;
        const expected = S.mode === 'tiles'
          ? S.sheets.reduce((a, sh, i) => a + currentPlan(sh).n + 1 - [...tiles.skip].filter(k => k.startsWith(i + ':')).length, 0)
          : S.pdf.numPages;
        const n = check.numPages; await checkTask.destroy();
        if (n !== expected) throw new Error(`page count ${n} != ${expected}`);
      } catch (e) {
        console.warn('Vector copy failed, using page images instead:', e);
        bytes = null;
      }
    }
    if (!bytes) {
      route = 'raster';
      busy(true, 'Drawing pages at high resolution…', 0.12);
      const raster = await rasterCopy(L, f => busy(true, 'Drawing pages at high resolution…', 0.12 + 0.6 * f));
      bytes = S.mode === 'pages' ? raster : await buildOutput(L, raster, { ...opts, visibleIds: [], onProgress: f => busy(true, 'Laying out pages…', 0.72 + 0.28 * f) });
    }
    busy(true, 'Done', 1);
    return { blob: new Blob([bytes], { type: 'application/pdf' }), route };
  } catch (e) {
    console.error(e);
    toast('Something went wrong while writing the PDF. Try again, or try the other output.');
    return null;
  } finally {
    busy(false);
  }
}

ui.download.addEventListener('click', async () => {
  const res = await makePdf();
  if (!res) return;
  window.PeakUI.download(res.blob, outputName());
  toast(res.route === 'raster' ? 'Saved (made from 300 dpi page images). Print at 100%.' : 'Saved. Print it at 100% / Actual size.');
});
ui.openPrint.addEventListener('click', async () => {
  if (!S.pdf || S.busy) return;
  if (S.mode !== 'pages' && !isPro()) { makePdf(); return; }
  const win = window.open('', '_blank');
  if (win) { try { win.document.title = 'Preparing your PDF…'; win.document.body.style.font = '16px system-ui, sans-serif'; win.document.body.textContent = 'Preparing your PDF…'; } catch (e) { /* ignore */ } }
  const res = await makePdf();
  if (!res) { if (win) win.close(); return; }
  const url = URL.createObjectURL(res.blob);
  if (win && !win.closed) win.location.href = url;
  else window.PeakUI.download(res.blob, outputName());
  setTimeout(() => URL.revokeObjectURL(url), 120000);
});

/* ---------------------------------------------------------------- wiring */
function pickFile() { ui.file.click(); }
ui.drop.addEventListener('click', e => { if (e.target !== ui.file) pickFile(); });
ui.drop.addEventListener('keydown', e => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); pickFile(); } });
ui.drop.addEventListener('pointerdown', () => { loadPdfjs().catch(() => {}); }, { once: true });
ui.file.addEventListener('change', () => { const f = ui.file.files && ui.file.files[0]; ui.file.value = ''; if (f) openFile(f); });
ui.change.addEventListener('click', pickFile);
for (const ev of ['dragenter', 'dragover']) ui.tool.addEventListener(ev, e => { if ([...(e.dataTransfer?.types || [])].includes('Files')) { e.preventDefault(); ui.drop.classList.add('is-over'); } });
for (const ev of ['dragleave', 'drop']) ui.tool.addEventListener(ev, e => { e.preventDefault(); ui.drop.classList.remove('is-over'); });
ui.tool.addEventListener('drop', e => { const f = e.dataTransfer && e.dataTransfer.files[0]; if (f) openFile(f); });
ui.sample.addEventListener('click', async () => {
  try {
    busy(true, 'Loading the sample…', 0.05);
    const r = await fetch(SAMPLE_URL); if (!r.ok) throw new Error(r.status);
    const bytes = new Uint8Array(await r.arrayBuffer());
    busy(false);
    await openBytes(bytes, 'sample-layered-pattern.pdf');
  } catch (e) { busy(false); toast('The sample couldn’t be loaded.'); }
});
ui.prev.addEventListener('click', () => { if (S.page > 1) { S.page--; S.zoom = 1; renderPreview(); updateSummary(); } });
ui.next.addEventListener('click', () => { if (S.pdf && S.page < S.pdf.numPages) { S.page++; S.zoom = 1; renderPreview(); updateSummary(); } });
const ZOOMS = [1, 1.5, 2, 3, 4, 6, 8];
ui.zoomIn.addEventListener('click', () => { const z = ZOOMS.find(v => v > S.zoom + 0.01); if (z) { S.zoom = z; renderPreview(); } });
ui.zoomOut.addEventListener('click', () => { const z = [...ZOOMS].reverse().find(v => v < S.zoom - 0.01); if (z) { S.zoom = z; renderPreview(); } });
ui.zoomFit.addEventListener('click', () => { if (S.zoom !== 1) { S.zoom = 1; renderPreview(); } });
let resizeTimer = null, lastW = 0, lastH = 0;
new ResizeObserver(() => {
  const w = ui.view.clientWidth, h = ui.view.clientHeight;
  if (Math.abs(w - lastW) < 8 && Math.abs(h - lastH) < 8) return;
  lastW = w; lastH = h;
  clearTimeout(resizeTimer); resizeTimer = setTimeout(() => { if (S.pdf && S.zoom === 1) renderPreview(); }, 160);
}).observe(ui.view);

function initLicense() {
  if (!window.PeakLicense) return;
  window.PeakLicense.setup({
    tool: 'sewing-pattern', productId: SEWING_PRO_PRODUCT_ID, permalink: SEWING_PRO_PERMALINK, buyUrl: SEWING_PRO_BUY_URL,
    pitch: 'Pro tiles A0 and copy-shop sheets onto A4 or US Letter pages and makes projector files. $9 once.',
  });
  window.PeakLicense.onChange(() => updateButtons());
}
ui.outputGroup.classList.add('is-disabled');
initLicense();
updateButtons();
