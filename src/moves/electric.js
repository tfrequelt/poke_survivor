// L3 -- may import L0-L2 and the move framework (moves/core.js).
//
// Electric: the new Electroweb and Electric Terrain, and the overload mechanics of Spark Chain,
// Thunder, Volt Coil, Electro Ball and Live Wire. Drawing is draw_electric.js.

import { G } from '../state.js';
import { TAU } from '../util.js';
import { projectiles, nextHitId, getDamageSource, setDamageSource } from '../world.js';
import { damageEnemy, damageCircle, damageLine } from '../combat.js';
import { spawnSpr } from '../sprfx.js';
import { spawnSeq } from '../seqfx.js';
import { registerMech } from '../mechs.js';
import { ROLE } from '../fx.js';
import {
  KIND, vk, actors, MOVE_CAP as CAP, registerMoves, take, child, free, mech, procOf,
  nearest, nearestN, each, movable, settle, ovProc, mark, eachMarked,
} from './core.js';

export const EK = {
  WEB: KIND.electric,          // Electroweb's net: flying (phase 0), then spread over the crowd
  TRAP: KIND.electric + 1,     // Web Trap's folded net, waiting on the floor
  CLING: KIND.electric + 2,    // Cling's net riding on one foe
  GRID: KIND.electric + 3,     // Electric Terrain's tiles
  BALL: KIND.electric + 4,     // Ball Lightning
  ZAP: KIND.electric + 5,      // a jagged arc between two points, drawn for a moment
  STATIC: KIND.electric + 6,   // Short Circuit's spark on the floor
  BOLT: KIND.electric + 7,     // a bolt about to fall from the sky
  CLOUD: KIND.electric + 8,    // Storm Cell's cloud over you
};

/** A jagged arc from (x0, y0) to (x1, y1), drawn for a moment. */
function zap(src, x0, y0, x1, y1, life = 0.14) {
  const a = src.kind !== undefined ? child(EK.ZAP, src) : take(EK.ZAP, src);
  if (!a) return;
  a.x = (x0 + x1) / 2; a.y = (y0 + y1) / 2;
  a.ox = x0; a.oy = y0; a.tx = x1; a.ty = y1;
  a.life = life; a.idx = (G.rngFx() * 1000) | 0;
}

function count(kind, src) {
  let n = 0;
  for (let i = 0; i < CAP; i++) if (actors[i].on && actors[i].kind === kind && actors[i].src === src) n++;
  return n;
}
/** Run fn under an overload's proc source (a mechanic's own damage, outside a hit). */
function asProc(rec, fn) {
  const prev = getDamageSource();
  if (rec) setDamageSource(rec.proc);
  fn();
  setDamageSource(prev);
}

// --- Electroweb ---------------------------------------------------------------------------
//
// A net thrown onto the crowd. Everything in its mesh is tangled -- slowed hard -- and the net is
// live: whatever hurts one tangled foe shocks every other one for a share of it.

export const ELECTRIC_BEHAVIOR = {
  electroweb(w, st, p) {
    const def = w.def;
    const t = nearest(p.x, p.y, def.range * st.range);
    const trap = mech(w.ovl, 'webTrap');
    if (trap) {
      // Web Trap: folded at your feet instead, until something steps on it.
      if (count(EK.TRAP, w.srcId) >= (trap.max || 4)) return false;
      const a = take(EK.TRAP, w);
      if (!a) return true;
      a.x = p.x; a.y = p.y + 4; a.life = trap.t || 8;
      a.dmg = st.damage * (trap.dmg || 1.3); a.area = st.area; a.r = (def.webR || 30) * st.area * 1.2;
      a.k = st.duration;
      return true;
    }
    if (!t) return false;
    const a = take(EK.WEB, w);
    if (!a) return true;
    a.ox = p.x; a.oy = p.y - 6;
    a.tx = t.x; a.ty = t.y;
    a.x = a.ox; a.y = a.oy;
    a.phase = 0; a.life = 0.35;
    a.k = st.duration;
    a.dmg = st.damage; a.area = st.area; a.r = (def.webR || 30) * st.area;
    return true;
  },

  /**
   * Electric Terrain: the floor at your feet becomes a grid of tiles that light up in travelling
   * patterns -- a row, a column, a ring, a chequer -- and a lit tile shocks what stands on it.
   */
  electricTerrain(w, st, p) {
    const def = w.def;
    const grid = mech(w.ovl, 'powerGrid');
    if (grid) {
      // Power Grid: one grid, riding under you; a new cast only renews it.
      for (let i = 0; i < CAP; i++) {
        const o = actors[i];
        if (o.on && o.kind === EK.GRID && o.src === w.srcId) { o.life = o.t + st.duration; o.dmg = st.damage; return true; }
      }
    } else if (!nearest(p.x, p.y, def.range * st.range)) return false;
    const a = take(EK.GRID, w);
    if (!a) return true;
    a.x = p.x; a.y = p.y;
    a.n = def.tiles || 5;                       // tiles a side
    a.r = (def.tile || 22) * st.area;           // one tile's size
    a.life = st.duration; a.dmg = st.damage; a.area = st.area;
    a.k = 0; a.step = 0; a.idx = (G.rngRun() * 5) | 0;
    a.z = def.stepT || 0.32;                    // seconds per pattern step
    a.fixed = !!grid;
    a.pts.length = 0;
    for (let i = 0; i < a.n * a.n; i++) a.pts.push(0);   // per-tile: lit flag, then Short Fuse count
    return true;
  },
};

