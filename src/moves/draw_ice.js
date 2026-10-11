// L4 -- may import L0-L3, read-only.
//
// Ice's actors (moves/ice.js), drawn from Explorers of Sky's move effects: Avalanche's wall of
// snow, and what Ice's overloads leave in the world.

import { ctx } from '../render.js';
import { getSequence } from '../assets.js';
import { blitSeq, ovc, TAU_E, registerDraws, vk, vr } from './gfx.js';
import { IK } from './ice.js';

function drawWall(a, sx, sy) {
  const seq = getSequence('fx_eos_snowball');
  if (!seq) return;
  // A rolling bank of snowballs across the wall's length, each churning on its own beat.
  const ux = Math.cos(a.a + Math.PI / 2), uy = Math.sin(a.a + Math.PI / 2);
  const n = Math.max(3, Math.round(a.k / 20));
  const fade = Math.min(1, a.t / 0.2, (a.life - a.t) / 0.3);
  for (let i = 0; i < n; i++) {
    const u = (i / (n - 1) - 0.5) * a.k;
    const f = (((a.t * 14) | 0) + i * 2) % seq.frames;
    blitSeq(seq, f, sx + ux * u, sy + uy * u - 6 - (i & 1) * 3, 0.6, 0, fade, false, a.ov);
  }
}

function drawSheet(a, sx, sy) {
  const fade = Math.min(1, (a.life - a.t) / 0.5);
  const ux = Math.cos(a.a + Math.PI / 2), uy = Math.sin(a.a + Math.PI / 2);
  ctx.globalAlpha = 0.3 * fade;
  ctx.strokeStyle = ovc(a, 1, '#bfe9ff');
  ctx.lineWidth = 3;
  ctx.beginPath(); ctx.moveTo(sx - ux * a.k / 2, sy - uy * a.k / 2); ctx.lineTo(sx + ux * a.k / 2, sy + uy * a.k / 2); ctx.stroke();
  ctx.globalAlpha = 1;
}

function drawDrift(a, sx, sy) {
  const seq = getSequence('fx_eos_snow');
  const fade = Math.min(1, a.t / 0.2, (a.life - a.t) / 0.4);
  ctx.globalAlpha = 0.35 * fade;
  ctx.fillStyle = ovc(a, 2, '#eaffff');
  ctx.beginPath(); ctx.ellipse(sx, sy, vr(a.r), vr(a.r) * 0.5, 0, 0, TAU_E); ctx.fill();
  ctx.globalAlpha = 1;
  if (seq) blitSeq(seq, ((a.t * 8) | 0) % seq.frames, sx, sy - 4, 0.6, 0, 0.8 * fade, false, a.ov);
}

function drawPillar(a, sx, sy) {
  const seq = getSequence('fx_eos_icecrystal');
  if (!seq) return;
  const k = Math.min(1, a.t / 0.2);
  // The crystal, grown up out of the ground and holding.
  blitSeq(seq, Math.min(3, (k * 3) | 0), sx, sy + 2, 0.7, 0, Math.min(1, (a.life - a.t) / 0.3), true, a.ov);
}

function drawFrost(a, sx, sy) {
  const seq = getSequence('fx_eos_snow');
  const fade = Math.min(1, a.t / 0.2, (a.life - a.t) / 0.5);
  ctx.globalAlpha = 0.28 * fade;
  ctx.fillStyle = ovc(a, 1, '#bfe9ff');
  ctx.beginPath(); ctx.ellipse(sx, sy, vr(a.r), vr(a.r) * 0.5, 0, 0, TAU_E); ctx.fill();
  ctx.globalAlpha = 1;
  if (seq) blitSeq(seq, 2 + (((a.t * 6) | 0) % 4), sx, sy - 3, 0.7, 0, 0.7 * fade, false, a.ov);
}

function drawNova(a, sx, sy) {
  const seq = getSequence('fx_eos_icering');
  if (!seq) return;
  const k = a.t / a.life;
  blitSeq(seq, Math.min(seq.frames - 1, (k * seq.frames) | 0), sx, sy - 4, Math.min(1.4, (a.r * 2) / 64), 0, 1 - k * 0.4, false, a.ov);
}

function drawBall(a, sx, sy) {
  const seq = getSequence('fx_eos_snowball');
  if (seq) blitSeq(seq, ((a.t * 16) | 0) % seq.frames, sx, sy, 0.3, 0, 1, false, a.ov);
}

function drawBridge(a, sx, sy, ox, oy) {
  const fade = Math.min(1, (a.life - a.t) / 0.4);
  ctx.globalAlpha = 0.8 * fade;
  ctx.strokeStyle = ovc(a, 1, '#bfe9ff');
  ctx.lineWidth = 2;
  ctx.beginPath(); ctx.moveTo(a.ox + ox, a.oy + oy - 4); ctx.lineTo(a.tx + ox, a.ty + oy - 4); ctx.stroke();
  ctx.strokeStyle = '#ffffff';
  ctx.lineWidth = 1;
  ctx.beginPath(); ctx.moveTo(a.ox + ox, a.oy + oy - 5); ctx.lineTo(a.tx + ox, a.ty + oy - 5); ctx.stroke();
  ctx.globalAlpha = 1;
}

function drawShard(a, sx, sy) {
  const seq = getSequence('fx_eos_icicle');
  if (seq) blitSeq(seq, 0, sx, sy, 1, a.a + Math.PI / 2, 1, false, a.ov);
}

registerDraws({
  [IK.WALL]: { wide: true, fn: drawWall },
  [IK.SHEET]: { ground: true, wide: true, fn: drawSheet },
  [IK.DRIFT]: { ground: true, fn: drawDrift },
  [IK.PILLAR]: { fn: drawPillar },
  [IK.FROST]: { ground: true, fn: drawFrost },
  [IK.NOVA]: { ground: true, fn: drawNova },
  [IK.BALL]: { fn: drawBall },
  [IK.BRIDGE]: { ground: true, wide: true, fn: drawBridge },
  [IK.SHARD]: { fn: drawShard },
});
