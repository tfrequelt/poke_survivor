// L3 -- may import L0-L2 and, same-layer, weapons.js and overload.js.
//
// XP, levelling and the level-up offer. The card pool and evolution handling land here too.

import { G } from './state.js';
import { addGrant, ensureStats, addMod, addMods } from './stats.js';
import { CHARACTER_BY_ID } from './data/characters.js';
import { STAT_UPGRADES, PASSIVES, STAT_BY_ID, PASSIVE_BY_ID } from './data/upgrades.js';
import { WEAPONS, WEAPON_BY_ID } from './data/weapons.js';
import { ABILITIES } from './data/abilities.js';
import { addAbility } from './abilities.js';
import { addWeapon, levelWeapon, MAX_WEAPONS } from './weapons.js';
import { weaponAwaitingOverload, overloadOptions, applyOverload } from './overload.js';
import { BLESSING_BY_ID } from './data/totems.js';
import { checkLevel } from './successes.js';

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
  // Checked where the level is gained, not polled: the level-up screen freezes the sim, so a
  // per-tick check would wait for the player to finish picking cards before noticing.
  checkLevel();
}

export function grantCoins(amount) {
  G.coins += Math.round(amount * (G.stats.greed || 1));
}

// --- The level-up offer -----------------------------------------------------

const MAX_PASSIVES = 6;

/** How many times a card has already been taken this run. */
const picks = new Map();
export function resetPicks() { picks.clear(); offersSeen.clear(); }
const pickCount = (id) => picks.get(id) || 0;

/**
 * The uncapped tail of the upgrade tree.
 *
 * Every other card runs out: weapons stop at level 10, passives at their maxPicks, abilities at
 * five. When the pool empties, rollOffers falls back to a single Recover card -- which a long
 * run, and endless in particular, reaches and then never leaves. These have no cap, so it
 * cannot happen. They are deliberately smaller than a real upgrade: this is the consolation for
 * having taken everything, not a reason to stop taking real cards.
 */
const MASTERY = [
  { id: 'm_power', name: 'Mastery: Might', desc: '+6% attack power',
    mods: [{ stat: 'power', op: 'inc', value: 0.06 }] },
  { id: 'm_area', name: 'Mastery: Reach', desc: '+5% area of effect',
    mods: [{ stat: 'area', op: 'inc', value: 0.05 }] },
  { id: 'm_haste', name: 'Mastery: Haste', desc: '+4% attack speed',
    mods: [{ stat: 'attackSpeed', op: 'inc', value: 0.04 }] },
  { id: 'm_hp', name: 'Mastery: Vigour', desc: '+8 max health',
    mods: [{ stat: 'maxHp', op: 'flat', value: 8 }] },
  { id: 'm_speed', name: 'Mastery: Swiftness', desc: '+4% movement speed',
    mods: [{ stat: 'moveSpeed', op: 'inc', value: 0.04 }] },
  { id: 'm_cooldown', name: 'Mastery: Focus', desc: '-3% ability cooldown',
    mods: [{ stat: 'cooldown', op: 'inc', value: -0.03 }] },
];

export const MASTERY_BY_ID = Object.fromEntries(MASTERY.map((m) => [m.id, m]));

/**
 * Below this many real cards, Mastery is allowed in to pad the draw.
 *
 * Not "only when the pool is empty": with two real cards left the player would be shown the
 * same two every level until they took them. Three is one full hand.
 */
const MASTERY_FLOOR = 3;

/** The badge a weapon card wears: its type, or ANY for the one weapon every Pokemon may take. */
const cardType = (w) => w.type || (w.universal ? 'any' : undefined);

