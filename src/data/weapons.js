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
    archetype: 'shot',
    anim: { seq: 'fx_rs_mud', scale: 0.32 },
    hitAnim: { seq: 'fx_rs_splash', dur: 0.3, fps: 10, scale: 0.8 },
    card: { seq: 'fx_rs_mud', frame: 0, scale: 0.85, tint: true },
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
      { damage: +11 }, { amount: +1, damage: +14 }
    ],
    evolution: { into: 'quagmire', needPassive: 'mystic_water' },
  },
  {
    id: 'bubble', name: 'Bubble', type: 'water',
    archetype: 'engulf',
    desc: 'Bubbles drift out and engulf the first foe they touch, carrying it off helpless until they pop on everything near.',
    behavior: 'bubble', aim: 'nearest', motion: 'anchor',
    sprite: 'proj_bubble', palette: 'water',
    // The look in play, and on its overload cards: Ruby/Sapphire's Bubble.
    card: { seq: 'fx_rs_bubble', frame: 0, scale: 2.2, tint: true },
    // Two bubbles at most: they swell around what they hold, and a screenful would be unreadable.
    damage: 36, cooldown: 2.2, amount: 1, speed: 70, area: 1, pierce: 0, duration: 3.2,
    r: 9, range: 200, spread: 0.6, knockback: 0, usesAmount: false,
    // How long it holds its catch, and how many it can hold.
    hold: 1.6, carry: 1,
    levels: [
      {}, { damage: +6 }, { amount: +1, say: '+1 bubble' }, { cooldownMul: 0.9 },
      { hold: 0.4, say: 'holds its catch 0.4s longer' }, { damage: +7 }, { carry: 1, say: 'each bubble holds 1 more foe' },
      { areaMul: 1.25, damage: +6 }, { cooldownMul: 0.88 }, { damage: +10, hold: 0.4, say: 'holds its catch 0.4s longer' }
    ],
  },
  {
    id: 'tidal_surge', name: 'Tidal Surge', type: 'water',
    archetype: 'nova',
    zoneAnim: { seq: 'fx_caustic', n: 7, scale: 1.1, fps: 14, alpha: 0.9 },
    card: { seq: 'fx_rs_splash', frame: 0, scale: 2, tint: true },
    desc: 'A ring of water rolls out from you and shoves the whole crowd off your back.',
    behavior: 'nova', aim: 'nearest', motion: 'orbitPlayer',
    sprite: 'proj_ring', palette: 'water',
    damage: 8, cooldown: 3.8, amount: 1, speed: 0, area: 1, pierce: 0, duration: 0.85,
    r: 120, range: 0, spread: 0, knockback: 150, usesAmount: false,
    slow: 0.2, zoneColor: '#5ab6ef',
    levels: [
      {}, { damage: +3 }, { areaMul: 1.2 }, { cooldownMul: 0.88 },
      { damage: +4 }, { areaMul: 1.2 }, { cooldownMul: 0.86 }, { damage: +6, areaMul: 1.25 },
      { damage: +8 }, { areaMul: 1.25, damage: +10 }
    ],
  },
  {
    id: 'whirlpool', name: 'Whirlpool', type: 'water',
    archetype: 'vortex',
    zoneAnim: { seq: 'fx_rs_whirl', fps: 10, fit: false, scale: 1.6, alpha: 0.9 },
    card: { seq: 'fx_rs_whirl', frame: 1, scale: 1.8, tint: true },
    desc: 'Opens a vortex under the crowd and drags it all into one grinding heap.',
    behavior: 'pull', aim: 'nearest', motion: 'anchor',
    sprite: 'proj_vortex', palette: 'water',
    damage: 30, cooldown: 4.2, amount: 1, speed: 0, area: 1, pierce: 0, duration: 2.8,
    r: 56, range: 190, spread: 0, knockback: 0, usesAmount: false,
    pullForce: 150, slow: 0.4, zoneColor: '#2276bd',
    levels: [
      {}, { damage: +10 }, { areaMul: 1.15 }, { cooldownMul: 0.9 },
      { damage: +14 }, { areaMul: 1.15 }, { cooldownMul: 0.86 }, { damage: +22, areaMul: 1.2 },
      { damage: +30 }, { areaMul: 1.25, damage: +37 }
    ],
  },
  {
    id: 'aqua_jet', name: 'Aqua Jet', type: 'water',
    archetype: 'charge',
    anim: { seq: 'fx_waterdrop', rot: true, scale: 0.9 },
    card: { seq: 'fx_rs_swirl', frame: 1, scale: 1.8, tint: true },
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
      { damage: +19 }, { pierce: +2, damage: +24 }
    ],
  },
  {
    id: 'rain_dance', name: 'Rain Dance', type: 'water',
    archetype: 'rain',
    anim: { seq: 'fx_rs_drop', fps: 6, scale: 1.1 },
    hitAnim: { seq: 'fx_rs_splash', dur: 0.3, fps: 10, scale: 0.7 },
    card: { seq: 'fx_rs_drop', frame: 1, scale: 2.4, tint: true },
    desc: 'Calls down a squall that patters across a whole patch of ground.',
    behavior: 'rain', aim: 'nearest', motion: 'fall',
    sprite: 'proj_droplet', palette: 'water',
    damage: 26, cooldown: 1.7, amount: 7, speed: 0, area: 1, pierce: 0, duration: 0.7,
    r: 8, range: 230, spread: 0, knockback: 6, usesAmount: true,
    zoneRadius: 62, dropHeight: 170, impact: 5, impactColor: '#bfe9ff',
    levels: [
      {}, { amount: +2 }, { damage: +5 }, { cooldownMul: 0.9 },
      { amount: +2 }, { damage: +6 }, { areaMul: 1.2 }, { amount: +4, damage: +9 },
      { damage: +12 }, { amount: +4, damage: +15 }
    ],
  },
  {
    id: 'brine_fang', name: 'Brine Fang', type: 'water',
    archetype: 'companion',
    anim: { seq: 'fx_shark', scale: 0.55, flip: true },
    card: { seq: 'fx_shark', frame: 0, scale: 0.9, tint: true },
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
      { damage: +11 }, { amount: +1, damage: +14 }
    ],
  },

  // =========================================================================
  // GROUND -- slow, heavy, and it owns the floor
  // =========================================================================
  {
    id: 'rock_orbit', name: 'Rock Orbit', type: 'ground',
    archetype: 'orbit',
    anim: { seq: 'fx_ancient', fps: 6, spin: 3, scale: 1.2 },
    card: { seq: 'fx_ancient', frame: 1, scale: 3.6, tint: true },
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
      { damage: +16 }, { amount: +2, damage: +20 }
    ],
  },
  {
    id: 'earth_power', name: 'Earth Power', type: 'ground',
    archetype: 'eruptLine',
    desc: 'The ground splits open in a line toward the nearest foe, spire after spire erupting a beat apart and throwing up whatever stands on them.',
    behavior: 'earthPower', aim: 'nearest', motion: 'anchor',
    sprite: 'proj_bone', palette: 'ground',
    card: { seq: 'fx_quake', frame: 4, scale: 0.55, tint: true },
    // One line: the spires are tall sprites, and several lines at once would bury the screen.
    damage: 44, cooldown: 1.6, amount: 1, speed: 0, area: 1, pierce: 0, duration: 1,
    r: 18, range: 170, spread: 0.45, knockback: 40, usesAmount: false,
    gap: 0.07, spacing: 18,
    levels: [
      {}, { damage: +8 }, { reach: 30, say: 'the line runs 30px further' }, { cooldownMul: 0.9 },
      { stunPlus: 0.2, say: 'spires stun 0.2s longer' }, { damage: +10 }, { areaMul: 1.2 }, { damage: +10, reach: 30, say: 'the line runs 30px further' },
      { cooldownMul: 0.88 }, { damage: +14, stunPlus: 0.2, say: 'spires stun 0.2s longer' }
    ],
  },
  {
    id: 'sand_tomb', name: 'Sand Tomb', type: 'ground',
    archetype: 'mine',
    anim: { seq: 'fx_ancient', frame: 3, scale: 1 },
    // The buried rock bursts in a small grey blast of stone dust.
    hitAnim: { spr: 'boom', color: '#a8a098', scale: 1.1, dust: '#c8c0b0' },
    card: { seq: 'fx_ancient', frame: 3, scale: 3.4, tint: true },
    desc: 'Buries traps around you. They do nothing at all until something walks onto one.',
    behavior: 'mine', aim: 'nearest', motion: 'anchor',
    sprite: 'proj_mine', palette: 'ground',
    damage: 24, cooldown: 3.0, amount: 2, speed: 0, area: 1, pierce: 0, duration: 9.0,
    r: 9, range: 74, spread: 0, knockback: 90, usesAmount: true,
    blastRadius: 34, impact: 9, impactColor: '#c49a5e',
    levels: [
      {}, { amount: +1 }, { damage: +7 }, { cooldownMul: 0.9 },
      { amount: +1 }, { damage: +10 }, { areaMul: 1.25 }, { amount: +2, damage: +14 },
      { damage: +19 }, { amount: +2, damage: +24 }
    ],
  },
  {
    id: 'bulldoze', name: 'Bulldoze', type: 'ground',
    archetype: 'sweep',
    anim: { seq: 'fx_break', fps: 18, rot: true, scale: 0.45 },
    card: { seq: 'fx_break', frame: 1, scale: 0.8, tint: true },
    desc: 'A shockwave swung in a wide arc. Everything in front of you goes flying.',
    behavior: 'sweep', aim: 'nearest', motion: 'sweepArc',
    sprite: 'proj_blade', palette: 'ground',
    damage: 34, cooldown: 1.6, amount: 1, speed: 0, area: 1, pierce: 9999, duration: 0.3,
    r: 16, range: 90, spread: 0, knockback: 120, usesAmount: true,
    arcWidth: 2.6, orbitRadius: 34, impact: 7, impactColor: '#c49a5e',
    levels: [
      {}, { damage: +11 }, { areaMul: 1.15 }, { cooldownMul: 0.9 },
      { amount: +1 }, { damage: +15 }, { cooldownMul: 0.86 }, { damage: +24, areaMul: 1.25 },
      { damage: +32 }, { amount: +1, damage: +41 }
    ],
  },
  {
    id: 'dig', name: 'Dig', type: 'ground',
    archetype: 'burrow',
    desc: 'A mound of earth tunnels under the ground to a foe and bursts up beneath it -- then on to the next.',
    behavior: 'dig', aim: 'nearest', motion: 'anchor',
    sprite: 'proj_boulder', palette: 'ground',
    card: { seq: 'fx_dirt', frame: 4, scale: 2.4, tint: true },
    damage: 28, cooldown: 2.6, amount: 1, speed: 150, area: 1, pierce: 0, duration: 1,
    r: 10, range: 200, spread: 0, knockback: 70, usesAmount: true,
    // Foes it surfaces under before it is done.
    hops: 2,
    levels: [
      {}, { damage: +9 }, { hops: 1, say: 'surfaces under 1 more foe' }, { cooldownMul: 0.9 },
      { amount: +1, say: '+1 digger' }, { damage: +11 }, { hops: 1, say: 'surfaces under 1 more foe' },
      { areaMul: 1.25, damage: +10 }, { cooldownMul: 0.88 }, { amount: +1, damage: +14, say: '+1 digger' }
    ],
  },

  // =========================================================================
  // NORMAL -- fast, clean, no gimmicks to learn
  // =========================================================================
  {
    id: 'swift', name: 'Swift', owner: 'eevee', type: 'normal',
    archetype: 'converge',
    desc: 'Stars burst out wide to either side, hang a heartbeat, then all converge on one foe from every direction at once.',
    behavior: 'swift', aim: 'nearest', motion: 'anchor',
    sprite: 'proj_star', palette: 'normal',
    card: { seq: 'fx_rs_star', frame: 0, scale: 3.2, tint: true },
    damage: 10, cooldown: 1.1, amount: 3, speed: 330, area: 1, pierce: 1, duration: 1,
    r: 5, range: 200, spread: 0, knockback: 8, usesAmount: true,
    levels: [
      {}, { amount: +1, say: '+1 star' }, { damage: +3 }, { cooldownMul: 0.9 },
      { amount: +1, say: '+1 star' }, { damage: +4 }, { cooldownMul: 0.88 }, { amount: +1, damage: +3, say: '+1 star' },
      { damage: +5 }, { amount: +1, damage: +6, say: '+1 star' }
    ],
    evolution: { into: 'star_barrage', needPassive: 'silk_scarf' },
  },
  {
    id: 'pay_day', name: 'Pay Day', type: 'normal',
    archetype: 'coins',
    desc: 'A spray of coins flung at the crowd. Now and then a foe they strike shakes loose a real one.',
    behavior: 'payDay', aim: 'nearest', motion: 'anchor',
    sprite: 'proj_fist', palette: 'normal',
    card: { atlas: 'coin', palette: 'gold', scale: 2.6 },
    damage: 9, cooldown: 1.1, amount: 6, speed: 230, area: 1, pierce: 0, duration: 0.75,
    r: 5, range: 150, spread: 0.35, knockback: 10, usesAmount: true,
    dropChance: 0.05,
    levels: [
      {}, { amount: +2, say: '+2 coins' }, { damage: +3 }, { cooldownMul: 0.9 },
      { amount: +2, say: '+2 coins' }, { damage: +4 }, { cooldownMul: 0.88 }, { amount: +2, damage: +4, say: '+2 coins' },
      { damage: +5 }, { amount: +2, damage: +6, say: '+2 coins' }
    ],
  },
  {
    id: 'tri_attack', name: 'Tri Attack', type: 'normal',
    archetype: 'triangle',
    desc: 'A spinning triangle that widens as it drifts. Its edges cut; its corners burn, freeze and paralyse.',
    behavior: 'triAttack', aim: 'nearest', motion: 'anchor',
    sprite: 'proj_shard', palette: 'normal',
    card: { seq: 'fx_tri', frame: 0, scale: 1.3, tint: true },
    // One triangle: its sprite is wide, so the levels make it bite harder and last longer instead.
    damage: 15, cooldown: 2.4, amount: 1, speed: 55, area: 1, pierce: 0, duration: 2.4,
    r: 6, range: 200, spread: 0, knockback: 0, usesAmount: false,
    triR: 34,
    levels: [
      {}, { damage: +5 }, { areaMul: 1.15 }, { cooldownMul: 0.9 },
      { duration: +0.6 }, { damage: +6 }, { cooldownMul: 0.88 }, { areaMul: 1.2, damage: +6 },
      { damage: +8 }, { duration: +0.6, damage: +10 }
    ],
  },
  {
    id: 'hyper_voice', name: 'Hyper Voice', type: 'normal',
    archetype: 'soundRings',
    desc: 'Rings of sound roll out ahead one after another, widening as they go and leaving foes confused.',
    behavior: 'hyperVoice', aim: 'nearest', motion: 'anchor',
    sprite: 'proj_ring', palette: 'normal',
    card: { seq: 'fx_beatup', frame: 3, scale: 0.9, tint: true },
    damage: 14, cooldown: 1.9, amount: 1, speed: 0, area: 1, pierce: 0, duration: 0.85,
    r: 6, range: 200, spread: 0, knockback: 40, usesAmount: false,
    rings: 3, cone: 0.6, confuse: 1.2,
    levels: [
      {}, { damage: +4 }, { rings: 1, say: '+1 ring' }, { cooldownMul: 0.9 },
      { damage: +5 }, { damage: +4 }, { cooldownMul: 0.88 }, { rings: 1, damage: +5, say: '+1 ring' },
      { damage: +7 }, { damage: +9, rings: 1, say: '+1 ring' }
    ],
  },
  {
    id: 'fury_swipes', name: 'Fury Swipes', type: 'normal',
    archetype: 'swarm',
    anim: { seq: 'fx_rs_claws', fps: 12, rot: true, scale: 0.6 },
    card: { seq: 'fx_rs_claws', frame: 1, scale: 1.7, tint: true },
    desc: 'A cloud of claws swarms one target and does not let go.',
    behavior: 'swarm', aim: 'nearest', motion: 'weave',
    sprite: 'proj_claw', palette: 'normal',
    damage: 7, cooldown: 2.4, amount: 4, speed: 200, area: 1, pierce: 9999, duration: 2.2,
    r: 5, range: 220, spread: 0, knockback: 4, usesAmount: true,
    orbitRadius: 16, orbitSpeed: 8, impact: 3, impactColor: '#ffffff',
    levels: [
      {}, { amount: +1 }, { damage: +3 }, { cooldownMul: 0.9 },
      { amount: +1 }, { damage: +4 }, { cooldownMul: 0.86 }, { amount: +2, damage: +6 },
      { damage: +8 }, { amount: +2, damage: +10 }
    ],
  },
  {
    id: 'giga_impact', name: 'Giga Impact', type: 'normal',
    archetype: 'charge',
    anim: { seq: 'fx_rs_orb', fps: 12, scale: 0.9 },
    hitAnim: { seq: 'fx_giga', dur: 0.4, fps: 20, scale: 0.9 },
    card: { seq: 'fx_giga', frame: 3, scale: 1.6, tint: true },
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
      { damage: +38 }, { pierce: +2, damage: +48 }
    ],
  },

  // =========================================================================
  // ELECTRIC -- reaches across the crowd and locks it down
  // =========================================================================
  {
    id: 'spark_chain', name: 'Spark Chain', type: 'electric',
    archetype: 'chain',
    card: { seq: 'fx_spark', frame: 1, scale: 2.2, tint: true },
    desc: 'Lightning that leaps between enemies. The tighter the crowd, the better.',
    behavior: 'chain', aim: 'nearest', motion: 'straight',
    sprite: 'proj_spark', palette: 'electric',
    damage: 22, cooldown: 1.9, amount: 0, speed: 0, area: 1, pierce: 0, duration: 0.2,
    r: 4, range: 170, spread: 0, knockback: 0, usesAmount: true,
    jumps: 3, jumpRange: 80, falloff: 0.88, arcColor: '#f8e038',
    levels: [
      {}, { jumps: +1 }, { damage: +8 }, { cooldownMul: 0.88 },
      { jumps: +1 }, { damage: +11 }, { cooldownMul: 0.86 }, { jumps: +2, damage: +15 },
      { damage: +20 }, { jumps: +2, damage: +26 }
    ],
  },
  {
    id: 'electroweb', name: 'Electroweb', type: 'electric',
    archetype: 'net',
    desc: 'A live net thrown onto the crowd. Foes in its mesh are tangled, and a blow to one shocks all the rest.',
    behavior: 'electroweb', aim: 'nearest', motion: 'anchor',
    sprite: 'proj_fang', palette: 'electric',
    card: { seq: 'fx_web', frame: 0, scale: 1.5, tint: true },
    // One net: it is the size of the crowd it catches, and two would cover the screen.
    damage: 10, cooldown: 2.6, amount: 1, speed: 0, area: 1, pierce: 0, duration: 2.6,
    r: 6, range: 190, spread: 0, knockback: 0, usesAmount: false,
    webR: 30, tangle: 0.6, share: 0.45,
    levels: [
      {}, { damage: +3 }, { areaMul: 1.15 }, { cooldownMul: 0.9 },
      { duration: +0.6 }, { damage: +4 }, { cooldownMul: 0.88 }, { areaMul: 1.2, damage: +4 },
      { damage: +5 }, { duration: +0.8, damage: +7 }
    ],
  },
  {
    id: 'volt_coil', name: 'Volt Coil', type: 'electric',
    archetype: 'turret',
    emitAnim: { seq: 'fx_spark', fps: 16, scale: 0.6 },
    card: { seq: 'fx_spark', frame: 2, scale: 2.2, tint: true },
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
      { damage: +30 }, { amount: +1, damage: +37 }
    ],
  },
  {
    id: 'electro_ball', name: 'Electro Ball', type: 'electric',
    archetype: 'bouncer',
    // Ripped blue from the Thunderbolt sheet; drawn in electric yellow.
    anim: { seq: 'fx_eball', fps: 10, scale: 0.8, tint: ['#c8a010', '#f8e038', '#fffad0'] },
    hitAnim: { seq: 'fx_spark', dur: 0.25, fps: 16, scale: 0.9 },
    card: { seq: 'fx_eball', frame: 0, scale: 1.8, tint: true },
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
      { damage: +18 }, { bounces: +3, damage: +22 }
    ],
  },
  {
    id: 'electric_terrain', name: 'Electric Terrain', type: 'electric',
    archetype: 'tileGrid',
    desc: 'The floor at your feet becomes a grid of tiles lighting up in travelling patterns. A lit tile shocks whatever stands on it.',
    behavior: 'electricTerrain', aim: 'nearest', motion: 'anchor',
    sprite: 'proj_ring', palette: 'electric',
    card: { seq: 'fx_panel_y', frame: 3, scale: 0.8, tint: true },
    damage: 12, cooldown: 4.2, amount: 1, speed: 0, area: 1, pierce: 0, duration: 4.0,
    r: 6, range: 160, spread: 0, knockback: 0, usesAmount: false,
    tiles: 5, tile: 22, stepT: 0.32,
    levels: [
      {}, { damage: +4 }, { duration: +0.8 }, { cooldownMul: 0.9 },
      { areaMul: 1.15 }, { damage: +5 }, { cooldownMul: 0.88 }, { duration: +0.8, damage: +5 },
      { damage: +7 }, { areaMul: 1.15, damage: +9 }
    ],
  },
  {
    id: 'live_wire', name: 'Live Wire', type: 'electric',
    archetype: 'tether',
    card: { seq: 'fx_ybolt', frame: 0, scale: 0.7, tint: true },
    desc: 'A cable of current latched onto one enemy, burning everything standing on the line.',
    behavior: 'tether', aim: 'nearest', motion: 'straight',
    sprite: 'proj_quill', palette: 'electric',
    damage: 9, cooldown: 0.2, amount: 1, speed: 0, area: 1, pierce: 0, duration: 0.2,
    r: 6, range: 190, spread: 0, knockback: 4, usesAmount: false,
    slow: 0.25, arcColor: '#fffaa8',
    levels: [
      {}, { damage: +3 }, { areaMul: 1.2 }, { cooldownMul: 0.9 },
      { damage: +4 }, { areaMul: 1.2 }, { cooldownMul: 0.85 }, { damage: +7, areaMul: 1.25 },
      { damage: +9 }, { areaMul: 1.25, damage: +12 }
    ],
  },

  // =========================================================================
  // DARK -- punishes crowds, and takes something back from them
  // =========================================================================
  {
    id: 'night_daze', name: 'Night Daze', type: 'dark',
    archetype: 'link',
    card: { seq: 'fx_eos_slashes', frame: 4, scale: 1, tint: true },
    desc: 'A black line drawn to one enemy. Everything standing on it pays, and so do they.',
    behavior: 'link', aim: 'toughest', motion: 'straight',
    sprite: 'proj_eye', palette: 'dark',
    damage: 16, cooldown: 1.5, amount: 1, speed: 0, area: 1, pierce: 0, duration: 0.2,
    r: 9, range: 230, spread: 0, knockback: 10, usesAmount: false,
    linkGain: 0.55, weaken: 2.5, arcColor: '#8a72b8',
    levels: [
      {}, { damage: +6 }, { areaMul: 1.2 }, { cooldownMul: 0.9 },
      { damage: +8 }, { areaMul: 1.2 }, { cooldownMul: 0.86 }, { damage: +13, areaMul: 1.25 },
      { damage: +18 }, { areaMul: 1.25, damage: +22 }
    ],
  },
  {
    id: 'sucker_punch', name: 'Sucker Punch', type: 'dark',
    archetype: 'counter',
    desc: 'A fist out of nowhere on any foe winding up an attack or a cast: it hits hard and knocks the move out of it.',
    behavior: 'suckerPunch', aim: 'nearest', motion: 'anchor',
    sprite: 'proj_fist', palette: 'dark',
    card: { seq: 'fx_eos_fist', frame: 2, scale: 2.2, tint: true },
    damage: 26, cooldown: 0.7, amount: 2, speed: 0, area: 1, pierce: 0, duration: 1,
    r: 6, range: 170, spread: 0, knockback: 0, usesAmount: true,
    counterMul: 2.2, jabMul: 1, daze: 0.4,
    levels: [
      {}, { damage: +6 }, { amount: +1, say: '+1 fist' }, { cooldownMul: 0.9 },
      { damage: +7 }, { amount: +1, say: '+1 fist' }, { cooldownMul: 0.88 }, { damage: +8 },
      { damage: +10 }, { amount: +1, damage: +12, say: '+1 fist' }
    ],
  },
  {
    id: 'foul_play', name: 'Foul Play', type: 'dark',
    archetype: 'bouncer',
    anim: { seq: 'fx_eos_grin', fps: 16, scale: 0.7 },
    hitAnim: { seq: 'fx_eos_claws', dur: 0.3, fps: 20, scale: 0.5 },
    card: { seq: 'fx_eos_grin', frame: 9, scale: 2, tint: true },
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
      { damage: +24 }, { bounces: +2, damage: +31 }
    ],
  },
  {
    id: 'dark_void', name: 'Dark Void', type: 'dark',
    archetype: 'pull',
    zoneAnim: { seq: 'fx_eos_void', fps: 6, fit: false, scale: 2.2, alpha: 0.85 },
    card: { seq: 'fx_eos_void', frame: 0, scale: 2.6, tint: true },
    desc: 'A hole opens under your feet and everything nearby slides into it.',
    behavior: 'pull', aim: 'nearest', motion: 'orbitPlayer',
    sprite: 'proj_vortex', palette: 'dark',
    damage: 22, cooldown: 4.6, amount: 1, speed: 0, area: 1, pierce: 0, duration: 3.2,
    r: 62, range: 0, spread: 0, knockback: 0, usesAmount: false,
    pullForce: 110, slow: 0.3, zoneColor: '#2a2038',
    levels: [
      {}, { damage: +8 }, { areaMul: 1.15 }, { cooldownMul: 0.9 },
      { damage: +10 }, { areaMul: 1.15 }, { cooldownMul: 0.86 }, { damage: +16, areaMul: 1.2 },
      { damage: +22 }, { areaMul: 1.25, damage: +27 }
    ],
  },
  {
    id: 'torment', name: 'Torment', type: 'dark',
    archetype: 'torment',
    desc: 'The toughest foe near you is tormented: a dark aura wells off it that sears its own allies.',
    behavior: 'torment', aim: 'toughest', motion: 'anchor',
    sprite: 'proj_fang', palette: 'dark',
    card: { seq: 'fx_eos_grin', frame: 8, scale: 2, tint: true },
    damage: 8, cooldown: 3.0, amount: 1, speed: 0, area: 1, pierce: 0, duration: 4,
    r: 6, range: 200, spread: 0, knockback: 0, usesAmount: false,
    auraR: 36,
    levels: [
      {}, { damage: +3 }, { areaMul: 1.15 }, { cooldownMul: 0.9 },
      { duration: +0.8 }, { damage: +4 }, { cooldownMul: 0.88 }, { damage: +4, areaMul: 1.15 },
      { damage: +5 }, { damage: +7, duration: +0.8 }
    ],
  },
  {
    id: 'feint_attack', name: 'Feint Attack', type: 'dark',
    archetype: 'feint',
    desc: 'Shadows flicker in behind several foes, stab them in the back, and shove them stumbling toward you.',
    behavior: 'feintAttack', aim: 'nearest', motion: 'anchor',
    sprite: 'proj_seed', palette: 'dark',
    card: { seq: 'fx_eos_slashes', frame: 5, scale: 1, tint: true },
    damage: 24, cooldown: 1.8, amount: 2, speed: 0, area: 1, pierce: 0, duration: 1,
    r: 6, range: 180, spread: 0, knockback: 1, usesAmount: true,
    lurk: 0.3, yank: 120,
    levels: [
      {}, { damage: +6 }, { amount: +1, say: '+1 shadow' }, { cooldownMul: 0.9 },
      { damage: +7 }, { amount: +1, say: '+1 shadow' }, { cooldownMul: 0.88 }, { damage: +8 },
      { amount: +1, say: '+1 shadow' }, { damage: +12 }
    ],
  },

  // =========================================================================
  // GRASS -- roots, spreads, and keeps growing while you are elsewhere
  // =========================================================================
  {
    id: 'leaf_arrow', name: 'Leaf Arrow', owner: 'rowlet', type: 'grass',
    archetype: 'shot',
    anim: { seq: 'fx_leafarrow', rot: true, scale: 0.9 },
    hitAnim: { seq: 'fx_rs_leaf', dur: 0.3, fps: 12, scale: 1 },
    card: { seq: 'fx_leafarrow', frame: 0, scale: 1.6, tint: true },
    desc: 'A spinning blade that drifts on the wind and punches through a whole line.',
    behavior: 'projectile', aim: 'toughest', motion: 'wave',
    sprite: 'proj_leaf', palette: 'grass',
    damage: 30, cooldown: 1.55, amount: 1, speed: 320, area: 1, pierce: 3, duration: 1.6,
    r: 5, range: 350, spread: 0.16, knockback: 14, usesAmount: true,
    spin: 14, amp: 52, freq: 7, trail: 18, trailColor: '#c4f29a', impact: 5, impactColor: '#6cc840',
    levels: [
      {}, { amount: +1 }, { damage: +10 }, { cooldownMul: 0.9 },
      { pierce: +2 }, { damage: +12 }, { cooldownMul: 0.88 }, { amount: +1, damage: +14 },
      { damage: +19 }, { amount: +1, damage: +24 }
    ],
    evolution: { into: 'spirit_shackle', needPassive: 'sharp_beak' },
  },
  {
    id: 'seed_bomb', name: 'Seed Bomb', type: 'grass',
    archetype: 'bloom',
    // Its look is its own atlas art: one of items_2.png's two seeds at random, every throw.
    hitAnim: { seq: 'fx_puff', dur: 0.35, fps: 9, scale: 1.3, dust: '#c4f29a' },
    card: { atlas: 'proj_seed_a', palette: 'grass', scale: 2.4 },
    desc: 'Lobs seeds that take root, wait, and then go off underneath the crowd.',
    behavior: 'bloom', aim: 'nearest', motion: 'arc',
    // The two seeds of items_2.png, one or the other at random for every seed thrown.
    sprite: 'proj_seed_a', spriteAlt: 'proj_seed_b', spriteFallback: 'proj_seed', palette: 'grass',
    damage: 38, cooldown: 2.1, amount: 2, speed: 210, area: 1, pierce: 0, duration: 1.5,
    r: 6, range: 190, spread: 0.42, knockback: 50, usesAmount: true,
    fuse: 1.5, blastRadius: 46, impact: 9, impactColor: '#c4f29a',
    levels: [
      {}, { amount: +1 }, { damage: +8 }, { cooldownMul: 0.9 },
      { amount: +1 }, { damage: +11 }, { areaMul: 1.2 }, { amount: +2, damage: +15 },
      { damage: +20 }, { amount: +2, damage: +26 }
    ],
  },
  {
    id: 'leech_seed', name: 'Leech Seed', type: 'grass',
    archetype: 'drain',
    desc: 'Seeds that root in foes and drain them, mending you. When a host falls, its seed leaps to the next.',
    behavior: 'leechSeed', aim: 'nearest', motion: 'anchor',
    sprite: 'proj_seed', palette: 'grass',
    card: { seq: 'fx_sprout', frame: 3, scale: 1.4, tint: true },
    damage: 7, cooldown: 2.2, amount: 2, speed: 0, area: 1, pierce: 0, duration: 4,
    r: 6, range: 180, spread: 70, knockback: 0, usesAmount: true,
    heal: 0.004, healCap: 0.02,
    levels: [
      {}, { amount: +1, say: '+1 seed' }, { damage: +2 }, { cooldownMul: 0.9 },
      { amount: +1, say: '+1 seed' }, { damage: +3 }, { duration: +1.5 }, { amount: +1, damage: +3, say: '+1 seed' },
      { damage: +4 }, { damage: +5, duration: +1.5 }
    ],
  },
  {
    id: 'solar_beam', name: 'Solar Beam', type: 'grass',
    archetype: 'beam',
    desc: 'Sunlight gathers over you for a moment -- you can see it swell -- then a great beam pierces a whole line.',
    behavior: 'solarBeam', aim: 'nearest', motion: 'anchor',
    sprite: 'proj_ring', palette: 'grass',
    card: { seq: 'fx_sun', frame: 0, scale: 0.85, tint: true },
    // One beam: it is the length of the screen already.
    damage: 24, cooldown: 3.0, amount: 1, speed: 0, area: 1, pierce: 0, duration: 0.4,
    r: 6, range: 220, spread: 0, knockback: 30, usesAmount: false,
    gather: 1.0, beamW: 12,
    levels: [
      {}, { damage: +6 }, { gatherCut: 0.15, say: 'gathers 0.15s faster' }, { cooldownMul: 0.9 },
      { damage: +7 }, { areaMul: 1.2 }, { cooldownMul: 0.88 }, { gatherCut: 0.15, damage: +7, say: 'gathers 0.15s faster' },
      { damage: +9 }, { damage: +11, areaMul: 1.15 }
    ],
  },
  {
    id: 'grass_knot', name: 'Grass Knot', type: 'grass',
    archetype: 'trip',
    desc: 'Knots spring up under the heaviest foes near you and trip them. The heavier the foe, the harder it falls.',
    behavior: 'grassKnot', aim: 'nearest', motion: 'anchor',
    sprite: 'proj_thorn', palette: 'grass',
    card: { seq: 'fx_vine', frame: 3, scale: 1.2, tint: true },
    damage: 18, cooldown: 2.0, amount: 1, speed: 0, area: 1, pierce: 0, duration: 1,
    r: 6, range: 180, spread: 0, knockback: 0, usesAmount: true,
    share: 0.08, bossShare: 0.02, stun: 0.8,
    levels: [
      {}, { damage: +5 }, { amount: +1, say: '+1 knot' }, { cooldownMul: 0.9 },
      { damage: +6 }, { amount: +1, say: '+1 knot' }, { cooldownMul: 0.88 }, { damage: +7 },
      { amount: +1, say: '+1 knot' }, { damage: +10 }
    ],
  },
  {
    id: 'wood_hammer', name: 'Wood Hammer', type: 'grass',
    archetype: 'log',
    desc: 'A great log crashes down on the thickest of the crowd, then rolls on through it, flattening.',
    behavior: 'woodHammer', aim: 'nearest', motion: 'anchor',
    sprite: 'proj_boulder', palette: 'grass',
    card: { seq: 'fx_rs_blade', frame: 2, scale: 1.1, tint: true },
    // One log: it is big, and the levels make it heavier rather than more of them.
    damage: 34, cooldown: 3.2, amount: 1, speed: 0, area: 1, pierce: 0, duration: 1,
    r: 6, range: 200, spread: 0, knockback: 60, usesAmount: false,
    logR: 16, roll: 0.8, rollSpeed: 150,
    levels: [
      {}, { damage: +9 }, { areaMul: 1.15 }, { cooldownMul: 0.9 },
      { damage: +10 }, { areaMul: 1.15 }, { cooldownMul: 0.88 }, { damage: +12 },
      { damage: +14 }, { damage: +18, areaMul: 1.1 }
    ],
  },

  // =========================================================================
  // FLYING -- long reach, hard knockback, nothing gets close
  // =========================================================================
  {
    id: 'whirlwind', name: 'Whirlwind', type: 'flying',
    archetype: 'blowback',
    desc: 'A blast of wind that blows foes far away -- and a foe blown into another hurts them both.',
    behavior: 'whirlwind', aim: 'nearest', motion: 'anchor',
    sprite: 'proj_feather', palette: 'flying',
    card: { seq: 'fx_swirl', frame: 0, scale: 1.4, tint: true },
    damage: 32, cooldown: 1.6, amount: 1, speed: 0, area: 1, pierce: 0, duration: 1,
    r: 6, range: 170, spread: 0, knockback: 1, usesAmount: false,
    gustR: 16, travel: 0.5, blow: 300, crash: 1,
    levels: [
      {}, { damage: +5 }, { areaMul: 1.15 }, { cooldownMul: 0.9 },
      { damage: +6 }, { blowPlus: 60, say: 'blows foes further' }, { cooldownMul: 0.88 }, { damage: +7, areaMul: 1.15 },
      { damage: +9 }, { damage: +11, blowPlus: 60, say: 'blows foes further' }
    ],
  },
  {
    id: 'pin_missile', name: 'Pin Missile', type: 'flying',
    archetype: 'cone',
    anim: { seq: 'fx_needle', rot: true, rotOff: -0.785, scale: 0.4 },
    card: { seq: 'fx_needle', frame: 0, scale: 1.3, tint: true },
    desc: 'A spray of quills. Cheap, constant, and it fills the space in front of you.',
    behavior: 'cone', aim: 'nearest', motion: 'straight',
    sprite: 'proj_quill', palette: 'flying',
    damage: 9, cooldown: 0.8, amount: 5, speed: 340, area: 1, pierce: 0, duration: 0.7,
    r: 4, range: 200, spread: 0.2, knockback: 8, usesAmount: true,
    trail: 10, trailColor: '#b8cde0', impact: 3, impactColor: '#f0f6ff',
    levels: [
      {}, { amount: +2 }, { damage: +3 }, { cooldownMul: 0.9 },
      { amount: +2 }, { damage: +4 }, { cooldownMul: 0.86 }, { amount: +3, damage: +7 },
      { damage: +9 }, { amount: +3, damage: +12 }
    ],
  },
  {
    id: 'feather_dance', name: 'Feather Dance', type: 'flying',
    archetype: 'plume',
    desc: 'Feathers drift down onto the crowd. A plumed foe is featherweight: everything knocks it three times as far.',
    behavior: 'featherDance', aim: 'nearest', motion: 'anchor',
    sprite: 'proj_feather', palette: 'flying',
    card: { seq: 'fx_feather', frame: 0, scale: 1.3, tint: true },
    damage: 12, cooldown: 1.4, amount: 3, speed: 0, area: 1, pierce: 0, duration: 4,
    r: 6, range: 170, spread: 0, knockback: 50, usesAmount: true,
    levels: [
      {}, { amount: +1, say: '+1 feather' }, { damage: +4 }, { cooldownMul: 0.9 },
      { amount: +1, say: '+1 feather' }, { damage: +5 }, { duration: +1.5 }, { amount: +1, damage: +5, say: '+1 feather' },
      { damage: +6 }, { amount: +1, damage: +8, say: '+1 feather' }
    ],
  },
  {
    id: 'drill_peck', name: 'Drill Peck', type: 'flying',
    archetype: 'drill',
    desc: 'A drill bores through a whole line. It slows with every foe it goes through, and hits harder the deeper it gets.',
    behavior: 'drillPeck', aim: 'nearest', motion: 'anchor',
    sprite: 'proj_claw', palette: 'flying',
    card: { seq: 'fx_drill', frame: 0, scale: 1.6, tint: true },
    damage: 38, cooldown: 1.5, amount: 1, speed: 320, area: 1, pierce: 0, duration: 1,
    r: 7, range: 220, spread: 0, knockback: 10, usesAmount: false,
    deeper: 0.15, drag: 0.86,
    levels: [
      {}, { damage: +7 }, { drillSpeed: 40, say: 'the drill bores faster' }, { cooldownMul: 0.9 },
      { damage: +8 }, { areaMul: 1.15 }, { cooldownMul: 0.88 }, { damage: +9, drillSpeed: 40, say: 'the drill bores faster' },
      { damage: +11 }, { damage: +14, areaMul: 1.1 }
    ],
    evolution: { into: 'sky_attack', needPassive: 'pretty_wing' },
  },
  {
    id: 'sky_guard', name: 'Sky Guard', type: 'flying',
    archetype: 'companion',
    anim: { seq: 'fx_wings', scale: 0.32 },
    card: { seq: 'fx_wings', frame: 0, scale: 0.9, tint: true },
    desc: 'A companion that patrols on its own and runs down whatever strays.',
    behavior: 'companion', aim: 'nearest', motion: 'homing',
    sprite: 'proj_hound', palette: 'flying',
    damage: 20, cooldown: 5.4, amount: 1, speed: 230, area: 1, pierce: 9999, duration: 5.5,
    r: 7, range: 280, spread: 0, knockback: 30, usesAmount: true,
    homingTurn: 4.5, trail: 12, trailColor: '#b8cde0', impact: 5, impactColor: '#f0f6ff',
    levels: [
      {}, { damage: +4 }, { cooldownMul: 0.9 }, { amount: +1 },
      { damage: +6 }, { cooldownMul: 0.86 }, { areaMul: 1.2 }, { amount: +1, damage: +9 },
      { damage: +12 }, { amount: +1, damage: +15 }
    ],
  },
  {
    id: 'tailwind', name: 'Tailwind', type: 'flying',
    archetype: 'slipwind',
    desc: 'As you run, wind streams off your back, battering whatever follows -- and it carries you a little faster.',
    behavior: 'tailwind', aim: 'nearest', motion: 'anchor',
    sprite: 'proj_vortex', palette: 'flying',
    card: { seq: 'fx_rs_gust', frame: 1, scale: 1.6, tint: true },
    damage: 9, cooldown: 0.22, amount: 1, speed: 0, area: 1, pierce: 0, duration: 0.9,
    r: 6, range: 0, spread: 0, knockback: 60, usesAmount: false,
    streamR: 12, streamSpeed: 110, haste: 1.15,
    levels: [
      {}, { damage: +3 }, { areaMul: 1.15 }, { cooldownMul: 0.92 },
      { damage: +3 }, { duration: +0.3 }, { cooldownMul: 0.9 }, { damage: +4, areaMul: 1.15 },
      { damage: +5 }, { damage: +6, duration: +0.3 }
    ],
  },

  // =========================================================================
  // GHOST -- goes through things, and comes at you from angles that do not exist
  // =========================================================================
  {
    id: 'pulse_aura', name: 'Spectral Aura', type: 'ghost',
    archetype: 'aura',
    anim: { seq: 'fx_eos_vortex', fps: 16, scale: 0.8 },
    card: { seq: 'fx_eos_vortex', frame: 8, scale: 2, tint: true },
    desc: 'A field that simply hurts anything near you. No aiming, ever.',
    behavior: 'aura', aim: 'nearest', motion: 'orbitPlayer',
    sprite: 'proj_bubble', palette: 'ghost',
    damage: 7, cooldown: 0.45, amount: 1, speed: 0, area: 1, pierce: 9999, duration: 0.5,
    r: 34, range: 0, spread: 0, knockback: 6, usesAmount: false,
    pulse: 0.3, impact: 0,
    levels: [
      {}, { damage: +3 }, { areaMul: 1.15 }, { cooldownMul: 0.88 },
      { damage: +4 }, { areaMul: 1.15 }, { cooldownMul: 0.86 }, { damage: +7, areaMul: 1.2 },
      { damage: +9 }, { areaMul: 1.25, damage: +12 }
    ],
  },
  {
    id: 'shadow_ball', name: 'Shadow Ball', type: 'ghost',
    archetype: 'split',
    anim: { seq: 'fx_eos_shadoworb', fps: 14, scale: 0.8 },
    hitAnim: { seq: 'fx_eos_darkburst', dur: 0.3, fps: 32, scale: 0.45 },
    card: { seq: 'fx_eos_shadoworb', frame: 2, scale: 2.6, tint: true },
    desc: 'A lobbed knot of shadow that bursts into smaller ones the moment it touches anything.',
    behavior: 'split', aim: 'nearest', motion: 'arc',
    sprite: 'proj_skull', palette: 'ghost',
    damage: 30, cooldown: 1.6, amount: 1, speed: 230, area: 1, pierce: 0, duration: 1.1,
    r: 7, range: 200, spread: 0.3, knockback: 20, usesAmount: false,
    shards: 4, spin: 3, trail: 16, trailColor: '#7a6ab0', impact: 7, impactColor: '#c8bcf0',
    levels: [
      {}, { shards: +1 }, { damage: +10 }, { cooldownMul: 0.9 },
      { shards: +1 }, { damage: +13 }, { cooldownMul: 0.86 }, { shards: +2, damage: +20 },
      { damage: +27 }, { shards: +2, damage: +34 }
    ],
  },
  {
    id: 'poltergeist', name: 'Poltergeist', type: 'ghost',
    archetype: 'hurl',
    desc: 'Rocks lift out of the ground round you, hover a moment, and are hurled at foes.',
    behavior: 'poltergeist', aim: 'nearest', motion: 'anchor',
    sprite: 'proj_rock', palette: 'ghost',
    card: { seq: 'fx_eos_rock', frame: 0, scale: 1.4, tint: true },
    damage: 34, cooldown: 2.0, amount: 1, speed: 260, area: 1, pierce: 0, duration: 1,
    r: 8, range: 200, spread: 0, knockback: 60, usesAmount: true,
    hover: 0.5,
    levels: [
      {}, { damage: +7 }, { amount: +1, say: '+1 rock' }, { cooldownMul: 0.9 },
      { damage: +8 }, { amount: +1, say: '+1 rock' }, { cooldownMul: 0.88 }, { damage: +10 },
      { amount: +1, say: '+1 rock' }, { damage: +14 }
    ],
  },
  {
    id: 'mean_look', name: 'Mean Look', type: 'ghost',
    archetype: 'gaze',
    desc: 'A great eye opens over the crowd. Nothing in its gaze can leave, and it stares harder the more it holds.',
    behavior: 'meanLook', aim: 'nearest', motion: 'anchor',
    sprite: 'proj_eye', palette: 'ghost',
    card: { seq: 'fx_eos_eye', frame: 0, scale: 2.2, tint: true },
    // One eye: it is a big sprite over a whole crowd. The levels hold it open longer.
    damage: 5, cooldown: 4.5, amount: 1, speed: 0, area: 1, pierce: 0, duration: 3,
    r: 6, range: 200, spread: 0, knockback: 0, usesAmount: false,
    gazeR: 48, perHeld: 0.06,
    levels: [
      {}, { damage: +2 }, { areaMul: 1.15 }, { cooldownMul: 0.9 },
      { duration: +0.6 }, { damage: +3 }, { cooldownMul: 0.88 }, { damage: +3, areaMul: 1.15 },
      { damage: +4 }, { duration: +0.8, damage: +5 }
    ],
  },
  {
    id: 'curse', name: 'Curse', type: 'ghost',
    archetype: 'curse',
    desc: 'Costs you 5% of your health. The cursed foe -- the toughest near you -- loses a large share of its own every half second.',
    behavior: 'curse', aim: 'toughest', motion: 'anchor',
    sprite: 'fx_wisp', palette: 'ghost',
    card: { seq: 'fx_eos_ghost', frame: 10, scale: 1.2, tint: true },
    damage: 4, cooldown: 3.5, amount: 1, speed: 0, area: 1, pierce: 0, duration: 3,
    r: 6, range: 200, spread: 0, knockback: 0, usesAmount: false,
    cost: 0.05, share: 0.06, bossShare: 0.01,
    levels: [
      {}, { damage: +2 }, { cooldownMul: 0.9 }, { duration: +0.5 },
      { damage: +2 }, { cooldownMul: 0.9 }, { duration: +0.5 }, { damage: +3 },
      { cooldownMul: 0.88 }, { damage: +4, duration: +0.5 }
    ],
  },
  {
    id: 'hex', name: 'Hex', type: 'ghost',
    archetype: 'afflict',
    desc: 'Purple fire bursts on every afflicted foe near you -- burned, slowed, stunned, confused, cursed -- the more afflictions, the worse.',
    behavior: 'hex', aim: 'nearest', motion: 'anchor',
    sprite: 'proj_seed', palette: 'ghost',
    card: { seq: 'fx_eos_hexfire', frame: 1, scale: 2.4, tint: true },
    damage: 18, cooldown: 1.8, amount: 0, speed: 0, area: 1, pierce: 0, duration: 1,
    r: 6, range: 200, spread: 0, knockback: 0, usesAmount: true,
    burstBase: 4, perAff: 0.5,
    levels: [
      {}, { damage: +5 }, { amount: +1, say: 'bursts on 1 more foe' }, { cooldownMul: 0.9 },
      { damage: +6 }, { amount: +1, say: 'bursts on 1 more foe' }, { cooldownMul: 0.88 }, { damage: +7 },
      { amount: +2, say: 'bursts on 2 more foes' }, { damage: +10 }
    ],
  },

  // =========================================================================
  // POISON -- nothing dies fast, and everything dies eventually
  // =========================================================================
  {
    id: 'toxic_trail', name: 'Toxic Trail', type: 'poison',
    archetype: 'trail',
    // Explorers of Sky's smoke, drawn in poison's purple.
    zoneAnim: { seq: 'fx_eos_smoke', fps: 6, scale: 0.9, alpha: 0.55, tint: ['#5a2a80', '#a060d0', '#e8c0ff'] },
    card: { seq: 'fx_eos_smoke', frame: 2, scale: 2, tint: true },
    desc: 'Poison clouds drip off you as you move. Standing still wastes it.',
    behavior: 'trail', aim: 'nearest', motion: 'drift',
    sprite: 'proj_cloud', palette: 'poison',
    damage: 16, cooldown: 0.75, amount: 1, speed: 0, area: 1, pierce: 0, duration: 2.6,
    r: 20, range: 0, spread: 0, knockback: 0, usesAmount: false,
    slow: 0.2, zoneColor: '#b050d0',
    levels: [
      {}, { damage: +5 }, { cooldownMul: 0.88 }, { areaMul: 1.2 },
      { damage: +7 }, { cooldownMul: 0.86 }, { areaMul: 1.2 }, { damage: +12 },
      { damage: +16 }, { areaMul: 1.25, damage: +20 }
    ],
  },
  {
    id: 'sludge_bomb', name: 'Sludge Bomb', owner: 'gastly', type: 'poison',
    archetype: 'mine',
    anim: { seq: 'fx_eos_goo', frame: 4, scale: 0.35 },
    hitAnim: { seq: 'fx_eos_goo', dur: 0.4, fps: 30, scale: 0.5 },
    card: { seq: 'fx_eos_goo', frame: 5, scale: 0.9, tint: true },
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
      { damage: +14 }, { amount: +2, damage: +17 }
    ],
  },
  {
    id: 'acid_spray', name: 'Acid Spray', type: 'poison',
    archetype: 'corrode',
    desc: 'Globs of acid land as puddles. Whatever wades in has its armour melted away for good, a point at a time.',
    behavior: 'acidSpray', aim: 'nearest', motion: 'anchor',
    sprite: 'proj_bubble', palette: 'poison',
    card: { seq: 'fx_eos_acid', frame: 3, scale: 2.2, tint: true },
    damage: 6, cooldown: 1.6, amount: 3, speed: 0, area: 1, pierce: 0, duration: 3,
    r: 6, range: 160, spread: 0, knockback: 0, usesAmount: true,
    puddleR: 14, meltMax: 6,
    levels: [
      {}, { damage: +2 }, { duration: +0.6 }, { cooldownMul: 0.9 },
      { amount: +1, say: '+1 glob' }, { damage: +2 }, { cooldownMul: 0.88 }, { damage: +3 },
      { amount: +1, say: '+1 glob' }, { damage: +4 }
    ],
  },
  {
    id: 'toxic_spikes', name: 'Toxic Spikes', type: 'poison',
    archetype: 'orbit', ownArt: true,
    card: { atlas: 'proj_toxic_spike', palette: 'poison', scale: 2 },
    desc: 'Lays a ring of barbs around where you are standing and leaves them there.',
    behavior: 'orbit', aim: 'nearest', motion: 'anchor',
    // Its own spike (assets/pmd/toxic_spike.png); the drawn thorn if the file is missing.
    sprite: 'proj_toxic_spike', spriteFallback: 'proj_thorn', palette: 'poison',
    damage: 20, cooldown: 2.8, amount: 5, speed: 0, area: 1, pierce: 9999, duration: 4.0,
    r: 7, range: 0, spread: 0, knockback: 8, usesAmount: true,
    orbitRadius: 48, orbitSpeed: 0, spin: 1.2, impact: 5, impactColor: '#e8b0f8',
    levels: [
      {}, { amount: +2 }, { damage: +7 }, { cooldownMul: 0.9 },
      { amount: +2 }, { damage: +9 }, { areaMul: 1.2 }, { amount: +3, damage: +14 },
      { damage: +19 }, { amount: +3, damage: +24 }
    ],
  },
  {
    id: 'clear_smog', name: 'Clear Smog', type: 'poison',
    archetype: 'cleanse',
    desc: 'A bubble of smog drifts after the crowd, stripping shields, barriers and haste, and coughing foes out of their attacks.',
    behavior: 'clearSmog', aim: 'nearest', motion: 'anchor',
    sprite: 'proj_cloud', palette: 'poison',
    card: { seq: 'fx_eos_smog', frame: 0, scale: 2.4, tint: true },
    damage: 8, cooldown: 3.2, amount: 1, speed: 0, area: 1, pierce: 0, duration: 4,
    r: 6, range: 190, spread: 0, knockback: 0, usesAmount: false,
    smogR: 26, drift: 34,
    levels: [
      {}, { damage: +2 }, { areaMul: 1.15 }, { cooldownMul: 0.9 },
      { duration: +1 }, { damage: +3 }, { cooldownMul: 0.88 }, { damage: +3, areaMul: 1.15 },
      { damage: +4 }, { duration: +1, damage: +5 }
    ],
  },
  {
    id: 'toxic', name: 'Toxic', type: 'poison',
    archetype: 'escalate',
    desc: 'A needle whose poison doubles with every tick: barely a scratch at first, ruinous by the end.',
    behavior: 'toxic', aim: 'nearest', motion: 'anchor',
    sprite: 'proj_quill', palette: 'poison',
    card: { seq: 'fx_needle', frame: 0, scale: 1.3, tint: true },
    damage: 4, cooldown: 1.4, amount: 1, speed: 0, area: 1, pierce: 0, duration: 3,
    r: 6, range: 200, spread: 0, knockback: 0, usesAmount: false,
    doublings: 5,
    levels: [
      {}, { damage: +0.6 }, { cooldownMul: 0.9 }, { damage: +0.6 },
      { duration: +0.5 }, { damage: +0.8 }, { cooldownMul: 0.88 }, { damage: +0.8 },
      { damage: +1 }, { damage: +1.2, cooldownMul: 0.9 }
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
    id: 'ember', name: 'Ember', owner: 'vulpix', type: 'fire',
    archetype: 'kindle',
    desc: 'Embers land and kindle fires on the ground. A fire creeps after the nearest foe and spreads to burning foes near it.',
    behavior: 'ember', aim: 'nearest', motion: 'anchor',
    sprite: 'proj_spark', palette: 'fire',
    card: { seq: 'fx_eos_flame', frame: 2, scale: 1.1, tint: true },
    damage: 8, cooldown: 1.2, amount: 2, speed: 0, area: 1, pierce: 0, duration: 3,
    r: 5, range: 190, spread: 0, knockback: 0, usesAmount: true,
    levels: [
      {}, { amount: +1, say: '+1 ember' }, { damage: +2 }, { cooldownMul: 0.9 },
      { duration: +0.8 }, { damage: +3 }, { amount: +1, say: '+1 ember' }, { cooldownMul: 0.88 },
      { damage: +3 }, { amount: +1, damage: +4, say: '+1 ember' }
    ],
    evolution: { into: 'fire_blast', needPassive: 'charcoal' },
  },
  {
    id: 'will_o_wisp', name: 'Will-o-Wisp', type: 'fire',
    archetype: 'swarm',
    anim: { seq: 'fx_eos_wisporb', fps: 14, scale: 0.7 },
    card: { seq: 'fx_eos_wisporb', frame: 5, scale: 2.4, tint: true },
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
      { damage: +11 }, { amount: +2, damage: +14 }
    ],
  },
  {
    id: 'heat_wave', name: 'Heat Wave', type: 'fire',
    archetype: 'nova',
    zoneAnim: { seq: 'fx_eos_firering', fps: 18, alpha: 0.8 },
    card: { seq: 'fx_eos_firering', frame: 2, scale: 0.9, tint: true },
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
      { damage: +24 }, { areaMul: 1.25, damage: +31 }
    ],
  },
  {
    id: 'eruption', name: 'Eruption', type: 'fire',
    archetype: 'volcano',
    desc: 'A volcano bursts up at your feet and spews lava bombs every way -- more of them, and harder, the healthier you are.',
    behavior: 'eruption', aim: 'nearest', motion: 'anchor',
    sprite: 'proj_mine', palette: 'fire',
    card: { seq: 'fx_eos_column', frame: 20, scale: 0.42, tint: true },
    damage: 24, cooldown: 3.6, amount: 3, speed: 0, area: 1, pierce: 0, duration: 1,
    r: 6, range: 200, spread: 0, knockback: 50, usesAmount: true,
    spew: 1.2, hpBombs: 4,
    levels: [
      {}, { damage: +8 }, { amount: +1, say: '+1 lava bomb' }, { cooldownMul: 0.9 },
      { damage: +9 }, { areaMul: 1.15 }, { cooldownMul: 0.88 }, { amount: +1, damage: +10, say: '+1 lava bomb' },
      { damage: +12 }, { amount: +1, damage: +14, say: '+1 lava bomb' }
    ],
  },
  {
    id: 'meteor_fall', name: 'Meteor Fall', type: 'fire',
    archetype: 'bloom',
    anim: { seq: 'fx_eos_meteor', fps: 14, scale: 0.8 },
    hitAnim: { seq: 'fx_eos_boom', dur: 0.35, fps: 18, scale: 0.7 },
    card: { seq: 'fx_eos_meteor', frame: 3, scale: 1.4, tint: true },
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
      { damage: +46 }, { amount: +1, damage: +58 }
    ],
  },
  {
    id: 'blaze_trail', name: 'Blaze Trail', type: 'fire',
    archetype: 'trail',
    zoneAnim: { seq: 'fx_eos_smallflame', fps: 14, n: 3, scale: 0.55, bottom: true, alpha: 0.9 },
    card: { seq: 'fx_eos_smallflame', frame: 5, scale: 1.4, tint: true },
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
      { damage: +16 }, { areaMul: 1.25, damage: +20 }
    ],
  },

  // =========================================================================
  // ICE -- slow first, damage second. It takes the crowd's speed away
  // =========================================================================
  {
    id: 'powder_snow', name: 'Powder Snow', owner: 'delibird', type: 'ice',
    archetype: 'cone',
    anim: { seq: 'fx_eos_snow', fps: 14, scale: 0.5 },
    card: { seq: 'fx_eos_snow', frame: 4, scale: 2, tint: true },
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
      { damage: +9 }, { amount: +3, damage: +12 }
    ],
  },
  {
    id: 'icicle_crash', name: 'Icicle Crash', type: 'ice',
    archetype: 'split',
    anim: { seq: 'fx_eos_icicle', rot: true, rotOff: 1.5708, scale: 1.6 },
    hitAnim: { seq: 'fx_eos_icecrystal', dur: 0.3, fps: 30, scale: 0.6 },
    card: { seq: 'fx_eos_icicle', frame: 0, scale: 3.2, tint: true },
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
      { damage: +24 }, { shards: +2, damage: +31 }
    ],
  },
  {
    id: 'hail_cloud', name: 'Hail Cloud', type: 'ice',
    archetype: 'turret',
    emitAnim: { seq: 'fx_eos_icicle', rot: true, rotOff: 1.5708, scale: 1.1 },
    card: { seq: 'fx_eos_crystal', frame: 0, scale: 1.6, tint: true },
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
      { damage: +22 }, { amount: +1, damage: +27 }
    ],
  },
  {
    id: 'avalanche', name: 'Avalanche', type: 'ice',
    archetype: 'avalanche',
    desc: 'A wall of snow sweeps out past you and across the field, burying and shoving everything it meets.',
    behavior: 'avalanche', aim: 'nearest', motion: 'anchor',
    sprite: 'proj_star', palette: 'ice',
    card: { seq: 'fx_eos_snowball', frame: 6, scale: 1.4, tint: true },
    // One wall: it is a screen's width of snow already. The levels make it heavier and longer.
    damage: 24, cooldown: 3.4, amount: 1, speed: 0, area: 1, pierce: 0, duration: 1.6,
    r: 6, range: 200, spread: 0, knockback: 0, usesAmount: false,
    wallLen: 120, sweep: 150,
    levels: [
      {}, { damage: +6 }, { areaMul: 1.15 }, { cooldownMul: 0.9 },
      { damage: +7 }, { duration: +0.3 }, { cooldownMul: 0.88 }, { damage: +8, areaMul: 1.15 },
      { damage: +10 }, { damage: +12, duration: +0.3 }
    ],
  },
  {
    id: 'frost_veil', name: 'Frost Veil', type: 'ice',
    archetype: 'aura',
    anim: { seq: 'fx_eos_icering', fps: 10, scale: 0.8 },
    card: { seq: 'fx_eos_icering', frame: 4, scale: 1, tint: true },
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
      { damage: +11 }, { areaMul: 1.25, damage: +14 }
    ],
  },
  {
    id: 'frost_chain', name: 'Frost Chain', type: 'ice',
    archetype: 'chain',
    card: { seq: 'fx_eos_crystal', frame: 1, scale: 1.8, tint: true },
    desc: 'Cold that jumps from one frozen enemy to the next, hunting down the ones it has not reached.',
    behavior: 'chain', aim: 'nearest', motion: 'homing',
    sprite: 'proj_droplet', palette: 'ice',
    damage: 30, cooldown: 2.8, amount: 2, speed: 0, area: 1, pierce: 0, duration: 0.2,
    r: 5, range: 210, spread: 0, knockback: 0, usesAmount: true,
    jumps: 2, jumpRange: 120, falloff: 0.9, arcColor: '#9ad8f4',
    levels: [
      {}, { amount: +1 }, { damage: +11 }, { cooldownMul: 0.9 },
      { amount: +1 }, { damage: +14 }, { cooldownMul: 0.86 }, { amount: +2, damage: +18 },
      { damage: +24 }, { amount: +2, damage: +31 }
    ],
  },
  {
    id: 'quagmire', name: 'Quagmire', evolvedFrom: 'mud_shot', hidden: true, type: 'ground',
    archetype: 'shot',
    anim: { seq: 'fx_rs_mud', scale: 0.42 },
    hitAnim: { seq: 'fx_rs_splash', dur: 0.3, fps: 10, scale: 1.1 },
    card: { seq: 'fx_rs_mud', frame: 0, scale: 1, tint: true },
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
    id: 'star_barrage', name: 'Star Barrage', evolvedFrom: 'swift', hidden: true, type: 'normal',
    archetype: 'converge',
    card: { seq: 'fx_rs_star', frame: 0, scale: 3.8, tint: true },
    desc: 'Volley on volley of stars, splitting to converge on three foes at once from every side.',
    behavior: 'swift', aim: 'nearest', motion: 'anchor',
    sprite: 'proj_star', palette: 'normal',
    damage: 30, cooldown: 0.75, amount: 10, speed: 400, area: 1.2, pierce: 2, duration: 1,
    r: 6, range: 230, spread: 0, knockback: 10, usesAmount: true,
    targets: 3,
    levels: [{}],
  },
  {
    id: 'spirit_shackle', name: 'Spirit Shackle', evolvedFrom: 'leaf_arrow', hidden: true, type: 'ghost',
    archetype: 'shot',
    anim: { seq: 'fx_shadowarrow', rot: true, scale: 0.8 },
    card: { seq: 'fx_shadowarrow', frame: 0, scale: 1.2, tint: true },
    desc: 'Shadow arrows that tear through a whole line of foes.',
    behavior: 'projectile', aim: 'toughest', motion: 'wave',
    sprite: 'proj_leaf', palette: 'ghostly',
    damage: 95, cooldown: 1.05, amount: 3, speed: 360, area: 1.3, pierce: 9, duration: 1.8,
    r: 6, range: 380, spread: 0.20, knockback: 20, usesAmount: true,
    spin: 16, amp: 44, freq: 6, trail: 26, trailColor: '#c0b8e0', impact: 8, impactColor: '#a0f0d0',
    levels: [{}],
  },
);

