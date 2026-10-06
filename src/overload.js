// L3 -- may import L0-L2.
//
// Weapon Overloads at run time: which weapons have one, and everything an overload does that is
// not a change to how the weapon fires (that part lives in weapons.js, which reads the same data).
//
// Everything is keyed by DAMAGE SOURCE. A weapon's shots, zones, chains and beams all hit under
// the weapon's source id, so `srcOvl[src]` -- one array index -- is enough for any hit, kill or
// expiring shot to find its overload, whatever behaviour produced it.
//
// An overload's own effects -- a chain arc, a splash, an explosion, the shards a kill releases --
// hit under a SECOND source, the overload's own (`o:<id>`). That gives it its own line in the
// damage breakdown, and since nothing is registered under that source, a proc can never set off
// another proc. On top of that a per-tick budget caps how many procs may run at all, so a crowd
// of four hundred being shredded by splash damage cannot turn into a frame-long cascade.

import { G } from './state.js';
import { TAU, dist2 } from './util.js';
import {
  enemies, spawn, cellRange, cellStart, cellItems, GW, nextHitId, setDamageSource, getDamageSource,
} from './world.js';
import {
  damageEnemy, damageCircle, applyBurn, applyChill, killEnemy, damageSourceId, srcOvl, setSrcType,
} from './combat.js';
import { OVERLOADS, ovlColor } from './data/overloads.js';
import { ZONE, ROLE } from './fx.js';
import { unlockIf } from './successes.js';

/** Procs (splash, chain, kill effects, expiry effects) allowed per simulation tick, all weapons. */
const PROC_BUDGET = 40;
let budget = PROC_BUDGET;

/** Effects, plugged in by main.js. Every one is optional. */
export const ovlFx = {
  arc: null,    // (x0, y0, x1, y1, color)
  ring: null,   // (x, y, r, color, life)
  burst: null,  // (x, y, n, color)
  bolt: null,   // (x, y, height, life)
  shake: null,  // (amount)
  banner: null, // (text, sub)
};

let M_STRAIGHT = 0, M_HOMING = 0;

/** Called once at boot, after initWeaponDefs, with weapons.js's motion lookup. */
export function initOverloads(motionOf) {
  M_STRAIGHT = motionOf('straight');
  M_HOMING = motionOf('homing');
}

/** Called at the start of every simulation tick. */
export function tickOverloads() { budget = PROC_BUDGET; }

/** A new run: nothing is overloaded. */
export function resetOverloads() { srcOvl.length = 0; budget = PROC_BUDGET; }

// --- Which weapon, which options ---------------------------------------------

/** The three overloads a weapon can take, or null if it has none. */
export const overloadOptions = (w) => OVERLOADS[w.def.id] || null;

/** At its last level, not yet overloaded, and with something to offer. */
export const overloadReady = (w) => !w.ovl && w.level >= w.def.levels.length && !!overloadOptions(w);

/** The first weapon, in slot order, waiting for its overload. */
export function weaponAwaitingOverload() {
  for (const w of G.weapons) if (overloadReady(w)) return w;
  return null;
}

/** Make `ov` this weapon's overload for the rest of the run. */
export function applyOverload(w, ov) {
  w.ovl = ov;
  w.fires = 0;
  w.cd = 0;                                  // the new form goes off at once
  register(w);
  unlockIf('overcharged', G.weapons.filter((x) => x.ovl).length >= 4);
  if (ovlFx.banner) ovlFx.banner(`${ov.name.toUpperCase()}!`, `${w.def.name.toUpperCase()} OVERLOADED`);
  const p = G.player;
  if (p) {
    if (ovlFx.ring) ovlFx.ring(p.x, p.y, 60, ov.color, 0.45);
    if (ovlFx.burst) ovlFx.burst(p.x, p.y, 24, ov.color);
    if (ovlFx.shake) ovlFx.shake(0.35);
  }
}

/** An evolved weapon keeps its overload; its source id changed, so the record moves with it. */
export function weaponEvolved(w, oldSrc) {
  srcOvl[oldSrc] = undefined;
  if (w.ovl) register(w);
}

function register(w) {
  const ov = w.ovl;
  const proc = damageSourceId(`o:${ov.id}`, ov.name);
  // A proc hits with its weapon's type, like the weapon itself.
  setSrcType(proc, w.def.type);
  srcOvl[w.srcId] = { def: ov, w, proc, color: ov.color };
}

