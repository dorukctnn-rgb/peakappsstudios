// Pairs each photo or video in the export with its entry in the memories list.
// Current export format: the media files sit inside the ZIPs, the list has no file names, and Snapchat sets each ZIP
// entry's time to the capture time in UTC (2-second precision in the MS-DOS fields, 1 second in 0x5455/NTFS fields).
// So a file matches the list entry of the same media type whose time falls in that window. If an id is available on
// both sides (older exports with download links) the id wins. calibrate() guards the UTC assumption: it tries whole
// quarter-hour shifts and keeps one only when it clearly matches more files than no shift does.

const MEDIA_RE = /\.(jpe?g|png|webp|heic|mp4|mov|m4v)$/i;
const VIDEO_RE = /\.(mp4|mov|m4v)$/i;
const NAME_DATE_RE = /(?:^|\/)(\d{4})-(\d{2})-(\d{2})[_ -]/;
const UUID_RE = /([0-9a-f]{8}-?[0-9a-f]{4}-?[0-9a-f]{4}-?[0-9a-f]{4}-?[0-9a-f]{12})/i;
export const SNAPCHAT_START = Date.UTC(2011, 0, 1);

export const normId = (s) => String(s ?? '').toLowerCase().replace(/[^0-9a-z]/g, '');

export function isMemoryMedia(path) {
  if (!MEDIA_RE.test(path)) return false;
  const low = path.toLowerCase();
  if (/(^|\/)(chat_media|shared_story|story|spotlight|my_ai|bitmoji)[^/]*\//.test(low)) return false;
  return /(^|\/)memories[^/]*\//.test(low) || /-(main|overlay)\.[a-z0-9]+$/i.test(low);
}

export function describeMedia(zipIndex, entry) {
  const path = entry.name;
  const base = path.split('/').pop();
  const ext = (/\.[a-z0-9]+$/i.exec(base)?.[0] ?? '').toLowerCase();
  const overlay = /-overlay\.[a-z0-9]+$/i.test(base);
  const stem = base.replace(/-(main|overlay)(?=\.[a-z0-9]+$)/i, '').replace(/\.[a-z0-9]+$/i, '');
  const nd = NAME_DATE_RE.exec(path);
  const id = UUID_RE.exec(base)?.[1] ?? null;
  return {
    key: `${zipIndex}/${path}`,
    zip: zipIndex,
    entry,
    path,
    base,
    ext,
    stem,
    kind: overlay ? 'overlay' : 'main',
    type: VIDEO_RE.test(base) ? 'Video' : 'Image',
    id,
    nameDate: nd ? `${nd[1]}-${nd[2]}-${nd[3]}` : null,
    zipUtcMs: entry.extUtcMs ?? entry.wallMs ?? null,
    fineTime: entry.extUtcMs != null,
  };
}

function lowerBound(arr, t) {
  let lo = 0;
  let hi = arr.length;
  while (lo < hi) {
    const mid = (lo + hi) >> 1;
    if (arr[mid].utcMs < t) lo = mid + 1;
    else hi = mid;
  }
  return lo;
}
function inWindow(sorted, a, b) {
  const out = [];
  for (let i = lowerBound(sorted, a); i < sorted.length && sorted[i].utcMs <= b; i++) out.push(sorted[i]);
  return out;
}
const windowOf = (m, t) => (m.fineTime ? [t - 1000, t + 1000] : [t - 1000, t + 2999]);

function byTypeSorted(records) {
  const map = new Map([
    ['Image', []],
    ['Video', []],
  ]);
  for (const r of records) map.get(r.type).push(r);
  for (const list of map.values()) list.sort((a, b) => a.utcMs - b.utcMs || a.i - b.i);
  return map;
}

export function calibrate(records, media, { maxSample = 3000 } = {}) {
  const mains = media.filter((m) => m.kind === 'main' && m.zipUtcMs != null);
  if (!records.length || !mains.length) return { offsetMin: 0, hits: 0, zeroHits: 0, of: mains.length };
  const step = Math.max(1, Math.floor(mains.length / maxSample));
  const sample = mains.filter((_, i) => i % step === 0);
  const idx = byTypeSorted(records);
  const score = (o) => {
    let hits = 0;
    for (const m of sample) {
      const t = m.zipUtcMs - o * 60000;
      const [a, b] = windowOf(m, t);
      const list = idx.get(m.type);
      const i = lowerBound(list, a);
      if (i < list.length && list[i].utcMs <= b) hits++;
    }
    return hits;
  };
  const zeroHits = score(0);
  let best = { offsetMin: 0, hits: zeroHits };
  for (let o = -14 * 60; o <= 14 * 60; o += 15) {
    if (o === 0) continue;
    const h = score(o);
    if (h > best.hits) best = { offsetMin: o, hits: h };
  }
  // keep a shift only when it is clearly better than none
  const strong = best.offsetMin !== 0 && best.hits >= Math.max(3, Math.ceil(zeroHits * 1.5)) && best.hits >= sample.length * 0.3;
  return { offsetMin: strong ? best.offsetMin : 0, hits: strong ? best.hits : zeroHits, zeroHits, of: sample.length };
}

const sameLoc = (a, b) => (!a && !b) || (a && b && Math.abs(a.lat - b.lat) < 1e-5 && Math.abs(a.lon - b.lon) < 1e-5);

export function matchAll(records, media, { offsetMin = 0, now = Date.now() } = {}) {
  const idx = byTypeSorted(records);
  const used = new Uint8Array(records.length);
  const byMid = new Map();
  for (const r of records) if (r.mid) byMid.set(normId(r.mid), r);
  const mains = media.filter((m) => m.kind === 'main');
  mains.sort((a, b) => (a.zipUtcMs ?? 0) - (b.zipUtcMs ?? 0) || (a.key < b.key ? -1 : 1));
  const results = [];
  const plausible = (t) => t >= SNAPCHAT_START && t <= now + 2 * 86400e3;
  for (const m of mains) {
    let res = null;
    if (m.id && byMid.size) {
      const r = byMid.get(normId(m.id));
      if (r && r.type === m.type && !used[r.i]) {
        used[r.i] = 1;
        res = { status: 'exact', rec: r, utcMs: r.utcMs, loc: r.loc, by: 'id', candidates: 1 };
      }
    }
    if (!res && m.zipUtcMs != null) {
      const t = m.zipUtcMs - offsetMin * 60000;
      const [a, b] = windowOf(m, t);
      const cands = inWindow(idx.get(m.type), a, b);
      if (cands.length) {
        const center = m.fineTime ? t : t + 1000;
        const free = cands.filter((r) => !used[r.i]);
        const pool = (free.length ? free : cands).slice().sort((x, y) => Math.abs(x.utcMs - center) - Math.abs(y.utcMs - center) || x.i - y.i);
        const r = pool[0];
        used[r.i] = 1;
        const single = cands.length === 1 && free.length === 1;
        const gpsOk = single || cands.every((c) => sameLoc(c.loc, r.loc));
        // candLocs: when the candidates disagree on the place, the planner can still use their time zone if they all share one
        res = { status: single ? 'exact' : 'ambiguous', rec: r, utcMs: r.utcMs, loc: gpsOk ? r.loc : null, locDropped: !gpsOk, candLocs: gpsOk ? null : cands.map((c) => c.loc), by: 'time', candidates: cands.length, duplicate: !free.length };
      }
    }
    if (!res) {
      const t = m.zipUtcMs != null ? m.zipUtcMs - offsetMin * 60000 : null;
      const nameDay = m.nameDate ? Date.parse(`${m.nameDate}T00:00:00Z`) : null;
      if (t != null && plausible(t) && (nameDay == null || Math.abs(t - nameDay) <= 2 * 86400e3)) res = { status: 'zipTime', utcMs: t, loc: null };
      else if (nameDay != null) res = { status: 'nameDate', utcMs: null, nameDay, loc: null };
      else res = { status: 'unknown', utcMs: null, loc: null };
    }
    results.push({ media: m, ...res });
  }
  const noMedia = records.filter((r) => !used[r.i]);
  return { results, noMedia };
}

// overlays grouped under their main file (same stem in the same folder)
export function pairOverlays(media) {
  const mains = new Map();
  for (const m of media) if (m.kind === 'main') mains.set(`${m.path.replace(/[^/]+$/, '')}${m.stem}`, m);
  const orphans = [];
  const byMain = new Map();
  for (const m of media) {
    if (m.kind !== 'overlay') continue;
    const main = mains.get(`${m.path.replace(/[^/]+$/, '')}${m.stem}`);
    if (main) {
      if (!byMain.has(main.key)) byMain.set(main.key, []);
      byMain.get(main.key).push(m);
    } else orphans.push(m);
  }
  return { byMain, orphans };
}
