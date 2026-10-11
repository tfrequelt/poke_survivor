// L3 -- may import L0-L2 and the move framework (moves/core.js).
//
// Poison: the new Acid Spray, Clear Smog and Toxic, and the overload mechanics of Toxic Trail,
// Sludge Bomb, Gunk Shot (Sludge Bomb's evolution) and Toxic Spikes. Drawing is draw_poison.js.

import { G } from '../state.js';
import { TAU } from '../util.js';
import { projectiles, nextHitId, getDamageSource, setDamageSource } from '../world.js';
import { damageEnemy, damageCircle, damageLine, applyBurn } from '../combat.js';
import { spawnSpr } from '../sprfx.js';
import { spawnSeq } from '../seqfx.js';
import { registerMech } from '../mechs.js';
import { ROLE } from '../fx.js';
import {
  KIND, vk, actors, MOVE_CAP as CAP, registerMoves, take, child, free, mech, lvSum, procOf,
  nearest, nearestN, each, movable, settle, ovProc, once, mark, eachMarked,
} from './core.js';

export const PK = {
  GLOB: KIND.poison,           // an acid glob in flight
  ACID: KIND.poison + 1,       // an acid puddle
  SMOG: KIND.poison + 2,       // Clear Smog's bubble
  NEEDLE: KIND.poison + 3,     // Toxic's needle in flight
  TOXIC: KIND.poison + 4,      // Toxic's poison in a foe, doubling
  PUFF: KIND.poison + 5,       // a little cloud carried by a foe (Contagion Cloud)
  DROP: KIND.poison + 6,       // Splatter's droplet, then its puddle
  WIRE: KIND.poison + 7,       // Barbed Wire's strands, drawn
  BREATH: KIND.poison + 8,     // Smog Breath: the smog bubble riding in front of you
};

function count(kind, src) {
  let n = 0;
  for (let i = 0; i < CAP; i++) if (actors[i].on && actors[i].kind === kind && actors[i].src === src) n++;
  return n;
}
function asProc(rec, fn) {
  const prev = getDamageSource();
  if (rec) setDamageSource(rec.proc);
  fn();
  setDamageSource(prev);
}
function toxicOn(e, src) {
  for (let i = 0; i < CAP; i++) {
    const a = actors[i];
    if (a.on && a.kind === PK.TOXIC && a.src === src && a.target === e && a.tsn === e.sn) return a;
  }
  return null;
}
/** The foe with the most others close round it, of the nearest few. */
function densest(x, y, range) {
  const L = nearestN(x, y, range, 10);
  let best = null, bn = -1;
  for (let i = 0; i < L.length; i++) {
    let n = 0;
    each(L[i].x, L[i].y, 34, () => { n++; });
    if (n > bn) { bn = n; best = L[i]; }
  }
  return best;
}

/** Strip a foe of what protects it: its shield, its Barrier, its Tailwind, its windup. */
function cleanse(e) {
  let did = false;
  if (e.shieldHp > 0) { e.shieldHp = 0; e.shieldT = 0; did = true; }
  if (e.protT > 0) { e.protT = 0; e.protLast = G.clock; did = true; }
  if (e.tailT > 0) { e.speed /= e.tailMul; e.tailMul = 1; e.tailT = 0; did = true; }
  if (e.specWind > 0) { e.specWind = 0; did = true; }
  return did;
}

/** Melt a point of armour away, for good. */
function melt(e, floor) {
  if (e.armor > floor) e.armor -= 1;
}

