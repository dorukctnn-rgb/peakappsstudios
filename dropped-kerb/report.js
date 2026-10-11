/* Dropped Kerb Check (Pro): the application pack PDF and the letters as text.
 * Pure functions over the engine's result; pdf-lib is passed in (loaded only when a Pro user asks for the pack). The
 * PDF, the text file and the page all read the same result, so they always agree. The site plan and the section are
 * drawn as vectors from the same plan geometry as the 3D model, at a true scale on A4.
 * Fonts: Signika and Saira (condensed), embedded as TrueType with the WinAnsi encoding (fonts/dk-pdf-*.ttf, cut by
 * _build/pdf-fonts.py); if the files cannot be fetched the PDF is set in Helvetica with the same layout rules.
 * Works in the browser (window.DKReport) and in Node for the tests. */
(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory();
  else root.DKReport = factory();
})(typeof self !== 'undefined' ? self : this, function () {
  'use strict';
  // the date on the user's own calendar, not UTC (the pack is made after midnight in some time zones)
  const localDay = () => { const d = new Date(); return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`; };

  // @metrics-start (written by _build/pdf-fonts.py)
  const CUTS = {"SignikaPDF-Regular":{"widths":[220,288,384,645,540,906,622,206,332,332,504,540,269,350,263,422,540,540,540,540,540,540,540,540,540,540,268,272,540,540,540,396,949,612,605,604,648,566,522,643,674,294,448,596,512,808,680,658,568,652,600,556,492,669,574,850,587,503,562,344,422,344,530,530,398,507,528,472,530,500,335,528,544,271,278,502,294,797,546,520,530,529,368,438,350,547,455,722,460,468,446,346,256,346,586,0,540,0,228,540,422,792,372,387,398,1271,556,332,898,0,562,0,0,228,228,422,422,447,530,789,398,859,438,332,830,0,446,503,220,288,540,540,540,540,250,486,398,802,424,554,540,0,593,398,370,540,420,420,398,554,670,304,398,420,412,554,1001,1015,979,396,612,612,612,612,612,612,876,604,566,566,566,566,294,294,294,294,664,680,658,658,658,658,658,540,659,669,669,669,669,503,571,627,507,507,507,507,507,507,782,472,500,500,500,500,271,271,271,271,518,546,520,520,520,520,520,540,522,547,547,547,547,468,528,468],"bbox":[-180,-230,1222,903],"ascent":940,"descent":-292,"capHeight":683,"xHeight":498,"italicAngle":0.0,"stemV":80,"file":"dk-pdf-regular.ttf"},"SignikaPDF-SemiBold":{"widths":[220,298,417,682,540,950,640,218,354,354,512,540,282,364,275,437,540,540,540,540,540,540,540,540,540,540,282,286,540,540,540,408,965,625,610,606,658,570,528,649,680,304,460,609,518,821,688,662,578,661,608,556,501,672,591,878,602,524,571,370,437,370,530,548,398,510,532,473,534,498,349,532,544,285,292,512,304,803,546,521,534,534,383,440,363,548,468,740,471,483,448,374,263,374,610,0,540,0,248,540,464,827,388,414,398,1322,556,341,910,0,571,0,0,248,248,464,464,454,544,802,398,912,440,341,817,0,448,524,220,298,540,540,540,540,257,493,398,796,442,584,540,0,598,398,386,540,420,420,398,553,712,318,398,420,435,584,1030,1049,1010,408,625,625,625,625,625,625,882,606,570,570,570,570,304,304,304,304,674,688,662,662,662,662,662,540,665,672,672,672,672,524,582,642,510,510,510,510,510,510,768,473,498,498,498,498,285,285,285,285,520,546,521,521,521,521,521,540,524,548,548,548,548,483,532,483],"bbox":[-190,-240,1276,922],"ascent":940,"descent":-292,"capHeight":683,"xHeight":502,"italicAngle":0.0,"stemV":120,"file":"dk-pdf-semibold.ttf"},"SairaCondensedPDF-Bold":{"widths":[187,255,373,550,413,708,543,210,282,282,409,478,239,305,239,324,486,486,486,486,486,486,486,486,486,486,239,239,479,478,479,386,703,505,490,401,498,428,401,488,522,241,291,495,382,694,525,512,473,512,496,445,422,508,480,740,502,463,439,304,324,292,394,351,173,429,451,348,451,429,311,450,454,219,226,432,219,680,454,440,451,451,312,376,303,454,419,642,429,454,392,303,237,303,453,0,459,0,232,405,412,717,385,385,271,855,445,248,722,0,439,0,0,227,227,406,406,299,442,822,306,581,376,248,676,0,392,463,187,250,363,443,550,500,237,507,284,584,332,404,478,305,584,207,320,478,271,262,173,456,477,239,146,186,343,404,562,581,639,354,505,505,505,505,505,683,687,401,428,428,428,428,241,241,241,241,498,525,512,512,512,512,512,450,512,508,508,508,508,463,473,462,429,429,429,429,429,429,655,348,429,429,429,429,219,219,219,219,441,454,440,440,440,440,440,478,440,454,454,454,454,454,451,454],"bbox":[-148,-202,810,891],"ascent":1135,"descent":-439,"capHeight":688,"xHeight":510,"italicAngle":0.0,"stemV":140,"file":"dk-pdf-display.ttf"}};
  // @metrics-end

  // WinAnsi: keep its characters (’ “ ” £ ² × and the rest), replace anything else.
  const WIN = '€‚ƒ„…†‡ˆ‰Š‹ŒŽ‘’“”•–—˜™š›œžŸ';
  const MAP = { '≤': '<=', '≥': '>=', '−': '-', ' ': ' ', ' ': ' ', ' ': ' ' };
  const safe = s => String(s == null ? '' : s).replace(/[\s\S]/g, c => {
    const n = c.charCodeAt(0);
    if (c === '\n' || (n >= 32 && n < 127) || (n >= 0xa0 && n <= 0xff) || WIN.includes(c)) return c;
    return MAP[c] != null ? MAP[c] : '';
  });
  const STATUS = { pass: 'Pass', fail: 'Fail', check: 'Check', info: 'Applies' };
  const ROLES = { regular: ['SignikaPDF-Regular', 'Helvetica', 'DKPDFA'], bold: ['SignikaPDF-SemiBold', 'Helvetica-Bold', 'DKPDFB'], display: ['SairaCondensedPDF-Bold', 'Helvetica-Bold', 'DKPDFC'] };
  const api = { base: '/dropped-kerb/fonts/', fontDir: null, forceStandard: false };

  // ---------- fonts ----------
  const cache = {};
  async function readFont(file) {
    const node = typeof window === 'undefined' && typeof process === 'object' && process.versions && process.versions.node;
    if (node) {
      const get = typeof require === 'function' ? require : process.getBuiltinModule;
      const fs = get('fs'), path = get('path');
      const dirs = [api.fontDir, path.join(process.cwd(), 'src', 'dropped-kerb', 'fonts'), path.join(process.cwd(), 'dropped-kerb', 'fonts')].filter(Boolean);
      const dir = dirs.find(d => fs.existsSync(path.join(d, file)));
      if (!dir) throw new Error(`${file} not found`);
      return new Uint8Array(fs.readFileSync(path.join(dir, file)));
    }
    const r = await fetch(api.base + file);
    if (!r.ok) throw new Error(`${file}: HTTP ${r.status}`);
    return new Uint8Array(await r.arrayBuffer());
  }
  function embedCut(doc, PDFLib, name, tag, bytes) {
    const { StandardFontEmbedder, PDFFont } = PDFLib;
    const cut = CUTS[name];
    const std = StandardFontEmbedder.for('Helvetica');
    const emb = Object.create(StandardFontEmbedder.prototype);
    Object.assign(emb, { font: std.font, encoding: std.encoding, fontName: name, customName: undefined });
    const width = (t, s) => std.encodeTextAsGlyphs(t).reduce((a, g) => a + (cut.widths[g.code - 32] || 0), 0) * s / 1000;
    emb.widthOfTextAtSize = width;
    emb.heightOfFontAtSize = (s) => (cut.ascent - cut.descent) * s / 1000;
    emb.sizeOfFontAtHeight = h => h * 1000 / (cut.ascent - cut.descent);
    emb.encodeText = t => std.encodeText(t);
    let dict = null;
    emb.embedIntoContext = async (context, ref) => {
      if (!dict) {
        const base = `${tag}+${name}`;
        const fileRef = context.register(context.flateStream(bytes, { Length1: bytes.length }));
        const descRef = context.register(context.obj({ Type: 'FontDescriptor', FontName: base, Flags: 32, FontBBox: cut.bbox, ItalicAngle: cut.italicAngle, Ascent: cut.ascent, Descent: cut.descent, CapHeight: cut.capHeight, XHeight: cut.xHeight, StemV: cut.stemV, FontFile2: fileRef }));
        dict = context.obj({ Type: 'Font', Subtype: 'TrueType', BaseFont: base, FirstChar: 32, LastChar: 255, Widths: cut.widths, FontDescriptor: descRef, Encoding: 'WinAnsiEncoding' });
      }
      context.assign(ref, dict);
      return ref;
    };
    const font = PDFFont.of(doc.context.nextRef(), doc, emb);
    doc.fonts.push(font);
    return font;
  }
  async function fonts(doc, PDFLib) {
    const out = { custom: false };
    let files = null;
    if (!api.forceStandard && Object.keys(CUTS).length) {
      try { files = await Promise.all(Object.values(ROLES).map(([n]) => (cache[n] = cache[n] || readFont(CUTS[n].file).catch(e => { delete cache[n]; throw e; })))); }
      catch (e) { files = null; if (typeof console !== 'undefined') console.warn('PDF fonts could not be loaded; using Helvetica.', e && e.message); }
    }
    const roles = Object.keys(ROLES);
    for (let i = 0; i < roles.length; i++) {
      const [name, fallback, tag] = ROLES[roles[i]];
      out[roles[i]] = files ? embedCut(doc, PDFLib, name, tag, files[i]) : await doc.embedFont(fallback);
    }
    out.custom = !!files;
    return out;
  }

  // ---------- what the frontage is, in words (for the letter) ----------
  function describe(model, result, E, a) {
    const P = result.plan, f = x => E.fmt(Math.round(x * 100) / 100);
    const X = P.crossing;
    const cars = Number(model.spaces) === 2 ? 'two cars side by side' : 'one car';
    const park = model.mode === 'parallel' ? `${cars} parked parallel to the road` : `${cars} parked at right angles to the road`;
    const surface = (E.SURFACE[model.surface] || 'a hard surface').toLowerCase();
    return `A vehicle crossing over the ${P.verge > 0 ? `${f(P.verge)} m verge and the ` : ''}${f(P.footway)} m footway to a parking space inside the property boundary, ${f(P.depth)} m deep and ${f(P.width)} m wide, for ${park}. The crossing drawn is ${f(X.length)} m along the kerb, the standard size in ${a.short}’s guidance; the council sets the final size and position. The drive is ${surface}${model.drain === 'garden' ? ', draining to the garden' : model.drain === 'channel' ? ', with a drainage channel at the boundary' : ''}.`;
  }

  // ---------- the packs, as data: the PDF and the text file both print them ----------
  function packs(ctx) {
    const { model, result, E, A } = ctx;
    const a = A[model.a];
    const out = [];
    const r = id => result.results.find(x => x.topic === id && x.group === 'council');
    const fails = result.results.filter(x => x.group === 'council' && x.status === 'fail');
    const checks = result.results.filter(x => x.group === 'council' && x.status === 'check');
    const desc = describe(model, result, E, a);
    const fee = (a.fees || []).find(f => f.id === 'application');
    const p = result.planning;
    // the cover letter
    out.push({ id: 'letter', kind: 'letter', title: `Cover letter to ${a.name}`, paras: [
      '[Your name]\n[Your address]\n[Phone and email]\n[Date]',
      `To the dropped kerb (vehicle crossing) team, ${a.name}`,
      'Application for a vehicle crossing under section 184(11) of the Highways Act 1980',
      'Property: [address of the property]',
      `Proposal: ${desc}`,
      `I have checked the frontage against your published criteria (${Object.values(a.sources).map(s => s.short).join('; ')}, read on ${E.longDate(a.checked)}). The enclosed plan shows the measurements, the visibility splays, the nearest junction and any trees, street lights and street furniture, with their distances from the proposed crossing.${fails.length ? ` I am aware that, as measured, ${fails.map(x => x.topic).join(', ')} may not meet the criteria, and I would be grateful for your advice on site.` : ''}`,
      p.needed ? 'Planning permission is needed for this proposal; a copy of the decision is enclosed.' : p.needed === false ? `As entered, the access and the hard surface are permitted development under Classes B and F of the GPDO 2015.${a.process.evidence ? ' The written confirmation you ask for is enclosed.' : ''}` : 'I have asked the planning authority whether planning permission is needed; its reply is enclosed.',
      `Enclosed: the site plan and elevation; photographs of the frontage; ${model.owner === 'tenant' ? 'the owner’s written consent; ' : ''}${a.process.evidence ? 'the planning confirmation; ' : ''}${fee ? `the application fee of £${fee.amount.toFixed(2).replace(/\.00$/, '')}.` : 'the application fee.'}`,
      'Yours faithfully,\n[Name]',
    ] });
    // what to send
    const evidence = [
      { text: 'A photograph taken from the road, straight on to the property, showing the neighbouring frontages too (Kent asks for this; most councils want a photo of the site).' },
      { text: 'A sketch or scaled plan with the measurements: the depth and width of the parking area, the footway and verge widths, and every tree, light, sign, pole, cover or cabinet near the crossing. The site plan in this pack can be used.' },
    ];
    if (model.owner === 'tenant') evidence.push({ text: `The freeholder’s or landlord’s written consent. ${a.rules.ownership ? a.rules.ownership.text : ''}`.trim() });
    else if (a.rules.ownership) evidence.push({ text: a.rules.ownership.text });
    if (a.process.evidence) evidence.push({ text: a.process.evidence });
    if (p.needed) evidence.push({ text: 'A copy of the planning permission (send it with the application).' });
    if (model.tree === 'yes') evidence.push({ text: 'A photograph of the street tree nearest the crossing, with its distance marked; measure the trunk 1.5 m above the ground.' });
    if (model.bay && model.bay !== 'none') evidence.push({ text: 'A photograph of the parking bay or restriction outside, as a change needs a traffic order.' });
    out.push({ id: 'photos', kind: 'checklist', title: 'Photographs and documents to send', items: evidence });
    // the planning pack
    if (p.status !== 'pass') {
      const flat = model.home === 'flat';
      const items = [
        { text: p.needed ? `Planning permission is needed as entered: ${result.results.filter(x => x.group === 'planning' && x.status === 'fail').map(x => x.ref).join('; ')}.` : 'Some planning answers are missing. Ask the planning authority, or apply for a lawful development certificate for proposed works (half the householder fee, £274 from 1 April 2026).' },
        { text: flat ? 'A flat or maisonette uses the full planning application form, not the householder one; the planning authority’s fee schedule sets the fee.' : 'A house uses the householder application: £548 in England from 1 April 2026.' },
        { text: 'Drawings: a location plan with the site outlined in red, the site plan with the parking area and the crossing, and the front elevation if the wall or gate changes. This pack’s plan and elevation can be the starting point.' },
        { text: 'Surface: say how the drive is built. A permeable surface, or drainage to a lawn, border or soakaway, keeps more than 5 m² within Class F (GPDO 2015, Part 1, paragraph F.2) and answers the drainage questions councils ask.' },
        { text: 'Apply online through the Planning Portal (www.planningportal.co.uk/applications) or on the planning authority’s own form. Apply for planning permission first: the highway authority will want the decision with your dropped kerb application.' },
      ];
      out.push({ id: 'planning', kind: 'checklist', title: 'Planning pack', items });
    }
    // if it is refused
    {
      const reasons = fails.concat(checks.filter(x => x.note)).slice(0, 8).map(x => ({ text: `${x.rule} You: ${x.value}${x.limit ? `; the limit: ${x.limit}` : ''}. (${x.sourceLabel}${x.ref ? ', ' + x.ref : ''})` }));
      out.push({ id: 'refused', kind: 'refused', title: 'If it is refused', intro: `The refusal letter should give the reasons. Match each one to the rule below, and to ${a.short}’s own wording, before you ask for a review. ${a.process.review}`, items: reasons.length ? reasons : [{ text: 'Nothing entered breaks a published rule, so a refusal would rest on what the inspector found on site: ask for the measurements and the rule relied on.' }],
        letter: [
          '[Your name]\n[Your address]\n[Date]', `To the dropped kerb (vehicle crossing) team, ${a.name}`,
          'Request for a review of the decision on my vehicle crossing application, reference [reference]',
          `You refused my application on [date] for the reason that [reason given]. ${a.short}’s published criteria (${Object.values(a.sources)[0].short}) set [the rule]. My measurements, enclosed, show [your figure], which [meets the rule / differs from the inspection because ...].`,
          'Please review the decision against your published criteria and tell me the measurement and the rule you relied on. If the issue can be solved by a change, such as lowering a wall within the visibility splay or moving the access, please say what you would accept.',
          'Yours faithfully,\n[Name]',
        ],
        route: `Next steps: ${a.process.review} If the council’s complaints process does not resolve it, the Local Government and Social Care Ombudsman looks at complaints about councils (www.lgo.org.uk).` });
    }
    // the contractor
    {
      const items = [{ text: a.process.builderText }];
      if (a.process.builder === 'council') items.push({ text: `${a.short} builds the crossing itself or through its own contractor, so you compare its quote with the published rates rather than with other firms.` });
      else items.push({ text: 'Ask each contractor for their New Roads and Street Works Act qualifications (supervisor and operative cards) and the public liability certificate, and check they meet the council’s level.' });
      items.push({ text: 'Ask whether the quote includes the street works permit or licence, traffic management, and the reinstatement of the footway and kerb to the council’s specification.' });
      items.push({ text: 'Ask how they will deal with utility covers, cables or pipes found in the way, and get those costs in writing; utilities may need weeks of notice.' });
      items.push({ text: 'Ask for the guarantee period and who fixes defects in it; councils hold the crossing to its standard after completion.' });
      if (a.process.valid) items.push({ text: `${a.process.valid} Book the works so they finish inside that time.` });
      out.push({ id: 'contractor', kind: 'checklist', title: 'Contractor quote checklist', items });
    }
    return out;
  }

  function packText(ctx) {
    const { model, result, E, A } = ctx;
    const a = A[model.a];
    const L = [];
    L.push('DROPPED KERB CHECK: LETTERS AND CHECKLISTS', `${a.name}. Council rules as of ${E.longDate(a.checked)} (rule set ${a.version}); national rules ${E.NAT.RULES_VERSION}.`, 'Not an approval: the council decides after its own site visit.', '');
    L.push(`Verdict: ${result.verdict.title}. ${result.verdict.text}`, `Planning: ${result.planning.title}. ${result.planning.text}`, '');
    for (const p of packs(ctx)) {
      L.push('='.repeat(72), p.title.toUpperCase(), '='.repeat(72), '');
      if (p.intro) L.push(p.intro, '');
      if (p.paras) p.paras.forEach(t => L.push(t, ''));
      if (p.items) { p.items.forEach((c, i) => L.push(`[ ] ${i + 1}. ${c.text}`)); L.push(''); }
      if (p.letter) { L.push('Review request:', ''); p.letter.forEach(t => L.push(t, '')); }
      if (p.route) L.push(p.route, '');
    }
    L.push('Made with Dropped Kerb Check, https://peakappsstudio.com/dropped-kerb/ . Check every figure before you send anything.');
    return L.join('\r\n') + '\r\n';
  }

  // ---------- the PDF ----------
  async function pdf(PDFLib, ctx) {
    const { model, result, E, A, shots = [], options = [] } = ctx;
    const a = A[model.a];
    const { PDFDocument, rgb, degrees } = PDFLib;
    const P = result.plan;
    const doc = await PDFDocument.create();
    doc.setTitle(safe(`Dropped kerb application pack: ${a.name}`));
    doc.setAuthor('Dropped Kerb Check (Peak Apps Studio)');
    doc.setSubject(safe(`Council rules as of ${E.longDate(a.checked)}, rule set ${a.version}`));
    doc.setCreator('Dropped Kerb Check, peakappsstudio.com/dropped-kerb/');
    doc.setProducer('pdf-lib');
    const F = await fonts(doc, PDFLib);
    const R = F.regular, B = F.bold, D = F.display;
    const hex = h => rgb(parseInt(h.slice(1, 3), 16) / 255, parseInt(h.slice(3, 5), 16) / 255, parseInt(h.slice(5, 7), 16) / 255);
    const C = { ink: hex('#1f2629'), ink2: hex('#3a4245'), muted: hex('#5c6467'), line: hex('#c9ccc9'), soft: hex('#ebebe6'), buff: hex('#e9dfc9'), verge: hex('#cfe0c0'), road: hex('#c3c6c4'), pass: hex('#2f6a2c'), fail: hex('#b01a18'), check: hex('#8a5200'), water: hex('#0b6f80'), red: hex('#c8201e'), white: rgb(1, 1, 1), paving: hex('#ddd3c1') };
    const W = 595.28, H = 841.89, M = 46;
    const pages = [];
    let page, y;
    const footer = pg => {
      pg.drawLine({ start: { x: M, y: 38 }, end: { x: W - M, y: 38 }, thickness: 0.5, color: C.line });
      pg.drawText(safe(`Dropped Kerb Check. ${a.short} rules as of ${E.longDate(a.checked)}, rule set ${a.version}. Not an approval: the council decides after its site visit.`), { x: M, y: 26, size: 7.5, font: R, color: C.muted });
    };
    const newPage = () => { page = doc.addPage([W, H]); pages.push(page); y = H - M; footer(page); return page; };
    const wrap = (text, font, size, width) => {
      const out = [];
      for (const para of safe(text).split('\n')) {
        const words = para.split(/\s+/).filter(Boolean);
        let line = '';
        for (const w of words) {
          const t = line ? line + ' ' + w : w;
          if (font.widthOfTextAtSize(t, size) <= width) line = t;
          else { if (line) out.push(line); line = w; while (font.widthOfTextAtSize(line, size) > width && line.length > 4) { let i = line.length - 1; while (i > 1 && font.widthOfTextAtSize(line.slice(0, i), size) > width) i--; out.push(line.slice(0, i)); line = line.slice(i); } }
        }
        out.push(line);
      }
      return out;
    };
    const text = (t, o = {}) => {
      const size = o.size || 10, font = o.font || (o.bold ? B : R), lh = o.lh || size * 1.4, width = o.width || W - 2 * M, x = o.x || M;
      for (const ln of wrap(t, font, size, width)) {
        if (y - lh < 54) newPage();
        page.drawText(ln, { x, y: y - size, size, font, color: o.color || C.ink });
        y -= lh;
      }
      y -= o.after != null ? o.after : 4;
    };
    const heading = (t, size = 20) => { if (y < 150) newPage(); y -= 4; page.drawText(safe(t), { x: M, y: y - size, size, font: D, color: C.ink }); y -= size + 6; page.drawRectangle({ x: M, y: y - 2, width: 46, height: 3, color: C.water }); y -= 14; };
    const statusColor = s => (s === 'pass' ? C.pass : s === 'fail' ? C.fail : s === 'info' ? C.muted : C.check);
    const money = x => (x == null ? 'quote' : `£${Number.isInteger(x) ? x.toLocaleString('en-GB') : x.toFixed(2)}`);

    // ---------- page 1: the summary and the 3D view ----------
    newPage();
    page.drawText('Dropped kerb application pack', { x: M, y: y - 30, size: 30, font: D, color: C.ink }); y -= 40;
    text(`${a.name}${model.sample ? ' (the sample house, not a real property)' : ''}`, { size: 13, bold: true, after: 1 });
    text(`Prepared on ${E.longDate(localDay())} with Dropped Kerb Check. ${a.short} rules as of ${E.longDate(a.checked)} (${a.version}); national rules ${E.NAT.RULES_VERSION}.`, { size: 9, color: C.muted, after: 10 });
    text('Property: [address of the property]          Applicant: [your name]', { size: 10, color: C.ink2, after: 12 });
    // the verdict box: measure, then draw
    {
      const tw = W - 2 * M - 150, top = y;
      const lines = wrap(result.verdict.title, D, 17, tw).length * 20 + wrap(result.verdict.text, R, 9.5, tw).length * 13.3 + 26;
      const h = Math.max(96, lines);
      page.drawRectangle({ x: M, y: top - h, width: W - 2 * M, height: h, borderColor: C.ink, borderWidth: 1, color: C.white });
      page.drawRectangle({ x: M, y: top - h, width: 6, height: h, color: statusColor(result.verdict.status === 'pass' ? 'pass' : result.verdict.status === 'fail' ? 'fail' : 'check') });
      y = top - 12;
      text(result.verdict.title, { x: M + 18, font: D, size: 17, lh: 20, width: tw, after: 2 });
      text(result.verdict.text, { x: M + 18, size: 9.5, width: tw });
      const cx = W - M - 118, c = result.councilCounts;
      page.drawLine({ start: { x: cx - 12, y: top }, end: { x: cx - 12, y: top - h }, thickness: 0.6, color: C.line });
      [['Pass', c.pass, C.pass], ['Fail', c.fail, C.fail], ['Check', c.check, C.check]].forEach(([k, v, col], i) => {
        page.drawText(k, { x: cx, y: top - 26 - i * 24, size: 10, font: B, color: col });
        page.drawText(String(v), { x: cx + 72, y: top - 28 - i * 24, size: 18, font: D, color: col });
      });
      y = top - h - 14;
    }
    const street = shots.find(s => s.label === 'street');
    if (street) {
      const img = street.url.startsWith('data:image/png') ? await doc.embedPng(street.url) : await doc.embedJpg(street.url);
      const iw = W - 2 * M, ih = iw * img.height / img.width;
      if (y - ih < 120) newPage();
      page.drawImage(img, { x: M, y: y - ih, width: iw, height: ih });
      page.drawRectangle({ x: M, y: y - ih, width: iw, height: ih, borderColor: C.line, borderWidth: 0.6 });
      const sx = iw / img.width;
      for (const t of street.tags || []) {
        const label = safe(t.text), w = B.widthOfTextAtSize(label, 7) + 6, tx = M + t.x * sx, ty = y - t.y * sx;
        page.drawRectangle({ x: tx - w / 2, y: ty + 1, width: w, height: 11, color: t.tone === 'bad' ? C.red : C.white, opacity: 0.94 });
        page.drawText(label, { x: tx - w / 2 + 3, y: ty + 4, size: 7, font: B, color: t.tone === 'bad' ? C.white : t.tone === 'ok' ? C.pass : t.tone === 'check' ? C.check : t.tone === 'limit' ? C.water : C.ink });
      }
      y -= ih + 6;
      text('Your frontage in 3D from the road. Teal: the visibility splays capped at 0.6 m. Dashed rings: the clearance the council asks round trees, lamp columns and furniture. Red: a rule that fails.', { size: 8.5, color: C.muted, after: 8 });
    } else text('The 3D view needs WebGL, which this browser did not provide. The plan and section follow.', { size: 9, color: C.muted, after: 8 });
    text(`Planning permission: ${result.planning.title}. ${result.planning.text}`, { size: 10, after: 4 });
    if (result.cost) {
      const fee = result.cost.lines.filter(l => l.kind === 'fee').reduce((s, l) => s + l.amount, 0);
      text(`Cost: ${result.cost.missing ? result.cost.missing : `${money(fee)} to apply, ${money(result.cost.atRisk)} of it at risk if refused; estimate ${result.cost.low === result.cost.high ? money(result.cost.low) : `${money(result.cost.low)} to ${money(result.cost.high)}`}${result.cost.openEnded ? ', before items quoted on site' : ''}.`}`, { size: 10 });
    }

    // ---------- page 2: the site plan, to scale ----------
    newPage();
    heading('Site plan');
    text('Drawn from the measurements entered, seen from above with the road at the foot, as you face the house from the street. Check every figure on site before you send it.', { size: 9, color: C.muted, after: 10 });
    drawPlan('frontage', 330);
    y -= 4;
    text('The street either side', { size: 11, bold: true, after: 6 });
    drawPlan('street', 220);
    // ---------- page 3: section and front elevation ----------
    newPage();
    heading('Section through the crossing');
    drawSection();
    y -= 14;
    heading('Front boundary from the road', 16);
    drawElevation();
    // ---------- 3D views ----------
    const sec = shots.find(s => s.label === 'section');
    if (sec) {
      y -= 6;
      if (y < 300) newPage();
      text('The same section in the 3D model', { size: 10, bold: true, after: 4 });
      const img = await doc.embedJpg(sec.url);
      const iw = W - 2 * M, ih = iw * img.height / img.width;
      if (y - ih < 60) newPage();
      page.drawImage(img, { x: M, y: y - ih, width: iw, height: ih });
      page.drawRectangle({ x: M, y: y - ih, width: iw, height: ih, borderColor: C.line, borderWidth: 0.6 });
      y -= ih + 8;
    }

    // ---------- every rule ----------
    newPage();
    heading('Every rule, with its source');
    text(`Each rule as ${a.short} publishes it, read on ${E.longDate(a.checked)}, then the national rules. Pass means every figure it needs was entered and inside the limit; Check means the council decides on site or an answer is missing.`, { size: 9, color: C.muted, after: 8 });
    const colX = [M, M + 42, M + 236, M + 352, M + 430], colW = [40, 190, 112, 74, W - M - (M + 430)];
    const row = (cells, o = {}) => {
      const size = o.head ? 8 : 8.2;
      const lines = cells.map((c, i) => wrap(c, o.head || i === 0 ? B : R, size, colW[i] - 4));
      const h = Math.max(...lines.map(l => l.length)) * size * 1.34 + 8;
      if (y - h < 54) newPage();
      if (o.fill) page.drawRectangle({ x: M, y: y - h, width: W - 2 * M, height: h, color: o.fill });
      lines.forEach((ls, i) => ls.forEach((ln, j) => page.drawText(ln, { x: colX[i] + 2, y: y - 6 - size - j * size * 1.34, size, font: o.head || i === 0 ? B : R, color: i === 0 && o.status ? statusColor(o.status) : o.head || i === 4 ? C.muted : C.ink })));
      y -= h;
      page.drawLine({ start: { x: M, y }, end: { x: W - M, y }, thickness: 0.4, color: C.line });
    };
    row(['Result', 'Rule', 'This frontage', 'Limit', 'Source'], { head: true, fill: C.soft });
    let group = '';
    const GROUP = { council: `${a.name}: its published rules`, consent: 'Highway law, for every council', planning: 'Planning permission (national rules)' };
    for (const r of result.results) {
      if (r.group !== group) { group = r.group; if (y < 90) newPage(); y -= 4; text(GROUP[group], { size: 9.5, bold: true, after: 2 }); }
      row([STATUS[r.status], r.rule, r.value + (r.note ? `. ${r.note}` : ''), r.limit || '', `${r.sourceLabel}${r.ref ? ', ' + r.ref : ''}`], { status: r.status });
    }
    y -= 10;
    text('Sources, each read on the date shown', { size: 10, bold: true, after: 3 });
    for (const s of Object.values(a.sources)) text(`${s.label}. ${s.url} (read ${E.longDate(s.checked)})`, { size: 8.2, color: C.muted, after: 3 });
    const natUsed = [...new Set(result.results.filter(r => r.group !== 'council').map(r => r.source))];
    for (const k of natUsed) { const s = E.NAT.SOURCES[k]; if (s) text(`${s.label}. ${s.url} (read ${E.longDate(s.checked)})`, { size: 8.2, color: C.muted, after: 3 }); }
    text('legislation.gov.uk and GOV.UK material is re-used under the Open Government Licence v3.0; council figures are quoted as facts with their source.', { size: 8.2, color: C.muted });

    // ---------- the packs ----------
    for (const p of packs(ctx)) {
      newPage();
      heading(p.title, 18);
      if (p.intro) text(p.intro, { size: 9.5, color: C.ink2, after: 8 });
      if (p.paras) p.paras.forEach((t, i) => text(t, { size: 10.5, bold: i === 2, after: 9 }));
      if (p.items) p.items.forEach((c, i) => text(`[  ]  ${i + 1}. ${c.text}`, { size: 9.8, after: 6 }));
      if (p.letter) { y -= 6; text('A letter asking for a review', { size: 11, bold: true, after: 6 }); p.letter.forEach((t, i) => text(t, { size: 10, bold: i === 2, after: 8 })); }
      if (p.route) { y -= 4; text(p.route, { size: 9.5, color: C.ink2 }); }
    }

    // ---------- side-by-side options ----------
    if (options.length > 1) {
      newPage();
      heading('Side-by-side options');
      text('Your frontage as entered, then with one change each, scored by the same rules.', { size: 9, color: C.muted, after: 10 });
      const ox = [M, M + 200, M + 260, M + 320, M + 380], ow = [196, 56, 56, 56, W - M - (M + 380)];
      const orow = (cells, o = {}) => {
        const lines = cells.map((c, i) => wrap(c, o.head || i === 0 ? B : R, 9, ow[i] - 4));
        const h = Math.max(...lines.map(l => l.length)) * 12.5 + 8;
        if (y - h < 54) newPage();
        if (o.fill) page.drawRectangle({ x: M, y: y - h, width: W - 2 * M, height: h, color: o.fill });
        lines.forEach((ls, i) => ls.forEach((ln, j) => page.drawText(ln, { x: ox[i] + 2, y: y - 15 - j * 12.5, size: 9, font: o.head || i === 0 ? B : R, color: o.cols ? o.cols[i] || C.ink : o.head ? C.muted : C.ink })));
        y -= h; page.drawLine({ start: { x: M, y }, end: { x: W - M, y }, thickness: 0.4, color: C.line });
      };
      orow(['Option', 'Pass', 'Fail', 'Check', 'Planning, and the estimate'], { head: true, fill: C.soft });
      for (const o of options) {
        const r = o.result, c = r.councilCounts || {};
        const est = r.cost ? (r.cost.low === r.cost.high ? money(r.cost.low) : `${money(r.cost.low)} to ${money(r.cost.high)}`) : '';
        orow([o.label, String(c.pass), String(c.fail), String(c.check), `${r.planning.title}. ${est}`], { cols: [C.ink, C.pass, C.fail, C.check, C.ink] });
      }
    }

    pages.forEach((pg, i) => pg.drawText(`${i + 1} / ${pages.length}`, { x: W - M - 28, y: 26, size: 7.5, font: R, color: C.muted }));
    return doc.save();

    // ---------- drawings ----------
    function drawPlan(mode, availH) {
      const X = P.cross, pl = P.plot;
      const items = [pl.x0 - 0.9, pl.x1 + 0.9, X.x0 - 0.4, X.x1 + 0.4];
      const street = mode === 'street';
      const jNear = street && P.junction && P.junction.x - X.x1 <= 15;
      if (street) {
        if (P.tree) items.push(P.tree.x - 3.6, P.tree.x + 3.6);
        if (P.lamp) items.push(P.lamp.x - 2.2, P.lamp.x + 2.2);
        if (P.furn) items.push(P.furn.x - 1.4, P.furn.x + 1.4);
        if (P.bus) items.push(P.bus.x - 1.2, P.bus.x + 1.2);
        if (jNear) items.push(P.junction.x + 8);
      }
      const x0 = Math.min(...items), x1 = Math.max(...items);
      const z0 = street ? -3.8 : -1.6, z1 = P.park.y1 + 1.9;
      const mm = 72 / 25.4, availW = W - 2 * M - (street ? 0 : 64);
      const scales = street ? [100, 200, 250, 500, 1000] : [50, 100, 200, 250];
      const s = scales.find(sc => (x1 - x0) * 1000 / sc * mm <= availW && (z1 - z0) * 1000 / sc * mm <= availH) || scales[scales.length - 1];
      const k = 1000 / s * mm;
      const top = y, ox = M + (availW - (x1 - x0) * k) / 2, oy = top - (z1 - z0) * k;
      const PX = x => ox + (x1 - x) * k;     // mirrored, so your left as you face the house is on the left of the page
      const PY = z => oy + (z - z0) * k;
      const rect = (ax, az, bx, bz, o) => page.drawRectangle(Object.assign({ x: Math.min(PX(ax), PX(bx)), y: Math.min(PY(az), PY(bz)), width: Math.abs(PX(bx) - PX(ax)), height: Math.abs(PY(bz) - PY(az)) }, o));
      const lineP = (ax, az, bx, bz, o) => page.drawLine(Object.assign({ start: { x: PX(ax), y: PY(az) }, end: { x: PX(bx), y: PY(bz) } }, o));
      const path = (pts, o) => page.drawSvgPath('M ' + pts.map(([px, pz]) => `${PX(px)} ${-PY(pz)}`).join(' L ') + ' Z', Object.assign({ x: 0, y: 0 }, o));
      const label = (x, z, t, o = {}) => { const st = safe(t), f = o.font || R, sz = o.size || 7.2; page.drawText(st, { x: PX(x) - f.widthOfTextAtSize(st, sz) / 2, y: PY(z) - sz / 2, size: sz, font: f, color: o.color || C.ink }); };
      // road, verge, footway
      rect(x0, z0, x1, 0, { color: C.road });
      if (P.verge > 0.15) rect(x0, 0.15, x1, P.verge, { color: C.verge });
      rect(x0, Math.max(0.15, P.verge), x1, P.yB, { color: C.buff });
      label(x1 - (street ? 2.4 : 1.2), z0 + 0.5, 'Road', { color: C.muted, size: 8 });
      // the crossing: the strengthened area to the boundary, the kerb with its dropped and transition kerbs
      path([[X.x0, 0.15], [X.x1, 0.15], [X.rear1, P.yB], [X.rear0, P.yB]], { color: hex('#c2c5c2'), borderColor: C.ink, borderWidth: 0.6 });
      const kerbEnd = P.junction && jNear ? P.junction.x : x1;
      lineP(x0, 0, X.x0, 0, { thickness: 2.4, color: C.ink });
      lineP(X.x1, 0, kerbEnd, 0, { thickness: 2.4, color: C.ink });
      lineP(X.x0, 0, X.flat0, 0, { thickness: 1.6, color: C.ink, dashArray: [1.2, 1] });
      lineP(X.flat1, 0, X.x1, 0, { thickness: 1.6, color: C.ink, dashArray: [1.2, 1] });
      lineP(X.flat0, 0, X.flat1, 0, { thickness: 0.8, color: C.ink });
      // the property: the boundary in red (the ownership outline councils ask for), the drive, the house front
      page.drawRectangle({ x: Math.min(PX(pl.x0), PX(pl.x1)), y: PY(P.yB), width: Math.abs(PX(pl.x1) - PX(pl.x0)), height: (P.park.y1 + 1.2 - P.yB) * k, borderColor: C.red, borderWidth: 1.6 });
      rect(P.park.x0, P.park.y0, P.park.x1, P.park.y1, { color: C.paving, borderColor: C.ink, borderWidth: 0.5 });
      rect(pl.x0 + 0.05, P.park.y1, pl.x1 - 0.05, P.park.y1 + 1.15, { color: hex('#dcc9bd'), borderColor: C.ink, borderWidth: 0.8 });
      label(0, P.park.y1 + 0.6, 'House', { font: B, size: 8 });
      const wallH = Number(model.wall) || 0;
      if (wallH > 0.01) { lineP(pl.x0, P.yB + 0.05, -P.gap / 2, P.yB + 0.05, { thickness: 3, color: hex('#a96d52') }); lineP(P.gap / 2, P.yB + 0.05, pl.x1, P.yB + 0.05, { thickness: 3, color: hex('#a96d52') }); }
      // the car
      const depthBad = (result.results.find(r => r.topic === 'depth') || {}).status === 'fail';
      const two = Number(model.spaces) === 2 && !P.parallel, L = P.car.length, cw = P.car.width;
      const carAt = cx => (P.parallel ? rect(cx - L / 2, P.yB + 0.45, cx + L / 2, P.yB + 0.45 + cw, { borderColor: C.ink, borderWidth: 0.7, borderDashArray: [3, 2] }) : rect(cx - cw / 2, P.park.y1 - 0.35 - L, cx + cw / 2, P.park.y1 - 0.35, { borderColor: depthBad ? C.red : C.ink, borderWidth: 0.7, borderDashArray: [3, 2] }));
      if (two) { carAt(-Math.max(1.2, P.width / 4)); carAt(Math.max(1.2, P.width / 4)); } else carAt(0);
      // splays
      const SP = result.authorityRules && result.authorityRules.pedSplay;
      if (SP && (SP.kind === 'edge' || SP.kind === 'centre')) {
        const tris = SP.kind === 'edge' ? [[[-P.gap / 2, P.yB], [-P.gap / 2 - SP.along, P.yB], [-P.gap / 2, P.yB + SP.into]], [[P.gap / 2, P.yB], [P.gap / 2 + SP.along, P.yB], [P.gap / 2, P.yB + SP.into]]] : [[[-SP.half, P.yB], [SP.half, P.yB], [0, P.yB + SP.into]]];
        for (const t of tris) path(t, { color: C.water, opacity: 0.18, borderColor: C.water, borderWidth: 0.9, borderDashArray: [3, 2], borderOpacity: 1 });
      }
      // trees, street lights, furniture and a bus stop, each with the clearance the council asks for
      const byTopic = t => result.results.find(r => r.topic === t && r.group === 'council') || {};
      const circle = (x, z, r, col, dash) => page.drawCircle({ x: PX(x), y: PY(z), size: r * k, borderColor: col, borderWidth: 0.8, borderDashArray: dash ? [3, 2] : undefined });
      const inView = x => x > x0 && x < x1;
      if (P.tree && inView(P.tree.x)) { circle(P.tree.x, P.tree.y, Math.max(0.12, (P.tree.circ || 0.9) / (2 * Math.PI)), C.ink); const t = byTopic('tree'); if (t.radius) circle(P.tree.x, P.tree.y, t.radius, t.status === 'fail' ? C.red : C.pass, true); label(P.tree.x, P.tree.y + 0.75, 'Tree'); }
      if (P.lamp && inView(P.lamp.x)) { page.drawCircle({ x: PX(P.lamp.x), y: PY(P.lamp.y), size: 2.3, color: C.ink }); const t = byTopic('lamp'); if (t.radius) circle(P.lamp.x, P.lamp.y, t.radius, t.status === 'fail' ? C.red : C.pass, true); label(P.lamp.x, P.yB + 0.45, 'Lamp column'); }
      if (P.furn && inView(P.furn.x)) { rect(P.furn.x - 0.55, P.furn.y - 0.22, P.furn.x + 0.55, P.furn.y + 0.22, { color: hex('#2f4b3c') }); label(P.furn.x, P.furn.y - 0.6, 'Cabinet'); }
      if (P.bus && inView(P.bus.x)) { page.drawCircle({ x: PX(P.bus.x), y: PY(P.bus.y), size: 2.5, color: C.red }); label(P.bus.x, P.bus.y + 0.6, 'Bus stop'); }
      if (jNear) { const xj = P.junction.x; page.drawSvgPath(`M ${PX(xj)} ${-PY(0)} Q ${PX(xj + 6)} ${-PY(0)} ${PX(xj + 6)} ${-PY(6)}`, { x: 0, y: 0, borderColor: C.ink, borderWidth: 2.4 }); label(xj + 4, 2.4, 'Side road'); }
      // dimensions
      if (!street) {
        dimX(P.park.x0, P.park.x1, P.yB + Math.min(1.1, P.depth * 0.22), `${E.fmt(P.width)} m clear width`);
        dimZ(P.yB, P.park.y1, P.park.x1 + 0.45, `${E.fmt(P.depth)} m deep`);
        dimZ(Math.max(0.15, P.verge), P.yB, pl.x0 - 0.45, `${E.fmt(P.footway)} m footway`);
        if (P.verge > 0.15) dimZ(0, P.verge, pl.x0 - 0.45, `${E.fmt(P.verge)} m verge`);
        dimX(X.x0, X.x1, -0.75, `${E.fmt(X.x1 - X.x0)} m along the kerb, the council’s standard`);
        dimX(pl.x0, pl.x1, P.park.y1 + 1.5, `${E.fmt(pl.x1 - pl.x0)} m frontage, boundary to boundary`);
        if (wallH > 0.01) label(pl.x1 - (pl.x1 - P.gap / 2) / 2, P.yB + 0.35, `wall ${E.fmt(wallH)} m`, { size: 6.8 });
      } else {
        if (P.tree && inView(P.tree.x)) dimX(P.tree.x, X.x0, -1.4, `${E.fmt(X.x0 - P.tree.x)} m to the tree`);
        if (P.lamp && inView(P.lamp.x)) dimX(X.x1, P.lamp.x, -1.4, `${E.fmt(P.lamp.x - X.x1)} m to the light`);
        if (P.junction && jNear) dimX(X.x1, P.junction.x, -2.8, `${E.fmt(P.junction.x - X.x1)} m to the junction`);
      }
      // scale bar, and the north point to draw by hand
      const bar = s <= 100 ? 2 : 5, sb = bar * k, by = oy - 16;
      page.drawRectangle({ x: M, y: by, width: sb / 2, height: 3.5, color: C.ink });
      page.drawRectangle({ x: M + sb / 2, y: by, width: sb / 2, height: 3.5, borderColor: C.ink, borderWidth: 0.6 });
      page.drawText(safe(`0, ${bar / 2}, ${bar} m. Scale 1:${s} on A4, printed at 100%.${street ? '' : ' Red: your boundary. Dashed teal: visibility splays.'}${street && P.junction && !jNear ? ` Nearest junction ${E.fmt(P.junction.x - X.x1)} m from the crossing, off this plan.` : ''}`), { x: M + sb + 8, y: by, size: 7.4, font: R, color: C.muted });
      if (!street) {
        page.drawRectangle({ x: W - M - 50, y: top - 50, width: 50, height: 50, borderColor: C.ink, borderWidth: 0.6 });
        page.drawText('North', { x: W - M - 45, y: top - 13, size: 7.5, font: B, color: C.ink });
        page.drawText('draw the arrow', { x: W - M - 45, y: top - 23, size: 6.5, font: R, color: C.muted });
      }
      y = by - 18;
      function dimX(a0, a1, z, t) {
        const ya = PY(z), xa = PX(a0), xb = PX(a1);
        page.drawLine({ start: { x: xa, y: ya }, end: { x: xb, y: ya }, thickness: 0.6, color: C.ink });
        [xa, xb].forEach(v => page.drawLine({ start: { x: v, y: ya - 3 }, end: { x: v, y: ya + 3 }, thickness: 0.6, color: C.ink }));
        const st = safe(t), tw = R.widthOfTextAtSize(st, 7.2);
        page.drawRectangle({ x: (xa + xb) / 2 - tw / 2 - 2, y: ya + 1.5, width: tw + 4, height: 9, color: C.white, opacity: 0.85 });
        page.drawText(st, { x: (xa + xb) / 2 - tw / 2, y: ya + 3.2, size: 7.2, font: R, color: C.ink });
      }
      function dimZ(a0, a1, x, t) {
        const xa = PX(x), ya = PY(a0), yb = PY(a1);
        page.drawLine({ start: { x: xa, y: ya }, end: { x: xa, y: yb }, thickness: 0.6, color: C.ink });
        [ya, yb].forEach(v => page.drawLine({ start: { x: xa - 3, y: v }, end: { x: xa + 3, y: v }, thickness: 0.6, color: C.ink }));
        const st = safe(t), tw = R.widthOfTextAtSize(st, 7.2);
        page.drawText(st, { x: xa - 3.2, y: (ya + yb) / 2 - tw / 2, size: 7.2, font: R, color: C.ink, rotate: degrees(90) });
      }
    }
    function drawSection() {
      // across the street through the middle of the crossing; heights drawn twice as tall so the kerb reads
      const z0 = -2.6, z1 = P.park.y1 + 1.6, mm = 72 / 25.4, availW = W - 2 * M;
      const s = [50, 100, 200].find(sc => (z1 - z0) * 1000 / sc * mm <= availW) || 200;
      const k = 1000 / s * mm, v = 2 * k;
      const base = y - 96, ox = M + (availW - (z1 - z0) * k) / 2;
      const X = z => ox + (z - z0) * k, Y = h => base + h * v;
      const lift = Math.max(-0.8, Math.min(1, Number(model.level) || 0));
      const ramp = Math.min(P.yB - 0.15, Math.max(0.9, (P.yB - 0.15) * 0.55));
      const top = 0.125 + lift;
      page.drawSvgPath(`M ${X(z0)} ${-Y(0)} L ${X(0)} ${-Y(0)} L ${X(0)} ${-Y(0.025)} L ${X(0.15)} ${-Y(0.025)} L ${X(0.15 + ramp)} ${-Y(0.125)} L ${X(P.yB)} ${-Y(0.125)} L ${X(P.park.y1)} ${-Y(top)} L ${X(P.park.y1)} ${-Y(top + 1.2)} L ${X(z1)} ${-Y(top + 1.2)} L ${X(z1)} ${-Y(-0.45)} L ${X(z0)} ${-Y(-0.45)} Z`, { x: 0, y: 0, color: C.soft, borderColor: C.ink, borderWidth: 0.9 });
      page.drawLine({ start: { x: X(0), y: Y(0.125) }, end: { x: X(0.15), y: Y(0.125) }, thickness: 0.7, color: C.muted, dashArray: [2, 1.5] });
      // the kerb, explained above it with a leader
      { const ly = Y(0.125 + Math.max(0.9, (Number(model.wall) || 0) + 0.35)); page.drawLine({ start: { x: X(0.07), y: Y(0.14) }, end: { x: X(0.07), y: ly }, thickness: 0.4, color: C.muted }); page.drawLine({ start: { x: X(0.07), y: ly }, end: { x: M, y: ly }, thickness: 0.4, color: C.muted }); page.drawText(safe('Dropped kerb: 25 mm upstand at the road (125 mm elsewhere, dashed)'), { x: M, y: ly + 3, size: 7.2, font: R, color: C.ink }); }
      // the wall beside the opening and the 0.6 m line
      const wallH = Number(model.wall) || 0;
      if (wallH > 0.01) page.drawRectangle({ x: X(P.yB) - 2.5, y: Y(0.125), width: 5, height: wallH * v, color: hex('#a96d52') });
      page.drawLine({ start: { x: X(P.yB - 0.4), y: Y(0.725) }, end: { x: X(P.yB + 2.4), y: Y(0.725) }, thickness: 0.8, color: C.water, dashArray: [3, 2] });
      page.drawText('0.6 m above the footway', { x: X(P.yB + 2.5), y: Y(0.725) - 2.5, size: 7, font: B, color: C.water });
      const lab = (z, t) => { const st = safe(t), tw = R.widthOfTextAtSize(st, 7.5); page.drawText(st, { x: X(z) - tw / 2, y: base - 14, size: 7.5, font: R, color: C.ink }); };
      lab(z0 / 2, 'Road'); lab((0.15 + P.yB) / 2, `Footway ${E.fmt(P.yB)} m`); lab((P.yB + P.park.y1) / 2, `Drive ${E.fmt(P.depth)} m, ${lift >= 0 ? 'rising' : 'falling'} ${E.fmt(Math.abs(lift))} m`); lab(P.park.y1 + 0.8, 'House');
      page.drawText(safe(`Horizontal scale 1:${s} on A4; heights twice as tall, so the kerb and the 0.6 m line read.`), { x: M, y: Y(-0.45) - 14, size: 7.4, font: R, color: C.muted });
      y = Y(-0.45) - 28;
    }
    function drawElevation() {
      // the boundary as seen from the road: wall heights either side of the opening against the 0.6 m limit
      const pl = P.plot, x0 = pl.x0 - 0.6, x1 = pl.x1 + 0.6, mm = 72 / 25.4, availW = W - 2 * M - 120;
      const s = [50, 100, 200].find(sc => (x1 - x0) * 1000 / sc * mm <= availW) || 200;
      const k = 1000 / s * mm;
      const wallH = Number(model.wall) || 0;
      const base = y - Math.max(46, (Math.max(wallH, 0.6) + 0.35) * k), ox = M;
      const X = x => ox + (x1 - x) * k, Y = h => base + h * k;
      page.drawLine({ start: { x: X(x1), y: base }, end: { x: X(x0), y: base }, thickness: 1, color: C.ink });
      const SP = result.authorityRules && result.authorityRules.pedSplay;
      const bad = (result.results.find(r => r.topic === 'splay') || {}).status === 'fail';
      const reach = SP && SP.kind === 'edge' ? SP.along : SP && SP.kind === 'centre' ? Math.max(0, SP.half - P.gap / 2) : 0;
      const seg = (a0, a1, red) => { if (Math.abs(a1 - a0) < 0.02) return; page.drawRectangle({ x: Math.min(X(a0), X(a1)), y: base, width: Math.abs(X(a1) - X(a0)), height: wallH * k, color: red ? hex('#efc2bd') : hex('#dcc2b3'), borderColor: red ? C.red : C.ink, borderWidth: 0.8 }); };
      if (wallH > 0.01) { const l = Math.min(pl.x1, P.gap / 2 + reach), r = Math.max(pl.x0, -P.gap / 2 - reach); seg(P.gap / 2, l, bad && reach > 0); seg(l, pl.x1, false); seg(r, -P.gap / 2, bad && reach > 0); seg(pl.x0, r, false); }
      page.drawLine({ start: { x: X(x1), y: Y(0.6) }, end: { x: X(x0), y: Y(0.6) }, thickness: 0.8, color: C.water, dashArray: [3, 2] });
      page.drawText(safe(SP && SP.h ? `${E.fmt(SP.h)} m limit${SP.kind === 'edge' ? `, ${E.fmt(SP.along)} m each side of the opening` : SP.kind === 'centre' ? `, ${E.fmt(SP.half)} m each side of the centre` : ''}` : '0.6 m, the usual limit'), { x: X(x0) + 6, y: Y(0.6) - 2.5, size: 7, font: B, color: C.water });
      const st = safe(`${E.fmt(P.gap)} m opening`), tw = B.widthOfTextAtSize(st, 7.5);
      page.drawText(st, { x: X(0) - tw / 2, y: base + 5, size: 7.5, font: B, color: C.ink });
      if (wallH > 0.01) page.drawText(safe(`${bad ? 'Too high: ' : ''}wall, fence or hedge ${E.fmt(wallH)} m`), { x: X(x0) + 6, y: Y(Math.max(wallH, 0.6)) + 8, size: 7.2, font: R, color: bad ? C.red : C.ink });
      page.drawText(safe(`Scale 1:${s} on A4, as seen from the road.`), { x: M, y: base - 14, size: 7.4, font: R, color: C.muted });
      y = base - 28;
    }
  }

  return { pdf, packText, packs, describe, safe, api };
});
