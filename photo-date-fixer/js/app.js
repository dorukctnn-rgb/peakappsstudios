// Page script: drop zone, readouts, review, progress and saving. All file work happens in worker.js.
// This script makes no network requests; the security policy in the page would block them anyway: its connect-src names only
// cloudflareinsights.com, where the visit counter (Cloudflare Web Analytics, added by the site build) reports.
import { setSegments } from './segments.js';
import { deviceZone, zoneList } from './engine/zones.js';
import { fill, humanSize, pickForm } from './format.js';

const T = JSON.parse(document.getElementById('i18n')?.textContent ?? '{}');
const LOCALE = document.documentElement.lang || 'en';
const UNITS = String(T.units ?? 'B KB MB GB TB').split(/\s+/);
// t(key, vars): plural entries pick their form from vars.n (or vars.total)
const t = (k, vars = {}) => fill(pickForm(T[k] ?? k, Number(vars.count ?? vars.n ?? 0), LOCALE) ?? k, vars);
const $ = (id) => document.getElementById(id);
const fmtInt = (n) => {
  try {
    return new Intl.NumberFormat(LOCALE).format(n);
  } catch {
    return String(n);
  }
};
const size = (b) => humanSize(b, LOCALE, UNITS);

const el = {
  panel: $('tool-panel'),
  sent: $('ro-sent'),
  files: $('ro-files'),
  parts: $('ro-parts'),
  lamp: $('offline-lamp'),
  offline: $('offline-text'),
  finder: $('finder'),
  input: $('file-input'),
  choose: $('btn-choose'),
  sample: $('btn-sample'),
  err: $('tool-error'),
  stages: { idle: $('stage-idle'), scan: $('stage-scan'), review: $('stage-review'), work: $('stage-work'), done: $('stage-done') },
};
if (!el.panel) throw new Error('tool markup missing');

// readouts: segment digits are decorative (aria-hidden); the element carries the spoken value
function readout(node, value, cells, unit, label) {
  if (!node) return;
  setSegments(node, value, cells, unit);
  node.setAttribute('aria-label', label);
}
const showFiles = (n) => readout(el.files, n, 5, '', t('readout.srFiles', { n: fmtInt(n) }));
const showParts = (n) => readout(el.parts, n, 2, '', t('readout.srParts', { n: fmtInt(n) }));

// ------------------------------------------------------------------ outgoing-request counter
// Counts every resource the page requests after files are added (fetches, beacons, images, scripts). Expected: 0.
// No request means no byte of your files can leave. If anything is ever requested, the readout switches to the request
// count and turns into a warning instead of claiming a byte figure it cannot measure.
// Left out: blob: and data: addresses (they need no request) and the visit counter's two addresses, its script and the
// small report it sends when the page loads and when you leave it. That is the only exception, and the security policy
// of the page lets no other address through.
let watchFrom = null;
let requestCount = 0;
const NOT_COUNTED = /^(?:(?:blob|data):|https:\/\/(?:static\.)?cloudflareinsights\.com\/)/;
function renderCounters() {
  if (requestCount === 0) readout(el.sent, 0, 5, UNITS[0], t('readout.srSent', { n: 0 }));
  else readout(el.sent, requestCount, 5, t('readout.unitReq'), t('readout.srReqs', { n: fmtInt(requestCount) }));
  el.sent?.closest('.pdf-readout')?.classList.toggle('alert', requestCount > 0);
}
if ('PerformanceObserver' in window) {
  try {
    new PerformanceObserver((list) => {
      if (watchFrom == null) return;
      for (const e of list.getEntries()) if (e.startTime >= watchFrom && !NOT_COUNTED.test(e.name)) requestCount++;
      renderCounters();
    }).observe({ type: 'resource', buffered: false });
  } catch {
    /* observer unsupported: the policy still blocks connections */
  }
}
function startWatching() {
  if (watchFrom == null) watchFrom = performance.now();
  renderCounters();
}