function webStep(a, dt) {
  if (a.phase === 0) {
    // In flight: a folded net in an arc.
    const k = Math.min(1, a.t / a.life);
    a.x = a.ox + (a.tx - a.ox) * k; a.y = a.oy + (a.ty - a.oy) * k;
    a.z = Math.sin(k * Math.PI) * 24;
    if (k >= 1) { a.phase = 1; a.t = 0; a.life = a.k; a.z = 0; a.step = 0; a.fxT = 0; }
    return;
  }
  const open = Math.min(1, a.t / 0.15);
  const R = a.r * (0.3 + 0.7 * open);
  // Who is in the mesh. Each is held with the health it had, so a loss can be seen and shared.
  for (let i = a.held.length - 1; i >= 0; i--) {
    const e = a.held[i];
    const dx = e.x - a.x, dy = e.y - a.y;
    if (!e.alive || e.sn !== a.heldSn[i] || dx * dx + dy * dy > (R + e.r) * (R + e.r)) {
      a.held.splice(i, 1); a.heldSn.splice(i, 1); a.heldA.splice(i, 1);
    }
  }
  each(a.x, a.y, R, (e) => {
    if (a.held.length >= 12 || a.held.includes(e)) return;
    a.held.push(e); a.heldSn.push(e.sn); a.heldA.push(e.hp);
  });
  for (let i = 0; i < a.held.length; i++) {
    const e = a.held[i];
    e.slow = Math.max(e.slow, a.def.tangle || 0.6); e.slowT = Math.max(e.slowT, 0.2);
  }
  // A blow to one shocks the rest: the health each lost since last frame, a share passed on.
  let lost = 0, from = -1;
  for (let i = 0; i < a.held.length; i++) {
    const d = a.heldA[i] - a.held[i].hp;
    if (d > 0) { lost += d; if (from < 0 || d > a.heldA[from] - a.held[from].hp) from = i; }
  }
  a.bx += lost;
  a.fxT -= dt;
  if (a.fxT <= 0 && a.bx > 0 && a.held.length > 1) {
    a.fxT = 0.2;
    // The share is split among the others, and is under the blow itself: two nets over the
    // same crowd see each other's shocks, and must not feed them back to each other for ever.
    const share = (a.bx * (a.def.share || 0.6)) / (a.held.length - 1);
    a.bx = 0;
    const src = a.held[from < 0 ? 0 : from];
    let arcs = 0;
    for (let i = 0; i < a.held.length; i++) {
      const e = a.held[i];
      if (e === src) continue;
      damageEnemy(e, share, 0, 0, false);
      if (arcs++ < 4) zap(a, src.x, src.y - 4, e.x, e.y - 4);
    }
  } else if (a.held.length <= 1) a.bx = 0;
  // And it pulses on its own.
  a.step -= dt;
  if (a.step <= 0) {
    a.step = 0.5;
    damageCircle(a.x, a.y, R, a.dmg, nextHitId(), { canCrit: true });
    spawnSpr('spark_s', a.x + (G.rngFx() - 0.5) * R, a.y + (G.rngFx() - 0.5) * R * 0.6, '#fff6a0', 0.8);
    // Live Net: each pulse reaches out and reels in foes standing near the mesh.
    const ln = mech(a.ov, 'liveNet');
    if (ln) {
      let n = 0;
      each(a.x, a.y, R + (ln.reach || 50), (e) => {
        if (n >= (ln.n || 2) || a.held.includes(e) || !movable(e)) return;
        n++;
        zap(a, a.x, a.y, e.x, e.y - 4, 0.18);
        const dx = a.x - e.x, dy = a.y - e.y, d = Math.hypot(dx, dy) || 1;
        const go = Math.max(0, d - R * 0.6);
        e.x += (dx / d) * go; e.y += (dy / d) * go;
        settle(e);
        damageEnemy(e, a.dmg * 0.25, 0, 0, false);
      });
    }
  }
  // Refresh what each held foe has, after the shocks, so a shock is never shared back.
  for (let i = 0; i < a.held.length; i++) a.heldA[i] = a.held[i].hp;
}

