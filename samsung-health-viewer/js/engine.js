/* Wristory's engine: turns the rows of a Samsung Health export into days, nights, workouts and readings, then answers
 * the page's questions (a period's summary, the day-by-day sheet, year against year, the tables and the files). It
 * runs in the worker and in Node (the tests); it reads nothing and sends nothing by itself.
 *
 * What the export holds (no official schema exists; this follows the open-source readers v-2841/samsung-health-export
 * and davidmosiah/samsung-health-mcp, both MIT, and Samsung's Health SDK reference):
 *  - one CSV per data type, named "<data type>.<export time>.csv", e.g. com.samsung.health.weight.20260722105897.csv;
 *  - times in the CSVs are wall-clock strings stored in UTC ("2025-01-08 21:00:00.000") with the offset of the
 *    place in a separate time_offset column ("UTC+0400"); local time = the string + the offset;
 *  - daily tables carry day_time instead: a date string, or (older exports) epoch milliseconds at 00:00 UTC of that day;
 *  - some files spell times as ISO with their own offset ("2026-05-01T18:10:00-03:00"); then the string's own wall
 *    clock is the local time;
 *  - sleep stages are codes 40001 awake, 40002 light, 40003 deep, 40004 REM, joined to the night by sleep_id;
 *  - workout types are Samsung's codes (1001 walking, 1002 running, 11007 cycling and so on). */

export const KINDS = {
  'com.samsung.shealth.tracker.pedometer_day_summary': 'stepDay',
  'com.samsung.shealth.step_daily_trend': 'stepTrend',
  'com.samsung.health.step_daily_trend': 'stepTrend',
  'com.samsung.shealth.tracker.pedometer_step_count': 'stepInt',
  'com.samsung.health.step_count': 'stepInt',
  'com.samsung.shealth.activity.day_summary': 'actDay',
  'com.samsung.shealth.tracker.floors_day_summary': 'floorsDay',
  'com.samsung.shealth.sleep': 'sleep',
  'com.samsung.health.sleep': 'sleep',
  'com.samsung.health.sleep_stage': 'stage',
  'com.samsung.shealth.sleep_stage': 'stage',
  'com.samsung.shealth.tracker.heart_rate': 'hr',
  'com.samsung.health.heart_rate': 'hr',
  'com.samsung.health.resting_heart_rate': 'rhr',
  'com.samsung.shealth.vitality_score': 'vitality',
  'com.samsung.shealth.tracker.oxygen_saturation': 'spo2',
  'com.samsung.health.oxygen_saturation': 'spo2',
  'com.samsung.shealth.stress': 'stress',
  'com.samsung.health.weight': 'weight',
  'com.samsung.shealth.blood_pressure': 'bp',
  'com.samsung.health.blood_pressure': 'bp',
  'com.samsung.shealth.exercise': 'exercise',
  'com.samsung.health.exercise': 'exercise',
};
export const KIND_LIST = [...new Set(Object.values(KINDS))];

// "com.samsung.health.weight.20260722105897.csv" -> "com.samsung.health.weight"
export function dataTypeOf(fileName) {
  const base = String(fileName || '').split(/[\\/]/).pop().toLowerCase();
  const m = base.match(/^(com\.samsung\.[a-z0-9_.]+?)(?:\.\d{6,})?(?:\s*\(\d+\))?\.csv$/);
  return m ? m[1] : null;
}
export function kindOf(fileName) {
  const t = dataTypeOf(fileName);
  return t ? KINDS[t] || null : null;
}

