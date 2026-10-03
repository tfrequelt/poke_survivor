// L3 -- may import L0-L2.
//
// XP orbs, coins and the magnet. Orbs are the single most numerous entity late in a run, so this
// file cares about entity count: orbs merge into higher tiers rather than accumulating forever.

import { G } from './state.js';
import { dist2, clamp } from './util.js';
import { orbs, coins, items, spawn, despawn, CAP } from './world.js';
import { spriteBase } from './sprites.js';
import { ensureStats } from './stats.js';

// Tier thresholds, and the SIZE each tier draws at.
//
// The thresholds are the whole point, and they have been wrong twice. They started at 0/12/60
// while enemies dropped 1-5, so every orb was tier 0 and they all looked identical. Four tiers
// at 0/3/8/25 fixed that but still had two colours carrying nearly every orb, because the
// roster drops 1-9 and only two tiers fall inside that.
//
// Ten tiers now, with SEVEN of them inside the 1-9 range where the overwhelming majority of
// drops land -- so a Gigalith (9) looks nothing like a Rattata (1) -- and three more above it
// for elites (x12), boss orbs and the merged orbs the cap produces.
const TIERS = [
  { min: 0, palette: 'xp_small', scale: 1.00 },
  { min: 2, palette: 'xp_leaf', scale: 1.10 },
  { min: 3, palette: 'xp_aqua', scale: 1.20 },
  { min: 4, palette: 'xp_mid', scale: 1.30 },
  { min: 5, palette: 'xp_violet', scale: 1.40 },
  { min: 6, palette: 'xp_rose', scale: 1.50 },
  { min: 8, palette: 'xp_ember', scale: 1.65 },
  { min: 12, palette: 'xp_big', scale: 1.85 },
  { min: 25, palette: 'xp_huge', scale: 2.10 },
  { min: 60, palette: 'xp_flare', scale: 2.40 },
];

let TIER_SPR = TIERS.map(() => 0);
let COIN_SPR = 0;

export function initPickupSprites() {
  TIER_SPR = TIERS.map((t) => spriteBase('orb', t.palette));
  COIN_SPR = spriteBase('coin', 'gold');
}

export const tierScale = (t) => TIERS[t].scale;

/** How many orb tiers there are, so the renderer can normalise against it rather than guess. */
export const TIER_COUNT = TIERS.length;

function tierOf(v) {
  for (let i = TIERS.length - 1; i >= 0; i--) if (v >= TIERS[i].min) return i;
  return 0;
}

// Orbs auto-collect after this long so a forgotten carpet of XP cannot tank the frame rate.
const ORB_MAX_AGE = 90;
const PULL_SPEED = 200;
const PULL_MAX = 450;

export function dropXp(x, y, value) {
  if (value <= 0) return;

  // At the cap, fold this orb's value into the oldest one instead of refusing the drop.
  if (orbs.length >= CAP.orbs) {
    let oldest = 0;
    for (let i = 1; i < orbs.length; i++) if (orbs[i].age > orbs[oldest].age) oldest = i;
    const o = orbs[oldest];
    o.value += value;
    o.tier = tierOf(o.value);
    o.sprId = TIER_SPR[o.tier];
    return;
  }

  const o = spawn('orbs');
  if (!o) return;
  o.x = x; o.y = y;
  o.vx = (G.rngFx() - 0.5) * 40;
  o.vy = (G.rngFx() - 0.5) * 40;
  o.value = value;
  o.tier = tierOf(value);
  o.sprId = TIER_SPR[o.tier];
  o.age = 0;
  o.pulling = false;
}

export function dropCoin(x, y, value) {
  const c = spawn('coins');
  if (!c) return;
  c.x = x; c.y = y;
  c.vx = (G.rngFx() - 0.5) * 50;
  c.vy = (G.rngFx() - 0.5) * 50;
  c.value = value;
  c.sprId = COIN_SPR;
  c.age = 0;
  c.pulling = false;
}

/** Pull every orb on the field to the player -- the magnet pickup, and the end-of-run sweep. */
export function magnetAll() {
  for (const o of orbs) o.pulling = true;
  for (const c of coins) c.pulling = true;
}

export function updatePickups(dt, onXp, onCoin) {
  const p = G.player;
  if (!p) return;
  const s = ensureStats();
  const magnet = s.magnet;
  const magnet2 = magnet * magnet;
  const grab2 = (p.r + 4) * (p.r + 4);

  for (let i = orbs.length - 1; i >= 0; i--) {
    const o = orbs[i];
    o.age += dt;

    const d2 = dist2(o.x, o.y, p.x, p.y);
    if (!o.pulling && (d2 <= magnet2 || o.age >= ORB_MAX_AGE)) o.pulling = true;

    if (o.pulling) {
      const d = Math.sqrt(d2) || 1;
      // Accelerate as it closes, so collection feels like a snap rather than a drift.
      const speed = clamp(PULL_SPEED + (1 - d / (magnet + 1)) * PULL_MAX, PULL_SPEED, PULL_MAX);
      o.x += ((p.x - o.x) / d) * speed * dt;
      o.y += ((p.y - o.y) / d) * speed * dt;
    } else {
      o.x += o.vx * dt;
      o.y += o.vy * dt;
      o.vx *= 0.88;
      o.vy *= 0.88;
    }

    if (d2 <= grab2) {
      onXp(o.value);
      despawn('orbs', orbs, i);
    }
  }

  for (let i = coins.length - 1; i >= 0; i--) {
    const c = coins[i];
    c.age += dt;
    const d2 = dist2(c.x, c.y, p.x, p.y);
    if (!c.pulling && (d2 <= magnet2 || c.age >= ORB_MAX_AGE)) c.pulling = true;

    if (c.pulling) {
      const d = Math.sqrt(d2) || 1;
      const speed = clamp(PULL_SPEED + (1 - d / (magnet + 1)) * PULL_MAX, PULL_SPEED, PULL_MAX);
      c.x += ((p.x - c.x) / d) * speed * dt;
      c.y += ((p.y - c.y) / d) * speed * dt;
    } else {
      c.x += c.vx * dt;
      c.y += c.vy * dt;
      c.vx *= 0.88;
      c.vy *= 0.88;
    }

    if (d2 <= grab2) {
      onCoin(c.value);
      despawn('coins', coins, i);
    }
  }
}

