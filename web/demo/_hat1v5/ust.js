/* v5 ust katman (12 Kas 2026). Cerceve yok, derleme yok, kutuphane yok; sayfa JS olmadan da tam okunur.
   Yalniz bu dosyayi baglayan sayfada calisir (v5.js'e dokunmaz). Veri: <script type="application/json" id="r-ust"> (istege bagli).
   - Ilk ekran: arka plan katmani yavas yaklasir (CSS) ve kaydirmada yazidan yavas gider, baslik daha hizli; fareyle cok hafif derinlik.
     Isletmenin kendi videosu varsa (data-src) yalniz hareket serbest ve Save-Data kapaliyken yuklenir; poster her zaman kendi fotografidir.
   - Menu: sekmeler (klavye: sol/sag ok), yemek satirinin uzerine gelince ya da odaklaninca sabitlenen fotograf o yemege gecer (yalniz kendi fotografi
     olan yemekler); telefonda satira dokununca fotograf satirin altinda acilir.
   - Galeri seridi: masaustunde bolum gecerken yana akar; telefonda parmakla kaydirilir.
   - Maske belirmeleri, miknatis dugmeler, yumusak capa kaydirma.  Imlec izi ayri dosyadir (iz.js), bos zamanda ve yalniz izin varsa istenir.
   Azaltilmis harekette, ?capture=1 (still) ve Save-Data'da hareket kapali; menu ve galeri yine calisir. */
