/* Wristory: a very small PDF writer. Every page is one picture drawn edge to edge: a JPEG (the report pages, drawn
 * on a canvas with your browser's own fonts, so Korean and every other script print as they look on screen) or deflated
 * RGB pixels (the poster, sharp and without JPEG blur). The file is built in this tab and never sent anywhere. */
const enc = new TextEncoder();
// a PDF text string: plain ASCII as (...), anything else as UTF-16 with a byte order mark
function pdfString(s) {
  s = String(s || '');
  if (/^[\x20-\x7e]*$/.test(s)) return `(${s.replace(/[\\()]/g, '\\$&')})`;
  let hex = 'FEFF';
  for (const ch of s) {
    const cp = ch.codePointAt(0);
    if (cp > 0xffff) { const v = cp - 0x10000; hex += (0xd800 + (v >> 10)).toString(16).padStart(4, '0') + (0xdc00 + (v & 0x3ff)).toString(16).padStart(4, '0'); }
    else hex += cp.toString(16).padStart(4, '0');
  }
  return `<${hex.toUpperCase()}>`;
}

export class PdfWriter {
  constructor({ title = '', author = '' } = {}) {
    this.blob = new Blob([]);
    this.pending = [];
    this.pendingBytes = 0;
    this.offset = 0;
    this.xref = [0, 0, 0, 0]; // 1 catalog, 2 pages, 3 info: written at the end; 0 is the free head
    this.kids = [];
    this.meta = { title, author };
    this.raw('%PDF-1.4\n');
    this.raw(new Uint8Array([0x25, 0xe2, 0xe3, 0xcf, 0xd3, 0x0a]));
  }
  raw(x) {
    const b = typeof x === 'string' ? enc.encode(x) : x;
    this.pending.push(b);
    this.pendingBytes += b.length;
    this.offset += b.length;
    if (this.pendingBytes > 8e6) this.flush();
  }
  flush() { if (this.pending.length) { this.blob = new Blob([this.blob, ...this.pending]); this.pending = []; this.pendingBytes = 0; } }
  obj(n, dict, stream) {
    this.xref[n] = this.offset;
    this.raw(`${n} 0 obj\n${dict}\n`);
    if (stream) { this.raw('stream\n'); this.raw(stream); this.raw('\nendstream\n'); }
    this.raw('endobj\n');
  }
  next() { this.xref.push(0); return this.xref.length - 1; }
  // image: { bytes, w, h, filter: 'DCTDecode' | 'FlateDecode' }; the page is wPt x hPt points, the image fills it
  addImagePage(wPt, hPt, image) {
    const im = this.next(), content = this.next(), page = this.next();
    const f = image.filter || 'DCTDecode';
    this.obj(im, `<< /Type /XObject /Subtype /Image /Width ${image.w} /Height ${image.h} /ColorSpace /DeviceRGB /BitsPerComponent 8 /Filter /${f} /Length ${image.bytes.length} >>`, image.bytes);
    const draw = enc.encode(`q ${wPt.toFixed(2)} 0 0 ${hPt.toFixed(2)} 0 0 cm /Im0 Do Q`);
    this.obj(content, `<< /Length ${draw.length} >>`, draw);
    this.obj(page, `<< /Type /Page /Parent 2 0 R /MediaBox [0 0 ${wPt.toFixed(2)} ${hPt.toFixed(2)}] /Resources << /XObject << /Im0 ${im} 0 R >> >> /Contents ${content} 0 R >>`);
    this.kids.push(page);
  }
  get pages() { return this.kids.length; }
  finish() {
    this.obj(2, `<< /Type /Pages /Kids [${this.kids.map(k => `${k} 0 R`).join(' ')}] /Count ${this.kids.length} >>`);
    this.obj(1, '<< /Type /Catalog /Pages 2 0 R >>');
    this.obj(3, `<< /Title ${pdfString(this.meta.title)} /Producer (Wristory, peakappsstudio.com) /Creator (Wristory) >>`);
    const at = this.offset;
    const lines = [`xref\n0 ${this.xref.length}\n`, '0000000000 65535 f \n'];
    for (let i = 1; i < this.xref.length; i++) lines.push(`${String(this.xref[i]).padStart(10, '0')} 00000 n \n`);
    this.raw(lines.join(''));
    this.raw(`trailer\n<< /Size ${this.xref.length} /Root 1 0 R /Info 3 0 R >>\nstartxref\n${at}\n%%EOF\n`);
    this.flush();
    return new Blob([this.blob], { type: 'application/pdf' });
  }
}

// page sizes in points
export const PAPER = { A5: [419.53, 595.28], A4: [595.28, 841.89], A3: [841.89, 1190.55] };
