// L3 -- may import L0-L2.
//
// The spawn director: how many enemies exist, how hard they hit, and when the set pieces fire.
// Every tuning number lives here or in data/stages.js, never inline in a system, so the whole
// difficulty curve can be retuned without touching gameplay code.

import { G } from './state.js';
import { enemies } from './world.js';
import { ENEMIES } from './data/enemies.js';
import { spawnAtRing, spawnEnemy, combatantCount, SPAWN_MIN, SPAWN_MAX } from './enemies.js';
import { pickWeighted, TAU, clamp } from './util.js';

export const RUN_LENGTH = 20 * 60;        // seconds; the boss spawns at 20:00
const SPAWN_INTERVAL = 0.5;               // the director ticks twice a second

/**
 * The curve. `m` is elapsed minutes, fractional.
 *
 * The quadratic terms are what turn minute 15+ from "busy" into "overwhelming". They are also the
 * two least certain numbers in the whole design -- if the alive count hits the cap before 12:00,
 * lower CAP_SLOPE; if competent players stall out at 16:00 with a full build, lower HP_QUAD.
 */
const SPS_BASE = 1.6, SPS_LIN = 0.55, SPS_QUAD = 0.03;
const HP_LIN = 0.10, HP_QUAD = 0.018;
const DMG_LIN = 0.06, DMG_QUAD = 0.004;
const SPD_LIN = 0.012, SPD_MAX = 1.30;
const CAP_BASE = 25, CAP_SLOPE = 13, CAP_MAX = 280;

export const sps = (m) => SPS_BASE + SPS_LIN * m + SPS_QUAD * m * m;
export const hpMult = (m) => 1 + HP_LIN * m + HP_QUAD * m * m;
export const dmgMult = (m) => 1 + DMG_LIN * m + DMG_QUAD * m * m;
export const spdMult = (m) => Math.min(SPD_MAX, 1 + SPD_LIN * m);
export const aliveCap = (m) => Math.min(CAP_MAX, CAP_BASE + CAP_SLOPE * m);

// Set pieces, by run time in seconds.
const SPAWN_PAUSES = [[270, 300], [570, 600], [870, 900]];   // 4:30, 9:30, 14:30 -- the inhale
const FINAL_SURGE = 19 * 60;
const MINIBOSS_AT = [300, 600, 900];

let spawnAcc = 0;
let spawnDebt = 0;
let nextFormation = 60;
let nextPincer = 390;
let minibossFired = [false, false, false];
let bossFired = false;

export function resetDirector() {
  spawnAcc = 0;
  spawnDebt = 0;
  nextFormation = 60;
  nextPincer = 390;
  minibossFired = [false, false, false];
  bossFired = false;
  G.curve = { hp: 1, dmg: 1, spd: 1, sps: 0, cap: 0, m: 0 };
}

/**
 * Skip every scheduled set piece that is already in the past.
 *
 * Required whenever the clock jumps (the ?t= debug param, and the time-skip key). Without it the
 * director sees hundreds of missed formation rings and fires one PER TICK trying to catch up,
 * which instantly floods the field and makes the late game impossible to test.
 */
export function catchUpSchedule() {
  const t = G.runTime;
  if (nextFormation <= t) nextFormation = Math.ceil(t / 60) * 60 + 60;
  if (nextPincer <= t) nextPincer = Math.ceil((t - 30) / 60) * 60 + 90;
  for (let i = 0; i < MINIBOSS_AT.length; i++) {
    if (t > MINIBOSS_AT[i]) minibossFired[i] = true;
  }
  // The boss is the win condition, so unlike the mini-bosses it is never skipped: a clock jump
  // past 20:00 queues it immediately instead of marking it already fired.
  if (t > RUN_LENGTH && !bossFired) { bossFired = true; G.pendingBoss = true; }
  spawnAcc = 0;
  spawnDebt = 0;
}

/** Enemies eligible for the current stage and minute, weighted by their `weight`. */
function rollEnemy(m, rng) {
  const stage = (G.stage && G.stage.id) || 'grass';
  return pickWeighted(rng, ENEMIES, (d) =>
    (m >= d.from && m <= d.to && d.stages.includes(stage)) ? d.weight : 0);
}

