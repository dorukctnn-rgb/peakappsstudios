// Decant's sample: a made-up Samsung Pass export written in the layout the open-source decryptors read (see spass.js) and then
// encrypted in this page with a password you can see, so a visitor can try every step, including the password step, without a
// file of their own. The names are well-known sites so the change order is visible; every username and password is invented
// (they all contain "sample"). buildText() is also what the tests use to write a .spass file of their own.
import { encryptSpass, NULL_MARK } from './spass.js';

export const SAMPLE_PASSWORD = 'decant-sample';
export const SAMPLE_NAME = 'sample-export.spass';

const b64 = s => {
  const bytes = new TextEncoder().encode(String(s));
  let bin = '';
  for (const b of bytes) bin += String.fromCharCode(b);
  return btoa(bin);
};
const POS = {
  login: ['id', 'origin_url', 'action_url', 'username_element', 'username_value', 'id_tz_enc', 'password_element', 'password_value', 'pw_tz_enc', 'host_url', 'ssl_valid', 'preferred', 'blacklisted_by_user', 'use_additional_auth', 'cm_api_support', 'created_time', 'modified_time', 'title', 'favicon', 'source_type', 'app_name', 'package_name', 'package_signature', 'reserved_1', 'reserved_2', 'reserved_3', 'reserved_4', 'reserved_5', 'reserved_6', 'reserved_7', 'reserved_8', 'credential_memo', 'otp', 'root_id', 'parent_id'],
  card: ['id', 'card_number_encrypted', 'card_security_code', 'first_six_digit', 'last_four_digit', 'name_on_card', 'expiration_month', 'expiration_year', 'billing_address_id', 'vault_status', 'date_modified', 'reserved_4', 'reserved_5', 'reserved_6', 'is_encrypted'],
  address: ['id', 'full_name', 'company_name', 'street_address', 'city', 'state', 'zipcode', 'country_code', 'phone_number', 'email', 'date_modified', 'reserved_4', 'reserved_5', 'reserved_6'],
  note: ['id', 'note_title', 'note_details', 'date_modified'],
};
const table = (kind, rows, header = true) => {
  const cols = POS[kind];
  const lines = rows.map((r, i) => cols.map(c => {
    if (c === 'id') return b64(String(i + 1));
    const v = r[c];
    return v == null ? b64(NULL_MARK) : b64(v);
  }).join(';'));
  return (header ? [cols.join(';')] : []).concat(lines).join('\n');
};

// kinds: { login: [...], card: [...], address: [...], note: [...] }, each row an object of the columns above (missing = no value)
export function buildText(kinds, { version = 25, header = true } = {}) {
  const k = { login: [], card: [], address: [], note: [], ...kinds };
  const flags = ['login', 'card', 'address', 'note'].map(x => (k[x].length ? 'true' : 'false')).join(';');
  return [String(version), flags, 'false', 'next_table', table('login', k.login, header), 'next_table', table('card', k.card, header), 'next_table', table('address', k.address, header), 'next_table', table('note', k.note, header), ''].join('\n');
}

const T0 = 1704067200000; // 1 Jan 2024
const web = (title, site, user, pw, extra = {}) => ({ title, origin_url: site, host_url: site, username_value: user, password_value: pw, created_time: String(T0), modified_time: String(T0 + 86400000 * (title.length * 7)), ...extra });
const app = (title, pkg, user, pw, extra = {}) => ({ title, origin_url: `android://c2FtcGxlLXNpZw@${pkg}/`, package_name: pkg, app_name: title, username_value: user, password_value: pw, source_type: '1', created_time: String(T0), modified_time: String(T0 + 86400000 * 120), ...extra });

export function sampleRecords() {
  const reused = 'sample-Maple-2019';
  return {
    login: [
      web('Gmail', 'https://accounts.google.com', 'alex.rivera.sample@gmail.com', 'sample-Harbor-81!'),
      web('Outlook', 'https://outlook.live.com', 'arivera.sample@outlook.com', 'sample-Quartz-44'),
      web('Chase', 'https://secure.chase.com', 'arivera_sample', 'sample-Copper-27', { credential_memo: 'Online banking and the card.', otp: 'JBSWY3DPEHPK3PXP' }),
      web('PayPal', 'https://www.paypal.com', 'alex.rivera.sample@gmail.com', 'sample-Cobalt-09'),
      web('Fidelity', 'https://digital.fidelity.com', 'arivera401k', 'sample-Ledger-60'),
      web('Apple ID', 'https://appleid.apple.com', 'alex.rivera.sample@icloud.com', 'sample-Orchard-12'),
      web('Amazon', 'https://www.amazon.com', 'alex.rivera.sample@gmail.com', reused),
      web('Verizon', 'https://www.verizon.com', '5550100', 'sample-Signal-33'),
      web('GitHub', 'https://github.com', 'arivera-sample', 'sample-Branch-58', { credential_memo: 'Backup codes on paper.' }),
      web('Slack', 'https://acme-sample.slack.com', 'arivera@acme.example', 'sample-Thread-71'),
      web('Dropbox', 'https://www.dropbox.com', 'alex.rivera.sample@gmail.com', 'sample-Crate-05'),
      web('Facebook', 'https://www.facebook.com', 'alex.rivera.sample@gmail.com', 'sample-Porch-90'),
      web('Reddit', 'https://www.reddit.com', 'alexr_sample', 'sample-Pebble-77'),
      web('Netflix', 'https://www.netflix.com', 'alex.rivera.sample@gmail.com', reused),
      web('Target', 'https://www.target.com', 'alex.rivera.sample@gmail.com', reused),
      web('Garden forum', 'https://gardenforum.example.org', 'alexgrows', 'sample;semi,"q"|pipe', { credential_memo: 'Password has odd characters, kept as typed.' }),
      app('Instagram', 'com.instagram.android', 'alex.r.sample', 'sample-Lens-14'),
      app('Discord', 'com.discord', 'alexr_sample', 'sample-Pebble-77'),
      app('Pocket Budget (sample app)', 'com.example.pocketbudget', 'alex.rivera.sample@gmail.com', 'sample-Wallet-52'),
    ],
    card: [
      { card_number_encrypted: '4111111111111111', card_security_code: '123', first_six_digit: '411111', last_four_digit: '1111', name_on_card: 'Alex Rivera', expiration_month: '8', expiration_year: '2029', date_modified: String(T0), is_encrypted: 'false' },
    ],
    address: [
      { full_name: 'Alex Rivera', street_address: '12 Sample Street', city: 'Springfield', state: 'IL', zipcode: '62701', country_code: 'US', phone_number: '555-0100', email: 'alex.rivera.sample@gmail.com', date_modified: String(T0) },
    ],
    note: [
      { note_title: 'Passport renewal', note_details: 'Passport expires in 2031. Renewal form DS-82; photos from the pharmacy.', date_modified: String(T0) },
    ],
  };
}
export const sampleText = () => buildText(sampleRecords());
export async function sampleSpass() { return encryptSpass(sampleText(), SAMPLE_PASSWORD); }
