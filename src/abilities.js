// L3 -- may import L0-L2. May NOT import enemies.js; damage goes through combat.js.
//
// Manually-fired abilities: cooldowns, channelled effects, and the effect registry.
//
// Two slots live on G.abilities: slot 0 fires with Q, slot 1 with E. Slot 1 is form-gated, so it
// only exists once the player has evolved. Everything an effect needs -- area damage, projectiles,
// zones -- already exists; this file wires them together and owns the timing.

import { G } from './state.js';
import { TAU, dist2 } from './util.js';
import {
  enemies, zones, spawn, despawn, nextHitId,
  cellRange, cellStart, cellItems, GW,
} from './world.js';
import { damageCircle, damageLine, damageRing, damageEnemy } from './combat.js';
import { ABILITIES, ABILITY_BY_ID } from './data/abilities.js';
import { spriteBase, spriteDirs } from './sprites.js';
import { ZONE, fxSprites } from './fx.js';

export const ABILITY_SLOTS = 2;

/** Set by main.js so effects can emit particles/shake without importing upward. */
export const fx = {
  burst: null, ring: null, beam: null, shake: null, heal: null,
  // Added for the ability visual pass: a ground fissure, a strike from the sky, a wave front,
  // and a particle that is a sprite rather than a coloured pixel.
  crack: null, bolt: null, wave: null, motes: null,
};

// --- Resolved stats ---------------------------------------------------------

