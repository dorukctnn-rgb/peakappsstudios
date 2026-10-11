/* Dropped Kerb Check: the national rules, one versioned file. Every rule the tool applies to every council in England
 * is here with its legal reference, the official source and the date it was read. The tool, the pages and the PDF
 * print RULES_AS_OF. Councils' own criteria live in authorities/<slug>.js.
 *
 * Read on 11 October 2026 from the official texts (legislation.gov.uk, revised versions up to date to 10 October 2026,
 * and GOV.UK):
 *  - Highways Act 1980, sections 153, 163 and 184 (extent England and Wales).
 *  - The Town and Country Planning (General Permitted Development) (England) Order 2015 (S.I. 2015/596), articles 2, 3
 *    and 4, Schedule 2 Part 1 Class F and Part 2 Classes A and B.
 *  - Traffic Management Act 2004, section 86; The Highway Code, rule 243.
 *  - Transport (Scotland) Act 2019, sections 56 and 57 (for the parking page; Scotland is not checked in v1).
 *  - The planning fee in force from 1 April 2026 (householder application £548) as published in Fylde Council's
 *    schedule; a certificate of lawfulness for proposed works is half the normal fee.
 * Crown copyright material is re-used under the Open Government Licence v3.0. Our wording, not the statute's, except
 * where a phrase is quoted.
 *
 * Pure data, no DOM: window.DKNational in the browser, module.exports in Node. Change a value only after reading the
 * official text again; bump RULES_VERSION and CHECKED, then run the tests and node src/dropped-kerb/_build/pages.mjs. */
