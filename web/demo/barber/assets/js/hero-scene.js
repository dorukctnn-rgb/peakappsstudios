// Hero scene (loaded by hero.js on the first interaction): a wall-mounted barber pole in hard
// light. The stripes turn faster as you scroll faster (window.UK.vel comes from page.js);
// leaving the hero dollies the camera so the counter in front passes quicker than the pole.
// The poster under the canvas is a render of this scene at a reference frame (1600x1000 on
// wide screens, 487x593 in the phone band). The camera composes in that frame and shows the
// window of it the box covers, pinned at the pole like the poster's CSS, and the first frame
// starts from the poster's state, so the swap from poster to live pole does not show.
import * as THREE from 'three';
import { makeEnv, materials, makePole, makeRazor, makeComb, hardLight, shadowCatcher } from './models.js';

const host = document.getElementById('hero-scene');
const hero = document.getElementById('top');
const reduce = matchMedia('(prefers-reduced-motion: reduce)').matches;
const fine = matchMedia('(hover: hover) and (pointer: fine)').matches;
// layout follows the same media query that picks the poster; device cost follows the pointer too
const narrowMQ = matchMedia('(max-width: 860px)');
const phoneish = () => narrowMQ.matches || matchMedia('(pointer: coarse)').matches;
const REF = { wide: 1600 / 1000, narrow: 487 / 593 };
const PIN = 0.7;   // the pole sits 70% across, in the poster and in the box
const snap = location.search.includes('snapshot');

