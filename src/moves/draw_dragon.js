// L4 -- may import L0-L3, read-only.
//
// The Dragon weapons' actors (moves/dragon.js), drawn from dragon_moves.png's own animations,
// recoloured in an overload's palette when there is one.

import { G } from '../state.js';
import { ctx } from '../render.js';
import { getSequence } from '../assets.js';
import { drawSprite, drawShadow, glowCanvas } from '../sprites.js';
import { blitSeq, ovc, TAU_E, registerDraws, vk, vr } from './gfx.js';
import { actors as dragonActors } from './core.js';
import { DK, rendReach } from './dragon.js';



/** A Dragon Pulse orb and its throb ring swelling off it (a second, wider one on a heartbeat). */
function drawPulse(a, sx, sy) {
  const seq = getSequence('fx_pulse_orb');
  const k = (G.clock - a.step) / 0.25;
  if (a.step > 0 && k >= 0 && k < 1) {
    const rr = a.r * (a.idx === 2 ? 1.15 : 1);
    ctx.globalAlpha = (1 - k) * 0.8;
    ctx.strokeStyle = k < 0.4 ? '#ffffff' : ovc(a, a.idx === 2 ? 2 : 0, '#c8b8ff');
    ctx.lineWidth = a.idx === 2 ? 3 : 2;
    ctx.beginPath();
    ctx.ellipse(sx, sy, rr * (0.35 + 0.65 * k), rr * (0.35 + 0.65 * k) * 0.75, 0, 0, TAU_E);
    ctx.stroke();
    ctx.globalAlpha = 1;
  }
  if (seq) blitSeq(seq, (((a.t * 14) | 0) + a.phase) % seq.frames, sx, sy, 0.87 * vk(a.area), 0, 1, false, a.ov);
}

/**
 * A claw rake: a hooked stroke drawing itself, then fading -- white-hot at its core, violet at
 * its edge, gold on the set's critical last rake (or in the overload's colours).
 */
function drawRake(a, sx, sy) {
  const draw = Math.min(1, a.t / 0.07);
  const fade = a.t < 0.07 ? 1 : 1 - (a.t - 0.07) / (a.life - 0.07);
  if (fade <= 0) return;
  const ux = Math.cos(a.a), uy = Math.sin(a.a);
  const len = a.k * draw;
  const ex = sx + ux * len, ey = sy - 6 + uy * len;
  // The bow: the middle of the stroke pushed out to one side by a fifth of its length.
  const bow = Math.min(a.k * 0.2, 18);
  const cx = sx + ux * len * 0.5 - uy * bow, cy = sy - 6 + uy * len * 0.5 + ux * bow;
  const stroke = (color, width, alpha) => {
    ctx.globalAlpha = alpha;
    ctx.strokeStyle = color;
    ctx.lineWidth = width;
    ctx.beginPath();
    ctx.moveTo(sx, sy - 6);
    ctx.quadraticCurveTo(cx, cy, ex, ey);
    ctx.stroke();
  };
  stroke(a.crit ? ovc(a, 2, '#ffd166') : ovc(a, 0, '#7a5af0'), a.crit ? 5 : 4, fade * 0.5);
  stroke(a.crit ? '#ffffff' : ovc(a, 1, '#ffb347'), 2, fade);
  stroke('#ffffff', 1, fade);
  ctx.globalAlpha = 1;
}

/**
 * Twister: a funnel of the sheet's leaves and pebbles in a helix, widening as it climbs, with
 * faint wind bands around it. No sprite of a tornado: the debris IS the tornado.
 */
