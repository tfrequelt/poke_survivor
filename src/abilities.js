// L3 -- may import L0-L2. May NOT import enemies.js; damage goes through combat.js.
//
// Manually-fired abilities: cooldowns, channelled effects, and the effect registry.
//
// Two slots live on G.abilities: slot 0 fires with Q, slot 1 with E. Slot 1 is form-gated, so it
// only exists once the player has evolved. Everything an effect needs -- area damage, projectiles,
// zones -- already exists; this file wires them together and owns the timing.

import { G, winFrozen } from './state.js';
import { TAU, dist2 } from './util.js';
import {
  enemies, zones, spawn, despawn, nextHitId,
  cellRange, cellStart, cellItems, GW,
 setDamageSource,} from './world.js';
import { damageCircle, damageLine, damageRing, damageEnemy, damageSourceId, setSrcType } from './combat.js';
import { ABILITY_TYPES } from './data/types.js';
import { ABILITIES, ABILITY_BY_ID } from './data/abilities.js';
import { spriteBase, spriteDirs } from './sprites.js';
import { ZONE, fxSprites } from './fx.js';
import { spawnSpr, burstSpr } from './sprfx.js';
import { spawnSeq, SEQ } from './seqfx.js';
import { projectiles } from './world.js';

export const ABILITY_SLOTS = 2;

/** Set by main.js so effects can emit particles/shake without importing upward. */
export const fx = {
  burst: null, ring: null, beam: null, shake: null, heal: null, boom: null,
  dart: null, fireburst: null,
  // Added for the ability visual pass: a ground fissure, a strike from the sky, a wave front,
  // and a particle that is a sprite rather than a coloured pixel.
  crack: null, bolt: null, wave: null, motes: null,
  // (id | [ids]) -- a sample, picked at random from a list.
  sound: null,
};

// --- Resolved stats ---------------------------------------------------------

/**
 * Fold the ability's per-level grants and the player's stats into one resolved block.
 * Mutates a cached object on the slot, so casting never allocates.
 */
/**
 * The slot currently running `effect`, or null. Lets the renderer ask "is a blizzard up" without
 * knowing which slot a form happens to keep it in, or which forms have it at all.
 */
/**
 * The slot running an ability that declares `visual`, or null.
 *
 * Keyed on the visual rather than on the effect because effects are shared: Night Shade and
 * Dark Pulse are both `drainRings` and must not look remotely alike.
 */
export function activeVisual(name) {
  for (let slot = 0; slot < ABILITY_SLOTS; slot++) {
    const a = G.abilities[slot];
    if (a && a.activeT > 0 && a.def.visual === name) return a;
  }
  return null;
}

export function activeAbility(effect) {
  for (let slot = 0; slot < ABILITY_SLOTS; slot++) {
    const a = G.abilities[slot];
    if (a && a.activeT > 0 && a.def.effect === effect) return a;
  }
  return null;
}

/**
 * The effects that put something in the air and publish gx/gy for the renderer to draw. Listed
 * rather than flagged on the definitions because it is the EFFECT that decides whether there is
 * a thing in flight at all, not the ability wearing it.
 */
const THROWN = ['present', 'fireShot', 'shadowOrb'];

/** Whatever is currently in the air, or null. */
export function thrownItem() {
  for (const e of THROWN) {
    const a = activeAbility(e);
    if (a) return a;
  }
  return null;
}

export function abilityStats(a) {
  const def = a.def;
  const o = a.resolved;
  const g = G.stats;

  // Start from the definition, then apply each level's grant, then any form upgrade.
  o.damage = def.damage || 0;
  o.cooldown = def.cooldown;
  o.radius = def.radius || 0;
  o.duration = def.duration || 0;
  o.count = def.count || 0;
  o.waves = def.waves || 0;
  o.width = def.width || 0;
  o.length = def.length || 0;
  o.jumps = def.jumps || 0;
  o.jumpRange = def.jumpRange || 0;
  o.execute = def.execute || 0;
  o.arrows = def.arrows || 1;
  o.channel = def.channel || 0;
  o.pierce = def.pierce || 0;
  o.strikes = def.strikes || 0;
  o.range = def.range || 0;
  o.band = def.band || 0;
  o.wallLen = def.wallLen || 0;
  o.spread = def.spread || 0;
  o.dps = def.dps || 0;
  o.burn = def.burn || 0;
  o.slow = def.slow || 0;
  o.heal = def.heal || 0;

  let cdMul = 1;
  for (let i = 1; i <= a.level - 1; i++) {
    const lv = def.levels[i];
    if (!lv) continue;
    if (lv.damage) o.damage += lv.damage;
    if (lv.cooldownMul) cdMul *= lv.cooldownMul;
    if (lv.radius) o.radius += lv.radius;
    if (lv.duration) o.duration += lv.duration;
    if (lv.count) o.count += lv.count;
    if (lv.waves) o.waves += lv.waves;
    if (lv.width) o.width += lv.width;
    if (lv.length) o.length += lv.length;
    if (lv.jumps) o.jumps += lv.jumps;
    if (lv.jumpRange) o.jumpRange += lv.jumpRange;
    if (lv.execute) o.execute += lv.execute;
    if (lv.channel) o.channel += lv.channel;
    if (lv.pierce) o.pierce += lv.pierce;
    if (lv.strikes) o.strikes += lv.strikes;
    if (lv.range) o.range += lv.range;
    if (lv.band) o.band += lv.band;
    if (lv.wallLen) o.wallLen += lv.wallLen;
    if (lv.spread) o.spread += lv.spread;
    if (lv.dps) o.dps += lv.dps;
    if (lv.burn) o.burn += lv.burn;
    if (lv.slow) o.slow += lv.slow;
    if (lv.heal) o.heal += lv.heal;
  }

  // A later form can upgrade an ability in place (Decidueye's Spectral Arrow).
  const up = def.formUpgrade;
  if (up && G.form && G.form.id === up.form) {
    if (up.damage) o.damage += up.damage;
    if (up.arrows) o.arrows += up.arrows;
    if (up.execute) o.execute += up.execute;
    if (up.radius) o.radius += up.radius;
  }

  // Player stats: power scales damage, area scales radii, cooldown stat scales the recharge.
  o.damage *= g.power;
  // Damage over time scales with power exactly as a hit does, so a Fire build's burns keep up
  // with its bites rather than falling off the moment Might starts stacking.
  o.dps *= g.power;
  o.burn *= g.power;
  o.radius *= g.area;
  o.width *= g.area;
  o.range *= g.area;
  o.band *= g.area;
  o.wallLen *= g.area;
  o.cooldown = Math.max(1.5, def.cooldown * cdMul * g.cooldown);
  return o;
}

// --- Slot management --------------------------------------------------------

export function addAbility(id) {
  const def = ABILITY_BY_ID[id];
  if (!def) throw new Error(`abilities: unknown ability "${id}"`);

  const existing = G.abilities[def.slot];
  if (existing && existing.def.id === id) {
    if (existing.level < def.levels.length) existing.level++;
    return existing;
  }

  const a = {
    def, level: 1, cd: 0, cdMax: def.cooldown,
    activeT: 0, tickT: 0, waveT: 0, wavesLeft: 0, angle: 0, hitId: 0,
    // zx/zy is the marked spot a sky strike rains into; it is chosen once, on cast, so the
    // strikes stay together even as the player keeps running.
    zx: 0, zy: 0,
    // Where a thrown item is right now, along its arc. The renderer reads these rather than
    // recomputing the arc, so the maths exists in exactly one place.
    gx: 0, gy: 0,
    resolved: {},
    // The damage-breakdown line this ability's hits, and anything it leaves on the ground, count to.
    srcId: damageSourceId(`a:${def.id}`, def.name),
    // Kills since this ability was last cast -- the "Kaboom" success counts one cast at a time,
    // including whatever the cast left burning or lingering on the ground.
    castKills: 0,
    // The maxed look's own clock (see FLOURISH): paces its sparkles while the ability plays.
    fxT: 0,
  };
  setSrcType(a.srcId, ABILITY_TYPES[def.id]);
  abilityStats(a);
  G.abilities[def.slot] = a;
  return a;
}

