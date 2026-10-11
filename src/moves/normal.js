// L3 -- may import L0-L2 and the move framework (moves/core.js).
//
// Normal: the new Swift (and its evolution Star Barrage), Pay Day, Tri Attack and Hyper Voice,
// and the overload mechanics of Fury Swipes and Giga Impact. Drawing is draw_normal.js.

import { G } from '../state.js';
import { TAU, dist2, clampToBounds } from '../util.js';
import { projectiles, nextHitId, getDamageSource, setDamageSource } from '../world.js';
import { damageEnemy, damageCircle, damageLine, damageOverTime, applyBurn, applyChill, critCtx } from '../combat.js';
import { spawnSpr } from '../sprfx.js';
import { spawnSeq } from '../seqfx.js';
import { registerMech } from '../mechs.js';
import { dropCoin, dropXp } from '../pickups.js';
import { waterAtWorld, nearestLand } from '../terrain.js';
import {
  KIND, vk, actors, MOVE_CAP as CAP, registerMoves, take, child, free, mech, lvSum,
  nearest, nearestN, each, movable, settle, ovLook, ovProc, once, mark, eachMarked,
} from './core.js';

export const NK = {
  STAR: KIND.normal,          // a Swift star
  WELL: KIND.normal + 1,      // Star Well's vortex
  GUARD: KIND.normal + 2,     // Star Shield's orbiting star
  COIN: KIND.normal + 3,      // a Pay Day coin in flight
  CARPET: KIND.normal + 4,    // Coin Toss's spinning coins on the ground
  TRI: KIND.normal + 5,       // the Tri Attack triangle
  RING: KIND.normal + 6,      // a Hyper Voice sound ring
  PERISH: KIND.normal + 7,    // Perish Song's count over a foe
  SCRATCH: KIND.normal + 8,   // Slash Trail's lingering claw mark
  CRACK: KIND.normal + 9,     // Shockwave Trail's crack, about to erupt
  LEAP: KIND.normal + 10,     // Body Slam's leap
};


// --- Swift --------------------------------------------------------------------------------
//
// Stars burst out wide in a fan, hang a heartbeat, then all turn and converge on one foe from
// every side at once, piercing through and out the far side. They never miss what they chose.

