// L0 -- pure data. Weapon definitions.
//
// `behavior`, `aim` and `motion` are STRING KEYS resolved by registries in weapons.js, which is
// what keeps this file importable from anywhere (shop, pokedex, level-up screen) with no cycles.
//
// Spatial values (speed, range, r, spread distances) are in the 640x360 render space -- halved
// from the balance pass. Damage, cooldowns and multipliers are unscaled.
//
// `levels` index 0 is level 1 and is always empty; index N is what reaching level N+1 grants.
// The rhythm is deliberate and proven: +amount at 2/5/8, +damage at 3/6, -cooldown at 4/7.

export const WEAPONS = [
  {
    id: 'mud_shot', name: 'Mud Shot', owner: 'wooper',
    desc: 'Lobs a glob that bursts into a slowing puddle.',
    behavior: 'projectile', aim: 'nearest', motion: 'straight',
    sprite: 'proj_bubble', palette: 'water',
    damage: 14, cooldown: 1.30, amount: 1, speed: 170, area: 1, pierce: 0, duration: 1.4,
    r: 4, range: 210, spread: 0.22, knockback: 18, usesAmount: true,
    levels: [
      {}, { amount: +1 }, { damage: +5 }, { cooldownMul: 0.9 },
      { amount: +1 }, { damage: +7 }, { cooldownMul: 0.88 }, { areaMul: 1.25, damage: +8 },
    ],
    evolution: { into: 'quagmire', needPassive: 'mystic_water' },
  },
  {
    id: 'swift_star', name: 'Swift Star', owner: 'eevee',
    desc: 'Homing stars that never miss.',
    behavior: 'projectile', aim: 'nearest', motion: 'homing',
    sprite: 'proj_star', palette: 'normal',
    damage: 9, cooldown: 0.85, amount: 2, speed: 240, area: 1, pierce: 1, duration: 1.2,
    r: 3, range: 190, spread: 0.45, knockback: 8, usesAmount: true, homingTurn: 4.2,
    levels: [
      {}, { amount: +1 }, { damage: +3 }, { cooldownMul: 0.9 },
      { amount: +1 }, { damage: +4 }, { cooldownMul: 0.88 }, { amount: +1, pierce: +1 },
    ],
    evolution: { into: 'star_barrage', needPassive: 'silk_scarf' },
  },
  {
    id: 'leaf_arrow', name: 'Leaf Arrow', owner: 'rowlet',
    desc: 'A piercing shot that picks the toughest target.',
    behavior: 'projectile', aim: 'toughest', motion: 'straight',
    sprite: 'proj_leaf', palette: 'grass',
    damage: 30, cooldown: 1.55, amount: 1, speed: 320, area: 1, pierce: 3, duration: 1.6,
    r: 4, range: 350, spread: 0.16, knockback: 14, usesAmount: true,
    levels: [
      {}, { amount: +1 }, { damage: +10 }, { cooldownMul: 0.9 },
      { pierce: +2 }, { damage: +12 }, { cooldownMul: 0.88 }, { amount: +1, damage: +14 },
    ],
    evolution: { into: 'spirit_shackle', needPassive: 'sharp_beak' },
  },
];

export const WEAPON_BY_ID = Object.fromEntries(WEAPONS.map((w) => [w.id, w]));

/** (shape, palette, rotations) triples the weapon set needs registered in the atlas. */
export function weaponSpritePairs() {
  const seen = new Set();
  const out = [];
  for (const w of WEAPONS) {
    const key = `${w.sprite}:${w.palette}`;
    if (seen.has(key)) continue;
    seen.add(key);
    // A leaf or an arrow must point where it flies, so those get baked rotations instead of a flip.
    const rot = w.sprite === 'proj_leaf' ? 16 : 0;
    out.push([w.sprite, w.palette, rot]);
  }
  return out;
}
