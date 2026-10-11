// L3 -- may import L0-L2 and the move framework (moves/core.js).
//
// Ice: the new Avalanche, and the overload mechanics of Powder Snow, Sheer Cold (its evolution),
// Icicle Crash, Hail Cloud, Frost Veil and Frost Chain. Drawing is draw_ice.js.

import { G } from '../state.js';
import { TAU, dist2 } from '../util.js';
import { nextHitId, getDamageSource, setDamageSource } from '../world.js';
import { damageEnemy, damageCircle, damageLine, applyChill, killEnemy } from '../combat.js';
import { spawnSpr } from '../sprfx.js';
import { spawnSeq } from '../seqfx.js';
import { registerMech } from '../mechs.js';
import { ROLE } from '../fx.js';
import {
  KIND, vk, actors, MOVE_CAP as CAP, registerMoves, take, child, free, mech, lvSum, procOf,
  nearest, nearestN, each, movable, settle, ovProc, once, mark, eachMarked,
} from './core.js';

export const IK = {
  WALL: KIND.ice,              // Avalanche's wall of snow
  SHEET: KIND.ice + 1,         // Ice Slide's sheet left behind it
  DRIFT: KIND.ice + 2,         // Drifting Snow: a drift where a puff stopped
  PILLAR: KIND.ice + 3,        // an ice pillar (Glacier, Ice Age)
  FROST: KIND.ice + 4,         // Permafrost's frost on the ground
  NOVA: KIND.ice + 5,          // Frost Nova's burst, drawn
  BALL: KIND.ice + 6,          // Snow Squall's snowball
  BRIDGE: KIND.ice + 7,        // Ice Bridge's line between two chained foes
  SHARD: KIND.ice + 8,         // Shatter Chain's shard
};

function asProc(rec, fn) {
  const prev = getDamageSource();
  if (rec) setDamageSource(rec.proc);
  fn();
  setDamageSource(prev);
}
function count(kind, src) {
  let n = 0;
  for (let i = 0; i < CAP; i++) if (actors[i].on && actors[i].kind === kind && actors[i].src === src) n++;
  return n;
}

/** Freeze a foe solid for t seconds (much shorter on a boss; never a legend). */
export function freeze(e, t) {
  if (e.legend || !e.alive) return;
  e.frozenT = Math.max(e.frozenT, t * (e.boss ? 0.3 : 1));
  e.stunT = Math.max(e.stunT, e.frozenT);
}

export const ICE_BEHAVIOR = {
  /** Avalanche: a wall of snow sweeps across the field, burying and shoving what it meets. */
  avalanche(w, st, p) {
    const def = w.def;
    const t = nearest(p.x, p.y, def.range * st.range);
    if (!t) return false;
    const a = take(IK.WALL, w);
    if (!a) return true;
    const ang = Math.atan2(t.y - p.y, t.x - p.x);
    a.a = ang;
    // It comes from behind you, across your front, and on past the crowd.
    a.x = p.x - Math.cos(ang) * 40; a.y = p.y - Math.sin(ang) * 40;
    a.k = (def.wallLen || 120) * st.area;     // the wall's length
    a.life = st.duration; a.dmg = st.damage; a.area = st.area;
    a.vy0 = def.sweep || 150; a.n = 0; a.step = 0;
    return true;
  },
};

// --- Avalanche ------------------------------------------------------------------------------

