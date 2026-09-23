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
//
// NO TWO WEAPONS SHARE A DELIVERY MECHANISM. That is the design rule: the visual fields (spin,
// trail, pulse, impact, amp/freq) exist so that even two weapons using `straight` do not read as
// the same shot in a different colour.

export const WEAPONS = [
  // --- The three signature weapons -----------------------------------------
  {
    id: 'mud_shot', name: 'Mud Shot', owner: 'wooper',
    desc: 'A heavy glob that thuds into the ground and leaves a slowing puddle.',
    behavior: 'projectile', aim: 'nearest', motion: 'arc',
    sprite: 'proj_bubble', palette: 'water',
    damage: 14, cooldown: 1.30, amount: 1, speed: 170, area: 1, pierce: 0, duration: 1.4,
    r: 5, range: 210, spread: 0.26, knockback: 18, usesAmount: true,
    // Lands and leaves a puddle -- the thing its description always promised.
    zoneOnEnd: { r: 30, life: 2.0, dps: 8, slow: 0.35, color: '#4aa8e8' },
    pulse: 0.18, impact: 7, impactColor: '#a8e4ff',
    levels: [
      {}, { amount: +1 }, { damage: +5 }, { cooldownMul: 0.9 },
      { amount: +1 }, { damage: +7 }, { cooldownMul: 0.88 }, { areaMul: 1.25, damage: +8 },
    ],
    evolution: { into: 'quagmire', needPassive: 'mystic_water' },
  },
  {
    id: 'swift_star', name: 'Swift Star', owner: 'eevee',
    desc: 'Stars that lurch, then snap toward whatever is closest. They never miss.',
    behavior: 'projectile', aim: 'nearest', motion: 'accelerate',
    sprite: 'proj_star', palette: 'normal',
    damage: 9, cooldown: 0.85, amount: 2, speed: 240, area: 1, pierce: 1, duration: 1.3,
    r: 4, range: 190, spread: 0.45, knockback: 8, usesAmount: true,
    spin: 9, trail: 26, trailColor: '#e4e8ee', impact: 4, impactColor: '#ffffff',
    levels: [
      {}, { amount: +1 }, { damage: +3 }, { cooldownMul: 0.9 },
      { amount: +1 }, { damage: +4 }, { cooldownMul: 0.88 }, { amount: +1, pierce: +1 },
    ],
    evolution: { into: 'star_barrage', needPassive: 'silk_scarf' },
  },
  {
    id: 'leaf_arrow', name: 'Leaf Arrow', owner: 'rowlet',
    desc: 'A spinning blade that drifts on the wind and punches through a whole line.',
    behavior: 'projectile', aim: 'toughest', motion: 'wave',
    sprite: 'proj_leaf', palette: 'grass',
    damage: 30, cooldown: 1.55, amount: 1, speed: 320, area: 1, pierce: 3, duration: 1.6,
    r: 5, range: 350, spread: 0.16, knockback: 14, usesAmount: true,
    spin: 14, amp: 52, freq: 7, trail: 18, trailColor: '#c4f29a', impact: 5, impactColor: '#6cc840',
    levels: [
      {}, { amount: +1 }, { damage: +10 }, { cooldownMul: 0.9 },
      { pierce: +2 }, { damage: +12 }, { cooldownMul: 0.88 }, { amount: +1, damage: +14 },
    ],
    evolution: { into: 'spirit_shackle', needPassive: 'sharp_beak' },
  },

  // --- Draftable by anyone --------------------------------------------------
  {
    id: 'rock_orbit', name: 'Rock Orbit',
    desc: 'Stones circle you, crushing whatever they sweep through.',
    behavior: 'orbit', aim: 'nearest', motion: 'orbitPlayer',
    sprite: 'proj_rock', palette: 'rock',
    damage: 18, cooldown: 3.0, amount: 2, speed: 0, area: 1, pierce: 9999, duration: 3.0,
    r: 6, range: 0, spread: 0, knockback: 34, usesAmount: true,
    orbitRadius: 44, orbitSpeed: 2.6, spin: 2.6,
    impact: 6, impactColor: '#c8c0ad',
    levels: [
      {}, { amount: +1 }, { damage: +7 }, { cooldownMul: 0.88 },
      { amount: +1 }, { damage: +9 }, { areaMul: 1.2 }, { amount: +2, damage: +12 },
    ],
  },
  {
    id: 'toxic_trail', name: 'Toxic Trail',
    desc: 'Poison clouds drip off you as you move. Standing still wastes it.',
    behavior: 'trail', aim: 'nearest', motion: 'drift',
    sprite: 'proj_cloud', palette: 'poison',
    damage: 16, cooldown: 0.75, amount: 1, speed: 0, area: 1, pierce: 0, duration: 2.6,
    r: 20, range: 0, spread: 0, knockback: 0, usesAmount: false,
    slow: 0.2, zoneColor: '#b050d0',
    levels: [
      {}, { damage: +5 }, { cooldownMul: 0.88 }, { areaMul: 1.2 },
      { damage: +7 }, { cooldownMul: 0.86 }, { areaMul: 1.2 }, { damage: +12 },
    ],
  },
  {
    id: 'spark_chain', name: 'Spark Chain',
    desc: 'Lightning that leaps between enemies. The tighter the crowd, the better.',
    behavior: 'chain', aim: 'nearest', motion: 'straight',
    sprite: 'proj_spark', palette: 'electric',
    damage: 22, cooldown: 1.9, amount: 0, speed: 0, area: 1, pierce: 0, duration: 0.2,
    r: 4, range: 170, spread: 0, knockback: 0, usesAmount: true,
    jumps: 3, jumpRange: 80, falloff: 0.88, arcColor: '#f8e038',
    levels: [
      {}, { jumps: +1 }, { damage: +8 }, { cooldownMul: 0.88 },
      { jumps: +1 }, { damage: +11 }, { cooldownMul: 0.86 }, { jumps: +2, damage: +15 },
    ],
  },
  {
    id: 'bonemerang', name: 'Bonemerang',
    desc: 'Flies out, stalls, and comes back through everything a second time.',
    behavior: 'projectile', aim: 'nearest', motion: 'boomerang',
    sprite: 'proj_bone', palette: 'normal',
    damage: 20, cooldown: 1.7, amount: 1, speed: 260, area: 1, pierce: 3, duration: 1.8,
    r: 6, range: 200, spread: 0.34, knockback: 22, usesAmount: true,
    spin: 13, trail: 14, trailColor: '#e4e8ee', impact: 5, impactColor: '#a8aeb8',
    levels: [
      {}, { amount: +1 }, { damage: +8 }, { cooldownMul: 0.9 },
      { pierce: +2 }, { damage: +10 }, { cooldownMul: 0.88 }, { amount: +1, damage: +14 },
    ],
  },
  {
    id: 'pulse_aura', name: 'Pulse Aura',
    desc: 'A field that simply hurts anything near you. No aiming, ever.',
    behavior: 'aura', aim: 'nearest', motion: 'orbitPlayer',
    sprite: 'proj_bubble', palette: 'psychic',
    damage: 7, cooldown: 0.45, amount: 1, speed: 0, area: 1, pierce: 9999, duration: 0.5,
    r: 34, range: 0, spread: 0, knockback: 6, usesAmount: false,
    pulse: 0.3, impact: 0,
    levels: [
      {}, { damage: +3 }, { areaMul: 1.15 }, { cooldownMul: 0.88 },
      { damage: +4 }, { areaMul: 1.15 }, { cooldownMul: 0.86 }, { damage: +7, areaMul: 1.2 },
    ],
  },
];