export const NORMAL_BEHAVIOR = {
  swift(w, st, p) {
    const def = w.def;
    const t = nearest(p.x, p.y, def.range * st.range);
    if (!t) return false;
    const n = Math.max(1, Math.round(st.amount));
    const base = Math.atan2(t.y - p.y, t.x - p.x);
    w.vol = (w.vol || 0) + 1;
    // Star Shower picks a foe per star; Star Barrage splits its volley over a few.
    const shower = mech(w.ovl, 'starShower');
    const many = shower ? n : def.targets || 0;
    const tg = many ? nearestN(p.x, p.y, def.range * st.range * 1.2, many) : null;
    const lucky = mech(w.ovl, 'luckyStar') ? (G.rngRun() * n) | 0 : -1;
    for (let i = 0; i < n; i++) {
      const a = take(NK.STAR, w);
      if (!a) break;
      const fan = n === 1 ? 0 : (i / (n - 1) - 0.5) * 2.8;
      const ang = base + Math.PI + fan * 0.6 + (fan >= 0 ? 0.9 : -0.9);   // out to the sides and back
      a.x = p.x; a.y = p.y - 4;
      a.vx = Math.cos(ang) * 200; a.vy = Math.sin(ang) * 200;
      a.target = tg ? tg[i % Math.max(1, tg.length)] || t : t; a.tsn = a.target.sn;
      a.k = 0.22;                         // out
      a.step = 0.06 + i * 0.015;          // hang
      a.phase = 0; a.life = 3;
      a.dmg = st.damage; a.area = st.area; a.r = def.r * st.area;
      a.vy0 = st.speed;
      a.idx = w.vol;
      a.crit = i === lucky;
      a.done = !!shower;                  // a shooting star rises instead of fanning
      a.z = 0;
      a.n = 1 + st.pierce;                // foes it may strike on the way; its target ends it
    }
    return true;
  },

  /** Pay Day: a spray of coins at the crowd. A foe struck may shake a real coin loose. */
  payDay(w, st, p) {
    const def = w.def;
    const t = nearest(p.x, p.y, def.range * st.range);
    if (!t) return false;
    w.payN = (w.payN || 0) + 1;
    const jp = mech(w.ovl, 'jackpot');
    const jack = jp && w.payN % (jp.every || 7) === 0;
    const toss = mech(w.ovl, 'coinToss');
    const n = Math.max(1, Math.round(st.amount)) * (jack ? 3 : 1);
    const base = Math.atan2(t.y - p.y, t.x - p.x);
    for (let i = 0; i < n; i++) {
      const a = take(NK.COIN, w);
      if (!a) break;
      const ang = base + (G.rngRun() - 0.5) * def.spread * 2;
      const sp = st.speed * (0.8 + G.rngRun() * 0.4);
      a.x = p.x; a.y = p.y - 4; a.ox = a.x; a.oy = a.y;
      a.vx = Math.cos(ang) * sp; a.vy = Math.sin(ang) * sp;
      a.life = st.duration; a.dmg = st.damage; a.area = st.area; a.r = def.r * st.area;
      a.crit = jack; a.n = toss ? 1 : 0;
      a.tx = t.x + (G.rngRun() - 0.5) * 50; a.ty = t.y + (G.rngRun() - 0.5) * 50;
    }
    if (jack) spawnSpr('star3', p.x, p.y - 18, '#ffd166', 2);
    return true;
  },

  /** Tri Attack: a spinning, widening triangle; its corners burn, freeze and paralyse. */
  triAttack(w, st, p) {
    const def = w.def;
    const t = nearest(p.x, p.y, def.range * st.range);
    if (!t && !mech(w.ovl, 'trinity')) return false;
    const a = take(NK.TRI, w);
    if (!a) return true;
    a.x = p.x; a.y = p.y;
    const ang = t ? Math.atan2(t.y - p.y, t.x - p.x) : 0;
    a.vx = Math.cos(ang) * st.speed; a.vy = Math.sin(ang) * st.speed;
    a.life = st.duration; a.dmg = st.damage; a.area = st.area;
    a.r = (def.triR || 36) * st.area;       // the corners' reach at full size
    a.a = G.rngFx() * TAU;
    const tr = mech(w.ovl, 'trinity');
    if (tr) { a.n = 1; a.life = tr.t || 2; }
    return true;
  },

  /** Hyper Voice: rings of sound rolling out ahead, one after another. */
  hyperVoice(w, st, p) {
    const def = w.def;
    const t = nearest(p.x, p.y, def.range * st.range);
    if (!t) return false;
    const ang = Math.atan2(t.y - p.y, t.x - p.x);
    const up = mech(w.ovl, 'uproar');
    const loud = up ? 1 + Math.min(up.max || 5, w.uproarN || 0) * 0.12 : 1;
    if (up) w.uproarN = (w.uproarN || 0) + 1;
    const round = mech(w.ovl, 'round');
    const rings = (def.rings || 3) + lvSum(w, 'rings');
    for (let i = 0; i < rings; i++) {
      const a = take(NK.RING, w);
      if (!a) break;
      a.x = p.x; a.y = p.y; a.a = ang;
      a.t = -i * 0.16; a.life = 0.85;
      a.k = (def.range * st.range) * 0.65 * loud;   // how far it rolls
      a.n = round ? 1 : 0;
      a.z = (def.cone || 0.6) * loud;               // half-width of the cone
      // Round spreads the voice all the way round, and thinner for it.
      a.dmg = st.damage * (round ? round.dmg || 0.4 : 1); a.area = st.area;
      a.step = (def.confuse || 1.2) * loud * (round ? 0.6 : 1);
    }
    spawnSeq('fx_notes', p.x + Math.cos(ang) * 10, p.y - 16, { dur: 0.5, fps: 8, vy: -20 });
    return true;
  },
};

