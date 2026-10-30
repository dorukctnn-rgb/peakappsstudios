/* Agelens' engine: reads a Discord data package (package.zip, its unzipped folder or single files from it) in this tab.
 * Nothing here touches the network.
 *
 * What a package holds (Discord's help article "Your Discord Data Package", updated September 2026):
 *   Account/user.json            your account, and since September 2026 the age signals: date_of_birth, age_assurance
 *                                (vendor, method, time, estimated_age_group), inferred_age_group and predicted_age
 *   Messages/index.json          channel id -> channel name ("Direct Message with name#0", "general in Server")
 *   Messages/c<id>/channel.json  { id, type, name, guild: { id, name }, recipients: [ids] }
 *   Messages/c<id>/messages.json [{ ID, Timestamp, Contents, Attachments }] (older packages: messages.csv, same columns)
 *   Servers/index.json           server id -> name; Servers/<id>/guild.json
 *   Activity/<kind>/events-*.json one JSON event per line; some packages carry predicted_age / predicted_gender events
 *                                with probabilities (prob_13_17 ... prob_35_over, prob_male, prob_female, ...)
 * Folder names come capitalised (2024 on), lower case (older) or in the account's language (since October 2025), so the
 * roles are found by the files inside, never by the folder name. Only messages you sent are in a package. */
import { readZip, entryBlob, entryStream, sniff, ZipError } from './zip.js';
import { parseCsv } from './csv.js';

export class PackageError extends Error {
  constructor(code, message) { super(message || code); this.code = code; }
}

const BOM = /^﻿/;
const base = p => p.slice(p.lastIndexOf('/') + 1);
const dir = p => p.slice(0, p.lastIndexOf('/') + 1);

/* ------------------------------------------------------------------ times and ids */
// "2024-03-02 18:04:11.512000+00:00", "2024-03-02 18:04:11+00:00", "2024-03-02T18:04:11.512Z", "\"2021-05-01T10:00:00.000Z\"",
// "2023-08-01 00:00:00 UTC", "2024-03-02" and plain epoch numbers. Anything without a zone is UTC. Returns ms or null.
export function parseTime(v) {
  if (v == null || v === '') return null;
  if (typeof v === 'number') return Number.isFinite(v) ? (v < 1e11 ? v * 1000 : v) : null;
  let s = String(v).trim().replace(/^"+|"+$/g, '');
  if (!s) return null;
  if (/^\d{9,13}$/.test(s)) { const n = Number(s); return n < 1e11 ? n * 1000 : n; }
  s = s.replace(/\s+UTC$/i, 'Z').replace(/^(\d{4}-\d{2}-\d{2})[ T](\d{1,2}:\d{2}(?::\d{2})?)/, (m, d, t) => `${d}T${t.length === 4 ? '0' + t : t}`);
  s = s.replace(/(\.\d{3})\d+/, '$1');
  if (/^\d{4}-\d{2}-\d{2}$/.test(s)) s += 'T00:00:00Z';
  if (/T\d{2}:\d{2}(:\d{2}(\.\d+)?)?$/.test(s)) s += 'Z';
  s = s.replace(/([+-]\d{2})(\d{2})$/, '$1:$2');
  const t = Date.parse(s);
  return Number.isFinite(t) ? t : null;
}

const DISCORD_EPOCH = 1420070400000n;
/* The time a Discord id (a "snowflake") was made: your account's creation time, from your user id. */
export function snowflakeTime(id) {
  const s = String(id ?? '').replace(/^c/, '');
  if (!/^\d{15,21}$/.test(s)) return null;
  try { return Number((BigInt(s) >> 22n) + DISCORD_EPOCH); } catch { return null; }
}

