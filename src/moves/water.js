// L3 -- may import L0-L2 and the move framework (moves/core.js).
//
// Water: the new Bubble (and its evolution Hydro Cannon), and the overload mechanics of every
// Water weapon -- Tidal Surge's undertow, riptides and tide pools; Whirlpool's centrifuge, eddy and
// drain; Aqua Jet's pressure washer, geysers and slipstream; Rain Dance's puddles, fish and soak;
// Brine Fang's pack, sharknado and frenzy. Drawing is draw_water.js.

import { G } from '../state.js';
import { TAU, dist2 } from '../util.js';
import { enemies, projectiles, orbs, coins, spawn, nextHitId } from '../world.js';
import { damageEnemy, damageCircle, applyChill } from '../combat.js';
import { spawnSpr } from '../sprfx.js';
import { spawnSeq } from '../seqfx.js';
import { ovlSprColor } from '../data/overloads.js';
import { registerMech } from '../mechs.js';
import {
  KIND, vk, actors, MOVE_CAP as CAP, registerMoves, take, child, free, mech, lvSum,
  nearest, nearestN, each, movable, settle, ovLook, ovProc,
} from './core.js';

export const WK = {
  BUBBLE: KIND.water,
  UNDERTOW: KIND.water + 1,
  RIPTIDE: KIND.water + 2,
  POOL: KIND.water + 3,
  GEYSER: KIND.water + 4,
  PUDDLE: KIND.water + 5,
  FISH: KIND.water + 6,
};

const heal = (n) => {
  const p = G.player;
  if (p && G.stats) p.hp = Math.min(G.stats.maxHp, p.hp + n);
};

/** Live actors of one kind under one damage source, for caps. */
function countOf(kind, src) {
  let n = 0;
  for (let i = 0; i < CAP; i++) { const a = actors[i]; if (a.on && a.kind === kind && a.src === src) n++; }
  return n;
}

// --- Bubble ----------------------------------------------------------------------------------
//
// Bubbles drift out toward the crowd, wobbling. The first foe one touches is engulfed: held
// helpless inside, carried off on the drift and rising, soaked a little all the while, until the
// bubble pops and splashes everything near. A boss is too big to hold: the bubble pops on it.
// Hydro Cannon is the same move, holding two.

export const WATER_BEHAVIOR = {
  bubble(w, st, p) {
    const def = w.def;
    const t = nearest(p.x, p.y, def.range * st.range);
    if (!t) return false;
    const cannon = mech(w.ovl, 'cannon');
    const n = Math.max(1, Math.round(st.amount));
    const shots = cannon ? 1 : n;
    const base = Math.atan2(t.y - p.y, t.x - p.x);
    for (let i = 0; i < shots; i++) {
      const a = take(WK.BUBBLE, w);
      if (!a) break;
      const ang = shots === 1 ? base : base + (i - (shots - 1) / 2) * def.spread;
      const sp = st.speed * (cannon ? 2.4 : 1);
      a.x = p.x; a.y = p.y - 4; a.a = ang;
      a.vx = Math.cos(ang) * sp; a.vy = Math.sin(ang) * sp;
      a.life = st.duration;
      // Hydro Cannon's single cannon bubble carries the whole volley.
      a.dmg = st.damage * (cannon ? n * 0.8 : 1);
      a.area = st.area * (cannon ? 1.6 : 1);
      a.r = def.r * a.area;
      a.k = (def.hold || 1.6) + lvSum(w, 'hold');          // how long it holds its catch
      a.n = (def.carry || 1) + lvSum(w, 'carry') + (cannon ? 3 : 0) + (mech(w.ovl, 'prison') ? 1 : 0);
      a.z0 = mech(w.ovl, 'depthCharge') ? 1 : 0;            // sunk: travels under the ground
      a.phase = 0;
      a.idx = i;
    }
    return true;
  },
};