function webEnd(a) {
  if (a.phase !== 1) return;
  // Cling: the net balls up around the toughest foe it held, and goes on shocking around it.
  const cl = mech(a.ov, 'cling');
  if (!cl) return;
  let best = null;
  for (let i = 0; i < a.held.length; i++) {
    const e = a.held[i];
    if (e.alive && e.sn === a.heldSn[i] && (!best || e.hp > best.hp)) best = e;
  }
  if (!best) return;
  const c = child(EK.CLING, a);
  if (!c) return;
  c.target = best; c.tsn = best.sn; c.life = cl.t || 3; c.dmg = a.dmg * (cl.dmg || 0.6); c.r = 26; c.k = 0;
  ovProc(a, best.x, best.y - 6, 1.1);
}

function trapStep(a) {
  if (a.phase) return;
  let sprung = false;
  each(a.x, a.y, 16, () => { sprung = true; });
  if (!sprung) return;
  // Snap: the trap is a net now, full-size from the first frame.
  const n = child(EK.WEB, a);
  if (n) {
    n.x = a.x; n.y = a.y; n.phase = 1; n.t = 0.15; n.life = a.k;
    n.dmg = a.dmg; n.area = a.area; n.r = a.r;
  }
  spawnSpr('ring_m', a.x, a.y, '#fff6a0', 1.2);
  ovProc(a, a.x, a.y - 4, 1);
  free(a);
}

function clingStep(a, dt) {
  const e = a.target;
  if (!e || !e.alive || e.sn !== a.tsn) { free(a); return; }
  a.x = e.x; a.y = e.y;
  e.slow = Math.max(e.slow, 0.5); e.slowT = Math.max(e.slowT, 0.2);
  a.k -= dt;
  if (a.k > 0) return;
  a.k = 0.4;
  let arcs = 0;
  each(a.x, a.y, a.r, (o) => {
    if (o === e) return;
    damageEnemy(o, a.dmg, 0, 0, false);
    if (arcs++ < 3) zap(a, a.x, a.y - 6, o.x, o.y - 4);
  });
}

// --- Electric Terrain ---------------------------------------------------------------------

/** Is tile (c, r) lit at step s of pattern k? */
function lit(k, c, r, n, s) {
  const m = (n / 2) | 0;
  switch (k) {
    case 0: return r === s % n;                                       // a row sweeping down
    case 1: return c === s % n;                                       // a column sweeping across
    case 2: return Math.max(Math.abs(c - m), Math.abs(r - m)) === s % (m + 1);   // a ring opening
    case 3: return (c & 1) === (s & 1) && (r & 1) === ((s >> 1) & 1); // a quarter-chequer stepping round
    default: return (c + r) % n === s % n;                            // a diagonal
  }
}