/* ------------------------------------------------------------------ the age signals */
// The values Discord's own code uses (discord-protos, users/v1/UserData.proto: AgeAssuranceGroup, AgeAssuranceMethod,
// AgeAssuranceVendor). A package may write them as numbers, as these names, or in plain words; all three are understood.
const GROUPS = ['', '13', '14', '15', '16', '17', '18-21', '22-24', '25-34', '35 or older'];
const METHODS = {
  ID_SELFIE_MATCH: 'ID photo matched to a selfie', ID_SCAN: 'ID scan', FACIAL_AGE_ESTIMATION: 'Video selfie (face age estimate)',
  BEHAVIORAL_INFERENCE: 'Estimated from how the account is used', CREDIT_CARD: 'Credit card check', EMAIL_DOMAIN: 'Email domain',
  OS_SIGNAL: 'Age range from the Apple App Store or Google Play', ML_AGE_INFERENCE: "Discord's age estimation model",
  GOOGLE_WALLET: 'Passport in Google Wallet', AGE_KEY: 'AgeKey', MANUAL_REVIEW: 'Manual review by Discord',
  OS_SIGNAL_CONFIRMED: 'Age range from the Apple App Store or Google Play, confirmed', TNS_DETERMINATION: "Discord's Trust & Safety team",
};
const METHOD_NUM = ['', 'ID_SELFIE_MATCH', 'ID_SCAN', 'FACIAL_AGE_ESTIMATION', 'BEHAVIORAL_INFERENCE', 'CREDIT_CARD', 'EMAIL_DOMAIN', 'OS_SIGNAL', 'ML_AGE_INFERENCE', 'GOOGLE_WALLET', 'AGE_KEY', 'MANUAL_REVIEW', 'OS_SIGNAL_CONFIRMED', 'TNS_DETERMINATION'];
const VENDORS = { K_ID: 'k-ID', PERSONA: 'Persona', INCODE: 'Incode', DISCORD: 'Discord itself', GOOGLE_WALLET: 'Google Wallet', APPLE_APP_STORE: 'Apple App Store', GOOGLE_PLAY: 'Google Play' };
const VENDOR_NUM = ['', 'K_ID', 'PERSONA', 'INCODE', 'DISCORD', 'GOOGLE_WALLET', 'APPLE_APP_STORE', 'GOOGLE_PLAY'];

const plainEnum = v => String(v).trim().toUpperCase().replace(/[\s-]+/g, '_').replace(/^AGE_(ASSURANCE_)?(GROUP|METHOD|VENDOR)_/, '');

/* An age group value -> { label: '25-34' | 'Teen' | 'Adult' | ..., band: 'teen' | 'adult' | 'unknown' }. */
export function ageGroup(v) {
  if (v == null || v === '') return null;
  if (typeof v === 'object') return null;
  if (typeof v === 'number' || /^\d+$/.test(String(v).trim())) {
    const n = Number(v);
    if (n >= 1 && n <= 9) return { label: GROUPS[n], band: n <= 5 ? 'teen' : 'adult', raw: String(v) };
    if (n >= 13 && n <= 17) return { label: String(n), band: 'teen', raw: String(v) };
    if (n >= 18 && n < 130) return { label: String(n), band: 'adult', raw: String(v) };
    return { label: String(v), band: 'unknown', raw: String(v) };
  }
  const e = plainEnum(v);
  if (e === 'UNSPECIFIED' || e === 'UNKNOWN' || e === 'UNCONFIRMED' || e === 'NONE' || e === 'NULL') return { label: 'Unconfirmed', band: 'unknown', raw: String(v) };
  if (/^(TEEN|TEENAGER|MINOR|UNDER_18|U18|AGE_GROUP_TEEN|13_17)$/.test(e)) return { label: 'Teen (13-17)', band: 'teen', raw: String(v) };
  if (/^(ADULT|AGE_GROUP_ADULT|18_PLUS|18PLUS|OVER_18|18_UP)$/.test(e)) return { label: 'Adult (18+)', band: 'adult', raw: String(v) };
  let m = e.match(/^(\d{2})$/);
  if (m) return ageGroup(Number(m[1]));
  m = e.match(/^(\d{2})_(\d{2})$/);
  if (m) return { label: `${m[1]}-${m[2]}`, band: Number(m[2]) <= 17 ? 'teen' : Number(m[1]) >= 18 ? 'adult' : 'unknown', raw: String(v) };
  m = e.match(/^(\d{2})_(UP|OVER|PLUS)$/);
  if (m) return { label: `${m[1]} or older`, band: Number(m[1]) >= 18 ? 'adult' : 'unknown', raw: String(v) };
  return { label: String(v), band: 'unknown', raw: String(v) };
}
export function methodLabel(v) {
  if (v == null || v === '') return '';
  const k = typeof v === 'number' || /^\d+$/.test(String(v)) ? METHOD_NUM[Number(v)] : plainEnum(v);
  return METHODS[k] || String(v);
}
export function vendorLabel(v) {
  if (v == null || v === '') return '';
  const k = typeof v === 'number' || /^\d+$/.test(String(v)) ? VENDOR_NUM[Number(v)] : plainEnum(v).replace(/^KID$/, 'K_ID');
  return VENDORS[k] || String(v);
}

