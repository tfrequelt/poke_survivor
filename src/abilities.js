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
import { damageCircle, damageLine, damageEnemy } from './combat.js';
import { ABILITIES, ABILITY_BY_ID } from './data/abilities.js';
import { spriteBase, spriteDirs } from './sprites.js';

export const ABILITY_SLOTS = 2;

/** Set by main.js so effects can emit particles/shake without importing upward. */
export const fx = { burst: null, ring: null, beam: null, shake: null, heal: null };

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
  o.radius *= g.area;
  o.width *= g.area;
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
  if (!a || a.cd > 0 || a.activeT > 0 || G.runOver) return false;

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
        if (!e.alive) continue;
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
      pr.r = 5 * G.stats.area;
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
      pr.trail = 0;
      pr.hitId = nextHitId();       // each blade pierces independently
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
        if (enemies[j].alive) _targets.push(j);
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
        if (!e.alive || used.includes(j)) continue;
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

/** One expanding ring: damage now at its current radius, plus a visual. */
function emitRing(a, st, p) {
  const isDrain = a.def.effect === 'drainRings';
  const hits = damageCircle(p.x, p.y, st.radius, st.damage, nextHitId(), {
    knockback: a.def.knockback || 0,
    stun: a.def.stun || 0,
    weaken: a.def.weaken || 0,
    noFly: !isDrain,                       // Earthquake misses flyers; Dark Pulse does not
  });
  if (isDrain && hits > 0 && a.def.lifesteal && fx.heal) fx.heal(hits * a.def.lifesteal);
  if (fx.ring) fx.ring(p.x, p.y, st.radius, isDrain ? '#7a70a8' : '#c8c0ad', 0.32);
  if (fx.shake) fx.shake(isDrain ? 0.2 : 0.45);
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
    z.tick -= dt;
    if (z.tick <= 0) {
      z.tick = 0.25;
      damageCircle(z.x, z.y, z.r, z.dps * 0.25, nextHitId(), {
        slow: z.slow, slowT: 1.2, canCrit: false,
      });
    }
  }
}

// --- Boot -------------------------------------------------------------------

export function initAbilityDefs(motionHomingIdx) {
  MOTION_HOMING = motionHomingIdx;
  for (const def of ABILITIES) {
    def.iconBase = spriteBase(def.icon, def.palette);
  }
  // Homing Leaf reuses the leaf projectile art.
  const leaf = ABILITY_BY_ID.homing_leaf;
  leaf.projSprBase = spriteBase('proj_leaf', 'grass');
  leaf.projSprDirs = spriteDirs('proj_leaf', 'grass');
}

export { ABILITIES, ABILITY_BY_ID };