function drawTwister(a, sx, sy) {
  const seq = getSequence('fx_twister_bits');
  const H = 56 * vk(a.area * Math.max(1, a.r / (34 * a.area)));
  const fade = Math.min(1, a.t / 0.25, (a.life - a.t) / 0.35);
  ctx.globalAlpha = 0.28 * fade;
  ctx.strokeStyle = ovc(a, 1, '#e8f4ff');
  ctx.lineWidth = 1;
  for (let b = 0; b < 4; b++) {
    const h = (b + 0.5) * (H / 4);
    const rx = 5 + h * 0.42, ph = a.t * 7 + b;
    ctx.beginPath();
    ctx.ellipse(sx + Math.sin(ph) * 2, sy - h, rx, rx * 0.28, 0, 0, TAU_E);
    ctx.stroke();
  }
  ctx.globalAlpha = fade;
  if (!seq) return;
  const n = 18;
  for (let i = 0; i < n; i++) {
    const u = i / n;
    const h = u * H;
    const rad = 4 + h * 0.4;
    const ang = a.t * 9 + i * 2.39;
    const x = sx + Math.cos(ang) * rad + Math.sin(a.t * 3 + u * 4) * 3;
    const y = sy - h + Math.sin(ang) * rad * 0.28;
    blitSeq(seq, i % seq.frames, x, y, 0.9, ang, 1, false, a.ov);
  }
  ctx.globalAlpha = 1;
}

/** Spacial Rend: the tear opening, then crescents slashing out and back, and its chains. */
function drawRend(a, sx, sy, ox, oy) {
  const star = getSequence('fx_rend_star');
  const cres = getSequence('fx_crescent');
  if (!star) return;
  const open = Math.min(1, a.t / 0.6);
  const closing = a.t > a.life - 0.15 ? (a.life - a.t) / 0.15 : 1;
  const f = Math.min(star.frames - 1, (open * star.frames) | 0);
  const pulse = a.t > 0.6 ? 1 + Math.sin(a.t * 30) * 0.06 : 1;
  blitSeq(star, f, sx, sy, 1.4 * vk(a.area) * pulse, a.t * 2, closing, false, a.ov);
  // Spatial Anchor's chains: a beaded line from the tear to each foe it holds.
  if (a.held.length) {
    ctx.fillStyle = ovc(a, 1, '#ffffff');
    for (let j = 0; j < a.held.length; j++) {
      const e = a.held[j];
      if (!e.alive || e.sn !== a.heldSn[j]) continue;
      const ex = e.x + ox, ey = e.y + oy - 6;
      const n = Math.max(2, (Math.hypot(ex - sx, ey - sy) / 5) | 0);
      for (let q = 1; q < n; q++) {
        if ((q + ((a.t * 12) | 0)) % 3 === 0) continue;
        ctx.fillRect(Math.round(sx + (ex - sx) * (q / n)), Math.round(sy + (ey - sy) * (q / n)), 1, 1);
      }
    }
  }
  if (!cres) return;
  const { k, leg } = rendReach(a);
  if (leg < 0) return;
  for (let i = 0; i < a.n; i++) {
    const ang = a.a + (i / a.n) * TAU_E + k * 0.6;
    const x = sx + Math.cos(ang) * a.k * k, y = sy + Math.sin(ang) * a.k * k * 0.8;
    blitSeq(cres, (i + ((a.t * 16) | 0)) % cres.frames, x, y, 1.5 * vk(a.area), ang + (leg ? Math.PI : 0), 1, false, a.ov);
  }
}

