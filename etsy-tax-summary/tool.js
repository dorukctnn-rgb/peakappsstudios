/* Etsy Tax Summary: page logic. Engine: etsytax.js (window.EtsyTax). Exports: report.js (window.EtsyReport).
 * Files are read in the page with File.text() and never uploaded. pdf-lib loads only for the Pro PDF. */
(function () {
  'use strict';

  // ---- Gumroad Pro product. The owner creates it with this permalink, then pastes its product id here. ----
  const GUMROAD_PRODUCT_ID = 'Z6VzDOme3lJ5ogbqVj7DKA==';
  const LICENSE = {
    tool: 'etsy-tax',
    productId: GUMROAD_PRODUCT_ID,
    permalink: 'etsy-tax-summary-pro',
    buyUrl: 'https://dorukctn.gumroad.com/l/etsy-tax-summary-pro',
    pitch: 'Pro adds the accountant PDF, CSV and XLSX exports, several shops in one report, the UK tax year and a materials and mileage list. $19, one time.',
  };
  const PDFLIB_SRC = '/etsy-tax-summary/vendor/pdf-lib.min.js';
  const COSTS_KEY = 'etsy-tax:costs';
  const MAX_BYTES = 50 * 1024 * 1024;

  const E = window.EtsyTax;
  const $ = id => document.getElementById(id);
  const esc = s => String(s == null ? '' : s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const store = {
    get(k, d) { try { const v = JSON.parse(localStorage.getItem(k) || 'null'); return v == null ? d : v; } catch (e) { return d; } },
    set(k, v) { try { localStorage.setItem(k, JSON.stringify(v)); } catch (e) { /* private mode */ } },
  };

  const S = {
    files: [], shops: [{ id: 1, name: 'Shop 1' }], view: 1, region: null, periodId: null, periodChosen: false,
    march: false, currency: null, pro: false, sample: false, skipped: [], costs: store.get(COSTS_KEY, []),
  };
  let fileSeq = 0, shopSeq = 1, V = null;

  const loc = () => (S.region === 'uk' ? 'en-GB' : 'en-US');
  const fmt = c => E.money(c, S.currency || 'USD', { locale: loc() });
  const int = n => Number(n).toLocaleString('en-US');
  const shopName = id => (S.shops.find(s => s.id === id) || {}).name || 'Shop';
  const SHORT = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
  const monthLabel = k => { const m = /^(\d{4})-(\d{2})$/.exec(k); return m ? `${SHORT[+m[2] - 1]} ${m[1]}` : k; };

  // ---------- Files ----------
  async function addFiles(list) {
    const added = [];
    S.skipped = [];
    for (const file of list) {
      if (file.size > MAX_BYTES) { S.skipped.push(`${file.name}: larger than 50 MB, so not a statement CSV.`); continue; }
      if (!/\.(csv|tsv|txt)$/i.test(file.name) && !/csv|tab-separated|text\/plain/i.test(file.type)) { S.skipped.push(`${file.name}: not a CSV file.`); continue; }
      let text;
      try { text = await file.text(); } catch (e) { S.skipped.push(`${file.name}: couldn’t be read.`); continue; }
      addText(file.name, text, added);
    }
    afterAdd(added);
  }
  function addText(name, text, added) {
    const f = E.readFile(name, text);
    if (f.error) { S.skipped.push(`${name}: ${f.error}`); return; }
    if (S.files.some(x => x.hash === f.hash)) { S.skipped.push(`${name}: already added.`); return; }
    f.id = ++fileSeq;
    f.shopId = S.view === 'all' ? S.shops[0].id : S.view;
    S.files.push(f);
    added.push(f);
  }
  function afterAdd(added) {
    if (added.length) {
      const rows = added.reduce((a, f) => a + f.rows.length, 0);
      say(`Read ${added.length} file${added.length > 1 ? 's' : ''}, ${int(rows)} rows.` + (S.skipped.length ? ` ${S.skipped.length} skipped.` : ''));
    } else if (S.skipped.length) {
      PeakUI.toast(S.skipped[0]);
      say(S.skipped.join(' '));
    }
    render();
  }
  function say(msg) { $('status').textContent = msg; if (msg) PeakUI.toast(msg); }

  function loadSample() {
    reset(true);
    const added = [];
    for (const f of E.sampleYear(2025)) addText(f.name, f.text, added);
    S.sample = true;
    S.region = 'us';
    afterAdd(added);
    $('tool').scrollIntoView({ behavior: matchMedia('(prefers-reduced-motion: reduce)').matches ? 'auto' : 'smooth', block: 'start' });
  }
  function reset(quiet) {
    S.files = []; S.shops = [{ id: 1, name: 'Shop 1' }]; S.view = 1; shopSeq = 1;
    S.region = null; S.periodId = null; S.periodChosen = false; S.march = false; S.currency = null; S.sample = false; S.skipped = [];
    if (!quiet) { render(); say('Cleared. Drop your files to start again.'); }
  }

  // ---------- Model ----------
  function compute() {
    for (const sh of S.shops) E.markDuplicates(S.files.filter(f => f.shopId === sh.id && f.kind === 'statement'));
    const ids = S.view === 'all' ? S.shops.map(s => s.id) : [S.view];
    const files = S.files.filter(f => ids.includes(f.shopId));
    const st = files.filter(f => f.kind === 'statement'), other = files.filter(f => f.kind !== 'statement');
    const rows = st.flatMap(f => f.rows);
    const tally = new Map();
    const count = r => { if (r.currency) tally.set(r.currency, (tally.get(r.currency) || 0) + 1); };
    rows.forEach(count);
    if (!tally.size) other.forEach(f => f.rows.forEach(count));
    const currencies = [...tally.entries()].sort((a, b) => b[1] - a[1]).map(x => x[0]);
    if (!S.currency || !currencies.includes(S.currency)) S.currency = currencies[0] || 'USD';
    if (!S.region) S.region = S.currency === 'GBP' ? 'uk' : S.currency === 'USD' ? 'us' : 'other';
    const basis = (rows.length ? rows : other.flatMap(f => f.rows)).filter(r => !r.currency || r.currency === S.currency);
    const P = E.periodsFor(basis);
    const valid = new Set(P.calendar.map(p => p.id).concat(P.uk.map(p => p.id)));
    let pid = S.periodId;
    if (!pid || !valid.has(pid) || (/^uk/.test(pid) && !S.pro)) {
      pid = (S.region === 'uk' && S.pro && P.defaultUkId) || P.defaultId || ('cal-' + new Date().getFullYear());
    }
    S.periodId = pid;
    const period = E.periodById(/^uk-/.test(pid) && S.march ? pid.replace('uk-', 'ukm-') : pid);
    const s = E.summarize({ statementRows: rows, orderFiles: other, period, currency: S.currency });
    const cost = S.pro ? E.costsInPeriod(S.costs, period, S.region) : null;
    const lines = E.formLines(s, S.region, cost);
    return { files, st, other, rows, currencies, P, period, s, cost, lines };
  }

  // ---------- Render ----------
  function render() {
    const has = S.files.length > 0;
    $('tool').dataset.state = has ? 'ready' : 'empty';
    $('empty').hidden = has;
    $('ready').hidden = !has;
    if (!has) { V = null; return; }
    V = compute();
    renderBar(V); renderLedger(V); renderSide(V); renderMonths(V); renderMap(V); renderFiles(V); renderCosts(V); renderDetails(V);
  }

  function renderBar(v) {
    const sel = $('period');
    const cal = v.P.calendar.map(p => `<option value="${p.id}">${esc(p.label)}</option>`).join('');
    const uk = v.P.uk.map(p => `<option value="${p.id}">${esc(p.label)}, 6 Apr to 5 Apr${S.pro ? '' : ' (Pro)'}</option>`).join('');
    sel.innerHTML = (cal ? `<optgroup label="Calendar year (US and most countries)">${cal}</optgroup>` : `<option value="${S.periodId}">${esc(v.period.label)}</option>`) + (uk ? `<optgroup label="UK tax year">${uk}</optgroup>` : '');
    sel.value = S.periodId;
    $('march-f').hidden = !/^uk/.test(S.periodId);
    $('march').checked = S.march;
    $('region').querySelectorAll('button').forEach(b => b.setAttribute('aria-pressed', String(b.dataset.value === S.region)));
    $('currency').innerHTML = v.currencies.map(c => `<option>${esc(c)}</option>`).join('') || '<option>USD</option>';
    $('currency').value = S.currency;
    $('currency').disabled = v.currencies.length < 2;
    const multi = S.shops.length > 1;
    $('shop-f').hidden = !multi;
    if (multi) {
      $('shop').innerHTML = S.shops.map(s => `<option value="${s.id}">${esc(s.name)}</option>`).join('') + '<option value="all">All shops combined</option>';
      $('shop').value = String(S.view);
    }
    $('add-shop').querySelector('.pro-tag').hidden = S.pro;
    $('sample-note').hidden = !S.sample;
  }

  function lineCell(cat) { const l = E.lineFor(cat, S.region); return l; }
  function amt(c, cls) { return `<td class="num${c < 0 ? ' neg' : ''}${cls ? ' ' + cls : ''}">${fmt(c)}</td>`; }
  function lrow(label, cents, opts) {
    opts = opts || {};
    const l = opts.line != null ? opts.line : opts.cat ? lineCell(opts.cat) : '';
    const tag = l && S.region !== 'other' ? `<span class="ln-inline">${esc(l)}</span>` : '';
    const hint = opts.hint ? `<span class="hint-cell">${esc(opts.hint)}</span>` : '';
    const lnTd = S.region !== 'other' ? `<td class="ln">${esc(l)}</td>` : '';
    return `<tr class="${opts.cls || ''}"><th scope="row">${esc(label)}${tag}${hint}</th>${amt(cents)}${lnTd}</tr>`;
  }
  function group(label) { return `<tr class="group"><th colspan="${S.region !== 'other' ? 3 : 2}" scope="rowgroup">${esc(label)}</th></tr>`; }

  function renderLedger(v) {
    const s = v.s, t = s.totals;
    const shopLabel = S.view === 'all' ? 'All shops' : shopName(S.view);
    $('ledger-sub').textContent = `${v.period.label}, ${S.currency}${S.shops.length > 1 || S.view === 'all' ? ', ' + shopLabel : ''}`;
    $('ledger-h').innerHTML = s.counts.rows ? `Summary for <em>${esc(v.period.short)}</em>` : 'No statement rows in this period';
    $('ledger-key').innerHTML = s.counts.rows ? `<div><dt>Sales after refunds</dt><dd>${fmt(s.netSales)}</dd></div><div><dt>Net from Etsy</dt><dd>${fmt(s.netEtsy)}</dd></div>` : '';
    if (!s.counts.rows) {
      $('ledger').innerHTML = `<tbody><tr><td class="ledger-empty" colspan="3"><p>${v.st.length ? 'Your statement files have no rows in this tax year. Choose another year above.' : 'Add your Etsy monthly statement CSVs. Order CSVs alone don’t show fees.'}</p></td></tr></tbody>`;
      $('memo').hidden = true;
      return;
    }
    $('memo').hidden = false;
    const head = S.region === 'us' ? 'Schedule C' : S.region === 'uk' ? 'SA103S' : '';
    let h = `<caption class="sr-only">Summary for ${esc(v.period.label)} in ${esc(S.currency)}</caption><thead><tr><th scope="col">Item</th><th scope="col" class="num">Amount</th>${head ? `<th scope="col" class="ln">${head}</th>` : ''}</tr></thead><tbody>`;
    h += group('Income');
    h += lrow('Sales', s.salesExTax, { cat: 'sales', hint: 'Including the shipping buyers paid, after discounts, without the tax Etsy collected' });
    if (s.orders.shipping != null) h += lrow('of which shipping charged', s.orders.shipping, { cls: 'sub', line: '' });
    h += lrow('Refunds to buyers', s.refundsExTax, { cat: 'refunds' });
    h += lrow('Sales after refunds', s.netSales, { cls: 'subtotal', line: '' });
    h += group('Etsy fees');
    h += lrow('Transaction fees', t.fee_transaction, { cat: 'fee_transaction' });
    h += lrow('Payment processing fees', t.fee_processing, { cat: 'fee_processing' });
    h += lrow('Listing and renewal fees', t.fee_listing, { cat: 'fee_listing' });
    if (t.fee_regulatory) h += lrow('Regulatory operating fees', t.fee_regulatory, { cat: 'fee_regulatory' });
    if (t.fee_tax) h += lrow(S.region === 'uk' ? 'VAT on Etsy fees' : 'Tax and VAT on Etsy fees', t.fee_tax, { cat: 'fee_tax' });
    if (t.fee_subscription) h += lrow('Subscriptions', t.fee_subscription, { cat: 'fee_subscription' });
    if (t.fee_other) h += lrow('Other Etsy fees and credits', t.fee_other, { cat: 'fee_other' });
    h += lrow('Etsy fees', s.fees, { cls: 'subtotal', line: '' });
    h += group('Advertising and postage');
    h += lrow('Etsy Ads', t.ads_etsy, { cat: 'ads_etsy' });
    h += lrow('Offsite Ads fees', t.ads_offsite, { cat: 'ads_offsite' });
    if (t.ads_other) h += lrow('Other marketing', t.ads_other, { cat: 'ads_other' });
    h += lrow('Shipping labels bought on Etsy', s.labels, { cat: 'labels' });
    h += `</tbody><tbody>`;
    h += lrow('Net from Etsy activity', s.netEtsy, { cls: 'total', line: '' });
    if (v.cost && v.cost.total) {
      h += `</tbody><tbody>` + group('Your own costs');
      const by = v.cost.by, L = S.region;
      const ln = k => (L === 'us' ? { materials: 'Line 4', supplies: 'Line 22', mileage: 'Line 9', other: 'Line 27b' } : L === 'uk' ? { materials: 'Box 11', supplies: 'Box 11', mileage: 'Box 12', other: 'Box 19' } : {})[k] || '';
      if (by.materials) h += lrow('Materials', -by.materials, { line: ln('materials') });
      if (by.supplies) h += lrow('Packaging and supplies', -by.supplies, { line: ln('supplies') });
      if (by.mileage) h += lrow(`Mileage, ${int(v.cost.miles)} miles`, -by.mileage, { line: ln('mileage') });
      if (by.other) h += lrow('Other expenses', -by.other, { line: ln('other') });
      h += `</tbody><tbody>` + lrow('Estimated profit before tax', s.netEtsy - v.cost.total, { cls: 'total', line: '' });
    }
    h += '</tbody>';
    $('ledger').innerHTML = h;

    const memo = [['Sales tax and VAT Etsy collected from buyers', s.taxOnSales]];
    if (s.taxOnRefunds) memo.push(['Of that, returned to buyers with refunds', -s.taxOnRefunds]);
    memo.push(['Sent to your bank', -s.deposits]);
    if (s.payments) memo.push(['Payments you made to Etsy', s.payments]);
    if (s.reserve) memo.push(['Reserve held or released', s.reserve]);
    if (s.unmapped) memo.push(['Rows to review, kept out of the totals', s.unmapped]);
    memo.push(['Change in your Etsy balance over the period', s.balanceChange]);
    $('memo').innerHTML = `<h3>Not income, not an expense</h3><dl>${memo.map(([l, c]) => `<dt>${esc(l)}</dt><dd>${fmt(c)}</dd>`).join('')}</dl><p>Etsy collects that tax as the marketplace and pays it over, so it is left out of sales. Deposits move money you already earned to your bank.</p>`;
  }

  function renderSide(v) {
    const s = v.s, c = s.checks.slice();
    if (v.currencies.length > 1) c.unshift({ info: true, ok: true, title: 'More than one currency', text: `These files are in ${v.currencies.join(' and ')}. Totals can’t mix currencies, so the summary shows ${S.currency}. Switch with Shop currency.` });
    if (s.counts.outside) c.push({ info: true, ok: true, title: 'Rows in other years', text: `${int(s.counts.outside)} rows fall outside ${v.period.label} and are left out. Pick another tax year to see them.` });
    if (s.orders.orders && s.counts.rows) {
      const d = s.orders.orders.total - s.salesGross;
      c.push({ ok: Math.abs(d) <= Math.max(100, Math.abs(s.salesGross) * 0.01), title: 'Sold Orders CSV', text: d === 0 ? 'Its Order Total column matches the statements’ sales to the cent.' : `Its Order Total differs from the statements’ sales by ${fmt(d)}. Orders near the year end, cancellations and orders from other shops cause this.` });
    }
    $('checks').innerHTML = c.map(x => `<li data-state="${x.info ? 'info' : x.ok ? 'ok' : 'check'}"><strong>${esc(x.title)}</strong><span>${esc(x.text)}</span></li>`).join('');

    const k = s.k1099;
    $('k1099').hidden = !k || !s.counts.rows;
    if (k && s.counts.rows) {
      const yr = v.period.year, sofar = v.period.end > s.today;
      const pay = s.orders.payments;
      $('k1099-body').innerHTML =
        `<div class="k-figure"><span>Gross sales for the 1099-K${sofar ? ', so far' : ''}</span><b>${fmt(k.gross)}</b></div>` +
        `<div class="k-figure"><span>Sales (transactions)</span><b>${int(k.transactions)}</b></div>` +
        (pay ? `<div class="k-figure"><span>Etsy Payments CSV, Gross column</span><b>${fmt(pay.gross)}</b></div>` : '') +
        `<p class="k-status">${k.over ? `Above both federal thresholds: Etsy should send you a 1099-K for ${yr}.` : `Not above both federal thresholds${sofar ? ' so far' : ''}, so no federal 1099-K is expected for ${yr}. The income still goes on your return.`}</p>` +
        `<p class="hint">Etsy files one when gross sales are more than $20,000 and there are more than 200 sales (calendar years from 2025). Some states use lower thresholds. <a href="/etsy-tax-summary/without-1099-k/">Filing without a 1099-K</a></p>`;
    }
    const ex = document.querySelector('.side-export');
    ex.dataset.pro = String(S.pro);
    ex.querySelector('.pro-tag').hidden = S.pro;
    $('export-note').textContent = S.pro
      ? `PDF on ${S.region === 'us' ? 'US Letter' : 'A4'} paper. CSV and XLSX list every row with its category and ${S.region === 'us' ? 'Schedule C line' : S.region === 'uk' ? 'SA103S box' : 'category'}.`
      : 'Part of Pro. The summary on this page stays free.';
    ['x-pdf', 'x-csv', 'x-xlsx'].forEach(id => { $(id).disabled = !s.counts.rows; });
  }

  function renderMonths(v) {
    const s = v.s;
    const cols = ['Sales', 'Refunds', 'Tax Etsy collected', 'Etsy fees', 'Ads', 'Shipping labels', 'Net from Etsy', 'Deposited'];
    const val = d => [d.salesExTax, d.refundsExTax, d.taxCollectedNet, d.fees, d.ads, d.labels, d.netEtsy, -d.deposits];
    const cell = (c, i, blank) => `<td class="num${c < 0 ? ' neg' : ''}${i === 6 ? ' col-net' : ''}">${blank ? '' : fmt(c)}</td>`;
    let h = `<caption class="sr-only">Month by month, ${esc(S.currency)}</caption><thead><tr><th scope="col">Month</th>${cols.map(c => `<th scope="col" class="num">${c}</th>`).join('')}</tr></thead><tbody>`;
    for (const m of s.months) {
      const future = m.start > s.today, empty = m.rows === 0;
      h += `<tr class="${empty ? 'is-empty' : ''}"><th scope="row">${esc(m.label)}${empty ? `<span class="hint-cell">${future ? 'not yet' : 'no rows'}</span>` : ''}</th>${val(m.d).map((c, i) => cell(c, i, empty)).join('')}</tr>`;
    }
    h += `</tbody><tfoot><tr><th scope="row">Total</th>${val(s).map((c, i) => cell(c, i)).join('')}</tr></tfoot>`;
    $('months').innerHTML = h;
    $('months-note').textContent = `${S.currency}. Sales and refunds without the tax Etsy collected; fees include credits and tax on fees.`;
  }

  function renderMap(v) {
    const L = v.lines;
    const showCosts = l => l.costs && !S.pro;
    let h = '<table class="map-table"><tbody>';
    for (const l of L.lines) {
      if (l.costs && !S.pro && !l.cents) { h += `<tr class="costs"><th scope="row"><span class="code">${esc(l.code)}</span>${esc(l.label)}<span class="what">${esc(l.what)}</span></th><td class="num dim">Pro</td></tr>`; continue; }
      h += `<tr class="${l.total ? 'total' : ''}"><th scope="row"><span class="code">${esc(l.code)}</span>${esc(l.label)}<span class="what">${esc(l.what)}</span></th><td class="num${showCosts(l) ? ' dim' : ''}">${fmt(l.cents)}</td></tr>`;
    }
    h += `<tr><th colspan="2" class="map-off-h" scope="rowgroup">Not on the return</th></tr>`;
    for (const l of L.off) h += `<tr class="off"><th scope="row">${esc(l.label)}<span class="what">${esc(l.what)}</span></th><td class="num">${fmt(l.cents)}</td></tr>`;
    h += '</tbody></table>';
    if (S.region === 'uk') {
      const exp = L.lines.find(l => l.code === 'Box 20');
      h += `<p class="hint" style="margin-top:12px">Trading allowance: if your turnover before expenses is £1,000 or less you may not need to tell HMRC. Above that you can deduct the £1,000 allowance (box 10.1) instead of actual expenses, not both. Expenses here: ${fmt(exp ? exp.cents : 0)}. <a href="/etsy-tax-summary/uk-self-assessment/">Etsy on Self Assessment</a></p>`;
    }
    $('map').innerHTML = h;
    $('map-h').textContent = S.region === 'us' ? 'Where these usually go on Schedule C' : S.region === 'uk' ? 'Where these usually go on the SA103S' : 'Totals by category';
    $('map-note').innerHTML = S.region === 'us'
      ? 'Line numbers from the 2025 Schedule C (Form 1040), the latest final form. Common practice, not tax advice. <a href="/etsy-tax-summary/schedule-c-lines/">Line-by-line guide</a>'
      : S.region === 'uk'
        ? 'Boxes on the SA103S (short) page for 2025 to 2026. The full SA103F page numbers them differently. Common practice, not tax advice.'
        : 'Plain categories to match to your own country’s return.';
  }

  function renderFiles(v) {
    const multi = S.shops.length > 1;
    $('shopname-f').hidden = S.view === 'all';
    if (S.view !== 'all' && document.activeElement !== $('shopname')) $('shopname').value = shopName(S.view);
    const list = S.view === 'all' ? S.files : S.files.filter(f => f.shopId === S.view);
    $('files').innerHTML = list.map(f => {
      const months = f.months.length ? (f.months.length === 1 ? monthLabel(f.months[0]) : `${monthLabel(f.months[0])} to ${monthLabel(f.months[f.months.length - 1])}`) : 'no dates';
      const meta = `${E.KINDS[f.kind]}, ${months}, ${int(f.rows.length)} rows${f.currencies.length ? ', ' + f.currencies.join(' and ') : ''}`;
      const dup = f.kind === 'statement' && f.duplicates ? `<span class="fmeta">${int(f.duplicates)} row${f.duplicates > 1 ? 's' : ''} also in another file, counted once</span>` : '';
      const warns = f.warnings.map(w => `<span class="fwarn">${esc(w)}</span>`).join('');
      const move = multi ? `<select class="select" data-move="${f.id}" aria-label="Shop for ${esc(f.name)}">${S.shops.map(s => `<option value="${s.id}"${s.id === f.shopId ? ' selected' : ''}>${esc(s.name)}</option>`).join('')}</select>` : '';
      return `<li><span class="fname" title="${esc(f.name)}">${esc(f.name)}</span><span class="fmeta">${esc(meta)}</span>${dup}${warns}<span class="factions">${move}<button type="button" class="icon-btn" data-remove="${f.id}" aria-label="Remove ${esc(f.name)}"><svg width="14" height="14" viewBox="0 0 14 14" aria-hidden="true"><path d="M3 3l8 8M11 3l-8 8" stroke="currentColor" stroke-width="1.6" stroke-linecap="round"/></svg></button></span></li>`;
    }).join('') + (S.skipped.length ? `<li class="etx-files-skipped">${S.skipped.map(esc).join('<br>')}</li>` : '');
    const st = list.filter(f => f.kind === 'statement').length;
    $('files-note').textContent = `${st} statement${st === 1 ? '' : 's'}, ${list.length - st} other`;
  }

  function renderCosts(v) {
    const box = $('costs');
    box.dataset.pro = String(S.pro);
    $('cost-lock').hidden = S.pro;
    box.querySelector('.pro-tag').hidden = S.pro;
    box.querySelectorAll('#cost-form input, #cost-form select, #cost-form button').forEach(el => { el.disabled = !S.pro; });
    const kind = $('c-kind').value;
    $('c-amount-l').textContent = kind === 'mileage' ? 'Business miles' : `Amount (${S.currency})`;
    $('c-amount').placeholder = kind === 'mileage' ? '0' : '0.00';
    if (kind === 'mileage' && S.region === 'other') $('c-amount-l').textContent = 'Miles (US or UK only)';
    const all = E.costAmounts(S.costs, S.region);
    const inP = c => c.day != null && c.day >= v.period.start && c.day <= v.period.end;
    const shown = all.filter(inP);
    $('cost-wrap').hidden = !S.pro || !all.length;
    if (!S.pro || !all.length) return;
    const outside = all.length - shown.length;
    let h = `<caption class="sr-only">Costs you entered</caption><thead><tr><th scope="col">Date</th><th scope="col">Kind</th><th scope="col">Description</th><th scope="col" class="num">Amount</th><th scope="col"><span class="sr-only">Remove</span></th></tr></thead><tbody>`;
    for (const c of shown) {
      const what = c.kind === 'mileage' ? `${int(c.miles)} miles${c.rate ? ' at ' + c.rate : ''}${c.desc ? ', ' + c.desc : ''}` : (c.desc || '');
      h += `<tr><td>${esc(c.date)}</td><td>${esc(EtsyReport.KIND_LABEL[c.kind] || c.kind)}</td><td>${esc(what)}${c.why ? `<span class="hint-cell">${esc(c.why)}</span>` : ''}</td><td class="num">${c.cents == null ? '' : fmt(c.cents)}</td><td><button type="button" class="icon-btn" data-cost="${esc(c.id)}" aria-label="Remove this cost"><svg width="14" height="14" viewBox="0 0 14 14" aria-hidden="true"><path d="M3 3l8 8M11 3l-8 8" stroke="currentColor" stroke-width="1.6" stroke-linecap="round"/></svg></button></td></tr>`;
    }
    h += `</tbody><tfoot><tr><th scope="row" colspan="3">Total in ${esc(v.period.label)}${outside ? `<span class="hint-cell">${outside} more outside this period</span>` : ''}</th><td class="num">${fmt(v.cost ? v.cost.total : 0)}</td><td></td></tr></tfoot>`;
    $('cost-table').innerHTML = h;
  }

  function renderDetails(v) {
    const s = v.s;
    $('other-d').hidden = !s.otherTitles.length;
    $('other-t').innerHTML = `<thead><tr><th scope="col">Title</th><th scope="col" class="num">Rows</th><th scope="col" class="num">Amount</th></tr></thead><tbody>${s.otherTitles.map(o => `<tr><td>${esc(o.title)}</td><td class="num">${o.n}</td><td class="num">${fmt(o.cents)}</td></tr>`).join('')}</tbody>`;
    $('review-d').hidden = !s.unmappedRows.length;
    $('review-s').textContent = `Rows to review (${s.unmappedRows.length})`;
    $('review-t').innerHTML = `<thead><tr><th scope="col">Date</th><th scope="col">Type</th><th scope="col">Title</th><th scope="col" class="num">Net</th></tr></thead><tbody>${s.unmappedRows.slice(0, 200).map(r => `<tr><td>${esc(r.date)}</td><td>${esc(r.type)}</td><td>${esc(r.title)}${r.info ? `<span class="hint-cell">${esc(r.info)}</span>` : ''}</td><td class="num">${fmt(r.value)}</td></tr>`).join('')}</tbody>`;
  }

  // ---------- Exports (Pro) ----------
  let pdfLibPromise = null;
  function loadPdfLib() {
    if (window.PDFLib) return Promise.resolve(window.PDFLib);
    if (!pdfLibPromise) pdfLibPromise = new Promise((resolve, reject) => {
      const el = document.createElement('script');
      el.src = PDFLIB_SRC;
      el.onload = () => (window.PDFLib ? resolve(window.PDFLib) : reject(new Error('pdf-lib did not load')));
      el.onerror = () => { pdfLibPromise = null; reject(new Error('pdf-lib did not load')); };
      document.head.appendChild(el);
    });
    return pdfLibPromise;
  }
  function reportView() {
    const v = compute();
    for (const f of S.files) f.shopName = shopName(f.shopId);
    return {
      E, s: v.s, period: v.period, currency: S.currency, region: S.region, files: v.files, lines: v.lines, cost: v.cost,
      k1099: v.s.k1099, shipping: v.s.orders.shipping, shopLabel: S.view === 'all' ? S.shops.map(s => s.name).join(', ') : shopName(S.view),
      generated: new Date().toLocaleDateString('en-GB', { day: 'numeric', month: 'long', year: 'numeric' }),
      fileCount: { statements: v.st.length, orders: v.other.length },
    };
  }
  const slug = v => `etsy-${String(v.period.short).replace(/[^0-9A-Za-z]+/g, '-')}-${S.currency.toLowerCase()}${S.view === 'all' ? '-all-shops' : S.shops.length > 1 ? '-' + shopName(S.view).toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '') : ''}`;
  async function doExport(kind) {
    if (!PeakLicense.requirePro('The PDF report and the CSV and XLSX exports are part of Pro. The summary on this page stays free.')) return;
    const btn = $('x-' + kind);
    const label = btn.textContent;
    try {
      btn.disabled = true;
      const view = reportView();
      if (kind === 'csv') PeakUI.download(new Blob([EtsyReport.rowsCSV(view)], { type: 'text/csv;charset=utf-8' }), slug(view) + '-rows.csv');
      else if (kind === 'xlsx') PeakUI.download(new Blob([EtsyReport.workbook(view)], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' }), slug(view) + '-summary.xlsx');
      else {
        btn.textContent = 'Preparing the PDF…';
        const PDFLib = await loadPdfLib();
        const bytes = await EtsyReport.pdf(PDFLib, view);
        PeakUI.download(new Blob([bytes], { type: 'application/pdf' }), slug(view) + '-summary.pdf');
      }
      say(kind === 'pdf' ? 'PDF report downloaded.' : kind.toUpperCase() + ' downloaded.');
    } catch (e) {
      console.error(e);
      PeakUI.toast('The export failed. Try again, or email us the file names so we can look.');
    } finally { btn.textContent = label; btn.disabled = false; }
  }

  // ---------- Costs (Pro) ----------
  function addCost(ev) {
    ev.preventDefault();
    if (!PeakLicense.requirePro('The materials and mileage list is part of Pro.')) return;
    const err = $('cost-err');
    const date = $('c-date').value, kind = $('c-kind').value, desc = $('c-desc').value.trim(), raw = $('c-amount').value.trim();
    const fail = m => { err.textContent = m; err.hidden = false; };
    err.hidden = true;
    if (!E.parseDate(date)) return fail('Add the date of the cost or trip.');
    const c = { id: Date.now().toString(36) + Math.random().toString(36).slice(2, 6), date, kind, desc };
    if (kind === 'mileage') {
      const miles = Number(raw.replace(/,/g, ''));
      if (!(miles > 0)) return fail('Enter the business miles for this trip or month.');
      if (S.region === 'other') return fail('Mileage rates are stored for the US and UK. Add the amount as an other expense instead.');
      c.miles = Math.round(miles * 10) / 10;
    } else {
      const cents = E.parseMoney(raw);
      if (!(cents > 0)) return fail('Enter the amount you paid.');
      c.cents = cents;
    }
    S.costs.push(c);
    store.set(COSTS_KEY, S.costs);
    $('c-desc').value = ''; $('c-amount').value = '';
    render();
    $('c-desc').focus();
  }

  // ---------- Events ----------
  PeakUI.drop($('drop'), addFiles);
  $('add-files').addEventListener('click', () => $('file2').click());
  $('file2').addEventListener('change', e => { const fl = [...e.target.files]; e.target.value = ''; if (fl.length) addFiles(fl); });
  const tool = $('tool');
  ['dragenter', 'dragover'].forEach(n => tool.addEventListener(n, e => { if (tool.dataset.state === 'ready' && e.dataTransfer && [...e.dataTransfer.types].includes('Files')) { e.preventDefault(); tool.classList.add('is-over'); } }));
  ['dragleave', 'drop'].forEach(n => tool.addEventListener(n, e => { if (n === 'dragleave' && tool.contains(e.relatedTarget)) return; tool.classList.remove('is-over'); }));
  tool.addEventListener('drop', e => { if (tool.dataset.state !== 'ready') return; e.preventDefault(); if (e.dataTransfer.files.length) addFiles([...e.dataTransfer.files]); });
  $('sample').addEventListener('click', loadSample);
  $('sample-clear').addEventListener('click', () => reset());
  $('reset').addEventListener('click', () => reset());

  $('period').addEventListener('change', e => {
    const val = e.target.value;
    if (/^uk/.test(val) && !PeakLicense.requirePro('The UK tax year (6 April to 5 April) is part of Pro. Calendar years stay free.')) { e.target.value = S.periodId; return; }
    S.periodId = val; S.periodChosen = true; render();
  });
  $('march').addEventListener('change', e => { S.march = e.target.checked; render(); });
  PeakUI.seg($('region'), val => { S.region = val; if (!S.periodChosen) S.periodId = null; render(); });
  $('currency').addEventListener('change', e => { S.currency = e.target.value; render(); });
  $('shop').addEventListener('change', e => { S.view = e.target.value === 'all' ? 'all' : Number(e.target.value); render(); });
  $('add-shop').addEventListener('click', () => {
    if (!PeakLicense.requirePro('Several shops, each on its own or combined in one report, are part of Pro.')) return;
    const id = ++shopSeq;
    S.shops.push({ id, name: `Shop ${id}` });
    S.view = id;
    render();
    say(`Added Shop ${id}. Files you drop now go to it; rename it under Files.`);
  });
  $('shopname').addEventListener('input', e => {
    const sh = S.shops.find(s => s.id === S.view);
    if (sh) { sh.name = e.target.value.trim() || `Shop ${sh.id}`; renderBar(V); }
  });
  $('shopname').addEventListener('change', () => render());
  $('files').addEventListener('click', e => {
    const b = e.target.closest('[data-remove]');
    if (!b) return;
    const id = Number(b.dataset.remove);
    const f = S.files.find(x => x.id === id);
    S.files = S.files.filter(x => x.id !== id);
    if (!S.files.length) { reset(true); }
    render();
    if (f) say(`Removed ${f.name}.`);
  });
  $('files').addEventListener('change', e => {
    const s = e.target.closest('[data-move]');
    if (!s) return;
    const f = S.files.find(x => x.id === Number(s.dataset.move));
    if (f) { f.shopId = Number(s.value); render(); }
  });
  $('x-pdf').addEventListener('click', () => doExport('pdf'));
  $('x-csv').addEventListener('click', () => doExport('csv'));
  $('x-xlsx').addEventListener('click', () => doExport('xlsx'));
  $('cost-form').addEventListener('submit', addCost);
  $('c-kind').addEventListener('change', () => V && renderCosts(V));
  $('cost-table').addEventListener('click', e => {
    const b = e.target.closest('[data-cost]');
    if (!b) return;
    S.costs = S.costs.filter(c => String(c.id) !== b.dataset.cost);
    store.set(COSTS_KEY, S.costs);
    render();
  });

  PeakLicense.setup(LICENSE);
  S.pro = PeakLicense.isPro();
  PeakLicense.onChange(pro => {
    const was = S.pro;
    S.pro = pro;
    if (pro !== was && !S.periodChosen) S.periodId = null;
    render();
  });
  render();
})();
