// Hero loader. The poster image is the hero until the visitor does something: the first
// scroll, wheel, touch, click, key or mouse move fetches three.js and starts the live pole.
// A visitor who only reads gets it once the page has sat idle for a few seconds after load.
// Reduced motion and Save-Data keep the poster: there the live pole would be the same still.
const host = document.getElementById('hero-scene');
const conn = navigator.connection;
const still = matchMedia('(prefers-reduced-motion: reduce)').matches || (conn && conn.saveData);
const EVENTS = ['scroll', 'wheel', 'touchstart', 'pointerdown', 'keydown', 'mousemove'];
const OPTS = { capture: true, passive: true };
const IDLE_MS = 4500;
let armed = false, timer = 0;

// once the visitor has acted, fetch the whole module graph side by side instead of in a chain
function preload() {
  const urls = ['./hero-scene.js', './models.js', './vendor/RoomEnvironment.js', './vendor/RoundedBoxGeometry.js'].map((u) => new URL(u, import.meta.url).href);
  try {
    const three = import.meta.resolve('three');
    urls.push(three, new URL('three.core.min.js', three).href);
  } catch (e) { /* no import.meta.resolve: the chain still loads, just later */ }
  urls.forEach((href) => {
    const l = document.createElement('link');
    l.rel = 'modulepreload'; l.href = href;
    document.head.appendChild(l);
  });
}

function go() {
  if (armed) return;
  armed = true;
  clearTimeout(timer);
  EVENTS.forEach((e) => removeEventListener(e, go, OPTS));
  preload();
  import('./hero-scene.js')
    .then((m) => {
      const run = () => m.start();
      if ('requestIdleCallback' in window) requestIdleCallback(run, { timeout: 700 }); else setTimeout(run, 50);
    })
    .catch(() => { /* the poster stays; the page is complete without the live pole */ });
}

if (host && !still) {
  EVENTS.forEach((e) => addEventListener(e, go, OPTS));
  const idle = () => { if (!armed) timer = setTimeout(go, IDLE_MS); };
  if (document.readyState === 'complete') idle(); else addEventListener('load', idle, { once: true });
}
