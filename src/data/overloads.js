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
//   dragon     the Dragon weapons' own mechanics (dragon.js), one block per overload: wildfire,
//              grudge, revenge, heartbeat, resonator, mirror, finale, afterimage, static, meteor,
//              lane, wake, crosshatch, gale, tail, debris, merge, bramble, fault, anchor, aging,
//              gears, dilation
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

  // ============================================================================================
  // NORMAL
  // ============================================================================================

  // ============================================================================================
  // ELECTRIC
  // ============================================================================================

  // ============================================================================================
  // DARK
  // ============================================================================================

  // ============================================================================================
  // GRASS
  // ============================================================================================

  // ============================================================================================
  // FLYING
  // ============================================================================================

  // ============================================================================================
  // GHOST
  // ============================================================================================

  // ============================================================================================
  // POISON
  // ============================================================================================
  // ============================================================================================
  // FIRE
  // ============================================================================================

  // ============================================================================================
  // ICE
  // ============================================================================================

  // ============================================================================================
  // EVOLVED WEAPONS
  // ============================================================================================


  // ============================================================================================
  // DRAGON -- Axew's line. Every one of these is a mechanic of its own, read by dragon.js from the
  // overload's `dragon` block, and nothing another weapon already does: no plain damage or
  // projectile bump, no bounce, no return. Each also recolours its weapon's animation in its own
  // palette (`colors`: main, trail, accent) and sheds its own particles.
  // ============================================================================================
  dragon_rage: [
    { id: 'rage_wildfire', tag: A, name: 'Wildfire Pillar', color: '#fff0a0', colors: ['#ffe070', '#fff8d8', '#ffffff'], signature: 'wildfire',
      desc: 'The fire pillar chases the nearest foe for 1.2s, burning each foe it reaches once. Damage stays fixed.',
      dragon: { wildfire: { t: 1.2, speed: 70 } },
      fx: { trail: '#fff0a0', particles: 'embers', spr: { trail: 'lava', hit: 'boom_tiny', kill: 'shine', proc: 'flash_burst' } } },
    { id: 'rage_grudge', tag: T, name: 'Grudge Flame', color: '#a02020', colors: ['#7a1018', '#2a1018', '#ff5a3a'], signature: 'grudge',
      desc: 'The flame deals 6% of the foe\'s max HP (1.5% vs bosses), and never less than its normal damage.',
      dragon: { grudge: { pct: 0.06, boss: 0.015 } },
      fx: { trail: '#5a1818', particles: 'smoke', spr: { trail: 'dot', hit: 'boom_tiny', kill: 'death_flash', proc: 'boom_fire' } } },
    { id: 'rage_revenge', tag: W, name: 'Revenge Blaze', color: '#4a8aff', colors: ['#3a6aff', '#9adcff', '#e8f8ff'], signature: 'revenge',
      desc: 'When you get hit, your next fireball fires at once: 2x bigger, with a 50% stronger pillar. Blue fire.',
      dragon: { revenge: { scale: 2 } },
      fx: { trail: '#9adcff', particles: 'sparks', spr: { trail: 'spark_s', hit: 'spark', kill: 'flash_burst', proc: 'ring_m' } } },
  ],
  dragon_pulse: [
    { id: 'pulse_heartbeat', tag: A, name: 'Heartbeat', color: '#ff6aa8', colors: ['#e0407a', '#ffb0d0', '#ffffff'], signature: 'heartbeat',
      desc: 'The orb pulses twice in a row, the second pulse wider. Foes hit by both are stunned for 0.5s.',
      dragon: { heartbeat: { gap: 0.13, stun: 0.5 } },
      fx: { trail: '#ffb0d0', particles: 'petals', spr: { trail: 'pink_flash', hit: 'pink_flash', kill: 'shine', proc: 'ring_s' } } },
    { id: 'pulse_resonator', tag: T, name: 'Resonator', color: '#3ad0c0', colors: ['#20a8a0', '#a0fff0', '#ffffff'], signature: 'resonator',
      desc: 'The orb sticks to the first foe it hits. Each pulse grows 15% wider, then it ends in one big wave.',
      dragon: { resonator: { grow: 0.15, collapse: 2 } },
      fx: { trail: '#a0fff0', particles: 'bubbles', spr: { trail: 'circuit', hit: 'ring_s', kill: 'ring_m', proc: 'ring_l' } } },
    { id: 'pulse_mirror', tag: W, name: 'Mirror Pulse', color: '#e0e8ff', colors: ['#b8c8e8', '#ffffff', '#fff6c0'], signature: 'mirrorPulse',
      desc: 'Each pulse sends enemy shots back as your own: 30% faster, dealing 1.5x the pulse damage.',
      dragon: { mirror: { dmg: 1.5 } },
      fx: { trail: '#ffffff', particles: 'stars', spr: { trail: 'shine', hit: 'shine', kill: 'flash_burst', proc: 'guard_ring' } } },
  ],
  dragon_dance: [
    { id: 'dance_finale', tag: A, name: 'Grand Finale', color: '#ffc840', colors: ['#f0a020', '#fff0a0', '#ffffff'], signature: 'finale',
      desc: 'Finishing a dance fuses all sparks into one comet that hits the toughest foe nearby. Then the dance restarts.',
      dragon: { finale: { r: 40 } },
      fx: { trail: '#fff0a0', particles: 'stars', spr: { trail: 'star3', hit: 'shine', kill: 'flash_burst', proc: 'ring_blade' } } },
    { id: 'dance_afterimage', tag: T, name: 'Afterimage', color: '#5ae0ff', colors: ['#3ab0e0', '#c0f8ff', '#ffffff'], signature: 'afterimage',
      desc: 'Each step leaves a copy of you for 2s that throws its own sparks.',
      dragon: { afterimage: { t: 2 } },
      fx: { trail: '#c0f8ff', particles: 'spirit', spr: { trail: 'motes', hit: 'spark_s', kill: 'ring_s', proc: 'ring_m' } } },
    { id: 'dance_static', tag: W, name: 'Static Steps', color: '#ffa040', colors: ['#ff8a20', '#7ac8ff', '#fff6a0'], signature: 'static',
      desc: 'While the dance speeds you up, your steps leave sparks for 2s that zap foes walking over them.',
      dragon: { static: { gap: 0.16, life: 2, r: 12, dmg: 0.4 } },
      fx: { trail: '#7ac8ff', particles: 'sparks', spr: { trail: 'spark_line', hit: 'spark_s', kill: 'spark', proc: 'lightning' } } },
  ],
  dragon_rush: [
    { id: 'rush_meteor', tag: A, name: 'Meteor Charge', color: '#d06a30', colors: ['#a04a20', '#f0b070', '#ffe0a0'], signature: 'meteorCharge',
      desc: 'The slam leaves a crater for 1.5s that slows foes inside, while rocks rain down on it.',
      dragon: { meteor: { t: 1.5, r: 46, rocks: 6, dmg: 0.4 } },
      fx: { trail: '#f0b070', particles: 'rock', spr: { trail: 'land_dust', hit: 'dust', kill: 'boom_s', proc: 'boom' } } },
    { id: 'rush_lane', tag: T, name: 'Phantom Lane', color: '#9a6aff', colors: ['#6a3ae0', '#c8b0ff', '#ffffff'], signature: 'phantomLane',
      desc: 'The charge leaves a ghost lane for 2s. Foes that cross it are pulled back to where the charge started.',
      dragon: { lane: { t: 2, dmg: 0.3 } },
      fx: { trail: '#c8b0ff', particles: 'shadows', spr: { trail: 'oval', hit: 'death_flash', kill: 'motes', proc: 'guard_ring' } } },
    { id: 'rush_wake', tag: W, name: 'Dragon\'s Wake', color: '#a8d8ff', colors: ['#5aa8ff', '#ffffff', '#e8f4ff'], signature: 'rideWake',
      desc: 'After the crescent passes you, you dash a short way behind it, untouchable. Only charges after moving for 0.3s.',
      dragon: { wake: { dash: 130, after: 0.3 } },
      fx: { trail: '#ffffff', particles: 'wind', spr: { trail: 'streak', hit: 'punch_s', kill: 'ring_s', proc: 'ring_m' } } },
  ],
  dragon_claw: [
    { id: 'claw_cross', tag: A, name: 'Crosshatch', color: '#ff8a3a', colors: ['#e05a20', '#ffd070', '#ffffff'], signature: 'crosshatch',
      desc: 'Adds a second, weaker set of slashes across the first. Where they cross, an X scar cuts foes for 2s.',
      dragon: { crosshatch: { t: 2, r: 14, dmg: 0.25 } },
      fx: { trail: '#ffd070', particles: 'embers', spr: { hit: 'slash', kill: 'spark_line', proc: 'hook' } } },
    { id: 'claw_gale', tag: T, name: 'Rending Gale', color: '#a8e0ff', colors: ['#6ab0e8', '#e8f8ff', '#ffffff'], signature: 'gale',
      desc: 'Slashes are 3x longer and thinner, cutting straight through crowds.',
      dragon: { gale: { len: 3, thin: 0.6 } },
      fx: { trail: '#e8f8ff', particles: 'wind', spr: { hit: 'slit', kill: 'streak', proc: 'ring_s' } } },
    { id: 'claw_tail', tag: W, name: 'Dragon Tail', color: '#3ad8a0', colors: ['#20a878', '#a0ffd8', '#ffffff'], signature: 'tail',
      desc: 'The last slash flings its foe far away to a random spot, leaving it dazed and confused for 1.2s.',
      dragon: { tail: { dist: 120, daze: 1.2 } },
      fx: { trail: '#a0ffd8', particles: 'leaves', spr: { hit: 'slash', kill: 'flash_burst', proc: 'ring_m' } } },
  ],
  twister: [
    { id: 'twister_debris', tag: A, name: 'Debris Storm', color: '#b09878', colors: ['#7a6448', '#d8c8a8', '#ffe8c0'], signature: 'debris',
      desc: 'Flung foes become missiles that crash into other foes and knock them over.',
      dragon: { debris: { speed: 260, t: 0.4, dmg: 1 } },
      fx: { trail: '#d8c8a8', particles: 'rock', spr: { hit: 'dust', kill: 'land_dust', proc: 'punch' } } },
    { id: 'twister_merge', tag: T, name: 'Storm Merge', color: '#5ae8ff', colors: ['#2ab0e0', '#c8f8ff', '#ffffff'], signature: 'merge',
      desc: 'Casting while your twister is up powers it instead: wider, lasts longer, holds 2 more foes. Up to 3 times.',
      dragon: { merge: { max: 3, t: 1.5 } },
      fx: { trail: '#c8f8ff', particles: 'frost', spr: { hit: 'ring_s', kill: 'flash_burst', proc: 'ring_l' } } },
    { id: 'twister_bramble', tag: W, name: 'Bramble Wind', color: '#5ac840', colors: ['#3a9a28', '#c4f29a', '#ffe070'], signature: 'bramble',
      desc: 'Flung foes land in thorny vines that root them and nearby foes for 1.5s.',
      dragon: { bramble: { t: 1.5, r: 20 } },
      fx: { trail: '#c4f29a', particles: 'leaves', spr: { hit: 'dust', kill: 'slide_dust', proc: 'ring_m' } } },
  ],
  spacial_rend: [
    { id: 'rend_fault', tag: A, name: 'Fault Lines', color: '#ff7ac8', colors: ['#e04a98', '#ffc8e8', '#ffffff'], signature: 'fault',
      desc: 'At full reach, rifts link the crescent tips for 1.5s and cut foes that cross them.',
      dragon: { fault: { t: 1.5, dmg: 0.5 } },
      fx: { trail: '#ffc8e8', particles: 'petals', spr: { hit: 'slit', kill: 'spark_line', proc: 'ring_m' } } },
    { id: 'rend_mirror', tag: T, name: 'Mirror Space', color: '#5a3a9a', colors: ['#2a1a50', '#a080e0', '#e0d0ff'], signature: 'mirrorSpace',
      desc: 'Foes hit by the outward slash are teleported to the other side of the tear.',
      dragon: { mirrorSpace: { swap: 1 } },
      fx: { trail: '#a080e0', particles: 'shadows', spr: { hit: 'oval', kill: 'death_flash', proc: 'spin_oval' } } },
    { id: 'rend_anchor', tag: W, name: 'Spatial Anchor', color: '#c8e0ff', colors: ['#7aa8ff', '#ffffff', '#c8f0ff'], signature: 'anchor',
      desc: 'Foes hit are chained to the tear for 3s. If they stray too far, they are pulled back and cut again.',
      dragon: { anchor: { t: 3, leash: 50, dmg: 0.5 } },
      fx: { cycle: ['#7aa8ff', '#ffffff', '#c8f0ff'], trail: '#ffffff', particles: 'spirit', spr: { hit: 'spark_s', kill: 'guard_break', proc: 'guard_ring' } } },
  ],
  roar_of_time: [
    { id: 'time_aging', tag: A, name: 'Aging', color: '#d8b070', colors: ['#a07840', '#f0d8a0', '#fff0c8'], signature: 'aging',
      desc: 'Foes that survive the time stop stay aged for good: 30% slower.',
      dragon: { aging: { slow: 0.3 } },
      fx: { trail: '#f0d8a0', particles: 'sand', spr: { hit: 'motes', kill: 'dust', proc: 'ring_l' } } },
    { id: 'time_gears', tag: T, name: 'Clockwork Gears', color: '#c88a3a', colors: ['#8a5a20', '#e8b878', '#fff0c0'], signature: 'gears',
      desc: 'When time restarts, the ring breaks into 6 spinning saw gears that roll away.',
      dragon: { gears: { n: 6, speed: 120, life: 1.6, r: 10, dmg: 1.4 } },
      fx: { trail: '#e8b878', particles: 'sparks', spr: { hit: 'spark_s', kill: 'guard_break', proc: 'circuit' } } },
    { id: 'time_dilation', tag: W, name: 'Time Dilation', color: '#5ae0a8', colors: ['#2aa878', '#c0ffe0', '#ffffff'], signature: 'dilation',
      desc: 'While a ring is up, all your weapons fire 40% faster.',
      dragon: { dilation: { mul: 1.4 } },
      fx: { trail: '#c0ffe0', particles: 'spirit', spr: { hit: 'motes', kill: 'ring_s', proc: 'circuit' } } },
  ],

  // ============================================================================================
  // WATER AND GROUND -- reworked. Every overload is a mechanic of its own (moves/water.js and
  // moves/ground.js), named in its `move` block, with its own palette and particles.
  // ============================================================================================
  bubble: [
    { id: 'bubble_chain', tag: A, name: 'Bubble Chain', color: '#bfe9ff', colors: ['#7ac8ff', '#e8f8ff', '#ffffff'], signature: 'bubbleChain',
      desc: 'Popped bubbles release 2 small bubbles that can each trap a foe.',
      move: { bubbleChain: { n: 2 } },
      fx: { trail: '#e8f8ff', particles: 'bubbles', spr: { trail: 'ring_s', hit: 'ring_s', kill: 'flash_burst', proc: 'ring_m' } } },
    { id: 'foam_raft', tag: T, name: 'Foam Raft', color: '#a0fff0', colors: ['#40d0c0', '#c8fff8', '#ffffff'], signature: 'foamRaft',
      desc: 'Trapped foes float back to you and circle you, hitting every foe they bump into.',
      move: { foamRaft: { r: 30 } },
      fx: { trail: '#c8fff8', particles: 'bubbles', spr: { trail: 'dot', hit: 'punch_s', kill: 'ring_m', proc: 'guard_ring' } } },
    { id: 'pressure_pop', tag: W, name: 'Pressure Pop', color: '#5a7aff', colors: ['#3a4ae0', '#9ab8ff', '#e0e8ff'], signature: 'pressure',
      desc: 'The bubble holds its foe until it hits another foe. The longer it holds, the bigger the burst.',
      move: { pressure: { per: 0.6 } },
      fx: { trail: '#9ab8ff', particles: 'frost', spr: { hit: 'ring_s', kill: 'boom_s', proc: 'beam_boom' } } },
  ],
  hydro_cannon: [
    { id: 'depth_charge', tag: A, name: 'Depth Charge', color: '#2a5aa0', colors: ['#1a3a70', '#5a9ad8', '#c8e8ff'], signature: 'depthCharge',
      desc: 'Bubbles hide underground and erupt when a group of foes walks over one.',
      move: { depthCharge: {} },
      fx: { trail: '#5a9ad8', particles: 'bubbles', spr: { hit: 'ring_s', kill: 'boom', proc: 'beam_boom' } } },
    { id: 'water_cannon', tag: T, name: 'Water Cannon', color: '#e0f6ff', colors: ['#9adcff', '#ffffff', '#5ab6ff'], signature: 'cannon',
      desc: 'The volley merges into one big, fast bubble that traps up to 5 foes.',
      move: { cannon: {} },
      fx: { trail: '#ffffff', particles: 'wind', spr: { trail: 'streak', hit: 'ring_m', kill: 'flash_burst', proc: 'ring_l' } } },
    { id: 'bubble_prison', tag: W, name: 'Bubble Prison', color: '#c8a0ff', colors: ['#8a6ae0', '#e0d0ff', '#ffffff'], signature: 'prison',
      desc: 'A trapped foe pulls nearby foes into its bubble, up to 3 in total.',
      move: { prison: {} },
      fx: { trail: '#e0d0ff', particles: 'spirit', spr: { hit: 'oval', kill: 'guard_break', proc: 'guard_ring' } } },
  ],
  tidal_surge: [
    { id: 'undertow', tag: A, name: 'Undertow', color: '#2a8ad0', colors: ['#1a5a9a', '#6ac0f0', '#e8f8ff'], signature: 'undertow',
      desc: 'After rolling out, the wave rolls back and drags foes toward you.',
      move: { undertow: { dmg: 0.6, back: 0.5 } },
      fx: { trail: '#6ac0f0', particles: 'bubbles', spr: { hit: 'ring_s', kill: 'ring_m', proc: 'ring_l' } } },
    { id: 'riptide', tag: T, name: 'Riptide', color: '#40c8b0', colors: ['#209078', '#90f0e0', '#ffffff'], signature: 'riptide',
      desc: 'The wave leaves 3 spinning rings for 2.5s that drag caught foes around.',
      move: { riptide: { t: 2.5, dmg: 0.3 } },
      fx: { trail: '#90f0e0', particles: 'bubbles', spr: { hit: 'spin_oval', kill: 'ring_m', proc: 'guard_ring' } } },
    { id: 'tide_pools', tag: W, name: 'Tide Pools', color: '#7ad8ff', colors: ['#3aa8e0', '#c0f0ff', '#7fe08a'], signature: 'tidePools',
      desc: 'Foes hit leave a tide pool for 4s that slows foes and heals you while you stand in it.',
      move: { tidePools: { r: 16, t: 4, heal: 4, max: 8 } },
      fx: { trail: '#c0f0ff', particles: 'bubbles', spr: { hit: 'ring_s', kill: 'motes', proc: 'ring_s' } } },
  ],
  whirlpool: [
    { id: 'centrifuge', tag: A, name: 'Centrifuge', color: '#1a7ac0', colors: ['#0a4a8a', '#5ab6ef', '#ffffff'], signature: 'centrifuge',
      desc: 'When the vortex ends, it throws all caught foes outward hard.',
      move: { centrifuge: { dmg: 1.2 } },
      fx: { trail: '#5ab6ef', particles: 'wind', spr: { hit: 'spin_oval', kill: 'ring_l', proc: 'ring_l' } } },
    { id: 'wandering_eddy', tag: T, name: 'Wandering Eddy', color: '#5ae0d0', colors: ['#2aa898', '#b0fff0', '#ffffff'], signature: 'eddy',
      desc: 'The vortex moves toward the nearest group of foes, dragging them along.',
      move: { eddy: { speed: 40 } },
      fx: { trail: '#b0fff0', particles: 'bubbles', spr: { hit: 'dot', kill: 'ring_m', proc: 'spin_oval' } } },
    { id: 'drain_whirl', tag: W, name: 'Drain Whirl', color: '#ffd166', colors: ['#3a8fd0', '#ffe9a0', '#ffd166'], signature: 'drainWhirl',
      desc: 'The vortex pulls nearby XP and coins to you. Each one damages foes inside.',
      move: { drainWhirl: { r: 120, dmg: 0.4 } },
      fx: { trail: '#ffe9a0', particles: 'stars', spr: { hit: 'shine', kill: 'star3', proc: 'shine' } } },
  ],
  aqua_jet: [
    { id: 'pressure_washer', tag: A, name: 'Pressure Washer', color: '#e8f8ff', colors: ['#7ac8ff', '#ffffff', '#bfe9ff'], signature: 'washer',
      desc: 'Jets push the foes in front of them for their whole flight.',
      move: { washer: { push: 160 } },
      fx: { trail: '#ffffff', particles: 'wind', spr: { trail: 'streak', hit: 'punch_s', kill: 'ring_s', proc: 'ring_s' } } },
    { id: 'geyser_release', tag: T, name: 'Geyser Release', color: '#3ab0ff', colors: ['#1a70c0', '#9adcff', '#ffffff'], signature: 'geyser',
      desc: 'Stored pressure erupts as geysers under nearby foes instead, one per stack, launching them up.',
      move: { geyser: { r: 20, dmg: 1.0 } },
      fx: { trail: '#9adcff', particles: 'bubbles', spr: { hit: 'ring_s', kill: 'boom_s', proc: 'ring_m' } } },
    { id: 'slipstream', tag: W, name: 'Slipstream', color: '#8af0ff', colors: ['#3ac8e0', '#d0fcff', '#ffffff'], signature: 'slipstream',
      desc: 'Standing still builds a water shield that blocks the next hit.',
      move: { slipstream: { per: 2 } },
      fx: { trail: '#d0fcff', particles: 'frost', spr: { hit: 'ring_s', kill: 'guard_ring', proc: 'guard_ring' } } },
  ],
  rain_dance: [
    { id: 'puddle_run', tag: A, name: 'Puddle Run', color: '#5aa8e8', colors: ['#2a6ab0', '#a8d8ff', '#e8f8ff'], signature: 'puddles',
      desc: 'Each drop leaves a puddle for 3s that slows foes and makes you 25% faster.',
      move: { puddles: { r: 14, t: 3, haste: 1.25, max: 14 } },
      fx: { trail: '#a8d8ff', particles: 'bubbles', spr: { hit: 'ring_s', kill: 'land_dust', proc: 'ring_s' } } },
    { id: 'fish_storm', tag: T, name: 'Fish Storm', color: '#ff9a40', colors: ['#e06a20', '#ffd0a0', '#7ac8ff'], signature: 'fishRain',
      desc: '1 drop in 5 is a fish that flops around, hitting the foes it lands on.',
      move: { fishRain: { chance: 0.2, hops: 5, dmg: 0.8 } },
      fx: { trail: '#ffd0a0', particles: 'bubbles', spr: { hit: 'punch_s', kill: 'ring_s', proc: 'ring_s' } } },
    { id: 'soak', tag: W, name: 'Soak', color: '#4a6aff', colors: ['#2a3ad0', '#9ab0ff', '#f8e038'], signature: 'soak',
      desc: 'Foes hit are soaked for 4s: slowed, and take 40% more lightning damage from any weapon.',
      move: { soak: { t: 4 } },
      fx: { trail: '#9ab0ff', particles: 'bubbles', spr: { hit: 'dot', kill: 'spark_s', proc: 'spark_s' } } },
  ],
  brine_fang: [
    { id: 'pack_hunt', tag: A, name: 'Pack Hunt', color: '#3a8fd0', colors: ['#1a5a9a', '#7ac8ff', '#ffffff'], signature: 'pack',
      desc: 'Each kill summons a small shark for 5s, up to 3 at once.',
      move: { pack: { max: 3, t: 5 } },
      fx: { trail: '#7ac8ff', particles: 'bubbles', spr: { hit: 'punch_s', kill: 'ring_s', proc: 'ring_m' } } },
    { id: 'sharknado', tag: T, name: 'Sharknado', color: '#a8d8f0', colors: ['#5a90b0', '#e0f4ff', '#ffffff'], signature: 'sharknado',
      desc: 'The shark circles you fast, biting every foe it passes.',
      move: { sharknado: { r: 34, spin: 6 } },
      fx: { trail: '#e0f4ff', particles: 'wind', spr: { trail: 'streak', hit: 'slash', kill: 'spin_oval', proc: 'ring_m' } } },
    { id: 'blood_in_the_water', tag: W, name: 'Blood in the Water', color: '#e04a5a', colors: ['#a0202a', '#ff9aa0', '#ffffff'], signature: 'frenzy',
      desc: 'Each bite on the same foe deals 25% more, up to 2.5x. A new target resets it.',
      move: { frenzy: { per: 0.25, max: 1.5 } },
      fx: { trail: '#ff9aa0', particles: 'embers', spr: { hit: 'punch_s', kill: 'gibs', proc: 'slash' } } },
  ],
  mud_shot: [
    { id: 'mudslide', tag: A, name: 'Mudslide', color: '#a06830', colors: ['#6a4018', '#d8a868', '#fff0c0'], signature: 'mudslide',
      desc: 'The mud slides forward after landing, slowing and hitting foes in its path.',
      move: { mudslide: { len: 60, dmg: 0.6 } },
      fx: { trail: '#d8a868', particles: 'mud', spr: { trail: 'slide_dust', hit: 'dust', kill: 'land_dust', proc: 'slide_dust' } } },
    { id: 'clay_coat', tag: T, name: 'Clay Coat', color: '#c08850', colors: ['#8a5a28', '#e8c090', '#ffffff'], signature: 'clayCoat',
      desc: 'Globs that land near you add a clay layer. Each layer halves one hit, up to 5 layers.',
      move: { clayCoat: { max: 5 } },
      fx: { trail: '#e8c090', particles: 'mud', spr: { hit: 'dust', kill: 'guard_ring', proc: 'guard_ring' } } },
    { id: 'mud_mask', tag: W, name: 'Mud Mask', color: '#6a8a30', colors: ['#4a5a18', '#b0c870', '#ffe070'], signature: 'mudMask',
      desc: 'Muddied foes forget you and walk to the nearest mud puddle for 3s.',
      move: { mudMask: { t: 3 } },
      fx: { trail: '#b0c870', particles: 'mud', spr: { hit: 'dust', kill: 'land_dust', proc: 'dust' } } },
  ],
  quagmire: [
    { id: 'sinkhole', tag: A, name: 'Sinkhole', color: '#7a5a30', colors: ['#4a3010', '#b08850', '#e8d0a0'], signature: 'sinkhole',
      desc: 'Foes in puddles get slower the longer they stay, until they are stuck.',
      move: { sinkhole: { rate: 0.35 } },
      fx: { trail: '#b08850', particles: 'mud', spr: { hit: 'dust', kill: 'land_dust', proc: 'ring_m' } } },
    { id: 'mud_wall', tag: T, name: 'Mud Wall', color: '#a07848', colors: ['#6a4a20', '#d8b080', '#fff0d0'], signature: 'mudWall',
      desc: 'Each glob makes a mud wall for 2.5s that foes cannot walk through.',
      move: { mudWall: { len: 50, t: 2.5 } },
      fx: { trail: '#d8b080', particles: 'mud', spr: { hit: 'dust', kill: 'land_dust', proc: 'land_dust' } } },
    { id: 'clay_golem', tag: W, name: 'Clay Golem', color: '#c09060', colors: ['#7a5030', '#e8c8a0', '#ffe070'], signature: 'golem',
      desc: 'Sometimes a puddle becomes a mud golem for 5s that chases foes and slams them.',
      move: { golem: { chance: 0.2, t: 5, dmg: 1.2, max: 3 } },
      fx: { trail: '#e8c8a0', particles: 'mud', spr: { hit: 'punch', kill: 'land_dust', proc: 'boom_s' } } },
  ],
  rock_orbit: [
    { id: 'ring_quake', tag: A, name: 'Ring Quake', color: '#a09080', colors: ['#6a6050', '#d8d0c0', '#ffffff'], signature: 'ringQuake',
      desc: 'Each time the ring reforms, it slams the ground around you and stuns foes.',
      move: { ringQuake: { dmg: 1.2 } },
      fx: { trail: '#d8d0c0', particles: 'rock', spr: { hit: 'dust', kill: 'land_dust', proc: 'land_dust' } } },
    { id: 'rock_wall', tag: T, name: 'Rock Wall', color: '#8a7a68', colors: ['#5a4a38', '#c8b8a0', '#fff0d0'], signature: 'rockWall',
      desc: 'Rocks stop spinning: each new ring becomes a wall in front of you for 2s that blocks foes.',
      move: { rockWall: { t: 2 } },
      fx: { trail: '#c8b8a0', particles: 'rock', spr: { hit: 'punch_s', kill: 'land_dust', proc: 'dust' } } },
    { id: 'geode_bloom', tag: W, name: 'Geode Bloom', color: '#b080ff', colors: ['#6a40c0', '#e0c8ff', '#7af0e8'], signature: 'geode',
      desc: 'Rocks that kill leave a crystal for 3s that pulses damage around it.',
      move: { geode: { t: 3, r: 22, dmg: 0.3 } },
      fx: { trail: '#e0c8ff', particles: 'stars', spr: { hit: 'shine', kill: 'freeze', proc: 'sparkle' } } },
  ],
  earth_power: [
    { id: 'aftershock', tag: A, name: 'Aftershock', color: '#c87a3a', colors: ['#8a4a18', '#f0b070', '#fff0c0'], signature: 'aftershock',
      desc: 'Shortly after, the ground erupts again from the far end back toward you.',
      move: { aftershock: { delay: 0.8, dmg: 0.7 } },
      fx: { trail: '#f0b070', particles: 'rock', spr: { hit: 'dust', kill: 'land_dust', proc: 'land_dust' } } },
    { id: 'fault_spiral', tag: T, name: 'Fault Spiral', color: '#9a8a60', colors: ['#5a5030', '#d8c890', '#ffffff'], signature: 'spiralLine',
      desc: 'Spikes erupt in a spiral around you instead of a straight line.',
      move: { spiralLine: { turn: 0.55, grow: 7 } },
      fx: { trail: '#d8c890', particles: 'sand', spr: { hit: 'dust', kill: 'spin_oval', proc: 'land_dust' } } },
    { id: 'magma_vent', tag: W, name: 'Magma Vent', color: '#ff6a2a', colors: ['#c0300a', '#ffb070', '#ffe070'], signature: 'magmaVent',
      desc: 'Every other spike leaves a lava vent for 2s that spits lava around it.',
      move: { magmaVent: { t: 2, dmg: 0.25 } },
      fx: { trail: '#ffb070', particles: 'embers', spr: { hit: 'lava', kill: 'boom_fire', proc: 'lava' } } },
  ],
  sand_tomb: [
    { id: 'quicksand_pit', tag: A, name: 'Quicksand Pit', color: '#d8b070', colors: ['#a07838', '#f0d8a0', '#fff6d8'], signature: 'pit',
      desc: 'Exploding mines leave quicksand for 2s. Foes under 12% HP are swallowed, others are held in place.',
      move: { pit: { t: 2, r: 30, exec: 0.12 } },
      fx: { trail: '#f0d8a0', particles: 'sand', spr: { hit: 'dust', kill: 'land_dust', proc: 'ring_m' } } },
    { id: 'tomb_chain', tag: T, name: 'Tomb Chain', color: '#e0a050', colors: ['#a06020', '#ffd8a0', '#ffffff'], signature: 'tombChain',
      desc: 'Mines are linked: when one explodes, all nearby mines explode too.',
      move: { tombChain: { r: 90 } },
      fx: { trail: '#ffd8a0', particles: 'sand', spr: { hit: 'spark_s', kill: 'boom_s', proc: 'spark_line' } } },
    { id: 'desert_mirage', tag: W, name: 'Desert Mirage', color: '#ffe0a0', colors: ['#d8a860', '#fff4d8', '#9adcff'], signature: 'mirage',
      desc: 'Buried mines look like you, luring nearby foes onto them.',
      move: { mirage: {} },
      fx: { trail: '#fff4d8', particles: 'sand', spr: { hit: 'shine', kill: 'land_dust', proc: 'motes' } } },
  ],
  bulldoze: [
    { id: 'steamroll', tag: A, name: 'Steamroll', color: '#8a7050', colors: ['#5a4428', '#c8a878', '#ffffff'], signature: 'steamroll',
      desc: 'Foes knocked down stay down briefly and take 50% more from the next hit.',
      move: { steamroll: { t: 2, mul: 0.5 } },
      fx: { trail: '#c8a878', particles: 'rock', spr: { hit: 'dust', kill: 'land_dust', proc: 'punch' } } },
    { id: 'plough', tag: T, name: 'Plough', color: '#b09060', colors: ['#7a5a30', '#e8d0a0', '#fff0c0'], signature: 'plough',
      desc: 'The sweep scoops foes up and drags them along, dropping them all at the end.',
      move: { plough: {} },
      fx: { trail: '#e8d0a0', particles: 'sand', spr: { trail: 'slide_dust', hit: 'dust', kill: 'land_dust', proc: 'slide_dust' } } },
    { id: 'rubble_toss', tag: W, name: 'Rubble Toss', color: '#a8a090', colors: ['#6a6458', '#e0dccc', '#ffd070'], signature: 'rubble',
      desc: 'Each swing leaves a ring of rubble around you for 3s that slows and hurts foes.',
      move: { rubble: { n: 8, r: 48, t: 3, dmg: 0.3 } },
      fx: { trail: '#e0dccc', particles: 'rock', spr: { hit: 'dust', kill: 'land_dust', proc: 'dust' } } },
  ],
  dig: [
    { id: 'tunnel_network', tag: A, name: 'Tunnel Network', color: '#7a5a38', colors: ['#4a3018', '#c8a070', '#ffe8c0'], signature: 'tunnels',
      desc: 'Each burst leaves a hole for 6s. Your next dig bursts out of every hole first.',
      move: { tunnels: { t: 6, dmg: 0.8 } },
      fx: { trail: '#c8a070', particles: 'mud', spr: { hit: 'dust', kill: 'land_dust', proc: 'land_dust' } } },
    { id: 'undermine', tag: T, name: 'Undermine', color: '#5a4a3a', colors: ['#2a2018', '#9a8870', '#e0d0b8'], signature: 'undermine',
      desc: 'When digging ends, the tunnel collapses and hits every foe above it.',
      move: { undermine: { dmg: 0.8 } },
      fx: { trail: '#9a8870', particles: 'rock', spr: { hit: 'dust', kill: 'land_dust', proc: 'boom_s' } } },
    { id: 'treasure_dig', tag: W, name: 'Treasure Dig', color: '#ffd166', colors: ['#c89818', '#fff0a0', '#ffffff'], signature: 'treasure',
      desc: '40% of bursts also dig up coins.',
      move: { treasure: { coin: 0.4 } },
      fx: { trail: '#fff0a0', particles: 'stars', spr: { hit: 'shine', kill: 'star3', proc: 'shine' } } },
  ],

  // ============================================================================================
  // SUBSTITUTE
  // ============================================================================================
  substitute: [
    { id: 'double_team', tag: A, name: 'Double Team', color: '#ffe9a0', colors: ['#ffe9a0', '#ffffff', '#ffd166'], signature: 'decoyShoot',
      desc: 'Dolls are 60% tougher and attack nearby foes every 0.9s for 24 damage.',
      decoy: { hp: 1.6, strike: { gap: 0.9, dmg: 24, r: 24 } },
      fx: { trail: '#ffe9a0', particles: 'stars', spr: { hit: 'punch_s', kill: 'flash_burst', proc: 'ring_s' } } },
    { id: 'explosive_decoy', tag: T, name: 'Explosive Decoy', color: '#ff7a1a', colors: ['#ff7a1a', '#ffd870', '#ffffff'], signature: 'decoyExplode',
      desc: 'Dolls explode when destroyed, dealing 90 damage around them. Scales with your power.',
      decoy: { explode: { r: 70, dmg: 90 } },
      fx: { trail: '#ffd870', particles: 'embers', spr: { hit: 'boom_tiny', kill: 'boom_fire', proc: 'beam_boom' } } },
    { id: 'spite_doll', tag: W, name: 'Spite Doll', color: '#8a72b8', colors: ['#8a72b8', '#ff6a8a', '#ffffff'], signature: 'decoyTaunt',
      desc: 'The doll deals 28 damage per second and slows nearby foes by 40%. When it breaks, you heal 10% HP.',
      decoy: { taunt: { r: 50, dps: 28, slow: 0.4 }, heal: 0.1 },
      fx: { trail: '#c8bcf0', particles: 'shadows', spr: { hit: 'hash', kill: 'death_flash', proc: 'guard_ring' } } },
  ],
  // --- Normal ------------------------------------------------------------------------------------
  swift: [
    { id: 'supernova', tag: A, name: 'Supernova', color: '#ffe9a0', colors: ['#ffb040', '#fff0b0', '#ffffff'], signature: 'supernova',
      desc: 'Where the stars meet, they explode, hitting all foes around the target.',
      move: { supernova: { r: 40, dmg: 1.2 } },
      fx: { trail: '#fff0b0', particles: 'stars', spr: { trail: 'star3', hit: 'shine', kill: 'flash_burst', proc: 'flash_burst' } } },
    { id: 'star_shower', tag: T, name: 'Star Shower', color: '#9ab8ff', colors: ['#4a5ad0', '#c0d0ff', '#ffffff'], signature: 'starShower',
      desc: 'Stars fly up and fall back down, each on a different foe.',
      move: { starShower: {} },
      fx: { trail: '#c0d0ff', particles: 'stars', spr: { trail: 'streak', hit: 'star3', kill: 'sparkle', proc: 'ring_m' } } },
    { id: 'wish', tag: W, name: 'Wish', color: '#7fe0c0', colors: ['#2a9a80', '#b0f0e0', '#ffe9a0'], signature: 'wish',
      desc: 'Every 10th star that lands gives a random bonus: health, coins, XP or a speed boost.',
      move: { wish: { every: 10 } },
      fx: { trail: '#b0f0e0', particles: 'spirit', spr: { hit: 'sparkle', kill: 'star3', proc: 'shine' } } },
  ],
  star_barrage: [
    { id: 'star_well', tag: A, name: 'Star Well', color: '#c49aff', colors: ['#6a3ad0', '#e0c8ff', '#ffe9a0'], signature: 'starWell',
      desc: 'Where a volley meets, a star well appears for 1.5s that pulls foes in and damages them.',
      move: { starWell: { r: 40, t: 1.5, dmg: 0.12 } },
      fx: { trail: '#e0c8ff', particles: 'stars', spr: { trail: 'star3', hit: 'shine', kill: 'ring_m', proc: 'ring_l' } } },
    { id: 'star_shield', tag: T, name: 'Star Shield', color: '#ffffff', colors: ['#a0a8c0', '#e8ecf8', '#ffffff'], signature: 'starShield',
      desc: '4 stars circle you. Each one blocks an enemy shot and fires back at the nearest foe.',
      move: { starShield: { n: 4 } },
      fx: { trail: '#e8ecf8', particles: 'wind', spr: { hit: 'shine', kill: 'guard_break', proc: 'guard_ring' } } },
    { id: 'lucky_star', tag: W, name: 'Lucky Star', color: '#ffd166', colors: ['#c08010', '#ffe08a', '#ffffff'], signature: 'luckyStar',
      desc: 'One star per volley is golden: it always crits and makes the foe drop coins.',
      move: { luckyStar: {} },
      fx: { trail: '#ffe08a', particles: 'stars', spr: { hit: 'star3', kill: 'sparkle', proc: 'shine' } } },
  ],
  pay_day: [
    { id: 'jackpot', tag: A, name: 'Jackpot', color: '#ffc040', colors: ['#b07010', '#ffe08a', '#ffffff'], signature: 'jackpot',
      desc: 'Every 7th throw is a jackpot: 3x coins, all critical hits.',
      move: { jackpot: { every: 7 } },
      fx: { trail: '#ffe08a', particles: 'stars', spr: { hit: 'shine', kill: 'star3', proc: 'flash_burst' } } },
    { id: 'coin_toss', tag: T, name: 'Coin Toss', color: '#d0a050', colors: ['#7a5020', '#f0d090', '#fff8e0'], signature: 'coinToss',
      desc: 'Coins are lobbed and form a spinning coin carpet for 2s that hurts foes walking on it.',
      move: { coinToss: {} },
      fx: { trail: '#f0d090', particles: 'sand', spr: { hit: 'dust', kill: 'land_dust', proc: 'ring_s' } } },
    { id: 'bribe', tag: W, name: 'Bribe', color: '#7fe08a', colors: ['#2a8a40', '#c4f29a', '#ffd166'], signature: 'bribe',
      desc: 'Foes hit by 5 coins are bribed and walk away for 3s.',
      move: { bribe: { n: 5, t: 3 } },
      fx: { trail: '#c4f29a', particles: 'leaves', spr: { hit: 'hook', kill: 'star3', proc: 'shine' } } },
  ],
  tri_attack: [
    { id: 'prism', tag: A, name: 'Prism', color: '#ff9ad8', colors: ['#c040a0', '#ffc8e8', '#ffffff'], signature: 'prism',
      desc: 'At full size, each corner fires a beam: fire, ice and lightning.',
      move: { prism: { len: 120, dmg: 1 } },
      fx: { trail: '#ffc8e8', particles: 'petals', spr: { hit: 'ray', kill: 'flash_burst', proc: 'beam_flash' } } },
    { id: 'trinity', tag: T, name: 'Trinity', color: '#a0f0ff', colors: ['#3a90b0', '#d0f8ff', '#ffffff'], signature: 'trinity',
      desc: 'The triangle spins around you for 2s, hitting foes that get close.',
      move: { trinity: { t: 2 } },
      fx: { trail: '#d0f8ff', particles: 'frost', spr: { hit: 'ring_s', kill: 'guard_break', proc: 'guard_ring' } } },
    { id: 'status_overload', tag: W, name: 'Status Overload', color: '#c8ff60', colors: ['#5a9a10', '#e8ffb0', '#ff5a3a'], signature: 'statusOverload',
      desc: 'Foes that are burning, frozen and paralyzed at once explode for 2x damage around them.',
      move: { statusOverload: { dmg: 2 } },
      fx: { trail: '#e8ffb0', particles: 'sparks', spr: { hit: 'spark_s', kill: 'boom', proc: 'flash_burst' } } },
  ],
  hyper_voice: [
    { id: 'uproar', tag: A, name: 'Uproar', color: '#ff7a5a', colors: ['#c03020', '#ffb8a0', '#ffffff'], signature: 'uproar',
      desc: 'Each cast is stronger: wider, farther rings and longer confusion. Stacks up to 5 times, resets when you get hit.',
      move: { uproar: { max: 5 } },
      fx: { trail: '#ffb8a0', particles: 'embers', spr: { hit: 'notes', kill: 'ring_m', proc: 'ring_l' } } },
    { id: 'round', tag: T, name: 'Round', color: '#9adcff', colors: ['#3a7ab0', '#d0f0ff', '#ffffff'], signature: 'round',
      desc: 'Rings spread all around you, hitting foes on every side, but deal less damage.',
      move: { round: { dmg: 0.4 } },
      fx: { trail: '#d0f0ff', particles: 'wind', spr: { hit: 'ring_s', kill: 'ring_m', proc: 'ring_l' } } },
    { id: 'perish_song', tag: W, name: 'Perish Song', color: '#8a6ae0', colors: ['#3a2a80', '#c8b8ff', '#f0e0ff'], signature: 'perishSong',
      desc: 'Foes hit by 3 rings within 4s start a 3s countdown, then take a huge hit.',
      move: { perishSong: { n: 3, t: 3, dmg: 4 } },
      fx: { trail: '#c8b8ff', particles: 'shadows', spr: { hit: 'notes', kill: 'death_flash', proc: 'oval' } } },
  ],
  fury_swipes: [
    { id: 'rampage', tag: A, name: 'Rampage', color: '#ff6a5a', colors: ['#a02018', '#ffb0a0', '#ffffff'], signature: 'rampage',
      desc: 'Keep hitting the same foe: every 3 hits on it, your hits on it deal more damage, up to 4 times.',
      move: { rampage: { per: 3, max: 4 } },
      fx: { trail: '#ffb0a0', particles: 'embers', spr: { hit: 'slash', kill: 'gibs', proc: 'slash' } } },
    { id: 'slash_trail', tag: T, name: 'Slash Trail', color: '#e0e8ff', colors: ['#7080a0', '#f0f4ff', '#ffffff'], signature: 'slashTrail',
      desc: 'Claws leave slashes in the air for 1s that cut foes passing through.',
      move: { slashTrail: { t: 1, dmg: 0.3 } },
      fx: { trail: '#f0f4ff', particles: 'wind', spr: { trail: 'slit', hit: 'slash', kill: 'blade', proc: 'ring_blade' } } },
    { id: 'itch', tag: W, name: 'Itch', color: '#ffb0d0', colors: ['#c05080', '#ffd8e8', '#fff8c0'], signature: 'itch',
      desc: 'Foes hit get itchy: they stop to scratch, hurt themselves, and spread it to foes they touch.',
      move: { itch: { t: 3, dmg: 0.25 } },
      fx: { trail: '#ffd8e8', particles: 'petals', spr: { hit: 'hash', kill: 'dust', proc: 'hash' } } },
  ],
  giga_impact: [
    { id: 'recharge', tag: A, name: 'Recharge', color: '#ffa040', colors: ['#a05010', '#ffd090', '#ffffff'], signature: 'recharge',
      desc: 'Releasing 3+ charges causes an explosion at the end for 80% damage, then leaves you out of breath.',
      move: { recharge: { r: 34, dmg: 0.8, stacks: 3 } },
      fx: { trail: '#ffd090', particles: 'embers', spr: { hit: 'punch', kill: 'boom', proc: 'boom_fire' } } },
    { id: 'body_slam', tag: T, name: 'Body Slam', color: '#c0a0ff', colors: ['#5a3aa0', '#e0d0ff', '#ffffff'], signature: 'bodySlam',
      desc: 'No projectile: every 4 stored charges, you jump on the nearest foe and slam down, untouchable.',
      move: { bodySlam: { range: 170, r: 40, dmg: 1.2, bank: 4 } },
      fx: { trail: '#e0d0ff', particles: 'rock', spr: { hit: 'uppercut', kill: 'land_dust', proc: 'land_dust' } } },
    { id: 'shock_trail', tag: W, name: 'Shockwave Trail', color: '#a0ffe0', colors: ['#2a9a70', '#d0fff0', '#ffffff'], signature: 'shockTrail',
      desc: 'The charge cracks the ground behind it, and the cracks erupt 0.5s later.',
      move: { shockTrail: { delay: 0.5, dmg: 0.25 } },
      fx: { trail: '#d0fff0', particles: 'rock', spr: { hit: 'dust', kill: 'land_dust', proc: 'land_dust' } } },
  ],

  // --- Electric ----------------------------------------------------------------------------------
  spark_chain: [
    { id: 'overcharge', tag: A, name: 'Overcharge', color: '#fff060', colors: ['#c0a010', '#fff8a0', '#ffffff'], signature: 'overcharge',
      desc: 'Foes hit 3 times within 4s explode, stunning foes around them.',
      move: { overcharge: { n: 3, t: 4, dmg: 0.9 } },
      fx: { trail: '#fff8a0', particles: 'sparks', spr: { hit: 'spark_s', kill: 'flash_burst', proc: 'ring_m' } } },
    { id: 'ball_lightning', tag: T, name: 'Ball Lightning', color: '#80c0ff', colors: ['#2a5ab0', '#c0e0ff', '#ffffff'], signature: 'ballLightning',
      desc: 'The last chain link leaves a lightning ball for 3s that chases and zaps foes. Up to 3 at once.',
      move: { ballLightning: { t: 3, max: 3, dmg: 0.45 } },
      fx: { trail: '#c0e0ff', particles: 'sparks', spr: { hit: 'spark', kill: 'ring_m', proc: 'circuit' } } },
    { id: 'magnetize', tag: W, name: 'Magnetize', color: '#ff7aa0', colors: ['#b02050', '#ffc0d0', '#7ac8ff'], signature: 'magnetize',
      desc: 'Foes hit are magnetized for 3s: they pull toward each other and take damage when they collide.',
      move: { magnetize: { t: 3, pull: 70, dmg: 0.25 } },
      fx: { trail: '#ffc0d0', particles: 'sparks', spr: { hit: 'hook', kill: 'spark', proc: 'circuit' } } },
  ],
  thunder_storm: [
    { id: 'thunderclap', tag: A, name: 'Thunderclap', color: '#ffffa0', colors: ['#c0b020', '#fffff0', '#ffffff'], signature: 'thunderclap',
      desc: 'The first foe hit is struck again shortly after for 1.5x damage, and stunned.',
      move: { thunderclap: { dmg: 1.5 } },
      fx: { trail: '#fffff0', particles: 'sparks', spr: { hit: 'lightning', kill: 'flash_burst', proc: 'lightning' } } },
    { id: 'storm_cell', tag: T, name: 'Storm Cell', color: '#8a8aa0', colors: ['#3a3a50', '#c0c0d8', '#fff6a0'], signature: 'stormCell',
      desc: 'A storm cloud follows you and drops a bolt every 1.4s that splits to 2 more foes.',
      move: { stormCell: { every: 1.4, dmg: 0.9 } },
      fx: { trail: '#c0c0d8', particles: 'smoke', spr: { hit: 'spark_s', kill: 'lightning', proc: 'lightning' } } },
    { id: 'ionize', tag: W, name: 'Ionize', color: '#c0a0ff', colors: ['#5a3ab0', '#e8d8ff', '#a0fff0'], signature: 'ionize',
      desc: 'Foes killed by lightning release sparks that hit the 3 nearest foes.',
      move: { ionize: { n: 3, range: 80, dmg: 0.5 } },
      fx: { trail: '#e8d8ff', particles: 'spirit', spr: { hit: 'spark_s', kill: 'spark', proc: 'circuit' } } },
  ],
  electroweb: [
    { id: 'live_net', tag: A, name: 'Live Net', color: '#f8f060', colors: ['#a09010', '#fff8b0', '#ffffff'], signature: 'liveNet',
      desc: 'Each net pulse grabs a nearby foe and pulls it into the net.',
      move: { liveNet: { n: 1, reach: 50 } },
      fx: { trail: '#fff8b0', particles: 'sparks', spr: { hit: 'hook', kill: 'spark', proc: 'circuit' } } },
    { id: 'web_trap', tag: T, name: 'Web Trap', color: '#c0ffa0', colors: ['#4a9a2a', '#e0ffd0', '#ffffff'], signature: 'webTrap',
      desc: 'Nets are placed at your feet instead, up to 3 at a time. They spring open when a foe steps on one.',
      move: { webTrap: { max: 3, t: 8, dmg: 1 } },
      fx: { trail: '#e0ffd0', particles: 'leaves', spr: { hit: 'ring_s', kill: 'spark', proc: 'ring_m' } } },
    { id: 'cling', tag: W, name: 'Cling', color: '#ff9a60', colors: ['#b04a10', '#ffd0a8', '#fff6a0'], signature: 'cling',
      desc: 'When the net fades, it sticks to the toughest foe it held and shocks nearby foes for 3s.',
      move: { cling: { t: 3, dmg: 0.6 } },
      fx: { trail: '#ffd0a8', particles: 'embers', spr: { hit: 'spark_s', kill: 'boom_s', proc: 'circuit' } } },
  ],
  volt_coil: [
    { id: 'tesla', tag: A, name: 'Tesla', color: '#a0e0ff', colors: ['#2a7ab0', '#d8f4ff', '#ffffff'], signature: 'tesla',
      desc: 'Each coil links a beam to you that hurts foes in between. Move to sweep it through crowds.',
      move: { tesla: { reach: 220, dmg: 0.3 } },
      fx: { trail: '#d8f4ff', particles: 'sparks', spr: { hit: 'spark_line', kill: 'spark', proc: 'circuit' } } },
    { id: 'hop_coil', tag: T, name: 'Hop Coil', color: '#7fe08a', colors: ['#2a8a40', '#c4f2c0', '#fff6a0'], signature: 'hopCoil',
      desc: 'The coil hops toward the nearest foe every second and shocks on landing.',
      move: { hopCoil: { every: 1.1, hop: 56, dmg: 0.6 } },
      fx: { trail: '#c4f2c0', particles: 'sparks', spr: { hit: 'spark_s', kill: 'land_dust', proc: 'land_dust' } } },
    { id: 'coil_pop', tag: W, name: 'Coil Pop', color: '#ff6060', colors: ['#a01818', '#ffb0a0', '#fff6a0'], signature: 'coilPop',
      desc: 'When a coil expires, it explodes, dealing big damage and stunning nearby foes.',
      move: { coilPop: { r: 48, dmg: 2.2 } },
      fx: { trail: '#ffb0a0', particles: 'embers', spr: { hit: 'spark_s', kill: 'boom', proc: 'boom' } } },
  ],
  electro_ball: [
    { id: 'speed_spark', tag: A, name: 'Speed Spark', color: '#60f0ff', colors: ['#1a8aa0', '#c0f8ff', '#ffffff'], signature: 'speedSpark',
      desc: 'The faster you move compared to the foe, the more damage it deals.',
      move: { speedSpark: { per: 0.6, max: 1 } },
      fx: { trail: '#c0f8ff', particles: 'wind', spr: { trail: 'streak', hit: 'spark_s', kill: 'flash_burst', proc: 'streak' } } },
    { id: 'plasma_orbit', tag: T, name: 'Plasma Orbit', color: '#e080ff', colors: ['#8a2ab0', '#f4c8ff', '#ffffff'], signature: 'plasmaOrbit',
      desc: 'The ball circles you for 3.5s instead, shocking foes that get close.',
      move: { plasmaOrbit: { t: 3.5, r: 46, spin: 4 } },
      fx: { trail: '#f4c8ff', particles: 'spirit', spr: { hit: 'spark', kill: 'ring_m', proc: 'guard_ring' } } },
    { id: 'short_circuit', tag: W, name: 'Short Circuit', color: '#f0c040', colors: ['#906010', '#ffe8a0', '#ffffff'], signature: 'shortCircuit',
      desc: 'Foes hit leave a spark on the ground for 2.5s that shocks foes stepping on it.',
      move: { shortCircuit: { t: 2.5, dmg: 0.3, max: 6 } },
      fx: { trail: '#ffe8a0', particles: 'sparks', spr: { hit: 'spark_s', kill: 'spark', proc: 'circuit' } } },
  ],
  electric_terrain: [
    { id: 'disco', tag: A, name: 'Disco', color: '#ff60c0', colors: ['#a01880', '#ffb0e0', '#7af0ff'], signature: 'disco',
      desc: 'Each shocked foe speeds up the floor pattern. Every 10 shocks keep the floor lit 0.5s longer.',
      move: { disco: { min: 0.2 } },
      fx: { trail: '#ffb0e0', particles: 'petals', spr: { hit: 'spark_s', kill: 'star3', proc: 'sparkle' } } },
    { id: 'power_grid', tag: T, name: 'Power Grid', color: '#60ffb0', colors: ['#1a9a60', '#c0ffe0', '#ffffff'], signature: 'powerGrid',
      desc: 'Only one grid, and it follows you. Casting again refreshes it.',
      move: { powerGrid: {} },
      fx: { trail: '#c0ffe0', particles: 'sparks', spr: { hit: 'spark_s', kill: 'spark', proc: 'circuit' } } },
    { id: 'short_fuse', tag: W, name: 'Short Fuse', color: '#ff8a30', colors: ['#a04010', '#ffc890', '#fff6a0'], signature: 'shortFuse',
      desc: 'A tile that shocks 4 foes explodes, hitting foes on nearby tiles, then turns off.',
      move: { shortFuse: { n: 4, dmg: 1 } },
      fx: { trail: '#ffc890', particles: 'embers', spr: { hit: 'spark_s', kill: 'boom_s', proc: 'boom_s' } } },
  ],
  live_wire: [
    { id: 'high_voltage', tag: A, name: 'High Voltage', color: '#fffa70', colors: ['#b0a010', '#ffffc0', '#ffffff'], signature: 'highVoltage',
      desc: 'The longer a foe stays on the wire, the more damage it takes, up to 2.5x.',
      move: { highVoltage: { per: 0.06, max: 25 } },
      fx: { trail: '#ffffc0', particles: 'sparks', spr: { hit: 'spark_s', kill: 'flash_burst', proc: 'spark' } } },
    { id: 'jump_rope', tag: T, name: 'Jump Rope', color: '#a0c0ff', colors: ['#3a5ab0', '#d0e0ff', '#ffffff'], signature: 'jumpRope',
      desc: 'The wire jumps to 2 more foes past the first, damaging along the whole line.',
      move: { jumpRope: { n: 2, range: 90, dmg: 0.35 } },
      fx: { trail: '#d0e0ff', particles: 'wind', spr: { hit: 'spark_line', kill: 'spark', proc: 'circuit' } } },
    { id: 'paralyze', tag: W, name: 'Paralyze', color: '#e0ff60', colors: ['#7a9a10', '#f4ffb0', '#ffffff'], signature: 'paralyze',
      desc: 'Foes held on the wire for 1.5s are paralyzed. They cannot be paralyzed again for a while.',
      move: { paralyze: { n: 8, t: 1.2 } },
      fx: { trail: '#f4ffb0', particles: 'sparks', spr: { hit: 'circuit', kill: 'spark', proc: 'circuit' } } },
  ],

  // --- Grass -------------------------------------------------------------------------------------
  leaf_arrow: [
    { id: 'leaf_storm', tag: A, name: 'Leaf Storm', color: '#7fe08a', colors: ['#2a8a30', '#c4f29a', '#ffffff'], signature: 'leafStorm',
      desc: 'Each foe pierced releases 2 sharp leaves that fly out to the sides.',
      move: { leafStorm: { dmg: 0.3, max: 16 } },
      fx: { trail: '#c4f29a', particles: 'leaves', spr: { trail: 'blade', hit: 'slash', kill: 'ring_m', proc: 'ring_blade' } } },
    { id: 'pin_down', tag: T, name: 'Pin Down', color: '#c8a060', colors: ['#6a4a20', '#e8d0a0', '#ffffff'], signature: 'pinDown',
      desc: 'The arrow sticks in the ground for 2s, rooting nearby foes in place.',
      move: { pinDown: { t: 2, r: 30, dmg: 0.2, max: 4 } },
      fx: { trail: '#e8d0a0', particles: 'sand', spr: { hit: 'hook', kill: 'land_dust', proc: 'land_dust' } } },
    { id: 'overgrowth', tag: W, name: 'Overgrowth', color: '#ff9ad8', colors: ['#c04090', '#ffd0ec', '#7fe08a'], signature: 'overgrowth',
      desc: 'Pierced foes sprout a bud that bursts 2s later, hitting foes around it.',
      move: { overgrowth: { t: 2, dmg: 0.8, r: 26 } },
      fx: { trail: '#ffd0ec', particles: 'petals', spr: { hit: 'sparkle', kill: 'ring_m', proc: 'sparkle' } } },
  ],
  spirit_shackle: [
    { id: 'deep_shadow', tag: A, name: 'Deep Shadow', color: '#6a4aa0', colors: ['#2a1a50', '#b0a0e0', '#a0f0d0'], signature: 'deepShadow',
      desc: 'Arrows leave a shadow on the ground for 1.5s that slows and damages foes crossing it.',
      move: { deepShadow: { t: 1.5, dmg: 0.08 } },
      fx: { trail: '#b0a0e0', particles: 'shadows', spr: { trail: 'slit', hit: 'oval', kill: 'death_flash', proc: 'oval' } } },
    { id: 'soul_tether', tag: T, name: 'Soul Tether', color: '#a0f0d0', colors: ['#2a8a70', '#d0fff0', '#ffffff'], signature: 'soulTether',
      desc: 'Pierced foes are chained in place for 3s and can only move a short distance.',
      move: { soulTether: { t: 3, r: 40 } },
      fx: { trail: '#d0fff0', particles: 'spirit', spr: { hit: 'hook', kill: 'guard_break', proc: 'guard_ring' } } },
    { id: 'haunt', tag: W, name: 'Haunt', color: '#c0a0ff', colors: ['#5a3aa0', '#e8d8ff', '#ff9ad8'], signature: 'haunt',
      desc: 'Foes killed by arrows become ghosts that attack other foes for 3s, up to 3 at once.',
      move: { haunt: { t: 3, dmg: 0.35, max: 3 } },
      fx: { trail: '#e8d8ff', particles: 'spirit', spr: { hit: 'oval', kill: 'death_flash', proc: 'death_flash' } } },
  ],
  seed_bomb: [
    { id: 'chain_bloom', tag: A, name: 'Chain Bloom', color: '#a0e060', colors: ['#4a8a10', '#d8f8a0', '#ffffff'], signature: 'chainBloom',
      desc: 'Each blast drops 2 smaller seeds that explode again shortly after.',
      move: { chainBloom: { n: 2, t: 0.7, dmg: 0.5, r: 26 } },
      fx: { trail: '#d8f8a0', particles: 'leaves', spr: { hit: 'ring_s', kill: 'boom_s', proc: 'ring_m' } } },
    { id: 'root_mine', tag: T, name: 'Root Mine', color: '#a07848', colors: ['#5a3a18', '#e0c090', '#ffffff'], signature: 'rootMine',
      desc: 'Seeds stay planted for 6s and explode when a foe steps on them.',
      move: { rootMine: { t: 6, r: 14 } },
      fx: { trail: '#e0c090', particles: 'mud', spr: { hit: 'dust', kill: 'land_dust', proc: 'land_dust' } } },
    { id: 'pollen', tag: W, name: 'Pollen', color: '#fff070', colors: ['#c0a010', '#fff8c0', '#ff9ad8'], signature: 'pollen',
      desc: 'Each blast leaves a pollen cloud for 2.5s that puts foes to sleep once.',
      move: { pollen: { t: 2.5, r: 36, sleep: 1.5 } },
      fx: { trail: '#fff8c0', particles: 'petals', spr: { hit: 'motes', kill: 'sparkle', proc: 'motes' } } },
  ],
  leech_seed: [
    { id: 'vampire', tag: A, name: 'Vampire', color: '#e04060', colors: ['#801020', '#ffa0b0', '#ffffff'], signature: 'vampire',
      desc: 'The lower your HP, the faster the seeds drain, up to 2.5x.',
      move: { vampire: { max: 1.5 } },
      fx: { trail: '#ffa0b0', particles: 'embers', spr: { hit: 'motes', kill: 'death_flash', proc: 'ring_m' } } },
    { id: 'seedling', tag: T, name: 'Seedling', color: '#60c060', colors: ['#1a6a20', '#b0f0a0', '#fff6a0'], signature: 'seedling',
      desc: 'Seeds are planted on the ground and grow into sprouts for 5s that whip and drain nearby foes.',
      move: { seedling: { t: 5, range: 60 } },
      fx: { trail: '#b0f0a0', particles: 'leaves', spr: { hit: 'ring_s', kill: 'sparkle', proc: 'ring_m' } } },
    { id: 'parasite', tag: W, name: 'Parasite', color: '#c0a0e0', colors: ['#5a3a80', '#e8d8f8', '#7fe08a'], signature: 'parasite',
      desc: 'Every second, a seed spreads to a nearby foe, up to 3.',
      move: { parasite: { every: 1, n: 3, range: 30 } },
      fx: { trail: '#e8d8f8', particles: 'toxic', spr: { hit: 'hook', kill: 'ring_m', proc: 'ring_s' } } },
  ],
  solar_beam: [
    { id: 'focus_beam', tag: A, name: 'Focus Beam', color: '#ffe060', colors: ['#c09010', '#fff4b0', '#ffffff'], signature: 'focusBeam',
      desc: 'The beam becomes thin and lasts 1.2s, following its target.',
      move: { focusBeam: { t: 1.2, dmg: 0.45 } },
      fx: { trail: '#fff4b0', particles: 'stars', spr: { hit: 'ray', kill: 'flash_burst', proc: 'beam_flash' } } },
    { id: 'solar_flare', tag: T, name: 'Solar Flare', color: '#ff8a30', colors: ['#b03a10', '#ffc890', '#fff6a0'], signature: 'solarFlare',
      desc: 'No beam: a sun blast hits the biggest group of foes and sets them on fire.',
      move: { solarFlare: { dmg: 1.3, r: 56 } },
      fx: { trail: '#ffc890', particles: 'embers', spr: { hit: 'boom_fire', kill: 'boom', proc: 'flash_burst' } } },
    { id: 'photosynthesis', tag: W, name: 'Photosynthesis', color: '#7fe0a0', colors: ['#1a8a50', '#c0f8d8', '#fff6a0'], signature: 'photosynthesis',
      desc: 'Each foe the beam hits heals you a little, up to 4% HP per second.',
      move: { photosynthesis: { per: 0.002, cap: 0.04 } },
      fx: { trail: '#c0f8d8', particles: 'leaves', spr: { hit: 'sparkle', kill: 'shine', proc: 'shine' } } },
  ],
  grass_knot: [
    { id: 'tight_knot', tag: A, name: 'Tight Knot', color: '#4aa040', colors: ['#1a5a18', '#a0e090', '#ffffff'], signature: 'tightKnot',
      desc: 'The knot trips its foe 3 times, 0.7s apart.',
      move: { tightKnot: { n: 3, gap: 0.7 } },
      fx: { trail: '#a0e090', particles: 'leaves', spr: { hit: 'hook', kill: 'land_dust', proc: 'land_dust' } } },
    { id: 'snare', tag: T, name: 'Snare', color: '#c0b060', colors: ['#6a5a18', '#f0e8b0', '#ffffff'], signature: 'snare',
      desc: 'The knot holds its foe for 2.5s and trips any other foe that walks into it.',
      move: { snare: { t: 2.5 } },
      fx: { trail: '#f0e8b0', particles: 'sand', spr: { hit: 'hook', kill: 'land_dust', proc: 'ring_s' } } },
    { id: 'thorn_knot', tag: W, name: 'Thorn Knot', color: '#a04060', colors: ['#5a1020', '#e8a0b8', '#7fe08a'], signature: 'thornKnot',
      desc: 'Where a foe falls, thorns stay for 2s that hurt and slow foes walking on them.',
      move: { thornKnot: { t: 2, dmg: 0.3 } },
      fx: { trail: '#e8a0b8', particles: 'petals', spr: { hit: 'slash', kill: 'shard', proc: 'hash' } } },
  ],
  wood_hammer: [
    { id: 'rolling_log', tag: A, name: 'Rolling Log', color: '#a06a30', colors: ['#5a3010', '#e0b070', '#fff0c0'], signature: 'rollingLog',
      desc: 'The log rolls twice as far, and each foe it hits makes it deal 10% more damage.',
      move: { rollingLog: { per: 0.1 } },
      fx: { trail: '#e0b070', particles: 'rock', spr: { hit: 'punch', kill: 'land_dust', proc: 'land_dust' } } },
    { id: 'timber', tag: T, name: 'Timber', color: '#d8b070', colors: ['#7a5020', '#f8e0b0', '#ffffff'], signature: 'timber',
      desc: 'The log splits on landing into 3 smaller logs that roll out in a fan.',
      move: { timber: {} },
      fx: { trail: '#f8e0b0', particles: 'sand', spr: { hit: 'punch_s', kill: 'land_dust', proc: 'land_dust' } } },
    { id: 'sapling', tag: W, name: 'Sapling', color: '#60e080', colors: ['#1a7a30', '#c0f8c8', '#ffe070'], signature: 'sapling',
      desc: 'Where the log stops, a sapling grows for 4s that pulls foes in and whips them.',
      move: { sapling: { t: 4, range: 90 } },
      fx: { trail: '#c0f8c8', particles: 'leaves', spr: { hit: 'ring_s', kill: 'sparkle', proc: 'ring_m' } } },
  ],

  // --- Flying ------------------------------------------------------------------------------------
  whirlwind: [
    { id: 'pinball', tag: A, name: 'Pinball', color: '#80d0ff', colors: ['#2a70b0', '#c8ecff', '#ffffff'], signature: 'pinball',
      desc: 'Foes blown into other foes send them flying too, in a chain.',
      move: { pinball: { keep: 0.7 } },
      fx: { trail: '#c8ecff', particles: 'wind', spr: { hit: 'punch_s', kill: 'ring_m', proc: 'punch' } } },
    { id: 'wind_wall', tag: T, name: 'Wind Wall', color: '#d0e8f8', colors: ['#6a8aa0', '#f0f8ff', '#ffffff'], signature: 'windWall',
      desc: 'No blast: a wind wall stands in front of you for 1.5s, turning with you and pushing foes back.',
      move: { windWall: { t: 1.5 } },
      fx: { trail: '#f0f8ff', particles: 'wind', spr: { hit: 'ring_s', kill: 'ring_m', proc: 'guard_ring' } } },
    { id: 'dust_devil', tag: W, name: 'Dust Devil', color: '#d8c48a', colors: ['#7a6030', '#f0e0b0', '#ffffff'], signature: 'dustDevil',
      desc: 'Foes hit are confused for 1.5s and wander into each other.',
      move: { dustDevil: { t: 1.5 } },
      fx: { trail: '#f0e0b0', particles: 'sand', spr: { hit: 'dust', kill: 'slide_dust', proc: 'dust' } } },
  ],
  pin_missile: [
    { id: 'pin_cushion', tag: A, name: 'Pin Cushion', color: '#ff7a9a', colors: ['#a02040', '#ffc0d0', '#ffffff'], signature: 'pinCushion',
      desc: 'Needles stick in foes. At 6 needles, they all burst out at once.',
      move: { pinCushion: { n: 6, t: 3, dmg: 2, r: 22 } },
      fx: { trail: '#ffc0d0', particles: 'sparks', spr: { hit: 'shard', kill: 'gibs', proc: 'shard' } } },
    { id: 'needle_rain', tag: T, name: 'Needle Rain', color: '#b0b8d0', colors: ['#4a5070', '#e0e4f0', '#ffffff'], signature: 'needleRain',
      desc: 'Needles shoot up and rain down in a ring around the nearest foe.',
      move: { needleRain: { r: 34, dmg: 1.6 } },
      fx: { trail: '#e0e4f0', particles: 'wind', spr: { hit: 'shard', kill: 'dust', proc: 'ring_s' } } },
    { id: 'quill_shed', tag: W, name: 'Quill Shed', color: '#e0c060', colors: ['#806010', '#f8e8b0', '#ffffff'], signature: 'quillShed',
      desc: 'Each needle leaves a quill on the ground that hurts and slows the first foe to step on it.',
      move: { quillShed: { t: 4, dmg: 0.6, max: 20 } },
      fx: { trail: '#f8e8b0', particles: 'sand', spr: { hit: 'shard', kill: 'dust', proc: 'hash' } } },
  ],
  feather_dance: [
    { id: 'downpour', tag: A, name: 'Downpour', color: '#c8e0ff', colors: ['#5a7ab0', '#e8f0ff', '#ffffff'], signature: 'downpour',
      desc: 'Feathers also keep falling on nearby foes.',
      move: { downpour: { every: 0.4, range: 130, dmg: 0.5 } },
      fx: { trail: '#e8f0ff', particles: 'snow', spr: { hit: 'ring_s', kill: 'sparkle', proc: 'ring_s' } } },
    { id: 'whirl_feathers', tag: T, name: 'Whirling Feathers', color: '#ffd0f0', colors: ['#b05090', '#fff0f8', '#ffffff'], signature: 'whirlFeathers',
      desc: 'Feathers spin around you for 3s, hitting and knocking back foes they touch.',
      move: { whirlFeathers: { t: 3, r: 40 } },
      fx: { trail: '#fff0f8', particles: 'petals', spr: { hit: 'ring_s', kill: 'ring_m', proc: 'guard_ring' } } },
    { id: 'tickle', tag: W, name: 'Tickle', color: '#fff080', colors: ['#b0a020', '#fff8c8', '#ff9ad8'], signature: 'tickle',
      desc: 'Foes hit by a feather stop to laugh and are confused for 2s.',
      move: { tickle: { t: 2 } },
      fx: { trail: '#fff8c8', particles: 'stars', spr: { hit: 'notes', kill: 'star3', proc: 'sparkle' } } },
  ],
  drill_peck: [
    { id: 'excavate', tag: A, name: 'Excavate', color: '#c09060', colors: ['#6a4020', '#ecd0a8', '#ffffff'], signature: 'excavate',
      desc: 'When the drill stops, it bursts out of the ground. The more foes it drilled, the bigger the burst.',
      move: { excavate: { r: 30, per: 0.3 } },
      fx: { trail: '#ecd0a8', particles: 'rock', spr: { hit: 'dust', kill: 'land_dust', proc: 'land_dust' } } },
    { id: 'carom_drill', tag: T, name: 'Carom Drill', color: '#a0f0ff', colors: ['#2a90a0', '#d8fcff', '#ffffff'], signature: 'caromDrill',
      desc: 'At the end of its path, the drill turns to a new foe and keeps going, twice.',
      move: { caromDrill: { n: 2 } },
      fx: { trail: '#d8fcff', particles: 'wind', spr: { trail: 'streak', hit: 'ring_s', kill: 'ring_m', proc: 'ring_s' } } },
    { id: 'shrapnel', tag: W, name: 'Shrapnel', color: '#d0d8e0', colors: ['#5a6070', '#f0f4f8', '#ff9a60'], signature: 'shrapnel',
      desc: 'Each foe drilled releases metal shards that hit the 2 nearest foes.',
      move: { shrapnel: { n: 2, dmg: 0.35 } },
      fx: { trail: '#f0f4f8', particles: 'rock', spr: { hit: 'shard', kill: 'gibs', proc: 'shard' } } },
  ],
  sky_attack: [
    { id: 'skyfall', tag: A, name: 'Skyfall', color: '#fff6c0', colors: ['#c0a040', '#fffbe0', '#ffffff'], signature: 'skyfall',
      desc: 'A second strike falls where the dive ends, stunning foes.',
      move: { skyfall: { dmg: 1.6, r: 36 } },
      fx: { trail: '#fffbe0', particles: 'stars', spr: { hit: 'shine', kill: 'flash_burst', proc: 'flash_burst' } } },
    { id: 'aeroblast', tag: T, name: 'Aeroblast', color: '#b0d8ff', colors: ['#3a6ab0', '#e0f0ff', '#ffffff'], signature: 'aeroblast',
      desc: 'The dive becomes a wide wind blast that does not slow down and pushes foes aside.',
      move: { aeroblast: {} },
      fx: { trail: '#e0f0ff', particles: 'wind', spr: { trail: 'streak', hit: 'ring_s', kill: 'ring_l', proc: 'ring_m' } } },
    { id: 'plumage', tag: W, name: 'Plumage', color: '#ffb0d8', colors: ['#b04080', '#ffe0f0', '#ffffff'], signature: 'plumage',
      desc: 'Foes hit by the dive get feathers: for 3s, all knockback sends them 3x farther.',
      move: { plumage: {} },
      fx: { trail: '#ffe0f0', particles: 'petals', spr: { hit: 'motes', kill: 'sparkle', proc: 'ring_s' } } },
  ],
  sky_guard: [
    { id: 'divebomb', tag: A, name: 'Divebomb', color: '#f0f0ff', colors: ['#7070a0', '#ffffff', '#fff6a0'], signature: 'divebomb',
      desc: 'Every 2s the guard dives on a foe from above, stunning where it lands.',
      move: { divebomb: { every: 2, dmg: 1.5, r: 26 } },
      fx: { trail: '#ffffff', particles: 'wind', spr: { hit: 'punch', kill: 'land_dust', proc: 'land_dust' } } },
    { id: 'escort', tag: T, name: 'Escort', color: '#90e0c0', colors: ['#2a8a60', '#d0fff0', '#ffffff'], signature: 'escort',
      desc: 'The guard circles close to you and blocks enemy shots that get near.',
      move: { escort: { r: 30, spin: 3.2 } },
      fx: { trail: '#d0fff0', particles: 'spirit', spr: { hit: 'guard_ring', kill: 'ring_m', proc: 'guard_ring' } } },
    { id: 'molt', tag: W, name: 'Molt', color: '#ffe0a0', colors: ['#b08030', '#fff4d8', '#ffffff'], signature: 'molt',
      desc: 'The guard drops feathers. Each one you walk over heals 1% HP.',
      move: { molt: { every: 0.8, max: 6, heal: 0.01 } },
      fx: { trail: '#fff4d8', particles: 'snow', spr: { hit: 'ring_s', kill: 'sparkle', proc: 'sparkle' } } },
  ],
  tailwind: [
    { id: 'jetstream', tag: A, name: 'Jetstream', color: '#60b0ff', colors: ['#1a5ab0', '#c0e0ff', '#ffffff'], signature: 'jetstream',
      desc: 'The faster you run, the harder the streams hit, up to 2.5x.',
      move: { jetstream: { max: 1.5 } },
      fx: { trail: '#c0e0ff', particles: 'wind', spr: { trail: 'streak', hit: 'ring_s', kill: 'ring_m', proc: 'streak' } } },
    { id: 'eye_of_storm', tag: T, name: 'Eye of the Storm', color: '#a0a8c8', colors: ['#3a4060', '#d8dcf0', '#ffffff'], signature: 'eyeOfStorm',
      desc: 'Stop after running for 1s and the streams form a spinning ring around you for 1.5s.',
      move: { eyeOfStorm: { run: 1, t: 1.5, r: 42, dmg: 0.6 } },
      fx: { trail: '#d8dcf0', particles: 'wind', spr: { hit: 'ring_s', kill: 'ring_l', proc: 'ring_l' } } },
    { id: 'crosswind', tag: W, name: 'Crosswind', color: '#c0f0a0', colors: ['#4a8a20', '#e8ffd8', '#ffffff'], signature: 'crosswind',
      desc: 'Streams push foes sideways off your path. A foe thrown into another hurts both.',
      move: { crosswind: { dmg: 0.5 } },
      fx: { trail: '#e8ffd8', particles: 'leaves', spr: { hit: 'punch_s', kill: 'ring_m', proc: 'punch_s' } } },
  ],

  // --- Ghost -------------------------------------------------------------------------------------
  pulse_aura: [
    { id: 'night_shade', tag: A, name: 'Night Shade', color: '#8a6ae0', colors: ['#3a2a80', '#c8b8ff', '#ffffff'], signature: 'nightShade',
      desc: 'The aura also deals fixed damage equal to 1.5x your level, ignoring type and armor.',
      move: { nightShade: { per: 1.5, gap: 0.5 } },
      fx: { trail: '#c8b8ff', particles: 'shadows', spr: { hit: 'oval', kill: 'death_flash', proc: 'oval' } } },
    { id: 'phantom_ring', tag: T, name: 'Phantom Ring', color: '#a0f0d0', colors: ['#2a8a70', '#d0fff0', '#ffffff'], signature: 'phantomRing',
      desc: 'The aura becomes a ring that grows out from you and back, hitting hard only at its edge.',
      move: { phantomRing: { max: 80, speed: 2.4, dmg: 1.4 } },
      fx: { trail: '#d0fff0', particles: 'spirit', spr: { hit: 'ring_s', kill: 'ring_m', proc: 'ring_l' } } },
    { id: 'spite', tag: W, name: 'Spite', color: '#ff7ab0', colors: ['#a02060', '#ffc0d8', '#c49aff'], signature: 'spite',
      desc: 'Enemy shots vanish inside the aura, and foes in it are weakened and slowed.',
      move: { spite: {} },
      fx: { trail: '#ffc0d8', particles: 'petals', spr: { hit: 'guard_ring', kill: 'death_flash', proc: 'guard_break' } } },
  ],
  shadow_ball: [
    { id: 'umbra', tag: A, name: 'Umbra', color: '#5a3aa0', colors: ['#20103a', '#a08ae0', '#e8d8ff'], signature: 'umbra',
      desc: 'Foes hit take 25% more damage from everything for 3s.',
      move: { umbra: { t: 3, mul: 0.25 } },
      fx: { trail: '#a08ae0', particles: 'shadows', spr: { hit: 'oval', kill: 'death_flash', proc: 'oval' } } },
    { id: 'nightfall', tag: T, name: 'Nightfall', color: '#3a4a90', colors: ['#101830', '#8090d8', '#c49aff'], signature: 'nightfall',
      desc: 'No lob: the ball drops from the sky on the biggest group and bursts into shadow orbs that roll out.',
      move: { nightfall: { dmg: 1.2, r: 30 } },
      fx: { trail: '#8090d8', particles: 'shadows', spr: { hit: 'ring_s', kill: 'boom_s', proc: 'ring_m' } } },
    { id: 'enthrall', tag: W, name: 'Enthrall', color: '#ff9ad8', colors: ['#a04080', '#ffd0ec', '#ffffff'], signature: 'enthrall',
      desc: 'Foes hit by the burst have a 30% chance to be charmed for 2s and fight for you.',
      move: { enthrall: { chance: 0.3, t: 2 } },
      fx: { trail: '#ffd0ec', particles: 'petals', spr: { hit: 'pink_flash', kill: 'death_flash', proc: 'pink_flash' } } },
  ],
  shadow_storm: [
    { id: 'tempest', tag: A, name: 'Tempest', color: '#7a5ae0', colors: ['#2a1a70', '#c0b0ff', '#ffffff'], signature: 'tempest',
      desc: 'Where the storm bursts, 4 shadow orbs circle briefly, then fly outward.',
      move: { tempest: { n: 4, hold: 0.6, dmg: 0.25 } },
      fx: { trail: '#c0b0ff', particles: 'shadows', spr: { hit: 'oval', kill: 'ring_m', proc: 'spin_oval' } } },
    { id: 'black_hole', tag: T, name: 'Black Hole', color: '#2a2040', colors: ['#0a0614', '#6a5a90', '#c49aff'], signature: 'blackHole',
      desc: 'The storm leaves a black hole for 1.5s that pulls foes in.',
      move: { blackHole: { t: 1.5, r: 60, dmg: 0.08, max: 1 } },
      fx: { trail: '#6a5a90', particles: 'shadows', spr: { hit: 'ring_s', kill: 'death_flash', proc: 'ring_l' } } },
    { id: 'shadow_surge', tag: W, name: 'Shadow Surge', color: '#c070ff', colors: ['#5a1a90', '#e8c0ff', '#ffffff'], signature: 'shadowSurge',
      desc: 'Each burst within 2s of the last is wider, stacking up to 5 times.',
      move: { shadowSurge: { window: 2, max: 5, per: 0.15 } },
      fx: { trail: '#e8c0ff', particles: 'spirit', spr: { hit: 'spark_s', kill: 'flash_burst', proc: 'ring_m' } } },
  ],
  poltergeist: [
    { id: 'heavy_haunt', tag: A, name: 'Heavy Haunt', color: '#a07848', colors: ['#5a3818', '#e0c090', '#c49aff'], signature: 'heavyHaunt',
      desc: 'Rocks hit harder the longer they float, and are thrown at the toughest nearby foe, stunning it.',
      move: { heavyHaunt: { per: 1, max: 1.5 } },
      fx: { trail: '#e0c090', particles: 'rock', spr: { hit: 'punch', kill: 'land_dust', proc: 'land_dust' } } },
    { id: 'junk_orbit', tag: T, name: 'Junk Orbit', color: '#a0c8e0', colors: ['#3a6080', '#d8ecf8', '#ffffff'], signature: 'junkOrbit',
      desc: 'Rocks circle you for 3s, hitting foes they touch, before being thrown.',
      move: { junkOrbit: { t: 3 } },
      fx: { trail: '#d8ecf8', particles: 'rock', spr: { hit: 'punch_s', kill: 'ring_m', proc: 'guard_ring' } } },
    { id: 'possess', tag: W, name: 'Possess', color: '#9af0d8', colors: ['#2a8a70', '#d0fff0', '#c49aff'], signature: 'possess',
      desc: 'Foes hit by a rock are possessed and thrown at the next foe.',
      move: { possess: { t: 0.8, dmg: 0.7 } },
      fx: { trail: '#d0fff0', particles: 'spirit', spr: { hit: 'death_flash', kill: 'ring_m', proc: 'death_flash' } } },
  ],
  mean_look: [
    { id: 'glare', tag: A, name: 'Glare', color: '#ffd040', colors: ['#a07010', '#fff0a0', '#ffffff'], signature: 'glare',
      desc: 'Each stare has a 25% chance to paralyze foes in view for 0.5s.',
      move: { glare: { chance: 0.25, t: 0.5 } },
      fx: { trail: '#fff0a0', particles: 'sparks', spr: { hit: 'spark_s', kill: 'flash_burst', proc: 'circuit' } } },
    { id: 'evil_eye', tag: T, name: 'Evil Eye', color: '#c04040', colors: ['#601010', '#ff9090', '#ffd040'], signature: 'evilEye',
      desc: 'The eye floats over you for 5s instead, catching and holding foes that get close.',
      move: { evilEye: { t: 5 } },
      fx: { trail: '#ff9090', particles: 'embers', spr: { hit: 'oval', kill: 'death_flash', proc: 'guard_ring' } } },
    { id: 'nightmare', tag: W, name: 'Nightmare', color: '#6a4ab0', colors: ['#20103a', '#b0a0e0', '#ff7ab0'], signature: 'nightmare',
      desc: 'Foes caught by the stare fall asleep for 2s, and take 50% more from it while asleep.',
      move: { nightmare: { t: 2, mul: 1.5 } },
      fx: { trail: '#b0a0e0', particles: 'shadows', spr: { hit: 'notes', kill: 'death_flash', proc: 'oval' } } },
  ],
  curse: [
    { id: 'lingering_curse', tag: A, name: 'Lingering Curse', color: '#a050c0', colors: ['#40104a', '#e0b0f0', '#ffffff'], signature: 'lingeringCurse',
      desc: 'When the cursed foe dies, the curse jumps to the nearest foe with its remaining time.',
      move: { lingeringCurse: { range: 90 } },
      fx: { trail: '#e0b0f0', particles: 'spirit', spr: { hit: 'oval', kill: 'death_flash', proc: 'death_flash' } } },
    { id: 'doom_curse', tag: T, name: 'Doom Curse', color: '#303050', colors: ['#0a0a18', '#7070a0', '#ff5a5a'], signature: 'doomCurse',
      desc: 'The curse stores all its damage and deals it at the end, +30%, also hitting nearby foes.',
      move: { doomCurse: { mul: 1.3, r: 30, splash: 0.3 } },
      fx: { trail: '#7070a0', particles: 'shadows', spr: { hit: 'ring_s', kill: 'boom', proc: 'beam_boom' } } },
    { id: 'spite_curse', tag: W, name: 'Spite Curse', color: '#ff6a9a', colors: ['#901040', '#ffb8d0', '#c49aff'], signature: 'spiteCurse',
      desc: 'Each curse tick also hits nearby foes for 25% damage.',
      move: { spiteCurse: { r: 30, dmg: 0.25 } },
      fx: { trail: '#ffb8d0', particles: 'petals', spr: { hit: 'pink_flash', kill: 'death_flash', proc: 'ring_m' } } },
  ],
  hex: [
    { id: 'wild_hex', tag: A, name: 'Wild Hex', color: '#e070ff', colors: ['#701090', '#f8c8ff', '#ffffff'], signature: 'wildHex',
      desc: 'Each hex burst jumps once to the nearest other foe with a status effect.',
      move: { wildHex: { range: 70, dmg: 0.6 } },
      fx: { trail: '#f8c8ff', particles: 'spirit', spr: { hit: 'spark_s', kill: 'death_flash', proc: 'spark' } } },
    { id: 'cursed_flame', tag: T, name: 'Cursed Flame', color: '#7a3ad0', colors: ['#2a1050', '#c0a0ff', '#ff9a40'], signature: 'cursedFlame',
      desc: 'Hex fire keeps burning its foe for 2s, counting as a status for the next hex.',
      move: { cursedFlame: { t: 2, dmg: 0.15 } },
      fx: { trail: '#c0a0ff', particles: 'embers', spr: { hit: 'boom_fire', kill: 'death_flash', proc: 'boom_fire' } } },
    { id: 'spread_hex', tag: W, name: 'Spread Hex', color: '#80e060', colors: ['#2a7a10', '#d0f8b0', '#c49aff'], signature: 'spreadHex',
      desc: 'A hexed foe spreads its burns, slows, stuns and confusion to the 2 nearest foes.',
      move: { spreadHex: { range: 60, n: 2 } },
      fx: { trail: '#d0f8b0', particles: 'toxic', spr: { hit: 'ring_s', kill: 'ring_m', proc: 'ring_s' } } },
  ],

  // --- Poison ------------------------------------------------------------------------------------
  toxic_trail: [
    { id: 'miasma', tag: A, name: 'Miasma', color: '#9050d0', colors: ['#3a1060', '#d0a8f8', '#ffffff'], signature: 'miasma',
      desc: 'Poison clouds float toward the nearest foe until they fade.',
      move: { miasma: { range: 120, speed: 40 } },
      fx: { trail: '#d0a8f8', particles: 'toxic', spr: { hit: 'motes', kill: 'death_flash', proc: 'ring_s' } } },
    { id: 'smokescreen', tag: T, name: 'Smokescreen', color: '#8a8a96', colors: ['#3a3a44', '#c8c8d0', '#ffffff'], signature: 'smokescreen',
      desc: 'Stand in your newest cloud and nearby foes lose track of you and wander off confused.',
      move: { smokescreen: { range: 130 } },
      fx: { trail: '#c8c8d0', particles: 'smoke', spr: { hit: 'dust', kill: 'slide_dust', proc: 'dust' } } },
    { id: 'contagion_cloud', tag: W, name: 'Contagion Cloud', color: '#70d060', colors: ['#1a6a10', '#c8f8b0', '#c070e0'], signature: 'contagionCloud',
      desc: 'Foes that walk through a cloud carry poison for 2s, poisoning foes next to them.',
      move: { contagionCloud: { t: 2, dmg: 0.3, max: 10 } },
      fx: { trail: '#c8f8b0', particles: 'toxic', spr: { hit: 'motes', kill: 'ring_m', proc: 'ring_s' } } },
  ],
  sludge_bomb: [
    { id: 'glue', tag: A, name: 'Glue', color: '#c0a060', colors: ['#6a4a18', '#f0e0b0', '#ffffff'], signature: 'glue',
      desc: 'Blasts glue foes in place for 1.2s and pull in foes at the edge.',
      move: { glue: { t: 1.2, slow: 0.7 } },
      fx: { trail: '#f0e0b0', particles: 'mud', spr: { hit: 'hook', kill: 'land_dust', proc: 'ring_m' } } },
    { id: 'rolling_sludge', tag: T, name: 'Rolling Sludge', color: '#60a040', colors: ['#1a4a10', '#b0e090', '#c070e0'], signature: 'rollingSludge',
      desc: 'Armed globs slowly roll toward the nearest foe.',
      move: { rollingSludge: { range: 140, speed: 32 } },
      fx: { trail: '#b0e090', particles: 'toxic', spr: { hit: 'dust', kill: 'boom_s', proc: 'slide_dust' } } },
    { id: 'splatter', tag: W, name: 'Splatter', color: '#e070c0', colors: ['#801060', '#ffc0e8', '#ffffff'], signature: 'splatter',
      desc: 'Blasts throw 4 drops that leave small puddles, burning and slowing for 2s.',
      move: { splatter: { n: 4, t: 2, dmg: 0.35 } },
      fx: { trail: '#ffc0e8', particles: 'petals', spr: { hit: 'ring_s', kill: 'boom_s', proc: 'ring_s' } } },
  ],
  gunk_shot: [
    { id: 'toxic_waste', tag: A, name: 'Toxic Waste', color: '#a0e040', colors: ['#3a6a10', '#e0ffa0', '#ffffff'], signature: 'toxicWaste',
      desc: 'Pools grow 50% bigger before they dry up.',
      move: { toxicWaste: { grow: 1.5 } },
      fx: { trail: '#e0ffa0', particles: 'toxic', spr: { hit: 'motes', kill: 'ring_m', proc: 'ring_m' } } },
    { id: 'stench', tag: T, name: 'Stench', color: '#b0a060', colors: ['#5a4a18', '#e8e0a8', '#c070e0'], signature: 'stench',
      desc: 'Foes are pushed away from your pools when they get close.',
      move: { stench: { reach: 1.6, push: 60 } },
      fx: { trail: '#e8e0a8', particles: 'smoke', spr: { hit: 'dust', kill: 'slide_dust', proc: 'dust' } } },
    { id: 'sludge_quake', tag: W, name: 'Sludge Quake', color: '#c070e0', colors: ['#5a1a80', '#f0c8ff', '#ffffff'], signature: 'sludgeQuake',
      desc: 'Where a glob bursts, nearby foes are knocked up and stunned.',
      move: { sludgeQuake: { r: 1.3, dmg: 0.4, stun: 0.6 } },
      fx: { trail: '#f0c8ff', particles: 'rock', spr: { hit: 'land_dust', kill: 'boom', proc: 'land_dust' } } },
  ],
  acid_spray: [
    { id: 'meltdown', tag: A, name: 'Meltdown', color: '#c0ff40', colors: ['#4a7a10', '#e8ffb0', '#ffffff'], signature: 'meltdown',
      desc: 'Foes with no armor left take 50% more damage from everything while in acid.',
      move: { meltdown: { mul: 0.5 } },
      fx: { trail: '#e8ffb0', particles: 'toxic', spr: { hit: 'motes', kill: 'death_flash', proc: 'shard' } } },
    { id: 'acid_wave', tag: T, name: 'Acid Wave', color: '#60e0a0', colors: ['#1a7a50', '#c0f8e0', '#ffffff'], signature: 'acidWave',
      desc: 'Puddles move forward as a spreading wave of acid.',
      move: { acidWave: {} },
      fx: { trail: '#c0f8e0', particles: 'bubbles', spr: { hit: 'ring_s', kill: 'slide_dust', proc: 'slide_dust' } } },
    { id: 'corrosive_gas', tag: W, name: 'Corrosive Gas', color: '#d0d060', colors: ['#6a6a18', '#f0f0b0', '#c070e0'], signature: 'corrosiveGas',
      desc: 'Puddles give off fumes that slowly melt the armor of nearby foes.',
      move: { corrosiveGas: { reach: 22 } },
      fx: { trail: '#f0f0b0', particles: 'smoke', spr: { hit: 'dust', kill: 'ring_m', proc: 'dust' } } },
  ],
  toxic_spikes: [
    { id: 'venom_barbs', tag: A, name: 'Venom Barbs', color: '#e060ff', colors: ['#701090', '#f8c0ff', '#ffffff'], signature: 'venomBarbs',
      desc: 'Each barb hit adds a poison stack, up to 5. Each stack is stronger than the last.',
      move: { venomBarbs: { t: 3, max: 5, per: 0.12 } },
      fx: { trail: '#f8c0ff', particles: 'toxic', spr: { hit: 'shard', kill: 'death_flash', proc: 'shard' } } },
    { id: 'caltrops', tag: T, name: 'Caltrops', color: '#a0a8b8', colors: ['#4a5060', '#e0e4f0', '#ffffff'], signature: 'caltrops',
      desc: 'Barbs spread out into a wide ring and stay there.',
      move: { caltrops: { r: 92, speed: 140 } },
      fx: { trail: '#e0e4f0', particles: 'rock', spr: { hit: 'shard', kill: 'dust', proc: 'hash' } } },
    { id: 'barbed_wire', tag: W, name: 'Barbed Wire', color: '#c0a080', colors: ['#5a4020', '#f0e0c8', '#ff9a60'], signature: 'barbedWire',
      desc: 'Wire links the barbs, cutting any foe that crosses it.',
      move: { barbedWire: { gap: 0.3, dmg: 0.2 } },
      fx: { trail: '#f0e0c8', particles: 'sand', spr: { hit: 'slash', kill: 'gibs', proc: 'hash' } } },
  ],
  clear_smog: [
    { id: 'thick_smog', tag: A, name: 'Thick Smog', color: '#a0a070', colors: ['#4a4a20', '#e0e0b8', '#ffffff'], signature: 'thickSmog',
      desc: 'The smog grows as it drifts, up to 60% bigger.',
      move: { thickSmog: { grow: 0.6 } },
      fx: { trail: '#e0e0b8', particles: 'smoke', spr: { hit: 'dust', kill: 'slide_dust', proc: 'dust' } } },
    { id: 'smog_breath', tag: T, name: 'Smog Breath', color: '#70c0a0', colors: ['#1a5a40', '#c0f0e0', '#ffffff'], signature: 'smogBreath',
      desc: 'You breathe out the smog: it stays right in front of you, wherever you face.',
      move: { smogBreath: {} },
      fx: { trail: '#c0f0e0', particles: 'wind', spr: { hit: 'ring_s', kill: 'dust', proc: 'ring_s' } } },
    { id: 'haze', tag: W, name: 'Haze', color: '#c0a0e0', colors: ['#5a3a80', '#e8d8f8', '#ffffff'], signature: 'haze',
      desc: 'Foes in the smog get confused and wander around.',
      move: { haze: {} },
      fx: { trail: '#e8d8f8', particles: 'spirit', spr: { hit: 'motes', kill: 'ring_m', proc: 'motes' } } },
  ],
  toxic: [
    { id: 'badly_poisoned', tag: A, name: 'Badly Poisoned', color: '#a020d0', colors: ['#40085a', '#e0a0f8', '#ffffff'], signature: 'badlyPoisoned',
      desc: 'The poison doubles 2 more times and lasts 1s longer, but ticks a bit slower.',
      move: { badlyPoisoned: { more: 2 } },
      fx: { trail: '#e0a0f8', particles: 'toxic', spr: { hit: 'motes', kill: 'death_flash', proc: 'oval' } } },
    { id: 'toxic_bloom', tag: T, name: 'Toxic Bloom', color: '#60e060', colors: ['#1a7a1a', '#c8f8c8', '#c070e0'], signature: 'toxicBloom',
      desc: 'Foes killed by poison pass it to the 2 nearest foes at full strength.',
      move: { toxicBloom: { range: 80, n: 2 } },
      fx: { trail: '#c8f8c8', particles: 'leaves', spr: { hit: 'ring_s', kill: 'ring_m', proc: 'sparkle' } } },
    { id: 'toxic_surge', tag: W, name: 'Toxic Surge', color: '#ff70a0', colors: ['#901040', '#ffc0d8', '#ffffff'], signature: 'toxicSurge',
      desc: 'On its last tick, the poison bursts, dealing 40% of its total damage to nearby foes.',
      move: { toxicSurge: { r: 26, share: 0.4 } },
      fx: { trail: '#ffc0d8', particles: 'petals', spr: { hit: 'boom_s', kill: 'boom', proc: 'boom_s' } } },
  ],

  // --- Fire, Ice, Dark ----------------------------------------------------------------------------
  ember: [
    { id: 'blaze_up', tag: A, name: 'Blaze Up', color: '#ffb040', colors: ['#a04010', '#ffd890', '#ffffff'], signature: 'blazeUp',
      desc: 'Fires burn hotter every second they last, up to 3x.',
      move: { blazeUp: { per: 0.5, max: 3 } },
      fx: { trail: '#ffd890', particles: 'embers', spr: { hit: 'boom_fire', kill: 'boom_s', proc: 'flash_burst' } } },
    { id: 'ember_rain', tag: T, name: 'Ember Rain', color: '#ff7a5a', colors: ['#902010', '#ffb8a0', '#fff0a0'], signature: 'emberRain',
      desc: 'No throw: embers keep falling on nearby foes, starting fires where they land.',
      move: { emberRain: { every: 0.2, range: 150 } },
      fx: { trail: '#ffb8a0', particles: 'embers', spr: { hit: 'spark_s', kill: 'boom_s', proc: 'spark' } } },
    { id: 'kindling', tag: W, name: 'Kindling', color: '#ffe070', colors: ['#a07010', '#fff4c0', '#ff7a1a'], signature: 'kindling',
      desc: 'A burning foe that walks into a fire makes it explode around it.',
      move: { kindling: { r: 22, dmg: 1.2 } },
      fx: { trail: '#fff4c0', particles: 'embers', spr: { hit: 'boom_fire', kill: 'boom', proc: 'boom_fire' } } },
  ],
  fire_blast: [
    { id: 'sunfire', tag: A, name: 'Sunfire', color: '#fff0a0', colors: ['#c08010', '#fffbe0', '#ffffff'], signature: 'sunfire',
      desc: 'Fires burn 2x stronger, and the center fire lasts 2x longer.',
      move: { sunfire: {} },
      fx: { trail: '#fffbe0', particles: 'stars', spr: { hit: 'flash_burst', kill: 'boom', proc: 'flash_burst' } } },
    { id: 'blast_wave', tag: T, name: 'Blast Wave', color: '#ff9040', colors: ['#a03010', '#ffc898', '#ffffff'], signature: 'blastWave',
      desc: 'Each blast also sends out a ring of fire that burns everything it passes.',
      move: { blastWave: { r: 70, dmg: 0.8 } },
      fx: { trail: '#ffc898', particles: 'embers', spr: { hit: 'ring_s', kill: 'boom_s', proc: 'ring_l' } } },
    { id: 'pyre', tag: W, name: 'Pyre', color: '#c04020', colors: ['#5a1008', '#f09878', '#ffd870'], signature: 'pyre',
      desc: 'Foes killed while burning leave a new fire where they fall.',
      move: { pyre: { t: 3, dmg: 0.8 } },
      fx: { trail: '#f09878', particles: 'smoke', spr: { hit: 'boom_fire', kill: 'death_flash', proc: 'boom_fire' } } },
  ],
  eruption: [
    { id: 'magma_surge', tag: A, name: 'Magma Surge', color: '#ff6020', colors: ['#801808', '#ffb080', '#ffe070'], signature: 'magmaSurge',
      desc: 'Each lava bomb leaves a magma pool for 2s that burns foes inside.',
      move: { magmaSurge: { t: 2, dmg: 0.25 } },
      fx: { trail: '#ffb080', particles: 'embers', spr: { hit: 'boom_fire', kill: 'boom_s', proc: 'lava' } } },
    { id: 'volcanic_vent', tag: T, name: 'Volcanic Vent', color: '#a05030', colors: ['#401808', '#e0a080', '#ff7a1a'], signature: 'volcanicVent',
      desc: 'The volcano stays where it erupted for 4s and fires over 2x as many bombs.',
      move: { volcanicVent: { t: 4 } },
      fx: { trail: '#e0a080', particles: 'rock', spr: { hit: 'boom', kill: 'land_dust', proc: 'boom' } } },
    { id: 'ash_cloud', tag: W, name: 'Ash Cloud', color: '#8a8078', colors: ['#3a3430', '#c8c0b8', '#ff9a40'], signature: 'ashCloud',
      desc: 'The eruption makes an ash cloud around you that slows and confuses foes.',
      move: { ashCloud: { t: 2.5, r: 70 } },
      fx: { trail: '#c8c0b8', particles: 'smoke', spr: { hit: 'dust', kill: 'slide_dust', proc: 'dust' } } },
  ],
  will_o_wisp: [
    { id: 'hellfire', tag: A, name: 'Hellfire', color: '#e04080', colors: ['#701030', '#ff9ac0', '#ffd870'], signature: 'hellfire',
      desc: 'Each wisp hit makes the burn on a foe stronger, up to 3x.',
      move: { hellfire: { per: 1.15, cap: 3 } },
      fx: { trail: '#ff9ac0', particles: 'embers', spr: { hit: 'boom_fire', kill: 'death_flash', proc: 'boom_fire' } } },
    { id: 'wisp_lantern', tag: T, name: 'Wisp Lantern', color: '#80c0ff', colors: ['#2a5aa0', '#c8e4ff', '#ffffff'], signature: 'wispLantern',
      desc: 'Wisps float around you instead, burning foes that get close.',
      move: { wispLantern: { spin: 1.8, r: 34 } },
      fx: { trail: '#c8e4ff', particles: 'spirit', spr: { hit: 'ring_s', kill: 'ring_m', proc: 'guard_ring' } } },
    { id: 'phantom_flame', tag: W, name: 'Phantom Flame', color: '#a070e0', colors: ['#3a1a70', '#d8c0ff', '#ffb347'], signature: 'phantomFlame',
      desc: 'Burning foes that die explode in ghost fire, hitting nearby foes.',
      move: { phantomFlame: { r: 26, dmg: 0.8 } },
      fx: { trail: '#d8c0ff', particles: 'spirit', spr: { hit: 'oval', kill: 'death_flash', proc: 'boom_fire' } } },
  ],
  heat_wave: [
    { id: 'scorch', tag: A, name: 'Scorch', color: '#ff5020', colors: ['#801408', '#ffa888', '#fff0a0'], signature: 'scorch',
      desc: 'Burning foes hit by the wave take all their remaining burn damage at once.',
      move: { scorch: { mul: 1 } },
      fx: { trail: '#ffa888', particles: 'embers', spr: { hit: 'boom_fire', kill: 'boom', proc: 'boom_fire' } } },
    { id: 'flashpoint', tag: T, name: 'Flashpoint', color: '#fff060', colors: ['#a09010', '#fffbc0', '#ff7a1a'], signature: 'flashpoint',
      desc: 'The wave bursts from the biggest group of foes instead of from you.',
      move: { flashpoint: {} },
      fx: { trail: '#fffbc0', particles: 'stars', spr: { hit: 'flash_burst', kill: 'boom', proc: 'flash_burst' } } },
    { id: 'sunstroke', tag: W, name: 'Sunstroke', color: '#ffa040', colors: ['#a05010', '#ffd8a8', '#ffffff'], signature: 'sunstroke',
      desc: 'Foes hit by the wave are confused for 1.5s.',
      move: { sunstroke: { t: 1.5 } },
      fx: { trail: '#ffd8a8', particles: 'embers', spr: { hit: 'notes', kill: 'star3', proc: 'notes' } } },
  ],
  meteor_fall: [
    { id: 'impact_crater', tag: A, name: 'Impact Crater', color: '#c06030', colors: ['#5a2008', '#f0b080', '#ffe070'], signature: 'impactCrater',
      desc: 'The meteor leaves a burning crater for 3s that hurts foes inside.',
      move: { impactCrater: { t: 3, r: 26, dmg: 0.15 } },
      fx: { trail: '#f0b080', particles: 'rock', spr: { hit: 'land_dust', kill: 'boom', proc: 'lava' } } },
    { id: 'comet_tail', tag: T, name: 'Comet Tail', color: '#80d0ff', colors: ['#2a6aa0', '#d0f0ff', '#ffffff'], signature: 'cometTail',
      desc: 'The meteor comes in at an angle and leaves a line of fire on the ground.',
      move: { cometTail: { len: 110, dmg: 0.5 } },
      fx: { trail: '#d0f0ff', particles: 'wind', spr: { hit: 'streak', kill: 'boom_s', proc: 'streak' } } },
    { id: 'shatter_meteor', tag: W, name: 'Shatter Meteor', color: '#b08060', colors: ['#5a3018', '#e8c8a8', '#ff9a40'], signature: 'shatterMeteor',
      desc: 'The meteor breaks on landing, throwing 5 burning pieces outward.',
      move: { shatterMeteor: { n: 5, dmg: 0.35 } },
      fx: { trail: '#e8c8a8', particles: 'rock', spr: { hit: 'shard', kill: 'gibs', proc: 'boom_s' } } },
  ],
  blaze_trail: [
    { id: 'inferno', tag: A, name: 'Inferno', color: '#ff4010', colors: ['#801008', '#ffa080', '#ffe070'], signature: 'inferno',
      desc: 'The longer you keep running, the hotter your trail burns, up to 2x.',
      move: { inferno: { per: 0.25, max: 1 } },
      fx: { trail: '#ffa080', particles: 'embers', spr: { hit: 'boom_fire', kill: 'boom_s', proc: 'boom_fire' } } },
    { id: 'firewall', tag: T, name: 'Firewall', color: '#ffc060', colors: ['#a06010', '#ffe8b8', '#ffffff'], signature: 'firewall',
      desc: 'Your trail becomes a wall of fire that foes cannot cross. They are pushed back.',
      move: { firewall: {} },
      fx: { trail: '#ffe8b8', particles: 'embers', spr: { hit: 'guard_ring', kill: 'boom_s', proc: 'guard_break' } } },
    { id: 'cinders', tag: W, name: 'Cinders', color: '#ff8a60', colors: ['#901808', '#ffc0a8', '#fff0a0'], signature: 'cinders',
      desc: 'The flames shoot cinders at nearby foes.',
      move: { cinders: { every: 1, range: 70, dmg: 0.5 } },
      fx: { trail: '#ffc0a8', particles: 'embers', spr: { hit: 'spark_s', kill: 'boom_s', proc: 'spark_s' } } },
  ],
  powder_snow: [
    { id: 'frostbite', tag: A, name: 'Frostbite', color: '#80c0ff', colors: ['#2a5aa0', '#c8e4ff', '#ffffff'], signature: 'frostbite',
      desc: 'Chilled foes hit again get frostbite and take damage, more with each stack.',
      move: { frostbite: { t: 3, max: 5, per: 0.15 } },
      fx: { trail: '#c8e4ff', particles: 'snow', spr: { hit: 'freeze_s', kill: 'freeze', proc: 'freeze_s' } } },
    { id: 'drifting_snow', tag: T, name: 'Drifting Snow', color: '#e0f0ff', colors: ['#7a90b0', '#f8fcff', '#ffffff'], signature: 'driftingSnow',
      desc: 'Snow puffs land as drifts for 2s that slow foes walking through.',
      move: { driftingSnow: { t: 2, dmg: 0.2, max: 12 } },
      fx: { trail: '#f8fcff', particles: 'snow', spr: { hit: 'dust', kill: 'slide_dust', proc: 'dust' } } },
    { id: 'snowman', tag: W, name: 'Snowman', color: '#ffffff', colors: ['#9aa8c0', '#ffffff', '#ff9a40'], signature: 'snowman',
      desc: 'Foes chilled 3 times become snowmen, frozen for 2s.',
      move: { snowman: { t: 3, n: 3, freeze: 2 } },
      fx: { trail: '#ffffff', particles: 'snow', spr: { hit: 'freeze', kill: 'freeze', proc: 'freeze' } } },
  ],
  sheer_cold: [
    { id: 'absolute_zero', tag: A, name: 'Absolute Zero', color: '#a0e0ff', colors: ['#2a7ab0', '#e0f8ff', '#ffffff'], signature: 'absoluteZero',
      desc: 'Chilled foes below 15% HP shatter instantly.',
      move: { absoluteZero: { at: 0.15 } },
      fx: { trail: '#e0f8ff', particles: 'frost', spr: { hit: 'freeze', kill: 'shard', proc: 'freeze' } } },
    { id: 'whiteout', tag: T, name: 'Whiteout', color: '#f0f8ff', colors: ['#8090a8', '#ffffff', '#c8e4ff'], signature: 'whiteout',
      desc: 'No cone: the cold spreads all around you as a blizzard.',
      move: { whiteout: {} },
      fx: { trail: '#ffffff', particles: 'snow', spr: { hit: 'freeze_s', kill: 'ring_m', proc: 'ring_l' } } },
    { id: 'ice_age', tag: W, name: 'Ice Age', color: '#60a0d0', colors: ['#1a4a70', '#b8dcf0', '#ffffff'], signature: 'iceAge',
      desc: 'Chilled foes sometimes freeze, and an ice pillar appears next to them that blocks the way for 3s.',
      move: { iceAge: { chance: 0.15, freeze: 1.2, t: 3, max: 6 } },
      fx: { trail: '#b8dcf0', particles: 'frost', spr: { hit: 'freeze', kill: 'freeze', proc: 'guard_break' } } },
  ],
  icicle_crash: [
    { id: 'permafrost', tag: A, name: 'Permafrost', color: '#9ad8f4', colors: ['#2a7aa0', '#e0f8ff', '#ffffff'], signature: 'permafrost',
      desc: 'Where the icicle breaks, frost covers the ground for 2s, slowing and hurting foes.',
      move: { permafrost: { t: 2, r: 30, dmg: 0.15 } },
      fx: { trail: '#e0f8ff', particles: 'frost', spr: { hit: 'freeze_s', kill: 'freeze', proc: 'freeze_s' } } },
    { id: 'glacier', tag: T, name: 'Glacier', color: '#60c0e0', colors: ['#1a5a70', '#b8ecf8', '#ffffff'], signature: 'glacier',
      desc: 'The icicle becomes a pillar that blocks foes for 3s, then explodes.',
      move: { glacier: { t: 3, dmg: 0.5, max: 3 } },
      fx: { trail: '#b8ecf8', particles: 'frost', spr: { hit: 'guard_ring', kill: 'freeze', proc: 'guard_break' } } },
    { id: 'brittle', tag: W, name: 'Brittle', color: '#d0e0f0', colors: ['#5a6a80', '#f0f6ff', '#ff9a60'], signature: 'brittle',
      desc: 'Foes hit by shards take 50% more damage from everything for 1.5s.',
      move: { brittle: { t: 1.5, mul: 0.5 } },
      fx: { trail: '#f0f6ff', particles: 'frost', spr: { hit: 'shard', kill: 'gibs', proc: 'shard' } } },
  ],
  hail_cloud: [
    { id: 'hailstorm', tag: A, name: 'Hailstorm', color: '#b0d0f0', colors: ['#3a5a80', '#e0ecf8', '#ffffff'], signature: 'hailstorm',
      desc: '3 hailstones on the same foe in a short time freeze it for 1s.',
      move: { hailstorm: { n: 3, freeze: 1 } },
      fx: { trail: '#e0ecf8', particles: 'snow', spr: { hit: 'freeze_s', kill: 'freeze', proc: 'freeze_s' } } },
    { id: 'drift_cloud', tag: T, name: 'Drift Cloud', color: '#a0b0c0', colors: ['#3a4a5a', '#d8e0e8', '#ffffff'], signature: 'driftCloud',
      desc: 'The cloud moves toward groups of foes.',
      move: { driftCloud: { range: 200, speed: 30 } },
      fx: { trail: '#d8e0e8', particles: 'wind', spr: { hit: 'ring_s', kill: 'ring_m', proc: 'ring_s' } } },
    { id: 'thunder_snow', tag: W, name: 'Thunder Snow', color: '#fff6a0', colors: ['#8a8030', '#fffbd8', '#9ad8f4'], signature: 'thunderSnow',
      desc: 'Every 2.5s, lightning strikes 3 foes under the cloud, stunning them.',
      move: { thunderSnow: { every: 2.5, range: 140, n: 3, dmg: 1 } },
      fx: { trail: '#fffbd8', particles: 'sparks', spr: { hit: 'lightning', kill: 'spark', proc: 'lightning' } } },
  ],
  frost_veil: [
    { id: 'ice_armor', tag: A, name: 'Ice Armor', color: '#bfe9ff', colors: ['#3a7aa0', '#e8f8ff', '#ffffff'], signature: 'iceArmor',
      desc: 'Your veil gives you an ice shield that blocks one hit and comes back 4s later.',
      move: { iceArmor: { every: 4 } },
      fx: { trail: '#e8f8ff', particles: 'frost', spr: { hit: 'guard_ring', kill: 'guard_break', proc: 'guard_ring' } } },
    { id: 'frost_nova', tag: T, name: 'Frost Nova', color: '#80d8ff', colors: ['#1a6aa0', '#c8f0ff', '#ffffff'], signature: 'frostNova',
      desc: 'Every 2s, the veil releases a freezing blast around you.',
      move: { frostNova: { every: 2, dmg: 2.5, freeze: 0.8 } },
      fx: { trail: '#c8f0ff', particles: 'frost', spr: { hit: 'freeze', kill: 'ring_l', proc: 'ring_l' } } },
    { id: 'snow_squall', tag: W, name: 'Snow Squall', color: '#f0f8ff', colors: ['#8090a0', '#ffffff', '#9ad8f4'], signature: 'snowSquall',
      desc: 'The veil throws snowballs at nearby foes twice per second.',
      move: { snowSquall: { every: 0.5, range: 110, dmg: 0.7 } },
      fx: { trail: '#ffffff', particles: 'snow', spr: { hit: 'freeze_s', kill: 'dust', proc: 'freeze_s' } } },
  ],
  frost_chain: [
    { id: 'ice_bridge', tag: A, name: 'Ice Bridge', color: '#a0f0ff', colors: ['#2a8aa0', '#e0fcff', '#ffffff'], signature: 'iceBridge',
      desc: 'The chain leaves ice lines between the foes it hit. Foes crossing a line freeze.',
      move: { iceBridge: { t: 2 } },
      fx: { trail: '#e0fcff', particles: 'frost', spr: { hit: 'freeze_s', kill: 'freeze', proc: 'spark_line' } } },
    { id: 'shatter_chain', tag: T, name: 'Shatter Chain', color: '#c0d8f0', colors: ['#4a6080', '#e8f0f8', '#ffffff'], signature: 'shatterChain',
      desc: 'Foes killed by the chain shatter into ice shards that hit the 3 nearest foes.',
      move: { shatterChain: { range: 90, n: 3, dmg: 0.5 } },
      fx: { trail: '#e8f0f8', particles: 'frost', spr: { hit: 'shard', kill: 'gibs', proc: 'shard' } } },
    { id: 'cold_snap', tag: W, name: 'Cold Snap', color: '#7ab0e0', colors: ['#1a4a80', '#c0dcf8', '#ffffff'], signature: 'coldSnap',
      desc: '1s later, every foe the chain hit is struck and chilled again.',
      move: { coldSnap: { delay: 1, dmg: 0.5 } },
      fx: { trail: '#c0dcf8', particles: 'snow', spr: { hit: 'freeze_s', kill: 'freeze', proc: 'freeze_s' } } },
  ],
  avalanche: [
    { id: 'snowball_effect', tag: A, name: 'Snowball Effect', color: '#e8f4ff', colors: ['#7a8aa0', '#ffffff', '#9ad8f4'], signature: 'snowballEffect',
      desc: 'The avalanche gets wider and stronger for every foe it hits.',
      move: { snowballEffect: { per: 0.05, max: 0.8 } },
      fx: { trail: '#ffffff', particles: 'snow', spr: { hit: 'dust', kill: 'land_dust', proc: 'land_dust' } } },
    { id: 'ice_slide', tag: T, name: 'Ice Slide', color: '#80c8f0', colors: ['#1a5a80', '#c8ecff', '#ffffff'], signature: 'iceSlide',
      desc: 'Leaves an ice path for 2.5s that slows and hurts foes on it.',
      move: { iceSlide: { t: 2.5, dmg: 0.15 } },
      fx: { trail: '#c8ecff', particles: 'frost', spr: { hit: 'slide_dust', kill: 'freeze_s', proc: 'slide_dust' } } },
    { id: 'burial', tag: W, name: 'Burial', color: '#a0a8c0', colors: ['#3a4060', '#e0e4f0', '#ffffff'], signature: 'burial',
      desc: 'Foes still in the snow when it stops are frozen for 2s and take 50% more damage.',
      move: { burial: { t: 2, mul: 0.5 } },
      fx: { trail: '#e0e4f0', particles: 'snow', spr: { hit: 'freeze', kill: 'freeze', proc: 'land_dust' } } },
  ],
  night_daze: [
    { id: 'night_blind', tag: A, name: 'Night Blind', color: '#5a4a8a', colors: ['#1a1030', '#a898d0', '#ffffff'], signature: 'nightBlind',
      desc: 'Foes hit by the dark line are blinded for 1s and wander around.',
      move: { nightBlind: { t: 1 } },
      fx: { trail: '#a898d0', particles: 'shadows', spr: { hit: 'oval', kill: 'death_flash', proc: 'oval' } } },
    { id: 'dark_pulse', tag: T, name: 'Dark Pulse', color: '#3a2a60', colors: ['#0a0618', '#8070b0', '#c49aff'], signature: 'darkPulse',
      desc: 'Each cast sends a dark ring out from the end of the line.',
      move: { darkPulse: { r: 46, dmg: 0.8, gap: 0.8 } },
      fx: { trail: '#8070b0', particles: 'shadows', spr: { hit: 'ring_s', kill: 'ring_m', proc: 'ring_l' } } },
    { id: 'night_terror', tag: W, name: 'Night Terror', color: '#a04a8a', colors: ['#40103a', '#e0a8d0', '#ffd040'], signature: 'nightTerror',
      desc: 'Foes held on the line for over 1s flee confused and take 33% more damage for 3s.',
      move: { nightTerror: { n: 6, t: 3, mul: 0.33 } },
      fx: { trail: '#e0a8d0', particles: 'petals', spr: { hit: 'notes', kill: 'death_flash', proc: 'oval' } } },
  ],
  sucker_punch: [
    { id: 'one_two', tag: A, name: 'One-Two', color: '#e05a5a', colors: ['#801818', '#ffb0a8', '#ffffff'], signature: 'oneTwo',
      desc: 'Every punch is followed by a second punch.',
      move: { oneTwo: { dmg: 0.6 } },
      fx: { trail: '#ffb0a8', particles: 'embers', spr: { hit: 'punch', kill: 'punch_flash', proc: 'punch' } } },
    { id: 'counter_stance', tag: T, name: 'Counter Stance', color: '#8a6ae0', colors: ['#2a1a70', '#c8b8ff', '#ffffff'], signature: 'counterStance',
      desc: 'When you get hit, you punch back all nearby foes at once.',
      move: { counterStance: { r: 70, dmg: 1.5, gap: 0.6 } },
      fx: { trail: '#c8b8ff', particles: 'shadows', spr: { hit: 'punch_s', kill: 'punch_flash', proc: 'guard_ring' } } },
    { id: 'low_blow', tag: W, name: 'Low Blow', color: '#c0a040', colors: ['#5a4010', '#f0e0a8', '#ffffff'], signature: 'lowBlow',
      desc: 'Foes hit deal much less damage for 3s.',
      move: { lowBlow: { t: 3 } },
      fx: { trail: '#f0e0a8', particles: 'sand', spr: { hit: 'punch_s', kill: 'dust', proc: 'punch_s' } } },
  ],
  foul_play: [
    { id: 'turnabout', tag: A, name: 'Turnabout', color: '#d04060', colors: ['#601020', '#ffa8b8', '#ffffff'], signature: 'turnabout',
      desc: 'Uses the foe\'s own strength: each hit adds 5x the foe\'s attack as damage.',
      move: { turnabout: { mul: 5 } },
      fx: { trail: '#ffa8b8', particles: 'embers', spr: { hit: 'punch', kill: 'death_flash', proc: 'punch_flash' } } },
    { id: 'skull_orbit', tag: T, name: 'Skull Orbit', color: '#7a6ab0', colors: ['#2a1a50', '#c0b0f0', '#ffffff'], signature: 'skullOrbit',
      desc: 'Foes hit are haunted by a skull that circles them for 3s, hurting nearby foes.',
      move: { skullOrbit: { t: 3, dmg: 0.4, max: 3 } },
      fx: { trail: '#c0b0f0', particles: 'shadows', spr: { hit: 'oval', kill: 'ring_m', proc: 'spin_oval' } } },
    { id: 'dirty_trick', tag: W, name: 'Dirty Trick', color: '#c0b040', colors: ['#5a5010', '#f0e8a8', '#ffffff'], signature: 'dirtyTrick',
      desc: 'Every hit weakens the foe for 3s and can make it drop a coin.',
      move: { dirtyTrick: { t: 3, coin: 0.08 } },
      fx: { trail: '#f0e8a8', particles: 'sand', spr: { hit: 'hook', kill: 'star3', proc: 'hook' } } },
  ],
  night_slash: [
    { id: 'gloom_edge', tag: A, name: 'Gloom Edge', color: '#6a1a5a', colors: ['#200818', '#d088c0', '#ffffff'], signature: 'gloomEdge',
      desc: 'Critical slashes make the foe bleed for 3s.',
      move: { gloomEdge: { t: 3, share: 0.15 } },
      fx: { trail: '#d088c0', particles: 'shadows', spr: { hit: 'slash', kill: 'gibs', proc: 'slash' } } },
    { id: 'crescent_storm', tag: T, name: 'Crescent Storm', color: '#b0a0e0', colors: ['#3a2a70', '#e0d8ff', '#ffffff'], signature: 'crescentStorm',
      desc: 'Each slash throws a crescent at another nearby foe.',
      move: { crescentStorm: { range: 100, dmg: 0.4 } },
      fx: { trail: '#e0d8ff', particles: 'wind', spr: { hit: 'slash', kill: 'ring_m', proc: 'ring_blade' } } },
    { id: 'eclipse_cut', tag: W, name: 'Eclipse Cut', color: '#404060', colors: ['#101020', '#a0a0c8', '#ffd040'], signature: 'eclipseCut',
      desc: 'Slashing a foe while it prepares an attack cancels the attack and dazes it.',
      move: { eclipseCut: { t: 0.5 } },
      fx: { trail: '#a0a0c8', particles: 'shadows', spr: { hit: 'slit', kill: 'death_flash', proc: 'slit' } } },
  ],
  dark_void: [
    { id: 'abyss', tag: A, name: 'Abyss', color: '#1a1028', colors: ['#06040a', '#5a4a80', '#c49aff'], signature: 'abyss',
      desc: 'Foes pulled to the center are held there and take 50% more damage.',
      move: { abyss: { core: 0.25, mul: 0.5 } },
      fx: { trail: '#5a4a80', particles: 'shadows', spr: { hit: 'oval', kill: 'death_flash', proc: 'oval' } } },
    { id: 'void_gate', tag: T, name: 'Void Gate', color: '#6a3ab0', colors: ['#200a40', '#c0a0f0', '#ffffff'], signature: 'voidGate',
      desc: 'The void opens under the biggest group of foes instead of at your feet.',
      move: { voidGate: {} },
      fx: { trail: '#c0a0f0', particles: 'spirit', spr: { hit: 'ring_s', kill: 'ring_m', proc: 'ring_l' } } },
    { id: 'nightmare_void', tag: W, name: 'Nightmare Void', color: '#a060c0', colors: ['#3a1050', '#e0b8f0', '#ff9ad8'], signature: 'nightmareVoid',
      desc: 'Foes pulled in fall asleep for 1s. Each foe can only fall asleep once every 4s.',
      move: { nightmareVoid: { t: 1, cd: 4 } },
      fx: { trail: '#e0b8f0', particles: 'petals', spr: { hit: 'notes', kill: 'death_flash', proc: 'notes' } } },
  ],
  torment: [
    { id: 'torment_chain', tag: A, name: 'Torment Chain', color: '#a03050', colors: ['#400818', '#f0a0b8', '#ffffff'], signature: 'tormentChain',
      desc: 'When the tormented foe dies, the torment jumps to the toughest foe nearby.',
      move: { tormentChain: { range: 100 } },
      fx: { trail: '#f0a0b8', particles: 'shadows', spr: { hit: 'oval', kill: 'death_flash', proc: 'ring_m' } } },
    { id: 'torment_ring', tag: T, name: 'Torment Ring', color: '#5a3a90', colors: ['#1a0a30', '#b8a0e0', '#ffffff'], signature: 'tormentRing',
      desc: 'The aura pulls nearby foes in close to the tormented foe, burning them too.',
      move: { tormentRing: { pull: 40 } },
      fx: { trail: '#b8a0e0', particles: 'shadows', spr: { hit: 'ring_s', kill: 'ring_m', proc: 'ring_l' } } },
    { id: 'frenzy_torment', tag: W, name: 'Frenzy', color: '#e07040', colors: ['#701808', '#ffc0a0', '#ffffff'], signature: 'frenzyTorment',
      desc: 'The tormented foe takes more damage for each foe in its aura.',
      move: { frenzyTorment: { per: 0.4 } },
      fx: { trail: '#ffc0a0', particles: 'embers', spr: { hit: 'punch_s', kill: 'gibs', proc: 'punch' } } },
  ],
  feint_attack: [
    { id: 'backstab', tag: A, name: 'Backstab', color: '#c04060', colors: ['#500818', '#ffa0b8', '#ffffff'], signature: 'backstab',
      desc: 'Hits from behind are always critical.',
      move: { backstab: {} },
      fx: { trail: '#ffa0b8', particles: 'shadows', spr: { hit: 'slash', kill: 'gibs', proc: 'slash' } } },
    { id: 'shadow_step', tag: T, name: 'Shadow Step', color: '#4a4a7a', colors: ['#10102a', '#a0a0d0', '#ffffff'], signature: 'shadowStep',
      desc: 'You teleport behind the foe of the farthest shadow and are untouchable for 0.5s.',
      move: { shadowStep: { iframes: 0.5 } },
      fx: { trail: '#a0a0d0', particles: 'shadows', spr: { hit: 'slit', kill: 'death_flash', proc: 'slit' } } },
    { id: 'feint_guard', tag: W, name: 'Feint Guard', color: '#a0c0e0', colors: ['#2a4a6a', '#e0ecf8', '#ffffff'], signature: 'feintGuard',
      desc: 'After each stab, you are untouchable for 0.25s.',
      move: { feintGuard: { t: 0.25 } },
      fx: { trail: '#e0ecf8', particles: 'wind', spr: { hit: 'guard_ring', kill: 'ring_m', proc: 'guard_ring' } } },
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
