// L3 -- may import L0-L2 and the move framework (moves/core.js).
//
// Flying: the new Whirlwind, Feather Dance, Drill Peck (and its evolution Sky Attack) and
// Tailwind, and the overload mechanics of Pin Missile and Sky Guard. Drawing is draw_flying.js.

import { G } from '../state.js';
import { TAU, dist2 } from '../util.js';
import { projectiles, nextHitId } from '../world.js';
import { damageEnemy, damageCircle } from '../combat.js';
import { spawnSpr } from '../sprfx.js';
import { registerMech } from '../mechs.js';
import {
  KIND, vk, actors, MOVE_CAP as CAP, registerMoves, take, child, free, mech, lvSum, procOf,
  nearest, nearestN, toughest, each, movable, settle, heading, ovProc, once, mark, eachMarked,
} from './core.js';

export const FK = {
  GUST: KIND.flying,           // Whirlwind's blast, and the foes it is blowing
  NEEDLE: KIND.flying + 1,     // Needle Rain's falling needle
  QUILL: KIND.flying + 2,      // Quill Shed's quill on the floor
  FEATHER: KIND.flying + 3,    // a feather drifting down (Feather Dance, Plumage)
  WHIRL: KIND.flying + 4,      // Whirling Feathers' ring
  DRILL: KIND.flying + 5,      // Drill Peck's drill (and Sky Attack's)
  SHARD: KIND.flying + 6,      // Shrapnel's shard
  STREAM: KIND.flying + 7,     // a Tailwind stream
  EYE: KIND.flying + 8,        // Eye of the Storm's ring
  DIVE: KIND.flying + 9,       // a dive from the sky (Divebomb, Skyfall)
  MOLT: KIND.flying + 10,      // Molt's feather, waiting to be picked up
  WALL: KIND.flying + 11,      // Wind Wall
};

function count(kind, src) {
  let n = 0;
  for (let i = 0; i < CAP; i++) if (actors[i].on && actors[i].kind === kind && actors[i].src === src) n++;
  return n;
}

// --- Plumes: Feather Dance's featherweight foes -------------------------------------------
//
// A plumed foe takes knockback three times over, from everything. Its own resistance is kept in
// the mark and given back when the plume falls away.

function plume(w, e, t, mul = 3) {
  if (e.boss || e.legend || e.prop) return;
  const fresh = !(w.plumeL && w.plumeL.includes(e));
  const i = mark(w, 'plumeL', e, t);
  if (i < 0 || !fresh) return;
  w.plumeL[i + 3] = e.knockResist;
  e.knockResist = 1 - mul * (1 - e.knockResist);
}
function plumeTick(w) {
  eachMarked(w, 'plumeL', () => {}, (e, i, L) => { if (e.sn === L[i + 1]) e.knockResist = L[i + 3]; });
}

