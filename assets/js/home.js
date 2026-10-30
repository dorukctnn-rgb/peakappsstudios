/* Peak Apps homepage: the card drawer, the stamped dates and the depth scenes.
   No library. Everything here is decoration on top of working markup: without
   this file every card, link and list is still on the page. */
(function () {
  'use strict';
  var root = document.documentElement;
  var reduce = window.matchMedia('(prefers-reduced-motion: reduce)');
  var is3d = root.classList.contains('d3');
  var clamp = function (v, a, b) { return v < a ? a : v > b ? b : v; };
  var smooth = function (a, b, x) { var t = clamp((x - a) / (b - a), 0, 1); return t * t * (3 - 2 * t); };

  /* ---------- Stamped dates: each stamp lands once when its row arrives ---------- */
  var rows = document.querySelectorAll('[data-stamp]');
  if ('IntersectionObserver' in window && !reduce.matches) {
    var io = new IntersectionObserver(function (entries) {
      entries.forEach(function (e) {
        if (e.isIntersecting) { e.target.classList.add('is-in'); io.unobserve(e.target); }
      });
    }, { rootMargin: '0px 0px -12% 0px' });
    rows.forEach(function (r) { io.observe(r); });
  } else {
    rows.forEach(function (r) { r.classList.add('is-in'); });
  }

  if (!is3d) return;

  /* ---------- The drawer ---------- */
  var cat = document.querySelector('[data-cat]');
  var drawer = document.querySelector('[data-drawer]');
  var cards = Array.prototype.slice.call(document.querySelectorAll('[data-cards] > .card'));
  var links = cards.map(function (c) { return c.querySelector('.card-link'); });
  var buttons = Array.prototype.slice.call(document.querySelectorAll('[data-cat-index] button'));
  var N = cards.length;
  var current = -1;

  function catRange() {
    var top = cat.getBoundingClientRect().top + window.scrollY;
    var travel = cat.offsetHeight - window.innerHeight;
    return { top: top, travel: Math.max(1, travel) };
  }
  // Map scroll inside the drawer section to a card position. Each card holds
  // for the middle of its stretch and flips in the rest, so it can be read.
  function cardPos() {
    var r = catRange();
    var raw = clamp((window.scrollY - r.top) / r.travel, 0, 1);
    var lin = clamp((raw - 0.03) / 0.94, 0, 1) * (N - 1);
    var base = Math.floor(lin);
    if (base >= N - 1) return N - 1;
    return base + smooth(0.28, 0.82, lin - base);
  }
  function scrollForCard(i) {
    var r = catRange();
    var lin = i / (N - 1);
    return r.top + (0.03 + lin * 0.94) * r.travel;
  }

  var gap = 30;
  function layoutCards(p) {
    var small = window.innerWidth < 960;
    gap = small ? 20 : 30;
    for (var i = 0; i < N; i++) {
      var d = i - p, el = cards[i], tf, op = 1, shade = 0, ty = 0;
      if (d >= 0) {
        var lean = Math.min(d, 1) * 4 + Math.max(d - 1, 0) * 1.2;
        shade = Math.min(0.32, d * 0.07);
        if (d > 5.2) op = clamp(6.4 - d, 0, 1);
        tf = 'translate3d(0,' + ty + 'px,' + (-d * gap).toFixed(1) + 'px) rotateX(' + lean.toFixed(2) + 'deg)';
      } else {
        var t = clamp(-d, 0, 1);
        var e = 1 - Math.pow(1 - t, 2);
        op = 1 - smooth(0.3, 0.78, t);
        tf = 'translate3d(0,' + (e * 18).toFixed(1) + 'px,' + (e * 40).toFixed(1) + 'px) rotateX(' + (-e * 84).toFixed(2) + 'deg)';
      }
      el.style.transform = tf;
      el.style.opacity = op.toFixed(3);
      el.style.setProperty('--shade', shade.toFixed(3));
      el.style.visibility = op < 0.02 ? 'hidden' : 'visible';
      el.style.zIndex = String(100 - Math.round(Math.abs(d) * 10));
      links[i].style.pointerEvents = Math.abs(d) < 0.5 ? 'auto' : 'none';
    }
    var now = clamp(Math.round(p), 0, N - 1);
    if (now !== current) {
      current = now;
      buttons.forEach(function (b, k) {
        if (k === now) b.setAttribute('aria-current', 'true'); else b.removeAttribute('aria-current');
      });
    }
  }

  buttons.forEach(function (b) {
    b.addEventListener('click', function () {
      var i = +b.getAttribute('data-go');
      window.scrollTo({ top: scrollForCard(i), behavior: reduce.matches ? 'auto' : 'smooth' });
      // Hand keyboard users straight to the card they asked for.
      setTimeout(function () { links[i].focus({ preventScroll: true }); }, reduce.matches ? 0 : 650);
    });
  });
  // Tabbing onto a card that is behind or already flipped brings it to the front.
  links.forEach(function (a, i) {
    a.addEventListener('focus', function () {
      if (Math.abs(cardPos() - i) > 0.4) window.scrollTo({ top: scrollForCard(i), behavior: 'auto' });
    });
  });

  // A small turn of the drawer toward the pointer, desktop only.
  var ry = 0, ryTarget = 0;
  if (window.matchMedia('(hover: hover) and (pointer: fine)').matches) {
    window.addEventListener('pointermove', function (e) {
      ryTarget = (e.clientX / window.innerWidth - 0.5) * 9;
      queue();
    }, { passive: true });
  }

  /* ---------- Depth scenes driven by their own progress ---------- */
  function progressOf(el) {
    var r = el.getBoundingClientRect(), vh = window.innerHeight;
    return clamp((vh - r.top) / (vh + r.height), 0, 1);
  }
  var golf = document.querySelector('[data-depth-scene]');
  var golfScene = golf && golf.querySelector('.golf-scene');
  var ringScene = document.querySelector('[data-ring-scene]');
  var ring = document.querySelector('[data-ring]');
  var web = document.querySelector('.web-phone');

  function scenes() {
    if (golfScene) {
      var g = progressOf(golf);
      var s = smooth(0.12, 0.62, g);
      golfScene.style.setProperty('--ry', (-24 + s * 17).toFixed(2) + 'deg');
      golfScene.style.setProperty('--rx', (12 - s * 9).toFixed(2) + 'deg');
      golfScene.style.setProperty('--py', ((0.5 - g) * 60).toFixed(1) + 'px');
      golfScene.style.setProperty('--pp', ((0.5 - g) * -90).toFixed(1) + 'px');
    }
    if (ring) {
      var b = progressOf(ringScene);
      ring.style.setProperty('--ring', (-40 - b * 260).toFixed(2) + 'deg');
    }
    if (web) {
      web.style.setProperty('--wy', ((0.5 - progressOf(web)) * 50).toFixed(1) + 'px');
    }
  }

  var ticking = false;
  function frame() {
    ticking = false;
    layoutCards(cardPos());
    ry += (ryTarget - ry) * 0.12;
    drawer.style.setProperty('--ry', ry.toFixed(2) + 'deg');
    if (Math.abs(ryTarget - ry) > 0.05) queue();
    scenes();
  }
  function queue() { if (!ticking) { ticking = true; requestAnimationFrame(frame); } }
  window.addEventListener('scroll', queue, { passive: true });
  window.addEventListener('resize', queue);
  reduce.addEventListener && reduce.addEventListener('change', function () { location.reload(); });
  frame();
})();
