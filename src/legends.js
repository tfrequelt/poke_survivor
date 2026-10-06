// L3 -- may import L0-L2. May NOT import enemies.js: main.js spawns the boss and hands it over.
//
// The secret floor's legendary: how it moves, what it attacks with, and everything those attacks
// leave on the field.
//
// A boss is an ordinary enemy entity -- weapons, abilities, burns and damage numbers all work on
// it unchanged -- with the `scripted` AI, which leaves its velocity to this file. What it DOES is
// data (data/legends.js): a movement style, a pool of moves, a trait it carries all fight, and a
// rage below half health. This file is the vocabulary those are written in.
//
// Three things it puts on the field:
//   * SHOTS are hostile projectiles from the world pool, with a `look` and a `status`, so the
//     existing collision against the player (and the Substitute) does the hitting.
//   * HAZARDS are telegraphed or lingering areas -- a lightning strike that lands where its
//     circle was, a pillar of flame closing in, a patch of burning ground. Fixed slots, no
//     allocation during the fight.
//   * BEAMS are lines of damage from the boss: telegraphed, then live for a moment.
//
// Every attack telegraphs. A strike shows its circle before it lands; a beam shows its line; a
// dash shows its lane. A boss that hits from nowhere is not hard, it is unfair.

import { G } from './state.js';
import { TAU, dist2, clamp, clampToBounds } from './util.js';
import {
  projectiles, spawn, nextHitId, decoys, decoyTargetable, damageDecoy,
} from './world.js';
import { damagePlayer, statusPlayer } from './combat.js';
import { typeTable } from './data/types.js';
import { dirFromAngle } from './assets.js';
import {
  LOOKS, STATUS, lookIndex, statusIndex, legendHpScale, LEGEND_DMG, LEGEND_CD, LAST_STAND_AT,
} from './data/legends.js';

/** Every number a boss hurts you with goes through here, so one knob tunes them all. */
const D = (x) => Math.round(x * LEGEND_DMG);

// --- State ---------------------------------------------------------------------------------

/** The fight, or `active: false` when there is none. Read by the renderer and the HUD. */
export const legend = {
  active: false,
  def: null,
  e: null,
  phase: 1,
  state: 'idle',          // 'intro' | 'idle' | 'busy' | 'dead'
  introT: 0,
  next: 0,                // clock time of the next move
  busyUntil: 0,
  lastMove: '',
  pose: '',               // the PMD animation playing, or '' for the walk
  poseT: 0,
  dir: 0,
  z: 0,                   // height above the ground, for the birds and the dive
  motion: 'free',         // 'free' | 'hold' | 'dash' | 'dive'
  orbitA: 0, orbitDir: 1, strafeT: 0,
  traitT: 0, guardT: 0, quakeT: 0,
  weather: '', weatherT: 0,
  dash: null,             // the dash in progress, see startDash
  dive: null,
  trailT: 0,
  reticle: { on: false, x: 0, y: 0 },
  // The second trait's bookkeeping, read by the renderer for its tells.
  lastHp: 0, shedAcc: 0, veilAcc: 0,
  frost: 0,               // Frostbite: seconds of cold built up in you, out of `frostMax`
  frostMax: 0, frostR: 0,
  heatR: 0,               // Heat: Moltres's burning radius, 0 when it has none
  magPhase: '', magTime: 0, magT: 0,   // Magnet Pull: '' | 'warn' | 'pull'
  veilOn: 0, veilT: 0,    // Aurora Veil: seconds left on the veil, and until the next
  stillCd: 0, stompT: 0, roarT: 0, terrT: 0, lastT: 0, traitT2: 0,
  push: { t: 0, vx: 0, vy: 0 },        // a shove on the player (Entei's roar)
  forceMove: null,        // the last stand's signature, cast first
};

/** Set by main.js: shake, sound, banner, sparks -- so this file reaches nothing upward. */
export const fx = { shake: null, sfx: null, banner: null, burst: null };

const HAZARD_CAP = 200;
export const HZ = { STRIKE: 1, PILLAR: 2, ZONE: 3, ORB: 4, LOB: 5, WAVE: 6, RING: 7, TOMB: 8, TERRAIN: 9 };

const newHazard = () => ({
  alive: false, kind: 0, x: 0, y: 0, r: 0,
  delay: 0, t: 0, life: 0, dmg: 0, status: 0, look: 0, look2: 0, fall: false, hit: false,
  vx: 0, vy: 0, speed: 0, cx: 0, cy: 0, ang: 0, r0: 0, r1: 0, dur: 0,
  hitCd: 0, zapT: 0, x0: 0, y0: 0, gap: 0, dir: 0, tick: 0, color: '',
  zap: null,
});
export const hazards = Array.from({ length: HAZARD_CAP }, newHazard);

const BEAM_CAP = 8;
const newBeam = () => ({
  alive: false, angle: 0, len: 0, width: 0, t: 0, telegraph: 0, dur: 0, dmg: 0,
  sweep: 0, spin: 0, color: '#fff', edge: '#fff', status: 0, tick: 0, tickT: 0, hit: false,
});
export const beams = Array.from({ length: BEAM_CAP }, newBeam);

// Scheduled actions for the move in progress. A move is a short timeline -- three volleys a third
// of a second apart, a line of pillars rippling outward -- and this is that timeline. Only ever a
// handful long, and filled once per move, so the closures it holds are not a frame-time cost.
const queue = [];
const after = (sec, fn) => queue.push({ at: G.clock + sec, fn });

// The shots that orbit the boss before they are released (Ancient Power).
const orbiters = [];

// --- Lifecycle -------------------------------------------------------------------------------

/**
 * The enemy definition spawnEnemy needs for a legendary. Stats are set again by beginLegend --
 * spawnEnemy scales by the run's difficulty curve, which knows nothing about bosses -- so these
 * only have to be the right shape.
 */
export function legendEnemyDef(def, aiIdx) {
  return {
    id: def.id, name: def.name, shape: def.id, legend: true,
    hp: def.hp, dmg: def.dmg, speed: def.speed, r: def.r, mass: 60, xp: 0,
    armor: def.armor, knockResist: 1, coinChance: 0, boss: true,
    flying: false, prop: false, harmless: false, noScale: false,
    aiIdx, attack: null, sprBase: -1, sprEliteBase: -1, sprDirs: 8, sprFrames: 4,
    // Its real types: a legendary is a type puzzle like anything else.
    typeMul: typeTable(def.id),
  };
}

/** Take control of a freshly spawned legendary and start its entrance. */
export function beginLegend(def, e) {
  clearLegend();
  const L = legend;
  L.active = true;
  L.def = def;
  L.e = e;
  L.phase = 1;
  L.state = 'intro';
  L.introT = 0;
  L.motion = 'hold';
  L.pose = '';
  L.poseT = 0;
  L.z = INTRO_HEIGHT;
  L.dir = 0;
  L.orbitA = Math.atan2(e.y - G.player.y, e.x - G.player.x);
  L.orbitDir = 1;
  L.traitT = (def.trait && def.trait.every) || 0;
  L.guardT = 0;
  const t2 = def.trait2 || {};
  L.frost = 0; L.frostMax = t2.build || 0; L.frostR = t2.kind === 'frostbite' ? t2.r : 0;
  L.heatR = t2.kind === 'heat' ? t2.r : 0;
  L.magPhase = ''; L.magTime = 0; L.magT = t2.every || 0;
  L.veilOn = 0; L.veilT = t2.every || 0; L.veilAcc = 0; L.shedAcc = 0;
  L.stillCd = 0; L.stompT = 0; L.roarT = t2.every || 0; L.terrT = 3; L.lastT = 0;
  L.push.t = 0; L.forceMove = null;

  const hp = Math.round(def.hp * legendHpScale(G.level));
  e.maxHp = e.hp = hp;
  e.dmg = D(def.dmg);
  e.speed = def.speed;
  e.r = def.r;
  e.armor = def.armor;
  e.knockResist = 1;
  e.mass = 60;
  e.xp = 0;
  e.coinChance = 0;
  e.boss = true;
  // Harmless until it has landed: the entrance is a cutscene, not a free hit either way.
  e.harmless = true;
  e.spawnT = 0;
}

/** Wipe every hazard, beam and pending action. The boss itself is the world's to remove. */
export function clearLegend() {
  const L = legend;
  L.active = false;
  L.def = null;
  L.e = null;
  L.state = 'idle';
  L.weather = '';
  L.weatherT = 0;
  L.dash = null;
  L.dive = null;
  L.reticle.on = false;
  L.z = 0;
  queue.length = 0;
  orbiters.length = 0;
  for (const h of hazards) { h.alive = false; h.zap = null; }
  for (const b of beams) b.alive = false;
}

/** The boss is down: stop everything it was doing, and take its shots with it. */
export function endLegend() {
  const L = legend;
  L.state = 'dead';
  queue.length = 0;
  orbiters.length = 0;
  L.weather = '';
  L.dash = null;
  L.dive = null;
  L.reticle.on = false;
  for (const h of hazards) { h.alive = false; h.zap = null; }
  for (const b of beams) b.alive = false;
  for (let i = 0; i < projectiles.length; i++) {
    const pr = projectiles[i];
    if (pr.hostile) pr.life = pr.maxLife;     // expire this tick; updateProjectiles recycles them
  }
}