// Samsung's predefined workout types (Health SDK, EXERCISE_TYPE). The page shows a shorter name per language.
export const EXERCISE = {
  0: 'Other workout', 1001: 'Walking', 1002: 'Running', 2001: 'Baseball', 2002: 'Softball', 2003: 'Cricket', 3001: 'Golf',
  3002: 'Billiards', 3003: 'Bowling', 4001: 'Hockey', 4002: 'Rugby', 4003: 'Basketball', 4004: 'Football (soccer)',
  4005: 'Handball', 4006: 'American football', 5001: 'Volleyball', 5002: 'Beach volleyball', 6001: 'Squash',
  6002: 'Tennis', 6003: 'Badminton', 6004: 'Table tennis', 6005: 'Racquetball', 7001: "T'ai chi", 7002: 'Boxing',
  7003: 'Martial arts', 8001: 'Ballet', 8002: 'Dancing', 8003: 'Ballroom dancing', 9001: 'Pilates', 9002: 'Yoga',
  10001: 'Stretching', 10002: 'Jump rope', 10003: 'Hula hoop', 10004: 'Push-ups', 10005: 'Pull-ups', 10006: 'Sit-ups',
  10007: 'Circuit training', 10008: 'Mountain climbers', 10009: 'Jumping jacks', 10010: 'Burpees', 10011: 'Bench press',
  10012: 'Squats', 10013: 'Lunges', 10014: 'Leg press', 10015: 'Leg extensions', 10016: 'Leg curls',
  10017: 'Back extensions', 10018: 'Lat pull-downs', 10019: 'Deadlifts', 10020: 'Shoulder press', 10021: 'Front raises',
  10022: 'Lateral raises', 10023: 'Crunches', 10024: 'Leg raises', 10025: 'Plank', 10026: 'Arm curls',
  10027: 'Arm extensions', 11001: 'Inline skating', 11002: 'Hang gliding', 11003: 'Pistol shooting', 11004: 'Archery',
  11005: 'Horse riding', 11007: 'Cycling', 11008: 'Flying disc', 11009: 'Roller skating', 12001: 'Aerobics',
  13001: 'Hiking', 13002: 'Rock climbing', 13003: 'Backpacking', 13004: 'Mountain biking', 13005: 'Orienteering',
  14001: 'Swimming', 14002: 'Aqua aerobics', 14003: 'Canoeing', 14004: 'Sailing', 14005: 'Scuba diving',
  14006: 'Snorkelling', 14007: 'Kayaking', 14008: 'Kitesurfing', 14009: 'Rafting', 14010: 'Rowing',
  14011: 'Windsurfing', 14012: 'Yachting', 14013: 'Water skiing', 15001: 'Step machine', 15002: 'Weight machine',
  15003: 'Exercise bike', 15004: 'Rowing machine', 15005: 'Treadmill', 15006: 'Elliptical trainer',
  16001: 'Cross-country skiing', 16002: 'Skiing', 16003: 'Ice dancing', 16004: 'Ice skating', 16006: 'Ice hockey',
  16007: 'Snowboarding', 16008: 'Alpine skiing', 16009: 'Snowshoeing',
};
// a workout written as a word in some files ("running"): back to the code
const EX_WORDS = Object.fromEntries(Object.entries(EXERCISE).map(([k, v]) => [v.toLowerCase().replace(/[^a-z]/g, ''), +k]));
EX_WORDS.walk = 1001; EX_WORDS.run = 1002; EX_WORDS.bike = 11007; EX_WORDS.biking = 11007; EX_WORDS.swim = 14001;
EX_WORDS.custom = 0; EX_WORDS.other = 0; EX_WORDS.weighttraining = 15002;
export function exerciseCode(v) {
  const s = String(v == null ? '' : v).trim();
  if (/^-?\d+(\.0+)?$/.test(s)) return Math.round(+s);
  const w = s.toLowerCase().replace(/[^a-z]/g, '');
  return w in EX_WORDS ? EX_WORDS[w] : (s ? s : 0);
}

const STAGES = { 40001: 'awake', 40002: 'light', 40003: 'deep', 40004: 'rem' };
function stageName(v) {
  const s = String(v == null ? '' : v).trim().toLowerCase();
  if (STAGES[Math.round(+s)]) return STAGES[Math.round(+s)];
  if (/awake|wake/.test(s)) return 'awake';
  if (/deep/.test(s)) return 'deep';
  if (/rem/.test(s)) return 'rem';
  if (/light|core/.test(s)) return 'light';
  return null;
}

/* ---------------- numbers and times ---------------- */
export function num(v) {
  if (v === undefined || v === null) return null;
  let s = String(v).trim();
  if (!s || /^(null|none|nan|undefined)$/i.test(s)) return null;
  if (/^-?\d+,\d+$/.test(s)) s = s.replace(',', '.');
  const n = Number(s);
  return Number.isFinite(n) ? n : null;
}
const pos = v => { const n = num(v); return n !== null && n > 0 ? n : null; };

// "UTC+0900", "UTC+09:00", "GMT-3", "+0530", "UTC" -> minutes east of UTC, or null
export function offsetMin(v) {
  let s = String(v == null ? '' : v).trim().toUpperCase();
  if (!s) return null;
  s = s.replace(/^(UTC|GMT)/, '');
  if (!s) return 0;
  const m = s.match(/^([+-])(\d{1,2})(?::?(\d{2}))?$/);
  if (!m) return null;
  const h = +m[2], mi = m[3] ? +m[3] : 0;
  if (h > 14 || mi >= 60) return null;
  return (m[1] === '-' ? -1 : 1) * (h * 60 + mi);
}

const TS_RE = /^(\d{4})-(\d{1,2})-(\d{1,2})(?:[ T](\d{1,2}):(\d{2})(?::(\d{2})(?:[.,](\d+))?)?)?\s*(Z|[+-]\d{2}:?\d{2})?$/i;
// A moment: { ms (UTC), off (minutes) }. Samsung's plain strings are UTC wall clock + time_offset; an ISO string with
// its own zone keeps that zone as the local one; epoch numbers are UTC.
export function moment(v, offStr, fallbackOff) {
  const s = String(v == null ? '' : v).trim().replace(/^"|"$/g, '');
  if (!s) return null;
  const own = offsetMin(offStr);
  if (/^\d{10,13}(\.\d+)?$/.test(s)) {
    const n = Number(s);
    const ms = n > 1e11 ? n : n * 1000;
    return ms > 946684800000 ? { ms, off: own !== null ? own : fallbackOff || 0 } : null;
  }
  const m = s.match(TS_RE);
  if (!m) return null;
  const wall = Date.UTC(+m[1], +m[2] - 1, +m[3], +(m[4] || 0), +(m[5] || 0), +(m[6] || 0), m[7] ? Math.round(+('0.' + m[7]) * 1000) : 0);
  if (!Number.isFinite(wall)) return null;
  if (m[8]) {
    const z = m[8].toUpperCase() === 'Z' ? 0 : offsetMin(m[8]);
    const ms = wall - (z || 0) * 60000;
    return { ms, off: m[8].toUpperCase() === 'Z' && own !== null ? own : z || 0 };
  }
  return { ms: wall, off: own !== null ? own : fallbackOff || 0 };
}
export const localDay = t => new Date(t.ms + t.off * 60000).toISOString().slice(0, 10);
export const localMin = t => { const d = new Date(t.ms + t.off * 60000); return d.getUTCHours() * 60 + d.getUTCMinutes(); };
export const localIso = t => new Date(t.ms + t.off * 60000).toISOString().slice(0, 16).replace('T', ' ');

