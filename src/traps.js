// L3 -- may import L0-L2.
//
// Floor traps.
//
// Mystery Dungeon's floors are not flat: half of what makes a dungeon a dungeon is the tile you
// did not look at. Until this existed the arena was an empty plane with enemies walking across
// it, and the only thing that could hurt you was something that chased you.
//
// Placement is lifted wholesale from props.js, which already solved every hard part: a
// hash-derived candidate per grid cell so walking away and back finds the same trap in the same
// place without storing anything, spawning tested against the camera rectangle so nothing is
// ever seen arriving, a live cap, and a set of consumed cells that can never be repopulated.
//
// Two rules make these fair rather than annoying:
//
//   1. They REVEAL as you approach. Invisible past REVEAL_R, fading in to solid by the time you
//      are on top of one -- about half a second of warning at walking pace. A trap that fires
//      with no warning at all is not difficulty, it is a dice roll on your health bar.
//   2. ENEMIES SET THEM OFF TOO. This is the point. A trap you have spotted stops being a tax
//      and becomes terrain you can fight over, and a crowd chasing you through a minefield is
//      the best thing that can happen to a run.

import { G } from './state.js';
import { hash2, dist2 } from './util.js';
import { enemies, cellRange, cellStart, cellItems, GW, nextHitId, setDamageSource } from './world.js';
import {
  damagePlayer, damageEnemy, damageCircle, damageOverTime, damageSourceId, statusPlayer, applyChill,
} from './combat.js';
import { waterAtWorld } from './terrain.js';

const CELL = 150;                 // one candidate per 150x150 world cell -- sparser than scenery
const RELEASE_RADIUS = 760;       // matches props: release well past the despawn ring
const MAX_LIVE = 16;
const VIEW_PAD = 40;

/** How close before a trap is visible at all, and how close before it fires. */
const REVEAL_R = 80;
const TRIGGER_R = 11;             // the tile is 24 across, so this is roughly its inner half

/** Base chance a cell holds a trap, before the floor multiplies it. */
const BASE_DENSITY = 0.055;

// --- The traps themselves ----------------------------------------------------
//
// Every effect is expressed through a seam that already exists -- damagePlayer for the player,
// damageEnemy / damageCircle / damageOverTime for the crowd, rootT for being held in place --
// so a trap can never become a second, divergent way to hurt something.

