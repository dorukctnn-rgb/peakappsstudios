/* Dropped Kerb Check: Sheffield City Council, the highway authority for Sheffield.
 * Read on 11 October 2026: the council's "Request a dropped kerb" page and its Domestic Vehicular Crossing
 * Application form (2026). Facts and figures with citations; no copied text. */
(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory();
  else (root.DKAuth = root.DKAuth || {}).sheffield = factory();
})(typeof self !== 'undefined' ? self : this, function () {
  'use strict';
  const CHECKED = '2026-10-11';
  return {
    slug: 'sheffield', name: 'Sheffield City Council', short: 'Sheffield', kind: 'metropolitan',
    area: 'Sheffield. The city council is both the highway authority and the planning authority.',
    checked: CHECKED, version: 'sheffield-2026-10-11.1',
    sources: {
      page: { label: 'Sheffield City Council, Request a dropped kerb', short: 'SCC dropped kerb page', url: 'https://www.sheffield.gov.uk/parking/request-adjustments/request-dropped-kerb', checked: CHECKED },
      form: { label: 'Sheffield City Council, Domestic Vehicular Crossing Application, 2026 (Highways Act 1980, section 184)', short: 'SCC application form 2026', url: 'https://www.sheffield.gov.uk/sites/default/files/2026-07/domestic_vehicular_crossing_application_-_2026.docx', checked: CHECKED },
    },
    process: {
      url: 'https://www.sheffield.gov.uk/parking/request-adjustments/request-dropped-kerb',
      builder: 'contractor', builderText: 'The council does not build crossings. You pay a contractor from its registered list, or one it approves first with £2 million public liability insurance and supervisor-level street works accreditation.',
      decision: 'About 10 weeks from receiving the application.',
      valid: 'Not stated; a 12-month maintenance period runs from completion, during which you or your contractor can be held responsible for defects.',
      review: 'The council may refuse any application; the fee is not refunded.',
      source: 'form',
    },
    fees: [
      { id: 'application', label: 'Application fee (domestic)', amount: 220, refundable: false, source: 'page' },
    ],
    works: { kind: 'quote', text: 'Your contractor quotes and is paid by you.', source: 'form' },
    rules: {
      depth: { perp: 5, ref: 'Application form, question 6', text: 'The parking area should be at least 5 m long, measured at right angles to the highway.', source: 'form' },
      crossing: { text: 'A single crossing is 4.5 m including the taper kerbs, a double 6.3 m; no access may exceed 6.3 m, counting any existing crossing.', length: 4.5, double: 6.3, max: 6.3, ref: 'Application form, questions 4 and 5', source: 'form' },
      junction: { min: 10, major: 15, strict: true, ref: 'Application form, question 7', text: 'At least 10 m from any junction, 15 m on major roads or at busy junctions.', source: 'form' },
      sight: { kind: 'clear2', along: 2, ref: 'Application form, question 14', text: 'A 2 m clear line of sight to the left and right of the crossing, judged vertically and horizontally.', source: 'form' },
      tree: { kind: 'circ', factor: 4, strict: true, ref: 'Application form, question 9', text: 'From the trunk to the start of the lowered kerb must be more than 4 times the trunk circumference.', source: 'form' },
      lamp: { min: 1, within: 'fail', ref: 'Application form, question 10', text: 'At least 1 m from street lighting columns, BT poles and other street furniture.', source: 'form' },
      furniture: { min: 1, within: 'fail', ref: 'Application form, question 10', source: 'form' },
      busStop: { min: 1, within: 'fail', ref: 'Application form, question 8', text: 'At least 1 m from a bus stop.', source: 'form' },
      gradient: { max: 1 / 6, scope: 'crossing', strict: false, ref: 'Application form, question 12', text: 'A verge or footway steeper than 1 in 6 may not be approved, as cars could ground.', source: 'form' },
      bays: { marked: 'check', ref: 'Application form, question 13', text: 'A parking bay or service strip in front of the property may rule the location out.', source: 'form' },
      drainage: { ref: 'Application form, question 15', text: 'Water must not drain from the parking area on to the highway: use a soakaway or a permeable surface.', source: 'form' },
      loose: { kind: 'banned', ref: 'Application form, question 15', text: 'Loose chippings and unbound surfaces are not permitted.', source: 'form' },
      ownership: { ref: 'Application form, question 1', text: 'Tenants of private landlords or housing associations need the landlord’s written permission; council tenants ask Housing Services first.', source: 'form' },
    },
    planning: [
      { when: 'list', text: 'Sheffield says a classified road, a conservation area or a listed building needs planning permission first, except for works Amey does as part of a maintenance scheme.', source: 'page' },
    ],
    notes: [
      { text: 'A copy of an earlier permission certificate costs £40.', source: 'page' },
    ],
    sample: { depth: 5.6, width: 3.6, footway: 2.0, verge: 0, junction: 16, wall: 0.5, tree: { dist: 4.4, circ: 0.95 }, lamp: 1.6 },
  };
});
