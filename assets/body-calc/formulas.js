// Body measurement formulas for the Leano calculators (peakappsstudio.com). The same equations, sources and limits as the
// Leano iOS app (apps/leano-instant-result/src/core/metrics.ts and instant.ts), so a number here matches the app's number.
// Everything is in centimetres and kilograms inside; inches and pounds are converted at the edges.
//
// - Waist-to-height ratio: waist / height. Bands as in NICE guideline NG246 (2025), adults: under 0.4 not classified,
//   0.4 to 0.49 healthy central adiposity, 0.5 to 0.59 increased, 0.6 or more high. The 0.5 boundary: Ashwell & Gibson,
//   BMJ Open 2016;6:e010159. Military screen: a Department of Defense memo of January 2026 sets the limit at under 0.55.
// - Relative Fat Mass: Woolcott OO, Bergman RN. Scientific Reports 2018;8:10980.
//   %BF = 64 - 20 x (height / waist) + 12 x sex, sex = 0 for men and 1 for women (height and waist in the same unit).
// - US Navy circumference method: Hodgdon JA, Beckett MB, Naval Health Research Center reports 84-11 and 84-29 (1984),
//   in inches as used by DoD Instruction 1308.3:
//     men:   %BF = 86.010 log10(abdomen - neck) - 70.041 log10(height) + 36.76
//     women: %BF = 163.205 log10(waist + hip - neck) - 97.684 log10(height) - 78.387
// - BMI: kg / m^2 with the WHO adult bands (WHO Technical Report Series 894, 2000).

export const CM_PER_IN = 2.54;
export const KG_PER_LB = 0.45359237;

export const cmToIn = (cm) => cm / CM_PER_IN;
export const inToCm = (inches) => inches * CM_PER_IN;
export const kgToLb = (kg) => kg / KG_PER_LB;
export const lbToKg = (lb) => lb * KG_PER_LB;

/** Plausible adult ranges (cm, kg), the same as the app's. Outside them the page asks to check the number and the unit. */
export const RANGE = {
  height: [100, 250],
  waist: [40, 250],
  neck: [20, 70],
  hips: [50, 230],
  weight: [25, 350],
};

export const WHTR_BANDS = [0.4, 0.5, 0.6];
export const MILITARY_WHTR_LIMIT = 0.55;

const isPositive = (v) => typeof v === 'number' && Number.isFinite(v) && v > 0;
const within = (v, [lo, hi]) => typeof v === 'number' && Number.isFinite(v) && v >= lo && v <= hi;

/** A number shown to two decimals, rounded down, so the figure on screen always sits in the band it is classed in. */
export const floor2 = (v) => Math.floor(v * 100 + 1e-9) / 100;
/** One decimal, rounded half up, for percentages. */
export const round1 = (v) => Math.round(v * 10) / 10;

/** Waist-to-height ratio with its NICE NG246 band: 'below' (< 0.4), 'healthy', 'increased', 'high' (>= 0.6). */
export function waistToHeight(waistCm, heightCm) {
  if (!isPositive(waistCm) || !isPositive(heightCm)) return null;
  const value = waistCm / heightCm;
  if (!Number.isFinite(value) || value <= 0.2 || value >= 1.5) return null;
  const band = value < 0.4 ? 'below' : value < 0.5 ? 'healthy' : value < 0.6 ? 'increased' : 'high';
  return { value, band };
}

/** True when the ratio is under the 0.55 limit of the 2026 military screen (the raw ratio, not a rounded one). */
export const underMilitaryLimit = (ratio) => ratio < MILITARY_WHTR_LIMIT;

/** The waist that gives a ratio for a height: for "keep your waist under half your height". */
export const waistForRatio = (ratio, heightCm) => ratio * heightCm;

