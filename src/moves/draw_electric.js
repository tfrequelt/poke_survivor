// L4 -- may import L0-L3, read-only.
//
// Electric's actors (moves/electric.js): Electroweb's nets, Electric Terrain's tiles, and what
// Electric's overloads leave in the world -- arcs, ball lightning, sparks and a thundercloud.

import { ctx } from '../render.js';
import { getSequence } from '../assets.js';
import { drawShadow } from '../sprites.js';
import { blitSeq, ovc, TAU_E, registerDraws, vk, vr } from './gfx.js';
import { EK } from './electric.js';

// The web and the ball are ripped grey and blue: un-overloaded, they are drawn in this yellow.
const YELLOW = { id: 'tint:electric', colors: ['#c8a010', '#f8e038', '#fffad0'] };
const pal = (a) => a.ov || YELLOW;

function drawWeb(a, sx, sy) {
  const seq = getSequence('fx_web');
  if (!seq) return;
  if (a.phase === 0) {
    drawShadow(ctx, sx, sy + 1, 0.3);
    blitSeq(seq, 0, sx, sy - a.z - 4, 0.45, a.t * 12, 1, false, pal(a));
    return;
  }
  const open = Math.min(1, a.t / 0.15);
  const fade = Math.min(1, (a.life - a.t) / 0.3);
  // The net shows its reach -- it is the area -- but never past 1.75x its strip.
  const sc = Math.min((a.r * 2 * (0.3 + 0.7 * open)) / seq.w, 1.75 * vk(a.area));
  const flick = 0.75 + Math.sin(a.t * 30) * 0.1;
  // The current in the mesh: a glow under the strands, which stay white.
  ctx.globalAlpha = 0.22 * fade * flick;
  ctx.fillStyle = ovc(a, 1, '#f8e038');
  ctx.beginPath(); ctx.ellipse(sx, sy - 2, vr(a.r) * (0.3 + 0.7 * open), vr(a.r) * 0.6 * (0.3 + 0.7 * open), 0, 0, TAU_E); ctx.fill();
  ctx.globalAlpha = 1;
  blitSeq(seq, 0, sx, sy - 2, sc, 0, flick * fade, false, pal(a));
}

function drawTrap(a, sx, sy) {
  const seq = getSequence('fx_web');
  if (!seq) return;
  blitSeq(seq, 0, sx, sy - 1, 0.4, 0, 0.45 + Math.sin(a.t * 5) * 0.15, false, pal(a));
}

function drawCling(a, sx, sy) {
  const seq = getSequence('fx_web');
  if (seq) blitSeq(seq, 0, sx, sy - 6, 0.55, Math.sin(a.t * 4) * 0.3, 0.85, false, pal(a));
}

function drawGrid(a, sx, sy) {
  const n = a.n, T = a.r, h = (n * T) / 2;
  const fade = Math.min(1, a.t / 0.2, (a.life - a.t) / 0.3);
  const panel = getSequence('fx_panel_y');
  ctx.lineWidth = 1;
  for (let r = 0; r < n; r++) {
    for (let c = 0; c < n; c++) {
      const v = a.pts[r * n + c];
      // Each tile drawn at most 16px across, centred on its cell: the grid's reach stays the
      // cells', but the floor shows a pattern of small plates rather than one big lit slab.
      const S = Math.min(T - 2, 16), m = (T - S) / 2;
      const x = Math.round(sx - h + c * T + m - 1), y = Math.round(sy - h + r * T + m - 1);
      if (v < 0) {
        // Short Fuse: a blown tile, scorched.
        ctx.globalAlpha = 0.35 * fade;
        ctx.fillStyle = '#2a2418';
        ctx.fillRect(x + 1, y + 1, S, S);
        continue;
      }
      if (v & 1) {
        ctx.globalAlpha = 0.3 * fade;
        ctx.fillStyle = ovc(a, 1, '#f8e038');
        ctx.fillRect(x + 1, y + 1, S, S);
        ctx.globalAlpha = 0.9 * fade;
        ctx.strokeStyle = ovc(a, 2, '#fffad0');
        ctx.strokeRect(x + 1.5, y + 1.5, S - 1, S - 1);
        // A panel of light standing up off the lit tile.
        if (panel) blitSeq(panel, (a.step + r + c) % panel.frames, x + S / 2 + 1, y + S, 0.26, 0, 0.8 * fade, true, a.ov);
      } else {
        ctx.globalAlpha = 0.3 * fade;
        ctx.strokeStyle = ovc(a, 0, '#c8a010');
        ctx.strokeRect(x + 1.5, y + 1.5, S - 1, S - 1);
      }
    }
  }
  ctx.globalAlpha = 1;
}