// --- Swift's stars ------------------------------------------------------------------------

function starStep(a, dt, p) {
  if (a.phase === 0) {
    if (a.done) {
      // Star Shower: up into the sky first.
      a.z = Math.min(90, a.z + 300 * dt);
      a.x += a.vx * 0.15 * dt; a.y += a.vy * 0.15 * dt;
    } else {
      a.vx *= 1 - 5 * dt; a.vy *= 1 - 5 * dt;
      a.x += a.vx * dt; a.y += a.vy * dt;
    }
    if (a.t >= a.k) { a.phase = 1; a.t = 0; }
    return;
  }
  if (a.phase === 1) {
    if (a.t >= a.step) { a.phase = 2; a.t = 0; a.hit2 = nextHitId(); }
    return;
  }
  // Converging: straight at the chosen foe, through it and on.
  const tg = a.target;
  if (tg && tg.alive && tg.sn === a.tsn && !a.fixed) { a.tx = tg.x; a.ty = tg.y; }
  const dx = a.tx - a.x, dy = a.ty - a.y, d = Math.hypot(dx, dy) || 1;
  if (!a.fixed) { a.ox = dx / d; a.oy = dy / d; }
  const sp = a.vy0 * dt;
  if (a.done) {
    // Star Shower: over its foe, then straight down onto it.
    const go = Math.min(sp, d);
    a.x += a.ox * go; a.y += a.oy * go;
    a.z = Math.max(0, a.z - 260 * dt);
    if (a.z <= 0 && !a.fixed) { a.fixed = true; a.life = a.t + 0.08; spawnSpr('star3', a.x, a.y - 4, '#c0d0ff', 1); }
  } else { a.x += a.ox * sp; a.y += a.oy * sp; }
  ovLook(a, dt, 0.05);
  each(a.x, a.y, a.r, (e) => {
    if (!a.on || (a.done && a.z > 6)) return;
    if (e !== tg && a.n <= 0) return;
    if (!once(a, e)) return;
    if (a.crit) critCtx.force = true;
    damageEnemy(e, a.dmg, a.ox * 20, a.oy * 20, true);
    critCtx.force = false;
    starLanded(a, e);
    if (e === tg) { converge(a); a.life = a.t + 0.06; } else a.n--;
  });
  if (!a.on) return;
  if (!a.done && d < sp + 2 && !a.fixed) { converge(a); a.life = a.t + 0.18; }
}

/** At the heart of the convergence: the star flies on straight, and maybe goes supernova. */
function converge(a) {
  if (a.fixed) return;
  a.fixed = true;
  {
    const nova = mech(a.ov, 'supernova') || mech(a.ov, 'starWell');
    if (nova && a.w && a.w.novaVol !== a.idx) {
      a.w.novaVol = a.idx;
      if (mech(a.ov, 'supernova')) {
        damageCircle(a.x, a.y, (nova.r || 40) * a.area, a.dmg * (nova.dmg || 1.2), nextHitId(), { knockback: 60 });
        spawnSpr('flash_burst', a.x, a.y - 4, '#ffe9a0', 1.3);
        ovProc(a, a.x, a.y, 1.2);
      } else {
        const wl = child(NK.WELL, a);
        if (wl) { wl.x = a.x; wl.y = a.y; wl.life = nova.t || 1.5; wl.r = (nova.r || 40) * a.area; wl.dmg = a.dmg * (nova.dmg || 0.12); wl.k = 0; }
      }
    }
  }
}

