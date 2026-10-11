/* Dropped Kerb Check: Hertfordshire County Council, the highway authority for Hertfordshire. Broxbourne Borough
 * Council handles dropped kerbs in its own borough.
 * Read on 11 October 2026: the council's dropped kerbs page, its Residential Dropped Kerbs Policy (version 7,
 * 8 May 2026) and its pedestrian visibility splay guidance (May 2026). Facts and figures with citations; no copied text. */
(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory();
  else (root.DKAuth = root.DKAuth || {}).hertfordshire = factory();
})(typeof self !== 'undefined' ? self : this, function () {
  'use strict';
  const CHECKED = '2026-10-11';
  return {
    slug: 'hertfordshire', name: 'Hertfordshire County Council', short: 'Hertfordshire', kind: 'county',
    area: 'Hertfordshire, except Broxbourne borough, where Broxbourne Borough Council handles dropped kerbs. The district and borough councils decide planning.',
    checked: CHECKED, version: 'hertfordshire-2026-10-11.1',
    sources: {
      page: { label: 'Hertfordshire County Council, Dropped kerbs', short: 'HCC dropped kerbs page', url: 'https://www.hertfordshire.gov.uk/services/highways-roads-and-pavements/changes-to-your-road/dropped-kerbs/dropped-kerbs.aspx', checked: CHECKED },
      policy: { label: 'Hertfordshire County Council, Residential Dropped Kerbs Policy, version 7 (8 May 2026)', short: 'HCC policy v7', url: 'https://www.hertfordshire.gov.uk/media-library/documents/highways/dropped-kerb-policy.pdf', checked: CHECKED },
      splay: { label: 'Hertfordshire County Council, Pedestrian visibility splay guidance (May 2026)', short: 'HCC splay guidance', url: 'https://www.hertfordshire.gov.uk/doc/highways/change/ped-splay-guidance.pdf', checked: CHECKED },
    },
    process: {
      url: 'https://www.hertfordshire.gov.uk/services/highways-roads-and-pavements/changes-to-your-road/dropped-kerbs/dropped-kerbs.aspx',
      builder: 'council', builderText: 'Only the county council’s contractor builds dropped kerbs. If approved you get a quote and a drawing; works follow 12 to 14 weeks after you pay.',
      decision: 'The assessment starts after a 14-day cooling-off period and aims to finish within 6 to 8 weeks.',
      valid: 'The approval and quotation are valid for 6 months.',
      review: 'A senior manager reviews every refusal before it is sent. You can appeal in writing within six months if you think the policy was applied wrongly, not because you disagree with it.',
      source: 'policy',
    },
    fees: [
      { id: 'application', label: 'Assessment fee', amount: 139, refundable: 'cooling', note: 'Refunded in full if you cancel within 14 days of paying; non-refundable after that.', source: 'page' },
    ],
    works: { kind: 'quote', text: 'The council quotes for the works after the assessment; its online estimate tool gives a guide for a standard crossing.', source: 'page' },
    rules: {
      depth: { perp: 5, parallel: 3.5, ref: 'Policy, things you should consider', text: 'The parking area must be at least 5 m deep and 2.7 m wide, counting bay windows, porches, utility cabinets and EV chargers; parallel parking needs 9.6 m by 3.5 m and is likely refused where there is a pavement and a verge.', source: 'policy' },
      width: { perp: 2.7, parallel: 9.6, ref: 'Policy, things you should consider', source: 'policy' },
      crossing: { text: 'At most 4 flat kerbs (3.6 m) for one property, with one or two ramped kerbs; a double crossing for two properties gets 6 flat kerbs.', kerbs: 4, tapers: 2, maxFlat: 3.6, ref: 'Policy, things you should consider', source: 'policy' },
      junction: { min: 10, major: 15, strict: true, ref: 'Policy, position of the access', text: 'At least 10 m from a junction on either side; the officer may raise this to 15 m.', source: 'policy' },
      pedSplay: { kind: 'centre', half: 2, into: 2, h: 0.6, strict: true, ref: 'Pedestrian visibility splay guidance', text: 'A triangle from the centre of the access at the back of the footway, 2 m into the drive and 2 m to each side along the footway, with nothing above 0.6 m inside it.', source: 'splay' },
      tree: { kind: 'stem', min: 2, strict: true, ref: 'Policy, trees', text: 'Highway trees are not removed. Work inside a root protection area needs a tree officer’s assessment, paid in advance, and hand digging; never within 2 m of the stem, and not near a tree with a preservation order or in a conservation area.', source: 'policy' },
      lamp: { min: 1, within: 'fail', ref: 'Policy, question 9', text: 'No dropped kerb within 1 m of an existing street light; where a move is possible you pay for it.', source: 'policy' },
      furniture: { kind: 'covers', ref: 'Policy, utility covers and cabinets', text: 'Covers may be altered in the works; cabinets cannot be moved by the council, and the utility company may refuse, in which case the fee is not refunded.', source: 'policy' },
      busStop: { kind: 'nomove', ref: 'Policy, bus stops', text: 'Bus stops are not moved for a dropped kerb, unless your planning permission includes moving it.', source: 'policy' },
      gradient: { max: 0.1, scope: 'driveway', ref: 'Policy, gradient', text: 'The driveway, parking area and the dropped kerb itself must be no steeper than 1 in 10.', source: 'policy' },
      pedCrossing: { kind: 'signals', ref: 'Policy, traffic lights and crossings', text: 'Must not affect traffic lights or a pedestrian crossing, and you must be able to see the signal head from the car.', source: 'policy' },
      bays: { marked: 'fail', layby: 'fail', cpz: 'check', ref: 'Policy, laybys, marked bays and controlled parking zones', text: 'A designated layby or marked bay at the access means refusal; in a controlled parking zone you need the district council’s agreement and pay for any order change.', source: 'policy' },
      verge: { kind: 'amenity', ref: 'Policy, introduction', text: 'Crossings over large areas of amenity grass that would harm the street scene are not approved.', source: 'policy' },
      second: { kind: 'never', ref: 'Policy, second dropped kerbs', text: 'No second dropped kerbs: one access point per property. A widened kerb stops at 4 flat kerbs and is refused if it costs on-street parking.', source: 'policy' },
      speed: { min: 40, effect: 'turning', ref: 'Policy, fast roads', text: 'On a road with a limit of 40 mph or more, only approved with room to turn the car round inside the property.', source: 'policy' },
      drainage: { ref: 'Policy, question 14', text: 'No surface water from the drive on to the pavement, road or a highway drain.', source: 'policy' },
      surfacePermeable: { minArea: 5, ref: 'Policy, question 13', text: 'Driveways over 5 m² must be permeable; loose gravel needs a way of keeping it off the pavement.', source: 'policy' },
      loose: { kind: 'retain', ref: 'Policy, question 13', source: 'policy' },
      ownership: { ref: 'Policy, consent from the landowner', text: 'Tenants need the landowner’s approval first, and any strip of land between the boundary and the highway needs its owner’s consent.', source: 'policy' },
    },
    planning: [
      { when: 'classified', text: 'Hertfordshire says planning permission is normally needed off an A, B or C road, and for commercial sites, flats or maisonettes; get it before you apply.', source: 'policy' },
      { when: 'local', text: 'Letchworth Garden City needs the Heritage Foundation’s consent and Welwyn Garden City the Estate Management Scheme’s, before you apply.', source: 'page' },
    ],
    notes: [
      { text: 'A records check on an existing dropped kerb costs £25; an assessment if no record is found costs £139.', source: 'page' },
      { text: 'Whether you have an electric vehicle or not, the policy is applied the same way.', source: 'policy' },
    ],
    sample: { depth: 5.4, width: 4.0, footway: 2.0, verge: 0, junction: 22, wall: 0.9, tree: { dist: 7, circ: 1.1 }, lamp: 3.5 },
  };
});
