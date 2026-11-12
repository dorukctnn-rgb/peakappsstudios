/* imlec.js: kategori sablonlarinin (burger, burrito, pizza) imlec / dokunma efekti.  Kutuphane yok, tek <canvas>.
   Gorseller: malzeme atlasi (satir = malzeme, sutun = 3D donus karesi; Peak Apps Studio'nun kendi prosedurel 3D cizimi, CC0).
   - Zincir: imlecin pesinden yaylarla gelen malzemeler; hareket ettikce 3D takla atar (kare = katedilen yol), aci hareket yonunden gelir.
     Imlec durunca malzemeler yayla ziplayarak ust uste oturur ve kucuk bir urun olur (burgerde: ust ekmek, marul, domates, peynir, kofte, alt ekmek);
     hareket edince yine kuyruk gibi acilir.  Baglanti ve dugme ustunde zincir solar (tiklanan yer kapanmaz).
   - Sacilma: imlec hizlandikca ve tiklamada malzemeler firlar, 3D doner, yer cekimiyle duser, ekranin altinda bir kez seker, solar.
     En cok 40 parcacik, sabit havuzdan yeniden kullanim (calisirken nesne uretilmez); rAF yalniz is varken doner.
   - Telefon (fare yok): dokunusta patlama, hizli kaydirmada ustten seyrek yagmur.
   - Azaltilmis harekette ve "still" (ekran goruntusu) modunda hic calismaz; sayfa betigi bu dosyayi o durumda yuklemez, burada ikinci kez denetlenir.
   - Istege bagli (pastane, 12 Kas): cfg.yer = durunca her parcanin yeri [dx, dy] (boy biriminde; dikey yigin yerine kucuk bir tepsi dizilisi, arkadaki once cizilir),
     cfg.boy = boy carpani (fotograf kesitleri biraz buyuk).  Verilmezse davranis eskisiyle ayni (burger, burrito, pizza degismez). */
