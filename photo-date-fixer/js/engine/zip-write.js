// Streaming ZIP writer (STORE only: photos and videos do not compress). Writes to any sink with write(Uint8Array).
// Each entry carries the capture time three ways: MS-DOS fields (local wall time, what Explorer and most unzip tools
// show), the extended timestamp 0x5455 (UTC seconds) and the NTFS field 0x000a (UTC, 100 ns), so the file time after
// unzipping is the capture time. ZIP64 records are added only when sizes or offsets need them.
import { toUtf8, wallMsToDos, wr16, wr32, wr64 } from './bytes.js';
import { crc32 } from './crc32.js';

const MAX32 = 0xffffffff;

function timeExtras(utcMs) {
  const sec = Math.max(0, Math.min(MAX32, Math.floor(utcMs / 1000)));
  const ux = new Uint8Array(9);
  wr16(ux, 0, 0x5455);
  wr16(ux, 2, 5);
  ux[4] = 1;
  wr32(ux, 5, sec);
  const nt = new Uint8Array(36);
  wr16(nt, 0, 0x000a);
  wr16(nt, 2, 32);
  wr16(nt, 8, 1);
  wr16(nt, 10, 24);
  const ft = (BigInt(Math.round(utcMs)) + 11644473600000n) * 10000n;
  for (let k = 0; k < 3; k++) {
    wr32(nt, 12 + k * 8, Number(ft & 0xffffffffn));
    wr32(nt, 16 + k * 8, Number((ft >> 32n) & 0xffffffffn));
  }
  const out = new Uint8Array(ux.length + nt.length);
  out.set(ux, 0);
  out.set(nt, ux.length);
  return out;
}

export class ZipWriter {
  constructor(sink) {
    this.sink = sink;
    this.offset = 0;
    this.entries = [];
  }

