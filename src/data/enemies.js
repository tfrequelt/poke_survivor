// L0 -- pure data. Enemy definitions.
//
// `shape` names the PMD sheet in assets/manifest.json; `fallback` is the drawn shape used when
// that folder is missing, so a deleted or mistyped asset directory degrades to generic art rather
// than failing the boot. `palette` only colours the fallback -- a PMD sheet carries its own
// colours -- but it still has to be a sensible one or the drawn version looks wrong.
//
// `ai` is a string key resolved by the registry in enemies.js. Nothing here imports a system, so
// this file can be read by the pokedex screen, the spawn director and the renderer with no risk
// of an import cycle.
//
// SPATIAL UNITS ARE HALVED relative to the balance pass, which was written for a 1280x720 space.
// Speeds are px/s and radii are px in the 640x360 render space. HP, damage and XP are unscaled.
//
// `from` / `to` are the minute window in which the spawn director may roll this enemy. The roster
// is built as EVOLUTION LINES: Rattata early and Raticate later, Caterpie then Metapod then
// Butterfree. The swarm visibly grows up over a run rather than just gaining a health multiplier.

export const ENEMIES = [
  // --- early: the first five minutes ---------------------------------------
  {
    id: 'rattata', name: 'Rattata', dex: 1,
    shape: 'rattata', fallback: 'quad_small', palette: 'rattail',
    hp: 10, dmg: 6, speed: 24, r: 4, mass: 1, xp: 1,
    ai: 'chase', coinChance: 0.06,
    stages: ['grass', 'beach'], from: 0, to: 9, weight: 10,
  },
  {
    id: 'caterpie', name: 'Caterpie', dex: 2,
    shape: 'caterpie', fallback: 'bug', palette: 'grub',
    hp: 18, dmg: 5, speed: 15, r: 5, mass: 1.5, xp: 1,
    ai: 'chase', coinChance: 0.06,
    stages: ['grass'], from: 0, to: 8, weight: 9,
  },
  {
    id: 'zubat', name: 'Zubat', dex: 3,
    shape: 'zubat', fallback: 'bat', palette: 'cavebat',
    hp: 9, dmg: 5, speed: 38, r: 3.5, mass: 0.7, xp: 1,
    ai: 'sine', coinChance: 0.05, flying: true,
    stages: ['cave', 'beach'], from: 0, to: 10, weight: 10,
  },
  {
    id: 'pidgey', name: 'Pidgey', dex: 4,
    shape: 'pidgey', fallback: 'bat', palette: 'vermin',
    hp: 12, dmg: 6, speed: 32, r: 4, mass: 0.8, xp: 1,
    ai: 'sine', coinChance: 0.06, flying: true,
    stages: ['grass', 'beach'], from: 1, to: 10, weight: 9,
  },
  {
    id: 'diglett', name: 'Diglett', dex: 5,
    shape: 'diglett', fallback: 'round_big', palette: 'vermin',
    hp: 20, dmg: 7, speed: 30, r: 4, mass: 1.2, xp: 2,
    ai: 'rusher', coinChance: 0.08,
    stages: ['cave'], from: 1, to: 11, weight: 8,
  },
  {
    id: 'geodude', name: 'Geodude', dex: 6,
    shape: 'geodude', fallback: 'round_big', palette: 'rock',
    hp: 46, dmg: 11, speed: 15, r: 5, mass: 2.8, xp: 3,
    ai: 'charge', coinChance: 0.10, armor: 1, knockResist: 0.5,
    stages: ['cave', 'grass'], from: 2, to: 13, weight: 6,
  },
  {
    id: 'marill', name: 'Marill', dex: 7,
    shape: 'marill', fallback: 'round_big', palette: 'water',
    hp: 16, dmg: 6, speed: 40, r: 4, mass: 0.9, xp: 2,
    // It bounces, so it closes faster than anything else this early and is easy to miss with.
    ai: 'sine', coinChance: 0.07,
    stages: ['beach', 'grass'], from: 1, to: 10, weight: 9,
  },
  {
    id: 'zigzagoon', name: 'Zigzagoon', dex: 8,
    shape: 'zigzagoon', fallback: 'quad_small', palette: 'rattail',
    hp: 14, dmg: 6, speed: 44, r: 4, mass: 0.9, xp: 2,
    // It does not run at you so much as at where you were, which is what makes a pack of them
    // genuinely awkward rather than just fast.
    ai: 'sine', coinChance: 0.08,
    stages: ['grass', 'beach'], from: 1, to: 11, weight: 9,
  },
  {
    id: 'poochyena', name: 'Poochyena', dex: 9,
    shape: 'poochyena', fallback: 'quad_small', palette: 'shadowy',
    hp: 22, dmg: 8, speed: 42, r: 4, mass: 1, xp: 2,
    ai: 'chase', coinChance: 0.07,
    stages: ['cave', 'grass'], from: 2, to: 12, weight: 8,
  },

  // --- mid: the evolutions arrive ------------------------------------------
  {
    id: 'metapod', name: 'Metapod', dex: 10,
    shape: 'metapod', fallback: 'bug', palette: 'grub',
    hp: 80, dmg: 6, speed: 9, r: 5.5, mass: 4, xp: 4,
    ai: 'chase', coinChance: 0.12, armor: 3, knockResist: 0.85,
    stages: ['grass'], from: 5, to: 16, weight: 5,
  },
  {
    id: 'raticate', name: 'Raticate', dex: 11,
    shape: 'raticate', fallback: 'quad_small', palette: 'rattail',
    hp: 52, dmg: 12, speed: 34, r: 5, mass: 1.8, xp: 4,
    ai: 'rusher', coinChance: 0.09,
    stages: ['grass', 'beach'], from: 6, to: 20, weight: 8,
  },
  {
    id: 'pidgeotto', name: 'Pidgeotto', dex: 12,
    shape: 'pidgeotto', fallback: 'bat', palette: 'vermin',
    hp: 44, dmg: 11, speed: 42, r: 4.5, mass: 1, xp: 4,
    ai: 'rusher', coinChance: 0.08, flying: true,
    stages: ['grass', 'beach'], from: 7, to: 20, weight: 7,
  },
  {
    id: 'crobat', name: 'Crobat', dex: 13,
    shape: 'crobat', fallback: 'bat', palette: 'ghostly',
    hp: 40, dmg: 10, speed: 52, r: 4.5, mass: 0.8, xp: 4,
    ai: 'orbit', coinChance: 0.08, flying: true,
    stages: ['cave', 'beach'], from: 8, to: 20, weight: 7,
  },
  {
    id: 'dugtrio', name: 'Dugtrio', dex: 14,
    shape: 'dugtrio', fallback: 'round_big', palette: 'vermin',
    hp: 78, dmg: 14, speed: 36, r: 5.5, mass: 2.2, xp: 5,
    ai: 'rusher', coinChance: 0.11,
    stages: ['cave'], from: 9, to: 20, weight: 6,
  },

  // --- late: the ones you have to respect ----------------------------------
  {
    id: 'butterfree', name: 'Butterfree', dex: 15,
    shape: 'butterfree', fallback: 'bug', palette: 'poison',
    hp: 90, dmg: 13, speed: 30, r: 5.5, mass: 1.2, xp: 6,
    ai: 'sine', coinChance: 0.12, flying: true,
    stages: ['grass', 'cave'], from: 11, to: 20, weight: 5,
  },
  {
    id: 'graveler', name: 'Graveler', dex: 16,
    shape: 'graveler', fallback: 'round_big', palette: 'rock',
    hp: 160, dmg: 17, speed: 14, r: 6.5, mass: 4.5, xp: 7,
    ai: 'charge', coinChance: 0.16, armor: 4, knockResist: 0.8,
    stages: ['cave', 'grass'], from: 10, to: 20, weight: 4,
  },
  {
    id: 'pidgeot', name: 'Pidgeot', dex: 17,
    shape: 'pidgeot', fallback: 'bat', palette: 'vermin',
    hp: 130, dmg: 18, speed: 48, r: 6, mass: 1.6, xp: 8,
    ai: 'charge', coinChance: 0.18, flying: true, knockResist: 0.55,
    stages: ['beach', 'grass'], from: 13, to: 20, weight: 4,
  },
  {
    id: 'azumarill', name: 'Azumarill', dex: 18,
    shape: 'azumarill', fallback: 'round_big', palette: 'water',
    hp: 120, dmg: 15, speed: 30, r: 6, mass: 3.2, xp: 6,
    // The board's paymaster, a role Delibird held before it became a partner: slow, tough, and
    // worth going out of your way for.
    ai: 'charge', coinChance: 0.45, armor: 2, knockResist: 0.6,
    stages: ['beach', 'cave'], from: 9, to: 20, weight: 5,
  },
  {
    id: 'linoone', name: 'Linoone', dex: 19,
    shape: 'linoone', fallback: 'quad_small', palette: 'rattail',
    hp: 62, dmg: 13, speed: 58, r: 5, mass: 1.4, xp: 5,
    // The fastest thing in the game. It will reach you; the question is what is behind it.
    ai: 'rusher', coinChance: 0.09,
    stages: ['grass', 'beach'], from: 8, to: 20, weight: 7,
  },
  {
    id: 'mightyena', name: 'Mightyena', dex: 20,
    shape: 'mightyena', fallback: 'quad_small', palette: 'shadowy',
    hp: 96, dmg: 16, speed: 46, r: 5.5, mass: 1.9, xp: 6,
    ai: 'rusher', coinChance: 0.12, armor: 1,
    stages: ['cave', 'grass'], from: 10, to: 20, weight: 6,
  },
];

