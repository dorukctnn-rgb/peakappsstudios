/* Peelback: the files the notes can be saved as. Everything is built in this tab from the notes already open; nothing is sent
 * anywhere. Free: one note or the first five as plain text. Pro: all of it as a ZIP of text files or Markdown files, CSV, JSON,
 * the Evernote format (Notes on a Mac imports it), a Word and Google Docs page, and a PDF book. */
import { PdfWriter, PAPER } from './pdfmini.js';

export const THEME_HEX = { Yellow: '#ffd93d', Pink: '#ff8fb1', Blue: '#74c0fc', Green: '#8ce99a', Purple: '#c4a7ff', Gray: '#ced4da', Charcoal: '#495057' };
export const hexOf = t => THEME_HEX[t] || THEME_HEX.Yellow;

const enc = new TextEncoder();
const pad = (n, w = 2) => String(n).padStart(w, '0');

/** Date and time in the reader's own computer time, written the same way in every file: 2026-11-05 14:30 */
export function stamp(ms) {
  if (!ms) return '';
  const d = new Date(ms);
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}`;
}
const iso = ms => (ms ? new Date(ms).toISOString() : '');

/** A file name from a title: nothing Windows, macOS or Android refuse, at most 80 characters, never hidden. */
export function safeName(title, fallback = 'Note') {
  const clean = [...String(title || '').normalize('NFC')].map(c => (c.charCodeAt(0) < 32 ? ' ' : c)).join('')
    .replace(/[\\/:*?"<>|#^[\]]/g, ' ').replace(/\s+/g, ' ').trim();
  const cut = [...clean].slice(0, 80).join('').replace(/^[. ]+|[. ]+$/g, '');
  return cut && !/^(con|prn|aux|nul|com\d|lpt\d)$/i.test(cut) ? cut : fallback;
}
/** One path per note: Notes/<title>.<ext> (Deleted/ for deleted ones), numbered when two share a title. */
export function notePaths(notes, T, ext) {
  const used = new Set();
  return notes.map(n => {
    const dir = n.deleted ? safeName(T.deletedFolder, 'Deleted') : safeName(T.notesFolder, 'Notes');
    const base = safeName(n.title, T.untitled);
    let p = `${dir}/${base}.${ext}`, i = 2;
    while (used.has(p.toLowerCase())) p = `${dir}/${base} (${i++}).${ext}`;
    used.add(p.toLowerCase());
    return p;
  });
}

export const detailLine = (n, T) => [n.created ? `${T.created}: ${stamp(n.created)}` : '', n.modified ? `${T.modified}: ${stamp(n.modified)}` : '', `${T.color}: ${(T.themes && T.themes[n.theme]) || n.theme}`, n.deleted ? T.deletedTag : ''].filter(Boolean).join('   ');

/** One note as a plain text file (Windows line ends, so Notepad shows the lines). */
export const noteText = (n, T) => `${n.text}\r\n\r\n--\r\n${detailLine(n, T)}\r\n`.replace(/\r?\n/g, '\r\n').replace(/\r\r/g, '\r');
/** Several notes in one text file. */
export const textBundle = (notes, T) => notes.map(n => `${n.title || T.untitled}\r\n${'='.repeat(Math.min(60, Array.from(n.title || T.untitled).length))}\r\n${n.text.replace(/\r?\n/g, '\r\n')}\r\n\r\n${detailLine(n, T)}\r\n`).join('\r\n\r\n');

const yq = s => JSON.stringify(String(s));
export function noteMarkdown(n, T) {
  const fm = ['---', `title: ${yq(n.title || T.untitled)}`, n.created ? `created: ${iso(n.created)}` : '', n.modified ? `modified: ${iso(n.modified)}` : '', `color: ${yq(n.theme)}`, n.deleted ? 'deleted: true' : '', '---', ''].filter(x => x !== '').join('\n');
  return `${fm}\n\n${n.text}\n`;
}

const csvCell = v => {
  let s = v == null ? '' : String(v);
  if (/^[=+\-@\t\r]/.test(s)) s = `'${s}`;   // a spreadsheet would run it as a formula
  return /[",\r\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
};
export function notesCsv(notes) {
  const head = ['title', 'text', 'color', 'created', 'modified', 'deleted', 'pictures', 'file'];
  return '﻿' + [head.join(','), ...notes.map(n => [n.title, n.text, n.theme, stamp(n.created), stamp(n.modified), n.deleted ? 'yes' : '', n.pictures || '', n.source === 'snt' ? 'StickyNotes.snt' : 'plum.sqlite'].map(csvCell).join(','))].join('\r\n') + '\r\n';
}
export const notesJson = notes => JSON.stringify({ app: 'Peelback', notes: notes.map(n => ({ id: n.id, title: n.title, text: n.text, color: n.theme, created: iso(n.created) || null, modified: iso(n.modified) || null, deleted: !!n.deleted, pictures: n.pictures || 0 })) }, null, 2);