(function () {
  'use strict';
  var d = document, w = window, root = d.documentElement;
  var mm = function (q) { return !!(w.matchMedia && w.matchMedia(q).matches); };
  if (root.classList.contains('still') || mm('(prefers-reduced-motion: reduce)')) return;
  if (d.querySelector('.iz')) return;
  var data = {}; try { data = JSON.parse((d.getElementById('r-data') || {}).textContent || '{}'); } catch (e) { data = {}; }
  var cfg = data.imlec; if (!cfg || !cfg.src || !cfg.names) return;
  var FINE = mm('(hover: hover) and (pointer: fine)');
  var MAXP = Math.min(40, cfg.max || 40), CELL = cfg.cell, NF = cfg.frames, TAU = Math.PI * 2;
  var rowOf = function (n) { return cfg.names.indexOf(n); };
  var STACK = (cfg.stack || []).map(rowOf).filter(function (r) { return r >= 0; });
  var PARTS = (cfg.parts || cfg.names).map(rowOf).filter(function (r) { return r >= 0; });
  var NB = FINE ? STACK.length : 0;
  // durunca ust uste dizilis: her parcanin bir ustundekine uzakligi (60 px boyda); urune gore (cfg.gap) ya da esit
  var dpr = Math.min(w.devicePixelRatio || 1, 2);
  // boy: atlas hucresi 112 px; 1x ekranda 84 px (kucultme, keskin), 1.5x ve ustunde 66 px (en cok 1.2 kat)
  var BOY = cfg.boy > 0 ? Math.min(1.6, cfg.boy) : 1;
  var SZ = Math.round((dpr >= 1.5 ? 66 : 84) * BOY), PS = SZ / 60;
  var GAP = ((cfg.gap && cfg.gap.length === NB) ? cfg.gap : STACK.map(function (r, i) { return i ? 8 : 0; })).map(function (g) { return g * PS; });
  var YER = (cfg.yer && cfg.yer.length >= NB) ? cfg.yer.slice(0, NB) : null;
  var ORD = []; for (var oi = NB - 1; oi >= 0; oi--) ORD.push(oi);
  if (YER) ORD.sort(function (a, b) { return YER[a][1] - YER[b][1] || b - a; }); // durunca arkadaki (ustteki) once cizilir

  var layer = d.createElement('div'); layer.className = 'iz'; layer.setAttribute('aria-hidden', 'true');
  var cv = d.createElement('canvas'); layer.appendChild(cv);
  var ctx = cv.getContext('2d', { alpha: true }); if (!ctx) return;
  var W = 0, H = 0;
  function size() { W = w.innerWidth; H = w.innerHeight; cv.width = Math.round(W * dpr); cv.height = Math.round(H * dpr); cv.style.width = W + 'px'; cv.style.height = H + 'px'; }
  var atlas = new Image(), ready = false;
  atlas.onload = function () { ready = true; d.body.appendChild(layer); size(); root.classList.add('iz-on'); kick(); };
  atlas.decoding = 'async'; atlas.src = cfg.src;
  w.addEventListener('resize', function () { if (ready) { size(); kick(); } }, { passive: true });

  function draw(row, ph, x, y, s, rot, al) {
    if (al <= 0.01) return;
    var f = Math.floor(((ph % TAU) + TAU) % TAU / TAU * NF + 0.5) % NF;
    ctx.globalAlpha = al > 1 ? 1 : al; ctx.setTransform(dpr, 0, 0, dpr, x * dpr, y * dpr); if (rot) ctx.rotate(rot);
    ctx.drawImage(atlas, f * CELL, row * CELL, CELL, CELL, -s / 2, -s / 2, s, s);
  }

  /* ---- parcacik havuzu (sabit) ---- */
  var pool = [], live = 0;
  for (var i = 0; i < MAXP; i++) pool.push({ on: false, x: 0, y: 0, vx: 0, vy: 0, s: 0, r: 0, vr: 0, ph: 0, vph: 0, life: 0, ttl: 0, row: 0, b: 0 });
  function spawn(x, y, vx, vy, big) {
    if (!ready || live >= MAXP) return;
    for (var i = 0; i < MAXP; i++) {
      var p = pool[i]; if (p.on) continue;
      p.on = true; live++;
      p.x = x; p.y = y; p.vx = vx; p.vy = vy; p.b = 0;
      p.s = (big ? 44 + Math.random() * 18 : 32 + Math.random() * 18) * PS;   // 1x ekranda en cok 87 px
      p.r = (Math.random() - 0.5) * 1.2; p.vr = (Math.random() - 0.5) * 4;
      p.ph = Math.random() * TAU; p.vph = (Math.random() < 0.5 ? -1 : 1) * (5 + Math.random() * 7);
      p.life = 0; p.ttl = 1.6 + Math.random() * 0.9;
      p.row = PARTS[(Math.random() * PARTS.length) | 0];
      return;
    }
  }
  function burst(x, y, n, speed) {
    for (var i = 0; i < n; i++) { var a = -Math.PI / 2 + (Math.random() - 0.5) * Math.PI * 1.5, v = speed * (0.5 + Math.random() * 0.8); spawn(x, y, Math.cos(a) * v, Math.sin(a) * v - speed * 0.25, true); }
    kick();
  }

  /* ---- isaretci ---- */
  var mx = -1, my = -1, lx = -1, ly = -1, lt = 0, lastMove = 0, acc = 0, seen = false, overUi = false, chainA = 0;
  var tail = [];
  for (var t = 0; t < NB; t++) tail.push({ x: 0, y: 0, vx: 0, vy: 0, a: 0, ph: 0, vph: 0 });
  function onMove(e) {
    if (e.pointerType && e.pointerType !== 'mouse') return;
    var now = performance.now();
    if (lx >= 0) {
      var dt = Math.max(8, now - lt), dx = e.clientX - lx, dy = e.clientY - ly, sp = Math.sqrt(dx * dx + dy * dy) / dt * 16; // px / kare
      if (sp > 12 && !overUi) { acc += Math.min(2, (sp - 12) / 16); while (acc >= 1) { acc--; spawn(e.clientX, e.clientY, dx / dt * 4.5 * (0.3 + Math.random() * 0.7) + (Math.random() - 0.5) * 4, dy / dt * 4.5 * (0.3 + Math.random() * 0.7) - 3 - Math.random() * 4, false); } }
    }
    lx = mx = e.clientX; ly = my = e.clientY; lt = now; lastMove = now;
    if (!seen) { seen = true; for (var i = 0; i < tail.length; i++) { tail[i].x = mx; tail[i].y = my; } }
    kick();
  }
  if (FINE) {
    w.addEventListener('pointermove', onMove, { passive: true });
    d.documentElement.addEventListener('mouseleave', function () { lastMove = 0; kick(); });
    d.addEventListener('pointerover', function (e) { var o = !!(e.target && e.target.closest && e.target.closest('a,button,input,label,select,textarea,[role="tab"]')); if (o !== overUi) { overUi = o; kick(); } }, { passive: true });
    w.addEventListener('pointerdown', function (e) { if (e.pointerType === 'mouse' && e.button === 0 && !overUi) burst(e.clientX, e.clientY, 10, 9); }, { passive: true });
  }
  /* ---- dokunma: patlama; hizli kaydirma: yagmur ---- */
  w.addEventListener('pointerdown', function (e) { if (e.pointerType === 'touch' || e.pointerType === 'pen') burst(e.clientX, e.clientY, 12, 8); }, { passive: true });
  if (!FINE) {
    var sy = w.scrollY, st = performance.now(), rainAcc = 0;
    w.addEventListener('scroll', function () {
      var now = performance.now(), y = w.scrollY, dt = Math.max(8, now - st), v = Math.abs(y - sy) / dt * 16; sy = y; st = now;
      if (v > 18) { rainAcc += Math.min(1.2, (v - 18) / 34); while (rainAcc >= 1) { rainAcc--; spawn(20 + Math.random() * (W - 40), -30, (Math.random() - 0.5) * 1.5, 2 + Math.random() * 3, false); } kick(); }
    }, { passive: true });
  }

  /* ---- yay (ziplama): yari kapali Euler, alt adimli; 60 fps biriminde ---- */
  function spring(o, gx, gy, K, D, h) { o.vx += (gx - o.x) * K * h; o.vy += (gy - o.y) * K * h; var dm = Math.pow(1 - D, h); o.vx *= dm; o.vy *= dm; o.x += o.vx * h; o.y += o.vy * h; }

  /* ---- dongu: yalniz is varken ---- */
  var running = false, prev = 0;
  function kick() { if (!running && ready) { running = true; prev = 0; w.requestAnimationFrame(frame); } }
  function frame(now) {
    var dt = prev ? Math.min(0.05, (now - prev) / 1000) : 1 / 60; prev = now;
    var f = dt * 60, busy = false;
    ctx.setTransform(1, 0, 0, 1, 0, 0); ctx.clearRect(0, 0, cv.width, cv.height);
    if (NB && seen) {
      var since = now - lastMove;
      var active = lastMove && since < 6000 && !overUi;
      var idle = since > 300;                                  // durunca: ust uste dizil
      chainA += ((active ? 1 : 0) - chainA) * (1 - Math.pow(0.8, f));
      if (chainA > 0.01) {
        var n = Math.max(1, Math.ceil(f)), h = f / n, ax = mx + 34 + SZ * 0.3, ay = my + 6 + SZ * 0.4, cum = 0;
        for (var i = 0; i < NB; i++) {
          var T = tail[i], gx, gy;
          cum += GAP[i];
          for (var s = 0; s < n; s++) {
            if (idle) { if (YER) { gx = ax + YER[i][0] * SZ; gy = ay + YER[i][1] * SZ; } else { gx = ax; gy = ay + cum; } spring(T, gx, gy, 0.09 - i * 0.004, 0.17, h); }
            else { gx = i ? tail[i - 1].x : mx; gy = i ? tail[i - 1].y : my; spring(T, gx, gy, 0.34 - i * 0.03, 0.46, h); }
          }
          var mv = Math.sqrt(T.vx * T.vx + T.vy * T.vy);
          if (idle) {
            // duz otur: en yakin tam tura yayla don, egiklik sifira
            var tgt = Math.round(T.ph / TAU) * TAU; T.vph += (tgt - T.ph) * 0.08 * f; T.vph *= Math.pow(0.78, f); T.ph += T.vph * f;
            T.a += (0 - T.a) * (1 - Math.pow(0.85, f));
          } else {
            T.vph = mv * 0.03 * (i % 2 ? -1 : 1); T.ph += T.vph * f;
            if (mv > 0.4) { var ang = Math.atan2(T.vy, T.vx) + Math.PI / 2, da = ((ang - T.a) % TAU + TAU * 1.5) % TAU - Math.PI; T.a += da * (1 - Math.pow(0.86, f)); }
          }
          if (mv > 0.05 || Math.abs(T.vph) > 0.002 || (idle && Math.abs(T.a) > 0.005)) busy = true;
        }
        // cizim: alttaki once (alt ekmek), ustteki en son (ust ekmek)
        for (var jj = 0; jj < NB; jj++) { var j = idle && YER ? ORD[jj] : NB - 1 - jj; var Q = tail[j]; draw(STACK[j], Q.ph, Q.x, Q.y, idle ? SZ : SZ - j * 3 * PS, idle ? Q.a * 0.4 : Q.a, chainA); }
      }
      if (Math.abs((active ? 1 : 0) - chainA) > 0.01) busy = true;
    }
    if (live) {
      var G = 0.48 * f, DRAG = Math.pow(0.988, f);
      for (var k = 0; k < MAXP; k++) {
        var p = pool[k]; if (!p.on) continue;
        p.life += dt; if (p.life >= p.ttl || p.y > H + 90 || p.x < -90 || p.x > W + 90) { p.on = false; live--; continue; }
        p.vy += G; p.vx *= DRAG; p.vy *= DRAG; p.x += p.vx * f; p.y += p.vy * f; p.r += p.vr * dt; p.ph += p.vph * dt;
        if (!p.b && p.vy > 0 && p.y > H - p.s * 0.35) { p.b = 1; p.y = H - p.s * 0.35; p.vy *= -0.45; p.vx *= 0.7; p.vph *= 0.6; p.vr *= 0.5; }
        var q = p.life / p.ttl, al = q < 0.72 ? 1 : 1 - (q - 0.72) / 0.28, sc = q < 0.08 ? 0.45 + 0.55 * q / 0.08 : 1;
        draw(p.row, p.ph, p.x, p.y, p.s * sc, p.r, al);
      }
      busy = true;
    }
    ctx.globalAlpha = 1;
    if (busy) w.requestAnimationFrame(frame); else running = false;
  }
  // zincir bosta kalinca 6 sn sonra solsun diye tek zamanlayici (yalniz gorunurken)
  if (FINE) setInterval(function () { if (seen && chainA > 0.01 && !running && performance.now() - lastMove >= 6000) kick(); }, 1000);
  d.addEventListener('visibilitychange', function () { if (d.hidden) lastMove = 0; });
  w.__iz = { live: function () { return live; }, max: MAXP, running: function () { return running; } };
})();
