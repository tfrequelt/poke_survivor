// L4 -- may import L0-L3, read-only.
//
// Everything a secret floor draws: the portal, the legendary itself, the circles that warn of
// what is about to land, what lands, the beams, the weather, and the marks a boss's statuses
// leave on the player. Kept out of entities.js so the ordinary frame -- which never has any of
// this in it -- stays as small as it was.
//
// Nearly all of it is frame sequences cut from the ripped move sheets (see the manifest), drawn
// straight from their canvases: there is only ever one boss, and a few dozen effects at most.

import { G } from './state.js';
import { ctx, VW, VH } from './render.js';
import { getAnim, getSequence, getImage } from './assets.js';
import { legend, hazards, beams, HZ } from './legends.js';
import { LOOKS, LOOK_KEYS } from './data/legends.js';
import { drawShadow } from './sprites.js';
import { sampleDuration } from './audio.js';

const LOOK_DEFS = LOOK_KEYS.map((k) => (k ? LOOKS[k] : null));
// The same looks at half size, for the small flames of burning ground. Built once, not per patch.
const SMALL_DEFS = LOOK_DEFS.map((l) => (l ? { ...l, scale: (l.scale || 1) * 0.5 } : null));

// --- The portal --------------------------------------------------------------------------------

const PORTAL_FPS = 7;

/**
 * The dimensional hole: four frames looping, laid flat on the ground. A soft ring pulses under it
 * while the player is close enough to take it, the same tell the stairs give.
 */
export function drawPortal(ox, oy) {
  const o = G.portal;
  if (!o.active) return;
  const sx = Math.round(o.x + ox), sy = Math.round(o.y + oy);
  if (sx < -60 || sy < -60 || sx > VW + 60 || sy > VH + 60) return;
  const seq = getSequence('legend_portal');
  if (o.near) {
    ctx.globalAlpha = 0.35 + Math.sin(G.clock * 7) * 0.18;
    ctx.strokeStyle = '#a8f0ff';
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.ellipse(sx, sy, 30, 17, 0, 0, Math.PI * 2);
    ctx.stroke();
    ctx.globalAlpha = 1;
  }
  if (!seq) {
    ctx.fillStyle = '#20104a';
    ctx.beginPath();
    ctx.ellipse(sx, sy, 22, 13, 0, 0, Math.PI * 2);
    ctx.fill();
    return;
  }
  const f = ((G.clock * PORTAL_FPS) | 0) % seq.frames;
  // Squashed to lie on the ground like the shockwave rings do, rather than stand up like a door.
  const w = seq.w * 0.7, h = seq.h * 0.62;
  ctx.drawImage(seq.canvas, f * seq.w, 0, seq.w, seq.h, Math.round(sx - w / 2), Math.round(sy - h / 2), w, h);
}

// --- The boss ----------------------------------------------------------------------------------

/**
 * The legendary, from its own PMD sheets: the walk while it moves or waits, and the attack pose
 * of the move it is using, played once and held on its last frame. A hit swaps in the white
 * silhouette baked at load. Height (`z`) lifts the sprite off its shadow -- the birds hover, and
 * a diving Moltres is somewhere far above the top of the screen.
 */
