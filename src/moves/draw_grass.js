// L4 -- may import L0-L3, read-only.
//
// Grass's actors (moves/grass.js): Leech Seed's seeds and sprouts, Solar Beam's sun and beam,
// Grass Knot's vines, Wood Hammer's log, and what Grass's overloads leave in the world.

import { ctx } from '../render.js';
import { getSequence } from '../assets.js';
import { drawShadow } from '../sprites.js';
import { blitSeq, ovc, TAU_E, registerDraws, vk, vr } from './gfx.js';
import { GRK } from './grass.js';

function drawSeed(a, sx, sy) {
  const seq = getSequence('fx_seeds');
  drawShadow(ctx, sx, sy + 1, 0.2);
  if (seq) blitSeq(seq, 0, sx, sy - a.z - 3, 0.8, a.t * 10, 1, false, a.ov);
}

function drawLeech(a, sx, sy) {
  // The sprout grows on its host over the first second, frame by frame.
  const seq = getSequence('fx_sprout');
  if (!seq) return;
  const f = Math.min(seq.frames - 1, (a.t * 3) | 0);
  blitSeq(seq, f, sx + 4, sy - 2, 0.55, 0, 0.95, true, a.ov);
}

function drawSprout(a, sx, sy) {
  const seq = getSequence('fx_sprout');
  if (!seq) return;
  const fade = Math.min(1, (a.life - a.t) / 0.4);
  blitSeq(seq, Math.min(seq.frames - 1, (a.t * 4) | 0), sx, sy + 1, 0.8, 0, fade, true, a.ov);
}

function drawSun(a, sx, sy) {
  const seq = getSequence('fx_sun');
  if (!seq) return;
  // The sun swells over you as the light gathers.
  const k = Math.min(1, a.t / a.life);
  blitSeq(seq, 0, sx, sy - 34, (0.35 + 0.45 * k) * (1 + Math.sin(a.t * 30) * 0.04), a.t * 2, 0.6 + 0.4 * k, false, a.ov);
  ctx.globalAlpha = 0.25 * k;
  ctx.fillStyle = ovc(a, 1, '#fff6a0');
  ctx.beginPath(); ctx.ellipse(sx, sy, 16 + 10 * k, 8 + 5 * k, 0, 0, TAU_E); ctx.fill();
  ctx.globalAlpha = 1;
}

function drawBeam(a, sx, sy) {
  const seq = getSequence('fx_solar_beam');
  const orb = getSequence('fx_solar');
  const fade = Math.min(1, a.t / 0.06, (a.life - a.t) / 0.12);
  const ux = Math.cos(a.a), uy = Math.sin(a.a);
  const y0 = sy - 6;
  // The beam's reach is its area; its width is drawn at the strip's own width, a glow beneath.
  ctx.globalAlpha = 0.45 * fade;
  ctx.strokeStyle = ovc(a, 0, '#fff0a0');
  ctx.lineWidth = Math.min(a.r * 2, 30);
  ctx.lineCap = 'round';
  ctx.beginPath(); ctx.moveTo(sx, y0); ctx.lineTo(sx + ux * a.k, y0 + uy * a.k); ctx.stroke();
  ctx.lineCap = 'butt';
  ctx.globalAlpha = 1;
  if (seq) {
    // The strip laid end to end along the line, turned to it.
    const step = seq.h * 0.9;
    for (let d = 0; d < a.k; d += step) {
      blitSeq(seq, 0, sx + ux * (d + step / 2), y0 + uy * (d + step / 2), 1, a.a + Math.PI / 2, fade, false, a.ov);
    }
  }
  if (orb) blitSeq(orb, ((a.t * 12) | 0) % orb.frames, sx + ux * 8, y0 + uy * 8, 0.9, 0, fade, false, a.ov);
}

function drawFlare(a, sx, sy) {
  const seq = getSequence('fx_sun');
  const k = a.t / a.life;
  ctx.globalAlpha = 0.3 + 0.4 * k;
  ctx.strokeStyle = ovc(a, 1, '#fff6a0');
  ctx.lineWidth = 1;
  ctx.beginPath(); ctx.ellipse(sx, sy, vr(a.r), vr(a.r) * 0.55, 0, 0, TAU_E); ctx.stroke();
  ctx.globalAlpha = 1;
  if (seq) blitSeq(seq, 0, sx, sy - a.z - 6, 0.7, a.t * 4, 1, false, a.ov);
}

function drawKnot(a, sx, sy) {
  const seq = getSequence('fx_vine');
  if (!seq) return;
  // The vine curls up out of the ground and loops round the foe's feet.
  const f = Math.min(seq.frames - 1, (a.t * 14) | 0);
  const fade = Math.min(1, (a.life - a.t) / 0.15);
  blitSeq(seq, f, sx, sy + 3, 0.6, 0, fade, true, a.ov);
}

function drawThorn(a, sx, sy) {
  // A bed of thorny roots creeping up out of the ground (Explorers of Sky's Ingrain roots).
  const seq = getSequence('fx_eos_roots');
  if (!seq) return;
  const fade = Math.min(1, (a.life - a.t) / 0.4);
  blitSeq(seq, Math.min(seq.frames - 1, (a.t * 14) | 0), sx, sy + 3, 0.5, 0, fade, true, a.ov);
}

function drawLog(a, sx, sy) {
  // Explorers of Sky's log: upright as it drops, then laid along its roll and turning.
  const seq = getSequence('fx_eos_log');
  if (!seq) return;
  if (a.z > 2) drawShadow(ctx, sx, sy + 1, 0.6);
  const rolling = a.phase === 1;
  const rot = rolling ? a.a + Math.PI / 2 + ((a.idx || 0) * 0.02) % 0.3 - 0.15 : 0;
  blitSeq(seq, 0, sx, sy - a.z - (rolling ? 6 : 14), 1.1 * vk(a.area), rot, 1, false, a.ov);
}