WEAPONS.push(
  // =========================================================================
  // DRAGON -- Axew's line. Eight moves off dragon_moves.png, each its own delivery: none of them
  // is a projectile weapon, an aura or a line in a new colour. All eight are run by dragon.js
  // (the `rage` ... `timelock` behaviours plug into the registry at boot), which also draws them
  // from the sheet's own animations.
  // =========================================================================
  {
    id: 'dragon_rage', name: 'Dragon Rage', owner: 'axew', type: 'dragon',
    archetype: 'pillar',
    // The overload card shows the move as it looks in play (a frame of its sheet animation), not the atlas icon.
    card: { seq: 'fx_rage_ball', frame: 0, scale: 1.6, tint: true },
    desc: 'A spinning fireball that bursts into a pillar of flame. Fixed damage: armour and types do not touch it.',
    behavior: 'rage', aim: 'nearest', motion: 'anchor',
    sprite: 'orb', palette: 'dragon',
    // One fireball at a time: its pillar is a big sprite, and a fan of them would bury the screen.
    damage: 56, cooldown: 2.0, amount: 1, speed: 200, area: 1, pierce: 0, duration: 1.1,
    r: 6, range: 210, spread: 0.35, knockback: 30, usesAmount: false,
    // The pillar: its radius, and how long it stands.
    burstR: 22, burstT: 0.55,
    levels: [
      {}, { damage: +12 }, { areaMul: 1.15 }, { cooldownMul: 0.9 },
      { damage: +14 }, { areaMul: 1.15 }, { cooldownMul: 0.88 }, { areaMul: 1.2, damage: +14 },
      { damage: +18 }, { damage: +24, cooldownMul: 0.9 }
    ],
  },
  {
    id: 'dragon_pulse', name: 'Dragon Pulse', type: 'dragon',
    archetype: 'rollingThrob',
    // The overload card shows the move as it looks in play (a frame of its sheet animation), not the atlas icon.
    card: { seq: 'fx_pulse_orb', frame: 3, scale: 1.1, tint: true },
    desc: 'A slow, ringed orb that rolls through the crowd, throbbing out a shockwave every 0.3s as it goes.',
    behavior: 'pulseOrb', aim: 'nearest', motion: 'anchor',
    sprite: 'proj_vortex', palette: 'dragon',
    // One orb: a big ringed sprite. It throbs faster with the levels instead of multiplying.
    damage: 17, cooldown: 2.6, amount: 1, speed: 58, area: 1, pierce: 0, duration: 2.7,
    r: 26, range: 200, spread: 0.5, knockback: 30, usesAmount: false,
    throb: 0.3,
    levels: [
      {}, { damage: +5 }, { throbCut: 0.04, say: 'throbs faster' }, { cooldownMul: 0.9 },
      { damage: +5 }, { areaMul: 1.2 }, { throbCut: 0.04, say: 'throbs faster' }, { duration: +0.8, damage: +6 },
      { cooldownMul: 0.86 }, { damage: +8, throbCut: 0.03, say: 'throbs faster' }
    ],
  },
  {
    id: 'dragon_dance', name: 'Dragon Dance', type: 'dragon',
    archetype: 'riseDive',
    // The overload card shows the move as it looks in play (a frame of its sheet animation), not the atlas icon.
    card: { seq: 'fx_dance_ring', frame: 0, scale: 1.2, tint: true },
    desc: 'Every cast is a dance step: sparks fly up from your feet and dive onto foes -- three, plus one for every step you are into the dance. Each step leaves you faster for a few seconds.',
    behavior: 'dance', aim: 'nearest', motion: 'anchor',
    sprite: 'proj_spark', palette: 'dragon',
    // No `amount`: the dance itself makes the sparks (3 + steps), so a global +projectile has
    // nothing to add to.
    damage: 30, cooldown: 1.7, amount: 0, speed: 420, area: 1, pierce: 0, duration: 1,
    r: 18, range: 220, spread: 0, knockback: 20, usesAmount: false,
    // The speed a step gives, how long the steps last, and how many there can be. The levels grow
    // these through their own keys (dragon.js folds them), with `say` for the card.
    stepHaste: 0.06, stepT: 3, stepMax: 3,
    levels: [
      {}, { stepHaste: 0.01, say: '+1% speed per step' }, { damage: +8 }, { cooldownMul: 0.9 },
      { stepMax: 1, say: '+1 dance step (+1 spark)' }, { stepT: 1, say: 'steps last 1s longer' },
      { damage: +10 }, { areaMul: 1.25 }, { cooldownMul: 0.88 },
      { stepMax: 1, stepHaste: 0.01, say: '+1 dance step (+1 spark), +1% speed per step' }
    ],
  },
  {
    id: 'dragon_rush', name: 'Dragon Rush', type: 'dragon',
    archetype: 'carryCharge',
    // The overload card shows the move as it looks in play (a frame of its sheet animation), not the atlas icon.
    card: { seq: 'fx_rush_slash', frame: 1, scale: 0.6, tint: true },
    desc: 'One phantom crescent charges from behind you, through you and on ahead. What it strikes is pinned to its edge, carried along and slammed into the ground where it ends.',
    behavior: 'rush', aim: 'facing', motion: 'anchor',
    sprite: 'proj_blade', palette: 'dragon',
    // Always one crescent: no `amount`, and the levels make it carry more and hit harder instead.
    damage: 36, cooldown: 2.6, amount: 0, speed: 400, area: 1, pierce: 0, duration: 1,
    r: 18, range: 230, spread: 0, knockback: 120, usesAmount: false,
    // Rocks thrown off the charge (and their share of its damage), how many foes it can carry,
    // and the slam that ends it (a share of its damage).
    rocks: 3, rockDmg: 0.5, carry: 4, slamDmg: 1.6,
    levels: [
      {}, { damage: +9 }, { carry: 1, say: 'carries 1 more foe' }, { cooldownMul: 0.9 },
      { rocks: 1, say: '+1 rock thrown' }, { damage: +11 }, { slamDmg: 0.4, say: 'harder slam' },
      { reach: 40, damage: +6, say: 'charges 40px further' }, { cooldownMul: 0.88 },
      { carry: 2, damage: +14, say: 'carries 2 more foes' }
    ],
  },
  {
    id: 'dragon_claw', name: 'Dragon Claw', type: 'dragon',
    archetype: 'rake',
    // The overload card shows the move as it looks in play (drawn as it is in the field), not the atlas icon.
    card: { draw: 'rake', tint: true },
    desc: 'Three claw rakes across the nearest foe, one after another, trailing sparks. The third always lands a critical hit.',
    behavior: 'rake', aim: 'nearest', motion: 'anchor',
    sprite: 'proj_claw', palette: 'dragon',
    damage: 13, cooldown: 1.25, amount: 1, speed: 0, area: 1, pierce: 0, duration: 1,
    r: 6, range: 120, spread: 0, knockback: 40, usesAmount: true,
    // Rakes per strike, their length and the gap between them.
    rakes: 3, rakeLen: 50, rakeGap: 0.08,
    levels: [
      {}, { damage: +4 }, { amount: +1 }, { cooldownMul: 0.9 },
      { damage: +5 }, { areaMul: 1.25 }, { amount: +1 }, { damage: +6, cooldownMul: 0.9 },
      { damage: +7 }, { amount: +1, damage: +9 }
    ],
  },
  {
    id: 'twister', name: 'Twister', type: 'dragon',
    archetype: 'wanderLift',
    // The overload card shows the move as it looks in play (drawn as it is in the field), not the atlas icon.
    card: { draw: 'twister', tint: true },
    desc: 'A twister wanders the field on its own, sucking foes in, spinning them helpless in the air, then flinging them out in a heap.',
    behavior: 'twister', aim: 'nearest', motion: 'anchor',
    sprite: 'proj_cloud', palette: 'dragon',
    // One storm at a time: it is a tall sprite. The levels let it hold more aloft and last longer.
    damage: 12, cooldown: 4.4, amount: 1, speed: 46, area: 1, pierce: 0, duration: 3.6,
    r: 34, range: 200, spread: 0, knockback: 230, usesAmount: false,
    // How many it can hold aloft, and what the throw deals (a share of `damage`).
    lift: 5, throwDmg: 1.3,
    levels: [
      {}, { damage: +4 }, { areaMul: 1.15 }, { cooldownMul: 0.9 },
      { lift: 2, say: 'holds 2 more foes aloft' }, { damage: +4 }, { duration: +1.0 }, { areaMul: 1.2, damage: +4 },
      { cooldownMul: 0.86 }, { damage: +6, lift: 2, duration: +1.0, say: 'holds 2 more foes aloft' }
    ],
  },
  {
    id: 'spacial_rend', name: 'Spacial Rend', type: 'dragon',
    archetype: 'tear',
    // The overload card shows the move as it looks in play (a frame of its sheet animation), not the atlas icon.
    card: { seq: 'fx_rend_star', frame: 5, scale: 0.9, tint: true },
    desc: 'Tears space open on a foe. The tear drags the crowd in, then six crescents slash outward and snap back, cutting both ways.',
    behavior: 'rend', aim: 'nearest', motion: 'anchor',
    sprite: 'proj_star', palette: 'dragon',
    damage: 20, cooldown: 3.4, amount: 6, speed: 0, area: 1, pierce: 0, duration: 1,
    r: 9, range: 230, spread: 0, knockback: 0, usesAmount: true,
    // How far the crescents reach, and what the tear deals when it closes.
    reach: 58, tearDmg: 1.5,
    levels: [
      {}, { damage: +6 }, { amount: +2 }, { cooldownMul: 0.9 },
      { damage: +7 }, { areaMul: 1.2 }, { amount: +2 }, { damage: +8, cooldownMul: 0.9 },
      { damage: +9 }, { amount: +2, damage: +12 }
    ],
  },
  {
    id: 'roar_of_time', name: 'Roar of Time', type: 'dragon',
    archetype: 'timeStop',
    // The overload card shows the move as it looks in play (a frame of its sheet animation), not the atlas icon.
    card: { seq: 'fx_roar', frame: 3, scale: 0.65, tint: true },
    desc: 'Stops time inside a ring of gears. Foes caught in it freeze, and everything they take is stored and released at once, half again as hard.',
    behavior: 'timelock', aim: 'nearest', motion: 'anchor',
    sprite: 'proj_ring', palette: 'dragon',
    damage: 11, cooldown: 5.6, amount: 1, speed: 0, area: 1, pierce: 0, duration: 2.2,
    r: 52, range: 190, spread: 0, knockback: 90, usesAmount: false,
    // The ring's own ticks (banked, not dealt) and the share of the rest that is paid again.
    tick: 0.4, release: 1.5, echo: 0.5,
    levels: [
      {}, { damage: +4 }, { areaMul: 1.15 }, { cooldownMul: 0.9 },
      { damage: +4 }, { duration: +0.6 }, { areaMul: 1.15 }, { damage: +5, cooldownMul: 0.9 },
      { damage: +6 }, { areaMul: 1.2, damage: +8 }
    ],
  },
);

