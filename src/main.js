// L5 -- the composition root. The ONLY sequencer: no system calls another system's update().
// Cross-system effects travel through world.js queues and combat.js hooks, drained here in a
// fixed order, which is what keeps the module graph acyclic without a build step to enforce it.

import { G, MODES, SIM_MODES, setMode, resetRunState } from './state.js';
import { mulberry32, formatTime } from './util.js';
import { initInput, endFrame, onKey } from './input.js';
import {
  initRender, ctx, present, drawBackground, drawDebugOverlay,
  updateCamera, snapCamera, toScreenX, toScreenY, addShake, scale, VW, VH,
} from './render.js';
import {
  registerSprite, buildAtlas, spriteBase, spriteDirs, angleSlot,
  drawSprite, drawShadow, drawText, drawTextCentered,
} from './sprites.js';
import {
  enemies, projectiles, orbs, coins, damageNumbers, particles,
  spawn, despawn, clearWorld, rebuildGrid, sweepDead, entityCounts, spawnRequests, fxShapes,
} from './world.js';
import { initStats, ensureStats, addGrant } from './stats.js';
import { hooks, damageEnemy, killAll } from './combat.js';
import { createPlayer, updatePlayer } from './player.js';
import { initEnemyDefs, updateEnemies, spawnEnemy } from './enemies.js';
import { ENEMIES } from './data/enemies.js';
import { ENEMY_BY_ID } from './data/enemies.js';
import {
  initWeaponDefs, addWeapon, updateWeapons, updateProjectiles, motionIndex, setWeaponFx,
  evolveWeapon, setWeaponSfx,
} from './weapons.js';
import {
  initAbilityDefs, addAbility, fireAbility, updateAbilities, updateZones, fx as abilityFx,
} from './abilities.js';
import { abilitySpritePairs } from './data/abilities.js';
import {
  initPickupSprites, initItemSprites, dropXp, dropCoin, updatePickups,
  updateItems, dropPickup, dropRandomPickup, magnetAll, itemEffects, itemSpritePairs,
} from './pickups.js';
import {
  grantXp, grantCoins, initForm, xpToNext, rollOffers, takeOffer,
  rerollOffers, banishOffer, skipOffer, resetPicks, pendingEvolution, applyEvolution,
} from './progress.js';
import { updateDirector, resetDirector, catchUpSchedule, stressSpawn } from './director.js';
import { updateProps, resetProps } from './props.js';
import { drawEntities } from './entities.js';
import { drawHud, debugLines } from './hud.js';
import {
  ui, drawLevelUp, drawPause, drawTitle, drawSelect, drawEvolution, drawEvolutionChoice,
  EVO_TOTAL, setBallSprite,
} from './ui.js';
import { CHARACTERS, CHARACTER_BY_ID, characterSpritePairs } from './data/characters.js';
import { enemySpritePairs } from './data/enemies.js';
import { weaponSpritePairs } from './data/weapons.js';
import { STAGE_BY_ID, STAGES, propSpritePairs } from './data/stages.js';
import { loadAssets } from './assets.js';
import {
  initAudio, audioReady, sfx, playTrack, playOnce, setIntensity, stopTrack,
  setVolume, toggleMute, settings as audioSettings, TITLE, ROUTE, BOSS, FANFARE,
} from './audio.js';

const STEP = 1 / 60;
const MAX_STEPS = 5;

let accumulator = 0;
let lastTime = 0;
let fps = 60, frameMs = 0, simMs = 0, drawMs = 0;
let atlasView = false;
let atlasStats = null;
let bootParams = null;
let menuTime = 0;
let assetStats = { loaded: 0, failed: 0 };

// Separation drops to 30Hz under load -- the first lever in the degradation policy.
let sepTick = 0;
let heavyLoad = false;

export function resetAccumulator() {
  accumulator = 0;
  lastTime = performance.now();
}

// --- Boot -------------------------------------------------------------------

function parseParams() {
  const q = new URLSearchParams(location.search);
  G.debug.on = q.has('debug');
  G.seed = q.has('seed') ? (parseInt(q.get('seed'), 10) | 0) : (Math.random() * 0xffffffff) | 0;
  G.rngRun = mulberry32(G.seed);
  G.rngFx = mulberry32(G.seed ^ 0x9e3779b9);
  return q;
}

