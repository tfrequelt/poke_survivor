// L3 -- may import L0-L2 and the move framework (moves/core.js).
//
// Ghost: the new Poltergeist, Mean Look, Curse and Hex, and the overload mechanics of Spectral
// Aura, Shadow Ball and Shadow Storm (Shadow Ball's evolution). Drawing is draw_ghost.js.

import { G } from '../state.js';
import { TAU, dist2 } from '../util.js';
import { projectiles, nextHitId, getDamageSource, setDamageSource } from '../world.js';
import { damageEnemy, damageCircle, damageRing } from '../combat.js';
import { spawnSpr } from '../sprfx.js';
import { spawnSeq } from '../seqfx.js';
import { registerMech } from '../mechs.js';
import {
  KIND, vk, actors, MOVE_CAP as CAP, registerMoves, take, child, free, mech, lvSum, procOf,
  nearest, nearestN, toughest, each, movable, settle, ovProc, once, mark, eachMarked,
} from './core.js';

export const HK = {
  ROCK: KIND.ghost,            // a Poltergeist rock: rising (phase 0), hovering, then hurled
  THROWN: KIND.ghost + 1,      // Possess: a foe flung on as a missile
  GAZE: KIND.ghost + 2,        // Mean Look's eye
  CURSE: KIND.ghost + 3,       // a curse on a foe
  CFLAME: KIND.ghost + 4,      // Cursed Flame: a hex fire left burning on a foe
  RING: KIND.ghost + 5,        // Phantom Ring
  FALL: KIND.ghost + 6,        // Nightfall's falling shadow ball
  ORB: KIND.ghost + 7,         // a rolling shadow orb (Nightfall, Tempest)
  HOLE: KIND.ghost + 8,        // Black Hole
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
/** Is this foe under one of this weapon's curses? */
function curseOn(e, src) {
  for (let i = 0; i < CAP; i++) {
    const a = actors[i];
    if (a.on && a.kind === HK.CURSE && a.target === e && a.tsn === e.sn && (src === undefined || a.src === src)) return a;
  }
  return null;
}

/** How many afflictions a foe is under: burned, slowed, stunned, confused, soaked, cursed... */
export function afflictions(e) {
  let n = 0;
  if (e.burnT > 0) n++;
  if (e.slowT > 0) n++;
  if (e.stunT > 0) n++;
  if (e.confuseT > 0) n++;
  if (e.wetT > 0) n++;
  if (e.markT > 0) n++;
  if (e.aged) n++;
  if (curseOn(e)) n++;
  return n;
}

export const GHOST_BEHAVIOR = {
  /** Poltergeist: rocks lift out of the ground round you, hover, and are hurled at foes. */
  poltergeist(w, st, p) {
    const def = w.def;
    if (!nearest(p.x, p.y, def.range * st.range)) return false;
    const n = Math.max(1, Math.round(st.amount));
    const orbit = mech(w.ovl, 'junkOrbit');
    for (let i = 0; i < n; i++) {
      const a = take(HK.ROCK, w);
      if (!a) break;
      const ang = G.rngRun() * TAU, d = 18 + G.rngRun() * 30;
      a.x = p.x + Math.cos(ang) * d; a.y = p.y + Math.sin(ang) * d * 0.7;
      a.a = ang; a.k = orbit ? orbit.t || 3 : (def.hover || 0.5) + i * 0.12;
      a.life = a.k + 1.5; a.dmg = st.damage; a.area = st.area; a.r = def.r * st.area;
      a.vy0 = st.speed; a.idx = (G.rngFx() * 28) | 0;
      a.fixed = !!orbit; a.z = 0;
    }
    return true;
  },

  /** Mean Look: a great eye opens over the crowd. Nothing in its gaze can leave. */
  meanLook(w, st, p) {
    const def = w.def;
    const ev = mech(w.ovl, 'evilEye');
    if (ev && count(HK.GAZE, w.srcId)) return false;
    const e = ev ? null : densest(p.x, p.y, def.range * st.range);
    if (!e && !ev) return false;
    const a = take(HK.GAZE, w);
    if (!a) return true;
    a.x = e ? e.x : p.x; a.y = e ? e.y : p.y;
    a.r = (def.gazeR || 48) * st.area; a.life = ev ? ev.t || 5 : st.duration;
    a.dmg = st.damage; a.k = 0; a.fixed = !!ev;
    return true;
  },

  /** Curse: costs you a share of your health; the cursed foe loses a big share of its own. */
  curse(w, st, p) {
    const def = w.def;
    const L = nearestN(p.x, p.y, def.range * st.range, 8);
    let e = null;
    for (const o of L) if (!curseOn(o, w.srcId) && (!e || o.hp > e.hp)) e = o;
    if (!e) return false;
    // The price, paid up front: a share of what you have now, and never your last point.
    const cost = Math.floor(p.hp * (def.cost || 0.05));
    if (cost > 0 && !G.debug.godmode) p.hp = Math.max(1, p.hp - cost);
    spawnSpr('death_flash', p.x, p.y - 8, '#c49aff', 0.8);
    const a = take(HK.CURSE, w);
    if (!a) return true;
    a.target = e; a.tsn = e.sn; a.life = st.duration; a.k = 0.5;
    a.dmg = st.damage; a.step = 0;
    return true;
  },

  /** Hex: purple fire bursts on every afflicted foe in reach -- the more afflictions, the worse. */
  hex(w, st, p) {
    const def = w.def;
    const L = nearestN(p.x, p.y, def.range * st.range, 16);
    if (!L.length) return false;
    const max = Math.max(1, Math.round(st.amount)) + (def.burstBase || 4);
    let n = 0;
    for (let i = 0; i < L.length && n < max; i++) {
      const e = L[i];
      const k = afflictions(e);
      if (!k) continue;
      hexBurst(w, e, st.damage * (1 + (def.perAff || 0.5) * k), w.srcId);
      n++;
    }
    if (!n) {
      // Nobody afflicted: the three nearest are touched by the hex, and slowed long enough for
      // the next cast to find them afflicted.
      for (let i = 0; i < Math.min(3, L.length); i++) {
        damageEnemy(L[i], st.damage, 0, 0, true);
        L[i].slow = Math.max(L[i].slow, 0.3); L[i].slowT = Math.max(L[i].slowT, st.cooldown + 1.5);
        spawnSeq('fx_eos_hexfire', L[i].x, L[i].y + 2, { dur: 0.3, fps: 14, scale: 1, bottom: true });
      }
    }
    return true;
  },
};

function hexBurst(w, e, dmg) {
  damageEnemy(e, dmg, 0, 0, true);
  spawnSeq('fx_eos_hexfire', e.x, e.y + 2, { dur: 0.35, fps: 14, scale: 1.5, bottom: true });
  const ov = w.ovl;
  const wh = mech(ov, 'wildHex');
  if (wh && e.alive) {
    // Wild Hex: the fire leaps on once to the nearest other afflicted foe.
    const L = nearestN(e.x, e.y, wh.range || 70, 4);
    for (const o of L) {
      if (o === e || !afflictions(o)) continue;
      damageEnemy(o, dmg * (wh.dmg || 0.6), 0, 0, false);
      spawnSeq('fx_eos_hexfire', o.x, o.y + 2, { dur: 0.3, fps: 14, scale: 1.2, bottom: true });
      break;
    }
  }
  const cf = mech(ov, 'cursedFlame');
  if (cf && e.alive && count(HK.CFLAME, w.srcId) < 12) {
    const a = take(HK.CFLAME, w);
    if (a) { a.target = e; a.tsn = e.sn; a.life = cf.t || 2; a.dmg = dmg * (cf.dmg || 0.15); a.k = 0.4; }
  }
  const sp = mech(ov, 'spreadHex');
  if (sp && e.alive) {
    // Spread Hex: the foe's afflictions catch on the two foes nearest it.
    const L = nearestN(e.x, e.y, sp.range || 60, 3);
    let k = 0;
    for (const o of L) {
      if (o === e || k >= (sp.n || 2)) continue;
      k++;
      if (e.burnT > 0 && o.burnT <= 0) { o.burnT = Math.min(e.burnT, 2); o.burnDps = e.burnDps; o.burnTick = 0.1; }
      if (e.slowT > 0) { o.slow = Math.max(o.slow, e.slow); o.slowT = Math.max(o.slowT, Math.min(e.slowT, 2)); }
      if (e.confuseT > 0 && movable(o)) o.confuseT = Math.max(o.confuseT, Math.min(e.confuseT, 2));
      if (e.stunT > 0 && movable(o)) o.stunT = Math.max(o.stunT, Math.min(e.stunT, 0.6));
      spawnSpr('ring_s', o.x, o.y - 4, '#c49aff', 0.8);
    }
  }
}

registerMech('wildHex', {});
registerMech('cursedFlame', {});
registerMech('spreadHex', {});

function cflameStep(a, dt) {
  const e = a.target;
  if (!e || !e.alive || e.sn !== a.tsn) { free(a); return; }
  a.x = e.x; a.y = e.y;
  // A hex fire is an affliction of its own: the foe counts as cursed-burning while it lasts.
  e.markT = Math.max(e.markT, 0.1); e.markMul = Math.max(e.markMul, 0.05);
  a.k -= dt;
  if (a.k > 0) return;
  a.k = 0.4;
  damageEnemy(e, a.dmg, 0, 0, false);
}

// --- Poltergeist ----------------------------------------------------------------------------

function rockStep(a, dt, p) {
  if (a.phase === 0) {
    // Lifting out of the ground, then hovering, turning slowly.
    a.z = Math.min(26, a.z + 70 * dt);
    if (a.fixed && p) {
      // Junk Orbit: circling you until its time is up, battering what it touches.
      a.a += 3 * dt;
      a.x = p.x + Math.cos(a.a) * 38; a.y = p.y + Math.sin(a.a) * 28;
      each(a.x, a.y, a.r + 2, (e) => { if (once(a, e, 1)) damageEnemy(e, a.dmg * 0.5, Math.cos(a.a) * 40, Math.sin(a.a) * 40, false); });
      if (((a.t * 2) | 0) !== a.step) { a.step = (a.t * 2) | 0; a.held.length = 0; a.heldSn.length = 0; }
    }
    if (a.t < a.k) return;
    const t = mech(a.ov, 'heavyHaunt') ? toughest(a.x, a.y, 240) : nearest(a.x, a.y, 240);
    if (!t) { a.life = a.t + 0.3; return; }
    a.phase = 1;
    const dx = t.x - a.x, dy = t.y - a.y, d = Math.hypot(dx, dy) || 1;
    a.vx = (dx / d) * a.vy0; a.vy = (dy / d) * a.vy0;
    // Heavy Haunt: the longer it hovered, the harder it lands.
    const hh = mech(a.ov, 'heavyHaunt');
    if (hh) a.dmg *= 1 + Math.min(hh.max || 1.5, a.t * (hh.per || 1));
    a.held.length = 0; a.heldSn.length = 0;
    a.life = a.t + 1.2;
    return;
  }
  a.x += a.vx * dt; a.y += a.vy * dt;
  a.z = Math.max(4, a.z - 30 * dt);
  let hit = null;
  each(a.x, a.y, a.r, (e) => { if (!hit) hit = e; });
  if (!hit) return;
  const d = Math.hypot(a.vx, a.vy) || 1;
  damageEnemy(hit, a.dmg, (a.vx / d) * 90, (a.vy / d) * 90, true);
  // It shatters on impact, and the shards catch whatever stood beside it.
  damageCircle(a.x, a.y, 16 * vk(a.area), a.dmg * 0.4, nextHitId(), { canCrit: false });
  if (mech(a.ov, 'heavyHaunt') && !hit.boss && !hit.legend) hit.stunT = Math.max(hit.stunT, 0.5);
  spawnSeq('fx_eos_pebbles', a.x, a.y - 6, { dur: 0.35, fps: 24, scale: 0.6 });
  const po = mech(a.ov, 'possess');
  if (po && hit.alive && movable(hit) && count(HK.THROWN, a.src) < 4) {
    // Possess: the foe it struck is flung on as a missile at the next foe.
    const n = nearest(hit.x, hit.y, 160, [hit]);
    if (n) {
      const s = child(HK.THROWN, a);
      if (s) {
        const dx = n.x - hit.x, dy = n.y - hit.y, dd = Math.hypot(dx, dy) || 1;
        s.target = hit; s.tsn = hit.sn; s.vx = (dx / dd) * 240; s.vy = (dy / dd) * 240;
        s.life = po.t || 0.8; s.dmg = a.dmg * (po.dmg || 0.7); s.r = hit.r + 4;
      }
    }
  }
  free(a);
}

function thrownStep(a, dt) {
  const e = a.target;
  if (!e || !e.alive || e.sn !== a.tsn) { free(a); return; }
  e.x += a.vx * dt; e.y += a.vy * dt;
  e.stunT = Math.max(e.stunT, 0.05);
  settle(e);
  a.x = e.x; a.y = e.y;
  each(e.x, e.y, a.r, (o) => {
    if (o === e || !once(a, o)) return;
    damageEnemy(o, a.dmg, a.vx * 0.2, a.vy * 0.2, false);
    damageEnemy(e, a.dmg * 0.5, 0, 0, false);
    spawnSpr('punch_s', (e.x + o.x) / 2, (e.y + o.y) / 2 - 4, '#c49aff', 0.9);
  });
}

registerMech('heavyHaunt', {});
registerMech('junkOrbit', {});
registerMech('possess', {});

// --- Mean Look ------------------------------------------------------------------------------

function gazeStep(a, dt, p) {
  if (a.fixed && p) { a.x = p.x; a.y = p.y; }      // Evil Eye: it watches over you
  const open = Math.min(1, a.t / 0.3);
  const R = a.r * open;
  // Nothing in the gaze may leave it.
  let n = 0;
  each(a.x, a.y, a.r * 1.3, (e) => {
    const dx = e.x - a.x, dy = e.y - a.y, d = Math.hypot(dx, dy) || 1;
    if (d > R + e.r) return;
    n++;
    if (movable(e) && d > R * 0.85) { e.x = a.x + (dx / d) * R * 0.85; e.y = a.y + (dy / d) * R * 0.85; }
    if (mech(a.ov, 'nightmare') && once(a, e, 1) && movable(e)) { e.stunT = Math.max(e.stunT, mech(a.ov, 'nightmare').t || 2); e.sleep = true; }
  });
  a.n = n;
  a.k -= dt;
  if (a.k > 0) return;
  a.k = 0.4;
  // It stares harder the more it holds.
  const gl = mech(a.ov, 'glare'), nm = mech(a.ov, 'nightmare');
  each(a.x, a.y, R, (e) => {
    let d = a.dmg * (1 + (a.def.perHeld || 0.1) * n);
    if (nm && e.stunT > 0) d *= nm.mul || 2;
    damageEnemy(e, d, 0, 0, true);
    if (gl && !e.boss && !e.legend && G.rngRun() < (gl.chance || 0.25)) e.stunT = Math.max(e.stunT, gl.t || 0.5);
  });
}

function gazeEnd(a) {
  // The sleep a Nightmare put on its catch wears off with the eye.
  if (!mech(a.ov, 'nightmare')) return;
  for (let i = 0; i < a.held.length; i++) {
    const e = a.held[i];
    if (e.alive && (a.heldSn[i] >> 2) === e.sn) e.sleep = false;
  }
}

registerMech('glare', {});
registerMech('evilEye', {});
registerMech('nightmare', {});

// --- Curse ----------------------------------------------------------------------------------

function curseStep(a, dt) {
  const e = a.target;
  if (!e || !e.alive || e.sn !== a.tsn) {
    // Lingering Curse: the curse passes to the nearest foe with whatever time it had left.
    const lc = mech(a.ov, 'lingeringCurse');
    const left = a.life - a.t;
    if (lc && left > 0.5 && !a.done) {
      const o = nearest(a.x, a.y, lc.range || 90);
      if (o && !curseOn(o, a.src)) {
        a.done = true;
        const c = child(HK.CURSE, a);
        if (c) { c.target = o; c.tsn = o.sn; c.life = left; c.k = 0.2; c.dmg = a.dmg; c.done = true; }
        spawnSpr('death_flash', o.x, o.y - 6, '#c49aff', 0.9);
      }
    }
    free(a);
    return;
  }
  a.x = e.x; a.y = e.y;
  a.k -= dt;
  if (a.k > 0) return;
  a.k = 0.5;
  // A large share of its health, every half second; a boss or legend loses only a sliver.
  const share = e.boss || e.legend ? (a.def.bossShare || 0.01) : (a.def.share || 0.06);
  const d = e.maxHp * share + a.dmg;
  if (mech(a.ov, 'doomCurse')) { a.step += d; return; }       // Doom Curse banks it instead
  damageEnemy(e, d, 0, 0, false, true);
  spawnSpr('motes', e.x, e.y - e.r - 4, '#c49aff', 0.7);
  const sc = mech(a.ov, 'spiteCurse');
  if (sc) {
    // Spite Curse: its pain spills onto the foes round it.
    each(e.x, e.y, sc.r || 30, (o) => { if (o !== e) damageEnemy(o, d * (sc.dmg || 0.4), 0, 0, false, true); });
  }
}

function curseEnd(a) {
  const dc = mech(a.ov, 'doomCurse');
  const e = a.target;
  if (!dc || !e || !e.alive || e.sn !== a.tsn) return;
  // Doom Curse: everything it banked, at once, and over the foes round it.
  damageEnemy(e, a.step * (dc.mul || 1.3), 0, 0, false, true);
  damageCircle(e.x, e.y, dc.r || 30, a.step * (dc.splash || 0.3), nextHitId(), { canCrit: false });
  spawnSeq('fx_eos_blackhole', e.x, e.y - 6, { dur: 0.5, fps: 50, scale: 0.6 });
}

registerMech('lingeringCurse', {});
registerMech('doomCurse', {});
registerMech('spiteCurse', {});

// --- Spectral Aura's overloads (an aura) ----------------------------------------------------

const auraR = (w) => w.def.r * w.resolved.area;

registerMech('nightShade', {
  // Night Shade, as it is in the games: the aura also deals damage equal to your level, fixed --
  // no type, no armour, no crit -- to each foe at most twice a second.
  hit(e, dealt, rec, crit, cfg) {
    const i = mark(rec.w, 'shadeL', e, cfg.gap || 0.5);
    if (i < 0 || rec.w.shadeL[i + 3] === ((G.clock / (cfg.gap || 0.5)) | 0)) return;
    rec.w.shadeL[i + 3] = (G.clock / (cfg.gap || 0.5)) | 0;
    if (e.alive) damageEnemy(e, (G.level || 1) * (cfg.per || 1.5), 0, 0, false, true);
  },
});

registerMech('phantomRing', {
  // The aura leaves you: it breathes out as a ring, 20px to 80px and back, striking only at its edge.
  shot(pr, rec, dt, cfg) {
    if (pr.gen !== 0 || !rec.w || pr.weapon !== rec.w.defIdx) return false;
    pr.r = 0;
    pr.mx -= dt;
    const w = rec.w, p = G.player;
    if (!p) return false;
    const k = 0.5 + 0.5 * Math.sin(G.clock * (cfg.speed || 2.4));
    const R = (20 + k * ((cfg.max || 80) - 20)) * Math.sqrt(w.resolved.area);
    w.ringR = R;
    if (pr.mx > 0) return false;
    pr.mx = 0.12;
    damageRing(p.x, p.y, R - 8, R + 8, w.resolved.damage * (cfg.dmg || 1.4), nextHitId(), { knockback: 30 });
    return false;
  },
  tick(w, dt, p) {
    // Its drawing: one ring actor kept alive while the overload stands.
    if (!p || count(HK.RING, w.srcId)) return;
    const a = take(HK.RING, w);
    if (a) a.life = 1e9;
  },
});

function ringStep(a, dt, p) {
  if (!p || !a.w || !mech(a.w.ovl, 'phantomRing')) { free(a); return; }
  a.x = p.x; a.y = p.y; a.r = a.w.ringR || 30;
}

registerMech('spite', {
  // Spite: enemy shots fizzle out inside the aura, and the foes standing in it are sapped and slowed.
  tick(w, dt, p) {
    if (!p) return;
    const R = auraR(w);
    for (let i = 0; i < projectiles.length; i++) {
      const q = projectiles[i];
      if (!q.alive || !q.hostile || q.r <= 0 || dist2(q.x, q.y, p.x, p.y) > R * R) continue;
      q.life = q.maxLife; q.r = 0;
      if (G.rngFx() < 0.5) spawnSpr('ring_s', q.x, q.y, '#c49aff', 0.6);
    }
    each(p.x, p.y, R, (e) => { e.slow = Math.max(e.slow, 0.4); e.slowT = Math.max(e.slowT, 0.2); });
  },
});

// --- Shadow Ball's overloads (a split shot) -------------------------------------------------

registerMech('umbra', {
  // A foe the shadow touches is steeped in it for 3s: it takes a quarter more from everything.
  hit(e, dealt, rec, crit, cfg) {
    e.markT = Math.max(e.markT, cfg.t || 3);
    e.markMul = Math.max(e.markMul, cfg.mul || 0.25);
  },
});

registerMech('nightfall', {
  // No lob: the ball falls out of the sky on the thickest of the crowd, and bursts into rolling orbs.
  spawn(pr) { pr.maxLife = 0.0001; pr.r = 0; pr.r0 = 0; pr.anim = null; pr.vis = 0.001; pr.x = pr.y = -99999; },
  fire(w, st, p, cfg) {
    const e = densest(p.x, p.y, w.def.range * st.range * 1.2);
    if (!e) return;
    const a = take(HK.FALL, w);
    if (!a) return;
    a.x = e.x; a.y = e.y; a.z = 110; a.life = 0.4; a.dmg = st.damage * (cfg.dmg || 1.2);
    a.r = (cfg.r || 30) * vk(st.area); a.n = Math.max(2, st.shards || 4);
  },
});

function fallStep(a) { a.z = 110 * (1 - Math.min(1, a.t / a.life)); }
function fallEnd(a) {
  damageCircle(a.x, a.y, a.r, a.dmg, nextHitId(), { knockback: 60 });
  spawnSeq('fx_eos_darkburst', a.x, a.y - 6, { dur: 0.35, fps: 28, scale: 0.6 });
  for (let i = 0; i < a.n; i++) {
    const o = child(HK.ORB, a);
    if (!o) break;
    const ang = (i / a.n) * TAU;
    o.x = a.x; o.y = a.y; o.vx = Math.cos(ang) * 120; o.vy = Math.sin(ang) * 120;
    o.life = 0.6; o.dmg = a.dmg * 0.4; o.r = 7;
  }
}

function orbStep(a, dt) {
  if (a.fixed) {
    // Tempest: the orbs circle their burst point a moment before they fly out.
    if (a.t < a.k) {
      a.a += 9 * dt;
      a.x = a.bx + Math.cos(a.a) * 16; a.y = a.by + Math.sin(a.a) * 12;
      each(a.x, a.y, a.r, (e) => { if (once(a, e, 1)) damageEnemy(e, a.dmg * 0.5, 0, 0, false); });
      return;
    }
    if (!a.done) { a.done = true; a.vx = Math.cos(a.a) * 160; a.vy = Math.sin(a.a) * 160; }
  }
  a.x += a.vx * dt; a.y += a.vy * dt;
  each(a.x, a.y, a.r, (e) => { if (once(a, e)) damageEnemy(e, a.dmg, a.vx * 0.15, a.vy * 0.15, false); });
}

registerMech('enthrall', {
  // A foe struck by the burst is enthralled for 2s: it fights on your side.
  hit(e, dealt, rec, crit, cfg) {
    if (!movable(e) || e.charmT > 0 || G.rngRun() > (cfg.chance || 0.3)) return;
    e.charmT = cfg.t || 2; e.charmSrc = rec.proc; e.charmMul = 1;
    spawnSpr('death_flash', e.x, e.y - e.r - 4, '#c49aff', 0.8);
  },
});

// --- Shadow Storm's overloads ---------------------------------------------------------------

registerMech('tempest', {
  // Where the storm bursts, shadow orbs circle the spot for a heartbeat, then scatter.
  hit(e, dealt, rec, crit, cfg) {
    const w = rec.w;
    if (w.tempT === G.tick || count(HK.ORB, rec.proc) > 24) return;
    w.tempT = G.tick;
    for (let i = 0; i < (cfg.n || 4); i++) {
      const a = take(HK.ORB, procOf(rec));
      if (!a) return;
      a.bx = e.x; a.by = e.y; a.a = (i / (cfg.n || 4)) * TAU; a.fixed = true; a.k = cfg.hold || 0.6;
      a.life = a.k + 0.5; a.dmg = w.resolved.damage * (cfg.dmg || 0.35); a.r = 7;
      a.x = a.bx; a.y = a.by;
    }
  },
});

registerMech('blackHole', {
  // The storm leaves a black hole where it ends, swallowing the crowd toward it for 1.5s.
  expire(pr, rec, cfg) {
    if (count(HK.HOLE, rec.w.srcId) >= (cfg.max || 2)) return;
    const a = take(HK.HOLE, rec.w);
    if (!a) return;
    a.x = pr.x; a.y = pr.y; a.life = cfg.t || 1.5; a.r = (cfg.r || 60) * vk(pr.area);
    a.dmg = rec.w.resolved.damage * (cfg.dmg || 0.15); a.k = 0;
  },
});

function holeStep(a, dt) {
  each(a.x, a.y, a.r, (e) => {
    if (!movable(e)) return;
    const dx = a.x - e.x, dy = a.y - e.y, d = Math.hypot(dx, dy) || 1;
    if (d > 6) { e.x += (dx / d) * 110 * dt; e.y += (dy / d) * 110 * dt; }
  });
  a.k -= dt;
  if (a.k > 0) return;
  a.k = 0.3;
  damageCircle(a.x, a.y, 20, a.dmg, nextHitId(), { canCrit: false });
}

registerMech('shadowSurge', {
  // Bursts in quick succession build a surge: each within 2s of the last makes the next one wider
  // and fouler, up to five times; a pause and it ebbs away.
  hit(e, dealt, rec, crit, cfg) {
    const w = rec.w;
    // One burst at a time: the shards of one burst land over a few frames, and count once.
    if (G.clock - (w.surgeAt || -9) < 0.3) return;
    w.surge = G.clock - (w.surgeAt || -9) < (cfg.window || 2) ? Math.min(cfg.max || 5, (w.surge || 0) + 1) : 0;
    w.surgeAt = G.clock;
    if (w.surge > 0 && e.alive) {
      damageCircle(e.x, e.y, 16 + w.surge * 6, w.resolved.damage * (cfg.per || 0.15) * w.surge, nextHitId(), { canCrit: false });
      if (w.surge >= (cfg.max || 5)) spawnSeq('fx_eos_darkburst', e.x, e.y - 6, { dur: 0.3, fps: 30, scale: 0.5 });
    }
  },
});

// --- Registration ---------------------------------------------------------------------------

registerMoves({
  step: {
    [HK.ROCK]: rockStep, [HK.THROWN]: thrownStep, [HK.GAZE]: gazeStep, [HK.CURSE]: curseStep,
    [HK.CFLAME]: cflameStep, [HK.RING]: ringStep, [HK.FALL]: fallStep, [HK.ORB]: orbStep,
    [HK.HOLE]: holeStep,
  },
  end: { [HK.GAZE]: gazeEnd, [HK.CURSE]: curseEnd, [HK.FALL]: fallEnd },
});