function gridStep(a, dt, p) {
  if (a.fixed && p) { a.x = p.x; a.y = p.y; }
  a.k -= dt;
  if (a.k > 0) return;
  const disco = mech(a.ov, 'disco');
  a.k = disco ? Math.max(disco.min || 0.2, a.z - (a.bx || 0) * 0.004) : a.z;
  a.step++;
  if (a.step % 6 === 0) a.idx = (a.idx + 1 + ((G.rngRun() * 3) | 0)) % 5;   // a new pattern
  const n = a.n, T = a.r, h = (n * T) / 2;
  const id = nextHitId();
  const fuse = mech(a.ov, 'shortFuse');
  let shocked = 0;
  for (let r = 0; r < n; r++) {
    for (let c = 0; c < n; c++) {
      const i = r * n + c;
      const on = a.pts[i] >= 0 && lit(a.idx, c, r, n, a.step);
      if (a.pts[i] >= 0) a.pts[i] = on ? (a.pts[i] | 1) : (a.pts[i] & ~1);
      if (!on) continue;
      const cx = a.x - h + (c + 0.5) * T, cy = a.y - h + (r + 0.5) * T;
      let here = 0;
      each(cx, cy, T * 0.5, (e) => {
        if (e.lastHitId === id) return;
        e.lastHitId = id;
        here++;
        damageEnemy(e, a.dmg, 0, 0, true);
        if (!e.boss && !e.legend && G.rngRun() < 0.15) e.stunT = Math.max(e.stunT, 0.3);
      });
      shocked += here;
      // Short Fuse: a tile that has shocked three foes blows, and stays dark.
      if (fuse && here) {
        a.pts[i] += here * 2;
        if ((a.pts[i] >> 1) >= (fuse.n || 3)) {
          a.pts[i] = -1;
          damageCircle(cx, cy, T * 1.2, a.dmg * (fuse.dmg || 1.5), nextHitId(), { knockback: 60, stun: 0.3 });
          spawnSeq('fx_spark', cx, cy - 4, { dur: 0.3, fps: 16, scale: 1.4 });
          spawnSpr('boom_s', cx, cy - 4, '#fff6a0', 1);
        }
      }
    }
  }
  if (disco && shocked) {
    a.bx = Math.min(40, (a.bx || 0) + shocked);
    // Every ten shocks, half a second more of the show, up to three.
    const more = Math.min(3, ((a.bx / 10) | 0) * 0.5);
    if (more > a.by) { a.life += more - a.by; a.by = more; }
  }
}

// --- Spark Chain's overloads --------------------------------------------------------------

registerMech('overcharge', {
  // A foe the chain strikes three times inside four seconds overloads, and bursts.
  hit(e, dealt, rec, crit, cfg) {
    const i = mark(rec.w, 'ocL', e, cfg.t || 4);
    if (i < 0) return;
    const L = rec.w.ocL;
    if (++L[i + 3] < (cfg.n || 3)) return;
    L[i + 3] = 0;
    damageCircle(e.x, e.y, 26, rec.w.resolved.damage * (cfg.dmg || 1.2), nextHitId(), { stun: 0.5, canCrit: false });
    spawnSeq('fx_spark', e.x, e.y - 4, { dur: 0.3, fps: 16, scale: 1.6 });
    spawnSpr('ring_m', e.x, e.y, rec.def.colors[2], 1);
  },
});

registerMech('ballLightning', {
  // The chain's last link leaves a ball of lightning behind that drifts after foes, zapping.
  hit(e, dealt, rec) { rec.w.blE = e; },
  fire(w, st, p, cfg) {
    const e = w.blE;
    w.blE = null;
    if (!e || count(EK.BALL, w.srcId) >= (cfg.max || 3)) return;
    const a = take(EK.BALL, w);
    if (!a) return;
    a.x = e.x; a.y = e.y - 6; a.life = cfg.t || 3; a.dmg = st.damage * (cfg.dmg || 0.45); a.k = 0.2;
  },
});

function ballStep(a, dt) {
  const t = nearest(a.x, a.y, 120);
  if (t) {
    const dx = t.x - a.x, dy = t.y - a.y, d = Math.hypot(dx, dy) || 1;
    a.x += (dx / d) * 34 * dt; a.y += (dy / d) * 34 * dt;
  }
  a.k -= dt;
  if (a.k > 0) return;
  a.k = 0.35;
  const e = nearest(a.x, a.y, 50);
  if (!e) return;
  damageEnemy(e, a.dmg, 0, 0, false);
  zap(a, a.x, a.y - 4, e.x, e.y - 4);
}

