// Utsushi: the page. Reads a site from its feed, from the collector's backup, from saved pages or a ZIP of them; shows the posts,
// pages and images; saves one item, the free WordPress file and the image list; with Pro, the whole site and every image.
// Nothing read here leaves the browser: the only requests are the site's own feed (when an address is typed) and Ameba Ownd's
// image server (thumbnails, and the images the Pro package copies).
import { emptySite, mergeInto, readText, readBackup, readFeed, sortedPosts, sortedPages, collectImages, searchText, feedUrlFor } from './parse.js';
import { itemHtml } from './blocks.js';
import { saveOne, freeWxr, imageListCsv, packFiles, readme, fetchImages, imageZipper, zipPack, hostOf, dateLabel, FREE_POSTS, FREE_PAGES } from './export.js';
import { csv } from './wxr.js';
import { isCdnImage, bareImage } from './sanitize.js';
import { sampleBackup } from './sample.js';
import { bookmarkletHref } from './collect.js';
import { PRO, PRO_PITCH, PRO_STRINGS } from './pro.js';

const $ = id => document.getElementById(id);
const BASE = '/ameba-ownd-export/';
const END = Date.UTC(2026, 11, 24, 2, 0, 0); // 24 Dec 2026 11:00 JST
const PAGE = 50;
let site = emptySite();
let tab = 'posts';
let shown = PAGE;
let pro = false;
let packing = null;