function drawBall(a, sx, sy) {
  const seq = getSequence('fx_eball');
  if (!seq) return;
  drawShadow(ctx, sx, sy + 6, 0.3);
  const fade = Math.min(1, (a.life - a.t) / 0.3);
  blitSeq(seq, ((a.t * 10) | 0) % seq.frames, sx, sy - 4, 0.7, 0, fade, false, pal(a));
}

function drawZap(a, sx, sy, ox, oy) {
  const k = 1 - a.t / a.life;
  const x0 = a.ox + ox, y0 = a.oy + oy, x1 = a.tx + ox, y1 = a.ty + oy;
  const dx = x1 - x0, dy = y1 - y0, len = Math.hypot(dx, dy) || 1;
  const nx = -dy / len, ny = dx / len;
  const segs = Math.max(2, Math.min(8, (len / 10) | 0));
  // A fixed jag per arc, so it flickers by fading rather than by jumping about.
  let s = a.idx;
  const rnd = () => { s = (s * 9301 + 49297) % 233280; return s / 233280 - 0.5; };
  for (let pass = 0; pass < 2; pass++) {
    ctx.globalAlpha = (pass ? 1 : 0.5) * k;
    ctx.strokeStyle = pass ? '#ffffff' : ovc(a, 1, '#f8e038');
    ctx.lineWidth = pass ? 1 : 3;
    ctx.beginPath();
    ctx.moveTo(x0, y0);
    s = a.idx;
    for (let i = 1; i < segs; i++) {
      const t = i / segs, j = rnd() * 8;
      ctx.lineTo(x0 + dx * t + nx * j, y0 + dy * t + ny * j);
    }
    ctx.lineTo(x1, y1);
    ctx.stroke();
  }
  ctx.globalAlpha = 1;
}

function drawStatic(a, sx, sy) {
  const seq = getSequence('fx_spark');
  if (!seq) return;
  const fade = Math.min(1, (a.life - a.t) / 0.4);
  blitSeq(seq, ((a.t * 12) | 0) % seq.frames, sx, sy - 3, 0.7, 0, 0.85 * fade, false, a.ov);
}

function drawBolt(a, sx, sy) {
  const k = a.t / a.life;
  // A warning on the ground, then the bolt in the last instant.
  ctx.globalAlpha = 0.3 + k * 0.4;
  ctx.strokeStyle = ovc(a, 1, '#f8e038');
  ctx.lineWidth = 1;
  ctx.beginPath(); ctx.ellipse(sx, sy, vr(a.r) * (1.2 - k * 0.4), vr(a.r) * 0.55 * (1.2 - k * 0.4), 0, 0, TAU_E); ctx.stroke();
  ctx.globalAlpha = 1;
  if (k < 0.55) return;
  const seq = getSequence('fx_ybolt');
  if (seq) blitSeq(seq, 0, sx, sy + 2, 1, 0, 1, true, a.ov);
}

function drawCloud(a, sx, sy) {
  // A thundercloud over you: Explorers of Sky's dark smoke, churning, lit now and then from inside.
  const seq = getSequence('fx_eos_smoke');
  if (!seq) return;
  const y = sy - 58;
  for (let i = 0; i < 3; i++) {
    const f = (((a.t * 5) | 0) + i) % seq.frames;
    blitSeq(seq, f, sx - 12 + i * 12, y + (i & 1) * 3, 1, 0, 0.92, false, null);
  }
  if (Math.sin(a.t * 23) > 0.85) {
    ctx.fillStyle = ovc(a, 2, '#fff6a0');
    ctx.globalAlpha = 0.6;
    ctx.beginPath(); ctx.ellipse(sx, y, 10, 4, 0, 0, TAU_E); ctx.fill();
    ctx.globalAlpha = 1;
  }
}

registerDraws({
  [EK.WEB]: { fn: drawWeb },
  [EK.TRAP]: { ground: true, fn: drawTrap },
  [EK.CLING]: { fn: drawCling },
  [EK.GRID]: { ground: true, wide: true, fn: drawGrid },
  [EK.BALL]: { fn: drawBall },
  [EK.ZAP]: { wide: true, fn: drawZap },
  [EK.STATIC]: { ground: true, fn: drawStatic },
  [EK.BOLT]: { fn: drawBolt },
  [EK.CLOUD]: { fn: drawCloud },
});