function bubbleStep(a, dt, p) {
  const ov = a.ov;
  if (a.phase === 0) {
    // Drifting: slowing a little, wobbling on its way.
    a.vx *= 1 - 0.35 * dt; a.vy *= 1 - 0.35 * dt;
    a.x += a.vx * dt;
    a.y += a.vy * dt + Math.sin(a.t * 6 + a.idx) * 10 * dt;
    a.z = a.z0 ? 0 : 6 + Math.sin(a.t * 4) * 2;
    ovLook(a, dt, 0.08);
    if (a.z0) {
      // Depth Charge: under the ground, it waits for a crowd above it.
      let n = 0;
      each(a.x, a.y, 40, () => { n++; });
      if (n >= 3) pop(a, 1.6);
      return;
    }
    const cannon = mech(ov, 'cannon');
    each(a.x, a.y, a.r, (e) => {
      if (!a.on || a.phase !== 0 && !cannon) return;
      if (a.held.includes(e)) return;
      if (!movable(e)) { if (!cannon) pop(a, 1); return; }
      if (a.held.length >= a.n) return;
      engulf(a, e);
      if (!cannon) { a.phase = 1; a.step = a.t; a.vx *= 0.25; a.vy *= 0.25; }
    });
    holdCaught(a, dt);
    return;
  }
  // Holding: carried off on the drift, rising, its catch soaked as it goes.
  const raft = mech(ov, 'foamRaft');
  if (raft && p) {
    // Foam Raft: the catch is floated back to you and circles you, battering what it meets.
    const ang = a.t * 3 + a.idx * 2;
    const tx = p.x + Math.cos(ang) * (raft.r || 30), ty = p.y + Math.sin(ang) * (raft.r || 30) * 0.7;
    a.x += (tx - a.x) * Math.min(1, 4 * dt);
    a.y += (ty - a.y) * Math.min(1, 4 * dt);
    a.fxT -= dt;
    if (a.fxT <= 0) {
      a.fxT = 0.3;
      each(a.x, a.y, a.r + 6, (e) => { if (!a.held.includes(e)) damageEnemy(e, a.dmg * 0.4, 0, 0, true); });
    }
  } else {
    a.x += a.vx * dt;
    a.y += a.vy * dt;
  }
  a.z = Math.min(16, a.z + 10 * dt);
  // Bubble Prison: the catch draws its neighbours in, and the bubble swallows them too.
  if (mech(ov, 'prison')) {
    each(a.x, a.y, 50, (e) => {
      if (a.held.includes(e) || !movable(e)) return;
      const dx = a.x - e.x, dy = a.y - e.y, d = Math.hypot(dx, dy) || 1;
      e.x += (dx / d) * 60 * dt; e.y += (dy / d) * 60 * dt;
      if (d < a.r + e.r && a.held.length < a.n) engulf(a, e);
    });
  }
  holdCaught(a, dt);
  const prs = mech(ov, 'pressure');
  if (prs) {
    // Pressure Pop: it holds on until it bumps into another foe -- the longer it held, the bigger.
    let bump = false;
    each(a.x, a.y, a.r + 2, (e) => { if (!a.held.includes(e)) bump = true; });
    if (bump || a.t - a.step > a.k + 3) pop(a, 1 + (a.t - a.step) * (prs.per || 0.6));
    return;
  }
  if (a.t - a.step >= a.k) pop(a, 1);
}

function engulf(a, e) {
  a.held.push(e); a.heldSn.push(e.sn);
  a.heldA.push(G.rngFx() * TAU); a.heldB.push(0);
  spawnSpr('ring_s', e.x, e.y - 6, '#bfe9ff', 1);
}

/** Keep what it holds inside it, helpless, and soak it a little four times a second. */
function holdCaught(a, dt) {
  a.ptT -= dt;
  const tick = a.ptT <= 0;
  if (tick) a.ptT = 0.4;
  for (let j = 0; j < a.held.length; j++) {
    const e = a.held[j];
    if (!e.alive || e.sn !== a.heldSn[j]) continue;
    a.heldA[j] += 2.5 * dt;
    const r = a.held.length > 1 ? a.r * 0.4 : 0;
    e.x = a.x + Math.cos(a.heldA[j]) * r;
    e.y = a.y + Math.sin(a.heldA[j]) * r * 0.6;
    e.stunT = Math.max(e.stunT, 0.12);
    e.knockX = 0; e.knockY = 0;
    if (tick) damageEnemy(e, a.dmg * 0.25, 0, 0, false);
  }
}