// day_time of a daily table: "2025-01-10 00:00:00.000", "2026-05-04T00:00:00-03:00" or epoch ms at 00:00 UTC
export function dayOf(v) {
  const s = String(v == null ? '' : v).trim().replace(/^"|"$/g, '');
  if (!s) return null;
  if (/^\d{10,13}(\.\d+)?$/.test(s)) {
    const n = Number(s), ms = n > 1e11 ? n : n * 1000;
    if (ms < 946684800000) return null;
    // a local midnight stored as UTC lands a few hours either side of 00:00 UTC; half a day each way keeps the date
    return new Date(ms + 12 * 3600e3).toISOString().slice(0, 10);
  }
  const m = s.match(/^(\d{4})-(\d{1,2})-(\d{1,2})/);
  if (!m) return null;
  const d = `${m[1]}-${m[2].padStart(2, '0')}-${m[3].padStart(2, '0')}`;
  return Number.isFinite(Date.parse(d + 'T00:00:00Z')) ? d : null;
}
export const addDays = (day, n) => new Date(Date.parse(day + 'T00:00:00Z') + n * 864e5).toISOString().slice(0, 10);
export const daysBetween = (a, b) => Math.round((Date.parse(b + 'T00:00:00Z') - Date.parse(a + 'T00:00:00Z')) / 864e5);
const okDay = d => d && d >= '2008-01-01' && d <= '2099-12-31';

/* ---------------- one export ---------------- */
export function newExport(label) {
  return {
    label, files: [],
    days: new Map(), // day -> D
    stepInt: new Map(), // day -> Map(device -> steps)
    sessions: [], stages: [], workouts: [], weights: [], bps: [],
    seen: { sleep: new Set(), stage: new Set(), exercise: new Set(), weight: new Set(), bp: new Set() },
    offCount: new Map(),
  };
}
function D(ex, day) {
  let d = ex.days.get(day);
  if (!d) { d = { day }; ex.days.set(day, d); }
  return d;
}
function primaryOff(ex) {
  let best = 0, n = -1;
  for (const [o, c] of ex.offCount) if (c > n) { n = c; best = o; }
  return best;
}
function rowMoment(ex, r, col) {
  const t = moment(r[col] || (col === 'start_time' ? r.create_time || r.day_time || r.time : ''), r.time_offset, primaryOff(ex));
  if (t && offsetMin(r.time_offset) !== null) ex.offCount.set(t.off, (ex.offCount.get(t.off) || 0) + 1);
  return t;
}
const idOf = (r, ...vals) => r.datauuid || vals.join('|');
const maxSet = (o, k, v) => { if (v !== null && v !== undefined && (o[k] === undefined || v > o[k])) o[k] = v; };
const minSet = (o, k, v) => { if (v !== null && v !== undefined && (o[k] === undefined || v < o[k])) o[k] = v; };

