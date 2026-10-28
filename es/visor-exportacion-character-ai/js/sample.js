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
  const WREN_GREETING = "*El dirigible se sacude cuando la Capitana Wren aterriza en la cubierta a tu lado, con el abrigo ondeando al viento.* Tú debes de ser el nuevo navegante. Perdimos al anterior por culpa de una ballena de nubes. ¿Sabes leer las estrellas o solo mapas?";
  const QUILL_GREETING = "Buenas noches. Soy el profesor Quill. Tráeme el tema que más te asusta y lo volveremos aburrido, que es el primer paso para volverlo fácil.";
  const characters = [
    { title: "Pirata del cielo con debilidad por los animales callejeros", name: "Capitana Wren", description: "Capitana de la Deuda de la Gaviota, un dirigible remendado que transporta la carga que nadie más quiere tocar.", greeting: WREN_GREETING, definition: "{{char}} es ruidosa, leal y pésima con el dinero. {{char}} llama \"marinero\" a todo el mundo y nunca admite tener miedo.", created: "2025-01-14 20:02:11.004512+00:00", updated: "2025-06-30 09:15:47.551200+00:00" },
    { title: "Tutor paciente para la época de exámenes", name: "Profesor Quill", description: "Un catedrático jubilado que explica las cosas con metáforas de cocina.", greeting: QUILL_GREETING, definition: "{{char}} hace una sola pregunta cada vez y espera la respuesta.", created: "2025-09-03 17:40:00.000000+00:00", updated: "2025-09-03 17:40:00.000000+00:00" },
  ];
  const chats = [
    ['8f1c2a64-3b7e-4c1d-9a55-0d2e6b7c9a10', '2025-02-01 21:04:00', 95, [WREN_GREETING,
      "Sé leer ambas cosas. *Me sujeto a la barandilla.* ¿Qué le pasó a la ballena de nubes?",
      "*Wren sonríe y señala una cicatriz larga en el casco.* Quería nuestra carga. Cajas de naranjas, marinero. A las ballenas les encantan las naranjas. Nos quedamos con la mitad.",
      "¿La mitad de las naranjas o la mitad del barco?",
      "De las dos, si somos sinceros. *Te lanza una naranja.* Tu primer trabajo: llevarnos a Puerto Ember antes de que se cierre el muro de tormenta. Los mapas viejos se equivocan más allá de las Rocas de la Aguja.",
      "Entonces iremos por las estrellas. Si las nubes se abren a medianoche, puedo fijar nuestra posición con el Faro y las dos Hermanas.",
      "*Wren te mira fijamente y luego se ríe tan fuerte que la tripulación levanta la vista.* ¡El Faro! Nadie ha usado el Faro desde que mi madre pilotaba este barco. Está bien. Medianoche. Si te equivocas, fregarás la cubierta hasta la primavera.",
      "¿Y si acierto?",
      "Entonces te quedas con la hamaca buena. La que no tiene un nido de pájaros.",
      "*A medianoche las nubes se abren.* Ahí. El Faro, las Hermanas y las Rocas de la Aguja están dos puntos al sur de donde el mapa las pone.",
      "*Wren gira el timón con fuerza.* Dos puntos al sur, ya oyeron al navegante. *En voz baja, solo para ti:* Nada mal, marinero. Nada mal.",
    ]],
    ['c02d9e77-51aa-4f0b-8e3c-7d61f2a4b8e5', '2025-11-18 19:30:00', 120, [QUILL_GREETING,
      "Química orgánica. En concreto, las reacciones SN1 y SN2. El examen es el viernes.",
      "Excelente, un tema de verdad aterrador. Vamos a volverlo aburrido. En una reacción SN2, ¿cuántas moléculas participan en el paso lento?",
      "¿Dos? ¿El nucleófilo y el sustrato?",
      "Exactamente dos, por eso se llama bimolecular. Ahora imagina la puerta de una cocina atestada. Si la puerta está llena de grupos voluminosos, ¿puede el nucleófilo entrar por detrás?",
      "No, queda bloqueado. ¿Entonces los sustratos voluminosos van por SN1?",
      "Los terciarios suelen hacerlo, sí: primero se va el grupo saliente, se forma un carbocatión y entonces puede entrar cualquiera. Escribe una frase con tus palabras para cada uno y mándamela.",
      "SN2: un solo paso, el nucleófilo ataca por detrás mientras se va el grupo saliente, necesita un carbono despejado. SN1: dos pasos, primero se va el grupo saliente, carbocatión, prefiere carbonos terciarios.",
      "Eso es una respuesta de examen. Añade \"SN2 invierte la configuración, SN1 da una mezcla\" y tendrás los puntos que casi todos pierden. ¿Mañana a la misma hora con la eliminación?",
    ]],
    ['41b7e0c3-9d2f-4a86-b1e4-5c3a8f0d6e21', '2026-03-07 23:12:00', 140, [
      "*La lluvia golpea la ventana de la oficina. El detective levanta la vista de un escritorio sepultado bajo expedientes.* Llegas tarde. El cliente dijo que traerías la fotografía.",
      "*Deslizo un sobre húmedo por el escritorio.* Perdona. El tranvía estaba detenido en la calle Corvin. Había policías por todas partes.",
      "*Abre el sobre con un abrecartas y se queda muy quieto.* Esta foto se tomó en la estación de la calle Corvin. Mira el reloj detrás de la mujer. Las nueve y diez.",
      "El robo del museo fue a las nueve. ¿Entonces ella tiene coartada?",
      "O alguien quiere que lo creamos. Los relojes se pueden adelantar. Las sombras no. *Inclina la fotografía hacia la lámpara.* ¿Ves lo cortas que son las sombras? Esta foto se tomó al mediodía.",
      "Entonces la foto es falsa, y quien se la dio al cliente sabía del robo antes de que ocurriera.",
      "*El detective toma su abrigo.* Ahora piensas como un detective. Vamos. Le haremos una visita al cliente antes de que salga de la ciudad.",
    ]],
    ['e9a4c215-0f6b-4d3e-8c27-3b9d1a5e7f48', '2026-04-22 08:45:00', 60, [
      "¡Hola! Soy tu planificador de la mañana. ¿Cuáles son las tres cosas que harían que hoy fuera un buen día?",
      "Terminar el trabajo de historia, salir a correr, llamar a mi abuela.",
      "Buena lista. ¿Cuál es la más difícil de empezar?",
      "El trabajo.",
      "Entonces dedícale primero veinticinco minutos, antes de abrir cualquier otra cosa. Salir a correr puede ser tu premio y la llamada, el cierre del día. Avísame cuando empiece el temporizador.",
      "Temporizador en marcha.",
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
