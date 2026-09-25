// L0 -- pure data. The starters and their evolution forms.
//
// All three are playable from the start -- the choice between Wooper, Eevee and Rowlet is the
// premise of the game, so nothing gates it. Unlocks apply to stages and modes instead.
//
// `types` is not decoration: it is the whole weapon pool. A form is only ever OFFERED weapons
// matching one of its types, so evolving into Jolteon genuinely changes what the rest of the run
// can look like. Weapons already owned are never taken away -- see candidates() in progress.js.
//
// Move speed is px/s in the 640x360 render space (halved from the balance pass). The intent:
//   Wooper cannot outrun anything and must build a zone.
//   Eevee is fast and low-cooldown -- kite forever.
//   Rowlet dies to two mistakes but deletes elites.

export const CHARACTERS = [
  {
    id: 'wooper', titleAnim: 'Sleep', name: 'Wooper', shape: 'wooper', palette: 'wooper',
    color: '#3fa9f5', typeLabel: 'WATER / GROUND', types: ['water', 'ground'],
    blurb: 'Tanky and slow. Controls ground.',
    trait: 'Damp Hide: takes 15% less damage from walking into things.',
    weapon: 'mud_shot', ability: 'bubble_bomb',
    stats: {
      maxHp: 140, moveSpeed: 52, armor: 2, magnet: 35, power: 1.00,
      attackSpeed: 1.00, area: 1.05, duration: 1.10, projSpeed: 0.90,
      crit: 0.00, regen: 0.30, cooldown: 1.00, contactMult: 0.85,
    },
    evolutions: [
      { atLevel: 10, id: 'quagsire', name: 'Quagsire', shape: 'quagsire', palette: 'quagsire',
        types: ['water', 'ground'],
        grant: { maxHp: +70, moveSpeed: +6, armor: +2, area: +0.10, regen: +0.40 },
        note: 'Mud Shot gains +1 glob and wider puddles.' },
      // An AWAKENING, not an evolution: same creature, better stats. Without this flag it takes
      // the full cutscene path and announces "QUAGSIRE EVOLVED INTO QUAGSIRE".
      { atLevel: 20, id: 'quagsire_unaware', name: 'Quagsire', shape: 'quagsire', palette: 'quagsire',
        awaken: true, title: 'UNAWARE',
        grant: { armor: +3, area: +0.10 },
        note: 'Immune to slows, and puddles weaken enemy attacks.' },
    ],
  },
  {
    id: 'eevee', titleAnim: 'TailWhip', name: 'Eevee', shape: 'eevee', palette: 'eevee',
    color: '#b8bdc4', typeLabel: 'NORMAL', types: ['normal'],
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
          types: ['water'],
          grant: { maxHp: +90, moveSpeed: -4, regen: +1.2, area: +0.15 },
          note: 'Stars soak enemies: +15% damage taken.' },
        { id: 'jolteon', name: 'Jolteon', shape: 'jolteon', palette: 'jolteon',
          types: ['electric'],
          grant: { maxHp: +20, moveSpeed: +22, cooldown: -0.08, projSpeed: +0.20 },
          note: '+1 shard, and shards may chain to a second target.' },
        { id: 'umbreon', name: 'Umbreon', shape: 'umbreon', palette: 'umbreon',
          types: ['dark'],
          grant: { maxHp: +60, armor: +4, magnet: +9 },
          note: 'Stars weaken enemies, and 12% flat damage reduction.' },
      ] },
      { atLevel: 20, crest: true,
        note: 'Your chosen form awakens its Crest.' },
    ],
  },
  {
    id: 'rowlet', titleAnim: 'Shake', name: 'Rowlet', shape: 'rowlet', palette: 'rowlet',
    color: '#5fd35f', typeLabel: 'GRASS / FLYING', types: ['grass', 'flying'],
    blurb: 'Glass cannon. Outranges everything.',
    trait: 'Long Reach: +25% targeting range, -20% knockback taken.',
    weapon: 'leaf_arrow', ability: 'spirit_arrow',
    stats: {
      maxHp: 80, moveSpeed: 60, armor: 0, magnet: 55, power: 1.10,
      attackSpeed: 1.00, area: 1.00, duration: 1.00, projSpeed: 1.20,
      crit: 0.08, regen: 0.00, cooldown: 1.00, range: 1.25,
    },
    evolutions: [
      { atLevel: 10, id: 'dartrix', name: 'Dartrix', shape: 'dartrix', palette: 'dartrix',
        types: ['grass', 'flying'],
        grant: { maxHp: +45, moveSpeed: +5, power: +0.10, pierce: +1, projSpeed: +0.12 },
        note: 'Tidy Feathers: standing still charges your next attack.' },
      { atLevel: 20, id: 'decidueye', name: 'Decidueye', shape: 'decidueye', palette: 'decidueye',
        types: ['grass', 'ghost'],
        grant: { maxHp: +45, power: +0.15, crit: +0.12, pierce: +1 },
        note: 'Spirit Sniper: crits execute enemies below 12% health.' },
    ],
  },
  {
    id: 'vulpix', titleAnim: 'RearUp', name: 'Vulpix', shape: 'vulpix', palette: 'fire', fallback: 'quad_small',
    color: '#f08828', typeLabel: 'FIRE', types: ['fire'],
    blurb: 'Fragile, fast, and always alight.',
    trait: 'Flash Fire: its burns ignore armour completely.',
    weapon: 'ember_spit', ability: 'flamethrower',
    stats: {
      maxHp: 88, moveSpeed: 66, armor: 0, magnet: 48, power: 1.12,
      attackSpeed: 1.12, area: 1.00, duration: 1.00, projSpeed: 1.12,
      crit: 0.08, regen: 0.20, cooldown: 0.94, contactMult: 1.15,
    },
    evolutions: [
      { atLevel: 10, id: 'ninetales', name: 'Ninetales', shape: 'ninetales', palette: 'fire',
        types: ['fire'],
        grant: { maxHp: +55, moveSpeed: +8, power: +0.10, area: +0.10, crit: +0.05 },
        note: 'Ember Spit gains a second flame and sets the ground alight.' },
      { atLevel: 20, id: 'ninetales_drought', name: 'Ninetales', shape: 'ninetales',
        palette: 'fire', awaken: true, title: 'DROUGHT',
        grant: { power: +0.15, area: +0.10, attackSpeed: +0.10 },
        note: 'Burns last half again as long, and spread to whatever stands too close.' },
    ],
  },
  {
    id: 'delibird', titleAnim: 'Hop', name: 'Delibird', shape: 'delibird', palette: 'ice',
    fallback: 'quad_small',
    color: '#9ad8f4', typeLabel: 'ICE / FLYING', types: ['ice', 'flying'],
    blurb: 'Lives on luck. Opens presents.',
    trait: 'Hustle: presents drop on the map. Open one to spin.',
    weapon: 'powder_snow', ability: 'present',
    stats: {
      maxHp: 104, moveSpeed: 62, armor: 1, magnet: 62, power: 0.96,
      attackSpeed: 1.06, area: 1.05, duration: 1.05, projSpeed: 1.10,
      crit: 0.06, regen: 0.25, cooldown: 0.92, contactMult: 0.95, luck: 0.15,
    },
    evolutions: [
      { atLevel: 10, id: 'delibird_hustle', name: 'Delibird', shape: 'delibird',
        palette: 'ice', awaken: true, title: 'HUSTLE',
        grant: { maxHp: +45, power: +0.14, crit: +0.06, luck: +0.15, magnet: +14 },
        note: 'Blizzard unlocked, and presents turn up half again as often.' },
      { atLevel: 20, id: 'delibird_vital_spirit', name: 'Delibird', shape: 'delibird',
        palette: 'ice', awaken: true, title: 'VITAL SPIRIT',
        grant: { maxHp: +55, moveSpeed: +8, power: +0.16, luck: +0.20 },
        note: 'The wheel never lands on its worst prize again.' },
    ],
  },
  {
    id: 'gastly', titleAnim: 'Lick', name: 'Gastly', shape: 'gastly', palette: 'gastly',
    color: '#a87fe0', typeLabel: 'GHOST / POISON', types: ['ghost', 'poison'],
    blurb: 'Barely there. Fast and fragile.',
    trait: 'Levitate: contact damage against you is cut by 30%.',
    weapon: 'sludge_bomb', ability: 'night_shade',
    // The lowest health and the highest speed in the game: Gastly survives by not being where
    // the swarm is, and the Levitate trait is the one thing keeping that from being suicidal.
    stats: {
      maxHp: 60, moveSpeed: 72, armor: 0, magnet: 50, power: 1.15,
      attackSpeed: 1.00, area: 1.00, duration: 1.15, projSpeed: 1.05,
      crit: 0.06, regen: 0.00, cooldown: 0.95, contactMult: 0.70,
    },
    evolutions: [
      { atLevel: 10, id: 'haunter', name: 'Haunter', shape: 'haunter', palette: 'haunter',
        types: ['ghost', 'poison'],
        grant: { maxHp: +55, moveSpeed: +4, power: +0.10, magnet: +10 },
        note: 'Lick unlocked: drains life from everything around you.' },
      { atLevel: 20, id: 'gengar', name: 'Gengar', shape: 'gengar', palette: 'gengar',
        types: ['ghost', 'poison'],
        grant: { maxHp: +60, power: +0.20, crit: +0.10, cooldown: -0.10 },
        note: 'Night Shade swallows the ground whole.' },
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
  const add = (shape, palette, fallback) => {
    const key = `${shape}:${palette}`;
    if (seen.has(key)) return;
    seen.add(key);
    out.push([shape, palette, fallback]);
  };

  for (const c of CHARACTERS) {
    // The original twelve forms have hand-drawn pixels in shapes.js as well as a PMD sheet.
    // The newer ones are sheet-only, so they name a generic shape to fall back to -- the same
    // arrangement the enemies use, and the only thing standing between a missing asset folder
    // and a boot failure.
    add(c.shape, c.palette, c.fallback);
    for (const ev of c.evolutions) {
      if (ev.palette) add(ev.shape || c.shape, ev.palette, ev.fallback || c.fallback);
      if (ev.branch) for (const b of ev.branch) add(b.shape || c.shape, b.palette, b.fallback);
    }
  }
  return out;
}
