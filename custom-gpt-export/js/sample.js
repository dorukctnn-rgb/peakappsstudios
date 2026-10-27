/* Skillcase sample: a made-up custom GPT ("Sourdough Coach") with two text knowledge files, one small PDF, an action
 * schema for a made-up API (api.example.com) and a made-up ChatGPT data export with chats in the shape OpenAI's export
 * uses; and a made-up Gemini Gem ("Allotment Planner") with text files, a PDF, a real small Word file and two stand-ins
 * (a voice note and a .doc) of the kinds Google's move from Gems to skills leaves out. Nothing here comes from a real
 * account. Used by "Try the sample GPT" and "Try the sample Gem" on the page and by the tests. */
import { strToU8, zipSync } from '../vendor/fflate.js';

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

/* ---- the made-up Gem ---- */
// A real, minimal Word file: [Content_Types].xml, the package relationship and word/document.xml with a title, a heading,
// a paragraph, two list items and a table. Word opens it; Skillcase turns it into Markdown for the Gemini skill.
const xmlEsc = s => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
export function docxBytes(blocks) {
  const W = 'xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main"';
  const run = t => `<w:r><w:t xml:space="preserve">${xmlEsc(t)}</w:t></w:r>`;
  const para = (t, style, list) => `<w:p>${style || list ? `<w:pPr>${style ? `<w:pStyle w:val="${style}"/>` : ''}${list ? '<w:numPr><w:ilvl w:val="0"/><w:numId w:val="1"/></w:numPr>' : ''}</w:pPr>` : ''}${run(t)}</w:p>`;
  const body = blocks.map(b => {
    if (b.table) return `<w:tbl><w:tblPr><w:tblW w:w="0" w:type="auto"/></w:tblPr>${b.table.map(r => `<w:tr>${r.map(c => `<w:tc><w:tcPr><w:tcW w:w="2400" w:type="dxa"/></w:tcPr>${para(c)}</w:tc>`).join('')}</w:tr>`).join('')}</w:tbl>`;
    return para(b.text, b.style, b.list);
  }).join('');
  return zipSync({
    '[Content_Types].xml': strToU8('<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/><Override PartName="/word/document.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml"/></Types>'),
    '_rels/.rels': strToU8('<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="word/document.xml"/></Relationships>'),
    'word/document.xml': strToU8(`<?xml version="1.0" encoding="UTF-8" standalone="yes"?><w:document ${W}><w:body>${body}<w:sectPr/></w:body></w:document>`),
  }, { mtime: new Date(Date.UTC(2026, 0, 1)) });
}
export const SAMPLE_GEM_DOCX = [
  { text: 'Seed order 2027 (made up)', style: 'Title' },
  { text: 'What to order', style: 'Heading2' },
  { text: 'Order by the end of January, so the early sowings arrive in time.' },
  { text: 'Broad beans, Aquadulce', list: true },
  { text: 'Tomatoes, Gardener’s Delight & Sungold', list: true },
  { table: [['Crop', 'Packets', 'Sow from'], ['Broad beans', '2', 'November'], ['Tomatoes', '1', 'March']] },
];
export const SAMPLE_GEM = {
  source: 'gem',
  name: 'Allotment Planner',
  description: 'Plans a small vegetable plot month by month and answers pest and sowing questions.',
  instructions: [
    'You are Allotment Planner, a practical guide for people with one small vegetable plot.',
    '',
    'How to answer:',
    '- Ask for the plot size, the region and what is already growing before making a plan.',
    '- Use sowing-calendar.csv for sowing months and plot-notes.md for the plot\'s beds.',
    '- Give one job for this week first, then the month\'s other jobs.',
    '- For a pest, name the likely culprit first and one organic fix.',
    '',
    'Keep answers under 150 words unless the gardener asks for a full plan.',
  ].join('\n'),
  gemTools: ['canvas'],
};
export function sampleGemFiles() {
  return [
    { name: 'sowing-calendar.csv', type: 'text/csv', bytes: strToU8('crop,sow_indoors,sow_outdoors,harvest\nbroad beans,,November or March,June to July\ntomatoes,March,,July to September\ncarrots,,April to June,July to October\n') },
    { name: 'plot-notes.md', type: 'text/markdown', bytes: strToU8('# Plot notes (made up)\n\n- Bed 1: brassicas, netted.\n- Bed 2: roots, no manure this year.\n- Bed 3: beans and peas, canes stay up.\n') },
    { name: 'seed-order.docx', type: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document', bytes: docxBytes(SAMPLE_GEM_DOCX) },
    { name: 'plot-map.pdf', type: 'application/pdf', bytes: strToU8(PDF.replace('(Bake log, made up sample)', '(Plot map, made up sample)'), true) },
    // stand-ins with made-up bytes, for the kinds of file Google's move from Gems to skills leaves out
    { name: 'walk-round-voice-note.m4a', type: 'audio/mp4', bytes: new Uint8Array(4096).map((_, i) => (i * 13) & 255) },
    { name: 'old-plot-plan.doc', type: 'application/msword', bytes: new Uint8Array([0xd0, 0xcf, 0x11, 0xe0, 0xa1, 0xb1, 0x1a, 0xe1, 0, 0, 0, 0, 7, 7, 7, 7]) },
  ];
}
/** every sample file, GPT and Gem, by name (the worker looks the sample's files up by name) */
export const allSampleFiles = () => sampleFiles().concat(sampleGemFiles());

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
