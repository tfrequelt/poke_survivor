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
  decoys, DECOY_DIE,
} from './world.js';
import {
  drawSprite, drawSpriteScaled, drawShadow, drawText, FRAMES, angleSlot,
} from './sprites.js';
import { tierScale, TIER_COUNT } from './pickups.js';
import { FX, ZONE, fxSprites } from './fx.js';
import { getImage, getAttack, getSequence } from './assets.js';
import { thrownItem, activeAbility, activeVisual } from './abilities.js';
import { sampleDuration } from './audio.js';
import { hash2 } from './util.js';
import { liveTraps } from './traps.js';
import {
  drawPortal, drawLegendBoss, legendShadowScale, drawLegendGround, drawLegendAir, drawLegendShot,
  drawLegendWeather, drawPlayerStatus,
} from './legendfx.js';

const MARGIN = 28;                    // draw a little beyond the edge so nothing pops in visibly

// Y-sort buckets: one per screen row band. Reused every frame, never reallocated.
const BAND = 8;
const NBANDS = Math.ceil((VH + MARGIN * 2) / BAND) + 1;
const bandHead = new Int32Array(NBANDS);
const bandNext = new Int32Array(1024);

let stairsSpr = -1;
let hostileSpr = -1;
/** kind -> atlas frame, filled by main.js at boot. */
let trapSpr = null;

export function setTrapSprites(map) { trapSpr = map; }

/** Told by main.js which frame an enemy shot draws with, once, at boot. */
export function setHostileSprite(id) { hostileSpr = id; }

/** Told by main.js which flight this stage uses, once, when the run starts. */
export function setStairsSprite(id) { stairsSpr = id; }

export function drawEntities() {
  const camOffX = toScreenX(0);
  const camOffY = toScreenY(0);
  burnMarksDrawn = 0;

  drawZones(camOffX, camOffY);
  drawTraps(camOffX, camOffY);
  drawStairs(camOffX, camOffY);
  drawPortal(camOffX, camOffY);
  drawLegendGround(camOffX, camOffY);
  drawPickups(camOffX, camOffY);
  drawItems(camOffX, camOffY);
  drawShadows(camOffX, camOffY);
  drawSortedActors(camOffX, camOffY);
  drawLegendAir(camOffX, camOffY);
  drawProjectiles(camOffX, camOffY);
  drawThrown(camOffX, camOffY);
  drawNightShade(camOffX, camOffY);
  drawTsunami(camOffX, camOffY);
  drawFxShapes(camOffX, camOffY);
  drawShield(camOffX, camOffY);
  drawParticles(camOffX, camOffY);
  drawDamageNumbers(camOffX, camOffY);
  drawWeather();
  drawLegendWeather();
}

// The ripped hail overlay: 65 frames of 240x160, stitched into one strip at load. 240x160 is
// the GBA screen, so drawing it 1:1 puts the hailstones at the same size relative to a Pokemon
// as they were in the original -- scaling it up would make them boulders.
const HAIL = { cycle: 2.2, tiles: 3 };

/**
 * Weather laid over the whole viewport, in SCREEN space rather than world space: a storm is
 * around the player wherever they walk, and anchoring it to the world would slide it away.
 *
 * One cycle of the animation lasts as long as the hail sound, and it repeats for however long
 * the ability channels -- the fall is a single burst of hail crossing the screen, so a five
 * second blizzard is two and a bit waves of it rather than one burst and four seconds of
 * silence. The three tile rows are phase-shifted so they do not fall in lockstep.
 */
