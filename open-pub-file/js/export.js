// What the page gives back: the text and pictures of the .pub file as a Word file, plain text, Markdown, an HTML reading
// copy, and a ZIP of the pictures. None of them rebuilds Publisher's layout; the text comes in reading order, page by page.
// Pure functions, no DOM and no network: they run in the page's worker and in Node (unit tests).
import { zipSync, strToU8 } from '../vendor/fflate.js';

const EMU_PER_PT = 12700;
const NL = String.fromCharCode(10);

export const escXml = s => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
export const escHtml = escXml;
// XML 1.0 has no room for most control characters: drop them
const XML_BAD = new RegExp('[' + String.fromCharCode(0) + '-' + String.fromCharCode(8) + String.fromCharCode(11) + String.fromCharCode(12) + String.fromCharCode(14) + '-' + String.fromCharCode(31) + String.fromCharCode(0xfffe, 0xffff) + ']', 'g');
const xmlText = s => escXml(String(s).replace(XML_BAD, ''));

export function pictureName(img, ext = img.ext) { return `picture-${String(img.index + 1).padStart(2, '0')}.${ext}`; }
/**
 * The form of a picture every program shows: the picture itself when it is a JPG, PNG, GIF or BMP, and for a vector picture
 * (WMF, EMF) the PNG the page drew from it, when there is one. Returns null for the others (TIF, PICT, CMYK JPEG).
 */
export function webForm(img) {
  if (img.shown) return { ext: img.ext, mime: img.mime, bytes: img.bytes };
  if (img.png) return { ext: 'png', mime: 'image/png', bytes: img.png };
  return null;
}

/** the title to use in file names and headings */
export function titleOf(model, fallback = 'Publisher file') {
  const t = (model.meta && model.meta.title || '').trim();
  return t || fallback;
}
export function fileStem(name) {
  const base = String(name || 'publisher-file').replace(/\.[a-z0-9]{1,5}$/i, '');
  const safe = base.normalize('NFKD').replace(/[^\w.-]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 60);
  return safe || 'publisher-file';
}

/** one flat list of sections: each page, then what repeats on every page, then text that is on no page */
export function sectionsOf(model) {
  const out = [];
  const itemsOf = frames => {
    const items = [];
    for (const f of frames) {
      if (f.grid) items.push({ type: 'table', grid: f.grid });
      else if (f.paragraphs && f.paragraphs.some(p => p.trim())) items.push({ type: 'text', paragraphs: squeeze(f.paragraphs), links: f.links || [] });
      if (f.image !== null && f.image !== undefined) items.push({ type: 'picture', index: f.image, box: f.box });
    }
    return items;
  };
  for (const p of model.pages) out.push({ kind: 'page', n: p.n, title: `Page ${p.n}`, items: itemsOf(p.frames) });
  const rep = model.masters.flatMap(m => m.frames);
  const repItems = itemsOf(rep);
  if (repItems.length) out.push({ kind: 'master', title: 'Repeated on every page', items: repItems });
  const loose = model.otherText.map(o => ({ type: 'text', paragraphs: squeeze(o.paragraphs), links: [] }));
  if (loose.length) out.push({ kind: 'other', title: 'Text that is not on a page', items: loose });
  const onAPage = new Set(out.flatMap(s => s.items.filter(i => i.type === 'picture').map(i => i.index)));
  const rest = model.images.filter(i => !onAPage.has(i.index));
  if (rest.length) out.push({ kind: 'pictures', title: 'Other pictures stored in the file', items: rest.map(i => ({ type: 'picture', index: i.index, box: null })) });
  return out;
}
/** blank paragraphs collapse to one, and none at the start or the end */
function squeeze(paras) {
  const out = [];
  for (const p of paras) {
    if (p.trim() === '') { if (out.length && out[out.length - 1] !== '') out.push(''); } else out.push(p);
  }
  while (out.length && out[out.length - 1] === '') out.pop();
  return out;
}