// One CSV row into the export. Returns true when the row held something Wristory uses.
export function ingest(ex, kind, r) {
  switch (kind) {
    case 'stepDay': case 'stepTrend': case 'actDay': case 'floorsDay': {
      const day = dayOf(r.day_time || r.start_time || r.date);
      if (!okDay(day)) return false;
      const d = D(ex, day);
      if (kind === 'floorsDay') { const f = num(r.floor_count || r.floor); if (f === null) return false; maxSet(d, 'floors', f); return true; }
      const steps = num(r.step_count !== undefined && r.step_count !== '' ? r.step_count : r.count);
      if (steps === null || steps < 0) return false;
      const key = kind === 'stepDay' ? 'sDay' : kind === 'actDay' ? 'sAct' : String(r.source_type).trim() === '-2' ? 'sAll' : 'sTrend';
      if (d[key] === undefined || steps > d[key]) {
        d[key] = steps;
        d[key + 'Dist'] = num(r.distance);
        d[key + 'Cal'] = num(r.calorie);
        const act = num(r.active_time);
        if (act !== null) d[key + 'Act'] = act > 2000 ? act / 60000 : act; // ms (minutes in a few old files)
      }
      return true;
    }
    case 'stepInt': {
      const t = rowMoment(ex, r, 'start_time');
      const steps = num(r.count !== undefined ? r.count : r.step_count);
      if (!t || steps === null || steps < 0) return false;
      const day = localDay(t);
      if (!okDay(day)) return false;
      const dev = r.deviceuuid || r.source_name || r.pkg_name || 'device';
      let m = ex.stepInt.get(day);
      if (!m) { m = new Map(); ex.stepInt.set(day, m); }
      const key = `${t.ms}|${dev}`;
      if (!m.has('#' + key)) { m.set('#' + key, 1); m.set(dev, (m.get(dev) || 0) + steps); }
      return true;
    }
    case 'sleep': {
      const a = rowMoment(ex, r, 'start_time'), b = rowMoment(ex, r, 'end_time');
      if (!a || !b || b.ms <= a.ms || b.ms - a.ms > 20 * 3600e3) return false;
      const id = idOf(r, a.ms, b.ms);
      if (ex.seen.sleep.has(id)) return true;
      ex.seen.sleep.add(id);
      ex.sessions.push({
        id: r.datauuid || null, a: a.ms, b: b.ms, off: b.off,
        score: pos(r.sleep_score), eff: pos(r.efficiency), dur: pos(r.sleep_duration),
        deep: num(r.factor_02), light: num(r.total_light_duration), rem: num(r.total_rem_duration), awake: num(r.factor_05),
        nap: !!pos(r.nap_score),
      });
      return true;
    }
    case 'stage': {
      const a = rowMoment(ex, r, 'start_time'), b = rowMoment(ex, r, 'end_time');
      const st = stageName(r.stage !== undefined ? r.stage : r.sleep_stage);
      if (!a || !b || b.ms <= a.ms || !st || b.ms - a.ms > 12 * 3600e3) return false;
      const key = (r.sleep_id || '') + '|' + a.ms + '|' + st;
      if (ex.seen.stage.has(key)) return true;
      ex.seen.stage.add(key);
      ex.stages.push({ sid: r.sleep_id || null, a: a.ms, b: b.ms, off: a.off, st });
      return true;
    }
    case 'hr': case 'rhr': {
      const t = rowMoment(ex, r, 'start_time');
      const v = pos(kind === 'rhr' ? r.resting_heart_rate || r.heart_rate || r.value : r.heart_rate || r.value);
      if (!t || v === null || v < 25 || v > 250) return false;
      const d = D(ex, localDay(t));
      if (!okDay(d.day)) return false;
      if (kind === 'rhr') { d.rhr = v; return true; }
      d.hrSum = (d.hrSum || 0) + v; d.hrN = (d.hrN || 0) + 1;
      const lo = pos(r.min), hi = pos(r.max);
      minSet(d, 'hrLow', lo !== null && lo >= 25 ? lo : v);
      maxSet(d, 'hrHigh', hi !== null && hi <= 250 ? hi : v);
      return true;
    }
    case 'vitality': {
      const day = dayOf(r.day_time);
      const v = pos(r.shr_value);
      if (!okDay(day) || v === null || v < 25 || v > 200) return false;
      D(ex, day).shr = v;
      return true;
    }
    case 'spo2': {
      const t = rowMoment(ex, r, 'start_time');
      const v = pos(r.spo2 || r.oxygen_saturation || r.value);
      if (!t || v === null || v < 50 || v > 100) return false;
      const d = D(ex, localDay(t));
      if (!okDay(d.day)) return false;
      d.spo2Sum = (d.spo2Sum || 0) + v; d.spo2N = (d.spo2N || 0) + 1;
      const lo = pos(r.min);
      minSet(d, 'spo2Low', lo !== null && lo >= 50 ? lo : v);
      return true;
    }
    case 'stress': {
      const t = rowMoment(ex, r, 'start_time');
      const v = num(r.score !== undefined ? r.score : r.stress_score);
      if (!t || v === null || v < 0 || v > 100) return false;
      const d = D(ex, localDay(t));
      if (!okDay(d.day)) return false;
      d.stressSum = (d.stressSum || 0) + v; d.stressN = (d.stressN || 0) + 1;
      maxSet(d, 'stressHigh', num(r.max) !== null ? num(r.max) : v);
      return true;
    }
    case 'weight': {
      const t = rowMoment(ex, r, 'start_time');
      let kg = pos(r.weight);
      if (!t || kg === null) return false;
      if (/lb/i.test(r.unit || '')) kg = kg * 0.45359237;
      if (kg < 2 || kg > 500) return false;
      const id = idOf(r, t.ms, kg);
      if (ex.seen.weight.has(id)) return true;
      ex.seen.weight.add(id);
      ex.weights.push({ ms: t.ms, off: t.off, day: localDay(t), kg, fat: pos(r.body_fat), muscle: pos(r.skeletal_muscle_mass) || pos(r.muscle_mass), bmi: null });
      return true;
    }
    case 'bp': {
      const t = rowMoment(ex, r, 'start_time');
      const sys = pos(r.systolic), dia = pos(r.diastolic);
      if (!t || sys === null || dia === null || sys > 300 || dia > 250) return false;
      const id = idOf(r, t.ms, sys, dia);
      if (ex.seen.bp.has(id)) return true;
      ex.seen.bp.add(id);
      ex.bps.push({ ms: t.ms, off: t.off, day: localDay(t), sys, dia, pulse: pos(r.pulse), mean: pos(r.mean) });
      return true;
    }
    case 'exercise': {
      const a = rowMoment(ex, r, 'start_time'), b = rowMoment(ex, r, 'end_time');
      if (!a) return false;
      let mins = pos(r.duration);
      mins = mins !== null ? (mins > 1000 ? mins / 60000 : mins) : b && b.ms > a.ms ? (b.ms - a.ms) / 60000 : null;
      if (mins !== null && mins > 48 * 60) mins = null;
      const id = idOf(r, a.ms, r.exercise_type);
      if (ex.seen.exercise.has(id)) return true;
      ex.seen.exercise.add(id);
      const src = String(r.source_type || '').trim();
      ex.workouts.push({
        ms: a.ms, off: a.off, day: localDay(a), time: localIso(a), type: exerciseCode(r.exercise_type), mins,
        km: pos(r.distance) !== null ? pos(r.distance) / 1000 : null, kcal: pos(r.calorie), hr: pos(r.mean_heart_rate), hrMax: pos(r.max_heart_rate),
        auto: src === '4' || src === '8',
      });
      return true;
    }
  }
  return false;
}

