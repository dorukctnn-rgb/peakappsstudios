/* Sim Rig Designer: the facts the tool builds and checks with, each with its source and the date it was read.
 * Posture: the angles drivers chose in Porter and Gyi's adjustable driving rig (1998) with the earlier theoretical
 * ranges they compare against (Rebiffé 1969, Grandjean 1980), the SAE J1100 definitions and vehicle classes, and the
 * sim-racing guides of Fanatec, Asetek and Qubic System. Where they disagree the checks show the range and every source.
 * Body: segment lengths scaled from the US Army's ANSUR II survey (2012, 6,068 adults), by linear fits we made from its
 * public data. Materials: PS 20-25 and PS 1-19 for US lumber and plywood; merchants' listings for metric timber and
 * sheets; RS PRO's datasheet for 40-series aluminium profile. Nothing here is a price, and no maker's bolt pattern is
 * stored: hole patterns are typed by the user. Works in the browser (window.SimRigData) and in Node for the tests. */
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

  return { CHECKED, IN, FT, SOURCES, BODY, MODEL, LUMBER, STOCK, SWAP, SHEETS, PROFILES, PROFILE_STOCK, ASPECTS, RULES, STYLES, SEATS, GEAR };
});
