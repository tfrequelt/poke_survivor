// L3 -- may import L0-L2 and, same-layer, pickups.js.
//
// The Explorer's Bag: the single-use items you carry and use when you choose, and the timed buffs
// some of them (and a few other things -- Wonder Tiles, Fortune totems) put on you.
//
// A buff is a set of stat modifiers added under its own source and taken back by removeMods when
// it runs out, so nothing else in the stat pipeline has to know buffs exist.

import { G } from './state.js';
import { TAU, dist2, clampToBounds } from './util.js';
import { enemies, spawn, nextHitId, setDamageSource, getDamageSource } from './world.js';
import { damageSourceId } from './combat.js';
import { addMods, removeMods, ensureStats } from './stats.js';
import { waterAtWorld, nearestLand } from './terrain.js';
import { spriteBase, spriteDirs } from './sprites.js';
import { ROLE } from './fx.js';
import { MAX_FLOOR } from './floors.js';
import { BAG_ITEMS, BAG_BY_ID, BAG_SLOTS } from './data/bagitems.js';

/** Effects and the few actions that belong to main.js, plugged in at boot. */
export const bagFx = {
  burst: null,    // (x, y, n, color)
  ring: null,     // (x, y, r, color, life)
  banner: null,   // (text, sub)
  sfx: null,      // (id)
  descend: null,  // () -> bool: take the next floor now
  revived: null,  // (p) -- the Reviver Seed just saved you
  warped: null,   // (x0, y0, x1, y1)
  used: null,     // (id) -- for the success tallies
};

let M_STRAIGHT = 0;
let ROCK_SPR = -1, ROCK_DIRS = 2;
let ROCK_SRC = 0;

/** At boot, after the atlas and the weapons: the rock sprite and the straight motion. */
export function initBag(motionOf) {
  M_STRAIGHT = motionOf('straight');
  ROCK_SPR = spriteBase('proj_rock', 'rock');
  ROCK_DIRS = spriteDirs('proj_rock', 'rock');
  ROCK_SRC = damageSourceId('i:gravelerock', 'Gravelerock');
}

/** A fresh, empty bag for a new run. */
export function resetBag(slots = BAG_SLOTS) {
  G.bag = new Array(slots).fill(null);
  G.buffs = [];
  G.lumFloor = false;
}

/** Put an item in the first free slot. False if the bag is full. */
export function bagAdd(id) {
  const i = G.bag.indexOf(null);
  if (i < 0) return false;
  G.bag[i] = id;
  return true;
}

export const bagFull = () => G.bag.indexOf(null) < 0;

/** A bag item at random, by weight. The Escape Orb only while there is a floor below to escape to. */
export function rollBagItem() {
  const ok = (b) => b.id !== 'escape_orb' || (!G.secret && G.floor < MAX_FLOOR);
  let total = 0;
  for (const b of BAG_ITEMS) if (ok(b)) total += b.weight;
  let r = G.rngRun() * total;
  for (const b of BAG_ITEMS) {
    if (!ok(b)) continue;
    r -= b.weight;
    if (r <= 0) return b.id;
  }
  return 'oran_berry';
}

/**
 * Use the item in slot `i`. Returns true if it was spent. A Reviver Seed is never used by hand,
 * and an item that cannot do anything right now (an Escape Orb with no floor below) stays put.
 */
export function bagUse(i) {
  const id = G.bag[i];
  if (!id) return false;
  const def = BAG_BY_ID[id];
  if (def.auto) {
    if (bagFx.banner) bagFx.banner('REVIVER SEED', 'IT WORKS ON ITS OWN WHEN YOU FAINT');
    return false;
  }
  const p = G.player;
  if (!p || !EFFECT[id](p)) return false;
  G.bag[i] = null;
  if (bagFx.sfx) bagFx.sfx('evolve');
  if (bagFx.banner) bagFx.banner(def.name.toUpperCase(), def.desc.toUpperCase().slice(0, 60));
  if (bagFx.ring) bagFx.ring(p.x, p.y, 40, def.color, 0.35);
  if (bagFx.used) bagFx.used(id);
  return true;
}

/** Called by player.js the moment you would faint. True if a Reviver Seed in the bag saved you. */
export function bagRevive(p) {
  const i = G.bag ? G.bag.indexOf('reviver_seed') : -1;
  if (i < 0) return false;
  G.bag[i] = null;
  ensureStats();
  p.hp = Math.max(1, Math.round(G.stats.maxHp * 0.5));
  p.iframes = Math.max(p.iframes, 2.5);
  if (bagFx.revived) bagFx.revived(p);
  if (bagFx.used) bagFx.used('reviver_seed');
  return true;
}

// --- Buffs ---------------------------------------------------------------------

/**
 * Put a timed buff on: `mods` for `secs`. The same id again refreshes it rather than stacking.
 * `curse` marks it as bad news, for the colour it is drawn in.
 */
export function addBuff(id, name, secs, mods, color, curse = false, icon = '') {
  const source = `buff:${id}`;
  removeMods(source);
  addMods(mods, source);
  let b = G.buffs.find((x) => x.id === id);
  if (!b) { b = { id, name, t: 0, max: 0, color, curse, icon, source }; G.buffs.push(b); }
  b.t = b.max = secs;
}

export function updateBuffs(dt) {
  for (let i = G.buffs.length - 1; i >= 0; i--) {
    const b = G.buffs[i];
    b.t -= dt;
    if (b.t <= 0) {
      removeMods(b.source);
      G.buffs.splice(i, 1);
    }
  }
}

// --- What each item does -----------------------------------------------------------

