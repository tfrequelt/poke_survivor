// L5 -- the composition root. The ONLY sequencer: no system calls another system's update().
// Cross-system effects travel through world.js queues and combat.js hooks, drained here in a
// fixed order, which is what keeps the module graph acyclic without a build step to enforce it.

import { G, MODES, SIM_MODES, setMode, resetRunState } from './state.js';
import { mulberry32, formatTime, clamp } from './util.js';
import {
  initInput, endFrame, onKey, isAction, bindAction, resetBindings, BINDABLE, bindings,
} from './input.js';
import { loadSettings, saveSettings } from './settings.js';
import {
  initRender, ctx, present, drawBackground, drawDebugOverlay,
  updateCamera, snapCamera, toScreenX, toScreenY, addShake, scale, VW, VH,
} from './render.js';
import {
  registerSprite, buildAtlas, spriteBase, spriteDirs, spriteInfo, angleSlot,
  drawSprite, drawShadow, drawText, drawTextCentered,
} from './sprites.js';
import {
  enemies, projectiles, orbs, coins, items, damageNumbers, particles, zones,
  spawn, despawn, clearWorld, rebuildGrid, sweepDead, entityCounts, spawnRequests, fxShapes,
} from './world.js';
import { initStats, ensureStats, addGrant, addMods } from './stats.js';
import { loadSave, bankGold, bankTotal, rankOf, buyRank, resetProgress } from './save.js';
import { SHOP_ITEMS, rankCost } from './data/shop.js';
import { hooks, damageEnemy, killAll, applyBurn } from './combat.js';
import { createPlayer, updatePlayer, setReviveFx } from './player.js';
import { initEnemyDefs, updateEnemies, spawnEnemy, ringPoint } from './enemies.js';
import { ENEMIES } from './data/enemies.js';
import { ENEMY_BY_ID, BOSS_TIERS } from './data/enemies.js';
import {
  initWeaponDefs, addWeapon, updateWeapons, updateProjectiles, motionIndex, setWeaponFx,
  evolveWeapon, setWeaponSfx,
} from './weapons.js';
import {
  initAbilityDefs, addAbility, fireAbility, updateAbilities, updateZones, fx as abilityFx,
} from './abilities.js';
import { abilitySpritePairs } from './data/abilities.js';
import { FX, fxSprites } from './fx.js';
import {
  initPickupSprites, initItemSprites, dropXp, dropCoin, updatePickups,
  updateItems, dropPickup, dropRandomPickup, magnetAll, itemEffects, itemSpritePairs,
} from './pickups.js';
import {
  grantXp, grantCoins, initForm, xpToNext, rollOffers, takeOffer,
  rerollOffers, banishOffer, skipOffer, resetPicks, pendingEvolution, applyEvolution,
} from './progress.js';
import { updateDirector, resetDirector, catchUpSchedule, stressSpawn } from './director.js';
import { updateProps, resetProps, clearProp } from './props.js';
import { drawEntities } from './entities.js';
import { drawHud, debugLines } from './hud.js';
import {
  ui, drawLevelUp, drawPause, drawTitle, drawSelect, drawStageSelect, drawEvolution, drawEvolutionChoice,
  EVO_TOTAL, setBallSprite, drawCredits, creditsMax, drawSettings, settingsRows,
  drawSummary, drawShop, shopRows, drawWheel,
} from './ui.js';
import { wheel, startWheel, updateWheel, chooseSwap } from './wheel.js';
import { CHARACTERS, CHARACTER_BY_ID, characterSpritePairs } from './data/characters.js';
import { enemySpritePairs } from './data/enemies.js';
import { weaponSpritePairs } from './data/weapons.js';
import { STAGE_BY_ID, STAGES, propSpritePairs } from './data/stages.js';
import { loadAssets, pickMusic, getSheet, sfxFiles, sfxGains, getAttack } from './assets.js';
import {
  initAudio, audioReady, sfx, playTrack, playOnce, setIntensity, stopTrack,
  setVolume, toggleMute, settings as audioSettings, TITLE, ROUTE, BOSS, FANFARE,
  playMusicFile, musicFilePlaying, setMusicFallback, setMusicAdvance, currentMusicUrl, setSfxFiles,
  sampleDuration, duckMusic,
} from './audio.js';

const STEP = 1 / 60;
const MAX_STEPS = 5;

