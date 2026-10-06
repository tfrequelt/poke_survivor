// L1 -- may import L0 (util, data).
//
// Which terrain sits on a given world tile, for the stages drawn from a PMD tileset.
//
// The layout is DERIVED, never stored: the world is unbounded, so there is nothing to store it
// in. Every answer comes from hash2(), which means walking away from a room and coming back
// finds the same room, and two players on the same seed see the same ground.
//
// Speed matters -- this is called once per visible tile, about 450 times a frame. The cost is
// kept to a handful of hash2 calls by a single rule: a room and its border must fit entirely
// inside its own cell of the coarse room grid. That makes the lookup local, so a tile only ever
// has to ask ONE cell whether it contains a room, instead of asking all nine neighbours.

import { hash2 } from './util.js';
import { G } from './state.js';
import { TILESETS } from './data/tilesets.js';

/** What `terrainAt` returns. FLOOR and the ring pieces index into a tileset's `ring`. */
export const T = {
  WILD: 0,
  OPEN: 1,
  FLOOR: 2,
  N: 3,
  S: 4,
  W: 5,
  E: 6,
  NW: 7,
  NE: 8,
  SW: 9,
  SE: 10,
};

// Layout defaults, overridden per tileset by its `layout` block. A cell is `cell` tiles square
// and holds at most one room; `margin` leaves space for the border ring plus a gap, so
// neighbouring rooms never share a wall and a ring never crosses into the next cell -- which is
// the invariant that keeps this lookup local, and therefore fast.
const DEFAULTS = { cell: 18, minRoom: 5, margin: 3, roomChance: 0.76, patch: 0.42 };

// Scratch, reused. Returning a fresh object per call would allocate ~450 times a frame.
const _room = { x: 0, y: 0, w: 0, h: 0, ok: false };

/**
 * Which row of a multi-tile border the last terrainAt() answer fell on, valid until the next
 * call. A module-level out-parameter rather than a returned object, for the same reason as
 * _room: this runs once per visible tile and must not allocate.
 */
export let ringRow = 0;

/**
 * The room in cell (cx, cy), or ok:false if that cell has none.
 *
 * Roughly three cells in four hold a room; the empty ones are what stop the world reading as
 * graph paper.
 */
function roomIn(cx, cy, seed, L) {
  const r = _room;
  if (hash2(cx * 2 + seed, cy * 2 + 91) > L.roomChance) { r.ok = false; return r; }

  const span = L.cell - L.margin * 2;
  const minRoom = Math.min(L.minRoom, span);
  const w = minRoom + ((hash2(cx + 17, cy + seed) * (span - minRoom + 1)) | 0);
  const h = minRoom + ((hash2(cx + seed, cy + 43) * (span - minRoom + 1)) | 0);
  r.w = Math.min(w, span);
  r.h = Math.min(h, span);
  r.x = cx * L.cell + L.margin + ((hash2(cx + 61, cy + 7) * (span - r.w + 1)) | 0);
  r.y = cy * L.cell + L.margin + ((hash2(cx + 5, cy + 71) * (span - r.h + 1)) | 0);
  r.ok = true;
  return r;
}

/**
 * Terrain for one world tile.
 *
 * The tileset carries its own layout knobs and border shape, so a stage tunes how open or how
 * warren-like it feels purely from data.
 */
export function terrainAt(tx, ty, seed, set) {
  // `layout: null` means the stage is one open floor -- Mt. Thunder has no rooms to generate.
  if (set.layout === null) return T.FLOOR;
  const L = set.layout || DEFAULTS;
  const northTall = set.ring.north.length;
  const cx = Math.floor(tx / L.cell);
  const cy = Math.floor(ty / L.cell);
  const r = roomIn(cx, cy, seed, L);

  if (r.ok) {
    const insideX = tx >= r.x && tx < r.x + r.w;
    const insideY = ty >= r.y && ty < r.y + r.h;
    if (insideX && insideY) return T.FLOOR;

    const onNorth = ty >= r.y - northTall && ty < r.y;
    const onSouth = ty === r.y + r.h;
    const onWest = tx === r.x - 1;
    const onEast = tx === r.x + r.w;
    ringRow = onNorth ? ty - (r.y - northTall) : 0;

    if (insideX && onNorth) return T.N;
    if (insideX && onSouth) return T.S;
    if (insideY && onWest) return T.W;
    if (insideY && onEast) return T.E;

    // Diagonals. A tileset with cut corners leaves them as wild ground, which is how Beach Cave
    // rounds its rooms off.
    if (!set.ring.cutCorners) {
      if (onWest && onNorth) return T.NW;
      if (onEast && onNorth) return T.NE;
      if (onWest && onSouth) return T.SW;
      if (onEast && onSouth) return T.SE;
    }
  }

  if (!set.open) return T.WILD;

  // Open ground: large soft blobs of the second terrain, on their own much coarser grid, so the
  // meadow is broken up independently of where the rooms happen to be.
  const bx = Math.floor(tx / 7), by = Math.floor(ty / 7);
  const n = hash2(bx + 311, by + 977) * 0.55
          + hash2(Math.floor(tx / 15) + 13, Math.floor(ty / 15) + 29) * 0.45;
  return n < L.patch ? T.OPEN : T.WILD;
}

