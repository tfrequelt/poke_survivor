// L2 -- may import L0-L1.
//
// The stat modifier system every upgrade, passive, evolution and shop purchase flows through.
//
//     final = (base + SUM flat) * (1 + SUM inc) * PRODUCT(1 + more)
//
//   flat  -- "+10 max HP". Sums. Meta-shop and a few early upgrades.
//   inc   -- "+15% power". Sums WITH OTHER INC, then applies once. Almost everything uses this,
//            because eight +15% should give +120%, not x3.06. This single choice is what stops
//            the exponential runaway that ruins the last five minutes of a run.
//   more  -- true multiplicative. Rare, reserved for evolutions. Keep under six in the game.
//
// Resolved only when G.statsDirty -- never per frame, never per weapon fire.

import { G } from './state.js';

export const STAT_KEYS = [
  'power', 'attackSpeed', 'area', 'projSpeed', 'duration', 'pierce', 'amount', 'range',
  'moveSpeed', 'maxHp', 'regen', 'armor', 'crit', 'critMult', 'magnet', 'xpGain',
  'cooldown', 'luck', 'revives', 'greed',
];

const BASE = {
  power: 1, attackSpeed: 1, area: 1, projSpeed: 1, duration: 1, pierce: 0, amount: 0, range: 1,
  moveSpeed: 60, maxHp: 100, regen: 0, armor: 0, crit: 0.05, critMult: 1.5, magnet: 45,
  xpGain: 1, cooldown: 1, luck: 0, revives: 0, greed: 1,
};

// Pre-allocated scratch. Resolving must not allocate, because evolutions resolve mid-frame.
const _flat = {};
const _inc = {};
const _more = {};

export function initStats() {
  G.stats = {};
  for (const k of STAT_KEYS) {
    G.stats[k] = BASE[k];
    _flat[k] = 0; _inc[k] = 0; _more[k] = 1;
  }
  G.statsDirty = true;
}

/** Add a modifier. `op` is 'flat' | 'inc' | 'more'. */
export function addMod(stat, op, value, source) {
  G.mods.push({ stat, op, value, source: source || null });
  G.statsDirty = true;
}

export function addMods(list, source) {
  for (const m of list) addMod(m.stat, m.op, m.value, source);
}

/**
 * Convenience for evolution and character grants written as a plain {stat: delta} object.
 * These are always flat deltas: multiplier-style stats sit on a base of 1, so `power: +0.10`
 * reads naturally as "+10% power" while still stacking additively like every other upgrade.
 */
export function addGrant(grant, source) {
  for (const [stat, value] of Object.entries(grant)) {
    if (STAT_KEYS.includes(stat)) addMod(stat, 'flat', value, source);
  }
}

export function resolveStats() {
  const s = G.stats;
  for (const k of STAT_KEYS) { _flat[k] = 0; _inc[k] = 0; _more[k] = 1; }

  for (let i = 0; i < G.mods.length; i++) {
    const m = G.mods[i];
    if (m.scope) continue;                          // weapon-scoped, resolved by weapons.js
    if (m.op === 'flat') _flat[m.stat] += m.value;
    else if (m.op === 'inc') _inc[m.stat] += m.value;
    else _more[m.stat] *= (1 + m.value);
  }

  const form = (G.form && G.form.stats) || null;
  for (const k of STAT_KEYS) {
    const base = form && form[k] !== undefined ? form[k] : BASE[k];
    s[k] = (base + _flat[k]) * (1 + _inc[k]) * _more[k];
  }

  // All clamps live here, in one place, so no caller has to remember them.
  s.attackSpeed = Math.min(s.attackSpeed, 5);
  s.cooldown = Math.max(s.cooldown, 0.25);
  s.crit = Math.min(Math.max(s.crit, 0), 1);
  s.moveSpeed = Math.max(s.moveSpeed, 10);
  s.maxHp = Math.max(1, Math.round(s.maxHp));
  s.amount = Math.round(s.amount);
  s.pierce = Math.round(s.pierce);
  s.armor = Math.max(0, s.armor);

  G.statsDirty = false;
  return s;
}

/** Call at the top of any system that reads G.stats. Cheap when nothing changed. */
export function ensureStats() {
  if (G.statsDirty) resolveStats();
  return G.stats;
}
