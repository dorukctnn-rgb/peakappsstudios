/* Peak Apps Studio demo kit. Every button that would call, message or open a map shows what the real site would do. */
(function () {
  'use strict';
  var d = document, root = d.documentElement;
  var FX = root.classList.contains('fx');
  var $ = function (s, c) { return (c || d).querySelector(s); };
  var $$ = function (s, c) { return Array.prototype.slice.call((c || d).querySelectorAll(s)); };
  var B = {};
  try { B = JSON.parse($('#biz').textContent); } catch (e) {}
  var T = B.t || {};

  /* open now, from the weekly hours (visitor's clock) */
  function mins(s) { var p = s.replace('.', ':').split(':'); return +p[0] * 60 + +p[1]; }
  function status() {
    var el = $$('[data-status]'); if (!el.length || !B.hours) return;
    var now = new Date(), day = now.getDay(), m = now.getHours() * 60 + now.getMinutes();
    var h = B.hours[day], txt, open = false;
    if (h && m >= mins(h[0]) && m < mins(h[1])) { open = true; txt = T.openUntil.replace('{t}', h[1]); }
    else {
      for (var k = 0; k < 8; k++) {
        var dd = (day + k) % 7, hh = B.hours[dd];
        if (!hh) continue;
        if (k === 0 && m >= mins(hh[0])) continue;
        txt = (k === 0 ? T.opensToday : k === 1 ? T.opensTomorrow : T.opensOn.replace('{d}', T.days[dd])).replace('{t}', hh[0]);
        break;
      }
    }
    el.forEach(function (e) { e.textContent = txt || ''; e.classList.toggle('is-open', open); });
    $$('.hours tr[data-days]').forEach(function (r) { if ((',' + r.getAttribute('data-days') + ',').indexOf(',' + day + ',') > -1) { r.classList.add('today'); $('th', r).setAttribute('data-today', T.today); } });
  }
  status();

  /* dialog */
  var dlg = $('#act'), dh = $('#act-h'), dp = $('#act-p'), db = $('#act-msg');
  function show(kind, msg) {
    if (!dlg) return;
    dh.textContent = T[kind + 'H']; dp.textContent = T[kind + 'P'];
    db.hidden = !msg; if (msg) $('span', db).textContent = msg;
    if (dlg.showModal) dlg.showModal(); else dlg.setAttribute('open', '');
  }
  $$('[data-act]').forEach(function (b) {
    b.addEventListener('click', function (e) { e.preventDefault(); var k = b.getAttribute('data-act'); show(k, k === 'wa' ? (currentMsg() || T.waDefault) : ''); });
  });

  /* the helper: chips write the message */
  var helper = $('.helper');
  function currentMsg() {
    if (!helper) return '';
    var tpl = helper.getAttribute('data-tpl');
    $$('.opts', helper).forEach(function (g, i) {
      var on = $('.chip[aria-pressed="true"]', g);
      tpl = tpl.split('{' + i + '}').join(on ? on.getAttribute('data-msg') : '');
    });
    return tpl;
  }
  function paintMsg() {
    var bub = $('.msg .bubble span', helper); if (!bub) return;
    bub.textContent = currentMsg();
    var p = bub.parentNode; p.classList.remove('pop'); void p.offsetWidth; p.classList.add('pop');
  }
  $$('.opts').forEach(function (g) {
    $$('.chip', g).forEach(function (c) {
      c.addEventListener('click', function () { $$('.chip', g).forEach(function (x) { x.setAttribute('aria-pressed', x === c ? 'true' : 'false'); }); paintMsg(); });
    });
  });
  if (helper) paintMsg();

  /* tabs (timetable) and filters (listings) */
  $$('.tabs').forEach(function (g) {
    var bs = $$('.chip', g);
    bs.forEach(function (b, i) {
      b.addEventListener('click', function () {
        bs.forEach(function (x, j) { x.setAttribute('aria-pressed', i === j ? 'true' : 'false'); });
        $$('.tt', g.parentNode).forEach(function (t, j) { t.hidden = j !== i; });
      });
    });
  });
  $$('.filters').forEach(function (g) {
    var bs = $$('.chip', g), cards = $$('.card[data-f]', g.parentNode);
    bs.forEach(function (b) {
      b.addEventListener('click', function () {
        var f = b.getAttribute('data-f');
        bs.forEach(function (x) { x.setAttribute('aria-pressed', x === b ? 'true' : 'false'); });
        cards.forEach(function (c) { c.hidden = f !== 'all' && c.getAttribute('data-f') !== f; });
      });
    });
  });

  /* top bar, hero drift, gallery drift */
  var top = $('.top'), heroImg = $('.hero .ph img'), gal = $('.gal'), row = gal && $('.row', gal);
  var VH = innerHeight, VW = root.clientWidth;
  addEventListener('resize', function () { VH = innerHeight; VW = root.clientWidth; frame(); });
  var tick = false;
  function frame() {
    tick = false;
    var y = scrollY;
    if (top) top.classList.toggle('scrolled', y > 40);
    if (!FX) return;
    if (heroImg && y < VH * 1.2) { heroImg.style.setProperty('--hy', (y * .22).toFixed(1) + 'px'); heroImg.style.setProperty('--hs', (1.06 - Math.min(1, y / VH) * .04).toFixed(4)); }
    if (row) {
      var r = gal.getBoundingClientRect();
      if (r.bottom > 0 && r.top < VH) {
        var p = Math.max(0, Math.min(1, (VH - r.top) / (VH + r.height)));
        var over = Math.max(0, row.scrollWidth - VW);
        row.style.transform = 'translate3d(' + (-over * p).toFixed(1) + 'px,0,0)';
      }
    }
  }
  addEventListener('scroll', function () { if (!tick) { tick = true; requestAnimationFrame(frame); } }, { passive: true });
  frame();
})();
