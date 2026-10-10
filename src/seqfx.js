// L2 -- may import L0-L1.
//
// Sequence effects: one of the manifest's ripped animations (assets.getSequence) played at a
// point, once or looped, for the dragon weapons and Axew's two abilities. A sprite effect
// (sprfx.js) is a small spark from the packed particles sheet; this is a whole move's animation,
// at its own size or scaled, optionally turned to a heading.
//
// Pooled in a fixed array of plain objects and capped, like everything else spawned per hit. The
// renderer (entities.js) draws them; this file only keeps their clocks.

/** How an effect plays. */
export const SEQ = {
  ONCE: 0,      // every frame once over `dur`, then gone
  LOOP: 1,      // looping at `fps` until `dur` runs out, fading over the last fifth
  JAWS: 2,      // Crunch: the two jaws closing on the point (drawn, not a strip)
  METEOR: 3,    // Draco Meteor: the burning rock falling to the point from `z` up
};

const CAP = 140;
/** Started per simulation tick, all together. */
const BUDGET = 40;
let budget = BUDGET;

export const seqFx = [];
for (let i = 0; i < CAP; i++) {
  seqFx.push({ on: false, name: '', mode: 0, x: 0, y: 0, z: 0, t: 0, dur: 0, fps: 12, scale: 1, rot: 0, alpha: 1, frame0: 0, vx: 0, vy: 0 });
}
let live = 0;

export function seqTick() { budget = BUDGET; }

/**
 * Start one. `opts`: mode (SEQ), dur (s), fps, scale, rot (radians; 0 draws it upright), z (height
 * above the point: a meteor's start, or a lift), alpha, vx/vy drift. Returns it, or null when the
 * pool or this tick's budget is spent -- an effect is never worth a stutter.
 */
export function spawnSeq(name, x, y, opts) {
  if (budget <= 0 || live >= CAP) return null;
  for (let i = 0; i < CAP; i++) {
    const s = seqFx[i];
    if (s.on) continue;
    budget--;
    live++;
    s.on = true;
    s.name = name;
    s.x = x; s.y = y;
    s.mode = (opts && opts.mode) || SEQ.ONCE;
    s.dur = (opts && opts.dur) || 0.5;
    s.fps = (opts && opts.fps) || 14;
    s.scale = (opts && opts.scale) || 1;
    s.rot = (opts && opts.rot) || 0;
    s.z = (opts && opts.z) || 0;
    s.alpha = opts && opts.alpha !== undefined ? opts.alpha : 1;
    s.vx = (opts && opts.vx) || 0;
    s.vy = (opts && opts.vy) || 0;
    s.frame0 = (opts && opts.frame0) || 0;
    s.t = 0;
    return s;
  }
  return null;
}

export function updateSeqFx(dt) {
  if (!live) return;
  for (let i = 0; i < CAP; i++) {
    const s = seqFx[i];
    if (!s.on) continue;
    s.t += dt;
    s.x += s.vx * dt;
    s.y += s.vy * dt;
    if (s.t >= s.dur) { s.on = false; live--; }
  }
}

export function resetSeqFx() {
  for (let i = 0; i < CAP; i++) seqFx[i].on = false;
  live = 0;
  budget = BUDGET;
}

/** How many are playing, for the probes. */
export const seqLive = () => live;