/** Roar of Time: the gear ring, turning, with a clock hand sweeping backwards. */
function drawTimeRing(a, sx, sy) {
  const seq = getSequence('fx_roar');
  const open = Math.min(1, a.t / 0.2);
  const fade = Math.min(1, (a.life - a.t) / 0.2);
  // The gears at their own size; the floor ellipse under them carries the ring's true reach.
  const s = 1.33 * vk(a.area) * (0.7 + 0.3 * open);
  ctx.globalAlpha = 0.18 * fade;
  ctx.fillStyle = ovc(a, 0, '#5ab6ff');
  ctx.beginPath();
  ctx.ellipse(sx, sy, vr(a.r), vr(a.r) * 0.8, 0, 0, TAU_E);
  ctx.fill();
  ctx.globalAlpha = 1;
  if (seq) blitSeq(seq, seq.frames - 1, sx, sy, s, -a.t * 0.8, 0.75 * fade, false, a.ov);
  if (seq) blitSeq(seq, 0, sx, sy, s * 0.55, a.t * 1.6, 0.6 * fade, false, a.ov);
  // The hand: sweeping the wrong way round, as time is held.
  const ha = -a.t * 4 - Math.PI / 2;
  ctx.globalAlpha = 0.9 * fade;
  ctx.strokeStyle = ovc(a, 2, '#ffffff');
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.moveTo(sx, sy);
  ctx.lineTo(sx + Math.cos(ha) * a.r * 0.6, sy + Math.sin(ha) * a.r * 0.48);
  ctx.stroke();
  ctx.globalAlpha = 1;
  // What it holds: a cold glint over each frozen foe.
  for (let j = 0; j < a.held.length && j < 24; j++) {
    const e = a.held[j];
    if (!e.alive || e.sn !== a.heldSn[j]) continue;
    const ex = e.x - a.x + sx, ey = e.y - a.y + sy;
    const tw = (Math.sin(a.t * 10 + j) + 1) / 2;
    ctx.fillStyle = tw > 0.5 ? '#ffffff' : ovc(a, 1, '#9adcff');
    ctx.fillRect(Math.round(ex) - 1, Math.round(ey - e.r - 10), 3, 1);
    ctx.fillRect(Math.round(ex), Math.round(ey - e.r - 11), 1, 3);
  }
}

// The overloads' marks on the ground. Short-lived and few at a time, so they are drawn shapes.

/** Meteor Charge's crater: a dark bowl with fissures cracking outward as it ages. */
function drawCrater(a, sx, sy) {
  const k = Math.min(1, a.t / 0.3), fade = Math.min(1, (a.life - a.t) / 0.3);
  ctx.globalAlpha = 0.45 * fade;
  ctx.fillStyle = '#1a1008';
  ctx.beginPath();
  ctx.ellipse(sx, sy, vr(a.r) * 0.6, vr(a.r) * 0.36, 0, 0, TAU_E);
  ctx.fill();
  ctx.globalAlpha = 0.9 * fade;
  ctx.strokeStyle = ovc(a, 1, '#f0b070');
  ctx.lineWidth = 1;
  ctx.beginPath();
  for (let i = 0; i < 7; i++) {
    const ang = a.a + i * 0.9;
    const len = a.r * (0.55 + 0.45 * k) * (0.7 + ((i * 37) % 10) / 30);
    let x = sx + Math.cos(ang) * a.r * 0.4, y = sy + Math.sin(ang) * a.r * 0.24;
    ctx.moveTo(x, y);
    for (let s = 1; s <= 3; s++) {
      const u = (s / 3) * len;
      const j = (s & 1 ? 1 : -1) * 3;
      x = sx + Math.cos(ang) * u - Math.sin(ang) * j;
      y = sy + (Math.sin(ang) * u + Math.cos(ang) * j) * 0.6;
      ctx.lineTo(x, y);
    }
  }
  ctx.stroke();
  ctx.globalAlpha = 1;
}

/** Phantom Lane: a translucent band along the charge's path, shimmering. */
function drawLane(a, ox, oy) {
  const fade = Math.min(1, a.t / 0.15, (a.life - a.t) / 0.4);
  const x0 = a.ox + ox, y0 = a.oy + oy, x1 = a.x + ox, y1 = a.y + oy;
  ctx.globalAlpha = (0.22 + Math.sin(a.t * 12) * 0.06) * fade;
  ctx.strokeStyle = ovc(a, 0, '#9a6aff');
  ctx.lineWidth = a.r * 2;
  ctx.lineCap = 'round';
  ctx.beginPath(); ctx.moveTo(x0, y0); ctx.lineTo(x1, y1); ctx.stroke();
  ctx.globalAlpha = 0.6 * fade;
  ctx.strokeStyle = ovc(a, 1, '#c8b0ff');
  ctx.lineWidth = 1;
  ctx.beginPath(); ctx.moveTo(x0, y0); ctx.lineTo(x1, y1); ctx.stroke();
  ctx.lineCap = 'butt';
  // Ghost motes drifting back toward the start.
  ctx.fillStyle = '#ffffff';
  for (let i = 0; i < 6; i++) {
    const u = 1 - (((a.t * 0.8) + i / 6) % 1);
    ctx.globalAlpha = 0.7 * fade * u;
    ctx.fillRect(Math.round(x0 + (x1 - x0) * u), Math.round(y0 + (y1 - y0) * u + Math.sin(i * 2 + a.t * 6) * 3), 1, 1);
  }
  ctx.globalAlpha = 1;
}

