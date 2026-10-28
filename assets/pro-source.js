/* Sale attribution for Peak Apps Tools: which kind of site sent a visitor, so each Pro sale in Gumroad shows its channel.
 * The build puts <script src="/assets/pro-source.js" data-campaign="<tool slug>" defer> in the head of every page.
 *
 * On every page the visitor's source is sorted into one word: google, bing, other-search, ai-assistant, pinterest, social,
 * referral or direct.
 *  1. A tag on the address the visitor landed on (utm_source, then ref, then source; for example ChatGPT's
 *     utm_source=chatgpt.com) wins over the referrer. A tag naming a site this file does not know counts as referral.
 *  2. Otherwise the host of document.referrer is sorted. This site and Gumroad are ignored, and android-app://<package>
 *     referrers are sorted by app.
 *  3. Only the word is kept, never an address: for this tab in sessionStorage (peak-source:visit, the first word of the
 *     visit), and in localStorage (peak-source:first) the first word other than direct ever seen in this browser, written
 *     once and never replaced.
 * Nothing leaves the browser until the visitor follows a Pro link (https://dorukctn.gumroad.com/l/<permalink>). At that
 * moment (mousedown, touchstart or click, in the capture phase) the link gets
 *   utm_source=<the first word, else this visit's word, else direct>&utm_medium=<organic|referral|social|none>&utm_campaign=<tool>
 * and Gumroad records the three with the sale. The link's other query parameters stay as they are, and a link that already
 * carries a utm_source is left alone. The page as served, and any crawler reading it, keeps the plain link. If anything
 * here fails, the plain link is followed.
 *
 * Pro click counter (funnel-worker/, the Worker "peak-funnel"): the same moments are also counted, so the studio can see where
 * visitors stop before Gumroad. Two things are counted and nothing else: a Pro link followed ("click") and the Pro window of
 * license.js opening on its own ("gate"; "key" when the visitor opened it to type a key). Each note is five short fields: the
 * event, the tool (data-campaign), the page's address path (never a ? or #), the part of the page the button is in (a tag name
 * and id such as "section#pricing", or "dialog") and the one word for the kind of site. It is sent as a plain POST with no
 * cookie and no identifier; the Worker adds one to a daily total and keeps no IP address or agent. Nothing is sent from a
 * browser under automation (navigator.webdriver), from any host but peakappsstudio.com, or by a page the build leaves without
 * this script (NO_PRO_SOURCE). A failed send is ignored: the Pro link works the same without it.
 * Tests: src/assets/_tests/pro-source.test.mjs (script), funnel-worker/test (Worker)
 */
