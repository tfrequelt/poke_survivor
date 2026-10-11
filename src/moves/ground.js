// L3 -- may import L0-L2 and the move framework (moves/core.js).
//
// Ground: the new Earth Power and Dig, and the overload mechanics of every Ground weapon -- Mud
// Shot's mudslide, clay coat and mud mask; Quagmire's sinkhole, mud wall and golem; Rock Orbit's
// ring quake, rock wall and geodes; Sand Tomb's pit, tomb chain and mirage; Bulldoze's steamroll,
// plough and rubble. Earth Power's and Dig's own overloads are read inline. Drawing is
// draw_ground.js.

import { G } from '../state.js';
import { TAU, dist2 } from '../util.js';
import { enemies, projectiles, zones, nextHitId } from '../world.js';
import { damageEnemy, damageCircle, damageLine, killEnemy } from '../combat.js';
import { spawnSpr } from '../sprfx.js';
import { spawnSeq } from '../seqfx.js';
import { ovlSprColor } from '../data/overloads.js';
import { registerMech } from '../mechs.js';
import { dropCoin } from '../pickups.js';
import { ROLE } from '../fx.js';
import {
  KIND, vk, actors, MOVE_CAP as CAP, registerMoves, take, child, free, mech, lvSum, procOf,
  nearest, each, movable, heading, settle, ovLook, ovProc,
} from './core.js';

export const GK = {
  LINE: KIND.ground,          // an Earth Power line, laying its spires
  SPIRE: KIND.ground + 1,
  VENT: KIND.ground + 2,
  LAVA: KIND.ground + 3,
  MOLE: KIND.ground + 4,      // Dig's burrower
  HOLE: KIND.ground + 5,
  SLIDE: KIND.ground + 6,     // Mudslide
  WALL: KIND.ground + 7,      // Mud Wall
  GOLEM: KIND.ground + 8,
  GEODE: KIND.ground + 9,
  PIT: KIND.ground + 10,
  MIRAGE: KIND.ground + 11,
  RUBBLE: KIND.ground + 12,
  COLLAPSE: KIND.ground + 13, // Undermine's path caving in
};

// --- Earth Power ------------------------------------------------------------------------------
//
// The ground splits open in a line from your feet toward the nearest foe: spire after spire
// erupting a beat apart, each one throwing up what stands on it.

export const GROUND_BEHAVIOR = {
  earthPower(w, st, p) {
    const def = w.def;
    const t = nearest(p.x, p.y, def.range * st.range);
    if (!t) return false;
    const base = Math.atan2(t.y - p.y, t.x - p.x);
    const n = Math.max(1, Math.round(st.amount));
    for (let i = 0; i < n; i++) {
      const a = take(GK.LINE, w);
      if (!a) break;
      a.x = p.x; a.y = p.y;
      a.a = n === 1 ? base : base + (i - (n - 1) / 2) * def.spread;
      a.k = def.gap || 0.07;                  // between spires
      a.step = 0;                             // spires laid
      a.n = Math.max(3, Math.round((def.range + lvSum(w, 'reach')) * st.range / (def.spacing || 18)));
      a.life = a.n * a.k + 0.1;
      a.dmg = st.damage; a.area = st.area; a.r = def.r * st.area;
      a.phase = 0;                            // 0 out, 1 the aftershock coming back
    }
    return true;
  },

  /** Dig: a burrower that tunnels to a foe and bursts up beneath it, then on to the next. */
  dig(w, st, p) {
    const def = w.def;
    const t = nearest(p.x, p.y, def.range * st.range);
    if (!t) return false;
    const n = Math.max(1, Math.round(st.amount));
    // Tunnel Network: first, everything bursts out of every hole the last digs left.
    const tun = mech(w.ovl, 'tunnels');
    if (tun) {
      let k = 0;
      for (let i = 0; i < CAP; i++) {
        const h = actors[i];
        if (!h.on || h.kind !== GK.HOLE || h.src !== w.srcId) continue;
        const b = take(GK.MOLE, w);
        if (!b) break;
        b.x = h.x; b.y = h.y; b.n = 0; b.k = 0; b.t = -k * 0.08; b.life = 0.3;
        b.dmg = st.damage * (tun.dmg || 0.8); b.area = st.area; b.r = def.r * st.area; b.phase = 9;
        free(h); k++;
      }
    }
    for (let i = 0; i < n; i++) {
      const a = take(GK.MOLE, w);
      if (!a) break;
      a.x = p.x; a.y = p.y;
      a.vx = st.speed;
      a.n = (def.hops || 1) + lvSum(w, 'hops');       // foes it surfaces under
      a.life = 6;
      a.dmg = st.damage; a.area = st.area; a.r = def.r * st.area;
      a.target = i === 0 ? t : nearest(p.x, p.y, def.range * st.range, [t]) || t;
      a.tsn = a.target.sn;
      a.pts.push(a.x, a.y);
    }
    return true;
  },
};

