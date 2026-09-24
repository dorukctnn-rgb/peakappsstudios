/* Peak Apps Studio: motion layer.
   Vanilla JS, transforms and opacity only. Everything degrades to a static page. */
(() => {
  const root = document.documentElement;
  const reduce = matchMedia('(prefers-reduced-motion: reduce)').matches;
  const finePointer = matchMedia('(pointer: fine)').matches;
  const saveData = !!(navigator.connection && navigator.connection.saveData);

  /* Nav background after the first bit of scroll. */
  const nav = document.querySelector('[data-nav]');
  const onNav = () => nav && nav.setAttribute('data-scrolled', scrollY > 24 ? 'true' : 'false');
  addEventListener('scroll', onNav, { passive: true });
  onNav();

  /* Masked image reveals. */
  const reveals = document.querySelectorAll('.reveal-img');
  if (reduce || !('IntersectionObserver' in window)) {
    reveals.forEach(el => el.classList.add('in'));
  } else {
    const io = new IntersectionObserver(entries => {
      entries.forEach(e => { if (e.isIntersecting) { e.target.classList.add('in'); io.unobserve(e.target); } });
    }, { rootMargin: '0px 0px -12% 0px', threshold: 0.08 });
    reveals.forEach(el => io.observe(el));
  }

  /* Manifesto: words light up as the paragraph passes through the viewport. */
  const manifesto = document.querySelector('[data-words]');
  let words = [];
  if (manifesto) {
    const text = manifesto.textContent.trim().split(/\s+/);
    manifesto.innerHTML = text.map(w => `<span class="w">${w}</span>`).join(' ');
    words = [...manifesto.querySelectorAll('.w')];
    if (reduce) words.forEach(w => w.classList.add('on'));
  }
  const updateWords = () => {
    if (!words.length || reduce) return;
    const r = manifesto.getBoundingClientRect();
    const vh = innerHeight;
    const t = Math.min(1, Math.max(0, (vh * 0.85 - r.top) / (r.height + vh * 0.35)));
    const lit = Math.round(t * words.length);
    for (let i = 0; i < words.length; i++) words[i].classList.toggle('on', i < lit);
  };

  /* Hero: pointer depth, light, and scroll handoff. */
  const hero = document.querySelector('[data-hero]');
  let heroVisible = true;
  let target = { x: 0, y: 0, lx: 62, ly: 38 };
  let cur = { x: 0, y: 0, lx: 62, ly: 38, p: 0 };
  let raf = 0;

  if (hero && !reduce) {
    if (finePointer) {
      hero.addEventListener('pointermove', e => {
        const r = hero.getBoundingClientRect();
        const nx = (e.clientX - r.left) / r.width;
        const ny = (e.clientY - r.top) / r.height;
        target.x = nx * 2 - 1;
        target.y = ny * 2 - 1;
        target.lx = 40 + nx * 40;
        target.ly = 20 + ny * 36;
        kick();
      });
      hero.addEventListener('pointerleave', () => { target = { x: 0, y: 0, lx: 62, ly: 38 }; kick(); });
    }
    new IntersectionObserver(([e]) => { heroVisible = e.isIntersecting; if (heroVisible) kick(); }).observe(hero);
  }

  function frame() {
    raf = 0;
    const p = hero ? Math.min(1, Math.max(0, scrollY / (hero.offsetHeight * 0.9))) : 0;
    const k = 0.075; // easing factor: slow, heavy, deliberate
    cur.x += (target.x - cur.x) * k;
    cur.y += (target.y - cur.y) * k;
    cur.lx += (target.lx - cur.lx) * k;
    cur.ly += (target.ly - cur.ly) * k;
    cur.p += (p - cur.p) * 0.18;
    if (hero && heroVisible) {
      const s = hero.style;
      s.setProperty('--mx', cur.x.toFixed(4));
      s.setProperty('--my', cur.y.toFixed(4));
      s.setProperty('--lx', cur.lx.toFixed(2) + '%');
      s.setProperty('--ly', cur.ly.toFixed(2) + '%');
      s.setProperty('--p', cur.p.toFixed(4));
    }
    updateWords();
    const settling = Math.abs(target.x - cur.x) + Math.abs(target.y - cur.y) + Math.abs(p - cur.p) > 0.001;
    if (settling) kick();
  }
  function kick() { if (!raf) raf = requestAnimationFrame(frame); }
  addEventListener('scroll', kick, { passive: true });
  addEventListener('resize', kick, { passive: true });
  kick();

  /* Optional video layers (see MEDIA-GENERATION-BRIEF.md).
     A [data-video] slot with data-video-enabled="true" upgrades to a muted loop if <base>.mp4 exists,
     on larger screens, without Save-Data or reduced motion, after the page is idle.
     Without the files the page is unchanged. */
  const lowPower = (navigator.hardwareConcurrency || 8) <= 4 || (navigator.deviceMemory || 8) <= 4;
  const slots = document.querySelectorAll('[data-video][data-video-enabled="true"]');
  if (slots.length && !reduce && !saveData && !lowPower && innerWidth >= 900) {
    const idle = window.requestIdleCallback || (fn => setTimeout(fn, 1200));
    idle(() => slots.forEach(async slot => {
      const base = slot.getAttribute('data-video');
      try {
        const head = await fetch(base + '.mp4', { method: 'HEAD' });
        if (!head.ok || !(head.headers.get('content-type') || '').includes('video')) return;
        const v = document.createElement('video');
        v.muted = true; v.loop = true; v.playsInline = true; v.autoplay = true; v.preload = 'auto';
        v.setAttribute('muted', ''); v.setAttribute('playsinline', ''); v.setAttribute('aria-hidden', 'true');
        const poster = slot.getAttribute('data-poster');
        if (poster) v.poster = poster;
        v.innerHTML = `<source src="${base}.webm" type="video/webm"><source src="${base}.mp4" type="video/mp4">`;
        v.addEventListener('canplay', () => slot.classList.add('is-ready'), { once: true });
        slot.appendChild(v);
        v.play().catch(() => {});
        new IntersectionObserver(([e]) => { if (e.isIntersecting) v.play().catch(() => {}); else v.pause(); }).observe(slot);
      } catch (e) { /* keep the still image */ }
    }));
  }
})();
