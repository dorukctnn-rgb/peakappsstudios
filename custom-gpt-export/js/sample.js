/* Skillcase sample: a made-up custom GPT ("Sourdough Coach") with two text knowledge files, one small PDF, an action
 * schema for a made-up API (api.example.com) and a made-up ChatGPT data export with chats in the shape OpenAI's export
 * uses. Nothing here comes from a real account. Used by "Try the sample GPT" on the page and by the tests. */
import { strToU8 } from '../vendor/fflate.js';

export const SAMPLE_GPT_ID = 'g-SampleSourdough01';
export const SAMPLE_PROJECT_ID = 'g-p-sampleproject0001';

export const SAMPLE_GPT = {
  name: 'Sourdough Coach',
  description: 'Helps home bakers plan, fix and log sourdough bakes, from starter to crumb.',
  instructions: [
    'You are Sourdough Coach, a patient baking coach for home bakers.',
    '',
    'How to answer:',
    '- Ask for flour type, room temperature and starter age before giving a schedule.',
    '- Give amounts in grams first, cups second.',
    '- When a bake went wrong, name the most likely cause first, then one change to try next time.',
    '- Use hydration-table.csv for water amounts and starter-feeding.md for feeding schedules.',
    '- Keep answers under 200 words unless the baker asks for a full schedule.',
    '',
    'Never give medical or food-safety advice beyond "when in doubt, throw it out".',
  ].join('\n'),
  starters: ['Plan a bake for Saturday morning', 'Why is my loaf flat?', 'Feed my starter for a cold kitchen', 'Turn this recipe into grams'],
  capabilities: { web: false, image: true, code: true, canvas: false },
  actions: [{
    auth: 'api_key',
    privacy: 'https://example.com/privacy',
    schema: JSON.stringify({
      openapi: '3.1.0',
      info: { title: 'Flour price lookup (made up)', version: '1.0.0' },
      servers: [{ url: 'https://api.example.com/v1' }],
      paths: {
        '/flours': { get: { operationId: 'listFlours', summary: 'List flours and prices' } },
        '/flours/{id}': { get: { operationId: 'getFlour', summary: 'One flour', parameters: [{ name: 'id', in: 'path', required: true, schema: { type: 'string' } }] } },
      },
    }, null, 2),
  }],
  gptId: SAMPLE_GPT_ID,
};

// a one-page PDF, written by hand: enough for a PDF reader to open, and binary enough to be left out of Gemini's skill
const PDF = `%PDF-1.4
1 0 obj<</Type/Catalog/Pages 2 0 R>>endobj
2 0 obj<</Type/Pages/Kids[3 0 R]/Count 1>>endobj
3 0 obj<</Type/Page/Parent 2 0 R/MediaBox[0 0 300 144]/Contents 4 0 R/Resources<</Font<</F1 5 0 R>>>>>>endobj
4 0 obj<</Length 58>>stream
BT /F1 18 Tf 24 72 Td (Bake log, made up sample) Tj ET
endstream endobj
5 0 obj<</Type/Font/Subtype/Type1/BaseFont/Helvetica>>endobj
trailer<</Root 1 0 R>>
%%EOF
`;

export function sampleFiles() {
  const pdf = strToU8(PDF, true);
  return [
    { name: 'hydration-table.csv', type: 'text/csv', bytes: strToU8('flour,hydration_percent,water_g_per_500g_flour\nbread flour,72,360\nall-purpose,68,340\nwhole wheat,80,400\nrye,85,425\n') },
    { name: 'starter-feeding.md', type: 'text/markdown', bytes: strToU8('# Starter feeding (sample)\n\n- Warm kitchen (24-26 C): feed 1:1:1 every 12 hours.\n- Cool kitchen (18-20 C): feed 1:2:2 every 12 hours, keep near the oven light.\n- Before a bake: feed 8 to 12 hours ahead, use at its peak.\n') },
    { name: 'bake-log-template.pdf', type: 'application/pdf', bytes: pdf },
  ];
}