const xml = s => String(s).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c])).replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f￾￿]/g, '');
const enDate = ms => new Date(ms).toISOString().replace(/[-:]/g, '').replace(/\.\d+Z$/, 'Z');
/** Evernote's ENEX: Notes on a Mac imports it (File > Import to Notes) with each note's dates. */
export function notesEnex(notes, T) {
  const body = notes.map(n => {
    const content = n.text.split('\n').map(l => `<div>${xml(l) || '<br/>'}</div>`).join('') + `<div><br/></div><div>${xml(detailLine(n, T))}</div>`;
    return `<note><title>${xml(n.title || T.untitled)}</title><content><![CDATA[<?xml version="1.0" encoding="UTF-8" standalone="no"?><!DOCTYPE en-note SYSTEM "http://xml.evernote.com/pub/enml2.dtd"><en-note>${content.replace(/]]>/g, ']]]]><![CDATA[>')}</en-note>]]></content>${n.created ? `<created>${enDate(n.created)}</created>` : ''}${n.modified ? `<updated>${enDate(n.modified)}</updated>` : ''}</note>`;
  }).join('\n');
  return `<?xml version="1.0" encoding="UTF-8"?>\n<!DOCTYPE en-export SYSTEM "http://xml.evernote.com/pub/evernote-export4.dtd">\n<en-export application="Peelback" version="1">\n${body}\n</en-export>\n`;
}
/** One HTML page with every note under its own heading and in its colour; Word and Google Docs open it, and it prints. */
export function notesDocHtml(notes, T, lang) {
  const parts = notes.map(n => `<h2 style="border-left:8px solid ${hexOf(n.theme)};padding-left:8px">${xml(n.title || T.untitled)}</h2>\n<p style="color:#5b6670;font-size:10pt">${xml(detailLine(n, T))}</p>\n${n.text.split(/\n{2,}/).map(p => `<p>${xml(p).replace(/\n/g, '<br>')}</p>`).join('')}`);
  return `<!doctype html>\n<html lang="${xml(lang || 'en')}"><head><meta charset="utf-8"><title>${xml(T.docTitle)}</title><style>body{font-family:Segoe UI,Arial,sans-serif;line-height:1.5;margin:32px auto;max-width:760px}h2{page-break-after:avoid}</style></head><body>\n<h1>${xml(T.docTitle)}</h1>\n${parts.join('\n')}\n</body></html>\n`;
}