export const abilityAt = (slot) => G.abilities[slot] || null;
export const abilityReady = (slot) => {
  const a = G.abilities[slot];
  return !!a && a.cd <= 0 && a.activeT <= 0;
};

// --- Firing -----------------------------------------------------------------

export function fireAbility(slot) {
  const a = G.abilities[slot];
  if (!a || a.cd > 0 || a.activeT > 0 || G.runOver || winFrozen()) return false;

  const st = abilityStats(a);
  const p = G.player;
  a.hitId = nextHitId();
  a.angle = aimAngle(p, st);

  a.castKills = 0;
  setDamageSource(a.srcId);
  EFFECT[a.def.effect](a, st, p);
  setDamageSource(0);

  a.cdMax = st.cooldown;
  a.cd = st.cooldown;
  return true;
}

/** Abilities aim at the nearest enemy, falling back to the way the player faces. */
function aimAngle(p, st) {
  const range = Math.max(st.length || 0, 260);
  const idx = nearestEnemyIdx(p.x, p.y, range);
  if (idx >= 0) {
    const e = enemies[idx];
    return Math.atan2(e.y - p.y, e.x - p.x);
  }
  return p.dir ? 0 : Math.PI;
}

function nearestEnemyIdx(x, y, range) {
  const r = cellRange(x, y, range);
  if (!r) return -1;
  let best = -1, bestD = range * range;
  for (let gy = r.y0; gy <= r.y1; gy++) {
    const rowBase = gy * GW;
    for (let gx = r.x0; gx <= r.x1; gx++) {
      const c = rowBase + gx;
      const end = cellStart[c + 1];
      for (let k = cellStart[c]; k < end; k++) {
        const j = cellItems[k];
        const e = enemies[j];
        if (!e.alive || e.prop) continue;      // never aim an ability at scenery
        const d = dist2(x, y, e.x, e.y);
        if (d < bestD) { bestD = d; best = j; }
      }
    }
  }
  return best;
}

// --- Effects ----------------------------------------------------------------