// --- On hit -------------------------------------------------------------------

/** combat.js calls this for every hit landed by a source that has an overload. */
export function overloadHit(e, dealt, rec) {
  const h = rec.def.hit;
  if (!h) return;
  const base = rec.w.resolved.damage;

  if (h.burn) { applyBurn(e, base * h.burn, h.burnT || 3); if (h.toxic) e.dotKind = 1; }
  if (h.slow) applyChill(e, h.slow, h.slowT || 1.5);
  if (h.stun && G.rngRun() < h.stun.chance) e.stunT = Math.max(e.stunT, h.stun.t);
  if (h.sleep && !e.boss && !e.legend && G.rngRun() < h.sleep.chance) { e.stunT = Math.max(e.stunT, h.sleep.t); e.sleep = true; }
  if (h.weaken) e.weakenT = Math.max(e.weakenT, h.weaken);
  if (h.mark) { e.markT = Math.max(e.markT, h.mark.t); e.markMul = Math.max(e.markMul, h.mark.mul); }
  if (h.confuse && !e.boss && !e.legend) e.confuseT = Math.max(e.confuseT, h.confuse);
  if ((h.knock || h.pull) && !e.boss) {
    const p = G.player;
    const dx = e.x - p.x, dy = e.y - p.y;
    const d = Math.hypot(dx, dy) || 1;
    // The same impulse units as a weapon's own knockback: 100 is a firm shove.
    const k = ((h.knock || 0) - (h.pull || 0)) * (1 - e.knockResist);
    e.knockX += (dx / d) * k;
    e.knockY += (dy / d) * k;
  }
  if (h.leech && G.rngRun() < h.leech.chance) heal(h.leech.hp);
  if (h.execute && e.alive && !e.boss && !e.legend && e.hp > 0 && e.hp <= e.maxHp * h.execute) {
    if (ovlFx.burst) ovlFx.burst(e.x, e.y, 10, col(rec));
    killEnemy(e);
    return;
  }

  if (budget <= 0) return;
  // Bonus damage against something already suffering: shatter on the slowed or stunned, vsBurn
  // on the burning.
  const bonus = (h.shatter && (e.slowT > 0 || e.stunT > 0) ? h.shatter : 0)
    + (h.vsBurn && e.burnT > 0 ? h.vsBurn : 0);
  const splash = h.splash && (h.splash.chance === undefined || G.rngRun() < h.splash.chance);
  const chain = h.chain && G.rngRun() < h.chain.chance;
  if (!bonus && !splash && !chain) return;

  budget--;
  const prev = getDamageSource();
  setDamageSource(rec.proc);
  if (bonus && e.alive) {
    damageEnemy(e, dealt * bonus, 0, 0, false);
    if (ovlFx.burst) ovlFx.burst(e.x, e.y, 5, col(rec));
  }
  if (splash) {
    const r = h.splash.r;
    damageCircle(e.x, e.y, r, base * h.splash.dmg, nextHitId(), _quiet);
    if (ovlFx.ring) ovlFx.ring(e.x, e.y, r, col(rec), 0.2);
  }
  if (chain) chainFrom(e, h.chain.n, base * h.chain.dmg, h.chain.range || 90, col(rec));
  setDamageSource(prev);
}

const _quiet = { canCrit: false };

/** An overload's colour of the moment, for its effects. */
const col = (rec) => ovlColor(rec.def, G.clock);

// --- On kill ------------------------------------------------------------------

/** main.js's kill hook calls this when the killing blow came from an overloaded source. */
export function overloadKill(e, rec) {
  const k = rec.def.kill;
  if (!k) return;
  if (k.heal && G.rngRun() < k.heal.chance) heal(k.heal.hp);
  if (budget <= 0) return;
  budget--;
  const base = rec.w.resolved.damage;
  const prev = getDamageSource();
  setDamageSource(rec.proc);
  if (k.explode) {
    const r = k.explode.r;
    damageCircle(e.x, e.y, r, base * k.explode.dmg, nextHitId(), { knockback: k.explode.knock || 60, canCrit: false });
    if (ovlFx.ring) ovlFx.ring(e.x, e.y, r, col(rec), 0.3);
    if (ovlFx.burst) ovlFx.burst(e.x, e.y, 10, col(rec));
  }
  if (k.zone) dropZone(e.x, e.y, k.zone, base, rec);
  if (k.shards) burstShots(e.x, e.y, k.shards.n, base * k.shards.dmg, rec, false, G.rngFx() * TAU);
  if (k.wisps) burstShots(e.x, e.y, k.wisps.n, base * k.wisps.dmg, rec, true, G.rngFx() * TAU);
  if (k.chain) chainFrom(e, k.chain.n, base * k.chain.dmg, k.chain.range || 100, col(rec));
  setDamageSource(prev);
}

