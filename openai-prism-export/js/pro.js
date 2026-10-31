// Splitlight Pro: one payment of $8 on Gumroad, checked with Gumroad's licence API (assets/license.js). The licence check
// sends the product id, never the permalink. Fail closed: while PRODUCT_ID is 'PENDING' Pro never turns on, whatever the
// browser has stored, and the Pro buttons open the Gumroad page and the key dialog only.
export const PRO = {
  productId: 'QEBq4CkEkL9l8b_zjQc2Lg==',
  permalink: 'splitlight-pro',
  url: 'https://dorukctn.gumroad.com/l/splitlight-pro',
  price: '$8',
};
export const PRO_READY = !!PRO.productId && PRO.productId !== 'PENDING';
export const PRO_PITCH = `Pro sorts the whole export at once: one ZIP with every project ready for Overleaf (in parts where it needs them), every document as a single .tex, every chat as Markdown and as one page that opens offline, and a spreadsheet of the projects. ${PRO.price}, paid once.`;