const EFFECT = {
  /** Protect Bubble: a timed shield on the player. Damage happens when it expires. */
  shield(a, st, p) {
    a.activeT = st.duration;
    p.shieldT = st.duration;
    if (fx.ring) fx.ring(p.x, p.y, st.radius, '#a8e4ff', 0.3);
  },

  /** Earthquake / the ring half of Dark Pulse: N expanding rings fired over time. */
  shockwaveRings(a, st) {
    a.wavesLeft = st.waves;
    a.waveT = 0;
    a.activeT = st.waves * a.def.waveGap + 0.1;
    if (fx.shake) fx.shake(0.6);
  },

  drainRings(a, st) {
    a.wavesLeft = st.waves;
    a.waveT = 0;
    a.activeT = st.waves * a.def.waveGap + 0.1;
  },

  /**
   * Thunderbolt: a circle is marked, and bolts fall into it one after another.
   *
   * The zone is placed on cast and does not follow the player, so the cast is a decision about
   * WHERE as much as when -- the opposite of the chain version, which just found targets for you.
   */
  skyStrike(a, st, p) {
    const idx = nearestEnemyIdx(p.x, p.y, 300);
    if (idx >= 0) { a.zx = enemies[idx].x; a.zy = enemies[idx].y; }
    else { a.zx = p.x + Math.cos(a.angle) * 120; a.zy = p.y + Math.sin(a.angle) * 120; }

    a.wavesLeft = st.strikes;
    a.waveT = 0;
    a.activeT = st.strikes * a.def.strikeGap + 0.25;

    // The charged ground under the strike zone, which keeps ticking after the last bolt lands.
    const z = spawn('zones');
    if (z) {
      z.x = a.zx; z.y = a.zy;
      z.r = st.radius;
      z.maxLife = z.life = a.def.zoneTime;
      z.dps = a.def.zoneDps * G.stats.power;
      z.tick = 0;
      z.slow = 0;
      z.kind = ZONE.STATIC;
      z.color = '#f8e038';
      z.hitId = 0;
      z.burn = 0;
    }
    if (fx.ring) fx.ring(a.zx, a.zy, st.radius, '#fff05a', 0.4);
  },

  /**
   * Hydro Pump: a wall of water that rolls out along the aim.
   *
   * One hitId covers the whole sweep, so an enemy is caught once as the wall passes rather than
   * every tick it spends inside it.
   */
  wave(a, st, p) {
    a.activeT = a.def.travel;
    a.tickT = 0;
    a.hitId = nextHitId();
    a.zx = p.x; a.zy = p.y;               // the wave rolls from where it was cast, not from you
    a.gx = p.x; a.gy = p.y;               // the crest, published for the renderer
    if (fx.shake) fx.shake(0.3);
  },

  /** Homing Leaf: one projectile per distinct nearby target. */
  multiHoming(a, st, p) {
    if (maxed(a)) FLOURISH.homing_leaf.cast(a, st, p);
    const targets = distinctTargets(p.x, p.y, a.def.range, st.count);
    for (let i = 0; i < st.count; i++) {
      const pr = spawn('projectiles');
      if (!pr) break;
      // Fan the launch so they visibly spread before seeking.
      const angle = (i / st.count) * TAU + G.rngFx() * 0.3;
      pr.x = p.x; pr.y = p.y;
      pr.ox = p.x; pr.oy = p.y;
      pr.vx = Math.cos(angle) * a.def.speed;
      pr.vy = Math.sin(angle) * a.def.speed;
      pr.angle = angle;
      pr.r = 8 * G.stats.area;             // the blade is 16px wide now, so the hitbox follows
      pr.dmg = st.damage;
      pr.pierce = st.pierce;
      pr.life = 0;
      pr.maxLife = a.def.duration;
      pr.motion = MOTION_HOMING;
      pr.sprBase = a.def.projSprBase;
      pr.nd = a.def.projSprDirs;
      pr.knockback = 20;
      pr.weapon = -1;
      pr.targetIdx = targets[i % Math.max(1, targets.length)] ?? -1;
      pr.homingTurn = a.def.homingTurn;
      pr.t = 0;
      pr.area = G.stats.area;
      pr.spin = 8;
      pr.trail = 22;                       // a violet wake, to match the blade's purple rim
      pr.trailColor = '#a855dd';
      pr.hitId = nextHitId();       // each blade pierces independently
      pr.burn = 0; pr.burnT = 0; pr.slow = 0;   // pooled: no leftovers from a fire or ice weapon
    }
  },

  /** Spectral Arrow: instant line damage, an execute, and a lingering burn corridor. */
  pierceLine(a, st, p) {
    for (let i = 0; i < st.arrows; i++) {
      // Extra arrows from Decidueye fan slightly rather than stacking on one line.
      const ang = a.angle + (i - (st.arrows - 1) / 2) * 0.18;
      const hitId = nextHitId();
      damageLine(p.x, p.y, ang, st.length, st.width, st.damage, hitId, {
        execute: st.execute, knockback: 40,
      });
      // The arrow, not a drawn beam: it flies the length of the shot, turned to face along it.
      if (fx.dart) fx.dart(p.x, p.y, ang, st.length, 0.24);
      if (maxed(a)) FLOURISH.spectral_arrow.cast(a, st, p, ang);

      // Burn corridor: a chain of small zones along the shot.
      const steps = Math.max(2, Math.round(st.length / 40));
      for (let s2 = 1; s2 <= steps; s2++) {
        const z = spawn('zones');
        if (!z) break;
        z.x = p.x + Math.cos(ang) * (st.length * s2 / steps);
        z.y = p.y + Math.sin(ang) * (st.length * s2 / steps);
        z.r = st.width * 1.6;
        z.maxLife = z.life = a.def.trailTime;
        z.dps = a.def.trailDps * G.stats.power;
        z.tick = 0;
        z.slow = 0;
        z.kind = 1;
        z.color = '#a0f0d0';
        z.hitId = 0;
        z.burn = 0;
      }
    }
    if (fx.shake) fx.shake(0.35);
  },

  /** Hyperbeam: a channelled beam that roots the player. */
  beam(a, st, p) {
    a.activeT = st.channel;
    a.tickT = 0;
    p.rootT = st.channel;
    if (fx.shake) fx.shake(0.3);
  },

  /** Hydro Pump: like the beam, but shoves hard and heals per hit. */
  jet(a, st, p) {
    a.activeT = st.channel;
    a.tickT = 0;
  },

  /**
   * Flamethrower: a spinning fire star thrown at the nearest enemy, bursting where it lands.
   *
   * The target is picked on cast and LOCKED. A shot that silently tracked whatever was closest
   * would never miss, and choosing when to throw it is the whole skill of the move.
   */
  fireShot(a, st, p) {
    const idx = nearestEnemyIdx(p.x, p.y, st.range);
    if (idx >= 0) {
      a.zx = enemies[idx].x; a.zy = enemies[idx].y;
    } else {
      // Nothing in range: throw it as far as it goes, in the direction being faced.
      a.zx = p.x + (p.dir ? st.range : -st.range);
      a.zy = p.y;
    }
    a.angle = Math.atan2(a.zy - p.y, a.zx - p.x);
    a.activeT = a.def.channel;
    a.tickT = 0;
    a.gx = p.x; a.gy = p.y;
  },

  /**
   * Fire Spin: a vortex of flame that wraps around Vulpix and travels with it.
   *
   * Centred on the caster rather than dropped at range, so it is something you carry into a
   * crowd. The zone follows the player for its whole life -- see ZONE.FIRE in updateZones --
   * which is the only way the ring of flame can stay drawn around the Pokemon without the
   * picture and the hitbox drifting apart.
   */
  firePit(a, st, p) {
    const zx = p.x;
    const zy = p.y;

    // The burst on arrival, so the cast lands rather than only starting something.
    damageCircle(zx, zy, st.radius, st.damage, nextHitId(), {
      knockback: a.def.knockback || 0,
      burn: st.burn, burnT: 4,
    });

    const z = spawn('zones');
    if (z) {
      z.x = zx; z.y = zy;
      z.r = st.radius;
      z.maxLife = z.life = st.duration;
      z.dps = st.dps;
      z.tick = 0;
      z.slow = st.slow;
      z.kind = ZONE.FIRE;
      z.color = '#f08828';
      z.hitId = 0;
      z.burn = st.burn;
    }
    if (fx.shake) fx.shake(0.35);
  },

  /**
   * Present: a gift lobbed at the crowd whose contents are decided on cast, not on landing.
   *
   * Deciding now rather than on impact matters: the flight is short, and a roll made at the
   * moment of the explosion would be indistinguishable from one made here except that this way
   * the outcome cannot be influenced by anything that happens mid-air.
   */
  present(a, st, p) {
    const idx = nearestEnemyIdx(p.x, p.y, st.range);
    a.zx = idx >= 0 ? enemies[idx].x : p.x + (p.dir ? 60 : -60);
    a.zy = idx >= 0 ? enemies[idx].y : p.y;
    a.activeT = a.def.channel;
    a.tickT = 0;
    // wavesLeft doubles as the decided outcome: 1 is a blast, 0 is a heal.
    a.wavesLeft = G.rngRun() < a.def.healChance ? 0 : 1;
  },

  /** Blizzard: a storm centred on the player for as long as it lasts. */
  blizzard(a, st, p) {
    a.activeT = st.channel;
    a.tickT = 0;
    if (fx.shake) fx.shake(0.3);
  },

  /**
   * Shadow Ball: an orb thrown at the nearest enemy that damages what it drifts past.
   *
   * The target is picked on cast and held, so the orb's path is a decision rather than a
   * guarantee -- aiming it through a crowd is worth more than aiming it at one thing.
   */
  shadowOrb(a, st, p) {
    const idx = nearestEnemyIdx(p.x, p.y, st.range);
    if (idx >= 0) {
      a.zx = enemies[idx].x; a.zy = enemies[idx].y;
    } else {
      a.zx = p.x + (p.dir ? st.range : -st.range);
      a.zy = p.y;
    }
    a.angle = Math.atan2(a.zy - p.y, a.zx - p.x);
    a.activeT = a.def.channel;
    a.tickT = 0;
    a.gx = p.x; a.gy = p.y;
  },

  /**
   * Crunch: the jaws open on the nearest foe and close. The target spot is fixed on cast, like a
   * thrown move's, and the bite lands when the jaws meet (see the update).
   */
  crunch(a, st, p) {
    const idx = nearestEnemyIdx(p.x, p.y, st.range);
    if (idx >= 0) { a.zx = enemies[idx].x; a.zy = enemies[idx].y; }
    else { a.zx = p.x + (p.dir ? 40 : -40); a.zy = p.y; }
    a.activeT = a.def.channel;
    spawnSeq('fx_jaw_up', a.zx, a.zy, { mode: SEQ.JAWS, dur: a.def.channel + 0.42, scale: (st.radius * 2) / 29 });
  },

  /** Draco Meteor: one meteor per level, dropped a beat apart (see the update). */
  dracoMeteor(a, st, p) {
    a.wavesLeft = a.level;
    a.waveT = 0;
    a.activeT = a.level * a.def.gap + a.def.fall + 0.1;
    if (!a.drops) a.drops = [];
    a.drops.length = 0;
    a.lastDrop = undefined;
  },

  /** Thunderbolt: instant chain between nearby enemies. */
  chain(a, st, p) {
    let x = p.x, y = p.y;
    let dmg = st.damage;
    const hitId = nextHitId();
    const used = [];

    for (let j = 0; j < st.jumps; j++) {
      const idx = nearestUnhit(x, y, st.jumpRange + (j === 0 ? 120 : 0), used);
      if (idx < 0) break;
      const e = enemies[idx];
      used.push(idx);
      if (fx.beam) fx.beam(x, y, Math.atan2(e.y - y, e.x - x), Math.hypot(e.x - x, e.y - y), 2, '#f8e038', 0.18);
      e.lastHitId = hitId;
      e.stunT = Math.max(e.stunT, a.def.stun);
      damageEnemy(e, dmg, 0, 0, true);
      if (fx.burst) fx.burst(e.x, e.y, 4, '#fffaa8');
      x = e.x; y = e.y;
      dmg *= a.def.falloff;              // each jump is a little weaker
    }
    if (fx.shake) fx.shake(0.25);
  },
};

