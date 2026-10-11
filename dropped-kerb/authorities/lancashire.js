/* Dropped Kerb Check: Lancashire County Council, the highway authority for Lancashire except Blackburn with Darwen
 * and Blackpool (each its own highway authority).
 * Read on 11 October 2026: the council's vehicle crossings guide (the pages on things to consider, planning
 * permission, cost and timescales, final things to consider, and the pre-application checklist). Facts and figures
 * with citations; no copied text. */
(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory();
  else (root.DKAuth = root.DKAuth || {}).lancashire = factory();
})(typeof self !== 'undefined' ? self : this, function () {
  'use strict';
  const CHECKED = '2026-10-11';
  const B = 'https://www.lancashire.gov.uk/roads-parking-and-travel/roads/vehicle-crossings/';
  return {
    slug: 'lancashire', name: 'Lancashire County Council', short: 'Lancashire', kind: 'county',
    area: 'Lancashire, except Blackburn with Darwen and Blackpool, which are their own highway authorities. The district councils decide planning.',
    checked: CHECKED, version: 'lancashire-2026-10-11.1',
    sources: {
      consider: { label: 'Lancashire County Council, Vehicle crossings: main things for consideration before you apply', short: 'LCC things to consider', url: B + 'main-things-for-consideration-before-you-apply/', checked: CHECKED },
      planning: { label: 'Lancashire County Council, Vehicle crossings: planning permission', short: 'LCC planning permission', url: B + 'planning-permission/', checked: CHECKED },
      cost: { label: 'Lancashire County Council, Vehicle crossings: cost and timescales', short: 'LCC cost and timescales', url: B + 'cost-and-timescales/', checked: CHECKED },
      final: { label: 'Lancashire County Council, Vehicle crossings: final things to consider before you apply', short: 'LCC final things to consider', url: B + 'final-things-to-consider-before-you-apply/', checked: CHECKED },
      checklist: { label: 'Lancashire County Council, Vehicle crossings: pre-application checklist', short: 'LCC pre-application checklist', url: B + 'pre-application-checklist/', checked: CHECKED },
    },
    process: {
      url: B,
      builder: 'approved', builderText: 'Approved applicants get a list of approved contractors to ask for quotes; your own builder can also apply to be approved, free. The contractor’s Section 171 licence is free with the approval code.',
      decision: 'The council aims to approve or refuse a standard application within 28 days; longer at busy times.',
      valid: 'The approval is valid for 2 years from the letter.',
      review: 'A refusal is explained in writing. Half the fee is refunded.',
      source: 'cost',
    },
    fees: [
      { id: 'application', label: 'Application fee', amount: 290, refundable: 'partial', refund: 145, note: 'An unsuccessful application gets half back (£145).', source: 'cost' },
    ],
    works: { kind: 'range', min: 2000, max: 3500, text: 'Contractor quotes for a standard crossing (4.5 m at the kerb, 2.5 m wide for the vehicle, on a 2 m footpath)', source: 'cost' },
    rules: {
      depth: { perp: 4.8, ref: 'Things to consider, enough space; checklist question 2', text: 'At least 4.8 m between the back of the footway or the boundary wall, fence or hedge and the front of the building; no part of the car may overhang. Below 4.8 m the council will not consider it.', source: 'consider' },
      width: { perp: 2.4, ref: 'Things to consider, is the access wide enough', text: 'At least 2.4 m clear through the whole parking bay for one home; no bay window or tree in it.', source: 'consider' },
      crossing: { text: 'A standard crossing is 4.5 m at the kerb face and 2.5 m wide for the vehicle; one application covers a joint crossing for two homes up to 6 m.', length: 4.5, rear: 2.5, ref: 'Cost and timescales', source: 'cost' },
      junction: { min: 10, mainRoad: [15, 20], strict: false, ref: 'Things to consider, distance from road junctions; checklist question 4', text: 'Within 10 m of a junction, roundabout or signals on a major A or B road the risk is assessed; on residential streets of 30 mph or less it is unlikely to cause refusal unless there is a specific hazard. Planning permission for the crossing counts in its favour.', source: 'consider' },
      sight: { setback: 2, y: { 20: 25, 30: 43, 40: 65 }, yMajor: { 40: 102, 50: 158, 60: 201 }, ref: 'Things to consider, visibility requirements', text: 'With the driver 2 m back from the carriageway edge: 25 m each way at 20 mph, 43 m at 30 mph, 65 m on a 40 mph residential street (102 m on an A or B road), 158 m at 50 mph, 201 m at 60 mph. Refused without enough visibility.', source: 'consider' },
      tree: { kind: 'fixed', min: 2.5, strict: true, ref: 'Things to consider, obstructions; checklist question 7', text: 'Healthy trees are not removed; within 2.5 m of a highway tree trunk the council will not consider the application.', source: 'checklist' },
      lamp: { min: 2, within: 'move', cost: [500, 3000], ref: 'Things to consider, obstructions; checklist question 6', text: 'A street light within 2 m may have to be moved by the council, at your cost (typically £500 to £3,000); you also show you have consulted any neighbour affected.', source: 'consider' },
      furniture: { kind: 'owner', ref: 'Things to consider, other street furniture', text: 'Telecoms cabinets and other utility furniture: you arrange the move with the owner and usually pay for it.', source: 'consider' },
      busStop: { kind: 'conflict', ref: 'Things to consider, other highway factors', text: 'May be refused close to a bus stop where the crossing would conflict with waiting passengers or boarding.', source: 'consider' },
      gradient: { max: 0.05, scope: 'driveway', strict: false, ref: 'Final things to consider', text: 'The finished drive should fall about 2.5 cm per metre to the kerb, ideally no more than 5 cm per metre; a steep slope to the road can mean refusal.', source: 'final' },
      pedCrossing: { zigzag: 'check', ref: 'Things to consider, other highway factors', text: 'May be refused within the zig-zag markings of a controlled crossing, or beside a refuge or island that stops a single turn of more than 90 degrees.', source: 'consider' },
      bays: { marked: 'check', ref: 'Things to consider, existing parking bays; checklist question 11', text: 'Changing parking bays or restrictions takes a traffic order, with its own time and cost; ask the council before applying.', source: 'checklist' },
      door: { kind: 'escape', ref: 'Things to consider, enough space; checklist question 3', text: 'You must be able to leave the house safely in an emergency with the car parked; the council can refuse or set conditions.', source: 'consider' },
      gates: { ref: 'Things to consider, gates (Highways Act 1980, s.153)', text: 'Gates may not open outwards over the verge, footway or road, and need room to open with the car parked.', source: 'consider' },
      drainage: { ref: 'Things to consider, drainage', text: 'Water from an impermeable drive must be dealt with inside the boundary, by a soakaway or storage.', source: 'consider' },
      loose: { kind: 'retain', ref: 'Things to consider, drainage', text: 'Gravel needs edging or a rigid strip so it stays off the footway.', source: 'consider' },
      ownership: { ref: 'Things to consider, property ownership; checklist question 10', text: 'Without the freeholder’s written consent the council will not consider the application; land between your boundary and the highway may need an easement.', source: 'checklist' },
    },
    planning: [
      { when: 'classified', text: 'Lancashire says access from an A, B or C road may need planning permission, as may connected works such as paving over a garden; get it before applying.', source: 'planning' },
    ],
    notes: [
      { text: 'Works by an approved contractor carry a 2-year defect period, after which the council maintains the crossing.', source: 'final' },
      { text: 'A road resurfaced or rebuilt in the last 2 years is protected by a section 58 notice, which can delay the works.', source: 'final' },
    ],
    sample: { depth: 5.0, width: 3.0, footway: 2.0, verge: 0, junction: 14, wall: 0.6, tree: { dist: 3.6, circ: 0.7 }, lamp: 2.6 },
  };
});
