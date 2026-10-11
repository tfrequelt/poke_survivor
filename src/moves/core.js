// L3 -- may import L0-L2. May NOT import enemies.js or weapons.js; damage goes through combat.js.
//
// The move framework: the actor pool every type's own weapons run on, and the helpers they share.
//
// A weapon whose delivery is not one of weapons.js's generic behaviours (a projectile, a cone, a
// zone...) is written as a MOVE: a firing function plugged into weapons.js's behaviour registry
// (extendBehaviors), and actors -- a fireball, an orb, a net, a tornado -- that live in the pool
// below with their own clocks. Each type has a module in this folder that registers its actor
// kinds' updates (STEP), what they do when their life runs out (END), and anything it has to do
// once a tick (PRE); its drawing lives in a matching draw_<type>.js on the render layer.
//
// An actor hits under its weapon's damage source, so its overload, its line in the damage
// breakdown and its type matchup all work exactly as they do for any other weapon.
//
// Enemy references are held by object and checked against `sn`, the enemy's spawn serial: the
// pool recycles enemy objects, and a twister must never fling a stranger that took the slot of
// the one it was holding.
//
// Kinds are numbers, allocated in blocks per module (see KIND below) so two modules never collide.

import { G } from '../state.js';
import { TAU, dist2, clampToBounds } from '../util.js';
import {
  enemies, cellRange, cellStart, cellItems, GW, nextHitId, setDamageSource, spawn,
} from '../world.js';
import { spawnSpr } from '../sprfx.js';
import { OVL_PARTICLES, ovlSprColor } from '../data/overloads.js';
import { waterAtWorld, nearestLand } from '../terrain.js';

/** The first actor kind of each module's block. A module numbers its own kinds from there. */
export const KIND = {
  dragon: 1, water: 100, ground: 140, normal: 180, electric: 220, dark: 260,
  grass: 300, flying: 340, ghost: 380, poison: 420, fire: 460, ice: 500,
};

/**
 * How much bigger a move's SPRITE gets as its area grows. The hitbox follows the area in full;
 * the drawing grows by under a third of that and never past 1.3x, so a maxed, overloaded weapon
 * still reads on screen instead of covering it. Rings that only outline the area may follow it.
 */
export const vk = (k) => Math.min(1.3, 1 + Math.max(0, (k || 1) - 1) * 0.3);

/**
 * How big an AREA is drawn: a pool, a field, a well on the floor. Up to 26px it is drawn as it
 * reaches; past that the drawing grows by about a third of the rest, so a maxed, overloaded field
 * still hits all it reaches without a coloured disc over a third of the screen. `va` is the alpha
 * to draw it at: the bigger it reaches, the fainter.
 */
export const vr = (r) => (r <= 26 ? r : 26 + (r - 26) * 0.35);
export const va = (r) => (r <= 26 ? 1 : Math.max(0.45, Math.pow(26 / r, 0.6)));

/** kind -> fn(a, dt, p): one tick of an actor. */
export const STEP = [];
/** kind -> fn(a): its life has run out (before it is freed). */
export const END = [];
/** fn(dt, p): once a tick, before the actors, for a module's per-weapon clocks. */
const PRE = [];
/** fn(): a new run. */
const RESET = [];

/** A type module registers itself: its kinds' steps and ends, and its per-tick and reset hooks. */
export function registerMoves({ step = {}, end = {}, pre = null, reset = null }) {
  for (const k of Object.keys(step)) STEP[k] = step[k];
  for (const k of Object.keys(end)) END[k] = end[k];
  if (pre) PRE.push(pre);
  if (reset) RESET.push(reset);
}

const CAP = 220;
export const actors = [];
for (let i = 0; i < CAP; i++) {
  actors.push({
    on: false, kind: 0, src: 0, def: null, ov: null, w: null,
    x: 0, y: 0, z: 0, z0: 0, vx: 0, vy: 0, ox: 0, oy: 0, tx: 0, ty: 0, bx: 0, by: 0, a: 0,
    t: 0, life: 0, dmg: 0, r: 0, area: 1, knock: 0, hitId: 0, hit2: 0,
    n: 0, k: 0, phase: 0, step: 0, idx: 0, crit: false, done: false, fixed: false, fxT: 0, ptT: 0,
    target: null, tsn: 0, spr: -1,
    // Held enemies (twister, time ring, rush, anchor): the enemy, its serial, two numbers each.
    held: [], heldSn: [], heldA: [], heldB: [],
    // Points (Fault Lines' polygon).
    pts: [],
  });
}
let live = 0;

