// L4 -- may import L0-L3, read-only.
//
// Drawing for the move framework (moves/core.js): the actors are drawn by each type's
// draw_<type>.js, which registers a draw per actor kind here, plus the helpers they share. An
// overloaded weapon's animation strips are recoloured in its overload's palette (recolour.js).

import { ctx, VW, VH } from '../render.js';
import { recoloured } from '../recolour.js';
import { actors, movesLive, vk, vr, va } from './core.js';
export { vk, vr, va };

/**
 * kind -> { fn(a, sx, sy, ox, oy), ground, under, wide }. `ground` draws `fn` on the floor, under
 * the actors; `under` is a second, floor-level draw for a kind that also has one over them (a
 * twister's shadow); `wide` skips the screen cull (a lane or a rift spans more than its anchor).
 */
export const DRAWS = [];
export function registerDraws(map) { for (const k of Object.keys(map)) DRAWS[k] = map[k]; }

/**
 * One frame of a sequence strip, centred on (sx, sy) -- or standing on it -- scaled and turned,
 * in `ov`'s palette when an overload is given.
 */
export function blitSeq(seq, f, sx, sy, scale = 1, rot = 0, alpha = 1, bottom = false, ov = null) {
  const w = seq.w * scale, h = seq.h * scale;
  const fi = f < 0 ? 0 : f >= seq.frames ? seq.frames - 1 : f;
  const src = ov && ov.colors ? recoloured(seq.canvas, ov) : seq.canvas;
  if (alpha !== 1) ctx.globalAlpha = Math.max(0, Math.min(1, alpha));
  if (rot) {
    ctx.save();
    ctx.translate(Math.round(sx), Math.round(sy));
    ctx.rotate(rot);
    ctx.drawImage(src, fi * seq.w, 0, seq.w, seq.h, -w / 2, bottom ? -h : -h / 2, w, h);
    ctx.restore();
  } else {
    ctx.drawImage(src, fi * seq.w, 0, seq.w, seq.h,
      Math.round(sx - w / 2), Math.round(bottom ? sy - h : sy - h / 2), Math.round(w), Math.round(h));
  }
  if (alpha !== 1) ctx.globalAlpha = 1;
}

/** An overloaded actor's colour in one of its three slots, or the fallback. */
export const ovc = (a, slot, fallback) => (a.ov && a.ov.colors ? a.ov.colors[slot] : fallback);

const TAU_E = Math.PI * 2;
export { TAU_E };

function drawPass(ox, oy, ground) {
  if (!movesLive()) return;
  for (let i = 0; i < actors.length; i++) {
    const a = actors[i];
    if (!a.on || (!ground && a.t < 0)) continue;
    const d = DRAWS[a.kind];
    if (!d) continue;
    // A kind draws on the floor (`ground`), over the actors, or both (`under` + `fn`).
    const fn = ground ? (d.under || (d.ground ? d.fn : null)) : (d.ground ? null : d.fn);
    if (!fn) continue;
    const sx = a.x + ox, sy = a.y + oy;
    if (!d.wide && (sx < -90 || sy < -110 || sx > VW + 90 || sy > VH + 90)) continue;
    fn(a, sx, sy, ox, oy);
  }
}

/** Under the actors: rings, tears, scars and lanes on the floor. */
export function drawMovesGround(ox, oy) { drawPass(ox, oy, true); }
/** Over the projectiles: everything else. */
export function drawMoves(ox, oy) { drawPass(ox, oy, false); }
