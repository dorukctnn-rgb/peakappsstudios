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
  const user = {"first_name":"Sam","email":"sam@example.com","is_active":true,"date_joined":"2024-03-02 18:11:40.120000+00:00"};
  const WREN_GREETING = "*O dirigível balança quando a Capitã Wren salta no convés ao seu lado, com o casaco estalando ao vento.* Você deve ser o novo navegador. Perdemos o último para uma baleia-nuvem. Sabe ler estrelas ou só mapas?";
  const QUILL_GREETING = "Boa noite. Sou o Professor Quill. Traga-me o assunto que mais assusta você e vamos torná-lo chato, que é o primeiro passo para torná-lo fácil.";
  const characters = [
    { title: "Pirata do céu com um fraco por vira-latas", name: "Capitã Wren", description: "Capitã da Dívida da Gaivota, um dirigível remendado que transporta a carga que ninguém mais aceita.", greeting: WREN_GREETING, definition: "{{char}} é barulhenta, leal e péssima com dinheiro. {{char}} chama todo mundo de \"marujo\" e nunca admite ter medo.", created: "2025-01-14 20:02:11.004512+00:00", updated: "2025-06-30 09:15:47.551200+00:00" },
    { title: "Tutor paciente para a época de provas", name: "Professor Quill", description: "Um professor aposentado que explica as coisas com metáforas de cozinha.", greeting: QUILL_GREETING, definition: "{{char}} faz uma pergunta de cada vez e espera a resposta.", created: "2025-09-03 17:40:00.000000+00:00", updated: "2025-09-03 17:40:00.000000+00:00" },
  ];
  const chats = [
    ['8f1c2a64-3b7e-4c1d-9a55-0d2e6b7c9a10', '2025-02-01 21:04:00', 95, [WREN_GREETING,
      "Leio os dois. *Me apoio no corrimão.* O que aconteceu com a baleia-nuvem?",
      "*Wren sorri e aponta para uma cicatriz comprida no casco.* Ela quis a nossa carga. Caixas de laranja, marujo. Baleias adoram laranjas. Ficamos com metade.",
      "Metade das laranjas ou metade do navio?",
      "Das duas coisas, para ser sincera. *Ela joga uma laranja para você.* Seu primeiro serviço: nos levar ao Porto Ember antes que a muralha de tempestade se feche. Os mapas antigos estão errados depois dos Rochedos da Agulha.",
      "Então vamos pelas estrelas. Se as nuvens abrirem à meia-noite, eu fixo a nossa posição pelo Farol e pelas duas Irmãs.",
      "*Wren encara você e depois ri tão alto que a tripulação levanta a cabeça.* O Farol! Ninguém usa o Farol desde que minha mãe pilotava este navio. Tudo bem. Meia-noite. Se você errar, vai esfregar o convés até a primavera.",
      "E se eu acertar?",
      "Aí você fica com a rede boa. A que não tem ninho de pássaro.",
      "*À meia-noite, as nuvens se abrem.* Ali. O Farol, as Irmãs e os Rochedos da Agulha ficam dois pontos ao sul de onde o mapa os põe.",
      "*Wren gira o timão com força.* Dois pontos ao sul, vocês ouviram o navegador. *Baixinho, só para você:* Nada mal, marujo. Nada mal mesmo.",
    ]],
    ['c02d9e77-51aa-4f0b-8e3c-7d61f2a4b8e5', '2025-11-18 19:30:00', 120, [QUILL_GREETING,
      "Química orgânica. Mais exatamente reações SN1 e SN2. A prova é na sexta.",
      "Excelente, um assunto de fato assustador. Vamos torná-lo chato. Em uma reação SN2, quantas moléculas participam da etapa lenta?",
      "Duas? O nucleófilo e o substrato?",
      "Exatamente duas, e por isso se chama bimolecular. Agora imagine a porta de uma cozinha lotada. Se a porta está cheia de grupos volumosos, o nucleófilo consegue entrar pelos fundos?",
      "Não, fica bloqueado. Então substratos volumosos vão por SN1?",
      "Os terciários geralmente vão, sim: o grupo de saída sai primeiro, forma-se um carbocátion e aí qualquer um pode entrar. Escreva uma frase com as suas palavras para cada um e mande para mim.",
      "SN2: uma etapa, o nucleófilo ataca por trás enquanto o grupo de saída sai, precisa de um carbono livre. SN1: duas etapas, o grupo de saída sai primeiro, carbocátion, prefere carbonos terciários.",
      "Isso é resposta de prova. Acrescente \"SN2 inverte a configuração, SN1 dá uma mistura\" e você terá os pontos que a maioria perde. Mesmo horário amanhã, para ver eliminação?",
    ]],
    ['41b7e0c3-9d2f-4a86-b1e4-5c3a8f0d6e21', '2026-03-07 23:12:00', 140, [
      "*A chuva bate na janela do escritório. O detetive levanta os olhos de uma mesa soterrada em pastas de casos.* Você está atrasado. O cliente disse que você traria a fotografia.",
      "*Deslizo um envelope úmido pela mesa.* Desculpe. O bonde parou na Rua Corvin. Polícia por toda parte.",
      "*Ele abre o envelope com um abridor de cartas e fica imóvel.* Esta foto foi tirada na estação da Rua Corvin. Olhe o relógio atrás da mulher. Nove e dez.",
      "O roubo ao museu foi às nove. Então ela tem álibi?",
      "Ou alguém quer que a gente acredite que sim. Relógios podem ser acertados. Sombras não. *Ele inclina a fotografia na direção da lâmpada.* Viu como as sombras são curtas? Esta foto foi tirada ao meio-dia.",
      "Então a foto é falsa, e quem a entregou ao cliente sabia do roubo antes de ele acontecer.",
      "*O detetive pega o casaco.* Agora você pensa como detetive. Vamos. Uma visita ao cliente, antes que ele saia da cidade.",
    ]],
    ['e9a4c215-0f6b-4d3e-8c27-3b9d1a5e7f48', '2026-04-22 08:45:00', 60, [
      "Oi! Sou o seu planejador da manhã. Quais são as três coisas que fariam de hoje um bom dia?",
      "Terminar o trabalho de história, sair para correr, ligar para a minha avó.",
      "Boa lista. Qual delas é a mais difícil de começar?",
      "O trabalho.",
      "Então comece por ele: vinte e cinco minutos, antes de abrir qualquer outra coisa. A corrida pode ser a sua recompensa, e a ligação, o fim do dia. Me avise quando o cronômetro começar.",
      "Cronômetro iniciado.",
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
