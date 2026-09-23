// L1 -- may import L0 (util, state, data).
//
// Compiles the character-grid pixel maps in data/shapes.js into ONE texture atlas at boot.
//
// Three things make this fast enough to never think about again:
//  1. The whole atlas is built as a single ImageData through a Uint32Array view and written with
//     one putImageData -- not one putImageData per sprite.
//  2. Every variant is BAKED, never applied at draw time. Left-facing sprites are rasterised
//     mirrored, and hit-flash sprites are rasterised pre-whitened. So drawing an entity is always
//     one drawImage with no save/restore, no ctx.scale(-1,1) and no ctx.filter.
//  3. Frame lookup in the hot path is an array index, never a string or a Map get.

import { SHAPES, PALETTES } from './data/art.js';
import { FONT, FONT_COLORS, GLYPH_W, GLYPH_H, B32 } from './data/font.js';
import { getOverride, getSheet } from './assets.js';

// PMD walk sheets are 8 directions x N frames x 2 flash variants per form, which is far more
// atlas area than the drawn art needed. 2048 leaves comfortable headroom.
const ATLAS_W = 2048;
const ATLAS_H = 2048;

export const ATLAS = document.createElement('canvas');
export const FRAMES = [];          // { sx, sy, w, h, ox, oy } indexed by numeric frame id

const registry = new Map();        // "shape:palette" -> { base, nf, w, h, ox, oy }
const fontIndex = new Map();       // "color" -> base frame id of that colour's glyph block
const glyphOrder = Object.keys(FONT);
const glyphSlot = new Map(glyphOrder.map((ch, i) => [ch, i]));

let built = false;

// '.' is transparent; '1'-'9' are 1-9 and 'a'-'v' are 10-31, so a palette can hold 31 colours.
const CHARMAP = new Int8Array(128).fill(0);
for (let i = 1; i <= 9; i++) CHARMAP[48 + i] = i;
for (let i = 0; i < 22; i++) CHARMAP[97 + i] = 10 + i;

/** '#rrggbb' -> packed little-endian 0xAABBGGRR, which is what a Uint32Array view expects. */
function packColor(hex, alpha = 255) {
  const n = parseInt(hex.slice(1), 16);
  const r = (n >> 16) & 255, g = (n >> 8) & 255, b = n & 255;
  return ((alpha << 24) | (b << 16) | (g << 8) | r) >>> 0;
}

function lerpToWhite(hex, t) {
  const n = parseInt(hex.slice(1), 16);
  const r = Math.round(((n >> 16) & 255) + (255 - ((n >> 16) & 255)) * t);
  const g = Math.round(((n >> 8) & 255) + (255 - ((n >> 8) & 255)) * t);
  const b = Math.round((n & 255) + (255 - (n & 255)) * t);
  return ((255 << 24) | (b << 16) | (g << 8) | r) >>> 0;
}

/** Build a palette lookup as packed ints. `flash` whitens everything but keeps the silhouette. */
function packPalette(name, flash) {
  const src = PALETTES[name];
  if (!src) throw new Error(`sprites: unknown palette "${name}"`);
  const out = new Uint32Array(32);
  for (let i = 1; i < src.length; i++) {
    out[i] = flash ? lerpToWhite(src[i], 0.85) : packColor(src[i]);
  }
  return out;
}

// --- Shelf packer -----------------------------------------------------------
// Sprites are tiny and similar in height, so a shelf packer wastes almost nothing and is 20 lines.

function shelfPacker(w, h) {
  let shelfY = 0, shelfH = 0, penX = 0;
  const alloc = function (iw, ih) {
    if (penX + iw > w) { shelfY += shelfH; penX = 0; shelfH = 0; }
    if (shelfY + ih > h) {
      throw new Error(`sprites: atlas full at ${w}x${h} -- raise ATLAS_W/ATLAS_H`);
    }
    const r = { sx: penX, sy: shelfY };
    penX += iw;
    if (ih > shelfH) shelfH = ih;
    return r;
  };
  alloc.usedRows = () => shelfY + shelfH;
  return alloc;
}

