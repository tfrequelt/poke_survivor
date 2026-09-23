// L3 -- may import L0-L2.
//
// XP orbs, coins and the magnet. Orbs are the single most numerous entity late in a run, so this
// file cares about entity count: orbs merge into higher tiers rather than accumulating forever.

import { G } from './state.js';
import { dist2, clamp } from './util.js';
import { orbs, coins, spawn, despawn, CAP } from './world.js';
import { spriteBase } from './sprites.js';
import { ensureStats } from './stats.js';

// Tier thresholds. A tier-up is both a visual reward and a population control.
const TIERS = [
  { min: 0, palette: 'xp_small' },
  { min: 12, palette: 'xp_mid' },
  { min: 60, palette: 'xp_big' },
];

let TIER_SPR = [0, 0, 0];
let COIN_SPR = 0;

export function initPickupSprites() {
  TIER_SPR = TIERS.map((t) => spriteBase('orb', t.palette));
  COIN_SPR = spriteBase('coin', 'gold');
}

const tierOf = (v) => (v >= TIERS[2].min ? 2 : v >= TIERS[1].min ? 1 : 0);

// Orbs auto-collect after this long so a forgotten carpet of XP cannot tank the frame rate.
const ORB_MAX_AGE = 90;
const PULL_SPEED = 200;
const PULL_MAX = 450;

export function dropXp(x, y, value) {
  if (value <= 0) return;

  // At the cap, fold this orb's value into the oldest one instead of refusing the drop.
  if (orbs.length >= CAP.orbs) {
    let oldest = 0;
    for (let i = 1; i < orbs.length; i++) if (orbs[i].age > orbs[oldest].age) oldest = i;
    const o = orbs[oldest];
    o.value += value;
    o.tier = tierOf(o.value);
    o.sprId = TIER_SPR[o.tier];
    return;
  }

  const o = spawn('orbs');
  if (!o) return;
  o.x = x; o.y = y;
  o.vx = (G.rngFx() - 0.5) * 40;
  o.vy = (G.rngFx() - 0.5) * 40;
  o.value = value;
  o.tier = tierOf(value);
  o.sprId = TIER_SPR[o.tier];
  o.age = 0;
  o.pulling = false;
}

export function dropCoin(x, y, value) {
  const c = spawn('coins');
  if (!c) return;
  c.x = x; c.y = y;
  c.vx = (G.rngFx() - 0.5) * 50;
  c.vy = (G.rngFx() - 0.5) * 50;
  c.value = value;
  c.sprId = COIN_SPR;
  c.age = 0;
  c.pulling = false;
}

/** Pull every orb on the field to the player -- the magnet pickup, and the end-of-run sweep. */
export function magnetAll() {
  for (const o of orbs) o.pulling = true;
  for (const c of coins) c.pulling = true;
}

export function updatePickups(dt, onXp, onCoin) {
  const p = G.player;
  if (!p) return;
  const s = ensureStats();
  const magnet = s.magnet;
  const magnet2 = magnet * magnet;
  const grab2 = (p.r + 4) * (p.r + 4);

  for (let i = orbs.length - 1; i >= 0; i--) {
    const o = orbs[i];
    o.age += dt;

    const d2 = dist2(o.x, o.y, p.x, p.y);
    if (!o.pulling && (d2 <= magnet2 || o.age >= ORB_MAX_AGE)) o.pulling = true;

    if (o.pulling) {
      const d = Math.sqrt(d2) || 1;
      // Accelerate as it closes, so collection feels like a snap rather than a drift.
      const speed = clamp(PULL_SPEED + (1 - d / (magnet + 1)) * PULL_MAX, PULL_SPEED, PULL_MAX);
      o.x += ((p.x - o.x) / d) * speed * dt;
      o.y += ((p.y - o.y) / d) * speed * dt;
    } else {
      o.x += o.vx * dt;
      o.y += o.vy * dt;
      o.vx *= 0.88;
      o.vy *= 0.88;
    }

    if (d2 <= grab2) {
      onXp(o.value);
      despawn('orbs', orbs, i);
    }
  }

  for (let i = coins.length - 1; i >= 0; i--) {
    const c = coins[i];
    c.age += dt;
    const d2 = dist2(c.x, c.y, p.x, p.y);
    if (!c.pulling && (d2 <= magnet2 || c.age >= ORB_MAX_AGE)) c.pulling = true;

    if (c.pulling) {
      const d = Math.sqrt(d2) || 1;
      const speed = clamp(PULL_SPEED + (1 - d / (magnet + 1)) * PULL_MAX, PULL_SPEED, PULL_MAX);
      c.x += ((p.x - c.x) / d) * speed * dt;
      c.y += ((p.y - c.y) / d) * speed * dt;
    } else {
      c.x += c.vx * dt;
      c.y += c.vy * dt;
      c.vx *= 0.88;
      c.vy *= 0.88;
    }

    if (d2 <= grab2) {
      onCoin(c.value);
      despawn('coins', coins, i);
    }
  }
}

export { TIER_SPR };
