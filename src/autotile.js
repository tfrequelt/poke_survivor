// L2 -- may import L0-L1.
//
// Autotiling for SilverDeoxys563's formatted dungeon sheets (forest_tiles.png, beach_cave_tiles.png).
//
// Those sheets are TABLES, not maps: every terrain -- walls, ground, water, the water's sparkle
// layer -- comes as the full set of shapes it can take, one tile per arrangement of neighbours.
// And the sheet says which arrangement each tile is for, in its legend column: a legend cell is a
// 3x3 of 8px squares, centre white, and a neighbour square is black when that neighbour is the
// same terrain. So nothing here is a hand-written table of "this tile for that edge" -- the legend
// is read at boot and becomes the lookup, which is what lets any shape of shoreline or wall edge be
// drawn with the right tile.
//
// A neighbour mask has a bit per direction. As in every 47-tile autotiler, a DIAGONAL only counts
// when both of its sides do: a corner square of water next to an edge you cannot see past makes
// no difference to the tile, and the legend draws those squares blank.
//
// Water and sparkle also animate by palette cycling, the way the DS games do it: the sheet carries
// a table of colours per animation frame beside the grid, and frame k is the tile recoloured from
// row 0 of that table to row k. Done once here, into a strip per frame, so drawing an animated
// pond costs nothing more than drawing a still one.

import { TILESETS } from './data/tilesets.js';
import { getImage } from './assets.js';
import { pondsReady } from './terrain.js';

export const N = 1, NE = 2, E = 4, SE = 8, S = 16, SW = 32, W = 64, NW = 128;

/** Clear each diagonal whose two sides are not both set: the standard 47-shape reduction. */
export function reduceMask(m) {
  if (!((m & N) && (m & E))) m &= ~NE;
  if (!((m & S) && (m & E))) m &= ~SE;
  if (!((m & S) && (m & W))) m &= ~SW;
  if (!((m & N) && (m & W))) m &= ~NW;
  return m;
}

/** tileset name -> built autotile data, for every autotile set whose image loaded. */
const built = new Map();
export const autotileFor = (name) => built.get(name) || null;

/** Called once at boot, after the images have loaded. A set that fails keeps the drawn ground. */
export function buildAutotiles() {
  for (const [name, set] of Object.entries(TILESETS)) {
    if (!set.autotile) continue;
    const img = getImage(set.image);
    if (!img) continue;
    try {
      built.set(name, build(set, img.canvas));
      // Only now is there art to draw the water with, so only now may it block anyone.
      if (set.ponds) pondsReady.add(name);
    } catch (e) {
      console.warn(`[autotile] ${name}: ${e.message}`);
    }
  }
  return built.size;
}

// Where in a legend cell each neighbour's square is centred, and which bit it is.
const SPOTS = [[12, 4, N], [20, 4, NE], [20, 12, E], [20, 20, SE], [12, 20, S], [4, 20, SW], [4, 12, W], [4, 4, NW]];

// Seamless ground: a tile whose border is within this colour distance of the plain centre tile.
// The forest's are all within 17; several of the beach's have a shaded edge meant for the foot of
// a wall, which scattered across open floor would draw a grid of seams.
const SEAMLESS = 30;