// --- Update ----------------------------------------------------------------------------------

const INTRO_HEIGHT = 220;
const INTRO_TIME = 1.4;
const FIRST_MOVE = 0.9;
const RAGE_AT = 0.5;
const RAGE_CD = 0.75;
const RAGE_SPEED = 1.15;

// The point the boss is going for: you, or a Substitute doll if one is nearer. Reused.
const _t = { x: 0, y: 0 };

function target() {
  const p = G.player, e = legend.e;
  _t.x = p.x; _t.y = p.y;
  let best = dist2(e.x, e.y, p.x, p.y);
  for (let i = 0; i < decoys.length; i++) {
    const d = decoys[i];
    if (!decoyTargetable(d)) continue;
    const dd = dist2(e.x, e.y, d.x, d.y);
    if (dd < best) { best = dd; _t.x = d.x; _t.y = d.y; }
  }
  return _t;
}

// Rage is phase 2 AND phase 3: the last stand keeps everything rage unlocked.
const rage = () => legend.phase >= 2;
const lastStand = () => legend.phase === 3;
const pick = (m, key) => (rage() && m['rage' + key[0].toUpperCase() + key.slice(1)] !== undefined
  ? m['rage' + key[0].toUpperCase() + key.slice(1)] : m[key]);

/**
 * One tick of the fight. Runs before updateEnemies, which then moves the boss by the velocity
 * set here and clamps it inside the room.
 */
export function updateLegend(dt) {
  const L = legend;
  if (!L.active) return;
  const e = L.e;

  updateHazards(dt);
  updateBeams(dt);
  updateShots(dt);
  if (L.weatherT > 0) { L.weatherT -= dt; if (L.weatherT <= 0 && !permaWeather()) L.weather = ''; }
  pushPlayer(dt);

  if (!e || !e.alive || L.state === 'dead') return;

  L.poseT += dt;
  // Bosses are not stunned, shoved or frozen in place. A legendary that a level-3 Thunderbolt
  // could pin forever would not be a fight.
  e.stunT = 0;
  if (e.slow > 0.3) e.slow = 0.3;
  if (L.def.trait.kind === 'quake') e.slow = 0;

  if (L.state === 'intro') { intro(dt); return; }

  if (L.phase === 1 && e.hp <= e.maxHp * RAGE_AT) enrage();
  if (L.phase === 2 && e.hp <= e.maxHp * LAST_STAND_AT) beginLastStand();

  runQueue();
  trait(dt);
  trait2(dt);
  lastStandTick(dt);

  const t = target();
  if (L.motion === 'dash') dashStep(dt);
  else if (L.motion === 'dive') diveStep(dt, t);
  else if (L.motion === 'hold') { e.vx = 0; e.vy = 0; }
  else steer(dt, t);

  if (L.motion !== 'dash') L.dir = dirFromAngle(Math.atan2(t.y - e.y, t.x - e.x));
  if (L.def.hover && L.motion !== 'dive') L.z = L.def.hover + Math.sin(G.clock * 2.2) * 3;

  if (L.state === 'busy' && G.clock >= L.busyUntil && !L.dash && !L.dive) {
    L.state = 'idle';
    L.motion = 'free';
    L.pose = '';
  }
  if (L.state === 'idle' && G.clock >= L.next) startMove();
}

/** Falls (or flies) in from above, lands with a shake, and only then can be hurt. */
function intro(dt) {
  const L = legend, e = L.e;
  L.introT += dt;
  e.vx = 0; e.vy = 0;
  const k = Math.min(1, L.introT / INTRO_TIME);
  const land = L.def.hover || 0;
  L.z = land + (INTRO_HEIGHT - land) * (1 - k) * (1 - k);
  if (k >= 1) {
    L.state = 'idle';
    L.motion = 'free';
    L.next = G.clock + FIRST_MOVE;
    e.harmless = false;
    // Whatever landed on it while it was still in the sky does not count: weapons aim at the
    // ground it is about to land on, and a boss that arrives already hurt is a worse entrance.
    e.hp = e.maxHp;
    L.lastHp = e.hp;
    if (fx.shake) fx.shake(0.55);
    if (fx.sfx) fx.sfx('boss');
    if (fx.burst) fx.burst(e.x, e.y, 24, L.def.color);
  }
}

function enrage() {
  const L = legend;
  L.phase = 2;
  if (fx.banner) fx.banner(`${L.def.name.toUpperCase()} IS ENRAGED`, L.def.rageText, 2.4);
  if (fx.shake) fx.shake(0.6);
  if (fx.sfx) fx.sfx('boss');
  if (fx.burst) fx.burst(L.e.x, L.e.y, 30, L.def.color);
  L.e.speed = L.def.speed * RAGE_SPEED;
  // Suicune's rain does not wait for a move: it sets in the moment the fight turns.
  if (L.def.trait.kind === 'rain') { L.weather = 'rain'; L.weatherT = 1e9; }
}

function runQueue() {
  for (let i = queue.length - 1; i >= 0; i--) {
    if (queue[i].at > G.clock) continue;
    const q = queue[i];
    queue[i] = queue[queue.length - 1];
    queue.pop();
    q.fn();
  }
}

// --- Movement --------------------------------------------------------------------------------

function steer(dt, t) {
  const L = legend, e = L.e, d = L.def;
  const sp = e.speed;
  const dx = t.x - e.x, dy = t.y - e.y;
  const dist = Math.hypot(dx, dy) || 1;

  if (d.style === 'glide') {
    // Circling: chase a point on a ring around the target that keeps sliding round. The birds
    // never close in to bite -- contact is something you walk into, not something they do.
    L.orbitA += L.orbitDir * (sp / d.keep) * dt;
    if (G.rngRun() < dt * 0.15) L.orbitDir = -L.orbitDir;
    const gx = t.x + Math.cos(L.orbitA) * d.keep - e.x;
    const gy = t.y + Math.sin(L.orbitA) * d.keep - e.y;
    const g = Math.hypot(gx, gy) || 1;
    const v = Math.min(sp * 1.4, g * 3);
    e.vx = (gx / g) * v;
    e.vy = (gy / g) * v;
  } else if (d.style === 'stalk') {
    // Prowling: hold a distance and strafe across it, switching sides now and then.
    L.strafeT -= dt;
    if (L.strafeT <= 0) { L.strafeT = 1.6 + G.rngRun() * 1.6; L.orbitDir = -L.orbitDir; }
    const radial = clamp((dist - d.keep) / 40, -1, 1);
    const nx = dx / dist, ny = dy / dist;
    e.vx = (nx * radial - ny * 0.75 * L.orbitDir) * sp;
    e.vy = (ny * radial + nx * 0.75 * L.orbitDir) * sp;
  } else {
    // Marching: straight at you, and it does not stop until it is on top of you.
    if (dist > d.keep + e.r) { e.vx = (dx / dist) * sp; e.vy = (dy / dist) * sp; }
    else { e.vx = 0; e.vy = 0; }
  }
}

// --- Moves -----------------------------------------------------------------------------------

function startMove() {
  const L = legend, d = L.def;
  const sig = lastStand() && d.last ? d.last.move : null;
  let move = L.forceMove;
  L.forceMove = null;
  if (!move) {
    let total = sig && sig.id !== L.lastMove ? sig.weight : 0;
    for (const m of d.moves) {
      if (m.rage && !rage()) continue;
      if (m.id === L.lastMove && d.moves.length > 1) continue;
      total += m.weight;
    }
    let r = G.rngRun() * total;
    if (sig && sig.id !== L.lastMove) { r -= sig.weight; if (r <= 0) move = sig; }
    if (!move) {
      for (const m of d.moves) {
        if (m.rage && !rage()) continue;
        if (m.id === L.lastMove && d.moves.length > 1) continue;
        r -= m.weight;
        if (r <= 0) { move = m; break; }
      }
    }
  }
  if (!move) return;

  L.lastMove = move.id;
  L.state = 'busy';
  L.motion = 'hold';
  setPose(move.anim);
  L.e.flash = Math.max(L.e.flash, 0.08);
  const dur = MOVES[move.kind](move);
  L.busyUntil = G.clock + move.windup + (dur || 0.4);
  L.next = L.busyUntil + move.cd * LEGEND_CD * (rage() ? RAGE_CD : 1) * (lastStand() ? 0.85 : 1);
}

function setPose(anim) {
  legend.pose = anim || '';
  legend.poseT = 0;
}

const aimAt = () => {
  const e = legend.e, t = target();
  return Math.atan2(t.y - e.y, t.x - e.x);
};

/**
 * Each returns how long the move keeps the boss busy AFTER its windup. The windup itself is the
 * telegraph: the boss stops, plays its attack pose and flashes.
 */
