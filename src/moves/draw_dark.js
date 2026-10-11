// L4 -- may import L0-L3, read-only.
//
// Dark's actors (moves/dark.js), drawn from Explorers of Sky's move effects: Sucker Punch's fist,
// Torment's grin, Feint Attack's shadow, and what Dark's overloads leave in the world.

import { ctx } from '../render.js';
import { getSequence } from '../assets.js';
import { blitSeq, ovc, TAU_E, registerDraws, vk, vr } from './gfx.js';
import { DKK } from './dark.js';

// The fist and the shadow are ripped white and black: un-overloaded, they are drawn in dark's violet.
const DUSK = { id: 'tint:dusk', colors: ['#2a1a40', '#6a4aa0', '#d0b0ff'] };

function drawFist(a, sx, sy) {
  const seq = getSequence('fx_eos_fist');
  if (!seq) return;
  // Out of nowhere: it lunges in over the last fraction of a second.
  const k = Math.min(1, a.t / a.life);
  blitSeq(seq, ((a.t * 30) | 0) % seq.frames, sx - (1 - k) * 14, sy - 8, (a.fixed ? 0.9 : 0.65) * (0.6 + 0.4 * k), 0, 0.5 + 0.5 * k, false, a.ov || DUSK);
}

function drawTorment(a, sx, sy) {
  const grin = getSequence('fx_eos_grin');
  const fade = Math.min(1, a.t / 0.3, (a.life - a.t) / 0.4);
  // A faint dark aura round the tormented foe, breathing, and the grin above it.
  const R = vr(a.r) * (0.9 + Math.sin(a.t * 5) * 0.08);
  ctx.globalAlpha = 0.18 * fade;
  ctx.fillStyle = ovc(a, 0, '#3a1a5a');
  ctx.beginPath(); ctx.ellipse(sx, sy, R, R * 0.55, 0, 0, TAU_E); ctx.fill();
  ctx.globalAlpha = 0.5 * fade;
  ctx.strokeStyle = ovc(a, 1, '#8a5ac0');
  ctx.lineWidth = 1;
  ctx.beginPath(); ctx.ellipse(sx, sy, R, R * 0.55, 0, 0, TAU_E); ctx.stroke();
  ctx.globalAlpha = 1;
  if (grin) blitSeq(grin, 6 + (((a.t * 10) | 0) % 8), sx, sy - 28, 0.8, 0, fade, false, a.ov);
}

function drawShade(a, sx, sy) {
  const seq = getSequence('fx_eos_shade');
  if (!seq) return;
  const k = Math.min(1, a.t / a.life);
  blitSeq(seq, Math.min(seq.frames - 1, (k * 7) | 0), sx, sy + 3, 0.4, 0, 0.85, true, a.ov);
}

function drawWound(a, sx, sy) {
  ctx.fillStyle = ovc(a, 0, '#6a1a3a');
  ctx.globalAlpha = 0.85;
  ctx.fillRect(Math.round(sx) + 3, Math.round(sy) - 10, 2, 4);
  if (((a.t * 4) | 0) & 1) ctx.fillRect(Math.round(sx) + 3, Math.round(sy) - 5, 1, 2);
  ctx.globalAlpha = 1;
}

function drawCres(a, sx, sy) {
  const seq = getSequence('fx_eos_crescent');
  if (seq) blitSeq(seq, ((a.t * 16) | 0) % seq.frames, sx, sy, 0.35, a.a, 1, false, a.ov || DUSK);
}

function drawRing(a, sx, sy) {
  const k = a.t / a.life;
  ctx.globalAlpha = 0.7 * (1 - k);
  ctx.strokeStyle = ovc(a, 0, '#4a3a66');
  ctx.lineWidth = 3;
  ctx.beginPath(); ctx.ellipse(sx, sy, a.k * k, a.k * k * 0.6, 0, 0, TAU_E); ctx.stroke();
  ctx.globalAlpha = 1;
}

function drawOrbit(a, sx, sy) {
  const seq = getSequence('fx_eos_grin');
  if (seq) blitSeq(seq, 8, sx, sy - 6, 0.45, 0, 0.9, false, a.ov);
}

registerDraws({
  [DKK.FIST]: { fn: drawFist },
  [DKK.TORMENT]: { fn: drawTorment },
  [DKK.SHADE]: { fn: drawShade },
  [DKK.WOUND]: { fn: drawWound },
  [DKK.CRES]: { fn: drawCres },
  [DKK.RING]: { ground: true, fn: drawRing },
  [DKK.ORBIT]: { fn: drawOrbit },
});
