// L3 -- may import L0-L2. May NOT import enemies.js or weapons.js; damage goes through combat.js.
//
// The Dragon type's eight weapons. Each is a behaviour with a body of its own -- a fireball that
// becomes a pillar, an orb that throbs, sparks that dance and dive, a crescent that charges and
// carries what it hits, claw rakes, a wandering twister, a tear in space, a ring of stopped time
// -- none of which is a projectile, an aura or a zone of the kinds weapons.js already has. So
// they live here, as a small pool of ACTORS with their own clocks, and main.js plugs the eight
// firing functions into weapons.js's behaviour registry at boot (extendBehaviors).
//
// Their overloads are mechanics of their own too, read from the overload's `dragon` block: each
// names one mechanic (`dragon.wildfire`, `dragon.mirror`, ...) with its numbers. None is a plain
// damage or projectile bump, and none is a signature another weapon already has.
//
// An actor hits under its weapon's damage source, so a dragon weapon's overload, its line in the
// damage breakdown and its type matchup all work exactly as they do for any other weapon. The
// renderer (entities.js) draws the actors from dragon_moves.png's own animations, recoloured in
// the overload's palette when there is one.
//
// Enemy references are held by object and checked against `sn`, the enemy's spawn serial: the
// pool recycles enemy objects, and a twister must never fling a stranger that took the slot of
// the one it was holding.

import { G } from './state.js';
import { TAU, dist2, clampToBounds } from './util.js';
import {
  enemies, projectiles, cellRange, cellStart, cellItems, GW, nextHitId, setDamageSource, spawn,
} from './world.js';
import { damageEnemy, damageCircle, damageLine, critCtx } from './combat.js';
import { spawnSpr } from './sprfx.js';
import { spawnSeq } from './seqfx.js';
import { OVL_PARTICLES, ovlSprColor } from './data/overloads.js';
import { spriteBase, spriteDirs } from './sprites.js';
import { waterAtWorld, nearestLand } from './terrain.js';

/** Actor kinds. The renderer switches on these. */
export const DK = {
  RAGE: 1,      // Dragon Rage's fireball in flight
  PILLAR: 2,    // ...and the flame pillar it bursts into
  PULSE: 3,     // a Dragon Pulse orb
  SPARK: 4,     // a Dragon Dance spark
  RUSH: 5,      // Dragon Rush's phantom crescent
  ROCK: 6,      // a rock it flung, or one falling into a crater
  RAKE: 7,      // one Dragon Claw rake
  TWISTER: 8,
  REND: 9,      // a Spacial Rend tear
  LOCK: 10,     // a Roar of Time ring
  // Left behind by the overloads.
  CRATER: 11,   // Meteor Charge
  LANE: 12,     // Phantom Lane
  SCAR: 13,     // Crosshatch's X
  PRINT: 14,    // Static Steps' footprint
  AFTER: 15,    // Afterimage's dancing copy of you
  DEBRIS: 16,   // Debris Storm: a flung foe in flight
  VINE: 17,     // Bramble Wind's roots
  FAULT: 18,    // Fault Lines' rift polygon
  GEAR: 19,     // Clockwork Gears' rolling saw
};