// =============================================================================================
// EIGHT MORE EVOLUTIONS -- one for every type that had none.
//
// Only three of 66 weapons could evolve, all of them Wooper's, Eevee's and Rowlet's starters.
// Vulpix, Delibird and Gastly's own weapons could not, and eight of the eleven types had no
// evolution at all. Each of these pairs one weapon of a type with a held item of that type.
//
// An evolved weapon restarts at level 1 on its OWN numbers, so if those numbers were written by
// hand it would be easy to ship an evolution weaker than the level-10 weapon it replaces. Instead
// each one starts from its base folded all the way to level 10, and the evolution is layered on
// top of that -- so evolving can only ever be an upgrade.
// =============================================================================================

/** A weapon definition with every one of its level grants already applied. */
function maxed(base) {
  const o = { ...base };
  for (let i = 1; i < base.levels.length; i++) {
    const lv = base.levels[i];
    if (!lv) continue;
    for (const k of ['damage', 'amount', 'pierce', 'shards', 'bounces', 'jumps', 'duration']) {
      if (lv[k]) o[k] = (o[k] || 0) + lv[k];
    }
    if (lv.cooldownMul) o.cooldown *= lv.cooldownMul;
    if (lv.areaMul) o.area *= lv.areaMul;
  }
  return o;
}