(function () {
  'use strict';
  var VISIT = 'peak-source:visit';
  var FIRST = 'peak-source:first';
  var PRO = /^https:\/\/dorukctn\.gumroad\.com\/l\/([A-Za-z0-9_-]+)(?:[\/?#]|$)/;
  // the categories, and the utm_medium each one is reported with
  var MEDIUM = {
    'google': 'organic', 'bing': 'organic', 'other-search': 'organic', 'ai-assistant': 'referral',
    'pinterest': 'social', 'social': 'social', 'referral': 'referral', 'direct': 'none'
  };
  // Tested in this order against a host, so Gemini on google.com counts as an AI assistant.
  var SITES = [
    ['ai-assistant', /(^|\.)(chatgpt\.com|chat\.openai\.com|perplexity\.ai|copilot\.microsoft\.com|gemini\.google\.com|claude\.ai|you\.com|phind\.com|chat\.deepseek\.com|grok\.com|meta\.ai|duck\.ai|chat\.mistral\.ai|poe\.com)$/],
    ['google', /^((www|m|images)\.)?google\.(com?\.)?[a-z]{2,3}$/],
    ['bing', /(^|\.)bing\.com$/],
    ['other-search', /(^|\.)(duckduckgo\.com|search\.yahoo\.(com|co\.jp)|yandex\.(com?\.)?[a-z]{2,3}|ya\.ru|ecosia\.org|search\.brave\.com|search\.naver\.com|search\.seznam\.cz|qwant\.com|startpage\.com)$/],
    ['other-search', /^((www|m)\.)?baidu\.com$/],
    ['pinterest', /(^|\.)(pinterest\.(com?\.)?[a-z]{2,3}|pin\.it)$/],
    ['social', /(^|\.)(reddit\.com|redd\.it|facebook\.com|fb\.com|instagram\.com|x\.com|t\.co|twitter\.com|youtube\.com|youtu\.be|tiktok\.com|threads\.net|threads\.com|linkedin\.com|lnkd\.in|quora\.com)$/]
  ];
  // Android apps send android-app://<package>/ as the referrer. Any other app counts as a referral.
  var APPS = {
    'com.google.android.googlequicksearchbox': 'google',
    'com.microsoft.bing': 'bing',
    'com.duckduckgo.mobile.android': 'other-search',
    'com.openai.chatgpt': 'ai-assistant',
    'ai.perplexity.app.android': 'ai-assistant',
    'com.anthropic.claude': 'ai-assistant',
    'com.google.android.apps.bard': 'ai-assistant',
    'com.microsoft.copilot': 'ai-assistant',
    'com.pinterest': 'pinterest',
    'com.reddit.frontpage': 'social',
    'com.facebook.katana': 'social',
    'com.facebook.lite': 'social',
    'com.instagram.android': 'social',
    'com.instagram.barcelona': 'social',
    'com.twitter.android': 'social',
    'com.zhiliaoapp.musically': 'social',
    'com.ss.android.ugc.trill': 'social',
    'com.google.android.youtube': 'social',
    'com.linkedin.android': 'social',
    'com.quora.android': 'social'
  };
  // Tag values that name a site rather than give its address: utm_source=chatgpt, ref=reddit, source=fb_ads.
  var NAMES = [
    ['ai-assistant', /^(chatgpt|openai|perplexity|copilot|gemini|bard|claude|deepseek|grok|metaai|mistral|lechat|poe|phind)$/],
    ['google', /^google$/],
    ['bing', /^bing$/],
    ['other-search', /^(duckduckgo|ddg|yahoo|yandex|ecosia|brave|baidu|naver|qwant|startpage|seznam)$/],
    ['pinterest', /^pinterest$/],
    ['social', /^(reddit|facebook|fb|instagram|ig|x|twitter|youtube|yt|tiktok|threads|linkedin|quora)$/]
  ];
  function own(map, k) { return Object.prototype.hasOwnProperty.call(map, k) ? map[k] : ''; }
  // this site (whatever host it is served from) and Gumroad
  function ours(host, ownHost) {
    return host === String(ownHost || '').toLowerCase() || /^(www\.)?peakappsstudio\.com$/.test(host) || /(^|\.)(gumroad\.com|gum\.co)$/.test(host);
  }
  function siteOf(host) {
    for (var i = 0; i < SITES.length; i++) if (SITES[i][1].test(host)) return SITES[i][0];
    return '';
  }

  // The kind of site a referrer belongs to. '' means "do not record": this site, Gumroad, or nothing readable.
  function classify(referrer, ownHost) {
    if (!referrer) return 'direct';
    var m = /^([a-z][a-z0-9+.\-]*):\/\/(?:[^@\/?#]*@)?(\[[^\]]*\]|[^\/?#:]*)/i.exec(String(referrer));
    if (!m) return '';
    var scheme = m[1].toLowerCase(), host = m[2].toLowerCase().replace(/\.$/, '');
    if (scheme === 'android-app') return host ? (own(APPS, host) || 'referral') : '';
    if ((scheme !== 'http' && scheme !== 'https') || !host) return '';
    if (ours(host, ownHost)) return '';
    return siteOf(host) || 'referral';
  }

  // The kind of site one tag value names. '' when it names this site or Gumroad (then the referrer decides).
  function tagKind(value, ownHost) {
    var v = String(value).trim().toLowerCase();
    if (own(MEDIUM, v)) return v;
    var m = /^(?:[a-z][a-z0-9+.\-]*:\/\/)?(?:[^@\/?#]*@)?([a-z0-9-]+(?:\.[a-z0-9-]+)+)\.?(?:[:\/?#]|$)/.exec(v);
    if (m) return ours(m[1], ownHost) ? '' : (siteOf(m[1]) || 'referral');
    var whole = v.replace(/[^a-z0-9]+/g, ''), head = v.split(/[^a-z0-9]+/)[0];
    if (/^(gumroad|peakapps|peakappsstudios?)$/.test(whole)) return '';
    for (var i = 0; i < NAMES.length; i++) if (NAMES[i][1].test(whole) || NAMES[i][1].test(head)) return NAMES[i][0];
    return 'referral';
  }
  // The landing address's tag: utm_source, then ref, then source. '' when there is none to go by.
  function fromTags(search, ownHost) {
    var q = new URLSearchParams(search || '');
    var v = (q.get('utm_source') || '').trim() || (q.get('ref') || '').trim() || (q.get('source') || '').trim();
    return v ? tagKind(v, ownHost) : '';
  }

  // The link with the source added. '' when it is not a Pro link or already has a utm_source.
  function tag(href, source, campaign) {
    var m = PRO.exec(href);
    if (!m || !own(MEDIUM, source)) return '';
    var hash = '', at = href.indexOf('#');
    if (at > -1) { hash = href.slice(at); href = href.slice(0, at); }
    var qs = href.indexOf('?'), base = qs > -1 ? href.slice(0, qs) : href;
    var params = qs > -1 ? href.slice(qs + 1).split('&').filter(Boolean) : [];
    var has = function (k) { for (var i = 0; i < params.length; i++) if (params[i] === k || params[i].indexOf(k + '=') === 0) return true; return false; };
    if (has('utm_source')) return '';
    params.push('utm_source=' + source);
    if (!has('utm_medium')) params.push('utm_medium=' + MEDIUM[source]);
    if (!has('utm_campaign')) params.push('utm_campaign=' + encodeURIComponent(campaign || m[1].replace(/-pro$/, '')));
    return base + '?' + params.join('&') + hash;
  }

  function read(area, key) {
    try { var v = window[area].getItem(key); return own(MEDIUM, v) ? v : ''; } catch (e) { return ''; }
  }
  function readFirst() { var v = read('localStorage', FIRST); return v === 'direct' ? '' : v; }

  var script = document.currentScript;
  var campaign = '';
  try { campaign = ((script && script.getAttribute('data-campaign')) || '').toLowerCase(); } catch (e) {}
  if (!/^[a-z0-9-]{1,60}$/.test(campaign)) campaign = '';

  var here = '';
  try { here = fromTags(location.search, location.hostname) || classify(document.referrer, location.hostname); } catch (e) {}
  var visit = read('sessionStorage', VISIT) || here;
  var first = readFirst() || (here === 'direct' ? '' : here);
  var remember = function () {
    try { if (here && !read('sessionStorage', VISIT)) window.sessionStorage.setItem(VISIT, here); } catch (e) {}
    try { if (here && here !== 'direct' && !readFirst()) window.localStorage.setItem(FIRST, here); } catch (e) {}
  };
  // A page Chrome prerenders in the background is only counted once the visitor opens it.
  if (here) { if (document.prerendering) document.addEventListener('prerenderingchange', remember); else remember(); }

  // what a Pro click reports: the first word in this browser (another tab may have written it since this page loaded),
  // else this visit's word, else direct
  function source() { return readFirst() || first || visit || 'direct'; }

  // The link changes only as the visitor follows it (mouse, touch, keyboard, or a new tab), so the page as served keeps the
  // plain product link.
  function swap(e) {
    try {
      var a = e.target && e.target.closest ? e.target.closest('a[href]') : null;
      if (!a || !PRO.test(a.href)) return;
      var next = tag(a.href, source(), campaign);
      if (next) a.href = next;
    } catch (err) {}
  }
  if (document.addEventListener) {
    document.addEventListener('mousedown', swap, true);
    document.addEventListener('touchstart', swap, { capture: true, passive: true });
    document.addEventListener('click', swap, true);
  }

  // ---- the Pro click counter (see the header) ----
  var COUNT_URL = 'https://peak-funnel.railer-iot.workers.dev/e';
  var COUNT_HOST = /^(www\.)?peakappsstudio\.com$/;
  // The pages that pull search traffic are left exactly as they were: build.mjs writes their paths here (NO_BEACON) when it copies
  // this file, and nothing is counted on them. In the source it is empty.
  var NO_COUNT = ["/coop-designer/","/pt-br/galinheiro/","/es/gallinero/","/fr/poulailler/","/dropped-kerb/waltham-forest/","/without-planning/ireland/detached-auxiliary-dwelling/","/tumbler-template/conical-warp/","/sim-rig-designer/sim-rig-cnc-plans/","/pt-br/cockpit-simulador/medidas-cockpit-simulador/","/fr/cockpit-simracing/dimensions-cockpit-simracing/","/it/cockpit-sim-racing/","/pay-gap-report/eu-pay-transparency-directive/"];
  function pagePath() {
    var p = '';
    try { p = String(location.pathname || '').toLowerCase(); } catch (e) {}
    return /^\/[a-z0-9\/._-]{0,119}$/.test(p) ? p : '';
  }
  // the part of the page a button sits in: "dialog", the nearest data-pro-place, or the nearest landmark (tag and id)
  function place(el) {
    try {
      if (el.closest('dialog')) return 'dialog';
      var named = el.closest('[data-pro-place]');
      var v = named ? String(named.getAttribute('data-pro-place') || '').toLowerCase() : '';
      if (/^[a-z0-9][a-z0-9#._-]{0,39}$/.test(v)) return v;
      var box = el.closest('header,nav,footer,aside,section,form,main');
      if (!box) return 'page';
      var id = String(box.id || '').toLowerCase().replace(/[^a-z0-9._-]/g, '').slice(0, 24);
      return String(box.tagName).toLowerCase() + (id ? '#' + id : '');
    } catch (e) { return 'page'; }
  }
  function count(event, where, tool) {
    try {
      if (!COUNT_HOST.test(location.hostname) || (typeof navigator !== 'undefined' && navigator.webdriver)) return;
      var here = pagePath();
      if (NO_COUNT.indexOf(here.slice(-1) === '/' ? here : here + '/') > -1) return;
      var body = JSON.stringify({ e: event, t: tool || campaign || 'site', p: here, w: where || '', s: source() });
      if (typeof fetch === 'function') {
        var sent = fetch(COUNT_URL, { method: 'POST', body: body, headers: { 'Content-Type': 'text/plain;charset=UTF-8' }, keepalive: true, credentials: 'omit', mode: 'cors' });
        if (sent && sent.catch) sent.catch(function () {});
      } else if (navigator.sendBeacon) {
        navigator.sendBeacon(COUNT_URL, new Blob([body], { type: 'text/plain;charset=UTF-8' }));
      }
    } catch (e) {}
  }
  var lastLink = null, lastAt = 0, keyAt = 0;
  // a Pro link followed: click, tap, keyboard or middle click (one count per link per two seconds)
  function followed(e) {
    try {
      if (e.type === 'auxclick' && e.button !== 1) return;
      var a = e.target && e.target.closest ? e.target.closest('a[href]') : null;
      var m = a && PRO.exec(a.href);
      if (!m) return;
      var now = Date.now();
      if (a === lastLink && now - lastAt < 2000) return;
      lastLink = a; lastAt = now;
      count('click', place(a), campaign || m[1].replace(/-pro$/, ''));
    } catch (err) {}
  }
  // the Pro window of license.js (a <dialog id="peak-license-dialog"> made on first use) opening
  function watchDialog() {
    try {
      if (!window.MutationObserver || !document.body) return;
      var opened = function () { count(Date.now() - keyAt < 1000 ? 'key' : 'gate', 'dialog'); };
      var attach = function (d, openNow) {
        var was = !!d.hasAttribute('open');
        if (openNow && was) opened();
        new MutationObserver(function () { var now = !!d.hasAttribute('open'); if (now && !was) opened(); was = now; }).observe(d, { attributes: true, attributeFilter: ['open'] });
      };
      var d = document.getElementById('peak-license-dialog');
      if (d) return attach(d, false);
      var mo = new MutationObserver(function () {
        var made = document.getElementById('peak-license-dialog');
        if (made) { mo.disconnect(); attach(made, true); }
      });
      mo.observe(document.body, { childList: true });
    } catch (err) {}
  }
  if (document.addEventListener) {
    document.addEventListener('click', followed, true);
    document.addEventListener('auxclick', followed, true);
    document.addEventListener('click', function (e) { try { if (e.target && e.target.closest && e.target.closest('[data-enter-key]')) keyAt = Date.now(); } catch (err) {} }, true);
    if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', watchDialog); else watchDialog();
  }
  window.PeakSource = { source: source, classify: classify, fromTags: fromTags, tag: tag, place: place, count: count, COUNT_URL: COUNT_URL };
})();
