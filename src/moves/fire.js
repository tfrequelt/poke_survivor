// L3 -- may import L0-L2 and the move framework (moves/core.js).
//
// Fire: the new Ember (and its evolution Fire Blast) and Eruption, and the overload mechanics of
// Will-o-Wisp, Heat Wave, Meteor Fall and Blaze Trail. Drawing is draw_fire.js.

import { G } from '../state.js';
import { TAU } from '../util.js';
import { nextHitId, getDamageSource, setDamageSource } from '../world.js';
import { damageEnemy, damageCircle, damageLine, damageRing, applyBurn } from '../combat.js';
import { spawnSpr } from '../sprfx.js';
import { spawnSeq } from '../seqfx.js';
import { registerMech } from '../mechs.js';
import { ROLE } from '../fx.js';
import {
  KIND, vk, actors, MOVE_CAP as CAP, registerMoves, take, child, free, mech, lvSum, procOf,
  nearest, nearestN, each, movable, settle, ovProc, once, mark, eachMarked,
} from './core.js';

export const FRK = {
  EMBER: KIND.fire,            // an ember in flight
  FIRE: KIND.fire + 1,         // a fire on the ground: it creeps, and spreads
  VOLCANO: KIND.fire + 2,      // Eruption's volcano
  BOMB: KIND.fire + 3,         // a lava bomb in flight
  POOL: KIND.fire + 4,         // a pool of lava or a crater
  RING: KIND.fire + 5,         // Blast Wave's ring of fire
  ROCK: KIND.fire + 6,         // Shatter Meteor's burning fragment
  CINDER: KIND.fire + 7,       // a cinder spat at a foe
  ASH: KIND.fire + 8,          // Ash Cloud
};

