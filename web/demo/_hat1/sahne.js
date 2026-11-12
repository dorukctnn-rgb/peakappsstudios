/* sahne.js: kahraman bolumunun WebGL katmani.  Kutuphane yok (ham WebGL 1), ~6 KB.  Hepsi isletmenin KENDI fotograflarindan:
   - 2.5D derinlik: her fotografin kural tabanli derinlik haritasi (img/pNN-d.webp) ile imleci izleyen / yavasca donen paralaks,
   - fotograflar arasi shader gecisi, isletmenin konseptine gore: isi = kor gibi yanarak acilan gecis + sicak hava titremesi (odun atesi),
     su = dalga kirilmasiyla gecis + kaydirdikca gun batimi tonu (nehir/deniz kiyisi), firca = firca darbesiyle gecis (el yazisi logo),
   - kaydirmaya bagli kararma.
   Yedekler: WebGL yoksa, yazilim isleyicisiyse (failIfMajorPerformanceCaveat), baglam kaybolursa ya da kare hizi dusukse katman kendini kaldirir;
   alttaki CSS fotograf akisi (Ken Burns) ayni fotograflarla devam eder.  Azaltilmis harekette bu dosya hic istenmez (page.js). */
(function () {
  'use strict';
  var d = document, w = window, root = d.documentElement;
  var host = d.querySelector('[data-gl]'); if (!host || host.__gl) return; host.__gl = 1;
  var data = {}; try { data = JSON.parse(d.getElementById('r-data').textContent || '{}'); } catch (e) { data = {}; }
  var FX = { isi: 0, su: 1, firca: 2 }[data.fx]; if (FX === undefined) FX = 2;
  var GLOW = data.glow || [1, 0.72, 0.36];
  var STILL = root.classList.contains('still');
  var FORCE = /[?&]gl=force/.test(location.search);
  var COARSE = !(w.matchMedia && w.matchMedia('(hover: hover) and (pointer: fine)').matches);
  var HOLD = 5.6, TR = 1.7;

  var lis = [].slice.call(host.querySelectorAll('.kb li')); if (!lis.length) return;
  var canvas = d.createElement('canvas'); canvas.setAttribute('aria-hidden', 'true');
  var opts = { alpha: false, antialias: false, depth: false, stencil: false, powerPreference: 'default', failIfMajorPerformanceCaveat: !FORCE };
  var gl = null; try { gl = canvas.getContext('webgl', opts) || canvas.getContext('experimental-webgl', opts); } catch (e) { gl = null; }
  if (!gl) return;

  var VS = 'attribute vec2 p;varying vec2 v;void main(){v=p*.5+.5;gl_Position=vec4(p,0.,1.);}';
  var FS = [
    '#define FX ' + FX,
    '#ifdef GL_FRAGMENT_PRECISION_HIGH', 'precision highp float;', '#else', 'precision mediump float;', '#endif',
    'uniform sampler2D tA,tB,dA,dB;uniform vec2 res,sA,sB,fA,fB,ptr;uniform float mixv,time,zA,zB,scr,amt,still;uniform vec3 glow;varying vec2 v;',
    'float hash(vec2 p){return fract(sin(dot(p,vec2(127.1,311.7)))*43758.5453);}',
    'float noise(vec2 p){vec2 i=floor(p),f=fract(p);f=f*f*(3.-2.*f);return mix(mix(hash(i),hash(i+vec2(1.,0.)),f.x),mix(hash(i+vec2(0.,1.)),hash(i+vec2(1.,1.)),f.x),f.y);}',
    'float fbm(vec2 p){float a=.5,s=0.;for(int i=0;i<4;i++){s+=a*noise(p);p*=2.02;a*=.5;}return s;}',
    // kapla (object-fit: cover) + odak noktasi + yakinlasma
    'vec2 cover(vec2 uv,vec2 s,vec2 f,float z){float ra=res.x/res.y,ri=s.x/s.y;vec2 k=ra>ri?vec2(1.,ri/ra):vec2(ra/ri,1.);k/=z;vec2 c=clamp(f,k*.5,1.-k*.5);return c+(uv-.5)*k;}',
    // derinlik haritasina gore kaydirma: yakin (beyaz) pikseller bakisin tersine daha cok oynar
    'vec3 samp(sampler2D t,sampler2D dm,vec2 uv,vec2 s,vec2 f,float z,vec2 warp){vec2 q=cover(uv,s,f,z)+warp;float dep=texture2D(dm,q).r;q+=(dep-.5)*ptr*amt;return texture2D(t,clamp(q,vec2(0.),vec2(1.))).rgb;}',
    'void main(){vec2 uv=v;float p=mixv;vec2 warp=vec2(0.);float k=0.;float edge=0.;',
    '#if FX==0',
    'float n=fbm(uv*vec2(3.,2.2)+vec2(0.,-time*.05));float e=n*.8+uv.y*.2;k=smoothstep(e-.08,e+.08,p*1.3-.15);edge=k*(1.-k)*4.;',
    'float hz=(noise(vec2(uv.x*14.,uv.y*9.-time*.9))-.5)*.0042*(1.-still);warp=vec2(hz,hz*.6+edge*.012);',
    '#elif FX==1',
    'float e=uv.x+sin(uv.y*7.+time*.8)*.035+sin(uv.y*17.-time*1.1)*.012;k=smoothstep(e-.2,e+.2,p*1.5-.25);edge=k*(1.-k)*4.;',
    'warp=vec2(sin(uv.y*26.+time*2.4)*edge*.02+sin(uv.y*5.+time*.5)*.0012*(1.-still),cos(uv.x*20.+time*2.)*edge*.008);',
    '#else',
    'float n=fbm(vec2(uv.x*1.6+uv.y*.8,(uv.y-uv.x*.22)*30.));float e=uv.x*.62+(1.-uv.y)*.12+n*.34;k=smoothstep(e-.035,e+.035,p*1.3-.1);edge=k*(1.-k)*4.;',
    '#endif',
    'vec3 a=samp(tA,dA,uv,sA,fA,zA,warp);vec3 b=samp(tB,dB,uv,sB,fB,zB,warp);vec3 col=mix(a,b,k);',
    '#if FX==0',
    'col+=glow*edge*.5;',
    // kivilcimlar: yalniz atesin oldugu ust yarida, seyrek
    'vec2 g=vec2(uv.x*res.x/res.y,uv.y)*vec2(8.,4.5);g.y-=time*.32;vec2 id=floor(g);vec2 f=fract(g)-.5;float h=hash(id);f.x+=sin(time*1.3+h*40.)*.2;',
    'float sp=smoothstep(.045,0.,length(f))*step(.9,h)*(.5+.5*sin(time*3.+h*20.));col+=glow*sp*.75*(1.-still)*smoothstep(.25,.75,uv.y);',
    '#elif FX==1',
    'col+=vec3(edge*.05);col=mix(col,col*vec3(1.05,.84,.68)*.92,clamp(scr*1.2,0.,.75));',
    '#else',
    'col=mix(col,glow,edge*.22);',
    '#endif',
    'col*=1.-scr*.28;gl_FragColor=vec4(col,1.);}'
  ].join('\n');

  function sh(type, src) { var s = gl.createShader(type); gl.shaderSource(s, src); gl.compileShader(s); return gl.getShaderParameter(s, gl.COMPILE_STATUS) ? s : null; }
  var vs = sh(gl.VERTEX_SHADER, VS), fs = sh(gl.FRAGMENT_SHADER, FS); if (!vs || !fs) return;
  var prog = gl.createProgram(); gl.attachShader(prog, vs); gl.attachShader(prog, fs); gl.linkProgram(prog);
  if (!gl.getProgramParameter(prog, gl.LINK_STATUS)) return;
  gl.useProgram(prog);
  var buf = gl.createBuffer(); gl.bindBuffer(gl.ARRAY_BUFFER, buf); gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 3, -1, -1, 3]), gl.STATIC_DRAW);
  var loc = gl.getAttribLocation(prog, 'p'); gl.enableVertexAttribArray(loc); gl.vertexAttribPointer(loc, 2, gl.FLOAT, false, 0, 0);
  var U = {}; ['tA', 'tB', 'dA', 'dB', 'res', 'sA', 'sB', 'fA', 'fB', 'ptr', 'mixv', 'time', 'zA', 'zB', 'scr', 'amt', 'still', 'glow'].forEach(function (n) { U[n] = gl.getUniformLocation(prog, n); });
  gl.uniform1i(U.tA, 0); gl.uniform1i(U.tB, 1); gl.uniform1i(U.dA, 2); gl.uniform1i(U.dB, 3);
  gl.uniform3f(U.glow, GLOW[0], GLOW[1], GLOW[2]); gl.uniform1f(U.still, STILL ? 1 : 0);
  gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL, true);

  function tex(src) {
    var t = gl.createTexture(); gl.bindTexture(gl.TEXTURE_2D, t);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE); gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR); gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
    if (src) gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, src);
    else gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, 1, 1, 0, gl.RGBA, gl.UNSIGNED_BYTE, new Uint8Array([128, 128, 128, 255]));
    return t;
  }
  var FLAT = tex(null);
  var dead = false, dpr = 1, W = 0, H = 0;
  var big = (host.clientWidth || w.innerWidth) * Math.min(w.devicePixelRatio || 1, 1.5) > 1100;
  var slides = lis.map(function (li) {
    var im = li.querySelector('img'); var fx = parseFloat(li.style.getPropertyValue('--fx')); var fy = parseFloat(li.style.getPropertyValue('--fy'));
    return { src: (im.getAttribute('src') || '').replace(/-(960|1600)\.webp$/, big ? '-1600.webp' : '-960.webp'), d: li.getAttribute('data-d'), f: [isNaN(fx) ? 0.5 : fx / 100, 1 - (isNaN(fy) ? 0.5 : fy / 100)], t: null, dt: FLAT, s: [1, 1], state: 0, cbs: [] };
  });
  function load(i, cb) {
    var s = slides[i]; if (s.state === 2) { if (cb) cb(); return; }
    if (cb) s.cbs.push(cb); if (s.state === 1) return; s.state = 1;
    var left = s.d ? 2 : 1;
    var fin = function () { if (--left > 0 || dead) return; s.state = s.t ? 2 : 3; var c = s.cbs; s.cbs = []; if (s.t) c.forEach(function (f) { f(); }); };
    var im = new Image(); im.decoding = 'async';
    im.onload = function () { if (!dead) { try { s.t = tex(im); s.s = [im.naturalWidth, im.naturalHeight]; } catch (e) { s.t = null; } } fin(); };
    im.onerror = fin; im.src = s.src;
    if (s.d) { var dm = new Image(); dm.decoding = 'async'; dm.onload = function () { if (!dead) { try { s.dt = tex(dm); } catch (e) { s.dt = FLAT; } } fin(); }; dm.onerror = fin; dm.src = s.d; }
  }

  function size() {
    var cw = host.clientWidth, ch = host.clientHeight; if (!cw || !ch) return;
    var px = cw * ch * dpr * dpr; var k = px > 2.3e6 ? Math.sqrt(2.3e6 / px) : 1;
    var nw = Math.max(2, Math.round(cw * dpr * k)), nh = Math.max(2, Math.round(ch * dpr * k));
    if (nw !== W || nh !== H) { W = canvas.width = nw; H = canvas.height = nh; gl.viewport(0, 0, W, H); gl.uniform2f(U.res, W, H); dirty = true; }
  }

  var cur = 0, nxt = -1, tHold = 0, tTr = 0, clock = 0, last = 0, ageA = 0, ageB = 0;
  var px = 0, py = 0, tx = 0, ty = 0, hover = false, dirty = true, onScreen = true, running = false, frames = 0, slow = 0, t0 = 0;
  var idx = (host.parentNode || d).querySelector('[data-idx]'); var btns = [];
  var ease = function (x) { return x < 0.5 ? 2 * x * x : 1 - Math.pow(-2 * x + 2, 2) / 2; };
  var pending = -1;
  function go(i) { if (nxt >= 0 || i === cur || STILL || pending === i || slides[i].state === 3) return; pending = i; load(i, function () { pending = -1; if (nxt < 0 && i !== cur) { nxt = i; tTr = 0; ageB = 0; } }); }
  if (idx && slides.length > 1 && !STILL) {
    slides.forEach(function (s, i) {
      var b = d.createElement('button'); b.type = 'button'; b.textContent = ('0' + (i + 1)).slice(-2);
      b.setAttribute('aria-label', ((data.t && data.t.photo) || 'Photo') + ' ' + (i + 1)); b.addEventListener('click', function () { go(i); tHold = 0; });
      idx.appendChild(b); btns.push(b);
    });
    idx.hidden = false;
  }
  function paintIdx() { for (var i = 0; i < btns.length; i++) { var on = i === (nxt >= 0 ? nxt : cur); btns[i].setAttribute('aria-current', on ? 'true' : 'false'); btns[i].style.setProperty('--pr', on ? (nxt >= 0 ? 0 : Math.min(1, tHold / HOLD)).toFixed(3) : '0'); } }

  function draw(now) {
    running = false; if (dead) return;
    var dt = last ? Math.min(0.1, (now - last) / 1000) : 0; last = now;
    if (!STILL) {
      clock += dt; ageA += dt;
      if (nxt >= 0) { tTr += dt; ageB += dt; if (tTr >= TR) { cur = nxt; nxt = -1; ageA = ageB; tHold = 0; if (slides.length > 1) load((cur + 1) % slides.length); } }
      else if (slides.length > 1) { tHold += dt; if (tHold >= HOLD) go((cur + 1) % slides.length); }
      var ax = Math.sin(clock * 0.37) * (COARSE ? 0.85 : 0.45), ay = Math.cos(clock * 0.29) * (COARSE ? 0.55 : 0.3);
      var gx = hover ? tx : ax, gy = hover ? ty : ay;
      px += (gx - px) * Math.min(1, dt * 3.2); py += (gy - py) * Math.min(1, dt * 3.2);
    }
    var A = slides[cur], B = slides[nxt >= 0 ? nxt : cur];
    gl.activeTexture(gl.TEXTURE0); gl.bindTexture(gl.TEXTURE_2D, A.t);
    gl.activeTexture(gl.TEXTURE1); gl.bindTexture(gl.TEXTURE_2D, B.t);
    gl.activeTexture(gl.TEXTURE2); gl.bindTexture(gl.TEXTURE_2D, A.dt);
    gl.activeTexture(gl.TEXTURE3); gl.bindTexture(gl.TEXTURE_2D, B.dt);
    gl.uniform2f(U.sA, A.s[0], A.s[1]); gl.uniform2f(U.sB, B.s[0], B.s[1]);
    gl.uniform2f(U.fA, A.f[0], A.f[1]); gl.uniform2f(U.fB, B.f[0], B.f[1]);
    var span = HOLD + TR * 2;
    gl.uniform1f(U.zA, 1.07 + 0.075 * Math.min(1, ageA / span)); gl.uniform1f(U.zB, 1.07 + 0.075 * Math.min(1, (nxt >= 0 ? ageB : ageA) / span));
    gl.uniform1f(U.mixv, nxt >= 0 ? ease(Math.min(1, tTr / TR)) : 0);
    gl.uniform1f(U.time, clock); gl.uniform2f(U.ptr, -px, -py); gl.uniform1f(U.amt, 0.034);
    var hh = host.clientHeight || 1; var r = host.getBoundingClientRect();
    gl.uniform1f(U.scr, STILL ? 0 : Math.max(0, Math.min(1, -r.top / hh)));
    gl.drawArrays(gl.TRIANGLES, 0, 3);
    if (!host.classList.contains('gl-on')) host.classList.add('gl-on');
    paintIdx(); dirty = false;
    // kare hizi bekcisi: yavas cihazda once cozunurluk duser, yine yavassa katman kalkar (CSS akisi devam eder)
    if (!STILL && !FORCE) {
      frames++; if (frames === 1) t0 = now;
      if (frames === 80) { var avg = (now - t0) / 79; frames = 0; if (avg > 42) { slow++; if (slow === 1 && dpr > 1) { dpr = 1; size(); } else if (slow >= 2) { kill(); return; } } }
    }
    if (!STILL) loop();
  }
  function loop() { if (running || dead || !onScreen || d.hidden) return; running = true; w.requestAnimationFrame(draw); }
  function kick() { last = 0; frames = 0; if (STILL) { if (dirty && !running) { running = true; w.requestAnimationFrame(draw); } } else loop(); }
  function kill() {
    if (dead) return; dead = true; host.classList.remove('gl-on'); if (idx) idx.hidden = true;
    if (canvas.parentNode) canvas.parentNode.removeChild(canvas);
    try { var ext = gl.getExtension('WEBGL_lose_context'); if (ext) ext.loseContext(); } catch (e) { /* yoksay */ }
  }
  canvas.addEventListener('webglcontextlost', function (e) { e.preventDefault(); kill(); });

  var hero = host.closest ? host.closest('.hero') || host : host;
  if (!COARSE && !STILL) {
    hero.addEventListener('pointermove', function (e) { var r = host.getBoundingClientRect(); tx = Math.max(-1, Math.min(1, ((e.clientX - r.left) / r.width - 0.5) * 2)); ty = Math.max(-1, Math.min(1, (0.5 - (e.clientY - r.top) / r.height) * 2)); hover = true; }, { passive: true });
    hero.addEventListener('pointerleave', function () { hover = false; });
  }
  if ('IntersectionObserver' in w) new IntersectionObserver(function (es) { onScreen = es[es.length - 1].isIntersecting; if (onScreen) kick(); }, { threshold: 0.01 }).observe(host);
  d.addEventListener('visibilitychange', function () { if (!d.hidden) kick(); });
  if ('ResizeObserver' in w) new ResizeObserver(function () { size(); if (STILL) kick(); }).observe(host); else w.addEventListener('resize', function () { size(); if (STILL) kick(); });

  dpr = Math.min(w.devicePixelRatio || 1, 1.5);
  load(0, function () {
    if (dead) return;
    host.insertBefore(canvas, host.querySelector('.kb').nextSibling);
    size(); kick();
    if (slides.length > 1 && !STILL) load(1);
  });
})();