// --- Item pickups -----------------------------------------------------------
//
// Magnet / berry / bomb / elixir / present. These share the orb's collection loop but are walked
// over rather than vacuumed, so the player has to choose to go and get them.

/**
 * Each pickup names a SHAPE OF ITS OWN rather than reusing one already in the atlas: overriding
 * `orb` with a ripped sprite would repaint every XP orb on the field too. `fallback` is the drawn
 * shape used until an image is supplied, so a missing or mistyped crop degrades to a plain orb
 * rather than failing the boot.
 *
 * KEY ORDER IS LOAD-BEARING. dropPickup stores KIND_KEYS.indexOf(kind) as a number on the live
 * entity, so a key may be renamed in place or appended at the end, but moving one renumbers every
 * pickup already lying on the ground.
 */
export const PICKUP_KINDS = {
  magnet:  { shape: 'item_orb', fallback: 'orb', palette: 'xp_mid', label: 'MAGNET' },
  berry:   { shape: 'item_berry', fallback: 'orb', palette: 'crab', label: 'SITRUS BERRY' },
  bomb:    { shape: 'item_voltorb', fallback: 'orb', palette: 'fire', label: 'BLAST SEED' },
  // Was "chest" and drawn as a gold crate. It is the only pickup that grants a level-up, so it
  // now looks like what it does.
  elixir:  { shape: 'item_elixir', fallback: 'orb', palette: 'gold', label: 'ELIXIR' },
  present: { shape: 'icon_gift', fallback: 'orb', palette: 'gift', label: 'PRESENT' },
  // A legendary's relic. Which one is carried by the item's sprite, set when it is dropped --
  // the pool's item shape has no other field to put it in, and nine kinds for nine relics would
  // be nine copies of the same behaviour.
  relic:   { shape: 'relic_articuno', fallback: 'orb', palette: 'gold', label: 'RELIC' },
};

const KIND_KEYS = Object.keys(PICKUP_KINDS);
let KIND_SPR = {};

/**
 * (shape, palette) pairs the XP orbs need in the atlas.
 *
 * Derived from TIERS rather than listed again at the call site: main.js used to hold its own
 * copy of the palette names, so adding a tier registered nine sprites and asked for ten.
 */
export function orbSpritePairs() {
  return TIERS.map((t) => ['orb', t.palette]);
}

/** (shape, palette, fallbackShape) triples the item pickups need in the atlas. */
export function itemSpritePairs() {
  return KIND_KEYS.map((k) => [PICKUP_KINDS[k].shape, PICKUP_KINDS[k].palette, PICKUP_KINDS[k].fallback]);
}

export function initItemSprites() {
  for (const k of KIND_KEYS) KIND_SPR[k] = spriteBase(PICKUP_KINDS[k].shape, PICKUP_KINDS[k].palette);
}

/** Hooks assigned by main.js so collecting an item can reach the systems that apply it. */
export const itemEffects = {
  magnet: null, berry: null, bomb: null, elixir: null, present: null, relic: null, onCollect: null,
};

export function dropPickup(x, y, kind) {
  const it = spawn('items');
  if (!it) return null;
  it.x = x; it.y = y;
  it.vx = (G.rngFx() - 0.5) * 30;
  it.vy = (G.rngFx() - 0.5) * 30;
  it.kind = KIND_KEYS.indexOf(kind);
  it.sprId = KIND_SPR[kind];
  it.age = 0;
  it.bob = G.rngFx() * 6;
  return it;
}

/** Weighted random drop -- what a destroyed crate or a lucky kill yields. */
export function dropRandomPickup(x, y) {
  const r = G.rngRun();
  const kind = r < 0.40 ? 'berry' : r < 0.72 ? 'magnet' : r < 0.92 ? 'bomb' : 'elixir';
  return dropPickup(x, y, kind);
}

export function updateItems(dt) {
  const p = G.player;
  if (!p) return;
  const grab = p.r + 10;
  const grab2 = grab * grab;

  for (let i = items.length - 1; i >= 0; i--) {
    const it = items[i];
    it.age += dt;
    it.x += it.vx * dt;
    it.y += it.vy * dt;
    it.vx *= 0.9;
    it.vy *= 0.9;

    if (dist2(it.x, it.y, p.x, p.y) <= grab2) {
      const kind = KIND_KEYS[it.kind];
      const fn = itemEffects[kind];
      if (fn) fn(it);
      if (itemEffects.onCollect) itemEffects.onCollect(kind, PICKUP_KINDS[kind].label);
      despawn('items', items, i);
    }
  }
}

export { TIER_SPR, KIND_KEYS };
