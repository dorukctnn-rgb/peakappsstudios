/* Dayfold's sample: a made-up journal, built in your browser in the same shape as a real Daylio backup, so "Try the
 * sample" goes through exactly the code your own file does. About three years of entries up to today, with activities,
 * one custom mood, a few formatted notes and a dozen photos (drawn by the worker). Nothing here is anyone's real diary. */
const p2 = n => String(n).padStart(2, '0');

const WORDS = {
  en: {
    groups: ['People', 'Body', 'Hobbies', 'Duties'],
    tags: [['friends', 'family', 'date night'], ['walk', 'swim', 'early night', 'yoga'], ['reading', 'piano', 'baking', 'gardening'], ['work', 'study', 'cleaning', 'shopping']],
    calm: 'calm',
    notes: [
      'Long walk by the river after work. The light was gold for about ten minutes.',
      'Coffee with Mara. We talked about her move and laughed about the old flat.',
      'Slow morning. Read forty pages in bed and did not feel bad about it.',
      'Work ran late again. Too many meetings, not enough doing.',
      'Tried the sourdough recipe a second time. Better crust, still too dense.',
      'Rain all day. Cleaned the kitchen and listened to an old album.',
      'Piano practice went well, finally got the left hand of the second page.',
      'Tired and a bit flat. Early night.',
      'Family dinner at my sister’s. The kids made place cards for everyone.',
      'Swam twenty lengths. Felt clear-headed for the rest of the day.',
      'Exam week. Study, sleep, study.',
      'Planted the tulip bulbs before the frost.',
      'Argued with Dan about nothing. Made up over pancakes.',
      'Quiet day. Nothing happened and that was the point.',
    ],
    titles: ['A good one', 'Small wins', 'Note to self', 'Weekend', 'Rough day'],
    list: ['Things that went well', 'finished the report', 'called grandma', 'made soup'],
  },
  es: {
    groups: ['Gente', 'Cuerpo', 'Aficiones', 'Tareas'],
    tags: [['amigos', 'familia', 'cita'], ['paseo', 'natación', 'dormir pronto', 'yoga'], ['lectura', 'piano', 'repostería', 'jardín'], ['trabajo', 'estudio', 'limpieza', 'compras']],
    calm: 'tranquilo',
    notes: [
      'Paseo largo junto al río después del trabajo. La luz se puso dorada unos diez minutos.',
      'Café con Mara. Hablamos de su mudanza y nos reímos del piso antiguo.',
      'Mañana lenta. Leí cuarenta páginas en la cama y sin culpa.',
      'Otra vez salí tarde del trabajo. Muchas reuniones y poco trabajo de verdad.',
      'Segundo intento con la masa madre. Mejor corteza, todavía densa.',
      'Llovió todo el día. Limpié la cocina con un disco antiguo de fondo.',
      'Buen ensayo de piano: por fin sale la mano izquierda de la segunda página.',
      'Cansada y sin ganas. A dormir pronto.',
      'Cena familiar en casa de mi hermana. Los niños hicieron tarjetas con los nombres.',
      'Veinte largos en la piscina. La cabeza despejada el resto del día.',
      'Semana de exámenes. Estudiar, dormir, estudiar.',
      'Planté los bulbos de tulipán antes de las heladas.',
      'Discutí con Dani por una tontería. Hicimos las paces con tortitas.',
      'Día tranquilo. No pasó nada y de eso se trataba.',
    ],
    titles: ['Un buen día', 'Pequeños logros', 'Nota para mí', 'Fin de semana', 'Día difícil'],
    list: ['Lo que salió bien', 'terminé el informe', 'llamé a la abuela', 'hice sopa'],
  },
  pt: {
    groups: ['Pessoas', 'Corpo', 'Hobbies', 'Tarefas'],
    tags: [['amigos', 'família', 'encontro'], ['caminhada', 'natação', 'dormir cedo', 'ioga'], ['leitura', 'piano', 'confeitaria', 'jardinagem'], ['trabalho', 'estudo', 'faxina', 'compras']],
    calm: 'tranquilo',
    notes: [
      'Caminhada longa na beira do rio depois do trabalho. A luz ficou dourada por uns dez minutos.',
      'Café com a Mara. Falamos da mudança dela e rimos do apartamento antigo.',
      'Manhã devagar. Li quarenta páginas na cama, sem culpa.',
      'Saí tarde do trabalho de novo. Reunião demais, trabalho de menos.',
      'Segunda tentativa com o pão de fermentação natural. Casca melhor, ainda denso.',
      'Choveu o dia inteiro. Limpei a cozinha ouvindo um disco antigo.',
      'O piano rendeu: finalmente a mão esquerda da segunda página saiu.',
      'Cansada e meio para baixo. Dormir cedo.',
      'Jantar em família na casa da minha irmã. As crianças fizeram plaquinhas com os nomes.',
      'Vinte piscinas nadando. Cabeça leve pelo resto do dia.',
      'Semana de provas. Estudar, dormir, estudar.',
      'Plantei os bulbos de tulipa antes da geada.',
      'Discuti com o Dani por bobagem. Fizemos as pazes com panquecas.',
      'Dia tranquilo. Nada aconteceu, e era essa a ideia.',
    ],
    titles: ['Um dia bom', 'Pequenas vitórias', 'Nota para mim', 'Fim de semana', 'Dia difícil'],
    list: ['O que deu certo', 'terminei o relatório', 'liguei para a vó', 'fiz sopa'],
  },
  de: {
    groups: ['Menschen', 'Körper', 'Hobbys', 'Pflichten'],
    tags: [['Freunde', 'Familie', 'Date'], ['Spaziergang', 'Schwimmen', 'früh schlafen', 'Yoga'], ['Lesen', 'Klavier', 'Backen', 'Garten'], ['Arbeit', 'Lernen', 'Putzen', 'Einkaufen']],
    calm: 'ruhig',
    notes: [
      'Langer Spaziergang am Fluss nach der Arbeit. Zehn Minuten lang war das Licht golden.',
      'Kaffee mit Mara. Wir haben über ihren Umzug geredet und über die alte Wohnung gelacht.',
      'Langsamer Morgen. Vierzig Seiten im Bett gelesen, ohne schlechtes Gewissen.',
      'Wieder spät aus der Arbeit. Zu viele Meetings, zu wenig geschafft.',
      'Zweiter Versuch mit dem Sauerteig. Bessere Kruste, immer noch zu kompakt.',
      'Den ganzen Tag Regen. Küche geputzt und eine alte Platte gehört.',
      'Klavier lief gut, endlich klappt die linke Hand auf der zweiten Seite.',
      'Müde und etwas lustlos. Früh ins Bett.',
      'Familienessen bei meiner Schwester. Die Kinder haben Tischkarten gebastelt.',
      'Zwanzig Bahnen geschwommen. Den Rest des Tages klarer Kopf.',
      'Prüfungswoche. Lernen, schlafen, lernen.',
      'Die Tulpenzwiebeln vor dem Frost eingesetzt.',
      'Mit Dani über nichts gestritten. Mit Pfannkuchen wieder vertragen.',
      'Ruhiger Tag. Nichts ist passiert, und genau darum ging es.',
    ],
    titles: ['Ein guter Tag', 'Kleine Erfolge', 'Notiz an mich', 'Wochenende', 'Schwerer Tag'],
    list: ['Was gut lief', 'Bericht fertig', 'Oma angerufen', 'Suppe gekocht'],
  },
};
// note indexes that lean good (0-based) and those that lean low
const GOOD_NOTES = [0, 1, 2, 4, 6, 8, 9, 11, 13], LOW_NOTES = [3, 7, 10, 12];

