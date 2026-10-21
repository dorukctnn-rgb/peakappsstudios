/* Earhours engine. Reads the streaming history in a Spotify data download into a compact store and works out the
 * numbers. No DOM, no network: it runs in the page's worker and in the Node tests.
 *
 * Formats (Spotify, "Understanding your data", support.spotify.com/us/article/understanding-your-data/, read 21 Oct 2026):
 *  - Account data, StreamingHistory_music_N.json / StreamingHistory_podcast_N.json (older: StreamingHistoryN.json), the last
 *    year: { endTime: "2026-03-04 18:22" (UTC, to the minute), artistName, trackName, msPlayed } and for podcasts
 *    { endTime, podcastName, episodeName, msPlayed }.
 *  - Extended streaming history, Streaming_History_Audio_YYYY[-YYYY]_N.json and Streaming_History_Video_*.json (older
 *    downloads: endsong_N.json), the whole life of the account: { ts: "2026-03-04T18:22:41Z", ms_played,
 *    master_metadata_track_name, master_metadata_album_artist_name, master_metadata_album_album_name, spotify_track_uri,
 *    episode_name, episode_show_name, spotify_episode_uri, audiobook_title, audiobook_chapter_title, reason_start,
 *    reason_end, shuffle, skipped, offline, incognito_mode, platform, conn_country, ip_addr... }.
 * Only the fields named in this file are read. The IP address, user agent, platform and country are never copied. */

export const KIND = { MUSIC: 0, PODCAST: 1, AUDIOBOOK: 2, OTHER: 3 };
export const STREAM_MS = 30000; // a play counts as a stream of a song from 30 seconds, as on Spotify's own charts
export const ACTIVE_DAY_MS = 60000; // a day counts towards a streak with at least one minute of listening
const F_SKIP = 1, F_FWD = 2, F_INFO = 4, F_SHUFFLE = 8;
const SRC_ACCOUNT = 0, SRC_EXTENDED = 1;
const DAY = 864e5, HOUR = 36e5;

/* ---------- which files to read ---------- */

// a file name inside the ZIP (or picked by hand) that may hold streaming history
export function isHistoryName(name) {
  const base = String(name).split(/[\\/]/).pop();
  return /\.json$/i.test(base) && /(streaminghistory|streaming_history|endsong)/i.test(base);
}

// the shape of a parsed JSON file: 'extended', 'account' or null (not listening history)
export function detectFormat(data) {
  if (!Array.isArray(data)) return null;
  const sample = data.find(r => r && typeof r === 'object');
  if (!sample) return data.length === 0 ? 'empty' : null;
  if ('ts' in sample && ('ms_played' in sample)) return 'extended';
  if ('endTime' in sample && ('msPlayed' in sample)) return 'account';
  return null;
}

/* ---------- the store ---------- */

export function createStore() {
  return {
    t: [], ms: [], kind: [], item: [], group: [], flags: [], src: [],
    groups: [], groupIdx: new Map(),
    albums: [], albumIdx: new Map(),
    items: [], itemIdx: new Map(),
    seen: new Set(),
    files: [], notUsed: [], problems: [],
    counts: { rows: 0, dup: 0, bad: 0, noName: 0, overlap: 0 },
    final: null,
  };
}

function intern(map, list, key, make) {
  let i = map.get(key);
  if (i === undefined) { i = list.length; list.push(make()); map.set(key, i); }
  return i;
}
const clean = v => (typeof v === 'string' ? v.trim() : '');

function addRow(st, src, t, ms, kind, groupName, itemName, albumName, flags, uri) {
  if (!Number.isFinite(t) || !Number.isFinite(ms) || ms < 0) { st.counts.bad++; return; }
  let g = -1, it = -1;
  if (kind !== KIND.OTHER) {
    g = intern(st.groupIdx, st.groups, kind + '\u0001' + groupName, () => ({ n: groupName, k: kind }));
    let a = -1;
    if (albumName) a = intern(st.albumIdx, st.albums, g + '\u0001' + albumName, () => ({ n: albumName, g }));
    it = intern(st.itemIdx, st.items, g + '\u0001' + itemName, () => ({ n: itemName, g, a }));
  } else st.counts.noName++;
  const key = `${src}|${t}|${ms}|${it >= 0 ? it : uri || ''}`;
  if (st.seen.has(key)) { st.counts.dup++; return; }
  st.seen.add(key);
  st.t.push(t); st.ms.push(ms); st.kind.push(kind); st.item.push(it); st.group.push(g); st.flags.push(flags); st.src.push(src);
  st.counts.rows++;
}

