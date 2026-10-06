// L0 -- pure data. The legendary Pokemon of the secret floors.
//
// A portal sometimes opens on one of a stage's first three floors. Walking into it leads to a
// secret floor with a single legendary waiting -- one of the stage's TRIO, picked by which floor
// the portal opened on. Nothing else spawns there: the fight is the floor.
//
// Every boss is built from the same small vocabulary of MOVES (see legends.js), so a new one is an
// entry here rather than new code. What makes each one itself is the combination: how it moves,
// which moves it picks from, the TRAIT it carries the whole fight, and what changes when it is
// pushed under half health (its RAGE).
//
// Units follow the rest of the game: px and px/s in the 640x360 render space, seconds, raw HP.
// `look` names an entry in LOOKS below; `status` is what a hit leaves on the player.

/** Which legendary waits behind a portal: the stage's trio, in order of the floor it opened on. */
export const LEGEND_TRIOS = {
  grass: ['articuno', 'moltres', 'zapdos'],
  cave: ['regirock', 'regice', 'registeel'],
  beach: ['entei', 'raikou', 'suicune'],
};

/** Portals only open on the first three floors, and this rarely. */
export const PORTAL_CHANCE = 0.15;

/** How long into a floor the portal may open, in seconds of run time after arriving. */
export const PORTAL_WINDOW = [45, 200];

/** The secret floor's arena: a closed room, much smaller than a stage. Multiples of 24px. */
export const SECRET_ARENA = { w: 1008, h: 720 };

/**
 * How a boss's health grows with the player. Measured against real builds, damage output grows
 * faster than linearly with level -- more weapons, each higher -- so this does too: about 1.2x
 * the listed `hp` at level 8, 2.2x at 16 and 3.9x at 26. Without it a portal at 4:00 and one at
 * 14:00 would be the same fight against two completely different builds, and the later one
 * would last twenty seconds.
 */
export const legendHpScale = (level) => {
  const l = Math.max(1, level);
  return LEGEND_HP * (0.6 + 0.05 * l + 0.003 * l * l);
};

// The fight-wide difficulty knobs. The first tuning made the bosses last 30-70 seconds and they
// were too easy, so: two and a half times the health (about two minutes against a decent build),
// a fifth more damage on everything they do, and a quarter less waiting between moves.
export const LEGEND_HP = 2.5;
export const LEGEND_DMG = 1.2;
export const LEGEND_CD = 0.75;

/** Below this share of health, the last stand: phase 3. Rage (phase 2) begins at half. */
export const LAST_STAND_AT = 0.2;

// --- Visuals ---------------------------------------------------------------------------------
//
// Each look is a frame sequence from the manifest (cut out of the ripped move sheets), how big it
// is drawn, and how it moves. `rot` turns a projectile to face where it flies; `anchor` 'bottom'
// stands a column on the point it strikes rather than centring it there.

export const LOOKS = {
  ice_shard: { seq: 'fx_iceshard', scale: 1, rot: true, fps: 0, glow: '#bfe9ff' },
  ice_rock: { seq: 'fx_icerock', scale: 0.7, rot: false, fps: 0, glow: '#9ad8f4' },
  ice_rock_big: { seq: 'fx_icerock', scale: 1, rot: false, fps: 0, glow: '#9ad8f4' },
  ice_pillar: { seq: 'fx_icepillar', scale: 0.8, anchor: 'bottom', order: [3, 2, 1, 0, 0, 1, 2, 3] },
  ice_block: { seq: 'fx_iceblock', scale: 1, anchor: 'bottom' },
  fireball: { seq: 'fx_flamethrower', scale: 1, rot: false, fps: 24, loop: 11, glow: '#ffb050' },
  fire_dome: { seq: 'fx_firedome', scale: 0.8, anchor: 'bottom' },
  flame: { seq: 'fx_flame', scale: 0.6, anchor: 'bottom', order: [0, 1, 2, 3, 2, 3, 2, 1, 0], loopFrom: 2 },
  bolt: { seq: 'fx_bolt', scale: 1, anchor: 'bottom' },
  spark: { seq: 'fx_spark', scale: 1, rot: false, fps: 18, glow: '#fff0a0' },
  bubble: { seq: 'fx_bubble', scale: 1, rot: false, fps: 0, glow: '#a8e4ff' },
  geyser: { seq: 'fx_geyser', scale: 0.7, anchor: 'bottom', order: [0, 1, 2, 3, 2, 3, 1, 0] },
  rock: { seq: 'fx_rock', scale: 1.2, rot: false, fps: 14 },
  spire: { seq: 'fx_spire', scale: 0.8, anchor: 'bottom', order: [0, 1, 2, 3, 3, 3, 2, 1, 0] },
  boulder: { seq: 'fx_boulder', scale: 0.45, rot: false, fps: 0 },
  shard: { seq: 'fx_shard', scale: 0.6, rot: true, fps: 0, glow: '#e8e8f0' },
  diamond: { seq: 'fx_diamond', scale: 0.32, rot: false, spin: 9, fps: 0, glow: '#c8d0e0' },
  tornado: { seq: 'fx_tornado', scale: 0.9, anchor: 'bottom', fps: 12, loop: 4 },
  // From the sheets the first pass left alone: Dialga and Palkia's moves in dragon_moves.png, the
  // Thunder Wave rings in dark_moves.png, the blue zigzag bolts in thunderbolt.png.
  crescent: { seq: 'fx_crescent', scale: 1.6, rot: false, fps: 16, glow: '#ffffff' },
  firestar: { seq: 'fx_firestar', scale: 0.8, rot: false, fps: 18, glow: '#ffb050' },
  ring: { seq: 'fx_ring', scale: 1, ring: true },
  zigzag: { seq: 'fx_zigzag', scale: 0.8, anchor: 'bottom', fps: 14 },
  outrage: { seq: 'fx_outrage', scale: 0.75, anchor: 'bottom', order: [0, 1, 2, 3, 2, 3, 4, 5] },
  meteor: { seq: 'fx_meteor', scale: 1, rot: false, spin: 4, fps: 0 },
  dust: { seq: 'fx_dust', scale: 0.7, anchor: 'bottom' },
  boulder_s: { seq: 'fx_boulder', scale: 0.32, rot: false, fps: 0 },
  ice_block_s: { seq: 'fx_iceblock', scale: 0.5, anchor: 'bottom' },
  bigbubble: { seq: 'fx_bigbubble', scale: 0.55, rot: false, fps: 0 },
  // Roar of Time's shockwave: the burst when a boss makes its last stand.
  roar: { seq: 'fx_roar', scale: 2.2 },
};

