/* Peak Apps Studio homepage, concept B "Worlds". No dependencies; the 3D ring module loads later and only on desktop. */
(function () {
  'use strict';
  var d = document, de = d.documentElement;
  var FX = de.classList.contains('fx');
  var conn = navigator.connection || {};
  var SAVE = !!conn.saveData;
  var mq = matchMedia('(max-width: 760px)');
  var fine = matchMedia('(hover: hover) and (pointer: fine)').matches;
  var clamp = function (v, a, b) { a = a === undefined ? 0 : a; b = b === undefined ? 1 : b; return Math.min(b, Math.max(a, v)); };
  var ease = function (t) { return t < .5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2; };
  var lerp = function (a, b, t) { return a + (b - a) * t; };
  var $ = function (s, r) { return (r || d).querySelector(s); };
  var $$ = function (s, r) { return Array.prototype.slice.call((r || d).querySelectorAll(s)); };
  function prog(el) { var r = el.getBoundingClientRect(); return clamp(-r.top / Math.max(1, el.offsetHeight - innerHeight)); }
  function near(el, m) { var r = el.getBoundingClientRect(); return r.bottom > -m && r.top < innerHeight + m; }

  /* ---------- looping clips: poster first, video only near the viewport, paused off screen ---------- */
  var clips = $$('[data-clip]');
  function startClip(f) {
    if (f.dataset.on) return;
    f.dataset.on = '1';
    var v = f.querySelector('video');
    var sizes = f.dataset.sizes.split(',').map(Number).sort(function (a, b) { return a - b; });
    var need = Math.max(f.offsetWidth, f.getBoundingClientRect().width) * Math.min(devicePixelRatio || 1, 2), w = sizes[sizes.length - 1];
    for (var i = 0; i < sizes.length; i++) if (sizes[i] >= need) { w = sizes[i]; break; }
    var base = 'assets/b/clip/' + f.dataset.clip + '-' + w;
    var webm = v.canPlayType('video/webm; codecs="vp9"');
    v.addEventListener('playing', function () { f.classList.add('playing'); });
    v.addEventListener('error', function () { if (!f.dataset.mp4) { f.dataset.mp4 = '1'; v.src = base + '.mp4'; v.load(); if (f.dataset.vis) v.play().catch(function () {}); } });
    v.src = base + (webm ? '.webm' : '.mp4');
    f.dataset.mp4 = webm ? '' : '1';
    v.load();
  }
  if (FX && !SAVE && 'IntersectionObserver' in window) {
    var ioNear = new IntersectionObserver(function (es) { es.forEach(function (e) { if (e.isIntersecting) { startClip(e.target); ioNear.unobserve(e.target); } }); }, { rootMargin: '500px 0px' });
    var ioVis = new IntersectionObserver(function (es) {
      es.forEach(function (e) {
        var f = e.target, v = f.querySelector('video');
        if (e.isIntersecting) { f.dataset.vis = '1'; startClip(f); var p = v.play(); if (p) p.catch(function () {}); }
        else { f.dataset.vis = ''; v.pause(); }
      });
    }, { threshold: .15 });
    var armed = false;
    var arm = function () { if (armed) return; armed = true; clips.forEach(function (f) { ioNear.observe(f); ioVis.observe(f); }); };
    ['scroll', 'pointerdown', 'keydown', 'wheel', 'touchstart'].forEach(function (t) { addEventListener(t, arm, { once: true, passive: true }); });
  }

  /* ---------- hero: weight breathes with scroll, ring comes alive ---------- */
  var hero = $('.hero');
  var lines = $$('#h1 .l');
  var heroLetters = $$('#h1 .c');
  var canvas = $('#ring');
  var ring = null, ringWanted = false;

  function loadRing() {
    if (ringWanted || mq.matches || !FX || SAVE) return;
    ringWanted = true;
    import('./ring.js').then(function (m) {
      var stick = $('.stick', hero);
      ring = m.createRing(canvas, {
        atlas: 'assets/b/img/ring-atlas.webp', colors: canvas.dataset.colors.split(','), bg: '#FFE04A', mode: 'desktop',
        skipIntro: true, loopSeconds: 40, dpr: Math.min(devicePixelRatio || 1, 1.75),
        getScroll: function () { return prog(hero); },
        onReady: function () {
          ring.size(stick.clientWidth, stick.clientHeight);
          ring.draw(0, 1, prog(hero));
          hero.classList.add('live');
          if (near(hero, 0)) ring.play();
        }
      });
      addEventListener('resize', function () { if (ring) ring.size(stick.clientWidth, stick.clientHeight); });
      addEventListener('pointermove', function (e) { if (ring) ring.pointer(e.clientX / innerWidth - .5, e.clientY / innerHeight - .5); }, { passive: true });
      new IntersectionObserver(function (es) { if (!ring) return; if (es[0].isIntersecting) ring.play(); else ring.pause(); }).observe(hero);
    }).catch(function () { ringWanted = false; });
  }
  function ringVideo() {
    var v = $('.ring-vid');
    if (!v || !mq.matches || !FX || SAVE) return;
    v.addEventListener('playing', function () { v.classList.add('on'); });
    var base = v.dataset.src;
    v.addEventListener('error', function () { if (!v.dataset.mp4) { v.dataset.mp4 = '1'; v.src = base + '.mp4'; v.play().catch(function () {}); } }, { once: false });
    v.src = base + (v.canPlayType('video/webm; codecs="vp9"') ? '.webm' : '.mp4');
    if (!/\.webm$/.test(v.src)) v.dataset.mp4 = '1';
    v.play().catch(function () {});
    new IntersectionObserver(function (es) { if (es[0].isIntersecting) v.play().catch(function () {}); else v.pause(); }).observe(v);
  }
  function afterLoad(fn) { if (d.readyState === 'complete') fn(); else addEventListener('load', fn, { once: true }); }
  /* large 2x frames wait for the first paint, so the hero poster gets the bandwidth */
  afterLoad(function () {
    $$('[data-srcset]').forEach(function (el) { el.srcset = el.getAttribute('data-srcset'); el.removeAttribute('data-srcset'); });
    $$('img[data-src]').forEach(function (el) { el.src = el.getAttribute('data-src'); el.removeAttribute('data-src'); });
  });
  afterLoad(function () {
    setTimeout(ringVideo, 600);
    var idle = window.requestIdleCallback || function (f) { return setTimeout(f, 300); };
    setTimeout(function () { idle(loadRing); }, 700);
  });
  ['pointermove', 'keydown', 'wheel'].forEach(function (t) { addEventListener(t, loadRing, { once: true, passive: true }); });

  /* ---------- Rope Crew: the app card opens into the game ---------- */
  var world = $('#rope'), win = $('#win'), cardface = $('#cardface'), label = $('#label');
  var frames = $$('#frames .frame'), wtitle = $('#rope-title'), wl = $$('.c', wtitle);
  var rcBursts = $$('.burst', world);
  var rcimg = $('#rcimg'), RA = 2752 / 2064;
  function rcSize() {
    if (!FX || !G) return;
    var w = G.winW, h = G.winH, iw = Math.max(w, h * RA), ih = iw / RA;
    G.rc = { w: w, h: h, iw: iw, ih: ih };
    rcimg.style.width = iw + 'px'; rcimg.style.height = ih + 'px';
    rcimg.classList.add('sized');
  }
  function rcPan(pr) {
    if (!G.rc) return;
    var r = G.rc, k = ease(clamp((pr - .08) / .8));
    /* landscape: the camera climbs the rope from the hanging buddy to the friend on the deck; portrait: it slides along it */
    var fx = r.iw > r.w + 1 ? lerp(.22, .6, k) : .5, fy = r.ih > r.h + 1 ? lerp(1, .06, k) : .5;
    rcimg.style.transform = 'translate3d(' + (-(r.iw - r.w) * fx).toFixed(1) + 'px,' + (-(r.ih - r.h) * fy).toFixed(1) + 'px,0)';
  }

  /* ---------- Trailer Wreck: frames pan sideways and turn ---------- */
  var tw = $('#trailer-wreck'), track = $('#track'), trackwrap = $('#trackwrap'), figs = track ? $$('figure', track) : [];

  /* geometry is measured once (load, resize, font swap) so scrolling only writes styles */
  var G = null, scrolled = false;
  function box(el) { var r = el.getBoundingClientRect(); return { top: r.top + scrollY, h: el.offsetHeight }; }
  function measure() {
    G = { ih: innerHeight, hero: box(hero), world: box(world), tw: tw ? box(tw) : null, winW: win.clientWidth, winH: win.clientHeight };
    rcSize();
    if (track) { G.wrapL = trackwrap.getBoundingClientRect().left; G.wrapW = trackwrap.clientWidth; G.trackW = track.scrollWidth; G.figs = figs.map(function (f) { return [f.offsetLeft, f.offsetWidth]; }); }
  }
  function gp(b) { return clamp((scrollY - b.top) / Math.max(1, b.h - G.ih)); }
  function gnear(b, m) { var t = b.top - scrollY; return t < G.ih + m && t + b.h > -m; }

  function scenes() {
    if (!FX) return;
    if (!G) measure();
    var m = mq.matches;
    if (!m && gnear(G.hero, 0)) {
      var ph = ease(gp(G.hero));
      lines.forEach(function (l) { l.style.setProperty('--w', l.classList.contains('l2') ? lerp(250, 700, ph) : lerp(800, 300, ph)); });
      heroLetters.forEach(function (c, i) { c.style.setProperty('--y', (Math.sin(ph * 8 - i * .5) * ph * 12).toFixed(2) + 'px'); });
    }
    if (gnear(G.world, G.ih)) {
      var pr = gp(G.world), e = ease(clamp(pr / .3));
      var cw = m ? .12 : .36, ch = .2;
      win.style.setProperty('--t', lerp(ch, 0, e) * 100 + '%'); win.style.setProperty('--b', lerp(ch, 0, e) * 100 + '%');
      win.style.setProperty('--l', lerp(cw, 0, e) * 100 + '%'); win.style.setProperty('--r', lerp(cw, 0, e) * 100 + '%');
      win.style.setProperty('--rad', lerp(44, 0, e) + 'px');
      cardface.style.opacity = 1 - clamp((e - .3) * 4);
      cardface.style.transform = 'scale(' + (1 + e * .5) + ')';
      rcPan(pr);
      framesBox.style.opacity = clamp((e - .4) * 2.5);
      frames.forEach(function (f, i) { var sp = +f.dataset.sp * (m ? .3 : 1); f.style.transform = 'translateY(' + ((1 - e) * 140 - pr * 180 * sp).toFixed(1) + 'px) rotate(' + ((i - 1) * 4 + pr * (i % 2 ? -3 : 3)).toFixed(2) + 'deg)'; });
      wtitle.style.opacity = clamp((e - .5) * 2.4);
      wl.forEach(function (c, i) { var k = ease(clamp((pr - .2) * 2.2 - i * .05)); c.style.setProperty('--w', Math.round(lerp(200, 800, k))); c.style.setProperty('--y', ((1 - k) * 40).toFixed(1) + 'px'); });
      var lo = clamp((pr - .32) * 4);
      label.style.opacity = lo;
      label.style.transform = 'rotate(1.5deg) translateY(' + ((1 - lo) * 40).toFixed(1) + 'px)';
      rcBursts.forEach(function (b, i) { var k = ease(clamp((pr - .42 - i * .06) * 5)); b.style.opacity = k; b.style.transform = 'rotate(' + (i ? 9 : -10) + 'deg) scale(' + (.3 + .7 * k) + ')'; });
    }
    if (tw && G.figs && gnear(G.tw, G.ih)) {
      var pt = gp(G.tw), max = Math.max(0, G.trackW - G.wrapW * .8), x = -pt * max;
      track.style.transform = 'translateY(-50%) translateX(' + x.toFixed(1) + 'px)';
      figs.forEach(function (f, i) { var c = (x + G.figs[i][0] + G.figs[i][1] / 2) / G.wrapW - .5; f.style.transform = 'rotateY(' + (-c * 30).toFixed(2) + 'deg) scale(' + (1 - Math.min(1, Math.abs(c)) * .1).toFixed(3) + ')'; });
    }
  }
  var framesBox = $('#frames');
  var ticking = false;
  function onScroll() { scrolled = true; if (ticking) return; ticking = true; requestAnimationFrame(function () { ticking = false; scenes(); }); }
  addEventListener('scroll', onScroll, { passive: true });
  var rz = 0;
  addEventListener('resize', function () { clearTimeout(rz); rz = setTimeout(function () { G = null; layoutFlow(); scenes(); }, 120); });
  /* nothing moves before the first scroll, so geometry is not read during page load */
  if (d.fonts && d.fonts.ready) d.fonts.ready.then(function () { G = null; if (scrolled) scenes(); });
  afterLoad(function () { G = null; if (scrollY > 0) { scrolled = true; scenes(); } });

  /* ---------- shelf: tabs and a 3D card flow ---------- */
  var shelf = $('#shelf'), tabs = $('#tabs'), flow = $('#flow'), stat = $('#flowstat');
  var all = $$('.fcard', flow), group = 'games', items = [], cur = 0;
  var prev = $('#prev'), next = $('#next');
  function layoutFlow() {
    if (!shelf.classList.contains('cf')) return;
    var m = mq.matches;
    items.forEach(function (c, i) {
      var dd = i - cur, a = Math.abs(dd);
      c.style.transform = 'translateX(' + dd * (m ? 72 : 64) + '%) translateZ(' + (-a * 170) + 'px) rotateY(' + (-Math.sign(dd) * Math.min(a, 1) * 34) + 'deg) scale(' + (a ? .92 : 1) + ')';
      c.style.zIndex = 50 - a;
      c.style.opacity = a > 3 ? 0 : 1;
      c.style.filter = a ? 'brightness(' + (1 - Math.min(a, 3) * .12) + ')' : 'none';
      c.style.pointerEvents = a > 3 ? 'none' : 'auto';
      c.setAttribute('aria-hidden', a > 3 ? 'true' : 'false');
      $$('a', c).forEach(function (l) { l.tabIndex = a === 0 ? 0 : -1; });
    });
    prev.disabled = cur === 0; next.disabled = cur >= items.length - 1;
    if (items[cur]) stat.textContent = items[cur].querySelector('h3').textContent + ', ' + (cur + 1) + ' of ' + items.length;
  }
  function setGroup(g) {
    group = g; cur = 0;
    items = all.filter(function (c) { return c.dataset.g === g; });
    all.forEach(function (c) { c.hidden = c.dataset.g !== g; });
    $$('button', tabs).forEach(function (b) { b.setAttribute('aria-pressed', b.dataset.g === g ? 'true' : 'false'); });
    layoutFlow();
  }
  shelf.classList.add('cf');
  setGroup('games');
  tabs.addEventListener('click', function (e) { var b = e.target.closest('button'); if (b) setGroup(b.dataset.g); });
  prev.addEventListener('click', function () { cur = Math.max(0, cur - 1); layoutFlow(); });
  next.addEventListener('click', function () { cur = Math.min(items.length - 1, cur + 1); layoutFlow(); });
  flow.addEventListener('click', function (e) { var c = e.target.closest('.fcard'); if (c && !e.target.closest('a')) { var i = items.indexOf(c); if (i >= 0 && i !== cur) { cur = i; layoutFlow(); } } });
  flow.addEventListener('keydown', function (e) { if (e.key === 'ArrowRight') { next.click(); e.preventDefault(); } else if (e.key === 'ArrowLeft') { prev.click(); e.preventDefault(); } });
  var sx = null;
  flow.addEventListener('pointerdown', function (e) { sx = e.clientX; });
  flow.addEventListener('pointerup', function (e) { if (sx === null) return; var dx = e.clientX - sx; if (Math.abs(dx) > 40) { cur = clamp(cur + (dx < 0 ? 1 : -1), 0, items.length - 1); layoutFlow(); } sx = null; });

  /* ---------- phones: the device turn and the app screen flows run only on screen ---------- */
  if ('IntersectionObserver' in window) {
    var ioTurn = new IntersectionObserver(function (es) { es.forEach(function (e) { e.target.classList.toggle('run', e.isIntersecting); }); }, { rootMargin: '100px 0px' });
    $$('.turn').forEach(function (t) { ioTurn.observe(t); });
  }

  /* ---------- tilt on hover (mouse only) ---------- */
  if (fine && FX) $$('.tilt').forEach(function (el) {
    el.addEventListener('pointermove', function (e) { var r = el.getBoundingClientRect(); el.style.setProperty('--ry', ((e.clientX - r.left) / r.width - .5) * 14 + 'deg'); el.style.setProperty('--rx', (.5 - (e.clientY - r.top) / r.height) * 14 + 'deg'); });
    el.addEventListener('pointerleave', function () { el.style.setProperty('--rx', '0deg'); el.style.setProperty('--ry', '0deg'); });
  });
})();