// --- The maxed look -----------------------------------------------------------------------------
//
// An ability at its last level (5) looks the part: each one layers sprite effects from the
// Gravity Circuit set (data/sprfx.js) -- sparks, light streaks, rings, embers, motes -- on its
// own visual, in colours that shift as it plays. Nothing here changes what the ability does.
//
// Hooks: `always` runs every frame the ability is maxed (for the ones with nothing channelled to
// hang a tick on: blades already in flight, a flame vortex that is a zone); `tick` every frame
// while it plays; `cast`, `ring`, `land` and `expire` at those moments. Spawns are paced by the
// slot's own fxT and go through the shared sprite-effect budget.

const maxed = (a) => a.level >= a.def.levels.length;
function flourish(a, hook, st, p) {
  if (!maxed(a)) return;
  const f = FLOURISH[a.def.id];
  if (f && f[hook]) f[hook](a, st, p);
}
/** A colour from `list` that changes `rate` times a second: shifting, but from a small palette. */
const shift = (list, rate, off = 0) => list[(((G.clock * rate) | 0) + off) % list.length];
/** Pace a flourish: true once every `gap` seconds of play. */
function every(a, dt, gap) {
  a.fxT -= dt;
  if (a.fxT > 0) return false;
  a.fxT = gap;
  return true;
}
const UP = -Math.PI / 2;

const BUBBLE = ['#a8e4ff', '#7af0e8', '#ff9ad8', '#c49aff'];
const LEAF = ['#7fe08a', '#c4f29a', '#ffd166'];
const SPIRIT = ['#9af0d8', '#c49aff', '#a0f0d0'];
const FLAME = ['#ff9040', '#ffd166', '#ffffff'];
const CONFETTI = ['#ff6b6b', '#ffd166', '#7fe08a', '#7ac8ff', '#c49aff'];
const FROST = ['#eaffff', '#9ad8f4', '#c8f0ff'];
const RAIN = ['#ff9a9a', '#ffd166', '#7fe08a', '#7ac8ff', '#c49aff'];
const SHADE = ['#8a72b8', '#c49aff', '#4a3a66'];

const FLOURISH = {
  protect_bubble: {
    tick(a, st, p, dt) {
      if (!every(a, dt, 0.08)) return;
      const r = st.radius * 0.9;
      for (let k = 0; k < 2; k++) {
        const ang = G.clock * 3 + k * Math.PI;
        spawnSpr('sparkle', p.x + Math.cos(ang) * r, p.y - 8 + Math.sin(ang) * r * 0.8, shift(BUBBLE, 4, k));
      }
      if (G.tick % 24 === 0) spawnSpr('guard_ring', p.x, p.y - 8, shift(BUBBLE, 2), st.radius / 30);
    },
    expire(a, st, p) {
      const r = st.radius * 1.5;
      spawnSpr('ring_l', p.x, p.y - 6, '#c8f0ff', r / 20);
      spawnSpr('flash_burst', p.x, p.y - 6, '#ffffff', 2);
      for (let i = 0; i < 12; i++) {
        const ang = (i / 12) * TAU;
        spawnSpr('blade', p.x + Math.cos(ang) * r * 0.5, p.y - 6 + Math.sin(ang) * r * 0.4, BUBBLE[i % 4], 2, ang + Math.PI / 2, Math.cos(ang) * 160, Math.sin(ang) * 130);
      }
    },
  },
  earthquake: {
    ring(a, st, p) {
      spawnSpr('boom', p.x, p.y, '#c49a5e', 1.6);
      for (let i = 0; i < 10; i++) {
        const ang = (i / 10) * TAU + G.rngFx() * 0.3;
        const x = p.x + Math.cos(ang) * st.radius, y = p.y + Math.sin(ang) * st.radius * 0.62;
        spawnSpr(i & 1 ? 'land_dust' : 'slide_dust', x, y, '#d8c48a', 1.4);
      }
      for (let i = 0; i < 6; i++) {
        const ang = G.rngFx() * TAU, sp = 60 + G.rngFx() * 90;
        spawnSpr('shard', p.x, p.y - 4, '#c49a5e', 1, ang, Math.cos(ang) * sp, Math.sin(ang) * sp * 0.6 - 120, 320);
      }
    },
  },
  homing_leaf: {
    always(a, st, p, dt) {
      if (!every(a, dt, 0.06)) return;
      for (let i = 0; i < projectiles.length; i++) {
        const pr = projectiles[i];
        if (pr.src !== a.srcId || pr.hostile) continue;
        spawnSpr('slash', pr.x, pr.y, shift(LEAF, 6, i), 1, pr.angle);
      }
    },
  },
  spectral_arrow: {},
  flamethrower: {
    tick(a, st, p, dt) {
      if (!every(a, dt, 0.04)) return;
      spawnSpr(G.rngFx() < 0.5 ? 'cannon' : 'spin_oval', a.gx, a.gy, '', 1, G.rngFx() * TAU, (G.rngFx() - 0.5) * 50, -20 - G.rngFx() * 30);
    },
    land(a, st, p) {
      for (let i = 0; i < 8; i++) {
        const ang = (i / 8) * TAU;
        spawnSpr('boom_fire', a.zx + Math.cos(ang) * st.radius * 0.7, a.zy + Math.sin(ang) * st.radius * 0.5, '', 0.8);
      }
      spawnSpr('flash_burst', a.zx, a.zy, '#ffd166', 2);
    },
  },
  fire_spin: {
    always(a, st, p, dt) {
      // The vortex is a zone that follows you: while it burns, embers spiral up through it and a
      // second band of fire turns the other way, shifting from orange to gold to white.
      let z = null;
      for (let i = 0; i < zones.length; i++) if (zones[i].src === a.srcId && zones[i].kind === ZONE.FIRE) { z = zones[i]; break; }
      if (!z || !every(a, dt, 0.05)) return;
      const r = z.r * 0.85;
      const a1 = G.clock * 5, a2 = -G.clock * 3.5;
      spawnSpr('cannon', z.x + Math.cos(a1) * r, z.y + Math.sin(a1) * r * 0.6, '', 1, 0, 0, -45);
      spawnSpr('spark_s', z.x + Math.cos(a2) * r * 0.7, z.y + Math.sin(a2) * r * 0.45 - 4, shift(FLAME, 5), 1, a2);
    },
  },
  present: {
    tick(a, st, p, dt) {
      if (every(a, dt, 0.05)) spawnSpr('star3', a.gx, a.gy, '', 2, 0, (G.rngFx() - 0.5) * 30, 10);
    },
    land(a, st, p) {
      const x = a.wavesLeft ? a.zx : p.x, y = a.wavesLeft ? a.zy : p.y;
      spawnSpr('flash_burst', x, y, a.wavesLeft ? '#ffd166' : '#7fe08a', 2);
      for (let i = 0; i < 12; i++) {
        const ang = (i / 12) * TAU, sp = 70 + G.rngFx() * 60;
        spawnSpr('shine', x, y - 6, CONFETTI[i % 5], 1, 0, Math.cos(ang) * sp, Math.sin(ang) * sp - 40, 180);
      }
    },
  },
  blizzard: {
    tick(a, st, p, dt) {
      if (!every(a, dt, 0.06)) return;
      for (let k = 0; k < 2; k++) {
        const ang = G.rngFx() * TAU, d = (0.2 + G.rngFx() * 0.8) * st.radius;
        spawnSpr(k ? 'sparkle' : 'freeze_s', p.x + Math.cos(ang) * d, p.y + Math.sin(ang) * d * 0.7, shift(FROST, 3, k), 1, 0, -20, 30);
      }
    },
  },
  hyperbeam: {
    tick(a, st, p, dt) {
      if (!every(a, dt, 0.04)) return;
      const ca = Math.cos(a.angle), sa = Math.sin(a.angle);
      const u = G.rngFx() * st.length;
      spawnSpr('spark', p.x + ca * u, p.y + sa * u, G.tick & 4 ? '#ffd166' : '#ff9040', 1, a.angle - Math.PI / 2);
      if (G.tick & 1) spawnSpr('punch_s', p.x + ca * u * 0.7, p.y + sa * u * 0.7, '#ffb347', 1, a.angle - Math.PI / 2);
      if (G.tick % 8 === 0) spawnSpr('beam_flash', p.x + ca * 14, p.y + sa * 14, '#fff6c8', 1, a.angle);
      if (G.tick % 10 === 0) spawnSpr('ring_m', p.x + ca * st.length, p.y + sa * st.length, '#ffd166', 1);
    },
  },
  thunderbolt: {
    tick(a, st, p, dt) {
      if (!every(a, dt, 0.09)) return;
      const ang = G.rngFx() * TAU, d = Math.sqrt(G.rngFx()) * st.radius;
      spawnSpr('circuit', a.zx + Math.cos(ang) * d, a.zy + Math.sin(ang) * d * 0.62, G.tick & 8 ? '#fff6a0' : '#7ac8ff', 1.5, 0, 0, -25);
    },
  },
  hydro_pump: {
    tick(a, st, p, dt) {
      if (!every(a, dt, 0.035)) return;
      const ax = Math.cos(a.angle), ay = Math.sin(a.angle);
      const u = (G.rngFx() - 0.5) * st.wallLen;
      const x = a.gx + ay * u, y = a.gy - ax * u;
      spawnSpr(G.rngFx() < 0.5 ? 'gibs' : 'oval', x, y - 8, '#9adcff', 1, 0, ax * 40, -30, 90);
      // A sheen along the crest, running through the colours of a rainbow.
      spawnSpr('slit', x, y - 14, shift(RAIN, 8, u | 0), 1, a.angle);
    },
  },
  dark_pulse: {
    ring(a, st, p) {
      spawnSpr('guard_ring', p.x, p.y - 6, '#8a72b8', 0.9);
      for (let i = 0; i < 10; i++) {
        const ang = (i / 10) * TAU;
        const x = p.x + Math.cos(ang) * st.radius, y = p.y + Math.sin(ang) * st.radius * 0.7;
        spawnSpr(i & 1 ? 'oval' : 'hash', x, y, shift(SHADE, 3, i), 1.2, ang, -Math.sin(ang) * 60, Math.cos(ang) * 45);
      }
    },
  },
  shadow_orb: {
    tick(a, st, p, dt) {
      if (!every(a, dt, 0.035)) return;
      const ang = G.clock * 9;
      spawnSpr(G.tick & 2 ? 'dot' : 'motes', a.gx + Math.cos(ang) * 9, a.gy + Math.sin(ang) * 6, shift(SHADE, 5), 1.2, 0, 0, -12);
    },
    land(a, st, p) {
      spawnSpr('death_flash', a.zx, a.zy, '#c49aff', 1.2);
      spawnSpr('guard_ring', a.zx, a.zy, '#8a72b8', st.radius / 30);
    },
  },
  night_shade: {
    tick(a, st, p, dt) {
      if (!every(a, dt, 0.06)) return;
      const ang = G.rngFx() * TAU, d = G.rngFx() * st.radius;
      spawnSpr(G.rngFx() < 0.6 ? 'motes' : 'oval', p.x + Math.cos(ang) * d, p.y + Math.sin(ang) * d * 0.7, shift(SPIRIT, 3), 1.2, 0, (G.rngFx() - 0.5) * 20, -35);
    },
  },
};

