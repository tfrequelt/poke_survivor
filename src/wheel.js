// L4 -- may import L0-L3, plus ui.js's own layer for the shared cursor.
//
// Delibird's present wheel: the minigame a present opens.
//
// It owns its state and its rules; ui.js draws it and main.js sequences it, the same split the
// evolution cutscene uses. The prize is decided the moment the wheel starts, from the run RNG,
// and the spin is an animation of a result that already exists -- so the reward is deterministic
// for a given seed and cannot be influenced by when the player lets go of anything.

import { G } from './state.js';
import { addMod, ensureStats } from './stats.js';
import { MAX_WEAPONS, addWeapon, levelWeapon } from './weapons.js';
import { WEAPONS } from './data/weapons.js';
import { weaponOffered } from './progress.js';
import { xpToNext } from './progress.js';

/**
 * The prizes, in wheel order. `weight` is the chance of landing on one; the order around the
 * circle is just the order here, so a rare prize is not visually hidden -- you can see the slice
 * you did not get.
 *
 * `label` is what fits inside a wedge, about six characters at this radius. `sub` is the full
 * description and only has to fit the result window underneath.
 */
export const SEGMENTS = [
  { id: 'stat', label: '+STAT', sub: 'A small boost', weight: 26 },
  { id: 'shot', label: '+SHOT', sub: 'One more projectile', weight: 20 },
  { id: 'level', label: '+1 LVL', sub: 'Gain a level', weight: 18 },
  { id: 'weapon', label: 'MOVE', sub: 'Trade a move in', weight: 18 },
  { id: 'bigstat', label: '+STAT XL', sub: 'A large boost', weight: 12 },
  { id: 'levels3', label: '+3 LVL', sub: 'Gain three levels', weight: 6 },
];

/** Stat prizes. Same {stat, op, value} shape the level-up cards and the shop use. */
const SMALL = [
  { stat: 'power', op: 'inc', value: 0.10, label: '+10% POWER' },
  { stat: 'attackSpeed', op: 'inc', value: 0.10, label: '+10% ATTACK SPEED' },
  { stat: 'area', op: 'inc', value: 0.12, label: '+12% AREA' },
  { stat: 'moveSpeed', op: 'inc', value: 0.08, label: '+8% MOVE SPEED' },
  { stat: 'maxHp', op: 'flat', value: 20, label: '+20 MAX HP' },
  { stat: 'magnet', op: 'inc', value: 0.20, label: '+20% PICKUP RANGE' },
  { stat: 'crit', op: 'flat', value: 0.05, label: '+5% CRIT' },
];
const BIG = [
  { stat: 'power', op: 'inc', value: 0.30, label: '+30% POWER' },
  { stat: 'attackSpeed', op: 'inc', value: 0.28, label: '+28% ATTACK SPEED' },
  { stat: 'area', op: 'inc', value: 0.32, label: '+32% AREA' },
  { stat: 'maxHp', op: 'flat', value: 60, label: '+60 MAX HP' },
  { stat: 'pierce', op: 'flat', value: 2, label: '+2 PIERCE' },
];

/** How long a spin lasts when nothing overrides it. */
export const SPIN_TIME = 2.6;

export const wheel = {
  phase: 'spin',      // 'spin' | 'result' | 'swap'
  t: 0,               // seconds since the spin started
  angle: 0,           // current rotation, radians
  from: 0,            // rotation at the start of the spin
  to: 0,              // rotation it eases into
  index: 0,           // the winning segment
  note: '',           // what the prize actually did, once it is applied
  spinTime: SPIN_TIME, // this spin's duration; matched to the sound effect when there is one
  cursor: 0,
  choices: [],        // the swap page: owned weapons, plus "keep everything"
  incoming: null,     // the weapon offered in exchange
};

const pick = (list) => list[(G.rngRun() * list.length) | 0];

/** Weighted choice over SEGMENTS, using the run RNG so a seed replays identically. */
function rollSegment() {
  let total = 0;
  for (const s of SEGMENTS) total += s.weight;
  let r = G.rngRun() * total;
  for (let i = 0; i < SEGMENTS.length; i++) {
    r -= SEGMENTS[i].weight;
    if (r <= 0) return i;
  }
  return 0;
}

/** Weapons this form could legally be offered and does not already own. */
function replacementPool() {
  const owned = new Set(G.weapons.map((w) => w.def.id));
  return WEAPONS.filter((w) => !w.hidden && !owned.has(w.id) &&
    !G.banished.has(w.id) && weaponOffered(w));
}

