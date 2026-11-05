// Peelback Pro: one payment of $6 through Paddle, in the panel on this page (assets/license.js + assets/peak-pay.js; the build adds
// <meta name="peak-pay" content="peelback"> and the Worker peak-pay turns Pro on in this browser after the payment, with a link by
// e-mail for another device). There is no Gumroad product: a Gumroad-style key is never accepted (the product id below matches no
// product), and the Buy link without scripts goes to this page's #buy-pro, which opens the checkout. The key is kept by license.js in
// localStorage under "peak-license:peelback".
export const PRO = {
  tool: 'peelback',
  productId: 'paddle-only-peelback',
  permalink: 'peelback-pro',
  url: 'https://peakappsstudio.com/sticky-notes-backup-viewer/#buy-pro',
  price: '$6',
};
export const FREE_FIVE = 5;
export const FREE_RECOVERED = 2;