/* ------------------------------------------------------------------ ZIP (stored, no compression: text files are small) */
const CRC = (() => { const t = new Uint32Array(256); for (let n = 0; n < 256; n++) { let c = n; for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1; t[n] = c >>> 0; } return t; })();
export function crc32(b) { let c = 0xffffffff; for (let i = 0; i < b.length; i++) c = CRC[(c ^ b[i]) & 255] ^ (c >>> 8); return (c ^ 0xffffffff) >>> 0; }
/** files: [{ path, data: string | Uint8Array, mtime }] -> Uint8Array of a ZIP archive (UTF-8 names). */
export function zip(files) {
  const parts = [], central = [];
  let offset = 0;
  for (const f of files) {
    const name = enc.encode(f.path), data = typeof f.data === 'string' ? enc.encode(f.data) : f.data;
    const d = new Date(f.mtime || Date.now());
    const time = (d.getHours() << 11) | (d.getMinutes() << 5) | (d.getSeconds() >> 1), date = ((Math.max(1980, d.getFullYear()) - 1980) << 9) | ((d.getMonth() + 1) << 5) | d.getDate();
    const crc = crc32(data);
    const lh = new DataView(new ArrayBuffer(30));
    lh.setUint32(0, 0x04034b50, true); lh.setUint16(4, 20, true); lh.setUint16(6, 0x0800, true); lh.setUint16(8, 0, true);
    lh.setUint16(10, time, true); lh.setUint16(12, date, true); lh.setUint32(14, crc, true); lh.setUint32(18, data.length, true); lh.setUint32(22, data.length, true); lh.setUint16(26, name.length, true);
    parts.push(new Uint8Array(lh.buffer), name, data);
    const ch = new DataView(new ArrayBuffer(46));
    ch.setUint32(0, 0x02014b50, true); ch.setUint16(4, 20, true); ch.setUint16(6, 20, true); ch.setUint16(8, 0x0800, true); ch.setUint16(10, 0, true);
    ch.setUint16(12, time, true); ch.setUint16(14, date, true); ch.setUint32(16, crc, true); ch.setUint32(20, data.length, true); ch.setUint32(24, data.length, true); ch.setUint16(28, name.length, true); ch.setUint32(42, offset, true);
    central.push(new Uint8Array(ch.buffer), name);
    offset += 30 + name.length + data.length;
  }
  const cdSize = central.reduce((a, b) => a + b.length, 0);
  const end = new DataView(new ArrayBuffer(22));
  end.setUint32(0, 0x06054b50, true); end.setUint16(8, files.length, true); end.setUint16(10, files.length, true); end.setUint32(12, cdSize, true); end.setUint32(16, offset, true);
  const all = [...parts, ...central, new Uint8Array(end.buffer)];
  const out = new Uint8Array(all.reduce((a, b) => a + b.length, 0));
  let o = 0; for (const p of all) { out.set(p, o); o += p.length; }
  return out;
}
export const zipText = (notes, T) => zip(notePaths(notes, T, 'txt').map((p, i) => ({ path: p, data: '﻿' + noteText(notes[i], T), mtime: notes[i].modified })));
export const zipMarkdown = (notes, T) => zip(notePaths(notes, T, 'md').map((p, i) => ({ path: p, data: noteMarkdown(notes[i], T), mtime: notes[i].modified })));