function lineStep(a, dt) {
  // Earthquake-quick: one spire per `k` seconds, out along the line (or, Fault Spiral, round you).
  while (a.step < a.n && a.t >= a.step * a.k) {
    const i = a.step++;
    const sp = mech(a.ov, 'spiralLine');
    let x, y;
    if (sp) {
      const ang = a.a + i * (sp.turn || 0.55), d = 22 + i * (sp.grow || 7) * a.area;
      x = a.x + Math.cos(ang) * d; y = a.y + Math.sin(ang) * d * 0.8;
    } else {
      const d = (i + 1) * 18 * a.area;
      x = a.x + Math.cos(a.a) * d; y = a.y + Math.sin(a.a) * d;
    }
    const s = child(GK.SPIRE, a);
    if (!s) continue;
    s.x = x; s.y = y; s.life = 0.45; s.r = a.r; s.dmg = a.dmg * (a.phase ? (mech(a.ov, 'aftershock').dmg || 0.7) : 1);
    s.area = a.area;
    const v = mech(a.ov, 'magmaVent');
    if (v && i % 2 === 0) {
      const vent = child(GK.VENT, a);
      if (vent) { vent.x = x; vent.y = y; vent.life = v.t || 2; vent.dmg = a.dmg * (v.dmg || 0.25); vent.area = a.area; }
    }
  }
}

/** The line is laid; Aftershock sends it back again, from the far end to you. */
function lineEnd(a) {
  const af = mech(a.ov, 'aftershock');
  if (!af || a.phase) return;
  const b = child(GK.LINE, a);
  if (!b) return;
  const far = a.n * 18 * a.area;
  b.x = a.x + Math.cos(a.a) * (far + 18 * a.area); b.y = a.y + Math.sin(a.a) * (far + 18 * a.area);
  b.a = a.a + Math.PI; b.k = a.k; b.n = a.n; b.step = 0; b.phase = 1;
  b.t = -(af.delay || 0.8); b.life = b.n * b.k + 0.1;
  b.dmg = a.dmg; b.area = a.area; b.r = a.r;
}

function spireStep(a) {
  if (a.done || a.t < 0.06) return;
  a.done = true;
  damageCircle(a.x, a.y, a.r, a.dmg, nextHitId(), { stun: 0.3 + (a.w ? lvSum(a.w, 'stunPlus') : 0), knockback: 40 });
  if (G.tick % 2 === 0) spawnSpr('land_dust', a.x, a.y, '#9a8070', 0.8);
}

/** Magma Vent: what a spire leaves -- a crack that spits lava drops about it for a while. */
function ventStep(a, dt) {
  a.k -= dt;
  if (a.k > 0) return;
  a.k = 0.35;
  const l = child(GK.LAVA, a);
  if (!l) return;
  const ang = G.rngFx() * TAU, d = 12 + G.rngFx() * 22;
  l.ox = a.x; l.oy = a.y; l.tx = a.x + Math.cos(ang) * d; l.ty = a.y + Math.sin(ang) * d * 0.7;
  l.life = 0.4; l.dmg = a.dmg; l.r = 10 * a.area;
}

