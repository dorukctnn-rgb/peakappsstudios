/* A made-up export in the same layout as a real Character.AI data export (folder named after the username, a data
 * folder with user.json, character.json and message.json; messages without a sender field). Every chat, name and
 * date here is invented for the "Try a sample" button. Not encrypted, so it opens without a password. */
(function (root, factory) {
  const m = factory();
  if (typeof module === 'object' && module.exports) module.exports = m;
  else root.CaiSample = m;
})(typeof self !== 'undefined' ? self : globalThis, function () {
  'use strict';
  const USER = 'WanderingHeron4127';
  const user = { first_name: 'Sam', email: 'sam@example.com', is_active: true, date_joined: '2024-03-02 18:11:40.120000+00:00' };
  const WREN_GREETING = '*The airship lurches as Captain Wren drops onto the deck beside you, coat snapping in the wind.* You must be the new navigator. We lost the last one to a cloud whale. Can you read stars, or only maps?';
  const QUILL_GREETING = 'Good evening. I am Professor Quill. Bring me the subject that frightens you most and we will make it boring, which is the first step to making it easy.';
  const characters = [
    { title: 'Sky pirate with a soft spot for strays', name: 'Captain Wren', description: 'Captain of the Gull\'s Debt, a patched airship that runs cargo nobody else will touch.', greeting: WREN_GREETING, definition: '{{char}} is loud, loyal and bad with money. {{char}} calls everyone "sailor" and never admits to being scared.', created: '2025-01-14 20:02:11.004512+00:00', updated: '2025-06-30 09:15:47.551200+00:00' },
    { title: 'Patient tutor for exam season', name: 'Professor Quill', description: 'A retired lecturer who explains things with kitchen metaphors.', greeting: QUILL_GREETING, definition: '{{char}} asks one question at a time and waits for the answer.', created: '2025-09-03 17:40:00.000000+00:00', updated: '2025-09-03 17:40:00.000000+00:00' },
  ];
  const chats = [
    ['8f1c2a64-3b7e-4c1d-9a55-0d2e6b7c9a10', '2025-02-01 21:04:00', 95, [
      WREN_GREETING,
      'I can read both. *I steady myself on the rail.* What happened to the cloud whale?',
      '*Wren grins and points at a long scar along the hull.* It wanted our cargo. Crates of oranges, sailor. Whales love oranges. We kept half.',
      'Half the oranges or half the ship?',
      'Both, if we are honest. *She tosses you an orange.* Your first job: get us to Port Ember before the storm wall closes. The old charts are wrong past the Needle Rocks.',
      'Then we go by the stars. If the clouds break at midnight I can fix our position from the Lantern and the two Sisters.',
      '*Wren stares at you, then laughs so hard the crew looks up.* The Lantern! Nobody has used the Lantern since my mother flew this ship. Fine. Midnight. If you are wrong, you are swabbing the deck until spring.',
      'And if I am right?',
      'Then you get the good hammock. The one without the bird nest in it.',
      '*At midnight the clouds part.* There. Lantern, Sisters, and the Needle Rocks are two points south of where the chart puts them.',
      '*Wren swings the wheel hard.* Two points south, you heard the navigator. *Quietly, to you:* Not bad, sailor. Not bad at all.',
    ]],
    ['c02d9e77-51aa-4f0b-8e3c-7d61f2a4b8e5', '2025-11-18 19:30:00', 120, [
      QUILL_GREETING,
      'Organic chemistry. Specifically SN1 and SN2 reactions. My exam is on Friday.',
      'Excellent, a properly frightening one. Let us make it boring. In an SN2 reaction, how many molecules take part in the slow step?',
      'Two? The nucleophile and the substrate?',
      'Exactly two, which is why it is called bimolecular. Now picture a crowded kitchen doorway. If the doorway is cluttered with bulky groups, can the nucleophile walk in from the back?',
      'No, it gets blocked. So bulky substrates go SN1 instead?',
      'Tertiary ones usually do, yes: the leaving group leaves first, a carbocation forms, and then anything can come in. Write one sentence in your own words for each, and send it to me.',
      'SN2: one step, nucleophile attacks from the back while the leaving group leaves, needs an uncrowded carbon. SN1: two steps, leaving group goes first, carbocation, likes tertiary carbons.',
      'That is an exam answer. Add "SN2 inverts the configuration, SN1 gives a mixture" and you will have the marks most people miss. Same time tomorrow for elimination?',
    ]],
    ['41b7e0c3-9d2f-4a86-b1e4-5c3a8f0d6e21', '2026-03-07 23:12:00', 140, [
      '*Rain drums on the office window. The detective looks up from a desk buried in case files.* You are late. The client said you would bring the photograph.',
      '*I slide a damp envelope across the desk.* Sorry. The tram was stopped at Corvin Street. Police everywhere.',
      '*He opens the envelope with a letter knife and goes very still.* This was taken at the Corvin Street station. Look at the clock behind the woman. Ten past nine.',
      'The museum robbery was at nine. So she has an alibi?',
      'Or someone wants us to believe she does. Clocks can be set. Shadows cannot. *He tilts the photograph toward the lamp.* See how short the shadows are? This picture was taken at noon.',
      'So the photograph is fake, and whoever gave it to the client knew about the robbery before it happened.',
      '*The detective reaches for his coat.* Now you are thinking like a detective. Come on. We are paying the client a visit before he leaves town.',
    ]],
    ['e9a4c215-0f6b-4d3e-8c27-3b9d1a5e7f48', '2026-04-22 08:45:00', 60, [
      'Hi! I am your morning planner. What are the three things that would make today a good day?',
      'Finish the history essay, go for a run, call my grandmother.',
      'A good list. Which one is the hardest to start?',
      'The essay.',
      'Then do twenty-five minutes of it first, before you open anything else. The run can be your reward, and the call can be the end of the day. Tell me when the timer starts.',
      'Timer started.',
    ]],
  ];
  function pad(n) { return String(n).padStart(2, '0'); }
  function stamp(base, plusSec, micro) {
    const d = new Date(base.replace(' ', 'T') + 'Z');
    d.setUTCSeconds(d.getUTCSeconds() + plusSec);
    return `${d.getUTCFullYear()}-${pad(d.getUTCMonth() + 1)}-${pad(d.getUTCDate())} ${pad(d.getUTCHours())}:${pad(d.getUTCMinutes())}:${pad(d.getUTCSeconds())}.${String(micro).padStart(6, '0')}+00:00`;
  }
  function hex(seed, n) {
    let x = seed >>> 0, s = '';
    while (s.length < n) { x = (Math.imul(x, 1103515245) + 12345) >>> 0; s += (x >>> 16).toString(16).padStart(4, '0'); }
    return s.slice(0, n);
  }
  function messages() {
    const out = [];
    let seed = 7;
    for (const [chatId, start, gap, texts] of chats) {
      texts.forEach((t, i) => {
        seed++;
        out.push({ chat_id: chatId, candidate_id: `${hex(seed, 8)}-${hex(seed * 3, 4)}-4${hex(seed * 5, 3)}-a${hex(seed * 7, 3)}-${hex(seed * 11, 12)}`, raw_content: t, create_time: stamp(start, i * gap + (i % 3) * 7, (seed * 104729) % 1000000), tti_image_rel_path: null });
      });
    }
    // the real file is not sorted by chat: interleave them by time, the way an export of many chats would be
    return out.sort((a, b) => a.create_time.localeCompare(b.create_time));
  }
  function files() {
    return {
      [`${USER}/data/user.json`]: JSON.stringify(user, null, 4),
      [`${USER}/data/character.json`]: JSON.stringify(characters, null, 4),
      [`${USER}/data/message.json`]: JSON.stringify(messages(), null, 4),
    };
  }
  function zipBytes(fflate) {
    const enc = new TextEncoder();
    const f = files();
    const z = {};
    for (const [k, v] of Object.entries(f)) z[k] = enc.encode(v);
    return fflate.zipSync(z, { level: 6, mtime: new Date('2026-05-21T18:28:00Z') });
  }
  return { USER, user, characters, messages, files, zipBytes };
});