export function drawLegendBoss(e, ox, oy) {
  const L = legend, def = L.def;
  if (!def) return;
  const sx = e.x + ox, sy = e.y + oy - L.z;
  if (sx < -120 || sx > VW + 120 || sy < -160 || sy > VH + 160) return;

  // Rage: a slow pulse of the boss's colour under its feet.
  if (L.phase === 2 && L.state !== 'intro') {
    ctx.globalAlpha = 0.35 + Math.sin(G.clock * 5) * 0.15;
    ctx.strokeStyle = def.color;
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.ellipse(e.x + ox, e.y + oy + 2, e.r + 10, (e.r + 10) * 0.55, 0, 0, Math.PI * 2);
    ctx.stroke();
    ctx.globalAlpha = 1;
  }

  const posed = L.pose ? getAnim(def.id, L.pose) : null;
  const a = posed || getAnim(def.id, 'Walk');
  if (!a) {
    // Sheets not in yet (or missing): a plain shape in its colour, so the fight still reads.
    ctx.fillStyle = def.color;
    ctx.beginPath();
    ctx.ellipse(sx, sy - e.r, e.r, e.r * 1.2, 0, 0, Math.PI * 2);
    ctx.fill();
    return;
  }

  let f = 0;
  if (posed) {
    let ticks = L.poseT * 60;
    while (f < a.cols - 1 && ticks >= a.durs[f]) { ticks -= a.durs[f]; f++; }
  } else if (e.vx || e.vy || def.hover) {
    let ticks = (G.clock * 60) % (a.total * 60);
    while (f < a.cols - 1 && ticks >= a.durs[f]) { ticks -= a.durs[f]; f++; }
  }
  const dir = a.rows >= 8 ? L.dir : 0;
  const s = def.scale || 1;
  const i = (dir * a.cols + f) * 2;
  const img = e.flash > 0 && a.flash ? a.flash : a.canvas;
  if (e.spawnT > 0) ctx.globalAlpha = 0.5;
  ctx.drawImage(img, f * a.w, dir * a.h, a.w, a.h,
    Math.round(sx - a.anchors[i] * s), Math.round(sy - a.anchors[i + 1] * s), a.w * s, a.h * s);
  ctx.globalAlpha = 1;

  // Iron Defense: a hard metallic glint sweeping across the body while the guard is up.
  if (L.guardT > 0) {
    const top = sy - a.anchors[i + 1] * s, h = a.h * s;
    const band = ((G.clock * 1.6) % 1) * h;
    ctx.globalAlpha = 0.55;
    ctx.fillStyle = '#ffffff';
    ctx.fillRect(Math.round(sx - e.r - 4), Math.round(top + band), (e.r + 4) * 2, 2);
    ctx.strokeStyle = '#e8eef8';
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.ellipse(sx, sy - h * 0.3, e.r + 9, h * 0.42, 0, 0, Math.PI * 2);
    ctx.stroke();
    ctx.globalAlpha = 1;
  }
}

/** The boss's shadow is as big as the boss: the shared one is sized for a Zubat. */
export function legendShadowScale() {
  const d = legend.def;
  return d ? (d.scale > 1 ? 2.4 : 2.0) : 1;
}

// --- Effects -----------------------------------------------------------------------------------

/** Draw frame `f` of a look's sequence, anchored at (x, y). */
function drawFrame(look, f, x, y, alpha, rot) {
  const seq = getSequence(look.seq);
  if (!seq) return false;
  const s = look.scale || 1;
  const w = seq.w * s, h = seq.h * s;
  if (alpha !== 1) ctx.globalAlpha = alpha;
  if (rot) {
    ctx.save();
    ctx.translate(Math.round(x), Math.round(y));
    ctx.rotate(rot);
    ctx.drawImage(seq.canvas, f * seq.w, 0, seq.w, seq.h, -w / 2, -h / 2, w, h);
    ctx.restore();
  } else {
    const dy = look.anchor === 'bottom' ? y - h : y - h / 2;
    ctx.drawImage(seq.canvas, f * seq.w, 0, seq.w, seq.h, Math.round(x - w / 2), Math.round(dy), w, h);
  }
  if (alpha !== 1) ctx.globalAlpha = 1;
  return true;
}

/** Which frame of a look to show `k` (0..1) of the way through, honouring its `order`. */
function frameAt(look, k) {
  const seq = getSequence(look.seq);
  if (!seq) return 0;
  const order = look.order;
  const n = order ? order.length : seq.frames;
  const i = Math.min(n - 1, Math.max(0, (k * n) | 0));
  return order ? order[i] : i;
}

