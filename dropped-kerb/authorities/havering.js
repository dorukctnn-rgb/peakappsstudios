/* Dropped Kerb Check: the London Borough of Havering, the highway authority for the borough's roads; on Transport for
 * London's red routes TfL is (see national.js, nat.tlrn).
 * Read on 11 October 2026: the council's "Apply for a dropped kerb" page (fee) and its Domestic Vehicle Dropped Kerb
 * Policy (April 2023, version 1.0, effective from April 2023). Facts and figures with citations; no copied text. */
(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory();
  else (root.DKAuth = root.DKAuth || {}).havering = factory();
})(typeof self !== 'undefined' ? self : this, function () {
  'use strict';
  const CHECKED = '2026-10-11';
  return {
    slug: 'havering', name: 'London Borough of Havering', short: 'Havering', kind: 'london',
    area: 'Havering, except Transport for London’s red routes. The borough is also the planning authority.',
    checked: CHECKED, version: 'havering-2026-10-11.1',
    sources: {
      page: { label: 'London Borough of Havering, Apply for a dropped kerb', short: 'LBH application page', url: 'https://www.havering.gov.uk/parking-2/apply-dropped-kerb', checked: CHECKED },
      policy: { label: 'London Borough of Havering, Domestic Vehicle Dropped Kerb Policy (April 2023)', short: 'LBH policy 2023', url: 'https://www.havering.gov.uk/downloads/file/5746/dropped-kerb-and-vehicle-crossover-policy', checked: CHECKED },
    },
    process: {
      url: 'https://www.havering.gov.uk/parking-2/apply-dropped-kerb',
      builder: 'council', builderText: 'Only the council and its approved contractor build crossings in the borough; a kerb dropped by anyone else is removed at your expense.',
      decision: 'The council inspects and sends a quote with an estimated timescale; standard crossings are installed within 16 weeks of the application, those funded for disability within 4 to 6 weeks of approval.',
      valid: 'Quotes are valid for 3 months; after that a new application and fee are needed.',
      review: 'Refusal reasons are given in writing; appeals go through the council’s complaints process.',
      source: 'policy',
    },
    fees: [
      { id: 'application', label: 'Application fee', amount: 261, refundable: false, note: 'Covers up to three site visits.', source: 'page' },
    ],
    works: { kind: 'quote', text: 'The council quotes after the inspection; the online form has an estimate calculator.', source: 'page' },
    rules: {
      depth: { perp: 4.8, relaxed: 4.6, relaxedWidth: 3, ref: 'Policy, 3.10.1(a)', text: 'The off-street space must be 2.4 m wide by 4.8 m deep inside the property; with at least 3 m of width the depth can drop to 4.6 m at the very least. There must be clear access to the front door.', source: 'policy' },
      width: { perp: 2.4, ref: 'Policy, 3.10.1(a)', source: 'policy' },
      crossing: { text: 'The standard is 4.5 m along the kerb: two 0.9 m ramp kerbs and 2.7 m of dropped kerb, cut to 4.2 m (2.4 m dropped) only where the site forces it.', length: 4.5, ref: 'Policy, 3.10.1(d)', source: 'policy' },
      junction: { min: 10, strict: true, ref: 'Policy, 3.12.1', text: 'Not approved within 10 m of a junction, or where it affects a width restriction, island, refuge, pinch point or the zig-zags of a crossing.', source: 'policy' },
      speed: { min: 40, effect: 'refuse', ref: 'Policy, 3.12.1', text: 'Not approved on a street with a posted limit of 40 mph or more.', source: 'policy' },
      tree: { kind: 'circ', factor: 4, strict: false, ref: 'Policy, 3.13', text: 'Street trees are not removed, except on an arboricultural report; the precautionary area is 4 times the girth at 1.5 m, and all tree costs fall on you.', source: 'policy' },
      lamp: { min: 1.5, within: 'move', ref: 'Policy, 3.14', text: 'A lamp column should be at least 1.5 m from the foot of the transition kerb; a move goes to the street lighting team and is refused if it cannot be done.', source: 'policy' },
      furniture: { min: 0.45, within: 'fail', ref: 'Policy, 3.16.3', text: 'At least 0.45 m from the base of a telegraph pole, cable or BT cabinet or other furniture on the footway.', source: 'policy' },
      busStop: { kind: 'paved', ref: 'Policy, 3.12.2', text: 'Near a bus stop with a block-paved footway, likely refused.', source: 'policy' },
      pedCrossing: { zigzag: 'fail', ref: 'Policy, 3.12.1', source: 'policy' },
      bays: { marked: 'check', cpz: 'check', ref: 'Policy, 3.15 and 3.18', text: 'Footway parking bays are removed; in a controlled parking zone, or where parking stress is high, a loss of on-street parking is generally refused.', source: 'policy' },
      verge: { kind: 'wide', ref: 'Policy, 3.4.2', text: 'Crossings needing significant construction across wide grass verges or amenity areas are refused.', source: 'policy' },
      second: { kind: 'gap', gap: 2.7, alternative: true, ref: 'Policy, 3.12.3 and 3.17', text: 'Refused where a reasonable rear or side access already exists; a new crossing must be at least 2.7 m from an existing one or join it at your expense.', source: 'policy' },
      drainage: { ref: 'Policy, 3.11 (Highways Act 1980, s.163)', text: 'Water must drain to a garden area or a channel, not on to the highway; refused without adequate drainage.', source: 'policy' },
      ownership: { ref: 'Policy, 3.3', text: 'The landowner or freeholder must consent in writing; council housing land needs the housing officer’s written approval.', source: 'policy' },
    },
    planning: [
      { when: 'list', text: 'Havering’s policy says planning approval is needed on a classified road, in a conservation area, for a listed building, and for a flat or maisonette; its website lists the roads that need it.', source: 'policy' },
    ],
    notes: [
      { text: 'Where a disability makes a crossing necessary, Adult Services may fund it.', source: 'policy' },
    ],
    sample: { depth: 5.0, width: 3.2, footway: 2.4, verge: 0, junction: 35, wall: 0.8, tree: { dist: 4.4, circ: 0.8 }, lamp: 2.2 },
  };
});
