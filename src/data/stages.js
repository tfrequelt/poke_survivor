// L0 -- pure data. Stage ground, decoration and prop sets.
//
// The ground is drawn in four layers, all derived from the deterministic hash2() so an infinite
// world costs zero storage:
//   1. base fill
//   2. large soft colour patches, so the ground is not one flat colour
//   3. scatter -- small marks at a given density
//   4. props -- destructible bushes/rocks/crates, spawned by the world, not drawn here
//
// `scatter` entries are drawn as small rect clusters; `shape` picks the arrangement.
//
// A stage with a `tileset` draws its ground from a PMD map instead (see data/tilesets.js). The
// four procedural layers stay as its fallback, so a missing image costs the stage its artwork
// and nothing else.
//
// `mapAt` is where the stage sits on the stage select's world map (WORLD_MAP below): the centre
// of its location dot, in that map's pixels.
//
// `arena` is the playable floor, in pixels, centred on the origin. The stage wall is drawn just
// outside it and stops the player, the enemies and the camera. 3456 is 144 tiles of 24px --
// about five screens across and nine tall, which is enough to keep running for twenty minutes
// without the edge ever feeling close.

export const STAGES = [
  {
    id: 'grass', name: 'Grass Route',
    // The four the director calls for at 5, 10, 15 and 20 minutes. Per stage, because
    // the roster is stage-exclusive -- a global list had the beach fighting a Graveler.
    // Tauros at ten minutes, then loose on the field from sixteen.
    bosses: ['raticate', 'tauros', 'pidgeot', 'butterfree'],
    // Tiny Woods goes UP a hillside: 1F, 2F, 3F, 4F.
    descend: false,
    arena: { w: 3456, h: 3456 },
    // Drawn from SilverDeoxys563's forest sheet, with ponds (see data/tilesets.js). The `ground`
    // block below is still the fallback if assets/pmd/forest_tiles.png is missing.
    tileset: 'forest',
    // The left-most forest, the one with the little lake: on its right half, where the map's
    // later versions put that forest's dot.
    mapAt: [243, 131],
    color: '#5fd35f',
    blurb: 'Open fields and a worn path. The gentlest start.',
    hpMult: 1.00, spsMult: 1.00, coinMult: 1.00,
    ground: {
      base: '#2f7a3a',
      patch: ['#347f3f', '#2a7035'],          // large soft blotches
      patchScale: 0.016, patchDensity: 0.5,
      scatter: [
        { color: '#43a04f', shape: 'tuft', density: 0.22 },
        { color: '#276a32', shape: 'dot', density: 0.18 },
        { color: '#e8e45a', shape: 'flower', density: 0.028 },
        { color: '#e07ab8', shape: 'flower', density: 0.020 },
      ],
      path: { color: '#8a7a4a', width: 26, spacing: 640 },
    },
    props: [
      { id: 'bush', weight: 6 },
      { id: 'rock', weight: 3 },
      { id: 'crate', weight: 1 },
    ],
    propDensity: 0.14,
  },
  {
    id: 'cave', name: 'Damp Cave',
    // The four the director calls for at 5, 10, 15 and 20 minutes. Per stage, because
    // the roster is stage-exclusive -- a global list had the beach fighting a Graveler.
    // Skarmory at ten minutes, then loose in the tunnels from sixteen.
    bosses: ['graveler', 'skarmory', 'aggron', 'gigalith'],
    // A cave goes DOWN: 1F, -1F, -2F, -3F, drawn with the descending flight.
    descend: true,
    arena: { w: 2880, h: 2880 },
    tileset: 'mtthunder',
    // The brown boulder mountain south of the village.
    mapAt: [211, 195],
    color: '#9f8fe8',
    blurb: 'Crystal dark. Tougher swarms, richer pockets.',
    hpMult: 1.10, spsMult: 1.10, coinMult: 1.15,
    ground: {
      base: '#2a2735',
      patch: ['#302d3d', '#242131'],
      patchScale: 0.020, patchDensity: 0.55,
      scatter: [
        { color: '#3b3750', shape: 'dot', density: 0.20 },
        { color: '#1f1c29', shape: 'dot', density: 0.14 },
        { color: '#6f5fd0', shape: 'crystal', density: 0.022 },
        { color: '#4fd0c0', shape: 'crystal', density: 0.014 },
      ],
      path: null,
    },
    props: [
      { id: 'rock', weight: 8 },
      { id: 'crate', weight: 2 },
    ],
    propDensity: 0.16,
  },
  {
    id: 'beach', name: 'Beach Cave',
    // The four the director calls for at 5, 10, 15 and 20 minutes. Per stage, because
    // the roster is stage-exclusive -- a global list had the beach fighting a Graveler.
    // No mini-boss doubles as a late spawn here; all four are ordinary beach residents.
    bosses: ['linoone', 'azumarill', 'palossand', 'poliwrath'],
    // Beach Cave goes down too -- it is a cave, whatever the sand suggests.
    descend: true,
    arena: { w: 3840, h: 3456 },
    // Beach Cave's sheet, with tide pools. The `ground` block is the fallback without it.
    tileset: 'beachcave',
    // The grey cave with the dark mouth, on the coast above the sea at the far left.
    mapAt: [195, 155],
    color: '#f0c070',
    blurb: 'Sea caves and tide pools. The tide never slows.',
    hpMult: 1.20, spsMult: 1.20, coinMult: 1.30,
    ground: {
      base: '#d8c48a',
      patch: ['#e0cd95', '#cbb67c'],
      patchScale: 0.014, patchDensity: 0.5,
      scatter: [
        { color: '#e8d8a8', shape: 'dot', density: 0.20 },
        { color: '#c0a870', shape: 'dot', density: 0.16 },
        { color: '#f2f0e4', shape: 'shell', density: 0.020 },
        { color: '#7ac8d8', shape: 'shell', density: 0.012 },
      ],
      path: { color: '#6fbcd8', width: 40, spacing: 900 },
      // Without its tileset the arena edge is drawn too: the sand simply runs out into the
      // sea. `edge` is the wet band at the waterline.
      outside: '#1b5f88',
      edge: '#6fbcd8',
    },
    props: [
      { id: 'rock', weight: 5 },
      { id: 'bush', weight: 2 },
      { id: 'crate', weight: 2 },
    ],
    propDensity: 0.12,
  },
];

export const STAGE_BY_ID = Object.fromEntries(STAGES.map((s) => [s.id, s]));

/**
 * The stage select's world map. maps.png holds twelve versions of it (504x336 each, a 2x6 grid
 * with 3px black lines between); the first, top-left, is the one drawn. `cursor` is the location
 * dot put on each stage's `mapAt`.
 */
export const WORLD_MAP = { image: 'worldmap', cursor: 'mapcursor', rect: [0, 0, 504, 336] };

/**
 * The sprites destructible scenery needs in the atlas.
 *
 * The scenery's own stats -- health, radius, what it drops -- live with the other static enemies
 * in data/enemies.js, because that is what a prop actually is. There used to be a second table
 * here carrying its own hp and drop numbers; nothing read them, and they had already drifted out
 * of agreement with the live ones.
 */
export const PROP_SPRITES = [
  ['prop_bush', 'grass'],
  ['prop_rock', 'rock'],
  ['prop_crate', 'vermin'],
];

export function propSpritePairs() {
  return PROP_SPRITES;
}
