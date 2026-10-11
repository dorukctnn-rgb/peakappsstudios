/* Dropped Kerb Check: Leeds City Council, the highway authority for Leeds.
 * Read on 11 October 2026: the council's page "Request a vehicle crossing outside your house". Leeds publishes few
 * measured criteria; everything it does not publish is shown as a point the inspector decides on site.
 * Facts and figures with citations; no copied text. */
(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory();
  else (root.DKAuth = root.DKAuth || {}).leeds = factory();
})(typeof self !== 'undefined' ? self : this, function () {
  'use strict';
  const CHECKED = '2026-10-11';
  return {
    slug: 'leeds', name: 'Leeds City Council', short: 'Leeds', kind: 'metropolitan',
    area: 'Leeds. The city council is both the highway authority and the planning authority.',
    checked: CHECKED, version: 'leeds-2026-10-11.1',
    sources: {
      page: { label: 'Leeds City Council, Request a vehicle crossing outside your house', short: 'LCC vehicle crossing page', url: 'https://www.leeds.gov.uk/parking-roads-and-travel/vehicle-crossings-accessible-dropped-kerbs-disabled-parking-bays/request-vehicle-crossing', checked: CHECKED },
    },
    process: {
      url: 'https://www.leeds.gov.uk/parking-roads-and-travel/vehicle-crossings-accessible-dropped-kerbs-disabled-parking-bays/request-vehicle-crossing',
      builder: 'contractor', builderText: 'You hire a New Roads and Street Works Act accredited contractor, who applies for a Section 171 licence to dig in the highway.',
      decision: 'A highways inspector contacts you, takes the inspection fee, visits, and sends a commencement letter if every requirement is met.',
      valid: 'Not stated on the page.',
      review: 'Not stated on the page; there is no guarantee a crossing will be permitted.',
      source: 'page',
    },
    fees: [
      { id: 'application', label: 'Site inspection fee', amount: 55.06, refundable: false, source: 'page' },
      { id: 'licence', label: 'Section 171 licence (your contractor applies)', amount: 345.90, refundable: false, stage: 'proceed', source: 'page' },
    ],
    works: { kind: 'average', amount: 1500, text: 'A standard crossing usually costs around', source: 'page' },
    rules: {
      depth: { perp: 5, ref: 'Before you apply', text: 'At least 5 m between the boundary and the house, for a hard standing inside the property.', source: 'page' },
      tree: { kind: 'assess', ref: 'Before you apply', text: 'If a tree is in the way, contact the forestry team before applying.', source: 'page' },
      lamp: { kind: 'move', ref: 'Additional charges', text: 'A street lamp, BT column or similar in the way may be moved by its owner, for a charge.', source: 'page' },
      furniture: { kind: 'move', ref: 'Additional charges', source: 'page' },
      ownership: { ref: 'Before you apply', text: 'Council tenants, and owners of former council homes, need the local housing office’s permission first.', source: 'page' },
    },
    planning: [
      { when: 'classified', text: 'Leeds says access from an A, B or C road, or across land that is not highway, needs approval from planning services.', source: 'page' },
    ],
    notes: [],
    sample: { depth: 5.4, width: 3.2, footway: 1.9, verge: 0, junction: 20, wall: 0.8, tree: null, lamp: 6 },
  };
});