/** What a star does as it lands: Lucky Star's coin, Wish's wish. */
function starLanded(a, e) {
  if (a.crit) { dropCoin(e.x, e.y, 2); spawnSpr('shine', e.x, e.y - 6, '#ffd166', 1); }
  const wish = mech(a.ov, 'wish');
  if (!wish || !a.w) return;
  a.w.wishN = (a.w.wishN || 0) + 1;
  if (a.w.wishN % (wish.every || 10)) return;
  const p = G.player;
  if (!p) return;
  const r = (G.rngRun() * 4) | 0;
  if (r === 0) p.hp = Math.min(G.stats.maxHp, p.hp + G.stats.maxHp * 0.05);
  else if (r === 1) dropCoin(e.x, e.y, 5);
  else if (r === 2) { p.hasteMul = Math.max(p.hasteT > 0 ? p.hasteMul : 1, 1.3); p.hasteT = Math.max(p.hasteT, 2); }
  else dropXp(e.x, e.y, 3);
  spawnSpr('star3', p.x, p.y - 20, ['#7fe08a', '#ffd166', '#9adcff', '#c49aff'][r], 1.6);
}

function wellStep(a, dt) {
  each(a.x, a.y, a.r * 1.4, (e) => {
    if (!movable(e)) return;
    const dx = a.x - e.x, dy = a.y - e.y, d = Math.hypot(dx, dy) || 1;
    if (d > 4) { e.x += (dx / d) * 90 * dt; e.y += (dy / d) * 90 * dt; }
  });
  a.k -= dt;
  if (a.k <= 0) { a.k = 0.4; damageCircle(a.x, a.y, a.r, a.dmg, nextHitId(), { canCrit: false }); }
}

registerMech('starShield', {
  // Between volleys a few stars circle you; each one that catches an enemy shot throws it back as a star.
  tick(w, dt, p, cfg) {
    if (!p) return;
    let n = 0;
    for (let i = 0; i < CAP; i++) if (actors[i].on && actors[i].kind === NK.GUARD && actors[i].src === w.srcId) n++;
    if (n >= (cfg.n || 4)) return;
    const a = take(NK.GUARD, w);
    if (!a) return;
    a.a = (n / (cfg.n || 4)) * TAU; a.life = 99; a.dmg = w.resolved.damage; a.r = 6;
  },
});

function guardStep(a, dt, p) {
  if (!p || !a.w || !mech(a.w.ovl, 'starShield')) { free(a); return; }
  a.a += 3 * dt;
  a.x = p.x + Math.cos(a.a) * 26; a.y = p.y + Math.sin(a.a) * 20 - 4;
  for (let i = 0; i < projectiles.length; i++) {
    const q = projectiles[i];
    if (!q.alive || !q.hostile || q.r <= 0 || dist2(q.x, q.y, a.x, a.y) > 81) continue;
    q.life = q.maxLife; q.r = 0;
    spawnSpr('shine', a.x, a.y, '#ffffff', 1);
    const e = nearest(a.x, a.y, 220);
    if (!e) break;
    const s = child(NK.STAR, a);
    if (!s) break;
    s.x = a.x; s.y = a.y; s.target = e; s.tsn = e.sn; s.phase = 2; s.life = 1.5;
    s.vy0 = 380; s.dmg = a.dmg; s.area = 1; s.r = 5; s.hit2 = nextHitId();
    break;
  }
}

// --- Pay Day ------------------------------------------------------------------------------