// --- Evolved forms ----------------------------------------------------------
// Reached by holding a maxed weapon plus its paired passive and opening a chest. Each is a
// genuine upgrade in KIND, not just bigger numbers -- that is the point of evolving.
WEAPONS.push(
  {
    id: 'quagmire', name: 'Quagmire', evolvedFrom: 'mud_shot', hidden: true,
    desc: 'A torrent of mud that drowns whole stretches of ground.',
    behavior: 'projectile', aim: 'nearest', motion: 'arc',
    sprite: 'proj_bubble', palette: 'water',
    damage: 44, cooldown: 0.95, amount: 3, speed: 190, area: 1.5, pierce: 2, duration: 1.4,
    r: 7, range: 230, spread: 0.30, knockback: 26, usesAmount: true,
    zoneOnEnd: { r: 52, life: 3.4, dps: 26, slow: 0.55, color: '#4aa8e8' },
    pulse: 0.22, impact: 10, impactColor: '#a8e4ff',
    levels: [{}],
  },
  {
    id: 'star_barrage', name: 'Star Barrage', evolvedFrom: 'swift_star', hidden: true,
    desc: 'An unending stream of stars, and they all find something.',
    behavior: 'projectile', aim: 'nearest', motion: 'accelerate',
    sprite: 'proj_star', palette: 'normal',
    damage: 26, cooldown: 0.34, amount: 5, speed: 280, area: 1.2, pierce: 3, duration: 1.4,
    r: 4, range: 230, spread: 0.55, knockback: 10, usesAmount: true,
    spin: 12, trail: 34, trailColor: '#ffffff', impact: 6, impactColor: '#ffffff',
    levels: [{}],
  },
  {
    id: 'spirit_shackle', name: 'Spirit Shackle', evolvedFrom: 'leaf_arrow', hidden: true,
    desc: 'Arrows that pin whatever they pass through.',
    behavior: 'projectile', aim: 'toughest', motion: 'wave',
    sprite: 'proj_leaf', palette: 'ghostly',
    damage: 95, cooldown: 1.05, amount: 3, speed: 360, area: 1.3, pierce: 9, duration: 1.8,
    r: 6, range: 380, spread: 0.20, knockback: 20, usesAmount: true,
    spin: 16, amp: 44, freq: 6, trail: 26, trailColor: '#c0b8e0', impact: 8, impactColor: '#a0f0d0',
    levels: [{}],
  },
);

export const WEAPON_BY_ID = Object.fromEntries(WEAPONS.map((w) => [w.id, w]));

/** (shape, palette, rotations) triples the weapon set needs registered in the atlas. */
export function weaponSpritePairs() {
  const seen = new Set();
  const out = [];
  // Anything that must point where it flies gets baked rotations instead of a left/right flip.
  const ROTATED = new Set(['proj_leaf', 'proj_bone', 'proj_rock']);
  for (const w of WEAPONS) {
    const key = `${w.sprite}:${w.palette}`;
    if (seen.has(key)) continue;
    seen.add(key);
    out.push([w.sprite, w.palette, ROTATED.has(w.sprite) ? 16 : 0]);
  }
  return out;
}
