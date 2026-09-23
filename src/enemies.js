// L3 -- may import L0-L2 (and, same-layer, only pickups.js).
//
// Enemy spawning, movement AI, separation and death. Behaviour is selected by a STRING KEY in the
// data file resolved through the AI registry below, so adding an enemy never touches this file.

import { G } from './state.js';
import { clamp, dist2, TAU } from './util.js';
import {
  enemies, spawn, despawn, rebuildGrid, cellRange, cellStart, cellItems, CELL, GW,
} from './world.js';
import { ENEMIES, ENEMY_BY_ID } from './data/enemies.js';
import { spriteBase } from './sprites.js';

// World units. The content pass was authored for a 1280x720 space; everything spatial is halved
// for the 640x360 render space (see the conversion rule in the plan).
export const SPAWN_MIN = 350;
export const SPAWN_MAX = 430;
export const DESPAWN = 725;
const DESPAWN2 = DESPAWN * DESPAWN;

// --- AI registry ------------------------------------------------------------
// Each function sets e.vx / e.vy for this tick. Keep them allocation-free.

const AI = {
  /** Walk straight at the player. The bread and butter. */
  chase(e, dt, px, py) {
    const dx = px - e.x, dy = py - e.y;
    const d = Math.hypot(dx, dy) || 1;
    e.vx = (dx / d) * e.speed;
    e.vy = (dy / d) * e.speed;
  },

  /** Chase, but weave sideways -- reads as a flyer and is harder to funnel. */
  sine(e, dt, px, py) {
    const dx = px - e.x, dy = py - e.y;
    const d = Math.hypot(dx, dy) || 1;
    const nx = dx / d, ny = dy / d;
    e.aiT += dt;
    const w = Math.sin(e.aiT * 3.1) * 0.55;
    e.vx = (nx - ny * w) * e.speed;
    e.vy = (ny + nx * w) * e.speed;
  },

  /** Approach, pause to wind up, then dash. Forces the player to react rather than kite. */
  charge(e, dt, px, py) {
    const dx = px - e.x, dy = py - e.y;
    const d = Math.hypot(dx, dy) || 1;
    e.aiT -= dt;
    if (e.aiState === 0) {                       // approaching
      e.vx = (dx / d) * e.speed;
      e.vy = (dy / d) * e.speed;
      if (d < 90 && e.aiT <= 0) { e.aiState = 1; e.aiT = 0.7; e.aiX = dx / d; e.aiY = dy / d; }
    } else if (e.aiState === 1) {                // winding up, telegraphed by standing still
      e.vx = 0; e.vy = 0;
      if (e.aiT <= 0) { e.aiState = 2; e.aiT = 0.45; }
    } else if (e.aiState === 2) {                // dashing along the locked heading
      e.vx = e.aiX * e.speed * 5.2;
      e.vy = e.aiY * e.speed * 5.2;
      if (e.aiT <= 0) { e.aiState = 0; e.aiT = 1.4; }
    }
  },

  /** Circle the player at a preferred radius instead of closing. */
  orbit(e, dt, px, py) {
    const dx = px - e.x, dy = py - e.y;
    const d = Math.hypot(dx, dy) || 1;
    const nx = dx / d, ny = dy / d;
    const want = 70;
    const radial = clamp((d - want) / 40, -1, 1);
    e.vx = (nx * radial - ny * 0.9) * e.speed;
    e.vy = (ny * radial + nx * 0.9) * e.speed;
  },

  /** Scenery. Does not move, does not chase. */
  static(e) {
    e.vx = 0; e.vy = 0;
  },

  /** Drift toward the player and detonate on contact -- handled by the contact damage path. */
  rusher(e, dt, px, py) {
    const dx = px - e.x, dy = py - e.y;
    const d = Math.hypot(dx, dy) || 1;
    const boost = d < 120 ? 1.7 : 1;
    e.vx = (dx / d) * e.speed * boost;
    e.vy = (dy / d) * e.speed * boost;
  },
};

const AI_KEYS = Object.keys(AI);
const AI_FNS = AI_KEYS.map((k) => AI[k]);
export const aiIndex = (name) => {
  const i = AI_KEYS.indexOf(name);
  if (i < 0) throw new Error(`enemies: unknown ai "${name}"`);
  return i;
};

// --- Spawning ---------------------------------------------------------------

/** Place an enemy on the ring just outside the camera, at a random angle. */
export function spawnAtRing(def, rng) {
  const a = rng() * TAU;
  const r = SPAWN_MIN + rng() * (SPAWN_MAX - SPAWN_MIN);
  const p = G.player;
  return spawnEnemy(def, p.x + Math.cos(a) * r, p.y + Math.sin(a) * r);
}

