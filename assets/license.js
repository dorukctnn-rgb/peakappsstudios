/* Gumroad license check for Peak Apps Tools.
 * Usage (per tool page):
 *   <script src="/assets/license.js" defer></script>
 *   PeakLicense.setup({ tool: 'tumbler', productId: '...', permalink: 'tumbler-studio-pro', buyUrl: '...' })
 *   PeakLicense.isPro()            -> boolean (true only after a successful verify)
 *   PeakLicense.onChange(fn)       -> fn(isPro) on every change (also called once immediately)
 *   PeakLicense.open()             -> opens the "enter your license key" dialog
 *   PeakLicense.requirePro(label)  -> true if Pro, otherwise opens the upsell dialog and returns false
 * Pages in another language pass setup({ strings: { title, buy, keyLabel, verify, close, checking, badKey, network, ok,
 * refunded, rejected, active }, localMessages: true }); the English words below are the defaults. With localMessages
 * a key Gumroad refuses gets strings.rejected rather than Gumroad's own English message.
 * The status line carries data-l-status="checking", "active" or "error" (it stays in the page after the dialog closes),
 * and a success message stays on screen for 2 s before the dialog closes, so tests can wait on either in any language.
 * Verification calls Gumroad's public endpoint (CORS allowed, no secret needed).
 * The verified key is cached locally and re-checked in the background every 7 days.
 *
 * Checkout link. By default the Buy buttons ([data-buy-pro] and the Pro window's) open the Gumroad product page in a new tab.
 * A page with <meta name="peak-checkout" content="direct"> (or a tool passing setup({ checkout: 'direct' | 'product' }), which
 * wins) sends them straight to Gumroad's checkout instead: the same link with ?wanted=true, still in a new tab, so the tool and
 * the file open in it stay where they are while the visitor pays. Gumroad answers /l/<permalink>?wanted=true with a redirect
 * to its checkout with the product in the cart and every other query parameter kept, so the utm_source, utm_medium and
 * utm_campaign that pro-source.js adds on the click reach the checkout too (checked against the real Gumroad, 29 Oct 2026).
 * Nothing else loads: no Gumroad script, no change to the page's policy. Tests: assets/_tests/direct-checkout.test.mjs.
 *
 * Paddle. A page with <meta name="peak-pay" content="<product>"> (the build adds it to the tools sold through Paddle) sells Pro
 * in Paddle's checkout, inside a light panel on the page (assets/peak-pay.js, loaded only when needed; the Worker peak-pay,
 * pay-worker/). After the payment Pro turns on in this browser with nothing to type: the key is kept like a Gumroad key
 * ("pp-..."), checked with the Worker every 7 days. The Pro window then offers to e-mail the Pro link to the address that paid
 * (for another device), and keeps the key box for a key bought earlier. A link from that e-mail (#pro=<key>) turns Pro on.
 * Without the meta nothing of this runs and the page behaves exactly as before. Tests: assets/_tests/peak-pay.test.mjs.
 */
