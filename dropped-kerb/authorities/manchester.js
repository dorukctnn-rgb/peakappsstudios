/* Dropped Kerb Check: Manchester City Council, the highway authority for Manchester.
 * Read on 11 October 2026: the council's pages "Dropped kerbs: definition and requirements" and "Apply".
 * Facts and figures with citations; no copied text. */
(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory();
  else (root.DKAuth = root.DKAuth || {}).manchester = factory();
})(typeof self !== 'undefined' ? self : this, function () {
  'use strict';
  const CHECKED = '2026-10-11';
  const P = 'https://www.manchester.gov.uk/parking/parking-at-your-home/dropped-kerbs-definition-and-requirements';
  return {
    slug: 'manchester', name: 'Manchester City Council', short: 'Manchester', kind: 'metropolitan',
    area: 'Manchester. The city council is both the highway authority and the planning authority.',
    checked: CHECKED, version: 'manchester-2026-10-11.1',
    sources: {
      req: { label: 'Manchester City Council, Dropped kerbs: definition and requirements', short: 'MCC requirements page', url: P, checked: CHECKED },
      apply: { label: 'Manchester City Council, Dropped kerbs: apply', short: 'MCC apply page', url: P + '/apply', checked: CHECKED },
    },
    process: {
      url: P + '/apply',
      builder: 'council', builderText: 'The council assesses the application, tells you about any planning permission needed, then quotes; you pay before it starts work.',
      decision: 'Not stated. An application closes 90 days after the approval and cost if you do not reply.',
      valid: 'Applications stay open for 90 days from the application date.',
      review: 'Not stated on the pages.',
      source: 'req',
    },
    fees: [],
    works: { kind: 'from', amount: 1575, text: 'A new dropped kerb, about 3 m wide and up to 2 m towards the property, starts at', source: 'req', extra: 'Wider kerbs, deeper crossings, verges and obstructions cost more.' },
    rules: {
      depth: { perp: 4.8, parallel: 3, ref: 'Requirements, parking area', text: 'At least 4.8 m deep by 3.5 m wide for pulling straight on and off, or 3 m deep by 6 m wide for side-on parking; meeting this does not guarantee approval.', source: 'req' },
      width: { perp: 3.5, parallel: 6, ref: 'Requirements, parking area', source: 'req' },
      crossing: { text: 'The minimum new dropped kerb is about 3 m wide.', length: 3, ref: 'Requirements, crossing and costs', source: 'req' },
      tree: { kind: 'canopy', ref: 'Requirements, trees', text: 'Any work under a tree’s branches needs the arboriculture team’s permission, which can move the access; the council will not damage a tree for a dropped kerb.', source: 'req' },
      lamp: { kind: 'move', ref: 'Requirements, crossing and costs', text: 'Obstructions that have to be removed cost extra.', source: 'req' },
      furniture: { kind: 'move', ref: 'Requirements, crossing and costs', source: 'req' },
      verge: { kind: 'cost', ref: 'Requirements, verge and unadopted areas', text: 'Going through a grass verge is the most expensive kind; land that is not adopted highway needs planning permission and its owner’s consent.', source: 'req' },
      surfacePermeable: { minArea: 0, ref: 'Requirements, planning', text: 'All driveways must be built in permeable material.', source: 'req' },
      ownership: { ref: 'Requirements, verge and unadopted areas', text: 'Crossing land that is not adopted highway needs the owner’s permission.', source: 'req' },
    },
    planning: [
      { when: 'classified', text: 'Manchester says planning permission is required for every dropped kerb on a road that is not unclassified, including its key route network.', source: 'req' },
      { when: 'list', text: 'A new driveway, or removing a wall or fence, may need planning permission too; send the approval with the application.', source: 'req' },
    ],
    notes: [],
    sample: { depth: 5.2, width: 3.8, footway: 2.0, verge: 1.2, junction: 25, wall: 0.6, tree: { dist: 5, circ: 0.9 }, lamp: 4 },
  };
});