/** A looping frame, for pillars and anything else that burns for a while. */
function frameLoop(look, t) {
  const seq = getSequence(look.seq);
  if (!seq) return 0;
  const order = look.order;
  if (order) {
    const from = look.loopFrom || 0;
    const i = (t * 12) | 0;
    if (i < from) return order[i];
    const span = Math.max(1, order.length - from - 1);
    return order[from + ((i - from) % span)];
  }
  const n = look.loop || seq.frames;
  return ((t * (look.fps || 12)) | 0) % n;
}

/** The warning under a strike: an outline in the boss's colour, filling as it closes. */
function telegraph(x, y, r, k, color) {
  const ry = r * 0.62;
  ctx.globalAlpha = 0.18 + 0.32 * k;
  ctx.fillStyle = '#ff3a3a';
  ctx.beginPath();
  ctx.ellipse(x, y, r * k, ry * k, 0, 0, Math.PI * 2);
  ctx.fill();
  ctx.globalAlpha = 0.85;
  ctx.strokeStyle = color;
  ctx.lineWidth = 1;
  ctx.beginPath();
  ctx.ellipse(x, y, r, ry, 0, 0, Math.PI * 2);
  ctx.stroke();
  ctx.globalAlpha = 1;
}

/**
 * The ground layer, under every actor: warnings, burning and frozen ground, the closing ring's
 * warning, the dive's target.
 */
export function drawLegendGround(ox, oy) {
  if (!G.secret) return;
  const color = legend.def ? legend.def.color : '#ffffff';
  for (let i = 0; i < hazards.length; i++) {
    const h = hazards[i];
    if (!h.alive) continue;
    const x = h.x + ox, y = h.y + oy;
    if (x < -80 || y < -80 || x > VW + 80 || y > VH + 80) {
      if (h.kind !== HZ.WAVE) continue;
    }
    if (h.kind === HZ.STRIKE && h.delay > 0) {
      telegraph(x, y, h.r, 1 - h.delay / Math.max(0.01, h.dur), color);
    } else if (h.kind === HZ.ZONE) {
      const fade = Math.min(1, (h.life - h.t) / 0.6, h.t / 0.2);
      const look = LOOK_DEFS[h.look];
      if (!look) {
        // Frozen ground: a pale sheet of ice.
        ctx.globalAlpha = 0.32 * fade;
        ctx.fillStyle = '#d8f4ff';
        ctx.beginPath();
        ctx.ellipse(x, y, h.r, h.r * 0.6, 0, 0, Math.PI * 2);
        ctx.fill();
        ctx.globalAlpha = 0.5 * fade;
        ctx.strokeStyle = '#ffffff';
        ctx.lineWidth = 1;
        ctx.stroke();
        ctx.globalAlpha = 1;
      } else {
        ctx.globalAlpha = 0.28 * fade;
        ctx.fillStyle = '#ff6a20';
        ctx.beginPath();
        ctx.ellipse(x, y, h.r, h.r * 0.6, 0, 0, Math.PI * 2);
        ctx.fill();
        ctx.globalAlpha = 1;
      }
    } else if (h.kind === HZ.PILLAR && h.delay > 0) {
      telegraph(x, y, h.r, 0.4, color);
    } else if (h.kind === HZ.ORB) {
      ctx.globalAlpha = 0.18;
      ctx.strokeStyle = color;
      ctx.lineWidth = 1;
      ctx.beginPath();
      const zr = h.zap ? h.zap.zapRange : 100;
      ctx.ellipse(x, y, zr, zr * 0.62, 0, 0, Math.PI * 2);
      ctx.stroke();
      ctx.globalAlpha = 1;
    } else if (h.kind === HZ.LOB) {
      const k = Math.min(1, h.t / h.dur);
      drawShadow(ctx, h.x0 + (h.x - h.x0) * k + ox, h.y0 + (h.y - h.y0) * k + oy, 1.6);
    }
  }

  const r = legend.reticle;
  if (r.on) {
    const x = r.x + ox, y = r.y + oy;
    const pulse = 0.6 + Math.sin(G.clock * 14) * 0.25;
    ctx.globalAlpha = pulse;
    ctx.strokeStyle = '#ff4040';
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.ellipse(x, y, 40, 25, 0, 0, Math.PI * 2);
    ctx.stroke();
    ctx.fillStyle = 'rgba(255,60,60,0.25)';
    ctx.fill();
    ctx.globalAlpha = 1;
    drawShadow(ctx, x, y, 2.2);
  }
}