// --- Registration -----------------------------------------------------------

/**
 * Declare that a (shape, palette) pair is needed. Must be called before buildAtlas().
 * Returns a handle whose `base` is only valid after the build.
 *
 * Frame ids for a pair are laid out so the hot path can do plain arithmetic:
 *     id = base + flash * (nf * 2) + frame * 2 + dir      (dir: 0 = left, 1 = right)
 */
export function registerSprite(shape, palette, rot = 0) {
  const key = `${shape}:${palette}`;
  let e = registry.get(key);
  if (!e) {
    const s = SHAPES[shape];
    if (!s) throw new Error(`sprites: unknown shape "${shape}"`);
    // nf/nd below are provisional: buildAtlas overwrites them if a PMD sheet is supplied.
    // rot = 0 means the usual left/right pair. rot = N bakes N evenly spaced angles instead,
    // which is how a leaf missile or a boomerang can point anywhere without a ctx transform.
    e = {
      key, shape, palette, base: -1,
      nf: s.frames.length, nd: rot || 2, rot,
      w: s.w, h: s.h, ox: s.ox, oy: s.oy,
    };
    registry.set(key, e);
  } else if (rot && e.rot !== rot) {
    throw new Error(`sprites: "${key}" registered with conflicting rotation counts`);
  }
  return e;
}

/** Direction slot count for a registered pair: 2 for left/right, or the baked rotation count. */
export function spriteDirs(shape, palette) {
  const e = registry.get(`${shape}:${palette}`);
  return e ? e.nd : 2;
}

/** Map a heading in radians to a baked rotation slot. `nd` must be a power of two. */
export function angleSlot(angle, nd) {
  return Math.round(angle / (Math.PI * 2) * nd) & (nd - 1);
}

/** Look up a registered pair after the build. Throws rather than silently drawing the wrong thing. */
export function spriteBase(shape, palette) {
  const e = registry.get(`${shape}:${palette}`);
  if (!e || e.base < 0) throw new Error(`sprites: "${shape}:${palette}" was not registered before buildAtlas()`);
  return e.base;
}

export function spriteInfo(shape, palette) {
  return registry.get(`${shape}:${palette}`);
}

// --- The compiler -----------------------------------------------------------