function drawWeather() {
  const a = activeAbility('blizzard');
  if (!a) return;
  const seq = getSequence('hail');
  if (!seq) return;

  const total = (a.resolved && a.resolved.channel) || a.def.channel || 1;
  const elapsed = Math.max(0, total - a.activeT);
  const cycle = sampleDuration('move_hail') || HAIL.cycle;
  const base = (elapsed / cycle) * seq.frames;

  const cols = Math.ceil(VW / seq.w);
  const rows = Math.ceil(VH / seq.h);
  for (let row = 0; row < rows; row++) {
    // A third of the animation between rows, so the bands read as continuous hail.
    const f = (((base + row * (seq.frames / rows)) | 0) % seq.frames + seq.frames) % seq.frames;
    for (let col = 0; col < cols; col++) {
      ctx.drawImage(
        seq.canvas, f * seq.w, 0, seq.w, seq.h,
        col * seq.w, row * seq.h, seq.w, seq.h,
      );
    }
  }
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
// The ripped blast sheet: seven frames on a 56px pitch along its first row, on a teal backdrop
// keyed out at load. Far too big for the atlas, so it is blitted straight from its canvas the
// same way the attack sheets and the status icons are.
const BOOM = { w: 56, h: 56, y: 3, frames: 7 };

/** One frame of the explosion, scaled so the sheet's cell covers the blast radius. */
function drawBoom(f, sx, sy, k) {
  const img = getImage('explosion');
  if (!img) return;
  // k runs 1 -> 0 over the life, so the frame index runs forward.
  const i = Math.min(BOOM.frames - 1, Math.max(0, ((1 - k) * BOOM.frames) | 0));
  // The sheet's 56px cell maps to the blast DIAMETER, so the drawn shockwave lands where the
  // damage did rather than a half-screen wider than it.
  const d = f.r * 2;
  ctx.drawImage(
    img.canvas, i * BOOM.w, BOOM.y, BOOM.w, BOOM.h,
    Math.round(sx - d / 2), Math.round(sy - d / 2), d, d,
  );
}

/**
 * An item an ability has in the air -- Delibird's present. Drawn as the very sprite the HUD
 * shows in that ability's cooldown slot, so what leaves your hands is recognisably what the
 * icon promised. Its position comes from the ability itself; the arc lives there, not here.
 */
function drawThrown(ox, oy) {
  const a = thrownItem();
  if (!a) return;
  const sx = a.gx + ox, sy = a.gy + oy;
  if (sx < -40 || sy < -40 || sx > VW + 40 || sy > VH + 40) return;

  // A fire star draws itself from its own sheet; anything else is the ability's HUD icon, so
  // what leaves your hands is recognisably what the cooldown slot promised.
  if (a.def.effect === 'fireShot') {
    if (drawFireStar(sx, sy, a.def.channel - a.activeT)) return;
  }
  if (a.def.effect === 'shadowOrb') {
    if (drawShadowOrb(sx, sy, a.def.channel - a.activeT)) return;
  }
  if (a.def.iconBase === undefined) return;
  drawShadow(ctx, sx, a.zy + oy, 1.1);
  drawSpriteScaled(ctx, a.def.iconBase, sx, sy, 1);
}

// The Flamethrower sheet is one animation in two halves: the first eleven frames are the star
// spinning as it flies, the last twelve are the burst where it lands. They are drawn by two
// different things at two different times, so the split is named once here.
const FIRE_FLY = 11;

/**
 * The two-frame shadow orb, alternating as it flies.
 *
 * Only two frames, so the rate matters: fast enough that the purple aura reads as swirling,
 * slow enough that it is not a strobe.
 */
function drawShadowOrb(sx, sy, t) {
  const seq = getSequence('fx_shadoworb');
  if (!seq) return false;
  const f = ((t * 14) | 0) % seq.frames;
  ctx.drawImage(seq.canvas, f * seq.w, 0, seq.w, seq.h,
    Math.round(sx - seq.w / 2), Math.round(sy - seq.h / 2), seq.w, seq.h);
  return true;
}

/** Frames 0..10, looped: the star spinning while it is in the air. */
function drawFireStar(sx, sy, t) {
  const seq = getSequence('fx_flamethrower');
  if (!seq) return false;
  // Four distinct poses repeat across those eleven frames, so a brisk rate reads as a spin
  // rather than a flicker.
  const f = ((t * 24) | 0) % FIRE_FLY;
  ctx.drawImage(seq.canvas, f * seq.w, 0, seq.w, seq.h,
    Math.round(sx - seq.w / 2), Math.round(sy - seq.h / 2), seq.w, seq.h);
  return true;
}

/**
 * Frames 11..22, once: the burst.
 *
 * Drawn at the sheet's OWN size, exactly as the star that became it -- the two are one
 * animation and the flame must not change scale halfway through it. The blast radius is
 * deliberately not used here: the hitbox is wider than the drawing, which is normal for an
 * explosion and much better than a sprite blown up to four times the size it was drawn at.
 */
function drawFireBurst(f, sx, sy, k) {
  const seq = getSequence('fx_flamethrower');
  if (!seq) return;
  const n = seq.frames - FIRE_FLY;
  const i = FIRE_FLY + Math.min(n - 1, Math.max(0, ((1 - k) * n) | 0));
  ctx.drawImage(seq.canvas, i * seq.w, 0, seq.w, seq.h,
    Math.round(sx - seq.w / 2), Math.round(sy - seq.h / 2), seq.w, seq.h);
}

/**
 * Blast Burn's ring of flame, drawn by the vortex that owns it.
 *
 * It belongs to the zone rather than to a free-floating effect because the zone MOVES: it is
 * carried by the player, and an effect pinned to where the cast happened would slide off it.
 *
 * Looped rather than stretched over the zone's life: eleven frames spread across five seconds
 * is a slideshow, and the ring is meant to be burning the whole time.
 */
function drawFireRing(z, sx, sy, fade) {
  const seq = getSequence('fx_blastburn');
  if (!seq) return;
  const i = ((z.maxLife - z.life) * 14 | 0) % seq.frames;
  const d = z.r * 2;
  const h = d * (seq.h / seq.w);
  ctx.globalAlpha = fade;
  ctx.drawImage(seq.canvas, i * seq.w, 0, seq.w, seq.h,
    Math.round(sx - d / 2), Math.round(sy - h / 2), d, h);
  ctx.globalAlpha = 1;
}

/**
 * An arrow flying the length of a shot, turned to face along it.
 *
 * Rotated with a canvas transform rather than by baking sixteen angles into the atlas: this is
 * one sprite drawn a handful of times for a quarter of a second, the atlas is already at 87%,
 * and a real angle looks better than the nearest of sixteen.
 */
function drawDart(f, sx, sy, k) {
  const seq = getSequence('fx_arrow');
  if (!seq) return;
  const t = 1 - k;                                   // 0 at the muzzle, 1 at the far end
  const x = sx + Math.cos(f.angle) * f.r * t;
  const y = sy + Math.sin(f.angle) * f.r * t;
  ctx.save();
  ctx.translate(Math.round(x), Math.round(y));
  // The art points LEFT, so the heading is half a turn from the angle it is drawn at.
  ctx.rotate(f.angle + Math.PI);
  ctx.drawImage(seq.canvas, 0, 0, seq.w, seq.h, -seq.w / 2, -seq.h / 2, seq.w, seq.h);
  ctx.restore();
}

/**
 * Night Shade: the sheet's two circles, staged.
 *
 * The small circle opens, swells into the big one, and then the big one blinks on and off for
 * the rest of the cast. The blink is the point -- a shadow that simply sat there would read as
 * a decal, and the flicker is what makes it look like something is eating the ground.
 *
 * Drawn from the ability rather than pushed as an effect because the rings it accompanies are
 * emitted at the player's CURRENT position on every wave; an effect pinned where the cast
 * started would slide off them.
 *
 * The sheet's own art is a mottled red and blue, which is nobody's idea of a shadow, so it is
 * laid over a dark pool and under a drift of shadow motes to carry the colour.
 */
function drawNightShade(ox, oy) {
  const a = activeVisual('nightShade');
  if (!a) return;
  const seq = getSequence('fx_nightshade');
  const p = G.player;
  if (!seq || !p) return;

  const st = a.resolved;
  const total = Math.max(0.3, a.def.waves * a.def.waveGap + 0.1);
  const t = Math.max(0, total - a.activeT);
  const sx = p.x + ox, sy = p.y + oy;

  const OPEN = 0.10;                      // the small circle alone
  const GROW = 0.14;                      // it swells into the big one
  let frame = 1;
  let scale = 1;
  if (t < OPEN) {
    frame = 0;
    scale = 0.5 + 0.5 * (t / OPEN);
  } else if (t < OPEN + GROW) {
    const k = (t - OPEN) / GROW;
    frame = k < 0.5 ? 0 : 1;
    scale = 0.9 + 0.25 * k;
  } else {
    // Blinking. Off for the shorter part of each cycle, so it reads as a flicker rather than
    // as something that keeps disappearing.
    if (((t - OPEN - GROW) * 9 % 1) > 0.72) return;
  }

  const d = st.radius * 2.1 * scale;
  const h = d * (seq.h / seq.w);

  // The pool underneath, the sheet's circle over it, and a violet wash on top. The sheet's own
  // art is mottled red and blue, so without the wash Night Shade reads as a puddle of blood.
  ctx.globalAlpha = 0.62;
  ctx.fillStyle = '#120a20';
  ctx.beginPath();
  ctx.ellipse(sx, sy, d * 0.48, d * 0.48 * 0.62, 0, 0, Math.PI * 2);
  ctx.fill();

  ctx.globalAlpha = 0.5;
  ctx.drawImage(seq.canvas, frame * seq.w, 0, seq.w, seq.h,
    Math.round(sx - d / 2), Math.round(sy - h / 2), d, h);

  ctx.globalAlpha = 0.34;
  ctx.fillStyle = '#2a1848';
  ctx.beginPath();
  ctx.ellipse(sx, sy, d * 0.5, d * 0.5 * 0.62, 0, 0, Math.PI * 2);
  ctx.fill();
  ctx.globalAlpha = 1;

  // Motes lifting off it, seeded off the tick so they are not a static pattern.
  ctx.fillStyle = '#c8bcf0';
  for (let i = 0; i < 10; i++) {
    const s = (G.tick * 0.7 + i * 97) | 0;
    const ang = hash2(s, i) * Math.PI * 2;
    const rr = (0.35 + hash2(i, s) * 0.6) * d * 0.5;
    const rise = ((G.tick * 0.9 + i * 13) % 26);
    ctx.globalAlpha = 0.8 * (1 - rise / 26);
    ctx.fillRect(Math.round(sx + Math.cos(ang) * rr),
      Math.round(sy + Math.sin(ang) * rr * 0.6 - rise), 1, 2);
  }
  ctx.globalAlpha = 1;
}

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

      case FX.BOOM: drawBoom(f, sx, sy, k); break;
      case FX.DART: drawDart(f, sx, sy, k); break;
      case FX.FIREBURST: drawFireBurst(f, sx, sy, k); break;
      case FX.CRACK: drawCrack(f, sx, sy, k); break;
      case FX.BOLT: drawBolt(f, sx, sy, k); break;

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
/**
 * Hydro Pump's Tsunami: a wall of water rolling along the aim.
 *
 * Drawn by the ability rather than pushed as an effect because the crest MOVES -- it is a single
 * wall at one place per frame, not a trail of fading arcs, and pinning it where the cast started
 * would leave it behind.
 *
 * The sheet's cell is one section of crest standing on end: 72 across the thickness of the water
 * and 112 along its length. A wall is as long as `wallLen` asks, so the art is TILED along the
 * crest at its own size rather than stretched to fit -- the same reason the burst keeps its size,
 * and it keeps the pixels square at any length the level-ups and Area push it to. The step is
 * always under the cell's 112, so the tiles overlap slightly and the crest has no seams.
 */
function drawTsunami(ox, oy) {
  const a = activeVisual('tsunami');
  if (!a) return;
  const seq = getSequence('fx_tsunami');
  if (!seq) return;

  const len = a.resolved.wallLen;
  const sx = a.gx + ox, sy = a.gy + oy;
  if (sx < -len || sy < -len || sx > VW + len || sy > VH + len) return;

  // Tiles are spaced so the drawn crest spans exactly `len` -- the outer two sit half a cell in
  // from each end rather than centred on it, or the water would reach a stride further than the
  // hitbox at both ends and promise reach that is not there. One tile per cell length at most,
  // so the step never opens a seam.
  const n = Math.max(1, Math.ceil(len / seq.h));
  const span = Math.max(0, len - seq.h);
  const step = n > 1 ? span / (n - 1) : 0;
  const t = Math.max(0, a.def.travel - a.activeT);
  const base = (t * 16) | 0;

  ctx.save();
  ctx.translate(Math.round(sx), Math.round(sy));
  // The art already breaks to the right, so the heading IS the rotation -- no half turn.
  ctx.rotate(a.angle);
  ctx.globalAlpha = 0.92;
  for (let i = 0; i < n; i++) {
    // Neighbouring tiles run a frame apart so the crest churns along its length instead of
    // pulsing as one slab.
    const f = (base + i) % seq.frames;
    const u = -span / 2 + step * i;
    ctx.drawImage(seq.canvas, f * seq.w, 0, seq.w, seq.h,
      Math.round(-seq.w / 2), Math.round(u - seq.h / 2), seq.w, seq.h);
  }
  ctx.globalAlpha = 1;
  ctx.restore();
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

    if (z.kind === ZONE.FIRE) {
      drawFireRing(z, sx, sy, fade);
      continue;
    }

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
      // Amplitude grows with the tier but is normalised against the tier COUNT: this used to be
      // 0.08 * tier, which was a sane 0.24 across four tiers and a wobbling 0.72 across ten.
      const pulse = 1 + Math.sin(G.tick * 0.14 + o.x) * (0.05 + 0.07 * (o.tier / (TIER_COUNT - 1)));
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
/**
 * Floor traps, drawn with the zones and before every actor -- they are set into the ground and
 * the player walks over them, exactly like the stairs.
 *
 * `reveal` is eased toward 0 or 1 by the trap system as the player comes and goes, so a trap
 * fades up rather than popping into existence. Nothing is drawn at all below a threshold, which
 * keeps a floor full of unrevealed traps free.
 */
function drawTraps(ox, oy) {
  if (!trapSpr) return;
  for (const t of liveTraps()) {
    if (t.reveal < 0.02) continue;
    const sx = t.x + ox, sy = t.y + oy;
    if (sx < -32 || sy < -32 || sx > VW + 32 || sy > VH + 32) continue;
    const id = trapSpr[t.kind];
    if (id === undefined || id < 0) continue;
    ctx.globalAlpha = t.reveal;
    drawSprite(ctx, id, sx, sy);
    ctx.globalAlpha = 1;
  }
}

/**
 * The staircase, if one is on the field.
 *
 * Drawn with the zones and before every actor, because it is set INTO the floor: the player
 * walks over it, not behind it. There is only ever one, so it reads straight off G rather than
 * iterating a pool.
 *
 * The ring underneath pulses only while the player is standing on it, which is the same moment
 * the prompt appears -- so the tile itself confirms the prompt is about this thing and not about
 * something else on screen.
 */
function drawStairs(ox, oy) {
  const s = G.stairs;
  if (!s.active || stairsSpr < 0) return;
  const sx = s.x + ox, sy = s.y + oy;
  if (sx < -32 || sy < -32 || sx > VW + 32 || sy > VH + 32) return;

  if (s.near) {
    ctx.globalAlpha = 0.30 + Math.sin(G.clock * 7) * 0.16;
    ctx.strokeStyle = '#ffd166';
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.ellipse(sx, sy, 17, 10, 0, 0, Math.PI * 2);
    ctx.stroke();
    ctx.globalAlpha = 1;
  }
  drawSpriteScaled(ctx, stairsSpr, sx, sy, 1);
}

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
    if (e.legend) drawShadow(ctx, sx, sy, legendShadowScale());
    else drawShadow(ctx, sx, sy);
  }
  for (let i = 0; i < decoys.length; i++) {
    const d = decoys[i];
    if (d.alive) drawShadow(ctx, d.x + ox, d.y + oy);
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
    // A legendary is far bigger than the margin, so it is never culled here; it culls itself.
    if (!e.legend && (sx < -MARGIN || sy < -MARGIN || sx > VW + MARGIN || sy > VH + MARGIN)) continue;
    let b = ((sy + MARGIN) / BAND) | 0;
    if (b < 0) b = 0; else if (b >= NBANDS) b = NBANDS - 1;
    bandNext[i] = bandHead[b];
    bandHead[b] = i;
    visible++;
  }

  const p = G.player;
  const playerBand = p ? bandOf(p.y + oy) : -1;
  let playerDrawn = false;

  // The dolls go in the same bands, so one stands in front of or behind an enemy correctly.
  // Never more than three, so their bands are just recomputed here rather than linked in.
  let anyDoll = false;
  for (let k = 0; k < decoys.length; k++) {
    _dollBand[k] = decoys[k].alive ? bandOf(decoys[k].y + oy) : -1;
    if (_dollBand[k] >= 0) anyDoll = true;
  }

  for (let b = 0; b < NBANDS; b++) {
    for (let i = bandHead[b]; i !== -1; i = bandNext[i]) {
      drawEnemy(enemies[i], ox, oy);
    }
    if (anyDoll) for (let k = 0; k < decoys.length; k++) if (_dollBand[k] === b) drawDecoy(decoys[k], ox, oy);
    if (b === playerBand && !playerDrawn) { drawPlayer(p, ox, oy); playerDrawn = true; }
  }
  if (p && !playerDrawn) drawPlayer(p, ox, oy);
}