const MOVES = {
  /** A spread of shots at the target, in one or more volleys re-aimed each time. */
  fan(m) {
    const n = pick(m, 'count'), volleys = pick(m, 'volleys') || 1;
    for (let v = 0; v < volleys; v++) {
      after(m.windup + v * (m.gap || 0.3), () => {
        const e = legend.e, a = aimAt();
        for (let i = 0; i < n; i++) {
          const k = n > 1 ? i / (n - 1) - 0.5 : 0;
          const pr = shoot(e.x, e.y, a + k * m.spread, m.speed, m.dmg, m.look, m.status, m.bounce || 0);
          // Curving blades bend alternately left and right, so the fan opens into an X.
          if (pr && m.curve) pr.freq = m.curve * (i % 2 ? 1 : -1);
        }
        sfx(m);
      });
    }
    return (volleys - 1) * (m.gap || 0.3) + 0.35;
  },

  /** A full circle of shots, in waves turned half a step from each other. */
  ring(m) {
    const waves = pick(m, 'waves') || 1;
    const base = G.rngRun() * TAU;
    for (let w = 0; w < waves; w++) {
      after(m.windup + w * m.gap, () => {
        const e = legend.e;
        const off = base + (w % 2) * (Math.PI / m.count);
        for (let i = 0; i < m.count; i++) {
          shoot(e.x, e.y, off + (i / m.count) * TAU, m.speed, m.dmg, m.look, m.status, 0);
        }
        sfx(m);
      });
    }
    return (waves - 1) * m.gap + 0.4;
  },

  /** Arms of shots winding outward for a while. */
  spiral(m) {
    const rate = pick(m, 'rate'), n = Math.round(m.dur * rate), base = G.rngRun() * TAU;
    for (let i = 0; i < n; i++) {
      after(m.windup + i / rate, () => {
        const e = legend.e, t = i / rate;
        for (let k = 0; k < m.arms; k++) {
          const pr = shoot(e.x, e.y, base + t * m.turn + (k / m.arms) * TAU, m.speed, m.dmg, m.look, m.status, 0);
          if (pr && m.curve) pr.freq = m.curve;
        }
      });
    }
    after(m.windup, () => sfx(m));
    return m.dur + 0.2;
  },

  /** A stream of shots swept across the target, like a flamethrower dragged sideways. */
  sweep(m) {
    const n = Math.round(m.dur * m.rate);
    let aim = 0;
    after(m.windup, () => { aim = aimAt(); sfx(m); });
    for (let i = 0; i < n; i++) {
      after(m.windup + i / m.rate + 0.001, () => {
        const e = legend.e;
        const k = n > 1 ? i / (n - 1) - 0.5 : 0;
        shoot(e.x, e.y, aim + k * m.arc, m.speed, m.dmg, m.look, m.status, 0);
      });
    }
    return m.dur + 0.2;
  },

  /** Telegraphed strikes, placed by a pattern. Each lands where its circle was. */
  strikes(m) {
    const p = m.pattern;
    const fall = !!m.fall;
    if (p === 'follow') {
      const n = pick(m, 'count');
      for (let i = 0; i < n; i++) {
        after(m.windup + i * m.stagger, () => {
          const t = target();
          strike(t.x, t.y, m.r, m.delay, m.dmg, m.look, m.status, fall);
          if (i === 0) sfx(m);
        });
      }
      return n * m.stagger + m.delay;
    }
    if (p === 'cage') {
      after(m.windup, () => {
        const t = target();
        const cx = t.x, cy = t.y;
        const hole = (G.rngRun() * m.count) | 0;
        for (let i = 0; i < m.count; i++) {
          const gapIdx = (i - hole + m.count) % m.count;
          if (gapIdx < m.holes) continue;
          const a = (i / m.count) * TAU;
          after(i * m.stagger, () =>
            strike(cx + Math.cos(a) * m.radius, cy + Math.sin(a) * m.radius, m.r, m.delay, m.dmg, m.look, m.status, false));
        }
        if (m.finale) after(m.finale.delay - m.delay, () => strike(cx, cy, m.finale.r, m.delay, m.finale.dmg, m.look, m.status, false));
        sfx(m);
      });
      return m.count * m.stagger + (m.finale ? m.finale.delay : m.delay);
    }
    if (p === 'rings') {
      const rings = m.rings.slice(0, rage() ? m.rageRings : m.baseRings);
      after(m.windup, () => {
        const e = legend.e;
        const cx = e.x, cy = e.y;
        rings.forEach(([radius, count], ri) => {
          const off = ri * 0.3;
          for (let i = 0; i < count; i++) {
            const a = off + (i / count) * TAU;
            strike(cx + Math.cos(a) * radius, cy + Math.sin(a) * radius, m.r, m.delay + ri * m.ringGap, m.dmg, m.look, m.status, false);
          }
        });
        sfx(m);
      });
      return m.delay + rings.length * m.ringGap;
    }
    // 'around' (one on the target, the rest near it) and 'random' (all near it), in waves.
    const n = pick(m, 'count'), waves = pick(m, 'waves') || 1;
    for (let w = 0; w < waves; w++) {
      after(m.windup + w * (m.wave || 0.5), () => {
        const t = target();
        for (let i = 0; i < n; i++) {
          let x = t.x, y = t.y;
          if (p !== 'around' || i > 0) {
            const a = G.rngRun() * TAU, rr = m.radius * Math.sqrt(G.rngRun());
            x += Math.cos(a) * rr; y += Math.sin(a) * rr;
          }
          strike(x, y, m.r, m.delay + i * 0.04, m.dmg, m.look, m.status, fall, m.impact);
        }
        sfx(m);
      });
    }
    return (waves - 1) * (m.wave || 0.5) + m.delay;
  },

  /** Strikes rippling out from the boss along one or more lanes toward the target. */
  line(m) {
    const lines = pick(m, 'lines') || 1;
    after(m.windup, () => {
      const e = legend.e, a0 = aimAt(), x0 = e.x, y0 = e.y;
      for (let l = 0; l < lines; l++) {
        const a = a0 + (l - (lines - 1) / 2) * (m.fan || 0.4);
        for (let k = 1; k <= m.count; k++) {
          const x = x0 + Math.cos(a) * (k * m.step + 6), y = y0 + Math.sin(a) * (k * m.step + 6);
          after(k * m.gap, () => strike(x, y, m.r, m.delay, m.dmg, m.look, m.status, false));
        }
      }
      sfx(m);
    });
    return m.count * m.gap + m.delay;
  },

  /** Weather, and things falling out of it for as long as it lasts. */
  storm(m) {
    const n = pick(m, 'drops');
    after(m.windup, () => {
      legend.weather = m.weather;
      legend.weatherT = m.dur;
      sfx(m);
    });
    for (let i = 0; i < n; i++) {
      after(m.windup + (i / n) * (m.dur - m.delay), () => {
        const t = target();
        const a = G.rngRun() * TAU, rr = m.radius * Math.sqrt(G.rngRun());
        // Every third one is aimed straight at you, so standing still is never the answer.
        const on = i % 3 === 0;
        strike(on ? t.x : t.x + Math.cos(a) * rr, on ? t.y : t.y + Math.sin(a) * rr,
          m.r, m.delay, m.dmg, m.look, m.status, true);
      });
    }
    return 0.6;
  },

  /** Whirlwinds that wander after the target for a while. */
  tornado(m) {
    after(m.windup, () => {
      const e = legend.e;
      const n = pick(m, 'count');
      for (let i = 0; i < n; i++) {
        const h = hazard(HZ.PILLAR);
        if (!h) break;
        const a = (i / n) * TAU + G.rngRun();
        h.x = e.x + Math.cos(a) * 30; h.y = e.y + Math.sin(a) * 30;
        h.r = m.r; h.life = m.life; h.dmg = D(m.dmg); h.status = statusIndex(m.status);
        h.look = lookIndex(m.look); h.speed = m.speed; h.dir = 1;     // dir 1: it hunts
      }
      sfx(m);
    });
    return 0.5;
  },

  /** A ring of pillars around the target that tightens, with a gap to escape through. */
  closing(m) {
    after(m.windup, () => {
      const t = target();
      const cx = t.x, cy = t.y;
      const hole = (G.rngRun() * m.count) | 0;
      const spin = (G.rngRun() < 0.5 ? -1 : 1) * 0.5;
      for (let i = 0; i < m.count; i++) {
        if ((i - hole + m.count) % m.count < m.holes) continue;
        const h = hazard(HZ.PILLAR);
        if (!h) break;
        h.cx = cx; h.cy = cy; h.ang = (i / m.count) * TAU; h.r0 = m.from; h.r1 = m.to;
        h.dur = m.dur; h.life = m.dur + 0.5; h.r = m.r; h.dmg = D(m.dmg);
        h.status = statusIndex(m.status); h.look = lookIndex(m.look); h.speed = spin;
        h.x = cx + Math.cos(h.ang) * m.from; h.y = cy + Math.sin(h.ang) * m.from;
        // A short warning before the pillars hurt, so the ring can be read before it bites.
        h.delay = 0.45;
      }
      sfx(m);
    });
    return 0.8;
  },

  /** Lines of damage from the boss: telegraphed, then live. */
  beam(m) {
    const n = pick(m, 'beams') || 1, repeat = pick(m, 'repeat') || 1;
    const each = m.telegraph + m.dur + 0.15;
    for (let r = 0; r < repeat; r++) {
      after(m.windup + r * each, () => {
        const a0 = m.spin ? G.rngRun() * TAU : aimAt();
        for (let i = 0; i < n; i++) {
          const b = beam();
          if (!b) break;
          b.angle = m.spin ? a0 + (i / n) * TAU : a0 + (i - (n - 1) / 2) * (m.fan || 0.35);
          // A sweeping beam starts to one side and drags across the aim.
          if (m.sweep) b.angle -= m.sweep / 2;
          b.len = m.length; b.width = m.width; b.t = 0; b.telegraph = m.telegraph; b.dur = m.dur;
          b.dmg = D(m.dmg); b.sweep = m.sweep || 0; b.spin = m.spin ? 0.9 : 0;
          b.color = m.color; b.edge = m.edge; b.status = statusIndex(m.status);
          b.tick = m.tick || 0; b.tickT = 0; b.hit = false;
        }
        after(m.telegraph, () => sfx(m));
      });
    }
    return repeat * each;
  },

  /** Charges along a telegraphed lane, once or several times. */
  dash(m) {
    after(m.windup, () => startDash(m, pick(m, 'times')));
    return 0.3;
  },

  /** Rises out of reach, hunts your position from above, and comes down on it. */
  dive(m) {
    after(m.windup, () => startDive(m, pick(m, 'times')));
    return 0.3;
  },

  /** Lobs something heavy at where you are standing. It lands in a burst. */
  lob(m) {
    after(m.windup, () => {
      const e = legend.e, t = target();
      const h = hazard(HZ.LOB);
      if (h) {
        h.x0 = e.x; h.y0 = e.y - 10; h.x = t.x; h.y = t.y; h.dur = m.flight; h.life = m.flight;
        h.look = lookIndex(m.look); h.r = m.r;
      }
      const x = t.x, y = t.y;
      strike(x, y, m.r, m.flight, m.dmg, m.impact, m.status, false);
      after(m.flight, () => {
        const b = m.burst;
        for (let i = 0; i < b.count; i++) shoot(x, y, (i / b.count) * TAU, b.speed, b.dmg, b.look, '', 0);
        if (fx.shake) fx.shake(0.3);
      });
      sfx(m);
    });
    return m.flight + 0.2;
  },

  /** Stones circle the boss, then fly outward all at once. */
  orbit(m) {
    after(m.windup, () => {
      const e = legend.e;
      orbiters.length = 0;
      for (let i = 0; i < m.count; i++) {
        const pr = shoot(e.x, e.y, 0, 0, m.dmg, m.look, '', 0);
        if (!pr) break;
        pr.orbitA = (i / m.count) * TAU;
        pr.orbitR = m.radius;
        pr.maxLife = m.spinUp + 3;
        orbiters.push(pr);
      }
      sfx(m);
      after(m.spinUp, () => {
        for (const pr of orbiters) {
          if (!pr.alive || !pr.hostile || pr.orbitR <= 0) continue;
          pr.vx = Math.cos(pr.orbitA) * m.speed;
          pr.vy = Math.sin(pr.orbitA) * m.speed;
          pr.orbitR = 0;
        }
        orbiters.length = 0;
      });
    });
    return m.spinUp + 0.3;
  },

  /** Slow seekers that home on the target and burst when they run out. */
  homing(m) {
    after(m.windup, () => {
      const e = legend.e, a = aimAt();
      for (let i = 0; i < m.count; i++) {
        const pr = shoot(e.x, e.y, a + (i / (m.count - 1 || 1) - 0.5) * 2.2, m.speed, m.dmg, m.look, '', 0);
        if (!pr) break;
        pr.homingTurn = m.turn;
        pr.maxLife = m.life;
        pr.r = 6;
        pr.payload = 1;                    // bursts when it expires
      }
      sfx(m);
    });
    return 0.5;
  },

  /** Crackling orbs set down around the target, each calling lightning on it. */
  field(m) {
    after(m.windup, () => {
      const t = target();
      for (let i = 0; i < m.count; i++) {
        const h = hazard(HZ.ORB);
        if (!h) break;
        const a = (i / m.count) * TAU + G.rngRun() * 0.5;
        const p = clampIn(t.x + Math.cos(a) * m.radius, t.y + Math.sin(a) * m.radius, 24);
        h.x = p.x; h.y = p.y;
        h.r = 7; h.life = m.life; h.dmg = D(m.dmg); h.look = lookIndex(m.look);
        h.status = statusIndex(m.status);
        h.zapT = m.zapEvery * (0.4 + i / m.count);
        h.zap = m;
      }
      sfx(m);
    });
    return 0.5;
  },

  /** A circle round the target; still inside it when it closes, and you are frozen solid. */
  prison(m) {
    after(m.windup, () => {
      const t = target();
      strike(t.x, t.y, m.r, m.delay, m.dmg, m.look, m.status, false);
      sfx(m);
    });
    return m.delay;
  },

  /** A wall of water across the whole room, with one gap in it. */
  surf(m) {
    const times = pick(m, 'times') || 1;
    for (let i = 0; i < times; i++) {
      after(m.windup + i * 1.6, () => {
        const b = G.bounds;
        const h = hazard(HZ.WAVE);
        if (!h) return;
        const fromLeft = G.rngRun() < 0.5;
        h.dir = fromLeft ? 1 : -1;
        h.x = fromLeft ? b.minX - 40 : b.maxX + 40;
        // The gap is placed near the player half the time and anywhere the other half.
        const p = G.player;
        const near = G.rngRun() < 0.5;
        h.gap = m.gap;
        h.y = clamp(near ? p.y + (G.rngRun() - 0.5) * 160 : b.minY + 60 + G.rngRun() * (b.maxY - b.minY - 120),
          b.minY + m.gap / 2 + 10, b.maxY - m.gap / 2 - 10);
        h.delay = m.warn;
        h.speed = m.speed;
        h.dmg = D(m.dmg);
        h.r = 22;
        h.life = (b.maxX - b.minX + 80) / m.speed + m.warn + 0.2;
        sfx(m);
      });
    }
    return times * 1.6;
  },

  /** Thrown wide, then they turn and come home -- the second pass is the one that catches you. */
  boomerang(m) {
    after(m.windup, () => {
      const e = legend.e, a = aimAt(), n = pick(m, 'count');
      for (let i = 0; i < n; i++) {
        const k = n > 1 ? i / (n - 1) - 0.5 : 0;
        const pr = shoot(e.x, e.y, a + k * m.spread, m.speed, m.dmg, m.look, m.status, 0);
        if (!pr) break;
        pr.payload = 3;                    // comes back
        pr.fuse = m.out;                   // after this long
        pr.maxLife = m.out * 2 + 1.5;
      }
      sfx(m);
    });
    return m.out * 2;
  },

  /** Rings of static spreading from points around the target. Be outside one when it opens. */
  waves(m) {
    after(m.windup, () => {
      const t = target(), n = pick(m, 'count');
      for (let i = 0; i < n; i++) {
        const h = hazard(HZ.RING);
        if (!h) break;
        let x = t.x, y = t.y;
        if (i > 0) {
          const a = G.rngRun() * TAU, rr = m.radius * Math.sqrt(G.rngRun());
          x += Math.cos(a) * rr; y += Math.sin(a) * rr;
        }
        const c = clampIn(x, y, 10);
        h.x = c.x; h.y = c.y; h.r1 = m.r1; h.delay = m.delay + i * 0.08; h.dur = m.dur;
        h.life = m.dur; h.dmg = D(m.dmg); h.status = statusIndex(m.status); h.look = lookIndex(m.look);
      }
      sfx(m);
    });
    return m.delay + m.dur;
  },

  /** Boulders fall in a ring round the target and wall it in; then rocks rain inside the ring. */
  tomb(m) {
    after(m.windup, () => {
      const t = target();
      const c = clampIn(t.x, t.y, m.radius + 10);
      const cx = c.x, cy = c.y;
      for (let i = 0; i < m.count; i++) {
        const a = (i / m.count) * TAU;
        strike(cx + Math.cos(a) * m.radius, cy + Math.sin(a) * m.radius, 12, m.fallDelay, m.dmg, m.look, '', true);
      }
      const h = hazard(HZ.TOMB);
      if (h) {
        h.x = cx; h.y = cy; h.r = m.radius; h.delay = m.fallDelay; h.life = m.fallDelay + m.life;
        h.look = lookIndex(m.look); h.dur = m.count;
      }
      const th = m.then;
      after(m.fallDelay + 0.3, () => {
        for (let i = 0; i < th.count; i++) {
          const a = G.rngRun() * TAU, rr = (m.radius - 16) * Math.sqrt(G.rngRun());
          strike(cx + Math.cos(a) * rr, cy + Math.sin(a) * rr, th.r, th.delay + i * 0.15, th.dmg, th.look, '', true);
        }
      });
      sfx(m);
    });
    return m.fallDelay + 0.6;
  },

  /** Blocks of ice slide across the room in lanes. Each lane shows first; the gaps are the way. */
  avalanche(m) {
    after(m.windup, () => {
      const b = G.bounds, t = target(), n = pick(m, 'lanes');
      const fromLeft = G.rngRun() < 0.5;
      const spacing = 58;
      const off = (G.rngRun() - 0.5) * 40;
      for (let i = 0; i < n; i++) {
        const h = hazard(HZ.PILLAR);
        if (!h) break;
        const y = clamp(t.y + off + (i - (n - 1) / 2) * spacing, b.minY + 20, b.maxY - 10);
        h.x = fromLeft ? b.minX - 30 : b.maxX + 30;
        h.y = y;
        h.vx = (fromLeft ? 1 : -1) * m.speed;
        h.dir = 2;                         // dir 2: slides straight, and shows its lane first
        h.delay = m.warn + i * 0.05;
        h.life = h.delay + (b.maxX - b.minX + 60) / m.speed;
        h.r = m.r; h.dmg = D(m.dmg); h.status = statusIndex(m.status); h.look = lookIndex(m.look);
      }
      sfx(m);
    });
    return m.warn + 0.6;
  },

  /** One great slow bubble that bursts into a ring of small ones -- near you, or when it runs out. */
  sphere(m) {
    after(m.windup, () => {
      const e = legend.e;
      const pr = shoot(e.x, e.y, aimAt(), m.speed, m.dmg, m.look, '', 0);
      if (pr) { pr.payload = 2; pr.maxLife = m.life; pr.r = 14; }
      sfx(m);
    });
    return 0.6;
  },
};