function wallStep(a, dt) {
  const ux = Math.cos(a.a), uy = Math.sin(a.a);
  const sp = a.vy0 * dt;
  a.x += ux * sp; a.y += uy * sp;
  // Snowball Effect: it gathers itself as it goes, wider and harder for every foe it buries.
  const sb = mech(a.ov, 'snowballEffect');
  const L = a.k * (sb ? 1 + Math.min(sb.max || 0.8, a.n * (sb.per || 0.05)) : 1);
  const half = L / 2, depth = 12;
  each(a.x, a.y, half + 10, (e) => {
    const dx = e.x - a.x, dy = e.y - a.y;
    const along = dx * ux + dy * uy, side = dx * -uy + dy * ux;
    if (Math.abs(side) > half || along < -depth - e.r || along > depth + e.r) return;
    if (once(a, e)) {
      a.n++;
      damageEnemy(e, a.dmg * (sb ? 1 + Math.min(sb.max || 0.8, a.n * (sb.per || 0.05)) : 1), 0, 0, true);
      applyChill(e, 0.5, 2);
    }
    // Shoved along in front of the snow.
    if (movable(e)) { e.x = a.x + ux * (depth + e.r) + -uy * side; e.y = a.y + uy * (depth + e.r) + ux * side; settle(e); }
  });
  // Ice Slide: a slick of ice left behind it.
  const is = mech(a.ov, 'iceSlide');
  a.step -= dt;
  if (is && a.step <= 0) {
    a.step = 0.12;
    const s = child(IK.SHEET, a);
    if (s) { s.x = a.x; s.y = a.y; s.a = a.a; s.k = L; s.life = is.t || 2.5; s.dmg = a.dmg * (is.dmg || 0.15); s.fxT = 0; }
  }
}

function wallEnd(a) {
  // Burial: what is still caught in the snow when it stops is buried -- frozen, and fragile.
  const br = mech(a.ov, 'burial');
  const ux = Math.cos(a.a), uy = Math.sin(a.a);
  each(a.x, a.y, a.k / 2 + 16, (e) => {
    const along = (e.x - a.x) * ux + (e.y - a.y) * uy;
    if (along < -8 || along > 30) return;
    if (br) { freeze(e, br.t || 2); e.markT = Math.max(e.markT, br.t || 2); e.markMul = Math.max(e.markMul, br.mul || 0.5); }
    else if (!e.boss && !e.legend) e.stunT = Math.max(e.stunT, 0.4);
  });
  spawnSeq('fx_eos_icecrystal', a.x + ux * 10, a.y + uy * 10, { dur: 0.35, fps: 26, scale: 0.8 });
}

function sheetStep(a, dt) {
  // Foes on the slick slip: they slide on, slowed, and are nicked by the ice.
  const ux = Math.cos(a.a), uy = Math.sin(a.a);
  each(a.x, a.y, a.k / 2, (e) => {
    const along = (e.x - a.x) * ux + (e.y - a.y) * uy;
    if (Math.abs(along) > 8) return;
    e.slow = Math.max(e.slow, 0.5); e.slowT = Math.max(e.slowT, 0.3);
    if (movable(e)) { e.x += ux * 30 * dt; e.y += uy * 30 * dt; }
  });
  a.fxT -= dt;
  if (a.fxT > 0) return;
  a.fxT = 0.5;
  damageLine(a.x - uy * a.k / 2, a.y + ux * a.k / 2, a.a - Math.PI / 2, a.k, 8, a.dmg, nextHitId(), { canCrit: false });
}

registerMech('snowballEffect', {});
registerMech('iceSlide', {});
registerMech('burial', {});

// --- Powder Snow's overloads (a cone) -------------------------------------------------------

const isShot = (pr, rec) => pr.gen === ROLE.SHOT && pr.weapon === rec.w.defIdx;

registerMech('frostbite', {
  // A foe already chilled that the powder catches again is frostbitten: its cold starts to hurt,
  // more for every dose, up to five.
  hit(e, dealt, rec, crit, cfg) {
    if (e.slowT <= 0) return;
    const i = mark(rec.w, 'biteL', e, cfg.t || 3);
    if (i < 0) return;
    const L = rec.w.biteL;
    L[i + 3] = Math.min(cfg.max || 5, L[i + 3] + 1);
  },
  tick(w, dt, p, cfg, rec) {
    if (G.tick % 30) return;
    asProc(rec, () => eachMarked(w, 'biteL', (e, i, L) => {
      if (e.alive) damageEnemy(e, w.resolved.damage * (cfg.per || 0.25) * L[i + 3], 0, 0, false);
    }));
  },
});

