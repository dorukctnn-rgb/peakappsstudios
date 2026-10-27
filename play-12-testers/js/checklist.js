/* Day14 checklist: ticks are kept in this browser only (localStorage, one key), never sent anywhere. */
(function () {
  'use strict';
  var KEY = 'day14:checklist:v1';
  var boxes = Array.prototype.slice.call(document.querySelectorAll('input[data-cl]'));
  var count = document.getElementById('cl-count');
  var fill = document.getElementById('cl-fill');
  if (!boxes.length) return;
  function load() { try { var v = JSON.parse(localStorage.getItem(KEY) || '[]'); return Array.isArray(v) ? v : []; } catch (e) { return []; } }
  function save() {
    var ids = boxes.filter(function (b) { return b.checked; }).map(function (b) { return b.getAttribute('data-cl'); });
    try { localStorage.setItem(KEY, JSON.stringify(ids)); } catch (e) { /* private window or blocked storage: the page works without it */ }
  }
  function paint() {
    var n = boxes.filter(function (b) { return b.checked; }).length;
    if (count) count.textContent = n + ' of ' + boxes.length + ' done';
    if (fill) fill.style.width = Math.round((n / boxes.length) * 100) + '%';
  }
  var saved = load();
  boxes.forEach(function (b) {
    b.checked = saved.indexOf(b.getAttribute('data-cl')) > -1;
    b.addEventListener('change', function () { save(); paint(); });
  });
  var clear = document.getElementById('cl-clear');
  if (clear) clear.addEventListener('click', function () { boxes.forEach(function (b) { b.checked = false; }); save(); paint(); });
  var print = document.getElementById('cl-print');
  if (print) print.addEventListener('click', function () { window.print(); });
  paint();
})();
