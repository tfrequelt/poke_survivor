// L0 -- pure data. Weapon Overloads.
//
// A weapon at its last level offers its three overloads on the next level-up; one is taken and
// stays for the run. They are AMPLIFY (the weapon's identity pushed further), TRANSFORM (a new
// shape or function) and WILD (an elemental, status or summon twist). An evolved weapon has its
// own three; one that was overloaded before evolving keeps the overload it had.
//
// Every key below is read by weapons.js (how the weapon fires) or overload.js (what its hits,
// kills and expiring shots do). It is a closed vocabulary -- a key not listed here does nothing.
//
//   id, tag, name, color, desc     identity. `color` tints the glow, chips, arcs and pools.
//   chips                          optional: the card's keyword row (otherwise worked out).
//
//   stats      multipliers: damage, cooldown, area, speed, duration, range, knockback
//              additions:   amount, pierce, bounces, shards, jumps
//   pattern    aimed behaviours only (projectile, cone, bouncer, charge, split, bloom):
//              'ring' all round | 'twin' front and back | 'cross' four ways | 'fan' wider |
//              'spiral' a ring that turns each pull | 'volley' the pull repeats (`volley`: total)
//   size       shots are this much bigger, hitbox and sprite
//   grow       shots widen by this share of their size per second
//   homing     turn rate: a straight or accelerating shot steers after its target
//
//   hit        every hit: burn (share of damage per second, burnT, toxic), slow + slowT,
//              stun {chance, t}, sleep {chance, t} (a stun that also looks and acts like sleep),
//              weaken (s), mark {mul, t} (+mul damage taken), confuse (s),
//              knock / pull (impulse), execute (HP share), leech {chance, hp},
//              shatter (bonus share vs slowed or stunned), vsBurn (bonus share vs burning),
//              splash {r, dmg, chance}, chain {chance, n, dmg, range}
//   kill       the killing blow: explode {r, dmg}, shards {n, dmg}, wisps {n, dmg} (homing),
//              zone {...}, chain {n, dmg}, heal {chance, hp}
//   expire     when a shot ends (lands, is spent, or runs out): blast {r, dmg}, zone {...},
//              split {n, dmg, homing}; `chance` makes it occasional
//   every      every `n` successful pulls: nova {r, dmg, slow, burn, knock, color},
//              strike {n, dmg, r, stun, burn, kind:'bolt'|'meteor', color}, burst {n, dmg, homing},
//              vortex {r, life, pull, dmg, boom}
//   zone       for zone-laying behaviours (trail, nova, pull): r, life, pull, slow, burn, boom
//              (damage share dealt across the zone as it closes), knock (a nova front's shove)
//   orbit      r, spin (multipliers), pulse (the ring breathes by this share), pulseFreq
//   turret     barrels, gap (s), dmg, range, speed, life     emit: the same keys, for companions
//   link       { targets }: extra enemies a tether or link reaches
//   chainFork  extra chains a chain weapon runs at once
//   sweepFull  the swing goes all the way round
//   decoy      Substitute: hp (multiplier), explode {r, dmg}, taunt {r, dps, slow}, heal (max HP
//              share on its fall), shoot {gap, dmg}
//   signature  the one mechanic the overload is built around (a key below, or a pattern / zone /
//              proc name). tools/checkoverloads.mjs keeps every weapon's three different and no
//              signature over nine uses. `colors` is its palette: [main, trail, accent].
//
//   Signatures -- how shots fly (shooting weapons only):
//   boomerang  {dmg}  returns to you after half its life, re-hitting on the way
//   orbitOut   {t, r, dmg}  a spent shot circles you for t seconds instead of vanishing
//   ricochet   {n}  re-aims at the nearest foe it has not hit, n times
//   erase      {n}  destroys up to n enemy projectiles it touches
//   accel      {max}  speeds up, and hits up to (1 + max) times harder by the end of its life
//   snowball   {grow, dmg, max}  bigger and stronger for every foe it pierces
//   wake       {every, r, life, dps, slow, burn, color}  lays a line of ground behind it
//   mine       {r, dmg, life, chance}  a spent shot stays as an armed mine
//   gravity    {r, pull}  drags nearby foes along with it
//   magnet     {r}  pulls XP orbs and coins it passes to you (zones: within r of the zone)
//   echo       {delay, dmg}  every pull repeats from where you stood, `delay` later
//   Signatures -- what hits and kills do:
//   stacks     {n, dmg, r}  every hit adds a stack; the n-th ruptures for dmg in r
//   doom       {t, dmg, r}  the first hit plants a countdown that detonates (or on death)
//   contagion  {r, n}  a dying foe's burns, chills, marks and confusion jump to n neighbours
//   bond       {share, max}  hit foes are bonded; each feels `share` of what any takes
//   charm      {chance, t, dmg}  the foe fights for you for t seconds, biting at dmg x
//   polarity   {dmg, r}  pulls alternate + / -; a foe hit by both within 2s discharges
//   overkill   {share, range}  damage past a kill jumps to the nearest foe
//   freezeAfter {n, t, shards}  the n-th chill freezes solid; dying frozen, it shatters
//   thief      {chance}  hits knock coins loose
//   critBurst  {n, dmg}  a critical hit bursts into n shots
//   Signatures -- the weapon's own state (a bar bottom right of the HUD for most):
//   heat       {max, dmg, n, vent}  the max-th pull is an overheat volley, then it vents
//   tide       {period, flowCd/Area/Dmg, ebbCd/Area/Dmg}  alternating fast and huge phases
//   momentum / stillness  {max, rise, cd}  stronger while moving / while standing still
//   pinch      {at, dmg, cd}  below `at` of your health: harder and faster
//   soul       {per, max}  every kill feeds it `per` more damage for the run, up to max
//   guard      {kills}  every `kills` kills gives you a one-hit shield
//   haste      {t, mul}  kills give t seconds of faster movement
//   warp       {r, t, slow, chance}  kills leave a time bubble: foes slowed, enemy shots crawl
//   rod        {every, dmg, n}  a bolt on the n toughest foes nearby every few seconds
//   metronome  true  every pull rolls a random hit effect (overload.js METRO)
//   gamble     {twice, five}  a pull may go off twice, or five times
//
//   fx         { trail: colour, particles: OVL_PARTICLES key, impact: colour,
//                spr: { trail, hit, kill, proc } -- data/sprfx.js effects (Gravity Circuit),
//                cycle: [colours] -- the glow, trail, particles, arcs and ground fade through
//                these in a loop, cycleSecs (one whole loop; default 0.9s a colour) }
//
// A zone `{...}` is { r, life, dps, slow, burn, vortex (pull), boom, color, dark }, with damage
// as shares of the weapon's current damage.
//
// Damage shares are always of the weapon's own resolved damage, so an overload scales with the
// run the same way the weapon does.

/** What the particles an overloaded shot sheds look like. Colours, drift, spread, gravity. */
export const OVL_PARTICLES = {
  embers:  { colors: ['#ffb347', '#ff7a1a', '#ffd870'], vy: -26, spread: 22, grav: -18, life: 0.5, size: 1 },
  bubbles: { colors: ['#bfe9ff', '#e8f8ff', '#7ac8ff'], vy: -16, spread: 14, grav: -10, life: 0.6, size: 1 },
  sparks:  { colors: ['#fff6a0', '#f8e038', '#ffffff'], vy: 0, spread: 90, grav: 0, life: 0.22, size: 1 },
  leaves:  { colors: ['#7fe08a', '#4aa32c', '#c4f29a'], vy: 8, spread: 30, grav: 22, life: 0.7, size: 1 },
  snow:    { colors: ['#ffffff', '#dff6ff', '#9ad8f4'], vy: 10, spread: 18, grav: 8, life: 0.9, size: 1 },
  smoke:   { colors: ['#8a8a96', '#b0b0bc', '#5a5a66'], vy: -12, spread: 14, grav: -6, life: 0.8, size: 2 },
  stars:   { colors: ['#ffffff', '#ffe9a0', '#ffd166'], vy: 0, spread: 40, grav: 0, life: 0.35, size: 1 },
  petals:  { colors: ['#ff9ad8', '#ffc8e8', '#ff6bb0'], vy: 8, spread: 34, grav: 14, life: 0.8, size: 1 },
  toxic:   { colors: ['#c070e0', '#e8b0f8', '#7fe08a'], vy: -10, spread: 20, grav: -8, life: 0.6, size: 1 },
  shadows: { colors: ['#4a3a66', '#2a2038', '#8a72b8'], vy: -14, spread: 18, grav: -10, life: 0.6, size: 2 },
  sand:    { colors: ['#d8c48a', '#c49a5e', '#f0e0b0'], vy: 6, spread: 30, grav: 30, life: 0.5, size: 1 },
  mud:     { colors: ['#9a6c36', '#6a4a26', '#c08040'], vy: 4, spread: 26, grav: 40, life: 0.5, size: 1 },
  spirit:  { colors: ['#9af0d8', '#c8bcf0', '#ffffff'], vy: -18, spread: 20, grav: -12, life: 0.7, size: 1 },
  frost:   { colors: ['#9ad8f4', '#eaffff', '#4a9fd0'], vy: -4, spread: 26, grav: 4, life: 0.6, size: 1 },
  rock:    { colors: ['#c8c0ad', '#8a8070', '#e4dccc'], vy: 2, spread: 28, grav: 46, life: 0.45, size: 1 },
  wind:    { colors: ['#f0f6ff', '#b8cde0', '#ffffff'], vy: 0, spread: 50, grav: 0, life: 0.3, size: 1 },
};

const A = 'AMPLIFY', T = 'TRANSFORM', W = 'WILD';