// Axew's two: the bite rings out in violet and gold, and every meteor throws up a halo of flame.
FLOURISH.crunch = {
  land(a, st) {
    spawnSpr('ring_blade', a.zx, a.zy, shift(['#c8b8ff', '#ffd166', '#ffffff'], 6), st.radius / 22);
    for (let i = 0; i < 6; i++) {
      const ang = (i / 6) * TAU;
      spawnSpr('spark', a.zx + Math.cos(ang) * st.radius * 0.6, a.zy + Math.sin(ang) * st.radius * 0.5, '#e0d0ff', 1, ang, Math.cos(ang) * 50, Math.sin(ang) * 40);
    }
  },
};
FLOURISH.draco_meteor = {
  land(a, st) {
    const x = a.zx, y = a.zy;
    spawnSpr('flash_burst', x, y - 10, shift(FLAME, 8), st.radius / 40);
    for (let i = 0; i < 4; i++) {
      spawnSpr('lava', x + (G.rngFx() - 0.5) * 30, y - G.rngFx() * 10, '#ff9040', 1, 0, (G.rngFx() - 0.5) * 40, -40 - G.rngFx() * 30, 120);
    }
  },
};

// Spectral Arrow fires and is done in one call, so its look is laid down in the cast itself.
FLOURISH.spectral_arrow.cast = function (a, st, p, ang) {
  const ca = Math.cos(ang), sa = Math.sin(ang);
  spawnSpr('beam_flash', p.x + ca * 12, p.y + sa * 12, '#a0f0d0', 1, ang);
  const n = Math.max(3, Math.round(st.length / 26));
  for (let i = 1; i <= n; i++) {
    const u = (st.length * i) / n;
    spawnSpr(i & 1 ? 'streak' : 'motes', p.x + ca * u, p.y + sa * u, shift(SPIRIT, 4, i), 1, ang - Math.PI / 2, 0, i & 1 ? 0 : -25);
  }
  spawnSpr('death_flash', p.x + ca * st.length, p.y + sa * st.length, '#9af0d8', 0.9);
};
FLOURISH.homing_leaf.cast = function (a, st, p) { spawnSpr('ring_blade', p.x, p.y - 6, '#7fe08a', 2); };

// Resolved at boot from weapons.js, so reordering the MOTION registry cannot silently break this.
let MOTION_HOMING = 1;

/** Up to `n` distinct enemy indices near a point, so blades do not all pick the same target. */
const _targets = [];
function distinctTargets(x, y, range, n) {
  _targets.length = 0;
  const r = cellRange(x, y, range);
  if (!r) return _targets;
  for (let gy = r.y0; gy <= r.y1 && _targets.length < n; gy++) {
    const rowBase = gy * GW;
    for (let gx = r.x0; gx <= r.x1 && _targets.length < n; gx++) {
      const c = rowBase + gx;
      const end = cellStart[c + 1];
      for (let k = cellStart[c]; k < end && _targets.length < n; k++) {
        const j = cellItems[k];
        if (enemies[j].alive && !enemies[j].prop) _targets.push(j);
      }
    }
  }
  return _targets;
}

function nearestUnhit(x, y, range, used) {
  const r = cellRange(x, y, range);
  if (!r) return -1;
  let best = -1, bestD = range * range;
  for (let gy = r.y0; gy <= r.y1; gy++) {
    const rowBase = gy * GW;
    for (let gx = r.x0; gx <= r.x1; gx++) {
      const c = rowBase + gx;
      const end = cellStart[c + 1];
      for (let k = cellStart[c]; k < end; k++) {
        const j = cellItems[k];
        const e = enemies[j];
        if (!e.alive || e.prop || used.includes(j)) continue;
        const d = dist2(x, y, e.x, e.y);
        if (d < bestD) { bestD = d; best = j; }
      }
    }
  }
  return best;
}

// --- Per-tick update --------------------------------------------------------