/** The pop: everything held is let go, and everything near is splashed. */
function pop(a, mul) {
  if (a.done) return;
  a.done = true;
  const r = 26 * a.area * (mul > 1.4 ? 1.4 : 1);
  for (let j = 0; j < a.held.length; j++) {
    const e = a.held[j];
    if (!e.alive || e.sn !== a.heldSn[j]) continue;
    settle(e);
    e.stunT = Math.max(e.stunT, 0.3);
  }
  damageCircle(a.x, a.y, r, a.dmg * mul, nextHitId(), { knockback: 60 });
  spawnSeq('fx_rs_bubblepop', a.x, a.y - a.z, { dur: 0.3, fps: 10, scale: 0.9 * vk(a.area) });
  spawnSeq('fx_rs_splash', a.x, a.y + 4, { dur: 0.3, fps: 10, scale: vk(a.area) });
  ovProc(a, a.x, a.y - a.z, 1);
  // Bubble Chain: a full-sized pop sheds two little bubbles that can catch foes of their own.
  const ch = !a.crit && mech(a.ov, 'bubbleChain');
  if (ch) {
    for (let i = 0; i < (ch.n || 2); i++) {
      const b = child(WK.BUBBLE, a);
      if (!b) break;
      const ang = a.a + (i ? 1 : -1) * 1.2 + (G.rngFx() - 0.5) * 0.5;
      b.x = a.x; b.y = a.y; b.a = ang;
      b.vx = Math.cos(ang) * 70; b.vy = Math.sin(ang) * 70;
      b.life = 2; b.dmg = a.dmg * 0.5; b.area = a.area * 0.7; b.r = a.r * 0.7;
      b.k = 0.8; b.n = 1; b.crit = true; b.idx = i;
    }
  }
  a.life = Math.min(a.life, a.t + 0.01);
}

// --- Tidal Surge's overloads (a nova) ----------------------------------------------------------

registerMech('undertow', {
  // After the wave goes out it rolls back in, dragging what it meets toward you.
  lay(z, w, st, cfg) {
    const a = take(WK.UNDERTOW, w);
    if (!a) return;
    a.k = z.maxLife;                          // the outward wave's time
    a.r = z.pull;                             // the radius it reached
    a.life = z.maxLife + (cfg.back || 0.5);
    a.dmg = st.damage * (cfg.dmg || 0.6);
  },
});

function undertowStep(a, dt, p) {
  if (!p) return;
  a.x = p.x; a.y = p.y;
  if (a.t < a.k) return;
  const k = (a.t - a.k) / (a.life - a.k);
  const rad = a.r * (1 - k);
  a.z = rad;
  each(p.x, p.y, rad + 10, (e) => {
    const dx = e.x - p.x, dy = e.y - p.y, d = Math.hypot(dx, dy) || 1;
    if (Math.abs(d - rad) > 12 || e.lastHitId === a.hitId) return;
    e.lastHitId = a.hitId;
    if (movable(e)) { e.knockX -= (dx / d) * 230; e.knockY -= (dy / d) * 230; }
    damageEnemy(e, a.dmg, 0, 0, true);
  });
}

registerMech('riptide', {
  // The wave leaves three standing rings that turn; a foe caught on one is swept round with it.
  lay(z, w, st, cfg) {
    const a = take(WK.RIPTIDE, w);
    if (!a || !G.player) return;
    a.x = G.player.x; a.y = G.player.y;
    a.r = z.pull; a.life = cfg.t || 2.5;
    a.dmg = st.damage * (cfg.dmg || 0.3);
  },
});

function riptideStep(a, dt) {
  a.k -= dt;
  const tick = a.k <= 0;
  if (tick) a.k = 0.5;
  each(a.x, a.y, a.r + 8, (e) => {
    const dx = e.x - a.x, dy = e.y - a.y, d = Math.hypot(dx, dy) || 1;
    for (let i = 0; i < 3; i++) {
      const ring = a.r * (0.35 + 0.3 * i);
      if (Math.abs(d - ring) > 8) continue;
      if (movable(e)) {
        const ang = Math.atan2(dy, dx) + (i & 1 ? -1 : 1) * 1.4 * dt;
        e.x = a.x + Math.cos(ang) * d; e.y = a.y + Math.sin(ang) * d;
      }
      if (tick) damageEnemy(e, a.dmg, 0, 0, false);
      break;
    }
  });
}

