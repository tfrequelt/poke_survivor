// L4 -- may import L0-L3, read-only.
//
// Ground's actors (moves/ground.js): Earth Power's spires, Dig's burrowing mound, and what Ground's
// overloads leave on the floor.

import { G } from '../state.js';
import { ctx } from '../render.js';
import { getSequence } from '../assets.js';
import { drawShadow, drawSprite } from '../sprites.js';
import { blitSeq, ovc, TAU_E, registerDraws, vk, vr } from './gfx.js';
import { GK } from './ground.js';

function drawSpire(a, sx, sy) {
  const seq = getSequence('fx_quake');
  if (!seq) return;
  // Up out of the ground and back down: the strip's rise, then the same frames in reverse.
  const k = a.t / a.life;
  const n = seq.frames;
  const f = k < 0.5 ? (k / 0.5 * n) | 0 : ((1 - k) / 0.5 * n) | 0;
  blitSeq(seq, f, sx, sy + 4, 0.42 * vk(a.area), 0, 1, true, a.ov);
}

function drawVent(a, sx, sy) {
  const fade = Math.min(1, (a.life - a.t) / 0.4);
  ctx.globalAlpha = (0.6 + Math.sin(a.t * 14) * 0.25) * fade;
  ctx.fillStyle = ovc(a, 0, '#ff7a1a');
  ctx.beginPath(); ctx.ellipse(sx, sy, 5, 2, 0, 0, TAU_E); ctx.fill();
  ctx.fillStyle = '#ffd870';
  ctx.fillRect(Math.round(sx) - 1, Math.round(sy) - 1, 2, 1);
  ctx.globalAlpha = 1;
}

function drawLava(a, sx, sy) {
  drawShadow(ctx, sx, sy + 1, 0.25);
  ctx.fillStyle = ovc(a, 0, '#ff7a1a');
  ctx.fillRect(Math.round(sx) - 2, Math.round(sy - a.z) - 2, 4, 4);
  ctx.fillStyle = '#ffd870';
  ctx.fillRect(Math.round(sx) - 1, Math.round(sy - a.z) - 1, 2, 2);
}

function drawMole(a, sx, sy) {
  if (a.phase === 9) return;
  // A mound of earth churning along under the surface: the dirt clods of the misc sheet, heaving.
  const seq = getSequence('fx_dirt');
  if (!seq) return;
  blitSeq(seq, 2 + (((a.t * 12) | 0) & 1), sx, sy + 2 + Math.sin(a.t * 30) * 0.8, 1, 0, 1, true, a.ov);
}

function drawHole(a, sx, sy) {
  const fade = Math.min(1, (a.life - a.t) / 0.5);
  ctx.globalAlpha = 0.6 * fade;
  ctx.fillStyle = '#1a1008';
  ctx.beginPath(); ctx.ellipse(sx, sy, 7, 3.5, 0, 0, TAU_E); ctx.fill();
  ctx.strokeStyle = ovc(a, 1, '#a08868');
  ctx.lineWidth = 1;
  ctx.beginPath(); ctx.ellipse(sx, sy, 8, 4, 0, 0, TAU_E); ctx.stroke();
  ctx.globalAlpha = 1;
}

function drawSlide(a, sx, sy, ox, oy) {
  const fade = Math.min(1, (a.life - a.t) / 0.4);
  ctx.globalAlpha = 0.5 * fade;
  ctx.strokeStyle = ovc(a, 0, '#8a6030');
  ctx.lineWidth = a.r * 1.2;
  ctx.lineCap = 'round';
  ctx.beginPath(); ctx.moveTo(a.ox + ox, a.oy + oy); ctx.lineTo(sx, sy); ctx.stroke();
  ctx.lineCap = 'butt';
  ctx.globalAlpha = 1;
  const seq = getSequence('fx_rs_mud');
  if (seq) blitSeq(seq, 0, sx, sy, 0.45, 0, fade, false, a.ov);
}

function drawWall(a, sx, sy) {
  const seq = getSequence('fx_rs_mud');
  if (!seq) return;
  const fade = Math.min(1, a.t / 0.15, (a.life - a.t) / 0.4);
  const ux = Math.cos(a.a), uy = Math.sin(a.a);
  const n = Math.max(2, Math.round(a.k / 14));
  for (let i = 0; i < n; i++) {
    const u = (i / (n - 1) - 0.5) * a.k;
    blitSeq(seq, 0, sx + ux * u, sy + uy * u - 4, 0.3, 0, fade, false, a.ov);
  }
}

