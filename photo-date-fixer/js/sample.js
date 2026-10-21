// A made-up Snapchat export (12 memories in two ZIP parts), drawn and zipped in the browser. Nothing here is a real
// person's data. It covers every case the fixer handles: daylight saving edges, two memories in the same 2-second
// window, a photo with no list entry, an entry with no photo, an overlay, and a memory without a location.
import { ZipWriter } from './engine/zip-write.js';

const U = (a) => Date.UTC(a[0], a[1], a[2], a[3], a[4], a[5]);
export const SAMPLE = [
  { utc: [2019, 2, 5, 9, 24, 50], loc: [41.0082, 28.9784], scene: 'sea', place: 'Istanbul', overlay: true },
  { utc: [2025, 2, 30, 0, 30, 0], loc: [52.3676, 4.9041], scene: 'canal', place: 'Amsterdam' },
  { utc: [2025, 2, 30, 1, 30, 0], loc: [52.3702, 4.8952], scene: 'canal', place: 'Amsterdam' },
  { utc: [2024, 10, 3, 5, 30, 0], loc: [40.7128, -74.006], scene: 'city', place: 'New York' },
  { utc: [2023, 11, 31, 12, 59, 58], loc: [-33.8568, 151.2153], scene: 'harbour', place: 'Sydney' },
  { utc: [2021, 6, 14, 18, 0, 0], loc: [48.8584, 2.2945], scene: 'tower', place: 'Paris' },
  { utc: [2021, 6, 14, 18, 0, 1], loc: [48.8606, 2.3376], scene: 'river', place: 'Paris' },
  { utc: [2020, 1, 2, 10, 0, 0], loc: null, scene: 'snow', place: null },
  { utc: [2018, 5, 15, 3, 0, 0], loc: [35.6762, 139.6503], scene: 'night', place: 'Tokyo' },
  { utc: [2022, 8, 18, 16, 20, 0], loc: [-33.9249, 18.4241], scene: 'mountain', place: 'Cape Town' },
  { utc: [2022, 7, 8, 8, 8, 8], loc: null, scene: 'beach', place: null, noRecord: true },
  { utc: [2023, 4, 5, 5, 5, 5], loc: [51.5072, -0.1276], place: 'London', noFile: true },
];

const PALETTES = {
  sea: ['#f6b88f', '#f08b6e', '#2f6f8f', '#1d4a63'],
  canal: ['#cfe3ef', '#a9c8dc', '#6f8e5c', '#3d5a3a'],
  city: ['#2b2f52', '#8a5a8c', '#1b1d2c', '#f2c879'],
  harbour: ['#bfe1f2', '#7fc0e0', '#1f6f9a', '#ffffff'],
  tower: ['#f7d6b8', '#e7a98c', '#5b6c84', '#2c3446'],
  river: ['#dbe8f1', '#b9d3e6', '#4f7493', '#2d4559'],
  snow: ['#e6edf3', '#cad7e2', '#ffffff', '#46586a'],
  night: ['#141a33', '#2b3566', '#0c1020', '#ffcf7a'],
  mountain: ['#ffd9b0', '#f2a37a', '#59705d', '#33473a'],
  beach: ['#a8dcf0', '#7ccbe8', '#f1d8a8', '#1d7f9c'],
};

function draw(ctx, w, h, scene, text, index) {
  const p = PALETTES[scene] ?? PALETTES.sea;
  const g = ctx.createLinearGradient(0, 0, 0, h * 0.65);
  g.addColorStop(0, p[0]);
  g.addColorStop(1, p[1]);
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, w, h);
  ctx.fillStyle = scene === 'night' ? '#fff3cf' : 'rgba(255,255,255,0.75)';
  ctx.beginPath();
  ctx.arc(w * (0.2 + 0.06 * (index % 4)), h * 0.24, h * 0.07, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = p[2];
  ctx.beginPath();
  ctx.moveTo(0, h * 0.62);
  for (let x = 0; x <= w; x += w / 12) ctx.lineTo(x, h * (0.56 + 0.06 * Math.sin(x / 90 + index)));
  ctx.lineTo(w, h);
  ctx.lineTo(0, h);
  ctx.closePath();
  ctx.fill();
  ctx.fillStyle = p[3];
  if (scene === 'city' || scene === 'night') {
    for (let k = 0; k < 9; k++) ctx.fillRect(w * (0.08 + k * 0.1), h * (0.38 + ((k * 37) % 17) / 100), w * 0.07, h);
  } else ctx.fillRect(0, h * 0.82, w, h * 0.18);
  ctx.fillStyle = 'rgba(0,0,0,0.42)';
  ctx.fillRect(0, h - 64, w, 64);
  ctx.fillStyle = '#ffffff';
  ctx.font = '600 28px system-ui, sans-serif';
  ctx.fillText(text, 24, h - 24);
}

