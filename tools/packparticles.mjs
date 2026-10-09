// Pack assets/pmd/particles_sprites/<anim>/<frame>.png into one sheet the game can load in a
// single request.
//
//   node tools/packparticles.mjs
//
// Writes assets/pmd/particles.png and assets/pmd/particles.json:
//   { "<anim>": { "w": 7, "h": 15, "frames": [[x, y], ...] }, ... }
//
// The rip is 101 animations of 1,183 tiny frames; loading them one by one would be over a
// thousand requests at boot. Zero dependencies: PNGs are decoded and encoded here with zlib.
// Re-run it whenever frames are added.

import { readFileSync, writeFileSync, readdirSync, statSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { inflateSync, deflateSync } from 'node:zlib';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const SRC = join(ROOT, 'assets/pmd/particles_sprites');
const OUT_PNG = join(ROOT, 'assets/pmd/particles.png');
const OUT_JSON = join(ROOT, 'assets/pmd/particles.json');
const SHEET_W = 512;
const PAD = 1;

// --- PNG decode -----------------------------------------------------------------------------

function decodePng(buf) {
  let pos = 8, w = 0, h = 0, bd = 8, ct = 6, plte = null, trns = null;
  const idat = [];
  while (pos < buf.length) {
    const n = buf.readUInt32BE(pos), type = buf.toString('ascii', pos + 4, pos + 8);
    const body = buf.subarray(pos + 8, pos + 8 + n);
    if (type === 'IHDR') { w = body.readUInt32BE(0); h = body.readUInt32BE(4); bd = body[8]; ct = body[9]; if (body[12]) throw new Error('interlaced PNG'); }
    else if (type === 'PLTE') plte = body;
    else if (type === 'tRNS') trns = body;
    else if (type === 'IDAT') idat.push(body);
    pos += 12 + n;
  }
  const raw = inflateSync(Buffer.concat(idat));
  const chans = { 0: 1, 2: 3, 3: 1, 4: 2, 6: 4 }[ct];
  const bitsPP = chans * bd;
  const bpp = Math.max(1, bitsPP >> 3);
  const stride = Math.ceil((w * bitsPP) / 8);
  const out = Buffer.alloc(w * h * 4);
  let prev = Buffer.alloc(stride), i = 0;
  for (let y = 0; y < h; y++) {
    const f = raw[i]; const line = Buffer.from(raw.subarray(i + 1, i + 1 + stride)); i += 1 + stride;
    for (let x = 0; x < stride; x++) {
      const a = x >= bpp ? line[x - bpp] : 0, b = prev[x], c = x >= bpp ? prev[x - bpp] : 0;
      if (f === 1) line[x] = (line[x] + a) & 255;
      else if (f === 2) line[x] = (line[x] + b) & 255;
      else if (f === 3) line[x] = (line[x] + ((a + b) >> 1)) & 255;
      else if (f === 4) { const p = a + b - c, pa = Math.abs(p - a), pb = Math.abs(p - b), pc = Math.abs(p - c); line[x] = (line[x] + (pa <= pb && pa <= pc ? a : pb <= pc ? b : c)) & 255; }
    }
    for (let x = 0; x < w; x++) {
      const o = (y * w + x) * 4;
      const sample = (k) => {
        if (bd === 8) return line[x * chans + k];
        if (bd === 16) return line[(x * chans + k) * 2];
        const bit = (x * chans + k) * bd, v = (line[bit >> 3] >> (8 - bd - (bit & 7))) & ((1 << bd) - 1);
        return ct === 3 ? v : Math.round((v * 255) / ((1 << bd) - 1));
      };
      if (ct === 6) { out[o] = sample(0); out[o + 1] = sample(1); out[o + 2] = sample(2); out[o + 3] = sample(3); }
      else if (ct === 2) { out[o] = sample(0); out[o + 1] = sample(1); out[o + 2] = sample(2); out[o + 3] = 255; }
      else if (ct === 0) { const g = sample(0); out[o] = out[o + 1] = out[o + 2] = g; out[o + 3] = 255; }
      else if (ct === 4) { const g = sample(0); out[o] = out[o + 1] = out[o + 2] = g; out[o + 3] = sample(1); }
      else { const k = sample(0); out[o] = plte[k * 3]; out[o + 1] = plte[k * 3 + 1]; out[o + 2] = plte[k * 3 + 2]; out[o + 3] = trns && k < trns.length ? trns[k] : 255; }
    }
    prev = line;
  }
  return { w, h, data: out };
}

// --- PNG encode -----------------------------------------------------------------------------

const CRC = new Int32Array(256).map((_, n) => { let c = n; for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1; return c; });
function crc32(b) { let c = -1; for (let i = 0; i < b.length; i++) c = CRC[(c ^ b[i]) & 255] ^ (c >>> 8); return (c ^ -1) >>> 0; }
function chunk(type, body) {
  const len = Buffer.alloc(4); len.writeUInt32BE(body.length);
  const tb = Buffer.concat([Buffer.from(type, 'ascii'), body]);
  const crc = Buffer.alloc(4); crc.writeUInt32BE(crc32(tb));
  return Buffer.concat([len, tb, crc]);
}
function encodePng(w, h, data) {
  const raw = Buffer.alloc((w * 4 + 1) * h);
  for (let y = 0; y < h; y++) { raw[y * (w * 4 + 1)] = 0; data.copy(raw, y * (w * 4 + 1) + 1, y * w * 4, (y + 1) * w * 4); }
  const ihdr = Buffer.alloc(13); ihdr.writeUInt32BE(w, 0); ihdr.writeUInt32BE(h, 4); ihdr[8] = 8; ihdr[9] = 6;
  return Buffer.concat([Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]), chunk('IHDR', ihdr), chunk('IDAT', deflateSync(raw, { level: 9 })), chunk('IEND', Buffer.alloc(0))]);
}

