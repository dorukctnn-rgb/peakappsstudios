/* Tallyband's reading rules for a Fitbit / Google Health archive (Google Takeout, or the older fitbit.com "Export your
 * account archive"). Pure functions only: the worker (worker.js) feeds them file text, the tests feed them fixtures.
 *
 * What the archive looks like (from four independent descriptions written against real exports: the FitOut library, whose
 * author used a Takeout from 20 March 2026; the PDP-Connect Fitbit connector, tested on three owner-published exports from
 * August 2025 to April 2026; the armixlabs Fitbit-to-Garmin converter; and the base-data-manager importer):
 *   - "Global Export Data" (Takeout) or "Physical Activity", "Sleep", "Personal & Account" (older archive): JSON arrays,
 *     pretty-printed ("key" : value), one file per month or per 30-day batch, named <type>-YYYY-MM-DD.json. Batches overlap
 *     at their edges and the last one is padded with empty days past the export date, so every type is de-duplicated.
 *       steps / calories / distance   [{ "dateTime": "07/01/21 00:00:00", "value": "12" }]  one per minute, UTC, values
 *                                      as strings; distance in centimetres, calories in kcal
 *       *_active_minutes, sedentary_minutes  one per day, local date
 *       resting_heart_rate            [{ "dateTime": "03/01/24 00:00:00", "value": { "date": "03/01/24", "value": 54.0, "error": 6.8 } }]
 *       heart_rate (one file per day) [{ "dateTime": "...", "value": { "bpm": 62, "confidence": 2 } }]  every few seconds, UTC
 *       sleep                         logId, dateOfSleep, startTime/endTime (local, "2024-03-20T22:04:00.000"), minutes...,
 *                                      levels.summary, levels.data (stages), mainSleep; files in reverse order
 *       weight                        logId, weight, bmi, fat?, date "MM/DD/YY", time "HH:MM:SS", source
 *       exercise-<n>.json             logId, activityName, startTime "MM/DD/YY HH:MM:SS" (local), duration ms, ...
 *   - CSV folders: "Sleep Score/sleep_score.csv", "Heart Rate Variability/Daily Heart Rate Variability Summary - ....csv"
 *     (timestamp,rmssd,nremhr,entropy), "Oxygen Saturation (SpO2)/Daily SpO2 - ....csv" (timestamp,average_value,...),
 *     "Menstrual Health/menstrual_health_*.csv" and more.
 *   - Newer CSV layout ("Physical Activity_GoogleData", "Health Fitness Data_GoogleData" or "Google Data/..."):
 *     heart_rate_YYYY-MM-DD.csv (timestamp,beats per minute), steps_YYYY-MM-DD.csv (timestamp,steps), weight.csv
 *     (timestamp, weight grams), UserSleeps_* / UserSleepStages_* (sometimes without .csv).
 * Files are matched by name pattern anywhere in the archive, never by exact path, so a renamed top folder still works.
 * Every CSV or JSON file Tallyband has no rule for is still offered for download, merged per type and cut to the dates. */

/* ------------------------------------------------------------------ small helpers */
export const pad = n => String(n).padStart(2, '0');
export const base = p => String(p).split(/[\\/]/).pop();
export const ymd = ms => new Date(ms).toISOString().slice(0, 10);
export const addDays = (day, n) => ymd(Date.parse(day + 'T00:00:00Z') + n * 864e5);
export const num = v => { if (v === null || v === undefined || v === '') return NaN; const n = typeof v === 'number' ? v : Number(String(v).trim()); return Number.isFinite(n) ? n : NaN; };
const round = (v, d = 0) => (Number.isFinite(v) ? Math.round(v * 10 ** d) / 10 ** d : '');

// "07/01/21 00:00:00", "07/01/21", "2024-03-20T22:04:00.000", "2024-10-27T00:00:04Z", "2024-07-21 00:00:00",
// "2024-07-21T00:00:00+02:00" -> { y, mo, d, h, mi, s, z } (z: 'Z', an offset like '+02:00', or '' for wall-clock time)
export function parseStamp(v) {
  if (v === null || v === undefined) return null;
  const s = String(v).trim();
  let m = s.match(/^(\d{1,2})\/(\d{1,2})\/(\d{2}|\d{4})(?:[ T](\d{1,2}):(\d{2})(?::(\d{2}))?)?$/);
  if (m) {
    const y = m[3].length === 2 ? 2000 + +m[3] : +m[3];
    return { y, mo: +m[1], d: +m[2], h: +(m[4] || 0), mi: +(m[5] || 0), s: +(m[6] || 0), z: '' };
  }
  m = s.match(/^(\d{4})-(\d{2})-(\d{2})(?:[ T](\d{2}):(\d{2})(?::(\d{2})(?:\.\d+)?)?)?\s*(Z|[+-]\d{2}:?\d{2})?$/);
  if (m) return { y: +m[1], mo: +m[2], d: +m[3], h: +(m[4] || 0), mi: +(m[5] || 0), s: +(m[6] || 0), z: m[7] || '' };
  return null;
}
export const stampDay = p => (p ? `${p.y}-${pad(p.mo)}-${pad(p.d)}` : '');
export const stampText = p => (p ? `${stampDay(p)} ${pad(p.h)}:${pad(p.mi)}:${pad(p.s)}` : '');
// milliseconds of the stamp read as UTC (an explicit offset is applied)
export function stampMs(p) {
  if (!p) return NaN;
  let ms = Date.UTC(p.y, p.mo - 1, p.d, p.h, p.mi, p.s);
  if (p.z && p.z !== 'Z') { const m = p.z.match(/([+-])(\d{2}):?(\d{2})/); if (m) ms -= (m[1] === '-' ? -1 : 1) * (+m[2] * 60 + +m[3]) * 60000; }
  return ms;
}

