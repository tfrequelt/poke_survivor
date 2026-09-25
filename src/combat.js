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
 * Chill an enemy. The counterpart to applyBurn, and exported for the same reason: a projectile
 * hit goes straight to damageEnemy and never sees the opts object the area helpers use, so
 * before this there was no way at all for a single shot to slow what it struck.
 */
export function applyChill(e, slow, seconds) {
  if (!e.alive || e.harmless) return;
  e.slow = Math.max(e.slow, slow);
  e.slowT = Math.max(e.slowT, seconds);
}

/**
 * One instalment of a damage-over-time effect.
 *
 * Same arithmetic as damageEnemy minus everything that reads as an impact: no white flash, no
 * hit sound, no floating number. Fifty burning enemies ticking four times a second would fire
 * two hundred sounds a second and overflow the 90-slot damage-number pool in under half a
 * second, drowning out the hits the player actually landed. The flame over the head is the
 * feedback.
 *
 * It also ignores armour, deliberately. Charging the armour toll on every instalment is an
 * artefact of the tick rate rather than a design decision -- halve the tick and the total
 * changes -- and at four ticks a second it would leave fire doing almost nothing to exactly the
 * rock-types it ought to melt.
 */
export function damageOverTime(e, amount) {
  if (!e.alive) return false;
  const dealt = Math.max(1, Math.round(amount));
  e.hp -= dealt;
  G.damageDealt += dealt;
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

/**
 * Damage every enemy inside an annulus, optionally limited to a cone.
 *
 * This is what a travelling wave front is: a band at radius r that sweeps outward, hitting each
 * enemy exactly once as it passes. Passing one hitId for the whole sweep is what gives that
 * "once" -- the same call runs every tick with a growing radius.
 */
export function damageRing(x, y, rInner, rOuter, dmg, hitId, opts = _opts) {
  const range = cellRange(x, y, rOuter);
  if (!range) return 0;
  const hasCone = opts.spread !== undefined && opts.spread < Math.PI;
  const ca = hasCone ? Math.cos(opts.angle || 0) : 0;
  const sa = hasCone ? Math.sin(opts.angle || 0) : 0;
  const cosLimit = hasCone ? Math.cos(opts.spread) : -1;
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

        const dx = e.x - x, dy = e.y - y;
        const d = Math.sqrt(dx * dx + dy * dy);
        if (d > rOuter + e.r || d < rInner - e.r) continue;
        // Cone test by dot product against the facing, so it needs no atan2 per enemy.
        if (hasCone && d > 0.01 && (dx * ca + dy * sa) / d < cosLimit) continue;

        e.lastHitId = hitId;
        applyStatus(e, opts);
        const inv = d > 0.01 ? 1 / d : 0;
        const kb = opts.knockback || 0;
        if (!damageEnemy(e, dmg, dx * inv * kb, dy * inv * kb, opts.canCrit !== false)) {
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
  if (opts.burn) applyBurn(e, opts.burn, opts.burnT || 3);
}

/**
 * Set an enemy alight. Exported because applyStatus is reachable only from the area helpers,
 * and a burn has to be applicable from a single-target hit too.
 *
 * Refreshes rather than stacks, like every other status here: the strongest burn and the
 * longest duration win. Stacking a damage-over-time is how a crowd turns into a slideshow.
 */
export function applyBurn(e, dps, seconds) {
  if (!e.alive || e.harmless) return;
  if (e.burnT <= 0) e.burnTick = 0.0001;   // the first instalment lands almost immediately
  e.burnDps = Math.max(e.burnDps, dps);
  e.burnT = Math.max(e.burnT, seconds);
}

/** Damage the player, respecting armour, i-frames, shields and god mode. True if it landed. */
export function damagePlayer(amount) {
  const p = G.player;
  if (!p || p.iframes > 0 || G.debug.godmode || G.runOver || G.won) return false;
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
