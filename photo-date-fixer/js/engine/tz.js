// Time zone of a place and the local clock reading at a UTC instant, including daylight saving time. Zone boundaries come
// from tz-lookup (CC0); the rules for each zone come from the browser's own time zone database through Intl.
import tzlookup from '../../vendor/tz-lookup.js';
import { pad2 } from './bytes.js';
import { formatter, isValidZone } from './zones.js';

export { isValidZone, deviceZone, zoneList } from './zones.js';

export function zoneAt(lat, lon) {
  try {
    const z = tzlookup(lat, lon);
    if (isValidZone(z)) return { tz: z, approx: false };
  } catch {
    /* outside the data */
  }
  // a zone name the browser does not know (rare, renamed zones): nautical zone from the longitude
  const h = Math.max(-12, Math.min(14, Math.round(lon / 15)));
  const etc = h === 0 ? 'Etc/GMT' : `Etc/GMT${h > 0 ? '-' : '+'}${Math.abs(h)}`;
  return { tz: etc, approx: true };
}

// Local wall time (as UTC-encoded milliseconds) and offset in minutes for an instant in a zone.
export function localAt(utcMs, tz) {
  const f = formatter(tz) ?? formatter('UTC');
  const parts = {};
  for (const p of f.formatToParts(new Date(utcMs))) if (p.type !== 'literal') parts[p.type] = +p.value;
  const wallMs = Date.UTC(parts.year, parts.month - 1, parts.day, parts.hour === 24 ? 0 : parts.hour, parts.minute, parts.second);
  const whole = Math.floor(utcMs / 1000) * 1000;
  const offsetMin = Math.round((wallMs - whole) / 60000);
  return { wallMs, offsetMin };
}

export function offsetText(min) {
  const sign = min < 0 ? '-' : '+';
  const a = Math.abs(min);
  return `${sign}${pad2(Math.floor(a / 60))}:${pad2(a % 60)}`;
}
