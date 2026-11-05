// Decant: the order to change passwords in while you move to a new manager. It is the ranking Rekey uses after a password manager incident:
// primary e-mail, money, work and account-recovery logins first (whoever holds your e-mail can reset everything else), and inside each
// group a password used on several logins first (one leaked password opens all of them). Decided here from the file; nothing is looked up online.
export const OTP_LABEL = /(one[- ]?time|\botp\b|\b2fa\b|two[- ]?factor|totp|authenticator|verification code|backup codes?|recovery codes?|mfa)/i;

export const GROUPS = [
  { id: 'email', name: 'E-mail and account recovery', why: 'Whoever holds your e-mail can reset the password of almost every other account.' },
  { id: 'money', name: 'Money', why: 'Banks, cards, payments, investing and tax: direct loss if someone gets in.' },
  { id: 'core', name: 'Phone, Apple, Google, Microsoft, Amazon', why: 'These accounts hold other logins, devices, stored cards or your phone number.' },
  { id: 'work', name: 'Work and files', why: 'Work tools, code and cloud storage.' },
  { id: 'social', name: 'Social and messages', why: 'Your name in front of other people; often used to scam your contacts.' },
  { id: 'rest', name: 'Everything else', why: 'Shops, subscriptions, forums and the rest.' },
];

// a host matches a domain when it is that domain or one of its subdomains (secure.chase.com is chase.com)
const domains = list => h => list.some(d => h === d || h.endsWith('.' + d));
// a host matches a word when the word is anywhere in it (onlinebanking.example.com has "bank")
const words = list => h => list.some(w => h.includes(w));
const any = (...tests) => h => tests.some(t => t(h));
// whole words in a name, a record type or a tag ("tax" in "Tax return", not in "Syntax")
const wordsIn = list => new RegExp('(^|[^a-z])(' + list.join('|') + ')([^a-z]|$)');

const RULES = [
  ['email', domains(['gmail.com', 'googlemail.com', 'outlook.com', 'hotmail.com', 'live.com', 'msn.com', 'yahoo.com', 'ymail.com', 'aol.com', 'icloud.com', 'me.com', 'mac.com', 'proton.me', 'protonmail.com', 'pm.me', 'fastmail.com', 'zoho.com', 'gmx.com', 'gmx.net', 'gmx.de', 'mail.com', 'tuta.com', 'tuta.io', 'tutanota.com', 'hey.com', 'yandex.com', 'yandex.ru', 'comcast.net', 'xfinity.com', 'att.net', 'verizon.net', 'sbcglobal.net', 'bellsouth.net', 'cox.net', 'charter.net', 'spectrum.net', 'earthlink.net', 'optonline.net']),
    wordsIn(['e-?mail', 'webmail', 'imap', 'smtp', 'pop3'])],
  ['money', any(
    words(['bank', 'credit', 'paypal', 'venmo', 'zelle', 'stripe', 'revolut', 'chase', 'wellsfargo', 'capitalone', 'americanexpress', 'truist', 'navyfederal', 'schwab', 'fidelity', 'vanguard', 'etrade', 'robinhood', 'webull', 'merrill', 'coinbase', 'kraken', 'binance', 'turbotax', 'intuit', 'hrblock', 'quicken', 'ynab', 'monarchmoney', 'empower', 'mortgage', 'insurance', 'geico', 'progressive', 'allstate', 'statefarm', 'brokerage']),
    domains(['ally.com', 'wise.com', 'citi.com', 'pnc.com', 'sofi.com', 'chime.com', 'usaa.com', 'amex.com', 'discover.com', 'bofa.com', 'irs.gov', 'cash.app', 'crypto.com', 'tdbank.com', 'usbank.com'])),
    wordsIn(['bank', 'credit card', 'checking', 'savings', 'brokerage', 'invest[a-z]*', 'crypto', 'wallet', 'tax', 'loan', 'mortgage', 'insurance', 'paypal', 'venmo'])],
  ['core', domains(['apple.com', 'google.com', 'microsoft.com', 'amazon.com', 'amazon.ca', 'amazon.co.uk', 'amazon.com.au', 'amazon.de', 'verizon.com', 'verizonwireless.com', 't-mobile.com', 'att.com', 'sprint.com', 'mintmobile.com', 'visible.com', 'ssa.gov', 'login.gov', 'id.me']),
    wordsIn(['apple id', 'google account', 'microsoft account', 'amazon', 'carrier', 'phone', 'social security', 'passport', "driver'?s? licen[cs]e"])],
  ['work', any(
    words(['slack', 'github', 'gitlab', 'bitbucket', 'atlassian', 'notion', 'asana', 'trello', 'dropbox', 'salesforce', 'hubspot', 'quickbooks', 'xero', 'cloudflare', 'godaddy', 'namecheap', 'squarespace', 'shopify', 'gusto', 'workday', 'okta']),
    domains(['zoom.us', 'box.com', 'office.com', 'office365.com', 'microsoft365.com', 'sharepoint.com', 'onedrive.com', 'azure.com', 'wordpress.com', 'wix.com', 'adp.com'])),
    wordsIn(['work', 'vpn', 'server', 'ssh', 'domain', 'hosting', 'admin'])],
  ['social', domains(['facebook.com', 'instagram.com', 'threads.net', 'twitter.com', 'x.com', 'linkedin.com', 'tiktok.com', 'snapchat.com', 'reddit.com', 'discord.com', 'discord.gg', 'pinterest.com', 'tumblr.com', 'whatsapp.com', 'telegram.org', 'signal.org', 'messenger.com', 'youtube.com', 'twitch.tv', 'bsky.app', 'mastodon.social', 'nextdoor.com']),
    wordsIn(['social', 'forum', 'chat'])],
];
// a login named after a mail service is the mail account even when its website is a sign-in page (accounts.google.com)
const MAIL_NAME = wordsIn(['gmail', 'outlook', 'hotmail', 'yahoo mail', 'proton ?mail', 'aol mail', 'icloud mail', 'fastmail', 'webmail', 'e-?mail']);

