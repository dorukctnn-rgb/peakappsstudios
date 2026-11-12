/* iz.js: restoran imlec izi (v5 ust katman, 12 Kas 2026). Isletmenin KENDI yemekleri, kendi fotograflarindan temiz kesilmis tabaklar imleci izler.
   Kesim yoksa ya da 4'ten azsa sayfaya iz yazilmaz (veri yok, bu dosya hic istenmez). Kutuphane yok, tek <canvas>, yalniz is varken rAF.
   Restoran dili: yavas ve sakin. 4-6 tabak imlecin pesinden yumusak yaylarla gelir, harekete gore hafifce egilir; imlec durunca tabaklar imlecin
   yaninda kucuk bir yay uzerinde masaya dizilir gibi durur, sonra soner. Metin, menu, dugme ve baglanti uzerinde iz hemen soner (okumayi engellemez).
   Telefon (fare yok): bos bir yere dokununca uc tabak yavasca yukselip soner (en cok 0,9 sn'de bir); kaydirmada hicbir sey olmaz.
   Azaltilmis hareket, ?capture=1 ve Save-Data'da ust.js bu dosyayi hic yuklemez; burada ikinci kez denetlenir.
   Atlas: tek satir, hucre basina bir tabak (golgesi dosyada pismis), WebP. */
