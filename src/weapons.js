// L3 -- may import L0-L2. May NOT import enemies.js; damage goes through combat.js.
//
// Firing, projectile motion and projectile->enemy collision.
//
// Three registries turn a weapon into pure data: AIM picks a target, BEHAVIOR decides what gets
// created when the cooldown fires, and MOTION advances a live projectile. A new weapon is an
// entry in data/weapons.js referencing those string keys -- this file should rarely change.

import { G } from './state.js';
import { TAU, dist2, angDiff } from './util.js';
import {
  enemies, projectiles, zones, spawn, despawn,
  cellRange, cellStart, cellItems, GW, nextHitId,
} from './world.js';
import { damageEnemy, damageCircle, damageLine, applyBurn, applyChill } from './combat.js';
import { WEAPONS, WEAPON_BY_ID } from './data/weapons.js';
import { spriteBase, spriteDirs, angleSlot } from './sprites.js';
import { ZONE, ROLE } from './fx.js';

// Four, not six. With ~6 weapons available per type, four slots make the draft a real choice
// every run instead of a formality where you eventually hold everything.
export const MAX_WEAPONS = 4;

// --- Targeting --------------------------------------------------------------

/** Nearest enemy within `range`, or -1. Uses the grid so it does not scan every enemy. */
export function nearestEnemy(x, y, range) {
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
        // Scenery is an enemy to the collision system but must never be a TARGET, or a weapon
        // will happily empty itself into a bush while the swarm closes in.
        if (!e.alive || e.prop) continue;
        const d = dist2(x, y, e.x, e.y);
        if (d < bestD) { bestD = d; best = j; }
      }
    }
  }
  return best;
}

/** Highest current HP enemy in range -- Rowlet's sniper targeting, which favours elites. */
function toughestEnemy(x, y, range) {
  const r = cellRange(x, y, range);
  if (!r) return -1;
  let best = -1, bestHp = -1;
  const range2 = range * range;
  for (let gy = r.y0; gy <= r.y1; gy++) {
    const rowBase = gy * GW;
    for (let gx = r.x0; gx <= r.x1; gx++) {
      const c = rowBase + gx;
      const end = cellStart[c + 1];
      for (let k = cellStart[c]; k < end; k++) {
        const j = cellItems[k];
        const e = enemies[j];
        if (!e.alive || e.prop) continue;
        if (e.hp > bestHp && dist2(x, y, e.x, e.y) <= range2) { bestHp = e.hp; best = j; }
      }
    }
  }
  return best;
}

const AIM = {
  nearest: (p, range) => nearestEnemy(p.x, p.y, range),
  toughest: (p, range) => toughestEnemy(p.x, p.y, range),
  facing: () => -1,
};

// --- Motion -----------------------------------------------------------------
// Each advances one projectile by dt. Index, not name, is stored on the projectile.

