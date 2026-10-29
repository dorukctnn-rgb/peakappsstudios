// Threadkeep Pro: one payment of $8 on Gumroad, checked with Gumroad's licence API (assets/license.js). The licence check
// sends the product id, never the permalink. Fail closed: while PRODUCT_ID is 'PENDING' Pro never turns on, whatever the
// browser has stored, and the Pro buttons open the Gumroad page and the key dialog only.
export const PRO = {
  productId: 'DXjn6q1G26bio2902MDrTw==',
  permalink: 'threadkeep-pro',
  url: 'https://dorukctn.gumroad.com/l/threadkeep-pro',
  price: '$8',
};
export const PRO_READY = !!PRO.productId && PRO.productId !== 'PENDING';
export const PRO_PITCH = `Pro saves everything at once: every saved post and comment as a bookmarks file for your browser or Raindrop, and the whole export as pages that open offline, Markdown notes and spreadsheets. ${PRO.price}, paid once.`;