export function take(kind, w) {
  if (live >= CAP) return null;
  for (let i = 0; i < CAP; i++) {
    const a = actors[i];
    if (a.on) continue;
    live++;
    a.on = true;
    a.kind = kind;
    a.src = w.srcId;
    a.def = w.def;
    a.ov = w.ovl || null;
    a.w = w.w || w;
    a.x = a.y = a.z = a.z0 = a.vx = a.vy = a.ox = a.oy = a.tx = a.ty = a.bx = a.by = a.a = 0;
    a.t = 0; a.life = 1; a.dmg = 0; a.r = 0; a.area = 1; a.knock = 0;
    a.hitId = nextHitId(); a.hit2 = 0;
    a.n = 0; a.k = 0; a.phase = 0; a.step = 0; a.idx = 0;
    a.crit = false; a.done = false; a.fixed = false; a.fxT = 0; a.ptT = 0;
    a.target = null; a.tsn = 0; a.spr = -1;
    a.held.length = 0; a.heldSn.length = 0; a.heldA.length = 0; a.heldB.length = 0;
    a.pts.length = 0;
    return a;
  }
  return null;
}

/**
 * The owner to `take` an actor from inside an overload's hit or kill hook: it hits under the
 * overload's proc source, as the hook itself does. An actor taken under the weapon's own source
 * would set the same hook off again with every hit it lands, and feed on itself.
 */
export const procOf = (rec) => ({ srcId: rec.proc, def: rec.w.def, ovl: rec.w.ovl, w: rec.w });

/** An actor spawned by another: same weapon, same source, same overload. */
export const child = (kind, a) => take(kind, { srcId: a.src, def: a.def, ovl: a.ov, w: a.w });

export function free(a) {
  if (!a.on) return;
  a.on = false;
  a.target = null;
  a.w = null;
  a.held.length = 0;
  live--;
}

export function resetMoves() {
  for (let i = 0; i < CAP; i++) { const a = actors[i]; a.on = false; a.target = null; a.w = null; a.held.length = 0; }
  live = 0;
  G.dilate = 1;
  for (const fn of RESET) fn();
}

export const movesLive = () => live;
export const MOVE_CAP = CAP;

/** An overload's mechanic block (`ov.move[name]`, or the Dragon line's `ov.dragon[name]`), or null. */
export const mech = (ov, name) => (ov && ((ov.move && ov.move[name]) || (ov.dragon && ov.dragon[name]))) || null;

/** The sum of one level key over the levels a weapon has reached (its own keys, not weaponStats'). */
export function lvSum(w, key) {
  let s = 0;
  const lv = w.def.levels;
  for (let i = 1; i <= w.level - 1; i++) if (lv[i] && lv[i][key]) s += lv[i][key];
  return s;
}

// --- Finding enemies -------------------------------------------------------------------------

export function nearest(x, y, range, skipList) {
  const r = cellRange(x, y, range);
  if (!r) return null;
  let best = null, bd = range * range;
  for (let gy = r.y0; gy <= r.y1; gy++) {
    const row = gy * GW;
    for (let gx = r.x0; gx <= r.x1; gx++) {
      const c = row + gx;
      for (let k = cellStart[c]; k < cellStart[c + 1]; k++) {
        const e = enemies[cellItems[k]];
        if (!e.alive || e.prop || e.charmT > 0 || e.harmless) continue;
        if (skipList && skipList.includes(e)) continue;
        const d = dist2(x, y, e.x, e.y);
        if (d < bd) { bd = d; best = e; }
      }
    }
  }
  return best;
}

/** The enemy with the most health left within range: a comet's target. */
export function toughest(x, y, range) {
  const r = cellRange(x, y, range);
  if (!r) return null;
  let best = null, hp = -1;
  for (let gy = r.y0; gy <= r.y1; gy++) {
    for (let gx = r.x0; gx <= r.x1; gx++) {
      const c = gy * GW + gx;
      for (let k = cellStart[c]; k < cellStart[c + 1]; k++) {
        const e = enemies[cellItems[k]];
        if (!e.alive || e.prop || e.charmT > 0 || e.harmless) continue;
        if (dist2(x, y, e.x, e.y) > range * range) continue;
        if (e.hp > hp) { hp = e.hp; best = e; }
      }
    }
  }
  return best;
}

const _picked = [];
/** Up to n different enemies, nearest first. Fills and returns a shared array. */
export function nearestN(x, y, range, n) {
  _picked.length = 0;
  for (let i = 0; i < n; i++) {
    const e = nearest(x, y, range, _picked);
    if (!e) break;
    _picked.push(e);
  }
  return _picked;
}

/** Call fn(e) for every live, hittable enemy within r of (x, y). */
export function each(x, y, r, fn) {
  const range = cellRange(x, y, r);
  if (!range) return;
  for (let gy = range.y0; gy <= range.y1; gy++) {
    const row = gy * GW;
    for (let gx = range.x0; gx <= range.x1; gx++) {
      const c = row + gx;
      for (let k = cellStart[c]; k < cellStart[c + 1]; k++) {
        const e = enemies[cellItems[k]];
        if (!e.alive || e.prop || e.charmT > 0) continue;
        const rr = r + e.r;
        if (dist2(x, y, e.x, e.y) > rr * rr) continue;
        fn(e);
      }
    }
  }
}

/**
 * True the first time actor `a` strikes `e` (`tag` tells apart parts of one actor, up to 4). The
 * enemy's own lastHitId cannot do this for actors that overlap: each overwrites the other's id
 * and both hit again every frame. Uses `held`, so only for actors that hold nothing.
 */