// --- When a shot ends ----------------------------------------------------------

/** weapons.js calls this when a shot of an overloaded weapon expires, lands or is spent. */
export function overloadExpire(pr, rec) {
  const x = rec.def.expire;
  if (x.chance !== undefined && G.rngRun() >= x.chance) return;
  if (budget <= 0) return;
  budget--;
  const base = rec.w.resolved.damage;
  const prev = getDamageSource();
  setDamageSource(rec.proc);
  if (x.blast) {
    const r = x.blast.r * (pr.area || 1);
    damageCircle(pr.x, pr.y, r, base * x.blast.dmg, nextHitId(), { knockback: x.blast.knock || 50, canCrit: false });
    if (ovlFx.ring) ovlFx.ring(pr.x, pr.y, r, col(rec), 0.28);
    if (ovlFx.burst) ovlFx.burst(pr.x, pr.y, 8, col(rec));
  }
  if (x.zone) dropZone(pr.x, pr.y, x.zone, base, rec);
  if (x.split) burstShots(pr.x, pr.y, x.split.n, base * x.split.dmg, rec, !!x.split.homing, Math.atan2(pr.vy, pr.vx));
  setDamageSource(prev);
}

// --- Every Nth trigger pull ------------------------------------------------------

/** weapons.js calls this on an overloaded weapon's every-Nth successful fire. */
export function overloadEvery(w, st, p) {
  const ev = w.ovl.every;
  const rec = srcOvl[w.srcId];
  if (!rec) return;
  const prev = getDamageSource();
  setDamageSource(rec.proc);
  if (ev.nova) {
    const z = spawn('zones');
    if (z) {
      const n = ev.nova;
      z.x = p.x; z.y = p.y;
      z.r = 1;
      z.maxLife = z.life = n.life || 0.6;
      z.dps = st.damage * n.dmg;
      z.tick = 0;
      z.slow = n.slow || 0;
      z.kind = ZONE.NOVA;
      z.color = n.color || col(rec);
      z.hitId = nextHitId();
      z.burn = n.burn ? st.damage * n.burn : 0;
      z.pull = n.r;
      if (n.knock !== undefined) z.knock = n.knock;
    }
  }
  if (ev.strike) strikes(p, ev.strike, st.damage, rec);
  if (ev.burst) burstShots(p.x, p.y, ev.burst.n, st.damage * ev.burst.dmg, rec, !!ev.burst.homing, G.rngFx() * TAU);
  if (ev.vortex) {
    const t = nearestFrom(p.x, p.y, 220, null);
    const v = ev.vortex;
    dropZone(t >= 0 ? enemies[t].x : p.x, t >= 0 ? enemies[t].y : p.y,
      { r: v.r, life: v.life, dps: v.dmg, vortex: v.pull, boom: v.boom, color: v.color }, st.damage, rec);
  }
  setDamageSource(prev);
}

/** Bolts (or meteors) from the sky onto a few enemies near the player. */
function strikes(p, s, dmg, rec) {
  const n = s.n || 2;
  let left = gather(p.x, p.y, s.range || 240, 16);
  for (let i = 0; i < n && left > 0; i++) {
    // Pick from what is left at random, then swap it out so no enemy is struck twice.
    const j = (G.rngFx() * left) | 0;
    const e = _gathered[j];
    _gathered[j] = _gathered[left - 1];
    left--;
    if (!e.alive) continue;
    const r = s.r || 24;
    damageCircle(e.x, e.y, r, dmg * s.dmg, nextHitId(), {
      stun: s.stun || 0, burn: s.burn ? dmg * s.burn : 0, burnT: 3, knockback: 40, canCrit: true,
    });
    if (s.kind === 'meteor') {
      if (ovlFx.ring) ovlFx.ring(e.x, e.y, r, s.color || col(rec), 0.35);
      if (ovlFx.burst) ovlFx.burst(e.x, e.y, 14, s.color || col(rec));
    } else if (ovlFx.bolt) {
      ovlFx.bolt(e.x, e.y, 130, 0.22);
      if (ovlFx.ring) ovlFx.ring(e.x, e.y, r, s.color || col(rec), 0.2);
    }
  }
  if (ovlFx.shake && n > 0) ovlFx.shake(0.12);
}

