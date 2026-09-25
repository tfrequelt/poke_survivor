// L0 -- pure data. Palettes for the pixel shapes in shapes.js.
//
// Shape and palette are INDEPENDENT. One authored body shape rendered through ten palettes gives
// ten visually distinct creatures, which is what keeps the art workload survivable: a new enemy
// recolour is one line here, not 400 hand-typed characters.
//
// Index 0 is ALWAYS transparent. The remaining slots are used consistently by every shape:
//   1 outline   2 shadow   3 body   4 light   5 eye   6 accent   7 shine   8 accent-dark

export { SHAPES } from './shapes.js';

export const PALETTES = {
  // --- starters ---
  wooper:   ['.', '#16395e', '#3a7fb8', '#69b8e0', '#a5dcf2', '#101018', '#b968c4', '#ffffff', '#2a5f8a'],
  quagsire: ['.', '#13324f', '#2f6b96', '#58a0c0', '#93cade', '#101018', '#a862b4', '#ffffff', '#24506f'],
  eevee:    ['.', '#3b2415', '#7a4a24', '#b07838', '#f0dcae', '#101018', '#e0a060', '#ffffff', '#5a3418'],
  vaporeon: ['.', '#153a52', '#2f7fa8', '#5ab8d8', '#cfeaf2', '#101018', '#7ad0e0', '#ffffff', '#24607f'],
  jolteon:  ['.', '#4a3a10', '#b09020', '#f0d840', '#fff4a8', '#101018', '#ffffff', '#ffffff', '#6a5418'],
  umbreon:  ['.', '#101018', '#22222e', '#3a3a4a', '#f0d040', '#f0d040', '#f0d040', '#ffffff', '#18181f'],
  rowlet:   ['.', '#33241a', '#6b4e2e', '#9c7a4a', '#f4f2e8', '#101018', '#e8a02c', '#ffffff', '#4f9a38'],
  dartrix:  ['.', '#2b2018', '#5c4429', '#8a6c42', '#efeadc', '#101018', '#e09428', '#ffffff', '#3f8a30'],
  decidueye:['.', '#16241b', '#2c4a32', '#437a45', '#e8e4d2', '#101018', '#d4782a', '#ffffff', '#8a3a2e'],
  // Slot 8 on the Gastly line is the gas shroud, which is why it is a light haze rather than the
  // usual accent-dark: the cloud reads as the outer silhouette, not as shading.
  gastly:   ['.', '#1d1030', '#3c2266', '#5e3a9c', '#9f7fd8', '#e8e8f8', '#d0a8ff', '#ffffff', '#6a4fa8'],
  haunter:  ['.', '#1a0e2c', '#3a2060', '#5c3898', '#a888e0', '#f0f0ff', '#e0b0ff', '#ffffff', '#2a1746'],
  gengar:   ['.', '#170c26', '#31184f', '#553180', '#8f6cc8', '#f4f4ff', '#ff6f8f', '#ffffff', '#24123a'],

  // --- enemies (same shapes, different colours) ---
  rattail:  ['.', '#3a2450', '#6a4a90', '#9a7ac0', '#d8c0e8', '#101018', '#f0d0a0', '#ffffff', '#4a3060'],
  vermin:   ['.', '#4a3018', '#8a6030', '#bb9050', '#e8d8b0', '#101018', '#d09060', '#ffffff', '#5a3a1c'],
  cavebat:  ['.', '#2a1f45', '#4f3f7a', '#7a68a8', '#b8a8d8', '#101018', '#e06090', '#ffffff', '#36285a'],
  rock:     ['.', '#33302a', '#6a6055', '#9a9080', '#c8c0ad', '#101018', '#8a7a60', '#ffffff', '#44403a'],
  grub:     ['.', '#2a4218', '#548030', '#86b850', '#c8e090', '#101018', '#e0c040', '#ffffff', '#3a5a20'],
  ghostly:  ['.', '#2a2440', '#4a4270', '#7a70a8', '#c0b8e0', '#101018', '#a0f0d0', '#ffffff', '#38305a'],
  crab:     ['.', '#5a2018', '#a04030', '#d06a48', '#f0b090', '#101018', '#f0e0c0', '#ffffff', '#702a1e'],
  elite:    ['.', '#5a4410', '#a08020', '#e0c040', '#fff0a0', '#101018', '#fff8d0', '#ffffff', '#6f5414'],

  // --- projectiles: one per starter's damage colour ---
  water:    ['.', '#0d3a63', '#2a7fc8', '#4aa8e8', '#a8e4ff', '#101018', '#ffffff', '#ffffff', '#1a5a8f'],
  normal:   ['.', '#2a2d33', '#6b7078', '#a8aeb8', '#e4e8ee', '#101018', '#ffffff', '#ffffff', '#44484f'],
  grass:    ['.', '#1a3d16', '#3f8a2a', '#6cc840', '#c4f29a', '#101018', '#ffffff', '#ffffff', '#2a5f1e'],
  fire:     ['.', '#5a1a08', '#c05018', '#f08828', '#ffd870', '#101018', '#ffffff', '#ffffff', '#7a2a0c'],
  electric: ['.', '#5a4a08', '#c8a818', '#f8e038', '#fffaa8', '#101018', '#ffffff', '#ffffff', '#7a6410'],
  poison:   ['.', '#3a1048', '#7a2a98', '#b050d0', '#e8b0f8', '#101018', '#ffffff', '#ffffff', '#52186a'],
  psychic:  ['.', '#4a0f3a', '#a8288a', '#e858c0', '#ffb8ea', '#101018', '#ffffff', '#ffffff', '#6a1852'],
  dark:     ['.', '#0d0a16', '#2a2038', '#4a3a66', '#8a72b8', '#101018', '#d0b0ff', '#ffffff', '#1a1428'],
  flying:   ['.', '#3a4a62', '#7f93b0', '#b8cde0', '#f0f6ff', '#101018', '#ffffff', '#ffffff', '#5a6e8a'],
  ghost:    ['.', '#241c3c', '#463a72', '#7a6ab0', '#c8bcf0', '#101018', '#9af0d8', '#ffffff', '#33285a'],
  ground:   ['.', '#3a2410', '#6b4620', '#9a6c36', '#c49a5e', '#101018', '#e0c088', '#ffffff', '#4e3018'],
  // Frost, not water: almost white at the top with a cold blue core, so an ice shard reads as
  // ice against the sea on the beach stage rather than as another bubble.
  ice:      ['.', '#1d4a70', '#4a9fd0', '#9ad8f4', '#eaffff', '#101018', '#ffffff', '#ffffff', '#2f6f9c'],
  // The present: a white box with a red ribbon, so slot 4 is the paper and 2/3 are the ribbon.
  gift:     ['.', '#3a2028', '#c02030', '#e84050', '#ffffff', '#101018', '#ffe0e4', '#ffffff', '#8a1020'],

  // --- ability FX ---
  // Slot 1 is the OUTLINE, which is why Homing Leaf's purple rim is a palette entry rather than
  // something baked into fx_leafblade's pixels.
  leafblade: ['.', '#9333d6', '#2f6b22', '#4aa32c', '#8fdc5e', '#101018', '#d070f0', '#e8ffd0', '#255316'],
  thunder:  ['.', '#7a5a08', '#e8c418', '#fff05a', '#ffffc8', '#101018', '#ffffff', '#ffffff', '#a07c10'],
  wave:     ['.', '#0b3560', '#2276bd', '#5ab6ef', '#bfe9ff', '#101018', '#ffffff', '#ffffff', '#154e88'],
  shadowy:  ['.', '#120e22', '#2a2140', '#4a3a70', '#7a62b0', '#101018', '#f0d040', '#e0d0ff', '#1c1630'],
  earth:    ['.', '#3a2410', '#6b4620', '#9a6c36', '#c49a5e', '#101018', '#e0c088', '#ffffff', '#4e3018'],

  // --- pickups ---
  xp_small: ['.', '#0d3a2a', '#2a9a6a', '#4ae0a0', '#c0ffe0', '#101018', '#ffffff', '#ffffff', '#186a48'],
  xp_mid:   ['.', '#0d2a5a', '#2a6ac8', '#4a9ce8', '#c0e0ff', '#101018', '#ffffff', '#ffffff', '#184a8a'],
  xp_big:   ['.', '#5a3a08', '#c89818', '#f0c838', '#fff0a8', '#101018', '#ffffff', '#ffffff', '#7a5410'],
  xp_huge:  ['.', '#5a1046', '#a8288a', '#e858c0', '#ffd0f0', '#101018', '#ffffff', '#ffffff', '#7a1860'],
  gold:     ['.', '#5a4408', '#c8a018', '#f0d038', '#fff4a8', '#101018', '#ffffff', '#ffffff', '#7a5c10'],
};

/** Ground palettes, used by render.drawBackground. One base fill plus two decoration tiers. */
export const GROUND = {
  grass: { base: '#2f7a3a', detailA: '#3f9a4a', detailB: '#276a32', density: 0.26 },
  cave:  { base: '#2a2735', detailA: '#3b3750', detailB: '#221f2c', density: 0.18 },
  beach: { base: '#d8c48a', detailA: '#e8d8a8', detailB: '#c0a870', density: 0.22 },
};
