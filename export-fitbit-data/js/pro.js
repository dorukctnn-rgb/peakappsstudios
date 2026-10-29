// Tallyband Pro: one payment of $8 on Gumroad, checked with Gumroad's licence API (assets/license.js). The licence check
// sends the product id, never the permalink. Fail closed: while PRODUCT_ID is 'PENDING' Pro never turns on, whatever the
// browser has stored, and the Pro buttons open the Gumroad page and the key dialog only.
export const PRO = {
  productId: 'KGjtPSHrh010vTyFNGQZ2w==',
  permalink: 'tallyband-pro',
  url: 'https://dorukctn.gumroad.com/l/tallyband-pro',
  price: '$8',
};
export const PRO_READY = !!PRO.productId && PRO.productId !== 'PENDING';
export const PRO_PITCH = `Pro saves everything for your dates at once: one Excel file with a sheet for each kind of data, or every table as a CSV file in one ZIP, plus every heart-rate reading, steps minute by minute and each sleep stage. ${PRO.price}, paid once.`;
