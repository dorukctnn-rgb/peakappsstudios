// Rekey's sample vault: a made-up mSecure 6 export (the same layout as a real one, no header row) so a visitor can see every
// step without a file of their own. The names are well-known sites so the change order is visible; every username and
// password is invented (they all contain "sample").
const q = s => (/[",\r\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s);
const f = (label, type, value) => `${label}|${type}|${String(value).replace(/\|/g, '||')}`;
const row = (name, id, type, tag, note, ...fields) => [`${name}|${id}`, type, tag, note, ...fields].map(q).join(',');
const login = (name, id, tag, note, site, user, pw, ...more) => row(name, id, 'Login', tag, note, f('Website', 2, site), f('Username', 7, user), f('Password', 8, pw), ...more);

export const SAMPLE_NAME = 'msecure-sample-export.csv';
export function sampleCsv() {
  const reused = 'sample-Maple-2019';
  const rows = [
    login('Gmail', 410001, 'Personal', '', 'https://accounts.google.com', 'alex.rivera.sample@gmail.com', 'sample-Harbor-81!', f('Recovery phone', 4, '555-0100')),
    login('Outlook', 410002, 'Work', '', 'outlook.live.com', 'arivera.sample@outlook.com', 'sample-Quartz-44'),
    login('Chase', 410003, 'Finance', 'Online banking and the card.', 'https://secure.chase.com', 'arivera_sample', 'sample-Copper-27', f('Security question', 0, 'First car: sample answer'), f('One-time password', 9, 'JBSWY3DPEHPK3PXP')),
    login('PayPal', 410004, 'Finance', '', 'paypal.com', 'alex.rivera.sample@gmail.com', 'sample-Cobalt-09'),
    login('Fidelity', 410005, 'Finance', '', 'https://digital.fidelity.com', 'arivera401k', 'sample-Ledger-60'),
    login('Apple ID', 410006, 'Personal', 'Recovery key printed and kept with the passport.', 'https://appleid.apple.com', 'alex.rivera.sample@icloud.com', 'sample-Orchard-12'),
    login('Amazon', 410007, 'Shopping', '', 'amazon.com', 'alex.rivera.sample@gmail.com', reused),
    login('Verizon', 410008, 'Personal', '', 'verizon.com', '5550100', 'sample-Signal-33', f('Account PIN', 9, '4821')),
    login('GitHub', 410009, 'Work', '', 'github.com', 'arivera-sample', 'sample-Branch-58', f('Backup codes', 0, 'sample-1111 sample-2222 sample-3333')),
    login('Slack', 410010, 'Work', '', 'https://acme-sample.slack.com', 'arivera@acme.example', 'sample-Thread-71'),
    login('Dropbox', 410011, 'Work', '', 'dropbox.com', 'alex.rivera.sample@gmail.com', 'sample-Crate-05'),
    login('Facebook', 410012, 'Social', '', 'facebook.com', 'alex.rivera.sample@gmail.com', 'sample-Porch-90'),
    login('Instagram', 410013, 'Social', '', 'instagram.com', 'alex.r.sample', 'sample-Lens-14'),
    login('Reddit', 410014, 'Social', '', 'reddit.com', 'alexr_sample', 'sample-Pebble-77'),
    login('Discord', 410015, 'Social', '', 'discord.com', 'alexr_sample', 'sample-Pebble-77'),
    login('Netflix', 410016, 'Shopping', 'Shared with the family plan.', 'netflix.com', 'alex.rivera.sample@gmail.com', reused),
    login('Target', 410017, 'Shopping', '', 'target.com', 'alex.rivera.sample@gmail.com', reused),
    login('Garden forum', 410018, 'Unassigned', 'Password has odd characters, kept as typed: pipe, comma, "quotes".', 'gardenforum.example.org', 'alexgrows', 'sample|pipe,"q"', f('Old password', 8, 'sample-old-01')),
    row('Old Yahoo mail', 410019, 'Email Account', 'Personal', '', f('Username', 7, 'arivera.sample@yahoo.com'), f('Password', 8, 'sample-Kettle-38'), f('IMAP server', 0, 'imap.mail.yahoo.com')),
    row('Visa Signature', 410020, 'Credit Card', 'Finance', 'Bank: call the number on the back.', f('Card Number', 12, '4111 1111 1111 1111'), f('Expiration Date', 11, '08/2029'), f('Security Code', 9, '123'), f('Name on Card', 0, 'Alex Rivera'), f('PIN', 9, '0000'), f('Issuing Bank', 0, 'Chase')),
    row('Checking account', 410021, 'Bank Account', 'Finance', '', f('Account Number', 6, '000123456789'), f('Routing Number', 6, '021000021'), f('PIN', 9, '1234'), f('Branch Phone', 4, '555-0199')),
    row('Home Wi-Fi', 410022, 'Wireless Router', 'Personal', '', f('Network Name', 0, 'Rivera-Sample-5G'), f('Password', 8, 'sample-Router-66'), f('Admin URL', 2, 'http://192.168.1.1')),
    row('Passport renewal', 410023, 'Note', 'Personal', 'Passport expires in 2031. Renewal form DS-82; photos from the pharmacy.'),
    row('Software licence', 410024, 'Registration Code', 'Unassigned', '', f('Product', 0, 'Photo editor (sample)'), f('Key', 9, 'SAMPLE-AAAA-BBBB-CCCC')),
  ];
  return rows.join('\r\n') + '\r\n';
}
