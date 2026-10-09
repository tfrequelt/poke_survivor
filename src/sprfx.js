// L2 -- may import L0-L1.
//
// Sprite effects: short animated sprites from the packed particles sheet (data/sprfx.js names
// them). The overloads use them for their trails, hits, kills and signature moments.
//
// They are pooled like every other entity (world.js), capped at CAP.sprFx alive, and spawning is
// rationed per simulation tick: a crowd of four hundred being hit by an overloaded swarm asks for
// thousands of sparks a second, and the cap is what keeps that a few dozen.

import { G } from './state.js';
import { spawn, sprFx, despawn } from './world.js';
import { SPRFX, SPRFX_KEYS, SPRFX_INDEX } from './data/sprfx.js';
import { getParticleIndex } from './assets.js';

/** Sprite effects allowed to start per simulation tick, everything together. */
const BUDGET = 40;
let budget = BUDGET;

/** Per kind: frame count, cell size and duration, resolved once the sheet's index is in. */
export const SPR_META = SPRFX_KEYS.map(() => null);
let resolved = false;

function resolve() {
  const idx = getParticleIndex();
  if (!idx) return false;
  SPRFX_KEYS.forEach((k, i) => {
    const d = SPRFX[k];
    const a = idx[d.src];
    if (!a) return;
    SPR_META[i] = { frames: a.frames, w: a.w, h: a.h, n: a.frames.length, dur: a.frames.length / (d.fps || 30), def: d };
  });
  resolved = true;
  return true;
}

/** Called at the start of every simulation tick. */
export function sprFxTick() { budget = BUDGET; }

/**
 * Start one effect. `kind` is a data/sprfx.js key; `color` recolours it (ignored for natural ones).
 * Optional: `scale`, `rot` (radians), `vx`/`vy` drift, `grav`. Returns the effect or null.
 */
export function spawnSpr(kind, x, y, color, scale = 0, rot = 0, vx = 0, vy = 0, grav = 0) {
  if (budget <= 0) return null;
  if (!resolved && !resolve()) return null;
  const k = SPRFX_INDEX[kind];
  if (k === undefined) return null;
  const meta = SPR_META[k];
  if (!meta) return null;
  const s = spawn('sprFx');
  if (!s) return null;
  budget--;
  s.kind = k;
  s.x = x; s.y = y; s.vx = vx; s.vy = vy; s.grav = grav;
  s.t = 0; s.dur = meta.dur;
  s.scale = scale || meta.def.scale || 1;
  s.rot = rot;
  s.color = meta.def.natural ? '' : (color || '#ffffff');
  return s;
}

/** A small burst: `n` of one effect scattered around (x, y), each drifting outward. */
export function burstSpr(kind, x, y, color, n, spread = 10, speed = 30) {
  for (let i = 0; i < n; i++) {
    const a = (i / n) * Math.PI * 2 + G.rngFx() * 0.6;
    const r = G.rngFx() * spread;
    if (!spawnSpr(kind, x + Math.cos(a) * r, y + Math.sin(a) * r, color, 0, a + Math.PI / 2,
      Math.cos(a) * speed, Math.sin(a) * speed)) return;
  }
}

export function updateSprFx(dt) {
  for (let i = sprFx.length - 1; i >= 0; i--) {
    const s = sprFx[i];
    s.t += dt;
    if (s.t >= s.dur) { despawn('sprFx', sprFx, i); continue; }
    s.vy += s.grav * dt;
    s.x += s.vx * dt;
    s.y += s.vy * dt;
  }
}
