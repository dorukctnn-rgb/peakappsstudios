// Utsushi Pro: one payment of $8 through Paddle, in the panel on this page (assets/license.js + assets/peak-pay.js; the build adds
// <meta name="peak-pay" content="utsushi"> and the Worker peak-pay turns Pro on in this browser after the payment, with a link by
// e-mail for another device). There is no Gumroad product: a Gumroad-style key is never accepted (the product id below matches no
// product), and the Buy link without scripts goes to this page's #buy-pro, which opens the checkout.
export const PRO = {
  productId: 'paddle-only-utsushi',
  permalink: 'utsushi-pro',
  url: 'https://peakappsstudio.com/ameba-ownd-export/#buy-pro',
  price: '8ドル',
};
export const PRO_PITCH = `Pro なら、全記事と全ページの WordPress 用ファイル、すべての画像の ZIP、ネットなしで開けるサイトの写し、Markdown、独自ドメインの転送設定を一度に保存できます。${PRO.price}、買い切りです。`;
// the Pro window's words (license.js); the Paddle panel has its own Japanese words in assets/peak-pay.js
export const PRO_STRINGS = {
  title: 'Utsushi Pro', buy: 'Pro を購入', keyLabel: 'ライセンスキーをお持ちの方は貼り付けてください', verify: '有効にする', close: '閉じる',
  checking: '確認しています…', badKey: 'ライセンスキーの形ではないようです。購入時のメールに記載されています。',
  network: '確認のための接続ができませんでした。接続を確かめて、もう一度お試しください。', ok: 'このブラウザで Pro が有効になりました。ありがとうございます。',
  refunded: 'この購入は返金されたため、Pro は無効です。', rejected: 'このライセンスキーは受け付けられませんでした。', active: 'このブラウザで Pro が有効です。',
};
