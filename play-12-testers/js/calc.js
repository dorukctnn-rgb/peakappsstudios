/* Day14 date calculator: the day a closed test can ask for production access.
 * Day 0 is the date the Dashboard first counted 12 testers opted in; the 14 days are complete 14 calendar days later. For our
 * first two apps the 12th opt-in came on 12 October 2026 and Console showed 14 days on 26 October. Console decides: this is
 * only the date to look for the button. Dates are plain calendar days (UTC arithmetic, so a clock change cannot move a day).
 * Runs in the page and in Node (module.exports) for the unit tests. Nothing leaves the browser. */
(function (root) {
  'use strict';
  var DAYS = 14;
  var MS = 86400000;
  function parse(iso) {
    var m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(String(iso || ''));
    if (!m) return null;
    var d = new Date(Date.UTC(+m[1], +m[2] - 1, +m[3]));
    if (d.getUTCFullYear() !== +m[1] || d.getUTCMonth() !== +m[2] - 1 || d.getUTCDate() !== +m[3]) return null;
    return d;
  }
  function iso(d) { return d.toISOString().slice(0, 10); }
  function addDays(d, n) { return new Date(d.getTime() + n * MS); }
  // reachedISO: the day the count reached 12; todayISO: the day to measure from
  function plan(reachedISO, todayISO) {
    var reached = parse(reachedISO), today = parse(todayISO);
    if (!reached || !today) return { ok: false };
    var diff = Math.round((today.getTime() - reached.getTime()) / MS);
    var state = diff < 0 ? 'future' : diff >= DAYS ? 'open' : 'running';
    var done = Math.max(0, Math.min(DAYS, diff));
    return {
      ok: true, state: state, reached: iso(reached), apply: iso(addDays(reached, DAYS)), today: iso(today),
      daysDone: done, daysLeft: DAYS - done, daysUntilStart: diff < 0 ? -diff : 0,
      half: iso(addDays(reached, DAYS / 2)), counterFirst: iso(addDays(reached, 1))
    };
  }
  var api = { plan: plan, parse: parse, DAYS: DAYS };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else root.Day14Calc = api;

  if (typeof document === 'undefined') return;
  var input = document.getElementById('calc-date');
  var out = document.getElementById('calc-out');
  if (!input || !out) return;
  var fmt = new Intl.DateTimeFormat('en-GB', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric', timeZone: 'UTC' });
  var fmtShort = new Intl.DateTimeFormat('en-GB', { weekday: 'short', day: 'numeric', month: 'short', timeZone: 'UTC' });
  function todayLocal() {
    var n = new Date();
    return n.getFullYear() + '-' + ('0' + (n.getMonth() + 1)).slice(-2) + '-' + ('0' + n.getDate()).slice(-2);
  }
  function el(tag, text, cls) { var e = document.createElement(tag); if (text != null) e.textContent = text; if (cls) e.className = cls; return e; }
  function render() {
    var p = plan(input.value, todayLocal());
    out.textContent = '';
    if (!p.ok) {
      out.appendChild(el('p', 'Enter the day Console first showed 12 testers opted in. The date to look for the button appears here.'));
      return;
    }
    var big = el('p', null, 'big'); big.appendChild(el('span', fmt.format(parse(p.apply)))); out.appendChild(big);
    var lead = {
      running: 'Day ' + p.daysDone + ' of 14 today, ' + p.daysLeft + ' to go. Look for the Apply for production button on this date.',
      open: 'Your 14 days are over, if the count never fell below 12 and testers stayed opted in. Open the Dashboard: the button should be there.',
      future: 'That day has not come yet. If the 12th tester opts in on it, this is the date to look for the button.'
    }[p.state];
    out.appendChild(el('p', lead));
    var dl = el('dl');
    function row(a, b) { dl.appendChild(el('dt', a)); dl.appendChild(el('dd', b)); }
    row('12 opted in on', fmtShort.format(parse(p.reached)));
    row('Counter starts showing days', fmtShort.format(parse(p.counterFirst)));
    row('Halfway, time for the update', fmtShort.format(parse(p.half)));
    row('Counter should read 14 days', fmtShort.format(parse(p.apply)));
    out.appendChild(dl);
    out.appendChild(el('p', 'From our own two apps: the counter reached 14 on the expected date, between 10:12 and 19:45. Look again the next morning. If the count falls below 12 the clock may restart; we have not tested what Console does, so keep 15 to 20 testers opted in.', 'hint'));
  }
  input.addEventListener('input', render);
  input.addEventListener('change', render);
  var btn = document.getElementById('calc-today');
  if (btn) btn.addEventListener('click', function () { input.value = todayLocal(); render(); input.focus(); });
  render();
})(typeof window !== 'undefined' ? window : globalThis);
