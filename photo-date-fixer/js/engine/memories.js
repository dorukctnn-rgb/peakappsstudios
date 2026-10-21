// Reads Snapchat's memories list from memories_history.json or memories_history.html. The format changes from time to
// time, so the parser looks for the meaning of each field instead of fixed positions: a "YYYY-MM-DD HH:MM:SS" time
// (UTC), a media type, an optional "Latitude, Longitude: a, b" location and an optional download link with an id.

const DATE_RE = /(\d{4})-(\d{2})-(\d{2})[ T](\d{2}):(\d{2}):(\d{2})(?:\.\d+)?\s*(UTC|GMT|Z|[+-]\d{2}:?\d{2})?/;
const LOC_RE = /(-?\d{1,3}(?:\.\d+)?)\s*,\s*(-?\d{1,3}(?:\.\d+)?)/;

export function parseUtc(text) {
  const m = DATE_RE.exec(String(text ?? ''));
  if (!m) return null;
  let ms = Date.UTC(+m[1], +m[2] - 1, +m[3], +m[4], +m[5], +m[6]);
  const z = m[7];
  if (z && /^[+-]/.test(z)) {
    const sign = z[0] === '-' ? -1 : 1;
    const hh = +z.slice(1, 3);
    const mm = +z.replace(':', '').slice(3, 5);
    ms -= sign * (hh * 60 + mm) * 60000;
  }
  return Number.isFinite(ms) ? ms : null;
}

export function parseLocation(text) {
  if (text == null) return null;
  const s = String(text);
  const m = LOC_RE.exec(s.includes(':') ? s.slice(s.lastIndexOf(':') + 1) : s);
  if (!m) return null;
  const lat = Number(m[1]);
  const lon = Number(m[2]);
  if (!Number.isFinite(lat) || !Number.isFinite(lon)) return null;
  if (Math.abs(lat) > 90 || Math.abs(lon) > 180) return null;
  if (Math.abs(lat) < 1e-6 && Math.abs(lon) < 1e-6) return null;
  return { lat, lon };
}

export function mediaType(text) {
  return /video|mp4|mov/i.test(String(text ?? '')) ? 'Video' : 'Image';
}

function idFromLink(link) {
  const s = String(link ?? '');
  const m = /[?&](?:mid|media_id|memory_id)=([^&#"'\s]+)/i.exec(s);
  return m ? decodeURIComponent(m[1]).toLowerCase() : null;
}

function pick(obj, re) {
  for (const k of Object.keys(obj)) if (re.test(k)) return obj[k];
  return undefined;
}

function normalize(rows) {
  const out = [];
  for (const r of rows) {
    const utcMs = parseUtc(r.date);
    if (utcMs == null) continue;
    out.push({ i: out.length, utcMs, type: mediaType(r.type), loc: r.loc ?? null, mid: r.mid ?? null, dateText: r.dateText ?? null });
  }
  return out;
}

export function parseMemoriesJson(text) {
  const data = JSON.parse(String(text).replace(/^﻿/, ''));
  const rows = [];
  const visit = (v, depth) => {
    if (depth > 3 || v == null) return;
    if (Array.isArray(v)) {
      for (const it of v) {
        if (it && typeof it === 'object' && !Array.isArray(it)) {
          const date = pick(it, /^date$|date|time/i);
          if (typeof date === 'string' && DATE_RE.test(date)) {
            const type = pick(it, /media.?type|^type$/i);
            let loc = parseLocation(pick(it, /^location$/i));
            if (!loc) {
              const lat = pick(it, /^lat(itude)?$/i);
              const lon = pick(it, /^lon(gitude)?$|^lng$/i);
              if (lat != null && lon != null) loc = parseLocation(`${lat}, ${lon}`);
            }
            const link = pick(it, /download.?link|media.?download.?url|url/i);
            rows.push({ date, dateText: date, type, loc, mid: idFromLink(link) });
          } else visit(it, depth + 1);
        }
      }
      return;
    }
    if (typeof v === 'object') for (const k of Object.keys(v)) visit(v[k], depth + 1);
  };
  visit(data, 0);
  return normalize(rows);
}

export function parseMemoriesHtml(text) {
  const rows = [];
  const html = String(text);
  const trRe = /<tr\b[^>]*>([\s\S]*?)<\/tr>/gi;
  let m;
  while ((m = trRe.exec(html))) {
    const cells = [...m[1].matchAll(/<t[dh]\b[^>]*>([\s\S]*?)<\/t[dh]>/gi)].map((c) => c[1]);
    if (!cells.length) continue;
    const plain = cells.map((c) => c.replace(/<[^>]+>/g, ' ').replace(/&nbsp;/g, ' ').replace(/\s+/g, ' ').trim());
    const di = plain.findIndex((c) => DATE_RE.test(c));
    if (di < 0) continue;
    const typeCell = plain.find((c, i) => i !== di && /^(image|video|photo|picture)$/i.test(c)) ?? plain.find((c) => /image|video|photo/i.test(c)) ?? 'Image';
    const locCell = plain.find((c) => /latitude|longitude/i.test(c));
    const linkMatch = /(https?:\/\/[^'"\s<>]+)/.exec(m[1]);
    rows.push({ date: plain[di], dateText: plain[di], type: typeCell, loc: locCell ? parseLocation(locCell) : null, mid: idFromLink(linkMatch?.[1]) });
  }
  return normalize(rows);
}

export function parseMemoriesList(name, text) {
  if (/\.json$/i.test(name)) return parseMemoriesJson(text);
  return parseMemoriesHtml(text);
}