export const POISON_BEHAVIOR = {
  /** Acid Spray: globs of acid that land as puddles. What wades in loses its armour for good. */
  acidSpray(w, st, p) {
    const def = w.def;
    const t = nearest(p.x, p.y, def.range * st.range);
    if (!t) return false;
    const n = Math.max(1, Math.round(st.amount));
    const wave = mech(w.ovl, 'acidWave');
    const base = Math.atan2(t.y - p.y, t.x - p.x);
    for (let i = 0; i < n; i++) {
      const a = take(PK.GLOB, w);
      if (!a) break;
      const ang = base + (n === 1 ? 0 : (i / (n - 1) - 0.5) * 0.9);
      const d = Math.min(def.range * st.range, Math.hypot(t.x - p.x, t.y - p.y)) * (0.7 + G.rngRun() * 0.5);
      a.ox = p.x; a.oy = p.y - 4; a.x = a.ox; a.y = a.oy;
      a.tx = p.x + Math.cos(ang) * d; a.ty = p.y + Math.sin(ang) * d;
      a.life = 0.4; a.dmg = st.damage; a.area = st.area; a.k = st.duration; a.a = ang;
      a.fixed = !!wave;
    }
    return true;
  },

  /** Clear Smog: a drifting bubble of smog that strips foes of shields, barriers and haste. */
  clearSmog(w, st, p) {
    const def = w.def;
    const br = mech(w.ovl, 'smogBreath');
    if (br) {
      if (count(PK.BREATH, w.srcId)) return false;
      const a = take(PK.BREATH, w);
      if (!a) return true;
      a.life = st.duration; a.r = (def.smogR || 26) * st.area * 0.8; a.dmg = st.damage; a.k = 0; a.step = 0;
      return true;
    }
    const e = densest(p.x, p.y, def.range * st.range);
    if (!e) return false;
    const a = take(PK.SMOG, w);
    if (!a) return true;
    a.x = p.x; a.y = p.y - 4; a.target = e; a.tsn = e.sn;
    a.life = st.duration; a.r = (def.smogR || 26) * st.area; a.z0 = a.r;     // z0: its starting reach
    a.dmg = st.damage; a.k = 0; a.step = 0;
    return true;
  },

  /** Toxic: a needle whose poison doubles with every tick. */
  toxic(w, st, p) {
    const def = w.def;
    const L = nearestN(p.x, p.y, def.range * st.range, 8);
    let e = null;
    for (const o of L) if (!toxicOn(o, w.srcId)) { e = o; break; }
    if (!e) return false;
    const a = take(PK.NEEDLE, w);
    if (!a) return true;
    a.x = p.x; a.y = p.y - 6; a.target = e; a.tsn = e.sn; a.life = 1; a.dmg = st.damage; a.k = st.duration;
    return true;
  },
};

// --- Acid Spray -----------------------------------------------------------------------------

function globStep(a) {
  const k = Math.min(1, a.t / a.life);
  a.x = a.ox + (a.tx - a.ox) * k; a.y = a.oy + (a.ty - a.oy) * k;
  a.z = Math.sin(k * Math.PI) * 22;
}

function globEnd(a) {
  const b = child(PK.ACID, a);
  if (!b) return;
  b.x = a.x; b.y = a.y; b.life = a.k; b.r = (a.def.puddleR || 14) * a.area;
  b.dmg = a.dmg; b.k = 0; b.a = a.a; b.fixed = a.fixed;
  if (a.fixed) b.r *= 1.3;                    // an Acid Wave spreads wider as it creeps
  spawnSeq('fx_eos_acid', a.x, a.y - 4, { dur: 0.3, fps: 24, scale: 1 });
}

function acidStep(a, dt) {
  // Acid Wave: the puddle creeps on along the throw.
  if (a.fixed && a.t < 1.6) { a.x += Math.cos(a.a) * 50 * dt; a.y += Math.sin(a.a) * 50 * dt; }
  a.k -= dt;
  if (a.k > 0) return;
  a.k = 0.5;
  const floor = -(a.def.meltMax || 6);
  const mm = mech(a.ov, 'meltdown');
  each(a.x, a.y, a.r, (e) => {
    melt(e, floor);
    damageEnemy(e, a.dmg, 0, 0, false);
    // Meltdown: a foe with nothing left to melt takes half as much again from everything.
    if (mm && e.armor <= floor) { e.markT = Math.max(e.markT, 0.6); e.markMul = Math.max(e.markMul, mm.mul || 0.5); }
  });
  const cg = mech(a.ov, 'corrosiveGas');
  if (cg) {
    // Corrosive Gas: the puddle fumes, and the fumes eat at armour round it too, more slowly.
    a.step = (a.step || 0) + 1;
    if (a.step % 2 === 0) each(a.x, a.y, a.r + (cg.reach || 22), (e) => melt(e, floor));
  }
}

registerMech('meltdown', {});
registerMech('acidWave', {});
registerMech('corrosiveGas', {});

