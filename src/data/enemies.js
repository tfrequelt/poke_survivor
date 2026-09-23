// L0 -- pure data. Enemy definitions.
//
// `shape` x `palette` picks the sprite (see data/art.js), `ai` is a string key resolved by the
// registry in enemies.js. Nothing here imports a system, so this file can be read by the pokedex
// screen, the spawn director and the renderer without any risk of an import cycle.
//
// SPATIAL UNITS ARE HALVED relative to the balance pass, which was written for a 1280x720 space.
// Speeds are px/s and radii are px in the 640x360 render space. HP, damage and XP are unscaled.
//
// `from` / `to` are the minute window in which the spawn director may roll this enemy.

export const ENEMIES = [
  {
    id: 'rattail', name: 'Rattail', dex: 1,
    shape: 'quad_small', palette: 'rattail',
    hp: 10, dmg: 6, speed: 23, r: 4, mass: 1, xp: 1,
    ai: 'chase', coinChance: 0.06,
    stages: ['grass', 'cave', 'beach'], from: 0, to: 12, weight: 10,
  },
  {
    id: 'vermin', name: 'Vermin', dex: 2,
    shape: 'quad_small', palette: 'vermin',
    hp: 16, dmg: 7, speed: 26, r: 4, mass: 1.1, xp: 1,
    ai: 'chase', coinChance: 0.06,
    stages: ['grass', 'beach'], from: 2, to: 20, weight: 10,
  },
  {
    id: 'flittermouse', name: 'Flittermouse', dex: 3,
    shape: 'bat', palette: 'cavebat',
    hp: 8, dmg: 5, speed: 37, r: 3.5, mass: 0.7, xp: 1,
    ai: 'sine', coinChance: 0.05, flying: true,
    stages: ['grass', 'cave'], from: 1, to: 20, weight: 8,
  },
  {
    id: 'grubling', name: 'Grubling', dex: 4,
    shape: 'bug', palette: 'grub',
    hp: 24, dmg: 5, speed: 16, r: 5, mass: 1.6, xp: 2,
    ai: 'chase', coinChance: 0.07,
    stages: ['grass', 'cave'], from: 3, to: 20, weight: 7,
  },
  {
    id: 'wisp', name: 'Wisp', dex: 5,
    shape: 'bat', palette: 'ghostly',
    hp: 14, dmg: 8, speed: 30, r: 3.5, mass: 0.6, xp: 2,
    ai: 'orbit', coinChance: 0.06, flying: true,
    stages: ['cave', 'grass'], from: 6, to: 20, weight: 6,
  },
  {
    id: 'toxifly', name: 'Toxifly', dex: 6,
    shape: 'bug', palette: 'poison',
    hp: 30, dmg: 9, speed: 28, r: 4.5, mass: 1.2, xp: 3,
    ai: 'rusher', coinChance: 0.08, flying: true,
    stages: ['grass', 'cave', 'beach'], from: 8, to: 20, weight: 6,
  },
  {
    id: 'nipper', name: 'Nipper', dex: 7,
    shape: 'round_big', palette: 'crab',
    hp: 45, dmg: 11, speed: 18, r: 5, mass: 2.4, xp: 4,
    ai: 'charge', coinChance: 0.10, knockResist: 0.4,
    stages: ['beach', 'grass'], from: 5, to: 20, weight: 5,
  },
  {
    id: 'cragfist', name: 'Cragfist', dex: 8,
    shape: 'round_big', palette: 'rock',
    hp: 70, dmg: 14, speed: 13, r: 5.5, mass: 3.5, xp: 5,
    ai: 'charge', coinChance: 0.12, armor: 2, knockResist: 0.7,
    stages: ['cave', 'grass'], from: 6, to: 20, weight: 4,
  },
];

// --- Destructible scenery ---------------------------------------------------
// Modelled as stationary, harmless enemies. `stages: []` keeps the spawn director from ever
// rolling them -- they are placed by the prop system instead.
for (const [id, shape, palette, hp, r, coin] of [
  ['prop_bush', 'prop_bush', 'grass', 14, 8, 0.35],
  ['prop_rock', 'prop_rock', 'rock', 30, 8, 0.45],
  ['prop_crate', 'prop_crate', 'vermin', 20, 8, 0.70],
]) {
  ENEMIES.push({
    id, name: id, shape, palette,
    hp, dmg: 0, speed: 0, r, mass: 99, xp: 0,
    ai: 'static', coinChance: coin, knockResist: 1,
    prop: true, harmless: true, noScale: true,
    stages: [], from: 0, to: 0, weight: 0,
  });
}

export const ENEMY_BY_ID = Object.fromEntries(ENEMIES.map((e) => [e.id, e]));

/** Every (shape, palette) pair the enemy roster needs, plus the gold elite recolour of each shape. */
export function enemySpritePairs() {
  const pairs = new Set();
  for (const e of ENEMIES) {
    pairs.add(`${e.shape}:${e.palette}`);
    pairs.add(`${e.shape}:elite`);
  }
  return [...pairs].map((s) => s.split(':'));
}