/**
 * `seconds` lets the caller match the spin to the length of the sound playing over it, so the
 * wheel stops on the same beat the ticking does rather than a third of a second early.
 */
export function startWheel(seconds) {
  wheel.phase = 'spin';
  wheel.spinTime = seconds > 0.4 ? seconds : SPIN_TIME;
  wheel.t = 0;
  wheel.note = '';
  wheel.cursor = 0;
  wheel.choices.length = 0;
  wheel.incoming = null;
  wheel.index = rollSegment();

  // Land the winning slice under the arrow at the top. Several whole turns first, so it reads
  // as a spin rather than a snap, and a little jitter inside the slice so it never stops in
  // precisely the same place twice.
  const slice = (Math.PI * 2) / SEGMENTS.length;
  const centre = wheel.index * slice + slice / 2;
  const jitter = (G.rngRun() - 0.5) * slice * 0.6;
  wheel.from = wheel.angle % (Math.PI * 2);
  wheel.to = wheel.from + Math.PI * 2 * 4 +
    (((-Math.PI / 2 - centre - jitter) - wheel.from) % (Math.PI * 2) + Math.PI * 2) % (Math.PI * 2);
}

/** Runs on RAW dt: the simulation is frozen while the wheel is open. */
export function updateWheel(dt) {
  if (wheel.phase !== 'spin') return false;
  wheel.t += dt;
  const k = Math.min(1, wheel.t / wheel.spinTime);
  // Cubic ease-out: fast off the mark, and the last half-second is the part worth watching.
  const e = 1 - Math.pow(1 - k, 3);
  wheel.angle = wheel.from + (wheel.to - wheel.from) * e;
  if (k < 1) return false;

  wheel.phase = 'result';
  return applyPrize();
}

/**
 * Hand over the prize. Returns true when the wheel still needs the player -- only the weapon
 * swap does, which is why it is the one prize that does not resolve here.
 */
function applyPrize() {
  const seg = SEGMENTS[wheel.index];
  switch (seg.id) {
    case 'stat': {
      const m = pick(SMALL);
      addMod(m.stat, m.op, m.value, 'wheel');
      ensureStats();
      wheel.note = m.label;
      return false;
    }
    case 'bigstat': {
      const m = pick(BIG);
      addMod(m.stat, m.op, m.value, 'wheel');
      ensureStats();
      wheel.note = m.label;
      return false;
    }
    case 'shot': {
      addMod('amount', 'flat', 1, 'wheel');
      ensureStats();
      wheel.note = '+1 PROJECTILE';
      return false;
    }
    case 'level':
    case 'levels3': {
      const n = seg.id === 'level' ? 1 : 3;
      for (let i = 0; i < n; i++) {
        G.level++;
        G.xpNext = xpToNext(G.level);
        G.pendingLevelUps++;
      }
      wheel.note = n === 1 ? 'LEVEL UP!' : 'THREE LEVELS!';
      return false;
    }
    case 'weapon': {
      const pool = replacementPool();
      if (!pool.length) {
        // Nothing legal left to offer, so pay out rather than hand over an empty menu.
        addMod('power', 'inc', 0.10, 'wheel');
        ensureStats();
        wheel.note = 'NOTHING NEW -- +10% POWER';
        return false;
      }
      wheel.incoming = pick(pool);

      // With a free slot there is nothing to trade away, so take it and skip the menu.
      if (G.weapons.length < MAX_WEAPONS) {
        addWeapon(wheel.incoming.id);
        wheel.note = `${wheel.incoming.name.toUpperCase()} LEARNED`;
        return false;
      }

      wheel.phase = 'swap';
      wheel.cursor = 0;
      wheel.choices = G.weapons.map((w) => ({ kind: 'swap', weapon: w, label: w.def.name }));
      wheel.choices.push({ kind: 'keep', label: 'KEEP EVERYTHING' });
      return true;
    }
    default:
      return false;
  }
}

/** The swap page: replace the selected weapon, or decline and take a level instead. */
export function chooseSwap(i) {
  const c = wheel.choices[Math.min(i, wheel.choices.length - 1)];
  if (!c) return;
  if (c.kind === 'keep') {
    // Declining is not punished: the present still pays, just in a currency you already have.
    levelWeapon(G.weapons[0]);
    wheel.note = 'KEPT EVERYTHING';
  } else {
    const at = G.weapons.indexOf(c.weapon);
    if (at >= 0) G.weapons.splice(at, 1);
    addWeapon(wheel.incoming.id);
    wheel.note = `${c.label.toUpperCase()} -> ${wheel.incoming.name.toUpperCase()}`;
  }
  wheel.phase = 'result';
  ensureStats();
}
