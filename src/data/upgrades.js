// L0 -- pure data. The level-up card pool.
//
// Four kinds of card:
//   'stat'    generic stat ups, always available, capped so nothing breaks
//   'weapon'  gain or level a weapon (including one borrowed from another starter)
//   'passive' passive items, which are also what unlock weapon evolutions
//   'ability' the manually-fired active, one slot only
//
// `op` follows the stat model in stats.js. Almost everything is 'inc' on purpose: eight +15%
// cards should read as +120%, not x3.06. Reserve 'more' for evolutions.

export const STAT_UPGRADES = [
  {
    id: 'might', name: 'Might', icon: 'power', maxPicks: 5,
    desc: '+15% attack power',
    mods: [{ stat: 'power', op: 'inc', value: 0.15 }],
  },
  {
    id: 'haste', name: 'Haste', icon: 'speed', maxPicks: 5,
    desc: '+12% attack speed',
    mods: [{ stat: 'attackSpeed', op: 'inc', value: 0.12 }],
  },
  {
    id: 'swiftness', name: 'Swiftness', icon: 'boots', maxPicks: 4,
    desc: '+10% movement speed',
    mods: [{ stat: 'moveSpeed', op: 'inc', value: 0.10 }],
  },
  {
    id: 'multishot', name: 'Multishot', icon: 'amount', maxPicks: 3,
    desc: '+1 projectile',
    mods: [{ stat: 'amount', op: 'flat', value: 1 }],
  },
  {
    id: 'reach', name: 'Reach', icon: 'area', maxPicks: 4,
    desc: '+15% area of effect',
    mods: [{ stat: 'area', op: 'inc', value: 0.15 }],
  },
  {
    id: 'piercing', name: 'Piercing', icon: 'pierce', maxPicks: 3,
    desc: '+1 pierce',
    mods: [{ stat: 'pierce', op: 'flat', value: 1 }],
  },
  {
    id: 'velocity', name: 'Velocity', icon: 'proj', maxPicks: 3,
    desc: '+20% projectile speed',
    mods: [{ stat: 'projSpeed', op: 'inc', value: 0.20 }],
  },
  {
    id: 'endurance', name: 'Endurance', icon: 'heart', maxPicks: 5,
    desc: '+20 max HP, and heal for 20',
    mods: [{ stat: 'maxHp', op: 'flat', value: 20 }],
    heal: 20,
  },
  {
    id: 'vigor', name: 'Vigor', icon: 'regen', maxPicks: 3,
    desc: '+0.4 HP regen per second',
    mods: [{ stat: 'regen', op: 'flat', value: 0.4 }],
  },
  {
    id: 'guard', name: 'Guard', icon: 'shield', maxPicks: 3,
    desc: '+1 armor',
    mods: [{ stat: 'armor', op: 'flat', value: 1 }],
  },
  {
    id: 'focus', name: 'Focus', icon: 'crit', maxPicks: 4,
    desc: '+6% critical chance',
    mods: [{ stat: 'crit', op: 'flat', value: 0.06 }],
  },
  {
    id: 'magnetism', name: 'Magnetism', icon: 'magnet', maxPicks: 3,
    desc: '+25% pickup radius',
    mods: [{ stat: 'magnet', op: 'inc', value: 0.25 }],
  },
  {
    id: 'growth', name: 'Growth', icon: 'xp', maxPicks: 3,
    desc: '+12% experience gained',
    mods: [{ stat: 'xpGain', op: 'inc', value: 0.12 }],
  },
  {
    id: 'lingering', name: 'Lingering', icon: 'duration', maxPicks: 3,
    desc: '+20% effect duration',
    mods: [{ stat: 'duration', op: 'inc', value: 0.20 }],
  },
];

/** Passive items. Each is also the key that evolves exactly one weapon. */
export const PASSIVES = [
  { id: 'mystic_water', name: 'Mystic Water', maxPicks: 5, evolves: 'mud_shot',
    desc: '+10% area', mods: [{ stat: 'area', op: 'inc', value: 0.10 }] },
  { id: 'silk_scarf', name: 'Silk Scarf', maxPicks: 5, evolves: 'swift_star',
    desc: '+10% attack power', mods: [{ stat: 'power', op: 'inc', value: 0.10 }] },
  { id: 'sharp_beak', name: 'Sharp Beak', maxPicks: 5, evolves: 'leaf_arrow',
    desc: '+10% projectile speed', mods: [{ stat: 'projSpeed', op: 'inc', value: 0.10 }] },
  { id: 'quick_claw', name: 'Quick Claw', maxPicks: 5, evolves: null,
    desc: '-6% ability cooldown', mods: [{ stat: 'cooldown', op: 'inc', value: -0.06 }] },
  { id: 'lucky_egg', name: 'Lucky Egg', maxPicks: 5, evolves: null,
    desc: '+12% experience', mods: [{ stat: 'xpGain', op: 'inc', value: 0.12 }] },
  { id: 'amulet_coin', name: 'Amulet Coin', maxPicks: 5, evolves: null,
    desc: '+15% gold found', mods: [{ stat: 'greed', op: 'inc', value: 0.15 }] },
];

export const STAT_BY_ID = Object.fromEntries(STAT_UPGRADES.map((u) => [u.id, u]));
export const PASSIVE_BY_ID = Object.fromEntries(PASSIVES.map((u) => [u.id, u]));
