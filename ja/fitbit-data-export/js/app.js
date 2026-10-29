/* Tallyband page logic. The archive is read in a worker in this tab (js/worker.js); nothing is sent anywhere. The only
 * network call the page can make is Gumroad's licence check (/assets/license.js), and only when a Pro key is pasted. */
import { PRO, PRO_READY, PRO_PITCH } from '/export-fitbit-data/js/pro.js';

const $ = id => document.getElementById(id);
const esc = s => String(s).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
const fmt = n => Number(n).toLocaleString('ja-JP');
const UNITS = {"day":["日","日"],"night":["夜分の睡眠","夜分の睡眠"],"weigh-in":["回の体重記録","回の体重記録"],"workout":["回のエクササイズ","回のエクササイズ"],"file":["件のファイル","件のファイル"],"row":["行","行"]};
const plural = (n, one, many) => { const u = UNITS[one] || [one, many]; return `${fmt(n)}${u[n === 1 ? 0 : 1]}`; };
const reduced = () => matchMedia('(prefers-reduced-motion: reduce)').matches;

let worker = null, meta = null, pro = false, busy = false, seq = 0;
const waiting = new Map();

/* ------------------------------------------------------------------ Pro */
function setupPro() {
  if (!window.PeakLicense) return;
  PeakLicense.setup({ tool: 'tallyband', productId: PRO_READY ? PRO.productId : 'PENDING', permalink: PRO.permalink, buyUrl: PRO.url, pitch: "Proでは、選んだ期間の全データを一度に保存できます。データの種類ごとにシートを分けた1つのExcelファイル、またはすべての表をCSVファイルにした1つのZIPに、心拍数のすべての記録、1分ごとの歩数、睡眠ステージの一つひとつも加わります。8ドル（買い切り）。", strings: {"title":"Proを入手","buy":"GumroadでProを購入","keyLabel":"購入済みの場合は、ライセンスキーを貼り付けてください","verify":"有効にする","close":"閉じる","checking":"Gumroadで確認しています…","badKey":"ライセンスキーの形式ではないようです。キーはGumroadの領収書メールに記載されています。","network":"Gumroadに接続できず、キーを確認できませんでした。接続を確かめて、もう一度お試しください。","ok":"このブラウザでProが有効になりました。ありがとうございます。","refunded":"この購入は返金済みか終了しているため、Proは無効です。","rejected":"このライセンスキーは承認されませんでした。","active":"このブラウザではProが有効です。"}, localMessages: true });
  pro = PRO_READY && PeakLicense.isPro();
  document.body.classList.toggle('is-pro', pro);
  PeakLicense.onChange(p => { pro = PRO_READY && p; document.body.classList.toggle('is-pro', pro); proNote(); renderDownloads(); });
}
function proNote() {
  $('pro-note').textContent = pro ? 'このブラウザではProが有効です。形式を選んでください。' : '表ごとにシートを分けた1つのExcelファイル、またはすべての表をCSVファイルにした1つのZIP。8ドル（買い切り）。';
}
function needPro(why) {
  if (PRO_READY && window.PeakLicense && PeakLicense.isPro()) return true;
  if (window.PeakLicense) PeakLicense.open(why); else window.open(PRO.url, '_blank', 'noopener');
  return false;
}

/* ------------------------------------------------------------------ worker */
function getWorker() {
  if (worker) return worker;
  worker = new Worker(new URL('/export-fitbit-data/js/worker.js', import.meta.url), { type: 'module' });
  worker.onmessage = ev => {
    const m = ev.data || {};
    if (m.type === 'progress') { progress(m); return; }
    if (m.type === 'loaded') { loaded(m.meta); return; }
    const w = waiting.get(m.id);
    if (w) { waiting.delete(m.id); (m.type === 'fail' ? w.reject : w.resolve)(m); }
    else if (m.type === 'fail') showError({ code: m.code, message: m.message });
  };
  worker.onerror = e => { e.preventDefault(); showError({ code: 'worker', message: e.message }); };
  return worker;
}
function ask(msg) {
  const id = ++seq;
  return new Promise((resolve, reject) => { waiting.set(id, { resolve, reject }); getWorker().postMessage(Object.assign({ id }, msg)); });
}

