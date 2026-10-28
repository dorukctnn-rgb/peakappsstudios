// Rehoused worker: opens the Weebly archive off the page's main thread, so a big ZIP never freezes the page, and keeps the
// archive's files here while the page shows the report. Nothing here touches the network.
// In:  { type: 'open', bytes } | { type: 'sample' } | { type: 'pick', key } | { type: 'preview', file, opts }
//      | { type: 'zip', opts } | { type: 'csv' }
// Out: { type: 'sites', sites } | { type: 'done', summary, sample } | { type: 'preview', html, images } | { type: 'zip', bytes, name }
//      | { type: 'csv', text } | { type: 'error', code, detail }
import { openArchive, readSite, summaryOf, pageHtml, zipCleanSite, reportCsv, mimeOf, OpenError } from './engine.js';

let sites = [];
let current = null; // { site, files, sample }

function load(s, sample) {
  const site = readSite(s.files);
  current = { site, files: s.files, sample };
  self.postMessage({ type: 'done', summary: summaryOf(site), sample, root: s.root });
}

self.onmessage = async ev => {
  const m = ev.data || {};
  try {
    if (m.type === 'sample') {
      const { sampleBytes } = await import('./sample.js');
      sites = openArchive(sampleBytes());
      load(sites[0], true);
      return;
    }
    if (m.type === 'open') {
      sites = openArchive(new Uint8Array(m.bytes));
      if (sites.length > 1) {
        self.postMessage({ type: 'sites', sites: sites.map(s => { const r = readSite(s.files); return { key: s.key, root: s.root, title: r.title, pages: r.pages.length }; }) });
        return;
      }
      load(sites[0], false);
      return;
    }
    if (m.type === 'pick') {
      const s = sites.find(x => x.key === m.key);
      if (!s) throw new OpenError('no-pages');
      load(s, false);
      return;
    }
    if (!current) throw new OpenError('no-site');
    if (m.type === 'preview') {
      const page = current.site.pages.find(p => p.file === m.file) || current.site.pages[0];
      const html = pageHtml(current.site, page, m.opts || {}, true);
      const images = {};
      for (const ref of html.matchAll(/data-rh-(?:src|bg)="([^"]+)"/g)) {
        const p = ref[1].replace(/&amp;/g, '&').replace(/&quot;/g, '"');
        const bytes = current.files.get(p);
        if (bytes && !images[p]) images[p] = { bytes: bytes.slice(), type: mimeOf(p) };
      }
      self.postMessage({ type: 'preview', file: page.file, html, images });
      return;
    }
    if (m.type === 'zip') {
      const z = zipCleanSite(current.site, current.files, m.opts || {});
      self.postMessage({ type: 'zip', bytes: z.bytes, name: `${z.folder}-clean-site.zip`, count: z.count }, [z.bytes.buffer]);
      return;
    }
    if (m.type === 'csv') {
      self.postMessage({ type: 'csv', text: reportCsv(current.site) });
    }
  } catch (e) {
    self.postMessage({ type: 'error', code: e.code || 'corrupt', detail: String(e.message || '') });
  }
};