/** Every card that is currently legal to offer, as {kind, id, name, desc, level} entries. */
function candidates() {
  const out = [];

  for (const u of STAT_UPGRADES) {
    const n = pickCount(u.id);
    if (n >= u.maxPicks || G.banished.has(u.id)) continue;
    out.push({ kind: 'stat', id: u.id, name: u.name, desc: u.desc, level: n + 1, max: u.maxPicks, weight: 10 });
  }

  for (const w of WEAPONS) {
    if (w.hidden || G.banished.has(w.id)) continue;   // evolved forms are earned, not drafted
    const owned = G.weapons.find((x) => x.def.id === w.id);
    if (owned) {
      if (owned.level >= w.levels.length) continue;
      out.push({
        kind: 'weapon', id: w.id, name: w.name, desc: levelDesc(w, owned.level), type: cardType(w),
        level: owned.level + 1, max: w.levels.length, weight: 12,
      });
    } else {
      if (G.weapons.length >= MAX_WEAPONS) continue;
      if (!weaponOffered(w)) continue;              // strict type gating -- see weaponOffered
      // Eevee's Adaptability nudges new weapons to show up more often.
      const bonus = G.character && G.character.id === 'eevee' ? 1.1 : 1;
      out.push({
        kind: 'weapon', id: w.id, name: w.name, desc: w.desc, isNew: true, type: cardType(w),
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

  // Mastery last, and only once the real pool has thinned, so it can never crowd out an upgrade
  // that still has somewhere to go.
  if (out.length < MASTERY_FLOOR) {
    for (const m of MASTERY) {
      out.push({
        kind: 'mastery', id: m.id, name: m.name, desc: m.desc,
        level: pickCount(m.id) + 1, max: 0, weight: 10,
      });
    }
  }

  for (const a of availableAbilities()) {
    const n = pickCount(a.id);
    if (n >= a.levels.length || G.banished.has(a.id)) continue;
    out.push({
      kind: 'ability', id: a.id, name: a.name, desc: a.desc, slot: a.slot,
      isNew: n === 0, level: n + 1, max: a.levels.length,
      // Weighted well above everything else so a new ability surfaces fast without being forced.
      weight: n === 0 ? 30 : 11,
    });
  }

  return out;
}

/**
 * The abilities the CURRENT form may draft. Exclusive by design: slot 0 is the starter's own, and
 * slot 1 only exists once you have evolved into the form that owns it -- which is what makes
 * evolving feel like it unlocked something rather than just raising numbers.
 */
function availableAbilities() {
  const c = G.character;
  if (!c) return [];
  const line = G.form ? G.form.line : [c.id];
  return ABILITIES.filter((a) => a.owner === c.id && (a.form === c.id || line.includes(a.form)));
}

/**
 * Can this form be OFFERED this weapon?
 *
 * Strictly by type: Wooper is shown Water and Ground weapons and nothing else. A weapon already
 * owned is exempt -- evolving must never strand a weapon at the level it happened to be when the
 * type changed, and taking something away from the player is a much worse feeling than the pool
 * narrowing. Signature weapons are likewise always legal for their owner.
 */
export function weaponOffered(def) {
  // Untyped is deliberate on a `universal` weapon; anywhere else it is a bug, not a lockout.
  if (!def.type) return true;
  if (def.owner && G.character && def.owner === G.character.id) return true;
  const types = (G.form && G.form.types) || [];
  return types.includes(def.type);
}

/**
 * A run with no ability is a worse run, so a not-yet-owned ability is FORCED into the card set if
 * it has been draftable for three level-ups without being taken. Counting offers it has appeared
 * alongside is simpler and fairer than reasoning about player level, which shifts when you evolve.
 */
const offersSeen = new Map();

function forcedAbility() {
  for (const a of availableAbilities()) {
    if (pickCount(a.id) > 0 || G.banished.has(a.id)) continue;
    if ((offersSeen.get(a.id) || 0) >= 2) return a;       // 3rd time it comes up, it is guaranteed
  }
  return null;
}

/** Tick the "has been available" counter for every unowned ability. Called once per level-up. */
function noteAbilityOffers() {
  for (const a of availableAbilities()) {
    if (pickCount(a.id) > 0) continue;
    offersSeen.set(a.id, (offersSeen.get(a.id) || 0) + 1);
  }
}

/** Human-readable summary of what the next weapon level grants. */
// Every grant key a weapon's level table can carry, and how to say it out loud. The list used
// to stop at five, so a splitter's "+1 shard" and a bouncer's "+2 bounces" both rendered as the
// useless "Improves this weapon." -- tri_attack's level 2 said it before this.
const LEVEL_WORDS = [
  ['amount', (v, def) => `+${v} ${def.amountWord || 'projectile'}`],
  ['damage', (v) => `+${v} damage`],
  ['pierce', (v) => `+${v} pierce`],
  ['shards', (v) => `+${v} shard`],
  ['bounces', (v) => `+${v} bounce`],
  ['jumps', (v) => `+${v} jump`],
  ['duration', (v) => `+${v}s duration`],
  ['cooldownMul', (v) => `${Math.round((1 - v) * 100)}% faster`],
  ['areaMul', (v) => `+${Math.round((v - 1) * 100)}% area`],
];

/** Exported for the harness: 66 weapons x 9 levels is not something to read by eye. */
export const levelDescForTest = (def, lv) => levelDesc(def, lv);

function levelDesc(def, currentLevel) {
  const lv = def.levels[currentLevel];
  if (!lv) return 'Improves this weapon.';
  const bits = [];
  for (const [key, say] of LEVEL_WORDS) if (lv[key]) bits.push(say(lv[key], def));
  return bits.length ? bits.join(', ') : 'Improves this weapon.';
}

/**
 * A weapon at its last level turns its next level-up into an OVERLOAD level-up: the three cards
 * are that weapon's three overloads, and nothing else. One weapon per level-up, in slot order.
 */
function overloadOffers() {
  const w = weaponAwaitingOverload();
  if (!w) return null;
  return overloadOptions(w).map((ov) => ({
    kind: 'overload', id: ov.id, name: ov.name, desc: ov.desc, weaponId: w.def.id, ovl: ov,
    type: w.def.type || (w.def.universal ? 'any' : undefined), level: 1, max: 0,
  }));
}

/** Is the open draft an overload choice? Reroll and banish do not apply to one. */
export const overloadDraft = () => G.offers.length > 0 && G.offers[0].kind === 'overload';

/** Roll three distinct cards. Falls back to a heal if the pool is somehow exhausted. */
export function rollOffers(count = 3) {
  const ovl = overloadOffers();
  if (ovl) { G.offers = ovl; return ovl; }
  noteAbilityOffers();
  const pool = candidates();
  const chosen = [];
  const rng = G.rngRun;

  // A guaranteed ability takes the first slot, then the rest roll normally around it.
  const forced = forcedAbility();
  if (forced) {
    const i = pool.findIndex((c) => c.kind === 'ability' && c.id === forced.id);
    if (i >= 0) chosen.push(pool.splice(i, 1)[0]);
  }

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
    case 'mastery': {
      // A distinct source key per stack, or addMods would replace the previous one instead of
      // adding to it -- which is what makes these uncapped rather than a one-off.
      const m = MASTERY_BY_ID[offer.id];
      addMods(m.mods, `mastery:${m.id}:${pickCount(m.id)}`);
      break;
    }
    case 'ability': {
      addAbility(offer.id);
      break;
    }
    case 'overload': {
      const w = G.weapons.find((x) => x.def.id === offer.weaponId);
      if (w && !w.ovl) applyOverload(w, offer.ovl);
      break;
    }
    case 'blessing': {
      grantBlessing(offer.id);
      break;
    }
    case 'heal': {
      ensureStats();
      if (G.player) G.player.hp = Math.min(G.stats.maxHp, G.player.hp + 40);
      break;
    }
  }

  ensureStats();
  // A blessing is a totem's gift, not a level-up: it costs none of the ones you have banked.
  if (offer.kind !== 'blessing') G.pendingLevelUps = Math.max(0, G.pendingLevelUps - 1);
  G.offers = [];
}

/** A blessing, for the rest of the run: its modifiers, and a heal if it carries one. */
export function grantBlessing(id) {
  const b = BLESSING_BY_ID[id];
  if (!b || G.blessings.includes(id)) return false;
  G.blessings.push(id);
  addMods(b.mods, `blessing:${id}`);
  if (b.heal && G.player) {
    ensureStats();
    G.player.hp = Math.min(G.stats.maxHp, G.player.hp + b.heal);
  }
  return true;
}

/** A blessing draft is not a level-up: none of the level-up's draft controls apply to it. */
export const blessingDraft = () => G.offers.length > 0 && G.offers[0].kind === 'blessing';

/** Reroll the current three. Limited by the meta-shop's Reroll ranks. */
export function rerollOffers() {
  if (G.rerolls <= 0 || overloadDraft() || blessingDraft()) return false;
  G.rerolls--;
  rollOffers();
  return true;
}

/** Remove a card from the pool for the rest of the run, then refill the slot. */
export function banishOffer(offer) {
  if (G.banishes <= 0 || overloadDraft() || blessingDraft()) return false;
  G.banishes--;
  G.banished.add(offer.id);
  rollOffers();
  return true;
}

/** Skip the level-up for a small heal and some gold. */
export function skipOffer() {
  if (G.skips <= 0 || blessingDraft()) return false;
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

/**
 * Apply a non-branching evolution (or a chosen branch) to the player.
 *
 * The shape swap is the point: previously this only changed the palette, and because the player's
 * cached sprite id was never refreshed either, evolving was completely invisible.
 */
export function applyEvolution(ev, branch) {
  const chosen = branch || ev;
  G.evolvedAt.add(ev.atLevel);

  if (chosen.grant) addGrant(chosen.grant, `evo:${chosen.id || ev.atLevel}`);
  if (G.form) {
    if (chosen.shape) G.form.shape = chosen.shape;
    if (chosen.palette) G.form.palette = chosen.palette;
    if (chosen.name) G.form.name = chosen.name;
    if (chosen.id) G.form.id = chosen.id;
    if (chosen.types) G.form.types = chosen.types.slice();
    if (chosen.id && !G.form.line.includes(chosen.id)) G.form.line.push(chosen.id);
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
    types: character.types ? character.types.slice() : [],
    // Every form id this creature has BEEN, not just the current one. An ability is unlocked by
    // a form, and losing access to it on the next evolution -- which is what checking only the
    // current id did -- means an ability you never happened to draft becomes unreachable.
    line: [character.id],
    stats: { ...character.stats },
  };
  G.evolvedAt.clear();
  G.statsDirty = true;
}