async function boot() {
  const q = parseParams();
  atlasView = q.has('atlas');

  initInput();
  initRender();

  // Supplied images must finish decoding before the atlas is rasterised. This never throws:
  // a missing manifest is the normal case and every sprite falls back to its drawn version.
  assetStats = await loadAssets();

  // Register every sprite pair the data asks for, then compile the atlas once.
  for (const [shape, pal] of characterSpritePairs()) registerSprite(shape, pal);
  for (const [shape, pal] of enemySpritePairs()) registerSprite(shape, pal);
  for (const [shape, pal, rot] of weaponSpritePairs()) registerSprite(shape, pal, rot || 0);
  for (const [shape, pal] of abilitySpritePairs()) registerSprite(shape, pal);
  for (const [shape, pal] of propSpritePairs()) registerSprite(shape, pal);
  for (const [shape, pal] of itemSpritePairs()) registerSprite(shape, pal);
  for (const pal of ['xp_small', 'xp_mid', 'xp_big', 'xp_huge']) registerSprite('orb', pal);
  registerSprite('coin', 'gold');
  registerSprite('pokeball', 'crab');
  atlasStats = buildAtlas();

  initEnemyDefs();
  initWeaponDefs();
  initAbilityDefs(motionIndex('homing'));
  initPickupSprites();
  initItemSprites();
  installHooks();

  // Each starter needs a sprite id for the menus to draw it.
  for (const c of CHARACTERS) c.sprId = spriteBase(c.shape, c.palette);
  setBallSprite(spriteBase('pokeball', 'crab'));

  bootParams = q;
  if (q.has('char') && CHARACTER_BY_ID[q.get('char')]) {
    startRun(CHARACTER_BY_ID[q.get('char')], q);
  } else {
    setMode(MODES.TITLE);
  }

  onKey(handleKey);

  // Debug-only handle so an automated harness can drive the stress test and read exact frame
  // timings, rather than inferring them from a screenshot of the overlay.
  if (G.debug.on) {
    window.__dbg = {
      G,
      stress: (n) => stressSpawn(n),
      grantAbility: (id) => addAbility(id),
      grantWeapon: (id) => addWeapon(id),
      drop: (kind) => dropPickup(G.player.x + 14, G.player.y, kind),
      props: () => enemies.filter((e) => e.alive && e.prop).length,
      // Spawn a ring of enemies at an exact radius -- the stress spawner uses the 350-430 spawn
      // ring, which sits outside most ability radii and makes them look broken when they are not.
      spawnNear: function (n, r, id) {
        const p = G.player, def = ENEMY_BY_ID[arguments[2] || 'rattail'];
        for (let i = 0; i < n; i++) {
          const a = (i / n) * Math.PI * 2;
          spawnEnemy(def, p.x + Math.cos(a) * r, p.y + Math.sin(a) * r);
        }
      },
      fire: (slot) => fireAbility(slot),
      menuTime: () => menuTime,
      orbs: () => orbs.map((o) => ({ v: o.value, tier: o.tier })),
      perf: () => ({
        fps: +fps.toFixed(1), frameMs: +frameMs.toFixed(3),
        simMs: +simMs.toFixed(3), drawMs: +drawMs.toFixed(3),
        ...entityCounts(), kills: G.kills, level: G.level, t: +G.runTime.toFixed(1),
      }),
    };
  }

  lastTime = performance.now();
  requestAnimationFrame(frame);
  // Boot is async, so the page load event fires before the game is ready. Anything driving the
  // game from outside (the screenshot harness) must wait for this rather than the load event.
  window.__booted = true;
}

/**
 * combat.js fires these instead of importing pickups/render itself. This is the seam that lets
 * damage live below the L3 systems while still producing orbs, numbers and screen shake.
 */
