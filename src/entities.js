// L4 -- may import L0-L3, read-only.
//
// Draws the world's entities. Kept out of render.js (which owns the canvas and camera) so neither
// file grows into a monster.
//
// Draw order matters: shadows first as one pass, then everything y-sorted so a creature lower on
// the screen overlaps one behind it. Sorting 300 enemies every frame with Array.sort would be a
// measurable cost and would allocate, so entities are bucketed by screen row instead -- an O(n)
// counting sort that is more than precise enough at this sprite size.

import { G } from './state.js';
import { ctx, toScreenX, toScreenY, VW, VH } from './render.js';
import {
  enemies, projectiles, orbs, coins, damageNumbers, particles, zones, fxShapes, items,
} from './world.js';
import {
  drawSprite, drawSpriteScaled, drawShadow, drawText, FRAMES, angleSlot,
} from './sprites.js';
import { tierScale } from './pickups.js';

const MARGIN = 28;                    // draw a little beyond the edge so nothing pops in visibly

// Y-sort buckets: one per screen row band. Reused every frame, never reallocated.
const BAND = 8;
const NBANDS = Math.ceil((VH + MARGIN * 2) / BAND) + 1;
const bandHead = new Int32Array(NBANDS);
const bandNext = new Int32Array(1024);

export function drawEntities() {
  const camOffX = toScreenX(0);
  const camOffY = toScreenY(0);

  drawZones(camOffX, camOffY);
  drawPickups(camOffX, camOffY);
  drawItems(camOffX, camOffY);
  drawShadows(camOffX, camOffY);
  drawSortedActors(camOffX, camOffY);
  drawProjectiles(camOffX, camOffY);
  drawFxShapes(camOffX, camOffY);
  drawShield(camOffX, camOffY);
  drawParticles(camOffX, camOffY);
  drawDamageNumbers(camOffX, camOffY);
}

/** Ability rings and beam flashes. Drawn above actors so a cast always reads over the crowd. */
function drawFxShapes(ox, oy) {
  for (let i = 0; i < fxShapes.length; i++) {
    const f = fxShapes[i];
    const k = f.life / f.maxLife;                 // 1 -> 0 over its lifetime
    const sx = f.x + ox, sy = f.y + oy;

    if (f.kind === 0) {
      // Ring: expands outward as it fades, so it reads as a shockwave rather than a flash.
      const r = f.r * (1.35 - k * 0.35);
      ctx.globalAlpha = k * 0.85;
      ctx.strokeStyle = f.color;
      ctx.lineWidth = 1 + k * 2;
      ctx.beginPath();
      ctx.ellipse(sx, sy, r, r * 0.62, 0, 0, Math.PI * 2);
      ctx.stroke();
    } else {
      // Beam: a tapering quad along the cast angle.
      const w = f.width * k;
      const dx = Math.cos(f.angle), dy = Math.sin(f.angle);
      const nx = -dy, ny = dx;
      ctx.globalAlpha = k * 0.9;
      ctx.fillStyle = f.color;
      ctx.beginPath();
      ctx.moveTo(sx + nx * w, sy + ny * w);
      ctx.lineTo(sx + dx * f.r + nx * w * 0.4, sy + dy * f.r + ny * w * 0.4);
      ctx.lineTo(sx + dx * f.r - nx * w * 0.4, sy + dy * f.r - ny * w * 0.4);
      ctx.lineTo(sx - nx * w, sy - ny * w);
      ctx.closePath();
      ctx.fill();
    }
  }
  ctx.globalAlpha = 1;
}

/** Protect Bubble, drawn around the player while it holds. */
function drawShield(ox, oy) {
  const p = G.player;
  if (!p || p.shieldT <= 0) return;
  const sx = p.x + ox, sy = p.y + oy;
  const pulse = 1 + Math.sin(G.tick * 0.25) * 0.05;
  const r = 34 * (G.stats.area || 1) * pulse;
  ctx.globalAlpha = 0.28;
  ctx.fillStyle = '#a8e4ff';
  ctx.beginPath();
  ctx.ellipse(sx, sy - 4, r, r * 0.8, 0, 0, Math.PI * 2);
  ctx.fill();
  ctx.globalAlpha = 0.85;
  ctx.strokeStyle = '#e8f8ff';
  ctx.lineWidth = 1;
  ctx.stroke();
  ctx.globalAlpha = 1;
}

