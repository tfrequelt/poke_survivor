// L3 -- may import L0-L2 and the move framework (moves/core.js).
//
// Grass: the new Leech Seed, Solar Beam, Grass Knot and Wood Hammer, and the overload mechanics
// of Leaf Arrow, Seed Bomb and Spirit Shackle (Leaf Arrow's evolution). Drawing is draw_grass.js.

import { G } from '../state.js';
import { TAU } from '../util.js';
import { nextHitId, getDamageSource, setDamageSource } from '../world.js';
import { damageEnemy, damageCircle, damageLine } from '../combat.js';
import { spawnSpr } from '../sprfx.js';
import { spawnSeq } from '../seqfx.js';
import { registerMech } from '../mechs.js';
import {
  KIND, vk, actors, MOVE_CAP as CAP, registerMoves, take, child, free, mech, lvSum, procOf,
  nearest, nearestN, toughest, each, movable, settle, heading, ovProc, once, mark, eachMarked,
} from './core.js';

export const GRK = {
  SEED: KIND.grass,            // a Leech Seed in flight
  LEECH: KIND.grass + 1,       // a seed rooted in its host, draining
  SPROUT: KIND.grass + 2,      // Seedling's sprout on the ground
  SUN: KIND.grass + 3,         // Solar Beam gathering over you
  BEAM: KIND.grass + 4,        // the beam itself
  FLARE: KIND.grass + 5,       // Solar Flare's falling sun
  KNOT: KIND.grass + 6,        // a Grass Knot springing up under a foe
  THORN: KIND.grass + 7,       // Thorn Knot's thorns on the floor
  LOG: KIND.grass + 8,         // Wood Hammer's log: falling (phase 0), then rolling
  SAPLING: KIND.grass + 9,     // Sapling's tree
  RAZOR: KIND.grass + 10,      // Leaf Storm's razor leaf
  STAKE: KIND.grass + 11,      // Pin Down's stake
  BUD: KIND.grass + 12,        // Overgrowth's bud on a foe
  BLOOM: KIND.grass + 13,      // Chain Bloom's little seed
  POLLEN: KIND.grass + 14,     // Pollen's cloud
  SHADE: KIND.grass + 15,      // Deep Shadow's line on the floor
  WISP: KIND.grass + 16,       // Haunt's ghost
  VINE: KIND.grass + 17,       // a vine drawn between two points for a moment (Seedling, Snare)
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
/** Heal the player, a share of max HP, through a per-weapon budget so it cannot outpace a crowd. */
function heal(w, share, capPerSec) {
  const p = G.player, s = G.stats;
  if (!p || !s || p.hp >= s.maxHp) return;
  if ((w.healAt || 0) !== ((G.clock / 1) | 0)) { w.healAt = (G.clock / 1) | 0; w.healSum = 0; }
  const amt = Math.min(s.maxHp * share, s.maxHp * capPerSec - w.healSum);
  if (amt <= 0) return;
  w.healSum += amt;
  p.hp = Math.min(s.maxHp, p.hp + amt);
}
/** A vine between two points, for a moment. */
function vine(src, x0, y0, x1, y1, life = 0.2) {
  const a = src.kind !== undefined ? child(GRK.VINE, src) : take(GRK.VINE, src);
  if (!a) return;
  a.ox = x0; a.oy = y0; a.tx = x1; a.ty = y1; a.x = (x0 + x1) / 2; a.y = (y0 + y1) / 2; a.life = life;
}

export const GRASS_BEHAVIOR = {
  /** Leech Seed: seeds that root in foes and drain them, healing you. A host's death spreads it. */
  leechSeed(w, st, p) {
    const def = w.def;
    const n = Math.max(1, Math.round(st.amount));
    const sd = mech(w.ovl, 'seedling');
    // Hosts already seeded are passed over, so the seeds spread through the crowd.
    const L = nearestN(p.x, p.y, def.range * st.range, n + 6);
    if (!L.length && !sd) return false;
    let thrown = 0;
    for (let i = 0; i < L.length && thrown < n; i++) {
      const e = L[i];
      if (!sd && hostOf(e, w.srcId)) continue;
      const a = take(GRK.SEED, w);
      if (!a) break;
      a.ox = p.x; a.oy = p.y - 6; a.x = a.ox; a.y = a.oy;
      a.target = e; a.tsn = e.sn; a.tx = e.x; a.ty = e.y;
      a.life = 0.4; a.dmg = st.damage; a.area = st.area;
      a.k = st.duration;
      thrown++;
    }
    return thrown > 0;
  },

  /** Solar Beam: sunlight gathers over you, visibly, then a huge beam pierces a whole line. */
  solarBeam(w, st, p) {
    const def = w.def;
    if (count(GRK.SUN, w.srcId)) return false;
    if (!nearest(p.x, p.y, def.range * st.range)) return false;
    const a = take(GRK.SUN, w);
    if (!a) return true;
    a.x = p.x; a.y = p.y; a.life = Math.max(0.35, (def.gather || 1) - lvSum(w, 'gatherCut'));
    a.dmg = st.damage; a.area = st.area; a.k = def.range * st.range;
    return true;
  },

  /** Grass Knot: knots spring up under the heaviest foes and trip them -- the heavier, the harder. */
  grassKnot(w, st, p) {
    const def = w.def;
    const n = Math.max(1, Math.round(st.amount));
    const L = nearestN(p.x, p.y, def.range * st.range, 12);
    if (!L.length) return false;
    // The heaviest first: the most max health.
    const pick = L.slice().sort((a, b) => b.maxHp - a.maxHp).slice(0, n);
    for (const e of pick) {
      const a = take(GRK.KNOT, w);
      if (!a) break;
      a.target = e; a.tsn = e.sn; a.x = e.x; a.y = e.y;
      a.life = 0.35; a.dmg = st.damage; a.area = st.area;
      const tk = mech(w.ovl, 'tightKnot'), sn = mech(w.ovl, 'snare');
      if (tk) { a.n = tk.n || 3; a.life = 0.35 + (a.n - 1) * (tk.gap || 0.7); }
      if (sn) { a.life = sn.t || 2.5; a.fixed = true; }
    }
    return true;
  },

  /** Wood Hammer: a great log crashes down on the crowd, then rolls on, flattening. */
  woodHammer(w, st, p) {
    const def = w.def;
    const e = densest(p.x, p.y, def.range * st.range);
    if (!e) return false;
    const tm = mech(w.ovl, 'timber');
    const a = take(GRK.LOG, w);
    if (!a) return true;
    a.x = e.x; a.y = e.y; a.z = 110; a.phase = 0;
    const ang = Math.atan2(e.y - p.y, e.x - p.x);
    a.a = ang; a.life = 0.35;
    a.dmg = st.damage; a.area = st.area; a.r = (def.logR || 16) * st.area;
    a.k = (def.roll || 0.8) * (mech(w.ovl, 'rollingLog') ? 1.6 : 1);
    a.n = tm ? 1 : 0;
    a.vy0 = def.rollSpeed || 150;
    return true;
  },
};

/** The foe with the most others close round it, of the nearest few. */
function densest(x, y, range) {
  const L = nearestN(x, y, range, 10);
  let best = null, bn = -1;
  for (let i = 0; i < L.length; i++) {
    let n = 0;
    each(L[i].x, L[i].y, 30, () => { n++; });
    if (n > bn) { bn = n; best = L[i]; }
  }
  return best;
}

/** Is this foe already a host of one of this weapon's seeds? */
function hostOf(e, src) {
  for (let i = 0; i < CAP; i++) {
    const a = actors[i];
    if (a.on && a.kind === GRK.LEECH && a.src === src && a.target === e && a.tsn === e.sn) return a;
  }
  return null;
}

// --- Leech Seed ---------------------------------------------------------------------------

function seedStep(a) {
  const k = Math.min(1, a.t / a.life);
  const e = a.target;
  if (e && e.alive && e.sn === a.tsn) { a.tx = e.x; a.ty = e.y; }
  a.x = a.ox + (a.tx - a.ox) * k; a.y = a.oy + (a.ty - a.oy) * k;
  a.z = Math.sin(k * Math.PI) * 18;
}

function seedEnd(a) {
  const sd = mech(a.ov, 'seedling');
  if (sd) {
    // Seedling: the seed lands and grows into a sprout that drains whatever comes close.
    const s = child(GRK.SPROUT, a);
    if (s) { s.x = a.tx; s.y = a.ty; s.life = sd.t || 5; s.dmg = a.dmg; s.k = 0; s.r = sd.range || 60; }
    return;
  }
  const e = a.target;
  if (!e || !e.alive || e.sn !== a.tsn) return;
  plant(a, e, a.k);
}

function plant(a, e, life) {
  if (hostOf(e, a.src)) return;
  const s = child(GRK.LEECH, a);
  if (!s) return;
  s.target = e; s.tsn = e.sn; s.x = e.x; s.y = e.y; s.life = life; s.dmg = a.dmg; s.k = 0.5; s.n = 0;
  s.step = 0;
}

function leechStep(a, dt) {
  const e = a.target;
  if (!e || !e.alive || e.sn !== a.tsn) {
    // The host has fallen: the seed jumps to the nearest foe without one, with what it has left.
    const left = a.life - a.t;
    const o = left > 0.5 && !a.done ? nextHost(a) : null;
    if (o) {
      a.done = true;
      const s = child(GRK.SEED, a);
      if (s) { s.ox = a.x; s.oy = a.y - 6; s.x = a.x; s.y = a.y; s.target = o; s.tsn = o.sn; s.tx = o.x; s.ty = o.y; s.life = 0.3; s.dmg = a.dmg; s.k = left; }
    }
    free(a);
    return;
  }
  a.x = e.x; a.y = e.y;
  a.k -= dt;
  if (a.k > 0) return;
  // Vampire: the lower your health, the faster it drains.
  const vp = mech(a.ov, 'vampire');
  const p = G.player, s = G.stats;
  const low = vp && p && s ? 1 - p.hp / s.maxHp : 0;
  a.k = 0.5 / (1 + low * (vp ? vp.max || 1.5 : 0));
  damageEnemy(e, a.dmg, 0, 0, false);
  if (a.w) heal(a.w, a.def.heal || 0.004, a.def.healCap || 0.02);
  spawnSpr('motes', e.x, e.y - 8, '#7fe08a', 0.7);
  // Parasite: every second the seed sends a runner to a foe next to its host.
  const pa = mech(a.ov, 'parasite');
  if (pa && (a.step += 0.5) >= (pa.every || 1) && a.n < (pa.n || 3)) {
    a.step = 0;
    let o = null;
    each(e.x, e.y, pa.range || 30, (f) => { if (!o && f !== e && !hostOf(f, a.src)) o = f; });
    if (o) { a.n++; plant(a, o, a.life - a.t); vine(a, e.x, e.y - 4, o.x, o.y - 4); }
  }
}

function nextHost(a) {
  const L = nearestN(a.x, a.y, a.def.spread || 70, 6);
  for (let i = 0; i < L.length; i++) if (!hostOf(L[i], a.src)) return L[i];
  return null;
}

function sproutStep(a, dt) {
  a.k -= dt;
  if (a.k > 0) return;
  a.k = 0.5;
  const e = nearest(a.x, a.y, a.r);
  if (!e) return;
  damageEnemy(e, a.dmg, 0, 0, false);
  vine(a, a.x, a.y - 10, e.x, e.y - 4, 0.25);
  if (a.w) heal(a.w, 0.003, 0.02);
}

registerMech('vampire', {});
registerMech('parasite', {});

// --- Solar Beam ---------------------------------------------------------------------------

function sunStep(a, dt, p) {
  if (p) { a.x = p.x; a.y = p.y; }
}

function sunEnd(a) {
  const p = G.player;
  if (!p) return;
  const fl = mech(a.ov, 'solarFlare');
  if (fl) {
    // Solar Flare: the gathered sun is dropped on the thickest of the crowd instead.
    const e = densest(p.x, p.y, a.k);
    if (!e) return;
    const f = child(GRK.FLARE, a);
    if (f) { f.x = e.x; f.y = e.y; f.z = 120; f.life = 0.4; f.dmg = a.dmg * (fl.dmg || 1.3); f.r = (fl.r || 56) * vk(a.area); }
    return;
  }
  const e = nearest(p.x, p.y, a.k);
  const b = child(GRK.BEAM, a);
  if (!b) return;
  b.x = p.x; b.y = p.y; b.a = e ? Math.atan2(e.y - p.y, e.x - p.x) : (p.dir ? 0 : Math.PI);
  b.k = a.k * 1.3;                           // reach
  b.r = (a.def.beamW || 12) * a.area;        // half-width
  const fb = mech(a.ov, 'focusBeam');
  b.life = fb ? fb.t || 1.2 : 0.4;
  b.dmg = a.dmg * (fb ? fb.dmg || 0.45 : 1);
  b.step = 0; b.fixed = !!fb;
  b.target = e; b.tsn = e ? e.sn : 0;
}

function beamStep(a, dt, p) {
  if (p) { a.x = p.x; a.y = p.y; }
  // Focus Beam: it follows its foe round, sweeping.
  if (a.fixed && p) {
    const e = a.target && a.target.alive && a.target.sn === a.tsn ? a.target : nearest(p.x, p.y, a.k);
    if (e) {
      a.target = e; a.tsn = e.sn;
      let d = Math.atan2(e.y - p.y, e.x - p.x) - a.a;
      while (d > Math.PI) d -= TAU;
      while (d < -Math.PI) d += TAU;
      a.a += Math.max(-2.5 * dt, Math.min(2.5 * dt, d));
    }
  }
  a.step -= dt;
  if (a.step > 0) return;
  a.step = 0.12;
  const ph = mech(a.ov, 'photosynthesis');
  const n = damageLine(a.x, a.y - 6, a.a, a.k, a.r, a.dmg, nextHitId(), { knockback: 30 });
  if (ph && n && a.w) heal(a.w, (ph.per || 0.002) * n, ph.cap || 0.04);
}

function flareStep(a, dt) { a.z = Math.max(0, 120 * (1 - a.t / a.life)); }
function flareEnd(a) {
  damageCircle(a.x, a.y, a.r, a.dmg, nextHitId(), { knockback: 90, burn: a.dmg * 0.2, burnT: 3 });
  spawnSeq('fx_solar', a.x, a.y - 6, { dur: 0.3, fps: 10, scale: 1.4 });
  spawnSpr('flash_burst', a.x, a.y - 6, '#fff6a0', 1.6);
}

registerMech('focusBeam', {});
registerMech('solarFlare', {});
registerMech('photosynthesis', {});

// --- Grass Knot ---------------------------------------------------------------------------

function knotTrip(a, e, k = 1) {
  // Heavier falls harder: a share of its max health, kept modest on bosses. A repeat trip
  // (Tight Knot) or a snared passer-by falls for less of it.
  const share = e.boss || e.legend ? (a.def.bossShare || 0.02) : (a.def.share || 0.08);
  damageEnemy(e, (a.dmg + e.maxHp * share) * k, 0, 0, true);
  if (!e.boss && !e.legend) e.stunT = Math.max(e.stunT, a.def.stun || 0.8);
  spawnSpr('land_dust', e.x, e.y, '#c4f29a', 1);
  const th = mech(a.ov, 'thornKnot');
  if (th) {
    const t = child(GRK.THORN, a);
    if (t) { t.x = e.x; t.y = e.y; t.life = th.t || 2; t.r = 16; t.dmg = a.dmg * (th.dmg || 0.3); t.k = 0; }
  }
}

function knotStep(a, dt) {
  const e = a.target;
  if (a.fixed) {
    // Snare: the knot holds its foe fast, and trips whatever else walks into it.
    if (e && e.alive && e.sn === a.tsn) {
      if (!a.step) { a.step = 1; knotTrip(a, e); once(a, e); }
      if (movable(e)) { e.x = a.x; e.y = a.y; }
    }
    a.k -= dt;
    if (a.k <= 0) {
      a.k = 0.3;
      each(a.x, a.y, 18, (o) => { if (o !== e && once(a, o)) knotTrip(a, o, 0.5); });
    }
    return;
  }
  if (!e || !e.alive || e.sn !== a.tsn) { free(a); return; }
  a.x = e.x; a.y = e.y;
  // A trip a third of a second in, and Tight Knot's again every so often after.
  const gap = a.n ? (mech(a.ov, 'tightKnot').gap || 0.7) : 1;
  const due = 0.3 + a.step * gap;
  if (a.t >= due && a.step < Math.max(1, a.n)) { knotTrip(a, e, a.step ? 0.4 : 1); a.step++; }
}

function thornStep(a, dt) {
  a.k -= dt;
  if (a.k > 0) return;
  a.k = 0.4;
  damageCircle(a.x, a.y, a.r, a.dmg, nextHitId(), { canCrit: false, slow: 0.3, slowT: 0.5 });
}

registerMech('tightKnot', {});
registerMech('snare', {});
registerMech('thornKnot', {});

// --- Wood Hammer --------------------------------------------------------------------------

function logStep(a, dt) {
  if (a.phase === 0) {
    a.z = 110 * (1 - Math.min(1, a.t / a.life));
    if (a.t >= a.life) {
      // The slam.
      a.phase = 1; a.t = 0; a.life = a.k; a.z = 0;
      damageCircle(a.x, a.y, a.r * 2, a.dmg * 1.4, nextHitId(), { knockback: 80, stun: 0.3 });
      spawnSpr('land_dust', a.x - 10, a.y, '#c8a070', 1.4);
      spawnSpr('land_dust', a.x + 10, a.y, '#c8a070', 1.4);
      if (a.n) {
        // Timber: it splits in three, rolling out in a fan.
        a.n = 0;
        for (const da of [-0.6, 0.6]) {
          const b = child(GRK.LOG, a);
          if (!b) break;
          b.x = a.x; b.y = a.y; b.phase = 1; b.life = a.k; b.a = a.a + da; b.dmg = a.dmg * 0.6;
          b.area = a.area * 0.7; b.r = a.r * 0.7; b.vy0 = a.vy0; b.k = a.k;
        }
        a.dmg *= 0.6; a.r *= 0.7; a.area *= 0.7;
      }
    }
    return;
  }
  // Rolling: flattening what it rolls over, once each.
  const sp = a.vy0 * dt;
  a.x += Math.cos(a.a) * sp; a.y += Math.sin(a.a) * sp;
  a.idx += sp;                                // how far it has rolled, for the drawing
  const rl = mech(a.ov, 'rollingLog');
  each(a.x, a.y, a.r, (e) => {
    if (!once(a, e)) return;
    damageEnemy(e, a.dmg, Math.cos(a.a) * 60, Math.sin(a.a) * 60, true);
    if (!e.boss && !e.legend) e.stunT = Math.max(e.stunT, 0.4);
    if (rl) { a.dmg *= 1 + (rl.per || 0.1); a.r = Math.min(a.r * 1.04, (a.def.logR || 16) * 1.6); }
  });
}

function logEnd(a) {
  if (a.phase !== 1) return;
  // Where it comes to rest, it splinters.
  spawnSeq('fx_eos_logbreak', a.x, a.y - 8, { dur: 0.45, fps: 22, scale: 0.9 });
  const sp = mech(a.ov, 'sapling');
  if (!sp || count(GRK.SAPLING, a.src) >= 2) return;
  const t = child(GRK.SAPLING, a);
  if (t) { t.x = a.x; t.y = a.y; t.life = sp.t || 4; t.r = sp.range || 90; t.dmg = a.dmg * 0.25; t.k = 0; }
}

function saplingStep(a, dt) {
  // The sapling draws the crowd to it, and its roots lash what arrives.
  each(a.x, a.y, a.r, (e) => {
    if (!movable(e)) return;
    const dx = a.x - e.x, dy = a.y - e.y, d = Math.hypot(dx, dy) || 1;
    if (d > 14) { e.x += (dx / d) * e.speed * 0.8 * dt; e.y += (dy / d) * e.speed * 0.8 * dt; }
  });
  a.k -= dt;
  if (a.k > 0) return;
  a.k = 0.5;
  damageCircle(a.x, a.y, 20, a.dmg, nextHitId(), { canCrit: false });
}

registerMech('timber', {});
registerMech('rollingLog', {});
registerMech('sapling', {});

// --- Leaf Arrow's overloads (an aimed shot) -----------------------------------------------

registerMech('leafStorm', {
  // Every foe the arrow pierces sheds two razor leaves that spin off to either side.
  hit(e, dealt, rec, crit, cfg) {
    const w = rec.w;
    if (count(GRK.RAZOR, rec.proc) > (cfg.max || 16)) return;
    for (const s of [-1, 1]) {
      const a = take(GRK.RAZOR, procOf(rec));
      if (!a) return;
      const ang = G.rngFx() * TAU;
      a.x = e.x; a.y = e.y - 4; a.vx = Math.cos(ang) * 150 * s; a.vy = Math.sin(ang) * 150;
      a.life = 0.5; a.dmg = w.resolved.damage * (cfg.dmg || 0.3); a.r = 6;
    }
  },
});

function razorStep(a, dt) {
  a.x += a.vx * dt; a.y += a.vy * dt;
  a.a += 14 * dt;
  each(a.x, a.y, a.r, (e) => {
    if (!a.on || !once(a, e)) return;
    damageEnemy(e, a.dmg, a.vx * 0.1, a.vy * 0.1, false);
    free(a);
  });
}

registerMech('pinDown', {
  // Where the arrow comes to rest it stands as a stake: foes round it are rooted for 2s.
  expire(pr, rec, cfg) {
    if (count(GRK.STAKE, rec.w.srcId) >= (cfg.max || 4)) return;
    const a = take(GRK.STAKE, rec.w);
    if (!a) return;
    a.x = pr.x; a.y = pr.y; a.a = Math.atan2(pr.vy, pr.vx); a.life = cfg.t || 2; a.r = (cfg.r || 30) * vk(pr.area);
    a.dmg = rec.w.resolved.damage * (cfg.dmg || 0.2); a.k = 0;
  },
});

function stakeStep(a, dt) {
  each(a.x, a.y, a.r, (e) => { e.slow = Math.max(e.slow, 0.8); e.slowT = Math.max(e.slowT, 0.2); });
  a.k -= dt;
  if (a.k > 0) return;
  a.k = 0.5;
  damageCircle(a.x, a.y, a.r, a.dmg, nextHitId(), { canCrit: false });
}

registerMech('overgrowth', {
  // A pierced foe sprouts a bud, and two seconds later it bursts into leaves round it.
  hit(e, dealt, rec, crit, cfg) {
    const w = rec.w;
    const i = mark(w, 'budL', e, 2.2);
    if (i < 0 || w.budL[i + 3]) return;
    w.budL[i + 3] = 1;
    const a = take(GRK.BUD, procOf(rec));
    if (!a) return;
    a.target = e; a.tsn = e.sn; a.life = cfg.t || 2; a.dmg = w.resolved.damage * (cfg.dmg || 0.8); a.r = cfg.r || 26;
  },
});

function budStep(a) {
  const e = a.target;
  if (e && e.alive && e.sn === a.tsn) { a.x = e.x; a.y = e.y; }
}
function budEnd(a) {
  damageCircle(a.x, a.y, a.r, a.dmg, nextHitId(), { knockback: 40 });
  spawnSeq('fx_rs_leaf', a.x, a.y - 6, { dur: 0.3, fps: 12, scale: 1.4 });
  spawnSpr('ring_m', a.x, a.y, '#7fe08a', 1);
}

// --- Seed Bomb's overloads (a delayed bloom) ----------------------------------------------

const isSeed = (pr) => pr.payload > 0;

registerMech('chainBloom', {
  // Each blast scatters two smaller seeds that bloom again a moment later.
  expire(pr, rec, cfg) {
    if (!isSeed(pr)) return;
    for (let i = 0; i < (cfg.n || 2); i++) {
      const a = take(GRK.BLOOM, rec.w);
      if (!a) return;
      const ang = G.rngFx() * TAU, d = 24 + G.rngFx() * 20;
      a.ox = pr.x; a.oy = pr.y; a.tx = pr.x + Math.cos(ang) * d; a.ty = pr.y + Math.sin(ang) * d;
      a.x = a.ox; a.y = a.oy; a.life = cfg.t || 0.7;
      a.dmg = pr.dmg * (cfg.dmg || 0.5); a.r = (cfg.r || 26) * vk(pr.area);
    }
  },
});

function bloomStep(a) {
  const k = Math.min(1, a.t / 0.35);
  a.x = a.ox + (a.tx - a.ox) * k; a.y = a.oy + (a.ty - a.oy) * k;
  a.z = Math.sin(k * Math.PI) * 14;
}
function bloomEnd(a) {
  damageCircle(a.x, a.y, a.r, a.dmg, nextHitId(), { knockback: 40 });
  spawnSeq('fx_puff', a.x, a.y - 4, { dur: 0.3, fps: 10, scale: 1 });
}

registerMech('rootMine', {
  // The seeds do not go off on a fuse: they lie rooted for 6s until a foe steps over one.
  shot(pr, rec, dt, cfg) {
    if (!isSeed(pr)) return false;
    if (pr.mx === 0) { pr.mx = 1; pr.maxLife = cfg.t || 6; }
    if (pr.z > 2 || pr.life < 0.4) return false;
    let hit = false;
    each(pr.x, pr.y, cfg.r || 14, () => { hit = true; });
    if (hit) pr.life = pr.maxLife;
    return false;
  },
});

registerMech('pollen', {
  // Each blast leaves a cloud of pollen for 2.5s that sends whatever wanders in to sleep, once.
  expire(pr, rec, cfg) {
    if (!isSeed(pr)) return;
    const a = take(GRK.POLLEN, rec.w);
    if (!a) return;
    a.x = pr.x; a.y = pr.y; a.life = cfg.t || 2.5; a.r = (cfg.r || 36) * vk(pr.area); a.k = cfg.sleep || 1.5;
  },
});

function pollenStep(a) {
  each(a.x, a.y, a.r, (e) => {
    if (!once(a, e) || e.boss || e.legend) return;
    e.stunT = Math.max(e.stunT, a.k);
    spawnSpr('motes', e.x, e.y - e.r - 4, '#fff0a0', 0.8);
  });
}

// --- Spirit Shackle's overloads -----------------------------------------------------------

registerMech('deepShadow', {
  // The arrows leave their shadow on the floor for 1.5s, dragging at whatever crosses it.
  shot(pr, rec, dt, cfg) {
    pr.mx -= dt;
    if (pr.mx > 0) return false;
    pr.mx = 0.08;
    if (count(GRK.SHADE, rec.w.srcId) > 60) return false;
    const a = take(GRK.SHADE, rec.w);
    if (!a) return false;
    a.x = pr.x; a.y = pr.y; a.a = Math.atan2(pr.vy, pr.vx); a.life = cfg.t || 1.5; a.r = 9;
    a.dmg = rec.w.resolved.damage * (cfg.dmg || 0.08); a.k = 0;
    return false;
  },
});

function shadeStep(a, dt) {
  each(a.x, a.y, a.r, (e) => { e.slow = Math.max(e.slow, 0.5); e.slowT = Math.max(e.slowT, 0.2); });
  a.k -= dt;
  if (a.k > 0) return;
  a.k = 0.5;
  damageCircle(a.x, a.y, a.r, a.dmg, nextHitId(), { canCrit: false });
}

registerMech('soulTether', {
  // A pierced foe is shackled where it stood: for 3s it cannot stray more than 40px from there.
  hit(e, dealt, rec, crit, cfg) {
    if (!movable(e)) return;
    const w = rec.w;
    const fresh = !(w.tetherL && w.tetherL.includes(e));
    const i = mark(w, 'tetherL', e, cfg.t || 3);
    if (i < 0) return;
    if (fresh) { w.tetherX = w.tetherX || new Map(); w.tetherX.set(e, [e.x, e.y]); }
  },
  tick(w, dt, p, cfg) {
    eachMarked(w, 'tetherL', (e) => {
      const o = w.tetherX && w.tetherX.get(e);
      if (!o) return;
      const dx = e.x - o[0], dy = e.y - o[1], d = Math.hypot(dx, dy), R = cfg.r || 40;
      if (d > R) { e.x = o[0] + (dx / d) * R; e.y = o[1] + (dy / d) * R; }
    }, (e) => { if (w.tetherX) w.tetherX.delete(e); });
  },
});

registerMech('haunt', {
  // A foe the arrows kill rises as a ghost that hunts its old friends for 3s, up to three.
  kill(e, rec, cfg) {
    if (count(GRK.WISP, rec.proc) >= (cfg.max || 3)) return;
    const a = take(GRK.WISP, procOf(rec));
    if (!a) return;
    a.x = e.x; a.y = e.y; a.life = cfg.t || 3; a.dmg = rec.w.resolved.damage * (cfg.dmg || 0.35); a.k = 0;
    spawnSpr('death_flash', e.x, e.y - 4, '#a0f0d0', 1);
  },
});

function wispStep(a, dt) {
  const e = nearest(a.x, a.y, 140);
  if (e) {
    const dx = e.x - a.x, dy = e.y - a.y, d = Math.hypot(dx, dy) || 1;
    a.x += (dx / d) * 110 * dt; a.y += (dy / d) * 110 * dt;
  }
  a.k -= dt;
  if (a.k > 0 || !e || Math.hypot(e.x - a.x, e.y - a.y) > 12) return;
  a.k = 0.35;
  damageEnemy(e, a.dmg, 0, 0, false);
}

// --- Registration ---------------------------------------------------------------------------

registerMoves({
  step: {
    [GRK.SEED]: seedStep, [GRK.LEECH]: leechStep, [GRK.SPROUT]: sproutStep, [GRK.SUN]: sunStep,
    [GRK.BEAM]: beamStep, [GRK.FLARE]: flareStep, [GRK.KNOT]: knotStep, [GRK.THORN]: thornStep,
    [GRK.LOG]: logStep, [GRK.SAPLING]: saplingStep, [GRK.RAZOR]: razorStep, [GRK.STAKE]: stakeStep,
    [GRK.BUD]: budStep, [GRK.BLOOM]: bloomStep, [GRK.POLLEN]: pollenStep, [GRK.SHADE]: shadeStep,
    [GRK.WISP]: wispStep,
  },
  end: {
    [GRK.SEED]: seedEnd, [GRK.SUN]: sunEnd, [GRK.FLARE]: flareEnd, [GRK.LOG]: logEnd,
    [GRK.BUD]: budEnd, [GRK.BLOOM]: bloomEnd,
  },
});
