// L4 -- may import L0-L3, read-only.
//
// Poison's actors (moves/poison.js), drawn from Explorers of Sky's move effects: Acid Spray's
// globs and puddles, Clear Smog's bubble, Toxic's needle and doses, and the overloads' leavings.

import { ctx } from '../render.js';
import { getSequence } from '../assets.js';
import { drawShadow } from '../sprites.js';
import { blitSeq, ovc, TAU_E, registerDraws, vk, vr } from './gfx.js';
import { PK } from './poison.js';

// Toxic's needle is Pin Missile's, drawn in poison's purple when it has no overload of its own.
const VENOM = { id: 'tint:venom', colors: ['#6a2a90', '#c070e0', '#f0c8ff'] };

function drawGlob(a, sx, sy) {
  const seq = getSequence('fx_eos_acid');
  drawShadow(ctx, sx, sy + 1, 0.25);
  if (seq) blitSeq(seq, ((a.t * 20) | 0) % seq.frames, sx, sy - a.z - 4, 0.8, 0, 1, false, a.ov);
}

function drawAcid(a, sx, sy) {
  const seq = getSequence('fx_eos_acid');
  const fade = Math.min(1, a.t / 0.2, (a.life - a.t) / 0.5);
  const R = vr(a.r);
  ctx.globalAlpha = 0.32 * fade;
  ctx.fillStyle = ovc(a, 0, '#6ac040');
  ctx.beginPath(); ctx.ellipse(sx, sy, R, R * 0.5, 0, 0, TAU_E); ctx.fill();
  ctx.globalAlpha = 1;
  // Bubbles rising off the puddle, here and there.
  if (seq) for (let i = 0; i < 2; i++) {
    const ang = i * 2.6 + a.t * 0.5;
    blitSeq(seq, (((a.t * 14) | 0) + i * 4) % seq.frames, sx + Math.cos(ang) * R * 0.5, sy + Math.sin(ang) * R * 0.25 - 3, 0.6, 0, 0.85 * fade, false, a.ov);
  }
}

function drawSmog(a, sx, sy) {
  const seq = getSequence('fx_eos_smog');
  if (!seq) return;
  const fade = Math.min(1, a.t / 0.3, (a.life - a.t) / 0.4);
  // One drifting bubble, at its own size: its reach is wider than it looks, and that is on purpose.
  blitSeq(seq, ((a.t * 8) | 0) % seq.frames, sx, sy - 10 + Math.sin(a.t * 3) * 2, 1.2 * vk(a.r / 26), 0, 0.85 * fade, false, a.ov);
  const sm = getSequence('fx_eos_smoke');
  if (sm) blitSeq(sm, ((a.t * 6) | 0) % sm.frames, sx, sy - 2, 0.7, 0, 0.35 * fade, false, a.ov || SMOG);
}
const SMOG = { id: 'tint:smog', colors: ['#5a5a30', '#a0a070', '#e0e0c0'] };

function drawNeedle(a, sx, sy) {
  const seq = getSequence('fx_needle');
  if (seq) blitSeq(seq, 0, sx, sy, 0.32, a.a - Math.PI / 4, 1, false, a.ov || VENOM);
}

function drawToxic(a, sx, sy) {
  // The dose grows on its foe: a bubble that swells with every doubling.
  const seq = getSequence('fx_eos_acid');
  if (!seq) return;
  const k = Math.min(1, 0.4 + a.n * 0.12);
  blitSeq(seq, ((a.t * 12) | 0) % seq.frames, sx + 6, sy - 14, 0.5 + 0.4 * k, 0, 0.9, false, a.ov || VENOM);
}

function drawPuff(a, sx, sy) {
  const seq = getSequence('fx_eos_smoke');
  if (!seq) return;
  const fade = Math.min(1, (a.life - a.t) / 0.4);
  blitSeq(seq, ((a.t * 6) | 0) % seq.frames, sx, sy - 4, 0.55, 0, 0.55 * fade, false, a.ov || VENOM);
}

function drawDrop(a, sx, sy) {
  const seq = getSequence('fx_eos_goo');
  if (!seq) return;
  if (a.t < 0.35) { blitSeq(seq, 2, sx, sy - a.z - 4, 0.3, 0, 1, false, a.ov); return; }
  const fade = Math.min(1, (a.life - a.t) / 0.4);
  blitSeq(seq, 6, sx, sy - 2, 0.25, 0, 0.8 * fade, false, a.ov);
}

function drawWire(a, sx, sy, ox, oy) {
  ctx.strokeStyle = ovc(a, 1, '#b8a8c8');
  ctx.lineWidth = 1;
  ctx.globalAlpha = 0.85;
  ctx.beginPath();
  for (let i = 0; i + 3 < a.pts.length; i += 4) {
    ctx.moveTo(a.pts[i] + ox, a.pts[i + 1] + oy - 2);
    ctx.lineTo(a.pts[i + 2] + ox, a.pts[i + 3] + oy - 2);
  }
  ctx.stroke();
  ctx.globalAlpha = 1;
}

registerDraws({
  [PK.GLOB]: { fn: drawGlob },
  [PK.ACID]: { ground: true, fn: drawAcid },
  [PK.SMOG]: { fn: drawSmog },
  [PK.BREATH]: { fn: drawSmog },
  [PK.NEEDLE]: { fn: drawNeedle },
  [PK.TOXIC]: { fn: drawToxic },
  [PK.PUFF]: { fn: drawPuff },
  [PK.DROP]: { ground: true, fn: drawDrop },
  [PK.WIRE]: { ground: true, wide: true, fn: drawWire },
});