registerMech('magnetize', {
  // Struck foes are magnetised: they drag together, and clash for damage when they meet.
  hit(e, dealt, rec, crit, cfg) { if (movable(e)) mark(rec.w, 'magL', e, cfg.t || 3); },
  tick(w, dt, p, cfg, rec) {
    const L = w.magL;
    if (!L || L.length < 8) { eachMarked(w, 'magL', () => {}); return; }
    let cx = 0, cy = 0, n = 0;
    eachMarked(w, 'magL', (e) => { cx += e.x; cy += e.y; n++; });
    if (n < 2) return;
    cx /= n; cy /= n;
    const clash = G.tick % 30 === 0;
    asProc(rec, () => eachMarked(w, 'magL', (e) => {
      const dx = cx - e.x, dy = cy - e.y, d = Math.hypot(dx, dy) || 1;
      if (d > 8) { e.x += (dx / d) * (cfg.pull || 70) * dt; e.y += (dy / d) * (cfg.pull || 70) * dt; settle(e); }
      else if (clash) {
        damageEnemy(e, w.resolved.damage * (cfg.dmg || 0.4), 0, 0, false);
        spawnSpr('spark_s', e.x, e.y - 4, '#fff6a0', 0.8);
      }
    }));
  },
});

// --- Thunder's overloads ------------------------------------------------------------------

/** A bolt from the sky, landing after `delay`: on its own, or then chaining to `jumps` more. */
function bolt(w, x, y, dmg, delay, jumps = 0, r = 30) {
  const a = take(EK.BOLT, w);
  if (!a) return;
  a.x = x; a.y = y; a.life = delay; a.dmg = dmg; a.n = jumps; a.r = r;
}

function boltEnd(a) {
  damageCircle(a.x, a.y, a.r, a.dmg, nextHitId(), { stun: 0.4, knockback: 40 });
  spawnSeq('fx_spark', a.x, a.y - 4, { dur: 0.3, fps: 16, scale: 1.5 });
  spawnSpr('flash_burst', a.x, a.y - 4, '#fff6a0', 1);
  let x = a.x, y = a.y;
  const used = [];
  for (let j = 0; j < a.n; j++) {
    const e = nearest(x, y, 80, used);
    if (!e) break;
    used.push(e);
    damageEnemy(e, a.dmg * 0.6, 0, 0, false);
    zap(a, x, y - 4, e.x, e.y - 4, 0.2);
    x = e.x; y = e.y;
  }
}

registerMech('thunderclap', {
  // The first foe the chain reaches is struck again from the sky a moment later.
  hit(e, dealt, rec) { if (rec.w.tcT !== G.tick) { rec.w.tcT = G.tick; rec.w.tcE = e; } },
  fire(w, st, p, cfg) {
    const e = w.tcE;
    w.tcE = null;
    if (!e || !e.alive) return;
    bolt(w, e.x, e.y, st.damage * (cfg.dmg || 1.5), 0.25, 0, 30 * vk(st.area));
  },
});

registerMech('stormCell', {
  // A thundercloud hangs over you and drops its own bolts on the crowd, each forking twice.
  tick(w, dt, p, cfg) {
    if (!p) return;
    if (!count(EK.CLOUD, w.srcId)) {
      const c = take(EK.CLOUD, w);
      if (c) { c.life = 1e9; c.x = p.x; c.y = p.y; }
    }
    w.cellT = (w.cellT || 0) - dt;
    if (w.cellT > 0) return;
    w.cellT = cfg.every || 1.4;
    const L = nearestN(p.x, p.y, 170, 6);
    if (!L.length) return;
    const e = L[(G.rngRun() * L.length) | 0];
    bolt(w, e.x, e.y, w.resolved.damage * (cfg.dmg || 0.9), 0.3, 2, 24);
  },
});

function cloudStep(a, dt, p) {
  if (!p || !a.w || !mech(a.w.ovl, 'stormCell')) { free(a); return; }
  a.x += (p.x - a.x) * Math.min(1, dt * 4);
  a.y += (p.y - a.y) * Math.min(1, dt * 4);
}