function drawSapling(a, sx, sy) {
  const seq = getSequence('fx_sprout');
  if (!seq) return;
  const fade = Math.min(1, a.t / 0.3, (a.life - a.t) / 0.4);
  drawShadow(ctx, sx, sy + 1, 0.5);
  blitSeq(seq, seq.frames - 1, sx, sy + 1, 1.2, 0, fade, true, a.ov);
}

function drawRazor(a, sx, sy) {
  const seq = getSequence('fx_rs_leaf');
  if (seq) blitSeq(seq, ((a.t * 16) | 0) % seq.frames, sx, sy, 1, a.a, 1, false, a.ov);
}

function drawStake(a, sx, sy) {
  const seq = getSequence('fx_leafarrow');
  const fade = Math.min(1, (a.life - a.t) / 0.4);
  ctx.globalAlpha = 0.3 * fade;
  ctx.strokeStyle = ovc(a, 1, '#7fe08a');
  ctx.lineWidth = 1;
  ctx.beginPath(); ctx.ellipse(sx, sy, vr(a.r), vr(a.r) * 0.55, 0, 0, TAU_E); ctx.stroke();
  ctx.globalAlpha = 1;
  // Stuck slanting into the ground.
  if (seq) blitSeq(seq, 0, sx, sy - 5, 0.7, -1.1, fade, false, a.ov);
}

function drawBud(a, sx, sy) {
  const seq = getSequence('fx_sprout');
  if (!seq) return;
  const k = a.t / a.life;
  blitSeq(seq, Math.min(seq.frames - 1, (k * seq.frames) | 0), sx - 5, sy - 6, 0.45 + 0.15 * k, 0, 1, true, a.ov);
}

function drawBloom(a, sx, sy) {
  const seq = getSequence('fx_seeds');
  if (seq) blitSeq(seq, 0, sx, sy - a.z - 2, 0.55, a.t * 8, 1, false, a.ov);
}

function drawPollen(a, sx, sy) {
  const seq = getSequence('fx_puff');
  const fade = Math.min(1, a.t / 0.2, (a.life - a.t) / 0.5);
  if (!seq) return;
  for (let i = 0; i < 4; i++) {
    const ang = a.t * 0.8 + i * 1.57;
    blitSeq(seq, i % seq.frames, sx + Math.cos(ang) * a.r * 0.45, sy - 4 + Math.sin(ang) * a.r * 0.25, 0.9, 0, 0.55 * fade, false, a.ov || POLLEN);
  }
}
const POLLEN = { id: 'tint:pollen', colors: ['#c8a020', '#fff0a0', '#ffffff'] };

function drawShade(a, sx, sy) {
  const fade = Math.min(1, (a.life - a.t) / 0.5);
  ctx.globalAlpha = 0.35 * fade;
  ctx.fillStyle = ovc(a, 0, '#2a2038');
  ctx.beginPath(); ctx.ellipse(sx, sy, vr(a.r), vr(a.r) * 0.4, a.a, 0, TAU_E); ctx.fill();
  ctx.globalAlpha = 1;
}

function drawWisp(a, sx, sy) {
  // The risen ghost (Explorers of Sky's ghost face), bobbing as it hunts.
  const seq = getSequence('fx_eos_ghost');
  if (!seq) return;
  const fade = Math.min(1, a.t / 0.2, (a.life - a.t) / 0.3);
  const f = 6 + (((a.t * 10) | 0) % (seq.frames - 6));
  blitSeq(seq, f, sx, sy - 10 + Math.sin(a.t * 6) * 2, 0.45, 0, 0.9 * fade, false, a.ov);
}

function drawVine(a, sx, sy, ox, oy) {
  const k = 1 - a.t / a.life;
  ctx.globalAlpha = 0.9 * k;
  ctx.strokeStyle = ovc(a, 0, '#4a8a20');
  ctx.lineWidth = 2;
  const x0 = a.ox + ox, y0 = a.oy + oy, x1 = a.tx + ox, y1 = a.ty + oy;
  const mx = (x0 + x1) / 2, my = (y0 + y1) / 2 - 8;
  ctx.beginPath(); ctx.moveTo(x0, y0); ctx.quadraticCurveTo(mx, my, x1, y1); ctx.stroke();
  ctx.strokeStyle = '#a0e070';
  ctx.lineWidth = 1;
  ctx.beginPath(); ctx.moveTo(x0, y0 - 1); ctx.quadraticCurveTo(mx, my - 1, x1, y1 - 1); ctx.stroke();
  ctx.globalAlpha = 1;
}

registerDraws({
  [GRK.SEED]: { fn: drawSeed },
  [GRK.LEECH]: { fn: drawLeech },
  [GRK.SPROUT]: { fn: drawSprout },
  [GRK.SUN]: { fn: drawSun },
  [GRK.BEAM]: { wide: true, fn: drawBeam },
  [GRK.FLARE]: { fn: drawFlare },
  [GRK.KNOT]: { fn: drawKnot },
  [GRK.THORN]: { ground: true, fn: drawThorn },
  [GRK.LOG]: { fn: drawLog },
  [GRK.SAPLING]: { fn: drawSapling },
  [GRK.RAZOR]: { fn: drawRazor },
  [GRK.STAKE]: { fn: drawStake },
  [GRK.BUD]: { fn: drawBud },
  [GRK.BLOOM]: { fn: drawBloom },
  [GRK.POLLEN]: { fn: drawPollen },
  [GRK.SHADE]: { ground: true, fn: drawShade },
  [GRK.WISP]: { fn: drawWisp },
  [GRK.VINE]: { wide: true, fn: drawVine },
});