function coinStep(a, dt) {
  if (a.n) {
    // Coin Toss: up in an arc to its spot, landing as part of a carpet of spinning coins.
    const k = Math.min(1, a.t / a.life);
    a.x = a.ox + (a.tx - a.ox) * k; a.y = a.oy + (a.ty - a.oy) * k;
    a.z = Math.sin(k * Math.PI) * 40;
    if (k >= 1 && !a.done) {
      a.done = true;
      const c = child(NK.CARPET, a);
      if (c) { c.x = a.x; c.y = a.y; c.life = 2; c.r = 10; c.dmg = a.dmg * 0.35; c.k = 0; }
    }
    return;
  }
  a.x += a.vx * dt; a.y += a.vy * dt;
  a.vx *= 1 - 0.8 * dt; a.vy *= 1 - 0.8 * dt;
  let hit = null;
  each(a.x, a.y, a.r, (e) => { if (!hit) hit = e; });
  if (!hit) return;
  if (a.crit) critCtx.force = true;
  damageEnemy(hit, a.dmg, a.vx * 0.1, a.vy * 0.1, true);
  critCtx.force = false;
  if (G.rngRun() < (a.def.dropChance || 0.12)) dropCoin(hit.x, hit.y, 1);
  spawnSpr('shine', a.x, a.y - 4, '#ffd166', 0.8);
  // Bribe: enough coins and it takes the money and leaves.
  const br = mech(a.ov, 'bribe');
  if (br && a.w && movable(hit)) {
    const i = mark(a.w, 'bribeL', hit, 6);
    if (i >= 0 && ++a.w.bribeL[i + 3] >= (br.n || 5)) {
      a.w.bribeL[i + 3] = -999;
      mark(a.w, 'bribedL', hit, br.t || 3);
      spawnSpr('star3', hit.x, hit.y - hit.r - 6, '#ffd166', 1.4);
    }
  }
  free(a);
}

registerMech('bribe', {
  tick(w, dt, p) {
    eachMarked(w, 'bribedL', (e) => {
      // Bribed: it turns its back on you and walks off with the money.
      e.stunT = Math.max(e.stunT, 0.05);
      if (!p) return;
      const dx = e.x - p.x, dy = e.y - p.y, d = Math.hypot(dx, dy) || 1;
      e.x += (dx / d) * e.speed * dt; e.y += (dy / d) * e.speed * dt;
      settle(e);
    });
  },
});

function carpetStep(a, dt) {
  a.k -= dt;
  if (a.k > 0) return;
  a.k = 0.35;
  damageCircle(a.x, a.y, a.r, a.dmg, nextHitId(), { canCrit: false });
}

// --- Tri Attack ---------------------------------------------------------------------------

const TRI_COL = ['#ff5a3a', '#7ac8ff', '#f8e038'];

function triStep(a, dt, p) {
  const grow = Math.min(1, a.t / 0.35);
  a.z = grow;                                   // the drawn size, 0..1
  a.a += 4.5 * dt;
  if (a.n && p) { a.x = p.x; a.y = p.y; }      // Trinity: around you
  else { a.x += a.vx * dt; a.y += a.vy * dt; }
  const R = a.r * (0.4 + 0.6 * grow);
  // The corners: burn, freeze and paralyse what they touch.
  for (let i = 0; i < 3; i++) {
    const ang = a.a + (i / 3) * TAU;
    const cx = a.x + Math.cos(ang) * R, cy = a.y + Math.sin(ang) * R * 0.8;
    each(cx, cy, 9 * vk(a.area), (e) => {
      if (!once(a, e, i)) return;
      if (i === 0) applyBurn(e, a.dmg * 0.5, 3);
      else if (i === 1) applyChill(e, 0.55, 2);
      else if (!e.boss && !e.legend) e.stunT = Math.max(e.stunT, 0.6);
      damageEnemy(e, a.dmg, 0, 0, true);
      // Status Overload: all three at once, and it erupts.
      const so = mech(a.ov, 'statusOverload');
      const j = so && a.w && e.alive && e.burnT > 0 && e.slowT > 0 && e.stunT > 0 ? mark(a.w, 'soL', e, 1.5) : -1;
      if (j >= 0 && !a.w.soL[j + 3]) {
        a.w.soL[j + 3] = 1;
        damageCircle(e.x, e.y, 22, a.dmg * (so.dmg || 2), nextHitId(), { knockback: 50 });
        spawnSpr('flash_burst', e.x, e.y - 4, '#ffffff', 1);
      }
    });
  }
  // The edges cut a few times a second.
  a.k -= dt;
  if (a.k <= 0) {
    a.k = 0.4;
    const id = nextHitId();
    for (let i = 0; i < 3; i++) {
      const a0 = a.a + (i / 3) * TAU, a1 = a.a + ((i + 1) / 3) * TAU;
      const x0 = a.x + Math.cos(a0) * R, y0 = a.y + Math.sin(a0) * R * 0.8;
      const x1 = a.x + Math.cos(a1) * R, y1 = a.y + Math.sin(a1) * R * 0.8;
      damageLine(x0, y0, Math.atan2(y1 - y0, x1 - x0), Math.hypot(x1 - x0, y1 - y0), 4, a.dmg * 0.25, id, { canCrit: false });
    }
  }
  // Prism: at full size, each corner fires its colour outward as a beam, once.
  const pr = mech(a.ov, 'prism');
  if (pr && !a.done && grow >= 1 && a.t > 0.5) {
    a.done = true;
    for (let i = 0; i < 3; i++) {
      const ang = a.a + (i / 3) * TAU;
      const cx = a.x + Math.cos(ang) * R, cy = a.y + Math.sin(ang) * R * 0.8;
      damageLine(cx, cy, ang, pr.len || 120, 6, a.dmg * (pr.dmg || 1), nextHitId(), {
        burn: i === 0 ? a.dmg * 0.5 : 0, slow: i === 1 ? 0.5 : 0, slowT: 2, stun: i === 2 ? 0.4 : 0,
      });
      a.pts.push(cx, cy, ang);
    }
    a.step = G.clock;
  }
}