function lavaStep(a) {
  const k = Math.min(1, a.t / a.life);
  a.x = a.ox + (a.tx - a.ox) * k; a.y = a.oy + (a.ty - a.oy) * k;
  a.z = Math.sin(k * Math.PI) * 18;
  if (k >= 1 && !a.done) {
    a.done = true;
    damageCircle(a.x, a.y, a.r, a.dmg, nextHitId(), { burn: a.dmg * 0.5, burnT: 2 });
    spawnSpr('lava', a.x, a.y, '#ff7a1a', 0.8);
  }
}

// --- Dig --------------------------------------------------------------------------------------

function moleStep(a, dt, p) {
  if (a.phase === 9) {
    // A Tunnel Network burst out of an old hole.
    if (a.t >= 0 && !a.done) { a.done = true; burstUp(a); }
    return;
  }
  const tg = a.target;
  if (!tg || !tg.alive || tg.sn !== a.tsn) {
    a.target = nearest(a.x, a.y, 200); a.tsn = a.target ? a.target.sn : 0;
    if (!a.target) { finishDig(a); free(a); return; }
  }
  const e = a.target;
  const dx = e.x - a.x, dy = e.y - a.y, d = Math.hypot(dx, dy) || 1;
  const step = a.vx * dt;
  // A mound of earth runs along the ground ahead of it, throwing up dust.
  a.fxT -= dt;
  if (a.fxT <= 0) { a.fxT = 0.06; spawnSpr('dust', a.x, a.y + 2, '#a08868', 0.7); }
  if (G.tick % 6 === 0) a.pts.push(a.x, a.y);
  if (d <= step + 4) {
    a.x = e.x; a.y = e.y;
    burstUp(a);
    a.n--;
    if (a.n <= 0) { finishDig(a); free(a); return; }
    a.target = nearest(a.x, a.y, 200, [e]); a.tsn = a.target ? a.target.sn : 0;
    if (!a.target) { finishDig(a); free(a); }
    return;
  }
  a.x += (dx / d) * step; a.y += (dy / d) * step;
}

/** Bursting up out of the ground under a foe. */
function burstUp(a) {
  damageCircle(a.x, a.y, 24 * a.area, a.dmg, nextHitId(), { stun: 0.4, knockback: 70 });
  // Clods of earth and stone thrown up out of the hole.
  for (let i = 0; i < 6; i++) {
    const ang = (i / 6) * TAU + G.rngFx() * 0.5;
    spawnSeq('fx_ancient', a.x, a.y - 6, { dur: 0.4, fps: 0.01, frame0: i % 5, scale: 0.8 * vk(a.area),
      vx: Math.cos(ang) * 70, vy: Math.sin(ang) * 50 - 40 });
  }
  spawnSpr('land_dust', a.x - 8, a.y, '#a08868', 1.1);
  spawnSpr('land_dust', a.x + 8, a.y, '#a08868', 1.1);
  ovProc(a, a.x, a.y - 6, 1);
  // Treasure Dig: there is sometimes something down there.
  const tr = mech(a.ov, 'treasure');
  if (tr && G.rngRun() < (tr.coin || 0.4)) dropCoin(a.x, a.y, Math.max(1, Math.round(2 + G.rngRun() * 4)));
  // Tunnel Network: it leaves a hole behind.
  const tun = mech(a.ov, 'tunnels');
  if (tun) {
    const h = child(GK.HOLE, a);
    if (h) { h.x = a.x; h.y = a.y; h.life = tun.t || 6; }
  }
}

/** Undermine: when the digging is done, the whole tunnel caves in under everything above it. */
function finishDig(a) {
  const um = mech(a.ov, 'undermine');
  if (!um || a.pts.length < 4) return;
  const c = child(GK.COLLAPSE, a);
  if (!c) return;
  for (let i = 0; i < a.pts.length; i++) c.pts.push(a.pts[i]);
  c.pts.push(a.x, a.y);
  c.life = 0.5; c.dmg = a.dmg * (um.dmg || 0.8); c.area = a.area;
}

