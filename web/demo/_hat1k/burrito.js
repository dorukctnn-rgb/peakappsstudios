/* Burrito kategori sablonu: cerceve yok, derleme yok. Hepsi istege bagli; sayfa JS olmadan da okunur ve calisir.
   Veri: <script type="application/json" id="r-data">.  Imlec katmani ayri dosyadir (imlec.js) ve sayfa yuklendikten SONRA, bos zamanda istenir.
   Imza hareketler (referansin teknikleri, kendi uygulamamiz):
   1. Donen sozcuk: dev slogan blogunun son satiri isletmenin kendi dolgulari arasinda maske icinde asagidan yukari kayarak degisir (gorunmezken durur).
   2. Bulaniktan nete: marka bandindaki dev yazinin her sozcugu kaydirma ilerlemesine bagli olarak sirayla netlesir; arkadaki organik lekeler kayar ve doner.
   3. 3D malzemeler: kahramandaki ve kutulardaki atlas kareleri kaydirdikca (ve kutuda fareyle) kendi ekseninde doner. */
(function () {
  'use strict';
  var d = document, root = d.documentElement, w = window;
  var ME = (d.currentScript && d.currentScript.src) || '';
  var data = {}; try { data = JSON.parse((d.getElementById('r-data') || {}).textContent || '{}'); } catch (e) { data = {}; }
  var T = data.t || {};
  var DAYS = data.days || [];
  var H = data.h || null;       // dakika: [acilis, kapanis] ya da null, indeks = haftanin gunu (0 Pazar)
  var TZ = data.tz || null;
  var mq = function (q) { return !!(w.matchMedia && w.matchMedia(q).matches); };
  var REDUCED = mq('(prefers-reduced-motion: reduce)');
  var STILL = root.classList.contains('still');
  var motion = !REDUCED && !STILL;
  var each = function (sel, fn, ctx) { [].forEach.call((ctx || d).querySelectorAll(sel), fn); };
  var clamp = function (x, a, b) { return x < a ? a : x > b ? b : x; };
  var NF = 16;

  /* ---- simdi acik (isletmenin saat dilimiyle) ---- */
  var H12 = !!data.h12;
  function hhmm(m) {
    m = m % 1440; var h = Math.floor(m / 60), mi = m % 60;
    if (!H12) return ('0' + h).slice(-2) + ':' + ('0' + mi).slice(-2);
    if (!h && !mi) return 'midnight'; if (h === 12 && !mi) return 'noon';
    return (h % 12 || 12) + (mi ? ':' + ('0' + mi).slice(-2) : '') + (h >= 12 ? ' pm' : ' am');
  }
  function nowIn() {
    try {
      var p = new Intl.DateTimeFormat('en-GB', { timeZone: TZ, weekday: 'short', hour: '2-digit', minute: '2-digit', hour12: false }).formatToParts(new Date());
      var o = {}; p.forEach(function (x) { o[x.type] = x.value; });
      var wd = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'].indexOf(o.weekday);
      return { wd: wd < 0 ? 0 : wd, min: (+o.hour % 24) * 60 + +o.minute };
    } catch (e) { var n = new Date(); return { wd: n.getDay(), min: n.getHours() * 60 + n.getMinutes() }; }
  }
  function status() {
    if (!H || !TZ) return null;
    var n = nowIn(), t = H[n.wd], y = H[(n.wd + 6) % 7];
    if (t && n.min >= t[0] && n.min < t[1]) return { open: true, text: T.open.replace('{t}', hhmm(t[1])) };
    if (y && y[1] > 1440 && n.min < y[1] - 1440) return { open: true, text: T.open.replace('{t}', hhmm(y[1])) };
    if (t && n.min < t[0]) return { open: false, text: T.shut.replace('{w}', T.today.replace('{t}', hhmm(t[0]))) };
    for (var i = 1; i <= 7; i++) {
      var k = (n.wd + i) % 7;
      if (H[k]) return { open: false, text: T.shut.replace('{w}', i === 1 ? T.tomorrow.replace('{t}', hhmm(H[k][0])) : T.dayAt.replace('{d}', DAYS[k]).replace('{t}', hhmm(H[k][0]))) };
    }
    return null;
  }
  function paintStatus() {
    var s = status();
    each('[data-status]', function (el) {
      if (!s) { el.setAttribute('data-empty', ''); return; }
      el.removeAttribute('data-empty');
      el.classList.toggle('open', s.open);
      var b = el.querySelector('b'); if (b) b.textContent = s.text;
    });
    if (TZ && H) {
      var n = nowIn(), t = H[n.wd];
      each('.hours tr', function (r) { r.classList.toggle('today', +r.getAttribute('data-day') === n.wd); });
      each('[data-today]', function (el) { el.textContent = t ? hhmm(t[0]) + ' to ' + hhmm(t[1]) : 'Closed today'; });
    }
  }
  paintStatus(); setInterval(paintStatus, 60000);

  /* ---- kaydirmaya bagli sahneler (tek rAF) ---- */
  var top = d.querySelector('.top');
  var band = d.querySelector('.band');
  var words = band ? [].slice.call(band.querySelectorAll('.aw')) : [];
  var blobs = band ? [].slice.call(band.querySelectorAll('.lk')) : [];
  var heroEl = d.querySelector('.hero');
  var orbs = [].slice.call(d.querySelectorAll('.orb'));
  var tilesEl = d.querySelector('.tiles');
  var tileSpr = [].slice.call(d.querySelectorAll('.tile-spr'));
  var takeSpr = d.querySelector('.take-spr');
  function setF(el, f) { f = ((f % NF) + NF) % NF; if (el.__f !== f) { el.__f = f; el.style.setProperty('--f', f); } }
  var ticking = false;
  function frame() {
    ticking = false;
    var y = w.scrollY || 0, vh = w.innerHeight;
    if (top) top.classList.toggle('solid', y > 24);
    if (!motion) return;
    // kahraman: malzemeler kaydirdikca doner ve hafifce yukselir
    if (heroEl && orbs.length) {
      var hr = heroEl.getBoundingClientRect();
      if (hr.bottom > 0) for (var i = 0; i < orbs.length; i++) { var o = orbs[i], f0 = +o.getAttribute('data-f0') || 0; setF(o, f0 + Math.round(Math.sin(y / (90 + i * 30) + i) * 2)); o.style.setProperty('--oy', (-y * (0.12 + i * 0.07)).toFixed(1) + 'px'); }
    }
    // kutular: izgara gorunurken kaydirmaya bagli salinim (yuzu gorunen karenin +-2 karesi; yandan ince disk gorunmez); fareyle uzerindeki tam tur doner
    if (tilesEl && tileSpr.length) {
      var tr = tilesEl.getBoundingClientRect();
      if (tr.bottom > -40 && tr.top < vh + 40) { var tp = (vh - tr.top) / (vh + tr.height); for (var j = 0; j < tileSpr.length; j++) { var s = tileSpr[j]; if (s.__hov) continue; setF(s, (+s.getAttribute('data-f0') || 0) + Math.round(Math.sin(tp * Math.PI * 3 + j * 0.9) * 2)); } }
    }
    if (takeSpr) { var kr = takeSpr.getBoundingClientRect(); if (kr.bottom > 0 && kr.top < vh) setF(takeSpr, 4 + Math.floor((vh - kr.top) / 40)); }
    // marka bandi: sozcukler sirayla netlesir; lekeler kayar ve doner
    if (band) {
      var r = band.getBoundingClientRect();
      var on = r.bottom > -60 && r.top < vh + 60; band.classList.toggle('live', on);
      if (on) {
        var p = clamp((vh * 0.92 - r.top) / (vh * 0.75), 0, 1), N = words.length;
        for (var k = 0; k < N; k++) { var q = clamp(p * (N + 1.2) - k, 0, 1); q = q * q * (3 - 2 * q); var wv = words[k]; if (wv.__p !== q) { wv.__p = q; wv.style.setProperty('--p', q.toFixed(3)); } }
        var bp = (vh - r.top) / (vh + r.height);
        for (var b = 0; b < blobs.length; b++) { var L = blobs[b], dir = b % 2 ? -1 : 1; L.style.setProperty('--ly', ((bp - 0.5) * (120 + b * 30) * dir).toFixed(1) + 'px'); L.style.setProperty('--lr', ((bp - 0.5) * (40 + b * 12) * dir).toFixed(2) + 'deg'); }
      }
    }
  }
  function onScroll() { if (!ticking) { ticking = true; w.requestAnimationFrame(frame); } }
  if (motion) for (var z = 0; z < words.length; z++) { words[z].__p = 0; words[z].style.setProperty('--p', '0'); }
  frame(); w.addEventListener('scroll', onScroll, { passive: true }); w.addEventListener('resize', onScroll, { passive: true });

  /* ---- kutu uzerinde 3D malzeme hizli doner (fare) ---- */
  if (motion) each('.tile a', function (a) {
    var s = a.querySelector('.tile-spr'); if (!s) return; var timer = 0;
    a.addEventListener('pointerenter', function (e) { if (e.pointerType !== 'mouse') return; s.__hov = true; clearInterval(timer); timer = setInterval(function () { setF(s, (s.__f || 0) + 1); }, 55); });
    a.addEventListener('pointerleave', function () { clearInterval(timer); s.__hov = false; onScroll(); });
  });

  /* ---- donen sozcuk: gorunurken 2,4 sn'de bir; sekme arka plandayken ya da bolum ekranda degilken durur ---- */
  var rot = d.querySelector('[data-rot]');
  if (rot && motion) {
    var rw = [].slice.call(rot.querySelectorAll('.rw')), ri = 0, vis = false, rt = 0;
    var step = function () {
      if (!vis || d.hidden) return;
      var cur = rw[ri], nx = rw[(ri + 1) % rw.length];
      cur.classList.remove('on'); cur.classList.add('off');
      nx.classList.remove('off'); nx.style.transition = 'none'; nx.style.transform = 'translateY(104%)'; void nx.offsetWidth; nx.style.transition = ''; nx.style.transform = ''; nx.classList.add('on');
      // cikan sozcuk ustte kaybolduktan sonra gecissiz olarak alttaki bekleme yerine doner (gorunur alandan gecmez)
      var prev = cur; setTimeout(function () { prev.style.transition = 'none'; prev.classList.remove('off'); void prev.offsetWidth; prev.style.transition = ''; }, 800);
      ri = (ri + 1) % rw.length;
    };
    if ('IntersectionObserver' in w) new IntersectionObserver(function (es) { vis = es[0].isIntersecting; clearInterval(rt); if (vis) rt = setInterval(step, 2400); }, { threshold: 0.2 }).observe(rot);
  }

  /* ---- menu: sekmeler (klavye: sol/sag ok) + kutulardan ve kartlardan sekme secimi ---- */
  var tabs = [].slice.call(d.querySelectorAll('.tab'));
  var panels = [].slice.call(d.querySelectorAll('.panel'));
  function pick(i, user) {
    tabs.forEach(function (t, j) { t.setAttribute('aria-selected', j === i ? 'true' : 'false'); t.tabIndex = j === i ? 0 : -1; });
    panels.forEach(function (p, j) { p.hidden = j !== i; p.classList.toggle('swap', !!user && j === i && motion); });
    var t = tabs[i]; if (user && t && t.scrollIntoView && t.parentNode.scrollWidth > t.parentNode.clientWidth) t.scrollIntoView({ block: 'nearest', inline: 'center', behavior: motion ? 'smooth' : 'auto' });
  }
  tabs.forEach(function (t, i) {
    t.addEventListener('click', function () { pick(i, true); });
    t.addEventListener('keydown', function (e) {
      if (e.key === 'ArrowRight' || e.key === 'ArrowLeft') { var j = (i + (e.key === 'ArrowRight' ? 1 : tabs.length - 1)) % tabs.length; pick(j, true); tabs[j].focus(); e.preventDefault(); }
    });
  });
  each('[data-tab]', function (a) { a.addEventListener('click', function () { var i = +a.getAttribute('data-tab'); if (tabs[i]) pick(i, true); }); });
  if (tabs.length) pick(0);

  /* ---- kaydirinca belirme ---- */
  if ('IntersectionObserver' in w && motion) {
    root.classList.add('js');
    var io = new IntersectionObserver(function (es) { es.forEach(function (e) { if (e.isIntersecting) { e.target.classList.add('in'); io.unobserve(e.target); } }); }, { rootMargin: '0px 0px -6% 0px', threshold: 0.06 });
    each('.rv, .tiles, .cards', function (el) { io.observe(el); });
  }

  /* ---- imlec / dokunma katmani (imlec.js): sayfa yuklendikten sonra, bos zamanda ---- */
  function wantFx() {
    if (!motion || /[?&]nofx=1/.test(location.search)) return false;
    var c = navigator.connection || {}; if (c.saveData) return false;
    if (navigator.deviceMemory && navigator.deviceMemory < 2) return false;
    return true;
  }
  function loadFx() {
    if (!wantFx() || !ME) return;
    var s = d.createElement('script'); s.src = ME.replace(/\/[^\/?#]+(\?[^#]*)?$/, '/imlec.js$1'); s.async = true; d.head.appendChild(s);
  }
  var idle = function () { (w.requestIdleCallback || function (f) { return setTimeout(f, 200); })(loadFx, { timeout: 1500 }); };
  if (d.readyState === 'complete') idle(); else w.addEventListener('load', idle);
})();