/** Over the actors: what lands, what burns, what falls, the beams and the wave. */
export function drawLegendAir(ox, oy) {
  if (!legend.def) return;
  for (let i = 0; i < hazards.length; i++) {
    const h = hazards[i];
    if (!h.alive) continue;
    const x = h.x + ox, y = h.y + oy;
    const look = LOOK_DEFS[h.look];

    if (h.kind === HZ.STRIKE) {
      if (!look) continue;
      if (h.delay > 0) {
        // Something on its way down: it falls the whole length of the warning.
        if (h.fall) {
          const k = 1 - h.delay / Math.max(0.01, h.dur);
          drawFrame(look, frameLoop(look, G.clock), x, y - 220 * (1 - k) * (1 - k) - 6, 1, 0);
        }
        continue;
      }
      if (h.fall) {
        drawFrame(look, 0, x, y - 6, Math.max(0, 1 - h.t / h.life), 0);
        continue;
      }
      drawFrame(look, frameAt(look, h.t / h.life), x, y + (look.anchor === 'bottom' ? h.r * 0.4 : 0), 1, 0);
      continue;
    }
    if (h.kind === HZ.PILLAR || h.kind === HZ.ZONE) {
      if (!look || (h.kind === HZ.PILLAR && h.delay > 0)) continue;
      if (x < -60 || y < -60 || x > VW + 60 || y > VH + 100) continue;
      const fade = Math.min(1, (h.life - h.t) / 0.4);
      if (h.kind === HZ.ZONE) {
        // Burning ground: a small flame, not a column -- it is a patch to avoid, not a wall.
        drawFrame(SMALL_DEFS[h.look], frameLoop(look, h.t + i * 0.13), x, y + 3, fade, 0);
      } else {
        drawFrame(look, frameLoop(look, h.t + i * 0.07), x, y + h.r * 0.4, fade, 0);
      }
      continue;
    }
    if (h.kind === HZ.ORB) {
      if (look) drawFrame(look, frameLoop(look, h.t), x, y - 10 + Math.sin(G.clock * 4 + i) * 2, 1, 0);
      continue;
    }
    if (h.kind === HZ.LOB) {
      if (!look) continue;
      const k = Math.min(1, h.t / h.dur);
      const lx = h.x0 + (h.x - h.x0) * k + ox, ly = h.y0 + (h.y - h.y0) * k + oy;
      drawFrame(look, 0, lx, ly - Math.sin(Math.PI * k) * 110, 1, G.clock * 5);
      continue;
    }
    if (h.kind === HZ.WAVE) drawWave(h, ox, oy);
  }
  drawBeams(ox, oy);
}

/**
 * Surf. Before it comes: the edge it will come from flashes, and two marks show the gap. Then the
 * wall itself, Hydro Pump's wave art stacked down the height of the room with the gap left open.
 */