// --- Gather, pack, write ----------------------------------------------------------------------

// Frames sort by the trailing number in their name ("x-10003.png", "x-3.png"), not as strings.
const frameNo = (f) => { const m = f.match(/(\d+)\.png$/i); return m ? +m[1] : 0; };

const anims = [];
for (const name of readdirSync(SRC).sort()) {
  const dir = join(SRC, name);
  if (!statSync(dir).isDirectory()) continue;
  const files = readdirSync(dir).filter((f) => /\.png$/i.test(f)).sort((a, b) => frameNo(a) - frameNo(b));
  const frames = files.map((f) => decodePng(readFileSync(join(dir, f))));
  if (!frames.length) continue;
  const w = Math.max(...frames.map((f) => f.w)), h = Math.max(...frames.map((f) => f.h));
  anims.push({ name, w, h, frames });
}

// Shelf pack, tallest first.
const cells = [];
for (const a of anims) a.frames.forEach((f, i) => cells.push({ a, i, f, w: a.w, h: a.h }));
cells.sort((p, q) => q.h - p.h || q.w - p.w);
let x = 0, y = 0, shelf = 0;
for (const c of cells) {
  if (x + c.w > SHEET_W) { x = 0; y += shelf + PAD; shelf = 0; }
  c.x = x; c.y = y;
  x += c.w + PAD; shelf = Math.max(shelf, c.h);
}
const H = y + shelf;
const sheet = Buffer.alloc(SHEET_W * H * 4);
for (const c of cells) {
  // Frames of one animation can differ in size (an explosion grows from 11x11 to 103x68), and
  // the rip keeps no offsets. Every one radiates from its middle, so each is centred in its cell.
  const { f } = c;
  const ox = (c.w - f.w) >> 1, oy = (c.h - f.h) >> 1;
  for (let yy = 0; yy < f.h; yy++) f.data.copy(sheet, ((c.y + oy + yy) * SHEET_W + c.x + ox) * 4, yy * f.w * 4, (yy + 1) * f.w * 4);
}
const index = {};
for (const a of anims) index[a.name] = { w: a.w, h: a.h, frames: [] };
for (const c of cells) index[c.a.name].frames[c.i] = [c.x, c.y];

writeFileSync(OUT_PNG, encodePng(SHEET_W, H, sheet));
writeFileSync(OUT_JSON, JSON.stringify(index) + '\n');
console.log(`packed ${anims.length} animations, ${cells.length} frames into ${SHEET_W}x${H}`);
