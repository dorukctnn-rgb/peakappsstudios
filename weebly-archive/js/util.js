// Small helpers shared by the page (app.js) and the engine, kept apart so the page loads no more than it needs at first paint:
// the engine, the HTML reader and the ZIP library are read by the worker, and only when an archive is opened.
export const escHtml = s => String(s ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
export const stamp = d => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
export const DEFAULTS = { accent: '#24508f', headings: 'serif', domain: '', email: '', year: null };
const HEX = /^#[0-9a-f]{6}$/i;

function luminance(hex) {
  const c = [1, 3, 5].map(i => parseInt(hex.slice(i, i + 2), 16) / 255).map(v => (v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4));
  return 0.2126 * c[0] + 0.7152 * c[1] + 0.0722 * c[2];
}
const contrast = (a, b) => { const [x, y] = [luminance(a), luminance(b)].sort((p, q) => q - p); return (x + 0.05) / (y + 0.05); };
/** the accent, darkened until white text on it and it on white both pass 4.5:1 */
export function safeAccent(hex) {
  let h = HEX.test(hex || '') ? hex.toLowerCase() : DEFAULTS.accent;
  for (let i = 0; i < 40 && contrast(h, '#ffffff') < 4.5; i++) h = '#' + [1, 3, 5].map(k => Math.max(0, Math.round(parseInt(h.slice(k, k + 2), 16) * 0.92)).toString(16).padStart(2, '0')).join('');
  return h;
}
