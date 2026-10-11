// L4 -- may import L0-L3, read-only.
//
// Water's actors (moves/water.js): the Bubble and what Water's overloads leave in the world.

import { ctx } from '../render.js';
import { getSequence } from '../assets.js';
import { drawShadow } from '../sprites.js';
import { blitSeq, ovc, TAU_E, registerDraws, vk, vr } from './gfx.js';
import { WK } from './water.js';

function drawBubble(a, sx, sy) {
  const seq = getSequence('fx_rs_bubble');
  if (!seq) return;
  if (a.z0) {
    // Depth Charge: sunk, it shows only as a stir of rings on the ground.
    ctx.globalAlpha = 0.5 + Math.sin(a.t * 10) * 0.2;
    ctx.strokeStyle = ovc(a, 1, '#9adcff');
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.ellipse(sx, sy, 6 + Math.sin(a.t * 6) * 2, 3, 0, 0, TAU_E);
    ctx.stroke();
    ctx.globalAlpha = 1;
    return;
  }
  drawShadow(ctx, sx, sy + 2, 0.4);
  // Big enough to hold what it holds, and breathing a little.
  const full = a.held.length ? 1.25 + a.held.length * 0.25 : 1;
  const sc = 0.82 * vk(a.area) * Math.min(full, 1.5) * (1 + Math.sin(a.t * 7) * 0.04);
  blitSeq(seq, 0, sx, sy - a.z - 4, sc, 0, a.held.length ? 0.85 : 1, false, a.ov);
}

function drawUndertow(a, sx, sy) {
  if (a.t < a.k) return;
  const rad = a.z;
  ctx.globalAlpha = 0.7;
  ctx.strokeStyle = ovc(a, 0, '#5ab6ef');
  ctx.lineWidth = 3;
  ctx.beginPath(); ctx.ellipse(sx, sy, rad, rad * 0.6, 0, 0, TAU_E); ctx.stroke();
  ctx.strokeStyle = '#ffffff'; ctx.lineWidth = 1;
  ctx.beginPath(); ctx.ellipse(sx, sy, rad, rad * 0.6, 0, 0, TAU_E); ctx.stroke();
  ctx.globalAlpha = 1;
  const seq = getSequence('fx_caustic');
  if (!seq) return;
  for (let i = 0; i < 6; i++) {
    const ang = (i / 6) * TAU_E + a.t;
    blitSeq(seq, (((a.t * 12) | 0) + i) % seq.frames, sx + Math.cos(ang) * rad, sy + Math.sin(ang) * rad * 0.6, 0.8, 0, 0.8, false, a.ov);
  }
}

function drawRiptide(a, sx, sy) {
  const fade = Math.min(1, a.t / 0.2, (a.life - a.t) / 0.4);
  const seq = getSequence('fx_rs_whirl');
  for (let i = 0; i < 3; i++) {
    const r = a.r * (0.35 + 0.3 * i);
    ctx.globalAlpha = 0.5 * fade;
    ctx.strokeStyle = ovc(a, i === 1 ? 1 : 0, '#5ab6ef');
    ctx.lineWidth = 2;
    ctx.setLineDash([6, 5]);
    ctx.lineDashOffset = (i & 1 ? 1 : -1) * a.t * 30;
    ctx.beginPath(); ctx.ellipse(sx, sy, r, r * 0.6, 0, 0, TAU_E); ctx.stroke();
    ctx.setLineDash([]);
    if (seq) {
      const ang = a.t * (i & 1 ? -1.4 : 1.4) + i;
      blitSeq(seq, ((a.t * 10) | 0) % seq.frames, sx + Math.cos(ang) * r, sy + Math.sin(ang) * r * 0.6, 0.6, 0, fade, false, a.ov);
    }
  }
  ctx.globalAlpha = 1;
}

function drawPool(a, sx, sy) {
  const fade = Math.min(1, a.t / 0.2, (a.life - a.t) / 0.5);
  ctx.globalAlpha = 0.35 * fade;
  ctx.fillStyle = ovc(a, 0, '#4aa8e8');
  ctx.beginPath(); ctx.ellipse(sx, sy, vr(a.r), vr(a.r) * 0.55, 0, 0, TAU_E); ctx.fill();
  ctx.globalAlpha = 0.6 * fade;
  ctx.strokeStyle = ovc(a, 2, '#bfe9ff');
  ctx.lineWidth = 1;
  const k = (a.t * 0.8) % 1;
  ctx.beginPath(); ctx.ellipse(sx, sy, vr(a.r) * k, vr(a.r) * 0.55 * k, 0, 0, TAU_E); ctx.stroke();
  ctx.globalAlpha = 1;
}

function drawPuddle(a, sx, sy) {
  const fade = Math.min(1, a.t / 0.15, (a.life - a.t) / 0.5);
  ctx.globalAlpha = 0.4 * fade;
  ctx.fillStyle = ovc(a, 0, '#3a8fd0');
  ctx.beginPath(); ctx.ellipse(sx, sy, vr(a.r), vr(a.r) * 0.5, 0, 0, TAU_E); ctx.fill();
  ctx.globalAlpha = 0.8 * fade;
  ctx.fillStyle = '#e8f8ff';
  ctx.fillRect(Math.round(sx - a.r * 0.4), Math.round(sy - 1), 3, 1);
  ctx.globalAlpha = 1;
}

function drawFish(a, sx, sy) {
  const seq = getSequence('fx_fish');
  if (!seq) return;
  drawShadow(ctx, sx, sy + 2, 0.35);
  blitSeq(seq, 0, sx, sy - a.z - 3, 0.6, Math.sin(a.t * 20) * 0.6, 1, false, a.ov);
}

registerDraws({
  [WK.BUBBLE]: { fn: drawBubble },
  [WK.UNDERTOW]: { ground: true, fn: drawUndertow },
  [WK.RIPTIDE]: { ground: true, fn: drawRiptide },
  [WK.POOL]: { ground: true, fn: drawPool },
  [WK.PUDDLE]: { ground: true, fn: drawPuddle },
  [WK.FISH]: { fn: drawFish },
});