function installHooks() {
  hooks.onDamage = (e, dealt, crit) => {
    popDamage(e.x, e.y - 12, dealt, crit);
    sfx(crit ? 'crit' : 'hit');
  };
  hooks.onKill = (e) => {
    if (e.prop) {
      // Scenery is not a kill: no XP, no tally. It pays in gold and the occasional pickup.
      if (G.rngRun() < e.coinChance) dropCoin(e.x, e.y, 1 + ((G.rngRun() * 4) | 0));
      const pdef = e.def;
      if (G.rngRun() < (pdef.pickupChance || 0.12)) dropRandomPickup(e.x, e.y);
      burst(e.x, e.y, 8, '#c8c0ad');
      return;
    }
    G.kills++;
    dropXp(e.x, e.y, e.xp);
    if (e.coinChance > 0 && G.rngRun() < e.coinChance) {
      dropCoin(e.x, e.y, G.rngRun() < 0.15 ? 5 : 1);
    }
    // Elites and bosses always leave something worth walking to.
    if (e.elite) dropPickup(e.x, e.y, 'chest');
    burst(e.x, e.y, e.elite ? 10 : 5, e.elite ? '#ffd166' : '#ffffff');
    sfx('kill');
  };
  hooks.onPlayerHit = () => {
    addShake(0.28);
    G.hitstop = 0.04;
    sfx('hurt');
  };

  // abilities.js emits its FX through these rather than importing render/world upward.
  abilityFx.burst = burst;
  abilityFx.shake = addShake;
  abilityFx.ring = (x, y, r, color, life) => pushFx(0, x, y, r, 0, color, life);
  abilityFx.beam = (x, y, angle, len, width, color, life) => pushFx(1, x, y, len, angle, color, life, width);
  // Each weapon family gets its own shot sound, picked from the projectile's palette.
  const SHOT_SFX = {
    water: 'shoot_water', normal: 'shoot_normal', grass: 'shoot_grass',
    rock: 'shoot_rock', electric: 'shoot_bolt', poison: 'shoot_water',
    psychic: 'shoot_normal', ghostly: 'shoot_grass',
  };
  setWeaponSfx((def) => sfx(SHOT_SFX[def.palette] || 'shoot_normal'));

  // Chain arcs, projectile trails and impact bursts.
  setWeaponFx(
    (x0, y0, x1, y1, color) =>
      pushFx(1, x0, y0, Math.hypot(x1 - x0, y1 - y0), Math.atan2(y1 - y0, x1 - x0), color, 0.16, 2),
    (pr, dt) => {
      // Rate-limited so a dense volley cannot flood the particle pool.
      if (G.rngFx() > pr.trail * dt) return;
      const p2 = spawn('particles');
      if (!p2) return;
      p2.x = pr.x; p2.y = pr.y;
      p2.vx = -pr.vx * 0.08; p2.vy = -pr.vy * 0.08;
      p2.maxLife = p2.life = 0.22;
      p2.size = 1;
      p2.color = pr.trailColor;
      p2.grav = 0;
    },
    (x, y, n, color) => burst(x, y, Math.min(6, n), color),
  );

  abilityFx.heal = (amount) => {
    const p = G.player;
    if (p) p.hp = Math.min(G.stats.maxHp, p.hp + amount);
  };

  // --- Item pickups ---
  itemEffects.magnet = () => magnetAll();
  itemEffects.berry = () => {
    const p = G.player;
    if (p) p.hp = Math.min(G.stats.maxHp, p.hp + Math.round(G.stats.maxHp * 0.3));
  };
  itemEffects.bomb = () => {
    killAll(0);
    addShake(0.9);
    G.hitstop = 0.08;
  };
  itemEffects.chest = () => {
    // A chest is the weapon-evolution trigger, and pays out gold either way.
    const evolved = tryEvolveWeapon();
    grantCoins(20 + ((G.rngRun() * 20) | 0));
    if (!evolved) G.pendingLevelUps++;
  };
  itemEffects.onCollect = (kind, label) => {
    sfx('pickup');
    G.banner.text = label;
    G.banner.sub = '';
    G.banner.t = 1.6;
  };
}

/**
 * Chest payoff: a weapon at max level whose paired passive you hold evolves in place.
 * The data for this has existed since the weapons were written; only the step was missing.
 */
function tryEvolveWeapon() {
  for (const w of G.weapons) {
    const ev = w.def.evolution;
    if (!ev || w.evolved) continue;
    if (w.level < w.def.levels.length) continue;
    if (!G.passives.includes(ev.needPassive)) continue;
    if (evolveWeapon(w)) {
      G.banner.text = `${w.def.name.toUpperCase()} EVOLVED!`;
      G.banner.sub = '';
      G.banner.t = 2.6;
      addShake(0.5);
      return true;
    }
  }
  return false;
}