/**
 * Fold the ability's per-level grants and the player's stats into one resolved block.
 * Mutates a cached object on the slot, so casting never allocates.
 */
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
    resolved: {},
  };
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
  if (!a || a.cd > 0 || a.activeT > 0 || G.runOver || G.won) return false;

  const st = abilityStats(a);
  const p = G.player;
  a.hitId = nextHitId();
  a.angle = aimAngle(p, st);

  EFFECT[a.def.effect](a, st, p);

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
   * Hydro Pump: one wave front that sweeps outward through the cone it is aimed at.
   *
   * One hitId covers the whole sweep, so an enemy is hit once as the front passes rather than
   * every tick it spends inside the cone.
   */
  wave(a, st, p) {
    a.activeT = a.def.travel;
    a.tickT = 0;
    a.hitId = nextHitId();
    a.zx = p.x; a.zy = p.y;               // the wave rolls from where it was cast, not from you
    if (fx.shake) fx.shake(0.3);
  },

  /** Homing Leaf: one projectile per distinct nearby target. */
  multiHoming(a, st, p) {
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
      if (fx.beam) fx.beam(p.x, p.y, ang, st.length, st.width, '#c0b8e0', 0.25);

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
   * Flamethrower: a held cone in front of the player.
   *
   * Aimed at the nearest enemy on cast and then LOCKED, rather than tracking: a jet of fire
   * that silently followed whatever was closest would never miss, and the decision about which
   * way to point it is the whole skill of the move.
   */
  flameCone(a, st, p) {
    const idx = nearestEnemyIdx(p.x, p.y, st.range + 90);
    a.angle = idx >= 0
      ? Math.atan2(enemies[idx].y - p.y, enemies[idx].x - p.x)
      : (p.dir ? 0 : Math.PI);
    a.activeT = a.def.channel;
    a.tickT = 0;
    if (fx.shake) fx.shake(0.18);
  },

  /** Fire Spin: a lasting vortex of flame dropped on a crowd. */
  firePit(a, st, p) {
    const idx = nearestEnemyIdx(p.x, p.y, 260);
    const zx = idx >= 0 ? enemies[idx].x : p.x;
    const zy = idx >= 0 ? enemies[idx].y : p.y;

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
      z.kind = ZONE.BURN;
      z.color = '#f08828';
      z.hitId = 0;
      z.burn = st.burn;
    }
    if (fx.ring) fx.ring(zx, zy, st.radius, '#ffd870', 0.4);
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

export function updateAbilities(dt) {
  const p = G.player;
  if (!p) return;

  if (p.shieldT > 0) p.shieldT -= dt;
  if (p.rootT > 0) p.rootT -= dt;

  for (let slot = 0; slot < ABILITY_SLOTS; slot++) {
    const a = G.abilities[slot];
    if (!a) continue;
    if (a.cd > 0) a.cd -= dt;
    if (a.activeT <= 0) continue;

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
        // The front is wherever the cast is up to: radius is just elapsed fraction times range.
        const k = 1 - Math.max(0, a.activeT) / a.def.travel;
        const r = k * st.range;
        const hits = damageRing(a.zx, a.zy, r - st.band, r + st.band, st.damage, a.hitId, {
          knockback: a.def.knockback,
          angle: a.angle,
          spread: st.spread,
          slow: 0.3, slowT: 1.0,
        });
        if (hits > 0 && a.def.lifesteal && fx.heal) fx.heal(hits * a.def.lifesteal);
        // One front every 60ms, not one per tick: at 60Hz the latter stacks a dozen translucent
        // arcs on top of each other and the wave turns into a solid blue slab.
        a.tickT -= dt;
        if (fx.wave && a.tickT <= 0) {
          a.tickT = 0.06;
          fx.wave(a.zx, a.zy, r, a.angle, st.spread, 0.2);
        }
        // Spray thrown off the crest.
        if (fx.burst && G.rngFx() < 0.7) {
          const sa = a.angle + (G.rngFx() - 0.5) * st.spread * 2;
          fx.burst(a.zx + Math.cos(sa) * r, a.zy + Math.sin(sa) * r * 0.62, 3, '#bfe9ff');
        }
        break;
      }

      case 'flameCone': {
        a.tickT -= dt;
        if (a.tickT <= 0) {
          a.tickT = a.def.tick;
          // A filled wedge, not a band: inner radius 0 so point-blank still burns.
          damageRing(p.x, p.y, 0, st.range, st.damage, nextHitId(), {
            knockback: a.def.knockback || 0,
            angle: a.angle,
            spread: st.spread,
            burn: st.burn,
            burnT: a.def.burnT || 4,
          });
        }
        // The jet itself. Drawn as a spray of embers along the cone rather than one shape, so it
        // reads as fire and keeps working at any range the level-ups push it to.
        if (fx.burst) {
          for (let i = 0; i < 3; i++) {
            const ang = a.angle + (G.rngFx() - 0.5) * st.spread * 2;
            const d = Math.pow(G.rngFx(), 0.6) * st.range;
            fx.burst(p.x + Math.cos(ang) * d, p.y + Math.sin(ang) * d, 2,
              G.rngFx() < 0.5 ? '#ffd870' : '#f08828');
          }
        }
        break;
      }

      case 'present': {
        // The gift in flight: a low arc from the player to the marked spot.
        const k = 1 - Math.max(0, a.activeT) / a.def.channel;
        const gx = p.x + (a.zx - p.x) * k;
        const gy = p.y + (a.zy - p.y) * k - Math.sin(k * Math.PI) * 42;
        if (fx.burst) fx.burst(gx, gy, 2, a.wavesLeft ? '#e84050' : '#9ad8f4');

        if (prev > 0 && a.activeT <= 0) {
          if (a.wavesLeft) {
            damageCircle(a.zx, a.zy, st.radius, st.damage, nextHitId(), {
              knockback: a.def.knockback || 0, stun: 0.25,
            });
            if (fx.ring) fx.ring(a.zx, a.zy, st.radius, '#e84050', 0.4);
            if (fx.burst) fx.burst(a.zx, a.zy, 26, '#ffd166');
            if (fx.shake) fx.shake(0.5);
          } else if (fx.heal) {
            // The consolation prize, and the reason it is worth firing into an empty room.
            fx.heal(Math.round(G.stats.maxHp * (st.heal || 0.3)));
            if (fx.ring) fx.ring(p.x, p.y, 34, '#9ad8f4', 0.35);
          }
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

export function updateZones(dt) {
  for (let i = zones.length - 1; i >= 0; i--) {
    const z = zones[i];
    z.life -= dt;
    if (z.life <= 0) {
      despawn('zones', zones, i);
      continue;
    }
    // Expanding fronts and vortices are not "a circle that ticks", so they take their own path.
    if (z.kind === ZONE.NOVA || z.kind === ZONE.NOVA_STATIC) { updateNova(z, dt); continue; }
    if (z.kind === ZONE.VORTEX) { updateVortex(z, dt); continue; }

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
  damageRing(z.x, z.y, z.r - band, z.r + band, z.dps, z.hitId, {
    knockback: 140,
    slow: z.slow, slowT: 1.0,
  });
}

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