export function groupOf(rec) {
  const host = rec.host || '';
  const text = `${rec.name} ${rec.type} ${rec.tags.join(' ')}`.toLowerCase();
  if (/^email accounts?$/i.test(rec.type) || MAIL_NAME.test(rec.name.toLowerCase())) return 'email';
  for (const [id, hostTest] of RULES) if (host && hostTest(host)) return id;
  for (const [id, , textRe] of RULES) if (textRe.test(text)) return id;
  // a name such as "Chase" or "PayPal" with no website: its first word as a .com address
  const word = rec.name.toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim().split(' ')[0];
  if (word && !host) for (const [id, hostTest] of RULES) if (hostTest(`${word}.com`)) return id;
  return 'rest';
}

// the page that W3C's "well-known URL for changing passwords" points to; sites that do not support it answer 404 there,
// so the checklist also offers the site's home page
export function changeUrl(rec) {
  return rec.host ? `https://${rec.host}/.well-known/change-password` : '';
}
export function homeUrl(rec) {
  return rec.host ? `https://${rec.host}/` : '';
}

export function has2fa(rec) {
  if (rec.otp) return true;
  if (rec.fields.some(f => OTP_LABEL.test(f.label) && String(f.value).trim() !== '')) return true;
  return OTP_LABEL.test(rec.note || '');
}

// the logins that share one password with another login, grouped (the password itself is never shown in the group list)
export function reuseGroups(records) {
  const by = new Map();
  for (const r of records) {
    if (r.kind !== 'login' || !r.password) continue;
    if (!by.has(r.password)) by.set(r.password, []);
    by.get(r.password).push(r);
  }
  return [...by.values()].filter(g => g.length > 1).sort((a, b) => b.length - a.length || a[0].n - b[0].n);
}

// every login in the order to change it, with its group, reuse count and two-factor mark
export function checklist(records) {
  const reuse = new Map();
  for (const g of reuseGroups(records)) for (const r of g) reuse.set(r.n, g.length);
  const order = Object.fromEntries(GROUPS.map((g, i) => [g.id, i]));
  return records
    .filter(r => r.kind === 'login')
    .map(r => ({ rec: r, group: groupOf(r), reused: reuse.get(r.n) || 0, twofa: has2fa(r) }))
    .sort((a, b) => order[a.group] - order[b.group] || (b.reused > 0) - (a.reused > 0) || b.twofa - a.twofa || a.rec.name.localeCompare(b.rec.name, 'en', { sensitivity: 'base' }) || a.rec.n - b.rec.n);
}

// a stable key for a login that holds no readable part of it (SHA-256 of name, website and username); the checklist keeps only
// these keys and the ticks in this browser, never a name or a password
export async function itemKey(rec) {
  const data = new TextEncoder().encode([rec.name, rec.host, rec.username].join('\n'));
  const buf = await crypto.subtle.digest('SHA-256', data);
  return [...new Uint8Array(buf)].slice(0, 12).map(b => b.toString(16).padStart(2, '0')).join('');
}
