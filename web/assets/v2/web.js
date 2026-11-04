/* Peak Apps Studio, websites page v2. Motion runs by default; the footer switch stores pa-motion=off (same key as the homepage). */
(function () {
  'use strict';
  var d = document, root = d.documentElement;
  var FX = root.classList.contains('fx');
  var $ = function (s, c) { return (c || d).querySelector(s); };
  var $$ = function (s, c) { return Array.prototype.slice.call((c || d).querySelectorAll(s)); };
  var clamp = function (v, a, b) { return Math.max(a, Math.min(b, v)); };
  var VH = innerHeight, VW = root.clientWidth;
  addEventListener('resize', function () { VH = innerHeight; VW = root.clientWidth; layoutAll(); });

  /* ---------- hero: one business at a time assembles across laptop, tablet and phone ---------- */
  var data = [];
  try { data = JSON.parse($('#sectors').textContent); } catch (e) {}
  var stage = $('.stage'), hero = $('.hero'), cap = $('#pick-cap');
  var chips = $$('.chip');
  var devs = stage ? $$('.dev', stage) : [];
  var cur = -1, userPicked = false, cycleT = 0, heroP = 0, heroIn = true;
  var RATIO = { l: 2400 / 1280, t: 2048 / 768, p: 3376 / 780 };

  function layoutDev(dev) {
    var v = $('.view', dev), k = dev.getAttribute('data-k');
    var w = v.clientWidth, h = v.clientHeight;
    if (!w) return;
    var ih = w * RATIO[k], bh = h / 4;
    dev._max = Math.max(0, ih - h);
    $$('.band', v).forEach(function (b, i) { b.style.top = (i * bh) + 'px'; b.style.height = Math.ceil(bh + 1) + 'px'; b.style.setProperty('--b', i * bh); });
  }
  function layoutAll() { devs.forEach(layoutDev); paintHero(); wallSize(); }

  function srcFor(s, k) { return '/web/assets/v2/shot/' + s.slug + '-' + (s.lang || 'en') + '-' + k + '.webp'; }
  function preload(i) {
    var s = data[i]; if (!s || s._pre) return; s._pre = 1;
    ['l', 't', 'p'].forEach(function (k) { var im = new Image(); im.src = srcFor(s, k); });
  }
  function setSector(i, animate) {
    if (!data.length || i === cur) return;
    cur = i;
    var s = data[i];
    chips.forEach(function (c, j) { c.setAttribute('aria-pressed', j === i ? 'true' : 'false'); });
    if (animate && FX) stage.classList.add('asm');
    var waits = [];
    devs.forEach(function (dev) {
      var k = dev.getAttribute('data-k'), src = srcFor(s, k);
      $$('img', dev).forEach(function (im) {
        if (im.getAttribute('src') !== src) { im.src = src; if (im.decode) waits.push(im.decode().catch(function () {})); }
      });
    });
    $('.stk.price span', stage).textContent = s.price;
    $('.stk.open span', stage).textContent = s.open;
    $('.stk.call span', stage).textContent = s.call;
    $('.stk.wa p', stage).textContent = s.wa;
    if (cap) {
      cap.innerHTML = '';
      var t = d.createElement('span'); t.textContent = s.line + ' ';
      var a = d.createElement('a'); a.href = s.url; a.textContent = s.open_demo;
      cap.appendChild(t); cap.appendChild(a);
      if (s.url2) { var b = d.createElement('a'); b.href = s.url2; b.hreflang = s.lang2; b.textContent = s.label2; cap.appendChild(d.createTextNode(' ')); cap.appendChild(b); }
    }
    Promise.all(waits).then(function () {
      requestAnimationFrame(function () { requestAnimationFrame(function () { stage.classList.remove('asm'); }); });
      preload((i + 1) % data.length);
    });
  }
  function paintHero() {
    if (!stage) return;
    var r = hero.getBoundingClientRect();
    var pinned = FX && getComputedStyle($('.hero-pin')).position === 'sticky';
    var p;
    if (pinned) p = clamp(-r.top / Math.max(1, r.height - VH), 0, 1);
    else { var sr = stage.getBoundingClientRect(); p = clamp((VH * .92 - sr.top) / (VH * .92), 0, 1); }
    heroIn = r.bottom > 0 && r.top < VH;
    if (!FX) p = 0;
    heroP = p;
    stage.style.setProperty('--p', p.toFixed(4));
    devs.forEach(function (dev) {
      var s = pinned ? p : clamp((p - .15) / .85, 0, 1);
      $('.view', dev).style.setProperty('--sh', ((dev._max || 0) * (FX ? s : 0)).toFixed(1) + 'px');
    });
  }
  function cycle() {
    clearTimeout(cycleT);
    if (!FX || userPicked || !data.length) return;
    cycleT = setTimeout(function () {
      if (!userPicked && heroIn && heroP < .04 && !d.hidden) setSector((cur + 1) % data.length, true);
      cycle();
    }, 6500);
  }
  if (stage && data.length) {
    chips.forEach(function (c, j) {
      c.addEventListener('click', function () { userPicked = true; clearTimeout(cycleT); setSector(j, true); });
      c.addEventListener('pointerenter', function () { preload(j); });
    });
    var first = +(stage.getAttribute('data-first') || 0);
    cur = first;
    layoutAll();
    if (FX) {
      // the intro: the page flies together once the first pictures are decoded
      var ims = $$('img', stage).map(function (im) { return im.decode ? im.decode().catch(function () {}) : 0; });
      Promise.all(ims).then(function () { setTimeout(function () { root.classList.remove('pre'); stage.classList.remove('asm'); }, 60); });
      setTimeout(function () { root.classList.remove('pre'); stage.classList.remove('asm'); }, 2500);
      cycle();
      setTimeout(function () { preload((first + 1) % data.length); }, 2000);
    }
  }

  /* ---------- reel: videos play only on screen; calm mode keeps the poster until a tap ---------- */
  var vids = $$('video[data-src]');
  function loadVid(v) {
    if (v._ok) return; v._ok = 1;
    $$('source', v).forEach(function (s) { s.src = s.getAttribute('data-src'); });
    v.load();
  }
  if ('IntersectionObserver' in window) {
    var vio = new IntersectionObserver(function (es) {
      es.forEach(function (e) {
        var v = e.target;
        if (e.isIntersecting) { if (FX) { loadVid(v); var pr = v.play(); if (pr && pr.catch) pr.catch(function () {}); } }
        else if (!v.paused) v.pause();
      });
    }, { rootMargin: '120px 0px', threshold: .2 });
    vids.forEach(function (v) { vio.observe(v); });
  }
  $$('.playbtn').forEach(function (b) {
    b.addEventListener('click', function () {
      var v = $('video', b.parentNode); loadVid(v); v.controls = true; b.remove();
      var pr = v.play(); if (pr && pr.catch) pr.catch(function () {});
    });
  });
  if (FX) $$('.playbtn').forEach(function (b) { b.remove(); });

  /* ---------- before / after ---------- */
  var range = $('#ba-range'), cmps = $$('.cmp');
  function setX(x) { cmps.forEach(function (c) { c.style.setProperty('--x', x + '%'); }); if (range && +range.value !== Math.round(x)) range.value = Math.round(x); }
  if (range) {
    range.addEventListener('input', function () { setX(+range.value); });
    cmps.forEach(function (c) {
      var drag = false;
      function at(e) { var r = c.getBoundingClientRect(); setX(clamp((e.clientX - r.left) / r.width * 100, 0, 100)); }
      c.addEventListener('pointerdown', function (e) { drag = true; c.setPointerCapture(e.pointerId); at(e); });
      c.addEventListener('pointermove', function (e) { if (drag) at(e); });
      c.addEventListener('pointerup', function () { drag = false; });
      c.addEventListener('pointercancel', function () { drag = false; });
    });
    if (FX && 'IntersectionObserver' in window) {
      var swept = false;
      var bio = new IntersectionObserver(function (es) {
        if (swept || !es[0].isIntersecting) return; swept = true; bio.disconnect();
        var t0 = performance.now(), keys = [[0, 50], [900, 14], [1900, 86], [2700, 50]];
        (function step(t) {
          var e = t - t0, x = 50;
          for (var i = 1; i < keys.length; i++) { if (e <= keys[i][0]) { var a = keys[i - 1], b = keys[i], f = (e - a[0]) / (b[0] - a[0]); f = f < .5 ? 2 * f * f : 1 - Math.pow(-2 * f + 2, 2) / 2; x = a[1] + (b[1] - a[1]) * f; break; } }
          setX(x); if (e < 2700) requestAnimationFrame(step);
        })(t0);
      }, { threshold: .5 });
      bio.observe($('.ba-box'));
    }
  }

  /* ---------- tour: the pinned phone follows the step on screen ---------- */
  var vigs = $$('.tour-ph .vig'), steps = $$('.steps-list li');
  function showVig(i) { vigs.forEach(function (v, j) { var on = j === i; if (on && !v.classList.contains('on')) { v.classList.remove('on'); void v.offsetWidth; } v.classList.toggle('on', on); }); }
  if (vigs.length && 'IntersectionObserver' in window) {
    var tio = new IntersectionObserver(function (es) {
      es.forEach(function (e) { if (e.isIntersecting) showVig(steps.indexOf(e.target)); });
    }, { rootMargin: '-45% 0px -45% 0px' });
    steps.forEach(function (s) { tio.observe(s); });
  }

  /* ---------- wall: ten demos glide sideways while the section is pinned (desktop) ---------- */
  var wall = $('.wall'), track = $('.track'), cards = $$('.card');
  var wallPinned = false, wallOver = 0;
  function wallSize() {
    if (!wall || !track) return;
    wallPinned = FX && VW >= 1000 && VH >= 620;
    wall.classList.toggle('pinned', wallPinned);
    if (wallPinned) { wallOver = Math.max(0, track.scrollWidth - VW); wall.style.height = (VH + wallOver) + 'px'; }
    else { wall.style.height = ''; track.style.transform = ''; }
  }
  function paintWall() {
    if (!wall) return;
    var r = wall.getBoundingClientRect();
    if (r.bottom < 0 || r.top > VH) return;
    if (wallPinned) { var p = clamp(-r.top / Math.max(1, r.height - VH), 0, 1); track.style.transform = 'translate3d(' + (-wallOver * p).toFixed(1) + 'px,0,0)'; }
    if (FX) cards.forEach(function (c) {
      var cr = c.getBoundingClientRect(), x = (cr.left + cr.width / 2 - VW / 2) / VW;
      c.style.setProperty('--ry', (clamp(x, -1, 1) * -26).toFixed(2) + 'deg');
      c.style.setProperty('--tz', (-Math.abs(clamp(x, -1, 1)) * 90).toFixed(1) + 'px');
    });
  }

  /* ---------- reel tilt-in ---------- */
  var tilts = $$('.tiltin');
  function paintTilts() {
    if (!FX) return;
    tilts.forEach(function (t) { var r = t.getBoundingClientRect(); if (r.top > VH || r.bottom < 0) return; t.style.setProperty('--v', clamp((VH - r.top) / (VH * .55), 0, 1).toFixed(3)); });
  }

  var ticking = false;
  function frame() { ticking = false; paintHero(); paintWall(); paintTilts(); }
  addEventListener('scroll', function () { if (!ticking) { ticking = true; requestAnimationFrame(frame); } }, { passive: true });
  wallSize(); frame();
  addEventListener('load', function () { layoutAll(); frame(); });

  /* ---------- footer switch ---------- */
  var mt = $('#motion-toggle');
  if (mt) {
    mt.textContent = FX ? mt.getAttribute('data-off') : mt.getAttribute('data-on');
    mt.addEventListener('click', function () {
      try { if (FX) localStorage.setItem('pa-motion', 'off'); else localStorage.removeItem('pa-motion'); } catch (e) {}
      location.reload();
    });
  }
})();