const ACCOUNT_TIME = /^(\d{4})-(\d{2})-(\d{2})[ T](\d{2}):(\d{2})(?::(\d{2}))?/;
export function parseAccountTime(s) {
  const m = ACCOUNT_TIME.exec(String(s || ''));
  if (!m) return NaN;
  return Date.UTC(+m[1], +m[2] - 1, +m[3], +m[4], +m[5], +(m[6] || 0));
}

function ingestExtended(st, rows) {
  let n = 0;
  for (const r of rows) {
    if (!r || typeof r !== 'object') { st.counts.bad++; continue; }
    const t = Date.parse(r.ts);
    const ms = Number(r.ms_played);
    const track = clean(r.master_metadata_track_name), episode = clean(r.episode_name), show = clean(r.episode_show_name);
    const book = clean(r.audiobook_title), chapter = clean(r.audiobook_chapter_title);
    let flags = 0;
    if (r.skipped === true || r.skipped === 1) flags |= F_SKIP;
    if (r.reason_end === 'fwdbtn') flags |= F_FWD;
    if ((r.skipped !== undefined && r.skipped !== null) || typeof r.reason_end === 'string') flags |= F_INFO;
    if (r.shuffle === true) flags |= F_SHUFFLE;
    if (track) addRow(st, SRC_EXTENDED, t, ms, KIND.MUSIC, clean(r.master_metadata_album_artist_name) || 'Unknown artist', track, clean(r.master_metadata_album_album_name), flags, r.spotify_track_uri);
    else if (episode || show) addRow(st, SRC_EXTENDED, t, ms, KIND.PODCAST, show || 'Unknown show', episode || show, '', flags, r.spotify_episode_uri);
    else if (book || chapter) addRow(st, SRC_EXTENDED, t, ms, KIND.AUDIOBOOK, book || 'Unknown audiobook', chapter || book, '', flags, r.audiobook_uri);
    else addRow(st, SRC_EXTENDED, t, ms, KIND.OTHER, '', '', '', flags, r.spotify_track_uri || r.spotify_episode_uri);
    n++;
  }
  return n;
}

function ingestAccount(st, rows) {
  let n = 0;
  for (const r of rows) {
    if (!r || typeof r !== 'object') { st.counts.bad++; continue; }
    const t = parseAccountTime(r.endTime);
    const ms = Number(r.msPlayed);
    const podcast = clean(r.podcastName), episode = clean(r.episodeName);
    const book = clean(r.audiobookName || r.audiobookTitle), chapter = clean(r.chapterName || r.audiobookChapterTitle);
    const artist = clean(r.artistName), track = clean(r.trackName);
    if (podcast || episode) addRow(st, SRC_ACCOUNT, t, ms, KIND.PODCAST, podcast || 'Unknown show', episode || podcast, '', 0, '');
    else if (book || chapter) addRow(st, SRC_ACCOUNT, t, ms, KIND.AUDIOBOOK, book || 'Unknown audiobook', chapter || book, '', 0, '');
    else if (track) addRow(st, SRC_ACCOUNT, t, ms, KIND.MUSIC, artist || 'Unknown artist', track, '', 0, '');
    else addRow(st, SRC_ACCOUNT, t, ms, KIND.OTHER, '', '', '', 0, '');
    n++;
  }
  return n;
}

// Reads one JSON file's text. Returns { ok, format, rows } or { ok: false, reason: 'json'|'shape'|'empty' }.
export function ingestJsonText(st, name, text) {
  let data;
  try { data = JSON.parse(text); } catch (e) { st.problems.push({ name, reason: 'json' }); return { ok: false, reason: 'json' }; }
  return ingestParsed(st, name, data);
}

