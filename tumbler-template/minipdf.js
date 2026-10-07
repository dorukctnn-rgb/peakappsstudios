/* MiniPDF: a small PDF 1.4 writer for print templates (Peak Apps Tools).
 * Vector paths, Helvetica text, RGB images with an alpha mask (Flate via CompressionStream, JPEG fallback),
 * multiple pages, clipping. Coordinates passed to the helpers are in points, y measured DOWN from the top
 * of the page (like the screen); the writer flips them into PDF space.
 * Also: PeakPNG.withDpi(blob, dpi) writes a pHYs chunk so a PNG opens at its true physical size.
 */
(function (root) {
  'use strict';
  const enc = s => { const b = new Uint8Array(s.length); for (let i = 0; i < s.length; i++) b[i] = s.charCodeAt(i) & 255; return b; };
  const num = v => { const r = Math.round(v * 1000) / 1000; return (Object.is(r, -0) ? 0 : r).toString(); };

  // Helvetica advance widths (1/1000 em) for ASCII 32..126; used to centre labels.
  const HW = [278,278,355,556,556,889,667,191,333,333,389,584,278,333,278,278,556,556,556,556,556,556,556,556,556,556,278,278,584,584,584,556,1015,667,667,722,722,667,611,778,722,278,500,667,556,833,722,778,667,778,722,667,611,722,667,944,667,667,611,278,278,278,469,556,333,556,556,500,556,556,278,556,556,222,222,500,222,833,556,556,556,556,333,500,278,556,500,722,500,500,500,334,260,334,584];
  // WinAnsi (cp1252) code points outside Latin-1; Latin-1 0xA0-0xFF map to themselves.
  const WIN = { '€': 0x80, '‚': 0x82, '„': 0x84, '…': 0x85, '‘': 0x91, '’': 0x92, '“': 0x93, '”': 0x94, '•': 0x95, '–': 0x96, '—': 0x97, '™': 0x99 };
  const winCode = ch => { if (WIN[ch] != null) return WIN[ch]; const c = ch.charCodeAt(0); return c >= 0xA0 && c <= 0xFF ? c : null; };
  function textWidth(str, size, bold) {
    let w = 0;
    for (const ch of str) {
      const c = ch.charCodeAt(0);
      w += c >= 32 && c <= 126 ? HW[c - 32] * (bold ? 1.04 : 1) : (ch === '°' ? 400 : 584);
    }
    return w * size / 1000;
  }
  function pdfString(str) {
    let out = '(';
    for (const ch of str) {
      if (ch === '(' || ch === ')' || ch === '\\') out += '\\' + ch;
      else if (winCode(ch) != null) out += '\\' + winCode(ch).toString(8).padStart(3, '0');
      else { const c = ch.charCodeAt(0); out += c >= 32 && c <= 126 ? ch : '?'; }
    }
    return out + ')';
  }

  async function deflate(bytes) {
    if (typeof CompressionStream === 'undefined') return null;
    const cs = new CompressionStream('deflate');
    const stream = new Blob([bytes]).stream().pipeThrough(cs);
    return new Uint8Array(await new Response(stream).arrayBuffer());
  }

  class Page {
    constructor(doc, w, h) { this.doc = doc; this.w = w; this.h = h; this.ops = []; this.xobjects = new Set(); }
    Y(y) { return this.h - y; }
    raw(s) { this.ops.push(s); return this; }
    save() { return this.raw('q'); }
    restore() { return this.raw('Q'); }
    stroke(rgb) { return this.raw(`${rgb.map(num).join(' ')} RG`); }
    fill(rgb) { return this.raw(`${rgb.map(num).join(' ')} rg`); }
    lineWidth(w) { return this.raw(`${num(w)} w`); }
    dash(arr) { return this.raw(`[${(arr || []).map(num).join(' ')}] 0 d`); }
    lineJoin(j) { return this.raw(`${j} j`); }
    /** Append a page-frame path (from TumblerGeo.toPage) scaled by k (points per unit) and offset (points). */
    path(pp, k, ox = 0, oy = 0, geo) {
      const P = (x, y) => `${num(ox + x * k)} ${num(this.Y(oy + y * k))}`;
      for (const c of pp) {
        if (c.t === 'M') this.ops.push(`${P(c.x, c.y)} m`);
        else if (c.t === 'L') this.ops.push(`${P(c.x, c.y)} l`);
        else if (c.t === 'A') {
          this.ops.push(`${P(c.x0, c.y0)} l`);
          for (const b of geo.arcToBeziers(c)) this.ops.push(`${P(b[0], b[1])} ${P(b[2], b[3])} ${P(b[4], b[5])} c`);
        } else this.ops.push('h');
      }
      return this;
    }
    moveTo(x, y) { return this.raw(`${num(x)} ${num(this.Y(y))} m`); }
    lineTo(x, y) { return this.raw(`${num(x)} ${num(this.Y(y))} l`); }
    rect(x, y, w, h) { return this.raw(`${num(x)} ${num(this.Y(y + h))} ${num(w)} ${num(h)} re`); }
    circle(cx, cy, r) {
      const k = 0.5523 * r, Y = this.Y(cy);
      return this.raw(`${num(cx + r)} ${num(Y)} m ${num(cx + r)} ${num(Y + k)} ${num(cx + k)} ${num(Y + r)} ${num(cx)} ${num(Y + r)} c ` +
        `${num(cx - k)} ${num(Y + r)} ${num(cx - r)} ${num(Y + k)} ${num(cx - r)} ${num(Y)} c ` +
        `${num(cx - r)} ${num(Y - k)} ${num(cx - k)} ${num(Y - r)} ${num(cx)} ${num(Y - r)} c ` +
        `${num(cx + k)} ${num(Y - r)} ${num(cx + r)} ${num(Y - k)} ${num(cx + r)} ${num(Y)} c h`);
    }
    doStroke() { return this.raw('S'); }
    doFill() { return this.raw('f'); }
    clip() { return this.raw('W n'); }
    /** Marked content, so tests and other tools can find e.g. the cut line. */
    begin(tag) { return this.raw(`/${tag} BMC`); }
    end() { return this.raw('EMC'); }
    /** Text with its baseline at (x, y); align 'left' | 'center' | 'right'; optional rotation in degrees (counter-clockwise on paper). */
    text(str, x, y, size, opts = {}) {
      const font = opts.bold ? 'F2' : 'F1';
      const w = textWidth(str, size, opts.bold);
      const dx = opts.align === 'center' ? -w / 2 : opts.align === 'right' ? -w : 0;
      const a = (opts.rotate || 0) * Math.PI / 180, c = Math.cos(a), s = Math.sin(a);
      const X = x + dx * c, Yp = this.Y(y) + dx * s;
      return this.raw(`BT /${font} ${num(size)} Tf ${num(c)} ${num(s)} ${num(-s)} ${num(c)} ${num(X)} ${num(Yp)} Tm ${pdfString(str)} Tj ET`);
    }
    /** Draw an embedded image (from doc.image()) into the box (x, y, w, h) in page points (y down). */
    image(name, x, y, w, h) {
      this.xobjects.add(name);
      return this.raw(`q ${num(w)} 0 0 ${num(h)} ${num(x)} ${num(this.Y(y + h))} cm /${name} Do Q`);
    }
  }

  class MiniPDF {
    constructor(meta = {}) { this.meta = meta; this.pages = []; this.images = []; }
    addPage(w, h) { const p = new Page(this, w, h); this.pages.push(p); return p; }
    /**
     * Embed RGBA pixels (Uint8ClampedArray, width x height). Opaque images skip the soft mask.
     * Uses Flate (lossless) when CompressionStream exists, otherwise a JPEG of the image on white.
     */
    async addImageRGBA(rgba, width, height, jpegFallback) {
      const n = width * height;
      const rgb = new Uint8Array(n * 3);
      const alpha = new Uint8Array(n);
      let opaque = true;
      for (let i = 0, j = 0; i < n; i++, j += 4) {
        rgb[i * 3] = rgba[j]; rgb[i * 3 + 1] = rgba[j + 1]; rgb[i * 3 + 2] = rgba[j + 2];
        alpha[i] = rgba[j + 3];
        if (rgba[j + 3] !== 255) opaque = false;
      }
      const name = 'Im' + (this.images.length + 1);
      const z = await deflate(rgb);
      if (z) {
        const img = { name, width, height, data: z, filter: 'FlateDecode' };
        if (!opaque) img.smask = await deflate(alpha);
        this.images.push(img);
        return name;
      }
      if (!jpegFallback) throw new Error('This browser can’t compress images for PDF. Please use the PNG export.');
      const jpg = await jpegFallback(); // Uint8Array of a JPEG composited on white
      this.images.push({ name, width, height, data: jpg, filter: 'DCTDecode' });
      return name;
    }
    build() {
      const chunks = []; let offset = 0; const xref = [];
      const push = b => { chunks.push(b); offset += b.length; };
      const obj = (id, body, stream) => {
        xref[id] = offset;
        if (stream) {
          push(enc(`${id} 0 obj\n${body}\nstream\n`)); push(stream); push(enc('\nendstream\nendobj\n'));
        } else push(enc(`${id} 0 obj\n${body}\nendobj\n`));
      };
      push(enc('%PDF-1.4\n%\xE2\xE3\xCF\xD3\n'));
      let next = 5; // 1 catalog, 2 pages, 3-4 fonts
      const imgIds = {};
      const imgObjs = [];
      for (const im of this.images) {
        const id = next++; let smaskId = null;
        if (im.smask) smaskId = next++;
        imgIds[im.name] = id;
        imgObjs.push({ im, id, smaskId });
      }
      const pageIds = this.pages.map(() => { const p = next++; const c = next++; return [p, c]; });
      const infoId = next++;
      obj(1, '<< /Type /Catalog /Pages 2 0 R >>');
      obj(2, `<< /Type /Pages /Kids [${pageIds.map(p => p[0] + ' 0 R').join(' ')}] /Count ${this.pages.length} >>`);
      obj(3, '<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica /Encoding /WinAnsiEncoding >>');
      obj(4, '<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica-Bold /Encoding /WinAnsiEncoding >>');
      for (const { im, id, smaskId } of imgObjs) {
        obj(id, `<< /Type /XObject /Subtype /Image /Width ${im.width} /Height ${im.height} /ColorSpace /DeviceRGB /BitsPerComponent 8 /Filter /${im.filter}${smaskId ? ` /SMask ${smaskId} 0 R` : ''} /Length ${im.data.length} >>`, im.data);
        if (smaskId) obj(smaskId, `<< /Type /XObject /Subtype /Image /Width ${im.width} /Height ${im.height} /ColorSpace /DeviceGray /BitsPerComponent 8 /Filter /FlateDecode /Length ${im.smask.length} >>`, im.smask);
      }
      this.pages.forEach((p, i) => {
        const [pid, cid] = pageIds[i];
        const xo = [...p.xobjects].map(n => `/${n} ${imgIds[n]} 0 R`).join(' ');
        obj(pid, `<< /Type /Page /Parent 2 0 R /MediaBox [0 0 ${num(p.w)} ${num(p.h)}] /Resources << /Font << /F1 3 0 R /F2 4 0 R >>${xo ? ` /XObject << ${xo} >>` : ''} >> /Contents ${cid} 0 R >>`);
        const content = enc(p.ops.join('\n'));
        obj(cid, `<< /Length ${content.length} >>`, content);
      });
      const m = this.meta;
      obj(infoId, `<< /Producer (Peak Apps Tools) /Title ${pdfString(m.title || 'Template')}${m.subject ? ' /Subject ' + pdfString(m.subject) : ''} >>`);
      const xrefAt = offset;
      let x = `xref\n0 ${next}\n0000000000 65535 f \n`;
      for (let i = 1; i < next; i++) x += String(xref[i]).padStart(10, '0') + ' 00000 n \n';
      x += `trailer\n<< /Size ${next} /Root 1 0 R /Info ${infoId} 0 R >>\nstartxref\n${xrefAt}\n%%EOF\n`;
      push(enc(x));
      const out = new Uint8Array(offset); let o = 0;
      for (const c of chunks) { out.set(c, o); o += c.length; }
      return out;
    }
  }
  MiniPDF.textWidth = textWidth;

  // ---------- PNG physical size ----------
  const CRC = (() => { const t = new Uint32Array(256); for (let n = 0; n < 256; n++) { let c = n; for (let k = 0; k < 8; k++) c = c & 1 ? 0xEDB88320 ^ (c >>> 1) : c >>> 1; t[n] = c >>> 0; } return t; })();
  function crc32(bytes) { let c = 0xFFFFFFFF; for (let i = 0; i < bytes.length; i++) c = CRC[(c ^ bytes[i]) & 255] ^ (c >>> 8); return (c ^ 0xFFFFFFFF) >>> 0; }
  /** Insert (or replace) a pHYs chunk so the PNG carries its resolution (dots per inch). */
  function pngBytesWithDpi(buf, dpi) {
    const src = new Uint8Array(buf);
    const dv = new DataView(src.buffer, src.byteOffset, src.byteLength);
    if (dv.getUint32(0) !== 0x89504E47) return src;
    const parts = [src.subarray(0, 8)];
    let p = 8, inserted = false;
    const ppm = Math.round(dpi / 0.0254);
    const phys = new Uint8Array(21);
    const pv = new DataView(phys.buffer);
    pv.setUint32(0, 9); phys.set(enc('pHYs'), 4); pv.setUint32(8, ppm); pv.setUint32(12, ppm); phys[16] = 1;
    pv.setUint32(17, crc32(phys.subarray(4, 17)));
    while (p < src.length) {
      const len = dv.getUint32(p);
      const type = String.fromCharCode(src[p + 4], src[p + 5], src[p + 6], src[p + 7]);
      const end = p + 12 + len;
      if (type !== 'pHYs') parts.push(src.subarray(p, end));
      if (type === 'IHDR' && !inserted) { parts.push(phys); inserted = true; }
      p = end;
    }
    const total = parts.reduce((a, b) => a + b.length, 0);
    const out = new Uint8Array(total); let o = 0;
    for (const part of parts) { out.set(part, o); o += part.length; }
    return out;
  }
  async function withDpi(blob, dpi) {
    const bytes = pngBytesWithDpi(await blob.arrayBuffer(), dpi);
    return new Blob([bytes], { type: 'image/png' });
  }

  root.MiniPDF = MiniPDF;
  root.PeakPNG = { withDpi, pngBytesWithDpi, crc32 };
  if (typeof module !== 'undefined' && module.exports) module.exports = { MiniPDF, PeakPNG: root.PeakPNG };
})(typeof globalThis !== 'undefined' ? globalThis : self);
