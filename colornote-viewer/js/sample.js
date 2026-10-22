/* The sample backup behind "Try a sample": made-up notes, in the page's language, built as the same records a real
 * ColorNote backup holds (so the sample goes through the same code as your file). Nothing here is anyone's real data. */
const DAY = 864e5;

// [key, type (0 text, 16 checklist), colour 1-9, folder key, place, days ago (created), days ago (edited), extras]
const PLAN = [
  ['groceries', 16, 3, null, 'notes', 2, 0],
  ['move', 16, 2, 'home', 'notes', 40, 6],
  ['soup', 0, 4, 'recipes', 'notes', 210, 95],
  ['books', 16, 5, null, 'notes', 330, 21],
  ['gifts', 0, 6, null, 'notes', 58, 12],
  ['landlord', 0, 8, 'home', 'notes', 120, 120],
  ['dentist', 0, 1, null, 'notes', 9, 9, { reminder: { days: 5, type: 32, hour: 9, minute: 30 } }],
  ['packing', 16, 4, 'travel', 'notes', 26, 3],
  ['car', 0, 7, null, 'notes', 400, 77],
  ['garden', 0, 3, 'home', 'notes', 75, 30, { fmt: true }],
  ['plants', 16, 4, 'home', 'notes', 160, 1, { reminder: { days: 2, type: 16, repeat: 48 } }],
  ['quotes', 0, 9, null, 'notes', 520, 300],
  ['pancakes', 0, 2, 'recipes', 'notes', 600, 410],
  ['codes', 0, 7, null, 'notes', 700, 690, { locked: true }],
  ['oldaddress', 0, 8, null, 'archive', 900, 610],
  ['oldlist', 16, 3, null, 'trash', 30, 15],
];

