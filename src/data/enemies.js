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
  // --- CAVE: rock, steel, and the things that live under it ------------------
  {
    id: 'zubat', name: 'Zubat', dex: 1,
    shape: 'zubat', fallback: 'bat', palette: 'cavebat',
    hp: 9, dmg: 5, speed: 38, r: 3.5, mass: 0.7, xp: 1,
    ai: 'sine', coinChance: 0.05, flying: true,
    stages: ['cave'], from: 0, to: 10, weight: 10,
  },
  {
    id: 'roggenrola', name: 'Roggenrola', dex: 2,
    shape: 'roggenrola', fallback: 'round_big', palette: 'rock',
    // Barely moves, but it soaks. The cave's answer to a player who has bought no pierce.
    hp: 34, dmg: 7, speed: 13, r: 4.5, mass: 2.4, xp: 2,
    ai: 'chase',
    stages: ['cave'], from: 0, to: 11, weight: 9,
  },
  {
    id: 'diglett', name: 'Diglett', dex: 3,
    shape: 'diglett', fallback: 'round_big', palette: 'vermin',
    hp: 20, dmg: 7, speed: 30, r: 4, mass: 1.2, xp: 2,
    ai: 'rusher', coinChance: 0.08,
    stages: ['cave'], from: 0, to: 11, weight: 9,
  },
  {
    id: 'aron', name: 'Aron', dex: 4,
    shape: 'aron', fallback: 'round_big', palette: 'rock',
    // Armoured from minute two, so the cave punishes a loadout with no way through armour.
    hp: 30, dmg: 8, speed: 26, r: 4, mass: 1.6, xp: 2,
    ai: 'chase',
    stages: ['cave'], from: 2, to: 12, weight: 8,
  },
  {
    id: 'geodude', name: 'Geodude', dex: 5,
    shape: 'geodude', fallback: 'round_big', palette: 'rock',
    hp: 46, dmg: 11, speed: 15, r: 5, mass: 2.8, xp: 3,
    ai: 'charge',
    stages: ['cave'], from: 3, to: 14, weight: 7,
  },
  {
    id: 'lairon', name: 'Lairon', dex: 6,
    shape: 'lairon', fallback: 'round_big', palette: 'rock',
    hp: 88, dmg: 13, speed: 24, r: 5, mass: 2.6, xp: 5,
    ai: 'charge',
    stages: ['cave'], from: 7, to: 18, weight: 6,
  },
  {
    id: 'boldore', name: 'Boldore', dex: 7,
    shape: 'boldore', fallback: 'round_big', palette: 'rock',
    hp: 105, dmg: 14, speed: 16, r: 5.5, mass: 3.6, xp: 5,
    ai: 'charge',
    stages: ['cave'], from: 7, to: 19, weight: 6,
  },
  {
    id: 'crobat', name: 'Crobat', dex: 8,
    shape: 'crobat', fallback: 'bat', palette: 'ghostly',
    hp: 40, dmg: 10, speed: 52, r: 4.5, mass: 0.8, xp: 4,
    ai: 'orbit', coinChance: 0.08, flying: true,
    stages: ['cave'], from: 8, to: 20, weight: 7,
  },
  {
    id: 'dugtrio', name: 'Dugtrio', dex: 9,
    shape: 'dugtrio', fallback: 'round_big', palette: 'vermin',
    hp: 78, dmg: 14, speed: 36, r: 5.5, mass: 2.2, xp: 5,
    ai: 'rusher', coinChance: 0.11,
    stages: ['cave'], from: 9, to: 20, weight: 6,
  },
  {
    id: 'graveler', name: 'Graveler', dex: 10,
    shape: 'graveler', fallback: 'round_big', palette: 'rock',
    hp: 160, dmg: 17, speed: 14, r: 6.5, mass: 4.5, xp: 7,
    ai: 'charge',
    attack: { kind: 'shot', range: 215, cooldown: 3.0, windup: 0.5, damage: 9, speed: 125 }, coinChance: 0.16, armor: 4, knockResist: 0.8,
    stages: ['cave'], from: 10, to: 20, weight: 5,
  },
  {
    id: 'gigalith', name: 'Gigalith', dex: 11,
    shape: 'gigalith', fallback: 'round_big', palette: 'rock',
    // The heaviest thing on the board. It will not be pushed and it will not be rushed.
    hp: 230, dmg: 21, speed: 13, r: 7, mass: 5.5, xp: 9,
    ai: 'charge',
    attack: { kind: 'burst', count: 8, range: 250, cooldown: 4.2, windup: 0.7, damage: 11, speed: 125 }, coinChance: 0.20, armor: 6, knockResist: 0.88,
    stages: ['cave'], from: 13, to: 20, weight: 3,
  },
  {
    id: 'aggron', name: 'Aggron', dex: 12,
    shape: 'aggron', fallback: 'round_big', palette: 'rock',
    // As heavy as Gigalith and far quicker. The cave's last word.
    hp: 250, dmg: 22, speed: 22, r: 7, mass: 5, xp: 9,
    ai: 'charge',
    attack: { kind: 'burst', count: 6, spread: 1.5, range: 235, cooldown: 3.8, windup: 0.65, damage: 12, speed: 135 }, coinChance: 0.20, armor: 7, knockResist: 0.9,
    stages: ['cave'], from: 14, to: 20, weight: 3,
  },
  {
    id: 'skarmory', name: 'Skarmory', dex: 13,
    shape: 'skarmory', fallback: 'bat', palette: 'flying',
    // Fast, armoured and airborne at once, which nothing else manages. You meet it as the
    // ten-minute mini-boss first; from minute sixteen they come in ones and twos.
    hp: 120, dmg: 15, speed: 50, r: 5.5, mass: 1.8, xp: 7,
    ai: 'orbit',
    attack: { kind: 'shot', range: 240, cooldown: 2.6, windup: 0.35, damage: 10, speed: 175 }, coinChance: 0.14, flying: true, armor: 4, knockResist: 0.6,
    stages: ['cave'], from: 16, to: 20, weight: 4,
  },

  // --- GRASS: fields, birds and an orchard -----------------------------------
  {
    id: 'rattata', name: 'Rattata', dex: 14,
    shape: 'rattata', fallback: 'quad_small', palette: 'rattail',
    hp: 10, dmg: 6, speed: 24, r: 4, mass: 1, xp: 1,
    ai: 'chase', coinChance: 0.06,
    stages: ['grass'], from: 0, to: 9, weight: 10,
  },
  {
    id: 'caterpie', name: 'Caterpie', dex: 15,
    shape: 'caterpie', fallback: 'bug', palette: 'grub',
    hp: 18, dmg: 5, speed: 15, r: 5, mass: 1.5, xp: 1,
    ai: 'chase', coinChance: 0.06,
    stages: ['grass'], from: 0, to: 8, weight: 9,
  },
  {
    id: 'applin', name: 'Applin', dex: 16,
    shape: 'applin', fallback: 'round_big', palette: 'grass',
    // Hides in its apple, so even the first minute has something a little chewy in it.
    hp: 16, dmg: 6, speed: 18, r: 4, mass: 1.3, xp: 2,
    ai: 'chase', coinChance: 0.07, armor: 1,
    stages: ['grass'], from: 0, to: 10, weight: 9,
  },
  {
    id: 'pidgey', name: 'Pidgey', dex: 17,
    shape: 'pidgey', fallback: 'bat', palette: 'vermin',
    hp: 12, dmg: 6, speed: 32, r: 4, mass: 0.8, xp: 1,
    ai: 'sine', coinChance: 0.06, flying: true,
    stages: ['grass'], from: 1, to: 10, weight: 9,
  },
  {
    id: 'spearow', name: 'Spearow', dex: 18,
    shape: 'spearow', fallback: 'bat', palette: 'vermin',
    hp: 13, dmg: 6, speed: 40, r: 4, mass: 0.8, xp: 2,
    ai: 'sine',
    stages: ['grass'], from: 1, to: 10, weight: 9,
  },
  {
    id: 'metapod', name: 'Metapod', dex: 19,
    shape: 'metapod', fallback: 'bug', palette: 'grub',
    hp: 80, dmg: 6, speed: 9, r: 5.5, mass: 4, xp: 4,
    ai: 'chase', coinChance: 0.12, armor: 3, knockResist: 0.85,
    stages: ['grass'], from: 5, to: 16, weight: 5,
  },
  {
    id: 'raticate', name: 'Raticate', dex: 20,
    shape: 'raticate', fallback: 'quad_small', palette: 'rattail',
    hp: 52, dmg: 12, speed: 34, r: 5, mass: 1.8, xp: 4,
    ai: 'rusher', coinChance: 0.09,
    stages: ['grass'], from: 6, to: 20, weight: 8,
  },
  {
    id: 'pidgeotto', name: 'Pidgeotto', dex: 21,
    shape: 'pidgeotto', fallback: 'bat', palette: 'vermin',
    hp: 44, dmg: 11, speed: 42, r: 4.5, mass: 1, xp: 4,
    ai: 'rusher',
    stages: ['grass'], from: 7, to: 20, weight: 7,
  },
  {
    id: 'appletun', name: 'Appletun', dex: 22,
    shape: 'appletun', fallback: 'round_big', palette: 'grass',
    // The slow half of Applin's split: a rolling pie that does not care what you shoot it with.
    hp: 150, dmg: 15, speed: 15, r: 6, mass: 4, xp: 6,
    ai: 'chase',
    stages: ['grass'], from: 9, to: 20, weight: 5,
  },
  {
    id: 'butterfree', name: 'Butterfree', dex: 23,
    shape: 'butterfree', fallback: 'bug', palette: 'poison',
    hp: 90, dmg: 13, speed: 30, r: 5.5, mass: 1.2, xp: 6,
    ai: 'sine',
    attack: { kind: 'burst', count: 7, range: 230, cooldown: 4.0, windup: 0.65, damage: 9, speed: 120 }, coinChance: 0.12, flying: true,
    stages: ['grass'], from: 11, to: 20, weight: 5,
  },
  {
    id: 'fearow', name: 'Fearow', dex: 24,
    shape: 'fearow', fallback: 'bat', palette: 'vermin',
    hp: 110, dmg: 16, speed: 56, r: 5.5, mass: 1.5, xp: 6,
    ai: 'rusher',
    attack: { kind: 'shot', range: 225, cooldown: 2.6, windup: 0.35, damage: 9, speed: 175 }, coinChance: 0.10, flying: true, knockResist: 0.5,
    stages: ['grass'], from: 11, to: 20, weight: 6,
  },
  {
    id: 'flapple', name: 'Flapple', dex: 25,
    shape: 'flapple', fallback: 'bat', palette: 'grass',
    // The fast half of the split, and it circles rather than charges.
    hp: 95, dmg: 14, speed: 48, r: 5, mass: 1.1, xp: 6,
    ai: 'orbit',
    stages: ['grass'], from: 12, to: 20, weight: 5,
  },
  {
    id: 'pidgeot', name: 'Pidgeot', dex: 26,
    shape: 'pidgeot', fallback: 'bat', palette: 'vermin',
    hp: 130, dmg: 18, speed: 48, r: 6, mass: 1.6, xp: 8,
    ai: 'charge',
    attack: { kind: 'burst', count: 5, spread: 1.1, range: 240, cooldown: 3.6, windup: 0.55, damage: 10, speed: 170 }, coinChance: 0.18, flying: true, knockResist: 0.55,
    stages: ['grass'], from: 13, to: 20, weight: 4,
  },
  {
    id: 'tauros', name: 'Tauros', dex: 27,
    shape: 'tauros', fallback: 'quad_small', palette: 'ground',
    // Heavy AND fast, which is the combination the grass stage otherwise never throws. The
    // ten-minute mini-boss, loose on the field from minute sixteen.
    hp: 190, dmg: 20, speed: 54, r: 6.5, mass: 4.5, xp: 9,
    ai: 'charge', coinChance: 0.18, knockResist: 0.7,
    stages: ['grass'], from: 16, to: 20, weight: 4,
  },

  // --- BEACH: water, sand and what scavenges them ----------------------------
  {
    id: 'poliwag', name: 'Poliwag', dex: 28,
    shape: 'poliwag', fallback: 'round_big', palette: 'water',
    hp: 15, dmg: 5, speed: 32, r: 4, mass: 0.9, xp: 1,
    ai: 'chase',
    stages: ['beach'], from: 0, to: 9, weight: 10,
  },
  {
    id: 'marill', name: 'Marill', dex: 29,
    shape: 'marill', fallback: 'round_big', palette: 'water',
    hp: 16, dmg: 6, speed: 40, r: 4, mass: 0.9, xp: 2,
    ai: 'sine', coinChance: 0.07,
    stages: ['beach'], from: 0, to: 10, weight: 9,
  },
  {
    id: 'zigzagoon', name: 'Zigzagoon', dex: 30,
    shape: 'zigzagoon', fallback: 'quad_small', palette: 'rattail',
    // It does not run at you so much as at where you were.
    hp: 14, dmg: 6, speed: 44, r: 4, mass: 0.9, xp: 2,
    ai: 'sine', coinChance: 0.08,
    stages: ['beach'], from: 0, to: 11, weight: 9,
  },
  {
    id: 'poochyena', name: 'Poochyena', dex: 31,
    shape: 'poochyena', fallback: 'quad_small', palette: 'shadowy',
    hp: 22, dmg: 8, speed: 42, r: 4, mass: 1, xp: 2,
    ai: 'chase', coinChance: 0.07,
    stages: ['beach'], from: 2, to: 12, weight: 8,
  },
  {
    id: 'sandygast', name: 'Sandygast', dex: 32,
    shape: 'sandygast', fallback: 'round_big', palette: 'ground',
    // A sandcastle that resents being stepped on. Slow, and it does not mind being shot.
    hp: 40, dmg: 9, speed: 14, r: 5, mass: 2.6, xp: 3,
    ai: 'chase',
    stages: ['beach'], from: 3, to: 14, weight: 7,
  },
  {
    id: 'poliwhirl', name: 'Poliwhirl', dex: 33,
    shape: 'poliwhirl', fallback: 'round_big', palette: 'water',
    hp: 58, dmg: 12, speed: 34, r: 5, mass: 1.6, xp: 4,
    ai: 'chase',
    stages: ['beach'], from: 6, to: 18, weight: 7,
  },
  {
    id: 'linoone', name: 'Linoone', dex: 34,
    shape: 'linoone', fallback: 'quad_small', palette: 'rattail',
    // The fastest thing in the game. It will reach you; the question is what is behind it.
    hp: 62, dmg: 13, speed: 58, r: 5, mass: 1.4, xp: 5,
    ai: 'rusher', coinChance: 0.09,
    stages: ['beach'], from: 8, to: 20, weight: 7,
  },
  {
    id: 'azumarill', name: 'Azumarill', dex: 35,
    shape: 'azumarill', fallback: 'round_big', palette: 'water',
    // The board's paymaster: slow, tough, and worth going out of your way for.
    hp: 120, dmg: 15, speed: 30, r: 6, mass: 3.2, xp: 6,
    ai: 'charge', coinChance: 0.45, armor: 2, knockResist: 0.6,
    stages: ['beach'], from: 9, to: 20, weight: 5,
  },
  {
    id: 'mightyena', name: 'Mightyena', dex: 36,
    shape: 'mightyena', fallback: 'quad_small', palette: 'shadowy',
    hp: 96, dmg: 16, speed: 46, r: 5.5, mass: 1.9, xp: 6,
    ai: 'rusher', coinChance: 0.12, armor: 1,
    stages: ['beach'], from: 10, to: 20, weight: 6,
  },
  {
    id: 'poliwrath', name: 'Poliwrath', dex: 37,
    shape: 'poliwrath', fallback: 'round_big', palette: 'water',
    hp: 175, dmg: 19, speed: 28, r: 6.5, mass: 4, xp: 8,
    ai: 'charge',
    attack: { kind: 'burst', count: 6, spread: 1.4, range: 230, cooldown: 3.6, windup: 0.6, damage: 11, speed: 140 }, coinChance: 0.16, armor: 3, knockResist: 0.75,
    stages: ['beach'], from: 12, to: 20, weight: 4,
  },
  {
    id: 'palossand', name: 'Palossand', dex: 38,
    shape: 'palossand', fallback: 'round_big', palette: 'ground',
    // A whirlpool of sand with a shovel on top. The beach's wall.
    hp: 200, dmg: 19, speed: 13, r: 6.5, mass: 4.8, xp: 8,
    ai: 'charge',
    attack: { kind: 'burst', count: 8, range: 240, cooldown: 4.0, windup: 0.7, damage: 11, speed: 120 }, coinChance: 0.18, armor: 5, knockResist: 0.85,
    stages: ['beach'], from: 13, to: 20, weight: 4,
  },
];

/**
 * The fallback boss line-up. Tiers 1-3 are the 5/10/15 minute mini-bosses and tier 4 is the
 * 20:00 finale.
 *
 * Each stage names its OWN four in data/stages.js, because the roster is stage-exclusive: a
 * global list meant the beach fought a Graveler that never otherwise sets foot there. This is
 * only reached by a stage that declares none.
 *
 * Naming them is deliberate either way: picking "whatever is fifth in the stage list" -- which
 * is what this did once -- meant the mini-boss silently changed identity every time the roster
 * was reordered.
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