function updateAbilitiesInner(dt) {
  const p = G.player;
  if (!p) return;

  if (p.shieldT > 0) p.shieldT -= dt;
  if (p.rootT > 0) p.rootT -= dt;

  for (let slot = 0; slot < ABILITY_SLOTS; slot++) {
    const a = G.abilities[slot];
    if (!a) continue;
    if (a.cd > 0) a.cd -= dt;
    const fl = maxed(a) ? FLOURISH[a.def.id] : null;
    if (fl && fl.always) fl.always(a, a.resolved, p, dt);
    if (a.activeT <= 0) continue;
    if (fl && fl.tick) fl.tick(a, a.resolved, p, dt);
    setDamageSource(a.srcId);

    const st = a.resolved;
    const prev = a.activeT;
    a.activeT -= dt;

    switch (a.def.effect) {
      case 'shield': {
        // Continuously shove enemies out of the bubble while it holds.
        pushOut(p.x, p.y, st.radius, 260 * dt);
        if (prev > 0 && a.activeT <= 0) {
          // Burst on expiry -- the shield's damage is all here.
          damageCircle(p.x, p.y, st.radius * 1.5, st.damage, nextHitId(), {
            knockback: a.def.knockback, stun: 0.3,
          });
          if (fx.ring) fx.ring(p.x, p.y, st.radius * 1.5, '#a8e4ff', 0.35);
          if (fx.shake) fx.shake(0.4);
          flourish(a, 'expire', st, p);
        }
        break;
      }

      case 'shockwaveRings':
      case 'drainRings': {
        a.waveT -= dt;
        if (a.wavesLeft > 0 && a.waveT <= 0) {
          a.wavesLeft--;
          a.waveT = a.def.waveGap;
          emitRing(a, st, p);
        }
        break;
      }

      case 'skyStrike': {
        a.waveT -= dt;
        if (a.wavesLeft > 0 && a.waveT <= 0) {
          a.wavesLeft--;
          a.waveT = a.def.strikeGap;
          emitStrike(a, st);
        }
        break;
      }

      case 'wave': {
        // The crest is wherever the cast is up to: elapsed fraction along the aim.
        const k = 1 - Math.max(0, a.activeT) / a.def.travel;
        const ax = Math.cos(a.angle), ay = Math.sin(a.angle);
        a.gx = a.zx + ax * k * st.range;
        a.gy = a.zy + ay * k * st.range;

        // The wall is laid ACROSS the travel: a line at angle+90 degrees, centred on the crest.
        // The perpendicular of (ax, ay) is (-ay, ax), so one end is the crest minus half of it.
        const half = st.wallLen * 0.5;
        const hits = damageLine(a.gx + ay * half, a.gy - ax * half, a.angle + Math.PI / 2,
          st.wallLen, st.band, st.damage, a.hitId, {
            knockback: a.def.knockback,
            knockAngle: a.angle,       // swept ahead of the wall, not smeared along it
            slow: 0.3, slowT: 1.0,
          });
        if (hits > 0 && a.def.lifesteal && fx.heal) fx.heal(hits * a.def.lifesteal);

        // Spray thrown off the crest, scattered along its length rather than around an arc.
        if (fx.burst && G.rngFx() < 0.7) {
          const u = (G.rngFx() - 0.5) * st.wallLen;
          fx.burst(a.gx + ay * u, a.gy - ax * u, 3, '#bfe9ff');
        }
        break;
      }

      case 'shadowOrb': {
        const k = 1 - Math.max(0, a.activeT) / a.def.channel;
        a.gx = p.x + (a.zx - p.x) * k;
        a.gy = p.y + (a.zy - p.y) * k;

        // Gnawing at what it passes. A fresh hit id each tick, so something walking alongside
        // the orb keeps taking damage rather than being spent on the first touch.
        a.tickT -= dt;
        if (a.tickT <= 0) {
          a.tickT = a.def.tick;
          damageCircle(a.gx, a.gy, st.radius * 0.55, st.damage * 0.16, nextHitId(), {
            weaken: a.def.weaken || 0, canCrit: false,
          });
        }

        if (prev > 0 && a.activeT <= 0) {
          const hits = damageCircle(a.zx, a.zy, st.radius, st.damage, nextHitId(), {
            knockback: a.def.knockback || 0,
            weaken: a.def.weaken || 0,
          });
          if (hits > 0 && a.def.lifesteal && fx.heal) fx.heal(Math.round(hits * a.def.lifesteal));
          if (fx.ring) fx.ring(a.zx, a.zy, st.radius, '#7a6ab0', 0.35);
          if (fx.burst) fx.burst(a.zx, a.zy, 22, '#c8bcf0');
          if (fx.shake) fx.shake(0.3);
          flourish(a, 'land', st, p);
        }
        break;
      }

      case 'fireShot': {
        // Straight line, not an arc: this is thrown hard rather than lobbed, and the sheet's
        // spinning star reads as a flat trajectory.
        const k = 1 - Math.max(0, a.activeT) / a.def.channel;
        a.gx = p.x + (a.zx - p.x) * k;
        a.gy = p.y + (a.zy - p.y) * k;

        if (prev > 0 && a.activeT <= 0) {
          damageCircle(a.zx, a.zy, st.radius, st.damage, nextHitId(), {
            knockback: a.def.knockback || 0,
            burn: st.burn,
            burnT: a.def.burnT || 4,
          });
          if (fx.fireburst) fx.fireburst(a.zx, a.zy, st.radius, 0.5);
          if (fx.shake) fx.shake(0.4);
          flourish(a, 'land', st, p);
        }
        break;
      }

      case 'present': {
        // The gift in flight: a low arc from the player to the marked spot. Its position is
        // published on the ability and drawn as the actual present sprite -- this used to emit
        // two particles a frame instead, which read as a thin red line and nothing else.
        const k = 1 - Math.max(0, a.activeT) / a.def.channel;
        a.gx = p.x + (a.zx - p.x) * k;
        a.gy = p.y + (a.zy - p.y) * k - Math.sin(k * Math.PI) * 42;

        if (prev > 0 && a.activeT <= 0) {
          if (a.wavesLeft) {
            damageCircle(a.zx, a.zy, st.radius, st.damage, nextHitId(), {
              knockback: a.def.knockback || 0, stun: 0.25,
            });
            if (fx.boom) fx.boom(a.zx, a.zy, st.radius, 0.45);
            if (fx.shake) fx.shake(0.5);
          } else if (fx.heal) {
            // The consolation prize, and the reason it is worth firing into an empty room.
            fx.heal(Math.round(G.stats.maxHp * (st.heal || 0.3)));
            if (fx.ring) fx.ring(p.x, p.y, 34, '#9ad8f4', 0.35);
          }
          flourish(a, 'land', st, p);
        }
        break;
      }

      case 'crunch': {
        if (prev > 0 && a.activeT <= 0) {
          // The snap: the bite's zone takes the damage, and what is left standing is stunned.
          damageCircle(a.zx, a.zy, st.radius, st.damage, nextHitId(), {
            stun: a.def.stun, weaken: a.def.weaken,
          });
          spawnSpr('punch_flash', a.zx, a.zy, '#e0d0ff', 1.2);
          if (fx.shake) fx.shake(0.3);
          flourish(a, 'land', st, p);
        }
        break;
      }

      case 'dracoMeteor': {
        // Drop the next meteor where it will land, a random spot around you as you are now.
        a.waveT -= dt;
        if (a.wavesLeft > 0 && a.waveT <= 0) {
          a.wavesLeft--;
          a.waveT = a.def.gap;
          // A spot clear of the last one, so two blasts never stack on the same ground.
          let x = p.x, y = p.y;
          for (let tries = 0; tries < 6; tries++) {
            const ang = G.rngRun() * TAU;
            const d = a.def.near + G.rngRun() * (a.def.far - a.def.near);
            x = p.x + Math.cos(ang) * d; y = p.y + Math.sin(ang) * d * 0.8;
            if (a.lastDrop === undefined || Math.hypot(x - a.lastX, y - a.lastY) >= 40) break;
          }
          a.lastDrop = 1; a.lastX = x; a.lastY = y;
          a.drops.push(x, y, a.def.fall);
          spawnSeq('fx_draco_fall', x, y, { mode: SEQ.METEOR, dur: a.def.fall, z: 180, fps: 14, scale: 1.2 });
          spawnSeq('fx_draco_flare', x - 100, y - 170, { dur: 0.22, fps: 14, scale: 0.8 });
        }
        for (let j = a.drops.length - 3; j >= 0; j -= 3) {
          a.drops[j + 2] -= dt;
          if (a.drops[j + 2] > 0) continue;
          const x = a.drops[j], y = a.drops[j + 1];
          a.drops.splice(j, 3);
          damageCircle(x, y, st.radius, st.damage, nextHitId(), {
            burn: st.burn, burnT: a.def.burnT || 4, knockback: 70,
          });
          spawnSeq('fx_draco_boom', x, y - 8, { dur: 0.95, fps: 15, scale: Math.max(0.7, (st.radius * 2) / 95) });
          if (fx.shake) fx.shake(0.35);
          if (fx.sound) fx.sound(a.def.impactSound);
          // And it spurs you on: faster, for a few seconds, every meteor topping it up.
          p.hasteMul = p.hasteT > 0 ? Math.max(p.hasteMul, a.def.haste) : a.def.haste;
          p.hasteT = Math.max(p.hasteT, a.def.hasteT);
          a.zx = x; a.zy = y;
          flourish(a, 'land', st, p);
        }
        break;
      }

      case 'blizzard': {
        a.tickT -= dt;
        if (a.tickT <= 0) {
          a.tickT = a.def.tick;
          damageCircle(p.x, p.y, st.radius, st.damage, nextHitId(), {
            slow: st.slow, slowT: a.def.tick * 2.2, canCrit: false,
          });
        }
        // Snow across the whole field, biased away from the centre so the player stays readable.
        if (fx.burst) {
          for (let i = 0; i < 4; i++) {
            const ang = G.rngFx() * TAU;
            const d = (0.25 + G.rngFx() * 0.75) * st.radius;
            fx.burst(p.x + Math.cos(ang) * d, p.y + Math.sin(ang) * d, 1, '#eaffff');
          }
        }
        break;
      }

      case 'beam':
      case 'jet': {
        p.rootT = a.def.effect === 'beam' ? Math.max(p.rootT, a.activeT) : p.rootT;
        a.tickT -= dt;
        if (a.tickT <= 0) {
          a.tickT = a.def.tick;
          const isJet = a.def.effect === 'jet';
          const hits = damageLine(p.x, p.y, a.angle, st.length, st.width, st.damage, nextHitId(), {
            knockback: a.def.knockback,
          });
          if (isJet && hits > 0 && a.def.lifesteal && fx.heal) fx.heal(hits * a.def.lifesteal);
          if (fx.beam) {
            fx.beam(p.x, p.y, a.angle, st.length, st.width,
              isJet ? '#4aa8e8' : '#e4e8ee', a.def.tick * 1.4);
          }
        }
        break;
      }
    }
  }
}