const TEXT = {
  en: {
    folders: { home: 'Home', recipes: 'Recipes', travel: 'Travel' },
    groceries: ['Groceries', '[V] Oat milk\n[ ] Eggs\n[ ] Fresh basil\n[V] Coffee beans\n[ ] Rice\n[ ] Washing-up liquid\n'],
    move: ['Before we move out', '[V] Read the electricity meter\n[ ] Cancel the gym\n[ ] Forward the post\n[ ] Give the router back\n[ ] Photos of every room\n'],
    soup: ['Red lentil soup', '1 onion, 2 carrots, 1 cup red lentils, 1 l stock, cumin, lemon.\n\nSoften the onion and carrots for 8 minutes. Add the lentils and stock, simmer 20 minutes. Blend half. Lemon juice at the end.'],
    books: ['Books to read', '[V] The Remains of the Day\n[ ] Pachinko\n[ ] A Gentleman in Moscow\n[V] Educated\n[ ] The Overstory\n'],
    gifts: ['Gift ideas for Mum', 'Gardening gloves (size M)\nThe photo book from the summer\nTickets for the choir concert in December'],
    landlord: ['Call with the landlord', 'He agreed to fix the bathroom fan before the end of the month.\nRent stays the same until next spring.\nAsk again about the radiator in the bedroom.'],
    dentist: ['Dentist', 'Check-up at 9:30. Bring the insurance card.'],
    packing: ['Packing for Lisbon', '[V] Passport\n[V] Charger and adapter\n[ ] Sun cream\n[ ] Walking shoes\n[ ] Rain jacket\n[ ] Euros for the tram\n'],
    car: ['Car service', 'Last service at 48,200 km.\nNext oil change around 63,000 km.\nFront tyres replaced in March.'],
    garden: ['Garden plan', 'Spring\nTomatoes along the south fence, basil between them.\nAsk the neighbour about the shared hedge.\nOrder compost before April'],
    plants: ['Water the plants', '[V] Monstera\n[ ] Basil on the windowsill\n[ ] Lemon tree\n[ ] Ferns in the bathroom\n'],
    quotes: ['Quotes', '"The best time to plant a tree was 20 years ago. The second best time is now."\n\n"Done is better than perfect."'],
    pancakes: ['Pancakes', '200 g flour, 2 eggs, 300 ml milk, a pinch of salt.\nRest the batter for 30 minutes.'],
    codes: ['Locker codes', ''],
    oldaddress: ['Old address', '14 Elm Street, flat 3\nThe key for the bike shed is with the neighbour.'],
    oldlist: ['Shopping', '[V] Bread\n[V] Apples\n'],
  },
  ja: {
    folders: { home: '家のこと', recipes: 'レシピ', travel: '旅行' },
    groceries: ['買い物リスト', '[V] 牛乳\n[ ] 卵\n[ ] 豆腐\n[V] コーヒー豆\n[ ] お米\n[ ] 食器用洗剤\n'],
    move: ['引っ越し前にやること', '[V] 電気メーターの写真を撮る\n[ ] ジムの解約\n[ ] 郵便の転送届\n[ ] ルーターの返却\n[ ] 部屋の写真を撮っておく\n'],
    soup: ['豚汁', '豚肉 150g、大根 1/4本、にんじん 1本、ごぼう 1/2本、こんにゃく、味噌 大さじ3。\n\n具材を炒めてから水 800ml を入れて15分煮る。火を止めて味噌を溶く。'],
    books: ['読みたい本', '[V] 博士の愛した数式\n[ ] 流浪の月\n[ ] 君たちはどう生きるか\n[V] コンビニ人間\n[ ] 羊と鋼の森\n'],
    gifts: ['母の誕生日プレゼント', 'ガーデニング用の手袋（Mサイズ）\n夏の写真をまとめたアルバム\n12月の合唱コンサートのチケット'],
    landlord: ['大家さんとの電話', '浴室の換気扇は月末までに直してもらえることになった。\n家賃は来年の春まで据え置き。\n寝室の暖房についてもう一度聞く。'],
    dentist: ['歯医者', '9時半から定期検診。保険証を忘れずに。'],
    packing: ['京都旅行の持ち物', '[V] 身分証\n[V] 充電器\n[ ] 日焼け止め\n[ ] 歩きやすい靴\n[ ] 折りたたみ傘\n[ ] ICカード\n'],
    car: ['車の点検', '前回の点検は 48,200km。\n次のオイル交換は 63,000km ごろ。\n前輪のタイヤは3月に交換済み。'],
    garden: ['ベランダ菜園の計画', '春\nミニトマトを南側に、間にバジル。\n隣の家に共有の生け垣のことを聞く。\n4月までに培養土を注文'],
    plants: ['植物の水やり', '[V] モンステラ\n[ ] 窓辺のバジル\n[ ] レモンの木\n[ ] 浴室のシダ\n'],
    quotes: ['好きな言葉', '「木を植えるのに一番良い時期は20年前だった。次に良い時期は今だ。」\n\n「完璧を目指すより、まず終わらせろ。」'],
    pancakes: ['ホットケーキ', '小麦粉 200g、卵 2個、牛乳 300ml、塩ひとつまみ。\n生地は30分休ませる。'],
    codes: ['ロッカーの暗証番号', ''],
    oldaddress: ['前の住所', '桜町 2-14-3 202号室\n自転車置き場の鍵はお隣さんに預けてある。'],
    oldlist: ['買い物', '[V] パン\n[V] りんご\n'],
  },
  ko: {
    folders: { home: '집안일', recipes: '레시피', travel: '여행' },
    groceries: ['장보기 목록', '[V] 우유\n[ ] 계란\n[ ] 두부\n[V] 원두\n[ ] 쌀\n[ ] 주방세제\n'],
    move: ['이사 전에 할 일', '[V] 전기 계량기 사진 찍기\n[ ] 헬스장 해지\n[ ] 우편물 주소 이전 신청\n[ ] 공유기 반납\n[ ] 방마다 사진 남기기\n'],
    soup: ['된장찌개', '애호박 1/2개, 두부 반 모, 감자 1개, 양파 1/2개, 된장 2큰술, 멸치 육수 500ml.\n\n육수에 된장을 풀고 감자를 먼저 넣어 5분 끓인다. 나머지 재료를 넣고 10분 더 끓인다.'],
    books: ['읽고 싶은 책', '[V] 소년이 온다\n[ ] 아몬드\n[ ] 불편한 편의점\n[V] 채식주의자\n[ ] 달러구트 꿈 백화점\n'],
    gifts: ['엄마 생일 선물', '정원용 장갑 (M 사이즈)\n여름 사진으로 만든 포토북\n12월 합창 공연 티켓'],
    landlord: ['집주인과 통화', '욕실 환풍기는 이번 달 안에 고쳐 주기로 했다.\n월세는 내년 봄까지 그대로.\n안방 난방 문제도 다시 물어보기.'],
    dentist: ['치과', '9시 30분 정기 검진. 신분증 챙기기.'],
    packing: ['제주도 여행 짐', '[V] 신분증\n[V] 충전기\n[ ] 선크림\n[ ] 편한 운동화\n[ ] 우비\n[ ] 교통카드\n'],
    car: ['자동차 정비', '마지막 정비 48,200km.\n다음 엔진오일 교체는 63,000km쯤.\n앞 타이어는 3월에 교체함.'],
    garden: ['베란다 텃밭 계획', '봄\n남쪽에 방울토마토, 사이사이 바질.\n옆집에 같이 쓰는 울타리 얘기하기.\n4월 전에 상토 주문'],
    plants: ['식물 물 주기', '[V] 몬스테라\n[ ] 창가의 바질\n[ ] 레몬 나무\n[ ] 욕실 고사리\n'],
    quotes: ['좋아하는 문장', '"나무를 심기에 가장 좋은 때는 20년 전이었다. 그다음으로 좋은 때는 지금이다."\n\n"완벽한 것보다 끝낸 것이 낫다."'],
    pancakes: ['팬케이크', '밀가루 200g, 계란 2개, 우유 300ml, 소금 한 꼬집.\n반죽은 30분 휴지.'],
    codes: ['사물함 비밀번호', ''],
    oldaddress: ['예전 주소', '서울시 마포구 연남로 14, 302호\n자전거 보관소 열쇠는 옆집에 맡겨 둠.'],
    oldlist: ['장보기', '[V] 빵\n[V] 사과\n'],
  },
  es: {
    folders: { home: 'Casa', recipes: 'Recetas', travel: 'Viajes' },
    groceries: ['Compras', '[V] Leche de avena\n[ ] Huevos\n[ ] Albahaca fresca\n[V] Café en grano\n[ ] Arroz\n[ ] Lavavajillas\n'],
    move: ['Antes de la mudanza', '[V] Anotar la lectura de la luz\n[ ] Dar de baja el gimnasio\n[ ] Cambiar la dirección del correo\n[ ] Devolver el router\n[ ] Fotos de cada habitación\n'],
    soup: ['Sopa de lentejas', '1 cebolla, 2 zanahorias, 1 taza de lentejas rojas, 1 l de caldo, comino, limón.\n\nRehoga la cebolla y la zanahoria 8 minutos. Añade las lentejas y el caldo y cuece 20 minutos. Tritura la mitad. Limón al final.'],
    books: ['Libros por leer', '[V] Cien años de soledad\n[ ] La sombra del viento\n[ ] Patria\n[V] Rayuela\n[ ] Los pacientes del doctor García\n'],
    gifts: ['Regalos para mamá', 'Guantes de jardín (talla M)\nEl álbum de fotos del verano\nEntradas para el concierto del coro en diciembre'],
    landlord: ['Llamada con el casero', 'Arreglará el extractor del baño antes de fin de mes.\nEl alquiler no sube hasta la primavera.\nPreguntar otra vez por el radiador del dormitorio.'],
    dentist: ['Dentista', 'Revisión a las 9:30. Llevar la tarjeta del seguro.'],
    packing: ['Maleta para Lisboa', '[V] Pasaporte\n[V] Cargador y adaptador\n[ ] Protector solar\n[ ] Zapatillas cómodas\n[ ] Chubasquero\n[ ] Euros para el tranvía\n'],
    car: ['Revisión del coche', 'Última revisión a los 48.200 km.\nPróximo cambio de aceite hacia los 63.000 km.\nRuedas delanteras cambiadas en marzo.'],
    garden: ['Plan del huerto', 'Primavera\nTomates junto a la valla sur, albahaca entre ellos.\nHablar con el vecino del seto compartido.\nPedir compost antes de abril'],
    plants: ['Regar las plantas', '[V] Monstera\n[ ] Albahaca de la ventana\n[ ] Limonero\n[ ] Helechos del baño\n'],
    quotes: ['Frases', '"El mejor momento para plantar un árbol fue hace 20 años. El segundo mejor momento es ahora."\n\n"Hecho es mejor que perfecto."'],
    pancakes: ['Tortitas', '200 g de harina, 2 huevos, 300 ml de leche, una pizca de sal.\nDejar reposar la masa 30 minutos.'],
    codes: ['Códigos de las taquillas', ''],
    oldaddress: ['Dirección antigua', 'Calle del Olmo 14, 3.º B\nLa llave del cuarto de bicis la tiene la vecina.'],
    oldlist: ['Compra', '[V] Pan\n[V] Manzanas\n'],
  },
  pt: {
    folders: { home: 'Casa', recipes: 'Receitas', travel: 'Viagens' },
    groceries: ['Mercado', '[V] Leite\n[ ] Ovos\n[ ] Manjericão\n[V] Café em grão\n[ ] Arroz\n[ ] Detergente\n'],
    move: ['Antes da mudança', '[V] Anotar a leitura do relógio de luz\n[ ] Cancelar a academia\n[ ] Mudar o endereço dos Correios\n[ ] Devolver o roteador\n[ ] Fotos de cada cômodo\n'],
    soup: ['Sopa de lentilha', '1 cebola, 2 cenouras, 1 xícara de lentilha vermelha, 1 l de caldo, cominho, limão.\n\nRefogue a cebola e a cenoura por 8 minutos. Junte a lentilha e o caldo e cozinhe por 20 minutos. Bata metade. Limão no final.'],
    books: ['Livros para ler', '[V] Dom Casmurro\n[ ] Torto Arado\n[ ] A hora da estrela\n[V] Capitães da Areia\n[ ] O avesso da pele\n'],
    gifts: ['Presentes para a mãe', 'Luvas de jardinagem (tamanho M)\nO álbum de fotos do verão\nIngressos para o concerto do coral em dezembro'],
    landlord: ['Ligação com o proprietário', 'Ele vai consertar o exaustor do banheiro até o fim do mês.\nO aluguel fica igual até a primavera.\nPerguntar de novo sobre o aquecedor do quarto.'],
    dentist: ['Dentista', 'Consulta de rotina às 9h30. Levar a carteirinha do convênio.'],
    packing: ['Mala para Lisboa', '[V] Passaporte\n[V] Carregador e adaptador\n[ ] Protetor solar\n[ ] Tênis confortável\n[ ] Capa de chuva\n[ ] Euros para o bonde\n'],
    car: ['Revisão do carro', 'Última revisão com 48.200 km.\nPróxima troca de óleo por volta dos 63.000 km.\nPneus dianteiros trocados em março.'],
    garden: ['Plano da horta', 'Primavera\nTomates junto ao muro sul, manjericão entre eles.\nConversar com o vizinho sobre a cerca viva.\nEncomendar adubo antes de abril'],
    plants: ['Regar as plantas', '[V] Costela-de-adão\n[ ] Manjericão da janela\n[ ] Limoeiro\n[ ] Samambaias do banheiro\n'],
    quotes: ['Frases', '"O melhor momento para plantar uma árvore foi há 20 anos. O segundo melhor momento é agora."\n\n"Feito é melhor que perfeito."'],
    pancakes: ['Panquecas', '200 g de farinha, 2 ovos, 300 ml de leite, uma pitada de sal.\nDeixar a massa descansar por 30 minutos.'],
    codes: ['Senhas dos armários', ''],
    oldaddress: ['Endereço antigo', 'Rua das Palmeiras, 14, apto 302\nA chave do bicicletário ficou com a vizinha.'],
    oldlist: ['Compras', '[V] Pão\n[V] Maçãs\n'],
  },
};