/* ------------------------------------------------------------------ stages */
function stage(name) {
  for (const s of ['idle', 'busy', 'error']) $('stage-' + s).hidden = s !== name;
  $('panel').dataset.state = name;
}
function progress(m) {
  const what = m.stage === 'list' ? '一覧を作成中' : m.stage === 'export' ? '準備中' : '読み込み中';
  $('busy-sub').textContent = `${what} ${m.file || ''}`.trim();
  const pct = m.n ? Math.min(100, Math.round(((m.i || 0) + 1) / m.n * 100)) : 0;
  $('busy-bar').style.width = pct + '%';
}
const ERRORS = {
  empty: ['ファイルが空です', '中身が0バイトです。ダウンロードが途中で止まった場合は、Google Takeoutからアーカイブをもう一度ダウンロードしてください。'],
  zip: ['ZIPを読み込めませんでした', 'ダウンロード中に途切れた可能性があります。Googleから届いたメールのリンクから、もう一度ダウンロードしてください。各パーツのリンクは1週間ほど有効です。'],
  encrypted: ['ZIPにパスワードがかかっています', 'GoogleはTakeoutのアーカイブにパスワードを付けないので、このファイルはダウンロード後に変更されています。元のZIPを使ってください。'],
  pdf: ['これはPDFで、Fitbitのアーカイブではありません', 'アーカイブはGoogle TakeoutのZIPです。レポートをPDFで保存した場合は、PDFビューアで開けます。'],
  rar: ['これはRARファイルです', 'TakeoutはZIPファイルで届きます。先に展開して、中のZIPかFitbitフォルダを選んでください。'],
  '7z': ['これは7-Zipファイルです', 'TakeoutはZIPファイルで届きます。先に展開して、中のZIPかFitbitフォルダを選んでください。'],
  tgz: ['これは.tgz形式のアーカイブです', 'Takeoutでエクスポートを作成するときにファイル形式で.zipを選び、そのZIPをここで開いてください。または.tgzを展開して、Fitbitフォルダを選んでください。'],
  type: ['このファイルはFitbitのアーカイブの一部ではありません', 'Google TakeoutのZIPか、その中のFitbitフォルダにあるJSONファイルとCSVファイルを選んでください。'],
  unknown: ['Tallybandが対応していないファイルです', 'JSONかCSVのファイルですが、Fitbitのアーカイブのものではありません。TakeoutのZIPを丸ごと選んでください。'],
  nofitbit: ['このZIPにはFitbitのデータがありません', 'このTakeoutアーカイブには、Googleのほかのサービスのデータが入っています。Google Health（またはFitbit）だけにチェックを入れて新しくエクスポートを作成するか、同じエクスポートのほかのパーツを選んでください。'],
  worker: ['ブラウザが読み込みを止めました', 'アーカイブが、このタブで使えるメモリに対して大きすぎる可能性があります。ほかのタブを閉じてもう一度試すか、解凍したアーカイブのFitbitフォルダだけを選んでください。'],
};
function showError(e) {
  const [t, d] = ERRORS[e && e.code] || ['アーカイブを読み込めませんでした', `止まった箇所：${e && e.message ? e.message : e}。Takeoutのアーカイブなら、もう一度ダウンロードしてから試してください。`];
  $('error-title').textContent = t;
  $('error-text').textContent = d;
  stage('error');
  $('error-title').focus();
}

/* ------------------------------------------------------------------ open */
function start(files, sample = false) {
  if (busy) return;
  busy = true;
  stage('busy');
  $('busy-title').textContent = sample ? '架空のアーカイブを作成中' : 'アーカイブを読み込んでいます';
  $('busy-sub').textContent = 'この端末のブラウザ内で処理しています。';
  $('busy-bar').style.width = '0%';
  $('busy-title').focus();
  getWorker().postMessage(sample ? { type: 'sample' } : { type: 'open', files });
}
function loaded(m) {
  busy = false;
  meta = m;
  if (!m.coverage.days) {
    const p = m.problems[0];
    showError(p ? { code: p.reason, message: p.detail || p.name } : { code: 'nofitbit' });
    return;
  }
  stage('idle');
  $('results').hidden = false;
  $('sample-note').hidden = !m.sample;
  fillSettings(m);
  setRange(defaultRange(m));
  renderMeta();
  renderFound();
  refresh();
  $('results').scrollIntoView({ behavior: reduced() ? 'auto' : 'smooth', block: 'start' });
  $('res-title').focus({ preventScroll: true });
}

