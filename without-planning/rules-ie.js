/* Without Planning: the Irish rules, one versioned file. Every condition the tool applies is here with its legal
 * citation, the official source and the date it was last read. The tool, the guides and the PDF print RULES_AS_OF.
 *
 * Read on 10 October 2026 from the official texts:
 *  - Planning and Development Regulations 2001 (S.I. No. 600 of 2001), Schedule 2, Part 1, as amended by the seven
 *    Planning and Development (Exempted Development (Act of 2000)) Regulations 2026 (S.I. Nos. 338 to 344 of 2026,
 *    signed 16 July 2026, in operation 27 July 2026), Irish Statute Book, and the Department's unofficial
 *    consolidation of the Regulations 2001-2026 (September 2026) for articles 5, 6 and 9 and Schedule 10.
 *  - Circular PLR 02/2026 (17 July 2026), Appendix I, the suggested notification template for Classes 1A and 3A.
 *  - Planning and Development Act 2000, section 5 (Law Reform Commission revised Act).
 *  - Building Control Regulations 1997, articles 7 and 9, as amended by S.I. No. 359 of 2026 (in operation 27 July 2026).
 * Irish Statute Book material is re-used under the Oireachtas (Open Data) PSI Licence, which incorporates CC BY 4.0.
 *
 * Pure data, no DOM: window.WPRules.ie in the browser, module.exports in Node. Change a value only after reading the
 * official text again; bump RULES_VERSION and CHECKED, then run the tests and node src/without-planning/_build/pages.mjs. */