/** Live, non-scenery enemies near the player: within `r`, or on screen when r is 0. */
function eachNear(p, r, fn) {
  const r2 = r * r;
  for (let k = 0; k < enemies.length; k++) {
    const e = enemies[k];
    if (!e.alive || e.prop || e.legend) continue;
    if (r > 0) { if (dist2(e.x, e.y, p.x, p.y) > r2) continue; }
    else if (Math.abs(e.x - p.x) > 330 || Math.abs(e.y - p.y) > 190) continue;
    fn(e);
  }
}

const EFFECT = {
  oran_berry(p) {
    ensureStats();
    p.hp = Math.min(G.stats.maxHp, p.hp + Math.round(G.stats.maxHp * 0.5));
    if (bagFx.burst) bagFx.burst(p.x, p.y, 18, '#7ac8ff');
    return true;
  },

  sleep_seed(p) {
    eachNear(p, 240, (e) => {
      if (e.boss) { e.stunT = Math.max(e.stunT, 1.5); return; }
      e.stunT = Math.max(e.stunT, 6);
      e.sleep = true;
    });
    if (bagFx.ring) bagFx.ring(p.x, p.y, 240, '#9a9aff', 0.6);
    return true;
  },

  gravelerock(p) {
    const prev = getDamageSource();
    setDamageSource(ROCK_SRC);
    const dmg = (24 + G.level * 2) * (G.stats ? G.stats.power : 1);
    const hitId = nextHitId();
    for (let i = 0; i < 16; i++) {
      const pr = spawn('projectiles');
      if (!pr) break;
      const a = (i / 16) * TAU;
      pr.x = pr.ox = p.x; pr.y = pr.oy = p.y;
      pr.vx = Math.cos(a) * 270; pr.vy = Math.sin(a) * 270;
      pr.angle = a;
      pr.r = pr.r0 = 6;
      pr.dmg = dmg; pr.pierce = 3;
      pr.life = 0; pr.maxLife = 0.9;
      pr.motion = M_STRAIGHT;
      pr.homingTurn = 0; pr.targetIdx = -1;
      pr.sprBase = ROCK_SPR; pr.nd = ROCK_DIRS;
      pr.knockback = 60; pr.weapon = -1; pr.area = 1; pr.hitId = hitId;
      pr.trail = 10; pr.trailColor = '#c8c0ad'; pr.pulse = 0;
      pr.impact = 6; pr.impactColor = '#c8c0ad';
      pr.spin = 8; pr.amp = 0; pr.freq = 0; pr.returning = false; pr.crit = false;
      pr.orbitA = 0; pr.orbitR = 0; pr.z = 0;
      pr.bounces = 0; pr.fuse = 0; pr.emitT = 0; pr.gen = ROLE.SHARD; pr.payload = 0; pr.t = 0;
      pr.burn = 0; pr.burnT = 3; pr.slow = 0;
    }
    setDamageSource(prev);
    return true;
  },

  warp_seed(p) {
    const b = G.bounds;
    const x0 = p.x, y0 = p.y;
    for (let k = 0; k < 24; k++) {
      const a = G.rngRun() * TAU;
      const d = 260 + G.rngRun() * 160;
      const pt = { x: p.x + Math.cos(a) * d, y: p.y + Math.sin(a) * d };
      if (b) clampToBounds(pt, b, 40);
      if (dist2(pt.x, pt.y, x0, y0) < 200 * 200) continue;
      if (waterAtWorld(pt.x, pt.y)) { const l = nearestLand(pt.x, pt.y); pt.x = l.x; pt.y = l.y; }
      p.x = pt.x; p.y = pt.y;
      p.iframes = Math.max(p.iframes, 1.2);
      if (bagFx.warped) bagFx.warped(x0, y0, p.x, p.y);
      return true;
    }
    return false;
  },

  totter_seed(p) {
    eachNear(p, 0, (e) => { e.confuseT = Math.max(e.confuseT, e.boss ? 2 : 6); });
    if (bagFx.ring) bagFx.ring(p.x, p.y, 120, '#ff9ad8', 0.5);
    return true;
  },

  petrify_orb(p) {
    eachNear(p, 0, (e) => {
      e.stunT = Math.max(e.stunT, e.boss ? 1.5 : 5);
      e.sleep = false;
      e.markT = Math.max(e.markT, 5);
      e.markMul = Math.max(e.markMul, 0.5);
    });
    if (bagFx.ring) bagFx.ring(p.x, p.y, 200, '#b0b0bc', 0.6);
    return true;
  },

  all_power_orb() {
    addBuff('all_power', 'ALL-POWER', 20, [
      { stat: 'power', op: 'inc', value: 0.4 },
      { stat: 'attackSpeed', op: 'inc', value: 0.3 },
      { stat: 'moveSpeed', op: 'inc', value: 0.15 },
    ], '#ff8a5a', false, 'bag_allpower');
    return true;
  },

  max_elixir() {
    for (const a of G.abilities) if (a) a.cd = 0;
    addBuff('max_elixir', 'MAX ELIXIR', 15, [{ stat: 'cooldown', op: 'inc', value: -0.3 }], '#ffd166', false, 'bag_maxelixir');
    return true;
  },

  luminous_orb() {
    G.lumFloor = true;
    return true;
  },

  joy_seed() {
    G.pendingLevelUps++;
    return true;
  },

  escape_orb() {
    if (G.secret || G.floor >= MAX_FLOOR || G.won || G.runOver) {
      if (bagFx.banner) bagFx.banner('ESCAPE ORB', 'THERE IS NO WAY DOWN FROM HERE');
      return false;
    }
    return bagFx.descend ? bagFx.descend() : false;
  },

  // Never used by hand -- see bagRevive.
  reviver_seed() { return false; },
};
