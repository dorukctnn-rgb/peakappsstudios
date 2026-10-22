/* Dayfold Pro: the journal as a PDF book. Each page is laid out on a canvas in this tab (cover, a page for each year
 * with its pixels, then every entry in date order with its mood, activities, title, note and photos) and added to
 * the PDF as a picture, so every language and every emoji prints as it shows on screen. Nothing is uploaded. */
import { PdfWriter, PAPER } from './pdfmini.js';
import { MOOD, FONT_SANS, FONT_SERIF } from './poster.js';

const DPI = { A5: 180, A4: 150 };
const decode = s => s.replace(/&(amp|lt|gt|quot|#39);/g, (m, e) => ({ amp: '&', lt: '<', gt: '>', quot: '"', '#39': "'" }[e]));

// the safe note HTML (only b, i, u, s and line breaks) as runs of text with a style
export function runsOf(html) {
  const out = [];
  const st = { b: false, i: false, u: false, s: false };
  const re = /<(\/?)(b|i|u|s)>|(\n)|([^<\n]+)/g;
  let m;
  while ((m = re.exec(html || ''))) {
    if (m[2]) st[m[2]] = !m[1];
    else if (m[3]) out.push({ br: true });
    else out.push({ text: decode(m[4]), b: st.b, i: st.i, u: st.u, s: st.s });
  }
  return out;
}

export async function makeBook(data, o) {
  const [wPt, hPt] = PAPER[o.paper] || PAPER.A5;
  const k = (DPI[o.paper] || 150) / 72;
  const canvas = document.createElement('canvas');
  canvas.width = Math.round(wPt * k); canvas.height = Math.round(hPt * k);
  const g = canvas.getContext('2d', { alpha: false });
  const big = o.paper === 'A4' ? 1.18 : 1;
  const S = { body: 10.5 * big, lead: 15 * big, small: 8.4 * big, title: 12.5 * big, head: 9.6 * big };
  const ML = 46 * big, MR = 42 * big, MT = 52 * big, MB = 56 * big;
  const CW = wPt - ML - MR, BOTTOM = hPt - MB;
  const pdf = new PdfWriter({ title: o.title });
  const loc = o.locale;
  const fDay = new Intl.DateTimeFormat(loc, { weekday: 'long', day: 'numeric', month: 'long', timeZone: 'UTC' });
  const fMonth = new Intl.DateTimeFormat(loc, { month: 'long', year: 'numeric', timeZone: 'UTC' });
  const fMonthShort = new Intl.DateTimeFormat(loc, { month: 'narrow', timeZone: 'UTC' });
  const moodName = new Map(data.moodNames.map(([id, name]) => [id, name]));
  const tagName = new Map(data.tagNames);
  const nf = new Intl.NumberFormat(loc);
  let y = MT, pageNo = 0, running = '', headed = false;

  const font = (size, { b = false, i = false, serif = true, w } = {}) => `${i ? 'italic ' : ''}${w || (b ? 700 : 400)} ${size}px ${serif ? FONT_SERIF : FONT_SANS}`;
  function blank() {
    g.setTransform(1, 0, 0, 1, 0, 0);
    g.fillStyle = '#ffffff'; g.fillRect(0, 0, canvas.width, canvas.height);
    g.setTransform(k, 0, 0, k, 0, 0);
    g.textBaseline = 'alphabetic'; g.textAlign = 'left';
  }
  async function emit(numbered = true) {
    pageNo++;
    if (numbered) {
      g.fillStyle = '#8a8496'; g.font = font(S.small, { serif: false });
      g.textAlign = 'center'; g.fillText(nf.format(pageNo), wPt / 2, hPt - 28 * big);
      if (running && !headed) { g.textAlign = 'left'; g.fillText(running, ML, 30 * big); }
      g.textAlign = 'left';
    }
    if (o.onPageCanvas) await o.onPageCanvas(canvas, pageNo);
    const blob = await new Promise(r => canvas.toBlob(r, 'image/jpeg', 0.86));
    pdf.addImagePage(wPt, hPt, { bytes: new Uint8Array(await blob.arrayBuffer()), w: canvas.width, h: canvas.height, filter: 'DCTDecode' });
    if (o.onProgress) o.onProgress(pageNo);
    blank();
    y = MT;
    headed = false;
  }
  const room = h => y + h <= BOTTOM;
  async function need(h) { if (!room(h) && y > MT) await emit(); }

  function wrap(runs, size, maxW, serif = true) {
    const lines = [];
    let line = [], x = 0;
    const push = () => { lines.push(line); line = []; x = 0; };
    for (const r of runs) {
      if (r.br) { push(); continue; }
      const f = font(size, { b: r.b, i: r.i, serif });
      g.font = f;
      for (const part of r.text.split(/(\s+)/)) {
        if (!part) continue;
        const space = /^\s+$/.test(part);
        if (space && !line.length) continue;
        let w = g.measureText(part).width;
        if (!space && x + w > maxW && line.length) { push(); }
        if (!space && w > maxW) {
          // a word longer than the line (a URL, or text with no spaces): break it by characters
          let chunk = '';
          for (const ch of Array.from(part)) {
            const cw = g.measureText(chunk + ch).width;
            if (x + cw > maxW && chunk) { line.push({ t: chunk, f, x, u: r.u, s: r.s }); push(); chunk = ''; }
            chunk += ch;
          }
          w = g.measureText(chunk).width;
          line.push({ t: chunk, f, x, u: r.u, s: r.s }); x += w;
          continue;
        }
        if (space) { if (x + w <= maxW) { line.push({ t: ' ', f, x }); x += g.measureText(' ').width; } continue; }
        line.push({ t: part, f, x, u: r.u, s: r.s }); x += w;
      }
    }
    if (line.length) push();
    // trailing spaces off, empty lines kept as paragraph space
    return lines.map(l => { while (l.length && l[l.length - 1].t === ' ') l.pop(); return l; });
  }
  function drawLine(l, x0, base, color) {
    g.fillStyle = color;
    for (const p of l) {
      g.font = p.f; g.fillText(p.t, x0 + p.x, base);
      if (p.u || p.s) {
        const w = g.measureText(p.t).width;
        g.fillRect(x0 + p.x, p.u ? base + 1.6 : base - S.body * 0.3, w, 0.6);
      }
    }
  }

  // beside a grid: each mood level with its names and how many days had it
  const levelNames = lv => [...new Set(data.moodNames.filter(m => m[2] === lv).map(m => m[1]))].join(', ');
  function legend(grid, x, top, width) {
    const n = [0, 0, 0, 0, 0, 0];
    for (const col of grid) for (const v of col) if (v > 0) n[v]++;
    let yy = top;
    for (let lv = 5; lv >= 1; lv--) {
      g.fillStyle = MOOD[lv]; g.fillRect(x, yy, 9 * big, 9 * big);
      g.fillStyle = '#262033'; g.font = font(8.6 * big, { serif: false, w: 700 });
      const label = wrap([{ text: levelNames(lv) || '' }], 8.6 * big, width - 16 * big, false);
      let ly = yy + 8 * big;
      for (const l of label.slice(0, 2)) { drawLine(l, x + 15 * big, ly, '#262033'); ly += 11 * big; }
      g.fillStyle = '#6b6577'; g.font = font(8.4 * big, { serif: false });
      g.fillText(o.labels.days.replace('{n}', nf.format(n[lv])), x + 15 * big, ly + 1 * big);
      yy = ly + 18 * big;
    }
  }
  function pixelGrid(grid, x, top, cellPitch) {
    const cell = cellPitch * 0.82;
    g.font = font(cellPitch * 0.8, { serif: false, w: 700 });
    g.fillStyle = '#8a8496'; g.textAlign = 'center';
    for (let m = 0; m < 12; m++) g.fillText(fMonthShort.format(new Date(Date.UTC(2024, m, 1))), x + m * cellPitch + cell / 2, top - cellPitch * 0.4);
    g.textAlign = 'left';
    for (let m = 0; m < 12; m++) for (let d = 0; d < 31; d++) {
      const v = grid[m][d];
      if (v < 0) continue;
      const cx = x + m * cellPitch, cy = top + d * cellPitch;
      if (v > 0) { g.fillStyle = MOOD[v]; g.fillRect(cx, cy, cell, cell); }
      else { g.strokeStyle = '#dcdad2'; g.lineWidth = 0.5; g.strokeRect(cx + 0.25, cy + 0.25, cell - 0.5, cell - 0.5); }
    }
  }

  blank();
  const entries = data.entries;
  if (!entries.length) throw new Error('empty');
  const years = [...new Set(entries.map(e => e.y))].sort((a, b) => a - b);

  // cover
  g.fillStyle = '#262033';
  g.font = font(30 * big, { serif: true, w: 600 });
  const titleLines = wrap([{ text: o.title }], 30 * big, CW);
  let ty = hPt * 0.22;
  for (const l of titleLines) { drawLine(l, ML, ty, '#262033'); ty += 36 * big; }
  g.font = font(15 * big, { serif: false, w: 700 }); g.fillStyle = '#5b5668';
  g.fillText(years.length > 1 ? `${years[0]}\u2013${years[years.length - 1]}` : String(years[0]), ML, ty + 6 * big);
  g.font = font(11 * big, { serif: false }); g.fillText(o.labels.entries.replace('{n}', nf.format(entries.length)), ML, ty + 26 * big);
  const coverGrid = data.pixels[years[years.length - 1]];
  if (coverGrid) {
    const pitch = Math.min(CW / 18, (BOTTOM - ty - 110 * big) / 31);
    pixelGrid(coverGrid, ML, ty + 70 * big, pitch);
    legend(coverGrid, ML + 12 * pitch + 22 * big, ty + 66 * big, CW - 12 * pitch - 22 * big);
  }
  g.font = font(8 * big, { serif: false }); g.fillStyle = '#8a8496';
  g.fillText(o.labels.from, ML, hPt - 30 * big);
  await emit(false);

  let curY = null, curM = null;
  for (let n = 0; n < entries.length; n++) {
    const e = entries[n];
    if (e.y !== curY) {
      // a page for the year: its number and its pixels
      if (y > MT) await emit();
      curY = e.y; curM = null; running = '';
      g.fillStyle = '#262033'; g.font = font(54 * big, { serif: false, w: 800 });
      g.fillText(String(e.y), ML, MT + 50 * big);
      const count = entries.filter(x => x.y === e.y).length;
      g.font = font(11 * big, { serif: false }); g.fillStyle = '#5b5668';
      g.fillText(o.labels.entries.replace('{n}', nf.format(count)), ML, MT + 72 * big);
      const pitch = Math.min(CW / 17, (BOTTOM - MT - 110 * big) / 31);
      if (data.pixels[e.y]) {
        pixelGrid(data.pixels[e.y], ML, MT + 110 * big, pitch);
        legend(data.pixels[e.y], ML + 12 * pitch + 22 * big, MT + 106 * big, CW - 12 * pitch - 22 * big);
      }
      await emit();
    }
    if (e.m !== curM) {
      curM = e.m;
      running = fMonth.format(new Date(Date.UTC(e.y, e.m, 1)));
      await need(70 * big);
      if (y > MT) y += 10 * big;
      g.fillStyle = '#262033'; g.font = font(19 * big, { serif: true, w: 600 });
      g.fillText(running, ML, y + 19 * big);
      headed = true;
      g.fillStyle = '#e2702f'; g.fillRect(ML, y + 27 * big, 28 * big, 2 * big);
      y += 44 * big;
    }
    // what belongs together: the date line, activities, the title and the first lines of the note
    const acts = e.tags.map(t => tagName.get(t)).filter(Boolean).join(', ');
    const actLines = acts ? wrap([{ text: acts }], S.small, CW - 14 * big, false) : [];
    const titleL = e.title ? wrap([{ text: e.title, b: true }], S.title, CW) : [];
    const noteL = e.html ? wrap(runsOf(e.html), S.body, CW) : [];
    const headH = 20 * big + actLines.length * S.small * 1.45 + (titleL.length ? titleL.length * S.title * 1.3 + 4 * big : 0);
    await need(headH + Math.min(2, noteL.length) * S.lead + 6 * big);
    const hh = String(e.h).padStart(2, '0') + ':' + String(e.mi).padStart(2, '0');
    g.font = font(S.head, { serif: false, w: 700 }); g.fillStyle = '#262033';
    g.fillText(fDay.format(new Date(Date.UTC(e.y, e.m, e.d))), ML, y + S.head);
    const dayW = g.measureText(fDay.format(new Date(Date.UTC(e.y, e.m, e.d)))).width;
    g.font = font(S.head, { serif: false }); g.fillStyle = '#5b5668';
    let mx = ML + dayW + 10 * big;
    g.fillText(hh, mx, y + S.head);
    mx += g.measureText(hh).width + 12 * big;
    if (e.score) {
      g.fillStyle = MOOD[e.score]; g.beginPath(); g.arc(mx + 4 * big, y + S.head - 3.2 * big, 4 * big, 0, Math.PI * 2); g.fill();
      g.fillStyle = '#262033'; g.font = font(S.head, { serif: false, w: 700 });
      g.fillText(moodName.get(e.mood) || '', mx + 12 * big, y + S.head);
    }
    y += 18 * big;
    for (const l of actLines) { drawLine(l, ML, y + S.small, '#6b6577'); y += S.small * 1.45; }
    if (titleL.length) { y += 4 * big; for (const l of titleL) { drawLine(l, ML, y + S.title, '#262033'); y += S.title * 1.3; } }
    if (noteL.length) y += 3 * big;
    for (const l of noteL) {
      await need(S.lead);
      if (l.length) drawLine(l, ML, y + S.body, '#2b2433');
      y += l.length ? S.lead : S.lead * 0.55;
    }
    // photos: one across the page, or two side by side
    if (o.photos) {
      const shots = [];
      for (const a of e.assets) {
        if (a.type !== 'photo' || !a.found) continue;
        const p = await o.getPhoto(a.id);
        if (!p || !/^image\/(jpeg|png|webp|gif|avif)$/.test(p.mime)) continue;
        try { shots.push(await createImageBitmap(new Blob([p.bytes], { type: p.mime }))); } catch (err) { /* a photo the browser cannot decode is left out */ }
      }
      for (let i = 0; i < shots.length; i += 2) {
        const pair = shots.slice(i, i + 2);
        const gap = 8 * big;
        const each = pair.length === 1 ? CW : (CW - gap) / 2;
        const maxH = (BOTTOM - MT) * (pair.length === 1 ? 0.42 : 0.3);
        const dims = pair.map(b => { const s = Math.min(each / b.width, maxH / b.height); return [b.width * s, b.height * s]; });
        const rowH = Math.max(...dims.map(d => d[1]));
        y += 8 * big;
        await need(rowH);
        let x = ML;
        pair.forEach((b, j) => { g.drawImage(b, x, y, dims[j][0], dims[j][1]); x += dims[j][0] + gap; b.close(); });
        y += rowH;
      }
    }
    y += 14 * big;
    if (room(10 * big)) { g.fillStyle = '#e4e2da'; g.fillRect(ML, y - 7 * big, CW, 0.6); }
    if (n % 20 === 0) await new Promise(r => setTimeout(r, 0));
  }
  if (y > MT) await emit();
  return { blob: pdf.finish(), pages: pdf.pages };
}