registerMech('tidePools', {
  // Where the wave strikes a foe, a tide pool stays: it slows foes, and heals you as you stand in it.
  hit(e, dealt, rec, crit, cfg) {
    if (countOf(WK.POOL, rec.w.srcId) >= (cfg.max || 8)) return;
    const a = take(WK.POOL, rec.w);
    if (!a) return;
    a.x = e.x; a.y = e.y; a.r = cfg.r || 16; a.life = cfg.t || 4;
    a.dmg = cfg.heal || 4;
  },
});

function poolStep(a, dt, p) {
  each(a.x, a.y, a.r, (e) => { e.slow = Math.max(e.slow, 0.4); e.slowT = Math.max(e.slowT, 0.2); });
  if (p && dist2(p.x, p.y, a.x, a.y) < a.r * a.r) {
    heal(a.dmg * dt);
    if (G.tick % 12 === 0) spawnSpr('motes', p.x, p.y - 8, '#9adcff', 1, 0, 0, -20);
  }
}

// --- Whirlpool's overloads (a vortex) -----------------------------------------------------------

registerMech('centrifuge', {
  // As it closes, the vortex hurls everything it gathered outward at once.
  zone(z, rec, dt, cfg) {
    if (z.mx || z.life > 0.12) return;
    z.mx = 1;
    each(z.x, z.y, z.r * 1.15, (e) => {
      const dx = e.x - z.x, dy = e.y - z.y, d = Math.hypot(dx, dy) || 1;
      if (movable(e)) { e.knockX += (dx / d) * 300; e.knockY += (dy / d) * 300; }
      damageEnemy(e, rec.w.resolved.damage * (cfg.dmg || 1.2), 0, 0, true);
    });
    spawnSpr('ring_l', z.x, z.y, ovlSprColor(rec.def, G.clock, 2), Math.min(1.6, z.r / 22));
  },
});

registerMech('eddy', {
  // The vortex wanders after the nearest crowd instead of staying put.
  zone(z, rec, dt, cfg) {
    const e = nearest(z.x, z.y, 220);
    if (!e) return;
    const dx = e.x - z.x, dy = e.y - z.y, d = Math.hypot(dx, dy) || 1;
    if (d < 6) return;
    z.x += (dx / d) * (cfg.speed || 40) * dt; z.y += (dy / d) * (cfg.speed || 40) * dt;
  },
});

registerMech('drainWhirl', {
  // It drains the field: XP and coins nearby are drawn through it to you, each one a pulse of pain.
  zone(z, rec, dt, cfg) {
    z.mx -= dt;
    if (z.mx > 0) return;
    z.mx = 0.5;
    const p = G.player;
    if (!p) return;
    const r2 = (cfg.r || 120) * (cfg.r || 120);
    let n = 0;
    for (const list of [orbs, coins]) {
      for (let i = 0; i < list.length; i++) {
        const o = list[i];
        if (!o.alive || dist2(o.x, o.y, z.x, z.y) > r2) continue;
        o.x += (p.x - o.x) * 0.45; o.y += (p.y - o.y) * 0.45;
        if (n < 6) spawnSpr('dot', o.x, o.y, '#9adcff', 1);
        n++;
      }
    }
    if (n) damageCircle(z.x, z.y, z.r, rec.w.resolved.damage * (cfg.dmg || 0.4) * Math.min(n, 6), nextHitId(), { canCrit: false });
  },
});

// --- Aqua Jet's overloads (a charge) -------------------------------------------------------------

registerMech('washer', {
  // The jets keep pushing: whatever is in front of one is shoved along with it.
  shot(pr, rec, dt, cfg) {
    const sp = Math.hypot(pr.vx, pr.vy) || 1;
    const ux = pr.vx / sp, uy = pr.vy / sp;
    each(pr.x, pr.y, pr.r + 6, (e) => {
      if (!movable(e)) return;
      e.x += ux * (cfg.push || 160) * dt; e.y += uy * (cfg.push || 160) * dt;
    });
    return false;
  },
});