// ------------------------------------------------------------------ offline readiness
function setOffline(state) {
  el.lamp?.classList.toggle('on', state === 'ready' || state === 'now');
  if (el.offline) el.offline.textContent = t(state === 'ready' ? 'offline.ready' : state === 'now' ? 'offline.now' : state === 'none' ? 'offline.unsupported' : 'offline.pending');
}
// Each tool page has its own service worker in its own folder (data-sw), so it controls that folder only and no other
// page of peakappsstudio.com.
const SW = el.panel.dataset.sw;
if (SW && 'serviceWorker' in navigator && window.isSecureContext) {
  setOffline('pending');
  navigator.serviceWorker
    .register(SW, { scope: el.panel.dataset.swScope || SW.replace(/[^/]*$/, '') })
    .then(() => navigator.serviceWorker.ready)
    .then(() => setOffline(navigator.onLine ? 'ready' : 'now'))
    .catch(() => setOffline('none'));
} else setOffline('none');
window.addEventListener('offline', () => setOffline('now'));
window.addEventListener('online', () => setOffline(navigator.serviceWorker?.controller ? 'ready' : 'pending'));

// ------------------------------------------------------------------ worker
let worker = null;
function getWorker() {
  if (worker) return worker;
  worker = new Worker(new URL('./worker.js', import.meta.url), { type: 'module' });
  worker.onmessage = (ev) => onWorker(ev.data);
  worker.onerror = (ev) => {
    ev.preventDefault?.();
    showError(t('err.unsupported'));
    show('idle');
  };
  return worker;
}

// ------------------------------------------------------------------ stages
let current = 'idle';
function show(name) {
  current = name;
  // a stage that is not showing is hidden and also marked aria-hidden: its buttons are not reachable until its turn comes
  for (const [k, node] of Object.entries(el.stages)) {
    if (!node) continue;
    node.hidden = k !== name;
    if (k === name) node.removeAttribute('aria-hidden');
    else node.setAttribute('aria-hidden', 'true');
  }
  el.panel.dataset.state = name;
}
function focusStage(name) {
  const h = el.stages[name]?.querySelector('[data-stage-title]');
  if (h) h.focus({ preventScroll: true });
}
function showError(msg) {
  el.err.textContent = msg;
  el.err.hidden = !msg;
}
function meter(node, frac) {
  if (!node) return;
  const f = Math.max(0, Math.min(1, frac));
  const n = node.children.length;
  const lit = Math.round(f * n);
  [...node.children].forEach((c, i) => c.classList.toggle('on', i < lit));
  node.setAttribute('aria-valuenow', String(Math.round(f * 100)));
}

// ------------------------------------------------------------------ input
function filesFromList(list) {
  return [...(list ?? [])].filter((f) => f && f.size >= 0);
}
function addFiles(files) {
  showError('');
  if (!files.length) return;
  startWatching();
  objectUrls.forEach((u) => URL.revokeObjectURL(u));
  objectUrls = [];
  show('scan');
  $('scan-title').textContent = t('scan.reading', { n: fmtInt(files.length), count: files.length });
  $('scan-sub').textContent = '';
  meter($('scan-meter'), 0.05);
  focusStage('scan');
  getWorker().postMessage({ type: 'scan', files, fallbackTz: deviceZone() });
}

el.choose?.addEventListener('click', () => el.input.click());
el.input?.addEventListener('change', () => {
  addFiles(filesFromList(el.input.files));
  el.input.value = '';
});
el.sample?.addEventListener('click', async () => {
  el.sample.disabled = true;
  // answer the tap at once: building the sample takes a moment (module load, two ZIPs), and the panel must not sit still meanwhile
  showError('');
  show('scan');
  $('scan-title').textContent = t('scan.sample');
  $('scan-sub').textContent = '';
  meter($('scan-meter'), 0.03);
  focusStage('scan');
  try {
    const { buildSampleExport } = await import('./sample.js');
    addFiles(await buildSampleExport({ name: (n) => t('sample.name', { n }), caption: t('sample.caption') }));
  } catch (e) {
    showError(t('err.generic', { message: e?.message ?? String(e) }));
    show('idle');
  } finally {
    el.sample.disabled = false;
  }
});
for (const target of [el.finder, document.body]) {
  target?.addEventListener('dragover', (e) => {
    if (current !== 'idle' || !e.dataTransfer?.types?.includes('Files')) return;
    e.preventDefault();
    e.dataTransfer.dropEffect = 'copy';
    el.finder.classList.add('drag');
  });
}
el.finder?.addEventListener('dragleave', (e) => {
  if (!el.finder.contains(e.relatedTarget)) el.finder.classList.remove('drag');
});
document.body.addEventListener('drop', (e) => {
  if (current !== 'idle' || !e.dataTransfer?.files?.length) return;
  e.preventDefault();
  el.finder.classList.remove('drag');
  addFiles(filesFromList(e.dataTransfer.files));
});

