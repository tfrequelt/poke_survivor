// L0 -- pure data. Manually-fired abilities.
//
// `effect` is a STRING KEY resolved by the registry in abilities.js, exactly like weapon
// `behavior`/`motion` and enemy `ai`. Adding an ability is a data edit.
//
// Each Pokemon has two, and they are EXCLUSIVE to that form -- they never appear in another
// starter's level-up pool. Slot 0 is fired with Q, slot 1 with E. Slot 1 only becomes draftable
// once you have evolved into the form named by `form`.
//
// Spatial values are in the 640x360 render space. Cooldowns are seconds before the player's
// cooldown stat is applied.
//
// `levels` index 0 is level 1 and is empty; index N is what reaching level N+1 grants.
// Rhythm: damage at 2/4, cooldown at 3, signature bump at 5.

export const ABILITIES = [
  // --- Wooper ---------------------------------------------------------------
  {
    id: 'protect_bubble', name: 'Protect Bubble', slot: 0,
    owner: 'wooper', form: 'wooper',
    icon: 'icon_shield', palette: 'water',
    desc: 'Shield that blocks all contact damage, then bursts.',
    effect: 'shield',
    cooldown: 12, duration: 3.0, radius: 34, damage: 60, knockback: 90,
    levels: [
      {}, { damage: +25 }, { cooldownMul: 0.88 }, { damage: +35 }, { duration: +1.2, radius: +8 },
    ],
  },
  {
    id: 'earthquake', name: 'Earthquake', slot: 1,
    owner: 'wooper', form: 'quagsire',
    icon: 'icon_quake', palette: 'rock',
    desc: 'Shockwaves that stun and split the ground open. Flyers are immune.',
    effect: 'shockwaveRings',
    cooldown: 20, waves: 3, waveGap: 0.28, radius: 108, damage: 90,
    stun: 1.0, knockback: 70, growth: 320,
    // The fissures outlive the shockwave and keep hurting whatever stands in them, which is what
    // turns Earthquake from a burst into a piece of ground control.
    cracks: 5, crackTime: 2.6, crackDps: 22, rubble: 7,
    levels: [
      {}, { damage: +40 }, { cooldownMul: 0.9 }, { damage: +55 }, { waves: +1, radius: +22 },
    ],
  },

  // --- Rowlet ---------------------------------------------------------------
  {
    id: 'homing_leaf', name: 'Homing Leaf', slot: 0,
    owner: 'rowlet', form: 'rowlet',
    icon: 'icon_leaf', palette: 'grass',
    desc: 'Heavy leaf blades seek separate targets and cut through them.',
    effect: 'multiHoming',
    cooldown: 10, count: 5, damage: 34, speed: 200, pierce: 2,
    duration: 2.4, homingTurn: 5.5, range: 260,
    levels: [
      {}, { damage: +14 }, { cooldownMul: 0.88 }, { damage: +18 }, { count: +2, pierce: +1 },
    ],
  },
  {
    id: 'spectral_arrow', name: 'Spectral Arrow', slot: 1,
    owner: 'rowlet', form: 'dartrix',
    icon: 'icon_arrow', palette: 'ghostly',
    desc: 'Pierces a line, executes the wounded, leaves a burning trail.',
    effect: 'pierceLine',
    cooldown: 22, damage: 220, length: 340, width: 11,
    execute: 0.15, trailDps: 40, trailTime: 3.0, arrows: 1,
    levels: [
      {}, { damage: +90 }, { cooldownMul: 0.9 }, { damage: +120 }, { execute: +0.08, width: +5 },
    ],
    // Decidueye at level 20 does not grant a new ability -- it upgrades this one hard.
    formUpgrade: { form: 'decidueye', arrows: +2, execute: +0.10, damage: +140 },
  },

  // --- Vulpix ---------------------------------------------------------------
  {
    id: 'flamethrower', name: 'Flamethrower', slot: 0,
    owner: 'vulpix', form: 'vulpix',
    icon: 'icon_flame', palette: 'fire',
    desc: 'A sustained cone of fire. Everything caught in it burns.',
    effect: 'flameCone',
    // Channelled: `channel` seconds of held fire, re-hitting on `tick` so walking into the jet
    // hurts rather than only being there at the instant it started.
    cooldown: 11, channel: 1.3, tick: 0.14, damage: 17,
    range: 132, spread: 0.62, knockback: 10,
    burn: 26, burnT: 4.0,
    levels: [
      {}, { damage: +7 }, { cooldownMul: 0.88 }, { damage: +9 }, { range: +42, spread: +0.18 },
    ],
  },
  {
    id: 'fire_spin', name: 'Fire Spin', slot: 1,
    owner: 'vulpix', form: 'ninetales',
    icon: 'icon_flame', palette: 'fire',
    desc: 'A vortex of flame that holds a crowd in place and cooks it.',
    effect: 'firePit',
    cooldown: 20, radius: 84, duration: 5.0, damage: 46, dps: 34,
    slow: 0.62, burn: 30, knockback: 40,
    levels: [
      {}, { damage: +20 }, { cooldownMul: 0.9 }, { damage: +26 }, { radius: +26, duration: +2.0 },
    ],
  },

  // --- Delibird -------------------------------------------------------------
  {
    id: 'present', name: 'Present', slot: 0,
    owner: 'delibird', form: 'delibird',
    icon: 'icon_gift', palette: 'gift',
    desc: 'Lobs a gift. Four times in five it detonates; the fifth time it patches you up.',
    effect: 'present',
    // `channel` is the flight time -- the gift is in the air and the outcome is already decided,
    // which is what makes the wait feel like a wait rather than a delay.
    cooldown: 9, channel: 0.55, damage: 120, radius: 62, range: 230,
    knockback: 80, healChance: 0.20, heal: 0.30,
    levels: [
      {}, { damage: +45 }, { cooldownMul: 0.88 }, { damage: +60 }, { radius: +22, heal: +0.10 },
    ],
  },
  {
    id: 'blizzard', name: 'Blizzard', slot: 1,
    owner: 'delibird', form: 'delibird_hustle',
    icon: 'icon_frost', palette: 'ice',
    desc: 'A storm across the whole screen. Little damage, but nothing moves through it.',
    effect: 'blizzard',
    cooldown: 24, channel: 5.0, tick: 0.35, radius: 210, damage: 15,
    slow: 0.55, knockback: 0,
    levels: [
      {}, { damage: +6 }, { cooldownMul: 0.9 }, { damage: +8 }, { channel: +2.0, slow: +0.12 },
    ],
  },

  // --- Eevee ----------------------------------------------------------------
  {
    id: 'hyperbeam', name: 'Hyperbeam', slot: 0,
    owner: 'eevee', form: 'eevee',
    icon: 'icon_beam', palette: 'normal',
    desc: 'Wide beam. Massive damage, but you cannot move while firing.',
    effect: 'beam',
    cooldown: 14, channel: 1.0, tick: 0.1, damage: 26,
    length: 300, width: 16, knockback: 18,
    levels: [
      {}, { damage: +10 }, { cooldownMul: 0.88 }, { damage: +14 }, { width: +8, length: +60 },
    ],
  },
  {
    id: 'thunderbolt', name: 'Thunderbolt', slot: 1,
    owner: 'eevee', form: 'jolteon',
    icon: 'icon_bolt', palette: 'electric',
    desc: 'Lightning falls from the sky into a zone and leaves it crackling.',
    effect: 'skyStrike',
    // Strikes rain into a marked circle rather than chaining target to target. It hits harder in
    // one place instead of dribbling damage across a line of enemies, which is the point: Jolteon
    // is the burst form, and the chain behaviour already belongs to the Spark Chain weapon.
    cooldown: 18, strikes: 4, strikeGap: 0.16, radius: 58, damage: 115,
    stun: 0.9, boltRadius: 36, zoneTime: 2.6, zoneDps: 48,
    levels: [
      {}, { damage: +42 }, { cooldownMul: 0.9 }, { damage: +58 }, { strikes: +3, radius: +18 },
    ],
  },
  {
    id: 'hydro_pump', name: 'Hydro Pump', slot: 1,
    owner: 'eevee', form: 'vaporeon',
    icon: 'icon_jet', palette: 'water',
    desc: 'A wall of water rolls out, sweeping everything aside and healing you.',
    effect: 'wave',
    // A single front that sweeps outward: each enemy is hit once as it passes, and shoved hard.
    cooldown: 16, travel: 0.8, range: 240, band: 26, spread: 1.15,
    damage: 95, knockback: 300, lifesteal: 0.8,
    levels: [
      {}, { damage: +34 }, { cooldownMul: 0.9 }, { damage: +46 }, { range: +80, spread: +0.45 },
    ],
  },
  {
    id: 'dark_pulse', name: 'Dark Pulse', slot: 1,
    owner: 'eevee', form: 'umbreon',
    icon: 'icon_pulse', palette: 'ghostly',
    desc: 'Rings of darkness that linger, weaken, and drain life back to you.',
    effect: 'drainRings',
    cooldown: 18, waves: 3, waveGap: 0.22, radius: 96, damage: 70,
    weaken: 4.0, growth: 280, lifesteal: 0.35,
    // The pool of shadow left behind is the real effect now -- the rings just place it.
    zoneTime: 7.0, zoneDps: 26, zoneSlow: 0.35,
    levels: [
      {}, { damage: +30 }, { cooldownMul: 0.9 }, { damage: +40 }, { waves: +1, radius: +20 },
    ],
  },

  // --- Gastly ---------------------------------------------------------------
  {
    id: 'night_shade', name: 'Night Shade', slot: 0,
    owner: 'gastly', form: 'gastly',
    icon: 'icon_shade', palette: 'shadowy',
    desc: 'Spreads a shadow across the ground that eats away at whatever stands in it.',
    effect: 'drainRings',
    cooldown: 13, waves: 2, waveGap: 0.3, radius: 84, damage: 46,
    weaken: 3.0, growth: 240, lifesteal: 0.2,
    zoneTime: 6.0, zoneDps: 30, zoneSlow: 0.3,
    levels: [
      {}, { damage: +18 }, { cooldownMul: 0.88 }, { damage: +24 }, { waves: +1, radius: +18 },
    ],
    // Gengar does not hand you a third ability -- it makes this one enormous.
    formUpgrade: { form: 'gengar', damage: +70, waves: +2 },
  },
  {
    id: 'lick', name: 'Lick', slot: 1,
    owner: 'gastly', form: 'haunter',
    icon: 'icon_lick', palette: 'poison',
    desc: 'Drags the life out of everything nearby and puts it back into you.',
    effect: 'drainRings',
    cooldown: 15, waves: 3, waveGap: 0.16, radius: 62, damage: 40,
    weaken: 2.0, growth: 200, lifesteal: 1.6,
    zoneTime: 3.0, zoneDps: 20, zoneSlow: 0.2,
    levels: [
      {}, { damage: +16 }, { cooldownMul: 0.9 }, { damage: +20 }, { waves: +1, radius: +16 },
    ],
  },
];

