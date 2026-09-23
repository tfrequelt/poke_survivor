// L3 -- may import L0-L2 and, same-layer, weapons.js.
//
// XP, levelling and the level-up offer. The card pool and evolution handling land here too.

import { G } from './state.js';
import { addGrant, ensureStats, addMod, addMods } from './stats.js';
import { CHARACTER_BY_ID } from './data/characters.js';
import { STAT_UPGRADES, PASSIVES, STAT_BY_ID, PASSIVE_BY_ID } from './data/upgrades.js';
import { WEAPONS, WEAPON_BY_ID } from './data/weapons.js';
import { addWeapon, levelWeapon, MAX_WEAPONS } from './weapons.js';

/**
 * XP required to go from level L to L+1.
 *
 * Targets, against the expected kill income: level ~13 by 5:00, ~20 by 10:00, ~44 by 20:00.
 * That is ~44 level-ups against far more available upgrades, so no run can max everything --
 * which is the point. Instrument (level, time) pairs before retuning the quadratic coefficient.
 */
export const xpToNext = (L) => Math.round((10 + 6 * L + 1.9 * L * L) / 5) * 5;

export function grantXp(amount) {
  const s = ensureStats();
  G.xp += amount * s.xpGain;
  while (G.xp >= G.xpNext) {
    G.xp -= G.xpNext;
    G.level++;
    G.xpNext = xpToNext(G.level);
    G.pendingLevelUps++;
  }
}

export function grantCoins(amount) {
  G.coins += Math.round(amount * (G.stats.greed || 1));
}

// --- The level-up offer -----------------------------------------------------

const MAX_PASSIVES = 6;

/** How many times a card has already been taken this run. */
const picks = new Map();
export function resetPicks() { picks.clear(); }
const pickCount = (id) => picks.get(id) || 0;

/** Every card that is currently legal to offer, as {kind, id, name, desc, level} entries. */
function candidates() {
  const out = [];

  for (const u of STAT_UPGRADES) {
    const n = pickCount(u.id);
    if (n >= u.maxPicks || G.banished.has(u.id)) continue;
    out.push({ kind: 'stat', id: u.id, name: u.name, desc: u.desc, level: n + 1, max: u.maxPicks, weight: 10 });
  }

  for (const w of WEAPONS) {
    if (G.banished.has(w.id)) continue;
    const owned = G.weapons.find((x) => x.def.id === w.id);
    if (owned) {
      if (owned.level >= w.levels.length) continue;
      out.push({
        kind: 'weapon', id: w.id, name: w.name, desc: levelDesc(w, owned.level),
        level: owned.level + 1, max: w.levels.length, weight: 12,
      });
    } else {
      if (G.weapons.length >= MAX_WEAPONS) continue;
      // Eevee's Adaptability nudges new weapons to show up more often.
      const bonus = G.character && G.character.id === 'eevee' ? 1.1 : 1;
      out.push({
        kind: 'weapon', id: w.id, name: w.name, desc: w.desc, isNew: true,
        level: 1, max: w.levels.length, weight: 9 * bonus,
      });
    }
  }

  for (const u of PASSIVES) {
    const n = pickCount(u.id);
    if (n >= u.maxPicks || G.banished.has(u.id)) continue;
    if (n === 0 && G.passives.length >= MAX_PASSIVES) continue;
    out.push({ kind: 'passive', id: u.id, name: u.name, desc: u.desc, level: n + 1, max: u.maxPicks, weight: 8 });
  }

  return out;
}

/** Human-readable summary of what the next weapon level grants. */
function levelDesc(def, currentLevel) {
  const lv = def.levels[currentLevel];
  if (!lv) return 'Improves this weapon.';
  const bits = [];
  if (lv.amount) bits.push(`+${lv.amount} projectile`);
  if (lv.damage) bits.push(`+${lv.damage} damage`);
  if (lv.pierce) bits.push(`+${lv.pierce} pierce`);
  if (lv.cooldownMul) bits.push(`${Math.round((1 - lv.cooldownMul) * 100)}% faster`);
  if (lv.areaMul) bits.push(`+${Math.round((lv.areaMul - 1) * 100)}% area`);
  return bits.length ? bits.join(', ') : 'Improves this weapon.';
}