// --- Substitute dolls --------------------------------------------------------------

/** A doll of an overloaded Substitute has just fallen. */
export function overloadDollDown(d, rec) {
  const k = rec.def.decoy;
  if (!k) return;
  const prev = getDamageSource();
  setDamageSource(rec.proc);
  const power = G.stats ? G.stats.power : 1;
  if (k.explode) {
    damageCircle(d.x, d.y, k.explode.r, k.explode.dmg * power, nextHitId(), { knockback: 130, canCrit: true });
    if (ovlFx.ring) ovlFx.ring(d.x, d.y, k.explode.r, col(rec), 0.4);
    if (ovlFx.burst) ovlFx.burst(d.x, d.y, 18, col(rec));
    if (ovlFx.shake) ovlFx.shake(0.3);
  }
  if (k.heal && G.stats) heal(Math.round(G.stats.maxHp * k.heal));
  setDamageSource(prev);
}

/** A doll of an overloaded Substitute is standing. Taunt pulses and shots run on its own clock. */
export function overloadDollTick(d, rec, dt) {
  const k = rec.def.decoy;
  if (!k || (!k.taunt && !k.shoot)) return;
  d.tick -= dt;
  if (d.tick > 0) return;
  const prev = getDamageSource();
  setDamageSource(rec.proc);
  const power = G.stats ? G.stats.power : 1;
  if (k.taunt) {
    d.tick = 0.5;
    damageCircle(d.x, d.y, k.taunt.r, k.taunt.dps * 0.5 * power, nextHitId(), { canCrit: false, slow: k.taunt.slow || 0, slowT: 0.8 });
    if (ovlFx.ring) ovlFx.ring(d.x, d.y, k.taunt.r, col(rec), 0.25);
  }
  if (k.shoot) {
    d.tick = k.shoot.gap;
    const t = nearestFrom(d.x, d.y, 180, null);
    if (t >= 0) {
      const e = enemies[t];
      burstShots(d.x, d.y, 1, k.shoot.dmg * power, rec, true, Math.atan2(e.y - d.y, e.x - d.x));
    }
  }
  setDamageSource(prev);
}

// --- Shared pieces ------------------------------------------------------------------

function heal(n) {
  const p = G.player;
  if (!p || !G.stats) return;
  p.hp = Math.min(G.stats.maxHp, p.hp + n);
}

/** Arc from `from` to up to `n` nearby enemies it has not reached, each taking `dmg`. */
const _chained = [];
function chainFrom(from, n, dmg, range, color) {
  _chained.length = 0;
  _chained.push(from);
  let x = from.x, y = from.y;
  for (let j = 0; j < n; j++) {
    const idx = nearestFrom(x, y, range, _chained);
    if (idx < 0) break;
    const e = enemies[idx];
    _chained.push(e);
    if (ovlFx.arc) ovlFx.arc(x, y, e.x, e.y, color);
    damageEnemy(e, dmg, 0, 0, false);
    x = e.x; y = e.y;
  }
}

/** Nearest live, non-scenery enemy within `range`, skipping any in `skip`. Index, or -1. */
function nearestFrom(x, y, range, skip) {
  const r = cellRange(x, y, range);
  if (!r) return -1;
  let best = -1, bestD = range * range;
  for (let gy = r.y0; gy <= r.y1; gy++) {
    const rowBase = gy * GW;
    for (let gx = r.x0; gx <= r.x1; gx++) {
      const c = rowBase + gx;
      const end = cellStart[c + 1];
      for (let k = cellStart[c]; k < end; k++) {
        const j = cellItems[k];
        const e = enemies[j];
        if (!e.alive || e.prop || (skip && skip.includes(e))) continue;
        const d = dist2(x, y, e.x, e.y);
        if (d < bestD) { bestD = d; best = j; }
      }
    }
  }
  return best;
}

