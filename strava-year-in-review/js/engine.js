/* Yearlap engine: reads the activities.csv in a Strava bulk export, in whatever language the export was made in, and
 * works out a year of training. Pure functions: no DOM, no network. It runs in the page's worker and in Node for the tests.
 *
 * Why by position: Strava writes the column names, the dates and the first distance column in the account's language
 * ("Activity Date", "Datum van activiteit", "Date de l'activité"; "Aug 1, 2020, 12:02:05 AM", "18 mai 2026, 05:35:05";
 * "73.47", "4,97"). The order of the columns does not change with the language, and the export repeats two of them
 * ("Elapsed Time" and "Distance") in a second block of raw numbers (seconds and metres, always with a dot). Yearlap finds
 * that repeat, whatever the words are, and reads every number from the raw block. Names are only a fallback. */

export const CAT = { RUN: 'run', RIDE: 'ride', SWIM: 'swim', WALK: 'walk', WINTER: 'winter', WATER: 'water', GYM: 'gym', OTHER: 'other' };
const DAY = 864e5;

/* ---------------- text helpers ---------------- */
export const norm = s => String(s == null ? '' : s).normalize('NFKD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/[’`´]/g, "'").replace(/\s+/g, ' ').trim();

/* ---------------- CSV ---------------- */
// RFC 4180 with the delimiter taken from the header line (a CSV re-saved by a spreadsheet may use ; or a tab).
// Quoted fields may hold commas, quotes ("") and line breaks (activity descriptions often do).
export function parseCsv(text) {
  if (text.charCodeAt(0) === 0xfeff) text = text.slice(1);
  const nl = text.indexOf('\n');
  const first = nl < 0 ? text : text.slice(0, nl);
  const cnt = c => first.split(c).length - 1;
  const d = cnt(';') > cnt(',') && cnt(';') >= cnt('\t') ? ';' : cnt('\t') > cnt(',') ? '\t' : ',';
  const D = d.charCodeAt(0);
  const rows = [];
  const n = text.length;
  let row = [], field = '', i = 0, fresh = true;
  while (i < n) {
    const c = text.charCodeAt(i);
    if (c === 34 && fresh) {
      let j = i + 1, buf = '';
      for (;;) {
        const k = text.indexOf('"', j);
        if (k < 0) { buf += text.slice(j); i = n; break; }
        buf += text.slice(j, k);
        if (text.charCodeAt(k + 1) === 34) { buf += '"'; j = k + 2; continue; }
        i = k + 1; break;
      }
      field += buf; fresh = false;
      continue;
    }
    if (c === D) { row.push(field); field = ''; fresh = true; i++; continue; }
    if (c === 10 || c === 13) {
      row.push(field); rows.push(row); row = []; field = ''; fresh = true;
      if (c === 13 && text.charCodeAt(i + 1) === 10) i++;
      i++; continue;
    }
    let j = i;
    while (j < n) { const cc = text.charCodeAt(j); if (cc === D || cc === 10 || cc === 13) break; j++; }
    field += text.slice(i, j); fresh = false; i = j;
  }
  if (field !== '' || row.length) { row.push(field); rows.push(row); }
  return rows.filter(r => !(r.length === 1 && r[0].trim() === ''));
}

/* ---------------- numbers ---------------- */
// "73.47", "4,97", "1.234,5", "1,234.5", "18002.0"; empty is NaN
export function num(v) {
  if (v == null) return NaN;
  let s = String(v).trim();
  if (!s) return NaN;
  s = s.replace(/[\s  ']/g, '');
  const c = s.lastIndexOf(','), p = s.lastIndexOf('.');
  if (c >= 0 && p >= 0) s = c > p ? s.replace(/\./g, '').replace(',', '.') : s.replace(/,/g, '');
  else if (c >= 0) s = (s.match(/,/g).length === 1) ? s.replace(',', '.') : s.replace(/,/g, '');
  const x = Number(s);
  return Number.isFinite(x) ? x : NaN;
}

/* ---------------- dates ---------------- */
// Month names and their short forms in the languages Strava writes, keyed by their first letters (accents removed).
const MONTH_KEYS = {
  1: 'jan janv ene gen sty oca янв',
  2: 'feb fev fevr lut sub фев',
  3: 'mar mrt maa mrz мар',
  4: 'apr abr avr kwi nis апр',
  5: 'may mai mei mag maj мая маи',
  6: 'jun juin giu cze haz июн',
  7: 'jul juil lug lip tem июл',
  8: 'aug ago aou sie agu авг',
  9: 'sep set sept wrz eyl сен',
  10: 'oct okt ott out paz eki окт',
  11: 'nov lis kas ноя',
  12: 'dec dez dic des gru ara дек',
};
const MONTH = new Map();
for (const [m, keys] of Object.entries(MONTH_KEYS)) for (const k of keys.split(' ')) MONTH.set(k, Number(m));
export function monthOf(word) {
  const t = norm(word).replace(/[.]/g, '');
  for (let k = Math.min(5, t.length); k >= 3; k--) { const m = MONTH.get(t.slice(0, k)); if (m) return m; }
  return 0;
}
// Returns the time as UTC milliseconds (Strava writes the start in UTC), or NaN. order: 'dmy' | 'mdy' for all-number dates.
export function parseDate(raw, order = 'dmy') {
  const s = String(raw == null ? '' : raw).trim();
  if (!s) return NaN;
  let m = s.match(/^(\d{4})-(\d{1,2})-(\d{1,2})(?:[T ](\d{1,2}):(\d{2})(?::(\d{2}))?)?/);
  if (m) return build(+m[1], +m[2], +m[3], +(m[4] || 0), +(m[5] || 0), +(m[6] || 0));
  const tm = s.match(/(\d{1,2}):(\d{2})(?::(\d{2}))?/);
  let H = 0, Mi = 0, S = 0, rest = s;
  if (tm) { H = +tm[1]; Mi = +tm[2]; S = +(tm[3] || 0); rest = s.slice(0, tm.index) + ' ' + s.slice(tm.index + tm[0].length); }
  const low = rest.toLowerCase();
  const pm = /(^|[^\p{L}])p\.?\s?m\.?(?=$|[^\p{L}])|오후|下午|午後|nachm/u.test(low);
  const am = !pm && /(^|[^\p{L}])a\.?\s?m\.?(?=$|[^\p{L}])|오전|上午|午前|vorm/u.test(low);
  if (pm && H < 12) H += 12;
  if (am && H === 12) H = 0;
  const nums = (rest.match(/\d+/g) || []);
  const words = (rest.match(/\p{L}+/gu) || []);
  let mon = 0;
  for (const w of words) { if (w.length >= 3) { mon = monthOf(w); if (mon) break; } }
  let y, mo, d;
  if (mon) {
    const yi = nums.findIndex(x => x.length === 4);
    if (yi < 0) return NaN;
    y = +nums[yi];
    const dd = nums.find((x, i) => i !== yi && x.length <= 2);
    if (dd == null) return NaN;
    mo = mon; d = +dd;
  } else {
    if (nums.length < 3) return NaN;
    if (nums[0].length === 4) { y = +nums[0]; mo = +nums[1]; d = +nums[2]; }
    else {
      const a = +nums[0], b = +nums[1];
      y = nums[2].length === 2 ? 2000 + +nums[2] : +nums[2];
      if (a > 12) { d = a; mo = b; } else if (b > 12) { mo = a; d = b; } else if (order === 'mdy') { mo = a; d = b; } else { d = a; mo = b; }
    }
  }
  return build(y, mo, d, H, Mi, S);
}
function build(y, mo, d, H, Mi, S) {
  if (!(y >= 1990 && y <= 2100 && mo >= 1 && mo <= 12 && d >= 1 && d <= 31 && H >= 0 && H < 24 && Mi < 60 && S < 61)) return NaN;
  const t = Date.UTC(y, mo - 1, d, H, Mi, S);
  return new Date(t).getUTCDate() === d ? t : NaN;
}
// All-number dates (8/1/2020) only: which comes first, day or month? Decided from the whole column.
export function dateOrder(values) {
  let dmy = 0, mdy = 0;
  for (const v of values) {
    const s = String(v || '');
    if (/\p{L}{3,}/u.test(s.replace(/\b(am|pm|a\.m\.|p\.m\.)\b/gi, ''))) continue;
    const m = s.match(/^\s*(\d{1,2})[./-](\d{1,2})[./-](\d{2,4})/);
    if (!m) continue;
    if (+m[1] > 12) dmy++; else if (+m[2] > 12) mdy++;
  }
  return mdy > dmy ? 'mdy' : 'dmy';
}

/* ---------------- sport categories ---------------- */
// The activity type is written in the export's language ("Run", "Hardloopsessie", "Vélo"). Yearlap keeps the label as it
// is and only sorts it into a family for colour and for pace or speed, from word parts in several languages.
const FAMILY = [
  [CAT.WINTER, ['ski', 'langlauf', 'snowboard', 'snowshoe', 'schneeschuh', 'sneeuwschoen', 'raquette', 'ciaspol', 'iceskat', 'ice skate', 'eisschnell', 'schaats', 'patinage sur glace']],
  [CAT.RIDE, ['ride', 'fietsrit', 'fiets', 'radfahrt', 'radtour', 'rad', 'velo', 'bici', 'cicl', 'bike', 'pedal', 'cykel', 'rower', 'mtb', 'vtt', 'gravel', 'handcycle', 'handbike', 'velomobil', 'cycl', 'wielrennen']],
  [CAT.RUN, ['run', 'lauf', 'hardloop', 'course', 'carrera', 'corsa', 'corrida', 'trail', 'lop', 'bieg', 'jog']],
  [CAT.SWIM, ['swim', 'schwimm', 'zwem', 'natation', 'natac', 'nuoto', 'simning', 'plyw']],
  [CAT.WALK, ['walk', 'wander', 'wandel', 'hike', 'hiken', 'hiking', 'spazier', 'marche', 'randonn', 'camin', 'cammin', 'passegg', 'escurs', 'excurs', 'trilh', 'senderismo', 'trekking', 'vandring', 'spacer', 'gehen', 'wheelchair', 'rolstoel', 'rollstuhl']],
  [CAT.WATER, ['row', 'ruder', 'roei', 'aviron', 'remo', 'canoe', 'kanu', 'kano', 'kayak', 'kajak', 'paddl', 'stand up', 'surf', 'sail', 'segel', 'zeil', 'voile', 'vela', 'kite', 'windsurf']],
  [CAT.GYM, ['weight', 'kraft', 'kracht', 'muscu', 'pesas', 'pesi', 'workout', 'training', 'yoga', 'pilates', 'crossfit', 'hiit', 'ellipt', 'stair', 'fitness', 'allenamento', 'entrenamiento', 'treino', 'musculacion']],
];
const famCache = new Map();
export function family(type) {
  const key = norm(type);
  if (famCache.has(key)) return famCache.get(key);
  let f = CAT.OTHER;
  for (const [cat, parts] of FAMILY) if (parts.some(p => key.includes(p))) { f = cat; break; }
  famCache.set(key, f);
  return f;
}
// distance sports: pace (run, walk, swim) or speed (ride, winter, water)
export const paceSport = cat => cat === CAT.RUN || cat === CAT.WALK || cat === CAT.SWIM;

/* ---------------- the layout of activities.csv ---------------- */
const ALIAS = {
  elapsed: ['elapsed time', 'verstreken tijd', 'temps ecoule', 'verstrichene zeit', 'tiempo transcurrido', 'tempo trascorso', 'tempo decorrido'],
  distance: ['distance', 'afstand', 'distanz', 'distancia', 'distanza', 'strecke'],
  moving: ['moving time', 'beweegtijd', 'duree de deplacement', 'bewegungszeit', 'tiempo en movimiento', 'tempo in movimento', 'tempo em movimento'],
  elevGain: ['elevation gain', 'totale stijging', 'denivele positif', 'hohenmeter', 'hoehenmeter', 'hohenzunahme', 'desnivel positivo', 'dislivello positivo', 'ganho de elevacao'],
  gear: ['activity gear', 'uitrusting voor activiteit', "materiel utilise pour l'activite", 'aktivitatsausrustung', 'ausrustung', 'equipo de la actividad', 'attrezzatura attivita', 'equipamento da atividade'],
  file: ['filename', 'bestandsnaam', 'nom du fichier', 'dateiname', 'nombre del archivo', 'nome file', 'nome do arquivo'],
};
const LANG_CUES = [['en', /^activity id$/], ['nl', /^activiteit/], ['fr', /activite$/], ['de', /^aktivit/], ['es', /actividad/], ['it', /attivita/], ['pt', /atividade/]];
export function guessLanguage(header) {
  const h0 = norm(header[0]);
  for (const [l, re] of LANG_CUES) if (re.test(h0)) return l;
  return /[a-z]/.test(h0) ? 'other' : 'other';
}
const FILE_RE = /^(?:[^,]*[\\/])?activities[\\/][^\\/]+\.(?:gpx|fit|tcx)(?:\.gz)?$/i;
export function detectLayout(header, rows) {
  const h = header.map(norm);
  const L = { id: 0, date: 1, name: 2, type: 3, elapsed: -1, dist1: -1, moving: -1, dist2: -1, elevGain: -1, gear: -1, file: -1, how: '', unit1: 'km', columns: header.length, lang: guessLanguage(header) };
  // 1. structure: the second block repeats "Elapsed Time" and "Distance" (in any language), with "Moving Time" between them
  outer: for (let i = 4; i < Math.min(h.length - 1, 16); i++) {
    if (!h[i] || !h[i + 1]) continue;
    for (let j = i + 2; j + 2 < h.length; j++) {
      if (h[j] === h[i] && h[j + 2] === h[i + 1]) {
        Object.assign(L, { elapsed: i, dist1: i + 1, moving: j + 1, dist2: j + 2, elevGain: j + 5, how: 'position' });
        break outer;
      }
    }
  }
  // 2. names, for an export without the second block
  const byName = (key, from = 0) => h.findIndex((x, k) => k >= from && ALIAS[key].includes(x));
  if (L.elapsed < 0) {
    L.elapsed = byName('elapsed'); L.dist1 = byName('distance'); L.moving = byName('moving'); L.elevGain = byName('elevGain');
    const d2 = L.dist1 >= 0 ? byName('distance', L.dist1 + 1) : -1;
    if (d2 > 0) L.dist2 = d2;
    L.how = L.elapsed >= 0 || L.dist1 >= 0 ? 'names' : 'none';
  }
  // 3. the file column, by its values (activities/123.fit.gz, or #error#), then by name
  const sample = rows.slice(0, 400);
  let best = -1, bestN = 0;
  for (let c = 4; c < Math.min(h.length, 40); c++) {
    let k = 0;
    for (const r of sample) { const v = (r[c] || '').trim(); if (v && (FILE_RE.test(v) || v === '#error#')) k++; }
    if (k > bestN) { bestN = k; best = c; }
  }
  L.file = best >= 0 ? best : byName('file');
  // 4. gear sits right before the file column in every layout seen; check it is not the true/false commute column
  if (L.file > 4) {
    const g = L.file - 1;
    const vals = sample.map(r => (r[g] || '').trim()).filter(Boolean);
    const bool = vals.filter(v => /^(true|false)$/i.test(v)).length;
    if (!vals.length || bool < vals.length / 2) L.gear = g;
  }
  if (L.gear < 0) L.gear = byName('gear');
  // 5. the unit of the first, localised distance (km or mi), from the metres in the raw block
  if (L.dist1 >= 0 && L.dist2 >= 0) {
    const ratios = [];
    for (const r of sample) { const a = num(r[L.dist1]), b = num(r[L.dist2]); if (a > 0.2 && b > 0) ratios.push(b / a); }
    ratios.sort((x, y) => x - y);
    const med = ratios.length ? ratios[ratios.length >> 1] : 1000;
    L.unit1 = med > 1300 && med < 1900 ? 'mi' : 'km';
  }
  return L;
}

/* ---------------- reading the file ---------------- */
export function createStore() {
  return { acts: [], ids: new Set(), files: [], problems: [], gearKind: new Map(), layout: null, counts: { rows: 0, bad: 0, dup: 0, errorFile: 0, noFile: 0 } };
}
// Adds one activities.csv. Returns false (and records why) when the text is not an activities.csv.
export function ingestCsv(st, name, text) {
  const rows = parseCsv(text);
  if (rows.length < 1) { st.problems.push({ name, reason: 'empty' }); return false; }
  const header = rows[0];
  const body = rows.slice(1).filter(r => r.length > 3);
  if (header.length < 6 || !/^\D/.test(header[0] || 'x')) { st.problems.push({ name, reason: 'notactivities' }); return false; }
  const order = dateOrder(body.slice(0, 2000).map(r => r[1]));
  // an activities.csv has an id in the first column and a date in the second
  const probe = body.slice(0, 50);
  const ok = probe.filter(r => /^\d+$/.test((r[0] || '').trim()) && Number.isFinite(parseDate(r[1], order))).length;
  if (body.length && ok < Math.max(1, probe.length / 2)) { st.problems.push({ name, reason: 'notactivities' }); return false; }
  const L = detectLayout(header, body);
  st.layout = L;
  let n = 0;
  for (const r of body) {
    st.counts.rows++;
    const id = (r[L.id] || '').trim();
    const t = parseDate(r[L.date], order);
    if (!/^\d+$/.test(id) || !Number.isFinite(t)) { st.counts.bad++; continue; }
    if (st.ids.has(id)) { st.counts.dup++; continue; }
    st.ids.add(id);
    const elapsed = num(r[L.elapsed]);
    let moving = L.moving >= 0 ? num(r[L.moving]) : NaN;
    if (!(moving >= 0)) moving = elapsed;
    let dist = L.dist2 >= 0 ? num(r[L.dist2]) : NaN;
    if (!(dist >= 0) && L.dist1 >= 0) { const d1 = num(r[L.dist1]); dist = d1 >= 0 ? d1 * (L.unit1 === 'mi' ? 1609.344 : 1000) : NaN; }
    const elev = L.elevGain >= 0 ? num(r[L.elevGain]) : NaN;
    const file = L.file >= 0 ? (r[L.file] || '').trim() : '';
    if (file === '#error#') st.counts.errorFile++;
    else if (!file) st.counts.noFile++;
    const type = (r[L.type] || '').trim() || '?';
    st.acts.push({
      id, t, name: (r[L.name] || '').trim(), type, cat: family(type),
      moving: moving >= 0 ? moving : 0, elapsed: elapsed >= 0 ? elapsed : (moving >= 0 ? moving : 0),
      dist: dist >= 0 ? dist : 0, elev: elev >= 0 && elev < 20000 ? elev : 0,
      gear: L.gear >= 0 ? (r[L.gear] || '').trim() : '',
      file: file && file !== '#error#' && FILE_RE.test(file) ? file.replace(/\\/g, '/').replace(/^.*?(activities\/)/i, 'activities/') : '',
    });
    n++;
  }
  st.files.push({ name, rows: n, columns: header.length, lang: L.lang, how: L.how });
  return true;
}
// bikes.csv and shoes.csv: the first column is the gear's name; the file says what kind it is
export function ingestGear(st, kind, text) {
  const rows = parseCsv(text);
  for (const r of rows.slice(1)) { const nm = (r[0] || '').trim(); if (nm) st.gearKind.set(nm, kind); }
}

/* ---------------- time zone ---------------- */
// Strava writes the start in UTC; hours, weekdays and days are counted in the time zone you pick (this device's by default).
// Garmin writes the local start (a.local): it is counted as written.
export function offsetFinder(tz) {
  let fmt;
  try { fmt = new Intl.DateTimeFormat('en-US', { timeZone: tz, hourCycle: 'h23', year: 'numeric', month: 'numeric', day: 'numeric', hour: 'numeric', minute: 'numeric' }); }
  catch (e) { fmt = null; }
  const cache = new Map();
  return (t) => {
    if (!fmt) return 0;
    const key = Math.floor(t / 9e5); // quarter hours: some zones change at :30 and :45
    let off = cache.get(key);
    if (off === undefined) {
      const p = {};
      for (const x of fmt.formatToParts(new Date(key * 9e5))) p[x.type] = x.value;
      off = Math.round((Date.UTC(+p.year, +p.month - 1, +p.day, +p.hour % 24, +p.minute) - key * 9e5) / 60000);
      cache.set(key, off);
    }
    return off;
  };
}
export function localise(acts, tz) {
  const off = offsetFinder(tz);
  const out = acts.map(a => {
    const lt = a.local ? a.t : a.t + off(a.t) * 60000; // a Garmin start is already local time
    const d = new Date(lt);
    return Object.assign({}, a, { lt, y: d.getUTCFullYear(), m: d.getUTCMonth(), day: Math.floor(lt / DAY), wd: (d.getUTCDay() + 6) % 7, h: d.getUTCHours() });
  });
  out.sort((a, b) => a.lt - b.lt || (a.id < b.id ? -1 : 1));
  return out;
}
export function yearsIn(L) {
  const m = new Map();
  for (const a of L) m.set(a.y, (m.get(a.y) || 0) + 1);
  return [...m.entries()].sort((a, b) => a[0] - b[0]).map(([year, count]) => ({ year, count }));
}
export const isoDay = day => new Date(day * DAY).toISOString().slice(0, 10);

/* ---------------- statistics ---------------- */
function totals(list) {
  const s = { count: list.length, dist: 0, moving: 0, elapsed: 0, elev: 0 };
  for (const a of list) { s.dist += a.dist; s.moving += a.moving; s.elapsed += a.elapsed; s.elev += a.elev; }
  return s;
}
function streakOf(days) {
  let best = null, from = null, prev = null, len = 0;
  for (const d of days) {
    if (prev !== null && d === prev + 1) len++; else { len = 1; from = d; }
    if (!best || len > best.days) best = { days: len, from: isoDay(from), to: isoDay(d) };
    prev = d;
  }
  return best;
}
const pick = (list, f) => list.reduce((b, a) => (b === null || f(a) > f(b) ? a : b), null);
const brief = a => a ? { id: a.id, name: a.name, type: a.type, cat: a.cat, dist: a.dist, moving: a.moving, elev: a.elev, day: isoDay(a.day), h: a.h } : null;
function sportsOf(list) {
  const m = new Map();
  for (const a of list) {
    let s = m.get(a.type);
    if (!s) { s = { type: a.type, cat: a.cat, count: 0, dist: 0, moving: 0, elev: 0 }; m.set(a.type, s); }
    s.count++; s.dist += a.dist; s.moving += a.moving; s.elev += a.elev;
  }
  return [...m.values()].sort((a, b) => b.moving - a.moving || b.count - a.count);
}
// one year (a number) or 'all'; sport: a type label or null for every sport
export function computeStats(L, { year, sport = null } = {}) {
  let list = year === 'all' ? L : L.filter(a => a.y === year);
  if (sport) list = list.filter(a => a.type === sport);
  const s = totals(list);
  s.year = year; s.sport = sport;
  s.sports = sportsOf(list);
  s.months = Array.from({ length: 12 }, () => ({ count: 0, dist: 0, moving: 0, elev: 0 }));
  s.clock = new Array(168).fill(0);
  s.clockMin = new Array(168).fill(0);
  const byDay = new Map();
  for (const a of list) {
    const mo = s.months[a.m]; mo.count++; mo.dist += a.dist; mo.moving += a.moving; mo.elev += a.elev;
    s.clock[a.wd * 24 + a.h]++; s.clockMin[a.wd * 24 + a.h] += a.moving / 60;
    let d = byDay.get(a.day);
    if (!d) { d = { day: a.day, dist: 0, moving: 0, count: 0, elev: 0 }; byDay.set(a.day, d); }
    d.dist += a.dist; d.moving += a.moving; d.count++; d.elev += a.elev;
  }
  const days = [...byDay.keys()].sort((a, b) => a - b);
  s.activeDays = days.length;
  s.streak = streakOf(days);
  const useDist = s.dist > 0;
  const bd = pick([...byDay.values()], d => (useDist ? d.dist * 1e6 + d.moving : d.moving));
  s.biggestDay = bd ? { day: isoDay(bd.day), dist: bd.dist, moving: bd.moving, count: bd.count, elev: bd.elev } : null;
  s.longest = brief(pick(list, a => (useDist ? a.dist * 1e6 + a.moving : a.moving)));
  s.longestTime = brief(pick(list, a => a.moving));
  s.mostClimb = brief(pick(list.filter(a => a.elev > 0), a => a.elev));
  s.first = list.length ? brief(list[0]) : null;
  s.last = list.length ? brief(list[list.length - 1]) : null;
  s.firstDay = days.length ? isoDay(days[0]) : null;
  s.lastDay = days.length ? isoDay(days[days.length - 1]) : null;
  s.distanceSports = s.sports.filter(x => x.dist > 0).length;
  if (year !== 'all') {
    const start = Math.floor(Date.UTC(year, 0, 1) / DAY), end = Math.floor(Date.UTC(year + 1, 0, 1) / DAY);
    s.strip = new Array(end - start).fill(0);
    for (const d of byDay.values()) if (d.day >= start && d.day < end) s.strip[d.day - start] = d.moving / 60;
  } else {
    s.years = yearsIn(list).map(y => Object.assign({ year: y.year }, totals(list.filter(a => a.y === y.year))));
  }
  // weekday totals (Mon first) and the hour of the day most activities start
  s.weekdays = Array.from({ length: 7 }, (_, w) => s.clockMin.slice(w * 24, w * 24 + 24).reduce((x, y) => x + y, 0));
  const hours = Array.from({ length: 24 }, (_, h) => [0, 1, 2, 3, 4, 5, 6].reduce((x, w) => x + s.clock[w * 24 + h], 0));
  s.peakHour = list.length ? hours.indexOf(Math.max(...hours)) : null;
  s.hours = hours;
  return s;
}
// per sport page (Pro): its months, its longest, and its fastest over a sensible minimum distance
export function computeSport(L, { year, sport }) {
  const s = computeStats(L, { year, sport });
  let list = year === 'all' ? L : L.filter(a => a.y === year);
  list = list.filter(a => a.type === sport);
  const cat = list.length ? list[0].cat : CAT.OTHER;
  const minDist = cat === CAT.SWIM ? 400 : cat === CAT.RUN || cat === CAT.WALK ? 3000 : cat === CAT.RIDE ? 15000 : 1000;
  const timed = list.filter(a => a.dist >= minDist && a.moving > 60);
  s.cat = cat;
  s.fastest = brief(pick(timed, a => a.dist / a.moving));
  s.avgSpeed = s.moving > 0 && s.dist > 0 ? s.dist / s.moving : 0;
  s.minDist = minDist;
  s.distBuckets = null;
  if (s.dist > 0) {
    const edges = cat === CAT.RIDE ? [0, 20e3, 50e3, 100e3, 160e3, Infinity] : cat === CAT.SWIM ? [0, 1e3, 2e3, 3e3, 5e3, Infinity] : [0, 5e3, 10e3, 21.1e3, 42.2e3, Infinity];
    s.distBuckets = edges.slice(0, -1).map((lo, i) => ({ lo, hi: edges[i + 1], count: list.filter(a => a.dist >= lo && a.dist < edges[i + 1]).length }));
  }
  return s;
}
// gear mileage (Pro): every piece of gear, its distance this year and over its whole life in the export
export function computeGear(L, gearKind, { year }) {
  const m = new Map();
  for (const a of L) {
    if (!a.gear) continue;
    let g = m.get(a.gear);
    if (!g) { g = { name: a.gear, kind: gearKind.get(a.gear) || '', life: { count: 0, dist: 0, moving: 0 }, year: { count: 0, dist: 0, moving: 0 }, first: null, last: null, cats: {} }; m.set(a.gear, g); }
    g.life.count++; g.life.dist += a.dist; g.life.moving += a.moving;
    if (year === 'all' || a.y === year) { g.year.count++; g.year.dist += a.dist; g.year.moving += a.moving; }
    const d = isoDay(a.day);
    if (!g.first || d < g.first) g.first = d;
    if (!g.last || d > g.last) g.last = d;
    g.cats[a.cat] = (g.cats[a.cat] || 0) + 1;
  }
  const out = [...m.values()].map(g => {
    if (!g.kind) {
      const top = Object.entries(g.cats).sort((a, b) => b[1] - a[1])[0];
      g.kind = top && top[0] === CAT.RIDE ? 'bike' : top && (top[0] === CAT.RUN || top[0] === CAT.WALK) ? 'shoe' : '';
    }
    delete g.cats;
    return g;
  });
  return out.filter(g => year === 'all' || g.year.count > 0).sort((a, b) => b.year.dist - a.year.dist || b.life.dist - a.life.dist);
}
// year against year (Pro)
export function compareYears(L) {
  return yearsIn(L).map(({ year }) => {
    const list = L.filter(a => a.y === year);
    const t = totals(list);
    const sp = sportsOf(list);
    return Object.assign({ year, activeDays: new Set(list.map(a => a.day)).size, topSport: sp[0] ? sp[0].type : '' }, t);
  });
}

/* ---------------- CSV out (Pro) ---------------- */
const q = v => { const s = String(v == null ? '' : v); return /[",\r\n]/.test(s) || /^[=+\-@]/.test(s) ? `"${(/^[=+\-@]/.test(s) ? "'" : '') + s.replace(/"/g, '""')}"` : s; };
const r1 = x => Math.round(x * 10) / 10;
// distances in km and metres (or miles and feet), times in hours; one table, a section column first
export function statsToCsv(s, { label, imperial = false, gear = null, compare = null, labels = {} }) {
  const D = imperial ? 1609.344 : 1000, E = imperial ? 0.3048 : 1;
  const du = imperial ? 'mi' : 'km', eu = imperial ? 'ft' : 'm';
  const lines = [['section', 'item', 'activities', `distance_${du}`, 'moving_hours', `elevation_${eu}`, 'extra'].join(',')];
  const row = (...c) => lines.push(c.map(q).join(','));
  row('total', label, s.count, r1(s.dist / D), r1(s.moving / 3600), Math.round(s.elev / E), `active days ${s.activeDays}`);
  for (const x of s.sports) row('sport', x.type, x.count, r1(x.dist / D), r1(x.moving / 3600), Math.round(x.elev / E), '');
  const MON = labels.months || ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
  if (s.year !== 'all') s.months.forEach((m, i) => row('month', MON[i], m.count, r1(m.dist / D), r1(m.moving / 3600), Math.round(m.elev / E), ''));
  if (s.years) for (const y of s.years) row('year', y.year, y.count, r1(y.dist / D), r1(y.moving / 3600), Math.round(y.elev / E), '');
  if (compare && s.year !== 'all') for (const y of compare) row('year', y.year, y.count, r1(y.dist / D), r1(y.moving / 3600), Math.round(y.elev / E), `active days ${y.activeDays}`);
  if (gear) for (const g of gear) row('gear', g.name, g.year.count, r1(g.year.dist / D), r1(g.year.moving / 3600), '', `${g.kind || 'gear'}; lifetime ${r1(g.life.dist / D)} ${du}; first ${g.first}; last ${g.last}`);
  if (s.longest) row('longest', s.longest.name, 1, r1(s.longest.dist / D), r1(s.longest.moving / 3600), Math.round(s.longest.elev / E), `${s.longest.type}; ${s.longest.day}`);
  if (s.biggestDay) row('biggest day', s.biggestDay.day, s.biggestDay.count, r1(s.biggestDay.dist / D), r1(s.biggestDay.moving / 3600), Math.round(s.biggestDay.elev / E), '');
  if (s.streak) row('longest streak', `${s.streak.from} to ${s.streak.to}`, '', '', '', '', `${s.streak.days} days`);
  return '﻿' + lines.join('\r\n') + '\r\n';
}
