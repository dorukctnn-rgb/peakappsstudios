/* Number, distance, time and date formats for the page, the cards and the poster, in the page's language and in
 * kilometres or miles. */
import { LOCALE, strings, fill } from './i18n.js';
import { CAT } from './engine.js';

export function makeFmt(lang, imperial) {
  const loc = LOCALE[lang] || 'en-GB';
  const T = strings(lang);
  const nf0 = new Intl.NumberFormat(loc, { maximumFractionDigits: 0 });
  const nf1 = new Intl.NumberFormat(loc, { minimumFractionDigits: 1, maximumFractionDigits: 1 });
  const D = imperial ? 1609.344 : 1000;
  const du = imperial ? 'mi' : 'km';
  const dateF = new Intl.DateTimeFormat(loc, { day: 'numeric', month: 'long', year: 'numeric', timeZone: 'UTC' });
  const dateS = new Intl.DateTimeFormat(loc, { day: 'numeric', month: 'short', timeZone: 'UTC' });
  const monL = Array.from({ length: 12 }, (_, i) => new Intl.DateTimeFormat(loc, { month: 'long', timeZone: 'UTC' }).format(Date.UTC(2026, i, 15)));
  const monS = Array.from({ length: 12 }, (_, i) => new Intl.DateTimeFormat(loc, { month: 'short', timeZone: 'UTC' }).format(Date.UTC(2026, i, 15)).replace(/\.$/, ''));
  const wdL = T.wd.split(' ');
  const wdS = Array.from({ length: 7 }, (_, i) => new Intl.DateTimeFormat(loc, { weekday: 'short', timeZone: 'UTC' }).format(Date.UTC(2026, 0, 5 + i)).replace(/\.$/, ''));
  const f = {
    lang, loc, imperial, T, du, eu: imperial ? 'ft' : 'm', monL, monS, wdL, wdS,
    n: x => nf0.format(Math.round(x)),
    n1: x => nf1.format(x),
    distNum: m => { const v = m / D; return v >= 100 ? nf0.format(Math.round(v)) : nf1.format(Math.round(v * 10) / 10); },
    dist: m => `${f.distNum(m)} ${du}`,
    distRound: m => `${nf0.format(Math.round(m / D))} ${du}`,
    elev: m => `${nf0.format(Math.round(imperial ? m / 0.3048 : m))} ${imperial ? 'ft' : 'm'}`,
    elevNum: m => nf0.format(Math.round(imperial ? m / 0.3048 : m)),
    hours: s => fill(T.hours, { h: nf0.format(Math.round(s / 3600)) }),
    hm: s => { const h = Math.floor(s / 3600), m = Math.round((s - h * 3600) / 60); return m === 60 ? fill(T.hm, { h: nf0.format(h + 1), m: '0' }) : fill(T.hm, { h: nf0.format(h), m: String(m) }); },
    dur: s => { s = Math.round(s); const h = Math.floor(s / 3600), m = Math.floor((s % 3600) / 60), x = s % 60; const p = v => String(v).padStart(2, '0'); return h ? `${h}:${p(m)}:${p(x)}` : `${m}:${p(x)}`; },
    date: iso => { const [y, m, d] = iso.split('-').map(Number); return dateF.format(Date.UTC(y, m - 1, d)); },
    dateShort: iso => { const [y, m, d] = iso.split('-').map(Number); return dateS.format(Date.UTC(y, m - 1, d)); },
    // pace for runs, walks and swims, speed for the rest
    pace: (m, s, cat) => {
      if (!(m > 0 && s > 0)) return '';
      if (cat === CAT.SWIM) { const per = imperial ? 91.44 : 100; const sec = s / (m / per); return `${f.dur(sec)} /100 ${imperial ? 'yd' : 'm'}`; }
      if (cat === CAT.RUN || cat === CAT.WALK) { const sec = s / (m / D); return `${f.dur(sec)} /${du}`; }
      return `${nf1.format((m / D) / (s / 3600))} ${imperial ? 'mph' : 'km/h'}`;
    },
    distLabel: m => (m >= D * 10 || m % D === 0 ? `${nf0.format(m / D)} ${du}` : `${nf1.format(m / D)} ${du}`),
  };
  return f;
}