function count(kind, src) {
  let n = 0;
  for (let i = 0; i < CAP; i++) if (actors[i].on && actors[i].kind === kind && actors[i].src === src) n++;
  return n;
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

/** Light a fire on the ground at (x, y), unless one stands there already or there are too many. */
function kindle(src, x, y, dmg, life, r = 10) {
  const owner = src.kind !== undefined ? src.src : src.srcId;
  if (count(FRK.FIRE, owner) >= 18) return null;
  for (let i = 0; i < CAP; i++) {
    const o = actors[i];
    if (o.on && o.kind === FRK.FIRE && o.src === owner && (o.x - x) ** 2 + (o.y - y) ** 2 < 100) {
      o.life = Math.max(o.life, o.t + life * 0.6);    // stoked instead
      return o;
    }
  }
  const a = src.kind !== undefined ? child(FRK.FIRE, src) : take(FRK.FIRE, src);
  if (!a) return null;
  a.x = x; a.y = y; a.life = life; a.dmg = dmg; a.r = r; a.k = 0; a.step = 0; a.idx = (G.rngFx() * 4) | 0;
  return a;
}

export const FIRE_BEHAVIOR = {
  /**
   * Ember: embers land and kindle fires on the ground. A fire creeps after the nearest foe and
   * spreads to burning foes near it. Fire Blast's embers land as a five-pointed star of fire.
   */
  ember(w, st, p) {
    const def = w.def;
    const rain = mech(w.ovl, 'emberRain');
    if (rain) return false;                 // Ember Rain lights its fires on its own clock
    const L = nearestN(p.x, p.y, def.range * st.range, 8);
    if (!L.length) return false;
    const n = Math.max(1, Math.round(st.amount));
    for (let i = 0; i < n; i++) {
      const e = L[i % L.length];
      const a = take(FRK.EMBER, w);
      if (!a) break;
      a.ox = p.x; a.oy = p.y - 6; a.x = a.ox; a.y = a.oy;
      a.tx = e.x + (G.rngRun() - 0.5) * 24; a.ty = e.y + (G.rngRun() - 0.5) * 16;
      a.life = 0.4 + G.rngRun() * 0.15; a.dmg = st.damage; a.area = st.area; a.k = st.duration;
      a.fixed = !!def.blast;
    }
    return true;
  },

  /** Eruption: a volcano at your feet spews lava bombs every way -- the healthier you are, the more. */
  eruption(w, st, p) {
    const def = w.def;
    if (!nearest(p.x, p.y, def.range * st.range)) return false;
    const vent = mech(w.ovl, 'volcanicVent');
    if (vent && count(FRK.VOLCANO, w.srcId)) return false;
    const a = take(FRK.VOLCANO, w);
    if (!a) return true;
    a.x = p.x; a.y = p.y + 2; a.fixed = !!vent;
    a.life = vent ? vent.t || 4 : def.spew || 1.2;
    const s = G.stats;
    const hp = s ? Math.max(0, Math.min(1, p.hp / s.maxHp)) : 1;
    // The healthier you are, the more it throws and the harder each lands.
    a.n = Math.round((Math.max(1, st.amount) + (def.hpBombs || 4) * hp) * (vent ? 2.5 : 1));
    a.dmg = st.damage * (0.6 + 0.8 * hp); a.area = st.area; a.k = 0; a.step = a.life / Math.max(1, a.n);
    a.r = def.range * st.range;
    if (mech(w.ovl, 'ashCloud') && !count(FRK.ASH, w.srcId)) {
      const c = take(FRK.ASH, w);
      if (c) { c.life = mech(w.ovl, 'ashCloud').t || 2.5; c.r = mech(w.ovl, 'ashCloud').r || 70; c.k = 0; }
    }
    return true;
  },
};

// --- Ember and its fires --------------------------------------------------------------------

function emberStep(a) {
  const k = Math.min(1, a.t / a.life);
  a.x = a.ox + (a.tx - a.ox) * k; a.y = a.oy + (a.ty - a.oy) * k;
  a.z = Math.sin(k * Math.PI) * 30;
}

function emberEnd(a) {
  if (a.fixed) {
    // Fire Blast: the five-pointed star of flame, the kanji the move is drawn as.
    spawnSeq('fx_eos_fireburst', a.x, a.y - 8, { dur: 0.5, fps: 36, scale: 0.7 });
    damageCircle(a.x, a.y, 24 * vk(a.area), a.dmg * 1.5, nextHitId(), { knockback: 40, burn: a.dmg * 0.4, burnT: 3 });
    const sf = mech(a.ov, 'sunfire');
    kindle(a, a.x, a.y, a.dmg * (sf ? 2 : 1), a.k * (sf ? 2 : 1), 12);
    for (let i = 0; i < 4; i++) {
      const ang = (i / 4) * TAU + Math.PI / 4;
      kindle(a, a.x + Math.cos(ang) * 22, a.y + Math.sin(ang) * 16, a.dmg * (sf ? 1.4 : 0.8), a.k * 0.8, 10);
    }
    const bw = mech(a.ov, 'blastWave');
    if (bw) {
      const r = child(FRK.RING, a);
      if (r) { r.x = a.x; r.y = a.y; r.life = 0.5; r.k = (bw.r || 70) * vk(a.area); r.dmg = a.dmg * (bw.dmg || 0.8); }
    }
    return;
  }
  spawnSeq('fx_eos_blast', a.x, a.y - 4, { dur: 0.25, fps: 40, scale: 0.4 });
  kindle(a, a.x, a.y, a.dmg, a.k);
}

function fireStep(a, dt) {
  // A fire creeps after the nearest foe, slowly.
  const e = nearest(a.x, a.y, 90);
  if (e) {
    const dx = e.x - a.x, dy = e.y - a.y, d = Math.hypot(dx, dy) || 1;
    if (d > 6) { a.x += (dx / d) * 14 * dt; a.y += (dy / d) * 14 * dt; }
  }
  a.k -= dt;
  if (a.k > 0) return;
  a.k = 0.5;
  a.step++;
  // Blaze Up: a fire grows hotter for every second it has burned, to three times.
  const bu = mech(a.ov, 'blazeUp');
  const heat = bu ? Math.min(bu.max || 3, 1 + a.t * (bu.per || 0.5)) : 1;
  const kd = mech(a.ov, 'kindling');
  each(a.x, a.y, a.r, (o) => {
    // Kindling: a foe already burning that walks into a fire makes it flare.
    if (kd && o.burnT > 0 && once(a, o, 1)) {
      damageCircle(a.x, a.y, kd.r || 22, a.dmg * (kd.dmg || 1.2), nextHitId(), { knockback: 30, canCrit: false });
      spawnSeq('fx_eos_blast', a.x, a.y - 4, { dur: 0.25, fps: 40, scale: 0.6 });
    }
    applyBurn(o, a.dmg * 0.6 * heat, 2.5);
    damageEnemy(o, a.dmg * 0.4 * heat, 0, 0, false);
  });
  // Every second it spreads to a burning foe near it.
  if (a.step % 2 === 0) {
    let to = null;
    each(a.x, a.y, 40, (o) => { if (!to && o.burnT > 0 && Math.hypot(o.x - a.x, o.y - a.y) > 14) to = o; });
    if (to) kindle(a, to.x, to.y, a.dmg, Math.max(1, a.life - a.t), a.r);
  }
}

registerMech('blazeUp', {});
registerMech('kindling', {});
registerMech('emberRain', {
  // The embers rain down round you on their own, a few a second, lighting fires where they fall.
  tick(w, dt, p, cfg) {
    if (!p) return;
    w.rainT = (w.rainT || 0) - dt;
    if (w.rainT > 0) return;
    w.rainT = (cfg.every || 0.35) * Math.max(0.4, w.resolved.cooldown / 1.2);
    const L = nearestN(p.x, p.y, cfg.range || 150, 8);
    if (!L.length) return;
    const e = L[(G.rngRun() * L.length) | 0];
    const a = take(FRK.EMBER, w);
    if (!a) return;
    a.ox = e.x + (G.rngRun() - 0.5) * 30; a.oy = e.y - 90; a.x = a.ox; a.y = a.oy;
    a.tx = e.x + (G.rngRun() - 0.5) * 20; a.ty = e.y; a.life = 0.35;
    a.dmg = w.resolved.damage; a.area = w.resolved.area; a.k = w.resolved.duration;
  },
});

// --- Fire Blast's overloads -----------------------------------------------------------------

registerMech('sunfire', {});
registerMech('blastWave', {});
registerMech('pyre', {
  // A foe killed while burning becomes a pyre: a fire lit on the spot where it fell.
  kill(e, rec, cfg) {
    if (e.burnT <= 0) return;
    kindle(procOf(rec), e.x, e.y, rec.w.resolved.damage * (cfg.dmg || 0.8), cfg.t || 3, 11);
  },
});

function ringStep(a) {
  // Blast Wave: a ring of fire racing outward from the star, once over each foe.
  const k = Math.min(1, a.t / a.life);
  const R = a.k * k;
  a.r = R;
  each(a.x, a.y, R + 8, (e) => {
    const d = Math.hypot(e.x - a.x, e.y - a.y);
    if (Math.abs(d - R) > 10 || !once(a, e)) return;
    damageEnemy(e, a.dmg, ((e.x - a.x) / (d || 1)) * 50, ((e.y - a.y) / (d || 1)) * 50, true);
    applyBurn(e, a.dmg * 0.3, 3);
  });
}

// --- Eruption -------------------------------------------------------------------------------

function volcanoStep(a, dt, p) {
  if (!a.fixed && p) { a.x = p.x; a.y = p.y + 2; }
  a.k -= dt;
  if (a.k > 0 || a.n <= 0) return;
  a.k = a.step;
  a.n--;
  const b = child(FRK.BOMB, a);
  if (!b) return;
  const ang = G.rngRun() * TAU, d = 50 + G.rngRun() * Math.min(110, a.r * 0.6);
  // Toward the nearest foe now and then, so it is not wholly at random.
  const e = G.rngRun() < 0.4 ? nearest(a.x, a.y, a.r) : null;
  b.ox = a.x; b.oy = a.y - 20;
  b.tx = e ? e.x : a.x + Math.cos(ang) * d; b.ty = e ? e.y : a.y + Math.sin(ang) * d * 0.7;
  b.x = b.ox; b.y = b.oy; b.life = 0.55; b.dmg = a.dmg; b.area = a.area;
}

function bombStep(a) {
  const k = Math.min(1, a.t / a.life);
  a.x = a.ox + (a.tx - a.ox) * k; a.y = a.oy + (a.ty - a.oy) * k;
  a.z = Math.sin(k * Math.PI) * 50 + (1 - k) * 20;
}

function bombEnd(a) {
  damageCircle(a.x, a.y, 20 * vk(a.area), a.dmg, nextHitId(), { knockback: 50, burn: a.dmg * 0.3, burnT: 2.5 });
  spawnSeq('fx_eos_blast', a.x, a.y - 4, { dur: 0.3, fps: 36, scale: 0.7 });
  const ms = mech(a.ov, 'magmaSurge');
  if (ms && count(FRK.POOL, a.src) < 10) {
    const pl = child(FRK.POOL, a);
    if (pl) { pl.x = a.x; pl.y = a.y; pl.life = ms.t || 2; pl.r = 14; pl.dmg = a.dmg * (ms.dmg || 0.25); pl.k = 0; }
  }
}

function poolStep(a, dt) {
  a.k -= dt;
  if (a.k > 0) return;
  a.k = 0.4;
  damageCircle(a.x, a.y, a.r, a.dmg, nextHitId(), { canCrit: false, burn: a.dmg * 0.5, burnT: 2 });
}

function ashStep(a, dt, p) {
  if (!p) return;
  a.x = p.x; a.y = p.y;
  // Ash Cloud: the foes in the ash can barely see; they slow and blunder about.
  each(a.x, a.y, a.r, (e) => {
    e.slow = Math.max(e.slow, 0.35); e.slowT = Math.max(e.slowT, 0.2);
    if (movable(e) && G.tick % 20 === 0) e.confuseT = Math.max(e.confuseT, 0.4);
  });
}

registerMech('magmaSurge', {});
registerMech('volcanicVent', {});
registerMech('ashCloud', {});

// --- Will-o-Wisp's overloads (a swarm) ------------------------------------------------------

registerMech('hellfire', {
  // Each wisp's touch stokes the burn already on a foe, up to three times as fierce.
  hit(e, dealt, rec, crit, cfg) {
    if (e.burnT <= 0) return;
    const cap = rec.w.resolved.damage * (cfg.cap || 3);
    e.burnDps = Math.min(cap, e.burnDps * (cfg.per || 1.15) + 1);
    e.burnT = Math.max(e.burnT, 2);
  },
});

registerMech('wispLantern', {
  // The wisps do not drift off: they hang round you as lanterns, singeing all that come close.
  shot(pr, rec, dt, cfg) {
    const p = G.player;
    if (!p) return false;
    pr.mx += (cfg.spin || 1.8) * dt;
    const k = (pr.orbitA || 0) + pr.mx;
    const R = cfg.r || 34;
    pr.x = p.x + Math.cos(k) * R; pr.y = p.y + Math.sin(k) * R * 0.8 - 4;
    return false;
  },
  spawn(pr) { pr.orbitA = G.rngFx() * TAU; pr.maxLife = Math.max(pr.maxLife, 4); },
});

registerMech('phantomFlame', {
  // A burning foe that dies bursts into ghostly flame over those round it.
  kill(e, rec, cfg) {
    if (e.burnT <= 0) return;
    damageCircle(e.x, e.y, cfg.r || 26, rec.w.resolved.damage * (cfg.dmg || 0.8), nextHitId(), { burn: rec.w.resolved.damage * 0.3, burnT: 2, canCrit: false });
    spawnSeq('fx_eos_blast', e.x, e.y - 4, { dur: 0.3, fps: 36, scale: 0.6 });
  },
});

// --- Heat Wave's overloads (a nova) ---------------------------------------------------------

registerMech('scorch', {
  // A foe the wave catches already burning takes all the burn it had left, at once.
  hit(e, dealt, rec, crit, cfg) {
    if (e.burnT <= 0 || !e.alive) return;
    const left = e.burnDps * e.burnT * (cfg.mul || 1);
    e.burnT = 0;
    damageEnemy(e, left, 0, 0, false);
    spawnSpr('boom_fire', e.x, e.y - 6, '#ffb347', 0.8);
  },
});

registerMech('flashpoint', {
  // The wave does not roll out from you: it bursts out of the thickest of the crowd.
  lay(z, w) {
    const p = G.player;
    if (!p) return;
    const e = densest(p.x, p.y, 200);
    if (e) { z.x = e.x; z.y = e.y; }
  },
});

registerMech('sunstroke', {
  // The heat goes to their heads: foes the wave catches stagger about confused for 1.5s.
  hit(e, dealt, rec, crit, cfg) { if (movable(e)) e.confuseT = Math.max(e.confuseT, cfg.t || 1.5); },
});

// --- Meteor Fall's overloads (a bloom from the sky) -----------------------------------------

const isSeed = (pr) => pr.gen === ROLE.SEED;

registerMech('impactCrater', {
  // The meteor leaves a molten crater for 3s that burns whatever stands in it.
  expire(pr, rec, cfg) {
    if (!isSeed(pr) || count(FRK.POOL, rec.w.srcId) >= 4) return;
    const a = take(FRK.POOL, rec.w);
    if (!a) return;
    a.x = pr.x; a.y = pr.y; a.life = cfg.t || 3; a.r = (cfg.r || 26) * vk(pr.area); a.dmg = rec.w.resolved.damage * (cfg.dmg || 0.15); a.k = 0;
    a.fixed = true;
  },
});

registerMech('cometTail', {
  // The meteor comes in low at a slant, and its tail scorches a line along the ground before it.
  expire(pr, rec, cfg) {
    if (!isSeed(pr)) return;
    const ang = Math.PI * 0.85;
    const L = cfg.len || 110;
    damageLine(pr.x - Math.cos(ang) * L, pr.y - Math.sin(ang) * L * 0.3, ang - Math.PI, L, 10, rec.w.resolved.damage * (cfg.dmg || 0.5), nextHitId(), { burn: rec.w.resolved.damage * 0.2, burnT: 2 });
    for (let i = 1; i <= 4; i++) {
      const x = pr.x - Math.cos(ang) * L * (i / 4), y = pr.y - Math.sin(ang) * L * 0.3 * (i / 4);
      spawnSeq('fx_eos_smallflame', x, y, { dur: 0.5, fps: 16, scale: 0.6, bottom: true });
    }
  },
});

registerMech('shatterMeteor', {
  // On landing, the meteor breaks and flings five burning fragments outward.
  expire(pr, rec, cfg) {
    if (!isSeed(pr)) return;
    for (let i = 0; i < (cfg.n || 5); i++) {
      const a = take(FRK.ROCK, rec.w);
      if (!a) return;
      const ang = (i / (cfg.n || 5)) * TAU + G.rngFx();
      a.ox = pr.x; a.oy = pr.y; a.tx = pr.x + Math.cos(ang) * 60; a.ty = pr.y + Math.sin(ang) * 42;
      a.x = a.ox; a.y = a.oy; a.life = 0.45; a.dmg = rec.w.resolved.damage * (cfg.dmg || 0.35);
    }
  },
});

function rockStep(a) {
  const k = Math.min(1, a.t / a.life);
  a.x = a.ox + (a.tx - a.ox) * k; a.y = a.oy + (a.ty - a.oy) * k;
  a.z = Math.sin(k * Math.PI) * 24;
}
function rockEnd(a) {
  damageCircle(a.x, a.y, 14, a.dmg, nextHitId(), { burn: a.dmg * 0.3, burnT: 2, canCrit: false });
  spawnSeq('fx_eos_blast', a.x, a.y - 3, { dur: 0.25, fps: 40, scale: 0.4 });
}

// --- Blaze Trail's overloads (a trail) ------------------------------------------------------

registerMech('inferno', {
  // The longer you keep running, the fiercer the trail burns: up to twice as hot.
  tick(w, dt, p) {
    if (!p) return;
    const v = Math.hypot(p.vx, p.vy);
    w.runT = v > 8 ? Math.min(4, (w.runT || 0) + dt) : Math.max(0, (w.runT || 0) - dt * 2);
  },
  lay(z, w, st, cfg) {
    const k = 1 + Math.min(cfg.max || 1, (w.runT || 0) * (cfg.per || 0.25));
    z.dps *= k; z.burn *= k;
  },
});

registerMech('firewall', {
  // The flames rise as a wall: foes cannot walk through the trail, and are pushed back off it.
  zone(z, rec, dt) {
    each(z.x, z.y, z.r, (e) => {
      if (!movable(e)) return;
      const dx = e.x - z.x, dy = e.y - z.y, d = Math.hypot(dx, dy) || 1;
      const go = z.r + e.r - d;
      if (go > 0) { e.x += (dx / d) * go; e.y += (dy / d) * go; settle(e); }
    });
  },
});

registerMech('cinders', {
  // The flames spit cinders at foes that come near them.
  zone(z, rec, dt, cfg) {
    z.mx -= dt;
    if (z.mx > 0) return;
    z.mx = cfg.every || 1;
    const e = nearest(z.x, z.y, cfg.range || 70);
    if (!e || count(FRK.CINDER, rec.proc) > 12) return;
    const a = take(FRK.CINDER, procOf(rec));
    if (!a) return;
    a.x = z.x; a.y = z.y - 6; a.target = e; a.tsn = e.sn; a.life = 0.6; a.dmg = rec.w.resolved.damage * (cfg.dmg || 0.5);
  },
});

function cinderStep(a, dt) {
  const e = a.target;
  if (!e || !e.alive || e.sn !== a.tsn) { free(a); return; }
  const dx = e.x - a.x, dy = e.y - 4 - a.y, d = Math.hypot(dx, dy) || 1;
  const sp = 220 * dt;
  if (d <= sp + e.r) { damageEnemy(e, a.dmg, 0, 0, false); applyBurn(e, a.dmg * 0.5, 2); free(a); return; }
  a.x += (dx / d) * sp; a.y += (dy / d) * sp;
}

// --- Registration ---------------------------------------------------------------------------

registerMoves({
  step: {
    [FRK.EMBER]: emberStep, [FRK.FIRE]: fireStep, [FRK.VOLCANO]: volcanoStep, [FRK.BOMB]: bombStep,
    [FRK.POOL]: poolStep, [FRK.RING]: ringStep, [FRK.ROCK]: rockStep, [FRK.CINDER]: cinderStep,
    [FRK.ASH]: ashStep,
  },
  end: { [FRK.EMBER]: emberEnd, [FRK.BOMB]: bombEnd, [FRK.ROCK]: rockEnd },
});
