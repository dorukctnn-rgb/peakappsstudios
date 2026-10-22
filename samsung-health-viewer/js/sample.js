/* A made-up Samsung Health export for the "Try the sample" button and for the tests. Every number is invented by a
 * seeded random generator; no real person's data is in here. The files follow the layout of a real export (see
 * engine.js): one CSV per data type, a first line about the file, the header, rows ending with an empty cell, UTC
 * wall-clock times with a separate time_offset, prefixed column names on some tables, and files Wristory never opens
 * (device list, badges, preferences, the jsons folder).
 *   variant 'current': a 2025-2026 app (sleep stages, watch heart rate, stress, blood oxygen, day_time as text)
 *   variant 'old':     a 2019-2020 app (phone only: no stages, day_time as epoch milliseconds, no prefixes, no meta line
 *                      on some files) */

function rng(seed) {
  let a = seed >>> 0;
  return () => { a = (a + 0x6d2b79f5) >>> 0; let t = a; t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
}
const pad = (n, w = 2) => String(n).padStart(w, '0');
const utc = ms => { const d = new Date(ms); return `${d.getUTCFullYear()}-${pad(d.getUTCMonth() + 1)}-${pad(d.getUTCDate())} ${pad(d.getUTCHours())}:${pad(d.getUTCMinutes())}:${pad(d.getUTCSeconds())}.${pad(d.getUTCMilliseconds(), 3)}`; };
const offStr = m => `UTC${m < 0 ? '-' : '+'}${pad(Math.floor(Math.abs(m) / 60))}${pad(Math.abs(m) % 60)}`;
const dayMs = day => Date.parse(day + 'T00:00:00Z');
const addDays = (day, n) => new Date(dayMs(day) + n * 864e5).toISOString().slice(0, 10);

class Table {
  constructor(type, cols, opts = {}) { this.type = type; this.cols = cols; this.rows = []; this.meta = opts.meta !== false; this.version = opts.version || '6315006'; this.trailing = opts.trailing !== false; }
  add(o) { this.rows.push(this.cols.map(c => { const k = c.slice(c.lastIndexOf('.') + 1); const v = o[c] !== undefined ? o[c] : o[k]; return v === undefined || v === null ? '' : String(v); })); }
  text() {
    const q = v => (/[",\n]/.test(v) ? `"${v.replace(/"/g, '""')}"` : v);
    const lines = [];
    if (this.meta) lines.push(`${this.type},${this.version},${this.cols.length}`);
    lines.push(this.cols.join(',') + (this.trailing ? ',' : ''));
    for (const r of this.rows) lines.push(r.map(q).join(',') + (this.trailing ? ',' : ''));
    return '\uFEFF' + lines.join('\n') + '\n';
  }
}
const P = (prefix, names) => names.map(n => `${prefix}.${n}`);

export function makeSampleExport(opts = {}) {
  const variant = opts.variant || 'current';
  const old = variant === 'old';
  const days = opts.days || 820;
  const end = opts.end || '2026-10-18';
  const off = opts.offset !== undefined ? opts.offset : old ? 60 : 540;
  const R = rng(opts.seed || (old ? 7 : 42));
  const start = addDays(end, -(days - 1));
  const tc = opts.timecode || end.replace(/-/g, '') + '091530';
  const folder = `samsunghealth_${opts.account || 'sample.person'}_${tc}`;
  let uid = 0;
  const id = () => { uid++; const h = (uid * 2654435761 >>> 0).toString(16).padStart(8, '0'); return `${h}-5a3c-4e1b-9d2f-${pad(uid, 12)}`; };
  const PHONE = 'k3Jx9QaPhone', WATCH = 'Wm7ZpLqWatch';
  const pkg = 'com.sec.android.app.shealth';
  const dayTime = day => (old ? String(dayMs(day)) : `${day} 00:00:00.000`);
  // local wall clock (day, minutes after midnight) -> the UTC string Samsung writes
  const at = (day, mins) => dayMs(day) + mins * 60000 - off * 60000;
  const files = {};
  const put = (t, name) => { files[`${folder}/${name || `${t.type}.${tc}.csv`}`] = t.text(); };

  const SD = new Table('com.samsung.shealth.tracker.pedometer_day_summary', ['create_sh_ver', 'step_count', 'binning_data', 'active_time', 'recommendation', 'run_step_count', 'update_time', 'source_package_name', 'create_time', 'source_info', 'speed', 'distance', 'calorie', 'walk_step_count', 'deviceuuid', 'pkg_name', 'healthy_step', 'achievement', 'datauuid', 'day_time']);
  const TR = new Table('com.samsung.shealth.step_daily_trend', ['binning_data', 'update_time', 'create_time', 'source_pkg_name', 'count', 'speed', 'distance', 'calorie', 'deviceuuid', 'source_type', 'pkg_name', 'datauuid', 'day_time'], { meta: !old, version: old ? '5160003' : '6315006' });
  const SLP = new Table('com.samsung.shealth.sleep', old ? ['efficiency', 'sleep_duration', 'quality', 'start_time', 'end_time', 'time_offset', 'deviceuuid', 'pkg_name', 'datauuid', 'update_time'] :
    ['original_efficiency', 'mental_recovery', 'factor_01', 'factor_02', 'factor_03', 'factor_04', 'factor_05', 'has_sleep_data', 'combined_id', 'physical_recovery', 'movement_awakening', 'quality', 'sleep_cycle', 'efficiency', 'sleep_score', 'sleep_duration', 'stage_analyzed_type', 'total_rem_duration', 'total_light_duration'].concat(P('com.samsung.health.sleep', ['create_sh_ver', 'start_time', 'custom', 'update_time', 'create_time', 'time_offset', 'deviceuuid', 'comment', 'pkg_name', 'end_time', 'datauuid'])));
  const STG = new Table('com.samsung.health.sleep_stage', ['create_sh_ver', 'start_time', 'sleep_id', 'custom', 'modify_sh_ver', 'update_time', 'create_time', 'stage', 'time_offset', 'deviceuuid', 'comment', 'pkg_name', 'end_time', 'client_data_id', 'datauuid']);
  const HR = new Table('com.samsung.shealth.tracker.heart_rate', old ? ['heart_rate', 'start_time', 'end_time', 'time_offset', 'deviceuuid', 'datauuid', 'tag_id'] :
    ['source', 'tag_id'].concat(P('com.samsung.health.heart_rate', ['create_sh_ver', 'heart_beat_count', 'start_time', 'custom', 'binning_data', 'update_time', 'create_time', 'max', 'min', 'time_offset', 'deviceuuid', 'comment', 'pkg_name', 'end_time', 'datauuid', 'heart_rate'])), { meta: !old });
  const VIT = new Table('com.samsung.shealth.vitality_score', ['total_score', 'activity_score', 'sleep_score', 'shr_score', 'shr_value', 'shrv_value', 'deviceuuid', 'pkg_name', 'datauuid', 'day_time']);
  const SPO = new Table('com.samsung.shealth.tracker.oxygen_saturation', ['tag_id'].concat(P('com.samsung.health.oxygen_saturation', ['spo2', 'min', 'max', 'heart_rate', 'coverage_rate', 'low_duration', 'binning', 'start_time', 'end_time', 'time_offset', 'deviceuuid', 'pkg_name', 'datauuid'])));
  const STR = new Table('com.samsung.shealth.stress', ['score', 'min', 'max', 'algorithm', 'binning_data', 'tag_id', 'start_time', 'end_time', 'time_offset', 'deviceuuid', 'pkg_name', 'datauuid']);
  const WT = new Table('com.samsung.health.weight', ['vfa_level', 'start_time', 'body_fat', 'height', 'muscle_mass', 'skeletal_muscle_mass', 'basal_metabolic_rate', 'weight', 'time_offset', 'deviceuuid', 'comment', 'pkg_name', 'datauuid'], { meta: true, version: old ? '5160003' : '6315006' });
  const BP = new Table('com.samsung.shealth.blood_pressure', P('com.samsung.health.blood_pressure', ['systolic', 'diastolic', 'pulse', 'mean', 'medication', 'start_time', 'time_offset', 'deviceuuid', 'comment', 'pkg_name', 'datauuid']));
  const EX = new Table('com.samsung.shealth.exercise', old ? ['exercise_type', 'source_type', 'duration', 'distance', 'calorie', 'mean_heart_rate', 'max_heart_rate', 'start_time', 'end_time', 'time_offset', 'deviceuuid', 'pkg_name', 'datauuid'] :
    ['source_type', 'live_data_internal', 'heart_rate_sample_count'].concat(P('com.samsung.health.exercise', ['exercise_type', 'duration', 'distance', 'calorie', 'mean_heart_rate', 'max_heart_rate', 'min_heart_rate', 'mean_speed', 'live_data', 'location_data', 'start_time', 'end_time', 'time_offset', 'deviceuuid', 'comment', 'pkg_name', 'datauuid'])));

  let kg = 82.4 + R() * 3;
  const types = old ? [1002, 1001, 11007] : [1002, 1002, 11007, 15002, 9002, 13001, 14001];
  for (let i = 0; i < days; i++) {
    const day = addDays(start, i);
    const dow = new Date(dayMs(day)).getUTCDay();
    const yearFrac = i / 365;
    const season = Math.sin(((+day.slice(5, 7) - 1) / 12) * 2 * Math.PI - 1.2);
    const weekend = dow === 0 || dow === 6;
    const off2 = R() < 0.03; // a few days with no tracking at all
    // ---- steps
    if (!off2) {
      const steps = Math.max(400, Math.round((weekend ? 9800 : 7400) + season * 1400 + yearFrac * 300 + (R() - 0.5) * 6200));
      const dist = Math.round(steps * 0.74), cal = Math.round(steps * 0.041);
      const phone = Math.round(steps * (0.55 + R() * 0.25));
      const updated = utc(at(addDays(day, 1), 60 + R() * 300));
      if (!old) {
        SD.add({ create_sh_ver: 6315006, step_count: phone, active_time: Math.round(phone * 520), run_step_count: Math.round(phone * 0.05), update_time: updated, create_time: updated, source_info: '', speed: 1.3, distance: Math.round(phone * 0.74), calorie: Math.round(phone * 0.041), walk_step_count: phone, deviceuuid: PHONE, pkg_name: pkg, healthy_step: 0, datauuid: id(), day_time: dayTime(day), binning_data: `${id()}.binning_data.json` });
        SD.add({ create_sh_ver: 6315006, step_count: steps, active_time: Math.round(steps * 540), run_step_count: Math.round(steps * 0.08), update_time: updated, create_time: updated, source_info: `${id()}.source_info.json`, speed: 1.35, distance: dist, calorie: cal, walk_step_count: steps, deviceuuid: 'VfS0qUERdZ', pkg_name: pkg, healthy_step: 0, datauuid: id(), day_time: dayTime(day), binning_data: `${id()}.binning_data.json` });
      }
      TR.add({ update_time: updated, create_time: updated, source_pkg_name: pkg, count: steps, speed: 1.35, distance: dist, calorie: cal, deviceuuid: 'VfS0qUERdZ', source_type: -2, pkg_name: pkg, datauuid: id(), day_time: dayTime(day) });
      TR.add({ update_time: updated, create_time: updated, source_pkg_name: pkg, count: phone, speed: 1.3, distance: Math.round(phone * 0.74), calorie: Math.round(phone * 0.041), deviceuuid: PHONE, source_type: 0, pkg_name: pkg, datauuid: id(), day_time: dayTime(day) });
    }
    // ---- the night that ends this morning
    if (!off2 && R() > (old ? 0.25 : 0.04)) {
      const bed = (weekend ? 23 * 60 + 50 : 23 * 60 + 5) + Math.round((R() - 0.5) * 80) + (season > 0.5 ? 10 : 0);
      const asleepTarget = 395 + Math.round((R() - 0.5) * 110) + (weekend ? 35 : 0);
      const a = at(addDays(day, -1), bed), sid = id();
      let t = a, m = { awake: 0, light: 0, deep: 0, rem: 0 }, stages = [];
      if (!old) {
        let slept = 0, cyc = 0;
        while (slept < asleepTarget) {
          const seq = [['light', 20 + R() * 25], ['deep', Math.max(5, (cyc < 2 ? 45 : 15) - cyc * 4 + (R() - 0.5) * 16)], ['light', 15 + R() * 20], ['rem', 10 + cyc * 6 + R() * 10]];
          if (R() < 0.35) seq.push(['awake', 2 + R() * 9]);
          for (const [st, len] of seq) { const L = Math.round(len); stages.push([st, t, t + L * 60000]); t += L * 60000; m[st] += L; if (st !== 'awake') slept += L; }
          cyc++;
        }
        for (const [st, x, y] of stages) STG.add({ create_sh_ver: 6315006, start_time: utc(x), sleep_id: sid, update_time: utc(y), create_time: utc(y), stage: { awake: 40001, light: 40002, deep: 40003, rem: 40004 }[st], time_offset: offStr(off), deviceuuid: WATCH, pkg_name: pkg, end_time: utc(y), datauuid: id() });
      } else t = a + (asleepTarget + 20) * 60000;
      const dur = Math.round((t - a) / 60000);
      if (old) SLP.add({ efficiency: 90 + Math.round(R() * 6), sleep_duration: asleepTarget, quality: 50001 + Math.floor(R() * 4), start_time: utc(a), end_time: utc(t), time_offset: offStr(off), deviceuuid: PHONE, pkg_name: pkg, datauuid: sid, update_time: utc(t) });
      else SLP.add({ original_efficiency: 92, mental_recovery: 70 + Math.round(R() * 25), factor_02: m.deep, factor_05: m.awake, has_sleep_data: 1, physical_recovery: 70 + Math.round(R() * 25), movement_awakening: Math.round(R() * 40), sleep_cycle: 4 + Math.round(R() * 2), efficiency: Math.round(((dur - m.awake) / dur) * 1000) / 10, sleep_score: 62 + Math.round(R() * 30), sleep_duration: dur, stage_analyzed_type: 1, total_rem_duration: m.rem, total_light_duration: m.light, 'com.samsung.health.sleep.create_sh_ver': 6315006, 'com.samsung.health.sleep.start_time': utc(a), 'com.samsung.health.sleep.update_time': utc(t), 'com.samsung.health.sleep.create_time': utc(t), 'com.samsung.health.sleep.time_offset': offStr(off), 'com.samsung.health.sleep.deviceuuid': WATCH, 'com.samsung.health.sleep.pkg_name': pkg, 'com.samsung.health.sleep.end_time': utc(t), 'com.samsung.health.sleep.datauuid': sid });
      // a short nap now and then
      if (!old && weekend && R() < 0.2) {
        const na = at(day, 14 * 60 + Math.round(R() * 60)), nb = na + (20 + Math.round(R() * 30)) * 60000;
        SLP.add({ factor_02: 0, factor_05: 2, total_rem_duration: 0, total_light_duration: Math.round((nb - na) / 60000) - 2, sleep_duration: Math.round((nb - na) / 60000), 'com.samsung.health.sleep.start_time': utc(na), 'com.samsung.health.sleep.end_time': utc(nb), 'com.samsung.health.sleep.time_offset': offStr(off), 'com.samsung.health.sleep.datauuid': id() });
      }
      // ---- heart rate through the day (every two hours, hourly summaries) and the sleeping heart rate
      if (!old || R() < 0.3) {
        const rest = 58 - yearFrac * 1.2 + season * 0.8 + (R() - 0.5) * 4;
        for (let h = 0; h < 24; h += 2) {
          const avg = Math.round(rest + (h >= 8 && h <= 21 ? 14 + R() * 18 : R() * 4));
          const s = at(day, h * 60);
          HR.add({ source: 0, tag_id: 21313, 'com.samsung.health.heart_rate.create_sh_ver': 6315006, 'com.samsung.health.heart_rate.start_time': utc(s), 'com.samsung.health.heart_rate.end_time': utc(s + 3599000), 'com.samsung.health.heart_rate.update_time': utc(s + 3600000), 'com.samsung.health.heart_rate.create_time': utc(s + 3600000), 'com.samsung.health.heart_rate.max': avg + Math.round(8 + R() * 25), 'com.samsung.health.heart_rate.min': Math.max(40, avg - Math.round(4 + R() * 8)), 'com.samsung.health.heart_rate.time_offset': offStr(off), 'com.samsung.health.heart_rate.deviceuuid': WATCH, 'com.samsung.health.heart_rate.pkg_name': pkg, 'com.samsung.health.heart_rate.datauuid': id(), 'com.samsung.health.heart_rate.heart_rate': avg, 'com.samsung.health.heart_rate.binning_data': `${id()}.binning_data.json`, heart_rate: avg, start_time: utc(s), end_time: utc(s + 3599000), time_offset: offStr(off), deviceuuid: PHONE, datauuid: id() });
        }
        if (!old) {
          VIT.add({ total_score: 60 + Math.round(R() * 35), activity_score: 50 + Math.round(R() * 45), sleep_score: 60 + Math.round(R() * 35), shr_score: 70 + Math.round(R() * 25), shr_value: Math.round((rest - 2) * 10) / 10, shrv_value: Math.round(38 + R() * 25), deviceuuid: WATCH, pkg_name: pkg, datauuid: id(), day_time: dayTime(day) });
          const sp = at(addDays(day, -1), bed + 60);
          SPO.add({ tag_id: 31301, 'com.samsung.health.oxygen_saturation.spo2': Math.round((95.5 + R() * 2.4) * 10) / 10, 'com.samsung.health.oxygen_saturation.min': 90 + Math.round(R() * 4), 'com.samsung.health.oxygen_saturation.max': 99, 'com.samsung.health.oxygen_saturation.heart_rate': Math.round(rest), 'com.samsung.health.oxygen_saturation.coverage_rate': 90 + Math.round(R() * 10), 'com.samsung.health.oxygen_saturation.low_duration': Math.round(R() * 200), 'com.samsung.health.oxygen_saturation.start_time': utc(sp), 'com.samsung.health.oxygen_saturation.end_time': utc(sp + 5 * 3600e3), 'com.samsung.health.oxygen_saturation.time_offset': offStr(off), 'com.samsung.health.oxygen_saturation.deviceuuid': WATCH, 'com.samsung.health.oxygen_saturation.pkg_name': pkg, 'com.samsung.health.oxygen_saturation.datauuid': id(), 'com.samsung.health.oxygen_saturation.binning': `${id()}.binning.json` });
          for (let h = 8; h <= 22; h += 2) {
            const sc = Math.max(0, Math.min(100, Math.round(28 + (weekend ? -6 : 8) + (h >= 10 && h <= 17 ? 10 : 0) + (R() - 0.5) * 34)));
            const s = at(day, h * 60);
            STR.add({ score: sc, min: Math.max(0, sc - 12), max: Math.min(100, sc + 18), algorithm: 3, tag_id: 0, start_time: utc(s), end_time: utc(s + 3599000), time_offset: offStr(off), deviceuuid: WATCH, pkg_name: pkg, datauuid: id(), binning_data: `${id()}.binning_data.json` });
          }
        }
      }
    }
    // ---- weight (three mornings a week), blood pressure (two evenings a week in some months)
    kg += -0.004 + season * 0.006 + (R() - 0.5) * 0.08;
    if (dow % 2 === 1 || (old && dow === 6)) WT.add({ start_time: utc(at(day, 7 * 60 + 10 + Math.round(R() * 30))), body_fat: old ? '' : Math.round((24 - yearFrac * 0.8 + (R() - 0.5)) * 10) / 10, height: 178, muscle_mass: old ? '' : Math.round(kg * 0.42 * 10) / 10, skeletal_muscle_mass: old ? '' : Math.round(kg * 0.41 * 10) / 10, weight: Math.round((kg + (R() - 0.5) * 0.9) * 10) / 10, time_offset: offStr(off), deviceuuid: PHONE, pkg_name: pkg, datauuid: id() });
    if (!old && (dow === 2 || dow === 5) && +day.slice(5, 7) % 3 !== 0) BP.add({ 'com.samsung.health.blood_pressure.systolic': Math.round(124 + season * 3 + (R() - 0.5) * 14), 'com.samsung.health.blood_pressure.diastolic': Math.round(80 + (R() - 0.5) * 10), 'com.samsung.health.blood_pressure.pulse': Math.round(66 + R() * 10), 'com.samsung.health.blood_pressure.mean': 0, 'com.samsung.health.blood_pressure.medication': 0, 'com.samsung.health.blood_pressure.start_time': utc(at(day, 20 * 60 + Math.round(R() * 60))), 'com.samsung.health.blood_pressure.time_offset': offStr(off), 'com.samsung.health.blood_pressure.deviceuuid': PHONE, 'com.samsung.health.blood_pressure.pkg_name': pkg, 'com.samsung.health.blood_pressure.datauuid': id() });
    // ---- workouts (about three a week) and walks the phone noticed on its own
    if (!off2 && R() < (old ? 0.22 : 0.42)) {
      const type = types[Math.floor(R() * types.length)];
      const mins = type === 13001 ? 90 + R() * 90 : type === 9002 ? 30 + R() * 30 : 25 + R() * 50;
      const s = at(day, (weekend ? 9 * 60 : 18 * 60 + 30) + Math.round(R() * 60));
      const km = type === 1002 ? mins / 5.6 : type === 11007 ? mins / 2.3 : type === 13001 ? mins / 14 : type === 14001 ? mins / 40 : 0;
      const o = { exercise_type: type, source_type: 1, duration: Math.round(mins * 60000), distance: km ? Math.round(km * 1000) : '', calorie: Math.round(mins * (type === 1002 ? 11 : 7)), mean_heart_rate: old ? '' : Math.round(118 + R() * 30), max_heart_rate: old ? '' : Math.round(150 + R() * 30), min_heart_rate: old ? '' : 88, start_time: utc(s), end_time: utc(s + mins * 60000 + 120000), time_offset: offStr(off), deviceuuid: WATCH, pkg_name: pkg, datauuid: id(), live_data: `${id()}.com.samsung.health.exercise.live_data.json` };
      EX.add(Object.fromEntries(Object.entries(o).flatMap(([k, v]) => [[k, v], [`com.samsung.health.exercise.${k}`, v]])));
    }
    if (!old && !off2 && R() < 0.25) {
      const s = at(day, 12 * 60 + Math.round(R() * 120)), mins = 12 + R() * 25;
      const o = { exercise_type: 1001, source_type: 4, duration: Math.round(mins * 60000), distance: Math.round(mins * 80), calorie: Math.round(mins * 4), start_time: utc(s), end_time: utc(s + mins * 60000), time_offset: offStr(off), deviceuuid: PHONE, pkg_name: pkg, datauuid: id() };
      EX.add(Object.fromEntries(Object.entries(o).flatMap(([k, v]) => [[k, v], [`com.samsung.health.exercise.${k}`, v]])));
    }
  }
  if (!old) put(SD);
  put(TR); put(SLP); put(HR); put(WT); put(EX);
  if (!old) { put(STG); put(VIT); put(SPO); put(STR); put(BP); }
  // files a real export holds that Wristory never opens
  const dev = new Table('com.samsung.health.device_profile', ['deviceuuid', 'device_group', 'name', 'model', 'connectivity_type', 'fixed_name', 'datauuid']);
  dev.add({ deviceuuid: WATCH, device_group: 360003, name: 'Sample watch', model: 'SM-R000', connectivity_type: 'bt', fixed_name: 'Sample watch', datauuid: id() });
  put(dev);
  const badge = new Table('com.samsung.shealth.badge', ['badge_type', 'start_time', 'datauuid']);
  badge.add({ badge_type: 'steps_10000', start_time: utc(at(end, 600)), datauuid: id() });
  put(badge);
  files[`${folder}/jsons/com.samsung.shealth.exercise/0/${'0'.repeat(8)}-sample.com.samsung.health.exercise.live_data.json`] = '[{"heart_rate":120,"start_time":0}]';
  return { folder, files };
}
