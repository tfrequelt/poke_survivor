// L3 -- may import L0-L2 (and, same-layer, only pickups.js).
//
// Enemy spawning, movement AI, separation and death. Behaviour is selected by a STRING KEY in the
// data file resolved through the AI registry below, so adding an enemy never touches this file.

import { G } from './state.js';
import { clamp, dist2, TAU, clampToBounds } from './util.js';
import { floorReward } from './floors.js';
import {
  enemies, spawn, despawn, rebuildGrid, cellRange, cellStart, cellItems, CELL, GW, nextHitId,
  setDamageSource, decoys, decoyTargetable, damageDecoy, DECOY_MAX, DECOY_R,
} from './world.js';
import { ENEMIES, ENEMY_BY_ID } from './data/enemies.js';
import { damageOverTime } from './combat.js';
import { dirFromAngle } from './assets.js';
import { spriteBase, spriteInfo } from './sprites.js';

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

// --- Attacks ----------------------------------------------------------------
//
// Until this existed every one of the 38 species did exactly one thing: walk into you. Six
// movement patterns, and not a single ranged threat on the field, so the correct play was always
// to walk away from the crowd and never to dodge anything.
//
// Every attack TELEGRAPHS. An enemy winding up stops dead and flashes for `windup` seconds
// before the shot leaves, which is the same contract the `charge` AI already honours -- a shot
// the player could not have seen coming is not difficulty, it is just damage.

/** Enemy shots are slower and fatter than the player's, so they read as dodgeable. */
const HOSTILE_R = 4;

// A field-wide fire budget. Without it the volume of fire scaled with how many shooters were
// alive, and the late roster is mostly evolved forms -- at minute 14 two thirds of the field could
// shoot and roughly eleven shots a second were in the air. Now ordinary enemies share one clock:
// at most one of them may begin an attack every VOLLEY_GAP seconds, however many there are. A
// shooter that finds the budget spent simply keeps walking and tries again a little later, so a
// throttled enemy never stands there winding up for nothing.
//
// Bosses are outside the budget and do not spend it: a boss's pattern is the fight.
const VOLLEY_GAP = 1.1;
let nextVolley = 0;

/** Called when a run or a floor starts, so the budget clock follows the run clock. */
export function resetAttacks() { nextVolley = 0; }

/** Ordinary enemies fire a narrow fan at most; the full radial ring is a boss's signature. */
const REGULAR_BURST_MAX = 3;
const REGULAR_BURST_SPREAD = 0.5;

const ATTACK = {
  /** One shot, along the heading locked in when the windup started. */
  shot(e, def) {
    fireHostile(e, e.atkX, e.atkY, def);
  },

  /**
   * A radial fan. What makes a boss a boss rather than a big chaser: it covers angles rather
   * than a line, so backing straight off does not beat it.
   */
  burst(e, def) {
    const n = e.boss ? (def.count || 8) : Math.min(def.count || 8, REGULAR_BURST_MAX);
    const base = Math.atan2(e.atkY, e.atkX);
    const spread = e.boss ? (def.spread || Math.PI * 2) : Math.min(def.spread || 9, REGULAR_BURST_SPREAD);
    for (let i = 0; i < n; i++) {
      const a = spread >= Math.PI * 2
        ? base + (i / n) * Math.PI * 2
        : base - spread / 2 + (i / (n - 1 || 1)) * spread;
      fireHostile(e, Math.cos(a), Math.sin(a), def);
    }
  },
};

const ATTACK_KEYS = Object.keys(ATTACK);
const ATTACK_FNS = ATTACK_KEYS.map((k) => ATTACK[k]);
export const attackIndex = (name) => {
  const i = ATTACK_KEYS.indexOf(name);
  if (i < 0) throw new Error(`enemies: unknown attack "${name}"`);
  return i;
};