export const ABILITY_BY_ID = Object.fromEntries(ABILITIES.map((a) => [a.id, a]));

/**
 * Effect art shared by the abilities, as [shape, palette, bakedRotations].
 *
 * These are not per-ability icons: they are the pieces the effects are built from, which is why
 * they live in one list rather than on the definitions. A rotation count of 0 means the usual
 * left/right pair; 16 bakes sixteen angles so a wave crest or a leaf blade can point anywhere
 * without a canvas transform.
 */
export const ABILITY_FX_SPRITES = [
  ['fx_leafblade', 'leafblade', 16],
  ['fx_wave', 'wave', 16],
  ['fx_bolt', 'thunder', 0],
  ['fx_wisp', 'shadowy', 0],
  ['fx_rubble', 'earth', 0],
];

/** The icon sprites the ability set needs registered in the atlas, plus the shared effect art. */
export function abilitySpritePairs() {
  const seen = new Set();
  const out = [];
  for (const a of ABILITIES) {
    const key = `${a.icon}:${a.palette}`;
    if (seen.has(key)) continue;
    seen.add(key);
    out.push([a.icon, a.palette]);
  }
  for (const entry of ABILITY_FX_SPRITES) out.push(entry);
  return out;
}

/** Abilities this form can currently draft. Slot 0 is always its owner's base ability. */
export function abilitiesForForm(characterId, formId) {
  return ABILITIES.filter((a) => a.owner === characterId && a.form === formId);
}
