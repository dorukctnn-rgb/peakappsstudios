/* Dayfold: the numbers shown on the page, worked out from the entries that parse.js read. Pure functions, no DOM.
 * A day's mood is the average of that day's entries (mood 5 is the best of the five levels, 1 the lowest). */
const p2 = n => String(n).padStart(2, '0');
const round1 = x => Math.round(x * 10) / 10;
const dayIndex = (y, m, d) => Math.floor(Date.UTC(y, m, d) / 864e5);

// key -> { key, y, m, d, dow, n, sum, avg, scores }
export function days(entries) {
  const map = new Map();
  for (const e of entries) {
    let x = map.get(e.key);
    if (!x) { x = { key: e.key, y: e.y, m: e.m, d: e.d, dow: e.dow, n: 0, sum: 0, rated: 0, avg: null, tags: new Set() }; map.set(e.key, x); }
    x.n++;
    if (e.score != null) { x.sum += e.score; x.rated++; x.avg = x.sum / x.rated; }
    for (const t of e.tags) x.tags.add(t);
  }
  return map;
}

// the colour step of a day: the average, rounded half up (3.5 -> 4)
export const level = avg => (avg == null ? null : Math.min(5, Math.max(1, Math.floor(avg + 0.5))));

export function yearsOf(entries) {
  const by = new Map();
  for (const e of entries) { const r = by.get(e.y) || { y: e.y, entries: 0, days: new Set() }; r.entries++; r.days.add(e.key); by.set(e.y, r); }
  return [...by.values()].sort((a, b) => a.y - b.y).map(r => ({ y: r.y, entries: r.entries, days: r.days.size }));
}

// the years the free version shows: the latest year in the backup and, in January and February, the year before it too
export function freeYears(years, now = new Date()) {
  if (!years.length) return [];
  const last = Math.max(...years);
  const out = [last];
  if (now.getMonth() < 2 && last === now.getFullYear() && years.includes(last - 1)) out.push(last - 1);
  return out.sort((a, b) => a - b);
}