// ------------------------------------------------------------------ review
let lastScan = null;
let objectUrls = [];
const TAGS = { exact: 'match.exact', ambiguous: 'match.ambiguous', zipTime: 'match.zipTime', nameDate: 'match.nameDate', unknown: 'match.unknown' };
const tagText = (s) => t(TAGS[s] ?? 'match.unknown');
const zoneName = (tz) => (tz ? tz.split('/').pop().replace(/_/g, ' ') : '');
const dateText = (wall, offset, tz) => (wall ? `${wall.slice(0, 16)} ${offset ?? ''}${tz ? ` (${zoneName(tz)})` : ''}` : '');
const placeText = (loc) => (loc ? `${Math.abs(loc.lat).toFixed(4)} ${loc.lat >= 0 ? 'N' : 'S'}, ${Math.abs(loc.lon).toFixed(4)} ${loc.lon >= 0 ? 'E' : 'W'}` : t('review.noPlace'));

function fillReview(m) {
  lastScan = m;
  const s = m.summary;
  showFiles(s.photos + s.videos);
  const counts = [
    ['review.photos', s.photos, 'photos'],
    ['review.videos', s.videos, 'videos'],
    ['review.exact', s.exact, 'exact'],
    ['review.ambiguous', s.ambiguous, 'ambiguous'],
    ['review.noRecord', s.zipTime + s.nameDate + s.unknown, 'no-record'],
    ['review.noMedia', s.noMedia, 'no-media'],
  ];
  const ul = $('review-counts');
  ul.replaceChildren(
    ...counts.map(([k, v, id]) => {
      const li = document.createElement('li');
      li.dataset.count = id;
      const b = document.createElement('b');
      b.textContent = fmtInt(v);
      li.append(b, document.createTextNode(t(k)));
      return li;
    }),
  );
  const tbody = $('preview-body');
  tbody.replaceChildren(
    ...m.preview.map((r) => {
      const tr = document.createElement('tr');
      const td = (label, ...nodes) => {
        const c = document.createElement('td');
        c.dataset.label = label;
        c.append(...nodes);
        return c;
      };
      const fileCell = document.createElement('div');
      fileCell.className = 'pdf-file';
      if (r.thumb) {
        const url = URL.createObjectURL(new Blob([r.thumb], { type: r.mime }));
        objectUrls.push(url);
        const img = document.createElement('img');
        img.src = url;
        img.alt = '';
        img.className = 'pdf-thumb';
        img.width = 44;
        img.height = 44;
        fileCell.append(img);
      }
      const nameSpan = document.createElement('span');
      nameSpan.textContent = r.name.split('/').pop();
      fileCell.append(nameSpan);
      const tag = document.createElement('span');
      tag.className = `pdf-tag ${r.status}`;
      tag.textContent = tagText(r.status);
      tr.append(
        td(t('review.colFile'), fileCell),
        td(t('review.colUtc'), document.createTextNode(r.utc ? `${r.utc.slice(0, 16)} UTC` : '')),
        td(t('review.colLocal'), document.createTextNode(dateText(r.local, r.offset, r.tz))),
        td(t('review.colPlace'), document.createTextNode(placeText(r.loc))),
        td(t('review.colMatch'), tag),
      );
      return tr;
    }),
  );
  // fallback time zone picker (filled once)
  const sel = $('tz-select');
  if (!sel.options.length) {
    const dev = deviceZone();
    const first = document.createElement('option');
    first.value = dev;
    first.textContent = t('review.tzDevice', { tz: dev.replace(/_/g, ' ') });
    sel.append(first);
    for (const z of zoneList()) {
      if (z === dev) continue;
      const o = document.createElement('option');
      o.value = z;
      o.textContent = z.replace(/_/g, ' ');
      sel.append(o);
    }
  }
  $('storage-needed').textContent = t('review.storageNeeded', { size: size(Math.round(s.bytes * 1.02)) });
  // caption and sticker layers: offered only when some photos have one and this browser can draw in the worker; off by default
  const layered = s.layeredPhotos ?? 0;
  const canDraw = typeof OffscreenCanvas === 'function' && typeof OffscreenCanvas.prototype.convertToBlob === 'function' && typeof createImageBitmap === 'function';
  $('layers-field').hidden = !(layered > 0 && canDraw);
  $('layers-check').checked = false;
  $('layers-note').textContent = t('review.layersNote', { n: fmtInt(layered), count: layered });
  const folderOk = typeof window.showDirectoryPicker === 'function';
  $('dest-field').hidden = !folderOk;
  const folderRadio = document.querySelector('input[name="dest"][value="folder"]');
  const browserRadio = document.querySelector('input[name="dest"][value="browser"]');
  if (folderRadio && browserRadio) (folderOk ? folderRadio : browserRadio).checked = true;
  show('review');
  focusStage('review');
}