(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory();
  else (root.WPRules = root.WPRules || {}).ie = factory();
})(typeof self !== 'undefined' ? self : this, function () {
  'use strict';

  const RULES_VERSION = 'ie-2026-10-10.1';
  const CHECKED = '2026-10-10';
  const RULES_AS_OF = '10 October 2026';

  const ISB = n => `https://www.irishstatutebook.ie/eli/2026/si/${n}/made/en/print`;
  const SOURCES = {
    si338: { label: 'S.I. No. 338 of 2026, Planning and Development (Exempted Development (Act of 2000)) Regulations 2026 (Classes 1 and 3)', short: 'S.I. 338/2026', url: ISB(338), checked: CHECKED },
    si339: { label: 'S.I. No. 339 of 2026, the (No. 2) Regulations 2026 (Class 1A, subdivision)', short: 'S.I. 339/2026', url: ISB(339), checked: CHECKED },
    si340: { label: 'S.I. No. 340 of 2026, the (No. 3) Regulations 2026 (Class 3A, detached house in the rear garden)', short: 'S.I. 340/2026', url: ISB(340), checked: CHECKED },
    si341: { label: 'S.I. No. 341 of 2026, the (No. 4) Regulations 2026 (Classes 62 and 63, bike and bin storage, external wall insulation)', short: 'S.I. 341/2026', url: ISB(341), checked: CHECKED },
    si342: { label: 'S.I. No. 342 of 2026, the (No. 5) Regulations 2026 (Class 2(d), heat pumps)', short: 'S.I. 342/2026', url: ISB(342), checked: CHECKED },
    si343: { label: 'S.I. No. 343 of 2026, the (No. 6) Regulations 2026 (Class 2A, chimney removal)', short: 'S.I. 343/2026', url: ISB(343), checked: CHECKED },
    si344: { label: 'S.I. No. 344 of 2026, the (No. 7) Regulations 2026 (Classes 1B and 1C, dormers and front roof lights)', short: 'S.I. 344/2026', url: ISB(344), checked: CHECKED },
    regs2001: { label: 'Planning and Development Regulations 2001 to 2026, unofficial consolidation by the Department of Housing, Local Government and Heritage (September 2026)', short: 'Regulations 2001, consolidated', url: 'https://assets.gov.ie/static/documents/1b7d7a36/Planning_and_Development_Regulations_2001-2026_Consolidation_Sept2026.pdf', checked: CHECKED },
    plr02: { label: 'Circular Letter PLR 02/2026, 17 July 2026, with Appendix I (suggested notification template)', short: 'Circular PLR 02/2026', url: 'https://www.sdcc.ie/en/services/planning-building-control/exempted-development/new-exemptions-27-07-26/circular-plr-02.pdf', checked: CHECKED },
    act2000s5: { label: 'Planning and Development Act 2000, section 5 (revised by the Law Reform Commission)', short: 'Act of 2000, s.5', url: 'https://revisedacts.lawreform.ie/eli/2000/act/30/section/5/revised/en/html', checked: CHECKED },
    act2000s57: { label: 'Planning and Development Act 2000, section 57 (revised by the Law Reform Commission)', short: 'Act of 2000, s.57', url: 'https://revisedacts.lawreform.ie/eli/2000/act/30/section/57/revised/en/html', checked: CHECKED },
    bcr: { label: 'Building Control Regulations 1997, articles 7(2) and 9(2), as amended by S.I. No. 359 of 2026', short: 'Building Control Regulations 1997, art. 7 and 9', url: 'https://revisedacts.lawreform.ie/eli/1997/si/496/section/7/revised/en/html', checked: CHECKED },
    si359: { label: 'S.I. No. 359 of 2026, Building Control (Amendment) Regulations 2026', short: 'S.I. 359/2026', url: ISB(359), checked: CHECKED },
    sdccBc: { label: 'South Dublin County Council, Detached Auxiliary Dwellings and Subdivision of a Dwelling (building control)', short: 'SDCC building control note', url: 'https://sdcc.ie/en/services/planning-building-control/building-control/detached-auxiliary-dwellings-and-subdivision-of-a-dwelling/', checked: CHECKED },
    licence: { label: 'Irish Statute Book, Oireachtas (Open Data) PSI Licence, incorporating CC BY 4.0', short: 'Irish Statute Book licence', url: 'https://www.irishstatutebook.ie/eli/open-data.html', checked: CHECKED },
    kilkennyS5: { label: 'Kilkenny County Council, Exempted development: what a section 5 request must include (an example of a council’s requirements)', short: 'Kilkenny County Council, section 5', url: 'https://kilkennycoco.ie/eng/services/planning/planning-applications/exempted-development/', checked: CHECKED },
  };

  // Where people look things up. The tool never claims to have checked any of them.
  const MAPS = [
    { id: 'council', label: 'Find your council (Local Government Ireland)', url: 'https://www.localgov.ie/' },
    { id: 'niah', label: 'National Inventory of Architectural Heritage (the council’s Record of Protected Structures is in its development plan)', url: 'https://www.buildingsofireland.ie/' },
    { id: 'npws', label: 'NPWS maps of SACs, SPAs and Natural Heritage Areas', url: 'https://www.npws.ie/maps-and-data' },
    { id: 'monuments', label: 'Historic Environment Viewer (Record of Monuments and Places)', url: 'https://heritagedata.maps.arcgis.com/apps/webappviewer/index.html?id=0c9eb9575b544081b0d296436d8f60f8' },
  ];

  // ---------- Limits, exactly as the Regulations set them ----------
  const LIMITS = {
    c1: { area: 45, aboveTerraceSemi: 12, aboveDetached: 20, partyAbove: 2, openSpace: 25, winGround: 1, winAbove: 8, since: '1 October 1964' },
    c3: { area: 30, openSpace: 25, heightPitched: 4, heightOther: 3 },
    c3a: { min: 32, max: 45, heightPitched: 4, heightOther: 3, openSpace: 25, gap: 0.6, windowGap: 0.6, noticeDays: 14, start: '2026-07-16', end: '2030-12-31' },
    c1a: { units: 2, minArea: 32, noticeDays: 14, start: '2026-07-16', end: '2030-12-31' },
    c2d: { area: 2.5, edge: 0.5, ground: 1, noise: 43, aboveBackground: 5 },
    s5: { fee: 80, weeks: 4, furtherInfoWeeks: 3, referralWeeks: 4 },
    bc: { certification: 45 },
  };

  // ---------- Every condition, with its citation ----------
  // status logic lives in engine.js; this is what the law says and where.
  const S2P1 = 'Planning and Development Regulations 2001, Schedule 2, Part 1';
  const C = (id, cls, ref, text, source, extra) => Object.assign({ id, cls, ref: `${S2P1}, ${ref}`, text, source, checked: CHECKED }, extra || {});
  const CONDITIONS = [
    // Class 1: extension (S.I. 338/2026, article 3)
    C('ie.c1.rear', 'Class 1', 'Class 1, column 1', 'The exemption covers an extension to the rear of the house (or converting an attached garage, store or shed at the rear or side). A side extension is not covered.', 'si338'),
    C('ie.c1.area', 'Class 1', 'Class 1, conditions 1(a) and 2(a)', 'The extension, together with every earlier extension built after 1 October 1964 (including ones with planning permission), must not exceed 45 m² of floor area.', 'si338'),
    C('ie.c1.above', 'Class 1', 'Class 1, conditions 1(b), 1(c), 2(b) and 2(c)', 'Floor area above ground level, with earlier extensions above ground since 1 October 1964, must not exceed 12 m² for a terraced or semi-detached house, or 20 m² for a detached house.', 'si338'),
    C('ie.c1.party', 'Class 1', 'Class 1, condition 3', 'Any part above the ground floor must be at least 2 m from any party boundary.', 'si338'),
    C('ie.c1.walls', 'Class 1', 'Class 1, conditions 4(a) and 4(b)', 'The walls of the extension must not be higher than the rear wall of the house, or, where the rear wall includes a gable, than the side walls of the house.', 'si338'),
    C('ie.c1.roof', 'Class 1', 'Class 1, condition 4(c)', 'A flat roof must not be higher than the eaves or parapet; any other roof must not be higher than the highest part of the roof of the house.', 'si338'),
    C('ie.c1.open', 'Class 1', 'Class 1, condition 5', 'At least 25 m² of private open space, for the occupants only, must remain within the curtilage.', 'si338'),
    C('ie.c1.winGround', 'Class 1', 'Class 1, condition 6(a)', 'A ground-floor window must be at least 1 m from the boundary it faces.', 'si338'),
    C('ie.c1.winAbove', 'Class 1', 'Class 1, conditions 6(b) and 6(c)', 'A window above ground level must be at least 8 m from the boundary it faces.', 'si338'),
    C('ie.c1.balcony', 'Class 1', 'Class 1, condition 7', 'The roof of the extension must not be used as a balcony or terrace.', 'si338'),
    C('ie.c1.principal', 'Class 1', 'Class 1, condition 8', 'The exemption applies to the principal house only, not to an additional detached house in its curtilage.', 'si338'),
    // Class 3: shed, garden room, garage (S.I. 338/2026, article 4)
    C('ie.c3.front', 'Class 3', 'Class 3, condition 1', 'The structure must not be forward of the front wall of the house.', 'si338'),
    C('ie.c3.area', 'Class 3', 'Class 3, condition 2', 'All Class 3 structures in the curtilage, existing and new, must not exceed 30 m² in total.', 'si338'),
    C('ie.c3.open', 'Class 3', 'Class 3, condition 3', 'At least 25 m² of private open space must remain to the rear or side of the house.', 'si338'),
    C('ie.c3.finish', 'Class 3', 'Class 3, condition 4', 'A garage or other structure to the side of the house must match the house’s external finishes, and its roof covering where tiled or slated.', 'si338'),
    C('ie.c3.height', 'Class 3', 'Class 3, condition 5', 'Height must not exceed 4 m with a tiled or slated pitched roof, or 3 m in any other case.', 'si338'),
    C('ie.c3.use', 'Class 3', 'Class 3, condition 6', 'It must not be used for human habitation, for keeping pigs, poultry, pigeons, ponies or horses, or for anything other than a purpose incidental to the enjoyment of the house.', 'si338'),
    // Class 3A: detached house in the rear garden (S.I. 340/2026)
    C('ie.c3a.rear', 'Class 3A', 'Class 3A, column 1', 'The detached house must be in the rear garden of the principal house.', 'si340'),
    C('ie.c3a.period', 'Class 3A', 'Class 3A, conditions 1 and 2', 'Works must start and finish between 16 July 2026 and 31 December 2030.', 'si340'),
    C('ie.c3a.occupancy', 'Class 3A', 'Class 3A, condition 3', 'It may only be occupied with the main house and cannot be sold or subdivided separately.', 'si340'),
    C('ie.c3a.temporary', 'Class 3A', 'Class 3A, condition 5', 'It must not be temporary, such as a caravan or mobile home.', 'si340'),
    C('ie.c3a.height', 'Class 3A', 'Class 3A, condition 6', 'Height must not exceed 4 m with a tiled or slated pitched roof, or 3 m in any other case.', 'si340'),
    C('ie.c3a.area', 'Class 3A', 'Class 3A, condition 7', 'It must be at least 32 m², and together with the Class 3 structures already in the curtilage must not exceed 45 m².', 'si340'),
    C('ie.c3a.split', 'Class 3A', 'Class 3A, condition 8', 'It cannot be used where the principal house has been subdivided.', 'si340'),
    C('ie.c3a.open', 'Class 3A', 'Class 3A, condition 9', 'At least 25 m² of private open space must remain.', 'si340'),
    C('ie.c3a.access', 'Class 3A', 'Class 3A, conditions 10 and 11', 'No new vehicle or pedestrian access onto a road; independent pedestrian or wheelchair access to it within the curtilage.', 'si340'),
    C('ie.c3a.utilities', 'Class 3A', 'Class 3A, condition 12', 'No separate connection to utilities, including water and wastewater.', 'si340'),
    C('ie.c3a.wastewater', 'Class 3A', 'Class 3A, condition 13', 'With a septic tank or other non-piped treatment: no building on an approved percolation area, enough treatment capacity under the EPA Code of Practice, and no additional treatment unit.', 'si340'),
    C('ie.c3a.gap', 'Class 3A', 'Class 3A, condition 14', 'At least 0.6 m from any wall or party boundary.', 'si340'),
    C('ie.c3a.windows', 'Class 3A', 'Class 3A, condition 15', 'Windows at least 0.6 m from the boundary they face.', 'si340'),
    C('ie.c3a.notice', 'Class 3A', 'Class 3A, conditions 16 and 17', 'Notify the planning authority at least 14 days before work starts, with the location and Eircode, confirming the site meets the requirements and stating the reason for the intended use.', 'si340'),
    C('ie.c3a.letting', 'Class 3A', 'Class 3A, condition 19', 'It must not be used for short-term letting.', 'si340'),
    C('ie.c3a.owner', 'Class 3A', 'Class 3A, condition 20', 'The principal house must be the owner’s sole or main residence when work starts.', 'si340'),
    // Class 1A: subdivision (S.I. 339/2026)
    C('ie.c1a.period', 'Class 1A', 'Class 1A, conditions 1 and 2', 'Works must start and finish between 16 July 2026 and 31 December 2030.', 'si339'),
    C('ie.c1a.units', 'Class 1A', 'Class 1A, condition 4', 'No more than two units in total.', 'si339'),
    C('ie.c1a.size', 'Class 1A', 'Class 1A, condition 5', 'Each unit at least 32 m² of floor space.', 'si339'),
    C('ie.c1a.self', 'Class 1A', 'Class 1A, condition 6', 'Each unit self-contained, sharing no internal space other than for access.', 'si339'),
    C('ie.c1a.dad', 'Class 1A', 'Class 1A, condition 7', 'It cannot be used where a detached house has been built in the rear garden under Class 3A.', 'si339'),
    C('ie.c1a.notice', 'Class 1A', 'Class 1A, conditions 8 and 9', 'Notify the planning authority at least 14 days before work starts, with the location and Eircode, confirming the site meets the requirements and stating the reason for the intended use.', 'si339'),
    // Class 2(d): heat pumps (S.I. 342/2026)
    C('ie.c2d.ground', 'Class 2(d)', 'Class 2(d), condition 1', 'The ground level must not be raised or lowered by more than 1 m.', 'si342'),
    C('ie.c2d.area', 'Class 2(d)', 'Class 2(d), condition 2', 'The heat pump, with any other heat pump already installed, must not exceed 2.5 m² in total area.', 'si342'),
    C('ie.c2d.edge', 'Class 2(d)', 'Class 2(d), condition 3', 'A unit mounted on a wall or roof must be at least 50 cm from any edge of that wall or roof.', 'si342'),
    C('ie.c2d.road', 'Class 2(d)', 'Class 2(d), condition 4', 'It must not encroach onto a public road. Since 27 July 2026 it no longer has to be at the rear.', 'si342'),
    C('ie.c2d.noise', 'Class 2(d)', 'Class 2(d), condition 5', 'Noise must not exceed 43 dB(A) in normal operation, or 5 dB(A) above background noise if that is greater, measured from the nearest neighbouring inhabited dwelling.', 'si342'),
    C('ie.c2d.type', 'Class 2(d)', 'Class 2(d), column 1', 'The class covers a ground heat pump system or an air source heat pump. It does not describe a unit used only for cooling.', 'si342'),
    // Article 5 and 9: when the classes do not apply
    C('ie.a5.flat', 'Article 5', 'Planning and Development Regulations 2001, article 5(1), definition of “house”', 'For Classes 1, 2 and 3, “house” does not include a building used as two or more dwellings, or a flat or apartment in one.', 'regs2001', { ref: 'Planning and Development Regulations 2001, article 5(1)' }),
    C('ie.a9.condition', 'Article 9', 'article 9(1)(a)(i)', 'Not exempt if it would breach a condition of an earlier planning permission or be inconsistent with a use it specifies.', 'regs2001', { ref: 'Planning and Development Regulations 2001, article 9(1)(a)(i)' }),
    C('ie.a9.unauthorised', 'Article 9', 'article 9(1)(a)(viii)', 'Not exempt if it extends, alters, repairs or renews an unauthorised structure.', 'regs2001', { ref: 'Planning and Development Regulations 2001, article 9(1)(a)(viii)' }),
    C('ie.a9.aca', 'Article 9', 'article 9(1)(a)(xii)', 'In an architectural conservation area, works to the exterior that would materially affect the character of the area are not exempt.', 'regs2001', { ref: 'Planning and Development Regulations 2001, article 9(1)(a)(xii)' }),
    C('ie.a9.saao', 'Article 9', 'article 9(1)(b)', 'In an area under a special amenity area order, Classes 1 and 3 are not exempt, and the order can limit other classes.', 'regs2001', { ref: 'Planning and Development Regulations 2001, article 9(1)(b)' }),
    C('ie.a9.european', 'Article 9', 'article 9(1)(a)(viiB) and (viiC)', 'Not exempt if it would need appropriate assessment for a European site (SAC or SPA), or would be likely to harm a Natural Heritage Area.', 'regs2001', { ref: 'Planning and Development Regulations 2001, article 9(1)(a)(viiB) and (viiC)' }),
    C('ie.a9.monument', 'Article 9', 'article 9(1)(a)(vii) and (viiA)', 'Not exempt if it would excavate, alter or demolish a monument in the Record of Monuments and Places, or a feature the development plan protects.', 'regs2001', { ref: 'Planning and Development Regulations 2001, article 9(1)(a)(vii) and (viiA)' }),
    C('ie.a9.protected', 'Protected structure', 'section 57(1)', 'For a protected structure, or a proposed one, works are exempt only if they would not materially affect its character. The owner or occupier can ask the council for a section 57 declaration on which works would, and the council must issue it within 12 weeks.', 'act2000s57', { ref: 'Planning and Development Act 2000, section 57(1) to (3)' }),
  ];
  const BY_ID = Object.fromEntries(CONDITIONS.map(c => [c.id, c]));

  // ---------- Building control, kept apart from planning ----------
  const BUILDING = [
    { id: 'ie.bc.applies', text: 'The Building Regulations apply to an exempted extension, garden room or heat pump installation even though no planning permission is needed.', source: 'bcr' },
    { id: 'ie.bc.ext45', text: 'An extension to a dwelling with a total floor area greater than 45 m² needs a commencement notice with statutory certification (Building Control Regulations, article 9(2)(b), as amended from 27 July 2026). Works that are exempted development and not above that size do not need a commencement notice (article 7(2)).', source: 'si359' },
    { id: 'ie.bc.dad', text: 'A detached auxiliary dwelling must meet the Building Regulations as a new dwelling, with a commencement notice and the normal certification (Class 3A, condition 4; the South Dublin County Council note explains the process).', source: 'sdccBc' },
    { id: 'ie.bc.split', text: 'Subdividing a house into two dwellings is a material change of use for the Building Regulations. A horizontal split (one flat above another) needs a fire safety certificate; a side-by-side split generally does not, unless a shared internal access route is created.', source: 'sdccBc' },
  ];

  // ---------- Section 5 declaration (the formal route) ----------
  const SECTION5 = {
    fee: { text: 'The fee for a request for a declaration under section 5 is €80.', ref: 'Planning and Development Regulations 2001, article 169 and Schedule 10', source: 'regs2001' },
    who: { text: 'Any person may ask the planning authority, in writing, whether something is or is not exempted development.', ref: 'Planning and Development Act 2000, section 5(1)', source: 'act2000s5' },
    time: { text: 'The authority must issue the declaration within 4 weeks of receiving the request, or within 3 weeks of receiving further information it asked for.', ref: 'Planning and Development Act 2000, section 5(2)(a) and (b)', source: 'act2000s5' },
    review: { text: 'The person issued with the declaration may refer it to An Coimisiún Pleanála for review within 4 weeks of the date it was issued.', ref: 'Planning and Development Act 2000, section 5(3)(a)', source: 'act2000s5' },
    docs: { text: 'Councils publish their own form and list. Kilkenny County Council, for example, asks for the completed form, the €80 fee, a site location map (1:1000 in urban areas, 1:2500 in rural areas) with the site boundary in red, a scaled site layout plan and elevations of the existing and proposed works, and a written description and purpose of the development.', ref: 'Kilkenny County Council, Exempted development', source: 'kilkennyS5' },
  };

  // The suggested notification template (PLR 02/2026, Appendix I), in the order the council forms use.
  const NOTICE = {
    title: 'Notification of intention to avail of exemption under Part 1 of Schedule 2',
    heading: 'PLANNING AND DEVELOPMENT REGULATIONS 2001 (S.I. NO. 600 OF 2001), AS AMENDED.',
    classes: {
      '1A': 'Class 1A - subdivision of a house and the restoration of a house to its original form if subdivided under this Class',
      '3A': 'Class 3A - construction, erection or placing of a detached house in the rear garden of a principal house',
    },
    fields: ['Location of the proposed development', 'Eircode', 'Date notification received', 'Proposed date of commencement of works', 'Exemption being notified (1A or 3A)', 'Does the site and proposed development that is the subject of this notification meet all requirements set out in the Regulations (Yes or No)', 'Reason for intended use'],
    footnote: 'A minimum of 14 days’ notice is required to be furnished to the Planning Authority prior to commencement.',
    checklist: {
      '1A': [
        'The proposed development will be completed before 31st December 2030.',
        'The works will be completed in line with Building Regulations including (fire safety) and building control regulations.',
        'The subdivision of the principal dwelling will not result in the use of the principal dwelling as more than 2 units in total, each of which must have a minimum floor space of at least 32 sq./m.',
        'Each subdivided unit within the principal dwelling will be self-contained and not reliant on the use of shared internal space other than for access.',
        'Development has not been carried out on the proposed site under Class 3A (detached auxiliary dwelling to the rear of the main principal dwelling).',
      ],
      '3A': [
        'The proposed development will be completed before 31st December 2030.',
        'The detached auxiliary dwelling will only be occupied in conjunction with the main dwelling house and will not be sold or subdivided separate to the principal dwelling.',
        'The works will be completed in line with the relevant Building Control legislation such as Building Regulations (including Fire Safety) and Building Control Regulations.',
        'The detached auxiliary dwelling structure is not temporary in nature such as a caravan or mobile home.',
        'The height will not exceed, in the case of a building with a tiled or slated pitched roof, 4 metres or, in any other case 3 metres.',
        'The total area of such structures constructed, erected or placed within the rear garden of the curtilage of a detached house will not be less than 32 square metres. Taken together with any other such structures previously constructed, erected or placed under Class 3 within the said curtilage, will not exceed 45 square metres.',
        'Development has not been carried out on the proposed site under Class 1A (subdivision of the principal house).',
        'The construction, erection or placing within the curtilage of the principal house of any such structure will not reduce the total amount of private open space reserved exclusively for the use of the occupants of the house to less than 25 square metres.',
        'Independent pedestrian and / or wheelchair access to the detached house will be provided for within the curtilage of the principal house and no new vehicle or pedestrian access on to a road will be constructed under this exemption.',
        'There will be no separate connection to utilities, including water or wastewater utilities.',
        'In the case of non-piped waste water treatment, the structure will not encroach on any approved percolation area. On site waste water, treatment shall be of sufficient capacity to meet the additional loading and shall comply with the EPA Code of Practice for Domestic Waste Water Treatment Systems. There will be no additional waste water treatment units installed as part of this class.',
        'The structure will be a distance not less than 0.6 metres from any wall or party boundary.',
        'Any windows proposed in the structure will be at least 0.6 metres from the boundary they face.',
        'The detached auxiliary dwelling will not be used for the purpose of short-term letting.',
        'The principal dwelling house is the sole or main residence of the property owner at the time the development is commenced.',
      ],
    },
    source: 'plr02',
  };

  // The other 2026 classes, for the summary page (not separate tool projects in v1).
  const OTHER_2026 = [
    { cls: 'Class 1B', what: 'Dormer roof extension and dormer window to the side or rear', rule: 'Internal volume of all dormers no more than 30 m³; no higher than the ridge; at least 20 cm eaves set-back.', source: 'si344' },
    { cls: 'Class 1C', what: 'Roof lights on the existing front roof plane', rule: 'At most two roof lights on the front roof plane, each no more than 100 cm long and 90 cm wide.', source: 'si344' },
    { cls: 'Class 2A', what: 'Removing a chimney', rule: 'Not where it is part of a joint stack with a separate house; roof finishes to match; subject to the Wildlife Act 1976, sections 22 and 23 (nests, bats).', source: 'si343' },
    { cls: 'Class 62', what: 'Bike or bin storage', rule: 'Up to 3.5 m² and 1.4 m high; at the front, 0.6 m back from the front wall and no more than half of the front garden’s open space taken.', source: 'si341' },
    { cls: 'Class 63', what: 'External wall insulation', rule: 'No more than 150 mm thick on the front, rear or gable walls; not onto a public road; no material change to the character of the building and its neighbours.', source: 'si341' },
  ];

  const MONTHS = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];
  return { RULES_VERSION, CHECKED, RULES_AS_OF, SOURCES, MAPS, LIMITS, CONDITIONS, BY_ID, BUILDING, SECTION5, NOTICE, OTHER_2026, MONTHS, jurisdiction: 'ie', name: 'Ireland' };
});