function collapseStep(a) {
  if (a.done || a.t < 0.15) return;
  a.done = true;
  const id = nextHitId();
  for (let i = 0; i + 3 < a.pts.length; i += 2) {
    const x0 = a.pts[i], y0 = a.pts[i + 1], x1 = a.pts[i + 2], y1 = a.pts[i + 3];
    const len = Math.hypot(x1 - x0, y1 - y0);
    if (len < 1) continue;
    damageLine(x0, y0, Math.atan2(y1 - y0, x1 - x0), len, 12 * a.area, a.dmg, id, { stun: 0.6 });
    if (i % 6 === 0) spawnSpr('land_dust', x0, y0, '#7a6450', 1);
  }
}

// --- Mud Shot's overloads ---------------------------------------------------------------------

registerMech('mudslide', {
  // The puddle does not settle: it slides on along the throw, slowing and battering what it meets.
  expire(pr, rec, cfg) {
    const a = take(GK.SLIDE, rec.w);
    if (!a) return;
    const sp = Math.hypot(pr.vx, pr.vy) || 1;
    a.ox = a.x = pr.x; a.oy = a.y = pr.y;
    a.vx = (pr.vx / sp) * (cfg.len || 60); a.vy = (pr.vy / sp) * (cfg.len || 60);
    a.life = 1; a.dmg = pr.dmg * (cfg.dmg || 0.6); a.r = 14 * (pr.area || 1);
  },
});

function slideStep(a, dt) {
  a.x += a.vx * dt; a.y += a.vy * dt;
  each(a.x, a.y, a.r, (e) => {
    e.slow = Math.max(e.slow, 0.5); e.slowT = Math.max(e.slowT, 1);
    if (e.lastHitId === a.hitId) return;
    e.lastHitId = a.hitId;
    damageEnemy(e, a.dmg, a.vx * 0.6, a.vy * 0.6, true);
  });
}

registerMech('clayCoat', {
  // A glob landing near you hardens into a coat of clay: each layer halves one hit, up to five.
  expire(pr, rec, cfg) {
    const p = G.player;
    if (!p || dist2(p.x, p.y, pr.x, pr.y) > 70 * 70) return;
    if ((p.clay || 0) >= (cfg.max || 5)) return;
    p.clay = (p.clay || 0) + 1;
    spawnSpr('guard_ring', p.x, p.y - 6, '#b08050', 0.6 + p.clay * 0.1);
  },
});

registerMech('mudMask', {
  // Muddied foes lose you: for a few seconds they plod toward the nearest mud puddle instead.
  hit(e, dealt, rec, crit, cfg) {
    if (!movable(e)) return;
    const w = rec.w;
    if (!w.masked) { w.masked = []; w.maskedSn = []; w.maskedT = []; }
    const i = w.masked.indexOf(e);
    if (i >= 0 && w.maskedSn[i] === e.sn) { w.maskedT[i] = G.clock + (cfg.t || 3); return; }
    if (w.masked.length >= 30) return;
    w.masked.push(e); w.maskedSn.push(e.sn); w.maskedT.push(G.clock + (cfg.t || 3));
  },
  tick(w, dt) {
    const m = w.masked;
    if (!m || !m.length) return;
    for (let i = m.length - 1; i >= 0; i--) {
      const e = m[i];
      if (!e.alive || e.sn !== w.maskedSn[i] || G.clock > w.maskedT[i]) { m.splice(i, 1); w.maskedSn.splice(i, 1); w.maskedT.splice(i, 1); continue; }
      // The nearest of this weapon's puddles.
      let best = null, bd = 1e12;
      for (let j = 0; j < zones.length; j++) {
        const z = zones[j];
        if (z.src !== w.srcId) continue;
        const d = dist2(z.x, z.y, e.x, e.y);
        if (d < bd) { bd = d; best = z; }
      }
      if (!best) continue;
      e.stunT = Math.max(e.stunT, 0.05);
      const d = Math.sqrt(bd) || 1;
      if (d > 4) { e.x += ((best.x - e.x) / d) * e.speed * 0.8 * dt; e.y += ((best.y - e.y) / d) * e.speed * 0.8 * dt; }
      if (G.tick % 20 === i % 20) spawnSpr('dot', e.x, e.y - e.r - 2, '#8a6030', 1, 0, 0, 15);
    }
  },
});