registerMech('ionize', {
  // A foe the lightning kills bursts into ions that leap to the three foes nearest it.
  kill(e, rec, cfg) {
    const L = nearestN(e.x, e.y, cfg.range || 80, cfg.n || 3);
    for (let i = 0; i < L.length; i++) {
      damageEnemy(L[i], rec.w.resolved.damage * (cfg.dmg || 0.5), 0, 0, false);
      zap(rec.w, e.x, e.y - 4, L[i].x, L[i].y - 4, 0.18);
    }
    spawnSpr('spark', e.x, e.y - 4, rec.def.colors[1], 1);
  },
});

// --- Volt Coil's overloads (a turret) -----------------------------------------------------

/** Is this shot the coil itself, rather than one of the bolts it fires? */
const isCoil = (pr) => pr.gen === ROLE.TURRET;

registerMech('tesla', {
  // Each coil runs a live beam back to you, burning whatever stands between.
  shot(pr, rec, dt, cfg) {
    if (!isCoil(pr, rec)) return false;
    pr.mx -= dt;
    const p = G.player;
    if (pr.mx > 0 || !p) return false;
    pr.mx = 0.25;
    const ang = Math.atan2(p.y - pr.y, p.x - pr.x);
    const len = Math.hypot(p.x - pr.x, p.y - pr.y);
    if (len > (cfg.reach || 220)) return false;
    damageLine(pr.x, pr.y, ang, len, 6, rec.w.resolved.damage * (cfg.dmg || 0.3), nextHitId(), { canCrit: false });
    zap(rec.w, pr.x, pr.y - 8, p.x, p.y - 6, 0.2);
    return false;
  },
});

registerMech('hopCoil', {
  // The coil will not sit still: it hops toward the nearest foe and lands with a shock.
  shot(pr, rec, dt, cfg) {
    if (!isCoil(pr, rec)) return false;
    pr.mx += dt;
    if (pr.mx < (cfg.every || 1.1)) return false;
    pr.mx = 0;
    const e = nearest(pr.x, pr.y, 160);
    if (!e) return false;
    const dx = e.x - pr.x, dy = e.y - pr.y, d = Math.hypot(dx, dy) || 1;
    const go = Math.min(d - 6, cfg.hop || 56);
    if (go <= 0) return false;
    zap(rec.w, pr.x, pr.y - 6, pr.x + (dx / d) * go, pr.y + (dy / d) * go - 6, 0.16);
    pr.x += (dx / d) * go; pr.y += (dy / d) * go;
    damageCircle(pr.x, pr.y, 22, rec.w.resolved.damage * (cfg.dmg || 0.6), nextHitId(), { stun: 0.2 });
    spawnSpr('land_dust', pr.x, pr.y, '#fff6a0', 0.8);
    return false;
  },
});

registerMech('coilPop', {
  // When a coil's time is up it overloads and bursts, stunning everything round it.
  expire(pr, rec, cfg) {
    if (!isCoil(pr, rec)) return;
    damageCircle(pr.x, pr.y, (cfg.r || 48) * vk(pr.area), rec.w.resolved.damage * (cfg.dmg || 2.2), nextHitId(), { stun: 0.8, knockback: 60 });
    spawnSeq('fx_spark', pr.x, pr.y - 6, { dur: 0.35, fps: 14, scale: 2 });
    spawnSpr('ring_l', pr.x, pr.y, rec.def.colors[2], 1.3);
  },
});

// --- Electro Ball's overloads (a bouncer) -------------------------------------------------

registerMech('speedSpark', {
  // Electro Ball as it is in the games: the faster you are moving than the foe, the harder it hits.
  hit(e, dealt, rec, crit, cfg) {
    const p = G.player;
    if (!p || !e.alive) return;
    const ratio = Math.hypot(p.vx, p.vy) / Math.max(10, e.speed || 30);
    const bonus = Math.min(cfg.max || 2, Math.max(0, ratio - 0.5)) * (cfg.per || 0.6);
    if (bonus <= 0) return;
    damageEnemy(e, dealt * bonus, 0, 0, false);
    if (bonus > 0.6) spawnSpr('spark_s', e.x, e.y - 6, rec.def.colors[2], 1);
  },
});

