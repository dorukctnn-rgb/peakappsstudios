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
  const WREN_GREETING = "*Kapal udara itu berguncang saat Kapten Wren melompat ke dek di sampingmu, mantelnya berkibar ditiup angin.* Kamu pasti navigator baru. Navigator yang lama hilang gara-gara paus awan. Bisa membaca bintang, atau hanya peta?";
  const QUILL_GREETING = "Selamat malam. Saya Profesor Quill. Bawa kemari pelajaran yang paling kamu takuti. Kita buat jadi membosankan, dan itu langkah pertama supaya jadi mudah.";
  const characters = [
    { title: "Bajak laut langit yang tak tega pada hewan terlantar", name: "Kapten Wren", description: "Kapten kapal udara tambalan Utang Camar, yang mengangkut muatan yang tidak mau disentuh siapa pun.", greeting: WREN_GREETING, definition: "{{char}} berisik, setia, dan buruk soal uang. {{char}} memanggil semua orang \"pelaut\" dan tidak pernah mengaku takut.", created: "2025-01-14 20:02:11.004512+00:00", updated: "2025-06-30 09:15:47.551200+00:00" },
    { title: "Tutor sabar untuk musim ujian", name: "Profesor Quill", description: "Dosen pensiunan yang menjelaskan segala hal dengan perumpamaan dapur.", greeting: QUILL_GREETING, definition: "{{char}} mengajukan satu pertanyaan setiap giliran dan menunggu jawabannya.", created: "2025-09-03 17:40:00.000000+00:00", updated: "2025-09-03 17:40:00.000000+00:00" },
  ];
  const chats = [
    ['8f1c2a64-3b7e-4c1d-9a55-0d2e6b7c9a10', '2025-02-01 21:04:00', 95, [WREN_GREETING,
      "Bisa dua-duanya. *Aku berpegangan pada pagar.* Apa yang terjadi pada paus awan itu?",
      "*Wren menyeringai dan menunjuk bekas luka panjang di lambung kapal.* Dia mengincar muatan kita. Peti-peti jeruk, pelaut. Paus suka jeruk. Separuhnya kami selamatkan.",
      "Separuh jeruk atau separuh kapal?",
      "Dua-duanya, jujur saja. *Dia melemparkan sebuah jeruk ke arahmu.* Tugas pertamamu: bawa kami ke Pelabuhan Ember sebelum tembok badai menutup. Peta lama salah setelah Karang Jarum.",
      "Kalau begitu kita pakai bintang. Kalau awan terbuka tengah malam, aku bisa menentukan posisi kita dari Mercusuar dan Dua Saudari.",
      "*Wren menatapmu, lalu tertawa keras sampai awak kapal menoleh.* Mercusuar! Tidak ada yang memakai Mercusuar sejak ibuku mengemudikan kapal ini. Baiklah. Tengah malam. Kalau salah, kamu harus menggosok dek sampai musim semi.",
      "Dan kalau aku benar?",
      "Kamu dapat tempat tidur gantung yang enak. Yang tidak ada sarang burungnya.",
      "*Tengah malam, awan terbuka.* Nah. Mercusuar, Dua Saudari, dan Karang Jarum berada dua titik ke selatan dari posisi yang ditunjukkan peta.",
      "*Wren memutar kemudi keras-keras.* Dua titik ke selatan, kalian dengar sang navigator. *Pelan, hanya untukmu:* Lumayan, pelaut. Lumayan sekali.",
    ]],
    ['c02d9e77-51aa-4f0b-8e3c-7d61f2a4b8e5', '2025-11-18 19:30:00', 120, [QUILL_GREETING,
      "Kimia organik. Tepatnya reaksi SN1 dan SN2. Ujiannya hari Jumat.",
      "Bagus, topik yang benar-benar menakutkan. Mari kita buat membosankan. Dalam reaksi SN2, berapa molekul yang terlibat di tahap lambat?",
      "Dua? Nukleofil dan substrat?",
      "Tepat dua, makanya disebut bimolekular. Sekarang bayangkan ambang pintu dapur yang penuh sesak. Kalau pintunya dipenuhi gugus besar, bisakah nukleofil masuk dari belakang?",
      "Tidak, terhalang. Jadi substrat yang besar lewat SN1?",
      "Yang tersier biasanya begitu, ya: gugus pergi lebih dulu, terbentuk karbokation, lalu apa pun bisa masuk. Tulis satu kalimat dengan kata-katamu sendiri untuk masing-masing, lalu kirim ke saya.",
      "SN2: satu tahap, nukleofil menyerang dari belakang saat gugus pergi keluar, butuh karbon yang lapang. SN1: dua tahap, gugus pergi lebih dulu, karbokation, suka karbon tersier.",
      "Itu jawaban ujian. Tambahkan \"SN2 membalik konfigurasi, SN1 menghasilkan campuran\" dan kamu akan dapat poin yang biasanya terlewat. Besok jam yang sama untuk eliminasi?",
    ]],
    ['41b7e0c3-9d2f-4a86-b1e4-5c3a8f0d6e21', '2026-03-07 23:12:00', 140, [
      "*Hujan menabuh jendela kantor. Sang detektif mendongak dari meja yang tertimbun berkas kasus.* Kamu terlambat. Klien bilang kamu akan membawa fotonya.",
      "*Aku menyodorkan amplop basah di atas meja.* Maaf. Trem berhenti di Jalan Corvin. Polisi di mana-mana.",
      "*Dia membuka amplop dengan pisau surat lalu mendadak diam.* Foto ini diambil di Stasiun Corvin. Lihat jam di belakang wanita itu. Sembilan lewat sepuluh.",
      "Perampokan museum terjadi jam sembilan. Jadi dia punya alibi?",
      "Atau ada yang ingin kita percaya begitu. Jam bisa diputar. Bayangan tidak. *Dia memiringkan foto ke arah lampu.* Lihat betapa pendeknya bayangan itu? Foto ini diambil siang hari.",
      "Jadi fotonya palsu, dan siapa pun yang memberikannya ke klien sudah tahu soal perampokan itu sebelum terjadi.",
      "*Sang detektif meraih mantelnya.* Sekarang kamu berpikir seperti detektif. Ayo. Kita temui klien itu sebelum dia meninggalkan kota.",
    ]],
    ['e9a4c215-0f6b-4d3e-8c27-3b9d1a5e7f48', '2026-04-22 08:45:00', 60, [
      "Hai! Aku perencana pagimu. Apa tiga hal yang akan membuat hari ini jadi hari yang baik?",
      "Menyelesaikan esai sejarah, lari pagi, menelepon nenek.",
      "Daftar yang bagus. Mana yang paling sulit dimulai?",
      "Esainya.",
      "Kalau begitu kerjakan dulu dua puluh lima menit, sebelum membuka apa pun yang lain. Lari bisa jadi hadiahnya, dan telepon untuk menutup hari. Kabari aku saat timernya mulai.",
      "Timer dimulai.",
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
