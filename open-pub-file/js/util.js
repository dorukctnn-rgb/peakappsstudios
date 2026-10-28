// Small helpers shared by the page script. No DOM access here, so the unit tests can load it.
export const escHtml = s => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
export const plural = (n, one, many) => `${Number(n).toLocaleString('en-US')} ${n === 1 ? one : many}`;
export function formatBytes(n) {
  if (n < 1024) return `${n} B`;
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(n < 10240 ? 1 : 0)} KB`;
  return `${(n / 1048576).toFixed(n < 10485760 ? 1 : 0)} MB`;
}
/** Where a frame sits on its page, in words: "Top left", "Middle", "Full width at the bottom". box and page size are in points. */
export function positionLabel(box, page) {
  if (!box || !page || !page.w || !page.h) return '';
  const cx = (box.x + box.w / 2) / page.w, cy = (box.y + box.h / 2) / page.h;
  const v = cy < 0.34 ? 'top' : cy > 0.66 ? 'bottom' : 'middle';
  if (box.w >= page.w * 0.6) return v === 'middle' ? 'Full width, middle' : `Full width, ${v}`;
  const h = cx < 0.34 ? 'left' : cx > 0.66 ? 'right' : 'centre';
  if (v === 'middle' && h === 'centre') return 'Middle';
  if (v === 'middle') return `Middle ${h}`;
  return `${v === 'top' ? 'Top' : 'Bottom'} ${h}`;
}