let accumulator = 0;
let lastTime = 0;
let fps = 60, frameMs = 0, simMs = 0, drawMs = 0;
let atlasView = false;
let dirView = false;
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
  dirView = q.has('dirs');

  initInput();
  initRender();

  // Supplied images must finish decoding before the atlas is rasterised. This never throws:
  // a missing manifest is the normal case and every sprite falls back to its drawn version.
  assetStats = await loadAssets();
  // Supplied samples override the synthesised sounds of the same id. Handed over before the
  // context exists; audio.js decodes them the moment one does.
  setSfxFiles(sfxFiles, sfxGains);

  // Register every sprite pair the data asks for, then compile the atlas once.
  for (const [shape, pal, fb] of characterSpritePairs()) registerSprite(shape, pal, 0, fb);
  for (const [shape, pal, fallback] of enemySpritePairs()) {
    // Skip the gold elite recolour of a sheet-backed enemy: it would rasterise a second, pixel
    // for pixel identical copy of a large sheet and eat atlas space for nothing.
    if (pal === 'elite' && getSheet(shape)) continue;
    registerSprite(shape, pal, 0, fallback);
  }
  for (const [shape, pal, rot] of weaponSpritePairs()) registerSprite(shape, pal, rot || 0);
  for (const [shape, pal, rot] of abilitySpritePairs()) registerSprite(shape, pal, rot || 0);
  for (const [shape, pal] of propSpritePairs()) registerSprite(shape, pal);
  for (const [shape, pal, fb] of itemSpritePairs()) registerSprite(shape, pal, 0, fb);
  for (const pal of ['xp_small', 'xp_mid', 'xp_big', 'xp_huge']) registerSprite('orb', pal);
  registerSprite('coin', 'gold');
  registerSprite('pokeball', 'crab');
  atlasStats = buildAtlas();

  initEnemyDefs();
  initWeaponDefs();
  initAbilityDefs(motionIndex('homing'));
  // Frame ids for the shared effect art, so the renderers never look anything up by name.
  fxSprites.bolt = spriteBase('fx_bolt', 'thunder');
  fxSprites.wave = spriteBase('fx_wave', 'wave');
  fxSprites.waveDirs = spriteDirs('fx_wave', 'wave');
  fxSprites.wisp = spriteBase('fx_wisp', 'shadowy');
  fxSprites.rubble = spriteBase('fx_rubble', 'earth');
  fxSprites.leafblade = spriteBase('fx_leafblade', 'leafblade');
  fxSprites.leafbladeDirs = spriteDirs('fx_leafblade', 'leafblade');
  initPickupSprites();
  initItemSprites();
  installHooks();

  // Each starter needs a sprite id for the menus to draw it, plus the frame/direction counts --
  // a PMD sheet has 8 rows and a drawn pair has 2, and the menus cannot assume either.
  for (const c of CHARACTERS) {
    c.sprId = spriteBase(c.shape, c.palette);
    const info = spriteInfo(c.shape, c.palette);
    c.sprDirs = info ? info.nd : 2;
    c.sprFrames = info ? info.nf : 2;
    c.sprFace = c.sprDirs === 8 ? 0 : 1;      // row 0 is "down" on a sheet; slot 1 is "right"
  }
  setBallSprite(spriteBase('pokeball', 'crab'));

  // Purchased ranks are applied inside startRun, so the save has to be in hand before one can
  // possibly begin -- a ?char= deep link starts on the very next line.
  loadSave();

  bootParams = q;
  if (q.has('char') && CHARACTER_BY_ID[q.get('char')]) {
    startRun(CHARACTER_BY_ID[q.get('char')], q);
  } else {
    setMode(MODES.TITLE);
  }

  // Volumes and bindings are restored before the first key is read, so a rebound key works on
  // the very first press rather than after the settings screen has been opened once.
  loadSettings();

  onKey(handleKey);
  setMusicFallback(() => playTrack(lastChiptune || ROUTE));
  // When a track runs out, move to another from the same list rather than looping it.
  setMusicAdvance((finished) => pickMusic(musicKey, G.rngFx, finished));

  // Debug-only handle so an automated harness can drive the stress test and read exact frame
  // timings, rather than inferring them from a screenshot of the overlay.
  if (G.debug.on) {
    window.__dbg = {
      G,
      stress: (n) => stressSpawn(n),
      grantAbility: (id) => addAbility(id),
      grantWeapon: (id) => addWeapon(id),
      clearWeapons: () => { G.weapons.length = 0; },
      // Clear the board WITHOUT firing kill hooks, so a test sweep does not bury itself in XP
      // orbs and level-ups. Also drops live projectiles and zones, or a previous weapon's mines
      // keep detonating inside the next weapon's measurement window.
      wipe: () => {
        for (const e of enemies) e.alive = false;
        sweepDead();
        for (let i = projectiles.length - 1; i >= 0; i--) despawn('projectiles', projectiles, i);
        for (let i = zones.length - 1; i >= 0; i--) despawn('zones', zones, i);
        for (let i = orbs.length - 1; i >= 0; i--) despawn('orbs', orbs, i);
      },
      weaponDamage: () => G.weapons.map((w) => w.def.id),
      // The live pools themselves. A probe that has to assert on what is actually on the field
      // -- a boss's tier, which orbs are being pulled in -- cannot do it through a summary.
      pools: () => ({ enemies, projectiles, orbs, coins, items, zones }),
      hurt: (e, n) => damageEnemy(e, n, 0, 0, false),
      burn: (e, dps, secs) => applyBurn(e, dps, secs),
      save: () => G.save,
      present: () => { const p = G.player; dropPickup(p.x + 12, p.y, 'present'); },
      hurtPlayer: (n) => { G.player.hp -= n; },
      drop: (kind) => dropPickup(G.player.x + 14, G.player.y, kind),
      props: () => enemies.filter((e) => e.alive && e.prop).length,
      // Spawn a ring of enemies at an exact radius -- the stress spawner uses the 350-430 spawn
      // ring, which sits outside most ability radii and makes them look broken when they are not.
      spawnNear: function (n, r, id) {
        const p = G.player, def = ENEMY_BY_ID[arguments[2] || ENEMIES[0].id];
        if (!def) throw new Error(`spawnNear: no enemy "${arguments[2]}"`);
        for (let i = 0; i < n; i++) {
          const a = (i / n) * Math.PI * 2;
          spawnEnemy(def, p.x + Math.cos(a) * r, p.y + Math.sin(a) * r);
        }
      },
      // castAbility, not fireAbility: the harness should take the same path the game does,
      // including the sound and the attack animation.
      fire: (slot) => castAbility(slot),
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
      // Scenery is not a kill: no tally, and it never comes back -- the cell is remembered as
      // cleared so the hash cannot re-roll the same bush on the next tick.
      clearProp(e);
      const d = e.def.drops || PROP_DROPS;
      // Usually worth breaking, occasionally worth going out of your way for.
      if (G.rngRun() < d.xpChance) {
        scatter(e.x, e.y, d.xp, 14, (x, y) => dropXp(x, y, 1 + ((G.rngRun() * 2) | 0)));
      }
      if (G.rngRun() < d.coinChance) {
        scatter(e.x, e.y, d.coins, 14, (x, y) => dropCoin(x, y, 1 + ((G.rngRun() * 3) | 0)));
      }
      if (G.rngRun() < d.pickupChance) dropRandomPickup(e.x, e.y);
      burst(e.x, e.y, 8, '#c8c0ad');
      return;
    }
    G.kills++;

    if (e.boss) { bossDrops(e); return; }

    dropXp(e.x, e.y, e.xp);
    if (e.coinChance > 0 && G.rngRun() < e.coinChance) {
      dropCoin(e.x, e.y, G.rngRun() < 0.15 ? 5 : 1);
    }
    // Elites always leave something worth walking to.
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
  abilityFx.ring = (x, y, r, color, life) => pushFx(FX.RING, x, y, r, 0, color, life);
  abilityFx.beam = (x, y, angle, len, width, color, life) =>
    pushFx(FX.BEAM, x, y, len, angle, color, life, width);
  abilityFx.crack = (x, y, angle, len, color, life) =>
    pushFx(FX.CRACK, x, y, len, angle, color, life, 0, (G.rngFx() * 65535) | 0);
  abilityFx.bolt = (x, y, height, life) =>
    pushFx(FX.BOLT, x, y, height, 0, '#fff05a', life, 0, (G.rngFx() * 65535) | 0);
  abilityFx.wave = (x, y, r, angle, spread, life) =>
    pushFx(FX.WAVE, x, y, r, angle, '#5ab6ef', life, spread);
  abilityFx.motes = motes;
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
      p2.sprId = -1;
    },
    (x, y, n, color) => burst(x, y, Math.min(6, n), color),
    // A detonation: a ring at the blast radius plus a heavier spray than an ordinary impact.
    (x, y, r, color) => { pushFx(FX.RING, x, y, r, 0, color, 0.3); burst(x, y, 10, color); },
  );

  abilityFx.heal = (amount) => {
    const p = G.player;
    if (p) p.hp = Math.min(G.stats.maxHp, p.hp + amount);
  };

  // --- Item pickups ---
  setReviveFx((p, left) => {
    killAll(150);
    addShake(0.8);
    burst(p.x, p.y, 30, '#ffd166');
    sfx('levelup');
    G.banner = { text: 'BACK ON YOUR FEET', sub: left > 0 ? `${left} LEFT` : '', t: 2.2 };
  });

  itemEffects.present = () => {
    G.pendingWheel = true;
    // Opening a present takes Present's own cooldown off. The wheel freezes the run for three
    // seconds, and coming out of it unable to throw the next one is the one moment Delibird's
    // gimmick works against itself. Guarded on the slot: the ability is drafted, not given.
    const q = G.abilities[0];
    if (q) q.cd = 0;
  };
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

