/* Dropped Kerb Check: Surrey County Council, the highway authority for Surrey.
 * Read on 11 October 2026: the council's vehicle crossover page (costs) and its Vehicle crossover guidance for
 * householders (reviewed 22 May 2026). Facts and figures with citations; no copied text. */
(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory();
  else (root.DKAuth = root.DKAuth || {}).surrey = factory();
})(typeof self !== 'undefined' ? self : this, function () {
  'use strict';
  const CHECKED = '2026-10-11';
  return {
    slug: 'surrey', name: 'Surrey County Council', short: 'Surrey', kind: 'county',
    area: 'Surrey. The 11 district and borough councils decide planning and must confirm it in writing first.',
    checked: CHECKED, version: 'surrey-2026-10-11.1',
    sources: {
      page: { label: 'Surrey County Council, Vehicle crossovers or dropped kerbs', short: 'SCC crossover page', url: 'https://www.surreycc.gov.uk/roads-and-transport/permits-and-licences/vehicle-crossovers-or-dropped-kerbs', checked: CHECKED },
      guide: { label: 'Surrey County Council, Vehicle crossover guidance for householders (reviewed 22 May 2026)', short: 'SCC householder guidance', url: 'https://www.surreycc.gov.uk/roads-and-transport/permits-and-licences/vehicle-crossovers-or-dropped-kerbs/guidance', checked: CHECKED },
    },
    process: {
      url: 'https://www.surreycc.gov.uk/roads-and-transport/permits-and-licences/vehicle-crossovers-or-dropped-kerbs',
      builder: 'approved', builderText: 'Only the council’s approved contractors may build it. You pay the full contractor quote to the council up front (stage 2); the council inspects the work.',
      decision: 'An officer visits and marks out the crossover within 20 working days of the application.',
      valid: 'The licence is valid for 6 months.',
      review: 'You can ask for a review by a senior engineer, setting out why the criteria were applied wrongly; the aim is a reply within 10 working days, and that decision is final.',
      evidence: 'You must first get written confirmation from your district or borough council of whether planning permission is needed (it may charge, and take up to 6 weeks).',
      source: 'page',
    },
    fees: [
      { id: 'application', label: 'Application (stage 1)', amount: 383, refundable: false, note: 'Not refunded for incomplete, unsuccessful or ineligible applications.', source: 'page' },
      { id: 'remark', label: 'Re-marking the agreed crossover (optional)', amount: 116, refundable: false, optional: true, source: 'page' },
    ],
    works: { kind: 'average', amount: 1800, text: 'Average building cost with an approved contractor', source: 'page', extra: 'On lane rental roads, up to £1,500 a day at peak times (the guidance says £1,500 to £3,000 a day).' },
    rules: {
      depth: { perp: 4.8, door: 6, parallel: 2.4, parallelOnly: 'nofootway', ref: 'Guidance, space criteria table', text: 'At right angles 2.4 m by 4.8 m; end-on in front of a garage 2.4 m by 6 m; parallel 6 m by 2.4 m, only where there is no footway and no on-street parking. Measured to the nearest part of the house, including steps, bays and porches.', source: 'guide' },
      width: { perp: 2.4, parallel: 6, ref: 'Guidance, space criteria table', source: 'guide' },
      crossing: { text: 'The standard is 3 dropped kerbs with a sloping kerb (raker) each side, about 4.6 m along the kerb; a widening adds one kerb at most.', kerbs: 3, tapers: 2, ref: 'Guidance, our requirements and checks', source: 'guide' },
      junction: { kind: 'busy', ref: 'Guidance, safety criteria', text: 'Not at busy junctions where it creates conflict between road users.', source: 'guide' },
      sight: { setback: 2.4, setbackMin: 2.0, clear: [0.6, 2.0], y: { 20: 22, 30: 40, 40: 63 }, yDesirable: { 20: 25, 30: 45, 40: 70 }, ref: 'Guidance, safety criteria, table 2', text: 'From 2.4 m back from the kerb (2.0 m for a single home where 2.4 m cannot be had), a clear view between 0.6 m and 2.0 m high along the road for the Y distance: 22 to 25 m at 20 mph, 40 to 45 m at 30 mph, 63 to 70 m at 40 mph in towns.', source: 'guide' },
      tree: { kind: 'max', factor: 4, min: 1, strict: true, ref: 'Guidance, our requirements and checks', text: 'No crossover within 1 m of a tree trunk or 4 times its circumference at about 1.5 m, whichever is greater. Highway trees are not removed.', source: 'guide' },
      lamp: { min: 1, within: 'fail', ref: 'Guidance, safety criteria and checklist', text: 'Not closer than 1 m to a lamp column or any other street furniture that cannot be moved; moving a street light, where possible, costs upwards of £1,500.', source: 'guide' },
      furniture: { min: 1, within: 'fail', ref: 'Guidance, checklist', text: 'Not closer than 1 m to signs, telegraph poles, broadband cabinets or bus stops.', source: 'guide' },
      busStop: { min: 1, within: 'fail', ref: 'Guidance, checklist (bus stops are street furniture)', source: 'guide' },
      gradient: { max: 1 / 12, scope: 'crossing', ref: 'Guidance, safety criteria', text: 'Refused if the slope across the footpath would be steeper than 1 in 12.', source: 'guide' },
      pedCrossing: { kind: 'conflict', ref: 'Guidance, safety criteria', text: 'Not where it conflicts with a designated pedestrian crossing point.', source: 'guide' },
      bays: { marked: 'fail', ref: 'Guidance, our requirements and checklist', text: 'A formally designated on-street parking space at or near the crossover, in a controlled parking zone or not, means refusal.', source: 'guide' },
      second: { kind: 'demand', ref: 'Guidance, our requirements and checks', text: 'A second or widened crossover may be refused where on-street parking demand is very high, unless it brings a proven safety benefit.', source: 'guide' },
      busyTurn: { ref: 'Guidance, safety criteria', text: 'On particularly busy roads, refused if cars cannot turn within the driveway.', source: 'guide' },
      drainage: { ref: 'Guidance, our requirements and checks', text: 'A non-porous hard standing must drain to a drain inside the property; over 5 m² non-porous needs planning permission.', source: 'guide' },
      loose: { kind: 'retain', ref: 'Guidance, you must check', text: 'A loose gravel drive needs a way of keeping the gravel off the highway.', source: 'guide' },
      ownership: { ref: 'Guidance, you must check', text: 'Only the freeholder can apply; tenants of a housing association upload its written authorisation.', source: 'guide' },
    },
    planning: [
      { when: 'classified', text: 'Surrey says an A, B or C road needs planning permission, and a D road may.', source: 'guide' },
      { when: 'evidence', text: 'Written evidence from the district or borough council is required either way.', source: 'guide' },
    ],
    notes: [
      { text: 'Owning an electric vehicle does not change the criteria.', source: 'page' },
      { text: 'A ditch or stream beside the road may need a pipe or bridge; the watercourse consent costs £50 and is handled in the process.', source: 'guide' },
    ],
    sample: { depth: 5.3, width: 4.2, footway: 2.2, verge: 0, junction: 30, wall: 0.55, tree: { dist: 5.5, circ: 1.0 }, lamp: 2.5 },
  };
});
