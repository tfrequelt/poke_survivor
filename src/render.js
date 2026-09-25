// L4 -- may import L0-L3, read-only on L3.
// Canvas sizing and the integer blit, the camera, the background, and frame presentation.

import { G } from './state.js';
import { clamp, damp, hash2, TAU } from './util.js';
import { getImage } from './assets.js';
import { TILESETS } from './data/tilesets.js';
import { T, RING_KEY, terrainAt, ringRow } from './terrain.js';

export const VW = 640;   // internal render width  -- world units ARE render pixels
export const VH = 360;   // internal render height -- 640x360 * 3 = 1920x1080 exactly
export const HALF_W = VW / 2;
export const HALF_H = VH / 2;

// The offscreen buffer everything draws into, always exactly VW x VH.
export const game = document.createElement('canvas');
game.width = VW;
game.height = VH;
export const ctx = game.getContext('2d', { alpha: false });
ctx.imageSmoothingEnabled = false;

// The on-screen canvas. Only ever receives one drawImage per frame.
let view = null;
let vctx = null;
export let scale = 1;    // integer device-pixel scale factor

export function initRender() {
  view = document.getElementById('view');
  vctx = view.getContext('2d', { alpha: false });
  vctx.imageSmoothingEnabled = false;

  resize();
  window.addEventListener('resize', scheduleResize);
  window.addEventListener('orientationchange', scheduleResize);
  // devicePixelRatio changes when the window moves between monitors with different scaling.
  matchMedia(`(resolution: ${devicePixelRatio}dppx)`).addEventListener?.('change', scheduleResize);
}

let resizePending = false;
function scheduleResize() {
  if (resizePending) return;
  resizePending = true;
  requestAnimationFrame(() => { resizePending = false; resize(); });
}

/**
 * The single most important function for image quality.
 *
 * A canvas sized in CSS pixels with `image-rendering: pixelated` looks WRONG at a non-integer
 * devicePixelRatio -- and Windows defaults to 125% on a great many laptops, giving dpr 1.25.
 * At that ratio some game-pixel rows land on 3 device pixels and their neighbours on 4, so the
 * sprites visibly shimmer and the art looks dirty.
 *
 * The fix: choose an INTEGER device-pixel scale `k` first, size the backbuffer to VW*k x VH*k
 * device pixels, then derive the CSS size back down by dividing by dpr. Every game pixel is then
 * exactly k x k device pixels, whatever the display scaling is.
 */
export function resize() {
  const dpr = window.devicePixelRatio || 1;
  const cssFit = Math.min(window.innerWidth / VW, window.innerHeight / VH);
  const k = Math.max(1, Math.floor(cssFit * dpr));

  scale = k;
  view.width = VW * k;
  view.height = VH * k;
  view.style.width = (VW * k / dpr) + 'px';
  view.style.height = (VH * k / dpr) + 'px';
  vctx.imageSmoothingEnabled = false;

  // DOM screens are positioned over the canvas, so they need the same box and a scale hook.
  const screens = document.getElementById('screens');
  if (screens) {
    screens.style.width = view.style.width;
    screens.style.height = view.style.height;
    screens.style.setProperty('--scale', String(k / dpr));
  }
}

// --- Camera -----------------------------------------------------------------

let shakeX = 0, shakeY = 0;

/** Snap the camera to a world position immediately (run start, teleports). */
export function snapCamera(x, y) {
  G.cam.x = x;
  G.cam.y = y;
  clampCamera();
}

// How far past the floor the camera may look. Two tiles of wall stay visible at the edge, which
// is what tells the player there IS an edge rather than just an invisible stop.
const WALL_PEEK = 48;

/**
 * Keep the view inside the arena.
 *
 * If an axis is narrower than the view there is nothing to scroll, so it centres instead --
 * otherwise the two clamps fight and the camera jitters between them.
 */
function clampCamera() {
  const b = G.bounds;
  if (!b) return;
  const minX = b.minX - WALL_PEEK + HALF_W;
  const maxX = b.maxX + WALL_PEEK - HALF_W;
  const minY = b.minY - WALL_PEEK + HALF_H;
  const maxY = b.maxY + WALL_PEEK - HALF_H;
  G.cam.x = minX > maxX ? (b.minX + b.maxX) / 2 : clamp(G.cam.x, minX, maxX);
  G.cam.y = minY > maxY ? (b.minY + b.maxY) / 2 : clamp(G.cam.y, minY, maxY);
}

