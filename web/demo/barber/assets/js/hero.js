// Hero loader. The poster image paints the hero on first load; three.js and the live pole
// are fetched only after the page has loaded and the main thread is idle, and never on
// Save-Data connections (the poster stays, the page is complete without it).
const host = document.getElementById('hero-scene');
const saveData = navigator.connection && navigator.connection.saveData;
function go() {
  import('./hero-scene.js').then((m) => m.start()).catch(() => { /* poster remains */ });
}
function later() {
  if ('requestIdleCallback' in window) requestIdleCallback(go, { timeout: 1500 }); else setTimeout(go, 200);
}
if (host && !saveData) {
  if (document.readyState === 'complete') later(); else addEventListener('load', later, { once: true });
}
