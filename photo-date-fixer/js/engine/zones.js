// Time zone names the browser knows, without the boundary data (the page needs these; the worker needs tz.js too).

const fmtCache = new Map();
export function formatter(tz) {
  let f = fmtCache.get(tz);
  if (f === undefined) {
    try {
      f = new Intl.DateTimeFormat('en-US', {
        timeZone: tz,
        hourCycle: 'h23',
        year: 'numeric',
        month: '2-digit',
        day: '2-digit',
        hour: '2-digit',
        minute: '2-digit',
        second: '2-digit',
      });
    } catch {
      f = null;
    }
    fmtCache.set(tz, f);
  }
  return f;
}

export function isValidZone(tz) {
  return Boolean(tz && formatter(tz));
}

export function deviceZone() {
  try {
    const z = Intl.DateTimeFormat().resolvedOptions().timeZone;
    return isValidZone(z) ? z : 'UTC';
  } catch {
    return 'UTC';
  }
}

// IANA zone list for the fallback picker (browsers with Intl.supportedValuesOf), else a short list
export function zoneList() {
  try {
    if (typeof Intl.supportedValuesOf === 'function') return Intl.supportedValuesOf('timeZone');
  } catch {
    /* older engine */
  }
  return ['UTC', 'Europe/London', 'Europe/Paris', 'Europe/Amsterdam', 'Europe/Istanbul', 'America/New_York', 'America/Chicago', 'America/Denver', 'America/Los_Angeles', 'Australia/Sydney', 'Asia/Tokyo'];
}