// --- Hyper Voice ----------------------------------------------------------------------------

function ringStep(a, dt) {
  if (a.t < 0) return;
  const k = a.t / a.life;
  const r = 10 + a.k * k;
  a.r = r;
  each(a.x, a.y, r + 10, (e) => {
    const dx = e.x - a.x, dy = e.y - a.y, d = Math.hypot(dx, dy) || 1;
    if (Math.abs(d - r) > 9 || a.held.includes(e)) return;
    if (!a.n) {
      let da = Math.atan2(dy, dx) - a.a;
      while (da > Math.PI) da -= TAU;
      while (da < -Math.PI) da += TAU;
      if (Math.abs(da) > a.z) return;
    }
    if (!once(a, e)) return;
    damageEnemy(e, a.dmg, (dx / d) * 40, (dy / d) * 40, true);
    if (movable(e)) e.confuseT = Math.max(e.confuseT, a.step);
    // Perish Song: three rings within a few seconds, and the count begins.
    const ps = mech(a.ov, 'perishSong');
    if (ps && a.w) {
      const i = mark(a.w, 'perishL', e, 4);
      if (i >= 0 && ++a.w.perishL[i + 3] === (ps.n || 3)) {
        const c = child(NK.PERISH, a);
        if (c) { c.target = e; c.tsn = e.sn; c.life = ps.t || 3; c.dmg = a.dmg * (ps.dmg || 4); }
      }
    }
  });
}

function perishStep(a) {
  const e = a.target;
  if (!e || !e.alive || e.sn !== a.tsn) { free(a); return; }
  a.x = e.x; a.y = e.y - e.r - 14;
}

function perishEnd(a) {
  const e = a.target;
  if (!e || !e.alive || e.sn !== a.tsn) return;
  damageEnemy(e, e.boss || e.legend ? a.dmg * 0.4 : a.dmg, 0, 0, false);
  spawnSpr('death_flash', e.x, e.y - 4, '#c49aff', 1.2);
}

registerMech('uproar', {
  // Every cast it gets louder -- wider rings, longer confusion -- until something hits you.
  tick(w, dt, p) {
    if (!p) return;
    if (w.upHp !== undefined && p.hp < w.upHp - 0.5) w.uproarN = 0;
    w.upHp = p.hp;
  },
});

// --- Fury Swipes's overloads (a swarm) ----------------------------------------------------