/* ------------------------------------------------------------------ the PDF book (pages drawn on a canvas, then added as pictures) */
const DPI = { A5: 150, A4: 130 };
const FONT_TEXT = '"Peelback Text", "Hiragino Sans", "Yu Gothic", Meiryo, "Apple SD Gothic Neo", "Malgun Gothic", "Noto Sans CJK JP", "Noto Sans KR", system-ui, sans-serif';
const FONT_DISPLAY = '"Peelback Display", "Peelback Text", "Hiragino Sans", "Yu Gothic", "Malgun Gothic", system-ui, sans-serif';
const INK = '#1d2433', MUTED = '#5b6575';
const CJK = /[　-ヿ㐀-鿿가-힯豈-﫿＀-￯]/;
function pieces(line) {
  const out = []; let cur = '';
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
/** notes: in order; o: { paper: 'A5' | 'A4', title, locale, T, onProgress(page) }. Returns a Blob of the PDF. */
export async function makeBook(notes, o) {
  try { if (document.fonts) await Promise.all(['800 20px "Peelback Display"', '400 20px "Peelback Text"', '700 20px "Peelback Text"'].map(f => document.fonts.load(f))); } catch (e) { /* system fonts then */ }
  const [wPt, hPt] = PAPER[o.paper] || PAPER.A5, k = (DPI[o.paper] || 150) / 72;
  const canvas = document.createElement('canvas');
  canvas.width = Math.round(wPt * k); canvas.height = Math.round(hPt * k);
  const g = canvas.getContext('2d', { alpha: false });
  const big = o.paper === 'A4' ? 1.2 : 1;
  const S = { body: 10.2 * big, lead: 14.6 * big, small: 7.8 * big, title: 13 * big, cover: 30 * big };
  const ML = 44 * big, MR = 40 * big, MT = 50 * big, MB = 54 * big, CW = wPt - ML - MR, BOTTOM = hPt - MB;
  const T = o.T, nf = new Intl.NumberFormat(o.locale);
  const font = (size, w = 400, display = false) => `${w} ${size}px ${display ? FONT_DISPLAY : FONT_TEXT}`;
  const fill = (s, v) => String(s).replace(/\{(\w+)\}/g, (m, x) => (v[x] != null ? v[x] : m));
  const pdf = new PdfWriter({ title: o.title });
  let pageNo = 0, y = MT;
  const blank = () => { g.setTransform(1, 0, 0, 1, 0, 0); g.fillStyle = '#ffffff'; g.fillRect(0, 0, canvas.width, canvas.height); g.setTransform(k, 0, 0, k, 0, 0); g.textBaseline = 'alphabetic'; g.textAlign = 'left'; };
  async function emit(numbered = true) {
    pageNo++;
    if (numbered) { g.fillStyle = MUTED; g.font = font(S.small); g.textAlign = 'center'; g.fillText(nf.format(pageNo), wPt / 2, hPt - 26 * big); g.textAlign = 'left'; }
    const blob = await new Promise(r => canvas.toBlob(r, 'image/jpeg', 0.82));
    pdf.addImagePage(wPt, hPt, { bytes: new Uint8Array(await blob.arrayBuffer()), w: canvas.width, h: canvas.height });
    if (o.onProgress && pageNo % 4 === 0) { o.onProgress(pageNo); await new Promise(r => setTimeout(r, 0)); }
  }
  // cover: a band in the title colour with the colours of the notes along its foot
  blank();
  g.fillStyle = '#1d2433'; g.fillRect(0, 0, wPt, hPt * 0.58);
  const used = [...new Set(notes.map(n => n.theme))].slice(0, 7), tabW = CW / 7;
  used.forEach((c, i) => { g.fillStyle = hexOf(c); g.fillRect(ML + i * tabW, hPt * 0.58 - 12 * big, tabW - 3 * big, 12 * big); });
  g.fillStyle = '#ffd93d'; g.font = font(S.cover, 800, true);
  let cy = hPt * 0.3;
  for (const l of wrap(g, o.title, CW).slice(0, 3)) { g.fillText(l, ML, cy); cy += S.cover * 1.15; }
  const times = notes.map(n => n.modified).filter(Boolean).sort((a, b) => a - b), fDay = new Intl.DateTimeFormat(o.locale, { dateStyle: 'long' });
  g.fillStyle = INK; g.font = font(S.title, 700);
  g.fillText(fill(T.bookCount, { n: nf.format(notes.length) }), ML, hPt * 0.58 + 40 * big);
  if (times.length) { g.font = font(S.body); g.fillStyle = MUTED; g.fillText(fill(T.bookRange, { from: fDay.format(times[0]), to: fDay.format(times[times.length - 1]) }), ML, hPt * 0.58 + 60 * big); }
  await emit(false);
  blank(); y = MT;
  let pageHas = false;
  const fWhen = new Intl.DateTimeFormat(o.locale, { dateStyle: 'medium', timeStyle: 'short' });
  for (const n of notes) {
    g.font = font(S.title, 700, true);
    const title = wrap(g, n.title || T.untitled, CW - 12 * big);
    g.font = font(S.small);
    const meta = wrap(g, [n.modified ? fWhen.format(n.modified) : '', (T.themes && T.themes[n.theme]) || n.theme, n.deleted ? T.deletedTag : ''].filter(Boolean).join('   '), CW - 12 * big);
    const headH = title.length * S.title * 1.3 + meta.length * S.small * 1.5 + 8 * big;
    g.font = font(S.body);
    const body = wrap(g, n.text || '', CW);
    if (y + headH + S.lead * 2 > BOTTOM && y > MT) { await emit(); blank(); y = MT; }
    g.fillStyle = hexOf(n.theme); g.fillRect(ML, y + 2 * big, 5 * big, headH - 10 * big);
    let ty = y + S.title; g.fillStyle = INK; g.font = font(S.title, 700, true);
    for (const l of title) { g.fillText(l, ML + 12 * big, ty); ty += S.title * 1.3; }
    g.fillStyle = MUTED; g.font = font(S.small);
    for (const l of meta) { g.fillText(l, ML + 12 * big, ty - 2 * big); ty += S.small * 1.5; }
    y += headH; pageHas = true;
    g.font = font(S.body);
    for (const l of body) {
      if (y + S.lead > BOTTOM) { await emit(); blank(); y = MT; }
      g.fillStyle = INK; g.font = font(S.body); g.fillText(l, ML, y + S.body); y += S.lead;
    }
    y += 16 * big;
  }
  if (pageHas) await emit();
  return pdf.finish();
}
