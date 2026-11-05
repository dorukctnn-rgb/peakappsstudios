// Rekey Pro: one payment of $8 through Paddle, in the panel on this page (assets/license.js + assets/peak-pay.js; the build adds
// <meta name="peak-pay" content="rekey"> and the Worker peak-pay turns Pro on in this browser after the payment, with a link by
// e-mail for another device). There is no Gumroad product: a Gumroad-style key is never accepted (the product id below matches no
// product), and the Buy link without scripts goes to this page's #buy-pro, which opens the checkout.
export const PRO = {
  productId: 'paddle-only-rekey',
  permalink: 'rekey-pro',
  url: 'https://peakappsstudio.com/msecure-export/#buy-pro',
  price: '$8',
};
export const PRO_PITCH = `Pro gives you the whole change list in order with your ticks kept, every reused password grouped, a Bitwarden and KeePassXC file with cards, notes and extra fields, and a printable sheet of your cards and accounts. ${PRO.price}, paid once.`;
export const FREE_ROWS = 10;
