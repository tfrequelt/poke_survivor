// L3 -- may import L0-L2.
//
// Floor traps.
//
// Mystery Dungeon's floors are not flat: half of what makes a dungeon a dungeon is the tile you
// did not look at. Until this existed the arena was an empty plane with enemies walking across
// it, and the only thing that could hurt you was something that chased you.
//
// Placement is lifted wholesale from props.js, which already solved every hard part: a
// hash-derived candidate per grid cell so walking away and back finds the same trap in the same
// place without storing anything, spawning tested against the camera rectangle so nothing is
// ever seen arriving, a live cap, and a set of consumed cells that can never be repopulated.
//
// Two rules make these fair rather than annoying:
//
//   1. They REVEAL as you approach. Invisible past REVEAL_R, fading in to solid by the time you
//      are on top of one -- about half a second of warning at walking pace. A trap that fires
//      with no warning at all is not difficulty, it is a dice roll on your health bar.
//   2. ENEMIES SET THEM OFF TOO. This is the point. A trap you have spotted stops being a tax
//      and becomes terrain you can fight over, and a crowd chasing you through a minefield is
//      the best thing that can happen to a run.

import { G } from './state.js';
import { hash2, dist2 } from './util.js';
import { enemies, cellRange, cellStart, cellItems, GW, nextHitId, setDamageSource } from './world.js';
import { damagePlayer, damageEnemy, damageCircle, damageOverTime, damageSourceId } from './combat.js';

const CELL = 150;                 // one candidate per 150x150 world cell -- sparser than scenery
const RELEASE_RADIUS = 760;       // matches props: release well past the despawn ring
const MAX_LIVE = 16;
const VIEW_PAD = 40;

/** How close before a trap is visible at all, and how close before it fires. */
const REVEAL_R = 80;
const TRIGGER_R = 11;             // the tile is 24 across, so this is roughly its inner half

/** Base chance a cell holds a trap, before the floor multiplies it. */
const BASE_DENSITY = 0.055;

// --- The traps themselves ----------------------------------------------------
//
// Every effect is expressed through a seam that already exists -- damagePlayer for the player,
// damageEnemy / damageCircle / damageOverTime for the crowd, rootT for being held in place --
// so a trap can never become a second, divergent way to hurt something.

const TRAPS = {
  spike: {
    label: 'SPIKE TRAP', damage: 12, cell: [1, 143],
    onPlayer: () => damagePlayer(12),
    onEnemy: (e) => damageEnemy(e, 40, 0, 0, false),
  },
  explosion: {
    label: 'EXPLOSION TRAP', damage: 18, cell: [101, 168], radius: 54,
    onPlayer: (t) => { damagePlayer(18); blast(t); },
    onEnemy: (e, t) => { blast(t); },
  },
  slumber: {
    label: 'SLUMBER TRAP', cell: [1, 168],
    // The player is rooted, not damaged. Standing still for most of a second with a crowd on
    // you is already the punishment, and stacking damage on top would just be a spike trap.
    onPlayer: () => { const p = G.player; if (p) p.rootT = Math.max(p.rootT, 0.9); },
    onEnemy: (e) => { e.stunT = Math.max(e.stunT, 2.4); },
  },
  poison: {
    label: 'POISON TRAP', cell: [76, 143],
    onPlayer: () => damagePlayer(9),
    onEnemy: (e) => damageOverTime(e, 30),
  },
  warp: {
    label: 'WARP TRAP', cell: [151, 168], range: 260,
    onPlayer: () => warp(G.player),
    onEnemy: (e) => warp(e),
  },
};

export const TRAP_KEYS = Object.keys(TRAPS);
export const trapDef = (kind) => TRAPS[kind];

/** The explosion trap's area hit. Enemies only -- the player's share is applied by onPlayer. */
function blast(t) {
  damageCircle(t.x, t.y, TRAPS.explosion.radius, 55, nextHitId(), { knockback: 120 });
}

/** Throw whatever stepped on it somewhere else on the floor, inside the arena. */
function warp(ent) {
  if (!ent) return;
  const b = G.bounds;
  const a = G.rngRun() * Math.PI * 2;
  const d = 150 + G.rngRun() * TRAPS.warp.range;
  let x = ent.x + Math.cos(a) * d;
  let y = ent.y + Math.sin(a) * d;
  if (b) {
    x = Math.max(b.minX + 24, Math.min(b.maxX - 24, x));
    y = Math.max(b.minY + 24, Math.min(b.maxY - 24, y));
  }
  ent.x = x; ent.y = y;
  // A warped player keeps their velocity but not their knockback, and gets a breath of mercy so
  // they cannot be dropped straight into the middle of a pack and immediately chewed.
  if (ent === G.player) ent.iframes = Math.max(ent.iframes, 0.8);
}

// --- State -------------------------------------------------------------------

/** Cell key -> live trap record. At most MAX_LIVE of them. */
const active = new Map();

