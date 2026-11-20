// Rekey Pro on the C2 Password page: the same product as the mSecure and ESET pages (one payment of $8 through Paddle; the price and
// the number of free change-list rows are read from the engine's pro.js, so they can never differ). The only difference is where the
// checkout link points: at this page, which opens the Paddle panel itself. <meta name="peak-pay" content="rekey"> comes from
// build.mjs, and PeakLicense keeps Pro under the tool name "rekey", so Pro bought on any Rekey page is on for all of them in the same
// browser.
import { PRO as ENGINE_PRO, FREE_ROWS } from '../../msecure-export/js/pro.js';

export const PRO = { ...ENGINE_PRO, url: 'https://peakappsstudio.com/synology-c2-password-export/#buy-pro' };
export const PRO_PITCH = `Pro gives you the Bitwarden and KeePassXC file and the Proton Pass file with your cards, contacts, notes and every extra field, a printable sheet of those items, the whole list of passwords to change while you move, with your ticks kept, and every reused password grouped. ${PRO.price}, paid once.`;
export { FREE_ROWS };