const TRAPS = {
  spike: {
    label: 'SPIKE TRAP', damage: 12, weight: 10,
    onPlayer: () => damagePlayer(12),
    onEnemy: (e) => damageEnemy(e, 40, 0, 0, false),
  },
  explosion: {
    label: 'EXPLOSION TRAP', damage: 18, radius: 54, weight: 8,
    onPlayer: (t) => { damagePlayer(18); blast(t); },
    onEnemy: (e, t) => { blast(t); },
  },
  slumber: {
    label: 'SLUMBER TRAP', weight: 8,
    // The player is rooted, not damaged. Standing still for most of a second with a crowd on
    // you is already the punishment, and stacking damage on top would just be a spike trap.
    onPlayer: () => { const p = G.player; if (p) p.rootT = Math.max(p.rootT, 0.9); },
    // An enemy that walks onto it falls asleep, the real thing: Sleep animation and all.
    onEnemy: (e) => { e.stunT = Math.max(e.stunT, 2.4); e.sleep = true; },
  },
  poison: {
    label: 'POISON TRAP', weight: 8,
    onPlayer: () => damagePlayer(9),
    onEnemy: (e) => damageOverTime(e, 30),
  },
  warp: {
    label: 'WARP TRAP', range: 260, weight: 6,
    onPlayer: () => warp(G.player),
    onEnemy: (e) => warp(e),
  },
  ppdown: {
    label: 'PP DOWN TRAP', weight: 6,
    // Both abilities go onto their full cooldown -- but only the ones that are ready. One that is
    // already cooling down keeps its remaining time: the trap takes away what you had, and an
    // ability you could not use anyway is not something it can take.
    onPlayer: () => {
      for (const a of G.abilities) {
        if (!a || a.cd > 0 || a.activeT > 0) continue;
        // The cooldown a cast right now would set, so upgrades taken since the last cast count.
        const full = (fx.abilityCooldown && fx.abilityCooldown(a)) || a.cdMax || a.def.cooldown;
        a.cdMax = full;
        a.cd = full;
      }
    },
    // No onEnemy: there is nothing for it to do to an enemy, so enemies walk over it and it stays
    // armed for the player. Letting the crowd spend it would quietly remove the hazard.
  },

  // --- The second set, from the unused tiles of items_2.png -----------------------------------
  summon: {
    label: 'SUMMON TRAP', weight: 5,
    // A pack of the stage's own Pokemon bursts in around you. Enemies cannot set it off.
    onPlayer: (t) => { if (fx.summon) fx.summon(t.x, t.y); },
  },
  pitfall: {
    label: 'PITFALL TRAP', weight: 3,
    // Straight down to the next floor -- or, where there is none, a nasty fall.
    onPlayer: () => { if (!(fx.pitfall && fx.pitfall())) damagePlayer(14); },
    // An enemy that steps on it is simply gone: it fell, and leaves nothing behind.
    onEnemy: (e) => { e.alive = false; },
  },
  gust: {
    label: 'GUST TRAP', weight: 6, radius: 120,
    onPlayer: (t) => { gust(t); shove(G.player, t); },
    onEnemy: (e, t) => gust(t),
  },
  seal: {
    label: 'SEAL TRAP', weight: 5,
    // One of your weapons, jammed for eight seconds.
    onPlayer: () => {
      const free = G.weapons.filter((w) => !(w.sealT > 0));
      if (!free.length) return;
      const w = free[(G.rngRun() * free.length) | 0];
      w.sealT = 8;
      if (fx.sealed) fx.sealed(w);
    },
  },
  wonder: {
    label: 'WONDER TILE', weight: 4, good: true,
    // The one tile worth stepping on: you are cleansed, healed a little, and lifted for a while.
    onPlayer: () => { if (fx.wonder) fx.wonder(); },
  },
  random: {
    label: '? TRAP', weight: 5,
    // Becomes some other tile, the Wonder Tile included, at the moment it goes off.
    onPlayer: (t) => {
      t.kind = rollKind(G.rngRun(), (k) => k !== 'random');
      TRAPS[t.kind].onPlayer(t);
    },
    onEnemy: (e, t) => {
      t.kind = rollKind(G.rngRun(), (k) => k !== 'random' && !!TRAPS[k].onEnemy);
      TRAPS[t.kind].onEnemy(e, t);
    },
  },
  slow: {
    label: 'SLOW TRAP', weight: 6,
    onPlayer: () => statusPlayer('chill', 3),
    onEnemy: (e) => applyChill(e, 0.5, 4),
  },
};

/** How much more (or less) often each tile turns up on a given stage. */
const STAGE_WEIGHT = {
  grass: { wonder: 1.4, summon: 1.3 },
  cave: { pitfall: 1.6, explosion: 1.2, gust: 0.6 },
  beach: { gust: 1.6, slow: 1.3, summon: 0.8 },
};

/** A tile kind for a 0..1 roll, by weight, among the kinds `ok` allows. */
function rollKind(roll, ok) {
  const sw = (G.stage && STAGE_WEIGHT[G.stage.id]) || {};
  let total = 0;
  for (const k of TRAP_KEYS) if (!ok || ok(k)) total += TRAPS[k].weight * (sw[k] || 1);
  let r = roll * total;
  for (const k of TRAP_KEYS) {
    if (ok && !ok(k)) continue;
    r -= TRAPS[k].weight * (sw[k] || 1);
    if (r <= 0) return k;
  }
  return 'spike';
}

/** The gust's blast: everything near the tile is thrown away from it. */
function gust(t) {
  const r = TRAPS.gust.radius, r2 = r * r;
  for (let i = 0; i < enemies.length; i++) {
    const e = enemies[i];
    if (!e.alive || e.prop || e.boss) continue;
    const dx = e.x - t.x, dy = e.y - t.y, d2 = dx * dx + dy * dy;
    if (d2 > r2) continue;
    const d = Math.sqrt(d2) || 1;
    const k = 340 * (1 - e.knockResist);
    e.knockX += (dx / d) * k;
    e.knockY += (dy / d) * k;
  }
}