function startRun(character, q) {
  clearWorld();
  resetRunState();
  resetDirector();
  resetProps();

  const stageId = (q && q.get('stage')) || 'grass';
  G.stage = STAGE_BY_ID[stageId] || STAGES[0];

  initStats();
  resetPicks();
  initForm(character);
  ensureStats();

  G.player = createPlayer(0, 0);
  G.player.sprBase = spriteBase(character.shape, character.palette);
  G.player.hp = G.player.maxHp = G.stats.maxHp;
  G.xpNext = xpToNext(1);

  addWeapon(character.weapon);

  // Placeholder until the meta shop lands in phase 6 and sets these from its Reroll/Banish/Skip
  // ranks. One of each keeps the level-up screen's full feature set exercised in the meantime.
  G.rerolls = 1;
  G.banishes = 1;
  G.skips = 1;

  // Dev shortcuts: ?t=900 starts 15 minutes in, ?level=25 starts levelled.
  if (q && q.has('t')) {
    G.runTime = Math.max(0, parseFloat(q.get('t')) || 0);
    catchUpSchedule();
  }
  if (q && q.has('level')) {
    const want = Math.max(1, parseInt(q.get('level'), 10) || 1);
    while (G.level < want) { G.level++; G.xpNext = xpToNext(G.level); G.pendingLevelUps++; }
  }

  snapCamera(0, 0);
  setMode(MODES.PLAYING);
  resetAccumulator();
  if (audioReady()) { setIntensity(0); playTrack(ROUTE); }
}

// --- Input ------------------------------------------------------------------

function handleKey(code) {
  // The AudioContext cannot start without a user gesture. The title screen already waits for a
  // keypress, so that is the natural unlock point.
  if (!audioReady()) {
    initAudio();
    if (G.mode === MODES.TITLE) playTrack(TITLE);
  }
  if (code === 'KeyM') { toggleMute(); return; }
  if (code === 'KeyF') return toggleFullscreen();

  if (G.mode === MODES.TITLE) {
    ui.cursor = 0;
    setMode(MODES.SELECT);
    return;
  }
  if (G.mode === MODES.SELECT) return selectKey(code);

  // The level-up modal owns the keyboard while it is open, so R means "reroll" there and
  // "restart" everywhere else.
  if (G.mode === MODES.LEVELUP) return levelUpKey(code);
  if (G.mode === MODES.EVOLVE_CHOICE) return evolveChoiceKey(code);
  if (G.mode === MODES.EVOLVING) return;        // the cutscene owns the screen

  if (code === 'KeyR') return startRun(G.character, bootParams);
  // Q and E are the ability keys during play, so "back to partner select" only applies when the
  // run is already stopped.
  if (code === 'KeyQ' && (G.runOver || G.mode === MODES.PAUSED)) return toSelect();
  if (G.runOver) return;
  if (code === 'Escape' || code === 'KeyP') return togglePause();

  if (G.mode === MODES.PLAYING) {
    if (code === 'KeyQ') return void castAbility(0);
    if (code === 'KeyE') return void castAbility(1);
  }

  if (!G.debug.on) return;
  switch (code) {
    case 'KeyH': G.debug.showHitboxes = !G.debug.showHitboxes; break;
    case 'KeyG': G.debug.godmode = !G.debug.godmode; break;
    case 'KeyK': stressSpawn(100); break;
    case 'KeyL': G.level++; G.xpNext = xpToNext(G.level); G.pendingLevelUps++; break;
    case 'KeyT': G.runTime += 60; catchUpSchedule(); break;
    case 'BracketRight': G.debug.timescale = Math.min(8, G.debug.timescale * 2); break;
    case 'BracketLeft': G.debug.timescale = Math.max(0.25, G.debug.timescale / 2); break;
  }
}

function toSelect() {
  ui.cursor = Math.max(0, CHARACTERS.indexOf(G.character));
  setMode(MODES.SELECT);
  sfx('select');
  if (audioReady()) playTrack(TITLE);
}

function selectKey(code) {
  const n = CHARACTERS.length;
  switch (code) {
    case 'ArrowLeft': case 'KeyA': ui.cursor = (ui.cursor + n - 1) % n; break;
    case 'ArrowRight': case 'KeyD': ui.cursor = (ui.cursor + 1) % n; break;
    case 'Digit1': case 'Digit2': case 'Digit3': {
      const i = Number(code.slice(5)) - 1;
      if (i < n) startRun(CHARACTERS[i], bootParams);
      break;
    }
    case 'Enter': case 'Space': startRun(CHARACTERS[ui.cursor], bootParams); break;
    case 'Escape': setMode(MODES.TITLE); break;
  }
}

function evolveChoiceKey(code) {
  const n = evo.branches.length;
  switch (code) {
    case 'ArrowLeft': case 'KeyA': ui.cursor = (ui.cursor + n - 1) % n; break;
    case 'ArrowRight': case 'KeyD': ui.cursor = (ui.cursor + 1) % n; break;
    case 'Digit1': case 'Digit2': case 'Digit3': {
      const i = Number(code.slice(5)) - 1;
      if (i < n) beginCutscene(evo.ev, evo.ev.branch[i]);
      break;
    }
    case 'Enter': case 'Space': beginCutscene(evo.ev, evo.ev.branch[ui.cursor]); break;
  }
}