export function sampleBackup(lang = 'en', today = new Date()) {
  const W = WORDS[lang] || WORDS.en;
  let s = 20261022;
  const rnd = () => ((s = (s * 1103515245 + 12345) % 2147483648) / 2147483648);
  const pick = a => a[Math.floor(rnd() * a.length)];
  const created = Date.UTC(today.getFullYear() - 2, 0, 1, 9);
  const customMoods = [1, 2, 3, 4, 5].map(g => ({ id: g, custom_name: '', mood_group_id: g, mood_group_order: 0, predefined_name_id: g, icon_id: g, state: 0, createdAt: 0 }));
  customMoods.push({ id: 6, custom_name: W.calm, mood_group_id: 2, mood_group_order: 1, predefined_name_id: -1, icon_id: 321, state: 0, createdAt: created });
  const tag_groups = W.groups.map((name, i) => ({ id: i + 1, name, order: i, is_expanded: true }));
  const tags = [];
  let tid = 100;
  W.tags.forEach((list, gi) => list.forEach((name, k) => tags.push({ id: tid++, name, icon: 10 + tags.length, order: tags.length, state: 0, id_tag_group: gi + 1, createdAt: created })));
  const T = name => tags.find(t => t.name === name).id;
  const [friends, family, date] = W.tags[0].map(T), [walk, swim, early, yoga] = W.tags[1].map(T);
  const [reading, piano, baking, garden] = W.tags[2].map(T), [work, study, cleaning, shopping] = W.tags[3].map(T);

  const dayEntries = [];
  const assets = [];
  const photos = [];
  let id = 1, aid = 1;
  const start = Date.UTC(today.getFullYear() - 2, 0, 1);
  const end = Date.UTC(today.getFullYear(), today.getMonth(), today.getDate());
  for (let t = start; t <= end; t += 864e5) {
    const D = new Date(t);
    const y = D.getUTCFullYear(), m = D.getUTCMonth(), d = D.getUTCDate(), dow = D.getUTCDay();
    if (rnd() < 0.22) continue; // not every day is written
    const n = rnd() < 0.12 ? 2 : 1;
    for (let k = 0; k < n; k++) {
      const set = new Set();
      const weekend = dow === 0 || dow === 6;
      if (!weekend && rnd() < 0.75) set.add(work);
      if (rnd() < (weekend ? 0.55 : 0.25)) set.add(friends);
      if (rnd() < (weekend ? 0.45 : 0.12)) set.add(family);
      if (rnd() < 0.05) set.add(date);
      if (rnd() < 0.35) set.add(walk);
      if (rnd() < 0.12) set.add(swim);
      if (rnd() < 0.2) set.add(early);
      if (rnd() < 0.1) set.add(yoga);
      if (rnd() < 0.3) set.add(reading);
      if (rnd() < 0.15) set.add(piano);
      if (rnd() < 0.07) set.add(baking);
      if ((m >= 3 && m <= 9) && rnd() < 0.18) set.add(garden);
      if (rnd() < 0.12 || (m === 5 || m === 0) && rnd() < 0.4) set.add(study);
      if (rnd() < 0.15) set.add(cleaning);
      if (rnd() < 0.2) set.add(shopping);
      // the mood leans on the day: better with friends, walks and swims, worse with long work days and exams
      let v = 3.3 + (rnd() - 0.5) * 2.2;
      if (set.has(friends) || set.has(family)) v += 0.55;
      if (set.has(walk) || set.has(swim)) v += 0.45;
      if (set.has(date)) v += 0.7;
      if (set.has(work) && !set.has(walk)) v -= 0.35;
      if (set.has(study)) v -= 0.4;
      if (m === 11 || (m >= 5 && m <= 7)) v += 0.25;
      if (m === 1 || m === 10) v -= 0.25;
      const g = Math.max(1, Math.min(5, 6 - Math.round(v)));
      const mood = g === 2 && rnd() < 0.18 ? 6 : g;
      const h = k === 0 ? 19 + Math.floor(rnd() * 4) : 8 + Math.floor(rnd() * 4), mi = Math.floor(rnd() * 60);
      let note = '', title = '';
      if (rnd() < 0.42) {
        note = g <= 2 ? W.notes[pick(GOOD_NOTES)] : g >= 4 ? W.notes[pick(LOW_NOTES)] : W.notes[Math.floor(rnd() * W.notes.length)];
        if (rnd() < 0.08) note = `<b>${W.list[0]}</b><ul><li>${W.list[1]}</li><li>${W.list[2]}</li><li>${W.list[3]}</li></ul>`;
        else if (rnd() < 0.1) note = note.replace(/\. /, '.<br>');
        if (rnd() < 0.15) title = g <= 2 ? W.titles[pick([0, 1, 3])] : g >= 4 ? W.titles[4] : W.titles[2];
      }
      const entryAssets = [];
      if (k === 0 && rnd() < 0.018) {
        const checksum = Array.from({ length: 32 }, () => '0123456789abcdef'[Math.floor(rnd() * 16)]).join('');
        const createdAt = Date.UTC(y, m, d, h, mi);
        assets.push({ id: aid, checksum, createdAt, createdAtOffset: 0, type: 1, android_metadata: JSON.stringify({ Name: `IMG_${y}${p2(m + 1)}${p2(d)}.jpg`, LastModified: createdAt, Orientation: 0 }) });
        photos.push({ checksum, y, m: m + 1, seed: aid, hue: [24, 200, 140, 330, 45, 260][aid % 6] });
        entryAssets.push(aid++);
      }
      const datetime = Date.UTC(y, m, d, h, mi);
      dayEntries.push({ id: id++, minute: mi, hour: h, day: d, month: m, year: y, datetime, timeZoneOffset: 0, mood, note, note_title: title, tags: [...set], assets: entryAssets });
    }
  }
  dayEntries.reverse(); // Daylio writes the newest first
  return {
    data: {
      version: 18, platform: 'android', pin: '', customMoods, tag_groups, tags, dayEntries, assets, goals: [], goalEntries: [], goalSuccessWeeks: [], prefs: [],
      metadata: { number_of_entries: dayEntries.length, number_of_photos: photos.length, platform: 'android', created_at: created },
    },
    photos,
  };
}