function drawWave(h, ox, oy) {
  const b = G.bounds;
  if (!b) return;
  const top = b.minY + oy, bottom = b.maxY + oy;
  const gy0 = h.y - h.gap / 2 + oy, gy1 = h.y + h.gap / 2 + oy;
  if (h.delay > 0) {
    const ex = (h.dir > 0 ? b.minX : b.maxX) + ox;
    const on = ((G.clock * 8) | 0) & 1;
    ctx.globalAlpha = on ? 0.7 : 0.35;
    ctx.fillStyle = '#5ab6ef';
    ctx.fillRect(Math.round(ex - 4), Math.round(top), 8, Math.round(gy0 - top));
    ctx.fillRect(Math.round(ex - 4), Math.round(gy1), 8, Math.round(bottom - gy1));
    ctx.fillStyle = '#ffffff';
    ctx.fillRect(Math.round(ex - 10), Math.round(gy0 - 1), 20, 2);
    ctx.fillRect(Math.round(ex - 10), Math.round(gy1 - 1), 20, 2);
    ctx.globalAlpha = 1;
    return;
  }
  const seq = getSequence('fx_tsunami');
  const x = h.x + ox;
  if (x < -80 || x > VW + 80) return;
  if (!seq) {
    ctx.fillStyle = 'rgba(80,160,240,0.8)';
    ctx.fillRect(Math.round(x - 14), Math.round(top), 28, Math.round(gy0 - top));
    ctx.fillRect(Math.round(x - 14), Math.round(gy1), 28, Math.round(bottom - gy1));
    return;
  }
  const f = ((G.clock * 10) | 0) % seq.frames;
  const w = seq.w * 0.8, hh = seq.h * 0.8;
  ctx.save();
  if (h.dir < 0) { ctx.translate(Math.round(x) * 2, 0); ctx.scale(-1, 1); }
  for (let y = top; y < bottom; y += hh * 0.85) {
    if (y + hh > gy0 && y < gy1) continue;
    ctx.drawImage(seq.canvas, f * seq.w, 0, seq.w, seq.h, Math.round(x - w / 2), Math.round(y), w, hh);
  }
  ctx.restore();
}

function drawBeams(ox, oy) {
  const L = legend, e = L.e;
  if (!e) return;
  for (let i = 0; i < beams.length; i++) {
    const b = beams[i];
    if (!b.alive) continue;
    const x0 = e.x + ox, y0 = e.y + oy - L.z * 0.5 - 8;
    const dx = Math.cos(b.angle), dy = Math.sin(b.angle);
    const x1 = x0 + dx * b.len, y1 = y0 + dy * b.len;
    if (b.t < b.telegraph) {
      // The warning: a thin line that flickers faster as it gets closer to firing.
      const k = b.t / b.telegraph;
      if ((((b.t * (8 + k * 20)) | 0) & 1) === 0) {
        ctx.globalAlpha = 0.5 + k * 0.4;
        ctx.strokeStyle = b.edge;
        ctx.lineWidth = 1;
        ctx.beginPath();
        ctx.moveTo(x0, y0);
        ctx.lineTo(x1, y1);
        ctx.stroke();
        ctx.globalAlpha = 1;
      }
      continue;
    }
    const live = b.t - b.telegraph;
    const k = Math.max(0, 1 - live / b.dur);
    const nx = -dy, ny = dx;
    const w = b.width * (0.6 + 0.4 * k);
    ctx.globalAlpha = 0.85;
    ctx.fillStyle = b.edge;
    quad(x0, y0, x1, y1, nx, ny, w / 2);
    ctx.fillStyle = b.color;
    quad(x0, y0, x1, y1, nx, ny, w / 4);
    ctx.globalAlpha = 1;
  }
}

function quad(x0, y0, x1, y1, nx, ny, hw) {
  ctx.beginPath();
  ctx.moveTo(x0 + nx * hw, y0 + ny * hw);
  ctx.lineTo(x1 + nx * hw, y1 + ny * hw);
  ctx.lineTo(x1 - nx * hw, y1 - ny * hw);
  ctx.lineTo(x0 - nx * hw, y0 - ny * hw);
  ctx.closePath();
  ctx.fill();
}

/**
 * A boss shot, drawn as its look. Returns false if it has none (or its sheet is missing), so the
 * caller falls back to the plain enemy shot -- a missing effect never means an invisible bullet.
 */