/* ---------------- the view (one or more exports merged) ---------------- */
function nightsOf(ex) {
  const bySid = new Map();
  for (const s of ex.stages) if (s.sid) (bySid.get(s.sid) || bySid.set(s.sid, []).get(s.sid)).push(s);
  const ids = new Set(ex.sessions.map(x => x.id).filter(Boolean));
  const unlinked = ex.stages.filter(s => !s.sid || !ids.has(s.sid));
  const sessions = ex.sessions.slice().sort((x, y) => x.a - y.a);
  // stage rows with no night: nights are built from them (a gap of more than an hour starts a new one)
  if (!sessions.length && unlinked.length) {
    const st = unlinked.slice().sort((x, y) => x.a - y.a);
    let cur = null;
    for (const s of st) {
      if (!cur || s.a - cur.b > 3600e3) { cur = { id: null, a: s.a, b: s.b, off: s.off, built: true }; sessions.push(cur); }
      else cur.b = Math.max(cur.b, s.b);
    }
  }
  const out = [];
  for (const s of sessions) {
    let st = s.id ? bySid.get(s.id) : null;
    if (!st || !st.length) st = unlinked.filter(x => x.a >= s.a - 60e3 && x.b <= s.b + 60e3);
    const n = { a: s.a, b: s.b, off: s.off, score: s.score || null, inBed: (s.b - s.a) / 60000, nap: !!s.nap };
    const wake = { ms: s.b, off: s.off }, bed = { ms: s.a, off: s.off };
    n.day = localDay(wake); n.bed = localMin(bed); n.wake = localMin(wake);
    if (st && st.length) {
      const m = { awake: 0, light: 0, deep: 0, rem: 0 };
      for (const x of st) m[x.st] += (Math.min(x.b, s.b + 60e3) - Math.max(x.a, s.a - 60e3)) / 60000;
      Object.assign(n, m, { staged: true, asleep: m.light + m.deep + m.rem });
      n.stages = st.slice().sort((x, y) => x.a - y.a).map(x => [Math.round((x.a - s.a) / 60000), Math.round((x.b - x.a) / 60000), x.st]);
    } else if (s.deep !== null && s.light !== null && s.rem !== null && s.deep + s.light + s.rem > 0) {
      Object.assign(n, { deep: s.deep, light: s.light, rem: s.rem, awake: s.awake || 0, staged: true, asleep: s.deep + s.light + s.rem });
    } else {
      n.staged = false;
      n.asleep = s.dur && s.dur <= n.inBed + 1 ? s.dur : n.inBed;
    }
    // a short sleep in the middle of the day counts as a nap, not as the night
    if (!n.nap) { const h = n.bed / 60; n.nap = h >= 9 && h < 19 && n.inBed < 180; }
    out.push(n);
  }
  return out;
}

