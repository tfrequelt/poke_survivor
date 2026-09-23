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
    desc: 'Shockwaves that stun. Flying enemies are immune.',
    effect: 'shockwaveRings',
    cooldown: 20, waves: 3, waveGap: 0.28, radius: 108, damage: 90,
    stun: 1.0, knockback: 70, growth: 320,
    levels: [
      {}, { damage: +40 }, { cooldownMul: 0.9 }, { damage: +55 }, { waves: +1, radius: +22 },
    ],
  },

  // --- Rowlet ---------------------------------------------------------------
  {
    id: 'homing_leaf', name: 'Homing Leaf', slot: 0,
    owner: 'rowlet', form: 'rowlet',
    icon: 'icon_leaf', palette: 'grass',
    desc: 'Leaf blades seek separate targets and curve back.',
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
    desc: 'Lightning that chains between enemies and paralyses them.',
    effect: 'chain',
    cooldown: 18, jumps: 6, damage: 105, jumpRange: 95, stun: 0.8, falloff: 0.9,
    levels: [
      {}, { damage: +40 }, { cooldownMul: 0.9 }, { damage: +55 }, { jumps: +2, jumpRange: +25 },
    ],
  },
  {
    id: 'hydro_pump', name: 'Hydro Pump', slot: 1,
    owner: 'eevee', form: 'vaporeon',
    icon: 'icon_jet', palette: 'water',
    desc: 'A pressurised jet that shoves enemies back and heals you.',
    effect: 'jet',
    cooldown: 16, channel: 1.2, tick: 0.12, damage: 30,
    length: 210, width: 22, knockback: 150, lifesteal: 0.6,
    levels: [
      {}, { damage: +12 }, { cooldownMul: 0.9 }, { damage: +16 }, { channel: +0.5, width: +8 },
    ],
  },
  {
    id: 'dark_pulse', name: 'Dark Pulse', slot: 1,
    owner: 'eevee', form: 'umbreon',
    icon: 'icon_pulse', palette: 'ghostly',
    desc: 'Dark rings that weaken enemies and drain life back to you.',
    effect: 'drainRings',
    cooldown: 18, waves: 3, waveGap: 0.22, radius: 96, damage: 70,
    weaken: 4.0, growth: 280, lifesteal: 0.35,
    levels: [
      {}, { damage: +30 }, { cooldownMul: 0.9 }, { damage: +40 }, { waves: +1, radius: +20 },
    ],
  },
];

export const ABILITY_BY_ID = Object.fromEntries(ABILITIES.map((a) => [a.id, a]));

/** The icon sprites the ability set needs registered in the atlas. */
export function abilitySpritePairs() {
  const seen = new Set();
  const out = [];
  for (const a of ABILITIES) {
    const key = `${a.icon}:${a.palette}`;
    if (seen.has(key)) continue;
    seen.add(key);
    out.push([a.icon, a.palette]);
  }
  return out;
}

/** Abilities this form can currently draft. Slot 0 is always its owner's base ability. */
export function abilitiesForForm(characterId, formId) {
  return ABILITIES.filter((a) => a.owner === characterId && a.form === formId);
}