export const OVERLOADS = {
  // ============================================================================================
  // WATER AND GROUND
  // ============================================================================================
  mud_shot: [
    { id: 'mud_minefield', tag: A, name: 'Mud Minefield', color: '#c08040', colors: ['#c08040', '#8a5a2a', '#ffd8a0'], signature: 'mine',
      desc: 'Every glob that lands half-buries itself as a mud mine for 6s. Anything that steps on one is blown off its feet for 140% damage.',
      mine: { r: 28, dmg: 1.4, life: 6, chance: 1 },
      fx: { trail: '#a06830', particles: 'mud', spr: { trail: 'land_dust', hit: 'dust', kill: 'slide_dust', proc: 'boom' } } },
    { id: 'mud_bomb_ring', tag: T, name: 'Mud Bomb Ring', color: '#b07038', colors: ['#b07038', '#d8a868', '#fff0c0'], signature: 'ring',
      desc: 'Hurls mud in every direction at once. Each glob bursts where it lands, splashing 70% of its damage across a wide area.',
      pattern: 'ring', stats: { damage: 0.9 }, expire: { blast: { r: 34, dmg: 0.7 } },
      fx: { trail: '#c08040', particles: 'mud', spr: { trail: 'dust', hit: 'land_dust', kill: 'boom_s', proc: 'boom' } } },
    { id: 'quicksand', tag: W, name: 'Quicksand', color: '#d8a868', colors: ['#d8a868', '#a07840', '#fff6c8'], signature: 'gravity',
      desc: 'Globs drag the ground with them: every foe within 34px of one in flight is pulled along in its wake, into a pile where it lands.',
      gravity: { r: 34, pull: 110 }, hit: { slow: 0.4, slowT: 1.5 },
      fx: { trail: '#d8a868', particles: 'sand', spr: { trail: 'slide_dust', hit: 'dust', kill: 'land_dust', proc: 'ring_m' } } },
  ],
  bubble_beam: [
    { id: 'bubble_storm', tag: A, name: 'Bubble Storm', color: '#7ac8ff', colors: ['#7ac8ff', '#bfe9ff', '#ffffff'], signature: 'erase',
      desc: 'Bubbles pop enemy shots out of the air: each one erases up to 2 hostile projectiles it touches. A spiral of shields.',
      erase: { n: 2 }, stats: { damage: 1.15 },
      fx: { trail: '#9adcff', particles: 'bubbles', spr: { trail: 'gibs', hit: 'ring_s', kill: 'flash_burst', proc: 'ring_m' } } },
    { id: 'aqua_ring', tag: T, name: 'Aqua Ring', color: '#5ab6ef', colors: ['#5ab6ef', '#7af0e8', '#ffffff'], signature: 'orbitOut',
      desc: 'Spent bubbles do not pop: they drift back and circle you for 3s, a ring of water that keeps hitting at 60%.',
      orbitOut: { t: 3, r: 32, dmg: 0.6 },
      fx: { cycle: ['#5ab6ef', '#7af0e8', '#ffffff'], trail: '#9adcff', particles: 'bubbles', spr: { trail: 'oval', hit: 'ring_s', kill: 'ring_m', proc: 'ring_l' } } },
    { id: 'soak', tag: W, name: 'Soak', color: '#3a8fd0', colors: ['#3a8fd0', '#9adcff', '#ffffff'], signature: 'stacks',
      desc: 'Bubbles soak what they hit. The 5th soaking hit on one foe makes it burst like a water balloon: 65% damage around it.',
      stacks: { n: 5, dmg: 0.65, r: 28 },
      fx: { trail: '#9adcff', particles: 'bubbles', spr: { trail: 'gibs', hit: 'ring_s', kill: 'flash_burst', proc: 'beam_boom' } } },
  ],
  tidal_surge: [
    { id: 'tsunami_wall', tag: A, name: 'Tsunami Wall', color: '#2276bd', colors: ['#2276bd', '#5ab6ef', '#eaffff'], signature: 'tide',
      desc: 'The sea breathes. Every 4s the tide turns: FLOW sends quick, low surges (45% faster); EBB rolls out rare walls of water 70% wider and 70% harder.',
      tide: { period: 4 },
      fx: { trail: '#5ab6ef', particles: 'bubbles', spr: { hit: 'ring_s', kill: 'flash_burst', proc: 'ring_l' } } },
    { id: 'riptide', tag: T, name: 'Riptide', color: '#1a5fa0', colors: ['#1a5fa0', '#3a8fd0', '#9adcff'], signature: 'pull',
      desc: 'The surge runs backwards: its front sucks everything in toward you instead of throwing it out, then breaks at your feet.',
      zone: { knock: -160, r: 1.15 }, hit: { slow: 0.35, slowT: 1 },
      fx: { trail: '#3a8fd0', particles: 'bubbles', spr: { hit: 'gibs', kill: 'ring_m', proc: 'ring_l' } } },
    { id: 'undertow', tag: W, name: 'Undertow', color: '#0f4c80', colors: ['#0f4c80', '#2276bd', '#7af0e8'], signature: 'freezeAfter',
      desc: 'Cold deep water. A foe caught by three surges in a row is frozen solid for 2s, and shatters into 6 ice shards if it dies frozen.',
      hit: { slow: 0.4, slowT: 2 }, freezeAfter: { n: 3, t: 2, shards: 6 },
      fx: { trail: '#7af0e8', particles: 'frost', spr: { hit: 'freeze_s', kill: 'freeze', proc: 'ring_l' } } },
  ],
  whirlpool: [
    { id: 'maelstrom', tag: A, name: 'Maelstrom', color: '#2a9fd8', colors: ['#2a9fd8', '#5ab6ef', '#ffffff'], signature: 'magnetZone',
      desc: 'A whirlpool so strong it swallows the loot too: it drags foes in 60% harder, and every XP orb and coin near it is flung to you.',
      zone: { pull: 1.6, r: 1.15 }, magnet: { r: 60 },
      fx: { cycle: ['#2a9fd8', '#7af0e8', '#ffffff'], trail: '#5ab6ef', particles: 'bubbles', spr: { hit: 'ring_s', kill: 'gibs', proc: 'ring_l' } } },
    { id: 'vortex_collapse', tag: T, name: 'Vortex Collapse', color: '#1060a0', colors: ['#1060a0', '#3a8fd0', '#eaffff'], signature: 'collapse',
      desc: 'The whirlpool collapses at its end, crushing everything still inside for 220% of its damage in one blow.',
      zone: { boom: 2.2, life: 0.8 },
      fx: { trail: '#3a8fd0', particles: 'bubbles', spr: { hit: 'gibs', kill: 'flash_burst', proc: 'beam_boom' } } },
    { id: 'hydro_prison', tag: W, name: 'Hydro Prison', color: '#4ab0e0', colors: ['#4ab0e0', '#9adcff', '#ffffff'], signature: 'bond',
      desc: 'Everything the whirlpool holds is bound in one prison of water: 35% of the damage any of them takes is felt by all the others (up to 6).',
      bond: { share: 0.35, max: 6 },
      fx: { trail: '#9adcff', particles: 'bubbles', spr: { hit: 'ring_s', kill: 'guard_ring', proc: 'ring_m' } } },
  ],
  aqua_jet: [
    { id: 'hydro_lance', tag: A, name: 'Hydro Lance', color: '#3a8fd0', colors: ['#3a8fd0', '#9adcff', '#ffffff'], signature: 'accel',
      desc: 'The jet keeps accelerating. Every shot gains speed in flight and hits up to 160% harder at the end of its range than at the start.',
      accel: { max: 1.6 },
      fx: { trail: '#9adcff', particles: 'bubbles', spr: { trail: 'streak', hit: 'ring_s', kill: 'flash_burst', proc: 'ring_m' } } },
    { id: 'geyser_fan', tag: T, name: 'Geyser Fan', color: '#5ab6ef', colors: ['#5ab6ef', '#bfe9ff', '#ffffff'], signature: 'momentum',
      desc: 'Pressure builds while you run. Keep moving and the release grows up to 90% stronger; stand still and it drains away.',
      momentum: { max: 0.9, rise: 0.45 }, pattern: 'fan',
      fx: { trail: '#9adcff', particles: 'bubbles', spr: { trail: 'gibs', hit: 'ring_s', kill: 'ring_m', proc: 'ring_l' } } },
    { id: 'pressure_shock', tag: W, name: 'Pressure Shock', color: '#2a6aa0', colors: ['#2a6aa0', '#5ab6ef', '#f8e038'], signature: 'overkill',
      desc: 'Water under pressure goes somewhere. Damage beyond a kill bursts on into the nearest foe within 110px, all of it.',
      overkill: { share: 1, range: 110 },
      fx: { trail: '#5ab6ef', particles: 'sparks', spr: { trail: 'streak', hit: 'spark_s', kill: 'spark_line', proc: 'ring_m' } } },
  ],
  rain_dance: [
    { id: 'downpour', tag: A, name: 'Downpour', color: '#4a90d0', colors: ['#4a90d0', '#9adcff', '#ffffff'], signature: 'gamble',
      desc: 'The weather is fickle: each cloudburst has a 25% chance to fall twice, and a 4% chance to come down five times in a row.',
      gamble: { twice: 0.25, five: 0.04 },
      fx: { trail: '#9adcff', particles: 'bubbles', spr: { hit: 'gibs', kill: 'ring_s', proc: 'flash_burst' } } },
    { id: 'thunderstorm', tag: T, name: 'Thunderstorm', color: '#f8e038', colors: ['#f8e038', '#4a90d0', '#ffffff'], signature: 'rod',
      desc: 'A storm cell over you: every 4s lightning strikes the 2 toughest foes nearby for 120% damage, stunning them.',
      rod: { every: 4, dmg: 1.2, n: 2 },
      fx: { cycle: ['#f8e038', '#7ac8ff', '#ffffff'], trail: '#fff6a0', particles: 'sparks', spr: { hit: 'spark_s', kill: 'spark', proc: 'spark_line' } } },
    { id: 'drizzle', tag: W, name: 'Drizzle', color: '#7ac8ff', colors: ['#7ac8ff', '#bfe9ff', '#5ab6ef'], signature: 'contagion',
      desc: 'Damp spreads. When a foe soaked by the rain dies, its chill and every status on it run off into up to 4 neighbours.',
      hit: { slow: 0.3, slowT: 2.5 }, contagion: { r: 70, n: 4 },
      fx: { trail: '#bfe9ff', particles: 'bubbles', spr: { hit: 'ring_s', kill: 'motes', proc: 'ring_m' } } },
  ],
  brine_fang: [
    { id: 'sharpedo_pack', tag: A, name: 'Sharpedo Pack', color: '#3a6aa0', colors: ['#3a6aa0', '#ff6a5a', '#ffffff'], signature: 'pinch',
      desc: 'Blood in the water. Below half your health the pack goes into a frenzy: 80% more damage and 30% faster bites.',
      pinch: { at: 0.5, dmg: 1.8, cd: 0.7 }, stats: { amount: 1 },
      fx: { trail: '#9adcff', particles: 'bubbles', spr: { trail: 'gibs', hit: 'slash', kill: 'pink_flash', proc: 'punch_flash' } } },
    { id: 'water_gun_hound', tag: T, name: 'Water Gun Hound', color: '#5ab6ef', colors: ['#5ab6ef', '#bfe9ff', '#ffffff'], signature: 'emit',
      desc: 'The hound spits as it hunts: water shots every 0.5s at whatever is closest, from wherever it is.',
      emit: { gap: 0.5, dmg: 1.5 },
      stats: { damage: 1.1 },
      fx: { trail: '#9adcff', particles: 'bubbles', spr: { trail: 'oval', hit: 'ring_s', kill: 'flash_burst', proc: 'ring_m' } } },
    { id: 'brine', tag: W, name: 'Brine', color: '#2a8fb0', colors: ['#2a8fb0', '#7af0e8', '#ff6a5a'], signature: 'execute',
      desc: 'Salt in the wound: a bite on a foe under 18% health finishes it, and every such kill heals you 2.',
      hit: { execute: 0.18 }, kill: { heal: { chance: 1, hp: 2 } },
      fx: { trail: '#7af0e8', particles: 'bubbles', spr: { trail: 'gibs', hit: 'slash', kill: 'death_flash', proc: 'ring_m' } } },
  ],
  rock_orbit: [
    { id: 'stone_edge_ring', tag: A, name: 'Stone Edge Ring', color: '#c8b080', colors: ['#c8b080', '#8a8070', '#ffffff'], signature: 'erase',
      desc: 'The orbiting stones are a wall: each one shatters up to 3 enemy shots that try to get through it.',
      erase: { n: 3 }, orbit: { r: 1.1 },
      fx: { trail: '#c8c0ad', particles: 'rock', spr: { hit: 'dust', kill: 'shard', proc: 'guard_break' } } },
    { id: 'tectonic_pulse', tag: T, name: 'Tectonic Pulse', color: '#a08060', colors: ['#a08060', '#d8c48a', '#fff0c0'], signature: 'pulse',
      desc: 'The ring breathes like a fault line, swelling out to 135% of its radius and back twice a second, sweeping a far wider band.',
      orbit: { pulse: 0.35, pulseFreq: 2, spin: 0.85 },
      fx: { trail: '#d8c48a', particles: 'rock', spr: { hit: 'land_dust', kill: 'slide_dust', proc: 'boom' } } },
    { id: 'rockslide', tag: W, name: 'Rockslide', color: '#8a7058', colors: ['#8a7058', '#c8c0ad', '#ffd8a0'], signature: 'guard',
      desc: 'Stones pile up into armour: every 20 foes the ring kills gives you a rock shield that blocks the next hit completely.',
      guard: { kills: 20 },
      fx: { trail: '#c8c0ad', particles: 'rock', spr: { hit: 'dust', kill: 'land_dust', proc: 'guard_ring' } } },
  ],
  bonemerang: [
    { id: 'shadow_bone', tag: A, name: 'Shadow Bone', color: '#8a72b8', colors: ['#8a72b8', '#c8bcf0', '#ffffff'], signature: 'doom',
      desc: 'A cursed bone: the first hit plants a curse that bursts 3s later for 70% damage around the victim, whatever else happens to it.',
      doom: { t: 3, dmg: 0.7, r: 28 },
      fx: { trail: '#c8bcf0', particles: 'shadows', spr: { trail: 'dot', hit: 'oval', kill: 'death_flash', proc: 'guard_ring' } } },
    { id: 'bone_rush', tag: T, name: 'Bone Rush', color: '#e8e0c8', colors: ['#e8e0c8', '#c8b080', '#ffffff'], signature: 'echo',
      desc: 'Every throw is answered by a phantom bone from where you stood 0.35s earlier, at 60% damage: two boomerangs for one.',
      echo: { delay: 0.35, dmg: 0.6 },
      fx: { trail: '#e8e0c8', particles: 'rock', spr: { trail: 'dot', hit: 'punch_s', kill: 'flash_burst', proc: 'ring_s' } } },
    { id: 'marrow_quake', tag: W, name: 'Marrow Quake', color: '#c8a070', colors: ['#c8a070', '#8a7058', '#ffd8a0'], signature: 'snowball',
      desc: 'The bone gathers weight as it smashes through: +12% size and +15% damage for each foe it passes, up to 8 times a throw.',
      snowball: { grow: 0.12, dmg: 0.15, max: 8 },
      fx: { trail: '#c8b080', particles: 'rock', spr: { trail: 'land_dust', hit: 'dust', kill: 'slide_dust', proc: 'boom' } } },
  ],
  sand_tomb: [
    { id: 'quicksand_field', tag: A, name: 'Quicksand Field', color: '#d8c48a', colors: ['#d8c48a', '#c49a5e', '#fff0c0'], signature: 'warp',
      desc: 'Sand that swallows time: 25% of the tombs\' kills leave a 3s pocket where foes are slowed by 70% and enemy shots crawl.',
      warp: { r: 42, t: 3, slow: 0.7, chance: 0.25 },
      fx: { trail: '#d8c48a', particles: 'sand', spr: { hit: 'dust', kill: 'ring_l', proc: 'motes' } } },
    { id: 'sand_geyser', tag: T, name: 'Sand Geyser', color: '#e0b878', colors: ['#e0b878', '#f0e0b0', '#ffffff'], signature: 'split',
      desc: 'Each tomb erupts when it goes off, throwing 5 sand shards outward at 45% damage that chase down whatever is nearby.',
      expire: { split: { n: 5, dmg: 0.45, homing: true } },
      fx: { trail: '#f0e0b0', particles: 'sand', spr: { hit: 'land_dust', kill: 'slide_dust', proc: 'boom' } } },
    { id: 'sandstorm', tag: W, name: 'Sandstorm', color: '#c49a5e', colors: ['#c49a5e', '#d8c48a', '#ff9a40'], signature: 'thief',
      desc: 'The storm strips your foes bare: every hit has a 7% chance to knock coins loose from it.',
      thief: { chance: 0.07 }, hit: { weaken: 2 },
      fx: { trail: '#d8c48a', particles: 'sand', spr: { hit: 'dust', kill: 'star3', proc: 'shine' } } },
  ],
  bulldoze: [
    { id: 'earthquake_swing', tag: A, name: 'Earthquake Swing', color: '#a07848', colors: ['#a07848', '#d8a868', '#fff0c0'], signature: 'heat',
      desc: 'Each swing builds up the fault. The 7th releases an EARTHQUAKE: 14 shockwave shots all round and a 300% blast at your feet, then 1.2s to recover.',
      heat: { max: 7, dmg: 3, n: 14, vent: 1.2 },
      fx: { trail: '#d8a868', particles: 'rock', spr: { hit: 'dust', kill: 'land_dust', proc: 'beam_boom' } } },
    { id: 'high_horsepower', tag: T, name: 'High Horsepower', color: '#c88050', colors: ['#c88050', '#ffd8a0', '#ffffff'], signature: 'sweepFull',
      desc: 'The swing goes all the way round you, and every foe it connects with is thrown back hard.',
      sweepFull: true, stats: { knockback: 1.6 },
      fx: { trail: '#ffd8a0', particles: 'sand', spr: { hit: 'punch_s', kill: 'slide_dust', proc: 'ring_l' } } },
    { id: 'fissure', tag: W, name: 'Fissure', color: '#7a5a3a', colors: ['#7a5a3a', '#c08040', '#ff9040'], signature: 'executeChain',
      desc: 'The ground opens: anything under 15% health is swallowed whole, and each one swallowed cracks on into 2 more foes for 80% damage.',
      hit: { execute: 0.15 }, kill: { chain: { n: 2, dmg: 0.8, range: 90 } },
      fx: { trail: '#c08040', particles: 'mud', spr: { hit: 'dust', kill: 'boom_fire', proc: 'slash' } } },
  ],
  magnitude: [
    { id: 'magnitude_ten', tag: A, name: 'Magnitude 10', color: '#d89850', colors: ['#d89850', '#ffd8a0', '#ffffff'], signature: 'gamble',
      desc: 'Magnitude is a dice roll: a 25% chance the quake hits twice, and a 4% chance of a magnitude-10 run of five back to back.',
      gamble: { twice: 0.25, five: 0.05 },
      fx: { trail: '#ffd8a0', particles: 'rock', spr: { hit: 'land_dust', kill: 'slide_dust', proc: 'beam_boom' } } },
    { id: 'aftershock', tag: T, name: 'Aftershock', color: '#b08050', colors: ['#b08050', '#d8c48a', '#fff0c0'], signature: 'echo',
      desc: 'Every quake has an aftershock: the same tremor goes off again 0.5s later where you stood, at 70% strength.',
      echo: { delay: 0.5, dmg: 0.7 },
      fx: { trail: '#d8c48a', particles: 'rock', spr: { hit: 'dust', kill: 'land_dust', proc: 'ring_l' } } },
    { id: 'seismic_toss', tag: W, name: 'Seismic Toss', color: '#a06838', colors: ['#a06838', '#ff9040', '#fff0c0'], signature: 'stillness',
      desc: 'Plant your feet. Standing still focuses the quake: up to 110% more damage, built over a second and lost the moment you move.',
      stillness: { max: 1.1, rise: 1 },
      fx: { trail: '#ff9040', particles: 'rock', spr: { hit: 'punch_s', kill: 'land_dust', proc: 'boom' } } },
  ],

  // ============================================================================================
  // NORMAL
  // ============================================================================================
  swift_star: [
    { id: 'star_shower', tag: A, name: 'Star Shower', color: '#ffd166', colors: ['#ffd166', '#fff6a0', '#ffffff'], signature: 'ricochet',
      desc: 'Stars never miss for long: each one bounces on from a hit to the nearest foe it has not touched, up to 3 times.',
      ricochet: { n: 3 },
      fx: { trail: '#fff6a0', particles: 'stars', spr: { trail: 'star3', hit: 'shine', kill: 'flash_burst', proc: 'spark_s' } } },
    { id: 'swift_spiral', tag: T, name: 'Swift Spiral', color: '#ffe9a0', colors: ['#ffe9a0', '#ffd166', '#ffffff'], signature: 'spiral',
      desc: 'Stars stream out in a turning ring around you, a little further round with every volley.',
      pattern: 'spiral', stats: { amount: 1 },
      fx: { trail: '#ffe9a0', particles: 'stars', spr: { trail: 'star3', hit: 'shine', kill: 'spark', proc: 'ring_s' } } },
    { id: 'wish_star', tag: W, name: 'Wish Star', color: '#ffffff', colors: ['#ffd166', '#c49aff', '#7ac8ff'], signature: 'metronome',
      desc: 'Every volley makes a different wish: burn, freeze, paralyse, poison, curse, confuse or drain, rolled each time, in its own colour.',
      metronome: true,
      fx: { cycle: ['#ff6b6b', '#ffd166', '#7fe08a', '#7ac8ff', '#c49aff'], trail: '#ffd166', particles: 'stars', spr: { trail: 'star3', hit: 'shine', kill: 'flash_burst', proc: 'ring_m' } } },
  ],
  comet_punch: [
    { id: 'mach_punch', tag: A, name: 'Mach Punch', color: '#ffb0a0', colors: ['#ffb0a0', '#ffffff', '#ff6a5a'], signature: 'haste',
      desc: 'Every knockout puts a spring in your step: 1.5s of 30% faster movement, refreshed by each one.',
      haste: { t: 1.5, mul: 1.3 },
      fx: { trail: '#ffffff', particles: 'wind', spr: { trail: 'uppercut', hit: 'punch', kill: 'punch_flash', proc: 'hook' } } },
    { id: 'meteor_mash', tag: T, name: 'Meteor Mash', color: '#c8c0ff', colors: ['#c8c0ff', '#ffffff', '#ffd166'], signature: 'strike',
      desc: 'Every 4th flurry calls a meteor down on 3 foes near you for 280% damage.',
      every: { n: 4, strike: { n: 3, dmg: 2.8, r: 26, kind: 'meteor' } },
      fx: { trail: '#c8c0ff', particles: 'stars', spr: { trail: 'star3', hit: 'punch', kill: 'boom', proc: 'beam_boom' } } },
    { id: 'dizzy_punch', tag: W, name: 'Dizzy Punch', color: '#ff9ad8', colors: ['#ff9ad8', '#ffe9a0', '#ffffff'], signature: 'charm',
      desc: 'Hit hard enough and they see stars, then you: 7% of punched foes switch sides for 5s, biting their friends for double damage.',
      charm: { chance: 0.07, t: 5, dmg: 2 },
      fx: { trail: '#ffc8e8', particles: 'petals', spr: { trail: 'star3', hit: 'pink_flash', kill: 'shine', proc: 'notes' } } },
  ],
  tri_attack: [
    { id: 'tri_burst', tag: A, name: 'Tri Burst', color: '#ffb0a0', colors: ['#ff7a1a', '#9ad8f4', '#f8e038'], signature: 'cross',
      desc: 'Fires the triangle four ways at once, each splitting into its three as usual, at 55% damage each.',
      pattern: 'cross',
      stats: { damage: 0.55 },
      fx: { trail: '#ffb0a0', particles: 'sparks', spr: { trail: 'bit', hit: 'spark_s', kill: 'flash_burst', proc: 'ring_s' } } },
    { id: 'triple_volley', tag: T, name: 'Polarity Triangle', color: '#ff6a5a', colors: ['#ff6a5a', '#5ab6ff', '#ffffff'], signature: 'polarity',
      desc: 'Volleys alternate red (+) and blue (-). A foe hit by both within 2s shorts out: a 20% discharge that stuns everything around it.',
      polarity: { dmg: 0.2, r: 30 },
      fx: { trail: '#ffffff', particles: 'sparks', spr: { trail: 'bit', hit: 'spark_s', kill: 'spark', proc: 'flash_burst' } } },
    { id: 'tri_element', tag: W, name: 'Tri Element', color: '#ffb0a0', colors: ['#ff7a1a', '#9ad8f4', '#f8e038'], signature: 'triStatus',
      desc: 'The real Tri Attack: every hit burns, chills, and may paralyse (12%), all at once.',
      hit: { burn: 0.4, burnT: 3, slow: 0.35, slowT: 1.5, stun: { chance: 0.12, t: 0.8 } },
      fx: { cycle: ['#ff7a1a', '#9ad8f4', '#f8e038'], trail: '#ffb0a0', particles: 'embers', spr: { trail: 'bit', hit: 'spark_s', kill: 'boom_s', proc: 'ring_m' } } },
  ],
  hyper_fang: [
    { id: 'super_fang', tag: A, name: 'Super Fang', color: '#ffffff', colors: ['#ffffff', '#ff6a5a', '#ffd166'], signature: 'executeHalf',
      desc: 'Fangs that finish the job: any foe a bite leaves under 12% health is torn down outright, and the fang bounces twice more.',
      hit: { execute: 0.12 }, stats: { bounces: 2 },
      fx: { trail: '#ffffff', particles: 'sparks', spr: { trail: 'blade', hit: 'slash', kill: 'pink_flash', proc: 'punch_flash' } } },
    { id: 'pack_fang', tag: T, name: 'Pack Fang', color: '#c8a070', colors: ['#c8a070', '#ffffff', '#ff6a5a'], signature: 'fan',
      desc: 'The whole pack bites: fangs leave in a wide fan and each one homes in on its own target.',
      pattern: 'fan', stats: { amount: 2, damage: 0.85 },
      fx: { trail: '#e8e0c8', particles: 'wind', spr: { trail: 'blade', hit: 'slash', kill: 'flash_burst', proc: 'hook' } } },
    { id: 'crunch', tag: W, name: 'Crunch', color: '#4a3a66', colors: ['#4a3a66', '#8a72b8', '#ffffff'], signature: 'stacks',
      desc: 'Every bite cracks deeper: the 4th on the same foe crunches through for 75% damage to it and anything pressed against it.',
      stacks: { n: 4, dmg: 0.75, r: 22 },
      fx: { trail: '#8a72b8', particles: 'shadows', spr: { trail: 'blade', hit: 'slash', kill: 'hash', proc: 'punch_flash' } } },
  ],
  fury_swipes: [
    { id: 'frenzy', tag: A, name: 'Frenzy', color: '#ff7a5a', colors: ['#ff7a5a', '#ffd166', '#ffffff'], signature: 'momentum',
      desc: 'Fury feeds on motion: keep moving and the swipes grow up to 70% stronger and 30% faster; stop and they cool off.',
      momentum: { max: 0.7, rise: 0.5, cd: 0.3 },
      fx: { trail: '#ffd166', particles: 'sparks', spr: { trail: 'slash', hit: 'punch_s', kill: 'punch_flash', proc: 'hook' } } },
    { id: 'endless_swipes', tag: T, name: 'Endless Swipes', color: '#ffd166', colors: ['#ffd166', '#ffffff', '#ff7a5a'], signature: 'critBurst',
      desc: 'A critical swipe tears loose 5 claw shards in every direction at 50% damage.',
      critBurst: { n: 5, dmg: 0.5 },
      fx: { trail: '#ffffff', particles: 'sparks', spr: { trail: 'slash', hit: 'punch_s', kill: 'flash_burst', proc: 'punch_flash' } } },
    { id: 'bleed', tag: W, name: 'Bleed', color: '#d03a4a', colors: ['#d03a4a', '#ff6a5a', '#ffffff'], signature: 'contagionBleed',
      desc: 'Swipes open wounds that bleed (30% a second for 3s). When a bleeding foe falls, the bleed spreads to up to 3 around it.',
      hit: { burn: 0.3, burnT: 3 }, contagion: { r: 60, n: 3 },
      fx: { trail: '#ff6a5a', particles: 'embers', spr: { trail: 'slash', hit: 'punch_s', kill: 'pink_flash', proc: 'motes' } } },
  ],
  giga_impact: [
    { id: 'gigaton_hammer', tag: A, name: 'Gigaton Hammer', color: '#c8c0ad', colors: ['#c8c0ad', '#ffffff', '#ffd166'], signature: 'blast',
      desc: 'Every impact lands like a hammer: a 40px crater for 70% damage wherever the charge ends.',
      expire: { blast: { r: 40, dmg: 0.7, knock: 140 } },
      fx: { trail: '#ffffff', particles: 'rock', spr: { trail: 'uppercut', hit: 'punch', kill: 'boom', proc: 'beam_boom' } } },
    { id: 'double_impact', tag: T, name: 'Double Impact', color: '#ffe9a0', colors: ['#ffe9a0', '#ffffff', '#ff7a5a'], signature: 'twin',
      desc: 'Charges out front and back at once: nothing gets behind you.',
      pattern: 'twin',
      fx: { trail: '#ffe9a0', particles: 'wind', spr: { trail: 'uppercut', hit: 'punch', kill: 'punch_flash', proc: 'ring_l' } } },
    { id: 'shockwave_body', tag: W, name: 'Recoil Guard', color: '#a0a0b8', colors: ['#a0a0b8', '#ffffff', '#7ac8ff'], signature: 'guard',
      desc: 'All that mass becomes armour: every 15 foes the charge knocks out gives you a shield that blocks the next hit entirely.',
      guard: { kills: 15 }, stats: { damage: 1.15 },
      fx: { trail: '#ffffff', particles: 'rock', spr: { trail: 'uppercut', hit: 'punch', kill: 'flash_burst', proc: 'guard_ring' } } },
  ],

  // ============================================================================================
  // ELECTRIC
  // ============================================================================================
  spark_chain: [
    { id: 'overcharge', tag: A, name: 'Overcharge', color: '#fff6a0', colors: ['#fff6a0', '#f8e038', '#ffffff'], signature: 'heat',
      desc: 'Charge builds with every arc. The 8th discharges in an OVERCHARGE: 12 sparks all round and a 260% shock at your feet, then 1.2s to recharge.',
      heat: { max: 8, dmg: 2.6, n: 12, vent: 1.2 },
      fx: { trail: '#fff6a0', particles: 'sparks', spr: { hit: 'spark_s', kill: 'spark', proc: 'lightning' } } },
    { id: 'forked_lightning', tag: T, name: 'Forked Lightning', color: '#fff6a0', colors: ['#fff6a0', '#7ac8ff', '#ffffff'], signature: 'chainFork',
      desc: 'Two extra chains crackle out at once, each starting on a different foe.',
      chainFork: 2,
      fx: { cycle: ['#fff6a0', '#7ac8ff', '#ffffff'], trail: '#fff6a0', particles: 'sparks', spr: { hit: 'spark_s', kill: 'spark_line', proc: 'lightning' } } },
    { id: 'paralysis_arc', tag: W, name: 'Static Bond', color: '#f8e038', colors: ['#f8e038', '#c49aff', '#ffffff'], signature: 'bond',
      desc: 'The chain leaves a circuit behind: the last 5 foes it touched stay wired together, each feeling 30% of what any of them takes.',
      bond: { share: 0.3, max: 5 },
      fx: { trail: '#f8e038', particles: 'sparks', spr: { hit: 'circuit', kill: 'spark', proc: 'ring_s' } } },
  ],
  thunder_fang: [
    { id: 'wild_charge', tag: A, name: 'Wild Charge', color: '#f8e038', colors: ['#f8e038', '#ffffff', '#ff7a1a'], signature: 'overkill',
      desc: 'A fang that will not stop at one: whatever a killing bite has left over jumps to the nearest foe.',
      overkill: { share: 1, range: 120 },
      stats: { damage: 1.1 },
      fx: { trail: '#fff6a0', particles: 'sparks', spr: { trail: 'spark_s', hit: 'spark', kill: 'spark_line', proc: 'lightning' } } },
    { id: 'thunder_cage', tag: T, name: 'Thunder Cage', color: '#fff6a0', colors: ['#fff6a0', '#f8e038', '#ffffff'], signature: 'orbitOut',
      desc: 'Spent fangs are caught by your static and circle you for 2.5s, a crackling cage that bites anything that comes close.',
      orbitOut: { t: 2.5, r: 30, dmg: 0.7 },
      fx: { trail: '#fff6a0', particles: 'sparks', spr: { trail: 'spark_s', hit: 'spark', kill: 'flash_burst', proc: 'ring_s' } } },
    { id: 'static_bite', tag: W, name: 'Static Bite', color: '#e8d020', colors: ['#e8d020', '#7ac8ff', '#ffffff'], signature: 'polarity',
      desc: 'Fangs alternate charge. A foe bitten + and then - within 2s discharges for 25% damage, stunning everything near it.',
      polarity: { dmg: 0.25, r: 28 },
      fx: { trail: '#fff6a0', particles: 'sparks', spr: { trail: 'spark_s', hit: 'spark_s', kill: 'spark', proc: 'lightning' } } },
  ],
  volt_coil: [
    { id: 'tesla_tower', tag: A, name: 'Tesla Tower', color: '#f8e038', colors: ['#f8e038', '#7ac8ff', '#ffffff'], signature: 'rod',
      desc: 'The coil is a lightning rod: every 2.5s it calls a bolt onto the toughest foe in range for 340% damage.',
      rod: { every: 2.5, dmg: 3.4, n: 1 },
      fx: { trail: '#fff6a0', particles: 'sparks', spr: { hit: 'spark_s', kill: 'spark', proc: 'spark_line' } } },
    { id: 'rail_coil', tag: T, name: 'Rail Coil', color: '#7ac8ff', colors: ['#7ac8ff', '#ffffff', '#f8e038'], signature: 'accel',
      desc: 'The coil fires railgun slugs: every shot speeds up across the screen and hits up to 200% harder at full stretch.',
      accel: { max: 2 }, turret: { range: 1.4, speed: 300 },
      fx: { trail: '#ffffff', particles: 'sparks', spr: { trail: 'streak', hit: 'spark', kill: 'spark_line', proc: 'ring_s' } } },
    { id: 'overload_coil', tag: W, name: 'Overload Coil', color: '#ffd166', colors: ['#ffd166', '#f8e038', '#ff7a1a'], signature: 'tripleBarrel',
      desc: 'Three barrels, firing half again as often: the coil becomes a storm of sparks.',
      turret: { barrels: 3, gap: 0.65 },
      fx: { trail: '#ffd166', particles: 'sparks', spr: { trail: 'spark_s', hit: 'spark_s', kill: 'flash_burst', proc: 'spark' } } },
  ],
  electro_ball: [
    { id: 'voltage_ball', tag: A, name: 'Voltage Ball', color: '#f8e038', colors: ['#f8e038', '#ffffff', '#7ac8ff'], signature: 'snowball',
      desc: 'The ball charges up as it bounces: +10% size and +18% damage for every foe it strikes, up to 10 times.',
      snowball: { grow: 0.1, dmg: 0.18, max: 10 },
      fx: { trail: '#fff6a0', particles: 'sparks', spr: { trail: 'spark_s', hit: 'spark', kill: 'flash_burst', proc: 'ring_s' } } },
    { id: 'ball_lightning', tag: T, name: 'Ball Lightning', color: '#fff6a0', colors: ['#fff6a0', '#c49aff', '#ffffff'], signature: 'gravity',
      desc: 'A ball so charged it drags the field: foes within 36px of it are pulled along behind it as it bounces.',
      gravity: { r: 36, pull: 120 },
      fx: { trail: '#c49aff', particles: 'sparks', spr: { trail: 'circuit', hit: 'spark_s', kill: 'spark', proc: 'ring_m' } } },
    { id: 'electric_terrain', tag: W, name: 'Electric Terrain', color: '#e8d020', colors: ['#e8d020', '#fff6a0', '#7ac8ff'], signature: 'wake',
      desc: 'The ball leaves the floor live behind it: a crackling trail that shocks for 30% a second and slows by 25%.',
      wake: { every: 0.1, r: 12, life: 1.8, dps: 0.3, slow: 0.25, color: '#e8d020' },
      fx: { trail: '#fff6a0', particles: 'sparks', spr: { trail: 'circuit', hit: 'spark_s', kill: 'spark', proc: 'ring_s' } } },
  ],
  thunder_wave: [
    { id: 'shock_wave', tag: A, name: 'Shock Wave', color: '#f8e038', colors: ['#f8e038', '#ffffff', '#c49aff'], signature: 'tide',
      desc: 'Waves come in rhythm: 4s of fast, light pulses (FLOW), then 4s of rare, huge ones 70% wider and harder (EBB).',
      tide: { period: 4 },
      fx: { trail: '#fff6a0', particles: 'sparks', spr: { hit: 'spark_s', kill: 'spark', proc: 'ring_l' } } },
    { id: 'pulsar', tag: T, name: 'Pulsar', color: '#c49aff', colors: ['#c49aff', '#fff6a0', '#ffffff'], signature: 'echo',
      desc: 'Every pulse rings twice: an echo of it goes out again 0.4s later from where you were, at 70% strength.',
      echo: { delay: 0.4, dmg: 0.7 },
      fx: { trail: '#c49aff', particles: 'sparks', spr: { hit: 'circuit', kill: 'spark', proc: 'ring_m' } } },
    { id: 'full_paralysis', tag: W, name: 'Full Paralysis', color: '#ffe14a', colors: ['#ffe14a', '#ffffff', '#ff7a1a'], signature: 'shatterStun',
      desc: 'Every pulse paralyses 30% of what it touches for 1s, and paralysed foes take 60% more from it.',
      hit: { stun: { chance: 0.3, t: 1 }, shatter: 0.6 },
      fx: { trail: '#ffe14a', particles: 'sparks', spr: { hit: 'spark_s', kill: 'spark_line', proc: 'lightning' } } },
  ],
  live_wire: [
    { id: 'high_voltage', tag: A, name: 'High Voltage', color: '#fff6a0', colors: ['#fff6a0', '#f8e038', '#ffffff'], signature: 'stillness',
      desc: 'A wire held steady carries more: stand still and the current climbs up to 120% stronger; move and it drops back.',
      stillness: { max: 1.2, rise: 0.8 },
      fx: { trail: '#fff6a0', particles: 'sparks', spr: { hit: 'spark_s', kill: 'spark', proc: 'ring_s' } } },
    { id: 'power_grid', tag: T, name: 'Power Grid', color: '#7ac8ff', colors: ['#7ac8ff', '#fff6a0', '#ffffff'], signature: 'link',
      desc: 'The wire splits to 2 extra foes at once, a web of current across the field.',
      link: { targets: 2 },
      fx: { trail: '#7ac8ff', particles: 'sparks', spr: { hit: 'circuit', kill: 'spark', proc: 'ring_s' } } },
    { id: 'electrocute', tag: W, name: 'Electrocute', color: '#e8d020', colors: ['#e8d020', '#ff7a1a', '#ffffff'], signature: 'doom',
      desc: 'The wire leaves a charge in its victim that builds for 2.5s and then blows: 110% damage to it and anything near it.',
      doom: { t: 2.5, dmg: 1.1, r: 28 },
      fx: { trail: '#fff6a0', particles: 'sparks', spr: { hit: 'spark_s', kill: 'flash_burst', proc: 'lightning' } } },
  ],

  // ============================================================================================
  // DARK
  // ============================================================================================
  night_daze: [
    { id: 'night_terror', tag: A, name: 'Night Terror', color: '#6a4a9a', colors: ['#6a4a9a', '#c49aff', '#ffffff'], signature: 'charm',
      desc: 'A nightmare that turns minds: 4% of the foes it links are terrified into fighting for you for 5s, at double their bite.',
      charm: { chance: 0.04, t: 5, dmg: 2 },
      stats: { damage: 1.1 },
      fx: { trail: '#8a72b8', particles: 'shadows', spr: { hit: 'oval', kill: 'death_flash', proc: 'notes' } } },
    { id: 'shadow_web', tag: T, name: 'Shadow Web', color: '#4a3a66', colors: ['#4a3a66', '#8a72b8', '#ffd166'], signature: 'link',
      desc: 'The daze spreads through the dark to 3 more foes at once.',
      link: { targets: 3 },
      fx: { trail: '#8a72b8', particles: 'shadows', spr: { hit: 'blade', kill: 'hash', proc: 'ring_s' } } },
    { id: 'hex_mark', tag: W, name: 'Hex Mark', color: '#a050c0', colors: ['#a050c0', '#ff6bb0', '#ffffff'], signature: 'markMany',
      desc: 'Linked foes are hexed: they take 30% more damage from everything for 4s.',
      hit: { mark: { mul: 0.3, t: 4 } },
      fx: { trail: '#a050c0', particles: 'toxic', spr: { hit: 'hash', kill: 'death_flash', proc: 'guard_ring' } } },
  ],
  sucker_punch: [
    { id: 'ambush', tag: A, name: 'Ambush', color: '#4a3a66', colors: ['#4a3a66', '#ff4a4a', '#ffffff'], signature: 'pinch',
      desc: 'Cornered, you strike first: below 50% health every punch hits 100% harder and comes 25% faster.',
      pinch: { at: 0.5, dmg: 2, cd: 0.75 },
      fx: { trail: '#8a72b8', particles: 'shadows', spr: { trail: 'blade', hit: 'punch', kill: 'punch_flash', proc: 'hook' } } },
    { id: 'shadow_rush', tag: T, name: 'Shadow Rush', color: '#2a2038', colors: ['#2a2038', '#8a72b8', '#c8bcf0'], signature: 'echo',
      desc: 'A shadow of you throws the same punch again 0.3s later from where you were, at 70%: two ambushes for one.',
      echo: { delay: 0.3, dmg: 0.7 },
      fx: { trail: '#8a72b8', particles: 'shadows', spr: { trail: 'dot', hit: 'punch', kill: 'death_flash', proc: 'ring_s' } } },
    { id: 'dirty_fighting', tag: W, name: 'Dirty Fighting', color: '#6a5a3a', colors: ['#6a5a3a', '#ffd166', '#ffffff'], signature: 'thief',
      desc: 'A punch and a pickpocket: every hit has an 8% chance to knock coins out of what you hit.',
      thief: { chance: 0.08 }, hit: { weaken: 2 },
      fx: { trail: '#8a72b8', particles: 'shadows', spr: { trail: 'blade', hit: 'punch_s', kill: 'star3', proc: 'shine' } } },
  ],
  foul_play: [
    { id: 'spite_skull', tag: A, name: 'Spite Skull', color: '#8a72b8', colors: ['#8a72b8', '#ff6bb0', '#ffffff'], signature: 'overkill',
      desc: 'Foul play uses their strength against them: damage past a kill carries straight on into the next foe within 120px.',
      overkill: { share: 1.2, range: 120 },
      fx: { trail: '#c8bcf0', particles: 'shadows', spr: { trail: 'dot', hit: 'hash', kill: 'death_flash', proc: 'punch_flash' } } },
    { id: 'skull_volley', tag: T, name: 'Skull Volley', color: '#c8bcf0', colors: ['#c8bcf0', '#8a72b8', '#ffffff'], signature: 'volley',
      desc: 'Throws three skulls a beat apart, each re-aimed at whatever is nearest.',
      pattern: 'volley', volley: 3, stats: { damage: 0.7 },
      fx: { trail: '#c8bcf0', particles: 'shadows', spr: { trail: 'dot', hit: 'oval', kill: 'hash', proc: 'ring_s' } } },
    { id: 'payback', tag: W, name: 'Payback', color: '#ff4a6a', colors: ['#ff4a6a', '#4a3a66', '#ffffff'], signature: 'wisps',
      desc: 'Every kill sends 3 vengeful wisps after the nearest foes for 60% damage each.',
      kill: { wisps: { n: 3, dmg: 0.6 } },
      fx: { trail: '#ff6a8a', particles: 'spirit', spr: { trail: 'dot', hit: 'hash', kill: 'death_flash', proc: 'oval' } } },
  ],
  dark_void: [
    { id: 'abyss', tag: A, name: 'Abyss', color: '#2a1a40', colors: ['#2a1a40', '#6a4a9a', '#c49aff'], signature: 'soul',
      desc: 'The void is hungry, and it grows: every foe it swallows makes it 0.225% stronger for the rest of the run, up to +90%.',
      soul: { per: 0.00225, max: 0.9 },
      fx: { trail: '#6a4a9a', particles: 'shadows', spr: { hit: 'oval', kill: 'motes', proc: 'guard_ring' } } },
    { id: 'black_hole', tag: T, name: 'Black Hole', color: '#1a1028', colors: ['#1a1028', '#8a72b8', '#ffffff'], signature: 'collapse',
      desc: 'The void pulls 50% harder, then collapses at its end, crushing everything inside for 250% damage.',
      zone: { pull: 1.5, boom: 2.5 },
      fx: { trail: '#8a72b8', particles: 'shadows', spr: { hit: 'oval', kill: 'death_flash', proc: 'beam_boom' } } },
    { id: 'nightmare_void', tag: W, name: 'Event Horizon', color: '#4a2a6a', colors: ['#4a2a6a', '#c49aff', '#7ac8ff'], signature: 'warp',
      desc: 'Time bends at its edge: a third of the void\'s kills leave a 3s pocket where foes crawl and enemy shots barely move.',
      warp: { r: 46, t: 3, slow: 0.75, chance: 0.33 },
      fx: { trail: '#c49aff', particles: 'shadows', spr: { hit: 'oval', kill: 'ring_l', proc: 'motes' } } },
  ],
  snarl: [
    { id: 'howl', tag: A, name: 'Howl', color: '#8a72b8', colors: ['#8a72b8', '#ffd166', '#ffffff'], signature: 'haste',
      desc: 'A kill makes you howl: 2s of 35% faster movement, kept up as long as the kills keep coming.',
      haste: { t: 2, mul: 1.35 },
      fx: { trail: '#c8bcf0', particles: 'shadows', spr: { trail: 'notes', hit: 'oval', kill: 'hook', proc: 'ring_m' } } },
    { id: 'echoed_voice', tag: T, name: 'Echoed Voice', color: '#c8bcf0', colors: ['#c8bcf0', '#8a72b8', '#ffffff'], signature: 'echo',
      desc: 'The snarl echoes off everything: it rings out again 0.45s later from where you were, at 80%.',
      echo: { delay: 0.45, dmg: 0.8 },
      fx: { trail: '#c8bcf0', particles: 'wind', spr: { trail: 'notes', hit: 'oval', kill: 'ring_s', proc: 'ring_l' } } },
    { id: 'scary_face', tag: W, name: 'Scary Face', color: '#ff4a4a', colors: ['#ff4a4a', '#4a3a66', '#ffffff'], signature: 'confuse',
      desc: 'Too frightening to fight: snarled foes are confused for 2.5s and weakened for 3s.',
      hit: { confuse: 2.5, weaken: 3 },
      fx: { trail: '#ff6a6a', particles: 'shadows', spr: { trail: 'notes', hit: 'hash', kill: 'death_flash', proc: 'notes' } } },
  ],
  nightmare: [
    { id: 'bad_dreams', tag: A, name: 'Bad Dreams', color: '#4a2a6a', colors: ['#4a2a6a', '#c49aff', '#ff6bb0'], signature: 'sleepDoom',
      desc: 'Nightmares that end badly: 20% of foes caught fall asleep for 2s, and every one caught carries a dream that bursts 3s later for 110%.',
      hit: { sleep: { chance: 0.2, t: 2 } }, doom: { t: 3, dmg: 1.1, r: 26 },
      fx: { trail: '#8a72b8', particles: 'shadows', spr: { hit: 'oval', kill: 'death_flash', proc: 'guard_ring' } } },
    { id: 'nightmare_circle', tag: T, name: 'Nightmare Circle', color: '#6a4a9a', colors: ['#6a4a9a', '#8a72b8', '#ffffff'], signature: 'ring',
      desc: 'The nightmares bloom in a ring all around you instead of on one spot.',
      pattern: 'ring', stats: { damage: 1 },
      fx: { trail: '#8a72b8', particles: 'shadows', spr: { hit: 'oval', kill: 'hash', proc: 'ring_l' } } },
    { id: 'curse', tag: W, name: 'Curse', color: '#2a1a40', colors: ['#2a1a40', '#ff4a6a', '#c49aff'], signature: 'contagion',
      desc: 'A curse that will not die with its host: when a cursed foe falls, its curse (+30% damage taken) and every status jump to 4 more.',
      hit: { mark: { mul: 0.3, t: 4 } }, contagion: { r: 80, n: 4 },
      fx: { trail: '#ff4a6a', particles: 'shadows', spr: { hit: 'hash', kill: 'death_flash', proc: 'motes' } } },
  ],

  // ============================================================================================
  // GRASS
  // ============================================================================================
  leaf_arrow: [
    { id: 'leaf_blade_storm', tag: A, name: 'Leaf Blade Storm', color: '#7fe08a', colors: ['#7fe08a', '#c4f29a', '#ffffff'], signature: 'ricochet',
      desc: 'Razor leaves glance off one foe into the next: each arrow ricochets up to 3 times to targets it has not hit.',
      ricochet: { n: 3 },
      fx: { trail: '#c4f29a', particles: 'leaves', spr: { trail: 'slash', hit: 'slash', kill: 'shard', proc: 'ring_blade' } } },
    { id: 'leaf_tornado', tag: T, name: 'Leaf Tornado', color: '#4aa32c', colors: ['#4aa32c', '#7fe08a', '#ffe9a0'], signature: 'spiral',
      desc: 'The arrows whirl out in a turning spiral, sweeping all the way around you.',
      pattern: 'spiral', stats: { amount: 1 },
      fx: { trail: '#7fe08a', particles: 'leaves', spr: { trail: 'motes', hit: 'slash', kill: 'shard', proc: 'ring_m' } } },
    { id: 'razor_leaf', tag: W, name: 'Overgrow', color: '#2e8a2a', colors: ['#2e8a2a', '#ff6a5a', '#c4f29a'], signature: 'pinch',
      desc: 'Overgrow: below 40% health the arrows fly 40% faster and hit 90% harder.',
      pinch: { at: 0.4, dmg: 1.9, cd: 0.6 },
      fx: { trail: '#7fe08a', particles: 'leaves', spr: { trail: 'slash', hit: 'slash', kill: 'pink_flash', proc: 'ring_blade' } } },
  ],
  seed_bomb: [
    { id: 'seed_barrage', tag: A, name: 'Seed Barrage', color: '#8ac040', colors: ['#8ac040', '#c4f29a', '#ffd166'], signature: 'gamble',
      desc: 'Some seeds come up in clumps: a 25% chance the barrage is thrown twice, and a 5% chance of five in a row.',
      gamble: { twice: 0.25, five: 0.05 },
      fx: { trail: '#c4f29a', particles: 'leaves', spr: { hit: 'shard', kill: 'boom_s', proc: 'ring_m' } } },
    { id: 'seed_flare', tag: T, name: 'Seed Flare', color: '#c4f29a', colors: ['#c4f29a', '#ffffff', '#7fe08a'], signature: 'split',
      desc: 'Each seed bursts into 6 homing seedlings at 40% damage when it goes off.',
      expire: { split: { n: 6, dmg: 0.4, homing: true } },
      fx: { trail: '#c4f29a', particles: 'leaves', spr: { trail: 'motes', hit: 'shard', kill: 'flash_burst', proc: 'ring_blade' } } },
    { id: 'leech_seed', tag: W, name: 'Leech Seed', color: '#4aa32c', colors: ['#4aa32c', '#7fe08a', '#ff6bb0'], signature: 'leech',
      desc: 'Seeds take root in what they hit and drain it: 20% of hits heal you 1, and every kill a 2.',
      hit: { leech: { chance: 0.2, hp: 1 } }, kill: { heal: { chance: 1, hp: 2 } },
      fx: { trail: '#7fe08a', particles: 'leaves', spr: { hit: 'motes', kill: 'shine', proc: 'ring_s' } } },
  ],
  vine_whip: [
    { id: 'power_whip', tag: A, name: 'Power Whip', color: '#3a9a3a', colors: ['#3a9a3a', '#c4f29a', '#ffffff'], signature: 'stacks',
      desc: 'Lash the same foe again and again: the 5th lash snaps it for 70% damage and stuns what is around it.',
      stacks: { n: 5, dmg: 0.7, r: 24 },
      fx: { trail: '#7fe08a', particles: 'leaves', spr: { trail: 'slash', hit: 'slash', kill: 'shard', proc: 'punch_flash' } } },
    { id: 'vine_cage', tag: T, name: 'Vine Cage', color: '#2e8a2a', colors: ['#2e8a2a', '#7fe08a', '#ffe9a0'], signature: 'gravity',
      desc: 'The vines snare as they crawl: foes within 34px are dragged along with them into one tangled heap.',
      gravity: { r: 34, pull: 120 }, hit: { slow: 0.35, slowT: 1.5 },
      fx: { trail: '#7fe08a', particles: 'leaves', spr: { trail: 'motes', hit: 'slash', kill: 'shard', proc: 'ring_m' } } },
    { id: 'grass_knot', tag: W, name: 'Grass Knot', color: '#8ac040', colors: ['#8ac040', '#c4f29a', '#ffffff'], signature: 'executeHeavy',
      desc: 'The heavier they are, the harder they fall: big and armoured foes take 60% more, and anything tripped under 12% health is finished.',
      hit: { execute: 0.12, shatter: 0.6, stun: { chance: 0.15, t: 0.6 } },
      fx: { trail: '#c4f29a', particles: 'leaves', spr: { trail: 'slash', hit: 'land_dust', kill: 'slide_dust', proc: 'ring_s' } } },
  ],
  petal_blizzard: [
    { id: 'petal_dance', tag: A, name: 'Petal Dance', color: '#ff9ad8', colors: ['#ff9ad8', '#ffc8e8', '#ffffff'], signature: 'momentum',
      desc: 'A dance that never stops: keep moving and the petals grow up to 80% stronger and spin 30% faster.',
      momentum: { max: 0.8, rise: 0.5, cd: 0.3 },
      fx: { trail: '#ffc8e8', particles: 'petals', spr: { trail: 'notes', hit: 'pink_flash', kill: 'shine', proc: 'ring_m' } } },
    { id: 'petal_vortex', tag: T, name: 'Petal Vortex', color: '#ff6bb0', colors: ['#ff6bb0', '#ffc8e8', '#ffd166'], signature: 'vortex',
      desc: 'Every 6th flurry opens a petal vortex on the nearest foe: it pulls hard for 2s, then bursts for 180%.',
      every: { n: 6, vortex: { r: 44, life: 2, pull: 160, dmg: 0.3, boom: 1.8 } },
      fx: { cycle: ['#ff9ad8', '#ffc8e8', '#ffd166'], trail: '#ffc8e8', particles: 'petals', spr: { trail: 'notes', hit: 'pink_flash', kill: 'shine', proc: 'ring_l' } } },
    { id: 'aromatherapy', tag: W, name: 'Aromatherapy', color: '#7fe08a', colors: ['#7fe08a', '#ff6bb0', '#ffc8e8'], signature: 'charm',
      desc: 'A scent sweet enough to turn them: 1.2% of petalled foes are charmed for 5s and fight for you at 1.5x their bite.',
      charm: { chance: 0.012, t: 5, dmg: 1.5 },
      stats: { damage: 1.15 },
      fx: { cycle: ['#ff6bb0', '#7fe08a', '#ffc8e8'], trail: '#ffc8e8', particles: 'petals', spr: { trail: 'notes', hit: 'shine', kill: 'pink_flash', proc: 'notes' } } },
  ],
  spore_pod: [
    { id: 'spore_cannon', tag: A, name: 'Spore Cannon', color: '#a8d860', colors: ['#a8d860', '#e8f8b0', '#ffffff'], signature: 'snowball',
      desc: 'Spores swell with what they pass through: each shot grows 12% and hits 15% harder for every foe it pierces.',
      snowball: { grow: 0.12, dmg: 0.15, max: 6 }, turret: { dmg: 1.1 },
      fx: { trail: '#e8f8b0', particles: 'leaves', spr: { trail: 'motes', hit: 'dust', kill: 'boom_s', proc: 'ring_s' } } },
    { id: 'puffball', tag: T, name: 'Puffball', color: '#e8f8b0', colors: ['#e8f8b0', '#a8d860', '#ffffff'], signature: 'mine',
      desc: 'Spores that miss settle as puffballs for 7s, bursting for 120% when anything steps on them.',
      mine: { r: 26, dmg: 1.2, life: 7, chance: 1 },
      fx: { trail: '#e8f8b0', particles: 'leaves', spr: { trail: 'motes', hit: 'dust', kill: 'boom_s', proc: 'boom' } } },
    { id: 'sleep_powder', tag: W, name: 'Sleep Powder', color: '#a8e4ff', colors: ['#a8e4ff', '#c49aff', '#ffffff'], signature: 'sleep',
      desc: 'Spores may put their target to sleep (25%) for 1.5s: fast asleep, harmless and going nowhere.',
      hit: { sleep: { chance: 0.25, t: 1.5 } },
      fx: { trail: '#c8e8ff', particles: 'spirit', spr: { trail: 'motes', hit: 'sparkle', kill: 'shine', proc: 'ring_s' } } },
  ],
  grassy_terrain: [
    { id: 'overgrowth', tag: A, name: 'Overgrowth', color: '#4aa32c', colors: ['#4aa32c', '#7fe08a', '#ffe9a0'], signature: 'soul',
      desc: 'The meadow grows on what falls in it: every kill makes the terrain 0.2% stronger for the rest of the run, up to +80%.',
      soul: { per: 0.002, max: 0.8 },
      fx: { trail: '#7fe08a', particles: 'leaves', spr: { hit: 'motes', kill: 'shine', proc: 'ring_blade' } } },
    { id: 'thorn_field', tag: T, name: 'Thorn Field', color: '#2e8a2a', colors: ['#2e8a2a', '#c4f29a', '#ff6a5a'], signature: 'nova',
      desc: 'Every 5th patch bristles: a ring of thorns bursts out from you for 160% and slows by 40%.',
      every: { n: 5, nova: { r: 80, dmg: 1.6, slow: 0.4 } },
      fx: { trail: '#7fe08a', particles: 'leaves', spr: { hit: 'slash', kill: 'shard', proc: 'ring_l' } } },
    { id: 'ingrain', tag: W, name: 'Ingrain', color: '#8ac040', colors: ['#8ac040', '#ff6bb0', '#ffffff'], signature: 'stillnessHeal',
      desc: 'Put down roots: standing still strengthens the terrain up to 100%, and its kills heal you 1.',
      stillness: { max: 1, rise: 0.7 }, kill: { heal: { chance: 0.5, hp: 1 } },
      fx: { trail: '#c4f29a', particles: 'leaves', spr: { hit: 'motes', kill: 'shine', proc: 'ring_s' } } },
  ],

  // ============================================================================================
  // FLYING
  // ============================================================================================
  gust: [
    { id: 'air_slash', tag: A, name: 'Air Slash', color: '#f0f6ff', colors: ['#f0f6ff', '#b8cde0', '#ffffff'], signature: 'critBurst',
      desc: 'A critical gust splits the air: 4 blades fan out from the struck foe at 60% damage.',
      critBurst: { n: 4, dmg: 0.6 },
      fx: { trail: '#ffffff', particles: 'wind', spr: { trail: 'uppercut', hit: 'slash', kill: 'throw_flash', proc: 'hook' } } },
    { id: 'tailwind', tag: T, name: 'Tailwind', color: '#b8cde0', colors: ['#b8cde0', '#f0f6ff', '#7ac8ff'], signature: 'haste',
      desc: 'Every gust that blows a foe away fills your sails: kills give 1.5s of 35% faster movement.',
      haste: { t: 1.5, mul: 1.35 }, stats: { knockback: 1.4 },
      fx: { trail: '#f0f6ff', particles: 'wind', spr: { trail: 'uppercut', hit: 'hook', kill: 'throw_flash', proc: 'ring_m' } } },
    { id: 'whirlwind', tag: W, name: 'Whirlwind', color: '#d8e8f8', colors: ['#d8e8f8', '#ffffff', '#b8cde0'], signature: 'gravityWind',
      desc: 'Each gust is a whirlwind: it hoovers up the foes it passes and carries them along, then dumps them where it dies.',
      gravity: { r: 38, pull: 140 },
      fx: { trail: '#ffffff', particles: 'wind', spr: { trail: 'dust', hit: 'hook', kill: 'slide_dust', proc: 'ring_m' } } },
  ],
  pin_missile: [
    { id: 'pin_storm', tag: A, name: 'Pin Storm', color: '#c8d870', colors: ['#c8d870', '#ffffff', '#f8e038'], signature: 'stacks',
      desc: 'Pins pile up: the 7th pin in one foe bursts them all for 55% damage.',
      stacks: { n: 7, dmg: 0.55, r: 22 },
      fx: { trail: '#e8f0b0', particles: 'sparks', spr: { trail: 'streak', hit: 'punch_s', kill: 'shard', proc: 'flash_burst' } } },
    { id: 'needle_ring', tag: T, name: 'Needle Ring', color: '#e8f0b0', colors: ['#e8f0b0', '#c8d870', '#ffffff'], signature: 'ring',
      desc: 'Pins fly out in every direction at once.',
      pattern: 'ring', stats: { damage: 1 },
      fx: { trail: '#e8f0b0', particles: 'sparks', spr: { trail: 'streak', hit: 'punch_s', kill: 'flash_burst', proc: 'ring_s' } } },
    { id: 'twineedle', tag: W, name: 'Twineedle', color: '#c070e0', colors: ['#c070e0', '#e8b0f8', '#7fe08a'], signature: 'toxic',
      desc: 'Poisoned pins: every hit badly poisons for 35% a second for 4s.',
      hit: { burn: 0.35, burnT: 4, toxic: true },
      fx: { trail: '#e8b0f8', particles: 'toxic', spr: { trail: 'streak', hit: 'gibs', kill: 'boom_s', proc: 'boom' } } },
  ],
  brave_bird: [
    { id: 'dive_bomb', tag: A, name: 'Dive Bomb', color: '#ff7a5a', colors: ['#ff7a5a', '#ffd166', '#ffffff'], signature: 'blast',
      desc: 'Every dive ends in a crater: a 42px blast for 80% damage where it lands.',
      expire: { blast: { r: 42, dmg: 0.8, knock: 150 } },
      fx: { trail: '#ffd166', particles: 'wind', spr: { trail: 'uppercut', hit: 'punch', kill: 'boom_fire', proc: 'beam_boom' } } },
    { id: 'twin_dive', tag: T, name: 'Reckless Dive', color: '#ffb0a0', colors: ['#ffb0a0', '#ffffff', '#ff4a4a'], signature: 'pinch',
      desc: 'Brave Bird with no regard for itself: below 50% health it dives 35% faster and hits 120% harder.',
      pinch: { at: 0.5, dmg: 2.2, cd: 0.65 },
      fx: { trail: '#ffffff', particles: 'wind', spr: { trail: 'uppercut', hit: 'punch', kill: 'pink_flash', proc: 'hook' } } },
    { id: 'feather_dance', tag: W, name: 'Feather Dance', color: '#f0f6ff', colors: ['#f0f6ff', '#ff9ad8', '#ffffff'], signature: 'charm',
      desc: 'Feathers so beautiful they disarm: 9% of struck foes are charmed for 4s and fight for you at double their bite.',
      charm: { chance: 0.09, t: 4, dmg: 2 },
      stats: { damage: 1.1 },
      fx: { trail: '#ffc8e8', particles: 'wind', spr: { trail: 'uppercut', hit: 'shine', kill: 'pink_flash', proc: 'notes' } } },
  ],
  aerial_ace: [
    { id: 'aerial_barrage', tag: A, name: 'Aerial Barrage', color: '#b8cde0', colors: ['#b8cde0', '#ffffff', '#7ac8ff'], signature: 'volley',
      desc: 'Three never-miss strikes a beat apart, each re-aimed at the nearest foe.',
      pattern: 'volley', volley: 3, stats: { damage: 0.7 },
      fx: { trail: '#ffffff', particles: 'wind', spr: { trail: 'uppercut', hit: 'slash', kill: 'throw_flash', proc: 'hook' } } },
    { id: 'acrobatics', tag: T, name: 'Acrobatics', color: '#7ac8ff', colors: ['#7ac8ff', '#ffffff', '#ffd166'], signature: 'boomerang',
      desc: 'Every strike loops back to you after its run, cutting through everything on the way home.',
      boomerang: { dmg: 1 },
      fx: { trail: '#ffffff', particles: 'wind', spr: { trail: 'uppercut', hit: 'slash', kill: 'flash_burst', proc: 'hook' } } },
    { id: 'sky_uppercut', tag: W, name: 'Sky Uppercut', color: '#ffd166', colors: ['#ffd166', '#ffffff', '#ff7a5a'], signature: 'overkill',
      desc: 'An uppercut so clean it carries on: damage beyond a kill rises on into the nearest foe.',
      overkill: { share: 1, range: 120 },
      fx: { trail: '#ffe9a0', particles: 'wind', spr: { trail: 'uppercut', hit: 'punch', kill: 'punch_flash', proc: 'hook' } } },
  ],
  sky_guard: [
    { id: 'flock', tag: A, name: 'Flock', color: '#c8a070', colors: ['#c8a070', '#ffffff', '#ffd166'], signature: 'guard',
      desc: 'The flock closes ranks round you: every 18 foes it fells gives you a feather shield that blocks the next hit.',
      guard: { kills: 18 }, stats: { amount: 1 },
      fx: { trail: '#e8e0c8', particles: 'wind', spr: { trail: 'uppercut', hit: 'punch_s', kill: 'flash_burst', proc: 'guard_ring' } } },
    { id: 'gun_wing', tag: T, name: 'Gun Wing', color: '#b8cde0', colors: ['#b8cde0', '#ffffff', '#7ac8ff'], signature: 'emit',
      desc: 'The birds fire feathers as they fly: a shot every 0.45s each, at whatever is nearest them.',
      emit: { gap: 0.45, dmg: 1.4 },
      stats: { damage: 1.1 },
      fx: { trail: '#ffffff', particles: 'wind', spr: { trail: 'uppercut', hit: 'punch_s', kill: 'throw_flash', proc: 'ring_s' } } },
    { id: 'roost', tag: W, name: 'Roost', color: '#e8e0c8', colors: ['#e8e0c8', '#7fe08a', '#ffffff'], signature: 'stillnessHeal',
      desc: 'Rest and the flock rallies: stand still and they grow up to 90% stronger, and their kills heal you 1.',
      stillness: { max: 0.9, rise: 0.7 }, kill: { heal: { chance: 0.4, hp: 1 } },
      fx: { trail: '#e8e0c8', particles: 'wind', spr: { trail: 'uppercut', hit: 'punch_s', kill: 'shine', proc: 'ring_s' } } },
  ],
  hurricane: [
    { id: 'typhoon', tag: A, name: 'Typhoon', color: '#7ac8ff', colors: ['#7ac8ff', '#f0f6ff', '#2276bd'], signature: 'tide',
      desc: 'The storm surges and ebbs: 4s of quick, small gales, then 4s of slow, enormous ones 70% wider and harder.',
      tide: { period: 4 },
      fx: { trail: '#f0f6ff', particles: 'wind', spr: { trail: 'dust', hit: 'hook', kill: 'throw_flash', proc: 'ring_l' } } },
    { id: 'eye_of_the_storm', tag: T, name: 'Eye of the Storm', color: '#d8e8f8', colors: ['#d8e8f8', '#7ac8ff', '#ffffff'], signature: 'erase',
      desc: 'Nothing gets through the wind: each gale blows up to 2 enemy shots out of the sky.',
      erase: { n: 2 }, stats: { damage: 1.1 },
      fx: { trail: '#ffffff', particles: 'wind', spr: { trail: 'dust', hit: 'hook', kill: 'ring_s', proc: 'ring_m' } } },
    { id: 'bleakwind_storm', tag: W, name: 'Bleakwind Storm', color: '#9ad8f4', colors: ['#9ad8f4', '#eaffff', '#4a9fd0'], signature: 'freezeAfter',
      desc: 'A freezing wind: it chills everything it touches, and a foe chilled three times freezes solid for 2s and shatters if it dies.',
      hit: { slow: 0.35, slowT: 2 }, freezeAfter: { n: 3, t: 2, shards: 5 },
      stats: { damage: 1.25 },
      fx: { trail: '#eaffff', particles: 'snow', spr: { trail: 'sparkle', hit: 'freeze_s', kill: 'freeze', proc: 'ring_l' } } },
  ],

  // ============================================================================================
  // GHOST
  // ============================================================================================
  pulse_aura: [
    { id: 'haunting_aura', tag: A, name: 'Haunting Aura', color: '#c8bcf0', colors: ['#c8bcf0', '#8a72b8', '#ffffff'], signature: 'soul',
      desc: 'The aura feeds on the dead: every kill makes it 0.25% stronger for the rest of the run, up to +100%.',
      soul: { per: 0.0025, max: 1 },
      fx: { trail: '#c8bcf0', particles: 'spirit', spr: { hit: 'oval', kill: 'motes', proc: 'guard_ring' } } },
    { id: 'ominous_pulse', tag: T, name: 'Ominous Pulse', color: '#8a72b8', colors: ['#8a72b8', '#c49aff', '#ffffff'], signature: 'nova',
      desc: 'Every 6th pulse rings out much further: a wave from you for 150% that throws foes back.',
      every: { n: 6, nova: { r: 110, dmg: 1.5, knock: 160 } },
      fx: { trail: '#c49aff', particles: 'spirit', spr: { hit: 'oval', kill: 'death_flash', proc: 'ring_l' } } },
    { id: 'soul_drain', tag: W, name: 'Destiny Bond', color: '#ff6a8a', colors: ['#ff6a8a', '#c8bcf0', '#ffffff'], signature: 'bond',
      desc: 'Everything inside the aura shares a fate: up to 6 foes are bonded, and each feels 30% of what any of them takes.',
      bond: { share: 0.3, max: 6 },
      fx: { trail: '#ff6a8a', particles: 'spirit', spr: { hit: 'oval', kill: 'death_flash', proc: 'ring_s' } } },
  ],
  shadow_ball: [
    { id: 'shadow_barrage', tag: A, name: 'Shadow Barrage', color: '#6a4a9a', colors: ['#6a4a9a', '#c49aff', '#ffffff'], signature: 'doom',
      desc: 'Shadow balls plant a darkness that bursts 2.5s later for 20%, even if the victim dies first.',
      doom: { t: 2.5, dmg: 0.2, r: 28 },
      fx: { trail: '#8a72b8', particles: 'shadows', spr: { trail: 'dot', hit: 'oval', kill: 'death_flash', proc: 'guard_ring' } } },
    { id: 'shadow_volley', tag: T, name: 'Phantom Echo', color: '#4a3a66', colors: ['#4a3a66', '#c8bcf0', '#ffffff'], signature: 'echo',
      desc: 'Every ball is thrown again by a phantom of you 0.4s later from where you stood, at 65%.',
      echo: { delay: 0.4, dmg: 0.65 },
      fx: { trail: '#c8bcf0', particles: 'shadows', spr: { trail: 'dot', hit: 'oval', kill: 'hash', proc: 'ring_s' } } },
    { id: 'spectral_burst', tag: W, name: 'Spectral Burst', color: '#9af0d8', colors: ['#9af0d8', '#c8bcf0', '#7ac8ff'], signature: 'wisps',
      desc: 'Every kill frees 3 spirits that hunt down the nearest foes for 60% each.',
      kill: { wisps: { n: 3, dmg: 0.6 } },
      fx: { cycle: ['#9af0d8', '#c8bcf0', '#7ac8ff'], trail: '#9af0d8', particles: 'spirit', spr: { trail: 'motes', hit: 'oval', kill: 'death_flash', proc: 'ring_m' } } },
  ],
  hex_lantern: [
    { id: 'lantern_parade', tag: A, name: 'Lantern Parade', color: '#9af0d8', colors: ['#9af0d8', '#ffd166', '#ffffff'], signature: 'erase',
      desc: 'The lanterns burn away whatever is fired at you: each one snuffs out up to 2 enemy shots.',
      erase: { n: 2 },
      stats: { damage: 1.2 },
      fx: { trail: '#9af0d8', particles: 'spirit', spr: { hit: 'oval', kill: 'motes', proc: 'guard_break' } } },
    { id: 'will_o_lanterns', tag: T, name: 'Will-o-Lanterns', color: '#7ac8ff', colors: ['#7ac8ff', '#9af0d8', '#ffffff'], signature: 'pulse',
      desc: 'The lanterns swing out and back like censers, out to 160% of their circle twice a second.',
      orbit: { pulse: 0.6, pulseFreq: 2 },
      fx: { trail: '#7ac8ff', particles: 'spirit', spr: { hit: 'oval', kill: 'ring_s', proc: 'ring_m' } } },
    { id: 'hex', tag: W, name: 'Hex', color: '#d0b0ff', colors: ['#d0b0ff', '#ff6bb0', '#8a72b8'], signature: 'markCurse',
      desc: 'Lantern light hexes: hexed foes take 35% more from everything for 3s, and burning or poisoned ones take 60% more from the lanterns.',
      hit: { mark: { mul: 0.35, t: 3 }, vsBurn: 0.6 },
      fx: { cycle: ['#d0b0ff', '#ff6bb0', '#8a72b8'], trail: '#d0b0ff', particles: 'spirit', spr: { hit: 'hash', kill: 'death_flash', proc: 'guard_ring' } } },
  ],
  phantom_force: [
    { id: 'shadow_force', tag: A, name: 'Shadow Force', color: '#4a3a66', colors: ['#4a3a66', '#8a72b8', '#ffffff'], signature: 'stillness',
      desc: 'Vanish and wait: stand still and the phantom gathers up to 120% more force; move and it fades.',
      stillness: { max: 1.2, rise: 0.8 },
      fx: { trail: '#8a72b8', particles: 'shadows', spr: { hit: 'oval', kill: 'death_flash', proc: 'beam_flash' } } },
    { id: 'poltergeist_rain', tag: T, name: 'Poltergeist Rain', color: '#9af0d8', colors: ['#9af0d8', '#c8bcf0', '#ffffff'], signature: 'gamble',
      desc: 'Poltergeists play games: a 25% chance each fall comes down twice, and a 4% chance it rains five times.',
      gamble: { twice: 0.25, five: 0.04 },
      fx: { trail: '#9af0d8', particles: 'spirit', spr: { hit: 'oval', kill: 'motes', proc: 'flash_burst' } } },
    { id: 'curse_of_the_fallen', tag: W, name: 'Curse of the Fallen', color: '#ff4a6a', colors: ['#ff4a6a', '#4a3a66', '#ffffff'], signature: 'execute',
      desc: 'The fallen drag the weak down with them: anything under 15% health is taken, and each one taken curses 2 more.',
      hit: { execute: 0.15 }, kill: { chain: { n: 2, dmg: 0.7, range: 100 } },
      fx: { trail: '#ff6a8a', particles: 'shadows', spr: { hit: 'hash', kill: 'death_flash', proc: 'oval' } } },
  ],
  soul_link: [
    { id: 'soul_chain', tag: A, name: 'Soul Chain', color: '#c8bcf0', colors: ['#c8bcf0', '#9af0d8', '#ffffff'], signature: 'link',
      desc: 'The link reaches 2 more souls at once.',
      link: { targets: 2 },
      fx: { trail: '#c8bcf0', particles: 'spirit', spr: { hit: 'oval', kill: 'motes', proc: 'ring_s' } } },
    { id: 'spirit_web', tag: T, name: 'Spirit Web', color: '#9af0d8', colors: ['#9af0d8', '#c8bcf0', '#7ac8ff'], signature: 'bond',
      desc: 'Linked souls stay bound: up to 5 share 35% of every blow any of them takes.',
      bond: { share: 0.35, max: 5 },
      fx: { cycle: ['#9af0d8', '#c8bcf0', '#7ac8ff'], trail: '#9af0d8', particles: 'spirit', spr: { hit: 'oval', kill: 'death_flash', proc: 'ring_m' } } },
    { id: 'life_drain', tag: W, name: 'Life Drain', color: '#ff6a8a', colors: ['#ff6a8a', '#7fe08a', '#ffffff'], signature: 'leech',
      desc: 'The link drinks: 12% of its hits heal you 1, and each soul it takes heals you 2.',
      hit: { leech: { chance: 0.12, hp: 1 } }, kill: { heal: { chance: 1, hp: 2 } },
      fx: { trail: '#ff6a8a', particles: 'spirit', spr: { hit: 'motes', kill: 'shine', proc: 'ring_s' } } },
  ],
  grudge: [
    { id: 'deep_grudge', tag: A, name: 'Deep Grudge', color: '#6a4a9a', colors: ['#6a4a9a', '#ff4a6a', '#ffffff'], signature: 'contagion',
      desc: 'A grudge outlives its target: when a foe it hurt dies, everything on it spreads to up to 5 neighbours.',
      hit: { weaken: 3, mark: { mul: 0.2, t: 3 } }, contagion: { r: 80, n: 5 },
      fx: { trail: '#8a72b8', particles: 'shadows', spr: { hit: 'hash', kill: 'death_flash', proc: 'motes' } } },
    { id: 'grudge_bloom', tag: T, name: 'Grudge Bloom', color: '#c8bcf0', colors: ['#c8bcf0', '#8a72b8', '#ffffff'], signature: 'split',
      desc: 'Each grudge bursts into 5 homing spirits at 45% when it goes off.',
      expire: { split: { n: 5, dmg: 0.45, homing: true } },
      fx: { trail: '#c8bcf0', particles: 'spirit', spr: { hit: 'oval', kill: 'motes', proc: 'death_flash' } } },
    { id: 'destiny_bond', tag: W, name: 'Perish Song', color: '#ff4a6a', colors: ['#ff4a6a', '#c49aff', '#ffffff'], signature: 'doom',
      desc: 'The grudge sings: everything it touches carries a countdown that kills with a 160% burst 3.5s later.',
      doom: { t: 3.5, dmg: 1.6, r: 28 },
      fx: { trail: '#ff6a8a', particles: 'shadows', spr: { hit: 'notes', kill: 'death_flash', proc: 'guard_ring' } } },
  ],

  // ============================================================================================
  // POISON
  // ============================================================================================
  toxic_trail: [
    { id: 'toxic_smog', tag: A, name: 'Toxic Smog', color: '#9a5ab0', colors: ['#9a5ab0', '#c070e0', '#7fe08a'], signature: 'contagion',
      desc: 'The smog is catching: when a poisoned foe dies, its poison and everything else on it spreads to up to 4 around it.',
      hit: { burn: 0.25, burnT: 4, toxic: true }, contagion: { r: 70, n: 4 },
      fx: { trail: '#c070e0', particles: 'toxic', spr: { hit: 'gibs', kill: 'dust', proc: 'motes' } } },
    { id: 'venom_wake', tag: T, name: 'Venom Wake', color: '#7fe08a', colors: ['#7fe08a', '#c070e0', '#ffffff'], signature: 'soul',
      desc: 'The trail thickens on what it kills: every kill makes it 0.2% stronger for the run, up to +80%.',
      soul: { per: 0.002, max: 0.8 },
      fx: { trail: '#7fe08a', particles: 'toxic', spr: { hit: 'gibs', kill: 'motes', proc: 'ring_s' } } },
    { id: 'badly_poisoned', tag: W, name: 'Badly Poisoned', color: '#c070e0', colors: ['#c070e0', '#e8b0f8', '#ff4a6a'], signature: 'doom',
      desc: 'Toxin that builds to a crisis: anything the trail touches collapses 3s later in a 130% burst of poison.',
      doom: { t: 3, dmg: 1.3, r: 28 },
      fx: { trail: '#e8b0f8', particles: 'toxic', spr: { hit: 'gibs', kill: 'boom_s', proc: 'boom' } } },
  ],
  sludge_bomb: [
    { id: 'sludge_wave', tag: A, name: 'Sludge Wave', color: '#9a5ab0', colors: ['#9a5ab0', '#7fe08a', '#ffffff'], signature: 'warp',
      desc: 'Sludge so thick time drags in it: 30% of its kills leave a 3s bog where foes and their shots barely move.',
      warp: { r: 40, t: 3, slow: 0.7, chance: 0.3 },
      fx: { trail: '#c070e0', particles: 'toxic', spr: { hit: 'gibs', kill: 'ring_l', proc: 'motes' } } },
    { id: 'gunk_rain', tag: T, name: 'Gunk Rain', color: '#7fe08a', colors: ['#7fe08a', '#c070e0', '#ffffff'], signature: 'gamble',
      desc: 'The bombs come down in clumps: a 25% chance of two at once, and a 5% chance of five.',
      gamble: { twice: 0.25, five: 0.05 },
      fx: { trail: '#7fe08a', particles: 'toxic', spr: { hit: 'gibs', kill: 'boom_s', proc: 'flash_burst' } } },
    { id: 'toxic', tag: W, name: 'Toxic', color: '#c070e0', colors: ['#c070e0', '#e8b0f8', '#7fe08a'], signature: 'stacks',
      desc: 'Toxin accumulates: the 4th dose in one foe ruptures it for 95% damage, poisoning the splash.',
      stacks: { n: 4, dmg: 0.95, r: 30 }, hit: { burn: 0.2, burnT: 3, toxic: true },
      fx: { trail: '#e8b0f8', particles: 'toxic', spr: { hit: 'gibs', kill: 'boom_s', proc: 'boom' } } },
  ],
  acid_spray: [
    { id: 'acid_torrent', tag: A, name: 'Acid Torrent', color: '#a8d830', colors: ['#a8d830', '#e8f8b0', '#ffffff'], signature: 'wake',
      desc: 'The spray eats into the floor: every jet leaves a line of acid that burns 30% a second and slows by 25%.',
      wake: { every: 0.1, r: 12, life: 1.6, dps: 0.3, slow: 0.25, color: '#a8d830' },
      fx: { trail: '#e8f8b0', particles: 'toxic', spr: { trail: 'gibs', hit: 'boom_s', kill: 'dust', proc: 'ring_s' } } },
    { id: 'acid_ring', tag: T, name: 'Acid Ring', color: '#c8e860', colors: ['#c8e860', '#a8d830', '#ffffff'], signature: 'ring',
      desc: 'Sprays acid in every direction at once.',
      pattern: 'ring', stats: { damage: 1 },
      fx: { trail: '#e8f8b0', particles: 'toxic', spr: { trail: 'gibs', hit: 'boom_s', kill: 'dust', proc: 'ring_m' } } },
    { id: 'corrode', tag: W, name: 'Corrode', color: '#88b020', colors: ['#88b020', '#ffd166', '#ffffff'], signature: 'thief',
      desc: 'Acid eats through armour and purses alike: hits weaken foes for 3s, and 7% knock coins loose.',
      hit: { weaken: 3 }, thief: { chance: 0.07 },
      fx: { trail: '#c8e860', particles: 'toxic', spr: { trail: 'gibs', hit: 'boom_s', kill: 'star3', proc: 'shine' } } },
  ],
  toxic_spikes: [
    { id: 'barbed_field', tag: A, name: 'Barbed Field', color: '#9a5ab0', colors: ['#9a5ab0', '#c070e0', '#ffffff'], signature: 'guard',
      desc: 'The spikes form a hedge: every 22 foes they kill gives you a shield that blocks the next hit.',
      guard: { kills: 22 },
      fx: { trail: '#c070e0', particles: 'toxic', spr: { hit: 'gibs', kill: 'dust', proc: 'guard_ring' } } },
    { id: 'barb_burst', tag: T, name: 'Barb Burst', color: '#e8b0f8', colors: ['#e8b0f8', '#c070e0', '#ffffff'], signature: 'burst',
      desc: 'Every 5th spin flings 8 barbs outward at 60% damage.',
      every: { n: 5, burst: { n: 8, dmg: 0.6 } },
      fx: { trail: '#e8b0f8', particles: 'toxic', spr: { hit: 'gibs', kill: 'boom_s', proc: 'ring_m' } } },
    { id: 'toxic_barbs', tag: W, name: 'Toxic Barbs', color: '#c070e0', colors: ['#c070e0', '#7fe08a', '#e8b0f8'], signature: 'toxic',
      desc: 'Barbs badly poison what they prick: 35% a second for 4s.',
      hit: { burn: 0.35, burnT: 4, toxic: true },
      fx: { trail: '#7fe08a', particles: 'toxic', spr: { hit: 'gibs', kill: 'boom_s', proc: 'boom' } } },
  ],
  venoshock: [
    { id: 'venom_burst', tag: A, name: 'Venom Burst', color: '#c070e0', colors: ['#c070e0', '#e8b0f8', '#7fe08a'], signature: 'vsBurn',
      desc: 'Venoshock hits poisoned foes twice as hard (+100%), and its own hits poison for 3s.',
      hit: { vsBurn: 1, burn: 0.2, burnT: 3, toxic: true },
      fx: { trail: '#e8b0f8', particles: 'toxic', spr: { trail: 'gibs', hit: 'boom_s', kill: 'boom', proc: 'ring_s' } } },
    { id: 'venom_spray', tag: T, name: 'Venom Ricochet', color: '#9a5ab0', colors: ['#9a5ab0', '#c070e0', '#ffffff'], signature: 'ricochet',
      desc: 'The orb skips from foe to foe: up to 4 extra ricochets to targets it has not hit.',
      ricochet: { n: 4 },
      stats: { damage: 1.1 },
      fx: { trail: '#c070e0', particles: 'toxic', spr: { trail: 'gibs', hit: 'boom_s', kill: 'dust', proc: 'flash_burst' } } },
    { id: 'venoshock_true', tag: W, name: 'Venoshock', color: '#7fe08a', colors: ['#7fe08a', '#c070e0', '#ffffff'], signature: 'polarity',
      desc: 'Acid and base: orbs alternate charge, and a foe hit by both within 2s reacts violently for 65%.',
      polarity: { dmg: 0.65, r: 30 },
      fx: { trail: '#7fe08a', particles: 'toxic', spr: { trail: 'gibs', hit: 'boom_s', kill: 'boom', proc: 'beam_boom' } } },
  ],
  acid_pod: [
    { id: 'acid_cannon', tag: A, name: 'Acid Cannon', color: '#a8d830', colors: ['#a8d830', '#ffffff', '#c070e0'], signature: 'accel',
      desc: 'Acid slugs that keep accelerating: up to 180% harder at the end of their range.',
      accel: { max: 1.8 },
      fx: { trail: '#e8f8b0', particles: 'toxic', spr: { trail: 'gibs', hit: 'boom_s', kill: 'boom', proc: 'ring_s' } } },
    { id: 'corrosive_mist', tag: T, name: 'Corrosive Mist', color: '#c8e860', colors: ['#c8e860', '#a8d830', '#ffffff'], signature: 'mine',
      desc: 'Shots that miss hang in the air as acid clouds for 6s, bursting for 120% on whatever wanders in.',
      mine: { r: 26, dmg: 1.2, life: 6, chance: 1 },
      fx: { trail: '#e8f8b0', particles: 'toxic', spr: { trail: 'gibs', hit: 'boom_s', kill: 'dust', proc: 'boom' } } },
    { id: 'toxic_pod', tag: W, name: 'Toxic Pod', color: '#9a5ab0', colors: ['#9a5ab0', '#c070e0', '#7fe08a'], signature: 'rod',
      desc: 'The pod spits a venom lance every 5s at the toughest foe in range, for 120% damage.',
      rod: { every: 5, dmg: 1.2, n: 1 },
      fx: { trail: '#c070e0', particles: 'toxic', spr: { hit: 'gibs', kill: 'boom_s', proc: 'boom' } } },
  ],
  // ============================================================================================
  // FIRE
  // ============================================================================================
  ember_spit: [
    { id: 'flame_burst', tag: A, name: 'Flame Burst', color: '#ff7a1a', colors: ['#ff7a1a', '#ffd870', '#ffffff'], signature: 'heat',
      desc: 'The embers run hotter with every spit. The 8th is an OVERHEAT: 12 fireballs all round you and a 120% blast, then 2s to cool.',
      heat: { max: 8, dmg: 1.2, n: 12, vent: 2 },
      fx: { trail: '#ffb347', particles: 'embers', spr: { trail: 'spin_oval', hit: 'boom_tiny', kill: 'boom_fire', proc: 'beam_boom' } } },
    { id: 'fire_spin_spiral', tag: T, name: 'Fire Spin', color: '#ff9040', colors: ['#ff9040', '#ffd870', '#ff5a1a'], signature: 'wake',
      desc: 'Embers leave a line of fire across the ground behind them, burning 14% a second for what walks through.',
      wake: { every: 0.11, r: 12, life: 1.8, dps: 0.08, burn: 0.06, color: '#ff7a1a' },
      fx: { trail: '#ffd870', particles: 'embers', spr: { trail: 'cannon', hit: 'boom_tiny', kill: 'boom_fire', proc: 'boom_s' } } },
    { id: 'inferno', tag: W, name: 'Blaze', color: '#ff5a1a', colors: ['#ff5a1a', '#ffd870', '#ff9040'], signature: 'pinch',
      desc: 'Blaze: below 50% health the embers burn white-hot, 100% stronger and 30% faster, and every hit sets foes alight.',
      pinch: { at: 0.5, dmg: 2, cd: 0.7 }, hit: { burn: 0.25, burnT: 3 },
      fx: { cycle: ['#ff5a1a', '#ffd870', '#ff9040'], trail: '#ffd870', particles: 'embers', spr: { trail: 'spin_oval', hit: 'boom_tiny', kill: 'boom_fire', proc: 'boom' } } },
  ],
  will_o_wisp: [
    { id: 'wisp_cloud', tag: A, name: 'Wisp Cloud', color: '#7ac8ff', colors: ['#7ac8ff', '#c8bcf0', '#ffffff'], signature: 'magnet',
      desc: 'Wisps are curious: every XP orb and coin they drift past is carried off to you.',
      magnet: { r: 32 }, stats: { amount: 1 },
      fx: { trail: '#9adcff', particles: 'spirit', spr: { trail: 'motes', hit: 'oval', kill: 'shine', proc: 'ring_s' } } },
    { id: 'phantom_flames', tag: T, name: 'Phantom Flames', color: '#6a8aff', colors: ['#6a8aff', '#c49aff', '#ffffff'], signature: 'orbitOut',
      desc: 'Wisps that burn out return to circle you for 3s as a ring of ghost-fire.',
      orbitOut: { t: 3, r: 30, dmg: 0.7 },
      fx: { trail: '#c49aff', particles: 'spirit', spr: { trail: 'motes', hit: 'oval', kill: 'death_flash', proc: 'ring_m' } } },
    { id: 'mystical_fire', tag: W, name: 'Mystical Fire', color: '#ff6bb0', colors: ['#ff6bb0', '#c49aff', '#ff9ad8'], signature: 'charm',
      desc: 'Fire that bewitches: 1.5% of burned foes are charmed for 4s and fight for you at double their bite; all are burned.',
      charm: { chance: 0.015, t: 4, dmg: 2 }, hit: { burn: 0.25, burnT: 3 },
      stats: { damage: 1.1 },
      fx: { cycle: ['#ff6bb0', '#c49aff', '#ff9ad8'], trail: '#ff9ad8', particles: 'petals', spr: { trail: 'motes', hit: 'pink_flash', kill: 'shine', proc: 'notes' } } },
  ],
  heat_wave: [
    { id: 'eruption', tag: A, name: 'Eruption', color: '#ff5a1a', colors: ['#ff5a1a', '#ffd870', '#ffffff'], signature: 'momentum',
      desc: 'The wave rides your speed: run and it grows up to 80% stronger; stand still and it cools.',
      momentum: { max: 0.8, rise: 0.45 },
      fx: { trail: '#ffd870', particles: 'embers', spr: { hit: 'boom_tiny', kill: 'boom_fire', proc: 'ring_l' } } },
    { id: 'heat_pulses', tag: T, name: 'Heat Pulses', color: '#ff9040', colors: ['#ff9040', '#ffd870', '#ff5a1a'], signature: 'echo',
      desc: 'Every wave is followed by a second 0.4s later from where you were, at 70%.',
      echo: { delay: 0.4, dmg: 0.7 },
      fx: { trail: '#ffd870', particles: 'embers', spr: { hit: 'boom_tiny', kill: 'boom_s', proc: 'ring_m' } } },
    { id: 'scorching_sands', tag: W, name: 'Scorching Sands', color: '#e0a050', colors: ['#e0a050', '#ff7a1a', '#ffffff'], signature: 'doom',
      desc: 'Searing heat that cooks from inside: every foe the wave catches erupts 2.5s later for 20%, even if it dies first.',
      doom: { t: 2.5, dmg: 0.2, r: 26 },
      fx: { trail: '#ffd870', particles: 'sand', spr: { hit: 'boom_tiny', kill: 'boom_fire', proc: 'boom' } } },
  ],
  magma_pool: [
    { id: 'magma_storm', tag: A, name: 'Magma Storm', color: '#f08828', colors: ['#f08828', '#ffd870', '#ff5a1a'], signature: 'soul',
      desc: 'The magma swells with every kill: +0.225% damage for the rest of the run per foe it melts, up to +90%.',
      soul: { per: 0.00225, max: 0.9 },
      fx: { trail: '#ffd870', particles: 'embers', spr: { hit: 'lava', kill: 'boom_fire', proc: 'boom' } } },
    { id: 'lava_plume', tag: T, name: 'Lava Plume', color: '#ff5a1a', colors: ['#ff5a1a', '#ffd870', '#ffffff'], signature: 'split',
      desc: 'Each pool erupts as it cools, flinging 6 lava bombs outward at 45% damage.',
      expire: { split: { n: 6, dmg: 0.45 } },
      fx: { trail: '#ffd870', particles: 'embers', spr: { hit: 'lava', kill: 'boom_fire', proc: 'beam_boom' } } },
    { id: 'molten_ground', tag: W, name: 'Molten Ground', color: '#d04010', colors: ['#d04010', '#ff9040', '#ffd870'], signature: 'warp',
      desc: 'Magma so thick it traps: 25% of its kills leave a 3s pocket where foes are mired and enemy shots crawl.',
      warp: { r: 40, t: 3, slow: 0.7, chance: 0.25 },
      fx: { trail: '#ff9040', particles: 'embers', spr: { hit: 'lava', kill: 'ring_l', proc: 'motes' } } },
  ],
  meteor_fall: [
    { id: 'meteor_strike', tag: A, name: 'Meteor Strike', color: '#ff7a1a', colors: ['#ff7a1a', '#ffd870', '#ffffff'], signature: 'overkill',
      desc: 'A meteor that does not stop at one: all the damage left after a kill smashes on into the nearest foe.',
      overkill: { share: 1, range: 130 },
      fx: { trail: '#ffd870', particles: 'embers', spr: { hit: 'boom_tiny', kill: 'boom_fire', proc: 'beam_boom' } } },
    { id: 'meteor_shower', tag: T, name: 'Meteor Shower', color: '#ffd870', colors: ['#ffd870', '#ff9040', '#ffffff'], signature: 'gamble',
      desc: 'Space is unpredictable: a 25% chance each fall brings two meteors, and a 5% chance a shower of five.',
      gamble: { twice: 0.25, five: 0.05 },
      fx: { trail: '#ffd870', particles: 'stars', spr: { hit: 'boom_tiny', kill: 'boom_fire', proc: 'flash_burst' } } },
    { id: 'supernova', tag: W, name: 'Supernova', color: '#fff0a0', colors: ['#fff0a0', '#ff9040', '#ff5a1a'], signature: 'kill_explode',
      desc: 'Whatever a meteor kills goes supernova: a 44px blast for 120% that sets everything in it ablaze.',
      kill: { explode: { r: 44, dmg: 1.2 } }, hit: { burn: 0.2, burnT: 3 },
      fx: { cycle: ['#fff0a0', '#ff9040', '#ff5a1a'], trail: '#fff0a0', particles: 'embers', spr: { hit: 'boom_tiny', kill: 'beam_boom', proc: 'boom' } } },
  ],
  blaze_trail: [
    { id: 'inferno_trail', tag: A, name: 'Inferno Trail', color: '#ff5a1a', colors: ['#ff5a1a', '#ffd870', '#ffffff'], signature: 'haste',
      desc: 'Fire at your heels: each kill in the trail gives 1.5s of 30% faster movement to lay more.',
      haste: { t: 1.5, mul: 1.3 }, zone: { r: 1.15 },
      fx: { trail: '#ffd870', particles: 'embers', spr: { hit: 'boom_tiny', kill: 'boom_fire', proc: 'ring_m' } } },
    { id: 'flame_wheel', tag: T, name: 'Flame Wheel', color: '#ff9040', colors: ['#ff9040', '#ffd870', '#ff5a1a'], signature: 'nova',
      desc: 'Every 6th patch erupts as a wheel of fire out from you: 150% damage, and everything in it burns.',
      every: { n: 6, nova: { r: 90, dmg: 1.5, burn: 0.3 } },
      fx: { trail: '#ffd870', particles: 'embers', spr: { hit: 'boom_tiny', kill: 'boom_fire', proc: 'ring_l' } } },
    { id: 'burn_up', tag: W, name: 'Burn Up', color: '#ffd870', colors: ['#ffd870', '#ff5a1a', '#ffffff'], signature: 'contagion',
      desc: 'A fire that spreads itself: when a burning foe dies, its flames leap to up to 4 neighbours.',
      hit: { burn: 0.3, burnT: 3 }, contagion: { r: 70, n: 4 },
      fx: { trail: '#ff9040', particles: 'embers', spr: { hit: 'boom_tiny', kill: 'boom_fire', proc: 'motes' } } },
  ],

  // ============================================================================================
  // ICE
  // ============================================================================================
  powder_snow: [
    { id: 'blizzard_spray', tag: A, name: 'Blizzard Spray', color: '#dff6ff', colors: ['#dff6ff', '#9ad8f4', '#ffffff'], signature: 'freezeAfter',
      desc: 'Snow that piles up: a foe chilled 4 times freezes solid for 2s, and shatters into 6 shards if it dies frozen.',
      freezeAfter: { n: 4, t: 2, shards: 6 },
      fx: { trail: '#ffffff', particles: 'snow', spr: { trail: 'sparkle', hit: 'freeze_s', kill: 'freeze', proc: 'ring_l' } } },
    { id: 'frost_ring', tag: T, name: 'Frost Ring', color: '#9ad8f4', colors: ['#9ad8f4', '#eaffff', '#4a9fd0'], signature: 'orbitOut',
      desc: 'Spent snowflakes gather round you for 3s as a ring of frost that keeps biting anything close.',
      orbitOut: { t: 3, r: 30, dmg: 0.6 },
      fx: { trail: '#eaffff', particles: 'snow', spr: { trail: 'sparkle', hit: 'freeze_s', kill: 'freeze', proc: 'ring_m' } } },
    { id: 'freeze_dry', tag: W, name: 'Freeze-Dry', color: '#4a9fd0', colors: ['#4a9fd0', '#9ad8f4', '#ffffff'], signature: 'shatter',
      desc: 'Cold that cracks: slowed or frozen foes take 70% more from the spray.',
      hit: { shatter: 0.7, slow: 0.3, slowT: 1.5 },
      fx: { trail: '#9ad8f4', particles: 'frost', spr: { trail: 'sparkle', hit: 'freeze', kill: 'shard', proc: 'ring_s' } } },
  ],
  icicle_crash: [
    { id: 'icicle_spear', tag: A, name: 'Icicle Spear', color: '#9ad8f4', colors: ['#9ad8f4', '#ffffff', '#4a9fd0'], signature: 'snowball',
      desc: 'The icicle grows as it skewers: +12% size and +15% damage for each foe it pierces.',
      snowball: { grow: 0.12, dmg: 0.15, max: 8 },
      fx: { trail: '#eaffff', particles: 'frost', spr: { trail: 'freeze_s', hit: 'freeze', kill: 'shard', proc: 'ring_s' } } },
    { id: 'twin_icicles', tag: T, name: 'Twin Icicles', color: '#eaffff', colors: ['#eaffff', '#9ad8f4', '#ffffff'], signature: 'twin',
      desc: 'Icicles fly front and back at once.',
      pattern: 'twin',
      fx: { trail: '#eaffff', particles: 'frost', spr: { trail: 'freeze_s', hit: 'freeze_s', kill: 'freeze', proc: 'ring_s' } } },
    { id: 'sheer_ice', tag: W, name: 'Ice Mines', color: '#4a9fd0', colors: ['#4a9fd0', '#eaffff', '#ffffff'], signature: 'mine',
      desc: 'Shards that land stay as ice mines for 7s: stepping on one bursts it for 130% and freezes the area.',
      mine: { r: 28, dmg: 1.3, life: 7, chance: 0.6 }, hit: { slow: 0.4, slowT: 1.5 },
      fx: { trail: '#9ad8f4', particles: 'frost', spr: { trail: 'freeze_s', hit: 'freeze', kill: 'shard', proc: 'ring_l' } } },
  ],
  hail_cloud: [
    { id: 'hailstorm', tag: A, name: 'Hailstorm', color: '#eaffff', colors: ['#eaffff', '#9ad8f4', '#ffffff'], signature: 'rod',
      desc: 'The cloud saves its biggest stones for the biggest foes: every 4s a giant hailstone crushes the toughest foe in range for 140%.',
      rod: { every: 4, dmg: 1.4, n: 1 },
      fx: { trail: '#ffffff', particles: 'snow', spr: { hit: 'freeze_s', kill: 'freeze', proc: 'flash_burst' } } },
    { id: 'snow_squall', tag: T, name: 'Snow Squall', color: '#9ad8f4', colors: ['#9ad8f4', '#eaffff', '#7ac8ff'], signature: 'warp',
      desc: 'A squall so cold time slows: a third of its kills freeze the air for 3s, slowing foes 70% and their shots almost to a stop.',
      warp: { r: 44, t: 3, slow: 0.7, chance: 0.33 },
      fx: { trail: '#eaffff', particles: 'snow', spr: { hit: 'freeze_s', kill: 'ring_l', proc: 'sparkle' } } },
    { id: 'freezing_hail', tag: W, name: 'Freezing Hail', color: '#4a9fd0', colors: ['#4a9fd0', '#9ad8f4', '#ffffff'], signature: 'freezeAfter',
      desc: 'Hail that sticks: a foe struck 3 times freezes solid for 2.5s, and shatters if it dies frozen.',
      hit: { slow: 0.35, slowT: 2 }, freezeAfter: { n: 3, t: 2.5, shards: 5 },
      fx: { trail: '#9ad8f4', particles: 'frost', spr: { hit: 'freeze', kill: 'shard', proc: 'ring_m' } } },
  ],
  frost_ricochet: [
    { id: 'frost_comet', tag: A, name: 'Frost Comet', color: '#9ad8f4', colors: ['#9ad8f4', '#ffffff', '#7ac8ff'], signature: 'accel',
      desc: 'The comet gathers speed with every bounce and hits up to 150% harder by the end of its run.',
      accel: { max: 1.5 },
      fx: { trail: '#eaffff', particles: 'frost', spr: { trail: 'sparkle', hit: 'freeze_s', kill: 'freeze', proc: 'ring_s' } } },
    { id: 'twin_comets', tag: T, name: 'Comet Return', color: '#eaffff', colors: ['#eaffff', '#9ad8f4', '#ffffff'], signature: 'boomerang',
      desc: 'After its last bounce the comet arcs back to you, hitting everything again on the way.',
      boomerang: { dmg: 1 },
      fx: { trail: '#ffffff', particles: 'frost', spr: { trail: 'sparkle', hit: 'freeze_s', kill: 'flash_burst', proc: 'ring_s' } } },
    { id: 'ice_shatter', tag: W, name: 'Ice Shatter', color: '#4a9fd0', colors: ['#4a9fd0', '#eaffff', '#ffffff'], signature: 'kill_shards',
      desc: 'Frozen foes shatter: every kill throws 6 ice shards outward at 50% damage.',
      kill: { shards: { n: 6, dmg: 0.5 } },
      fx: { trail: '#9ad8f4', particles: 'frost', spr: { trail: 'sparkle', hit: 'freeze', kill: 'shard', proc: 'freeze' } } },
  ],
  frost_veil: [
    { id: 'glacial_veil', tag: A, name: 'Glacial Veil', color: '#9ad8f4', colors: ['#9ad8f4', '#eaffff', '#ffffff'], signature: 'guard',
      desc: 'The veil hardens: every 20 foes it kills gives you an ice shield that blocks the next hit.',
      guard: { kills: 20 },
      fx: { trail: '#eaffff', particles: 'snow', spr: { hit: 'sparkle', kill: 'freeze', proc: 'guard_ring' } } },
    { id: 'cold_snap', tag: T, name: 'Cold Snap', color: '#eaffff', colors: ['#eaffff', '#9ad8f4', '#ffffff'], signature: 'freezeAfter',
      desc: 'Stay in the veil too long and you freeze: a foe chilled 5 times is frozen solid for 2s.',
      freezeAfter: { n: 5, t: 2, shards: 4 },
      fx: { trail: '#ffffff', particles: 'snow', spr: { hit: 'freeze_s', kill: 'freeze', proc: 'ring_m' } } },
    { id: 'absolute_zero', tag: W, name: 'Absolute Zero', color: '#4a9fd0', colors: ['#4a9fd0', '#eaffff', '#9ad8f4'], signature: 'warp',
      desc: 'Cold enough to stop time: 20% of its kills leave a 3s bubble where foes crawl and enemy shots hang in the air.',
      warp: { r: 46, t: 3, slow: 0.8, chance: 0.2 },
      fx: { cycle: ['#4a9fd0', '#eaffff', '#9ad8f4'], trail: '#eaffff', particles: 'frost', spr: { hit: 'sparkle', kill: 'ring_l', proc: 'freeze' } } },
  ],
  frost_chain: [
    { id: 'glacier_chain', tag: A, name: 'Glacier Chain', color: '#9ad8f4', colors: ['#9ad8f4', '#ffffff', '#4a9fd0'], signature: 'overkill',
      desc: 'Cold that keeps going: damage past a kill runs on down the chain into the nearest foe.',
      overkill: { share: 1, range: 110 },
      fx: { trail: '#eaffff', particles: 'frost', spr: { hit: 'freeze_s', kill: 'freeze', proc: 'ring_s' } } },
    { id: 'crystal_web', tag: T, name: 'Crystal Web', color: '#eaffff', colors: ['#eaffff', '#9ad8f4', '#c49aff'], signature: 'chainFork',
      desc: 'The chain branches: two extra chains of ice at once, each from a different foe.',
      chainFork: 2,
      fx: { cycle: ['#eaffff', '#9ad8f4', '#c49aff'], trail: '#eaffff', particles: 'frost', spr: { hit: 'freeze_s', kill: 'shard', proc: 'ring_m' } } },
    { id: 'freeze_chain', tag: W, name: 'Freeze Chain', color: '#4a9fd0', colors: ['#4a9fd0', '#eaffff', '#ffffff'], signature: 'bond',
      desc: 'The chain freezes its links together: up to 5 foes share 30% of everything any of them takes.',
      bond: { share: 0.3, max: 5 },
      fx: { trail: '#9ad8f4', particles: 'frost', spr: { hit: 'freeze_s', kill: 'freeze', proc: 'ring_s' } } },
  ],

  // ============================================================================================
  // EVOLVED WEAPONS
  // ============================================================================================
  quagmire: [
    { id: 'swamp_of_ages', tag: A, name: 'Swamp of Ages', color: '#7a6040', colors: ['#7a6040', '#c08040', '#ffd8a0'], signature: 'soul',
      desc: 'The swamp grows deeper with every foe it buries: +0.25% damage per kill for the run, up to +100%.',
      soul: { per: 0.0025, max: 1 },
      fx: { trail: '#a06830', particles: 'mud', spr: { trail: 'land_dust', hit: 'dust', kill: 'slide_dust', proc: 'boom' } } },
    { id: 'mud_maelstrom', tag: T, name: 'Mud Maelstrom', color: '#9a6c36', colors: ['#9a6c36', '#d8a868', '#ffffff'], signature: 'gravity',
      desc: 'Every glob is a little maelstrom: it drags foes within 40px along with it as it flies.',
      gravity: { r: 40, pull: 130 },
      fx: { trail: '#d8a868', particles: 'mud', spr: { trail: 'slide_dust', hit: 'dust', kill: 'land_dust', proc: 'ring_m' } } },
    { id: 'sinking_ground', tag: W, name: 'Sinking Ground', color: '#5a4020', colors: ['#5a4020', '#a07840', '#ff9040'], signature: 'mine',
      desc: 'Globs that land open sinkholes for 6s that swallow whatever steps in for 160% damage.',
      mine: { r: 32, dmg: 1.6, life: 6, chance: 1 },
      fx: { trail: '#a07840', particles: 'mud', spr: { trail: 'land_dust', hit: 'dust', kill: 'slide_dust', proc: 'beam_boom' } } },
  ],
  star_barrage: [
    { id: 'galaxy_barrage', tag: A, name: 'Galaxy Barrage', color: '#ffffff', colors: ['#c49aff', '#7ac8ff', '#ffffff'], signature: 'ricochet',
      desc: 'Stars that streak from foe to foe: each one ricochets up to 4 times to targets it has not hit.',
      ricochet: { n: 4 },
      fx: { cycle: ['#c49aff', '#7ac8ff', '#ffffff', '#ff9ad8'], trail: '#c49aff', particles: 'stars', spr: { trail: 'star3', hit: 'shine', kill: 'flash_burst', proc: 'spark_s' } } },
    { id: 'supernova_stars', tag: T, name: 'Supernova Stars', color: '#ffd166', colors: ['#ffd166', '#ff9ad8', '#ffffff'], signature: 'heat',
      desc: 'The stars build to a supernova: the 9th volley bursts into 18 stars all round you and a 260% flash, then 1.2s to rekindle.',
      heat: { max: 9, dmg: 2.6, n: 18, vent: 1.2 },
      fx: { cycle: ['#ffd166', '#ff9ad8', '#c49aff', '#7ac8ff'], trail: '#ffd166', particles: 'stars', spr: { trail: 'star3', hit: 'shine', kill: 'flash_burst', proc: 'beam_boom' } } },
    { id: 'wish_upon_a_star', tag: W, name: 'Wish Upon a Star', color: '#ffffff', colors: ['#ffd166', '#7fe08a', '#c49aff'], signature: 'metronomeLuck',
      desc: 'Every volley grants a random wish (burn, freeze, paralyse, poison, curse, confuse or drain), and 5% of hits knock coins loose.',
      metronome: true, thief: { chance: 0.05 },
      fx: { cycle: ['#ff6b6b', '#ffd166', '#7fe08a', '#7ac8ff', '#c49aff'], trail: '#ffd166', particles: 'stars', spr: { trail: 'star3', hit: 'shine', kill: 'star3', proc: 'ring_m' } } },
  ],
  spirit_shackle: [
    { id: 'soul_spear', tag: A, name: 'Soul Spear', color: '#9af0d8', colors: ['#9af0d8', '#ffffff', '#c8bcf0'], signature: 'accel',
      desc: 'The spear flies faster the further it goes and pierces up to 160% harder at the end of its flight.',
      accel: { max: 1.6 },
      fx: { trail: '#9af0d8', particles: 'spirit', spr: { trail: 'streak', hit: 'oval', kill: 'death_flash', proc: 'ring_s' } } },
    { id: 'shackle_rain', tag: T, name: 'Shackle Echo', color: '#c8bcf0', colors: ['#c8bcf0', '#9af0d8', '#ffffff'], signature: 'echo',
      desc: 'Each shackle is thrown again by your shadow 0.35s later, from where you stood, at 65%.',
      echo: { delay: 0.35, dmg: 0.65 },
      fx: { trail: '#c8bcf0', particles: 'spirit', spr: { trail: 'dot', hit: 'oval', kill: 'motes', proc: 'ring_s' } } },
    { id: 'bound_soul', tag: W, name: 'Bound Soul', color: '#6a4a9a', colors: ['#6a4a9a', '#9af0d8', '#ffffff'], signature: 'bond',
      desc: 'Pinned souls are bound as one: up to 6 share 30% of every hit any of them takes.',
      bond: { share: 0.3, max: 6 },
      fx: { trail: '#9af0d8', particles: 'shadows', spr: { trail: 'dot', hit: 'oval', kill: 'death_flash', proc: 'guard_ring' } } },
  ],
  fire_blast: [
    { id: 'blast_burn', tag: A, name: 'Blast Burn', color: '#ff5a1a', colors: ['#ff5a1a', '#ffd870', '#ffffff'], signature: 'doom',
      desc: 'Blast Burn sears to the core: whatever it hits erupts 2.5s later for 60%, even after death.',
      doom: { t: 2.5, dmg: 0.6, r: 28 },
      fx: { trail: '#ffd870', particles: 'embers', spr: { trail: 'spin_oval', hit: 'boom_tiny', kill: 'boom_fire', proc: 'beam_boom' } } },
    { id: 'fire_wheel', tag: T, name: 'Fire Wheel', color: '#ff9040', colors: ['#ff9040', '#ffd870', '#ff5a1a'], signature: 'boomerang',
      desc: 'Every blast rolls back to you like a wheel of fire, burning through everything twice.',
      boomerang: { dmg: 1 }, hit: { burn: 0.2, burnT: 2 },
      fx: { trail: '#ffd870', particles: 'embers', spr: { trail: 'cannon', hit: 'boom_tiny', kill: 'boom_fire', proc: 'ring_m' } } },
    { id: 'sacred_fire', tag: W, name: 'Sacred Fire', color: '#ffd166', colors: ['#ff5a1a', '#ffd166', '#7ac8ff'], signature: 'contagion',
      desc: 'A rainbow flame that never dies: burned foes pass the fire on to 5 neighbours when they fall.',
      hit: { burn: 0.4, burnT: 3 }, contagion: { r: 80, n: 5 },
      fx: { cycle: ['#ff5a1a', '#ffd166', '#7fe08a', '#7ac8ff', '#ff9ad8'], trail: '#ffd166', particles: 'embers', spr: { trail: 'spin_oval', hit: 'boom_tiny', kill: 'boom_fire', proc: 'motes' } } },
  ],
  sheer_cold: [
    { id: 'glaciate', tag: A, name: 'Glaciate', color: '#9ad8f4', colors: ['#9ad8f4', '#eaffff', '#ffffff'], signature: 'freezeAfter',
      desc: 'A wave of ice: foes chilled 3 times freeze solid for 3s, and shatter into 8 shards if they die frozen.',
      freezeAfter: { n: 3, t: 3, shards: 8 },
      fx: { trail: '#eaffff', particles: 'snow', spr: { trail: 'sparkle', hit: 'freeze_s', kill: 'freeze', proc: 'ring_l' } } },
    { id: 'frozen_halo', tag: T, name: 'Frozen Halo', color: '#eaffff', colors: ['#eaffff', '#9ad8f4', '#ffffff'], signature: 'erase',
      desc: 'The cold freezes enemy shots in the air: each blast destroys up to 3 of them.',
      erase: { n: 3 }, stats: { damage: 1.1 },
      fx: { trail: '#ffffff', particles: 'snow', spr: { trail: 'sparkle', hit: 'freeze_s', kill: 'ring_s', proc: 'freeze' } } },
    { id: 'instant_freeze', tag: W, name: 'Instant Freeze', color: '#4a9fd0', colors: ['#4a9fd0', '#eaffff', '#ff4a6a'], signature: 'execute',
      desc: 'Sheer Cold, the one-hit KO: anything under 20% health freezes and dies outright.',
      hit: { execute: 0.2 },
      fx: { trail: '#9ad8f4', particles: 'frost', spr: { trail: 'sparkle', hit: 'freeze', kill: 'shard', proc: 'ring_m' } } },
  ],
  gunk_shot: [
    { id: 'toxic_deluge', tag: A, name: 'Toxic Deluge', color: '#9a5ab0', colors: ['#9a5ab0', '#c070e0', '#7fe08a'], signature: 'echo',
      desc: 'Gunk keeps coming: every shot is repeated 0.4s later from where you stood, at 70%.',
      echo: { delay: 0.4, dmg: 0.7 },
      fx: { trail: '#c070e0', particles: 'toxic', spr: { hit: 'gibs', kill: 'boom_s', proc: 'ring_s' } } },
    { id: 'gunk_geyser', tag: T, name: 'Gunk Geyser', color: '#7fe08a', colors: ['#7fe08a', '#c070e0', '#ffffff'], signature: 'split',
      desc: 'Every gunk mine erupts into 6 homing globs at 45% when it goes off.',
      expire: { split: { n: 6, dmg: 0.45, homing: true } },
      fx: { trail: '#7fe08a', particles: 'toxic', spr: { hit: 'gibs', kill: 'boom_s', proc: 'boom' } } },
    { id: 'noxious', tag: W, name: 'Noxious', color: '#c070e0', colors: ['#7fe08a', '#c070e0', '#e8b0f8'], signature: 'stacks',
      desc: 'Toxin that compounds: the 3rd dose in one foe ruptures it for 250%, poisoning everything nearby.',
      stacks: { n: 3, dmg: 2.5, r: 32 }, hit: { burn: 0.25, burnT: 3, toxic: true },
      fx: { cycle: ['#7fe08a', '#c070e0', '#e8b0f8'], trail: '#e8b0f8', particles: 'toxic', spr: { hit: 'gibs', kill: 'boom', proc: 'beam_boom' } } },
  ],
  hydro_cannon: [
    { id: 'hydro_vortex', tag: A, name: 'Hydro Vortex', color: '#2276bd', colors: ['#2276bd', '#7af0e8', '#ffffff'], signature: 'vortex',
      desc: 'Every 5th blast opens a whirlpool on the nearest foe: it drags everything in for 2s, then crashes for 200%.',
      every: { n: 5, vortex: { r: 46, life: 2, pull: 170, dmg: 0.3, boom: 2 } },
      fx: { trail: '#7af0e8', particles: 'bubbles', spr: { trail: 'gibs', hit: 'ring_s', kill: 'flash_burst', proc: 'ring_l' } } },
    { id: 'origin_pulse', tag: T, name: 'Origin Pulse', color: '#2276bd', colors: ['#2276bd', '#7af0e8', '#ffffff'], signature: 'tide',
      desc: 'The primal sea: 4s of rapid, light shots (FLOW), then 4s of slow, enormous blasts 70% wider and harder (EBB).',
      tide: { period: 4 },
      fx: { cycle: ['#2276bd', '#7af0e8', '#ffffff'], trail: '#7af0e8', particles: 'bubbles', spr: { trail: 'oval', hit: 'ring_s', kill: 'ring_m', proc: 'ring_l' } } },
    { id: 'waterfall', tag: W, name: 'Waterfall', color: '#5ab6ef', colors: ['#5ab6ef', '#eaffff', '#ffffff'], signature: 'erase',
      desc: 'A wall of falling water: every blast washes away up to 3 enemy shots in its path.',
      erase: { n: 3 }, stats: { damage: 1.15 },
      fx: { trail: '#eaffff', particles: 'bubbles', spr: { trail: 'gibs', hit: 'ring_s', kill: 'flash_burst', proc: 'guard_break' } } },
  ],
  thunder_storm: [
    { id: 'bolt_strike', tag: A, name: 'Bolt Strike', color: '#fff6a0', colors: ['#fff6a0', '#ffffff', '#f8e038'], signature: 'rod',
      desc: 'The storm hunts the strong: every 2.5s a bolt hits the 3 toughest foes near you for 260%.',
      rod: { every: 2.5, dmg: 2.6, n: 3 },
      fx: { trail: '#fff6a0', particles: 'sparks', spr: { hit: 'spark_s', kill: 'spark', proc: 'spark_line' } } },
    { id: 'storm_fork', tag: T, name: 'Storm Fork', color: '#c49aff', colors: ['#c49aff', '#fff6a0', '#ffffff'], signature: 'chainFork',
      desc: 'The storm forks three ways: three extra chains at once.',
      chainFork: 3,
      fx: { cycle: ['#fff6a0', '#c49aff', '#ffffff'], trail: '#c49aff', particles: 'sparks', spr: { hit: 'spark_s', kill: 'spark_line', proc: 'lightning' } } },
    { id: 'zap_cannon', tag: W, name: 'Zap Cannon', color: '#f8e038', colors: ['#f8e038', '#ff7a1a', '#ffffff'], signature: 'heat',
      desc: 'Charge builds with every chain. At the 6th it fires the ZAP CANNON: 14 bolts all round you and a 300% shock, then 1.2s to recharge.',
      heat: { max: 6, dmg: 3, n: 14, vent: 1.2 },
      fx: { trail: '#fff6a0', particles: 'sparks', spr: { hit: 'spark_s', kill: 'spark', proc: 'lightning' } } },
  ],
  night_slash: [
    { id: 'darkest_lariat', tag: A, name: 'Darkest Lariat', color: '#4a3a66', colors: ['#4a3a66', '#ff4a6a', '#ffffff'], signature: 'critBurst',
      desc: 'A critical slash tears 6 blades of darkness loose from its victim at 55% damage.',
      critBurst: { n: 6, dmg: 0.55 },
      fx: { trail: '#8a72b8', particles: 'shadows', spr: { trail: 'blade', hit: 'slash', kill: 'hash', proc: 'punch_flash' } } },
    { id: 'night_volley', tag: T, name: 'Night Volley', color: '#8a72b8', colors: ['#8a72b8', '#c8bcf0', '#ffffff'], signature: 'volley',
      desc: 'Three slashes a beat apart, each re-aimed.',
      pattern: 'volley', volley: 3, stats: { damage: 0.7 },
      fx: { trail: '#c8bcf0', particles: 'shadows', spr: { trail: 'blade', hit: 'slash', kill: 'hash', proc: 'ring_s' } } },
    { id: 'wicked_blow', tag: W, name: 'Wicked Blow', color: '#ff4a6a', colors: ['#ff4a6a', '#4a3a66', '#ffd166'], signature: 'pinch',
      desc: 'Wicked when cornered: below 50% health every slash hits 110% harder and comes 30% faster.',
      pinch: { at: 0.5, dmg: 2.1, cd: 0.7 },
      fx: { trail: '#ff6a8a', particles: 'shadows', spr: { trail: 'blade', hit: 'slash', kill: 'pink_flash', proc: 'punch_flash' } } },
  ],
  sky_attack: [
    { id: 'sky_barrage', tag: A, name: 'Sky Barrage', color: '#7ac8ff', colors: ['#7ac8ff', '#ffffff', '#ffd166'], signature: 'boomerang',
      desc: 'Every strike loops round and returns to you, cutting through everything a second time.',
      boomerang: { dmg: 1 },
      fx: { trail: '#ffffff', particles: 'wind', spr: { trail: 'uppercut', hit: 'slash', kill: 'flash_burst', proc: 'hook' } } },
    { id: 'dragon_ascent', tag: T, name: 'Dragon Ascent', color: '#7af0e8', colors: ['#7af0e8', '#7fe08a', '#ffd166'], signature: 'momentum',
      desc: 'Speed is power: keep moving and every strike grows up to 100% stronger.',
      momentum: { max: 1, rise: 0.5 },
      fx: { cycle: ['#7af0e8', '#7fe08a', '#ffd166'], trail: '#7af0e8', particles: 'wind', spr: { trail: 'uppercut', hit: 'punch', kill: 'beam_flash', proc: 'hook' } } },
    { id: 'hurricane_talons', tag: W, name: 'Hurricane Talons', color: '#ffd166', colors: ['#ffd166', '#ffffff', '#ff7a5a'], signature: 'haste',
      desc: 'Each kill carries you on the wind: 2s of 35% faster movement.',
      haste: { t: 2, mul: 1.35 }, stats: { damage: 1.1 },
      fx: { trail: '#ffe9a0', particles: 'wind', spr: { trail: 'uppercut', hit: 'punch', kill: 'throw_flash', proc: 'hook' } } },
  ],
  shadow_storm: [
    { id: 'shadow_swarm', tag: A, name: 'Shadow Swarm', color: '#6a4a9a', colors: ['#6a4a9a', '#c49aff', '#ffffff'], signature: 'gravity',
      desc: 'The storm\'s shadows drag the crowd along behind them, 40px around each.',
      gravity: { r: 40, pull: 130 },
      fx: { trail: '#8a72b8', particles: 'shadows', spr: { trail: 'dot', hit: 'oval', kill: 'death_flash', proc: 'ring_m' } } },
    { id: 'storm_volley', tag: T, name: 'Storm Volley', color: '#c8bcf0', colors: ['#c8bcf0', '#9af0d8', '#ffffff'], signature: 'volley',
      desc: 'The storm breaks in waves: three volleys a beat apart, each re-aimed at the nearest foe.',
      pattern: 'volley', volley: 3, stats: { damage: 0.7 },
      fx: { trail: '#c8bcf0', particles: 'spirit', spr: { trail: 'dot', hit: 'oval', kill: 'motes', proc: 'ring_s' } } },
    { id: 'phantom_eruption', tag: W, name: 'Phantom Eruption', color: '#9af0d8', colors: ['#9af0d8', '#c8bcf0', '#7ac8ff'], signature: 'doom',
      desc: 'Every foe it touches carries a phantom that erupts 3s later for 25%, even after death.',
      doom: { t: 3, dmg: 0.25, r: 28 },
      fx: { cycle: ['#9af0d8', '#c8bcf0', '#7ac8ff'], trail: '#9af0d8', particles: 'spirit', spr: { trail: 'dot', hit: 'oval', kill: 'death_flash', proc: 'guard_ring' } } },
  ],

  // ============================================================================================
  // SUBSTITUTE
  // ============================================================================================
  substitute: [
    { id: 'double_team', tag: A, name: 'Double Team', color: '#ffe9a0', colors: ['#ffe9a0', '#ffffff', '#ffd166'], signature: 'decoyShoot',
      desc: 'Your doubles fight back: each doll is 60% sturdier and fires a homing shot every 0.8s.',
      decoy: { hp: 1.6, shoot: { gap: 0.8, dmg: 14 } },
      fx: { trail: '#ffe9a0', particles: 'stars', spr: { hit: 'punch_s', kill: 'flash_burst', proc: 'ring_s' } } },
    { id: 'explosive_decoy', tag: T, name: 'Explosive Decoy', color: '#ff7a1a', colors: ['#ff7a1a', '#ffd870', '#ffffff'], signature: 'decoyExplode',
      desc: 'A doll that falls goes out with a bang: a 70px blast for 90 damage, scaled with your power.',
      decoy: { explode: { r: 70, dmg: 90 } },
      fx: { trail: '#ffd870', particles: 'embers', spr: { hit: 'boom_tiny', kill: 'boom_fire', proc: 'beam_boom' } } },
    { id: 'spite_doll', tag: W, name: 'Spite Doll', color: '#8a72b8', colors: ['#8a72b8', '#ff6a8a', '#ffffff'], signature: 'decoyTaunt',
      desc: 'The doll curses all around it: 28 damage a second and a 40% slow within 50px, and its fall heals you 10% of your health.',
      decoy: { taunt: { r: 50, dps: 28, slow: 0.4 }, heal: 0.1 },
      fx: { trail: '#c8bcf0', particles: 'shadows', spr: { hit: 'hash', kill: 'death_flash', proc: 'guard_ring' } } },
  ],
};

