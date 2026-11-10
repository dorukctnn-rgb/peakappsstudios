/* Restoran taslagi: cerceve yok, derleme yok. Hepsi istege bagli; sayfa JS olmadan da okunur. Veri: <script type="application/json" id="r-data"> */
(function () {
  'use strict';
  var d = document, root = d.documentElement;
  var data = {}; try { data = JSON.parse((d.getElementById('r-data') || {}).textContent || '{}'); } catch (e) { data = {}; }
  var T = data.t || {};
  var DAYS = data.days || [];
  var H = data.h || null;       // dakika: [acilis, kapanis] ya da null (kapali / bilinmiyor), indeks = haftanin gunu (0 Pazar)
  var TZ = data.tz || null;

  function hhmm(m) { m = m % 1440; return ('0' + Math.floor(m / 60)).slice(-2) + ':' + ('0' + (m % 60)).slice(-2); }
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
    [].forEach.call(d.querySelectorAll('[data-status]'), function (el) {
      if (!s) { el.setAttribute('data-empty', ''); return; }
      el.removeAttribute('data-empty');
      el.classList.toggle('open', s.open);
      var b = el.querySelector('b'); if (b) b.textContent = s.text;
    });
    if (s !== null || TZ) {
      var row = TZ ? d.querySelector('[data-day="' + nowIn().wd + '"]') : null;
      [].forEach.call(d.querySelectorAll('.hours tr'), function (r) { r.classList.remove('today'); });
      if (row) row.classList.add('today');
    }
  }
  paintStatus(); setInterval(paintStatus, 60000);

  /* ust cubuk ilk kaydirmadan sonra dolar */
  var top = d.querySelector('.top');
  function onScroll() { if (top) top.classList.toggle('solid', window.scrollY > 40); }
  onScroll(); window.addEventListener('scroll', onScroll, { passive: true });

  /* isletmenin kendi videosu: genis ekran, veri tasarrufu yok, hareket azaltma yok; oynamazsa fotograf akisi kalir */
  var v = d.querySelector('.hero-media video');
  function wantVideo() {
    var c = navigator.connection || {};
    return v && v.getAttribute('data-src') && window.matchMedia('(min-width: 900px)').matches && !c.saveData && !window.matchMedia('(prefers-reduced-motion: reduce)').matches && !/capture=1/.test(location.search);
  }
  function startVideo() {
    if (!wantVideo()) return;
    v.src = v.getAttribute('data-src'); v.muted = true; v.loop = true;
    v.addEventListener('playing', function () { v.classList.add('on'); }, { once: true });
    v.addEventListener('error', function () { v.removeAttribute('src'); v.load(); });
    v.play().catch(function () {});
  }
  if (d.readyState === 'complete') startVideo(); else window.addEventListener('load', startVideo);

  /* menu: sekmeler; buyuk fotograf sekmeye gore degisir */
  var tabs = [].slice.call(d.querySelectorAll('.tab'));
  var panels = [].slice.call(d.querySelectorAll('.panel'));
  var vis = d.querySelector('.menu-vis');
  function showImg(i) { if (!vis) return; var ims = vis.querySelectorAll('img'); [].forEach.call(ims, function (im, j) { im.classList.toggle('on', j === i % ims.length); }); }
  function pick(i) {
    tabs.forEach(function (t, j) { t.setAttribute('aria-selected', j === i ? 'true' : 'false'); t.tabIndex = j === i ? 0 : -1; });
    panels.forEach(function (p, j) { p.hidden = j !== i; });
    showImg(i);
  }
  tabs.forEach(function (t, i) {
    t.addEventListener('click', function () { pick(i); });
    t.addEventListener('keydown', function (e) {
      if (e.key === 'ArrowRight' || e.key === 'ArrowLeft') { var j = (i + (e.key === 'ArrowRight' ? 1 : tabs.length - 1)) % tabs.length; pick(j); tabs[j].focus(); }
    });
  });
  if (tabs.length) pick(0); else showImg(0);

  /* rezervasyon formu: secenekler gercek radyo dugmesi; ozet satiri onlari izler; saatler secilen gunun saatlerinden */
  var form = d.getElementById('rez');
  if (form) {
    var sum = form.querySelector('[data-sum]');
    var val = function (n) { var c = form.querySelector('input[name="' + n + '"]:checked'); return c ? c.getAttribute('data-l') || c.value : ''; };
    var paint = function () { if (sum) sum.innerHTML = '<b>' + T.guests.replace('{n}', val('kisi')) + '</b> · <b>' + val('gun') + '</b> · <b>' + val('saat') + '</b>'; };
    var daySlots = data.slots || null; // { "<gun indeksi>": ["18:00", ...] }
    var dayChips = [].slice.call(form.querySelectorAll('input[name="gun"]'));
    var timeBox = form.querySelector('[data-slots]');
    function fillSlots() {
      if (!daySlots || !timeBox) return;
      var c = form.querySelector('input[name="gun"]:checked'); var wd = c ? c.getAttribute('data-wd') : null;
      var list = wd !== null && daySlots[wd] ? daySlots[wd] : null; if (!list || !list.length) return;
      var keep = val('saat'); var html = '';
      list.forEach(function (s, i) { var chk = s === keep || (!keep && i === Math.min(2, list.length - 1)) || (keep && list.indexOf(keep) < 0 && i === Math.min(2, list.length - 1)); html += '<input type="radio" name="saat" id="saat' + i + '" value="' + s + '" data-l="' + s + '"' + (chk ? ' checked' : '') + '><label for="saat' + i + '">' + s + '</label>'; });
      timeBox.innerHTML = html;
    }
    if (dayChips.length && daySlots) {
      // gun etiketleri: bugun, yarin, sonraki acik gunler (yerel saat diliminde)
      var n = TZ ? nowIn() : { wd: new Date().getDay() }; var list = []; var wd0 = n.wd;
      for (var i = 0; i < 7 && list.length < dayChips.length; i++) {
        var w = (wd0 + i) % 7; if (!daySlots[w] || !daySlots[w].length) continue;
        list.push({ wd: w, label: i === 0 ? T.todayLabel : i === 1 ? T.tomorrowLabel : DAYS[w] });
      }
      dayChips.forEach(function (c, k) { var it = list[k]; var lab = d.querySelector('label[for="' + c.id + '"]'); if (!it) { c.disabled = true; if (lab) lab.style.display = 'none'; return; } c.value = it.label; c.setAttribute('data-l', it.label); c.setAttribute('data-wd', it.wd); if (lab) lab.textContent = it.label; });
      fillSlots();
    }
    form.addEventListener('change', function (e) { if (e.target && e.target.name === 'gun') fillSlots(); paint(); }); paint();
    form.addEventListener('submit', function (e) {
      e.preventDefault();
      if (!form.checkValidity()) { form.reportValidity(); return; }
      var name = (form.querySelector('[name="ad"]').value || '').trim().split(/\s+/)[0];
      form.querySelector('[data-thanks]').textContent = T.thanks.replace('{n}', name ? ', ' + name : '');
      form.querySelector('[data-done-sum]').innerHTML = sum ? sum.innerHTML : '';
      form.classList.add('sent');
      var h = form.querySelector('.done'); if (h) { h.setAttribute('tabindex', '-1'); h.focus({ preventScroll: true }); }
    });
  }

  /* kaydirinca belirme */
  if ('IntersectionObserver' in window && !window.matchMedia('(prefers-reduced-motion: reduce)').matches) {
    root.classList.add('js');
    var io = new IntersectionObserver(function (es) { es.forEach(function (e) { if (e.isIntersecting) { e.target.classList.add('in'); io.unobserve(e.target); } }); }, { rootMargin: '0px 0px -6% 0px', threshold: 0.06 });
    [].forEach.call(d.querySelectorAll('.rv'), function (el) { io.observe(el); });
  }
})();
