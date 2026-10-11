// L3 -- may import L0-L2 and the move framework (moves/core.js).
//
// Dark: the new Sucker Punch, Torment and Feint Attack, and the overload mechanics of Night Daze,
// Foul Play, Night Slash (its evolution) and Dark Void. Drawing is draw_dark.js.

import { G } from '../state.js';
import { TAU, clampToBounds } from '../util.js';
import { nextHitId, getDamageSource, setDamageSource } from '../world.js';
import { damageEnemy, damageCircle, damageRing, critCtx } from '../combat.js';
import { dropCoin } from '../pickups.js';
import { spawnSpr } from '../sprfx.js';
import { spawnSeq } from '../seqfx.js';
import { registerMech } from '../mechs.js';
import { ROLE } from '../fx.js';
import {
  KIND, vk, actors, MOVE_CAP as CAP, registerMoves, take, child, free, mech, lvSum, procOf,
  nearest, nearestN, toughest, each, movable, settle, ovProc, once, mark, eachMarked,
} from './core.js';

export const DKK = {
  FIST: KIND.dark,             // a sucker punch landing
  TORMENT: KIND.dark + 1,      // a tormented foe's aura
  SHADE: KIND.dark + 2,        // a feint's shadow behind its foe
  WOUND: KIND.dark + 3,        // Gloom Edge's bleeding wound
  CRES: KIND.dark + 4,         // Crescent Storm's thrown crescent
  RING: KIND.dark + 5,         // Dark Pulse's ring, drawn
  ORBIT: KIND.dark + 6,        // Skull Orbit's circling skull
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
const winding = (e) => e.atkWind > 0 || e.specWind > 0;
function tormentOn(e, src) {
  for (let i = 0; i < CAP; i++) {
    const a = actors[i];
    if (a.on && a.kind === DKK.TORMENT && a.target === e && a.tsn === e.sn && a.src === src) return a;
  }
  return null;
}

export const DARK_BEHAVIOR = {
  /**
   * Sucker Punch: a fist out of nowhere on any foe winding up an attack or a cast -- hard, and it
   * knocks the move out of it. With nobody winding up, it jabs the nearest, lightly.
   */
  suckerPunch(w, st, p) {
    const def = w.def;
    const n = Math.max(1, Math.round(st.amount));
    const L = nearestN(p.x, p.y, def.range * st.range, 14);
    if (!L.length) return false;
    const picks = L.filter(winding).slice(0, n);
    const counter = picks.length > 0;
    if (!counter) picks.push(L[0]);
    const one = mech(w.ovl, 'oneTwo');
    for (const e of picks) {
      for (let k = 0; k < (one ? 2 : 1); k++) {
        const a = take(DKK.FIST, w);
        if (!a) break;
        a.target = e; a.tsn = e.sn; a.life = 0.18 + k * 0.14; a.dmg = st.damage * (counter ? def.counterMul || 2.2 : def.jabMul || 0.6) * (k ? (one.dmg || 0.6) : 1);
        a.fixed = counter; a.x = e.x; a.y = e.y;
      }
    }
    return true;
  },

  /** Torment: the toughest foe near you is cursed with a dark aura that hurts its own allies. */
  torment(w, st, p) {
    const def = w.def;
    const L = nearestN(p.x, p.y, def.range * st.range, 10);
    let e = null;
    for (const o of L) if (!tormentOn(o, w.srcId) && (!e || o.hp > e.hp)) e = o;
    if (!e) return false;
    const a = take(DKK.TORMENT, w);
    if (!a) return true;
    a.target = e; a.tsn = e.sn; a.life = st.duration; a.r = (def.auraR || 36) * st.area; a.dmg = st.damage; a.k = 0;
    spawnSeq('fx_eos_grin', e.x, e.y - e.r - 16, { dur: 0.5, fps: 36, scale: 1 });
    return true;
  },

  /** Feint Attack: shadows flicker in behind several foes, stab them in the back and knock them to you. */
  feintAttack(w, st, p) {
    const def = w.def;
    const n = Math.max(1, Math.round(st.amount));
    const L = nearestN(p.x, p.y, def.range * st.range, n);
    if (!L.length) return false;
    const step = mech(w.ovl, 'shadowStep');
    for (const e of L) {
      const a = take(DKK.SHADE, w);
      if (!a) break;
      a.target = e; a.tsn = e.sn; a.life = def.lurk || 0.3; a.dmg = st.damage; a.k = (def.yank || 120) * st.knock;
    }
    if (step) {
      // Shadow Step: you go with the farthest shadow, and appear behind its foe.
      const far = L[L.length - 1];
      const dx = far.x - p.x, dy = far.y - p.y, d = Math.hypot(dx, dy) || 1;
      if (d > 30) {
        spawnSeq('fx_eos_shade', p.x, p.y + 4, { dur: 0.3, fps: 40, scale: 0.6, bottom: true });
        p.x = far.x + (dx / d) * (far.r + 14); p.y = far.y + (dy / d) * (far.r + 14);
        clampToBounds(p, G.bounds, p.r);
        p.iframes = Math.max(p.iframes, step.iframes || 0.5);
      }
    }
    return true;
  },
};

// --- Sucker Punch ---------------------------------------------------------------------------

function fistStep(a) {
  const e = a.target;
  if (e && e.alive && e.sn === a.tsn) { a.x = e.x; a.y = e.y; }
}

function fistEnd(a) {
  const e = a.target;
  if (!e || !e.alive || e.sn !== a.tsn) return;
  damageEnemy(e, a.dmg, 0, 0, true);
  spawnSeq('fx_eos_punchstar', e.x, e.y - 6, { dur: 0.25, fps: 28, scale: a.fixed ? 0.5 : 0.3 });
  if (a.fixed) {
    // The move it was winding up is knocked clean out of it.
    e.atkWind = 0; e.specWind = 0;
    if (!e.boss && !e.legend) e.stunT = Math.max(e.stunT, a.def.daze || 0.4);
  }
  const lb = mech(a.ov, 'lowBlow');
  if (lb) e.weakenT = Math.max(e.weakenT, lb.t || 3);
}

registerMech('oneTwo', {});
registerMech('lowBlow', {});
registerMech('counterStance', {
  // When you are struck, every foe within reach is punched back at once -- counters, all of them.
  tick(w, dt, p, cfg, rec) {
    if (!p) return;
    if (w.csHp !== undefined && p.hp < w.csHp - 0.5 && G.clock - (w.csAt || -9) > (cfg.gap || 0.6)) {
      w.csAt = G.clock;
      each(p.x, p.y, cfg.r || 70, (e) => {
        const a = take(DKK.FIST, procOf(rec));
        if (!a) return;
        a.target = e; a.tsn = e.sn; a.life = 0.12; a.dmg = w.resolved.damage * (cfg.dmg || 1.5); a.fixed = true; a.x = e.x; a.y = e.y;
      });
    }
    w.csHp = p.hp;
  },
});

// --- Torment --------------------------------------------------------------------------------

function tormentStep(a, dt) {
  const e = a.target;
  if (!e || !e.alive || e.sn !== a.tsn) {
    // Torment Chain: it passes to the toughest foe near where it fell, with what time it had.
    const tc = mech(a.ov, 'tormentChain');
    const left = a.life - a.t;
    if (tc && left > 0.6 && !a.done) {
      a.done = true;
      const o = toughest(a.x, a.y, tc.range || 100);
      if (o && !tormentOn(o, a.src)) {
        const c = child(DKK.TORMENT, a);
        if (c) { c.target = o; c.tsn = o.sn; c.life = left; c.r = a.r; c.dmg = a.dmg; c.done = true; }
      }
    }
    free(a);
    return;
  }
  a.x = e.x; a.y = e.y;
  e.slow = Math.max(e.slow, 0.25); e.slowT = Math.max(e.slowT, 0.2);
  // Torment Ring: the aura drags the tormented foe's allies in close.
  const tr = mech(a.ov, 'tormentRing');
  if (tr) each(a.x, a.y, a.r * 1.8, (o) => {
    if (o === e || !movable(o)) return;
    const dx = a.x - o.x, dy = a.y - o.y, d = Math.hypot(dx, dy) || 1;
    if (d > a.r * 0.5) { o.x += (dx / d) * (tr.pull || 70) * dt; o.y += (dy / d) * (tr.pull || 70) * dt; }
  });
  a.k -= dt;
  if (a.k > 0) return;
  a.k = 0.5;
  // Its aura sears its own side.
  let n = 0;
  each(a.x, a.y, a.r, (o) => {
    if (o === e) return;
    n++;
    damageEnemy(o, a.dmg, 0, 0, true);
  });
  // Frenzy: its maddened allies turn on it, the more of them the worse.
  const fz = mech(a.ov, 'frenzyTorment');
  if (fz && n) damageEnemy(e, a.dmg * (fz.per || 0.4) * n, 0, 0, false);
  else damageEnemy(e, a.dmg * 0.3, 0, 0, false);
}

registerMech('tormentChain', {});
registerMech('tormentRing', {});
registerMech('frenzyTorment', {});

// --- Feint Attack ---------------------------------------------------------------------------

function shadeStep(a) {
  const e = a.target;
  const p = G.player;
  if (!e || !e.alive || e.sn !== a.tsn || !p) { free(a); return; }
  // Behind it: on the far side from you.
  const dx = e.x - p.x, dy = e.y - p.y, d = Math.hypot(dx, dy) || 1;
  a.ox = dx / d; a.oy = dy / d;
  a.x = e.x + a.ox * (e.r + 8); a.y = e.y + a.oy * (e.r + 8);
}

function shadeEnd(a) {
  const e = a.target;
  if (!e || !e.alive || e.sn !== a.tsn) return;
  // A stab in the back, and a shove toward you.
  if (mech(a.ov, 'backstab')) critCtx.force = true;
  damageEnemy(e, a.dmg, -a.ox * a.k, -a.oy * a.k, true);
  critCtx.force = false;
  if (!e.boss && !e.legend) e.stunT = Math.max(e.stunT, 0.3);
  spawnSeq('fx_eos_slashes', e.x, e.y - 8, { dur: 0.3, fps: 40, scale: 0.6 });
  const fg = mech(a.ov, 'feintGuard');
  if (fg && G.player) G.player.iframes = Math.max(G.player.iframes, fg.t || 0.25);
}

registerMech('backstab', {});
registerMech('shadowStep', {});
registerMech('feintGuard', {});

// --- Night Daze's overloads (a link) --------------------------------------------------------

registerMech('nightBlind', {
  // Foes caught on the black line are blinded for a second, wandering about.
  hit(e, dealt, rec, crit, cfg) { if (movable(e)) e.confuseT = Math.max(e.confuseT, cfg.t || 1); },
});

registerMech('darkPulse', {
  // Every cast also bursts a ring of darkness out from the end of the line.
  hit(e, dealt, rec, crit, cfg) {
    const w = rec.w;
    if (w.pulseT === G.tick) return;
    w.pulseT = G.tick;
    if (G.clock - (w.pulseAt || -9) < (cfg.gap || 0.8)) return;
    w.pulseAt = G.clock;
    damageRing(e.x, e.y, 0, cfg.r || 46, w.resolved.damage * (cfg.dmg || 0.8), nextHitId(), { knockback: 50 });
    const a = take(DKK.RING, procOf(rec));
    if (a) { a.x = e.x; a.y = e.y; a.life = 0.35; a.k = cfg.r || 46; }
  },
});

function pulseStep() {}

registerMech('nightTerror', {
  // A foe held on the line for 1.5s panics: it flees from you, and takes a third more meanwhile.
  hit(e, dealt, rec, crit, cfg) {
    const i = mark(rec.w, 'terrorL', e, 0.6);
    if (i < 0) return;
    const L = rec.w.terrorL;
    L[i + 3] += 1;
    if (L[i + 3] === (cfg.n || 6)) {
      e.markT = Math.max(e.markT, cfg.t || 3); e.markMul = Math.max(e.markMul, cfg.mul || 0.33);
      if (movable(e)) e.confuseT = Math.max(e.confuseT, cfg.t || 3);
      spawnSeq('fx_eos_grin', e.x, e.y - e.r - 14, { dur: 0.4, fps: 40, scale: 0.7 });
    }
  },
});

// --- Foul Play's overloads (a bouncer) ------------------------------------------------------

registerMech('turnabout', {
  // As in the games, it turns the foe's own strength on it: each hit adds five times the foe's
  // attack.
  hit(e, dealt, rec, crit, cfg) {
    if (!e.alive) return;
    damageEnemy(e, Math.max(1, e.dmg || 5) * (cfg.mul || 5), 0, 0, false);
  },
});

registerMech('skullOrbit', {
  // The skull's first victim is haunted: a skull circles it for 3s, cutting whatever comes close.
  hit(e, dealt, rec, crit, cfg) {
    if (count(DKK.ORBIT, rec.proc) >= (cfg.max || 3)) return;
    for (let i = 0; i < CAP; i++) { const o = actors[i]; if (o.on && o.kind === DKK.ORBIT && o.target === e) return; }
    const a = take(DKK.ORBIT, procOf(rec));
    if (!a) return;
    a.target = e; a.tsn = e.sn; a.life = cfg.t || 3; a.dmg = rec.w.resolved.damage * (cfg.dmg || 0.4); a.r = 8;
  },
});

function orbitStep(a, dt) {
  const e = a.target;
  if (!e || !e.alive || e.sn !== a.tsn) { free(a); return; }
  a.a += 6 * dt;
  a.x = e.x + Math.cos(a.a) * (e.r + 16); a.y = e.y + Math.sin(a.a) * (e.r + 12);
  // It forgets whom it has cut every half second, so a foe that stays close is cut again.
  if (((a.t * 2) | 0) !== a.step) { a.step = (a.t * 2) | 0; a.held.length = 0; a.heldSn.length = 0; }
  each(a.x, a.y, a.r, (o) => { if (once(a, o)) damageEnemy(o, a.dmg, 0, 0, false); });
}

registerMech('dirtyTrick', {
  // Every hit is a dirty trick: the foe is weakened, dealing less, and sometimes drops a coin.
  hit(e, dealt, rec, crit, cfg) {
    e.weakenT = Math.max(e.weakenT, cfg.t || 3);
    if (G.rngRun() < (cfg.coin || 0.08)) dropCoin(e.x, e.y, 1);
  },
});

// --- Night Slash's overloads ----------------------------------------------------------------

registerMech('gloomEdge', {
  // A critical slash leaves a dark wound that bleeds for 3s.
  hit(e, dealt, rec, crit, cfg) {
    if (!crit || count(DKK.WOUND, rec.proc) >= 12) return;
    const a = take(DKK.WOUND, procOf(rec));
    if (!a) return;
    a.target = e; a.tsn = e.sn; a.life = cfg.t || 3; a.dmg = dealt * (cfg.share || 0.15); a.k = 0.5;
  },
});

function woundStep(a, dt) {
  const e = a.target;
  if (!e || !e.alive || e.sn !== a.tsn) { free(a); return; }
  a.x = e.x; a.y = e.y;
  a.k -= dt;
  if (a.k > 0) return;
  a.k = 0.5;
  damageEnemy(e, a.dmg, 0, 0, false);
}

registerMech('crescentStorm', {
  // Each slash throws off a crescent at a random foe nearby.
  hit(e, dealt, rec, crit, cfg) {
    if (count(DKK.CRES, rec.proc) >= 10) return;
    const L = nearestN(e.x, e.y, cfg.range || 100, 4);
    const o = L.find((x) => x !== e);
    if (!o) return;
    const a = take(DKK.CRES, procOf(rec));
    if (!a) return;
    a.x = e.x; a.y = e.y - 4; a.target = o; a.tsn = o.sn; a.life = 0.6; a.dmg = rec.w.resolved.damage * (cfg.dmg || 0.4);
  },
});

function cresStep(a, dt) {
  const e = a.target;
  if (!e || !e.alive || e.sn !== a.tsn) { free(a); return; }
  const dx = e.x - a.x, dy = e.y - 4 - a.y, d = Math.hypot(dx, dy) || 1;
  a.a = Math.atan2(dy, dx);
  const sp = 300 * dt;
  if (d <= sp + e.r) { damageEnemy(e, a.dmg, 0, 0, true); free(a); return; }
  a.x += (dx / d) * sp; a.y += (dy / d) * sp;
}

registerMech('eclipseCut', {
  // A foe slashed in the dark loses its nerve: what it was winding up is cut off, and it is dazed.
  hit(e, dealt, rec, crit, cfg) {
    if (!winding(e)) return;
    e.atkWind = 0; e.specWind = 0;
    if (!e.boss && !e.legend) e.stunT = Math.max(e.stunT, cfg.t || 0.5);
  },
});

// --- Dark Void's overloads (a pull) ---------------------------------------------------------

registerMech('abyss', {
  // A foe dragged into the very middle sinks: it is held there and takes half as much again.
  zone(z, rec, dt, cfg) {
    each(z.x, z.y, (cfg.core || 0.25) * z.r, (e) => {
      e.markT = Math.max(e.markT, 0.3); e.markMul = Math.max(e.markMul, cfg.mul || 0.5);
      if (movable(e)) e.stunT = Math.max(e.stunT, 0.1);
    });
  },
});

registerMech('voidGate', {
  // The void does not open at your feet: it opens under the thickest of the crowd.
  lay(z) {
    const p = G.player;
    if (!p) return;
    const L = nearestN(p.x, p.y, 200, 10);
    let best = null, bn = -1;
    for (const e of L) { let n = 0; each(e.x, e.y, 34, () => { n++; }); if (n > bn) { bn = n; best = e; } }
    if (best) { z.x = best.x; z.y = best.y; z.mx = 1; }
  },
});

registerMech('nightmareVoid', {
  // Foes pulled into the void fall asleep, once each, for a second.
  zone(z, rec, dt, cfg) {
    if (G.tick % 6) return;
    each(z.x, z.y, z.r * 0.6, (e) => {
      if (e.boss || e.legend || e.sleep) return;
      const i = mark(rec.w, 'dreamL', e, cfg.cd || 4);
      if (i < 0 || rec.w.dreamL[i + 3]) return;
      rec.w.dreamL[i + 3] = 1;
      e.stunT = Math.max(e.stunT, cfg.t || 1); e.sleep = true;
    });
  },
});

// --- Registration ---------------------------------------------------------------------------

registerMoves({
  step: {
    [DKK.FIST]: fistStep, [DKK.TORMENT]: tormentStep, [DKK.SHADE]: shadeStep, [DKK.WOUND]: woundStep,
    [DKK.CRES]: cresStep, [DKK.RING]: pulseStep, [DKK.ORBIT]: orbitStep,
  },
  end: { [DKK.FIST]: fistEnd, [DKK.SHADE]: shadeEnd },
});