function sfx(m) {
  if (!fx.sfx) return;
  const t = legend.def.type;
  fx.sfx(t === 'ice' ? 'move_hail' : t === 'fire' ? 'move_fire' : t === 'electric' ? 'move_thunder'
    : t === 'water' ? 'move_bubble' : 'move_quake');
}

// --- Dash and dive -------------------------------------------------------------------------

function startDash(m, times) {
  const L = legend;
  L.motion = 'dash';
  L.dash = { m, left: times, phase: 'tele', t: 0, tx: 0, ty: 0, a: 0, len: 0, run: 0, drop: 0 };
  lockDash();
}

function lockDash() {
  const d = legend.dash, e = legend.e, t = target();
  d.phase = 'tele';
  d.t = 0;
  d.a = Math.atan2(t.y - e.y, t.x - e.x);
  // Overshoot the target a little: a charge that stops exactly on you never misses by stepping
  // back, and stepping aside is the dodge this is asking for.
  d.len = Math.min(380, Math.hypot(t.x - e.x, t.y - e.y) + 50);
  d.run = 0;
  d.drop = 0;
  legend.dir = dirFromAngle(d.a);
}

function dashStep(dt) {
  const L = legend, d = L.dash, e = L.e, m = d.m;
  d.t += dt;
  if (d.phase === 'tele') {
    e.vx = 0; e.vy = 0;
    if (d.t >= m.telegraph) {
      d.phase = 'go'; d.t = 0;
      e.dmg = D(m.dmg);
      if (fx.sfx) fx.sfx('move_air');
    }
    return;
  }
  if (d.phase === 'go') {
    const v = m.speed;
    e.vx = Math.cos(d.a) * v;
    e.vy = Math.sin(d.a) * v;
    d.run += v * dt;
    // What the charge leaves behind it: burning ground, or lightning that follows it down.
    if (m.trail) {
      d.drop -= dt;
      if (d.drop <= 0) { d.drop = m.trail.every; zone(e.x, e.y, m.trail); }
    }
    if (m.bolts && d.run >= (d.drop + 1) * m.bolts.every) {
      d.drop++;
      const b = m.bolts;
      strike(e.x, e.y, b.r, b.delay, b.dmg, b.look, b.status, false);
    }
    if (m.sparks && fx.burst && (G.tick & 3) === 0) fx.burst(e.x, e.y, 2, m.sparks);
    const b = G.bounds;
    const wall = b && (e.x <= b.minX + e.r + 2 || e.x >= b.maxX - e.r - 2 || e.y <= b.minY + e.r + 2 || e.y >= b.maxY - e.r - 2);
    if (d.run >= d.len || wall) {
      d.phase = 'rest'; d.t = 0;
      e.dmg = D(L.def.dmg);
      e.vx = 0; e.vy = 0;
      if (wall && fx.shake) fx.shake(0.25);
    }
    return;
  }
  e.vx = 0; e.vy = 0;
  if (d.t >= 0.28) {
    d.left--;
    if (d.left > 0) lockDash();
    else { L.dash = null; L.motion = 'hold'; L.busyUntil = Math.max(L.busyUntil, G.clock + 0.2); }
  }
}