/** Which ring entry a terrain value names, or null for the two ground layers. */
export const RING_KEY = [
  null, null, null, 'north', 'south', 'west', 'east', 'nw', 'ne', 'sw', 'se',
];

// --- Ponds -------------------------------------------------------------------------------------
//
// Water laid over an autotiled floor (the grass and beach stages). Derived, like the rooms: the
// floor is cut into coarse cells, a cell holds a pond or not, and a pond is one or two ellipses
// that fit inside their own cell -- so asking whether a tile is water asks one cell, a couple of
// hashes, and no pond ever spills into the next cell's business.
//
// Never near the start (the run, every floor, and the way back from a secret floor all put you at
// the origin) and never against the wall, so a pond cannot pin anyone into a corner.

/**
 * Is world tile (tx, ty) water? `P` is a tileset's `ponds` block; `b` the floor in tiles
 * ({tx0, ty0, tx1, ty1}) or null for an unbounded floor.
 */
export function waterAt(tx, ty, seed, P, b) {
  const m = P.wallMargin;
  if (b && (tx < b.tx0 + m || tx > b.tx1 - m || ty < b.ty0 + m || ty > b.ty1 - m)) return false;
  if (tx * tx + ty * ty < P.clearStart * P.clearStart) return false;
  const cs = P.cell;
  const cx = Math.floor(tx / cs), cy = Math.floor(ty / cs);
  if (hash2(cx * 3 + seed, cy * 5 + 17) > P.chance) return false;
  const n = hash2(cx + 401, cy + seed) < P.second ? 2 : 1;
  for (let k = 0; k < n; k++) {
    const rx = P.rMin + hash2(cx + 13 * k + 3, cy + 7) * (P.rMax - P.rMin);
    const ry = P.rMin + hash2(cx + 5, cy + 11 * k + 9) * (P.rMax - P.rMin);
    // The centre is placed so the whole ellipse stays a tile inside its cell.
    const ex = cx * cs + 1 + rx + hash2(cx + 29 + k, cy + 31) * (cs - 2 - 2 * rx);
    const ey = cy * cs + 1 + ry + hash2(cx + 37, cy + 41 + k) * (cs - 2 - 2 * ry);
    const dx = (tx + 0.5 - ex) / rx, dy = (ty + 0.5 - ey) / ry;
    if (dx * dx + dy * dy <= 1) return true;
  }
  return false;
}

/**
 * Tilesets whose art actually loaded (filled by autotile.js). Water only blocks anyone when it can
 * be SEEN: a missing sheet falls back to the drawn ground, and invisible ponds would be a bug.
 */
export const pondsReady = new Set();

// The current stage's ponds and floor, recomputed only when the stage (or the secret floor) changes.
let _stage = null, _secret = false, _P = null, _B = null, _S = 24;

function pondsNow() {
  const st = G.stage;
  if (st !== _stage || G.secret !== _secret) {
    _stage = st;
    _secret = G.secret;
    const set = st && TILESETS[st.tileset];
    // The secret floor's room stays dry: it is an arena, not a stage.
    _P = !G.secret && set && set.ponds && pondsReady.has(st.tileset) ? set.ponds : null;
    _S = set ? set.size : 24;
    const a = st && st.arena;
    _B = a ? {
      tx0: Math.ceil(-a.w / 2 / _S), ty0: Math.ceil(-a.h / 2 / _S),
      tx1: Math.floor(a.w / 2 / _S) - 1, ty1: Math.floor(a.h / 2 / _S) - 1,
    } : null;
  }
  return _P;
}

/** Does the current floor have water at all? Cheap; lets the hot loops skip every check. */
export const pondsActive = () => pondsNow() !== null;

/** Is the world point (x, y) on water, on the current floor? */
export function waterAtWorld(x, y) {
  const P = pondsNow();
  if (!P) return false;
  return waterAt(Math.floor(x / _S), Math.floor(y / _S), G.seed, P, _B);
}

/** The water grid's tile size on the current floor, in pixels. */
export const pondTileSize = () => { pondsNow(); return _S; };

/** Can a walker stand on world tile (tx, ty)? Not on water, and not outside the floor. */
export function walkableTile(tx, ty) {
  const P = pondsNow();
  const b = _B;
  if (b && (tx < b.tx0 || tx > b.tx1 || ty < b.ty0 || ty > b.ty1)) return false;
  return !P || !waterAt(tx, ty, G.seed, P, b);
}

const _land = { x: 0, y: 0 };

/**
 * The nearest dry point to (x, y), searched outward in rings. Returns (x, y) itself when it is
 * already dry. The result is a shared scratch object: copy it before the next call.
 */
export function nearestLand(x, y) {
  _land.x = x; _land.y = y;
  if (!waterAtWorld(x, y)) return _land;
  const b = G.bounds;
  for (let r = 12; r <= 360; r += 12) {
    const n = Math.max(8, Math.round(r / 5));
    for (let i = 0; i < n; i++) {
      const a = (i / n) * Math.PI * 2;
      const px = x + Math.cos(a) * r, py = y + Math.sin(a) * r;
      if (b && (px < b.minX + 16 || px > b.maxX - 16 || py < b.minY + 16 || py > b.maxY - 16)) continue;
      if (!waterAtWorld(px, py)) { _land.x = px; _land.y = py; return _land; }
    }
  }
  return _land;
}
