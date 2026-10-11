/* Dropped Kerb Check: Hampshire County Council, the highway authority for Hampshire except the cities of Portsmouth
 * and Southampton (each its own highway authority).
 * Read on 11 October 2026: the council's "Apply for a vehicular access" page (fees from 1 April 2026) and its
 * dropped kerb pre-application checklist. Facts and figures with citations; no copied text. */
(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory();
  else (root.DKAuth = root.DKAuth || {}).hampshire = factory();
})(typeof self !== 'undefined' ? self : this, function () {
  'use strict';
  const CHECKED = '2026-10-11';
  return {
    slug: 'hampshire', name: 'Hampshire County Council', short: 'Hampshire', kind: 'county',
    area: 'Hampshire, except the cities of Portsmouth and Southampton, which are their own highway authorities. The district and borough councils decide planning.',
    checked: CHECKED, version: 'hampshire-2026-10-11.1',
    sources: {
      page: { label: 'Hampshire County Council, Apply for a vehicular access', short: 'HCC application page', url: 'https://www.hants.gov.uk/transport/parking/droppedkerbs', checked: CHECKED },
      check: { label: 'Hampshire County Council, Dropped kerb pre-application checklist', short: 'HCC pre-application checklist', url: 'https://www.hants.gov.uk/transport/parking/droppedkerbs/droppedkerbchecklist', checked: CHECKED },
    },
    process: {
      url: 'https://www.hants.gov.uk/transport/parking/droppedkerbs',
      builder: 'contractor', builderText: 'After approval you appoint a contractor with £10 million public liability insurance and New Roads and Street Works Act accredited staff, who must hold a Section 171 road opening licence for your address; see the licence before work starts.',
      decision: 'Standard: a site inspection and decision within eight weeks. Fast Track: within two weeks, for an extra fee.',
      valid: 'Approval is valid for 12 months and is not extended.',
      review: 'A refusal letter gives the reasons. The fee is not refunded, including for the Fast Track service.',
      source: 'page',
    },
    fees: [
      { id: 'application', label: 'Application fee', amount: 211.90, refundable: false, source: 'page' },
      { id: 'fasttrack', label: 'Fast Track decision in two weeks (optional)', amount: 97, refundable: false, optional: true, note: 'Makes the total £308.90.', source: 'page' },
    ],
    works: { kind: 'quote', text: 'Your own contractor quotes for the works and the Section 171 licence.', source: 'page' },
    rules: {
      depth: { perp: 4.8, door: 6, ref: 'Checklist, room for parking; garage with outward-opening doors', text: 'At least 4.8 m deep by 2.4 m wide inside the boundary, at right angles to the pavement; 6 m in front of a garage with doors that open outwards. No relaxations.', source: 'check' },
      width: { perp: 2.4, ref: 'Checklist, room for parking', source: 'check' },
      crossing: { text: 'The standard is 4 low kerbs and 2 sloping kerbs, about 5.4 m along the kerb, reduced to 3 low kerbs if needed; about 3.7 m wide at the back edge, 2.75 m at least.', kerbs: 4, tapers: 2, rearMin: 2.75, ref: 'Checklist, width of crossing', source: 'check' },
      junction: { min: 10, classified: 15, strict: true, ref: 'Checklist, proposed access', text: 'No part of the crossing within the radius kerb, or within 10 m of a junction, traffic signals or a roundabout (15 m on a classified road).', source: 'check' },
      pedSplay: { kind: 'unsized', h: 0.6, strict: false, ref: 'Checklist, visibility', text: 'The visibility areas must be clear, with plants and walls kept below 600 mm.', source: 'check' },
      tree: { kind: 'circ', factor: 4, strict: true, ref: 'Checklist, trees, shrubs and plants', text: 'The root protection zone is a circle with a radius of 4 times the trunk circumference at about 1.5 m; a crossing inside it is refused.', source: 'check' },
      lamp: { kind: 'move', ref: 'Checklist, site suitability', text: 'Street lights, signs, bus stops and other furniture in the crossing area have to be moved where possible, at your cost.', source: 'check' },
      furniture: { kind: 'move', ref: 'Checklist, utilities', text: 'Utility covers, cabinets and poles: you arrange and pay for any changes with the owner first.', source: 'check' },
      gradient: { max: 1 / 12, scope: 'crossing', ref: 'Checklist, cambers and gradients', text: 'No crossing is approved if its gradient would exceed 1 in 12.', source: 'check' },
      bays: { marked: 'check', ref: 'Checklist, parking restrictions', text: 'A pedestrian crossing, disabled bay, pay and display or other restriction at the site is unlikely to be removed, so the application will most likely be refused; yellow lines are unlikely to matter.', source: 'check' },
      pedCrossing: { kind: 'restriction', ref: 'Checklist, parking restrictions and traffic calming', source: 'check' },
      calming: { effect: 'check', ref: 'Checklist, traffic calming', text: 'Speed humps, crossings and build-outs may have to be moved at your cost; in Home Zones they cannot be changed.', source: 'check' },
      verge: { kind: 'judgement', ref: 'Checklist, soft verge', text: 'A crossing over a highway verge can be refused for loss of green space; the council’s judgement here is not reviewed on appeal.', source: 'check' },
      second: { kind: 'exceptional', ref: 'Checklist, second crossings', text: 'One crossing per property; a second only in exceptional cases with a clear safety benefit.', source: 'check' },
      classifiedTurn: { ref: 'Checklist, classified roads', text: 'On a classified road the car must be able to turn within the property and leave in forward gear.', source: 'check' },
      gates: { ref: 'Checklist, room for parking', text: 'Gates must open inwards.', source: 'check' },
      drainage: { ref: 'Checklist, crossing details', text: 'Surface water must not run from the property across the highway.', source: 'check' },
      loose: { kind: 'retain', ref: 'Checklist, crossing details', text: 'Loose material within 1 m of the road or footway must be held back; a paved strip helps.', source: 'check' },
      ownership: { ref: 'Checklist, property ownership', text: 'Tenants need the landlord’s written permission; crossing private land needs the landowner’s.', source: 'check' },
    },
    planning: [
      { when: 'classified', text: 'Hampshire refuses a crossing on to an A, B or C road without proof of planning permission.', source: 'check' },
      { when: 'list', text: 'It advises asking the planning authority about impermeable hard standing, conservation areas, listed buildings, flats and maisonettes, non-domestic access and removed permitted development rights.', source: 'page' },
    ],
    notes: [
      { text: 'Fees rose on 1 April 2026; applications made before then were not affected.', source: 'page' },
      { text: 'Crossings on unadopted roads need no approval from the council.', source: 'page' },
    ],
    sample: { depth: 5.2, width: 4.4, footway: 1.8, verge: 1.4, junction: 18, wall: 0.45, tree: { dist: 4.2, circ: 0.8 }, lamp: 4 },
  };
});