export function updateCamera(dt) {
  const p = G.player;
  if (p) {
    // A touch of lag makes movement feel weighty without ever letting the player near the edge.
    G.cam.x = damp(G.cam.x, p.x, 0.0001, dt);
    G.cam.y = damp(G.cam.y, p.y, 0.0001, dt);
    clampCamera();
  }

  // Trauma-based shake: callers add trauma, offset scales with its square so small hits are subtle.
  const c = G.cam;
  c.trauma = Math.max(0, c.trauma - dt * 1.8);
  const amount = c.trauma * c.trauma * 6;
  if (amount > 0.01) {
    const t = G.tick;
    shakeX = Math.sin(t * 1.7) * amount;
    shakeY = Math.cos(t * 2.3) * amount;
  } else {
    shakeX = 0; shakeY = 0;
  }
}

export function addShake(amount) {
  G.cam.trauma = clamp(G.cam.trauma + amount, 0, 1);
}

/** Camera top-left in world space, rounded so the world never lands on half pixels. */
export function camLeft()  { return Math.round(G.cam.x - HALF_W + shakeX); }
export function camTop()   { return Math.round(G.cam.y - HALF_H + shakeY); }

/** World -> screen. Both are in the same unit, so this is a translation only. */
export const toScreenX = (wx) => wx - camLeft();
export const toScreenY = (wy) => wy - camTop();

/** Is a world-space circle worth drawing/updating? `margin` widens the test. */
export function inView(wx, wy, r, margin = 0) {
  const sx = toScreenX(wx), sy = toScreenY(wy);
  const m = r + margin;
  return sx > -m && sx < VW + m && sy > -m && sy < VH + m;
}

// --- Background -------------------------------------------------------------
// One fillRect for the whole screen, then sparse decoration drawn only for visible tiles.
// Tile contents come from hash2(), so an infinite field costs zero storage.

const TILE = 16;          // scatter cell; smaller than before, so decoration reads as texture
const PATCH = 64;         // large colour blotch cell

/**
 * Layered ground. Everything is derived from hash2(), so an infinite world costs no storage and
 * looks identical every time you walk back over it.
 *
 * Layer order matters: base fill, then big soft patches to break up the flat colour, then a path
 * strip, then fine scatter on top. Props are entities, drawn later with the rest of the world.
 */
export function drawBackground(stage) {
  drawGround(stage, 0, 0, VW, VH, camLeft(), camTop(), G.seed);
}

// --- Tiled ground -----------------------------------------------------------
//
// A stage with a `tileset` is drawn from a ripped PMD dungeon map rather than the procedural
// layers below: one drawImage per 24px cell, around 450 of them a frame at 640x360.
//
// The layout comes from terrain.js and is derived from the seed, so walking back over ground
// finds it unchanged without anything having been stored.

const _ts = { name: '', set: null, img: null };

/** The tileset for a stage, or null if it has none or its image did not load. */
function tilesetFor(stage) {
  const name = (stage && stage.tileset) || '';
  if (_ts.name !== name) {
    const set = TILESETS[name] || null;
    _ts.name = name;
    _ts.set = set;
    _ts.img = set ? getImage(set.image) || null : null;
    // A missing image is not fatal -- the stage falls back to the drawn layers, the same
    // contract every other supplied asset has.
    if (set && !_ts.img) console.info(`[render] tileset "${name}" has no image; using drawn ground`);
  }
  return _ts.img ? _ts.set : null;
}

// Source rect, reused. Nothing in this loop may allocate.
const _sx = { x: 0, y: 0 };

/** Source cell of a terrain block, sampled so the map's own texture repeats seamlessly. */
function blockCell(set, block, tx, ty) {
  const P = set.pitch || set.size;
  const bx = ((tx % block[2]) + block[2]) % block[2];
  const by = ((ty % block[3]) + block[3]) % block[3];
  _sx.x = set.origin[0] + (block[0] + bx) * P;
  _sx.y = set.origin[1] + (block[1] + by) * P;
}

