/* Nightjar engine: turns the rows of an Oura data export into nights and days, and works out what the page shows. It
 * runs in the worker (and in Node for the tests); it has no network code. Field names follow Oura's API v2 models
 * (cloud.ouraring.com/v2/docs), which the export uses as column names. Durations in the export are seconds. */
import { jsonCell, num, bool, dayOf } from './csv.js';

export const DAY_MS = 864e5;
export const FREE_DAYS = 90;

/* ---------- files ---------- */
// The export's file names, without folders, case, "oura" prefixes, separators or the extension.
export function fileKind(name) {
  const base = String(name).split(/[\\/]/).pop().toLowerCase().replace(/\.(csv|json|txt)$/, '').replace(/[^a-z0-9]/g, '');
  const b = base.startsWith('oura') && base.length > 6 ? base.slice(4) : base;
  const KINDS = ['dailysleep', 'sleepmodel', 'dailyreadiness', 'dailyactivity', 'dailyspo2', 'dailystress', 'dailyresilience',
    'dailycardiovascularage', 'sleeptime', 'workout', 'session', 'enhancedtag', 'heartrate', 'temperature', 'daytimestress', 'vo2max'];
  if (KINDS.includes(b)) return b;
  if (b === 'workouts') return 'workout';
  if (b === 'sessions') return 'session';
  if (b === 'tags' || b === 'tag') return 'enhancedtag';
  if (b === 'sleep' || b === 'sleepperiods') return 'sleepmodel';
  return null;
}
// The files read in pieces as they stream (they can be very large); the rest are small enough to read at once.
export const STREAMED = new Set(['heartrate', 'temperature', 'daytimestress']);

/* ---------- store ---------- */
export function newExport(label) {
  return { label, days: new Map(), nights: new Map(), workouts: new Map(), sessions: new Map(), tags: new Map(), hr: new Map(), temp: new Map(), stress: new Map(), files: [] };
}
const dayRec = (ex, day) => { let d = ex.days.get(day); if (!d) { d = { day }; ex.days.set(day, d); } return d; };
const pick = (o, keys) => { if (!o || typeof o !== 'object') return null; const r = {}; let any = false; for (const k of keys) { const v = num(o[k]); r[k] = v; if (v !== null) any = true; } return any ? r : null; };
export const SLEEP_C = ['total_sleep', 'efficiency', 'restfulness', 'rem_sleep', 'deep_sleep', 'latency', 'timing'];
export const READY_C = ['previous_night', 'sleep_balance', 'sleep_regularity', 'previous_day_activity', 'activity_balance', 'resting_heart_rate', 'hrv_balance', 'recovery_index', 'body_temperature'];
export const ACT_C = ['stay_active', 'move_every_hour', 'meet_daily_targets', 'training_frequency', 'training_volume', 'recovery_time'];
export const RES_C = ['sleep_recovery', 'daytime_recovery', 'stress'];

// "2025-11-07T01:27:28.000-08:00" -> minutes after local midnight (the clock time the ring's phone showed) and the offset
export function clockOf(ts) {
  const m = String(ts || '').match(/^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})(?::(\d{2}))?/);
  if (!m) return null;
  const off = String(ts).match(/([+-])(\d{2}):?(\d{2})$/);
  const offMin = /Z$/.test(ts) ? 0 : off ? (off[1] === '-' ? -1 : 1) * (Number(off[2]) * 60 + Number(off[3])) : 0;
  return { date: `${m[1]}-${m[2]}-${m[3]}`, min: Number(m[4]) * 60 + Number(m[5]) + Number(m[6] || 0) / 60, off: offMin, ms: Date.UTC(+m[1], +m[2] - 1, +m[3], +m[4], +m[5], +(m[6] || 0)) - offMin * 6e4 };
}
const sample = (v) => {
  const o = jsonCell(v);
  if (!o) return null;
  const items = Array.isArray(o) ? o : Array.isArray(o.items) ? o.items : null;
  if (!items) return null;
  return { interval: num(o.interval) || 300, items: items.map(x => (x === null || x === undefined || !Number.isFinite(Number(x)) ? null : Number(x))) };
};

