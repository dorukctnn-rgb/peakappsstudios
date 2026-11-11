/* Pizza kategori sablonu: cerceve yok, derleme yok. Hepsi istege bagli; sayfa JS olmadan da okunur (adim listesi, yatay kaydirilan kartlar).
   Imza hareket (referansin teknigi, kendi uygulamamiz): "oyunsu hikaye kaydirma". Uzun bolum + yapiskan sahne; kaydirma ilerlemesi 4 adimi oynatir:
   adim sayaci, adim haplari, altyazi, isletmenin kendi karesi daire icinde acilir; 2. adimda 3D malzemeler (atlas) pizzanin ustune yagip oturur,
   3. adimda firin olceri 450 dereceye, sure 90 saniyeye cikar ve kozler yukselir (isletmenin kendi degerleri: 60-90 sn, 400-450 derece).
   Kahramandaki pizza kaydirdikca teker gibi doner; numarali kaydiricida sayac ve dugmeler. Imlec katmani ayri dosya (imlec.js), bos zamanda. */
(function () {
  'use strict';
  var d = document, root = d.documentElement, w = window;
  var ME = (d.currentScript && d.currentScript.src) || '';
  var data = {}; try { data = JSON.parse((d.getElementById('r-data') || {}).textContent || '{}'); } catch (e) { data = {}; }
  var T = data.t || {}, DAYS = data.days || [], H = data.h || null, TZ = data.tz || null;
  var mq = function (q) { return !!(w.matchMedia && w.matchMedia(q).matches); };
  var REDUCED = mq('(prefers-reduced-motion: reduce)');
  var STILL = root.classList.contains('still');
  var motion = !REDUCED && !STILL;
  var each = function (sel, fn, ctx) { [].forEach.call((ctx || d).querySelectorAll(sel), fn); };
  var clamp = function (x, a, b) { return x < a ? a : x > b ? b : x; };
  var ease = function (t) { return t * t * (3 - 2 * t); };
  var pad = function (n) { return ('0' + n).slice(-2); };
  var NF = 16;

  /* ---- simdi acik (isletmenin saat dilimiyle) ---- */
  var H12 = !!data.h12;
  function hhmm(m) { m = m % 1440; var h = Math.floor(m / 60), mi = m % 60; if (!H12) return pad(h) + ':' + pad(mi); if (!h && !mi) return 'midnight'; if (h === 12 && !mi) return 'noon'; return (h % 12 || 12) + (mi ? ':' + pad(mi) : '') + (h >= 12 ? ' pm' : ' am'); }
  function nowIn() {
    try { var p = new Intl.DateTimeFormat('en-GB', { timeZone: TZ, weekday: 'short', hour: '2-digit', minute: '2-digit', hour12: false }).formatToParts(new Date()); var o = {}; p.forEach(function (x) { o[x.type] = x.value; }); var wd = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'].indexOf(o.weekday); return { wd: wd < 0 ? 0 : wd, min: (+o.hour % 24) * 60 + +o.minute }; }
    catch (e) { var n = new Date(); return { wd: n.getDay(), min: n.getHours() * 60 + n.getMinutes() }; }
  }
  function status() {
    if (!H || !TZ) return null;
    var n = nowIn(), t = H[n.wd], y = H[(n.wd + 6) % 7];
    if (t && n.min >= t[0] && n.min < t[1]) return { open: true, text: T.open.replace('{t}', hhmm(t[1])) };
    if (y && y[1] > 1440 && n.min < y[1] - 1440) return { open: true, text: T.open.replace('{t}', hhmm(y[1])) };
    if (t && n.min < t[0]) return { open: false, text: T.shut.replace('{w}', T.today.replace('{t}', hhmm(t[0]))) };
    for (var i = 1; i <= 7; i++) { var k = (n.wd + i) % 7; if (H[k]) return { open: false, text: T.shut.replace('{w}', i === 1 ? T.tomorrow.replace('{t}', hhmm(H[k][0])) : T.dayAt.replace('{d}', DAYS[k]).replace('{t}', hhmm(H[k][0]))) }; }
    return null;
  }
  function paintStatus() {
    var s = status();
    each('[data-status]', function (el) { if (!s) { el.setAttribute('data-empty', ''); return; } el.removeAttribute('data-empty'); el.classList.toggle('open', s.open); var b = el.querySelector('b'); if (b) b.textContent = s.text; });
    if (TZ && H) { var n = nowIn(), t = H[n.wd]; each('.hours tr', function (r) { r.classList.toggle('today', +r.getAttribute('data-day') === n.wd); }); each('[data-today]', function (el) { el.textContent = t ? hhmm(t[0]) + ' to ' + hhmm(t[1]) : 'Closed today'; }); }
  }
  paintStatus(); setInterval(paintStatus, 60000);

  /* ---- hikaye sahnesi ---- */
  var story = d.querySelector('.story');
  var useStory = !!story && motion && 'IntersectionObserver' in w;
  if (useStory) root.classList.add('story-on');
  var stg = story ? {
    st: [].slice.call(story.querySelectorAll('.st')), sc: [].slice.call(story.querySelectorAll('.sc')), pills: [].slice.call(story.querySelectorAll('.pill')),
    no: story.querySelector('[data-step]'), temp: story.querySelector('[data-temp]'), sec: story.querySelector('[data-sec]'), tbar: story.querySelector('[data-tbar]'), sbar: story.querySelector('[data-sbar]'),
    cv: story.querySelector('.rain'), glow: story.querySelector('.glow'), scene: story.querySelector('.scene'), cur: -1,
  } : null;
  var N = stg ? stg.st.length : 0;
  // malzeme atlasi (kendi 3D cizimimiz): yalniz sahne gorunur olunca yuklenir
  var atlas = null, aReady = false, cfg = data.imlec || {};
  function loadAtlas() { if (atlas || !cfg.src) return; atlas = new Image(); atlas.onload = function () { aReady = true; onScroll(); }; atlas.src = cfg.src; }
  var dpr = Math.min(w.devicePixelRatio || 1, 2), cx = stg && stg.cv ? stg.cv.getContext('2d') : null;
  // yagacak malzemeler: sabit tohumla yer (her yuklemede ayni duzen), hedef pizzanin icinde
  var drops = [], sparks = [];
  var HX = stg && stg.cv ? +stg.cv.getAttribute('data-hx') || 0.5 : 0.5, HY = stg && stg.cv ? +stg.cv.getAttribute('data-hy') || 0.5 : 0.5, HR = stg && stg.cv ? +stg.cv.getAttribute('data-hr') || 0.34 : 0.34; // inis alani: fotograftaki pizza
  (function () { var s = 7; var r = function () { s = (s * 9301 + 49297) % 233280; return s / 233280; }; var names = ['basil', 'mozzarella', 'tomato', 'basil', 'mozzarella', 'olive', 'tomato', 'mushroom', 'basil', 'mozzarella', 'pepper', 'tomato', 'basil', 'olive']; for (var i = 0; i < names.length; i++) { var a = r() * Math.PI * 2, rr = Math.sqrt(r()) * HR; drops.push({ row: (cfg.names || []).indexOf(names[i]), tx: HX + Math.cos(a) * rr, ty: HY + Math.sin(a) * rr, sx: 0.5 + (r() - 0.5) * 0.9, d: r() * 0.35, f0: (r() * NF) | 0, sp: r() < 0.5 ? -1 : 1, s: 0.15 + r() * 0.05 }); } for (var j = 0; j < 26; j++) sparks.push({ x: 0.25 + r() * 0.5, v: 0.5 + r() * 0.8, o: r(), s: 2 + r() * 4 }); })();
  function sizeCv() { if (!cx) return; var b = stg.cv.getBoundingClientRect(); stg.cv.width = Math.round(b.width * dpr); stg.cv.height = Math.round(b.height * dpr); stg.W = b.width; stg.H = b.height; }
  function drawScene(p) { // p: 0..N (adim ilerlemesi)
    if (!cx || !stg.W) return;
    cx.setTransform(dpr, 0, 0, dpr, 0, 0); cx.clearRect(0, 0, stg.W, stg.H);
    var scB = stg.sc[0] ? stg.sc[0].getBoundingClientRect() : null, cvB = stg.cv.getBoundingClientRect(); if (!scB) return;
    var D = scB.width, ox = scB.left - cvB.left, oy = scB.top - cvB.top;
    // 2. adim: malzemeler yagip oturur (1 <= p < 3), 3. adimin basinda solar
    var q = clamp(p - 1, 0, 1.6), fade = p < 2.2 ? 1 : clamp(1 - (p - 2.2) / 0.4, 0, 1);
    if (aReady && q > 0 && fade > 0) {
      var C = cfg.cell || 112;
      for (var i = 0; i < drops.length; i++) {
        var o = drops[i]; if (o.row < 0) continue;
        var t = clamp((q - o.d) / 0.55, 0, 1), e = ease(t);
        var x = ox + D * (o.sx + (o.tx - o.sx) * e), y = oy + D * (-0.25 + (o.ty + 0.25) * e) - Math.sin(t * Math.PI) * D * 0.05;
        var sz = D * o.s * (t < 1 ? 1 : 0.92), f = (o.f0 + Math.floor((1 - e) * NF * 1.5) * o.sp + NF * 4) % NF;
        cx.globalAlpha = (t > 0 ? 1 : 0) * fade; cx.drawImage(atlas, f * C, o.row * C, C, C, x - sz / 2, y - sz / 2, sz, sz);
      }
      cx.globalAlpha = 1;
    }
    // 3. adim: kozler yukselir
    var heat = clamp(p - 2, 0, 1) * (p < 3 ? 1 : clamp(1 - (p - 3) / 0.5, 0, 1)); // firin adiminda yanar, kabuk adiminda soner
    if (heat > 0) { for (var k = 0; k < sparks.length; k++) { var sp = sparks[k], yy = ((sp.o + p * sp.v) % 1); cx.globalAlpha = heat * (1 - yy) * 0.9; cx.fillStyle = k % 3 ? '#ff8a2a' : '#ffd36a'; cx.beginPath(); cx.arc(ox + D * sp.x + Math.sin((yy + k) * 6) * 8, oy + D * (1 - yy * 1.1), sp.s * (1 - yy * 0.5), 0, 6.283); cx.fill(); } cx.globalAlpha = 1; }
    if (stg.glow) stg.glow.style.setProperty('--heat', (heat * 0.9).toFixed(3));
  }
  function paintStep(p) {
    var i = clamp(Math.floor(p), 0, N - 1);
    if (i !== stg.cur) {
      stg.cur = i;
      stg.st.forEach(function (el, j) { el.classList.toggle('on', j === i); });
      stg.sc.forEach(function (el, j) { el.classList.toggle('on', j === i); });
      stg.pills.forEach(function (el, j) { el.classList.toggle('on', j === i); if (j === i) el.setAttribute('aria-current', 'step'); else el.removeAttribute('aria-current'); });
      if (stg.no) stg.no.textContent = pad(i + 1);
    }
    // olcer: hamur 20 derece -> malzeme -> firin 450 / 90 sn
    var tp = clamp(p - 1.6, 0, 1.2) / 1.2, temp = Math.round(20 + ease(tp) * 430), sec = Math.round(ease(clamp(p - 2.2, 0, 0.8) / 0.8) * 90);
    if (stg.temp) stg.temp.textContent = temp; if (stg.sec) stg.sec.textContent = sec;
    if (stg.tbar) stg.tbar.style.setProperty('--g', ((temp - 20) / 430).toFixed(3)); if (stg.sbar) stg.sbar.style.setProperty('--g', (sec / 90).toFixed(3));
    drawScene(p);
  }
  if (stg && !useStory) { if (stg.tbar) stg.tbar.style.setProperty('--g', 1); if (stg.sbar) stg.sbar.style.setProperty('--g', 1); if (stg.temp) stg.temp.textContent = '450'; if (stg.sec) stg.sec.textContent = '90'; }
  if (useStory) {
    sizeCv(); paintStep(0);
    new IntersectionObserver(function (es) { if (es[0].isIntersecting) loadAtlas(); }, { rootMargin: '200px' }).observe(story);
    stg.pills.forEach(function (a, j) { a.addEventListener('click', function (e) { e.preventDefault(); var b = story.getBoundingClientRect(), top = (w.scrollY || 0) + b.top, len = story.offsetHeight - w.innerHeight; w.scrollTo({ top: top + (j + 0.35) / N * len, behavior: 'smooth' }); }); });
  }

  /* ---- tek rAF: ust cubuk, donen pizza, kahraman malzemeleri, hikaye ---- */
  var top = d.querySelector('.top'), pie = d.querySelector('[data-spin]'), orbs = [].slice.call(d.querySelectorAll('.orb'));
  function setF(el, f) { f = ((f % NF) + NF) % NF; if (el.__f !== f) { el.__f = f; el.style.setProperty('--f', f); } }
  var ticking = false;
  function frame() {
    ticking = false;
    var y = w.scrollY || 0, vh = w.innerHeight;
    if (top) top.classList.toggle('solid', y > 24);
    if (!motion) return;
    if (pie && y < vh * 1.4) pie.style.setProperty('--spin', (y * 0.12).toFixed(2) + 'deg');
    if (y < vh * 1.4) for (var i = 0; i < orbs.length; i++) { var o = orbs[i]; setF(o, (+o.getAttribute('data-f0') || 0) + Math.round(Math.sin(y / (90 + i * 25) + i) * 2)); o.style.setProperty('--oy', (-y * (0.1 + i * 0.05)).toFixed(1) + 'px'); }
    if (useStory) { var b = story.getBoundingClientRect(); if (b.bottom > 0 && b.top < vh) { var len = story.offsetHeight - vh; paintStep(clamp(-b.top / Math.max(1, len), 0, 0.9999) * N); } }
  }
  function onScroll() { if (!ticking) { ticking = true; w.requestAnimationFrame(frame); } }
  frame(); w.addEventListener('scroll', onScroll, { passive: true }); w.addEventListener('resize', function () { if (useStory) sizeCv(); onScroll(); }, { passive: true });

  /* ---- numarali kaydirici: sayac, onceki/sonraki (kaydirma yakalama CSS'te) ---- */
  var slides = d.getElementById('slides');
  if (slides) {
    var cards = [].slice.call(slides.querySelectorAll('.slide')), nav = d.querySelector('[data-nav]'), cur = d.querySelector('[data-cur]'), si = -1;
    var mark = function () { var b = slides.getBoundingClientRect(), mid = b.left + b.width / 2, best = 0, bd = 1e9; cards.forEach(function (c, i) { var r = c.getBoundingClientRect(), dd = Math.abs(r.left + r.width / 2 - mid); if (dd < bd) { bd = dd; best = i; } }); if (best !== si) { si = best; cards.forEach(function (c, i) { c.classList.toggle('on', i === si); }); if (cur) cur.textContent = pad(si + 1); } };
    var go = function (k) { var i = clamp(si + k, 0, cards.length - 1), c = cards[i]; slides.scrollTo({ left: c.offsetLeft - (slides.clientWidth - c.offsetWidth) / 2, behavior: motion ? 'smooth' : 'auto' }); };
    if (nav) { nav.hidden = false; nav.querySelector('[data-prev]').addEventListener('click', function () { go(-1); }); nav.querySelector('[data-next]').addEventListener('click', function () { go(1); }); }
    slides.addEventListener('keydown', function (e) { if (e.key === 'ArrowRight' || e.key === 'ArrowLeft') { go(e.key === 'ArrowRight' ? 1 : -1); e.preventDefault(); } });
    var st2 = false; slides.addEventListener('scroll', function () { if (!st2) { st2 = true; w.requestAnimationFrame(function () { st2 = false; mark(); }); } }, { passive: true });
    mark();
  }

  /* ---- menu sekmeleri ---- */
  var tabs = [].slice.call(d.querySelectorAll('.tab')), panels = [].slice.call(d.querySelectorAll('.panel'));
  function pick(i, user) { tabs.forEach(function (t, j) { t.setAttribute('aria-selected', j === i ? 'true' : 'false'); t.tabIndex = j === i ? 0 : -1; }); panels.forEach(function (p, j) { p.hidden = j !== i; p.classList.toggle('swap', !!user && j === i && motion); }); }
  tabs.forEach(function (t, i) { t.addEventListener('click', function () { pick(i, true); }); t.addEventListener('keydown', function (e) { if (e.key === 'ArrowRight' || e.key === 'ArrowLeft') { var j = (i + (e.key === 'ArrowRight' ? 1 : tabs.length - 1)) % tabs.length; pick(j, true); tabs[j].focus(); e.preventDefault(); } }); });
  if (tabs.length) pick(0);

  /* ---- kaydirinca belirme ---- */
  if ('IntersectionObserver' in w && motion) {
    root.classList.add('js');
    var io = new IntersectionObserver(function (es) { es.forEach(function (e) { if (e.isIntersecting) { e.target.classList.add('in'); io.unobserve(e.target); } }); }, { rootMargin: '0px 0px -6% 0px', threshold: 0.06 });
    each('.rv', function (el) { io.observe(el); });
  }

  /* ---- imlec / dokunma katmani ---- */
  function wantFx() { if (!motion || /[?&]nofx=1/.test(location.search)) return false; var c = navigator.connection || {}; if (c.saveData) return false; if (navigator.deviceMemory && navigator.deviceMemory < 2) return false; return true; }
  function loadFx() { if (!wantFx() || !ME) return; var s = d.createElement('script'); s.src = ME.replace(/\/[^\/?#]+(\?[^#]*)?$/, '/imlec.js$1'); s.async = true; d.head.appendChild(s); }
  var idle = function () { (w.requestIdleCallback || function (f) { return setTimeout(f, 200); })(loadFx, { timeout: 1500 }); };
  if (d.readyState === 'complete') idle(); else w.addEventListener('load', idle);
})();