export function ingestParsed(st, name, data) {
  const format = detectFormat(data);
  if (format === 'empty') { st.files.push({ name, format: 'empty', rows: 0 }); return { ok: true, format: 'empty', rows: 0 }; }
  if (!format) { st.notUsed.push(name); return { ok: false, reason: 'shape' }; }
  st.final = null;
  const rows = format === 'extended' ? ingestExtended(st, data) : ingestAccount(st, data);
  st.files.push({ name, format, rows });
  return { ok: true, format, rows };
}

/* ---------- finishing: overlap, order, typed arrays ---------- */

// When both downloads are given, the extended history is the full record up to the day it was made; Account data rows
// up to that moment are the same plays (to the minute), so only the ones after it are kept.
export function finalize(st) {
  if (st.final) return st.final;
  const n = st.t.length;
  let maxExt = -Infinity;
  for (let i = 0; i < n; i++) if (st.src[i] === SRC_EXTENDED && st.t[i] > maxExt) maxExt = st.t[i];
  const keep = [];
  let overlap = 0;
  for (let i = 0; i < n; i++) {
    if (st.src[i] === SRC_ACCOUNT && st.t[i] <= maxExt + 2 * 60000) { overlap++; continue; }
    keep.push(i);
  }
  keep.sort((a, b) => st.t[a] - st.t[b]);
  const m = keep.length;
  const f = {
    n: m,
    t: new Float64Array(m), ms: new Float64Array(m), kind: new Uint8Array(m), item: new Int32Array(m), group: new Int32Array(m), flags: new Uint8Array(m),
    groups: st.groups, albums: st.albums, items: st.items,
    hasExtended: maxExt > -Infinity, hasAccount: st.src.some(s => s === SRC_ACCOUNT),
  };
  keep.forEach((i, j) => { f.t[j] = st.t[i]; f.ms[j] = st.ms[i]; f.kind[j] = st.kind[i]; f.item[j] = st.item[i]; f.group[j] = st.group[i]; f.flags[j] = st.flags[i]; });
  st.counts.overlap = overlap;
  st.final = f;
  return f;
}

/* ---------- local time ---------- */

// Each play is placed at the moment it started (Spotify records when it ended and how long it ran), in one time zone.
const fmtCache = new Map();
function offsetFinder(tz) {
  if (!tz || tz === 'UTC') return () => 0;
  let fmt = fmtCache.get(tz);
  if (!fmt) {
    fmt = new Intl.DateTimeFormat('en-US', { timeZone: tz, hourCycle: 'h23', year: 'numeric', month: 'numeric', day: 'numeric', hour: 'numeric', minute: 'numeric' });
    fmtCache.set(tz, fmt);
  }
  const cache = new Map();
  return (t) => {
    const h = Math.floor(t / HOUR);
    let off = cache.get(h);
    if (off === undefined) {
      const at = h * HOUR;
      const p = {};
      for (const x of fmt.formatToParts(new Date(at))) p[x.type] = x.value;
      const asUtc = Date.UTC(+p.year, +p.month - 1, +p.day, +p.hour % 24, +p.minute);
      off = asUtc - at;
      cache.set(h, off);
    }
    return off;
  };
}

export function localise(f, tz) {
  const off = offsetFinder(tz);
  const n = f.n;
  const L = { tz, year: new Int16Array(n), month: new Uint8Array(n), hour: new Uint8Array(n), wday: new Uint8Array(n), day: new Int32Array(n) };
  for (let i = 0; i < n; i++) {
    const start = f.t[i] - f.ms[i];
    const local = start + off(start);
    const d = new Date(local);
    L.year[i] = d.getUTCFullYear();
    L.month[i] = d.getUTCMonth();
    L.hour[i] = d.getUTCHours();
    L.wday[i] = (d.getUTCDay() + 6) % 7; // Monday 0
    L.day[i] = Math.floor(local / DAY);
  }
  return L;
}

export const dayToIso = d => new Date(d * DAY).toISOString().slice(0, 10);
const isLeap = y => (y % 4 === 0 && y % 100 !== 0) || y % 400 === 0;
export const daysInYear = y => (isLeap(y) ? 366 : 365);
const dayOfYear = d => { const dt = new Date(d * DAY); return Math.floor((d * DAY - Date.UTC(dt.getUTCFullYear(), 0, 1)) / DAY) + 1; };