// One row of a small file into the export. Returns false when the row has nothing usable.
export function ingestRow(ex, kind, r) {
  switch (kind) {
    case 'dailysleep': {
      const day = dayOf(r.day) || dayOf(r.timestamp); if (!day) return false;
      const d = dayRec(ex, day); d.sleepScore = num(r.score); d.sc = pick(jsonCell(r.contributors), SLEEP_C); return true;
    }
    case 'dailyreadiness': {
      const day = dayOf(r.day) || dayOf(r.timestamp); if (!day) return false;
      const d = dayRec(ex, day); d.readiness = num(r.score); d.rc = pick(jsonCell(r.contributors), READY_C);
      d.tempDev = num(r.temperature_deviation); d.tempTrend = num(r.temperature_trend_deviation); return true;
    }
    case 'dailyactivity': {
      const day = dayOf(r.day) || dayOf(r.timestamp); if (!day) return false;
      const d = dayRec(ex, day);
      d.activityScore = num(r.score); d.ac = pick(jsonCell(r.contributors), ACT_C);
      d.steps = num(r.steps); d.activeCal = num(r.active_calories); d.totalCal = num(r.total_calories); d.targetCal = num(r.target_calories);
      d.walkM = num(r.equivalent_walking_distance); d.highT = num(r.high_activity_time); d.medT = num(r.medium_activity_time); d.lowT = num(r.low_activity_time);
      d.sedT = num(r.sedentary_time); d.restT = num(r.resting_time); d.nonWearT = num(r.non_wear_time); d.alerts = num(r.inactivity_alerts);
      const c5 = String(r.class_5_min || '').trim(); d.class5 = /^[0-5]+$/.test(c5) ? c5 : null; return true;
    }
    case 'dailyspo2': {
      const day = dayOf(r.day); if (!day) return false;
      const d = dayRec(ex, day); const s = jsonCell(r.spo2_percentage);
      d.spo2 = s && typeof s === 'object' ? num(s.average) : num(r.spo2_percentage); d.bdi = num(r.breathing_disturbance_index); return true;
    }
    case 'dailystress': {
      const day = dayOf(r.day); if (!day) return false;
      const d = dayRec(ex, day); d.stressHigh = num(r.stress_high); d.recoveryHigh = num(r.recovery_high);
      const s = String(r.day_summary || '').trim().toLowerCase(); d.daySummary = ['restored', 'normal', 'stressful'].includes(s) ? s : null; return true;
    }
    case 'dailyresilience': {
      const day = dayOf(r.day); if (!day) return false;
      const d = dayRec(ex, day); const l = String(r.level || '').trim().toLowerCase();
      d.resilience = ['limited', 'adequate', 'solid', 'strong', 'exceptional'].includes(l) ? l : null; d.resc = pick(jsonCell(r.contributors), RES_C); return true;
    }
    case 'dailycardiovascularage': {
      const day = dayOf(r.day); if (!day) return false;
      const d = dayRec(ex, day); d.vascularAge = num(r.vascular_age); d.pwv = num(r.pulse_wave_velocity); return true;
    }
    case 'vo2max': {
      const day = dayOf(r.day) || dayOf(r.timestamp); if (!day) return false;
      const v = num(r.vo2_max); if (v === null) return false; dayRec(ex, day).vo2max = v; return true;
    }
    case 'sleeptime': {
      const day = dayOf(r.day); if (!day) return false;
      const d = dayRec(ex, day); const w = jsonCell(r.optimal_bedtime);
      d.optBed = w && typeof w === 'object' && num(w.start_offset) !== null ? { start: num(w.start_offset), end: num(w.end_offset) } : null;
      d.sleepRec = String(r.recommendation || '').trim() || null; d.sleepStatus = String(r.status || '').trim() || null; return true;
    }
    case 'sleepmodel': {
      const day = dayOf(r.day); if (!day) return false;
      const type = String(r.type || '').trim().toLowerCase() || 'long_sleep';
      if (type === 'deleted') return false;
      const st = clockOf(r.bedtime_start), en = clockOf(r.bedtime_end);
      const id = String(r.id || '').trim() || `${day}:${r.bedtime_start}:${r.period}`;
      let phases = String(r.app_sleep_phase_5_min || r.sleep_phase_5_min || '').trim();
      if (!/^[1-4]+$/.test(phases)) phases = '';
      const rd = jsonCell(r.readiness);
      const n = {
        id, day, type, start: st, end: en, period: num(r.period),
        total: num(r.total_sleep_duration), deep: num(r.deep_sleep_duration), rem: num(r.rem_sleep_duration), light: num(r.light_sleep_duration),
        awake: num(r.awake_time), inBed: num(r.time_in_bed), eff: num(r.efficiency), lat: num(r.latency),
        hrAvg: num(r.average_heart_rate), hrLow: num(r.lowest_heart_rate), hrv: num(r.average_hrv), breath: num(r.average_breath), restless: num(r.restless_periods),
        phases, hr: sample(r.heart_rate), hrvS: sample(r.hrv),
        rScore: rd && typeof rd === 'object' ? num(rd.score) : null, rTemp: rd && typeof rd === 'object' ? num(rd.temperature_deviation) : null,
        lowBattery: bool(r.low_battery_alert),
      };
      if (n.total === null && phases) n.total = [...phases].filter(c => c !== '4').length * 300;
      if (n.inBed === null && st && en) n.inBed = Math.round((en.ms - st.ms) / 1000);
      ex.nights.set(id, n); return true;
    }
    case 'workout': {
      const day = dayOf(r.day) || dayOf(r.start_datetime); if (!day) return false;
      const st = clockOf(r.start_datetime), en = clockOf(r.end_datetime);
      const id = String(r.id || '').trim() || `${day}:${r.start_datetime}:${r.activity}`;
      ex.workouts.set(id, { id, day, activity: String(r.activity || '').trim().toLowerCase() || 'other', label: String(r.label || '').trim() || null,
        cal: num(r.calories), dist: num(r.distance), intensity: String(r.intensity || '').trim().toLowerCase() || null, source: String(r.source || '').trim() || null,
        start: st, dur: st && en ? Math.max(0, Math.round((en.ms - st.ms) / 1000)) : null });
      return true;
    }
    case 'session': {
      const day = dayOf(r.day) || dayOf(r.start_datetime); if (!day) return false;
      const st = clockOf(r.start_datetime), en = clockOf(r.end_datetime);
      const id = String(r.id || '').trim() || `${day}:${r.start_datetime}`;
      ex.sessions.set(id, { id, day, type: String(r.type || '').trim().toLowerCase() || 'session', mood: String(r.mood || '').trim().toLowerCase() || null, dur: st && en ? Math.max(0, Math.round((en.ms - st.ms) / 1000)) : null });
      return true;
    }
    case 'enhancedtag': {
      const st = clockOf(r.start_time);
      const day = dayOf(r.start_day) || (st && st.date); if (!day) return false;
      const code = String(r.tag_type_code || '').trim();
      const custom = String(r.custom_tag_name || r.custom_name || '').trim();
      const comment = String(r.comment || '').trim();
      const k = tagKey(code, custom, comment); if (!k) return false;
      const id = String(r.id || '').trim() || `${day}:${r.start_time}:${k.key}`;
      ex.tags.set(id, { id, day, min: st ? st.min : null, endDay: dayOf(r.end_day), key: k.key, code: k.code, name: k.name });
      return true;
    }
    default: return false;
  }
}