function startRun(character, q, stageId) {
  clearWorld();
  resetRunState();
  resetDirector();
  resetProps();

  const id = stageId || (q && q.get('stage')) || 'grass';
  G.stage = STAGE_BY_ID[id] || STAGES[0];
  // The arena is centred on the origin, which is also where the player starts.
  const a = G.stage.arena;
  G.bounds = a ? { minX: -a.w / 2, minY: -a.h / 2, maxX: a.w / 2, maxY: a.h / 2 } : null;

  initStats();
  resetPicks();
  initForm(character);
  // resetRunState() emptied G.mods, so this is the one window in which a permanent modifier can
  // be added: after the stat block is rebuilt, before anything resolves it.
  applyShopMods();
  ensureStats();

  G.player = createPlayer(0, 0);
  G.player.sprBase = spriteBase(character.shape, character.palette);
  applyPlayerSprite(character.shape, character.palette);
  G.player.hp = G.player.maxHp = G.stats.maxHp;
  // Read once, at the start: the run counts these down rather than recomputing them, so picking
  // up more max HP mid-run cannot conjure another second chance.
  G.revivesLeft = G.stats.revives | 0;
  G.xpNext = xpToNext(1);

  addWeapon(character.weapon);

  G.rerolls = shopCharges('rerolls');
  G.banishes = shopCharges('banishes');
  G.skips = shopCharges('skips');

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
  setIntensity(0);
  startMusic(G.stage.id, ROUTE);
}

/** Re-add every purchased rank as an ordinary stat modifier. */
function applyShopMods() {
  for (const item of SHOP_ITEMS) {
    if (!item.mods) continue;
    const n = rankOf(item.id);
    // Ranks stack by repetition rather than by scaling the value, so five ranks of an 'inc'
    // modifier read as +40% and not x1.47 -- the same way five Might cards do.
    for (let i = 0; i < n; i++) addMods(item.mods, `shop:${item.id}`);
  }
}

/** Starting reroll / banish / skip charges: one, plus whatever has been bought. */
function shopCharges(field) {
  let n = 1;
  for (const item of SHOP_ITEMS) if (item.start === field) n += rankOf(item.id);
  return n;
}

// --- Input ------------------------------------------------------------------

