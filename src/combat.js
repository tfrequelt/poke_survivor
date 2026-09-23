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
import { enemies } from './world.js';
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

/** Damage the player, respecting armour, i-frames and god mode. Returns true if it landed. */
export function damagePlayer(amount) {
  const p = G.player;
  if (!p || p.iframes > 0 || G.debug.godmode || G.runOver) return false;
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