function fireHostile(e, nx, ny, def) {
  const pr = spawn('projectiles');
  if (!pr) return;
  const sp = def.speed || 130;
  pr.x = e.x; pr.y = e.y;
  pr.vx = nx * sp; pr.vy = ny * sp;
  pr.r = def.r || HOSTILE_R;
  pr.dmg = def.damage || 6;
  pr.hostile = true;
  pr.pierce = 0;
  pr.life = 0;
  pr.maxLife = def.life || 3.2;
  pr.motion = 0;                       // straight line; hostile shots never home
  pr.angle = Math.atan2(ny, nx);
  pr.hitId = nextHitId();
  pr.sprBase = -1;                     // drawn as a shape, not from the atlas
  pr.knockback = 0;
  pr.crit = false;
  pr.targetIdx = -1;
  pr.area = 1;
  pr.z = 0; pr.r0 = pr.r; pr.bounces = 0; pr.fuse = 0; pr.gen = 0; pr.payload = 0;
  pr.burn = 0; pr.burnT = 0; pr.slow = 0;
  pr.trail = 0; pr.spin = 0; pr.pulse = 0; pr.impact = 0;
  pr.returning = false; pr.orbitA = 0; pr.orbitR = 0; pr.amp = 0; pr.freq = 0;
  pr.emitT = 0; pr.homingTurn = 0; pr.t = 0; pr.ox = 0; pr.oy = 0;
  pr.weapon = -1;
}

/**
 * One enemy's attack tick. Returns true while it is winding up, which freezes its movement.
 *
 * An off-screen enemy never fires: the spawn ring is 430px out and the view is 640x360, so
 * without this the player would be shot from sources they cannot see.
 */
function updateAttack(e, dt, px, py) {
  const def = e.def.attack;
  if (!def) return false;

  const dx = px - e.x, dy = py - e.y;
  const d2 = dx * dx + dy * dy;

  if (e.atkWind > 0) {
    e.atkWind -= dt;
    if (e.atkWind <= 0) {
      ATTACK_FNS[e.def.attackIdx](e, def);
      e.atkCd = def.cooldown;
    }
    return true;                                 // held still, telegraphing
  }

  e.atkCd -= dt;
  if (e.atkCd > 0) return false;

  const range = def.range || 220;
  if (d2 > range * range) return false;
  // On screen, with a little margin, or it is shooting from somewhere the player cannot look.
  if (Math.abs(dx) > VIEW_HALF_W || Math.abs(dy) > VIEW_HALF_H) return false;

  if (!e.boss) {
    if (G.runTime < nextVolley) {
      // Budget spent: try again soon, staggered so the waiting shooters do not all queue for
      // the same instant.
      e.atkCd = 0.4 + G.rngRun() * 1.2;
      return false;
    }
    nextVolley = G.runTime + VOLLEY_GAP;
  }

  const d = Math.sqrt(d2) || 1;
  e.atkX = dx / d; e.atkY = dy / d;               // heading LOCKED at the windup, not at the shot
  e.atkWind = def.windup || 0.4;
  e.flash = Math.max(e.flash, 0.06);
  return true;
}

// The camera half-extents, padded in slightly so a shot always has a visible source.
const VIEW_HALF_W = 300;
const VIEW_HALF_H = 160;

// --- Spawning ---------------------------------------------------------------

/** Place an enemy on the ring just outside the camera, at a random angle. */
export function spawnAtRing(def, rng, elite) {
  const a = rng() * TAU;
  const r = SPAWN_MIN + rng() * (SPAWN_MAX - SPAWN_MIN);
  const p = G.player;
  const pt = ringPoint(p.x, p.y, a, r, rng);
  return spawnEnemy(def, pt.x, pt.y, elite ? ELITE_OPTS : undefined);
}

// Reused rather than allocated per spawn: this is on the hottest spawn path in the game.
const ELITE_OPTS = { elite: true };

const _pt = { x: 0, y: 0 };