registerMech('geyser', {
  // The banked pressure erupts as geysers under the nearest foes instead of jets.
  spawn(pr, w) {
    w.geyN = (w.geyN || 0) + 1;
    pr.maxLife = 0.0001; pr.r = 0; pr.r0 = 0; pr.anim = null; pr.vis = 0.001; pr.trail = 0;
  },
  fire(w, st, p, cfg) {
    const n = Math.max(1, w.geyN || 1);
    w.geyN = 0;
    const tg = nearestN(p.x, p.y, 240, n);
    for (let i = 0; i < tg.length; i++) {
      const a = take(WK.GEYSER, w);
      if (!a) break;
      a.x = tg[i].x; a.y = tg[i].y; a.t = -i * 0.06; a.life = 0.5;
      a.r = (cfg.r || 20) * st.area; a.dmg = st.damage * (cfg.dmg || 1.6);
    }
  },
});

function geyserStep(a) {
  if (a.t < 0 || a.done) return;
  a.done = true;
  damageCircle(a.x, a.y, a.r, a.dmg, a.hitId, { stun: 0.5, knockback: 30 });
  spawnSeq('fx_rs_splash', a.x, a.y + 2, { dur: 0.35, fps: 9, scale: 1.4 });
  ovProc(a, a.x, a.y - 10, 1);
}

registerMech('slipstream', {
  // Standing still, the water gathers into a shell around you that turns aside one hit.
  tick(w, dt, p, cfg) {
    if (!p || p.barrier || (w.charge || 0) < (cfg.per || 2)) return;
    p.barrier = true;
    w.charge -= cfg.per || 2;
    spawnSpr('guard_ring', p.x, p.y - 6, '#9adcff', 0.8);
  },
});

// --- Rain Dance's overloads (a rain) -------------------------------------------------------------

registerMech('puddles', {
  // Every drop that lands leaves a puddle: foes slosh through slowly, you splash through faster.
  expire(pr, rec, cfg) {
    if (countOf(WK.PUDDLE, rec.w.srcId) >= (cfg.max || 14)) return;
    const a = take(WK.PUDDLE, rec.w);
    if (!a) return;
    a.x = pr.x; a.y = pr.y; a.r = (cfg.r || 14) * (pr.area || 1); a.life = cfg.t || 3;
    a.k = cfg.haste || 1.25;
  },
});

function puddleStep(a, dt, p) {
  each(a.x, a.y, a.r, (e) => { e.slow = Math.max(e.slow, 0.3); e.slowT = Math.max(e.slowT, 0.2); });
  if (p && dist2(p.x, p.y, a.x, a.y) < a.r * a.r) {
    p.hasteMul = p.hasteT > 0 ? Math.max(p.hasteMul, a.k) : a.k;
    p.hasteT = Math.max(p.hasteT, 0.3);
  }
}

const FISH_ANIM = { seq: 'fx_fish', scale: 0.6, flip: true };
registerMech('fishRain', {
  // One drop in five is a fish: it lands flopping, and keeps flopping about, slapping what it hits.
  spawn(pr, w, cfg) {
    if (G.rngRun() >= (cfg.chance || 0.2)) return;
    pr.mx = 1; pr.anim = FISH_ANIM;
  },
  expire(pr, rec, cfg) {
    if (pr.mx !== 1) return;
    const a = take(WK.FISH, rec.w);
    if (!a) return;
    a.x = pr.x; a.y = pr.y; a.n = cfg.hops || 5; a.life = a.n * 0.45 + 0.1;
    a.dmg = pr.dmg * (cfg.dmg || 0.8); a.r = 14; a.k = 0;
  },
});

