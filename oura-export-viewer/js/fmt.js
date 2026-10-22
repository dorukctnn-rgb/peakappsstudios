/* Numbers, durations, dates and clock times in the page's language. */
import { fill } from './i18n.js';

export function makeFmt(T, opts = {}) {
  const loc = T.locale;
  const nf = (d) => new Intl.NumberFormat(loc, { maximumFractionDigits: d, minimumFractionDigits: d });
  const n0 = nf(0), n1 = nf(1), n2 = nf(2);
  const fahrenheit = !!opts.fahrenheit;
  const dateLong = new Intl.DateTimeFormat(loc, { day: 'numeric', month: 'long', year: 'numeric', timeZone: 'UTC' });
  const dateShort = new Intl.DateTimeFormat(loc, { day: 'numeric', month: 'short', timeZone: 'UTC' });
  const dateWd = new Intl.DateTimeFormat(loc, { weekday: 'short', day: 'numeric', month: 'short', timeZone: 'UTC' });
  const month = new Intl.DateTimeFormat(loc, { month: 'short', timeZone: 'UTC' });
  const monthYear = new Intl.DateTimeFormat(loc, { month: 'short', year: 'numeric', timeZone: 'UTC' });
  const d = s => new Date(s + 'T00:00:00Z');
  const ok = v => v !== null && v !== undefined && Number.isFinite(v);
  const F = {
    fahrenheit,
    n: v => (ok(v) ? n0.format(Math.round(v)) : ''),
    n1: v => (ok(v) ? n1.format(v) : ''),
    n2: v => (ok(v) ? n2.format(v) : ''),
    dur: s => { if (!ok(s)) return ''; const m = Math.round(s / 60); return m >= 60 ? fill(T.hours, { h: Math.floor(m / 60), m: m % 60 }) : fill(T.minutes, { m }); },
    durShort: s => { if (!ok(s)) return ''; const m = Math.round(s / 60); return fill(T.hoursShort, { h: Math.floor(m / 60), m: String(m % 60).padStart(2, '0') }); },
    hoursDec: s => (ok(s) ? n1.format(s / 3600) : ''),
    min: s => (ok(s) ? fill(T.minutes, { m: Math.round(s / 60) }) : ''),
    bpm: v => (ok(v) ? fill(T.bpm, { v: n0.format(Math.round(v)) }) : ''),
    ms: v => (ok(v) ? fill(T.ms, { v: n0.format(Math.round(v)) }) : ''),
    pct: v => (ok(v) ? fill(T.pct, { v: n0.format(Math.round(v)) }) : ''),
    pct1: v => (ok(v) ? fill(T.pct, { v: n1.format(v) }) : ''),
    perMin: v => (ok(v) ? fill(T.perMin, { v: n1.format(v) }) : ''),
    kcal: v => (ok(v) ? fill(T.kcal, { v: n0.format(Math.round(v)) }) : ''),
    km: m => (ok(m) ? fill(T.km, { v: n1.format(m / 1000) }) : ''),
    // a temperature difference: Celsius by default, Fahrenheit on request (a difference: times 1.8, no offset)
    dev: v => { if (!ok(v)) return ''; const x = fahrenheit ? v * 1.8 : v; const s = (x > 0 ? '+' : x < 0 ? '−' : '') + n2.format(Math.abs(x)); return fill(fahrenheit ? T.degF : T.degC, { v: s }); },
    temp: v => { if (!ok(v)) return ''; return fill(fahrenheit ? T.degF : T.degC, { v: n1.format(fahrenheit ? v * 1.8 + 32 : v) }); },
    clock: m => { if (!ok(m)) return ''; const t = ((Math.round(m) % 1440) + 1440) % 1440; return `${String(Math.floor(t / 60)).padStart(2, '0')}:${String(t % 60).padStart(2, '0')}`; },
    date: s => (s ? dateLong.format(d(s)) : ''),
    dateShort: s => (s ? dateShort.format(d(s)) : ''),
    dateWd: s => (s ? dateWd.format(d(s)) : ''),
    month: s => month.format(d(s)),
    monthYear: s => monthYear.format(d(s)),
  };
  // one formatter per metric key
  F.metric = (key, v) => {
    switch (key) {
      case 'total': case 'deep': case 'rem': case 'light': case 'awake': case 'inBed': return F.dur(v);
      case 'lat': case 'stressHigh': case 'recoveryHigh': case 'highT': case 'medT': case 'lowT': return F.min(v);
      case 'sedT': return F.dur(v);
      case 'hrv': return F.ms(v);
      case 'hrLow': case 'hrAvg': case 'dayHr': return F.bpm(v);
      case 'tempDev': return F.dev(v);
      case 'skinTemp': return F.temp(v);
      case 'spo2': return F.pct1(v);
      case 'eff': return F.pct(v);
      case 'breath': return F.perMin(v);
      case 'activeCal': case 'totalCal': return F.kcal(v);
      case 'walkM': return F.km(v);
      case 'bedtime': case 'wake': return F.clock(v);
      case 'vo2max': return F.n1(v);
      default: return F.n(v);
    }
  };
  // the value a chart plots (durations in hours, temperature in the chosen unit)
  F.plot = (key, v) => {
    if (!ok(v)) return null;
    if (['total', 'deep', 'rem', 'light', 'awake', 'inBed', 'sedT'].includes(key)) return v / 3600;
    if (['lat', 'stressHigh', 'recoveryHigh'].includes(key)) return v / 60;
    if (key === 'tempDev') return fahrenheit ? v * 1.8 : v;
    if (key === 'skinTemp') return fahrenheit ? v * 1.8 + 32 : v;
    if (key === 'bedtime') return v / 60; // hours after midnight of the evening (22.5 = 22:30, 25 = 01:00)
    return v;
  };
  F.axis = (key, v) => {
    if (['total', 'deep', 'rem', 'light', 'awake', 'inBed', 'sedT'].includes(key)) return n1.format(v) + ' h';
    if (key === 'bedtime') return F.clock(v * 60);
    if (key === 'tempDev') return (v > 0 ? '+' : v < 0 ? '−' : '') + n1.format(Math.abs(v)) + (fahrenheit ? '°F' : '°C');
    if (key === 'spo2') return n0.format(v) + '%';
    if (Math.abs(v) >= 1000) return n0.format(v);
    return Math.abs(v) < 10 && v % 1 ? n1.format(v) : n0.format(v);
  };
  return F;
}
