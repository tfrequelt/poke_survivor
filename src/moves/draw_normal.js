// L4 -- may import L0-L3, read-only.
//
// Normal's actors (moves/normal.js): Swift's stars, Pay Day's coins, the Tri Attack triangle,
// Hyper Voice's rings, and what Normal's overloads leave in the world.

import { G } from '../state.js';
import { ctx } from '../render.js';
import { getSequence } from '../assets.js';
import { drawShadow, drawSpriteScaled } from '../sprites.js';
import { coinSprite } from '../pickups.js';
import { blitSeq, ovc, TAU_E, registerDraws, vk, vr } from './gfx.js';
import { NK } from './normal.js';

function drawStar(a, sx, sy) {
  const seq = getSequence('fx_rs_star');
  if (!seq) return;
  if (a.z > 2) drawShadow(ctx, sx, sy + 1, 0.25);
  // Hanging, the star twinkles; converging, it spins.
  const tw = a.phase === 1 ? 1 + Math.sin(a.t * 40) * 0.15 : 1;
  blitSeq(seq, 0, sx, sy - a.z - 4, 1.7 * vk(a.area) * tw, a.t * 9, 1, false, a.ov);
  if (a.crit) {
    ctx.fillStyle = '#ffd166';
    ctx.fillRect(Math.round(sx) - 1, Math.round(sy - a.z - 9), 2, 2);
  }
}

function drawWell(a, sx, sy) {
  const seq = getSequence('fx_rs_star');
  const fade = Math.min(1, a.t / 0.2, (a.life - a.t) / 0.3);
  ctx.globalAlpha = 0.3 * fade;
  ctx.fillStyle = ovc(a, 0, '#ffe9a0');
  ctx.beginPath(); ctx.ellipse(sx, sy, vr(a.r), vr(a.r) * 0.55, 0, 0, TAU_E); ctx.fill();
  ctx.globalAlpha = 1;
  if (!seq) return;
  // Stars spiralling in to the middle.
  for (let i = 0; i < 6; i++) {
    const k = ((a.t * 0.8) + i / 6) % 1;
    const ang = a.t * 5 + i * 1.05;
    const rr = a.r * (1 - k);
    blitSeq(seq, 0, sx + Math.cos(ang) * rr, sy + Math.sin(ang) * rr * 0.55 - 3, 1.2, ang, fade * (0.4 + k * 0.6), false, a.ov);
  }
}

function drawGuard(a, sx, sy) {
  const seq = getSequence('fx_rs_star');
  if (seq) blitSeq(seq, 0, sx, sy, 1.5, a.t * 6, 0.9, false, a.ov);
}

/** The ground's own gold coin, spinning edge-on and back (squeezed sideways about its centre). */
function spinCoin(x, y, t, k = 1) {
  const sq = Math.max(0.2, Math.abs(Math.cos(t)));
  ctx.save();
  ctx.translate(Math.round(x), Math.round(y));
  ctx.scale(sq, 1);
  drawSpriteScaled(ctx, coinSprite(), 0, 0, k);
  ctx.restore();
}

function drawCoin(a, sx, sy) {
  drawShadow(ctx, sx, sy + 1, 0.2);
  const y = sy - (a.z || 0) - 2;
  spinCoin(sx, y, a.t * 14);
  if (a.crit && ((a.t * 12) | 0) & 1) {
    ctx.fillStyle = '#ffffff';
    ctx.fillRect(Math.round(sx) + 2, Math.round(y) - 4, 1, 1);
  }
}

function drawCarpet(a, sx, sy) {
  const fade = Math.min(1, (a.life - a.t) / 0.3);
  ctx.globalAlpha = fade;
  for (let i = 0; i < 3; i++) spinCoin(sx + Math.cos(i * 2.1) * 6, sy + Math.sin(i * 2.1) * 3, a.t * 8 + i, 0.8);
  ctx.globalAlpha = 1;
}

const TRI_COL = ['#ff5a3a', '#7ac8ff', '#f8e038'];

function drawTri(a, sx, sy) {
  const seq = getSequence('fx_tri');
  const fade = Math.min(1, (a.life - a.t) / 0.25);
  const R = a.r * (0.4 + 0.6 * a.z);
  // The triangle's reach is its corners; the sprite turns with them at its own size.
  if (seq) blitSeq(seq, 0, sx, sy - 4, 0.9 * vk(a.area) * (0.5 + 0.5 * a.z), a.a, fade, false, a.ov);
  ctx.globalAlpha = 0.7 * fade;
  ctx.strokeStyle = ovc(a, 2, '#ffffff');
  ctx.lineWidth = 1;
  ctx.beginPath();
  for (let i = 0; i <= 3; i++) {
    const ang = a.a + (i / 3) * TAU_E;
    const x = sx + Math.cos(ang) * R, y = sy + Math.sin(ang) * R * 0.8;
    if (i === 0) ctx.moveTo(x, y); else ctx.lineTo(x, y);
  }
  ctx.stroke();
  // The corners in their elements' colours.
  for (let i = 0; i < 3; i++) {
    const ang = a.a + (i / 3) * TAU_E;
    const x = sx + Math.cos(ang) * R, y = sy + Math.sin(ang) * R * 0.8;
    ctx.globalAlpha = fade;
    ctx.fillStyle = TRI_COL[i];
    ctx.beginPath(); ctx.arc(x, y, 3, 0, TAU_E); ctx.fill();
    ctx.fillStyle = '#ffffff';
    ctx.fillRect(Math.round(x) - 1, Math.round(y) - 1, 1, 1);
  }
  // Prism's beams, fading.
  if (a.pts.length) {
    const k = 1 - (G.clock - a.step) / 0.25;
    if (k > 0) {
      ctx.lineWidth = 3;
      for (let i = 0; i + 2 < a.pts.length; i += 3) {
        const ox = sx - a.x, oy = sy - a.y;
        ctx.globalAlpha = k;
        ctx.strokeStyle = TRI_COL[(i / 3) % 3];
        ctx.beginPath();
        ctx.moveTo(a.pts[i] + ox, a.pts[i + 1] + oy);
        ctx.lineTo(a.pts[i] + ox + Math.cos(a.pts[i + 2]) * 120, a.pts[i + 1] + oy + Math.sin(a.pts[i + 2]) * 120);
        ctx.stroke();
      }
    }
  }
  ctx.globalAlpha = 1;
}