/* ---- the made-up export ---- */
let n = 0;
const uid = () => `00000000-0000-4000-8000-${String(++n).padStart(12, '0')}`;
const T0 = Date.UTC(2026, 2, 7, 9, 0) / 1000; // 7 March 2026, 09:00 UTC
function conv({ title, gizmo = null, gizmoType = null, start, turns }) {
  const mapping = {};
  const root = uid();
  mapping[root] = { id: root, message: null, parent: null, children: [] };
  let parent = root, t = start, last = root;
  const add = (message, branch = false) => {
    const id = uid();
    mapping[id] = { id, message: { id, create_time: message.time != null ? message.time : (t += 40), ...message }, parent, children: [] };
    mapping[parent].children.push(id);
    if (!branch) { parent = id; last = id; }
    return id;
  };
  // ChatGPT keeps a hidden system message at the top of many chats
  add({ author: { role: 'system', name: null, metadata: {} }, content: { content_type: 'text', parts: [''] }, metadata: { is_visually_hidden_from_conversation: true }, recipient: 'all' });
  for (const turn of turns) {
    if (turn.regenerated) add({ author: { role: 'assistant', name: null, metadata: {} }, content: { content_type: 'text', parts: [turn.regenerated] }, metadata: {}, recipient: 'all' }, true);
    add(turn.msg);
  }
  return { id: uid(), conversation_id: uid().replace('00000000', '11111111'), title, create_time: start, update_time: t, current_node: last, mapping, gizmo_id: gizmo, gizmo_type: gizmoType, default_model_slug: 'gpt-5', is_archived: false };
}
const user = text => ({ msg: { author: { role: 'user', name: null, metadata: {} }, content: { content_type: 'text', parts: [text] }, metadata: {}, recipient: 'all' } });
const bot = (text, extra = {}) => ({ msg: { author: { role: 'assistant', name: null, metadata: {} }, content: { content_type: 'text', parts: [text] }, metadata: extra.meta || {}, recipient: 'all' }, regenerated: extra.regenerated });

export function sampleExport() {
  n = 0;
  const gizmo = SAMPLE_GPT_ID;
  const chats = [
    conv({ title: 'Saturday morning bake plan', gizmo, gizmoType: 'gpt', start: T0, turns: [
      user('I want fresh bread on Saturday at 9. Kitchen is about 20 C, bread flour, starter is 3 weeks old.'),
      bot('Feed your starter Friday at 8 am (1:2:2). Mix at 6 pm: 500 g bread flour, 360 g water, 100 g starter, 10 g salt. Bulk until about 9:30 pm, shape, then cold retard in the fridge overnight. Bake Saturday 8 am at 250 C, lid on 20 minutes, lid off 20.', { regenerated: 'An earlier answer that was regenerated: mix on Friday morning instead.' }),
      user('Can I skip the fridge?'),
      bot('You can, but at 20 C an overnight bulk will overproof. Keep the fridge step, or bake on Friday evening instead.'),
    ] }),
    conv({ title: 'Flat loaf after a long proof', gizmo, gizmoType: 'gpt', start: T0 + 86400 * 9, turns: [
      { msg: { author: { role: 'user', name: null, metadata: {} }, content: { content_type: 'multimodal_text', parts: [{ content_type: 'image_asset_pointer', asset_pointer: 'sediment://file_sample', width: 800, height: 600 }, 'My loaf came out flat, photo attached.'] }, metadata: {}, recipient: 'all' } },
      { msg: { author: { role: 'assistant', name: null, metadata: {} }, content: { content_type: 'thoughts', thoughts: [{ summary: 'Looking at the crumb', content: 'internal' }] }, metadata: {}, recipient: 'all' } },
      bot('The most likely cause is overproofing: the dough ran out of strength before the bake. Next time, end bulk when the dough has grown by half, not doubled.'),
    ] }),
    conv({ title: 'Grams for grandma’s rye', gizmo, gizmoType: 'gpt', start: T0 + 86400 * 20, turns: [
      user('Turn 3 cups rye flour and 1.5 cups water into grams.'),
      { msg: { author: { role: 'assistant', name: null, metadata: {} }, content: { content_type: 'code', language: 'python', text: 'print(3*120, 1.5*237)' }, metadata: {}, recipient: 'python' } },
      { msg: { author: { role: 'tool', name: 'python', metadata: {} }, content: { content_type: 'execution_output', text: '360 355.5' }, metadata: {}, recipient: 'all' } },
      bot('About 360 g rye flour and 355 g water. Rye drinks more water than wheat; 85% hydration is a good start.'),
    ] }),
    conv({ title: 'Kitchen renovation budget', gizmo: SAMPLE_PROJECT_ID, gizmoType: 'snorlax', start: T0 + 86400 * 3, turns: [
      user('Help me split a 12,000 budget across cabinets, counters and labour.'),
      bot('Cabinets 5,000, counters 3,000, labour 3,500, and 500 kept back for surprises.'),
    ] }),
    conv({ title: 'Weekend errands', start: T0 + 86400 * 4, turns: [
      user('List my errands for Saturday: post office, pharmacy, bakery.'),
      bot('Post office first (closes at noon), then the pharmacy, then the bakery.'),
    ] }),
    conv({ title: 'Dinner party menu', start: T0 + 86400 * 12, turns: [
      user('Plan a dinner for six. @Sourdough Coach which bread goes with soup?'),
      bot('A rye loaf with caraway goes well with a vegetable soup.', { meta: { gizmo_id: gizmo } }),
    ] }),
  ];
  return chats;
}
export const SAMPLE_GPT_CHATS = 3; // chats with the sample GPT itself (the @ mention is listed apart)
export const sampleExportJson = () => JSON.stringify(sampleExport());