registerMech('rampage', {
  // Swipe after swipe on the same foe whips the claws into a rampage: each three hits, harder.
  hit(e, dealt, rec, crit, cfg) {
    const w = rec.w;
    if (w.rmpE !== e || w.rmpSn !== e.sn) { w.rmpE = e; w.rmpSn = e.sn; w.rmpN = 0; }
    w.rmpN++;
    const stacks = Math.min(cfg.max || 4, (w.rmpN / (cfg.per || 3)) | 0);
    if (stacks > 0 && e.alive) damageEnemy(e, dealt * 0.15 * stacks, 0, 0, false);
    if (stacks > 2 && G.rngFx() < 0.2) spawnSpr('slash', e.x, e.y - 4, '#ff6a5a', 1, G.rngFx() * TAU);
  },
});

registerMech('slashTrail', {
  // The claws leave scratches hanging in the air behind them that cut whatever passes.
  shot(pr, rec, dt, cfg) {
    pr.mx -= dt;
    if (pr.mx > 0) return false;
    pr.mx = 0.16;
    let n = 0;
    for (let i = 0; i < CAP; i++) if (actors[i].on && actors[i].kind === NK.SCRATCH) n++;
    if (n >= 40) return false;
    const a = take(NK.SCRATCH, rec.w);
    if (!a) return false;
    a.x = pr.x; a.y = pr.y; a.a = Math.atan2(pr.vy, pr.vx) + Math.PI / 2;
    a.life = cfg.t || 1; a.r = 8; a.dmg = rec.w.resolved.damage * (cfg.dmg || 0.3); a.k = 0.1;
    return false;
  },
});

function scratchStep(a, dt) {
  a.k -= dt;
  if (a.k > 0) return;
  a.k = 0.3;
  damageCircle(a.x, a.y, a.r, a.dmg, nextHitId(), { canCrit: false });
}

registerMech('itch', {
  // Swiped foes itch: they stop to scratch, hurting themselves, and pass it to whoever they rub against.
  hit(e, dealt, rec, crit, cfg) { if (movable(e)) mark(rec.w, 'itchL', e, cfg.t || 3); },
  tick(w, dt, p, cfg, rec) {
    const bite = G.tick % 30 === 0;
    const dmg = w.resolved.damage * (cfg.dmg || 0.25) * 0.5;
    const spread = [];
    const prev = getDamageSource();
    if (rec) setDamageSource(rec.proc);
    eachMarked(w, 'itchL', (e) => {
      if (((G.clock * 2) | 0) & 1) e.stunT = Math.max(e.stunT, 0.05);    // scratching
      if (bite) damageOverTime(e, dmg);
      if (G.tick % 15 === 0 && e.alive) spread.push(e);
    });
    setDamageSource(prev);
    for (const e of spread) {
      each(e.x, e.y, e.r + 6, (o) => { if (o !== e && movable(o)) mark(w, 'itchL', o, cfg.t || 3); });
      spawnSpr('hash', e.x, e.y - e.r - 2, '#ffb0a0', 0.8);
    }
  },
});

// --- Giga Impact's overloads (a charge) ---------------------------------------------------

registerMech('recharge', {
  // All or nothing: a release that banked three stacks or more blows up where it ends, and
  // leaves you winded for a moment. (Its stacks are read back off its damage.)
  spawn(pr) { pr.mx = 1; },
  expire(pr, rec, cfg) {
    const w = rec.w;
    if (pr.mx !== 1 || pr.dmg < w.resolved.damage * (1 + (cfg.stacks || 3) * (w.def.chargeGain || 0.25)) - 0.5) return;
    const p = G.player;
    if (p) { p.hasteMul = 0.6; p.hasteT = Math.max(p.hasteT, 0.8); }
    damageCircle(pr.x, pr.y, (cfg.r || 34) * vk(pr.area), pr.dmg * (cfg.dmg || 0.8), nextHitId(), { knockback: 90 });
    spawnSeq('fx_giga', pr.x, pr.y - 6, { dur: 0.45, fps: 18, scale: 1.2 });
  },
});

