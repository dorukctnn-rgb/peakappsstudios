/* Day14 answer drafts: live counters, sentence frames, copy and download. Everything typed stays in this tab: nothing is
 * stored (no localStorage, no cookie) and nothing is sent. */
(function () {
  'use strict';
  var items = Array.prototype.slice.call(document.querySelectorAll('.qa-item'));
  if (!items.length) return;
  var toastTimer = null;
  function toast(msg) {
    var t = document.getElementById('pk-toast');
    if (!t) { t = document.createElement('div'); t.id = 'pk-toast'; t.className = 'toast'; t.setAttribute('role', 'status'); document.body.appendChild(t); }
    t.textContent = msg; t.classList.add('show');
    clearTimeout(toastTimer); toastTimer = setTimeout(function () { t.classList.remove('show'); }, 2800);
  }
  function chars(s) { return Array.from(s).length; }
  function openBraces(s) { var m = s.match(/\{[^}]*\}/g); return m ? m.length : 0; }
  function copyText(text) {
    if (navigator.clipboard && navigator.clipboard.writeText) return navigator.clipboard.writeText(text);
    return new Promise(function (resolve, reject) {
      var ta = document.createElement('textarea'); ta.value = text; ta.setAttribute('readonly', ''); ta.style.position = 'fixed'; ta.style.opacity = '0';
      document.body.appendChild(ta); ta.select();
      try { document.execCommand('copy') ? resolve() : reject(new Error('copy failed')); } catch (e) { reject(e); } finally { document.body.removeChild(ta); }
    });
  }
  function valueOf(item) {
    var ta = item.querySelector('textarea');
    if (ta) return ta.value.trim();
    var r = item.querySelector('input[type="radio"]:checked');
    return r ? r.value : '';
  }
  function limitOf(ta) { return Number(ta.getAttribute('data-limit')) || 300; }
  function refresh(item) {
    var ta = item.querySelector('textarea');
    var count = item.querySelector('.qa-count');
    if (ta) {
      var limit = limitOf(ta);
      var n = chars(ta.value), open = openBraces(ta.value);
      var state = n > limit ? 'over' : open ? 'open' : '';
      count.textContent = n + ' of ' + limit + ' characters' + (n > limit ? ', ' + (n - limit) + ' too many' : '') + (open ? ', ' + open + ' {brace} still to fill' : '');
      if (state) count.setAttribute('data-state', state); else count.removeAttribute('data-state');
      var fb = item.querySelector('[data-frame-btn]');
      if (fb) { fb.disabled = ta.value.length > 0; fb.title = fb.disabled ? 'Clear the box first, so nothing you wrote is replaced' : ''; }
    } else {
      var v = valueOf(item);
      count.textContent = v ? 'Chosen: ' + v : 'Nothing chosen';
    }
  }
  items.forEach(function (item) {
    var ta = item.querySelector('textarea');
    if (ta) ta.addEventListener('input', function () { refresh(item); });
    Array.prototype.forEach.call(item.querySelectorAll('input[type="radio"]'), function (r) { r.addEventListener('change', function () { refresh(item); }); });
    var fb = item.querySelector('[data-frame-btn]');
    if (fb) fb.addEventListener('click', function () { if (ta.value.length) return; ta.value = ta.getAttribute('data-frame'); refresh(item); ta.focus(); });
    var cp = item.querySelector('[data-copy]');
    if (cp) cp.addEventListener('click', function () {
      var v = valueOf(item);
      if (!v) { toast('Nothing to copy yet.'); return; }
      var open = ta ? openBraces(v) : 0, over = ta && chars(v) > limitOf(ta);
      copyText(v).then(function () {
        toast(open ? 'Copied. ' + open + ' {brace} still to fill.' : over ? 'Copied, but it is over the limit.' : 'Copied.');
      }, function () { toast('Copy was blocked. Select the text and copy it by hand.'); });
    });
    refresh(item);
  });
  function everything() {
    var open = 0, lines = [];
    items.forEach(function (item, i) {
      var q = item.querySelector('.q'), v = valueOf(item), ta = item.querySelector('textarea');
      if (ta) open += openBraces(v);
      lines.push((i + 1) + '. ' + q.textContent.replace(/^The form asks:\s*/, '') + '\n' + (v || '(not answered yet)'));
    });
    return { text: lines.join('\n\n') + '\n', open: open };
  }
  var all = document.getElementById('copy-all');
  var status = document.getElementById('all-status');
  if (all) all.addEventListener('click', function () {
    var e = everything();
    copyText(e.text).then(function () {
      var msg = e.open ? 'Copied all nine. ' + e.open + ' {brace} still to fill.' : 'Copied all nine.';
      toast(msg); if (status) status.textContent = msg;
    }, function () { toast('Copy was blocked. Use Download as text.'); });
  });
  var dl = document.getElementById('dl-all');
  if (dl) dl.addEventListener('click', function () {
    var e = everything();
    var blob = new Blob([e.text], { type: 'text/plain;charset=utf-8' });
    var url = URL.createObjectURL(blob);
    var a = document.createElement('a'); a.href = url; a.download = 'production-access-answers-draft.txt';
    document.body.appendChild(a); a.click(); document.body.removeChild(a);
    setTimeout(function () { URL.revokeObjectURL(url); }, 1000);
    if (status) status.textContent = 'Downloaded production-access-answers-draft.txt.';
  });
})();