function startDive(m, times) {
  const L = legend;
  L.motion = 'dive';
  L.dive = { m, left: times, phase: 'rise', t: 0 };
  L.e.harmless = true;
}

function diveStep(dt, t) {
  const L = legend, v = L.dive, e = L.e, m = v.m;
  v.t += dt;
  if (v.phase === 'rise') {
    e.vx = 0; e.vy = 0;
    L.z = (L.def.hover || 0) + 260 * Math.min(1, v.t / m.rise);
    if (v.t >= m.rise) { v.phase = 'track'; v.t = 0; L.reticle.on = true; }
    return;
  }
  if (v.phase === 'track' || v.phase === 'lock') {
    L.z = 260;
    if (v.phase === 'track') {
      // Out of sight, it follows your position closely -- the shadow is how you know where.
      const k = Math.min(1, dt * 6);
      e.vx = (t.x - e.x) * k / dt;
      e.vy = (t.y - e.y) * k / dt;
      if (v.t >= m.track) { v.phase = 'lock'; v.t = 0; }
    } else {
      e.vx = 0; e.vy = 0;
      if (v.t >= m.lock) { v.phase = 'fall'; v.t = 0; }
    }
    L.reticle.x = e.x; L.reticle.y = e.y;
    return;
  }
  if (v.phase === 'fall') {
    e.vx = 0; e.vy = 0;
    L.z = 260 * Math.max(0, 1 - v.t / 0.16);
    if (v.t >= 0.16) {
      L.z = L.def.hover || 0;
      L.reticle.on = false;
      e.harmless = false;
      strike(e.x, e.y, m.r, 0, m.dmg, m.look, m.status, false);
      const ring = m.ring;
      if (ring) {
        for (let i = 0; i < ring.count; i++) {
          const a = (i / ring.count) * TAU;
          strike(e.x + Math.cos(a) * ring.radius, e.y + Math.sin(a) * ring.radius, ring.r, 0.18, ring.dmg, ring.look, m.status, false);
        }
      }
      if (fx.shake) fx.shake(0.6);
      if (fx.sfx) fx.sfx('move_bigfire');
      v.left--;
      v.phase = 'rest'; v.t = 0;
    }
    return;
  }
  e.vx = 0; e.vy = 0;
  if (v.t >= 0.45) {
    if (v.left > 0) { v.phase = 'rise'; v.t = 0; e.harmless = true; }
    else { L.dive = null; L.motion = 'hold'; L.busyUntil = Math.max(L.busyUntil, G.clock + 0.2); }
  }
}

// --- Traits --------------------------------------------------------------------------------

function trait(dt) {
  const L = legend, tr = L.def.trait, e = L.e;
  if (!tr) return;
  switch (tr.kind) {
    case 'trail': {
      // Flame Body: the ground burns wherever it has flown.
      L.trailT -= dt;
      if (L.trailT <= 0) {
        L.trailT = lastStand() && L.def.last.trailEvery ? L.def.last.trailEvery : rage() ? tr.rageEvery : tr.every;
        zone(e.x, e.y, tr);
      }
      break;
    }
    case 'icefloor': {
      L.trailT -= dt;
      if (L.trailT <= 0 && (e.vx || e.vy)) {
        L.trailT = rage() ? tr.rageEvery : tr.every;
        const life = lastStand() && L.def.last.floorLife ? L.def.last.floorLife : tr.life;
        zone(e.x, e.y + 4, { life, r: tr.r, dps: 0, status: 'chill', look: '' });
      }
      break;
    }
    case 'quake': {
      L.quakeT -= dt;
      if (L.quakeT <= 0 && (e.vx || e.vy)) { L.quakeT = tr.every; if (fx.shake) fx.shake(tr.shake); }
      break;
    }
    case 'blink': {
      // Agility: between moves, it is suddenly somewhere else.
      L.traitT -= dt;
      if (L.traitT <= 0 && L.state === 'idle') {
        L.traitT = rage() ? tr.rageEvery : tr.every;
        const t = target();
        const a = G.rngRun() * TAU;
        if (fx.burst) fx.burst(e.x, e.y, 10, L.def.color);
        const p = clampIn(t.x + Math.cos(a) * tr.dist, t.y + Math.sin(a) * tr.dist, e.r + 20);
        e.x = p.x; e.y = p.y;
        L.orbitA = a;
        if (fx.burst) fx.burst(e.x, e.y, 10, L.def.color);
        if (fx.sfx) fx.sfx('move_electric');
      }
      break;
    }
    case 'guard': {
      // Iron Defense: on a clock, a few seconds of near-total protection, then shrapnel.
      if (L.guardT > 0) {
        L.guardT -= dt;
        if (L.guardT <= 0) {
          e.armor = L.def.armor;
          const b = tr.burst;
          for (let i = 0; i < b.count; i++) shoot(e.x, e.y, (i / b.count) * TAU, b.speed, b.dmg, b.look, '', 0);
          if (fx.sfx) fx.sfx('move_quake');
        }
      } else {
        L.traitT -= dt;
        if (L.traitT <= 0) {
          L.traitT = lastStand() && L.def.last.guardEvery ? L.def.last.guardEvery : rage() ? tr.rageEvery : tr.every;
          L.guardT = tr.dur;
          e.armor = L.def.armor + tr.armor;
          if (fx.banner) fx.banner('IRON DEFENSE', 'ITS GUARD IS UP -- WAIT IT OUT', 1.6);
          if (fx.sfx) fx.sfx('move_shield');
        }
      }
      break;
    }
    case 'barrage':
    case 'volcano':
    case 'rain': {
      // The ground answers the boss: eruptions (Entei), or, once Suicune is pressed, geysers.
      if (tr.kind === 'rain' && !rage()) break;
      L.traitT -= dt;
      if (L.traitT <= 0) {
        L.traitT = rage() && tr.rageEvery ? tr.rageEvery : tr.every;
        const t = target();
        for (let i = 0; i < tr.count; i++) {
          const a = G.rngRun() * TAU, rr = tr.radius * Math.sqrt(G.rngRun());
          const x = i === 0 && tr.kind === 'barrage' ? t.x : t.x + Math.cos(a) * rr;
          const y = i === 0 && tr.kind === 'barrage' ? t.y : t.y + Math.sin(a) * rr;
          strike(x, y, tr.r, tr.delay + i * 0.12, tr.dmg, tr.look, tr.status, !!tr.fall, tr.impact);
        }
      }
      break;
    }
    default: break;
  }
}