export function buildAtlas() {
  if (built) return;
  const t0 = performance.now();

  ATLAS.width = ATLAS_W;
  ATLAS.height = ATLAS_H;
  const actx = ATLAS.getContext('2d', { willReadFrequently: false });
  const img = actx.createImageData(ATLAS_W, ATLAS_H);
  const buf = new Uint32Array(img.data.buffer);
  const alloc = shelfPacker(ATLAS_W, ATLAS_H);

  for (const e of registry.values()) {
    const shape = SHAPES[e.shape];
    // A supplied image replaces the drawn art for this shape entirely, including its dimensions.
    const over = getOverride(e.shape);
    // A PMD sheet supplies 8 direction rows and N frame columns, which slots straight into the
    // existing id arithmetic: base + flash*(nf*nd) + frame*nd + dir, with nd = 8.
    const sheet = getSheet(e.shape);
    if (sheet) {
      e.w = sheet.w; e.h = sheet.h; e.ox = sheet.ox; e.oy = sheet.oy;
      e.nf = sheet.cols; e.nd = 8; e.sheet = true;
    } else if (over) {
      e.w = over.w; e.h = over.h; e.ox = over.w >> 1; e.oy = over.h - 2;
    }
    e.base = FRAMES.length;

    const sw = sheet ? sheet.w : over ? over.w : shape.w;
    const sh = sheet ? sheet.h : over ? over.h : shape.h;
    const sox = (sheet || over) ? e.ox : shape.ox;
    const soy = (sheet || over) ? e.oy : shape.oy;
    // A rotated sprite needs a square box big enough for its diagonal, or the corners clip.
    const box = e.rot ? Math.ceil(Math.hypot(sw, sh) / 2) * 2 : 0;

    for (let flash = 0; flash < 2; flash++) {
      const pal = packPalette(e.palette, flash === 1);
      for (let f = 0; f < e.nf; f++) {
        const rows = shape.frames[f];
        for (let d = 0; d < e.nd; d++) {
          if (e.rot) {
            const { sx, sy } = alloc(box, box);
            if (over) blitImageRot(buf, over, sox, soy, sx, sy, (d / e.nd) * Math.PI * 2, box, flash === 1);
            else blitRot(buf, rows, shape, sx, sy, pal, (d / e.nd) * Math.PI * 2, box);
            FRAMES.push({ sx, sy, w: box, h: box, ox: box >> 1, oy: box >> 1 });
          } else if (sheet) {
            // Row d is the facing direction, column f the animation frame. No mirroring: the
            // sheet already contains every direction drawn by hand.
            const { sx, sy } = alloc(sw, sh);
            blitSheet(buf, sheet, f, d, sx, sy, flash === 1);
            FRAMES.push({ sx, sy, w: sw, h: sh, ox: sox, oy: soy });
          } else {
            const mirror = d === 0;                 // d 0 = left = mirrored source
            const { sx, sy } = alloc(sw, sh);
            if (over) blitImage(buf, over, sx, sy, mirror, flash === 1);
            else blit(buf, rows, sw, sh, sx, sy, pal, mirror);
            FRAMES.push({
              sx, sy, w: sw, h: sh,
              // Mirroring flips the origin too, or a flipped sprite drifts sideways as it turns.
              ox: mirror ? sw - 1 - sox : sox,
              oy: soy,
            });
          }
        }
      }
    }
  }

  buildFont(buf, alloc);
  buildShadow(buf, alloc);

  actx.putImageData(img, 0, 0);
  built = true;

  const ms = performance.now() - t0;
  const fill = alloc.usedRows() / ATLAS_H;
  if (fill > 0.85) console.warn(`sprites: atlas ${Math.round(fill * 100)}% full`);
  if (FRAMES.length > 4000) console.warn(`sprites: ${FRAMES.length} frames is a lot`);
  return { frames: FRAMES.length, ms, fill };
}

/** Rasterise one pixel-map frame into the atlas buffer. Rows may omit trailing transparency. */
function blit(buf, rows, w, h, dx, dy, pal, mirror) {
  for (let y = 0; y < h; y++) {
    const row = rows[y] || '';
    const len = row.length;
    const dst = (dy + y) * ATLAS_W + dx;
    for (let x = 0; x < w; x++) {
      const srcX = mirror ? w - 1 - x : x;
      if (srcX >= len) continue;                     // padded transparency
      const idx = CHARMAP[row.charCodeAt(srcX)] | 0;
      if (idx) buf[dst + x] = pal[idx];
    }
  }
}

/** Whiten a packed pixel toward white while preserving its alpha -- the hit-flash variant. */
function whiten(px, t) {
  const a = px >>> 24;
  if (a === 0) return 0;
  const b = (px >>> 16) & 255, g = (px >>> 8) & 255, r = px & 255;
  const nr = Math.round(r + (255 - r) * t);
  const ng = Math.round(g + (255 - g) * t);
  const nb = Math.round(b + (255 - b) * t);
  return ((a << 24) | (nb << 16) | (ng << 8) | nr) >>> 0;
}

/** Copy one cell (frame `col`, direction `row`) of a PMD sheet into the atlas. */
function blitSheet(buf, sheet, col, row, dx, dy, flash) {
  const srcX = col * sheet.w;
  const srcY = row * sheet.h;
  for (let y = 0; y < sheet.h; y++) {
    const src = (srcY + y) * sheet.sheetW + srcX;
    const dst = (dy + y) * ATLAS_W + dx;
    for (let x = 0; x < sheet.w; x++) {
      const px = sheet.data[src + x];
      if ((px >>> 24) === 0) continue;
      buf[dst + x] = flash ? whiten(px, 0.85) : px;
    }
  }
}