function levelUpKey(code) {
  const n = G.offers.length;
  if (!n) return;
  switch (code) {
    case 'ArrowLeft': case 'KeyA': ui.cursor = (ui.cursor + n - 1) % n; ui.banishArm = false; break;
    case 'ArrowRight': case 'KeyD': ui.cursor = (ui.cursor + 1) % n; ui.banishArm = false; break;
    case 'Digit1': case 'Digit2': case 'Digit3': {
      const i = Number(code.slice(5)) - 1;
      if (i < n) { takeOffer(G.offers[i]); closeLevelUp(); }
      break;
    }
    case 'Enter': case 'Space':
      takeOffer(G.offers[ui.cursor]);
      closeLevelUp();
      break;
    case 'KeyR': if (rerollOffers()) ui.banishArm = false; break;
    case 'KeyB':
      // Banishing is permanent for the run, so it takes two presses to confirm.
      if (!ui.banishArm) ui.banishArm = true;
      else { banishOffer(G.offers[ui.cursor]); ui.banishArm = false; }
      break;
    case 'KeyS': if (skipOffer()) closeLevelUp(); break;
  }
}

/** Fire an ability and play the sound that matches its effect. */
function castAbility(slot) {
  const a = G.abilities[slot];
  if (!fireAbility(slot)) return false;
  const byEffect = {
    shield: 'shield', shockwaveRings: 'quake', drainRings: 'quake',
    beam: 'beam', jet: 'beam', chain: 'shoot_bolt',
  };
  sfx(byEffect[a.def.effect] || 'ability');
  return true;
}

function togglePause() {
  if (G.mode === MODES.PLAYING) setMode(MODES.PAUSED);
  else if (G.mode === MODES.PAUSED) { setMode(MODES.PLAYING); resetAccumulator(); }
}

function toggleFullscreen() {
  if (document.fullscreenElement) document.exitFullscreen?.();
  else document.documentElement.requestFullscreen?.().catch(() => {});
}

// --- The loop ---------------------------------------------------------------

function frame(now) {
  requestAnimationFrame(frame);

  const t0 = performance.now();
  const rawDt = Math.min(0.25, (now - lastTime) / 1000);
  lastTime = now;
  fps += ((1 / Math.max(rawDt, 0.0001)) - fps) * 0.08;

  if (SIM_MODES.has(G.mode) && !G.runOver) {
    accumulator += rawDt * G.debug.timescale;
    let steps = 0;
    while (accumulator >= STEP && steps < MAX_STEPS) {
      if (G.hitstop > 0) G.hitstop -= STEP;
      else stepSim(STEP);
      accumulator -= STEP;
      steps++;
    }
    if (steps === MAX_STEPS) accumulator = 0;
  }

  const t1 = performance.now();
  simMs += (t1 - t0 - simMs) * 0.1;

  menuTime += rawDt;
  if (G.mode === MODES.EVOLVING) updateEvolution(rawDt);
  updateCamera(rawDt);
  draw();

  const t2 = performance.now();
  drawMs += (t2 - t1 - drawMs) * 0.1;
  frameMs += (t2 - t0 - frameMs) * 0.1;
  endFrame();
}

/** The fixed update order. Everything about system sequencing is visible in this one function. */
function stepSim(dt) {
  G.tick++;
  G.runTime += dt;

  updateDirector(dt);
  updateProps();
  drainBossQueue();
  drainSpawnRequests();

  // The grid stores INDICES into the enemies array, so it is rebuilt twice: once now, because
  // last tick's sweep swap-popped the array and left the old indices dangling, and again after
  // movement so that combat queries see where enemies actually are.
  rebuildGrid();
  updateEnemies(dt, !heavyLoad || (sepTick++ & 1) === 0);
  rebuildGrid();

  updateWeapons(dt);
  updateAbilities(dt);
  updateZones(dt);
  updateProjectiles(dt);
  updatePlayer(dt);
  updatePickups(dt, (v) => { grantXp(v); sfx('xp'); }, (v) => { grantCoins(v); sfx('coin'); });
  updateItems(dt);
  updateFx(dt);
  if (G.banner.t > 0) G.banner.t -= dt;

  // Everything killed this tick is recycled here, once, after all collision work is done.
  sweepDead();

  heavyLoad = enemies.length > 220;

  // The route theme layers up with the spawn curve rather than looping identically for 20 minutes.
  if ((G.tick & 63) === 0 && audioReady()) {
    const m = G.curve.m;
    setIntensity(m > 11 ? 2 : m > 5 ? 1 : 0);
  }

  // A pending level-up opens the modal, which freezes the simulation. Checked last so the tick
  // that granted the XP completes first.
  if (G.pendingLevelUps > 0 && G.mode === MODES.PLAYING) openLevelUp();
}

