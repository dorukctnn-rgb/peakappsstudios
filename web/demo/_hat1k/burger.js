/* Burger kategori sablonu: cerceve yok, derleme yok. Hepsi istege bagli; sayfa JS olmadan da okunur ve calisir.
   Veri: <script type="application/json" id="r-data">.  Imlec katmani ayri dosyadir (imlec.js) ve sayfa yuklendikten SONRA, bos zamanda istenir. */
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
      each('[data-today]', function (el) { el.textContent = t ? hhmm(t[0]) + (T.to || ' to ') + hhmm(t[1]) : (T.closedToday || 'Closed today'); });
    }
  }
  paintStatus(); setInterval(paintStatus, 60000);

  /* ---- ust cubuk + kaydirmaya bagli sahneler (tek rAF): bant malzemeleri 3D doner, tam foto cercevesi acilir ---- */
  var top = d.querySelector('.top');
  var band = d.querySelector('.band');
  var fls = band ? [].slice.call(band.querySelectorAll('.fl')) : [];
  var NF = band ? +(getComputedStyle(band.querySelector('.fl-layer') || band).getPropertyValue('--frames') || 16) : 16;
  var flState = fls.map(function (el, i) { return { el: el, sp: +el.getAttribute('data-sp') || 1, f0: +el.getAttribute('data-f0') || 0, dir: i % 2 ? -1 : 1, f: -1 }; });
  var pin = d.querySelector('.wide-pin');
  var wide = pin ? pin.parentNode : null;
  var ticking = false;
  function frame() {
    ticking = false;
    var y = w.scrollY || 0, vh = w.innerHeight;
    if (top) top.classList.toggle('solid', y > 30);
    if (!motion) return;
    if (band && flState.length) {
      var r = band.getBoundingClientRect();
      if (r.bottom > -50 && r.top < vh + 50) {
        var p = clamp((vh - r.top) / (vh + r.height), 0, 1);
        for (var i = 0; i < flState.length; i++) {
          var s = flState[i], f = ((s.f0 + Math.floor(p * NF * 2.2 * s.sp) * s.dir) % NF + NF) % NF;
          if (f !== s.f) { s.f = f; s.el.style.setProperty('--f', f); }
          s.el.style.setProperty('--py', ((p - 0.5) * 46 * s.sp * s.dir).toFixed(1) + 'px');
        }
      }
    }
    if (wide) {
      var q = wide.getBoundingClientRect();
      if (q.bottom > 0 && q.top < vh) pin.style.setProperty('--k', clamp(q.top / (vh * 0.9), 0, 1).toFixed(4));
    }
  }
  function onScroll() { if (!ticking) { ticking = true; w.requestAnimationFrame(frame); } }
  frame(); w.addEventListener('scroll', onScroll, { passive: true }); w.addEventListener('resize', onScroll, { passive: true });

  /* ---- menu: sekmeler (klavye: sol/sag ok) ---- */
  var tabs = [].slice.call(d.querySelectorAll('.tab'));
  var panels = [].slice.call(d.querySelectorAll('.panel'));
  function pick(i, user) {
    tabs.forEach(function (t, j) { t.setAttribute('aria-selected', j === i ? 'true' : 'false'); t.tabIndex = j === i ? 0 : -1; });
    panels.forEach(function (p, j) { p.hidden = j !== i; p.classList.toggle('swap', !!user && j === i && motion); });
  }
  tabs.forEach(function (t, i) {
    t.addEventListener('click', function () { pick(i, true); });
    t.addEventListener('keydown', function (e) {
      if (e.key === 'ArrowRight' || e.key === 'ArrowLeft') { var j = (i + (e.key === 'ArrowRight' ? 1 : tabs.length - 1)) % tabs.length; pick(j, true); tabs[j].focus(); e.preventDefault(); }
    });
  });
  if (tabs.length) pick(0);

  /* ---- kaydirinca belirme ---- */
  if ('IntersectionObserver' in w && motion) {
    root.classList.add('js');
    var io = new IntersectionObserver(function (es) { es.forEach(function (e) { if (e.isIntersecting) { e.target.classList.add('in'); io.unobserve(e.target); } }); }, { rootMargin: '0px 0px -6% 0px', threshold: 0.06 });
    each('.rv, .trio', function (el) { io.observe(el); });
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
