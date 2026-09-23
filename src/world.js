// L2 -- may import L0-L1.
//
// Owns every bulk entity array, the pools they come from, and the spatial grid used for collision
// broad-phase. Also owns the cross-system queues, which is what keeps the import graph acyclic:
// weapons.js never imports enemies.js, it pushes a spawn request here and main.js drains it.
//
// Two rules hold the frame budget:
//   * Nothing in here allocates during a normal frame. Entities are pooled and revived in place.
//   * Removal is always swap-and-pop, so the live arrays stay densely packed.

import { Pool, swapPop } from './util.js';
import { G } from './state.js';

// Hard caps. Reaching one is not a bug -- it is the degradation policy doing its job, and it is
// strictly better than dropping to 30fps. The spawn director checks `enemies.length` against
// its own soft cap long before these bite.
export const CAP = {
  enemies: 600,
  projectiles: 600,
  orbs: 700,
  coins: 220,
  damageNumbers: 90,
  particles: 320,
  zones: 60,
};

// --- Entity factories -------------------------------------------------------
// Every field a kind of entity will EVER use is declared here, so the shape stays monomorphic and
// the JIT keeps one hidden class per pool. Adding a field later at a call site would deoptimise
// every access -- add it here instead.

const newEnemy = () => ({
  alive: false, x: 0, y: 0, vx: 0, vy: 0,
  hp: 0, maxHp: 0, r: 6, mass: 1, speed: 0, dmg: 0, xp: 1,
  def: null, defIdx: -1,
  sprBase: 0, nf: 2, nd: 2, frame: 0, dir: 1, animTime: 0,
  flash: 0, knockX: 0, knockY: 0, contactCd: 0,
  ai: 0, aiT: 0, aiState: 0, aiX: 0, aiY: 0,
  slow: 0, slowT: 0, armor: 0, knockResist: 0,
  coinChance: 0, boss: false, elite: false, spawnT: 0,
  cell: -1, lastHitId: 0,
});

const newProjectile = () => ({
  alive: false, x: 0, y: 0, vx: 0, vy: 0,
  r: 3, dmg: 0, pierce: 0, life: 0, maxLife: 0,
  motion: 0, sprBase: 0, nd: 2, spin: 0, angle: 0,
  knockback: 0, weapon: -1, crit: false, targetIdx: -1,
  homingTurn: 0, t: 0, ox: 0, oy: 0, area: 1, hitId: 0,
});

const newOrb = () => ({ alive: false, x: 0, y: 0, vx: 0, vy: 0, value: 1, tier: 0, sprId: 0, age: 0, pulling: false });
const newCoin = () => ({ alive: false, x: 0, y: 0, vx: 0, vy: 0, value: 1, sprId: 0, age: 0, pulling: false });
const newDamageNumber = () => ({ alive: false, x: 0, y: 0, vy: 0, life: 0, value: 0, crit: false, color: 'white' });
const newParticle = () => ({ alive: false, x: 0, y: 0, vx: 0, vy: 0, life: 0, maxLife: 0, size: 1, color: '#fff', grav: 0 });
const newZone = () => ({ alive: false, x: 0, y: 0, r: 0, life: 0, maxLife: 0, dps: 0, tick: 0, slow: 0, kind: 0, color: '#fff', hitId: 0 });

// --- Pools and live arrays --------------------------------------------------

export const pools = {
  enemies: new Pool(newEnemy, CAP.enemies),
  projectiles: new Pool(newProjectile, CAP.projectiles),
  orbs: new Pool(newOrb, CAP.orbs),
  coins: new Pool(newCoin, CAP.coins),
  damageNumbers: new Pool(newDamageNumber, CAP.damageNumbers),
  particles: new Pool(newParticle, CAP.particles),
  zones: new Pool(newZone, CAP.zones),
};

export const enemies = [];
export const projectiles = [];
export const orbs = [];
export const coins = [];
export const damageNumbers = [];
export const particles = [];
export const zones = [];

const ALL = [
  ['enemies', enemies], ['projectiles', projectiles], ['orbs', orbs], ['coins', coins],
  ['damageNumbers', damageNumbers], ['particles', particles], ['zones', zones],
];

// Built once. A literal here would allocate an object on every single spawn.
const LIVE = {
  enemies, projectiles, orbs, coins, damageNumbers, particles, zones,
};

/** Take an entity from a pool and push it live. Returns null when the pool is exhausted. */
export function spawn(kind) {
  const e = pools[kind].get();
  if (!e) return null;
  e.alive = true;
  LIVE[kind].push(e);
  return e;
}

/** Return entity at index `i` of `arr` to `kind`'s pool. Swap-and-pop: O(1), order not preserved. */
export function despawn(kind, arr, i) {
  const e = arr[i];
  e.alive = false;
  pools[kind].put(e);
  swapPop(arr, i);
}