// --- Colours that change -------------------------------------------------------------------
//
// An overload with `fx.cycle` fades through its colours in a loop. The blends are precomputed
// once per overload, STEPS of them between each pair, so asking for the colour of the moment is a
// lookup and never builds a string. The cards keep the static `color`.

const STEPS = 10;
const palettes = new Map();

const hex2 = (n) => (n < 16 ? '0' : '') + n.toString(16);
function blend(a, b, k) {
  const x = parseInt(a.slice(1), 16), y = parseInt(b.slice(1), 16);
  const ch = (s) => Math.round(((x >> s) & 255) * (1 - k) + ((y >> s) & 255) * k);
  return `#${hex2(ch(16))}${hex2(ch(8))}${hex2(ch(0))}`;
}

function paletteOf(ov) {
  let p = palettes.get(ov);
  if (p !== undefined) return p;
  const c = ov.fx && ov.fx.cycle;
  if (!c || c.length < 2) { palettes.set(ov, null); return null; }
  p = [];
  for (let i = 0; i < c.length; i++) for (let s = 0; s < STEPS; s++) p.push(blend(c[i], c[(i + 1) % c.length], s / STEPS));
  palettes.set(ov, p);
  return p;
}

/**
 * An overload's colour at time `t` (seconds), in one of its three slots: 0 main (glow, ground,
 * arcs, card), 1 alternate (trails), 2 accent (hits, kills, procs). A cycling overload hands each
 * slot its cycle a third of a loop apart, so the three are never the same colour at once.
 */
