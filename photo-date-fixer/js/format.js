// Number, size and plural formatting for the page. No dependencies, so the page does not load the time zone data.

// Decimal units (1 MB = 1,000,000 bytes), the way file managers on phones and Macs count.
export function humanSize(bytes, locale = 'en', units = ['B', 'KB', 'MB', 'GB', 'TB']) {
  let v = Math.max(0, Number(bytes) || 0);
  let i = 0;
  while (v >= 1000 && i < units.length - 1) {
    v /= 1000;
    i++;
  }
  let n;
  try {
    n = new Intl.NumberFormat(locale, { maximumFractionDigits: v < 10 && i > 0 ? 1 : 0 }).format(v);
  } catch {
    n = String(Math.round(v * 10) / 10);
  }
  return `${n}\u00a0${units[i]}`;
}

// Plural category for a count. Uses Intl.PluralRules when the browser has it; otherwise "one" for 1 and "other" for
// everything else, which is right for English, Dutch and Turkish and close enough for French.
export function pluralCategory(n, locale = 'en') {
  try {
    if (typeof Intl !== 'undefined' && typeof Intl.PluralRules === 'function') return new Intl.PluralRules(locale).select(n);
  } catch {
    /* unknown locale */
  }
  return n === 1 ? 'one' : 'other';
}

// A string table entry may be plain text or { one, other, ... } keyed by plural category.
export function pickForm(entry, n, locale = 'en') {
  if (entry == null || typeof entry === 'string') return entry;
  const cat = pluralCategory(n, locale);
  return entry[cat] ?? entry.other ?? Object.values(entry)[0];
}

export function fill(text, vars = {}) {
  return String(text).replace(/\{(\w+)\}/g, (_, v) => (vars[v] ?? `{${v}}`));
}