/* ---------- years in the file ---------- */

export function yearsIn(f, L) {
  const by = new Map();
  for (let i = 0; i < f.n; i++) {
    const y = L.year[i];
    const e = by.get(y) || { year: y, ms: 0, plays: 0 };
    e.ms += f.ms[i]; e.plays++;
    by.set(y, e);
  }
  return [...by.values()].sort((a, b) => a.year - b.year);
}

/* ---------- the numbers for one year, or for all time ---------- */

function topOf(map, n, score) {
  return [...map.entries()].sort((a, b) => score(b[1]) - score(a[1]) || (a[0] - b[0])).slice(0, n);
}

// year: a number, or 'all'. today: the local day number of "now" (for the pace estimate). topN: list length.
export function computeStats(f, L, { year = 'all', topN = 10, today = null } = {}) {
  const all = year === 'all';
  const kindMs = [0, 0, 0, 0];
  const hours = new Array(24).fill(0), wdays = new Array(7).fill(0), months = new Array(12).fill(0);
  const byYear = new Map();
  const artists = new Map(), tracks = new Map(), albums = new Map(), shows = new Map();
  const dayMs = new Map();
  const monthArtist = Array.from({ length: 12 }, () => new Map());
  const nightArtist = new Map();
  const skipsByTrack = new Map();
  let total = 0, plays = 0, streams = 0, nightMs = 0;
  let skipInfoPlays = 0, skipped = 0, musicPlays = 0, shortPlays = 0;
  let first = -1, firstT = Infinity, lastT = -Infinity, firstDay = Infinity, lastDay = -Infinity;
  for (let i = 0; i < f.n; i++) {
    if (!all && L.year[i] !== year) continue;
    const ms = f.ms[i], k = f.kind[i];
    total += ms; kindMs[k] += ms; plays++;
    hours[L.hour[i]] += ms; wdays[L.wday[i]] += ms;
    if (all) byYear.set(L.year[i], (byYear.get(L.year[i]) || 0) + ms); else months[L.month[i]] += ms;
    const d = L.day[i];
    dayMs.set(d, (dayMs.get(d) || 0) + ms);
    if (d < firstDay) firstDay = d;
    if (d > lastDay) lastDay = d;
    if (f.t[i] < firstT) firstT = f.t[i];
    if (f.t[i] > lastT) lastT = f.t[i];
    const night = L.hour[i] < 5;
    if (night) nightMs += ms;
    if (k === KIND.MUSIC) {
      musicPlays++;
      const g = f.group[i], it = f.item[i];
      const a = artists.get(g) || { ms: 0, streams: 0 };
      a.ms += ms;
      const tr = tracks.get(it) || { ms: 0, streams: 0 };
      tr.ms += ms;
      if (ms >= STREAM_MS) { streams++; a.streams++; tr.streams++; if (first < 0) first = i; }
      else shortPlays++;
      artists.set(g, a); tracks.set(it, tr);
      const al = f.items[it].a;
      if (al >= 0) albums.set(al, (albums.get(al) || 0) + ms);
      if (!all) monthArtist[L.month[i]].set(g, (monthArtist[L.month[i]].get(g) || 0) + ms);
      if (night) nightArtist.set(g, (nightArtist.get(g) || 0) + ms);
      if (f.flags[i] & F_INFO) {
        skipInfoPlays++;
        if (f.flags[i] & (F_SKIP | F_FWD)) { skipped++; skipsByTrack.set(it, (skipsByTrack.get(it) || 0) + 1); }
      }
    } else if (k === KIND.PODCAST || k === KIND.AUDIOBOOK) {
      const s = shows.get(f.group[i]) || { ms: 0, eps: new Set() };
      s.ms += ms; s.eps.add(f.item[i]);
      shows.set(f.group[i], s);
    }
  }
  const G = f.groups, A = f.albums, I = f.items;
  const out = {
    year, plays, totalMs: total, kindMs, streams,
    distinctArtists: [...artists.values()].filter(a => a.streams > 0).length,
    distinctTracks: [...tracks.values()].filter(t => t.streams > 0).length,
    firstT: plays ? firstT : null, lastT: plays ? lastT : null,
    firstDay: plays ? dayToIso(firstDay) : null, lastDay: plays ? dayToIso(lastDay) : null,
    activeDays: [...dayMs.values()].filter(v => v >= ACTIVE_DAY_MS).length,
    topArtists: topOf(artists, topN, v => v.ms).map(([g, v]) => ({ name: G[g].n, ms: v.ms, streams: v.streams })),
    topTracks: topOf(tracks, topN, v => v.streams * 1e10 + v.ms).filter(([, v]) => v.streams > 0)
      .map(([it, v]) => ({ name: I[it].n, artist: G[I[it].g].n, streams: v.streams, ms: v.ms })),
    topAlbums: topOf(albums, topN, v => v).map(([al, ms]) => ({ name: A[al].n, artist: G[A[al].g].n, ms })),
    topShows: topOf(shows, topN, v => v.ms).map(([g, v]) => ({ name: G[g].n, ms: v.ms, episodes: v.eps.size, kind: G[g].k === KIND.AUDIOBOOK ? 'audiobook' : 'podcast' })),
    hours, weekdays: wdays,
    months: all ? null : months,
    years: all ? [...byYear.entries()].sort((a, b) => a[0] - b[0]).map(([y, ms]) => ({ year: y, ms })) : null,
    monthlyTop: all ? null : monthArtist.map(m => { const t = topOf(m, 1, v => v)[0]; return t ? { name: G[t[0]].n, ms: t[1] } : null; }),
    night: { ms: nightMs, topArtist: (() => { const t = topOf(nightArtist, 1, v => v)[0]; return t ? { name: G[t[0]].n, ms: t[1] } : null; })() },
    firstSong: first >= 0 ? { name: I[f.item[first]].n, artist: G[f.group[first]].n, t: f.t[first] } : null,
  };
  // biggest day and the longest run of days in a row
  let big = null;
  for (const [d, ms] of dayMs) if (!big || ms > big.ms || (ms === big.ms && d < big.d)) big = { d, ms };
  out.biggestDay = big ? { day: dayToIso(big.d), ms: big.ms } : null;
  const active = [...dayMs.entries()].filter(([, ms]) => ms >= ACTIVE_DAY_MS).map(([d]) => d).sort((a, b) => a - b);
  let best = null, runStart = null, prev = null;
  for (const d of active) {
    if (prev === null || d !== prev + 1) runStart = d;
    const len = d - runStart + 1;
    if (!best || len > best.days) best = { days: len, from: dayToIso(runStart), to: dayToIso(d) };
    prev = d;
  }
  out.longestStreak = best;
  // skips: the extended history says when a song was skipped; Account data does not, so it gets short plays instead
  if (skipInfoPlays > 0) {
    const top = topOf(skipsByTrack, 1, v => v)[0];
    out.skips = { info: true, count: skipped, of: skipInfoPlays, rate: skipped / skipInfoPlays,
      most: top && top[1] >= 2 ? { name: I[top[0]].n, artist: G[I[top[0]].g].n, count: top[1] } : null };
  } else out.skips = { info: false, count: shortPlays, of: musicPlays, rate: musicPlays ? shortPlays / musicPlays : 0, most: null };
  // pace to 31 December: only for the year that is still running, from 1 January to the last day in the file
  out.projection = null;
  if (!all && plays && today !== null) {
    const todayYear = new Date(today * DAY).getUTCFullYear();
    if (todayYear === year) {
      const elapsed = dayOfYear(lastDay);
      const diy = daysInYear(year);
      if (elapsed >= 14 && elapsed < diy) out.projection = { ms: (total / elapsed) * diy, perDayMs: total / elapsed, elapsed, daysInYear: diy };
    }
  }
  return out;
}

