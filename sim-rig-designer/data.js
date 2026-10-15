/* Sim Rig Designer: the facts the tool builds and checks with, each with its source and the date it was read.
 * Posture: the angles drivers chose in Porter and Gyi's adjustable driving rig (1998) with the earlier theoretical
 * ranges they compare against (Rebiffé 1969, Grandjean 1980), the SAE J1100 definitions and vehicle classes, and the
 * sim-racing guides of Fanatec, Asetek and Qubic System. Where they disagree the checks show the range and every source.
 * Body: segment lengths scaled from the US Army's ANSUR II survey (2012, 6,068 adults), by linear fits we made from its
 * public data. Materials: PS 20-25 and PS 1-19 for US lumber and plywood; merchants' listings for metric timber and
 * sheets; RS PRO's datasheet for 40-series aluminium profile. Nothing here is a price, and no maker's bolt pattern is
 * stored: hole patterns are typed by the user. Works in the browser (window.SimRigData) and in Node for the tests.
 * The editions in other languages add their own market (MARKETS below): the metric timber, its lengths and the sheets
 * sold there, and a local profile shop for the 40-series aluminium, from listings read on LOCAL_CHECKED, each with its
 * source in LOCAL_SOURCES; English keeps the tables it always had. */
(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory();
  else root.SimRigData = factory();
})(typeof self !== 'undefined' ? self : this, function () {
  'use strict';
  const CHECKED = '2026-10-14';
  const IN = 25.4, FT = 304.8; // mm per inch, mm per foot

  // ---------- Sources, each read on CHECKED ----------
  const S = (short, title, url) => ({ short, title, url, checked: CHECKED });
  const SOURCES = {
    // posture
    j1100: S('SAE J1100 (2001)', 'SAE J1100, Motor Vehicle Dimensions, Surface Vehicle Recommended Practice, revised February 2001 (public copy at law.resource.org): the definitions of H30, L40, L42, L44, L46 and L53, and the two classes of driver seating, Class A (H30 127 to 405 mm, torso angle 5 to 40 degrees) and Class B (heavy trucks and buses: H30 405 to 530 mm, torso angle 11 to 18 degrees)', 'https://law.resource.org/pub/us/cfr/ibr/005/sae.j1100.2001.html'),
    porterGyi: S('Porter and Gyi (1998)', 'Porter, J.M. and Gyi, D.E. (1998), Exploring the optimum posture for driver comfort, International Journal of Vehicle Design 19(3), 255-266: Table 2, comfortable angles observed in 55 drivers against Rebiffé (1969) and Grandjean (1980); Table 7, the rig dimensions they chose (Loughborough University repository)', 'https://repository.lboro.ac.uk/articles/journal_contribution/Exploring_the_optimum_posture_for_driver_comfort/9349361'),
    fanatecGT: S('Fanatec, GT pedal position', 'Fanatec: Best sim racing pedal position for GT sim racing (19 December 2024)', 'https://fanatec.com/us/en/explorer/products/pedals/best-sim-racing-pedal-position-for-gt-sim-racing/'),
    fanatecF1: S('Fanatec, F1 seat position', 'Fanatec: What is the best seat position for F1 Sim Racing? (12 November 2024, updated 24 January 2025)', 'https://www.fanatec.com/us/en/explorer/products/cockpit/best-seat-position-for-f1-sim-racing/'),
    fanatecFormula: S('Fanatec, formula pedal position', 'Fanatec: Best sim racing pedal position for formula racing (20 December 2024, updated 27 December 2024)', 'https://www.fanatec.com/us/en/explorer/products/pedals/best-sim-racing-pedal-position-for-formula-racing/'),
    asetekErgo: S('Asetek, ergonomics guide', 'Asetek SimSports: Sim Racing Ergonomics, The Complete Guide to Comfort, Control and Performance (14 March 2024, updated 19 August 2026)', 'https://www.asetek.com/simsports/guides/sim-racing-ergonomics-tips-for-a-comfortable-and-effective-setup/'),
    asetekWheel: S('Asetek, wheel position', 'Asetek SimSports: Sim Racing Wheel Position, Height, Distance and Control (11 August 2026)', 'https://www.asetek.com/simsports/guides/simsports-guides-sim-racing-wheel-position/'),
    asetekMonitor: S('Asetek, monitor position', 'Asetek SimSports: Sim Racing Monitor Position, Height, Distance and FOV (23 July 2026, updated 8 October 2026)', 'https://www.asetek.com/simsports/guides/sim-racing-monitor-position/'),
    qubic: S('Qubic System, GT seating', 'Qubic System: GT proper seating position (5 January 2023, updated 27 November 2025)', 'https://qubicsystem.com/2023/01/gt-proper-seating-position/'),
    // the body
    ansur2: S('ANSUR II (2012)', 'Anthropometric Survey of US Army Personnel (ANSUR II), 2012: public data for 4,082 men and 1,986 women, published by the Penn State OPEN Design Lab; methods in Gordon et al. (2015), NATICK/TR-15/007', 'https://www.openlab.psu.edu/ansur2/'),
    // lumber and sheets
    ps20: S('PS 20-25, Table 3', 'American Softwood Lumber Standard, Voluntary Product Standard PS 20-25 (NIST, January 2025), Table 3, nominal and minimum-dressed sizes of boards, dimension and timbers', 'https://www.nist.gov/document/ps-20-25-final'),
    ps20len: S('PS 20-25, 5.3.1', 'American Softwood Lumber Standard PS 20-25, section 5.3.1: standard lengths are multiples of 1 ft or 2 ft, as the grading rules specify', 'https://www.nist.gov/document/ps-20-25-final'),
    ps1: S('PS 1-19', 'Structural Plywood, Voluntary Product Standard PS 1-19 (NIST, December 2019): section 5.4 states its grade rules for 1220 by 2440 mm (48 x 96 in) panels; its thickness table lists the 23/32 Performance Category', 'https://www.nist.gov/document/doc-ps-1-19-structural-plywood'),
    obi4570: S('OBI, Rahmenholz 45 x 70 mm', 'OBI: Rahmenholz Fichte/Tanne gehobelt gefast 45 mm x 70 mm x 2100 mm (also sold at 3000 mm), Güteklasse 1, for interior work', 'https://www.obi.de/p/6165450/rahmenholz-fichte-tanne-gehobelt-gefast-45-mm-x-70-mm-x-2100-mm'),
    jewson4570: S('Jewson, 45 x 70 mm', 'Jewson: FSC Regularised Timber Treated Kiln Dried 45 x 70mm (FVRT4570), planed, sold from 2.4 m to 4.8 m', 'https://www.jewson.co.uk/p/fsc-standard-kiln-dried-regularised-treated-carcassing-70-x-45mm-FVRT4570'),
    jewson4595: S('Jewson, 45 x 95 mm', 'Jewson: FSC C16 Regularised Timber Treated Kiln Dried 45 x 95mm (FVRT4595), planed, sold from 2.4 m to 4.8 m', 'https://www.jewson.co.uk/p/fsc-c16-regularised-timber-treated-kiln-dried-45-x-95mm-FVRT4595'),
    mkm4595: S('MKM, 45 x 95 mm finish', 'MKM: Premium Grade Carcassing, 47mm x 100mm (45mm x 95mm Finish), C24, planed (T003180)', 'https://mkm.com/product/47mm-x-100mm-fin-45mm-x-95mm-regularised-kiln-dried-carcassing-c24-t003180'),
    tpPly18: S('Travis Perkins, 18 mm plywood', 'Travis Perkins: 18mm x 2440mm x 1220mm Structural Hardwood Plywood', 'https://www.travisperkins.co.uk/plywood/18mm-x-2440mm-x-1220mm-structural-hardwood-plywood/p/670588'),
    obiMultiplex: S('OBI, Multiplex 18 mm', 'OBI: Multiplex Platte Birke 250 cm x 125 cm x 1,8 cm, cut to size in store (Zuschnitt)', 'https://www.obi.de/p/4560678/multiplex-platte-birke-250-cm-x-125-cm-x-1-8-cm-braun-zuschnitt'),
    obiMdf: S('OBI, MDF 22 mm', 'OBI: MDF-Platte Analog E1 280 cm x 207 cm x 2,2 cm, cut to size in store (Zuschnitt)', 'https://www.obi.de/p/4562518/mdf-platte-analog-e1-280-cm-x-207-cm-x-2-2-cm-braun-zuschnitt'),
    // aluminium profile
    rsProfile: S('RS PRO, strut profile datasheet', 'RS PRO strut profile datasheet (Tubing & Struts): 40 x 40 mm with 8 mm groove, 1.75 kg/m, Ix = Iy = 9.18 cm4 (761-3319); 40 x 80 mm with 8 mm groove, 3.05 kg/m, Ix 70.07 cm4, Iy 16.93 cm4 (761-3325); system lengths of 1 m, 2 m and 3 m', 'https://docs.rs-online.com/dd51/A700000015512464.pdf'),
  };

  // ---------- The body: ANSUR II, linear fits on stature S (and crotch height C, the inside leg) ----------
  // Fitted by us on all 6,068 records, men and women together (mm). Each entry: [a, b] for a + b * x, the predictor,
  // and the ANSUR II measures it comes from. Where a segment hardly depends on stature (r below 0.2) the mean is used.
  // The record is military, not the general public; it reaches 1409 to 1993 mm of stature.
  const BODY = {
    fit: { n: 6068, stature: [1409, 1993], inseam: [700, 954] },
    crotch: { on: 'S', ab: [-111.24, 0.5462], from: 'crotchheight' },                 // when the inside leg is not typed
    thigh: { on: 'C', ab: [34.96, 0.4418], from: 'trochanterionheight - lateralfemoralepicondyleheight' },
    shank: { on: 'C', ab: [71.10, 0.4152], from: 'lateralfemoralepicondyleheight - lateralmalleolusheight' },
    ankle: { on: 'C', ab: [5.02, 0.0782], from: 'lateralmalleolusheight' },
    foot: { on: 'S', ab: [-16.78, 0.1632], from: 'footlength' },
    ball: { on: 'S', ab: [-15.14, 0.1224], from: 'balloffootlength' },                 // heel to the ball of the foot
    hipSeat: { on: null, ab: [66.4, 0], from: 'sittingheight - (stature - trochanterionheight)' }, // hip joint above the seat
    shoulderSeat: { on: 'S', ab: [77.03, 0.2991], from: 'sittingheight - (stature - acromialheight)' },
    eyeSeat: { on: 'S', ab: [102.22, 0.3988], from: 'eyeheightsitting' },
    sitting: { on: 'S', ab: [147.50, 0.4378], from: 'sittingheight' },
    upperArm: { on: 'S', ab: [-11.87, 0.1979], from: 'acromionradialelength' },
    forearm: { on: 'S', ab: [-37.45, 0.2194], from: 'forearmcenterofgriplength' },   // elbow to the centre of the grip
    chestDrop: { on: null, ab: [154.1, 0], from: 'acromialheight - chestheight' },     // shoulder to chest point
    buttock: { on: 'S', ab: [83.21, 0.0924], from: 'buttockdepth' },
    thighTop: { on: 'S', ab: [43.17, 0.0777], from: 'thighclearance' },               // seat to the top of the thigh
    shoulders: { on: 'S', ab: [-45.73, 0.2595], from: 'biacromialbreadth' },
    hips: { on: null, ab: [385.7, 0], from: 'hipbreadthsitting' },
    head: { on: 'S', ab: [101.55, 0.0553], from: 'headlength' },
    chest: { on: 'S', ab: [129.08, 0.0715], from: 'chestdepth' },
  };
  // Our own modelling choices, stated so they can be checked: the eye sits this share of the head length in front of
  // the shoulder, with the head held level to look ahead; the hip joint sits half the buttock depth in front of the seat
  // back; the ankle sits a fifth of the foot length in front of the heel.
  const MODEL = { eyeForward: 0.4, hipFromBack: 0.5, ankleFromHeel: 0.2 };

  // ---------- Lumber: t = thickness, w = width, both actual (dressed) sizes in mm ----------
  const LUMBER = {
    imperial: [
      { id: '2x3', label: '2x3', actual: '1 1/2 x 2 1/2 in', t: 1.5 * IN, w: 2.5 * IN, source: 'ps20' },
      { id: '2x4', label: '2x4', actual: '1 1/2 x 3 1/2 in', t: 1.5 * IN, w: 3.5 * IN, source: 'ps20' },
    ],
    metric: [
      { id: '45x70', label: '45 x 70 mm', actual: '45 x 70 mm, planed', t: 45, w: 70, source: 'obi4570', also: ['jewson4570'] },
      { id: '45x95', label: '45 x 95 mm', actual: '45 x 95 mm, planed (sold as 47 x 100 mm)', t: 45, w: 95, source: 'jewson4595', also: ['mkm4595'] },
    ],
  };
  // stock lengths: US, PS 20-25 5.3.1 (multiples of 1 or 2 ft). Metric: 2.1 and 3.0 m (OBI), 2.4 to 4.8 m (Jewson).
  const STOCK = {
    imperial: [8, 10, 12].map(f => ({ mm: f * FT, label: `${f} ft` })),
    metric: [2100, 2400, 3000, 3600].map(mm => ({ mm, label: `${(mm / 1000).toFixed(1)} m` })),
  };
  const SWAP = { '2x3': '45x70', '2x4': '45x95', '45x70': '2x3', '45x95': '2x4' };

  // ---------- Sheets for the decks and plates ----------
  const SHEETS = {
    imperial: [
      { id: 'ply', label: '4 x 8 ft plywood, 23/32 in', kind: 'plywood', t: 23 / 32 * IN, w: 48 * IN, l: 96 * IN, source: 'ps1' },
      { id: 'mdf', label: '4 x 8 ft MDF, 3/4 in', kind: 'MDF', t: 0.75 * IN, w: 48 * IN, l: 96 * IN, source: null },
    ],
    metric: [
      { id: 'ply2440', label: '2440 x 1220 mm plywood, 18 mm', kind: 'plywood', t: 18, w: 1220, l: 2440, source: 'tpPly18' },
      { id: 'ply2500', label: '2500 x 1250 mm birch plywood, 18 mm', kind: 'plywood', t: 18, w: 1250, l: 2500, source: 'obiMultiplex' },
      { id: 'mdf', label: '2800 x 2070 mm MDF, 22 mm', kind: 'MDF', t: 22, w: 2070, l: 2800, source: 'obiMdf' },
    ],
  };

  // ---------- 40-series aluminium profile, 8 mm slot ----------
  const PROFILES = {
    p4040: { id: 'p4040', label: '40 x 40 mm profile, 8 mm slot', a: 40, b: 40, kg: 1.75, source: 'rsProfile' },
    p4080: { id: 'p4080', label: '40 x 80 mm profile, 8 mm slot', a: 40, b: 80, kg: 3.05, source: 'rsProfile' },
  };
  const PROFILE_STOCK = [1000, 2000, 3000];

  // ---------- Screens: the width and height of a diagonal, by aspect ratio ----------
  const ASPECTS = { '16:9': [16, 9], '21:9': [64, 27], '32:9': [32, 9] };

  // ---------- The checks, each figure with its source ----------
  // Angles in degrees as SAE J1100 defines them: knee (L44) between thigh and lower leg, hip (L42) between torso and
  // thigh, torso (L40) from the vertical, foot (L46) between lower leg and foot. Heights in mm.
  const RULES = {
    knee: { fits: [99, 138], rebiffe: [95, 135], grandjean: [110, 130], gt: [100, 120] },       // Porter and Gyi Table 2; Fanatec GT
    hip: { fits: [90, 120], observed: [90, 115], rebiffe: [95, 120], grandjean: [100, 120] },    // Porter and Gyi Table 2
    elbow: { fits: [90, 120], observed: [86, 164], rebiffe: [80, 120], qubic: [90, 100] },       // Fanatec F1; Porter and Gyi; Qubic
    ankle: { fits: [80, 113], rebiffe: [90, 110] },                                              // Porter and Gyi Table 2
    torso: {                                                                                     // L40 from the vertical
      gt: { fits: [5, 25], car: [5, 40] },             // Porter and Gyi Table 7 (5 to 25, mean 15.9); J1100 Class A
      formula: { fits: [25, 90], near: 45 },           // more reclined than the road range; Qubic: closer to 45 degrees
      rally: { fits: [5, 25], truck: [11, 18] },       // J1100 Class B, heavy trucks and buses
    },
    h30: {                                             // hip point above the heel point, mm
      gt: { fits: [127, 405], chosen: [283, 335], mean: 301 },  // J1100 Class A; Porter and Gyi Table 7
      formula: { below: 127 },                                  // lower than any Class A seat: the heels rise toward the hips
      rally: { fits: [127, 530] },                              // J1100 Class A and B together
    },
  };

  // ---------- Starting points the tool designs to (its own choices, inside the ranges above) ----------
  // back: torso angle; h30: hip point above the heel; knee, elbow, ankle: angles at rest; wheel: where the wheel centre
  // sits between the chest point (0) and the shoulder (1); tilt: the rim leans back from the vertical; rim: diameter.
  // h30 is for a driver with ANSUR II's mean inside leg (825 mm) and is scaled by the inside leg, except for formula.
  const STYLES = {
    gt: { label: 'GT and road', back: 18, h30: 330, knee: 117, elbow: 105, ankle: 95, wheel: 0.5, tilt: 18, rim: 300 },
    formula: { label: 'Formula', back: 40, h30: 50, knee: 125, elbow: 110, ankle: 95, wheel: 1, tilt: 28, rim: 280 },
    rally: { label: 'Rally and truck', back: 15, h30: 420, knee: 112, elbow: 98, ankle: 95, wheel: 0.25, tilt: 30, rim: 330 },
  };

  // ---------- Seats: where the hip point sits on each (our model, adjusted by the seat height setting) ----------
  // lift: hip point above the top of the seat bars; depth: cushion depth; width: shell or chair width; back: back height.
  const SEATS = {
    bucket: { label: 'Bucket seat on brackets', lift: 140, depth: 470, width: 540, backH: 820, recline: [5, 50] },
    car: { label: 'Car seat on sliders', lift: 230, depth: 500, width: 560, backH: 780, recline: [5, 50] },
    office: { label: 'Office or gaming chair', lift: 0, depth: 460, width: 520, backH: 640, recline: [0, 30], pan: 460 },
  };

  // ---------- Gear: example sizes, to be measured (never a maker's figures) ----------
  const GEAR = {
    wheelBase: { l: 230, w: 160, axis: 100, qr: 80 },       // body length, width, axis height above the deck, rim to face
    pedals: { w: 420, d: 430, face: 30, travel: 18 },        // pedal set footprint; the sole's angle above the deck at rest (heel to ball of the foot); brake travel
    shifter: { w: 160, d: 140 },
    holes: {                                                 // EXAMPLE patterns: the user measures and types their own
      wheel: { cols: 2, rows: 2, x: 100, y: 60, d: 6.5 },
      pedals: { cols: 3, rows: 2, x: 140, y: 200, d: 8.5 },
      shifter: { cols: 2, rows: 2, x: 90, y: 60, d: 6.5 },
    },
  };

  // ---------- The editions' markets: timber, lengths, sheets and aluminium profile sold in each country ----------
  // Every size is one a retailer lists, read on LOCAL_CHECKED, never a size we expect to exist. t and w are the planed
  // section in mm (thickness, width); lengths are those the section is sold in. A market may also name its own pages for
  // a source the checks cite (alias: the same publisher's article in the local language, with the same figures).
  const LOCAL_CHECKED = '2026-10-14';
  const L = (short, title, url) => ({ short, title, url, checked: LOCAL_CHECKED });
  // the second round of editions (Brazilian Portuguese, Spanish, French, Italian), read on LOCAL_CHECKED_2
  const LOCAL_CHECKED_2 = '2026-10-15';
  const L2 = (short, title, url) => ({ short, title, url, checked: LOCAL_CHECKED_2 });
  const MM = 'https://www.madeiramadeira.com.br', IPC = 'https://www.ipccomercial.com.br', BK = 'https://www.bricoking.es', CA = 'https://www.castorama.fr', BD = 'https://www.bricodepot.fr', OB = 'https://www.obi-italia.it';
  const MDE = 'https://www.motedis.es/es', MDF = 'https://www.motedis.fr/fr', MIT = 'https://www.motedis.it/it';
  const OD = 'https://www.obi.de/p', DM = 'https://www.dold-mechatronik.de', FD = 'https://www.fanatec.com/eu/de/explorer/products';
  const LOCAL_SOURCES = {
    // Germany: OBI's planed, chamfered spruce/fir framing timber and its sheets; DOLD Mechatronik's I-type profile
    obiR4570a: L('OBI, Rahmenholz 45 x 70 mm, 2,1 m', 'OBI: Rahmenholz Fichte/Tanne gehobelt gefast 45 mm x 70 mm x 2100 mm', `${OD}/6165450/rahmenholz-fichte-tanne-gehobelt-gefast-45-mm-x-70-mm-x-2100-mm`),
    obiR4570b: L('OBI, Rahmenholz 45 x 70 mm, 3,0 m', 'OBI: Rahmenholz Fichte/Tanne gehobelt gefast 45 mm x 70 mm x 3000 mm', `${OD}/6165740/rahmenholz-fichte-tanne-gehobelt-gefast-45-mm-x-70-mm-x-3000-mm`),
    obiR5474a: L('OBI, Rahmenholz 54 x 74 mm, 2,0 m', 'OBI: Rahmenholz Fichte/Tanne gehobelt gefast 54 mm x 74 mm x 2000 mm', `${OD}/3261187/rahmenholz-fichte-tanne-gehobelt-gefast-54-mm-x-74-mm-x-2000-mm`),
    obiR5474b: L('OBI, Rahmenholz 54 x 74 mm, 2,5 m', 'OBI: Rahmenholz Fichte/Tanne gehobelt gefast 74 mm x 54 mm x 2500 mm', `${OD}/8003378/rahmenholz-fichte-tanne-gehobelt-gefast-74-mm-x-54-mm-x-2500-mm`),
    obiR5474c: L('OBI, Rahmenholz 54 x 74 mm, 3,0 m', 'OBI: Rahmenholz Fichte/Tanne gehobelt gefast 54 mm x 74 mm x 3000 mm', `${OD}/3261260/rahmenholz-fichte-tanne-gehobelt-gefast-54-mm-x-74-mm-x-3000-mm`),
    obiMpx18: L('OBI, Multiplex Birke 18 mm', 'OBI: Multiplex Platte Birke 250 cm x 125 cm x 1,8 cm, Zuschnitt im Markt', `${OD}/4560678/multiplex-platte-birke-250-cm-x-125-cm-x-1-8-cm-braun-zuschnitt`),
    obiSieb18: L('OBI, Siebdruckplatte 18 mm', 'OBI: Siebdruckplatte Birke D+D 250 cm x 125 cm x 1,8 cm, Zuschnitt im Markt', `${OD}/4559985/siebdruckplatte-birke-d-d-250-cm-x-125-cm-x-1-8-cm-braun-zuschnitt`),
    obiMdf22: L('OBI, MDF-Platte 22 mm', 'OBI: MDF-Platte Analog E1 280 cm x 207 cm x 2,2 cm, Zuschnitt im Markt', `${OD}/4562518/mdf-platte-analog-e1-280-cm-x-207-cm-x-2-2-cm-braun-zuschnitt`),
    doldP4040: L('DOLD, Aluprofil 40x40L Nut 8', 'DOLD Mechatronik: Aluminiumprofil 40x40L I-Typ Nut 8 (leicht), Nutbreite 8 mm, Kernbohrung 6,8 mm für M8, 1,759 kg/m, Zuschnitt 50 bis 6000 mm', `${DM}/Aluminiumprofil-40x40L-I-Typ-Nut-8`),
    doldP4080: L('DOLD, Aluprofil 40x80L Nut 8', 'DOLD Mechatronik: Aluminiumprofil 40x80L I-Typ Nut 8 (leicht), Nutbreite 8 mm, 3,133 kg/m, Zuschnitt 50 bis 6000 mm', `${DM}/Aluminiumprofil-40x80L-I-Typ-Nut-8`),
    doldB10: L('DOLD, Aluprofil 40x40L B-Typ Nut 10', 'DOLD Mechatronik: Aluminiumprofil 40x40L B-Typ Nut 10 (leicht), Nutbreite 10 mm, Kernbohrung 10,2 mm für M12: die 40er-Profile nach B-Typ haben eine 10-mm-Nut, die nach I-Typ eine 8-mm-Nut', `${DM}/Aluminiumprofil-40x40L-B-Typ-Nut-10`),
    doldWinkel: L('DOLD, Winkel 40 Nut 8', 'DOLD Mechatronik: Winkel 40 I-Typ Nut 8 (auch als Winkel 40x80 I-Typ Nut 8)', `${DM}/Winkel-40-I-Typ-Nut-8`),
    doldGelenk: L('DOLD, Gelenkwinkel 40 Nut 8', 'DOLD Mechatronik: Gelenkwinkel 40 I-Typ Nut 8', `${DM}/Gelenkwinkel-40-I-Typ-Nut-8`),
    doldNutenstein: L('DOLD, Nutenstein M8 Nut 8', 'DOLD Mechatronik: Nutenstein schwer M8 mit Steg I-Typ Nut 8', `${DM}/Nutenstein-schwer-M8-mit-Steg-I-Typ-Nut-8`),
    doldKappe: L('DOLD, Profilabdeckkappen', 'DOLD Mechatronik: Profilabdeckkappe 40x40 I-Typ Nut 8 und Profilabdeckkappe 40x80 I-Typ Nut 8', `${DM}/Abdeckkappen-und-profile-40-I-Typ-Nut-8`),
    // Fanatec's own articles in German, with the same figures as the English ones the checks cite
    fanatecGTde: L('Fanatec, Pedalposition GT', 'Fanatec: Beste Pedalposition für GT-Sim-Rennen (deutsche Fassung des Artikels vom 19. Dezember 2024)', `${FD}/pedals/best-sim-racing-pedal-position-for-gt-sim-racing/`),
    fanatecF1de: L('Fanatec, Sitzposition F1', 'Fanatec: Was ist die beste Sitzposition für F1-Sim-Racing? (deutsche Fassung des Artikels vom 12. November 2024)', `${FD}/cockpit/best-seat-position-for-f1-sim-racing/`),
    fanatecFormulaDe: L('Fanatec, Pedalposition Formel', 'Fanatec: Beste Pedalposition für Sim-Racing bei Formel-Rennen (deutsche Fassung des Artikels vom 20. Dezember 2024)', `${FD}/pedals/best-sim-racing-pedal-position-for-formula-racing/`),
    // ---- the second round (Brazil, Spain, France, Italy), read on LOCAL_CHECKED_2 ----
    // Brazil: MadeiraMadeira's pine rafters and sheets, Telhanorte's autoclave rafter; IPC Comercial's slot-8 profile
    mmCaibro4590: L2('MadeiraMadeira, caibros de pinus 4,5 x 9 cm', 'MadeiraMadeira: Caibro de Pinus Tratado com Nós 4,5 x 9,0 x 290 cm e Caibro Aplainado de Pinus Tratado 4,5 x 9 x 150 cm (busca caibro pinus autoclavado)', `${MM}/busca?q=caibro%20pinus%20autoclavado`),
    tnCaibro5057: L2('Telhanorte, caibro 50 x 57 mm', 'Telhanorte: Pinus 600 Serrado Caibro Autoclavado Bruto 50 x 57 x 3000 (Madvei)', 'https://www.telhanorte.com.br/pinus-600-serrado-caibro-autoclavado-bruto-50-x-57-x-3000-madvei-1528521/p'),
    mmVirola18: L2('MadeiraMadeira, compensado de virola 18 mm', 'MadeiraMadeira: Compensado de Virola 18 mm, dimensão 2,20 x 1,60 m', `${MM}/compensado-de-virola-18mm-2507810.html`),
    mmPlast18: L2('MadeiraMadeira, compensado plastificado 18 mm', 'MadeiraMadeira: Compensado Plastificado 18 mm (2,44 x 1,22 m)', `${MM}/compensado-plastificado-18mm-2-44x1-22-2455171.html`),
    mmOsb18: L2('MadeiraMadeira, chapa de OSB 18 mm', 'MadeiraMadeira: Chapa OSB 2,44 x 1,22 m x 18 mm (Canteiro)', `${MM}/chapa-osb-2-44x1-22x18mm-canteiro-2455178.html`),
    ipcP4040: L2('IPC Comercial, perfil 40 x 40 canal 8', 'IPC Comercial: Perfil Estrutural de Alumínio 40 x 40, canal em T de 8 mm, centro para rosca M16, de 50 a 300 cm em passos de 50 cm, cerca de 1650 g por metro', `${IPC}/perfil-de-aluminio/perfil-estrutural-em-aluminio-40-x-40/perfil-estrutural-em-aluminio-40-x-40-canal-de-8-mm-p`),
    ipcP4080: L2('IPC Comercial, perfil 40 x 80 canal 8', 'IPC Comercial: Perfil Estrutural em Alumínio 40 x 80, canal em T de 8 mm, centro para rosca M16, de 50 a 300 cm em passos de 50 cm, cerca de 3000 g por metro', `${IPC}/perfil-de-aluminio/perfil-estrutural-em-aluminio-40-x-80/perfil-estrutural-em-aluminio-40-x-80-canal-de-8-mm-p`),
    ipcCantoneira: L2('IPC Comercial, cantoneira 40 x 40', 'IPC Comercial: Cantoneira em alumínio injetado 90 graus para perfil 40 x 40', `${IPC}/perfil-de-aluminio/cantoneiras/cantoneira-em-aluminio-injetado-90-graus-perfil-40-x-40-p`),
    ipcParafusoM8: L2('IPC Comercial, parafuso M8 para canal 8', 'IPC Comercial: Kit parafuso francês M8 x 14 mm para perfil canal de 8 mm', `${IPC}/perfil-de-aluminio/fixacao/kit-parafuso-frances-m8-x-14-mm-para-perfil-canal-de-8-mm-p`),
    ipcPorcaM8: L2('IPC Comercial, porca M8', 'IPC Comercial: Kit porca sextavada M8 autotravante Parlock, passo da rosca 1,25', `${IPC}/perfil-de-aluminio/fixacao/kit-porca-sextavada-m8-auto-travante-parlock-passo-da-rosca-1-25-p`),
    // Spain: Bricoking's fir battens and phenolic OSB, Leroy Merlin's plywood; Motedis Spain's I-type slot-8 profile
    bkListon7045: L2('Bricoking, listón 70 x 45 mm', 'Bricoking: listón de abeto 70 x 45 x 2400 mm', `${BK}/maderas-y-revestimientos/listonaje/listones/liston-abeto-70x45x2400`),
    bkListon9045: L2('Bricoking, listón 90 x 45 mm', 'Bricoking: listón de abeto 90 x 45 x 2400 mm', `${BK}/maderas-y-revestimientos/listonaje/listones/liston-abeto-90x45x2400`),
    bkOsb18: L2('Bricoking, OSB fenólico 18 mm', 'Bricoking: tablero OSB fenólico 250 x 125 cm, 18 mm', `${BK}/maderas-y-revestimientos/carpinteria/tablero-de-madera/tablero-osb-fenolico-250x125-cm-18-mm`),
    lmEsContrachapado: L2('Leroy Merlin, contrachapado 18 mm', 'Leroy Merlin España: tablero de contrachapado crudo 122 x 250 x 1,8 cm (búsqueda tablero contrachapado 18 mm)', 'https://www.leroymerlin.es/search?q=tablero%20contrachapado%2018%20mm'),
    motedisEsP4040: L2('Motedis, perfil 40x40L ranura 8', 'Motedis España: Perfil Alu 40x40L Tipo-I Ranura 8', `${MDE}/Perfil-40x40L-Tipo-I-ran-8`),
    motedisEsP4080: L2('Motedis, perfil 40x80 ranura 8', 'Motedis España: Perfil Alu 40x80 Ligero Tipo-I Ranura 8', `${MDE}/Perfil-40x80-Ligero-tipo-I-ran-8`),
    motedisEsB10: L2('Motedis, perfil 40x40 ranura 10', 'Motedis España: Perfil Alu 40x40 Tipo-B Ranura 10: los perfiles 40 de tipo B llevan ranura de 10 mm, los de tipo I ranura de 8 mm', `${MDE}/Perfil-40x40-Tipo-B-ranura-10mm`),
    motedisEsEscuadra: L2('Motedis, escuadra 40 ranura 8', 'Motedis España: Escuadra 40 tipo I ranura 8 (también Escuadra 40x80 Tipo-I ranura 8)', `${MDE}/Escuadra-40-tipo-I-ranura-8`),
    motedisEsTuerca: L2('Motedis, tuerca M8 ranura 8', 'Motedis España: Tuerca corredera insertable con guía, ranura 8 tipo I, M8', `${MDE}/Tuerca-corredera-insertable-c-guia-ran-8-tipo-I-M8`),
    // France: Castorama's planed battens and sheets, Brico Dépôt's rafters; Motedis France's I-type slot-8 profile
    castoTasseau4470: L2('Castorama, tasseau 44 x 70 mm', 'Castorama : Tasseau raboté L. 240 cm, 44 x 70 mm (vendu par lot de 3)', `${CA}/tasseau-rabote-l-240-cm-44-x-70-mm-vendu-par-lot-de-3-/3663602862222_CAFR.prd`),
    bdChevron6375: L2('Brico Dépôt, chevron 63 x 75 mm', 'Brico Dépôt : Chevron épicéa traité classe 2, 63 x 75 mm, en 2,4, 3, 4 et 5 m (rayon Chevrons)', `${BD}/produits/materiau-et-gros-oeuvre/toiture-et-facade/bois-de-charpente-et-ossature-bois/chevrons`),
    castoCp18: L2('Castorama, contreplaqué 18 mm', 'Castorama : Panneau contreplaqué de feuillus, 244 x 122 cm, ép. 18 mm (vendu au panneau)', `${CA}/panneau-contreplaque-de-feuillus-244-x-122-cm-ep-18-mm-vendu-au-panneau-/3663602840565_CAFR.prd`),
    castoOsb18: L2('Castorama, OSB 3 18 mm', 'Castorama : Panneau OSB 3, 244 x 122 cm, ép. 18 mm (vendu au panneau)', `${CA}/panneau-osb-3-244-x-122-cm-ep-18-mm-vendu-au-panneau-/3663602840237_CAFR.prd`),
    motedisFrP4040: L2('Motedis, profilé 40x40L rainure 8', 'Motedis France : Profilé aluminium 40x40L Type I rainure 8, 4 rainures de 8 mm, profondeur 12 mm, noyau pour M8, coupe sur mesure', `${MDF}/Profile-aluminium-40x40L-Type-I-rainure-8`),
    motedisFrP4080: L2('Motedis, profilé 40x80L rainure 8', 'Motedis France : Profilé aluminium 40x80L Type I rainure 8, 6 rainures de 8 mm, profondeur 12 mm, noyau pour M8', `${MDF}/Profile-aluminium-40x80L-Type-I-rainure-8`),
    motedisFrB10: L2('Motedis, profilé 40x40 rainure 10', 'Motedis France : Profilé aluminium 40x40 Type B rainure 10 : les profilés 40 de type B ont une rainure de 10 mm, ceux de type I une rainure de 8 mm', `${MDF}/Profile-aluminium-40x40-Type-B-rainure-10`),
    motedisFrEquerre: L2('Motedis, équerre 40 type I', 'Motedis France : Équerre d’assemblage 40 I-Typ', `${MDF}/Equerre-dassemblage-40-I-Typ`),
    motedisFrEcrou: L2('Motedis, écrou M8 rainure 8', 'Motedis France : Écrou avec guidage rainure 8 I-Type [M8]', `${MDF}/Ecrou-avec-guidage-rainure-8-I-Type-M8`),
    // Italy: OBI Italia's planed fir battens and OSB/3; Motedis Italy's I-type slot-8 profile
    obiItListello4580: L2('OBI Italia, listello 45 x 80 mm', 'OBI Italia: Listello in abete piallato 45 x 80 x 2000 mm', `${OB}/p/4493086/listello-in-abete-piallato-45x80x2000-mm`),
    obiItListello4595: L2('OBI Italia, listello 45 x 95 mm', 'OBI Italia: Listello in abete piallato 4 lati 45 x 95 x 2000 mm', `${OB}/p/6191738/listello-in-abete-piallato-4-lati-45x95x2000-mm`),
    obiItOsb18: L2('OBI Italia, OSB-3 18 mm', 'OBI Italia: Pannello OSB-3 da posa a filo 18 mm x 250 cm x 125 cm', `${OB}/p/6036883/pannello-osb-3-da-posa-a-filo-18-mm-x-250-cm-x-125-cm`),
    obiItOsb15: L2('OBI Italia, OSB/3 15 mm', 'OBI Italia: Pannello OSB/3 2500 x 1250 x 15 mm legno chiaro', `${OB}/p/2099091/pannello-osb-3-2500x1250x15-mm-legno-chiaro`),
    motedisItP4040: L2('Motedis, profilato 40x40L scanalatura 8', 'Motedis Italia: Profilato alluminio 40x40L scanalatura 8 tipo I', `${MIT}/Profilato-alluminio-40x40L-scanalatura-8-tipo-I`),
    motedisItP4080: L2('Motedis, profilato 40x80L scanalatura 8', 'Motedis Italia: Profilato alluminio 40x80L scanalatura 8 tipo I', `${MIT}/Profilato-alluminio-40x80L-scanalatura-8-tipo-I`),
    motedisItB10: L2('Motedis, profilato 40x40 scanalatura 10', 'Motedis Italia: Profilato alluminio 40x40 scanalatura 10 tipo B: i profilati 40 di tipo B hanno la scanalatura da 10 mm, quelli di tipo I da 8 mm', `${MIT}/Profilato-alluminio-40x40-scanalatura-10-tipo-B`),
    motedisItStaffa: L2('Motedis, staffa per angoli 40', 'Motedis Italia: Staffe per angoli 40 scanalatura 8 tipo I', `${MIT}/Staffe-per-angoli-40-scanalatura-8-tipo-I-con-tappo-di-copertura-rotondo`),
    motedisItTassello: L2('Motedis, tassello M8 scanalatura 8', 'Motedis Italia: Tassello scorrevole con guida scanalatura 8 tipo I M8', `${MIT}/Tassello-scorrevole-con-guida-scanalatura-8-tipo-I-M8`),
  };
  const M = (id, t, w, sources, lengths) => ({ id, t, w, source: sources[0], also: sources.slice(1), lengths });
  const MARKETS = {
    // English: the tables above, unchanged (OBI and UK listings for the metric sizes)
    en: { units: 'imperial', lumber: LUMBER.metric, stock: STOCK.metric.map(s => s.mm), sheets: SHEETS.metric, lumberDefault: '45x95', stockDefault: 2400, sheetDefault: 'ply2440', swap: SWAP, profiles: {}, alias: {}, hardware: {} },
    // Germany: OBI's Rahmenholz Fichte/Tanne, 45 x 70 mm in 2,1 and 3,0 m and 54 x 74 mm in 2,0, 2,5 and 3,0 m; birch
    // Multiplex and Siebdruck at 250 x 125 cm, 18 mm, and MDF at 280 x 207 cm, 22 mm; DOLD's I-type profile, 8 mm slot
    // the sample: the English one (three 27 in screens, direct drive, load cell pedals, a shifter), metric, in 54 x 74 mm
    // Rahmenholz and birch Multiplex, for a driver of 180 cm
    de: {
      units: 'metric', sample: { driver: { h: 1800, inseam: 0 } },
      lumber: [M('de-45x70', 45, 70, ['obiR4570a', 'obiR4570b'], [2100, 3000]), M('de-54x74', 54, 74, ['obiR5474a', 'obiR5474b', 'obiR5474c'], [2000, 2500, 3000])],
      stock: [2000, 2100, 2500, 3000], lumberDefault: 'de-54x74', stockDefault: 3000, sheetDefault: 'de-mpx18',
      sheets: [
        { id: 'de-mpx18', kind: 'plywood', t: 18, w: 1250, l: 2500, source: 'obiMpx18' },
        { id: 'de-sieb18', kind: 'film', t: 18, w: 1250, l: 2500, source: 'obiSieb18' },
        { id: 'de-mdf22', kind: 'MDF', t: 22, w: 2070, l: 2800, source: 'obiMdf22' },
      ],
      swap: { '2x3': 'de-45x70', '2x4': 'de-54x74', 'de-45x70': '2x3', 'de-54x74': '2x4', '45x70': 'de-45x70', '45x95': 'de-54x74' },
      profiles: { p4040: { kg: 1.759, source: 'doldP4040', also: ['doldB10'] }, p4080: { kg: 3.133, source: 'doldP4080' } },
      hardware: { brackets: 'doldWinkel', hinges: 'doldGelenk', tnuts: 'doldNutenstein', caps4040: 'doldKappe', caps4080: 'doldKappe' },
      alias: { fanatecGT: 'fanatecGTde', fanatecF1: 'fanatecF1de', fanatecFormula: 'fanatecFormulaDe' },
    },
    // Brazil: MadeiraMadeira's treated pine rafter 4,5 x 9 cm (1,5 and 2,9 m) and Telhanorte's autoclave rafter
    // 50 x 57 mm (3 m); virola plywood 2,20 x 1,60 m, film-faced plywood and OSB 2,44 x 1,22 m, all 18 mm; IPC
    // Comercial's slot-8 profile with its own weights (1650 and 3000 g/m), its bracket, M8 bolt and nut
    pt: {
      units: 'metric', sample: { driver: { h: 1750, inseam: 0 } },
      lumber: [M('pt-50x57', 50, 57, ['tnCaibro5057'], [3000]), M('pt-45x90', 45, 90, ['mmCaibro4590'], [1500, 2900])],
      stock: [1500, 2900, 3000], lumberDefault: 'pt-45x90', stockDefault: 2900, sheetDefault: 'pt-virola18',
      sheets: [
        { id: 'pt-virola18', kind: 'plywood', t: 18, w: 1600, l: 2200, source: 'mmVirola18' },
        { id: 'pt-plast18', kind: 'film', t: 18, w: 1220, l: 2440, source: 'mmPlast18' },
        { id: 'pt-osb18', kind: 'osb', t: 18, w: 1220, l: 2440, source: 'mmOsb18' },
      ],
      swap: { '2x3': 'pt-50x57', '2x4': 'pt-45x90', 'pt-50x57': '2x3', 'pt-45x90': '2x4', '45x70': 'pt-50x57', '45x95': 'pt-45x90' },
      profiles: { p4040: { kg: 1.65, source: 'ipcP4040' }, p4080: { kg: 3.0, source: 'ipcP4080' } },
      hardware: { brackets: 'ipcCantoneira', tnuts: 'ipcParafusoM8', bolts: 'ipcPorcaM8' },
      alias: {},
    },
    // Spain: Bricoking's fir battens 70 x 45 and 90 x 45 mm (2,4 m); Leroy Merlin's raw plywood 122 x 250 cm and
    // Bricoking's phenolic OSB 250 x 125 cm, both 18 mm; Motedis Spain's I-type slot-8 profile (weights from the RS PRO
    // datasheet, as in English)
    es: {
      units: 'metric', sample: { driver: { h: 1750, inseam: 0 } },
      lumber: [M('es-45x70', 45, 70, ['bkListon7045'], [2400]), M('es-45x90', 45, 90, ['bkListon9045'], [2400])],
      stock: [2400], lumberDefault: 'es-45x90', stockDefault: 2400, sheetDefault: 'es-ply18',
      sheets: [
        { id: 'es-ply18', kind: 'plywood', t: 18, w: 1220, l: 2500, source: 'lmEsContrachapado' },
        { id: 'es-osb18', kind: 'osb', t: 18, w: 1250, l: 2500, source: 'bkOsb18' },
      ],
      swap: { '2x3': 'es-45x70', '2x4': 'es-45x90', 'es-45x70': '2x3', 'es-45x90': '2x4', '45x70': 'es-45x70', '45x95': 'es-45x90' },
      profiles: { p4040: { source: 'motedisEsP4040', also: ['motedisEsB10'] }, p4080: { source: 'motedisEsP4080' } },
      hardware: { brackets: 'motedisEsEscuadra', tnuts: 'motedisEsTuerca' },
      alias: {},
    },
    // France: Castorama's planed batten 44 x 70 mm (2,40 m) and Brico Dépôt's treated rafter 63 x 75 mm (2,4 to 5 m);
    // Castorama's hardwood plywood and OSB 3, 244 x 122 cm, 18 mm; Motedis France's I-type slot-8 profile
    fr: {
      units: 'metric', sample: { driver: { h: 1750, inseam: 0 } },
      lumber: [M('fr-44x70', 44, 70, ['castoTasseau4470'], [2400]), M('fr-63x75', 63, 75, ['bdChevron6375'], [2400, 3000, 4000, 5000])],
      stock: [2400, 3000, 4000, 5000], lumberDefault: 'fr-63x75', stockDefault: 3000, sheetDefault: 'fr-ply18',
      sheets: [
        { id: 'fr-ply18', kind: 'plywood', t: 18, w: 1220, l: 2440, source: 'castoCp18' },
        { id: 'fr-osb18', kind: 'osb', t: 18, w: 1220, l: 2440, source: 'castoOsb18' },
      ],
      swap: { '2x3': 'fr-44x70', '2x4': 'fr-63x75', 'fr-44x70': '2x3', 'fr-63x75': '2x4', '45x70': 'fr-44x70', '45x95': 'fr-63x75' },
      profiles: { p4040: { source: 'motedisFrP4040', also: ['motedisFrB10'] }, p4080: { source: 'motedisFrP4080' } },
      hardware: { brackets: 'motedisFrEquerre', tnuts: 'motedisFrEcrou' },
      alias: {},
    },
    // Italy: OBI Italia's planed fir battens 45 x 80 and 45 x 95 mm (2 m); OSB-3 250 x 125 cm in 18 and 15 mm; Motedis
    // Italy's I-type slot-8 profile
    it: {
      units: 'metric', sample: { driver: { h: 1750, inseam: 0 } },
      lumber: [M('it-45x80', 45, 80, ['obiItListello4580'], [2000]), M('it-45x95', 45, 95, ['obiItListello4595'], [2000])],
      stock: [2000], lumberDefault: 'it-45x95', stockDefault: 2000, sheetDefault: 'it-osb18',
      sheets: [
        { id: 'it-osb18', kind: 'osb', t: 18, w: 1250, l: 2500, source: 'obiItOsb18' },
        { id: 'it-osb15', kind: 'osb', t: 15, w: 1250, l: 2500, source: 'obiItOsb15' },
      ],
      swap: { '2x3': 'it-45x80', '2x4': 'it-45x95', 'it-45x80': '2x3', 'it-45x95': '2x4', '45x70': 'it-45x80', '45x95': 'it-45x95' },
      profiles: { p4040: { source: 'motedisItP4040', also: ['motedisItB10'] }, p4080: { source: 'motedisItP4080' } },
      hardware: { brackets: 'motedisItStaffa', tnuts: 'motedisItTassello' },
      alias: {},
    },
  };

  return { CHECKED, LOCAL_CHECKED, LOCAL_CHECKED_2, IN, FT, SOURCES, LOCAL_SOURCES, BODY, MODEL, LUMBER, STOCK, SWAP, SHEETS, PROFILES, PROFILE_STOCK, ASPECTS, RULES, STYLES, SEATS, GEAR, MARKETS };
});