/**
 * Who shows up when the director calls for something big. Tiers 1-3 are the 5/10/15 minute
 * mini-bosses and tier 4 is the 20:00 finale.
 *
 * Naming them is deliberate: picking "whatever is fifth in the stage list" -- which is what this
 * did -- meant the mini-boss silently changed identity every time the roster was reordered.
 */
export const BOSS_TIERS = ['raticate', 'graveler', 'pidgeot', 'butterfree'];

// --- Destructible scenery ---------------------------------------------------
// Modelled as stationary, harmless enemies. `stages: []` keeps the spawn director from ever
// rolling them -- they are placed by the prop system instead.
//
// `drops` is what breaking one leaves behind: the chance of any XP at all and how many orbs, the
// same for coins, and the chance of a single power-up. A crate is the jackpot and a bush is
// pocket change, which is what makes choosing a target worth a moment's thought.
for (const [id, shape, palette, hp, r, drops] of [
  ['prop_bush', 'prop_bush', 'grass', 14, 8,
    { xpChance: 0.85, xp: 2, coinChance: 0.70, coins: 2, pickupChance: 0.08 }],
  ['prop_rock', 'prop_rock', 'rock', 30, 8,
    { xpChance: 0.90, xp: 3, coinChance: 0.80, coins: 3, pickupChance: 0.12 }],
  ['prop_crate', 'prop_crate', 'vermin', 20, 8,
    { xpChance: 0.95, xp: 4, coinChance: 0.95, coins: 5, pickupChance: 0.35 }],
]) {
  ENEMIES.push({
    id, name: id, shape, palette,
    hp, dmg: 0, speed: 0, r, mass: 99, xp: 0,
    ai: 'static', coinChance: 0, knockResist: 1,
    prop: true, harmless: true, noScale: true, drops,
    stages: [], from: 0, to: 0, weight: 0,
  });
}

