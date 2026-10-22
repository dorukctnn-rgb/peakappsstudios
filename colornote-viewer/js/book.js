/* Notelift Pro: your notes as a PDF book. Each page is laid out on a canvas in this tab (a cover, the contents with page
 * numbers, then every note with its colour, title, details and text, checklists with their boxes) and added to the PDF
 * as a picture, so notes in any script (Japanese, Korean, accents, emoji) print as they show on screen. Nothing is
 * uploaded. For text you can select in the PDF, use Print and "Save as PDF" instead. */
import { PdfWriter, PAPER } from './pdfmini.js';
import { COLOR_KEYS, COLOR_HEX, shownTitle, folderName } from './notes.js';

const DPI = { A5: 150, A4: 130 };
export const FONT_TEXT = '"Notelift Text", "Hiragino Sans", "Hiragino Kaku Gothic ProN", "Yu Gothic", Meiryo, "Apple SD Gothic Neo", "Malgun Gothic", "Noto Sans CJK JP", "Noto Sans KR", system-ui, sans-serif';
export const FONT_DISPLAY = '"Notelift Display", "Hiragino Mincho ProN", "Yu Mincho", "Apple SD Gothic Neo", "Malgun Gothic", Georgia, serif';
const INK = '#1b1a22', MUTED = '#5a5868', RULE = '#d9dce0';

// text broken into pieces that may end a line: words with their spaces in Latin scripts, single characters in CJK
const CJK = /[　-ヿ㐀-鿿가-힯豈-﫿＀-￯]/;
function pieces(line) {
  const out = [];
  let cur = '';
  for (const ch of Array.from(line)) {
    if (CJK.test(ch)) { if (cur) out.push(cur); cur = ''; out.push(ch); continue; }
    cur += ch;
    if (ch === ' ' || ch === '-' || ch === '/') { out.push(cur); cur = ''; }
  }
  if (cur) out.push(cur);
  return out;
}
export function wrap(g, text, width) {
  const lines = [];
  for (const para of String(text).split('\n')) {
    if (!para) { lines.push(''); continue; }
    let line = '';
    for (const p of pieces(para)) {
      const next = line + p;
      if (g.measureText(next.replace(/ +$/, '')).width <= width || !line) {
        if (!line && g.measureText(p).width > width) {
          // one piece wider than the line (a long address): cut it by characters
          let part = '';
          for (const ch of Array.from(p)) { if (g.measureText(part + ch).width > width && part) { lines.push(part); part = ''; } part += ch; }
          line = part;
        } else line = next;
      } else { lines.push(line.replace(/ +$/, '')); line = p.replace(/^ +/, ''); }
    }
    lines.push(line.replace(/ +$/, ''));
  }
  return lines;
}