const bandOf = (sy) => Math.min(NBANDS - 1, Math.max(0, ((sy + MARGIN) / BAND) | 0));
const _dollBand = new Int32Array(decoys.length);

// substitute_sprite.png's five poses face down, down-left, left, up-left and up; the right-hand
// three are those mirrored. Indexed by PMD direction (0 = down, then clockwise).
const DOLL_COL = [0, 1, 2, 3, 4, 3, 2, 1];
const DOLL_FLIP = [false, true, true, true, false, false, false, false];
// Frame offsets into the sequence strip: idles, then the two death rows.
const DOLL_IDLE = 0, DOLL_DIE_A = 5, DOLL_DIE_B = 10;

/**
 * A Substitute doll: its idle pose for the way it faces, with a gentle bob, a bar while it is
 * hurt, and on death the two frames of its own facing from rows 2 and 4 of the sheet.
 */
function drawDecoy(d, ox, oy) {
  const seq = getSequence('substitute');
  const sx = Math.round(d.x + ox), sy = Math.round(d.y + oy);
  if (sx < -MARGIN || sy < -MARGIN || sx > VW + MARGIN || sy > VH + MARGIN) return;
  const col = DOLL_COL[d.dir], flip = DOLL_FLIP[d.dir];

  if (!seq) {
    // No sheet: a plain marker, so the doll is still visible and still makes sense.
    ctx.fillStyle = '#7fe08a';
    ctx.fillRect(sx - 5, sy - 12, 10, 12);
    return;
  }

  const dying = d.dyingT > 0;
  const frame = dying
    ? (d.dyingT > DECOY_DIE / 2 ? DOLL_DIE_A : DOLL_DIE_B) + col
    : DOLL_IDLE + col;
  // The cell's bottom row is the doll's feet, so it stands where its shadow is.
  const bob = dying ? 0 : Math.round(Math.sin(d.t * 3) * 1);
  const dx = sx - (seq.w >> 1), dy = sy - seq.h + 3 + bob;

  if (d.flash > 0) ctx.globalAlpha = 0.55;
  if (flip) {
    ctx.save();
    ctx.translate(sx * 2, 0);
    ctx.scale(-1, 1);
    ctx.drawImage(seq.canvas, frame * seq.w, 0, seq.w, seq.h, dx, dy, seq.w, seq.h);
    ctx.restore();
  } else {
    ctx.drawImage(seq.canvas, frame * seq.w, 0, seq.w, seq.h, dx, dy, seq.w, seq.h);
  }
  ctx.globalAlpha = 1;

  if (!dying && d.hp < d.maxHp) {
    const w = 16, y = dy - 3;
    ctx.fillStyle = '#101018';
    ctx.fillRect(sx - w / 2 - 1, y - 1, w + 2, 4);
    ctx.fillStyle = '#7fe08a';
    ctx.fillRect(sx - w / 2, y, w * Math.max(0, d.hp / d.maxHp), 2);
  }
}

