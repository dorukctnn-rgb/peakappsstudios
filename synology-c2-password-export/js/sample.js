// Rekey's C2 Password sample vault: a made-up CSV with the column names Synology's help gives (Display_Name, Login_URLs, ...,
// Others) and the Others text the open-source converters document (Type, Card_*, Secure_Note, ID_*, Bank_*, Driver_*, Router_*,
// Custom), so a visitor can see every step without a file of their own. No real export was available, so this is the documented
// layout, not a copy of one. Every name, username and password is invented (they contain "sample"); the card numbers are the
// public test numbers card networks publish.
import { C2_COLUMNS } from './c2.js';

const q = v => { const s = v == null ? '' : String(v); return /[",\r\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s; };
const line = cells => cells.map(q).join(',');
// a row from the columns it fills; every other column stays empty
const row = o => line(C2_COLUMNS.map(c => (c === 'Others' && o.Others && typeof o.Others === 'object' ? JSON.stringify(o.Others) : o[c])));
// one entry of the Custom list: the value sits under a key named after the entry's own type
const custom = (type, title, value) => ({ Type: type, [`${type}_Title`]: title, [type]: value });
const login = (name, urls, user, pw, notes = '', extra = {}) => row({ Display_Name: name, Login_URLs: urls, Login_Username: user, Login_Password: pw, Notes: notes, Favorite: 'false', ...extra });

export const SAMPLE_NAME = 'c2-password-sample-export.csv';
export function sampleCsv() {
  const reused = 'sample-Maple-2019';
  const rows = [
    login('Gmail', 'https://accounts.google.com', 'alex.rivera.sample@gmail.com', 'sample-Harbor-81!', 'Recovery phone: 555-0100', { Login_TOTP: 'JBSWY3DPEHPK3PXP', Tag: 'Personal', Tag_Color: '1', Favorite: 'true' }),
    login('Outlook', 'outlook.live.com', 'arivera.sample@outlook.com', 'sample-Quartz-44', '', { Tag: 'Work' }),
    login('Chase', 'https://secure.chase.com', 'arivera_sample', 'sample-Copper-27', 'Online banking and the card.', { Tag: 'Finance', Favorite: 'true' }),
    login('PayPal', 'paypal.com', 'alex.rivera.sample@gmail.com', 'sample-Cobalt-09', '', { Tag: 'Finance' }),
    login('Apple ID', 'https://appleid.apple.com', 'alex.rivera.sample@icloud.com', 'sample-Orchard-12', 'Recovery key printed and kept with the passport.', { Tag: 'Personal' }),
    login('Amazon', 'amazon.com', 'alex.rivera.sample@gmail.com', reused),
    login('Netflix', 'netflix.com', 'alex.rivera.sample@gmail.com', reused, 'Shared with the family plan.'),
    login('Target', 'target.com', 'alex.rivera.sample@gmail.com', reused),
    login('GitHub', 'https://github.com/login\nhttps://gist.github.com', 'arivera-sample', 'sample-Branch-58', 'Backup codes:\nsample-1111 sample-2222\nsample-3333 sample-4444', { Tag: 'Work\nCode' }),
    login('Reddit', 'reddit.com', 'alexr_sample', 'sample-Pebble-77'),
    login('Discord', 'discord.com', 'alexr_sample', 'sample-Pebble-77'),
    login('Garden forum', 'gardenforum.example.org', 'alexgrows', 'sample,"q",pass', 'Password has a comma and quotes, kept as typed: sample,"q",pass'),
    login('Çiçek Sepeti İstanbul', 'cicek.example.com', 'ğüşiöç.sample@example.com', 'sample-ığüş-Straße', 'Teslimat notu: kapıcıya bırakın.'),
    login('Bank app', 'androidapp://com.example.bank', 'arivera_app', 'sample-Ledger-60', 'Saved from the phone app: no website.', { Others: { Custom: [custom('Password', 'Phone banking PIN', 'sample-4821'), custom('Text', 'Branch', 'Main Street')] } }),
    row({ Display_Name: 'Everyday Visa', Notes: 'Bank: call the number on the back.', Favorite: 'false', Others: { Type: 'card', Card_Name: 'Alex Rivera', Card_Type: 'visa', Card_Number: '4111 1111 1111 1111', Card_Expiry: '08/29', Card_CVV: '123', Card_PIN: '0000', Card_Phone: '555-0101', Card_URL: 'https://bank.example.com' } }),
    row({ Display_Name: 'Travel card', Favorite: 'false', Others: { Type: 'card', Card_Name: 'Alex Rivera', Card_Type: 'mastercard', Card_Number: '5555555555554444', Card_Expiry: '11/28', Card_CVV: '456' } }),
    row({ Display_Name: 'Passport renewal', Notes: 'Renewal form DS-82; photos from the pharmacy.', Favorite: 'false', Others: { Type: 'secure', Secure_Note: 'Passport expires in 2031.\n"Expedite" costs extra.' } }),
    row({ Display_Name: 'Wi-Fi at the cabin', Favorite: 'false', Tag: 'Home', Others: { Type: 'router', Router_Password: 'sample-Router-66', Secure_Note: 'Network: Rivera-Sample-5G' } }),
    row({ Display_Name: 'National ID', Favorite: 'false', Others: { Type: 'id', ID_First_Name: 'Alex', ID_Last_Name: 'Rivera', ID_Number: 'SAMPLE-123456', ID_Expiry: '2031-06-30' } }),
    row({ Display_Name: 'Checking account', Favorite: 'false', Others: { Type: 'bank', Bank_Name: 'Sample Savings Bank', Bank_Account: '000123456789', Bank_Routing: '021000021', Bank_PIN: '9876' } }),
    row({ Display_Name: 'Driver license', Favorite: 'false', Others: { Type: 'driver', Driver_Number: 'SAMPLE-D-4455', Driver_Expiry: '2030-01-15', Driver_City_Town: 'New York' } }),
  ];
  return [line(C2_COLUMNS), ...rows].join('\r\n') + '\r\n';
}