/* ------------------------------------------------------------------ settings */
const ZONES = (() => { try { return ['UTC'].concat(Intl.supportedValuesOf('timeZone').filter(z => z !== 'UTC')); } catch { return ['UTC', 'Europe/London', 'Europe/Berlin', 'America/New_York', 'America/Chicago', 'America/Denver', 'America/Los_Angeles', 'Australia/Sydney', 'Asia/Tokyo']; } })();
const DEVICE_TZ = (() => { try { return Intl.DateTimeFormat().resolvedOptions().timeZone || 'UTC'; } catch { return 'UTC'; } })();
function fillSettings(m) {
  const tz = m.tz || DEVICE_TZ;
  const list = ZONES.includes(tz) ? ZONES : [tz].concat(ZONES);
  $('tz').innerHTML = list.map(z => `<option${z === tz ? ' selected' : ''}>${esc(z)}</option>`).join('');
  if (!m.tz) ask({ type: 'settings', tz, auto: true }).then(r => { meta = r.meta; renderMeta(); refresh(); });
  $('unit').value = m.unit || 'lb';
  optNote();
}
function optNote() {
  const m = meta, bits = [];
  bits.push(m.tzFrom === 'profile' ? `タイムゾーンはFitbitのプロフィールから取得しました（${m.tz}）。` : m.tzFrom === 'you' ? `タイムゾーンは手動で設定したものです（${m.tz}）。` : `アーカイブにタイムゾーンの記載がないため、この端末のタイムゾーンを使っています（${$('tz').value}）。別の地域で暮らしていた場合は変更してください。`);
  if (m.weight.basis === 'bmi') bits.push(`体重の単位は${m.weight.unit === 'kg' ? 'キログラム' : 'ポンド'}と判断しました（${plural(m.weight.n, 'weigh-in', 'weigh-ins')}に保存されたBMIから）。`);
  else if (m.counts.weights) bits.push('アーカイブの体重記録にはBMIが保存されていません。1回分の値をアプリの表示と比べて、単位を選んでください。');
  $('opt-note').textContent = bits.join(' ');
}
function defaultRange(m) {
  const last = m.coverage.last, first = m.coverage.first;
  const yearAgo = addDays(last, -364);
  return { from: yearAgo > first ? yearAgo : first, to: last };
}
const addDays = (d, n) => new Date(Date.parse(d + 'T00:00:00Z') + n * 864e5).toISOString().slice(0, 10);
function setRange(r) {
  const { first, last } = meta.coverage;
  $('from').min = $('to').min = first; $('from').max = $('to').max = last;
  $('from').value = r.from; $('to').value = r.to;
  renderChips();
}
function range() {
  let from = $('from').value || meta.coverage.first, to = $('to').value || meta.coverage.last;
  if (from > to) [from, to] = [to, from];
  return { from, to };
}
function renderChips() {
  const { first, last } = meta.coverage;
  const y0 = +first.slice(0, 4), y1 = +last.slice(0, 4);
  const chips = [['直近30日', addDays(last, -29), last], ['直近12か月', addDays(last, -364), last]];
  for (let y = y1; y >= Math.max(y0, y1 - 5); y--) chips.push([String(y), `${y}-01-01`, `${y}-12-31`]);
  chips.push(['すべて', first, last]);
  const cur = range();
  $('chips').innerHTML = chips.map(([t, a, b]) => {
    const f = a < first ? first : a, l = b > last ? last : b;
    return `<button type="button" class="tb-chip" data-from="${f}" data-to="${l}" aria-pressed="${cur.from === f && cur.to === l}">${esc(t)}</button>`;
  }).join('');
}

