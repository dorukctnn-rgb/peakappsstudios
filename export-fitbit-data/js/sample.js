/* A made-up Fitbit archive for "Try a sample archive" and for the tests. It copies the quirks of the real layout: JSON
 * pretty-printed with " : ", numbers written as strings, two-digit years, minute series in UTC, monthly batches that overlap
 * by a day, the last batch padded with empty days past the export date, sleep files newest first, weight in pounds with BMI,
 * a time zone in Profile.csv (Europe/Berlin, so the batches cross the change to summer time on 29 March 2026), and CSV
 * folders for sleep score, heart rate variability and SpO2. It also returns what each day should add up to, worked out
 * from the made-up person directly and not by reading the files back. Nothing here is anyone's real data. */
import { zipSync, strToU8 } from '../vendor/fflate.js';

const pad = n => String(n).padStart(2, '0');
const mmddyy = d => `${pad(d.getUTCMonth() + 1)}/${pad(d.getUTCDate())}/${pad(d.getUTCFullYear() % 100)}`;
const hms = d => `${pad(d.getUTCHours())}:${pad(d.getUTCMinutes())}:${pad(d.getUTCSeconds())}`;
const fit = d => `${mmddyy(d)} ${hms(d)}`;
const iso = d => d.toISOString().slice(0, 19);
const ymd = d => d.toISOString().slice(0, 10);
// Jackson-style pretty print, the way the archive writes it
const pretty = arr => '[' + arr.map(o => JSON.stringify(o, null, 2).replace(/"([^"]+)": /g, '"$1" : ')).join(',') + ']';

function rng(seed) { let s = seed >>> 0; return () => { s = (s * 1664525 + 1013904223) >>> 0; return s / 4294967296; }; }
// Europe/Berlin offset in minutes for a UTC instant (EU rule: last Sunday of March / October at 01:00 UTC)
function berlinOffset(ms) {
  const y = new Date(ms).getUTCFullYear();
  const lastSun = m => { const d = new Date(Date.UTC(y, m + 1, 0, 1)); d.setUTCDate(d.getUTCDate() - d.getUTCDay()); return d.getTime(); };
  return ms >= lastSun(2) && ms < lastSun(9) ? 120 : 60;
}

