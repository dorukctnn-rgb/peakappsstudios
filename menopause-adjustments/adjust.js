/* Menopause adjustments at work: the ideas, where each comes from, and the request letter.
 * Every idea is a change that Acas or the GOV.UK action pages for employers list, quoted with its source and the date
 * the page was last checked. Which idea is shown for which symptom or work situation is our own grouping, to help a
 * reader choose; the guidance lists the changes without tying them to particular symptoms, and the page says so.
 * The letter asks for a conversation. It does not say that symptoms are a disability or that any change is a legal
 * right: the Equality and Human Rights Commission's wording on when the Equality Act can apply is shown on the page.
 * Pure data and functions, no DOM: window.MenoAdjust in the browser, module.exports in Node. The letter PDF is set in
 * the pay equity family's text face (/assets/pe-pdf.js, loaded with pdf-lib, which fetches the font files). */
(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory(() => require('../assets/pe-pdf.js'));
  else root.MenoAdjust = factory(() => root.PEPdf);
})(typeof self !== 'undefined' ? self : this, function (getPE) {
  'use strict';

  const CHECKED = '10 October 2026';
  const PUB = 'https://www.gov.uk/government/publications/';
  const SOURCES = {
    acasTalk: { label: 'Acas, Menopause at work: Talking with workers (updated 7 April 2026)', url: 'https://www.acas.org.uk/menopause-at-work/talking-with-staff-about-the-menopause' },
    acasSupport: { label: 'Acas, Menopause at work: Supporting workers (updated 7 April 2026)', url: 'https://www.acas.org.uk/menopause-at-work/supporting-staff-through-the-menopause' },
    acasLaw: { label: 'Acas, Menopause at work: Menopause and discrimination (updated 7 April 2026)', url: 'https://www.acas.org.uk/menopause-at-work/menopause-and-the-law' },
    govAdjust: { label: 'GOV.UK, Offer workplace adjustments for employees experiencing menopause', url: PUB + 'offer-workplace-adjustments-for-employees-experiencing-menopause/offer-workplace-adjustments-for-employees-experiencing-menopause' },
    govRisk: { label: 'GOV.UK, Conduct a menopause risk assessment for your workplace', url: PUB + 'conduct-a-menopause-risk-assessment-for-your-workplace/conduct-a-menopause-risk-assessment-for-your-workplace' },
    govOH: { label: 'GOV.UK, Offer occupational health advice for employees experiencing menopause', url: PUB + 'offer-occupational-health-advice-for-employees-experiencing-menopause/offer-occupational-health-advice-for-employees-experiencing-menopause' },
    govGroups: { label: 'GOV.UK, Set up menopause support groups and networks', url: PUB + 'set-up-menopause-support-groups-and-networks/set-up-menopause-support-groups-and-networks' },
    govFlexAds: { label: 'GOV.UK, Advertise flexible working arrangements in job adverts', url: PUB + 'advertise-flexible-working-arrangements-in-job-adverts/advertise-flexible-working-arrangements-in-job-adverts' },
    ehrc: { label: 'Equality and Human Rights Commission, Menopause in the workplace: guidance for employers (updated 24 June 2026)', url: 'https://www.equalityhumanrights.com/guidance/menopause-workplace-guidance-employers' },
    nhs: { label: 'NHS, Symptoms of menopause and perimenopause', url: 'https://www.nhs.uk/conditions/menopause/symptoms/' },
  };

  // The EHRC's words on when the Equality Act 2010 can apply, quoted exactly on the page.
  const EHRC_QUOTE = 'If menopause or perimenopause symptoms have a long term and substantial impact on a woman’s ability to carry out normal day-to-day activities, these symptoms could be considered a disability. If menopause or perimenopause symptoms amount to a disability, an employer will be under a legal obligation to make reasonable adjustments.';
  const ACAS_QUOTE = 'Menopause is not a specific protected characteristic under the Equality Act 2010.';

  // Symptoms as the NHS names them (Symptoms of menopause and perimenopause)
  const SYMPTOMS = [
    { id: 'hot', name: 'Hot flushes and night sweats' },
    { id: 'sleep', name: 'Sleep problems and tiredness' },
    { id: 'periods', name: 'Heavier or more frequent periods' },
    { id: 'toilet', name: 'Needing the toilet more often' },
    { id: 'mood', name: 'Low mood, anxiety or stress' },
    { id: 'memory', name: 'Poor memory, concentration or brain fog' },
    { id: 'headaches', name: 'Headaches and migraines' },
    { id: 'aches', name: 'Muscle aches and joint pains' },
    { id: 'palpitations', name: 'Palpitations' },
  ];
  // Work situations Acas names as making symptoms harder to deal with, and the risk assessment points
  const SITUATIONS = [
    { id: 'shifts', name: 'I work long shifts' },
    { id: 'toiletBreaks', name: 'It is hard to take toilet breaks' },
    { id: 'uniform', name: 'I wear a uniform' },
    { id: 'inflexible', name: 'My job has little flexibility' },
    { id: 'hotPlace', name: 'My workplace is hot or poorly ventilated' },
    { id: 'homeWorking', name: 'I work from home some or all of the time' },
    { id: 'noRest', name: 'There is nowhere quiet to rest' },
    { id: 'manager', name: 'I would rather not start with my manager' },
  ];

  // Each idea: the request as it goes in the letter, what the guidance says (quoted), its sources, and our grouping.
  const IDEAS = [
    { id: 'start-finish', ask: 'flexibility over my start and finish times', title: 'Flexible start and finish times', quote: 'being flexible where possible over start and finish times to help them manage their symptoms', sources: ['acasTalk', 'govAdjust'], symptoms: ['sleep', 'memory', 'periods'], situations: ['shifts', 'inflexible'] },
    { id: 'breaks', ask: 'being able to take short breaks when I need them', title: 'Breaks when you need them', quote: 'allowing them to take breaks when needed', sources: ['acasTalk', 'govAdjust'], symptoms: ['hot', 'sleep', 'periods', 'toilet', 'mood', 'headaches', 'aches', 'palpitations'], situations: ['shifts', 'toiletBreaks'] },
    { id: 'rest', ask: 'somewhere private to rest for a few minutes when I need to', title: 'A private area to rest', quote: 'providing a private area where they can rest to help manage their symptoms', sources: ['acasTalk', 'govAdjust', 'govRisk'], symptoms: ['hot', 'mood', 'headaches', 'palpitations', 'memory'], situations: ['noRest', 'shifts'] },
    { id: 'home', ask: 'working from home on some days, where that is practical', title: 'Working from home when practical', quote: 'allowing them to work from home when practical', sources: ['acasTalk', 'govAdjust'], symptoms: ['sleep', 'hot', 'periods', 'toilet'], situations: ['inflexible'] },
    { id: 'time-off', ask: 'time off on a day when I cannot carry on working', title: 'Time off on a day you cannot carry on working', quote: 'allowing them time off if they cannot carry on working that day', sources: ['acasTalk'], symptoms: ['sleep', 'headaches', 'periods'], situations: [] },
    { id: 'duties', ask: 'changing some of my duties for a while', title: 'Changes to some duties', quote: 'changing certain duties in their role', sources: ['acasTalk'], symptoms: ['memory', 'aches', 'sleep', 'mood'], situations: ['shifts', 'inflexible'] },
    { id: 'environment', ask: 'some control over my working environment, such as a desk fan or a desk near a window that opens', title: 'Control over your working environment', quote: 'letting the person have control over their working environment, for example having a desk next to a window that opens or providing them with a fan', sources: ['acasTalk', 'govAdjust'], symptoms: ['hot', 'headaches'], situations: ['hotPlace', 'homeWorking'] },
    { id: 'temperature', ask: 'a look at the temperature and ventilation where I work', title: 'Temperature and ventilation checked', quote: 'the temperature and ventilation of the workplace', sources: ['govRisk', 'acasSupport'], symptoms: ['hot'], situations: ['hotPlace'] },
    { id: 'uniform', ask: 'a cooler or more comfortable uniform, and spare uniform', title: 'A cooler uniform, and spares', quote: 'the material and fit of your organisation’s uniform, and if it makes employees feel too hot; how easy it is to request extra uniforms', sources: ['govRisk', 'acasSupport'], symptoms: ['hot', 'periods'], situations: ['uniform'] },
    { id: 'toilets', ask: 'easy access to toilets during my working day', title: 'Easy access to toilets', quote: 'if toilet facilities are easy to get to', sources: ['govRisk', 'acasSupport'], symptoms: ['periods', 'toilet'], situations: ['toiletBreaks', 'shifts'] },
    { id: 'water', ask: 'access to cold drinking water', title: 'Cold drinking water', quote: 'if cold drinking water is available', sources: ['govRisk', 'acasSupport'], symptoms: ['hot'], situations: ['hotPlace', 'shifts'] },
    { id: 'furniture', ask: 'a chair or equipment that is more comfortable for my joints', title: 'Ergonomic furniture or equipment', quote: 'if ergonomic furniture is provided or can be requested', sources: ['govRisk', 'govAdjust'], symptoms: ['aches'], situations: ['homeWorking'] },
    { id: 'risk', ask: 'a risk assessment of my role that takes menopause into account', title: 'A risk assessment of your role', quote: 'For menopause, a risk assessment is about making sure symptoms are not made worse. For example, by the workplace or ways of working.', sources: ['acasSupport', 'govRisk'], symptoms: [], situations: ['hotPlace', 'uniform', 'noRest', 'homeWorking', 'shifts'] },
    { id: 'oh', ask: 'a referral for occupational health advice', title: 'Occupational health advice', quote: 'help employees manage menopause symptoms while they are at work', sources: ['govOH', 'govAdjust'], symptoms: ['mood', 'palpitations', 'memory', 'aches', 'sleep'], situations: [] },
    { id: 'someone-else', ask: 'the option to talk to someone other than my manager first, such as HR', title: 'Someone other than your manager to talk to', quote: 'employers should give them the option of talking with someone other than their manager', sources: ['acasTalk'], symptoms: ['mood'], situations: ['manager'] },
    { id: 'absence', ask: 'recording any absence because of menopause separately from other sickness absence', title: 'Menopause absence recorded separately', quote: 'When someone is off sick because of menopause, the employer should record these absences separately from other absences.', sources: ['acasSupport', 'acasLaw'], symptoms: ['sleep', 'headaches', 'mood', 'periods'], situations: [] },
    { id: 'appointments', ask: 'time to go to medical appointments about menopause', title: 'Time for medical appointments', quote: 'It’s also good practice for an employer to allow workers to go to medical appointments related to menopause. There is no law for this type of time off.', note: 'Acas calls this good practice and says there is no law for this time off, though your contract may give you paid or unpaid time off.', sources: ['acasSupport'], symptoms: [], situations: [] },
    { id: 'flexible-request', ask: 'a longer-term change to my hours or working pattern, through a flexible working request if that is the best way to do it', title: 'A flexible working request for a longer-term change', quote: 'If someone believes a longer term change to their job would help them with their menopause symptoms they could make a flexible working request.', note: 'GOV.UK says people can request flexible working from their first day of employment.', sources: ['acasTalk', 'govFlexAds'], symptoms: ['sleep'], situations: ['inflexible', 'shifts'] },
    { id: 'performance', ask: 'taking my symptoms into account in any conversation about my performance', title: 'Symptoms taken into account in performance discussions', quote: 'take into consideration any performance issues which might be because of menopause symptoms', sources: ['acasSupport'], symptoms: ['memory', 'sleep', 'mood'], situations: [] },
    { id: 'network', ask: 'information about any menopause support group or network', title: 'A support group or network', quote: 'encourage employees to share tips and experiences. This may help reduce feelings of isolation.', sources: ['govGroups', 'acasSupport'], symptoms: ['mood'], situations: [] },
  ].map(x => Object.assign(x, { sources: x.sources.map(k => Object.assign({ key: k }, SOURCES[k])) }));
  const BY_ID = Object.fromEntries(IDEAS.map(x => [x.id, x]));

  // Ideas for the chosen symptoms and situations, most matches first. With nothing chosen, every idea in list order.
  function suggest(symptoms, situations) {
    const s = new Set(symptoms || []), w = new Set(situations || []);
    if (!s.size && !w.size) return IDEAS.map(x => ({ idea: x, score: 0, because: [] }));
    const out = [];
    for (const x of IDEAS) {
      const because = x.symptoms.filter(k => s.has(k)).map(k => SYMPTOMS.find(y => y.id === k).name)
        .concat(x.situations.filter(k => w.has(k)).map(k => SITUATIONS.find(y => y.id === k).name));
      if (because.length) out.push({ idea: x, score: because.length, because });
    }
    return out.sort((a, b) => b.score - a.score || IDEAS.indexOf(a.idea) - IDEAS.indexOf(b.idea));
  }

  // ---------- The letter ----------
  const MONTHS = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];
  const longDate = d => `${d.getDate()} ${MONTHS[d.getMonth()]} ${d.getFullYear()}`;
  const lower = s => s.charAt(0).toLowerCase() + s.slice(1);
  const list = a => a.length < 2 ? a.join('') : a.slice(0, -1).join(', ') + ' and ' + a[a.length - 1];
  // opts: { name, role, manager, date (Date), ideas: [ids], symptoms: [ids], situations: [ids], mentionSymptoms, mentionWork,
  //         someoneElse: 'HR' | '', confidential, writing, reply: '' | '10' | '14', meeting: 'person' | 'call' | '' }
  function letter(opts) {
    const o = Object.assign({ ideas: [], symptoms: [], situations: [], mentionSymptoms: false, mentionWork: true, confidential: true, writing: true, reply: '', someoneElse: '' }, opts || {});
    const name = String(o.name || '').trim(), manager = String(o.manager || '').trim(), role = String(o.role || '').trim();
    const chosen = IDEAS.filter(x => o.ideas.includes(x.id)); // in the order of the list, whatever order they were ticked in
    const sym = SYMPTOMS.filter(s => o.symptoms.includes(s.id)).map(s => lower(s.name));
    const sit = SITUATIONS.map(x => x.id).filter(id => id !== 'manager' && o.situations.includes(id)).map(id => ({ shifts: 'long shifts', toiletBreaks: 'times when it is hard to take a toilet break', uniform: 'wearing a uniform', inflexible: 'fixed hours with little flexibility', hotPlace: 'a hot or poorly ventilated workplace', homeWorking: 'working from home', noRest: 'nowhere quiet to rest' }[id])).filter(Boolean);
    const paras = [];
    paras.push('I would like to ask for a private conversation about some changes at work that would help me manage menopause symptoms and keep doing my job well.');
    if (o.mentionSymptoms && sym.length) paras.push(`The symptoms that affect me most at work are ${list(sym)}.`);
    if (o.mentionWork && sit.length) paras.push(`Parts of my work, such as ${list(sit)}, can make them harder to manage.`);
    const intro = chosen.length ? (chosen.length === 1 ? 'The change I would like to discuss is:' : 'The changes I would like to discuss are:') : 'I would like to talk about what support might help.';
    const closing = [];
    if (o.writing) closing.push('If we agree any changes, I would be grateful if we could put them in writing and review them together after a few months, as my needs may change.');
    if (o.someoneElse) closing.push(`If it is easier, I would be happy to talk to someone in ${o.someoneElse} first.`);
    if (o.confidential) closing.push('I would also appreciate it if this could stay between us, and if you could check with me before sharing it with anyone else.');
    if (o.reply === '10') closing.push('Could you let me know within 10 working days when we could meet?');
    else if (o.reply === '14') closing.push('Could you let me know within the next two weeks when we could meet?');
    else closing.push('Please let me know when would suit you to meet.');
    return {
      sender: [name || '[Your name]'].concat(role ? [role] : []),
      date: longDate(o.date || new Date()),
      salutation: `Dear ${manager || '[Manager’s name]'},`,
      subject: 'Request for a conversation about support at work',
      paras, intro, items: chosen.map(x => x.ask.charAt(0).toUpperCase() + x.ask.slice(1)), closing,
      signoff: 'Yours sincerely,', signature: name || '[Your name]',
    };
  }
  function letterText(l) {
    const L = [].concat(l.sender, ['', l.date, '', l.salutation, '', l.subject, '']);
    for (const p of l.paras) L.push(p, '');
    L.push(l.intro);
    for (const it of l.items) L.push(`- ${it}`);
    L.push('');
    for (const p of l.closing) L.push(p, '');
    L.push('Thank you for your help.', '', l.signoff, l.signature);
    return L.join('\n') + '\n';
  }

  // The letter as an A4 PDF. pdf-lib and pdfText (the Pay Gap Report's WinAnsi filter) are passed in.
  async function letterPDF(PDFLib, pdfText, l) {
    const { PDFDocument } = PDFLib;
    const doc = await PDFDocument.create();
    doc.setTitle(pdfText(l.subject));
    doc.setCreator('Peak Apps Menopause Adjustments');
    doc.setProducer('pdf-lib');
    doc.setLanguage('en-GB');
    // Archivo, measured as Helvetica, so every line and page break is where it always was
    const T = await getPE().fonts(doc, PDFLib, ['regular', 'bold']);
    const F = T.regular, B = T.bold;
    const W = 595.28, H = 841.89, ML = 70, MR = 66, MT = 70, MB = 72, CW = W - ML - MR, SIZE = 10.5, LEAD = 15.4;
    const INK = T.C.ink;
    let page = doc.addPage([W, H]), y = H - MT;
    const ensure = h => { if (y - h < MB) { page = doc.addPage([W, H]); y = H - MT; } };
    const wrap = (s, f, size, max) => { const out = []; for (const para of pdfText(s).split('\n')) { const words = para.split(/\s+/).filter(Boolean); let cur = ''; for (const w of words) { const t = cur ? cur + ' ' + w : w; if (f.widthOfTextAtSize(t, size) > max && cur) { out.push(cur); cur = w; } else cur = t; } if (cur) out.push(cur); } return out; };
    const para = (s, o = {}) => { const f = o.bold ? B : F, size = o.size || SIZE; for (const line of wrap(s, f, size, (o.width || CW))) { ensure(LEAD); T.draw(page, line, { x: o.x || ML, y, size, font: f, color: INK, max: o.width || CW }); y -= LEAD; } };
    l.sender.forEach((s, i) => { T.draw(page, pdfText(s), { x: ML, y, size: i === 0 ? 11 : 10, font: i === 0 ? B : F, color: INK }); y -= 15; });
    y -= 14;
    const d = pdfText(l.date);
    T.draw(page, d, { x: W - MR, y, size: SIZE, font: F, color: INK, align: 'right' });
    y -= 30;
    para(l.salutation); y -= 8;
    para(l.subject, { bold: true, size: 11 }); y -= 8;
    for (const p of l.paras) { para(p); y -= 8; }
    para(l.intro); y -= 4;
    for (const it of l.items) { const lines = wrap(it, F, SIZE, CW - 18); ensure(LEAD * lines.length); page.drawCircle({ x: ML + 5, y: y + 3.5, size: 1.6, color: INK }); lines.forEach(line => { T.draw(page, line, { x: ML + 16, y, size: SIZE, font: F, color: INK, max: CW - 18 }); y -= LEAD; }); y -= 2; }
    y -= 8;
    for (const p of l.closing) { para(p); y -= 8; }
    para('Thank you for your help.'); y -= 22;
    ensure(LEAD * 3);
    para(l.signoff); y -= 26;
    para(l.signature);
    return doc.save();
  }

  return { CHECKED, SOURCES, EHRC_QUOTE, ACAS_QUOTE, SYMPTOMS, SITUATIONS, IDEAS, BY_ID, suggest, letter, letterText, letterPDF };
});