/** Source cell of one named ring tile. `row` picks within a multi-tile side. */
function ringCell(set, ring, key, row) {
  const P = set.pitch || set.size;
  const e = ring[key];
  const cell = Array.isArray(e[0]) ? e[Math.min(row, e.length - 1)] : e;
  _sx.x = set.origin[0] + cell[0] * P;
  _sx.y = set.origin[1] + cell[1] * P;
}

/**
 * The stage wall, as a nine-slice of the border ring around the playable floor.
 *
 * `bounds` is the floor in tiles. A tile left of it takes the west column, above it the north
 * row, and the diagonals take the corners -- exactly how a rectangular rock mass is drawn. Once
 * a tile is more than one step outside, it is deep in the wall and takes the fill block, so the
 * world ends in something solid rather than in bare canvas.
 */
function borderCell(set, tx, ty, b) {
  const border = set.border;
  const cx = tx < b.tx0 ? -1 : tx > b.tx1 ? 1 : 0;
  const cy = ty < b.ty0 ? -1 : ty > b.ty1 ? 1 : 0;
  const edge = (cx === -1 && tx === b.tx0 - 1) || (cx === 1 && tx === b.tx1 + 1)
    || (cy === -1 && ty === b.ty0 - 1) || (cy === 1 && ty === b.ty1 + 1);
  if (!edge) { blockCell(set, border.fill, tx, ty); return; }

  const key = cy === -1
    ? (cx === -1 ? 'nw' : cx === 1 ? 'ne' : 'north')
    : cy === 1
      ? (cx === -1 ? 'sw' : cx === 1 ? 'se' : 'south')
      : (cx === -1 ? 'west' : 'east');
  ringCell(set, border.ring, key, 0);
}

// The playable floor in tiles, recomputed only when the arena changes.
const _bounds = { tx0: 0, ty0: 0, tx1: 0, ty1: 0, key: '' };

function floorTiles(stage, S) {
  const a = stage && stage.arena;
  const key = a ? `${a.w}x${a.h}x${S}` : '';
  if (_bounds.key !== key) {
    _bounds.key = key;
    if (a) {
      _bounds.tx0 = Math.ceil(-a.w / 2 / S);
      _bounds.ty0 = Math.ceil(-a.h / 2 / S);
      _bounds.tx1 = Math.floor(a.w / 2 / S) - 1;
      _bounds.ty1 = Math.floor(a.h / 2 / S) - 1;
    }
  }
  return a ? _bounds : null;
}

function drawTiled(set, dx, dy, dw, dh, left, top, seed, stage) {
  const img = _ts.img.canvas;
  const S = set.size;
  const ring = set.ring;
  // A border only exists for a bounded stage that has the art for one.
  const b = set.border ? floorTiles(stage, S) : null;

  const tx0 = Math.floor(left / S), ty0 = Math.floor(top / S);
  const tx1 = Math.floor((left + dw - 1) / S), ty1 = Math.floor((top + dh - 1) / S);

  for (let ty = ty0; ty <= ty1; ty++) {
    const py = dy + ty * S - top;
    const outsideY = b && (ty < b.ty0 || ty > b.ty1);
    for (let tx = tx0; tx <= tx1; tx++) {
      if (b && (outsideY || tx < b.tx0 || tx > b.tx1)) {
        borderCell(set, tx, ty, b);
      } else {
        const t = terrainAt(tx, ty, seed, set);
        if (t === T.FLOOR) blockCell(set, set.floor, tx, ty);
        else if (t === T.OPEN) blockCell(set, set.open, tx, ty);
        else if (t === T.WILD) blockCell(set, set.wild, tx, ty);
        else {
          // An interior border piece. The sides that are a list are the multi-tile ones -- Tiny
          // Woods draws its cliff two tiles tall -- and ringRow says which this tile is.
          ringCell(set, ring, RING_KEY[t], ringRow);
        }
      }
      ctx.drawImage(img, _sx.x, _sx.y, S, S, dx + tx * S - left, py, S, S);
    }
  }
}