registerMech('bodySlam', {
  // There is no projectile: you leap onto the nearest foe yourself and slam down, untouchable.
  // The charge it banked, read the tick before it is spent on the release.
  tick(w) { w.slamPre = w.charge || 0; },
  // The shot itself is spent at once, far off the field.
  spawn(pr) { pr.maxLife = 0.0001; pr.r = 0; pr.r0 = 0; pr.anim = null; pr.vis = 0.001; pr.x = pr.y = -99999; },
  fire(w, st, p, cfg) {
    if (!p) return;
    // Every release banks toward a leap -- a standing charge banks all it held -- and the leap
    // comes at four, hitting harder for every stack past that.
    w.slamBank = (w.slamBank || 0) + Math.max(1, w.slamPre || 0);
    if (w.slamBank < (cfg.bank || 4)) return;
    const n = 1 + w.slamBank * (w.def.chargeGain || 0.25) * 0.5;
    w.slamBank = 0;
    const e = nearest(p.x, p.y, cfg.range || 170);
    const a = take(NK.LEAP, w);
    if (!a) return;
    a.ox = p.x; a.oy = p.y;
    a.tx = e ? e.x : p.x + (p.dir ? 60 : -60); a.ty = e ? e.y : p.y;
    a.life = 0.3; a.dmg = st.damage * (cfg.dmg || 0.8) * n; a.r = (cfg.r || 40) * vk(st.area);
  },
});

function leapStep(a, dt, p) {
  if (!p) return;
  const k = Math.min(1, a.t / a.life);
  p.x = a.ox + (a.tx - a.ox) * k; p.y = a.oy + (a.ty - a.oy) * k;
  clampToBounds(p, G.bounds, p.r);
  p.iframes = Math.max(p.iframes, 0.1);
  a.x = p.x; a.y = p.y; a.z = Math.sin(k * Math.PI) * 26;
}

function leapEnd(a, p) {
  const pl = G.player;
  if (!pl) return;
  if (waterAtWorld(pl.x, pl.y)) { const l = nearestLand(pl.x, pl.y); pl.x = l.x; pl.y = l.y; }
  damageCircle(pl.x, pl.y, a.r, a.dmg, nextHitId(), { knockback: 140, stun: 0.4 });
  spawnSeq('fx_giga', pl.x, pl.y - 6, { dur: 0.45, fps: 18, scale: 1.3 });
  spawnSpr('land_dust', pl.x - 10, pl.y, '#d8d0c0', 1.3);
  spawnSpr('land_dust', pl.x + 10, pl.y, '#d8d0c0', 1.3);
}

registerMech('shockTrail', {
  // Each shot cracks the ground along its path, and the cracks erupt a moment later.
  shot(pr, rec, dt, cfg) {
    pr.mx -= dt;
    if (pr.mx > 0 || pr.z > 4) return false;
    pr.mx = 0.1;
    const a = take(NK.CRACK, rec.w);
    if (!a) return false;
    a.x = pr.x; a.y = pr.y; a.a = Math.atan2(pr.vy, pr.vx);
    a.life = cfg.delay || 0.5; a.r = 14; a.dmg = rec.w.resolved.damage * (cfg.dmg || 0.4);
    return false;
  },
});

function crackEnd(a) {
  damageCircle(a.x, a.y, a.r, a.dmg, nextHitId(), { knockback: 30, canCrit: false });
  spawnSpr('land_dust', a.x, a.y, '#d8d0c0', 0.8);
}

// --- Registration ---------------------------------------------------------------------------

registerMoves({
  step: {
    [NK.STAR]: starStep, [NK.WELL]: wellStep, [NK.GUARD]: guardStep, [NK.COIN]: coinStep,
    [NK.CARPET]: carpetStep, [NK.TRI]: triStep, [NK.RING]: ringStep, [NK.PERISH]: perishStep,
    [NK.SCRATCH]: scratchStep, [NK.LEAP]: leapStep,
  },
  end: { [NK.PERISH]: perishEnd, [NK.LEAP]: leapEnd, [NK.CRACK]: crackEnd },
});
