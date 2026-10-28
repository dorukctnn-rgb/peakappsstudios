/* Unframe Pro is not part of this version. This file keeps its place so more outputs can be added later without
 * touching the free tool: the flag stays off, the product id stays 'PENDING', and every Pro output refuses to run.
 * While PRO.enabled is false the page loads no licence code and makes no licence request (the page's
 * Content-Security-Policy does not even allow one). Turning Pro on is a separate, reviewed change: it adds the Gumroad
 * licence check (license.js), opens connect-src to api.gumroad.com and replaces the stubs below with real exporters. */
export const PRO = Object.freeze({ enabled: false, productId: 'PENDING', permalink: 'unframe-pro' });
export const PRO_READY = PRO.enabled === true && !!PRO.productId && PRO.productId !== 'PENDING';

// the outputs Pro would add: a whole folder of .pub files turned into Word, text and picture files in one go, a layout
// preview closer to the page, and a PDF of the text and pictures
export const PRO_FORMATS = Object.freeze(['folder-batch', 'layout-preview', 'pdf']);

export class ProOff extends Error {
  constructor(kind) { super(`Pro output ${kind} is not available`); this.code = 'pro-off'; }
}

/** The Pro exporter for an output. With Pro off (always, in this version) it throws ProOff. */
export function proExporter(kind) {
  if (!PRO_FORMATS.includes(kind)) throw new Error(`unknown output ${kind}`);
  if (!PRO_READY) throw new ProOff(kind);
  throw new ProOff(kind); // no exporter is built yet
}