/** Copy a supplied image into the atlas, optionally mirrored and/or whitened. */
function blitImage(buf, img, dx, dy, mirror, flash) {
  for (let y = 0; y < img.h; y++) {
    const src = y * img.w;
    const dst = (dy + y) * ATLAS_W + dx;
    for (let x = 0; x < img.w; x++) {
      const px = img.data[src + (mirror ? img.w - 1 - x : x)];
      if ((px >>> 24) === 0) continue;             // fully transparent
      buf[dst + x] = flash ? whiten(px, 0.85) : px;
    }
  }
}

/** Rotated copy of a supplied image, nearest-neighbour, matching the pixel-map path. */
function blitImageRot(buf, img, ox, oy, dx, dy, angle, box, flash) {
  const cos = Math.cos(angle), sin = Math.sin(angle);
  const c = box / 2;
  for (let y = 0; y < box; y++) {
    const oy2 = y + 0.5 - c;
    const dst = (dy + y) * ATLAS_W + dx;
    for (let x = 0; x < box; x++) {
      const ox2 = x + 0.5 - c;
      const u = ox2 * cos + oy2 * sin + ox;
      const v = -ox2 * sin + oy2 * cos + oy;
      const sxI = Math.floor(u), syI = Math.floor(v);
      if (sxI < 0 || syI < 0 || sxI >= img.w || syI >= img.h) continue;
      const px = img.data[syI * img.w + sxI];
      if ((px >>> 24) === 0) continue;
      buf[dst + x] = flash ? whiten(px, 0.85) : px;
    }
  }
}

/**
 * Rasterise one frame rotated by `angle` into a `box` x `box` cell. Nearest-neighbour by inverse
 * mapping -- chunky, which is exactly right for pixel art, and it happens once at boot.
 */
function blitRot(buf, rows, shape, dx, dy, pal, angle, box) {
  const cos = Math.cos(angle), sin = Math.sin(angle);
  const c = box / 2;
  for (let y = 0; y < box; y++) {
    const oy = y + 0.5 - c;
    const dst = (dy + y) * ATLAS_W + dx;
    for (let x = 0; x < box; x++) {
      const ox = x + 0.5 - c;
      // Inverse-rotate the destination offset back into source space.
      const u = ox * cos + oy * sin + shape.ox;
      const v = -ox * sin + oy * cos + shape.oy;
      const sxI = Math.floor(u), syI = Math.floor(v);
      if (sxI < 0 || syI < 0 || sxI >= shape.w || syI >= shape.h) continue;
      const row = rows[syI] || '';
      if (sxI >= row.length) continue;
      const idx = CHARMAP[row.charCodeAt(sxI)] | 0;
      if (idx) buf[dst + x] = pal[idx];
    }
  }
}

// --- Font -------------------------------------------------------------------

function buildFont(buf, alloc) {
  for (const [name, hex] of Object.entries(FONT_COLORS)) {
    const color = packColor(hex);
    fontIndex.set(name, FRAMES.length);
    for (const ch of glyphOrder) {
      const enc = FONT[ch];
      const { sx, sy } = alloc(GLYPH_W, GLYPH_H);
      for (let y = 0; y < GLYPH_H; y++) {
        const bits = B32.indexOf(enc[y]);
        const dst = (sy + y) * ATLAS_W + sx;
        for (let x = 0; x < GLYPH_W; x++) {
          if (bits & (1 << (GLYPH_W - 1 - x))) buf[dst + x] = color;
        }
      }
      FRAMES.push({ sx, sy, w: GLYPH_W, h: GLYPH_H, ox: 0, oy: 0 });
    }
  }
}

// --- Shared shadow ----------------------------------------------------------
// One translucent ellipse under every entity, rather than a shadow variant per sprite.

export let SHADOW = -1;

function buildShadow(buf, alloc) {
  const w = 12, h = 5;
  const { sx, sy } = alloc(w, h);
  const col = packColor('#000000', 70);
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const dx = (x - (w - 1) / 2) / (w / 2), dy = (y - (h - 1) / 2) / (h / 2);
      if (dx * dx + dy * dy <= 1) buf[(sy + y) * ATLAS_W + sx + x] = col;
    }
  }
  SHADOW = FRAMES.length;
  FRAMES.push({ sx, sy, w, h, ox: w >> 1, oy: h >> 1 });
}