/**
 * [base weapon, held item that evolves it, what it becomes].
 *
 * `boost` is the damage multiplier over the maxed base; everything else in the entry replaces
 * or adds to the base's fields. Each evolution changes the weapon's SIGNATURE rather than only
 * its numbers -- more bounces for a bouncer, more jumps for a chain -- so it plays differently.
 */
const MORE_EVOLUTIONS = [
  ['ember', 'charcoal', {
    id: 'fire_blast', name: 'Fire Blast', boost: 1.35,
    desc: 'Each ember lands as the five-pointed star of Fire Blast: a burst of flame and five fires at once.',
    add: { amount: 1 },
    set: { blast: true, archetype: 'kindle', card: { seq: 'fx_eos_fireburst', frame: 6, scale: 0.9, tint: true } },
  }],
  ['powder_snow', 'never_melt_ice', {
    id: 'sheer_cold', name: 'Sheer Cold', boost: 1.35,
    desc: 'A freezing gale that reaches twice as far and leaves the crowd barely moving.',
    // Reach and travel together: a longer aim with the same flight fires shots that die short.
    add: { amount: 3 }, mul: { range: 1.4, duration: 1.45 },
    set: { slow: 0.6, trailColor: '#ffffff', impactColor: '#ffffff',
      archetype: 'cone', anim: { seq: 'fx_eos_shards', fps: 16, scale: 0.5 }, card: { seq: 'fx_eos_shards', frame: 8, scale: 1.4, tint: true } },
  }],
  ['sludge_bomb', 'poison_barb', {
    id: 'gunk_shot', name: 'Gunk Shot', boost: 1.4,
    desc: 'Heavy globs that burst wide and leave a pool of poison where they land.',
    add: { amount: 2 }, mul: { blastRadius: 1.5 },
    set: { zoneOnEnd: { r: 46, life: 3.6, dps: 24, slow: 0.45, color: '#d070f0' }, impactColor: '#ffd0ff',
      archetype: 'mine', anim: { seq: 'fx_eos_gunk', fps: 10, scale: 0.7 }, card: { seq: 'fx_eos_gunk', frame: 1, scale: 2.2, tint: true } },
  }],
  ['bubble', 'sea_incense', {
    id: 'hydro_cannon', name: 'Hydro Cannon', boost: 1.35,
    desc: 'Great bubbles of heavy water, each holding two foes, that burst like a cannon shot.',
    add: { carry: 2, hold: 0.8 }, mul: { r: 1.35 },
    set: { archetype: 'engulf', card: { seq: 'fx_rs_bubble', frame: 0, scale: 2.6, tint: true } },
  }],
  ['spark_chain', 'magnet_item', {
    id: 'thunder_storm', name: 'Thunder', boost: 1.35,
    desc: 'Lightning that jumps further, loses nothing as it goes, and never runs out of targets.',
    add: { jumps: 3 }, mul: { jumpRange: 1.45 },
    set: { falloff: 0.97, arcColor: '#ffffff', archetype: 'chain', card: { seq: 'fx_ybolt', frame: 0, scale: 0.9, tint: true } },
  }],
  ['foul_play', 'black_glasses', {
    id: 'night_slash', name: 'Night Slash', boost: 1.3,
    desc: 'Two crescent blades that ricochet through the crowd and grow crueller with every bounce.',
    add: { amount: 1, bounces: 3 },
    set: { bounceGain: 0.6, trailColor: '#8060c0', impactColor: '#f0e0ff',
      archetype: 'bouncer', anim: { seq: 'fx_eos_crescent', fps: 16, rot: true, scale: 0.4, tint: ['#2a1a40', '#6a4aa0', '#d0b0ff'] },
      card: { seq: 'fx_eos_crescent', frame: 1, scale: 1, tint: true } },
  }],
  ['drill_peck', 'pretty_wing', {
    id: 'sky_attack', name: 'Sky Attack', boost: 1.35,
    desc: 'The drill climbs into the sky glowing, then dives on the toughest foe, boring through and making all it hits flinch.',
    add: { speed: 60 },
    set: { sky: true, deeper: 0.2, drag: 0.9, archetype: 'drill', card: { seq: 'fx_wings', frame: 0, scale: 1.1, tint: true } },
  }],
  ['shadow_ball', 'spell_tag', {
    id: 'shadow_storm', name: 'Shadow Storm', boost: 1.35,
    desc: 'A knot of shadow that bursts into a swarm the moment it touches anything.',
    add: { shards: 4 }, mul: { area: 1.3, r: 1.3 },
    set: { trailColor: '#b0a0f0', impactColor: '#ffffff',
      archetype: 'split', anim: { seq: 'fx_eos_shadowsphere', fps: 16, scale: 0.8 }, card: { seq: 'fx_eos_shadowsphere', frame: 6, scale: 2.2, tint: true } },
  }],
];