/** Roll three distinct cards. Falls back to a heal if the pool is somehow exhausted. */
export function rollOffers(count = 3) {
  const pool = candidates();
  const chosen = [];
  const rng = G.rngRun;

  while (chosen.length < count && pool.length > 0) {
    let total = 0;
    for (const c of pool) total += c.weight;
    let r = rng() * total;
    let idx = pool.length - 1;
    for (let i = 0; i < pool.length; i++) {
      r -= pool[i].weight;
      if (r <= 0) { idx = i; break; }
    }
    chosen.push(pool[idx]);
    pool.splice(idx, 1);
  }

  if (chosen.length === 0) {
    chosen.push({ kind: 'heal', id: 'heal', name: 'Recover', desc: 'Restore 40 HP', level: 1, max: 1 });
  }
  G.offers = chosen;
  return chosen;
}

/** Apply a chosen card and close the offer. */
export function takeOffer(offer) {
  picks.set(offer.id, pickCount(offer.id) + 1);

  switch (offer.kind) {
    case 'stat': {
      const u = STAT_BY_ID[offer.id];
      addMods(u.mods, `stat:${u.id}`);
      if (u.heal && G.player) {
        ensureStats();
        G.player.hp = Math.min(G.stats.maxHp, G.player.hp + u.heal);
      }
      break;
    }
    case 'weapon': {
      const owned = G.weapons.find((x) => x.def.id === offer.id);
      if (owned) levelWeapon(owned);
      else addWeapon(offer.id);
      break;
    }
    case 'passive': {
      const u = PASSIVE_BY_ID[offer.id];
      addMods(u.mods, `passive:${u.id}`);
      if (!G.passives.includes(u.id)) G.passives.push(u.id);
      break;
    }
    case 'heal': {
      ensureStats();
      if (G.player) G.player.hp = Math.min(G.stats.maxHp, G.player.hp + 40);
      break;
    }
  }

  ensureStats();
  G.offers = [];
  G.pendingLevelUps = Math.max(0, G.pendingLevelUps - 1);
}

/** Reroll the current three. Limited by the meta-shop's Reroll ranks. */
export function rerollOffers() {
  if (G.rerolls <= 0) return false;
  G.rerolls--;
  rollOffers();
  return true;
}

/** Remove a card from the pool for the rest of the run, then refill the slot. */
export function banishOffer(offer) {
  if (G.banishes <= 0) return false;
  G.banishes--;
  G.banished.add(offer.id);
  rollOffers();
  return true;
}

/** Skip the level-up for a small heal and some gold. */
export function skipOffer() {
  if (G.skips <= 0) return false;
  G.skips--;
  ensureStats();
  if (G.player) G.player.hp = Math.min(G.stats.maxHp, G.player.hp + 15);
  G.coins += 10;
  G.offers = [];
  G.pendingLevelUps = Math.max(0, G.pendingLevelUps - 1);
  return true;
}

/** Is an evolution due at the current level? Returns the evolution entry or null. */
export function pendingEvolution() {
  const c = G.character;
  if (!c) return null;
  for (const ev of c.evolutions) {
    if (ev.atLevel && G.level >= ev.atLevel && !G.evolvedAt.has(ev.atLevel)) return ev;
  }
  return null;
}

/** Apply a non-branching evolution (or a chosen branch) to the player. */
export function applyEvolution(ev, branch) {
  const chosen = branch || ev;
  G.evolvedAt.add(ev.atLevel);

  if (chosen.grant) addGrant(chosen.grant, `evo:${chosen.id || ev.atLevel}`);
  if (chosen.palette && G.form) {
    G.form.palette = chosen.palette;
    G.form.name = chosen.name;
  }
  ensureStats();

  // An evolution that raises max HP should heal by the same amount, or it is a downgrade in
  // practice: the bar gets longer while the player stays just as close to death.
  const p = G.player;
  if (p && chosen.grant && chosen.grant.maxHp) p.hp += chosen.grant.maxHp;
  if (p) p.hp = Math.min(p.hp, G.stats.maxHp);

  return chosen;
}

/** Build the starting form for a character. */
export function initForm(character) {
  G.character = character;
  G.form = {
    id: character.id,
    name: character.name,
    shape: character.shape,
    palette: character.palette,
    stats: { ...character.stats },
  };
  G.evolvedAt.clear();
  G.statsDirty = true;
}