export function spawnEnemy(def, x, y, opts) {
  const e = spawn('enemies');
  if (!e) return null;                            // pool exhausted: skip rather than stutter

  const hpMul = G.curve ? G.curve.hp : 1;
  const dmgMul = G.curve ? G.curve.dmg : 1;
  const spdMul = G.curve ? G.curve.spd : 1;
  const elite = !!(opts && opts.elite);

  e.def = def;
  e.x = x; e.y = y; e.vx = 0; e.vy = 0;
  e.maxHp = Math.max(1, Math.round(def.hp * hpMul * (elite ? 6 : 1)));
  e.hp = e.maxHp;
  e.r = def.r * (elite ? 1.35 : 1);
  e.mass = def.mass * (elite ? 2.5 : 1);
  e.speed = def.speed * spdMul * (elite ? 0.85 : 1);
  e.dmg = def.dmg * dmgMul;
  e.xp = def.xp * (elite ? 12 : 1);
  e.armor = def.armor || 0;
  e.knockResist = def.knockResist || 0;
  e.coinChance = elite ? 1 : (def.coinChance || 0);
  e.boss = !!def.boss;
  e.elite = elite;
  e.flying = !!def.flying;
  e.prop = !!def.prop;
  e.harmless = !!def.harmless;
  e.stunT = 0; e.weakenT = 0;
  // Scenery must not scale with the difficulty curve, or a minute-18 bush needs a whole clip.
  if (def.noScale) {
    e.maxHp = e.hp = def.hp;
    e.speed = 0;
    e.dmg = 0;
  }
  e.ai = def.aiIdx;
  e.aiT = 0; e.aiState = 0; e.aiX = 0; e.aiY = 0;
  e.flash = 0; e.knockX = 0; e.knockY = 0; e.contactCd = 0;
  e.slow = 0; e.slowT = 0;
  e.animTime = 0; e.frame = 0; e.dir = 1;
  e.spawnT = 0.18;                                 // brief fade-in so pop-in is less jarring
  e.lastHitId = 0;
  e.sprBase = elite ? def.sprEliteBase : def.sprBase;
  return e;
}

// --- Update -----------------------------------------------------------------

/**
 * Enemy separation.
 *
 * Full pairwise separation is O(n^2) and unusable at 300 enemies. This walks only the 3x3 cell
 * neighbourhood and stops after a few neighbours: enemies still refuse to perfectly overlap, and
 * that is all the player can perceive. Under load the caller can run it at 30Hz instead of 60.
 */
const MAX_NEIGHBOURS = 4;

function separate(e, i, push) {
  const range = cellRange(e.x, e.y, e.r * 2);
  if (!range) return;
  let seen = 0;
  for (let gy = range.y0; gy <= range.y1; gy++) {
    const rowBase = gy * GW;
    for (let gx = range.x0; gx <= range.x1; gx++) {
      const c = rowBase + gx;
      const end = cellStart[c + 1];
      for (let k = cellStart[c]; k < end; k++) {
        const j = cellItems[k];
        if (j === i) continue;
        const o = enemies[j];
        if (o === undefined || !o.alive) continue;
        const dx = e.x - o.x, dy = e.y - o.y;
        const rr = e.r + o.r;
        const d2 = dx * dx + dy * dy;
        if (d2 >= rr * rr || d2 < 0.0001) continue;
        const d = Math.sqrt(d2);
        // Heavier enemies shove lighter ones rather than both giving way equally.
        const ratio = o.mass / (e.mass + o.mass);
        const force = ((rr - d) / d) * push * ratio;
        e.x += dx * force;
        e.y += dy * force;
        if (++seen >= MAX_NEIGHBOURS) return;
      }
    }
  }
}

/** Live enemies excluding scenery -- what the spawn director should budget against. */
export function combatantCount() {
  let n = 0;
  for (let i = 0; i < enemies.length; i++) if (enemies[i].alive && !enemies[i].prop) n++;
  return n;
}

export function updateEnemies(dt, separationOn) {
  const p = G.player;
  if (!p) return;
  const px = p.x, py = p.y;

  for (let i = enemies.length - 1; i >= 0; i--) {
    const e = enemies[i];
    if (!e.alive) continue;                        // killed this tick, awaiting the sweep

    if (e.spawnT > 0) e.spawnT -= dt;
    if (e.flash > 0) e.flash -= dt;
    if (e.slowT > 0) { e.slowT -= dt; if (e.slowT <= 0) e.slow = 0; }
    if (e.weakenT > 0) e.weakenT -= dt;

    // A stunned enemy keeps its velocity for knockback but stops steering and stops advancing,
    // so Earthquake and Thunderbolt actually buy the player breathing room.
    if (e.stunT > 0) {
      e.stunT -= dt;
      e.vx = 0; e.vy = 0;
    } else {
      AI_FNS[e.ai](e, dt, px, py);
    }

    const slowK = 1 - e.slow;
    e.x += e.vx * slowK * dt;
    e.y += e.vy * slowK * dt;

    // Knockback decays fast; it is impact feedback, not a physics system.
    if (e.knockX !== 0 || e.knockY !== 0) {
      e.x += e.knockX * dt;
      e.y += e.knockY * dt;
      const decay = Math.pow(0.0007, dt);
      e.knockX *= decay;
      e.knockY *= decay;
      if (Math.abs(e.knockX) < 1 && Math.abs(e.knockY) < 1) { e.knockX = 0; e.knockY = 0; }
    }

    if (e.vx > 1) e.dir = 1; else if (e.vx < -1) e.dir = 0;
    e.animTime += dt;
    e.frame = ((e.animTime * 6) | 0) & 1;

    // Recycle anything that wandered far off-screen. It does NOT count as a kill, so it is
    // marked rather than killed and the end-of-tick sweep collects it.
    if (dist2(e.x, e.y, px, py) > DESPAWN2 && !e.boss && !e.prop) e.alive = false;
  }

  if (separationOn) {
    const push = 0.5;
    for (let i = 0; i < enemies.length; i++) if (enemies[i].alive) separate(enemies[i], i, push);
  }
}

// --- Boot -------------------------------------------------------------------

/** Resolve string behaviour keys and sprite ids to integers once, at boot. */
export function initEnemyDefs() {
  for (const def of ENEMIES) {
    def.aiIdx = aiIndex(def.ai);
    def.sprBase = spriteBase(def.shape, def.palette);
    def.sprEliteBase = spriteBase(def.shape, 'elite');
  }
}

export { ENEMIES, ENEMY_BY_ID };
