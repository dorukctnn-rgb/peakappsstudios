/* Loads Nightjar's page logic once the page has painted: after the load event, or at once when you touch the page
 * first. A button pressed in that moment is pressed again as soon as the logic is ready, so no tap is lost. */
let started = false, pending = null;
function go() {
  if (started) return;
  started = true;
  import('./app.js').then(() => { if (pending && pending.isConnected) pending.click(); pending = null; });
}
function early(e) {
  if (document.documentElement.dataset.njReady) return;
  const b = e.target && e.target.closest && e.target.closest('button[id], a[id^="btn-"]');
  if (e.type === 'click' && b) { e.preventDefault(); e.stopPropagation(); pending = b; }
  go();
}
['pointerdown', 'keydown', 'click'].forEach(t => addEventListener(t, early, { capture: true, passive: t !== 'click' }));
if (document.readyState === 'complete') go(); else addEventListener('load', go, { once: true });