registerMech('driftingSnow', {
  // The puffs slow and stop short, and where each settles it lies as a drift that slows for 2s.
  expire(pr, rec, cfg) {
    if (!isShot(pr, rec) || count(IK.DRIFT, rec.w.srcId) >= (cfg.max || 12)) return;
    const a = take(IK.DRIFT, rec.w);
    if (!a) return;
    a.x = pr.x; a.y = pr.y; a.life = cfg.t || 2; a.r = 12; a.k = 0; a.dmg = rec.w.resolved.damage * (cfg.dmg || 0.2);
  },
  spawn(pr) { pr.maxLife *= 0.7; },
});

function driftStep(a, dt) {
  each(a.x, a.y, a.r, (e) => { e.slow = Math.max(e.slow, 0.55); e.slowT = Math.max(e.slowT, 0.3); });
  a.k -= dt;
  if (a.k > 0) return;
  a.k = 0.5;
  damageCircle(a.x, a.y, a.r, a.dmg, nextHitId(), { canCrit: false });
}

registerMech('snowman', {
  // A foe chilled three times over is packed into a snowman: frozen for 2s.
  hit(e, dealt, rec, crit, cfg) {
    if (e.slowT <= 0 || e.frozenT > 0) return;
    const i = mark(rec.w, 'manL', e, cfg.t || 3);
    if (i < 0) return;
    const L = rec.w.manL;
    if (++L[i + 3] < (cfg.n || 3)) return;
    L[i + 3] = -6;
    freeze(e, cfg.freeze || 2);
    spawnSpr('freeze', e.x, e.y - 6, '#eaffff', 1);
  },
});

// --- Sheer Cold's overloads -----------------------------------------------------------------

registerMech('absoluteZero', {
  // A frozen or chilled foe brought below 15% of its health shatters outright.
  hit(e, dealt, rec, crit, cfg) {
    if (!e.alive || e.boss || e.legend || e.slowT <= 0) return;
    if (e.hp > e.maxHp * (cfg.at || 0.15)) return;
    spawnSeq('fx_eos_icecrystal', e.x, e.y - 6, { dur: 0.35, fps: 26, scale: 0.7 });
    killEnemy(e);
  },
});

registerMech('whiteout', {
  // No cone: the powder whirls out all round you as a blizzard.
  spawn(pr, w, cfg) {
    const p = G.player;
    if (!p || !isShot(pr, { w })) return;
    const ang = G.rngRun() * TAU, sp = Math.hypot(pr.vx, pr.vy);
    pr.vx = Math.cos(ang) * sp; pr.vy = Math.sin(ang) * sp;
  },
});

registerMech('iceAge', {
  // A foe frozen solid by the cold leaves an ice pillar where it stood, blocking the way for 3s.
  hit(e, dealt, rec, crit, cfg) {
    if (e.slowT <= 0 || G.rngRun() > (cfg.chance || 0.15) || count(IK.PILLAR, rec.proc) >= (cfg.max || 6)) return;
    freeze(e, cfg.freeze || 1.2);
    const a = take(IK.PILLAR, procOf(rec));
    if (!a) return;
    a.x = e.x + (G.rngFx() - 0.5) * 16; a.y = e.y + 8; a.life = cfg.t || 3; a.r = 9; a.dmg = rec.w.resolved.damage * 0.5;
  },
});

function pillarStep(a) {
  // Foes cannot walk through a pillar; the first time each touches it, it is chilled.
  each(a.x, a.y, a.r + 2, (e) => {
    if (!movable(e)) return;
    const dx = e.x - a.x, dy = e.y - a.y, d = Math.hypot(dx, dy) || 1;
    const go = a.r + e.r - d;
    if (go > 0) { e.x += (dx / d) * go; e.y += (dy / d) * go; settle(e); }
    if (once(a, e)) { applyChill(e, 0.5, 2); damageEnemy(e, a.dmg, 0, 0, false); }
  });
}

