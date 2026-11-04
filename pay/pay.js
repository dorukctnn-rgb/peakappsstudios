// The default payment link of the Paddle account (Paddle > Checkout > Checkout settings): links in Paddle's e-mails and in ours
// carry ?_ptxn=<transaction id>, and Paddle.js opens that transaction's checkout here, inline, on a light frame (the page does not
// go dark). The client-side token is public by design: it can only open checkouts. Nothing else runs on this page.
(function () {
  var TOKEN = 'live_7273f3e4d46b260ceebea0a0dce';
  var status = document.getElementById('pay-status');
  function say(text, tone) { status.textContent = text; if (tone) status.setAttribute('data-tone', tone); else status.removeAttribute('data-tone'); }
  var txn = new URLSearchParams(location.search).get('_ptxn') || '';
  if (!/^txn_[0-9a-z]{26}$/.test(txn)) {
    say('This link has no payment in it. Open the link from the e-mail again, or write to us and we will send a new one.', 'warn');
    return;
  }
  if (!window.Paddle) { say('The secure checkout could not load. Check your connection, turn off a blocker for this page, and reload.', 'warn'); return; }
  try {
    window.Paddle.Initialize({
      token: TOKEN,
      checkout: { settings: { displayMode: 'inline', variant: 'one-page', frameTarget: 'pay-frame', frameInitialHeight: 450, frameStyle: 'width:100%;min-width:286px;background-color:transparent;border:none;', theme: 'light', allowLogout: false } },
      eventCallback: function (e) {
        var n = e && e.name;
        if (n === 'checkout.loaded') say('Check the details below and finish the payment.');
        else if (n === 'checkout.payment.initiated') say('Your payment is going through. Keep this page open.');
        else if (n === 'checkout.payment.failed' || n === 'checkout.payment.error') say('The payment did not go through, so nothing was charged. You can try again or use another way to pay.', 'warn');
        else if (n === 'checkout.completed') say('Done. Paddle has e-mailed your receipt. You can close this page.', 'ok');
        else if (n === 'checkout.error') say('This payment link has expired or was already used. Write to info@peakappsstudio.com and we will send a new one.', 'warn');
      },
    });
  } catch (err) {
    say('The secure checkout could not load. Reload the page to try again.', 'warn');
  }
})();