(function () {
  'use strict';
  var d = document, w = window, root = d.documentElement;
  var mm = function (q) { return !!(w.matchMedia && w.matchMedia(q).matches); };
  if (root.classList.contains('still') || mm('(prefers-reduced-motion: reduce)') || (navigator.connection || {}).saveData) return;
  if (d.querySelector('.iz-v5')) return;
  var U = {}; try { U = JSON.parse((d.getElementById('r-ust') || {}).textContent || '{}'); } catch (e) { U = {}; }
  var cfg = U.iz; if (!cfg || !cfg.src || !cfg.n || cfg.n < 4) return;
  var FINE = mm('(hover: hover) and (pointer: fine)');
  var N = Math.min(6, cfg.n), CELL = cfg.cell || 200, TAU = Math.PI * 2;
  var OFF = 'a,button,input,label,select,textarea,summary,h1,h2,h3,h4,h5,p,li,dt,dd,th,td,figcaption,blockquote,.mx-body,.facts,.contact-card,.top,.bar,.marquee,.gal-h,[data-iz-off]';
  var dpr = Math.min(w.devicePixelRatio || 1, 2);
  var SZ = Math.round((cfg.boy || 1) * (w.innerWidth >= 1600 ? 142 : 124));

  var layer = d.createElement('div'); layer.className = 'iz-v5'; layer.setAttribute('aria-hidden', 'true');
  var cv = d.createElement('canvas'); layer.appendChild(cv);
  var ctx = cv.getContext('2d', { alpha: true }); if (!ctx) return;
  var W = 0, H = 0;
  function size() { W = w.innerWidth; H = w.innerHeight; cv.width = Math.round(W * dpr); cv.height = Math.round(H * dpr); cv.style.width = W + 'px'; cv.style.height = H + 'px'; }
  var atlas = new Image(), ready = false;
  atlas.onload = function () { ready = true; d.body.appendChild(layer); size(); kick(); };
  atlas.decoding = 'async'; atlas.src = cfg.src;
  w.addEventListener('resize', function () { if (ready) { size(); kick(); } }, { passive: true });

  function draw(k, x, y, s, rot, al) {
    if (al <= 0.01) return;
    ctx.globalAlpha = al > 1 ? 1 : al;
    ctx.setTransform(dpr, 0, 0, dpr, x * dpr, y * dpr); if (rot) ctx.rotate(rot);
    ctx.drawImage(atlas, k * CELL, 0, CELL, CELL, -s / 2, -s / 2, s, s);
  }

  /* ---- zincir (masaustu) ---- */
  var mx = -1, my = -1, lastMove = 0, seen = false, over = false, vis = 0, spd = 0;
  var tail = []; for (var i = 0; i < N; i++) tail.push({ x: 0, y: 0, vx: 0, vy: 0, a: 0 });
  // durunca dizilis: imlecin sag altinda yumusak bir yay (en yakin tabak en onde)
  var ARC = []; for (var j = 0; j < N; j++) { var t = N > 1 ? j / (N - 1) : 0, ang = (-0.15 + t * 1.25) * Math.PI / 2.2; ARC.push([Math.cos(ang) * (0.95 + t * 0.35), Math.sin(ang) * (0.95 + t * 0.35) + 0.15]); }
  function onMove(e) {
    if (e.pointerType && e.pointerType !== 'mouse') return;
    var nx = e.clientX, ny = e.clientY;
    if (seen) { var dx = nx - mx, dy = ny - my; spd = Math.min(60, Math.sqrt(dx * dx + dy * dy)); }
    mx = nx; my = ny; lastMove = performance.now();
    if (!seen) { seen = true; for (var i = 0; i < N; i++) { tail[i].x = mx; tail[i].y = my; } }
    kick();
  }
  if (FINE) {
    w.addEventListener('pointermove', onMove, { passive: true });
    root.addEventListener('mouseleave', function () { lastMove = 0; kick(); });
    d.addEventListener('pointerover', function (e) { var o = !!(e.target && e.target.closest && e.target.closest(OFF)); if (o !== over) { over = o; kick(); } }, { passive: true });
    w.addEventListener('scroll', function () { if (seen) { lastMove = performance.now() - 500; kick(); } }, { passive: true });
  }

  /* ---- dokunma: uc tabak yukselir ve soner ---- */
  var pool = []; for (var q = 0; q < 6; q++) pool.push({ on: false, x: 0, y: 0, vx: 0, vy: 0, s: 0, r: 0, vr: 0, life: 0, ttl: 1, k: 0 });
  var lastTap = 0, nextK = 0;
  w.addEventListener('pointerdown', function (e) {
    if (e.pointerType !== 'touch' && e.pointerType !== 'pen') return;
    if (e.target && e.target.closest && e.target.closest(OFF)) return;
    var now = performance.now(); if (now - lastTap < 900) return; lastTap = now;
    var made = 0;
    for (var i = 0; i < pool.length && made < 3; i++) {
      var p = pool[i]; if (p.on) continue;
      var a = -Math.PI / 2 + (made - 1) * 0.55 + (Math.random() - 0.5) * 0.2;
      p.on = true; p.x = e.clientX; p.y = e.clientY; p.vx = Math.cos(a) * 1.1; p.vy = Math.sin(a) * 1.4 - 0.4;
      p.s = 64 + Math.random() * 10; p.r = (Math.random() - 0.5) * 0.4; p.vr = (Math.random() - 0.5) * 0.5;
      p.life = 0; p.ttl = 1.5 + Math.random() * 0.3; p.k = nextK % N; nextK++; made++;
    }
    kick();
  }, { passive: true });

  function spring(o, gx, gy, K, D, h) { o.vx += (gx - o.x) * K * h; o.vy += (gy - o.y) * K * h; var dm = Math.pow(1 - D, h); o.vx *= dm; o.vy *= dm; o.x += o.vx * h; o.y += o.vy * h; }

  var running = false, prev = 0;
  function kick() { if (!running && ready) { running = true; prev = 0; w.requestAnimationFrame(frame); } }
  function frame(now) {
    var dt = prev ? Math.min(0.05, (now - prev) / 1000) : 1 / 60; prev = now;
    var f = dt * 60, busy = false;
    ctx.setTransform(1, 0, 0, 1, 0, 0); ctx.clearRect(0, 0, cv.width, cv.height);
    if (FINE && seen) {
      var since = lastMove ? now - lastMove : 1e9;
      var idle = since > 420;
      var want = (!over && since < 2600) ? 1 : 0;
      vis += (want - vis) * (1 - Math.pow(want ? 0.9 : (over ? 0.72 : 0.94), f));
      spd *= Math.pow(0.86, f);
      if (vis > 0.01) {
        var n = Math.max(1, Math.ceil(f)), h = f / n;
        var ax = mx + 26, ay = my + 22;
        for (var i = 0; i < N; i++) {
          var T = tail[i];
          for (var s = 0; s < n; s++) {
            if (idle) spring(T, ax + ARC[i][0] * SZ * 1.05, ay + ARC[i][1] * SZ * 0.9, 0.045, 0.16, h);
            else spring(T, i ? tail[i - 1].x : mx + 18, i ? tail[i - 1].y : my + 16, 0.11 - i * 0.008, 0.3, h);
          }
          var mv = Math.sqrt(T.vx * T.vx + T.vy * T.vy);
          var ta = idle ? (i - (N - 1) / 2) * 0.06 : clamp(T.vx * 0.012, -0.26, 0.26);
          T.a += (ta - T.a) * (1 - Math.pow(0.9, f));
          if (mv > 0.04 || Math.abs(ta - T.a) > 0.003) busy = true;
        }
        // arkadaki (son) once cizilir; en yakin tabak en ustte
        for (var k = N - 1; k >= 0; k--) { var Q = tail[k]; var sc = idle ? 1 - k * 0.035 : 1 - k * 0.07; draw(k % cfg.n, Q.x, Q.y, SZ * sc, Q.a, vis * (idle ? 1 : 1 - k * 0.06)); }
      }
      if (Math.abs(want - vis) > 0.01) busy = true;
      if (want && !busy && since < 2600) busy = true;
    }
    for (var m = 0; m < pool.length; m++) {
      var p = pool[m]; if (!p.on) continue;
      p.life += dt; if (p.life >= p.ttl) { p.on = false; continue; }
      p.vy += 0.02 * f; p.vx *= Math.pow(0.97, f); p.vy *= Math.pow(0.97, f); p.x += p.vx * f; p.y += p.vy * f; p.r += p.vr * dt;
      var qq = p.life / p.ttl, al = qq < 0.15 ? qq / 0.15 : qq > 0.6 ? 1 - (qq - 0.6) / 0.4 : 1, sc2 = 0.7 + 0.3 * Math.min(1, qq / 0.25);
      draw(p.k, p.x, p.y, p.s * sc2, p.r, al); busy = true;
    }
    ctx.globalAlpha = 1;
    if (busy) w.requestAnimationFrame(frame); else running = false;
  }
  function clamp(x, a, b) { return x < a ? a : x > b ? b : x; }
  d.addEventListener('visibilitychange', function () { if (d.hidden) lastMove = 0; });
  w.__izv5 = { running: function () { return running; }, n: N };
})();
