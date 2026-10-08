/* A sample wrap design, drawn in the browser, so someone with no artwork yet can watch a flat
 * image bend to the template. Synthetic pattern made for this demo, 2400 x 1800 px.
 * Straight rules and an even pattern are the point: after the warp you can see how far each one bends. */
(function () {
  const W = 2400, H = 1800;
  const TAU = Math.PI * 2;
  const PAPER = '#f3ece0', INK = '#20302c', LEAF = '#2f6b58', WARM = '#b8623c';

  function sprig(c, x, y, s, a) {
    c.save(); c.translate(x, y); c.rotate(a); c.scale(s, s);
    c.strokeStyle = LEAF; c.lineWidth = 7; c.lineCap = 'round';
    c.beginPath(); c.moveTo(0, 46); c.quadraticCurveTo(6, 0, 0, -50); c.stroke();
    for (let i = 0; i < 4; i++) {
      const yy = 30 - i * 24, w = 30 - i * 4;
      for (const sg of [1, -1]) {
        c.beginPath();
        c.moveTo(0, yy);
        c.quadraticCurveTo(sg * w, yy - 6, sg * w * 0.6, yy - 24);
        c.quadraticCurveTo(sg * w * 0.2, yy - 14, 0, yy);
        c.fillStyle = LEAF; c.fill();
      }
    }
    c.restore();
  }

  function draw(c) {
    c.fillStyle = PAPER; c.fillRect(0, 0, W, H);
    // Even field of sprigs and dots: the warp shows up as the rows curving.
    const stepX = 200, stepY = 190;
    for (let r = 0; r * stepY < H + stepY; r++) {
      for (let k = 0; k * stepX < W + stepX; k++) {
        const x = k * stepX + (r % 2 ? stepX / 2 : 0), y = r * stepY + 60;
        sprig(c, x, y, 0.9, (r % 2 ? 0.22 : -0.22));
        c.beginPath(); c.arc(x + stepX / 2, y + stepY / 2, 9, 0, TAU);
        c.fillStyle = WARM; c.fill();
      }
    }
    // Straight rules top and bottom.
    c.strokeStyle = INK;
    for (const [y, lw] of [[96, 10], [120, 4], [H - 120, 4], [H - 96, 10]]) {
      c.lineWidth = lw; c.beginPath(); c.moveTo(70, y); c.lineTo(W - 70, y); c.stroke();
    }
    // Centre panel.
    const pw = 1340, ph = 620, px = (W - pw) / 2, py = (H - ph) / 2;
    c.fillStyle = '#fffdf8';
    c.beginPath();
    if (c.roundRect) c.roundRect(px, py, pw, ph, 36); else c.rect(px, py, pw, ph);
    c.fill();
    c.strokeStyle = INK; c.lineWidth = 6; c.stroke();
    c.strokeStyle = WARM; c.lineWidth = 3;
    c.beginPath();
    if (c.roundRect) c.roundRect(px + 22, py + 22, pw - 44, ph - 44, 22); else c.rect(px + 22, py + 22, pw - 44, ph - 44);
    c.stroke();
    c.textAlign = 'center';
    c.fillStyle = INK;
    c.font = '400 170px "Instrument Serif", Georgia, serif';
    c.fillText('Sample design', W / 2, py + 268);
    c.fillStyle = WARM;
    c.font = '500 54px Geist, system-ui, sans-serif';
    c.fillText('Peak Apps Tools', W / 2, py + 366);
    c.fillStyle = '#6b6257';
    c.font = '400 44px Geist, system-ui, sans-serif';
    c.fillText('Flat artwork, 2400 × 1800 px', W / 2, py + 462);
    sprig(c, px + 150, py + ph / 2, 1.5, 0);
    sprig(c, px + pw - 150, py + ph / 2, 1.5, 0);
  }

  window.TumblerSample = {
    async design() {
      try { await Promise.all([document.fonts.load('400 170px "Instrument Serif"'), document.fonts.load('500 54px Geist')]); }
      catch (e) { /* fallback faces are fine */ }
      const cv = document.createElement('canvas');
      cv.width = W; cv.height = H;
      draw(cv.getContext('2d'));
      const blob = await new Promise(res => cv.toBlob(res, 'image/png'));
      return new File([blob], 'sample-design.png', { type: 'image/png' });
    },
  };
})();
