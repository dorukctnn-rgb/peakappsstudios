/* ust-kat.js: KATEGORI UST KATMANI (12 Kas 2026).  Sablonun kendi betiginden (pizza.js, pastane.js) SONRA yuklenir ve onun isini tekrar etmez.
   Veri: <script id="ust-data" type="application/json"> { hx: n, foto: [{ n, src, srcset, w, h, alt }], fotoEtiket }
   - Kahraman gecisi: ayni cercevede isletmenin kendi kareleri sirayla, yuvarlak maske; sekme gizliyken ve kahraman gorunmezken durur.
   - Pastane kaydiricisi: oklar ve klavye (farede surukleme pastane.js'de).
   - Menude urun fotografi: farede imlecin yaninda belirir (imlec izi o satirda solar: data-iz-yok); dokunmatikte "Fotograf" dugmesiyle satirda acilir.
   Azaltilmis hareket, "still" (ekran goruntusu) ve Veri Tasarrufu: gecis yok; fotograf dugmesi kalir. */
(function () {
  'use strict';
  var d = document, w = window, root = d.documentElement;
  var mm = function (q) { return !!(w.matchMedia && w.matchMedia(q).matches); };
  var still = root.classList.contains('still'), reduced = mm('(prefers-reduced-motion: reduce)');
  var saveData = !!(navigator.connection && navigator.connection.saveData);
  var V = {}; try { V = JSON.parse((d.getElementById('ust-data') || {}).textContent || '{}'); } catch (e) { V = {}; }
  var raf = w.requestAnimationFrame.bind(w);

  /* ---- 1) kahraman gecisi ---- */
  var kap = d.querySelector('[data-hx]');
  if (kap && !still && !reduced && !saveData) {
    var hx = [].slice.call(kap.querySelectorAll('.hx')), k = 0, gor = true;
    if ('IntersectionObserver' in w) new IntersectionObserver(function (es) { gor = es[0].isIntersecting; }).observe(kap);
    var hazir = function (im) { return im.complete && im.naturalWidth > 0; };
    var ilerle = function () {
      if (d.hidden || !gor || !hx.length) return;
      if (k < hx.length) {
        var yeni = hx[k]; if (!hazir(yeni)) return;
        hx.forEach(function (im, i) { im.classList.toggle('alt', i === k - 1); if (i !== k) im.classList.remove('on'); });
        yeni.classList.add('on'); k++;
      } else {
        // son kareden kahramanin kendi karesine: son kare ustte kalir, maske kapanir
        hx.forEach(function (im, i) { im.classList.remove('alt'); if (i !== hx.length - 1) im.classList.remove('on'); });
        raf(function () { hx[hx.length - 1].classList.remove('on'); }); k = 0;
      }
    };
    setTimeout(function () { ilerle(); setInterval(ilerle, 3800); }, 3200);
  }

  /* ---- 2) pastane kaydiricisi: oklar ve klavye ---- */
  var sl = d.getElementById('slides'), ok = d.querySelector('.ust-ok');
  if (sl && ok) {
    var btns = [].slice.call(ok.querySelectorAll('.ust-btn'));
    var adim = function () { var c = sl.querySelector('.slide'); var g = parseFloat(getComputedStyle(sl).columnGap) || 16; return c ? c.getBoundingClientRect().width + g : 300; };
    var git = function (y) { sl.style.scrollSnapType = ''; sl.scrollBy({ left: adim() * y, behavior: reduced ? 'auto' : 'smooth' }); };
    btns.forEach(function (b) { b.addEventListener('click', function () { git(+b.getAttribute('data-yon') || 1); }); });
    if (!sl.hasAttribute('tabindex')) sl.setAttribute('tabindex', '0');
    sl.addEventListener('keydown', function (e) { if (e.key === 'ArrowRight' || e.key === 'ArrowLeft') { git(e.key === 'ArrowRight' ? 1 : -1); e.preventDefault(); } });
    var uc = function () { var max = sl.scrollWidth - sl.clientWidth - 2; if (btns[0]) btns[0].disabled = sl.scrollLeft <= 2; if (btns[1]) btns[1].disabled = sl.scrollLeft >= max; ok.hidden = max <= 0; };
    sl.addEventListener('scroll', uc, { passive: true }); w.addEventListener('resize', uc, { passive: true }); uc();
  }

  /* ---- 3) menude urun fotografi ---- */
  var foto = V.foto || [];
  if (foto.length) {
    var norm = function (s) { return String(s || '').toLocaleLowerCase(root.lang || 'en').replace(/\s+/g, ' ').trim(); };
    var byN = {}; foto.forEach(function (f) { byN[norm(f.n)] = f; });
    var FINE = mm('(hover: hover) and (pointer: fine)') && !reduced;
    var pop = null, pim = null, px = -999, py = -999, tx = -999, ty = -999, pcal = false, acik = false, ph = 240;
    var izle = function () { px += (tx - px) * 0.22; py += (ty - py) * 0.22; pop.style.transform = 'translate3d(' + px.toFixed(1) + 'px,' + py.toFixed(1) + 'px,0) scale(' + (acik ? 1 : 0.6) + ') rotate(' + (acik ? -3 : -6) + 'deg)'; if (acik || Math.abs(tx - px) > 0.5) raf(izle); else pcal = false; };
    var hedef = function (e) { tx = e.clientX + 28; ty = e.clientY - ph - 18; if (ty < 8) ty = e.clientY + 26; if (tx > w.innerWidth - 260) tx = e.clientX - 268; };
    [].forEach.call(d.querySelectorAll('.mi'), function (li) {
      var n = li.querySelector('.mi-n'); if (!n) return; var f = byN[norm(n.textContent)]; if (!f) return;
      li.classList.add('ust-f');
      // gosterilen en cok 240 css px; dosya bunun en az 2 kati (srcset, sizes 480px)
      var gw = Math.min(240, Math.floor(f.w / 2)), gh = Math.round(gw * f.h / f.w);
      if (FINE) {
        li.setAttribute('data-iz-yok', '');
        li.addEventListener('pointerenter', function (e) {
          if (!pop) { pop = d.createElement('div'); pop.className = 'ust-pop'; pop.setAttribute('aria-hidden', 'true'); pim = d.createElement('img'); pim.alt = ''; pim.decoding = 'async'; pop.appendChild(pim); d.body.appendChild(pop); }
          if (pim.getAttribute('data-n') !== f.n) { pim.setAttribute('data-n', f.n); pim.width = f.w; pim.height = f.h; pim.sizes = (gw * 2) + 'px'; pim.srcset = f.srcset || ''; pim.src = f.src; pop.style.width = (gw + 10) + 'px'; ph = gh + 10; }
          hedef(e); if (px < -900) { px = tx; py = ty; } acik = true; pop.classList.add('on'); if (!pcal) { pcal = true; raf(izle); }
        });
        li.addEventListener('pointermove', hedef, { passive: true });
        li.addEventListener('pointerleave', function () { acik = false; if (pop) pop.classList.remove('on'); });
      } else {
        var b = d.createElement('button'); b.type = 'button'; b.className = 'ust-dokun'; b.textContent = V.fotoEtiket || 'Photo'; b.setAttribute('aria-expanded', 'false');
        li.appendChild(b);
        b.addEventListener('click', function () {
          var ac = li.querySelector('.ust-ac');
          if (!ac) { ac = d.createElement('div'); ac.className = 'ust-ac'; ac.style.maxWidth = gw + 'px'; var im = d.createElement('img'); im.alt = f.alt || n.textContent; im.decoding = 'async'; im.width = f.w; im.height = f.h; im.sizes = (gw * 2) + 'px'; im.srcset = f.srcset || ''; im.src = f.src; ac.appendChild(im); li.insertBefore(ac, b); }
          var o = li.classList.toggle('ust-acik'); b.setAttribute('aria-expanded', o ? 'true' : 'false');
        });
      }
    });
  }
})();