/** Index 0 is "none". Projectiles carry these as plain numbers to keep their shape monomorphic. */
export const LOOK_KEYS = ['', ...Object.keys(LOOKS)];
export const lookIndex = (name) => (name ? Math.max(0, LOOK_KEYS.indexOf(name)) : 0);

/** Player statuses a boss can leave, and how long each lasts. */
export const STATUS = {
  chill: { secs: 1.6, slow: 0.4, color: '#9ad8f4' },
  burn: { secs: 3.0, dps: 4, color: '#ff9040' },
  para: { secs: 0.9, slow: 0.65, color: '#fff060' },
  freeze: { secs: 1.1, slow: 1, color: '#e8ffff' },
};

export const STATUS_KEYS = ['', 'chill', 'burn', 'para', 'freeze'];
export const statusIndex = (name) => (name ? Math.max(0, STATUS_KEYS.indexOf(name)) : 0);

// --- The nine --------------------------------------------------------------------------------
//
// Move fields shared by every kind: `anim` (the PMD animation it plays while it acts), `windup`
// (seconds it stands still telegraphing first), `cd` (seconds before it picks again), `weight`,
// and `rage: true` for a move it only knows once below half health. Everything else belongs to
// the move's `kind` and is read by that kind alone.

export const LEGENDS = [
  // =========================================================================
  // GRASS ROUTE -- the birds. They never land, and they never stop circling.
  // =========================================================================
  {
    id: 'articuno', name: 'Articuno', type: 'ice', stage: 'grass',
    music: 'legend_articuno', color: '#9ad8f4',
    title: 'THE FREEZE POKEMON',
    hp: 2600, dmg: 18, speed: 70, r: 16, scale: 1.5, armor: 0,
    style: 'glide', keep: 125, hover: 16,
    // Its cold clings: every chill it lands lasts longer than anyone else's.
    trait: { kind: 'frost', chillMul: 1.5 },
    rageText: 'THE AIR FREEZES SOLID',
    anims: ['Shoot', 'Charge', 'RearUp', 'Attack'],
    moves: [
      { id: 'ice_shard', kind: 'fan', anim: 'Shoot', windup: 0.55, cd: 1.1, weight: 4,
        count: 5, rageCount: 7, spread: 0.85, speed: 150, dmg: 11, volleys: 2, gap: 0.32,
        look: 'ice_shard', status: 'chill' },
      { id: 'sheer_cold', kind: 'line', anim: 'Charge', windup: 0.7, cd: 1.3, weight: 3,
        count: 7, step: 32, gap: 0.1, delay: 0.55, r: 16, dmg: 18, lines: 1, rageLines: 3, fan: 0.42,
        look: 'ice_pillar', status: 'chill' },
      { id: 'blizzard', kind: 'storm', anim: 'RearUp', windup: 0.8, cd: 1.5, weight: 2,
        weather: 'hail', dur: 4.2, drops: 12, rageDrops: 18, radius: 120, delay: 0.95, r: 15, dmg: 16,
        look: 'ice_rock_big', status: 'chill' },
      { id: 'hurricane', kind: 'tornado', anim: 'Attack', windup: 0.6, cd: 1.4, weight: 2, rage: true,
        count: 2, speed: 46, life: 5.5, r: 12, dmg: 14, look: 'tornado', status: 'chill' },
      // Air Slash: blades of wind that bend in flight, alternately left and right.
      { id: 'air_slash', kind: 'fan', anim: 'Attack', windup: 0.45, cd: 1.0, weight: 3,
        count: 4, rageCount: 6, spread: 1.2, speed: 135, dmg: 12, volleys: 3, gap: 0.28, curve: 1.3,
        look: 'crescent' },
    ],
    // Ice Body: every chunk of health it loses comes back at you as a shard of ice.
    trait2: { kind: 'shed', every: 0.025, speed: 150, dmg: 11, look: 'ice_shard', status: 'chill' },
    last: {
      text: 'THE AIR ITSELF FREEZES', weather: 'hail',
      move: { id: 'absolute_zero', kind: 'storm', anim: 'RearUp', windup: 0.6, cd: 1.4, weight: 3,
        weather: 'hail', dur: 6, drops: 26, radius: 140, delay: 0.9, r: 16, dmg: 18,
        look: 'ice_rock_big', status: 'chill' },
    },
  },
  {
    id: 'moltres', name: 'Moltres', type: 'fire', stage: 'grass',
    music: 'legend_moltres', color: '#ff9040',
    title: 'THE FLAME POKEMON',
    hp: 3400, dmg: 21, speed: 88, r: 16, scale: 1.5, armor: 0,
    style: 'glide', keep: 135, hover: 18,
    // Flame Body: wherever it flies it leaves the ground burning.
    trait: { kind: 'trail', every: 0.42, rageEvery: 0.22, life: 3.2, r: 15, dps: 10, look: 'flame', status: 'burn' },
    rageText: 'ITS WINGS BLAZE WHITE-HOT',
    anims: ['Shoot', 'Charge', 'Attack', 'Swing'],
    moves: [
      { id: 'flamethrower', kind: 'sweep', anim: 'Shoot', windup: 0.5, cd: 1.1, weight: 4,
        dur: 1.3, rate: 14, arc: 1.5, speed: 170, dmg: 10, look: 'fireball', status: 'burn' },
      { id: 'sky_attack', kind: 'dive', anim: 'Attack', windup: 0.45, cd: 1.3, weight: 3,
        rise: 0.6, track: 1.25, lock: 0.35, r: 40, dmg: 28, times: 1, rageTimes: 2,
        look: 'fire_dome', status: 'burn', ring: { count: 8, radius: 62, r: 14, dmg: 14, look: 'flame' } },
      { id: 'heat_wave', kind: 'ring', anim: 'Swing', windup: 0.6, cd: 1.2, weight: 3,
        count: 14, waves: 2, rageWaves: 3, gap: 0.35, speed: 120, dmg: 10, look: 'fireball', status: 'burn' },
      { id: 'fire_spin', kind: 'closing', anim: 'Charge', windup: 0.6, cd: 1.5, weight: 2, rage: true,
        count: 12, from: 115, to: 18, dur: 2.6, holes: 2, r: 13, dmg: 14, look: 'flame', status: 'burn' },
      // Fire stars thrown wide that turn round and come back to it -- dodge them twice.
      { id: 'fire_shuriken', kind: 'boomerang', anim: 'Shoot', windup: 0.45, cd: 1.1, weight: 3,
        count: 5, rageCount: 7, spread: 1.6, speed: 175, dmg: 13, out: 0.75, look: 'firestar', status: 'burn' },
    ],
    // Heat: too close to it and you start to burn.
    trait2: { kind: 'heat', r: 78, status: 'burn' },
    last: {
      text: 'THE SKY CATCHES FIRE', trailEvery: 0.15,
      move: { id: 'sky_inferno', kind: 'dive', anim: 'Attack', windup: 0.4, cd: 1.3, weight: 3,
        rise: 0.5, track: 1.0, lock: 0.3, r: 44, dmg: 30, times: 3,
        look: 'fire_dome', status: 'burn', ring: { count: 12, radius: 70, r: 14, dmg: 14, look: 'flame' } },
    },
  },
  {
    id: 'zapdos', name: 'Zapdos', type: 'electric', stage: 'grass',
    music: 'legend_zapdos', color: '#fff060',
    title: 'THE ELECTRIC POKEMON',
    hp: 4300, dmg: 24, speed: 96, r: 15, scale: 1.5, armor: 0,
    style: 'glide', keep: 120, hover: 14,
    // Agility: it does not fly to a new spot so much as arrive there.
    trait: { kind: 'blink', every: 2.6, rageEvery: 1.5, dist: 120 },
    rageText: 'THE SKY ROARS WITH THUNDER',
    anims: ['Shoot', 'Charge', 'Emit', 'Attack'],
    moves: [
      { id: 'thunder', kind: 'strikes', anim: 'Emit', windup: 0.5, cd: 1.1, weight: 4,
        pattern: 'around', count: 6, rageCount: 10, radius: 85, delay: 0.9, waves: 1, rageWaves: 2,
        wave: 0.55, r: 18, dmg: 22, look: 'bolt', status: 'para' },
      { id: 'discharge', kind: 'ring', anim: 'Charge', windup: 0.6, cd: 1.2, weight: 3,
        count: 16, waves: 1, rageWaves: 2, gap: 0.4, speed: 112, dmg: 12, look: 'spark', status: 'para' },
      { id: 'zap_cannon', kind: 'beam', anim: 'Shoot', windup: 0.25, cd: 1.3, weight: 3,
        telegraph: 0.85, dur: 0.35, width: 13, length: 440, dmg: 26, beams: 1, rageBeams: 3, fan: 0.38,
        color: '#fff6a0', edge: '#ffd000', status: 'para', look: 'bolt' },
      { id: 'thunder_cage', kind: 'strikes', anim: 'Emit', windup: 0.5, cd: 1.6, weight: 2, rage: true,
        pattern: 'cage', count: 16, radius: 88, holes: 2, delay: 0.8, stagger: 0.05, r: 16, dmg: 20,
        finale: { delay: 1.3, r: 26, dmg: 24 }, look: 'bolt', status: 'para' },
      // Thunder Wave: rings of static spreading from points around you. Inside one, you are caught.
      { id: 'thunder_wave', kind: 'waves', anim: 'Charge', windup: 0.5, cd: 1.2, weight: 3,
        count: 3, rageCount: 5, radius: 95, r1: 70, delay: 0.7, dur: 0.45, dmg: 14,
        look: 'ring', status: 'para' },
    ],
    // Static Storm: stand still too long and the lightning finds you.
    trait2: { kind: 'still', after: 1.2, delay: 0.65, r: 18, dmg: 22, look: 'bolt', status: 'para' },
    last: {
      text: 'THE STORM BREAKS',
      barrage: { every: 0.45, count: 1, radius: 150, delay: 0.7, r: 16, dmg: 18, look: 'bolt', status: 'para' },
      move: { id: 'judgement', kind: 'strikes', anim: 'Emit', windup: 0.5, cd: 1.4, weight: 2,
        pattern: 'around', count: 14, radius: 130, delay: 1.0, waves: 2, wave: 0.6, r: 18, dmg: 22,
        look: 'bolt', status: 'para' },
    },
  },

  // =========================================================================
  // DAMP CAVE -- the Regis. Slow, enormous, and every step is felt.
  // =========================================================================
  {
    id: 'regirock', name: 'Regirock', type: 'rock', stage: 'cave',
    music: 'legend_regirock', color: '#d8b070',
    title: 'THE ROCK PEAK POKEMON',
    hp: 2700, dmg: 22, speed: 30, r: 15, scale: 2, armor: 4,
    style: 'march', keep: 30,
    // Every footstep shakes the room, and it cannot be slowed.
    trait: { kind: 'quake', every: 0.7, shake: 0.12, slowImmune: true },
    rageText: 'ANCIENT STONES STIR',
    anims: ['Shoot', 'Charge', 'RearUp', 'Attack'],
    moves: [
      { id: 'rock_slide', kind: 'strikes', anim: 'RearUp', windup: 0.6, cd: 1.1, weight: 4,
        pattern: 'random', count: 8, rageCount: 12, radius: 95, delay: 1.0, r: 14, dmg: 18,
        look: 'rock', fall: true },
      { id: 'stone_edge', kind: 'line', anim: 'Attack', windup: 0.6, cd: 1.2, weight: 3,
        count: 9, step: 27, gap: 0.08, delay: 0.45, r: 14, dmg: 20, lines: 1, rageLines: 3, fan: 0.4,
        look: 'spire' },
      { id: 'rock_throw', kind: 'lob', anim: 'Shoot', windup: 0.5, cd: 1.2, weight: 3,
        flight: 0.95, r: 26, dmg: 24, look: 'boulder', impact: 'spire',
        burst: { count: 8, speed: 120, dmg: 10, look: 'rock' } },
      { id: 'ancient_power', kind: 'orbit', anim: 'Charge', windup: 0.5, cd: 1.4, weight: 2, rage: true,
        count: 6, radius: 36, spinUp: 2.0, speed: 150, dmg: 12, look: 'rock' },
      // Rock Tomb: boulders fall in a ring around you and wall you in, then the rocks come down
      // inside it.
      { id: 'rock_tomb', kind: 'tomb', anim: 'RearUp', windup: 0.5, cd: 1.4, weight: 2,
        radius: 72, count: 14, fallDelay: 0.6, life: 3.2, dmg: 16, look: 'boulder_s',
        then: { count: 5, delay: 0.9, r: 14, dmg: 18, look: 'rock' } },
    ],
    // Seismic Stomp: every few seconds of walking, the ground around it bursts.
    trait2: { kind: 'stomp', every: 3.0, r: 88, dur: 0.35, dmg: 16, look: 'dust' },
    last: {
      text: 'THE MOUNTAIN COMES DOWN',
      barrage: { every: 0.6, count: 1, radius: 160, delay: 1.0, r: 18, dmg: 20, look: 'meteor', impact: 'fire_dome', fall: true },
      move: { id: 'meteor_crash', kind: 'strikes', anim: 'RearUp', windup: 0.6, cd: 1.3, weight: 2,
        pattern: 'random', count: 14, radius: 130, delay: 1.1, r: 18, dmg: 22, look: 'meteor',
        impact: 'fire_dome', fall: true },
    },
  },
  {
    id: 'regice', name: 'Regice', type: 'ice', stage: 'cave',
    music: 'legend_regice', color: '#bfe9ff',
    title: 'THE ICEBERG POKEMON',
    hp: 3500, dmg: 22, speed: 34, r: 15, scale: 2, armor: 2,
    style: 'march', keep: 40,
    // Ice Body: the floor it walks over freezes, and frozen ground holds you back.
    trait: { kind: 'icefloor', every: 0.55, rageEvery: 0.35, life: 6.5, r: 19 },
    rageText: 'THE CAVERN FREEZES OVER',
    anims: ['Shoot', 'Charge', 'RearUp', 'Attack'],
    moves: [
      { id: 'ice_beam', kind: 'beam', anim: 'Shoot', windup: 0.25, cd: 1.3, weight: 3,
        telegraph: 0.75, dur: 1.6, width: 9, length: 300, dmg: 9, tick: 0.2, sweep: 1.3, beams: 1,
        color: '#e8ffff', edge: '#4ab0e8', status: 'chill', look: 'ice_shard' },
      { id: 'sheer_cold', kind: 'strikes', anim: 'RearUp', windup: 0.6, cd: 1.2, weight: 3,
        pattern: 'rings', rings: [[52, 8], [98, 14], [146, 20]], rageRings: 3, baseRings: 2,
        delay: 0.6, ringGap: 0.35, r: 14, dmg: 18, look: 'ice_pillar', status: 'chill', fromBoss: true },
      { id: 'icicle_crash', kind: 'strikes', anim: 'Charge', windup: 0.45, cd: 1.1, weight: 3,
        pattern: 'follow', count: 3, rageCount: 5, delay: 0.8, stagger: 0.45, r: 22, dmg: 22,
        look: 'ice_rock_big', fall: true, status: 'chill' },
      { id: 'freeze_prison', kind: 'prison', anim: 'Attack', windup: 0.4, cd: 1.5, weight: 2, rage: true,
        r: 46, delay: 1.4, dmg: 20, look: 'ice_block', status: 'freeze' },
      // Avalanche: blocks of ice slide across the room in lanes, each lane shown first.
      { id: 'avalanche', kind: 'avalanche', anim: 'Charge', windup: 0.5, cd: 1.3, weight: 2,
        lanes: 4, rageLanes: 6, speed: 190, warn: 0.9, r: 16, dmg: 20, look: 'ice_block_s', status: 'chill' },
    ],
    // Frostbite: stay near it and the cold builds in you until you freeze solid.
    trait2: { kind: 'frostbite', r: 85, build: 2.5, freeze: 1.5, dmg: 14 },
    last: {
      text: 'EVERYTHING FREEZES', frostMul: 1.6, floorLife: 14,
      move: { id: 'ice_age', kind: 'avalanche', anim: 'RearUp', windup: 0.5, cd: 1.3, weight: 3,
        lanes: 8, speed: 220, warn: 0.9, r: 16, dmg: 20, look: 'ice_block_s', status: 'chill' },
    },
  },
  {
    id: 'registeel', name: 'Registeel', type: 'steel', stage: 'cave',
    music: 'legend_registeel', color: '#c8d0e0',
    title: 'THE IRON POKEMON',
    hp: 4400, dmg: 26, speed: 40, r: 15, scale: 2, armor: 6,
    style: 'march', keep: 36,
    // Iron Defense: it raises its guard on a clock, shrugs off nearly everything while it holds,
    // and answers with a burst of shrapnel when the guard drops.
    trait: { kind: 'guard', every: 11, rageEvery: 7.5, dur: 3, armor: 80,
      burst: { count: 12, speed: 140, dmg: 12, look: 'shard' } },
    rageText: 'ITS STEEL BODY GLEAMS',
    anims: ['Shoot', 'Charge', 'RearUp', 'Attack', 'Rotate'],
    moves: [
      { id: 'flash_cannon', kind: 'beam', anim: 'Shoot', windup: 0.25, cd: 1.2, weight: 3,
        telegraph: 0.6, dur: 0.3, width: 12, length: 440, dmg: 24, beams: 1, repeat: 3, rageRepeat: 4,
        color: '#ffffff', edge: '#a0a8c0' },
      { id: 'mirror_shot', kind: 'fan', anim: 'Attack', windup: 0.5, cd: 1.1, weight: 3,
        count: 7, spread: 1.1, speed: 160, dmg: 12, volleys: 1, rageVolleys: 2, gap: 0.4, bounce: 1,
        look: 'shard' },
      { id: 'gyro_ball', kind: 'dash', anim: 'Rotate', windup: 0.45, cd: 1.3, weight: 2,
        times: 3, rageTimes: 4, speed: 270, telegraph: 0.42, dmg: 30, sparks: '#e8e8f0' },
      { id: 'magnet_bomb', kind: 'homing', anim: 'Charge', windup: 0.5, cd: 1.4, weight: 2, rage: true,
        count: 4, speed: 72, turn: 2.2, life: 4.5, dmg: 16, look: 'diamond',
        blast: { r: 24, dmg: 14, look: 'fire_dome' } },
      // Gyro Rend: steel blades spun off its body in a widening, curling spiral.
      { id: 'gyro_rend', kind: 'spiral', anim: 'Rotate', windup: 0.5, cd: 1.2, weight: 2,
        dur: 1.6, rate: 6, rageRate: 9, arms: 4, turn: 3.0, speed: 120, curve: 1.5, dmg: 13, look: 'crescent' },
    ],
    // Magnet Pull: on a clock, it drags you toward it. Walk against it.
    trait2: { kind: 'magnet', every: 9, warn: 0.8, dur: 1.6, pull: 85 },
    last: {
      text: 'AN IRON FORTRESS', guardEvery: 5,
      move: { id: 'flash_barrage', kind: 'beam', anim: 'Shoot', windup: 0.25, cd: 1.2, weight: 3,
        telegraph: 0.6, dur: 0.3, width: 12, length: 440, dmg: 24, beams: 3, fan: 0.5, repeat: 4,
        color: '#ffffff', edge: '#a0a8c0' },
    },
  },

  // =========================================================================
  // BEACH CAVE -- the legendary beasts. Fast, restless, and never where you left them.
  // =========================================================================
  {
    id: 'entei', name: 'Entei', type: 'fire', stage: 'beach',
    music: 'legend_entei', color: '#ff9040',
    title: 'THE VOLCANO POKEMON',
    hp: 2700, dmg: 20, speed: 78, r: 14, scale: 2, armor: 0,
    style: 'stalk', keep: 100,
    // Volcano: the ground itself keeps erupting, wherever you are standing.
    trait: { kind: 'volcano', every: 6, rageEvery: 3.8, count: 3, radius: 150, delay: 1.1, r: 26, dmg: 20,
      look: 'fire_dome', status: 'burn' },
    rageText: 'THE GROUND ERUPTS',
    anims: ['Shoot', 'Charge', 'SpAttack', 'Attack'],
    moves: [
      { id: 'fire_spin', kind: 'closing', anim: 'SpAttack', windup: 0.6, cd: 1.3, weight: 3,
        count: 10, from: 105, to: 24, dur: 2.6, holes: 2, r: 13, dmg: 14, look: 'flame', status: 'burn' },
      { id: 'eruption', kind: 'strikes', anim: 'Shoot', windup: 0.55, cd: 1.1, weight: 3,
        pattern: 'around', count: 5, rageCount: 8, radius: 62, delay: 0.9, waves: 1, r: 24, dmg: 22,
        look: 'fire_dome', status: 'burn' },
      { id: 'flame_charge', kind: 'dash', anim: 'Attack', windup: 0.45, cd: 1.2, weight: 3,
        times: 2, rageTimes: 3, speed: 300, telegraph: 0.42, dmg: 24,
        trail: { every: 0.08, life: 3, r: 13, dps: 10, look: 'flame', status: 'burn' } },
      { id: 'lava_plume', kind: 'ring', anim: 'Charge', windup: 0.55, cd: 1.2, weight: 2, rage: true,
        count: 18, waves: 2, gap: 0.3, speed: 125, dmg: 11, look: 'fireball', status: 'burn' },
      // Sacred Fire: towering pillars of flame erupt out of it in a great X across the room.
      { id: 'sacred_fire', kind: 'line', anim: 'SpAttack', windup: 0.6, cd: 1.4, weight: 2,
        count: 9, step: 36, gap: 0.07, delay: 0.6, r: 18, dmg: 24, lines: 4, fan: 1.5708,
        look: 'outrage', status: 'burn' },
    ],
    // Volcanic Roar: it roars, hurling you back, and every patch of burning ground explodes.
    trait2: { kind: 'roar', every: 9, r: 100, push: 150, bursts: 8, dmg: 18 },
    last: {
      text: 'THE VOLCANO AWAKENS',
      barrage: { every: 1.5, count: 3, radius: 150, delay: 1.0, r: 26, dmg: 22, look: 'fire_dome', status: 'burn' },
      move: { id: 'sacred_star', kind: 'line', anim: 'SpAttack', windup: 0.6, cd: 1.4, weight: 3,
        count: 10, step: 36, gap: 0.06, delay: 0.6, r: 18, dmg: 24, lines: 8, fan: 0.785,
        look: 'outrage', status: 'burn' },
    },
  },
  {
    id: 'raikou', name: 'Raikou', type: 'electric', stage: 'beach',
    music: 'legend_raikou', color: '#fff060',
    title: 'THE THUNDER POKEMON',
    hp: 3400, dmg: 22, speed: 112, r: 14, scale: 2, armor: 0,
    style: 'stalk', keep: 115,
    // Static: brushing against it paralyses, and it is fast enough to make that happen.
    trait: { kind: 'static', status: 'para' },
    rageText: 'THUNDER ANSWERS ITS ROAR',
    anims: ['Shoot', 'Charge', 'Shock', 'QuickStrike'],
    moves: [
      { id: 'thunder_fang', kind: 'dash', anim: 'QuickStrike', windup: 0.4, cd: 1.1, weight: 4,
        times: 1, rageTimes: 3, speed: 340, telegraph: 0.55, dmg: 24,
        bolts: { every: 30, delay: 0.35, r: 15, dmg: 18, look: 'bolt', status: 'para' } },
      { id: 'thunder', kind: 'strikes', anim: 'Shock', windup: 0.45, cd: 1.1, weight: 3,
        pattern: 'follow', count: 5, rageCount: 7, delay: 0.65, stagger: 0.35, r: 16, dmg: 20,
        look: 'bolt', status: 'para' },
      { id: 'spark_field', kind: 'field', anim: 'Charge', windup: 0.5, cd: 1.3, weight: 2,
        count: 4, radius: 105, life: 5.5, zapEvery: 1.4, zapRange: 150, zapDelay: 0.55,
        r: 15, dmg: 18, look: 'spark', bolt: 'bolt', status: 'para' },
      { id: 'discharge', kind: 'ring', anim: 'Shoot', windup: 0.5, cd: 1.2, weight: 2, rage: true,
        count: 12, waves: 3, gap: 0.35, speed: 118, dmg: 12, look: 'spark', status: 'para' },
      // Volt Chase: bolts that crawl along the ground after you.
      { id: 'volt_chase', kind: 'tornado', anim: 'Shock', windup: 0.45, cd: 1.2, weight: 2,
        count: 3, rageCount: 5, speed: 62, life: 4.5, r: 11, dmg: 15, look: 'zigzag', status: 'para' },
    ],
    // Electric Terrain: patches of floor around you charge up, then crackle.
    trait2: { kind: 'terrain', every: 7, count: 5, size: 36, radius: 90, warn: 1.2, life: 2.5, dmg: 12, status: 'para' },
    last: {
      text: 'THUNDER WITHOUT END', terrainEvery: 4,
      move: { id: 'thunder_rush', kind: 'dash', anim: 'QuickStrike', windup: 0.3, cd: 1.2, weight: 3,
        times: 5, speed: 360, telegraph: 0.4, dmg: 26,
        bolts: { every: 30, delay: 0.35, r: 15, dmg: 18, look: 'bolt', status: 'para' } },
    },
  },
  {
    id: 'suicune', name: 'Suicune', type: 'water', stage: 'beach',
    music: 'legend_suicune', color: '#7ad0f0',
    title: 'THE AURORA POKEMON',
    hp: 4300, dmg: 22, speed: 92, r: 14, scale: 2, armor: 0,
    style: 'stalk', keep: 145,
    // Rain Dance, once pressed: the rain sets in and the water starts rising out of the ground.
    trait: { kind: 'rain', every: 1.6, count: 2, radius: 130, delay: 0.85, r: 16, dmg: 16, look: 'geyser',
      status: 'chill' },
    rageText: 'THE RAIN BEGINS TO FALL',
    anims: ['Shoot', 'Charge', 'SpAttack', 'Attack'],
    moves: [
      { id: 'surf', kind: 'surf', anim: 'SpAttack', windup: 0.5, cd: 1.4, weight: 2,
        warn: 1.0, speed: 230, gap: 92, dmg: 24, times: 1, rageTimes: 2 },
      { id: 'hydro_pump', kind: 'line', anim: 'Shoot', windup: 0.55, cd: 1.1, weight: 3,
        count: 8, step: 28, gap: 0.07, delay: 0.5, r: 14, dmg: 18, lines: 3, rageLines: 5, fan: 0.36,
        look: 'geyser', status: 'chill' },
      { id: 'bubble_beam', kind: 'spiral', anim: 'Charge', windup: 0.5, cd: 1.2, weight: 3,
        dur: 2.4, rate: 15, rageRate: 22, arms: 3, turn: 2.2, speed: 100, dmg: 10,
        look: 'bubble', status: 'chill' },
      { id: 'aurora_beam', kind: 'beam', anim: 'Attack', windup: 0.25, cd: 1.3, weight: 2, rage: true,
        telegraph: 0.7, dur: 0.45, width: 12, length: 440, dmg: 22, beams: 4, spin: true,
        color: '#e0fff8', edge: '#60d8c0', status: 'chill' },
      // Hydro Sphere: one great bubble drifts at you, and bursts into a ring of small ones.
      { id: 'hydro_sphere', kind: 'sphere', anim: 'Shoot', windup: 0.5, cd: 1.2, weight: 2,
        speed: 70, life: 2.4, dmg: 20, look: 'bigbubble',
        burst: { count: 16, rageCount: 22, speed: 120, dmg: 10, look: 'bubble', status: 'chill' } },
    ],
    // Aurora Veil: on a clock, a shimmering veil -- whatever you hit it with comes back as bubbles.
    trait2: { kind: 'veil', every: 11, dur: 3, per: 0.012, speed: 130, dmg: 10, look: 'bubble', status: 'chill' },
    last: {
      text: 'THE TIDE RISES',
      barrage: { every: 1.0, count: 1, radius: 140, delay: 0.85, r: 16, dmg: 16, look: 'geyser', status: 'chill' },
      move: { id: 'tidal_storm', kind: 'surf', anim: 'SpAttack', windup: 0.5, cd: 1.4, weight: 3,
        warn: 1.0, speed: 240, gap: 92, dmg: 26, times: 3 },
    },
  },
];