function longestStreak(keys) {
  const idx = [...keys].map(k => { const [y, m, d] = k.split('-').map(Number); return dayIndex(y, m - 1, d); }).sort((a, b) => a - b);
  let best = 0, run = 0, prev = null, end = null, bestEnd = null;
  for (const i of idx) { run = prev != null && i === prev + 1 ? run + 1 : 1; prev = i; end = i; if (run > best) { best = run; bestEnd = end; } }
  if (!best) return { days: 0, from: null, to: null };
  const iso = i => new Date(i * 864e5).toISOString().slice(0, 10);
  return { days: best, from: iso(bestEnd - best + 1), to: iso(bestEnd) };
}
const wordsIn = s => (s ? (s.match(/[\p{L}\p{N}][\p{L}\p{N}'’-]*/gu) || []).length : 0);

// the summary of one year (y) or of every year in `ys`
export function summary(journal, ys) {
  const set = new Set(Array.isArray(ys) ? ys : [ys]);
  const list = journal.entries.filter(e => set.has(e.y));
  const D = days(list);
  const dist = [0, 0, 0, 0, 0, 0]; // index 1..5 by entry
  const months = Array.from({ length: 12 }, () => ({ n: 0, sum: 0, rated: 0, levels: [0, 0, 0, 0, 0, 0] }));
  const wd = Array.from({ length: 7 }, () => ({ sum: 0, n: 0 }));
  const hours = new Array(24).fill(0);
  let words = 0, photos = 0, voice = 0, titled = 0, noted = 0, sum = 0, rated = 0;
  for (const e of list) {
    const M = months[e.m];
    M.n++;
    if (e.score != null) { dist[e.score]++; M.sum += e.score; M.rated++; M.levels[e.score]++; sum += e.score; rated++; }
    hours[e.h]++;
    words += wordsIn(e.text) + wordsIn(e.title);
    if (e.text) noted++;
    if (e.title) titled++;
    for (const a of e.assets) { const A = journal.assets.get(a); if (A && A.type === 'photo') photos++; else if (A && A.type === 'audio') voice++; }
  }
  for (const x of D.values()) if (x.avg != null) { wd[x.dow].sum += x.avg; wd[x.dow].n++; }
  const dayLevels = [0, 0, 0, 0, 0, 0];
  for (const x of D.values()) { const l = level(x.avg); if (l) dayLevels[l]++; }
  // top activities by the number of days they were logged on
  const tagDays = new Map();
  for (const x of D.values()) for (const t of x.tags) tagDays.set(t, (tagDays.get(t) || 0) + 1);
  const top = [...tagDays.entries()].sort((a, b) => b[1] - a[1] || a[0] - b[0]).slice(0, 8).map(([id, n]) => ({ id, days: n }));
  return {
    years: [...set].sort((a, b) => a - b),
    entries: list.length, days: D.size, words, photos, voice, titled, noted,
    avg: rated ? round1(sum / rated) : null,
    dist, dayLevels,
    months: months.map((M, i) => ({ m: i, n: M.n, avg: M.rated ? round1(M.sum / M.rated) : null, levels: M.levels })),
    weekdays: wd.map((w, i) => ({ dow: i, avg: w.n ? round1(w.sum / w.n) : null, days: w.n })),
    hours,
    streak: longestStreak(D.keys()),
    top,
    bestMonth: (() => { let b = null; months.forEach((M, i) => { if (M.rated >= 5 && (!b || M.sum / M.rated > b.avg)) b = { m: i, avg: M.sum / M.rated }; }); return b && { m: b.m, avg: round1(b.avg) }; })(),
  };
}

// one row per year (for "every year" in Pro)
export function byYear(journal) {
  const ys = yearsOf(journal.entries).map(r => r.y);
  return ys.map(y => { const s = summary(journal, y); return { y, entries: s.entries, days: s.days, avg: s.avg, dayLevels: s.dayLevels, photos: s.photos, words: s.words }; });
}

// the Year in Pixels: 12 months x 31 days, each the day's colour step, 0 for a day with no entry, -1 for a date that does not exist
export function pixels(journal, y) {
  const D = days(journal.entries.filter(e => e.y === y));
  const grid = [];
  for (let m = 0; m < 12; m++) {
    const len = new Date(Date.UTC(y, m + 1, 0)).getUTCDate();
    const col = [];
    for (let d = 1; d <= 31; d++) {
      if (d > len) { col.push(-1); continue; }
      const x = D.get(`${y}-${p2(m + 1)}-${p2(d)}`);
      col.push(x ? (level(x.avg) || 0) : 0);
    }
    grid.push(col);
  }
  return grid;
}

// the entries of one month (newest first), with what the page needs to show them
export function monthEntries(journal, y, m) {
  return journal.entries.filter(e => e.y === y && e.m === m).sort((a, b) => b.t - a.t || b.id - a.id);
}
export function monthDays(journal, y, m) {
  const D = days(journal.entries.filter(e => e.y === y && e.m === m));
  return [...D.values()].map(x => ({ d: x.d, n: x.n, level: level(x.avg) }));
}

// activities: how often each was logged, in the years given
export function activityCounts(journal, ys) {
  const set = new Set(ys);
  const list = journal.entries.filter(e => set.has(e.y));
  const D = days(list);
  const out = new Map();
  for (const t of journal.tags) out.set(t.id, { id: t.id, entries: 0, days: 0, last: null });
  for (const e of list) for (const t of e.tags) { const r = out.get(t); if (r) { r.entries++; if (!r.last || e.key > r.last) r.last = e.key; } }
  for (const x of D.values()) for (const t of x.tags) { const r = out.get(t); if (r) r.days++; }
  return { totalDays: D.size, rows: [...out.values()].filter(r => r.entries > 0).sort((a, b) => b.days - a.days || b.entries - a.entries) };
}

// Pro: the average mood of the days with an activity against the days without it. A correlation in your own entries,
// never a cause. Activities logged on fewer than `min` days, or missing from fewer than `min` days, are left out.
export function activityMoods(journal, ys, min = 5) {
  const set = new Set(ys);
  const D = [...days(journal.entries.filter(e => set.has(e.y))).values()].filter(x => x.avg != null);
  const total = D.reduce((a, x) => a + x.avg, 0);
  const rows = [];
  for (const t of journal.tags) {
    let n = 0, s = 0;
    for (const x of D) if (x.tags.has(t.id)) { n++; s += x.avg; }
    const nOut = D.length - n;
    if (n < min || nOut < min) continue;
    const withAvg = s / n, withoutAvg = (total - s) / nOut;
    rows.push({ id: t.id, withDays: n, withoutDays: nOut, with: round1(withAvg), without: round1(withoutAvg), diff: Math.round((withAvg - withoutAvg) * 100) / 100 });
  }
  rows.sort((a, b) => b.diff - a.diff || b.withDays - a.withDays);
  return { days: D.length, overall: D.length ? round1(total / D.length) : null, rows, min };
}

// search: notes, titles and activity names. Returns matches in the years given (newest first, at most `limit`) and,
// for the other years, only how many there are.
export function search(journal, q, ys, limit = 200) {
  const needle = String(q || '').trim().toLocaleLowerCase();
  if (needle.length < 2) return { q: needle, total: 0, shown: [], elsewhere: {} };
  const set = new Set(ys);
  const tagHit = new Set(journal.tags.filter(t => t.name.toLocaleLowerCase().includes(needle)).map(t => t.id));
  const shown = [], elsewhere = {};
  let total = 0;
  for (let i = journal.entries.length - 1; i >= 0; i--) {
    const e = journal.entries[i];
    const hit = (e.text && e.text.toLocaleLowerCase().includes(needle)) || (e.title && e.title.toLocaleLowerCase().includes(needle)) || e.tags.some(t => tagHit.has(t));
    if (!hit) continue;
    if (set.has(e.y)) { total++; if (shown.length < limit) shown.push(e); }
    else elsewhere[e.y] = (elsewhere[e.y] || 0) + 1;
  }
  return { q: needle, total, shown, elsewhere };
}

/* ---------- CSV: one row per entry ---------- */
const csvCell = v => {
  let s = v == null ? '' : String(v);
  if (/^[=+@\t\r]/.test(s) || /^-[^\s\d-]/.test(s)) s = "'" + s; // a cell a spreadsheet would run as a formula
  return /[",\r\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
};
export function toCsv(journal, ys, names) {
  const set = new Set(ys);
  const moodName = id => { const m = journal.moods.find(x => x.id === id); return m ? (m.name || names.mood(m.pre)) : ''; };
  const tagName = new Map(journal.tags.map(t => [t.id, t.name]));
  const head = ['date', 'time', 'weekday', 'mood', 'mood_level', 'activities', 'note_title', 'note', 'photos'];
  const rows = [head.join(',')];
  for (const e of journal.entries) {
    if (!set.has(e.y)) continue;
    const photos = e.assets.filter(a => (journal.assets.get(a) || {}).type === 'photo').length;
    rows.push([e.key, `${p2(e.h)}:${p2(e.mi)}`, names.weekday(e.dow), moodName(e.mood), e.score == null ? '' : e.score, e.tags.map(t => tagName.get(t)).join(' | '), e.title, e.text, photos].map(csvCell).join(','));
  }
  return '﻿' + rows.join('\r\n') + '\r\n';
}
