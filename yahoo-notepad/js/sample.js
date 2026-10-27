/* The sample behind "Try the sample notes": made-up notes in made-up notebooks, written as a JSON file so that the sample
 * goes through the same reading code as your own download. Yahoo has not published the layout of its download; this is
 * one plausible layout (notebooks, each with its notes), not a copy of Yahoo's. Nothing here is anyone's real data. */
const DAY = 864e5;

// [notebook, title, body, created (days ago), last changed (days ago), html?]
const NOTES = [
  ['Recipes', "Grandma's apple cake", '3 apples, peeled and sliced\n1 cup sugar\n2 eggs\n1 cup flour\n1 tsp baking powder\nHalf a cup of butter, melted\n\nOven at 350 F. Butter the tin. Mix the eggs and sugar, then the butter, then the flour. Pour, lay the apples on top, cinnamon on the apples. 45 minutes.', 2900, 410],
  ['Recipes', 'Chili for the church supper', '<p><b>Serves 12.</b> Double for the supper.</p><ul><li>2 lb ground beef</li><li>2 cans kidney beans</li><li>1 can crushed tomatoes</li><li>2 onions, 1 green pepper</li><li>Chili powder, cumin, a little cocoa</li></ul><p>Brown the beef with the onions. Everything in the slow cooker on low for 6 hours.</p>', 1650, 380, true],
  ['Recipes', 'Banana bread (the good one)', '3 very ripe bananas, a third of a cup of melted butter, 1 tsp baking soda, a pinch of salt, three quarters of a cup of sugar, 1 egg, 1 tsp vanilla, 1 and a half cups of flour. 60 minutes at 350 F.', 2200, 2200],
  ['Family', 'Christmas card list', 'Aunt Ruth and Uncle Joe\nThe Petersons (new address, see below)\nMary from choir\nDavid and Kim\nMrs. Alvarez next door\n\nPetersons: 14 Birch Lane, moved in June.', 3400, 330],
  ['Family', 'Gift ideas', 'Emma: a sketchbook and good pencils\nNoah: the dinosaur book he showed me\nTom: gloves, size L\nSarah: tea sampler', 720, 52],
  ['Family', 'Birthdays', 'Jan 9: Tom\nMar 22: Emma\nJun 2: Sarah\nAug 30: Noah\nNov 14: our anniversary', 3900, 900],
  ['House', 'Furnace and car service', 'Furnace filter: changed March and September.\nCar: oil change every 5,000 miles. Last one at 61,200.\nGutters cleaned in October.', 1200, 30],
  ['House', 'Garden plan', '<div>Front bed: tulips in October, 40 bulbs.</div><div>Back fence: clematis.</div><div><br></div><div>Tomatoes: Early Girl and Sungold. <i>Not</i> by the maple, too much shade.</div>', 600, 180, true],
  ['Notebook', 'Questions for the doctor', '- Ask about the knee, still sore on stairs\n- Refill blood pressure pills\n- Flu shot this year?\n- Bring the list of vitamins', 45, 12],
  ['Notebook', 'Books to read', 'The Thursday Murder Club\nLessons in Chemistry\nA Gentleman in Moscow\nAnything new by Louise Penny', 880, 140],
  ['Notebook', 'Istanbul trip', 'Türkçe birkaç kelime: teşekkür ederim, günaydın, lütfen, çay.\nAyasofya, Kapalıçarşı, Boğaz turu', 300, 290],
  ['Notebook', '京都の旅メモ', '金閣寺、清水寺、伏見稲荷。朝早く行くこと。', 260, 260],
  ['Notebook', 'שלום from the book club', 'הספר הבא: "סיפור על אהבה וחושך". Meeting on the 3rd Thursday.', 150, 150],
  ['Notebook', 'Untitled thought', '', 20, 20],
];

/** The sample as a JSON string (the same shape findNotes() reads), with dates relative to `now`. */
export function sampleJson(now = Date.now()) {
  const books = new Map();
  NOTES.forEach(([book, title, body, made, changed, html], i) => {
    if (!books.has(book)) books.set(book, []);
    books.get(book).push({
      id: `sample-${i + 1}`,
      title,
      [html ? 'bodyHtml' : 'body']: body,
      createdAt: Math.floor((now - made * DAY) / 1000), // seconds
      updatedAt: new Date(now - changed * DAY).toISOString(), // written date
    });
  });
  return JSON.stringify({ sample: 'Made-up notes by Lastleaf, not from Yahoo', notebooks: [...books].map(([name, notes]) => ({ name, notes })) });
}
export const SAMPLE_COUNT = NOTES.length;