// --- Icicle Crash's overloads (a split) -----------------------------------------------------

registerMech('permafrost', {
  // Where the icicle shatters, frost spreads on the ground for 2s, slowing and nipping.
  expire(pr, rec, cfg) {
    if (pr.gen !== ROLE.SPLITTER || count(IK.FROST, rec.w.srcId) >= 4) return;
    const a = take(IK.FROST, rec.w);
    if (!a) return;
    a.x = pr.x; a.y = pr.y; a.life = cfg.t || 2; a.r = (cfg.r || 30) * vk(pr.area); a.k = 0; a.dmg = rec.w.resolved.damage * (cfg.dmg || 0.15);
  },
});

function frostStep(a, dt) {
  each(a.x, a.y, a.r, (e) => { e.slow = Math.max(e.slow, 0.5); e.slowT = Math.max(e.slowT, 0.3); });
  a.k -= dt;
  if (a.k > 0) return;
  a.k = 0.5;
  damageCircle(a.x, a.y, a.r, a.dmg, nextHitId(), { canCrit: false });
}

registerMech('glacier', {
  // The icicle does not shatter at once: it lodges where it lands as a pillar for 3s, then bursts.
  expire(pr, rec, cfg) {
    if (pr.gen !== ROLE.SPLITTER || count(IK.PILLAR, rec.w.srcId) >= (cfg.max || 3)) return;
    const a = take(IK.PILLAR, rec.w);
    if (!a) return;
    a.x = pr.x; a.y = pr.y + 4; a.life = cfg.t || 3; a.r = 10; a.dmg = rec.w.resolved.damage * (cfg.dmg || 0.5); a.done = true;
  },
});

function pillarEnd(a) {
  if (!a.done) return;
  damageCircle(a.x, a.y, 30, a.dmg * 2, nextHitId(), { knockback: 60, slow: 0.5, slowT: 2 });
  spawnSeq('fx_eos_icecrystal', a.x, a.y - 8, { dur: 0.35, fps: 26, scale: 0.9 });
}

registerMech('brittle', {
  // Foes the shards strike turn brittle for 1.5s, and take half as much again from everything.
  hit(e, dealt, rec, crit, cfg) { e.markT = Math.max(e.markT, cfg.t || 1.5); e.markMul = Math.max(e.markMul, cfg.mul || 0.5); },
});

// --- Hail Cloud's overloads (a turret) ------------------------------------------------------

const isCloud = (pr) => pr.gen === ROLE.TURRET;

registerMech('hailstorm', {
  // Each hailstone that strikes chills its foe further; three in a row and it freezes for a second.
  hit(e, dealt, rec, crit, cfg) {
    const i = mark(rec.w, 'hailL', e, 2);
    if (i < 0) return;
    const L = rec.w.hailL;
    if (++L[i + 3] < (cfg.n || 3)) return;
    L[i + 3] = 0;
    freeze(e, cfg.freeze || 1);
  },
});

registerMech('driftCloud', {
  // The cloud will not stay where you left it: it drifts after the crowd.
  shot(pr, rec, dt, cfg) {
    if (!isCloud(pr)) return false;
    const e = nearest(pr.x, pr.y, cfg.range || 200);
    if (!e) return false;
    const dx = e.x - pr.x, dy = e.y - pr.y, d = Math.hypot(dx, dy) || 1;
    if (d > 20) { pr.x += (dx / d) * (cfg.speed || 30) * dt; pr.y += (dy / d) * (cfg.speed || 30) * dt; }
    return false;
  },
});