export function ovlColor(ov, t, slot = 0) {
  if (!ov) return '#ffffff';
  const p = paletteOf(ov);
  if (!p) return slot && ov.colors ? (ov.colors[slot] || ov.color) : ov.color;
  const secs = ov.fx.cycleSecs || 0.9 * ov.fx.cycle.length;
  const k = (((t / secs + slot / 3) % 1) + 1) % 1;
  return p[(k * p.length) | 0];
}

/**
 * The same, for a sprite effect: a cycling overload's colour snapped to its cycle's own key
 * colours, since every distinct colour a sprite is drawn in is a recoloured strip in a cache.
 */
export function ovlSprColor(ov, t, slot = 0) {
  if (!ov) return '#ffffff';
  const c = ov.fx && ov.fx.cycle;
  if (!c || c.length < 2) return slot && ov.colors ? (ov.colors[slot] || ov.color) : ov.color;
  const secs = ov.fx.cycleSecs || 0.9 * c.length;
  const k = (((t / secs + slot / 3) % 1) + 1) % 1;
  return c[(k * c.length) | 0];
}

/** Whether an overload's colours change at all. */
export const ovlCycles = (ov) => !!(ov && ov.fx && ov.fx.cycle);

/** Every overload by its own id, for the probes and the pause screen. */
export const OVERLOAD_BY_ID = Object.fromEntries(Object.values(OVERLOADS).flat().map((o) => [o.id, o]));