function openLevelUp() {
  sfx('levelup');
  rollOffers(3);
  ui.cursor = 0;
  ui.banishArm = false;
  setMode(MODES.LEVELUP);
  // Without this the accumulator banks the whole time the modal is open and the world
  // fast-forwards the instant it closes.
  resetAccumulator();
}

function closeLevelUp() {
  if (G.pendingLevelUps > 0) { openLevelUp(); return; }
  if (startEvolution()) return;
  setMode(MODES.PLAYING);
  resetAccumulator();
}

// --- Evolution --------------------------------------------------------------

let evo = null;

/** Open the branch picker or the cutscene if an evolution is due. Returns true if it took over. */
function startEvolution() {
  const ev = pendingEvolution();
  if (!ev) return false;

  if (ev.branch) {
    // Eevee's fork reuses the level-up modal's cursor and the already-written choice screen.
    ui.cursor = 0;
    evo = { ev, branches: ev.branch.map((b) => ({ ...b, sprId: spriteBase(b.shape, b.palette) })) };
    setMode(MODES.EVOLVE_CHOICE);
    return true;
  }
  // An awakening or a crest is the same creature getting stronger -- it gets a banner, not a
  // two-second cutscene announcing it turned into itself.
  if (ev.crest || ev.awaken || ev.id === G.form.id) {
    applyEvolution(ev, null);
    showBanner(`${G.form.name.toUpperCase()} AWAKENED`, ev.title || ev.note || '');
    return false;
  }
  beginCutscene(ev, null);
  return true;
}

/** A short HUD banner. Does not freeze the game. */
function showBanner(text, sub) {
  G.banner.text = text;
  G.banner.sub = sub;
  G.banner.t = 3.0;
}

function beginCutscene(ev, branch) {
  const chosen = branch || ev;
  // Belt and braces: a data mistake that points an evolution at the current form degrades to a
  // banner rather than a nonsense "X evolved into X" cutscene.
  if (chosen.id && chosen.id === G.form.id) {
    applyEvolution(ev, branch);
    showBanner(`${G.form.name.toUpperCase()} AWAKENED`, chosen.note || '');
    setMode(MODES.PLAYING);
    resetAccumulator();
    return;
  }
  const oldName = G.form.name;
  const oldBase = G.player.sprBase;

  applyEvolution(ev, branch);
  const newBase = spriteBase(G.form.shape, G.form.palette);
  G.player.sprBase = newBase;

  sfx('evolve');
  if (audioReady()) playOnce(FANFARE);
  evo = {
    t: 0, ev, oldBase, newBase,
    oldName, newName: G.form.name, note: chosen.note || '',
  };
  setMode(MODES.EVOLVING);
  resetAccumulator();
}

function updateEvolution(dt) {
  if (!evo) return;
  evo.t += dt;
  if (evo.t < EVO_TOTAL) return;

  // The shockwave that lands with the new form clears the immediate area, and the player gets a
  // moment of invulnerability so a 2-second freeze can never be what killed them.
  killAll(120);
  addShake(0.8);
  G.player.iframes = 1.5;
  G.player.hp = Math.min(G.stats.maxHp, G.player.hp + 20);
  evo = null;
  setMode(MODES.PLAYING);
  resetAccumulator();

  // Chain: crossing several thresholds at once (or jumping levels with ?level=) can leave another
  // evolution pending. Without this it is silently skipped and its stat grant never applies.
  startEvolution();
}

/**
 * The director sets these and, until now, nothing read them -- so the 5/10/15 minute mini-bosses
 * and the 20:00 boss were scheduled and never actually appeared.
 */
function drainBossQueue() {
  if (G.pendingMiniboss > 0) {
    const tier = G.pendingMiniboss;
    G.pendingMiniboss = 0;
    spawnMiniboss(tier);
  }
  if (G.pendingBoss) {
    G.pendingBoss = false;
    spawnMiniboss(4);
  }
}

