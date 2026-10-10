/* Pay equity family: gives every table cell on the page the name of its column (data-h), so that on a phone, where
 * /assets/pay-equity.css lays each row out as a block, every value keeps its heading. Handles rowspan and colspan,
 * leaves cells that already carry a label (data-l or data-h) alone, and labels tables the tools build later too. */
(function () {
  'use strict';
  function label(table) {
    const head = table.tHead && table.tHead.rows[0];
    if (!head) return;
    const names = [];
    for (const th of head.cells) { const n = th.textContent.replace(/\s+/g, ' ').trim(); for (let k = 0; k < (th.colSpan || 1); k++) names.push(n); }
    const span = [];
    for (const body of table.tBodies) {
      for (const tr of body.rows) {
        const busy = span.map(v => v > 0);
        let col = 0;
        for (const cell of tr.cells) {
          while (busy[col]) col++;
          if (!cell.hasAttribute('data-l') && !cell.hasAttribute('data-h') && names[col]) cell.setAttribute('data-h', names[col]);
          const cs = cell.colSpan || 1, rs = cell.rowSpan || 1;
          for (let c = col; c < col + cs; c++) if (rs > 1) span[c] = rs;
          col += cs;
        }
        for (let c = 0; c < span.length; c++) if (span[c] > 0) span[c]--;
      }
    }
  }
  function all() { document.querySelectorAll('main table').forEach(label); }
  all();
  let queued = false;
  const main = document.querySelector('main');
  if (main && 'MutationObserver' in window) new MutationObserver(() => {
    if (queued) return;
    queued = true;
    requestAnimationFrame(() => { queued = false; all(); });
  }).observe(main, { childList: true, subtree: true });
})();
