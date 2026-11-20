// The Leano calculators on peakappsstudio.com: one script for the four pages. The page says which calculator it is with
// <form data-calc="whtr|rfm|navy|fat">, its words live in the page (a JSON block #calc-words and the HTML itself), and
// every number is worked out here in the browser. Nothing is sent, stored or put in the address.
import {
  waistToHeight, underMilitaryLimit, waistForRatio, relativeFatMass, navyBodyFat, massSplit, issues,
  feetInchesToCm, cmToFeetInches, inToCm, cmToIn, lbToKg, kgToLb, floor2, round1, RANGE, MILITARY_WHTR_LIMIT,
} from './formulas.js';

const form = document.querySelector('form[data-calc]');
if (form) init(form);

// iPhone and iPad (iPadOS reports itself as a Mac with touch): the App Store badge moves up next to the result
const ios = /iPad|iPhone|iPod/.test(navigator.userAgent) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);
document.documentElement.classList.toggle('is-ios', ios);

function init(form) {
  const mode = form.dataset.calc;
  const lang = document.documentElement.lang || 'en';
  const W = JSON.parse(document.getElementById('calc-words').textContent);
  const $ = (sel, root = document) => root.querySelector(sel);
  const $$ = (sel, root = document) => [...root.querySelectorAll(sel)];
  const field = (name) => form.elements.namedItem(name);
  const nf = (d) => new Intl.NumberFormat(lang, { minimumFractionDigits: d, maximumFractionDigits: d });
  const fmt = (v, d) => nf(d).format(v);
  const out = (name) => $$(`[data-out="${name}"]`);
  const setText = (name, text) => out(name).forEach((el) => { el.textContent = text; });
  const show = (name, on) => $$(`[data-show="${name}"]`).forEach((el) => { el.hidden = !on; });

  // the units a visitor in the US most likely uses, unless the page says otherwise
  const startUnits = form.dataset.units || (/^en-US$/i.test(navigator.language || '') ? 'us' : 'metric');
  const unitsInput = $(`input[name="units"][value="${startUnits}"]`, form);
  if (unitsInput) unitsInput.checked = true;

  const units = () => (form.elements.namedItem('units')?.value === 'us' ? 'us' : 'metric');
  const sex = () => {
    const v = form.elements.namedItem('sex')?.value;
    return v === 'female' || v === 'male' ? v : null;
  };
  const num = (name) => {
    const el = field(name);
    if (!el || el.disabled || el.closest('[hidden]')) return null;
    const s = String(el.value).trim().replace(/\s/g, '').replace(',', '.');
    if (s === '') return null;
    const v = Number(s);
    return Number.isFinite(v) ? v : NaN;
  };
  const lenCm = (name) => {
    const v = num(name);
    return v == null || Number.isNaN(v) ? v : units() === 'us' ? inToCm(v) : v;
  };
  const heightCm = () => {
    if (units() === 'metric') return num('height');
    const ft = num('heightFt');
    const inch = num('heightIn');
    if (Number.isNaN(ft) || Number.isNaN(inch)) return NaN;
    return feetInchesToCm(ft, inch);
  };
  const weightKg = () => {
    const v = num('weight');
    return v == null || Number.isNaN(v) ? v : units() === 'us' ? lbToKg(v) : v;
  };
  const len = (cm, d = 1) => (units() === 'us' ? `${fmt(cmToIn(cm), d)} in` : `${fmt(cm, d)} cm`);
  const mass = (kg) => (units() === 'us' ? `${fmt(kgToLb(kg), 1)} lb` : `${fmt(kg, 1)} kg`);

  // unit labels and the height fields follow the units switch
  function applyUnits() {
    const us = units() === 'us';
    $$('[data-unit="len"]', form).forEach((el) => { el.textContent = us ? 'in' : 'cm'; });
    $$('[data-unit="wt"]', form).forEach((el) => { el.textContent = us ? 'lb' : 'kg'; });
    $$('[data-units-only="metric"]', form).forEach((el) => { el.hidden = us; });
    $$('[data-units-only="us"]', form).forEach((el) => { el.hidden = !us; });
  }
  // switching units converts what is already typed, so nobody types it twice
  let lastUnits = units();
  function convertTyped() {
    const now = units();
    if (now === lastUnits) return;
    const toUs = now === 'us';
    const conv = (name, f, d) => {
      const el = field(name);
      if (!el) return;
      const s = String(el.value).trim().replace(',', '.');
      if (s === '' || !Number.isFinite(Number(s))) return;
      el.value = String(Math.round(f(Number(s)) * 10 ** d) / 10 ** d);
    };
    for (const n of ['waist', 'neck', 'hips']) conv(n, toUs ? cmToIn : inToCm, 1);
    conv('weight', toUs ? kgToLb : lbToKg, 1);
    if (toUs) {
      const s = String(field('height')?.value || '').trim().replace(',', '.');
      if (s !== '' && Number.isFinite(Number(s))) {
        const { ft, inch } = cmToFeetInches(Number(s));
        field('heightFt').value = String(ft);
        field('heightIn').value = String(inch);
      }
    } else {
      const cm = feetInchesToCm(numRaw('heightFt'), numRaw('heightIn'));
      if (cm != null && Number.isFinite(cm)) field('height').value = String(Math.round(cm * 10) / 10);
    }
    lastUnits = now;
  }
  const numRaw = (name) => {
    const s = String(field(name)?.value || '').trim().replace(',', '.');
    return s === '' ? null : Number(s);
  };

  // which fields this calculator needs, given the sex
  function needed() {
    const s = sex();
    if (mode === 'whtr') return ['height', 'waist'];
    if (mode === 'rfm') return ['sex', 'height', 'waist'];
    if (mode === 'navy') return s === 'female' ? ['sex', 'height', 'neck', 'waist', 'hips'] : ['sex', 'height', 'neck', 'waist'];
    return ['sex', 'height', 'waist']; // fat: RFM first, Navy when neck (and for women hips) are there
  }

  function markInvalid(bad) {
    for (const name of ['height', 'heightFt', 'heightIn', 'waist', 'neck', 'hips', 'weight']) {
      const el = field(name);
      if (!el) continue;
      const key = name.startsWith('height') ? 'height' : name;
      const isBad = bad.includes(key) || (bad.includes('fit') && (key === 'height' || key === 'waist'));
      el.setAttribute('aria-invalid', isBad ? 'true' : 'false');
    }
  }

  function rangeText(key) {
    const [lo, hi] = RANGE[key];
    const to = W.to || ' to ';
    if (key === 'weight') return units() === 'us' ? `${Math.round(kgToLb(lo))}${to}${Math.round(kgToLb(hi))} lb` : `${lo}${to}${hi} kg`;
    return units() === 'us' ? `${Math.round(cmToIn(lo))}${to}${Math.round(cmToIn(hi))} in` : `${lo}${to}${hi} cm`;
  }

  function setMarker(name, value, lo, hi) {
    $$(`[data-marker="${name}"]`).forEach((m) => {
      const p = Math.min(1, Math.max(0, (value - lo) / (hi - lo)));
      m.style.setProperty('--at', `${(p * 100).toFixed(2)}%`);
      m.hidden = false;
    });
  }
  const hideMarker = (name) => $$(`[data-marker="${name}"]`).forEach((m) => { m.hidden = true; });

  // the figure lights the bands this calculator uses for the chosen sex
  function applyFigure() {
    const s = sex() || 'none';
    $$('[data-sex-only]').forEach((el) => { el.hidden = !el.dataset.sexOnly.split(' ').includes(s); });
    $$('[data-for-sex]').forEach((el) => {
      const list = el.dataset.forSex.split(' ');
      el.classList.toggle('is-off', !list.includes(s) && !list.includes('any'));
    });
  }

  function render() {
    applyUnits();
    applyFigure();
    const s = sex();
    const v = { height: heightCm(), waist: lenCm('waist'), neck: lenCm('neck'), hips: lenCm('hips'), weight: weightKg() };
    const typedNaN = Object.entries(v).filter(([, x]) => Number.isNaN(x)).map(([k]) => k);
    const clean = Object.fromEntries(Object.entries(v).map(([k, x]) => [k, Number.isNaN(x) ? null : x]));
    const bad = [...new Set([...typedNaN, ...issues(clean)])];
    markInvalid(bad);
    const need = needed();
    const missing = need.filter((k) => (k === 'sex' ? !s : clean[k] == null));
    const blocking = bad.filter((k) => need.includes(k) || k === 'fit');

    const result = $('[data-result]');
    let state = 'empty';
    let message = '';
    if (blocking.length) {
      state = 'error';
      const k = blocking[0];
      message = k === 'fit' ? W.fit : W.range.replace('{field}', W.names[k]).replace('{range}', rangeText(k));
    } else if (missing.length) {
      const names = missing.map((k) => W.names[k]);
      const list = typeof Intl.ListFormat === 'function' ? new Intl.ListFormat(lang, { type: 'conjunction' }).format(names) : names.join(', ');
      message = W.missing.replace('{fields}', list);
    }

    // the result itself
    let main = null;
    if (!message) {
      if (mode === 'whtr') main = computeWhtr(clean, s);
      else if (mode === 'rfm') main = computeRfm(clean, s);
      else if (mode === 'navy') main = computeNavy(clean, s);
      else main = computeFat(clean, s);
      if (!main) { state = 'error'; message = W.fit; }
      else state = 'done';
    }
    result.dataset.state = state;
    setText('message', message);
    show('done', state === 'done');
    show('waiting', state !== 'done');
    if (state !== 'done') {
      setText('main', mode === 'whtr' ? fmt(0, 2) : fmt(0, 1));
      hideMarker('main');
    }
    // weight is optional: a wrong weight only hides the mass line and says why
    const weightBad = bad.includes('weight');
    show('weight-bad', state === 'done' && weightBad);
    if (weightBad) setText('weight-bad', W.range.replace('{field}', W.names.weight).replace('{range}', rangeText('weight')));
  }

  function writeBand(band) {
    $$('[data-band]').forEach((el) => { el.hidden = el.dataset.band !== band; });
    const r = $('[data-result]');
    r.dataset.band = band || '';
  }

  function computeWhtr(v, s) {
    const r = waistToHeight(v.waist, v.height);
    if (!r) return null;
    const shown = floor2(r.value);
    setText('main', fmt(shown, 2));
    writeBand(r.band);
    setMarker('main', r.value, 0.3, 0.8);
    setText('half', len(waistForRatio(0.5, v.height)));
    setText('mil-waist', len(waistForRatio(MILITARY_WHTR_LIMIT, v.height)));
    const pass = underMilitaryLimit(r.value);
    show('mil-pass', pass);
    show('mil-over', !pass);
    // the same two numbers give the RFM body fat estimate once the sex is chosen
    const rfm = relativeFatMass(s, v.height, v.waist);
    show('rfm-line', rfm != null);
    show('rfm-ask', rfm == null);
    if (rfm != null) setText('rfm', `${fmt(round1(rfm), 1)}%`);
    return r;
  }

  function computeRfm(v, s) {
    const rfm = relativeFatMass(s, v.height, v.waist);
    if (rfm == null) return null;
    setText('main', fmt(round1(rfm), 1));
    setMarker('main', rfm, 0, 60);
    writeMass(v.weight, rfm);
    const r = waistToHeight(v.waist, v.height);
    show('whtr-line', !!r);
    if (r) {
      setText('whtr', fmt(floor2(r.value), 2));
      setText('whtr-band', W.bands[r.band]);
    }
    return rfm;
  }

  function computeNavy(v, s) {
    const navy = navyBodyFat({ sex: s, heightCm: v.height, neckCm: v.neck, waistCm: v.waist, hipsCm: v.hips });
    if (navy == null) return null;
    setText('main', fmt(round1(navy), 1));
    setMarker('main', navy, 0, 60);
    writeMass(v.weight, navy);
    const r = waistToHeight(v.waist, v.height);
    show('whtr-line', !!r);
    if (r) {
      setText('whtr', fmt(floor2(r.value), 2));
      show('mil-pass', underMilitaryLimit(r.value));
      show('mil-over', !underMilitaryLimit(r.value));
    }
    return navy;
  }

  function computeFat(v, s) {
    const rfm = relativeFatMass(s, v.height, v.waist);
    if (rfm == null) return null;
    setText('main', fmt(round1(rfm), 1));
    setMarker('main', rfm, 0, 60);
    writeMass(v.weight, rfm);
    const r = waistToHeight(v.waist, v.height);
    show('whtr-line', !!r);
    if (r) {
      setText('whtr', fmt(floor2(r.value), 2));
      setText('whtr-band', W.bands[r.band]);
    }
    // the US Navy estimate as a second opinion, when its measurements are there
    const wantsNavy = v.neck != null && (s === 'male' || v.hips != null);
    const navy = wantsNavy ? navyBodyFat({ sex: s, heightCm: v.height, neckCm: v.neck, waistCm: v.waist, hipsCm: v.hips }) : null;
    show('navy-line', navy != null);
    show('navy-ask', !wantsNavy);
    show('navy-bad', wantsNavy && navy == null);
    if (navy != null) setText('navy', `%${fmt(round1(navy), 1)}`);
    return rfm;
  }

  function writeMass(weight, pct) {
    const m = massSplit(weight, pct);
    show('mass-line', !!m);
    if (m) {
      setText('fat-mass', mass(m.fat));
      setText('lean-mass', mass(m.lean));
    }
  }

  form.addEventListener('input', render);
  form.addEventListener('change', () => { convertTyped(); render(); });
  form.addEventListener('submit', (e) => { e.preventDefault(); render(); });
  form.addEventListener('reset', () => setTimeout(() => { lastUnits = units(); render(); }, 0));
  // the figure lights the band of the field being typed
  form.addEventListener('focusin', (e) => {
    const key = (e.target.name || '').replace(/^height(Ft|In)$/, 'height');
    $$('[data-band-of]').forEach((el) => el.classList.toggle('is-active', el.dataset.bandOf === key));
  });
  form.addEventListener('focusout', () => $$('[data-band-of]').forEach((el) => el.classList.remove('is-active')));
  lastUnits = units();
  render();
  document.documentElement.classList.add('calc-ready');
}
