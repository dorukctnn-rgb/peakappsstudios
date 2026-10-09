/* Pay Transparency Kit: the letters, in English, German and Dutch.
 *   workerLetter(input)  the worker's written request (Article 7 of Directive (EU) 2023/970, or the national rule in force)
 *   answerLetter(data)   the employer's written answer, built from the figures the engine worked out
 *   annualNotice(data)   the yearly notice to all workers about the right (Article 7(3))
 *   criteriaTemplate(data) the pay setting and progression criteria statement (Article 6), to fill in
 *   nextSteps(input)     what happens after the request is sent, per country
 * Each returns a structured letter { lang, subject, salutation, blocks, closing, signature, ... }; toText() turns it
 * into plain text. Depends on rules.js (window.PayTransRules). Pure functions, no DOM; works in Node for the tests. */
(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory(require('./rules.js'));
  else root.PayTransLetters = factory(root.PayTransRules);
})(typeof self !== 'undefined' ? self : this, function (R) {
  'use strict';

  const MONTHS = {
    en: ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'],
    de: ['Januar', 'Februar', 'März', 'April', 'Mai', 'Juni', 'Juli', 'August', 'September', 'Oktober', 'November', 'Dezember'],
    nl: ['januari', 'februari', 'maart', 'april', 'mei', 'juni', 'juli', 'augustus', 'september', 'oktober', 'november', 'december'],
  };
  function longDate(lang, isoDate) {
    const d = R.parseISO(isoDate);
    if (!d) return '';
    const day = d.getUTCDate(), m = MONTHS[lang][d.getUTCMonth()], y = d.getUTCFullYear();
    return lang === 'de' ? `${day}. ${m} ${y}` : `${day} ${m} ${y}`;
  }
  const LOCALE = { en: 'en-IE', de: 'de-DE', nl: 'nl-NL' };
  function money(lang, x, currency) {
    if (x == null || !Number.isFinite(x)) return '';
    return new Intl.NumberFormat(LOCALE[lang] || 'en-IE', { style: 'currency', currency: currency || 'EUR', minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(x)
      .replace(/[  ]/g, ' ');
  }
  function period(lang, dl) {
    if (dl && dl.days) return { en: `${words(lang, dl.days)} days`, de: `${words(lang, dl.days)} Tagen`, nl: `${words(lang, dl.days)} dagen` }[lang];
    const n = (dl && dl.months) || 2;
    return { en: `${words(lang, n)} months`, de: `${words(lang, n)} Monaten`, nl: `${words(lang, n)} maanden` }[lang];
  }
  // German needs the nominative in a parenthesis: (Frist: zwei Monate), not (zwei Monaten).
  function periodNom(lang, dl) {
    if (lang !== 'de') return period(lang, dl);
    return dl && dl.days ? `${words('de', dl.days)} Tage` : `${words('de', (dl && dl.months) || 2)} Monate`;
  }
  function words(lang, n) {
    const W = { en: ['zero', 'one', 'two', 'three', 'four', 'five', 'six', 'seven', 'eight'], de: ['null', 'einem', 'zwei', 'drei', 'vier', 'fünf', 'sechs', 'sieben', 'acht'], nl: ['nul', 'een', 'twee', 'drie', 'vier', 'vijf', 'zes', 'zeven', 'acht'] };
    return (W[lang] || W.en)[n] || String(n);
  }
  // Country names as they sit inside a sentence ("in the Netherlands", "in den Niederlanden", "in der Slowakei").
  function inCountry(lang, code) {
    const c = R.BY_CODE[code];
    const name = c ? c.names[lang] : code;
    if (lang === 'en') return 'in ' + (code === 'NL' ? 'the Netherlands' : name);
    if (lang === 'de') return code === 'NL' ? 'in den Niederlanden' : code === 'SK' ? 'in der Slowakei' : 'in ' + name;
    return 'in ' + name;
  }
  const cap = s => (s ? s[0].toUpperCase() + s.slice(1) : s);
  const clean = s => String(s == null ? '' : s).replace(/\s+/g, ' ').trim();

  const DIRECTIVE = { en: 'Directive (EU) 2023/970', de: 'Richtlinie (EU) 2023/970', nl: 'Richtlijn (EU) 2023/970' };

  // ---------- The worker's request ----------
  // input: { lang, country, opts, date, name, employer, role, department, salutation, recipient,
  //          ask: { own, averages, criteria, variable }, comparison, components }
  function workerLetter(input) {
    const lang = input.lang || 'en';
    const date = R.parseISO(input.date) ? input.date : R.iso(new Date());
    const rule = R.ruleFor(input.country, input.opts || {}, date);
    if (!rule) throw new Error('Unknown country ' + input.country);
    const ask = Object.assign({ own: true, averages: true, criteria: true, variable: true }, input.ask || {});
    const L = { lang, kind: 'request', country: input.country, rule, date, due: rule.due };
    L.sender = [clean(input.name)].filter(Boolean);
    L.dateLine = longDate(lang, date);
    const o = input.opts || {};
    const toCouncil = rule.regime && rule.regime.kind === 'entg' && o.deCouncil === 'yes' && !o.deExecutive;
    L.recipient = [toCouncil ? { en: 'The works council', de: 'An den Betriebsrat', nl: 'Aan de ondernemingsraad (Betriebsrat)' }[lang] : clean(input.recipient), clean(input.employer)].filter(Boolean);
    if (rule.regime && rule.regime.kind === 'entg') return entgRequest(L, input, rule, toCouncil);

    const blocks = [];
    const items = [];
    if (ask.own) items.push({ en: 'my individual pay level, as gross annual pay and the corresponding gross hourly pay', de: 'meine individuelle Entgelthöhe, also mein Bruttojahresentgelt und das entsprechende Bruttostundenentgelt', nl: 'mijn individuele beloningsniveau: mijn brutojaarloon en het overeenkomstige bruto-uurloon' }[lang]);
    if (ask.averages) items.push({ en: 'the average pay levels, broken down by sex, for the category of workers who do the same work as me or work of equal value', de: 'die durchschnittlichen Entgelthöhen, aufgeschlüsselt nach Geschlecht, für die Gruppe der Beschäftigten, die gleiche oder gleichwertige Arbeit wie ich verrichten', nl: 'de naar geslacht uitgesplitste gemiddelde beloningsniveaus voor de categorie werknemers die hetzelfde of gelijkwaardig werk verrichten als ik' }[lang]);
    if (ask.criteria) items.push({ en: `the criteria used to set my pay, pay levels and pay progression (Article 6 of ${DIRECTIVE.en})`, de: `die Kriterien, nach denen mein Entgelt, meine Entgelthöhe und meine Entgeltentwicklung festgelegt werden (Artikel 6 der ${DIRECTIVE.de})`, nl: `de criteria die worden gebruikt voor het bepalen van mijn beloning, mijn beloningsniveau en mijn beloningsontwikkeling (artikel 6 van ${DIRECTIVE.nl})` }[lang]);

    blocks.push({ p: intro(lang, rule, input.country) });
    blocks.push({ list: items });
    const role = clean(input.role), dept = clean(input.department);
    if (role) blocks.push({ p: { en: `My job title: ${role}${dept ? `, ${dept}` : ''}.`, de: `Meine Funktion: ${role}${dept ? `, ${dept}` : ''}.`, nl: `Mijn functie: ${role}${dept ? `, ${dept}` : ''}.` }[lang] });
    if (ask.variable && (ask.own || ask.averages)) blocks.push({ p: { en: 'Please include complementary or variable pay, such as bonuses, allowances and benefits in kind, and say how part-time work is taken into account.', de: 'Bitte berücksichtigen Sie auch ergänzende oder variable Bestandteile wie Boni, Zulagen und Sachleistungen, und teilen Sie mir mit, wie Teilzeit berücksichtigt wird.', nl: 'Wilt u daarbij ook aanvullende of variabele componenten meenemen, zoals bonussen, toeslagen en voordelen in natura, en aangeven hoe deeltijd is meegerekend?' }[lang] });
    blocks.push({ p: deadlineSentence(lang, rule) });
    if (ask.averages) blocks.push({ p: { en: 'I will use any information about colleagues only to exercise my right to equal pay.', de: 'Angaben über Kolleginnen und Kollegen verwende ich ausschließlich, um mein Recht auf gleiches Entgelt wahrzunehmen.', nl: 'Informatie over collega’s gebruik ik alleen om mijn recht op gelijke beloning uit te oefenen.' }[lang] });
    L.subject = { en: 'Request for information on my pay level and average pay levels', de: 'Bitte um Auskunft über meine Entgelthöhe und die durchschnittlichen Entgelthöhen', nl: 'Verzoek om informatie over mijn beloningsniveau en de gemiddelde beloningsniveaus' }[lang];
    L.salutation = salutation(lang, input.salutation);
    L.blocks = blocks;
    L.closing = { en: 'Kind regards,', de: 'Mit freundlichen Grüßen', nl: 'Met vriendelijke groet,' }[lang];
    L.signature = [clean(input.name)].filter(Boolean);
    return L;
  }

  function salutation(lang, custom) {
    const s = clean(custom);
    if (s) return /[,]$/.test(s) ? s : s + ',';
    return { en: 'Dear HR team,', de: 'Sehr geehrte Damen und Herren,', nl: 'Geachte heer, mevrouw,' }[lang];
  }

  function intro(lang, rule, code) {
    const reg = rule.regime;
    if (rule.mode === 'statutory') return { en: `Under ${reg.basis.en}, I am asking for the following information in writing:`, de: `nach ${reg.basis.de} bitte ich Sie um schriftliche Auskunft über:`, nl: `Op grond van ${reg.basis.nl} verzoek ik u mij schriftelijk de volgende informatie te geven:` }[lang];
    if (rule.mode === 'upcoming') {
      const from = longDate(lang, rule.upcoming.from);
      return { en: `From ${from}, ${rule.upcoming.basis.en} gives workers the right to the following information. I am asking you to provide it now, in writing:`, de: `ab dem ${from} gibt ${rule.upcoming.basis.de} Beschäftigten das Recht auf die folgenden Auskünfte. Ich bitte Sie, mir diese Auskünfte schon jetzt schriftlich zu geben:`, nl: `Vanaf ${from} geeft ${rule.upcoming.basis.nl} werknemers recht op de volgende informatie. Ik verzoek u mij deze informatie nu al schriftelijk te geven:` }[lang];
    }
    if (code === 'DE') return { en: `${DIRECTIVE.en} gives all workers, whatever the size of their employer, the right to the following information (Article 7). That right is not yet in force in Germany, so I am asking you to provide it voluntarily, in writing:`, de: `die EU-Entgelttransparenzrichtlinie (${DIRECTIVE.de}) gibt allen Beschäftigten, unabhängig von der Größe des Arbeitgebers, in Artikel 7 ein Recht auf die folgenden Auskünfte. In Deutschland ist dieses Recht noch nicht in Kraft. Ich bitte Sie deshalb, mir diese Auskünfte freiwillig und schriftlich zu geben:`, nl: `${DIRECTIVE.nl} geeft alle werknemers, ongeacht de omvang van de werkgever, in artikel 7 recht op de volgende informatie. In Duitsland is dat recht nog niet in werking. Daarom verzoek ik u mij deze informatie vrijwillig en schriftelijk te geven:` }[lang];
    if (code === 'NL') return { en: `${DIRECTIVE.en} gives workers the right to the following information (Article 7). The bill that brings this right into Dutch law (Kamerstuk 36 949) is still before Parliament, so I am asking you to provide it voluntarily, in writing:`, de: `die EU-Entgelttransparenzrichtlinie (${DIRECTIVE.de}) gibt Beschäftigten in Artikel 7 ein Recht auf die folgenden Auskünfte. Der niederländische Gesetzentwurf dazu (Kamerstuk 36 949) liegt noch beim Parlament. Ich bitte Sie deshalb, mir diese Auskünfte freiwillig und schriftlich zu geben:`, nl: `${DIRECTIVE.nl} over loontransparantie geeft werknemers in artikel 7 recht op de volgende informatie. Het wetsvoorstel dat dit recht in de Nederlandse wet opneemt (Kamerstuk 36 949), ligt nog bij het parlement. Daarom verzoek ik u mij deze informatie nu al vrijwillig en schriftelijk te geven:` }[lang];
    if (rule.status === 'unknown') return { en: `${DIRECTIVE.en} gives workers the right to the following information (Article 7), and Member States had to apply it by 7 June 2026. I am asking you to provide it in writing and, if national rules now govern such requests, to answer under those rules:`, de: `die EU-Entgelttransparenzrichtlinie (${DIRECTIVE.de}) gibt Beschäftigten in Artikel 7 ein Recht auf die folgenden Auskünfte; die Mitgliedstaaten mussten sie bis zum 7. Juni 2026 umsetzen. Ich bitte Sie, mir diese Auskünfte schriftlich zu geben und, falls inzwischen nationale Regeln für solche Anfragen gelten, nach diesen Regeln zu antworten:`, nl: `${DIRECTIVE.nl} over loontransparantie geeft werknemers in artikel 7 recht op de volgende informatie; de lidstaten moesten de richtlijn uiterlijk op 7 juni 2026 omzetten. Ik verzoek u mij deze informatie schriftelijk te geven en, als er inmiddels nationale regels voor zulke verzoeken gelden, volgens die regels te antwoorden:` }[lang];
    const where = inCountry(lang, code);
    return { en: `${DIRECTIVE.en} gives workers the right to the following information (Article 7). That right is not yet in force ${where}, so I am asking you to provide it voluntarily, in writing:`, de: `die EU-Entgelttransparenzrichtlinie (${DIRECTIVE.de}) gibt Beschäftigten in Artikel 7 ein Recht auf die folgenden Auskünfte. ${cap(where)} ist dieses Recht noch nicht in Kraft. Ich bitte Sie deshalb, mir diese Auskünfte freiwillig und schriftlich zu geben:`, nl: `${DIRECTIVE.nl} over loontransparantie geeft werknemers in artikel 7 recht op de volgende informatie. ${cap(where)} is dit recht nog niet in werking. Daarom verzoek ik u mij deze informatie vrijwillig en schriftelijk te geven:` }[lang];
  }

  function deadlineSentence(lang, rule) {
    const due = longDate(lang, rule.due);
    if (rule.mode === 'statutory') {
      const reg = rule.regime, per = period(lang, reg.deadline), ref = reg.deadlineRef[lang];
      if (reg.deadline.days) return { en: `${cap(ref)} requires the information within ${per} of receiving this request. I look forward to your reply by ${due}.`, de: `Nach ${ref} ist die Auskunft innerhalb von ${per} nach Eingang dieser Anfrage zu geben. Ich bitte um Ihre Antwort bis zum ${due}.`, nl: `Volgens ${ref} moet u de informatie binnen ${per} na ontvangst van dit verzoek verstrekken. Ik zie uw antwoord graag uiterlijk ${due} tegemoet.` }[lang];
      return { en: `${cap(ref)} requires the information within ${per} of the request. I look forward to your reply by ${due}.`, de: `Nach ${ref} ist die Auskunft innerhalb von ${per} nach der Anfrage zu geben. Ich bitte um Ihre Antwort bis zum ${due}.`, nl: `Volgens ${ref} moet u de informatie binnen ${per} na het verzoek verstrekken. Ik zie uw antwoord graag uiterlijk ${due} tegemoet.` }[lang];
    }
    return { en: `I would be grateful for your reply within two months, by ${due}, which is the period the directive sets.`, de: `Für eine Antwort innerhalb von zwei Monaten, also bis zum ${due}, wäre ich Ihnen dankbar; diese Frist sieht die Richtlinie vor.`, nl: `Ik ontvang uw antwoord graag binnen twee maanden, uiterlijk ${due}; dat is de termijn die de richtlijn noemt.` }[lang];
  }

  // Germany, establishments with more than 200 employees: the Entgelttransparenzgesetz of 2017 (§§ 10 to 16).
  function entgRequest(L, input, rule, toCouncil) {
    const lang = L.lang, o = input.opts || {};
    const comp = clean(input.comparison) || { en: '[name the same or equal-value activity]', de: '[gleiche oder gleichwertige Tätigkeit eintragen]', nl: '[gelijke of gelijkwaardige functie invullen]' }[lang];
    const parts = clean(input.components).split(/\s*[,;]\s*|\s+(?:und|and|en)\s+/).filter(Boolean).slice(0, 2);
    const blocks = [];
    blocks.push({ p: { en: `Under ${rule.regime.basis.en}, I request the following information. As an activity doing the same or equal-value work (Vergleichstätigkeit), I name: ${comp}.`, de: `hiermit mache ich meinen Auskunftsanspruch nach ${rule.regime.basis.de} geltend. Als gleiche oder gleichwertige Tätigkeit (Vergleichstätigkeit) benenne ich: ${comp}.`, nl: `Op grond van ${rule.regime.basis.nl} verzoek ik om de volgende informatie. Als functie met gelijk of gelijkwaardig werk (Vergleichstätigkeit) noem ik: ${comp}.` }[lang] });
    blocks.push({ p: { en: 'Please tell me:', de: 'Ich bitte um Auskunft über', nl: 'Ik verzoek u mij te informeren over:' }[lang] });
    const items = [
      { en: 'the criteria and procedures used to set my pay and the pay for the comparison activity (section 11(2) EntgTranspG)', de: 'die Kriterien und Verfahren der Entgeltfindung für mein Entgelt und für das Entgelt der Vergleichstätigkeit (§ 11 Abs. 2 EntgTranspG)', nl: 'de criteria en procedures waarmee mijn loon en het loon voor de vergelijkingsfunctie worden bepaald (§ 11, lid 2, EntgTranspG)' }[lang],
      { en: 'the comparison pay: the median of the average monthly gross pay of employees of the other sex in the comparison activity, converted to full-time equivalents, for one calendar year (section 11(3) EntgTranspG)', de: 'das Vergleichsentgelt, also den auf Vollzeitäquivalente hochgerechneten statistischen Median des durchschnittlichen monatlichen Bruttoentgelts der Beschäftigten des jeweils anderen Geschlechts in der Vergleichstätigkeit, bezogen auf ein Kalenderjahr (§ 11 Abs. 3 EntgTranspG)', nl: 'het vergelijkingsloon: de mediaan van het gemiddelde bruto maandloon van de werknemers van het andere geslacht in de vergelijkingsfunctie, omgerekend naar voltijd, over een kalenderjaar (§ 11, lid 3, EntgTranspG)' }[lang],
    ];
    if (parts.length) items.push({ en: `the comparison pay for the following pay components: ${parts.join(' and ')} (section 10(1) EntgTranspG)`, de: `das Vergleichsentgelt für folgende Entgeltbestandteile: ${parts.join(' und ')} (§ 10 Abs. 1 Satz 3 EntgTranspG)`, nl: `het vergelijkingsloon voor de volgende looncomponenten: ${parts.join(' en ')} (§ 10, lid 1, EntgTranspG)` }[lang]);
    blocks.push({ list: items });
    if (toCouncil) blocks.push({ p: { en: 'I am sending this request to the works council (section 14(1) and section 15(2) EntgTranspG).', de: 'Mein Auskunftsverlangen richte ich an den Betriebsrat (§ 14 Abs. 1 und § 15 Abs. 2 EntgTranspG).', nl: 'Ik richt dit verzoek aan de ondernemingsraad (§ 14, lid 1, en § 15, lid 2, EntgTranspG).' }[lang] });
    const due = longDate(lang, rule.due);
    blocks.push({ p: o.deTariff === 'no'
      ? { en: `Section 15(3) EntgTranspG requires the answer in text form within three months of receiving this request, that is by ${due}.`, de: `Nach § 15 Abs. 3 EntgTranspG ist die Auskunft innerhalb von drei Monaten nach Zugang dieses Schreibens in Textform zu erteilen, also bis zum ${due}.`, nl: `Volgens § 15, lid 3, EntgTranspG moet het antwoord binnen drie maanden na ontvangst van dit verzoek schriftelijk (in Textform) worden gegeven, dus uiterlijk ${due}.` }[lang]
      : { en: `Please answer in text form within three months of receiving this request, by ${due}.`, de: `Bitte erteilen Sie die Auskunft in Textform innerhalb von drei Monaten nach Zugang dieses Schreibens, also bis zum ${due}.`, nl: `Ik ontvang uw antwoord graag schriftelijk (in Textform) binnen drie maanden na ontvangst van dit verzoek, uiterlijk ${due}.` }[lang] });
    L.subject = { en: 'Request for information under section 10 of the Pay Transparency Act (EntgTranspG)', de: 'Auskunftsverlangen nach § 10 Entgelttransparenzgesetz (EntgTranspG)', nl: 'Verzoek om informatie op grond van § 10 Entgelttransparenzgesetz (EntgTranspG)' }[lang];
    L.salutation = salutation(lang, input.salutation);
    L.blocks = blocks;
    L.closing = { en: 'Kind regards,', de: 'Mit freundlichen Grüßen', nl: 'Met vriendelijke groet,' }[lang];
    L.signature = [clean(input.name)].filter(Boolean);
    L.entg = true;
    return L;
  }

  // ---------- What happens next (for the page, not the letter) ----------
  function nextSteps(input) {
    const lang = input.lang || 'en';
    const date = R.parseISO(input.date) ? input.date : R.iso(new Date());
    const rule = R.ruleFor(input.country, input.opts || {}, date);
    const out = [];
    const due = longDate(lang, rule.due);
    const sent = { en: 'Send the letter in writing, by email or on paper, and keep a copy with the date you sent it.', de: 'Schicken Sie das Schreiben per E-Mail oder auf Papier und bewahren Sie eine Kopie mit dem Absendedatum auf.', nl: 'Stuur de brief per e-mail of op papier en bewaar een kopie met de datum van verzending.' }[lang];
    out.push(sent);
    if (rule.mode === 'statutory' && rule.regime.kind === 'entg') {
      const tariff = (input.opts || {}).deTariff;
      out.push(tariff === 'no'
        ? { en: `The answer is due within three months of receipt, by ${due} (§ 15(3) EntgTranspG). If the employer does not answer, it bears the burden of proof in a dispute that there was no breach of equal pay (§ 15(5)).`, de: `Die Auskunft ist innerhalb von drei Monaten nach Zugang fällig, also bis zum ${due} (§ 15 Abs. 3 EntgTranspG). Antwortet der Arbeitgeber nicht, muss er im Streitfall beweisen, dass kein Verstoß gegen das Entgeltgleichheitsgebot vorliegt (§ 15 Abs. 5).`, nl: `Het antwoord moet binnen drie maanden na ontvangst komen, uiterlijk ${due} (§ 15, lid 3, EntgTranspG). Antwoordt de werkgever niet, dan moet hij bij een geschil bewijzen dat er geen sprake is van ongelijke beloning (§ 15, lid 5).` }[lang]
        : { en: `The letter asks for an answer within three months, by ${due}. The fixed three-month deadline in § 15(3) EntgTranspG is written for employers that do not apply a collective pay agreement.`, de: `Das Schreiben bittet um Antwort innerhalb von drei Monaten, also bis zum ${due}. Die feste Dreimonatsfrist des § 15 Abs. 3 EntgTranspG steht im Abschnitt für Arbeitgeber ohne Tarifbindung.`, nl: `De brief vraagt om antwoord binnen drie maanden, uiterlijk ${due}. De vaste termijn van drie maanden in § 15, lid 3, EntgTranspG staat in het deel voor werkgevers zonder cao-binding.` }[lang]);
    } else if (rule.mode === 'statutory') {
      out.push({ en: `Your employer must answer by ${due} (${period(lang, rule.regime.deadline)} under ${rule.regime.short.en}).`, de: `Ihr Arbeitgeber muss bis zum ${due} antworten (Frist: ${periodNom(lang, rule.regime.deadline)}, ${rule.regime.short.de}).`, nl: `Je werkgever moet uiterlijk ${due} antwoorden (termijn: ${period(lang, rule.regime.deadline)}, ${rule.regime.short.nl}).` }[lang]);
      if (rule.regime.deadline.days) out.push({ en: 'The date assumes your employer receives the letter on the date it carries. If it arrives later, count the days from the day it arrives.', de: 'Das Datum setzt voraus, dass das Schreiben am Tag seines Datums eingeht. Kommt es später an, zählen die Tage ab dem Eingang.', nl: 'Die datum gaat ervan uit dat je werkgever de brief ontvangt op de dag die erop staat. Komt hij later aan, tel de dagen dan vanaf de ontvangst.' }[lang]);
    } else if (rule.status === 'unknown') {
      out.push({ en: `We could not confirm on an official source whether this right is in force ${inCountry('en', input.country)}. The letter asks for a reply by ${due}, the directive’s two months.`, de: `Ob dieses Recht ${inCountry('de', input.country)} schon gilt, konnten wir in keiner amtlichen Quelle bestätigen. Das Schreiben bittet um Antwort bis zum ${due}, also innerhalb der zwei Monate der Richtlinie.`, nl: `We konden in geen officiële bron bevestigen of dit recht ${inCountry('nl', input.country)} al geldt. De brief vraagt om antwoord uiterlijk ${due}, de twee maanden van de richtlijn.` }[lang]);
    } else {
      out.push({ en: `There is no legal deadline yet ${inCountry('en', input.country)}. The letter asks for a reply by ${due}, the directive’s two months.`, de: `${cap(inCountry('de', input.country))} gibt es noch keine gesetzliche Frist. Das Schreiben bittet um Antwort bis zum ${due}, also innerhalb der zwei Monate der Richtlinie.`, nl: `${cap(inCountry('nl', input.country))} geldt nog geen wettelijke termijn. De brief vraagt om antwoord uiterlijk ${due}, de twee maanden van de richtlijn.` }[lang]);
    }
    for (const n of (R.NOTES[input.country] || {})[lang] || []) out.push(n);
    out.push({ en: 'If there is no answer, remind your employer in writing and ask your workers’ representatives or trade union for help. Your national equality body can also advise you.', de: 'Kommt keine Antwort, erinnern Sie schriftlich und bitten Sie Ihre Arbeitnehmervertretung oder Gewerkschaft um Unterstützung. Auch die nationale Gleichbehandlungsstelle kann Sie beraten.', nl: 'Komt er geen antwoord, stuur dan een schriftelijke herinnering en vraag je werknemersvertegenwoordiging of vakbond om hulp. Ook het nationale orgaan voor gelijke behandeling kan je adviseren.' }[lang]);
    out.push({ en: 'The directive requires Member States to protect workers against less favourable treatment for using their equal pay rights (Article 25).', de: 'Die Richtlinie verpflichtet die Mitgliedstaaten, Beschäftigte vor Benachteiligung zu schützen, wenn sie ihre Rechte auf gleiches Entgelt wahrnehmen (Artikel 25).', nl: 'De richtlijn verplicht de lidstaten werknemers te beschermen tegen benadeling als zij hun rechten op gelijke beloning gebruiken (artikel 25).' }[lang]);
    return { rule, steps: out };
  }

  // ---------- The employer's answer ----------
  // data: { lang, country, opts, received, sent, workerName, employer, signatory, signatoryTitle, category, year,
  //         basis: 'both'|'annual'|'hourly', parttime: 'paid'|'fte', currency, own: { annual, hourly },
  //         women: { n, annual, hourly, withheld }, men: { n, annual, hourly, withheld }, criteriaWhere,
  //         entg: { otherSex: 'M'|'F', median, n, share, variableMedian, withheld } (Germany, EntgTranspG mode) }
  function answerLetter(data) {
    const lang = data.lang || 'en';
    const received = R.parseISO(data.received) ? data.received : R.iso(new Date());
    const sent = R.parseISO(data.sent) ? data.sent : R.iso(new Date());
    const rule = R.ruleFor(data.country, data.opts || {}, received);
    const L = { lang, kind: 'answer', country: data.country, rule, date: sent, received, due: rule.due };
    L.sender = [clean(data.employer)].filter(Boolean);
    L.dateLine = longDate(lang, sent);
    L.recipient = [clean(data.workerName)].filter(Boolean);
    const cur = data.currency || 'EUR';
    // The free preview hides every figure: the page turns this token into a grey bar.
    const NA = { en: 'not available', de: 'nicht verfügbar', nl: 'niet beschikbaar' }[lang];
    const m = x => (data.maskFigures ? '{{fig}}' : x == null || !Number.isFinite(x) ? NA : money(lang, x, cur));
    const recv = longDate(lang, received);
    const yr = data.year ? String(data.year) : '';
    const name = clean(data.workerName);
    L.salutation = name ? { en: `Dear ${name},`, de: `Guten Tag ${name},`, nl: `Beste ${name},` }[lang] : { en: 'Dear colleague,', de: 'Sehr geehrte Damen und Herren,', nl: 'Geachte heer, mevrouw,' }[lang];
    L.closing = { en: 'Kind regards,', de: 'Mit freundlichen Grüßen', nl: 'Met vriendelijke groet,' }[lang];
    L.signature = [clean(data.signatory), clean(data.signatoryTitle), clean(data.employer)].filter(Boolean);
    const blocks = [];
    const cat = clean(data.category);
    if (data.entg) return entgAnswer(L, data, m, recv, yr, cat);

    const basisClause = rule.mode === 'statutory' ? { en: ` under ${rule.regime.basis.en}`, de: ` nach ${rule.regime.basis.de}`, nl: ` op grond van ${rule.regime.basis.nl}` }[lang] : { en: `, as Article 7 of ${DIRECTIVE.en} provides`, de: ` im Sinne von Artikel 7 der ${DIRECTIVE.de}`, nl: `, zoals artikel 7 van ${DIRECTIVE.nl} bedoelt` }[lang];
    blocks.push({ p: { en: `On ${recv} you asked for information about your pay level and the average pay levels of workers who do the same work as you or work of equal value${basisClause}. This letter gives that information${yr ? ` for ${yr}` : ''}.`, de: `Sie haben am ${recv} um Auskunft über Ihre Entgelthöhe und die durchschnittlichen Entgelthöhen der Beschäftigten mit gleicher oder gleichwertiger Arbeit gebeten${basisClause}. Mit diesem Schreiben erhalten Sie diese Auskunft${yr ? ` für das Jahr ${yr}` : ''}.`, nl: `Op ${recv} heeft u gevraagd om informatie over uw beloningsniveau en de gemiddelde beloningsniveaus van werknemers die hetzelfde of gelijkwaardig werk verrichten${basisClause}. In deze brief vindt u die informatie${yr ? ` over ${yr}` : ''}.` }[lang] });
    if (cat) blocks.push({ p: { en: `Your category of workers: ${cat}.`, de: `Ihre Gruppe von Beschäftigten: ${cat}.`, nl: `Uw categorie werknemers: ${cat}.` }[lang] });
    const show = data.basis || 'both';
    const fig = f => {
      const a = show !== 'hourly' ? { en: `gross annual pay ${m(f.annual)}`, de: `Bruttojahresentgelt ${m(f.annual)}`, nl: `brutojaarloon ${m(f.annual)}` }[lang] : '';
      const h = show !== 'annual' ? { en: `gross hourly pay ${m(f.hourly)}`, de: `Bruttostundenentgelt ${m(f.hourly)}`, nl: `bruto-uurloon ${m(f.hourly)}` }[lang] : '';
      return [a, h].filter(Boolean).join('; ');
    };
    if (data.own) blocks.push({ p: { en: `Your pay level: ${fig(data.own)}.`, de: `Ihre Entgelthöhe: ${fig(data.own)}.`, nl: `Uw beloningsniveau: ${fig(data.own)}.` }[lang] });
    blocks.push({ p: { en: 'Average pay levels in your category:', de: 'Durchschnittliche Entgelthöhen in Ihrer Gruppe:', nl: 'Gemiddelde beloningsniveaus in uw categorie:' }[lang] });
    const line = (f, who) => {
      const label = { en: { F: 'women', M: 'men' }, de: { F: 'Frauen', M: 'Männer' }, nl: { F: 'vrouwen', M: 'mannen' } }[lang][who];
      if (f.withheld) return { en: `${label} (${f.n}): not given here, because with so few people the average would disclose a colleague’s pay`, de: `${label} (${f.n}): hier nicht angegeben, weil der Durchschnitt bei so wenigen Personen das Entgelt einer Kollegin oder eines Kollegen offenlegen würde`, nl: `${label} (${f.n}): hier niet vermeld, omdat het gemiddelde bij zo weinig mensen het loon van een collega zou prijsgeven` }[lang];
      if (!f.n) return { en: `${label}: there are none in this category`, de: `${label}: in dieser Gruppe gibt es keine`, nl: `${label}: die zijn er in deze categorie niet` }[lang];
      return `${label} (${f.n}): ${fig(f)}`;
    };
    blocks.push({ list: [line(data.women, 'F'), line(data.men, 'M')] });
    blocks.push({ p: methodText(lang, data) });
    const where = clean(data.criteriaWhere);
    if (where) blocks.push({ p: { en: `The criteria used to set pay, pay levels and pay progression are set out in ${where}.`, de: `Die Kriterien für die Festlegung von Entgelt, Entgelthöhe und Entgeltentwicklung finden Sie in ${where}.`, nl: `De criteria voor het bepalen van beloning, beloningsniveaus en beloningsontwikkeling vindt u in ${where}.` }[lang] });
    blocks.push({ p: { en: 'If anything in this answer is unclear or incomplete, you can ask for clarification and you will receive a reasoned reply.', de: 'Ist etwas an dieser Auskunft unklar oder unvollständig, können Sie Klarstellungen verlangen und erhalten eine begründete Antwort.', nl: 'Is iets in dit antwoord onduidelijk of onvolledig, dan kunt u om verduidelijking vragen; u krijgt dan een gemotiveerd antwoord.' }[lang] });
    blocks.push({ p: { en: 'Please use the information about colleagues only to exercise your right to equal pay.', de: 'Bitte verwenden Sie die Angaben über andere Beschäftigte nur, um Ihr Recht auf gleiches Entgelt wahrzunehmen.', nl: 'Gebruik de informatie over collega’s alleen om uw recht op gelijke beloning uit te oefenen.' }[lang] });
    L.subject = { en: `Your request for pay information of ${recv}`, de: `Ihre Anfrage zur Entgeltauskunft vom ${recv}`, nl: `Uw verzoek om informatie over beloning van ${recv}` }[lang];
    L.blocks = blocks;
    return L;
  }

  function methodText(lang, data) {
    const yr = data.year ? String(data.year) : '';
    const fte = data.parttime === 'fte';
    const show = data.basis || 'both';
    const parts = [];
    parts.push({ en: `Pay includes basic pay and complementary or variable pay${yr ? ` for ${yr}` : ''}. The averages are means.`, de: `Das Entgelt umfasst das Grundentgelt und ergänzende oder variable Bestandteile${yr ? ` für ${yr}` : ''}. Die Durchschnitte sind arithmetische Mittel.`, nl: `De beloning omvat het basisloon en aanvullende of variabele componenten${yr ? ` over ${yr}` : ''}. De gemiddelden zijn rekenkundige gemiddelden.` }[lang]);
    if (show !== 'hourly') parts.push(fte
      ? { en: 'Annual pay of part-time workers is converted to a full-time equivalent (annual pay divided by the full-time equivalent).', de: 'Das Jahresentgelt von Teilzeitbeschäftigten ist auf Vollzeit hochgerechnet (Jahresentgelt geteilt durch den Vollzeitanteil).', nl: 'Het jaarloon van deeltijdwerkers is omgerekend naar voltijd (jaarloon gedeeld door de deeltijdfactor).' }[lang]
      : { en: 'Annual pay is the pay actually received for the year, so it is lower for part-time workers.', de: 'Das Jahresentgelt ist das tatsächlich gezahlte Entgelt des Jahres und daher bei Teilzeit niedriger.', nl: 'Het jaarloon is het werkelijk betaalde loon over het jaar en is bij deeltijd dus lager.' }[lang]);
    if (show !== 'annual') parts.push({ en: 'Hourly pay is annual pay divided by the hours paid, so part-time work does not lower it.', de: 'Das Stundenentgelt ist das Jahresentgelt geteilt durch die bezahlten Stunden; Teilzeit senkt es daher nicht.', nl: 'Het uurloon is het jaarloon gedeeld door de betaalde uren; deeltijd verlaagt het dus niet.' }[lang]);
    return parts.join(' ');
  }

  function entgAnswer(L, data, m, recv, yr, cat) {
    const lang = L.lang, e = data.entg;
    const other = { en: { M: 'men', F: 'women' }, de: { M: 'Männer', F: 'Frauen' }, nl: { M: 'mannen', F: 'vrouwen' } }[lang][e.otherSex];
    const blocks = [];
    blocks.push({ p: { en: `On ${recv} you asked for information under section 10 of the Pay Transparency Act (EntgTranspG)${cat ? ` and named the comparison activity “${cat}”` : ''}. Here is our answer${yr ? ` for the calendar year ${yr}` : ''}.`, de: `Sie haben am ${recv} Auskunft nach § 10 Entgelttransparenzgesetz (EntgTranspG) verlangt${cat ? ` und als Vergleichstätigkeit „${cat}“ benannt` : ''}. Hier ist unsere Auskunft${yr ? ` für das Kalenderjahr ${yr}` : ''}.`, nl: `Op ${recv} heeft u om informatie gevraagd op grond van § 10 Entgelttransparenzgesetz (EntgTranspG)${cat ? ` en als vergelijkingsfunctie “${cat}” genoemd` : ''}. Hier is ons antwoord${yr ? ` over het kalenderjaar ${yr}` : ''}.` }[lang] });
    const where = clean(data.criteriaWhere);
    blocks.push({ p: where
      ? { en: `Criteria and procedures for setting pay (section 11(2) EntgTranspG): ${where}.`, de: `Kriterien und Verfahren der Entgeltfindung (§ 11 Abs. 2 EntgTranspG): ${where}.`, nl: `Criteria en procedures voor de loonbepaling (§ 11, lid 2, EntgTranspG): ${where}.` }[lang]
      : { en: 'Criteria and procedures for setting pay (section 11(2) EntgTranspG): [describe them, or name the collective agreement and where it can be read].', de: 'Kriterien und Verfahren der Entgeltfindung (§ 11 Abs. 2 EntgTranspG): [beschreiben, oder den Tarifvertrag nennen und angeben, wo er einzusehen ist].', nl: 'Criteria en procedures voor de loonbepaling (§ 11, lid 2, EntgTranspG): [beschrijven, of de cao noemen en aangeven waar die in te zien is].' }[lang] });
    if (e.withheld) blocks.push({ p: { en: `Fewer than six ${other} perform the comparison activity, so the comparison pay is not stated (section 12(3) EntgTranspG).`, de: `Die Vergleichstätigkeit wird von weniger als sechs Beschäftigten des anderen Geschlechts ausgeübt. Das Vergleichsentgelt wird daher nach § 12 Abs. 3 EntgTranspG nicht angegeben.`, nl: `Minder dan zes ${other} verrichten de vergelijkingsfunctie; het vergelijkingsloon wordt daarom niet vermeld (§ 12, lid 3, EntgTranspG).` }[lang] });
    else {
      blocks.push({ p: { en: `Comparison pay (section 11(3) EntgTranspG): the median of the average monthly gross pay of the ${e.n} ${other} in the comparison activity, converted to full-time equivalents, was ${m(e.median)}.`, de: `Vergleichsentgelt (§ 11 Abs. 3 EntgTranspG): Der auf Vollzeitäquivalente hochgerechnete Median des durchschnittlichen monatlichen Bruttoentgelts der ${e.n} ${other} in der Vergleichstätigkeit beträgt ${m(e.median)}.`, nl: `Vergelijkingsloon (§ 11, lid 3, EntgTranspG): de mediaan van het gemiddelde bruto maandloon van de ${e.n} ${other} in de vergelijkingsfunctie, omgerekend naar voltijd, bedraagt ${m(e.median)}.` }[lang] });
      if (e.variableMedian != null) blocks.push({ p: { en: `For the pay component complementary and variable pay, the corresponding median is ${m(e.variableMedian)} a month.`, de: `Für den Entgeltbestandteil ergänzende und variable Vergütung beträgt der entsprechende Median ${m(e.variableMedian)} im Monat.`, nl: `Voor de looncomponent aanvullende en variabele beloning bedraagt de overeenkomstige mediaan ${m(e.variableMedian)} per maand.` }[lang] });
    }
    if (e.share != null) {
      const most = e.share > 50;
      blocks.push({ p: { en: `The comparison activity is ${most ? '' : 'not '}performed mainly by ${other} (${e.count} of ${e.total}) (section 15(4) EntgTranspG).`, de: `Die Vergleichstätigkeit wird ${most ? '' : 'nicht '}überwiegend von Beschäftigten des anderen Geschlechts ausgeübt (${e.count} von ${e.total}) (§ 15 Abs. 4 EntgTranspG).`, nl: `De vergelijkingsfunctie wordt ${most ? '' : 'niet '}overwegend door ${other} verricht (${e.count} van ${e.total}) (§ 15, lid 4, EntgTranspG).` }[lang] });
    }
    L.subject = { en: `Your request under section 10 EntgTranspG of ${recv}`, de: `Ihr Auskunftsverlangen nach § 10 EntgTranspG vom ${recv}`, nl: `Uw verzoek op grond van § 10 EntgTranspG van ${recv}` }[lang];
    L.blocks = blocks;
    L.entg = true;
    return L;
  }

  // ---------- The yearly notice to all workers (Article 7(3)) ----------
  // data: { lang, country, opts, date, employer, contact, representatives, criteriaWhere }
  function annualNotice(data) {
    const lang = data.lang || 'en';
    const date = R.parseISO(data.date) ? data.date : R.iso(new Date());
    const rule = R.ruleFor(data.country || 'IE', data.opts || {}, date);
    const emp = clean(data.employer) || { en: '[Employer]', de: '[Arbeitgeber]', nl: '[Werkgever]' }[lang];
    const contact = clean(data.contact) || { en: '[name or email address]', de: '[Name oder E-Mail-Adresse]', nl: '[naam of e-mailadres]' }[lang];
    const reps = clean(data.representatives);
    const reg = rule.mode === 'statutory' && rule.regime.kind === 'art7' ? rule.regime : null;
    const per = reg ? period(lang, reg.deadline) : period(lang, { months: 2 });
    const L = { lang, kind: 'notice', date, country: data.country };
    L.sender = [emp];
    L.dateLine = longDate(lang, date);
    L.recipient = [{ en: 'To all staff', de: 'An alle Beschäftigten', nl: 'Aan alle medewerkers' }[lang]];
    L.subject = { en: 'Your right to information about pay', de: 'Ihr Recht auf Auskunft über das Entgelt', nl: 'Uw recht op informatie over beloning' }[lang];
    L.salutation = { en: 'Dear colleagues,', de: 'Liebe Kolleginnen und Kollegen,', nl: 'Beste collega’s,' }[lang];
    const blocks = [];
    blocks.push({ p: reg
      ? { en: `Each year we remind everyone who works for ${emp} of their right to information about pay. Under ${reg.basis.en}, you can ask for, and receive in writing:`, de: `jedes Jahr erinnern wir alle Beschäftigten von ${emp} an ihr Recht auf Auskunft über das Entgelt. Nach ${reg.basis.de} können Sie folgende Auskünfte verlangen und schriftlich erhalten:`, nl: `Elk jaar wijzen we iedereen die bij ${emp} werkt op het recht op informatie over beloning. Op grond van ${reg.basis.nl} kunt u de volgende informatie opvragen en schriftelijk ontvangen:` }[lang]
      : { en: `Each year we remind everyone who works for ${emp} of their right to information about pay. Article 7 of ${DIRECTIVE.en} gives workers this right, and we answer such requests on its terms. You can ask for, and receive in writing:`, de: `jedes Jahr erinnern wir alle Beschäftigten von ${emp} an ihr Recht auf Auskunft über das Entgelt. Artikel 7 der ${DIRECTIVE.de} gibt Beschäftigten dieses Recht, und wir beantworten solche Anfragen nach diesen Regeln. Sie können folgende Auskünfte verlangen und schriftlich erhalten:`, nl: `Elk jaar wijzen we iedereen die bij ${emp} werkt op het recht op informatie over beloning. Artikel 7 van ${DIRECTIVE.nl} geeft werknemers dit recht, en wij beantwoorden zulke verzoeken volgens die regels. U kunt de volgende informatie opvragen en schriftelijk ontvangen:` }[lang] });
    blocks.push({ list: [
      { en: 'your individual pay level, as gross annual pay and the corresponding gross hourly pay', de: 'Ihre individuelle Entgelthöhe, also Ihr Bruttojahresentgelt und das entsprechende Bruttostundenentgelt', nl: 'uw individuele beloningsniveau: uw brutojaarloon en het overeenkomstige bruto-uurloon' }[lang],
      { en: 'the average pay levels, broken down by sex, for the category of workers who do the same work as you or work of equal value', de: 'die durchschnittlichen Entgelthöhen, aufgeschlüsselt nach Geschlecht, für die Gruppe der Beschäftigten mit gleicher oder gleichwertiger Arbeit wie Sie', nl: 'de naar geslacht uitgesplitste gemiddelde beloningsniveaus voor de categorie werknemers die hetzelfde of gelijkwaardig werk verrichten als u' }[lang],
    ] });
    blocks.push({ h: { en: 'How to ask', de: 'So stellen Sie die Anfrage', nl: 'Zo vraagt u het aan' }[lang] });
    const steps = [
      { en: `Send your request in writing, by email or on paper, to ${contact}.`, de: `Schicken Sie Ihre Anfrage schriftlich, per E-Mail oder auf Papier, an ${contact}.`, nl: `Stuur uw verzoek schriftelijk, per e-mail of op papier, naar ${contact}.` }[lang],
      { en: 'Say that you are asking for your pay level and the average pay levels of your category. You do not need to give a reason.', de: 'Schreiben Sie, dass Sie Ihre Entgelthöhe und die durchschnittlichen Entgelthöhen Ihrer Gruppe erfragen. Eine Begründung ist nicht nötig.', nl: 'Vermeld dat u uw beloningsniveau en de gemiddelde beloningsniveaus van uw categorie opvraagt. U hoeft geen reden te geven.' }[lang],
      reps ? { en: `You can also ask through ${reps}.`, de: `Sie können auch über ${reps} fragen.`, nl: `U kunt het ook via ${reps} vragen.` }[lang]
        : { en: 'You can also ask through your workers’ representatives or through the national equality body.', de: 'Sie können auch über Ihre Arbeitnehmervertretung oder die nationale Gleichbehandlungsstelle fragen.', nl: 'U kunt het ook via uw werknemersvertegenwoordiging of het nationale orgaan voor gelijke behandeling vragen.' }[lang],
      { en: `We reply in writing within ${per} of receiving your request.`, de: `Wir antworten schriftlich innerhalb von ${per} nach Eingang Ihrer Anfrage.`, nl: `Wij antwoorden schriftelijk binnen ${per} na ontvangst van uw verzoek.` }[lang],
      { en: 'If anything in our answer is unclear or incomplete, you can ask for clarification and receive a reasoned reply.', de: 'Ist etwas an unserer Antwort unklar oder unvollständig, können Sie Klarstellungen verlangen und erhalten eine begründete Antwort.', nl: 'Is iets in ons antwoord onduidelijk of onvolledig, dan kunt u om verduidelijking vragen en krijgt u een gemotiveerd antwoord.' }[lang],
    ];
    blocks.push({ list: steps, ordered: true });
    const where = clean(data.criteriaWhere);
    if (where) blocks.push({ p: { en: `The criteria we use to set pay, pay levels and pay progression are set out in ${where}.`, de: `Die Kriterien, nach denen wir Entgelt, Entgelthöhe und Entgeltentwicklung festlegen, finden Sie in ${where}.`, nl: `De criteria waarmee wij beloning, beloningsniveaus en beloningsontwikkeling bepalen, vindt u in ${where}.` }[lang] });
    blocks.push({ p: { en: 'You may share information about your own pay in order to enforce equal pay, and nobody will be treated less favourably for using these rights. Information you receive about colleagues may be used only to exercise your right to equal pay.', de: 'Sie dürfen Angaben zu Ihrem eigenen Entgelt weitergeben, um gleiches Entgelt durchzusetzen, und niemand wird benachteiligt, weil er diese Rechte nutzt. Angaben über andere Beschäftigte dürfen Sie nur verwenden, um Ihr Recht auf gleiches Entgelt wahrzunehmen.', nl: 'U mag informatie over uw eigen loon delen om gelijke beloning af te dwingen, en niemand wordt benadeeld omdat hij of zij deze rechten gebruikt. Informatie over collega’s mag u alleen gebruiken om uw recht op gelijke beloning uit te oefenen.' }[lang] });
    if (data.country === 'DE') blocks.push({ p: { en: 'In establishments with, as a rule, more than 200 employees, you can also ask under section 10 of the Pay Transparency Act (EntgTranspG).', de: 'In Betrieben mit in der Regel mehr als 200 Beschäftigten können Sie außerdem Auskunft nach § 10 Entgelttransparenzgesetz verlangen.', nl: 'In vestigingen met doorgaans meer dan 200 werknemers kunt u daarnaast informatie vragen op grond van § 10 Entgelttransparenzgesetz.' }[lang] });
    L.blocks = blocks;
    L.closing = { en: 'Kind regards,', de: 'Mit freundlichen Grüßen', nl: 'Met vriendelijke groet,' }[lang];
    L.signature = [clean(data.signatory), emp].filter(Boolean);
    return L;
  }

  // ---------- Pay setting and progression criteria (Article 6), a template to fill in ----------
  function criteriaTemplate(data) {
    const lang = data.lang || 'en';
    const emp = clean(data.employer) || { en: '[Employer]', de: '[Arbeitgeber]', nl: '[Werkgever]' }[lang];
    const date = R.parseISO(data.date) ? data.date : R.iso(new Date());
    const L = { lang, kind: 'criteria', date };
    L.sender = [emp];
    L.dateLine = longDate(lang, date);
    L.recipient = [];
    L.subject = { en: `How pay is set at ${emp}`, de: `So legt ${emp} das Entgelt fest`, nl: `Zo bepaalt ${emp} de beloning` }[lang];
    L.salutation = '';
    const sec = (h, p) => [{ h }, { p }];
    const T = {
      en: [
        sec('Pay structure', '[Describe the pay grades or bands and which roles sit in each. If you apply a collective agreement, name it and the pay scale used.]'),
        sec('How jobs are valued', 'Jobs are placed in grades on objective, gender-neutral criteria: skills, effort, responsibility and working conditions, and [other factors relevant to the job, if any] (Article 4(4)). [Describe the job evaluation method and who carries it out.]'),
        sec('Pay levels', '[For each grade, give the pay range or the scale, and say what decides where in the range someone starts.]'),
        sec('Pay progression', '[Explain how someone moves to a higher pay level: for example performance, skills development or seniority; how often pay is reviewed; and who decides.] Where national law allows, employers with fewer than 50 workers may be exempt from this part (Article 6(2)).'),
        sec('Complementary and variable pay', '[List bonuses, allowances and benefits in kind, who can receive them, and the criteria for each.]'),
        sec('Questions', '[Who to ask about pay, and how to request the information in Article 7.]'),
      ],
      de: [
        sec('Entgeltstruktur', '[Beschreiben Sie die Entgeltgruppen oder Bänder und welche Funktionen dazugehören. Wenden Sie einen Tarifvertrag an, nennen Sie ihn und die Entgelttabelle.]'),
        sec('Bewertung der Tätigkeiten', 'Tätigkeiten werden nach objektiven, geschlechtsneutralen Kriterien eingruppiert: Kompetenzen, Belastungen, Verantwortung und Arbeitsbedingungen sowie [gegebenenfalls weitere für die Stelle maßgebliche Faktoren] (Artikel 4 Absatz 4). [Beschreiben Sie das Bewertungsverfahren und wer es durchführt.]'),
        sec('Entgelthöhen', '[Nennen Sie für jede Gruppe die Spanne oder die Tabellenwerte und was über die Einstufung beim Einstieg entscheidet.]'),
        sec('Entgeltentwicklung', '[Erklären Sie, wie man in eine höhere Entgeltstufe kommt, zum Beispiel über Leistung, Kompetenzentwicklung oder Betriebszugehörigkeit, wie oft das Entgelt überprüft wird und wer entscheidet.] Wo das nationale Recht es vorsieht, können Arbeitgeber mit weniger als 50 Beschäftigten von diesem Teil ausgenommen sein (Artikel 6 Absatz 2).'),
        sec('Ergänzende und variable Bestandteile', '[Nennen Sie Boni, Zulagen und Sachleistungen, wer sie erhalten kann und nach welchen Kriterien.]'),
        sec('Fragen', '[Wen man zum Entgelt fragen kann und wie man die Auskunft nach Artikel 7 verlangt.]'),
      ],
      nl: [
        sec('Loongebouw', '[Beschrijf de loonschalen of -banden en welke functies erin vallen. Past u een cao toe, noem die dan en de gebruikte loontabel.]'),
        sec('Waardering van functies', 'Functies worden ingedeeld op objectieve, genderneutrale criteria: vaardigheden, inspanning, verantwoordelijkheid en arbeidsomstandigheden, en [eventueel andere factoren die voor de functie van belang zijn] (artikel 4, lid 4). [Beschrijf de methode van functiewaardering en wie die uitvoert.]'),
        sec('Beloningsniveaus', '[Geef per schaal de bandbreedte of de tabelbedragen en wat bepaalt waar iemand instroomt.]'),
        sec('Beloningsontwikkeling', '[Leg uit hoe iemand naar een hoger beloningsniveau gaat, bijvoorbeeld via prestaties, ontwikkeling van vaardigheden of anciënniteit; hoe vaak de beloning wordt herzien; en wie beslist.] Waar het nationale recht dat toestaat, kunnen werkgevers met minder dan 50 werknemers van dit deel zijn vrijgesteld (artikel 6, lid 2).'),
        sec('Aanvullende en variabele beloning', '[Noem bonussen, toeslagen en voordelen in natura, wie ze kan krijgen en op welke criteria.]'),
        sec('Vragen', '[Bij wie men terechtkan met vragen over beloning en hoe men de informatie uit artikel 7 opvraagt.]'),
      ],
    };
    L.blocks = [].concat(...T[lang]);
    L.blocks.push({ p: { en: 'These criteria are objective and gender-neutral (Article 6(1) of Directive (EU) 2023/970). Last reviewed: [date].', de: 'Diese Kriterien sind objektiv und geschlechtsneutral (Artikel 6 Absatz 1 der Richtlinie (EU) 2023/970). Zuletzt überprüft: [Datum].', nl: 'Deze criteria zijn objectief en genderneutraal (artikel 6, lid 1, van Richtlijn (EU) 2023/970). Laatst herzien: [datum].' }[lang] });
    L.closing = '';
    L.signature = [];
    return L;
  }

  // ---------- Plain text ----------
  function listItems(L, b) {
    const n = b.list.length;
    const lang = L.lang;
    return b.list.map((t, i) => {
      const last = i === n - 1;
      let s = String(t).replace(/[.;,]\s*$/, '');
      if (!b.ordered) s += last ? '.' : (lang === 'de' ? ',' : ';');
      else if (!/[.?!]$/.test(s)) s += '.';
      return (b.ordered ? `${i + 1}. ` : `${String.fromCharCode(97 + i)}) `) + s;
    });
  }
  function toText(L) {
    const out = [];
    if (L.sender && L.sender.length) out.push(L.sender.join('\n'));
    if (L.recipient && L.recipient.length) out.push(L.recipient.join('\n'));
    if (L.dateLine) out.push(L.dateLine);
    if (L.subject) out.push((L.lang === 'nl' ? 'Onderwerp: ' : L.lang === 'de' ? 'Betreff: ' : 'Subject: ') + L.subject);
    if (L.salutation) out.push(L.salutation);
    for (const b of L.blocks || []) {
      if (b.p) out.push(b.p);
      else if (b.h) out.push(b.h);
      else if (b.list) out.push(listItems(L, b).join('\n'));
    }
    if (L.closing) out.push(L.closing + (L.signature && L.signature.length ? '\n\n' + L.signature.join('\n') : ''));
    else if (L.signature && L.signature.length) out.push(L.signature.join('\n'));
    return out.join('\n\n') + '\n';
  }

  return { workerLetter, answerLetter, annualNotice, criteriaTemplate, nextSteps, toText, listItems, longDate, money, period, inCountry };
});