// --- Quagmire's overloads ---------------------------------------------------------------------

registerMech('sinkhole', {
  // The puddles swallow: the longer a foe wades, the slower it gets, until it is stuck fast.
  zone(z, rec, dt, cfg) {
    each(z.x, z.y, z.r, (e) => {
      if (!movable(e)) return;
      e.slow = Math.min(0.95, Math.max(e.slow, 0.35) + dt * (cfg.rate || 0.35));
      e.slowT = Math.max(e.slowT, 0.3);
      if (e.slow > 0.9) e.stunT = Math.max(e.stunT, 0.2);
    });
  },
});

registerMech('mudWall', {
  // Each glob lands as a short wall of mud across the throw that foes cannot walk through.
  expire(pr, rec, cfg) {
    const a = take(GK.WALL, rec.w);
    if (!a) return;
    a.x = pr.x; a.y = pr.y;
    a.a = Math.atan2(pr.vy, pr.vx) + Math.PI / 2;
    a.k = (cfg.len || 50) * (pr.area || 1);
    a.life = cfg.t || 2.5;
  },
});

function wallStep(a) {
  const ux = Math.cos(a.a), uy = Math.sin(a.a);
  each(a.x, a.y, a.k / 2 + 8, (e) => {
    if (!movable(e)) return;
    const ex = e.x - a.x, ey = e.y - a.y;
    const along = ex * ux + ey * uy;
    if (Math.abs(along) > a.k / 2) return;
    const side = ex * -uy + ey * ux;
    const need = e.r + 4;
    if (Math.abs(side) >= need) return;
    // Pushed back out to the side it came from.
    const s = side >= 0 ? 1 : -1;
    e.x += -uy * (need - Math.abs(side)) * s; e.y += ux * (need - Math.abs(side)) * s;
    e.slow = Math.max(e.slow, 0.4); e.slowT = Math.max(e.slowT, 0.3);
  });
}

registerMech('golem', {
  // Now and then a puddle heaves itself up into a mud golem that lumbers after the crowd.
  expire(pr, rec, cfg) {
    if (G.rngRun() >= (cfg.chance || 0.2)) return;
    let n = 0;
    for (let i = 0; i < CAP; i++) if (actors[i].on && actors[i].kind === GK.GOLEM) n++;
    if (n >= (cfg.max || 3)) return;
    const a = take(GK.GOLEM, rec.w);
    if (!a) return;
    a.x = pr.x; a.y = pr.y; a.life = cfg.t || 5; a.dmg = pr.dmg * (cfg.dmg || 1.2); a.r = 24 * (pr.area || 1);
    a.vx = 32;
  },
});

function golemStep(a, dt) {
  const e = nearest(a.x, a.y, 200);
  if (e) {
    const dx = e.x - a.x, dy = e.y - a.y, d = Math.hypot(dx, dy) || 1;
    if (d > 10) { a.x += (dx / d) * a.vx * dt; a.y += (dy / d) * a.vx * dt; a.idx = dx < 0 ? 1 : 0; }
  }
  a.k -= dt;
  if (a.k > 0) return;
  a.k = 0.8;
  damageCircle(a.x, a.y, a.r, a.dmg, nextHitId(), { knockback: 90, stun: 0.2 });
  spawnSpr('land_dust', a.x, a.y, '#8a6030', 1.2);
  a.step = G.clock;
}

// --- Rock Orbit's overloads -------------------------------------------------------------------

registerMech('ringQuake', {
  // Every time the ring re-forms, it slams into the ground around you as a quake.
  fire(w, st, p, cfg) {
    const r = (w.def.orbitRadius || 44) * st.area * 1.15;
    damageCircle(p.x, p.y, r, st.damage * (cfg.dmg || 1.2), nextHitId(), { stun: 0.4, knockback: 80 });
    for (let i = 0; i < 8; i++) {
      const ang = (i / 8) * TAU;
      spawnSeq('fx_quake', p.x + Math.cos(ang) * r, p.y + Math.sin(ang) * r * 0.7 + 6, { dur: 0.4, fps: 14, scale: 0.35 });
    }
  },
});