function fishStep(a, dt) {
  // A hop every 0.45s: up and over to somewhere near, slapping whatever is under it on landing.
  const u = (a.t % 0.45) / 0.45;
  a.z = Math.sin(u * Math.PI) * 12;
  if (a.t - a.k < 0.45) {
    a.x += a.vx * dt; a.y += a.vy * dt;
    return;
  }
  a.k = a.t;
  damageCircle(a.x, a.y, a.r, a.dmg, nextHitId(), { knockback: 50 });
  spawnSeq('fx_rs_splash', a.x, a.y + 2, { dur: 0.25, fps: 12, scale: 0.6 });
  const ang = G.rngFx() * TAU;
  a.vx = Math.cos(ang) * 60; a.vy = Math.sin(ang) * 45;
}

registerMech('soak', {
  // The rain soaks what it hits: soaked foes are slowed, and lightning hurts them far worse.
  hit(e, dealt, rec, crit, cfg) {
    e.wetT = Math.max(e.wetT || 0, cfg.t || 4);
    applyChill(e, 0.2, cfg.t || 4);
    if (G.rngFx() < 0.3) spawnSpr('dot', e.x, e.y - e.r - 4, '#7ac8ff', 1, 0, 0, 20);
  },
});

// --- Brine Fang's overloads (a companion) --------------------------------------------------------

registerMech('pack', {
  // Every kill calls another, smaller shark to the hunt for a few seconds, up to three at once.
  kill(e, rec, cfg) {
    const w = rec.w;
    let tpl = null, n = 0;
    for (let i = 0; i < projectiles.length; i++) {
      const q = projectiles[i];
      if (q.alive && !q.hostile && q.weapon === w.defIdx) { n++; if (!tpl) tpl = q; }
    }
    if (!tpl || n >= 1 + (cfg.max || 3)) return;
    const q = spawn('projectiles');
    if (!q) return;
    for (const k in tpl) q[k] = tpl[k];
    q.life = 0; q.maxLife = cfg.t || 5;
    q.vis = 0.7; q.r = q.r0 = tpl.r0 * 0.8; q.dmg = tpl.dmg * 0.7;
    q.x = e.x; q.y = e.y; q.hitId = nextHitId(); q.targetIdx = -1;
    spawnSpr('ring_s', e.x, e.y, '#5ab6ef', 1);
  },
});

registerMech('sharknado', {
  // The shark stops hunting and circles you fast, a living whirlpool.
  shot(pr, rec, dt, cfg) {
    const p = G.player;
    if (!p || pr.weapon !== rec.w.defIdx) return false;
    pr.orbitA += (cfg.spin || 6) * dt;
    pr.x = p.x + Math.cos(pr.orbitA) * (cfg.r || 34);
    pr.y = p.y + Math.sin(pr.orbitA) * (cfg.r || 34) * 0.8;
    pr.vx = -Math.sin(pr.orbitA); pr.vy = Math.cos(pr.orbitA);
    pr.angle = pr.orbitA + Math.PI / 2;
    pr.mx -= dt;
    if (pr.mx <= 0) { pr.mx = 0.5; pr.hitId = nextHitId(); }
    return false;
  },
});

registerMech('frenzy', {
  // Blood in the water: every bite on the same foe bites harder; a new foe starts it over.
  hit(e, dealt, rec, crit, cfg) {
    const w = rec.w;
    if (w.frzE === e && w.frzSn === e.sn) w.frzN = Math.min((cfg.max || 2) / (cfg.per || 0.25), (w.frzN || 0) + 1);
    else { w.frzE = e; w.frzSn = e.sn; w.frzN = 0; }
    if (w.frzN > 0 && e.alive) damageEnemy(e, dealt * (cfg.per || 0.25) * w.frzN, 0, 0, false);
    if (w.frzN > 2 && G.rngFx() < 0.4) spawnSpr('punch_s', e.x, e.y - 4, '#ff6a6a', 1);
  },
});

// --- Registration ------------------------------------------------------------------------------

registerMoves({
  step: {
    [WK.BUBBLE]: bubbleStep, [WK.UNDERTOW]: undertowStep, [WK.RIPTIDE]: riptideStep,
    [WK.POOL]: poolStep, [WK.GEYSER]: geyserStep, [WK.PUDDLE]: puddleStep, [WK.FISH]: fishStep,
  },
  end: {
    [WK.BUBBLE]: (a) => pop(a, 1),
  },
});