/** Blow the player a stride away from the tile, onto dry ground inside the arena. */
function shove(p, t) {
  if (!p) return;
  const a = G.rngRun() * Math.PI * 2;
  const b = G.bounds;
  for (let k = 0; k < 8; k++) {
    let x = p.x + Math.cos(a + k * 0.8) * 150, y = p.y + Math.sin(a + k * 0.8) * 150;
    if (b) { x = Math.max(b.minX + 24, Math.min(b.maxX - 24, x)); y = Math.max(b.minY + 24, Math.min(b.maxY - 24, y)); }
    if (waterAtWorld(x, y)) continue;
    p.x = x; p.y = y;
    p.iframes = Math.max(p.iframes, 0.4);
    return;
  }
}

export const TRAP_KEYS = Object.keys(TRAPS);
export const trapDef = (kind) => TRAPS[kind];

/** The explosion trap's area hit. Enemies only -- the player's share is applied by onPlayer. */
function blast(t) {
  damageCircle(t.x, t.y, TRAPS.explosion.radius, 55, nextHitId(), { knockback: 120 });
}

/** Throw whatever stepped on it somewhere else on the floor, inside the arena. */
function warp(ent) {
  if (!ent) return;
  const b = G.bounds;
  const a = G.rngRun() * Math.PI * 2;
  const d = 150 + G.rngRun() * TRAPS.warp.range;
  let x = ent.x + Math.cos(a) * d;
  let y = ent.y + Math.sin(a) * d;
  if (b) {
    x = Math.max(b.minX + 24, Math.min(b.maxX - 24, x));
    y = Math.max(b.minY + 24, Math.min(b.maxY - 24, y));
  }
  ent.x = x; ent.y = y;
  // A warped player keeps their velocity but not their knockback, and gets a breath of mercy so
  // they cannot be dropped straight into the middle of a pack and immediately chewed.
  if (ent === G.player) ent.iframes = Math.max(ent.iframes, 0.8);
}

// --- State -------------------------------------------------------------------

/** Cell key -> live trap record. At most MAX_LIVE of them. */
const active = new Map();

/** Cells whose trap has already gone off. Never repopulated, exactly like a cleared prop. */
const sprung = new Set();

let TRAP_SRC = 0;

export function resetTraps() {
  active.clear();
  sprung.clear();
}

export function trapCount() { return active.size; }

/** For the probes: lay a trap of `kind` at (x, y) and set it off, by the player or by an enemy. */
export function debugSpring(kind, x, y, byPlayer = true) {
  const key = -1 - (sprung.size + active.size);
  const t = { x, y, kind, reveal: 1 };
  active.set(key, t);
  fire(t, key, byPlayer);
  return t.kind;
}

/** The live traps, for the renderer. */
export const liveTraps = () => active.values();

/** Density rises with depth, so a fourth floor is visibly worse ground than a first. */
const density = () => BASE_DENSITY * (1 + 0.35 * ((G.floor || 1) - 1));

export function updateTraps(dt) {
  const p = G.player;
  if (!p || !G.bounds) return;

  // Release first, so a trap left behind frees its slot.
  for (const [key, t] of active) {
    if (dist2(t.x, t.y, p.x, p.y) > RELEASE_RADIUS * RELEASE_RADIUS) active.delete(key);
  }

  place(p);

  // Reveal, then trigger. A trap the player has not been shown yet can still be set off by an
  // enemy, which is how you find out it was there.
  for (const [key, t] of active) {
    const d2 = dist2(t.x, t.y, p.x, p.y);
    // A Luminous Orb lights the whole floor: every trap shows, wherever it is. A Wonder Tile
    // glints from twice as far: it is the one you want to find.
    const rr = TRAPS[t.kind].good ? REVEAL_R * 2 : REVEAL_R;
    const target = G.lumFloor || d2 < rr * rr ? 1 : 0;
    // Eased rather than snapped, so a trap fades up as you close instead of popping.
    t.reveal += (target - t.reveal) * Math.min(1, dt * 7);

    if (d2 < TRIGGER_R * TRIGGER_R) { fire(t, key, true); continue; }
    // Only a trap that does something to an enemy can be set off by one.
    if (TRAPS[t.kind].onEnemy && triggerByEnemy(t)) fire(t, key, false);
  }
}

