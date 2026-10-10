/* Equality Action Plan: every rule the tool applies, in one versioned file, each with its official source and the date
 * it was last checked. The tool, the guides and every PDF print RULES_AS_OF, so a reader can see which version of the
 * rules a plan was checked against.
 *
 * Status on the check date: Equality Act 2010 s.78A (inserted by the Employment Rights Act 2025, s.33) is a power to
 * make regulations, in force since 6 April 2026. No regulations under it had been made or laid in draft (title search of
 * UK statutory instruments and draft statutory instruments on legislation.gov.uk, 10 October 2026), so the format below
 * is the government's voluntary format. When draft regulations are laid, update this file, the 2027 guide and the rules
 * guide on the same day, and bump RULES_VERSION.
 *
 * Pure data, no DOM: window.EAPRules in the browser, module.exports in Node (unit tests). */
(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory();
  else root.EAPRules = factory();
})(typeof self !== 'undefined' ? self : this, function () {
  'use strict';

  const RULES_VERSION = '2026-10-10.1';
  const CHECKED = '2026-10-10';
  const RULES_AS_OF = '10 October 2026';

  const GUIDE = 'https://www.gov.uk/government/publications/creating-an-action-plan-guidance-for-employers';
  const SOURCES = {
    s78a: { label: 'Equality Act 2010, section 78A (inserted by the Employment Rights Act 2025, section 33)', url: 'https://www.legislation.gov.uk/ukpga/2010/15/section/78A', checked: CHECKED },
    era33: { label: 'Employment Rights Act 2025, section 33', url: 'https://www.legislation.gov.uk/ukpga/2025/36/section/33', checked: CHECKED },
    si2026_323: { label: 'S.I. 2026/323, regulation 3(1) and (7)', url: 'https://www.legislation.gov.uk/uksi/2026/323/regulation/3/made', checked: CHECKED },
    noRegs: { label: 'legislation.gov.uk, title search of UK statutory instruments and draft statutory instruments for “equality action plan”', url: 'https://www.legislation.gov.uk/ukdsi?title=equality%20action%20plan', checked: CHECKED },
    overview: { label: 'GOV.UK, Creating an action plan: guidance for employers, Overview (updated 13 May 2026)', url: GUIDE + '/overview', checked: CHECKED },
    step1: { label: 'GOV.UK, Step 1. Understand the issues in your organisation', url: GUIDE + '/step-1-understand-the-issues-in-your-organisation', checked: CHECKED },
    step2: { label: 'GOV.UK, Step 2. Choose your actions', url: GUIDE + '/step-2-choose-your-actions', checked: CHECKED },
    step3: { label: 'GOV.UK, Step 3. Write a supporting narrative', url: GUIDE + '/step-3-write-a-supporting-narrative', checked: CHECKED },
    step4: { label: 'GOV.UK, Step 4. Submit your action plan', url: GUIDE + '/step-4-submit-your-action-plan', checked: CHECKED },
    step5: { label: 'GOV.UK, Step 5. Track the outcomes of your actions', url: GUIDE + '/step-5-track-the-outcomes-of-your-actions', checked: CHECKED },
    step6: { label: 'GOV.UK, Step 6: Review your plan', url: GUIDE + '/step-6-review-your-plan', checked: CHECKED },
    guide: { label: 'GOV.UK, Creating an action plan: guidance for employers (published 4 March 2026, updated 13 May 2026)', url: GUIDE, checked: CHECKED },
    collection: { label: 'GOV.UK, Action plans: list of actions (published 4 March 2026)', url: 'https://www.gov.uk/government/collections/action-plans-list-of-actions', checked: CHECKED },
    business: { label: 'Business.gov.uk, Employer Action Plans (updated 5 October 2026)', url: 'https://www.business.gov.uk/campaign/employment-changes/employers/employer-action-plans/', checked: CHECKED },
    whenToReport: { label: 'GOV.UK, Gender pay gap reporting: guidance for employers, When to report (updated 21 May 2026)', url: 'https://www.gov.uk/government/publications/gender-pay-gap-reporting-guidance-for-employers/when-to-report', checked: CHECKED },
    si2017_172: { label: 'The Equality Act 2010 (Gender Pay Gap Information) Regulations 2017 (S.I. 2017/172), regulations 1(2) and 2(1)', url: 'https://www.legislation.gov.uk/uksi/2017/172/contents/made', checked: CHECKED },
    si2017_353: { label: 'The Equality Act 2010 (Specific Duties and Public Authorities) Regulations 2017 (S.I. 2017/353), Schedule 1', url: 'https://www.legislation.gov.uk/uksi/2017/353/schedule/1/made', checked: CHECKED },
    govukFrontend: { label: 'The gender pay gap service loads govuk-frontend 5.10.2, whose word counter counts each run of characters between spaces or line breaks as one word', url: 'https://gender-pay-gap.service.gov.uk/assets/scripts/govuk-frontend-5.10.2.min.js', checked: CHECKED },
    ehrc: { label: 'Equality and Human Rights Commission, Menopause in the workplace: guidance for employers (updated 24 June 2026)', url: 'https://www.equalityhumanrights.com/guidance/menopause-workplace-guidance-employers', checked: CHECKED },
    acas: { label: 'Acas, Menopause at work (updated 7 April 2026)', url: 'https://www.acas.org.uk/menopause-at-work', checked: CHECKED },
    acasSupport: { label: 'Acas, Menopause at work: Supporting workers (updated 7 April 2026)', url: 'https://www.acas.org.uk/menopause-at-work/supporting-staff-through-the-menopause', checked: CHECKED },
    acasTalk: { label: 'Acas, Menopause at work: Talking with workers (updated 7 April 2026)', url: 'https://www.acas.org.uk/menopause-at-work/talking-with-staff-about-the-menopause', checked: CHECKED },
    acasLaw: { label: 'Acas, Menopause at work: Menopause and discrimination (updated 7 April 2026)', url: 'https://www.acas.org.uk/menopause-at-work/menopause-and-the-law', checked: CHECKED },
    lewisSilkin: { label: 'Lewis Silkin, New government guidance on equality action plans published (13 March 2026)', url: 'https://www.lewissilkin.com/en/insights/2026/03/13/new-government-guidance-on-equality-actions-plans-published', checked: CHECKED },
    addleshaw: { label: 'Addleshaw Goddard, Equality action plans: what employers need to know now (14 May 2026)', url: 'https://www.addleshawgoddard.com/en/insights/insights-briefings/2026/employment/equality-action-plans-what-employers-need-know-now/', checked: CHECKED },
    cipd: { label: 'CIPD, Employment Rights Act 2025: equality action plans', url: 'https://www.cipd.org/uk/knowledge/employment-law/employment-rights-act-2025-equality-action-plans/', checked: CHECKED },
  };

  // ---------- What the law says today ----------
  const LAW = {
    power: { text: 'Section 78A is a power: “Regulations may require employers to develop and publish a plan (an ‘equality action plan’) showing the steps that the employers are taking in relation to their employees with regard to prescribed matters related to gender equality”.', source: 's78a' },
    matters: { text: 'Matters related to gender equality include “addressing the gender pay gap” and “supporting employees going through the menopause” (s.78A(4)).', source: 's78a' },
    inForce: { text: 'Section 33 of the Employment Rights Act 2025, which inserted section 78A, came into force on 6 April 2026.', source: 'si2026_323' },
    noRegulations: { text: 'No regulations under section 78A had been made or laid in draft when these rules were last checked, so the duty to publish a plan does not apply yet.', source: 'noRegs' },
    regsMay: { text: 'The regulations may set the content of a plan, how and when it is published or revised, senior approval before publication, and which employers, employees and information it covers (s.78A(5)). After the first publication they cannot require publication more often than every 12 months (s.78A(6)).', source: 's78a' },
    extent: { text: 'Section 78A extends to England and Wales and Scotland.', source: 's78a' },
  };

  // ---------- Timing: what GOV.UK says, word for word ----------
  const TIMING = {
    govuk: { quote: 'Employers with 250 or more employees have the option to produce and publish a voluntary action plan alongside their gender pay gap data. Subject to legislation, these will become mandatory from spring 2027.', source: 'overview' },
    business: { quote: 'These will become mandatory from spring 2027, subject to secondary legislation.', source: 'business' },
    firstYear: { quote: 'You can voluntarily produce and publish your first action plan any time during the 2026 to 2027 reporting year', source: 'overview' },
    ehrc: { quote: 'Menopause action plans are voluntary for employers from April 2026 and mandatory for employers with 250 or more employees, likely from spring 2027.', source: 'ehrc' },
    acas: { quote: 'In 2027, publishing an action plan will become mandatory for employers with 250 or more workers.', source: 'acasSupport' },
    // How advisers read "from spring 2027". GOV.UK does not say which snapshot date the first mandatory plan goes with.
    readings: [
      { who: 'Lewis Silkin', quote: 'The first mandatory equality action plans will probably need to be published by April 2028.', source: 'lewisSilkin' },
      { who: 'Addleshaw Goddard', quote: 'Subject to legislation, this will become mandatory from Spring 2027, meaning that publication will be due by April 2028.', source: 'addleshaw' },
      { who: 'CIPD', quote: 'Voluntary reporting starts in 2026 with mandatory reporting in 2027.', source: 'cipd' },
    ],
    status: 'voluntary',
    short: 'Voluntary now. GOV.UK says plans will become mandatory “from spring 2027, subject to secondary legislation”.',
  };

  // ---------- The format (Steps 2 to 4) ----------
  const GROUPS = [
    { id: 'recruiting', name: 'Recruiting staff', kind: 'paygap' },
    { id: 'developing', name: 'Developing and promoting staff', kind: 'paygap' },
    { id: 'diversity', name: 'Building diversity into your organisation', kind: 'paygap' },
    { id: 'transparency', name: 'Increasing transparency', kind: 'paygap' },
    { id: 'menopause', name: 'Supporting employees experiencing menopause', kind: 'menopause' },
  ];
  const KIND = {
    paygap: { name: 'Gender pay gap', long: 'addresses the gender pay gap' },
    menopause: { name: 'Menopause', long: 'supports employees experiencing menopause' },
  };
  const PUB = 'https://www.gov.uk/government/publications/';

  // name: as in Step 2 and the collection. serviceName: the wording the gender pay gap service shows, where it differs.
  // summary: the action's official description (the service shows it under "About this action").
  // purpose and useful: from the action page, word for word. metrics: the action page's "Tracking progress" section,
  // shortened to a label for the tracker.
  const ACTIONS = [
    { id: 'job-descriptions', group: 'recruiting', name: 'Make job descriptions inclusive', slug: 'make-job-descriptions-inclusive',
      summary: 'Inclusive job descriptions can attract diverse talent by using neutral language, listing only essential requirements, and highlighting equal opportunities.',
      purpose: 'The aim of this action is to attract a more diverse pool of applicants.',
      useful: 'This action may be useful if you have identified recruitment bias or under-representation of certain groups in your organisation. This includes women in mid-to-senior roles and those returning to work after a career break.',
      metrics: ['Share of new adverts that use the features of inclusive job descriptions', 'Applicants and successful candidates by sex', 'Retention of new staff at 6 and 12 months after starting', 'Candidate survey on the recruitment experience'] },
    { id: 'range-of-candidates', group: 'recruiting', name: 'Encourage applications from a range of candidates', slug: 'encourage-applications-from-a-range-of-candidates',
      summary: 'Actively seeking applications from under-represented groups can ensure a broader range of applicants for all roles.',
      purpose: 'The aim of this action is to improve the gender balance in your workforce by attracting more applications from either men or women (depending on the composition of your workforce).',
      useful: 'You might choose this action if your workforce lacks diversity or representation in certain roles.',
      metrics: ['Applicants and successful candidates by sex', 'Returners and previous applicants hired', 'Retention of new recruits from targeted groups at 12 months', 'Candidates’ recruitment experience'] },
    { id: 'cv-screening', group: 'recruiting', name: 'Reduce unconscious bias in CV screening', slug: 'reduce-unconscious-bias-in-cv-screening',
      summary: 'Using structured, skill-based screening can minimise bias and boost diversity in hiring.',
      purpose: 'This action aims to reduce unconscious bias when you are first screening the CVs of job applicants.',
      useful: null,
      metrics: ['Share of recruitment campaigns that use an anonymous application form and CV template', 'Applicants shortlisted, invited to interview and offered the role, by sex', 'Candidate survey on the recruitment experience'] },
    { id: 'structured-interviews', group: 'recruiting', name: 'Use fair and structured interview techniques', slug: 'use-fair-and-structured-interview-techniques',
      summary: 'Structured interviews support fair, objective hiring. Standardised questions and scoring helps reduce bias and promotes equal opportunity.',
      purpose: 'Fair and structured interviews can help you make better hiring decisions by reducing bias.',
      useful: 'You may want to choose this action if your organisation lacks diversity or representation in certain roles or pay grades, or if you have identified a lack of diversity in your interview shortlists.',
      metrics: ['Share of hiring managers using structured interviews', 'Shortlisted and successful candidates by sex', 'Retention of new employees from targeted groups at 12 months', 'Candidate survey on the recruitment experience'] },
    { id: 'advertise-leave', group: 'recruiting', name: 'Advertise leave policies in job adverts', slug: 'advertise-leave-policies-in-job-adverts',
      summary: 'Advertise parental, carer, and compassionate leave policies widely to ensure all prospective employees know the entitlements they would be eligible for.',
      purpose: 'The aim of advertising leave policies is to encourage more people to apply for roles.',
      useful: null,
      metrics: ['Share of new adverts that state leave details', 'Use of leave policies, by sex, disability or caring status', 'New staff or applicants who say the leave policies influenced their decision to apply', 'Staff who identify as unpaid carers, over time'] },
    { id: 'advertise-flexible', group: 'recruiting', name: 'Advertise flexible working arrangements in job adverts', slug: 'advertise-flexible-working-arrangements-in-job-adverts',
      summary: 'Flexible working policies can aid work-life balance, especially for people with caring roles. Advertising flexibility can attract a wider, more diverse group of applicants.',
      purpose: 'Advertising flexible working can encourage a wider range of people to apply for your roles, particularly women.',
      useful: null,
      metrics: ['Share of new adverts that state flexible working arrangements', 'Applicants and successful candidates by sex', 'Candidates who mention flexible working as a reason to apply'] },
    { id: 'auto-promotion', group: 'developing', name: 'Automatically consider eligible employees for promotion', slug: 'automatically-consider-eligible-employees-for-promotion',
      summary: 'Automatically considering all eligible employees for promotion gives them the choice to opt-out rather than opt-in.',
      purpose: 'The aim of this action is to improve gender diversity across your organisation.',
      useful: 'You may want to choose this action if you have low rates of women moving into senior roles or staying in employment with your organisation. It might also be useful if you have a difference in the number of men and women in senior roles.',
      metrics: ['Rate of progression from middle to senior management, by sex', 'Promotion applicants and successful candidates, by sex', 'Retention of employees', 'Candidates’ experience of the promotion process'] },
    { id: 'development-steps', group: 'developing', name: 'Encourage employee development through actionable steps', slug: 'encourage-employee-development-through-actionable-steps',
      summary: 'Giving all employees clear and actionable advice on how to develop may benefit organisations with low rates of progression and retention for women.',
      purpose: 'The aim of this action is to give employees clear steps to help them develop and reach their full potential.',
      useful: 'You may want to choose this action if you have low rates of women moving into more senior roles, fewer women staying at your organisation, or more women who seem to stay at certain levels.',
      metrics: ['Employees’ understanding of their development goals, and how useful they find their feedback', 'Managers’ understanding of how to give effective feedback and development advice', 'Rate of progression from middle to senior management, by sex', 'Retention, particularly of high-performing women', 'Changes in knowledge and skills over time, for example a skills inventory'] },
    { id: 'mentoring', group: 'developing', name: 'Offer mentoring, sponsorship and other development programmes', slug: 'offer-mentoring-sponsorship-and-other-development-programmes',
      summary: 'Providing development programmes, such as mentoring, gives employees a formal channel for advice and support.',
      purpose: 'The aim of this action is to support under-represented groups in your organisation.',
      useful: 'You may want to choose this action if there is a lack of gender representation in certain roles or a gender imbalance in rates of progression.',
      metrics: ['Participants and their career progression, by sex', 'Participation over time, and the rate of and reasons for drop-out', 'Whether participants stay longer than those who did not take part', 'Whether employees feel they have a clear career path and more confidence', 'Feedback from those who took part and those who chose not to'] },
    { id: 'targets', group: 'diversity', name: 'Set targets to improve gender representation', slug: 'set-targets-to-improve-gender-representation',
      summary: 'Setting specific internal targets that you can monitor using data gives your organisation clear steps to improve gender representation and equality.',
      purpose: 'This action helps make it clear that gender equality is a priority for your organisation.',
      useful: 'You may want to choose this action if your organisation has under-representation in certain areas, such as women in senior roles. It may also be useful when you start a new recruitment campaign.',
      metrics: ['Share of departments that met their targets at each milestone', 'Progress departments have made towards their targets', 'What helped or hindered each target', 'Share of targets achieved at each milestone', 'Employee satisfaction with the targets and how they were put in place'] },
    { id: 'transparency', group: 'transparency', name: 'Increase transparency for pay, promotion and rewards', slug: 'increase-transparency-for-pay-promotion-and-rewards',
      summary: 'Transparency in pay, promotion, and bonus policies helps ensure everyone understands how decisions are made.',
      purpose: 'The aim of this action is to make sure all employees understand how to increase their pay or get a promotion, and how decisions are made.',
      useful: 'You may want to choose this action if you have unequal rates of women and men moving into senior roles or staying with your organisation. It might also be useful if you have a gap in the number or level of bonuses between men and women.',
      metrics: ['Promotion applicants and successful candidates, by sex', 'Employees in senior roles, by sex', 'Retention rate, by sex', 'Reward and performance data for men and women doing similar work', 'Employees’ understanding of how to increase their pay or get a promotion', 'Employees’ view of whether pay and reward decisions are fair'] },
    { id: 'flexible-leave', group: 'transparency', name: 'Enhance and promote flexible working and leave policies', slug: 'enhance-and-promote-flexible-working-and-leave-policies',
      summary: 'Enhance and promote leave policies and flexible working so employees know their entitlements and how to use them.',
      purpose: 'The aim of this action is to help your employees maintain a healthy balance between their work and family life.',
      useful: 'You may want to choose this action if you have identified low numbers of people using leave and flexible working policies, or feedback and insight from employees suggests they leave the organisation because they do not feel able to take up these entitlements.',
      metrics: ['People using flexible working and leave across teams and seniority levels', 'Employees using each type of leave, by sex', 'Survey: employees understand the policies and managers feel confident offering support', 'Readership of internal communications about the policies'] },
    { id: 'train-managers', group: 'menopause', name: 'Train managers to support employees experiencing menopause', slug: 'train-managers-to-support-employees-experiencing-menopause',
      summary: 'Manager training can help organisations support employees experiencing menopause.',
      purpose: 'The aim of this action is to give managers the knowledge and skills they need to support employees experiencing menopause.',
      useful: null,
      metrics: ['Managers finishing the training', 'What managers learned, surveyed before and after the training', 'Employees’ view of the organisation’s approach to menopause, in staff surveys', 'Absence and retention of women in the relevant age groups, such as 40 to 60'] },
    { id: 'occupational-health', group: 'menopause', name: 'Offer occupational health advice for employees experiencing menopause', serviceName: 'Offer occupational health advice to employees experiencing menopause', slug: 'offer-occupational-health-advice-for-employees-experiencing-menopause',
      summary: 'Giving employees specialised occupational health advice can help them manage menopause symptoms, get support and work more comfortably.',
      purpose: 'The aim of this action is to help employees manage menopause symptoms while they are at work.',
      useful: null,
      metrics: ['Employees’ awareness and understanding of the occupational health offer', 'Use of occupational health services, by age and sex', 'Absence and retention, particularly of women aged 40 to 60', 'Satisfaction with the support, from anonymous surveys or exit interviews'] },
    { id: 'support-groups', group: 'menopause', name: 'Set up menopause support groups and networks', slug: 'set-up-menopause-support-groups-and-networks',
      summary: 'Menopause support groups in your organisation can help provide peer support, information and guidance.',
      purpose: 'The aim of this action is to improve the mental health and wellbeing of employees experiencing menopause.',
      useful: null,
      metrics: ['People who join the groups, and their regular feedback', 'Employees’ satisfaction with the menopause support you provide', 'Absence and retention, particularly of women aged 40 to 60', 'Employees’ understanding of menopause symptoms, in a survey'] },
    { id: 'adjustments', group: 'menopause', name: 'Offer workplace adjustments for employees experiencing menopause', serviceName: 'Offer workplace adjustments to employees experiencing menopause', slug: 'offer-workplace-adjustments-for-employees-experiencing-menopause',
      summary: 'Personalised workplace adjustments for employees experiencing menopause can support their wellbeing and ability to work.',
      purpose: 'The aim of this action is to provide employees experiencing menopause with workplace adjustments that meet their specific needs.',
      useful: null,
      metrics: ['Share of people using adjustments, by age and sex', 'Absence and retention, by age and sex', 'Feedback on how effective the adjustments are, from anonymous surveys or exit interviews'] },
    { id: 'risk-assessment', group: 'menopause', name: 'Conduct a menopause risk assessment for your workplace', slug: 'conduct-a-menopause-risk-assessment-for-your-workplace',
      summary: 'Menopause risk assessments can identify workplace adjustments to help support your employees’ wellbeing.',
      purpose: 'The aim of this action is to consider the specific needs of employees experiencing menopause, which most women will go through at some point in their lives.',
      useful: null,
      metrics: ['People who use the assessments once they are available', 'Employee satisfaction with the assessment process and the changes made, in an anonymous survey', 'Absence rates and retention'] },
    { id: 'review-policies', group: 'menopause', name: 'Review policies and procedures to meet the needs of employees experiencing menopause', slug: 'review-policies-and-procedures-to-meet-the-needs-of-employees-experiencing-menopause',
      summary: 'Ensure your organisation’s policies align with the needs of employees experiencing menopause by reviewing your policies and procedures.',
      purpose: 'The aim of this action is to review your organisation’s current policies and procedures to find out if they are fit for purpose.',
      useful: null,
      metrics: ['Absence and retention across age groups and sexes, such as women aged 40 to 60', 'Share of employees using flexible working or reasonable adjustments, by age group and sex', 'Use of the updated policies among women in that age group', 'Satisfaction with the support given, in anonymous surveys', 'Exit interviews with people in the target age group'] },
  ].map((a, i) => Object.assign(a, { n: i + 1, kind: GROUPS.find(g => g.id === a.group).kind, url: `${PUB}${a.slug}/${a.slug}`, source: 'collection' }));
  const BY_ID = Object.fromEntries(ACTIONS.map(a => [a.id, a]));

  const STATUSES = {
    new: { id: 'new', name: 'New or in progress', published: 'Planned actions', meaning: 'you will be working on it for the first time or building on something you are already doing', source: 'step2' },
    embedded: { id: 'embedded', name: 'Embedded', published: 'Embedded actions', meaning: 'it is already an established part of your working practice', source: 'step2' },
  };

  // The three checks the tool runs live, with the guidance's words.
  const MINIMUMS = {
    total: { value: 2, quote: 'You must choose a minimum of 2 actions in your action plan', source: 'step2' },
    paygap: { value: 1, quote: 'one must address your gender pay gap', source: 'step2' },
    menopause: { value: 1, quote: 'one must support employees experiencing menopause', source: 'step2' },
    newOrInProgress: { value: 2, quote: 'You must choose at least 2 actions that are ‘new or in progress’.', source: 'step2' },
  };

  const LIMITS = {
    actionWords: { value: 100, quote: 'can write up to 100 words of supporting text', source: 'step3' },
    narrativeWords: { value: 200, quote: 'You can write up to 200 words.', source: 'step3' },
    noLinks: { quote: 'cannot add links', source: 'step3' },
    noFiles: { quote: 'cannot upload files, such as CSVs or PDFs', source: 'step3' },
    wordCount: { text: 'Words are counted as the GOV.UK Design System counter counts them: every run of characters between spaces or line breaks is one word. So “part-time” is one word, “4 April 2027” is three, and a dash or ampersand with a space on each side counts as a word. The service makes the final check.', source: 'govukFrontend' },
  };

  const PROMPTS = {
    new: { required: true, items: ['why your organisation has chosen this action', 'how you will track and understand whether this action is improving gender equality in your organisation'], quote: 'For each ‘new or in progress’ action you select, you must add further details', source: 'step3' },
    embedded: { required: false, items: ['how your organisation implemented this action', 'what the results have been'], quote: 'you can add further details about how your organisation made them an established part of their working practice', source: 'step3' },
    narrative: { required: false, text: 'An overall supporting narrative with any background information. This might include your organisation’s objectives for gender equality.', source: 'step3' },
    website: { text: 'The service asks you to link to the relevant page on your own website, for example your organisation’s equality policies or strategies, if you have them. GOV.UK encourages you to publish the plan’s information on your own website too.', source: 'step3' },
  };

  const RESPONSIBLE = {
    text: 'Private and voluntary sector employers must include the name of a responsible person when they submit the plan. It should usually be a director, partner or senior officer, who confirms that the information submitted is accurate. Most public authority employers do not need to do this.',
    quote: 'They will be responsible for confirming that the information you have submitted is accurate.',
    required: { private: true, public: false },
    source: 'overview',
  };

  const SCOPE = {
    threshold: { value: 250, text: 'Employers with 250 or more employees.', source: 'overview' },
    small: { text: 'Section 78A does not apply to an employer with fewer than 250 employees.', source: 's78a' },
    publicAuthorities: { text: 'It applies to a public authority only if the authority is listed in Part 1 of Schedule 19 to the Equality Act 2010, or in Part 4 of that Schedule with the letter “D” after the entry.', source: 's78a' },
    territory: { quote: 'It will apply to large private sector employers in England, Scotland and Wales, as well as English and specific cross-border public authorities.', source: 'business' },
    scotlandWales: { text: 'Public authorities in Scotland and Wales have different rules.', source: 'overview' },
    entities: { quote: 'You must submit an action plan for each separate legal entity with 250 or more employees.', text: 'Each legal entity can have its own plan, or the same actions and narratives copied into a plan for each entity.', source: 'overview' },
  };

  // Snapshot dates and deadlines follow the gender pay gap rules (When to report; S.I. 2017/172 and 2017/353).
  const SECTORS = {
    private: { id: 'private', name: 'Private, voluntary and all other public authority employers', short: 'Private or voluntary sector', snapshot: [4, 5], deadline: [4, 4], source: 'whenToReport' },
    public: { id: 'public', name: 'Most public authority employers', short: 'Public authority', snapshot: [3, 31], deadline: [3, 30], source: 'whenToReport' },
  };
  const MONTHS = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];
  // year: the snapshot year. The 2026 snapshot gives the 2026 to 2027 reporting year, deadline 4 April or 30 March 2027.
  function reportingYear(sector, year) {
    const s = SECTORS[sector] || SECTORS.private;
    const y = Number(year) || 2026;
    const day = (yy, [m, d]) => ({ iso: `${yy}-${String(m).padStart(2, '0')}-${String(d).padStart(2, '0')}`, long: `${d} ${MONTHS[m - 1]} ${yy}` });
    return {
      sector: s.id, year: y, label: `${y} to ${y + 1}`,
      snapshot: day(y, s.snapshot), deadline: day(y + 1, s.deadline),
      // The 2026 to 2027 reporting year is voluntary (Overview). Later years depend on regulations not yet made.
      status: y <= 2026 ? 'voluntary' : 'unknown',
    };
  }

  const REVIEW = {
    annual: { text: 'Once plans are mandatory, GOV.UK says you will need to review and update the plan every reporting year. Based on current plans: an interim progress review 1 year and 2 years after the first mandatory plan, and a more detailed review of each action 3 years after it.', source: 'step6' },
    atLeastTwo: { quote: 'You must be working on at least 2 actions at any time.', source: 'step6' },
    statusChange: { text: 'If you change an action between ‘new or in progress’ and ‘embedded’, or remove one, you will need to add a new action.', source: 'step6' },
    baseline: { text: 'Record each action’s metrics before you start it (the baseline), then measure at regular intervals with the same analysis so the results compare over time.', source: 'step5' },
  };

  // The questions Step 1 asks employers to answer from their own data, word for word.
  const STEP1_QUESTIONS = [
    'What is the split of men and women at each pay level in your organisation?',
    'Are women more likely to be recruited into lower paid roles than men, and are they under-represented in higher paid roles?',
    'Do starting salaries or bonuses differ between men and women?',
    'Do men and women receive different performance scores on average?',
    'Are there differences in the promotion rate of men and women at the same grade or performance level?',
    'Do people get stuck at certain levels in your organisation?',
    'Are flexible working arrangements available and used across all pay levels, including senior roles?',
    'Do men and women leave your organisation at different rates?',
    'Are you already taking action to improve gender equality in your organisation? If so, what results are you seeing?',
  ];

  // Every rule the rules guide lists, in one table: id, statement, source, last checked.
  const RULES = [
    { id: 'law-power', area: 'Law', text: LAW.power.text, source: LAW.power.source },
    { id: 'law-in-force', area: 'Law', text: LAW.inForce.text, source: LAW.inForce.source },
    { id: 'law-no-regulations', area: 'Law', text: LAW.noRegulations.text, source: LAW.noRegulations.source },
    { id: 'timing', area: 'Timing', text: 'Voluntary now. “Subject to legislation, these will become mandatory from spring 2027.”', source: 'overview' },
    { id: 'scope-250', area: 'Who', text: SCOPE.threshold.text, source: SCOPE.threshold.source },
    { id: 'scope-public', area: 'Who', text: SCOPE.publicAuthorities.text, source: SCOPE.publicAuthorities.source },
    { id: 'scope-entities', area: 'Who', text: SCOPE.entities.quote, source: SCOPE.entities.source },
    { id: 'actions-18', area: 'Actions', text: 'Choose from the 18 actions on GOV.UK’s list, in five groups.', source: 'step2' },
    { id: 'min-2', area: 'Actions', text: 'At least 2 actions: at least 1 that addresses the gender pay gap and at least 1 that supports employees experiencing menopause.', source: 'step2' },
    { id: 'min-new', area: 'Actions', text: 'At least 2 actions must be ‘new or in progress’. ‘Embedded’ actions can be added as well, and do not count towards this.', source: 'step2' },
    { id: 'text-required', area: 'Text', text: 'Each ‘new or in progress’ action needs supporting text: why you chose it and how you will track whether it is improving gender equality. For ‘embedded’ actions the text is optional: how it was embedded and its results.', source: 'step3' },
    { id: 'text-100', area: 'Text', text: 'Up to 100 words of supporting text for each action, with no links and no files.', source: 'step3' },
    { id: 'narrative-200', area: 'Text', text: 'An optional overall supporting narrative of up to 200 words, with no files.', source: 'step3' },
    { id: 'website', area: 'Text', text: PROMPTS.website.text, source: 'step3' },
    { id: 'responsible', area: 'Approval', text: RESPONSIBLE.text, source: 'overview' },
    { id: 'deadline-private', area: 'Deadlines', text: 'Private, voluntary and all other public authority employers: snapshot date 5 April, deadline 4 April the following year. For the 2026 to 2027 reporting year, 4 April 2027.', source: 'whenToReport' },
    { id: 'deadline-public', area: 'Deadlines', text: 'Most public authority employers: snapshot date 31 March, deadline 30 March the following year. For the 2026 to 2027 reporting year, 30 March 2027.', source: 'whenToReport' },
    { id: 'review', area: 'Review', text: REVIEW.annual.text, source: 'step6' },
    { id: 'review-two', area: 'Review', text: REVIEW.atLeastTwo.quote, source: 'step6' },
  ].map(r => Object.assign(r, { checked: (SOURCES[r.source] || {}).checked || CHECKED }));

  const asOfLine = () => `Rules as of ${RULES_AS_OF}`;

  return {
    RULES_VERSION, RULES_AS_OF, CHECKED, SOURCES, LAW, TIMING, GROUPS, KIND, ACTIONS, BY_ID, STATUSES, MINIMUMS, LIMITS,
    PROMPTS, RESPONSIBLE, SCOPE, SECTORS, REVIEW, STEP1_QUESTIONS, RULES, MONTHS, reportingYear, asOfLine,
  };
});