/* ------------------------------------------------------------------ render */
function renderMeta() {
  const c = meta.coverage, n = meta.counts;
  const parts = [`${c.first}から${c.last}までの${plural(c.days, 'day', 'days')}`];
  if (n.nights) parts.push(plural(n.nights, 'night', 'nights'));
  if (n.weights) parts.push(plural(n.weights, 'weigh-in', 'weigh-ins'));
  if (n.workouts) parts.push(plural(n.workouts, 'workout', 'workouts'));
  $('res-meta').textContent = parts.join(', ') + '.';
  optNote();
}
const COLS = [['date', '日付'], ['steps', '歩数'], ['distance_km', 'km'], ['calories_kcal', 'kcal'], ['resting_heart_rate', '安静時心拍数'], ['sleep_min', '睡眠（分）'], ['sleep_score', 'スコア'], ['weight_kg', 'kg']];
let previewToken = 0;
async function refresh() {
  if (!meta) return;
  const t = ++previewToken;
  const { from, to } = range();
  renderChips();
  const r = await ask({ type: 'preview', from, to, limit: 8 });
  if (t !== previewToken) return;
  const cols = COLS.filter(([k]) => k === 'date' || r.rows.some(x => x[k] !== ''));
  $('preview').innerHTML = r.rows.length
    ? `<thead><tr>${cols.map(([k, h]) => `<th scope="col"${k === 'date' ? '' : ' class="tb-num"'}>${esc(h)}</th>`).join('')}</tr></thead><tbody>${r.rows.map(x => `<tr>${cols.map(([k]) => (k === 'date' ? `<th scope="row">${esc(x[k])}</th>` : `<td class="tb-num">${x[k] === '' ? '' : esc(typeof x[k] === 'number' ? fmt(x[k]) : x[k])}</td>`)).join('')}</tr>`).join('')}</tbody>`
    : '<tbody><tr><td>この期間にはデータがありません。</td></tr></tbody>';
  $('prev-sub').textContent = r.total ? `${from}から${to}までの${plural(r.total, 'day', 'days')}のうち、最初の${Math.min(8, r.total)}日分です。CSVには${Object.keys(r.rows[0] || {}).length}列あります。` : '';
  counts = r.counts;
  renderDownloads();
}
let counts = {};
const MAIN = [
  ['daily', '日ごとの集計', '歩数、距離、消費カロリー、アクティブな時間、安静時心拍数、睡眠、スコア、HRV、SpO2、体重', false],
  ['sleep', '睡眠', '1晩または仮眠ごとに1行：時刻、睡眠時間と覚醒時間、ステージ、効率、スコア', false],
  ['weight', '体重', '計測ごとにkgとlb、BMI、体脂肪率、記録元の体重計やアプリ', false],
  ['workouts', 'エクササイズ', '1回ごとに1行：種類、時間、消費カロリー、歩数、距離、平均心拍数', false],
  ['stages', '睡眠ステージ', '毎晩のすべてのステージ（浅い睡眠、深い睡眠、レム睡眠、覚醒）と、その開始時刻と長さ', true],
  ['minutes', '1分ごとの歩数', '1分ごとの歩数、消費カロリー、距離（一度に1年分まで）', true],
  ['hr', '心拍数の記録', 'すべての記録と時刻（一度に31日分まで）', true],
];
function renderDownloads() {
  if (!meta) return;
  const rows = MAIN.filter(([k]) => (k === 'minutes' ? meta.has.minutes : k === 'hr' ? meta.has.hr : k === 'stages' ? meta.has.stages : true)).map(([k, name, what, isPro]) => {
    const n = counts[k];
    return `<tr><th scope="row">${esc(name)}${isPro ? ' <span class="tb-tag">Pro</span>' : ''}</th><td>${esc(what)}</td><td class="tb-num">${n === undefined ? '' : fmt(n)}</td><td><button type="button" class="tb-btn tb-btn-sm ${isPro ? 'tb-btn-plain' : 'tb-btn-main'}" data-csv="${k}"${isPro ? ' data-pro-csv' : ''}${n === 0 ? ' disabled' : ''}>CSV</button></td></tr>`;
  });
  for (const f of meta.others) rows.push(`<tr><th scope="row">${esc(f.label)}</th><td>アーカイブ内の${esc(plural(f.files, 'file', 'files'))}${f.first ? `（${esc(f.first)}から${esc(f.last)}まで）` : ''}</td><td class="tb-num"></td><td><button type="button" class="tb-btn tb-btn-sm tb-btn-plain" data-csv="${esc(f.id)}">CSV</button></td></tr>`);
  $('downloads').tBodies[0].innerHTML = rows.join('');
}
function renderFound() {
  const p = meta.problems.filter(x => x.reason !== 'nofitbit' || meta.archives.length === 1);
  const lines = [`<p>${meta.archives.length ? `読み込んだアーカイブ：${esc(meta.archives.join(', '))}。` : ''}Tallybandが読める${plural(meta.fileCount, 'file', 'files')}が見つかりました。アカウント、ログイン、設定のファイルは対象外です。</p>`];
  if (meta.others.length) lines.push(`<p>アーカイブ内のそのほかのデータ（それぞれ1つのCSVで保存できます）：${meta.others.map(f => esc(f.label)).join(', ')}。</p>`);
  if (p.length) lines.push(`<p>読み込めなかったファイル：${p.map(x => `${esc(x.name)} (${esc(ERRORS[x.reason] ? ERRORS[x.reason][0] : x.reason)})`).join('; ')}.</p>`);
  $('found-body').innerHTML = lines.join('');
}