export function buildView(exports) {
  const days = new Map(), nights = [], workouts = [], weights = [], bps = [];
  const seenW = new Set(), seenB = new Set(), seenX = new Set(), seenN = new Set();
  for (const ex of exports) {
    for (const [day, d] of ex.days) {
      const t = days.get(day) || {};
      // the merged row ("all devices") first, then the day summary, then the trend, then the activity summary
      const pick = ['sAll', 'sDay', 'sTrend', 'sAct'].find(k => d[k] !== undefined && d[k] > 0) || ['sAll', 'sDay', 'sTrend', 'sAct'].find(k => d[k] !== undefined);
      if (pick && (t.steps === undefined || d[pick] > t.steps)) {
        t.steps = d[pick]; t.km = d[pick + 'Dist'] ? d[pick + 'Dist'] / 1000 : t.km; t.kcal = d[pick + 'Cal'] || t.kcal;
        const act = [pick, 'sDay', 'sAct'].map(k => d[k + 'Act']).find(v => v !== undefined);
        if (act !== undefined) t.active = act;
      }
      if (d.floors !== undefined) t.floors = d.floors;
      for (const k of ['hrSum', 'hrN', 'spo2Sum', 'spo2N', 'stressSum', 'stressN']) if (d[k] !== undefined) t[k] = (t[k] || 0) + d[k];
      for (const k of ['hrLow', 'spo2Low']) if (d[k] !== undefined) minSet(t, k, d[k]);
      for (const k of ['hrHigh', 'stressHigh']) if (d[k] !== undefined) maxSet(t, k, d[k]);
      if (d.rhr !== undefined) t.rhr = d.rhr;
      if (d.shr !== undefined) t.shr = d.shr;
      days.set(day, t);
    }
    // steps from the minute log only where no daily total exists: the busiest device of the day (never summed across)
    for (const [day, m] of ex.stepInt) {
      const t = days.get(day) || {};
      if (t.steps === undefined) {
        let best = 0;
        for (const [k, v] of m) if (k[0] !== '#' && v > best) best = v;
        t.steps = best;
        days.set(day, t);
      }
    }
    for (const n of nightsOf(ex)) { const k = Math.round(n.a / 60000) + '|' + Math.round(n.b / 60000); if (!seenN.has(k)) { seenN.add(k); nights.push(n); } }
    for (const w of ex.workouts) { const k = Math.round(w.ms / 60000) + '|' + w.type; if (!seenX.has(k)) { seenX.add(k); workouts.push(w); } }
    for (const w of ex.weights) { const k = Math.round(w.ms / 60000) + '|' + w.kg.toFixed(2); if (!seenW.has(k)) { seenW.add(k); weights.push(w); } }
    for (const b of ex.bps) { const k = Math.round(b.ms / 60000) + '|' + b.sys + '|' + b.dia; if (!seenB.has(k)) { seenB.add(k); bps.push(b); } }
  }
  nights.sort((x, y) => x.a - y.a); workouts.sort((x, y) => x.ms - y.ms); weights.sort((x, y) => x.ms - y.ms); bps.sort((x, y) => x.ms - y.ms);
  // per day: the night that ended that morning (all its parts), the last weight, the workouts
  const night = new Map();
  for (const n of nights) {
    if (n.nap) { const t = days.get(n.day) || {}; t.napMin = (t.napMin || 0) + n.asleep; days.set(n.day, t); continue; }
    const cur = night.get(n.day);
    if (!cur) night.set(n.day, Object.assign({}, n, { parts: 1 }));
    else {
      cur.parts++;
      cur.inBed += n.inBed; cur.asleep += n.asleep;
      if (n.staged && cur.staged) for (const k of ['awake', 'light', 'deep', 'rem']) cur[k] += n[k];
      else cur.staged = false;
      cur.bed = n.a < cur.a ? n.bed : cur.bed; cur.wake = n.b > cur.b ? n.wake : cur.wake;
      cur.a = Math.min(cur.a, n.a); cur.b = Math.max(cur.b, n.b);
      cur.score = cur.score || n.score;
      cur.stages = null;
    }
  }
  for (const [day, n] of night) { const t = days.get(day) || {}; t.sleep = n; days.set(day, t); }
  for (const w of weights) { const t = days.get(w.day) || {}; t.kg = w.kg; if (w.fat) t.fat = w.fat; days.set(w.day, t); }
  for (const w of workouts) { const t = days.get(w.day) || {}; t.wo = (t.wo || 0) + 1; t.woMin = (t.woMin || 0) + (w.mins || 0); days.set(w.day, t); }
  for (const b of bps) { const t = days.get(b.day) || {}; t.bp = (t.bp || 0) + 1; days.set(b.day, t); }
  let first = '', last = '';
  for (const [day, t] of days) {
    t.day = day;
    if (t.hrN) t.hrAvg = t.hrSum / t.hrN;
    if (t.spo2N) t.spo2 = t.spo2Sum / t.spo2N;
    if (t.stressN) t.stress = t.stressSum / t.stressN;
    if (!hasData(t)) continue;
    if (!first || day < first) first = day;
    if (!last || day > last) last = day;
  }
  return { days, nights, workouts, weights, bps, first, last };
}
function hasData(t) {
  return (t.steps > 0) || t.sleep || t.hrN || t.rhr || t.shr || t.spo2N || t.stressN || t.kg || t.wo || t.bp || t.napMin;
}

// the free range: the 90 days that end on the export's last day with data
export function freeRange(view) {
  if (!view.last) return null;
  const from = addDays(view.last, -89);
  return { from: from < view.first ? view.first : from, to: view.last };
}
export function yearsIn(view) {
  if (!view.first) return [];
  const out = [];
  for (let y = +view.first.slice(0, 4); y <= +view.last.slice(0, 4); y++) {
    let any = false;
    for (const d of view.days.keys()) if (d.startsWith(String(y)) && hasData(view.days.get(d))) { any = true; break; }
    if (any) out.push(y);
  }
  return out;
}

/* ---------------- questions ---------------- */
const mean = a => (a.length ? a.reduce((s, x) => s + x, 0) / a.length : null);
const round = (v, k = 0) => (v === null || v === undefined || !Number.isFinite(v) ? null : Math.round(v * 10 ** k) / 10 ** k);
// clock minutes averaged around midnight (23:30 and 00:30 average to 00:00, not 12:00)
function clockMean(mins) {
  if (!mins.length) return null;
  let x = 0, y = 0;
  for (const m of mins) { const a = (m / 1440) * 2 * Math.PI; x += Math.cos(a); y += Math.sin(a); }
  let a = Math.atan2(y, x);
  if (a < 0) a += 2 * Math.PI;
  return Math.round((a / (2 * Math.PI)) * 1440) % 1440;
}
function inRange(view, from, to) {
  const out = [];
  for (let d = from; d <= to; d = addDays(d, 1)) { const t = view.days.get(d); if (t) out.push(t); }
  return out;
}

