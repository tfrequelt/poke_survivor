// L2 -- may import L0-L1.
//
// The damage pipeline. It lives below the L3 systems on purpose: weapons.js and player.js both
// need to hurt enemies, but neither may import enemies.js without creating a cycle. Everything
// that deals damage goes through here, which also gives one place to hang crits, armor, damage
// numbers, on-kill drops and telemetry.
//
// Reactions (spawning XP orbs, popping damage numbers, playing a sound) are HOOKS assigned by
// main.js at boot, so this module stays free of upward dependencies.

import { G } from './state.js';
import { enemies, cellRange, cellStart, cellItems, GW } from './world.js';
import { dist2 } from './util.js';

export const hooks = {
  onDamage: null,   // (enemy, dealt, crit) -- damage numbers, hit sparks
  onKill: null,     // (enemy) -- XP orbs, coins, death puff, kill tally
  onPlayerHit: null,
};

/**
 * Roll a crit and apply damage to one enemy.
 *
 * Flat armor subtracts AFTER the crit multiplier, with a floor of 1, so a multi-hit weapon is
 * blunted by armour but never fully negated.
 */
export function damageEnemy(e, amount, knockX = 0, knockY = 0, canCrit = true) {
  if (!e.alive) return false;
  const s = G.stats;
  const crit = canCrit && s && s.crit > 0 && G.rngRun() < s.crit;
  const raw = crit ? amount * (s.critMult || 1.5) : amount;
  const dealt = Math.max(1, Math.round(raw) - e.armor);

  e.hp -= dealt;
  e.flash = 0.09;
  G.damageDealt += dealt;

  if (knockX !== 0 || knockY !== 0) {
    const resist = 1 - e.knockResist;
    e.knockX += knockX * resist;
    e.knockY += knockY * resist;
  }

  if (hooks.onDamage) hooks.onDamage(e, dealt, crit);

  if (e.hp <= 0) {
    killEnemy(e);
    return true;
  }
  return false;
}

/**
 * Mark an enemy dead and fire the kill hook.
 *
 * It is deliberately NOT removed here. Removal is swap-and-pop, which reorders the enemies array
 * -- and collision loops are mid-iteration over grid cells holding INDICES into that array. Tear
 * one out during a pierce sweep and the remaining indices point at the wrong enemies. So the body
 * stays in place until main.js sweeps at the end of the tick, and every loop skips `!alive`.
 */
export function killEnemy(e) {
  if (!e.alive) return false;
  e.alive = false;
  if (hooks.onKill) hooks.onKill(e);
  return true;
}

/** Bomb pickup and the 20:00 board wipe. `radius` of 0 means the whole field. */
export function killAll(radius = 0) {
  const p = G.player;
  const r2 = radius > 0 ? radius * radius : Infinity;
  let n = 0;
  for (let i = 0; i < enemies.length; i++) {
    const e = enemies[i];
    if (!e.alive || e.boss) continue;
    if (dist2(e.x, e.y, p.x, p.y) > r2) continue;
    if (killEnemy(e)) n++;
  }
  return n;
}

// --- Area damage ------------------------------------------------------------
//
// Abilities hit regions, not single enemies. Both helpers walk the uniform grid the same way
// weapons.js does, and both take a hitId from nextHitId() so one cast can never hit the same
// enemy twice -- which matters for an expanding shockwave that overlaps itself across ticks.

const _opts = {};

/**
 * Damage every enemy inside a circle. `opts` may carry { knockback, stun, slow, slowT, weaken,
 * execute, noFly, lifesteal, canCrit }. Returns the number of enemies hit.
 */