/** The first live enemy standing on this trap, if any. */
function triggerByEnemy(t) {
  const range = cellRange(t.x, t.y, TRIGGER_R + 8);
  if (!range) return null;
  for (let gy = range.y0; gy <= range.y1; gy++) {
    const rowBase = gy * GW;
    for (let gx = range.x0; gx <= range.x1; gx++) {
      const c = rowBase + gx;
      const end = cellStart[c + 1];
      for (let k = cellStart[c]; k < end; k++) {
        const e = enemies[cellItems[k]];
        // Scenery does not walk, and a boss shrugging off a spike tile reads badly either way.
        if (!e.alive || e.prop || e.boss) continue;
        const rr = TRIGGER_R + e.r;
        if (dist2(t.x, t.y, e.x, e.y) <= rr * rr) return e;
      }
    }
  }
  return null;
}

function fire(t, key, byPlayer) {
  const def = TRAPS[t.kind];
  active.delete(key);
  sprung.add(key);
  // Trap damage to the crowd is a real contribution -- it is ground the player chose to fight
  // over -- so it gets its own line in the breakdown rather than vanishing into "other".
  setDamageSource(TRAP_SRC || (TRAP_SRC = damageSourceId('traps', 'Traps')));
  if (byPlayer) {
    def.onPlayer(t);
  } else {
    const e = triggerByEnemy(t);
    if (e) def.onEnemy(e, t);
  }
  setDamageSource(0);
  if (fx.sprung) fx.sprung(t, byPlayer);
}

/**
 * Set by main.js so a sprung trap can make a noise and throw sparks without importing render, and
 * so PP Down can read an ability's resolved cooldown without importing abilities.js (same layer).
 */
export const fx = {
  sprung: null, abilityCooldown: null,
  summon: null,  // (x, y) -- a pack bursts in
  pitfall: null, // () -> bool: down to the next floor
  wonder: null,  // () -- cleanse, heal, lift
  sealed: null,  // (weapon) -- jammed
};

function place(p) {
  if (active.size >= MAX_LIVE) return;
  const b = G.bounds;
  const dens = density();

  const vx0 = G.cam.x - 320 - VIEW_PAD, vx1 = G.cam.x + 320 + VIEW_PAD;
  const vy0 = G.cam.y - 180 - VIEW_PAD, vy1 = G.cam.y + 180 + VIEW_PAD;

  const cx = Math.floor(p.x / CELL);
  const cy = Math.floor(p.y / CELL);
  const reach = Math.ceil(RELEASE_RADIUS / CELL);

  for (let gy = cy - reach; gy <= cy + reach; gy++) {
    for (let gx = cx - reach; gx <= cx + reach; gx++) {
      // Offset from the prop hash so traps and scenery do not pick the same cells.
      const key = gx * 100003 + gy + 7919;
      if (active.has(key) || sprung.has(key)) continue;
      if (hash2(gx + 311, gy + 311) > dens) continue;

      const x = gx * CELL + hash2(gx + 41, gy) * (CELL - 32) + 16;
      const y = gy * CELL + hash2(gx, gy + 41) * (CELL - 32) + 16;

      if (dist2(x, y, p.x, p.y) > RELEASE_RADIUS * RELEASE_RADIUS) continue;
      if (x > vx0 && x < vx1 && y > vy0 && y < vy1) continue;       // never seen arriving
      if (b && (x < b.minX + 32 || x > b.maxX - 32 || y < b.minY + 32 || y > b.maxY - 32)) continue;
      if (waterAtWorld(x, y)) continue;                              // no traps under the water

      const kind = rollKind(hash2(gx + 977, gy + 977), null);
      active.set(key, { x, y, kind, reveal: 0 });
      if (active.size >= MAX_LIVE) return;
    }
  }
}
