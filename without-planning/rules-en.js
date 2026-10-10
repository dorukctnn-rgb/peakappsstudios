/* Without Planning: the rules for England, one versioned file. Every condition the tool applies is here with its legal
 * citation, the official source and the date it was last read. The tool, the guides and the PDF print RULES_AS_OF.
 *
 * Read on 10 October 2026 from the official texts on legislation.gov.uk (revised versions, Part 1 current from
 * 9 April 2026) and GOV.UK:
 *  - The Town and Country Planning (General Permitted Development) (England) Order 2015 (S.I. 2015/596), articles 2
 *    and 3, Schedule 1 Part 1 (article 2(3) land), Schedule 2 Part 1 Classes A and E, and Part 14 Class G as amended
 *    by S.I. 2025/560 (in force 29 May 2025). The pending S.I. 2026/1056 changes Part 2, 4, 15 and 20 only.
 *  - MHCLG, Permitted development rights for householders: technical guidance (September 2019 edition, the current
 *    one on GOV.UK), for how heights, depths and "original" are measured.
 *  - MCS 020 a) Issue 1.1 (14 April 2025), the sound calculation Class G requires.
 *  - The Town and Country Planning (Fees for Applications, Deemed Applications, Requests and Site Visits) (England)
 *    Regulations 2012, regulations 11, 14 and 18A and Schedule 1, with the amounts in force from 1 April 2026 as
 *    published in council fee schedules (Fylde, North Yorkshire).
 *  - The Town and Country Planning (Development Management Procedure) (England) Order 2015, article 39.
 *  - The Building Regulations 2010, Schedule 2, Classes 6 and 7.
 * Crown copyright material is re-used under the Open Government Licence v3.0.
 *
 * Pure data, no DOM: window.WPRules.en in the browser, module.exports in Node. Change a value only after reading the
 * official text again; bump RULES_VERSION and CHECKED, then run the tests and node src/without-planning/_build/pages.mjs. */