for (const [fromId, item, ev] of MORE_EVOLUTIONS) {
  const base = WEAPONS.find((w) => w.id === fromId);
  if (!base) throw new Error(`weapons: evolution source "${fromId}" does not exist`);
  const m = maxed(base);
  const out = {
    ...m,
    id: ev.id, name: ev.name, desc: ev.desc,
    evolvedFrom: fromId, hidden: true,
    damage: Math.round(m.damage * ev.boost),
    levels: [{}],
  };
  // An evolved weapon is no one's starter and cannot evolve again.
  delete out.owner;
  delete out.evolution;
  for (const [k, v] of Object.entries(ev.add || {})) out[k] = (out[k] || 0) + v;
  for (const [k, v] of Object.entries(ev.mul || {})) out[k] = (out[k] || 0) * v;
  Object.assign(out, ev.set || {});
  WEAPONS.push(out);
  base.evolution = { into: ev.id, needPassive: item };
}

// =============================================================================================
// SUBSTITUTE -- the one weapon every Pokemon can draft.
//
// It has no type on purpose (`universal` says so, and silences the untyped-weapon warning), and it
// deals no damage at all: it puts a doll on the field that the crowd goes for instead of you. The
// doll's health is a third of yours when it appears; `amount` is how many may stand at once, and
// a destroyed doll is replaced a full cooldown later, never instantly. See BEHAVIOR.decoy.
// =============================================================================================