function drawZones(ox, oy) {
  for (let i = 0; i < zones.length; i++) {
    const z = zones[i];
    const sx = z.x + ox, sy = z.y + oy;
    if (sx < -z.r || sy < -z.r || sx > VW + z.r || sy > VH + z.r) continue;
    const fade = Math.min(1, z.life / 0.4);
    ctx.globalAlpha = 0.35 * fade;
    ctx.fillStyle = z.color;
    ctx.beginPath();
    ctx.ellipse(sx, sy, z.r, z.r * 0.6, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.globalAlpha = 1;
  }
}

function drawPickups(ox, oy) {
  for (let i = 0; i < orbs.length; i++) {
    const o = orbs[i];
    const sx = o.x + ox, sy = o.y + oy;
    if (sx < -12 || sy < -12 || sx > VW + 12 || sy > VH + 12) continue;
    // Size carries the tier as much as colour does; the big ones also pulse so they draw the eye.
    if (o.tier === 0) {
      drawSprite(ctx, o.sprId, sx, sy);
    } else {
      const pulse = 1 + Math.sin(G.tick * 0.14 + o.x) * 0.08 * o.tier;
      drawSpriteScaled(ctx, o.sprId, sx, sy, tierScale(o.tier) * pulse);
    }
  }
  for (let i = 0; i < coins.length; i++) {
    const c = coins[i];
    const sx = c.x + ox, sy = c.y + oy;
    if (sx < -8 || sy < -8 || sx > VW + 8 || sy > VH + 8) continue;
    drawSprite(ctx, c.sprId, sx, sy);
  }
}

/** Item pickups bob and glow, because the player has to choose to walk to them. */
function drawItems(ox, oy) {
  for (let i = 0; i < items.length; i++) {
    const it = items[i];
    const sx = it.x + ox;
    const sy = it.y + oy + Math.sin(it.age * 3 + it.bob) * 2;
    if (sx < -16 || sy < -16 || sx > VW + 16 || sy > VH + 16) continue;
    // A soft ring behind, not a filled glow -- a filled one washes the icon out entirely.
    ctx.globalAlpha = 0.22 + Math.sin(it.age * 4) * 0.08;
    ctx.strokeStyle = '#ffffff';
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.ellipse(sx, sy, 10, 6, 0, 0, Math.PI * 2);
    ctx.stroke();
    ctx.globalAlpha = 1;
    drawShadow(ctx, sx, it.y + oy + 6);
    drawSpriteScaled(ctx, it.sprId, sx, sy, 1.4);
  }
}

/** All shadows in one pass, so they never overlap a sprite drawn earlier. */
function drawShadows(ox, oy) {
  for (let i = 0; i < enemies.length; i++) {
    const e = enemies[i];
    const sx = e.x + ox, sy = e.y + oy;
    if (sx < -MARGIN || sy < -MARGIN || sx > VW + MARGIN || sy > VH + MARGIN) continue;
    drawShadow(ctx, sx, sy);
  }
  const p = G.player;
  if (p) drawShadow(ctx, p.x + ox, p.y + oy);
}

/**
 * Enemies and the player, y-sorted via row buckets. Each band holds a singly linked list built
 * from two typed arrays, so nothing allocates and the whole pass is linear.
 */
function drawSortedActors(ox, oy) {
  bandHead.fill(-1);
  if (bandNext.length < enemies.length) return drawUnsorted(ox, oy);

  let visible = 0;
  for (let i = 0; i < enemies.length; i++) {
    const e = enemies[i];
    const sy = e.y + oy;
    const sx = e.x + ox;
    if (sx < -MARGIN || sy < -MARGIN || sx > VW + MARGIN || sy > VH + MARGIN) continue;
    let b = ((sy + MARGIN) / BAND) | 0;
    if (b < 0) b = 0; else if (b >= NBANDS) b = NBANDS - 1;
    bandNext[i] = bandHead[b];
    bandHead[b] = i;
    visible++;
  }

  const p = G.player;
  const playerBand = p ? Math.min(NBANDS - 1, Math.max(0, (((p.y + oy) + MARGIN) / BAND) | 0)) : -1;
  let playerDrawn = false;

  for (let b = 0; b < NBANDS; b++) {
    for (let i = bandHead[b]; i !== -1; i = bandNext[i]) {
      drawEnemy(enemies[i], ox, oy);
    }
    if (b === playerBand && !playerDrawn) { drawPlayer(p, ox, oy); playerDrawn = true; }
  }
  if (p && !playerDrawn) drawPlayer(p, ox, oy);
}

/** Fallback if the enemy count ever exceeds the bucket arrays. Correct, just unsorted. */
function drawUnsorted(ox, oy) {
  for (let i = 0; i < enemies.length; i++) drawEnemy(enemies[i], ox, oy);
  if (G.player) drawPlayer(G.player, ox, oy);
}

function drawEnemy(e, ox, oy) {
  const sx = e.x + ox, sy = e.y + oy;
  if (sx < -MARGIN || sy < -MARGIN || sx > VW + MARGIN || sy > VH + MARGIN) return;
  // id = base + flash*(nf*nd) + frame*nd + dir. The flash variant is pre-baked white.
  const id = e.sprBase + (e.flash > 0 ? 4 : 0) + e.frame * 2 + e.dir;
  if (e.spawnT > 0) {
    ctx.globalAlpha = 1 - e.spawnT / 0.18;
    drawSprite(ctx, id, sx, sy);
    ctx.globalAlpha = 1;
  } else {
    drawSprite(ctx, id, sx, sy);
  }
  if (e.boss || e.elite) drawHealthBar(e, sx, sy);
}

function drawPlayer(p, ox, oy) {
  if (!p) return;
  const sx = p.x + ox, sy = p.y + oy;
  // Blink during i-frames, but on a slow enough cycle to stay readable in a crowd.
  if (p.iframes > 0 && (((p.iframes * 20) | 0) & 1)) return;
  drawSprite(ctx, p.sprBase + p.frame * 2 + p.dir, sx, sy);
}

function drawHealthBar(e, sx, sy) {
  const f = FRAMES[e.sprBase];
  const w = e.boss ? 28 : 16;
  const y = sy - (f ? f.oy : 16) - 4;
  const pct = Math.max(0, e.hp / e.maxHp);
  ctx.fillStyle = '#101018';
  ctx.fillRect(sx - w / 2 - 1, y - 1, w + 2, 4);
  ctx.fillStyle = e.boss ? '#ff6b6b' : '#ffd166';
  ctx.fillRect(sx - w / 2, y, w * pct, 2);
}

function drawProjectiles(ox, oy) {
  for (let i = 0; i < projectiles.length; i++) {
    const pr = projectiles[i];
    const sx = pr.x + ox, sy = pr.y + oy;
    if (sx < -16 || sy < -16 || sx > VW + 16 || sy > VH + 16) continue;
    // Rotated sprites index by baked angle; the rest just flip on heading.
    const d = pr.nd > 2 ? angleSlot(pr.angle, pr.nd) : (pr.vx >= 0 ? 1 : 0);
    drawSprite(ctx, pr.sprBase + d, sx, sy);
  }
}

function drawParticles(ox, oy) {
  for (let i = 0; i < particles.length; i++) {
    const p = particles[i];
    const sx = (p.x + ox) | 0, sy = (p.y + oy) | 0;
    if (sx < 0 || sy < 0 || sx > VW || sy > VH) continue;
    ctx.globalAlpha = Math.min(1, p.life / (p.maxLife * 0.5));
    ctx.fillStyle = p.color;
    ctx.fillRect(sx, sy, p.size, p.size);
  }
  ctx.globalAlpha = 1;
}

function drawDamageNumbers(ox, oy) {
  for (let i = 0; i < damageNumbers.length; i++) {
    const d = damageNumbers[i];
    const sx = (d.x + ox) | 0, sy = (d.y + oy) | 0;
    if (sx < -20 || sy < -12 || sx > VW + 20 || sy > VH + 12) continue;
    drawText(ctx, String(d.value), sx, sy, d.crit ? 'gold' : d.color);
  }
}