/* date_of_birth: under 18 it is cut to the first of the month (MM-01-YYYY), over 18 it is replaced by 01-01-0001. */
export function birthInfo(v, now = Date.now()) {
  if (v == null || v === '') return null;
  const s = String(v).trim();
  let y, mo, d;
  let m = s.match(/^(\d{1,2})[-/.](\d{1,2})[-/.](\d{4})/);
  if (m) { mo = +m[1]; d = +m[2]; y = +m[3]; } else {
    m = s.match(/^(\d{4})-(\d{1,2})-(\d{1,2})/);
    if (!m) return { raw: s, kind: 'unknown' };
    y = +m[1]; mo = +m[2]; d = +m[3];
  }
  if (y <= 1) return { raw: s, kind: 'adult-hidden' };
  const nowD = new Date(now);
  let age = nowD.getUTCFullYear() - y;
  if (nowD.getUTCMonth() + 1 < mo || (nowD.getUTCMonth() + 1 === mo && nowD.getUTCDate() < d)) age -= 1;
  return { raw: s, kind: 'month', year: y, month: mo, age };
}

const AGE_TOKEN = /(^|_)(age|ages|birth|birthday|dob|gender|teen|adult|minor)(_|$)|age_?group|age_?assurance|age_?range|birthdate|date_of_birth|predicted_/i;
const NOT_AGE = /(^|_)(message|image|usage|page|language|storage|stage|package|percentage|average|manage|voyage|mileage|coverage)(_|$)/i;
export const isAgeKey = k => AGE_TOKEN.test(k) && !NOT_AGE.test(k.replace(/age(group|assurance|range)/i, ''));

/* Every age-related field in user.json, wherever it sits: [{ path, key, value }], value as written (objects kept). */
export function findAgeFields(obj, path = '', out = [], depth = 0) {
  if (!obj || typeof obj !== 'object' || depth > 7) return out;
  if (Array.isArray(obj)) { obj.slice(0, 200).forEach((v, i) => findAgeFields(v, `${path}[${i}]`, out, depth + 1)); return out; }
  for (const [k, v] of Object.entries(obj)) {
    const p = path ? `${path}.${k}` : k;
    if (isAgeKey(k)) out.push({ path: p, key: k, value: v });
    else if (v && typeof v === 'object') findAgeFields(v, p, out, depth + 1);
  }
  return out;
}

const PROB_AGE = [['prob_13_17', '13-17'], ['prob_18_24', '18-24'], ['prob_25_34', '25-34'], ['prob_35_over', '35 or older']];
const PROB_GENDER = [['prob_male', 'Male'], ['prob_female', 'Female'], ['prob_non_binary_gender_expansive', 'Non-binary or gender expansive']];
function probs(o, keys) {
  if (!o || typeof o !== 'object') return null;
  const out = [];
  for (const [k, label] of keys) { const n = Number(o[k]); if (o[k] != null && Number.isFinite(n)) out.push({ key: k, label, p: n }); }
  return out.length ? out : null;
}
export const topOf = list => (list && list.length ? list.reduce((a, b) => (b.p > a.p ? b : a)) : null);