// --- Clear Smog -----------------------------------------------------------------------------

function smogStep(a, dt) {
  // Drifting slowly after the crowd it was thrown at.
  const e = a.target && a.target.alive && a.target.sn === a.tsn ? a.target : nearest(a.x, a.y, 160);
  if (e) {
    a.target = e; a.tsn = e.sn;
    const dx = e.x - a.x, dy = e.y - a.y, d = Math.hypot(dx, dy) || 1;
    if (d > 4) { a.x += (dx / d) * (a.def.drift || 34) * dt; a.y += (dy / d) * (a.def.drift || 34) * dt; }
  }
  const ts = mech(a.ov, 'thickSmog');
  if (ts) a.r = a.z0 * (1 + (ts.grow || 0.6) * Math.min(1, a.t / a.life));
  smogTouch(a, dt);
}

function breathStep(a, dt, p) {
  // Smog Breath: the smog rides just in front of you, wherever you face.
  if (!p) return;
  const t = nearest(p.x, p.y, 120);
  const ang = t ? Math.atan2(t.y - p.y, t.x - p.x) : (p.dir ? 0 : Math.PI);
  a.x = p.x + Math.cos(ang) * 26; a.y = p.y + Math.sin(ang) * 20;
  smogTouch(a, dt);
}

function smogTouch(a, dt) {
  const hz = mech(a.ov, 'haze');
  each(a.x, a.y, a.r, (e) => {
    // Once each: whatever protects it is stripped.
    if (once(a, e) && cleanse(e)) spawnSpr('guard_break', e.x, e.y - 6, '#c8c0a0', 0.9);
    if (hz && movable(e)) e.confuseT = Math.max(e.confuseT, 0.4);
  });
  a.k -= dt;
  if (a.k > 0) return;
  a.k = 0.5;
  a.step++;
  const cough = a.step % 3 === 0;
  each(a.x, a.y, a.r, (e) => {
    damageEnemy(e, a.dmg, 0, 0, true);
    // It coughs them out of what they were about to do.
    if (cough && !e.boss && !e.legend) { e.stunT = Math.max(e.stunT, 0.25); e.specWind = 0; }
  });
}

registerMech('thickSmog', {});
registerMech('smogBreath', {});
registerMech('haze', {});

// --- Toxic ----------------------------------------------------------------------------------

function needleStep(a, dt) {
  const e = a.target;
  if (!e || !e.alive || e.sn !== a.tsn) { free(a); return; }
  const dx = e.x - a.x, dy = e.y - 4 - a.y, d = Math.hypot(dx, dy) || 1;
  a.a = Math.atan2(dy, dx);
  const sp = 340 * dt;
  if (d > sp + e.r) { a.x += (dx / d) * sp; a.y += (dy / d) * sp; return; }
  poisonFoe(a, e, a.k, 0);
  free(a);
}

function poisonFoe(a, e, life, n0) {
  const o = toxicOn(e, a.src);
  if (o) { o.life = Math.max(o.life, o.t + life); return; }
  const t = child(PK.TOXIC, a);
  if (!t) return;
  t.target = e; t.tsn = e.sn; t.life = life; t.k = 0.5; t.n = n0; t.dmg = a.dmg;
  const bp = mech(a.ov, 'badlyPoisoned');
  t.idx = (a.def.doublings || 5) + (bp ? bp.more || 2 : 0);
  if (bp) t.life += 1;
  spawnSpr('death_flash', e.x, e.y - 6, '#c070e0', 0.7);
}

function toxicStep(a, dt) {
  const e = a.target;
  if (!e || !e.alive || e.sn !== a.tsn) { free(a); return; }
  a.x = e.x; a.y = e.y;
  a.k -= dt;
  if (a.k > 0) return;
  const bp = mech(a.ov, 'badlyPoisoned');
  a.k = bp ? 0.6 : 0.5;
  // Doubling, tick on tick, up to its cap; a boss's poison stops doubling sooner.
  const cap = e.boss || e.legend ? Math.min(3, a.idx) : a.idx;
  const d = a.dmg * Math.pow(2, Math.min(a.n, cap));
  a.n++;
  a.step += d;
  damageEnemy(e, d, 0, 0, false);
  if (a.n >= 3) spawnSeq('fx_eos_acid', e.x, e.y - e.r - 2, { dur: 0.25, fps: 30, scale: 0.6 });
}

