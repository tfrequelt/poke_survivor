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
