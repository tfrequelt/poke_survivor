// L4 -- may import L0-L3, read-only.
//
// Flying's actors (moves/flying.js): Whirlwind's blast, Feather Dance's feathers, Drill Peck's
// drill, Tailwind's streams, and what Flying's overloads leave in the world.

import { ctx } from '../render.js';
import { getSequence } from '../assets.js';
import { drawShadow } from '../sprites.js';
import { blitSeq, ovc, TAU_E, registerDraws, vk, vr } from './gfx.js';
import { FK } from './flying.js';

function drawGust(a, sx, sy) {
  if (a.t >= a.k) return;
  const swirl = getSequence('fx_swirl'), gust = getSequence('fx_rs_gust');
  const k = a.t / a.k;
  const fade = 1 - k * 0.6;
  if (swirl) blitSeq(swirl, 0, sx, sy - 6, 0.8 * vk(a.area), a.a + (Math.cos(a.a) < 0 ? Math.PI : 0), fade, false, a.ov);
  if (gust) {
    const ux = Math.cos(a.a + Math.PI / 2), uy = Math.sin(a.a + Math.PI / 2);
    for (const s of [-1, 1]) blitSeq(gust, ((a.t * 12) | 0) % gust.frames, sx + ux * s * 10, sy + uy * s * 6 - 6, 0.9, a.a, fade, false, a.ov);
  }
}

function drawWall(a, sx, sy) {
  const gust = getSequence('fx_rs_gust');
  if (!gust) return;
  const fade = Math.min(1, a.t / 0.2, (a.life - a.t) / 0.3);
  const W = a.r * 2.2, ux = Math.cos(a.a + Math.PI / 2), uy = Math.sin(a.a + Math.PI / 2);
  for (let i = -2; i <= 2; i++) {
    blitSeq(gust, (((a.t * 12) | 0) + i + 3) % gust.frames, sx + ux * i * W * 0.4, sy + uy * i * W * 0.4 - 6, 1, a.a, 0.8 * fade, false, a.ov);
  }
}

function drawFeather(a, sx, sy) {
  const seq = getSequence('fx_feather');
  if (!seq) return;
  const fade = a.done ? Math.max(0, 1 - (a.t - (a.life - 0.4)) / 0.4) : 1;
  if (a.z > 2) drawShadow(ctx, sx, sy + 1, 0.2);
  // Swaying down, side to side.
  blitSeq(seq, 0, sx + Math.sin(a.a) * 6, sy - a.z - 3, 0.5, Math.sin(a.a) * 0.6, fade, false, a.ov);
}

function drawWhirl(a, sx, sy) {
  const seq = getSequence('fx_feather');
  if (!seq) return;
  const fade = Math.min(1, a.t / 0.2, (a.life - a.t) / 0.3);
  for (let i = 0; i < a.n; i++) {
    const ang = a.t * 3 + (i / a.n) * TAU_E;
    blitSeq(seq, 0, sx + Math.cos(ang) * a.r, sy + Math.sin(ang) * a.r * 0.8 - 4, 0.45, ang + Math.PI / 2, fade, false, a.ov);
  }
}

function drawDrill(a, sx, sy) {
  const seq = getSequence('fx_drill');
  if (!seq) return;
  const y = sy - 4 - a.z;
  if (a.z > 2) drawShadow(ctx, sx, sy + 1, 0.3);
  // Sky Attack's glow, and Aeroblast's wide wind round it.
  if (a.fixed || a.done) {
    ctx.globalAlpha = 0.35;
    ctx.fillStyle = ovc(a, 1, a.fixed ? '#fff6c0' : '#e0f0ff');
    ctx.beginPath(); ctx.ellipse(sx, y, a.done ? vr(a.r) : 10, a.done ? vr(a.r) * 0.6 : 7, a.a, 0, TAU_E); ctx.fill();
    ctx.globalAlpha = 1;
  }
  // Spin rings trailing off the bit.
  ctx.strokeStyle = ovc(a, 2, '#f0f6ff');
  ctx.lineWidth = 1;
  const ux = Math.cos(a.a), uy = Math.sin(a.a);
  for (let i = 1; i <= 2; i++) {
    const k = ((a.t * 6) + i * 0.5) % 1;
    ctx.globalAlpha = 0.7 * (1 - k);
    ctx.beginPath();
    ctx.ellipse(sx - ux * (6 + k * 14), y - uy * (6 + k * 14), 2 + k * 3, 4 + k * 4, a.a, 0, TAU_E);
    ctx.stroke();
  }
  ctx.globalAlpha = 1;
  blitSeq(seq, 0, sx, y, 0.9 * vk(a.area), a.a, 1, false, a.ov);
}

