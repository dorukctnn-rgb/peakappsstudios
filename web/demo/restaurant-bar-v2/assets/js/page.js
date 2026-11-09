/* Kehribar (concept v2): no framework, no build. Everything below is optional: the page reads fine without it. */
(function () {
  'use strict';
  var d = document, root = d.documentElement;
  var lang = root.lang === 'tr' ? 'tr' : 'en';
  var T = {
    tr: {
      days: ['Pazar', 'Pazartesi', 'Salı', 'Çarşamba', 'Perşembe', 'Cuma', 'Cumartesi'],
      open: function (c) { return 'Şimdi açık · ' + c + "'" + ({ '00:00': 'a', '01:00': 'e', '23:00': 'e' }[c] || 'e') + ' kadar'; },
      shut: function (n) { return 'Şu an kapalı · ' + n; },
      opens: function (day, t) { return day + ' ' + t + "'" + ({ '16:00': 'da', '17:00': 'de' }[t] || 'de') + ' açılıyor'; },
      today: 'Bugün', tomorrow: 'Yarın',
      sumPeople: function (n) { return n + ' kişi'; },
      thanks: function (n) { return 'Teşekkürler' + (n ? ', ' + n : '') + '.'; }
    },
    en: {
      days: ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'],
      open: function (c) { return 'Open now · until ' + c; },
      shut: function (n) { return 'Closed · ' + n; },
      opens: function (day, t) { return 'opens ' + day + ' ' + t; },
      today: 'today', tomorrow: 'tomorrow',
      sumPeople: function (n) { return n + (n === 1 ? ' guest' : ' guests'); },
      thanks: function (n) { return 'Thank you' + (n ? ', ' + n : '') + '.'; }
    }
  }[lang];

  /* opening hours, minutes from midnight; index = weekday (0 Sunday). close can pass 1440 (after midnight). */
  var H = [[960, 1380], null, [1020, 1440], [1020, 1440], [1020, 1440], [1020, 1500], [1020, 1500]];
  function hhmm(m) { m = m % 1440; return ('0' + Math.floor(m / 60)).slice(-2) + ':' + ('0' + (m % 60)).slice(-2); }
  function nowIstanbul() {
    try {
      var p = new Intl.DateTimeFormat('en-GB', { timeZone: 'Europe/Istanbul', weekday: 'short', hour: '2-digit', minute: '2-digit', hour12: false }).formatToParts(new Date());
      var o = {}; p.forEach(function (x) { o[x.type] = x.value; });
      var wd = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'].indexOf(o.weekday);
      return { wd: wd < 0 ? 0 : wd, min: (+o.hour % 24) * 60 + +o.minute };
    } catch (e) { var n = new Date(); return { wd: n.getDay(), min: n.getHours() * 60 + n.getMinutes() }; }
  }
  function status() {
    var n = nowIstanbul(), t = H[n.wd], y = H[(n.wd + 6) % 7];
    if (t && n.min >= t[0] && n.min < t[1]) return { open: true, text: T.open(hhmm(t[1])) };
    if (y && y[1] > 1440 && n.min < y[1] - 1440) return { open: true, text: T.open(hhmm(y[1])) };
    if (t && n.min < t[0]) return { open: false, text: T.shut(T.opens(T.today, hhmm(t[0]))) };
    for (var i = 1; i <= 7; i++) {
      var k = (n.wd + i) % 7;
      if (H[k]) return { open: false, text: T.shut(T.opens(i === 1 ? T.tomorrow : T.days[k], hhmm(H[k][0]))) };
    }
    return { open: false, text: '' };
  }
  function paintStatus() {
    var s = status();
    [].forEach.call(d.querySelectorAll('[data-status]'), function (el) {
      el.classList.toggle('open', s.open);
      var b = el.querySelector('b'); if (b) b.textContent = s.text;
    });
    var row = d.querySelector('[data-day="' + nowIstanbul().wd + '"]');
    [].forEach.call(d.querySelectorAll('.hours tr'), function (r) { r.classList.remove('today'); });
    if (row) row.classList.add('today');
  }
  paintStatus(); setInterval(paintStatus, 60000);

  /* header turns solid after the first scroll */
  var top = d.querySelector('.top');
  function onScroll() { if (top) top.classList.toggle('solid', window.scrollY > 40); }
  onScroll(); window.addEventListener('scroll', onScroll, { passive: true });

  /* hero video: wide screens only, no data saver, no reduced motion, after the page has loaded */
  var v = d.querySelector('.hero-media video');
  function wantVideo() {
    var c = navigator.connection || {};
    return v && window.matchMedia('(min-width: 900px)').matches && !c.saveData && !window.matchMedia('(prefers-reduced-motion: reduce)').matches && !/capture=1/.test(location.search);
  }
  function startVideo() {
    if (!wantVideo()) return;
    var base = v.getAttribute('data-src').replace(/\.(mp4|webm)$/, '');
    var mp4 = v.canPlayType('video/mp4; codecs="avc1.640028"');
    v.src = base + (mp4 ? '.mp4' : '.webm'); v.muted = true;
    v.addEventListener('playing', function () { v.classList.add('on'); }, { once: true });
    v.play().catch(function () {});
  }
  if (d.readyState === 'complete') startVideo(); else window.addEventListener('load', startVideo);

  /* menu: tabs, and the big photo follows the dish under the cursor or focus */
  var tabs = [].slice.call(d.querySelectorAll('.tab'));
  var panels = [].slice.call(d.querySelectorAll('.panel'));
  var vis = d.querySelector('.menu-vis');
  function showImg(key) {
    if (!vis) return;
    [].forEach.call(vis.querySelectorAll('img'), function (im) { im.classList.toggle('on', im.getAttribute('data-k') === key); });
  }
  function pick(i) {
    tabs.forEach(function (t, j) { t.setAttribute('aria-selected', j === i ? 'true' : 'false'); t.tabIndex = j === i ? 0 : -1; });
    panels.forEach(function (p, j) { p.hidden = j !== i; });
    var first = panels[i] && panels[i].querySelector('.dish');
    if (first) { setAct(first); }
  }
  function setAct(el) {
    [].forEach.call(d.querySelectorAll('.dish.act'), function (x) { x.classList.remove('act'); });
    el.classList.add('act'); showImg(el.getAttribute('data-k'));
  }
  tabs.forEach(function (t, i) {
    t.addEventListener('click', function () { pick(i); });
    t.addEventListener('keydown', function (e) {
      if (e.key === 'ArrowRight' || e.key === 'ArrowLeft') { var j = (i + (e.key === 'ArrowRight' ? 1 : tabs.length - 1)) % tabs.length; pick(j); tabs[j].focus(); }
    });
  });
  [].forEach.call(d.querySelectorAll('.dish'), function (el) {
    el.addEventListener('mouseenter', function () { setAct(el); });
    el.addEventListener('focusin', function () { setAct(el); });
  });
  if (tabs.length) pick(0);

  /* booking form: chips are real radios; the summary line follows them */
  var form = d.getElementById('rez');
  if (form) {
    var sum = form.querySelector('[data-sum]');
    var val = function (n) { var c = form.querySelector('input[name="' + n + '"]:checked'); return c ? c.getAttribute('data-l') || c.value : ''; };
    var paint = function () { if (sum) sum.innerHTML = '<b>' + T.sumPeople(+val('kisi')) + '</b> · <b>' + val('gun') + '</b> · <b>' + val('saat') + '</b>'; };
    form.addEventListener('change', paint); paint();
    form.addEventListener('submit', function (e) {
      e.preventDefault();
      if (!form.checkValidity()) { form.reportValidity(); return; }
      var name = (form.querySelector('[name="ad"]').value || '').trim().split(/\s+/)[0];
      form.querySelector('[data-thanks]').textContent = T.thanks(name);
      form.querySelector('[data-done-sum]').innerHTML = sum ? sum.innerHTML : '';
      form.classList.add('sent');
      var h = form.querySelector('.done'); if (h) { h.setAttribute('tabindex', '-1'); h.focus({ preventScroll: true }); }
    });
  }

  /* scroll reveal */
  if ('IntersectionObserver' in window && !window.matchMedia('(prefers-reduced-motion: reduce)').matches) {
    root.classList.add('js');
    var io = new IntersectionObserver(function (es) { es.forEach(function (e) { if (e.isIntersecting) { e.target.classList.add('in'); io.unobserve(e.target); } }); }, { rootMargin: '0px 0px -6% 0px', threshold: 0.06 });
    [].forEach.call(d.querySelectorAll('.rv'), function (el) { io.observe(el); });
  }
})();
