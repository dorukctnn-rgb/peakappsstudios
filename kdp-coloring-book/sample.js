/* Three sample coloring pages, drawn in the browser so someone with no artwork of their own
 * can still see the maker build a real interior PDF.
 * The art is synthetic line work made for this demo, 2400 x 3000 px (about 300 dpi at 8 x 10 in).
 * Nothing here is a real book page; each one carries a small "sample" line. */
(function () {
  const W = 2400, H = 3000;
  const TAU = Math.PI * 2;

  function frame(c) {
    c.save();
    c.lineWidth = 7;
    c.strokeRect(96, 96, W - 192, H - 260);
    c.lineWidth = 3;
    c.strokeRect(120, 120, W - 240, H - 308);
    c.restore();
  }
  function ring(c, x, y, r) { c.beginPath(); c.arc(x, y, r, 0, TAU); c.stroke(); }
  function dotRing(c, x, y, r, n, d) {
    for (let i = 0; i < n; i++) {
      const a = (i / n) * TAU;
      c.beginPath(); c.arc(x + Math.cos(a) * r, y + Math.sin(a) * r, d, 0, TAU); c.stroke();
    }
  }
  function petals(c, x, y, n, r0, r1, wid, offset) {
    for (let i = 0; i < n; i++) {
      c.save();
      c.translate(x, y);
      c.rotate((i / n) * TAU + (offset || 0));
      c.beginPath();
      c.moveTo(0, -r0);
      c.bezierCurveTo(wid, -(r0 + r1) * 0.42, wid * 0.55, -r1, 0, -r1);
      c.bezierCurveTo(-wid * 0.55, -r1, -wid, -(r0 + r1) * 0.42, 0, -r0);
      c.stroke();
      c.restore();
    }
  }
  function scallopRing(c, x, y, r, n, h) {
    for (let i = 0; i < n; i++) {
      const a0 = (i / n) * TAU, a1 = ((i + 1) / n) * TAU, am = (a0 + a1) / 2;
      c.beginPath();
      c.moveTo(x + Math.cos(a0) * r, y + Math.sin(a0) * r);
      c.quadraticCurveTo(x + Math.cos(am) * (r + h), y + Math.sin(am) * (r + h), x + Math.cos(a1) * r, y + Math.sin(a1) * r);
      c.stroke();
    }
  }
  function leaf(c, x, y, len, wid, ang) {
    c.save(); c.translate(x, y); c.rotate(ang);
    c.beginPath();
    c.moveTo(0, 0);
    c.quadraticCurveTo(wid, -len * 0.5, 0, -len);
    c.quadraticCurveTo(-wid, -len * 0.5, 0, 0);
    c.stroke();
    c.beginPath(); c.moveTo(0, 0); c.lineTo(0, -len); c.stroke();
    for (let t = 0.2; t < 0.9; t += 0.18) {
      const yy = -len * t, sp = wid * (1 - Math.abs(t - 0.5) * 1.2) * 0.62;
      c.beginPath(); c.moveTo(0, yy); c.quadraticCurveTo(sp * 0.7, yy - len * 0.06, sp, yy - len * 0.11); c.stroke();
      c.beginPath(); c.moveTo(0, yy); c.quadraticCurveTo(-sp * 0.7, yy - len * 0.06, -sp, yy - len * 0.11); c.stroke();
    }
    c.restore();
  }

  /* ---- 1. Mandala ---- */
  function mandala(c) {
    frame(c);
    const x = W / 2, y = 1360;
    c.lineWidth = 9;
    ring(c, x, y, 100);
    petals(c, x, y, 8, 100, 250, 100);
    ring(c, x, y, 275);
    dotRing(c, x, y, 328, 16, 22);
    ring(c, x, y, 382);
    petals(c, x, y, 16, 382, 582, 92, Math.PI / 16);
    ring(c, x, y, 606);
    for (let i = 0; i < 24; i++) {
      const a = (i / 24) * TAU;
      c.beginPath();
      c.moveTo(x + Math.cos(a) * 606, y + Math.sin(a) * 606);
      c.lineTo(x + Math.cos(a) * 690, y + Math.sin(a) * 690);
      c.stroke();
    }
    ring(c, x, y, 690);
    petals(c, x, y, 12, 690, 890, 158);
    scallopRing(c, x, y, 905, 28, 58);
    c.lineWidth = 6;
    dotRing(c, x, y, 985, 28, 16);
    c.lineWidth = 9;
    // A quiet line of leaves at the foot of the page.
    for (let i = -3; i <= 3; i++) leaf(c, x + i * 250, 2560, 300 - Math.abs(i) * 30, 92, i * 0.22);
  }

  /* ---- 2. Flowers in a jar ---- */
  function flowers(c) {
    frame(c);
    c.lineWidth = 9;
    const base = 2460, x = W / 2;
    // Jar
    c.beginPath();
    c.moveTo(x - 330, base - 760);
    c.bezierCurveTo(x - 430, base - 420, x - 400, base - 90, x - 300, base);
    c.lineTo(x + 300, base);
    c.bezierCurveTo(x + 400, base - 90, x + 430, base - 420, x + 330, base - 760);
    c.stroke();
    c.beginPath(); c.moveTo(x - 342, base - 760); c.lineTo(x + 342, base - 760); c.stroke();
    c.beginPath(); c.moveTo(x - 300, base - 700); c.lineTo(x + 300, base - 700); c.stroke();
    for (let i = -4; i <= 4; i++) {
      c.beginPath();
      c.moveTo(x + i * 72, base - 520);
      c.lineTo(x + i * 72 + 36, base - 400);
      c.lineTo(x + i * 72, base - 280);
      c.stroke();
    }
    for (let i = -3; i <= 3; i++) { c.beginPath(); c.arc(x + i * 86, base - 150, 26, 0, TAU); c.stroke(); }
    // Stems
    const blooms = [[x - 600, 1010, -0.30], [x + 30, 700, 0], [x + 580, 1120, 0.30]];
    for (const [bx, by, tilt] of blooms) {
      c.beginPath();
      c.moveTo(x + tilt * 60, base - 790);
      c.quadraticCurveTo(bx - tilt * 160, (by + base) / 2, bx, by + 230);
      c.stroke();
    }
    leaf(c, x - 190, base - 980, 320, 120, -0.9);
    leaf(c, x + 190, base - 1010, 330, 125, 0.95);
    leaf(c, x - 60, base - 1240, 270, 100, -0.35);
    // Daisy
    petals(c, blooms[0][0], blooms[0][1], 13, 120, 350, 118);
    ring(c, blooms[0][0], blooms[0][1], 116);
    dotRing(c, blooms[0][0], blooms[0][1], 62, 8, 24);
    // Tulip-like bloom
    const [tx, ty] = [blooms[1][0], blooms[1][1]];
    petals(c, tx, ty, 6, 90, 400, 200);
    petals(c, tx, ty, 6, 76, 250, 150, Math.PI / 6);
    ring(c, tx, ty, 74);
    // Spiral rose
    const [rx, ry] = [blooms[2][0], blooms[2][1]];
    scallopRing(c, rx, ry, 300, 12, 76);
    ring(c, rx, ry, 300);
    c.beginPath();
    for (let t = 0; t < 8.6; t += 0.04) {
      const r = 30 + t * 30, a = t;
      const px = rx + Math.cos(a) * r, py = ry + Math.sin(a) * r;
      t === 0 ? c.moveTo(px, py) : c.lineTo(px, py);
    }
    c.stroke();
  }

  /* ---- 3. Wave and circle pattern ---- */
  function pattern(c) {
    frame(c);
    const x0 = 190, y0 = 300, cell = 340, cols = 6, rows = 7;
    c.lineWidth = 8;
    for (let r = 0; r < rows; r++) {
      for (let k = 0; k < cols; k++) {
        const x = x0 + k * cell, y = y0 + r * cell;
        const flip = (r + k) % 2 === 0;
        c.beginPath();
        if (flip) {
          c.arc(x, y, cell / 2, 0, Math.PI / 2);
          c.moveTo(x + cell, y + cell - cell / 2);
          c.arc(x + cell, y + cell, cell / 2, Math.PI, Math.PI * 1.5);
        } else {
          c.arc(x + cell, y, cell / 2, Math.PI / 2, Math.PI);
          c.moveTo(x + cell / 2, y + cell);
          c.arc(x, y + cell, cell / 2, Math.PI * 1.5, TAU);
        }
        c.stroke();
        c.beginPath();
        if (flip) { c.arc(x, y, cell / 5, 0, Math.PI / 2); c.arc(x + cell, y + cell, cell / 5, Math.PI, Math.PI * 1.5); }
        else { c.arc(x + cell, y, cell / 5, Math.PI / 2, Math.PI); c.arc(x, y + cell, cell / 5, Math.PI * 1.5, TAU); }
        c.stroke();
      }
    }
    c.lineWidth = 10;
    c.strokeRect(x0, y0, cols * cell, rows * cell);
    const bands = [y0 + 2 * cell, y0 + 5 * cell];
    for (const by of bands) {
      c.save();
      c.fillStyle = '#ffffff';
      c.fillRect(x0 - 20, by - 110, cols * cell + 40, 220);
      c.restore();
      c.lineWidth = 9;
      c.strokeRect(x0, by - 110, cols * cell, 220);
      for (let i = 0; i < cols * 3; i++) {
        const bx = x0 + (i + 0.5) * (cols * cell) / (cols * 3);
        c.beginPath(); c.arc(bx, by, 54, 0, TAU); c.stroke();
        c.beginPath(); c.arc(bx, by, 22, 0, TAU); c.stroke();
      }
    }
  }

  const DRAWINGS = [
    ['sample-page-1-mandala.png', mandala],
    ['sample-page-2-flowers.png', flowers],
    ['sample-page-3-pattern.png', pattern],
  ];

  async function draw(name, fn) {
    const cv = document.createElement('canvas');
    cv.width = W; cv.height = H;
    const c = cv.getContext('2d');
    c.fillStyle = '#ffffff'; c.fillRect(0, 0, W, H);
    c.strokeStyle = '#111111'; c.lineCap = 'round'; c.lineJoin = 'round';
    fn(c);
    c.save();
    c.fillStyle = '#9b9b9b';
    c.font = '34px Geist, system-ui, sans-serif';
    c.textAlign = 'center';
    c.fillText('Sample page drawn by Peak Apps Tools', W / 2, H - 92);
    c.restore();
    const blob = await new Promise(res => cv.toBlob(res, 'image/png'));
    return new File([blob], name, { type: 'image/png' });
  }

  window.KDPSample = {
    count: DRAWINGS.length,
    async pages() {
      try { await document.fonts.load('34px Geist'); } catch (e) { /* the fallback face is fine */ }
      return Promise.all(DRAWINGS.map(([name, fn]) => draw(name, fn)));
    },
  };
})();