async function jpeg(scene, text, index) {
  const w = 960;
  const h = 720;
  let blob;
  if (typeof OffscreenCanvas === 'function') {
    const c = new OffscreenCanvas(w, h);
    draw(c.getContext('2d'), w, h, scene, text, index);
    blob = await c.convertToBlob({ type: 'image/jpeg', quality: 0.82 });
  } else {
    const c = document.createElement('canvas');
    c.width = w;
    c.height = h;
    draw(c.getContext('2d'), w, h, scene, text, index);
    blob = await new Promise((r) => c.toBlob(r, 'image/jpeg', 0.82));
  }
  return new Uint8Array(await blob.arrayBuffer());
}

async function overlayPng(caption) {
  const c = typeof OffscreenCanvas === 'function' ? new OffscreenCanvas(960, 720) : Object.assign(document.createElement('canvas'), { width: 960, height: 720 });
  const ctx = c.getContext('2d');
  ctx.fillStyle = 'rgba(0,0,0,0.55)';
  ctx.fillRect(0, 300, 960, 72);
  ctx.fillStyle = '#ffffff';
  ctx.font = '600 34px system-ui, sans-serif';
  ctx.fillText(caption, 40, 348);
  const blob = c.convertToBlob ? await c.convertToBlob({ type: 'image/png' }) : await new Promise((r) => c.toBlob(r, 'image/png'));
  return new Uint8Array(await blob.arrayBuffer());
}

class BlobSink {
  constructor() {
    this.chunks = [];
  }
  write(u8) {
    this.chunks.push(u8);
  }
}

const hex = (n, len) => n.toString(16).padStart(len, '0').slice(-len);
const uuid = (i) => `5a3e${hex(i * 2654435761, 4)}-${hex(i * 40503, 4)}-4${hex(i * 977, 3)}-8${hex(i * 131, 3)}-${hex(i * 2246822519, 8)}${hex(i * 3266489917, 4)}`;
const day = (ms) => new Date(ms).toISOString().slice(0, 10);
const listDate = (ms) => `${new Date(ms).toISOString().slice(0, 19).replace('T', ' ')} UTC`;

export async function buildSampleExport({ name = (n) => `Sample ${n}`, caption = 'first evening by the water' } = {}) {
  const stamp = 1760000000000;
  const list = [];
  const files = [];
  for (let i = 0; i < SAMPLE.length; i++) {
    const s = SAMPLE[i];
    const t = U(s.utc);
    if (!s.noRecord) {
      list.push({
        Date: listDate(t),
        'Media Type': 'Image',
        Location: `Latitude, Longitude: ${s.loc ? s.loc[0] : 0}, ${s.loc ? s.loc[1] : 0}`,
        'Download Link': '',
        'Media Download Url': '',
      });
    }
    if (!s.noFile) {
      const id = uuid(i + 1);
      const text = s.place ? `${name(i + 1)}, ${s.place}` : name(i + 1);
      files.push({ path: `memories/${day(t)}_${id}-main.jpg`, bytes: await jpeg(s.scene, text, i), t });
      if (s.overlay) files.push({ path: `memories/${day(t)}_${id}-overlay.png`, bytes: await overlayPng(caption), t });
    }
  }
  const json = new TextEncoder().encode(JSON.stringify({ 'Saved Media': list }, null, 1));
  const half = 7;
  const build = async (entries, withList) => {
    const sink = new BlobSink();
    const zw = new ZipWriter(sink);
    if (withList) await zw.addFile('json/memories_history.json', json, { wallMs: stamp, utcMs: stamp });
    // Snapchat stores the capture time (UTC) in each entry; the sample does the same
    for (const f of entries) await zw.addFile(f.path, f.bytes, { wallMs: f.t, utcMs: f.t });
    await zw.finish();
    return sink.chunks;
  };
  const p1 = await build(files.slice(0, half), true);
  const p2 = await build(files.slice(half), false);
  return [new File(p1, `mydata~${stamp}.zip`, { type: 'application/zip' }), new File(p2, `mydata~${stamp}-2.zip`, { type: 'application/zip' })];
}