// --- Relics ------------------------------------------------------------------------------------
//
// What each legendary leaves behind: one of its own items, kept for the rest of the run. They live
// in their own row on the HUD and take none of the six item slots, so beating a boss is always a
// pure gain. `shape` is the atlas sprite cut from items_2.png (see the manifest); the effect itself
// is applied by main.js and player.js, keyed by the boss id.

export const RELICS = {
  articuno: { name: 'Silver Wing', shape: 'relic_articuno',
    desc: 'The first second of touching an enemy does you no harm.' },
  moltres: { name: 'Flame Plume', shape: 'relic_moltres',
    desc: 'Every few seconds, a burst of fire erupts around you.' },
  zapdos: { name: 'Zap Plume', shape: 'relic_zapdos',
    desc: 'Every few seconds, lightning strikes the nearest enemy.' },
  regirock: { name: 'Hard Stone', shape: 'relic_regirock',
    desc: 'Every hit you take is 3 lighter.' },
  regice: { name: 'Never-Melt Ice', shape: 'relic_regice',
    desc: 'Enemies close to you are slowed by the cold.' },
  registeel: { name: 'Metal Coat', shape: 'relic_registeel',
    desc: 'A steel barrier blocks one hit, and comes back every 12 seconds.' },
  entei: { name: 'Fire Stone', shape: 'relic_entei',
    desc: 'Enemies you defeat sometimes explode in flames.' },
  raikou: { name: 'Thunder Crystal', shape: 'relic_raikou',
    desc: 'You move 15% faster.' },
  suicune: { name: 'Mystic Water', shape: 'relic_suicune',
    desc: 'You slowly regain health.' },
};

/** (shape, palette, fallback) for the atlas, like the other pickups. */
export const relicSpritePairs = () => Object.values(RELICS).map((r) => [r.shape, 'gold', 'orb']);

export const LEGEND_BY_ID = Object.fromEntries(LEGENDS.map((l) => [l.id, l]));
export const LEGEND_IDS = LEGENDS.map((l) => l.id);

/** The legendary behind a portal opened on `floor` of `stageId`, or null if none lives there. */
export function legendFor(stageId, floor) {
  const trio = LEGEND_TRIOS[stageId];
  if (!trio || floor < 1 || floor > trio.length) return null;
  return LEGEND_BY_ID[trio[floor - 1]] || null;
}