(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory();
  else root.DKNational = factory();
})(typeof self !== 'undefined' ? self : this, function () {
  'use strict';

  const RULES_VERSION = 'uk-2026-10-11.1';
  const CHECKED = '2026-10-11';
  const RULES_AS_OF = '11 October 2026';
  const LEG = 'https://www.legislation.gov.uk';
  const GPDO = LEG + '/uksi/2015/596';

  const SOURCES = {
    ha184: { label: 'Highways Act 1980, section 184 (vehicle crossings over footways and verges)', short: 'Highways Act 1980, s.184', url: LEG + '/ukpga/1980/66/section/184', checked: CHECKED },
    ha153: { label: 'Highways Act 1980, section 153 (doors and gates in streets not to open outwards)', short: 'Highways Act 1980, s.153', url: LEG + '/ukpga/1980/66/section/153', checked: CHECKED },
    ha163: { label: 'Highways Act 1980, section 163 (prevention of water flowing on to the highway)', short: 'Highways Act 1980, s.163', url: LEG + '/ukpga/1980/66/section/163', checked: CHECKED },
    gpdoF: { label: 'GPDO 2015, Schedule 2, Part 1, Class F (hard surfaces incidental to the enjoyment of a dwellinghouse)', short: 'GPDO 2015, Pt 1 Class F', url: GPDO + '/schedule/2/part/1/crossheading/class-f-hard-surfaces-incidental-to-the-enjoyment-of-a-dwellinghouse', checked: CHECKED },
    gpdoB: { label: 'GPDO 2015, Schedule 2, Part 2, Class B (means of access to a highway)', short: 'GPDO 2015, Pt 2 Class B', url: GPDO + '/schedule/2/part/2/crossheading/class-b-means-of-access-to-a-highway', checked: CHECKED },
    gpdoA: { label: 'GPDO 2015, Schedule 2, Part 2, Class A (gates, fences, walls)', short: 'GPDO 2015, Pt 2 Class A', url: GPDO + '/schedule/2/part/2/crossheading/class-a-gates-fences-walls-etc', checked: CHECKED },
    gpdoArt2: { label: 'GPDO 2015, article 2(1) (definitions of “classified road” and “dwellinghouse”)', short: 'GPDO 2015, art. 2', url: GPDO + '/article/2', checked: CHECKED },
    gpdoArt3: { label: 'GPDO 2015, article 3(4) and (5) (conditions on a permission; unlawful buildings)', short: 'GPDO 2015, art. 3', url: GPDO + '/article/3', checked: CHECKED },
    gpdoArt4: { label: 'GPDO 2015, article 4 (directions restricting permitted development)', short: 'GPDO 2015, art. 4', url: GPDO + '/article/4', checked: CHECKED },
    tma86: { label: 'Traffic Management Act 2004, section 86 (prohibition of parking at dropped footways)', short: 'TMA 2004, s.86', url: LEG + '/ukpga/2004/18/section/86', checked: CHECKED },
    hc243: { label: 'The Highway Code, rule 243 (where not to stop or park)', short: 'Highway Code, rule 243', url: 'https://www.gov.uk/guidance/the-highway-code/waiting-and-parking-238-to-252', checked: CHECKED },
    tsa56: { label: 'Transport (Scotland) Act 2019, sections 56 and 57 (dropped footway parking prohibition and its exceptions)', short: 'Transport (Scotland) Act 2019, ss.56-57', url: LEG + '/asp/2019/17/part/6', checked: CHECKED },
    tscot: { label: 'Transport Scotland, Parking and the Transport (Scotland) Act 2019 (penalty charge £100, £50 if paid within 14 days, from 11 December 2023)', short: 'Transport Scotland', url: 'https://www.transport.gov.scot/our-approach/transport-scotland-act-2019/parking-and-the-transport-scotland-act-2019/', checked: CHECKED },
    govRouter: { label: 'GOV.UK, Apply for a dropped kerb (postcode finder for your council, England and Wales only)', short: 'GOV.UK, Apply for a dropped kerb', url: 'https://www.gov.uk/apply-dropped-kerb', checked: CHECKED },
    dft2026: { label: 'Department for Transport, Pavement parking consultation: government response (8 January 2026)', short: 'DfT, 8 January 2026', url: 'https://www.gov.uk/government/speeches/pavement-parking-consultation-government-response', checked: CHECKED },
    noSI: { label: 'legislation.gov.uk, UK Statutory Instruments 2026 with “pavement” in the title (no results on 11 October 2026)', short: 'legislation.gov.uk search', url: LEG + '/uksi/2026?title=pavement', checked: CHECKED },
    evGrant: { label: 'OZEV, Chargepoint grant for households with on-street parking (up to £500 from 1 April 2026, final year to 31 March 2027)', short: 'OZEV on-street chargepoint grant', url: 'https://www.gov.uk/government/publications/chargepoint-grant-for-households-with-on-street-parking-installer-claim-form', checked: CHECKED },
    permeable: { label: 'MHCLG, Guidance on the permeable surfacing of front gardens (2008)', short: 'Permeable surfacing guidance', url: 'https://www.gov.uk/government/publications/permeable-surfacing-of-front-gardens-guidance', checked: CHECKED },
    tcpa55: { label: 'Town and Country Planning Act 1990, section 55(1) (meaning of development, including engineering operations)', short: 'TCPA 1990, s.55', url: LEG + '/ukpga/1990/8/section/55', checked: CHECKED },
    fees2026: { label: 'Fylde Council, Planning application fees in England from 1 April 2026 (householder £548; certificate of lawfulness for proposed works, half the normal fee)', short: 'Planning fees from 1 April 2026', url: 'https://new.fylde.gov.uk/wp-content/uploads/2026/03/PLANNING-APPLICATION-FEES-SCHEDULE-1-APRIL-2026.pdf', checked: CHECKED },
    tfl: { label: 'Transport for London, Highway works: residential vehicular crossovers on the TLRN (red routes)', short: 'TfL highway works', url: 'https://tfl.gov.uk/info-for/urban-planning-and-construction/transport-assessment-guide/highway-works', checked: CHECKED },
    ogl: { label: 'Open Government Licence v3.0', short: 'OGL v3.0', url: 'https://www.nationalarchives.gov.uk/doc/open-government-licence/version/3/', checked: CHECKED },
  };

  // Limits exactly as the law sets them (metres, m², pounds).
  const LIMITS = {
    surfaceArea: 5,          // Class F, F.2(b): more than 5 m² of hard surface between the principal elevation and a highway
    wallNearRoad: 1,         // Part 2 Class A, A.1(a)(ii): a gate, fence or wall adjacent to a highway used by vehicles, 1 m
    planningFee: 548,        // householder application, from 1 April 2026
    ldcFee: 274,             // certificate of lawfulness for proposed works: half the normal fee
    feesFrom: '2026-04-01',
    s184Fine: 'level 3 on the standard scale',
    scotPcn: 100, scotPcnEarly: 50,
  };

  // The national rules the engine applies. Each has an id, the group it prints in, our wording, the reference and source.
  const R = (id, group, ref, text, source) => ({ id, group, ref, text, source, checked: CHECKED });
  const RULES = [
    // Highway consent, for every council in England (and Wales)
    R('nat.consent', 'consent', 'Highways Act 1980, s.184(11) to (13)', 'Anyone may ask the highway authority to build a vehicle crossing. The authority may approve it, change it, propose other works or refuse, and if it approves it quotes the cost; it must have regard to preventing damage to the footway or verge, safe access and egress, and the passage of traffic (s.184(5)).', 'ha184'),
    R('nat.notice', 'consent', 'Highways Act 1980, s.184(1) and (17)', 'Where a vehicle is habitually driven across a kerbed footway or verge, the authority can serve notice to build a crossing at the owner’s cost or set conditions on its use; knowingly breaking a condition is an offence with a fine up to level 3.', 'ha184'),
    R('nat.gates', 'consent', 'Highways Act 1980, s.153(1)', 'A gate on premises that opens on a street must not open outwards over it.', 'ha153'),
    R('nat.tlrn', 'consent', 'Transport for London, highway works guidance', 'On a Transport for London red route TfL is the highway authority: a crossover needs planning permission from the borough, because red routes are classified roads, and TfL builds it under a section 278 agreement.', 'tfl'),
    R('nat.water', 'consent', 'Highways Act 1980, s.163(1)', 'The council can require the occupier to stop surface water from the property flowing on to or over the footway.', 'ha163'),
    // Planning: is the access and the hard standing permitted development?
    R('pl.access', 'planning', 'GPDO 2015, Schedule 2, Part 2, Class B', 'A new access is permitted development only on to a road that is neither a trunk road nor a classified road, and only where it is needed in connection with development permitted by another class (such as a Class F hard surface). Access on to an A, B or classified unnumbered road needs planning permission.', 'gpdoB'),
    R('pl.surface', 'planning', 'GPDO 2015, Schedule 2, Part 1, Class F, paragraph F.2', 'A hard surface between the front wall of the house and a road that covers more than 5 m², or replaces more than 5 m², must be porous or drain to a porous area within the property. Otherwise it needs planning permission.', 'gpdoF'),
    R('pl.house', 'planning', 'GPDO 2015, article 2(1), “dwellinghouse”', 'Part 1 rights belong to houses. A flat, a maisonette or a building containing flats is not a “dwellinghouse”, so its hard standing, and the access for it, need planning permission.', 'gpdoArt2'),
    R('pl.changeofuse', 'planning', 'GPDO 2015, Schedule 2, Part 1, Class F, paragraph F.1', 'Class F does not apply to a house created only under a change-of-use right in Part 3 (Classes G, M, MA, N, P, PA or Q) or built under Part 20.', 'gpdoF'),
    R('pl.article4', 'planning', 'GPDO 2015, article 4', 'A council can remove permitted development rights for an area by an Article 4 direction; such directions often cover front gardens and walls in conservation areas.', 'gpdoArt4'),
    R('pl.condition', 'planning', 'GPDO 2015, article 3(4)', 'Nothing in the Order permits development contrary to a condition of a planning permission, such as one removing permitted development rights on a newer estate.', 'gpdoArt3'),
    R('pl.wall', 'planning', 'GPDO 2015, Schedule 2, Part 2, Class A, paragraph A.1(a)(ii) and (d)', 'A new gate, fence or wall next to a road used by vehicles is permitted development up to 1 m high, and not at all within the curtilage of a listed building.', 'gpdoA'),
    R('pl.listed', 'planning', 'GPDO 2015, Schedule 2, Part 2, Class A, paragraph A.1(d)', 'Class A does not cover a gate, fence or wall within the curtilage of a listed building, or one surrounding it, so a new or altered front wall or gate there needs planning permission. Ask the council about listed building consent before any work.', 'gpdoA'),
    R('pl.structural', 'planning', 'Town and Country Planning Act 1990, section 55(1)', 'Development includes engineering operations. Digging out or building up the garden, or new retaining walls, to make a parking area go beyond laying a hard surface under Class F and may need planning permission; ask the council.', 'tcpa55'),
  ];
  const BY_ID = Object.fromEntries(RULES.map(r => [r.id, r]));

  // Parking across a dropped kerb (the parking page and the FAQ)
  const PARKING = {
    england: { text: 'In a special enforcement area, where the council enforces it, a vehicle must not be parked on the road beside a footway that has been lowered for pedestrians, cyclists or vehicles. One exception is parking outside a home by the occupier, or with the occupier’s consent given free, which does not apply to a shared driveway.', ref: 'Traffic Management Act 2004, s.86(1) and (3)', source: 'tma86' },
    code: { text: 'Do not stop or park in front of an entrance to a property, where the kerb has been lowered to help wheelchair users and powered mobility vehicles, or within 10 metres of a junction except in an authorised space.', ref: 'Highway Code, rule 243', source: 'hc243' },
    scotland: { text: 'Since 11 December 2023 parking beside a dropped kerb for pedestrians or cyclists to cross is banned, with a £100 penalty (£50 if paid within 14 days). The ban does not apply to a kerb dropped for access to a driveway or garage.', ref: 'Transport (Scotland) Act 2019, ss.56(1) and 57(2)', source: 'tsa56' },
    pending: { text: 'The government said on 8 January 2026 that secondary legislation would be introduced in 2026 to let councils enforce against unnecessary obstruction of the pavement. No such instrument was on legislation.gov.uk on 11 October 2026.', ref: 'DfT response, 8 January 2026', source: 'dft2026' },
  };

  const MONTHS = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];
  return { RULES_VERSION, CHECKED, RULES_AS_OF, SOURCES, LIMITS, RULES, BY_ID, PARKING, MONTHS, jurisdiction: 'england', name: 'England' };
});
