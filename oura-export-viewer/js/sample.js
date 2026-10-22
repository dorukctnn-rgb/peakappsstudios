/* A made-up Oura export, built in the browser for "Try the sample" and by the tests for their fixture ZIPs. It follows
 * the real export's layout: semicolon-separated files with the API v2 field names as columns, JSON cells with doubled
 * quotes written the way Oura writes them ({"interval": 300.0, ...}, Python's False), bedtimes with the local offset and
 * the heart rate, skin temperature and daytime stress readings in UTC. Every number is invented; the person does not
 * exist. Tag effects are built in (lower HRV after alcohol, a later start after late caffeine) so the Pro correlations
 * have something to find. */

function rng(seed) {
  let s = seed >>> 0 || 1;
  return () => { s ^= s << 13; s >>>= 0; s ^= s >>> 17; s ^= s << 5; s >>>= 0; return s / 4294967296; };
}
const p2 = n => String(n).padStart(2, '0');
const isoDay = ms => new Date(ms).toISOString().slice(0, 10);
const clamp = (x, a, b) => Math.max(a, Math.min(b, x));
const DAY = 864e5;
// a European offset: +02:00 from the last Sunday of March to the last Sunday of October, +01:00 otherwise
function offsetMin(ms) {
  const d = new Date(ms), y = d.getUTCFullYear();
  const lastSun = m => { const t = new Date(Date.UTC(y, m + 1, 0)); return Date.UTC(y, m, t.getUTCDate() - t.getUTCDay(), 1); };
  return ms >= lastSun(2) && ms < lastSun(9) ? 120 : 60;
}
// local wall-clock ms -> "2026-03-04T23:12:09.000+01:00"
function localIso(wallMs) {
  const off = offsetMin(wallMs);
  const d = new Date(wallMs);
  const sign = off >= 0 ? '+' : '-', a = Math.abs(off);
  return `${d.getUTCFullYear()}-${p2(d.getUTCMonth() + 1)}-${p2(d.getUTCDate())}T${p2(d.getUTCHours())}:${p2(d.getUTCMinutes())}:${p2(d.getUTCSeconds())}.000${sign}${p2(Math.floor(a / 60))}:${p2(a % 60)}`;
}
const utcIso = wallMs => new Date(wallMs - offsetMin(wallMs) * 6e4).toISOString();
const uuid = r => 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, c => { const v = Math.floor(r() * 16); return (c === 'x' ? v : (v & 3) | 8).toString(16); });
const q = obj => '"' + pyJson(obj).replace(/"/g, '""') + '"';
// JSON the way the export writes it, with ", " and ": " separators
function pyJson(v) {
  if (v === null || v === undefined) return 'null';
  if (Array.isArray(v)) return '[' + v.map(pyJson).join(', ') + ']';
  if (typeof v === 'object') return '{' + Object.entries(v).map(([k, x]) => `"${k}": ${pyJson(x)}`).join(', ') + '}';
  if (typeof v === 'number') return String(v);
  return JSON.stringify(v);
}
function sampleCell(interval, items, startIso) {
  return '"' + `{"interval": ${interval.toFixed(1)}, "items": [${items.map(x => (x === null ? 'null' : (Math.round(x * 10) / 10).toFixed(1))).join(', ')}], "timestamp": "${startIso}"}`.replace(/"/g, '""') + '"';
}

const HEAD = {
  dailysleep: 'id;contributors;day;score;timestamp',
  sleepmodel: 'id;average_breath;average_heart_rate;average_hrv;awake_time;bedtime_end;bedtime_start;day;deep_sleep_duration;efficiency;heart_rate;hrv;latency;light_sleep_duration;low_battery_alert;lowest_heart_rate;movement_30_sec;period;readiness;readiness_score_delta;rem_sleep_duration;restless_periods;sleep_algorithm_version;sleep_analysis_reason;sleep_phase_30_sec;sleep_phase_5_min;sleep_score_delta;time_in_bed;total_sleep_duration;type',
  dailyreadiness: 'id;contributors;day;score;temperature_deviation;temperature_trend_deviation;timestamp',
  dailyactivity: 'id;active_calories;average_met_minutes;class_5_min;contributors;day;equivalent_walking_distance;high_activity_met_minutes;high_activity_time;inactivity_alerts;low_activity_met_minutes;low_activity_time;medium_activity_met_minutes;medium_activity_time;met;meters_to_target;non_wear_time;resting_time;score;sedentary_met_minutes;sedentary_time;steps;target_calories;target_meters;timestamp;total_calories',
  dailyspo2: 'id;breathing_disturbance_index;day;spo2_percentage',
  dailystress: 'id;day;day_summary;recovery_high;stress_high',
  dailyresilience: 'id;contributors;day;level',
  dailycardiovascularage: 'id;day;pulse_wave_velocity;vascular_age',
  sleeptime: 'id;day;optimal_bedtime;recommendation;status',
  workout: 'id;activity;calories;day;distance;end_datetime;intensity;label;source;start_datetime',
  session: 'id;day;end_datetime;heart_rate;heart_rate_variability;mood;motion_count;start_datetime;type',
  enhancedtag: 'id;comment;custom_tag_name;end_day;end_time;start_day;start_time;tag_type_code',
  heartrate: 'timestamp;bpm;source',
  temperature: 'timestamp;skin_temp',
  daytimestress: 'timestamp;recovery_value;stress_value',
  vo2max: 'id;day;timestamp;vo2_max',
};
export const SAMPLE_FILES = Object.keys(HEAD);

// The night's 5-minute stages: falling asleep, then cycles of about 90 minutes with more deep sleep early and more REM late.
function hypnogram(r, slots, latSlots, deepBias) {
  const out = [];
  for (let i = 0; i < latSlots && out.length < slots; i++) out.push('4');
  const ri = (lo, hi) => lo + Math.floor(r() * (hi - lo + 1));
  let cyc = 0;
  while (out.length < slots) {
    const early = cyc < 2, late = cyc >= 3;
    const deep = Math.max(0, Math.round((early ? ri(5, 9) : late ? ri(0, 1) : ri(1, 4)) * deepBias));
    const seg = [['2', ri(2, 6)], ['1', deep], ['2', ri(3, 8)], ['3', early ? ri(1, 3) : late ? ri(6, 12) : ri(4, 7)]];
    if (r() < 0.3) seg.push(['4', ri(1, 2)]);
    for (const [c, n] of seg) for (let k = 0; k < n && out.length < slots; k++) out.push(c);
    cyc++;
  }
  out[out.length - 1] = '4';
  return out.join('');
}

/* opts: { endDay 'YYYY-MM-DD' (the last night), days, seed, files (names to include), met (write the 1440 MET values per
 * day), hrEveryMin (minutes between daytime heart rate readings, default 10; 0 leaves heartrate.csv out),
 * shortRows (drop the leading id column in some dailyactivity and sleepmodel rows, as some real exports do) }.
 * Returns { files: { 'dailysleep.csv': text, ... }, truth: { nights: [...] } } */
export function makeSampleExport(opts = {}) {
  const r = rng(opts.seed || 20261022);
  const days = opts.days || 730;
  const end = Date.parse((opts.endDay || isoDay(Date.now() - DAY)) + 'T00:00:00Z');
  const start = end - (days - 1) * DAY;
  const want = new Set(opts.files || SAMPLE_FILES);
  const hrEvery = opts.hrEveryMin === undefined ? 10 : opts.hrEveryMin;
  const L = {}; for (const k of Object.keys(HEAD)) L[k] = [HEAD[k]];
  const truth = { nights: [], tags: [] };
  const base = { hrv: 46, rhr: 54 };
  let sickUntil = -1, sick = 0;
  let prevTags = new Set();
  for (let i = 0; i < days; i++) {
    const dayMs = start + i * DAY, day = isoDay(dayMs);
    const wd = new Date(dayMs).getUTCDay();
    const season = Math.cos(((dayMs / DAY) % 365.25) / 365.25 * 2 * Math.PI);
    if (sickUntil < i && r() < 0.012) { sickUntil = i + 2 + Math.floor(r() * 3); sick = 1; }
    const isSick = i <= sickUntil;
    // tags made the evening before this night (the day before `day`)
    const alc = prevTags.has('alcohol'), caf = prevTags.has('caffeine'), late = prevTags.has('late_meal'), sauna = prevTags.has('sauna'), mag = prevTags.has('magnesium');
    // the night that ends on `day`
    const weekendNight = wd === 6 || wd === 0;
    const bedMin = 23 * 60 + 10 + (weekendNight ? 35 : 0) + Math.round((r() - 0.5) * 70) + (caf ? 20 : 0);
    const latMin = clamp(Math.round(6 + r() * 14 + (caf ? 14 : 0) + (late ? 6 : 0)), 2, 60);
    const inBedMin = clamp(Math.round(450 + (weekendNight ? 35 : 0) + (r() - 0.5) * 80 - (alc ? 15 : 0)), 300, 620);
    const slots = Math.round(inBedMin / 5);
    const deepBias = clamp(1 - (alc ? 0.35 : 0) - (caf ? 0.2 : 0) + (sauna ? 0.12 : 0) + (r() - 0.5) * 0.3, 0.3, 1.4);
    const ph = hypnogram(r, slots, Math.round(latMin / 5), deepBias);
    const cnt = c => [...ph].filter(x => x === c).length * 300;
    const deep = cnt('1'), light = cnt('2'), rem = cnt('3'), awake = cnt('4');
    const total = deep + light + rem;
    const bedWall = dayMs - DAY + bedMin * 6e4 + Math.floor(r() * 60) * 1000;
    const endWall = bedWall + inBedMin * 6e4;
    const hrvMean = clamp(base.hrv + 5 * season + (alc ? -11 : 0) + (sauna ? 3 : 0) + (mag ? 1 : 0) + (isSick ? -10 : 0) + (r() - 0.5) * 12, 18, 110);
    const rhr = clamp(Math.round(base.rhr - 1.5 * season + (alc ? 5 : 0) + (late ? 2 : 0) + (isSick ? 6 : 0) + (r() - 0.5) * 4), 40, 80);
    const hrItems = [], hrvItems = [];
    for (let k = 0; k < slots; k++) {
      const t = k / slots;
      const edge = k < 2 || k >= slots - 1;
      const hr = rhr + 9 * Math.pow(1 - t, 2) + 4 * Math.pow(t, 3) + (ph[k] === '4' ? 6 : ph[k] === '3' ? 3 : 0) + (r() - 0.5) * 3;
      const hv = hrvMean * (0.75 + 0.5 * Math.sin(Math.PI * t)) * (ph[k] === '1' ? 1.15 : ph[k] === '4' ? 0.8 : 1) + (r() - 0.5) * 8;
      hrItems.push(edge ? null : clamp(hr, 38, 120));
      hrvItems.push(edge ? null : clamp(hv, 8, 200));
    }
    const hrVals = hrItems.filter(x => x !== null), hrvVals = hrvItems.filter(x => x !== null);
    const hrAvg = Math.round(hrVals.reduce((s, x) => s + x, 0) / hrVals.length * 1000) / 1000;
    const hrLow = Math.round(Math.min(...hrVals));
    const hrv = Math.round(hrvVals.reduce((s, x) => s + x, 0) / hrvVals.length);
    const eff = clamp(Math.round(total / (inBedMin * 60) * 100), 50, 99);
    const tempDev = Math.round(((r() - 0.5) * 0.36 + (isSick ? 0.7 + r() * 0.4 : 0) + (alc ? 0.12 : 0)) * 100) / 100;
    const sc = { deep_sleep: clamp(Math.round(deep / 60 / 1.05), 1, 100), efficiency: clamp(Math.round((eff - 60) * 2.6), 1, 100), latency: clamp(Math.round(100 - Math.max(0, latMin - 10) * 3), 1, 100), rem_sleep: clamp(Math.round(rem / 60 / 1.15), 1, 100), restfulness: clamp(Math.round(70 + (r() - 0.5) * 40 - (alc ? 10 : 0)), 1, 100), timing: clamp(Math.round(95 - Math.abs(bedMin - 23 * 60) / 3), 1, 100), total_sleep: clamp(Math.round(total / 60 / 4.9), 1, 100) };
    const sleepScore = clamp(Math.round(-6 + 0.35 * sc.total_sleep + 0.1 * sc.efficiency + 0.15 * sc.restfulness + 0.1 * sc.rem_sleep + 0.1 * sc.deep_sleep + 0.1 * sc.latency + 0.1 * sc.timing), 30, 99);
    const rc = { activity_balance: clamp(Math.round(80 + (r() - 0.5) * 30), 1, 100), body_temperature: clamp(Math.round(100 - Math.abs(tempDev) * 60), 1, 100), hrv_balance: i < 14 ? null : clamp(Math.round(75 + (hrv - base.hrv) * 1.2), 1, 100), previous_day_activity: clamp(Math.round(85 + (r() - 0.5) * 30), 1, 100), previous_night: sleepScore, recovery_index: clamp(Math.round(80 - (alc ? 30 : 0) - (late ? 15 : 0) + (r() - 0.5) * 30), 1, 100), resting_heart_rate: clamp(Math.round(100 - (rhr - base.rhr) * 6), 1, 100), sleep_balance: i < 14 ? null : clamp(Math.round(80 + (r() - 0.5) * 20), 1, 100), sleep_regularity: i < 14 ? null : clamp(Math.round(75 + (r() - 0.5) * 30), 1, 100) };
    const rvals = Object.values(rc).filter(x => x !== null);
    const readiness = clamp(Math.round(rvals.reduce((s, x) => s + x, 0) / rvals.length - (isSick ? 12 : 0)), 20, 99);
    const nightId = uuid(r);
    const sm = [nightId, (14.8 + (r() - 0.5) * 1.2 + (isSick ? 1 : 0)).toFixed(3).replace(/0+$/, '').replace(/\.$/, ''), String(hrAvg), String(hrv), String(awake), localIso(endWall), localIso(bedWall), day, String(deep), String(eff),
      sampleCell(300, hrItems, localIso(bedWall)), sampleCell(300, hrvItems, localIso(bedWall)), String(latMin * 60), String(light), 'False', String(hrLow),
      [...ph].map(c => (c === '4' ? '3' : c === '1' ? '1' : r() < 0.15 ? '2' : '1')).join('').repeat(10), '0',
      q({ contributors: rc, score: readiness, temperature_deviation: tempDev, temperature_trend_deviation: Math.round(tempDev * 0.6 * 100) / 100 }), '0', String(rem), String(Math.round(20 + r() * 80)), 'v2', 'foreground_sleep_analysis',
      [...ph].map(c => c.repeat(10)).join(''), ph, '0', String(inBedMin * 60), String(total), 'long_sleep'];
    if (opts.shortRows && i % 9 === 4) sm.shift();
    L.sleepmodel.push(sm.join(';'));
    truth.nights.push({ day, total, deep, rem, light, awake, hrv, hrLow, sleepScore, readiness, tempDev, alc, caf, bedMin, phases: ph });
    // an occasional afternoon nap
    if (r() < 0.06) {
      const napWall = dayMs + (14 * 60 + Math.floor(r() * 90)) * 6e4, napSlots = 4 + Math.floor(r() * 6);
      const nph = '2'.repeat(napSlots - 1) + '4';
      L.sleepmodel.push([uuid(r), '15.1', '61.2', '38', '300', localIso(napWall + napSlots * 300e3), localIso(napWall), day, '0', '88', '', '', '300', String((napSlots - 1) * 300), 'False', '58', '', '1', '', '', '0', '3', 'v2', 'foreground_sleep_analysis', '', nph, '', String(napSlots * 300), String((napSlots - 1) * 300), 'sleep'].join(';'));
    }
    L.dailysleep.push([uuid(r), q(sc), day, String(sleepScore), `${day}T00:00:00.000+00:00`].join(';'));
    L.dailyreadiness.push([uuid(r), q(rc), day, String(readiness), String(tempDev), i < 3 ? '' : String(Math.round(tempDev * 0.6 * 100) / 100), `${day}T00:00:00.000+00:00`].join(';'));
    // the day itself
    const steps = Math.round(clamp(8200 + (wd === 0 ? -2500 : wd === 6 ? 1500 : 0) + (r() - 0.5) * 7000 - (isSick ? 4000 : 0), 900, 26000));
    const active = Math.round(steps * 0.042 + r() * 60);
    const high = Math.round(r() < 0.35 ? 600 + r() * 2400 : r() * 300), med = Math.round(1800 + r() * 3600), low = Math.round(9000 + r() * 7200);
    const nonWear = Math.round(r() < 0.1 ? 1800 + r() * 3600 : r() * 600), rest = Math.round(inBedMin * 60 + 1800);
    const sed = Math.max(0, 86400 - high - med - low - nonWear - rest);
    const ac = { meet_daily_targets: clamp(Math.round(70 + (r() - 0.5) * 50), 1, 100), move_every_hour: clamp(Math.round(90 + (r() - 0.5) * 20), 1, 100), recovery_time: clamp(Math.round(90 + (r() - 0.5) * 20), 1, 100), stay_active: clamp(Math.round(60 + steps / 400), 1, 100), training_frequency: clamp(Math.round(70 + (r() - 0.5) * 50), 1, 100), training_volume: clamp(Math.round(70 + (r() - 0.5) * 50), 1, 100) };
    const actScore = clamp(Math.round(Object.values(ac).reduce((s, x) => s + x, 0) / 6), 20, 99);
    let c5 = '';
    for (let k = 0; k < 288; k++) { const hh = k / 12; c5 += hh < 7 ? '1' : hh > 22.5 ? '1' : r() < 0.06 ? '0' : r() < 0.15 ? '4' : r() < 0.4 ? '3' : '2'; }
    const met = opts.met ? '"' + `{"interval": 60.0, "items": [${Array.from({ length: 1440 }, (_, k) => (k < 420 ? 0.9 : (1 + r() * 2.5)).toFixed(1)).join(', ')}], "timestamp": "${day}T04:00:00.000+01:00"}`.replace(/"/g, '""') + '"' : '';
    const da = [uuid(r), String(active), (1.1 + r() * 0.6).toFixed(5), c5, q(ac), day, String(Math.round(steps * 0.78)), String(Math.round(high / 60 * 8)), String(high), String(Math.floor(r() * 3)), String(Math.round(low / 60 * 2)), String(low), String(Math.round(med / 60 * 4)), String(med), met, String(Math.max(0, 9000 - steps)), String(nonWear), String(rest), String(actScore), String(Math.round(sed / 60 * 1.1)), String(sed), String(steps), '450', '9000', `${day}T04:00:00.000+01:00`, String(1950 + active)];
    if (opts.shortRows && i % 11 === 5) da.shift();
    L.dailyactivity.push(da.join(';'));
    L.dailyspo2.push([uuid(r), String(Math.round(r() * 8 + (alc ? 4 : 0))), day, q({ average: Math.round((96.2 + (r() - 0.5) * 2.4) * 1000) / 1000 })].join(';'));
    const sh = Math.round(r() * 5400 + (isSick ? 2400 : 0)), rh = Math.round(r() * 9000);
    L.dailystress.push([uuid(r), day, sh > 3600 ? 'stressful' : rh > 5400 ? 'restored' : i % 3 ? 'normal' : '', String(rh), String(sh)].join(';'));
    if (i >= 14) L.dailyresilience.push([uuid(r), q({ daytime_recovery: Math.round((40 + r() * 20) * 10) / 10, sleep_recovery: Math.round((45 + r() * 25) * 10) / 10, stress: Math.round((40 + r() * 20) * 10) / 10 }), day, ['adequate', 'solid', 'solid', 'strong', 'limited'][Math.floor(r() * 5)]].join(';'));
    if (i % 3 === 0) L.dailycardiovascularage.push([uuid(r), day, String(5.6 + (r() - 0.5) * 0.6), String(Math.round(38 + (r() - 0.5) * 6))].join(';'));
    L.sleeptime.push([uuid(r), day, i < 10 ? '' : q({ day_tz: offsetMin(dayMs) * 60, end_offset: 1800 + Math.round(r() * 6) * 300, start_offset: -1800 - Math.round(r() * 6) * 300 }), i < 10 ? '' : ['follow_optimal_bedtime', 'earlier_bedtime', 'improve_efficiency'][Math.floor(r() * 3)], i < 10 ? 'not_enough_nights' : 'optimal_found'].join(';'));
    if (i % 30 === 7) L.vo2max.push([uuid(r), day, `${day}T00:00:00.000+00:00`, String(Math.round((41 + (r() - 0.5) * 3) * 10) / 10)].join(';'));
    // workouts
    if (r() < 0.45) {
      const kinds = [['running', 9000, 8], ['cycling', 25000, 6], ['walking', 4500, 4], ['strength_training', null, 5], ['yoga', null, 3]];
      const [act, dist, kcalMin] = kinds[Math.floor(r() * kinds.length)];
      const dur = Math.round((25 + r() * 60) * 60);
      const ws = dayMs + (17 * 60 + Math.floor(r() * 120)) * 6e4;
      L.workout.push([uuid(r), act, String(dur / 60 * kcalMin + r()), day, dist ? String(Math.round(dist * (0.6 + r() * 0.8))) : '', localIso(ws + dur * 1000), ['easy', 'moderate', 'hard'][Math.floor(r() * 3)], r() < 0.1 ? 'Evening session' : '', ['autodetected', 'confirmed', 'manual'][Math.floor(r() * 3)], localIso(ws)].join(';'));
    }
    if (r() < 0.08) {
      const ss = dayMs + (21 * 60 + Math.floor(r() * 60)) * 6e4, d = (5 + Math.floor(r() * 10)) * 60;
      L.session.push([uuid(r), day, localIso(ss + d * 1000), '', '', ['good', 'great', 'same'][Math.floor(r() * 3)], '', localIso(ss), ['meditation', 'breathing', 'relaxation'][Math.floor(r() * 3)]].join(';'));
    }
    // tags for this evening (they belong to the night that ends tomorrow)
    const next = new Set();
    const tag = (code, custom, hour) => {
      const t = dayMs + (hour * 60 + Math.floor(r() * 50)) * 6e4;
      L.enhancedtag.push([uuid(r), '', custom || '', '', '', day, localIso(t), code].join(';'));
      truth.tags.push({ day, code: custom || code });
    };
    if (r() < (wd === 5 || wd === 6 ? 0.35 : 0.08)) { tag('tag_generic_alcohol', '', 20); next.add('alcohol'); }
    if (r() < 0.12) { tag('tag_generic_caffeine', '', 16); next.add('caffeine'); }
    if (r() < 0.08) { tag('tag_generic_late_meal', '', 21); next.add('late_meal'); }
    if (r() < 0.06) { tag('tag_generic_sauna', '', 19); next.add('sauna'); }
    if (r() < 0.1) { tag('custom', 'Magnesium', 22); next.add('magnesium'); }
    if (isSick && sick) { tag('tag_generic_sick', '', 9); sick = 0; }
    if (i % 41 === 3) L.enhancedtag.push([uuid(r), 'Long flight home', '', '', '', day, localIso(dayMs + 15 * 3600e3), ''].join(';'));
    prevTags = next;
    // the readings through the day, in UTC (fewer than the ring makes: one every hrEvery minutes)
    if (hrEvery > 0 && want.has('heartrate')) {
      for (let m = 7 * 60 + 30; m < 22 * 60 + 30; m += hrEvery) {
        const wall = dayMs + m * 6e4;
        const bpm = Math.round(clamp(rhr + 14 + 10 * Math.sin((m - 420) / 900 * Math.PI) + (r() - 0.5) * 12 + (m > 17 * 60 && m < 18 * 60 + 30 && r() < 0.5 ? 40 : 0), 45, 185));
        L.heartrate.push(`${utcIso(wall)};${bpm};${m < 7 * 60 + 45 ? 'rest' : 'awake'}`);
      }
      for (let m = 60; m < 360; m += 30) L.heartrate.push(`${utcIso(dayMs + m * 6e4)};${rhr + 4};sleep`);
    }
    if (want.has('temperature')) for (let m = 0; m < 7 * 60; m += 15) L.temperature.push(`${utcIso(dayMs + m * 6e4)};${(34.2 + tempDev + (r() - 0.5) * 0.6).toFixed(2)}`);
    if (want.has('daytimestress')) for (let m = 8 * 60; m < 22 * 60; m += 15) { const s = Math.round(clamp(30 + 40 * Math.sin((m - 480) / 840 * Math.PI) + (r() - 0.5) * 30, 0, 100)); L.daytimestress.push(`${utcIso(dayMs + m * 6e4)};${s < 25 ? Math.round(60 - s) : ''};${s >= 25 ? s : ''}`); }
  }
  const files = {};
  for (const k of Object.keys(HEAD)) if (want.has(k)) files[`${k}.csv`] = L[k].join('\n') + '\n';
  return { files, truth };
}