/** Cells whose trap has already gone off. Never repopulated, exactly like a cleared prop. */
const sprung = new Set();

let TRAP_SRC = 0;

export function resetTraps() {
  active.clear();
  sprung.clear();
}

export function trapCount() { return active.size; }

/** The live traps, for the renderer. */
export const liveTraps = () => active.values();

/** Density rises with depth, so a fourth floor is visibly worse ground than a first. */
const density = () => BASE_DENSITY * (1 + 0.35 * ((G.floor || 1) - 1));

export function updateTraps(dt) {
  const p = G.player;
  if (!p || !G.bounds) return;

  // Release first, so a trap left behind frees its slot.
  for (const [key, t] of active) {
    if (dist2(t.x, t.y, p.x, p.y) > RELEASE_RADIUS * RELEASE_RADIUS) active.delete(key);
  }

  place(p);

  // Reveal, then trigger. A trap the player has not been shown yet can still be set off by an
  // enemy, which is how you find out it was there.
  for (const [key, t] of active) {
    const d2 = dist2(t.x, t.y, p.x, p.y);
    const target = d2 < REVEAL_R * REVEAL_R ? 1 : 0;
    // Eased rather than snapped, so a trap fades up as you close instead of popping.
    t.reveal += (target - t.reveal) * Math.min(1, dt * 7);

    if (d2 < TRIGGER_R * TRIGGER_R) { fire(t, key, true); continue; }
    if (triggerByEnemy(t)) fire(t, key, false);
  }
}

/** The first live enemy standing on this trap, if any. */
function triggerByEnemy(t) {
  const range = cellRange(t.x, t.y, TRIGGER_R + 8);
  if (!range) return null;
  for (let gy = range.y0; gy <= range.y1; gy++) {
    const rowBase = gy * GW;
    for (let gx = range.x0; gx <= range.x1; gx++) {
      const c = rowBase + gx;
      const end = cellStart[c + 1];
      for (let k = cellStart[c]; k < end; k++) {
        const e = enemies[cellItems[k]];
        // Scenery does not walk, and a boss shrugging off a spike tile reads badly either way.
        if (!e.alive || e.prop || e.boss) continue;
        const rr = TRIGGER_R + e.r;
        if (dist2(t.x, t.y, e.x, e.y) <= rr * rr) return e;
      }
    }
  }
  return null;
}

function fire(t, key, byPlayer) {
  const def = TRAPS[t.kind];
  active.delete(key);
  sprung.add(key);
  // Trap damage to the crowd is a real contribution -- it is ground the player chose to fight
  // over -- so it gets its own line in the breakdown rather than vanishing into "other".
  setDamageSource(TRAP_SRC || (TRAP_SRC = damageSourceId('traps', 'Traps')));
  if (byPlayer) {
    def.onPlayer(t);
  } else {
    const e = triggerByEnemy(t);
    if (e) def.onEnemy(e, t);
  }
  setDamageSource(0);
  if (fx.sprung) fx.sprung(t, byPlayer);
}

/** Set by main.js so a sprung trap can make a noise and throw sparks without importing render. */
export const fx = { sprung: null };

function place(p) {
  if (active.size >= MAX_LIVE) return;
  const b = G.bounds;
  const dens = density();

  const vx0 = G.cam.x - 320 - VIEW_PAD, vx1 = G.cam.x + 320 + VIEW_PAD;
  const vy0 = G.cam.y - 180 - VIEW_PAD, vy1 = G.cam.y + 180 + VIEW_PAD;

  const cx = Math.floor(p.x / CELL);
  const cy = Math.floor(p.y / CELL);
  const reach = Math.ceil(RELEASE_RADIUS / CELL);

  for (let gy = cy - reach; gy <= cy + reach; gy++) {
    for (let gx = cx - reach; gx <= cx + reach; gx++) {
      // Offset from the prop hash so traps and scenery do not pick the same cells.
      const key = gx * 100003 + gy + 7919;
      if (active.has(key) || sprung.has(key)) continue;
      if (hash2(gx + 311, gy + 311) > dens) continue;

      const x = gx * CELL + hash2(gx + 41, gy) * (CELL - 32) + 16;
      const y = gy * CELL + hash2(gx, gy + 41) * (CELL - 32) + 16;

      if (dist2(x, y, p.x, p.y) > RELEASE_RADIUS * RELEASE_RADIUS) continue;
      if (x > vx0 && x < vx1 && y > vy0 && y < vy1) continue;       // never seen arriving
      if (b && (x < b.minX + 32 || x > b.maxX - 32 || y < b.minY + 32 || y > b.maxY - 32)) continue;

      const roll = hash2(gx + 977, gy + 977);
      const kind = TRAP_KEYS[Math.min(TRAP_KEYS.length - 1, (roll * TRAP_KEYS.length) | 0)];
      active.set(key, { x, y, kind, reveal: 0 });
      if (active.size >= MAX_LIVE) return;
    }
  }
}
