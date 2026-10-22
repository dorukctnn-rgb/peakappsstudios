/* Wristory's number, date and duration formats for one page language (used by the page, the PDF and the poster). */
export function makeFmt(T, LANG) {
  const NF = new Intl.NumberFormat(T.locale, { maximumFractionDigits: 0 });
  const NF1 = new Intl.NumberFormat(T.locale, { minimumFractionDigits: 1, maximumFractionDigits: 1 });
  const NFS = new Intl.NumberFormat(T.locale, { minimumFractionDigits: 1, maximumFractionDigits: 1, signDisplay: 'exceptZero' });
  const DF = new Intl.DateTimeFormat(T.locale, { day: 'numeric', month: 'short', year: 'numeric', timeZone: 'UTC' });
  const DFL = new Intl.DateTimeFormat(T.locale, { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric', timeZone: 'UTC' });
  const DFS = new Intl.DateTimeFormat(T.locale, { day: 'numeric', month: 'short', timeZone: 'UTC' });
  const MF = new Intl.DateTimeFormat(T.locale, { month: 'short', timeZone: 'UTC' });
  const F = {
    n: v => (v === null || v === undefined ? '' : NF.format(v)),
    d1: v => (v === null || v === undefined ? '' : NF1.format(v)),
    date: d => (d ? DF.format(new Date(d + 'T00:00:00Z')) : ''),
    long: d => (d ? DFL.format(new Date(d + 'T00:00:00Z')) : ''),
    short: d => (d ? DFS.format(new Date(d + 'T00:00:00Z')) : ''),
    month: i => MF.format(new Date(Date.UTC(2020, i, 1))),
    clock: m => (m === null || m === undefined ? '' : `${String(Math.floor(m / 60) % 24).padStart(2, '0')}:${String(Math.round(m % 60) % 60).padStart(2, '0')}`),
    dur: m => { if (m === null || m === undefined) return ''; const t = Math.round(m); return T.dur(Math.floor(t / 60), t % 60); },
    kg: v => (v === null || v === undefined ? '' : `${NF1.format(v)} kg`),
    kgSigned: v => `${NFS.format(v)} kg`,
    pct: v => (v === null || v === undefined ? '' : `${Number.isInteger(v) ? NF.format(v) : NF1.format(v)}${LANG === 'de' ? ' %' : '%'}`),
    km: v => `${NF1.format(v)} km`,
    pct1: v => (v === null || v === undefined ? '' : `${NF1.format(v)}${LANG === 'de' ? ' %' : '%'}`),
  };
  return F;
}
