/* Yearlap for Garmin data. Two inputs, both read in this tab:
 *
 * 1. The Activities.csv that Garmin Connect writes when you press "Export CSV" on the All Activities list (only the rows
 *    loaded on the page). Garmin writes the column names in your account's language and the numbers in your number
 *    format, and the columns after the seventh change with the sports in the list. Published exports, all with the same
 *    first seven columns (type, date, favourite, title, distance, calories, time):
 *      English:  github.com/tbidne/pacer examples/Activities.csv; github.com/pmcintyr/garmin2sheets Activities.csv
 *                ("Activity Type,Date,Favorite,Title,Distance,Calories,Time,...,Total Ascent,Total Descent,...")
 *      German:   github.com/miriamab/LetsMove static/*_Daten.csv ("Aktivitätstyp,Datum,Favorit,Titel,Distanz,Kalorien,
 *                Zeit,...,Anstieg gesamt,Abstieg gesamt,..."; "24,34", "4.384", "00:08:51,6")
 *      Dutch:    github.com/rcsmit/streamlit_scripts input/garminactivities_*.csv and
 *                github.com/NSBozkurtG/triathlon-data-science-fitness-fatigue-model data/Activities.csv
 *                ("Activiteittype,Datum,Favoriet,Titel,Afstand,Calorieën,Tijd,...,Totale stijging,...", numbers "5.00"
 *                and "1,725": the number format is a setting of its own, not the language)
 *    The date is written as 2025-09-22 10:47:34, the activity's local start, in every one of them. Distances have two
 *    decimals in km or miles, except swims, which Garmin writes as whole metres (or yards): "1,725", "1.725", "817".
 *    Empty values are "--". No published French header was found, so French files are read by position and type like
 *    the others; the climbing column is found by name ("Ascension totale" is the field's name in Garmin's French
 *    manuals) and stays empty when the name is something else.
 *
 * 2. The archive from garmin.com, Account, Data Management, "Export Your Data" (a ZIP sent by email). Read from it,
 *    following published readers of that archive (github.com/arpanghosh8453/garmin-grafana garmin_bulk_importer.py,
 *    github.com/oliviermirat/MyAIGuide garminDataGatheredFromWebExport.py):
 *      DI_CONNECT/DI-Connect-Fitness/*summarizedActivities*.json  [{ summarizedActivitiesExport: [activity...] }]
 *          startTimeLocal and startTimeGmt in ms, distance and elevationGain in centimetres, duration in ms
 *      DI_CONNECT/DI-Connect-Aggregator/UDSFile_*.json              [{ calendarDate, totalSteps, ... }]
 *      DI_CONNECT/DI-Connect-Wellness/*sleepData*.json              [{ calendarDate, deepSleepSeconds, lightSleepSeconds,
 *                                                                     remSleepSeconds, awakeSleepSeconds, ... }]
 *      DI_CONNECT/DI-Connect-Uploaded-Files/UploadedFiles_*.zip      the original FIT files, in ZIPs inside the ZIP
 * Pure functions: no DOM, no network. */
import { parseCsv, norm, parseDate, family, CAT } from './engine.js';

const DAY = 864e5;
const DUR_RE = /^\d{1,3}:\d{2}(?::\d{2})?(?:[.,]\d+)?$/;
const ISO_RE = /^\d{4}-\d{1,2}-\d{1,2}[ T]\d{1,2}:\d{2}/;

