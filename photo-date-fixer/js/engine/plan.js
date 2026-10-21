// Turns match results into a write plan: the instant, the time zone, the local clock time, the new file name, and the
// CSV report rows. Pure functions (no I/O) so they run in the worker and in Node tests alike.
import { pad2, wallText } from './bytes.js';
import { localAt, offsetText, zoneAt } from './tz.js';
import { normId } from './match.js';

export const STATUS_ORDER = ['exact', 'ambiguous', 'zipTime', 'nameDate', 'unknown'];

function shortId(m, used) {
  const raw = normId(m.id ?? '') || normId(m.stem);
  let s = (raw.slice(0, 8) || 'memory').toLowerCase();
  if (!used.has(s)) return s;
  let k = 2;
  while (used.has(`${s}-${k}`)) k++;
  return `${s}-${k}`;
}

// Same 2-second window with different places: no GPS is written, but if every candidate entry lies in the same time zone
// (two photos a few streets apart), that zone still gives the right local time.
export function sharedZone(locs) {
  if (!locs?.length || !locs.every(Boolean)) return null;
  const zones = locs.map((l) => zoneAt(l.lat, l.lon));
  return zones.every((z) => !z.approx && z.tz === zones[0].tz) ? zones[0].tz : null;
}

export function planWrites(match, { fallbackTz, pairs }) {
  const items = [];
  const usedNames = new Set();
  const usedIds = new Set();
  const mk = (m, res) => {
    let tz = null;
    let approx = false;
    let wallMs;
    let offset = null;
    let utcMs = res.utcMs;
    if (utcMs != null) {
      if (res.loc) ({ tz, approx } = zoneAt(res.loc.lat, res.loc.lon));
      else tz = sharedZone(res.candLocs) ?? fallbackTz;
      const l = localAt(utcMs, tz);
      wallMs = l.wallMs;
      offset = offsetText(l.offsetMin);
    } else if (res.nameDay != null) {
      // only the calendar day is known: noon on that day in the chosen zone
      wallMs = res.nameDay + 12 * 3600e3;
      tz = fallbackTz;
      const probe = localAt(res.nameDay + 12 * 3600e3, tz);
      offset = offsetText(probe.offsetMin);
      utcMs = wallMs - probe.offsetMin * 60000;
    } else {
      wallMs = null;
    }
    let id = shortId(m, usedIds);
    usedIds.add(id);
    const year = wallMs != null ? new Date(wallMs).getUTCFullYear() : 'undated';
    const stamp = wallMs != null ? wallText(wallMs, '-', '_', '-') : m.stem.slice(0, 40);
    let name = `${year}/${stamp}_${id}${m.ext || ''}`;
    while (usedNames.has(name)) {
      id = `${id}x`;
      name = `${year}/${stamp}_${id}${m.ext || ''}`;
    }
    usedNames.add(name);
    return { media: m, status: res.status, utcMs, wallMs, offset, tz, approxZone: approx, loc: res.loc ?? null, locDropped: Boolean(res.locDropped), name, candidates: res.candidates ?? 0, duplicate: Boolean(res.duplicate), rec: res.rec ?? null, overlays: [] };
  };
  for (const res of match.results) {
    const it = mk(res.media, res);
    for (const ov of pairs?.byMain.get(res.media.key) ?? []) {
      const base = it.name.replace(/\.[a-z0-9]+$/i, '');
      it.overlays.push({ media: ov, name: `${base}-overlay${ov.ext || '.png'}` });
    }
    items.push(it);
  }
  for (const ov of pairs?.orphans ?? []) {
    const t = ov.zipUtcMs;
    items.push(mk(ov, t != null ? { status: 'zipTime', utcMs: t, loc: null } : { status: 'unknown', utcMs: null, loc: null }));
  }
  return items;
}

export function summarize(items, noMedia) {
  const s = { photos: 0, videos: 0, overlays: 0, exact: 0, ambiguous: 0, zipTime: 0, nameDate: 0, unknown: 0, noMedia: noMedia.length, withPlace: 0, bytes: 0 };
  for (const it of items) {
    if (it.media.type === 'Video') s.videos++;
    else s.photos++;
    s[it.status]++;
    if (it.loc) s.withPlace++;
    s.overlays += it.overlays.length;
    s.bytes += it.media.entry.usize;
    for (const o of it.overlays) s.bytes += o.media.entry.usize;
  }
  return s;
}

const csvCell = (v) => {
  const s = v == null ? '' : String(v);
  return /[",\r\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
};
const utcText = (ms) => (ms == null ? '' : `${wallText(ms)} UTC`);

export const CSV_HEADER = ['status', 'output_file', 'part', 'source_zip', 'source_file', 'media_type', 'snapchat_time_utc', 'local_time_written', 'utc_offset', 'time_zone', 'latitude', 'longitude', 'overlay_files', 'note'];

export function csvRows(items, noMedia, { zipNames, partOf, notes }) {
  const rows = [CSV_HEADER];
  for (const it of items) {
    rows.push([
      it.status,
      it.name,
      partOf?.get(it.name) ?? '',
      zipNames[it.media.zip] ?? '',
      it.media.path,
      it.media.type,
      utcText(it.utcMs),
      it.wallMs != null ? wallText(it.wallMs) : '',
      it.offset ?? '',
      it.tz ?? '',
      it.loc ? it.loc.lat.toFixed(6) : '',
      it.loc ? it.loc.lon.toFixed(6) : '',
      it.overlays.map((o) => o.name).join(' '),
      notes?.get(it.name) ?? '',
    ]);
  }
  for (const r of noMedia) {
    rows.push(['entryWithoutFile', '', '', '', '', r.type, utcText(r.utcMs), '', '', '', r.loc ? r.loc.lat.toFixed(6) : '', r.loc ? r.loc.lon.toFixed(6) : '', '', 'listed in memories_history but no file in these ZIPs']);
  }
  return `﻿${rows.map((r) => r.map(csvCell).join(',')).join('\r\n')}\r\n`;
}

export { humanSize } from '../format.js';

export const partFileName = (n, stamp) => `photo-date-fixer-${stamp}-part-${pad2(n)}.zip`;
