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

export const STAGES = [
  {
    id: 'grass', name: 'Grass Route',
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
    propDensity: 0.020,
  },
  {
    id: 'cave', name: 'Damp Cave',
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
    propDensity: 0.026,
  },
  {
    id: 'beach', name: 'Sunset Beach',
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
    },
    props: [
      { id: 'rock', weight: 5 },
      { id: 'bush', weight: 2 },
      { id: 'crate', weight: 2 },
    ],
    propDensity: 0.018,
  },
];

export const STAGE_BY_ID = Object.fromEntries(STAGES.map((s) => [s.id, s]));

/** Destructible scenery. Breaking one drops pickups, which is what earns it a place on the map. */
export const PROPS = {
  bush:  { shape: 'prop_bush', palette: 'grass', hp: 12, r: 8, coin: 0.35, pickup: 0.14 },
  rock:  { shape: 'prop_rock', palette: 'rock', hp: 26, r: 8, coin: 0.45, pickup: 0.10 },
  crate: { shape: 'prop_crate', palette: 'vermin', hp: 18, r: 8, coin: 0.70, pickup: 0.45 },
};

export function propSpritePairs() {
  return Object.values(PROPS).map((p) => [p.shape, p.palette]);
}
