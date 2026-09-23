// L0 -- imports NOTHING, by rule. Anyone may import this.
//
// `G` holds the scalar / configuration state of the game. Bulk entity arrays live in world.js,
// not here, so that G stays cheap to reason about and dump. Persistent (cross-run) data lives
// in G.save and is owned by save.js.

export const MODES = {
  BOOT: 'boot',
  TITLE: 'title',
  SELECT: 'select',
  SHOP: 'shop',
  POKEDEX: 'pokedex',
  PLAYING: 'playing',
  LEVELUP: 'levelup',
  EVOLVE_CHOICE: 'evolveChoice',
  EVOLVING: 'evolving',
  PAUSED: 'paused',
  SUMMARY: 'summary',
};

/** Modes in which the simulation advances. Everything else freezes the world. */
export const SIM_MODES = new Set([MODES.PLAYING]);

export const G = {
  // --- mode machine ---
  mode: MODES.BOOT,
  prevMode: MODES.BOOT,

  // --- run clock ---
  tick: 0,          // sim ticks since run start
  runTime: 0,       // seconds; advances ONLY inside stepSim
  runOver: false,
  won: false,

  // --- determinism ---
  seed: 0,
  rngRun: null,     // gameplay RNG -- affects outcomes, must stay deterministic
  rngFx: null,      // cosmetic RNG -- particles etc, safe to desync

  // --- run configuration ---
  stage: null,      // stage definition
  character: null,  // starter definition
  form: null,       // current evolution form (base stats live here)

  // --- the player ---
  player: null,
  stats: null,      // resolved stat block, rebuilt only when statsDirty
  statsDirty: true,
  mods: [],         // { stat, op:'flat'|'inc'|'more', value, scope } -- source of truth for stats

  // --- loadout ---
  weapons: [],      // <= 6 live weapon instances
  passives: [],     // <= 6 passive instances
  abilities: [null, null],   // slot 0 fires with Q, slot 1 with E (form-gated)

  // --- progression ---
  level: 1,
  xp: 0,
  xpNext: 20,
  pendingLevelUps: 0,
  offers: [],       // cards currently shown on the level-up modal
  rerolls: 0,
  banishes: 0,
  skips: 0,
  banished: new Set(),

  // --- run pacing (owned by director.js) ---
  curve: { hp: 1, dmg: 1, spd: 1, sps: 0, cap: 0, m: 0 },
  pendingMiniboss: 0,
  pendingBoss: false,
  evolvedAt: new Set(),

  // --- run tallies ---
  coins: 0,
  kills: 0,
  damageDealt: 0,
  damageTaken: 0,

  // --- presentation ---
  cam: { x: 0, y: 0, shake: 0, trauma: 0 },
  hitstop: 0,       // seconds of frozen sim for impact feel

  // --- persistence ---
  save: null,

  // --- dev ---
  debug: {
    on: false,
    godmode: false,
    showHitboxes: false,
    showGrid: false,
    timescale: 1,
    ms: {},         // per-system millisecond timings
    counts: {},     // per-pool entity counts
  },
};

/** Per-run fields only. Does NOT touch G.save, G.debug, or the mode machine. */
export function resetRunState() {
  G.tick = 0;
  G.runTime = 0;
  G.runOver = false;
  G.won = false;
  G.player = null;
  G.form = null;
  G.statsDirty = true;
  G.mods.length = 0;
  G.weapons.length = 0;
  G.passives.length = 0;
  G.abilities[0] = null;
  G.abilities[1] = null;
  G.level = 1;
  G.xp = 0;
  G.xpNext = 20;
  G.pendingLevelUps = 0;
  G.offers.length = 0;
  G.banished.clear();
  G.pendingMiniboss = 0;
  G.pendingBoss = false;
  G.evolvedAt.clear();
  G.coins = 0;
  G.kills = 0;
  G.damageDealt = 0;
  G.damageTaken = 0;
  G.cam.x = 0; G.cam.y = 0; G.cam.shake = 0; G.cam.trauma = 0;
  G.hitstop = 0;
}

export function setMode(mode) {
  if (G.mode === mode) return;
  G.prevMode = G.mode;
  G.mode = mode;
}
