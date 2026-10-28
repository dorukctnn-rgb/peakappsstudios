// Cubby Pro: one payment of $8 on Gumroad, checked with Gumroad's licence API (assets/license.js). The licence check
// sends the product id, never the permalink. Fail closed: while PRODUCT_ID is 'PENDING' Pro never turns on, whatever the
// browser has stored, and the Pro buttons open the Gumroad page and the key dialog only.
export const PRO = {
  productId: 'F1jDop1kgaY2rTtoBhkkCQ==',
  permalink: 'cubby-pro',
  url: 'https://dorukctn.gumroad.com/l/cubby-pro',
  price: '$8',
};
export const PRO_READY = !!PRO.productId && PRO.productId !== 'PENDING';
export const PRO_PITCH = `Pro saves the whole course at once: every page, assignment and quiz in one file to read offline or print as a PDF, every quiz as a Word file with an answer key, every question in a spreadsheet and in Moodle's import format, and all the course files in one ZIP. ${PRO.price}, paid once.`;
