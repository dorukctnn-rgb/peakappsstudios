/* Fillbook Pro: the service and cost history as a PDF book. Each page is laid out on a canvas in this tab (a cover, the
 * figures, then every cost with its date, odometer reading and amount, and the fuel log if asked for) and added to the
 * PDF as a picture, so every letter prints as it shows on screen. Nothing is uploaded. */
import { PdfWriter, PAPER } from './pdfmini.js';

const DPI = 150;
const C = { tar: '#26301a', tar2: '#1b2312', lime: '#c8ee3a', limeInk: '#1b2208', ink: '#1b1f16', muted: '#596052', line: '#d3d8c3', soft: '#f1f3e8', fuel: '#4e7d12', white: '#ffffff' };
const HEAD = '"Fillbook Display", "Arial Narrow", Arial, sans-serif';
const TEXT = '"Fillbook Text", Arial, sans-serif';
const fillStr = (s, vars) => String(s).replace(/\{(\w+)\}/g, (m, k) => (vars[k] != null ? vars[k] : m));

export async function makeBook(o) {
  const [wPt, hPt] = PAPER[o.paper] || PAPER.A4;
  const k = DPI / 72;
  const canvas = document.createElement('canvas');
  canvas.width = Math.round(wPt * k); canvas.height = Math.round(hPt * k);
  const g = canvas.getContext('2d', { alpha: false });
  const B = o.labels;
  const ML = 48, MR = 48, MT = 64, MB = 62;
  const CW = wPt - ML - MR, BOTTOM = hPt - MB;
  const pdf = new PdfWriter({ title: `${o.title}, ${o.vehicle.name}` });
  // the final test reads back every string the book prints (the pages are pictures); nothing else uses this
  if (o.onText) { const ft = g.fillText.bind(g); g.fillText = (t, x, yy) => { o.onText(String(t)); ft(t, x, yy); }; }
  let y = MT, pageNo = 0;
  const nf = new Intl.NumberFormat(o.locale);

  const font = (size, { head = false, w = head ? 800 : 400 } = {}) => `${w} ${size}px ${head ? HEAD : TEXT}`;
  function blank() {
    g.setTransform(1, 0, 0, 1, 0, 0);
    g.fillStyle = C.white; g.fillRect(0, 0, canvas.width, canvas.height);
    g.setTransform(k, 0, 0, k, 0, 0);
    g.textBaseline = 'alphabetic'; g.textAlign = 'left';
  }
  async function emit(footer = true) {
    pageNo++;
    if (footer) {
      g.fillStyle = C.muted; g.font = font(8.6);
      g.textAlign = 'left'; g.fillText(o.vehicle.name, ML, hPt - 30);
      g.textAlign = 'right'; g.fillText(fillStr(B.page, { n: nf.format(pageNo) }), wPt - MR, hPt - 30);
      g.textAlign = 'left';
      g.strokeStyle = C.line; g.lineWidth = 0.6; g.beginPath(); g.moveTo(ML, hPt - 44); g.lineTo(wPt - MR, hPt - 44); g.stroke();
    }
    const blob = await new Promise(r => canvas.toBlob(r, 'image/jpeg', 0.88));
    pdf.addImagePage(wPt, hPt, { bytes: new Uint8Array(await blob.arrayBuffer()), w: canvas.width, h: canvas.height, filter: 'DCTDecode' });
    if (o.onProgress) o.onProgress(pageNo);
    blank();
    y = MT;
  }
  const room = h => y + h <= BOTTOM;
  function wrap(text, size, maxW, opts) {
    g.font = font(size, opts);
    const words = String(text || '').split(/\s+/).filter(Boolean);
    const lines = [];
    let line = '';
    for (const w of words) {
      const t = line ? `${line} ${w}` : w;
      if (g.measureText(t).width <= maxW || !line) {
        if (g.measureText(t).width > maxW) { // a word longer than the line: cut it
          let cut = t;
          while (cut.length > 1 && g.measureText(cut + '…').width > maxW) cut = cut.slice(0, -1);
          lines.push(cut + '…'); line = '';
        } else line = t;
      } else { lines.push(line); line = w; }
    }
    if (line) lines.push(line);
    return lines;
  }
  function drum(x, yy, text, size, lastLit = true) {
    // a row of odometer drums, x is the left edge; returns the width
    const tile = size * 0.66, gap = size * 0.07, padd = size * 0.12;
    const chars = [...text];
    const w = chars.reduce((a, c) => a + (/\d/.test(c) ? tile : tile * 0.4) + gap, padd * 2 - gap);
    g.fillStyle = '#0d1107'; roundRect(x, yy, w, size * 1.34, size * 0.14); g.fill();
    let cx = x + padd;
    chars.forEach((c, i) => {
      const digit = /\d/.test(c);
      if (!digit) { g.fillStyle = '#9aa87f'; g.font = font(size, { head: true, w: 700 }); g.textAlign = 'center'; g.fillText(c === ' ' || c === ' ' || c === ' ' || c === ' ' ? '' : c, cx + tile * 0.2, yy + size * 1.08); g.textAlign = 'left'; cx += tile * 0.4 + gap; return; }
      const gr = g.createLinearGradient(0, yy + size * 0.1, 0, yy + size * 1.24);
      const lit = lastLit && i === chars.length - 1;
      if (lit) { gr.addColorStop(0, '#e6ff74'); gr.addColorStop(0.49, '#cdf23e'); gr.addColorStop(0.51, '#a8c921'); gr.addColorStop(1, '#c5e535'); }
      else { gr.addColorStop(0, '#323f21'); gr.addColorStop(0.49, '#1f2713'); gr.addColorStop(0.51, '#10150a'); gr.addColorStop(1, '#232c16'); }
      g.fillStyle = gr; roundRect(cx, yy + size * 0.1, tile, size * 1.14, size * 0.08); g.fill();
      g.fillStyle = lit ? C.limeInk : '#f2f6e4'; g.font = font(size, { head: true, w: 700 }); g.textAlign = 'center';
      g.fillText(c, cx + tile / 2, yy + size * 1.02); g.textAlign = 'left';
      cx += tile + gap;
    });
    return w;
  }
  function roundRect(x, yy, w, h, r) { g.beginPath(); g.roundRect ? g.roundRect(x, yy, w, h, r) : g.rect(x, yy, w, h); }

  /* ---- cover ---- */
  blank();
  g.fillStyle = C.tar; g.fillRect(0, 0, wPt, hPt * 0.58);
  g.fillStyle = C.lime; g.fillRect(ML, 54, 56, 9);
  g.fillStyle = '#e9f0d6'; g.font = font(15, { head: true }); g.fillText('Fillbook', ML, 92);
  let cy = 190;
  g.fillStyle = C.white;
  for (const line of wrap(o.title, 52, CW, { head: true })) { g.font = font(52, { head: true }); g.fillText(line, ML, cy); cy += 52; }
  cy += 14;
  g.fillStyle = C.lime;
  for (const line of wrap(o.vehicle.name, 34, CW, { head: true })) { g.font = font(34, { head: true }); g.fillText(line, ML, cy); cy += 36; }
  g.fillStyle = '#d7e1bf'; g.font = font(14);
  if (o.vehicle.sub) { g.fillText(o.vehicle.sub, ML, cy + 6); cy += 22; }
  const idLine = [o.vehicle.plate ? `${B.plate}: ${o.vehicle.plate}` : '', o.vehicle.vin ? `${B.vin}: ${o.vehicle.vin}` : ''].filter(Boolean).join('    ');
  if (idLine) { g.fillText(idLine, ML, cy + 8); cy += 22; }
  g.fillStyle = C.ink; g.font = font(11.5);
  let by = hPt * 0.58 + 52;
  g.fillText(o.period, ML, by); by += 17;
  if (o.odoLine) { g.fillText(o.odoLine, ML, by); by += 17; }
  // the headline figures in drums
  const heads = [o.figures[0], o.figures[6]].filter(Boolean);
  by += 20;
  for (const [label, value] of heads) {
    g.fillStyle = C.muted; g.font = font(10.5); g.fillText(label, ML, by);
    const m = String(value).match(/^([\d\s  .,]+)(.*)$/);
    const num = m ? m[1].trim() : value, rest = m ? m[2].trim() : '';
    const w = drum(ML, by + 8, num, 30);
    g.fillStyle = C.muted; g.font = font(14, { head: true }); g.fillText(rest, ML + w + 8, by + 8 + 36);
    by += 78;
  }
  g.fillStyle = C.muted; g.font = font(9.4);
  g.fillText(o.made, ML, hPt - 52); g.fillText(B.by, ML, hPt - 38);
  await emit(false);

  /* ---- the figures ---- */
  g.fillStyle = C.ink; g.font = font(30, { head: true }); g.fillText(B.summary, ML, y + 22); y += 46;
  const colW = (CW - 2 * 22) / 3;
  o.figures.forEach(([label, value], i) => {
    const cx = ML + (i % 3) * (colW + 22), cyy = y + Math.floor(i / 3) * 54;
    g.fillStyle = C.muted; g.font = font(9.4); g.fillText(label, cx, cyy);
    g.fillStyle = C.ink; g.font = font(21, { head: true, w: 700 }); g.fillText(value, cx, cyy + 24);
    g.strokeStyle = C.line; g.lineWidth = 0.6; g.beginPath(); g.moveTo(cx, cyy + 34); g.lineTo(cx + colW, cyy + 34); g.stroke();
  });
  y += Math.ceil(o.figures.length / 3) * 54 + 20;
  const table = async (title, cols, rows, aligns, widths) => {
    if (!room(28 + 21 + rows.length * 18 + 12) && rows.length * 18 + 60 < BOTTOM - MT) await emit();
    g.fillStyle = C.ink; g.font = font(19, { head: true }); g.fillText(title, ML, y + 14); y += 28;
    const xs = []; let acc = ML; for (const wd of widths) { xs.push(acc); acc += wd * CW; }
    g.fillStyle = C.muted; g.font = font(8.8, { w: 700 });
    cols.forEach((c, i) => { g.textAlign = aligns[i] === 'r' ? 'right' : 'left'; g.fillText(c, aligns[i] === 'r' ? xs[i] + widths[i] * CW : xs[i], y); });
    g.textAlign = 'left'; y += 6;
    g.strokeStyle = C.ink; g.lineWidth = 0.8; g.beginPath(); g.moveTo(ML, y); g.lineTo(wPt - MR, y); g.stroke(); y += 15;
    for (const r of rows) {
      if (!room(18)) await emit();
      g.fillStyle = C.ink; g.font = font(10.6);
      r.forEach((c, i) => { g.textAlign = aligns[i] === 'r' ? 'right' : 'left'; g.font = i === 0 ? font(10.6, { w: 700 }) : font(10.6, { head: aligns[i] === 'r', w: aligns[i] === 'r' ? 600 : 400 }); g.fillText(c, aligns[i] === 'r' ? xs[i] + widths[i] * CW : xs[i], y); });
      g.textAlign = 'left';
      g.strokeStyle = C.line; g.lineWidth = 0.5; g.beginPath(); g.moveTo(ML, y + 6); g.lineTo(wPt - MR, y + 6); g.stroke();
      y += 18;
    }
    y += 12;
  };
  if (o.yearRows.length) await table(B.byYear, o.yearCols, o.yearRows, ['l', 'r', 'r', 'r', 'r'], [0.14, 0.2, 0.2, 0.2, 0.26]);
  if (o.catRows.length) await table(B.byCat, [B.cols[2], '#', B.cols[3]], o.catRows, ['l', 'r', 'r'], [0.55, 0.15, 0.3]);
  g.fillStyle = C.muted; g.font = font(9.2);
  for (const line of wrap(o.noteLine, 9.2, CW)) { if (!room(14)) await emit(); g.fillText(line, ML, y + 4); y += 13; }
  await emit();

  /* ---- the history ---- */
  const dateW = 84, amtW = 96, whatX = ML + dateW + 8, whatW = CW - dateW - amtW - 16;
  const head = () => {
    g.fillStyle = C.ink; g.font = font(26, { head: true }); g.fillText(B.history, ML, y + 18); y += 38;
    g.fillStyle = C.muted; g.font = font(8.8, { w: 700 });
    g.fillText(B.cols[0], ML, y); g.fillText(B.cols[2], whatX, y); g.textAlign = 'right'; g.fillText(B.cols[3], wPt - MR, y); g.textAlign = 'left'; y += 6;
    g.strokeStyle = C.ink; g.lineWidth = 0.8; g.beginPath(); g.moveTo(ML, y); g.lineTo(wPt - MR, y); g.stroke(); y += 12;
  };
  if (!o.history.length) {
    head();
    g.fillStyle = C.muted; g.font = font(11); g.fillText(o.emptyLine, ML, y + 8); y += 30;
  } else {
    head();
    let curYear = null;
    const finishYear = async () => {
      if (curYear == null) return;
      if (!room(26)) { await emit(); head(); }
      g.fillStyle = C.soft; g.fillRect(ML, y - 2, CW, 22);
      g.fillStyle = C.ink; g.font = font(11, { w: 700 }); g.fillText(fillStr(B.yearTotal, { y: curYear }), whatX, y + 13);
      g.textAlign = 'right'; g.font = font(13, { head: true, w: 700 }); g.fillText(o.yearTotals[curYear] || '', wPt - MR, y + 14); g.textAlign = 'left';
      y += 34;
    };
    for (const r of o.history) {
      if (r.year !== curYear) {
        await finishYear();
        curYear = r.year;
        if (!room(70)) { await emit(); head(); }
        g.fillStyle = C.tar; g.fillRect(ML, y, 5, 20);
        g.fillStyle = C.ink; g.font = font(17, { head: true }); g.fillText(String(r.year), ML + 12, y + 16); y += 30;
      }
      const whatLines = wrap(r.what, 10.6, whatW, { w: 700 });
      const sub = wrap([r.cat, r.notes].filter(Boolean).join(' · '), 8.8, whatW).slice(0, 3);
      const h = Math.max(30, whatLines.length * 13 + sub.length * 11 + 12);
      if (!room(h)) { await emit(); head(); g.fillStyle = C.tar; g.fillRect(ML, y, 5, 20); g.fillStyle = C.ink; g.font = font(17, { head: true }); g.fillText(`${r.year}`, ML + 12, y + 16); y += 30; }
      g.fillStyle = C.ink; g.font = font(11, { head: true, w: 700 }); g.fillText(r.date, ML, y + 11);
      if (r.odo) { g.fillStyle = C.muted; g.font = font(8.8); g.fillText(r.odo, ML, y + 23); }
      let ty = y + 11;
      g.fillStyle = C.ink; g.font = font(10.6, { w: 700 });
      for (const l of whatLines) { g.fillText(l, whatX, ty); ty += 13; }
      g.fillStyle = C.muted; g.font = font(8.8);
      for (const l of sub) { g.fillText(l, whatX, ty); ty += 11; }
      g.fillStyle = r.value < 0 ? C.fuel : C.ink; g.font = font(13, { head: true, w: 700 }); g.textAlign = 'right'; g.fillText(r.amount, wPt - MR, y + 12); g.textAlign = 'left';
      y += h;
      g.strokeStyle = C.line; g.lineWidth = 0.5; g.beginPath(); g.moveTo(ML, y - 5); g.lineTo(wPt - MR, y - 5); g.stroke();
    }
    await finishYear();
  }
  await emit();

  /* ---- the fuel log ---- */
  if (o.fuelRows.length) {
    const widths = [0.2, 0.16, 0.2, 0.15, 0.14, 0.15];
    const xs = []; let acc = ML; for (const wd of widths) { xs.push(acc); acc += wd * CW; }
    const fhead = () => {
      g.fillStyle = C.ink; g.font = font(26, { head: true }); g.fillText(B.fuelLog, ML, y + 18); y += 38;
      g.fillStyle = C.muted; g.font = font(8.8, { w: 700 });
      B.fuelCols.forEach((c, i) => { g.textAlign = i ? 'right' : 'left'; g.fillText(c, i ? xs[i] + widths[i] * CW : xs[i], y); });
      g.textAlign = 'left'; y += 6;
      g.strokeStyle = C.ink; g.lineWidth = 0.8; g.beginPath(); g.moveTo(ML, y); g.lineTo(wPt - MR, y); g.stroke(); y += 14;
    };
    fhead();
    for (const r of o.fuelRows) {
      if (!room(16)) { await emit(); fhead(); }
      r.forEach((c, i) => { g.fillStyle = C.ink; g.font = i ? font(10.2, { head: true, w: 600 }) : font(10, { w: 700 }); g.textAlign = i ? 'right' : 'left'; g.fillText(c, i ? xs[i] + widths[i] * CW : xs[i], y); });
      g.textAlign = 'left';
      g.strokeStyle = C.line; g.lineWidth = 0.4; g.beginPath(); g.moveTo(ML, y + 5); g.lineTo(wPt - MR, y + 5); g.stroke();
      y += 15.5;
    }
    await emit();
  }
  return { blob: pdf.finish(), pages: pdf.pages };
}
