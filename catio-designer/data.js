/* Catio Designer: the facts the tool builds and checks with, each with its source and the date it was read.
 * Lumber: the actual (minimum dressed, dry) sizes of US dimension lumber from PS 20-25, Table 3, and the finished
 * sizes of metric sections from merchants' listings. Mesh: openings, gauges, coatings and roll sizes from retailers'
 * listings (no prices). Rules of thumb for space, shelves, mesh, gaps, shade and materials from the pages named in
 * SOURCES, quoted as guidance: no official standard for catios exists. Nothing here is a price.
 * Works in the browser (window.CatioData) and in Node (module.exports) for the tests. */
(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory();
  else root.CatioData = factory();
})(typeof self !== 'undefined' ? self : this, function () {
  'use strict';
  const CHECKED = '2026-10-12';
  const IN = 25.4, FT = 304.8;

  // ---------- Sources, each read on CHECKED ----------
  const S = (short, title, url) => ({ short, title, url, checked: CHECKED });
  const SOURCES = {
    ps20: S('PS 20-25, Table 3', 'American Softwood Lumber Standard, Voluntary Product Standard PS 20-25 (NIST, January 2025), Table 3, nominal and minimum-dressed sizes of boards, dimension and timbers', 'https://www.nist.gov/document/ps-20-25-final'),
    ps20len: S('PS 20-25, 5.3.1', 'American Softwood Lumber Standard PS 20-25, section 5.3.1: standard lengths are multiples of 1 ft or 2 ft, as the grading rules specify', 'https://www.nist.gov/document/ps-20-25-final'),
    tpCls63: S('Travis Perkins, 38 x 63 mm CLS', 'Travis Perkins: 38mm x 63mm x 3.0m CLS Profile Kiln Dried Studwork and Framing Timber', 'https://www.travisperkins.co.uk/cls-studwork-timber/38mm-x-63mm-x-3-0m-cls-profile-kiln-dried-studwork-and-framing-timber/p/956011'),
    bfCls63: S('Beesley & Fildes, CLS 38 x 63 mm', 'Beesley & Fildes: CLS Kiln Dried 50x75mm C16 Graded, finish size 38 x 63mm, lengths 2.4, 3.0 and 4.8 m', 'https://beesleyandfildes.co.uk/c16-graded-kd-h-t-cls-50x75mm-38fx63f-p-'),
    chCls63: S('Chandlers, CLS 38 x 63 mm', 'Chandlers Building Supplies: 38x63mm (Nom 50x75mm) CLS Studding 2.4m Length', 'https://chandlersbs.co.uk/38x63mm-nom-50x75mm-cls-studding-2-4m-length-b22962'),
    tpCls89: S('Travis Perkins, 38 x 89 mm CLS', 'Travis Perkins: 38mm x 89mm x 4.8m CLS Profile Kiln Dried Studwork Timber (also sold at 2.4 m)', 'https://www.travisperkins.co.uk/cls-studwork-timber/38mmx89mmx4-8m-cls-profile-kiln-dried-studwork-timber/p/847886'),
    mkm45: S('MKM, 45 x 45 mm DAR', 'MKM: DAR Redpine 45mm x 45mm, dressed all round, 4.2 m', 'https://mkm.com/product/dar-redpine-45mm-x-45mm-t010797'),
    m10_90: S('Mitre 10, 90 x 45 mm MGP10', 'Mitre 10 (Australia): Timber Treated Pine F7/MGP10 H3 90 x 45mm, available from 2.4 m to 6.0 m in 0.3 m steps (the same section is sold untreated)', 'https://www.mitre10.com.au/timber-treated-pine-f7-mgp10-h3-90-x-45mm-3891041'),
    ps1: S('PS 1-19, 5.4', 'Structural Plywood, Voluntary Product Standard PS 1-19 (NIST, December 2019), section 5.4: grade requirements stated for 1220 mm by 2440 mm (48 x 96 in) panels', 'https://www.nist.gov/document/doc-ps-1-19-structural-plywood'),
    tpPly: S('Travis Perkins, 18 mm plywood', 'Travis Perkins search: 18mm x 2440mm x 1220mm plywood sheets', 'https://www.travisperkins.co.uk/search?text=18mm+plywood+2440+x+1220'),
    neweggHc: S('Newegg, 1/2 in hardware cloth', 'Newegg: Hardware Cloth, 1/2 inch, 36in x 50 ft, 19 Gauge, Hot Dipped Galvanized (also 24in x 100 ft); mesh size 0.5 x 0.5 in (12.7 x 12.7 mm)', 'https://www.newegg.com/p/2AC-00N9-01G12'),
    brundle13: S('F.H. Brundle, 13 mm welded mesh', 'F.H. Brundle: 6m Roll, 36" x 1/2" x 1/2" x 19g Galvanised Welded Mesh; roll width 900 mm, mesh 13 x 13 mm, 19 g (1.00 mm); also 30 m rolls, 1/2" x 1" 19g and 1/4" x 1/4" 23g', 'https://www.fhbrundle.co.uk/products/01026939B__Galvanised_Welded_Mesh_-_Mesh_Master'),
    sf13: S('Screwfix, 13 x 13 mm mesh', 'Screwfix: Apollo 13 x 13mm Galvanised Welded Mesh 0.9m x 6m, "ideal for the construction of pet runs and cages"', 'https://www.screwfix.com/p/apollo-13-x-13mm-galvanised-welded-mesh-0-9m-x-6m/53558'),
    sf13x25: S('Screwfix, 13 x 25 mm mesh', 'Screwfix: Apollo 13 x 25mm Galvanised Welded Mesh 0.9m x 6m', 'https://www.screwfix.com/p/apollo-13-x-25mm-galvanised-welded-mesh-0-9-x-6m/76864'),
    csMesh: S('Catio Spaces, choosing mesh', 'Catio Spaces: How to Pick the Right Cat Enclosure Mesh for Your Catio', 'https://catiospaces.com/catios-cat-enclosures/free-tips/diy-catio-materials-how-to-pick-the-right-cat-enclosure-mesh-for-your-catio/'),
    csPred: S('Catio Spaces, predators', 'Catio Spaces: Are Catios Coyote-Safe?', 'https://catiospaces.com/catios-cat-enclosures/free-tips/are-catios-coyote-safe/'),
    csHeat: S('Catio Spaces, heatwave tips', 'Catio Spaces: Cooling-Off Kitty, 3 Things to Add to Your Catio During a Heatwave', 'https://catiospaces.com/catios-cat-enclosures/free-tips/cooling-off-kitty-3-things-to-add-to-your-catio-during-a-heatwave/'),
    csLoc: S('Catio Spaces, choosing a place', 'Catio Spaces: Where Can You Build a Catio?', 'https://catiospaces.com/catios-cat-enclosures/free-tips/where-can-you-build-a-catio/'),
    bcspca: S('BC SPCA catio plan', 'BC SPCA: DIY Stand Alone Catio (PDF plan)', 'https://spca.bc.ca/wp-content/uploads/DIY-Stand-Alone-Catio.pdf'),
    hwCatios: S('Humane World for Animals, catios', 'Humane World for Animals: Catios, Safe Outdoor Enclosures for Happy, Healthy Cats', 'https://www.humaneworld.org/catios'),
    hwSheet: S('Humane World for Animals, fact sheet', 'Humane World for Animals: Catios fact sheet (PDF)', 'https://humanepro.org/sites/default/files/documents/Catios-fact-sheet.pdf'),
    catnetsFaq: S('Catnets, enclosure FAQ', 'Catnets: Cat Enclosure FAQ, "How many cats can I put in my enclosure?"', 'https://help.catnets.com.au/en-US/articles/cat-enclosure-faq-403157'),
    catnetsRun: S('Catnets, cats per run', 'Catnets: How many cats can I put in my cat run?', 'https://help.catnets.com.au/en-US/how-many-cats-can-i-put-in-my-cat-run-5890409'),
    catnetsSize: S('Catnets, enclosure size', 'Catnets: How big should a cat enclosure be?', 'https://help.catnets.com.au/en-US/how-big-should-a-cat-enclosure-be-5890455'),
    rfShelves: S('The Refined Feline, shelf spacing', 'The Refined Feline: Cat Shelves Wall, Mistakes to Avoid', 'https://www.therefinedfeline.com/cat-shelf-installation-mistakes/'),
    rfWalk: S('The Refined Feline, catwalk guide', 'The Refined Feline: How to Build a Cat Wall Catwalk', 'https://www.therefinedfeline.com/how-to-build-a-cat-wall-catwalk/'),
    epa: S('US EPA, wood preservatives', 'US EPA: Overview of Wood Preservative Chemicals', 'https://www.epa.gov/ingredients-used-pesticide-products/overview-wood-preservative-chemicals'),
    palram: S('Palram, corrugated sheet guide', 'Palram Australia: SUNTUF Roofing Installation Guide (pitch, purlin spacing, side lap)', 'https://www.palram.com/au/wp-content/uploads/sites/3/2019/07/SUNTUFF_Roofing_Installation_Guide-.pdf'),
    wvlt: S('WVLT, 6 February 2026', 'WVLT (Gray Television): Outdoor catios becoming more popular nationwide as pet spending increases, 6 February 2026', 'https://www.wvlt.tv/2026/02/06/outdoor-catios-becoming-more-popular-nationwide-pet-spending-increases/'),
    suncalc: S('SunCalc', 'SunCalc 1.9.0 by Vladimir Agafonkin (BSD-2-Clause), sun position from date, time and latitude', 'https://github.com/mourner/suncalc'),
    geonames: S('GeoNames', 'GeoNames cities15000 (CC BY 4.0), trimmed when the site is built', 'https://download.geonames.org/export/dump/'),
  };

  // ---------- Lumber ----------
  // t = thickness, w = width, both actual (dressed) sizes in mm. US sizes are PS 20-25's dry minimum-dressed sizes,
  // whose inch values are the units of record (1-1/2, 2-1/2 and 3-1/2 in). Rough or green cedar can be larger: measure yours.
  const LUMBER = {
    imperial: [
      { id: '2x2', label: '2x2', actual: '1 1/2 x 1 1/2 in', t: 1.5 * IN, w: 1.5 * IN, source: 'ps20' },
      { id: '2x3', label: '2x3', actual: '1 1/2 x 2 1/2 in', t: 1.5 * IN, w: 2.5 * IN, source: 'ps20' },
      { id: '2x4', label: '2x4', actual: '1 1/2 x 3 1/2 in', t: 1.5 * IN, w: 3.5 * IN, source: 'ps20' },
    ],
    metric: [
      { id: '45x45', label: '45 x 45 mm', actual: '45 x 45 mm, dressed all round', t: 45, w: 45, source: 'mkm45' },
      { id: '38x63', label: '38 x 63 mm CLS', actual: '38 x 63 mm (sold as 50 x 75 mm nominal)', t: 38, w: 63, source: 'tpCls63', also: ['bfCls63', 'chCls63'] },
      { id: '38x89', label: '38 x 89 mm CLS', actual: '38 x 89 mm', t: 38, w: 89, source: 'tpCls89' },
      { id: '45x90', label: '45 x 90 mm', actual: '45 x 90 mm (Australia: 90 x 45 MGP10)', t: 45, w: 90, source: 'm10_90' },
    ],
  };
  // stock lengths in mm. US: PS 20-25 5.3.1 (multiples of 1 or 2 ft); stores stock some of them.
  // Metric: the lengths seen in the listings above (2.4, 3.0, 4.8 m at Beesley & Fildes; 4.2 m at MKM; 2.4 to 6.0 m at Mitre 10).
  const STOCK = {
    imperial: [8, 10, 12, 14, 16].map(f => ({ mm: f * FT, label: `${f} ft` })),
    metric: [2.4, 3.0, 3.6, 4.2, 4.8].map(m => ({ mm: Math.round(m * 1000), label: `${m.toFixed(1)} m` })),
  };
  // the same frame in the other system, when the units are switched
  const SWAP = { '2x2': '45x45', '2x3': '38x63', '2x4': '45x90', '45x45': '2x2', '38x63': '2x3', '38x89': '2x4', '45x90': '2x4' };

  // ---------- Sheet goods (floor, shelves, ramps, litter bench, window insert) ----------
  const SHEET = {
    imperial: { w: 48 * IN, l: 96 * IN, t: 0.75 * IN, label: '4 x 8 ft plywood, 3/4 in (sold as 23/32 in)', source: 'ps1' },
    metric: { w: 1220, l: 2440, t: 18, label: '2440 x 1220 mm plywood, 18 mm', source: 'tpPly' },
  };

  // ---------- Mesh ----------
  // open: [short, long] opening in mm; gauge: steel wire gauge as listed (null if the listing gives none); mm: wire
  // diameter where the listing states it. kind decides the material check. rolls: [width, length] in mm, as listed.
  const MESH = [
    { id: 'hc12-19', label: '1/2 in hardware cloth, 19 gauge, galvanized', kind: 'welded', open: [12.7, 12.7], gauge: 19, mm: 1.0, coat: 'galvanized',
      rolls: [[36 * IN, 50 * FT], [24 * IN, 100 * FT], [900, 6000], [900, 30000]], sources: ['neweggHc', 'brundle13'] },
    { id: 'wm13-19', label: '13 x 13 mm welded mesh, 19 g (1.0 mm), galvanised', kind: 'welded', open: [13, 13], gauge: 19, mm: 1.0, coat: 'galvanized',
      rolls: [[900, 6000], [900, 30000]], sources: ['brundle13', 'sf13'] },
    { id: 'hc12x1-19', label: '1/2 x 1 in (13 x 25 mm) welded mesh, 19 gauge, galvanized', kind: 'welded', open: [12.7, 25.4], gauge: 19, mm: 1.0, coat: 'galvanized',
      rolls: [[900, 6000]], sources: ['brundle13', 'sf13x25'] },
    { id: 'ww1x1', label: '1 x 1 in (25 x 25 mm) welded mesh, galvanized or stainless', kind: 'welded', open: [25.4, 25.4], gauge: null, coat: 'galvanized or stainless',
      rolls: [], sources: ['bcspca'] },
    { id: 'ww2x3-16', label: '2 x 3 in welded fence wire, 16 gauge, galvanized', kind: 'welded', open: [50.8, 76.2], gauge: 16, coat: 'galvanized',
      rolls: [], sources: ['csMesh', 'csPred'] },
    { id: 'hc14-23', label: '1/4 in hardware cloth, 23 gauge, galvanized', kind: 'welded', open: [6.35, 6.35], gauge: 23, coat: 'galvanized',
      rolls: [[900, 6000]], sources: ['brundle13'] },
    { id: 'vinyl2x3-16', label: '2 x 3 in vinyl-coated welded wire, 16 gauge', kind: 'vinyl', open: [50.8, 76.2], gauge: 16, coat: 'vinyl (PVC)',
      rolls: [], sources: ['csMesh'] },
    { id: 'poultry', label: 'Chicken wire (poultry netting)', kind: 'poultry', open: null, gauge: null, coat: 'galvanized',
      rolls: [], sources: ['csMesh', 'csPred'] },
    { id: 'screen', label: 'Window or porch screen (fiberglass or plastic)', kind: 'screen', open: null, gauge: null, coat: 'none',
      rolls: [], sources: ['csMesh', 'csPred'] },
  ];
  // when a mesh has no listed roll, the tool starts from this roll and asks for the size of the one you buy
  const ROLL_DEFAULT = { imperial: [48 * IN, 50 * FT], metric: [1200, 10000] };

  // ---------- Rules of thumb (guidance, each with its source) ----------
  const RULES = {
    // Catio Spaces: "16-gauge fencing wire with no more than 2"x3" grid openings"; chicken wire "ranges from 19-22 gauge"
    meshMaxOpen: [2 * IN, 3 * IN], meshGauge: 16, poultryGauge: [19, 22],
    // the tool's own rule (no source gives a gap size): any gap no wider than the short side of the mesh, and never over 1 in
    gapCap: 25.4,
    // The Refined Feline: vertical spacing 12 to 18 in for older or cautious cats, up to 24 in for young athletic cats;
    // horizontal gaps under 24 in; first shelf 18 to 24 in up (when reached from the floor)
    stepCautious: 18 * IN, stepAthletic: 24 * IN, gapMax: 24 * IN, firstShelf: [18 * IN, 24 * IN],
    // The Refined Feline catwalk guide: platforms at least 0.75 in thick for cats under 15 lb, 1 in for larger cats
    shelfThick: 0.75 * IN, shelfThickLarge: 1 * IN,
    // Catnets: "each cat has a minimum of 2 square metres of space" (several cats in a portable enclosure)
    areaPerCat: 2.0,
    // Palram: corrugated sheet, pitch at least 5 degrees (88 mm per metre), purlins at most 800 mm apart at the ends
    // and 1000 mm in mid span, side lap 1 1/2 corrugations
    roofPitchMin: 5, purlinEnd: 800, purlinMid: 1000,
    // the tool's own shade test (no guide gives hours or a share): on the longest day, at every hour from 11:00 to
    // 15:00 sun time, the hottest part of the day, at least a quarter of the floor is in shade
    shadeShare: 0.25, shadeFrom: 11, shadeTo: 15,
  };

  // ---------- Wall types, for the attachment detail ----------
  const WALLS = {
    wood: { label: 'Wood or fiber-cement siding over a wood frame', fix: 'Find the studs behind the siding. Fix each wall batten and the ledger into the studs with exterior structural screws or lag screws long enough to pass through the siding and sheathing well into the stud, one fixing per stud at each crossing. Seal each hole.' },
    vinyl: { label: 'Vinyl siding', fix: 'Vinyl siding moves with heat, so do not clamp it tight. Fit mounting blocks made for vinyl siding where the battens and ledger go, or cut the siding back neatly and fix into the studs behind with a spacer, so the siding can still slide.' },
    masonry: { label: 'Brick, block or stone', fix: 'Drill into the brick or block, not the mortar joint, and use masonry anchors rated for outdoor use, sized for the frame. Keep the wood off the wall with a spacer or washer so water can drain.' },
    stucco: { label: 'Stucco or render', fix: 'Stucco cracks if a fixing is overtightened. Drill through to the structure behind (studs or block), fix there, and seal round each fixing with an exterior sealant.' },
  };

  return { CHECKED, IN, FT, SOURCES, LUMBER, STOCK, SWAP, SHEET, MESH, ROLL_DEFAULT, RULES, WALLS };
});