function drawGolem(a, sx, sy) {
  const seq = getSequence('fx_rs_mud');
  if (!seq) return;
  const fade = Math.min(1, a.t / 0.3, (a.life - a.t) / 0.4);
  const slam = Math.max(0, 1 - (G.clock - a.step) / 0.2);
  drawShadow(ctx, sx, sy + 2, 0.9);
  // A lump of mud standing up: two piles stacked, bobbing as it lumbers, squashed as it slams.
  const bob = Math.abs(Math.sin(a.t * 6)) * 2;
  blitSeq(seq, 0, sx, sy - 4, 0.45 + slam * 0.1, 0, fade, false, a.ov);
  blitSeq(seq, 0, sx, sy - 12 - bob + slam * 4, 0.32, 0, fade, false, a.ov);
  ctx.globalAlpha = fade;
  ctx.fillStyle = '#ffe070';
  ctx.fillRect(Math.round(sx) - 3, Math.round(sy - 14 - bob + slam * 4), 1, 1);
  ctx.fillRect(Math.round(sx) + 2, Math.round(sy - 14 - bob + slam * 4), 1, 1);
  ctx.globalAlpha = 1;
}

function drawGeode(a, sx, sy) {
  const seq = getSequence('fx_gem');
  const fade = Math.min(1, a.t / 0.2, (a.life - a.t) / 0.4);
  const pulse = 0.5 + Math.sin(a.t * 12) * 0.5;
  ctx.globalAlpha = 0.25 * pulse * fade;
  ctx.fillStyle = ovc(a, 2, '#c8a0ff');
  ctx.beginPath(); ctx.ellipse(sx, sy, vr(a.r), vr(a.r) * 0.55, 0, 0, TAU_E); ctx.fill();
  ctx.globalAlpha = 1;
  if (seq) blitSeq(seq, 0, sx, sy - 6, 0.6, 0, fade, false, a.ov);
}

function drawPit(a, sx, sy) {
  const fade = Math.min(1, a.t / 0.2, (a.life - a.t) / 0.4);
  ctx.globalAlpha = 0.55 * fade;
  ctx.fillStyle = ovc(a, 0, '#c49a5e');
  ctx.beginPath(); ctx.ellipse(sx, sy, vr(a.r), vr(a.r) * 0.55, 0, 0, TAU_E); ctx.fill();
  ctx.fillStyle = '#3a2410';
  ctx.beginPath(); ctx.ellipse(sx, sy, vr(a.r) * 0.4, vr(a.r) * 0.22, 0, 0, TAU_E); ctx.fill();
  ctx.strokeStyle = ovc(a, 2, '#f0d8a0');
  ctx.lineWidth = 1;
  for (let i = 0; i < 2; i++) {
    const k = ((a.t * 0.9) + i * 0.5) % 1;
    ctx.beginPath(); ctx.ellipse(sx, sy, vr(a.r) * (1 - k), vr(a.r) * 0.55 * (1 - k), 0, 0, TAU_E); ctx.stroke();
  }
  ctx.globalAlpha = 1;
}

function drawMirage(a, sx, sy) {
  if (a.spr < 0) return;
  ctx.globalAlpha = 0.35 + Math.sin(a.t * 8) * 0.1;
  drawSprite(ctx, a.spr, sx + Math.round(Math.sin(a.t * 5) * 1.5), sy);
  ctx.globalAlpha = 1;
}

function drawRubble(a, sx, sy) {
  const seq = getSequence('fx_ancient');
  if (!seq) return;
  const fade = Math.min(1, (a.life - a.t) / 0.4);
  blitSeq(seq, a.idx % seq.frames, sx, sy - 3, 0.9, 0, fade, false, a.ov);
}

function drawCollapse(a, sx, sy, ox, oy) {
  const fade = Math.min(1, (a.life - a.t) / 0.3);
  ctx.globalAlpha = 0.6 * fade;
  ctx.strokeStyle = ovc(a, 0, '#4a3420');
  ctx.lineWidth = 4;
  ctx.beginPath();
  for (let i = 0; i + 1 < a.pts.length; i += 2) {
    const x = a.pts[i] + ox, y = a.pts[i + 1] + oy;
    if (i === 0) ctx.moveTo(x, y); else ctx.lineTo(x, y);
  }
  ctx.stroke();
  ctx.globalAlpha = 1;
}

registerDraws({
  [GK.SPIRE]: { fn: drawSpire },
  [GK.VENT]: { ground: true, fn: drawVent },
  [GK.LAVA]: { fn: drawLava },
  [GK.MOLE]: { ground: true, fn: drawMole },
  [GK.HOLE]: { ground: true, fn: drawHole },
  [GK.SLIDE]: { ground: true, wide: true, fn: drawSlide },
  [GK.WALL]: { fn: drawWall },
  [GK.GOLEM]: { fn: drawGolem },
  [GK.GEODE]: { ground: true, fn: drawGeode },
  [GK.PIT]: { ground: true, fn: drawPit },
  [GK.MIRAGE]: { fn: drawMirage },
  [GK.RUBBLE]: { fn: drawRubble },
  [GK.COLLAPSE]: { ground: true, wide: true, fn: drawCollapse },
});
