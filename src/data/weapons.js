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
// TWO RULES HOLD THIS FILE TOGETHER, and initWeaponDefs() warns if either is broken:
//
//   1. Every draftable weapon has a `type`, and a Pokemon is only ever OFFERED weapons matching
//      one of its own types. Six per type, four slots -- so a run picks four of six, and Jolteon
//      and Umbreon genuinely play out of different toolboxes.
//
//   2. NO TWO DRAFTABLE WEAPONS SHARE A `behavior` + `motion` PAIR. A weapon earns its place by
//      being a different delivery mechanism, not a recolour: if the only way to tell two of them
//      apart is the palette, one of them should not exist.
//
// The visual fields (spin, trail, pulse, impact, amp/freq) then separate weapons that do share a
// behaviour, so two `cone` weapons still do not read as the same burst in a different colour.

export const WEAPONS = [
  // =========================================================================
  // WATER -- pushes, waves, and things that keep working while you run
  // =========================================================================
  {
    id: 'mud_shot', name: 'Mud Shot', owner: 'wooper', type: 'ground',
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
    id: 'bubble_beam', name: 'Bubble Beam', type: 'water',
    desc: 'Bubbles wind outward in a widening spiral. Standing in the middle is a mistake.',
    behavior: 'projectile', aim: 'nearest', motion: 'spiral',
    sprite: 'proj_bubble', palette: 'water',
    damage: 11, cooldown: 1.15, amount: 3, speed: 150, area: 1, pierce: 2, duration: 1.7,
    r: 5, range: 200, spread: 2.09, knockback: 10, usesAmount: true,
    freq: 3.4, pulse: 0.25, trail: 12, trailColor: '#bfe9ff', impact: 5, impactColor: '#a8e4ff',
    levels: [
      {}, { amount: +1 }, { damage: +4 }, { cooldownMul: 0.9 },
      { amount: +1 }, { damage: +6 }, { pierce: +2 }, { amount: +2, damage: +7 },
    ],
  },
  {
    id: 'tidal_surge', name: 'Tidal Surge', type: 'water',
    desc: 'A ring of water rolls out from you and shoves the whole crowd off your back.',
    behavior: 'nova', aim: 'nearest', motion: 'orbitPlayer',
    sprite: 'proj_ring', palette: 'water',
    damage: 8, cooldown: 3.8, amount: 1, speed: 0, area: 1, pierce: 0, duration: 0.85,
    r: 120, range: 0, spread: 0, knockback: 150, usesAmount: false,
    slow: 0.2, zoneColor: '#5ab6ef',
    levels: [
      {}, { damage: +3 }, { areaMul: 1.2 }, { cooldownMul: 0.88 },
      { damage: +4 }, { areaMul: 1.2 }, { cooldownMul: 0.86 }, { damage: +6, areaMul: 1.25 },
    ],
  },
  {
    id: 'whirlpool', name: 'Whirlpool', type: 'water',
    desc: 'Opens a vortex under the crowd and drags it all into one grinding heap.',
    behavior: 'pull', aim: 'nearest', motion: 'anchor',
    sprite: 'proj_vortex', palette: 'water',
    damage: 30, cooldown: 4.2, amount: 1, speed: 0, area: 1, pierce: 0, duration: 2.8,
    r: 56, range: 190, spread: 0, knockback: 0, usesAmount: false,
    pullForce: 150, slow: 0.4, zoneColor: '#2276bd',
    levels: [
      {}, { damage: +10 }, { areaMul: 1.15 }, { cooldownMul: 0.9 },
      { damage: +14 }, { areaMul: 1.15 }, { cooldownMul: 0.86 }, { damage: +22, areaMul: 1.2 },
    ],
  },
  {
    id: 'aqua_jet', name: 'Aqua Jet', type: 'water',
    desc: 'Builds pressure while you stand still and releases it the moment you move.',
    behavior: 'charge', aim: 'nearest', motion: 'straight',
    sprite: 'proj_shard', palette: 'water',
    damage: 11, cooldown: 0.22, amount: 1, speed: 330, area: 1, pierce: 3, duration: 1.2,
    r: 5, range: 260, spread: 0.16, knockback: 30, usesAmount: false,
    maxCharge: 6, chargeGain: 0.22,
    trail: 26, trailColor: '#bfe9ff', impact: 6, impactColor: '#ffffff',
    levels: [
      {}, { damage: +6 }, { pierce: +1 }, { cooldownMul: 0.88 },
      { damage: +8 }, { pierce: +2 }, { cooldownMul: 0.85 }, { damage: +14 },
    ],
  },
  {
    id: 'rain_dance', name: 'Rain Dance', type: 'water',
    desc: 'Calls down a squall that patters across a whole patch of ground.',
    behavior: 'rain', aim: 'nearest', motion: 'fall',
    sprite: 'proj_droplet', palette: 'water',
    damage: 26, cooldown: 1.7, amount: 7, speed: 0, area: 1, pierce: 0, duration: 0.7,
    r: 8, range: 230, spread: 0, knockback: 6, usesAmount: true,
    zoneRadius: 62, dropHeight: 170, impact: 5, impactColor: '#bfe9ff',
    levels: [
      {}, { amount: +2 }, { damage: +5 }, { cooldownMul: 0.9 },
      { amount: +2 }, { damage: +6 }, { areaMul: 1.2 }, { amount: +4, damage: +9 },
    ],
  },
  {
    id: 'brine_fang', name: 'Brine Fang', type: 'water',
    desc: 'A water sprite hunts on its own and worries whatever it catches.',
    behavior: 'companion', aim: 'nearest', motion: 'weave',
    sprite: 'proj_hound', palette: 'water',
    damage: 9, cooldown: 5.0, amount: 1, speed: 190, area: 1, pierce: 9999, duration: 5.2,
    r: 7, range: 260, spread: 0, knockback: 14, usesAmount: true,
    orbitRadius: 16, orbitSpeed: 9, trail: 10, trailColor: '#5ab6ef',
    impact: 4, impactColor: '#bfe9ff',
    levels: [
      {}, { damage: +4 }, { cooldownMul: 0.9 }, { amount: +1 },
      { damage: +5 }, { cooldownMul: 0.86 }, { areaMul: 1.2 }, { amount: +1, damage: +8 },
    ],
  },

  // =========================================================================
  // GROUND -- slow, heavy, and it owns the floor
  // =========================================================================
  {
    id: 'rock_orbit', name: 'Rock Orbit', type: 'ground',
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
    id: 'bonemerang', name: 'Bonemerang', type: 'ground',
    desc: 'Flies out, stalls, and comes back through everything a second time.',
    behavior: 'projectile', aim: 'nearest', motion: 'boomerang',
    sprite: 'proj_bone', palette: 'ground',
    damage: 20, cooldown: 1.7, amount: 1, speed: 260, area: 1, pierce: 3, duration: 1.8,
    r: 6, range: 200, spread: 0.34, knockback: 22, usesAmount: true,
    spin: 13, trail: 14, trailColor: '#c49a5e', impact: 5, impactColor: '#9a6c36',
    levels: [
      {}, { amount: +1 }, { damage: +8 }, { cooldownMul: 0.9 },
      { pierce: +2 }, { damage: +10 }, { cooldownMul: 0.88 }, { amount: +1, damage: +14 },
    ],
  },
  {
    id: 'sand_tomb', name: 'Sand Tomb', type: 'ground',
    desc: 'Buries traps around you. They do nothing at all until something walks onto one.',
    behavior: 'mine', aim: 'nearest', motion: 'anchor',
    sprite: 'proj_mine', palette: 'ground',
    damage: 24, cooldown: 3.0, amount: 2, speed: 0, area: 1, pierce: 0, duration: 9.0,
    r: 9, range: 74, spread: 0, knockback: 90, usesAmount: true,
    blastRadius: 34, impact: 9, impactColor: '#c49a5e',
    levels: [
      {}, { amount: +1 }, { damage: +7 }, { cooldownMul: 0.9 },
      { amount: +1 }, { damage: +10 }, { areaMul: 1.25 }, { amount: +2, damage: +14 },
    ],
  },
  {
    id: 'bulldoze', name: 'Bulldoze', type: 'ground',
    desc: 'A shockwave swung in a wide arc. Everything in front of you goes flying.',
    behavior: 'sweep', aim: 'nearest', motion: 'sweepArc',
    sprite: 'proj_blade', palette: 'ground',
    damage: 34, cooldown: 1.6, amount: 1, speed: 0, area: 1, pierce: 9999, duration: 0.3,
    r: 16, range: 90, spread: 0, knockback: 120, usesAmount: true,
    arcWidth: 2.6, orbitRadius: 34, impact: 7, impactColor: '#c49a5e',
    levels: [
      {}, { damage: +11 }, { areaMul: 1.15 }, { cooldownMul: 0.9 },
      { amount: +1 }, { damage: +15 }, { cooldownMul: 0.86 }, { damage: +24, areaMul: 1.25 },
    ],
  },
  {
    id: 'magnitude', name: 'Magnitude', type: 'ground',
    desc: 'A tremor rolls away from you and erupts wherever it happens to stop.',
    behavior: 'bloom', aim: 'nearest', motion: 'drift',
    sprite: 'proj_boulder', palette: 'ground',
    damage: 24, cooldown: 3.2, amount: 2, speed: 150, area: 1, pierce: 0, duration: 1.6,
    r: 8, range: 180, spread: 0.5, knockback: 70, usesAmount: true,
    fuse: 1.6, blastRadius: 52, spin: 3, impact: 10, impactColor: '#9a6c36',
    levels: [
      {}, { amount: +1 }, { damage: +8 }, { cooldownMul: 0.9 },
      { amount: +1 }, { damage: +10 }, { areaMul: 1.2 }, { amount: +1, damage: +15 },
    ],
  },

  // =========================================================================
  // NORMAL -- fast, clean, no gimmicks to learn
  // =========================================================================
  {
    id: 'swift_star', name: 'Swift Star', owner: 'eevee', type: 'normal',
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
    id: 'comet_punch', name: 'Comet Punch', type: 'normal',
    desc: 'A flurry of wild jabs. None of them travel far and all of them land.',
    behavior: 'cone', aim: 'nearest', motion: 'zigzag',
    sprite: 'proj_fist', palette: 'normal',
    damage: 12, cooldown: 1.0, amount: 5, speed: 260, area: 1, pierce: 0, duration: 0.42,
    r: 6, range: 100, spread: 0.24, knockback: 26, usesAmount: true,
    amp: 150, freq: 14, impact: 5, impactColor: '#ffffff',
    levels: [
      {}, { amount: +2 }, { damage: +4 }, { cooldownMul: 0.9 },
      { amount: +2 }, { damage: +6 }, { cooldownMul: 0.86 }, { amount: +3, damage: +9 },
    ],
  },
  {
    id: 'tri_attack', name: 'Tri Attack', type: 'normal',
    desc: 'One bolt that shatters into three the instant it touches anything.',
    behavior: 'split', aim: 'nearest', motion: 'wave',
    sprite: 'proj_shard', palette: 'normal',
    damage: 24, cooldown: 1.45, amount: 1, speed: 280, area: 1, pierce: 0, duration: 1.3,
    r: 5, range: 240, spread: 0.3, knockback: 14, usesAmount: false,
    shards: 3, amp: 34, freq: 9, spin: 8, trail: 16, trailColor: '#e4e8ee',
    impact: 6, impactColor: '#ffffff',
    levels: [
      {}, { shards: +1 }, { damage: +8 }, { cooldownMul: 0.9 },
      { shards: +1 }, { damage: +11 }, { cooldownMul: 0.86 }, { shards: +2, damage: +16 },
    ],
  },
  {
    id: 'hyper_fang', name: 'Hyper Fang', type: 'normal',
    desc: 'Bites clean through one target and springs at the next, harder every time.',
    behavior: 'bouncer', aim: 'nearest', motion: 'homing',
    sprite: 'proj_fang', palette: 'normal',
    damage: 20, cooldown: 1.8, amount: 1, speed: 300, area: 1, pierce: 0, duration: 0.7,
    r: 6, range: 210, spread: 0.3, knockback: 20, usesAmount: true,
    bounces: 3, bounceGain: 0.35, homingTurn: 7,
    trail: 18, trailColor: '#e4e8ee', impact: 6, impactColor: '#ffffff',
    levels: [
      {}, { bounces: +1 }, { damage: +7 }, { cooldownMul: 0.9 },
      { bounces: +1 }, { damage: +9 }, { cooldownMul: 0.86 }, { bounces: +2, damage: +14 },
    ],
  },
  {
    id: 'fury_swipes', name: 'Fury Swipes', type: 'normal',
    desc: 'A cloud of claws swarms one target and does not let go.',
    behavior: 'swarm', aim: 'nearest', motion: 'weave',
    sprite: 'proj_claw', palette: 'normal',
    damage: 7, cooldown: 2.4, amount: 4, speed: 200, area: 1, pierce: 9999, duration: 2.2,
    r: 5, range: 220, spread: 0, knockback: 4, usesAmount: true,
    orbitRadius: 16, orbitSpeed: 8, impact: 3, impactColor: '#ffffff',
    levels: [
      {}, { amount: +1 }, { damage: +3 }, { cooldownMul: 0.9 },
      { amount: +1 }, { damage: +4 }, { cooldownMul: 0.86 }, { amount: +2, damage: +6 },
    ],
  },
  {
    id: 'giga_impact', name: 'Giga Impact', type: 'normal',
    desc: 'Winds up while you hold still, then leaps and lands on something.',
    behavior: 'charge', aim: 'nearest', motion: 'dive',
    sprite: 'proj_boulder', palette: 'normal',
    damage: 40, cooldown: 0.3, amount: 1, speed: 190, area: 1, pierce: 2, duration: 0.85,
    r: 10, range: 200, spread: 0.3, knockback: 110, usesAmount: false,
    maxCharge: 4, chargeGain: 0.45, amp: 34, spin: 6,
    impact: 10, impactColor: '#ffffff',
    levels: [
      {}, { damage: +12 }, { pierce: +1 }, { cooldownMul: 0.9 },
      { damage: +16 }, { areaMul: 1.2 }, { cooldownMul: 0.86 }, { damage: +28, pierce: +2 },
    ],
  },

  // =========================================================================
  // ELECTRIC -- reaches across the crowd and locks it down
  // =========================================================================
  {
    id: 'spark_chain', name: 'Spark Chain', type: 'electric',
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
    id: 'thunder_fang', name: 'Thunder Fang', type: 'electric',
    desc: 'A live bolt that snaps side to side instead of flying straight.',
    behavior: 'projectile', aim: 'nearest', motion: 'zigzag',
    sprite: 'proj_fang', palette: 'electric',
    damage: 17, cooldown: 0.95, amount: 2, speed: 300, area: 1, pierce: 2, duration: 0.95,
    r: 5, range: 240, spread: 0.3, knockback: 12, usesAmount: true,
    amp: 190, freq: 11, trail: 24, trailColor: '#fffaa8', impact: 5, impactColor: '#f8e038',
    levels: [
      {}, { amount: +1 }, { damage: +6 }, { cooldownMul: 0.9 },
      { amount: +1 }, { damage: +8 }, { pierce: +2 }, { amount: +1, damage: +12 },
    ],
  },
  {
    id: 'volt_coil', name: 'Volt Coil', type: 'electric',
    desc: 'Leave a coil behind and it keeps firing at whatever comes near it.',
    behavior: 'turret', aim: 'nearest', motion: 'anchor',
    sprite: 'proj_coil', palette: 'electric',
    damage: 30, cooldown: 5.5, amount: 1, speed: 0, area: 1, pierce: 0, duration: 7.0,
    r: 0, range: 0, spread: 0, knockback: 0, usesAmount: false,
    emitGap: 0.42, emitRange: 170, emitSpeed: 300, emitLife: 0.8, emitDamage: 0.8,
    emitR: 4, emitPierce: 1, emitTrail: 20,
    emitSprite: 'proj_spark', emitPalette: 'electric',
    trailColor: '#fffaa8', impact: 5, impactColor: '#f8e038',
    levels: [
      {}, { damage: +10 }, { cooldownMul: 0.9 }, { damage: +13 },
      { duration: +2 }, { damage: +16 }, { cooldownMul: 0.85 }, { amount: +1, damage: +22 },
    ],
  },
  {
    id: 'electro_ball', name: 'Electro Ball', type: 'electric',
    desc: 'A charged sphere that caroms off the crowd, gaining voltage with each hop.',
    behavior: 'bouncer', aim: 'nearest', motion: 'zigzag',
    sprite: 'proj_bubble', palette: 'electric',
    damage: 18, cooldown: 1.7, amount: 1, speed: 250, area: 1, pierce: 0, duration: 0.8,
    r: 6, range: 220, spread: 0.3, knockback: 16, usesAmount: true,
    bounces: 4, bounceGain: 0.3, amp: 80, freq: 7,
    pulse: 0.3, trail: 20, trailColor: '#fffaa8', impact: 6, impactColor: '#f8e038',
    levels: [
      {}, { bounces: +2 }, { damage: +6 }, { cooldownMul: 0.9 },
      { bounces: +2 }, { damage: +8 }, { cooldownMul: 0.86 }, { bounces: +3, damage: +13 },
    ],
  },
  {
    id: 'thunder_wave', name: 'Thunder Wave', type: 'electric',
    desc: 'Drops a ring of current that spreads outward and locks legs as it goes.',
    behavior: 'nova', aim: 'nearest', motion: 'anchor',
    sprite: 'proj_ring', palette: 'electric',
    damage: 9, cooldown: 3.0, amount: 1, speed: 0, area: 1, pierce: 0, duration: 0.9,
    r: 110, range: 0, spread: 0, knockback: 30, usesAmount: false,
    slow: 0.55, zoneColor: '#f8e038',
    levels: [
      {}, { damage: +3 }, { areaMul: 1.2 }, { cooldownMul: 0.88 },
      { damage: +4 }, { areaMul: 1.2 }, { cooldownMul: 0.85 }, { damage: +7, areaMul: 1.25 },
    ],
  },
  {
    id: 'live_wire', name: 'Live Wire', type: 'electric',
    desc: 'A cable of current latched onto one enemy, burning everything standing on the line.',
    behavior: 'tether', aim: 'nearest', motion: 'straight',
    sprite: 'proj_quill', palette: 'electric',
    damage: 9, cooldown: 0.2, amount: 1, speed: 0, area: 1, pierce: 0, duration: 0.2,
    r: 6, range: 190, spread: 0, knockback: 4, usesAmount: false,
    slow: 0.25, arcColor: '#fffaa8',
    levels: [
      {}, { damage: +3 }, { areaMul: 1.2 }, { cooldownMul: 0.9 },
      { damage: +4 }, { areaMul: 1.2 }, { cooldownMul: 0.85 }, { damage: +7, areaMul: 1.25 },
    ],
  },

  // =========================================================================
  // DARK -- punishes crowds, and takes something back from them
  // =========================================================================
  {
    id: 'night_daze', name: 'Night Daze', type: 'dark',
    desc: 'A black line drawn to one enemy. Everything standing on it pays, and so do they.',
    behavior: 'link', aim: 'toughest', motion: 'straight',
    sprite: 'proj_eye', palette: 'dark',
    damage: 16, cooldown: 1.5, amount: 1, speed: 0, area: 1, pierce: 0, duration: 0.2,
    r: 9, range: 230, spread: 0, knockback: 10, usesAmount: false,
    linkGain: 0.55, weaken: 2.5, arcColor: '#8a72b8',
    levels: [
      {}, { damage: +6 }, { areaMul: 1.2 }, { cooldownMul: 0.9 },
      { damage: +8 }, { areaMul: 1.2 }, { cooldownMul: 0.86 }, { damage: +13, areaMul: 1.25 },
    ],
  },
  {
    id: 'sucker_punch', name: 'Sucker Punch', type: 'dark',
    desc: 'Coils while you hold still and lunges the instant you break cover.',
    behavior: 'charge', aim: 'nearest', motion: 'homing',
    sprite: 'proj_fist', palette: 'dark',
    damage: 13, cooldown: 0.26, amount: 1, speed: 340, area: 1, pierce: 1, duration: 0.9,
    r: 6, range: 230, spread: 0.26, knockback: 46, usesAmount: false,
    maxCharge: 5, chargeGain: 0.3, homingTurn: 6,
    trail: 22, trailColor: '#4a3a66', impact: 7, impactColor: '#d0b0ff',
    levels: [
      {}, { damage: +8 }, { pierce: +1 }, { cooldownMul: 0.9 },
      { damage: +10 }, { pierce: +1 }, { cooldownMul: 0.86 }, { damage: +17 },
    ],
  },
  {
    id: 'foul_play', name: 'Foul Play', type: 'dark',
    desc: 'A skull that hurls itself from one victim to the next, meaner every time.',
    behavior: 'bouncer', aim: 'nearest', motion: 'straight',
    sprite: 'proj_skull', palette: 'dark',
    damage: 20, cooldown: 2.0, amount: 1, speed: 240, area: 1, pierce: 0, duration: 0.9,
    r: 7, range: 220, spread: 0.3, knockback: 24, usesAmount: true,
    bounces: 3, bounceGain: 0.45, spin: 4,
    trail: 14, trailColor: '#4a3a66', impact: 8, impactColor: '#d0b0ff',
    levels: [
      {}, { bounces: +1 }, { damage: +9 }, { cooldownMul: 0.9 },
      { bounces: +1 }, { damage: +12 }, { cooldownMul: 0.86 }, { bounces: +2, damage: +18 },
    ],
  },
  {
    id: 'dark_void', name: 'Dark Void', type: 'dark',
    desc: 'A hole opens under your feet and everything nearby slides into it.',
    behavior: 'pull', aim: 'nearest', motion: 'orbitPlayer',
    sprite: 'proj_vortex', palette: 'dark',
    damage: 22, cooldown: 4.6, amount: 1, speed: 0, area: 1, pierce: 0, duration: 3.2,
    r: 62, range: 0, spread: 0, knockback: 0, usesAmount: false,
    pullForce: 110, slow: 0.3, zoneColor: '#2a2038',
    levels: [
      {}, { damage: +8 }, { areaMul: 1.15 }, { cooldownMul: 0.9 },
      { damage: +10 }, { areaMul: 1.15 }, { cooldownMul: 0.86 }, { damage: +16, areaMul: 1.2 },
    ],
  },
  {
    id: 'snarl', name: 'Snarl', type: 'dark',
    desc: 'A lobbed howl that breaks over the front rank and leaves it reeling.',
    behavior: 'cone', aim: 'nearest', motion: 'arc',
    sprite: 'proj_fang', palette: 'dark',
    damage: 15, cooldown: 1.25, amount: 4, speed: 200, area: 1, pierce: 1, duration: 0.8,
    r: 7, range: 150, spread: 0.3, knockback: 18, usesAmount: true,
    impact: 6, impactColor: '#8a72b8',
    levels: [
      {}, { amount: +1 }, { damage: +5 }, { cooldownMul: 0.9 },
      { amount: +1 }, { damage: +7 }, { cooldownMul: 0.86 }, { amount: +2, damage: +11 },
    ],
  },
  {
    id: 'nightmare', name: 'Nightmare', type: 'dark',
    desc: 'Plants a hex that sits there doing nothing, then takes a terrible amount all at once.',
    behavior: 'bloom', aim: 'nearest', motion: 'anchor',
    sprite: 'proj_seed', palette: 'dark',
    damage: 24, cooldown: 3.8, amount: 1, speed: 0, area: 1, pierce: 0, duration: 2.2,
    r: 6, range: 150, spread: 0.6, knockback: 40, usesAmount: true,
    fuse: 2.2, blastRadius: 58, spin: 2,
    impact: 12, impactColor: '#d0b0ff',
    levels: [
      {}, { amount: +1 }, { damage: +7 }, { cooldownMul: 0.9 },
      { amount: +1 }, { damage: +9 }, { areaMul: 1.2 }, { amount: +1, damage: +14 },
    ],
  },

  // =========================================================================
  // GRASS -- roots, spreads, and keeps growing while you are elsewhere
  // =========================================================================
  {
    id: 'leaf_arrow', name: 'Leaf Arrow', owner: 'rowlet', type: 'grass',
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
  {
    id: 'seed_bomb', name: 'Seed Bomb', type: 'grass',
    desc: 'Lobs seeds that take root, wait, and then go off underneath the crowd.',
    behavior: 'bloom', aim: 'nearest', motion: 'arc',
    sprite: 'proj_seed', palette: 'grass',
    damage: 38, cooldown: 2.1, amount: 2, speed: 210, area: 1, pierce: 0, duration: 1.5,
    r: 6, range: 190, spread: 0.42, knockback: 50, usesAmount: true,
    fuse: 1.5, blastRadius: 46, impact: 9, impactColor: '#c4f29a',
    levels: [
      {}, { amount: +1 }, { damage: +8 }, { cooldownMul: 0.9 },
      { amount: +1 }, { damage: +11 }, { areaMul: 1.2 }, { amount: +2, damage: +15 },
    ],
  },
  {
    id: 'vine_whip', name: 'Vine Whip', type: 'grass',
    desc: 'Barbed vines race out along the ground, spreading wider the further they get.',
    behavior: 'projectile', aim: 'nearest', motion: 'crawl',
    sprite: 'proj_thorn', palette: 'grass',
    damage: 15, cooldown: 1.1, amount: 2, speed: 260, area: 1, pierce: 9999, duration: 1.5,
    r: 6, range: 170, spread: 0.36, knockback: 12, usesAmount: true,
    slow: 0.3, trail: 14, trailColor: '#6cc840', impact: 5, impactColor: '#c4f29a',
    levels: [
      {}, { amount: +1 }, { damage: +5 }, { cooldownMul: 0.9 },
      { amount: +1 }, { damage: +7 }, { areaMul: 1.2 }, { amount: +2, damage: +11 },
    ],
  },
  {
    id: 'petal_blizzard', name: 'Petal Blizzard', type: 'grass',
    desc: 'Petals wind outward in a widening spiral and shred anything they brush.',
    behavior: 'swarm', aim: 'nearest', motion: 'spiral',
    sprite: 'proj_leaf', palette: 'grass',
    damage: 8, cooldown: 2.0, amount: 6, speed: 170, area: 1, pierce: 9999, duration: 1.6,
    r: 5, range: 240, spread: 0, knockback: 6, usesAmount: true,
    freq: 5, spin: 12, trail: 10, trailColor: '#c4f29a', impact: 3, impactColor: '#6cc840',
    levels: [
      {}, { amount: +2 }, { damage: +3 }, { cooldownMul: 0.9 },
      { amount: +2 }, { damage: +4 }, { cooldownMul: 0.86 }, { amount: +3, damage: +7 },
    ],
  },
  {
    id: 'spore_pod', name: 'Spore Pod', type: 'grass',
    desc: 'A pod that drifts around whatever you last looked at, spitting spores at it.',
    behavior: 'turret', aim: 'nearest', motion: 'weave',
    sprite: 'proj_seed', palette: 'grass',
    damage: 24, cooldown: 4.8, amount: 1, speed: 120, area: 1, pierce: 0, duration: 6.0,
    r: 0, range: 220, spread: 0, knockback: 0, usesAmount: false,
    orbitRadius: 36, orbitSpeed: 2.2, spin: 2.2,
    emitGap: 0.55, emitRange: 150, emitSpeed: 230, emitLife: 0.8, emitDamage: 0.85,
    emitR: 6, emitPierce: 1, emitTrail: 12,
    emitSprite: 'proj_cloud', emitPalette: 'grass',
    trailColor: '#c4f29a', impact: 5, impactColor: '#6cc840',
    levels: [
      {}, { damage: +8 }, { cooldownMul: 0.9 }, { damage: +10 },
      { duration: +2 }, { damage: +13 }, { cooldownMul: 0.85 }, { amount: +1, damage: +18 },
    ],
  },
  {
    id: 'grassy_terrain', name: 'Grassy Terrain', type: 'grass',
    desc: 'Thick turf grows wherever you have been and tangles whatever follows you.',
    behavior: 'trail', aim: 'nearest', motion: 'crawl',
    sprite: 'proj_cloud', palette: 'grass',
    damage: 13, cooldown: 0.6, amount: 1, speed: 0, area: 1, pierce: 0, duration: 3.4,
    r: 22, range: 0, spread: 0, knockback: 0, usesAmount: false,
    slow: 0.4, zoneColor: '#4aa32c',
    levels: [
      {}, { damage: +4 }, { cooldownMul: 0.88 }, { areaMul: 1.2 },
      { damage: +6 }, { cooldownMul: 0.86 }, { areaMul: 1.2 }, { damage: +10 },
    ],
  },

  // =========================================================================
  // FLYING -- long reach, hard knockback, nothing gets close
  // =========================================================================
  {
    id: 'gust', name: 'Gust', type: 'flying',
    desc: 'A blade of wind that carries further than anything else you own.',
    behavior: 'projectile', aim: 'nearest', motion: 'straight',
    sprite: 'proj_feather', palette: 'flying',
    damage: 16, cooldown: 0.95, amount: 2, speed: 330, area: 1, pierce: 2, duration: 1.4,
    r: 5, range: 320, spread: 0.2, knockback: 40, usesAmount: true,
    spin: 6, trail: 16, trailColor: '#f0f6ff', impact: 5, impactColor: '#b8cde0',
    levels: [
      {}, { amount: +1 }, { damage: +5 }, { cooldownMul: 0.9 },
      { amount: +1 }, { damage: +7 }, { pierce: +2 }, { amount: +1, damage: +11 },
    ],
  },
  {
    id: 'pin_missile', name: 'Pin Missile', type: 'flying',
    desc: 'A spray of quills. Cheap, constant, and it fills the space in front of you.',
    behavior: 'cone', aim: 'nearest', motion: 'straight',
    sprite: 'proj_quill', palette: 'flying',
    damage: 9, cooldown: 0.8, amount: 5, speed: 340, area: 1, pierce: 0, duration: 0.7,
    r: 4, range: 200, spread: 0.2, knockback: 8, usesAmount: true,
    trail: 10, trailColor: '#b8cde0', impact: 3, impactColor: '#f0f6ff',
    levels: [
      {}, { amount: +2 }, { damage: +3 }, { cooldownMul: 0.9 },
      { amount: +2 }, { damage: +4 }, { cooldownMul: 0.86 }, { amount: +3, damage: +7 },
    ],
  },
  {
    id: 'brave_bird', name: 'Brave Bird', type: 'flying',
    desc: 'Launches over the crowd and comes down on the far side of it.',
    behavior: 'projectile', aim: 'toughest', motion: 'dive',
    sprite: 'proj_feather', palette: 'flying',
    damage: 58, cooldown: 1.9, amount: 1, speed: 230, area: 1, pierce: 4, duration: 0.9,
    r: 9, range: 210, spread: 0.3, knockback: 90, usesAmount: true,
    amp: 30, spin: 5, trail: 20, trailColor: '#f0f6ff', impact: 9, impactColor: '#ffffff',
    levels: [
      {}, { amount: +1 }, { damage: +14 }, { cooldownMul: 0.9 },
      { pierce: +2 }, { damage: +18 }, { cooldownMul: 0.86 }, { amount: +1, damage: +26 },
    ],
  },
  {
    id: 'aerial_ace', name: 'Aerial Ace', type: 'flying',
    desc: 'A talon that curves after its mark and simply does not miss.',
    behavior: 'projectile', aim: 'nearest', motion: 'homing',
    sprite: 'proj_claw', palette: 'flying',
    damage: 18, cooldown: 1.25, amount: 2, speed: 240, area: 1, pierce: 1, duration: 1.7,
    r: 5, range: 270, spread: 0.9, knockback: 16, usesAmount: true,
    homingTurn: 6.5, spin: 0, trail: 18, trailColor: '#b8cde0', impact: 5, impactColor: '#f0f6ff',
    levels: [
      {}, { amount: +1 }, { damage: +6 }, { cooldownMul: 0.9 },
      { amount: +1 }, { damage: +8 }, { pierce: +1 }, { amount: +1, damage: +13 },
    ],
  },
  {
    id: 'sky_guard', name: 'Sky Guard', type: 'flying',
    desc: 'A companion that patrols on its own and runs down whatever strays.',
    behavior: 'companion', aim: 'nearest', motion: 'homing',
    sprite: 'proj_hound', palette: 'flying',
    damage: 20, cooldown: 5.4, amount: 1, speed: 230, area: 1, pierce: 9999, duration: 5.5,
    r: 7, range: 280, spread: 0, knockback: 30, usesAmount: true,
    homingTurn: 4.5, trail: 12, trailColor: '#b8cde0', impact: 5, impactColor: '#f0f6ff',
    levels: [
      {}, { damage: +4 }, { cooldownMul: 0.9 }, { amount: +1 },
      { damage: +6 }, { cooldownMul: 0.86 }, { areaMul: 1.2 }, { amount: +1, damage: +9 },
    ],
  },
  {
    id: 'hurricane', name: 'Hurricane', type: 'flying',
    desc: 'A gale that winds outward from you and throws the whole field around.',
    behavior: 'cone', aim: 'nearest', motion: 'spiral',
    sprite: 'proj_vortex', palette: 'flying',
    damage: 10, cooldown: 1.7, amount: 4, speed: 140, area: 1, pierce: 9999, duration: 1.8,
    r: 9, range: 200, spread: 1.6, knockback: 70, usesAmount: true,
    freq: 2.6, spin: 9, impact: 5, impactColor: '#f0f6ff',
    levels: [
      {}, { amount: +1 }, { damage: +5 }, { cooldownMul: 0.9 },
      { amount: +1 }, { damage: +6 }, { areaMul: 1.2 }, { amount: +2, damage: +10 },
    ],
  },

  // =========================================================================
  // GHOST -- goes through things, and comes at you from angles that do not exist
  // =========================================================================
  {
    id: 'pulse_aura', name: 'Spectral Aura', type: 'ghost',
    desc: 'A field that simply hurts anything near you. No aiming, ever.',
    behavior: 'aura', aim: 'nearest', motion: 'orbitPlayer',
    sprite: 'proj_bubble', palette: 'ghost',
    damage: 7, cooldown: 0.45, amount: 1, speed: 0, area: 1, pierce: 9999, duration: 0.5,
    r: 34, range: 0, spread: 0, knockback: 6, usesAmount: false,
    pulse: 0.3, impact: 0,
    levels: [
      {}, { damage: +3 }, { areaMul: 1.15 }, { cooldownMul: 0.88 },
      { damage: +4 }, { areaMul: 1.15 }, { cooldownMul: 0.86 }, { damage: +7, areaMul: 1.2 },
    ],
  },
  {
    id: 'shadow_ball', name: 'Shadow Ball', type: 'ghost',
    desc: 'A lobbed knot of shadow that bursts into smaller ones the moment it touches anything.',
    behavior: 'split', aim: 'nearest', motion: 'arc',
    sprite: 'proj_skull', palette: 'ghost',
    damage: 30, cooldown: 1.6, amount: 1, speed: 230, area: 1, pierce: 0, duration: 1.1,
    r: 7, range: 200, spread: 0.3, knockback: 20, usesAmount: false,
    shards: 4, spin: 3, trail: 16, trailColor: '#7a6ab0', impact: 7, impactColor: '#c8bcf0',
    levels: [
      {}, { shards: +1 }, { damage: +10 }, { cooldownMul: 0.9 },
      { shards: +1 }, { damage: +13 }, { cooldownMul: 0.86 }, { shards: +2, damage: +20 },
    ],
  },
  {
    id: 'hex_lantern', name: 'Hex Lanterns', type: 'ghost',
    desc: 'Lanterns that leave you entirely and circle whatever you are fighting instead.',
    behavior: 'orbit', aim: 'nearest', motion: 'weave',
    sprite: 'proj_eye', palette: 'ghost',
    damage: 22, cooldown: 3.0, amount: 2, speed: 160, area: 1, pierce: 9999, duration: 3.6,
    r: 6, range: 250, spread: 0, knockback: 10, usesAmount: true,
    orbitRadius: 22, orbitSpeed: 5, spin: 5, impact: 5, impactColor: '#9af0d8',
    levels: [
      {}, { amount: +1 }, { damage: +6 }, { cooldownMul: 0.9 },
      { amount: +1 }, { damage: +8 }, { areaMul: 1.2 }, { amount: +2, damage: +12 },
    ],
  },
  {
    id: 'phantom_force', name: 'Phantom Force', type: 'ghost',
    desc: 'Vanishes, and arrives out of the air directly above something.',
    behavior: 'projectile', aim: 'toughest', motion: 'fall',
    sprite: 'proj_claw', palette: 'ghost',
    damage: 50, cooldown: 2.0, amount: 1, speed: 0, area: 1, pierce: 2, duration: 0.75,
    r: 13, range: 260, spread: 0, knockback: 30, usesAmount: true,
    amp: 190, impact: 10, impactColor: '#9af0d8',
    levels: [
      {}, { amount: +1 }, { damage: +18 }, { cooldownMul: 0.9 },
      { amount: +1 }, { damage: +24 }, { areaMul: 1.2 }, { amount: +1, damage: +34 },
    ],
  },
  {
    id: 'soul_link', name: 'Soul Link', type: 'ghost',
    desc: 'A thread to one enemy that drinks from everything it crosses on the way.',
    behavior: 'link', aim: 'nearest', motion: 'weave',
    sprite: 'fx_wisp', palette: 'ghost',
    damage: 22, cooldown: 0.9, amount: 1, speed: 0, area: 1, pierce: 0, duration: 0.2,
    r: 7, range: 200, spread: 0, knockback: 0, usesAmount: false,
    linkGain: 0.7, weaken: 2.0, arcColor: '#9af0d8',
    levels: [
      {}, { damage: +5 }, { areaMul: 1.2 }, { cooldownMul: 0.9 },
      { damage: +6 }, { areaMul: 1.2 }, { cooldownMul: 0.86 }, { damage: +11, areaMul: 1.25 },
    ],
  },
  {
    id: 'grudge', name: 'Grudge', type: 'ghost',
    desc: 'Scatters charms that drift a little way off and wait for company.',
    behavior: 'mine', aim: 'nearest', motion: 'drift',
    sprite: 'proj_seed', palette: 'ghost',
    damage: 20, cooldown: 2.6, amount: 2, speed: 90, area: 1, pierce: 0, duration: 7.0,
    r: 8, range: 90, spread: 0, knockback: 60, usesAmount: true,
    blastRadius: 38, spin: 2, impact: 8, impactColor: '#c8bcf0',
    levels: [
      {}, { amount: +1 }, { damage: +6 }, { cooldownMul: 0.9 },
      { amount: +1 }, { damage: +8 }, { areaMul: 1.25 }, { amount: +2, damage: +12 },
    ],
  },

  // =========================================================================
  // POISON -- nothing dies fast, and everything dies eventually
  // =========================================================================
  {
    id: 'toxic_trail', name: 'Toxic Trail', type: 'poison',
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
    id: 'sludge_bomb', name: 'Sludge Bomb', owner: 'gastly', type: 'poison',
    desc: 'Lobbed globs that sit where they land until something blunders into one.',
    behavior: 'mine', aim: 'nearest', motion: 'arc',
    sprite: 'proj_cloud', palette: 'poison',
    damage: 17, cooldown: 1.8, amount: 2, speed: 170, area: 1, pierce: 0, duration: 5.0,
    r: 10, range: 170, spread: 0, knockback: 40, usesAmount: true,
    blastRadius: 44, impact: 8, impactColor: '#e8b0f8',
    zoneOnEnd: { r: 26, life: 2.4, dps: 10, slow: 0.3, color: '#b050d0' },
    levels: [
      {}, { amount: +1 }, { damage: +5 }, { cooldownMul: 0.9 },
      { amount: +1 }, { damage: +7 }, { areaMul: 1.25 }, { amount: +2, damage: +10 },
    ],
  },
  {
    id: 'acid_spray', name: 'Acid Spray', type: 'poison',
    desc: 'A fan of acid that keeps creeping along the ground after it lands.',
    behavior: 'cone', aim: 'nearest', motion: 'crawl',
    sprite: 'proj_bubble', palette: 'poison',
    damage: 8, cooldown: 0.9, amount: 4, speed: 230, area: 1, pierce: 9999, duration: 1.4,
    r: 6, range: 140, spread: 0.26, knockback: 6, usesAmount: true,
    slow: 0.25, trail: 14, trailColor: '#e8b0f8', impact: 4, impactColor: '#b050d0',
    levels: [
      {}, { amount: +1 }, { damage: +4 }, { cooldownMul: 0.9 },
      { amount: +1 }, { damage: +5 }, { areaMul: 1.2 }, { amount: +2, damage: +8 },
    ],
  },
  {
    id: 'toxic_spikes', name: 'Toxic Spikes', type: 'poison',
    desc: 'Lays a ring of barbs around where you are standing and leaves them there.',
    behavior: 'orbit', aim: 'nearest', motion: 'anchor',
    sprite: 'proj_thorn', palette: 'poison',
    damage: 20, cooldown: 2.8, amount: 5, speed: 0, area: 1, pierce: 9999, duration: 4.0,
    r: 7, range: 0, spread: 0, knockback: 8, usesAmount: true,
    orbitRadius: 48, orbitSpeed: 0, spin: 1.2, impact: 5, impactColor: '#e8b0f8',
    levels: [
      {}, { amount: +2 }, { damage: +7 }, { cooldownMul: 0.9 },
      { amount: +2 }, { damage: +9 }, { areaMul: 1.2 }, { amount: +3, damage: +14 },
    ],
  },
  {
    id: 'venoshock', name: 'Venoshock', type: 'poison',
    desc: 'A lobbed flask that skips from body to body and gets fouler with each one.',
    behavior: 'bouncer', aim: 'nearest', motion: 'arc',
    sprite: 'proj_bubble', palette: 'poison',
    damage: 17, cooldown: 1.9, amount: 1, speed: 220, area: 1, pierce: 0, duration: 1.0,
    r: 7, range: 190, spread: 0.3, knockback: 18, usesAmount: true,
    bounces: 4, bounceGain: 0.4,
    pulse: 0.24, trail: 16, trailColor: '#e8b0f8', impact: 7, impactColor: '#b050d0',
    levels: [
      {}, { bounces: +1 }, { damage: +7 }, { cooldownMul: 0.9 },
      { bounces: +1 }, { damage: +10 }, { cooldownMul: 0.86 }, { bounces: +2, damage: +15 },
    ],
  },
  {
    id: 'acid_pod', name: 'Acid Pod', type: 'poison',
    desc: 'A sac that drifts where it was dropped and keeps spitting at whatever comes near.',
    behavior: 'turret', aim: 'nearest', motion: 'drift',
    sprite: 'proj_seed', palette: 'poison',
    damage: 26, cooldown: 5.0, amount: 1, speed: 60, area: 1, pierce: 0, duration: 6.5,
    r: 0, range: 0, spread: 0, knockback: 0, usesAmount: false,
    emitGap: 0.5, emitRange: 140, emitSpeed: 200, emitLife: 0.8, emitDamage: 0.8,
    emitR: 7, emitPierce: 0, emitTrail: 14,
    emitSprite: 'proj_bubble', emitPalette: 'poison',
    trailColor: '#e8b0f8', impact: 6, impactColor: '#b050d0',
    levels: [
      {}, { damage: +9 }, { cooldownMul: 0.9 }, { damage: +11 },
      { duration: +2 }, { damage: +14 }, { cooldownMul: 0.85 }, { amount: +1, damage: +20 },
    ],
  },
];

// --- Evolved forms ----------------------------------------------------------
// Reached by holding a maxed weapon plus its paired passive and opening a chest. Each is a
// genuine upgrade in KIND, not just bigger numbers -- that is the point of evolving.
WEAPONS.push(
  // =========================================================================
  // FIRE -- nothing here kills on impact. It sets things alight and walks away
  // =========================================================================
  {
    id: 'ember_spit', name: 'Ember Spit', owner: 'vulpix', type: 'fire',
    desc: 'Guttering embers that flicker off-line as they fly and leave what they touch burning.',
    behavior: 'projectile', aim: 'nearest', motion: 'weave',
    sprite: 'proj_spark', palette: 'fire',
    damage: 11, cooldown: 0.95, amount: 2, speed: 210, area: 1, pierce: 0, duration: 1.2,
    r: 5, range: 220, spread: 0.22, knockback: 8, usesAmount: true,
    burn: 9, burnT: 3.0,
    amp: 16, freq: 13, trail: 12, trailColor: '#f08828', impact: 6, impactColor: '#ffd870',
    levels: [
      {}, { amount: +1 }, { damage: +5 }, { cooldownMul: 0.9 },
      { amount: +1 }, { damage: +6 }, { cooldownMul: 0.88 }, { amount: +1, damage: +9 },
    ],
  },
  {
    id: 'will_o_wisp', name: 'Will-o-Wisp', type: 'fire',
    desc: 'Wisps that drift away from you and hang in the air, setting alight whatever wanders in.',
    behavior: 'swarm', aim: 'nearest', motion: 'drift',
    sprite: 'proj_eye', palette: 'fire',
    // The wisps are thrown outward hard and coast to a stop spread around you. An earlier
    // version barely moved and left all of them stacked on the player with infinite pierce,
    // where they re-hit the same enemy every frame: an enemy remembers only the LAST hit id it
    // took, so overlapping projectiles take turns overwriting it and the guard stops working.
    // Finite pierce and real separation keep this a hazard rather than a grinder.
    damage: 16, cooldown: 3.2, amount: 3, speed: 240, area: 1, pierce: 10, duration: 3.4,
    r: 7, range: 240, spread: 0, knockback: 0, usesAmount: true,
    burn: 16, burnT: 3.5,
    orbitRadius: 26, orbitSpeed: 2.2, pulse: 0.3, trail: 10, trailColor: '#c05018',
    levels: [
      {}, { amount: +1 }, { damage: +6 }, { cooldownMul: 0.9 },
      { amount: +1 }, { damage: +8 }, { cooldownMul: 0.86 }, { amount: +2, areaMul: 1.2 },
    ],
  },
  {
    id: 'heat_wave', name: 'Heat Wave', type: 'fire',
    desc: 'A wall of heat that rolls outward from you, igniting everything it washes over.',
    behavior: 'nova', aim: 'facing', motion: 'straight',
    sprite: 'proj_ring', palette: 'fire',
    damage: 24, cooldown: 4.2, amount: 1, speed: 0, area: 1, pierce: 0, duration: 0.7,
    r: 118, range: 0, spread: 0, knockback: 34, usesAmount: false,
    burn: 16, burnT: 3.0,
    zoneColor: '#f08828', fireWithoutTarget: true,
    levels: [
      {}, { damage: +9 }, { areaMul: 1.15 }, { cooldownMul: 0.9 },
      { damage: +12 }, { areaMul: 1.15 }, { cooldownMul: 0.86 }, { damage: +18, areaMul: 1.2 },
    ],
  },
  {
    id: 'magma_pool', name: 'Magma Pool', type: 'fire',
    desc: 'Blobs of magma that creep along the ground toward whatever is nearest, then erupt.',
    behavior: 'mine', aim: 'nearest', motion: 'crawl',
    sprite: 'proj_mine', palette: 'fire',
    damage: 46, cooldown: 3.6, amount: 2, speed: 34, area: 1, pierce: 0, duration: 6.0,
    r: 6, range: 150, spread: 0, knockback: 46, usesAmount: true,
    burn: 20, burnT: 4.0,
    blastRadius: 40, pulse: 0.5, impact: 12, impactColor: '#ffd870',
    levels: [
      {}, { amount: +1 }, { damage: +16 }, { cooldownMul: 0.9 },
      { amount: +1 }, { damage: +20 }, { cooldownMul: 0.86 }, { amount: +1, areaMul: 1.25 },
    ],
  },
  {
    id: 'meteor_fall', name: 'Meteor Fall', type: 'fire',
    desc: 'A cinder lobbed high that falls back down and blooms into a much bigger fire than it left as.',
    behavior: 'bloom', aim: 'nearest', motion: 'fall',
    sprite: 'proj_boulder', palette: 'fire',
    damage: 78, cooldown: 4.6, amount: 1, speed: 0, area: 1, pierce: 0, duration: 1.5,
    r: 7, range: 230, spread: 0, knockback: 70, usesAmount: false,
    burn: 26, burnT: 4.0,
    fuse: 1.1, blastRadius: 56, dropHeight: 170, impact: 16, impactColor: '#ffd870',
    levels: [
      {}, { damage: +26 }, { areaMul: 1.15 }, { cooldownMul: 0.9 },
      { amount: +1 }, { damage: +34 }, { cooldownMul: 0.86 }, { amount: +1, areaMul: 1.25 },
    ],
  },
  {
    id: 'blaze_trail', name: 'Blaze Trail', type: 'fire',
    desc: 'Fire laid down where you have already been. Every retreat costs whatever follows you.',
    behavior: 'trail', aim: 'facing', motion: 'anchor',
    sprite: 'proj_cloud', palette: 'fire',
    damage: 20, cooldown: 0.6, amount: 1, speed: 0, area: 1, pierce: 0, duration: 3.4,
    r: 22, range: 0, spread: 0, knockback: 0, usesAmount: false,
    burn: 12,
    zoneColor: '#c05018',
    levels: [
      {}, { damage: +6 }, { areaMul: 1.15 }, { cooldownMul: 0.88 },
      { damage: +8 }, { areaMul: 1.15 }, { cooldownMul: 0.85 }, { damage: +12, areaMul: 1.2 },
    ],
  },

  // =========================================================================
  // ICE -- slow first, damage second. It takes the crowd's speed away
  // =========================================================================
  {
    id: 'powder_snow', name: 'Powder Snow', owner: 'delibird', type: 'ice',
    desc: 'A spray of freezing powder that picks up speed as it goes and leaves the crowd crawling.',
    behavior: 'cone', aim: 'nearest', motion: 'accelerate',
    sprite: 'proj_shard', palette: 'ice',
    damage: 8, cooldown: 1.15, amount: 5, speed: 200, area: 1, pierce: 0, duration: 0.75,
    r: 4, range: 140, spread: 0.2, knockback: 6, usesAmount: true,
    slow: 0.3,
    accel: 420, trail: 8, trailColor: '#9ad8f4', impact: 5, impactColor: '#eaffff',
    levels: [
      {}, { amount: +2 }, { damage: +4 }, { cooldownMul: 0.9 },
      { amount: +2 }, { damage: +5 }, { cooldownMul: 0.86 }, { amount: +3, damage: +7 },
    ],
  },
  {
    id: 'icicle_crash', name: 'Icicle Crash', type: 'ice',
    desc: 'A spear of ice that shatters into splinters on impact, and swings back to you if it misses.',
    // `orbit` was the obvious home for circling icicles, but every motion `orbit` can actually
    // drive is already spoken for -- it reads orbitA/orbitR/spin and ignores the rest, so the
    // remaining "free" pairs would have produced a weapon that sat motionless on the player.
    behavior: 'split', aim: 'nearest', motion: 'boomerang',
    sprite: 'proj_shard', palette: 'ice',
    damage: 26, cooldown: 2.4, amount: 1, speed: 250, area: 1, pierce: 0, duration: 1.5,
    r: 6, range: 240, spread: 0, knockback: 20, usesAmount: false,
    slow: 0.35,
    shards: 4, spin: 7, trail: 14, trailColor: '#9ad8f4', impact: 8, impactColor: '#eaffff',
    levels: [
      {}, { shards: +1 }, { damage: +10 }, { cooldownMul: 0.9 },
      { shards: +1 }, { damage: +13 }, { cooldownMul: 0.86 }, { shards: +2, damage: +18 },
    ],
  },
  {
    id: 'hail_cloud', name: 'Hail Cloud', type: 'ice',
    desc: 'A cloud left hanging where you dropped it, dropping hail on anything that walks under it.',
    behavior: 'turret', aim: 'facing', motion: 'fall',
    sprite: 'proj_cloud', palette: 'ice',
    damage: 30, cooldown: 6.0, amount: 1, speed: 0, area: 1, pierce: 0, duration: 7.0,
    r: 8, range: 0, spread: 0, knockback: 0, usesAmount: false,
    slow: 0.25,
    emitGap: 0.42, emitRange: 130, emitSpeed: 250, emitDamage: 0.8, emitR: 4, emitLife: 0.8,
    emitSprite: 'proj_shard', emitPalette: 'ice', emitTrail: 10, trailColor: '#9ad8f4',
    levels: [
      {}, { damage: +10 }, { cooldownMul: 0.9 }, { damage: +13 },
      { amount: +1 }, { damage: +16 }, { cooldownMul: 0.86 }, { amount: +1, areaMul: 1.2 },
    ],
  },
  {
    id: 'frost_ricochet', name: 'Frost Ricochet', type: 'ice',
    desc: 'A ball of ice that gathers speed off every enemy it bounces from, freezing each in turn.',
    behavior: 'bouncer', aim: 'nearest', motion: 'accelerate',
    sprite: 'proj_star', palette: 'ice',
    damage: 21, cooldown: 2.0, amount: 1, speed: 230, area: 1, pierce: 0, duration: 2.6,
    r: 6, range: 250, spread: 0.2, knockback: 16, usesAmount: false,
    slow: 0.35,
    accel: 90, bounces: 4, bounceGain: 0.32, spin: 9, trail: 14, trailColor: '#4a9fd0',
    impact: 7, impactColor: '#eaffff',
    levels: [
      {}, { bounces: +1 }, { damage: +8 }, { cooldownMul: 0.9 },
      { bounces: +1 }, { damage: +10 }, { cooldownMul: 0.86 }, { amount: +1, damage: +14 },
    ],
  },
  {
    id: 'frost_veil', name: 'Frost Veil', type: 'ice',
    desc: 'A field of cold that hangs off you and drifts a beat behind wherever you go.',
    behavior: 'aura', aim: 'facing', motion: 'drift',
    sprite: 'proj_ring', palette: 'ice',
    damage: 13, cooldown: 1.1, amount: 1, speed: 24, area: 1, pierce: 9999, duration: 1.3,
    r: 46, range: 0, spread: 0, knockback: 0, usesAmount: false,
    slow: 0.4,
    pulse: 0.25,
    levels: [
      {}, { damage: +4 }, { areaMul: 1.15 }, { cooldownMul: 0.9 },
      { damage: +5 }, { areaMul: 1.15 }, { cooldownMul: 0.86 }, { damage: +8, areaMul: 1.2 },
    ],
  },
  {
    id: 'frost_chain', name: 'Frost Chain', type: 'ice',
    desc: 'Cold that jumps from one frozen enemy to the next, hunting down the ones it has not reached.',
    behavior: 'chain', aim: 'nearest', motion: 'homing',
    sprite: 'proj_droplet', palette: 'ice',
    damage: 30, cooldown: 2.8, amount: 2, speed: 0, area: 1, pierce: 0, duration: 0.2,
    r: 5, range: 210, spread: 0, knockback: 0, usesAmount: true,
    jumps: 2, jumpRange: 120, falloff: 0.9, arcColor: '#9ad8f4',
    levels: [
      {}, { amount: +1 }, { damage: +11 }, { cooldownMul: 0.9 },
      { amount: +1 }, { damage: +14 }, { cooldownMul: 0.86 }, { amount: +2, damage: +18 },
    ],
  },
  {
    id: 'quagmire', name: 'Quagmire', evolvedFrom: 'mud_shot', hidden: true, type: 'ground',
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
    id: 'star_barrage', name: 'Star Barrage', evolvedFrom: 'swift_star', hidden: true, type: 'normal',
    desc: 'An unending stream of stars, and they all find something.',
    behavior: 'projectile', aim: 'nearest', motion: 'accelerate',
    sprite: 'proj_star', palette: 'normal',
    damage: 26, cooldown: 0.34, amount: 5, speed: 280, area: 1.2, pierce: 3, duration: 1.4,
    r: 4, range: 230, spread: 0.55, knockback: 10, usesAmount: true,
    spin: 12, trail: 34, trailColor: '#ffffff', impact: 6, impactColor: '#ffffff',
    levels: [{}],
  },
  {
    id: 'spirit_shackle', name: 'Spirit Shackle', evolvedFrom: 'leaf_arrow', hidden: true, type: 'ghost',
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

/** Every type that has weapons, in the order they appear. Used by the pokedex and the tests. */
export const WEAPON_TYPES = [...new Set(WEAPONS.filter((w) => !w.hidden).map((w) => w.type))];

/** The draftable weapons of one type. */
export const weaponsOfType = (type) => WEAPONS.filter((w) => !w.hidden && w.type === type);

/** (shape, palette, rotations) triples the weapon set needs registered in the atlas. */
export function weaponSpritePairs() {
  const seen = new Set();
  const out = [];
  // Anything that must point where it flies gets baked rotations instead of a left/right flip.
  const ROTATED = new Set([
    'proj_leaf', 'proj_bone', 'proj_rock', 'proj_fang', 'proj_shard', 'proj_feather',
    'proj_quill', 'proj_thorn', 'proj_claw', 'proj_blade', 'proj_fist', 'proj_boulder',
  ]);
  const add = (sprite, palette) => {
    const key = `${sprite}:${palette}`;
    if (seen.has(key)) return;
    seen.add(key);
    out.push([sprite, palette, ROTATED.has(sprite) ? 16 : 0]);
  };
  for (const w of WEAPONS) {
    add(w.sprite, w.palette);
    if (w.emitSprite) add(w.emitSprite, w.emitPalette || w.palette);
  }
  return out;
}