(function () {
  const API = 'https://api.gumroad.com/v2/licenses/verify';
  const WEEK = 7 * 864e5;
  let cfg = null;
  // the Gumroad product link with ?wanted=true (straight to checkout); anything else is returned as it is
  function toCheckout(url) {
    try {
      const u = new URL(url);
      if (u.protocol !== 'https:' || !/(^|\.)gumroad\.com$/.test(u.hostname) || !u.pathname.startsWith('/l/')) return url;
      u.searchParams.set('wanted', 'true');
      return u.toString();
    } catch (e) { return url; }
  }
  const buyLink = () => (cfg.checkout === 'direct' ? toCheckout(cfg.buyUrl) : cfg.buyUrl);
  const listeners = [];
  const WORDS = {
    title: 'Get Pro', buy: 'Buy Pro on Gumroad', keyLabel: 'Already bought it? Paste your license key', verify: 'Activate', close: 'Close',
    checking: 'Checking with Gumroad…', badKey: 'That doesn’t look like a license key. It is in your Gumroad receipt email.',
    network: 'Couldn’t reach Gumroad to check the key. Check your connection and try again.', ok: 'Pro is active on this browser. Thank you.',
    refunded: 'This purchase was refunded or has ended, so Pro is off.', rejected: 'That license key was not accepted.', active: 'Pro is active on this browser.',
  };
  const w = k => (cfg && cfg.strings && cfg.strings[k]) || WORDS[k];
  const store = {
    get(k) { try { return JSON.parse(localStorage.getItem(k) || 'null'); } catch (e) { return null; } },
    set(k, v) { try { localStorage.setItem(k, JSON.stringify(v)); } catch (e) { /* private mode */ } },
    del(k) { try { localStorage.removeItem(k); } catch (e) { /* ignore */ } },
  };
  const keyName = () => `peak-license:${cfg.tool}`;

  // ---- Paddle (only on a page with <meta name="peak-pay">) ----
  const PAY_KEY = /^pp-[st]-[0-9a-z]{26}-[0-9a-f]{24}$/i;
  const PAY_WORDS = {
    en: { buy: 'Get Pro', restore: 'Bought Pro already? We can e-mail your Pro link to the address you paid with.', email: 'Your e-mail address', send: 'Send link', sent: 'If this address bought Pro, the link is on its way. Open it in this browser.', error: 'That did not work just now. Try again in a minute.', key: 'Have a license key?', network: 'Couldn’t reach the licence service. Check your connection and try again.', receipts: 'Receipts and invoices' },
    de: { buy: 'Pro holen', restore: 'Pro schon gekauft? Wir schicken dir den Pro-Link an die Adresse, mit der du bezahlt hast.', email: 'Deine E-Mail-Adresse', send: 'Link schicken', sent: 'Wenn zu dieser Adresse ein Kauf gehört, ist der Link unterwegs. Öffne ihn in diesem Browser.', error: 'Das hat gerade nicht geklappt. Versuch es in einer Minute noch einmal.', key: 'Hast du einen Lizenzschlüssel?', network: 'Der Lizenzdienst war nicht erreichbar. Prüfe deine Verbindung und versuch es noch einmal.', receipts: 'Quittungen und Rechnungen' },
    es: { buy: 'Obtener Pro', restore: '¿Ya compraste Pro? Te enviamos el enlace de Pro a la dirección con la que pagaste.', email: 'Tu correo electrónico', send: 'Enviar enlace', sent: 'Si esta dirección compró Pro, el enlace va en camino. Ábrelo en este navegador.', error: 'Ahora no funcionó. Inténtalo de nuevo en un minuto.', key: '¿Tienes una clave de licencia?', network: 'No se pudo contactar con el servicio de licencias. Revisa tu conexión e inténtalo de nuevo.', receipts: 'Recibos y facturas' },
    fr: { buy: 'Obtenir Pro', restore: 'Déjà acheté Pro ? Nous envoyons le lien Pro à l’adresse avec laquelle vous avez payé.', email: 'Votre adresse e-mail', send: 'Envoyer le lien', sent: 'Si cette adresse a acheté Pro, le lien est en route. Ouvrez-le dans ce navigateur.', error: 'Cela n’a pas marché. Réessayez dans une minute.', key: 'Vous avez une clé de licence ?', network: 'Le service de licence est injoignable. Vérifiez votre connexion et réessayez.', receipts: 'Reçus et factures' },
    it: { buy: 'Ottieni Pro', restore: 'Hai già acquistato Pro? Ti inviamo il link di Pro all’indirizzo con cui hai pagato.', email: 'Il tuo indirizzo e-mail', send: 'Invia link', sent: 'Se questo indirizzo ha acquistato Pro, il link è in arrivo. Aprilo in questo browser.', error: 'Non ha funzionato. Riprova tra un minuto.', key: 'Hai una chiave di licenza?', network: 'Il servizio licenze non risponde. Controlla la connessione e riprova.', receipts: 'Ricevute e fatture' },
    nl: { buy: 'Pro nemen', restore: 'Pro al gekocht? We mailen je Pro-link naar het adres waarmee je betaalde.', email: 'Je e-mailadres', send: 'Link sturen', sent: 'Als dit adres Pro kocht, is de link onderweg. Open hem in deze browser.', error: 'Dat lukte nu niet. Probeer het over een minuut opnieuw.', key: 'Heb je een licentiesleutel?', network: 'De licentiedienst is niet bereikbaar. Controleer je verbinding en probeer het opnieuw.', receipts: 'Bonnen en facturen' },
    pt: { buy: 'Obter o Pro', restore: 'Já comprou o Pro? Enviamos o link do Pro para o endereço com que você pagou.', email: 'Seu e-mail', send: 'Enviar link', sent: 'Se este endereço comprou o Pro, o link está a caminho. Abra-o neste navegador.', error: 'Não deu certo agora. Tente de novo em um minuto.', key: 'Tem uma chave de licença?', network: 'Não foi possível falar com o serviço de licenças. Verifique a conexão e tente de novo.', receipts: 'Recibos e faturas' },
    tr: { buy: 'Pro’yu al', restore: 'Pro’yu daha önce aldın mı? Pro bağlantını ödeme yaptığın adrese e-postayla gönderelim.', email: 'E-posta adresin', send: 'Bağlantıyı gönder', sent: 'Bu adres Pro aldıysa bağlantı yolda. Onu bu tarayıcıda aç.', error: 'Şu an olmadı. Bir dakika sonra tekrar dene.', key: 'Lisans anahtarın mı var?', network: 'Lisans hizmetine ulaşılamadı. Bağlantını kontrol edip tekrar dene.', receipts: 'Makbuzlar ve faturalar' },
    id: { buy: 'Dapatkan Pro', restore: 'Sudah membeli Pro? Kami kirim tautan Pro ke alamat yang kamu pakai untuk membayar.', email: 'Alamat e-mailmu', send: 'Kirim tautan', sent: 'Jika alamat ini membeli Pro, tautannya sedang dikirim. Buka di browser ini.', error: 'Belum berhasil. Coba lagi sebentar lagi.', key: 'Punya kunci lisensi?', network: 'Layanan lisensi tidak dapat dihubungi. Periksa koneksi dan coba lagi.', receipts: 'Tanda terima dan faktur' },
    ja: { buy: 'Pro を購入', restore: 'Pro を購入済みですか。お支払いに使ったメールアドレスに Pro のリンクをお送りします。', email: 'メールアドレス', send: 'リンクを送る', sent: 'このアドレスで Pro が購入されていれば、リンクを送信しました。このブラウザで開いてください。', error: 'うまくいきませんでした。1分ほどしてからもう一度お試しください。', key: 'ライセンスキーをお持ちですか', network: 'ライセンスサービスに接続できませんでした。接続を確認してもう一度お試しください。', receipts: '領収書と請求書' },
    ko: { buy: 'Pro 구매', restore: '이미 Pro를 구매하셨나요? 결제한 이메일 주소로 Pro 링크를 보내드립니다.', email: '이메일 주소', send: '링크 보내기', sent: '이 주소로 Pro를 구매했다면 링크가 발송되었습니다. 이 브라우저에서 여세요.', error: '지금은 되지 않았습니다. 잠시 후 다시 시도하세요.', key: '라이선스 키가 있나요?', network: '라이선스 서비스에 연결할 수 없습니다. 연결을 확인하고 다시 시도하세요.', receipts: '영수증 및 청구서' },
    pl: { buy: 'Kup Pro', restore: 'Masz już Pro? Wyślemy link do Pro na adres, którym płaciłeś.', email: 'Twój adres e-mail', send: 'Wyślij link', sent: 'Jeśli ten adres kupił Pro, link jest w drodze. Otwórz go w tej przeglądarce.', error: 'Teraz się nie udało. Spróbuj za minutę.', key: 'Masz klucz licencyjny?', network: 'Nie udało się połączyć z usługą licencji. Sprawdź połączenie i spróbuj ponownie.', receipts: 'Rachunki i faktury' },
  };
  const pageLang = () => { const b = String(document.documentElement.lang || 'en').toLowerCase().split(/[-_]/)[0]; return PAY_WORDS[b] ? b : 'en'; };
  const pw = k => PAY_WORDS[pageLang()][k];
  function payProduct() {
    const m = document.querySelector('meta[name="peak-pay"]');
    const v = m && m.getAttribute('content');
    return v && /^[a-z0-9-]{2,40}$/.test(v) ? v : null;
  }
  let payLoad = null;
  function loadPay() {
    if (window.PeakPay) return Promise.resolve(window.PeakPay);
    if (payLoad) return payLoad;
    payLoad = new Promise(resolve => {
      const s = document.createElement('script');
      s.src = '/assets/peak-pay.js';
      s.onload = () => resolve(window.PeakPay || null);
      s.onerror = () => { payLoad = null; resolve(null); };
      document.head.appendChild(s);
    });
    return payLoad;
  }
  function payCss() {
    if (document.querySelector('link[data-peak-pay]')) return;
    const l = document.createElement('link');
    l.rel = 'stylesheet'; l.href = '/assets/peak-pay.css'; l.setAttribute('data-peak-pay', '');
    document.head.appendChild(l);
  }
  function keepPay(key) { store.set(keyName(), { ok: true, key: String(key).toLowerCase(), checked: Date.now(), src: 'paddle' }); emit(); }
  // the Buy buttons on a Paddle page: the panel on this page; if Paddle cannot open here now, the Pro window with the Gumroad link
  async function buyWithPaddle() {
    const d = document.getElementById('peak-license-dialog');
    if (d && d.open) d.close();
    const P = await loadPay();
    const opened = P ? await P.open({ product: cfg.pay, lang: pageLang(), page: location.origin + location.pathname, onKey: keepPay }) : false;
    if (!opened) { cfg.payDown = true; open(); }
  }

  function current() {
    const rec = cfg && store.get(keyName());
    return !!(rec && rec.ok && rec.key);
  }
  function emit() { const pro = current(); listeners.forEach(fn => { try { fn(pro); } catch (e) { console.error(e); } }); }

  async function verify(licenseKey, { increment = false } = {}) {
    if (!cfg) throw new Error('PeakLicense.setup() was not called');
    const key = String(licenseKey || '').trim();
    if (!/^[A-Za-z0-9-]{8,}$/.test(key)) return { ok: false, message: w('badKey') };
    if (cfg.pay && PAY_KEY.test(key)) {
      const P = await loadPay();
      const r = P ? await P.status(key.toLowerCase(), cfg.pay) : { ok: false, code: 'network' };
      if (r.ok) { keepPay(key); return { ok: true, message: w('ok') }; }
      if (r.code === 'network') return { ok: false, network: true, message: pw('network') };
      if (r.code === 'refunded' || r.code === 'ended') { store.del(keyName()); emit(); return { ok: false, message: w('refunded') }; }
      return { ok: false, message: w('rejected') };
    }
    const body = new URLSearchParams({ license_key: key, increment_uses_count: increment ? 'true' : 'false' });
    if (cfg.productId) body.set('product_id', cfg.productId); else body.set('product_permalink', cfg.permalink);
    let json;
    try {
      const r = await fetch(API, { method: 'POST', body });
      json = await r.json();
    } catch (e) {
      return { ok: false, network: true, message: w('network') };
    }
    const p = json && json.purchase;
    const valid = json && json.success && p && !p.refunded && !p.chargebacked && !p.disputed &&
      !(p.subscription_cancelled_at || p.subscription_failed_at || p.subscription_ended_at);
    if (valid) {
      store.set(keyName(), { ok: true, key, checked: Date.now(), email: p.email || '' });
      emit();
      return { ok: true, message: w('ok') };
    }
    if (json && json.success && p) { store.del(keyName()); emit(); return { ok: false, message: w('refunded') }; }
    return { ok: false, message: (!cfg.localMessages && json && json.message) || w('rejected') };
  }

  async function recheck() {
    const rec = store.get(keyName());
    if (!rec || !rec.key || Date.now() - (rec.checked || 0) < WEEK) return;
    // a Paddle key is checked on a Paddle page only (and a Gumroad key never with Paddle)
    if ((rec.src === 'paddle') !== !!cfg.pay) return;
    const res = await verify(rec.key);
    if (!res.ok && !res.network) { store.del(keyName()); emit(); }
  }

  const esc = s => String(s).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
  function dialog() {
    let d = document.getElementById('peak-license-dialog');
    if (d) return d;
    if (cfg.pay) return payDialog();
    d = document.createElement('dialog');
    d.id = 'peak-license-dialog';
    d.className = 'license-dialog';
    d.innerHTML = `
      <form method="dialog">
        <h2 style="font-size:22px" data-l-title>${esc(w('title'))}</h2>
        <p class="small muted" data-l-reason style="margin:0"></p>
        <a class="btn btn-primary" data-l-buy target="_blank" rel="noopener">${esc(w('buy'))}</a>
        <label class="field"><span>${esc(w('keyLabel'))}</span>
          <input class="input mono" name="key" autocomplete="off" spellcheck="false" placeholder="XXXXXXXX-XXXXXXXX-XXXXXXXX-XXXXXXXX"></label>
        <p class="license-status" data-l-status role="status"></p>
        <div style="display:flex;gap:10px;flex-wrap:wrap">
          <button class="btn btn-ink" value="verify" data-l-verify>${esc(w('verify'))}</button>
          <button class="btn" value="close" formnovalidate>${esc(w('close'))}</button>
        </div>
      </form>`;
    document.body.appendChild(d);
    const status = d.querySelector('[data-l-status]');
    d.querySelector('[data-l-verify]').addEventListener('click', async (ev) => {
      ev.preventDefault();
      status.dataset.state = ''; status.dataset.lStatus = 'checking'; status.textContent = w('checking');
      const res = await verify(d.querySelector('input[name=key]').value);
      status.dataset.state = res.ok ? 'ok' : 'err'; status.dataset.lStatus = res.ok ? 'active' : 'error'; status.textContent = res.message;
      if (res.ok) setTimeout(() => d.close(), 2000);
    });
    return d;
  }

  // The Pro window of a Paddle page: Get Pro (the panel), the e-mail box for a buyer on another device, the key box folded away.
  function payDialog() {
    payCss();
    const d = document.createElement('dialog');
    d.id = 'peak-license-dialog';
    d.className = 'license-dialog';
    d.innerHTML = `
      <form method="dialog">
        <h2 style="font-size:22px" data-l-title>${esc(w('title'))}</h2>
        <p class="small muted" data-l-reason style="margin:0"></p>
        <a class="btn btn-primary" data-l-buy href="#" rel="noopener">${esc(pw('buy'))}</a>
        <div class="pp-restore">
          <p>${esc(pw('restore'))}</p>
          <div class="pp-row"><input type="email" name="pp-email" autocomplete="email" inputmode="email" spellcheck="false" aria-label="${esc(pw('email'))}" placeholder="${esc(pw('email'))}"><button type="button" data-pp-send>${esc(pw('send'))}</button></div>
          <p class="small" data-pp-note role="status"></p>
        </div>
        <details class="pp-keybox"><summary>${esc(pw('key'))}</summary>
          <label class="field"><span>${esc(w('keyLabel'))}</span>
            <input class="input mono" name="key" autocomplete="off" spellcheck="false" placeholder="pp-… / XXXXXXXX-XXXXXXXX-XXXXXXXX-XXXXXXXX"></label>
        </details>
        <p class="license-status" data-l-status role="status"></p>
        <p class="small" data-pp-receipts hidden><button type="button" class="btn" data-pp-portal>${esc(pw('receipts'))}</button></p>
        <div style="display:flex;gap:10px;flex-wrap:wrap">
          <button class="btn btn-ink" value="verify" data-l-verify>${esc(w('verify'))}</button>
          <button class="btn" value="close" formnovalidate>${esc(w('close'))}</button>
        </div>
      </form>`;
    document.body.appendChild(d);
    const status = d.querySelector('[data-l-status]');
    d.querySelector('[data-l-buy]').addEventListener('click', (ev) => {
      // Paddle could not open a moment ago: this button is then the Gumroad link (a new tab), as on every other page
      if (cfg.payDown) return;
      ev.preventDefault();
      buyWithPaddle();
    });
    d.querySelector('[data-l-verify]').addEventListener('click', async (ev) => {
      ev.preventDefault();
      const box = d.querySelector('details.pp-keybox');
      if (box && !box.open) { box.open = true; d.querySelector('input[name=key]').focus(); return; }
      status.dataset.state = ''; status.dataset.lStatus = 'checking'; status.textContent = w('checking');
      const res = await verify(d.querySelector('input[name=key]').value);
      status.dataset.state = res.ok ? 'ok' : 'err'; status.dataset.lStatus = res.ok ? 'active' : 'error'; status.textContent = res.message;
      if (res.ok) setTimeout(() => d.close(), 2000);
    });
    d.querySelector('[data-pp-send]').addEventListener('click', async () => {
      const note = d.querySelector('[data-pp-note]');
      const email = d.querySelector('input[name=pp-email]').value.trim();
      if (!/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(email)) { note.textContent = pw('error'); d.querySelector('input[name=pp-email]').focus(); return; }
      const btn = d.querySelector('[data-pp-send]');
      btn.disabled = true;
      const P = await loadPay();
      const r = P ? await P.restore(email, cfg.pay, pageLang(), location.origin + location.pathname) : 'error';
      btn.disabled = false;
      note.textContent = r === 'sent' ? pw('sent') : pw('error');
    });
    d.querySelector('[data-pp-portal]').addEventListener('click', async () => {
      const rec = store.get(keyName());
      const tab = window.open('', '_blank');
      const P = await loadPay();
      const url = P && rec && rec.key ? await P.portal(rec.key) : null;
      if (url && tab) { try { tab.opener = null; } catch (e) { /* ignore */ } tab.location.href = url; } else if (tab) tab.close();
    });
    return d;
  }

  function open(reason) {
    const d = dialog();
    const buy = d.querySelector('[data-l-buy]');
    if (!cfg.pay || cfg.payDown) {
      buy.href = buyLink();
      if (cfg.pay) { buy.target = '_blank'; buy.textContent = w('buy'); }
    }
    d.querySelector('[data-l-reason]').textContent = reason || cfg.pitch || '';
    const st = d.querySelector('[data-l-status]');
    st.textContent = current() ? w('active') : ''; st.dataset.lStatus = current() ? 'active' : '';
    const receipts = d.querySelector('[data-pp-receipts]');
    if (receipts) { const rec = store.get(keyName()); receipts.hidden = !(current() && rec && rec.src === 'paddle'); }
    if (typeof d.showModal === 'function') d.showModal(); else window.open(buyLink(), '_blank', 'noopener');
  }

  window.PeakLicense = {
    setup(options) {
      cfg = Object.assign({ tool: 'tool', productId: '', permalink: '', buyUrl: '#', pitch: '', strings: null, localMessages: false, checkout: '' }, options);
      if (cfg.checkout !== 'direct' && cfg.checkout !== 'product') {
        const m = document.querySelector('meta[name="peak-checkout"]');
        cfg.checkout = m && m.getAttribute('content') === 'direct' ? 'direct' : 'product';
      }
      cfg.pay = payProduct();
      document.querySelectorAll('[data-buy-pro]').forEach(a => {
        a.href = buyLink(); a.target = '_blank'; a.rel = 'noopener';
        // a Paddle page: the panel on this page (the Gumroad address stays on the link for a browser without scripts)
        if (cfg.pay) a.addEventListener('click', e => { if (cfg.payDown) return; e.preventDefault(); buyWithPaddle(); });
        // a page kept byte for byte as it is live may still say "on Gumroad" on the button: the button says what it does now
        if (cfg.pay && /Gumroad/.test(a.textContent) && a.children.length === 0) {
          a.textContent = a.textContent.replace(/\s+(?:on|en|bei|auf|na|no|sur|su|op|w|via|di)\s+Gumroad\b/i, '').replace(/\s*Gumroad(?:’|')?(?:dan|den|で|에서)\s*/, ' ').replace(/\s{2,}/g, ' ').trim();
        }
      });
      document.querySelectorAll('[data-enter-key]').forEach(b => b.addEventListener('click', e => { e.preventDefault(); open(); }));
      if (cfg.pay) {
        // a link from our e-mail (#pro=<key>): it leaves the address bar at once, then turns Pro on in this browser
        const m = /(?:^#|&)pro=(pp-[st]-[0-9a-z]{26}-[0-9a-f]{24})(?:&|$)/i.exec(location.hash);
        if (m) {
          try { history.replaceState(history.state, '', location.pathname + location.search); } catch (e) { /* ignore */ }
          verify(m[1]).then(res => { open(); const st = document.querySelector('#peak-license-dialog [data-l-status]'); if (st) { st.dataset.state = res.ok ? 'ok' : 'err'; st.dataset.lStatus = res.ok ? 'active' : 'error'; st.textContent = res.message; } });
        }
        // a payment whose Pro was not turned on during the last visit
        try { if (localStorage.getItem(`peak-pay:pending:${cfg.pay}`)) loadPay().then(P => P && P.resume({ product: cfg.pay, onKey: keepPay })); } catch (e) { /* private mode */ }
        // "Get Pro" on a guide page of the tool leads here with #buy-pro: the checkout opens on the tool's page (once)
        if (!m && /^#buy-pro$/.test(location.hash)) {
          try { history.replaceState(history.state, '', location.pathname + location.search); } catch (e) { /* ignore */ }
          if (current()) open(); else buyWithPaddle();
        }
      }
      recheck();
      emit();
    },
    isPro: current,
    checkoutMode() { return (cfg && cfg.checkout) || 'product'; },
    /** The Paddle product this page sells (its <meta name="peak-pay">), or null on a Gumroad page. */
    paddle() { return (cfg && cfg.pay) || null; },
    /** Opens the way to buy: Paddle's panel on a Paddle page, the Pro window elsewhere. */
    buy() { if (cfg && cfg.pay && !cfg.payDown) buyWithPaddle(); else open(); },
    verify,
    open,
    onChange(fn) { listeners.push(fn); if (cfg) fn(current()); },
    requirePro(reason) { if (current()) return true; open(reason); return false; },
    signOut() { store.del(keyName()); emit(); },
  };
})();
