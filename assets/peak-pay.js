/* Paddle checkout for Peak Apps Tools (pay-worker/, the Worker "peak-pay"). license.js loads this file only on a page that
 * carries <meta name="peak-pay" content="<product>"> (the build adds it to the tools sold through Paddle), and only when it is
 * needed: a Buy button pressed, a link from our e-mail opened, or a payment whose Pro was not turned on yet.
 *
 *   PeakPay.open({ product, lang, page, onKey })   the checkout, inline in a light panel on this page (the page never goes dark)
 *   PeakPay.resume({ product, onKey })             finishes a payment whose Pro was not turned on during the last visit
 *   PeakPay.status(key, product)                   what Paddle says now about a key -> { ok, plan } | { ok: false, code }
 *   PeakPay.restore(email, product, lang, page)    e-mails the Pro link of that address's purchase -> 'sent' | 'error'
 *   PeakPay.portal(key)                            Paddle's page with the receipts of that purchase -> url | null
 *
 * After the payment, the transaction id goes to the Worker, which asks Paddle and answers with a Pro key; license.js keeps it,
 * so Pro is on with nothing to type. Paddle e-mails the receipt, and the Worker e-mails one link for other devices.
 */
(function () {
  if (window.PeakPay) return;
  var WORKER = 'https://peak-pay.railer-iot.workers.dev';
  var PADDLE_JS = 'https://cdn.paddle.com/paddle/v2/paddle.js';
  var REFUND = '/legal/refund/';
  var KEY_RE = /^pp-[st]-[0-9a-z]{26}-[0-9a-f]{24}$/i;
  var PENDING = function (product) { return 'peak-pay:pending:' + product; };

  // The words of the panel, in the languages the tools are written in (the page's lang attribute picks one).
  var WORDS = {
    en: { brand: 'Peak Apps Studio', close: 'Close', loading: 'Opening the secure checkout.', processing: 'Your payment is going through. Keep this page open.', activating: 'Payment received. Turning Pro on.', done: 'Pro is on in this browser. Thank you.', receipt: 'Paddle has e-mailed your receipt, and we sent a link for your other devices.', failed: 'The payment did not go through, so nothing was charged. You can try again or use another way to pay.', error: 'The checkout could not load. Check your connection and try again.', slow: 'Your payment went through. Pro turns on as soon as the connection allows; the link in our e-mail also turns it on.', doneCta: 'Continue', tax: 'Taxes included', taxAmount: 'Includes {tax} tax', once: 'One payment, no subscription', trust: 'Secure checkout by Paddle', refund: 'Refund policy' },
    de: { brand: 'Peak Apps Studio', close: 'Schließen', loading: 'Die sichere Zahlung wird geöffnet.', processing: 'Deine Zahlung wird verarbeitet. Lass diese Seite offen.', activating: 'Zahlung erhalten. Pro wird eingeschaltet.', done: 'Pro ist in diesem Browser an. Danke.', receipt: 'Paddle hat dir die Quittung geschickt, und wir haben dir einen Link für deine anderen Geräte gesendet.', failed: 'Die Zahlung hat nicht geklappt, es wurde nichts abgebucht. Versuch es noch einmal oder wähle eine andere Zahlungsart.', error: 'Die Zahlung konnte nicht geladen werden. Prüfe deine Verbindung und versuch es noch einmal.', slow: 'Deine Zahlung ist eingegangen. Pro geht an, sobald die Verbindung es erlaubt; auch der Link in unserer E-Mail schaltet es ein.', doneCta: 'Weiter', tax: 'Inklusive Steuern', taxAmount: 'Enthält {tax} Steuern', once: 'Einmalzahlung, kein Abo', trust: 'Sichere Zahlung über Paddle', refund: 'Erstattung' },
    es: { brand: 'Peak Apps Studio', close: 'Cerrar', loading: 'Abriendo el pago seguro.', processing: 'Tu pago se está procesando. Mantén esta página abierta.', activating: 'Pago recibido. Activando Pro.', done: 'Pro está activo en este navegador. Gracias.', receipt: 'Paddle te ha enviado el recibo y nosotros un enlace para tus otros dispositivos.', failed: 'El pago no se completó, así que no se cobró nada. Puedes intentarlo de nuevo o usar otro medio de pago.', error: 'No se pudo cargar el pago. Revisa tu conexión e inténtalo de nuevo.', slow: 'Tu pago se completó. Pro se activará en cuanto la conexión lo permita; el enlace de nuestro correo también lo activa.', doneCta: 'Continuar', tax: 'Impuestos incluidos', taxAmount: 'Incluye {tax} de impuestos', once: 'Pago único, sin suscripción', trust: 'Pago seguro con Paddle', refund: 'Reembolsos' },
    fr: { brand: 'Peak Apps Studio', close: 'Fermer', loading: 'Ouverture du paiement sécurisé.', processing: 'Votre paiement est en cours. Gardez cette page ouverte.', activating: 'Paiement reçu. Activation de Pro.', done: 'Pro est actif dans ce navigateur. Merci.', receipt: 'Paddle vous a envoyé le reçu, et nous un lien pour vos autres appareils.', failed: 'Le paiement n’a pas abouti, rien n’a été prélevé. Réessayez ou choisissez un autre moyen de paiement.', error: 'Le paiement n’a pas pu se charger. Vérifiez votre connexion et réessayez.', slow: 'Votre paiement est passé. Pro s’activera dès que la connexion le permettra ; le lien de notre e-mail l’active aussi.', doneCta: 'Continuer', tax: 'Taxes comprises', taxAmount: 'Dont {tax} de taxes', once: 'Paiement unique, sans abonnement', trust: 'Paiement sécurisé par Paddle', refund: 'Remboursements' },
    it: { brand: 'Peak Apps Studio', close: 'Chiudi', loading: 'Apertura del pagamento sicuro.', processing: 'Il pagamento è in corso. Tieni aperta questa pagina.', activating: 'Pagamento ricevuto. Attivazione di Pro.', done: 'Pro è attivo in questo browser. Grazie.', receipt: 'Paddle ti ha inviato la ricevuta e noi un link per gli altri dispositivi.', failed: 'Il pagamento non è andato a buon fine, non è stato addebitato nulla. Riprova o usa un altro metodo.', error: 'Il pagamento non si è caricato. Controlla la connessione e riprova.', slow: 'Il pagamento è andato a buon fine. Pro si attiverà appena la connessione lo permette; anche il link nella nostra e-mail lo attiva.', doneCta: 'Continua', tax: 'Tasse incluse', taxAmount: 'Include {tax} di tasse', once: 'Pagamento unico, nessun abbonamento', trust: 'Pagamento sicuro con Paddle', refund: 'Rimborsi' },
    nl: { brand: 'Peak Apps Studio', close: 'Sluiten', loading: 'De beveiligde betaling wordt geopend.', processing: 'Je betaling wordt verwerkt. Houd deze pagina open.', activating: 'Betaling ontvangen. Pro wordt aangezet.', done: 'Pro staat aan in deze browser. Bedankt.', receipt: 'Paddle heeft je de bon gemaild, en wij een link voor je andere apparaten.', failed: 'De betaling is niet gelukt, er is niets afgeschreven. Probeer het opnieuw of kies een andere betaalmethode.', error: 'De betaling kon niet laden. Controleer je verbinding en probeer het opnieuw.', slow: 'Je betaling is gelukt. Pro gaat aan zodra de verbinding het toelaat; de link in onze e-mail zet het ook aan.', doneCta: 'Verder', tax: 'Inclusief belasting', taxAmount: 'Inclusief {tax} belasting', once: 'Eenmalige betaling, geen abonnement', trust: 'Veilig betalen via Paddle', refund: 'Terugbetaling' },
    pt: { brand: 'Peak Apps Studio', close: 'Fechar', loading: 'Abrindo o pagamento seguro.', processing: 'Seu pagamento está sendo processado. Mantenha esta página aberta.', activating: 'Pagamento recebido. Ativando o Pro.', done: 'O Pro está ativo neste navegador. Obrigado.', receipt: 'A Paddle enviou o recibo por e-mail, e nós um link para seus outros aparelhos.', failed: 'O pagamento não foi concluído, nada foi cobrado. Tente de novo ou use outra forma de pagamento.', error: 'O pagamento não carregou. Verifique a conexão e tente de novo.', slow: 'Seu pagamento foi concluído. O Pro será ativado assim que a conexão permitir; o link do nosso e-mail também o ativa.', doneCta: 'Continuar', tax: 'Impostos incluídos', taxAmount: 'Inclui {tax} de impostos', once: 'Pagamento único, sem assinatura', trust: 'Pagamento seguro pela Paddle', refund: 'Reembolsos' },
    tr: { brand: 'Peak Apps Studio', close: 'Kapat', loading: 'Güvenli ödeme sayfası açılıyor.', processing: 'Ödemen işleniyor. Bu sayfayı açık tut.', activating: 'Ödeme alındı. Pro açılıyor.', done: 'Pro bu tarayıcıda açıldı. Teşekkürler.', receipt: 'Paddle makbuzunu e-postayla gönderdi; diğer cihazların için de bir bağlantı yolladık.', failed: 'Ödeme gerçekleşmedi, hiçbir ücret alınmadı. Tekrar deneyebilir ya da başka bir ödeme yolu seçebilirsin.', error: 'Ödeme sayfası yüklenemedi. Bağlantını kontrol edip tekrar dene.', slow: 'Ödemen alındı. Bağlantı elverince Pro kendiliğinden açılacak; e-postamızdaki bağlantı da açar.', doneCta: 'Devam et', tax: 'Vergiler dahil', taxAmount: '{tax} vergi dahil', once: 'Tek ödeme, abonelik yok', trust: 'Paddle ile güvenli ödeme', refund: 'İade koşulları' },
    id: { brand: 'Peak Apps Studio', close: 'Tutup', loading: 'Membuka pembayaran aman.', processing: 'Pembayaranmu sedang diproses. Biarkan halaman ini terbuka.', activating: 'Pembayaran diterima. Mengaktifkan Pro.', done: 'Pro aktif di browser ini. Terima kasih.', receipt: 'Paddle telah mengirim tanda terima, dan kami mengirim tautan untuk perangkat lain.', failed: 'Pembayaran tidak berhasil, tidak ada yang ditagih. Coba lagi atau pakai cara bayar lain.', error: 'Pembayaran tidak dapat dimuat. Periksa koneksi dan coba lagi.', slow: 'Pembayaranmu berhasil. Pro aktif begitu koneksi memungkinkan; tautan di e-mail kami juga mengaktifkannya.', doneCta: 'Lanjut', tax: 'Termasuk pajak', taxAmount: 'Termasuk pajak {tax}', once: 'Sekali bayar, tanpa langganan', trust: 'Pembayaran aman lewat Paddle', refund: 'Pengembalian dana' },
    ja: { brand: 'Peak Apps Studio', close: '閉じる', loading: '安全な決済画面を開いています。', processing: 'お支払いを処理しています。このページを開いたままにしてください。', activating: 'お支払いを受け付けました。Pro を有効にしています。', done: 'このブラウザで Pro が有効になりました。ありがとうございます。', receipt: 'Paddle から領収書をメールで送りました。ほかの端末用のリンクも送信しました。', failed: 'お支払いは完了せず、請求もされていません。もう一度お試しいただくか、別の支払い方法をお選びください。', error: '決済画面を読み込めませんでした。接続を確認してもう一度お試しください。', slow: 'お支払いは完了しました。接続が戻りしだい Pro が有効になります。メールのリンクからも有効にできます。', doneCta: '続ける', tax: '税込み', taxAmount: '税 {tax} を含む', once: '1回払い、サブスクリプションなし', trust: 'Paddle による安全な決済', refund: '返金について' },
    ko: { brand: 'Peak Apps Studio', close: '닫기', loading: '안전한 결제 화면을 여는 중입니다.', processing: '결제를 처리하고 있습니다. 이 페이지를 열어 두세요.', activating: '결제가 완료되었습니다. Pro를 켜는 중입니다.', done: '이 브라우저에서 Pro가 켜졌습니다. 감사합니다.', receipt: 'Paddle이 영수증을 이메일로 보냈고, 다른 기기용 링크도 보내드렸습니다.', failed: '결제가 완료되지 않아 청구되지 않았습니다. 다시 시도하거나 다른 결제 수단을 사용하세요.', error: '결제 화면을 불러오지 못했습니다. 연결을 확인하고 다시 시도하세요.', slow: '결제가 완료되었습니다. 연결되는 대로 Pro가 켜집니다. 이메일의 링크로도 켤 수 있습니다.', doneCta: '계속', tax: '세금 포함', taxAmount: '세금 {tax} 포함', once: '1회 결제, 구독 없음', trust: 'Paddle 안전 결제', refund: '환불 정책' },
    pl: { brand: 'Peak Apps Studio', close: 'Zamknij', loading: 'Otwieranie bezpiecznej płatności.', processing: 'Płatność jest przetwarzana. Nie zamykaj tej strony.', activating: 'Płatność przyjęta. Włączanie Pro.', done: 'Pro działa w tej przeglądarce. Dziękujemy.', receipt: 'Paddle wysłał rachunek e-mailem, a my link do innych urządzeń.', failed: 'Płatność się nie powiodła, nic nie pobrano. Spróbuj ponownie lub wybierz inną metodę.', error: 'Nie udało się wczytać płatności. Sprawdź połączenie i spróbuj ponownie.', slow: 'Płatność się udała. Pro włączy się, gdy pozwoli na to połączenie; link z naszego e-maila też je włącza.', doneCta: 'Dalej', tax: 'Podatki wliczone', taxAmount: 'Zawiera {tax} podatku', once: 'Jedna płatność, bez subskrypcji', trust: 'Bezpieczna płatność przez Paddle', refund: 'Zwroty' },
  };
  var LOCALES = { en: 'en', de: 'de', es: 'es', fr: 'fr', it: 'it', nl: 'nl', pt: 'pt', tr: 'tr', id: 'en', ja: 'ja', ko: 'ko', pl: 'pl' };
  function langOf(l) { var b = String(l || document.documentElement.lang || 'en').toLowerCase().split(/[-_]/)[0]; return WORDS[b] ? b : 'en'; }

  var store = {
    get: function (k) { try { return localStorage.getItem(k); } catch (e) { return null; } },
    set: function (k, v) { try { localStorage.setItem(k, v); } catch (e) { /* private mode */ } },
    del: function (k) { try { localStorage.removeItem(k); } catch (e) { /* ignore */ } },
  };
  function post(path, body) {
    return fetch(WORKER + path, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) })
      .then(function (r) { return r.json().catch(function () { return {}; }).then(function (j) { return { status: r.status, body: j }; }); })
      .catch(function () { return null; });
  }
  var configs = {};
  function config(product) {
    if (configs[product]) return configs[product];
    configs[product] = fetch(WORKER + '/v1/config?product=' + encodeURIComponent(product)).then(function (r) { return r.ok ? r.json() : null; }).catch(function () { return null; })
      .then(function (c) { if (!c) delete configs[product]; return c; });
    return configs[product];
  }
  var paddleScript = null;
  function loadPaddle() {
    if (window.Paddle) return Promise.resolve(window.Paddle);
    if (paddleScript) return paddleScript;
    paddleScript = new Promise(function (resolve) {
      var s = document.createElement('script');
      s.src = PADDLE_JS; s.async = true;
      var t = setTimeout(function () { resolve(null); }, 15000);
      s.onload = function () { clearTimeout(t); resolve(window.Paddle || null); };
      s.onerror = function () { clearTimeout(t); paddleScript = null; resolve(null); };
      document.head.appendChild(s);
    });
    return paddleScript;
  }
  function loadCss() {
    if (document.querySelector('link[data-peak-pay]')) return;
    var l = document.createElement('link');
    l.rel = 'stylesheet'; l.href = '/assets/peak-pay.css'; l.setAttribute('data-peak-pay', '');
    document.head.appendChild(l);
  }
  var esc = function (s) { return String(s).replace(/[&<>"]/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]; }); };

  // ───────── the panel ─────────
  var state = { phase: 'idle', dialog: null, o: null, w: WORDS.en, initialized: false };
  function $(sel) { return state.dialog ? state.dialog.querySelector(sel) : null; }
  function say(text, tone) { var el = $('[data-pp-status]'); if (!el) return; el.textContent = text; el.hidden = !text; if (tone) el.setAttribute('data-tone', tone); else el.removeAttribute('data-tone'); }
  function busy(on) { var b = $('[data-pp-close]'); if (b) b.disabled = on; }

  function build(o, name) {
    var w = state.w;
    var d = document.createElement('dialog');
    d.className = 'pp-sheet';
    d.setAttribute('aria-labelledby', 'pp-title');
    d.innerHTML = '<div class="pp-head"><div class="pp-what"><p class="pp-brand" lang="en">' + esc(w.brand) + '</p><h2 id="pp-title">' + esc(name) + '</h2></div>' +
      '<button type="button" class="pp-close" data-pp-close aria-label="' + esc(w.close) + '"><svg viewBox="0 0 24 24" width="20" height="20" aria-hidden="true"><path d="M6 6l12 12M18 6L6 18" stroke="currentColor" stroke-width="2" stroke-linecap="round"/></svg></button></div>' +
      '<p class="pp-price"><strong data-pp-total></strong> <span class="pp-tax" data-pp-tax>' + esc(w.tax) + '</span></p>' +
      '<p class="pp-trust"><svg viewBox="0 0 24 24" width="16" height="16" aria-hidden="true"><rect x="5" y="11" width="14" height="10" rx="2" fill="none" stroke="currentColor" stroke-width="2"/><path d="M8 11V8a4 4 0 0 1 8 0v3" fill="none" stroke="currentColor" stroke-width="2"/></svg><span>' + esc(w.trust) + ' · ' + esc(w.once) + ' · <a href="' + REFUND + '" target="_blank" rel="noopener">' + esc(w.refund) + '</a></span></p>' +
      '<p class="pp-status" data-pp-status role="status" aria-live="polite">' + esc(w.loading) + '</p>' +
      '<div class="pp-frame" data-pp-frame></div>' +
      '<div class="pp-done" data-pp-done hidden><button type="button" class="pp-btn" data-pp-finish>' + esc(w.doneCta) + '</button></div>';
    d.querySelector('[data-pp-close]').addEventListener('click', close);
    d.querySelector('[data-pp-finish]').addEventListener('click', close);
    d.addEventListener('cancel', function (e) { e.preventDefault(); close(); });
    document.body.appendChild(d);
    return d;
  }
  function money(n, cur) {
    var v = typeof n === 'string' ? Number(n) : n;
    if (v === undefined || v === null || !isFinite(v) || !cur) return null;
    try { return new Intl.NumberFormat(document.documentElement.lang || 'en', { style: 'currency', currency: cur }).format(v); } catch (e) { return null; }
  }
  function totals(data) {
    var t = data && data.totals;
    var total = t && money(t.total, data.currency_code);
    var el = $('[data-pp-total]');
    if (el && total) el.textContent = total;
    var tax = t ? Number(t.tax || 0) : 0;
    var tx = $('[data-pp-tax]');
    if (tx) tx.textContent = tax > 0 ? state.w.taxAmount.replace('{tax}', money(tax, data.currency_code) || '') : state.w.tax;
  }

  function claim(txn, product, onKey, interactive) {
    store.set(PENDING(product), txn);
    var i = 0;
    return new Promise(function (resolve) {
      function next() {
        post('/v1/claim', { txn: txn, product: product }).then(function (a) {
          if (a && a.status === 200 && KEY_RE.test(a.body.key || '')) {
            store.del(PENDING(product));
            try { onKey(a.body.key, a.body.plan); } catch (e) { console.error(e); }
            if (interactive) { say(state.w.done + ' ' + state.w.receipt, 'ok'); var dn = $('[data-pp-done]'); if (dn) dn.hidden = false; var f = $('[data-pp-finish]'); if (f) f.focus(); }
            return resolve(true);
          }
          // try again: no answer, a server or limit answer, or Paddle still finishing the payment; anything else is final
          var again = !a || a.status >= 500 || a.status === 429 || (a.status === 404 && a.body.pending === true);
          if (again && ++i < 20) return setTimeout(next, Math.min(1500 * (1 + i / 4), 6000));
          if (!again) store.del(PENDING(product));            // kept only while trying again later can still help
          if (interactive) say(state.w.slow, 'warn');
          resolve(false);
        });
      }
      next();
    });
  }

  function onEvent(e) {
    var n = e && e.name, data = (e && e.data) || {};
    var o = state.o;
    if (n === 'checkout.loaded') { state.phase = 'ready'; say(''); totals(data); }
    else if (/^checkout\.(updated|items\.updated|discount\.(applied|removed)|customer\.(created|updated))$/.test(n)) totals(data);
    else if (n === 'checkout.payment.initiated') { state.phase = 'paying'; busy(true); say(state.w.processing); }
    else if (n === 'checkout.payment.failed' || n === 'checkout.payment.error') { state.phase = 'ready'; busy(false); say(state.w.failed, 'warn'); }
    else if (n === 'checkout.error') { if (state.phase === 'loading') { state.phase = 'ready'; say(state.w.error, 'warn'); } }
    else if (n === 'checkout.completed' && o && data.transaction_id && state.phase !== 'claiming' && state.phase !== 'done') {
      state.phase = 'claiming'; busy(true); say(state.w.activating);
      claim(data.transaction_id, o.product, o.onKey, true).then(function () { state.phase = 'done'; busy(false); });
    }
  }

  function close() {
    if (state.phase === 'paying' || state.phase === 'claiming') return;
    try { if (state.phase !== 'idle' && window.Paddle) window.Paddle.Checkout.close(); } catch (e) { /* gone */ }
    state.phase = 'idle';
    var d = state.dialog;
    state.dialog = null;
    if (d) { if (d.open) d.close(); d.remove(); }
    if (state.o && state.o.onClose) try { state.o.onClose(); } catch (e) { /* ignore */ }
  }

  /** Resolves true when the panel opened; false when Paddle cannot be used here now (the caller then offers the old link). */
  function open(o) {
    var lang = langOf(o.lang);
    state.w = WORDS[lang];
    loadCss();
    return Promise.all([config(o.product), loadPaddle()]).then(function (r) {
      var cfg = r[0], paddle = r[1];
      var plan = o.plan || 'lifetime';
      var priceId = cfg && cfg.prices && cfg.prices[plan];
      if (!cfg || !priceId || !paddle) return false;
      try {
        if (!state.initialized) {
          if (cfg.environment === 'sandbox' && paddle.Environment) paddle.Environment.set('sandbox');
          paddle.Initialize({ token: cfg.token, eventCallback: onEvent });
          state.initialized = true;
        }
      } catch (e) { return false; }
      close();
      state.o = o;
      state.phase = 'loading';
      state.dialog = build(o, cfg.name);
      if (typeof state.dialog.showModal === 'function') state.dialog.showModal(); else state.dialog.setAttribute('open', '');
      var dark = window.matchMedia && window.matchMedia('(prefers-color-scheme: dark)').matches;
      try {
        paddle.Checkout.open({
          items: [{ priceId: priceId, quantity: 1 }],
          customData: { product: o.product, lang: lang, page: o.page || (location.origin + location.pathname) },
          settings: { displayMode: 'inline', variant: 'one-page', frameTarget: 'pp-frame', frameInitialHeight: 450, frameStyle: 'width:100%;min-width:286px;background-color:transparent;border:none;', locale: LOCALES[lang] || 'en', theme: dark ? 'dark' : 'light', allowLogout: true, showAddDiscounts: true },
        });
      } catch (e) { state.phase = 'idle'; close(); return false; }
      return true;
    });
  }

  window.PeakPay = {
    WORKER: WORKER,
    KEY_RE: KEY_RE,
    open: open,
    close: close,
    resume: function (o) { var t = store.get(PENDING(o.product)); return /^txn_[0-9a-z]{26}$/.test(t || '') ? claim(t, o.product, o.onKey, false) : Promise.resolve(false); },
    status: function (key, product) {
      return post('/v1/status', { key: key, product: product }).then(function (a) {
        if (!a || a.status >= 500 || a.status === 429) return { ok: false, code: 'network' };
        if (a.status === 200 && a.body.ok) return { ok: true, plan: a.body.plan };
        return { ok: false, code: a.body.error || 'not_found' };
      });
    },
    restore: function (email, product, lang, page) {
      return post('/v1/restore', { email: String(email || '').trim(), product: product, lang: langOf(lang), page: page || (location.origin + location.pathname) })
        .then(function (a) { return a && a.status === 200 ? 'sent' : 'error'; });
    },
    portal: function (key) {
      return post('/v1/portal', { key: key }).then(function (a) {
        var u = a && a.status === 200 && a.body.url;
        return typeof u === 'string' && /^https:\/\/([a-z0-9-]+\.)*paddle\.com\//.test(u) ? u : null;
      });
    },
  };
})();
