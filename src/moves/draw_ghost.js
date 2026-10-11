// L4 -- may import L0-L3, read-only.
//
// Ghost's actors (moves/ghost.js), drawn from Explorers of Sky's move effects: Poltergeist's
// rocks, Mean Look's eye, Curse's face, and what Ghost's overloads leave in the world.

import { ctx } from '../render.js';
import { getSequence } from '../assets.js';
import { drawShadow } from '../sprites.js';
import { blitSeq, ovc, TAU_E, registerDraws, vk, vr } from './gfx.js';
import { HK } from './ghost.js';

function drawRock(a, sx, sy) {
  const seq = getSequence('fx_eos_rock');
  if (!seq) return;
  drawShadow(ctx, sx, sy + 2, 0.5);
  // Tumbling slowly as it hovers, fast once it is thrown; a ghostly shiver under it.
  const f = (a.idx + ((a.t * (a.phase ? 30 : 8)) | 0)) % seq.frames;
  const shiver = a.phase ? 0 : Math.sin(a.t * 40) * 0.8;
  blitSeq(seq, f, sx + shiver, sy - a.z - 6, 0.55 * vk(a.area), 0, 1, false, a.ov);
}

function drawGaze(a, sx, sy) {
  const seq = getSequence('fx_eos_eye');
  const open = Math.min(1, a.t / 0.3);
  const fade = Math.min(1, (a.life - a.t) / 0.3);
  // The gaze on the floor: a faint ring (its drawing capped like every area), then the eye over it.
  ctx.globalAlpha = 0.35 * fade;
  ctx.strokeStyle = ovc(a, 1, '#c49aff');
  ctx.lineWidth = 1;
  ctx.beginPath(); ctx.ellipse(sx, sy, vr(a.r) * open, vr(a.r) * 0.55 * open, 0, 0, TAU_E); ctx.stroke();
  ctx.globalAlpha = 1;
  if (!seq) return;
  const f = ((a.t * 9) | 0) % seq.frames;
  blitSeq(seq, f, sx, sy - 34, 1.1 + 0.05 * Math.min(6, a.n || 0), 0, fade, false, a.ov);
}

function drawCurse(a, sx, sy) {
  const seq = getSequence('fx_eos_ghost');
  if (!seq) return;
  // The face rises over its victim and stays, leering.
  const f = Math.min(seq.frames - 1, (a.t * 14) | 0);
  const fade = Math.min(1, (a.life - a.t) / 0.3);
  blitSeq(seq, f < seq.frames - 1 ? f : 6 + (((a.t * 8) | 0) % (seq.frames - 6)), sx, sy - 26, 0.5, 0, 0.9 * fade, false, a.ov);
}

function drawCflame(a, sx, sy) {
  const seq = getSequence('fx_eos_hexfire');
  if (seq) blitSeq(seq, ((a.t * 12) | 0) % seq.frames, sx, sy + 2, 1, 0, 0.85, true, a.ov);
}

function drawThrown(a, sx, sy) {
  const seq = getSequence('fx_eos_wisp');
  if (seq) blitSeq(seq, ((a.t * 14) | 0) % seq.frames, sx, sy - 10, 0.7, 0, 0.8, false, a.ov);
}

function drawRing(a, sx, sy) {
  const seq = getSequence('fx_eos_vortex');
  // A ring of shadow breathing out and in -- the ring IS the attack, so it is drawn at its reach.
  ctx.globalAlpha = 0.5;
  ctx.strokeStyle = ovc(a, 0, '#6a4aa0');
  ctx.lineWidth = 3;
  ctx.beginPath(); ctx.ellipse(sx, sy, a.r, a.r * 0.6, 0, 0, TAU_E); ctx.stroke();
  ctx.globalAlpha = 1;
  if (!seq) return;
  for (let i = 0; i < 6; i++) {
    const ang = a.t * 2 + i * 1.05;
    blitSeq(seq, (((a.t * 12) | 0) + i * 3) % seq.frames, sx + Math.cos(ang) * a.r, sy + Math.sin(ang) * a.r * 0.6, 0.35, 0, 0.8, false, a.ov);
  }
}

function drawFall(a, sx, sy) {
  const seq = getSequence('fx_eos_shadoworb');
  const k = a.t / a.life;
  ctx.globalAlpha = 0.3 + 0.4 * k;
  ctx.strokeStyle = ovc(a, 1, '#c49aff');
  ctx.lineWidth = 1;
  ctx.beginPath(); ctx.ellipse(sx, sy, vr(a.r) * (1.2 - 0.3 * k), vr(a.r) * 0.55 * (1.2 - 0.3 * k), 0, 0, TAU_E); ctx.stroke();
  ctx.globalAlpha = 1;
  if (seq) blitSeq(seq, ((a.t * 16) | 0) % seq.frames, sx, sy - a.z - 8, 1.3, 0, 1, false, a.ov);
}

function drawOrb(a, sx, sy) {
  const seq = getSequence('fx_eos_shadoworb');
  if (seq) blitSeq(seq, ((a.t * 16) | 0) % seq.frames, sx, sy - 6, 0.6, 0, 1, false, a.ov);
}

function drawHole(a, sx, sy) {
  const seq = getSequence('fx_eos_blackhole');
  if (!seq) return;
  const k = a.t / a.life;
  // The hole opens, holds and closes over the strip's own frames.
  const f = k < 0.2 ? (k / 0.2 * 8) | 0 : k > 0.8 ? 26 + ((k - 0.8) / 0.2 * 8) | 0 : 8 + (((a.t * 16) | 0) % 18);
  blitSeq(seq, f, sx, sy - 6, 0.7 * vk(a.area), 0, 0.9, false, a.ov);
}

registerDraws({
  [HK.ROCK]: { fn: drawRock },
  [HK.THROWN]: { fn: drawThrown },
  [HK.GAZE]: { fn: drawGaze },
  [HK.CURSE]: { fn: drawCurse },
  [HK.CFLAME]: { fn: drawCflame },
  [HK.RING]: { ground: true, fn: drawRing },
  [HK.FALL]: { fn: drawFall },
  [HK.ORB]: { fn: drawOrb },
  [HK.HOLE]: { ground: true, fn: drawHole },
});