/* ---------------- plain text ---------------- */
export function textExport(model, { fileName = '' } = {}) {
  const lines = [];
  const title = (model.meta.title || '').trim();
  if (title) lines.push(title);
  if (model.meta.author) lines.push(`Author: ${model.meta.author}`);
  if (fileName) lines.push(`File: ${fileName}`);
  if (lines.length) lines.push('');
  for (const s of sectionsOf(model)) {
    lines.push(`=== ${s.title} ===`, '');
    for (const it of s.items) {
      if (it.type === 'text') { lines.push(...it.paragraphs, ''); }
      else if (it.type === 'table') { for (let r = 0; r < it.grid.rows; r++) lines.push(it.grid.cells.slice(r * it.grid.cols, (r + 1) * it.grid.cols).map(c => c.replace(/\s*\n\s*/g, ' ')).join('\t')); lines.push(''); }
      else if (it.type === 'picture') { const img = model.images.find(i => i.index === it.index); if (img) lines.push(`[Picture: ${pictureName(img)}]`, ''); }
    }
  }
  if (model.links.length) { lines.push('=== Links stored in the file ===', ''); for (const l of model.links) lines.push(l.url); lines.push(''); }
  return lines.join(NL).replace(/\n{3,}/g, NL + NL).trimEnd() + NL;
}