registerMech('rockWall', {
  // The rocks stop circling: each new ring stands as a wall across your path for a while.
  spawn(pr, w, cfg) {
    const p = G.player;
    if (!p) return;
    const i = w.wallI = (w.wallI || 0) + 1;
    const h = heading(p, 200);
    const off = ((i >> 1) * (i & 1 ? 1 : -1)) * 0.32;
    const r = (w.def.orbitRadius || 44) * 1.1;
    pr.ox = pr.x = p.x + Math.cos(h + off) * r;
    pr.oy = pr.y = p.y + Math.sin(h + off) * r;
    pr.mx = 1; pr.maxLife = cfg.t || 2;
  },
  fire(w) { w.wallI = 0; },
  shot(pr, rec, dt) {
    if (pr.mx !== 1) return false;
    pr.x = pr.ox; pr.y = pr.oy;
    each(pr.x, pr.y, pr.r + 6, (e) => {
      if (!movable(e)) return;
      const dx = e.x - pr.x, dy = e.y - pr.y, d = Math.hypot(dx, dy) || 1;
      // Held at arm's length, but still touching: the rocks keep grinding what presses on them.
      const need = pr.r + e.r - 1;
      if (d < need) { e.x = pr.x + (dx / d) * need; e.y = pr.y + (dy / d) * need; }
    });
    pr.t += dt;
    if (pr.t > 0.5) { pr.t = 0; pr.hitId = nextHitId(); }
    return false;
  },
});

registerMech('geode', {
  // A rock that kills cracks open into a geode on the spot, pulsing for a few seconds.
  kill(e, rec, cfg) {
    let n = 0;
    for (let i = 0; i < CAP; i++) if (actors[i].on && actors[i].kind === GK.GEODE) n++;
    if (n >= 8) return;
    const a = take(GK.GEODE, procOf(rec));
    if (!a) return;
    a.x = e.x; a.y = e.y; a.life = cfg.t || 3; a.r = cfg.r || 22; a.dmg = rec.w.resolved.damage * (cfg.dmg || 0.3);
  },
});

function pulseZone(a, dt, gap) {
  a.k -= dt;
  if (a.k > 0) return false;
  a.k = gap;
  damageCircle(a.x, a.y, a.r, a.dmg, nextHitId(), { canCrit: false });
  return true;
}

// --- Sand Tomb's overloads (mines) ------------------------------------------------------------

registerMech('pit', {
  // A mine that goes off leaves a pit of quicksand: the weak are swallowed, the rest held.
  expire(pr, rec, cfg) {
    const a = take(GK.PIT, rec.w);
    if (!a) return;
    a.x = pr.x; a.y = pr.y; a.life = cfg.t || 2; a.r = (cfg.r || 30) * (pr.area || 1);
    a.k = cfg.exec || 0.12;
  },
});

function pitStep(a, dt) {
  each(a.x, a.y, a.r, (e) => {
    if (!movable(e)) return;
    if (e.hp <= e.maxHp * a.k) { spawnSpr('land_dust', e.x, e.y, '#c49a5e', 1); killEnemy(e); return; }
    const dx = a.x - e.x, dy = a.y - e.y, d = Math.hypot(dx, dy) || 1;
    e.x += (dx / d) * 40 * dt; e.y += (dy / d) * 40 * dt;
    e.stunT = Math.max(e.stunT, 0.1);
  });
}

registerMech('tombChain', {
  // The mines are strung together under the sand: set one off and its neighbours go up after it.
  expire(pr, rec, cfg) {
    if (pr.mx === 2) {
      // Set off by a neighbour: its own blast.
      damageCircle(pr.x, pr.y, (pr.payload || 30) * (pr.area || 1), pr.dmg, nextHitId(), { knockback: 70, stun: 0.2 });
      spawnSeq('fx_break', pr.x, pr.y - 6, { dur: 0.3, fps: 18, scale: 0.45 });
    }
    const r2 = (cfg.r || 90) * (cfg.r || 90);
    for (let i = 0; i < projectiles.length; i++) {
      const q = projectiles[i];
      if (!q.alive || q === pr || q.weapon !== rec.w.defIdx || q.gen !== ROLE.MINE || q.mx === 2) continue;
      if (dist2(q.x, q.y, pr.x, pr.y) > r2) continue;
      q.mx = 2;
      q.life = q.maxLife - 0.1;
      spawnSpr('spark_line', (q.x + pr.x) / 2, (q.y + pr.y) / 2, '#ffd8a0', 1, Math.atan2(q.y - pr.y, q.x - pr.x));
    }
  },
});

