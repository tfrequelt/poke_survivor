// L0 -- pure data. The three starters and their evolution forms.
//
// All three are playable from the start -- the choice between Wooper, Eevee and Rowlet is the
// premise of the game, so nothing gates it. Unlocks apply to stages and modes instead.
//
// Move speed is px/s in the 640x360 render space (halved from the balance pass). The intent:
//   Wooper cannot outrun anything and must build a zone.
//   Eevee is fast and low-cooldown -- kite forever.
//   Rowlet dies to two mistakes but deletes elites.

export const CHARACTERS = [
  {
    id: 'wooper', name: 'Wooper', shape: 'wooper', palette: 'wooper',
    color: '#3fa9f5', typeLabel: 'WATER / GROUND',
    blurb: 'Tanky and slow. Controls ground.',
    trait: 'Damp Hide: -15% damage from exploders and damage over time.',
    weapon: 'mud_shot', ability: 'bubble_bomb',
    stats: {
      maxHp: 140, moveSpeed: 52, armor: 2, magnet: 35, power: 1.00,
      attackSpeed: 1.00, area: 1.05, duration: 1.10, projSpeed: 0.90,
      crit: 0.00, regen: 0.30, cooldown: 1.00,
    },
    evolutions: [
      { atLevel: 10, id: 'quagsire', name: 'Quagsire', shape: 'quagsire', palette: 'quagsire',
        grant: { maxHp: +70, moveSpeed: +6, armor: +2, area: +0.10, regen: +0.40 },
        note: 'Mud Shot gains +1 glob and wider puddles.' },
      { atLevel: 20, id: 'quagsire_unaware', name: 'Quagsire', shape: 'quagsire', palette: 'quagsire',
        grant: { armor: +3, area: +0.10 },
        note: 'Unaware: immune to slows, and puddles weaken enemy attacks.' },
    ],
  },
  {
    id: 'eevee', name: 'Eevee', shape: 'eevee', palette: 'eevee',
    color: '#b8bdc4', typeLabel: 'NORMAL',
    blurb: 'Fast and adaptable. Never stops moving.',
    trait: 'Adaptability: +8% XP, and new-weapon cards appear more often.',
    weapon: 'swift_star', ability: 'shockwave_ring',
    stats: {
      maxHp: 100, moveSpeed: 68, armor: 0, magnet: 45, power: 1.00,
      attackSpeed: 1.00, area: 1.00, duration: 1.00, projSpeed: 1.00,
      crit: 0.05, regen: 0.00, cooldown: 0.92, xpGain: 1.08,
    },
    // The only branching evolution: the player picks one of three at level 10.
    evolutions: [
      { atLevel: 10, branch: [
        { id: 'vaporeon', name: 'Vaporeon', shape: 'vaporeon', palette: 'vaporeon',
          grant: { maxHp: +90, moveSpeed: -4, regen: +1.2, area: +0.15 },
          note: 'Stars soak enemies: +15% damage taken.' },
        { id: 'jolteon', name: 'Jolteon', shape: 'jolteon', palette: 'jolteon',
          grant: { maxHp: +20, moveSpeed: +22, cooldown: -0.08, projSpeed: +0.20 },
          note: '+1 shard, and shards may chain to a second target.' },
        { id: 'umbreon', name: 'Umbreon', shape: 'umbreon', palette: 'umbreon',
          grant: { maxHp: +60, armor: +4, magnet: +9 },
          note: 'Stars weaken enemies, and 12% flat damage reduction.' },
      ] },
      { atLevel: 20, crest: true,
        note: 'Your chosen form awakens its Crest.' },
    ],
  },
  {
    id: 'rowlet', name: 'Rowlet', shape: 'rowlet', palette: 'rowlet',
    color: '#5fd35f', typeLabel: 'GRASS / FLYING',
    blurb: 'Glass cannon. Reaches further than anything else.',
    trait: 'Long Reach: +25% targeting range, -20% knockback taken.',
    weapon: 'leaf_arrow', ability: 'spirit_arrow',
    stats: {
      maxHp: 80, moveSpeed: 60, armor: 0, magnet: 55, power: 1.10,
      attackSpeed: 1.00, area: 1.00, duration: 1.00, projSpeed: 1.20,
      crit: 0.08, regen: 0.00, cooldown: 1.00, range: 1.25,
    },
    evolutions: [
      { atLevel: 10, id: 'dartrix', name: 'Dartrix', shape: 'dartrix', palette: 'dartrix',
        grant: { maxHp: +45, moveSpeed: +5, power: +0.10, pierce: +1, projSpeed: +0.12 },
        note: 'Tidy Feathers: standing still charges your next attack.' },
      { atLevel: 20, id: 'decidueye', name: 'Decidueye', shape: 'decidueye', palette: 'decidueye',
        grant: { maxHp: +45, power: +0.15, crit: +0.12, pierce: +1 },
        note: 'Spirit Sniper: crits execute enemies below 12% health.' },
    ],
  },
];

export const CHARACTER_BY_ID = Object.fromEntries(CHARACTERS.map((c) => [c.id, c]));

/**
 * Every (shape, palette) pair the starters and their forms need in the atlas.
 *
 * Each evolution carries its OWN shape. Reusing the base shape with a different palette -- which
 * is what this did originally -- makes Quagsire a recoloured Wooper, which is exactly the thing
 * a player notices immediately.
 */
export function characterSpritePairs() {
  const seen = new Set();
  const out = [];
  const add = (shape, palette) => {
    const key = `${shape}:${palette}`;
    if (seen.has(key)) return;
    seen.add(key);
    out.push([shape, palette]);
  };

  for (const c of CHARACTERS) {
    add(c.shape, c.palette);
    for (const ev of c.evolutions) {
      if (ev.palette) add(ev.shape || c.shape, ev.palette);
      if (ev.branch) for (const b of ev.branch) add(b.shape || c.shape, b.palette);
    }
  }
  return out;
}