/* The age signals of an account, read from user.json: { dob, attempts, inferred, estimated, predicted, gender, other }. */
export function ageSignals(user, now = Date.now()) {
  const fields = findAgeFields(user || {});
  const res = { dob: null, attempts: [], inferred: null, estimated: null, predicted: null, gender: null, other: [], fields };
  const used = new Set();
  const take = f => used.add(f.path);
  for (const f of fields) {
    const k = f.key.toLowerCase();
    if ((k === 'date_of_birth' || k === 'dob' || k === 'birthdate' || k === 'birthday') && !res.dob && typeof f.value !== 'object') { res.dob = birthInfo(f.value, now); take(f); }
  }
  // age_assurance: one attempt (an object) or several (an array); each keeps vendor, method, time and the group it gave
  for (const f of fields) {
    if (!/age_?assurance/i.test(f.key) || f.path.includes('].')) continue;
    const list = Array.isArray(f.value) ? f.value : f.value && typeof f.value === 'object' ? [f.value] : [];
    for (const a of list) {
      if (!a || typeof a !== 'object') continue;
      const when = parseTime(a.verified_at ?? a.timestamp ?? a.created_at ?? a.time ?? a.updated_at ?? a.date);
      res.attempts.push({
        vendor: vendorLabel(a.vendor ?? a.vendor_name ?? a.provider), method: methodLabel(a.method ?? a.method_type ?? a.type),
        when, group: ageGroup(a.estimated_age_group ?? a.age_group ?? a.result), inferred: ageGroup(a.inferred_age_group),
        regionalAdult: typeof a.is_regional_adult === 'boolean' ? a.is_regional_adult : null,
        cooldown: parseTime(a.cooldown_reset_at), excluded: parseTime(a.excluded_from_prediction_since), raw: a,
      });
    }
    take(f);
    for (const g of fields) if (g.path.startsWith(f.path + '.') || g.path.startsWith(f.path + '[')) take(g);
  }
  res.attempts.sort((a, b) => (a.when ?? 0) - (b.when ?? 0));
  for (const f of fields) {
    if (used.has(f.path)) continue;
    const k = f.key.toLowerCase();
    if (k === 'inferred_age_group' && !res.inferred) { res.inferred = ageGroup(f.value); take(f); }
    else if (k === 'estimated_age_group' && !res.estimated) { res.estimated = ageGroup(f.value); take(f); }
    else if (k === 'predicted_age' && !res.predicted) {
      const v = f.value;
      const p = v && typeof v === 'object' ? probs(v, PROB_AGE) : null;
      const own = v && typeof v === 'object' ? (v.predicted_age ?? v.value ?? v.age ?? v.label ?? null) : v;
      res.predicted = { value: own == null ? null : (typeof own === 'object' ? JSON.stringify(own) : String(own)), probs: p, group: ageGroup(own), day: v && typeof v === 'object' ? parseTime(v.day_pt ?? v.timestamp ?? v.date) : null };
      take(f);
      for (const g of fields) if (g.path.startsWith(f.path + '.')) take(g);
    } else if (k === 'predicted_gender' && !res.gender) {
      const v = f.value;
      const p = v && typeof v === 'object' ? probs(v, PROB_GENDER) : null;
      const own = v && typeof v === 'object' ? (v.predicted_gender ?? v.value ?? v.label ?? null) : v;
      res.gender = { value: own == null ? null : String(own), probs: p };
      take(f);
    }
  }
  // a predicted_age written as sibling probabilities (prob_13_17 ... next to predicted_age)
  if (res.predicted && !res.predicted.probs) {
    const holder = fields.find(f => f.key.toLowerCase() === 'predicted_age');
    const parentPath = holder && holder.path.includes('.') ? holder.path.slice(0, holder.path.lastIndexOf('.')) : '';
    const parent = parentPath ? parentPath.split('.').reduce((o, k) => (o ? o[k] : undefined), user) : user;
    res.predicted.probs = probs(parent, PROB_AGE);
  }
  if (!res.inferred) { const a = [...res.attempts].reverse().find(x => x.inferred); if (a) res.inferred = a.inferred; }
  if (!res.estimated) { const a = [...res.attempts].reverse().find(x => x.group); if (a) res.estimated = a.group; }
  res.other = fields.filter(f => !used.has(f.path) && !fields.some(g => g !== f && used.has(g.path) && f.path.startsWith(g.path)));
  return res;
}

/* The age group Discord most likely treats the account as, from the signals, with the reason. */
export function verdict(sig) {
  const last = [...sig.attempts].reverse().find(a => a.group && a.method && !/model|estimated from how/i.test(a.method));
  if (last) return { band: last.group.band, label: last.group.band === 'adult' ? 'Adult' : last.group.band === 'teen' ? 'Teen' : 'Unconfirmed', from: `the ${last.method.toLowerCase()} on ${last.when ? new Date(last.when).toISOString().slice(0, 10) : 'an unknown date'}` };
  if (sig.inferred) return { band: sig.inferred.band, label: sig.inferred.band === 'adult' ? 'Adult' : sig.inferred.band === 'teen' ? 'Teen' : 'Unconfirmed', from: "Discord's age estimation model (inferred_age_group)" };
  if (sig.estimated) return { band: sig.estimated.band, label: sig.estimated.band === 'adult' ? 'Adult' : sig.estimated.band === 'teen' ? 'Teen' : 'Unconfirmed', from: 'estimated_age_group' };
  return null;
}

/* ------------------------------------------------------------------ files in, records out */
// A record is one file of the package: { path, size, text(), stream() }. ZIP entries are inflated only when read.
function zipRecord(entry) {
  return {
    path: entry.name, size: entry.size, encrypted: entry.encrypted,
    text: async () => (await (await entryBlob(entry)).text()).replace(BOM, ''),
    stream: () => entryStream(entry),
  };
}
function fileRecord(file, path) {
  return { path, size: file.size, encrypted: false, text: async () => (await file.text()).replace(BOM, ''), stream: async () => file.stream() };
}
const relevant = p => /(^|\/)(user\.json|index\.json|channel\.json|messages\.(json|csv)|guild\.json|events-[^/]*\.json)$/i.test(p);

/* Reads what was chosen: ZIPs (package.zip, also a ZIP holding the package's folder), an unzipped folder or loose files.
 * Returns { records, odd: [{ name, kind }] } where kind says why a file was set aside. */