/**
 * The ground layers, into an arbitrary rectangle at an arbitrary world offset.
 *
 * drawBackground is the whole screen at the camera position; the stage-select screen draws the
 * same thing into a small preview window. Keeping one implementation means a preview can never
 * drift from what the stage actually looks like.
 */
export function drawGround(stage, dx, dy, dw, dh, left, top, seed = 1) {
  const pal = (stage && stage.ground) || DEFAULT_GROUND;
  // The full-screen case is the hot path, so it skips the clip and translate entirely.
  const windowed = dx !== 0 || dy !== 0 || dw !== VW || dh !== VH;
  if (windowed) {
    ctx.save();
    ctx.beginPath();
    ctx.rect(dx, dy, dw, dh);
    ctx.clip();
  }

  const set = tilesetFor(stage);
  if (set) {
    drawTiled(set, dx, dy, dw, dh, left, top, seed, stage);
    if (windowed) ctx.restore();
    return;
  }
  if (windowed) ctx.translate(dx, dy);

  ctx.fillStyle = pal.base;
  ctx.fillRect(0, 0, dw, dh);

  // --- Layer 2: large soft patches ---
  if (pal.patch) {
    const px0 = Math.floor(left / PATCH), py0 = Math.floor(top / PATCH);
    const px1 = Math.floor((left + dw) / PATCH), py1 = Math.floor((top + dh) / PATCH);
    for (let py = py0; py <= py1; py++) {
      for (let px = px0; px <= px1; px++) {
        const h = hash2(px + 311, py + 977);
        if (h > (pal.patchDensity || 0.5)) continue;
        const w = PATCH * (0.7 + hash2(px, py + 5) * 0.8);
        const hh = PATCH * (0.5 + hash2(px + 7, py) * 0.7);
        const ox = hash2(px + 41, py) * PATCH * 0.5;
        const oy = hash2(px, py + 41) * PATCH * 0.5;
        ctx.fillStyle = pal.patch[(h * 977) % 1 < 0.5 ? 0 : 1];
        ctx.beginPath();
        ctx.ellipse(px * PATCH - left + ox, py * PATCH - top + oy, w / 2, hh / 2, 0, 0, TAU);
        ctx.fill();
      }
    }
  }

  // --- Layer 3: a path / shoreline strip ---
  if (pal.path) {
    const band = Math.round(pal.path.spacing);
    const y0 = Math.floor(top / band) * band;
    for (let yy = y0; yy <= top + dh; yy += band) {
      const sy = yy - top;
      ctx.fillStyle = pal.path.color;
      ctx.fillRect(0, sy, dw, pal.path.width);
      // Ragged edges, so it is not a ruler-straight band.
      for (let x = 0; x < dw; x += 4) {
        const wob = (hash2(((left + x) / 4) | 0, yy) * 5) | 0;
        ctx.fillStyle = pal.base;
        ctx.fillRect(x, sy - 1, 4, wob - 2);
        ctx.fillRect(x, sy + pal.path.width - wob + 2, 4, wob);
      }
    }
  }

  // --- Layer 4: fine scatter ---
  const tx0 = Math.floor(left / TILE), ty0 = Math.floor(top / TILE);
  const tx1 = Math.floor((left + dw) / TILE), ty1 = Math.floor((top + dh) / TILE);
  const scatter = pal.scatter || [];

  for (let ty = ty0; ty <= ty1; ty++) {
    for (let tx = tx0; tx <= tx1; tx++) {
      const h = hash2(tx, ty);
      // One roll per cell decides which scatter kind lands here, if any.
      let acc = 0;
      for (let i = 0; i < scatter.length; i++) {
        const s = scatter[i];
        acc += s.density;
        if (h >= acc) continue;
        const ox = (hash2(tx + 9871, ty) * (TILE - 4)) | 0;
        const oy = (hash2(tx, ty + 7717) * (TILE - 4)) | 0;
        drawScatter(s, tx * TILE - left + ox, ty * TILE - top + oy);
        break;
      }
    }
  }

  drawDrawnBorder(pal, stage, dw, dh, left, top);

  if (windowed) ctx.restore();
}