function drawShard(a, sx, sy) {
  ctx.fillStyle = ovc(a, 2, '#d0d8e0');
  ctx.save();
  ctx.translate(Math.round(sx), Math.round(sy));
  ctx.rotate(a.a);
  ctx.fillRect(-3, -1, 6, 2);
  ctx.restore();
}

function drawDive(a, sx, sy) {
  const seq = getSequence('fx_wings');
  const k = a.t / a.life;
  ctx.globalAlpha = 0.3 + 0.4 * k;
  ctx.strokeStyle = ovc(a, 1, '#f0f6ff');
  ctx.lineWidth = 1;
  ctx.beginPath(); ctx.ellipse(sx, sy, vr(a.r) * (1.2 - 0.3 * k), vr(a.r) * 0.55 * (1.2 - 0.3 * k), 0, 0, TAU_E); ctx.stroke();
  ctx.globalAlpha = 1;
  if (seq) blitSeq(seq, 0, sx, sy - a.z - 10, 0.45, Math.PI, 1, false, a.ov);
}

function drawStream(a, sx, sy) {
  const seq = getSequence('fx_rs_gust');
  if (!seq) return;
  const fade = Math.min(1, (a.life - a.t) / 0.3);
  blitSeq(seq, ((a.t * 10) | 0) % seq.frames, sx, sy - 4, 0.9, a.a, 0.85 * fade, false, a.ov);
}

function drawEye(a, sx, sy) {
  const seq = getSequence('fx_rs_gust');
  const fade = Math.min(1, a.t / 0.15, (a.life - a.t) / 0.3);
  ctx.globalAlpha = 0.4 * fade;
  ctx.strokeStyle = ovc(a, 0, '#f0f6ff');
  ctx.lineWidth = 2;
  ctx.beginPath(); ctx.ellipse(sx, sy, vr(a.r), vr(a.r) * 0.6, 0, 0, TAU_E); ctx.stroke();
  ctx.globalAlpha = 1;
  if (!seq) return;
  for (let i = 0; i < 6; i++) {
    const ang = a.t * 7 + i * 1.05;
    blitSeq(seq, i % seq.frames, sx + Math.cos(ang) * a.r, sy + Math.sin(ang) * a.r * 0.6 - 4, 0.8, ang + Math.PI / 2, fade, false, a.ov);
  }
}

function drawNeedle(a, sx, sy) {
  const seq = getSequence('fx_needle');
  if (!seq) return;
  drawShadow(ctx, sx, sy + 1, 0.15);
  // Point down: the strip runs top-left to bottom-right, so a quarter turn stands it upright.
  blitSeq(seq, 0, sx, sy - a.z - 6, 0.45, Math.PI / 4, 1, false, a.ov);
}

function drawQuill(a, sx, sy) {
  const seq = getSequence('fx_needle');
  if (!seq) return;
  const fade = Math.min(1, (a.life - a.t) / 0.5);
  blitSeq(seq, 0, sx, sy - 1, 0.32, a.a, 0.85 * fade, false, a.ov);
}

function drawMolt(a, sx, sy) {
  const seq = getSequence('fx_feather');
  if (!seq) return;
  const fade = Math.min(1, (a.life - a.t) / 0.6);
  blitSeq(seq, 0, sx, sy - 2 + Math.sin(a.t * 4) * 1, 0.4, a.a, fade, false, a.ov);
}

registerDraws({
  [FK.GUST]: { fn: drawGust },
  [FK.WALL]: { fn: drawWall },
  [FK.FEATHER]: { fn: drawFeather },
  [FK.WHIRL]: { fn: drawWhirl },
  [FK.DRILL]: { fn: drawDrill },
  [FK.SHARD]: { fn: drawShard },
  [FK.DIVE]: { fn: drawDive },
  [FK.STREAM]: { fn: drawStream },
  [FK.EYE]: { fn: drawEye },
  [FK.NEEDLE]: { fn: drawNeedle },
  [FK.QUILL]: { ground: true, fn: drawQuill },
  [FK.MOLT]: { ground: true, fn: drawMolt },
});
