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
    id: 'might', name: 'Might', icon: 'power', maxPicks: 7,
    desc: '+15% attack power',
    mods: [{ stat: 'power', op: 'inc', value: 0.15 }],
  },
  {
    id: 'haste', name: 'Haste', icon: 'speed', maxPicks: 7,
    desc: '+12% attack speed',
    mods: [{ stat: 'attackSpeed', op: 'inc', value: 0.12 }],
  },
  {
    id: 'swiftness', name: 'Swiftness', icon: 'boots', maxPicks: 6,
    desc: '+10% movement speed',
    mods: [{ stat: 'moveSpeed', op: 'inc', value: 0.10 }],
  },
  {
    id: 'multishot', name: 'Multishot', icon: 'amount', maxPicks: 5,
    desc: '+1 projectile',
    mods: [{ stat: 'amount', op: 'flat', value: 1 }],
  },
  {
    id: 'reach', name: 'Reach', icon: 'area', maxPicks: 6,
    desc: '+15% area of effect',
    mods: [{ stat: 'area', op: 'inc', value: 0.15 }],
  },
  {
    id: 'piercing', name: 'Piercing', icon: 'pierce', maxPicks: 5,
    desc: '+1 pierce',
    mods: [{ stat: 'pierce', op: 'flat', value: 1 }],
  },
  {
    id: 'velocity', name: 'Velocity', icon: 'proj', maxPicks: 5,
    desc: '+20% projectile speed',
    mods: [{ stat: 'projSpeed', op: 'inc', value: 0.20 }],
  },
  {
    id: 'endurance', name: 'Endurance', icon: 'heart', maxPicks: 7,
    desc: '+20 max HP, and heal for 20',
    mods: [{ stat: 'maxHp', op: 'flat', value: 20 }],
    heal: 20,
  },
  {
    id: 'vigor', name: 'Vigor', icon: 'regen', maxPicks: 5,
    desc: '+0.4 HP regen per second',
    mods: [{ stat: 'regen', op: 'flat', value: 0.4 }],
  },
  {
    id: 'guard', name: 'Guard', icon: 'shield', maxPicks: 5,
    desc: '+1 armor',
    mods: [{ stat: 'armor', op: 'flat', value: 1 }],
  },
  {
    id: 'focus', name: 'Focus', icon: 'crit', maxPicks: 6,
    desc: '+6% critical chance',
    mods: [{ stat: 'crit', op: 'flat', value: 0.06 }],
  },
  {
    id: 'magnetism', name: 'Magnetism', icon: 'magnet', maxPicks: 5,
    desc: '+25% pickup radius',
    mods: [{ stat: 'magnet', op: 'inc', value: 0.25 }],
  },
  {
    id: 'growth', name: 'Growth', icon: 'xp', maxPicks: 5,
    desc: '+12% experience gained',
    mods: [{ stat: 'xpGain', op: 'inc', value: 0.12 }],
  },
  {
    id: 'lingering', name: 'Lingering', icon: 'duration', maxPicks: 5,
    desc: '+20% effect duration',
    mods: [{ stat: 'duration', op: 'inc', value: 0.20 }],
  },
];

/** Passive items. Each is also the key that evolves exactly one weapon. */
export const PASSIVES = [
  { id: 'mystic_water', name: 'Mystic Water', maxPicks: 7, evolves: 'mud_shot',
    desc: '+10% area. Evolves Mud Shot.', mods: [{ stat: 'area', op: 'inc', value: 0.10 }] },
  { id: 'silk_scarf', name: 'Silk Scarf', maxPicks: 7, evolves: 'swift_star',
    desc: '+10% attack power. Evolves Swift Star.', mods: [{ stat: 'power', op: 'inc', value: 0.10 }] },
  { id: 'sharp_beak', name: 'Sharp Beak', maxPicks: 7, evolves: 'leaf_arrow',
    desc: '+10% projectile speed. Evolves Leaf Arrow.', mods: [{ stat: 'projSpeed', op: 'inc', value: 0.10 }] },
  { id: 'charcoal', name: 'Charcoal', maxPicks: 7, evolves: 'ember_spit',
    desc: '+8% attack speed. Evolves Ember Spit.', mods: [{ stat: 'attackSpeed', op: 'inc', value: 0.08 }] },
  { id: 'never_melt_ice', name: 'Never-Melt Ice', maxPicks: 7, evolves: 'powder_snow',
    desc: '+12% duration. Evolves Powder Snow.', mods: [{ stat: 'duration', op: 'inc', value: 0.12 }] },
  { id: 'poison_barb', name: 'Poison Barb', maxPicks: 7, evolves: 'sludge_bomb',
    desc: '+0.3 HP per second. Evolves Sludge Bomb.', mods: [{ stat: 'regen', op: 'flat', value: 0.3 }] },
  { id: 'sea_incense', name: 'Sea Incense', maxPicks: 7, evolves: 'bubble_beam',
    desc: '+15 max health. Evolves Bubble Beam.', mods: [{ stat: 'maxHp', op: 'flat', value: 15 }] },
  { id: 'magnet_item', name: 'Magnet', maxPicks: 7, evolves: 'spark_chain',
    desc: '+20% pickup range. Evolves Spark Chain.', mods: [{ stat: 'magnet', op: 'inc', value: 0.20 }] },
  { id: 'black_glasses', name: 'Black Glasses', maxPicks: 7, evolves: 'foul_play',
    desc: '+4% critical chance. Evolves Foul Play.', mods: [{ stat: 'crit', op: 'flat', value: 0.04 }] },
  { id: 'pretty_wing', name: 'Pretty Wing', maxPicks: 7, evolves: 'aerial_ace',
    desc: '+6% movement speed. Evolves Aerial Ace.', mods: [{ stat: 'moveSpeed', op: 'inc', value: 0.06 }] },
  { id: 'spell_tag', name: 'Spell Tag', maxPicks: 7, evolves: 'shadow_ball',
    desc: '+20% critical damage. Evolves Shadow Ball.', mods: [{ stat: 'critMult', op: 'flat', value: 0.20 }] },
  { id: 'quick_claw', name: 'Quick Claw', maxPicks: 7, evolves: null,
    desc: '-6% ability cooldown', mods: [{ stat: 'cooldown', op: 'inc', value: -0.06 }] },
  { id: 'lucky_egg', name: 'Lucky Egg', maxPicks: 7, evolves: null,
    desc: '+12% experience', mods: [{ stat: 'xpGain', op: 'inc', value: 0.12 }] },
  { id: 'amulet_coin', name: 'Amulet Coin', maxPicks: 7, evolves: null,
    desc: '+15% gold found', mods: [{ stat: 'greed', op: 'inc', value: 0.15 }] },
];

export const STAT_BY_ID = Object.fromEntries(STAT_UPGRADES.map((u) => [u.id, u]));
export const PASSIVE_BY_ID = Object.fromEntries(PASSIVES.map((u) => [u.id, u]));