// the "garden plan" note carries ColorNote formatting: a headline, bold, a highlight
function gardenFormat(text) {
  const lines = text.split('\n');
  const at = i => lines.slice(0, i).reduce((n, l) => n + l.length + 1, 0);
  const f = [{ format: 'headline1', start: 0, end: lines[0].length }];
  const l3 = at(3);
  f.push({ format: 'bold', start: l3, end: l3 + lines[3].length });
  const l1 = at(1);
  f.push({ format: 'bg_color', start: l1, end: l1 + lines[1].length, attribute: 'highlight_yellow' });
  return JSON.stringify({ format_list: f, version: 1 });
}

/** Records shaped like a ColorNote backup's, for `lang` (en, ja, ko, es, pt), dated relative to `now`. */
export function sampleRecords(lang = 'en', now = Date.now()) {
  const T = TEXT[lang] || TEXT.en;
  const FOLDER_IDS = { home: 31001, recipes: 31002, travel: 31003 };
  const recs = [];
  let id = 1;
  const minute = ms => Math.floor(ms / 60000) * 60000;
  for (const [key, fid] of Object.entries(FOLDER_IDS)) {
    recs.push({ _id: id++, title: T.folders[key], note: JSON.stringify({ icon_id: 'folder', folder_state: 1, folder_id: fid }), type: 128, active_state: 256, space: 0, encrypted: 0, color_index: key === 'recipes' ? 4 : key === 'travel' ? 5 : 3, folder_id: 512, created_date: now - 800 * DAY, modified_date: now - 800 * DAY });
  }
  recs.push({ _id: id++, title: 'syncable_settings', note: '{"T":1,"V":1,"D":{}}', type: 256, active_state: 256, space: 0, encrypted: 0, color_index: 3, folder_id: 256 });
  for (const [key, type, color, folder, place, made, edited, extra = {}] of PLAN) {
    const [title, note] = T[key];
    const created = minute(now - made * DAY - 7.3e6 * (id % 5));
    const r = {
      _id: id++, uuid: `sample-${key}-0000-4000-8000-${String(id).padStart(12, '0')}`, title, note: extra.locked ? 'U2FtcGxlTG9ja2VkTm90ZQ==' : note,
      note_ext: extra.fmt ? gardenFormat(note) : '', type, color_index: color, folder_id: folder ? FOLDER_IDS[folder] : 0,
      space: place === 'archive' ? 16 : 0, active_state: place === 'trash' ? 16 : 0, encrypted: extra.locked ? 1 : 0,
      created_date: created, modified_date: Math.max(created, minute(now - edited * DAY - 3.1e6 * (id % 4))),
      reminder_type: 0, reminder_date: 0, reminder_base: 0, reminder_repeat: 0, tags: '', latitude: 0, longitude: 0,
    };
    if (extra.reminder) {
      const d = new Date(now + extra.reminder.days * DAY);
      if (extra.reminder.type === 16) { r.reminder_base = Date.UTC(d.getFullYear(), d.getMonth(), d.getDate()); r.reminder_date = r.reminder_base; }
      else { d.setHours(extra.reminder.hour, extra.reminder.minute, 0, 0); r.reminder_date = d.getTime(); r.reminder_base = d.getTime(); }
      r.reminder_type = extra.reminder.type;
      r.reminder_repeat = extra.reminder.repeat || 0;
      if (extra.reminder.type === 16) r.folder_id = r.folder_id || 16;
    }
    recs.push(r);
  }
  // a note deleted for good: ColorNote keeps an empty record; it is counted, not shown
  recs.push({ _id: id++, title: '', note: '', type: 0, active_state: 32, space: 0, encrypted: 0, color_index: 3, folder_id: 0, created_date: now - 50 * DAY, modified_date: now - 49 * DAY });
  return recs;
}