/* ---------- year against year (Pro) ---------- */

export function compareYears(f, L) {
  const firstYear = new Map(); // artist -> first year with a stream
  const years = new Map();
  for (let i = 0; i < f.n; i++) {
    const y = L.year[i];
    let e = years.get(y);
    if (!e) { e = { year: y, ms: 0, streams: 0, artists: new Map(), tracks: new Map(), hours: new Array(24).fill(0), newArtists: new Set() }; years.set(y, e); }
    e.ms += f.ms[i]; e.hours[L.hour[i]] += f.ms[i];
    if (f.kind[i] === KIND.MUSIC) {
      const g = f.group[i];
      e.artists.set(g, (e.artists.get(g) || 0) + f.ms[i]);
      if (f.ms[i] >= STREAM_MS) {
        e.streams++;
        e.tracks.set(f.item[i], (e.tracks.get(f.item[i]) || 0) + 1);
        if (!firstYear.has(g)) { firstYear.set(g, y); e.newArtists.add(g); }
      }
    }
  }
  const sorted = [...years.values()].sort((a, b) => a.year - b.year);
  const firstInFile = sorted.length ? sorted[0].year : null;
  return sorted.map(e => {
    const ta = topOf(e.artists, 1, v => v)[0], tt = topOf(e.tracks, 1, v => v)[0];
    const newTop = [...e.newArtists].map(g => [g, e.artists.get(g) || 0]).sort((a, b) => b[1] - a[1]).slice(0, 3).map(([g]) => f.groups[g].n);
    return {
      year: e.year, ms: e.ms, streams: e.streams, hours: e.hours,
      topArtist: ta ? f.groups[ta[0]].n : null,
      topTrack: tt ? { name: f.items[tt[0]].n, artist: f.groups[f.items[tt[0]].g].n } : null,
      newArtists: e.year === firstInFile ? null : e.newArtists.size, // the first year in the file has no "before"
      newTop: e.year === firstInFile ? [] : newTop,
    };
  });
}