function spawnMiniboss(tier) {
  const pool = ENEMIES.filter((d) => !d.prop && d.stages.includes(G.stage.id));
  const def = pool[Math.min(pool.length - 1, 4 + tier)] || pool[pool.length - 1];
  if (!def) return;

  const p = G.player;
  const a = G.rngRun() * Math.PI * 2;
  const e = spawnEnemy(def, p.x + Math.cos(a) * 240, p.y + Math.sin(a) * 240);
  if (!e) return;

  // A mini-boss is a heavily scaled version of a stage enemy, with a health bar and real weight.
  const mult = tier >= 4 ? 90 : 14 + tier * 10;
  e.maxHp = e.hp = Math.round(e.maxHp * mult);
  e.r = def.r * (tier >= 4 ? 3.2 : 2.2);
  e.mass = 40;
  e.speed = def.speed * 0.75;
  e.dmg = e.dmg * 1.5;
  e.xp = 60 + tier * 40;
  e.boss = true;
  e.knockResist = 0.92;
  e.coinChance = 1;
  e.bossTier = tier;

  sfx('boss');
  if (audioReady() && tier >= 4) playTrack(BOSS);
  G.banner.text = tier >= 4 ? 'A HUGE SHADOW FALLS' : 'SOMETHING BIG APPROACHES';
  G.banner.sub = '';
  G.banner.t = 2.5;
  addShake(0.6);
}

function drainSpawnRequests() {
  for (let i = 0; i < spawnRequests.length; i++) {
    const r = spawnRequests[i];
    const def = ENEMY_BY_ID[r.defId];
    if (def) spawnEnemy(def, r.x, r.y, r.opts);
  }
  spawnRequests.length = 0;
}

// --- Feedback FX ------------------------------------------------------------

function popDamage(x, y, value, crit) {
  const d = spawn('damageNumbers');
  if (!d) return;
  d.x = x + (G.rngFx() - 0.5) * 6;
  d.y = y;
  d.vy = -26;
  d.life = 0.55;
  d.value = value;
  d.crit = crit;
  d.color = crit ? 'gold' : 'white';
}

/** Cosmetic ring (kind 0) or beam flash (kind 1). Damage is applied by the ability itself. */
function pushFx(kind, x, y, r, angle, color, life, width) {
  const f = spawn('shapes');
  if (!f) return;
  f.kind = kind;
  f.x = x; f.y = y;
  f.r = r;
  f.angle = angle || 0;
  f.width = width || 0;
  f.color = color;
  f.maxLife = f.life = life;
}

function burst(x, y, n, color) {
  for (let i = 0; i < n; i++) {
    const p = spawn('particles');
    if (!p) return;
    const a = G.rngFx() * Math.PI * 2;
    const sp = 20 + G.rngFx() * 45;
    p.x = x; p.y = y;
    p.vx = Math.cos(a) * sp;
    p.vy = Math.sin(a) * sp;
    p.maxLife = p.life = 0.22 + G.rngFx() * 0.18;
    p.size = 1;
    p.color = color;
    p.grav = 40;
  }
}

function updateFx(dt) {
  for (let i = damageNumbers.length - 1; i >= 0; i--) {
    const d = damageNumbers[i];
    d.life -= dt;
    d.y += d.vy * dt;
    d.vy += 52 * dt;
    if (d.life <= 0) despawn('damageNumbers', damageNumbers, i);
  }
  for (let i = particles.length - 1; i >= 0; i--) {
    const p = particles[i];
    p.life -= dt;
    p.x += p.vx * dt;
    p.y += p.vy * dt;
    p.vy += p.grav * dt;
    if (p.life <= 0) despawn('particles', particles, i);
  }
  for (let i = fxShapes.length - 1; i >= 0; i--) {
    const f = fxShapes[i];
    f.life -= dt;
    if (f.life <= 0) despawn('shapes', fxShapes, i);
  }
}

// --- Draw -------------------------------------------------------------------

function draw() {
  if (atlasView) { drawAtlasShowcase(); present(); return; }

  if (G.mode === MODES.TITLE || G.mode === MODES.SELECT) {
    if (G.mode === MODES.TITLE) drawTitle(CHARACTERS, menuTime);
    else drawSelect(CHARACTERS, menuTime);
    present();
    if (G.debug.on) drawDebugOverlay([`mode ${G.mode}   1-3 / ARROWS + ENTER`]);
    return;
  }

  drawBackground(G.stage);
  drawEntities();

  if (G.debug.showHitboxes) drawHitboxes();

  drawHud();

  if (G.mode === MODES.LEVELUP) drawLevelUp();
  else if (G.mode === MODES.EVOLVING) drawEvolution(evo);
  else if (G.mode === MODES.EVOLVE_CHOICE) drawEvolutionChoice(evo.branches);
  else if (G.mode === MODES.PAUSED) drawPause();

  present();

  if (G.debug.on) {
    drawDebugOverlay(debugLines(fps, frameMs, simMs, drawMs, entityCounts()));
  }
}