/** Fallback if the enemy count ever exceeds the bucket arrays. Correct, just unsorted. */
function drawUnsorted(ox, oy) {
  for (let i = 0; i < enemies.length; i++) drawEnemy(enemies[i], ox, oy);
  for (let k = 0; k < decoys.length; k++) if (decoys[k].alive) drawDecoy(decoys[k], ox, oy);
  if (G.player) drawPlayer(G.player, ox, oy);
}

// How much bigger an elite is DRAWN. Must match the 1.35 its hitbox is widened by in
// spawnEnemy: an enemy that is struck from further away than it looks is the worst kind of
// unfair, and one with six times the health that looks identical to its neighbour is just
// confusing. Elites never actually spawned until this cycle, so nobody had seen either problem.
const ELITE_SCALE = 1.35;

function drawEnemy(e, ox, oy) {
  if (e.legend) { drawLegendBoss(e, ox, oy); return; }
  const sx = e.x + ox, sy = e.y + oy;
  if (sx < -MARGIN || sy < -MARGIN || sx > VW + MARGIN || sy > VH + MARGIN) return;
  // id = base + flash*(nf*nd) + frame*nd + dir. The flash variant is pre-baked white.
  const id = e.sprBase + (e.flash > 0 ? e.nf * e.nd : 0) + e.frame * e.nd + e.dir;

  // The ordinary case is the whole point of this branch: six hundred of these run every frame,
  // and touching ctx.globalAlpha even to set it back to 1 is a canvas state change per enemy.
  // Doing that unconditionally cost several milliseconds a frame, so the common path touches
  // no canvas state at all.
  if (e.spawnT <= 0 && !e.elite) {
    drawSprite(ctx, id, sx, sy);
  } else {
    const fade = e.spawnT > 0 ? 1 - e.spawnT / 0.18 : 1;
    if (e.elite) {
      // A slow gold pulse under the feet. Every enemy here is a PMD sheet, and a sheet carries
      // its own colours, so there is no recoloured elite variant to fall back on -- the ring and
      // the size are the whole of the tell. There are never more than a handful on the field, so
      // this one stroked path is affordable where one per enemy would not be.
      ctx.globalAlpha = fade * (0.5 + Math.sin(G.clock * 4) * 0.2);
      ctx.strokeStyle = '#ffd166';
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.ellipse(sx, sy + 2, e.r + 5, (e.r + 5) * 0.55, 0, 0, Math.PI * 2);
      ctx.stroke();
      ctx.globalAlpha = fade;
      drawSpriteScaled(ctx, id, sx, sy, ELITE_SCALE);
    } else {
      ctx.globalAlpha = fade;
      drawSprite(ctx, id, sx, sy);
    }
    ctx.globalAlpha = 1;
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
  drawPlayerStatus(p, sx, sy);
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

    // An enemy shot is a normal atlas blit, in a red palette nothing the player owns uses.
    // It was briefly two ctx.arc() fills instead, which cost 13ms a frame with a hundred shots
    // in the air -- paths in this loop are exactly what the drawn-UI rule exists to prevent.
    if (pr.hostile) {
      if (pr.look && drawLegendShot(pr, sx, sy)) continue;
      if (hostileSpr >= 0) drawSprite(ctx, hostileSpr, sx, sy);
      continue;
    }

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
