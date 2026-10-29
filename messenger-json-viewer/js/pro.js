// Readback Pro: one payment of $8 on Gumroad, checked with Gumroad's licence API (assets/license.js). The licence check
// sends the product id, never the permalink. Fail closed: while PRODUCT_ID is 'PENDING' Pro never turns on, whatever the
// browser has stored, and the Pro buttons open the Gumroad page and the key dialog only.
export const PRO = {
  productId: 'rzha7mJt4sPKoMg5N1t9Hg==',
  permalink: 'readback-pro',
  url: 'https://dorukctn.gumroad.com/l/readback-pro',
  price: '$8',
};
export const PRO_READY = !!PRO.productId && PRO.productId !== 'PENDING';
export const PRO_PITCH = `Pro saves every chat at once: offline pages with the photos, videos and voice messages beside the messages, every message in one spreadsheet, and every chat as plain text. ${PRO.price}, paid once.`;