function drawHitboxes() {
  ctx.strokeStyle = '#ff5f5f';
  ctx.lineWidth = 1;
  for (let i = 0; i < enemies.length; i++) {
    const e = enemies[i];
    ctx.beginPath();
    ctx.arc(toScreenX(e.x) + 0.5, toScreenY(e.y) + 0.5, e.r, 0, Math.PI * 2);
    ctx.stroke();
  }
  const p = G.player;
  if (p) {
    ctx.strokeStyle = '#5fff8f';
    ctx.beginPath();
    ctx.arc(toScreenX(p.x) + 0.5, toScreenY(p.y) + 0.5, p.r, 0, Math.PI * 2);
    ctx.stroke();
    ctx.strokeStyle = 'rgba(120,200,255,0.5)';
    ctx.beginPath();
    ctx.arc(toScreenX(p.x) + 0.5, toScreenY(p.y) + 0.5, G.stats.magnet, 0, Math.PI * 2);
    ctx.stroke();
  }
}

/** `?atlas=1` -- contact sheet of every registered sprite plus the pixel font. */
function drawAtlasShowcase() {
  ctx.fillStyle = '#14141f';
  ctx.fillRect(0, 0, VW, VH);
  const t = performance.now() / 1000;
  const frame = ((t * 6) | 0) & 1;
  const dir = ((t * 0.7) | 0) & 1;
  const flash = 0;   // shown deliberately on its own row below, not strobed over everything

  let x = 40, y = 54;
  for (const [shape, pal] of characterSpritePairs()) {
    const base = spriteBase(shape, pal);
    drawShadow(ctx, x, y, 1.6);
    drawSprite(ctx, base + flash * 4 + frame * 2 + dir, x, y);
    drawText(ctx, shape.slice(0, 9), x - 24, y + 10, 'dim');
    x += 76;
    if (x > VW - 44) { x = 40; y += 74; }
  }
  // Hit-flash variants on their own row -- the evolution cutscene depends on these existing.
  x = 40; y += 62;
  drawText(ctx, 'FLASH', 2, y - 12, 'dim');
  for (const [shape, pal] of characterSpritePairs()) {
    drawSprite(ctx, spriteBase(shape, pal) + 4, x, y);
    x += 76;
    if (x > VW - 44) { x = 40; y += 74; }
  }

  x = 34; y += 58;
  for (const [shape, pal] of enemySpritePairs()) {
    const base = spriteBase(shape, pal);
    drawShadow(ctx, x, y);
    drawSprite(ctx, base + flash * 4 + frame * 2 + dir, x, y);
    drawText(ctx, pal.slice(0, 7), x - 16, y + 6, 'dim');
    x += 48;
    if (x > VW - 40) { x = 34; y += 40; }
  }

  y += 40;
  for (const [shape, pal, rot] of weaponSpritePairs()) {
    const base = spriteBase(shape, pal);
    const nd = spriteDirs(shape, pal);
    if (nd > 2) for (let i = 0; i < nd; i++) drawSprite(ctx, base + i, 26 + i * 15, y);
    else drawSprite(ctx, base + dir, 26, y);
    y += 18;
  }

  const fy = VH - 30;
  drawText(ctx, 'ABCDEFGHIJKLMNOPQRSTUVWXYZ 0123456789', 8, fy, 'white');
  drawTextCentered(ctx, `ATLAS ${atlasStats.frames} FRAMES IN ${atlasStats.ms.toFixed(1)}MS`, VW / 2, fy + 12, 'green');
}

// Boot is async because supplied images must decode before the atlas is built. A rejection here
// would leave a blank page with no explanation, so surface it on the canvas instead.
boot().catch((e) => {
  console.error(e);
  const c = document.getElementById("view");
  if (c) {
    const x = c.getContext("2d");
    x.fillStyle = "#101018"; x.fillRect(0, 0, c.width, c.height);
    x.fillStyle = "#ff6b6b"; x.font = "16px monospace";
    x.fillText("Boot failed: " + e.message, 16, 32);
  }
});