/** One expanding ring: damage now at its current radius, plus the visual that carries it. */
function emitRing(a, st, p) {
  const isDrain = a.def.effect === 'drainRings';
  const hits = damageCircle(p.x, p.y, st.radius, st.damage, nextHitId(), {
    knockback: a.def.knockback || 0,
    stun: a.def.stun || 0,
    weaken: a.def.weaken || 0,
    noFly: !isDrain,                       // Earthquake misses flyers; Dark Pulse does not
  });
  if (isDrain && hits > 0 && a.def.lifesteal && fx.heal) fx.heal(hits * a.def.lifesteal);
  if (fx.ring) fx.ring(p.x, p.y, st.radius, isDrain ? '#6a4a9a' : '#9a6c36', 0.32);
  if (fx.shake) fx.shake(isDrain ? 0.2 : 0.45);

  if (isDrain) emitShadowPool(a, st, p);
  else emitFissures(a, st, p);
  flourish(a, 'ring', st, p);
}

/** Earthquake: fissures radiating out of the epicentre, and the earth they throw up. */
function emitFissures(a, st, p) {
  const n = a.def.cracks || 0;
  for (let i = 0; i < n; i++) {
    const ang = G.rngFx() * TAU;
    const len = st.radius * (0.55 + G.rngFx() * 0.5);
    if (fx.crack) fx.crack(p.x, p.y, ang, len, '#c49a5e', a.def.crackTime);

    // Each fissure is also a hazard, not just a picture of one.
    const z = spawn('zones');
    if (!z) continue;
    z.x = p.x + Math.cos(ang) * len * 0.55;
    z.y = p.y + Math.sin(ang) * len * 0.55 * 0.62;
    z.r = Math.max(10, len * 0.3);
    z.maxLife = z.life = a.def.crackTime;
    z.dps = (a.def.crackDps || 0) * G.stats.power;
    z.tick = 0;
    z.slow = 0.35;
    z.kind = ZONE.PLAIN;
    z.color = '#6b4620';
    z.hitId = 0;
    z.burn = 0;
  }

  // Dirt and rubble kicked into the air.
  if (fx.burst) fx.burst(p.x, p.y, 10, '#9a6c36');
  if (fx.motes) {
    const chunks = a.def.rubble || 0;
    for (let i = 0; i < chunks; i++) {
      const ang = G.rngFx() * TAU;
      const sp = 40 + G.rngFx() * 90;
      fx.motes(p.x, p.y, Math.cos(ang) * sp, Math.sin(ang) * sp * 0.6 - 70,
        0.5 + G.rngFx() * 0.35, fxSprites.rubble, 220);
    }
  }
}

/** Dark Pulse: a pool of shadow that outlasts the ring by a wide margin. */
function emitShadowPool(a, st, p) {
  const z = spawn('zones');
  if (!z) return;
  z.x = p.x; z.y = p.y;
  z.r = st.radius * 0.85;
  z.maxLife = z.life = a.def.zoneTime || 4;
  z.dps = (a.def.zoneDps || 0) * G.stats.power;
  z.tick = 0;
  z.slow = a.def.zoneSlow || 0;
  z.kind = ZONE.DARK;
  z.color = '#2a2140';
  z.hitId = 0;
  z.burn = 0;
}

/** One bolt out of a sky strike, landing somewhere inside the marked circle. */
function emitStrike(a, st) {
  // The first bolt lands dead centre; the rest scatter, so the cast reads as a barrage.
  const first = a.wavesLeft === st.strikes - 1;
  const ang = G.rngFx() * TAU;
  const rad = first ? 0 : Math.sqrt(G.rngFx()) * st.radius;
  const x = a.zx + Math.cos(ang) * rad;
  const y = a.zy + Math.sin(ang) * rad * 0.62;

  damageCircle(x, y, a.def.boltRadius * G.stats.area, st.damage, nextHitId(), {
    stun: a.def.stun || 0,
    knockback: 40,
  });
  if (fx.bolt) fx.bolt(x, y, 230, 0.34);
  if (fx.burst) fx.burst(x, y, 8, '#fffaa8');
  if (maxed(a)) {
    spawnSpr('lightning', x, y - 52, '#fff6a0');
    burstSpr('spark', x, y - 4, '#ffe14a', 4, 6, 50);
    spawnSpr('flash_burst', x, y - 4, '#ffffff', 1.4);
  }
  if (fx.shake) fx.shake(first ? 0.5 : 0.28);
}

