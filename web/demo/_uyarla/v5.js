/* Restoran taslagi v5: hareket katmani. Cerceve yok, derleme yok, hepsi istege bagli; sayfa JS olmadan da okunur.
   Referans gramerleri: sozcuk/satir bazli belirme (uc sitede), kahraman olcek paralaksi (ballena), sessiz fotograf .95 -> 1 (amrit),
   farkli hizda kayan kartlar (khufus data-speed), soz seridi (amrit marquee, yalniz CSS), kaydirinca renklenen ust cubuk.
   Azaltilmis harekette ve ?capture=1'de hepsi kapali. Veri: <script type="application/json" id="r-data">. */
(function () {
  'use strict';
  var d = document, root = d.documentElement, w = window;
  var data = {}; try { data = JSON.parse((d.getElementById('r-data') || {}).textContent || '{}'); } catch (e) { data = {}; }
  var T = data.t || {}; var DAYS = data.days || []; var H = data.h || null; var TZ = data.tz || null; var H12 = !!data.h12;
  var mq = function (q) { return !!(w.matchMedia && w.matchMedia(q).matches); };
  var REDUCED = mq('(prefers-reduced-motion: reduce)'); var STILL = root.classList.contains('still'); var FINE = mq('(hover: hover) and (pointer: fine)');
  var motion = !REDUCED && !STILL;
  var each = function (sel, fn, ctx) { [].forEach.call((ctx || d).querySelectorAll(sel), fn); };
  var clamp = function (x, a, b) { return x < a ? a : x > b ? b : x; };

  /* ---- simdi acik ---- */
  function hhmm(m) {
    m = m % 1440; var h = Math.floor(m / 60), mi = m % 60;
    if (!H12) return ('0' + h).slice(-2) + ':' + ('0' + mi).slice(-2);
    if (!h && !mi) return 'midnight'; if (h === 12 && !mi) return 'noon';
    return (h % 12 || 12) + (mi ? ':' + ('0' + mi).slice(-2) : '') + (h >= 12 ? 'pm' : 'am');
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
      el.removeAttribute('data-empty'); el.classList.toggle('open', s.open);
      var b = el.querySelector('b'); if (b) b.textContent = s.text;
    });
    if (!s) each('.f-status', function (li) { li.style.display = 'none'; });
    if (TZ) { var row = d.querySelector('[data-day="' + nowIn().wd + '"]'); each('.hours tr', function (r) { r.classList.remove('today'); }); if (row) row.classList.add('today'); }
  }
  paintStatus(); setInterval(paintStatus, 60000);

  /* ---- ust cubuk + kaydirmaya bagli ilerleme (tek rAF): kahraman paralaksi, [data-par] bolumlerin --p degeri ---- */
  var top = d.querySelector('.top'); var heroImg = d.querySelector('.hero-img'); var hero = d.querySelector('.hero');
  var pars = [].slice.call(d.querySelectorAll('[data-par]'));
  var ticking = false; var keepSolid = !!(top && top.hasAttribute('data-solid'));
  function frame() {
    ticking = false;
    var y = w.scrollY || w.pageYOffset || 0, vh = w.innerHeight;
    if (top && !keepSolid) top.classList.toggle('solid', y > 40);
    if (!motion) return;
    if (heroImg && hero && y < vh * 1.2) {
      // ballena: medya icerigin yaklasik %8 hiziyla geride kalir; mekan dilinde yavas yaklasma
      if (root.classList.contains('d-mekan')) heroImg.style.setProperty('--hs', (1.04 + clamp(y / vh, 0, 1) * 0.06).toFixed(4));
      else heroImg.style.setProperty('--hy', (y * 0.08).toFixed(1) + 'px');
    }
    for (var i = 0; i < pars.length; i++) {
      var r = pars[i].getBoundingClientRect();
      if (r.bottom < -vh || r.top > vh * 2) continue;
      var p = clamp((vh - r.top) / (vh + r.height), 0, 1);
      pars[i].style.setProperty('--p', p.toFixed(4));
    }
  }
  function onScroll() { if (!ticking) { ticking = true; w.requestAnimationFrame(frame); } }
  frame(); w.addEventListener('scroll', onScroll, { passive: true }); w.addEventListener('resize', onScroll, { passive: true });

  /* ---- kaydirinca belirme: bloklar (.rv), sozcuk gruplari (.wr), kart desteleri (.deck) ---- */
  if ('IntersectionObserver' in w && motion) {
    root.classList.add('js');
    var io = new IntersectionObserver(function (es) { es.forEach(function (e) { if (e.isIntersecting) { e.target.classList.add('in'); io.unobserve(e.target); } }); }, { rootMargin: '0px 0px -8% 0px', threshold: 0.08 });
    each('.rv, .wr, .deck', function (el) { io.observe(el); });
  }

  /* ---- 3D egilme: imleci izleyen kartlar (yalniz ince isaretci) ---- */
  if (motion && FINE) {
    var tilt = function (el, max) {
      var raf = 0, ev = null;
      var apply = function () {
        raf = 0; if (!ev) return;
        var r = el.getBoundingClientRect(); var x = clamp((ev.clientX - r.left) / r.width, 0, 1), y = clamp((ev.clientY - r.top) / r.height, 0, 1);
        var s = el.style;
        s.setProperty('--ry', ((x - 0.5) * 2 * max).toFixed(2) + 'deg'); s.setProperty('--rx', ((0.5 - y) * 2 * max).toFixed(2) + 'deg');
        s.setProperty('--px', ((x - 0.5) * 2).toFixed(3)); s.setProperty('--py', ((y - 0.5) * 2).toFixed(3));
        s.setProperty('--gx', (x * 100).toFixed(1) + '%'); s.setProperty('--gy', (y * 100).toFixed(1) + '%'); s.setProperty('--go', '1');
      };
      el.addEventListener('pointermove', function (e) { if (e.pointerType === 'touch') return; ev = e; el.classList.add('live'); if (!raf) raf = w.requestAnimationFrame(apply); });
      el.addEventListener('pointerleave', function () { ev = null; el.classList.remove('live'); ['--rx', '--ry', '--px', '--py', '--go'].forEach(function (k) { el.style.removeProperty(k); }); });
    };
    each('.card', function (el) { tilt(el, 6); });
  }

  /* ---- dis baglantilar yeni sekmede (rezervasyon, siparis, menu PDF, harita) ---- */
  each('a[href^="http"]', function (a) { if (a.host && a.host !== location.host) { a.target = '_blank'; a.rel = (a.rel ? a.rel + ' ' : '') + 'noopener'; } });
})();
