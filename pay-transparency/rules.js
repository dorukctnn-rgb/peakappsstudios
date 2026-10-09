/* Pay Transparency Kit: the legal rules. Which right to pay information applies in each EU member state, from when,
 * with which answer deadline, and the official source for each statement.
 * Every statement below was checked on the official source named next to it on 8 October 2026.
 * Where a national position could not be confirmed on an official source, the status is 'unknown' and the tools
 * say "not confirmed" instead of guessing.
 * Pure data and functions, no DOM: window.PayTransRules in the browser, module.exports in Node (unit tests). */
(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory();
  else root.PayTransRules = factory();
})(typeof self !== 'undefined' ? self : this, function () {
  'use strict';

  const CHECKED = '2026-10-08';
  const NIM = 'https://eur-lex.europa.eu/legal-content/EN/NIM/?uri=CELEX:32023L0970';
  const DIRECTIVE_URL = 'https://eur-lex.europa.eu/eli/dir/2023/970/oj';
  const TRANSPOSITION_DEADLINE = '2026-06-07'; // Article 34(1)

  const SRC = {
    nim: { label: 'EUR-Lex, national transposition measures for Directive (EU) 2023/970', url: NIM },
    directive: { label: 'Directive (EU) 2023/970, EUR-Lex', url: DIRECTIVE_URL },
    de_law: { label: 'Entgelttransparenzgesetz, gesetze-im-internet.de', url: 'https://www.gesetze-im-internet.de/entgtranspg/BJNR215210017.html' },
    de_bt: { label: 'Bundestag, Drucksache 21/7026 (government answer of 8 July 2026)', url: 'https://dserver.bundestag.de/btd/21/070/2107026.pdf' },
    nl_bill: { label: 'Tweede Kamer, bill 36 949', url: 'https://www.tweedekamer.nl/kamerstukken/wetsvoorstellen/detail?cfg=wetsvoorsteldetails&qry=wetsvoorstel%3A36949' },
    nl_gov: { label: 'Rijksoverheid, plans for pay transparency', url: 'https://www.rijksoverheid.nl/themas/werk/gelijke-behandeling-op-het-werk/plannen-kabinet-meer-openheid-over-loonkloof-tussen-mannen-en-vrouwen' },
    ie_pq: { label: 'Dáil Éireann, written answer 155 of 30 September 2026', url: 'https://www.oireachtas.ie/en/debates/question/2026-09-30/155/' },
    mt_ln: { label: 'Legislation Malta, L.N. 173 of 2026', url: 'https://legislation.mt/eli/ln/2026/173/eng' },
    pl_kp: { label: 'Sejm, Dz.U. 2025 item 807 (Labour Code amendment)', url: 'https://api.sejm.gov.pl/eli/acts/DU/2025/807/text.pdf' },
    pl_draft: { label: 'Chancellery of the Prime Minister, draft bill UC127', url: 'https://www.gov.pl/web/premier/projekt-ustawy-o-wzmocnieniu-stosowania-prawa-do-jednakowego-wynagrodzenia-mezczyzn-i-kobiet-za-jednakowa-prace-lub-za-prace-o-jednakowej-wartosci2' },
    be_vl: { label: 'Flemish Government, decision of 12 June 2026 and decree text', url: 'https://www.vlaanderen.be/Decision/6A2AA0D71151A5CDECCA1FA1' },
    fr_bill: { label: 'Sénat, bill No. 944 (2025-2026)', url: 'https://www.senat.fr/dossier-legislatif/pjl25-944.html' },
    at_glbg: { label: 'RIS, Gleichbehandlungsgesetz (consolidated)', url: 'https://www.ris.bka.gv.at/GeltendeFassung.wxe?Abfrage=Bundesnormen&Gesetzesnummer=20003395' },
    es_et: { label: 'BOE, Workers’ Statute, Article 28', url: 'https://www.boe.es/buscar/act.php?id=BOE-A-2015-11430' },
    es_rd: { label: 'BOE, Royal Decree 902/2020', url: 'https://www.boe.es/buscar/act.php?id=BOE-A-2020-12215' },
    it_dlgs: { label: 'Normattiva, Legislative Decree No. 96 of 7 May 2026', url: 'https://www.normattiva.it/uri-res/N2Ls?urn:nir:stato:decreto.legislativo:2026-05-07;96' },
    gr_law: { label: 'Law 5316/2026, Government Gazette A’ 105 (EUR-Lex copy)', url: 'https://eur-lex.europa.eu/legal-content/EL/TXT/PDF/?uri=NIM:202605866' },
    sk_act: { label: 'Act No. 76/2026 Coll. (EUR-Lex copy)', url: 'https://eur-lex.europa.eu/legal-content/SK/TXT/PDF/?uri=NIM:202603903' },
  };

  // ---------- Statutory regimes: a right to pay information that national law has put in force ----------
  // deadline: { months } or { days }. "from" is when the right applies. basis: the citation used in letters.
  const REGIMES = {
    'de-entg': {
      id: 'de-entg', country: 'DE', from: '2018-01-06', kind: 'entg',
      deadline: { months: 3 },
      basis: {
        en: 'sections 10 to 16 of the German Pay Transparency Act (Entgelttransparenzgesetz, EntgTranspG)',
        de: 'den §§ 10 bis 16 des Entgelttransparenzgesetzes (EntgTranspG)',
        nl: 'de §§ 10 tot en met 16 van de Duitse Entgelttransparenzgesetz (EntgTranspG)',
      },
      short: { en: 'EntgTranspG, § 10', de: '§ 10 EntgTranspG', nl: '§ 10 EntgTranspG' },
    },
    mt: {
      id: 'mt', country: 'MT', from: '2026-06-05', kind: 'art7',
      deadline: { days: 8 },
      basis: {
        en: 'regulation 6 of the Equal Pay (Transparency and Reporting) Regulations, 2026 (L.N. 173 of 2026)',
        de: 'Regulation 6 der maltesischen Equal Pay (Transparency and Reporting) Regulations, 2026 (L.N. 173 of 2026)',
        nl: 'regulation 6 van de Maltese Equal Pay (Transparency and Reporting) Regulations, 2026 (L.N. 173 of 2026)',
      },
      deadlineRef: { en: 'regulation 6(2)', de: 'Regulation 6(2)', nl: 'regulation 6(2)' },
      short: { en: 'L.N. 173 of 2026, reg. 6', de: 'L.N. 173 of 2026, reg. 6', nl: 'L.N. 173 of 2026, reg. 6' },
    },
    it: {
      id: 'it', country: 'IT', from: '2026-06-07', kind: 'art7', oncePerYear: true,
      deadline: { months: 2 },
      basis: {
        en: 'Article 7 of Legislative Decree No. 96 of 7 May 2026',
        de: 'Artikel 7 des italienischen Gesetzesdekrets (Decreto legislativo) Nr. 96 vom 7. Mai 2026',
        nl: 'artikel 7 van het Italiaanse wetsbesluit (decreto legislativo) nr. 96 van 7 mei 2026',
      },
      deadlineRef: { en: 'Article 7(1)', de: 'Artikel 7 Absatz 1', nl: 'artikel 7, lid 1' },
      short: { en: 'D.Lgs. 96/2026, art. 7', de: 'D.Lgs. 96/2026, Art. 7', nl: 'D.Lgs. 96/2026, art. 7' },
    },
    sk: {
      id: 'sk', country: 'SK', from: '2026-06-07', kind: 'art7',
      deadline: { months: 2 },
      basis: {
        en: 'section 6 of Act No. 76/2026 Coll. on equal pay for men and women for the same work or work of equal value',
        de: '§ 6 des slowakischen Gesetzes Nr. 76/2026 Slg. über gleiches Entgelt für Männer und Frauen bei gleicher oder gleichwertiger Arbeit',
        nl: '§ 6 van de Slowaakse wet nr. 76/2026 over gelijke beloning van mannen en vrouwen voor gelijke of gelijkwaardige arbeid',
      },
      deadlineRef: { en: 'section 6(2)', de: '§ 6 Absatz 2', nl: '§ 6, lid 2' },
      short: { en: 'Act 76/2026, § 6', de: 'Gesetz 76/2026, § 6', nl: 'wet 76/2026, § 6' },
    },
    gr: {
      id: 'gr', country: 'GR', from: '2026-11-01', kind: 'art7',
      deadline: { months: 2 },
      basis: {
        en: 'Article 56A of the Labour Law Code (Presidential Decree 62/2025), added by Law 5316/2026',
        de: 'Artikel 56A des griechischen Arbeitsgesetzbuchs (Präsidialdekret 62/2025), eingefügt durch das Gesetz 5316/2026',
        nl: 'artikel 56A van het Griekse Arbeidswetboek (presidentieel besluit 62/2025), ingevoegd bij wet 5316/2026',
      },
      deadlineRef: { en: 'Article 56A(4)', de: 'Artikel 56A Absatz 4', nl: 'artikel 56A, lid 4' },
      short: { en: 'Law 5316/2026, art. 56A', de: 'Gesetz 5316/2026, Art. 56A', nl: 'wet 5316/2026, art. 56A' },
    },
    'be-vl': {
      id: 'be-vl', country: 'BE', from: '2026-06-07', kind: 'art7',
      deadline: { months: 2 },
      basis: {
        en: 'Article 6 of the Flemish Decree of 12 June 2026 on pay transparency and measures for equal pay',
        de: 'Artikel 6 des flämischen Dekrets vom 12. Juni 2026 über Entgelttransparenz und Maßnahmen für gleiches Entgelt',
        nl: 'artikel 6 van het Vlaamse decreet van 12 juni 2026 over beloningstransparantie en maatregelen voor een gelijke beloning',
      },
      deadlineRef: { en: 'Article 6', de: 'Artikel 6', nl: 'artikel 6' },
      short: { en: 'Flemish decree, art. 6', de: 'flämisches Dekret, Art. 6', nl: 'Vlaams decreet, art. 6' },
    },
  };

  // ---------- The 27 member states ----------
  // status: 'yes' transposed | 'partly' | 'bill' (bill before parliament, right not in force) | 'no' | 'unknown' (not confirmed)
  // table: the hub's row in English. regime(opts, date): the statutory regime that applies to this worker, if any.
  const COUNTRIES = [
    { code: 'AT', names: { en: 'Austria', de: 'Österreich', nl: 'Oostenrijk' }, status: 'no',
      table: { transposed: 'No', act: 'No federal transposing law. The Equal Treatment Act (GlBG) was last amended by BGBl. I Nr. 115/2023; Styria and Lower Austria notified changes for their own public service.', applies: 'Not yet. Job ads must already state the collective-agreement minimum pay and any willingness to pay more (§ 9(2) GlBG).' },
      sources: ['at_glbg', 'nim'] },
    { code: 'BE', names: { en: 'Belgium', de: 'Belgien', nl: 'België' }, status: 'partly', sub: 'be',
      table: { transposed: 'Partly', act: 'Flemish Decree of 12 June 2026 on pay transparency, for the Flemish administration, local authorities and education. No federal act for private employers has been notified.', applies: '7 June 2026 for Flemish public employers (Article 6, two months). Not yet for private employers.' },
      sources: ['be_vl', 'nim'],
      regime: o => (o && o.beSector === 'vl-public' ? 'be-vl' : null) },
    { code: 'BG', names: { en: 'Bulgaria', de: 'Bulgarien', nl: 'Bulgarije' }, status: 'unknown',
      table: { transposed: 'Not confirmed', act: 'Bulgaria lists Labour Code amendments (State Gazette No. 16, 10 February 2026) among its notified measures. We have not checked their content.', applies: 'Not confirmed' },
      sources: ['nim'] },
    { code: 'HR', names: { en: 'Croatia', de: 'Kroatien', nl: 'Kroatië' }, status: 'unknown',
      table: { transposed: 'Not confirmed', act: 'No measures notified on EUR-Lex.', applies: 'Not confirmed' }, sources: ['nim'] },
    { code: 'CY', names: { en: 'Cyprus', de: 'Zypern', nl: 'Cyprus' }, status: 'unknown',
      table: { transposed: 'Not confirmed', act: 'No measures notified on EUR-Lex.', applies: 'Not confirmed' }, sources: ['nim'] },
    { code: 'CZ', names: { en: 'Czechia', de: 'Tschechien', nl: 'Tsjechië' }, status: 'unknown',
      table: { transposed: 'Not confirmed', act: 'Act No. 120/2025 Coll. amending the Labour Code is among the notified measures; full transposition is not confirmed.', applies: 'Not confirmed' }, sources: ['nim'] },
    { code: 'DK', names: { en: 'Denmark', de: 'Dänemark', nl: 'Denemarken' }, status: 'unknown',
      table: { transposed: 'Not confirmed', act: 'No measures notified on EUR-Lex.', applies: 'Not confirmed' }, sources: ['nim'] },
    { code: 'EE', names: { en: 'Estonia', de: 'Estland', nl: 'Estland' }, status: 'unknown',
      table: { transposed: 'Not confirmed', act: 'Amendments to the Employment Contracts Act (RT I, 03.07.2026, 34) are among the notified measures. We have not checked their content.', applies: 'Not confirmed' }, sources: ['nim'] },
    { code: 'FI', names: { en: 'Finland', de: 'Finnland', nl: 'Finland' }, status: 'unknown',
      table: { transposed: 'Not confirmed', act: 'No measures notified on EUR-Lex.', applies: 'Not confirmed' }, sources: ['nim'] },
    { code: 'FR', names: { en: 'France', de: 'Frankreich', nl: 'Frankrijk' }, status: 'bill',
      table: { transposed: 'No, bill before Parliament', act: 'Bill No. 944 (2025-2026) transposing the directive, tabled in the Senate on 10 September 2026 under the accelerated procedure.', applies: 'Not yet. Under the bill, the right starts once the employer has grouped its workers into categories of equal value, and at the latest on a date set by decree; the answer deadline is set by decree, two months at most.' },
      sources: ['fr_bill', 'nim'] },
    { code: 'DE', names: { en: 'Germany', de: 'Deutschland', nl: 'Duitsland' }, status: 'no', sub: 'de',
      table: { transposed: 'No', act: 'No transposing law yet. On 8 July 2026 the government said the bill was still being prepared (BT-Drucksache 21/7026). The Pay Transparency Act of 2017 (EntgTranspG) still applies.', applies: 'Not yet under the directive. Today § 10 EntgTranspG gives a right to information in establishments with more than 200 employees.' },
      sources: ['de_bt', 'de_law', 'nim'],
      regime: o => (o && o.de200 === 'yes' ? 'de-entg' : null) },
    { code: 'GR', names: { en: 'Greece', de: 'Griechenland', nl: 'Griekenland' }, status: 'yes',
      table: { transposed: 'Yes', act: 'Law 5316/2026 (Government Gazette A’ 105, 6 July 2026), which adds Article 56A to the Labour Law Code.', applies: '1 November 2026 (Article 48(2)); answer within two months.' },
      sources: ['gr_law', 'nim'], regime: () => 'gr' },
    { code: 'HU', names: { en: 'Hungary', de: 'Ungarn', nl: 'Hongarije' }, status: 'unknown',
      table: { transposed: 'Not confirmed', act: 'No measures notified on EUR-Lex.', applies: 'Not confirmed' }, sources: ['nim'] },
    { code: 'IE', names: { en: 'Ireland', de: 'Irland', nl: 'Ierland' }, status: 'partly',
      table: { transposed: 'Partly', act: 'Pay gap reporting (Article 9) runs under the Gender Pay Gap Information Act 2021. On 30 September 2026 the Minister said legislation for the remaining provisions is still being developed (Dáil written answer).', applies: 'Not yet in Irish law.' },
      sources: ['ie_pq'] },
    { code: 'IT', names: { en: 'Italy', de: 'Italien', nl: 'Italië' }, status: 'yes',
      table: { transposed: 'Yes', act: 'Legislative Decree No. 96 of 7 May 2026 (Official Gazette No. 125, 1 June 2026).', applies: '7 June 2026 (Article 7); answer within two months, one request a year.' },
      sources: ['it_dlgs', 'nim'], regime: () => 'it' },
    { code: 'LV', names: { en: 'Latvia', de: 'Lettland', nl: 'Letland' }, status: 'unknown',
      table: { transposed: 'Not confirmed', act: 'No measures notified on EUR-Lex.', applies: 'Not confirmed' }, sources: ['nim'] },
    { code: 'LT', names: { en: 'Lithuania', de: 'Litauen', nl: 'Litouwen' }, status: 'unknown',
      table: { transposed: 'Not confirmed', act: 'Labour Code amendment No. XV-969 (Register of Legal Acts, 25 May 2026) is among the notified measures. We could not open the official text to check it.', applies: 'Not confirmed' }, sources: ['nim'] },
    { code: 'LU', names: { en: 'Luxembourg', de: 'Luxemburg', nl: 'Luxemburg' }, status: 'unknown',
      table: { transposed: 'Not confirmed', act: 'No measures notified on EUR-Lex.', applies: 'Not confirmed' }, sources: ['nim'] },
    { code: 'MT', names: { en: 'Malta', de: 'Malta', nl: 'Malta' }, status: 'yes',
      table: { transposed: 'Yes', act: 'Equal Pay (Transparency and Reporting) Regulations, 2026 (L.N. 173 of 2026).', applies: '5 June 2026 (regulation 6); the employer answers within eight days.' },
      sources: ['mt_ln', 'nim'], regime: () => 'mt' },
    { code: 'NL', names: { en: 'Netherlands', de: 'Niederlande', nl: 'Nederland' }, status: 'bill',
      table: { transposed: 'No, bill before Parliament', act: 'Bill 36 949 (Wet implementatie Richtlijn loontransparantie mannen en vrouwen), submitted to the House of Representatives on 21 May 2026.', applies: 'Not yet. The government aims for 1 January 2027 if both chambers pass the bill.' },
      sources: ['nl_bill', 'nl_gov'] },
    { code: 'PL', names: { en: 'Poland', de: 'Polen', nl: 'Polen' }, status: 'partly',
      table: { transposed: 'Partly', act: 'Labour Code amendment of 4 June 2025 (Dz.U. 2025 item 807): pay information for applicants and no questions about pay history. The rest is in draft bill UC127.', applies: 'Not yet. The applicant rules apply since 24 December 2025; the government plans to adopt the draft bill in the fourth quarter of 2026.' },
      sources: ['pl_kp', 'pl_draft', 'nim'] },
    { code: 'PT', names: { en: 'Portugal', de: 'Portugal', nl: 'Portugal' }, status: 'unknown',
      table: { transposed: 'Not confirmed', act: 'No measures notified on EUR-Lex.', applies: 'Not confirmed' }, sources: ['nim'] },
    { code: 'RO', names: { en: 'Romania', de: 'Rumänien', nl: 'Roemenië' }, status: 'unknown',
      table: { transposed: 'Not confirmed', act: 'Only laws that predate the directive are among the notified measures.', applies: 'Not confirmed' }, sources: ['nim'] },
    { code: 'SK', names: { en: 'Slovakia', de: 'Slowakei', nl: 'Slowakije' }, status: 'yes',
      table: { transposed: 'Yes', act: 'Act No. 76/2026 Coll. on equal pay for men and women for the same work or work of equal value.', applies: '7 June 2026 (section 6); answer within two months.' },
      sources: ['sk_act', 'nim'], regime: () => 'sk' },
    { code: 'SI', names: { en: 'Slovenia', de: 'Slowenien', nl: 'Slovenië' }, status: 'unknown',
      table: { transposed: 'Not confirmed', act: 'Only laws that predate the directive are among the notified measures.', applies: 'Not confirmed' }, sources: ['nim'] },
    { code: 'ES', names: { en: 'Spain', de: 'Spanien', nl: 'Spanje' }, status: 'no',
      table: { transposed: 'No', act: 'No transposing law notified; only existing laws such as Royal Decree 902/2020 on equal pay.', applies: 'Not yet. Workers can already see the pay register through their legal representatives (Article 28(2) of the Workers’ Statute).' },
      sources: ['es_et', 'es_rd', 'nim'] },
    { code: 'SE', names: { en: 'Sweden', de: 'Schweden', nl: 'Zweden' }, status: 'unknown',
      table: { transposed: 'Not confirmed', act: 'Only laws that predate the directive are among the notified measures.', applies: 'Not confirmed' }, sources: ['nim'] },
  ];
  const BY_CODE = Object.fromEntries(COUNTRIES.map(c => [c.code, c]));

  // ---------- Country notes shown with the worker letter, per language ----------
  // Only facts read on the sources above. {date} placeholders are not used here: dates are written out.
  const NOTES = {
    AT: {
      en: ['Employers above a size threshold must prepare an income report (Einkommensbericht) every two years, with average or median pay of women and men by pay group, for the works council (§ 11a GlBG). Your works council can tell you what it shows for you.'],
      de: ['Arbeitgeber ab einer bestimmten Größe müssen alle zwei Jahre einen Einkommensbericht mit dem Durchschnitts- oder Medianentgelt von Frauen und Männern je Verwendungsgruppe für den Betriebsrat erstellen (§ 11a GlBG). Der Betriebsrat kann Ihnen sagen, was der Bericht für Ihre Gruppe zeigt.'],
      nl: ['Werkgevers boven een bepaalde omvang stellen elke twee jaar een inkomensrapport (Einkommensbericht) op voor de ondernemingsraad, met het gemiddelde of mediane loon van vrouwen en mannen per loongroep (§ 11a GlBG). De ondernemingsraad kan je vertellen wat het rapport voor jouw groep laat zien.'],
    },
    BE: {
      en: ['Flemish public employers (the Flemish administration, local authorities and education) must answer within two months under Article 6 of the Flemish decree. You can also ask through your union representative or the Flemish Human Rights Institute (Vlaams Mensenrechteninstituut). For other employers there is no Belgian rule in force yet.'],
      de: ['Flämische öffentliche Arbeitgeber (flämische Verwaltung, lokale Behörden, Bildungseinrichtungen) müssen nach Artikel 6 des flämischen Dekrets innerhalb von zwei Monaten antworten. Sie können auch über Ihre Gewerkschaftsvertretung oder das Vlaams Mensenrechteninstituut fragen. Für andere Arbeitgeber gilt in Belgien noch keine Regelung.'],
      nl: ['Vlaamse overheidswerkgevers (Vlaamse administratie, lokale besturen en onderwijsinstellingen) moeten volgens artikel 6 van het Vlaamse decreet binnen twee maanden antwoorden. Je kunt de informatie ook opvragen via je vakbondsafgevaardigde of via het Vlaams Mensenrechteninstituut. Voor andere werkgevers geldt in België nog geen regeling.'],
    },
    DE: {
      en: ['The current Pay Transparency Act gives this right only in establishments with, as a rule, more than 200 employees at the same employer (§ 12(1) EntgTranspG). The request must be in text form, and you can repeat it after two years unless your situation has changed significantly (§ 10(2)).', 'If there is a works council, the request goes to the works council (§ 14(1), § 15(2) EntgTranspG); senior executives (leitende Angestellte) ask the employer (§ 13(4)).', 'The wider right of the EU directive, for all employees whatever the size of the employer, applies in Germany only once the new law is in force. The government had not yet introduced the bill on 8 July 2026.'],
      de: ['Das geltende Entgelttransparenzgesetz gibt den Auskunftsanspruch nur in Betrieben mit in der Regel mehr als 200 Beschäftigten bei demselben Arbeitgeber (§ 12 Abs. 1 EntgTranspG). Das Auskunftsverlangen muss in Textform gestellt werden; erneut fragen können Sie nach zwei Jahren, früher nur bei wesentlich veränderten Voraussetzungen (§ 10 Abs. 2).', 'Gibt es einen Betriebsrat, richten Sie das Auskunftsverlangen an den Betriebsrat (§ 14 Abs. 1, § 15 Abs. 2 EntgTranspG). Leitende Angestellte wenden sich an den Arbeitgeber (§ 13 Abs. 4).', 'Das weitergehende Auskunftsrecht der EU-Richtlinie für alle Beschäftigten, unabhängig von der Betriebsgröße, gilt in Deutschland erst, wenn das neue Gesetz in Kraft ist. Am 8. Juli 2026 lag der Gesetzentwurf noch nicht vor.'],
      nl: ['De huidige Duitse wet (Entgelttransparenzgesetz) geeft dit recht alleen in vestigingen met doorgaans meer dan 200 werknemers bij dezelfde werkgever (§ 12, lid 1). Het verzoek moet schriftelijk (in Textform) en kan na twee jaar opnieuw, eerder alleen als de omstandigheden wezenlijk zijn veranderd (§ 10, lid 2).', 'Is er een ondernemingsraad (Betriebsrat), dan gaat het verzoek naar de ondernemingsraad (§ 14, lid 1, § 15, lid 2); leidinggevenden in de zin van de wet (leitende Angestellte) vragen het aan de werkgever (§ 13, lid 4).', 'Het ruimere recht uit de EU-richtlijn, voor alle werknemers ongeacht de omvang van de werkgever, geldt in Duitsland pas als de nieuwe wet in werking is. Op 8 juli 2026 was het wetsvoorstel nog niet ingediend.'],
    },
    ES: {
      en: ['Workers in Spain can already see the employer’s pay register, with average pay by sex for the same or equal-value jobs, through their legal representatives (Article 28(2) of the Workers’ Statute). Where there are no representatives, the employer gives the percentage differences only (Article 5(3) of Royal Decree 902/2020).'],
      de: ['In Spanien können Beschäftigte schon heute über ihre gesetzliche Arbeitnehmervertretung das Entgeltregister des Arbeitgebers einsehen, mit den durchschnittlichen Entgelten nach Geschlecht für gleiche oder gleichwertige Arbeit (Artikel 28 Absatz 2 des Arbeitnehmerstatuts). Gibt es keine Vertretung, teilt der Arbeitgeber nur die prozentualen Unterschiede mit (Artikel 5 Absatz 3 des Königlichen Dekrets 902/2020).'],
      nl: ['In Spanje kunnen werknemers het loonregister van de werkgever, met het gemiddelde loon per geslacht voor gelijk of gelijkwaardig werk, nu al inzien via hun wettelijke vertegenwoordigers (artikel 28, lid 2, van het Spaanse werknemersstatuut). Zonder vertegenwoordiging geeft de werkgever alleen de procentuele verschillen (artikel 5, lid 3, van koninklijk besluit 902/2020).'],
    },
    FR: {
      en: ['The French bill (No. 944, tabled in the Senate on 10 September 2026) would add the right to the Labour Code as Article L. 1142-7, with an answer deadline set by decree of two months at most. It is not law yet.'],
      de: ['Der französische Gesetzentwurf (Nr. 944, am 10. September 2026 im Senat eingebracht) würde das Recht als Artikel L. 1142-7 in den Code du travail aufnehmen; die Antwortfrist legt ein Dekret fest, höchstens zwei Monate. Er ist noch nicht Gesetz.'],
      nl: ['Het Franse wetsvoorstel (nr. 944, op 10 september 2026 bij de Senaat ingediend) zou het recht als artikel L. 1142-7 in de Code du travail opnemen, met een antwoordtermijn die bij decreet wordt vastgesteld, van hoogstens twee maanden. Het is nog geen wet.'],
    },
    GR: {
      en: ['The right applies from 1 November 2026 (Article 48(2) of Law 5316/2026). You can also ask through workers’ representatives or the Greek Ombudsman (Synigoros tou Politi), and ask for clarification if the answer is inaccurate or incomplete (Article 56A(2)).'],
      de: ['Das Recht gilt ab dem 1. November 2026 (Artikel 48 Absatz 2 des Gesetzes 5316/2026). Sie können auch über die Arbeitnehmervertretung oder den griechischen Bürgerbeauftragten (Synigoros tou Politi) fragen und bei ungenauen oder unvollständigen Angaben Klarstellungen verlangen (Artikel 56A Absatz 2).'],
      nl: ['Het recht geldt vanaf 1 november 2026 (artikel 48, lid 2, van wet 5316/2026). Je kunt ook vragen via werknemersvertegenwoordigers of de Griekse ombudsman (Synigoros tou Politi), en om verduidelijking vragen als het antwoord onjuist of onvolledig is (artikel 56A, lid 2).'],
    },
    IE: {
      en: ['Ireland already requires gender pay gap reports from employers with 50 or more employees. The rest of the directive, which includes this right, still needs legislation; the Minister said on 30 September 2026 that it will be introduced in phases once the law passes.'],
      de: ['Irland verlangt bereits Berichte zum geschlechtsspezifischen Entgeltgefälle von Arbeitgebern mit 50 oder mehr Beschäftigten. Für den Rest der Richtlinie, zu dem dieses Recht gehört, fehlt noch das Gesetz; laut der zuständigen Ministerin (30. September 2026) wird es nach der Verabschiedung schrittweise eingeführt.'],
      nl: ['Ierland verplicht werkgevers met 50 of meer werknemers al tot loonkloofrapportages. Voor de rest van de richtlijn, waaronder dit recht, is nog een wet nodig; volgens de minister (30 september 2026) volgt de invoering gefaseerd zodra die wet is aangenomen.'],
    },
    IT: {
      en: ['You can make this request once a year (Article 7(1)). Your employer may also meet it by publishing the averages on its intranet (Article 7(2)). If the answer is inaccurate or incomplete, you can ask for clarification and a reasoned reply (Article 7(5)).'],
      de: ['Sie können diese Auskunft einmal im Jahr verlangen (Artikel 7 Absatz 1). Der Arbeitgeber kann die Durchschnittswerte auch im Intranet veröffentlichen (Artikel 7 Absatz 2). Sind die Angaben ungenau oder unvollständig, können Sie Klarstellungen und eine begründete Antwort verlangen (Artikel 7 Absatz 5).'],
      nl: ['Je kunt dit verzoek eenmaal per jaar doen (artikel 7, lid 1). De werkgever kan er ook aan voldoen door de gemiddelden op het intranet te publiceren (artikel 7, lid 2). Is het antwoord onjuist of onvolledig, dan kun je om verduidelijking en een gemotiveerd antwoord vragen (artikel 7, lid 5).'],
    },
    MT: {
      en: ['If the employer does not answer within eight days, an employees’ representative, or a union you choose, can ask on your behalf within the next twelve days; after that you can ask through the Equality Body (regulation 6(3)). Failing to give the information within 45 days of your first request is an offence (regulation 6(5)).', 'For requests made in 2026, the information covers pay for 2026 only (regulation 6(1)).'],
      de: ['Antwortet der Arbeitgeber nicht innerhalb von acht Tagen, kann eine Arbeitnehmervertretung oder eine Gewerkschaft Ihrer Wahl binnen zwölf weiterer Tage für Sie fragen; danach können Sie über das Equality Body fragen (Regulation 6(3)). Liegt die Auskunft 45 Tage nach der ersten Anfrage nicht vor, ist das ein Verstoß gegen das maltesische Arbeitsgesetz, den die Behörde verfolgen kann (Regulation 6(5)).', 'Bei Anfragen im Jahr 2026 betrifft die Auskunft nur das Entgelt für 2026 (Regulation 6(1)).'],
      nl: ['Antwoordt de werkgever niet binnen acht dagen, dan kan een werknemersvertegenwoordiger of een vakbond van je keuze binnen twaalf dagen namens jou vragen; daarna kun je het via het Equality Body opvragen (regulation 6(3)). Wie de informatie niet binnen 45 dagen na het eerste verzoek geeft, pleegt een overtreding (regulation 6(5)).', 'Bij verzoeken in 2026 gaat de informatie alleen over het loon over 2026 (regulation 6(1)).'],
    },
    NL: {
      en: ['The Dutch bill (Kamerstuk 36 949) would put this right in Article 10b of the Equal Treatment of Men and Women Act, with a two-month answer deadline and a yearly notice from the employer. The government aims for 1 January 2027 if both chambers pass it; until then it is not law.'],
      de: ['Der niederländische Gesetzentwurf (Kamerstuk 36 949) würde dieses Recht in Artikel 10b des Gesetzes über die Gleichbehandlung von Männern und Frauen aufnehmen, mit einer Antwortfrist von zwei Monaten und einem jährlichen Hinweis des Arbeitgebers. Die Regierung strebt den 1. Januar 2027 an, wenn beide Kammern zustimmen; bis dahin ist es kein Gesetz.'],
      nl: ['Het wetsvoorstel (Kamerstuk 36 949) neemt dit recht op in artikel 10b van de Wet gelijke behandeling van mannen en vrouwen, met een antwoordtermijn van twee maanden en een jaarlijkse mededeling van de werkgever. Het kabinet mikt op 1 januari 2027 als de Tweede en de Eerste Kamer instemmen; tot die tijd is het geen wet.'],
    },
    PL: {
      en: ['Since 24 December 2025, Polish employers must give applicants the starting pay or its range and may not ask about pay history (Labour Code, Articles 18³ca and 22¹). The right to information for employees is in draft bill UC127, which the government plans to adopt in the fourth quarter of 2026.'],
      de: ['Seit dem 24. Dezember 2025 müssen polnische Arbeitgeber Bewerbern das Einstiegsentgelt oder dessen Spanne nennen und dürfen nicht nach dem bisherigen Entgelt fragen (Arbeitsgesetzbuch, Art. 18³ca und 22¹). Das Auskunftsrecht für Beschäftigte steht im Gesetzentwurf UC127, den die Regierung im vierten Quartal 2026 beschließen will.'],
      nl: ['Sinds 24 december 2025 moeten Poolse werkgevers sollicitanten het aanvangsloon of de bandbreedte geven en mogen ze niet naar het eerdere loon vragen (Arbeidswetboek, art. 18³ca en 22¹). Het recht op informatie voor werknemers staat in wetsvoorstel UC127, dat de regering in het vierde kwartaal van 2026 wil vaststellen.'],
    },
    SK: {
      en: ['If the information you receive is inaccurate or incomplete, the employer must clarify it within 30 days of your follow-up request (section 6(3)). You can also ask through employees’ representatives or the Slovak National Centre for Human Rights (section 6(4)). The average is not given where it would reveal the pay of another specific employee (section 6(1)(b)).'],
      de: ['Sind die erhaltenen Angaben ungenau oder unvollständig, muss der Arbeitgeber sie binnen 30 Tagen nach Ihrer Nachfrage erläutern (§ 6 Abs. 3). Sie können auch über die Arbeitnehmervertretung oder das Slowakische Nationale Zentrum für Menschenrechte fragen (§ 6 Abs. 4). Würde der Durchschnitt das Entgelt einer bestimmten anderen Person erkennen lassen, entfällt diese Angabe (§ 6 Abs. 1 Buchst. b).'],
      nl: ['Is de informatie onjuist of onvolledig, dan moet de werkgever haar binnen 30 dagen na je vervolgvraag toelichten (§ 6, lid 3). Je kunt ook vragen via werknemersvertegenwoordigers of het Slowaakse Nationale Centrum voor Mensenrechten (§ 6, lid 4). Zou het gemiddelde het loon van een bepaalde andere werknemer prijsgeven, dan vervalt die opgave (§ 6, lid 1, onder b).'],
    },
  };

  // ---------- Dates ----------
  const iso = d => d.toISOString().slice(0, 10);
  function parseISO(s) {
    const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(String(s || ''));
    if (!m) return null;
    const d = new Date(Date.UTC(+m[1], +m[2] - 1, +m[3]));
    return d.getUTCMonth() === +m[2] - 1 ? d : null;
  }
  // Same day number n months later; when that month is shorter, its last day (31 December + 2 months = 28 or 29 February).
  // This matches PayGap.addMonths in the Pay Gap Report, and the usual national rules for periods in months.
  function addMonths(d, n) {
    const y = d.getUTCFullYear(), m = d.getUTCMonth() + n, day = d.getUTCDate();
    const last = new Date(Date.UTC(y, m + 1, 0)).getUTCDate();
    return new Date(Date.UTC(y, m, Math.min(day, last)));
  }
  const addDays = (d, n) => new Date(d.getTime() + n * 864e5);
  // Directive Article 7(4): "within two months from the date on which the request is made".
  function dueDate(requestISO, deadline) {
    const d = parseISO(requestISO);
    if (!d) return null;
    const dl = deadline || { months: 2 };
    return iso(dl.days ? addDays(d, dl.days) : addMonths(d, dl.months || 2));
  }

  // ---------- Which rule applies to a worker ----------
  // opts: { de200: 'yes'|'no'|'unsure', beSector: 'vl-public'|'other' }. date: the date of the letter (YYYY-MM-DD).
  // Returns { mode: 'statutory' | 'upcoming' | 'voluntary', regime, country, deadline, due, status }
  function ruleFor(code, opts, dateISO) {
    const c = BY_CODE[code];
    if (!c) return null;
    const rid = c.regime ? c.regime(opts || {}) : null;
    const reg = rid ? REGIMES[rid] : null;
    const date = parseISO(dateISO) ? dateISO : iso(new Date());
    if (reg && date >= reg.from) return { mode: 'statutory', regime: reg, country: c, deadline: reg.deadline, due: dueDate(date, reg.deadline), status: c.status };
    const out = { mode: 'voluntary', regime: null, country: c, deadline: { months: 2 }, due: dueDate(date, { months: 2 }), status: c.status };
    if (reg) { out.mode = 'upcoming'; out.upcoming = reg; }
    return out;
  }

  function sourceList(code) {
    const c = BY_CODE[code];
    return c ? c.sources.map(k => SRC[k]) : [];
  }

  return { CHECKED, NIM, DIRECTIVE_URL, TRANSPOSITION_DEADLINE, SRC, REGIMES, COUNTRIES, BY_CODE, NOTES, parseISO, iso, addMonths, addDays, dueDate, ruleFor, sourceList };
});