const MOTION = {
  straight(pr, dt) {
    pr.x += pr.vx * dt;
    pr.y += pr.vy * dt;
  },

  /** Steer toward the current target at a bounded turn rate. Re-acquires if the target dies. */
  homing(pr, dt) {
    let t = pr.targetIdx >= 0 && pr.targetIdx < enemies.length ? enemies[pr.targetIdx] : null;
    if (!t || !t.alive) {
      pr.targetIdx = nearestEnemy(pr.x, pr.y, 200);
      t = pr.targetIdx >= 0 ? enemies[pr.targetIdx] : null;
    }
    if (t) {
      const want = Math.atan2(t.y - pr.y, t.x - pr.x);
      const cur = Math.atan2(pr.vy, pr.vx);
      const turn = Math.sign(angDiff(cur, want)) * Math.min(Math.abs(angDiff(cur, want)), pr.homingTurn * dt);
      const a = cur + turn;
      const sp = Math.hypot(pr.vx, pr.vy);
      pr.vx = Math.cos(a) * sp;
      pr.vy = Math.sin(a) * sp;
      pr.angle = a;
    }
    pr.x += pr.vx * dt;
    pr.y += pr.vy * dt;
  },

  /** Lobbed arc: decelerates toward a landing point, then the behaviour drops a zone. */
  arc(pr, dt) {
    pr.t += dt;
    const k = Math.min(1, pr.t / pr.maxLife);
    pr.x = pr.ox + (pr.vx * pr.maxLife) * k;
    pr.y = pr.oy + (pr.vy * pr.maxLife) * k - Math.sin(k * Math.PI) * 14;
  },

  /** Slow launch, fast finish -- reads as a shot that snaps toward its target. */
  accelerate(pr, dt) {
    const k = 0.45 + Math.min(1, pr.life / (pr.maxLife * 0.5)) * 1.1;
    pr.x += pr.vx * k * dt;
    pr.y += pr.vy * k * dt;
    pr.angle = Math.atan2(pr.vy, pr.vx);
  },

  /** Drifts sinusoidally across its own heading, so a volley fans out as it flies. */
  wave(pr, dt) {
    pr.t += dt;
    pr.x += pr.vx * dt;
    pr.y += pr.vy * dt;
    // Perpendicular offset applied as a velocity, so it never desyncs from the true path.
    const sp = Math.hypot(pr.vx, pr.vy) || 1;
    const nx = -pr.vy / sp, ny = pr.vx / sp;
    const w = Math.cos(pr.t * pr.freq) * pr.amp;
    pr.x += nx * w * dt;
    pr.y += ny * w * dt;
    pr.angle += pr.spin * dt;
  },

  /**
   * Out, slow to a stop, then accelerate back to the player -- and it can hit on both legs,
   * which is what makes positioning matter.
   */
  boomerang(pr, dt) {
    pr.t += dt;
    const half = pr.maxLife * 0.5;
    if (pr.t < half) {
      const k = 1 - (pr.t / half) * 0.85;           // decelerating outward
      pr.x += pr.vx * k * dt;
      pr.y += pr.vy * k * dt;
    } else {
      pr.returning = true;
      const p = G.player;
      const dx = p.x - pr.x, dy = p.y - pr.y;
      const d = Math.hypot(dx, dy) || 1;
      const sp = Math.hypot(pr.vx, pr.vy) || 1;
      const k = 0.4 + ((pr.t - half) / half) * 1.4;  // accelerating home
      pr.x += (dx / d) * sp * k * dt;
      pr.y += (dy / d) * sp * k * dt;
      // Coming home re-arms the hit id, so the return leg can hit the same enemies again.
      if (!pr.crit) { pr.crit = true; pr.hitId = nextHitId(); }
    }
    pr.angle += pr.spin * dt;
  },

  /** Held in a circle around the player. Orbitals never expire on distance. */
  orbitPlayer(pr, dt) {
    const p = G.player;
    pr.orbitA += pr.spin * dt;
    pr.x = p.x + Math.cos(pr.orbitA) * pr.orbitR;
    pr.y = p.y + Math.sin(pr.orbitA) * pr.orbitR;
    pr.angle = pr.orbitA;
    // Orbitals sweep through the same enemies repeatedly, so the hit id refreshes each lap.
    if (pr.orbitA - pr.t > Math.PI) { pr.t = pr.orbitA; pr.hitId = nextHitId(); }
  },

  /** Sits where it was dropped and slowly fades -- the trail weapon's clouds. */
  drift(pr, dt) {
    pr.x += pr.vx * dt;
    pr.y += pr.vy * dt;
    pr.vx *= 0.94;
    pr.vy *= 0.94;
  },

  /** Winds outward from the launch point, sweeping a widening circle as it goes. */
  spiral(pr, dt) {
    pr.t += dt;
    const sp = Math.hypot(pr.vx, pr.vy) || 1;
    const a = pr.angle + pr.t * (pr.freq || 4);
    const r = sp * pr.t * 0.5;
    pr.x = pr.ox + Math.cos(a) * r;
    pr.y = pr.oy + Math.sin(a) * r;
  },

  /**
   * Falls out of the sky onto the point it was aimed at. `ox`/`oy` is the LANDING spot, and the
   * shot has no hitbox until it gets there -- otherwise it would damage everything it passed
   * over on the way down, which in a top-down view is everything between it and the target.
   */
  fall(pr, dt) {
    pr.t += dt;
    // Lands at 80% of its life, not at the very end. Reaching the ground on the same tick the
    // projectile expires means it is despawned before it ever has a hitbox -- it looks perfect
    // and deals exactly zero damage.
    const k = Math.min(1, pr.t / (pr.maxLife * 0.8));
    pr.x = pr.ox;
    pr.y = pr.oy;
    pr.z = (1 - k) * (pr.amp || 180);
    pr.r = pr.z > 3 ? 0 : pr.r0;
  },

  /** Hard alternating offsets rather than a smooth sine -- a shot that snaps side to side. */
  zigzag(pr, dt) {
    pr.t += dt;
    const sp = Math.hypot(pr.vx, pr.vy) || 1;
    const nx = -pr.vy / sp, ny = pr.vx / sp;
    const side = (Math.floor(pr.t * (pr.freq || 9)) & 1) ? 1 : -1;
    const amp = pr.amp || 120;
    pr.x += (pr.vx + nx * side * amp) * dt;
    pr.y += (pr.vy + ny * side * amp) * dt;
    pr.angle = Math.atan2(pr.vy + ny * side * amp, pr.vx + nx * side * amp);
  },

  /**
   * Stays exactly where it was placed. Mines, turrets, seeds and laid spike fields.
   *
   * The hit id refreshes on a slow cycle so something standing in a spike field keeps taking
   * damage; without it a laid hazard hits each enemy exactly once, ever.
   */
  anchor(pr, dt) {
    pr.t += dt;
    pr.angle += pr.spin * dt;
    if (pr.gen === ROLE.SHOT && pr.t > 0.5) { pr.t = 0; pr.hitId = nextHitId(); }
  },

  /**
   * Circles its own target instead of the player -- a swarm that surrounds what it is hunting
   * and stays on it as the target moves.
   */
  weave(pr, dt) {
    let t = pr.targetIdx >= 0 && pr.targetIdx < enemies.length ? enemies[pr.targetIdx] : null;
    if (!t || !t.alive) {
      pr.targetIdx = nearestEnemy(pr.x, pr.y, 260);
      t = pr.targetIdx >= 0 ? enemies[pr.targetIdx] : null;
    }
    pr.orbitA += (pr.spin || 6) * dt;
    if (!t) {
      pr.x += pr.vx * dt;
      pr.y += pr.vy * dt;
      return;
    }
    const cx = t.x + Math.cos(pr.orbitA) * pr.orbitR;
    const cy = t.y + Math.sin(pr.orbitA) * pr.orbitR;
    const k = Math.min(1, 7 * dt);
    pr.x += (cx - pr.x) * k;
    pr.y += (cy - pr.y) * k;
    pr.angle = pr.orbitA;
    // A swarm sweeps the same target over and over, so its hit id refreshes each lap.
    if (pr.orbitA - pr.t > Math.PI) { pr.t = pr.orbitA; pr.hitId = nextHitId(); }
  },

  /** Swung through an arc in front of the player -- a melee stroke, not a thrown object. */
  sweepArc(pr, dt) {
    const p = G.player;
    const k = Math.min(1, pr.life / pr.maxLife);
    const a = pr.angle + (k - 0.5) * (pr.amp || 2.4);
    pr.x = p.x + Math.cos(a) * pr.orbitR;
    pr.y = p.y + Math.sin(a) * pr.orbitR;
    pr.orbitA = a;
  },

  /** Out in a rising leap, then down hard on the far side -- a diving strike. */
  dive(pr, dt) {
    pr.t += dt;
    const k = Math.min(1, pr.t / pr.maxLife);
    pr.x = pr.ox + pr.vx * pr.maxLife * k;
    pr.y = pr.oy + pr.vy * pr.maxLife * k;
    pr.z = Math.sin(k * Math.PI) * (pr.amp || 26);
    // Only the descent connects, which is what makes it a dive rather than a dash.
    pr.r = k < 0.55 ? 0 : pr.r0;
  },

  /**
   * Hugs the ground, slowing as it spreads. Paired with a trailing hazard this is a tide of
   * sludge or sand rolling away from you rather than a thrown object.
   */
  crawl(pr, dt) {
    pr.t += dt;
    pr.x += pr.vx * dt;
    pr.y += pr.vy * dt;
    pr.vx *= 0.975;
    pr.vy *= 0.975;
    pr.r = pr.r0 * (1 + pr.t * 0.7);          // spreads as it goes
  },
};

const MOTION_KEYS = Object.keys(MOTION);
const MOTION_FNS = MOTION_KEYS.map((k) => MOTION[k]);
export const motionIndex = (name) => {
  const i = MOTION_KEYS.indexOf(name);
  if (i < 0) throw new Error(`weapons: unknown motion "${name}"`);
  return i;
};

// --- Firing behaviours ------------------------------------------------------