export async function collect(files) {
  const records = [];
  const odd = [];
  for (const f of files) {
    const path = String(f._path || f.webkitRelativePath || f.name || '').replace(/\\/g, '/');
    if (/\.(crdownload|part|partial|download)$/i.test(f.name || '')) { odd.push({ name: f.name, kind: 'partial' }); continue; }
    const kind = await sniff(f);
    if (kind === 'zip') {
      let z;
      // the file starts as a ZIP, so a missing end record means the download stopped early
      try { z = await readZip(f); } catch (e) { odd.push({ name: f.name, kind: e instanceof ZipError && (e.code === 'truncated' || e.code === 'not-zip') ? 'truncated' : 'damaged' }); continue; }
      const files2 = z.entries.filter(e => !e.dir && !/(^|\/)(__MACOSX\/|\._)/.test(e.name));
      const rel = files2.filter(e => relevant(e.name));
      if (!rel.length) {
        const inner = files2.filter(e => /\.zip$/i.test(e.name));
        if (inner.length) { odd.push({ name: f.name, kind: 'zip-in-zip' }); continue; }
        odd.push({ name: f.name, kind: files2.some(e => /\.csv$/i.test(e.name)) ? 'zip-csv' : files2.some(e => /\.json$/i.test(e.name)) ? 'zip-json' : 'zip-other' });
        continue;
      }
      if (rel.every(e => e.encrypted)) { odd.push({ name: f.name, kind: 'encrypted' }); continue; }
      for (const e of files2) records.push(zipRecord(e));
    } else if (kind === 'json' || kind === 'text') {
      if (relevant(path) || /\.(json|csv)$/i.test(f.name || '')) records.push(fileRecord(f, path));
      else if (/(^|\/)avatar\.|\.(png|jpe?g|gif|webp)$/i.test(path)) continue;
      else odd.push({ name: f.name, kind: kind === 'json' ? 'json' : 'text' });
    } else if (/\.(png|jpe?g|gif|webp)$/i.test(f.name || '') && path.includes('/')) {
      continue; // avatars and emoji inside a chosen folder
    } else {
      odd.push({ name: f.name, kind });
    }
  }
  return { records, odd };
}

/* ------------------------------------------------------------------ reading the package */
const CHANNEL_TYPES = { 0: 'server', 1: 'dm', 2: 'voice', 3: 'group', 4: 'category', 5: 'server', 10: 'thread', 11: 'thread', 12: 'thread', 13: 'voice', 15: 'forum', 16: 'forum' };

async function readJson(rec) {
  const t = await rec.text();
  try { return JSON.parse(t); } catch { return undefined; }
}

