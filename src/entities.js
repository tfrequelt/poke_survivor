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
import { FX, ZONE, fxSprites } from './fx.js';
import { getImage, getAttack } from './assets.js';

const MARGIN = 28;                    // draw a little beyond the edge so nothing pops in visibly

// Y-sort buckets: one per screen row band. Reused every frame, never reallocated.
const BAND = 8;
const NBANDS = Math.ceil((VH + MARGIN * 2) / BAND) + 1;
const bandHead = new Int32Array(NBANDS);
const bandNext = new Int32Array(1024);

export function drawEntities() {
  const camOffX = toScreenX(0);
  const camOffY = toScreenY(0);
  burnMarksDrawn = 0;

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

/**
 * Deterministic pseudo-random in [0,1) from a seed and an index.
 *
 * Cracks and lightning have to look IDENTICAL every frame they are alive, so their jaggedness is
 * re-derived from the seed on each draw rather than stored. Storing the points would mean a
 * variable-length array per shape, which is exactly the allocation the pools exist to avoid.
 */
function jag(seed, i) {
  let h = (seed * 374761393 + i * 668265263) | 0;
  h = (h ^ (h >>> 13)) * 1274126177;
  return ((h ^ (h >>> 16)) >>> 0) / 4294967296;
}

/** Ability rings, beams, ground cracks, lightning and wave fronts. Drawn above the crowd. */
function drawFxShapes(ox, oy) {
  for (let i = 0; i < fxShapes.length; i++) {
    const f = fxShapes[i];
    const k = f.life / f.maxLife;                 // 1 -> 0 over its lifetime
    const sx = f.x + ox, sy = f.y + oy;

    switch (f.kind) {
      case FX.RING: {
        // Expands outward as it fades, so it reads as a shockwave rather than a flash.
        const r = f.r * (1.35 - k * 0.35);
        ctx.globalAlpha = k * 0.85;
        ctx.strokeStyle = f.color;
        ctx.lineWidth = 1 + k * 2;
        ctx.beginPath();
        ctx.ellipse(sx, sy, r, r * 0.62, 0, 0, Math.PI * 2);
        ctx.stroke();
        break;
      }

      case FX.CRACK: drawCrack(f, sx, sy, k); break;
      case FX.BOLT: drawBolt(f, sx, sy, k); break;
      case FX.WAVE: drawWave(f, sx, sy, k); break;

      default: {
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
        break;
      }
    }
  }
  ctx.globalAlpha = 1;
}

/**
 * A fissure torn across the ground: a dark jagged line with a lit rim along one edge, plus a
 * couple of branches. Drawn foreshortened (y scaled by 0.62) so it lies ON the ground the same
 * way the shockwave ellipse does, rather than standing up like a wall.
 */
function drawCrack(f, sx, sy, k) {
  const steps = 7;
  const dx = Math.cos(f.angle), dy = Math.sin(f.angle) * 0.62;
  const nx = -Math.sin(f.angle) * 0.62, ny = Math.cos(f.angle);
  // Tears open fast, then lingers and fades. Ground does not politely shrink back together.
  const open = Math.min(1, (1 - k) * 5);
  ctx.globalAlpha = Math.min(1, k * 1.6);

  for (let pass = 0; pass < 2; pass++) {
    ctx.strokeStyle = pass === 0 ? '#1a0f06' : f.color;
    ctx.lineWidth = pass === 0 ? 3 : 1;
    ctx.beginPath();
    for (let s = 0; s <= steps; s++) {
      const t = (s / steps) * open;
      const wob = (jag(f.seed, s) - 0.5) * f.r * 0.16 * Math.sin(t * Math.PI);
      const px = sx + dx * f.r * t + nx * wob + (pass ? nx * -1.2 : 0);
      const py = sy + dy * f.r * t + ny * wob + (pass ? ny * -1.2 : 0);
      if (s === 0) ctx.moveTo(px, py); else ctx.lineTo(px, py);
    }
    ctx.stroke();
  }

  // Two branches off the main fissure, so it forks the way broken ground does.
  ctx.strokeStyle = '#1a0f06';
  ctx.lineWidth = 2;
  for (let b = 0; b < 2; b++) {
    const t0 = 0.35 + b * 0.3;
    if (open < t0) continue;
    const side = b ? 1 : -1;
    const len = f.r * (0.2 + jag(f.seed, 20 + b) * 0.2);
    const a2 = f.angle + side * (0.5 + jag(f.seed, 30 + b) * 0.5);
    const bx = sx + dx * f.r * t0, by = sy + dy * f.r * t0;
    ctx.beginPath();
    ctx.moveTo(bx, by);
    ctx.lineTo(bx + Math.cos(a2) * len, by + Math.sin(a2) * len * 0.62);
    ctx.stroke();
  }
}

/**
 * A strike falling from off-screen into (x, y): a stack of bolt sprites with per-segment jitter,
 * a hot white core over them, and a flash pooling on the ground at the impact point.
 */
function drawBolt(f, sx, sy, k) {
  const spr = fxSprites.bolt;
  const segH = 16;
  const n = Math.ceil(f.r / segH);

  // Ground flash first, so the bolt lands on top of it.
  ctx.globalAlpha = k * 0.55;
  ctx.fillStyle = '#fff6b0';
  ctx.beginPath();
  ctx.ellipse(sx, sy, 22 * (1.4 - k * 0.4), 11 * (1.4 - k * 0.4), 0, 0, Math.PI * 2);
  ctx.fill();

  // The bolt itself only exists for the first half of the life; the flash outlasts it.
  const bk = Math.min(1, k * 2);
  if (bk <= 0.02) { ctx.globalAlpha = 1; return; }
  ctx.globalAlpha = bk;

  for (let i = n - 1; i >= 0; i--) {
    const y = sy - (n - i) * segH + segH / 2;
    const px = sx + (jag(f.seed, i) - 0.5) * 14 * (i / n);
    if (spr >= 0) drawSprite(ctx, spr, px, y);
  }
  // A hot core from the top of the stack down to the ground: a wide pale glow with a white
  // filament inside it, which is what makes a thin zigzag read as something blindingly bright.
  for (let pass = 0; pass < 2; pass++) {
    ctx.strokeStyle = pass === 0 ? '#fff05a' : '#ffffff';
    ctx.lineWidth = pass === 0 ? 5 : 2;
    ctx.globalAlpha = pass === 0 ? bk * 0.5 : bk;
    ctx.beginPath();
    ctx.moveTo(sx, sy);
    for (let i = 0; i < n; i++) {
      ctx.lineTo(sx + (jag(f.seed, i) - 0.5) * 14 * ((i + 1) / n), sy - (i + 1) * segH);
    }
    ctx.stroke();
  }
  ctx.globalAlpha = 1;
}

/**
 * The front of a travelling wave: crest sprites laid along an arc at the current radius, each
 * rotated to face the way the water is going, with a translucent body dragging behind it.
 */
function drawWave(f, sx, sy, k) {
  const spread = f.width || 1;
  const r = f.r;
  // Roughly one crest every 14px of arc, clamped so a large radius cannot flood the frame.
  const n = Math.max(3, Math.min(20, Math.round((spread * 2 * r) / 14)));
  const spr = fxSprites.wave;

  // The body of water dragging behind the crest. Kept faint: several fronts overlap.
  ctx.globalAlpha = k * 0.13;
  ctx.fillStyle = '#2276bd';
  ctx.beginPath();
  ctx.moveTo(sx, sy);
  ctx.ellipse(sx, sy, r, r * 0.62, 0, f.angle - spread, f.angle + spread);
  ctx.closePath();
  ctx.fill();

  ctx.globalAlpha = Math.min(1, k * 1.5);
  for (let i = 0; i < n; i++) {
    const a = f.angle - spread + (i / (n - 1)) * spread * 2;
    const px = sx + Math.cos(a) * r;
    const py = sy + Math.sin(a) * r * 0.62;
    if (spr >= 0) drawSprite(ctx, spr + angleSlot(a, fxSprites.waveDirs), px, py);
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

/**
 * Lingering hazards. A flat translucent ellipse is enough for a burn corridor, but the long-lived
 * ones (Dark Pulse's shadow, a charged strike zone) sit on screen for seconds and need to look
 * like a place you should not stand rather than a rendering mistake.
 */
function drawZones(ox, oy) {
  for (let i = 0; i < zones.length; i++) {
    const z = zones[i];
    const sx = z.x + ox, sy = z.y + oy;
    if (sx < -z.r || sy < -z.r || sx > VW + z.r || sy > VH + z.r) continue;
    const fade = Math.min(1, z.life / 0.4);
    const pulse = 1 + Math.sin(G.tick * 0.08 + z.x) * 0.04;

    if (z.kind === ZONE.DARK) {
      // A soft outer haze, a much darker core, and a rim that breathes.
      ctx.globalAlpha = 0.34 * fade;
      ctx.fillStyle = z.color;
      ctx.beginPath();
      ctx.ellipse(sx, sy, z.r * pulse, z.r * 0.6 * pulse, 0, 0, Math.PI * 2);
      ctx.fill();
      ctx.globalAlpha = 0.45 * fade;
      ctx.fillStyle = '#0b0714';
      ctx.beginPath();
      ctx.ellipse(sx, sy, z.r * 0.62, z.r * 0.37, 0, 0, Math.PI * 2);
      ctx.fill();
      ctx.globalAlpha = 0.5 * fade;
      ctx.strokeStyle = '#6a4a9a';
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.ellipse(sx, sy, z.r * pulse, z.r * 0.6 * pulse, 0, 0, Math.PI * 2);
      ctx.stroke();
    } else if (z.kind === ZONE.NOVA || z.kind === ZONE.NOVA_STATIC) {
      // An expanding front: a bright leading edge with a fading wash inside it.
      ctx.globalAlpha = 0.18 * fade;
      ctx.fillStyle = z.color;
      ctx.beginPath();
      ctx.ellipse(sx, sy, z.r, z.r * 0.6, 0, 0, Math.PI * 2);
      ctx.fill();
      for (let pass = 0; pass < 2; pass++) {
        ctx.globalAlpha = (pass ? 0.9 : 0.4) * fade;
        ctx.strokeStyle = pass ? '#ffffff' : z.color;
        ctx.lineWidth = pass ? 1 : 3;
        ctx.beginPath();
        ctx.ellipse(sx, sy, z.r, z.r * 0.6, 0, 0, Math.PI * 2);
        ctx.stroke();
      }
    } else if (z.kind === ZONE.VORTEX) {
      // Three arms winding inward, turning -- the only way a still image of a vortex spins.
      const spin = G.tick * 0.09;
      ctx.globalAlpha = 0.3 * fade;
      ctx.fillStyle = z.color;
      ctx.beginPath();
      ctx.ellipse(sx, sy, z.r, z.r * 0.6, 0, 0, Math.PI * 2);
      ctx.fill();
      ctx.globalAlpha = 0.8 * fade;
      ctx.strokeStyle = '#ffffff';
      ctx.lineWidth = 1;
      for (let arm = 0; arm < 3; arm++) {
        ctx.beginPath();
        for (let t = 0; t <= 12; t++) {
          const f = t / 12;
          const a = spin + (arm / 3) * Math.PI * 2 + f * 2.6;
          const rr = z.r * (1 - f);
          const px = sx + Math.cos(a) * rr, py = sy + Math.sin(a) * rr * 0.6;
          if (t === 0) ctx.moveTo(px, py); else ctx.lineTo(px, py);
        }
        ctx.stroke();
      }
    } else if (z.kind === ZONE.STATIC) {
      // Charged ground: faint, because bright yellow at any real opacity blinds the stage.
      ctx.globalAlpha = 0.16 * fade;
      ctx.fillStyle = z.color;
      ctx.beginPath();
      ctx.ellipse(sx, sy, z.r, z.r * 0.6, 0, 0, Math.PI * 2);
      ctx.fill();
      ctx.globalAlpha = 0.7 * fade;
      ctx.strokeStyle = '#fff05a';
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.ellipse(sx, sy, z.r * pulse, z.r * 0.6 * pulse, 0, 0, Math.PI * 2);
      ctx.stroke();
    } else {
      ctx.globalAlpha = 0.35 * fade;
      ctx.fillStyle = z.color;
      ctx.beginPath();
      ctx.ellipse(sx, sy, z.r, z.r * 0.6, 0, 0, Math.PI * 2);
      ctx.fill();
    }
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
  const id = e.sprBase + (e.flash > 0 ? e.nf * e.nd : 0) + e.frame * e.nd + e.dir;
  if (e.spawnT > 0) {
    ctx.globalAlpha = 1 - e.spawnT / 0.18;
    drawSprite(ctx, id, sx, sy);
    ctx.globalAlpha = 1;
  } else {
    drawSprite(ctx, id, sx, sy);
  }
  if (e.burnT > 0) drawBurnMark(e, sx, sy);
  if (e.boss || e.elite) drawHealthBar(e, sx, sy);
}

function drawPlayer(p, ox, oy) {
  if (!p) return;
  const sx = p.x + ox, sy = p.y + oy;
  // Blink during i-frames, but on a slow enough cycle to stay readable in a crowd.
  if (p.iframes > 0 && (((p.iframes * 20) | 0) & 1)) return;
  // A cast plays the form's Attack animation in place of its walk frames.
  if (!drawAttackFrame(p, sx, sy)) {
    // id = base + flash*(nf*nd) + frame*nd + dir
    drawSprite(ctx, p.sprBase + p.frame * p.nd + p.dir, sx, sy);
  }
  drawLowHealthMark(p, sx, sy);
}

/**
 * One frame of the current form's Attack animation. Returns false if there is nothing to draw,
 * so the caller falls back to the walk sprite.
 *
 * The frame is chosen from the real `<Duration>` list in AnimData.xml rather than a flat rate,
 * so the wind-up and the strike land where PMD put them. Anchors come from the same shadow data
 * the walk sheet uses, which is what keeps a 72x72 attack frame lined up with a 32x40 walk frame.
 */
function drawAttackFrame(p, sx, sy) {
  if (p.actDur <= 0) return false;
  const shape = G.form && G.form.shape;
  const a = shape ? getAttack(shape) : null;
  if (!a) return false;

  // A 2-slot sprite has no 8-way facing; fall back to the sheet's "down" row rather than
  // indexing past the end of it.
  const dir = p.nd === 8 ? p.dir : 0;

  let ticks = p.actT * 60;
  let f = 0;
  while (f < a.cols - 1 && ticks >= a.durs[f]) { ticks -= a.durs[f]; f++; }

  const i = (dir * a.cols + f) * 2;
  ctx.drawImage(
    a.canvas, f * a.w, dir * a.h, a.w, a.h,
    Math.round(sx - a.anchors[i]), Math.round(sy - a.anchors[i + 1]), a.w, a.h,
  );
  return true;
}

// The warning mark PMD puts over a Pokemon in trouble: the `!` animation from the status sheet,
// nine 16x14 frames laid out in a row.
const ALERT = { x: 104, y: 33, w: 16, h: 14, frames: 9, at: 0.2 };

// The burn flame from the same sheet, seven frames on the same 16px grid five rows further down.
const BURN_MARK = { x: 104, y: 112, w: 16, h: 16, frames: 7 };

/**
 * How many burn flames may be drawn in one frame.
 *
 * Each is its own drawImage, and three hundred of them cost more than two milliseconds -- enough
 * on their own to drop a full field from 60fps to 54. Past a few dozen the icon has already said
 * what it has to say: the crowd is on fire. Draw order is y-sorted and stable, so the same
 * front-most enemies keep their flame frame after frame rather than the cap causing a flicker.
 */
const BURN_MARK_CAP = 48;
let burnMarksDrawn = 0;

/**
 * The `!` over the player's head while health is critical.
 *
 * It is drawn straight from the status sheet rather than through the atlas: it is one blit,
 * only while the player is in danger, and putting a nine-frame strip in the atlas for that
 * would cost more space than it saves time.
 */
function drawLowHealthMark(p, sx, sy) {
  const max = (G.stats && G.stats.maxHp) || 1;
  if (p.hp > max * ALERT.at || p.hp <= 0) return;
  const img = getImage('status');
  if (!img) return;

  // Above the head: the sprite's own anchor gives its height, so this sits correctly whether
  // the player is a 40px Decidueye or a 24px Gastly.
  const f = FRAMES[p.sprBase + p.frame * p.nd + p.dir];
  const top = sy - (f ? f.oy : 20);
  const frame = ((G.tick / 4) | 0) % ALERT.frames;
  ctx.drawImage(
    img.canvas, ALERT.x + frame * ALERT.w, ALERT.y, ALERT.w, ALERT.h,
    Math.round(sx + 4), Math.round(top - ALERT.h - 1), ALERT.w, ALERT.h,
  );
}

/**
 * The flame over a burning enemy, built the same way as the player's `!`.
 *
 * One difference that matters: the player's marker runs off the global tick, which is fine for
 * a single instance but makes fifty burning enemies flicker in perfect unison. Seeding the
 * phase from the enemy's own position breaks them up without needing a per-enemy timer.
 */
function drawBurnMark(e, sx, sy) {
  if (burnMarksDrawn >= BURN_MARK_CAP) return;
  const img = getImage('status');
  if (!img) return;
  burnMarksDrawn++;

  const f = FRAMES[e.sprBase + e.frame * e.nd + e.dir];
  const top = sy - (f ? f.oy : 12);
  // World coordinates are centred on the origin and go negative, and a negative JS remainder
  // would index LEFT of the flame strip into the unrelated status panels beside it -- which is
  // exactly as obvious on screen as it sounds. Mask the phase to keep it non-negative.
  const phase = ((e.x | 0) + (e.y | 0)) & 0xffff;
  const frame = (((G.tick / 4) | 0) + phase) % BURN_MARK.frames;
  ctx.drawImage(
    img.canvas, BURN_MARK.x + frame * BURN_MARK.w, BURN_MARK.y, BURN_MARK.w, BURN_MARK.h,
    Math.round(sx + 3), Math.round(top - BURN_MARK.h + 2), BURN_MARK.w, BURN_MARK.h,
  );
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
    if (sx < -24 || sy < -24 - pr.z || sx > VW + 24 || sy > VH + 24) continue;
    // Rotated sprites index by baked angle; the rest just flip on heading.
    const d = pr.nd > 2 ? angleSlot(pr.angle, pr.nd) : (pr.vx >= 0 ? 1 : 0);
    if (pr.z > 1) {
      // Airborne: a shadow on the ground is the only thing that tells the player where it is
      // going to land, and where it lands is the entire decision the weapon asks of them.
      drawShadow(ctx, sx, sy, Math.max(0.4, 1 - pr.z / 220));
      drawSprite(ctx, pr.sprBase + d, sx, sy - pr.z);
    } else {
      drawSprite(ctx, pr.sprBase + d, sx, sy);
    }
  }
}

function drawParticles(ox, oy) {
  for (let i = 0; i < particles.length; i++) {
    const p = particles[i];
    const sx = (p.x + ox) | 0, sy = (p.y + oy) | 0;
    if (sx < -8 || sy < -8 || sx > VW + 8 || sy > VH + 8) continue;
    ctx.globalAlpha = Math.min(1, p.life / (p.maxLife * 0.5));
    // A sprite particle (rubble, a shadow wisp) costs one drawImage; the rest stay 1px rects.
    if (p.sprId >= 0) drawSprite(ctx, p.sprId, sx, sy);
    else { ctx.fillStyle = p.color; ctx.fillRect(sx, sy, p.size, p.size); }
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