/* ---------------- numbers and times ---------------- */
// the file's decimal mark, from the values written with exactly two decimals (distances: "24,34", "5.48", "0,00")
export function decimalOf(values) {
  let c = 0, p = 0;
  for (const v of values) {
    const m = String(v == null ? '' : v).trim().match(/\d([.,])\d{2}$/);
    if (m) { if (m[1] === ',') c++; else p++; }
  }
  return c > p ? ',' : '.';
}
// "2,154" / "2.154" / "4 384" / "24,34" / "--" with the file's decimal mark; NaN when empty
export function gnum(v, dec = '.') {
  let s = String(v == null ? '' : v).trim();
  if (!s || /^-+$/.test(s)) return NaN;
  s = s.replace(/[\s  ']/g, '');
  s = dec === ',' ? s.replace(/\./g, '').replace(',', '.') : s.replace(/,/g, '');
  const x = Number(s);
  return Number.isFinite(x) ? x : NaN;
}
// "01:07:41", "00:08:51,6", "0:32:35.4", "45:12" (minutes and seconds); seconds, NaN when empty
export function gdur(v) {
  const s = String(v == null ? '' : v).trim();
  if (!DUR_RE.test(s)) return NaN;
  const parts = s.replace(',', '.').split(':').map(Number);
  if (parts.some(x => !Number.isFinite(x))) return NaN;
  return parts.length === 3 ? parts[0] * 3600 + parts[1] * 60 + parts[2] : parts[0] * 60 + parts[1];
}
// a distance cell: a value with two decimals is km (or mi); a whole number is metres (or yards), as Garmin writes swims
export function gdist(v, dec, imperial = false) {
  const raw = String(v == null ? '' : v).trim();
  const x = gnum(raw, dec);
  if (!(x >= 0)) return 0;
  const unit = new RegExp(`\\d\\${dec}\\d{2}$`).test(raw);
  return unit ? x * (imperial ? 1609.344 : 1000) : x * (imperial ? 0.9144 : 1);
}
// "2025-09-22 10:47:34" is the local start; it is kept as written (as if it were UTC), so it is never moved by a time zone
export function gdate(v) {
  const s = String(v == null ? '' : v).trim();
  const m = s.match(/^(\d{4})-(\d{1,2})-(\d{1,2})[ T](\d{1,2}):(\d{2})(?::(\d{2}))?/);
  if (m) {
    const t = Date.UTC(+m[1], +m[2] - 1, +m[3], +m[4], +m[5], +(m[6] || 0));
    return new Date(t).getUTCDate() === +m[3] && +m[1] >= 1990 && +m[1] <= 2100 ? t : NaN;
  }
  return parseDate(s, 'dmy');
}

/* ---------------- sports ---------------- */
// Garmin's own activity type keys (summarizedActivities.json); labels for the archive, which has keys, not words
const KEYS = {
  running: [CAT.RUN, 'Running', 'Laufen', 'Hardlopen', 'Course à pied'],
  treadmill_running: [CAT.RUN, 'Treadmill running', 'Laufband', 'Hardlopen op een loopband', 'Course sur tapis'],
  trail_running: [CAT.RUN, 'Trail running', 'Trailrunning', 'Trailrunning', 'Trail'],
  track_running: [CAT.RUN, 'Track running', 'Bahnlauf', 'Baanlopen', 'Course sur piste'],
  virtual_run: [CAT.RUN, 'Virtual run', 'Virtueller Lauf', 'Virtueel hardlopen', 'Course virtuelle'],
  cycling: [CAT.RIDE, 'Cycling', 'Radfahren', 'Fietsen', 'Vélo'],
  road_biking: [CAT.RIDE, 'Road cycling', 'Rennrad', 'Wegwielrennen', 'Vélo de route'],
  mountain_biking: [CAT.RIDE, 'Mountain biking', 'Mountainbike', 'Mountainbiken', 'VTT'],
  gravel_cycling: [CAT.RIDE, 'Gravel cycling', 'Gravelbike', 'Gravelfietsen', 'Gravel'],
  indoor_cycling: [CAT.RIDE, 'Indoor cycling', 'Indoor Cycling', 'Indoorcycling', 'Vélo d’intérieur'],
  virtual_ride: [CAT.RIDE, 'Virtual ride', 'Virtuelles Radfahren', 'Virtueel fietsen', 'Vélo virtuel'],
  e_bike_fitness: [CAT.RIDE, 'E-bike', 'E-Bike', 'E-bike', 'Vélo électrique'],
  lap_swimming: [CAT.SWIM, 'Pool swim', 'Schwimmbad', 'Zwembad', 'Natation en piscine'],
  open_water_swimming: [CAT.SWIM, 'Open water swim', 'Freiwasserschwimmen', 'Zwemmen in open water', 'Natation en eau libre'],
  swimming: [CAT.SWIM, 'Swimming', 'Schwimmen', 'Zwemmen', 'Natation'],
  walking: [CAT.WALK, 'Walking', 'Gehen', 'Wandelen', 'Marche'],
  casual_walking: [CAT.WALK, 'Walking', 'Gehen', 'Wandelen', 'Marche'],
  hiking: [CAT.WALK, 'Hiking', 'Wandern', 'Hiken', 'Randonnée'],
  strength_training: [CAT.GYM, 'Strength', 'Krafttraining', 'Krachttraining', 'Musculation'],
  indoor_cardio: [CAT.GYM, 'Cardio', 'Cardio', 'Cardio', 'Cardio'],
  hiit: [CAT.GYM, 'HIIT', 'HIIT', 'HIIT', 'HIIT'],
  yoga: [CAT.GYM, 'Yoga', 'Yoga', 'Yoga', 'Yoga'],
  pilates: [CAT.GYM, 'Pilates', 'Pilates', 'Pilates', 'Pilates'],
  elliptical: [CAT.GYM, 'Elliptical', 'Crosstrainer', 'Crosstrainer', 'Elliptique'],
  stair_climbing: [CAT.GYM, 'Stairs', 'Treppensteigen', 'Traplopen', 'Escaliers'],
  indoor_rowing: [CAT.WATER, 'Indoor rowing', 'Rudergerät', 'Indoor roeien', 'Rameur'],
  rowing: [CAT.WATER, 'Rowing', 'Rudern', 'Roeien', 'Aviron'],
  kayaking: [CAT.WATER, 'Kayak', 'Kajak', 'Kajakken', 'Kayak'],
  stand_up_paddleboarding: [CAT.WATER, 'Stand up paddling', 'Stand-Up-Paddling', 'Suppen', 'Stand up paddle'],
  cross_country_skiing_ws: [CAT.WINTER, 'Cross-country skiing', 'Langlauf', 'Langlaufen', 'Ski de fond'],
  resort_skiing_snowboarding_ws: [CAT.WINTER, 'Skiing', 'Ski und Snowboard', 'Skiën en snowboarden', 'Ski et snowboard'],
  multi_sport: [CAT.OTHER, 'Multisport', 'Multisport', 'Multisport', 'Multisport'],
};
const LANG_AT = { en: 1, de: 2, nl: 3, fr: 4 };
export function typeLabel(key, lang = 'en') {
  const k = String(key || '').toLowerCase();
  const row = KEYS[k];
  if (row) return row[LANG_AT[lang] || 1];
  const s = k.replace(/_ws$/, '').replace(/_/g, ' ').trim();
  return s ? s[0].toUpperCase() + s.slice(1) : '?';
}
export function typeFamily(key, label) {
  const row = KEYS[String(key || '').toLowerCase()];
  if (row) return row[0];
  const k = String(key || '').toLowerCase();
  if (/swim/.test(k)) return CAT.SWIM;
  if (/run/.test(k)) return CAT.RUN;
  if (/cycl|bik|ride/.test(k)) return CAT.RIDE;
  if (/walk|hik/.test(k)) return CAT.WALK;
  if (/ski|snow|skat/.test(k)) return CAT.WINTER;
  if (/row|paddl|kayak|canoe|surf|sail/.test(k)) return CAT.WATER;
  return family(label);
}
// a Garmin export's activity type as written in the CSV: Garmin's words, sorted into a family; some need a nudge
const CSV_FAM = [[/cardio|crosstrainer|elliptique|elliptical|treppen|traplopen|escalier|stair/, CAT.GYM], [/peddel|paddle/, CAT.WATER], [/zwembad/, CAT.SWIM]];
export function csvFamily(label) {
  const k = norm(label);
  for (const [re, c] of CSV_FAM) if (re.test(k)) return c;
  return family(label);
}
// the FIT sport number of a file without an activity (FIT profile, "sport" type)
export function fitFamily(n) {
  if (n === 1) return CAT.RUN;
  if (n === 2 || n === 21) return CAT.RIDE;
  if (n === 5) return CAT.SWIM;
  if (n === 11 || n === 16 || n === 17) return CAT.WALK;
  if (n === 12 || n === 13 || n === 14) return CAT.WINTER;
  if (n === 15 || n === 19 || n === 32 || n === 37 || n === 38 || n === 41) return CAT.WATER;
  if (n === 4 || n === 10) return CAT.GYM;
  return CAT.OTHER;
}

/* ---------------- Activities.csv ---------------- */
const ASCENT = ['total ascent', 'elev gain', 'anstieg gesamt', 'totale stijging', 'stijging', 'ascension totale'];
const STRIDE = ['avg stride length', 'o schrittlange', 'ø schrittlange', 'gem. staplengte'];
export function garminLang(header) {
  const h0 = norm(header[0]);
  if (h0 === 'activity type') return 'en';
  if (/^aktivitatstyp/.test(h0)) return 'de';
  if (/^activiteittype/.test(h0)) return 'nl';
  if (/activite/.test(h0)) return 'fr';
  return 'other';
}
// a Garmin list: a date in the second column, true/false third (favourite) and a duration in the seventh, whatever the words
export function looksGarminCsv(rows) {
  if (!rows.length || rows[0].length < 7) return false;
  const body = rows.slice(1, 60).filter(r => r.length >= 7);
  if (!body.length) return /^(activity type|aktivitatstyp|activiteittype)$/.test(norm(rows[0][0])) || /^(favorite|favorit|favoriet|favori)$/.test(norm(rows[0][2]));
  const ok = body.filter(r => Number.isFinite(gdate(r[1])) && /^(true|false)$/i.test((r[2] || '').trim()) && (DUR_RE.test((r[6] || '').trim()) || /^-+$/.test((r[6] || '').trim()))).length;
  return ok >= Math.max(1, body.length / 2);
}
export function garminLayout(header, body) {
  const h = header.map(norm);
  const find = list => h.findIndex((x, i) => i >= 7 && list.includes(x));
  let ascent = find(ASCENT);
  if (ascent < 0) ascent = h.findIndex((x, i) => i >= 7 && /ascent|ascension|anstieg|stijging/.test(x) && !/max|min|avg|gem|ø/.test(x));
  const stride = find(STRIDE);
  const dec = decimalOf(body.slice(0, 2000).map(r => r[4]).concat(body.slice(0, 2000).map(r => r[ascent >= 0 ? ascent : 4])));
  let imperial = false;
  if (stride >= 0) {
    const v = body.slice(0, 400).map(r => gnum(r[stride], dec)).filter(x => x > 0.2).sort((a, b) => a - b);
    if (v.length) imperial = v[v.length >> 1] > 2.0;
  }
  return { garmin: 'csv', how: 'position', lang: garminLang(header), columns: header.length, dec, imperial, ascent, unit1: imperial ? 'mi' : 'km' };
}
const minuteKey = t => 'gm' + Math.round(t / 60000);
// Adds one Garmin Activities.csv to a Yearlap store (engine.createStore). Returns false (with the reason) when it is not one.
export function ingestGarminCsv(st, name, text) {
  const rows = parseCsv(text);
  if (rows.length < 1) { st.problems.push({ name, reason: 'empty' }); return false; }
  if (!looksGarminCsv(rows)) { st.problems.push({ name, reason: 'notactivities' }); return false; }
  const header = rows[0];
  const body = rows.slice(1).filter(r => r.length >= 7);
  const L = garminLayout(header, body);
  st.layout = L; st.source = 'garmin';
  const D = L.imperial ? 0.3048 : 1;
  let n = 0;
  for (const r of body) {
    st.counts.rows++;
    const t = gdate(r[1]);
    if (!Number.isFinite(t)) { st.counts.bad++; continue; }
    const key = minuteKey(t);
    if (st.ids.has(key)) { st.counts.dup++; continue; }
    st.ids.add(key);
    const time = gdur(r[6]);
    const elev = L.ascent >= 0 ? gnum(r[L.ascent], L.dec) * D : NaN;
    const type = (r[0] || '').trim() || '?';
    st.acts.push({
      id: key, t, local: true, gmt: NaN, name: (r[3] || '').trim(), type, cat: csvFamily(type),
      moving: time >= 0 ? time : 0, elapsed: time >= 0 ? time : 0, dist: gdist(r[4], L.dec, L.imperial),
      elev: elev >= 0 && elev < 20000 ? elev : 0, gear: '', file: '',
    });
    n++;
  }
  st.files.push({ name, rows: n, columns: header.length, lang: L.lang, how: 'position', garmin: 'csv' });
  return true;
}

/* ---------------- the "Export Your Data" archive ---------------- */
const list = json => {
  const out = [];
  const arr = Array.isArray(json) ? json : json && typeof json === 'object' ? [json] : [];
  for (const e of arr) {
    if (e && Array.isArray(e.summarizedActivitiesExport)) out.push(...e.summarizedActivitiesExport);
    else if (e && typeof e === 'object') out.push(e);
  }
  return out;
};
// one *summarizedActivities*.json; lang: the page's language for the sport names
export function ingestGarminSummaries(st, name, json, lang = 'en') {
  const acts = list(json).filter(a => a && (a.startTimeLocal != null || a.startTimeGmt != null));
  if (!acts.length) { st.problems.push({ name, reason: 'notactivities' }); return false; }
  st.source = 'garmin';
  if (!st.layout) st.layout = { garmin: 'zip', how: 'json', lang: 'zip', columns: 0, unit1: 'km' };
  let n = 0;
  for (const a of acts) {
    st.counts.rows++;
    const gmt = Number(a.startTimeGmt);
    let t = Number(a.startTimeLocal);
    if (!Number.isFinite(t)) t = gmt;
    if (!Number.isFinite(t) || t < Date.UTC(1990, 0, 1) || t > Date.UTC(2100, 0, 1)) { st.counts.bad++; continue; }
    const key = minuteKey(t);
    if (st.ids.has(key)) { st.counts.dup++; continue; }
    st.ids.add(key);
    const k = a.activityType && typeof a.activityType === 'object' ? a.activityType.typeKey : a.activityType;
    const type = typeLabel(k, lang);
    const ms = Number(a.duration), mv = Number(a.movingDuration), el = Number(a.elapsedDuration);
    const time = ms > 0 ? ms / 1000 : mv > 0 ? mv / 1000 : el > 0 ? el / 1000 : 0;
    const dist = Number(a.distance) > 0 ? Number(a.distance) / 100 : 0;
    const elev = Number(a.elevationGain) > 0 ? Number(a.elevationGain) / 100 : 0;
    st.acts.push({
      id: String(a.activityId || key), t, local: true, gmt: Number.isFinite(gmt) ? gmt : NaN, name: String(a.name || '').trim(), type,
      cat: typeFamily(k, type), moving: time, elapsed: el > 0 ? el / 1000 : time, dist, elev: elev < 20000 ? elev : 0, gear: '', file: '',
    });
    n++;
  }
  st.files.push({ name, rows: n, columns: 0, lang: 'zip', how: 'json', garmin: 'zip' });
  return true;
}

/* steps and sleep, per calendar day ('YYYY-MM-DD') */
export function createWellness() { return { steps: new Map(), sleep: new Map() }; }
const dayOf = v => {
  const s = v && typeof v === 'object' ? (v.date || v.calendarDate || '') : v;
  const m = String(s || '').match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (m) return m[0];
  const t = parseDate(s, 'mdy');
  return Number.isFinite(t) ? new Date(t).toISOString().slice(0, 10) : '';
};
export function ingestDailySummaries(w, json) {
  let n = 0;
  for (const e of list(json)) {
    if (!e || e.hydration) continue;
    const day = dayOf(e.calendarDate);
    const steps = Number(e.totalSteps);
    if (!day || !(steps > 0)) continue;
    w.steps.set(day, steps); n++;
  }
  return n;
}
export function ingestSleep(w, json) {
  let n = 0;
  for (const e of list(json)) {
    if (!e) continue;
    const day = dayOf(e.calendarDate);
    const deep = Number(e.deepSleepSeconds) || 0, light = Number(e.lightSleepSeconds) || 0, rem = Number(e.remSleepSeconds) || 0, awake = Number(e.awakeSleepSeconds) || 0;
    let total = deep + light + rem;
    if (!(total > 0)) total = Number(e.sleepTimeSeconds) || 0;
    if (!day || !(total > 0) || total > 20 * 3600) continue;
    w.sleep.set(day, { total, deep, light, rem, awake }); n++;
  }
  return n;
}
// one year (a number) or 'all'
export function computeWellness(w, year) {
  const inYear = d => year === 'all' || d.startsWith(String(year) + '-');
  const steps = [...w.steps.entries()].filter(([d]) => inYear(d)).sort((a, b) => (a[0] < b[0] ? -1 : 1));
  const sleep = [...w.sleep.entries()].filter(([d]) => inYear(d)).sort((a, b) => (a[0] < b[0] ? -1 : 1));
  const out = { year, steps: null, sleep: null };
  if (steps.length) {
    const total = steps.reduce((x, [, v]) => x + v, 0);
    const best = steps.reduce((b, e) => (e[1] > b[1] ? e : b));
    const months = Array.from({ length: 12 }, () => ({ total: 0, days: 0 }));
    for (const [d, v] of steps) { const m = months[+d.slice(5, 7) - 1]; m.total += v; m.days++; }
    out.steps = { days: steps.length, total, avg: total / steps.length, best: { day: best[0], steps: best[1] }, over10k: steps.filter(([, v]) => v >= 10000).length, months: months.map(m => (m.days ? m.total / m.days : 0)), years: byYear(steps, v => v) };
  }
  if (sleep.length) {
    const sum = k => sleep.reduce((x, [, v]) => x + v[k], 0);
    const total = sum('total');
    const staged = sleep.filter(([, v]) => v.deep + v.light + v.rem > 0);
    const ssum = k => staged.reduce((x, [, v]) => x + v[k], 0);
    const longest = sleep.reduce((b, e) => (e[1].total > b[1].total ? e : b));
    const months = Array.from({ length: 12 }, () => ({ total: 0, n: 0 }));
    for (const [d, v] of sleep) { const m = months[+d.slice(5, 7) - 1]; m.total += v.total; m.n++; }
    out.sleep = {
      nights: sleep.length, avg: total / sleep.length, longest: { day: longest[0], secs: longest[1].total },
      deep: staged.length ? ssum('deep') / staged.length : 0, rem: staged.length ? ssum('rem') / staged.length : 0, light: staged.length ? ssum('light') / staged.length : 0,
      over7: sleep.filter(([, v]) => v.total >= 7 * 3600).length, months: months.map(m => (m.n ? m.total / m.n : 0)), years: byYear(sleep, v => v.total),
    };
  }
  return out;
}
function byYear(entries, val) {
  const m = new Map();
  for (const [d, v] of entries) { const y = +d.slice(0, 4); const e = m.get(y) || { year: y, total: 0, n: 0 }; e.total += val(v); e.n++; m.set(y, e); }
  return [...m.values()].sort((a, b) => a.year - b.year).map(e => ({ year: e.year, avg: e.total / e.n, n: e.n }));
}
export function wellnessCounts(w) {
  const years = new Set([...w.steps.keys(), ...w.sleep.keys()].map(d => +d.slice(0, 4)));
  return { stepDays: w.steps.size, sleepNights: w.sleep.size, years: [...years].sort() };
}

/* ---------------- the sample, in Garmin's layouts ---------------- */
// real headers (sources above); the sample's rows follow them, with made-up values
const H_EN = 'Activity Type,Date,Favorite,Title,Distance,Calories,Time,Avg HR,Max HR,Aerobic TE,Avg Run Cadence,Max Run Cadence,Avg Pace,Best Pace,Total Ascent,Total Descent,Avg Stride Length,Avg Vertical Ratio,Avg Vertical Oscillation,Avg Ground Contact Time,Avg GAP,Normalized Power® (NP®),Training Stress Score®,Avg Power,Max Power,Steps,Decompression,Best Lap Time,Number of Laps,Moving Time,Elapsed Time,Min Elevation,Max Elevation';
const H_DE = 'Aktivitätstyp,Datum,Favorit,Titel,Distanz,Kalorien,Zeit,Ø Herzfrequenz,Maximale Herzfrequenz,Ø Schrittfrequenz (Laufen),Max. Schrittfrequenz (Laufen),Ø Pace,Beste Pace,Anstieg gesamt,Abstieg gesamt,Ø Schrittlänge,Training Stress Score®,Schritte,Dekompression,Beste Rundenzeit,Anzahl der Runden,Zeit in Bewegung,Verstrichene Zeit,Minimale Höhe,Maximale Höhe';
const H_NL = 'Activiteittype,Datum,Favoriet,Titel,Afstand,Calorieën,Tijd,Gem. HS,Max. HS,Gem. loopcadans,Max. loopcadans,Gemiddeld tempo,Beste tempo,Totale stijging,Totale daling,Gem. staplengte,Training Stress Score®,Stappen,Decompressie,Beste rondetijd,Aantal ronden,Tijd bewogen,Verstreken tijd,Minimum hoogte,Maximum hoogte';
export const GARMIN_HEADERS = { en: H_EN, de: H_DE, nl: H_NL };
const SAMPLE_KEY = { Run: 'running', Ride: 'road_biking', 'Virtual Ride': 'indoor_cycling', Swim: 'lap_swimming', 'Weight Training': 'strength_training', Walk: 'walking', Hike: 'hiking' };
const p2 = n => String(n).padStart(2, '0');
export const isoLocal = t => { const d = new Date(t); return `${d.getUTCFullYear()}-${p2(d.getUTCMonth() + 1)}-${p2(d.getUTCDate())} ${p2(d.getUTCHours())}:${p2(d.getUTCMinutes())}:${p2(d.getUTCSeconds())}`; };
export const hms = s => { s = Math.round(s); return `${p2(Math.floor(s / 3600))}:${p2(Math.floor((s % 3600) / 60))}:${p2(s % 60)}`; };
// acts: makeSampleActivities(); lang picks the header, the sport names and the number format (comma for de, nl, fr)
export function garminSampleCsv(acts, lang = 'en') {
  const header = (GARMIN_HEADERS[lang] || H_EN).split(',');
  const comma = lang !== 'en';
  const dec = comma ? ',' : '.', thou = comma ? '.' : ',';
  const h = header.map(norm);
  const at = list => h.findIndex(x => list.includes(x));
  const iAsc = at(ASCENT), iMove = at(['moving time', 'zeit in bewegung', 'tijd bewogen']), iEl = at(['elapsed time', 'verstrichene zeit', 'verstreken tijd']);
  const whole = x => String(Math.round(x)).replace(/\B(?=(\d{3})+(?!\d))/g, thou);
  const lines = [header.map(x => (/[",]/.test(x) ? `"${x}"` : x)).join(',')];
  for (const a of acts) {
    const key = SAMPLE_KEY[a.type] || 'other';
    const r = new Array(header.length).fill('"--"');
    const swim = key === 'lap_swimming';
    const dist = a.dist > 0 ? (swim ? whole(a.dist) : (a.dist / 1000).toFixed(2).replace('.', dec)) : (0).toFixed(2).replace('.', dec);
    r[0] = typeLabel(key, lang === 'fr' ? 'fr' : lang); r[1] = isoLocal(a.t); r[2] = 'false'; r[3] = `"${a.name.replace(/"/g, '""')}"`;
    r[4] = `"${dist}"`; r[5] = `"${whole(a.moving / 9 + 60)}"`; r[6] = `"${hms(a.moving)}"`;
    if (iAsc >= 0) r[iAsc] = a.elev > 0 ? `"${whole(a.elev)}"` : '"--"';
    if (iMove >= 0) r[iMove] = `"${hms(a.moving)}"`;
    if (iEl >= 0) r[iEl] = `"${hms(a.elapsed)}"`;
    lines.push(r.join(','));
  }
  return lines.join('\n') + '\n';
}
// made-up steps and sleep for every day of the sample's two years, up to today
export function sampleWellness(today = new Date()) {
  const w = createWellness();
  let s = 77;
  const r = () => ((s = (s * 1103515245 + 12345) % 2147483648) / 2147483648);
  const Y = today.getUTCFullYear();
  const end = Date.UTC(Y, today.getUTCMonth(), today.getUTCDate());
  for (let t = Date.UTC(Y - 1, 0, 1); t < end; t += DAY) {
    const d = new Date(t), day = d.toISOString().slice(0, 10), wd = d.getUTCDay();
    const summer = Math.sin(((d.getUTCMonth() - 2) / 12) * Math.PI * 2);
    w.steps.set(day, Math.round(7600 + summer * 1500 + (wd === 0 || wd === 6 ? 2600 : 0) + r() * 4200));
    const total = Math.round((6.6 + (wd === 5 || wd === 6 ? 0.8 : 0) + r() * 1.3) * 3600);
    const deep = Math.round(total * (0.15 + r() * 0.06)), rem = Math.round(total * (0.2 + r() * 0.05));
    w.sleep.set(day, { total, deep, rem, light: total - deep - rem, awake: Math.round(600 + r() * 1500) });
  }
  return w;
}
