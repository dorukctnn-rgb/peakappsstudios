// Sample notes for the "Look at sample notes" button: invented text, one per colour, in the page's language. They are built here, not
// read from a file, so a visitor without a Sticky Notes file can see what a result looks like.
import { titleOf } from './sticky.js';

const RAW = {
  en: [
    ['Yellow', ['Groceries', 'oat milk', 'lemons', 'rye bread', 'the good coffee'], 2],
    ['Pink', ['Call Maya about Saturday', 'she has the ladder', 'bring the blue extension cord'], 30],
    ['Blue', ['Router admin page', '192.168.0.1', 'password is on the fridge, not here'], 300],
    ['Green', ['Pasta sauce', 'two tins tomatoes, one onion, garlic', 'simmer 25 minutes, add basil last'], 1500],
    ['Purple', ['Book ideas', 'a lighthouse keeper who collects other people\'s lost umbrellas'], 4000],
    ['Gray', ['Meeting 14:00', 'agenda: budget, hiring, the new printer'], 9000],
    ['Charcoal', ['Backup the photos before Friday'], 20000],
    ['Yellow', ['Old note, deleted last week', 'dentist 9:30'], 12000, true],
  ],
  es: [
    ['Yellow', ['Lista de la compra', 'leche de avena', 'limones', 'pan de centeno', 'el café bueno'], 2],
    ['Pink', ['Llamar a Maya por el sábado', 'ella tiene la escalera', 'llevar el alargador azul'], 30],
    ['Blue', ['Página del router', '192.168.0.1', 'la contraseña está en la nevera, no aquí'], 300],
    ['Green', ['Salsa de pasta', 'dos latas de tomate, una cebolla, ajo', 'cocer 25 minutos, albahaca al final'], 1500],
    ['Purple', ['Ideas para un libro', 'un farero que colecciona los paraguas que otros pierden'], 4000],
    ['Gray', ['Reunión a las 14:00', 'orden del día: presupuesto, contratación, la impresora nueva'], 9000],
    ['Charcoal', ['Copia de las fotos antes del viernes'], 20000],
    ['Yellow', ['Nota vieja, borrada la semana pasada', 'dentista 9:30'], 12000, true],
  ],
  pt: [
    ['Yellow', ['Lista do mercado', 'leite de aveia', 'limões', 'pão de centeio', 'o café bom'], 2],
    ['Pink', ['Ligar para a Maya sobre sábado', 'ela tem a escada', 'levar a extensão azul'], 30],
    ['Blue', ['Página do roteador', '192.168.0.1', 'a senha está na geladeira, não aqui'], 300],
    ['Green', ['Molho de macarrão', 'duas latas de tomate, uma cebola, alho', 'ferver 25 minutos, manjericão por último'], 1500],
    ['Purple', ['Ideias de livro', 'um faroleiro que coleciona os guarda-chuvas que os outros perdem'], 4000],
    ['Gray', ['Reunião às 14h', 'pauta: orçamento, contratações, a impressora nova'], 9000],
    ['Charcoal', ['Backup das fotos antes de sexta'], 20000],
    ['Yellow', ['Nota antiga, apagada semana passada', 'dentista 9h30'], 12000, true],
  ],
  ja: [
    ['Yellow', ['買い物', '牛乳', 'レモン', 'ライ麦パン', 'いいほうのコーヒー'], 2],
    ['Pink', ['土曜のことで美咲に電話', '脚立は彼女が持っている', '青い延長コードを持っていく'], 30],
    ['Blue', ['ルーターの管理画面', '192.168.0.1', 'パスワードは冷蔵庫のメモ、ここには書かない'], 300],
    ['Green', ['パスタソース', 'トマト缶2つ、玉ねぎ1個、にんにく', '25分煮て、バジルは最後に'], 1500],
    ['Purple', ['小説のアイデア', '人が忘れた傘を集める灯台守'], 4000],
    ['Gray', ['14時から会議', '議題: 予算、採用、新しいプリンター'], 9000],
    ['Charcoal', ['金曜までに写真のバックアップ'], 20000],
    ['Yellow', ['先週消した古いメモ', '歯医者 9:30'], 12000, true],
  ],
  ko: [
    ['Yellow', ['장보기', '귀리 우유', '레몬', '호밀빵', '좋은 커피'], 2],
    ['Pink', ['토요일 일로 민아에게 전화', '사다리는 민아가 가지고 있음', '파란 멀티탭 챙기기'], 30],
    ['Blue', ['공유기 관리 페이지', '192.168.0.1', '비밀번호는 냉장고 메모에 있고 여기에는 없음'], 300],
    ['Green', ['파스타 소스', '토마토 통조림 2개, 양파 1개, 마늘', '25분 끓이고 바질은 마지막에'], 1500],
    ['Purple', ['소설 아이디어', '남들이 잃어버린 우산을 모으는 등대지기'], 4000],
    ['Gray', ['14시 회의', '안건: 예산, 채용, 새 프린터'], 9000],
    ['Charcoal', ['금요일 전에 사진 백업'], 20000],
    ['Yellow', ['지난주에 지운 오래된 메모', '치과 9:30'], 12000, true],
  ],
};

/** The sample notes for a language as the same objects the engine produces. */
export function sampleNotes(lang, now = Date.now()) {
  return (RAW[lang] || RAW.en).map(([theme, lines, minutes, deleted], i) => {
    const text = lines.join('\n');
    return { id: `sample-${i}`, text, title: titleOf(text), theme, created: now - (minutes + 200) * 60000, modified: now - minutes * 60000, deleted: deleted ? now - minutes * 30000 : 0, pictures: i === 1 ? 1 : 0, source: 'sample', open: false };
  });
}