/* ------------------------------------------------------------------ helpers */
function toast(msg) { if (window.PeakUI && PeakUI.toast) PeakUI.toast(msg); }
function download(name, data, type) {
  const blob = data instanceof Blob ? data : new Blob([data], { type: type || 'application/octet-stream' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url; a.download = name; a.rel = 'noopener';
  document.body.appendChild(a); a.click(); a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 120000);
}
const n = v => Number(v).toLocaleString('ja-JP');
function busy(text) { $('busy').hidden = !text; if (text) $('busy-text').textContent = text; }
const errText = {
  network: 'フィードを読み込めませんでした。アドレスを確かめてください。サイトが表示できる状態でも読めない場合は、「2. 全部集める」か、ページを保存して「3. ファイルを開く」を使ってください。',
  notfound: 'このアドレスにはフィード（rss.xml）がありませんでした。Ameba Ownd のサイトのアドレスか確かめてください。',
  notfeed: 'このアドレスのフィードは Ameba Ownd のものではないようです。',
  empty: 'このサイトのフィードには記事がありませんでした（ページだけのサイトでは、フィードにページの中身が入りません）。ページは「2. 全部集める」か、各ページをブラウザで保存して「3. ファイルを開く」で読み込めます。',
  address: 'アドレスの形が正しくないようです。例: komorebi.amebaownd.com',
};

/* ------------------------------------------------------------------ Pro */
function setupPro() {
  if (!window.PeakLicense) return;
  PeakLicense.setup({ tool: 'utsushi', productId: PRO.productId, permalink: PRO.permalink, buyUrl: PRO.url, pitch: PRO_PITCH, strings: PRO_STRINGS, localMessages: true });
  pro = PeakLicense.isPro();
  PeakLicense.onChange(p => { pro = p; document.body.classList.toggle('is-pro', p); });
}
function needPro(why) {
  if (window.PeakLicense && PeakLicense.isPro()) return true;
  if (window.PeakLicense) PeakLicense.open(why);
  return false;
}

/* ------------------------------------------------------------------ deadline */
function deadline() {
  const days = Math.ceil((END - Date.now()) / 864e5);
  const t = $('deadline-text');
  if (!t) return;
  t.textContent = days > 0 ? `終了まであと ${days} 日（12月24日（木）11:00）` : 'Ameba Ownd は終了しました（2026年12月24日 11:00）';
}

/* ------------------------------------------------------------------ loading */
function adopt(part, kind) {
  // a different site starts over; the same site adds to what is open
  if (part.origin && site.origin && part.origin !== site.origin) site = emptySite();
  mergeInto(site, part, kind);
}
async function loadFeed(input) {
  const err = $('feed-error');
  err.hidden = true;
  const url = feedUrlFor(input);
  if (!url) { err.textContent = errText.address; err.hidden = false; return; }
  busy('フィードを読み込んでいます');
  let text;
  try {
    const ctl = new AbortController();
    const timer = setTimeout(() => ctl.abort(), 25000);
    const r = await fetch(url, { mode: 'cors', credentials: 'omit', signal: ctl.signal, headers: { accept: 'application/rss+xml, application/xml, text/xml' } });
    clearTimeout(timer);
    if (r.status === 404) throw new Error('notfound');
    if (!r.ok) throw new Error('network');
    text = await r.text();
  } catch (e) {
    busy('');
    err.textContent = errText[e.message] || errText.network; err.hidden = false; return;
  }
  busy('');
  let f;
  try { f = readFeed(text); } catch (e) { err.textContent = errText.notfeed; err.hidden = false; return; }
  if (!f.posts.length) { err.textContent = errText.empty; err.hidden = false; return; }
  adopt({ site: f.site, posts: f.posts, origin: new URL(url).origin }, 'feed');
  show();
}

async function loadFiles(files) {
  const list = [...files];
  if (!list.length) return;
  busy(`${list.length} 個のファイルを読んでいます`);
  let ok = 0;
  const bad = [];
  const one = async (name, text) => {
    try { const r = readText(name, text); adopt(r.part, r.kind); ok++; } catch (e) { bad.push(name); }
  };
  for (const f of list) {
    try {
      if (/\.zip$/i.test(f.name) || f.type === 'application/zip') {
        const { unzipSync, strFromU8 } = await import('../vendor/fflate.js');
        const entries = unzipSync(new Uint8Array(await f.arrayBuffer()), { filter: e => /\.(json|html?|xml|rss)$/i.test(e.name) && !/(^|\/)(__MACOSX|\.)/.test(e.name) && e.originalSize < 80e6 });
        const names = Object.keys(entries);
        if (!names.length) bad.push(f.name);
        for (const k of names) await one(`${f.name}/${k}`, strFromU8(entries[k]));
      } else if (f.size > 300e6) {
        bad.push(f.name);
      } else {
        await one(f.name, await f.text());
      }
    } catch (e) { bad.push(f.name); }
  }
  busy('');
  if (!ok) { toast('Ameba Ownd のファイルとして読めませんでした。集めたファイル（.json）、保存したページ（.html）、rss.xml、その ZIP を選んでください。'); return; }
  if (bad.length) toast(`${bad.length} 個のファイルは読めませんでした: ${bad.slice(0, 3).join('、')}${bad.length > 3 ? ' ほか' : ''}`);
  show();
}

function loadSample() {
  site = emptySite();
  mergeInto(site, readBackup(sampleBackup(`${location.origin}${BASE}img/sample/`)), 'backup');
  show();
}

/* ------------------------------------------------------------------ showing */
function show() {
  $('result').hidden = false;
  const posts = sortedPosts(site), pages = sortedPages(site), images = collectImages(site);
  $('site-title').textContent = site.title || 'Ameba Ownd のサイト';
  $('site-origin').textContent = site.origin || '';
  $('site-counts').textContent = `記事 ${n(posts.length)} 件、ページ ${n(pages.length)} 件、画像 ${n(images.length)} 点`;
  const scope = $('site-scope');
  const missed = site.notes.filter(x => x.kind === 'missed').length;
  if (site.complete) {
    scope.className = 'ut-scope is-complete';
    scope.textContent = `集めたファイルから、公開中の記事とページを読み込みました。${missed ? `読めなかったページが ${missed} 件あります（集めるときに止めたか、通信が途切れたもの）。` : ''}`;
  } else if (site.sources.has('feed') && !site.sources.has('page')) {
    scope.className = 'ut-scope is-partial';
    scope.textContent = `フィードから読めるのは新しい記事 ${n(posts.length)} 件だけです。全記事とページは「2. 全部集める」で保存できます。`;
  } else {
    scope.className = 'ut-scope is-partial';
    scope.textContent = `開いたファイルの分だけです${site.total > posts.length ? `（サイトの記事は全部で ${n(site.total)} 件）` : ''}。全部は「2. 全部集める」で保存できます。`;
  }
  $('n-posts').textContent = `(${n(posts.length)})`;
  $('n-pages').textContent = `(${n(pages.length)})`;
  $('n-images').textContent = `(${n(images.length)})`;
  const fw = posts.length <= FREE_POSTS && pages.length <= FREE_PAGES;
  $('wxr-free-note').firstChild.textContent = fw ? 'このサイトは全部が無料の範囲です（記事30件とページ3件まで）。WordPress の「ツール」>「インポート」で読み込みます（' : `新しい記事${FREE_POSTS}件とページ${FREE_PAGES}件まで（全部は Pro）。WordPress の「ツール」>「インポート」で読み込みます（`;
  shown = PAGE;
  setTab(tab);
  $('site-title').focus();
  $('result').scrollIntoView({ behavior: matchMedia('(prefers-reduced-motion: reduce)').matches ? 'auto' : 'smooth', block: 'start' });
}

function firstImage(item) {
  const bs = item.blocks || (item.rows ? item.rows.flat(2) : null);
  if (bs) { const b = bs.find(x => x.type === 'image' && isCdnImage(bareImage(x.url))); if (b) return bareImage(b.url); }
  const m = /<img[^>]+src="([^"]+)"/i.exec(item.html || '');
  if (m && isCdnImage(bareImage(m[1]))) return bareImage(m[1]);
  return item.image && isCdnImage(item.image) ? item.image : '';
}
const thumbUrl = u => (/^https:\/\/cdn\.amebaowndme\.com\//.test(u) ? `${u}?width=240` : u);
const searchCache = new WeakMap();
function matches(item, q) {
  if (!q) return true;
  let s = searchCache.get(item);
  if (s === undefined) { s = `${item.title}\n${searchText(item)}`.toLowerCase(); searchCache.set(item, s); }
  return q.split(/\s+/).every(w => s.includes(w));
}

function setTab(t) {
  tab = t;
  for (const [id, key] of [['tab-posts', 'posts'], ['tab-pages', 'pages'], ['tab-images', 'images']]) $(id).setAttribute('aria-selected', String(key === t));
  $('pane-list').hidden = t === 'images';
  $('pane-images').hidden = t !== 'images';
  $('pane-list').setAttribute('aria-labelledby', t === 'pages' ? 'tab-pages' : 'tab-posts');
  if (t === 'images') renderImages(); else renderList();
}

function renderList() {
  const q = $('q').value.trim().toLowerCase();
  const items = (tab === 'pages' ? sortedPages(site) : sortedPosts(site)).filter(i => matches(i, q));
  const ul = $('list');
  ul.textContent = '';
  for (const it of items.slice(0, shown)) {
    const li = document.createElement('li');
    const b = document.createElement('button');
    b.type = 'button'; b.className = 'ut-item'; b.dataset.id = it.id; b.dataset.kind = it.rows ? 'page' : 'post';
    const img = firstImage(it);
    const pic = img ? Object.assign(document.createElement('img'), { src: thumbUrl(img), alt: '', loading: 'lazy', decoding: 'async', width: 64, height: 48 }) : Object.assign(document.createElement('span'), { className: 'ut-noimg' });
    const text = document.createElement('span');
    const tt = Object.assign(document.createElement('span'), { className: 'ut-item-title', textContent: it.title || (it.rows ? 'ページ' : '無題') });
    const meta = Object.assign(document.createElement('span'), { className: 'ut-item-meta', textContent: [it.rows ? it.path : dateLabel(it.publishedAt), (it.categories || []).join('、'), it.from === 'feed' ? 'フィード' : ''].filter(Boolean).join('　') });
    text.append(tt, meta);
    const open = Object.assign(document.createElement('span'), { className: 'ut-item-open', textContent: '開く' });
    b.append(pic, text, open);
    b.addEventListener('click', () => openReader(it));
    li.append(b);
    ul.append(li);
  }
  $('list-empty').hidden = items.length > 0;
  $('btn-more').hidden = items.length <= shown;
}

function renderImages() {
  const images = collectImages(site);
  const ul = $('thumbs');
  ul.textContent = '';
  $('images-note').textContent = images.length ? `全 ${n(images.length)} 点${images.length > 120 ? '（最初の120点を表示）' : ''}。一覧の CSV は無料、すべての画像の ZIP は Pro です。` : '画像は見つかりませんでした。';
  for (const im of images.slice(0, 120)) {
    const li = document.createElement('li');
    li.append(Object.assign(document.createElement('img'), { src: thumbUrl(im.url), alt: '', loading: 'lazy', decoding: 'async', width: 120, height: 90 }), Object.assign(document.createElement('span'), { textContent: im.name }));
    ul.append(li);
  }
}

let current = null;
function openReader(item) {
  current = item;
  $('rd-title').textContent = item.title || (item.rows ? 'ページ' : '無題');
  $('rd-meta').textContent = [item.rows ? (site.origin + item.path) : dateLabel(item.publishedAt), (item.categories || []).join('、')].filter(Boolean).join('　');
  // cleaned HTML (sanitize.js); images only from Ameba Ownd's image server; the page's policy blocks any script as well
  $('rd-body').innerHTML = itemHtml(item, { mode: 'reader', origin: site.origin });
  const d = $('reader');
  if (d.showModal) d.showModal(); else d.setAttribute('open', '');
  $('rd-close').focus();
}
function closeReader() { const d = $('reader'); if (d.close) d.close(); else d.removeAttribute('open'); }
function saveCurrent(kind) {
  if (!current) return;
  const f = saveOne(site, current, kind);
  download(f.name, f.data, `${f.type};charset=utf-8`);
}

/* ------------------------------------------------------------------ saving */
function saveFreeWxr() {
  if (!site.posts.size && !site.pages.size) return;
  const f = freeWxr(site);
  download(`wordpress-${hostOf(site)}${f.whole ? '' : '-free'}.xml`, f.xml, 'application/xml;charset=utf-8');
  toast(`記事 ${f.counts.posts} 件、ページ ${f.counts.pages} 件、画像 ${f.counts.images} 点の WordPress 用ファイルを保存しました。${f.whole ? '' : '全部を入れるには Pro を使います。'}`);
}
function saveImagesCsv() { download(`images-${hostOf(site)}.csv`, imageListCsv(site), 'text/csv;charset=utf-8'); }

async function savePack() {
  if (packing) return;
  if (!needPro('pack')) return;
  const host = hostOf(site);
  const ctl = new AbortController();
  packing = ctl;
  const bar = $('pack-bar'), status = $('pack-status');
  $('pack-progress').hidden = false;
  $('btn-pack').disabled = true;
  bar.value = 0;
  try {
    const list = collectImages(site);
    let parts = 0;
    const zipper = imageZipper(async (i, bytes) => { parts = i; download(`utsushi-${host}-images-${i}.zip`, new Blob([bytes], { type: 'application/zip' })); });
    status.textContent = list.length ? `画像をコピーしています（0 / ${n(list.length)}）` : 'ファイルを作っています';
    const res = await fetchImages(list, { signal: ctl.signal, onImage: (name, bytes) => zipper.add(name, bytes), onProgress: (done, all) => { bar.value = Math.round((done / Math.max(1, all)) * 90); status.textContent = `画像をコピーしています（${n(done)} / ${n(all)}）`; } });
    if (ctl.signal.aborted) { status.textContent = '止めました。保存済みの画像 ZIP はそのまま使えます。'; return; }
    await zipper.end();
    status.textContent = 'WordPress 用ファイルと写しを作っています';
    const { files, counts } = packFiles(site);
    const enc = new TextEncoder();
    files['README.txt'] = enc.encode(readme(site, counts, res.ok, parts));
    if (res.failed.length) files['images-failed.csv'] = enc.encode(csv([['url', 'why'], ...res.failed.map(f => [f.url, f.why])]));
    download(`utsushi-${host}.zip`, new Blob([zipPack(files)], { type: 'application/zip' }));
    bar.value = 100;
    status.textContent = `保存しました。記事 ${n(counts.posts)} 件、ページ ${n(counts.pages)} 件、画像 ${n(res.ok)} 点（ZIP ${parts} 個）。${res.failed.length ? `コピーできなかった画像 ${res.failed.length} 点は images-failed.csv にあります。` : ''}`;
  } catch (e) {
    status.textContent = `途中で止まりました（${String(e && e.message || e).slice(0, 80)}）。もう一度お試しください。`;
  } finally {
    packing = null;
    $('btn-pack').disabled = false;
  }
}

/* ------------------------------------------------------------------ wiring */
function wire() {
  $('feed-form').addEventListener('submit', e => { e.preventDefault(); loadFeed($('site-addr').value); });
  const input = $('file-input');
  $('btn-files').addEventListener('click', () => input.click());
  input.addEventListener('change', () => { loadFiles(input.files); input.value = ''; });
  const drop = $('drop');
  ['dragenter', 'dragover'].forEach(t => drop.addEventListener(t, e => { e.preventDefault(); drop.classList.add('is-over'); }));
  ['dragleave', 'drop'].forEach(t => drop.addEventListener(t, () => drop.classList.remove('is-over')));
  drop.addEventListener('drop', e => { e.preventDefault(); if (e.dataTransfer && e.dataTransfer.files) loadFiles(e.dataTransfer.files); });
  $('btn-sample').addEventListener('click', loadSample);
  const bm = $('bookmarklet');
  bm.href = bookmarkletHref();
  bm.addEventListener('click', e => { e.preventDefault(); toast('このボタンは押さずに、ブックマークバーへドラッグして使います。自分の Ameba Ownd のサイトを開いてから、そのブックマークを押してください。'); });
  $('bm-copy').addEventListener('click', async () => {
    try { await navigator.clipboard.writeText(bookmarkletHref()); toast('コードをコピーしました。ブックマークの URL に貼り付けてください。'); } catch (e) { toast('コピーできませんでした。ボタンを右クリックして「リンクのアドレスをコピー」を選んでください。'); }
  });
  $('btn-reset').addEventListener('click', () => { site = emptySite(); $('result').hidden = true; $('site-addr').value = ''; $('site-addr').focus(); });
  $('tab-posts').addEventListener('click', () => { shown = PAGE; setTab('posts'); });
  $('tab-pages').addEventListener('click', () => { shown = PAGE; setTab('pages'); });
  $('tab-images').addEventListener('click', () => setTab('images'));
  document.querySelector('.ut-tabs').addEventListener('keydown', e => {
    if (e.key !== 'ArrowRight' && e.key !== 'ArrowLeft') return;
    const ids = ['tab-posts', 'tab-pages', 'tab-images'];
    const i = ids.indexOf(document.activeElement.id);
    if (i < 0) return;
    const next = $(ids[(i + (e.key === 'ArrowRight' ? 1 : ids.length - 1)) % ids.length]);
    next.focus(); next.click();
  });
  let qt;
  $('q').addEventListener('input', () => { clearTimeout(qt); qt = setTimeout(() => { shown = PAGE; renderList(); }, 150); });
  $('btn-more').addEventListener('click', () => { shown += PAGE; renderList(); });
  $('rd-close').addEventListener('click', closeReader);
  $('reader').addEventListener('click', e => { if (e.target === $('reader')) closeReader(); });
  $('rd-html').addEventListener('click', () => saveCurrent('html'));
  $('rd-md').addEventListener('click', () => saveCurrent('md'));
  $('rd-txt').addEventListener('click', () => saveCurrent('txt'));
  $('btn-wxr-free').addEventListener('click', saveFreeWxr);
  $('btn-images-csv').addEventListener('click', saveImagesCsv);
  $('btn-pack').addEventListener('click', savePack);
  $('pack-cancel').addEventListener('click', () => { if (packing) packing.abort(); });
}

function start() {
  deadline();
  wire();
  setupPro();
  window.__utsushi = { get site() { return site; }, loadSample, loadFiles, loadFeed, savePack, saveFreeWxr };
}
if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', start); else start();
