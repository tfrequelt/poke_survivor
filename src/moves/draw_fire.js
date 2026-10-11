// L4 -- may import L0-L3, read-only.
//
// Fire's actors (moves/fire.js), drawn from Explorers of Sky's move effects: embers and the fires
// they kindle, Eruption's volcano and bombs, and what Fire's overloads leave in the world.

import { ctx } from '../render.js';
import { getSequence } from '../assets.js';
import { drawShadow } from '../sprites.js';
import { blitSeq, ovc, TAU_E, registerDraws, vk, vr } from './gfx.js';
import { FRK } from './fire.js';

function drawEmber(a, sx, sy) {
  const seq = getSequence('fx_eos_ember');
  if (!seq) return;
  if (a.z > 2) drawShadow(ctx, sx, sy + 1, 0.2);
  blitSeq(seq, ((a.t * 16) | 0) % seq.frames, sx, sy - a.z - 4, a.fixed ? 1.3 : 1, 0, 1, false, a.ov);
}

function drawFire(a, sx, sy) {
  const seq = getSequence('fx_eos_flame');
  if (!seq) return;
  const fade = Math.min(1, a.t / 0.15, (a.life - a.t) / 0.4);
  // A small flame licking up off the ground, each on its own beat.
  blitSeq(seq, (((a.t * 12) | 0) + a.idx) % seq.frames, sx, sy + 3, 0.7 * vk(a.r / 10), 0, fade, true, a.ov);
}

function drawVolcano(a, sx, sy) {
  const seq = getSequence('fx_eos_column');
  if (!seq) return;
  const fade = Math.min(1, (a.life - a.t) / 0.25);
  // The column of the eruption, played through once over the spew.
  const f = Math.min(seq.frames - 1, ((a.t / a.life) * seq.frames) | 0);
  blitSeq(seq, f, sx, sy + 2, 0.45, 0, 0.9 * fade, true, a.ov);
}

function drawBomb(a, sx, sy) {
  const seq = getSequence('fx_eos_lavabomb');
  drawShadow(ctx, sx, sy + 1, 0.3);
  if (seq) blitSeq(seq, 0, sx, sy - a.z - 4, 0.45, a.t * 8, 1, false, a.ov);
}

function drawPool(a, sx, sy) {
  const seq = getSequence('fx_eos_smallflame');
  const fade = Math.min(1, a.t / 0.2, (a.life - a.t) / 0.5);
  const R = vr(a.r);
  ctx.globalAlpha = 0.3 * fade;
  ctx.fillStyle = ovc(a, 0, '#c04010');
  ctx.beginPath(); ctx.ellipse(sx, sy, R, R * 0.5, 0, 0, TAU_E); ctx.fill();
  ctx.globalAlpha = 1;
  if (seq) blitSeq(seq, ((a.t * 12) | 0) % seq.frames, sx, sy + 2, 0.5, 0, 0.85 * fade, true, a.ov);
}

function drawRing(a, sx, sy) {
  const seq = getSequence('fx_eos_firering');
  if (!seq) return;
  const k = a.t / a.life;
  blitSeq(seq, Math.min(seq.frames - 1, (k * seq.frames) | 0), sx, sy - 4, Math.min(1.5, (a.r * 2) / 80), 0, 1 - k * 0.5, false, a.ov);
}

function drawRock(a, sx, sy) {
  const seq = getSequence('fx_eos_ember');
  if (seq) blitSeq(seq, ((a.t * 16) | 0) % seq.frames, sx, sy - a.z - 3, 0.8, 0, 1, false, a.ov);
}

function drawCinder(a, sx, sy) {
  ctx.fillStyle = ovc(a, 2, '#ffd870');
  ctx.fillRect(Math.round(sx) - 1, Math.round(sy) - 1, 2, 2);
  ctx.fillStyle = ovc(a, 0, '#ff7a1a');
  ctx.fillRect(Math.round(sx) - 2, Math.round(sy), 1, 1);
}

function drawAsh(a, sx, sy) {
  const seq = getSequence('fx_eos_smoke');
  if (!seq) return;
  const fade = Math.min(1, a.t / 0.3, (a.life - a.t) / 0.5);
  for (let i = 0; i < 5; i++) {
    const ang = a.t * 0.6 + i * 1.26, R = vr(a.r) * 0.7;
    blitSeq(seq, (i + ((a.t * 5) | 0)) % seq.frames, sx + Math.cos(ang) * R, sy + Math.sin(ang) * R * 0.5 - 6, 0.9, 0, 0.5 * fade, false, a.ov);
  }
}

registerDraws({
  [FRK.EMBER]: { fn: drawEmber },
  [FRK.FIRE]: { fn: drawFire },
  [FRK.VOLCANO]: { fn: drawVolcano },
  [FRK.BOMB]: { fn: drawBomb },
  [FRK.POOL]: { ground: true, fn: drawPool },
  [FRK.RING]: { ground: true, fn: drawRing },
  [FRK.ROCK]: { fn: drawRock },
  [FRK.CINDER]: { fn: drawCinder },
  [FRK.ASH]: { fn: drawAsh },
});