export function once(a, e, tag = 0) {
  const k = e.sn * 4 + tag;
  for (let i = 0; i < a.held.length; i++) if (a.held[i] === e && a.heldSn[i] === k) return false;
  a.held.push(e); a.heldSn.push(k);
  return true;
}

/**
 * A foe-keyed list on a weapon, for a mechanic that remembers foes between hits:
 * [enemy, serial, until, n] per foe. `mark` adds or refreshes one and returns its index (-1 when
 * the list is full); `eachMarked` walks the live ones, pruning the dead and the expired.
 */
export function mark(w, key, e, t, max = 40) {
  let L = w[key];
  if (!L) L = w[key] = [];
  for (let i = 0; i < L.length; i += 4) if (L[i] === e && L[i + 1] === e.sn) { L[i + 2] = G.clock + t; return i; }
  if (L.length >= max * 4) return -1;
  L.push(e, e.sn, G.clock + t, 0);
  return L.length - 4;
}
export function eachMarked(w, key, fn, gone) {
  const L = w[key];
  if (!L) return;
  for (let i = L.length - 4; i >= 0; i -= 4) {
    const e = L[i];
    if (!e.alive || e.sn !== L[i + 1] || G.clock > L[i + 2]) { if (gone) gone(e, i, L); L.splice(i, 4); continue; }
    fn(e, i, L);
  }
}

/** Something that may be picked up, thrown or moved about: not a boss, legend or scenery. */
export const movable = (e) => !e.boss && !e.legend && !e.prop;

/** The way the player is heading: their movement, else the nearest foe, else their facing. */
export function heading(p, range) {
  if (p.vx * p.vx + p.vy * p.vy > 16) return Math.atan2(p.vy, p.vx);
  const e = nearest(p.x, p.y, range);
  if (e) return Math.atan2(e.y - p.y, e.x - p.x);
  return p.dir ? 0 : Math.PI;
}

/** Keep a moved enemy on the floor and out of the water it cannot walk in. */
export function settle(e) {
  clampToBounds(e, G.bounds, e.r + 2);
  if (!e.flying && waterAtWorld(e.x, e.y)) { const l = nearestLand(e.x, e.y); e.x = l.x; e.y = l.y; }
}

// --- An overload's look on the actors -------------------------------------------------------
//
// Every actor of an overloaded weapon leaves its overload's own sprite trail and pixel particles,
// paced per actor and sharing the frame budgets the rest of the game uses. The colours of the
// actors themselves are the renderer's (entities.js recolours the animation strips).

let ptBudget = 0;
export function resetLookBudget() { ptBudget = 24; }
export function ovLook(a, dt, gap) {
  const ov = a.ov;
  if (!ov || !ov.fx) return;
  a.fxT -= dt;
  if (a.fxT <= 0 && ov.fx.spr) {
    a.fxT = gap;
    const kind = ov.fx.spr.trail || ov.fx.spr.hit;
    if (kind) spawnSpr(kind, a.x + (G.rngFx() - 0.5) * 8, a.y - a.z - 4 + (G.rngFx() - 0.5) * 8, ovlSprColor(ov, G.clock, 1), 0.8);
  }
  a.ptT -= dt;
  if (a.ptT <= 0 && ov.fx.particles && ptBudget > 0) {
    a.ptT = gap * 0.6;
    const P = OVL_PARTICLES[ov.fx.particles];
    const q = P && spawn('particles');
    if (!q) return;
    ptBudget--;
    q.x = a.x + (G.rngFx() - 0.5) * 10;
    q.y = a.y - a.z - 4 + (G.rngFx() - 0.5) * 10;
    q.vx = (G.rngFx() - 0.5) * P.spread;
    q.vy = P.vy + (G.rngFx() - 0.5) * P.spread * 0.5;
    q.maxLife = q.life = P.life * (0.7 + G.rngFx() * 0.6);
    q.size = P.size;
    q.color = ov.colors ? ov.colors[(G.rngFx() * 3) | 0] : P.colors[0];
    q.grav = P.grav;
    q.sprId = -1;
  }
}

/** An overload's proc sprite at a point, in its accent colour. */
export function ovProc(a, x, y, scale = 1) {
  const s = a.ov && a.ov.fx && a.ov.fx.spr;
  if (s && s.proc) spawnSpr(s.proc, x, y, ovlSprColor(a.ov, G.clock, 2), scale);
}


// --- The tick ----------------------------------------------------------------------------------

export function updateMoves(dt) {
  const p = G.player;
  resetLookBudget();
  // Time Dilation (Roar of Time) is re-established every tick by whatever still grants it.
  G.dilate = 1;
  for (let i = 0; i < PRE.length; i++) PRE[i](dt, p);
  if (!live) return;
  for (let i = 0; i < CAP; i++) {
    const a = actors[i];
    if (!a.on) continue;
    setDamageSource(a.src);
    a.t += dt;
    const step = STEP[a.kind];
    if (step) step(a, dt, p);
    if (a.on && a.t >= a.life) {
      const end = END[a.kind];
      if (end) end(a);
      free(a);
    }
  }
  setDamageSource(0);
}

export { TAU, dist2, nextHitId };
