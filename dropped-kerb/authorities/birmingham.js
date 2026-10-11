/* Dropped Kerb Check: Birmingham City Council, the highway authority for Birmingham.
 * Read on 11 October 2026: the council's "Apply for a dropped kerb" pages 1 to 6 (the cost page updated 1 April 2026)
 * and its Dropped Crossings Policy (2026), version 3.0 (12 February 2026). Facts and figures with citations; no
 * copied text. */
(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory();
  else (root.DKAuth = root.DKAuth || {}).birmingham = factory();
})(typeof self !== 'undefined' ? self : this, function () {
  'use strict';
  const CHECKED = '2026-10-11';
  const P = 'https://www.birmingham.gov.uk/info/20109/parking/660/apply_for_a_dropped_kerb';
  return {
    slug: 'birmingham', name: 'Birmingham City Council', short: 'Birmingham', kind: 'metropolitan',
    area: 'Birmingham. The city council is both the highway authority and the planning authority.',
    checked: CHECKED, version: 'birmingham-2026-10-11.1',
    sources: {
      what: { label: 'Birmingham City Council, Apply for a dropped kerb: what is a dropped kerb?', short: 'BCC page 1', url: P, checked: CHECKED },
      look: { label: 'Birmingham City Council, Apply for a dropped kerb: what will my dropped kerb look like?', short: 'BCC page 2', url: P + '/2', checked: CHECKED },
      req: { label: 'Birmingham City Council, Apply for a dropped kerb: application requirements', short: 'BCC page 3', url: P + '/3', checked: CHECKED },
      cost: { label: 'Birmingham City Council, Apply for a dropped kerb: how much will it cost? (updated 1 April 2026)', short: 'BCC cost page', url: P + '/4', checked: CHECKED },
      time: { label: 'Birmingham City Council, Apply for a dropped kerb: how long will it take?', short: 'BCC page 5', url: P + '/5', checked: CHECKED },
      apply: { label: 'Birmingham City Council, Apply for a new dropped kerb or extension (updated 10 December 2025)', short: 'BCC apply page', url: P + '/6', checked: CHECKED },
      policy: { label: 'Birmingham City Council, Dropped Crossings Policy (2026), version 3.0', short: 'BCC policy 2026', url: 'https://www.birmingham.gov.uk/download/downloads/id/30666/dropped_crossing_policy_and_information_for_applicants.pdf', checked: CHECKED },
    },
    process: {
      url: P + '/6',
      builder: 'council', builderText: 'Only the council can authorise a crossing, and only its authorised contractors build it; you pay in full before work, with no instalments.',
      decision: 'The policy promises a response within 25 days for a standard application; the cost pages expect a quote within 28 working days of the inspection, to accept within 2 months. Installation takes at least 16 weeks after payment, over 20 weeks with trees, utilities or street furniture.',
      valid: 'Permission is valid for 12 months from approval; an application stays open 1 year after the inspection.',
      review: 'The policy gives no right of appeal, and the application fee is not refunded.',
      source: 'policy',
    },
    fees: [
      { id: 'application', label: 'Application fee (inspection)', amount: 125, refundable: false, note: 'The cost page, updated 1 April 2026, says £125; the apply page, last updated 10 December 2025, still says £113.', source: 'cost' },
      { id: 'admin', label: 'Administration fee, if you go ahead', amount: 375, refundable: false, stage: 'proceed', source: 'cost' },
    ],
    works: { kind: 'quote', text: 'Priced for each site from the measurements, materials, labour and traffic management.', source: 'cost', extra: 'Blue Badge holders may get a discount on a standard 2.75 m crossing.' },
    rules: {
      depth: { perp: 4.75, ref: 'Policy, A1.2.2; page 3', text: 'At least 4.75 m from the back of the footway to the furthest-forward part of the property, including retaining walls; smaller frontages are refused.', source: 'policy' },
      width: { perp: 2.75, two: 4.5, ref: 'Policy, A1.2.2', text: 'One car space 2.75 m wide, two spaces 4.5 m.', source: 'policy' },
      crossing: { text: 'The standard crossing is 2.75 m, three dropped kerbs and two tapered kerbs (4.5 m at the kerb edge); narrower is never approved. Combined crossings of 9 m or more need a full-height kerb between them.', kerbs: 3, tapers: 2, rearMin: 2.75, ref: 'Policy, A1.3.1 to A1.3.4', source: 'policy' },
      junction: { kind: 'near', ref: 'Policy, A1.1.4', text: 'Applications near an existing junction, at or near roundabouts, near traffic signals with regular queues or on fast roads may be refused; no distance is given.', source: 'policy' },
      sight: { kind: 'adequate', ref: 'Policy, A1.1.2 and A1.1.3', text: 'There must be adequate sightlines; reversing on or off may be accepted depending on visibility, traffic and road width.', source: 'policy' },
      tree: { kind: 'assess', ref: 'Policy, A1.4.4 and A1.4.5; page 3', text: 'A healthy, well-established or protected tree nearby is a reason to refuse; a tree officer assesses any nearby tree, which can take 6 weeks or more. If removal is approved you pay for removal and replanting.', source: 'policy' },
      lamp: { min: 0.45, within: 'assess', ref: 'Policy, A1.4.2 and A1.4.4', text: 'Street furniture or utility equipment more than 450 mm from the works is unlikely to obstruct; lighting columns, signals and crossings inside get a technical assessment, and any move is charged.', source: 'policy' },
      furniture: { min: 0.45, within: 'assess', ref: 'Policy, A1.4.2', source: 'policy' },
      busStop: { kind: 'conflict', ref: 'Policy, A1.1.4', text: 'May be refused at a bus stop where it would interfere with passengers or visibility.', source: 'policy' },
      gradient: { max: 0.1, scope: 'driveway', ref: 'Page 2; page 3', text: 'No crossing where the parking area is steeper than 1 in 10 (10 cm of rise or fall per metre).', source: 'look' },
      pedCrossing: { zigzag: 'check', ref: 'Policy, A1.1.4', text: 'May be refused within the zig-zags of a pedestrian crossing or beside a refuge or island that restricts turning.', source: 'policy' },
      bays: { marked: 'check', ref: 'Policy, 6.7', text: 'Changing yellow lines, red routes, disabled or parking bays is charged and needs a traffic order amendment.', source: 'policy' },
      calming: { effect: 'check', ref: 'Policy, 6.6', text: 'Changing humps, cushions or tables is charged if approved.', source: 'policy' },
      verge: { kind: 'environment', ref: 'Policy, A1.4.6', text: 'Applications that need a grass verge removed are likely to be rejected.', source: 'policy' },
      second: { kind: 'frontage', frontage: 12, ref: 'Policy, A1.3.5', text: 'Normally one crossing per property; a second only with a frontage of at least 12 m giving separate entry and exit.', source: 'policy' },
      gates: { ref: 'Policy, A1.3.7', text: 'Gates must open inwards (Highways Act 1980, s.153(1)).', source: 'policy' },
      drainage: { ref: 'Page 3', text: 'Water must not flow from the property across the pavement; build a permeable hard standing before the crossing.', source: 'req' },
      surfacePermeable: { minArea: 0, ref: 'Page 3', text: 'After approval you must build a suitable permeable hard standing, such as porous tarmac or concrete, slabs or block paving.', source: 'req' },
      loose: { kind: 'strip', strip: 0.5, ref: 'Policy, A1.2.7', text: 'Gravel drives need a 0.5 m strip of solid surfacing at the footway.', source: 'policy' },
      ownership: { ref: 'Policy, 2.3; page 3', text: 'The owner applies; tenants need written permission from the landlord, housing officer or housing association.', source: 'policy' },
    },
    planning: [
      { when: 'list', text: 'Birmingham’s policy says planning permission is required for a flat, maisonette or larger shared house, a listed building or a conservation area, a classified road, a verge that is not highway, or over 5 m² of non-permeable driveway.', source: 'policy' },
    ],
    notes: [
      { text: 'A white H marking or disabled bay marking can be requested separately.', source: 'req' },
    ],
    sample: { depth: 5.1, width: 3.4, footway: 2.4, verge: 0, junction: 40, wall: 0.7, tree: null, lamp: 1.8 },
  };
});
