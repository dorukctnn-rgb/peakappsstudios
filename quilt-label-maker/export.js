/* Quilt Label Maker: print files. Each label is drawn on a canvas at print resolution from the same
 * display list as the preview, then placed at its exact size in a PDF (pdf-lib, loaded on first export). */
import { layoutLabel, drawCanvas, fontsFor, clearMeasureCache } from './label.js';
import { planSheets, SHEETS, safeDpi, fmtSize, fmtLen } from './pack.js';

const VENDOR = new URL('./vendor/', import.meta.url);
export const PDF_DPI = 400;   // fabric shows no difference above this; EQ recommends 150-200 dpi for photos
export const PNG_DPI = 300;

let pdfLibP = null;
export function loadPdfLib() {
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

export async function ensureFonts(letteringIds) {
  const list = [...new Set(letteringIds.flatMap(fontsFor))];
  const before = list.map(f => document.fonts.check(f));
  await Promise.all(list.map(f => document.fonts.load(f, 'AaQq’®')));
  if (before.some(b => !b)) clearMeasureCache();
}

/** Render one label piece (finished size + allowance on every side) to a canvas. */
export function renderLabelCanvas(spec, allowance, dpi, { mirror = false } = {}) {
  const pw = spec.w + 2 * allowance, ph = spec.h + 2 * allowance;
  const d = safeDpi(pw, ph, dpi);
  const c = document.createElement('canvas');
  c.width = Math.round((pw / 72) * d); c.height = Math.round((ph / 72) * d);
  const ctx = c.getContext('2d');
  ctx.fillStyle = '#ffffff'; ctx.fillRect(0, 0, c.width, c.height);
  const k = c.width / pw;
  if (mirror) { ctx.translate(c.width, 0); ctx.scale(-1, 1); }
  ctx.scale(k, c.height / ph);
  ctx.translate(allowance, allowance);
  const res = layoutLabel(spec);
  drawCanvas(ctx, res);
  return { canvas: c, res, dpi: d };
}

/* ------------------------------------------------------------------ PNG with a pHYs chunk so apps place it at true size */
const CRC = (() => { const t = new Uint32Array(256); for (let n = 0; n < 256; n++) { let c = n; for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1; t[n] = c >>> 0; } return t; })();
function crc32(bytes) { let c = 0xffffffff; for (let i = 0; i < bytes.length; i++) c = CRC[(c ^ bytes[i]) & 255] ^ (c >>> 8); return (c ^ 0xffffffff) >>> 0; }
export function withDpi(png, dpi) {
  const ppm = Math.round(dpi / 0.0254);
  const chunk = new Uint8Array(21);
  const dv = new DataView(chunk.buffer);
  dv.setUint32(0, 9); chunk.set([0x70, 0x48, 0x59, 0x73], 4); // "pHYs"
  dv.setUint32(8, ppm); dv.setUint32(12, ppm); chunk[16] = 1;
  dv.setUint32(17, crc32(chunk.subarray(4, 17)));
  const ihdrEnd = 8 + 25; // signature + IHDR (4 len + 4 type + 13 data + 4 crc)
  const out = new Uint8Array(png.length + chunk.length);
  out.set(png.subarray(0, ihdrEnd), 0); out.set(chunk, ihdrEnd); out.set(png.subarray(ihdrEnd), ihdrEnd + chunk.length);
  return out;
}
export async function canvasPng(canvas) {
  const blob = await new Promise((res, rej) => canvas.toBlob(b => (b ? res(b) : rej(new Error('Canvas export failed'))), 'image/png'));
  return new Uint8Array(await blob.arrayBuffer());
}
export async function buildPng(spec, allowance, { mirror = false } = {}) {
  await ensureFonts([spec.lettering]);
  const { canvas, dpi } = renderLabelCanvas(spec, allowance, PNG_DPI, { mirror });
  const png = withDpi(await canvasPng(canvas), dpi);
  return { bytes: png, width: canvas.width, height: canvas.height, dpi };
}

/* ------------------------------------------------------------------ PDF helpers */
const GREY = [0.55, 0.55, 0.55];
function cutAndFold(PDFLib, page, x, y, w, h, a) {
  const { rgb } = PDFLib;
  page.drawRectangle({ x, y, width: w, height: h, borderColor: rgb(...GREY), borderWidth: 0.5 });
  if (a > 0) {
    // Short fold ticks inside the allowance, in line with the finished edges; they end up folded under.
    const t = Math.min(a * 0.7, 9), col = rgb(0.7, 0.7, 0.7), th = 0.4;
    const fx = [x + a, x + w - a], fy = [y + a, y + h - a];
    for (const X of fx) { page.drawLine({ start: { x: X, y }, end: { x: X, y: y + t }, thickness: th, color: col }); page.drawLine({ start: { x: X, y: y + h }, end: { x: X, y: y + h - t }, thickness: th, color: col }); }
    for (const Y of fy) { page.drawLine({ start: { x, y: Y }, end: { x: x + t, y: Y }, thickness: th, color: col }); page.drawLine({ start: { x: x + w, y: Y }, end: { x: x + w - t, y: Y }, thickness: th, color: col }); }
  }
}
function checkSquare(PDFLib, page, font, x, y, unit) {
  const { rgb } = PDFLib;
  const s = unit === 'cm' ? 72 * 2 / 2.54 : 72;
  page.drawRectangle({ x, y, width: s, height: s, borderColor: rgb(0.35, 0.35, 0.35), borderWidth: 0.5 });
  page.drawText(unit === 'cm' ? '2 cm' : '1 in', { x: x + 5, y: y + 5, size: 7, font, color: rgb(0.35, 0.35, 0.35) });
  return s;
}
function meta(doc, title, subject) {
  doc.setTitle(title); doc.setSubject(subject); doc.setCreator('Peak Apps Quilt Label Maker (peakappsstudio.com/quilt-label-maker/)'); doc.setProducer('pdf-lib');
}
const allowanceText = (a, unit) => (a > 0 ? `${fmtLen(a, unit)} fold-under allowance` : 'no fold-under allowance');

/** Free: one label at true size on a Letter or A4 page. */
export async function buildSinglePdf(spec, { page = 'letter', allowance = 18, mirror = false, unit = 'in', square = true } = {}) {
  const [PDFLib] = await Promise.all([loadPdfLib(), ensureFonts([spec.lettering])]);
  const { PDFDocument, StandardFonts, rgb } = PDFLib;
  const S = SHEETS[page] || SHEETS.letter;
  const pw = spec.w + 2 * allowance, ph = spec.h + 2 * allowance;
  if (pw > S.w - 36 || ph > S.h - 36) throw new Error(`A ${fmtSize(spec.w, spec.h, unit)} label doesn’t fit on ${S.name}.`);
  const doc = await PDFDocument.create();
  const size = fmtSize(spec.w, spec.h, unit);
  meta(doc, `Quilt label ${size}`, `Finished label ${size}, ${allowanceText(allowance, unit)}. Print at 100% (Actual size).`);
  const pg = doc.addPage([S.w, S.h]);
  const font = await doc.embedFont(StandardFonts.Helvetica);
  const { canvas, dpi } = renderLabelCanvas(spec, allowance, PDF_DPI, { mirror });
  const img = await doc.embedPng(await canvasPng(canvas));
  const x = (S.w - pw) / 2;
  const topGap = ph + 72 + 110 <= S.h ? 72 : (S.h - ph) / 2;
  const y = S.h - topGap - ph;
  pg.drawImage(img, { x, y, width: pw, height: ph });
  cutAndFold(PDFLib, pg, x, y, pw, ph, allowance);
  const lines = [
    `Quilt label, ${size} finished, ${allowanceText(allowance, unit)}${mirror ? ', mirrored for transfer paper' : ''}.`,
    'Print at 100% (Actual size) and check the square first. Cut on the gray line.',
  ];
  let ty = y - 22;
  if (ty > 60) {
    lines.forEach((t, i) => pg.drawText(t, { x, y: ty - i * 11, size: 8, font, color: rgb(0.4, 0.4, 0.4) }));
    if (square) {
      const sq = unit === 'cm' ? 72 * 2 / 2.54 : 72;
      if (ty - 30 - sq > 30) checkSquare(PDFLib, pg, font, x, ty - 30 - sq, unit);
    }
  }
  const bytes = await doc.save();
  return { bytes, dpi, pages: 1, placed: [{ x, y, w: pw, h: ph }] };
}

/** Pro: as many labels as fit on each sheet; `specs` is one spec per label (the same object repeated for a full sheet). */
export async function buildSheetPdf(specs, { sheet = 'letter', margin = 18, gap = 0, allowance = 18, mirror = false, unit = 'in', onProgress } = {}) {
  const [PDFLib] = await Promise.all([loadPdfLib(), ensureFonts([...new Set(specs.map(s => s.lettering))])]);
  const { PDFDocument, StandardFonts, rgb, degrees } = PDFLib;
  const first = specs[0];
  const plan = planSheets({ sheet, margin, labelW: first.w, labelH: first.h, allowance, gap, labels: specs.length });
  if (!plan.count) throw new Error('This label is bigger than the printable area of the sheet.');
  const S = SHEETS[sheet] || SHEETS.letter;
  const doc = await PDFDocument.create();
  const size = fmtSize(first.w, first.h, unit);
  meta(doc, `Quilt labels ${size}`, `${specs.length} labels, ${size} finished, ${allowanceText(allowance, unit)}, ${plan.count} per ${S.name} sheet.`);
  const font = await doc.embedFont(StandardFonts.Helvetica);
  const cache = new Map();
  const pw = first.w + 2 * allowance, ph = first.h + 2 * allowance;
  let done = 0;
  const placed = [];
  for (let p = 0; p < plan.pages; p++) {
    const pg = doc.addPage([S.w, S.h]);
    const chunk = specs.slice(p * plan.count, (p + 1) * plan.count);
    for (let i = 0; i < chunk.length; i++) {
      const spec = chunk[i], cell = plan.cells[i];
      const key = JSON.stringify(spec);
      let img = cache.get(key);
      if (!img) {
        const { canvas } = renderLabelCanvas(spec, allowance, PDF_DPI, { mirror });
        img = await doc.embedPng(await canvasPng(canvas));
        cache.set(key, img);
      }
      const yb = S.h - cell.y - cell.h;
      if (cell.rot) pg.drawImage(img, { x: cell.x + cell.w, y: yb, width: pw, height: ph, rotate: degrees(90) });
      else pg.drawImage(img, { x: cell.x, y: yb, width: pw, height: ph });
      cutAndFold(PDFLib, pg, cell.x, yb, cell.w, cell.h, allowance);
      placed.push({ page: p, x: cell.x, y: yb, w: cell.w, h: cell.h, rot: cell.rot });
      done++;
      if (onProgress) onProgress(done, specs.length);
      if (done % 4 === 0) await new Promise(r => setTimeout(r, 0));
    }
    const band = S.h - (plan.oy + plan.usedH);
    if (band >= 26) {
      const t = `Sheet ${p + 1} of ${plan.pages}. Labels ${size} finished, ${allowanceText(allowance, unit)}${mirror ? ', mirrored' : ''}. Print at 100% (Actual size). Cut on the gray lines.`;
      const tw = font.widthOfTextAtSize(t, 7);
      pg.drawText(t, { x: Math.max(plan.ox, (S.w - tw) / 2), y: band / 2 - 2.5, size: 7, font, color: rgb(0.45, 0.45, 0.45) });
    }
  }
  const bytes = await doc.save();
  return { bytes, pages: plan.pages, perSheet: plan.count, placed };
}
