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
import { damageEnemy } from './combat.js';
import { WEAPONS, WEAPON_BY_ID } from './data/weapons.js';
import { spriteBase, spriteDirs, angleSlot } from './sprites.js';

export const MAX_WEAPONS = 6;

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
        if (!e.alive) continue;
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
        if (!e.alive) continue;
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
};

const MOTION_KEYS = Object.keys(MOTION);
const MOTION_FNS = MOTION_KEYS.map((k) => MOTION[k]);
const motionIndex = (name) => {
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
};

function fireProjectile(w, st, p, angle, targetIdx, hitId) {
  const pr = spawn('projectiles');
  if (!pr) return;
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
  // One id per volley, so a piercing shot cannot hit the same enemy twice, and so two projectiles
  // from the same trigger pull do not both count as the "first hit" for bonus damage.
  pr.hitId = hitId;
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
    resolved: { damage: 0, cooldown: 1, amount: 1, area: 1, speed: 1, pierce: 0, duration: 1 },
  };
  G.weapons.push(w);
  return w;
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
    if (pr.life >= pr.maxLife) { despawn('projectiles', projectiles, i); continue; }
    if (collideProjectile(pr)) despawn('projectiles', projectiles, i);
  }
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
        const kb = pr.knockback;
        const inv = kb ? kb / (Math.hypot(pr.vx, pr.vy) || 1) : 0;
        damageEnemy(e, pr.dmg, pr.vx * inv, pr.vy * inv);

        if (pr.pierce <= 0) return true;
        pr.pierce--;
      }
    }
  }
  return false;
}

// --- Boot -------------------------------------------------------------------

export function initWeaponDefs() {
  for (const def of WEAPONS) {
    def.motionIdx = motionIndex(def.motion);
    def.sprBase = spriteBase(def.sprite, def.palette);
    def.sprDirs = spriteDirs(def.sprite, def.palette);

    // A weapon that acquires targets further away than its projectile can travel fires shots
    // that always expire in flight -- it looks like it is working and deals no damage at all.
    // Homing shots get a pass: they chase, so raw reach is not the whole story.
    const reach = def.speed * def.duration;
    if (def.motion !== 'homing' && reach < def.range) {
      console.warn(`weapons: "${def.id}" aims to ${def.range} but only travels ${Math.round(reach)} -- shots will expire short`);
    }
  }
}

export { WEAPONS, WEAPON_BY_ID, angleSlot };
