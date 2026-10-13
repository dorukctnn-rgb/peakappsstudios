/* Coop Designer: the facts the tool builds and checks with, each with its source and the date it was read.
 * Lumber: the actual (minimum dressed, dry) sizes of US dimension lumber from PS 20-25, Table 3, and the finished
 * sizes of metric sections from merchants' listings. Sheets: PS 1-19 (US) and merchants' listings (metric). Mesh:
 * openings, gauges, coatings and roll sizes from retailers' listings (no prices). Space, nest boxes, roosts, mesh and
 * aprons: the figures of university extension services, quoted as guidance. Where two guides disagree the tool shows
 * the range and both sources; no law sets these sizes for a backyard flock. Nothing here is a price.
 * Works in the browser (window.CoopData) and in Node (module.exports) for the tests. */
(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory();
  else root.CoopData = factory();
})(typeof self !== 'undefined' ? self : this, function () {
  'use strict';
  const CHECKED = '2026-10-12';
  const IN = 25.4, FT = 304.8, SQFT = 0.09290304; // mm per inch, mm per foot, square metres per square foot

  // ---------- Sources, each read on CHECKED ----------
  const S = (short, title, url) => ({ short, title, url, checked: CHECKED });
  const SOURCES = {
    // lumber and sheets
    ps20: S('PS 20-25, Table 3', 'American Softwood Lumber Standard, Voluntary Product Standard PS 20-25 (NIST, January 2025), Table 3, nominal and minimum-dressed sizes of boards, dimension and timbers', 'https://www.nist.gov/document/ps-20-25-final'),
    ps20len: S('PS 20-25, 5.3.1', 'American Softwood Lumber Standard PS 20-25, section 5.3.1: standard lengths are multiples of 1 ft or 2 ft, as the grading rules specify', 'https://www.nist.gov/document/ps-20-25-final'),
    ps1: S('PS 1-19', 'Structural Plywood, Voluntary Product Standard PS 1-19 (NIST, December 2019): section 5.4 states its grade rules for 1220 by 2440 mm (48 x 96 in) panels; its thickness table lists the 15/32 and 23/32 Performance Categories', 'https://www.nist.gov/document/doc-ps-1-19-structural-plywood'),
    tpCls63: S('Travis Perkins, 38 x 63 mm CLS', 'Travis Perkins: 38mm x 63mm x 3.0m CLS Profile Kiln Dried Studwork and Framing Timber', 'https://www.travisperkins.co.uk/cls-studwork-timber/38mm-x-63mm-x-3-0m-cls-profile-kiln-dried-studwork-and-framing-timber/p/956011'),
    bfCls63: S('Beesley & Fildes, CLS 38 x 63 mm', 'Beesley & Fildes: CLS Kiln Dried 50x75mm C16 Graded, finish size 38 x 63mm, lengths 2.4, 3.0 and 4.8 m', 'https://beesleyandfildes.co.uk/c16-graded-kd-h-t-cls-50x75mm-38fx63f-p-'),
    tpCls89: S('Travis Perkins, 38 x 89 mm CLS', 'Travis Perkins: 38mm x 89mm x 4.8m CLS Profile Kiln Dried Studwork Timber (also sold at 2.4 m)', 'https://www.travisperkins.co.uk/cls-studwork-timber/38mmx89mmx4-8m-cls-profile-kiln-dried-studwork-timber/p/847886'),
    mkm45: S('MKM, 45 x 45 mm DAR', 'MKM: DAR Redpine 45mm x 45mm, dressed all round, 4.2 m', 'https://mkm.com/product/dar-redpine-45mm-x-45mm-t010797'),
    m10_90: S('Mitre 10, 90 x 45 mm MGP10', 'Mitre 10 (Australia): Timber Treated Pine F7/MGP10 H3 90 x 45mm, available from 2.4 m to 6.0 m in 0.3 m steps', 'https://www.mitre10.com.au/timber-treated-pine-f7-mgp10-h3-90-x-45mm-3891041'),
    tpPly12: S('Travis Perkins, 12 mm plywood', 'Travis Perkins: 12mm x 2440mm x 1220mm Softwood Shuttering Plywood (exterior glue bond, EN 314-2 Class 3; seal it for outdoor use)', 'https://www.travisperkins.co.uk/plywood/12mm-x-2440mm-x-1220mm-softwood-shuttering-plywood/p/683572'),
    tpPly18: S('Travis Perkins, 18 mm plywood', 'Travis Perkins: 18mm x 2440mm x 1220mm Structural Hardwood Plywood', 'https://www.travisperkins.co.uk/plywood/18mm-x-2440mm-x-1220mm-structural-hardwood-plywood/p/670588'),
    // mesh listings
    neweggHc: S('Newegg, 1/2 in hardware cloth', 'Newegg (VEVOR): Hardware Cloth, 1/2 inch, 36in x 50 ft, 19 Gauge, Hot Dipped Galvanized, model SS12123650G; mesh 0.5 x 0.5 in (12.7 x 12.7 mm); also sold 24 in x 100 ft', 'https://www.newegg.com/p/2AC-00N9-01G12'),
    dib12: S('Do it Best, 1/2 in hardware cloth', 'Do it Best: Do it 1/2 In. Mesh x 36 In. H. x 100 Ft. L. 19-Ga. Hardware Cloth, item 717834; mesh spacing 1/2 x 1/2 in, galvanized after welded', 'https://www.doitbest.com/product/717834/do-it-1-2-in-x-36-in-h-x-100-ft-l-19-ga-hardware-cloth-717834/'),
    dib14: S('Do it Best, 1/4 in hardware cloth', 'Do it Best: Agway 1/4 In. Mesh x 48 In. H. x 100 Ft. L. 23-Ga. Hardware Cloth, item 735884; mesh spacing 0.25 x 0.25 in, galvanized after welded', 'https://www.doitbest.com/product/735884/do-it-1-4-in-x-48-in-h-x-100-ft-l-23-ga-hardware-cloth-735884/'),
    dib1x2: S('Do it Best, 1 x 2 in welded wire', 'Do it Best: 48 In. H. x 100 Ft. L. (1x2) Zinc-Coated Galvanized Welded Wire Fence, item 718003; gauge 14, mesh spacing 1 x 2 in, galvanized before welded', 'https://www.doitbest.com/product/718003/48-in-h-x-100-ft-l-1x2-zinc-coated-galvanized-welded-wire-fence-718003/'),
    dib2x4: S('Do it Best, 2 x 4 in welded wire', 'Do it Best: 48 In. H. x 100 Ft. L. (2x4) Galvanized Welded Wire Fence, item 711517; gauge 14, mesh spacing 2 x 4 in, galvanized before welded', 'https://www.doitbest.com/product/711517/48-in-h-x-100-ft-l-2x4-galvanized-welded-wire-fence-711517/'),
    aihNet: S('AIH, 1 in poultry netting', 'Alaska Industrial Hardware: Grip-Rite PN36150 Poultry Netting, 1 in hexagonal mesh, 50 ft L x 36 in H, 20 gauge, galvanized', 'https://www.aih.com/Product/FENPN36150'),
    brundle13: S('F.H. Brundle, 13 mm welded mesh', 'F.H. Brundle: 6m Roll, 36" x 1/2" x 1/2" x 19g Galvanised Welded Mesh; roll width 900 mm, mesh 13 x 13 mm, wire 1.00 mm', 'https://www.fhbrundle.co.uk/products/01026939B__Galvanised_Welded_Mesh_-_Mesh_Master'),
    sf13: S('Screwfix, 13 x 13 mm mesh', 'Screwfix: Apollo 13 x 13mm Galvanised Welded Mesh 0.9m x 6m, "ideal for the construction of pet runs and cages"', 'https://www.screwfix.com/p/apollo-13-x-13mm-galvanised-welded-mesh-0-9m-x-6m/53558'),
    sfNet: S('Screwfix, 25 mm wire netting', 'Screwfix: Apollo 25mm Galvanised Wire Netting 0.9m x 10m (gauge not stated)', 'https://www.screwfix.com/p/apollo-25mm-galvanised-wire-netting-0-9m-x-10m/32518'),
    // extension guidance
    psuHousing: S('Penn State Extension, housing', 'Penn State Extension: Small Scale Poultry Housing (Phillip Clauer; reviewed by Gregory P. Martin; updated 25 June 2026)', 'https://extension.psu.edu/small-scale-poultry-housing'),
    umdHousing: S('Maryland Extension, housing', 'University of Maryland Extension: Housing Requirements (Jonathan Moyle; updated 11 May 2022)', 'https://extension.umd.edu/resource/housing-requirements'),
    umdPredation: S('Maryland Extension, predators', 'University of Maryland Extension: Prevention of Predation (Jennifer L. Rhodes; updated 21 June 2022)', 'https://extension.umd.edu/resource/prevention-predation'),
    osuCoop: S('Oregon State EC 1644', 'Oregon State University Extension: Living on the land, Backyard chicken coop design, EC 1644 (April 2014, reviewed 2023)', 'https://extension.oregonstate.edu/catalog/ec-1644-living-land-backyard-chicken-coop-design'),
    vtHousing: S('Virginia Tech 2902-1092', 'Virginia Cooperative Extension: Small-scale Poultry Housing, 2902-1092 (APSC-186NP), Leonie Jacobs and Phillip J. Clauer, 28 April 2023', 'https://www.pubs.ext.vt.edu/2902/2902-1092/2902-1092.html'),
    pecSpace: S('Poultry Extension, space', 'Small and Backyard Poultry (extension.org): Space Allowances in Housing for Small and Backyard Poultry Flocks', 'https://poultry.extension.org/articles/getting-started-with-small-and-backyard-poultry/housing-for-small-and-backyard-poultry-flocks/space-allowances-in-housing-for-small-and-backyard-poultry-flocks/'),
    pecHousing: S('Poultry Extension, housing', 'Small and Backyard Poultry (extension.org): Small-Scale Poultry Housing, Overview (Jacquie Jacob, University of Kentucky)', 'https://poultry.extension.org/articles/getting-started-with-small-and-backyard-poultry/housing-for-small-and-backyard-poultry-flocks/small-scale-poultry-housing/'),
    pecPredators: S('Poultry Extension, predators', 'Small and Backyard Poultry (extension.org): Predator Management for Small and Backyard Poultry Flocks', 'https://poultry.extension.org/articles/poultry-management/predator-management-for-small-and-backyard-poultry-flocks/'),
    udel: S('Delaware Extension', 'University of Delaware Cooperative Extension: Steam Team, Chicken Housing and Coop Maintenance (Twila Parish-Short, May 2025)', 'https://www.udel.edu/academics/colleges/canr/cooperative-extension/fact-sheets/steam-team-chicken-housing-and-coop-maintenance/'),
    cornellWarren: S('Cornell, Warren County', 'Cornell Cooperative Extension of Warren County: Backyard Chickens (last updated 14 November 2022)', 'https://warren.cce.cornell.edu/agriculture/backyard-chickens'),
    umaine: S('Maine Extension', 'University of Maine Cooperative Extension: Housing Your Pullets, Four Options and Other Considerations (Richard Brzozowski)', 'https://extension.umaine.edu/4h/egg-business-project/housing-your-pullets/'),
    ufAN239: S('UF/IFAS AN239', 'University of Florida IFAS Extension: AN239, Raising Backyard Chickens for Eggs (Mary E. Henry and others)', 'https://ask.ifas.ufl.edu/publication/an239'),
    uconn: S('UConn Extension', 'UConn Today: Ask UConn Extension, What to Know about Raising Backyard Poultry (Indu Upadhyaya, 14 March 2025)', 'https://today.uconn.edu/2025/03/ask-uconn-extension-what-to-know-about-raising-backyard-poultry/'),
    usu: S('Utah State, rodents and wire', 'Utah State University: Is There a Correlation between Backyard Chickens and Increased Rodents? (Terry Messmer, Extension wildlife specialist; 24 August 2018)', 'https://www.usu.edu/today/story/is-there-a-correlation-between-backyard-chickens-and-increased-rodents'),
    csuPredators: S('Colorado State, predators', 'Colorado State University Extension: Chickens and Predators', 'https://extension.colostate.edu/resource/chickens-and-predators/'),
    csuBoulder: S('Colorado State, Boulder County', 'Colorado State University Extension, Boulder County: How to Care for Adult Chickens and Solve Common Problems (2018, PDF)', 'https://boulder.extension.colostate.edu/wp-content/uploads/sites/7/2019/11/How-to-Care-for-Adult-Chickens-2018.pdf'),
    unh: S('UNH Extension, predators', 'UNH Extension: What are the best ways to protect my chickens from predators? (26 February 2019)', 'https://extension.unh.edu/blog/2019/02/what-are-best-ways-protect-my-chickens-predators'),
    uaexCold: S('Arkansas Extension, cold', 'University of Arkansas Division of Agriculture: Backyard poultry coops prepped for cold still require good ventilation (11 January 2024)', 'https://www.uaex.uada.edu/media-resources/news/2024/january/1-11-2024-ark-cold-backyard-poultry.aspx'),
    epa: S('US EPA, wood preservatives', 'US EPA: Overview of Wood Preservative Chemicals', 'https://www.epa.gov/ingredients-used-pesticide-products/overview-wood-preservative-chemicals'),
    palram: S('Palram, corrugated sheet guide', 'Palram Australia: SUNTUF Roofing Installation Guide (pitch, purlin spacing, side lap)', 'https://www.palram.com/au/wp-content/uploads/sites/3/2019/07/SUNTUFF_Roofing_Installation_Guide-.pdf'),
    suncalc: S('SunCalc', 'SunCalc 1.9.0 by Vladimir Agafonkin (BSD-2-Clause), sun position from date, time and latitude', 'https://github.com/mourner/suncalc'),
  };

  // ---------- Lumber ----------
  // t = thickness, w = width, both actual (dressed) sizes in mm. US sizes are PS 20-25's dry minimum-dressed sizes.
  const LUMBER = {
    imperial: [
      { id: '2x2', label: '2x2', actual: '1 1/2 x 1 1/2 in', t: 1.5 * IN, w: 1.5 * IN, source: 'ps20' },
      { id: '2x3', label: '2x3', actual: '1 1/2 x 2 1/2 in', t: 1.5 * IN, w: 2.5 * IN, source: 'ps20' },
      { id: '2x4', label: '2x4', actual: '1 1/2 x 3 1/2 in', t: 1.5 * IN, w: 3.5 * IN, source: 'ps20' },
    ],
    metric: [
      { id: '45x45', label: '45 x 45 mm', actual: '45 x 45 mm, dressed all round', t: 45, w: 45, source: 'mkm45' },
      { id: '38x63', label: '38 x 63 mm CLS', actual: '38 x 63 mm (sold as 50 x 75 mm nominal)', t: 38, w: 63, source: 'tpCls63', also: ['bfCls63'] },
      { id: '38x89', label: '38 x 89 mm CLS', actual: '38 x 89 mm', t: 38, w: 89, source: 'tpCls89' },
      { id: '45x90', label: '45 x 90 mm', actual: '45 x 90 mm (Australia: 90 x 45 MGP10)', t: 45, w: 90, source: 'm10_90' },
    ],
  };
  // stock lengths in mm. US: PS 20-25 5.3.1 (multiples of 1 or 2 ft); stores stock some of them.
  // Metric: the lengths in the listings above (2.4, 3.0, 4.8 m at Beesley & Fildes; 4.2 m at MKM; 2.4 to 6.0 m at Mitre 10).
  const STOCK = {
    imperial: [8, 10, 12, 14, 16].map(f => ({ mm: f * FT, label: `${f} ft` })),
    metric: [2.4, 3.0, 3.6, 4.2, 4.8].map(m => ({ mm: Math.round(m * 1000), label: `${m.toFixed(1)} m` })),
  };
  const SWAP = { '2x2': '45x45', '2x3': '38x63', '2x4': '38x89', '45x45': '2x2', '38x63': '2x3', '38x89': '2x4', '45x90': '2x4' };

  // ---------- Sheet goods: siding and floors ----------
  const SHEET = {
    imperial: {
      wall: { w: 48 * IN, l: 96 * IN, t: 15 / 32 * IN, label: '4 x 8 ft exterior plywood, 15/32 in', source: 'ps1' },
      floor: { w: 48 * IN, l: 96 * IN, t: 23 / 32 * IN, label: '4 x 8 ft exterior plywood, 23/32 in', source: 'ps1' },
    },
    metric: {
      wall: { w: 1220, l: 2440, t: 12, label: '2440 x 1220 mm plywood, 12 mm, exterior glue', source: 'tpPly12' },
      floor: { w: 1220, l: 2440, t: 18, label: '2440 x 1220 mm plywood, 18 mm', source: 'tpPly18' },
    },
  };

  // ---------- Mesh ----------
  // kind: hardware (hardware cloth or fine welded mesh), welded (welded wire fence), poultry (hexagonal chicken wire).
  // open: [short, long] opening in mm; gauge: steel wire gauge as listed (null if the listing gives none); rolls:
  // [width, length] in mm, as listed.
  const MESH = [
    { id: 'hc12-19', label: '1/2 in hardware cloth, 19 gauge, galvanized', kind: 'hardware', open: [12.7, 12.7], gauge: 19, coat: 'galvanized',
      rolls: [[36 * IN, 50 * FT], [24 * IN, 100 * FT], [36 * IN, 100 * FT]], sources: ['neweggHc', 'dib12'] },
    { id: 'hc14-23', label: '1/4 in hardware cloth, 23 gauge, galvanized', kind: 'hardware', open: [6.35, 6.35], gauge: 23, coat: 'galvanized after welding',
      rolls: [[48 * IN, 100 * FT]], sources: ['dib14'] },
    { id: 'wm13-19', label: '13 x 13 mm welded mesh, 19 g (1.0 mm), galvanised', kind: 'hardware', open: [13, 13], gauge: 19, mm: 1.0, coat: 'galvanized',
      rolls: [[900, 6000]], sources: ['brundle13', 'sf13'] },
    { id: 'ww1x2-14', label: '1 x 2 in welded wire, 14 gauge, galvanized', kind: 'welded', open: [25.4, 50.8], gauge: 14, coat: 'galvanized before welding',
      rolls: [[48 * IN, 100 * FT]], sources: ['dib1x2'] },
    { id: 'ww2x4-14', label: '2 x 4 in welded wire fence, 14 gauge', kind: 'welded', open: [50.8, 101.6], gauge: 14, coat: 'galvanized before welding',
      rolls: [[48 * IN, 100 * FT]], sources: ['dib2x4'] },
    { id: 'poultry', label: 'Chicken wire, 1 in poultry netting, 20 gauge', kind: 'poultry', open: [25.4, 25.4], gauge: 20, coat: 'galvanized',
      rolls: [[36 * IN, 50 * FT]], sources: ['aihNet'] },
    { id: 'poultry25', label: '25 mm galvanised wire netting (chicken wire)', kind: 'poultry', open: [25, 25], gauge: null, coat: 'galvanized',
      rolls: [[900, 10000]], sources: ['sfNet'] },
  ];
  // when a mesh has no roll in the user's units, the tool starts from this roll and asks for the size of the one bought
  const ROLL_DEFAULT = { imperial: [36 * IN, 50 * FT], metric: [900, 6000] };

  // ---------- Guidance (each figure with its source; ranges where the guides disagree) ----------
  // Areas in square feet per bird, lengths in inches; the engine converts. "fits" is the lower end of the most recent
  // extension table we read (Virginia Tech, 2023) for that size of bird; "low" is the smallest figure any guide gives,
  // below which the check fails; "auto" is what the tool sizes a new design to (the top of Virginia Tech's range).
  const RULES = {
    coop: {
      standard: { fits: 3, low: 1.5, auto: 4, range: [1.5, 4] },
      bantam: { fits: 2, low: 0.75, auto: 3, range: [0.75, 3] },
    },
    run: {
      standard: { fits: 10, low: 4, auto: 10, range: [4, 10] },
      bantam: { fits: 5, low: 4, auto: 8, range: [4, 8] },
    },
    // one nest box per 3 to 5 hens; the tool builds one per 4 (Oregon State) and passes one per 5
    nestsAuto: 4, nestsFits: 5,
    nestSize: { standard: 12, bantam: 10 },   // inches square: 12 (Penn State, Oregon State, Florida), 10 (Maryland)
    nestHeight: 24,                           // inches off the ground (Penn State, Florida; Maryland: above the floor)
    roost: {
      standard: { fits: 8, low: 5, auto: 10 },   // inches of bar per bird: 8 to 10 (Virginia Tech), 5 to 10 (Oregon State), 6 (Penn State), 6 to 7 (Maryland)
      bantam: { fits: 4, low: 4, auto: 8 },      // 4 (Penn State, bantams)
    },
    roostHeight: { standard: [18, 48], bantam: [12, 48] }, // inches: 18 to 24 (Penn State), 2 ft (Oregon State), never over 4 ft (Penn State)
    roostGap: 10,                                      // inches between bars: 10 (Oregon State), 1 ft (Penn State)
    // aprons, in inches: buried at least 12 deep with the foot turned out about 6 (Penn State, Virginia Tech, extension.org);
    // L-shaped, 1 ft down and 1 ft out (Colorado State); 12 to 18 in an L (Florida); 6 to 12 (Oregon State)
    apronDepth: 12, apronToe: 6, apronOut: 12, apronLow: 6,
    // openings smaller than one inch so a raccoon cannot reach through (UNH); 1/4 to 1/2 in hardware cloth (Utah State)
    openMax: 25.4, openBest: 12.7,
    // the tool's own starting point for permanent vents (no extension guide we read gives an area): 1 sq ft per 10 sq ft of floor
    ventStart: 0.1,
    // corrugated sheet: pitch at least 5 degrees, purlins at most 800 mm apart at the ends (Palram)
    roofPitchMin: 5, purlinEnd: 800,
    heatDeath: 104, // degrees F (Colorado State, Boulder County: chickens can die at 104 F)
  };

  return { CHECKED, IN, FT, SQFT, SOURCES, LUMBER, STOCK, SWAP, SHEET, MESH, ROLL_DEFAULT, RULES };
});