/** Up to `max` live enemies within `range`, into _gathered. Returns how many. */
const _gathered = [];
function gather(x, y, range, max) {
  _gathered.length = 0;
  const r = cellRange(x, y, range);
  if (!r) return 0;
  const r2 = range * range;
  for (let gy = r.y0; gy <= r.y1 && _gathered.length < max; gy++) {
    const rowBase = gy * GW;
    for (let gx = r.x0; gx <= r.x1 && _gathered.length < max; gx++) {
      const c = rowBase + gx;
      const end = cellStart[c + 1];
      for (let k = cellStart[c]; k < end && _gathered.length < max; k++) {
        const e = enemies[cellItems[k]];
        if (e.alive && !e.prop && dist2(x, y, e.x, e.y) <= r2) _gathered.push(e);
      }
    }
  }
  return _gathered.length;
}

/**
 * Lay a zone for an overload: a bog, a pool of fire, a sinkhole (`vortex` is its pull), or a
 * delayed blast (a zone that does nothing until its `boom` goes off). Damage figures are shares
 * of the weapon's current damage.
 */
function dropZone(x, y, zd, base, rec) {
  const z = spawn('zones');
  if (!z) return;
  z.x = x; z.y = y;
  z.r = zd.r;
  z.maxLife = z.life = zd.life;
  z.dps = base * (zd.dps || 0);
  z.tick = 0;
  z.slow = zd.slow || 0;
  z.kind = zd.vortex ? ZONE.VORTEX : zd.burn ? ZONE.BURN : (zd.dark ? ZONE.DARK : ZONE.PLAIN);
  z.color = zd.color || col(rec);
  z.hitId = 0;
  z.burn = zd.burn ? base * zd.burn : 0;
  z.pull = zd.vortex || 0;
  z.boom = zd.boom ? base * zd.boom : 0;
}

/**
 * A ring of small shots from (x, y), made of the weapon's own projectile: shards that fly
 * straight, or wisps that home. Marked as shards, so they never trigger an expiry of their own.
 */
function burstShots(x, y, n, dmg, rec, homing, a0) {
  const def = rec.w.def;
  const hitId = nextHitId();
  const color = (rec.def.fx && rec.def.fx.trail) || col(rec);
  for (let i = 0; i < n; i++) {
    const pr = spawn('projectiles');
    if (!pr) return;
    const a = a0 + (n === 1 ? 0 : (i / n) * TAU);
    const sp = homing ? 200 : 250;
    pr.x = pr.ox = x; pr.y = pr.oy = y;
    pr.vx = Math.cos(a) * sp; pr.vy = Math.sin(a) * sp;
    pr.angle = a;
    pr.r = pr.r0 = homing ? 5 : 4;
    pr.dmg = dmg;
    pr.pierce = homing ? 0 : 1;
    pr.life = 0;
    pr.maxLife = homing ? 1.6 : 0.6;
    pr.motion = homing ? M_HOMING : M_STRAIGHT;
    pr.homingTurn = homing ? 7 : 0;
    pr.targetIdx = -1;
    pr.sprBase = def.sprBase; pr.nd = def.sprDirs;
    pr.knockback = 10; pr.weapon = -1; pr.area = 1; pr.hitId = hitId;
    pr.trail = 14; pr.trailColor = color; pr.pulse = 0;
    pr.impact = 4; pr.impactColor = col(rec);
    pr.spin = 6; pr.amp = 0; pr.freq = 0; pr.returning = false; pr.crit = false;
    pr.orbitA = 0; pr.orbitR = 0; pr.z = 0;
    pr.bounces = 0; pr.fuse = 0; pr.emitT = 0; pr.gen = ROLE.SHARD; pr.payload = 0; pr.t = 0;
    pr.burn = 0; pr.burnT = 3; pr.slow = 0;
    pr.vis = 0.8;
  }
}

// --- The card -------------------------------------------------------------------------

/**
 * Short keyword chips for an overload's card, worked out from what it actually does, so the card
 * can never advertise something the data does not contain. An entry's own `chips` win.
 */