export const FLYING_BEHAVIOR = {
  /** Whirlwind: a blast that blows foes far away -- and a foe blown into another hurts them both. */
  whirlwind(w, st, p) {
    const def = w.def;
    const t = nearest(p.x, p.y, def.range * st.range);
    if (!t) return false;
    const ww = mech(w.ovl, 'windWall');
    const a = take(ww ? FK.WALL : FK.GUST, w);
    if (!a) return true;
    a.a = Math.atan2(t.y - p.y, t.x - p.x);
    a.x = p.x + Math.cos(a.a) * 10; a.y = p.y + Math.sin(a.a) * 10;
    a.dmg = st.damage; a.area = st.area; a.r = (def.gustR || 16) * st.area;
    a.k = def.travel || 0.5;
    a.life = ww ? ww.t || 1.5 : a.k + 0.5;
    a.vy0 = ((def.blow || 300) + lvSum(w, 'blowPlus')) * st.knock;
    return true;
  },

  /** Feather Dance: feathers drift down onto the crowd. A plumed foe is featherweight. */
  featherDance(w, st, p) {
    const def = w.def;
    const n = Math.max(1, Math.round(st.amount));
    const whirl = mech(w.ovl, 'whirlFeathers');
    if (whirl) {
      if (count(FK.WHIRL, w.srcId)) return false;
      const a = take(FK.WHIRL, w);
      if (!a) return true;
      a.life = whirl.t || 3; a.n = n + 2; a.dmg = st.damage; a.r = (whirl.r || 40) * vk(st.area); a.k = st.duration;
      return true;
    }
    const L = nearestN(p.x, p.y, def.range * st.range, n * 2);
    if (!L.length) return false;
    for (let i = 0; i < n; i++) {
      const e = L[(G.rngRun() * L.length) | 0];
      dropFeather(w, e.x + (G.rngRun() - 0.5) * 20, e.y + (G.rngRun() - 0.5) * 12, st.damage, st.area, st.duration);
    }
    return true;
  },

  /** Drill Peck: a drill bores through a line, slowing with every foe, hitting harder the deeper. */
  drillPeck(w, st, p) {
    const def = w.def;
    const t = def.sky ? toughest(p.x, p.y, def.range * st.range) : nearest(p.x, p.y, def.range * st.range);
    if (!t) return false;
    const a = take(FK.DRILL, w);
    if (!a) return true;
    a.a = Math.atan2(t.y - p.y, t.x - p.x);
    a.x = p.x; a.y = p.y - 4;
    a.vy0 = st.speed + lvSum(w, 'drillSpeed'); a.dmg = st.damage; a.area = st.area; a.r = def.r * st.area;
    a.life = 1.6; a.k = def.range * st.range * 1.3;     // how far it may bore
    a.n = 0;                                            // foes it has gone through
    a.step = mech(w.ovl, 'caromDrill') ? (mech(w.ovl, 'caromDrill').n || 2) : 0;
    a.fixed = !!def.sky;
    if (mech(w.ovl, 'aeroblast')) { a.r *= 2; a.done = true; }
    return true;
  },

  /** Tailwind: as you move, wind streams off your back, battering whatever follows. */
  tailwind(w, st, p) {
    const def = w.def;
    const v = Math.hypot(p.vx, p.vy);
    if (v < 8) return false;
    const a = take(FK.STREAM, w);
    if (!a) return true;
    const ux = p.vx / v, uy = p.vy / v;
    a.x = p.x - ux * 10; a.y = p.y - uy * 10 - 2;
    a.vx = -ux * (def.streamSpeed || 110); a.vy = -uy * (def.streamSpeed || 110);
    a.a = Math.atan2(a.vy, a.vx);
    a.life = st.duration; a.r = (def.streamR || 12) * st.area;
    const js = mech(w.ovl, 'jetstream');
    a.dmg = st.damage * (js ? 1 + Math.min(js.max || 1.5, Math.max(0, (v - 60) / 60)) : 1);
    a.knock = (def.knockback || 60) * st.knock;
    // And it carries you a little: a short burst of speed.
    p.hasteMul = Math.max(p.hasteT > 0 ? p.hasteMul : 1, def.haste || 1.15);
    p.hasteT = Math.max(p.hasteT, 0.35);
    return true;
  },
};

// --- Whirlwind ----------------------------------------------------------------------------