(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory();
  else (root.WPRules = root.WPRules || {}).en = factory();
})(typeof self !== 'undefined' ? self : this, function () {
  'use strict';

  const RULES_VERSION = 'en-2026-10-10.1';
  const CHECKED = '2026-10-10';
  const RULES_AS_OF = '10 October 2026';

  const GPDO = 'https://www.legislation.gov.uk/uksi/2015/596';
  const SOURCES = {
    gpdoP1: { label: 'The Town and Country Planning (General Permitted Development) (England) Order 2015, Schedule 2, Part 1 (latest available revised version)', short: 'GPDO 2015, Sch. 2 Pt. 1', url: GPDO + '/schedule/2/part/1', checked: CHECKED },
    gpdoP14: { label: 'The Town and Country Planning (General Permitted Development) (England) Order 2015, Schedule 2, Part 14', short: 'GPDO 2015, Sch. 2 Pt. 14', url: GPDO + '/schedule/2/part/14', checked: CHECKED },
    gpdoArt3: { label: 'GPDO 2015, article 3 (permitted development)', short: 'GPDO 2015, art. 3', url: GPDO + '/article/3', checked: CHECKED },
    gpdoArt4: { label: 'GPDO 2015, article 4 (directions restricting permitted development)', short: 'GPDO 2015, art. 4', url: GPDO + '/article/4', checked: CHECKED },
    gpdoArt2: { label: 'GPDO 2015, article 2 (interpretation: “dwellinghouse”, “original”)', short: 'GPDO 2015, art. 2', url: GPDO + '/article/2', checked: CHECKED },
    gpdoSch1: { label: 'GPDO 2015, Schedule 1, Part 1 (article 2(3) land)', short: 'GPDO 2015, Sch. 1 Pt. 1', url: GPDO + '/schedule/1', checked: CHECKED },
    si2025_560: { label: 'The Town and Country Planning (General Permitted Development) (England) (Amendment) Order 2025 (S.I. 2025/560), article 5, in force 29 May 2025', short: 'S.I. 2025/560', url: 'https://www.legislation.gov.uk/uksi/2025/560/made', checked: CHECKED },
    techGuide: { label: 'MHCLG, Permitted development rights for householders: technical guidance (September 2019)', short: 'Technical guidance', url: 'https://www.gov.uk/government/publications/permitted-development-rights-for-householders-technical-guidance', checked: CHECKED },
    mcs020a: { label: 'MCS 020 a) Air Source Heat Pump Sound Calculation (For Permitted Development Installations), Issue 1.1, 14 April 2025', short: 'MCS 020 a)', url: 'https://mcscertified.com/wp-content/uploads/2025/04/MCS-020-a-Issue-1.1-Final.pdf', checked: CHECKED },
    fees11: { label: 'Planning fees regulations 2012 (S.I. 2012/2920), regulation 11(3)(c): a proposed-use certificate costs half the planning application fee', short: 'Fees Regulations 2012, reg. 11', url: 'https://www.legislation.gov.uk/uksi/2012/2920/regulation/11', checked: CHECKED },
    fees14: { label: 'Planning fees regulations 2012, regulation 14(1)(zab): the larger home extension prior approval fee', short: 'Fees Regulations 2012, reg. 14', url: 'https://www.legislation.gov.uk/uksi/2012/2920/regulation/14', checked: CHECKED },
    fees18A: { label: 'Planning fees regulations 2012, regulation 18A: fees rise each 1 April with the consumer prices index (at most 10%)', short: 'Fees Regulations 2012, reg. 18A', url: 'https://www.legislation.gov.uk/uksi/2012/2920/regulation/18A', checked: CHECKED },
    fees2026: { label: 'Fylde Council, Planning application fees in England from 1 April 2026 (householder £548, larger home extension prior approval £249, proposed-use certificate half the normal fee)', short: 'Fee schedule from 1 April 2026', url: 'https://new.fylde.gov.uk/wp-content/uploads/2026/03/PLANNING-APPLICATION-FEES-SCHEDULE-1-APRIL-2026.pdf', checked: CHECKED },
    dmpo39: { label: 'The Town and Country Planning (Development Management Procedure) (England) Order 2015, article 39', short: 'DMPO 2015, art. 39', url: 'https://www.legislation.gov.uk/uksi/2015/595/article/39', checked: CHECKED },
    ldcGuide: { label: 'GOV.UK, Lawful development certificates (Planning Practice Guidance)', short: 'PPG, Lawful development certificates', url: 'https://www.gov.uk/guidance/lawful-development-certificates', checked: CHECKED },
    br2010: { label: 'The Building Regulations 2010 (S.I. 2010/2214), Schedule 2, Classes 6 and 7', short: 'Building Regulations 2010, Sch. 2', url: 'https://www.legislation.gov.uk/uksi/2010/2214/schedule/2', checked: CHECKED },
    ogl: { label: 'Open Government Licence v3.0', short: 'OGL v3.0', url: 'https://www.nationalarchives.gov.uk/doc/open-government-licence/version/3/', checked: CHECKED },
  };

  // Where people look things up. The tool never claims to have checked any of them.
  const MAPS = [
    { id: 'council', label: 'Find your local council (GOV.UK)', url: 'https://www.gov.uk/find-local-council' },
    { id: 'planningData', label: 'Planning Data map (MHCLG): conservation areas, Article 4 direction areas, listed buildings, World Heritage Sites', url: 'https://www.planning.data.gov.uk/map/' },
    { id: 'listed', label: 'Historic England, Search the List (listed buildings, scheduled monuments)', url: 'https://historicengland.org.uk/listing/the-list/' },
    { id: 'magic', label: 'Defra’s Multi-Agency Geographic Information for the Countryside map: National Parks, National Landscapes (AONBs), SSSIs', url: 'https://magic.defra.gov.uk/MagicMap.html' },
  ];

  // ---------- Limits, exactly as the Order sets them ----------
  const LIMITS = {
    a: { depthDetached: 4, depthOther: 3, largerDetached: 8, largerOther: 6, singleHeight: 4, twoStoreyDepth: 3, rearBoundary: 7, nearBoundary: 2, nearBoundaryEaves: 3, sideHeight: 4, sideWidthShare: 0.5, coverage: 0.5, raised: 0.3, neighbourDays: 21, decisionDays: 42 },
    e: { nearBoundary: 2, nearBoundaryHeight: 2.5, dualPitched: 4, other: 3, eaves: 2.5, coverage: 0.5, raised: 0.3, farDistance: 20, farArea: 10 },
    g: { volumeHouse: 1.5, volumeFlats: 0.6, unitsDetached: 2, unitsOther: 1, flatRoofEdge: 1, noise: 37 },
    fees: { householder: 548, ldcProposed: 274, priorApproval: 249, from: '2026-04-01' },
    ldc: { weeks: 8 },
  };

  const P1 = 'GPDO 2015, Schedule 2, Part 1';
  const P14 = 'GPDO 2015, Schedule 2, Part 14';
  const C = (id, cls, ref, text, source, extra) => Object.assign({ id, cls, ref, text, source, checked: CHECKED }, extra || {});
  const CONDITIONS = [
    // Class A: enlargement, improvement or other alteration of a dwellinghouse
    C('en.a.use', 'Class A', `${P1}, Class A, paragraphs A.1(a) and A.1(l)`, 'Not available where the house exists only through a change-of-use right in Part 3 (Classes G, M, MA, N, P, PA or Q) or was built under Part 20.', 'gpdoP1'),
    C('en.a.coverage', 'Class A', `${P1}, Class A, paragraph A.1(b)`, 'Buildings in the curtilage, other than the original house, must not cover more than half of the curtilage (excluding the original house’s footprint).', 'gpdoP1'),
    C('en.a.height', 'Class A', `${P1}, Class A, paragraph A.1(c)`, 'No higher than the highest part of the roof of the existing house.', 'gpdoP1'),
    C('en.a.eaves', 'Class A', `${P1}, Class A, paragraph A.1(d)`, 'Eaves no higher than the eaves of the existing house.', 'gpdoP1'),
    C('en.a.front', 'Class A', `${P1}, Class A, paragraph A.1(e)`, 'Must not extend beyond the principal elevation, or beyond a side elevation that fronts a highway.', 'gpdoP1'),
    C('en.a.depth1', 'Class A', `${P1}, Class A, paragraphs A.1(f) and A.1(g)`, 'A single-storey extension may extend up to 4 m beyond the rear wall of a detached house, or 3 m for any other house. Up to 8 m and 6 m with the larger home extension prior approval, except on article 2(3) land or an SSSI.', 'gpdoP1'),
    C('en.a.height1', 'Class A', `${P1}, Class A, paragraphs A.1(f)(ii) and A.1(g)(ii)`, 'A single-storey extension must not exceed 4 m in height.', 'gpdoP1'),
    C('en.a.depth2', 'Class A', `${P1}, Class A, paragraph A.1(h)(i)`, 'An extension of more than one storey may extend no more than 3 m beyond the rear wall.', 'gpdoP1'),
    C('en.a.rear7', 'Class A', `${P1}, Class A, paragraph A.1(h)(ii)`, 'An extension of more than one storey must not be within 7 m of the boundary opposite the rear wall.', 'gpdoP1'),
    C('en.a.eaves2m', 'Class A', `${P1}, Class A, paragraph A.1(i)`, 'Within 2 m of a boundary of the curtilage, eaves must not exceed 3 m.', 'gpdoP1'),
    C('en.a.side', 'Class A', `${P1}, Class A, paragraph A.1(j)`, 'Beyond a side wall: no more than 4 m high, a single storey, and no wider than half the width of the original house.', 'gpdoP1'),
    C('en.a.total', 'Class A', `${P1}, Class A, paragraph A.1(ja)`, 'Joined to an earlier extension, the total enlargement must stay within the limits in (e) to (j).', 'gpdoP1'),
    C('en.a.extras', 'Class A', `${P1}, Class A, paragraph A.1(k)`, 'No verandah, balcony or raised platform (over 0.3 m high), no microwave antenna, chimney, flue or soil and vent pipe, and no change to the roof of the house.', 'gpdoP1'),
    C('en.a.art23', 'Class A', `${P1}, Class A, paragraph A.2`, 'On article 2(3) land (conservation area, National Park, National Landscape, the Broads, World Heritage Site): no cladding in stone, artificial stone, pebble dash, render, timber, plastic or tiles; nothing beyond a side wall; no rear extension of more than one storey.', 'gpdoP1'),
    C('en.a.materials', 'Class A', `${P1}, Class A, paragraph A.3(a)`, 'Exterior materials of a similar appearance to the house (a conservatory is exempt from this).', 'gpdoP1'),
    C('en.a.sideWindows', 'Class A', `${P1}, Class A, paragraph A.3(b)`, 'Upper-floor windows in a side wall or roof slope must be obscure-glazed and non-opening below 1.7 m above the floor.', 'gpdoP1'),
    C('en.a.pitch', 'Class A', `${P1}, Class A, paragraph A.3(c)`, 'An extension of more than one storey must have the same roof pitch as the original house, so far as practicable.', 'gpdoP1'),
    C('en.a.prior', 'Class A', `${P1}, Class A, paragraph A.4`, 'The larger single-storey extension needs prior approval: tell the council first, neighbours get at least 21 days to object, and you may start only after a decision or 42 days without one.', 'gpdoP1'),
    // Class E: buildings etc incidental to the enjoyment of a dwellinghouse
    C('en.e.use', 'Class E', `${P1}, Class E, paragraphs E.1(a) and E.1(k)`, 'Not available where the house exists only through a change-of-use right in Part 3 or was built under Part 20.', 'gpdoP1'),
    C('en.e.incidental', 'Class E', `${P1}, Class E, paragraphs E(a) and E.1(i)`, 'Only for a purpose incidental to the enjoyment of the house. Separate self-contained accommodation, or a bedroom, bathroom or kitchen used as primary living space, is not covered.', 'gpdoP1'),
    C('en.e.coverage', 'Class E', `${P1}, Class E, paragraph E.1(b)`, 'Buildings, enclosures and containers, other than the original house, must not cover more than half of the curtilage (excluding the original house’s footprint).', 'gpdoP1'),
    C('en.e.front', 'Class E', `${P1}, Class E, paragraph E.1(c)`, 'No part may be forward of a wall forming the principal elevation of the original house.', 'gpdoP1'),
    C('en.e.storeys', 'Class E', `${P1}, Class E, paragraph E.1(d)`, 'A single storey only.', 'gpdoP1'),
    C('en.e.height', 'Class E', `${P1}, Class E, paragraph E.1(e)`, 'Within 2 m of a boundary: no more than 2.5 m high. Elsewhere: 4 m with a dual-pitched roof (hipped counts, per the technical guidance), 3 m for any other roof.', 'gpdoP1'),
    C('en.e.eaves', 'Class E', `${P1}, Class E, paragraph E.1(f)`, 'Eaves no higher than 2.5 m.', 'gpdoP1'),
    C('en.e.listed', 'Class E', `${P1}, Class E, paragraph E.1(g)`, 'Not within the curtilage of a listed building.', 'gpdoP1'),
    C('en.e.platform', 'Class E', `${P1}, Class E, paragraph E.1(h)`, 'No verandah, balcony or raised platform (over 0.3 m high).', 'gpdoP1'),
    C('en.e.far', 'Class E', `${P1}, Class E, paragraph E.2`, 'In a National Park, National Landscape (AONB), the Broads or a World Heritage Site: no more than 10 m² of buildings more than 20 m from any wall of the house.', 'gpdoP1'),
    C('en.e.side', 'Class E', `${P1}, Class E, paragraph E.3`, 'On article 2(3) land: nothing between a side wall of the house and the boundary.', 'gpdoP1'),
    // Part 14 Class G: air source heat pumps, as amended by S.I. 2025/560
    C('en.g.mcs', 'Class G', `${P14}, Class G, paragraph G.1`, 'The heat pump must comply with MCS 020 a): the sound level at the assessment position (1 m outside a neighbour’s habitable-room door or window) must be 37.0 dB(A) or less.', 'gpdoP14'),
    C('en.g.count', 'Class G', `${P14}, Class G, paragraph G.2(a)`, 'No more than one air source heat pump at a house that is not detached, or two at a detached house.', 'gpdoP14'),
    C('en.g.wind', 'Class G', `${P14}, Class G, paragraphs G.2(b) and G.2(c)`, 'Not where a wind turbine is installed on the building or within the curtilage.', 'gpdoP14'),
    C('en.g.volume', 'Class G', `${P14}, Class G, paragraph G.2(d)`, 'The outdoor compressor unit, with any housing, must not exceed 1.5 m³ at a house (0.6 m³ at a block of flats).', 'gpdoP14'),
    C('en.g.roof', 'Class G', `${P14}, Class G, paragraphs G.2(f) and G.2(g)`, 'Not on a pitched roof; on a flat roof, not within 1 m of the roof’s external edge.', 'gpdoP14'),
    C('en.g.monument', 'Class G', `${P14}, Class G, paragraph G.2(h)`, 'Not on a site designated as a scheduled monument.', 'gpdoP14'),
    C('en.g.listed', 'Class G', `${P14}, Class G, paragraph G.2(i)`, 'Not on a listed building or within its curtilage.', 'gpdoP14'),
    C('en.g.conservation', 'Class G', `${P14}, Class G, paragraph G.2(j)`, 'In a conservation area or World Heritage Site: not on a wall or roof that fronts a highway, and not nearer to a highway bounding the curtilage than the nearest part of the house.', 'gpdoP14'),
    C('en.g.wall', 'Class G', `${P14}, Class G, paragraph G.2(k)`, 'Elsewhere: not on a wall that fronts a highway above the level of the ground floor storey.', 'gpdoP14'),
    C('en.g.cooling', 'Class G', `${P14}, Class G, paragraph G.3(aa)`, 'The heat pump must not be used solely for cooling. Since 29 May 2025 it no longer has to be used solely for heating, and the 1 m boundary limit has gone.', 'si2025_560'),
    C('en.g.siting', 'Class G', `${P14}, Class G, paragraphs G.3(b) to (d)`, 'Sited, so far as practicable, to minimise its effect on the appearance of the building and the amenity of the area, and removed when no longer needed.', 'gpdoP14', { obligation: true }),
    // Before any class: the Order itself
    C('en.o.flat', 'Article 2', 'GPDO 2015, article 2(1), definition of “dwellinghouse”', 'Part 1 rights belong to houses. A flat, or a building containing flats, is not a “dwellinghouse”.', 'gpdoArt2'),
    C('en.o.condition', 'Article 3', 'GPDO 2015, article 3(4)', 'Nothing in the Order permits development contrary to a condition of a planning permission, such as one removing permitted development rights.', 'gpdoArt3'),
    C('en.o.unlawful', 'Article 3', 'GPDO 2015, article 3(5)', 'The rights do not apply where the existing building was built unlawfully, or its use is unlawful.', 'gpdoArt3'),
    C('en.o.article4', 'Article 4', 'GPDO 2015, article 4', 'A council can remove permitted development rights in an area with an Article 4 direction.', 'gpdoArt4'),
  ];
  const BY_ID = Object.fromEntries(CONDITIONS.map(c => [c.id, c]));

  // ---------- Building regulations, kept apart from planning ----------
  const BUILDING = [
    { id: 'en.br.ext', text: 'An extension needs building regulations approval even when it is permitted development. A ground-level conservatory, porch, covered way or carport of up to 30 m² is exempt (Class 7), provided its glazing meets Part K.', source: 'br2010' },
    { id: 'en.br.out15', text: 'A detached single-storey building of up to 15 m² with no sleeping accommodation is exempt from the building regulations (Class 6, paragraph 3).', source: 'br2010' },
    { id: 'en.br.out30', text: 'Up to 30 m² it is also exempt if it has no sleeping accommodation and is at least 1 m from every boundary or built substantially of non-combustible material (Class 6, paragraph 1).', source: 'br2010' },
    { id: 'en.br.sleep', text: 'A garden room with sleeping accommodation is not exempt, whatever its size.', source: 'br2010' },
    { id: 'en.br.other', text: 'Permitted development does not remove the need for other consents, such as building regulations approval and the Party Wall etc. Act 1996.', source: 'techGuide' },
  ];

  // ---------- Lawful development certificate (the formal route) ----------
  const LDC = {
    what: { text: 'A lawful development certificate for a proposed use or development (section 192 of the Town and Country Planning Act 1990) confirms that the works would be lawful.', ref: 'Town and Country Planning Act 1990, section 192', source: 'ldcGuide' },
    fee: { text: 'The fee is half the fee for a planning application for the same works (regulation 11(3)(c)). From 1 April 2026 the householder application fee is £548, so a certificate for householder works is £274.', ref: 'Fees Regulations 2012, regulations 11(3)(c) and 18A; Schedule 1', source: 'fees2026' },
    docs: { text: 'Apply on the published form with a plan of the land to an identified scale showing North, the evidence you have, and a statement of your interest in the land.', ref: 'DMPO 2015, article 39(1) and (2)', source: 'dmpo39' },
    time: { text: 'The council must decide within 8 weeks of a valid application, unless you agree a longer period in writing.', ref: 'DMPO 2015, article 39(10)', source: 'dmpo39' },
    prior: { text: 'The larger home extension prior approval fee is £249 from 1 April 2026.', ref: 'Fees Regulations 2012, regulations 14(1)(zab) and 18A', source: 'fees2026' },
  };

  const MONTHS = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];
  return { RULES_VERSION, CHECKED, RULES_AS_OF, SOURCES, MAPS, LIMITS, CONDITIONS, BY_ID, BUILDING, LDC, MONTHS, jurisdiction: 'en', name: 'England' };
});