function splitAttachments(v) {
  if (!v) return [];
  if (Array.isArray(v)) return v.map(String).filter(Boolean);
  return String(v).split(/\s+/).filter(x => /^https?:\/\//i.test(x));
}
export function safeUrl(u) {
  const s = String(u ?? '').trim();
  return /^https:\/\/[^\s"'<>]+$/i.test(s) ? s : '';
}

function messagesFrom(rec, text) {
  const out = [];
  if (/\.csv$/i.test(rec.path)) {
    const { header, rows } = parseCsv(text);
    const h = header.map(x => x.trim().toLowerCase());
    const iId = h.indexOf('id'), iT = h.indexOf('timestamp'), iC = h.indexOf('contents'), iA = h.indexOf('attachments');
    for (const r of rows) {
      if (!r.length || (r.length === 1 && !r[0])) continue;
      out.push({ id: r[iId < 0 ? 0 : iId] || '', ts: parseTime(r[iT < 0 ? 1 : iT]), text: r[iC < 0 ? 2 : iC] ?? '', att: splitAttachments(r[iA < 0 ? 3 : iA]) });
    }
    return out;
  }
  let arr;
  try { arr = JSON.parse(text); } catch { return null; }
  if (!Array.isArray(arr)) { if (arr && Array.isArray(arr.messages)) arr = arr.messages; else return null; }
  for (const m of arr) {
    if (!m || typeof m !== 'object') continue;
    const id = m.ID ?? m.Id ?? m.id ?? '';
    const ts = parseTime(m.Timestamp ?? m.timestamp ?? m.time);
    const text2 = m.Contents ?? m.contents ?? m.content ?? '';
    out.push({ id: String(id), ts, text: typeof text2 === 'string' ? text2 : JSON.stringify(text2), att: splitAttachments(m.Attachments ?? m.attachments) });
  }
  return out;
}

/* Builds the model from the records. onProgress(text) reports what is being read. */
export async function openPackage(records, { onProgress = () => {}, now = Date.now() } = {}) {
  if (!records.length) throw new PackageError('nothing');
  const byPath = new Map(records.map(r => [r.path, r]));
  const userRec = records.find(r => /(^|\/)user\.json$/i.test(r.path));
  const channelRecs = records.filter(r => /(^|\/)c?\d{6,}\/channel\.json$/i.test(r.path));
  const msgRecs = records.filter(r => /(^|\/)c?\d{6,}\/messages\.(json|csv)$/i.test(r.path));
  const guildRecs = records.filter(r => /(^|\/)\d{6,}\/guild\.json$/i.test(r.path));
  const eventRecs = records.filter(r => /(^|\/)events-[^/]*\.json$/i.test(r.path));
  if (!userRec && !channelRecs.length && !msgRecs.length && !guildRecs.length && !eventRecs.length) {
    const loose = records.find(r => /\.json$/i.test(r.path));
    if (loose) {
      const j = await readJson(loose);
      // a lone messages.json chosen on its own, named something else
      if (Array.isArray(j) && j.length && j[0] && ('Contents' in j[0] || 'Timestamp' in j[0])) {
        return openPackage([{ ...loose, path: '0000000000/messages.json' }], { onProgress, now });
      }
    }
    throw new PackageError(records.some(r => /\.csv$/i.test(r.path)) ? 'zip-csv' : 'not-discord');
  }

  /* account */
  onProgress('Reading your account');
  let user = null;
  if (userRec) {
    if (userRec.encrypted) throw new PackageError('encrypted');
    user = await readJson(userRec);
    if (user === undefined) user = null;
  }
  const relNames = new Map();
  const friends = [];
  if (user && Array.isArray(user.relationships)) {
    for (const r of user.relationships) {
      const u = r && (r.user || r);
      if (!u || !u.id) continue;
      const name = r.nickname || u.global_name || u.username || u.id;
      relNames.set(String(u.id), name);
      friends.push({ id: String(u.id), name, username: u.username || '', type: r.type });
    }
  }
  const account = user ? {
    id: user.id ? String(user.id) : '', username: user.username || '', globalName: user.global_name || '',
    discriminator: user.discriminator && user.discriminator !== '0' ? String(user.discriminator) : '',
    created: snowflakeTime(user.id), hasEmail: !!user.email, verified: user.verified === true,
    connections: Array.isArray(user.connections) ? user.connections.map(c => ({ type: c.type || '', name: c.name || '', visible: c.visibility === 1 || c.visibility === true })) : [],
    sessions: Array.isArray(user.sessions) ? user.sessions.length : null,
    friends: friends.filter(f => f.type === 1 || f.type === undefined).length, blocked: friends.filter(f => f.type === 2).length,
    notes: user.notes && typeof user.notes === 'object' ? Object.keys(user.notes).length : 0,
    payments: Array.isArray(user.payments) ? user.payments.length : null,
  } : null;
  const age = ageSignals(user, now);

  /* messages */
  const roots = new Set([...channelRecs, ...msgRecs].map(r => dir(dir(r.path).slice(0, -1))));
  const index = {};
  for (const root of roots) {
    const ix = byPath.get(root + 'index.json');
    if (ix) { const j = await readJson(ix); if (j && typeof j === 'object' && !Array.isArray(j)) Object.assign(index, j); }
  }
  const folders = new Map();
  for (const r of [...channelRecs, ...msgRecs]) {
    const d = dir(r.path);
    if (!folders.has(d)) folders.set(d, { channel: null, msgs: null });
    const slot = folders.get(d);
    if (/channel\.json$/i.test(r.path)) slot.channel = r;
    else if (!slot.msgs || /\.json$/i.test(r.path)) slot.msgs = r;
  }
  const me = account && account.id;
  const convs = [];
  let n = 0;
  let total = 0;
  let bad = 0;
  for (const [d, slot] of folders) {
    n += 1;
    if (n % 25 === 0) onProgress(`Reading conversations: ${n} of ${folders.size}`);
    const folderId = base(d.slice(0, -1)).replace(/^c/i, '');
    const ch = slot.channel ? (await readJson(slot.channel)) || {} : {};
    const id = String(ch.id || folderId);
    const type = CHANNEL_TYPES[ch.type] || (ch.guild ? 'server' : ch.recipients ? (ch.recipients.length > 2 ? 'group' : 'dm') : 'other');
    const indexName = index[id] ?? index[folderId] ?? null;
    const people = Array.isArray(ch.recipients) ? ch.recipients.map(String).filter(x => x !== me) : [];
    const peopleNames = people.map(p => relNames.get(p) || (p === 'Deleted User' ? 'Deleted user' : p));
    let title = '';
    let server = ch.guild && ch.guild.name ? String(ch.guild.name) : '';
    if (type === 'dm') {
      const m = typeof indexName === 'string' && indexName.match(/^Direct Message with (.+?)(#\d{1,4})?$/);
      title = m ? m[1] : peopleNames[0] || 'Direct message';
    } else if (type === 'group') {
      title = ch.name || (typeof indexName === 'string' && indexName !== 'None' ? indexName : '') || (peopleNames.length ? peopleNames.slice(0, 3).join(', ') + (peopleNames.length > 3 ? ` and ${peopleNames.length - 3} more` : '') : 'Group message');
    } else {
      const m = typeof indexName === 'string' && indexName.match(/^(.*) in (.+)$/);
      const chName = ch.name || (m ? m[1] : indexName) || `channel ${id}`;
      if (!server && m) server = m[2];
      title = `#${String(chName).replace(/^#/, '')}`;
    }
    let items = [];
    if (slot.msgs) {
      if (slot.msgs.encrypted) { bad += 1; continue; }
      const text = await slot.msgs.text();
      const parsed = messagesFrom(slot.msgs, text);
      if (parsed == null) { bad += 1; } else items = parsed;
    }
    items.sort((a, b) => (a.ts ?? 0) - (b.ts ?? 0) || (a.id < b.id ? -1 : a.id > b.id ? 1 : 0));
    total += items.length;
    const kind = type === 'dm' || type === 'group' ? type : server || ch.guild || ['server', 'thread', 'voice', 'forum', 'category'].includes(type) ? 'server' : 'other';
    convs.push({
      id, kind, sub: type, title, server, people: peopleNames, items, count: items.length,
      first: items.length ? items[0].ts : null, last: items.length ? items[items.length - 1].ts : null,
      attachments: items.reduce((k, m) => k + m.att.length, 0),
    });
  }
  convs.sort((a, b) => (b.last ?? 0) - (a.last ?? 0) || b.count - a.count);

  /* servers */
  onProgress('Reading your servers');
  const servers = [];
  const sroots = new Set(guildRecs.map(r => dir(dir(r.path).slice(0, -1))));
  const sindex = {};
  for (const root of sroots) { const ix = byPath.get(root + 'index.json'); if (ix) { const j = await readJson(ix); if (j && typeof j === 'object' && !Array.isArray(j)) Object.assign(sindex, j); } }
  if (!sroots.size) {
    const ix = records.find(r => /(^|\/)[^/]+\/index\.json$/i.test(r.path) && !roots.has(dir(r.path)));
    if (ix) { const j = await readJson(ix); if (j && typeof j === 'object' && !Array.isArray(j) && Object.keys(j).every(k => /^\d{6,}$/.test(k))) Object.assign(sindex, j); }
  }
  const seen = new Set();
  for (const r of guildRecs) {
    const g = (await readJson(r)) || {};
    const id = String(g.id || base(dir(r.path).slice(0, -1)));
    seen.add(id);
    servers.push({ id, name: g.name || sindex[id] || `Server ${id}`, joined: snowflakeTime(id), owned: !!(me && g.owner_id && String(g.owner_id) === me) });
  }
  for (const [id, name] of Object.entries(sindex)) if (!seen.has(id)) servers.push({ id, name: String(name ?? `Server ${id}`), joined: snowflakeTime(id), owned: false });
  const msgPerServer = new Map();
  for (const c of convs) if (c.server) msgPerServer.set(c.server, (msgPerServer.get(c.server) || 0) + c.count);
  for (const s of servers) s.messages = msgPerServer.get(s.name) || 0;
  servers.sort((a, b) => b.messages - a.messages || a.name.localeCompare(b.name));

  /* the year table */
  const years = new Map();
  for (const c of convs) for (const m of c.items) if (m.ts != null) { const y = new Date(m.ts).getUTCFullYear(); years.set(y, (years.get(y) || 0) + 1); }

  // the package's top folders, with how many files each holds (a ZIP of the package folder has one more level on top)
  const parts = records.map(r => r.path.split('/').filter(Boolean));
  const wrapped = parts.length && parts.every(p => p.length > 2 && p[0] === parts[0][0]) && !relevantTop(parts[0][0]);
  const folderCount = new Map();
  for (const p of parts) { const top = p.length > (wrapped ? 2 : 1) ? p[wrapped ? 1 : 0] : '(top level)'; folderCount.set(top, (folderCount.get(top) || 0) + 1); }
  const folderNames = [...folderCount.entries()].sort((a, b) => b[1] - a[1]).slice(0, 14);
  return {
    account, user: !!user, age, convs, servers, events: eventRecs, eventBytes: eventRecs.reduce((k, r) => k + (r.size || 0), 0),
    counts: { messages: total, conversations: convs.length, dms: convs.filter(c => c.kind === 'dm').length, groups: convs.filter(c => c.kind === 'group').length, channels: convs.filter(c => c.kind === 'server').length, servers: servers.length, attachments: convs.reduce((k, c) => k + c.attachments, 0), unreadable: bad, files: records.length },
    years: [...years.entries()].sort((a, b) => a[0] - b[0]),
    hasMessages: folders.size > 0, folderNames,
  };
}
const relevantTop = s => /^(account|activity|activities|messages|servers|ads|support_tickets|programs)$/i.test(s);

/* ------------------------------------------------------------------ the activity files */
/* Scans the activity files for predicted_age and predicted_gender events, line by line as the file inflates, so a
 * multi-gigabyte package costs little memory. Only lines holding "predicted_" are parsed. Returns { age: [{ day, probs,
 * value }], gender: [...], files, bytes, lines }. signal: an AbortSignal; onProgress(doneBytes, totalBytes). */
export async function scanEvents(eventRecs, { onProgress = () => {}, signal } = {}) {
  const res = { age: [], gender: [], files: eventRecs.length, bytes: 0, lines: 0, stopped: false };
  const total = eventRecs.reduce((k, r) => k + (r.size || 0), 0);
  const seenAge = new Set(), seenGender = new Set();
  for (const rec of eventRecs) {
    if (signal && signal.aborted) { res.stopped = true; break; }
    let stream;
    try { stream = await rec.stream(); } catch { continue; }
    const reader = stream.getReader();
    const dec = new TextDecoder('utf-8');
    let rest = '';
    const line = l => {
      if (!l.includes('predicted_')) return;
      let j;
      try { j = JSON.parse(l.replace(BOM, '')); } catch { return; }
      const day = parseTime(j.day_pt ?? j.timestamp ?? j.client_send_timestamp);
      if (j.predicted_age != null || j.prob_13_17 != null) {
        const p = probs(j, PROB_AGE);
        const key = `${day}|${p ? p.map(x => x.p).join(',') : j.predicted_age}`;
        if (!seenAge.has(key)) { seenAge.add(key); res.age.push({ day, value: j.predicted_age == null ? null : String(j.predicted_age), probs: p }); }
      }
      if (j.predicted_gender != null || j.prob_male != null) {
        const p = probs(j, PROB_GENDER);
        const key = `${day}|${p ? p.map(x => x.p).join(',') : j.predicted_gender}`;
        if (!seenGender.has(key)) { seenGender.add(key); res.gender.push({ day, value: j.predicted_gender == null ? null : String(j.predicted_gender), probs: p }); }
      }
    };
    let fileBytes = 0;
    for (;;) {
      if (signal && signal.aborted) { res.stopped = true; try { await reader.cancel(); } catch { /* ignore */ } break; }
      let r;
      try { r = await reader.read(); } catch { break; }
      if (r.done) break;
      fileBytes += r.value.length;
      const chunk = rest + dec.decode(r.value, { stream: true });
      const cut = chunk.lastIndexOf('\n');
      if (cut < 0) { rest = chunk; continue; }
      const body = chunk.slice(0, cut);
      rest = chunk.slice(cut + 1);
      if (body.includes('predicted_')) for (const l of body.split('\n')) line(l);
      res.lines += countLines(body);
      onProgress(res.bytes + Math.min(fileBytes, rec.size || fileBytes), total);
    }
    rest += dec.decode();
    if (rest) { line(rest); res.lines += 1; }
    res.bytes += rec.size || fileBytes;
    onProgress(res.bytes, total);
  }
  res.age.sort((a, b) => (a.day ?? 0) - (b.day ?? 0));
  res.gender.sort((a, b) => (a.day ?? 0) - (b.day ?? 0));
  return res;
}
function countLines(s) { let n = 1, i = -1; while ((i = s.indexOf('\n', i + 1)) !== -1) n += 1; return n; }

/* ------------------------------------------------------------------ search */
export function matchConv(c, term) {
  if (!term) return c.items.length;
  const t = term.toLowerCase();
  let n = 0;
  for (const m of c.items) if (m.text.toLowerCase().includes(t)) n += 1;
  if (!n && (c.title.toLowerCase().includes(t) || c.server.toLowerCase().includes(t))) return -1;
  return n;
}