function toxicEnd(a) {
  const e = a.target;
  const ts = mech(a.ov, 'toxicSurge');
  if (ts && e && e.alive && e.sn === a.tsn) {
    // Toxic Surge: at its last tick the poison bursts out of the foe, over those round it.
    damageCircle(e.x, e.y, ts.r || 26, a.step * (ts.share || 0.4), nextHitId(), { canCrit: false });
    spawnSeq('fx_eos_goo', e.x, e.y - 6, { dur: 0.35, fps: 30, scale: 0.4 });
  }
}

registerMech('badlyPoisoned', {});
registerMech('toxicBloom', {
  // A foe that dies of the poison passes it on, as strong as it had grown, to the two nearest.
  kill(e, rec, cfg) {
    let t = null;
    for (let i = 0; i < CAP; i++) {
      const a = actors[i];
      if (a.on && a.kind === PK.TOXIC && a.src === rec.w.srcId && a.target === e) { t = a; break; }
    }
    if (!t) return;
    const L = nearestN(e.x, e.y, cfg.range || 80, 3);
    let k = 0;
    for (const o of L) {
      if (o === e || k >= (cfg.n || 2) || toxicOn(o, t.src)) continue;
      k++;
      poisonFoe(t, o, Math.max(1, t.life - t.t), Math.max(0, t.n - 1));
      spawnSpr('ring_s', o.x, o.y - 4, '#c070e0', 0.8);
    }
  },
});
registerMech('toxicSurge', {});

// --- Toxic Trail's overloads (a trail) ------------------------------------------------------

registerMech('miasma', {
  // The clouds do not stay put: each drifts after the nearest foe until it fades.
  zone(z, rec, dt, cfg) {
    const e = nearest(z.x, z.y, cfg.range || 120);
    if (!e) return;
    const dx = e.x - z.x, dy = e.y - z.y, d = Math.hypot(dx, dy) || 1;
    if (d > 4) { z.x += (dx / d) * (cfg.speed || 40) * dt; z.y += (dy / d) * (cfg.speed || 40) * dt; }
  },
});

registerMech('smokescreen', {
  // Stand in your own cloud and the crowd loses you: foes near you wander about, confused.
  tick(w, dt, p, cfg) {
    if (!p || (G.tick & 7)) return;
    // The trail remembers the last cloud it laid; standing in it is standing in your smoke.
    const z = w.lastCloud;
    if (!z || !z.alive || Math.hypot(p.x - z.x, p.y - z.y) > z.r) return;
    each(p.x, p.y, cfg.range || 130, (e) => { if (movable(e)) e.confuseT = Math.max(e.confuseT, 0.3); });
  },
  lay(z, w) { w.lastCloud = z; },
});

registerMech('contagionCloud', {
  // A foe that wades out of a cloud carries a little of it along for 2s, hurting those beside it.
  zone(z, rec, dt, cfg) {
    if (G.tick % 10) return;
    each(z.x, z.y, z.r, (e) => {
      if (!movable(e) || count(PK.PUFF, rec.proc) >= (cfg.max || 10)) return;
      for (let i = 0; i < CAP; i++) { const a = actors[i]; if (a.on && a.kind === PK.PUFF && a.target === e) return; }
      const a = take(PK.PUFF, procOf(rec));
      if (!a) return;
      a.target = e; a.tsn = e.sn; a.life = cfg.t || 2; a.dmg = rec.w.resolved.damage * (cfg.dmg || 0.3); a.k = 0.5; a.r = 18;
    });
  },
});

function puffStep(a, dt) {
  const e = a.target;
  if (!e || !e.alive || e.sn !== a.tsn) { free(a); return; }
  a.x = e.x; a.y = e.y;
  a.k -= dt;
  if (a.k > 0) return;
  a.k = 0.5;
  each(a.x, a.y, a.r, (o) => { if (o !== e) damageEnemy(o, a.dmg, 0, 0, false); });
}

// --- Sludge Bomb's overloads (a mine) -------------------------------------------------------

const isMine = (pr) => pr.gen === ROLE.MINE;