// --- The last stand ---------------------------------------------------------------------------

/**
 * Under a fifth of its health, the boss makes its last stand: a shockwave, its signature move at
 * once (and in its rotation from then on), weather that does not lift, a steady barrage, and its
 * traits pushed harder -- each boss's `last` block says which.
 */
function beginLastStand() {
  const L = legend, d = L.def, last = d.last;
  L.phase = 3;
  if (fx.banner) fx.banner(`${d.name.toUpperCase()} MAKES ITS LAST STAND`, last.text, 2.6);
  if (fx.shake) fx.shake(0.8);
  if (fx.sfx) fx.sfx('boss');
  if (fx.burst) fx.burst(L.e.x, L.e.y, 40, d.color);
  strike(L.e.x, L.e.y, 0, 0, 0, 'roar', '', false);
  if (last.weather) { L.weather = last.weather; L.weatherT = 1e9; }
  L.forceMove = last.move;
  L.next = Math.min(L.next, G.clock + 0.6);
  L.lastT = 1.5;
}

/** The weather a boss keeps for good: Suicune's rain once it rages, any last stand's. */
function permaWeather() {
  const L = legend;
  if (!L.def) return false;
  if (lastStand() && L.def.last.weather) return true;
  return rage() && L.def.trait.kind === 'rain';
}

function lastStandTick(dt) {
  const L = legend;
  if (!lastStand()) return;
  const b = L.def.last.barrage;
  if (!b) return;
  L.lastT -= dt;
  if (L.lastT > 0) return;
  L.lastT = b.every;
  const t = target();
  for (let i = 0; i < b.count; i++) {
    const a = G.rngRun() * TAU, rr = b.radius * Math.sqrt(G.rngRun());
    strike(t.x + Math.cos(a) * rr, t.y + Math.sin(a) * rr, b.r, b.delay + i * 0.1, b.dmg, b.look, b.status, !!b.fall, b.impact);
  }
}

// --- The second trait ------------------------------------------------------------------------
//
// One more thing each boss does the whole fight, on top of its first trait: something you have to
// keep in mind rather than dodge once. Regice's cold that builds while you stand near it, Zapdos's
// storm that punishes standing still, Registeel's pull, and so on.

function trait2(dt) {
  const L = legend, tr = L.def.trait2, e = L.e, p = G.player;
  if (!tr || !p) return;
  const lost = Math.max(0, L.lastHp - e.hp);
  L.lastHp = e.hp;
  const d = Math.sqrt(dist2(e.x, e.y, p.x, p.y));

  switch (tr.kind) {
    case 'shed': {
      // Ice Body: every slice of health it loses flies back at you as a shard.
      L.shedAcc += lost;
      const per = tr.every * e.maxHp;
      let n = 0;
      while (L.shedAcc >= per && n < 3) {
        L.shedAcc -= per; n++;
        shoot(e.x, e.y - 10, Math.atan2(p.y - e.y, p.x - e.x) + (G.rngRun() - 0.5) * 0.5, tr.speed, tr.dmg, tr.look, tr.status, 0);
      }
      break;
    }
    case 'heat': {
      // Too close and you burn. Checked on the half second, like the burn itself.
      L.traitT2 -= dt;
      if (L.traitT2 <= 0) {
        L.traitT2 = 0.5;
        if (d < tr.r) statusPlayer(tr.status);
      }
      break;
    }
    case 'still': {
      // Static Storm: a still target is an easy one.
      if (L.stillCd > 0) L.stillCd -= dt;
      if (p.stillTime >= tr.after && L.stillCd <= 0) {
        L.stillCd = tr.after + tr.delay;
        strike(p.x, p.y, tr.r, tr.delay, tr.dmg, tr.look, tr.status, false);
      }
      break;
    }
    case 'stomp': {
      // Seismic Stomp: every few seconds of walking, the ground around it bursts.
      if (e.vx || e.vy) L.stompT += dt;
      if (L.stompT >= tr.every && L.state === 'idle') {
        L.stompT = 0;
        const h = hazard(HZ.RING);
        if (h) {
          h.x = e.x; h.y = e.y; h.r1 = tr.r; h.delay = 0.35; h.dur = tr.dur; h.life = tr.dur;
          h.dmg = D(tr.dmg); h.look = lookIndex(tr.look);
        }
        if (fx.shake) fx.shake(0.3);
      }
      break;
    }
    case 'frostbite': {
      // Regice's cold builds in you while you stay close, drains when you step away, and freezes
      // you solid when it fills.
      const r = tr.r * (lastStand() && L.def.last.frostMul ? L.def.last.frostMul : 1);
      L.frostR = r;
      if (d < r) L.frost += dt;
      else L.frost = Math.max(0, L.frost - dt * 0.8);
      if (L.frost >= tr.build) {
        L.frost = 0;
        statusPlayer('freeze', tr.freeze / STATUS.freeze.secs);
        damagePlayer(D(tr.dmg));
        if (fx.sfx) fx.sfx('move_hail');
      }
      break;
    }
    case 'magnet': {
      // Magnet Pull: a warning, then a steady drag toward it that walking can only slow.
      if (L.magPhase === '') {
        L.magT -= dt;
        if (L.magT <= 0 && L.state !== 'intro') { L.magPhase = 'warn'; L.magTime = tr.warn; }
      } else if (L.magPhase === 'warn') {
        L.magTime -= dt;
        if (L.magTime <= 0) { L.magPhase = 'pull'; L.magTime = tr.dur; if (fx.sfx) fx.sfx('move_shield'); }
      } else {
        L.magTime -= dt;
        if (d > e.r + p.r + 6) {
          p.x += ((e.x - p.x) / d) * tr.pull * dt;
          p.y += ((e.y - p.y) / d) * tr.pull * dt;
          clampToBounds(p, G.bounds, p.r);
        }
        if (L.magTime <= 0) { L.magPhase = ''; L.magT = tr.every; }
      }
      break;
    }
    case 'roar': {
      // Volcanic Roar: a shove if you are close, and the burning ground goes up all at once.
      L.roarT -= dt;
      if (L.roarT <= 0 && L.state === 'idle') {
        L.roarT = tr.every;
        // A roar is a beat of its own: it stands and roars, then carries on.
        L.state = 'busy'; L.motion = 'hold';
        L.busyUntil = G.clock + 0.7;
        L.next = Math.max(L.next, L.busyUntil + 0.3);
        setPose('SpAttack');
        strike(e.x, e.y, 0, 0, 0, 'roar', '', false);
        if (fx.shake) fx.shake(0.5);
        if (fx.sfx) fx.sfx('boss');
        if (d < tr.r && d > 0.01) {
          L.push.t = 0.3;
          L.push.vx = ((p.x - e.x) / d) * tr.push / 0.3;
          L.push.vy = ((p.y - e.y) / d) * tr.push / 0.3;
        }
        let n = 0;
        for (let i = 0; i < hazards.length && n < tr.bursts; i++) {
          const z = hazards[i];
          if (!z.alive || z.kind !== HZ.ZONE || !z.look) continue;
          z.alive = false;
          strike(z.x, z.y, 22, 0.15 + n * 0.05, tr.dmg, 'fire_dome', 'burn', false);
          n++;
        }
      }
      break;
    }
    case 'terrain': {
      // Electric Terrain: patches of floor round you charge, then crackle.
      L.terrT -= dt;
      if (L.terrT <= 0) {
        L.terrT = lastStand() && L.def.last.terrainEvery ? L.def.last.terrainEvery : tr.every;
        const t = target();
        for (let i = 0; i < tr.count; i++) {
          const h = hazard(HZ.TERRAIN);
          if (!h) break;
          let x = t.x, y = t.y;
          if (i > 0) {
            const a = G.rngRun() * TAU, rr = tr.radius * (0.4 + 0.6 * G.rngRun());
            x += Math.cos(a) * rr; y += Math.sin(a) * rr;
          }
          const c = clampIn(x, y, tr.size);
          h.x = c.x; h.y = c.y; h.r = tr.size; h.delay = tr.warn; h.life = tr.life;
          h.dmg = D(tr.dmg); h.status = statusIndex(tr.status); h.tick = 0;
        }
        if (fx.sfx) fx.sfx('move_electric');
      }
      break;
    }
    case 'veil': {
      // Aurora Veil: while it shimmers, what you hit it with comes back at you as bubbles.
      if (L.veilOn > 0) {
        L.veilOn -= dt;
        L.veilAcc += lost;
        const per = tr.per * e.maxHp;
        let n = 0;
        while (L.veilAcc >= per && n < 3) {
          L.veilAcc -= per; n++;
          shoot(e.x, e.y - 8, Math.atan2(p.y - e.y, p.x - e.x) + (G.rngRun() - 0.5) * 0.7, tr.speed, tr.dmg, tr.look, tr.status, 0);
        }
      } else {
        L.veilT -= dt;
        if (L.veilT <= 0) {
          L.veilT = tr.every;
          L.veilOn = tr.dur;
          L.veilAcc = 0;
          if (fx.banner) fx.banner('AURORA VEIL', 'WHAT YOU HIT IT WITH COMES BACK', 1.4);
          if (fx.sfx) fx.sfx('move_shield');
        }
      }
      break;
    }
    default: break;
  }
}