export function summary(view, from, to) {
  const ds = inRange(view, from, to);
  const stepDays = ds.filter(t => t.steps > 0);
  const nights = ds.map(t => t.sleep).filter(Boolean);
  const staged = nights.filter(n => n.staged);
  const hr = ds.filter(t => t.hrN);
  const best = stepDays.reduce((b, t) => (!b || t.steps > b.steps ? t : b), null);
  const w = view.weights.filter(x => x.day >= from && x.day <= to);
  const wo = view.workouts.filter(x => x.day >= from && x.day <= to);
  const bp = view.bps.filter(x => x.day >= from && x.day <= to);
  const types = new Map();
  for (const x of wo) { const k = x.type; const c = types.get(k) || { type: k, n: 0, mins: 0, km: 0 }; c.n++; c.mins += x.mins || 0; c.km += x.km || 0; types.set(k, c); }
  const rest = ds.map(t => (t.rhr !== undefined ? t.rhr : null)).filter(v => v !== null);
  const sleepHr = ds.map(t => (t.shr !== undefined ? t.shr : null)).filter(v => v !== null);
  return {
    from, to, days: ds.length, span: daysBetween(from, to) + 1,
    steps: stepDays.length ? {
      days: stepDays.length, avg: round(mean(stepDays.map(t => t.steps))), total: stepDays.reduce((s, t) => s + t.steps, 0),
      best: best ? { day: best.day, steps: best.steps } : null,
      km: round(stepDays.reduce((s, t) => s + (t.km || 0), 0), 1), active: round(mean(stepDays.filter(t => t.active !== undefined).map(t => t.active))),
      over10k: stepDays.filter(t => t.steps >= 10000).length,
    } : null,
    sleep: nights.length ? {
      nights: nights.length, staged: staged.length, asleep: round(mean(nights.map(n => n.asleep))), inBed: round(mean(nights.map(n => n.inBed))),
      deep: round(mean(staged.map(n => n.deep))), light: round(mean(staged.map(n => n.light))), rem: round(mean(staged.map(n => n.rem))), awake: round(mean(staged.map(n => n.awake))),
      bed: clockMean(nights.map(n => n.bed)), wake: clockMean(nights.map(n => n.wake)), score: round(mean(nights.filter(n => n.score).map(n => n.score))),
    } : null,
    heart: hr.length || rest.length || sleepHr.length ? {
      days: hr.length, avg: round(mean(hr.map(t => t.hrAvg))), low: round(mean(hr.map(t => t.hrLow))), high: round(mean(hr.map(t => t.hrHigh))),
      resting: round(mean(rest)), restingDays: rest.length, sleeping: round(mean(sleepHr)), sleepingDays: sleepHr.length,
    } : null,
    weight: w.length ? { n: w.length, first: w[0], last: w[w.length - 1], change: round(w[w.length - 1].kg - w[0].kg, 1), min: round(Math.min(...w.map(x => x.kg)), 1), max: round(Math.max(...w.map(x => x.kg)), 1) } : null,
    workouts: wo.length ? { n: wo.length, mins: round(wo.reduce((s, x) => s + (x.mins || 0), 0)), km: round(wo.reduce((s, x) => s + (x.km || 0), 0), 1), types: [...types.values()].sort((a, b) => b.n - a.n) } : null,
    stress: ds.some(t => t.stressN) ? { days: ds.filter(t => t.stressN).length, avg: round(mean(ds.filter(t => t.stressN).map(t => t.stress))) } : null,
    spo2: ds.some(t => t.spo2N) ? { days: ds.filter(t => t.spo2N).length, avg: round(mean(ds.filter(t => t.spo2N).map(t => t.spo2)), 1), low: round(Math.min(...ds.filter(t => t.spo2Low !== undefined).map(t => t.spo2Low))) } : null,
    bp: bp.length ? { n: bp.length, sys: round(mean(bp.map(x => x.sys))), dia: round(mean(bp.map(x => x.dia))), last: bp[bp.length - 1] } : null,
  };
}

// the sheet: one column per day of the period
export function sheet(view, from, to) {
  const out = [];
  const hk = { resting: 'rhr', sleeping: 'shr', low: 'hrLow' }[heartSource(view)];
  for (let d = from; d <= to; d = addDays(d, 1)) {
    const t = view.days.get(d) || {};
    const n = t.sleep;
    out.push({
      day: d, steps: t.steps > 0 ? t.steps : null,
      asleep: n ? round(n.asleep) : null, staged: n ? n.staged : false,
      deep: n && n.staged ? round(n.deep) : null, light: n && n.staged ? round(n.light) : null, rem: n && n.staged ? round(n.rem) : null, awake: n && n.staged ? round(n.awake) : null,
      bed: n ? n.bed : null, wake: n ? n.wake : null,
      heart: t[hk] !== undefined ? round(t[hk]) : null,
      hrAvg: t.hrAvg !== undefined ? round(t.hrAvg) : null,
      kg: t.kg !== undefined ? round(t.kg, 1) : null, stress: t.stress !== undefined ? round(t.stress) : null,
      spo2: t.spo2 !== undefined ? round(t.spo2, 1) : null, wo: t.wo || 0, woMin: t.woMin ? round(t.woMin) : 0, bp: t.bp || 0,
    });
  }
  return out;
}
// which heart figure the sheet shows: resting (when the export has it), sleeping (vitality) or the day's lowest
export function heartSource(view) {
  if (view.heartSrc) return view.heartSrc;
  let r = 0, s = 0;
  for (const t of view.days.values()) { if (t.rhr !== undefined) r++; if (t.shr !== undefined) s++; }
  return (view.heartSrc = r ? 'resting' : s ? 'sleeping' : 'low');
}

export function weekly(view, from, to, key) {
  const rows = sheet(view, from, to);
  const out = [];
  for (let i = 0; i < rows.length; i += 7) {
    const part = rows.slice(i, i + 7).map(r => r[key]).filter(v => v !== null && v !== undefined);
    out.push({ from: rows[i].day, value: part.length ? round(mean(part), key === 'kg' || key === 'spo2' ? 1 : 0) : null, n: part.length });
  }
  return out;
}

