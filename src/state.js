// L0 -- imports NOTHING, by rule. Anyone may import this.
//
// `G` holds the scalar / configuration state of the game. Bulk entity arrays live in world.js,
// not here, so that G stays cheap to reason about and dump. Persistent (cross-run) data lives
// in G.save and is owned by save.js.

/**
 * The victory, summary and defeat screens ignore keys for a moment after they appear, so a key
 * still held from the fight cannot skip them. Wall-clock ms, since the sim is stopped by then.
 */
export const END_LOCK_MS = 2000;
export const lockEndScreen = () => { G.endLockUntil = performance.now() + END_LOCK_MS; };
export const endLocked = () => performance.now() < (G.endLockUntil || 0);

export const MODES = {
  BOOT: 'boot',
  TITLE: 'title',
  SELECT: 'select',
  STAGE_SELECT: 'stageSelect',
  SHOP: 'shop',
  POKEDEX: 'pokedex',
  CREDITS: 'credits',
  SETTINGS: 'settings',
  PLAYING: 'playing',
  LEVELUP: 'levelup',
  EVOLVE_CHOICE: 'evolveChoice',
  EVOLVING: 'evolving',
  PAUSED: 'paused',
  SUMMARY: 'summary',
  WHEEL: 'wheel',
  // The fade between floors. Deliberately NOT a sim mode -- see SIM_MODES below.
  STAIRS: 'stairs',
  // Shown once the 20:00 boss is down: claim the win, or keep going.
  VICTORY: 'victory',
  // The Successes window, opened from the main menu.
  SUCCESSES: 'successes',
};

/** Modes in which the simulation advances. Everything else freezes the world. */
//
// STAIRS is not here on purpose: the world holds still behind the black screen, so nothing can
// walk into the player while the fade is covering the field.
export const SIM_MODES = new Set([MODES.PLAYING]);

export const G = {
  // --- mode machine ---
  mode: MODES.BOOT,
  prevMode: MODES.BOOT,

  // --- run clock ---
  tick: 0,          // sim ticks since run start
  runTime: 0,       // seconds; advances ONLY inside stepSim, and not at all on a secret floor
  // Sim seconds that never stop. runTime is the RUN clock and stands still on a secret floor, so
  // anything that measures time between two moments of play -- a cooldown, a pulse, a fire
  // budget -- reads this instead, or it would freeze along with the clock.
  clock: 0,
  runOver: false,
  won: false,
  // Set when the final boss dies. The sim keeps running for this long so the payout can fly in
  // and be collected, then the summary screen opens.
  victoryT: 0,
  // Guards bankRunGold so a run's gold can only ever be banked once, however it ended.
  banked: false,
  // Second chances left this run, from the shop's Revive rank. Counted down, not recomputed,
  // so a mid-run stat change cannot hand out another one.
  revivesLeft: 0,
  // Set when Delibird walks over a present. Drained at the END of the tick, like a level-up.
  pendingWheel: false,
  // Seconds until the next present is dropped. Delibird only; zero means never.
  presentT: 0,

  // --- determinism ---
  seed: 0,
  rngRun: null,     // gameplay RNG -- affects outcomes, must stay deterministic
  rngFx: null,      // cosmetic RNG -- particles etc, safe to desync

  // --- the floor ---
  //
  // A run is twenty minutes whatever happens, but the player can trade safety for reward by
  // taking the stairs at 5:00, 10:00 and 15:00 -- so the floor runs 1..4. Everything about a
  // deeper floor is a multiplier (see director.js) rather than different content: same stage,
  // same tiles, same music, harder enemies and richer drops.
  floor: 1,
  // Endless: the run continues past the 20:00 boss. The win is already banked by then, so this
  // can only ever add -- it is a score chase, not a gamble with the victory.
  endless: false,
  endlessBosses: 0,
  // At most ONE staircase is on the field at a time, so this is a plain record on G rather than
  // another entity pool. `near` is republished every tick by the proximity check.
  stairs: { x: 0, y: 0, active: false, near: false },
  // The portal to a secret floor: the same shape as the stairs, plus where it leads back from.
  portal: { x: 0, y: 0, active: false, near: false, back: false },
  // True while on a secret floor. The legendary itself lives in legends.js.
  secret: false,
  // Relics carried this run, by legendary id, in the order they were taken. See data/legends.js.
  relics: [],
  // The Explorer's Bag (bag.js): one item id or null per slot, the timed buffs on you, whether a
  // Luminous Orb has lit this floor, and the bag item you are standing on with no room for it.
  bag: [null, null, null],
  buffs: [],
  lumFloor: false,
  bagOver: null,
  // Totems on this floor (totems.js), whether one is being woken (the crowd presses harder), the
  // Fortune totem you are standing at, and the blessings already taken this run.
  totems: [],
  totemPressure: false,
  fortuneNear: null,
  blessings: [],
  // Permanent perks from Expedition Records, read at the start of a run (save.js), and what this
  // run has done toward the records (set up by startRun; see main.js recordWin and the hooks).
  perks: {},
  trk: null,

  // --- run configuration ---
  stage: null,      // stage definition
  // The playable floor, in world pixels, derived from stage.arena when the run starts. Every
  // system that moves something clamps against this: the player, the enemies, the spawn ring,
  // the camera and the scenery. Null means unbounded.
  bounds: null,
  character: null,  // starter definition
  form: null,       // current evolution form (base stats live here)

  // --- the player ---
  player: null,
  stats: null,      // resolved stat block, rebuilt only when statsDirty
  statsDirty: true,
  mods: [],         // { stat, op:'flat'|'inc'|'more', value, scope } -- source of truth for stats

  // --- loadout ---
  weapons: [],      // <= MAX_WEAPONS live weapon instances
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
  banner: { text: '', sub: '', t: 0 },

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
    noPaths: false, // walkers ignore the flow field and walk straight (A/B for paths.js)
    ms: {},         // per-system millisecond timings
    counts: {},     // per-pool entity counts
  },
};

/**
 * True while a won run is standing still for its victory beat: nothing can hurt the player, no
 * card screen can interrupt, and no ability fires into the payout being collected.
 *
 * Not the same as G.won. In endless G.won stays true for the rest of the run -- the win is kept --
 * but the game is being played again, so every one of those gates has to reopen. Four of them
 * checked G.won directly, which left endless with no damage, no abilities, no level-ups and no
 * wheel for as long as it lasted.
 */
export const winFrozen = () => G.won && !G.endless;

/** Per-run fields only. Does NOT touch G.save, G.debug, or the mode machine. */
export function resetRunState() {
  G.tick = 0;
  G.runTime = 0;
  G.clock = 0;
  G.runOver = false;
  G.won = false;
  G.victoryT = 0;
  G.banked = false;
  G.revivesLeft = 0;
  G.pendingWheel = false;
  G.presentT = 0;
  G.floor = 1;
  G.endless = false;
  G.endlessBosses = 0;
  G.stairs.x = 0; G.stairs.y = 0; G.stairs.active = false; G.stairs.near = false;
  G.portal.x = 0; G.portal.y = 0; G.portal.active = false; G.portal.near = false; G.portal.back = false;
  G.secret = false;
  G.relics.length = 0;
  G.bag = [null, null, null];
  G.buffs = [];
  G.lumFloor = false;
  G.bagOver = null;
  G.totems = [];
  G.totemPressure = false;
  G.fortuneNear = null;
  G.blessings = [];
  G.player = null;
  G.form = null;
  G.shiny = false;
  G.endLockUntil = 0;
  G.bounds = null;
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
  G.banner.t = 0;
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