function gustStep(a, dt) {
  if (a.t < a.k) {
    // The blast rolls out, widening, catching what it meets.
    const sp = 260 * dt;
    a.x += Math.cos(a.a) * sp; a.y += Math.sin(a.a) * sp;
    const R = a.r * (0.6 + 0.6 * (a.t / a.k));
    each(a.x, a.y, R, (e) => {
      if (!once(a, e)) return;
      damageEnemy(e, a.dmg, 0, 0, true);
      blow(a, e, Math.cos(a.a), Math.sin(a.a), 1);
    });
  }
  // The blown: carried along, crashing into whatever they meet.
  const crash = a.def.crash || 0.8;
  const pin = mech(a.ov, 'pinball');
  // (`held` is `once`'s record of who was struck; the blown are kept in `pts`, four to a foe.)
  const B = a.pts;
  for (let i = B.length - 4; i >= 0; i -= 4) {
    const e = B[i];
    if (!e.alive || e.sn !== B[i + 1]) continue;
    const vx = B[i + 2], vy = B[i + 3];
    if (vx * vx + vy * vy < 400) continue;
    e.x += vx * dt; e.y += vy * dt;
    B[i + 2] *= 1 - 3 * dt; B[i + 3] *= 1 - 3 * dt;
    settle(e);
    each(e.x, e.y, e.r + 2, (o) => {
      if (o === e || !once(a, o, 1)) return;
      damageEnemy(o, a.dmg * crash, 0, 0, false);
      damageEnemy(e, a.dmg * crash * 0.5, 0, 0, false);
      spawnSpr('punch_s', (e.x + o.x) / 2, (e.y + o.y) / 2 - 4, '#f0f6ff', 0.9);
      // Pinball: what it crashes into is sent flying on in turn.
      if (pin && a.pts.length < 80) {
        const d = Math.hypot(vx, vy) || 1;
        blow(a, o, vx / d, vy / d, pin.keep || 0.7);
      }
    });
  }
}

/** Send a foe flying along (ux, uy), unless it is too heavy to move. */
function blow(a, e, ux, uy, k) {
  if (!movable(e)) return;
  const f = a.vy0 * k * (1 - Math.min(0.9, e.knockResist));
  a.pts.push(e, e.sn, ux * f, uy * f);
  const dd = mech(a.ov, 'dustDevil');
  if (dd) e.confuseT = Math.max(e.confuseT, dd.t || 1.5);
}

function wallStep(a, dt, p) {
  // Wind Wall: a standing wall of wind across your front, shoving back everything that comes.
  if (p) {
    const t = nearest(p.x, p.y, 200);
    if (t) a.a = Math.atan2(t.y - p.y, t.x - p.x);
    a.x = p.x + Math.cos(a.a) * 30; a.y = p.y + Math.sin(a.a) * 30;
  }
  const ux = Math.cos(a.a), uy = Math.sin(a.a);
  const W = a.r * 2.2;
  each(a.x, a.y, W, (e) => {
    const dx = e.x - a.x, dy = e.y - a.y;
    const side = dx * -uy + dy * ux;
    if (Math.abs(side) > W) return;
    if (movable(e)) { e.x += ux * 140 * dt; e.y += uy * 140 * dt; settle(e); }
  });
  a.k -= dt;
  if (a.k > 0) return;
  a.k = 0.3;
  const id = nextHitId();
  damageCircle(a.x, a.y, W, a.dmg * 0.8, id, { canCrit: false });
}

registerMech('pinball', {});
registerMech('windWall', {});
registerMech('dustDevil', {});

// --- Feather Dance ------------------------------------------------------------------------

function dropFeather(w, x, y, dmg, area, plumeT) {
  const a = take(FK.FEATHER, w);
  if (!a) return;
  a.x = x; a.y = y; a.z = 60 + G.rngFx() * 20; a.life = 1.1; a.dmg = dmg; a.area = area; a.k = plumeT;
  a.a = G.rngFx() * TAU;
}

function featherStep(a, dt) {
  a.z = Math.max(0, a.z - (a.z + 20) * 1.6 * dt);
  a.a += dt * 3;
  if (a.z > 3 || a.done) return;
  a.done = true;
  a.life = a.t + 0.4;
  const p = G.player;
  each(a.x, a.y, 14 * vk(a.area), (e) => {
    if (a.w) plume(a.w, e, a.k);
    const dx = e.x - (p ? p.x : a.x), dy = e.y - (p ? p.y : a.y), d = Math.hypot(dx, dy) || 1;
    damageEnemy(e, a.dmg, (dx / d) * 50, (dy / d) * 50, true);
    const tk = mech(a.ov, 'tickle');
    if (tk && !e.boss && !e.legend) { e.confuseT = Math.max(e.confuseT, tk.t || 2); e.stunT = Math.max(e.stunT, 0.3); }
  });
}