const _chips = new Map();
export function chipsFor(ov) {
  if (ov.chips) return ov.chips;
  let c = _chips.get(ov);
  if (c) return c;
  c = [];
  const P = { ring: 'RING', twin: 'TWIN', cross: 'CROSS', fan: 'WIDE FAN', spiral: 'SPIRAL', volley: `${ov.volley || 3}x VOLLEY` };
  if (ov.pattern) c.push(P[ov.pattern]);
  const s = ov.stats || {};
  if (s.damage && s.damage >= 1.1) c.push(`+${Math.round((s.damage - 1) * 100)}% DMG`);
  if (s.amount) c.push(`+${s.amount} SHOTS`);
  if (s.area && s.area > 1) c.push(`+${Math.round((s.area - 1) * 100)}% AREA`);
  if (s.cooldown && s.cooldown < 1) c.push('FASTER');
  if (s.bounces) c.push(`+${s.bounces} BOUNCE`);
  if (s.shards) c.push(`+${s.shards} SHARDS`);
  if (s.jumps) c.push(`+${s.jumps} JUMPS`);
  if (s.pierce) c.push(`+${s.pierce} PIERCE`);
  if (s.duration && s.duration > 1) c.push(`+${Math.round((s.duration - 1) * 100)}% DURATION`);
  if (s.knockback && s.knockback > 1) c.push('KNOCKBACK');
  const z = ov.zone || {};
  if (z.r && z.r > 1) c.push(`+${Math.round((z.r - 1) * 100)}% SIZE`);
  if (z.pull && z.pull > 1) c.push(`+${Math.round((z.pull - 1) * 100)}% PULL`);
  if (z.life && z.life > 1) c.push(`+${Math.round((z.life - 1) * 100)}% DURATION`);
  if (z.slow) c.push('SLOW');
  if (z.knock !== undefined && z.knock < 0) c.push('PULLS IN');
  const tu = ov.turret || {};
  if (tu.gap) c.push('RAPID FIRE');
  if (tu.dmg && tu.dmg > 1) c.push(`+${Math.round((tu.dmg - 1) * 100)}% DMG`);
  if (tu.range && tu.range > 1) c.push('LONG RANGE');
  const ob = ov.orbit || {};
  if (ob.r && ob.r > 1) c.push(`+${Math.round((ob.r - 1) * 100)}% RADIUS`);
  if (ob.spin && ob.spin > 1) c.push('FASTER SPIN');
  const h = ov.hit || {};
  if (h.burn) c.push(h.toxic ? 'TOXIC' : 'BURN');
  if (h.slow) c.push('SLOW');
  if (h.stun) c.push('STUN');
  if (h.sleep) c.push('SLEEP');
  if (h.mark) c.push('MARK');
  if (h.weaken) c.push('WEAKEN');
  if (h.confuse) c.push('CONFUSE');
  if (h.chain) c.push('CHAIN');
  if (h.splash) c.push('SPLASH');
  if (h.execute) c.push('EXECUTE');
  if (h.leech) c.push('LEECH');
  if (h.shatter || h.vsBurn) c.push('COMBO');
  if (h.pull) c.push('PULL');
  if (h.knock) c.push('KNOCKBACK');
  const k = ov.kill || {};
  if (k.explode) c.push('KO BLAST');
  if (k.shards) c.push('KO SHARDS');
  if (k.wisps) c.push('KO WISPS');
  if (k.zone) c.push('KO POOL');
  if (k.heal) c.push('KO HEAL');
  const x = ov.expire || {};
  if (x.blast) c.push('BLAST');
  if (x.zone) c.push('POOLS');
  if (x.split) c.push('SPLIT');
  const ev = ov.every || {};
  if (ev.nova) c.push('NOVA');
  if (ev.strike) c.push(ev.strike.kind === 'meteor' ? 'METEORS' : 'LIGHTNING');
  if (ev.burst) c.push('BURST');
  if (ev.vortex) c.push('BLACK HOLE');
  if (ov.homing) c.push('HOMING');
  if (ov.grow) c.push('GROWS');
  if (ov.size && ov.size > 1) c.push('BIGGER');
  if (ov.link) c.push(`+${ov.link.targets} LINKS`);
  if (ov.chainFork) c.push(`${1 + ov.chainFork} CHAINS`);
  if (ov.sweepFull) c.push('FULL CIRCLE');
  if (ov.emit) c.push('SHOOTS');
  if (ov.turret && ov.turret.barrels) c.push(`${ov.turret.barrels} BARRELS`);
  if (ov.zone && ov.zone.boom) c.push('COLLAPSE');
  if (ov.orbit && ov.orbit.pulse) c.push('PULSING');
  const d = ov.decoy || {};
  if (d.explode) c.push('EXPLODES');
  if (d.taunt) c.push('TAUNT');
  if (d.heal) c.push('HEALS');
  if (d.shoot) c.push('SHOOTS');
  _chips.set(ov, c);
  return c;
}