registerMech('glue', {
  // A blast glues what it catches where it stands for 2s, and drags those near the edge in.
  expire(pr, rec, cfg) {
    if (!isMine(pr)) return;
    const R = (pr.payload || 40) * vk(pr.area);
    each(pr.x, pr.y, R * 1.4, (e) => {
      if (!movable(e)) return;
      const dx = pr.x - e.x, dy = pr.y - e.y, d = Math.hypot(dx, dy) || 1;
      if (d > R) { e.x += (dx / d) * (d - R * 0.8); e.y += (dy / d) * (d - R * 0.8); settle(e); }
      mark(rec.w, 'glueL', e, cfg.t || 2);
    });
  },
  tick(w) {
    eachMarked(w, 'glueL', (e) => { e.slow = Math.max(e.slow, w.ovl.move.glue.slow || 0.7); e.slowT = Math.max(e.slowT, 0.2); });
  },
});

registerMech('rollingSludge', {
  // The globs will not sit still: armed, they creep toward the nearest foe.
  shot(pr, rec, dt, cfg) {
    if (!isMine(pr) || pr.z > 2) return false;
    const e = nearest(pr.x, pr.y, cfg.range || 140);
    if (!e) return false;
    const dx = e.x - pr.x, dy = e.y - pr.y, d = Math.hypot(dx, dy) || 1;
    if (d > 4) { pr.x += (dx / d) * (cfg.speed || 32) * dt; pr.y += (dy / d) * (cfg.speed || 32) * dt; }
    return false;
  },
});

registerMech('splatter', {
  // A blast flings four droplets that land as little puddles, burning for 2s.
  expire(pr, rec, cfg) {
    if (!isMine(pr)) return;
    for (let i = 0; i < (cfg.n || 4); i++) {
      const a = take(PK.DROP, rec.w);
      if (!a) return;
      const ang = (i / (cfg.n || 4)) * TAU + G.rngFx() * 0.6, d = 30 + G.rngFx() * 20;
      a.ox = pr.x; a.oy = pr.y; a.tx = pr.x + Math.cos(ang) * d; a.ty = pr.y + Math.sin(ang) * d * 0.7;
      a.x = a.ox; a.y = a.oy; a.life = (cfg.t || 2) + 0.35; a.dmg = rec.w.resolved.damage * (cfg.dmg || 0.35);
      a.r = 12; a.k = 0.35;
    }
  },
});

function dropStep(a, dt) {
  if (a.t < 0.35) {
    const k = a.t / 0.35;
    a.x = a.ox + (a.tx - a.ox) * k; a.y = a.oy + (a.ty - a.oy) * k; a.z = Math.sin(k * Math.PI) * 16;
    return;
  }
  a.z = 0;
  a.k -= dt;
  if (a.k > 0) return;
  a.k = 0.5;
  damageCircle(a.x, a.y, a.r, a.dmg, nextHitId(), { canCrit: false, slow: 0.25, slowT: 0.6 });
}

// --- Gunk Shot's overloads ------------------------------------------------------------------

registerMech('toxicWaste', {
  // The pools it leaves spread, growing by half again over their life.
  zone(z, rec, dt, cfg) {
    // `mx` is the zone's own scratch slot (world.js): here, the radius it was laid at.
    if (!z.mx) z.mx = z.r;
    const g = cfg.grow || 1.5;
    z.r = Math.min(z.mx * g, z.r + (z.mx * (g - 1) * dt) / Math.max(0.5, z.maxLife));
  },
});

registerMech('stench', {
  // The stink of its pools drives the crowd away from them.
  zone(z, rec, dt, cfg) {
    each(z.x, z.y, z.r * (cfg.reach || 1.6), (e) => {
      if (!movable(e)) return;
      const dx = e.x - z.x, dy = e.y - z.y, d = Math.hypot(dx, dy) || 1;
      e.x += (dx / d) * (cfg.push || 60) * dt; e.y += (dy / d) * (cfg.push || 60) * dt;
      settle(e);
    });
  },
});

