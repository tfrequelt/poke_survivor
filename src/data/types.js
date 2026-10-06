// L0 -- pure data. Type matchups.
//
// The real type chart, for the eleven types your weapons and abilities come in, and the real
// types of every Pokemon you fight. What it does to the numbers is softened from the games on
// purpose:
//
//   super effective      x1.5   (both of a dual type: x2.0)
//   not very effective   x0.6   (both: floored at x0.5)
//   "no effect"          x0.5   -- never zero
//
// Never zero because the type gating is strict: Gastly is only ever offered Ghost and Poison
// weapons, and with true immunities its ghost weapons would do nothing at all to Grass Route's
// Normal-types. Halving them makes the stage a reason to lean on the poison side of the kit,
// which is the strategy layer this is for, without making any partner unplayable anywhere.

/** The attacking types, in the order the per-enemy multiplier tables are laid out. */
export const ATTACK_TYPES = [
  'normal', 'fire', 'water', 'electric', 'grass', 'ice', 'poison', 'ground', 'flying', 'ghost', 'dark',
];
export const TYPE_INDEX = Object.fromEntries(ATTACK_TYPES.map((t, i) => [t, i]));

// The games' chart: 2 super effective, 0.5 not very effective, 0 no effect. Anything not
// listed is neutral.
const CHART = {
  normal:   { rock: 0.5, steel: 0.5, ghost: 0 },
  fire:     { fire: 0.5, water: 0.5, grass: 2, ice: 2, bug: 2, rock: 0.5, dragon: 0.5, steel: 2 },
  water:    { fire: 2, water: 0.5, grass: 0.5, ground: 2, rock: 2, dragon: 0.5 },
  electric: { water: 2, electric: 0.5, grass: 0.5, ground: 0, flying: 2, dragon: 0.5 },
  grass:    { fire: 0.5, water: 2, grass: 0.5, poison: 0.5, ground: 2, flying: 0.5, bug: 0.5, rock: 2, dragon: 0.5, steel: 0.5 },
  ice:      { fire: 0.5, water: 0.5, grass: 2, ice: 0.5, ground: 2, flying: 2, dragon: 2, steel: 0.5 },
  poison:   { grass: 2, poison: 0.5, ground: 0.5, rock: 0.5, ghost: 0.5, steel: 0, fairy: 2 },
  ground:   { fire: 2, electric: 2, grass: 0.5, poison: 2, flying: 0, bug: 0.5, rock: 2, steel: 2 },
  flying:   { electric: 0.5, grass: 2, fighting: 2, bug: 2, rock: 0.5, steel: 0.5 },
  ghost:    { normal: 0, psychic: 2, ghost: 2, dark: 0.5 },
  dark:     { fighting: 0.5, psychic: 2, ghost: 2, dark: 0.5, fairy: 0.5 },
};

const SOFT = { 2: 1.5, 0.5: 0.6, 0: 0.5 };
export const SUPER = 1.15, RESISTED = 0.85;

/** What one attacking type does to a Pokemon of these types, after softening. */
export function typeMultiplier(attack, defTypes) {
  const row = CHART[attack];
  if (!row || !defTypes) return 1;
  let m = 1;
  for (const t of defTypes) {
    const f = row[t];
    if (f !== undefined) m *= SOFT[f];
  }
  return Math.max(0.5, Math.min(2, m));
}

/** Every Pokemon you can fight, with its real types. Scenery has none and takes everything evenly. */
export const SPECIES_TYPES = {
  // Grass Route
  rattata: ['normal'], raticate: ['normal'], caterpie: ['bug'], metapod: ['bug'],
  butterfree: ['bug', 'flying'], pidgey: ['normal', 'flying'], pidgeotto: ['normal', 'flying'],
  pidgeot: ['normal', 'flying'], spearow: ['normal', 'flying'], fearow: ['normal', 'flying'],
  applin: ['grass', 'dragon'], appletun: ['grass', 'dragon'], flapple: ['grass', 'dragon'],
  tauros: ['normal'],
  // Damp Cave
  zubat: ['poison', 'flying'], crobat: ['poison', 'flying'], roggenrola: ['rock'], boldore: ['rock'],
  gigalith: ['rock'], diglett: ['ground'], dugtrio: ['ground'], aron: ['steel', 'rock'],
  lairon: ['steel', 'rock'], aggron: ['steel', 'rock'], geodude: ['rock', 'ground'],
  graveler: ['rock', 'ground'], skarmory: ['steel', 'flying'],
  // Beach Cave
  poliwag: ['water'], poliwhirl: ['water'], poliwrath: ['water', 'fighting'],
  marill: ['water', 'fairy'], azumarill: ['water', 'fairy'], zigzagoon: ['normal'], linoone: ['normal'],
  poochyena: ['dark'], mightyena: ['dark'], sandygast: ['ghost', 'ground'], palossand: ['ghost', 'ground'],
  // The secret floors
  articuno: ['ice', 'flying'], moltres: ['fire', 'flying'], zapdos: ['electric', 'flying'],
  regirock: ['rock'], regice: ['ice'], registeel: ['steel'],
  entei: ['fire'], raikou: ['electric'], suicune: ['water'],
};

/** Per attacking type, what it does to this species: one multiplier per ATTACK_TYPES entry. */
export function typeTable(speciesId) {
  const types = SPECIES_TYPES[speciesId];
  const out = new Float32Array(ATTACK_TYPES.length);
  for (let i = 0; i < ATTACK_TYPES.length; i++) out[i] = typeMultiplier(ATTACK_TYPES[i], types);
  return out;
}

/** The type of each ability's move, keyed by ability id. */
export const ABILITY_TYPES = {
  protect_bubble: 'water', earthquake: 'ground', homing_leaf: 'grass', spectral_arrow: 'ghost',
  flamethrower: 'fire', fire_spin: 'fire', present: 'normal', blizzard: 'ice',
  hyperbeam: 'normal', thunderbolt: 'electric', hydro_pump: 'water', dark_pulse: 'dark',
  shadow_orb: 'ghost', night_shade: 'ghost',
};

/**
 * How well each attacking type does against a stage's roster, weighted by how often each species
 * turns up there. `roster` is [{ id, weight }]. Returns one average multiplier per ATTACK_TYPES.
 */
export function rosterMatchups(roster) {
  const out = new Float32Array(ATTACK_TYPES.length);
  let total = 0;
  for (const r of roster) total += r.weight;
  for (let i = 0; i < ATTACK_TYPES.length; i++) {
    let s = 0;
    for (const r of roster) s += typeMultiplier(ATTACK_TYPES[i], SPECIES_TYPES[r.id]) * r.weight;
    out[i] = total > 0 ? s / total : 1;
  }
  return out;
}