$('tz-select')?.addEventListener('change', (e) => getWorker().postMessage({ type: 'replan', fallbackTz: e.target.value }));
$('btn-cancel-review')?.addEventListener('click', () => resetAll());

$('btn-start')?.addEventListener('click', async () => {
  showError('');
  const destRadio = document.querySelector('input[name="dest"]:checked');
  const folderOk = typeof window.showDirectoryPicker === 'function';
  const dest = folderOk && destRadio?.value === 'folder' ? 'folder' : 'opfs';
  let dirHandle = null;
  if (dest === 'folder') {
    try {
      dirHandle = await window.showDirectoryPicker({ id: 'photo-date-fixer', mode: 'readwrite' });
    } catch {
      return;
    }
  }
  if (dest === 'opfs' && navigator.storage?.estimate) {
    try {
      const { quota, usage } = await navigator.storage.estimate();
      const need = (lastScan?.summary.bytes ?? 0) * 1.02;
      if (quota && need && quota - usage < need) {
        showError(t('err.storage', { size: size(need - (quota - usage)) }));
        return;
      }
    } catch {
      /* estimate unavailable */
    }
  }
  show('work');
  const total = lastScan.summary.photos + lastScan.summary.videos;
  $('work-progress').textContent = t('work.progress', { done: 0, total: fmtInt(total), count: total });
  $('work-part').textContent = t('work.part', { n: 1 });
  meter($('work-meter'), 0);
  showParts(0);
  focusStage('work');
  const drawLayers = !$('layers-field').hidden && $('layers-check').checked;
  getWorker().postMessage({ type: 'run', fallbackTz: $('tz-select').value, partMB: Number($('part-select').value), dest, dirHandle, drawLayers });
});
$('btn-stop')?.addEventListener('click', () => getWorker().postMessage({ type: 'cancel' }));

// ------------------------------------------------------------------ results
let lastReport = null;

async function partFile(p) {
  if (p.blob) return p.blob;
  const root = await navigator.storage.getDirectory();
  const dir = await root.getDirectoryHandle('photo-date-fixer');
  return (await dir.getFileHandle(p.name)).getFile();
}
function saveBlob(blob, name) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = name;
  a.rel = 'noopener';
  a.hidden = true;
  document.body.append(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 120000);
}