/**
 * A point on the spawn ring that is inside the arena.
 *
 * Clamping a ring point to the bounds would pile every spawn into the corners once the player
 * hugs a wall, so this resamples the ANGLE instead and only falls back to a clamp if the ring
 * somehow has no valid arc at all.
 */
export function ringPoint(cx, cy, angle, r, rng) {
  const b = G.bounds;
  let a = angle;
  for (let i = 0; i < 12; i++) {
    _pt.x = cx + Math.cos(a) * r;
    _pt.y = cy + Math.sin(a) * r;
    if (!b || (_pt.x > b.minX && _pt.x < b.maxX && _pt.y > b.minY && _pt.y < b.maxY)) return _pt;
    a = (rng ? rng() : Math.random()) * TAU;
  }
  clampToBounds(_pt, b, 16);
  return _pt;
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
  e.xp = def.xp * (elite ? 12 : 1) * floorReward();
  e.armor = def.armor || 0;
  e.knockResist = def.knockResist || 0;
  e.coinChance = elite ? 1 : (def.coinChance || 0);
  e.boss = !!def.boss;
  e.elite = elite;
  e.flying = !!def.flying;
  e.prop = !!def.prop;
  e.harmless = !!def.harmless;
  e.stunT = 0; e.weakenT = 0;
  e.burnSrc = 0;
  // Staggered by a random slice of the cooldown so a wave that spawns together does not fire in
  // one synchronised volley.
  e.atkCd = def.attack ? def.attack.cooldown * (0.35 + G.rngRun() * 0.65) : 0;
  e.atkWind = 0; e.atkX = 0; e.atkY = 0;
  e.burnT = 0; e.burnDps = 0; e.burnTick = 0;
  // Scenery must not scale with the difficulty curve, or a minute-18 bush needs a whole clip.
  if (def.noScale) {
    e.maxHp = e.hp = def.hp;
    e.speed = 0;
    e.dmg = 0;
  }
  e.ai = def.aiIdx;
  e.aiT = 0; e.aiState = 0; e.aiX = 0; e.aiY = 0;
  e.flash = 0; e.knockX = 0; e.knockY = 0; e.contactCd = 0; e.decoyCd = 0;
  e.slow = 0; e.slowT = 0;
  e.animTime = 0; e.frame = 0; e.dir = 1;
  e.spawnT = 0.18;                                 // brief fade-in so pop-in is less jarring
  e.lastHitId = 0;
  e.sprBase = elite ? def.sprEliteBase : def.sprBase;
  e.nd = def.sprDirs;
  e.nf = def.sprFrames;
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

/** Burn damage is paid every quarter second, matching updateZones' cadence. */
export const BURN_TICK = 0.25;

/** Seconds between one enemy's hits on a Substitute doll -- the player's contact rate. */
const DECOY_CONTACT_CD = 0.5;

// The dolls that can be chased this tick, gathered once so the per-enemy loop touches no objects
// it does not need. Fixed-size: there are never more than DECOY_MAX.
const _decoyLive = new Array(DECOY_MAX).fill(null);

export function updateEnemies(dt, separationOn) {
  const p = G.player;
  if (!p) return;
  const px = p.x, py = p.y;

  let nDecoys = 0;
  for (let k = 0; k < decoys.length; k++) if (decoyTargetable(decoys[k])) _decoyLive[nDecoys++] = decoys[k];

  for (let i = enemies.length - 1; i >= 0; i--) {
    const e = enemies[i];
    if (!e.alive) continue;                        // killed this tick, awaiting the sweep

    // Who this enemy goes for: you, or a Substitute doll if one is nearer. Both the steering and
    // the aim of a ranged attack follow it, so a shooter near a doll shoots the doll.
    let tx = px, ty = py, doll = null;
    if (nDecoys > 0) {
      let best = dist2(e.x, e.y, px, py);
      for (let k = 0; k < nDecoys; k++) {
        const d = _decoyLive[k];
        const dd = dist2(e.x, e.y, d.x, d.y);
        if (dd < best) { best = dd; doll = d; }
      }
      if (doll) { tx = doll.x; ty = doll.y; }
    }
    if (e.decoyCd > 0) e.decoyCd -= dt;

    if (e.spawnT > 0) e.spawnT -= dt;
    if (e.flash > 0) e.flash -= dt;
    if (e.slowT > 0) { e.slowT -= dt; if (e.slowT <= 0) e.slow = 0; }
    if (e.weakenT > 0) e.weakenT -= dt;

    // Burn pays out in instalments on the same quarter-second cadence the ground zones use, so
    // a burning crowd and a crowd standing in a pool of fire cost the same to run. This can
    // kill: the loop already runs backwards and killEnemy only clears `alive`, so the sweep at
    // the end of the tick picks the body up like any other death.
    if (e.burnT > 0) {
      e.burnT -= dt;
      e.burnTick -= dt;
      if (e.burnTick <= 0) {
        e.burnTick = BURN_TICK;
        setDamageSource(e.burnSrc);
        const died = damageOverTime(e, e.burnDps * BURN_TICK);
        setDamageSource(0);
        if (died) continue;
      }
      if (e.burnT <= 0) e.burnDps = 0;
    }

    // A stunned enemy keeps its velocity for knockback but stops steering and stops advancing,
    // so Earthquake and Thunderbolt actually buy the player breathing room.
    if (e.stunT > 0) {
      e.stunT -= dt;
      e.vx = 0; e.vy = 0;
    } else if (updateAttack(e, dt, tx, ty)) {
      // Winding up: planted, so the telegraph is a real tell and not something that walks at
      // you while it charges.
      e.vx = 0; e.vy = 0;
    } else {
      AI_FNS[e.ai](e, dt, tx, ty);
    }

    // Touching the doll it is going for. Only that one: a doll is not a wall, and an enemy
    // brushing past one on its way to you should not stop to chew on it.
    if (doll && !e.harmless && e.decoyCd <= 0) {
      const rr = e.r + DECOY_R;
      if (dist2(e.x, e.y, doll.x, doll.y) <= rr * rr) {
        damageDecoy(doll, e.weakenT > 0 ? e.dmg * 0.7 : e.dmg);
        e.decoyCd = DECOY_CONTACT_CD;
      }
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

    // Knockback is what actually drives things through a wall -- a chaser would only ever press
    // against it -- so the clamp goes after both the steering and the impulse.
    if (clampToBounds(e, G.bounds, e.r)) { e.knockX = 0; e.knockY = 0; }

    if (e.nd === 8) {
      if (e.vx || e.vy) e.dir = dirFromAngle(Math.atan2(e.vy, e.vx));
    } else if (e.vx > 1) e.dir = 1;
    else if (e.vx < -1) e.dir = 0;
    e.animTime += dt;
    e.frame = ((e.animTime * 6) | 0) % e.nf;

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
    // Same string-key-to-index resolution the AI gets, and for the same reason: the hot loop
    // must never look a behaviour up by name. Throws at boot on a typo rather than at the
    // moment the enemy first tries to fire.
    def.attackIdx = def.attack ? attackIndex(def.attack.kind) : -1;
    def.sprBase = spriteBase(def.shape, def.palette);
    // A PMD-sheet enemy has no separate elite recolour -- the sheet is its own colours -- so it
    // reuses its normal frames. Elites still read as elites: they are larger and carry a bar.
    def.sprEliteBase = spriteInfo(def.shape, 'elite')
      ? spriteBase(def.shape, 'elite')
      : def.sprBase;
    const info = spriteInfo(def.shape, def.palette);
    def.sprDirs = info ? info.nd : 2;
    def.sprFrames = info ? info.nf : 2;
  }
}

export { ENEMIES, ENEMY_BY_ID };