function build(set, canvas) {
  const Wd = canvas.width, Ht = canvas.height;
  // Read the pixels from a throwaway copy, never from the sheet itself: reading back a canvas
  // makes the browser move it off the GPU, and every tile drawn from it afterwards -- some 450 a
  // frame -- then takes the slow path. Measured: 3ms a frame for the beach before this.
  const copy = document.createElement('canvas');
  copy.width = Wd; copy.height = Ht;
  const cctx = copy.getContext('2d', { willReadFrequently: true });
  cctx.drawImage(canvas, 0, 0);
  const data = cctx.getImageData(0, 0, Wd, Ht).data;
  const [ox, oy] = set.origin;
  const P = set.pitch, Z = set.size;
  const rows = Math.floor((Ht - oy) / P);
  const cx = (c) => ox + c * P, cy = (r) => oy + r * P;
  const at = (x, y) => (y * Wd + x) * 4;
  const bright = (x, y) => { const i = at(x, y); return data[i] + data[i + 1] + data[i + 2]; };
  const isBg = (x, y) => { const i = at(x, y); return data[i] === 0 && data[i + 1] === 128 && data[i + 2] === 128; };
  const hasArt = (c, r) => {
    let n = 0;
    for (let y = 0; y < Z; y += 3) for (let x = 0; x < Z; x += 3) if (!isBg(cx(c) + x, cy(r) + y)) n++;
    return n > 20;
  };

  // 1. The legend: one mask per (row, column-within-group) that has a legend drawn.
  const legend = [];
  for (let r = 0; r < rows; r++) {
    for (let c = 0; c < 3; c++) {
      const x0 = cx(set.cols.legend + c), y0 = cy(r);
      if (bright(x0 + 12, y0 + 12) < 600) continue;          // no white centre: an empty slot
      let m = 0;
      for (const [sx, sy, bit] of SPOTS) if (bright(x0 + sx, y0 + sy) < 150) m |= bit;
      legend.push({ mask: reduceMask(m), r, c });
    }
  }
  if (legend.length < 20) throw new Error(`legend unreadable (${legend.length} cells)`);

  // 2. Per group: mask -> every source cell drawn for it. Several masks have more than one tile;
  //    those are variants, and drawing picks between them by position.
  const table = (col0, relX, relY) => {
    const t = new Map();
    for (const k of legend) {
      if (!hasArt(col0 + k.c, k.r)) continue;
      const list = t.get(k.mask) || [];
      list.push([cx(col0 + k.c) - relX, cy(k.r) - relY]);
      t.set(k.mask, list);
    }
    return lut(t);
  };
  const walls = table(set.cols.walls, 0, 0);
  const ground = table(set.cols.ground, 0, 0);
  // Water and sparkle are drawn from their own animated strips, so their coordinates are kept
  // relative to the strip's corner.
  const waterX = cx(set.cols.water), sparkX = cx(set.cols.sparkle);
  const water = table(set.cols.water, waterX, oy);
  const sparkle = table(set.cols.sparkle, sparkX, oy);

  // 3. The seamless ground tiles, scattered over the open floor.
  const centre = ground[255][0];
  const avg = (sx, sy, edge) => {
    let r = 0, g = 0, b = 0, n = 0;
    for (let y = 0; y < Z; y++) for (let x = 0; x < Z; x++) {
      const onEdge = x < 3 || y < 3 || x >= Z - 3 || y >= Z - 3;
      if (onEdge !== edge) continue;
      const i = at(sx + x, sy + y); r += data[i]; g += data[i + 1]; b += data[i + 2]; n++;
    }
    return [r / n, g / n, b / n];
  };
  const ref = avg(centre[0], centre[1], false);
  const seamless = [];
  for (const list of new Set(ground)) {
    for (const cell of list) {
      if (seamless.some((s) => s[0] === cell[0] && s[1] === cell[1])) continue;
      const e = avg(cell[0], cell[1], true);
      if (Math.abs(e[0] - ref[0]) + Math.abs(e[1] - ref[1]) + Math.abs(e[2] - ref[2]) < SEAMLESS) seamless.push(cell);
    }
  }

  // 4. The animated strips.
  const stripH = rows * P;
  const waterFrames = frames(data, Wd, waterX, oy, 3 * P, stripH, palette(data, Wd, set.palettes.water), false);
  const sparkleFrames = frames(data, Wd, sparkX, oy, 3 * P, stripH, palette(data, Wd, set.palettes.sparkle), true);

  return {
    size: Z, sheet: canvas, walls, ground, water, sparkle, seamless,
    waterFrames, sparkleFrames,
    waterEvery: set.palettes.waterEvery || 17, sparkleEvery: set.palettes.sparkleEvery || 13,
  };
}

/**
 * Every one of the 256 raw masks resolved to a tile list, so drawing never searches. A shape the
 * sheet has no tile for falls back by dropping diagonals, then to the fully surrounded tile.
 */
function lut(t) {
  const out = new Array(256);
  const full = t.get(255) || [...t.values()][0];
  for (let m = 0; m < 256; m++) {
    const r = reduceMask(m);
    out[m] = t.get(r) || t.get(r & (N | E | S | W)) || full;
  }
  return out;
}

/** The palette table beside the grid: rows of packed colours, row 0 being the colours as drawn. */
function palette(data, Wd, spec) {
  if (!spec) return null;
  const [x0, y0, cols, rowsN] = spec;
  const rows = [];
  for (let r = 0; r < rowsN; r++) {
    const row = [];
    for (let c = 0; c < cols; c++) {
      const i = ((y0 + r * 11 + 5) * Wd + (x0 + c * 11 + 5)) * 4;
      row.push((data[i] << 16) | (data[i + 1] << 8) | data[i + 2]);
    }
    rows.push(row);
  }
  return rows;
}

const TEAL = (0 << 16) | (128 << 8) | 128;
const MAGENTA = (255 << 16) | (0 << 8) | 255;

/**
 * One canvas per palette row: the strip recoloured from row 0 to that row, with the sheet's
 * backdrop (teal, and magenta behind the sparkles) keyed out. Without a readable palette, one
 * still frame.
 */
function frames(data, Wd, x0, y0, w, h, pal, sparkle) {
  const n = pal && pal.length > 1 ? pal.length : 1;
  const out = [];
  for (let k = 0; k < n; k++) {
    const map = new Map();
    if (n > 1) for (let c = 0; c < pal[0].length; c++) if (pal[0][c] !== pal[k][c] && !map.has(pal[0][c])) map.set(pal[0][c], pal[k][c]);
    const cv = document.createElement('canvas');
    cv.width = w; cv.height = h;
    const g = cv.getContext('2d');
    const img = g.createImageData(w, h);
    const d = img.data;
    for (let y = 0; y < h; y++) {
      for (let x = 0; x < w; x++) {
        const i = ((y0 + y) * Wd + (x0 + x)) * 4, o = (y * w + x) * 4;
        let rgb = (data[i] << 16) | (data[i + 1] << 8) | data[i + 2];
        if (rgb === TEAL || (sparkle && rgb === MAGENTA)) { d[o + 3] = 0; continue; }
        const to = map.get(rgb);
        if (to !== undefined) rgb = to;
        d[o] = rgb >> 16; d[o + 1] = (rgb >> 8) & 255; d[o + 2] = rgb & 255; d[o + 3] = 255;
      }
    }
    g.putImageData(img, 0, 0);
    out.push(cv);
  }
  return out;
}