function fillDone(m) {
  lastReport = m.report;
  showParts(m.parts.length);
  const list = $('parts-list');
  list.replaceChildren();
  if (m.mode === 'folder') {
    const li = document.createElement('li');
    li.textContent = t('done.folderSaved', { n: fmtInt(m.parts.length), count: m.parts.length });
    list.append(li);
  } else {
    for (const p of m.parts) {
      const li = document.createElement('li');
      const name = document.createElement('span');
      name.textContent = p.name;
      const b = document.createElement('button');
      b.type = 'button';
      b.className = 'pdf-btn pdf-btn-primary';
      b.dataset.part = String(p.n);
      b.textContent = t('done.savePart', { n: p.n, size: size(p.size) });
      b.addEventListener('click', async () => {
        try {
          saveBlob(await partFile(p), p.name);
          b.textContent = t('done.saved');
          b.classList.replace('pdf-btn-primary', 'pdf-btn-quiet');
        } catch (e) {
          showError(t('err.generic', { message: e?.message ?? String(e) }));
        }
      });
      li.append(name, b);
      list.append(li);
    }
  }
  const clear = $('btn-clear');
  clear.hidden = m.mode !== 'opfs';
  clear.disabled = false;
  clear.textContent = t('done.clear');
  show('done');
  focusStage('done');
}

$('btn-report')?.addEventListener('click', () => {
  if (lastReport) saveBlob(new Blob([lastReport], { type: 'text/csv;charset=utf-8' }), 'photo-date-fixer-report.csv');
});
$('btn-clear')?.addEventListener('click', () => getWorker().postMessage({ type: 'clear' }));
$('btn-again')?.addEventListener('click', () => resetAll());

function resetAll() {
  showError('');
  lastScan = null;
  showFiles(0);
  showParts(0);
  show('idle');
  el.choose?.focus();
}

function onWorker(m) {
  if (m.type === 'net') {
    // requests made by the processing worker itself (it reports them; expected: none)
    if (watchFrom != null) requestCount += Number(m.n) || 0;
    renderCounters();
  } else if (m.type === 'scanProgress') {
    if (m.phase === 'matching') {
      $('scan-sub').textContent = t('scan.calibrating');
      meter($('scan-meter'), 0.8);
    } else {
      $('scan-sub').textContent = t('scan.progress', { done: fmtInt(m.done), total: fmtInt(m.total) });
      meter($('scan-meter'), 0.1 + 0.6 * (m.done / Math.max(1, m.total)));
    }
  } else if (m.type === 'scanned') fillReview(m);
  else if (m.type === 'replanned' && lastScan) lastScan.summary = m.summary;
  else if (m.type === 'progress') {
    $('work-progress').textContent = t('work.progress', { done: fmtInt(m.done), total: fmtInt(m.total), count: m.total });
    $('work-part').textContent = t('work.part', { n: m.part });
    meter($('work-meter'), m.done / Math.max(1, m.total));
  } else if (m.type === 'partDone') showParts(m.part.n);
  else if (m.type === 'done') fillDone(m);
  else if (m.type === 'cleared') {
    const b = $('btn-clear');
    b.textContent = t('done.cleared');
    b.disabled = true;
    for (const btn of $('parts-list').querySelectorAll('button')) btn.disabled = true;
  } else if (m.type === 'error') {
    const msg =
      m.code === 'noZip'
        ? t('err.noZip', { name: m.name ?? '' })
        : m.code === 'noList'
          ? t('err.noList')
          : m.code === 'noMedia'
            ? t('err.noMedia', { n: fmtInt(m.count ?? 0), count: m.count ?? 0 })
            : m.code === 'read' || m.code === 'corrupt'
              ? t('err.read', { name: m.name ?? '' })
              : m.code === 'storage'
                ? t('err.storage', { size: size(lastScan?.summary.bytes ?? 0) })
                : m.code === 'stopped'
                  ? t('err.stopped')
                  : t('err.generic', { message: m.message ?? '' });
    showError(msg);
    show(lastScan && (m.code === 'storage' || m.code === 'stopped') ? 'review' : 'idle');
  }
}

renderCounters();
showFiles(0);
showParts(0);
show('idle');
// load the worker (and its modules) with the page, so nothing is requested after files are added
if (document.readyState === 'complete') getWorker();
else window.addEventListener('load', () => getWorker(), { once: true });