// --- Drawing ----------------------------------------------------------------

/** Draw a registered frame with its origin at (x, y). One drawImage, no state changes. */
export function drawSprite(ctx, id, x, y) {
  const f = FRAMES[id];
  if (!f) return;
  ctx.drawImage(ATLAS, f.sx, f.sy, f.w, f.h, (x - f.ox) | 0, (y - f.oy) | 0, f.w, f.h);
}

/** Draw a frame scaled about its origin -- used for pop/scale FX only, not the bulk entities. */
export function drawSpriteScaled(ctx, id, x, y, k) {
  const f = FRAMES[id];
  if (!f) return;
  const w = f.w * k, h = f.h * k;
  ctx.drawImage(ATLAS, f.sx, f.sy, f.w, f.h, Math.round(x - f.ox * k), Math.round(y - f.oy * k), w, h);
}

export function drawShadow(ctx, x, y, k = 1) {
  if (k === 1) drawSprite(ctx, SHADOW, x, y);
  else drawSpriteScaled(ctx, SHADOW, x, y, k);
}

// --- Text -------------------------------------------------------------------

export const textWidth = (str, spacing = 1) => str.length * (GLYPH_W + spacing) - spacing;

/**
 * Draw a string of the pixel font. Unknown characters fall back to space, and lowercase maps to
 * uppercase so callers never have to think about it.
 */
export function drawText(ctx, str, x, y, color = 'white', spacing = 1) {
  const base = fontIndex.get(color);
  if (base === undefined) return;
  let px = x | 0;
  const py = y | 0;
  for (let i = 0; i < str.length; i++) {
    let ch = str[i];
    if (!glyphSlot.has(ch)) {
      const up = ch.toUpperCase();
      ch = glyphSlot.has(up) ? up : ' ';
    }
    const f = FRAMES[base + glyphSlot.get(ch)];
    // Skip blank glyphs entirely -- a space is a third of typical text.
    if (ch !== ' ') ctx.drawImage(ATLAS, f.sx, f.sy, f.w, f.h, px, py, f.w, f.h);
    px += GLYPH_W + spacing;
  }
  return px - x - spacing;
}

/**
 * Draw text scaled up by an integer factor. Used for the title logo -- authoring a separate
 * display font for nine letters would be a lot of pixels for very little gain.
 */
export function drawTextScaled(ctx, str, x, y, k, color = 'white', spacing = 1) {
  const base = fontIndex.get(color);
  if (base === undefined) return 0;
  let px = x | 0;
  for (let i = 0; i < str.length; i++) {
    let ch = str[i];
    if (!glyphSlot.has(ch)) {
      const up = ch.toUpperCase();
      ch = glyphSlot.has(up) ? up : ' ';
    }
    if (ch !== ' ') {
      const f = FRAMES[base + glyphSlot.get(ch)];
      ctx.drawImage(ATLAS, f.sx, f.sy, f.w, f.h, px, y | 0, f.w * k, f.h * k);
    }
    px += (GLYPH_W + spacing) * k;
  }
  return px - x;
}

export const textWidthScaled = (str, k, spacing = 1) =>
  str.length * (GLYPH_W + spacing) * k - spacing * k;

/** Scaled text with a hard outline, centred -- the logo treatment. */
export function drawLogo(ctx, str, cx, y, k, fill, outline) {
  const w = textWidthScaled(str, k);
  const x = Math.round(cx - w / 2);
  // Eight-way offset outline, then the fill on top.
  for (let dy = -k; dy <= k; dy += k) {
    for (let dx = -k; dx <= k; dx += k) {
      if (!dx && !dy) continue;
      drawTextScaled(ctx, str, x + dx, y + dy, k, outline);
    }
  }
  drawTextScaled(ctx, str, x, y, k, fill);
}

export function drawTextCentered(ctx, str, cx, y, color = 'white', spacing = 1) {
  drawText(ctx, str, Math.round(cx - textWidth(str, spacing) / 2), y, color, spacing);
}