export function drawLegendShot(pr, sx, sy) {
  const look = LOOK_DEFS[pr.look];
  if (!look) return false;
  const seq = getSequence(look.seq);
  if (!seq) return false;
  let f = 0;
  if (look.fps) f = (((G.clock * look.fps) | 0) + (pr.hitId & 7)) % (look.loop || seq.frames);
  let rot = 0;
  if (look.rot) rot = pr.angle + Math.PI / 2;
  else if (look.spin) rot = G.clock * look.spin + pr.hitId;
  return drawFrame(look, f, sx, sy, 1, rot);
}

// --- Weather -----------------------------------------------------------------------------------

/**
 * Articuno's blizzard reuses the hail overlay; Suicune's rain is the Red Rescue Team rain, sixty
 * 240x160 panels tiled over the screen. Both are screen-space, like the hail always was.
 */
export function drawLegendWeather() {
  const w = legend.weather;
  if (!w) return;
  const seq = getSequence(w === 'rain' ? 'weather_rain' : 'hail');
  if (!seq) return;
  const cycle = w === 'rain' ? 3 : (sampleDuration('move_hail') || 2.2);
  const base = ((G.clock % cycle) / cycle) * seq.frames;
  const cols = Math.ceil(VW / seq.w), rows = Math.ceil(VH / seq.h);
  if (w === 'rain') ctx.globalAlpha = 0.85;
  for (let row = 0; row < rows; row++) {
    const f = (((base + row * (seq.frames / rows)) | 0) % seq.frames + seq.frames) % seq.frames;
    for (let col = 0; col < cols; col++) {
      ctx.drawImage(seq.canvas, f * seq.w, 0, seq.w, seq.h, col * seq.w, row * seq.h, seq.w, seq.h);
    }
  }
  ctx.globalAlpha = 1;
}

// --- The player's statuses ---------------------------------------------------------------------

const BURN_MARK = { x: 104, y: 112, w: 16, h: 16, frames: 7 };

/** Frozen solid, burning, crackling or frosted over -- drawn on top of the player sprite. */
export function drawPlayerStatus(p, sx, sy) {
  if (p.freezeT > 0) {
    const seq = getSequence('fx_iceblock');
    if (seq) {
      const s = 0.42, w = seq.w * s, h = seq.h * s;
      ctx.globalAlpha = 0.72;
      ctx.drawImage(seq.canvas, 0, 0, seq.w, seq.h, Math.round(sx - w / 2), Math.round(sy - h + 3), w, h);
      ctx.globalAlpha = 1;
    }
  }
  if (p.burnT > 0) {
    const img = getImage('status');
    if (img) {
      const f = ((G.tick / 4) | 0) % BURN_MARK.frames;
      ctx.drawImage(img.canvas, BURN_MARK.x + f * BURN_MARK.w, BURN_MARK.y, BURN_MARK.w, BURN_MARK.h,
        Math.round(sx - 14), Math.round(sy - 30), BURN_MARK.w, BURN_MARK.h);
    }
  }
  if (p.paraT > 0 && ((G.tick >> 2) & 1)) {
    // Static jumping off the body, a few short zigzags that move every other frame.
    ctx.strokeStyle = '#fff060';
    ctx.lineWidth = 1;
    ctx.beginPath();
    for (let i = 0; i < 3; i++) {
      const a = (G.tick * 0.7 + i * 2.1) % (Math.PI * 2);
      const x = sx + Math.cos(a) * 8, y = sy - 10 + Math.sin(a) * 9;
      ctx.moveTo(x, y);
      ctx.lineTo(x + 3, y + 2);
      ctx.lineTo(x + 1, y + 5);
    }
    ctx.stroke();
  }
  if (p.chillT > 0) {
    ctx.fillStyle = '#d8f4ff';
    for (let i = 0; i < 4; i++) {
      const t = (G.clock * 0.9 + i * 0.25) % 1;
      const x = sx - 8 + ((i * 37) % 16), y = sy - 22 + t * 22;
      ctx.globalAlpha = 1 - t;
      ctx.fillRect(Math.round(x), Math.round(y), 1, 1);
    }
    ctx.globalAlpha = 1;
  }
}