function whirlStep(a, dt, p) {
  if (!p) return;
  a.x = p.x; a.y = p.y;
  a.idx = (a.idx || 0);
  for (let i = 0; i < a.n; i++) {
    const ang = a.t * 3 + (i / a.n) * TAU;
    const fx = p.x + Math.cos(ang) * a.r, fy = p.y + Math.sin(ang) * a.r * 0.8;
    each(fx, fy, 8, (e) => {
      if (!once(a, e, i & 3)) return;
      if (a.w) plume(a.w, e, a.k);
      const dx = e.x - p.x, dy = e.y - p.y, d = Math.hypot(dx, dy) || 1;
      damageEnemy(e, a.dmg, (dx / d) * 60, (dy / d) * 60, true);
    });
  }
  // The ring forgets who it has struck every half second, so foes that stay are struck again.
  if (((a.t * 2) | 0) !== a.step) { a.step = (a.t * 2) | 0; a.held.length = 0; a.heldSn.length = 0; }
}

registerMech('downpour', {
  // A soft rain of feathers falls round you all the time, on top of the dance.
  tick(w, dt, p, cfg) {
    if (!p) return;
    w.rainT = (w.rainT || 0) - dt;
    if (w.rainT > 0) return;
    w.rainT = cfg.every || 0.4;
    const L = nearestN(p.x, p.y, cfg.range || 130, 8);
    if (!L.length) return;
    const e = L[(G.rngRun() * L.length) | 0];
    dropFeather(w, e.x, e.y, w.resolved.damage * (cfg.dmg || 0.5), 1, w.resolved.duration);
  },
});
registerMech('whirlFeathers', {});
registerMech('tickle', {});

// --- Drill Peck ---------------------------------------------------------------------------

function drillStep(a, dt) {
  if (a.fixed && a.t < 0.25) { a.z = a.t * 120; return; }     // Sky Attack: up first, glowing
  if (a.fixed) a.z = Math.max(0, a.z - 400 * dt);
  const sp = a.vy0 * dt;
  a.x += Math.cos(a.a) * sp; a.y += Math.sin(a.a) * sp;
  a.k -= sp;
  const aero = a.done;
  each(a.x, a.y, a.r, (e) => {
    if (!once(a, e)) return;
    // Deeper is harder: each foe gone through adds to the next blow.
    damageEnemy(e, a.dmg * (1 + a.n * (a.def.deeper || 0.15)), aero ? -Math.sin(a.a) * 90 : 0, aero ? Math.cos(a.a) * 90 : 0, true);
    if (a.fixed && !e.boss && !e.legend) e.stunT = Math.max(e.stunT, mech(a.ov, 'flinch') ? 0.6 : 0.3);
    a.n++;
    if (!aero) a.vy0 *= a.def.drag || 0.86;
    const sh = mech(a.ov, 'shrapnel');
    if (sh) shrapnel(a, e, sh);
    if (mech(a.ov, 'plumage') && a.w) { plume(a.w, e, 3); spawnSpr('motes', e.x, e.y - 6, '#ffffff', 0.7); }
  });
  if (a.vy0 < 70 || a.k <= 0) {
    // Carom Drill: at the end of its run it turns for the nearest foe and bores on.
    if (a.step > 0) {
      const e = nearest(a.x, a.y, 160, a.held);
      if (e) {
        a.step--; a.a = Math.atan2(e.y - a.y, e.x - a.x);
        a.vy0 = Math.max(a.vy0, (a.def.speed || 300) * 0.8); a.k = 160;
        spawnSpr('ring_s', a.x, a.y, '#f0f6ff', 1);
        return;
      }
    }
    a.life = a.t;
  }
}

