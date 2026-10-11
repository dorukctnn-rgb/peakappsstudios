/* Dropped Kerb Check: Essex County Council (Essex Highways), the highway authority for Essex except Southend-on-Sea
 * and Thurrock (each its own highway authority).
 * Read on 11 October 2026: the vehicle crossings page, the vehicle crossing criteria page and the terms and
 * conditions on essexhighways.org. The pages showed the fee as "£" with no amount, in the raw page and in a browser,
 * so this file has no fee: the tool says so instead of guessing. No council page is published for Essex until the
 * fee can be read. Facts and figures with citations; no copied text. */
(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory();
  else (root.DKAuth = root.DKAuth || {}).essex = factory();
})(typeof self !== 'undefined' ? self : this, function () {
  'use strict';
  const CHECKED = '2026-10-11';
  return {
    slug: 'essex', name: 'Essex County Council (Essex Highways)', short: 'Essex', kind: 'county', noPage: true,
    area: 'Essex, except Southend-on-Sea and Thurrock, which are their own highway authorities. The district and borough councils decide planning.',
    checked: CHECKED, version: 'essex-2026-10-11.1',
    sources: {
      page: { label: 'Essex Highways, Vehicle crossings / dropped kerbs', short: 'Essex Highways page', url: 'https://www.essexhighways.org/vehicle-crossings-dropped-kerbs', checked: CHECKED },
      criteria: { label: 'Essex Highways, Vehicle crossing criteria', short: 'Essex criteria', url: 'https://www.essexhighways.org/vehicle-crossing-criteria', checked: CHECKED },
      terms: { label: 'Essex Highways, Vehicle crossing terms and conditions', short: 'Essex terms', url: 'https://www.essexhighways.org/applications/vehicle-crossings-dropped-kerbs/terms-and-conditions', checked: CHECKED },
    },
    process: {
      url: 'https://www.essexhighways.org/vehicle-crossings-dropped-kerbs',
      builder: 'contractor', builderText: 'Two stages: you apply for consent; your chosen contractor, with £10 million public liability insurance, then applies to implement it by road opening notice and books the road space.',
      decision: 'An inspector visits and either grants preliminary consent or declines with reasons.',
      valid: 'Works must be finished within six months of approval.',
      review: 'The council explains a refusal in writing; the initial fee is non-refundable.',
      source: 'page',
    },
    fees: [],
    feeMissing: 'The Essex Highways pages showed the fee as “£” with no amount when read on 11 October 2026. Ask Essex Highways for the current fee before you apply; it is non-refundable.',
    works: { kind: 'quote', text: 'Your contractor quotes for the works and pays the road opening notice fee.', source: 'page' },
    rules: {
      depth: { perp: 5, ref: 'Criteria', text: 'The parking space must be 5 m deep at about right angles to the road and 2.5 m wide; below 5 m, do not apply, as the fee is not refunded.', source: 'criteria' },
      width: { perp: 2.5, ref: 'Criteria', source: 'criteria' },
      crossing: { text: 'For one property, 4 to 5 dropped kerbs (3.6 to 4.5 m) plus 2 ramp kerbs (1.8 m); a crossing shared with a neighbour, 8 to 10 dropped kerbs plus 2 ramps.', kerbs: 4, tapers: 2, ref: 'Criteria', source: 'criteria' },
      junction: { kind: 'safe', ref: 'Criteria', text: 'The crossing must be in a safe position with adequate visibility; no distance is published.', source: 'criteria' },
      tree: { kind: 'mature', ref: 'Criteria', text: 'A crossing that removes a mature tree is likely to be refused.', source: 'criteria' },
      lamp: { kind: 'move', ref: 'Vehicle crossings page, reasons for decline', text: 'Being too close to street lights, bus stops and other furniture is a reason to decline.', source: 'page' },
      furniture: { kind: 'move', ref: 'Criteria', text: 'Covers or gullies in the way can mean expensive utility work.', source: 'criteria' },
      busStop: { kind: 'conflict', ref: 'Criteria', text: 'Likely refused where it interferes with a bus stop.', source: 'criteria' },
      pedCrossing: { kind: 'conflict', ref: 'Criteria', text: 'Likely refused where it interferes with a pedestrian crossing.', source: 'criteria' },
      bays: { marked: 'check', disabled: 'fail', layby: 'fail', ref: 'Criteria', text: 'Likely refused at a disabled parking bay or in a lay-by; in residents’ parking you cannot stop people parking across the drive without a costly order change.', source: 'criteria' },
      verge: { kind: 'large', ref: 'Criteria', text: 'Likely refused across large verges or ornamental areas.', source: 'criteria' },
      second: { kind: 'gap', gap: 5, unclassifiedOnly: true, ref: 'Criteria', text: 'A second crossing only on an unclassified road, with 5 m of full-height kerb between the two.', source: 'criteria' },
      ownership: { ref: 'Criteria', text: 'You must show you control the land from the property to the highway; a strip owned by others needs their consent.', source: 'criteria' },
    },
    planning: [
      { when: 'classified', text: 'Essex says an A, B or Class III road needs planning permission before you apply; Harlow and Epping Forest council housing areas also need their own consent.', source: 'page' },
    ],
    notes: [],
    sample: { depth: 5.4, width: 3.4, footway: 2.0, verge: 0.8, junction: 20, wall: 0.5, tree: null, lamp: 3 },
  };
});
