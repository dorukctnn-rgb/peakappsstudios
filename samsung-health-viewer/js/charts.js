/* Wristory's drawings, as SVG text: the day sheet (one column per day: steps grow up from the middle line, the night's
 * sleep hangs below it, then heart rate, weight and the smaller rows), the week-by-week charts in the panels and the
 * bar of an average night. Colours come from tool.css through class names, so light and dark both work. */

export const STAGE_ORDER = ['deep', 'light', 'rem', 'awake'];
export const STAGE_HEX = { deep: '#2c3e9e', light: '#8fa8f0', rem: '#c25cc7', awake: '#ff9a6b', asleep: '#7d8db8' };
const esc = s => String(s == null ? '' : s).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
const r1 = v => Math.round(v * 10) / 10;

// rows shown for a period: only the ones the files have
export function sheetRows(has, heartKey, compact) {
  const rows = [], sm = compact ? 28 : 16;
  if (has.steps) rows.push({ key: 'steps', h: 70 });
  if (has.sleep) rows.push({ key: 'sleep', h: 74 });
  if (has.heart) rows.push({ key: heartKey, h: 46, line: 'heart' });
  if (has.weight) rows.push({ key: 'weight', h: 46, line: 'kg' });
  if (has.stress) rows.push({ key: 'stress', h: sm, cell: 'stress' });
  if (has.spo2) rows.push({ key: 'spo2', h: sm, cell: 'spo2' });
  if (has.workouts) rows.push({ key: 'workouts', h: sm, dot: 'wo' });
  if (has.bp) rows.push({ key: 'bp', h: sm, dot: 'bp' });
  return rows;
}
export const SHEET_TOP = 22, ROW_GAP = 10;

// The sheet. days: [{day, steps, asleep, deep, ...}], months: short month names, sel: selected index
export function sheetSvg(days, rows, opts) {
  const n = days.length, cw = opts.colW, W = n * cw;
  let y = SHEET_TOP;
  const out = [];
  const H = rows.reduce((s, r) => s + r.h + ROW_GAP, SHEET_TOP) + 4;
  out.push(`<svg class="ws-svg" xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}" aria-hidden="true" focusable="false">`);
  // months along the top, a hairline at each first day; a label that would run into the previous one is left out
  let free = 0;
  days.forEach((d, i) => {
    if (d.day.slice(8) === '01' || i === 0) {
      const label = opts.monthName(+d.day.slice(5, 7) - 1) + (d.day.slice(5, 7) === '01' || i === 0 ? ` ${d.day.slice(0, 4)}` : '');
      const x = i * cw + 2, wLabel = label.length * 6.6;
      if (x >= free && x + wLabel <= W + 2) { out.push(`<text class="ws-sv-month" x="${x}" y="12">${esc(label)}</text>`); free = x + wLabel + 6; }
      if (i) out.push(`<line class="ws-sv-tick" x1="${i * cw}" x2="${i * cw}" y1="16" y2="${H}"/>`);
    }
  });
  out.push(`<rect class="ws-sv-sel" id="sv-sel" x="${(opts.sel || 0) * cw}" y="16" width="${cw}" height="${H - 16}"/>`);
  const bw = Math.max(1, cw - (cw >= 5 ? 1.5 : cw >= 3 ? 1 : 0));
  for (const r of rows) {
    if (r.key === 'steps') {
      const max = Math.max(12000, ...days.map(d => d.steps || 0));
      days.forEach((d, i) => { if (d.steps) { const h = Math.max(1, (d.steps / max) * (r.h - 4)); out.push(`<rect class="ws-sv-steps${d.steps >= 10000 ? ' is-hi' : ''}" x="${r1(i * cw)}" y="${r1(y + r.h - h)}" width="${r1(bw)}" height="${r1(h)}"/>`); } });
      out.push(`<line class="ws-sv-base" x1="0" x2="${W}" y1="${y + r.h + ROW_GAP / 2}" y2="${y + r.h + ROW_GAP / 2}"/>`);
    } else if (r.key === 'sleep') {
      const scale = (r.h - 2) / 600; // ten hours fill the row
      days.forEach((d, i) => {
        if (!d.asleep) return;
        let yy = y;
        const parts = d.staged ? STAGE_ORDER.map(k => [k, d[k] || 0]) : [['asleep', d.asleep]];
        for (const [k, v] of parts) {
          const h = Math.min(r.h - (yy - y), v * scale);
          if (h <= 0) continue;
          out.push(`<rect class="ws-sv-${k}" x="${r1(i * cw)}" y="${r1(yy)}" width="${r1(bw)}" height="${r1(h)}"/>`);
          yy += h;
        }
      });
    } else if (r.line) {
      const vals = days.map(d => d[r.line]).filter(v => v !== null && v !== undefined);
      if (vals.length) {
        let lo = Math.min(...vals), hi = Math.max(...vals);
        const pad = Math.max(1, (hi - lo) * 0.15);
        lo -= pad; hi += pad;
        const Y = v => y + r.h - 3 - ((v - lo) / (hi - lo)) * (r.h - 6);
        let path = '', prev = -1e9;
        days.forEach((d, i) => {
          const v = d[r.line];
          if (v === null || v === undefined) return;
          const x = i * cw + cw / 2;
          path += `${i - prev > (r.line === 'kg' ? 21 : 3) ? 'M' : 'L'}${r1(x)} ${r1(Y(v))} `;
          prev = i;
        });
        out.push(`<path class="ws-sv-line ws-sv-${r.line}" d="${path.trim()}"/>`);
        if (r.line === 'kg' || n <= 120) days.forEach((d, i) => { const v = d[r.line]; if (v !== null && v !== undefined) out.push(`<circle class="ws-sv-dot ws-sv-${r.line}" cx="${r1(i * cw + cw / 2)}" cy="${r1(Y(v))}" r="${Math.min(2.4, Math.max(1.2, cw / 3))}"/>`); });
      }
    } else if (r.cell) {
      days.forEach((d, i) => {
        const v = d[r.cell];
        if (v === null || v === undefined) return;
        const t = r.cell === 'stress' ? Math.min(1, v / 75) : Math.min(1, Math.max(0, (100 - v) / 8));
        out.push(`<rect class="ws-sv-${r.cell}" x="${r1(i * cw)}" y="${y}" width="${r1(bw)}" height="${r.h}" fill-opacity="${r1(0.18 + t * 0.82)}"/>`);
      });
    } else if (r.dot) {
      days.forEach((d, i) => { if (d[r.dot]) out.push(`<circle class="ws-sv-${r.dot}" cx="${r1(i * cw + cw / 2)}" cy="${y + r.h / 2}" r="${Math.min(4, Math.max(1.4, cw / 2.4))}"/>`); });
    }
    r.y = y;
    y += r.h + ROW_GAP;
  }
  out.push('</svg>');
  return out.join('');
}