export function start() {
  const canvas = document.createElement('canvas');
  let renderer;
  try {
    renderer = new THREE.WebGLRenderer({ canvas, antialias: !phoneish(), alpha: true, powerPreference: 'high-performance' });
  } catch (e) { return; }
  if (!renderer.getContext()) return;
  host.appendChild(canvas);
  renderer.setClearColor(0x000000, 0);
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = THREE.PCFShadowMap;
  // light, pole and counter never move relative to each other: draw the shadow map once per layout
  renderer.shadowMap.autoUpdate = false;
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.outputColorSpace = THREE.SRGBColorSpace;

  const scene = new THREE.Scene();
  scene.environment = makeEnv(renderer);
  scene.environmentIntensity = 0.6;
  const M = materials();
  const cam = new THREE.PerspectiveCamera(26, 1, 0.1, 80);

  const { group: pole, stripe } = makePole(M);
  scene.add(pole);
  // shadow catcher only where the pole's shadow can fall: a full-screen plane would run the
  // shadow lookup on every pixel of the hero for nothing
  const wall = shadowCatcher(4.6, 7.6, 0.26, 0x2a0d0b);
  scene.add(wall);
  const key = hardLight(scene, { dir: [-6, 6.5, 9], intensity: 3.3, size: 4.5, map: phoneish() ? 1024 : 2048 });

  // counter in front of the wall, with the razor and a comb lying on it
  const counter = new THREE.Group();
  const top = new THREE.Mesh(new THREE.BoxGeometry(6, 0.22, 3.4), new THREE.MeshStandardMaterial({ color: 0xa6dcc9, roughness: 0.55 }));
  top.receiveShadow = true; top.castShadow = true;
  counter.add(top);
  const edge = new THREE.Mesh(new THREE.BoxGeometry(6, 0.08, 0.06), M.chrome);
  edge.position.set(0, 0, 1.72); counter.add(edge);
  const face = new THREE.Mesh(new THREE.BoxGeometry(6, 3, 0.1), new THREE.MeshStandardMaterial({ color: 0x4e1820, roughness: 0.6 }));
  face.position.set(0, -1.6, 1.66); counter.add(face);
  const razor = makeRazor(M);
  razor.rotation.set(-Math.PI / 2, 0, 0.32);
  razor.position.set(-0.9, 0.2, 0.75);
  razor.scale.setScalar(0.7);
  counter.add(razor);
  const comb = makeComb(M);
  comb.rotation.set(-Math.PI / 2, 0, 0.62);
  comb.position.set(1.75, 0.16, -0.45);
  comb.scale.setScalar(0.55);
  counter.add(comb);
  scene.add(counter);

  let W = 1, H = 1, isPhone = false;
  function layout() {
    W = host.clientWidth || innerWidth; H = host.clientHeight || innerHeight;
    isPhone = phoneish();
    const narrow = narrowMQ.matches;
    const ref = narrow ? REF.narrow : REF.wide;
    const dpr = Math.min(devicePixelRatio || 1, isPhone ? 1.25 : 1.75);
    renderer.setPixelRatio(dpr);
    renderer.setSize(W, H, false);
    // compose in the poster's frame (height H, width H * ref) and show the part of it this box
    // covers, with the pole pinned at the same point the poster's CSS pins it
    const fullW = H * ref;
    cam.aspect = ref;
    cam.setViewOffset(fullW, H, PIN * (fullW - W), 0, W, H);
    const dist = 14;
    const halfH = Math.tan(THREE.MathUtils.degToRad(cam.fov / 2)) * dist;
    const halfW = halfH * ref;
    if (!narrow) {
      const s = Math.min(1.0, (halfH * 2 * 0.74) / 5.3);
      pole.scale.setScalar(s);
      pole.position.set(halfW * (PIN * 2 - 1), -0.05, 0);
      counter.visible = true;
      counter.scale.setScalar(Math.min(1, halfW / 6.5));
      counter.position.set(halfW * 0.52, -halfH * 0.86, 1.2);
    } else {
      // phones: the canvas covers only the band between the bar and the headline
      const s = Math.min(0.9, (halfH * 2 * 0.84) / 5.3, (halfW * 2 * 0.3) / 1.0);
      pole.scale.setScalar(s);
      pole.position.set(halfW * (PIN * 2 - 1), -halfH * 0.02, 0);
      counter.visible = false;
    }
    wall.scale.setScalar(pole.scale.x);
    wall.position.set(pole.position.x + 1.1 * pole.scale.x, pole.position.y - 0.5 * pole.scale.x, -1.06 * pole.scale.x);
    key.target.position.copy(pole.position);
    key.position.set(pole.position.x - 6, pole.position.y + 6.5, 9);
    cam.position.set(0, 0, dist);
    cam.lookAt(0, 0, 0);
    cam.updateProjectionMatrix();
    renderer.shadowMap.needsUpdate = true;
  }

  let visible = true, running = false, last = performance.now(), born = 0;
  let mx = 0, my = 0, cx = 0, cy = 0, dolly = 0;
  function frame(now) {
    running = false;
    if (!visible || document.hidden) return;
    const vel = (window.UK && window.UK.vel) || 0;
    // phones: an idle spin at 30 fps is indistinguishable and halves the GPU work; scrolling gets every frame
    if (isPhone && born && Math.abs(vel) < 0.05 && now - last < 30) { schedule(); return; }
    const dt = Math.min(0.05, (now - last) / 1000); last = now;
    const first = !born;
    if (first) born = now;
    const still = reduce || snap || first;
    // the first frame is the poster: stripes at rest, camera square on. Spin and dolly ease in
    // from there, so a visitor who has already scrolled sees the camera follow, not jump.
    const ramp = Math.min(1, (now - born) / 900);
    const k = 1 - Math.exp(-dt * 9);
    if (!still) {
      stripe.offset.y -= (0.16 + Math.max(-0.9, Math.min(vel, 4)) * 0.42) * dt * ramp * ramp;
      const e = Math.min(1, Math.max(0, scrollY / (hero.offsetHeight || H)));
      dolly += (e - dolly) * k;
      if (fine) { cx += (mx - cx) * 0.06; cy += (my - cy) * 0.06; }
    }
    cam.position.set(cx * 0.45, -dolly * 1.9 - cy * 0.25, 14);
    cam.lookAt(cx * 0.15, -dolly * 0.7, 0);
    renderer.render(scene, cam);
    if (!host.classList.contains('is-live')) host.classList.add('is-live');
    schedule();
  }
  function schedule() { if (!running && visible && !document.hidden) { running = true; requestAnimationFrame(frame); } }

  layout();
  new ResizeObserver(() => { layout(); schedule(); }).observe(host);
  new IntersectionObserver((es) => { visible = es[0].isIntersecting; if (visible) { last = performance.now(); schedule(); } }).observe(hero);
  document.addEventListener('visibilitychange', () => { if (!document.hidden) { last = performance.now(); schedule(); } });
  if (fine && !reduce) {
    addEventListener('pointermove', (ev) => { mx = ev.clientX / innerWidth - 0.5; my = ev.clientY / innerHeight - 0.5; }, { passive: true });
  }
  schedule();

  // poster harness: ?snapshot freezes the scene in its first-frame state and exposes a render
  if (snap) {
    window.__heroSnap = (q = 0.9) => { renderer.render(scene, cam); return canvas.toDataURL('image/webp', q); };
  }
}