registerMech('thunderSnow', {
  // Every few seconds the cloud cracks with thunder: a bolt on three foes beneath it.
  shot(pr, rec, dt, cfg) {
    if (!isCloud(pr)) return false;
    pr.mx += dt;
    if (pr.mx < (cfg.every || 2.5)) return false;
    pr.mx = 0;
    const L = nearestN(pr.x, pr.y, cfg.range || 140, cfg.n || 3);
    for (const e of L) {
      damageEnemy(e, rec.w.resolved.damage * (cfg.dmg || 1), 0, 0, true);
      if (!e.boss && !e.legend) e.stunT = Math.max(e.stunT, 0.3);
      spawnSpr('lightning', e.x, e.y - 40, '#fff6a0', 1);
    }
    return false;
  },
});

// --- Frost Veil's overloads (an aura) -------------------------------------------------------

registerMech('iceArmor', {
  // Standing in your veil grows a shell of ice over you that turns aside one hit every 4s.
  tick(w, dt, p, cfg) {
    if (!p) return;
    w.armorT = (w.armorT || 0) - dt;
    if (p.barrier || w.armorT > 0) return;
    w.armorT = cfg.every || 4;
    p.barrier = true;
    spawnSpr('guard_ring', p.x, p.y - 8, '#bfe9ff', 1);
  },
});

registerMech('frostNova', {
  // The veil holds its cold and releases it all at once every 2s: a freezing burst round you.
  shot(pr, rec) {
    if (pr.gen !== ROLE.SHOT || pr.weapon !== rec.w.defIdx) return false;
    pr.r = 0;                                   // the veil itself no longer bites
    return false;
  },
  tick(w, dt, p, cfg, rec) {
    if (!p) return;
    w.novaT = (w.novaT || 0) - dt;
    if (w.novaT > 0) return;
    w.novaT = cfg.every || 2;
    const R = w.def.r * w.resolved.area;
    asProc(rec, () => damageCircle(p.x, p.y, R, w.resolved.damage * (cfg.dmg || 2.5), nextHitId(), { knockback: 50 }));
    each(p.x, p.y, R, (e) => freeze(e, cfg.freeze || 0.8));
    const a = take(IK.NOVA, w);
    if (a) { a.life = 0.4; a.r = R; }
  },
});

function novaStep(a, dt, p) { if (p) { a.x = p.x; a.y = p.y; } }

registerMech('snowSquall', {
  // The veil flings snowballs at the foes near it, twice a second.
  tick(w, dt, p, cfg) {
    if (!p) return;
    w.squallT = (w.squallT || 0) - dt;
    if (w.squallT > 0) return;
    w.squallT = cfg.every || 0.5;
    const e = nearest(p.x, p.y, cfg.range || 110);
    if (!e) return;
    const a = take(IK.BALL, w);
    if (!a) return;
    a.x = p.x; a.y = p.y - 8; a.target = e; a.tsn = e.sn; a.life = 0.8; a.dmg = w.resolved.damage * (cfg.dmg || 0.7);
  },
});

function ballStep(a, dt) {
  const e = a.target;
  if (!e || !e.alive || e.sn !== a.tsn) { free(a); return; }
  const dx = e.x - a.x, dy = e.y - 4 - a.y, d = Math.hypot(dx, dy) || 1;
  const sp = 240 * dt;
  if (d <= sp + e.r) {
    damageEnemy(e, a.dmg, (dx / d) * 30, (dy / d) * 30, false);
    applyChill(e, 0.4, 1.5);
    spawnSpr('freeze_s', a.x, a.y, '#eaffff', 0.8);
    free(a);
    return;
  }
  a.x += (dx / d) * sp; a.y += (dy / d) * sp;
}

// --- Frost Chain's overloads (a chain) ------------------------------------------------------

