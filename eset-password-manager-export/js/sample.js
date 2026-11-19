// Rekey's ESET sample vault: a made-up export in the layout ESET's own help documents (its 30-column header, every value quoted,
// empty values bare, a double quote written as two) so a visitor can see every step without a file of their own. Every name,
// username and password is invented (they contain "sample"); the card numbers are the public test numbers card networks publish.
import { COLUMNS } from './eset.js';

const cell = v => (v == null || v === '' ? '' : `"${String(v).replace(/"/g, '""')}"`);
const line = cells => cells.join(',');
const header = line(COLUMNS.map(c => `"${c}"`));
// a row from the columns it fills; every other column stays empty
const row = o => line(COLUMNS.map(c => cell(o[c])));
const account = (title, url, username, password, notes = '', favorite = 'false') => row({ modelType: 'Account', modelVersion: '3', title, url, username, password, favorite, notes });

export const SAMPLE_NAME = 'eset-sample-export.csv';
export function sampleCsv() {
  const reused = 'sample-Maple-2019';
  const rows = [
    account('Gmail', 'https://accounts.google.com', 'alex.rivera.sample@gmail.com', 'sample-Harbor-81!', 'Recovery phone: 555-0100', 'true'),
    account('Outlook', 'outlook.live.com', 'arivera.sample@outlook.com', 'sample-Quartz-44'),
    account('Chase', 'https://secure.chase.com', 'arivera_sample', 'sample-Copper-27', 'Online banking and the card.', 'true'),
    account('PayPal', 'paypal.com', 'alex.rivera.sample@gmail.com', 'sample-Cobalt-09'),
    account('Apple ID', 'https://appleid.apple.com', 'alex.rivera.sample@icloud.com', 'sample-Orchard-12', 'Recovery key printed and kept with the passport.'),
    account('Amazon', 'amazon.com', 'alex.rivera.sample@gmail.com', reused),
    account('Netflix', 'netflix.com', 'alex.rivera.sample@gmail.com', reused, 'Shared with the family plan.'),
    account('Target', 'target.com', 'alex.rivera.sample@gmail.com', reused),
    account('GitHub', 'github.com', 'arivera-sample', 'sample-Branch-58', 'Backup codes:\nsample-1111 sample-2222\nsample-3333 sample-4444'),
    account('Reddit', 'reddit.com', 'alexr_sample', 'sample-Pebble-77'),
    account('Discord', 'discord.com', 'alexr_sample', 'sample-Pebble-77'),
    account('Garden forum', 'gardenforum.example.org', 'alexgrows', 'sample,"q",pass', 'Password has a comma and quotes, kept as typed: sample,"q",pass'),
    account('Çiçek Sepeti İstanbul', 'cicek.example.com', 'ğüşiöç.sample@example.com', 'sample-ığüş-Straße', 'Teslimat notu: kapıcıya bırakın.'),
    account('Bank app', 'androidapp://com.example.bank', 'arivera_app', 'sample-Ledger-60', 'Saved from the phone app: no website.'),
    row({ modelType: 'Identity', modelVersion: '1', title: 'Home address', firstName: 'Alex', lastName: 'Rivera', country: 'United States', zip: '10001', city: 'New York', street: '123 Sample Street', street2: 'Apt 4', county: 'New York County', region: 'NY', email: 'alex.rivera.sample@gmail.com', phoneNumber: '555-0100', notes: 'Billing address for the shops.' }),
    row({ modelType: 'Identity', modelVersion: '1', title: 'Work address', firstName: 'Alex', lastName: 'Rivera', company: 'Acme Sample Co', country: 'United States', zip: '94105', city: 'San Francisco', street: '1 Example Plaza', region: 'CA', email: 'arivera@acme.example' }),
    row({ modelType: 'CreditCard', modelVersion: '1', name: 'Alex Rivera', cardName: 'Everyday Visa', number: '4111111111111111', securityCode: '123', pinCode: '0000', type: 'visa', expirationDateMonth: '08', expirationDateYear: '2029', notes: 'Bank: call the number on the back.' }),
    row({ modelType: 'CreditCard', modelVersion: '1', name: 'Alex Rivera', cardName: 'Travel card', number: '5555555555554444', securityCode: '456', type: 'master-card', expirationDateMonth: '11', expirationDateYear: '2028' }),
    row({ modelType: 'Note', modelVersion: '1', title: 'Passport renewal', text: 'Passport expires in 2031.\nRenewal form DS-82; photos from the pharmacy.\n"Expedite" costs extra.', color: '3' }),
    row({ modelType: 'Note', modelVersion: '1', title: 'Wi-Fi at the cabin', text: 'Network: Rivera-Sample-5G\nPassword: sample-Router-66', color: '0' }),
  ];
  return [header, ...rows].join('\r\n') + '\r\n';
}