/**
 * Recycle enemies marked dead during the tick. Runs once, after every collision pass, so that
 * swap-and-pop never reorders the array while grid indices into it are still being iterated.
 */
export function sweepDead() {
  for (let i = enemies.length - 1; i >= 0; i--) {
    if (!enemies[i].alive) despawn('enemies', enemies, i);
  }
}

export function clearWorld() {
  for (const [kind, arr] of ALL) {
    for (let i = 0; i < arr.length; i++) {
      arr[i].alive = false;
      pools[kind].put(arr[i]);
    }
    arr.length = 0;
  }
  spawnRequests.length = 0;
  hitIdCounter = 1;
}

/** Unique id per damaging instance, so a piercing shot cannot hit the same enemy twice. */
let hitIdCounter = 1;
export const nextHitId = () => ++hitIdCounter;

// --- Cross-system queues ----------------------------------------------------
// weapons.js may need to spawn an enemy (a summoning weapon); enemies.js may need to drop a
// pickup. Rather than importing each other, systems push here and main.js drains in a fixed order.

export const spawnRequests = [];
export function requestSpawn(defId, x, y, opts) {
  spawnRequests.push({ defId, x, y, opts: opts || null });
}

// --- Spatial grid -----------------------------------------------------------
//
// A uniform grid rebuilt every tick with a counting sort. The world is infinite, but everything
// that can collide is near the player, so the grid is a fixed window recentred on the camera each
// tick. Anything outside the window is off-screen and is skipped by collision entirely.
//
// Counting sort (two passes, no allocation, no per-cell arrays) is dramatically cheaper than
// an array-of-arrays grid, which would allocate thousands of small arrays every frame.

export const CELL = 32;              // ~2x the largest common enemy radius; tuned at the perf gate
export const GW = 48;                // 48 * 32 = 1536 world units wide
export const GH = 48;
const NCELLS = GW * GH;

const cellCount = new Int32Array(NCELLS + 1);
const cellStart = new Int32Array(NCELLS + 1);
export const cellItems = new Int32Array(CAP.enemies);

let originX = 0, originY = 0;        // world coords of grid cell (0,0)

export function gridOrigin() { return { x: originX, y: originY }; }

/** Rebuild the enemy grid. Call once per tick, after enemies have moved. */
export function rebuildGrid() {
  const cx = G.player ? G.player.x : G.cam.x;
  const cy = G.player ? G.player.y : G.cam.y;
  originX = Math.floor(cx / CELL) - (GW >> 1);
  originY = Math.floor(cy / CELL) - (GH >> 1);

  cellCount.fill(0);

  // Pass 1: count per cell. Enemies outside the window get cell -1 and are excluded.
  for (let i = 0; i < enemies.length; i++) {
    const e = enemies[i];
    const gx = ((e.x / CELL) | 0) - originX;
    const gy = ((e.y / CELL) | 0) - originY;
    if (gx < 0 || gy < 0 || gx >= GW || gy >= GH) { e.cell = -1; continue; }
    const c = gy * GW + gx;
    e.cell = c;
    cellCount[c]++;
  }

  // Prefix sum -> start offset per cell.
  let running = 0;
  for (let c = 0; c < NCELLS; c++) {
    cellStart[c] = running;
    running += cellCount[c];
  }
  cellStart[NCELLS] = running;

  // Pass 2: scatter indices into their cell's slot.
  const cursor = cellCount;            // reuse as a write cursor
  for (let c = 0; c < NCELLS; c++) cursor[c] = cellStart[c];
  for (let i = 0; i < enemies.length; i++) {
    const c = enemies[i].cell;
    if (c >= 0) cellItems[cursor[c]++] = i;
  }
}

/** Inclusive cell-range for a world-space circle, clamped to the window. Returns null if outside. */
const _range = { x0: 0, y0: 0, x1: 0, y1: 0 };
export function cellRange(x, y, r) {
  let x0 = (((x - r) / CELL) | 0) - originX;
  let y0 = (((y - r) / CELL) | 0) - originY;
  let x1 = (((x + r) / CELL) | 0) - originX;
  let y1 = (((y + r) / CELL) | 0) - originY;
  if (x1 < 0 || y1 < 0 || x0 >= GW || y0 >= GH) return null;
  _range.x0 = x0 < 0 ? 0 : x0;
  _range.y0 = y0 < 0 ? 0 : y0;
  _range.x1 = x1 >= GW ? GW - 1 : x1;
  _range.y1 = y1 >= GH ? GH - 1 : y1;
  return _range;
}

export { cellStart, NCELLS };

// --- Debug counts -----------------------------------------------------------

export function entityCounts() {
  const c = G.debug.counts;
  c.enemies = enemies.length;
  c.proj = projectiles.length;
  c.orbs = orbs.length;
  c.coins = coins.length;
  c.fx = particles.length + damageNumbers.length;
  c.zones = zones.length;
  return c;
}