function handleKey(code) {
  // The AudioContext cannot start without a user gesture. The title screen already waits for a
  // keypress, so that is the natural unlock point.
  if (!audioReady()) {
    initAudio();
    // ctx.resume() settles asynchronously, so audioReady() is still false on this line. Starting
    // music here would be dropped on the floor; the frame loop picks it up as soon as the context
    // actually reaches "running".
    musicPending = true;
  }
  // The settings screen is checked first: while it is waiting for a new binding, EVERY key
  // belongs to it, including mute and fullscreen.
  if (G.mode === MODES.SETTINGS) return settingsKey(code);

  if (isAction(code, 'mute')) { toggleMute(); saveSettings(); return; }
  if (isAction(code, 'fullscreen')) return toggleFullscreen();

  if (G.mode === MODES.SUMMARY) {
    // The run is over and banked; there is nothing here to read twice.
    toSelect();
    return;
  }
  if (G.mode === MODES.SHOP) return shopKey(code);

  if (G.mode === MODES.TITLE) {
    if (code === 'KeyC') { ui.scroll = 0; setMode(MODES.CREDITS); return; }
    if (code === 'KeyO') return openSettings();
    if (code === 'KeyS') return openShop();
    ui.cursor = 0;
    setMode(MODES.SELECT);
    sfx('confirm');
    return;
  }
  if (G.mode === MODES.CREDITS) {
    // The attribution list is longer than a page, so the arrows have to scroll it rather than
    // dismiss it -- "any key returns" would make most of the credits unreadable.
    const max = creditsMax();
    if (code === 'ArrowUp' || isAction(code, 'up')) ui.scroll = Math.max(0, ui.scroll - 1);
    else if (code === 'ArrowDown' || isAction(code, 'down')) ui.scroll = Math.min(max, ui.scroll + 1);
    else setMode(MODES.TITLE);
    return;
  }
  if (G.mode === MODES.SELECT) return selectKey(code);
  if (G.mode === MODES.STAGE_SELECT) return stageKey(code);

  // The level-up modal owns the keyboard while it is open, so R means "reroll" there and
  // "restart" everywhere else.
  if (G.mode === MODES.LEVELUP) return levelUpKey(code);
  if (G.mode === MODES.EVOLVE_CHOICE) return evolveChoiceKey(code);
  if (G.mode === MODES.EVOLVING) {
    // The cutscene owns the screen, and swallows everything until it has finished playing.
    if (evo && evo.done && (code === 'Enter' || code === 'Space')) finishEvolution();
    return;
  }
  if (G.mode === MODES.WHEEL) return wheelKey(code);

  if (isAction(code, 'restart')) return startRun(G.character, bootParams);
  // The ability keys are live during play, so "back to partner select" only applies once the run
  // is already stopped.
  if (isAction(code, 'ability1') && (G.runOver || G.mode === MODES.PAUSED)) return toSelect();
  if (G.mode === MODES.PAUSED && code === 'KeyO') return openSettings();
  if (G.runOver) return;
  if (isAction(code, 'pause')) return togglePause();

  if (G.mode === MODES.PLAYING) {
    if (isAction(code, 'ability1')) return void castAbility(0);
    if (isAction(code, 'ability2')) return void castAbility(1);
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

function openShop() {
  ui.cursor = 0;
  ui.scroll = 0;
  ui.note = '';
  setMode(MODES.SHOP);
  sfx('select');
}

function shopKey(code) {
  code = menuCode(code);
  const rows = shopRows();
  const n = rows.length;
  switch (code) {
    case 'ArrowUp': ui.cursor = (ui.cursor + n - 1) % n; ui.note = ''; return;
    case 'ArrowDown': ui.cursor = (ui.cursor + 1) % n; ui.note = ''; return;
    case 'Escape': setMode(MODES.TITLE); sfx('select'); return;
    case 'Enter': case 'Space': break;
    default: return;
  }

  const row = rows[Math.min(ui.cursor, n - 1)];
  if (row.kind === 'close') { setMode(MODES.TITLE); sfx('select'); return; }
  if (row.kind === 'reset') {
    // Two presses, like banishing: this wipes every rank and there is no undo.
    if (ui.banishArm) { resetProgress(); ui.banishArm = false; ui.note = 'PROGRESS RESET'; sfx('confirm'); }
    else { ui.banishArm = true; ui.note = 'PRESS AGAIN TO CONFIRM'; }
    return;
  }

  ui.banishArm = false;
  const owned = rankOf(row.item.id);
  const cost = rankCost(row.item, owned);
  if (cost < 0) { ui.note = 'ALREADY MAXED'; return; }
  if (cost > bankTotal()) { ui.note = 'NOT ENOUGH GOLD'; return; }
  buyRank(row.item.id, cost, row.item.ranks);
  ui.note = `${row.item.name} RANK ${owned + 1}`;
  sfx('confirm');
}

function toSelect() {
  ui.cursor = Math.max(0, CHARACTERS.indexOf(G.character));
  setMode(MODES.SELECT);
  sfx('select');
  startMusic('menu', TITLE);
}

function selectKey(code) {
  code = menuCode(code);
  const n = CHARACTERS.length;
  switch (code) {
    case 'ArrowLeft': ui.cursor = (ui.cursor + n - 1) % n; break;
    case 'ArrowRight': ui.cursor = (ui.cursor + 1) % n; break;
    case 'Digit1': case 'Digit2': case 'Digit3': case 'Digit4': {
      const i = Number(code.slice(5)) - 1;
      if (i < n) chooseStarter(CHARACTERS[i]);
      break;
    }
    case 'Enter': case 'Space': chooseStarter(CHARACTERS[ui.cursor]); break;
    case 'Escape': setMode(MODES.TITLE); break;
  }
}

/** The partner is locked in; the stage screen picks where to take them. */
function chooseStarter(c) {
  pendingCharacter = c;
  // Default the cursor to whatever ?stage= asked for, so a deep link still lands on its stage.
  const want = bootParams && bootParams.get('stage');
  const i = STAGES.findIndex((st) => st.id === want);
  ui.cursor = i >= 0 ? i : 0;
  setMode(MODES.STAGE_SELECT);
  sfx('confirm');
}

let pendingCharacter = null;

function stageKey(code) {
  code = menuCode(code);
  const n = STAGES.length;
  switch (code) {
    case 'ArrowLeft': ui.cursor = (ui.cursor + n - 1) % n; break;
    case 'ArrowRight': ui.cursor = (ui.cursor + 1) % n; break;
    case 'Digit1': case 'Digit2': case 'Digit3': case 'Digit4': {
      const i = Number(code.slice(5)) - 1;
      if (i < n) startRun(pendingCharacter, bootParams, STAGES[i].id);
      break;
    }
    case 'Enter': case 'Space':
      startRun(pendingCharacter, bootParams, STAGES[ui.cursor].id);
      break;
    case 'Escape':
      ui.cursor = Math.max(0, CHARACTERS.indexOf(pendingCharacter));
      setMode(MODES.SELECT);
      break;
  }
}

function evolveChoiceKey(code) {
  code = menuCode(code);
  const n = evo.branches.length;
  switch (code) {
    case 'ArrowLeft': ui.cursor = (ui.cursor + n - 1) % n; break;
    case 'ArrowRight': ui.cursor = (ui.cursor + 1) % n; break;
    case 'Digit1': case 'Digit2': case 'Digit3': {
      const i = Number(code.slice(5)) - 1;
      if (i < n) beginCutscene(evo.ev, evo.ev.branch[i]);
      break;
    }
    case 'Enter': case 'Space': beginCutscene(evo.ev, evo.ev.branch[ui.cursor]); break;
  }
}

function levelUpKey(code) {
  const nav = menuCode(code);
  const n = G.offers.length;
  if (!n) return;
  switch (nav) {
    case 'ArrowLeft': ui.cursor = (ui.cursor + n - 1) % n; ui.banishArm = false; break;
    case 'ArrowRight': ui.cursor = (ui.cursor + 1) % n; ui.banishArm = false; break;
    case 'Digit1': case 'Digit2': case 'Digit3': {
      const i = Number(code.slice(5)) - 1;
      if (i < n) { takeOffer(G.offers[i]); closeLevelUp(); }
      break;
    }
    case 'Enter': case 'Space':
      takeOffer(G.offers[ui.cursor]);
      closeLevelUp();
      break;
  }
  if (isAction(code, 'reroll')) { if (rerollOffers()) ui.banishArm = false; return; }
  if (isAction(code, 'banish')) {
    // Banishing is permanent for the run, so it takes two presses to confirm.
    if (!ui.banishArm) ui.banishArm = true;
    else { banishOffer(G.offers[ui.cursor]); ui.banishArm = false; }
    return;
  }
  if (isAction(code, 'skip')) { if (skipOffer()) closeLevelUp(); }
}

/**
 * Start the music for a context. Supplied tracks win; if none is listed for this key, or the file
 * will not play, the synthesised chiptune takes over so the game is never silent.
 */
function startMusic(key, chiptune) {
  if (!audioReady()) return;
  // Remember the chiptune and the key for this context, so a track that fails to load -- or one
  // that simply finishes -- still knows where to go next.
  lastChiptune = chiptune;
  musicKey = key;
  const url = pickMusic(key, G.rngFx, currentMusicUrl());
  if (url && playMusicFile(url)) return;
  playTrack(chiptune);
}

let lastChiptune = null;
let musicKey = null;
let musicPending = false;

/** Fire an ability and play the sound that matches its effect. */
function castAbility(slot) {
  const a = G.abilities[slot];
  if (!fireAbility(slot)) return false;

  // Play the form's Attack animation once, in whatever direction the player is facing. A second
  // cast restarts it rather than queueing, so mashing Q never desyncs the animation from the
  // cooldown.
  const p = G.player;
  const atk = p && G.form ? getAttack(G.form.shape) : null;
  if (atk) { p.actT = 0; p.actDur = atk.total; }
  sfx(abilitySound(a.def));
  return true;
}

/**
 * Chiptune stand-ins, by effect. Only ever reached when the supplied file for an ability is
 * missing: every asset in this project is optional, and emptying the sounds folder has to leave
 * the abilities audible rather than silent.
 */
const FALLBACK_SFX = {
  shield: 'shield', shockwaveRings: 'quake', drainRings: 'quake',
  beam: 'beam', jet: 'beam', chain: 'shoot_bolt',
  skyStrike: 'shoot_bolt', wave: 'shoot_water',
  flameCone: 'quake', firePit: 'quake', pierceLine: 'shoot_grass',
  multiHoming: 'shoot_grass', present: 'pickup', blizzard: 'shoot_water',
};

/**
 * Which sound a cast of `def` plays.
 *
 * `def.sound` may name two files, and the choice comes from G.rngFx -- the COSMETIC stream.
 * Drawing it from G.rngRun would let which of two flame sounds you hear shift every gameplay
 * roll that followed it, and a seed would stop replaying identically.
 */
function abilitySound(def) {
  const want = def.sound;
  const id = Array.isArray(want) ? want[(G.rngFx() * want.length) | 0] : want;
  if (id && sampleDuration(id) > 0) return id;
  return FALLBACK_SFX[def.effect] || 'ability';
}

/** Point the player at a form's sprite and adopt its direction/frame counts. */
function applyPlayerSprite(shape, palette) {
  const p = G.player;
  if (!p) return;
  p.sprBase = spriteBase(shape, palette);
  const info = spriteInfo(shape, palette);
  p.nd = info ? info.nd : 2;
  p.nf = info ? info.nf : 2;
  // A 2-slot sprite has no row for "down"; clamp so an 8-way facing never indexes past the end.
  if (p.dir >= p.nd) p.dir = p.nd === 8 ? 0 : 1;
}

/**
 * Bound movement keys navigate menus too, so WASD works wherever the arrows do.
 *
 * The caller keeps the raw code as well: on the level-up screen, S is both "move down" and
 * "skip", and only the unmapped code can tell them apart.
 */
function menuCode(code) {
  if (isAction(code, 'left')) return 'ArrowLeft';
  if (isAction(code, 'right')) return 'ArrowRight';
  if (isAction(code, 'up')) return 'ArrowUp';
  if (isAction(code, 'down')) return 'ArrowDown';
  return code;
}

/** Open settings from wherever we are, remembering where to go back to. */
function openSettings() {
  settingsFrom = G.mode;
  ui.page = 'main';
  ui.cursor = 0;
  ui.awaitKey = null;
  ui.note = '';
  setMode(MODES.SETTINGS);
  sfx('select');
}

let settingsFrom = MODES.TITLE;

function closeSettings() {
  saveSettings();
  ui.awaitKey = null;
  ui.note = '';
  setMode(settingsFrom === MODES.SETTINGS ? MODES.TITLE : settingsFrom);
  if (G.mode === MODES.PLAYING) resetAccumulator();
}

function settingsKey(rawCode) {
  const inRun = !!G.player && settingsFrom !== MODES.TITLE;
  // A rebind must see the RAW key; navigation may use the bound movement keys.
  const code = ui.awaitKey ? rawCode : menuCode(rawCode);

  // Waiting for a rebind: this key IS the answer, whatever it is. Escape cancels so a player can
  // always back out rather than being forced to bind something.
  if (ui.awaitKey) {
    if (rawCode !== 'Escape') {
      const swapped = bindAction(ui.awaitKey, rawCode);
      const b = BINDABLE.find((x) => x.id === swapped);
      ui.note = b ? `SWAPPED WITH ${b.label}` : '';
      saveSettings();
    }
    ui.awaitKey = null;
    return;
  }

  const rows = settingsRows(inRun);
  const n = rows.length;
  const row = rows[Math.min(ui.cursor, n - 1)];
  ui.note = '';

  switch (code) {
    case 'ArrowUp': ui.cursor = (ui.cursor + n - 1) % n; return;
    case 'ArrowDown': ui.cursor = (ui.cursor + 1) % n; return;
    case 'ArrowLeft': case 'ArrowRight': {
      if (row.kind !== 'slider') return;
      const step = code === 'ArrowLeft' ? -0.1 : 0.1;
      setVolume(row.id, Math.round((audioSettings[row.id] + step) * 10) / 10);
      saveSettings();
      sfx('select');
      return;
    }
    case 'Escape':
      if (ui.page === 'controls') { ui.page = 'main'; ui.cursor = 0; return; }
      return closeSettings();
    case 'Enter': case 'Space': break;
    default: return;
  }

  if (row.kind === 'bind') { ui.awaitKey = row.id; return; }
  switch (row.id) {
    case 'controls': ui.page = 'controls'; ui.cursor = 0; break;
    case 'resetKeys': resetBindings(); saveSettings(); ui.note = 'BINDINGS RESET'; break;
    case 'back': ui.page = 'main'; ui.cursor = 0; break;
    case 'menu': saveSettings(); toSelect(); break;
    case 'restart': saveSettings(); setMode(MODES.PLAYING); startRun(G.character, bootParams); break;
    case 'close': closeSettings(); break;
  }
  sfx('confirm');
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
  if (musicPending && audioReady()) {
    musicPending = false;
    // A run entered directly via ?char= is already playing by the time audio unlocks, so it wants
    // its stage track rather than the menu theme.
    if (G.mode === MODES.PLAYING && G.stage) startMusic(G.stage.id, ROUTE);
    else startMusic('menu', TITLE);
  }
  if (G.mode === MODES.EVOLVING) updateEvolution(rawDt);
  // The wheel animates while the simulation is frozen, so it runs on raw dt like the cutscene.
  if (G.mode === MODES.WHEEL) updateWheel(rawDt);
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
  dropPresents(dt);
  updateFx(dt);
  if (G.banner.t > 0) G.banner.t -= dt;

  // Everything killed this tick is recycled here, once, after all collision work is done.
  sweepDead();

  heavyLoad = enemies.length > 220;

  // The route theme layers up with the spawn curve rather than looping identically for 20 minutes.
  if ((G.tick & 63) === 0 && audioReady() && !musicFilePlaying()) {
    const m = G.curve.m;
    setIntensity(m > 11 ? 2 : m > 5 ? 1 : 0);
  }

  // A pending level-up opens the modal, which freezes the simulation. Checked last so the tick
  // that granted the XP completes first.
  //
  // Not once the run is won: the boss's payout is worth several levels at once, and a modal
  // here would freeze the victory beat before it could finish and strand the run on a card
  // screen forever. There is nothing left to spend an upgrade on anyway.
  if (G.pendingLevelUps > 0 && G.mode === MODES.PLAYING && !G.won) openLevelUp();

  // Same reason and the same place: the tick that collected the present has to finish before
  // anything freezes the world.
  if (G.pendingWheel && G.mode === MODES.PLAYING && !G.won) {
    G.pendingWheel = false;
    openWheel();
  }

  // The victory beat: the world keeps ticking so the boss's payout flies in and is counted,
  // then the summary takes over.
  if (G.victoryT > 0) {
    G.victoryT -= dt;
    if (G.victoryT <= 0) openSummary();
  }
  // Death banks here rather than in player.js, so every way a run can end goes through one line.
  if (G.runOver && !G.banked) bankRunGold();
}

/** Bank the run's gold, exactly once, however the run ended. */
function bankRunGold() {
  if (G.banked) return 0;
  G.banked = true;
  return bankGold(G.coins);
}

function openSummary() {
  bankRunGold();
  setMode(MODES.SUMMARY);
  startMusic('menu', TITLE);
}

/**
 * Delibird's presents. Nobody else gets them -- this is the whole of its trait, and a present
 * lying on the ground for a Wooper would be a pickup with no effect.
 *
 * They are dropped a little way off rather than underfoot, so collecting one is a decision to
 * go and get it.
 */
function dropPresents(dt) {
  if (!G.character || G.character.id !== 'delibird' || !G.player) return;
  if (G.presentT <= 0) {
    // Seeded on the first tick of the run rather than in resetRunState, so the interval can
    // read the form -- the awakened Delibird gets them noticeably more often.
    G.presentT = presentGap();
    return;
  }
  G.presentT -= dt;
  if (G.presentT > 0) return;
  G.presentT = presentGap();

  const a = G.rngRun() * Math.PI * 2;
  const d = 120 + G.rngRun() * 90;
  let x = G.player.x + Math.cos(a) * d;
  let y = G.player.y + Math.sin(a) * d;
  if (G.bounds) {
    x = clamp(x, G.bounds.minX + 24, G.bounds.maxX - 24);
    y = clamp(y, G.bounds.minY + 24, G.bounds.maxY - 24);
  }
  dropPickup(x, y, 'present');
}

function presentGap() {
  const hustle = G.form && G.form.id !== 'delibird';
  const base = hustle ? 34 : 50;
  return base + G.rngRun() * base * 0.5;
}

function openWheel() {
  // Spin for exactly as long as the sound lasts, so the wheel stops on the beat the ticking
  // does. Falls back to the wheel's own default when only the synthesised version exists.
  startWheel(sampleDuration('wheel_spin'));
  // Over the stage music rather than in place of it: this is a short effect, not a cutscene,
  // so nothing is ducked.
  sfx('wheel_spin');
  setMode(MODES.WHEEL);
  resetAccumulator();
}

function closeWheel() {
  setMode(MODES.PLAYING);
  resetAccumulator();
  // A wheel that handed out levels leaves them queued; the next tick opens the level-up screen.
}

function wheelKey(code) {
  if (wheel.phase === 'spin') return;          // it is still spinning; let it land
  if (wheel.phase === 'swap') {
    const n = wheel.choices.length;
    switch (menuCode(code)) {
      case 'ArrowLeft': wheel.cursor = (wheel.cursor + n - 1) % n; return;
      case 'ArrowRight': wheel.cursor = (wheel.cursor + 1) % n; return;
      case 'Enter': case 'Space': chooseSwap(wheel.cursor); sfx('confirm'); return;
      default: return;
    }
  }
  closeWheel();
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
  const oldInfo = spriteInfo(G.form.shape, G.form.palette);
  const oldFlash = oldInfo ? oldInfo.nf * oldInfo.nd : 4;
  const oldFace = oldInfo && oldInfo.nd === 8 ? 0 : 1;

  applyEvolution(ev, branch);
  const newBase = spriteBase(G.form.shape, G.form.palette);
  applyPlayerSprite(G.form.shape, G.form.palette);

  // The supplied evolution track, if there is one: it is roughly eleven seconds against a
  // 2.75s cutscene, so the stage music ducks for its whole length rather than just the cutscene.
  sfx('evolve');
  const jingle = sampleDuration('evolve');
  if (jingle > 0) duckMusic(jingle);
  else if (audioReady()) playOnce(FANFARE);
  const newInfo = spriteInfo(G.form.shape, G.form.palette);
  evo = {
    t: 0, ev, oldBase, newBase,
    // Flash-variant offset and the "face the camera" direction differ per form, so they travel
    // with the cutscene rather than being assumed.
    oldFlash, newFlash: newInfo ? newInfo.nf * newInfo.nd : 4,
    oldFace, newFace: newInfo && newInfo.nd === 8 ? 0 : 1,
    oldName, newName: G.form.name, note: chosen.note || '',
  };
  setMode(MODES.EVOLVING);
  resetAccumulator();
}

/**
 * The cutscene runs on raw dt and then HOLDS on its last frame until the player presses Enter.
 *
 * It is the one moment in a run worth looking at, and resuming on a timer meant it was over
 * before you had read which form you got or what its note said -- and dropped you straight back
 * into a crowd that had been waiting for you.
 *
 * `evo.t` keeps advancing while it holds, which is what keeps the starburst turning behind the
 * new sprite rather than freezing the screen solid.
 */
function updateEvolution(dt) {
  if (!evo) return;
  evo.t += dt;
  if (evo.t >= EVO_TOTAL) evo.done = true;
}

function finishEvolution() {
  if (!evo) return;
  // The shockwave that lands with the new form clears the immediate area, and the player gets a
  // moment of invulnerability so the pause can never be what killed them.
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
  // Named, not "whatever is fifth in the stage list": that made the mini-boss silently change
  // identity every time the roster was reordered, which is a bug you only notice by accident.
  let def = ENEMY_BY_ID[BOSS_TIERS[Math.min(BOSS_TIERS.length - 1, tier - 1)]];
  if (!def) {
    const pool = ENEMIES.filter((d) => !d.prop && d.stages.includes(G.stage.id));
    def = pool[pool.length - 1];
  }
  if (!def) return;

  const p = G.player;
  const a = G.rngRun() * Math.PI * 2;
  const pt = ringPoint(p.x, p.y, a, 240, G.rngRun);
  const e = spawnEnemy(def, pt.x, pt.y);
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
  // Only switch to the chiptune boss theme if this stage has no supplied music -- cutting from a
  // streamed track to a synthesised one mid-fight is jarring.
  if (audioReady() && tier >= 4 && !pickMusic(G.stage.id)) playTrack(BOSS);
  G.banner.text = tier >= 4 ? 'A HUGE SHADOW FALLS' : 'SOMETHING BIG APPROACHES';
  G.banner.sub = def.name.toUpperCase();
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

/** A cosmetic shape from the FX vocabulary. Damage is always applied by the ability itself. */
function pushFx(kind, x, y, r, angle, color, life, width, seed) {
  const f = spawn('shapes');
  if (!f) return;
  f.kind = kind;
  f.x = x; f.y = y;
  f.r = r;
  f.angle = angle || 0;
  f.width = width || 0;
  f.color = color;
  f.seed = seed || 0;
  f.maxLife = f.life = life;
}

/**
 * A particle that is a sprite -- a rubble chunk, a shadow wisp -- rather than a coloured pixel.
 * Negative gravity is how a wisp rises.
 */
function motes(x, y, vx, vy, life, sprId, grav) {
  const p = spawn('particles');
  if (!p) return;
  p.x = x; p.y = y;
  p.vx = vx; p.vy = vy;
  p.maxLife = p.life = life;
  p.size = 1;
  p.color = '#ffffff';
  p.grav = grav || 0;
  p.sprId = sprId;
}

/**
 * What a destroyed piece of scenery leaves behind. A def can override it with its own `drops`.
 *
 * Deliberately generous on the small stuff and stingy on the power-up: clearing scenery should
 * feel worth the detour every time, while still making a Sitrus Berry a find rather than income.
 */
const PROP_DROPS = { xpChance: 0.85, xp: 3, coinChance: 0.75, coins: 3, pickupChance: 0.14 };

/** Spread `n` drops around a point rather than stacking them, so a payout reads as a payout. */
function scatter(x, y, n, radius, drop) {
  for (let i = 0; i < n; i++) {
    const a = (i / n) * Math.PI * 2 + G.rngRun() * 0.9;
    const r = radius * (0.35 + G.rngRun() * 0.65);
    drop(x + Math.cos(a) * r, y + Math.sin(a) * r);
  }
}

/**
 * A mini-boss or the final boss. It has taken twenty times a normal enemy's health, so it pays
 * out like it: a spray of orbs and coins you can see from across the screen, and exactly one
 * power-up.
 */
function bossDrops(e) {
  const tier = e.bossTier || 1;
  const orbs = 8 + tier * 3;
  const per = Math.max(1, Math.round(e.xp / orbs));
  scatter(e.x, e.y, orbs, 34 + tier * 6, (x, y) => dropXp(x, y, per));
  scatter(e.x, e.y, 6 + tier * 2, 30 + tier * 6, (x, y) => dropCoin(x, y, 5 + ((G.rngRun() * 6) | 0)));
  dropPickup(e.x, e.y, tier >= 3 ? 'chest' : 'berry');
  burst(e.x, e.y, 26, '#ffd166');
  addShake(0.7);
  sfx('kill');

  // The 20:00 boss is the win condition. Everything still on the field dies with it and all of
  // it -- the boss's own payout included -- is pulled in, so the run's last seconds are a
  // victory lap rather than a scramble over loot that then gets thrown away.
  if (tier >= 4 && !G.won) {
    G.won = true;
    // Long enough for the far side of a wiped field to reach the player: the magnet tops out at
    // 450px/s and an enemy can die 700px away.
    G.victoryT = 4;
    killAll(0);
    magnetAll();
    G.banner = { text: 'VICTORY!', sub: formatTime(G.runTime), t: 3 };
  }
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
    p.sprId = -1;              // pooled: a recycled mote would otherwise keep drawing its sprite
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
  if (dirView) { drawDirectionSheet(); present(); return; }
  if (atlasView) { drawAtlasShowcase(); present(); return; }

  // Settings can sit over a live run or over the title, so it draws the world behind it when
  // there is one and takes the flat menu path when there is not.
  if (G.mode === MODES.SETTINGS && (!G.player || settingsFrom === MODES.TITLE)) {
    drawSettings(false);
    present();
    return;
  }

  if (G.mode === MODES.TITLE || G.mode === MODES.SELECT || G.mode === MODES.SHOP ||
      G.mode === MODES.STAGE_SELECT || G.mode === MODES.CREDITS || G.mode === MODES.SUMMARY) {
    if (G.mode === MODES.CREDITS) drawCredits();
    else if (G.mode === MODES.SUMMARY) drawSummary();
    else if (G.mode === MODES.SHOP) drawShop();
    else if (G.mode === MODES.TITLE) drawTitle(CHARACTERS, menuTime);
    else if (G.mode === MODES.STAGE_SELECT) drawStageSelect(STAGES, pendingCharacter, menuTime);
    else drawSelect(CHARACTERS, menuTime);
    present();
    if (G.debug.on) drawDebugOverlay([`mode ${G.mode}   1-${CHARACTERS.length} / ARROWS + ENTER`]);
    return;
  }

  drawBackground(G.stage);
  drawEntities();

  if (G.debug.showHitboxes) drawHitboxes();

  drawHud();

  if (G.mode === MODES.LEVELUP) drawLevelUp();
  else if (G.mode === MODES.EVOLVING) drawEvolution(evo);
  else if (G.mode === MODES.EVOLVE_CHOICE) drawEvolutionChoice(evo.branches);
  else if (G.mode === MODES.WHEEL) drawWheel();
  else if (G.mode === MODES.PAUSED) drawPause();
  else if (G.mode === MODES.SETTINGS) drawSettings(true);

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

/**
 * `?dirs=1` -- every sheet-backed form in all 8 facings, one row each.
 * Column order matches the PMD row order: Down, Down-Right, Right, Up-Right, Up, Up-Left, Left,
 * Down-Left. If a row looks scrambled, the sheet's rows are being read in the wrong order.
 */
function drawDirectionSheet() {
  ctx.fillStyle = '#14141f';
  ctx.fillRect(0, 0, VW, VH);
  const labels = ['DN', 'DR', 'R', 'UR', 'UP', 'UL', 'L', 'DL'];

  let y = 26;
  drawText(ctx, 'FACING:', 6, 8, 'dim');
  for (let d = 0; d < 8; d++) drawText(ctx, labels[d], 70 + d * 60, 10, 'gold');

  const frame = ((performance.now() / 120) | 0);
  for (const [shape, pal] of characterSpritePairs()) {
    const info = spriteInfo(shape, pal);
    if (!info || info.nd !== 8) continue;            // drawn-art forms have no 8-way sheet
    drawText(ctx, shape.slice(0, 10), 4, y - 6, 'white');
    for (let d = 0; d < 8; d++) {
      const id = info.base + (frame % info.nf) * 8 + d;
      drawSprite(ctx, id, 70 + d * 60, y + 14);
    }
    y += 37;                                       // 9 forms have to fit in 360px
    if (y > VH - 8) break;
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
    const inf = spriteInfo(shape, pal);
    const nd2 = inf ? inf.nd : 2;
    drawSprite(ctx, base + (frame % (inf ? inf.nf : 2)) * nd2 + (nd2 === 8 ? 0 : dir), x, y);
    drawText(ctx, shape.slice(0, 9), x - 24, y + 10, 'dim');
    x += 76;
    if (x > VW - 44) { x = 40; y += 74; }
  }
  // Hit-flash variants on their own row -- the evolution cutscene depends on these existing.
  x = 40; y += 62;
  drawText(ctx, 'FLASH', 2, y - 12, 'dim');
  for (const [shape, pal] of characterSpritePairs()) {
    const inf2 = spriteInfo(shape, pal);
    drawSprite(ctx, spriteBase(shape, pal) + (inf2 ? inf2.nf * inf2.nd : 4), x, y);
    x += 76;
    if (x > VW - 44) { x = 40; y += 74; }
  }

  x = 34; y += 58;
  for (const [shape, pal] of enemySpritePairs()) {
    const base = spriteBase(shape, pal);
    drawShadow(ctx, x, y);
    const inf = spriteInfo(shape, pal);
    const nd2 = inf ? inf.nd : 2;
    drawSprite(ctx, base + (frame % (inf ? inf.nf : 2)) * nd2 + (nd2 === 8 ? 0 : dir), x, y);
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