(function () {
  'use strict';
  var d = document, w = window, root = d.documentElement;
  var ME = (d.currentScript && d.currentScript.src) || '';
  var U = {}; try { U = JSON.parse((d.getElementById('r-ust') || {}).textContent || '{}'); } catch (e) { U = {}; }
  var mq = function (q) { return !!(w.matchMedia && w.matchMedia(q).matches); };
  var conn = navigator.connection || {};
  var SAVE = !!conn.saveData;
  var REDUCED = mq('(prefers-reduced-motion: reduce)');
  var STILL = root.classList.contains('still');
  var FINE = mq('(hover: hover) and (pointer: fine)');
  var motion = !REDUCED && !STILL && !SAVE;
  var clamp = function (x, a, b) { return x < a ? a : x > b ? b : x; };
  var each = function (sel, fn, ctx) { [].forEach.call((ctx || d).querySelectorAll(sel), fn); };
  if (motion) root.classList.add('ust-on');

  /* ---- kaydirma ve isaretci: tek rAF ---- */
  var hero = d.querySelector('.hero');
  var gal = d.querySelector('.gal'), galTrack = gal && gal.querySelector('.gal-track');
  var sahne = motion ? d.querySelector('.sahne') : null;
  if (sahne) sahne.classList.add('ust-sahne');
  var mxp = 0, myp = 0, mxT = 0, myT = 0, ticking = false;
  // olculer yalniz yeniden boyutlanmada okunur; kaydirmada DOM'dan olcu okunmaz (zorunlu yerlesim yok), yalniz transform/degisken yazilir
  var M = { hT: 0, hH: 1, sT: 0, sH: 1, gT: 0, gH: 1, galMax: 0, W: 0, H: 0, R: 0 };
  var sFoto = sahne && sahne.querySelector('.sahne-foto'), sImg = sFoto && sFoto.querySelector('img'), sHalka = sahne && sahne.querySelector('.sahne-halka');
  var sPin = sahne && sahne.querySelector('.sahne-pin'), sFx = 50, sFy = 50;
  if (sahne) { sFx = +(sahne.getAttribute('data-cx') || 50); sFy = +(sahne.getAttribute('data-cy') || 50); }
  var top0 = function (el) { var y = 0; while (el) { y += el.offsetTop; el = el.offsetParent; } return y; };
  function measure() {
    M.W = w.innerWidth; M.H = w.innerHeight; var tb = d.querySelector('.top'); M.top = tb ? tb.offsetHeight : 0;
    if (hero) { M.hT = top0(hero); M.hH = Math.max(1, hero.offsetHeight); }
    if (sahne) {
      M.sT = top0(sahne); M.sH = Math.max(1, sahne.offsetHeight);
      if (sFoto && sPin) {
        var pw = sPin.clientWidth, ph = sPin.clientHeight; M.R = Math.ceil(Math.sqrt(pw * pw + ph * ph) / 2) + 6; M.PW = pw; M.PH = ph;
        sFoto.style.width = sFoto.style.height = (M.R * 2) + 'px';
        if (sImg) { sImg.style.width = pw + 'px'; sImg.style.height = ph + 'px'; }
        M.rmin = Math.min(Math.min(pw, ph) * 0.3, 260);
        if (sHalka) sHalka.style.width = sHalka.style.height = ((M.rmin + 18) * 2) + 'px';
      }
    }
    if (gal) { M.gT = top0(gal); M.gH = Math.max(1, gal.offsetHeight); }
    M.galMax = galTrack && FINE && M.W >= 900 ? Math.max(0, galTrack.scrollWidth - M.W) : 0;
  }
  function frame() {
    ticking = false;
    var y = w.scrollY || w.pageYOffset || 0, vh = M.H, busy = false;
    if (hero && y < M.hT + M.hH) {
      hero.style.setProperty('--hp', clamp((y - M.hT) / M.hH, 0, 1).toFixed(4));
      mxp += (mxT - mxp) * .08; myp += (myT - myp) * .08;
      if (Math.abs(mxT - mxp) > .002 || Math.abs(myT - myp) > .002) busy = true;
      hero.style.setProperty('--mx', mxp.toFixed(4)); hero.style.setProperty('--my', myp.toFixed(4));
    }
    if (sahne && y + vh > M.sT && y < M.sT + M.sH) {
      // daire: dis kap yalniz olceklenir (k = r/R), icteki fotograf ters olcekle ekranda sabit kalir: yalniz bilesik transform, yeniden boyama yok
      var sp = clamp((y - M.sT) / Math.max(1, M.sH - vh), 0, 1);
      var gq = clamp(sp / 0.78, 0, 1), ge = gq * gq * (3 - 2 * gq);
      var W0 = M.PW || M.W, H0 = M.PH || vh, R = M.R || 1;
      var rmin = M.rmin || Math.min(Math.min(W0, H0) * 0.3, 260), r = rmin + (R - rmin) * ge, k = r / R;
      var fx = M.W >= 900 ? sFx : 50, fy = M.W >= 900 ? sFy : 50;
      // baslangic dairesi ust cubugun altinda ve ekranin icinde kalir
      var X0 = clamp(fx / 100 * W0, rmin + 12, W0 - rmin - 12), Y0 = clamp(fy / 100 * H0, (M.top || 0) + rmin + 12, H0 - rmin - 12);
      var X = X0 + (W0 / 2 - X0) * ge, Y = Y0 + (H0 / 2 - Y0) * ge, sc = 1.22 - 0.2 * ge;
      if (sFoto) sFoto.style.transform = 'translate3d(' + (X - R).toFixed(1) + 'px,' + (Y - R).toFixed(1) + 'px,0) scale(' + k.toFixed(5) + ')';
      if (sImg) sImg.style.transform = 'translate3d(' + ((W0 / 2 * (1 - sc) - X) / k + R).toFixed(2) + 'px,' + ((H0 / 2 * (1 - sc) - Y) / k + R).toFixed(2) + 'px,0) scale(' + (sc / k).toFixed(5) + ')';
      // ince halka: daire buyumeye baslayinca soner (sabit boyut, yalniz opaklik ve konum)
      if (sHalka) { var hr = rmin + 18; sHalka.style.transform = 'translate3d(' + (X0 - hr).toFixed(1) + 'px,' + (Y0 - hr).toFixed(1) + 'px,0) scale(' + (1 + ge * 0.6).toFixed(4) + ')'; sHalka.style.opacity = clamp(1 - ge * 4, 0, 1).toFixed(3); }
      sahne.classList.toggle('tam', sp > 0.8);
    }
    if (gal) {
      gal.classList.toggle('koyu', M.gT - y < vh * 0.5);
      if (galTrack && M.galMax && y + vh > M.gT && y < M.gT + M.gH) {
        var p = clamp((y + vh - M.gT) / (vh + M.gH), 0, 1), e = p * p * (3 - 2 * p);
        galTrack.style.setProperty('--gx', (-e * M.galMax).toFixed(1) + 'px');
        gal.style.setProperty('--gq', (e - .5).toFixed(3));
      }
    }
    if (busy) kick();
  }
  function kick() { if (!ticking) { ticking = true; w.requestAnimationFrame(frame); } }
  if (motion) {
    measure(); frame();
    // kaydirirken kahramanin yavas yakinlasmasi bekler (iki ayri hareket ayni karede bilesmez)
    var kayT = 0;
    w.addEventListener('scroll', function () { kick(); if (!kayT) root.classList.add('ust-kayiyor'); clearTimeout(kayT); kayT = setTimeout(function () { kayT = 0; root.classList.remove('ust-kayiyor'); }, 260); }, { passive: true });
    w.addEventListener('resize', function () { measure(); kick(); }, { passive: true });
    w.addEventListener('load', function () { measure(); kick(); });
    if ('ResizeObserver' in w) { var roT = 0; new ResizeObserver(function () { clearTimeout(roT); roT = setTimeout(function () { measure(); kick(); }, 120); }).observe(d.body); }
    if (FINE && hero) {
      hero.addEventListener('pointermove', function (e) {
        if (e.pointerType !== 'mouse') return;
        var r = hero.getBoundingClientRect();
        mxT = clamp((e.clientX - r.left) / r.width * 2 - 1, -1, 1); myT = clamp((e.clientY - r.top) / r.height * 2 - 1, -1, 1); kick();
      }, { passive: true });
      hero.addEventListener('pointerleave', function () { mxT = 0; myT = 0; kick(); });
    }
  }

  /* ---- kahraman ekran disindayken yavas yakinlasma durur (pil ve kare suresi) ---- */
  if (motion && hero && 'IntersectionObserver' in w) new IntersectionObserver(function (es) { es.forEach(function (e) { hero.classList.toggle('uzak', !e.isIntersecting); }); }).observe(hero);

  /* ---- kendi videosu: yalniz hareket serbestse; ekran disinda ve sekme gizliyken durur ---- */
  var vid = d.querySelector('.hero-vid[data-src]');
  if (vid && motion && !(w.innerWidth < 900 && vid.hasAttribute('data-masaustu'))) {
    var start = function () {
      vid.muted = true; vid.setAttribute('muted', ''); vid.playsInline = true;
      vid.src = vid.getAttribute('data-src');
      vid.addEventListener('playing', function () { vid.classList.add('on'); }, { once: true });
      var pr = vid.play(); if (pr && pr.catch) pr.catch(function () { /* otomatik oynatma reddi: poster kalir */ });
      if ('IntersectionObserver' in w) new IntersectionObserver(function (es) { es.forEach(function (x) { if (x.isIntersecting) { if (!d.hidden) { var q = vid.play(); if (q && q.catch) q.catch(function () {}); } } else vid.pause(); }); }).observe(vid);
      d.addEventListener('visibilitychange', function () { if (d.hidden) vid.pause(); else { var q = vid.play(); if (q && q.catch) q.catch(function () {}); } });
    };
    if (d.readyState === 'complete') setTimeout(start, 300); else w.addEventListener('load', function () { setTimeout(start, 300); });
  }

  /* ---- menu ---- */
  var mx = d.querySelector('.mx');
  if (mx) {
    var figs = {}; each('.mx-fig', function (f) { figs[f.getAttribute('data-k')] = f; }, mx);
    var tabs = [].slice.call(mx.querySelectorAll('.mx-tab')), panels = [].slice.call(mx.querySelectorAll('.mx-panel'));
    var cur = null, base = null, swapT = 0;
    var load = function (f) { if (f) [].forEach.call(f.querySelectorAll('img[data-src]'), function (im) { if (im.getAttribute('data-srcset')) im.srcset = im.getAttribute('data-srcset'); im.src = im.getAttribute('data-src'); im.removeAttribute('data-src'); }); };
    var show = function (k) {
      var f = figs[k] || figs[base] || figs['0']; if (!f || f === cur) return;
      load(f);
      var go = function () {
        each('.mx-fig.was', function (x) { x.classList.remove('was'); }, mx);
        if (cur) { cur.classList.remove('on'); cur.classList.add('was'); }
        f.classList.add('on'); cur = f;
      };
      var im = f.querySelector('img:not(.mx-bg)');
      clearTimeout(swapT);
      if (im && !im.complete) { im.addEventListener('load', go, { once: true }); swapT = setTimeout(go, 700); } else go();
    };
    cur = mx.querySelector('.mx-fig.on');
    var pick = function (i, user) {
      tabs.forEach(function (t, j) { t.setAttribute('aria-selected', j === i ? 'true' : 'false'); t.tabIndex = j === i ? 0 : -1; });
      panels.forEach(function (p, j) { p.hidden = j !== i; });
      var t = tabs[i]; if (!t) return;
      base = t.getAttribute('data-k') || '0';
      if (user) { show(base); if (t.scrollIntoView && t.parentNode.scrollWidth > t.parentNode.clientWidth) t.scrollIntoView({ block: 'nearest', inline: 'center', behavior: motion ? 'smooth' : 'auto' }); }
      // bu sekmedeki yemek fotograflarini onceden iste (yalniz bu sekme)
      if (panels[i]) each('.mx-dish[data-k]', function (li) { var f = figs[li.getAttribute('data-k')]; if (f && user) load(f); }, panels[i]);
    };
    tabs.forEach(function (t, i) {
      t.addEventListener('click', function () { pick(i, true); });
      t.addEventListener('keydown', function (e) {
        if (e.key === 'ArrowRight' || e.key === 'ArrowLeft') { var j = (i + (e.key === 'ArrowRight' ? 1 : tabs.length - 1)) % tabs.length; pick(j, true); tabs[j].focus(); e.preventDefault(); }
      });
    });
    if (tabs.length) pick(0, false);
    var wide = function () { return w.innerWidth >= 900; };
    each('.mx-dish[data-k]', function (li) {
      var k = li.getAttribute('data-k'), hit = li.querySelector('.mx-hit');
      li.addEventListener('pointerenter', function (e) { if (e.pointerType === 'mouse' && wide()) { li.classList.add('on'); show(k); } });
      li.addEventListener('pointerleave', function (e) { if (e.pointerType === 'mouse' && wide()) { li.classList.remove('on'); } });
      li.addEventListener('focusin', function () { if (wide()) show(k); });
      // satirdaki gorunmez dugme (klavye: Enter/Bosluk) tiklamayi buraya iletir
      li.addEventListener('click', function (e) {
        if (e.target.closest && e.target.closest('a')) return;
        if (wide()) { show(k); return; }
        var open = !li.classList.contains('open');
        li.classList.toggle('open', open); if (hit) hit.setAttribute('aria-expanded', open ? 'true' : 'false');
        var big = li.querySelector('.mx-big img[data-src]'); if (open && big) { big.src = big.getAttribute('data-src'); big.removeAttribute('data-src'); }
      });
    });
    // fare menuden cikinca sekmenin kendi fotografina don
    var list = mx.querySelector('.mx-body');
    if (list) list.addEventListener('pointerleave', function (e) { if (e.pointerType === 'mouse' && wide()) show(base); });
  }

  /* ---- yemek kaydiricisi: oklar, fareyle surukleme (dokunmada tarayicinin kendi kaydirmasi), uclarda ok soner ---- */
  each('.kd', function (kd) {
    var list = kd.querySelector('.kd-list'); if (!list) return;
    var prev = kd.querySelector('.kd-btn[data-yon="-1"]'), next = kd.querySelector('.kd-btn[data-yon="1"]');
    var step = function () { var c = list.querySelector('.kd-card'); return c ? c.getBoundingClientRect().width + parseFloat(getComputedStyle(list).columnGap || 16) : 300; };
    var upd = function () { if (prev) prev.disabled = list.scrollLeft < 8; if (next) next.disabled = list.scrollLeft > list.scrollWidth - list.clientWidth - 8; };
    [prev, next].forEach(function (b) { if (b) b.addEventListener('click', function () { list.scrollBy({ left: step() * +b.getAttribute('data-yon'), behavior: motion ? 'smooth' : 'auto' }); }); });
    list.addEventListener('scroll', function () { w.requestAnimationFrame(upd); }, { passive: true });
    upd(); w.addEventListener('resize', upd, { passive: true });
    var down = false, sx = 0, s0 = 0, moved = 0;
    list.addEventListener('pointerdown', function (e) { if (e.pointerType !== 'mouse' || e.button !== 0) return; down = true; moved = 0; sx = e.clientX; s0 = list.scrollLeft; });
    w.addEventListener('pointermove', function (e) { if (!down) return; var dx = e.clientX - sx; if (Math.abs(dx) > 4) list.classList.add('surukle'); moved = Math.max(moved, Math.abs(dx)); list.scrollLeft = s0 - dx; });
    w.addEventListener('pointerup', function () { if (!down) return; down = false; list.classList.remove('surukle'); if (moved > 4) { var st = step(); list.scrollTo({ left: Math.round(list.scrollLeft / st) * st, behavior: motion ? 'smooth' : 'auto' }); } });
    list.addEventListener('click', function (e) { if (moved > 6) { e.preventDefault(); e.stopPropagation(); } }, true);
    list.addEventListener('dragstart', function (e) { e.preventDefault(); });
  });

  /* ---- belirmeler: galeri, kaydirici (v5.js .rv'yi zaten izler) ---- */
  if ('IntersectionObserver' in w && motion) {
    var io = new IntersectionObserver(function (es) { es.forEach(function (e) { if (e.isIntersecting) { e.target.classList.add('in'); io.unobserve(e.target); } }); }, { rootMargin: '0px 0px -12% 0px', threshold: 0.05 });
    if (gal) io.observe(gal);
    each('.kd', function (k) { io.observe(k); });
  } else { if (gal) gal.classList.add('in'); each('.kd', function (k) { k.classList.add('in'); }); }

  /* ---- miknatis dugmeler (yalniz ince isaretci) ---- */
  if (motion && FINE) {
    each('.hero .btn-accent, .contact-cta .btn-accent, .top .btn-accent, .mx-body .btn, [data-mag]', function (b) {
      b.classList.add('ust-mag');
      var R = 0;
      b.addEventListener('pointermove', function (e) {
        if (e.pointerType !== 'mouse') return;
        var r = b.getBoundingClientRect(); R = R || Math.max(r.width, r.height);
        var dx = e.clientX - (r.left + r.width / 2), dy = e.clientY - (r.top + r.height / 2);
        b.classList.add('near');
        b.style.setProperty('--bx', clamp(dx * .28, -14, 14).toFixed(1) + 'px'); b.style.setProperty('--by', clamp(dy * .34, -10, 10).toFixed(1) + 'px');
      });
      b.addEventListener('pointerleave', function () { b.classList.remove('near'); b.style.removeProperty('--bx'); b.style.removeProperty('--by'); });
    });
  }

  /* ---- yumusak capa kaydirma: ust cubuk payi, azaltilmis harekette aninda ---- */
  d.addEventListener('click', function (e) {
    var a = e.target.closest && e.target.closest('a[href^="#"]'); if (!a) return;
    var id = a.getAttribute('href').slice(1); var t = id ? d.getElementById(id) : null;
    if (!t || e.defaultPrevented || e.metaKey || e.ctrlKey || e.shiftKey || e.button) return;
    e.preventDefault();
    var head = parseFloat(getComputedStyle(root).scrollPaddingTop) || 0;
    var y0 = w.scrollY, y1 = Math.max(0, t.getBoundingClientRect().top + y0 - head);
    var done = function () { if (history.replaceState) history.replaceState(null, '', '#' + id); if (t.tabIndex < 0 && !/^(A|BUTTON|INPUT|SELECT|TEXTAREA)$/.test(t.tagName)) t.setAttribute('tabindex', '-1'); try { t.focus({ preventScroll: true }); } catch (x) {} };
    if (!motion) { w.scrollTo(0, y1); done(); return; }
    var dist = y1 - y0, dur = clamp(Math.abs(dist) * .45, 520, 1150), t0 = performance.now();
    root.style.scrollBehavior = 'auto';
    var step = function (now) {
      var q = clamp((now - t0) / dur, 0, 1), k = q < .5 ? 4 * q * q * q : 1 - Math.pow(-2 * q + 2, 3) / 2;
      w.scrollTo(0, y0 + dist * k);
      if (q < 1) w.requestAnimationFrame(step); else { root.style.scrollBehavior = ''; done(); }
    };
    w.requestAnimationFrame(step);
  });

  /* ---- imlec izi (iz.js): sayfada kesim listesi varsa, yalniz izin varsa, bos zamanda ---- */
  function wantIz() {
    if (!motion || !U.iz || !U.iz.src || !ME || /[?&]nofx=1/.test(location.search)) return false;
    if (navigator.deviceMemory && navigator.deviceMemory < 2) return false;
    return true;
  }
  function loadIz() { if (!wantIz()) return; var s = d.createElement('script'); s.src = ME.replace(/\/[^\/?#]+(\?[^#]*)?$/, '/iz.js$1'); s.async = true; d.head.appendChild(s); }
  var idle = function () { (w.requestIdleCallback || function (f) { return setTimeout(f, 250); })(loadIz, { timeout: 1800 }); };
  if (d.readyState === 'complete') idle(); else w.addEventListener('load', idle);
})();
