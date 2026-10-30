/* The sample package: a made-up account, laid out the way Discord's help article describes a package (Account/user.json
 * with the age signals, Messages/index.json and one folder per channel, Servers/, Activity/), so the page can be tried
 * without a real one. Every name, id and message here is invented; the same input gives the same files every time. */

export const SAMPLE_NAME = 'package.zip';
export const SAMPLE_USER = 'maple_owl';

function rng(seed) {
  let s = seed >>> 0;
  return () => { s = (s + 0x6d2b79f5) >>> 0; let t = s; t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
}
const EPOCH = 1420070400000n;
const flake = (ms, r) => String(((BigInt(Math.floor(ms)) - EPOCH) << 22n) | BigInt(Math.floor(r() * 4194303)));
const iso = ms => new Date(ms).toISOString().replace('T', ' ').replace('Z', '+00:00').replace(/\.(\d{3})/, '.$1000');

const OPEN = ['ok so', 'honestly', 'wait', 'lol', 'update:', 'quick one:', 'btw', 'no way', 'fair', 'yeah', 'same', 'real talk'];
const BODY = [
  'the raid is moved to saturday at 8', 'I finally beat the last boss', 'can someone send the map seed again', 'that patch broke my keybinds',
  'my train is late again', 'I made pasta with way too much garlic', 'the new season looks good', 'did you see the trailer',
  'I will be on after dinner', 'the server was lagging all night', 'who has the spreadsheet for the build', 'my cat walked on the keyboard',
  'I need a nap before the match', 'that clip was hilarious', 'we should do a movie night', 'my exam is on monday',
  'the playlist from last week was great', 'I switched to the controller', 'can we lower the music in voice', 'the shop has the bundle back',
  'I got the job', 'the photos from the trip are up', 'what time zone is the event in', 'I lost the round by one point',
];
const CLOSE = ['', '', '', ' :)', ' haha', '?', ' tbh', ' gg', '!!', ' :D', ' tomorrow', ' again'];

export function sampleFiles() {
  const r = rng(20261030);
  const pick = a => a[Math.floor(r() * a.length)];
  const now = Date.UTC(2026, 9, 28, 12, 0, 0);
  const created = Date.UTC(2018, 4, 14, 19, 22, 5);
  const me = flake(created, r);
  const friends = [
    ['quietfern', 'Fern'], ['bytebadger', 'Badger'], ['nori.waves', 'Nori'], ['lumen_jay', 'Jay'],
    ['pebble_kit', 'Pebble'], ['orbit.sam', 'Sam'], ['velvetmoth', 'Moth'], ['tidepool99', 'Tide'],
  ].map(([username, global_name], i) => ({ id: flake(Date.UTC(2016 + (i % 6), i, 3 + i), r), username, global_name, discriminator: '0' }));
  const user = {
    id: me, username: SAMPLE_USER, global_name: 'Maple', discriminator: '0', email: 'maple.owl@example.com', verified: true,
    phone: null, avatar_hash: null, flags: 0,
    date_of_birth: '01-01-0001',
    age_assurance: [
      { vendor: 'DISCORD', method: 'ML_AGE_INFERENCE', verified_at: '2026-09-24T03:11:52+00:00', estimated_age_group: 'AGE_ASSURANCE_GROUP_17', inferred_age_group: 'TEEN', is_regional_adult: false },
      { vendor: 'K_ID', method: 'FACIAL_AGE_ESTIMATION', verified_at: '2026-09-27T18:40:10+00:00', estimated_age_group: 'AGE_ASSURANCE_GROUP_22_24', is_regional_adult: true, cooldown_reset_at: '2026-10-27T18:40:10+00:00' },
    ],
    inferred_age_group: 'TEEN',
    predicted_age: { predicted_age: '18-24', prob_13_17: 0.3412, prob_18_24: 0.4931, prob_25_34: 0.1389, prob_35_over: 0.0268, day_pt: '2026-10-19 00:00:00 UTC' },
    settings: { locale: 'en-US', theme: 'dark', explicit_content_filter: 1 },
    connections: [{ type: 'steam', name: 'mapleowl', visibility: 1 }, { type: 'spotify', name: 'maple', visibility: 0 }],
    sessions: [{ client_info: { os: 'Windows' } }, { client_info: { os: 'Android' } }],
    relationships: [
      ...friends.map((u, i) => ({ id: u.id, type: 1, nickname: i === 2 ? 'Nori from school' : null, user: u })),
      { id: flake(Date.UTC(2020, 1, 1), r), type: 2, nickname: null, user: { id: flake(Date.UTC(2020, 1, 1), r), username: 'spam.bot.4421', global_name: null, discriminator: '0' } },
    ],
    notes: { [friends[1].id]: 'owes me a pizza' },
    payments: [],
  };

  const files = { 'Account/user.json': JSON.stringify(user, null, 2) };

  const servers = [
    { id: flake(Date.UTC(2017, 2, 1), r), name: 'Night Shift Raiders', channels: ['general', 'raid-planning', 'memes'] },
    { id: flake(Date.UTC(2019, 7, 9), r), name: 'Pixel Garden', channels: ['showcase', 'help'] },
    { id: flake(Date.UTC(2021, 10, 20), r), name: 'Study Room 24/7', channels: ['focus-chat'] },
  ];
  const index = {};
  const conv = (id, folder, channel, n, from, to, voices) => {
    const msgs = [];
    for (let i = 0; i < n; i++) {
      const t = from + Math.floor(((to - from) * (i + r() * 0.8)) / n);
      const text = `${r() < 0.35 ? pick(OPEN) + ' ' : ''}${pick(BODY)}${pick(CLOSE)}`;
      const att = r() < 0.04 ? `https://cdn.discordapp.com/attachments/${id}/${flake(t, r)}/screenshot_${i}.png` : '';
      msgs.push({ ID: flake(t, r), Timestamp: iso(t), Contents: voices && i % 9 === 0 ? `${text}\nsecond line, same message` : text, Attachments: att });
    }
    files[`Messages/${folder}/channel.json`] = JSON.stringify(channel);
    files[`Messages/${folder}/messages.json`] = JSON.stringify(msgs);
  };
  // direct messages
  const dms = [[0, 420, 2019], [1, 360, 2020], [2, 610, 2018], [4, 140, 2023]];
  for (const [fi, n, y] of dms) {
    const id = flake(Date.UTC(y, 3, 2), r);
    index[id] = `Direct Message with ${friends[fi].username}#0`;
    conv(id, `c${id}`, { id, type: 1, recipients: [me, friends[fi].id] }, n, Date.UTC(y, 3, 2), now - 86400000 * (fi + 1), fi === 2);
  }
  // a DM with someone who deleted their account
  {
    const id = flake(Date.UTC(2019, 9, 1), r);
    index[id] = 'Direct Message with Deleted User#0000';
    conv(id, `c${id}`, { id, type: 1, recipients: [me, 'Deleted User'] }, 35, Date.UTC(2019, 9, 1), Date.UTC(2021, 0, 4));
  }
  // a group DM
  {
    const id = flake(Date.UTC(2022, 5, 6), r);
    index[id] = 'None';
    conv(id, `c${id}`, { id, type: 3, name: 'weekend crew', recipients: [me, friends[3].id, friends[5].id, friends[6].id] }, 230, Date.UTC(2022, 5, 6), now - 86400000 * 3);
  }
  // server channels
  servers.forEach((s, si) => {
    s.channels.forEach((name, ci) => {
      const id = flake(Date.UTC(2018 + si, 1 + ci, 9), r);
      index[id] = `${name} in ${s.name}`;
      conv(id, `c${id}`, { id, type: 0, name, guild: { id: s.id, name: s.name } }, [180, 260, 90, 75, 40, 120][si * 2 + ci] || 60, Date.UTC(2018 + si, 1 + ci, 9), now - 86400000 * (5 + si));
    });
  });
  files['Messages/index.json'] = JSON.stringify(index);

  files['Servers/index.json'] = JSON.stringify(Object.fromEntries(servers.map(s => [s.id, s.name])));
  for (const s of servers) files[`Servers/${s.id}/guild.json`] = JSON.stringify({ id: s.id, name: s.name });

  // activity: ordinary events with monthly age and gender guesses among them (older packages carry these)
  const lines = [];
  const types = ['app_opened', 'session_start', 'join_voice_channel', 'add_reaction', 'message_sent', 'guild_viewed', 'notification_clicked'];
  for (let m = 0; m < 14; m++) {
    const day = Date.UTC(2025, 8 + m, 1);
    const d = new Date(day).toISOString().slice(0, 10);
    for (let k = 0; k < 18; k++) lines.push(JSON.stringify({ event_type: pick(types), event_id: `e${m}-${k}-${Math.floor(r() * 1e9)}`, user_id: me, timestamp: `"${new Date(day + k * 3600000).toISOString()}"`, day_pt: `${d} 00:00:00 UTC`, country_code: 'US', client_send_timestamp: `"${new Date(day + k * 3600000).toISOString()}"` }));
    const teen = m >= 11 ? 0.28 + r() * 0.1 : 0.08 + r() * 0.08;
    const a2 = 0.45 + r() * 0.1;
    const a3 = (1 - teen - a2) * (0.72 + r() * 0.2);
    const ps = [['13-17', teen], ['18-24', a2], ['25-34', a3], ['35+', Math.max(0, 1 - teen - a2 - a3)]];
    const top = ps.reduce((a, b) => (b[1] > a[1] ? b : a))[0];
    lines.push(JSON.stringify({ event_type: 'predicted_age', event_id: `pa${m}`, user_id: me, day_pt: `${d} 00:00:00 UTC`, predicted_age: top, prob_13_17: +ps[0][1].toFixed(4), prob_18_24: +ps[1][1].toFixed(4), prob_25_34: +ps[2][1].toFixed(4), prob_35_over: +ps[3][1].toFixed(4) }));
    const f = 0.55 + r() * 0.2;
    lines.push(JSON.stringify({ event_type: 'predicted_gender', event_id: `pg${m}`, user_id: me, day_pt: `${d} 00:00:00 UTC`, predicted_gender: f > 0.5 ? 'female' : 'male', prob_male: +(1 - f - 0.03).toFixed(4), prob_female: +f.toFixed(4), prob_non_binary_gender_expansive: 0.03 }));
  }
  files['Activity/analytics/events-2026-00000-of-00001.json'] = lines.join('\n') + '\n';
  files['Activity/tns/events-2026-00000-of-00001.json'] = lines.filter(l => !l.includes('predicted_')).slice(0, 40).join('\n') + '\n';
  files['Ads/quests_user_status.json'] = '[]';
  files['README.txt'] = 'A made-up Discord data package for trying Agelens. Every name and message in it is invented.\n';
  return files;
}