const BEHAVIOR = {
  /** Launch `amount` projectiles at the aimed target, fanned by `spread`. */
  projectile(w, st, p) {
    const def = w.def;
    const idx = AIM[def.aim](p, def.range * (G.stats.range || 1));
    let baseAngle;
    if (idx >= 0) {
      const t = enemies[idx];
      baseAngle = Math.atan2(t.y - p.y, t.x - p.x);
    } else if (def.aim === 'facing' || def.fireWithoutTarget) {
      baseAngle = p.dir ? 0 : Math.PI;
    } else {
      return false;                                   // nothing in range: hold the shot
    }

    const n = st.amount;
    const hitId = nextHitId();
    for (let i = 0; i < n; i++) {
      const off = n === 1 ? 0 : (i - (n - 1) / 2) * def.spread;
      fireProjectile(w, st, p, baseAngle + off, idx, hitId);
    }
    return true;
  },

  /**
   * Orbitals: maintain a ring of projectiles around the player. Re-armed on cooldown rather than
   * fired, so the weapon is always "on" and the cooldown controls how quickly a destroyed ring
   * comes back.
   */
  orbit(w, st, p) {
    const def = w.def;
    // Clear any survivors so the ring always re-forms evenly spaced.
    for (let i = projectiles.length - 1; i >= 0; i--) {
      if (projectiles[i].weapon === w.defIdx) despawn('projectiles', projectiles, i);
    }
    const n = st.amount;
    for (let i = 0; i < n; i++) {
      const pr = spawnFor(w, st, p);
      if (!pr) break;
      pr.motion = def.motionIdx;
      pr.orbitA = (i / n) * TAU;
      pr.orbitR = def.orbitRadius * st.area;
      pr.spin = def.orbitSpeed;
      pr.maxLife = st.duration;
      pr.t = 0;
      // An anchored ring is laid on the ground and left there, so it has to be placed in a ring
      // now -- `anchor` will never move it anywhere.
      if (def.motion === 'anchor') {
        pr.x = p.x + Math.cos(pr.orbitA) * pr.orbitR;
        pr.y = p.y + Math.sin(pr.orbitA) * pr.orbitR;
        pr.ox = pr.x; pr.oy = pr.y;
      }
    }
    return true;
  },

  /** Always-on damage field centred on the player. One projectile, never expiring meaningfully. */
  aura(w, st, p) {
    const def = w.def;
    for (let i = projectiles.length - 1; i >= 0; i--) {
      if (projectiles[i].weapon === w.defIdx) despawn('projectiles', projectiles, i);
    }
    const pr = spawnFor(w, st, p);
    if (!pr) return true;
    pr.motion = def.motionIdx;
    pr.orbitA = 0;
    pr.orbitR = 0;
    pr.spin = 0;
    pr.r = def.r * st.area;
    pr.maxLife = st.duration;
    pr.pierce = 9999;                      // an aura never runs out of targets
    return true;
  },

  /** Drops a lingering cloud behind the player -- rewards moving, does nothing if you stand still. */
  trail(w, st, p) {
    const def = w.def;
    const z = spawn('zones');
    if (!z) return true;
    z.x = p.x; z.y = p.y;
    z.r = def.r * st.area;
    z.maxLife = z.life = st.duration;
    z.dps = st.damage;
    z.tick = 0;
    z.slow = def.slow || 0;
    z.kind = 2;
    z.color = def.zoneColor || '#b050d0';
    z.hitId = 0;
    z.burn = (def.burn || 0) * G.stats.power;
    return true;
  },

  /**
   * A short, wide shotgun burst. Nothing travels far; the whole weapon is about what is standing
   * directly in front of you when it goes off.
   */
  cone(w, st, p) {
    const def = w.def;
    const idx = AIM[def.aim](p, def.range * (G.stats.range || 1));
    const base = idx >= 0
      ? Math.atan2(enemies[idx].y - p.y, enemies[idx].x - p.x)
      : (p.dir ? 0 : Math.PI);
    const n = st.amount;
    // Every pellet has its OWN hit id, so a dense burst stacks on one enemy instead of the
    // volley being spent on the first thing it touches.
    for (let i = 0; i < n; i++) {
      const off = (i - (n - 1) / 2) * def.spread + (G.rngRun() - 0.5) * def.spread * 0.6;
      fireProjectile(w, st, p, base + off, idx, nextHitId());
    }
    return true;
  },

  /**
   * An expanding ring of damage. Unlike an aura, which is a fixed field that sits on you, this
   * sweeps outward once per cast: standing still does not keep enemies in it.
   */
  nova(w, st, p) {
    const def = w.def;
    const anchored = def.motion === 'anchor';
    const z = spawn('zones');
    if (!z) return true;
    // A nova is stored as a zone with a growth flag; updateZones grows it and damages the front.
    z.x = p.x; z.y = p.y;
    z.r = 1;
    z.maxLife = z.life = st.duration;
    z.dps = st.damage;
    z.tick = 0;
    z.slow = def.slow || 0;
    z.kind = anchored ? ZONE.NOVA_STATIC : ZONE.NOVA;
    z.color = def.zoneColor || '#ffffff';
    z.hitId = nextHitId();
    z.burn = 0;
    z.pull = def.r * st.area;                 // reuse: the radius the front grows to
    return true;
  },

  /**
   * Buries traps around the player. They do nothing until something walks onto one, which makes
   * this the only weapon that rewards retreating over a position you have already prepared.
   */
  mine(w, st, p) {
    const def = w.def;
    const n = st.amount;
    for (let i = 0; i < n; i++) {
      const a = G.rngRun() * TAU;
      const d = def.range * (0.3 + G.rngRun() * 0.7);
      const pr = spawnFor(w, st, p);
      if (!pr) break;
      pr.motion = def.motionIdx;
      placeAt(pr, p, a, d, def.motion, st.speed, st.duration);
      pr.r0 = def.r * st.area;
      pr.r = pr.r0;
      pr.maxLife = st.duration;
      pr.fuse = def.fuse || 0;
      pr.payload = def.blastRadius || 30;
      pr.pierce = 0;                          // a mine is spent when it goes off
      pr.gen = ROLE.MINE;
      pr.t = 0;
    }
    return true;
  },

  /**
   * Leaves an emplacement behind that fires on its own timer. It does not follow you, so it is a
   * bet on where the fight is about to be rather than where it is.
   */
  turret(w, st, p) {
    const def = w.def;
    const pr = spawnFor(w, st, p);
    if (!pr) return true;
    pr.motion = def.motionIdx;
    pr.r0 = pr.r = 0;                         // the emplacement itself never collides
    pr.maxLife = st.duration;
    pr.emitT = 0;
    pr.orbitR = def.orbitRadius || 0;
    pr.spin = def.spin || 0;
    pr.gen = ROLE.TURRET;
    pr.t = 0;
    return true;
  },

  /**
   * A shot that ricochets from enemy to enemy, hitting harder with every bounce. The reward for
   * firing it into the middle of a crowd instead of at the nearest thing.
   */
  bouncer(w, st, p) {
    const def = w.def;
    const idx = AIM[def.aim](p, def.range * (G.stats.range || 1));
    if (idx < 0 && !def.fireWithoutTarget) return false;
    const base = idx >= 0
      ? Math.atan2(enemies[idx].y - p.y, enemies[idx].x - p.x)
      : (p.dir ? 0 : Math.PI);
    const n = st.amount;
    for (let i = 0; i < n; i++) {
      const off = n === 1 ? 0 : (i - (n - 1) / 2) * def.spread;
      const pr = fireProjectile(w, st, p, base + off, idx, nextHitId());
      if (!pr) break;
      pr.bounces = def.bounces || 3;
      pr.payload = def.bounceGain || 0.3;
      pr.pierce = 0;                          // a bounce is not a pierce: it changes direction
    }
    return true;
  },

  /**
   * One shot that forks into several on its first hit. Aimed at the front of a crowd it covers
   * far more ground than the single projectile it started as.
   */
  split(w, st, p) {
    const def = w.def;
    const idx = AIM[def.aim](p, def.range * (G.stats.range || 1));
    if (idx < 0) return false;
    const t = enemies[idx];
    const pr = fireProjectile(w, st, p, Math.atan2(t.y - p.y, t.x - p.x), idx, nextHitId());
    if (pr) {
      pr.payload = def.shards || 3;
      pr.gen = ROLE.SPLITTER;
      pr.pierce = 0;
    }
    return true;
  },

  /**
   * Plants a seed that does nothing at all for a couple of seconds and then detonates for far
   * more than a shot its cost would normally buy. Pure setup.
   */
  bloom(w, st, p) {
    const def = w.def;
    const idx = AIM[def.aim](p, def.range * (G.stats.range || 1));
    const a = idx >= 0
      ? Math.atan2(enemies[idx].y - p.y, enemies[idx].x - p.x)
      : G.rngRun() * TAU;
    const n = st.amount;
    for (let i = 0; i < n; i++) {
      const pr = spawnFor(w, st, p);
      if (!pr) break;
      const ang = a + (i - (n - 1) / 2) * def.spread;
      // Planted CLOSE to the player, not out at the aimed target. A seed with a two second fuse
      // that lands where the crowd currently is detonates on empty ground: the crowd is chasing
      // the player and has left by then. Near the player is where it will be.
      const d = def.range * (0.2 + G.rngRun() * 0.35);
      pr.motion = def.motionIdx;
      placeAt(pr, p, ang, d, def.motion, st.speed, def.fuse || 2);
      pr.r0 = pr.r = 0;                       // dormant: it cannot be walked into
      pr.maxLife = def.fuse || 2;
      pr.fuse = def.fuse || 2;
      pr.payload = def.blastRadius || 48;
      pr.spin = def.spin || 0;
      pr.gen = ROLE.SEED;
      pr.t = 0;
    }
    return true;
  },

  /** A cloud of tiny shots that swarm the target and stay on it until they burn out. */
  swarm(w, st, p) {
    const def = w.def;
    const idx = AIM[def.aim](p, def.range * (G.stats.range || 1));
    if (idx < 0) return false;
    const n = st.amount;
    for (let i = 0; i < n; i++) {
      const pr = spawnFor(w, st, p);
      if (!pr) break;
      const a = (i / n) * TAU;
      pr.motion = def.motionIdx;
      pr.vx = Math.cos(a) * st.speed;
      pr.vy = Math.sin(a) * st.speed;
      pr.orbitA = a;
      pr.orbitR = def.orbitRadius || 18;
      pr.spin = def.orbitSpeed || 7;
      pr.targetIdx = idx;
      pr.maxLife = st.duration;
      pr.r0 = pr.r = def.r * st.area;
      pr.pierce = 9999;
      pr.t = 0;
    }
    return true;
  },

  /**
   * A beam that latches onto one enemy and burns everything standing on the line to it. The
   * damage is applied here rather than by a projectile, because a line is not a circle and
   * approximating it with one hits things that are visibly nowhere near the beam.
   */
  tether(w, st, p) {
    const def = w.def;
    const idx = AIM[def.aim](p, def.range * (G.stats.range || 1));
    if (idx < 0) return false;
    const t = enemies[idx];
    const a = Math.atan2(t.y - p.y, t.x - p.x);
    const len = Math.min(def.range * (G.stats.range || 1), Math.hypot(t.x - p.x, t.y - p.y) + 8);
    damageLine(p.x, p.y, a, len, def.r * st.area, st.damage, nextHitId(), {
      knockback: def.knockback || 0,
      slow: def.slow || 0, slowT: 1.0,
    });
    if (arcFx) arcFx(p.x, p.y, t.x, t.y, def.arcColor || '#ffffff');
    return true;
  },

  /**
   * A vortex that drags everything toward its centre while it grinds. It deals modest damage --
   * the value is that it gathers a crowd into one place for everything else you own.
   */
  pull(w, st, p) {
    const def = w.def;
    const z = spawn('zones');
    if (!z) return true;
    const idx = AIM[def.aim](p, def.range * (G.stats.range || 1));
    if (def.motion === 'anchor' && idx >= 0) { z.x = enemies[idx].x; z.y = enemies[idx].y; }
    else { z.x = p.x; z.y = p.y; }
    z.r = def.r * st.area;
    z.maxLife = z.life = st.duration;
    z.dps = st.damage;
    z.tick = 0;
    z.slow = def.slow || 0;
    z.kind = ZONE.VORTEX;
    z.color = def.zoneColor || '#5ab6ef';
    z.hitId = 0;
    z.burn = 0;
    z.pull = def.pullForce || 120;
    return true;
  },

  /**
   * Charges while you stand still and dumps everything the moment you move. The only weapon in
   * the game that pays you for NOT kiting, which is the whole reason it exists.
   */
  charge(w, st, p) {
    const def = w.def;
    const moving = (p.vx * p.vx + p.vy * p.vy) > 4;
    const max = def.maxCharge || 5;
    // It banks either way, just twice as fast when you hold position. Only releasing on movement
    // would mean the weapon did NOTHING for a player who never stops -- which is most of them --
    // and a weapon that can deal zero damage for a whole run is not a trade-off, it is a trap.
    w.charge = Math.min(max, w.charge + (moving ? 1 : 2));
    if (!moving) return false;

    const stacks = w.charge;
    w.charge = 0;

    const idx = AIM[def.aim](p, def.range * (G.stats.range || 1));
    const base = idx >= 0
      ? Math.atan2(enemies[idx].y - p.y, enemies[idx].x - p.x)
      : Math.atan2(p.vy, p.vx);
    const hitId = nextHitId();
    for (let i = 0; i < stacks; i++) {
      const off = stacks === 1 ? 0 : (i - (stacks - 1) / 2) * def.spread;
      const pr = fireProjectile(w, st, p, base + off, idx, hitId);
      // Each banked stack makes the release hit harder, not just wider.
      if (pr) pr.dmg = st.damage * (1 + stacks * (def.chargeGain || 0.25));
    }
    return true;
  },

  /**
   * Damages everything standing between you and the enemy you are linked to. It gets better the
   * deeper into a crowd your target is, which is the opposite of how targeting usually works.
   */
  link(w, st, p) {
    const def = w.def;
    const idx = AIM[def.aim](p, def.range * (G.stats.range || 1));
    if (idx < 0) return false;
    const t = enemies[idx];
    const a = Math.atan2(t.y - p.y, t.x - p.x);
    const len = Math.hypot(t.x - p.x, t.y - p.y);
    const hits = damageLine(p.x, p.y, a, len, def.r * st.area, st.damage, nextHitId(), {
      knockback: def.knockback || 0,
      weaken: def.weaken || 0,
    });
    // The anchor itself takes the full stack of whatever the line caught.
    if (hits > 1) damageEnemy(t, st.damage * (hits - 1) * (def.linkGain || 0.5), 0, 0, true);
    if (arcFx) arcFx(p.x, p.y, t.x, t.y, def.arcColor || '#d0b0ff');
    return true;
  },

  /** A single wide stroke swung through an arc in front of you. */
  sweep(w, st, p) {
    const def = w.def;
    const idx = AIM[def.aim](p, def.range * (G.stats.range || 1));
    const a = idx >= 0
      ? Math.atan2(enemies[idx].y - p.y, enemies[idx].x - p.x)
      : (p.dir ? 0 : Math.PI);
    const n = st.amount;
    for (let i = 0; i < n; i++) {
      const pr = spawnFor(w, st, p);
      if (!pr) break;
      // Extra strokes alternate sides rather than stacking on one another.
      pr.motion = def.motionIdx;
      pr.angle = a + (i % 2 ? Math.PI : 0);
      pr.amp = def.arcWidth || 2.4;
      pr.orbitR = def.orbitRadius || 30;
      pr.r0 = pr.r = def.r * st.area;
      pr.maxLife = st.duration;
      pr.pierce = 9999;
      pr.t = 0;
    }
    return true;
  },

  /** Shots that fall onto a patch of ground rather than travelling to it. */
  rain(w, st, p) {
    const def = w.def;
    const idx = AIM[def.aim](p, def.range * (G.stats.range || 1));
    const cx = idx >= 0 ? enemies[idx].x : p.x;
    const cy = idx >= 0 ? enemies[idx].y : p.y;
    const spreadR = def.zoneRadius || 60;
    const n = st.amount;
    for (let i = 0; i < n; i++) {
      const pr = spawnFor(w, st, p);
      if (!pr) break;
      const a = G.rngRun() * TAU;
      const d = Math.sqrt(G.rngRun()) * spreadR * st.area;
      pr.motion = def.motionIdx;
      pr.ox = cx + Math.cos(a) * d;
      pr.oy = cy + Math.sin(a) * d;
      pr.x = pr.ox; pr.y = pr.oy;
      pr.amp = def.dropHeight || 150;
      pr.r0 = def.r * st.area;
      pr.r = 0;
      // Staggered, so a volley patters down instead of landing as one block.
      pr.maxLife = st.duration * (0.55 + G.rngRun() * 0.9);
      pr.pierce = def.pierce || 0;
      pr.t = 0;
    }
    return true;
  },

  /**
   * Summons a familiar that hunts on its own. It keeps working while you are busy doing
   * something else, which no other weapon here does.
   */
  companion(w, st, p) {
    const def = w.def;
    for (let i = projectiles.length - 1; i >= 0; i--) {
      if (projectiles[i].weapon === w.defIdx) despawn('projectiles', projectiles, i);
    }
    const n = st.amount;
    for (let i = 0; i < n; i++) {
      const pr = spawnFor(w, st, p);
      if (!pr) break;
      const a = (i / n) * TAU;
      pr.motion = def.motionIdx;
      pr.vx = Math.cos(a) * st.speed;
      pr.vy = Math.sin(a) * st.speed;
      pr.angle = a;
      pr.orbitA = a;
      pr.orbitR = def.orbitRadius || 20;
      pr.spin = def.orbitSpeed || 4;
      pr.homingTurn = def.homingTurn || 4;
      pr.targetIdx = -1;
      pr.maxLife = st.duration;
      pr.r0 = pr.r = def.r * st.area;
      pr.pierce = 9999;
      pr.t = 0;
    }
    return true;
  },

  /** Instant lightning arcing between clustered enemies. Rewards letting the crowd build. */
  chain(w, st, p) {
    const def = w.def;
    let x = p.x, y = p.y;
    let dmg = st.damage;
    const used = _chainUsed;
    used.length = 0;

    for (let j = 0; j < st.amount + def.jumps; j++) {
      const idx = nearestNotIn(x, y, j === 0 ? def.range : def.jumpRange, used);
      if (idx < 0) break;
      const e = enemies[idx];
      used.push(idx);
      if (arcFx) arcFx(x, y, e.x, e.y, def.arcColor || '#f8e038');
      damageEnemy(e, dmg, 0, 0, true);
      x = e.x; y = e.y;
      dmg *= def.falloff || 0.88;
    }
    return used.length > 0;
  },
};