function drillEnd(a) {
  const ex = mech(a.ov, 'excavate');
  if (ex) {
    damageCircle(a.x, a.y, (ex.r || 30) * vk(a.area), a.dmg * (1 + a.n * (ex.per || 0.3)), nextHitId(), { knockback: 60 });
    spawnSpr('land_dust', a.x, a.y, '#d8d0c0', 1.3);
  }
  const sf = mech(a.ov, 'skyfall');
  if (sf) {
    const d = child(FK.DIVE, a);
    if (d) { d.x = a.x; d.y = a.y; d.z = 90; d.life = 0.35; d.dmg = a.dmg * (sf.dmg || 1.6); d.r = (sf.r || 36) * vk(a.area); }
  }
  spawnSpr('ring_s', a.x, a.y - 4, '#f0f6ff', 0.9);
}

function shrapnel(a, e, cfg) {
  const L = nearestN(e.x, e.y, 90, 3);
  let n = 0;
  for (let i = 0; i < L.length && n < (cfg.n || 2); i++) {
    if (L[i] === e) continue;
    const s = child(FK.SHARD, a);
    if (!s) return;
    s.x = e.x; s.y = e.y - 4; s.target = L[i]; s.tsn = L[i].sn; s.life = 0.5; s.dmg = a.dmg * (cfg.dmg || 0.35);
    n++;
  }
}

function shardStep(a, dt) {
  const e = a.target;
  if (!e || !e.alive || e.sn !== a.tsn) { free(a); return; }
  const dx = e.x - a.x, dy = e.y - 4 - a.y, d = Math.hypot(dx, dy) || 1;
  a.a = Math.atan2(dy, dx);
  const sp = 320 * dt;
  if (d <= sp + e.r) { damageEnemy(e, a.dmg, 0, 0, false); free(a); return; }
  a.x += (dx / d) * sp; a.y += (dy / d) * sp;
}

function diveStep(a) { a.z = 90 * (1 - Math.min(1, a.t / a.life)); }
function diveEnd(a) {
  damageCircle(a.x, a.y, a.r, a.dmg, nextHitId(), { knockback: 70, stun: 0.4 });
  spawnSpr('land_dust', a.x, a.y, '#f0f6ff', 1.2);
  spawnSpr('flash_burst', a.x, a.y - 6, '#ffffff', 1);
}

registerMech('excavate', {});
registerMech('caromDrill', {});
registerMech('shrapnel', {});
registerMech('skyfall', {});
registerMech('aeroblast', {});
registerMech('flinch', {});
registerMech('plumage', {});

// --- Tailwind -----------------------------------------------------------------------------

function streamStep(a, dt) {
  a.x += a.vx * dt; a.y += a.vy * dt;
  a.vx *= 1 - 1.5 * dt; a.vy *= 1 - 1.5 * dt;
  const cw = mech(a.ov, 'crosswind');
  const ux = Math.cos(a.a), uy = Math.sin(a.a);
  each(a.x, a.y, a.r, (e) => {
    if (!once(a, e)) return;
    // Back along your trail -- or, with Crosswind, sideways off it.
    const side = ((e.x - a.x) * -uy + (e.y - a.y) * ux) >= 0 ? 1 : -1;
    const kx = cw ? -uy * side : ux, ky = cw ? ux * side : uy;
    damageEnemy(e, a.dmg, kx * a.knock, ky * a.knock, true);
    if (cw && movable(e)) mark(a.w, 'crossL', e, 0.5);
  });
}

registerMech('jetstream', {});
registerMech('crosswind', {
  // Foes thrown off your trail crash into whoever stands beside it.
  tick(w, dt, p, cfg, rec) {
    eachMarked(w, 'crossL', (e, i, L) => {
      if (L[i + 3]) return;
      each(e.x, e.y, e.r + 3, (o) => {
        if (o === e || L[i + 3]) return;
        L[i + 3] = 1;
        damageEnemy(o, w.resolved.damage * (cfg.dmg || 0.5), 0, 0, false);
        damageEnemy(e, w.resolved.damage * (cfg.dmg || 0.5), 0, 0, false);
        spawnSpr('punch_s', (e.x + o.x) / 2, (e.y + o.y) / 2 - 4, '#f0f6ff', 0.9);
      });
    });
  },
});