/** Crosshatch's X scar, glowing and fading. */
function drawScar(a, sx, sy) {
  const fade = Math.min(1, (a.life - a.t) / 0.4);
  const r = a.r;
  ctx.globalAlpha = (0.65 + Math.sin(a.t * 14) * 0.2) * fade;
  for (const [col, wd] of [[ovc(a, 0, '#e05a20'), 3], [ovc(a, 2, '#ffffff'), 1]]) {
    ctx.strokeStyle = col;
    ctx.lineWidth = wd;
    ctx.beginPath();
    for (const d of [a.a + Math.PI / 4, a.a - Math.PI / 4]) {
      ctx.moveTo(sx - Math.cos(d) * r, sy - 4 - Math.sin(d) * r * 0.7);
      ctx.lineTo(sx + Math.cos(d) * r, sy - 4 + Math.sin(d) * r * 0.7);
    }
    ctx.stroke();
  }
  ctx.globalAlpha = 1;
}

/** Static Steps' footprint: two toes and a heel, crackling now and then. */
function drawPrint(a, sx, sy) {
  const fade = Math.min(1, (a.life - a.t) / 0.5);
  const col = a.idx ? ovc(a, 1, '#7ac8ff') : ovc(a, 0, '#ff8a20');
  ctx.globalAlpha = 0.85 * fade;
  ctx.fillStyle = col;
  const ux = Math.cos(a.a - Math.PI / 2), uy = Math.sin(a.a - Math.PI / 2);
  ctx.fillRect(Math.round(sx - ux * 2) - 1, Math.round(sy - uy * 2), 2, 2);
  ctx.fillRect(Math.round(sx + ux * 2 - uy * 2), Math.round(sy + uy * 2 + ux * 2) - 1, 1, 1);
  ctx.fillRect(Math.round(sx + ux * 2 + uy * 2), Math.round(sy + uy * 2 - ux * 2) - 1, 1, 1);
  if (((a.t * 9) | 0) % 3 === 0) {
    ctx.fillStyle = '#ffffff';
    ctx.fillRect(Math.round(sx) + ((a.t * 31) % 5 | 0) - 2, Math.round(sy) - 3, 1, 2);
  }
  ctx.globalAlpha = 1;
}

/** Bramble Wind: thorny vines coiling up out of the ground around the rooted foe. */
function drawVine(a, sx, sy) {
  if (!a.done) return;
  const grow = Math.min(1, (a.t - 0.3) / 0.2), fade = Math.min(1, (a.life - a.t) / 0.3);
  ctx.globalAlpha = fade;
  ctx.lineWidth = 2;
  for (let i = 0; i < 5; i++) {
    const ang = i * 1.26 + 0.3;
    const bx = sx + Math.cos(ang) * a.r * 0.6, by = sy + Math.sin(ang) * a.r * 0.35;
    const h = (10 + (i % 3) * 4) * grow;
    ctx.strokeStyle = i & 1 ? ovc(a, 0, '#3a9a28') : ovc(a, 1, '#7fe08a');
    ctx.beginPath();
    ctx.moveTo(bx, by);
    ctx.quadraticCurveTo(bx + Math.sin(a.t * 3 + i) * 5, by - h * 0.6, bx + (sx - bx) * 0.4, by - h);
    ctx.stroke();
    ctx.fillStyle = ovc(a, 2, '#ffe070');
    ctx.fillRect(Math.round(bx + (sx - bx) * 0.2) + 1, Math.round(by - h * 0.5), 1, 1);
  }
  ctx.globalAlpha = 1;
}

