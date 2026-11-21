/* Restoran taslagi ("sahne" duzeni): cerceve yok, derleme yok. Hepsi istege bagli; sayfa JS olmadan da okunur ve calisir.
   Veri: <script type="application/json" id="r-data">.  WebGL kahraman katmani ayri dosyadir (sahne.js) ve sayfa yuklendikten SONRA, bos zamanda istenir. */
(function () {
  'use strict';
  var d = document, root = d.documentElement, w = window;
  var data = {}; try { data = JSON.parse((d.getElementById('r-data') || {}).textContent || '{}'); } catch (e) { data = {}; }
  var T = data.t || {};
  var DAYS = data.days || [];
  var H = data.h || null;       // dakika: [acilis, kapanis] ya da null (kapali / bilinmiyor), indeks = haftanin gunu (0 Pazar)
  var TZ = data.tz || null;
  var mq = function (q) { return !!(w.matchMedia && w.matchMedia(q).matches); };
  var REDUCED = mq('(prefers-reduced-motion: reduce)');
  var STILL = root.classList.contains('still');
  var FINE = mq('(hover: hover) and (pointer: fine)');
  var each = function (sel, fn, ctx) { [].forEach.call((ctx || d).querySelectorAll(sel), fn); };
  var clamp = function (x, a, b) { return x < a ? a : x > b ? b : x; };

  /* ---- simdi acik ---- */
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
    if (!s) each('.f-status', function (li) { li.style.display = 'none'; });
    if (TZ) {
      var row = d.querySelector('[data-day="' + nowIn().wd + '"]');
      each('.hours tr', function (r) { r.classList.remove('today'); });
      if (row) row.classList.add('today');
    }
  }
  paintStatus(); setInterval(paintStatus, 60000);

  /* ---- ust cubuk + kaydirmaya bagli sahneler (tek rAF) ---- */
  var top = d.querySelector('.top');
  var story = d.querySelector('[data-story]');
  var storyWords = story ? [].slice.call(story.querySelectorAll('.story-q .w')) : [];
  var storyLit = -1;
  var motion = !REDUCED && !STILL;
  if (story && motion) story.classList.add('live');
  var ticking = false;
  function frame() {
    ticking = false;
    var y = w.scrollY || w.pageYOffset || 0, vh = w.innerHeight;
    if (top) top.classList.toggle('solid', y > 40);
    if (story && motion) {
      var r = story.getBoundingClientRect();
      if (r.bottom > -vh && r.top < vh * 2) {
        var pinned = r.height > vh * 1.6;
        var p = pinned ? clamp(-r.top / (r.height - vh), 0, 1) : clamp((vh * 0.82 - r.top) / (r.height * 0.9), 0, 1);
        story.style.setProperty('--p', p.toFixed(4));
        var lit = Math.round(clamp(p * 1.18, 0, 1) * storyWords.length);
        if (lit !== storyLit) { for (var i = 0; i < storyWords.length; i++) storyWords[i].classList.toggle('on', i < lit); storyLit = lit; }
      }
    }
  }
  function onScroll() { if (!ticking) { ticking = true; w.requestAnimationFrame(frame); } }
  frame(); w.addEventListener('scroll', onScroll, { passive: true }); w.addEventListener('resize', onScroll, { passive: true });

  /* ---- menu: sekmeler; buyuk fotograf sekmeye gore degisir ---- */
  var tabs = [].slice.call(d.querySelectorAll('.tab'));
  var panels = [].slice.call(d.querySelectorAll('.panel'));
  var vis = d.querySelector('.menu-vis');
  function showImg(i) {
    if (!vis) return; var ims = vis.querySelectorAll('img'); var k = i % ims.length;
    [].forEach.call(ims, function (im, j) { var on = j === k; im.classList.toggle('was', !on && im.classList.contains('on')); im.classList.toggle('on', on); });
    setTimeout(function () { [].forEach.call(ims, function (im) { im.classList.remove('was'); }); }, 950);
  }
  function pick(i, user) {
    tabs.forEach(function (t, j) { t.setAttribute('aria-selected', j === i ? 'true' : 'false'); t.tabIndex = j === i ? 0 : -1; });
    panels.forEach(function (p, j) { p.hidden = j !== i; p.classList.toggle('swap', !!user && j === i); });
    showImg(i);
  }
  tabs.forEach(function (t, i) {
    t.addEventListener('click', function () { pick(i, true); });
    t.addEventListener('keydown', function (e) {
      if (e.key === 'ArrowRight' || e.key === 'ArrowLeft') { var j = (i + (e.key === 'ArrowRight' ? 1 : tabs.length - 1)) % tabs.length; pick(j, true); tabs[j].focus(); }
    });
  });
  if (tabs.length) pick(0); else showImg(0);
  /* menu kartlari: karta dokununca o baslik secilir ve menuye inilir */
  each('[data-tab]', function (a) { a.addEventListener('click', function () { var i = +a.getAttribute('data-tab'); if (tabs[i]) pick(i, true); }); });

  /* ---- rezervasyon formu: secenekler gercek radyo dugmesi; ozet satiri onlari izler; saatler secilen gunun saatlerinden ---- */
  var form = d.getElementById('rez');
  if (form) {
    var sum = form.querySelector('[data-sum]');
    var val = function (n) {
      var c = form.querySelector('input[name="' + n + '"]:checked');
      if (c) return c.getAttribute('data-l') || c.value;
      var dt = form.querySelector('input[name="' + n + '"][data-date]'); // konaklama: gelis tarihi (tarih alani)
      if (dt && dt.value) { try { return new Date(dt.value + 'T12:00:00').toLocaleDateString(d.documentElement.lang || 'en', { weekday: 'short', day: 'numeric', month: 'short' }); } catch (e) { return dt.value; } }
      return '';
    };
    var dIn = form.querySelector('input[data-date]');
    if (dIn) { var t0 = new Date(); var iso = function (x) { return x.getFullYear() + '-' + String(x.getMonth() + 1).padStart(2, '0') + '-' + String(x.getDate()).padStart(2, '0'); }; dIn.min = iso(t0); var t1 = new Date(t0.getTime() + 14 * 864e5); if (!dIn.value) dIn.value = iso(t1); }
    var paint = function () {
      if (!sum) return; sum.textContent = '';
      [val('kisi') ? T.guests.replace('{n}', val('kisi')) : '', val('gun'), val('saat')].filter(Boolean).forEach(function (x, i) { if (i) sum.appendChild(d.createTextNode(' · ')); var b = d.createElement('b'); b.textContent = x; sum.appendChild(b); });
    };
    var daySlots = data.slots || null; // { "<gun indeksi>": ["18:00", ...] }
    var dayChips = [].slice.call(form.querySelectorAll('input[name="gun"]'));
    var timeBox = form.querySelector('[data-slots]');
    var fillSlots = function () {
      if (!daySlots || !timeBox) return;
      var c = form.querySelector('input[name="gun"]:checked'); var wd = c ? c.getAttribute('data-wd') : null;
      var list = wd !== null && daySlots[wd] ? daySlots[wd] : null; if (!list || !list.length) return;
      var keep = val('saat'); var def = Math.min(2, list.length - 1); var has = list.indexOf(keep) >= 0;
      timeBox.textContent = '';
      list.forEach(function (s, i) {
        var inp = d.createElement('input'); inp.type = 'radio'; inp.name = 'saat'; inp.id = 'saat' + i; inp.value = s; inp.setAttribute('data-l', s); inp.checked = has ? s === keep : i === def;
        var lab = d.createElement('label'); lab.htmlFor = inp.id; lab.textContent = s;
        timeBox.appendChild(inp); timeBox.appendChild(lab);
      });
    };
    if (dayChips.length && daySlots) {
      // gun etiketleri: bugun, yarin, sonraki acik gunler (isletmenin saat diliminde)
      var n0 = TZ ? nowIn() : { wd: new Date().getDay() }; var list0 = [];
      for (var i0 = 0; i0 < 7 && list0.length < dayChips.length; i0++) {
        var wd0 = (n0.wd + i0) % 7; if (!daySlots[wd0] || !daySlots[wd0].length) continue;
        list0.push({ wd: wd0, label: i0 === 0 ? T.todayLabel : i0 === 1 ? T.tomorrowLabel : DAYS[wd0] });
      }
      dayChips.forEach(function (c, k) {
        var it = list0[k]; var lab = d.querySelector('label[for="' + c.id + '"]');
        if (!it) { c.disabled = true; c.hidden = true; if (lab) lab.hidden = true; return; }
        c.hidden = false; if (lab) lab.hidden = false;
        c.value = it.label; c.setAttribute('data-l', it.label); c.setAttribute('data-wd', it.wd); if (lab) lab.textContent = it.label;
      });
      fillSlots();
    }
    form.addEventListener('change', function (e) { if (e.target && e.target.name === 'gun') fillSlots(); paint(); }); form.addEventListener('input', paint); paint();
    form.addEventListener('submit', function (e) {
      e.preventDefault();
      if (!form.checkValidity()) { form.reportValidity(); return; }
      var name = (form.querySelector('[name="ad"]').value || '').trim().split(/\s+/)[0];
      form.querySelector('[data-thanks]').textContent = T.thanks.replace('{n}', name ? ', ' + name : '');
      var ds = form.querySelector('[data-done-sum]'); ds.textContent = sum ? sum.textContent : '';
      form.classList.add('sent');
      var h = form.querySelector('.done'); if (h) { h.setAttribute('tabindex', '-1'); h.focus({ preventScroll: true }); }
    });
  }

  /* ---- kaydirinca belirme ---- */
  if ('IntersectionObserver' in w && motion) {
    root.classList.add('js');
    var io = new IntersectionObserver(function (es) { es.forEach(function (e) { if (e.isIntersecting) { e.target.classList.add('in'); io.unobserve(e.target); } }); }, { rootMargin: '0px 0px -6% 0px', threshold: 0.06 });
    each('.rv, .deck, .gal', function (el) { io.observe(el); });
  }

  /* ---- 3D egilme: imleci izleyen kartlar (ince isaretci); dokunmatikte yatay kaydirmaya bagli kapak akisi ---- */
  if (motion) {
    var MAX = 9;
    var tilt = function (el, max) {
      var raf = 0, ev = null;
      var apply = function () {
        raf = 0; if (!ev) return;
        var r = el.getBoundingClientRect(); var x = clamp((ev.clientX - r.left) / r.width, 0, 1), y = clamp((ev.clientY - r.top) / r.height, 0, 1);
        var s = el.style;
        s.setProperty('--ry', ((x - 0.5) * 2 * max).toFixed(2) + 'deg'); s.setProperty('--rx', ((0.5 - y) * 2 * max).toFixed(2) + 'deg');
        s.setProperty('--px', ((x - 0.5) * 2).toFixed(3)); s.setProperty('--py', ((y - 0.5) * 2).toFixed(3));
        s.setProperty('--gx', (x * 100).toFixed(1) + '%'); s.setProperty('--gy', (y * 100).toFixed(1) + '%'); s.setProperty('--go', '1'); s.setProperty('--sc', '1.02');
      };
      el.addEventListener('pointermove', function (e) { if (e.pointerType === 'touch') return; ev = e; el.classList.add('live'); if (!raf) raf = w.requestAnimationFrame(apply); });
      el.addEventListener('pointerleave', function () { ev = null; el.classList.remove('live'); ['--rx', '--ry', '--px', '--py', '--go', '--sc'].forEach(function (k) { el.style.removeProperty(k); }); });
    };
    if (FINE) { each('.card3', function (el) { tilt(el, MAX); }); each('.gal figure', function (el) { tilt(el, 6); }); each('.menu-vis', function (el) { tilt(el, 5); }); }
    else {
      each('.deck', function (deck) {
        var cards = [].slice.call(deck.querySelectorAll('.card3')); var busy = false;
        var flow = function () {
          busy = false; var c = deck.getBoundingClientRect(); var mid = c.left + c.width / 2;
          cards.forEach(function (el) { var r = el.getBoundingClientRect(); var k = clamp(((r.left + r.width / 2) - mid) / c.width, -1, 1); el.style.setProperty('--ry', (-k * 26).toFixed(2) + 'deg'); el.style.setProperty('--sc', (1 - Math.abs(k) * 0.08).toFixed(3)); el.style.setProperty('--px', (k * 1.4).toFixed(3)); });
        };
        deck.addEventListener('scroll', function () { if (!busy) { busy = true; w.requestAnimationFrame(flow); } }, { passive: true });
        cards.forEach(function (el) { el.classList.add('live'); }); flow();
      });
    }
  }

  /* ---- WebGL kahraman (sahne.js): sayfa yuklendikten sonra, bos zamanda; duragan ilk kare zaten ekranda ---- */
  function wantGL() {
    // capture=1: kapi olcumu ve onizleme goruntusu. Yazilim isleyicili (GPU'suz) bulut tarayicisinda WebGL kare bazen siyah cikar; ziyaretci gorseli CSS fotograf akisiyle ayni karedir.
    if (REDUCED || /[?&](nogl|capture)=1/.test(location.search)) return false;
    var c = navigator.connection || {}; if (c.saveData || /(^|-)2g$/.test(c.effectiveType || '')) return false;
    if (navigator.deviceMemory && navigator.deviceMemory < 2) return false;
    return !!d.querySelector('[data-gl]') && !!w.WebGLRenderingContext;
  }
  function loadGL() {
    if (!wantGL()) return;
    var me = d.querySelector('script[src$="page.js"]'); if (!me) return;
    var s = d.createElement('script'); s.src = me.src.replace(/page\.js(\?.*)?$/, 'sahne.js'); s.async = true; d.head.appendChild(s);
  }
  var idle = function () { (w.requestIdleCallback || function (f) { return setTimeout(f, 200); })(loadGL, { timeout: 1500 }); };
  if (d.readyState === 'complete') idle(); else w.addEventListener('load', idle);
})();
