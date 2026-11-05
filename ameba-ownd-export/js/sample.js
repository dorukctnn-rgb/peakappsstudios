// Utsushi: a made-up Ameba Ownd site for the "サンプルを開く" button and the tests. The café, its texts and its pictures are ours
// (the pictures are drawn by _build/sample-images.mjs); the structure is the one Ameba Ownd's pages carry (checked on real sites,
// 5 Nov 2026): posts made of text, image, quote, video, divider and HTML blocks; pages made of rows, columns and blocks.
import { BACKUP_FORMAT } from './parse.js';

const T = (y, mo, d, h = 1) => new Date(Date.UTC(y, mo - 1, d, h, 0, 0)).toISOString();
const txt = html => ({ type: 'text', format: 'html', value: html });

export function sampleBackup(imageBase) {
  const img = (n, w = 960, h = 640) => ({ type: 'image', fit: true, scale: 1, align: 'center', url: `${imageBase}s${n}.png`, link: '', width: w, height: h, target: '_self' });
  const origin = 'https://komorebi.example';
  const cats = [{ id: '901', label: 'お知らせ' }, { id: '902', label: '季節のメニュー' }, { id: '903', label: '日々のこと' }];
  const posts = [
    { id: '8100034', title: 'Ameba Ownd の終了について（このサイトの引っ越し）', at: T(2026, 11, 3), cat: [0], contents: [
      txt('<p>いつもありがとうございます。このサイトを作っている Ameba Ownd が、2026年12月24日に終了することになりました。</p><p>年内に新しいサイトへ引っ越します。<b>住所と営業時間は変わりません</b>。</p>'),
      { type: 'divider' },
      txt('<h3>これからのお知らせ</h3><ul><li>Instagram でもお知らせします</li><li>新しいアドレスは決まりしだいここに書きます</li></ul>'),
    ] },
    { id: '8100033', title: '栗のタルト、はじめました', at: T(2026, 10, 18), cat: [1], contents: [img(1), txt('<p>今年も栗の季節です。渋皮ごと煮た栗をたっぷり使ったタルトは、<em>数量限定</em>で毎日12時から。</p>')] },
    { id: '8100032', title: '10月の定休日', at: T(2026, 10, 1), cat: [0], contents: [txt('<p>10月は毎週火曜と、14日（水）がお休みです。</p><table><tr><th>日</th><th>営業</th></tr><tr><td>7日</td><td>休み</td></tr><tr><td>14日</td><td>休み</td></tr></table>')] },
    { id: '8100031', title: '焙煎機を入れ替えました', at: T(2026, 9, 12), cat: [2], contents: [img(2), txt('<p>十年使った焙煎機を新しくしました。浅煎りの豆が少しだけ甘くなります。</p>'),
      { type: 'quote', provider: 'YouTube', url: 'https://www.youtube.com/watch?v=sample0001', json: { provider: 'YouTube', url: 'https://www.youtube.com/watch?v=sample0001', title: '焙煎のようす（動画）', description: '新しい焙煎機の音です' }, html: '' }] },
    { id: '8100030', title: '夏のアイスコーヒー', at: T(2026, 7, 2), cat: [1], contents: [img(3), txt('<p>水出しで12時間。氷もコーヒーで作っています。</p>')] },
    { id: '8100029', title: 'お店の地図を新しくしました', at: T(2026, 5, 20), cat: [0], contents: [txt('<p>駅からの道順を、写真つきで「アクセス」ページにまとめました。</p>'),
      { type: 'html', source: '<div class="komorebi-hours"><strong>営業時間</strong> 9:00-18:00<script>console.log("custom")</script></div>' }] },
    { id: '8100028', title: '春の焼き菓子', at: T(2026, 3, 28), cat: [1], contents: [img(4), txt('<p>いちごのショートブレッドと、よもぎのマドレーヌ。</p>')] },
    { id: '8100027', title: '動画: ハンドドリップの淹れ方', at: T(2026, 2, 14), cat: [2], contents: [{ type: 'video', url: 'https://www.youtube.com/watch?v=sample0002' }, txt('<p>お家で淹れるときのコツを、店長が3分で話しています。</p>')] },
  ];
  for (let n = 26; n >= 1; n--) {
    const m = ((n - 1) % 12) + 1;
    posts.push({ id: String(8100000 + n), title: `日々のこと その${n}`, at: T(2023 + Math.floor((n - 1) / 12), m, 10), cat: [2], contents: [txt(`<p>その${n}。今日のおすすめは、${['ブレンド', 'カフェラテ', 'ほうじ茶ラテ', '紅茶'][n % 4]}と${['チーズケーキ', 'スコーン', 'プリン'][n % 3]}です。</p>`)] });
  }
  const P = p => ({ id: p.id, status: 'publish', title: p.title, urlPath: '', publishedUrl: `${origin}/posts/${p.id}`, publishedAt: p.at, updatedAt: p.at, createdAt: p.at,
    ogpImageUrl: (p.contents.find(b => b.type === 'image') || {}).url || '', ogpDescription: '', contents: p.contents,
    blogCategories: p.cat.map(i => cats[i]), user: { nickname: 'こもれび珈琲' } });
  const pages = [
    { id: '700001', type: 'blog', title: 'ホーム', urlPath: 'home', showTitle: false, createdAt: T(2019, 4, 1), updatedAt: T(2026, 11, 3), contents: { layout: { rows: [
      { columns: [{ blocks: [{ type: 'title', value: 'こもれび珈琲' }, txt('<p style="text-align: center;">駅から歩いて5分、窓の大きな小さな喫茶店です。</p>'), img(1, 1200, 600)] }] },
      { columns: [{ blocks: [{ type: 'post', mode: 'main', title: 'お知らせ', buttonTitle: 'もっと見る', limit: 6, layoutType: 'list', categoryIds: '901', showTitle: true, showButton: true, sortType: 'recent' }] }] },
      { columns: [{ blocks: [{ type: 'instagramAlbum', mode: 'summary', title: 'Instagram', screenName: 'komorebi_sample', limit: 12 }] }] },
    ] } } },
    { id: '700002', type: 'static', title: 'メニュー', urlPath: 'menu', showTitle: true, createdAt: T(2019, 4, 1), updatedAt: T(2026, 10, 18), contents: { layout: { rows: [
      { columns: [{ blocks: [txt('<h2>コーヒー</h2><p>ブレンド 520円<br>浅煎りシングル 600円</p>')] }, { blocks: [txt('<h2>おやつ</h2><p>チーズケーキ 480円<br>季節のタルト 560円</p>')] }] },
      { columns: [{ blocks: [img(2), { type: 'divider' }, txt('<p>テイクアウトもできます。</p>')] }] },
    ] } } },
    { id: '700003', type: 'static', title: 'アクセス', urlPath: 'page_201904011200', showTitle: true, createdAt: T(2019, 4, 1), updatedAt: T(2026, 5, 20), contents: { layout: { rows: [
      { columns: [{ blocks: [txt('<p>駅の東口を出て、まっすぐ5分です。</p>'), { type: 'map', storeName: 'こもれび珈琲', buildingName: '', address: '東京都千代田区丸の内1丁目（サンプル）', zoom: 16, latLng: { lat: 35.68, lng: 139.76 } }] }] },
    ] } } },
    { id: '700004', type: 'static', title: 'お問い合わせ', urlPath: 'contact', showTitle: true, createdAt: T(2019, 4, 1), updatedAt: T(2024, 1, 9), contents: { layout: { rows: [
      { columns: [{ blocks: [txt('<p>貸し切りのご相談はフォームからどうぞ。</p>'), { type: 'button', title: '問い合わせフォーム', align: 'center', size: 'l', target: '_blank', url: 'https://docs.google.com/forms/d/sample/viewform' }] }] },
    ] } } },
  ];
  return {
    format: BACKUP_FORMAT, version: 1, createdAt: T(2026, 11, 5, 3), origin, total: posts.length, stopped: false,
    site: { title: 'こもれび珈琲（サンプル）', tagline: '駅から5分の喫茶店', copyright: '', siteId: '1', homePageId: '700001', logoUrl: '', iconUrl: '', coverImageUrl: '',
      navigations: [{ title: 'ホーム', urlPath: './', pageId: '700001' }, { title: 'メニュー', urlPath: './pages/700002/menu', pageId: '700002' }, { title: 'アクセス', urlPath: './pages/700003/page_201904011200', pageId: '700003' }, { title: 'お問い合わせ', urlPath: './pages/700004/contact', pageId: '700004' }] },
    posts: posts.map(P), pages, missed: [],
  };
}
