/* sokak.js: SOKAK LEZZETI katmani (12 Kas 2026).  burger.js'den SONRA yuklenir; burger.js'in isini (saat, sekmeler, ust cubuk, bant, imlec) TEKRAR ETMEZ.
   - Poster basligi: isletmenin kendi fontu burgerin dar basligindan farkli genislikte; masaustunde iki satir ekran genisligine oturtulur, telefonda en uzun sozcuk sigar.
   - Kahraman fotograf gecisi: ayni cercevede kendi kareleri sirayla, yuvarlak maske (CSS gecisi); sekme gizliyken ve kahraman gorunmezken durur.
   - Urun seridi: dokunmatikte dogal kaydirma; farede surukle-birak, oklar ve klavye.
   - Menude urun fotografi: farede imlecin yaninda belirir (imlec izi o satirda solar: data-iz-yok); dokunmatikte "Fotograf" dugmesiyle satirda acilir.
   Azaltilmis hareket, "still" (ekran goruntusu) ve Veri Tasarrufu: gecis ve akis yok, fotograf dugmesi kalir. */
(function () {
  'use strict';
  var d = document, w = window, root = d.documentElement;
  var mm = function (q) { return !!(w.matchMedia && w.matchMedia(q).matches); };
  var still = root.classList.contains('still'), reduced = mm('(prefers-reduced-motion: reduce)');
  var saveData = !!(navigator.connection && navigator.connection.saveData);
  var hareket = !still && !reduced;
  var data = {}; try { data = JSON.parse((d.getElementById('r-data') || {}).textContent || '{}'); } catch (e) { data = {}; }
  var V = data.sokak || {};
  var raf = w.requestAnimationFrame.bind(w);

  /* ---- 1) poster basligi satira oturur ---- */
  var h1 = d.querySelector('.hero .h1');
  function fit() {
    if (!h1) return;
    var l1 = h1.querySelector('.l1'), l2 = h1.querySelector('.l2'), ls = [l1, l2].filter(Boolean);
    ls.forEach(function (el) { el.style.fontSize = ''; });
    var W = h1.clientWidth; if (!W) return;
    if (mm('(min-width: 900px)')) {
      [[l1, 0.21], [l2, 0.17]].forEach(function (p) {
        var el = p[0]; if (!el) return; var fs = parseFloat(getComputedStyle(el).fontSize), sw = el.scrollWidth; if (!sw || !fs) return;
        el.style.fontSize = Math.min(fs * (W * 0.985) / sw, w.innerHeight * p[1]).toFixed(1) + 'px';
      });
    } else {
      var max = 0; [].forEach.call(h1.querySelectorAll('.w'), function (x) { max = Math.max(max, x.getBoundingClientRect().width); });
      if (max > W) ls.forEach(function (el) { el.style.fontSize = (parseFloat(getComputedStyle(el).fontSize) * W / max * 0.97).toFixed(1) + 'px'; });
    }
    // altbilgideki dev dis cizgili yazi da genislige oturur (tahmin isletmenin fontuna gore sapabilir)
    var fb = d.querySelector('.foot-big');
    if (fb) { fb.style.fontSize = ''; var rg = d.createRange(); rg.selectNodeContents(fb); var fsw = rg.getBoundingClientRect().width, fw = fb.clientWidth, ffs = parseFloat(getComputedStyle(fb).fontSize); if (fw && fsw && ffs) fb.style.fontSize = (ffs * fw * 0.97 / fsw).toFixed(1) + 'px'; }
  }
  fit();
  if (d.fonts && d.fonts.ready) d.fonts.ready.then(fit);
  var rt = 0; w.addEventListener('resize', function () { clearTimeout(rt); rt = setTimeout(fit, 140); }, { passive: true });

  /* ---- 2) kahraman fotograf gecisi ---- */
  var blob = d.querySelector('.blob[data-hx]');
  if (blob && hareket && !saveData) {
    var hx = [].slice.call(blob.querySelectorAll('.hx')), k = 0, gor = true, son = 0;
    if ('IntersectionObserver' in w) new IntersectionObserver(function (es) { gor = es[0].isIntersecting; }).observe(blob);
    var hazir = function (im) { return im.complete && im.naturalWidth > 0; };
    var ilerle = function () {
      if (d.hidden || !gor) return;
      if (k < hx.length) {
        var yeni = hx[k]; if (!hazir(yeni)) return;
        hx.forEach(function (im, i) { im.classList.toggle('alt', i === k - 1); if (i !== k) im.classList.remove('on'); });
        yeni.classList.add('on'); k++;
      } else {
        hx.forEach(function (im, i) { im.classList.remove('alt'); if (i !== hx.length - 1) im.classList.remove('on'); });
        raf(function () { hx[hx.length - 1].classList.remove('on'); }); k = 0;
      }
    };
    setTimeout(function () { ilerle(); setInterval(ilerle, 3600); }, 3000);
  }

  /* ---- 3) urun seridi ---- */
  var ray = d.querySelector('.sk-ray');
  if (ray) {
    var adim = function () { var c = ray.querySelector('.sk-kart'); var g = parseFloat(getComputedStyle(ray).columnGap) || 18; return c ? c.getBoundingClientRect().width + g : 300; };
    var btns = [].slice.call(d.querySelectorAll('.sk-btn'));
    var git = function (dx) { ray.scrollBy({ left: dx, behavior: reduced ? 'auto' : 'smooth' }); };
    btns.forEach(function (b) { b.addEventListener('click', function () { git(adim() * (+b.getAttribute('data-yon') || 1)); }); });
    ray.addEventListener('keydown', function (e) { if (e.key === 'ArrowRight' || e.key === 'ArrowLeft') { git(adim() * (e.key === 'ArrowRight' ? 1 : -1)); e.preventDefault(); } });
    var uc = function () { var max = ray.scrollWidth - ray.clientWidth - 2; if (btns[0]) btns[0].disabled = ray.scrollLeft <= 2; if (btns[1]) btns[1].disabled = ray.scrollLeft >= max; };
    ray.addEventListener('scroll', uc, { passive: true }); w.addEventListener('resize', uc, { passive: true }); uc();
    var basili = false, sx = 0, sl = 0, oynadi = 0;
    ray.addEventListener('pointerdown', function (e) { if (e.pointerType !== 'mouse' || e.button !== 0) return; basili = true; sx = e.clientX; sl = ray.scrollLeft; oynadi = 0; });
    w.addEventListener('pointermove', function (e) { if (!basili) return; var dx = e.clientX - sx; oynadi = Math.max(oynadi, Math.abs(dx)); if (oynadi > 5) { ray.classList.add('surukle'); ray.scrollLeft = sl - dx; } }, { passive: true });
    w.addEventListener('pointerup', function () {
      if (!basili) return; basili = false;
      if (ray.classList.contains('surukle')) { ray.classList.remove('surukle'); var s = adim(); ray.scrollTo({ left: Math.round(ray.scrollLeft / s) * s, behavior: reduced ? 'auto' : 'smooth' }); }
    });
    ray.addEventListener('dragstart', function (e) { e.preventDefault(); });
  }

  /* ---- 5) menude urun fotografi ---- */
  var foto = V.foto || [];
  if (foto.length) {
    var norm = function (s) { return String(s || '').toLocaleLowerCase('tr').replace(/\s+/g, ' ').trim(); };
    var byN = {}; foto.forEach(function (f) { byN[norm(f.n)] = f; });
    var FINE = mm('(hover: hover) and (pointer: fine)') && !reduced;
    var pop = null, pim = null, px = -999, py = -999, tx = -999, ty = -999, pcal = false, acik = false;
    var izle = function () { px += (tx - px) * 0.22; py += (ty - py) * 0.22; pop.style.transform = 'translate3d(' + px.toFixed(1) + 'px,' + py.toFixed(1) + 'px,0) scale(' + (acik ? 1 : 0.6) + ') rotate(' + (acik ? -4 : -8) + 'deg)'; if (acik || Math.abs(tx - px) > 0.5) raf(izle); else pcal = false; };
    var hedef = function (e) { tx = e.clientX + 26; ty = e.clientY - 200; if (ty < 8) ty = e.clientY + 24; if (tx > w.innerWidth - 240) tx = e.clientX - 256; };
    [].forEach.call(d.querySelectorAll('.mi'), function (li) {
      var n = li.querySelector('.mi-n'); if (!n) return; var f = byN[norm(n.textContent)]; if (!f) return;
      li.classList.add('sk-f');
      if (FINE) {
        li.setAttribute('data-iz-yok', '');
        li.addEventListener('pointerenter', function (e) {
          if (!pop) { pop = d.createElement('div'); pop.className = 'sk-pop'; pop.setAttribute('aria-hidden', 'true'); pim = d.createElement('img'); pim.alt = ''; pim.decoding = 'async'; pop.appendChild(pim); d.body.appendChild(pop); }
          if (pim.getAttribute('data-n') !== f.n) { var pw = Math.min(230, Math.floor(f.w / 2)); pim.setAttribute('data-n', f.n); pim.srcset = f.srcset; pim.sizes = (pw * 2) + 'px'; pim.src = f.src; pop.style.width = pop.style.height = pw + 'px'; }
          hedef(e); if (px < -900) { px = tx; py = ty; } acik = true; pop.classList.add('on'); if (!pcal) { pcal = true; raf(izle); }
        });
        li.addEventListener('pointermove', hedef, { passive: true });
        li.addEventListener('pointerleave', function () { acik = false; if (pop) pop.classList.remove('on'); });
      } else {
        var b = d.createElement('button'); b.type = 'button'; b.className = 'sk-dokun'; b.textContent = V.fotoEtiket || 'Photo'; b.setAttribute('aria-expanded', 'false');
        li.appendChild(b);
        b.addEventListener('click', function () {
          var ac = li.querySelector('.sk-ac');
          if (!ac) { ac = d.createElement('div'); ac.className = 'sk-ac'; var im = d.createElement('img'); im.alt = n.textContent; im.decoding = 'async'; im.width = f.w; im.height = f.h; im.sizes = (Math.min(240, Math.floor(f.w / 2)) * 2) + 'px'; im.style.maxWidth = Math.floor(f.w / 2) + 'px'; im.srcset = f.srcset; im.src = f.src; ac.appendChild(im); li.insertBefore(ac, b); }
          var o = li.classList.toggle('sk-acik'); b.setAttribute('aria-expanded', o ? 'true' : 'false');
        });
      }
    });
  }
  /* ---- 6) isletmenin kendi kapali gunleri (or. her ayin 1'i ve 15'i): durum ve bugunku saat "bugun kapali" olur ---- */
  var K = V.kapali;
  if (K && K.gunler && K.gunler.length && data.tz) {
    var bugunKapali = function () { try { var g = +new Intl.DateTimeFormat('en-GB', { timeZone: data.tz, day: 'numeric' }).format(new Date()); return K.gunler.indexOf(g) >= 0; } catch (e) { return false; } };
    var boya = function () {
      if (!bugunKapali()) return;
      [].forEach.call(d.querySelectorAll('[data-status]'), function (el) { el.removeAttribute('data-empty'); el.classList.remove('open'); var b = el.querySelector('b'); if (b) b.textContent = K.metin; });
      [].forEach.call(d.querySelectorAll('[data-today]'), function (el) { el.textContent = K.metin; });
    };
    boya(); setInterval(boya, 60000); // burger.js durumu dakikada bir boyar; bu zamanlayici ondan hemen sonra calisir
  }
  w.__sokak = { fit: fit };
})();