export function makeSample({ start = '2026-03-01', days = 92, exportDay = '2026-06-01' } = {}) {
  const R = rng(20261029);
  const files = {};
  const G = 'Takeout/Fitbit/Global Export Data/';
  const expect = { daily: {}, nights: 0, weights: 0, workouts: 0, tz: 'Europe/Berlin' };
  const steps = [], cal = [], dist = [], sed = [], light = [], mod = [], very = [], rhr = [], sleeps = [], weights = [], ex = [];
  const t0 = Date.parse(start + 'T00:00:00Z');
  for (let i = 0; i < days; i++) {
    const day = new Date(t0 + i * 864e5);
    const dayKey = ymd(day);
    const e = (expect.daily[dayKey] = { steps: 0, distCm: 0, cal: 0 });
    // active minutes between 07:00 and 21:59 local time
    const active = 180 + Math.floor(R() * 220);
    const used = new Set();
    for (let k = 0; k < active; k++) {
      let minute; do { minute = 7 * 60 + Math.floor(R() * 15 * 60); } while (used.has(minute)); used.add(minute);
      const localMs = t0 + i * 864e5 + minute * 60000;
      // local wall time -> UTC (the offset of the UTC instant one hour earlier is enough here: no activity at 02:00-03:00)
      const utcMs = localMs - berlinOffset(localMs - 60 * 60000) * 60000;
      const s = 20 + Math.floor(R() * 110);
      const c = Math.round((1.2 + s * 0.045) * 1000) / 1000;
      const cm = Math.round(s * 74.5);
      const t = new Date(utcMs);
      steps.push({ ms: utcMs, row: { dateTime: fit(t), value: String(s) } });
      cal.push({ ms: utcMs, row: { dateTime: fit(t), value: String(c) } });
      dist.push({ ms: utcMs, row: { dateTime: fit(t), value: String(cm) } });
      e.steps += s; e.distCm += cm; e.cal += c;
    }
    const dt = `${mmddyy(day)} 00:00:00`;
    const sv = 600 + Math.floor(R() * 200), lv = 150 + Math.floor(R() * 90), mv = 10 + Math.floor(R() * 30), vv = Math.floor(R() * 40);
    sed.push({ dateTime: dt, value: String(sv) }); light.push({ dateTime: dt, value: String(lv) }); mod.push({ dateTime: dt, value: String(mv) }); very.push({ dateTime: dt, value: String(vv) });
    const r = 52 + R() * 8;
    rhr.push({ dateTime: dt, value: { date: mmddyy(day), value: r, error: 6.5 } });
    Object.assign(e, { sedentary: sv, light: lv, moderate: mv, very: vv, rhr: Math.round(r * 10) / 10 });
    // a night that ends this morning
    const bedLocal = t0 + (i - 1) * 864e5 + (22 * 60 + 30 + Math.floor(R() * 60)) * 60000;
    const asleep = 380 + Math.floor(R() * 90), awake = 30 + Math.floor(R() * 25);
    const inBed = asleep + awake;
    const deep = Math.floor(asleep * 0.18), rem = Math.floor(asleep * 0.22), lightS = asleep - deep - rem;
    const segs = [];
    let cur = bedLocal;
    for (const [level, mins] of [['wake', 5], ['light', Math.floor(lightS / 2)], ['deep', deep], ['rem', rem], ['light', lightS - Math.floor(lightS / 2)], ['wake', awake - 5]]) {
      segs.push({ dateTime: iso(new Date(cur)) + '.000', level, seconds: mins * 60 }); cur += mins * 60000;
    }
    const logId = 40000000000 + i;
    sleeps.push({ logId, dateOfSleep: dayKey, startTime: iso(new Date(bedLocal)) + '.000', endTime: iso(new Date(bedLocal + inBed * 60000)) + '.000', duration: inBed * 60000, minutesToFallAsleep: 0, minutesAsleep: asleep, minutesAwake: awake, minutesAfterWakeup: 0, timeInBed: inBed, efficiency: Math.round(asleep / inBed * 100), type: 'stages', infoCode: 0, logType: 'auto_detected', levels: { summary: { deep: { count: 3, minutes: deep, thirtyDayAvgMinutes: 0 }, wake: { count: 12, minutes: awake, thirtyDayAvgMinutes: 0 }, light: { count: 20, minutes: lightS, thirtyDayAvgMinutes: 0 }, rem: { count: 5, minutes: rem, thirtyDayAvgMinutes: 0 } }, data: segs, shortData: [] }, mainSleep: true });
    Object.assign(e, { sleep: asleep, inBed, score: 70 + (i % 20), logId });
    if (i % 9 === 4) { // a nap
      const napStart = t0 + i * 864e5 + 14 * 3600000;
      sleeps.push({ logId: 41000000000 + i, dateOfSleep: dayKey, startTime: iso(new Date(napStart)) + '.000', endTime: iso(new Date(napStart + 40 * 60000)) + '.000', duration: 2400000, minutesToFallAsleep: 0, minutesAsleep: 35, minutesAwake: 5, minutesAfterWakeup: 0, timeInBed: 40, efficiency: 88, type: 'classic', infoCode: 0, logType: 'auto_detected', levels: { summary: { restless: { count: 2, minutes: 5 }, awake: { count: 0, minutes: 0 }, asleep: { count: 0, minutes: 35 } }, data: [], shortData: [] }, mainSleep: false });
      e.nap = 35;
    }
    if (i % 3 === 0) { // weigh-in, pounds with BMI (height 1.78 m)
      const kg = 79 - i * 0.03 + (R() - 0.5) * 0.6;
      const lb = Math.round(kg / 0.45359237 * 10) / 10;
      weights.push({ logId: 1700000000000 + i, weight: lb, bmi: Math.round(kg / (1.78 * 1.78) * 100) / 100, fat: i % 6 === 0 ? 21.5 : undefined, date: mmddyy(day), time: '07:12:30', source: 'Aria' });
      e.weightKg = Math.round(lb * 0.45359237 * 100) / 100; e.weightLb = lb;
    }
    if (i % 4 === 1) { // a walk or a run
      const run = i % 8 === 1;
      const startLocal = new Date(t0 + i * 864e5 + 18 * 3600000);
      ex.push({ logId: 52000000000 + i, activityName: run ? 'Run' : 'Walk', activityTypeId: run ? 90009 : 90013, averageHeartRate: run ? 152 : 104, calories: run ? 410 : 160, duration: (run ? 32 : 41) * 60000, activeDuration: (run ? 31 : 40) * 60000, steps: run ? 5200 : 4300, logType: 'auto_detected', startTime: fit(startLocal), distance: run ? 5.12 : 3.02, distanceUnit: 'Kilometer', elevationGain: 12.0, hasGps: false });
    }
  }
  expect.weights = weights.length; expect.workouts = ex.length; expect.nights = sleeps.length;

  // minute series in monthly batches named by their first UTC day; each batch also holds the first day of the next one,
  // and the last one runs ten days past the export date with zero values
  const months = [...new Set(steps.map(s => ymd(new Date(s.ms)).slice(0, 7)))].sort();
  for (const [name, list] of [['steps', steps], ['calories', cal], ['distance', dist]]) {
    list.sort((a, b) => a.ms - b.ms);
    months.forEach((mo, k) => {
      const from = Date.parse(mo + '-01T00:00:00Z');
      const next = k + 1 < months.length ? Date.parse(months[k + 1] + '-01T00:00:00Z') : null;
      const to = next ? next + 864e5 : Date.parse(exportDay + 'T00:00:00Z');
      const rows = list.filter(s => s.ms >= from && s.ms < to).map(s => s.row);
      if (!next) for (let d = 0; d < 10; d++) { const t = new Date(to + d * 864e5); rows.push({ dateTime: fit(t), value: '0' }); }
      files[`${G}${name}-${mo}-01.json`] = pretty(rows);
    });
  }
  const daily = (name, arr) => { files[`${G}${name}-${start}.json`] = pretty(arr.slice(0, 40)); files[`${G}${name}-${ymd(new Date(t0 + 39 * 864e5))}.json`] = pretty(arr.slice(39)); };
  daily('sedentary_minutes', sed); daily('lightly_active_minutes', light); daily('moderately_active_minutes', mod); daily('very_active_minutes', very);
  // resting heart rate, plus padded days with 0
  files[`${G}resting_heart_rate-${start}.json`] = pretty(rhr.concat([0, 1, 2].map(d => ({ dateTime: `${mmddyy(new Date(Date.parse(exportDay + 'T00:00:00Z') + d * 864e5))} 00:00:00`, value: { date: null, value: 0.0, error: 0.0 } }))));
  // sleep, newest first, two batches that overlap by two nights
  const sl = sleeps.slice().reverse();
  files[`${G}sleep-${start}.json`] = pretty(sl.slice(Math.floor(sl.length / 2) - 2));
  files[`${G}sleep-${ymd(new Date(t0 + 46 * 864e5))}.json`] = pretty(sl.slice(0, Math.floor(sl.length / 2)));
  files[`${G}weight-${start}.json`] = pretty(weights.map(w => JSON.parse(JSON.stringify(w))));
  files[`${G}exercise-0.json`] = pretty(ex.slice(0, 15));
  files[`${G}exercise-100.json`] = pretty(ex.slice(14));
  // heart rate readings for three days (every 10 seconds, 06:00-06:30 UTC only, to keep it small)
  for (let d = 0; d < 3; d++) {
    const day = new Date(t0 + (days - 3 + d) * 864e5);
    const rows = [];
    for (let s = 0; s < 180; s++) { const t = new Date(day.getTime() + 6 * 3600000 + s * 10000); rows.push({ dateTime: fit(t), value: { bpm: 58 + (s % 17), confidence: 2 } }); }
    files[`${G}heart_rate-${ymd(day)}.json`] = pretty(rows);
  }
  files[`${G}time_in_heart_rate_zones-${start}.json`] = pretty(Object.keys(expect.daily).slice(0, 10).map((d, i) => ({ dateTime: `${d.slice(5, 7)}/${d.slice(8)}/${d.slice(2, 4)} 00:00:00`, value: { valuesInZones: { IN_DEFAULT_ZONE_1: 30 + i, IN_DEFAULT_ZONE_2: 10, IN_DEFAULT_ZONE_3: 2, BELOW_DEFAULT_ZONE_1: 1300 } } })));
  // CSV folders
  files['Takeout/Fitbit/Personal & Account/Profile.csv'] = 'id,full_name,timezone,locale\r\nABC123,Sample Person,Europe/Berlin,en_GB\r\n';
  files['Takeout/Fitbit/Sleep Score/sleep_score.csv'] = 'sleep_log_entry_id,timestamp,overall_score,composition_score,revitalization_score,duration_score,deep_sleep_in_minutes,resting_heart_rate,restlessness\n'
    + Object.entries(expect.daily).map(([d, e]) => `${e.logId},${d}T07:00:00Z,${e.score},20,20,${e.score - 40},60,55,0.07`).join('\n') + '\n';
  const hrvMonths = [...new Set(Object.keys(expect.daily).map(d => d.slice(0, 7)))];
  for (const mo of hrvMonths) {
    const ds = Object.keys(expect.daily).filter(d => d.startsWith(mo));
    files[`Takeout/Fitbit/Heart Rate Variability/Daily Heart Rate Variability Summary - ${mo}-(${ds.length}).csv`] = 'timestamp,rmssd,nremhr,entropy\n' + ds.map((d, i) => { const v = 30 + (i % 9) * 1.5; expect.daily[d].hrv = v; return `${d}T00:00:00,${v},49.6,2.47`; }).join('\n') + '\n';
    files[`Takeout/Fitbit/Oxygen Saturation (SpO2)/Daily SpO2 - ${mo}-01-${mo}-28.csv`] = 'timestamp,average_value,lower_bound,upper_bound\n' + ds.map((d, i) => { const v = 95 + (i % 4) * 0.5; expect.daily[d].spo2 = v; return `${d}T00:00:00,${v},93.0,99.1`; }).join('\n') + '\n';
  }
  // files Tallyband must skip
  files['Takeout/Fitbit/Application/Account_Access_Events_1.csv'] = 'timestamp,event_name,email,location,ip,outcome,reason\n2026-03-01T10:00:00Z,LOGIN,someone@example.com,DE,203.0.113.5,SUCCESS,\n';
  files['Takeout/archive_browser.html'] = '<!doctype html><title>Archive</title><p>Fitbit</p>';
  return { files, expect, start, days, exportDay };
}

export function makeSampleZip(opts) {
  const { files } = makeSample(opts);
  return zipSync(Object.fromEntries(Object.entries(files).map(([k, v]) => [k, strToU8(v)])), { level: 6 });
}