/** The shove from Entei's roar, spread over a few ticks so it reads as a push and not a jump. */
function pushPlayer(dt) {
  const s = legend.push, p = G.player;
  if (s.t <= 0 || !p) return;
  s.t -= dt;
  p.x += s.vx * dt;
  p.y += s.vy * dt;
  clampToBounds(p, G.bounds, p.r);
}

/** Raikou's Static: touching it paralyses. Called by player.js when the boss's contact lands. */
export function legendTouched(e) {
  const L = legend;
  if (!L.active || e !== L.e) return;
  if (L.def.trait.kind === 'static') statusPlayer(L.def.trait.status);
}

// --- Spawning things -----------------------------------------------------------------------

const HOSTILE_R = 5;

/** A boss shot. Returns the projectile so a move can take it over (orbit, homing). */
function shoot(x, y, angle, speed, dmg, look, status, bounce) {
  const pr = spawn('projectiles');
  if (!pr) return null;
  pr.x = x; pr.y = y;
  pr.vx = Math.cos(angle) * speed; pr.vy = Math.sin(angle) * speed;
  pr.r = HOSTILE_R; pr.dmg = D(dmg); pr.hostile = true;
  pr.pierce = 0; pr.life = 0; pr.maxLife = 4.2;
  pr.motion = 0; pr.angle = angle; pr.hitId = nextHitId();
  pr.sprBase = -1; pr.knockback = 0; pr.crit = false; pr.targetIdx = -1; pr.area = 1;
  pr.z = 0; pr.r0 = pr.r; pr.bounces = bounce || 0; pr.fuse = 0; pr.gen = 0; pr.payload = 0;
  pr.burn = 0; pr.burnT = 0; pr.slow = 0;
  pr.trail = 0; pr.spin = 0; pr.pulse = 0; pr.impact = 0;
  pr.returning = false; pr.orbitA = 0; pr.orbitR = 0; pr.amp = 0; pr.freq = 0;
  pr.emitT = 0; pr.homingTurn = 0; pr.t = 0; pr.ox = 0; pr.oy = 0;
  pr.weapon = -1;
  pr.freq = 0;
  pr.look = lookIndex(look);
  pr.status = statusIndex(status);
  return pr;
}

function hazard(kind) {
  for (let i = 0; i < hazards.length; i++) {
    const h = hazards[i];
    if (h.alive) continue;
    h.alive = true; h.kind = kind;
    h.x = 0; h.y = 0; h.r = 10; h.delay = 0; h.t = 0; h.life = 1; h.dmg = 0; h.status = 0;
    h.look = 0; h.look2 = 0; h.fall = false; h.hit = false; h.vx = 0; h.vy = 0; h.speed = 0;
    h.cx = 0; h.cy = 0; h.ang = 0; h.r0 = 0; h.r1 = 0; h.dur = 0; h.hitCd = 0; h.zapT = 0;
    h.x0 = 0; h.y0 = 0; h.gap = 0; h.dir = 0; h.tick = 0; h.color = ''; h.zap = null;
    return h;
  }
  return null;
}

/**
 * A telegraphed strike: its circle shows for `delay`, then it lands once, where it showed. A
 * falling one draws `look` on its way down and `impact` (if given) where it lands.
 */
function strike(x, y, r, delay, dmg, look, status, fall, impact) {
  const h = hazard(HZ.STRIKE);
  if (!h) return null;
  const p = clampIn(x, y, 8);
  h.x = p.x; h.y = p.y; h.r = r; h.delay = Math.max(0, delay); h.dmg = D(dmg);
  h.look2 = lookIndex(impact || '');
  h.dur = h.delay;                       // the warning's full length, for the renderer
  h.look = lookIndex(look); h.status = statusIndex(status); h.fall = !!fall;
  h.life = impactTime(h.look2 || h.look);
  return h;
}

/** A patch of hostile ground: burning, or frozen over. */
function zone(x, y, o) {
  const h = hazard(HZ.ZONE);
  if (!h) return null;
  h.x = x; h.y = y; h.r = o.r; h.life = o.life; h.dmg = D((o.dps || 0) * 0.5);
  h.status = statusIndex(o.status); h.look = lookIndex(o.look || '');
  return h;
}

function beam() {
  for (const b of beams) if (!b.alive) { b.alive = true; return b; }
  return null;
}

// How long a strike's landing animation plays -- long enough to read, short enough not to linger.
function impactTime(look) {
  const key = LOOK_NAMES[look];
  if (key === 'bolt') return 0.36;
  if (key === 'fire_dome') return 0.42;
  if (key === 'ice_pillar' || key === 'spire' || key === 'geyser' || key === 'flame') return 0.5;
  if (key === 'ice_block') return 0.9;
  if (key === 'outrage') return 0.7;
  if (key === 'roar') return 0.5;
  return 0.3;
}
const LOOK_NAMES = ['', ...Object.keys(LOOKS)];

const _c = { x: 0, y: 0 };
function clampIn(x, y, pad) {
  const b = G.bounds;
  _c.x = b ? clamp(x, b.minX + pad, b.maxX - pad) : x;
  _c.y = b ? clamp(y, b.minY + pad, b.maxY - pad) : y;
  return _c;
}

// --- Hazards, beams, shots -----------------------------------------------------------------

/** Damage the player (and any Substitute doll) inside a circle. */
function hurtCircle(x, y, r, dmg, status) {
  const p = G.player;
  if (p) {
    const rr = r + p.r;
    if (dist2(x, y, p.x, p.y) <= rr * rr && damagePlayer(dmg) && status) statusPlayer(status);
  }
  for (let i = 0; i < decoys.length; i++) {
    const d = decoys[i];
    if (!decoyTargetable(d)) continue;
    const rr = r + 7;
    if (dist2(x, y, d.x, d.y) <= rr * rr) damageDecoy(d, dmg);
  }
}

