/* Dropped Kerb Check: Kent County Council, the highway authority for Kent except Medway.
 * Read on 11 October 2026: the council's guidance PDF (Residential Dropped Kerb Guidance and Self-Assessment v9,
 * April 2026, file dated 7 April 2026) and its application page. Facts and figures with citations; no copied text.
 * Change a value only after reading the council's page again; bump version and checked. */
(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory();
  else (root.DKAuth = root.DKAuth || {}).kent = factory();
})(typeof self !== 'undefined' ? self : this, function () {
  'use strict';
  const CHECKED = '2026-10-11';
  return {
    slug: 'kent', name: 'Kent County Council', short: 'Kent', kind: 'county',
    area: 'Kent, except Medway, which is its own highway authority. The 12 district and borough councils decide planning.',
    checked: CHECKED, version: 'kent-2026-10-11.1',
    sources: {
      guide: { label: 'Kent County Council, Residential Dropped Kerb Guidance and Self-Assessment, version 9 (April 2026)', short: 'KCC guidance v9', url: 'https://www.kent.gov.uk/__data/assets/pdf_file/0020/191441/Dropped-Kerb-Application-Guidance.pdf', checked: CHECKED },
      page: { label: 'Kent County Council, Apply for a dropped kerb, extension or access point', short: 'KCC application page', url: 'https://www.kent.gov.uk/roads-and-travel/highway-permits-and-licences/apply-for-a-dropped-kerb-extension-or-access-point', checked: CHECKED },
    },
    process: {
      url: 'https://www.kent.gov.uk/roads-and-travel/highway-permits-and-licences/apply-for-a-dropped-kerb-extension-or-access-point',
      builder: 'contractor', builderText: 'Once approved you may use any contractor with New Roads and Street Works Act accreditation for excavation and reinstatement and £5 million public liability insurance.',
      decision: 'The council aims to inspect and decide within 28 days of the application and payment.',
      valid: 'An approval notice is valid for 2 years.',
      review: 'A refusal letter sets out the reasons; if you think the criteria were applied wrongly you can ask for a review by making a complaint.',
      evidence: 'You must send a copy of your planning permission, or written confirmation from your district or borough council that you do not need it.',
      source: 'page',
    },
    fees: [
      { id: 'application', label: 'Application fee', amount: 500, refundable: 'partial', refund: 231, note: 'A refused application gets £231 back.', source: 'page' },
      { id: 'inspection', label: 'Extra inspection by a tree officer or a street lighting engineer, each', amount: 76, refundable: false, when: ['tree', 'lamp'], possible: true, note: 'Charged when a specialist has to look at a nearby tree or street light; also for a new access point.', source: 'page' },
    ],
    works: { kind: 'range', min: 1000, max: 2500, text: 'Contractors’ prices', source: 'page' },
    rules: {
      depth: { perp: 4.8, door: 6, parallel: 3, parallelDoor: 4.2, gates: 5.5, ref: 'Section 3, space criteria table; section 11, gates', source: 'guide' },
      width: { perp: 2.4, parallel: 6, ref: 'Section 3, space criteria table', source: 'guide' },
      crossing: { text: 'At least 4 dropped kerbs and 2 tapers for perpendicular parking, at least 6 and 2 for parallel parking; the officer may adjust the size.', kerbs: 4, tapers: 2, parallelKerbs: 6, ref: 'Section 3', source: 'guide' },
      junction: { min: 10, major: 15, strict: false, ref: 'Section 5', text: 'Closer than 10 m to a junction, where it creates a hazard, is refused; the distance can rise to 15 m on major roads or near busy junctions.', source: 'guide' },
      pedSplay: { kind: 'edge', along: 2, into: 2, h: 0.6, strict: true, ref: 'Section 6, footway visibility', source: 'guide' },
      sight: { setback: 2.4, y: { 20: 25, 30: 43 }, ref: 'Section 6, carriageway visibility (from Manual for Streets 2)', source: 'guide' },
      tree: { kind: 'rpa12d', within: 15, strict: true, ref: 'Section 8, highway tree self-assessment', text: 'The root protection radius is 12 times the trunk diameter (circumference divided by 3.14) at 1.5 m; the edge of the dropped kerb must be further from the trunk than that.', source: 'guide' },
      lamp: { min: 0.5, within: 'inspect', ref: 'Section 7', text: 'A street light or lit sign within 0.5 m needs an engineer’s inspection, may not be movable, and any approved move is at your cost.', source: 'guide' },
      furniture: { kind: 'owner', ref: 'Section 10', text: 'Covers, cabinets, poles, hydrants and signs in the area: contact the owner; approval depends on their written agreement.', source: 'guide' },
      busStop: { kind: 'contact', ref: 'Section 13', text: 'Buses must still pull in and out safely; any relocation is at your cost.', source: 'guide' },
      pedCrossing: { controlled: 20, tactile: 'move', ref: 'Section 14', text: 'No crossing within 20 m of the stop line of a controlled crossing; a tactile crossing point must be moved at your cost, with a full-height kerb between.', source: 'guide' },
      bays: { marked: 'check', ref: 'Section 12', text: 'Removing a marked bay needs the district council’s permission and may not be possible; you pay the costs.', source: 'guide' },
      calming: { effect: 'fail', ref: 'Section 15', text: 'Traffic calming will not be removed or adjusted for a dropped kerb.', source: 'guide' },
      second: { kind: 'frontage', frontage: 15, depth: 4.2, gap: 4.5, ref: 'Section 4', text: 'A second access only with a frontage of 15 m by 4.2 m to drive on and off in forward gear, at most 4 flat kerbs each, and 4.5 m of full-height kerb between.', source: 'guide' },
      gates: { ref: 'Section 11', text: 'Gates must not open outwards over the highway, and need 5.5 m of clearance.', source: 'guide' },
      drainage: { ref: 'Section 9', text: 'The parking area must not drain across the highway; drainage stays within the property.', source: 'guide' },
      ownership: { ref: 'Section 1', text: 'If you do not own the property, get the freeholder’s written permission.', source: 'guide' },
    },
    planning: [
      { when: 'evidence', text: 'Kent asks for your planning permission, or the district council’s written confirmation that none is needed, with the application.', source: 'page' },
    ],
    notes: [
      { text: 'Footway reconstruction: if your road is on the council’s forward works programme you may get a dropped kerb at a reduced rate.', source: 'page' },
      { text: 'A record check on whether an existing dropped kerb is legal costs £76.', source: 'page' },
    ],
    sample: { depth: 5.6, width: 4.6, footway: 2.0, verge: 0, junction: 26, wall: 0.5, tree: { dist: 6.5, circ: 0.9 }, lamp: 3.2 },
  };
});