// week-by-week bars or a line. weeks: [{from, value}]; kind: 'bar' | 'line'
export function weekSvg(weeks, kind, cls, fmt, label, width) {
  const vals = weeks.map(w => w.value).filter(v => v !== null && v !== undefined);
  if (!vals.length) return '';
  const W = Math.max(200, Math.round(width || 600)), H = 140, L = 4, R = 4, T = 24, B = 22;
  const n = weeks.length, step = (W - L - R) / n;
  let lo = kind === 'bar' ? 0 : Math.min(...vals), hi = Math.max(...vals);
  if (kind !== 'bar') { const pad = Math.max(0.5, (hi - lo) * 0.2); lo -= pad; hi += pad; }
  if (hi === lo) hi = lo + 1;
  const Y = v => T + (H - T - B) * (1 - (v - lo) / (hi - lo));
  const parts = [`<svg class="ws-week" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}" role="img" aria-label="${esc(label)}">`];
  const maxI = weeks.reduce((b, w, i) => (w.value !== null && (b < 0 || w.value > weeks[b].value) ? i : b), -1);
  if (kind === 'bar') {
    weeks.forEach((w, i) => { if (w.value) parts.push(`<rect class="${cls}" x="${r1(L + i * step + step * 0.14)}" y="${r1(Y(w.value))}" width="${r1(step * 0.72)}" height="${r1(H - B - Y(w.value))}" rx="2"/>`); });
  } else {
    let d = '', open = false;
    weeks.forEach((w, i) => { if (w.value === null) { open = false; return; } d += `${open ? 'L' : 'M'}${r1(L + i * step + step / 2)} ${r1(Y(w.value))} `; open = true; });
    parts.push(`<path class="${cls} ws-week-line" d="${d.trim()}"/>`);
    weeks.forEach((w, i) => { if (w.value !== null) parts.push(`<circle class="${cls}" cx="${r1(L + i * step + step / 2)}" cy="${r1(Y(w.value))}" r="3.2"/>`); });
  }
  if (maxI >= 0) {
    const x = Math.min(W - 40, Math.max(L + 40, L + maxI * step + step / 2));
    parts.push(`<text class="ws-week-max" x="${r1(x)}" y="${r1(Math.max(13, Y(weeks[maxI].value) - 7))}" text-anchor="middle">${esc(fmt(weeks[maxI].value))}</text>`);
  }
  parts.push(`<line class="ws-week-axis" x1="0" x2="${W}" y1="${H - B}" y2="${H - B}"/>`);
  parts.push(`<text class="ws-week-date" x="${L}" y="${H - 5}">${esc(weeks[0].label)}</text><text class="ws-week-date" x="${W - R}" y="${H - 5}" text-anchor="end">${esc(weeks[n - 1].label)}</text>`);
  parts.push('</svg>');
  return parts.join('');
}

// an average night as one bar split by stage
export function nightBar(s, names) {
  const tot = STAGE_ORDER.reduce((a, k) => a + (s[k] || 0), 0);
  if (!tot) return '';
  let x = 0;
  const segs = STAGE_ORDER.map(k => { const w = ((s[k] || 0) / tot) * 100; const seg = `<span class="ws-nb-${k}" style="left:${r1(x)}%;width:${r1(w)}%" title="${esc(names[k])}"></span>`; x += w; return seg; });
  return `<div class="ws-nightbar" aria-hidden="true">${segs.join('')}</div>`;
}
