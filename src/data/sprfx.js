// L0 -- pure data. The sprite effects the overloads draw with.
//
// Every entry names one animation of assets/pmd/particles.png (packed from
// assets/pmd/particles_sprites by tools/packparticles.mjs; the Gravity Circuit rip, see credits).
//
//   src      the animation's folder name, as particles.json keys it
//   fps      frames a second (the whole animation plays once over a sprite's life)
//   natural  true: drawn in its own colours. Otherwise it is recoloured to whatever colour the
//            spawner passes, by brightness, so one white spark serves every overload
//   add      drawn additively rather than painted over. Only for pure light (lightning, streaks,
//            flashes): additive light on the bright grass and sand washes everything else to white
//   scale    default draw scale
//
// An overload names its effects in `fx.spr` (see data/overloads.js): `trail` is shed along its
// shots, `hit` plays on every hit, `kill` on its kills and `proc` when its signature goes off.

export const SPRFX = {
  // Sparks and impacts
  spark:       { src: 'white-spark-', fps: 48 },
  spark_s:     { src: 'white-spark-small-', fps: 48 },
  punch:       { src: 'punch-spark-big-', fps: 50 },
  punch_s:     { src: 'punch-spark-small-', fps: 50 },
  punch_flash: { src: 'punch-spark-big-flash-small', fps: 26 },
  pink_flash:  { src: 'pink-punch-spark-big-flash-small', fps: 26, natural: true },
  spark_line:  { src: 'super_flash_spark_', fps: 60, add: true },
  hook:        { src: 'hookshot_flash', fps: 22 },
  throw_flash: { src: 'throw_reject_flash', fps: 24 },
  // Bursts
  boom:        { src: 'orange_small_explosion_gray_', fps: 28 },
  boom_s:      { src: 'miniscule_orange_explosion_gray', fps: 30 },
  boom_fire:   { src: 'orange_small_explosion_', fps: 26, natural: true },
  boom_tiny:   { src: 'orange_tiny_explosion_', fps: 50, natural: true },
  death_flash: { src: 'death_trigger_flash_gray', fps: 22, scale: 0.8 },
  beam_boom:   { src: 'beam_palm_purge_explosion', fps: 20, scale: 0.7 },
  beam_flash:  { src: 'beam_palm_purge_flash_small', fps: 24 },
  // Rings and guards
  guard_ring:  { src: 'enemy_circular_guard_flash_full', fps: 22, scale: 0.6 },
  guard_break: { src: 'enemy_guard_break_flash', fps: 22, natural: true, scale: 0.6 },
  ring_l:      { src: 'circuit_pickup_flash_large_gray', fps: 18 },
  ring_m:      { src: 'circuit_pickup_flash_medium', fps: 18 },
  ring_s:      { src: 'circuit_pickup_flash_small_gray', fps: 20 },
  ring_blade:  { src: 'circuit_pickup_flash_blade_medium_2_', fps: 30 },
  flash_burst: { src: 'burst_pickup_flash_medium_2_', fps: 40, add: true },
  // Light
  lightning:   { src: 'super_flash_lightning', fps: 30, add: true, scale: 0.6 },
  streak:      { src: 'streak-of-light-', fps: 40, add: true, scale: 0.5 },
  slit:        { src: 'super_flash_slit_', fps: 28, add: true },
  shine:       { src: 'collect_shine', fps: 16, add: true },
  star3:       { src: 'orange_3x3_star', fps: 12, natural: true },
  // Ice
  freeze:      { src: 'freeze-spark-', fps: 40 },
  freeze_s:    { src: 'freeze-spark-small-', fps: 40 },
  sparkle:     { src: 'freeze-small-sparkle', fps: 16, add: true },
  // Matter
  dust:        { src: 'directionless_dust_', fps: 40 },
  land_dust:   { src: 'landing_dust_', fps: 45 },
  slide_dust:  { src: 'small_slide_start_dust_', fps: 42 },
  lava:        { src: 'lava-dump-gibs_', fps: 10, natural: true },
  gibs:        { src: 'sticky-bubble-gibs_', fps: 10 },
  shard:       { src: 'cyberlock_shard_despawn_particle', fps: 20 },
  // Bits, notes and tech
  bit:         { src: 'warp-particle-bit_', fps: 30 },
  ray:         { src: 'warp-particle-ray_', fps: 30 },
  blade:       { src: 'warp-particle-blade_', fps: 30 },
  hash:        { src: 'warp-particle-hash_', fps: 30 },
  motes:       { src: 'warp-portal-particle-green_', fps: 34 },
  circuit:     { src: 'wave-circuit-particle_', fps: 30 },
  notes:       { src: 'wave-note-taunt-particle', fps: 24 },
  oval:        { src: 'oval_shot_dissolve', fps: 18 },
  dot:         { src: 'white-with-purple-outline-trail', fps: 14 },
  slash:       { src: 'shift-circuit-slash-particle-bottom', fps: 34 },
  uppercut:    { src: 'shift-circuit-uppercut-trail-particle', fps: 22 },
  spin_oval:   { src: 'spinning_orange_oval', fps: 40, natural: true },
  cannon:      { src: 'cannoneer-shot-particle', fps: 34, natural: true },
};

export const SPRFX_KEYS = Object.keys(SPRFX);
export const SPRFX_INDEX = Object.fromEntries(SPRFX_KEYS.map((k, i) => [k, i]));
