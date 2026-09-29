// L1 -- may import L0. Holds no state beyond sprite ids resolved once at boot.
//
// The FX shape vocabulary, shared by the system that EMITS effects (abilities.js, via the hooks
// in main.js) and the one that DRAWS them (entities.js). It sits this low so neither has to
// import the other, and so `kind` is never a bare number at a call site.

/** fxShape.kind values. Order is not significant; the renderer switches on them by name. */
export const FX = {
  RING: 0,
  BEAM: 1,
  CRACK: 2,
  BOLT: 3,
  // The rest are ripped sheets rather than drawn shapes. `r` carries the size each covers.
  BOOM: 5,          // Present's blast, from explosion.png
  DART: 6,          // an arrow travelling a line, from arrows.png -- `angle` is its heading
  FIREBURST: 7,     // the back half of the Flamethrower sheet: the impact
};

/**
 * zone.kind values.
 *
 * The first four are hazards that sit still and tick. NOVA and NOVA_STATIC are expanding fronts
 * -- a zone rather than a projectile because a ring has no single position -- and VORTEX drags
 * enemies toward its centre instead of pushing them away.
 */
export const ZONE = {
  PLAIN: 0,
  BURN: 1,
  DARK: 2,
  STATIC: 3,
  NOVA: 4,            // expands, and stays centred on the player
  NOVA_STATIC: 5,     // expands from where it was cast
  VORTEX: 6,
  // Ticks like BURN, but stays centred on the player and draws itself from a ripped sheet
  // rather than as a coloured blob.
  FIRE: 7,
};

/** Projectile roles. `gen` on a projectile is one of these, not a free integer. */
export const ROLE = {
  SHOT: 0,
  TURRET: 1,
  SEED: 2,
  MINE: 3,
  SPLITTER: 4,
  SHARD: 5,
};

/**
 * Atlas frame ids for the sprites the effects draw with, filled in by main.js after buildAtlas.
 * -1 means "not registered", and every renderer checks -- an effect must never be the reason a
 * frame throws.
 */
export const fxSprites = {
  bolt: -1,
  wisp: -1,
  rubble: -1,
  leafblade: -1,
  leafbladeDirs: 16,
};
