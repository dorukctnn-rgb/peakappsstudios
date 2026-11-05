// Utsushi's collector: the code of the bookmark (bookmarklet) that copies a whole Ameba Ownd site into one backup file.
// It runs only when its owner clicks it on their own site, inside that site's page, so it reads the site's pages as the browser
// already shows them (same site, no other server, nothing sent anywhere). It reads:
//   /posts/page/1, /posts/page/2, ...  every published post, 9 to 12 per page, with all blocks (Ameba Ownd's own page data)
//   /sitemap.xml and the site menu      the addresses of the pages (/pages/<id>/...), then each page, and any post the list missed
// and saves utsushi-<host>-<date>.json in the Downloads folder. It waits 0.3 s between requests (a real site of 229 posts took
// 22 s on 5 Nov 2026) and can be stopped. The page in /ameba-ownd-export/ opens that file.
// _build/pages.mjs turns COLLECTOR into the bookmark's address; the tests run the same function in a page.
export const COLLECTOR = async function utsushiCollect() {
  const D = document, L = location, VER = 1, WAIT = 300;
  const box = D.createElement('div');
  box.setAttribute('role', 'status');
  box.style.cssText = 'position:fixed;right:16px;bottom:16px;z-index:2147483647;max-width:340px;background:#2e2350;color:#fff;font:15px/1.6 system-ui,sans-serif;padding:14px 18px;border-radius:12px;box-shadow:0 8px 28px rgba(0,0,0,.35)';
  const msg = D.createElement('p'); msg.style.margin = '0';
  const stop = D.createElement('button'); stop.type = 'button'; stop.textContent = '止める';
  stop.style.cssText = 'margin-top:8px;font:inherit;padding:4px 12px;border-radius:8px;border:1px solid #fff;background:transparent;color:#fff;cursor:pointer';
  let stopped = false;
  stop.onclick = () => { stopped = true; };
  box.append(msg, stop);
  D.body.appendChild(box);
  const say = t => { msg.textContent = 'Utsushi: ' + t; };
  const done = t => { say(t); stop.textContent = '閉じる'; stop.onclick = () => box.remove(); };
  const sleep = ms => new Promise(r => setTimeout(r, ms));
  const data = h => { const m = /<script[^>]*id="__NEXT_DATA__"[^>]*>([\s\S]*?)<\/script>/.exec(h); if (!m) return null; try { return JSON.parse(m[1]).props.pageProps.state; } catch (e) { return null; } };
  const here = D.getElementById('__NEXT_DATA__');
  const st0 = here ? data(here.outerHTML) : null;
  if (!st0 || !st0.siteConfig) { done('このページは Ameba Ownd のサイトではないようです。自分のサイトを開いてから、もう一度押してください。'); return; }
  const get = async path => {
    const r = await fetch(path, { credentials: 'omit', headers: { accept: 'text/html' } });
    if (!r.ok) throw new Error(String(r.status));
    const st = data(await r.text());
    if (!st) throw new Error('nodata');
    return st;
  };
  const posts = new Map(), pages = new Map(), missed = [];
  let total = 0, limit = 12;
  const takeList = st => {
    for (const v of Object.values(st.postList || {})) {
      for (const p of (v && v.data) || []) if (p && p.id) posts.set(String(p.id), p);
      const pg = v && v.meta && v.meta.pagination;
      if (pg && pg.total >= total) { total = pg.total; limit = pg.limit || limit; }
    }
    for (const v of Object.values(st.postDetail || {})) if (v && v.data && v.data.id) posts.set(String(v.data.id), v.data);
    for (const v of Object.values(st.page || {})) if (v && v.data && v.data.id) pages.set(String(v.data.id), v.data);
  };
  takeList(st0);
  try {
    say('記事の一覧を読んでいます');
    takeList(await get('/posts/page/1'));
    const n = Math.min(Math.ceil(total / Math.max(1, limit)), 2000);
    for (let i = 2; i <= n && !stopped; i++) {
      say(`記事を集めています（${posts.size} / ${total} 件）`);
      await sleep(WAIT);
      try { takeList(await get('/posts/page/' + i)); } catch (e) { missed.push('/posts/page/' + i); }
    }
  } catch (e) { missed.push('/posts/page/1'); }
  const want = new Set(['/']);
  const postIds = new Set();
  try {
    const r = await fetch('/sitemap.xml', { credentials: 'omit' });
    const xml = r.ok ? await r.text() : '';
    for (const m of xml.matchAll(/<loc>([^<]+)<\/loc>/g)) {
      let u; try { u = new URL(m[1].trim(), L.href); } catch (e) { continue; }
      if (u.origin !== L.origin) continue;
      if (/^\/pages\/\d+/.test(u.pathname)) want.add(u.pathname);
      const pm = /^\/posts\/(\d+)/.exec(u.pathname); if (pm) postIds.add(pm[1]);
    }
  } catch (e) { /* the menu still has the pages */ }
  for (const nav of st0.siteConfig.navigations || []) { const m = /^\.?(\/pages\/\d+[^?#]*)/.exec(nav.urlPath || ''); if (m) want.add(m[1]); }
  let i = 0;
  for (const path of want) {
    if (stopped) break;
    i++; say(`ページを集めています（${i} / ${want.size}）`);
    await sleep(WAIT);
    try { takeList(await get(path)); } catch (e) { missed.push(path); }
  }
  const rest = [...postIds].filter(id => !posts.has(id));
  let k = 0;
  for (const id of rest) {
    if (stopped) break;
    k++; say(`一覧になかった記事を集めています（${k} / ${rest.length}）`);
    await sleep(WAIT);
    try { takeList(await get('/posts/' + id)); } catch (e) { missed.push('/posts/' + id); }
  }
  const sc = st0.siteConfig;
  const backup = {
    format: 'utsushi-ownd-backup', version: VER, createdAt: new Date().toISOString(), origin: L.origin, total, stopped,
    site: { title: sc.title, tagline: sc.tagline, copyright: sc.copyright, siteId: sc.siteId, homePageId: sc.homePageId, logoUrl: sc.logoUrl,
      iconUrl: sc.iconUrl, coverImageUrl: sc.coverImageUrl, navigations: (sc.navigations || []).map(n => ({ title: n.title, urlPath: n.urlPath, pageId: n.pageId, target: n.target })) },
    posts: [...posts.values()].map(p => ({ id: p.id, status: p.status, title: p.title, urlPath: p.urlPath, publishedUrl: p.publishedUrl, publishedAt: p.publishedAt,
      updatedAt: p.updatedAt, createdAt: p.createdAt, ogpImageUrl: p.ogpImageUrl, ogpDescription: p.ogpDescription, contents: p.contents,
      blogCategories: (p.blogCategories || []).map(c => ({ id: c.id, label: c.label })), user: { nickname: p.user && p.user.nickname } })),
    pages: [...pages.values()].map(p => ({ id: p.id, type: p.type, title: p.title, urlPath: p.urlPath, showTitle: p.showTitle, createdAt: p.createdAt, updatedAt: p.updatedAt, contents: p.contents })),
    missed,
  };
  const day = new Date().toISOString().slice(0, 10).replace(/-/g, '');
  const name = `utsushi-${L.hostname}-${day}.json`;
  const url = URL.createObjectURL(new Blob([JSON.stringify(backup)], { type: 'application/json' }));
  const a = D.createElement('a'); a.href = url; a.download = name; D.body.appendChild(a); a.click(); a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 60000);
  done(`${stopped ? '途中で止めました。' : ''}記事 ${posts.size} 件、ページ ${pages.size} 件を「${name}」に保存しました（ダウンロードフォルダ）。${missed.length ? `読めなかったもの ${missed.length} 件。` : ''}このファイルを Utsushi のページで開いてください。`);
  window.__utsushiLast = { posts: posts.size, pages: pages.size, missed: missed.length, name, total };
};

// the bookmark's address: the function above, run at once
export function bookmarkletHref() {
  const src = String(COLLECTOR).replace(/^async function utsushiCollect\(\)/, 'async function()');
  return 'javascript:' + encodeURIComponent(`(${src})();void 0`);
}