function updateHazards(dt) {
  const p = G.player;
  for (let i = 0; i < hazards.length; i++) {
    const h = hazards[i];
    if (!h.alive) continue;

    if (h.kind === HZ.STRIKE) {
      if (h.delay > 0) { h.delay -= dt; continue; }
      if (!h.hit) {
        h.hit = true;
        if (h.dmg > 0) hurtCircle(h.x, h.y, h.r, h.dmg, h.status);
        if (h.fall && fx.burst) fx.burst(h.x, h.y, 6, '#e8e8f0');
      }
      h.t += dt;
      if (h.t >= h.life) h.alive = false;
      continue;
    }

    h.t += dt;
    if (h.t >= h.life) { h.alive = false; h.zap = null; continue; }
    if (h.hitCd > 0 && h.kind !== HZ.TOMB) h.hitCd -= dt;

    if (h.kind === HZ.PILLAR) {
      if (h.dur > 0) {
        // Closing ring: slides from its outer radius to its inner one, turning slowly.
        const k = Math.min(1, h.t / h.dur);
        const r = h.r0 + (h.r1 - h.r0) * k;
        h.ang += h.speed * dt;
        h.x = h.cx + Math.cos(h.ang) * r;
        h.y = h.cy + Math.sin(h.ang) * r;
      } else if (h.dir === 2) {
        // Avalanche: waits out its warning on the edge, then slides straight across.
        if (h.delay <= 0) h.x += h.vx * dt;
      } else if (h.dir === 1 && p) {
        // Hunting: drifts after the player, slower than they can run.
        const dx = p.x - h.x, dy = p.y - h.y, d = Math.hypot(dx, dy) || 1;
        h.vx += ((dx / d) * h.speed - h.vx) * Math.min(1, dt * 1.5);
        h.vy += ((dy / d) * h.speed - h.vy) * Math.min(1, dt * 1.5);
        h.x += h.vx * dt; h.y += h.vy * dt;
      }
      if (h.delay > 0) { h.delay -= dt; continue; }
      if (h.hitCd <= 0) {
        const before = p ? p.hp : 0;
        hurtCircle(h.x, h.y, h.r, h.dmg, h.status);
        if (p && p.hp < before) h.hitCd = 0.5;
      }
      continue;
    }

    if (h.kind === HZ.ZONE) {
      h.tick -= dt;
      if (h.tick <= 0) {
        h.tick = 0.5;
        if (p) {
          const rr = h.r + p.r * 0.5;
          if (dist2(h.x, h.y, p.x, p.y) <= rr * rr) {
            if (h.dmg > 0) { if (damagePlayer(h.dmg) && h.status) statusPlayer(h.status); }
            else if (h.status) statusPlayer(h.status);
          }
        }
      }
      continue;
    }

    if (h.kind === HZ.ORB) {
      const m = h.zap;
      h.zapT -= dt;
      if (m && h.zapT <= 0 && p) {
        h.zapT = m.zapEvery;
        if (dist2(h.x, h.y, p.x, p.y) <= m.zapRange * m.zapRange) {
          strike(p.x, p.y, m.r, m.zapDelay, m.dmg, m.bolt, m.status, false);
          if (fx.sfx) fx.sfx('move_electric');
        }
      }
      continue;
    }

    if (h.kind === HZ.RING) {
      if (h.delay > 0) { h.delay -= dt; h.t = 0; continue; }
      // The ring's edge sweeps outward; it catches whatever it passes over, once.
      const r = h.r1 * Math.min(1, h.t / h.dur);
      if (!h.hit && p) {
        const d = Math.sqrt(dist2(h.x, h.y, p.x, p.y));
        if (d <= r + p.r && d >= r - 10 - p.r) {
          if (damagePlayer(h.dmg) && h.status) statusPlayer(h.status);
          h.hit = true;
        }
      }
      continue;
    }

    if (h.kind === HZ.TOMB) {
      if (h.delay > 0) { h.delay -= dt; h.t = 0; continue; }
      // The wall: whoever was inside when it closed stays inside until it crumbles.
      if (p) {
        const dx = p.x - h.x, dy = p.y - h.y, d = Math.hypot(dx, dy);
        if (h.hitCd === 0) h.hitCd = d < h.r ? 1 : -1;     // remembers which side you were on
        const wall = h.r - 10;
        if (h.hitCd > 0 && d > wall) { p.x = h.x + (dx / d) * wall; p.y = h.y + (dy / d) * wall; }
        if (h.hitCd < 0 && d < h.r + 10 && d > 0.01) { p.x = h.x + (dx / d) * (h.r + 10); p.y = h.y + (dy / d) * (h.r + 10); }
      }
      continue;
    }

    if (h.kind === HZ.TERRAIN) {
      if (h.delay > 0) { h.delay -= dt; h.t = 0; continue; }
      h.tick -= dt;
      if (h.tick <= 0 && p) {
        h.tick = 0.5;
        const half = h.r / 2;
        if (Math.abs(p.x - h.x) < half && Math.abs(p.y - h.y) < half) {
          if (damagePlayer(h.dmg) && h.status) statusPlayer(h.status);
        }
      }
      continue;
    }

    if (h.kind === HZ.WAVE) {
      if (h.delay > 0) { h.delay -= dt; h.t = 0; continue; }
      h.x += h.dir * h.speed * dt;
      if (p && Math.abs(p.x - h.x) < h.r + p.r && Math.abs(p.y - h.y) > h.gap / 2 && h.hitCd <= 0) {
        if (damagePlayer(h.dmg)) { h.hitCd = 0.6; statusPlayer('chill'); }
      }
      for (let k = 0; k < decoys.length; k++) {
        const d = decoys[k];
        if (decoyTargetable(d) && Math.abs(d.x - h.x) < h.r && Math.abs(d.y - h.y) > h.gap / 2) damageDecoy(d, h.dmg);
      }
      continue;
    }
    // LOB is visual only; its landing is a strike scheduled alongside it.
  }
}

function updateBeams(dt) {
  const L = legend, e = L.e, p = G.player;
  for (let i = 0; i < beams.length; i++) {
    const b = beams[i];
    if (!b.alive) continue;
    b.t += dt;
    if (!e || !e.alive) { b.alive = false; continue; }
    if (b.t < b.telegraph) continue;
    const live = b.t - b.telegraph;
    if (live > b.dur) { b.alive = false; continue; }
    if (b.sweep) b.angle += (b.sweep / b.dur) * dt;
    if (b.spin) b.angle += b.spin * dt;
    if (!p) continue;
    if (b.tick > 0) {
      b.tickT -= dt;
      if (b.tickT > 0) continue;
      b.tickT = b.tick;
    } else if (b.hit) continue;
    // Distance from the player to the beam's segment.
    const ox = e.x, oy = e.y - L.z * 0.5;
    const dx = Math.cos(b.angle), dy = Math.sin(b.angle);
    const px = p.x - ox, py = p.y - oy;
    const along = px * dx + py * dy;
    if (along < 0 || along > b.len) continue;
    const off = Math.abs(px * dy - py * dx);
    if (off <= b.width / 2 + p.r) {
      if (damagePlayer(b.dmg) && b.status) statusPlayer(b.status);
      b.hit = true;
    }
  }
}

/** Steering for the shots that do more than fly straight. Runs before updateProjectiles. */
function updateShots(dt) {
  const L = legend, e = L.e, p = G.player, bnd = G.bounds;
  for (let i = 0; i < projectiles.length; i++) {
    const pr = projectiles[i];
    if (!pr.hostile || !pr.look) continue;
    if (pr.orbitR > 0 && e) {
      pr.orbitA += 3.4 * dt;
      pr.x = e.x + Math.cos(pr.orbitA) * pr.orbitR;
      pr.y = e.y - 6 + Math.sin(pr.orbitA) * pr.orbitR;
      pr.vx = 0; pr.vy = 0;
      continue;
    }
    if (pr.homingTurn > 0 && p) {
      const want = Math.atan2(p.y - pr.y, p.x - pr.x);
      const cur = Math.atan2(pr.vy, pr.vx);
      let d = want - cur;
      while (d > Math.PI) d -= TAU;
      while (d < -Math.PI) d += TAU;
      const a = cur + clamp(d, -pr.homingTurn * dt, pr.homingTurn * dt);
      const sp = Math.hypot(pr.vx, pr.vy);
      pr.vx = Math.cos(a) * sp; pr.vy = Math.sin(a) * sp;
      pr.angle = a;
      // A magnet bomb that runs out bursts where it is, rather than fizzling.
      if (pr.payload === 1 && pr.life + dt >= pr.maxLife) {
        pr.payload = 0;
        const m = L.def && L.def.moves.find((mv) => mv.kind === 'homing');
        if (m) strike(pr.x, pr.y, m.blast.r, 0.25, m.blast.dmg, m.blast.look, '', false);
      }
    }
    if (pr.freq) {
      // A curving blade: its heading turns at a steady rate.
      const c = Math.cos(pr.freq * dt), s = Math.sin(pr.freq * dt);
      const vx = pr.vx * c - pr.vy * s;
      pr.vy = pr.vx * s + pr.vy * c;
      pr.vx = vx;
      pr.angle = Math.atan2(pr.vy, pr.vx);
    }
    if (pr.payload === 3 && e) {
      // A boomerang: out for its fuse, then home to the boss, and gone when it gets there.
      pr.t += dt;
      if (pr.t >= pr.fuse) {
        const dx = e.x - pr.x, dy = e.y - pr.y, d = Math.hypot(dx, dy) || 1;
        const sp = Math.hypot(pr.vx, pr.vy) || 150;
        pr.vx = (dx / d) * sp; pr.vy = (dy / d) * sp;
        if (d < 14) pr.life = pr.maxLife;
      }
    }
    if (pr.payload === 2) {
      // Hydro Sphere: bursts when it reaches you, or when it runs out.
      const near = p && dist2(pr.x, pr.y, p.x, p.y) < 40 * 40;
      if (near || pr.life + dt >= pr.maxLife) {
        pr.payload = 0;
        pr.life = pr.maxLife;
        const m = L.def && L.def.moves.find((mv) => mv.kind === 'sphere');
        if (m) {
          const b = m.burst, n = pick(b, 'count');
          for (let k = 0; k < n; k++) shoot(pr.x, pr.y, (k / n) * TAU, b.speed, b.dmg, b.look, b.status, 0);
          if (fx.sfx) fx.sfx('move_bubble');
        }
        continue;
      }
    }
    if (pr.bounces > 0 && bnd) {
      if ((pr.x < bnd.minX && pr.vx < 0) || (pr.x > bnd.maxX && pr.vx > 0)) { pr.vx = -pr.vx; pr.bounces--; }
      if ((pr.y < bnd.minY && pr.vy < 0) || (pr.y > bnd.maxY && pr.vy > 0)) { pr.vy = -pr.vy; pr.bounces--; }
      pr.angle = Math.atan2(pr.vy, pr.vx);
    }
  }
}