export const ENEMY_BY_ID = Object.fromEntries(ENEMIES.map((e) => [e.id, e]));

/**
 * Every (shape, palette, fallback) triple the roster needs, plus a gold "elite" recolour.
 *
 * The elite variant is only worth registering for DRAWN enemies: recolouring a PMD sheet through
 * a palette does nothing (the sheet supplies its own pixels), so it would just be a second,
 * identical copy of a large sheet in the atlas. Which shapes have sheets is not knowable from
 * here -- that is an L1 concern -- so the elite entries are emitted and main.js drops the ones
 * whose shape turns out to be sheet-backed.
 */
export function enemySpritePairs() {
  const out = [];
  const seen = new Set();
  const add = (shape, palette, fallback) => {
    const key = `${shape}:${palette}`;
    if (seen.has(key)) return;
    seen.add(key);
    out.push([shape, palette, fallback || null]);
  };
  for (const e of ENEMIES) {
    // 'elite' is reserved for the gold recolour. Using it as an enemy's own palette would make
    // its normal and elite entries the same registry key, and main.js drops sheet-backed elite
    // entries -- so the enemy would end up with no sprite at all.
    if (e.palette === 'elite') throw new Error(`enemies: "${e.id}" may not use the elite palette`);
    add(e.shape, e.palette, e.fallback);
    add(e.shape, 'elite', e.fallback);
  }
  return out;
}