/* ------------------------------------------------------------------ downloads */
function save(name, data, type) {
  const blob = data instanceof Blob ? data : new Blob([data], { type });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url; a.download = name; a.rel = 'noopener';
  document.body.appendChild(a); a.click(); a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 60000);
}
const FILE = { daily: 'daily-summary', sleep: 'sleep', stages: 'sleep-stages', weight: 'weight', workouts: 'workouts', hr: 'heart-rate-readings', minutes: 'steps-per-minute' };
const slug = s => String(s).toLowerCase().replace(/^(csv|json):/, '').replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '') || 'data';
const RANGE_ERR = { 'hr-range': '心拍数の記録は一度に31日分までです（1か月でも約50万行になります）。期間を短くして、もう一度ダウンロードしてください。', 'minute-range': '1分ごとのデータは一度に1年分までです。期間を短くして、もう一度ダウンロードしてください。' };
async function download(what, btn) {
  const { from, to } = range();
  const old = btn ? btn.textContent : '';
  if (btn) { btn.disabled = true; btn.textContent = '準備中'; }
  $('dl-note').textContent = '';
  try {
    if (what === 'xlsx' || what === 'csvzip') {
      const r = await ask({ type: what, from, to, sep: $('sep').value });
      save(`tallyband-${from}-to-${to}.${what === 'xlsx' ? 'xlsx' : 'zip'}`, new Blob([r.bytes], { type: what === 'xlsx' ? 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' : 'application/zip' }));
      $('dl-note').textContent = `${from}から${to}までの${plural(r.rows, 'row', 'rows')}を保存しました。`;
    } else {
      const r = await ask({ type: 'csv', what, from, to, sep: $('sep').value });
      save(`tallyband-${FILE[what] || slug(what)}-${from}-to-${to}.csv`, r.text, 'text/csv;charset=utf-8');
      $('dl-note').textContent = `${plural(r.rows, 'row', 'rows')}を保存しました${r.note === 'nodates' ? '。このファイルにはTallybandが読み取れる日付がないため、すべての行を含めています' : ''}。`;
    }
  } catch (e) {
    $('dl-note').textContent = RANGE_ERR[e.code] || `ダウンロードに失敗しました：${e.message || e.code}。`;
  } finally {
    if (btn) { btn.disabled = false; btn.textContent = old; }
  }
}

/* ------------------------------------------------------------------ wiring */
function wire() {
  const input = $('file-input'), folder = $('folder-input');
  $('btn-choose').addEventListener('click', () => input.click());
  $('btn-folder').addEventListener('click', () => folder.click());
  $('btn-retry').addEventListener('click', () => { stage('idle'); input.click(); });
  for (const id of ['btn-sample', 'btn-error-sample']) $(id).addEventListener('click', () => start(null, true));
  $('btn-another').addEventListener('click', () => { $('results').hidden = true; stage('idle'); $('panel').scrollIntoView({ behavior: reduced() ? 'auto' : 'smooth', block: 'center' }); $('drop-title').focus({ preventScroll: true }); });
  input.addEventListener('change', () => { if (input.files.length) start([...input.files]); input.value = ''; });
  folder.addEventListener('change', () => { if (folder.files.length) start([...folder.files].filter(f => /\.(json|csv)$/i.test(f.name) || /^User(Sleeps|SleepStages)_/i.test(f.name)).map(f => ({ file: f, path: f.webkitRelativePath || f.name }))); folder.value = ''; });
  const drop = $('drop');
  ['dragenter', 'dragover'].forEach(ev => drop.addEventListener(ev, e => { e.preventDefault(); drop.classList.add('is-over'); }));
  ['dragleave', 'drop'].forEach(ev => drop.addEventListener(ev, e => { e.preventDefault(); drop.classList.remove('is-over'); }));
  drop.addEventListener('drop', e => { if (e.dataTransfer.files.length) start([...e.dataTransfer.files]); });
  for (const id of ['from', 'to']) $(id).addEventListener('change', () => refresh());
  $('chips').addEventListener('click', e => { const b = e.target.closest('.tb-chip'); if (!b) return; $('from').value = b.dataset.from; $('to').value = b.dataset.to; refresh(); });
  $('tz').addEventListener('change', async () => { const r = await ask({ type: 'settings', tz: $('tz').value }); meta = r.meta; renderMeta(); refresh(); });
  $('unit').addEventListener('change', async () => { const r = await ask({ type: 'settings', unit: $('unit').value }); meta = r.meta; renderMeta(); refresh(); });
  $('downloads').addEventListener('click', e => {
    const b = e.target.closest('[data-csv]'); if (!b) return;
    if (b.hasAttribute('data-pro-csv') && !needPro('すべての記録と1分ごとのデータは、Tallyband Proの機能です。')) return;
    download(b.dataset.csv, b);
  });
  document.querySelectorAll('[data-pro]').forEach(b => b.addEventListener('click', () => { if (needPro('全データをまとめて保存するのは、Tallyband Proの機能です。')) download(b.dataset.pro, b); }));
}

wire();
if (document.readyState === 'complete') setupPro(); else addEventListener('load', setupPro);
proNote();
