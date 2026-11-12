/* Pastane kategori sablonu: cerceve yok, derleme yok.  Hepsi istege bagli; sayfa JS olmadan da okunur ve calisir.
   Veri: <script type="application/json" id="r-data">.  Imlec katmani ayri dosyadir (imlec.js) ve sayfa yuklendikten SONRA, bos zamanda istenir.
   Hareketler: kahramandaki urun kesitleri kaydirdikca kendi ekseninde doner ve hafifce yukselir; hikaye cumlesinin sozcukleri kaydirma ilerlemesiyle
   sirayla belirir; vitrin fareyle yatay surukleme ile de kayar.  Imza hareket imlec.js'te: imleci isletmenin kendi urunleri izler. */
(function () {
  'use strict';
  var d = document, root = d.documentElement, w = window;
  var ME = (d.currentScript && d.currentScript.src) || '';
  var data = {}; try { data = JSON.parse((d.getElementById('r-data') || {}).textContent || '{}'); } catch (e) { data = {}; }
  var T = data.t || {};
  var DAYS = data.days || [];
  var H = data.h || null;       // dakika: [acilis, kapanis] ya da null, indeks = haftanin gunu (0 Pazar)
  var TZ = data.tz || null;
  var NF = (data.imlec && data.imlec.frames) || 12;
  var mq = function (q) { return !!(w.matchMedia && w.matchMedia(q).matches); };
  var REDUCED = mq('(prefers-reduced-motion: reduce)');
  var STILL = root.classList.contains('still');
  var motion = !REDUCED && !STILL;
  var each = function (sel, fn, ctx) { [].forEach.call((ctx || d).querySelectorAll(sel), fn); };
  var clamp = function (x, a, b) { return x < a ? a : x > b ? b : x; };

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
      // telefonda kisa durum ("Şimdi açık"); kalan kisim ekran okuyucuda kalir, gozden gizlenir (.st-x)
      var b = el.querySelector('b');
      if (b) { var k = s.text.search(/\s·\s|,\s/); b.textContent = k > 0 ? s.text.slice(0, k) : s.text; if (k > 0) { var x = d.createElement('span'); x.className = 'st-x'; x.textContent = s.text.slice(k); b.appendChild(x); } }
    });
    if (TZ && H) {
      var n = nowIn(), t = H[n.wd];
      each('.hours tr', function (r) { r.classList.toggle('today', +r.getAttribute('data-day') === n.wd); });
      each('[data-today]', function (el) { el.textContent = t ? hhmm(t[0]) + (T.to || ' to ') + hhmm(t[1]) : (T.closedToday || 'Closed today'); });
    }
  }
  paintStatus(); setInterval(paintStatus, 60000);

  /* ---- kaydirmaya bagli sahneler (tek rAF) ---- */
  var top = d.querySelector('.top');
  var heroEl = d.querySelector('.hero');
  var orbs = [].slice.call(d.querySelectorAll('.orb'));
  var quote = d.querySelector('.quote');
  var qws = quote ? [].slice.call(quote.querySelectorAll('.qw')) : [];
  var takeSpr = d.querySelector('.take-spr');
  function setF(el, f) { f = ((f % NF) + NF) % NF; if (el.__f !== f) { el.__f = f; el.style.setProperty('--f', f); } }
  var ticking = false;
  function frame() {
    ticking = false;
    var y = w.scrollY || 0, vh = w.innerHeight;
    if (top) top.classList.toggle('solid', y > 24);
    if (!motion) return;
    // kahraman: kesitler kaydirdikca yuzunden kenarina dogru salinir (tam tur degil: on yuz cogunlukla gorunur) ve farkli hizla yukselir
    if (heroEl && orbs.length) {
      var hr = heroEl.getBoundingClientRect();
      if (hr.bottom > 0) for (var i = 0; i < orbs.length; i++) { var o = orbs[i]; setF(o, Math.round(Math.sin(y / (110 + i * 40) + i * 1.3) * 2.2)); o.style.setProperty('--oy', (-y * (0.1 + i * 0.07)).toFixed(1) + 'px'); }
    }
    if (takeSpr) { var kr = takeSpr.getBoundingClientRect(); if (kr.bottom > 0 && kr.top < vh) setF(takeSpr, Math.round(Math.sin((vh - kr.top) / 90) * 2)); }
    // hikaye cumlesi: sozcukler sirayla belirir
    if (quote && qws.length) {
      var r = quote.getBoundingClientRect();
      if (r.bottom > -40 && r.top < vh + 40) {
        var p = clamp((vh * 0.9 - r.top) / (vh * 0.62), 0, 1), N = qws.length;
        for (var k = 0; k < N; k++) { var q = clamp(p * (N + 1.5) - k, 0, 1); q = q * q * (3 - 2 * q); var wv = qws[k]; if (wv.__p !== q) { wv.__p = q; wv.style.setProperty('--p', q.toFixed(3)); } }
      }
    }
  }
  function onScroll() { if (!ticking) { ticking = true; w.requestAnimationFrame(frame); } }
  if (motion) for (var z = 0; z < qws.length; z++) { qws[z].__p = 0; qws[z].style.setProperty('--p', '0'); }
  frame(); w.addEventListener('scroll', onScroll, { passive: true }); w.addEventListener('resize', onScroll, { passive: true });

  /* ---- vitrin: fareyle yatay surukleme (dokunmada tarayicinin kendi kaydirmasi) ---- */
  var sl = d.getElementById('slides');
  if (sl) {
    var down = false, sx = 0, sl0 = 0, moved = 0;
    sl.addEventListener('pointerdown', function (e) { if (e.pointerType !== 'mouse' || e.button !== 0) return; down = true; moved = 0; sx = e.clientX; sl0 = sl.scrollLeft; sl.style.scrollSnapType = 'none'; });
    w.addEventListener('pointermove', function (e) { if (!down) return; var dx = e.clientX - sx; moved = Math.max(moved, Math.abs(dx)); sl.scrollLeft = sl0 - dx; });
    w.addEventListener('pointerup', function () { if (!down) return; down = false; sl.style.scrollSnapType = ''; });
    sl.addEventListener('click', function (e) { if (moved > 6) { e.preventDefault(); e.stopPropagation(); } }, true);
    sl.addEventListener('dragstart', function (e) { e.preventDefault(); });
  }

  /* ---- menu: sekmeler (klavye: sol/sag ok) + vitrin kartlarindan sekme secimi ---- */
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
    each('.rv, .slides', function (el) { io.observe(el); });
  }

  /* ---- imlec / dokunma katmani (imlec.js): sayfa yuklendikten sonra, bos zamanda ---- */
  function wantFx() {
    if (!motion || /[?&]nofx=1/.test(location.search)) return false;
    var c = navigator.connection || {}; if (c.saveData) return false;
    if (navigator.deviceMemory && navigator.deviceMemory < 2) return false;
    return !!data.imlec;
  }
  function loadFx() {
    if (!wantFx() || !ME) return;
    var s = d.createElement('script'); s.src = ME.replace(/\/[^\/?#]+(\?[^#]*)?$/, '/imlec.js$1'); s.async = true; d.head.appendChild(s);
  }
  var idle = function () { (w.requestIdleCallback || function (f) { return setTimeout(f, 200); })(loadFx, { timeout: 1500 }); };
  if (d.readyState === 'complete') idle(); else w.addEventListener('load', idle);
})();
