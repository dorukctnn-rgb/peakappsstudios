/* Etsy Tax Summary engine: reads Etsy CSV exports, sorts every row into a category and totals a tax period.
 * No DOM. Runs in the browser (window.EtsyTax) and in Node (module.exports) for the tests in _tests/.
 * All money is integer cents. Formats follow real Etsy exports (monthly statement, Sold Orders,
 * Sold Order Items, Etsy Payments sales); see /etsy-tax-summary/monthly-statement-csv/. */
(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory();
  else root.EtsyTax = factory();
})(typeof self !== 'undefined' ? self : this, function () {
  'use strict';
  const BOM = String.fromCharCode(0xFEFF), MINUS = String.fromCharCode(0x2212), NDASH = String.fromCharCode(0x2013);
  const BOM_RE = new RegExp('^' + BOM);

  const CHECKED = '8 October 2026';

  // ---------- CSV ----------
  function parseCSV(text) {
    text = String(text || '').replace(BOM_RE, '');
    const first = text.slice(0, text.search(/\r?\n|$/));
    const counts = { ',': 0, '\t': 0, ';': 0 };
    let q = false;
    for (const c of first) { if (c === '"') q = !q; else if (!q && c in counts) counts[c]++; }
    const sep = counts['\t'] > counts[','] && counts['\t'] >= counts[';'] ? '\t' : counts[';'] > counts[','] ? ';' : ',';
    const rows = [];
    let row = [], f = '', inQ = false;
    for (let i = 0; i < text.length; i++) {
      const c = text[i];
      if (inQ) {
        if (c === '"') { if (text[i + 1] === '"') { f += '"'; i++; } else inQ = false; }
        else f += c;
      } else if (c === '"' && f === '') inQ = true;
      else if (c === sep) { row.push(f); f = ''; }
      else if (c === '\n' || c === '\r') {
        if (c === '\r' && text[i + 1] === '\n') i++;
        row.push(f); rows.push(row); row = []; f = '';
      } else f += c;
    }
    if (f !== '' || row.length) { row.push(f); rows.push(row); }
    return rows.filter(r => r.some(v => v.trim() !== ''));
  }
  const normHeader = h => String(h || '').replace(BOM_RE, '').replace(/["']/g, '').replace(/\s+/g, ' ').trim().toLowerCase();

  // ---------- Money ----------
  // "$1,208.35", "-€0.17", "-$0.08", "£25.00", "CA$12.00", "(0.45)", "1.234,56", "--" -> cents or null
  function parseMoney(s) {
    if (s == null) return null;
    let t = String(s).trim();
    if (!t || /^[-−–—]{1,2}$/.test(t)) return null;
    let neg = false;
    if (/^\(.*\)$/.test(t)) { neg = true; t = t.slice(1, -1); }
    if (/[-−]/.test(t)) neg = true;
    t = t.replace(/[^0-9.,]/g, '');
    if (!/\d/.test(t)) return null;
    const lastDot = t.lastIndexOf('.'), lastComma = t.lastIndexOf(',');
    let dec = '';
    if (lastDot > -1 && lastComma > -1) dec = lastDot > lastComma ? '.' : ',';
    else if (lastComma > -1) { const after = t.length - lastComma - 1; if (after > 0 && after <= 2 && t.indexOf(',') === lastComma) dec = ','; }
    else if (lastDot > -1) { if (t.indexOf('.') === lastDot) dec = '.'; }
    let int = t, frac = '';
    if (dec) { const i = t.lastIndexOf(dec); int = t.slice(0, i); frac = t.slice(i + 1); }
    int = int.replace(/[.,]/g, '') || '0';
    frac = (frac + '000').slice(0, 3);
    let cents = Number(int) * 100 + Number(frac.slice(0, 2));
    if (Number(frac[2]) >= 5) cents += 1;
    return neg ? -cents : cents;
  }

  // ---------- Dates ----------
  const MONTHS = { jan: 1, feb: 2, mar: 3, apr: 4, may: 5, jun: 6, jul: 7, aug: 8, sep: 9, sept: 9, oct: 10, nov: 11, dec: 12 };
  const MONTH_NAMES = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];
  const monthNo = s => { const k = String(s).toLowerCase().replace(/\.$/, ''); return MONTHS[k] || MONTHS[k.slice(0, 3)] || (k.length > 3 && MONTHS[k.slice(0, 4)]) || 0; };
  const dayNo = (y, m, d) => Math.floor(Date.UTC(y, m - 1, d) / 864e5);
  const fromDay = n => { const dt = new Date(n * 864e5); return { y: dt.getUTCFullYear(), m: dt.getUTCMonth() + 1, d: dt.getUTCDate() }; };
  const fullYear = y => (y < 100 ? 2000 + y : y);
  function mk(y, m, d) {
    y = fullYear(y);
    if (!(m >= 1 && m <= 12 && d >= 1 && y >= 1990 && y <= 2100)) return null;
    if (d > new Date(Date.UTC(y, m, 0)).getUTCDate()) return null;
    return { y, m, d, day: dayNo(y, m, d) };
  }
  const NUMERIC_DATE = /^(\d{1,2})[/.\-](\d{1,2})[/.\-](\d{2,4})(?:[ T].*)?$/;
  // order: 'mdy' or 'dmy' for all-numeric dates such as 09/03/2026
  function parseDate(s, order) {
    const t = String(s || '').trim().replace(/\s+/g, ' ');
    if (!t) return null;
    let m;
    if ((m = t.match(/^(\d{4})-(\d{1,2})-(\d{1,2})/))) return mk(+m[1], +m[2], +m[3]);
    if ((m = t.match(/^([A-Za-z]{3,9})\.? (\d{1,2})(?:st|nd|rd|th)?,? (\d{2,4})$/))) return mk(+m[3], monthNo(m[1]), +m[2]);
    if ((m = t.match(/^(\d{1,2})(?:st|nd|rd|th)?[ \-]([A-Za-z]{3,9})\.?,?[ \-](\d{2,4})$/))) return mk(+m[3], monthNo(m[2]), +m[1]);
    if ((m = t.match(NUMERIC_DATE))) {
      const a = +m[1], b = +m[2], y = +m[3];
      return order === 'dmy' ? mk(y, b, a) : mk(y, a, b);
    }
    return null;
  }
  function dateOrder(values, fallback) {
    let dmy = 0, mdy = 0;
    for (const v of values) {
      const m = String(v || '').trim().match(NUMERIC_DATE);
      if (!m) continue;
      if (+m[1] > 12) dmy++;
      else if (+m[2] > 12) mdy++;
    }
    return dmy > mdy ? 'dmy' : mdy > dmy ? 'mdy' : fallback;
  }
  const iso = p => p ? `${p.y}-${String(p.m).padStart(2, '0')}-${String(p.d).padStart(2, '0')}` : '';
  const monthKey = p => p ? `${p.y}-${String(p.m).padStart(2, '0')}` : 'unknown';

  // ---------- Row categories ----------
  const CATS = {
    sales: { label: 'Sales', group: 'income' },
    refunds: { label: 'Refunds to buyers', group: 'income' },
    tax_sale: { label: 'Sales tax and VAT paid by buyers', group: 'passthrough' },
    tax_refund: { label: 'Sales tax and VAT returned on refunds', group: 'passthrough' },
    fee_listing: { label: 'Listing and renewal fees', group: 'fees' },
    fee_transaction: { label: 'Transaction fees', group: 'fees' },
    fee_processing: { label: 'Payment processing fees', group: 'fees' },
    fee_regulatory: { label: 'Regulatory operating fees', group: 'fees' },
    fee_tax: { label: 'Tax and VAT on Etsy fees', group: 'fees' },
    fee_subscription: { label: 'Subscriptions (Etsy Plus, Pattern)', group: 'fees' },
    fee_other: { label: 'Other Etsy fees and credits', group: 'fees' },
    ads_etsy: { label: 'Etsy Ads', group: 'ads' },
    ads_offsite: { label: 'Offsite Ads fees', group: 'ads' },
    ads_other: { label: 'Other marketing', group: 'ads' },
    labels: { label: 'Shipping labels bought on Etsy', group: 'labels' },
    deposit: { label: 'Deposits to your bank', group: 'transfer' },
    payment: { label: 'Payments you made to Etsy', group: 'transfer' },
    reserve: { label: 'Reserve held or released', group: 'transfer' },
    unmapped: { label: 'Rows to review', group: 'unmapped' },
  };
  const BUYER_TAX = /paid by buyer|refund to buyer|buyer paid|retail delivery fee|collected from (the )?buyer/;
  const startsAny = (s, list) => list.some(p => s.startsWith(p) || s.startsWith('credit for ' + p));
  function categorize(type, title) {
    const t = String(type || '').trim().toLowerCase();
    const ti = String(title || '').trim().toLowerCase();
    switch (t) {
      case 'sale': case 'sales': return 'sales';
      case 'refund': case 'refunds': return 'refunds';
      case 'deposit': case 'deposits': return 'deposit';
      case 'payment': case 'payments': return /reserve/.test(ti) ? 'reserve' : 'payment';
      case 'reserve': return 'reserve';
      case 'buyer fee': case 'buyer fees': return 'tax_buyer';
      case 'tax': case 'taxes': case 'vat': case 'gst': case 'hst': case 'pst': case 'qst':
        return BUYER_TAX.test(ti) ? 'tax_buyer' : 'fee_tax';
      case 'marketing':
        if (/offsite/.test(ti)) return 'ads_offsite';
        if (/etsy ads|click-?through|promoted listing/.test(ti)) return 'ads_etsy';
        return 'ads_other';
      case 'shipping': case 'postage': case 'shipping label': case 'shipping labels': return 'labels';
      case 'fee': case 'fees':
        if (startsAny(ti, ['transaction fee', 'transaction credit'])) return 'fee_transaction';
        if (startsAny(ti, ['processing fee', 'payment processing fee'])) return 'fee_processing';
        if (startsAny(ti, ['regulatory operating fee'])) return 'fee_regulatory';
        if (startsAny(ti, ['listing fee', 'auto-renew', 'auto renew', 'renew', 'multi-quantity', 'private listing'])) return 'fee_listing';
        if (/shipping label|postage label/.test(ti)) return 'labels';
        if (/offsite ads/.test(ti)) return 'ads_offsite';
        if (/etsy ads/.test(ti)) return 'ads_etsy';
        if (/etsy plus|subscription|pattern/.test(ti)) return 'fee_subscription';
        if (/processing fee/.test(ti)) return 'fee_processing';
        if (/transaction fee/.test(ti)) return 'fee_transaction';
        if (/listing fee/.test(ti)) return 'fee_listing';
        return 'fee_other';
      default:
        if (/reserve/.test(ti)) return 'reserve';
        return 'unmapped';
    }
  }
  // Groups "Transaction fee: Speckled mug..." and "Listing fee ($0.20 USD)" under one heading.
  function titleGroup(title) {
    return String(title || '').replace(/:.*$/, '').replace(/\s*\([^)]*\)/g, '').replace(/#\s*\d+/g, '#').replace(/\s+/g, ' ').trim() || '(no title)';
  }
  const orderNo = s => { const m = String(s || '').match(/order\s*#?\s*(\d{6,})/i); return m ? m[1] : ''; };

  // ---------- File reading ----------
  const KINDS = {
    statement: 'Monthly statement',
    orders: 'Sold Orders',
    order_items: 'Sold Order Items',
    payments: 'Etsy Payments sales',
  };
  function detectKind(headers) {
    const h = new Set(headers);
    if (h.has('date') && h.has('type') && h.has('title') && (h.has('net') || h.has('amount'))) return 'statement';
    if (h.has('payment id') && h.has('gross amount')) return 'payments';
    if (h.has('sale date') && h.has('item name') && h.has('item total')) return 'order_items';
    if (h.has('sale date') && h.has('order id') && (h.has('order total') || h.has('order value'))) return 'orders';
    return null;
  }
  const hash = s => { let h = 2166136261; for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 16777619); } return (h >>> 0).toString(36) + ':' + s.length; };

  function readFile(name, text) {
    const out = { name, kind: null, hash: hash(String(text || '')), rows: [], currencies: [], months: [], warnings: [], error: '' };
    const table = parseCSV(text);
    if (!table.length) { out.error = 'The file is empty.'; return out; }
    const headers = table[0].map(normHeader);
    out.kind = detectKind(headers);
    if (!out.kind) {
      out.error = /^%pdf/i.test(String(text).slice(0, 5)) ? 'This is a PDF. Download the CSV version of the statement instead.'
        : 'This doesn’t look like an Etsy monthly statement, Sold Orders, Sold Order Items or Etsy Payments CSV. Check the first row has Etsy’s column names in English.';
      return out;
    }
    const col = name => headers.indexOf(name);
    const get = (r, i) => (i > -1 && i < r.length ? r[i] : '');
    const body = table.slice(1);
    if (out.kind === 'statement') readStatement(out, body, col, get);
    else readOrders(out, body, col, get);
    const cur = new Set(out.rows.map(r => r.currency).filter(Boolean));
    out.currencies = [...cur];
    out.months = [...new Set(out.rows.map(r => r.month).filter(m => m !== 'unknown'))].sort();
    if (!out.rows.length) out.warnings.push('No rows found under the header.');
    return out;
  }

  function readStatement(out, body, col, get) {
    const c = {
      date: col('date'), type: col('type'), title: col('title'), info: col('info'), currency: col('currency'),
      amount: col('amount'), fees: Math.max(col('fees & taxes'), col('fees and taxes'), col('fees')), net: col('net'),
      taxDetails: col('tax details'), status: col('status'), avail: col('availability date'),
    };
    const curGuess = body.map(r => get(r, c.currency)).find(Boolean) || '';
    const order = dateOrder(body.map(r => get(r, c.date)), /USD|CAD/i.test(curGuess) ? 'mdy' : 'dmy');
    let badDates = 0, mismatch = 0;
    body.forEach((r, i) => {
      const dateRaw = get(r, c.date).trim();
      const p = parseDate(dateRaw, order);
      if (!p) badDates++;
      const type = get(r, c.type).trim(), title = get(r, c.title).trim(), info = get(r, c.info).trim();
      const amount = parseMoney(get(r, c.amount)), fees = parseMoney(get(r, c.fees)), net = parseMoney(get(r, c.net));
      let currency = get(r, c.currency).trim().toUpperCase();
      if (!currency) currency = symbolCurrency(get(r, c.amount) + get(r, c.net) + get(r, c.fees));
      const row = {
        i, dateRaw, date: iso(p), day: p ? p.day : null, month: monthKey(p), type, title, info, currency, amount, fees, net,
        status: get(r, c.status).trim(), order: orderNo(title) || orderNo(info), parts: [], value: 0, fromTitle: false, dup: false,
      };
      row.arithmeticOk = !(net != null && (amount != null || fees != null) && (amount || 0) + (fees || 0) !== net);
      if (!row.arithmeticOk) mismatch++;
      let cat = categorize(type, title);
      const value = net != null ? net : (amount != null || fees != null) ? (amount || 0) + (fees || 0) : null;
      if (cat === 'sales' || cat === 'refunds') {
        // Real files put the whole sale in Amount and its fees on separate Fee rows. Older or edited files
        // may carry fees on the sale row; those go to "other fees" so the parts still add up to Net.
        if (amount != null) {
          const rest = (value != null ? value : amount) - amount;
          row.parts.push({ cat, cents: amount });
          if (rest) row.parts.push({ cat: 'fee_other', cents: rest, note: 'Fees shown on sale or refund rows' });
        } else row.parts.push({ cat, cents: value || 0 });
      } else if (cat === 'deposit' && value == null) {
        const m = (title + ' ' + info).match(/[-−]?\s?(?:[A-Z]{1,3})?[$£€¥₹]?\s?\d[\d.,]*/);
        const amt = m ? Math.abs(parseMoney(m[0].replace(/[.,]+$/, '')) || 0) : 0;
        row.parts.push({ cat: 'deposit', cents: -amt });
        row.fromTitle = true;
        if (!amt) out.warnings.push(`Row ${i + 2}: a deposit without an amount.`);
      } else {
        if (cat === 'tax_buyer') cat = (value || 0) > 0 ? 'tax_refund' : 'tax_sale';
        row.parts.push({ cat, cents: value || 0 });
      }
      row.value = row.parts.reduce((s, x) => s + x.cents, 0);
      row.key = [row.date || dateRaw, type, title, info, currency, amount, fees, net].join('|');
      out.rows.push(row);
    });
    if (badDates) out.warnings.push(`${badDates} row${badDates > 1 ? 's have dates' : ' has a date'} that couldn’t be read.`);
    if (mismatch) out.warnings.push(`${mismatch} row${mismatch > 1 ? 's' : ''} where Amount plus Fees & Taxes doesn’t equal Net.`);
    out.dateOrder = order;
  }
  function symbolCurrency(s) {
    if (/CA\$/.test(s)) return 'CAD'; if (/A\$/.test(s)) return 'AUD'; if (/£/.test(s)) return 'GBP'; if (/€/.test(s)) return 'EUR'; if (/\$/.test(s)) return 'USD';
    return '';
  }

  function readOrders(out, body, col, get) {
    const k = out.kind;
    const dateCol = k === 'payments' ? col('order date') : col('sale date');
    const order = dateOrder(body.map(r => get(r, dateCol)), 'mdy');
    const m = name => (r => parseMoney(get(r, col(name))));
    body.forEach((r, i) => {
      const p = parseDate(get(r, dateCol), order);
      const row = { i, date: iso(p), day: p ? p.day : null, month: monthKey(p), currency: get(r, col('currency')).trim().toUpperCase(), order: get(r, col('order id')).trim() };
      if (k === 'orders') Object.assign(row, { value: m('order value')(r), discount: m('discount amount')(r), shipDiscount: m('shipping discount')(r), shipping: m('shipping')(r), tax: m('sales tax')(r), total: m('order total')(r), items: Number(get(r, col('number of items'))) || 0 });
      else if (k === 'order_items') Object.assign(row, { tx: get(r, col('transaction id')).trim(), itemTotal: m('item total')(r), quantity: Number(get(r, col('quantity'))) || 0, shipping: m('order shipping')(r), tax: m('order sales tax')(r), discount: m('discount amount')(r), shipDiscount: m('shipping discount')(r), vat: m('vat paid by buyer')(r) });
      else Object.assign(row, { pid: get(r, col('payment id')).trim(), gross: m('gross amount')(r), fees: m('fees')(r), net: m('net amount')(r), refund: m('refund amount')(r), listing: m('listing amount')(r), status: get(r, col('status')).trim() });
      out.rows.push(row);
    });
    out.dateOrder = order;
  }

  // ---------- Duplicates across files ----------
  // A row counts as many times as it appears in the file that has the most copies of it for that month,
  // so the same month downloaded twice (or a mid-month download plus the full month) is counted once.
  function markDuplicates(files) {
    const max = new Map();
    for (const f of files) {
      const c = new Map();
      for (const r of f.rows) { const k = r.month + '#' + r.key; c.set(k, (c.get(k) || 0) + 1); }
      for (const [k, v] of c) if ((max.get(k) || 0) < v) max.set(k, v);
    }
    const used = new Map();
    let dups = 0;
    for (const f of files) {
      f.duplicates = 0;
      for (const r of f.rows) {
        const k = r.month + '#' + r.key, u = used.get(k) || 0;
        if (u < max.get(k)) { used.set(k, u + 1); r.dup = false; } else { r.dup = true; dups++; f.duplicates++; }
      }
    }
    return dups;
  }

  // ---------- Periods ----------
  const SHORT = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
  function calendarPeriod(y) {
    const buckets = [];
    for (let m = 1; m <= 12; m++) buckets.push({ key: `${y}-${String(m).padStart(2, '0')}`, label: `${SHORT[m - 1]} ${y}`, start: dayNo(y, m, 1), end: dayNo(y, m + 1, 1) - 1 });
    return { id: `cal-${y}`, kind: 'calendar', year: y, label: `Calendar year ${y}`, short: String(y), start: dayNo(y, 1, 1), end: dayNo(y, 12, 31), buckets, pro: false };
  }
  function ukPeriod(y, toMarch31) {
    const yy = String(y + 1).slice(2);
    const buckets = [];
    const start = toMarch31 ? dayNo(y, 4, 1) : dayNo(y, 4, 6);
    const end = toMarch31 ? dayNo(y + 1, 3, 31) : dayNo(y + 1, 4, 5);
    for (let i = 0; i < 12; i++) {
      const m = ((3 + i) % 12) + 1, yr = i < 9 ? y : y + 1;
      const b = { key: `${yr}-${String(m).padStart(2, '0')}`, label: `${SHORT[m - 1]} ${yr}`, start: dayNo(yr, m, 1), end: dayNo(yr, m + 1, 1) - 1 };
      if (i === 0 && !toMarch31) { b.start = start; b.label = `${SHORT[3]} ${y} (from 6th)`; }
      buckets.push(b);
    }
    if (!toMarch31) buckets.push({ key: `${y + 1}-04a`, label: `${SHORT[3]} ${y + 1} (to 5th)`, start: dayNo(y + 1, 4, 1), end });
    return {
      id: `${toMarch31 ? 'ukm' : 'uk'}-${y}`, kind: toMarch31 ? 'uk31' : 'uk', year: y,
      label: toMarch31 ? `UK tax year ${y}${NDASH}${yy}, to 31 March` : `UK tax year ${y}${NDASH}${yy}`,
      short: `${y}${NDASH}${yy}`, start, end, buckets, pro: true,
    };
  }
  function periodById(id) {
    const m = String(id || '').match(/^(cal|uk|ukm)-(\d{4})$/);
    if (!m) return null;
    return m[1] === 'cal' ? calendarPeriod(+m[2]) : ukPeriod(+m[2], m[1] === 'ukm');
  }
  // Periods that contain at least one dated row, newest first, with the busiest calendar year as the default.
  function periodsFor(rows) {
    const cal = new Map(), uk = new Map();
    for (const r of rows) {
      if (r.day == null) continue;
      const p = fromDay(r.day);
      cal.set(p.y, (cal.get(p.y) || 0) + 1);
      const uy = r.day >= dayNo(p.y, 4, 6) ? p.y : p.y - 1;
      uk.set(uy, (uk.get(uy) || 0) + 1);
    }
    const calendar = [...cal.keys()].sort((a, b) => b - a).map(calendarPeriod);
    const ukp = [...uk.keys()].sort((a, b) => b - a).map(y => ukPeriod(y, false));
    let best = null;
    for (const [y, n] of cal) if (!best || n > best[1] || (n === best[1] && y > best[0])) best = [y, n];
    let bestUk = null;
    for (const [y, n] of uk) if (!bestUk || n > bestUk[1] || (n === bestUk[1] && y > bestUk[0])) bestUk = [y, n];
    return { calendar, uk: ukp, defaultId: best ? `cal-${best[0]}` : null, defaultUkId: bestUk ? `uk-${bestUk[0]}` : null };
  }

  // ---------- Summary ----------
  const zero = () => Object.fromEntries(Object.keys(CATS).concat(['tax_buyer']).map(k => [k, 0]));
  function addParts(t, row) { for (const p of row.parts) t[p.cat] = (t[p.cat] || 0) + p.cents; }
  function derive(t) {
    const fees = t.fee_listing + t.fee_transaction + t.fee_processing + t.fee_regulatory + t.fee_tax + t.fee_subscription + t.fee_other;
    const ads = t.ads_etsy + t.ads_offsite + t.ads_other;
    const taxOnSales = -t.tax_sale;              // positive: tax that buyers paid and Etsy kept back
    const taxOnRefunds = t.tax_refund;           // positive: tax handed back on refunds
    const salesExTax = t.sales + t.tax_sale;
    const refundsExTax = t.refunds + t.tax_refund;
    const netSales = salesExTax + refundsExTax;
    const netEtsy = netSales + fees + ads + t.labels;
    const transfers = t.deposit + t.payment + t.reserve;
    return {
      salesGross: t.sales, taxOnSales, salesExTax, refundsGross: t.refunds, taxOnRefunds, refundsExTax, netSales,
      taxCollectedNet: taxOnSales - taxOnRefunds, fees, ads, labels: t.labels, netEtsy, unmapped: t.unmapped,
      deposits: t.deposit, payments: t.payment, reserve: t.reserve,
      balanceChange: netEtsy + t.unmapped + transfers,
    };
  }

  function summarize(opts) {
    const period = opts.period;
    const currency = opts.currency;
    const rows = (opts.statementRows || []).filter(r => !currency || r.currency === currency);
    const inP = r => r.day != null && r.day >= period.start && r.day <= period.end;
    const live = rows.filter(r => !r.dup && inP(r));
    const totals = zero();
    const months = period.buckets.map(b => ({ ...b, t: zero(), rows: 0 }));
    const otherTitles = new Map();
    const orders = new Set();
    let saleRows = 0, refundRows = 0, statementNet = 0, depositsFromTitle = 0, mismatch = 0;
    const unmappedRows = [];
    for (const r of live) {
      addParts(totals, r);
      const b = months.find(x => r.day >= x.start && r.day <= x.end);
      if (b) { addParts(b.t, r); b.rows++; }
      for (const p of r.parts) if (p.cat === 'fee_other') {
        const g = p.note || titleGroup(r.title);
        const o = otherTitles.get(g) || { title: g, cents: 0, n: 0 };
        o.cents += p.cents; o.n++; otherTitles.set(g, o);
      }
      if (r.parts.some(p => p.cat === 'unmapped')) unmappedRows.push(r);
      if (r.parts[0] && r.parts[0].cat === 'sales') { saleRows++; if (r.order) orders.add(r.order); }
      if (r.parts[0] && r.parts[0].cat === 'refunds') refundRows++;
      if (r.fromTitle) depositsFromTitle += r.value; else statementNet += r.net != null ? r.net : (r.amount || 0) + (r.fees || 0);
      if (!r.arithmeticOk) mismatch++;
    }
    const d = derive(totals);
    months.forEach(m => { m.d = derive(m.t); });
    const sumOfCats = Object.keys(CATS).reduce((s, k) => s + (totals[k] || 0), 0);
    const today = opts.today != null ? opts.today : dayNo(new Date().getUTCFullYear(), new Date().getUTCMonth() + 1, new Date().getUTCDate());
    const missing = months.filter(m => m.rows === 0 && m.start <= today).map(m => m.label);
    const future = months.filter(m => m.start > today).length;
    const outside = rows.filter(r => !r.dup && r.day != null && !inP(r)).length;
    const undated = rows.filter(r => !r.dup && r.day == null).length;
    const dupInPeriod = rows.filter(r => r.dup && inP(r)).length;
    const res = {
      currency, period, totals, ...d, months, today,
      otherTitles: [...otherTitles.values()].sort((a, b) => a.cents - b.cents),
      unmappedRows,
      counts: { rows: live.length, saleRows, orders: orders.size || saleRows, refundRows, duplicates: dupInPeriod, mismatch, outside, undated, missing, future },
      recon: { sumOfCats, statementNet, depositsFromTitle, ok: sumOfCats === statementNet + depositsFromTitle },
    };
    // The month table must add up to the year: every row in the period lands in exactly one month.
    res.recon.monthsOk = Object.keys(CATS).every(k => months.reduce((a, m) => a + (m.t[k] || 0), 0) === (totals[k] || 0));
    res.recon.ok = res.recon.ok && res.recon.monthsOk;
    res.k1099 = form1099K(res, opts.payments);
    res.orders = ordersSummary(opts.orderFiles || [], period, currency);
    res.checks = checks(res);
    return res;
  }

  // ---------- Sold Orders, Sold Order Items, Etsy Payments ----------
  function ordersSummary(files, period, currency) {
    const inP = r => r.day != null && r.day >= period.start && r.day <= period.end && (!currency || !r.currency || r.currency === currency);
    const out = {};
    const orders = files.filter(f => f.kind === 'orders');
    if (orders.length) {
      const seen = new Map();
      for (const f of orders) for (const r of f.rows) if (inP(r) && r.order && !seen.has(r.order)) seen.set(r.order, r);
      const rs = [...seen.values()];
      const s = k => rs.reduce((a, r) => a + (r[k] || 0), 0);
      out.orders = { count: rs.length, value: s('value'), discount: s('discount'), shipDiscount: s('shipDiscount'), shipping: s('shipping'), tax: s('tax'), total: s('total') };
    }
    const items = files.filter(f => f.kind === 'order_items');
    if (items.length) {
      const seenTx = new Set(), byOrder = new Map();
      let itemTotal = 0, qty = 0;
      for (const f of items) for (const r of f.rows) {
        if (!inP(r)) continue;
        const k = r.tx || (r.order + '|' + r.i + '|' + f.hash);
        if (seenTx.has(k)) continue;
        seenTx.add(k);
        itemTotal += r.itemTotal || 0; qty += r.quantity || 0;
        if (r.order && !byOrder.has(r.order)) byOrder.set(r.order, r);
      }
      const o = [...byOrder.values()];
      out.items = { count: o.length, quantity: qty, itemTotal, shipping: o.reduce((a, r) => a + (r.shipping || 0), 0), discount: o.reduce((a, r) => a + (r.discount || 0), 0) };
    }
    const pay = files.filter(f => f.kind === 'payments');
    if (pay.length) {
      const seen = new Map();
      for (const f of pay) for (const r of f.rows) if (inP(r)) seen.set(r.pid || (r.order + '|' + r.gross + '|' + r.date), r);
      const rs = [...seen.values()];
      out.payments = { count: rs.length, gross: rs.reduce((a, r) => a + (r.gross || 0), 0), refunds: rs.reduce((a, r) => a + (r.refund || 0), 0), fees: rs.reduce((a, r) => a + (r.fees || 0), 0) };
    }
    out.shipping = out.orders ? out.orders.shipping : out.items ? out.items.shipping : null;
    return out;
  }

  // Federal Form 1099-K: filed only when gross payments exceed $20,000 AND transactions exceed 200 (calendar years 2025 and later).
  const K1099 = { cents: 2000000, transactions: 200, from: 2025 };
  function form1099K(s, payments) {
    if (s.period.kind !== 'calendar' || s.currency !== 'USD' || s.period.year < K1099.from) return null;
    const gross = s.salesExTax, n = s.counts.saleRows;
    const over = gross > K1099.cents && n > K1099.transactions;
    return { gross, transactions: n, over, overAmount: gross > K1099.cents, overCount: n > K1099.transactions };
  }

  function checks(s) {
    const c = [];
    const n = s.counts;
    c.push({ id: 'recon', ok: s.recon.ok, title: 'Every row counted once',
      text: s.recon.ok ? `The categories add up to the statements’ Net total for the period, and the months add up to the year, to the cent (${n.rows} rows).` : 'The categories don’t add up to the statements’ Net total. Please email us the column headers of this file so we can fix it.' });
    c.push({ id: 'arith', ok: n.mismatch === 0, title: 'Row arithmetic',
      text: n.mismatch === 0 ? 'On every row, Amount plus Fees & Taxes equals Net.' : `${n.mismatch} row${n.mismatch > 1 ? 's' : ''} where Amount plus Fees & Taxes doesn’t equal Net. The Net value is used.` });
    c.push({ id: 'months', ok: n.missing.length === 0, title: 'Months covered',
      text: n.missing.length === 0 ? `Every month of the period${n.future ? ' so far' : ''} has statement rows.` : `No statement rows for ${listJoin(n.missing)}. Add those statements, or ignore this if the shop had no activity.` });
    c.push({ id: 'dups', ok: true, info: n.duplicates > 0, title: 'Overlapping files',
      text: n.duplicates > 0 ? `${n.duplicates} row${n.duplicates > 1 ? 's' : ''} appeared in more than one file and ${n.duplicates > 1 ? 'were' : 'was'} counted once.` : 'No row appears in two files.' });
    c.push({ id: 'unmapped', ok: s.unmappedRows.length === 0, title: 'Rows to review',
      text: s.unmappedRows.length === 0 ? 'Every row has a known Type.' : `${s.unmappedRows.length} row${s.unmappedRows.length > 1 ? 's have' : ' has'} a Type we don’t sort automatically. They are listed below and kept out of the totals.` });
    return c;
  }
  function listJoin(a) { return a.length <= 2 ? a.join(' and ') : a.slice(0, -1).join(', ') + ' and ' + a[a.length - 1]; }

  // ---------- Your own costs (materials, mileage) ----------
  // IRS business standard mileage rates, tenths of a cent per mile. Source: irs.gov/tax-professionals/standard-mileage-rates
  const IRS_MILEAGE = [
    { from: dayNo(2025, 1, 1), to: dayNo(2025, 12, 31), rate: 700 },
    { from: dayNo(2026, 1, 1), to: dayNo(2026, 6, 30), rate: 725 },
    { from: dayNo(2026, 7, 1), to: dayNo(2026, 12, 31), rate: 760 },
  ];
  // HMRC simplified expenses, cars and goods vehicles: pence per mile for the first 10,000 business miles in a tax year, then 25p.
  // Source: gov.uk/simpler-income-tax-simplified-expenses/vehicles (45p before 6 April 2026, 55p for 2026-27).
  const UK_FIRST = d => (d >= dayNo(2026, 4, 6) ? 55 : 45);
  function costAmounts(costs, region) {
    const list = (costs || []).map(c => ({ ...c, day: (parseDate(c.date) || {}).day }));
    const ukUsed = new Map();
    const sorted = list.slice().sort((a, b) => (a.day || 0) - (b.day || 0));
    for (const c of sorted) {
      c.cents = c.kind === 'mileage' ? null : Math.round(c.cents || 0);
      if (c.kind !== 'mileage') continue;
      const miles = Math.max(0, Number(c.miles) || 0);
      if (c.day == null) { c.cents = null; c.why = 'Add a date to work out the rate.'; continue; }
      if (region === 'us') {
        const r = IRS_MILEAGE.find(x => c.day >= x.from && c.day <= x.to);
        if (!r) { c.cents = null; c.why = 'No IRS rate stored for this date.'; continue; }
        c.cents = Math.round(miles * r.rate / 10); c.rate = `${r.rate / 10}¢/mile`;
      } else if (region === 'uk') {
        const p = fromDay(c.day), ty = c.day >= dayNo(p.y, 4, 6) ? p.y : p.y - 1;
        const used = ukUsed.get(ty) || 0, first = Math.max(0, Math.min(miles, 10000 - used));
        ukUsed.set(ty, used + miles);
        c.cents = Math.round(first * UK_FIRST(c.day) + (miles - first) * 25);
        c.rate = first === miles ? `${UK_FIRST(c.day)}p/mile` : `${UK_FIRST(c.day)}p and 25p/mile`;
      } else { c.cents = null; c.why = 'Mileage rates are stored for the US and UK only.'; }
    }
    return list;
  }
  function costsInPeriod(costs, period, region) {
    const list = costAmounts(costs, region).filter(c => c.day != null && c.day >= period.start && c.day <= period.end);
    const by = { materials: 0, supplies: 0, mileage: 0, other: 0 };
    let miles = 0;
    for (const c of list) { if (c.cents != null) by[c.kind] = (by[c.kind] || 0) + c.cents; if (c.kind === 'mileage') miles += Number(c.miles) || 0; }
    return { list, by, miles, total: by.materials + by.supplies + by.mileage + by.other };
  }

  // ---------- Where the totals usually go ----------
  // Line numbers: Schedule C (Form 1040) 2025, the latest final form. Boxes: SA103S 2025-26 (Self-employment, short).
  function formLines(s, region, cost) {
    const neg = v => (v ? -v : 0);
    const by = cost ? cost.by : { materials: 0, supplies: 0, mileage: 0, other: 0 };
    const etsyFees = s.totals.fee_listing + s.totals.fee_transaction + s.totals.fee_processing + s.totals.fee_regulatory + s.totals.fee_tax + s.totals.fee_other;
    if (region === 'us') {
      const L = [
        { code: 'Line 1', label: 'Gross receipts or sales', cents: s.salesExTax, what: 'Sales including the shipping buyers paid, after discounts, without the sales tax Etsy collected' },
        { code: 'Line 2', label: 'Returns and allowances', cents: neg(s.refundsExTax), what: 'Refunds to buyers, without the sales tax part' },
        { code: 'Line 4', label: 'Cost of goods sold (Part III)', cents: by.materials, what: 'Materials you entered', costs: true },
        { code: 'Line 8', label: 'Advertising', cents: neg(s.ads), what: 'Etsy Ads and Offsite Ads fees' },
        { code: 'Line 9', label: 'Car and truck expenses', cents: by.mileage, what: 'Business miles at the IRS standard rate', costs: true },
        { code: 'Line 10', label: 'Commissions and fees', cents: neg(etsyFees), what: 'Listing, transaction, processing and regulatory fees, other Etsy fees and tax charged on them' },
        { code: 'Line 18', label: 'Office expense', cents: neg(s.labels), what: 'Shipping labels bought on Etsy (the IRS instructions put postage here)' },
        { code: 'Line 22', label: 'Supplies', cents: by.supplies, what: 'Packaging and supplies you entered', costs: true },
        { code: 'Line 27b', label: 'Other expenses (Part V)', cents: neg(s.totals.fee_subscription) + by.other, what: 'Etsy Plus or Pattern subscriptions and other costs you entered' },
      ];
      const off = [
        { code: 'Not on Schedule C', label: 'Sales tax Etsy collected', cents: s.taxCollectedNet, what: 'Etsy collected it from buyers and paid it to the states' },
        { code: 'Not on Schedule C', label: 'Deposits to your bank', cents: neg(s.deposits), what: 'Money moved from Etsy to your bank; it is already counted in the lines above' },
      ];
      return { form: 'Schedule C (Form 1040)', lines: L, off };
    }
    if (region === 'uk') {
      const box19 = neg(s.totals.fee_listing + s.totals.fee_transaction + s.totals.fee_regulatory + s.totals.fee_tax + s.totals.fee_other + s.totals.fee_subscription + s.ads) + by.other;
      const L = [
        { code: 'Box 9', label: 'Your turnover', cents: s.netSales, what: 'Sales including postage buyers paid, less refunds, without the VAT or sales tax Etsy collected' },
        { code: 'Box 11', label: 'Costs of goods bought for resale or goods used', cents: by.materials + by.supplies, what: 'Materials, packaging and supplies you entered', costs: true },
        { code: 'Box 12', label: 'Car, van and travel expenses', cents: by.mileage, what: 'Business miles at HMRC’s flat rate', costs: true },
        { code: 'Box 17', label: 'Interest and bank and credit card financial charges', cents: neg(s.totals.fee_processing), what: 'Etsy payment processing fees' },
        { code: 'Box 18', label: 'Phone, fax, stationery and other office costs', cents: neg(s.labels), what: 'Shipping labels bought on Etsy (HMRC lists postage under office costs)' },
        { code: 'Box 19', label: 'Other allowable business expenses', cents: box19, what: 'Listing, transaction and regulatory fees, VAT on fees, Etsy Ads, Offsite Ads, subscriptions and other costs you entered' },
      ];
      const total = L.slice(1).reduce((a, l) => a + l.cents, 0);
      L.push({ code: 'Box 20', label: 'Total allowable expenses', cents: total, what: 'Boxes 11 to 19 added up', total: true });
      const off = [
        { code: 'Not on the return', label: 'VAT and sales tax Etsy collected', cents: s.taxCollectedNet, what: 'Etsy collected it from buyers as the marketplace and paid it over' },
        { code: 'Not on the return', label: 'Deposits to your bank', cents: neg(s.deposits), what: 'Money moved from Etsy to your bank; already counted above' },
      ];
      return { form: 'SA103S Self-employment (short)', lines: L, off };
    }
    const L = [
      { code: 'Income', label: 'Sales after refunds', cents: s.netSales, what: 'Sales including shipping buyers paid, less refunds, without the tax Etsy collected' },
      { code: 'Expense', label: 'Etsy selling fees', cents: neg(etsyFees + s.totals.fee_subscription), what: 'Listing, transaction, processing, regulatory and other fees, and tax on them' },
      { code: 'Expense', label: 'Advertising', cents: neg(s.ads), what: 'Etsy Ads and Offsite Ads' },
      { code: 'Expense', label: 'Postage', cents: neg(s.labels), what: 'Shipping labels bought on Etsy' },
      { code: 'Expense', label: 'Your other costs', cents: by.materials + by.supplies + by.other, what: 'Materials, supplies and other costs you entered', costs: true },
    ];
    return { form: 'Plain categories', lines: L, off: [
      { code: 'Not income', label: 'Tax Etsy collected', cents: s.taxCollectedNet, what: 'Collected from buyers and paid to tax authorities by Etsy' },
      { code: 'Not income', label: 'Deposits to your bank', cents: neg(s.deposits), what: 'A transfer of money already counted above' },
    ] };
  }
  // Category -> line, for the categorized row export.
  function lineFor(cat, region) {
    const us = { sales: 'Line 1', refunds: 'Line 2', tax_sale: 'Not on Schedule C', tax_refund: 'Not on Schedule C', fee_listing: 'Line 10', fee_transaction: 'Line 10', fee_processing: 'Line 10', fee_regulatory: 'Line 10', fee_tax: 'Line 10', fee_other: 'Line 10', fee_subscription: 'Line 27b', ads_etsy: 'Line 8', ads_offsite: 'Line 8', ads_other: 'Line 8', labels: 'Line 18', deposit: 'Transfer', payment: 'Transfer', reserve: 'Transfer', unmapped: 'Review' };
    const uk = { sales: 'Box 9', refunds: 'Box 9', tax_sale: 'Not on the return', tax_refund: 'Not on the return', fee_listing: 'Box 19', fee_transaction: 'Box 19', fee_processing: 'Box 17', fee_regulatory: 'Box 19', fee_tax: 'Box 19', fee_other: 'Box 19', fee_subscription: 'Box 19', ads_etsy: 'Box 19', ads_offsite: 'Box 19', ads_other: 'Box 19', labels: 'Box 18', deposit: 'Transfer', payment: 'Transfer', reserve: 'Transfer', unmapped: 'Review' };
    return (region === 'us' ? us : region === 'uk' ? uk : {})[cat] || '';
  }

  // ---------- Sample year (made-up shop, real file layout) ----------
  function sampleYear(year) {
    year = year || 2025;
    let seed = 20250117;
    const rnd = () => { seed |= 0; seed = (seed + 0x6D2B79F5) | 0; let t = Math.imul(seed ^ (seed >>> 15), 1 | seed); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
    const pick = a => a[Math.floor(rnd() * a.length)];
    const ITEMS = [
      ['Speckled stoneware mug, 12 oz', 3800], ['Linen tea towel, botanical print', 1800], ['Brass ring dish, hammered', 2400],
      ['Hand-poured soy candle, cedar and fig', 2600], ['Ceramic bud vase, matte white', 3200], ['Personalized leather keychain', 1600],
      ['Embroidered patch set of three', 1200], ['Stoneware serving bowl, oatmeal glaze', 6400],
    ];
    const PER_MONTH = [18, 15, 19, 21, 24, 22, 19, 21, 25, 31, 47, 58];
    const fmt = c => (c < 0 ? '-' : '') + '$' + (Math.abs(c) / 100).toFixed(2).replace(/\B(?=(\d{3})+(?!\d))/g, ',');
    const dstr = (m, d) => `${MONTH_NAMES[m - 1]} ${d}, ${year}`;
    const q = v => /[",\n]/.test(v) ? `"${v.replace(/"/g, '""')}"` : v;
    const cut = s => (s.length > 40 ? s.slice(0, 40) + '...' : s);
    const events = []; // {day, m, d, ord, row:[...]} ; ord sorts rows within a day like Etsy does
    const orders = [];
    let orderNo = 3480000000, labelNo = 8810000000, listingNo = 1600000000;
    const ev = (m, d, ord, type, title, info, amount, fees) => events.push({ day: dayNo(year, m, d), m, d, ord, row: [dstr(m, d), type, title, info, 'USD', amount == null ? '--' : fmt(amount), fees == null ? '--' : fmt(fees), fmt((amount || 0) + (fees || 0)), '--'] });
    for (let m = 1; m <= 12; m++) {
      const days = new Date(Date.UTC(year, m, 0)).getUTCDate();
      for (let k = 0; k < PER_MONTH[m - 1]; k++) {
        const d = 1 + Math.floor(rnd() * days);
        const it = pick(ITEMS), qty = rnd() < 0.18 ? 2 : 1;
        const intl = rnd() < 0.08;
        const items = it[1] * qty;
        const discount = rnd() < 0.15 ? Math.round(items * 0.1) : 0;
        const shipping = intl ? 1800 : 595;
        const rate = !intl && rnd() < 0.62 ? pick([600, 625, 700, 725, 825, 875]) : 0;
        const tax = Math.round((items - discount + shipping) * rate / 10000);
        const total = items - discount + shipping + tax;
        const no = String(++orderNo), oi = 'Order #' + no;
        ev(m, d, 6, 'Sale', 'Payment for ' + oi, '', total, null);
        if (tax) ev(m, d, 4, 'Tax', 'Sales tax paid by buyer', oi, null, -tax);
        const txItem = -Math.round((items - discount) * 0.065), txShip = -Math.round(shipping * 0.065), proc = -(Math.round(total * 0.03) + 25);
        ev(m, d, 3, 'Fee', 'Transaction fee: ' + cut(it[0]), oi, null, txItem);
        ev(m, d, 2, 'Fee', 'Transaction fee: Shipping', oi, null, txShip);
        ev(m, d, 5, 'Fee', 'Processing fee', oi, null, proc);
        ev(m, d, 7, 'Fee', 'Listing fee', 'Listing #' + (listingNo + Math.floor(rnd() * 900)), null, -20 * qty);
        const offsite = rnd() < 0.05 ? -Math.min(10000, Math.round((items - discount + shipping) * 0.15)) : 0;
        if (offsite) ev(m, d, 1, 'Marketing', 'Fee for sale made through Offsite Ads', oi, null, offsite);
        const sd = Math.min(days, d + 1 + Math.floor(rnd() * 2));
        ev(m, sd, 8, 'Shipping', 'USPS shipping label', 'Label #' + (++labelNo), null, intl ? -1645 : -(470 + Math.floor(rnd() * 90)));
        orders.push({ m, d, sd, no, it, qty, items, discount, shipping, tax, total, proc, intl });
        if (rnd() < 0.022) {
          const rd = Math.min(days, d + 3);
          ev(m, rd, 9, 'Refund', 'Refund to buyer for ' + oi, '', -total, null);
          if (tax) ev(m, rd, 10, 'Tax', 'Refund to buyer for sales tax', oi, null, tax);
          ev(m, rd, 11, 'Fee', 'Credit for transaction fee on ' + cut(it[0]), oi, null, -txItem);
          ev(m, rd, 12, 'Fee', 'Credit for transaction fee on shipping', oi, null, -txShip);
          ev(m, rd, 13, 'Fee', 'Credit for processing fee', oi, null, -proc);
          if (offsite) ev(m, rd, 14, 'Marketing', 'Credit for Offsite Ads fee', oi, null, -offsite);
        } else if (rnd() < 0.012) {
          ev(m, Math.min(days, d + 4), 9, 'Refund', 'Partial refund to buyer for ' + oi, '', -Math.round(total * 0.25), null);
        }
      }
      for (let d = 1; d <= days; d++) {
        if (rnd() < 0.55) {
          const prev = new Date(Date.UTC(year, m - 1, d - 1));
          ev(m, d, 0, 'Marketing', 'Etsy Ads', `Bill for click-throughs to your shop on ${SHORT[prev.getUTCMonth()]} ${prev.getUTCDate()}, ${prev.getUTCFullYear()}`, null, -(40 + Math.floor(rnd() * 160)));
        }
      }
      for (let k = 0; k < 3; k++) ev(m, 1 + Math.floor(rnd() * 27), 7, 'Fee', 'Listing fee', 'Listing #' + (++listingNo), null, -20);
    }
    // Weekly deposits on Mondays of the running balance, as Etsy Payments does.
    events.sort((a, b) => a.day - b.day || a.ord - b.ord);
    let bal = 0, i = 0;
    const deposits = [];
    for (let day = dayNo(year, 1, 1); day <= dayNo(year, 12, 31); day++) {
      while (i < events.length && events[i].day < day) { bal += parseMoney(events[i].row[7]); i++; }
      if (new Date(day * 864e5).getUTCDay() === 1 && bal > 1000) {
        const p = fromDay(day);
        deposits.push({ day, m: p.m, d: p.d, ord: -1, row: [dstr(p.m, p.d), 'Deposit', `${fmt(bal)} sent to your bank account`, '', 'USD', '--', '--', '--', '--'] });
        bal = 0;
      }
    }
    const all = events.concat(deposits).sort((a, b) => b.day - a.day || b.ord - a.ord);
    const head = 'Date,Type,Title,Info,Currency,Amount,"Fees & Taxes",Net,"Tax Details"';
    const files = [];
    for (let m = 1; m <= 12; m++) {
      const lines = all.filter(e => e.m === m).map(e => e.row.map(q).join(','));
      files.push({ name: `etsy_statement_${year}_${m}.csv`, text: BOM + head + '\n' + lines.join('\n') + '\n' });
    }
    const oh = ['Sale Date', 'Order ID', 'Buyer User ID', 'Full Name', 'First Name', 'Last Name', 'Number of Items', 'Payment Method', 'Date Shipped', 'Street 1', 'Street 2', 'Ship City', 'Ship State', 'Ship Zipcode', 'Ship Country', 'Currency', 'Order Value', 'Coupon Code', 'Coupon Details', 'Discount Amount', 'Shipping Discount', 'Shipping', 'Sales Tax', 'Order Total', 'Status', 'Card Processing Fees', 'Order Net', 'Adjusted Order Total', 'Adjusted Card Processing Fees', 'Adjusted Net Order Amount', 'Buyer', 'Order Type', 'Payment Type', 'InPerson Discount', 'InPerson Location', 'SKU'];
    const mdy = (m, d) => `${String(m).padStart(2, '0')}/${String(d).padStart(2, '0')}/${String(year).slice(2)}`;
    const n2 = c => (c / 100).toFixed(2);
    const orows = orders.slice().reverse().map((o, k) => [mdy(o.m, o.d), o.no, 'sample_buyer_' + (k + 1), 'Sample Buyer ' + (k + 1), 'Sample', 'Buyer ' + (k + 1), String(o.qty), 'Credit Card', mdy(o.m, o.sd), '100 Sample Street', '', o.intl ? 'Toronto' : 'Springfield', o.intl ? 'ON' : 'IL', o.intl ? 'M5V 2T6' : '62701', o.intl ? 'Canada' : 'United States', 'USD', n2(o.items), o.discount ? 'SAVE10' : '', o.discount ? '10% off' : '', n2(o.discount), '0.00', n2(o.shipping), '0', n2(o.total), '', n2(-o.proc), n2(o.total + o.proc), '0.00', '0.00', '0.00', 'sample_buyer_' + (k + 1), 'online', 'online_cc', '', '', ''].map(q).join(','));
    files.push({ name: `EtsySoldOrders${year}.csv`, text: oh.map(h => /\s/.test(h) ? `"${h}"` : h).join(',') + '\n' + orows.join('\n') + '\n' });
    return files;
  }

  // ---------- Formatting ----------
  function money(cents, currency, opts) {
    opts = opts || {};
    const v = (cents || 0) / 100;
    let s;
    try { s = new Intl.NumberFormat(opts.locale || 'en-US', { style: 'currency', currency: currency || 'USD', minimumFractionDigits: 2 }).format(Math.abs(v)); }
    catch (e) { s = (currency ? currency + ' ' : '') + Math.abs(v).toFixed(2); }
    if (cents < 0) s = (opts.ascii ? '-' : MINUS) + s;
    return s;
  }

  return {
    CHECKED, CATS, KINDS, K1099, IRS_MILEAGE, MONTH_NAMES,
    parseCSV, parseMoney, parseDate, dateOrder, readFile, categorize, titleGroup, markDuplicates,
    calendarPeriod, ukPeriod, periodById, periodsFor, summarize, derive, ordersSummary, costAmounts, costsInPeriod,
    formLines, lineFor, sampleYear, money, dayNo, fromDay, iso,
  };
});