/** Shove enemies out of a radius -- the bubble's crowd control. */
function pushOut(x, y, r, force) {
  const range = cellRange(x, y, r);
  if (!range) return;
  for (let gy = range.y0; gy <= range.y1; gy++) {
    const rowBase = gy * GW;
    for (let gx = range.x0; gx <= range.x1; gx++) {
      const c = rowBase + gx;
      const end = cellStart[c + 1];
      for (let k = cellStart[c]; k < end; k++) {
        const e = enemies[cellItems[k]];
        if (!e.alive) continue;
        const dx = e.x - x, dy = e.y - y;
        const d2 = dx * dx + dy * dy;
        const rr = r + e.r;
        if (d2 >= rr * rr || d2 < 0.01) continue;
        const d = Math.sqrt(d2);
        e.x += (dx / d) * force;
        e.y += (dy / d) * force;
      }
    }
  }
}

// --- Zones (the burn corridor, and anything else that lingers) --------------

function updateZonesInner(dt) {
  for (let i = zones.length - 1; i >= 0; i--) {
    const z = zones[i];
    setDamageSource(z.src);
    z.life -= dt;
    if (z.life <= 0) {
      // A zone with a `boom` erupts as it closes: an overload's collapsing vortex or delayed blast.
      if (z.boom > 0) {
        const r = z.kind === ZONE.NOVA || z.kind === ZONE.NOVA_STATIC ? Math.max(z.r, z.pull) : z.r;
        damageCircle(z.x, z.y, r * 1.1, z.boom, nextHitId(), { knockback: 90, canCrit: true });
        if (fx.ring) fx.ring(z.x, z.y, r * 1.1, z.color, 0.35);
        if (fx.burst) fx.burst(z.x, z.y, 14, z.color);
        if (fx.shake) fx.shake(0.25);
      }
      despawn('zones', zones, i);
      continue;
    }
    // Expanding fronts and vortices are not "a circle that ticks", so they take their own path.
    if (z.kind === ZONE.NOVA || z.kind === ZONE.NOVA_STATIC) { updateNova(z, dt); continue; }
    if (z.kind === ZONE.VORTEX) { updateVortex(z, dt); continue; }
    // A fire vortex is carried, not placed: it rides the player and then ticks like any other.
    if (z.kind === ZONE.FIRE && G.player) { z.x = G.player.x; z.y = G.player.y; }

    z.tick -= dt;
    if (z.tick <= 0) {
      z.tick = 0.25;
      damageCircle(z.x, z.y, z.r, z.dps * 0.25, nextHitId(), {
        slow: z.slow, slowT: 1.2, canCrit: false, burn: z.burn, burnT: 2.5,
      });
    }
    if (z.kind === ZONE.DARK || z.kind === ZONE.STATIC) zoneAtmosphere(z, dt);
  }
}

/**
 * An expanding ring. `pull` carries the radius it grows to, and one hitId covers the whole sweep
 * so an enemy is caught once by the front rather than every tick it spends inside the circle.
 */
function updateNova(z, dt) {
  if (z.kind === ZONE.NOVA && G.player) { z.x = G.player.x; z.y = G.player.y; }
  const k = 1 - z.life / z.maxLife;
  const target = z.pull || 100;
  const prev = z.r;
  z.r = Math.max(2, k * target);
  const band = Math.max(10, (z.r - prev) * 0.5 + 12);
  const o = _novaOpts;
  o.knockback = z.knock; o.slow = z.slow; o.burn = z.burn;
  damageRing(z.x, z.y, z.r - band, z.r + band, z.dps, z.hitId, o);
}

// Reused by every nova front, so a ring sweeping outward allocates nothing per tick.
const _novaOpts = { knockback: 140, slow: 0, slowT: 1.0, burn: 0, burnT: 2.5 };

/** A vortex: drags everything toward the middle and grinds whatever ends up there. */
function updateVortex(z, dt) {
  pullIn(z.x, z.y, z.r, z.pull * dt);
  z.tick -= dt;
  if (z.tick > 0) return;
  z.tick = 0.2;
  damageCircle(z.x, z.y, z.r, z.dps * 0.2, nextHitId(), {
    slow: z.slow, slowT: 0.8, canCrit: false,
  });
  if (fx.motes && G.rngFx() < 0.7) {
    const a = G.rngFx() * TAU;
    fx.motes(z.x + Math.cos(a) * z.r, z.y + Math.sin(a) * z.r * 0.62,
      -Math.cos(a) * 60, -Math.sin(a) * 36, 0.5, -1, 0);
  }
}

/** The opposite of pushOut: drag enemies toward a point. */
function pullIn(x, y, r, force) {
  const range = cellRange(x, y, r);
  if (!range) return;
  for (let gy = range.y0; gy <= range.y1; gy++) {
    const rowBase = gy * GW;
    for (let gx = range.x0; gx <= range.x1; gx++) {
      const c = rowBase + gx;
      const end = cellStart[c + 1];
      for (let k = cellStart[c]; k < end; k++) {
        const e = enemies[cellItems[k]];
        if (!e.alive || e.boss) continue;        // a boss is not dragged around
        const dx = x - e.x, dy = y - e.y;
        const d2 = dx * dx + dy * dy;
        if (d2 > r * r || d2 < 4) continue;
        const d = Math.sqrt(d2);
        e.x += (dx / d) * force;
        e.y += (dy / d) * force;
      }
    }
  }
}

/**
 * The particles a long-lived zone gives off. A zone that sits there as a flat translucent ellipse
 * for seven seconds reads as a rendering artefact; one that breathes reads as a hazard.
 */
function zoneAtmosphere(z, dt) {
  if (!fx.motes) return;
  const rate = z.kind === ZONE.DARK ? 3.5 : 8;
  if (G.rngFx() > rate * dt) return;
  const ang = G.rngFx() * TAU;
  const rad = Math.sqrt(G.rngFx()) * z.r;
  const x = z.x + Math.cos(ang) * rad;
  const y = z.y + Math.sin(ang) * rad * 0.62;

  if (z.kind === ZONE.DARK) {
    // Wisps rise slowly out of the shadow and fade.
    fx.motes(x, y, (G.rngFx() - 0.5) * 12, -14 - G.rngFx() * 14,
      0.8 + G.rngFx() * 0.6, fxSprites.wisp, -6);
  } else {
    // Static: short sparks that jump off the charged ground.
    if (fx.burst) fx.burst(x, y, 2, '#fff05a');
  }
}

// --- Boot -------------------------------------------------------------------

export function initAbilityDefs(motionHomingIdx) {
  MOTION_HOMING = motionHomingIdx;
  for (const def of ABILITIES) {
    def.iconBase = spriteBase(def.icon, def.palette);
  }
  // Homing Leaf throws the big purple-rimmed blade, not the small weapon leaf.
  const leaf = ABILITY_BY_ID.homing_leaf;
  leaf.projSprBase = spriteBase('fx_leafblade', 'leafblade');
  leaf.projSprDirs = spriteDirs('fx_leafblade', 'leafblade');
}

export { ABILITIES, ABILITY_BY_ID };

// The ability and zone updaters set the damage source per ability and per zone as they go; these
// wrappers clear it afterwards so nothing that runs next in the tick is credited to the last one.
export function updateAbilities(dt) { updateAbilitiesInner(dt); setDamageSource(0); }
export function updateZones(dt) { updateZonesInner(dt); setDamageSource(0); }
