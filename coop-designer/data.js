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
      wall: { id: 'us-wall', w: 48 * IN, l: 96 * IN, t: 15 / 32 * IN, label: '4 x 8 ft exterior plywood, 15/32 in', source: 'ps1' },
      floor: { id: 'us-floor', w: 48 * IN, l: 96 * IN, t: 23 / 32 * IN, label: '4 x 8 ft exterior plywood, 23/32 in', source: 'ps1' },
    },
    metric: {
      wall: { id: 'uk-wall', w: 1220, l: 2440, t: 12, label: '2440 x 1220 mm plywood, 12 mm, exterior glue', source: 'tpPly12' },
      floor: { id: 'uk-floor', w: 1220, l: 2440, t: 18, label: '2440 x 1220 mm plywood, 18 mm', source: 'tpPly18' },
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

  // ---------- The French and Spanish editions: their own materials and sources, read on LOCAL_CHECKED ----------
  // Sizes only as the retailers' own pages give them (no prices); the guidance stays the extension services' above,
  // with the European and national rules for laying hens added where they give a figure (they apply to flocks of 350
  // hens or more, so the tool cites them as a point of comparison, never as the rule for a backyard flock).
  const LOCAL_CHECKED = '2026-10-13';
  const L = (short, title, url) => ({ short, title, url, checked: LOCAL_CHECKED });
  const BD = 'https://www.bricodepot.fr', CA = 'https://www.castorama.fr', BK = 'https://www.bricoking.es';
  // the second round of editions (Italian, Brazilian, Dutch, German), read on LOCAL_CHECKED_2
  const LOCAL_CHECKED_2 = '2026-10-14';
  const L2 = (short, title, url) => ({ short, title, url, checked: LOCAL_CHECKED_2 });
  const OB = 'https://www.obi-italia.it', MM = 'https://www.madeiramadeira.com.br', GM = 'https://www.gamma.nl/assortiment', PX = 'https://www.praxis.nl', OD = 'https://www.obi.de';
  const LOCAL_SOURCES = {
    // France: lumber, panels, mesh and roof sheets
    bdChevrons: L('Brico Dépôt, chevrons', 'Brico Dépôt : rayon Chevrons. Chevrons en épicéa traité classe 2 de 63 x 75 mm en 2,4, 3, 4 et 5 m ; de 50 x 75 mm en 4 m ; demi-chevrons de 38 x 63 mm en 3 et 4 m', `${BD}/produits/materiau-et-gros-oeuvre/toiture-et-facade/bois-de-charpente-et-ossature-bois/chevrons`),
    castoTasseaux: L('Castorama, tasseaux', 'Castorama : rayon Tasseau bois raboté. Tasseaux rabotés de 44 x 44 mm et 44 x 70 mm, bois tendre séché au four, pour l’intérieur ; tasseau en sapin traité de 45 x 45 mm ; tous en 2,40 m', `${CA}/tasseau-bois-rabote/cat_id_0005160.cat`),
    castoOsb: L('Castorama, OSB 3', 'Castorama : panneaux OSB 3 de 244 x 122 cm, en 9, 12, 15, 18 et 22 mm d’épaisseur', `${CA}/panneau-osb-3-244-x-122-cm-ep-12-mm-vendu-au-panneau-/3663602840176_CAFR.prd`),
    bdSoude13: L('Brico Dépôt, grillage soudé 13 mm', 'Brico Dépôt : Rouleau grillage soudé l. 5 x h. 1 m, maille 13 x 13 mm, fil galvanisé avec revêtement plastique (diamètre du fil non indiqué)', `${BD}/p/3663602731221/rouleau-grillage-soude-l-5-x-h-1-m`),
    bdSoude25: L('Brico Dépôt, grillage soudé 25 mm', 'Brico Dépôt : Grillage soudé galvanisé L. 10 x H. 1 m, maille 25 x 25 mm (diamètre du fil non indiqué)', `${BD}/p/3663602731276/grillage-soude-galvanise-l-10-x-h-1-m-maille-25-x-25-mm`),
    bdTriple25: L('Brico Dépôt, grillage triple torsion', 'Brico Dépôt : Grillage triple torsion galvanisé L. 10 x H. 1 m, maille 25 x 25 mm, maillage hexagonal', `${BD}/p/3663602731122/grillage-triple-torsion-galvanise-l-10-x-h-1-m-x-maille-25-x-25-mm`),
    bdOndulee: L('Brico Dépôt, plaque ondulée', 'Brico Dépôt : Plaque bitumineuse ondulée 9 ondes, 200 x 85,5 cm', `${BD}/p/3467670010567/plaque-bitumineuse-ondulee-9-ondes-rouge-200-x-85-5-cm`),
    // France: rules and the professional minimums
    chambresFiche: L('Chambres d’agriculture, fiche poules pondeuses', 'Chambres d’agriculture de Bretagne et des Pays de la Loire : Fiche Poules pondeuses n° 1, Réglementation bien-être sur l’élevage des poules pondeuses (juin 2011)', 'https://oaba.fr/PDF/Fiche_regl.pdf'),
    dir199974: L('Directive 1999/74/CE', 'Directive 1999/74/CE du Conseil du 19 juillet 1999 établissant les normes minimales relatives à la protection des poules pondeuses (article 1 et annexe)', 'https://eur-lex.europa.eu/legal-content/FR/TXT/?uri=CELEX:31999L0074'),
    agriBasseCour: L('Ministère de l’Agriculture, basses-cours', 'Ministère de l’Agriculture : Renforcement des mesures de biosécurité pour lutter contre l’influenza aviaire dans les basses-cours (dépliant, décembre 2021)', 'https://agriculture.gouv.fr/telecharger/85930'),
    spCerfa: L('Service Public, Cerfa 15472', 'Service Public : formulaire Cerfa 15472, déclaration de détention de volailles ou d’oiseaux captifs, particulier ou professionnel (page vérifiée le 9 octobre 2026)', 'https://www.service-public.gouv.fr/particuliers/vosdroits/R42501'),
    // Spain: lumber, boards, mesh and roof sheets
    bkListones: L('Bricoking, listones', 'Bricoking: listones de abeto de 45 x 45, 70 x 45 y 90 x 45 mm en 2400 mm (ref. 176.15759, 176.15773 y 176.15776)', `${BK}/maderas-y-revestimientos/listonaje`),
    obVigas: L('Obramat, vigas', 'Obramat: vigas de pino macizo con tratamiento autoclave de 3,3 x 7 x 300 cm y 4,5 x 9 x 300 cm (copia del Internet Archive del 17 de junio de 2026)', 'https://web.archive.org/web/20260617035255/https://www.obramat.es/madera/madera-construccion/vigas-de-madera/'),
    bkTableros: L('Bricoking, tableros', 'Bricoking: tablero OSB 3 WBP de 250 x 125 cm y 10 mm; tablero contrachapado WBP de pino de 244 x 122 cm y 18 mm', `${BK}/maderas-y-revestimientos/carpinteria`),
    bkMalla06: L('Bricoking, malla de 6 mm', 'Bricoking: malla metálica electrosoldada galvanizada FENSANET 06, 1 x 5 m, luz de 6,4 x 6,4 mm, alambre de 0,6 mm (ref. 177.10948)', `${BK}/jardin/cierre-y-ocultacion/mallas-y-enrejados/malla-metalica-electrosoldada-galvanizado-06-1x5m`),
    bkMalla12: L('Bricoking, malla de 12 mm', 'Bricoking: malla metálica electrosoldada galvanizada FENSANET 12, 1 x 5 m, luz de 12,7 x 12,7 mm, alambre de 0,8 mm (ref. 177.10949)', `${BK}/jardin/cierre-y-ocultacion/mallas-y-enrejados/malla-metalica-electrosoldada-galvanizado-12-1x5m`),
    bkMalla19: L('Bricoking, malla de 19 mm', 'Bricoking: malla metálica electrosoldada galvanizada FENSANET 19, 1 x 5 m, luz de 19 x 19 mm, alambre de 1,4 mm (ref. 177.10950)', `${BK}/jardin/cierre-y-ocultacion/mallas-y-enrejados/malla-metalica-electrosoldada-galvanizado-19-1x5m`),
    bkMalla25: L('Bricoking, malla de 25 mm', 'Bricoking: malla metálica electrosoldada galvanizada FENSANET 25, 1 x 5 m, luz de 25,4 x 25,4 mm, alambre de 1,4 mm aprox. (ref. 177.10951)', `${BK}/jardin/cierre-y-ocultacion/mallas-y-enrejados/malla-metalica-electrosoldada-galvanizado-25-1x5m`),
    bkHex19: L('Bricoking, malla de triple torsión', 'Bricoking: malla metálica de triple torsión galvanizada GALVANEX 19, 1 x 10 m, luz hexagonal de 19 mm, alambre de 0,7 mm (ref. 177.10955)', `${BK}/jardin/cierre-y-ocultacion/mallas-y-enrejados/malla-metalica-de-triple-torsion-galvanizado-19-1x10m`),
    bkIbiza: L('Bricoking, placa ondulada', 'Bricoking: placa Ibiza de 200 x 105 cm, ondulada de material termoplástico, para pequeñas cubiertas (ref. 52085.17)', `${BK}/construccion/cubricion-y-accesorios/cubricion-y-accesorios/placa-ibiza-terracota-200x105cm`),
    // Spain: rules and the professional minimums
    rd3_2002: L('Real Decreto 3/2002', 'Real Decreto 3/2002, de 11 de enero, por el que se establecen las normas mínimas de protección de las gallinas ponedoras (BOE-A-2002-831, texto consolidado, última actualización del 8 de marzo de 2023)', 'https://www.boe.es/eli/es/rd/2002/01/11/3/con'),
    rd637_2021: L('Real Decreto 637/2021', 'Real Decreto 637/2021, de 27 de julio, por el que se establecen las normas básicas de ordenación de las granjas avícolas (BOE-A-2021-12609, texto consolidado, última actualización del 23 de abril de 2025)', 'https://www.boe.es/buscar/act.php?id=BOE-A-2021-12609'),
    // Italy: OBI Italia's battens and posts, Leroy Merlin's 2,5 m batten, OSB/3, welded mesh, corrugated sheets; the
    // European directive in Italian and the national I&R manual for family flocks, as an ASL summarises it
    obiListelli: L2('OBI Italia, listelli e travetti', 'OBI Italia: listelli in abete piallati sui 4 lati 45 x 45, 45 x 60 e 45 x 95 mm lunghi 2000 mm; travetti in abete massello con angoli arrotondati 70 x 70 e 70 x 90 mm lunghi 3000 mm', `${OB}/search/travetto/`),
    obiGrezzi: L2('OBI Italia, listelli grezzi', 'OBI Italia: listelli in abete grezzo 40 x 40, 50 x 50 e 50 x 70 mm lunghi 2000 mm', `${OB}/search/legno%20da%20costruzione/`),
    lmItListelli: L2('Leroy Merlin, listelli', 'Leroy Merlin Italia: listello grezzo in abete 2,5 m x 50 mm, spessore 50 mm (ricerca listello abete)', 'https://www.leroymerlin.it/ricerca?q=listello%20abete'),
    obiOsb: L2('OBI Italia, pannelli OSB/3', 'OBI Italia: pannello OSB/3 250 x 125 cm, spessore 12 mm; pannello OSB/3 2500 x 1250 x 18 mm', `${OB}/p/2099083/pannello-osb-3-l-250-x-h-125-cm-sp-12-mm-legno-chiaro`),
    obiRabbit: L2('OBI Italia, rete Rabbit', 'OBI Italia: rete elettrosaldata zincata Rabbit 5 x 1 m, maglia 12,7 x 12,7 mm, filo 0,9 mm, altezza 100 cm, rotolo da 5 m', `${OB}/p/2087641/rete-elettrosaldata-zincata-rabbit-5x1-m-grigio`),
    obiBirdPlast: L2('OBI Italia, rete Bird Plast', 'OBI Italia: rete elettrosaldata zincata plastificata Bird Plast 5 x 1 m, maglia 12,7 x 12,7 mm, filo 0,90 mm, altezza 100 cm', `${OB}/p/2087690/rete-elettrosaldata-zincata-bird-plast-5x1-m-verde`),
    obiOnduline: L2('OBI Italia, lastra Onduline', 'OBI Italia: lastra Onduline da copertura 200 x 85 cm', `${OB}/p/5528906/lastra-onduline-da-copertura-200x85-cm-rosso`),
    dir199974it: L2('Direttiva 1999/74/CE', 'Direttiva 1999/74/CE del Consiglio, del 19 luglio 1999, che stabilisce le norme minime per la protezione delle galline ovaiole (articolo 1 e allegato), testo italiano su EUR-Lex', 'https://eur-lex.europa.eu/legal-content/IT/TXT/?uri=CELEX:31999L0074'),
    aslSassariIR: L2('ASL Sassari, anagrafe zootecnica', 'ASL n. 1 di Sassari, Servizio di Sanità Animale e Anagrafi Zootecniche: Manuale operativo dell’anagrafe zootecnica, sintesi del Manuale operativo per la gestione del sistema I&R (aprile 2025)', 'https://www.asl1sassari.it/wp-content/uploads/2025/04/Manuale-operativo-dellanagrafe-zootecnica-2025.pdf'),
    // Brazil: MadeiraMadeira's pine caibros and beam, Telhanorte's autoclave caibro, OSB at 2,44 x 1,22 m, Belgo's welded
    // mesh (the maker's catalogue page), the hexagonal aviary netting the stores sell, Onduline sheets; Embrapa's leaflet
    // on caipira poultry houses, the federal registration rule (IN MAPA 56/2007) and Embrapa's note on selling eggs
    mmCaibros: L2('MadeiraMadeira, caibros de pinus', 'MadeiraMadeira: caibro de pinus aparelhado 4,5 x 4,5 x 300 cm; caibros de pinus tratado 4,5 x 9 cm com 290 e 150 cm; viga de pinus tratado em autoclave 5 x 10 cm com 3 m (busca caibro pinus autoclavado)', `${MM}/busca?q=caibro%20pinus%20autoclavado`),
    tnCaibro: L2('Telhanorte, caibro autoclavado', 'Telhanorte: Pinus 600 serrado, caibro autoclavado bruto 50 x 57 x 3000 mm (Madvei)', 'https://www.telhanorte.com.br/pinus-600-serrado-caibro-autoclavado-bruto-50-x-57-x-3000-madvei-1528521/p'),
    mmOsb: L2('MadeiraMadeira, chapas de OSB', 'MadeiraMadeira: chapas de OSB de 2,44 x 1,22 m com 8, 10, 12 e 18 mm (busca chapa osb)', `${MM}/busca?q=chapa%20osb`),
    belgoSerralheiro: L2('Belgo, tela Serralheiro', 'Belgo Arames, na AECweb: Tela Belgo Serralheiro, tela eletrosoldada galvanizada, malha de 1,5 x 1,5 cm, 2,5 x 2,5 cm ou 5 x 5 cm, fio de 1,65 mm, de 1,50 a 2 mm ou de 2 a 2,76 mm, altura de 1 m a 1,50 m, rolo de 15 m', 'https://www.aecweb.com.br/produto/tela-belgo-serralheiro/36999'),
    mmViveiro: L2('MadeiraMadeira, tela de viveiro', 'MadeiraMadeira: tela de viveiro de 1/2 polegada, fio 24, malha hexagonal galvanizada, 50 m x 0,80 m (busca tela viveiro malha 1/2)', `${MM}/busca?q=tela%20viveiro%20malha%201%2F2`),
    mmOnduline: L2('MadeiraMadeira, telha Onduline', 'MadeiraMadeira: telha ecológica Clássica Fit Onduline, 3 mm, 2,00 x 0,75 m (busca telha onduline)', `${MM}/busca?q=telha%20onduline`),
    embrapaAviario: L2('Embrapa Meio-Norte, aviários caipiras', 'Embrapa Meio-Norte: Aviários para galinhas caipiras na agricultura familiar da Região Nordeste do Brasil (folder, 2ª edição, Teresina, novembro de 2018)', 'https://www.infoteca.cnptia.embrapa.br/infoteca/bitstream/doc/1099811/1/FolderAviario.pdf'),
    mapaIN56: L2('IN MAPA nº 56/2007', 'Ministério da Agricultura e Pecuária: Instrução Normativa nº 56, de 4 de dezembro de 2007, procedimentos para registro, fiscalização e controle de estabelecimentos avícolas de reprodução, comerciais e de ensino ou pesquisa (texto consolidado, Anexo I, art. 1º, parágrafo único)', 'https://www.gov.br/agricultura/pt-br/assuntos/sanidade-animal-e-vegetal/saude-animal/programas-de-saude-animal/pnsa/imagens/copy3_of_INSTRUONORMATIVAN56DE4DEDEZEMBRODE2007.pdf'),
    embrapaOvos: L2('Embrapa, legalização da atividade ovícola', 'Embrapa Agroindústria de Alimentos: Legalização da atividade ovícola, Rio de Janeiro (folder, abril de 2024)', 'https://www.infoteca.cnptia.embrapa.br/infoteca/bitstream/doc/1163737/1/Legalizacao-da-atividade-ovicola.pdf'),
    // the Netherlands: Gamma's planed spruce and its OSB3 and bitumen sheets, Praxis's welded mesh and 18 mm OSB; the
    // directive in Dutch, RVO on hobby poultry keepers and the Rijksoverheid on the shielding order during bird flu
    gammaGeschaafd: L2('Gamma, vuren geschaafd', 'Gamma: bouwhout vuren geschaafd 44 x 44 mm 330 cm, 44 x 94 mm 300 cm, vuren SLS geschaafd 38 x 89 mm 210 cm (zoeken: geschaafd vurenhout)', `${GM}/zoeken?text=geschaafd%20vurenhout`),
    gamma4444: L2('Gamma, vuren 44 x 44 mm', 'Gamma: bouwhout vuren geschaafd 44 x 44 mm 210 cm; voordeelpak vuren geschaafd 44 x 44 mm 210 en 390 cm; bouwhout vuren geschaafd 44 x 94 mm 210 cm (zoeken: vuren geschaafd 44x44)', `${GM}/zoeken?text=vuren%20geschaafd%2044x44`),
    gamma4469: L2('Gamma, vuren 44 x 69 mm', 'Gamma: bouwhout vuren geschaafd 44 x 69 mm 210 cm; voordeelpak vuren geschaafd 44 x 69 mm 270 cm (zoeken: vuren geschaafd 44x69)', `${GM}/zoeken?text=vuren%20geschaafd%2044x69`),
    gammaOsb: L2('Gamma, OSB3-plaat', 'Gamma: OSB3-plaat 244 x 122 cm, 11 mm, rechte kanten', `${GM}/osb3-plaat-244-x-122-cm-11-mm-met-rechte-kanten/p/B180437`),
    praxisOsb: L2('Praxis, OSB-plaat 18 mm', 'Praxis: OSB-plaat, tong en groef 2-zijdig, 18 mm, 244 x 122 cm', `${PX}/hout-ramen-trappen-deuren/hout/plaatmateriaal/osb/osb-plaat-tong-groef-2-zijdig-18-mm-244-x-122-cm/5639971`),
    praxisGaas12: L2('Praxis, gelast gaas 12,7 mm', 'Praxis: Giardino tuingaas, gelast gaas verzinkt, 101 cm x 25 m, maaswijdte 12,7 x 12,7 mm, draaddikte 0,8 mm', `${PX}/tuin-terras-buitenleven/schuttingen-hekwerken-afrastering/gaas-draadpanelen/tuingaas/giardino-tuingaas-gelast-gaas-verzinkt-101-cm-x-25-m/10354402`),
    praxisGaas19: L2('Praxis, gelast gaas 19 mm', 'Praxis: Giardino vogelgaas, gelast gaas verzinkt, 101 cm x 5 m, maaswijdte 19 x 19 mm, draaddikte 1,45 mm', `${PX}/tuin-terras-buitenleven/schuttingen-hekwerken-afrastering/gaas-draadpanelen/tuingaas/giardino-vogelgaas-gelast-gaas-verzinkt-101-cm-x-5-m/5382269`),
    praxisGaas25: L2('Praxis, gelast gaas 25 mm', 'Praxis: Giardino vogelgaas, gelast gaas verzinkt, 102 cm x 5 m, maaswijdte 25,4 x 25,4 mm, draaddikte 1,75 mm', `${PX}/tuin-terras-buitenleven/schuttingen-hekwerken-afrastering/gaas-draadpanelen/tuingaas/giardino-vogelgaas-gelast-gaas-verzinkt-102cm-x-5m/5514484`),
    gammaGolfplaat: L2('Gamma, golfplaat bitumen', 'Gamma: Aquaplan Topline golfplaat bitumen 200 x 86 cm', `${GM}/aquaplan-topline-golfplaat-bitumen-zwart-200-x-86-cm/p/B548870`),
    dir199974nl: L2('Richtlijn 1999/74/EG', 'Richtlijn 1999/74/EG van de Raad van 19 juli 1999 tot vaststelling van minimumnormen ter bescherming van legkippen (artikel 1 en artikel 4), Nederlandse tekst op EUR-Lex', 'https://eur-lex.europa.eu/legal-content/NL/TXT/?uri=CELEX:31999L0074'),
    rvoPluimvee: L2('RVO, pluimvee melden', 'Rijksdienst voor Ondernemend Nederland: Pluimvee melden (inhoud gecontroleerd op 15 november 2024)', 'https://www.rvo.nl/onderwerpen/identificatie-en-registratie-dieren/pluimvee-melden'),
    rvoUbn: L2('RVO, dierlocatie UBN', 'Rijksdienst voor Ondernemend Nederland: Dierlocatie (UBN) registreren en wijzigen (inhoud gecontroleerd op 30 april 2026)', 'https://www.rvo.nl/onderwerpen/identificatie-en-registratie-dieren/dierlocatie-ubn'),
    eggs2023nl: L2('Verordening (EU) 2023/2465', 'Gedelegeerde Verordening (EU) 2023/2465 van de Commissie van 17 augustus 2023 wat betreft handelsnormen voor eieren (bijlage II, eieren van hennen met vrije uitloop), Nederlandse tekst op EUR-Lex', 'https://eur-lex.europa.eu/legal-content/NL/TXT/?uri=CELEX:32023R2465'),
    // Germany: OBI's planed spruce/fir framing timber, OSB/3, aviary mesh, hexagonal netting and Onduline sheets; the
    // directive and the egg marketing standard in German, the livestock traffic ordinance and the avian influenza order
    obiRahmenholz: L2('OBI, Rahmenholz Fichte/Tanne', 'OBI: Rahmenholz Fichte/Tanne gehobelt, gefast, 44 x 44 und 54 x 54 mm in 2000 und 3000 mm, 45 x 70 mm in 2100 mm, 54 x 74 mm in 2000 und 2500 mm, 74 x 74 mm in 3000 mm (Suche: Rahmenholz gehobelt)', `${OD}/search/rahmenholz%20gehobelt/`),
    obiOsbDe: L2('OBI, OSB-3-Verlegeplatte', 'OBI: OSB-3-Verlegeplatte stumpf, 250 x 125 cm, 12 mm und 18 mm (Suche: OSB Platte)', `${OD}/search/osb%20platte/`),
    obiVoliere12: L2('OBI, Volierendraht 12,7 mm', 'OBI: Volierendraht verzinkt, 5 x 1 m, Maschenweite 12,7 x 12,7 mm, Drahtstärke 1 mm', `${OD}/p/4652327/volierengitter-maschenweite-12-7-mm-5-m-x-1-m-staerke-1-mm-verzinkt`),
    obiVoliere19: L2('OBI, Volierengitter 19 mm', 'OBI: Volierengitter verzinkt, 5 x 1 m, Maschenweite 19 x 19 mm, Drahtstärke 1 mm', `${OD}/p/9562083/volierengitter-maschenweite-19-mm-5-m-x-1-m-staerke-1-mm-verzinkt`),
    obiSechseck: L2('OBI, Sechseckgeflecht', 'OBI: 6-Eck-Geflecht verzinkt, 25 mm, Draht 0,8 mm, Höhe 1 m, Länge 25 m', `${OD}/p/9562281/6-eck-geflecht-verzinkt-25-mm-x-0-8-mm-hoehe-1-m-laenge-25-m`),
    obiOndulineDe: L2('OBI, Onduline Bitumenwellplatte', 'OBI: Onduline Base Bitumenwellplatte 2000 x 855 mm', `${OD}/p/5628250/onduline-base-bitumenwellplatte-schwarz-2-000-mm-x-855-mm`),
    dir199974de: L2('Richtlinie 1999/74/EG', 'Richtlinie 1999/74/EG des Rates vom 19. Juli 1999 zur Festlegung von Mindestanforderungen zum Schutz von Legehennen (Artikel 1 und 4), deutscher Text auf EUR-Lex', 'https://eur-lex.europa.eu/legal-content/DE/TXT/?uri=CELEX:31999L0074'),
    eggs2023de: L2('Verordnung (EU) 2023/2465', 'Delegierte Verordnung (EU) 2023/2465 der Kommission vom 17. August 2023 hinsichtlich der Vermarktungsnormen für Eier (Anhang II, Eier aus Freilandhaltung), deutscher Text auf EUR-Lex', 'https://eur-lex.europa.eu/legal-content/DE/TXT/?uri=CELEX:32023R2465'),
    viehverkv26: L2('ViehVerkV, § 26', 'Viehverkehrsverordnung (ViehVerkV), § 26 Anzeige und Registrierung, auf gesetze-im-internet.de', 'https://www.gesetze-im-internet.de/viehverkv_2007/__26.html'),
    geflpest13: L2('Geflügelpest-Verordnung, § 13', 'Geflügelpest-Verordnung (GeflPestSchV), § 13 Aufstallung, auf gesetze-im-internet.de', 'https://www.gesetze-im-internet.de/geflpestschv/__13.html'),
    rijkAfscherm: L2('Rijksoverheid, afschermplicht', 'Rijksoverheid: Welke maatregelen gelden voor mij als particuliere vogelhouder tijdens vogelgriep?', 'https://www.rijksoverheid.nl/onderwerpen/vogelgriep/vraag-en-antwoord/maatregelen-particuliere-vogelhouders'),
  };

  // the US meshes stay on offer in every edition, for the inch rolls of Quebec, Mexico or the US
  const US_MESH = MESH.filter(me => !['wm13-19', 'poultry25'].includes(me.id));
  const M2 = (id, t, w, source, o = {}) => Object.assign({ id, t, w, source }, o);
  const stock = list => list.map(mm => ({ mm }));
  const MARKETS = {
    // English: the tables above, unchanged (UK and Australian listings for the metric sizes)
    en: { units: 'imperial', lumber: LUMBER.metric, stock: STOCK.metric, stockDefault: STOCK.metric[0].mm, sheet: SHEET.metric, mesh: MESH, meshDefault: 'wm13-19',
      rollDefault: ROLL_DEFAULT.metric, panel: { w: 860, l: 2400, lap: 75 }, swap: SWAP, roost: { std: '45x45', cold: '38x89' }, extra: {} },
    // France: Brico Dépôt's chevrons (63 x 75 mm, 50 x 75 mm, the 38 x 63 mm demi-chevron) and Castorama's battens;
    // OSB 3 at 244 x 122 cm; welded and hexagonal mesh in 1 m rolls; a 9-wave corrugated sheet of 200 x 85,5 cm
    fr: { units: 'metric',
      // lengths per section as listed: demi-chevron 3 and 4 m, chevron 50 x 75 in 4 m, 63 x 75 in 2,4 to 5 m; battens 2,40 m
      lumber: [M2('fr-38x63', 38, 63, 'bdChevrons', { lengths: [3000, 4000] }), M2('fr-50x75', 50, 75, 'bdChevrons', { lengths: [4000] }), M2('fr-63x75', 63, 75, 'bdChevrons', { lengths: [2400, 3000, 4000, 5000] }),
        M2('fr-45x45', 45, 45, 'castoTasseaux', { lengths: [2400] }), M2('fr-44x44', 44, 44, 'castoTasseaux', { roostOnly: true, lengths: [2400] }), M2('fr-44x70', 44, 70, 'castoTasseaux', { roostOnly: true, lengths: [2400] })],
      stock: stock([2400, 3000, 4000, 5000]), stockDefault: 3000,
      sheet: { wall: { id: 'fr-osb12', w: 1220, l: 2440, t: 12, source: 'castoOsb' }, floor: { id: 'fr-osb18', w: 1220, l: 2440, t: 18, source: 'castoOsb' } },
      mesh: [
        { id: 'fr-soude13', kind: 'hardware', open: [13, 13], gauge: null, rolls: [[1000, 5000]], sources: ['bdSoude13'] },
        { id: 'fr-soude25', kind: 'welded', open: [25, 25], gauge: null, rolls: [[1000, 10000]], sources: ['bdSoude25'] },
        { id: 'fr-triple25', kind: 'poultry', open: [25, 25], gauge: null, rolls: [[1000, 10000]], sources: ['bdTriple25'] },
      ].concat(US_MESH),
      meshDefault: 'fr-soude13', rollDefault: [1000, 5000], panel: { w: 855, l: 2000, lap: 75 }, panelSource: 'bdOndulee',
      swap: { '2x2': 'fr-45x45', '2x3': 'fr-38x63', '2x4': 'fr-63x75', 'fr-45x45': '2x2', 'fr-38x63': '2x3', 'fr-50x75': '2x4', 'fr-63x75': '2x4', '45x45': 'fr-45x45', '38x63': 'fr-38x63', '38x89': 'fr-50x75', '45x90': 'fr-63x75' },
      roost: { std: 'fr-44x44', cold: 'fr-44x70' },
      extra: { 'coop-area': ['chambresFiche', 'dir199974'], 'run-area': ['chambresFiche'], nests: ['chambresFiche', 'dir199974'], 'roost-length': ['chambresFiche', 'dir199974'], 'roost-height': ['chambresFiche'], rules: ['agriBasseCour', 'spCerfa'] } },
    // Spain: Bricoking's fir battens (45 x 45, 70 x 45, 90 x 45 mm in 2,4 m) and Obramat's autoclave beams in 3 m;
    // OSB 3 WBP and WBP pine plywood; FENSANET welded mesh and GALVANEX hexagonal mesh; a 200 x 105 cm corrugated sheet
    es: { units: 'metric',
      // lengths per section as listed: Bricoking's fir battens in 2,4 m, Obramat's beams in 3 m
      lumber: [M2('es-45x45', 45, 45, 'bkListones', { lengths: [2400] }), M2('es-45x70', 45, 70, 'bkListones', { lengths: [2400] }), M2('es-45x90', 45, 90, 'bkListones', { also: ['obVigas'], lengths: [2400, 3000] }), M2('es-33x70', 33, 70, 'obVigas', { lengths: [3000] })],
      stock: stock([2400, 3000]), stockDefault: 2400,
      sheet: { wall: { id: 'es-osb10', w: 1250, l: 2500, t: 10, source: 'bkTableros' }, floor: { id: 'es-ply18', w: 1220, l: 2440, t: 18, source: 'bkTableros' } },
      mesh: [
        { id: 'es-12', kind: 'hardware', open: [12.7, 12.7], gauge: null, mm: 0.8, rolls: [[1000, 5000]], sources: ['bkMalla12'] },
        { id: 'es-06', kind: 'hardware', open: [6.4, 6.4], gauge: null, mm: 0.6, rolls: [[1000, 5000]], sources: ['bkMalla06'] },
        { id: 'es-19', kind: 'welded', open: [19, 19], gauge: null, mm: 1.4, rolls: [[1000, 5000]], sources: ['bkMalla19'] },
        { id: 'es-25', kind: 'welded', open: [25.4, 25.4], gauge: null, mm: 1.4, rolls: [[1000, 5000]], sources: ['bkMalla25'] },
        { id: 'es-hex19', kind: 'poultry', open: [19, 19], gauge: null, mm: 0.7, rolls: [[1000, 10000]], sources: ['bkHex19'] },
      ].concat(US_MESH),
      meshDefault: 'es-12', rollDefault: [1000, 5000], panel: { w: 1050, l: 2000, lap: 75 }, panelSource: 'bkIbiza',
      swap: { '2x2': 'es-45x45', '2x3': 'es-45x70', '2x4': 'es-45x90', 'es-45x45': '2x2', 'es-45x70': '2x3', 'es-45x90': '2x4', 'es-33x70': '2x3', '45x45': 'es-45x45', '38x63': 'es-45x70', '38x89': 'es-45x90', '45x90': 'es-45x90' },
      roost: { std: 'es-45x45', cold: 'es-45x90' },
      extra: { 'coop-area': ['rd3_2002'], nests: ['rd3_2002'], 'roost-length': ['rd3_2002'], 'roost-height': ['rd3_2002'], rules: ['rd637_2021'] } },
    // Italy: OBI's planed fir battens (45 x 45, 45 x 60, 45 x 95 mm in 2 m), sawn battens (50 x 50 in 2 m, and in
    // 2,5 m at Leroy Merlin; 50 x 70 in 2 m) and fir posts (70 x 70, 70 x 90 mm in 3 m); OSB/3 at 250 x 125 cm; 12,7 mm
    // welded mesh in 1 x 5 m rolls; Onduline sheets of 200 x 85 cm
    it: { units: 'metric',
      lumber: [M2('it-45x45', 45, 45, 'obiListelli', { lengths: [2000] }), M2('it-45x60', 45, 60, 'obiListelli', { lengths: [2000] }), M2('it-50x50', 50, 50, 'obiGrezzi', { also: ['lmItListelli'], lengths: [2000, 2500] }),
        M2('it-50x70', 50, 70, 'obiGrezzi', { lengths: [2000] }), M2('it-70x70', 70, 70, 'obiListelli', { lengths: [3000] }), M2('it-70x90', 70, 90, 'obiListelli', { lengths: [3000] }), M2('it-45x95', 45, 95, 'obiListelli', { roostOnly: true, lengths: [2000] })],
      stock: stock([2000, 2500, 3000]), stockDefault: 2500,
      sheet: { wall: { id: 'it-osb12', w: 1250, l: 2500, t: 12, source: 'obiOsb' }, floor: { id: 'it-osb18', w: 1250, l: 2500, t: 18, source: 'obiOsb' } },
      mesh: [
        { id: 'it-12', kind: 'hardware', open: [12.7, 12.7], gauge: null, mm: 0.9, rolls: [[1000, 5000]], sources: ['obiRabbit'] },
        { id: 'it-12p', kind: 'hardware', open: [12.7, 12.7], gauge: null, mm: 0.9, rolls: [[1000, 5000]], sources: ['obiBirdPlast'] },
      ].concat(US_MESH),
      meshDefault: 'it-12', rollDefault: [1000, 5000], panel: { w: 850, l: 2000, lap: 75 }, panelSource: 'obiOnduline',
      swap: { '2x2': 'it-45x45', '2x3': 'it-50x50', '2x4': 'it-70x90', 'it-45x45': '2x2', 'it-45x60': '2x3', 'it-50x50': '2x3', 'it-50x70': '2x3', 'it-70x70': '2x4', 'it-70x90': '2x4', '45x45': 'it-45x45', '38x63': 'it-50x50', '38x89': 'it-50x70', '45x90': 'it-70x90' },
      roost: { std: 'it-45x45', cold: 'it-45x95' },
      extra: { 'coop-area': ['dir199974it'], nests: ['dir199974it'], 'roost-length': ['dir199974it'], 'roost-height': ['dir199974it'], rules: ['aslSassariIR'] } },
    // Brazil: pine caibros (45 x 45 mm planed in 3 m; 45 x 90 mm treated in 2,9 and 1,5 m; 50 x 57 mm autoclave in 3 m)
    // and a 50 x 100 mm autoclave beam in 3 m; OSB at 2,44 x 1,22 m; Belgo's 15 mm welded mesh in 15 m rolls, and the
    // hexagonal aviary netting sold for coops (which the checks flag); Onduline sheets of 2,00 x 0,75 m. The small frames
    // start in the planed caibro, the one listed without a treatment, as the treated-wood row advises; the walk-in in the
    // treated 45 x 90 mm, the section nearest a 2x4
    pt: { units: 'metric',
      lumber: [M2('pt-45x45', 45, 45, 'mmCaibros', { lengths: [3000] }), M2('pt-50x57', 50, 57, 'tnCaibro', { lengths: [3000] }),
        M2('pt-45x90', 45, 90, 'mmCaibros', { lengths: [1500, 2900] }), M2('pt-50x100', 50, 100, 'mmCaibros', { lengths: [3000] })],
      stock: stock([1500, 2900, 3000]), stockDefault: 3000,
      sheet: { wall: { id: 'pt-osb12', w: 1220, l: 2440, t: 12, source: 'mmOsb' }, floor: { id: 'pt-osb18', w: 1220, l: 2440, t: 18, source: 'mmOsb' } },
      mesh: [
        { id: 'pt-15', kind: 'welded', open: [15, 15], gauge: null, mm: 1.65, rolls: [[1000, 15000]], sources: ['belgoSerralheiro'] },
        { id: 'pt-hex12', kind: 'poultry', open: [12.7, 12.7], gauge: null, rolls: [[800, 50000]], sources: ['mmViveiro'] },
      ].concat(US_MESH),
      meshDefault: 'pt-15', rollDefault: [1000, 15000], panel: { w: 750, l: 2000, lap: 75 }, panelSource: 'mmOnduline',
      swap: { '2x2': 'pt-45x45', '2x3': 'pt-45x45', '2x4': 'pt-45x90', 'pt-45x45': '2x2', 'pt-50x57': '2x3', 'pt-45x90': '2x4', 'pt-50x100': '2x4', '45x45': 'pt-45x45', '38x63': 'pt-45x45', '38x89': 'pt-45x90', '45x90': 'pt-45x90' },
      roost: { std: 'pt-45x45', cold: 'pt-45x90' },
      extra: { 'coop-area': ['embrapaAviario'], 'run-area': ['embrapaAviario'], nests: ['embrapaAviario'], 'nest-size': ['embrapaAviario'], 'roost-length': ['embrapaAviario'], 'roost-height': ['embrapaAviario'], 'roost-bar': ['embrapaAviario'], rules: ['mapaIN56', 'embrapaOvos'] } },
    // the Netherlands: Gamma's planed spruce (44 x 44 mm in 2,1, 3,3 and 3,9 m; 44 x 69 mm in 2,1 and 2,7 m; 44 x 94 mm in
    // 2,1 and 3 m; SLS 38 x 89 mm in 2,1 m); OSB3 at 244 x 122 cm (11 mm at Gamma, 18 mm at Praxis); Praxis's welded
    // galvanized mesh (12,7 mm in 101 cm x 25 m, 19 and 25,4 mm in 5 m); Gamma's bitumen sheets of 200 x 86 cm
    nl: { units: 'metric',
      lumber: [M2('nl-44x44', 44, 44, 'gammaGeschaafd', { also: ['gamma4444'], lengths: [2100, 3300, 3900] }), M2('nl-44x69', 44, 69, 'gamma4469', { lengths: [2100, 2700] }),
        M2('nl-44x94', 44, 94, 'gammaGeschaafd', { also: ['gamma4444'], lengths: [2100, 3000] }), M2('nl-38x89', 38, 89, 'gammaGeschaafd', { lengths: [2100] })],
      stock: stock([2100, 2700, 3000, 3300, 3900]), stockDefault: 2700,
      sheet: { wall: { id: 'nl-osb11', w: 1220, l: 2440, t: 11, source: 'gammaOsb' }, floor: { id: 'nl-osb18', w: 1220, l: 2440, t: 18, source: 'praxisOsb' } },
      mesh: [
        { id: 'nl-12', kind: 'hardware', open: [12.7, 12.7], gauge: null, mm: 0.8, rolls: [[1010, 25000]], sources: ['praxisGaas12'] },
        { id: 'nl-19', kind: 'welded', open: [19, 19], gauge: null, mm: 1.45, rolls: [[1010, 5000]], sources: ['praxisGaas19'] },
        { id: 'nl-25', kind: 'welded', open: [25.4, 25.4], gauge: null, mm: 1.75, rolls: [[1020, 5000]], sources: ['praxisGaas25'] },
      ].concat(US_MESH),
      meshDefault: 'nl-12', rollDefault: [1010, 25000], panel: { w: 860, l: 2000, lap: 75 }, panelSource: 'gammaGolfplaat',
      swap: { '2x2': 'nl-44x44', '2x3': 'nl-44x69', '2x4': 'nl-44x94', 'nl-44x44': '2x2', 'nl-44x69': '2x3', 'nl-44x94': '2x4', 'nl-38x89': '2x4', '45x45': 'nl-44x44', '38x63': 'nl-44x69', '38x89': 'nl-38x89', '45x90': 'nl-44x94' },
      roost: { std: 'nl-44x44', cold: 'nl-44x69' },
      extra: { 'coop-area': ['dir199974nl'], 'run-area': ['eggs2023nl'], nests: ['dir199974nl'], 'roost-length': ['dir199974nl'], 'roost-height': ['dir199974nl'], 'run-top': ['rijkAfscherm'], rules: ['rvoPluimvee', 'rvoUbn', 'rijkAfscherm'] } },
    // Germany: OBI's planed, chamfered spruce/fir framing timber (44 x 44 and 54 x 54 mm in 2 and 3 m, 45 x 70 mm in 2,1 m,
    // 54 x 74 mm in 2 and 2,5 m, 74 x 74 mm in 3 m for the walk-in); OSB/3 at 250 x 125 cm; aviary mesh of 12,7 and 19 mm in 1 x 5 m, hexagonal netting in
    // 1 x 25 m (which the checks flag); Onduline sheets of 200 x 85,5 cm
    de: { units: 'metric',
      lumber: [M2('de-44x44', 44, 44, 'obiRahmenholz', { lengths: [2000, 3000] }), M2('de-45x70', 45, 70, 'obiRahmenholz', { lengths: [2100] }),
        M2('de-54x54', 54, 54, 'obiRahmenholz', { lengths: [2000, 3000] }), M2('de-54x74', 54, 74, 'obiRahmenholz', { lengths: [2000, 2500] }), M2('de-74x74', 74, 74, 'obiRahmenholz', { lengths: [3000] })],
      stock: stock([2000, 2100, 2500, 3000]), stockDefault: 3000,
      sheet: { wall: { id: 'de-osb12', w: 1250, l: 2500, t: 12, source: 'obiOsbDe' }, floor: { id: 'de-osb18', w: 1250, l: 2500, t: 18, source: 'obiOsbDe' } },
      mesh: [
        { id: 'de-12', kind: 'hardware', open: [12.7, 12.7], gauge: null, mm: 1, rolls: [[1000, 5000]], sources: ['obiVoliere12'] },
        { id: 'de-19', kind: 'welded', open: [19, 19], gauge: null, mm: 1, rolls: [[1000, 5000]], sources: ['obiVoliere19'] },
        { id: 'de-hex25', kind: 'poultry', open: [25, 25], gauge: null, mm: 0.8, rolls: [[1000, 25000]], sources: ['obiSechseck'] },
      ].concat(US_MESH),
      meshDefault: 'de-12', rollDefault: [1000, 5000], panel: { w: 855, l: 2000, lap: 75 }, panelSource: 'obiOndulineDe',
      swap: { '2x2': 'de-44x44', '2x3': 'de-54x54', '2x4': 'de-74x74', 'de-44x44': '2x2', 'de-45x70': '2x3', 'de-54x54': '2x3', 'de-54x74': '2x4', 'de-74x74': '2x4', '45x45': 'de-44x44', '38x63': 'de-54x54', '38x89': 'de-54x74', '45x90': 'de-74x74' },
      roost: { std: 'de-44x44', cold: 'de-45x70' },
      extra: { 'coop-area': ['dir199974de'], 'run-area': ['eggs2023de'], nests: ['dir199974de'], 'roost-length': ['dir199974de'], 'roost-height': ['dir199974de'], 'run-top': ['geflpest13'], rules: ['viehverkv26', 'geflpest13'] } },
  };

  return { CHECKED, LOCAL_CHECKED, LOCAL_CHECKED_2, IN, FT, SQFT, SOURCES, LOCAL_SOURCES, LUMBER, STOCK, SWAP, SHEET, MESH, ROLL_DEFAULT, RULES, MARKETS };
});