/** Fault Lines: the rift polygon, flickering. */
function drawFault(a, ox, oy) {
  const n = a.pts.length >> 1;
  if (n < 2) return;
  const fade = Math.min(1, a.t / 0.1, (a.life - a.t) / 0.3);
  for (const [col, wd, al] of [[ovc(a, 0, '#e04a98'), 3, 0.5], [ovc(a, 2, '#ffffff'), 1, 0.95]]) {
    ctx.globalAlpha = al * fade * (0.8 + Math.sin(a.t * 25) * 0.2);
    ctx.strokeStyle = col;
    ctx.lineWidth = wd;
    ctx.beginPath();
    for (let i = 0; i <= n; i++) {
      const j = i % n;
      const x = a.pts[j * 2] + ox, y = a.pts[j * 2 + 1] + oy;
      if (i === 0) ctx.moveTo(x, y); else ctx.lineTo(x + (i < n ? (G.rngFx() - 0.5) * 2 : 0), y);
    }
    ctx.stroke();
  }
  ctx.globalAlpha = 1;
}

/** Afterimage: a translucent copy of you, in the overload's light, bobbing to the beat. */
function drawAfter(a, sx, sy) {
  if (a.spr < 0) return;
  const fade = Math.min(1, a.t / 0.1, (a.life - a.t) / 0.5);
  const bob = Math.round(Math.sin(a.t * 12) * 1.5);
  ctx.globalAlpha = 0.45 * fade;
  drawSprite(ctx, a.spr, sx, sy + bob);
  ctx.globalCompositeOperation = 'lighter';
  ctx.globalAlpha = 0.35 * fade;
  ctx.drawImage(glowCanvas(ovc(a, 0, '#5ae0ff')), sx - 14, sy - 26 + bob, 28, 28);
  ctx.globalCompositeOperation = 'source-over';
  ctx.globalAlpha = 1;
}


// --- Registration ------------------------------------------------------------------------------
//
// One draw per kind, lifted from the per-kind cases the renderer used to switch on.

function drawRageBall(a, sx, sy) {
  const seq = getSequence('fx_rage_ball');
  if (!seq) return;
  drawShadow(ctx, sx, sy + 8, 0.5);
  blitSeq(seq, ((a.t * 18) | 0) % seq.frames, sx, sy, 0.8 * vk(a.area), 0, 1, false, a.ov);
}

function drawPillar(a, sx, sy) {
  const seq = getSequence('fx_rage_burst');
  if (!seq) return;
  // A creeping pillar plays its rise once, then keeps burning on the middle frames.
  const f = a.n
    ? (a.t < 0.25 ? (a.t / 0.25 * 3) | 0 : 2 + (((a.t * 14) | 0) % 4))
    : ((a.t / a.life) * seq.frames) | 0;
  const fade = a.n ? Math.min(1, (a.life - a.t) / 0.25) : 1;
  blitSeq(seq, f, sx, sy + 4, 1.47 * vk(a.area), 0, fade, true, a.ov);
}

function drawSpark(a, sx, sy) {
  const seq = getSequence(a.idx ? 'fx_spark_c' : 'fx_spark_o');
  if (!seq) return;
  drawShadow(ctx, sx, sy + 2, a.crit ? 0.9 : 0.35);
  const diving = a.phase === 2;
  const f = diving ? 0 : ((a.t * 16) | 0) % seq.frames;
  const sc = a.crit ? 2.2 : diving ? 0.9 : 0.7;
  if (a.crit) {
    // The Grand Finale comet: a glow under it, in its colour.
    ctx.globalCompositeOperation = 'lighter';
    ctx.globalAlpha = 0.5;
    ctx.drawImage(glowCanvas(ovc(a, 0, '#ffd166')), sx - 18, sy - a.z - 18, 36, 36);
    ctx.globalCompositeOperation = 'source-over';
    ctx.globalAlpha = 1;
  }
  blitSeq(seq, f, sx, sy - a.z, sc, diving ? a.a + Math.PI / 2 : 0, 1, false, a.ov);
}