/** Builds the PDF. notes: the notes in order; o: { paper, title, locale, T, L, folders, onProgress(page, about) }. */
export async function makeBook(notes, o) {
  // canvases do not ask for web fonts by themselves: load the faces the pages use first
  try { if (document.fonts) await Promise.all(['800 20px "Notelift Display"', '400 20px "Notelift Text"', '700 20px "Notelift Text"'].map(f => document.fonts.load(f))); } catch (e) { /* system fonts then */ }
  const [wPt, hPt] = PAPER[o.paper] || PAPER.A5;
  const k = (DPI[o.paper] || 150) / 72;
  const canvas = document.createElement('canvas');
  canvas.width = Math.round(wPt * k); canvas.height = Math.round(hPt * k);
  const g = canvas.getContext('2d', { alpha: false });
  const big = o.paper === 'A4' ? 1.2 : 1;
  const S = { body: 10.2 * big, lead: 14.6 * big, small: 7.8 * big, title: 13 * big, cover: 30 * big };
  const ML = 44 * big, MR = 40 * big, MT = 50 * big, MB = 54 * big;
  const CW = wPt - ML - MR, BOTTOM = hPt - MB;
  const T = o.T, L = o.L;
  const fWhen = new Intl.DateTimeFormat(o.locale, { dateStyle: 'medium', timeStyle: 'short' });
  const fDay = new Intl.DateTimeFormat(o.locale, { dateStyle: 'long' });
  const nf = new Intl.NumberFormat(o.locale);
  const font = (size, w = 400, display = false) => `${w} ${size}px ${display ? FONT_DISPLAY : FONT_TEXT}`;
  const fill = (s, v) => String(s).replace(/\{(\w+)\}/g, (m, x) => (v[x] != null ? v[x] : m));

  // ---- layout: every note becomes a list of drawing steps; pages are cut from them ----
  function blocksOf(n) {
    const out = [];
    g.font = font(S.title, 700, true);
    const title = wrap(g, shownTitle(n) || T.untitled, CW - 12 * big);
    const meta = [n.modified ? fWhen.format(n.modified) : '', folderName(n.folder, o.folders, L), n.where !== 'notes' ? L.places[n.where] : '', n.reminder ? `${T.reminder}: ${n.reminder.allDay ? fDay.format(n.reminder.at) : fWhen.format(n.reminder.at)}` : ''].filter(Boolean).join('   ');
    g.font = font(S.small);
    const metaLines = wrap(g, meta, CW - 12 * big);
    out.push({ kind: 'head', title, meta: metaLines, h: title.length * S.title * 1.3 + metaLines.length * S.small * 1.5 + 8 * big, color: COLOR_HEX[COLOR_KEYS[n.color]] });
    g.font = font(S.body);
    if (n.locked) for (const l of wrap(g, L.lockedBody, CW)) out.push({ kind: 'line', text: l, h: S.lead, muted: true });
    else if (n.kind === 'list') {
      for (const it of n.items) {
        const ls = wrap(g, it.text || ' ', CW - 16 * big);
        ls.forEach((l, i) => out.push({ kind: 'item', text: l, box: i === 0 && !it.bare, done: it.done, h: S.lead }));
      }
    } else for (const l of wrap(g, n.text || '', CW)) out.push({ kind: 'line', text: l, h: S.lead });
    out.push({ kind: 'gap', h: 16 * big });
    return out;
  }
  const flows = notes.map(blocksOf);

  // contents: one line per note
  g.font = font(S.body);
  const contentsPerPage = Math.floor((BOTTOM - MT - 40 * big) / (S.lead * 1.05));
  const contentsPages = Math.max(1, Math.ceil(notes.length / contentsPerPage));
  // first pass: which page each note starts on
  const firstPage = [];
  let page = 1 + contentsPages + 1, y = MT;
  for (const f of flows) {
    // keep a title with at least two lines of its note
    const need = f[0].h + (f[1] ? f[1].h : 0) + (f[2] ? f[2].h : 0);
    if (y + need > BOTTOM && y > MT) { page++; y = MT; }
    firstPage.push(page);
    for (const b of f) { if (y + b.h > BOTTOM && b.kind !== 'gap') { page++; y = MT; } y += b.h; }
  }
  const about = page;

  const pdf = new PdfWriter({ title: o.title });
  let pageNo = 0;
  function blank() {
    g.setTransform(1, 0, 0, 1, 0, 0);
    g.fillStyle = '#ffffff'; g.fillRect(0, 0, canvas.width, canvas.height);
    g.setTransform(k, 0, 0, k, 0, 0);
    g.textBaseline = 'alphabetic'; g.textAlign = 'left';
  }
  async function emit(numbered = true) {
    pageNo++;
    if (numbered) { g.fillStyle = MUTED; g.font = font(S.small); g.textAlign = 'center'; g.fillText(nf.format(pageNo), wPt / 2, hPt - 26 * big); g.textAlign = 'left'; }
    if (o.onPageCanvas) await o.onPageCanvas(canvas, pageNo);
    const blob = await new Promise(r => canvas.toBlob(r, 'image/jpeg', 0.82));
    const bytes = new Uint8Array(await blob.arrayBuffer());
    pdf.addImagePage(wPt, hPt, { bytes, w: canvas.width, h: canvas.height });
    if (o.onProgress && pageNo % 4 === 0) { o.onProgress(pageNo, about); await new Promise(r => setTimeout(r, 0)); }
  }

  // cover
  blank();
  g.fillStyle = '#3a2346'; g.fillRect(0, 0, wPt, hPt * 0.58);
  const used = [...new Set(notes.map(n => n.color))].filter(Boolean).slice(0, 9);
  const tabW = (wPt - ML - MR) / 9;
  used.forEach((c, i) => { g.fillStyle = COLOR_HEX[COLOR_KEYS[c]]; g.fillRect(ML + i * tabW, hPt * 0.58 - 10 * big, tabW - 3 * big, 10 * big); });
  g.fillStyle = '#ffffff'; g.font = font(S.cover, 800, true);
  let cy = hPt * 0.3;
  for (const l of wrap(g, o.title, CW).slice(0, 3)) { g.fillText(l, ML, cy); cy += S.cover * 1.15; }
  const times = notes.map(n => n.modified).filter(Boolean).sort((a, b) => a - b);
  g.fillStyle = INK; g.font = font(S.title, 700);
  g.fillText(fill(T.bookCount, { n: nf.format(notes.length) }), ML, hPt * 0.58 + 40 * big);
  if (times.length) { g.font = font(S.body); g.fillStyle = MUTED; g.fillText(fill(T.bookRange, { from: fDay.format(times[0]), to: fDay.format(times[times.length - 1]) }), ML, hPt * 0.58 + 60 * big); }
  await emit(false);

  // contents
  for (let p = 0; p < contentsPages; p++) {
    blank();
    y = MT;
    if (p === 0) { g.fillStyle = INK; g.font = font(S.title * 1.3, 800, true); g.fillText(T.bookContents, ML, y + 8 * big); y += 32 * big; }
    g.font = font(S.body);
    for (let i = p * contentsPerPage; i < Math.min(notes.length, (p + 1) * contentsPerPage); i++) {
      const n = notes[i];
      const num = nf.format(firstPage[i]);
      const nw = g.measureText(num).width;
      g.fillStyle = COLOR_HEX[COLOR_KEYS[n.color]]; g.fillRect(ML, y - S.body * 0.75, 4 * big, S.body * 0.9);
      let t = shownTitle(n) || T.untitled;
      const room = CW - nw - 22 * big;
      while (t.length > 1 && g.measureText(t).width > room) t = t.slice(0, -2) + '…';
      g.fillStyle = INK; g.fillText(t, ML + 10 * big, y);
      g.fillStyle = MUTED; g.textAlign = 'right'; g.fillText(num, wPt - MR, y); g.textAlign = 'left';
      y += S.lead * 1.05;
    }
    await emit(true);
  }

  // the notes
  blank(); y = MT;
  let pageHas = false;
  for (let i = 0; i < flows.length; i++) {
    const f = flows[i];
    const need = f[0].h + (f[1] ? f[1].h : 0) + (f[2] ? f[2].h : 0);
    if (y + need > BOTTOM && y > MT) { await emit(); blank(); y = MT; }
    for (const b of f) {
      if (y + b.h > BOTTOM && b.kind !== 'gap') { await emit(); blank(); y = MT; }
      pageHas = true;
      if (b.kind === 'head') {
        g.fillStyle = b.color; g.fillRect(ML, y + 2 * big, 5 * big, b.h - 10 * big);
        if (b.color === '#ffffff') { g.strokeStyle = RULE; g.lineWidth = 0.6; g.strokeRect(ML, y + 2 * big, 5 * big, b.h - 10 * big); }
        let ty = y + S.title;
        g.fillStyle = INK; g.font = font(S.title, 700, true);
        for (const l of b.title) { g.fillText(l, ML + 12 * big, ty); ty += S.title * 1.3; }
        g.fillStyle = MUTED; g.font = font(S.small);
        for (const l of b.meta) { g.fillText(l, ML + 12 * big, ty - 2 * big); ty += S.small * 1.5; }
      } else if (b.kind === 'line') {
        g.fillStyle = b.muted ? MUTED : INK; g.font = font(S.body);
        g.fillText(b.text, ML, y + S.body);
      } else if (b.kind === 'item') {
        const bx = ML + 1 * big, by = y + S.body * 0.15, bs = S.body * 0.95;
        if (b.box) {
          g.lineWidth = 0.9 * big; g.strokeStyle = INK;
          g.strokeRect(bx, by, bs, bs);
          if (b.done) { g.beginPath(); g.moveTo(bx + bs * 0.2, by + bs * 0.52); g.lineTo(bx + bs * 0.42, by + bs * 0.75); g.lineTo(bx + bs * 0.82, by + bs * 0.25); g.stroke(); }
        }
        g.fillStyle = b.done ? MUTED : INK; g.font = font(S.body);
        g.fillText(b.text, ML + 16 * big, y + S.body);
        if (b.done) { const w = g.measureText(b.text).width; g.fillRect(ML + 16 * big, y + S.body * 0.62, w, 0.7 * big); }
      }
      y += b.h;
    }
  }
  if (pageHas) await emit();
  if (o.onProgress) o.onProgress(pageNo, pageNo);
  return pdf.finish();
}