WEAPONS.push({
  id: 'substitute', name: 'Substitute', universal: true,
  // The overload card shows the move as it looks in play (a frame of its sheet animation), not the atlas icon.
  card: { seq: 'substitute', frame: 0, scale: 2 },
  desc: 'Leaves a doll of yourself behind. Anything nearer to it than to you goes for the doll.',
  behavior: 'decoy', aim: 'facing', motion: 'anchor',
  sprite: 'proj_ring', palette: 'normal',
  damage: 0, cooldown: 8.0, amount: 1, speed: 0, area: 1, pierce: 0, duration: 1,
  r: 9, range: 0, spread: 0, knockback: 0, usesAmount: false,
  amountWord: 'substitute',
  // How far from you a doll is set down.
  placeDist: 34,
  levels: [
    {}, { cooldownMul: 0.92 }, { cooldownMul: 0.92 }, { cooldownMul: 0.9 },
    { amount: +1 }, { cooldownMul: 0.9 }, { cooldownMul: 0.9 }, { cooldownMul: 0.88 },
    { amount: +1 }, { cooldownMul: 0.85 }
  ],
});

export const WEAPON_BY_ID = Object.fromEntries(WEAPONS.map((w) => [w.id, w]));

/** Every type that has weapons, in the order they appear. Used by the pokedex and the tests. */
export const WEAPON_TYPES = [...new Set(WEAPONS.filter((w) => !w.hidden && w.type).map((w) => w.type))];

/** The draftable weapons of one type. */
export const weaponsOfType = (type) => WEAPONS.filter((w) => !w.hidden && w.type === type);

/** (shape, palette, rotations) triples the weapon set needs registered in the atlas. */
export function weaponSpritePairs() {
  const seen = new Set();
  const out = [];
  // Anything that must point where it flies gets baked rotations instead of a left/right flip.
  const ROTATED = new Set([
    'proj_leaf', 'proj_bone', 'proj_rock', 'proj_fang', 'proj_shard', 'proj_feather',
    'proj_quill', 'proj_thorn', 'proj_claw', 'proj_blade', 'proj_fist', 'proj_boulder', 'proj_toxic_spike',
  ]);
  const add = (sprite, palette, fallback) => {
    const key = `${sprite}:${palette}`;
    if (seen.has(key)) return;
    seen.add(key);
    out.push([sprite, palette, ROTATED.has(sprite) ? 16 : 0, fallback || null]);
  };
  for (const w of WEAPONS) {
    add(w.sprite, w.palette, w.spriteFallback);
    if (w.spriteAlt) add(w.spriteAlt, w.palette, w.spriteFallback);
    if (w.emitSprite) add(w.emitSprite, w.emitPalette || w.palette);
  }
  return out;
}