/* ------------------------------------------------------------------ time zones */
// Minute series (steps, calories, distance, heart rate) are stored in UTC. To add them up per day as the person lived it,
// each UTC quarter hour is moved by the offset of the archive's time zone at that moment (summer time included). The
// offset is worked out once per hour and kept.
export function zoneOffsetFn(tz) {
  if (!tz || tz === 'UTC' || tz === 'Etc/UTC') return () => 0;
  let fmt;
  try { fmt = new Intl.DateTimeFormat('en-US', { timeZone: tz, hourCycle: 'h23', year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit' }); }
  catch { return () => 0; }
  const cache = new Map();
  return (ms) => {
    const hour = Math.floor(ms / 36e5);
    let off = cache.get(hour);
    if (off === undefined) {
      const parts = {};
      for (const p of fmt.formatToParts(new Date(hour * 36e5))) parts[p.type] = p.value;
      const local = Date.UTC(+parts.year, +parts.month - 1, +parts.day, +parts.hour % 24, +parts.minute);
      off = Math.round((local - hour * 36e5) / 60000);
      cache.set(hour, off);
    }
    return off;
  };
}
export const validZone = tz => { try { new Intl.DateTimeFormat('en-US', { timeZone: tz }); return true; } catch { return false; } };

/* ------------------------------------------------------------------ which file is which */
const DATE_IN_NAME = /(\d{4})[-_](\d{2})[-_](\d{2})/;
export function nameDate(name) { const m = base(name).match(DATE_IN_NAME); return m ? `${m[1]}-${m[2]}-${m[3]}` : ''; }

// Files that are never offered: account, security and app logs, settings, badges, social, the archive's own index.
const SKIP = [/^archive_browser\.html$/i, /readme/i, /^\._/, /\.(html?|png|jpe?g|gif|webp|gpx|tcx|fit|xml|txt|pdf|zip)$/i];
const SKIP_PATH = [/(^|\/)Application\//i, /(^|\/)Social\//i, /__MACOSX\//, /email_audit|retired_password|account_access|account_management|password/i,
  /(^|\/)Profile\.csv$/i, /(^|\/)(Devices|Trackers|Scales)\.csv$/i, /iOS App Notification/i, /Tracker Optional Configuration/i, /UserAppSettingData|UserLegacySettingData|TakeoutIrnUserState|UserMBDData|UserProfileData|UserDemographicData/i];

export const LEGACY = {
  steps: /^steps-\d{4}-\d{2}-\d{2}\.json$/i,
  calories: /^calories-\d{4}-\d{2}-\d{2}\.json$/i,
  distance: /^distance-\d{4}-\d{2}-\d{2}\.json$/i,
  sedentary: /^sedentary_minutes-\d{4}-\d{2}-\d{2}\.json$/i,
  light: /^lightly_active_minutes-\d{4}-\d{2}-\d{2}\.json$/i,
  moderate: /^moderately_active_minutes-\d{4}-\d{2}-\d{2}\.json$/i,
  very: /^very_active_minutes-\d{4}-\d{2}-\d{2}\.json$/i,
  rhr: /^resting_heart_rate-\d{4}-\d{2}-\d{2}\.json$/i,
  hr: /^heart_rate-\d{4}-\d{2}-\d{2}\.json$/i,
  sleep: /^sleep-\d{4}-\d{2}-\d{2}\.json$/i,
  weight: /^weight-\d{4}-\d{2}-\d{2}\.json$/i,
  exercise: /^exercise-\d+\.json$/i,
  sleepScore: /^sleep_score\.csv$/i,
  hrv: /^Daily Heart Rate Variability Summary - .*\.csv$/i,
  spo2: /^Daily SpO2 - .*\.csv$/i,
  gdSteps: /^steps_\d{4}-\d{2}-\d{2}\.csv$/i,
  gdCalories: /^calories_\d{4}-\d{2}-\d{2}\.csv$/i,
  gdHr: /^heart_rate_\d{4}-\d{2}-\d{2}\.csv$/i,
  gdWeight: /^weight(_\d{4}-\d{2}-\d{2})?\.csv$/i,
  gdSleeps: /^UserSleeps_.*$/i,
  gdStages: /^UserSleepStages_.*$/i,
};
const KNOWN_ORDER = Object.keys(LEGACY);

// Family key of any other CSV/JSON file: its name without dates, numbers and extension.
// "Daily Respiratory Rate Summary - 2024-07-22.csv" -> "Daily Respiratory Rate Summary";
// "swim_lengths_data_2024-10-01.csv" -> "swim lengths data"; "time_in_heart_rate_zones-2021-07-01.json" -> "time in heart rate zones"
export function familyName(name) {
  let n = base(name).replace(/\.(csv|json)$/i, '');
  n = n.replace(/\s*[-_ ]\s*\(?\d{4}[-_]\d{2}(?:[-_]\(?\d{1,2}\)?)?\)?(?:\s*-\s*\d{4}[-_]\d{2}(?:[-_]\d{1,2})?)?/g, '');
  n = n.replace(/[-_ ]\d+$/, '').replace(/_/g, ' ').replace(/\s+/g, ' ').trim().replace(/^[-\s]+|[-\s]+$/g, '');
  return n || base(name);
}
const titleCase = s => s.charAt(0).toUpperCase() + s.slice(1);

// -> { kind: one of KNOWN_ORDER | 'csv' | 'json' | 'profile' | null, family, label }
export function classify(path) {
  const p = String(path).replace(/\\/g, '/');
  const nm = base(p);
  if (/(^|\/)Profile\.csv$/i.test(p) || /(^|\/)UserProfileData(\.csv)?$/i.test(p)) return { kind: 'profile', family: 'profile', label: 'Profile' };
  if (!nm || nm.startsWith('.') || SKIP.some(r => r.test(nm)) || SKIP_PATH.some(r => r.test(p))) return { kind: null };
  for (const k of KNOWN_ORDER) if (LEGACY[k].test(nm)) return { kind: k, family: k, label: k };
  if (/\.csv$/i.test(nm)) { const f = familyName(nm); return { kind: 'csv', family: 'csv:' + f.toLowerCase(), label: titleCase(f) }; }
  if (/\.json$/i.test(nm)) { const f = familyName(nm); return { kind: 'json', family: 'json:' + f.toLowerCase(), label: titleCase(f) }; }
  return { kind: null };
}

/* ------------------------------------------------------------------ CSV */
export function parseCsv(text) {
  const t = String(text).replace(/^﻿/, '');
  const rows = [];
  let row = [], cur = '', q = false;
  for (let i = 0; i < t.length; i++) {
    const c = t[i];
    if (q) {
      if (c === '"') { if (t[i + 1] === '"') { cur += '"'; i++; } else q = false; } else cur += c;
    } else if (c === '"') q = true;
    else if (c === ',') { row.push(cur); cur = ''; }
    else if (c === '\n' || c === '\r') {
      if (c === '\r' && t[i + 1] === '\n') i++;
      row.push(cur); cur = '';
      if (row.length > 1 || row[0] !== '') rows.push(row);
      row = [];
    } else cur += c;
  }
  if (cur !== '' || row.length) { row.push(cur); if (row.length > 1 || row[0] !== '') rows.push(row); }
  if (!rows.length) return { header: [], rows: [] };
  const header = rows[0].map(h => h.trim());
  return { header, rows: rows.slice(1).map(r => Object.fromEntries(header.map((h, i) => [h, r[i] === undefined ? '' : r[i]]))) };
}

// rows -> CSV text. sep ',' (dot decimals) or ';' (comma decimals, for European Excel). A byte order mark so Excel reads UTF-8.
export function toCsv(rows, { sep = ',', bom = true, columns = null } = {}) {
  if (!rows.length) return (bom ? '﻿' : '') + (columns ? columns.join(sep) + '\r\n' : '');
  const cols = columns || unionColumns(rows);
  const cell = v => {
    if (v === null || v === undefined) return '';
    let s = typeof v === 'number' ? (sep === ';' ? String(v).replace('.', ',') : String(v)) : String(v);
    if (/^[=+\-@\t\r]/.test(s) && typeof v !== 'number' && !/^-?\d/.test(s)) s = "'" + s;   // a cell that would run as a formula
    return /["\r\n]/.test(s) || s.includes(sep) ? `"${s.replace(/"/g, '""')}"` : s;
  };
  const out = [cols.map(cell).join(sep)];
  for (const r of rows) out.push(cols.map(c => cell(r[c])).join(sep));
  return (bom ? '﻿' : '') + out.join('\r\n') + '\r\n';
}
export function unionColumns(rows) {
  const seen = new Set(), cols = [];
  for (const r of rows) for (const k of Object.keys(r)) if (!seen.has(k)) { seen.add(k); cols.push(k); }
  return cols;
}

/* ------------------------------------------------------------------ JSON */
export function parseJsonArray(text) {
  const t = String(text).replace(/^﻿/, '').trim();
  if (!t) return [];
  const v = JSON.parse(t);
  return Array.isArray(v) ? v : v && typeof v === 'object' ? [v] : [];
}
// { a: 1, value: { bpm: 60 } } -> { a: 1, 'value.bpm': 60 }; arrays become JSON text
export function flatten(o, prefix = '', out = {}) {
  for (const [k, v] of Object.entries(o || {})) {
    const key = prefix ? `${prefix}.${k}` : k;
    if (v && typeof v === 'object' && !Array.isArray(v)) flatten(v, key, out);
    else out[key] = Array.isArray(v) ? JSON.stringify(v) : v;
  }
  return out;
}

/* ------------------------------------------------------------------ the store */
// One store holds everything read so far. Minute series are kept per UTC quarter hour (small: five years is 175,000 keys
// at most), so the time zone can be changed later without reading the archive again.
export function newStore() {
  return {
    q: { steps: new Map(), calories: new Map(), distance: new Map() },   // quarter-hour key -> sum
    bits: {},                    // de-duplication bitmaps, one per minute series
    daily: new Map(),            // day -> { sedentary, light, moderate, very, rhr, hrv, spo2 }
    nights: new Map(),           // logId -> night
    weights: new Map(),          // logId or stamp -> weigh-in
    workouts: new Map(),         // logId -> workout
    scores: new Map(),           // sleep log id -> sleep score row
    tz: '', tzFrom: '',
    counts: {},
  };
}
const dayRec = (S, day) => { let r = S.daily.get(day); if (!r) { r = {}; S.daily.set(day, r); } return r; };
const QH = 9e5; // a quarter hour in ms

// steps / calories / distance, legacy JSON (one file = one batch of minutes, UTC). Batches overlap at their edges, so a
// minute already counted is skipped: one bit per minute from 2008 to 2040 (2 MB per data type) remembers what was read.
const BASE_MIN = Date.UTC(2008, 0, 1) / 60000, SPAN_MIN = (Date.UTC(2040, 0, 1) - Date.UTC(2008, 0, 1)) / 60000;
export function ingestMinutes(S, fam, arr) {
  const map = S.q[fam];
  const bits = S.bits[fam] || (S.bits[fam] = new Uint8Array(Math.ceil(SPAN_MIN / 8)));
  let n = 0;
  for (const e of arr) {
    const p = parseStamp(e && e.dateTime);
    const v = num(e && e.value);
    if (!p || !Number.isFinite(v)) continue;
    const ms = stampMs(p);
    const i = Math.floor(ms / 60000) - BASE_MIN;
    if (i >= 0 && i < SPAN_MIN) { const b = 1 << (i & 7); if (bits[i >> 3] & b) continue; bits[i >> 3] |= b; }
    const k = Math.floor(ms / QH);
    map.set(k, (map.get(k) || 0) + v);
    n++;
  }
  S.counts[fam] = (S.counts[fam] || 0) + n;
  return n;
}
// newer CSV layout: steps_YYYY-MM-DD.csv (timestamp, steps) and calories_... (timestamp, calories)
export function ingestMinuteCsv(S, fam, text) {
  const { header, rows } = parseCsv(text);
  const tcol = header.find(h => /time|date/i.test(h));
  const vcol = header.find(h => h !== tcol && new RegExp(fam, 'i').test(h)) || header.find(h => h !== tcol);
  if (!tcol || !vcol) return 0;
  return ingestMinutes(S, fam, rows.map(r => ({ dateTime: r[tcol], value: r[vcol] })));
}

export function ingestDailyValue(S, field, arr) {
  let n = 0;
  for (const e of arr) {
    const p = parseStamp(e && e.dateTime);
    const v = num(e && e.value);
    if (!p || !Number.isFinite(v)) continue;
    dayRec(S, stampDay(p))[field] = v;
    n++;
  }
  S.counts[field] = (S.counts[field] || 0) + n;
  return n;
}
export function ingestRestingHr(S, arr) {
  let n = 0;
  for (const e of arr) {
    const v = e && e.value;
    const r = v && typeof v === 'object' ? num(v.value) : num(v);
    const p = parseStamp(v && v.date) || parseStamp(e && e.dateTime);
    if (!p || !Number.isFinite(r) || r <= 0) continue;   // padded days carry 0
    dayRec(S, stampDay(p)).rhr = r;
    n++;
  }
  S.counts.rhr = (S.counts.rhr || 0) + n;
  return n;
}

function stageMinutes(sum, k) { const v = sum && sum[k]; return v && Number.isFinite(num(v.minutes)) ? num(v.minutes) : ''; }
export function ingestSleep(S, arr) {
  let n = 0;
  for (const e of arr) {
    if (!e || typeof e !== 'object' || !e.dateOfSleep) continue;
    const st = parseStamp(e.startTime), en = parseStamp(e.endTime);
    const id = String(e.logId ?? `${e.startTime}`);
    const sum = e.levels && e.levels.summary;
    const stages = e.type === 'stages';
    S.nights.set(id, {
      id, date: String(e.dateOfSleep).slice(0, 10), start: stampText(st), end: stampText(en), main: e.mainSleep !== false,
      type: e.type || '', logType: e.logType || '',
      asleep: num(e.minutesAsleep), awake: num(e.minutesAwake), inBed: num(e.timeInBed), toFall: num(e.minutesToFallAsleep),
      after: num(e.minutesAfterWakeup), efficiency: num(e.efficiency),
      deep: stages ? stageMinutes(sum, 'deep') : '', light: stages ? stageMinutes(sum, 'light') : '', rem: stages ? stageMinutes(sum, 'rem') : '', wake: stages ? stageMinutes(sum, 'wake') : '',
      restless: !stages ? stageMinutes(sum, 'restless') : '',
      segments: Array.isArray(e.levels && e.levels.data) ? e.levels.data.map(d => ({ t: String(d.dateTime || ''), level: String(d.level || ''), s: num(d.seconds) })) : [],
    });
    n++;
  }
  S.counts.sleep = S.nights.size;
  return n;
}
// newer CSV layout sleep (UserSleeps_*: sleep_id, sleep_start, sleep_end, minutes_asleep, minutes_awake, ...)
export function ingestSleepCsv(S, text) {
  const { rows } = parseCsv(text);
  for (const r of rows) {
    const st = parseStamp(r.sleep_start), en = parseStamp(r.sleep_end);
    if (!st || !r.sleep_id) continue;
    const id = 'g' + r.sleep_id;
    const prev = S.nights.get(id) || { segments: [] };
    S.nights.set(id, Object.assign(prev, {
      id, date: stampDay(en || st), start: stampText(st), end: stampText(en), main: !/nap/i.test(r.sleep_type || ''), type: r.sleep_type || '', logType: r.data_source || '',
      asleep: num(r.minutes_asleep), awake: num(r.minutes_awake), inBed: num(r.minutes_in_sleep_period), toFall: num(r.minutes_to_fall_asleep), after: num(r.minutes_after_wake_up), efficiency: num(r.efficiency),
      deep: prev.deep ?? '', light: prev.light ?? '', rem: prev.rem ?? '', wake: prev.wake ?? '', restless: '',
    }));
  }
  S.counts.sleep = S.nights.size;
}
export function ingestStagesCsv(S, text) {
  const { rows } = parseCsv(text);
  const acc = new Map();
  for (const r of rows) {
    const id = 'g' + r.sleep_id;
    const a = parseStamp(r.sleep_stage_start), b = parseStamp(r.sleep_stage_end);
    if (!r.sleep_id || !a || !b) continue;
    const mins = (stampMs(b) - stampMs(a)) / 60000;
    const k = String(r.sleep_stage_type || '').toLowerCase().replace('awake', 'wake');
    const o = acc.get(id) || { deep: 0, light: 0, rem: 0, wake: 0, seg: [] };
    if (k in o) o[k] += mins;
    o.seg.push({ t: stampText(a), level: k, s: mins * 60 });
    acc.set(id, o);
  }
  for (const [id, o] of acc) {
    const nt = S.nights.get(id) || { id, segments: [] };
    Object.assign(nt, { deep: round(o.deep), light: round(o.light), rem: round(o.rem), wake: round(o.wake), segments: o.seg });
    S.nights.set(id, nt);
  }
}
export function ingestSleepScores(S, text) {
  const { rows } = parseCsv(text);
  for (const r of rows) if (r.sleep_log_entry_id) S.scores.set(String(r.sleep_log_entry_id), r);
  S.counts.sleepScore = S.scores.size;
}

export function ingestWeight(S, arr) {
  let n = 0;
  for (const e of arr) {
    const p = parseStamp(`${e && e.date ? e.date : ''} ${e && e.time ? e.time : '00:00:00'}`.trim());
    const w = num(e && e.weight);
    if (!p || !Number.isFinite(w) || w <= 0) continue;
    const id = String(e.logId ?? stampText(p));
    S.weights.set(id, { id, at: stampText(p), day: stampDay(p), raw: w, bmi: num(e.bmi), fat: num(e.fat), source: e.source || '' });
    n++;
  }
  S.counts.weight = S.weights.size;
  return n;
}
// newer layout weight.csv: the unit is in the column name ("weight grams")
export function ingestWeightCsv(S, text) {
  const { header, rows } = parseCsv(text);
  const tcol = header.find(h => /time|date/i.test(h));
  const wcol = header.find(h => /weight/i.test(h));
  if (!tcol || !wcol) return 0;
  const f = /gram/i.test(wcol) && !/kilo/i.test(wcol) ? 1 / 1000 : /pound|lb/i.test(wcol) ? 0.45359237 : 1;
  let n = 0;
  for (const r of rows) {
    const p = parseStamp(r[tcol]); const w = num(r[wcol]);
    if (!p || !Number.isFinite(w) || w <= 0) continue;
    const id = 'g' + stampText(p);
    S.weights.set(id, { id, at: stampText(p), day: stampDay(p), raw: w * f, rawIsKg: true, bmi: NaN, fat: NaN, source: 'Google' });
    n++;
  }
  S.counts.weight = S.weights.size;
  return n;
}

export function ingestExercise(S, arr) {
  for (const e of arr) {
    if (!e || typeof e !== 'object') continue;
    const p = parseStamp(e.startTime);
    if (!p) continue;
    const id = String(e.logId ?? stampText(p) + (e.activityName || ''));
    S.workouts.set(id, {
      id, start: stampText(p), day: stampDay(p), name: e.activityName || '', type: e.activityTypeId ?? '', logType: e.logType || '',
      dur: num(e.duration), active: num(e.activeDuration), cal: num(e.calories), steps: num(e.steps),
      dist: num(e.distance), unit: e.distanceUnit || '', hr: num(e.averageHeartRate), elev: num(e.elevationGain),
    });
  }
  S.counts.exercise = S.workouts.size;
}

// Daily CSV values: HRV (timestamp, rmssd), SpO2 (timestamp, average_value)
export function ingestDailyCsv(S, field, valueCol, text) {
  const { header, rows } = parseCsv(text);
  const tcol = header.find(h => /time|date/i.test(h));
  if (!tcol || !header.includes(valueCol)) return 0;
  let n = 0;
  for (const r of rows) { const p = parseStamp(r[tcol]); const v = num(r[valueCol]); if (!p || !Number.isFinite(v)) continue; dayRec(S, stampDay(p))[field] = v; n++; }
  S.counts[field] = (S.counts[field] || 0) + n;
  return n;
}

export function readProfile(S, text) {
  const { header, rows } = parseCsv(text);
  const col = header.find(h => /time.?zone/i.test(h));
  const tz = col && rows[0] ? String(rows[0][col]).trim() : '';
  if (tz && validZone(tz)) { S.tz = tz; S.tzFrom = 'profile'; }
  return tz;
}

/* ------------------------------------------------------------------ weight unit */
// Fitbit's archive writes weight without a unit. BMI is in the same record, and weight / BMI is the height in metres squared
// when the weight is in kilograms (about 2.1 to 4.4 for adults) and 2.2 times that when it is in pounds (about 4.6 to 9.7).
// The two ranges do not overlap, so the median ratio tells the unit. Without BMI the unit stays undecided (the page asks).
export function weightUnit(S) {
  const r = [...S.weights.values()].filter(w => !w.rawIsKg && w.bmi > 5 && w.raw > 0).map(w => w.raw / w.bmi).sort((a, b) => a - b);
  if (!r.length) return { unit: '', basis: 'none', n: 0 };
  const med = r[Math.floor(r.length / 2)];
  return { unit: med < 4.45 ? 'kg' : 'lb', basis: 'bmi', n: r.length, ratio: round(med, 2) };
}

/* ------------------------------------------------------------------ tables */
export function localDayOf(ms, off) { return ymd(ms + off * 60000); }

// quarter hours -> local days for the store's time zone
export function minuteDays(S, tz = S.tz) {
  const off = zoneOffsetFn(tz);
  const out = new Map();
  for (const fam of ['steps', 'calories', 'distance']) {
    for (const [k, v] of S.q[fam]) {
      const ms = k * QH;
      const day = localDayOf(ms, off(ms));
      let r = out.get(day); if (!r) { r = {}; out.set(day, r); }
      r[fam] = (r[fam] || 0) + v;
    }
  }
  return out;
}

export function coverage(S, tz = S.tz) {
  const days = new Set();
  const md = minuteDays(S, tz);
  for (const [d, r] of md) if (r.steps > 0 || r.calories > 0) days.add(d);
  for (const [d, r] of S.daily) if (Object.keys(r).length) days.add(d);
  for (const n of S.nights.values()) if (n.date) days.add(n.date);
  for (const w of S.weights.values()) days.add(w.day);
  for (const w of S.workouts.values()) days.add(w.day);
  const list = [...days].filter(d => /^\d{4}-\d{2}-\d{2}$/.test(d)).sort();
  return { first: list[0] || '', last: list[list.length - 1] || '', days: list.length };
}

const inRange = (day, from, to) => (!from || day >= from) && (!to || day <= to);
const kgOf = (w, unit) => (w.rawIsKg ? w.raw : unit === 'kg' ? w.raw : unit === 'lb' ? w.raw * 0.45359237 : NaN);

export function dailyRows(S, from, to, { tz = S.tz, unit = 'lb' } = {}) {
  const md = minuteDays(S, tz);
  const days = new Set([...md.keys(), ...S.daily.keys()]);
  const sleepBy = new Map();
  for (const n of S.nights.values()) {
    const s = sleepBy.get(n.date) || { main: 0, nap: 0, bed: 0, score: '' };
    if (n.main) { s.main += num(n.asleep) || 0; s.bed += num(n.inBed) || 0; const sc = S.scores.get(n.id); if (sc && sc.overall_score !== undefined) s.score = num(sc.overall_score); }
    else s.nap += num(n.asleep) || 0;
    sleepBy.set(n.date, s); days.add(n.date);
  }
  const wBy = new Map();
  for (const w of [...S.weights.values()].sort((a, b) => (a.at < b.at ? -1 : 1))) { wBy.set(w.day, w); days.add(w.day); }
  const rows = [];
  for (const d of [...days].filter(x => x && inRange(x, from, to)).sort()) {
    const m = md.get(d) || {}, r = S.daily.get(d) || {}, s = sleepBy.get(d), w = wBy.get(d);
    const kg = w ? kgOf(w, unit) : NaN;
    const row = {
      date: d,
      steps: m.steps !== undefined ? Math.round(m.steps) : '',
      distance_km: m.distance !== undefined ? round(m.distance / 100000, 2) : '',
      calories_kcal: m.calories !== undefined ? Math.round(m.calories) : '',
      sedentary_min: r.sedentary ?? '', lightly_active_min: r.light ?? '', fairly_active_min: r.moderate ?? '', very_active_min: r.very ?? '',
      resting_heart_rate: r.rhr !== undefined ? round(r.rhr, 1) : '',
      sleep_min: s && s.main ? s.main : '', time_in_bed_min: s && s.bed ? s.bed : '', nap_min: s && s.nap ? s.nap : '', sleep_score: s && s.score !== '' ? s.score : '',
      hrv_rmssd_ms: r.hrv !== undefined ? round(r.hrv, 1) : '', spo2_avg_pct: r.spo2 !== undefined ? round(r.spo2, 1) : '',
      weight_kg: Number.isFinite(kg) ? round(kg, 2) : '', weight_lb: Number.isFinite(kg) ? round(kg / 0.45359237, 1) : '',
      body_fat_pct: w && Number.isFinite(w.fat) ? round(w.fat, 1) : '',
    };
    if (Object.entries(row).some(([k, v]) => k !== 'date' && v !== '' && v !== 0)) rows.push(row);
  }
  return rows;
}

export function sleepRows(S, from, to) {
  return [...S.nights.values()].filter(n => inRange(n.date, from, to)).sort((a, b) => (a.start < b.start ? -1 : 1)).map(n => {
    const sc = S.scores.get(n.id) || {};
    return {
      date: n.date, start: n.start, end: n.end, main_sleep: n.main ? 'yes' : 'no', minutes_asleep: n.asleep ?? '', minutes_awake: n.awake ?? '', time_in_bed_min: n.inBed ?? '',
      minutes_to_fall_asleep: n.toFall ?? '', minutes_after_wakeup: n.after ?? '', efficiency: n.efficiency ?? '',
      deep_min: n.deep, light_min: n.light, rem_min: n.rem, wake_min: n.wake, restless_min: n.restless,
      sleep_score: sc.overall_score ?? '', type: n.type, logged: n.logType, log_id: n.id,
    };
  }).map(r => Object.fromEntries(Object.entries(r).map(([k, v]) => [k, Number.isNaN(v) ? '' : v])));
}

export function stageRows(S, from, to) {
  const out = [];
  for (const n of [...S.nights.values()].filter(x => inRange(x.date, from, to)).sort((a, b) => (a.start < b.start ? -1 : 1))) {
    for (const g of n.segments) {
      const p = parseStamp(g.t);
      out.push({ night: n.date, start: p ? stampText(p) : g.t, stage: g.level, seconds: Number.isFinite(g.s) ? g.s : '', minutes: Number.isFinite(g.s) ? round(g.s / 60, 1) : '' });
    }
  }
  return out;
}

export function weightRows(S, from, to, unit = 'lb') {
  return [...S.weights.values()].filter(w => inRange(w.day, from, to)).sort((a, b) => (a.at < b.at ? -1 : 1)).map(w => {
    const kg = kgOf(w, unit);
    return { date: w.day, time: w.at.slice(11), weight_kg: Number.isFinite(kg) ? round(kg, 2) : '', weight_lb: Number.isFinite(kg) ? round(kg / 0.45359237, 1) : '', bmi: Number.isFinite(w.bmi) ? round(w.bmi, 2) : '', body_fat_pct: Number.isFinite(w.fat) ? round(w.fat, 1) : '', source: w.source };
  });
}

export function workoutRows(S, from, to) {
  return [...S.workouts.values()].filter(w => inRange(w.day, from, to)).sort((a, b) => (a.start < b.start ? -1 : 1)).map(w => {
    const km = /mile/i.test(w.unit) ? w.dist * 1.609344 : /meter|metre/i.test(w.unit) && !/kilo/i.test(w.unit) ? w.dist / 1000 : w.dist;
    return {
      start: w.start, activity: w.name, duration_min: Number.isFinite(w.dur) ? round(w.dur / 60000, 1) : '', active_min: Number.isFinite(w.active) ? round(w.active / 60000, 1) : '',
      calories_kcal: Number.isFinite(w.cal) ? Math.round(w.cal) : '', steps: Number.isFinite(w.steps) ? w.steps : '',
      distance_km: Number.isFinite(km) ? round(km, 2) : '', avg_heart_rate: Number.isFinite(w.hr) ? w.hr : '', elevation_gain: Number.isFinite(w.elev) ? w.elev : '',
      logged: w.logType, activity_type_id: w.type, log_id: w.id,
    };
  });
}

// every reading of a minute or heart-rate file, moved to local time, cut to the dates
export function readingRows(arr, from, to, tz, kind) {
  const off = zoneOffsetFn(tz);
  const out = [];
  for (const e of arr) {
    const p = parseStamp(e && (e.dateTime ?? e.timestamp));
    if (!p) continue;
    const ms = stampMs(p);
    const local = new Date(ms + off(ms) * 60000).toISOString();   // both layouts store these in UTC
    const day = local.slice(0, 10);
    if (!inRange(day, from, to)) continue;
    if (kind === 'hr') {
      const v = e.value && typeof e.value === 'object' ? e.value : { bpm: e.value ?? e['beats per minute'] };
      const bpm = num(v.bpm);
      if (!Number.isFinite(bpm)) continue;
      out.push({ time: local.slice(0, 10) + ' ' + local.slice(11, 19), bpm, confidence: v.confidence ?? '' });
    } else {
      const v = num(e.value);
      if (!Number.isFinite(v)) continue;
      out.push({ time: local.slice(0, 10) + ' ' + local.slice(11, 19), [kind]: v });
    }
  }
  return out;
}
export const mergeMinuteRows = (lists) => {
  const by = new Map();
  for (const [k, rows] of Object.entries(lists)) for (const r of rows) { const o = by.get(r.time) || { time: r.time }; o[k] = r[k]; by.set(r.time, o); }
  return [...by.values()].sort((a, b) => (a.time < b.time ? -1 : 1)).map(r => ({ time: r.time, steps: r.steps ?? '', calories_kcal: r.calories !== undefined ? round(r.calories, 3) : '', distance_m: r.distance !== undefined ? round(r.distance / 100, 2) : '' }));
};

/* ------------------------------------------------------------------ any other file */
// The first column that holds dates decides which rows fall in the range. Rows whose date cannot be read are kept.
export function dateColumn(header, rows) {
  const cand = header.filter(h => /time|date|day|start/i.test(h)).concat(header);
  for (const h of cand) { let ok = 0, seen = 0; for (const r of rows.slice(0, 50)) { if (r[h] === '' || r[h] === undefined) continue; seen++; if (parseStamp(r[h])) ok++; } if (seen && ok / seen > 0.8) return h; }
  return '';
}
export function cutRows(rows, col, from, to) {
  if (!col) return { rows, cut: false };
  return { rows: rows.filter(r => { const p = parseStamp(r[col]); return !p || inRange(stampDay(p), from, to); }), cut: true };
}
function inRangeRows(all, from, to) {
  const header = unionColumns(all);
  const col = dateColumn(header, all);
  const seen = new Set();
  const uniq = all.filter(r => { const k = JSON.stringify(r); if (seen.has(k)) return false; seen.add(k); return true; });
  const { rows, cut } = cutRows(uniq, col, from, to);
  if (col) rows.sort((a, b) => (stampMs(parseStamp(a[col])) || 0) - (stampMs(parseStamp(b[col])) || 0));
  return { rows, dateCol: col, cut };
}
export function genericCsvRows(texts, from, to) {
  let all = [];
  for (const t of texts) all = all.concat(parseCsv(t).rows);
  return inRangeRows(all, from, to);
}
export function genericJsonRows(texts, from, to) {
  let all = [];
  for (const t of texts) all = all.concat(parseJsonArray(t).map(o => (o && typeof o === 'object' ? flatten(o) : { value: o })));
  return inRangeRows(all, from, to);
}

export const FILE_NAMES = { daily: 'daily-summary', sleep: 'sleep', stages: 'sleep-stages', weight: 'weight', workouts: 'workouts', hr: 'heart-rate-readings', minutes: 'steps-per-minute' };
export const slugify = s => String(s).toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '') || 'data';

/* ------------------------------------------------------------------ one file into the store */
// Kinds read when the archive is opened. Heart-rate readings and every other file are read only when they are downloaded.
export const LOAD_KINDS = new Set(['profile', 'steps', 'calories', 'distance', 'sedentary', 'light', 'moderate', 'very', 'rhr', 'sleep', 'weight', 'exercise', 'sleepScore', 'hrv', 'spo2', 'gdSteps', 'gdCalories', 'gdWeight', 'gdSleeps', 'gdStages']);
// The newer CSV layout is only used for a data type the JSON layout does not have.
export const FALLBACK_OF = { gdSteps: 'steps', gdCalories: 'calories', gdWeight: 'weight', gdSleeps: 'sleep', gdStages: 'sleep' };
export function ingestFile(S, kind, text) {
  switch (kind) {
    case 'profile': return readProfile(S, text);
    case 'steps': case 'calories': case 'distance': return ingestMinutes(S, kind, parseJsonArray(text));
    case 'sedentary': case 'light': case 'moderate': case 'very': return ingestDailyValue(S, kind, parseJsonArray(text));
    case 'rhr': return ingestRestingHr(S, parseJsonArray(text));
    case 'sleep': return ingestSleep(S, parseJsonArray(text));
    case 'weight': return ingestWeight(S, parseJsonArray(text));
    case 'exercise': return ingestExercise(S, parseJsonArray(text));
    case 'sleepScore': return ingestSleepScores(S, text);
    case 'hrv': return ingestDailyCsv(S, 'hrv', 'rmssd', text);
    case 'spo2': return ingestDailyCsv(S, 'spo2', 'average_value', text);
    case 'gdSteps': return ingestMinuteCsv(S, 'steps', text);
    case 'gdCalories': return ingestMinuteCsv(S, 'calories', text);
    case 'gdWeight': return ingestWeightCsv(S, text);
    case 'gdSleeps': return ingestSleepCsv(S, text);
    case 'gdStages': return ingestStagesCsv(S, text);
    default: return 0;
  }
}
// order: profile first (time zone), sleep before stages and scores, files of one type by the date in their name
export function loadOrder(list) {
  const rank = k => (k === 'profile' ? 0 : k === 'gdStages' ? 3 : k === 'sleepScore' ? 2 : 1);
  return list.slice().sort((a, b) => rank(a.kind) - rank(b.kind) || (a.kind < b.kind ? -1 : a.kind > b.kind ? 1 : 0) || (nameDate(a.name) < nameDate(b.name) ? -1 : nameDate(a.name) > nameDate(b.name) ? 1 : (a.name < b.name ? -1 : 1)));
}
// which files to read when the archive opens, in order: the newer CSV layout only fills a type the JSON layout lacks
export function planLoad(list) {
  const have = new Set(list.filter(f => LOAD_KINDS.has(f.kind) && !FALLBACK_OF[f.kind]).map(f => f.kind));
  return loadOrder(list.filter(f => LOAD_KINDS.has(f.kind) && !(FALLBACK_OF[f.kind] && have.has(FALLBACK_OF[f.kind]))));
}