// A tag's key: Oura's codes (tag_generic_alcohol, tag_sleep_alcohol: both "alcohol"), a custom tag's own name, or the
// words of a text-only tag.
export function tagKey(code, custom, comment) {
  if (code && code.toLowerCase() !== 'custom' && !/^[0-9a-f-]{20,}$/i.test(code)) {
    const c = code.toLowerCase().replace(/^tag_(generic|sleep|activity|readiness)_/, '').replace(/^tag_/, '');
    if (c) return { key: 'oura:' + c, code: c, name: null };
  }
  const nm = (custom || (!code ? comment : '') || '').replace(/\s+/g, ' ').trim().slice(0, 40);
  if (nm) return { key: 'own:' + nm.toLowerCase(), code: null, name: nm };
  return null;
}

/* ---------- streamed files: heart rate, skin temperature, daytime stress ---------- */
// A cache from "YYYY-MM-DDTHH" (UTC) to the local day and hour in the chosen time zone.
export function makeLocaliser(tz) {
  const fmt = new Intl.DateTimeFormat('en-CA', { timeZone: tz, year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', hourCycle: 'h23' });
  const cache = new Map();
  return (ts) => {
    const s = String(ts);
    let key = s.slice(0, 13), offMin = 0;
    if (!/Z$/.test(s)) {
      const off = s.match(/([+-])(\d{2}):?(\d{2})$/);
      if (off) { offMin = (off[1] === '-' ? -1 : 1) * (Number(off[2]) * 60 + Number(off[3])); key += off[0]; }
    }
    let v = cache.get(key);
    if (v === undefined) {
      const m = s.match(/^(\d{4})-(\d{2})-(\d{2})T(\d{2})/);
      if (!m) { cache.set(key, null); return null; }
      const ms = Date.UTC(+m[1], +m[2] - 1, +m[3], +m[4]) - offMin * 6e4;
      const p = {}; for (const x of fmt.formatToParts(new Date(ms))) p[x.type] = x.value;
      v = { day: `${p.year}-${p.month}-${p.day}`, h: Number(p.hour) % 24 };
      cache.set(key, v);
    }
    return v;
  };
}
const agg = () => ({ n: 0, sum: 0, min: Infinity, max: -Infinity, hs: new Float64Array(24), hn: new Uint16Array(24) });
export function streamRow(ex, kind, r, local) {
  const t = local(r.timestamp);
  if (!t) return false;
  if (kind === 'heartrate') {
    const bpm = num(r.bpm); if (bpm === null || bpm < 25 || bpm > 240) return false;
    const src = String(r.source || '').trim().toLowerCase();
    if (src === 'sleep') return true; // the nights carry their own heart rate
    let a = ex.hr.get(t.day); if (!a) { a = agg(); ex.hr.set(t.day, a); }
    a.n++; a.sum += bpm; if (bpm < a.min) a.min = bpm; if (bpm > a.max) a.max = bpm; a.hs[t.h] += bpm; a.hn[t.h]++;
    return true;
  }
  if (kind === 'temperature') {
    const v = num(r.skin_temp ?? r.temperature ?? r.value); if (v === null || v < 15 || v > 45) return false;
    let a = ex.temp.get(t.day); if (!a) { a = agg(); ex.temp.set(t.day, a); }
    a.n++; a.sum += v; if (v < a.min) a.min = v; if (v > a.max) a.max = v; a.hs[t.h] += v; a.hn[t.h]++;
    return true;
  }
  if (kind === 'daytimestress') {
    const s = num(r.stress_value), rc = num(r.recovery_value); if (s === null && rc === null) return false;
    let a = ex.stress.get(t.day); if (!a) { a = { sn: 0, ss: 0, rn: 0, rs: 0, hs: new Float64Array(24), hn: new Uint16Array(24), hr: new Float64Array(24), hrn: new Uint16Array(24) }; ex.stress.set(t.day, a); }
    if (s !== null) { a.sn++; a.ss += s; a.hs[t.h] += s; a.hn[t.h]++; }
    if (rc !== null) { a.rn++; a.rs += rc; a.hr[t.h] += rc; a.hrn[t.h]++; }
    return true;
  }
  return false;
}

/* ---------- the view: one export, or several merged ---------- */
// Later exports win for a day that appears in more than one; nights, workouts, sessions and tags are kept by id, so the
// same record in two exports counts once.
export function buildView(exports) {
  const v = { days: new Map(), nights: new Map(), workouts: new Map(), sessions: new Map(), tags: new Map(), hr: new Map(), temp: new Map(), stress: new Map() };
  for (const ex of exports) {
    for (const [k, d] of ex.days) v.days.set(k, Object.assign(v.days.get(k) || {}, d));
    for (const key of ['nights', 'workouts', 'sessions', 'tags', 'hr', 'temp', 'stress']) for (const [k, x] of ex[key]) v[key].set(k, x);
  }
  // the main sleep of each day: the longest long sleep, else the longest of any type; the rest are naps and rests
  const byDay = new Map();
  for (const n of v.nights.values()) { const a = byDay.get(n.day) || []; a.push(n); byDay.set(n.day, a); }
  const main = new Map(), naps = [];
  const rank = n => (n.type === 'long_sleep' ? 1e6 : 0) + (n.total || 0);
  for (const [day, list] of byDay) {
    list.sort((a, b) => rank(b) - rank(a));
    main.set(day, list[0]);
    for (const n of list.slice(1)) naps.push(n);
  }
  const allDays = new Set([...v.days.keys(), ...main.keys()]);
  const sorted = [...allDays].filter(d => /^\d{4}-\d{2}-\d{2}$/.test(d)).sort();
  return {
    days: v.days, main, naps, workouts: [...v.workouts.values()].sort((a, b) => (a.day < b.day ? -1 : a.day > b.day ? 1 : 0)),
    sessions: [...v.sessions.values()], tags: [...v.tags.values()], hr: v.hr, temp: v.temp, stress: v.stress,
    first: sorted[0] || null, last: sorted[sorted.length - 1] || null, dayList: sorted,
  };
}

export const addDays = (day, n) => new Date(Date.parse(day + 'T00:00:00Z') + n * DAY_MS).toISOString().slice(0, 10);
export const daysBetween = (a, b) => Math.round((Date.parse(b + 'T00:00:00Z') - Date.parse(a + 'T00:00:00Z')) / DAY_MS);
export function freeRange(view) { return view.last ? { from: addDays(view.last, -(FREE_DAYS - 1)), to: view.last } : null; }
export function yearsIn(view) { const ys = new Set(view.dayList.map(d => Number(d.slice(0, 4)))); return [...ys].sort((a, b) => b - a); }

/* ---------- metrics ---------- */
// Every metric the page, the CSV and the comparisons use: where it comes from and its unit.
const N = (f) => (day, view) => { const n = view.main.get(day); return n ? f(n) : null; };
const D = (f) => (day, view) => { const d = view.days.get(day); return d ? f(d) : null; };
export const METRICS = {
  sleepScore: { get: D(d => d.sleepScore), unit: 'score' },
  readiness: { get: D(d => d.readiness), unit: 'score' },
  activityScore: { get: D(d => d.activityScore), unit: 'score' },
  total: { get: N(n => n.total), unit: 's' },
  inBed: { get: N(n => n.inBed), unit: 's' },
  deep: { get: N(n => n.deep), unit: 's' },
  rem: { get: N(n => n.rem), unit: 's' },
  light: { get: N(n => n.light), unit: 's' },
  awake: { get: N(n => n.awake), unit: 's' },
  eff: { get: N(n => n.eff), unit: '%' },
  lat: { get: N(n => n.lat), unit: 's' },
  hrv: { get: N(n => n.hrv), unit: 'ms' },
  hrLow: { get: N(n => n.hrLow), unit: 'bpm' },
  hrAvg: { get: N(n => n.hrAvg), unit: 'bpm' },
  breath: { get: N(n => n.breath), unit: 'br' },
  tempDev: { get: (day, view) => { const d = view.days.get(day); if (d && d.tempDev !== null && d.tempDev !== undefined) return d.tempDev; const n = view.main.get(day); return n ? n.rTemp : null; }, unit: 'dC' },
  spo2: { get: D(d => d.spo2), unit: '%' },
  bdi: { get: D(d => d.bdi), unit: 'n' },
  steps: { get: D(d => d.steps), unit: 'n' },
  activeCal: { get: D(d => d.activeCal), unit: 'kcal' },
  totalCal: { get: D(d => d.totalCal), unit: 'kcal' },
  walkM: { get: D(d => d.walkM), unit: 'm' },
  highT: { get: D(d => d.highT), unit: 's' },
  medT: { get: D(d => d.medT), unit: 's' },
  lowT: { get: D(d => d.lowT), unit: 's' },
  sedT: { get: D(d => d.sedT), unit: 's' },
  stressHigh: { get: D(d => d.stressHigh), unit: 's' },
  recoveryHigh: { get: D(d => d.recoveryHigh), unit: 's' },
  vascularAge: { get: D(d => d.vascularAge), unit: 'y' },
  vo2max: { get: D(d => d.vo2max), unit: 'vo2' },
  dayHr: { get: (day, view) => { const a = view.hr.get(day); return a && a.n ? a.sum / a.n : null; }, unit: 'bpm' },
  skinTemp: { get: (day, view) => { const a = view.temp.get(day); return a && a.n ? a.sum / a.n : null; }, unit: 'C' },
  dayStress: { get: (day, view) => { const a = view.stress.get(day); return a && a.sn ? a.ss / a.sn : null; }, unit: 'n' },
  bedtime: { get: N(n => (n.start ? (n.start.min < 720 ? n.start.min + 1440 : n.start.min) : null)), unit: 'clock' },
  wake: { get: N(n => (n.end ? n.end.min : null)), unit: 'clock' },
};

export function daysIn(view, from, to) {
  const out = [];
  for (const d of view.dayList) if (d >= from && d <= to) out.push(d);
  return out;
}
export function series(view, from, to, key) {
  const m = METRICS[key];
  return daysIn(view, from, to).map(day => ({ day, v: m.get(day, view) })).filter(p => p.v !== null && p.v !== undefined && Number.isFinite(p.v));
}
const mean = a => (a.length ? a.reduce((s, x) => s + x, 0) / a.length : null);
const sd = a => { if (a.length < 2) return null; const m = mean(a); return Math.sqrt(a.reduce((s, x) => s + (x - m) * (x - m), 0) / (a.length - 1)); };
const median = a => { if (!a.length) return null; const s = [...a].sort((x, y) => x - y); const i = s.length >> 1; return s.length % 2 ? s[i] : (s[i - 1] + s[i]) / 2; };
export const stats = { mean, sd, median };

export function averages(view, from, to, keys = Object.keys(METRICS)) {
  const out = {};
  for (const k of keys) {
    const vals = series(view, from, to, k).map(p => p.v);
    out[k] = { avg: mean(vals), n: vals.length, min: vals.length ? Math.min(...vals) : null, max: vals.length ? Math.max(...vals) : null, sd: sd(vals), median: median(vals) };
  }
  if (out.bedtime && out.bedtime.avg !== null) out.bedtime.avg %= 1440;
  return out;
}

export function contributorAverages(view, from, to) {
  const res = {};
  for (const [field, keys] of [['sc', SLEEP_C], ['rc', READY_C], ['ac', ACT_C], ['resc', RES_C]]) {
    const acc = {}; for (const k of keys) acc[k] = [];
    for (const day of daysIn(view, from, to)) { const d = view.days.get(day); const c = d && d[field]; if (c) for (const k of keys) if (c[k] !== null && c[k] !== undefined) acc[k].push(c[k]); }
    res[field] = keys.map(k => ({ key: k, avg: mean(acc[k]), n: acc[k].length }));
  }
  return res;
}

export function summary(view, from, to) {
  const days = daysIn(view, from, to);
  const nights = days.map(d => view.main.get(d)).filter(Boolean);
  const naps = view.naps.filter(n => n.day >= from && n.day <= to);
  const workouts = view.workouts.filter(w => w.day >= from && w.day <= to);
  const sessions = view.sessions.filter(s => s.day >= from && s.day <= to);
  const tags = view.tags.filter(t => t.day >= from && t.day <= to);
  const byAct = new Map();
  for (const w of workouts) { const a = byAct.get(w.activity) || { activity: w.activity, n: 0, dur: 0, cal: 0, dist: 0 }; a.n++; a.dur += w.dur || 0; a.cal += w.cal || 0; a.dist += w.dist || 0; byAct.set(w.activity, a); }
  const res = { resilience: {}, daySummary: {} };
  let lastVascular = null, lastVo2 = null;
  for (const day of days) {
    const d = view.days.get(day); if (!d) continue;
    if (d.resilience) res.resilience[d.resilience] = (res.resilience[d.resilience] || 0) + 1;
    if (d.daySummary) res.daySummary[d.daySummary] = (res.daySummary[d.daySummary] || 0) + 1;
    if (d.vascularAge !== null && d.vascularAge !== undefined) lastVascular = { day, v: d.vascularAge };
    if (d.vo2max !== null && d.vo2max !== undefined) lastVo2 = { day, v: d.vo2max };
  }
  const tagCounts = new Map();
  for (const t of tags) { const c = tagCounts.get(t.key) || { key: t.key, code: t.code, name: t.name, n: 0 }; c.n++; tagCounts.set(t.key, c); }
  return {
    from, to, days: days.length, nights: nights.length, naps: naps.length,
    avg: averages(view, from, to), contributors: contributorAverages(view, from, to),
    workouts: { n: workouts.length, dur: workouts.reduce((s, w) => s + (w.dur || 0), 0), byActivity: [...byAct.values()].sort((a, b) => b.n - a.n) },
    sessions: { n: sessions.length, dur: sessions.reduce((s, x) => s + (x.dur || 0), 0) },
    resilience: res.resilience, daySummary: res.daySummary, lastVascular, lastVo2,
    tags: [...tagCounts.values()].sort((a, b) => b.n - a.n),
    best: nights.filter(n => view.days.get(n.day) && view.days.get(n.day).sleepScore !== null && view.days.get(n.day).sleepScore !== undefined).sort((a, b) => view.days.get(b.day).sleepScore - view.days.get(a.day).sleepScore)[0] || null,
    longest: [...nights].sort((a, b) => (b.total || 0) - (a.total || 0))[0] || null,
  };
}

// The nights of a stretch, slimmed for the weave and the night list (no heart rate series).
export function nightList(view, from, to) {
  return daysIn(view, from, to).map(day => {
    const n = view.main.get(day), d = view.days.get(day) || {};
    if (!n) return { day, none: true, sleepScore: d.sleepScore ?? null, readiness: d.readiness ?? null };
    return { day, start: n.start ? n.start.min : null, phases: n.phases, total: n.total, deep: n.deep, rem: n.rem, light: n.light, awake: n.awake, eff: n.eff, hrv: n.hrv, hrLow: n.hrLow, sleepScore: d.sleepScore ?? null, readiness: d.readiness ?? null, tempDev: METRICS.tempDev.get(day, view) };
  });
}

export function nightDetail(view, day) {
  const n = view.main.get(day); if (!n) return null;
  const d = view.days.get(day) || {};
  const tags = view.tags.filter(t => t.day === addDays(day, -1) || (t.day === day && t.min !== null && t.min < 240));
  return { ...n, sleepScore: d.sleepScore ?? null, sc: d.sc || null, readiness: d.readiness ?? null, rc: d.rc || null, tempDev: METRICS.tempDev.get(day, view), spo2: d.spo2 ?? null, bdi: d.bdi ?? null, optBed: d.optBed || null, tags, naps: view.naps.filter(x => x.day === day).map(x => ({ type: x.type, total: x.total, start: x.start })) };
}

export function dayDetail(view, day) {
  const d = view.days.get(day) || { day };
  const hr = view.hr.get(day), st = view.stress.get(day);
  const hourly = (a, s, c) => (a ? Array.from({ length: 24 }, (_, h) => (a[c][h] ? a[s][h] / a[c][h] : null)) : null);
  return { ...d, workouts: view.workouts.filter(w => w.day === day), sessions: view.sessions.filter(s => s.day === day), tags: view.tags.filter(t => t.day === day),
    hrHourly: hourly(hr, 'hs', 'hn'), hrMin: hr && hr.n ? hr.min : null, hrMax: hr && hr.n ? hr.max : null, hrAvg: hr && hr.n ? hr.sum / hr.n : null,
    stressHourly: hourly(st, 'hs', 'hn'), recoveryHourly: hourly(st, 'hr', 'hrn') };
}

/* ---------- Pro: comparison, tags, CSV ---------- */
export const COMPARE_KEYS = ['sleepScore', 'readiness', 'activityScore', 'total', 'deep', 'rem', 'eff', 'lat', 'hrv', 'hrLow', 'breath', 'tempDev', 'spo2', 'steps', 'activeCal', 'stressHigh', 'recoveryHigh', 'bedtime', 'wake'];
export function compare(view, a, b) {
  const A = averages(view, a.from, a.to, COMPARE_KEYS), B = averages(view, b.from, b.to, COMPARE_KEYS);
  return COMPARE_KEYS.map(k => ({ key: k, unit: METRICS[k].unit, a: A[k].avg, b: B[k].avg, na: A[k].n, nb: B[k].n, diff: A[k].avg !== null && B[k].avg !== null ? B[k].avg - A[k].avg : null }));
}

// Nights after a tagged day against the other nights of the same stretch. The night that follows a tag on day D is the
// sleep Oura files under D + 1 (Oura gives a sleep the day you wake up); a tag set after midnight and before 04:00 belongs
// to that same morning's night. Only correlation: the numbers say how the nights looked, not why.
export const TAG_KEYS = ['hrv', 'hrLow', 'sleepScore', 'readiness', 'total', 'deep', 'rem', 'eff', 'lat', 'tempDev'];
export function tagStats(view, from, to, minNights = 3) {
  const nightsOf = new Map();
  for (const t of view.tags) {
    const night = t.min !== null && t.min < 240 ? t.day : addDays(t.day, 1);
    if (night < from || night > to) continue;
    let s = nightsOf.get(t.key); if (!s) { s = { key: t.key, code: t.code, name: t.name, days: new Set() }; nightsOf.set(t.key, s); }
    s.days.add(night);
  }
  const all = daysIn(view, from, to).filter(d => view.main.has(d) || view.days.has(d));
  const out = [];
  for (const s of nightsOf.values()) {
    if (s.days.size < minNights) continue;
    const row = { key: s.key, code: s.code, name: s.name, nights: s.days.size, metrics: {} };
    for (const k of TAG_KEYS) {
      const w = [], o = [];
      for (const day of all) { const v = METRICS[k].get(day, view); if (v === null || v === undefined || !Number.isFinite(v)) continue; (s.days.has(day) ? w : o).push(v); }
      row.metrics[k] = { with: mean(w), without: mean(o), nWith: w.length, nWithout: o.length, sdWith: sd(w), sdWithout: sd(o), diff: w.length && o.length ? mean(w) - mean(o) : null };
    }
    out.push(row);
  }
  return out.sort((a, b) => b.nights - a.nights);
}

const CSV_COLS = [
  ['date', (d) => d],
  ['sleep_score', (d, v) => v.days.get(d)?.sleepScore], ['readiness_score', (d, v) => v.days.get(d)?.readiness], ['activity_score', (d, v) => v.days.get(d)?.activityScore],
  ['bedtime', (d, v) => clock(v.main.get(d)?.start)], ['wake_time', (d, v) => clock(v.main.get(d)?.end)],
  ['total_sleep_h', (d, v) => h(v.main.get(d)?.total)], ['time_in_bed_h', (d, v) => h(v.main.get(d)?.inBed)], ['deep_min', (d, v) => mins(v.main.get(d)?.deep)], ['rem_min', (d, v) => mins(v.main.get(d)?.rem)],
  ['light_min', (d, v) => mins(v.main.get(d)?.light)], ['awake_min', (d, v) => mins(v.main.get(d)?.awake)], ['efficiency_pct', (d, v) => v.main.get(d)?.eff], ['latency_min', (d, v) => mins(v.main.get(d)?.lat)],
  ['hrv_ms', (d, v) => v.main.get(d)?.hrv], ['lowest_hr_bpm', (d, v) => v.main.get(d)?.hrLow], ['average_sleep_hr_bpm', (d, v) => r1(v.main.get(d)?.hrAvg)], ['breath_rate_per_min', (d, v) => r1(v.main.get(d)?.breath)],
  ['temperature_deviation_c', (d, v) => r2(METRICS.tempDev.get(d, v))], ['temperature_trend_deviation_c', (d, v) => r2(v.days.get(d)?.tempTrend)],
  ['spo2_pct', (d, v) => r1(v.days.get(d)?.spo2)], ['breathing_disturbance_index', (d, v) => v.days.get(d)?.bdi],
  ['steps', (d, v) => v.days.get(d)?.steps], ['active_kcal', (d, v) => v.days.get(d)?.activeCal], ['total_kcal', (d, v) => v.days.get(d)?.totalCal], ['walking_equivalent_km', (d, v) => km(v.days.get(d)?.walkM)],
  ['high_activity_min', (d, v) => mins(v.days.get(d)?.highT)], ['medium_activity_min', (d, v) => mins(v.days.get(d)?.medT)], ['low_activity_min', (d, v) => mins(v.days.get(d)?.lowT)], ['sedentary_h', (d, v) => h(v.days.get(d)?.sedT)],
  ['stress_high_min', (d, v) => mins(v.days.get(d)?.stressHigh)], ['recovery_high_min', (d, v) => mins(v.days.get(d)?.recoveryHigh)], ['day_summary', (d, v) => v.days.get(d)?.daySummary],
  ['resilience', (d, v) => v.days.get(d)?.resilience], ['cardiovascular_age', (d, v) => v.days.get(d)?.vascularAge], ['vo2_max', (d, v) => r1(v.days.get(d)?.vo2max)],
  ['daytime_hr_avg_bpm', (d, v) => r1(METRICS.dayHr.get(d, v))], ['skin_temp_avg_c', (d, v) => r2(METRICS.skinTemp.get(d, v))], ['daytime_stress_avg', (d, v) => r1(METRICS.dayStress.get(d, v))],
  ['workouts', (d, v) => v.workouts.filter(w => w.day === d).map(w => w.activity).join(' + ')],
  ['tags', (d, v) => [...new Set(v.tags.filter(t => t.day === d).map(t => t.name || t.code))].join(' + ')],
];
function clock(c) { if (!c) return ''; const m = Math.round(c.min) % 1440; return `${String(Math.floor(m / 60)).padStart(2, '0')}:${String(m % 60).padStart(2, '0')}`; }
const h = s => (s === null || s === undefined ? '' : (s / 3600).toFixed(2));
const mins = s => (s === null || s === undefined ? '' : Math.round(s / 60));
const km = m => (m === null || m === undefined ? '' : (m / 1000).toFixed(2));
const r1 = x => (x === null || x === undefined || !Number.isFinite(x) ? '' : Math.round(x * 10) / 10);
const r2 = x => (x === null || x === undefined || !Number.isFinite(x) ? '' : Math.round(x * 100) / 100);
const cell = v => { if (v === null || v === undefined) return ''; const s = String(v); return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s; };
export function dailyCsv(view, from, to) {
  const lines = [CSV_COLS.map(c => c[0]).join(',')];
  for (const day of daysIn(view, from, to)) lines.push(CSV_COLS.map(c => cell(c[1](day, view))).join(','));
  return lines.join('\r\n') + '\r\n';
}
export const CSV_HEADER = CSV_COLS.map(c => c[0]);
