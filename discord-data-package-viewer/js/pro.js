// Agelens Pro: one payment of $8 on Gumroad, checked with Gumroad's licence API (assets/license.js). The licence check
// sends the product id, never the permalink. Fail closed: while PRODUCT_ID is 'PENDING' Pro never turns on, whatever the
// browser has stored, and the Pro buttons open the Gumroad page and the key dialog only.
export const PRO = {
  productId: 'j6sIHLFMYcu1qRAOuoMygg==',
  permalink: 'agelens-pro',
  url: 'https://dorukctn.gumroad.com/l/agelens-pro',
  price: '$8',
};
export const PRO_READY = !!PRO.productId && PRO.productId !== 'PENDING';
export const PRO_PITCH = `Pro saves every conversation at once: one ZIP with a page per conversation that opens offline, the same as text, every message in one spreadsheet and your age report. ${PRO.price}, paid once.`;