registerMech('iceBridge', {
  // The chain leaves ice strung between the foes it joined; a foe that crosses a strand freezes.
  hit(e, dealt, rec, crit, cfg) {
    const w = rec.w;
    if (w.bridgeT === G.tick && w.bridgeE && w.bridgeE !== e && count(IK.BRIDGE, rec.proc) < 8) {
      const a = take(IK.BRIDGE, procOf(rec));
      if (a) {
        a.ox = w.bridgeE.x; a.oy = w.bridgeE.y; a.tx = e.x; a.ty = e.y; a.x = (a.ox + a.tx) / 2; a.y = (a.oy + a.ty) / 2;
        a.life = cfg.t || 2; a.k = 0;
      }
    }
    w.bridgeT = G.tick; w.bridgeE = e;
  },
});

function bridgeStep(a, dt) {
  a.k -= dt;
  if (a.k > 0) return;
  a.k = 0.3;
  const len = Math.hypot(a.tx - a.ox, a.ty - a.oy);
  if (len < 4) return;
  const ang = Math.atan2(a.ty - a.oy, a.tx - a.ox);
  // Anything on the strand is frozen briefly (once each).
  const ux = Math.cos(ang), uy = Math.sin(ang);
  each(a.x, a.y, len / 2 + 6, (e) => {
    const along = (e.x - a.ox) * ux + (e.y - a.oy) * uy, side = Math.abs((e.x - a.ox) * -uy + (e.y - a.oy) * ux);
    if (along < 0 || along > len || side > 6 + e.r || !once(a, e)) return;
    freeze(e, 1.2);
  });
}

registerMech('shatterChain', {
  // A foe the chain kills shatters, flinging ice shards at the three foes nearest it.
  kill(e, rec, cfg) {
    const L = nearestN(e.x, e.y, cfg.range || 90, cfg.n || 3);
    for (const o of L) {
      if (o === e) continue;
      const a = take(IK.SHARD, procOf(rec));
      if (!a) return;
      a.x = e.x; a.y = e.y - 4; a.target = o; a.tsn = o.sn; a.life = 0.6; a.dmg = rec.w.resolved.damage * (cfg.dmg || 0.5);
    }
    spawnSeq('fx_eos_icecrystal', e.x, e.y - 6, { dur: 0.3, fps: 30, scale: 0.6 });
  },
});

registerMech('coldSnap', {
  // The chain's cold sets in behind it: a second later every foe it reached is struck again.
  hit(e, dealt, rec, crit, cfg) { mark(rec.w, 'snapL', e, (cfg.delay || 1) + 0.2); },
  tick(w, dt, p, cfg, rec) {
    asProc(rec, () => eachMarked(w, 'snapL', (e, i, L) => {
      if (L[i + 3]) return;
      if (L[i + 2] - G.clock > 0.2) return;
      L[i + 3] = 1;
      damageEnemy(e, w.resolved.damage * (cfg.dmg || 0.5), 0, 0, false);
      applyChill(e, 0.5, 2);
      spawnSpr('freeze_s', e.x, e.y - 6, '#eaffff', 0.8);
    }));
  },
});

function shardStep(a, dt) {
  const e = a.target;
  if (!e || !e.alive || e.sn !== a.tsn) { free(a); return; }
  const dx = e.x - a.x, dy = e.y - 4 - a.y, d = Math.hypot(dx, dy) || 1;
  a.a = Math.atan2(dy, dx);
  const sp = 300 * dt;
  if (d <= sp + e.r) { damageEnemy(e, a.dmg, 0, 0, false); applyChill(e, 0.4, 1.5); free(a); return; }
  a.x += (dx / d) * sp; a.y += (dy / d) * sp;
}

// --- Registration ---------------------------------------------------------------------------

registerMoves({
  step: {
    [IK.WALL]: wallStep, [IK.SHEET]: sheetStep, [IK.DRIFT]: driftStep, [IK.PILLAR]: pillarStep,
    [IK.FROST]: frostStep, [IK.NOVA]: novaStep, [IK.BALL]: ballStep, [IK.BRIDGE]: bridgeStep,
    [IK.SHARD]: shardStep,
  },
  end: { [IK.WALL]: wallEnd, [IK.PILLAR]: pillarEnd },
});