/* ---------- CSV (Pro) ---------- */

const csvCell = v => { const s = v === null || v === undefined ? '' : String(v); return /[",\n\r]/.test(s) || /^[=+\-@\t]/.test(s) ? '"' + (/^[=+\-@\t]/.test(s) ? "'" : '') + s.replace(/"/g, '""') + '"' : s; };
export const minutes = ms => Math.round(ms / 60000);
export function statsToCsv(s, label) {
  const rows = [['section', 'rank', 'name', 'artist or show', 'minutes', 'plays of 30 s or more', 'episodes']];
  rows.push(['total', '', label, '', minutes(s.totalMs), s.streams, '']);
  rows.push(['music', '', label, '', minutes(s.kindMs[KIND.MUSIC]), '', '']);
  rows.push(['podcasts', '', label, '', minutes(s.kindMs[KIND.PODCAST]), '', '']);
  rows.push(['audiobooks', '', label, '', minutes(s.kindMs[KIND.AUDIOBOOK]), '', '']);
  s.topArtists.forEach((a, i) => rows.push(['top artists', i + 1, a.name, '', minutes(a.ms), a.streams, '']));
  s.topTracks.forEach((a, i) => rows.push(['top songs', i + 1, a.name, a.artist, minutes(a.ms), a.streams, '']));
  s.topAlbums.forEach((a, i) => rows.push(['top albums', i + 1, a.name, a.artist, minutes(a.ms), '', '']));
  s.topShows.forEach((a, i) => rows.push([a.kind === 'audiobook' ? 'top audiobooks' : 'top podcasts', i + 1, a.name, '', minutes(a.ms), '', a.episodes]));
  if (s.months) s.months.forEach((ms, i) => rows.push(['by month', i + 1, ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'][i], '', minutes(ms), '', '']));
  if (s.years) s.years.forEach(y => rows.push(['by year', '', y.year, '', minutes(y.ms), '', '']));
  s.hours.forEach((ms, h) => rows.push(['by hour', h, `${String(h).padStart(2, '0')}:00`, '', minutes(ms), '', '']));
  ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday'].forEach((d, i) => rows.push(['by weekday', i + 1, d, '', minutes(s.weekdays[i]), '', '']));
  return '﻿' + rows.map(r => r.map(csvCell).join(',')).join('\r\n') + '\r\n';
}
