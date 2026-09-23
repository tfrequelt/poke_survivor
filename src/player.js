// L3 -- may import L0-L2.
//
// The player entity: movement, health, i-frames, contact damage and levelling.

import { G } from './state.js';
import { moveAxis } from './input.js';
import { dist2 } from './util.js';
import { enemies, cellRange, cellStart, cellItems, GW } from './world.js';
import { damagePlayer } from './combat.js';
import { ensureStats } from './stats.js';

/** Per-enemy contact cooldown. Separate from player i-frames so a crowd cannot instagib. */
const CONTACT_CD = 0.5;

export function createPlayer(x = 0, y = 0) {
  return {
    x, y,
    vx: 0, vy: 0,
    r: 5,
    dir: 1,                // 1 = right, 0 = left; indexes the pre-baked sprite variants
    hp: 100, maxHp: 100,
    iframes: 0,
    moving: false,
    animTime: 0,
    frame: 0,
    sprBase: 0,
    stillTime: 0,          // feeds Dartrix's "Tidy Feathers"
    regenAcc: 0,
  };
}

export function updatePlayer(dt) {
  const p = G.player;
  if (!p) return;
  const s = ensureStats();

  const axis = moveAxis();
  p.vx = axis.x * s.moveSpeed;
  p.vy = axis.y * s.moveSpeed;
  p.x += p.vx * dt;
  p.y += p.vy * dt;

  p.moving = axis.x !== 0 || axis.y !== 0;
  p.stillTime = p.moving ? 0 : p.stillTime + dt;
  if (axis.x > 0) p.dir = 1;
  else if (axis.x < 0) p.dir = 0;

  if (p.moving) {
    p.animTime += dt;
    p.frame = ((p.animTime * 7) | 0) & 1;
  } else {
    p.animTime = 0;
    p.frame = 0;
  }

  if (p.iframes > 0) p.iframes -= dt;

  // Regen is applied in whole points so the HUD never shows a fractional bar creeping.
  if (s.regen > 0 && p.hp < s.maxHp) {
    p.regenAcc += s.regen * dt;
    if (p.regenAcc >= 1) {
      const whole = Math.floor(p.regenAcc);
      p.regenAcc -= whole;
      p.hp = Math.min(s.maxHp, p.hp + whole);
    }
  }

  contactDamage(p, dt);

  if (p.hp <= 0 && !G.runOver) {
    p.hp = 0;
    G.runOver = true;
    G.won = false;
  }
}

/**
 * Enemy -> player contact. One small grid query per tick rather than a scan of every enemy.
 * Each enemy carries its own cooldown so standing in a crowd deals steady damage rather than
 * one massive spike, and the player's i-frames then gate the overall rate.
 */
function contactDamage(p, dt) {
  const reach = p.r + 16;
  const range = cellRange(p.x, p.y, reach);
  if (!range) return;

  for (let gy = range.y0; gy <= range.y1; gy++) {
    const rowBase = gy * GW;
    for (let gx = range.x0; gx <= range.x1; gx++) {
      const c = rowBase + gx;
      const end = cellStart[c + 1];
      for (let k = cellStart[c]; k < end; k++) {
        const e = enemies[cellItems[k]];
        if (!e.alive) continue;
        if (e.contactCd > 0) { e.contactCd -= dt; continue; }
        const rr = p.r + e.r;
        if (dist2(p.x, p.y, e.x, e.y) > rr * rr) continue;
        if (damagePlayer(e.dmg)) e.contactCd = CONTACT_CD;
      }
    }
  }
}

export function healPlayer(amount) {
  const p = G.player;
  if (!p) return;
  p.hp = Math.min(G.stats.maxHp, p.hp + amount);
}