function drawRing(a, sx, sy) {
  if (a.t < 0) return;
  const k = a.t / a.life;
  const fade = 1 - k;
  const r = a.r;
  if (a.n) {
    // Round: the whole ring, from Beat Up's rings.
    const seq = getSequence('fx_beatup');
    if (seq) blitSeq(seq, Math.min(seq.frames - 1, (k * seq.frames) | 0), sx, sy - 4, Math.min(1.6, (r * 2) / 64), 0, fade, false, a.ov);
    return;
  }
  ctx.globalAlpha = 0.8 * fade;
  ctx.strokeStyle = ovc(a, 0, '#ffffff');
  ctx.lineWidth = 2;
  ctx.beginPath(); ctx.ellipse(sx, sy - 4, r, r * 0.7, 0, a.a - a.z, a.a + a.z); ctx.stroke();
  ctx.strokeStyle = ovc(a, 1, '#c8d0e0');
  ctx.lineWidth = 1;
  ctx.beginPath(); ctx.ellipse(sx, sy - 4, r - 4, (r - 4) * 0.7, 0, a.a - a.z * 0.8, a.a + a.z * 0.8); ctx.stroke();
  ctx.globalAlpha = 1;
  // Notes riding the front.
  const notes = getSequence('fx_notes');
  if (!notes) return;
  for (let i = -1; i <= 1; i++) {
    const ang = a.a + i * a.z * 0.7;
    blitSeq(notes, (i + 1) % notes.frames, sx + Math.cos(ang) * r, sy - 4 + Math.sin(ang) * r * 0.7, 1, 0, fade, false, a.ov);
  }
}

function drawPerish(a, sx, sy) {
  const n = Math.max(1, Math.ceil(a.life - a.t));
  ctx.font = 'bold 9px monospace';
  ctx.textAlign = 'center';
  ctx.fillStyle = '#1a0a2a';
  ctx.fillText(String(n), Math.round(sx) + 1, Math.round(sy) + 1);
  ctx.fillStyle = ovc(a, 2, '#c49aff');
  ctx.fillText(String(n), Math.round(sx), Math.round(sy));
  ctx.textAlign = 'left';
  const notes = getSequence('fx_notes');
  if (notes) blitSeq(notes, 2, sx + 7, sy - 6 + Math.sin(a.t * 6) * 1.5, 0.8, 0, 0.8, false, a.ov);
}

function drawScratch(a, sx, sy) {
  const seq = getSequence('fx_rs_claws');
  if (!seq) return;
  const fade = Math.min(1, (a.life - a.t) / 0.4);
  blitSeq(seq, 1, sx, sy - 4, 0.6, a.a, 0.8 * fade, false, a.ov);
}

function drawCrack(a, sx, sy) {
  const k = a.t / a.life;
  ctx.globalAlpha = 0.5 + k * 0.4;
  ctx.strokeStyle = ovc(a, 0, '#3a3028');
  ctx.lineWidth = 1;
  const ux = Math.cos(a.a + Math.PI / 2), uy = Math.sin(a.a + Math.PI / 2);
  ctx.beginPath();
  ctx.moveTo(sx - ux * 7, sy - uy * 4);
  ctx.lineTo(sx - ux * 2 + 2, sy - uy + 1);
  ctx.lineTo(sx + ux * 3 - 1, sy + uy * 2);
  ctx.lineTo(sx + ux * 7, sy + uy * 4);
  ctx.stroke();
  if (k > 0.6) {
    ctx.fillStyle = ovc(a, 2, '#fff0c0');
    ctx.fillRect(Math.round(sx) - 1, Math.round(sy) - 1, 2, 2);
  }
  ctx.globalAlpha = 1;
}

function drawLeap(a, sx, sy) {
  const seq = getSequence('fx_rs_orb');
  if (seq) blitSeq(seq, ((a.t * 16) | 0) % seq.frames, sx, sy - 10, 1.2, 0, 0.7, false, a.ov);
}

registerDraws({
  [NK.STAR]: { fn: drawStar },
  [NK.WELL]: { ground: true, fn: drawWell },
  [NK.GUARD]: { fn: drawGuard },
  [NK.COIN]: { fn: drawCoin },
  [NK.CARPET]: { ground: true, fn: drawCarpet },
  [NK.TRI]: { fn: drawTri },
  [NK.RING]: { fn: drawRing },
  [NK.PERISH]: { fn: drawPerish },
  [NK.SCRATCH]: { fn: drawScratch },
  [NK.CRACK]: { ground: true, fn: drawCrack },
  [NK.LEAP]: { fn: drawLeap },
});