/**
 * The arena edge for a stage with no tileset: everything outside the floor is painted over with
 * a flat fill and a band at the waterline.
 *
 * Drawn last, on top of the ground layers, because the layers are generated from world position
 * and have no idea the world stops.
 */
function drawDrawnBorder(pal, stage, dw, dh, left, top) {
  const a = stage && stage.arena;
  if (!a || !pal.outside) return;
  const x0 = -a.w / 2 - left, x1 = a.w / 2 - left;
  const y0 = -a.h / 2 - top, y1 = a.h / 2 - top;

  ctx.fillStyle = pal.outside;
  if (x0 > 0) ctx.fillRect(0, 0, x0, dh);
  if (x1 < dw) ctx.fillRect(x1, 0, dw - x1, dh);
  if (y0 > 0) ctx.fillRect(0, 0, dw, y0);
  if (y1 < dh) ctx.fillRect(0, y1, dw, dh - y1);

  if (!pal.edge) return;
  const b = 5;
  ctx.fillStyle = pal.edge;
  if (x0 > -b && x0 < dw) ctx.fillRect(x0 - b, 0, b, dh);
  if (x1 > 0 && x1 < dw + b) ctx.fillRect(x1, 0, b, dh);
  if (y0 > -b && y0 < dh) ctx.fillRect(0, y0 - b, dw, b);
  if (y1 > 0 && y1 < dh + b) ctx.fillRect(0, y1, dw, b);
}

function drawScatter(s, x, y) {
  ctx.fillStyle = s.color;
  switch (s.shape) {
    case 'tuft':                     // a few blades of grass
      ctx.fillRect(x, y, 1, 3);
      ctx.fillRect(x + 2, y + 1, 1, 2);
      ctx.fillRect(x + 1, y + 2, 1, 1);
      break;
    case 'flower':
      ctx.fillRect(x + 1, y, 2, 1);
      ctx.fillRect(x, y + 1, 4, 1);
      ctx.fillRect(x + 1, y + 2, 2, 1);
      break;
    case 'crystal':
      ctx.fillRect(x + 1, y, 1, 4);
      ctx.fillRect(x, y + 1, 3, 2);
      break;
    case 'shell':
      ctx.fillRect(x + 1, y, 2, 1);
      ctx.fillRect(x, y + 1, 4, 2);
      break;
    default:                         // 'dot'
      ctx.fillRect(x, y, 2, 1);
      break;
  }
}

const DEFAULT_GROUND = {
  base: '#2f7a3a',
  patch: ['#347f3f', '#2a7035'],
  patchDensity: 0.5,
  scatter: [
    { color: '#43a04f', shape: 'tuft', density: 0.22 },
    { color: '#276a32', shape: 'dot', density: 0.18 },
  ],
  path: null,
};

// --- Frame presentation -----------------------------------------------------

/** Blit the internal buffer to the screen. One drawImage, ~0.3-0.5ms at 1080p. */
export function present() {
  vctx.drawImage(game, 0, 0, VW, VH, 0, 0, view.width, view.height);
}

/**
 * Debug overlay, drawn to the VIEW canvas after the blit so it renders at native device
 * resolution -- crisp text without needing the pixel font, and it costs the game nothing.
 */
export function drawDebugOverlay(lines) {
  if (!lines.length) return;
  const pad = 6, lh = 14;
  vctx.save();
  vctx.font = '12px Consolas, monospace';
  vctx.textBaseline = 'top';
  let w = 0;
  for (const l of lines) w = Math.max(w, vctx.measureText(l).width);
  vctx.fillStyle = 'rgba(8,8,18,0.78)';
  vctx.fillRect(0, 0, w + pad * 2, lines.length * lh + pad * 2);
  vctx.fillStyle = '#9fe8a0';
  for (let i = 0; i < lines.length; i++) {
    vctx.fillText(lines[i], pad, pad + i * lh);
  }
  vctx.restore();
}

/** Filled circle helper used before the sprite atlas exists, and for FX afterwards. */
export function circle(sx, sy, r, color) {
  ctx.fillStyle = color;
  ctx.beginPath();
  ctx.arc(sx, sy, r, 0, TAU);
  ctx.fill();
}
