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
  wooper:   ['.', '#16395e', '#3a7fb8', '#69b8e0', '#a5dcf2', '#101018', '#e07ab8', '#ffffff', '#2a5f8a'],
  quagsire: ['.', '#13324f', '#2f6b96', '#58a0c0', '#93cade', '#101018', '#c46aa8', '#ffffff', '#24506f'],
  eevee:    ['.', '#3b2415', '#7a4a24', '#b07838', '#f0dcae', '#101018', '#e0a060', '#ffffff', '#5a3418'],
  vaporeon: ['.', '#153a52', '#2f7fa8', '#5ab8d8', '#cfeaf2', '#101018', '#7ad0e0', '#ffffff', '#24607f'],
  jolteon:  ['.', '#4a3a10', '#b09020', '#f0d840', '#fff4a8', '#101018', '#ffffff', '#ffffff', '#6a5418'],
  umbreon:  ['.', '#101018', '#22222e', '#3a3a4a', '#f0d040', '#f0d040', '#f0d040', '#ffffff', '#18181f'],
  rowlet:   ['.', '#1b3a18', '#3f6b2a', '#74b44a', '#f2f0dc', '#101018', '#e8a02c', '#ffffff', '#4a7a2a'],
  dartrix:  ['.', '#18331a', '#38602c', '#5f9c44', '#e8e6d0', '#101018', '#e09428', '#ffffff', '#3d6a26'],
  decidueye:['.', '#15281c', '#2f4a30', '#4a7a44', '#e0dcc4', '#101018', '#d4782a', '#ffffff', '#7a3a2a'],

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

  // --- pickups ---
  xp_small: ['.', '#0d3a2a', '#2a9a6a', '#4ae0a0', '#c0ffe0', '#101018', '#ffffff', '#ffffff', '#186a48'],
  xp_mid:   ['.', '#0d2a5a', '#2a6ac8', '#4a9ce8', '#c0e0ff', '#101018', '#ffffff', '#ffffff', '#184a8a'],
  xp_big:   ['.', '#5a3a08', '#c89818', '#f0c838', '#fff0a8', '#101018', '#ffffff', '#ffffff', '#7a5410'],
  gold:     ['.', '#5a4408', '#c8a018', '#f0d038', '#fff4a8', '#101018', '#ffffff', '#ffffff', '#7a5c10'],
};

/** Ground palettes, used by render.drawBackground. One base fill plus two decoration tiers. */
export const GROUND = {
  grass: { base: '#2f7a3a', detailA: '#3f9a4a', detailB: '#276a32', density: 0.26 },
  cave:  { base: '#2a2735', detailA: '#3b3750', detailB: '#221f2c', density: 0.18 },
  beach: { base: '#d8c48a', detailA: '#e8d8a8', detailB: '#c0a870', density: 0.22 },
};