  async #w(u8) {
    if (!u8.length) return;
    await this.sink.write(u8);
    this.offset += u8.length;
  }

  #localHeader({ nameB, flags, time, date, crc, size, extra, z64 }) {
    const zx = z64 ? 20 : 0;
    const h = new Uint8Array(30 + nameB.length + zx + extra.length);
    wr32(h, 0, 0x04034b50);
    wr16(h, 4, z64 ? 45 : 20);
    wr16(h, 6, flags);
    wr16(h, 8, 0);
    wr16(h, 10, time);
    wr16(h, 12, date);
    wr32(h, 14, crc);
    wr32(h, 18, z64 ? MAX32 : size);
    wr32(h, 22, z64 ? MAX32 : size);
    wr16(h, 26, nameB.length);
    wr16(h, 28, zx + extra.length);
    h.set(nameB, 30);
    let q = 30 + nameB.length;
    if (z64) {
      wr16(h, q, 0x0001);
      wr16(h, q + 2, 16);
      wr64(h, q + 4, size);
      wr64(h, q + 12, size);
      q += 20;
    }
    h.set(extra, q);
    return h;
  }

  // whole file in memory
  async addFile(name, data, { wallMs, utcMs }) {
    const nameB = toUtf8(name);
    const { time, date } = wallMsToDos(wallMs);
    const extra = timeExtras(utcMs);
    const crc = crc32(data);
    const z64 = data.length >= MAX32;
    const local = this.offset;
    await this.#w(this.#localHeader({ nameB, flags: 0x0800, time, date, crc, size: data.length, extra, z64 }));
    await this.#w(data);
    this.entries.push({ nameB, flags: 0x0800, time, date, crc, size: data.length, local, extra });
    return { crc, size: data.length };
  }

  // file of unknown CRC, written chunk by chunk; sizes and CRC follow in a data descriptor
  async addStream(name, chunks, { wallMs, utcMs }) {
    const nameB = toUtf8(name);
    const { time, date } = wallMsToDos(wallMs);
    const extra = timeExtras(utcMs);
    const flags = 0x0808;
    const local = this.offset;
    await this.#w(this.#localHeader({ nameB, flags, time, date, crc: 0, size: 0, extra, z64: false }));
    let crc = 0;
    let size = 0;
    for await (const c of chunks) {
      crc = crc32(c, crc);
      size += c.length;
      await this.#w(c);
    }
    const big = size >= MAX32;
    const dd = new Uint8Array(big ? 24 : 16);
    wr32(dd, 0, 0x08074b50);
    wr32(dd, 4, crc);
    if (big) {
      wr64(dd, 8, size);
      wr64(dd, 16, size);
    } else {
      wr32(dd, 8, size);
      wr32(dd, 12, size);
    }
    await this.#w(dd);
    this.entries.push({ nameB, flags, time, date, crc, size, local, extra });
    return { crc, size };
  }

  async finish() {
    const cdStart = this.offset;
    for (const e of this.entries) {
      const bigSize = e.size >= MAX32;
      const bigOff = e.local >= MAX32;
      const zlen = bigSize || bigOff ? 4 + (bigSize ? 16 : 0) + (bigOff ? 8 : 0) : 0;
      const h = new Uint8Array(46 + e.nameB.length + zlen + e.extra.length);
      wr32(h, 0, 0x02014b50);
      wr16(h, 4, (3 << 8) | 45);
      wr16(h, 6, zlen ? 45 : 20);
      wr16(h, 8, e.flags);
      wr16(h, 10, 0);
      wr16(h, 12, e.time);
      wr16(h, 14, e.date);
      wr32(h, 16, e.crc);
      wr32(h, 20, bigSize ? MAX32 : e.size);
      wr32(h, 24, bigSize ? MAX32 : e.size);
      wr16(h, 28, e.nameB.length);
      wr16(h, 30, zlen + e.extra.length);
      wr16(h, 32, 0);
      wr16(h, 34, 0);
      wr16(h, 36, 0);
      wr32(h, 38, (0o100644 << 16) >>> 0);
      wr32(h, 42, bigOff ? MAX32 : e.local);
      h.set(e.nameB, 46);
      let q = 46 + e.nameB.length;
      if (zlen) {
        wr16(h, q, 0x0001);
        wr16(h, q + 2, zlen - 4);
        let r = q + 4;
        if (bigSize) {
          wr64(h, r, e.size);
          wr64(h, r + 8, e.size);
          r += 16;
        }
        if (bigOff) wr64(h, r, e.local);
        q += zlen;
      }
      // the central copy of 0x5455 carries only the modification time
      const ux = e.extra.slice(0, 9);
      h.set(ux, q);
      h.set(e.extra.subarray(9), q + 9);
      await this.#w(h);
    }
    const cdSize = this.offset - cdStart;
    const n = this.entries.length;
    const z64 = n >= 0xffff || cdStart >= MAX32 || cdSize >= MAX32;
    if (z64) {
      const zr = new Uint8Array(56);
      wr32(zr, 0, 0x06064b50);
      wr64(zr, 4, 44);
      wr16(zr, 12, (3 << 8) | 45);
      wr16(zr, 14, 45);
      wr64(zr, 24, n);
      wr64(zr, 32, n);
      wr64(zr, 40, cdSize);
      wr64(zr, 48, cdStart);
      const zrAt = this.offset;
      await this.#w(zr);
      const loc = new Uint8Array(20);
      wr32(loc, 0, 0x07064b50);
      wr64(loc, 8, zrAt);
      wr32(loc, 16, 1);
      await this.#w(loc);
    }
    const end = new Uint8Array(22);
    wr32(end, 0, 0x06054b50);
    wr16(end, 8, z64 ? 0xffff : n);
    wr16(end, 10, z64 ? 0xffff : n);
    wr32(end, 12, z64 ? MAX32 : cdSize);
    wr32(end, 16, z64 ? MAX32 : cdStart);
    await this.#w(end);
    return { size: this.offset, entries: n };
  }
}

// Bytes an entry adds to an archive (local header + data + central record), for part planning.
export function entryOverhead(name) {
  return 30 + 46 + 2 * (toUtf8(name).length + 45) + 24;
}