registerMech('sludgeQuake', {
  // Where a glob bursts the ground heaves: everything round it is thrown up and stunned.
  expire(pr, rec, cfg) {
    if (!isMine(pr)) return;
    const R = (pr.payload || 40) * vk(pr.area) * (cfg.r || 1.3);
    damageCircle(pr.x, pr.y, R, rec.w.resolved.damage * (cfg.dmg || 0.4), nextHitId(), { stun: cfg.stun || 0.6, canCrit: false });
    spawnSpr('land_dust', pr.x, pr.y, '#a070c0', 1.2);
  },
});

// --- Toxic Spikes's overloads (an orbit laid on the ground) ---------------------------------

const isSpike = (pr, rec) => pr.gen === ROLE.SHOT && pr.weapon === rec.w.defIdx;

registerMech('venomBarbs', {
  // The barbs envenom: each prick adds a dose to the foe's poison, up to five, each dose stronger.
  hit(e, dealt, rec, crit, cfg) {
    const i = mark(rec.w, 'barbL', e, cfg.t || 3);
    if (i < 0) return;
    const L = rec.w.barbL;
    L[i + 3] = Math.min(cfg.max || 5, L[i + 3] + 1);
    applyBurn(e, rec.w.resolved.damage * (cfg.per || 0.12) * L[i + 3], 2);
    e.dotKind = 1;
  },
});

registerMech('caltrops', {
  // The barbs do not stay round your feet: they scatter out to a wide ring and stay there.
  shot(pr, rec, dt, cfg) {
    if (!isSpike(pr, rec)) return false;
    if (pr.orbitR < (cfg.r || 92)) pr.orbitR = Math.min(cfg.r || 92, pr.orbitR + (cfg.speed || 140) * dt);
    return false;
  },
});

registerMech('barbedWire', {
  // Wire strung from barb to barb: whatever crosses a strand is cut.
  tick(w, dt, p, cfg, rec) {
    w.wireT = (w.wireT || 0) - dt;
    if (w.wireT > 0) return;
    w.wireT = cfg.gap || 0.3;
    const pts = [];
    for (let i = 0; i < projectiles.length; i++) {
      const q = projectiles[i];
      if (q.alive && !q.hostile && q.weapon === w.defIdx && q.gen === ROLE.SHOT) pts.push(q);
    }
    if (pts.length < 2) return;
    // Round the ring in order, so the wire is a fence and not a cat's cradle.
    let cx = 0, cy = 0;
    for (const q of pts) { cx += q.x; cy += q.y; }
    cx /= pts.length; cy /= pts.length;
    pts.sort((a, b) => Math.atan2(a.y - cy, a.x - cx) - Math.atan2(b.y - cy, b.x - cx));
    const id = nextHitId();
    let wire = null;
    for (let i = 0; i < CAP; i++) if (actors[i].on && actors[i].kind === PK.WIRE && actors[i].src === w.srcId) { wire = actors[i]; break; }
    if (!wire) { wire = take(PK.WIRE, w); if (wire) wire.life = 1e9; }
    if (wire) { wire.pts.length = 0; wire.t = 0; }
    asProc(rec, () => {
      for (let i = 0; i < pts.length; i++) {
        const a = pts[i], b = pts[(i + 1) % pts.length];
        const len = Math.hypot(b.x - a.x, b.y - a.y);
        if (len > 120) continue;
        damageLine(a.x, a.y, Math.atan2(b.y - a.y, b.x - a.x), len, 4, w.resolved.damage * (cfg.dmg || 0.35), id, { canCrit: false });
        if (wire) wire.pts.push(a.x, a.y, b.x, b.y);
      }
    });
    w.wireAt = G.clock;
  },
});

function wireStep(a) {
  if (!a.w || !mech(a.w.ovl, 'barbedWire') || G.clock - (a.w.wireAt || 0) > 1) free(a);
}

// --- Registration ---------------------------------------------------------------------------

registerMoves({
  step: {
    [PK.GLOB]: globStep, [PK.ACID]: acidStep, [PK.SMOG]: smogStep, [PK.NEEDLE]: needleStep,
    [PK.TOXIC]: toxicStep, [PK.PUFF]: puffStep, [PK.DROP]: dropStep, [PK.WIRE]: wireStep,
    [PK.BREATH]: breathStep,
  },
  end: { [PK.GLOB]: globEnd, [PK.TOXIC]: toxicEnd },
});