/** How long a chill from a single projectile hit lasts. Area effects pass their own. */
const CHILL_TIME = 1.2;

const _chainUsed = [];

/** Set by main.js so the chain weapon can draw its arcs without importing render. */
export let arcFx = null;
export let trailFx = null;
export let impactFx = null;
export let blastFx = null;
export let shotSfx = null;
export function setWeaponFx(arc, trail, impact, blast) {
  arcFx = arc; trailFx = trail; impactFx = impact; blastFx = blast || null;
}
export function setWeaponSfx(fn) { shotSfx = fn; }

function nearestNotIn(x, y, range, used) {
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

/**
 * Put a projectile where its motion expects to find it.
 *
 * This is not busywork: the motions disagree about what `ox`/`oy` MEAN. `arc` treats them as the
 * launch point and integrates forward, `anchor` never moves at all, and `drift` decays a velocity
 * from wherever it starts. Setting the landing point on an `arc` shot -- which is the obvious
 * thing to write -- makes it start at its destination and sail straight past it.
 */
function placeAt(pr, p, angle, dist, motion, speed, travelTime) {
  const cx = Math.cos(angle), cy = Math.sin(angle);
  if (motion === 'anchor') {
    pr.x = pr.ox = p.x + cx * dist;
    pr.y = pr.oy = p.y + cy * dist;
    pr.vx = 0; pr.vy = 0;
  } else if (motion === 'arc') {
    // `arc` covers vx * maxLife over its life, so the velocity is chosen to land on the spot.
    pr.x = pr.ox = p.x;
    pr.y = pr.oy = p.y;
    pr.vx = (cx * dist) / Math.max(0.05, travelTime);
    pr.vy = (cy * dist) / Math.max(0.05, travelTime);
  } else {
    pr.x = pr.ox = p.x;
    pr.y = pr.oy = p.y;
    pr.vx = cx * speed;
    pr.vy = cy * speed;
  }
  pr.angle = angle;
}

/** Shared projectile setup for the non-aimed behaviours. */
function spawnFor(w, st, p) {
  const pr = spawn('projectiles');
  if (!pr) return null;
  const def = w.def;
  pr.x = p.x; pr.y = p.y;
  pr.ox = p.x; pr.oy = p.y;
  pr.vx = 0; pr.vy = 0;
  pr.angle = 0;
  pr.r = def.r * st.area;
  pr.dmg = st.damage;
  pr.pierce = st.pierce;
  pr.life = 0;
  pr.sprBase = def.sprBase;
  pr.nd = def.sprDirs;
  pr.knockback = def.knockback || 0;
  pr.weapon = w.defIdx;
  pr.targetIdx = -1;
  pr.homingTurn = 0;
  pr.area = st.area;
  pr.hitId = nextHitId();
  pr.trail = def.trail || 0;
  pr.trailColor = def.trailColor || '#ffffff';
  pr.pulse = def.pulse || 0;
  pr.impact = def.impact || 0;
  pr.impactColor = def.impactColor || '#ffffff';
  pr.amp = 0; pr.freq = 0; pr.returning = false; pr.crit = false;
  pr.spin = def.spin || 0;
  pr.maxLife = st.duration;
  pr.motion = def.motionIdx;
  pr.z = 0;
  pr.r0 = pr.r;
  pr.bounces = 0;
  pr.fuse = 0;
  pr.emitT = 0;
  pr.gen = 0;
  pr.payload = 0;
  pr.t = 0;
  pr.orbitA = 0;
  pr.orbitR = 0;
  pr.burn = def.burn || 0;
  pr.burnT = def.burnT || 3;
  pr.slow = def.slow || 0;
  return pr;
}

function fireProjectile(w, st, p, angle, targetIdx, hitId) {
  const pr = spawn('projectiles');
  if (!pr) return null;
  const def = w.def;

  pr.x = p.x; pr.y = p.y;
  pr.ox = p.x; pr.oy = p.y;
  pr.vx = Math.cos(angle) * st.speed;
  pr.vy = Math.sin(angle) * st.speed;
  pr.angle = angle;
  pr.r = def.r * st.area;
  pr.dmg = st.damage;
  pr.pierce = st.pierce;
  pr.life = 0;
  pr.maxLife = st.duration;
  pr.motion = def.motionIdx;
  pr.sprBase = def.sprBase;
  pr.nd = def.sprDirs;
  pr.knockback = def.knockback || 0;
  pr.weapon = w.defIdx;
  pr.targetIdx = targetIdx;
  pr.homingTurn = def.homingTurn || 0;
  pr.t = 0;
  pr.area = st.area;
  // Visual identity: two weapons can share a motion and still look nothing alike.
  pr.spin = def.spin || 0;
  pr.amp = def.amp || 0;
  pr.freq = def.freq || 0;
  pr.trail = def.trail || 0;
  pr.trailColor = def.trailColor || '#ffffff';
  pr.pulse = def.pulse || 0;
  pr.impact = def.impact || 0;
  pr.impactColor = def.impactColor || '#ffffff';
  pr.returning = false;
  pr.crit = false;
  pr.orbitA = 0;
  pr.orbitR = 0;
  // One id per volley, so a piercing shot cannot hit the same enemy twice, and so two projectiles
  // from the same trigger pull do not both count as the "first hit" for bonus damage.
  pr.hitId = hitId;
  pr.z = 0;
  pr.r0 = pr.r;
  // `fall` reads ox/oy as the point it comes DOWN on. Leaving them at the player means the shot
  // lands on your own head -- which looks almost right while you stand still and misses
  // completely the moment you walk away from the crowd.
  if (def.motion === 'fall' && targetIdx >= 0 && enemies[targetIdx] && enemies[targetIdx].alive) {
    pr.ox = pr.x = enemies[targetIdx].x;
    pr.oy = pr.y = enemies[targetIdx].y;
  }
  pr.bounces = 0;
  pr.fuse = 0;
  pr.emitT = 0;
  pr.gen = 0;
  pr.payload = 0;
  pr.burn = def.burn || 0;
  pr.burnT = def.burnT || 3;
  pr.slow = def.slow || 0;
  return pr;
}

// --- Weapon instances -------------------------------------------------------

/** Resolve a weapon's effective stats from its level, the player's stats and its definition. */
export function weaponStats(w) {
  const def = w.def;
  const g = G.stats;
  const o = w.resolved;

  let damage = def.damage, cooldownMul = 1, amount = def.amount, areaMul = 1, pierce = def.pierce;
  for (let i = 1; i <= w.level - 1; i++) {
    const lv = def.levels[i];
    if (!lv) continue;
    if (lv.damage) damage += lv.damage;
    if (lv.amount) amount += lv.amount;
    if (lv.pierce) pierce += lv.pierce;
    if (lv.cooldownMul) cooldownMul *= lv.cooldownMul;
    if (lv.areaMul) areaMul *= lv.areaMul;
  }

  o.damage = damage * g.power;
  o.cooldown = Math.max(0.05, (def.cooldown * cooldownMul) / g.attackSpeed);
  // A global "+1 projectile" must not add a projectile to an aura, so the weapon opts in.
  o.amount = amount + (def.usesAmount ? g.amount : 0);
  o.area = def.area * areaMul * g.area;
  o.speed = def.speed * g.projSpeed;
  o.pierce = pierce + g.pierce;
  o.duration = def.duration * g.duration;
  return o;
}

export function addWeapon(defId) {
  const defIdx = WEAPONS.findIndex((d) => d.id === defId);
  if (defIdx < 0) throw new Error(`weapons: unknown weapon "${defId}"`);
  const existing = G.weapons.find((w) => w.defIdx === defIdx);
  if (existing) { levelWeapon(existing); return existing; }
  if (G.weapons.length >= MAX_WEAPONS) return null;

  const w = {
    defIdx, def: WEAPONS[defIdx], level: 1, cd: 0, evolved: false,
    charge: 0,                  // banked stacks, for the `charge` behaviour only
    resolved: { damage: 0, cooldown: 1, amount: 1, area: 1, speed: 1, pierce: 0, duration: 1 },
  };
  G.weapons.push(w);
  return w;
}

/**
 * Swap a weapon instance for its evolved form, in place. Keeps the slot, resets the cooldown so
 * the upgrade fires immediately, and marks it so it can never evolve twice.
 */
export function evolveWeapon(w) {
  const ev = w.def.evolution;
  if (!ev || w.evolved) return false;
  const idx = WEAPONS.findIndex((d) => d.id === ev.into);
  if (idx < 0) return false;
  w.defIdx = idx;
  w.def = WEAPONS[idx];
  w.level = 1;
  w.evolved = true;
  w.cd = 0;
  return true;
}

export function levelWeapon(w) {
  if (w.level < w.def.levels.length) w.level++;
  return w;
}

// --- Update -----------------------------------------------------------------

export function updateWeapons(dt) {
  const p = G.player;
  if (!p) return;
  for (let i = 0; i < G.weapons.length; i++) {
    const w = G.weapons[i];
    const st = weaponStats(w);
    w.cd -= dt;
    if (w.cd <= 0) {
      const fired = BEHAVIOR[w.def.behavior](w, st, p);
      if (fired && shotSfx) shotSfx(w.def);
      // Holding the shot when nothing is in range costs a short retry, not the full cooldown.
      w.cd = fired ? st.cooldown : 0.12;
    }
  }
}

export function updateProjectiles(dt) {
  for (let i = projectiles.length - 1; i >= 0; i--) {
    const pr = projectiles[i];
    MOTION_FNS[pr.motion](pr, dt);
    pr.life += dt;

    if (pr.gen === ROLE.TURRET) updateTurret(pr, dt);

    if (pr.life >= pr.maxLife) {
      // A seed that reaches the end of its fuse is the whole point of the weapon, so it goes off
      // rather than quietly expiring the way a spent shot does.
      if (pr.gen === ROLE.SEED) detonate(pr);
      dropEndZone(pr);
      despawn('projectiles', projectiles, i);
      continue;
    }
    if (pr.trail > 0 && trailFx) trailFx(pr, dt);
    // A shot still in the air has no hitbox; see the `fall` and `dive` motions.
    if (pr.r > 0 && collideProjectile(pr)) {
      dropEndZone(pr);
      despawn('projectiles', projectiles, i);
    }
  }
}

/** An emplacement firing on its own clock. */
function updateTurret(pr, dt) {
  const def = WEAPONS[pr.weapon];
  pr.emitT -= dt;
  if (pr.emitT > 0) return;
  pr.emitT = def.emitGap || 0.5;

  const idx = nearestEnemy(pr.x, pr.y, def.emitRange || 160);
  if (idx < 0) return;
  const e = enemies[idx];
  const a = Math.atan2(e.y - pr.y, e.x - pr.x);

  const shot = spawn('projectiles');
  if (!shot) return;
  shot.x = pr.x; shot.y = pr.y;
  shot.ox = pr.x; shot.oy = pr.y;
  shot.vx = Math.cos(a) * (def.emitSpeed || 220);
  shot.vy = Math.sin(a) * (def.emitSpeed || 220);
  shot.angle = a;
  shot.r = shot.r0 = def.emitR || 4;
  shot.dmg = pr.dmg * (def.emitDamage || 0.6);
  shot.pierce = def.emitPierce || 0;
  shot.life = 0;
  shot.maxLife = def.emitLife || 0.9;
  shot.motion = MOTION_STRAIGHT;
  shot.sprBase = def.emitSprBase;
  shot.nd = def.emitSprDirs;
  shot.knockback = 0;
  shot.weapon = -1;                        // not the turret: it must not drop the turret's zone
  shot.targetIdx = idx;
  shot.homingTurn = 0;
  shot.area = pr.area;
  shot.hitId = nextHitId();
  shot.trail = def.emitTrail || 0;
  shot.trailColor = def.trailColor || '#ffffff';
  shot.pulse = 0;
  shot.impact = def.impact || 0;
  shot.impactColor = def.impactColor || '#ffffff';
  shot.spin = 0; shot.amp = 0; shot.freq = 0;
  shot.returning = false; shot.crit = false;
  shot.orbitA = 0; shot.orbitR = 0;
  shot.z = 0; shot.bounces = 0; shot.fuse = 0; shot.emitT = 0;
  shot.gen = ROLE.SHOT; shot.payload = 0; shot.t = 0;
  shot.burn = def.emitBurn || 0;
  shot.burnT = def.burnT || 3;
  shot.slow = def.slow || 0;
}

/** A mine or a seed going off: area damage where it sits, then it is gone. */
function detonate(pr) {
  const r = (pr.payload || 30) * (pr.area || 1);
  damageCircle(pr.x, pr.y, r, pr.dmg, nextHitId(), {
    knockback: pr.knockback || 0,
    stun: 0.2,
  });
  if (impactFx) impactFx(pr.x, pr.y, 10, pr.impactColor || '#ffffff');
  if (blastFx) blastFx(pr.x, pr.y, r, pr.impactColor || '#ffffff');
}

/** A lobbed shot that reaches the end of its arc leaves its zone behind. */
function dropEndZone(pr) {
  const def = pr.weapon >= 0 ? WEAPONS[pr.weapon] : null;
  const z0 = def && def.zoneOnEnd;
  if (!z0) return;
  const z = spawn('zones');
  if (!z) return;
  z.x = pr.x; z.y = pr.y;
  z.r = z0.r * pr.area;
  z.maxLife = z.life = z0.life;
  z.dps = z0.dps * G.stats.power;
  z.tick = 0;
  z.slow = z0.slow || 0;
  z.kind = 1;
  z.color = z0.color;
  z.hitId = 0;
  z.burn = (z0.burn || 0) * G.stats.power;
}

/**
 * Projectile -> enemy. Returns true if the projectile is spent.
 *
 * Only the cells the projectile's radius touches are visited, and `lastHitId` stops a piercing
 * shot from re-hitting the same enemy on subsequent frames.
 */
function collideProjectile(pr) {
  const range = cellRange(pr.x, pr.y, pr.r + 12);
  if (!range) return false;

  for (let gy = range.y0; gy <= range.y1; gy++) {
    const rowBase = gy * GW;
    for (let gx = range.x0; gx <= range.x1; gx++) {
      const c = rowBase + gx;
      const end = cellStart[c + 1];
      for (let k = cellStart[c]; k < end; k++) {
        const e = enemies[cellItems[k]];
        if (!e.alive || e.lastHitId === pr.hitId) continue;
        const rr = pr.r + e.r;
        if (dist2(pr.x, pr.y, e.x, e.y) > rr * rr) continue;

        e.lastHitId = pr.hitId;

        // A mine does not "hit" -- it goes off, and what it goes off next to is the point.
        if (pr.gen === ROLE.MINE) { detonate(pr); return true; }

        const kb = pr.knockback;
        const inv = kb ? kb / (Math.hypot(pr.vx, pr.vy) || 1) : 0;
        // Statuses land before the hit, so something the hit kills does not briefly light up.
        if (pr.burn > 0) applyBurn(e, pr.burn * (G.stats.power || 1), pr.burnT);
        if (pr.slow > 0) applyChill(e, pr.slow, CHILL_TIME);
        damageEnemy(e, pr.dmg, pr.vx * inv, pr.vy * inv);
        if (pr.impact > 0 && impactFx) impactFx(e.x, e.y, pr.impact, pr.impactColor);

        // Forks on its first contact, then the parent is spent.
        if (pr.gen === ROLE.SPLITTER) { fork(pr); return true; }

        // Ricochets toward something else, hitting harder each time it does.
        if (pr.bounces > 0 && ricochet(pr, e)) return false;

        if (pr.pierce <= 0) return true;
        pr.pierce--;
      }
    }
  }
  return false;
}

/** Split the parent into its shards, fanned across its heading. */
function fork(pr) {
  const n = pr.payload | 0;
  const base = Math.atan2(pr.vy, pr.vx);
  const sp = Math.hypot(pr.vx, pr.vy) || 200;
  const hitId = nextHitId();
  for (let i = 0; i < n; i++) {
    const shard = spawn('projectiles');
    if (!shard) return;
    const a = base + (i - (n - 1) / 2) * 0.5;
    shard.x = pr.x; shard.y = pr.y;
    shard.ox = pr.x; shard.oy = pr.y;
    shard.vx = Math.cos(a) * sp * 0.9;
    shard.vy = Math.sin(a) * sp * 0.9;
    shard.angle = a;
    shard.r = shard.r0 = pr.r * 0.8;
    shard.dmg = pr.dmg * 0.6;
    shard.pierce = 1;
    shard.life = 0;
    shard.maxLife = pr.maxLife * 0.55;
    shard.slow = pr.slow;
    shard.burn = pr.burn;
    shard.burnT = pr.burnT;
    shard.motion = MOTION_STRAIGHT;
    shard.sprBase = pr.sprBase;
    shard.nd = pr.nd;
    shard.knockback = pr.knockback * 0.5;
    shard.weapon = -1;
    shard.targetIdx = -1;
    shard.homingTurn = 0;
    shard.area = pr.area;
    shard.hitId = hitId;
    shard.trail = pr.trail;
    shard.trailColor = pr.trailColor;
    shard.pulse = 0;
    shard.impact = pr.impact;
    shard.impactColor = pr.impactColor;
    shard.spin = pr.spin; shard.amp = 0; shard.freq = 0;
    shard.returning = false; shard.crit = false;
    shard.orbitA = 0; shard.orbitR = 0;
    shard.z = 0; shard.bounces = 0; shard.fuse = 0; shard.emitT = 0;
    shard.gen = ROLE.SHARD; shard.payload = 0; shard.t = 0;
  }
}

/** Redirect a bouncing shot at something it has not hit yet. False if there is nothing left. */
function ricochet(pr, from) {
  const idx = nearestOther(from.x, from.y, 140, from);
  if (idx < 0) return false;
  const e = enemies[idx];
  const a = Math.atan2(e.y - pr.y, e.x - pr.x);
  const sp = Math.hypot(pr.vx, pr.vy) || 200;
  pr.vx = Math.cos(a) * sp;
  pr.vy = Math.sin(a) * sp;
  pr.angle = a;
  pr.bounces--;
  pr.dmg *= 1 + (pr.payload || 0.3);        // every bounce hits harder than the last
  pr.life = 0;                              // a bounce buys it more time in the air
  pr.hitId = nextHitId();
  if (arcFx) arcFx(from.x, from.y, e.x, e.y, pr.impactColor || '#ffffff');
  return true;
}

function nearestOther(x, y, range, skip) {
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
        if (!e.alive || e.prop || e === skip) continue;
        const d = dist2(x, y, e.x, e.y);
        if (d < bestD) { bestD = d; best = j; }
      }
    }
  }
  return best;
}