const CAP = 220;
export const dragonActors = [];
for (let i = 0; i < CAP; i++) {
  dragonActors.push({
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

function take(kind, w) {
  if (live >= CAP) return null;
  for (let i = 0; i < CAP; i++) {
    const a = dragonActors[i];
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

/** An actor spawned by another: same weapon, same source, same overload. */
const child = (kind, a) => take(kind, { srcId: a.src, def: a.def, ovl: a.ov, w: a.w });

function free(a) {
  if (!a.on) return;
  a.on = false;
  a.target = null;
  a.w = null;
  a.held.length = 0;
  live--;
}

export function resetDragon() {
  for (let i = 0; i < CAP; i++) { const a = dragonActors[i]; a.on = false; a.target = null; a.w = null; a.held.length = 0; }
  live = 0;
  lastHp = -1;
  G.dilate = 1;
}

export const dragonLive = () => live;

/** An overload's mechanic block (`ov.dragon[name]`), or null. */
const mech = (ov, name) => (ov && ov.dragon && ov.dragon[name]) || null;

/** The sum of one level key over the levels a weapon has reached (its own keys, not weaponStats'). */
function lvSum(w, key) {
  let s = 0;
  const lv = w.def.levels;
  for (let i = 1; i <= w.level - 1; i++) if (lv[i] && lv[i][key]) s += lv[i][key];
  return s;
}

// --- Finding enemies -------------------------------------------------------------------------

function nearest(x, y, range, skipList) {
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
function toughest(x, y, range) {
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
function nearestN(x, y, range, n) {
  _picked.length = 0;
  for (let i = 0; i < n; i++) {
    const e = nearest(x, y, range, _picked);
    if (!e) break;
    _picked.push(e);
  }
  return _picked;
}

/** Call fn(e) for every live, hittable enemy within r of (x, y). */
function each(x, y, r, fn) {
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

/** Something that may be picked up, thrown or moved about: not a boss, legend or scenery. */
const movable = (e) => !e.boss && !e.legend && !e.prop;

/** The way the player is heading: their movement, else the nearest foe, else their facing. */
function heading(p, range) {
  if (p.vx * p.vx + p.vy * p.vy > 16) return Math.atan2(p.vy, p.vx);
  const e = nearest(p.x, p.y, range);
  if (e) return Math.atan2(e.y - p.y, e.x - p.x);
  return p.dir ? 0 : Math.PI;
}

/** Keep a moved enemy on the floor and out of the water it cannot walk in. */
function settle(e) {
  clampToBounds(e, G.bounds, e.r + 2);
  if (!e.flying && waterAtWorld(e.x, e.y)) { const l = nearestLand(e.x, e.y); e.x = l.x; e.y = l.y; }
}

// --- An overload's look on the actors -------------------------------------------------------
//
// Every actor of an overloaded weapon leaves its overload's own sprite trail and pixel particles,
// paced per actor and sharing the frame budgets the rest of the game uses. The colours of the
// actors themselves are the renderer's (entities.js recolours the animation strips).

let ptBudget = 0;
function ovLook(a, dt, gap) {
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
function ovProc(a, x, y, scale = 1) {
  const s = a.ov && a.ov.fx && a.ov.fx.spr;
  if (s && s.proc) spawnSpr(s.proc, x, y, ovlSprColor(a.ov, G.clock, 2), scale);
}

/** The fixed-damage circle: Dragon Rage ignores armour and type, and never crits. */
function fixedCircle(a, x, y, r, knock) {
  const grudge = mech(a.ov, 'grudge');
  let n = 0;
  each(x, y, r, (e) => {
    if (e.lastHitId === a.hitId) return;
    e.lastHitId = a.hitId;
    const d = Math.hypot(e.x - x, e.y - y) || 1;
    // Grudge Flame: a share of what the foe can take, never less than the move's own number.
    const dmg = grudge ? Math.max(a.dmg, e.maxHp * (e.boss || e.legend ? grudge.boss : grudge.pct)) : a.dmg;
    damageEnemy(e, dmg, ((e.x - x) / d) * knock, ((e.y - y) / d) * knock, false, true);
    n++;
  });
  return n;
}

// --- Firing (plugged into weapons.js's BEHAVIOR) --------------------------------------------

export const DRAGON_BEHAVIOR = {
  /** Dragon Rage: fireballs at the nearest foe, fanned when there are several. */
  rage(w, st, p) {
    const def = w.def;
    const t = nearest(p.x, p.y, def.range * st.range);
    if (!t) return false;
    const base = Math.atan2(t.y - p.y, t.x - p.x);
    const n = Math.max(1, Math.round(st.amount));
    const reach = Math.hypot(t.x - p.x, t.y - p.y);
    // Revenge Blaze: the shot a hit on you has primed is twice the size.
    const big = w.revenge ? (mech(w.ovl, 'revenge') || {}).scale || 2 : 1;
    w.revenge = false;
    for (let i = 0; i < n; i++) {
      const a = take(DK.RAGE, w);
      if (!a) break;
      const ang = n === 1 ? base : base + (i - (n - 1) / 2) * def.spread;
      a.x = p.x; a.y = p.y - 6; a.ox = p.x; a.oy = p.y;
      a.vx = Math.cos(ang) * st.speed; a.vy = Math.sin(ang) * st.speed;
      a.a = ang;
      a.k = reach + 6;                       // bursts on reaching the target's spot, at the latest
      a.life = st.duration;
      a.dmg = st.damage * (big > 1 ? 1.5 : 1); a.area = st.area * big; a.r = def.r * a.area;
      a.knock = def.knockback * st.knock;
    }
    return true;
  },

  /** Dragon Pulse: slow orbs that throb as they roll. */
  pulseOrb(w, st, p) {
    const def = w.def;
    const t = nearest(p.x, p.y, def.range * st.range);
    if (!t) return false;
    const base = Math.atan2(t.y - p.y, t.x - p.x);
    const n = Math.max(1, Math.round(st.amount));
    for (let i = 0; i < n; i++) {
      const a = take(DK.PULSE, w);
      if (!a) break;
      const ang = n === 1 ? base : base + (i - (n - 1) / 2) * def.spread;
      a.x = p.x; a.y = p.y;
      a.vx = Math.cos(ang) * st.speed; a.vy = Math.sin(ang) * st.speed;
      a.life = st.duration;
      a.dmg = st.damage; a.area = st.area; a.r = def.r * st.area; a.z0 = a.r;
      a.knock = def.knockback * st.knock;
      a.k = 0.05 + i * 0.07;                 // first throb almost at once, and not in unison
      a.phase = (G.rngFx() * 9) | 0;
    }
    return true;
  },

  /**
   * Dragon Dance: one step. The dance grows the sparks -- 3 plus the steps you are into it -- and
   * each step leaves you a little faster for a few seconds, up to its maximum.
   */
  dance(w, st, p) {
    const def = w.def;
    if (!nearest(p.x, p.y, def.range * st.range)) return false;
    const max = (def.stepMax || 3) + lvSum(w, 'stepMax');
    w.danceN = Math.min(max, (w.danceN || 0) + 1);
    w.danceT = (def.stepT || 3) + lvSum(w, 'stepT');
    const per = (def.stepHaste || 0.06) + lvSum(w, 'stepHaste');
    const mul = 1 + per * w.danceN;
    p.hasteMul = p.hasteT > 0 ? Math.max(p.hasteMul, mul) : mul;
    p.hasteT = Math.max(p.hasteT, w.danceT);
    const full = w.danceN >= max;
    const n = 3 + w.danceN;
    spawnSeq('fx_dance_ring', p.x, p.y + 2, { dur: 0.6, fps: 16, scale: 0.9 + w.danceN * 0.12 });
    if (full) spawnSpr('ring_blade', p.x, p.y - 6, '#ffd166', 1.6);

    // Grand Finale: a full dance ends in one comet onto the toughest foe, and starts over.
    const fin = full && mech(w.ovl, 'finale');
    if (fin) {
      const a = sparkFrom(w, st, p.x, p.y, 0, 0);
      if (a) {
        a.dmg = st.damage * n; a.r = (fin.r || 40) * st.area; a.z0 = 70; a.k = 0.45; a.step = 0.25;
        a.crit = true;                         // drawn as the comet
        a.target = toughest(p.x, p.y, 260); a.tsn = a.target ? a.target.sn : 0;
      }
      w.danceN = 0;
      return true;
    }
    for (let i = 0; i < n; i++) {
      const ang = (i / n) * TAU + G.rngFx() * 0.4;
      sparkFrom(w, st, Math.cos(ang) * (8 + G.rngFx() * 6), Math.sin(ang) * (5 + G.rngFx() * 4), i, ang);
    }
    // Afterimage: a copy of you is left dancing where you stood, and it throws sparks of its own.
    const aft = mech(w.ovl, 'afterimage');
    if (aft) {
      const a = take(DK.AFTER, w);
      if (a) {
        a.x = p.x; a.y = p.y; a.life = aft.t || 2;
        a.spr = p.sprBase + p.frame * p.nd + p.dir;
        a.n = Math.max(2, n >> 1);
        a.dmg = st.damage; a.area = st.area; a.r = def.r * st.area; a.knock = def.knockback * st.knock;
      }
    }
    return true;
  },

  /**
   * Dragon Rush: one crescent from behind you, through you and out ahead. What it strikes is
   * pinned to its edge and carried, then slammed down where the charge ends.
   */
  rush(w, st, p) {
    const def = w.def;
    // Dragon's Wake carries you with it, so it waits until you have been on the move a moment:
    // standing still (or only just setting off) must never drag you into the crowd.
    const wk = mech(w.ovl, 'wake');
    if (wk && (w.moveT || 0) < (wk.after || 0.3)) return false;
    const ang = heading(p, def.range * st.range);
    const a = take(DK.RUSH, w);
    if (!a) return true;
    a.a = ang;
    const back = 60;
    a.x = p.x - Math.cos(ang) * back; a.y = p.y - Math.sin(ang) * back;
    a.ox = a.x; a.oy = a.y;
    a.vx = Math.cos(ang) * st.speed; a.vy = Math.sin(ang) * st.speed;
    a.k = back + (def.range + lvSum(w, 'reach')) * st.range;    // the whole run
    const rocks = (def.rocks || 3) + lvSum(w, 'rocks');
    a.step = a.k / (rocks + 1);                // distance between rocks
    a.idx = rocks;
    a.n = 0;                                   // distance run
    a.dmg = st.damage; a.area = st.area; a.r = def.r * st.area;
    a.knock = def.knockback * st.knock;
    a.life = 3;
    a.z = (def.carry || 4) + lvSum(w, 'carry');                  // how many it can carry
    a.tx = (def.slamDmg || 1.6) + lvSum(w, 'slamDmg');            // the slam, as a share
    return true;
  },

  /** Dragon Claw: rakes across the nearest foes, one after another. */
  rake(w, st, p) {
    const def = w.def;
    const n = Math.max(1, Math.round(st.amount));
    const targets = nearestN(p.x, p.y, def.range * st.range, n);
    if (!targets.length) return false;
    const gale = mech(w.ovl, 'gale');
    const cross = mech(w.ovl, 'crosshatch');
    const rakes = def.rakes || 3;
    for (let k = 0; k < targets.length; k++) {
      const e = targets[k];
      // Across the foe, diagonally: the stroke a claw makes, not a line from you to it.
      const ang = Math.atan2(e.y - p.y, e.x - p.x) + Math.PI / 2 + 0.5 * (k & 1 ? -1 : 1);
      const len = (def.rakeLen || 50) * st.area * (gale ? gale.len : 1);
      const width = def.r * st.area * (gale ? gale.thin : 1);
      laySet(w, st, e, ang, len, width, rakes, k * 0.05);
      // Crosshatch: a second set across the first, and an X scar where they meet.
      if (cross) {
        laySet(w, st, e, ang + Math.PI / 2, len, width, rakes, k * 0.05 + rakes * (def.rakeGap || 0.08), 0.5);
        const s = take(DK.SCAR, w);
        if (s) {
          s.x = e.x; s.y = e.y; s.life = cross.t || 2; s.a = ang;
          s.r = (cross.r || 14) * st.area; s.dmg = st.damage * (cross.dmg || 0.25);
        }
      }
    }
    return true;
  },

  /** Twister: a tornado set loose near you, heading for the crowd. */
  twister(w, st, p) {
    const def = w.def;
    const t = nearest(p.x, p.y, def.range * st.range);
    const n = Math.max(1, Math.round(st.amount));
    const base = t ? Math.atan2(t.y - p.y, t.x - p.x) : G.rngRun() * TAU;
    for (let i = 0; i < n; i++) {
      const a = take(DK.TWISTER, w);
      if (!a) break;
      const ang = base + i * (TAU / n);
      a.x = p.x + Math.cos(ang) * 26; a.y = p.y + Math.sin(ang) * 26;
      a.a = ang;
      a.vx = st.speed;
      a.life = st.duration;
      a.dmg = st.damage; a.area = st.area; a.r = def.r * st.area;
      a.knock = def.knockback * st.knock;
      a.k = 0;                                  // damage clock
      a.step = 0;                               // steering clock
      a.n = def.lift || 5;
      a.z0 = 0;                                 // merges so far
    }
    return true;
  },

  /** Spacial Rend: a tear opened on a foe. */
  rend(w, st, p) {
    const def = w.def;
    const t = nearest(p.x, p.y, def.range * st.range);
    if (!t) return false;
    const a = take(DK.REND, w);
    if (!a) return true;
    a.x = t.x; a.y = t.y;
    a.n = Math.max(2, Math.round(st.amount));
    a.k = (def.reach || 58) * st.area;
    a.dmg = st.damage; a.area = st.area; a.r = def.r * st.area;
    a.phase = 1;
    a.life = 0.6 + 0.5 + 0.15;
    const anc = mech(a.ov, 'anchor');
    if (anc) a.life += anc.t || 3;            // the chains outlast the slash
    a.a = G.rngFx() * TAU;
    a.hit2 = nextHitId();
    return true;
  },

  /** Roar of Time: a ring of stopped time on the crowd. */
  timelock(w, st, p) {
    const def = w.def;
    const t = nearest(p.x, p.y, def.range * st.range);
    if (!t) return false;
    const a = take(DK.LOCK, w);
    if (!a) return true;
    a.x = t.x; a.y = t.y;
    a.r = def.r * st.area;
    a.life = st.duration;
    a.dmg = st.damage; a.area = st.area;
    a.knock = def.knockback * st.knock;
    a.k = def.tick || 0.4;
    return true;
  },
};

/** One Dragon Dance spark, rising from (dx, dy) off the player -- or, `fixed`, off a point. */
function sparkFrom(w, st, dx, dy, i, ang) {
  const a = take(DK.SPARK, w);
  if (!a) return null;
  const p = G.player;
  a.a = ang;
  a.ox = dx; a.oy = dy;
  a.x = p.x + dx; a.y = p.y + dy;
  a.z0 = 34 + G.rngFx() * 16;
  a.k = 0.3;                                // rising for this long
  a.step = 0.12 + i * 0.05;                 // then hangs this long
  a.idx = i & 1;                            // orange or cyan
  a.dmg = st.damage; a.area = st.area; a.r = w.def.r * st.area;
  a.knock = w.def.knockback * st.knock;
  a.life = 4;
  a.vx = st.speed;
  return a;
}

/** One set of claw rakes across `e`, starting `delay` seconds from now. */
function laySet(w, st, e, ang, len, width, rakes, delay, share = 1) {
  const def = w.def;
  const nx = -Math.sin(ang), ny = Math.cos(ang);
  for (let j = 0; j < rakes; j++) {
    const a = take(DK.RAKE, w);
    if (!a) break;
    const off = (j - (rakes - 1) / 2) * 7 * st.area;
    a.a = ang;
    a.x = e.x + nx * off - Math.cos(ang) * len / 2;
    a.y = e.y + ny * off - Math.sin(ang) * len / 2;
    a.k = len;
    a.t = -(j * (def.rakeGap || 0.08) + delay);
    a.life = 0.32;
    a.dmg = st.damage * share; a.area = st.area; a.r = width;
    a.knock = def.knockback * st.knock;
    a.crit = j === rakes - 1;               // the last rake of every set crits
    a.target = e; a.tsn = e.sn;
  }
}

// --- The actors -------------------------------------------------------------------------------

/** The player's health a tick ago, so Revenge Blaze can tell when you have been hit. */
let lastHp = -1;

export function updateDragon(dt) {
  const p = G.player;
  ptBudget = 24;
  // Dance steps wear off a while after the last one; a hit on you primes Revenge Blaze.
  const hurt = p && lastHp >= 0 && p.hp < lastHp - 0.5;
  if (p) lastHp = p.hp;
  for (let i = 0; i < G.weapons.length; i++) {
    const w = G.weapons[i];
    if (w.danceT > 0) { w.danceT -= dt; if (w.danceT <= 0) w.danceN = 0; }
    // How long you have been moving without stopping (Dragon's Wake waits for it).
    w.moveT = p && p.moving ? (w.moveT || 0) + dt : 0;
    if (hurt && mech(w.ovl, 'revenge') && !w.revenge) {
      w.revenge = true;
      w.cd = 0;
      if (p) spawnSpr('flash_burst', p.x, p.y - 10, '#5ab6ff', 1.3);
    }
    // Static Steps: hastened, every footfall leaves a crackling print.
    const st = mech(w.ovl, 'static');
    if (st && p && p.hasteT > 0 && p.moving) {
      w.printT = (w.printT || 0) - dt;
      if (w.printT <= 0) {
        w.printT = st.gap || 0.16;
        const a = take(DK.PRINT, w);
        if (a) {
          w.printSide = -(w.printSide || 1);
          const h = Math.atan2(p.vy, p.vx) + Math.PI / 2;
          a.x = p.x + Math.cos(h) * 3 * w.printSide; a.y = p.y + 2 + Math.sin(h) * 3 * w.printSide;
          a.life = st.life || 2; a.r = st.r || 12;
          a.dmg = w.resolved.damage * (st.dmg || 0.4);
          a.idx = w.printSide > 0 ? 1 : 0; a.a = h;
          a.k = 0.05;
        }
      }
    }
  }
  // Time Dilation: while any ring of it stands, every weapon you own fires faster.
  G.dilate = 1;
  if (!live) return;
  for (let i = 0; i < CAP; i++) {
    const a = dragonActors[i];
    if (!a.on) continue;
    setDamageSource(a.src);
    a.t += dt;
    switch (a.kind) {
      case DK.RAGE: rageStep(a, dt); break;
      case DK.PILLAR: pillarStep(a, dt); break;
      case DK.PULSE: pulseStep(a, dt); break;
      case DK.SPARK: sparkStep(a, dt, p); break;
      case DK.RUSH: rushStep(a, dt, p); break;
      case DK.ROCK: rockStep(a); break;
      case DK.RAKE: rakeStep(a); break;
      case DK.TWISTER: twisterStep(a, dt); break;
      case DK.REND: rendStep(a, dt); break;
      case DK.LOCK: lockStep(a, dt); break;
      case DK.CRATER: craterStep(a, dt); break;
      case DK.LANE: laneStep(a); break;
      case DK.SCAR: case DK.PRINT: tickZone(a, dt); break;
      case DK.AFTER: afterStep(a); break;
      case DK.DEBRIS: debrisStep(a, dt); break;
      case DK.VINE: vineStep(a); break;
      case DK.FAULT: faultStep(a, dt); break;
      case DK.GEAR: gearStep(a, dt); break;
    }
    if (a.on && a.t >= a.life) {
      if (a.kind === DK.RAGE) burst(a);
      else if (a.kind === DK.TWISTER) dropAll(a);
      else if (a.kind === DK.LOCK) release(a);
      else if (a.kind === DK.RUSH) slam(a);
      else if (a.kind === DK.DEBRIS) letGo(a);
      else if (a.kind === DK.PULSE) collapse(a);
      free(a);
    }
  }
  setDamageSource(0);
}

// Dragon Rage ---------------------------------------------------------------------------------

function rageStep(a, dt) {
  a.x += a.vx * dt;
  a.y += a.vy * dt;
  ovLook(a, dt, 0.06);
  let hit = false;
  each(a.x, a.y, a.r, () => { hit = true; });
  if (hit || Math.hypot(a.x - a.ox, a.y + 6 - a.oy) >= a.k) { burst(a); free(a); }
}

/** The fireball becomes a pillar of flame. */
function burst(a) {
  const b = child(DK.PILLAR, a);
  if (b) {
    b.x = a.x; b.y = a.y + 6;
    b.life = a.def.burstT || 0.55;
    b.r = (a.def.burstR || 22) * a.area;
    b.dmg = a.dmg; b.knock = a.knock; b.area = a.area;
    // Wildfire Pillar: it does not stand still -- it creeps after the nearest foe a while.
    const wf = mech(a.ov, 'wildfire');
    if (wf) { b.life += wf.t || 1.2; b.vx = wf.speed || 70; b.n = 1; }
  }
  spawnSeq('fx_rage_flash', a.x, a.y, { dur: 0.14, fps: 14, scale: a.area });
}

function pillarStep(a, dt) {
  if (!a.done) {
    a.done = true;
    fixedCircle(a, a.x, a.y, a.r, a.knock);
    // A creeping pillar remembers who the first burst already burned.
    if (a.n) each(a.x, a.y, a.r, (e) => { if (e.lastHitId === a.hitId && a.held.length < 40) a.held.push(e); });
  }
  if (!a.n) return;
  // Creeping: toward the nearest foe, burning each one it reaches once (the pillar's own hit id).
  const e = nearest(a.x, a.y, 140);
  if (e) {
    const dx = e.x - a.x, dy = e.y - a.y, d = Math.hypot(dx, dy) || 1;
    a.x += (dx / d) * a.vx * dt; a.y += (dy / d) * a.vx * dt;
  }
  // Each foe once: the pillar keeps its own list, since other hits overwrite a foe's hit id.
  const grudge = mech(a.ov, 'grudge');
  each(a.x, a.y, a.r * 0.8, (e) => {
    if (a.held.includes(e) || a.held.length >= 40) return;
    a.held.push(e);
    const dmg = grudge ? Math.max(a.dmg, e.maxHp * (e.boss || e.legend ? grudge.boss : grudge.pct)) : a.dmg;
    damageEnemy(e, dmg, 0, 0, false, true);
  });
  ovLook(a, dt, 0.08);
}

// Dragon Pulse --------------------------------------------------------------------------------

function pulseStep(a, dt) {
  const res = mech(a.ov, 'resonator');
  // It rolls, and leans gently toward whatever is nearest, so it stays in the crowd -- unless it
  // is a resonator that has found its foe, which holds where it is.
  if (!(res && a.done)) {
    const e = nearest(a.x, a.y, 120);
    if (e) {
      const sp = Math.hypot(a.vx, a.vy) || 1;
      const want = Math.atan2(e.y - a.y, e.x - a.x);
      const cur = Math.atan2(a.vy, a.vx);
      let d = want - cur;
      while (d > Math.PI) d -= TAU;
      while (d < -Math.PI) d += TAU;
      const ang = cur + Math.max(-1, Math.min(1, d)) * 1.1 * dt;
      a.vx = Math.cos(ang) * sp; a.vy = Math.sin(ang) * sp;
      if (res && Math.hypot(e.x - a.x, e.y - a.y) < a.r * 0.6) { a.done = true; a.vx = 0; a.vy = 0; }
    }
    a.x += a.vx * dt;
    a.y += a.vy * dt;
  }
  ovLook(a, dt, 0.1);

  // Heartbeat: the second beat of a ba-dum, a beat after the first.
  const hb = mech(a.ov, 'heartbeat');
  if (hb && a.hit2 && G.clock >= a.tx) {
    const first = a.hit2;
    a.hit2 = 0;
    const id = nextHitId();
    each(a.x, a.y, a.r * 1.15, (e) => {
      // Caught by both beats: knocked flat.
      if (e.lastHitId === first) e.stunT = Math.max(e.stunT, hb.stun || 0.5);
    });
    damageCircle(a.x, a.y, a.r * 1.15, a.dmg * 0.6, id, { knockback: a.knock });
    a.step = G.clock; a.idx = 2;
  }

  a.k -= dt;
  if (a.k > 0) return;
  a.k = (a.def.throb || 0.3) * (hb ? 2 : 1);
  a.step = G.clock;                       // the renderer swells the ring from here
  a.idx = 1;
  if (res && a.done) a.r = Math.min(a.z0 * 2.6, a.r * (1 + (res.grow || 0.15)));
  const id = nextHitId();
  damageCircle(a.x, a.y, a.r, a.dmg * (hb ? 0.6 : 1), id, { knockback: a.knock });
  if (hb) { a.hit2 = id; a.tx = G.clock + (hb.gap || 0.13); }
  // Mirror Pulse: enemy shots the ring sweeps are turned round and fly back as your own.
  const mir = mech(a.ov, 'mirror');
  if (mir) mirrorShots(a, mir);
}

let MIRROR_SPR = -2, MIRROR_DIRS = 2;
function mirrorShots(a, mir) {
  if (MIRROR_SPR === -2) { MIRROR_SPR = spriteBase('proj_star', 'dragon'); MIRROR_DIRS = spriteDirs('proj_star', 'dragon'); }
  const r2 = (a.r + 6) * (a.r + 6);
  for (let i = 0; i < projectiles.length; i++) {
    const pr = projectiles[i];
    if (!pr.hostile || dist2(pr.x, pr.y, a.x, a.y) > r2) continue;
    pr.hostile = false;
    pr.vx = -pr.vx * 1.3; pr.vy = -pr.vy * 1.3;
    pr.angle += Math.PI;
    pr.src = a.src;
    pr.dmg = Math.max(pr.dmg, a.dmg * (mir.dmg || 1.5));
    pr.pierce = 1; pr.weapon = -1; pr.gen = 0; pr.motion = 0;
    pr.life = 0; pr.maxLife = 1.4; pr.hitId = nextHitId();
    pr.look = 0; pr.status = 0; pr.strand = 0;
    pr.burn = 0; pr.slow = 0; pr.knockback = 20; pr.bounces = 0;
    pr.sprBase = MIRROR_SPR; pr.nd = MIRROR_DIRS; pr.vis = 1; pr.r = Math.max(pr.r, 4); pr.r0 = pr.r;
    pr.trail = 12; pr.trailColor = '#e8f0ff'; pr.impact = 5; pr.impactColor = '#ffffff';
    pr.ovRic = 0; pr.ovErase = 0; pr.ovSnow = -1; pr.ovPol = 0; pr.grow = 0;
    spawnSpr('shine', pr.x, pr.y, '#ffffff', 1);
  }
}

/** A resonator's end: everything it built up goes out in one wave. */
function collapse(a) {
  const res = mech(a.ov, 'resonator');
  if (!res || !a.done) return;
  damageCircle(a.x, a.y, a.r * 1.3, a.dmg * (res.collapse || 2), nextHitId(), { knockback: a.knock * 2 });
  spawnSpr('ring_l', a.x, a.y, ovlSprColor(a.ov, G.clock, 2), a.r / 20);
  ovProc(a, a.x, a.y, 1.4);
}

// Dragon Dance --------------------------------------------------------------------------------

function sparkStep(a, dt, p) {
  // Where it rises from: you, or (thrown by an afterimage) the copy's spot.
  const bx = a.fixed ? a.bx : p.x, by = a.fixed ? a.by : p.y;
  if (a.phase === 0) {
    const k = Math.min(1, a.t / a.k);
    a.x = bx + a.ox; a.y = by + a.oy;
    a.z = a.z0 * (1 - (1 - k) * (1 - k));
    if (k >= 1) { a.phase = 1; a.t = 0; }
    return;
  }
  if (a.phase === 1) {
    a.x = bx + a.ox; a.y = by + a.oy;
    a.z = a.z0 + Math.sin(a.t * 18 + a.a) * 1.5;
    if (a.t >= a.step) {
      // Pick its own foe: the nearest one no other spark of this step has claimed yet. A comet
      // already has its target, the toughest in reach.
      if (!a.crit || !a.target) {
        a.target = nearest(a.x, a.y, 260, claimed(a));
        if (!a.target) a.target = nearest(a.x, a.y, 260);
        a.tsn = a.target ? a.target.sn : 0;
      }
      a.tx = a.target ? a.target.x : a.x + Math.cos(a.a) * 40;
      a.ty = a.target ? a.target.y : a.y + Math.sin(a.a) * 40;
      a.k = Math.max(8, Math.hypot(a.tx - a.x, a.ty - a.y));
      a.z0 = a.z;
      a.phase = 2; a.t = 0;
    }
    return;
  }
  // Diving: along the ground toward the foe, coming down as it closes.
  const tg = a.target;
  if (tg && tg.alive && tg.sn === a.tsn) { a.tx = tg.x; a.ty = tg.y; }
  const dx = a.tx - a.x, dy = a.ty - a.y;
  const d = Math.hypot(dx, dy);
  const stepLen = a.vx * dt;
  a.a = Math.atan2(dy - a.z, dx);
  ovLook(a, dt, 0.05);
  if (d <= stepLen + 2) {
    a.x = a.tx; a.y = a.ty; a.z = 0;
    damageCircle(a.x, a.y, a.r, a.dmg, nextHitId(), { knockback: a.knock });
    if (a.crit) {
      spawnSeq('fx_rage_flash', a.x, a.y - 6, { dur: 0.2, fps: 10, scale: 2 });
      spawnSpr('flash_burst', a.x, a.y - 8, '#ffd166', a.r / 24);
    } else {
      spawnSeq(a.idx ? 'fx_spark_c' : 'fx_spark_o', a.x, a.y - 8, { dur: 0.22, fps: 18, scale: 0.8 });
      spawnSpr('spark_s', a.x, a.y - 2, a.idx ? '#7ac8ff' : '#ffb347', 1.2);
    }
    ovProc(a, a.x, a.y - 4, 0.8);
    free(a);
    return;
  }
  a.x += (dx / d) * stepLen;
  a.y += (dy / d) * stepLen;
  a.z = a.z0 * Math.min(1, (d - stepLen) / a.k);
}

const _claim = [];
function claimed(self) {
  _claim.length = 0;
  for (let i = 0; i < CAP; i++) {
    const b = dragonActors[i];
    if (b.on && b !== self && b.kind === DK.SPARK && b.target && b.src === self.src) _claim.push(b.target);
  }
  return _claim;
}

/** Afterimage: half a beat after it appears, the copy throws its own sparks, then fades. */
function afterStep(a) {
  if (a.done || a.t < 0.45) return;
  a.done = true;
  for (let i = 0; i < a.n; i++) {
    const ang = (i / a.n) * TAU;
    const s = take(DK.SPARK, { srcId: a.src, def: a.def, ovl: a.ov, w: a.w });
    if (!s) break;
    s.fixed = true; s.bx = a.x; s.by = a.y;
    s.a = ang; s.ox = Math.cos(ang) * 10; s.oy = Math.sin(ang) * 6;
    s.x = a.x + s.ox; s.y = a.y + s.oy;
    s.z0 = 30 + G.rngFx() * 12; s.k = 0.25; s.step = 0.1 + i * 0.04;
    s.idx = 1; s.dmg = a.dmg; s.area = a.area; s.r = a.r; s.knock = a.knock;
    s.life = 4; s.vx = 420;
  }
}

/** A lingering hazard that cuts what stands in it on a short clock (a scar, a footprint). */
function tickZone(a, dt) {
  a.k -= dt;
  if (a.k > 0) return;
  a.k = 0.3;
  damageCircle(a.x, a.y, a.r, a.dmg, nextHitId(), {});
}

// Dragon Rush ---------------------------------------------------------------------------------

function rushStep(a, dt, p) {
  const sp = Math.hypot(a.vx, a.vy) || 1;
  a.x += a.vx * dt;
  a.y += a.vy * dt;
  a.n += sp * dt;
  ovLook(a, dt, 0.04);
  // Pin what it reaches to its leading edge, up to what it can carry.
  each(a.x, a.y, a.r, (e) => {
    if (a.held.length >= a.z || a.held.includes(e) || !movable(e)) return;
    a.held.push(e); a.heldSn.push(e.sn);
    a.heldA.push((a.held.length - 1) * 1.7); a.heldB.push(0);
  });
  damageCircle(a.x, a.y, a.r, a.dmg, a.hitId, { knockback: a.knock * 0.2, stun: 0.15 });
  // Carry them: spread along the crescent's front, held helpless.
  const ux = Math.cos(a.a), uy = Math.sin(a.a);
  for (let j = 0; j < a.held.length; j++) {
    const e = a.held[j];
    if (!e.alive || e.sn !== a.heldSn[j]) continue;
    const side = Math.sin(a.heldA[j]) * a.r * 0.9;
    e.x = a.x + ux * (a.r * 0.7) - uy * side;
    e.y = a.y + uy * (a.r * 0.7) + ux * side;
    e.stunT = Math.max(e.stunT, 0.12);
    e.knockX = 0; e.knockY = 0;
  }
  // Rocks thrown off to either side as it passes.
  while (a.z0 < a.idx && a.n >= a.step * (a.z0 + 1)) {
    a.z0++;
    throwRock(a, (a.z0 & 1) ? 1 : -1);
  }
  // Afterimages: the crescent a beat behind itself, fading.
  a.ptT -= dt;
  if (a.ptT <= 0) {
    a.ptT = 0.05;
    spawnSeq('fx_rush_slash', a.x, a.y - 8, { dur: 0.16, fps: 25, scale: 0.8 * a.area, rot: a.a, alpha: 0.35, frame0: ((a.t * 16) | 0) % 4 });
  }
  // Dragon's Wake: once it has passed you, you ride in its wake, untouchable.
  const wk = mech(a.ov, 'wake');
  if (wk && p && a.n > 70 && a.n < 70 + (wk.dash || 130)) {
    p.x = a.x - ux * 20; p.y = a.y - uy * 20;
    clampToBounds(p, G.bounds, p.r);
    if (waterAtWorld(p.x, p.y)) { const l = nearestLand(p.x, p.y); p.x = l.x; p.y = l.y; }
    p.iframes = Math.max(p.iframes, 0.12);
    if (G.tick % 2 === 0) spawnSpr('streak', p.x - ux * 8, p.y - 8 - uy * 8, G.tick & 2 ? '#ffffff' : '#9adcff', 1, a.a + Math.PI / 2);
  }
  if (a.n >= a.k) { slam(a); free(a); }
}

/** The end of the charge: everything it carried is slammed into the ground. */
function slam(a) {
  if (a.done) return;
  a.done = true;
  for (let j = 0; j < a.held.length; j++) {
    const e = a.held[j];
    if (!e.alive || e.sn !== a.heldSn[j]) continue;
    settle(e);
    damageEnemy(e, a.dmg * a.tx, 0, 0, true);
  }
  damageCircle(a.x, a.y, 36 * a.area, a.dmg * 0.5, nextHitId(), { stun: 0.6, knockback: 60 });
  spawnSeq('fx_rush_rocks', a.x, a.y + 6, { dur: 0.4, fps: 10, scale: 0.9 * a.area });
  spawnSpr('land_dust', a.x - 10, a.y, '#c8c0ad', 1.4);
  spawnSpr('land_dust', a.x + 10, a.y, '#c8c0ad', 1.4);
  ovProc(a, a.x, a.y, 1.3);
  // Meteor Charge: the slam opens a crater that rocks keep raining into.
  const mc = mech(a.ov, 'meteor');
  if (mc) {
    const c = child(DK.CRATER, a);
    if (c) {
      c.x = a.x; c.y = a.y; c.life = mc.t || 1.5; c.r = (mc.r || 46) * a.area;
      c.dmg = a.dmg * (mc.dmg || 0.4); c.n = mc.rocks || 6; c.a = G.rngFx() * TAU;
    }
  }
  // Phantom Lane: the path stays, and pulls back to its start whatever crosses it.
  const ln = mech(a.ov, 'lane');
  if (ln) {
    const c = child(DK.LANE, a);
    if (c) {
      c.ox = a.ox; c.oy = a.oy; c.x = a.x; c.y = a.y; c.a = a.a;
      c.k = Math.hypot(a.x - a.ox, a.y - a.oy);
      c.life = ln.t || 2; c.dmg = a.dmg * (ln.dmg || 0.3); c.r = 9 * a.area;
    }
  }
}

function throwRock(a, side) {
  const b = child(DK.ROCK, a);
  if (!b) return;
  const nx = -Math.sin(a.a), ny = Math.cos(a.a);
  const out = 30 + G.rngFx() * 28;
  b.ox = a.x; b.oy = a.y;
  b.tx = a.x + nx * side * out + Math.cos(a.a) * 14;
  b.ty = a.y + ny * side * out + Math.sin(a.a) * 14;
  b.x = b.ox; b.y = b.oy;
  b.life = 0.42;
  b.r = 15 * a.area;
  b.dmg = a.dmg * (a.def.rockDmg || 0.5);
  b.area = a.area;
  b.z0 = 26;
}

function rockStep(a) {
  const k = Math.min(1, a.t / a.life);
  a.x = a.ox + (a.tx - a.ox) * k;
  a.y = a.oy + (a.ty - a.oy) * k;
  // Thrown in an arc, or (z0 < 0) dropped from straight above.
  a.z = a.z0 > 0 ? Math.sin(k * Math.PI) * a.z0 : -a.z0 * (1 - k);
  if (k >= 1 && !a.done) {
    a.done = true;
    damageCircle(a.x, a.y, a.r, a.dmg, a.hitId, { knockback: 40 });
    spawnSeq('fx_rush_rocks', a.x, a.y + 4, { dur: 0.32, fps: 12, scale: 0.6 * a.area, frame0: 0 });
    spawnSpr('land_dust', a.x, a.y, '#c8c0ad', 1);
  }
}

/** Meteor Charge's crater: it slows what stands in it, and rocks keep falling in. */
function craterStep(a, dt) {
  each(a.x, a.y, a.r, (e) => { e.slow = Math.max(e.slow, 0.4); e.slowT = Math.max(e.slowT, 0.2); });
  a.k -= dt;
  if (a.k > 0 || a.n <= 0) return;
  a.k = a.life / 7;
  a.n--;
  const r = child(DK.ROCK, a);
  if (!r) return;
  const ang = G.rngFx() * TAU, d = G.rngFx() * a.r * 0.8;
  r.tx = r.ox = r.x = a.x + Math.cos(ang) * d;
  r.ty = r.oy = r.y = a.y + Math.sin(ang) * d * 0.7;
  r.z0 = -90; r.life = 0.35; r.r = 14 * a.area; r.dmg = a.dmg; r.area = a.area;
}

/** Phantom Lane: anything that crosses the ghost lane is yanked back to where the charge began. */
function laneStep(a) {
  const ux = Math.cos(a.a), uy = Math.sin(a.a);
  const mx = (a.ox + a.x) / 2, my = (a.oy + a.y) / 2;
  each(mx, my, a.k / 2 + a.r, (e) => {
    if (e.lastHitId === a.hitId || !movable(e)) return;
    const ex = e.x - a.ox, ey = e.y - a.oy;
    const along = ex * ux + ey * uy;
    if (along < 0 || along > a.k) return;
    if (Math.abs(ex * -uy + ey * ux) > a.r + e.r) return;
    e.lastHitId = a.hitId;
    spawnSpr('death_flash', e.x, e.y - 4, '#b090ff', 0.8);
    e.x = a.ox + (G.rngFx() - 0.5) * 16; e.y = a.oy + (G.rngFx() - 0.5) * 16;
    settle(e);
    e.stunT = Math.max(e.stunT, 0.4);
    damageEnemy(e, a.dmg, 0, 0, true);
    spawnSpr('death_flash', e.x, e.y - 4, '#b090ff', 0.8);
  });
}

// Dragon Claw ---------------------------------------------------------------------------------

function rakeStep(a) {
  if (a.t < 0 || a.done) return;
  a.done = true;
  // The set's last rake is a critical hit, always: a real one, that everything keyed on crits
  // (Sharpshoot, Axe Kick, a crit-burst overload) sees as one.
  critCtx.force = a.crit;
  damageLine(a.x, a.y, a.a, a.k, a.r, a.dmg, a.hitId, { knockback: a.knock, knockAngle: a.a });
  critCtx.force = false;
  // Flecks streaming off the stroke.
  const n = a.crit ? 5 : 3;
  for (let i = 0; i < n; i++) {
    const u = G.rngFx() * a.k;
    spawnSeq('fx_claw_fleck', a.x + Math.cos(a.a) * u, a.y + Math.sin(a.a) * u, {
      dur: 0.4, fps: 18, vx: Math.cos(a.a) * 50 + (G.rngFx() - 0.5) * 30, vy: Math.sin(a.a) * 50 - 25,
    });
  }
  if (a.crit) spawnSpr('slash', a.x + Math.cos(a.a) * a.k / 2, a.y + Math.sin(a.a) * a.k / 2, '#ffb347', 1.3, a.a);
  // Dragon Tail: the last rake throws its foe somewhere else entirely, dazed and turned round.
  const tail = a.crit && mech(a.ov, 'tail');
  const e = a.target;
  if (tail && e && e.alive && e.sn === a.tsn && movable(e)) {
    spawnSpr('ring_m', e.x, e.y - 4, ovlSprColor(a.ov, G.clock, 2), 1);
    const ang = G.rngFx() * TAU, d = (tail.dist || 120) * (0.8 + G.rngFx() * 0.4);
    e.x += Math.cos(ang) * d; e.y += Math.sin(ang) * d;
    settle(e);
    e.confuseT = Math.max(e.confuseT, tail.daze || 1.2);
    e.dir = e.dir ? 0 : 1;
    spawnSpr('flash_burst', e.x, e.y - 4, ovlSprColor(a.ov, G.clock, 2), 1);
  }
}

// Twister -------------------------------------------------------------------------------------

function twisterStep(a, dt) {
  // Wander: a new heading every half second, mostly toward the nearest foe, never quite.
  a.step -= dt;
  if (a.step <= 0) {
    a.step = 0.45 + G.rngFx() * 0.3;
    const e = nearest(a.x, a.y, 170);
    const toward = e ? Math.atan2(e.y - a.y, e.x - a.x) : a.a;
    a.a = toward + (G.rngFx() - 0.5) * 2.2;
  }
  a.x += Math.cos(a.a) * a.vx * dt;
  a.y += Math.sin(a.a) * a.vx * dt;
  const b = G.bounds;
  if (b) { a.x = Math.max(b.minX + 10, Math.min(b.maxX - 10, a.x)); a.y = Math.max(b.minY + 10, Math.min(b.maxY - 10, a.y)); }

  // Merge: two of your storms that meet become one, bigger and longer-lived.
  const mg = mech(a.ov, 'merge');
  if (mg) {
    for (let i = 0; i < CAP; i++) {
      const o = dragonActors[i];
      if (o === a || !o.on || o.kind !== DK.TWISTER || o.src !== a.src) continue;
      if (Math.hypot(o.x - a.x, o.y - a.y) > (a.r + o.r) * 0.6 || a.z0 + o.z0 >= (mg.max || 3)) continue;
      a.r = Math.min(a.r * 1.3, a.r + o.r * 0.5);
      a.life = Math.max(a.life, a.t + (o.life - o.t)) + (mg.t || 1.5);
      a.n += o.n; a.z0 += o.z0 + 1;
      a.dmg *= 1.15;
      dropAll(o);
      free(o);
      spawnSpr('ring_l', a.x, a.y - 20, ovlSprColor(a.ov, G.clock, 2), a.r / 18);
      ovProc(a, a.x, a.y - 30, 1.5);
    }
  }

  // Suck in what is near, and lift what reaches the middle.
  const pull = 85 * dt;
  each(a.x, a.y, a.r * 1.5, (e) => {
    if (a.held.includes(e)) return;
    const dx = a.x - e.x, dy = a.y - e.y;
    const d = Math.hypot(dx, dy) || 1;
    const k = e.boss || e.legend ? 0.15 : 1;
    e.x += (dx / d) * pull * k;
    e.y += (dy / d) * pull * k;
    if (d < a.r * 0.55 && a.held.length < a.n && movable(e)) {
      a.held.push(e); a.heldSn.push(e.sn);
      a.heldA.push(Math.atan2(-dy, -dx));
      a.heldB.push(a.t + 0.7 + G.rngFx() * 0.4);   // when it is thrown
    }
  });
  // Spin what it holds, then fling it.
  for (let j = a.held.length - 1; j >= 0; j--) {
    const e = a.held[j];
    if (!e.alive || e.sn !== a.heldSn[j]) { dropAt(a, j); continue; }
    a.heldA[j] += 9 * dt;
    e.x = a.x + Math.cos(a.heldA[j]) * 9;
    e.y = a.y + Math.sin(a.heldA[j]) * 5;
    e.stunT = Math.max(e.stunT, 0.12);
    e.knockX = 0; e.knockY = 0;
    if (a.t >= a.heldB[j]) fling(a, j);
  }
  // The grind: everything in the funnel, three times a second.
  a.k -= dt;
  if (a.k <= 0) {
    a.k = 0.3;
    damageCircle(a.x, a.y, a.r, a.dmg, nextHitId(), {});
  }
  ovLook(a, dt, 0.09);
}

function fling(a, j) {
  const e = a.held[j];
  const ang = a.heldA[j];
  e.stunT = Math.max(e.stunT, 0.35);
  damageEnemy(e, a.dmg * (a.def.throwDmg || 1.3), 0, 0, true);
  spawnSpr('slide_dust', e.x, e.y, '#d8e8d0', 1);
  const deb = mech(a.ov, 'debris'), br = mech(a.ov, 'bramble');
  if (deb && e.alive) {
    // Debris Storm: the foe itself is the missile.
    const d = child(DK.DEBRIS, a);
    if (d) {
      d.target = e; d.tsn = e.sn; d.x = e.x; d.y = e.y;
      d.vx = Math.cos(ang) * (deb.speed || 260); d.vy = Math.sin(ang) * (deb.speed || 260);
      d.life = deb.t || 0.4; d.dmg = a.dmg * (deb.dmg || 1); d.r = e.r + 6;
    }
  } else {
    e.knockX += Math.cos(ang) * a.knock;
    e.knockY += Math.sin(ang) * a.knock;
  }
  if (br && e.alive) {
    // Bramble Wind: where it comes down, the leaves it carried take root.
    const v = child(DK.VINE, a);
    if (v) { v.target = e; v.tsn = e.sn; v.x = e.x; v.y = e.y; v.life = 0.3 + (br.t || 1.5); v.r = (br.r || 20) * a.area; }
  }
  dropAt(a, j);
}

function dropAt(a, j) {
  a.held.splice(j, 1); a.heldSn.splice(j, 1); a.heldA.splice(j, 1); a.heldB.splice(j, 1);
}

/** The twister dies out: whatever it still holds is thrown. */
function dropAll(a) {
  for (let j = a.held.length - 1; j >= 0; j--) {
    const e = a.held[j];
    if (e.alive && e.sn === a.heldSn[j]) fling(a, j);
    else dropAt(a, j);
  }
}

/** Debris Storm: a flung foe in flight, bowling over whatever it crashes into. */
function debrisStep(a, dt) {
  const e = a.target;
  if (!e || !e.alive || e.sn !== a.tsn) { free(a); return; }
  a.x += a.vx * dt; a.y += a.vy * dt;
  e.x = a.x; e.y = a.y;
  e.stunT = Math.max(e.stunT, 0.1);
  e.knockX = 0; e.knockY = 0;
  each(a.x, a.y, a.r, (o) => {
    if (o === e || o.lastHitId === a.hitId) return;
    o.lastHitId = a.hitId;
    const d = Math.hypot(a.vx, a.vy) || 1;
    damageEnemy(o, a.dmg, (a.vx / d) * 90, (a.vy / d) * 90, true);
    spawnSpr('punch_s', o.x, o.y - 4, '#c8c0ad', 1);
  });
  if (G.tick % 3 === 0) spawnSpr('dust', a.x, a.y, '#c8c0ad', 0.7);
}

function letGo(a) {
  const e = a.target;
  if (e && e.alive && e.sn === a.tsn) { settle(e); damageEnemy(e, a.dmg * 0.5, 0, 0, false); }
  spawnSpr('land_dust', a.x, a.y, '#c8c0ad', 1);
}

/** Bramble Wind: once the foe has landed, thorns root it and everything around it. */
function vineStep(a) {
  if (!a.done) {
    const e = a.target;
    if (e && e.alive && e.sn === a.tsn) { a.x = e.x; a.y = e.y; }
    if (a.t < 0.3) return;
    a.done = true;
    a.k = a.life - a.t;
    each(a.x, a.y, a.r, (o) => { if (!o.boss && !o.legend) o.stunT = Math.max(o.stunT, a.k); });
    spawnSpr('ring_m', a.x, a.y, '#7fe08a', a.r / 18);
  }
}

// Spacial Rend --------------------------------------------------------------------------------

const REND_OPEN = 0.6, REND_OUT = 0.25, REND_IN = 0.25;

/** Where the crescents are: 0 at the tear, 1 at full reach. And which leg they are on. */
export function rendReach(a) {
  const t = a.t - REND_OPEN;
  if (t < 0) return { k: 0, leg: -1 };
  const cyc = REND_OUT + REND_IN;
  const c = Math.floor(t / cyc);
  if (c >= a.phase) return { k: 0, leg: -1 };
  const u = t - c * cyc;
  if (u < REND_OUT) return { k: u / REND_OUT, leg: 0, c };
  return { k: 1 - (u - REND_OUT) / REND_IN, leg: 1, c };
}

function rendStep(a, dt) {
  if (a.t < REND_OPEN) {
    // Opening: everything near is dragged toward the tear.
    const pull = 70 * dt;
    each(a.x, a.y, a.k * 1.2, (e) => {
      if (!movable(e)) return;
      const dx = a.x - e.x, dy = a.y - e.y;
      const d = Math.hypot(dx, dy) || 1;
      if (d < 6) return;
      e.x += (dx / d) * pull; e.y += (dy / d) * pull;
    });
    return;
  }
  const anc = mech(a.ov, 'anchor');
  const { k, leg } = rendReach(a);
  if (leg >= 0) {
    const id = leg === 0 ? a.hitId : a.hit2;
    const mir = leg === 0 && mech(a.ov, 'mirror');
    for (let i = 0; i < a.n; i++) {
      const ang = a.a + (i / a.n) * TAU + k * 0.6;
      const cx = a.x + Math.cos(ang) * a.k * k, cy = a.y + Math.sin(ang) * a.k * k * 0.8;
      // Before the cut lands: who is about to be cut for the first time (Mirror Space, Anchor).
      if (mir || anc) {
        each(cx, cy, a.r, (e) => {
          if (e.lastHitId === id || !movable(e)) return;
          if (mir) {
            // Swapped through the tear to the far side.
            e.x = 2 * a.x - e.x; e.y = 2 * a.y - e.y;
            settle(e);
            spawnSpr('oval', e.x, e.y - 4, ovlSprColor(a.ov, G.clock, 2), 0.9);
          }
          if (anc && a.held.length < 14 && !a.held.includes(e)) {
            a.held.push(e); a.heldSn.push(e.sn); a.heldA.push(0); a.heldB.push(0);
          }
        });
      }
      damageCircle(cx, cy, a.r, a.dmg, id, {});
    }
    // Fault Lines: at full reach the crescents' points are joined into a rift.
    if (leg === 0 && k > 0.92 && !a.crit && mech(a.ov, 'fault')) {
      a.crit = true;
      const f = child(DK.FAULT, a);
      if (f) {
        f.x = a.x; f.y = a.y; f.life = mech(a.ov, 'fault').t || 1.5; f.dmg = a.dmg * (mech(a.ov, 'fault').dmg || 0.5);
        for (let i = 0; i < a.n; i++) {
          const ang = a.a + (i / a.n) * TAU + 0.6;
          f.pts.push(a.x + Math.cos(ang) * a.k, a.y + Math.sin(ang) * a.k * 0.8);
        }
      }
    }
  } else if (!a.done && a.t >= REND_OPEN + a.phase * (REND_OUT + REND_IN)) {
    // It closes with a snap at the middle.
    a.done = true;
    damageCircle(a.x, a.y, 22 * a.area, a.dmg * (a.def.tearDmg || 1.5), nextHitId(), { knockback: -60 });
    spawnSpr('death_flash', a.x, a.y, '#e0d8ff', 1.2);
  }
  // Spatial Anchor: chained foes that stray too far are yanked back and cut.
  if (anc && a.held.length) {
    const leash = anc.leash || 50;
    for (let j = 0; j < a.held.length; j++) {
      const e = a.held[j];
      if (!e.alive || e.sn !== a.heldSn[j]) continue;
      const dx = e.x - a.x, dy = e.y - a.y, d = Math.hypot(dx, dy);
      if (d <= leash || G.clock < a.heldB[j]) continue;
      a.heldB[j] = G.clock + 0.35;
      e.x = a.x + (dx / d) * leash * 0.55; e.y = a.y + (dy / d) * leash * 0.55;
      damageEnemy(e, a.dmg * (anc.dmg || 0.5), 0, 0, true);
      spawnSpr('spark_s', e.x, e.y - 4, '#e8f0ff', 1);
    }
  }
}

/** Fault Lines: the rift's edges cut whatever crosses them, a few times a second. */
function faultStep(a, dt) {
  a.k -= dt;
  if (a.k > 0) return;
  a.k = 0.35;
  const n = a.pts.length >> 1;
  for (let i = 0; i < n; i++) {
    const x0 = a.pts[i * 2], y0 = a.pts[i * 2 + 1];
    const x1 = a.pts[((i + 1) % n) * 2], y1 = a.pts[((i + 1) % n) * 2 + 1];
    damageLine(x0, y0, Math.atan2(y1 - y0, x1 - x0), Math.hypot(x1 - x0, y1 - y0), 5, a.dmg, nextHitId(), {});
  }
}

// Roar of Time --------------------------------------------------------------------------------

function lockStep(a, dt) {
  // Everything that enters is caught, up to a limit, and stays caught until the ring breaks.
  if (a.held.length < 40) {
    each(a.x, a.y, a.r, (e) => {
      if (a.held.length >= 40 || a.held.includes(e)) return;
      a.held.push(e); a.heldSn.push(e.sn); a.heldA.push(e.hp); a.heldB.push(0);
    });
  }
  const dil = mech(a.ov, 'dilation');
  if (dil) {
    G.dilate = Math.min(G.dilate, 1 / (dil.mul || 1.4));
    const p = G.player;
    if (p && G.tick % 6 === 0) spawnSpr('motes', p.x + (G.rngFx() - 0.5) * 14, p.y - 6 - G.rngFx() * 14, '#9af0c8', 1, 0, 0, -30);
  }
  a.k -= dt;
  const tick = a.k <= 0;
  if (tick) a.k = a.def.tick || 0.4;
  for (let j = 0; j < a.held.length; j++) {
    const e = a.held[j];
    if (!e.alive || e.sn !== a.heldSn[j]) continue;
    if (e.boss || e.legend) {
      e.slow = Math.max(e.slow, 0.6); e.slowT = Math.max(e.slowT, 0.2);
    } else {
      e.stunT = Math.max(e.stunT, 0.1);
      e.knockX = 0; e.knockY = 0;
    }
    if (tick) a.heldB[j] += a.dmg;             // banked, not dealt
  }
  ovLook(a, dt, 0.12);
}

/** Time starts again: every frozen foe takes what it was owed, at once. */
function release(a) {
  const mul = a.def.release || 1.5, echo = a.def.echo || 0.5;
  const age = mech(a.ov, 'aging');
  for (let j = 0; j < a.held.length; j++) {
    const e = a.held[j];
    if (!e.alive || e.sn !== a.heldSn[j]) continue;
    const taken = Math.max(0, a.heldA[j] - e.hp);
    const owed = a.heldB[j] * mul + taken * echo;
    const dx = e.x - a.x, dy = e.y - a.y;
    const d = Math.hypot(dx, dy) || 1;
    if (owed > 0) damageEnemy(e, owed, (dx / d) * a.knock, (dy / d) * a.knock, true);
    // Aging: what survived the stopped time comes out of it old, for good.
    if (age && e.alive && !e.aged && !e.legend) {
      e.aged = true;
      e.speed *= 1 - (age.slow || 0.3);
      spawnSpr('motes', e.x, e.y - 8, '#d8b878', 1, 0, 0, -20);
    }
  }
  spawnSeq('fx_roar_burst', a.x, a.y, { dur: 0.45, fps: 11, scale: Math.max(0.8, a.r / 36) });
  spawnSpr('ring_l', a.x, a.y, a.ov ? ovlSprColor(a.ov, G.clock, 2) : '#9adcff', a.r / 26);
  // Clockwork Gears: the ring's gears break loose and roll away as saws.
  const gr = mech(a.ov, 'gears');
  if (gr) {
    const n = gr.n || 6, a0 = G.rngFx() * TAU;
    for (let i = 0; i < n; i++) {
      const g = child(DK.GEAR, a);
      if (!g) break;
      const ang = a0 + (i / n) * TAU;
      g.x = a.x + Math.cos(ang) * a.r * 0.6; g.y = a.y + Math.sin(ang) * a.r * 0.5;
      g.vx = Math.cos(ang) * (gr.speed || 120); g.vy = Math.sin(ang) * (gr.speed || 120) * 0.8;
      g.life = gr.life || 1.6; g.r = (gr.r || 10) * a.area; g.dmg = a.dmg * (gr.dmg || 1.4);
      g.area = a.area;
    }
  }
}

/** A Clockwork Gear rolling out across the field, sawing what it passes. */
function gearStep(a, dt) {
  a.x += a.vx * dt; a.y += a.vy * dt;
  a.a += 12 * dt;
  damageCircle(a.x, a.y, a.r, a.dmg, a.hitId, { knockback: 50 });
  ovLook(a, dt, 0.07);
}

/** Whether an enemy is frozen in a time ring right now, for the renderer's tint. */
export function timeLocked(e) {
  for (let i = 0; i < CAP; i++) {
    const a = dragonActors[i];
    if (a.on && a.kind === DK.LOCK && a.held.includes(e)) return true;
  }
  return false;
}
