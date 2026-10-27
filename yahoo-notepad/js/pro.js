/* Lastleaf Pro is not part of this version. This file keeps its place so more formats can be added later without
 * touching the free tool: the flag stays off, the product id stays 'PENDING', and every Pro format refuses to run.
 * While PRO.enabled is false the page loads no licence code and makes no licence request (the page's
 * Content-Security-Policy does not even allow one). Turning Pro on is a separate, reviewed change: it adds the Gumroad
 * licence check (license.js), opens connect-src to api.gumroad.com and replaces the stubs below with real exporters. */
export const PRO = Object.freeze({ enabled: false, productId: 'PENDING', permalink: 'lastleaf-pro' });
export const PRO_READY = PRO.enabled === true && !!PRO.productId && PRO.productId !== 'PENDING';

// the formats Pro will add: ENEX (Apple Notes on a Mac, Evernote, Joplin), Word, a PDF book, Markdown files and CSV
export const PRO_FORMATS = Object.freeze(['enex', 'docx', 'pdf', 'md-zip', 'csv']);

export class ProOff extends Error {
  constructor(kind) { super(`Pro format ${kind} is not available`); this.code = 'pro-off'; }
}

/** The Pro exporter for a format. With Pro off (always, in this version) it throws ProOff. */
export function proExporter(kind) {
  if (!PRO_FORMATS.includes(kind)) throw new Error(`unknown format ${kind}`);
  if (!PRO_READY) throw new ProOff(kind);
  throw new ProOff(kind); // no exporter is built yet
}
