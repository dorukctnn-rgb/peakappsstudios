// Decant Pro: one payment of $8 through Paddle, in the panel on this page (assets/license.js + assets/peak-pay.js; the build adds
// <meta name="peak-pay" content="decant"> and the Worker peak-pay turns Pro on in this browser after the payment, with a link by
// e-mail for another device). There is no Gumroad product: a Gumroad-style key is never accepted (the product id below matches no
// product), and the Buy link without scripts goes to this page's #buy-pro, which opens the checkout.
export const PRO = {
  productId: 'paddle-only-decant',
  permalink: 'decant-pro',
  url: 'https://peakappsstudio.com/spass-to-csv/#buy-pro',
  price: '$8',
};
export const PRO_PITCH = {
  en: `Pro gives you the whole change list in order with your ticks kept, every reused password grouped, a Bitwarden and KeePassXC file with cards, addresses, notes and one-time codes, and a printable sheet of your cards, addresses and notes. ${PRO.price}, paid once.`,
  de: `Pro gibt dir die ganze Änderungsliste in Reihenfolge mit gemerkten Haken, alle mehrfach benutzten Passwörter gruppiert, eine Bitwarden- und KeePassXC-Datei mit Karten, Adressen, Notizen und Einmalcodes und ein druckbares Blatt mit deinen Karten, Adressen und Notizen. ${PRO.price}, einmal bezahlt.`,
  nl: `Pro geeft je de hele wijzigingslijst op volgorde met bewaarde vinkjes, alle hergebruikte wachtwoorden gegroepeerd, een Bitwarden- en KeePassXC-bestand met kaarten, adressen, notities en eenmalige codes en een afdrukbaar blad met je kaarten, adressen en notities. ${PRO.price}, eenmalig betaald.`,
};
export const FREE_ROWS = 10;