export function compareYears(view, a, b) {
  const sa = summary(view, `${a}-01-01`, `${a}-12-31`), sb = summary(view, `${b}-01-01`, `${b}-12-31`);
  const v = (s, f) => { try { const x = f(s); return x === undefined ? null : x; } catch (e) { return null; } };
  const rows = [
    ['days', s => s.days || null],
    ['stepsAvg', s => s.steps.avg], ['stepsTotal', s => s.steps.total], ['over10k', s => s.steps.over10k], ['km', s => s.steps.km],
    ['sleepAsleep', s => s.sleep.asleep], ['sleepDeep', s => s.sleep.deep], ['sleepRem', s => s.sleep.rem], ['sleepBed', s => s.sleep.bed], ['sleepWake', s => s.sleep.wake],
    ['hrResting', s => s.heart.resting], ['hrSleeping', s => s.heart.sleeping], ['hrLow', s => s.heart.low], ['hrAvg', s => s.heart.avg],
    ['weightStart', s => round(s.weight.first.kg, 1)], ['weightEnd', s => round(s.weight.last.kg, 1)], ['weightChange', s => s.weight.change],
    ['workouts', s => s.workouts.n], ['workoutHours', s => round(s.workouts.mins / 60, 1)], ['stress', s => s.stress.avg], ['spo2', s => s.spo2.avg],
    ['bpSys', s => s.bp.sys], ['bpDia', s => s.bp.dia],
  ];
  return rows.map(([key, f]) => ({ key, a: v(sa, f), b: v(sb, f) })).filter(r => r.a !== null || r.b !== null);
}

/* ---------------- tables and files ---------------- */
const hm = m => (m === null || m === undefined ? '' : `${String(Math.floor(m / 60)).padStart(2, '0')}:${String(Math.round(m % 60)).padStart(2, '0')}`);
export function tables(view, from, to, exName = c => c) {
  const inR = x => x.day >= from && x.day <= to;
  const daily = sheet(view, from, to).filter(r => { const t = view.days.get(r.day); return t && hasData(t); }).map(r => {
    const t = view.days.get(r.day);
    return {
      date: r.day, steps: r.steps, distance_km: t.km !== undefined ? round(t.km, 2) : null, active_min: t.active !== undefined ? round(t.active) : null,
      floors: t.floors !== undefined ? round(t.floors) : null, sleep_min: r.asleep, deep_min: r.deep, light_min: r.light, rem_min: r.rem, awake_min: r.awake,
      bedtime: r.bed !== null ? hm(r.bed) : null, wake_time: r.wake !== null ? hm(r.wake) : null, nap_min: t.napMin ? round(t.napMin) : null,
      hr_avg: r.hrAvg, hr_low: t.hrLow !== undefined ? round(t.hrLow) : null, hr_high: t.hrHigh !== undefined ? round(t.hrHigh) : null,
      resting_hr: t.rhr !== undefined ? round(t.rhr) : null, sleeping_hr: t.shr !== undefined ? round(t.shr) : null,
      spo2_avg: r.spo2, spo2_low: t.spo2Low !== undefined ? round(t.spo2Low) : null, stress_avg: r.stress,
      weight_kg: r.kg, body_fat_pct: t.fat !== undefined ? round(t.fat, 1) : null, workouts: r.wo || null, workout_min: r.woMin || null,
    };
  });
  const sleep = view.nights.filter(inR).map(n => ({
    wake_date: n.day, start: localIso({ ms: n.a, off: n.off }), end: localIso({ ms: n.b, off: n.off }), in_bed_min: round(n.inBed), asleep_min: round(n.asleep),
    deep_min: n.staged ? round(n.deep) : null, light_min: n.staged ? round(n.light) : null, rem_min: n.staged ? round(n.rem) : null, awake_min: n.staged ? round(n.awake) : null,
    sleep_score: n.score, nap: n.nap ? 'yes' : 'no',
  }));
  const workouts = view.workouts.filter(inR).map(w => ({
    start: w.time, type: exName(w.type), duration_min: round(w.mins), distance_km: w.km !== null ? round(w.km, 2) : null, kcal: round(w.kcal),
    avg_hr: round(w.hr), max_hr: round(w.hrMax), recorded: w.auto ? 'auto' : 'workout',
  }));
  const weight = view.weights.filter(inR).map(w => ({ time: localIso(w), weight_kg: round(w.kg, 1), body_fat_pct: round(w.fat, 1), muscle_kg: round(w.muscle, 1) }));
  const bp = view.bps.filter(inR).map(b => ({ time: localIso(b), systolic: round(b.sys), diastolic: round(b.dia), pulse: round(b.pulse) }));
  return { daily, sleep, workouts, weight, bp };
}

// rows -> CSV text. Excel-friendly: a byte order mark, CRLF, and for German or Portuguese Excel a semicolon with a
// decimal comma (opts.comma).
export function toCsv(rows, opts = {}) {
  if (!rows.length) return '';
  const d = opts.comma ? ';' : ',';
  const cols = Object.keys(rows[0]);
  const cell = v => {
    if (v === null || v === undefined) return '';
    let s = typeof v === 'number' ? (opts.comma ? String(v).replace('.', ',') : String(v)) : String(v);
    if (/^[=+\-@]/.test(s) && typeof v !== 'number') s = "'" + s; // never a formula in a spreadsheet
    return /["\r\n]/.test(s) || s.includes(d) ? `"${s.replace(/"/g, '""')}"` : s;
  };
  return '\uFEFF' + [cols.join(d)].concat(rows.map(r => cols.map(c => cell(r[c])).join(d))).join('\r\n') + '\r\n';
}