registerMech('eyeOfStorm', {
  // Stop after running, and the streams curl round you into a spinning ring for 1.5s.
  tick(w, dt, p, cfg) {
    if (!p) return;
    const v = Math.hypot(p.vx, p.vy);
    if (v > 8) { w.runT = (w.runT || 0) + dt; return; }
    if ((w.runT || 0) < (cfg.run || 1) || count(FK.EYE, w.srcId)) { w.runT = 0; return; }
    w.runT = 0;
    const a = take(FK.EYE, w);
    if (!a) return;
    a.life = cfg.t || 1.5; a.r = (cfg.r || 42) * vk(w.resolved.area); a.dmg = w.resolved.damage * (cfg.dmg || 0.6); a.k = 0;
  },
});

function eyeStep(a, dt, p) {
  if (!p) return;
  a.x = p.x; a.y = p.y;
  a.k -= dt;
  if (a.k > 0) return;
  a.k = 0.25;
  damageCircle(a.x, a.y, a.r, a.dmg, nextHitId(), { knockback: 90 });
}

// --- Pin Missile's overloads (a cone) -----------------------------------------------------

registerMech('pinCushion', {
  // Needles stay in what they hit. Six in one foe, and they all burst out of it at once.
  hit(e, dealt, rec, crit, cfg) {
    const i = mark(rec.w, 'pinL', e, cfg.t || 3);
    if (i < 0) return;
    const L = rec.w.pinL;
    if (++L[i + 3] < (cfg.n || 6)) return;
    L[i + 3] = 0;
    damageCircle(e.x, e.y, cfg.r || 22, rec.w.resolved.damage * (cfg.dmg || 2), nextHitId(), { knockback: 40, canCrit: false });
    spawnSpr('shard', e.x, e.y - 6, rec.def.colors[1], 1.2);
  },
});

registerMech('needleRain', {
  // The needles go up, not out, and come down in a ring round the nearest foe.
  spawn(pr) { pr.maxLife = 0.0001; pr.r = 0; pr.r0 = 0; pr.anim = null; pr.vis = 0.001; pr.x = pr.y = -99999; },
  fire(w, st, p, cfg) {
    const e = nearest(p.x, p.y, w.def.range * st.range);
    if (!e) return;
    const n = Math.max(1, Math.round(st.amount));
    for (let i = 0; i < n; i++) {
      const a = take(FK.NEEDLE, w);
      if (!a) return;
      const ang = (i / n) * TAU + G.rngFx() * 0.5, d = G.rngFx() * (cfg.r || 34);
      a.x = e.x + Math.cos(ang) * d; a.y = e.y + Math.sin(ang) * d * 0.7;
      a.z = 70 + i * 6; a.life = 0.3 + i * 0.03; a.dmg = st.damage * (cfg.dmg || 1.1); a.r = 8;
    }
  },
});

function needleStep(a) { a.z = Math.max(0, a.z * (1 - a.t / a.life)); }
function needleEnd(a) {
  let hit = null;
  each(a.x, a.y, a.r, (e) => { if (!hit) hit = e; });
  if (hit) damageEnemy(hit, a.dmg, 0, 0, true);
  spawnSpr('dust', a.x, a.y, '#b8cde0', 0.6);
}

registerMech('quillShed', {
  // Each needle that lands drops a quill on the floor; the first foe to step on one is stung.
  hit(e, dealt, rec, crit, cfg) {
    if (count(FK.QUILL, rec.proc) >= (cfg.max || 20)) return;
    const a = take(FK.QUILL, procOf(rec));
    if (!a) return;
    a.x = e.x + (G.rngFx() - 0.5) * 16; a.y = e.y + (G.rngFx() - 0.5) * 10; a.a = G.rngFx() * TAU;
    a.life = cfg.t || 4; a.r = 6; a.dmg = rec.w.resolved.damage * (cfg.dmg || 0.6);
  },
});

