/* Dropped Kerb Check: Bristol City Council, the highway authority for Bristol.
 * Read on 11 October 2026: the council's dropped kerbs page, its highway excavation licence page (licence costs)
 * and its vehicle crossover Section 171 and 184 guidance and process document (file dated 1 April 2025).
 * Where the page and the older document differ, the page is used. Facts and figures with citations; no copied text. */
(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory();
  else (root.DKAuth = root.DKAuth || {}).bristol = factory();
})(typeof self !== 'undefined' ? self : this, function () {
  'use strict';
  const CHECKED = '2026-10-11';
  return {
    slug: 'bristol', name: 'Bristol City Council', short: 'Bristol', kind: 'unitary',
    area: 'Bristol. The city council is both the highway authority and the planning authority.',
    checked: CHECKED, version: 'bristol-2026-10-11.1',
    sources: {
      page: { label: 'Bristol City Council, Dropped kerbs', short: 'BCC dropped kerbs page', url: 'https://www.bristol.gov.uk/residents/streets-travel/dropped-kerbs', checked: CHECKED },
      licence: { label: 'Bristol City Council, Highway excavation licence (licence costs)', short: 'BCC licence page', url: 'https://www.bristol.gov.uk/business/licences-and-permits/roads-and-highway-licences/highway-excavation-licence', checked: CHECKED },
      guide: { label: 'Bristol City Council, Vehicle crossover Section 171 and 184 guidance and process document', short: 'BCC guidance and process', url: 'https://www.bristol.gov.uk/files/documents/1502-vehicle-crossover-s-171-and-s-184-guidance-and-process-document/file', checked: CHECKED },
    },
    process: {
      url: 'https://www.bristol.gov.uk/residents/streets-travel/dropped-kerbs',
      builder: 'contractor', builderText: 'The council does not install vehicle dropped kerbs. Your contractor needs £5 million public liability insurance, NPORS or SWQR street works qualifications and the combined licence for your address.',
      decision: 'A highway officer assesses the application and the licences team writes with the decision.',
      valid: 'Not stated; the contractor maintains the crossing for 2 years after completion.',
      review: 'Not stated. Granting the licence does not mean a crossing is technically achievable.',
      source: 'page',
    },
    fees: [
      { id: 'application', label: 'Combined excavation and vehicle crossover licence (domestic)', amount: 357, refundable: false, source: 'licence' },
    ],
    works: { kind: 'quote', text: 'Your contractor quotes for the works to the council’s standard details.', source: 'page', extra: 'A retrospective domestic licence for a crossing built without permission costs £536.' },
    rules: {
      depth: { perp: 4.8, door: 6, parallel: 3, classified: 5.3, ref: 'Dropped kerbs page, driveway standards; guidance, question 1', text: 'Without planning permission: straight-in parking at least 4.8 m from the pavement edge to the building, 2.4 m wide (4.8 m for two spaces); parallel 3 m by 6 m. On a classified street, a guide of 5.3 m (4.8 m if not against a building) by 3 m, with no parallel option. In front of a garage with outward doors, 6 m.', source: 'page' },
      width: { perp: 2.4, two: 4.8, parallel: 6, classified: 3, ref: 'Dropped kerbs page, driveway standards', source: 'page' },
      crossing: { text: 'The standard is 3 low kerbs and 4 transition kerbs, more where space allows; the transitions start at your boundary and need written consent to pass a neighbour’s.', kerbs: 3, tapers: 4, ref: 'Guidance, question 4', source: 'guide' },
      junction: { min: 10, classified: 15, strict: false, ref: 'Guidance, question 2', text: 'Within 10 m of a junction, traffic signals or a roundabout (15 m on a classified road) the application may be refused on safety grounds.', source: 'guide' },
      pedSplay: { kind: 'unsized', h: 0.6, strict: false, ref: 'Guidance, question 3', text: 'Visibility areas must be kept clear, with plants and walls below 600 mm.', source: 'guide' },
      tree: { kind: 'assess', ref: 'Guidance, question 6', text: 'Near tree roots the officer may ask for a trial excavation at your cost; removal only in exceptional cases with a replacement, also at your cost.', source: 'guide' },
      lamp: { kind: 'move', ref: 'Dropped kerbs page; guidance, site suitability', text: 'A street lamp or furniture blocking access is a reason to refuse; where a move is possible you pay for it.', source: 'page' },
      furniture: { kind: 'move', ref: 'Guidance, site suitability', source: 'guide' },
      gradient: { max: 1 / 12, scope: 'crossing', ref: 'Guidance, construction', text: 'Gradients must not exceed 1 in 12, preferably 1 in 20; dropped kerbs keep a 25 mm upstand at most.', source: 'guide' },
      bays: { marked: 'check', ref: 'Guidance, question 5', text: 'Removing a residents’ parking bay may need a contribution to the traffic order change, made only when the scheme is next reviewed (up to every three years).', source: 'guide' },
      pedCrossing: { kind: 'restriction', ref: 'Guidance, question 5; dropped kerbs page', text: 'Pedestrian crossings and traffic lights nearby are reasons the council may refuse.', source: 'guide' },
      calming: { effect: 'check', ref: 'Guidance, site suitability', source: 'guide' },
      classifiedTurn: { ref: 'Guidance, classified roads', text: 'On a classified road a car must be able to turn round inside the property and leave in forward gear.', source: 'guide' },
      gates: { ref: 'Guidance, question 1', text: 'Gates must open inwards; a garage opening straight on to the highway needs a roller shutter.', source: 'guide' },
      drainage: { ref: 'Dropped kerbs page, drainage', text: 'The driveway needs drainage across its width where it meets the road boundary.', source: 'page' },
      surfacePermeable: { minArea: 0, ref: 'Dropped kerbs page, construction materials', text: 'The driveway must be porous asphalt or permeable block paving on a permeable sub-base.', source: 'page' },
      loose: { kind: 'banned', ref: 'Dropped kerbs page, construction materials', text: 'No loose gravel surfacing.', source: 'page' },
      ownership: { ref: 'Guidance, question 1 (permissions)', text: 'You need the landowner’s permission to cross any private land between your property and the highway.', source: 'guide' },
    },
    planning: [
      { when: 'list', text: 'Bristol says you need planning permission for a property divided into flats, for removing a gate pillar, wall or fence over 1 m high in a conservation area, for structural work to make the parking area, or on an A, B or C road.', source: 'page' },
    ],
    notes: [],
    sample: { depth: 5.0, width: 3.0, footway: 2.0, verge: 0, junction: 12, wall: 0.5, tree: null, lamp: 5 },
  };
});
