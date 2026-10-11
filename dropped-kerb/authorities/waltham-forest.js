/* Dropped Kerb Check: the London Borough of Waltham Forest, the highway authority for the borough's roads; on
 * Transport for London's red routes TfL is (see national.js, nat.tlrn).
 * Read on 11 October 2026: the council's dropped kerbs page (last updated 27 May 2026), its Vehicle Crossover
 * Application Guidance (file of 26 May 2026) and its Domestic Vehicle Crossover Policy (March 2022).
 * Facts and figures with citations; no copied text. */
(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory();
  else (root.DKAuth = root.DKAuth || {})['waltham-forest'] = factory();
})(typeof self !== 'undefined' ? self : this, function () {
  'use strict';
  const CHECKED = '2026-10-11';
  return {
    slug: 'waltham-forest', name: 'London Borough of Waltham Forest', short: 'Waltham Forest', kind: 'london',
    area: 'Waltham Forest, except Transport for London’s red routes. The borough is also the planning authority.',
    checked: CHECKED, version: 'waltham-forest-2026-10-11.1',
    sources: {
      page: { label: 'London Borough of Waltham Forest, Dropped kerbs (last updated 27 May 2026)', short: 'LBWF dropped kerbs page', url: 'https://www.walthamforest.gov.uk/parking-roads-and-travel/roads-and-pavements/dropped-kerbs', checked: CHECKED },
      guide: { label: 'London Borough of Waltham Forest, Vehicle Crossover Application Guidance', short: 'LBWF application guidance', url: 'https://www.walthamforest.gov.uk/media/11469', checked: CHECKED },
      policy: { label: 'London Borough of Waltham Forest, Domestic Vehicle Crossover Policy (March 2022)', short: 'LBWF policy 2022', url: 'https://www.walthamforest.gov.uk/media/3998', checked: CHECKED },
    },
    process: {
      url: 'https://www.walthamforest.gov.uk/parking-roads-and-travel/roads-and-pavements/dropped-kerbs',
      builder: 'council', builderText: 'The council builds every crossover with its term contractor, after full payment and once your front garden works are finished.',
      decision: 'An officer visits and, if suitable, emails an estimate; the frontage must be finished to the policy within 3 months of a provisional approval.',
      valid: 'Estimates are valid for 3 months.',
      review: 'The decision is final; there is no appeal.',
      evidence: 'Every applicant signs a conditional legal agreement, registered as a local land charge, that binds later owners.',
      source: 'guide',
    },
    fees: [
      { id: 'application', label: 'Application fee', amount: 475, refundable: false, source: 'page' },
      { id: 'legal', label: 'Conditional legal agreement', amount: 400, refundable: false, stage: 'proceed', source: 'page' },
    ],
    works: { kind: 'rate', perM2: 600, text: 'Construction is charged per square metre of crossover', source: 'page', extra: 'In a controlled parking zone the traffic order change costs at least £3,500 (the guidance also gives £3,660), with no refund and no guarantee.' },
    rules: {
      depth: { perp: 4.8, ref: 'Guidance, A1; policy, front garden depth', text: 'At least 4.8 m at right angles from the boundary to the nearest part of the house, counting steps, bays and planters.', source: 'guide' },
      width: { perp: 2.5, ref: 'Guidance, A4 (minimum width at the back of the footway)', text: 'The crossover is at least 2.5 m wide at the back of the footway (3.5 m on the kerb line) and at most 3.5 m (4.5 m on the kerb line) for one property.', source: 'guide' },
      crossing: { text: 'At least 2.5 m at the back of the footway and 3.5 m on the kerb line, at most 3.5 m and 4.5 m; the council fixes the size and position.', rear: 2.5, length: 3.5, maxRear: 3.5, maxLength: 4.5, ref: 'Guidance, A4', source: 'guide' },
      junction: { min: 10, absolute: 8, strict: true, ref: 'Guidance, A6', text: 'At least 10 m from any junction, side road or commercial access; 8 m at the very least, on safety grounds.', source: 'guide' },
      tree: { kind: 'fixed', min: 2, strict: true, ref: 'Guidance, A9; policy, trees', text: 'At least 2 m from the base of a tree to the top of the ramped kerb; healthy trees are not removed, and a tree with a preservation order means likely refusal.', source: 'guide' },
      lamp: { min: 1, within: 'move', ref: 'Guidance, A8', text: 'Lamp columns, posts, bollards, signs, poles, vent pipes and utility plant at least 1 m from the top of the ramped kerb; nearer items can be moved at your full expense.', source: 'guide' },
      furniture: { min: 1, within: 'move', ref: 'Guidance, A8', source: 'guide' },
      verge: { max: 3, ref: 'Guidance, A7', text: 'Grass verges or planted areas in front of the property must be less than 3 m deep in total.', source: 'guide' },
      door: { kind: 'refuse', ref: 'Guidance, A14; policy, siting', text: 'Not where the only space is directly in front of the main door, following London Fire Brigade advice; the parked car stays at least 1 m from any door.', source: 'guide' },
      soft: { min: 0.5, ref: 'Guidance, A3; policy, permeable hardstanding', text: 'At least half of the front area must stay soft landscaping: lawn, beds or borders, not tubs.', source: 'guide' },
      surfacePermeable: { minArea: 0, ref: 'Guidance, C3', text: 'All hard standing where a car parks must be permeable; a surface water test is done with an officer before construction.', source: 'guide' },
      loose: { kind: 'size', min: 0.02, border: 1, ref: 'Policy, permeable hardstanding', text: 'No unbound gravel under 20 mm; larger gravel needs a 1 m border at the threshold.', source: 'policy' },
      bays: { marked: 'check', cpz: 'check', ref: 'Guidance, A13; policy, parking arrangements', text: 'In a controlled parking zone removing a space needs a traffic order change after consultation; losing more than one on-street space counts as an adverse impact.', source: 'guide' },
      second: { kind: 'gap', gap: 4.8, ref: 'Policy, dimensions', text: 'A larger property may have two crossings with at least 4.8 m of undropped kerb between them, and usually a wall or fence between the entrances.', source: 'policy' },
      straightIn: { ref: 'Guidance, A5', text: 'The car must enter and leave at right angles in one movement, with no adjusting on the highway.', source: 'guide' },
      gates: { ref: 'Guidance, A11 (Highways Act 1980, s.153)', text: 'Gates must not open outwards over the footway or road; on principal roads gates are unlikely to be allowed.', source: 'guide' },
      drainage: { ref: 'Policy, permeable hardstanding', text: 'Water must not drain on to the highway: fall back to a soakaway or planting, or a channel at the threshold.', source: 'policy' },
      ownership: { ref: 'Dropped kerbs page, who can apply', text: 'You must own the property; tenants and leaseholders need written consent from the housing section, estate management or landlord.', source: 'page' },
    },
    planning: [
      { when: 'list', text: 'Waltham Forest says planning permission is needed on a classified road, for a listed building, a flat or maisonette, in a conservation area, or for more than 5 m² of non-permeable surface; it can advise when you apply.', source: 'page' },
    ],
    notes: [
      { text: 'If any part of a car sits beside the fully flat section of a dropped kerb, a penalty charge can be issued; not beside the sloping part alone.', source: 'page' },
      { text: 'Driving over a kerb without a crossover can lead to a formal notice; ignoring it risks a fine of up to £1,000 plus the council’s costs.', source: 'page' },
    ],
    sample: { depth: 5.2, width: 4.4, footway: 2.2, verge: 0, junction: 28, wall: 0.6, tree: { dist: 3.0, circ: 0.8 }, lamp: 2.4, soft: 0.55 },
  };
});