registerMech('mirage', {
  // Each mine wears your shape in the heat haze: foes near it are lured onto it.
  spawn(pr, w) {
    const a = take(GK.MIRAGE, w);
    if (!a || !G.player) return;
    const p = G.player;
    a.target = pr; a.tsn = pr.hitId; a.life = pr.maxLife + 0.1;
    a.spr = p.sprBase + p.dir;
  },
});

function mirageStep(a, dt) {
  const pr = a.target;
  if (!pr || !pr.alive || pr.hitId !== a.tsn) { free(a); return; }
  a.x = pr.x; a.y = pr.y;
  each(a.x, a.y, 70, (e) => {
    if (!movable(e)) return;
    const dx = a.x - e.x, dy = a.y - e.y, d = Math.hypot(dx, dy) || 1;
    if (d < 4) return;
    e.x += (dx / d) * 35 * dt; e.y += (dy / d) * 35 * dt;
  });
}

// --- Bulldoze's overloads (a sweep) -----------------------------------------------------------

registerMech('steamroll', {
  // What the sweep knocks down stays flat for a moment, and takes more from the next blow.
  hit(e, dealt, rec, crit, cfg) {
    e.stunT = Math.max(e.stunT, 0.4);
    e.markT = Math.max(e.markT, cfg.t || 2);
    e.markMul = Math.max(e.markMul, cfg.mul || 0.5);
    if (G.rngFx() < 0.3) spawnSpr('dust', e.x, e.y, '#c49a5e', 0.8);
  },
});

registerMech('plough', {
  // The sweep scoops up what it hits and drags it along the arc, dumping the lot at the end.
  shot(pr) {
    each(pr.x, pr.y, pr.r + 4, (e) => {
      if (!movable(e)) return;
      e.x += (pr.x - e.x) * 0.5; e.y += (pr.y - e.y) * 0.5;
      e.stunT = Math.max(e.stunT, 0.15);
    });
    return false;
  },
});

registerMech('rubble', {
  // The swing throws up a ring of rubble around you that foes stumble over.
  fire(w, st, p, cfg) {
    const n = cfg.n || 8;
    for (let i = 0; i < n; i++) {
      const a = take(GK.RUBBLE, w);
      if (!a) break;
      const ang = (i / n) * TAU + G.rngFx() * 0.3;
      a.x = p.x + Math.cos(ang) * (cfg.r || 48); a.y = p.y + Math.sin(ang) * (cfg.r || 48) * 0.8;
      a.life = cfg.t || 3; a.r = 9; a.dmg = st.damage * (cfg.dmg || 0.3); a.idx = i % 5;
    }
  },
});

function rubbleStep(a, dt) {
  each(a.x, a.y, a.r, (e) => { e.slow = Math.max(e.slow, 0.5); e.slowT = Math.max(e.slowT, 0.4); });
  pulseZone(a, dt, 0.4);
}

// --- Registration ------------------------------------------------------------------------------

registerMoves({
  step: {
    [GK.LINE]: lineStep, [GK.SPIRE]: spireStep, [GK.VENT]: ventStep, [GK.LAVA]: lavaStep,
    [GK.MOLE]: moleStep, [GK.SLIDE]: slideStep, [GK.WALL]: wallStep, [GK.GOLEM]: golemStep,
    [GK.GEODE]: (a, dt) => pulseZone(a, dt, 0.5), [GK.PIT]: pitStep, [GK.MIRAGE]: mirageStep,
    [GK.RUBBLE]: rubbleStep, [GK.COLLAPSE]: collapseStep,
  },
  end: {
    [GK.LINE]: lineEnd,
    [GK.MOLE]: finishDig,
  },
});