function drawRushSlash(a, sx, sy) {
  const seq = getSequence('fx_rush_slash');
  if (seq) blitSeq(seq, ((a.t * 16) | 0) % seq.frames, sx, sy - 8, 0.8 * vk(a.area), a.a, 1, false, a.ov);
}

function drawRock(a, sx, sy) {
  const seq = getSequence('fx_rush_rocks');
  if (!seq) return;
  drawShadow(ctx, sx, sy + 2, 0.4);
  blitSeq(seq, 0, sx, sy - a.z, 0.42, a.t * 9, 1, false, a.ov);
}

function drawDebris(a, sx, sy) {
  // The flung foe's flight: speed lines streaming behind it.
  const sp = Math.hypot(a.vx, a.vy) || 1, ux = a.vx / sp, uy = a.vy / sp;
  ctx.strokeStyle = ovc(a, 1, '#d8c8a8');
  ctx.lineWidth = 1;
  ctx.globalAlpha = 0.8;
  ctx.beginPath();
  for (let k = -1; k <= 1; k++) {
    const px = sx - uy * k * 4, py = sy - 6 + ux * k * 4;
    ctx.moveTo(px - ux * 4, py - uy * 4);
    ctx.lineTo(px - ux * (14 + Math.abs(k) * 4), py - uy * (14 + Math.abs(k) * 4));
  }
  ctx.stroke();
  ctx.globalAlpha = 1;
}

function drawGear(a, sx, sy) {
  const seq = getSequence('fx_roar');
  if (!seq) return;
  const fade = Math.min(1, (a.life - a.t) / 0.3);
  blitSeq(seq, 0, sx, sy - 6, 0.5 * vk(a.area), a.a, fade, false, a.ov);
}

function drawTwisterShadow(a, sx, sy) {
  ctx.globalAlpha = 0.18;
  ctx.fillStyle = '#101820';
  ctx.beginPath();
  ctx.ellipse(sx, sy + 2, vr(a.r) * 0.55, vr(a.r) * 0.22, 0, 0, TAU_E);
  ctx.fill();
  ctx.globalAlpha = 1;
}

registerDraws({
  [DK.LOCK]: { ground: true, fn: (a, sx, sy) => drawTimeRing(a, sx, sy) },
  [DK.REND]: { ground: true, fn: (a, sx, sy, ox, oy) => drawRend(a, sx, sy, ox, oy) },
  [DK.CRATER]: { ground: true, fn: (a, sx, sy) => drawCrater(a, sx, sy) },
  [DK.LANE]: { ground: true, wide: true, fn: (a, sx, sy, ox, oy) => drawLane(a, ox, oy) },
  [DK.SCAR]: { ground: true, fn: (a, sx, sy) => drawScar(a, sx, sy) },
  [DK.PRINT]: { ground: true, fn: (a, sx, sy) => drawPrint(a, sx, sy) },
  [DK.VINE]: { ground: true, fn: (a, sx, sy) => drawVine(a, sx, sy) },
  [DK.FAULT]: { ground: true, wide: true, fn: (a, sx, sy, ox, oy) => drawFault(a, ox, oy) },
  [DK.RAGE]: { fn: drawRageBall },
  [DK.PILLAR]: { fn: drawPillar },
  [DK.PULSE]: { fn: (a, sx, sy) => drawPulse(a, sx, sy) },
  [DK.SPARK]: { fn: drawSpark },
  [DK.RUSH]: { fn: drawRushSlash },
  [DK.ROCK]: { fn: drawRock },
  [DK.RAKE]: { fn: (a, sx, sy) => drawRake(a, sx, sy) },
  [DK.TWISTER]: { under: drawTwisterShadow, fn: (a, sx, sy) => drawTwister(a, sx, sy) },
  [DK.AFTER]: { fn: (a, sx, sy) => drawAfter(a, sx, sy) },
  [DK.DEBRIS]: { fn: drawDebris },
  [DK.GEAR]: { fn: drawGear },
});