/* ---------------- Markdown ---------------- */
const mdEsc = s => String(s).replace(/([\\`*_{}\[\]<>#|])/g, '\\$1');
export function markdownExport(model, { pictureDir = 'pictures' } = {}) {
  const out = [];
  const title = (model.meta.title || '').trim() || 'Publisher file';
  out.push(`# ${mdEsc(title)}`, '');
  if (model.meta.author) out.push(`Author: ${mdEsc(model.meta.author)}`, '');
  for (const s of sectionsOf(model)) {
    out.push(`## ${s.title}`, '');
    for (const it of s.items) {
      if (it.type === 'text') {
        const para = [];
        for (const p of it.paragraphs) {
          if (p === '') { if (para.length) { out.push(para.join(NL), ''); para.length = 0; } } else para.push(mdEsc(p).replace(/\n/g, '  ' + NL));
        }
        if (para.length) out.push(para.join(NL + NL), '');
      } else if (it.type === 'table') {
        const row = r => '| ' + it.grid.cells.slice(r * it.grid.cols, (r + 1) * it.grid.cols).map(c => mdEsc(c).replace(/\s*\n\s*/g, ' ')).join(' | ') + ' |';
        out.push(row(0), '| ' + new Array(it.grid.cols).fill('---').join(' | ') + ' |');
        for (let r = 1; r < it.grid.rows; r++) out.push(row(r));
        out.push('');
      } else if (it.type === 'picture') {
        const img = model.images.find(i => i.index === it.index);
        if (img) { const w = webForm(img); out.push(`![Picture ${img.index + 1}](${pictureDir}/${pictureName(img, w ? w.ext : img.ext)})`, ''); }
      }
    }
  }
  if (model.links.length) { out.push('## Links stored in the file', ''); for (const l of model.links) out.push(`- ${l.url}`); out.push(''); }
  return out.join(NL).replace(/\n{3,}/g, NL + NL).trimEnd() + NL;
}

/* ---------------- HTML reading copy ---------------- */
const b64 = u8 => { let s = ''; for (let i = 0; i < u8.length; i += 0x8000) s += String.fromCharCode.apply(null, u8.subarray(i, i + 0x8000)); return btoa(s); };
export function htmlExport(model, { embed = true, pictureDir = 'pictures' } = {}) {
  const title = (model.meta.title || '').trim() || 'Publisher file';
  const body = [];
  for (const s of sectionsOf(model)) {
    body.push(`<section class="pg"><h2>${escHtml(s.title)}</h2>`);
    for (const it of s.items) {
      if (it.type === 'text') {
        let cur = [];
        const flush = () => { if (cur.length) body.push(`<p>${cur.map(escHtml).join('<br>').replace(/\n/g, '<br>')}</p>`); cur = []; };
        for (const p of it.paragraphs) { if (p === '') flush(); else cur.push(p); }
        flush();
      } else if (it.type === 'table') {
        body.push('<table>');
        for (let r = 0; r < it.grid.rows; r++) body.push('<tr>' + it.grid.cells.slice(r * it.grid.cols, (r + 1) * it.grid.cols).map(c => `<td>${escHtml(c).replace(/\n/g, '<br>')}</td>`).join('') + '</tr>');
        body.push('</table>');
      } else if (it.type === 'picture') {
        const img = model.images.find(i => i.index === it.index);
        if (!img) continue;
        const w = webForm(img);
        if (w) {
          const src = embed ? `data:${w.mime};base64,${b64(w.bytes)}` : `${pictureDir}/${pictureName(img, w.ext)}`;
          body.push(`<figure><img src="${src}" alt="Picture ${img.index + 1}"${img.w ? ` width="${Math.min(img.w, 640)}"` : ''}></figure>`);
        } else body.push(`<p class="note">Picture ${img.index + 1} is a ${img.vector ? 'vector' : img.ext.toUpperCase()} picture that a web page cannot show (${escHtml(pictureName(img))}); it is in the pictures ZIP.</p>`);
      }
    }
    body.push('</section>');
  }
  if (model.links.length) body.push(`<section class="pg"><h2>Links stored in the file</h2><ul>${model.links.map(l => `<li>${escHtml(l.url)}</li>`).join('')}</ul></section>`);
  return [
    '<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">',
    `<title>${escHtml(title)}</title>`,
    '<style>body{font:17px/1.55 system-ui,"Segoe UI",Arial,sans-serif;max-width:46rem;margin:2rem auto;padding:0 1rem;color:#1a1c22}h1{font-size:1.9rem}h2{font-size:1.25rem;border-bottom:1px solid #c9ced6;padding-bottom:.25rem;margin-top:2rem}table{border-collapse:collapse;margin:1rem 0}td{border:1px solid #b9c0c8;padding:.35rem .6rem;vertical-align:top}img{max-width:100%;height:auto}.note{color:#555c66}@media print{.pg{break-inside:avoid-page}}</style>',
    `</head><body><h1>${escHtml(title)}</h1>${model.meta.author ? `<p class="note">Author: ${escHtml(model.meta.author)}</p>` : ''}`,
    ...body,
    '</body></html>', '',
  ].join(NL);
}

/* ---------------- Word ---------------- */
const CT = {
  png: 'image/png', jpg: 'image/jpeg', gif: 'image/gif', bmp: 'image/bmp', emf: 'image/x-emf', wmf: 'image/x-wmf', tif: 'image/tiff',
};
const NS = 'xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships" xmlns:wp="http://schemas.openxmlformats.org/drawingml/2006/wordprocessingDrawing" xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main" xmlns:pic="http://schemas.openxmlformats.org/drawingml/2006/picture"';

function run(text, { bold = false } = {}) {
  const parts = String(text).split(NL);
  return parts.map((t, i) => `<w:r>${bold ? '<w:rPr><w:b/></w:rPr>' : ''}${i ? '<w:br/>' : ''}<w:t xml:space="preserve">${xmlText(t)}</w:t></w:r>`).join('');
}
const para = (text, style) => `<w:p>${style ? `<w:pPr><w:pStyle w:val="${style}"/></w:pPr>` : ''}${run(text)}</w:p>`;

/**
 * The text and pictures as a .docx. Pictures are put in at the size they had on the page (shrunk to the text width).
 * Word accepts PNG, JPEG, GIF, BMP, EMF and WMF; a TIFF is left out of the Word file and kept in the pictures ZIP.
 */
export function docxExport(model) {
  const pw = Math.round((model.pageSize.w || 612) * 20), ph = Math.round((model.pageSize.h || 792) * 20);
  const margin = 1080; // 0.75 in
  const textWidthPt = Math.max(120, (pw - margin * 2) / 20);
  const rels = [];
  const media = {};
  const extsUsed = new Set();
  let drawId = 1;
  const imageXml = (img, box) => {
    const form = webForm(img) || (img.vector ? { ext: img.ext, bytes: img.bytes } : null);
    if (!form || !CT[form.ext] || form.ext === 'tif') return '';
    let wPt = box ? box.w : img.vector ? img.wPt : (img.w || 200) * 0.75;
    let hPt = box ? box.h : img.vector ? img.hPt : (img.h || 150) * 0.75;
    if (!(wPt > 1 && hPt > 1)) { wPt = 200; hPt = 150; }
    if (wPt > textWidthPt) { hPt *= textWidthPt / wPt; wPt = textWidthPt; }
    const rid = `rIdImg${img.index + 1}`;
    const path = `media/${pictureName(img, form.ext)}`;
    if (!media[`word/${path}`]) {
      media[`word/${path}`] = form.bytes;
      rels.push(`<Relationship Id="${rid}" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/image" Target="${path}"/>`);
      extsUsed.add(form.ext);
    }
    const cx = Math.round(wPt * EMU_PER_PT), cy = Math.round(hPt * EMU_PER_PT);
    const id = drawId++;
    return `<w:p><w:r><w:drawing><wp:inline distT="0" distB="0" distL="0" distR="0"><wp:extent cx="${cx}" cy="${cy}"/><wp:docPr id="${id}" name="Picture ${img.index + 1}" descr="Picture ${img.index + 1} from the Publisher file"/><wp:cNvGraphicFramePr><a:graphicFrameLocks noChangeAspect="1"/></wp:cNvGraphicFramePr><a:graphic><a:graphicData uri="http://schemas.openxmlformats.org/drawingml/2006/picture"><pic:pic><pic:nvPicPr><pic:cNvPr id="${id}" name="${escXml(pictureName(img, form.ext))}"/><pic:cNvPicPr/></pic:nvPicPr><pic:blipFill><a:blip r:embed="${rid}"/><a:stretch><a:fillRect/></a:stretch></pic:blipFill><pic:spPr><a:xfrm><a:off x="0" y="0"/><a:ext cx="${cx}" cy="${cy}"/></a:xfrm><a:prstGeom prst="rect"><a:avLst/></a:prstGeom></pic:spPr></pic:pic></a:graphicData></a:graphic></wp:inline></w:drawing></w:r></w:p>`;
  };
  const body = [];
  const title = (model.meta.title || '').trim();
  if (title) body.push(para(title, 'Title'));
  if (model.meta.author) body.push(para(`Author: ${model.meta.author}`));
  const secs = sectionsOf(model);
  secs.forEach((s, si) => {
    body.push(`<w:p><w:pPr><w:pStyle w:val="Heading1"/>${si > 0 ? '<w:pageBreakBefore/>' : ''}</w:pPr>${run(s.title)}</w:p>`);
    for (const it of s.items) {
      if (it.type === 'text') {
        for (const p of it.paragraphs) body.push(p === '' ? '<w:p/>' : para(p));
      } else if (it.type === 'table') {
        const cw = Math.floor((pw - margin * 2) / it.grid.cols);
        let t = `<w:tbl><w:tblPr><w:tblStyle w:val="TableGrid"/><w:tblW w:w="${cw * it.grid.cols}" w:type="dxa"/></w:tblPr><w:tblGrid>${new Array(it.grid.cols).fill(`<w:gridCol w:w="${cw}"/>`).join('')}</w:tblGrid>`;
        for (let r = 0; r < it.grid.rows; r++) {
          t += '<w:tr>' + it.grid.cells.slice(r * it.grid.cols, (r + 1) * it.grid.cols).map(c => `<w:tc><w:tcPr><w:tcW w:w="${cw}" w:type="dxa"/></w:tcPr>${para(c)}</w:tc>`).join('') + '</w:tr>';
        }
        body.push(t + '</w:tbl>', '<w:p/>');
      } else if (it.type === 'picture') {
        const img = model.images.find(i => i.index === it.index);
        if (!img) continue;
        const x = imageXml(img, it.box);
        body.push(x || para(`[Picture ${img.index + 1} is kept in the pictures ZIP as ${pictureName(img)}]`));
      }
    }
  });
  if (model.links.length) {
    body.push(`<w:p><w:pPr><w:pStyle w:val="Heading1"/><w:pageBreakBefore/></w:pPr>${run('Links stored in the file')}</w:p>`);
    for (const l of model.links) body.push(para(l.url));
  }
  if (!secs.length) body.push(para('No text or pictures were found in this file.'));
  const sect = `<w:sectPr><w:pgSz w:w="${pw}" w:h="${ph}"/><w:pgMar w:top="${margin}" w:right="${margin}" w:bottom="${margin}" w:left="${margin}" w:header="720" w:footer="720" w:gutter="0"/></w:sectPr>`;
  const doc = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>${NL}<w:document ${NS}><w:body>${body.join('')}${sect}</w:body></w:document>`;
  const styles = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>${NL}<w:styles xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main"><w:docDefaults><w:rPrDefault><w:rPr><w:rFonts w:ascii="Calibri" w:hAnsi="Calibri" w:eastAsia="Calibri" w:cs="Calibri"/><w:sz w:val="22"/><w:szCs w:val="22"/><w:lang w:val="en-US"/></w:rPr></w:rPrDefault><w:pPrDefault><w:pPr><w:spacing w:after="120" w:line="264" w:lineRule="auto"/></w:pPr></w:pPrDefault></w:docDefaults><w:style w:type="paragraph" w:default="1" w:styleId="Normal"><w:name w:val="Normal"/><w:qFormat/></w:style><w:style w:type="paragraph" w:styleId="Title"><w:name w:val="Title"/><w:basedOn w:val="Normal"/><w:next w:val="Normal"/><w:qFormat/><w:pPr><w:spacing w:after="200"/></w:pPr><w:rPr><w:b/><w:sz w:val="40"/><w:szCs w:val="40"/></w:rPr></w:style><w:style w:type="paragraph" w:styleId="Heading1"><w:name w:val="heading 1"/><w:basedOn w:val="Normal"/><w:next w:val="Normal"/><w:qFormat/><w:pPr><w:keepNext/><w:spacing w:before="240" w:after="120"/><w:outlineLvl w:val="0"/></w:pPr><w:rPr><w:b/><w:sz w:val="30"/><w:szCs w:val="30"/></w:rPr></w:style><w:style w:type="table" w:default="1" w:styleId="TableNormal"><w:name w:val="Normal Table"/><w:uiPriority w:val="99"/><w:semiHidden/><w:tblPr><w:tblInd w:w="0" w:type="dxa"/><w:tblCellMar><w:top w:w="0" w:type="dxa"/><w:left w:w="108" w:type="dxa"/><w:bottom w:w="0" w:type="dxa"/><w:right w:w="108" w:type="dxa"/></w:tblCellMar></w:tblPr></w:style><w:style w:type="table" w:styleId="TableGrid"><w:name w:val="Table Grid"/><w:basedOn w:val="TableNormal"/><w:tblPr><w:tblBorders><w:top w:val="single" w:sz="4" w:space="0" w:color="808080"/><w:left w:val="single" w:sz="4" w:space="0" w:color="808080"/><w:bottom w:val="single" w:sz="4" w:space="0" w:color="808080"/><w:right w:val="single" w:sz="4" w:space="0" w:color="808080"/><w:insideH w:val="single" w:sz="4" w:space="0" w:color="808080"/><w:insideV w:val="single" w:sz="4" w:space="0" w:color="808080"/></w:tblBorders></w:tblPr></w:style></w:styles>`;
  const ctDefaults = [...extsUsed].map(e => `<Default Extension="${e}" ContentType="${CT[e]}"/>`).join('');
  const contentTypes = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>${NL}<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/>${ctDefaults}<Override PartName="/word/document.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml"/><Override PartName="/word/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.styles+xml"/><Override PartName="/docProps/core.xml" ContentType="application/vnd.openxmlformats-package.core-properties+xml"/></Types>`;
  const rootRels = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>${NL}<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="word/document.xml"/><Relationship Id="rId2" Type="http://schemas.openxmlformats.org/package/2006/relationships/metadata/core-properties" Target="docProps/core.xml"/></Relationships>`;
  const docRels = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>${NL}<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rIdStyles" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/styles" Target="styles.xml"/>${rels.join('')}</Relationships>`;
  const core = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>${NL}<cp:coreProperties xmlns:cp="http://schemas.openxmlformats.org/package/2006/metadata/core-properties" xmlns:dc="http://purl.org/dc/elements/1.1/" xmlns:dcterms="http://purl.org/dc/terms/" xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance"><dc:title>${xmlText(title || 'Publisher file')}</dc:title>${model.meta.author ? `<dc:creator>${xmlText(model.meta.author)}</dc:creator>` : ''}</cp:coreProperties>`;
  const mtime = new Date('2026-01-01T00:00:00Z');
  const z = {
    '[Content_Types].xml': [strToU8(contentTypes), { mtime }],
    '_rels/.rels': [strToU8(rootRels), { mtime }],
    'docProps/core.xml': [strToU8(core), { mtime }],
    'word/document.xml': [strToU8(doc), { mtime }],
    'word/styles.xml': [strToU8(styles), { mtime }],
    'word/_rels/document.xml.rels': [strToU8(docRels), { mtime }],
  };
  for (const [p, bytes] of Object.entries(media)) z[p] = [bytes, { level: 0, mtime }];
  return zipSync(z);
}

/* ---------------- pictures and the whole bundle ---------------- */
export function picturesZip(model) {
  const mtime = new Date('2026-01-01T00:00:00Z');
  const z = {};
  addPictures(z, model, 'pictures/', mtime);
  z['pictures/README.txt'] = [strToU8([
    'The pictures stored in the Publisher file, as they were stored.',
    'JPG, PNG, GIF and BMP files open anywhere.',
    'WMF and EMF files are vector pictures (clip art): Word, PowerPoint, Paint, LibreOffice and Inkscape open them. Next to each one is a PNG copy that every program and phone shows; it was drawn by the page and can differ in small details.',
    'TIF and PICT files are left as they are; most programs on a PC open TIF.',
  ].join(NL) + NL), { mtime }];
  return zipSync(z);
}

export function bundleZip(model, { fileName = '' } = {}) {
  const mtime = new Date('2026-01-01T00:00:00Z');
  const stem = fileStem(fileName);
  const z = {
    [`${stem}/${stem}.docx`]: [docxExport(model), { level: 0, mtime }],
    [`${stem}/${stem}.txt`]: [strToU8(textExport(model, { fileName })), { mtime }],
    [`${stem}/${stem}.md`]: [strToU8(markdownExport(model)), { mtime }],
    [`${stem}/${stem}.html`]: [strToU8(htmlExport(model, { embed: false })), { mtime }],
  };
  addPictures(z, model, `${stem}/pictures/`, mtime);
  return zipSync(z);
}
function addPictures(z, model, dir, mtime) {
  for (const img of model.images) {
    z[dir + pictureName(img)] = [img.bytes, { level: 0, mtime }];
    if (!img.shown && img.png) z[dir + pictureName(img, 'png')] = [img.png, { level: 0, mtime }];
  }
}

/** the model without the picture bytes, for the page */
export function summaryOf(model) {
  const frameSummary = f => ({ seq: f.seq, kind: f.kind, box: f.box, paragraphs: f.paragraphs, grid: f.grid, image: f.image, continued: f.continued, links: f.links });
  return {
    format: model.format, meta: { title: model.meta.title, author: model.meta.author, lastAuthor: model.meta.lastAuthor, created: model.meta.created, modified: model.meta.modified, savedBy: model.meta.savedBy || '', hasThumbnail: !!model.meta.thumbnail },
    pageSize: model.pageSize, stats: model.stats, warnings: model.warnings,
    pages: model.pages.map(p => ({ n: p.n, frames: p.frames.map(frameSummary) })),
    masters: model.masters.map(m => ({ seq: m.seq, frames: m.frames.map(frameSummary) })),
    otherText: model.otherText.map(o => ({ paragraphs: o.paragraphs })),
    images: model.images.map(i => ({ index: i.index, kind: i.kind, ext: i.ext, mime: i.mime, size: i.size, w: i.w, h: i.h, shown: i.shown, onPage: i.onPage, vector: i.vector, wPt: i.wPt, hPt: i.hPt, name: pictureName(i) })),
    links: model.links.map(l => l.url),
  };
}