export function damageCircle(x, y, r, dmg, hitId, opts = _opts) {
  const range = cellRange(x, y, r);
  if (!range) return 0;
  let hits = 0;

  for (let gy = range.y0; gy <= range.y1; gy++) {
    const rowBase = gy * GW;
    for (let gx = range.x0; gx <= range.x1; gx++) {
      const c = rowBase + gx;
      const end = cellStart[c + 1];
      for (let k = cellStart[c]; k < end; k++) {
        const e = enemies[cellItems[k]];
        if (!e.alive || e.lastHitId === hitId) continue;
        // Ground moves miss flyers -- Earthquake should read like the real type chart.
        if (opts.noFly && e.flying) continue;
        const rr = r + e.r;
        if (dist2(x, y, e.x, e.y) > rr * rr) continue;

        e.lastHitId = hitId;
        applyStatus(e, opts);
        const d = Math.hypot(e.x - x, e.y - y) || 1;
        const kb = opts.knockback || 0;
        if (damageEnemy(e, dmg, ((e.x - x) / d) * kb, ((e.y - y) / d) * kb, opts.canCrit !== false)) {
          // already dead; nothing further
        } else if (opts.execute && e.hp <= e.maxHp * opts.execute && !e.boss) {
          killEnemy(e);
        }
        hits++;
      }
    }
  }
  return hits;
}

/**
 * Damage every enemy within `width` of a ray from (x, y) along `angle` for `len`.
 * Used by Hyperbeam, Spectral Arrow and Hydro Pump.
 */
export function damageLine(x, y, angle, len, width, dmg, hitId, opts = _opts) {
  const dx = Math.cos(angle), dy = Math.sin(angle);
  // Query a circle covering the whole ray, then reject per-enemy by perpendicular distance.
  const midX = x + dx * len * 0.5, midY = y + dy * len * 0.5;
  const range = cellRange(midX, midY, len * 0.5 + width);
  if (!range) return 0;
  let hits = 0;

  for (let gy = range.y0; gy <= range.y1; gy++) {
    const rowBase = gy * GW;
    for (let gx = range.x0; gx <= range.x1; gx++) {
      const c = rowBase + gx;
      const end = cellStart[c + 1];
      for (let k = cellStart[c]; k < end; k++) {
        const e = enemies[cellItems[k]];
        if (!e.alive || e.lastHitId === hitId) continue;
        if (opts.noFly && e.flying) continue;

        // Project onto the ray, clamped to the segment.
        const ex = e.x - x, ey = e.y - y;
        const along = ex * dx + ey * dy;
        if (along < -e.r || along > len + e.r) continue;
        const perp = Math.abs(ex * -dy + ey * dx);
        if (perp > width + e.r) continue;

        e.lastHitId = hitId;
        applyStatus(e, opts);
        const kb = opts.knockback || 0;
        if (!damageEnemy(e, dmg, dx * kb, dy * kb, opts.canCrit !== false)) {
          if (opts.execute && e.hp <= e.maxHp * opts.execute && !e.boss) killEnemy(e);
        }
        hits++;
      }
    }
  }
  return hits;
}

function applyStatus(e, opts) {
  if (opts.stun) e.stunT = Math.max(e.stunT, opts.stun);
  if (opts.slow) { e.slow = Math.max(e.slow, opts.slow); e.slowT = Math.max(e.slowT, opts.slowT || 2); }
  if (opts.weaken) e.weakenT = Math.max(e.weakenT, opts.weaken);
}

/** Damage the player, respecting armour, i-frames, shields and god mode. True if it landed. */
export function damagePlayer(amount) {
  const p = G.player;
  if (!p || p.iframes > 0 || G.debug.godmode || G.runOver) return false;
  // Protect Bubble blocks contact damage outright rather than reducing it.
  if (p.shieldT > 0) return false;
  const s = G.stats;
  const dealt = Math.max(1, Math.round(amount - (s.armor || 0)));
  p.hp -= dealt;
  p.iframes = IFRAMES;
  G.damageTaken += dealt;
  if (hooks.onPlayerHit) hooks.onPlayerHit(dealt);
  return true;
}

/**
 * Invulnerability window after any hit. This is the cleanest lever on late-game survivability --
 * if players die at 17:00 to "I don't know what hit me", raise this before touching enemy damage.
 */
export const IFRAMES = 0.35;
