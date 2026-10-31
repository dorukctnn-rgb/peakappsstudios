// Ficshelf Pro: one payment of $8 on Gumroad, checked with Gumroad's licence API (assets/license.js). The licence check sends the
// product id, never the permalink. Fail closed: while PRODUCT_ID is 'PENDING' Pro never turns on, whatever the browser has stored,
// and the Pro buttons open the Gumroad page and the key dialog only.
export const PRO = {
  productId: 'FEriAOTq7Lbb6Vw12ytaQQ==',
  permalink: 'ficshelf-pro',
  url: 'https://dorukctn.gumroad.com/l/ficshelf-pro',
  price: '$8',
};
export const PRO_READY = !!PRO.productId && PRO.productId !== 'PENDING';
export const PRO_PITCH = `Pro searches inside every fic in your library, merges a series or a selection into one EPUB, sorts the whole library into one tidy ZIP, and saves a catalog as CSV, JSON and a Markdown reading list. ${PRO.price}, paid once.`;