registerMech('plasmaOrbit', {
  // The ball does not fly off: it circles you, crackling, for three and a half seconds.
  spawn(pr, w, cfg) {
    pr.maxLife = cfg.t || 3.5; pr.bounces = 999; pr.mx = G.rngFx() * TAU;
  },
  shot(pr, rec, dt, cfg) {
    const p = G.player;
    if (!p) return false;
    pr.bounces = 999;
    pr.mx += (cfg.spin || 4) * dt;
    const R = cfg.r || 46;
    pr.x = p.x + Math.cos(pr.mx) * R; pr.y = p.y + Math.sin(pr.mx) * R * 0.8 - 4;
    pr.vx = -Math.sin(pr.mx) * 60; pr.vy = Math.cos(pr.mx) * 60;
    return false;
  },
});

registerMech('shortCircuit', {
  // Every foe the ball strikes leaves a crackling spark on the floor that shocks whoever steps on it.
  hit(e, dealt, rec, crit, cfg) {
    if (count(EK.STATIC, rec.proc) >= (cfg.max || 10)) return;
    const a = take(EK.STATIC, procOf(rec));
    if (!a) return;
    a.x = e.x; a.y = e.y; a.life = cfg.t || 2.5; a.r = 14; a.dmg = rec.w.resolved.damage * (cfg.dmg || 0.4); a.k = 0.2;
  },
});

function staticStep(a, dt) {
  a.k -= dt;
  if (a.k > 0) return;
  a.k = 0.5;
  damageCircle(a.x, a.y, a.r, a.dmg, nextHitId(), { canCrit: false, stun: 0.1 });
}

// --- Live Wire's overloads (a tether) -----------------------------------------------------

registerMech('highVoltage', {
  // The longer a foe stays on the wire, the more current it takes: up to two and a half times.
  hit(e, dealt, rec, crit, cfg) {
    const i = mark(rec.w, 'hvL', e, 0.45);
    if (i < 0) return;
    const L = rec.w.hvL;
    L[i + 3] = Math.min(cfg.max || 25, L[i + 3] + 1);
    const bonus = L[i + 3] * (cfg.per || 0.06);
    if (e.alive) damageEnemy(e, dealt * bonus, 0, 0, false);
    if (L[i + 3] >= (cfg.max || 25) && G.rngFx() < 0.3) spawnSpr('spark_s', e.x, e.y - 6, rec.def.colors[2], 0.9);
  },
});

registerMech('jumpRope', {
  // The wire does not stop at its foe: it swings on to the next, and burns that stretch too.
  fire(w, st, p, cfg) {
    const t = nearest(p.x, p.y, w.def.range * st.range);
    if (!t) return;
    let x = t.x, y = t.y;
    const used = [t];
    for (let j = 0; j < (cfg.n || 2); j++) {
      const e = nearest(x, y, cfg.range || 90, used);
      if (!e) break;
      used.push(e);
      damageLine(x, y, Math.atan2(e.y - y, e.x - x), Math.hypot(e.x - x, e.y - y), w.def.r * st.area, st.damage * (cfg.dmg || 0.8), nextHitId(), { slow: 0.25, slowT: 1 });
      zap(w, x, y - 4, e.x, e.y - 4, 0.2);
      x = e.x; y = e.y;
    }
  },
});

registerMech('paralyze', {
  // Held on the wire long enough, a foe locks up, paralysed, then cannot be again for a while.
  hit(e, dealt, rec, crit, cfg) {
    const i = mark(rec.w, 'parL', e, 3);
    if (i < 0) return;
    const L = rec.w.parL;
    if (++L[i + 3] < (cfg.n || 8)) return;
    L[i + 3] = -(cfg.n || 8) * 2;               // its cooldown, counted in wire ticks
    e.stunT = Math.max(e.stunT, e.boss || e.legend ? 0.4 : cfg.t || 1.2);
    spawnSpr('circuit', e.x, e.y - e.r - 4, rec.def.colors[1], 1);
  },
});

// --- Registration ---------------------------------------------------------------------------

registerMoves({
  step: {
    [EK.WEB]: webStep, [EK.TRAP]: trapStep, [EK.CLING]: clingStep, [EK.GRID]: gridStep,
    [EK.BALL]: ballStep, [EK.STATIC]: staticStep, [EK.CLOUD]: cloudStep,
  },
  end: { [EK.WEB]: webEnd, [EK.BOLT]: boltEnd },
});