/** Relative Fat Mass, % (Woolcott & Bergman 2018). Null when the inputs cannot be a body (result outside 2 to 70 %). */
export function relativeFatMass(sex, heightCm, waistCm) {
  if (!isPositive(heightCm) || !isPositive(waistCm)) return null;
  if (sex !== 'female' && sex !== 'male') return null;
  const pct = 64 - 20 * (heightCm / waistCm) + (sex === 'female' ? 12 : 0);
  if (!Number.isFinite(pct) || pct < 2 || pct > 70) return null;
  return pct;
}

/**
 * US Navy circumference body fat, % (Hodgdon & Beckett 1984). Centimetres are converted to inches first, so centimetre
 * and inch entries of the same body give the same result. Men: waist = abdomen at the navel. Women: waist at its
 * narrowest, plus hips. Null when the inputs cannot produce a sane value (2 to 65 %).
 */
export function navyBodyFat({ sex, heightCm, neckCm, waistCm, hipsCm }) {
  if (!isPositive(heightCm) || !isPositive(neckCm) || !isPositive(waistCm)) return null;
  const h = cmToIn(heightCm);
  const neck = cmToIn(neckCm);
  const waist = cmToIn(waistCm);
  let pct;
  if (sex === 'male') {
    const d = waist - neck;
    if (d <= 0) return null;
    pct = 86.01 * Math.log10(d) - 70.041 * Math.log10(h) + 36.76;
  } else if (sex === 'female') {
    if (!isPositive(hipsCm)) return null;
    const d = waist + cmToIn(hipsCm) - neck;
    if (d <= 0) return null;
    pct = 163.205 * Math.log10(d) - 97.684 * Math.log10(h) - 78.387;
  } else return null;
  if (!Number.isFinite(pct) || pct < 2 || pct > 65) return null;
  return pct;
}

/** BMI with the WHO adult band: 'low' (< 18.5), 'healthy', 'over' (25 to 29.9), 'obese1' (30 to 39.9), 'obese2' (40+). */
export function bmi(weightKg, heightCm) {
  if (!isPositive(weightKg) || !isPositive(heightCm)) return null;
  const m = heightCm / 100;
  const value = weightKg / (m * m);
  if (!Number.isFinite(value) || value < 8 || value > 90) return null;
  const band = value < 18.5 ? 'low' : value < 25 ? 'healthy' : value < 30 ? 'over' : value < 40 ? 'obese1' : 'obese2';
  return { value, band };
}

/** Fat and lean mass for a body fat estimate applied to a weight. */
export function massSplit(weightKg, pct) {
  if (!isPositive(weightKg) || typeof pct !== 'number' || !Number.isFinite(pct)) return null;
  const fat = (weightKg * pct) / 100;
  return { fat, lean: weightKg - fat };
}

/**
 * What is wrong with the given values (cm, kg), if anything: the names of the fields out of range, and 'fit' when each
 * value is plausible alone but they cannot be one body (a 200 cm person with a 50 cm waist). Empty fields are not issues.
 */
export function issues(v) {
  const out = [];
  for (const k of ['height', 'waist', 'neck', 'hips', 'weight']) {
    if (v[k] != null && !within(v[k], RANGE[k])) out.push(k);
  }
  if (!out.includes('height') && !out.includes('waist') && v.height != null && v.waist != null) {
    const r = v.waist / v.height;
    if (r < 0.3 || r > 1) out.push('fit');
  }
  return out;
}

/** Height from feet and inches, in cm. Either part may be empty (treated as 0); both empty is null. */
export function feetInchesToCm(ft, inches) {
  const f = Number.isFinite(ft) ? ft : null;
  const i = Number.isFinite(inches) ? inches : null;
  if (f == null && i == null) return null;
  return inToCm((f || 0) * 12 + (i || 0));
}

/** A height in cm as whole feet and inches to one decimal (5 ft 9.5 in). */
export function cmToFeetInches(cm) {
  const total = Math.round(cmToIn(cm) * 10) / 10;
  let ft = Math.floor(total / 12);
  let inch = Math.round((total - ft * 12) * 10) / 10;
  if (inch >= 12) { ft += 1; inch -= 12; }
  return { ft, inch };
}
