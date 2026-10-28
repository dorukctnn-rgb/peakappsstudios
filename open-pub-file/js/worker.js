// Unframe worker: reads the .pub file off the page's main thread, so a big file never freezes the page, and keeps the file's
// text and pictures here while the page shows them. Nothing here touches the network.
// In:  { type: 'open', id, bytes, name } | { type: 'sample', id } | { type: 'check', id, bytes, name }
//      | { type: 'attach', index, png } | { type: 'export', id, kind } | { type: 'picture', id, index, form }
// Out: { type: 'opened', id, summary, previews, name, sample } | { type: 'checked', id, ok, ... } | { type: 'file', id, name, mime, bytes }
//      | { type: 'error', id, code, detail }
import { openPub, PubError } from './pubfile.js';
import { docxExport, textExport, markdownExport, htmlExport, picturesZip, bundleZip, summaryOf, pictureName, fileStem, webForm } from './export.js';

let current = null; // { model, name, sample }
const MAX_PREVIEW = 6 * 1024 * 1024;
const MAX_PREVIEW_TOTAL = 60 * 1024 * 1024;

const MIME = {
  docx: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  txt: 'text/plain;charset=utf-8', md: 'text/markdown;charset=utf-8', html: 'text/html;charset=utf-8', zip: 'application/zip',
};

function open(m, bytes, name, sample) {
  const model = openPub(bytes);
  current = { model, name, sample };
  const previews = [];
  let total = 0;
  for (const img of model.images) {
    if ((!img.shown && !img.vector) || img.size > MAX_PREVIEW || total + img.size > MAX_PREVIEW_TOTAL) continue;
    total += img.size;
    previews.push({ index: img.index, kind: img.kind, ext: img.ext, mime: img.mime, vector: img.vector, bytes: img.bytes.slice() });
  }
  const thumb = model.meta.thumbnail ? { mime: model.meta.thumbnail.mime, bytes: model.meta.thumbnail.bytes.slice() } : null;
  self.postMessage({ type: 'opened', id: m.id, summary: summaryOf(model), previews, thumb, name, sample });
}

self.onmessage = async ev => {
  const m = ev.data || {};
  try {
    if (m.type === 'open') {
      open(m, new Uint8Array(m.bytes), m.name || 'file.pub', false);
      return;
    }
    if (m.type === 'sample') {
      const { sampleBytes } = await import('./sample.js');
      open(m, sampleBytes(), 'sample.pub', true);
      return;
    }
    if (m.type === 'check') {
      try {
        const model = openPub(new Uint8Array(m.bytes));
        self.postMessage({ type: 'checked', id: m.id, ok: true, pages: model.stats.pages, words: model.stats.words, pictures: model.stats.images, savedBy: model.meta.savedBy || '', title: model.meta.title || '' });
      } catch (e) {
        self.postMessage({ type: 'checked', id: m.id, ok: false, code: e instanceof PubError ? e.code : 'corrupt' });
      }
      return;
    }
    if (!current) throw new PubError('no-file');
    if (m.type === 'attach') {
      const img = current.model.images.find(i => i.index === m.index);
      if (img && m.png && m.png.length < 40 * 1024 * 1024) img.png = new Uint8Array(m.png);
      return;
    }
    const stem = fileStem(current.name);
    if (m.type === 'export') {
      let out;
      if (m.kind === 'docx') out = { name: `${stem}.docx`, mime: MIME.docx, bytes: docxExport(current.model) };
      else if (m.kind === 'txt') out = { name: `${stem}.txt`, mime: MIME.txt, bytes: new TextEncoder().encode(textExport(current.model, { fileName: current.name })) };
      else if (m.kind === 'md') out = { name: `${stem}.md`, mime: MIME.md, bytes: new TextEncoder().encode(markdownExport(current.model, { pictureDir: 'pictures' })) };
      else if (m.kind === 'html') out = { name: `${stem}.html`, mime: MIME.html, bytes: new TextEncoder().encode(htmlExport(current.model, { embed: true })) };
      else if (m.kind === 'pictures') out = { name: `${stem}-pictures.zip`, mime: MIME.zip, bytes: picturesZip(current.model) };
      else if (m.kind === 'bundle') out = { name: `${stem}-text-and-pictures.zip`, mime: MIME.zip, bytes: bundleZip(current.model, { fileName: current.name }) };
      else throw new Error('unknown export');
      self.postMessage({ type: 'file', id: m.id, name: out.name, mime: out.mime, bytes: out.bytes }, [out.bytes.buffer]);
      return;
    }
    if (m.type === 'picture') {
      const img = current.model.images.find(i => i.index === m.index);
      if (!img) throw new Error('no such picture');
      let bytes = img.bytes, name = pictureName(img), mime = img.mime || 'application/octet-stream';
      if (m.form === 'png') { const w = webForm(img); if (!w) throw new Error('no png'); bytes = w.bytes; name = pictureName(img, w.ext); mime = w.mime; }
      const copy = bytes.slice();
      self.postMessage({ type: 'file', id: m.id, name, mime, bytes: copy }, [copy.buffer]);
    }
  } catch (e) {
    self.postMessage({ type: 'error', id: m.id, code: e instanceof PubError ? e.code : (e && e.code) || 'corrupt', detail: String((e && e.message) || '') });
  }
};