function quillStep(a) {
  if (a.t < 0.3) return;
  each(a.x, a.y, a.r, (e) => {
    if (!a.on) return;
    damageEnemy(e, a.dmg, 0, 0, false);
    e.slow = Math.max(e.slow, 0.3); e.slowT = Math.max(e.slowT, 1);
    free(a);
  });
}

// --- Sky Guard's overloads (a companion) --------------------------------------------------

registerMech('divebomb', {
  // Every two seconds the guard climbs and dives on a foe from the sky, stunning where it lands.
  tick(w, dt, p, cfg) {
    if (!p) return;
    w.diveT = (w.diveT || 0) - dt;
    if (w.diveT > 0) return;
    const e = nearest(p.x, p.y, cfg.range || 200);
    if (!e) return;
    w.diveT = cfg.every || 2;
    const a = take(FK.DIVE, w);
    if (!a) return;
    a.x = e.x; a.y = e.y; a.z = 90; a.life = 0.4; a.dmg = w.resolved.damage * (cfg.dmg || 1.5); a.r = cfg.r || 26;
  },
});

registerMech('escort', {
  // The guard stops hunting: it circles close round you and swallows enemy shots that come near.
  shot(pr, rec, dt, cfg) {
    const p = G.player;
    if (!p) return false;
    pr.mx += (cfg.spin || 3.2) * dt;
    const R = cfg.r || 30;
    pr.x = p.x + Math.cos(pr.mx) * R; pr.y = p.y + Math.sin(pr.mx) * R * 0.8 - 4;
    pr.vx = -Math.sin(pr.mx) * 50; pr.vy = Math.cos(pr.mx) * 50;
    for (let i = 0; i < projectiles.length; i++) {
      const q = projectiles[i];
      if (!q.alive || !q.hostile || q.r <= 0 || dist2(q.x, q.y, pr.x, pr.y) > 144) continue;
      q.life = q.maxLife; q.r = 0;
      spawnSpr('guard_ring', pr.x, pr.y, rec.def.colors[2], 0.8);
    }
    return false;
  },
});

registerMech('molt', {
  // The guard sheds feathers as it flies; each you walk over mends you a little.
  shot(pr, rec, dt, cfg) {
    pr.mx -= dt;
    if (pr.mx > 0) return false;
    pr.mx = cfg.every || 0.8;
    if (count(FK.MOLT, rec.w.srcId) >= (cfg.max || 6)) return false;
    const a = take(FK.MOLT, rec.w);
    if (a) { a.x = pr.x; a.y = pr.y; a.life = cfg.t || 6; a.a = G.rngFx() * TAU; a.dmg = cfg.heal || 0.01; }
    return false;
  },
});

function moltStep(a, dt, p) {
  if (!p || dist2(p.x, p.y, a.x, a.y) > 144) return;
  const s = G.stats;
  if (s) p.hp = Math.min(s.maxHp, p.hp + s.maxHp * a.dmg);
  spawnSpr('sparkle', a.x, a.y - 6, '#ffffff', 0.8);
  free(a);
}

// --- Registration ---------------------------------------------------------------------------

registerMoves({
  step: {
    [FK.GUST]: gustStep, [FK.WALL]: wallStep, [FK.FEATHER]: featherStep, [FK.WHIRL]: whirlStep,
    [FK.DRILL]: drillStep, [FK.SHARD]: shardStep, [FK.DIVE]: diveStep, [FK.STREAM]: streamStep,
    [FK.EYE]: eyeStep, [FK.NEEDLE]: needleStep, [FK.QUILL]: quillStep, [FK.MOLT]: moltStep,
  },
  end: { [FK.DRILL]: drillEnd, [FK.DIVE]: diveEnd, [FK.NEEDLE]: needleEnd },
  // Plumes wear off, and give back the knockback resistance they took, overloaded or not.
  pre: () => { const W = G.weapons; if (W) for (let i = 0; i < W.length; i++) if (W[i].plumeL) plumeTick(W[i]); },
});
