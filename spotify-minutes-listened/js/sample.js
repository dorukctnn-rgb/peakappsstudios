/* Earhours sample: a made-up listener's Extended streaming history (last year and this year up to a few days ago),
 * in the exact shape Spotify uses, so the whole page can be tried before a real download arrives. Every artist, song,
 * album and podcast name here is invented. Built from a fixed seed, so the same day gives the same sample. */

const ARTISTS = [
  { n: 'Glass Harbor', w: [9, 12], albums: { 'Low Tide Static': ['Saltwater Radio', 'Harbor Lights at Noon', 'Paper Boats', 'The Quiet Pier'], 'Night Ferry': ['Night Ferry', 'Lanterns'] } },
  { n: 'Mina Okafor', w: [6, 10], albums: { 'Soft Machinery': ['Copper Wire', 'Soft Machinery', 'Two Rooms', 'Hum'] } },
  { n: 'The Velvet Static', w: [10, 6], albums: { 'Channel Surf': ['Channel Surf', 'Snowblind TV', 'Late Show', 'Rerun Heart', 'Test Card'] } },
  { n: 'Junebug Radio', w: [4, 8], albums: { 'Porch Light': ['Porch Light', 'Firefly Season', 'Gravel Road'] } },
  { n: 'Koi Pond Choir', w: [3, 5], albums: { 'Ripples': ['Ripples', 'Stone Lantern', 'Morning Bell'] } },
  { n: 'Hollow Atlas', w: [5, 3], albums: { 'Cartography': ['North Arrow', 'Contour Lines', 'Blank Spaces', 'Scale 1:50'] } },
  { n: 'Saffron and the Sons', w: [2, 4], albums: { 'Spice Route': ['Cardamom', 'Spice Route', 'Bazaar at Dusk'] } },
  { n: 'Neon Orchard', w: [0, 9], albums: { 'Fruit of the Grid': ['Pixel Apples', 'Orchard OS', 'Midnight Harvest', 'Graft'] } }, // new this year
  { n: 'Ida Brennholt', w: [0, 4], albums: { 'Winter Rooms': ['Woodstove', 'Frost on the Glass', 'Winter Rooms'] } }, // new this year
  { n: 'Cassette Ghosts', w: [4, 2], albums: { 'B-Sides': ['Rewind', 'Fast Forward', 'Chrome Tape', 'Side B'] } },
  { n: 'Ruby Calder', w: [3, 3], albums: { 'Small Hours': ['Small Hours', '3 AM Kitchen', 'Streetlamp'] } },
  { n: 'Teo Marchetti', w: [2, 2], albums: { 'Vespa Summer': ['Vespa Summer', 'Limoncello', 'Coastal Road'] } },
];
const PODCASTS = [
  { n: 'The Long Commute', eps: ['Why trains run late', 'The bus that never came', 'Bike lanes, explained', 'Night buses'], len: 38 },
  { n: 'Kitchen Table Science', eps: ['Why bread rises', 'The physics of toast', 'Coffee chemistry', 'Salt, briefly'], len: 46 },
];

function rng(seed) {
  let a = seed >>> 0;
  return () => { a = (a + 0x6D2B79F5) >>> 0; let t = a; t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
}
const pick = (r, list, weight) => {
  const total = list.reduce((s, x) => s + weight(x), 0);
  let v = r() * total;
  for (const x of list) { v -= weight(x); if (v <= 0) return x; }
  return list[list.length - 1];
};

// now: a Date. Returns the rows of one Streaming_History_Audio file.
export function makeSample(now = new Date()) {
  const r = rng(20261021);
  const rows = [];
  const thisYear = now.getFullYear();
  const end = new Date(now.getFullYear(), now.getMonth(), now.getDate() - 3);
  const tracks = ARTISTS.map(a => Object.entries(a.albums).flatMap(([album, songs]) => songs.map(s => ({ artist: a, album, song: s, len: 150 + Math.floor(r() * 120) }))));
  const push = (endAt, ms, t, extra) => rows.push(Object.assign({
    ts: new Date(endAt).toISOString().replace(/\.\d{3}Z$/, 'Z'), platform: 'ios', ms_played: ms, conn_country: 'ZZ',
    master_metadata_track_name: t ? t.song : null, master_metadata_album_artist_name: t ? t.artist.n : null,
    master_metadata_album_album_name: t ? t.album : null, spotify_track_uri: null,
    episode_name: null, episode_show_name: null, spotify_episode_uri: null,
    audiobook_title: null, audiobook_uri: null, audiobook_chapter_uri: null, audiobook_chapter_title: null,
    reason_start: 'trackdone', reason_end: 'trackdone', shuffle: false, skipped: false, offline: false, offline_timestamp: null, incognito_mode: false,
  }, extra));
  for (let d = new Date(thisYear - 1, 0, 1); d <= end; d = new Date(d.getFullYear(), d.getMonth(), d.getDate() + 1)) {
    const yi = d.getFullYear() === thisYear ? 1 : 0;
    const wd = d.getDay();
    const weekend = wd === 0 || wd === 6;
    if (r() < 0.06) continue; // a quiet day now and then
    const sessions = [];
    if (!weekend) { sessions.push(7 + r() * 1.5, 17.5 + r() * 1.5); if (r() < 0.6) sessions.push(20 + r() * 3); }
    else { sessions.push(11 + r() * 3, 15 + r() * 3); if (r() < 0.5) sessions.push(21 + r() * 2.5); }
    if (r() < 0.12) sessions.push(0.3 + r() * 2.5); // a late night
    for (const h of sessions) {
      let at = new Date(d.getFullYear(), d.getMonth(), d.getDate(), Math.floor(h), Math.floor((h % 1) * 60), Math.floor(r() * 60)).getTime();
      if (!weekend && h < 9 && r() < 0.45) { // a podcast on the way in
        const p = PODCASTS[Math.floor(r() * PODCASTS.length)];
        const ms = Math.round((p.len * 0.5 + r() * p.len * 0.5) * 60000);
        at += ms;
        push(at, ms, null, { episode_name: p.eps[Math.floor(r() * p.eps.length)], episode_show_name: p.n, reason_end: r() < 0.7 ? 'trackdone' : 'endplay' });
        continue;
      }
      const n = 5 + Math.floor(r() * 12);
      let artist = pick(r, ARTISTS, a => a.w[yi]);
      for (let k = 0; k < n; k++) {
        if (r() < 0.35) artist = pick(r, ARTISTS, a => a.w[yi]);
        const list = tracks[ARTISTS.indexOf(artist)];
        const t = list[Math.floor(Math.pow(r(), 1.6) * list.length)];
        const skip = r() < 0.16;
        const ms = skip ? 3000 + Math.floor(r() * 24000) : t.len * 1000 - Math.floor(r() * 2000);
        at += ms + 400;
        push(at, ms, t, skip ? { reason_end: 'fwdbtn', skipped: true, shuffle: r() < 0.5 } : { shuffle: r() < 0.5, reason_start: k ? 'trackdone' : 'clickrow' });
      }
    }
  }
  return rows;
}