// --- Boot -------------------------------------------------------------------

// Resolved once at boot so the turret and split paths never look a motion up by name.
let MOTION_STRAIGHT = 0;

export function initWeaponDefs() {
  MOTION_STRAIGHT = motionIndex('straight');
  const seenPair = new Map();
  for (const def of WEAPONS) {
    def.motionIdx = motionIndex(def.motion);
    def.sprBase = spriteBase(def.sprite, def.palette);
    def.sprDirs = spriteDirs(def.sprite, def.palette);
    if (def.emitSprite) {
      def.emitSprBase = spriteBase(def.emitSprite, def.emitPalette || def.palette);
      def.emitSprDirs = spriteDirs(def.emitSprite, def.emitPalette || def.palette);
    }

    // The design rule, enforced rather than trusted: no two draftable weapons may share a
    // delivery mechanism. Two entries with the same behaviour AND motion are the same weapon in
    // different colours, which is exactly what this arsenal exists not to be.
    if (!def.hidden) {
      const pair = `${def.behavior}+${def.motion}`;
      if (seenPair.has(pair)) {
        console.warn(`weapons: "${def.id}" reuses the delivery of "${seenPair.get(pair)}" (${pair})`);
      } else {
        seenPair.set(pair, def.id);
      }
      if (!def.type) console.warn(`weapons: "${def.id}" has no type and will be offered to everyone`);
    }

    // A weapon that acquires targets further away than its projectile can travel fires shots
    // that always expire in flight -- it looks like it is working and deals no damage at all.
    // Only applies to behaviours that actually launch something: homing shots chase, and orbit /
    // aura / trail / chain never travel at all, so raw reach is meaningless for them.
    const reach = def.speed * def.duration;
    const travels = (def.behavior === 'projectile' || def.behavior === 'cone')
      && def.motion !== 'homing' && def.motion !== 'spiral'
      && def.motion !== 'fall' && def.motion !== 'dive' && def.motion !== 'crawl';
    if (travels && reach < def.range) {
      console.warn(`weapons: "${def.id}" aims to ${def.range} but only travels ${Math.round(reach)} -- shots will expire short`);
    }
  }
}

export { WEAPONS, WEAPON_BY_ID, angleSlot };