function spawnMultiplier(t) {
  for (const [a, b] of SPAWN_PAUSES) if (t >= a && t < b) return 0.25;
  if (t >= FINAL_SURGE) return 1.5;
  for (const at of MINIBOSS_AT) if (t >= at && t < at + 30) return 0.5;
  return 1;
}

export function updateDirector(dt) {
  const t = G.runTime;
  const m = t / 60;
  const rng = G.rngRun;
  const stage = G.stage || {};
  const hpK = stage.hpMult || 1;
  const spsK = stage.spsMult || 1;

  // Published to enemies.js via G.curve so spawnEnemy() can scale a new enemy on creation.
  const c = G.curve;
  c.m = m;
  c.hp = hpMult(m) * hpK;
  c.dmg = dmgMult(m);
  c.spd = spdMult(m);
  c.cap = t >= FINAL_SURGE ? 300 : aliveCap(m);
  c.sps = sps(m) * spsK * spawnMultiplier(t);

  spawnAcc += dt;
  while (spawnAcc >= SPAWN_INTERVAL) {
    spawnAcc -= SPAWN_INTERVAL;
    // Carry the fractional remainder rather than rounding each tick. Rounding 0.8 up to 1 every
    // half second would spawn 2/s against a designed 1.6/s -- a 25% error exactly where the early
    // game is most sensitive.
    spawnDebt += c.sps * SPAWN_INTERVAL;
    const want = Math.floor(spawnDebt);
    spawnDebt -= want;
    const room = Math.max(0, c.cap - combatantCount());
    const n = Math.min(want, room);
    for (let i = 0; i < n; i++) {
      const def = rollEnemy(m, rng);
      if (def) spawnAtRing(def, rng);
    }
  }

  // --- Set pieces ---
  // Formation rings bypass the per-tick spawn budget on purpose: they are meant to be a wall.
  if (t >= nextFormation) {
    nextFormation += 60;
    spawnRing(Math.round(40 + 4 * m) >> 1, m, rng);
  }
  if (t >= nextPincer && t < FINAL_SURGE) {
    nextPincer += 60;
    spawnPincer(Math.round(20 + 3 * m) >> 1, m, rng);
  }

  for (let i = 0; i < MINIBOSS_AT.length; i++) {
    if (!minibossFired[i] && t >= MINIBOSS_AT[i]) {
      minibossFired[i] = true;
      G.pendingMiniboss = i + 1;
    }
  }
  if (!bossFired && t >= RUN_LENGTH) {
    bossFired = true;
    G.pendingBoss = true;
  }
}

/** A closed circle of enemies at spawn range, all walking inward. */
function spawnRing(count, m, rng) {
  const def = rollEnemy(m, rng);
  if (!def) return;
  const p = G.player;
  const r = SPAWN_MAX;
  const off = rng() * TAU;
  for (let i = 0; i < count; i++) {
    const a = off + (i / count) * TAU;
    spawnEnemy(def, p.x + Math.cos(a) * r, p.y + Math.sin(a) * r);
  }
}

/** Two walls closing from opposite sides. */
function spawnPincer(count, m, rng) {
  const def = rollEnemy(m, rng);
  if (!def) return;
  const p = G.player;
  const a = rng() * TAU;
  const nx = Math.cos(a), ny = Math.sin(a);
  for (let side = -1; side <= 1; side += 2) {
    for (let i = 0; i < count; i++) {
      const spread = (i / (count - 1) - 0.5) * 2 * 260;
      spawnEnemy(def,
        p.x + nx * SPAWN_MIN * side - ny * spread,
        p.y + ny * SPAWN_MIN * side + nx * spread);
    }
  }
}

/** Debug helper: dump N enemies on the ring immediately, for the stress test. */
export function stressSpawn(n) {
  const rng = G.rngRun;
  const m = G.runTime / 60;
  for (let i = 0; i < n; i++) {
    const def = rollEnemy(m, rng) || ENEMIES[0];
    spawnAtRing(def, rng);
  }
}
