// L5 -- the composition root. The ONLY sequencer: no system calls another system's update().
// Cross-system effects travel through world.js queues and combat.js hooks, drained here in a
// fixed order, which is what keeps the module graph acyclic without a build step to enforce it.

import { G, MODES, SIM_MODES, setMode, resetRunState, winFrozen } from './state.js';
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
  drawSprite, drawShadow, drawText, drawTextCentered, drawLogo,
} from './sprites.js';
import {
  enemies, projectiles, orbs, coins, items, damageNumbers, particles, zones,
  spawn, despawn, clearWorld, rebuildGrid, sweepDead, entityCounts, spawnRequests, fxShapes,
  nextHitId, cellRange, cellStart, cellItems, GW, setDamageSource, requestSpawn,
} from './world.js';
import { initStats, ensureStats, addGrant, addMods, addMod, luckOf, luckK } from './stats.js';
import { loadSave, bankGold, bankTotal, rankOf, buyRank, resetProgress, saveData, persistSave } from './save.js';
import { SHOP_ITEMS, rankCost } from './data/shop.js';
import {
  hooks, damageEnemy, killAll, applyBurn, applyChill, resetDamageTally, damageBreakdown, damageCircle,
  damageSourceId, srcOvl,
} from './combat.js';
import {
  initOverloads, tickOverloads, resetOverloads, overloadHit, overloadKill, overloadExpire,
  overloadEvery, overloadDollDown, overloadDollTick, weaponEvolved, ovlFx,
} from './overload.js';
import {
  initBag, resetBag, bagAdd, bagUse, bagFull, bagRevive, rollBagItem, updateBuffs, bagFx,
} from './bag.js';
import { BAG_BY_ID, BAG_BY_KIND } from './data/bagitems.js';
import {
  placeTotems, relocateTotems, resetTotems, updateTotems, fortuneOffer, pickBlessings, totemHooks,
  trialRing,
} from './totems.js';
import { CURSE, BLESSING_BY_ID } from './data/totems.js';
import { addBuff } from './bag.js';
import { getDamageSource } from './world.js';
import { lastEffect } from './combat.js';
import {
  checkCloseCall, checkKaboom, checkDeath, claimSuccess, successState,
  claimableCount, resetRunSuccesses, successHooks, updateToast, legendsBeaten, checkLegendary,
  unlockSuccess, unlockIf, bumpStat, recordKey, flushRecords,
} from './successes.js';
import { SUCCESSES } from './data/successes.js';
import { createPlayer, updatePlayer, setReviveFx, setLegendTouch, clearStatuses, setBagRevive } from './player.js';
import { initEnemyDefs, updateEnemies, spawnEnemy, ringPoint, resetAttacks, aiIndex } from './enemies.js';
import {
  legend, hazards, fx as legendFx, beginLegend, clearLegend, endLegend, updateLegend,
  legendEnemyDef, legendTouched,
} from './legends.js';
import {
  legendFor, LEGEND_BY_ID, LEGEND_IDS, PORTAL_CHANCE, PORTAL_WINDOW, SECRET_ARENA,
  RELICS, relicSpritePairs,
} from './data/legends.js';
import { ENEMIES } from './data/enemies.js';
import { ENEMY_BY_ID, BOSS_TIERS } from './data/enemies.js';
import {
  initWeaponDefs, addWeapon, updateWeapons, updateProjectiles, motionIndex, setWeaponFx,
  evolveWeapon, setWeaponSfx, updateDecoys, ovlHooks, motionOf, levelWeapon,
} from './weapons.js';
import {
  initAbilityDefs, addAbility, fireAbility, updateAbilities, updateZones, fx as abilityFx,
  abilityStats,
} from './abilities.js';
import { abilitySpritePairs } from './data/abilities.js';
import { FX, fxSprites } from './fx.js';
import {
  TRAP_KEYS, trapDef, updateTraps, resetTraps, fx as trapFx, trapCount,
} from './traps.js';

// Chance an ordinary kill drops a pickup at FULL luck, per kill. Small on purpose: a run kills
// thousands of things, so a tenth of a percent is already a pickup every few seconds.
const LUCKY_DROP = 0.004;
import {
  STAIRS_AT, MAX_FLOOR, floorReward, floorBonus, floorLabel, stairsShape, endlessBonus,
} from './floors.js';
import {
  initPickupSprites, initItemSprites, dropXp, dropCoin, updatePickups,
  updateItems, dropPickup, dropRandomPickup, magnetAll, itemEffects, itemSpritePairs, orbSpritePairs,
  KIND_KEYS,
} from './pickups.js';
import {
  grantXp, grantCoins, initForm, xpToNext, rollOffers, takeOffer, grantBlessing,
  rerollOffers, banishOffer, skipOffer, resetPicks, pendingEvolution, applyEvolution,
} from './progress.js';
import { updateDirector, resetDirector, catchUpSchedule, stressSpawn, rollStageEnemy } from './director.js';
import { updateProps, resetProps, clearProp } from './props.js';
import { drawEntities, setStairsSprite, setHostileSprite, setTrapSprites, setTotemSprites } from './entities.js';
import { drawHud, debugLines } from './hud.js';
import { buildAutotiles } from './autotile.js';
import { waterAtWorld, nearestLand } from './terrain.js';
import {
  ui, drawLevelUp, drawPause, drawTitle, drawSelect, drawStageSelect, drawEvolution, drawEvolutionChoice,
  EVO_TOTAL, setBallSprite, drawCredits, creditsMax, drawSettings, settingsRows,
  drawSummary, drawShop, shopRows, drawWheel,
 drawVictoryChoice, drawSuccesses, TITLE_MENU, drawDungeonText,} from './ui.js';
import { wheel, startWheel, updateWheel, chooseSwap } from './wheel.js';
import { CHARACTERS, CHARACTER_BY_ID, characterSpritePairs } from './data/characters.js';
import { enemySpritePairs } from './data/enemies.js';
import { weaponSpritePairs } from './data/weapons.js';
import { STAGE_BY_ID, STAGES, propSpritePairs } from './data/stages.js';
import {
  loadAssets, pickMusic, getSheet, sfxFiles, sfxGains, getAttack, loadLegendAnims, unloadLegendAnims,
} from './assets.js';
import {
  initAudio, audioReady, sfx, playTrack, playOnce, setIntensity, stopTrack,
  setVolume, toggleMute, settings as audioSettings, TITLE, ROUTE, BOSS, FANFARE,
  playMusicFile, musicFilePlaying, setMusicFallback, setMusicAdvance, currentMusicUrl, setSfxFiles,
  sampleDuration, duckMusic, stopMusicFile, playJingle, stopJingle,
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
  // Cut the autotile sheets (forest, beach) now that their images are in.
  buildAutotiles();
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
  for (const [shape, pal, fb] of relicSpritePairs()) registerSprite(shape, pal, 0, fb);
  for (const [shape, pal] of orbSpritePairs()) registerSprite(shape, pal);
  registerSprite('coin', 'gold');
  registerSprite('pokeball', 'crab');
  // Both flights, always: which one a stage uses is decided per stage, and the atlas has room.
  // `orb` is the fallback shape, as for the other tiles cut out of items.png -- there are no
  // drawn stairs, so a missing items.png must degrade to a blob rather than fail the boot.
  registerSprite('stairs_down', 'rock', 0, 'orb');
  registerSprite('stairs_up', 'rock', 0, 'orb');
  // Enemy shots. A palette no weapon draws in, so an incoming shot is never mistaken for one of
  // the player's in a crowded frame.
  registerSprite('proj_bubble', 'fire');
  for (const k of TRAP_KEYS) registerSprite('trap_' + k, 'rock', 0, 'orb');
  for (const k of ['blessing', 'trial', 'fortune']) registerSprite('totem_' + k, 'gold', 0, 'orb');
  for (const k of ['grass', 'cave', 'beach', 'none']) registerSprite('ribbon_' + k, 'gold', 0, 'orb');
  for (let i = 0; i < 9; i++) registerSprite('rank_' + i, 'gold', 0, 'orb');
  registerSprite('rank_lock', 'gold', 0, 'orb');
  atlasStats = buildAtlas();

  initEnemyDefs();
  initWeaponDefs();
  initOverloads(motionOf);
  initBag(motionOf);
  initAbilityDefs(motionIndex('homing'));
  // Frame ids for the shared effect art, so the renderers never look anything up by name.
  fxSprites.bolt = spriteBase('fx_bolt', 'thunder');
  fxSprites.wisp = spriteBase('fx_wisp', 'shadowy');
  fxSprites.rubble = spriteBase('fx_rubble', 'earth');
  fxSprites.leafblade = spriteBase('fx_leafblade', 'leafblade');
  fxSprites.leafbladeDirs = spriteDirs('fx_leafblade', 'leafblade');
  initPickupSprites();
  initItemSprites();
  for (const id of Object.keys(RELICS)) {
    const spr = spriteBase(RELICS[id].shape, 'gold');
    relicSpr[id] = spr;
    relicBySpr.set(spr, id);
  }
  setHostileSprite(spriteBase('proj_bubble', 'fire'));
  setTrapSprites(Object.fromEntries(TRAP_KEYS.map((k) => [k, spriteBase('trap_' + k, 'rock')])));
  setTotemSprites(Object.fromEntries(['blessing', 'trial', 'fortune'].map((k) => [k, spriteBase('totem_' + k, 'gold')])));
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
      // The floor machinery, so a probe can assert placement and the schedule without having
      // to sit through fifteen minutes of run time to see one staircase.
      placeStairs: () => placeStairs(),
      updateStairs: () => updateStairs(),
      resetStairSchedule: () => { stairsSpawned = {}; },
      rebuild: () => rebuildGrid(),
      breakdown: () => damageBreakdown(),
      menuCursor: () => titleCursor,
      startRunForTest: (charId, stageId) => startRun(CHARACTER_BY_ID[charId], bootParams, stageId),
      bankRunGold: () => bankRunGold(),
      takeStairs: () => { G.stairs.near = true; beginDescent(); },
      // Open a portal beside the player and walk into it, optionally to a chosen legendary.
      fight: (id) => {
        secretOverride = id || null;
        G.portal.x = G.player.x; G.portal.y = G.player.y;
        G.portal.active = true; G.portal.back = false; G.portal.near = true;
        beginPortal();
      },
      takePortal: () => { G.portal.near = true; beginPortal(); },
      legend: () => legend,
      relic: (id) => grantRelic(id),
      hazards: () => hazards,
      portalAt: () => portalAt,
      floor: () => ({ floor: G.floor, label: floorLabel(), stairs: { ...G.stairs } }),
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
  hooks.onDamage = (e, dealt, crit, eff) => {
    popDamage(e.x, e.y - 12, dealt, crit, eff);
    if (eff > 1.05 && G.trk && ++G.trk.superHits === 2000) unlockSuccess('super_effective');
    if (e.elite && dealt >= e.maxHp) unlockSuccess('one_punch');
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
      if (G.rngRun() < d.pickupChance * (1 + luckOf())) dropRandomPickup(e.x, e.y);
      burst(e.x, e.y, 8, '#c8c0ad');
      return;
    }
    G.kills++;
    if (lastEffect > 1.05 && G.trk) G.trk.superKOs++;
    // An overload's on-kill effect, if the blow came from an overloaded weapon.
    const orec = srcOvl[getDamageSource()];
    if (orec !== undefined) overloadKill(e, orec);

    // Credit the kill to the ability cast that caused it, if one did. The damage source is set
    // for everything an ability does and stamped onto what it leaves behind, so pools, rings and
    // burns from the cast all count to it.
    const src = getDamageSource();
    if (src) {
      for (const a of G.abilities) {
        if (a && a.srcId === src) { a.castKills++; checkKaboom(a.castKills); break; }
      }
    }

    if (e.legend) { legendDefeated(e); return; }
    if (e.boss) { bossDrops(e); return; }

    dropXp(e.x, e.y, e.xp);
    if (G.relics.includes('entei')) fireStone(e);
    if (e.coinChance > 0 && G.rngRun() < e.coinChance * (1 + luckOf())) {
      dropCoin(e.x, e.y, Math.round((G.rngRun() < 0.15 ? 5 : 1) * floorReward()));
    }
    // Luck's most visible effect: an ordinary kill can leave something worth walking to. Zero
    // at zero luck, so this only ever exists for a build that went looking for it.
    if (LUCKY_DROP > 0 && G.rngRun() < LUCKY_DROP * luckK()) dropRandomPickup(e.x, e.y);
    // Elites always leave something worth walking to.
    if (e.elite) {
      dropPickup(e.x, e.y, 'elixir');
      if (G.rngRun() < 0.6) dropPickup(e.x + 12, e.y, BAG_BY_ID[rollBagItem()].kind);
    }
    burst(e.x, e.y, e.elite ? 10 : 5, e.elite ? '#ffd166' : '#ffffff');
    sfx('kill');
  };
  successHooks.onUnlock = () => sfx('levelup');
  hooks.onPlayerHit = () => {
    if (G.trk) G.trk.hitThisFloor = true;
    checkCloseCall(G.player);
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
  abilityFx.boom = (x, y, r, life) => pushFx(FX.BOOM, x, y, r, 0, '#ffffff', life);
  // A sprung trap, whoever set it off. The shake only fires for the player's own mistakes --
  // the screen lurching every time something in the crowd steps on a tile would be unreadable.
  trapFx.abilityCooldown = (a) => abilityStats(a).cooldown;
  // The legendary's feedback, for the same reason as the traps': legends.js reaches nothing upward.
  legendFx.shake = addShake;
  legendFx.sfx = (id) => sfx(id);
  legendFx.banner = (text, sub, t) => { G.banner = { text, sub, t }; };
  legendFx.burst = burst;
  setLegendTouch(legendTouched);
  trapFx.sprung = (t, byPlayer) => {
    const def = trapDef(t.kind);
    if (byPlayer && G.trk) G.trk.traps++;
    if (byPlayer && t.kind === 'wonder') bumpStat('wonderTiles');
    sfx(t.kind === 'explosion' ? 'quake' : 'hit');
    burst(t.x, t.y, t.kind === 'explosion' ? 16 : 8, t.kind === 'poison' ? '#b070d0' : '#ffd166');
    if (def.radius) pushFx(FX.RING, t.x, t.y, def.radius, 0, '#ff9f6b', 0.3);
    if (byPlayer) {
      addShake(t.kind === 'explosion' ? 0.5 : 0.25);
      G.banner.text = def.label;
      G.banner.sub = '';
      G.banner.t = 1.1;
    }
  };
  abilityFx.dart = (x, y, angle, len, life) => pushFx(FX.DART, x, y, len, angle, '#ffffff', life);
  abilityFx.fireburst = (x, y, r, life) => pushFx(FX.FIREBURST, x, y, r, 0, '#ffffff', life);
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

  // Overloads: their hit hook, the weapon-side hooks, and the effects they draw with.
  hooks.onHit = overloadHit;
  ovlHooks.expire = overloadExpire;
  ovlHooks.every = overloadEvery;
  ovlHooks.dollDown = overloadDollDown;
  ovlHooks.dollTick = overloadDollTick;
  ovlFx.arc = (x0, y0, x1, y1, color) =>
    pushFx(1, x0, y0, Math.hypot(x1 - x0, y1 - y0), Math.atan2(y1 - y0, x1 - x0), color, 0.16, 2);
  ovlFx.ring = (x, y, r, color, life) => pushFx(FX.RING, x, y, r, 0, color, life);
  ovlFx.burst = (x, y, n, color) => burst(x, y, n, color);
  ovlFx.bolt = (x, y, height, life) =>
    pushFx(FX.BOLT, x, y, height, 0, '#fff05a', life, 0, (G.rngFx() * 65535) | 0);
  ovlFx.shake = addShake;
  ovlFx.banner = (text, sub) => {
    G.banner = { text, sub, t: 2.6 };
    sfx('evolve');
  };

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
    if (G.trk) G.trk.healed = true;
    const p = G.player;
    if (p) p.hp = Math.min(G.stats.maxHp, p.hp + Math.round(G.stats.maxHp * 0.3));
  };
  itemEffects.bomb = () => {
    killAll(0);
    addShake(0.9);
    G.hitstop = 0.08;
  };
  itemEffects.elixir = () => {
    // The elixir is the weapon-evolution trigger, and pays out gold either way.
    const evolved = tryEvolveWeapon();
    grantCoins(20 + ((G.rngRun() * 20) | 0));
    if (!evolved) G.pendingLevelUps++;
  };
  itemEffects.relic = (it) => grantRelic(relicBySpr.get(it.sprId));
  itemEffects.bag = (it, kind) => bagAdd(BAG_BY_KIND[kind].id);
  itemEffects.chest = () => openChest();
  totemHooks.blessing = () => { pendingBlessing = true; };
  totemHooks.grantBlessing = (id) => {
    if (grantBlessing(id)) G.banner = { text: `BLESSING: ${BLESSING_BY_ID[id].name.toUpperCase()}`, sub: BLESSING_BY_ID[id].desc.toUpperCase(), t: 2.6 };
  };
  totemHooks.spawnTrial = (t) => {
    // Three elites around the totem, and an escort of ordinary stage enemies further out.
    for (const pt of trialRing(t, 3, 110, _ring)) {
      const def = rollStageEnemy(G.rngRun);
      if (def) requestSpawn(def.id, pt.x, pt.y, { elite: true, trial: t.id });
    }
    for (const pt of trialRing(t, 12, 170, _ring)) {
      const def = rollStageEnemy(G.rngRun);
      if (def) requestSpawn(def.id, pt.x, pt.y, null);
    }
    addShake(0.3);
  };
  totemHooks.chest = (x, y) => dropPickup(x, y, 'chest');
  totemHooks.bagItem = (x, y) => dropPickup(x, y, BAG_BY_ID[rollBagItem()].kind);
  totemHooks.curse = () => {
    addBuff('curse', CURSE.name, CURSE.secs, CURSE.mods, '#ff4a4a', true);
    G.banner = { text: 'CURSED!', sub: 'SLOWER, AND HURT HARDER, FOR A MINUTE', t: 2.4 };
    sfx('hurt');
  };
  totemHooks.coins = (n) => grantCoins(n);
  totemHooks.banner = (text, sub) => { G.banner = { text, sub, t: 2.4 }; };
  totemHooks.ring = (x, y, r, color, life) => pushFx(FX.RING, x, y, r, 0, color, life);
  totemHooks.burst = (x, y, n, color) => burst(x, y, n, color);
  totemHooks.sfx = sfx;
  totemHooks.woke = (what) => {
    const t = G.trk;
    if (!t) return;
    if (what === 'blessing' || what === 'trial' || what === 'fortune') {
      t.totemKinds.add(what);
      unlockIf('shrine_keeper', t.totemKinds.size >= 3);
    } else if (what === 'trial_won') {
      bumpStat('trialsWon');
    } else if (what === 'fortune_curse') {
      t.cursed = true;
    } else if (what.startsWith('fortune_')) {
      t.fortuneWins++;
      unlockIf('high_roller', t.fortuneWins >= 3 && !t.cursed);
    }
  };
  trapFx.summon = (x, y) => {
    const p = G.player;
    for (let i = 0; i < 7; i++) {
      const a = (i / 7) * Math.PI * 2;
      const def = rollStageEnemy(G.rngRun);
      if (def) requestSpawn(def.id, p.x + Math.cos(a) * 70, p.y + Math.sin(a) * 70, null);
    }
    burst(x, y, 16, '#ff8a5a');
  };
  trapFx.pitfall = () => forceDescent();
  trapFx.wonder = () => {
    const p = G.player;
    if (!p) return;
    clearStatuses(p);
    ensureStats();
    p.hp = Math.min(G.stats.maxHp, p.hp + Math.round(G.stats.maxHp * 0.15));
    addBuff('wonder', 'WONDER', 15, [
      { stat: 'power', op: 'inc', value: 0.2 }, { stat: 'moveSpeed', op: 'inc', value: 0.2 },
    ], '#7fe08a');
    burst(p.x, p.y, 24, '#7fe08a');
    sfx('levelup');
  };
  trapFx.sealed = (w) => { G.banner = { text: `${w.def.name.toUpperCase()} IS SEALED!`, sub: 'IT CANNOT FIRE FOR 8 SECONDS', t: 2 }; };
  itemEffects.rollBag = () => BAG_BY_ID[rollBagItem()].kind;
  setBagRevive(bagRevive);
  bagFx.burst = (x, y, n, color) => burst(x, y, n, color);
  bagFx.ring = (x, y, r, color, life) => pushFx(FX.RING, x, y, r, 0, color, life);
  bagFx.banner = (text, sub) => { G.banner = { text, sub, t: 1.8 }; };
  bagFx.sfx = sfx;
  bagFx.descend = forceDescent;
  bagFx.used = (id) => {
    bumpStat('bagUsed');
    if (id === 'oran_berry' && G.trk) G.trk.healed = true;
  };
  bagFx.revived = (p) => {
    killAll(130);
    addShake(0.8);
    burst(p.x, p.y, 30, '#ffd166');
    sfx('levelup');
    G.banner = { text: 'REVIVER SEED!', sub: 'BACK ON YOUR FEET', t: 2.2 };
  };
  bagFx.warped = (x0, y0, x1, y1) => {
    burst(x0, y0, 20, '#7af0e8');
    burst(x1, y1, 20, '#7af0e8');
    pushFx(FX.RING, x1, y1, 30, 0, '#7af0e8', 0.4);
    snapCamera(x1, y1);
  };
  itemEffects.onCollect = (kind, label) => {
    sfx('pickup');
    if (kind === 'relic' || kind === 'chest') return;   // each has its own, longer banner
    G.banner.text = label;
    G.banner.sub = '';
    G.banner.t = 1.6;
  };
  hooks.onBarrier = () => {
    const p = G.player;
    sfx('move_shield');
    if (p) burst(p.x, p.y - 8, 12, '#e8eef8');
    relicT.barrier = BARRIER_RECHARGE;
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
    const oldSrc = w.srcId;
    if (evolveWeapon(w)) {
      // An overloaded weapon carries its overload into the evolved form.
      weaponEvolved(w, oldSrc);
      G.banner.text = `${w.def.name.toUpperCase()} EVOLVED!`;
      G.banner.sub = '';
      G.banner.t = 2.6;
      addShake(0.5);
      return true;
    }
  }
  return false;
}

/**
 * The stage a restart should land on: the one being played, not the one the URL booted with.
 *
 * Without this, startRun falls through to ?stage= and then to 'grass', so restarting a cave run
 * kept the Pokemon and quietly changed the stage.
 */
const currentStageId = () => (G.stage ? G.stage.id : null);

function startRun(character, q, stageId) {
  stopJingle(0.15);
  clearWorld();
  resetRunState();
  resetDirector();
  resetProps();
  resetTraps();
  resetAttacks();
  resetDamageTally();
  resetRunSuccesses();
  resetOverloads();
  // Perks from claimed Expedition Records, read once per run.
  G.perks = { ...saveData().perks };
  resetBag(G.perks.bag4 ? 4 : 3);
  if (G.perks.start_oran) bagAdd('oran_berry');
  if (G.perks.start_reviver) bagAdd('reviver_seed');
  // What this run has done toward the records. Counted here, judged at the moment each one can be.
  G.trk = {
    hitThisFloor: false, superHits: 0, superKOs: 0, traps: 0, healed: false,
    totemKinds: new Set(), fortuneWins: 0, cursed: false, ribbon: false,
  };
  stairsSpawned = {};
  descent = null;
  leaveLegendBehind();
  relicT.plume = PLUME_EVERY; relicT.zap = ZAP_EVERY; relicT.frost = 0; relicT.barrier = 0;

  const id = stageId || (q && q.get('stage')) || 'grass';
  G.stage = STAGE_BY_ID[id] || STAGES[0];
  // The arena is centred on the origin, which is also where the player starts.
  G.bounds = arenaBounds(G.stage.arena);

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
  placeTotems();

  G.rerolls = shopCharges('rerolls') + (G.perks.reroll1 ? 1 : 0);
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

  // Which flight of stairs this stage draws is fixed for the run, so it is resolved here rather
  // than looked up by name every frame.
  setStairsSprite(spriteBase(stairsShape(G.stage), 'rock'));

  snapCamera(0, 0);
  rollPortal();
  setMode(MODES.PLAYING);
  resetAccumulator();
  setIntensity(0);
  startMusic(G.stage.id, ROUTE);
}

/** A centred arena's bounds, or null for an open stage. */
const arenaBounds = (a) => (a ? { minX: -a.w / 2, minY: -a.h / 2, maxX: a.w / 2, maxY: a.h / 2 } : null);

/** The stage as the secret floor draws it: the same ground, in the secret floor's small room. */
let _secretStage = null;
function secretStage() {
  // `water: false`: the secret room is an arena, and stays dry.
  if (!_secretStage || _secretStage.id !== G.stage.id) _secretStage = { ...G.stage, arena: SECRET_ARENA, water: false };
  return _secretStage;
}

/**
 * Keep playing past the 20:00 boss.
 *
 * The win is already secured -- G.won was set when the boss died, and the floor bonus is gated
 * on it -- so this cannot lose anything that has been earned. Banking is simply deferred: the
 * one line at the end of stepSim that banks on death now also carries the endless gold.
 */
function startEndless() {
  stopJingle();
  G.endless = true;
  G.victoryT = 0;
  G.banner = { text: 'THE DUNGEON DOES NOT END', sub: 'BOSSES EVERY TWO MINUTES', t: 3 };
  setMode(MODES.PLAYING);
  resetAccumulator();
  startMusic(G.stage.id, ROUTE);
}

// --- Floors -----------------------------------------------------------------

// How close the player has to be to read the prompt and take the stairs. Generous relative to
// the 24px tile: hunting for the exact pixel is not the interesting part.
const STAIRS_REACH = 18;
// The stairs transition: fade to black, hold black for two seconds while the stage name and the
// new floor fade in and back out, then fade back in on the new floor.
const FADE_OUT = 0.45, FADE_HOLD = 2.0, FADE_IN = 0.45;
const FADE_TOTAL = FADE_OUT + FADE_HOLD + FADE_IN;
// The title card's own fades, measured from the start of the black hold. Inset from both ends so
// the text is never on screen while the field is still showing through.
const CARD_IN_START = 0.05, CARD_IN = 0.4, CARD_OUT_END = FADE_HOLD - 0.05, CARD_OUT = 0.4;

/** Non-null only during the fade between floors. */
let descent = null;

/**
 * Put a staircase somewhere the player cannot see it appear.
 *
 * Rejection sampling rather than a ring at a fixed radius: a ring would put the stairs a
 * predictable distance away every time, and near the arena wall it would clamp back into view.
 * Arenas are 2880-3840px against a 640x360 view, so a uniform sample inside the bounds clears
 * the camera on the first try almost every time.
 */
function placeStairs() {
  placeAway(G.stairs, G.portal.active ? G.portal : null);
}

/**
 * Put `o` (the stairs, or the portal) somewhere off-screen, and well clear of `avoid` -- two
 * things on the same tile would put two prompts under one Enter key.
 */
function placeAway(o, avoid) {
  const b = G.bounds, p = G.player;
  if (!b || !p) return;
  const padX = VW / 2 + 48, padY = VH / 2 + 48;

  for (let i = 0; i < 40; i++) {
    const x = b.minX + 64 + G.rngRun() * (b.maxX - b.minX - 128);
    const y = b.minY + 64 + G.rngRun() * (b.maxY - b.minY - 128);
    if (Math.abs(x - p.x) < padX && Math.abs(y - p.y) < padY) continue;
    if (avoid && Math.abs(x - avoid.x) < 96 && Math.abs(y - avoid.y) < 96) continue;
    if (waterAtWorld(x, y)) continue;                  // stairs in a pond would be unreachable
    o.x = x; o.y = y;
    o.active = true;
    o.near = false;
    return;
  }
  // Cornered in a small arena: fall back to a point on the despawn ring, which is already off
  // screen in every direction.
  const pt = ringPoint(p.x, p.y, G.rngRun() * Math.PI * 2, 520, G.rngRun);
  const land = nearestLand(pt.x, pt.y);
  o.x = land.x; o.y = land.y;
  o.active = true;
  o.near = false;
}

/**
 * Spawn a staircase on schedule, and tell the HUD when the player is standing on one.
 *
 * The schedule is gated on there not already being one rather than on the mark alone: a
 * staircase the player never found at 5:00 is still there at 10:00 instead of being joined by a
 * second one, and the field never holds two.
 */
function updateStairs() {
  const p = G.player;
  if (!p) return;

  // A mark is spent when it PASSES, not when it manages to place something. Spending it only on
  // a successful placement means a player who leaves the 5:00 staircase standing until 16:00
  // still has the 10:00 and 15:00 marks unspent -- so taking it late would hand them two more
  // staircases back to back and the full depth bonus for four minutes of work.
  for (const t of STAIRS_AT) {
    if (G.runTime < t || stairsSpawned[t]) continue;
    stairsSpawned[t] = true;
    if (!G.stairs.active && G.floor < MAX_FLOOR && !G.won && !G.runOver) placeStairs();
  }
  G.stairs.near = G.stairs.active &&
    Math.abs(p.x - G.stairs.x) < STAIRS_REACH && Math.abs(p.y - G.stairs.y) < STAIRS_REACH;
}

/**
 * A bag slot's key. Standing on a bag item with a full bag, it swaps: the slot's item goes down
 * where you stand and the one on the ground goes in. Otherwise it uses the slot.
 */
function bagKey(i) {
  const it = G.bagOver;
  if (it && it.alive && bagFull()) {
    const kind = KIND_KEYS[it.kind];
    const def = BAG_BY_KIND[kind];
    const old = G.bag[i];
    G.bag[i] = def.id;
    const idx = items.indexOf(it);
    if (idx >= 0) despawn('items', items, idx);
    if (old) dropPickup(G.player.x, G.player.y + 14, BAG_BY_ID[old].kind);
    G.bagOver = null;
    sfx('pickup');
    G.banner = { text: def.name.toUpperCase(), sub: old ? `SWAPPED FOR ${BAG_BY_ID[old].name.toUpperCase()}` : '', t: 1.6 };
    return;
  }
  bagUse(i);
}

// Scratch for the trial's spawn ring.
const _ring = [];

/** Which marks have already produced a staircase this run. Reset with the run. */
let stairsSpawned = {};

/**
 * Straight down to the next floor, with no staircase: the Escape Orb, and the Pitfall trap. The
 * same fade and floor change as the stairs. False when there is nowhere to go.
 */
function forceDescent() {
  if (descent || G.won || G.runOver || G.secret || G.floor >= MAX_FLOOR) return false;
  descent = { t: 0, swapped: false, kind: 'stairs' };
  G.stairs.active = false;
  G.stairs.near = false;
  sfx('stairs');
  setMode(MODES.STAIRS);
  return true;
}

function beginDescent() {
  if (descent || !G.stairs.active || !G.stairs.near) return;
  // Not once the run is decided. The mode is still PLAYING through the victory beat while the
  // boss's payout flies in, so a player who happened to be standing on a staircase when the boss
  // died could otherwise press Enter and wipe the reward they just earned.
  if (G.won || G.runOver) return;
  descent = { t: 0, swapped: false, kind: 'stairs' };
  G.stairs.active = false;
  G.stairs.near = false;
  sfx('stairs');
  setMode(MODES.STAIRS);
}

/**
 * The floor change itself, at the darkest point of the fade.
 *
 * A PARTIAL reset, and deliberately not startRun: the level, the build, the clock and the gold
 * are the whole reason taking the stairs is a decision rather than a restart. What goes is the
 * field -- every enemy, every uncollected orb and coin, and the scenery -- which is the real
 * cost, since anything left on the floor above is left for good.
 *
 * The director is NOT reset. Its mini-boss and boss schedule runs off the global clock, so
 * resetting it here would fire the 5:00 and 10:00 mini-bosses again on every new floor.
 */
function swapFloor() {
  // Taken the way down without a scratch on this floor.
  unlockIf('untouchable', G.trk && !G.trk.hitThisFloor);
  if (G.trk) G.trk.hitThisFloor = false;
  clearWorld();
  resetProps();
  // A new floor is new ground: the traps you already found do not come with you.
  resetTraps();
  G.lumFloor = false;
  G.floor++;
  if (G.floor >= 4) {
    recordKey('deep', G.stage.id);
    unlockIf('speed_explorer', G.runTime < 16 * 60);
  }

  const p = G.player;
  p.x = 0; p.y = 0;
  p.vx = 0; p.vy = 0;
  p.knockX = 0; p.knockY = 0;
  // A moment of mercy on arrival, so the first thing that wanders in cannot punish a fade the
  // player could not act during.
  p.iframes = Math.max(p.iframes, 1.2);
  snapCamera(0, 0);
  placeTotems();

  G.banner.text = `${floorLabel()}`;
  G.banner.sub = 'THE AIR FEELS HEAVIER';
  G.banner.t = 2.4;
  // A new floor is a new roll for a portal.
  rollPortal();
}

function updateDescent(dt) {
  if (!descent) return;
  descent.t += dt;
  if (!descent.swapped && descent.t >= FADE_OUT) {
    descent.swapped = true;
    if (descent.kind === 'secret') enterSecret();
    else if (descent.kind === 'return') leaveSecret();
    else swapFloor();
  }
  if (descent.t >= FADE_TOTAL) {
    const kind = descent.kind;
    descent = null;
    setMode(MODES.PLAYING);
    resetAccumulator();
    // The music changes as the screen comes back, not in the dark: the boss's theme starts as
    // the boss appears, and the stage's comes back with the stage.
    if (kind === 'secret') startLegendFight();
    else if (kind === 'return') startMusic(G.stage.id, ROUTE);
  }
}

// --- Relics -----------------------------------------------------------------------------------
//
// What the legendaries leave behind. Kept for the run, shown in their own HUD row, and none of
// them takes an item slot. The stat ones (Hard Stone, Thunder Crystal, Mystic Water) are ordinary
// modifiers added once; the rest act on a clock here, or at the one moment they care about (the
// Silver Wing in player.js, the Metal Coat in combat.js, the Fire Stone on a kill).

/** relic id -> atlas frame, and back. Filled at boot. */
const relicSpr = {};
const relicBySpr = new Map();

const PLUME_EVERY = 5, ZAP_EVERY = 4, BARRIER_RECHARGE = 12;
const relicT = { plume: PLUME_EVERY, zap: ZAP_EVERY, frost: 0, barrier: 0 };
let RELIC_SRC = 0;
let fireStoneBursts = 0;

function grantRelic(id) {
  const r = RELICS[id];
  if (!r || G.relics.includes(id)) return;
  G.relics.push(id);
  unlockIf('relic_hunter', G.relics.length >= 3);
  if (id === 'regirock') addMod('armor', 'flat', 3, 'relic');
  if (id === 'raikou') addMod('moveSpeed', 'inc', 0.15, 'relic');
  if (id === 'suicune') addMod('regen', 'flat', 0.6, 'relic');
  if (id === 'registeel' && G.player) G.player.barrier = true;
  G.banner = { text: r.name.toUpperCase(), sub: r.desc.toUpperCase(), t: 3 };
  sfx('levelup');
}

/** Relic power grows with the run, like everything else the player deals. */
const relicDamage = (base, perLevel) => (base + perLevel * G.level) * ((G.stats && G.stats.power) || 1);

function updateRelics(dt) {
  const p = G.player;
  if (!p || !G.relics.length) return;
  fireStoneBursts = 0;
  setDamageSource(RELIC_SRC || (RELIC_SRC = damageSourceId('relics', 'Relics')));

  // Flame Plume: a burst of fire at your feet.
  if (G.relics.includes('moltres')) {
    relicT.plume -= dt;
    if (relicT.plume <= 0) {
      relicT.plume = PLUME_EVERY;
      damageCircle(p.x, p.y, 56, relicDamage(18, 3), nextHitId());
      pushFx(FX.BOOM, p.x, p.y, 56, 0, '#ffffff', 0.4);
      sfx('move_fire');
    }
  }
  // Zap Plume: lightning on the nearest enemy in reach.
  if (G.relics.includes('zapdos')) {
    relicT.zap -= dt;
    if (relicT.zap <= 0) {
      const e = nearestFoe(p.x, p.y, 220);
      if (e) {
        relicT.zap = ZAP_EVERY;
        damageEnemy(e, relicDamage(30, 5), 0, 0, true);
        pushFx(FX.BOLT, e.x, e.y, 110, 0, '#fff05a', 0.4, 0, (G.rngFx() * 65535) | 0);
        sfx('move_thunder');
      } else {
        relicT.zap = 0.3;                   // nothing in reach: look again shortly
      }
    }
  }
  // Never-Melt Ice: the cold around you slows whatever comes close.
  if (G.relics.includes('regice')) {
    relicT.frost -= dt;
    if (relicT.frost <= 0) {
      relicT.frost = 0.25;
      chillAround(p.x, p.y, 70, 0.35, 0.5);
    }
  }
  // Metal Coat: the barrier comes back a while after it breaks.
  if (G.relics.includes('registeel') && !p.barrier) {
    relicT.barrier -= dt;
    if (relicT.barrier <= 0) { p.barrier = true; sfx('move_shield'); }
  }
  setDamageSource(0);
}

/** Fire Stone: a quarter of kills go up in flames, hurting what stood next to them. */
function fireStone(e) {
  // Capped per tick: one explosion killing the next and the next could otherwise clear a screen
  // in a single frame, which is a different relic.
  if (fireStoneBursts >= 6 || G.rngRun() >= 0.25) return;
  fireStoneBursts++;
  const prev = getDamageSource();
  setDamageSource(RELIC_SRC || (RELIC_SRC = damageSourceId('relics', 'Relics')));
  pushFx(FX.BOOM, e.x, e.y, 42, 0, '#ffffff', 0.35);
  damageCircle(e.x, e.y, 42, relicDamage(15, 3), nextHitId());
  setDamageSource(prev);
}

/** The nearest live, non-scenery enemy within `range`, or null. A grid query, not a scan. */
function nearestFoe(x, y, range) {
  const r = cellRange(x, y, range);
  if (!r) return null;
  let best = null, bd = range * range;
  for (let gy = r.y0; gy <= r.y1; gy++) {
    for (let gx = r.x0; gx <= r.x1; gx++) {
      const c = gy * GW + gx;
      for (let k = cellStart[c]; k < cellStart[c + 1]; k++) {
        const e = enemies[cellItems[k]];
        if (!e || !e.alive || e.prop) continue;
        const d = (e.x - x) * (e.x - x) + (e.y - y) * (e.y - y);
        if (d < bd) { bd = d; best = e; }
      }
    }
  }
  return best;
}

function chillAround(x, y, radius, slow, secs) {
  const r = cellRange(x, y, radius);
  if (!r) return;
  const rr = radius * radius;
  for (let gy = r.y0; gy <= r.y1; gy++) {
    for (let gx = r.x0; gx <= r.x1; gx++) {
      const c = gy * GW + gx;
      for (let k = cellStart[c]; k < cellStart[c + 1]; k++) {
        const e = enemies[cellItems[k]];
        if (!e || !e.alive) continue;
        if ((e.x - x) * (e.x - x) + (e.y - y) * (e.y - y) <= rr) applyChill(e, slow, secs);
      }
    }
  }
}

// --- Secret floors ----------------------------------------------------------------------------
//
// One roll per floor, on arrival: a portal opens at a random moment later on that floor, or it
// does not. It lasts until the floor is left. Inside is a room with one legendary in it and
// nothing else; beating it pays out and reopens the portal, which leads back to the same floor
// on fresh ground. The run clock stands still the whole time you are in there.

const PORTAL_REACH = 20;
/** When this floor's portal opens, in run time; -1 if it will not. */
let portalAt = -1;
/** The legendary behind the portal, from the moment it is entered until you are back out. */
let secretDef = null;
let secretHadStairs = false;
/** Clock time the way back opens after the boss falls, and where. */
let portalBackAt = -1;
const portalBackSpot = { x: 0, y: 0 };
/** Debug: fight this one next, whatever the stage and floor would have picked. */
let secretOverride = null;

function rollPortal() {
  portalAt = -1;
  G.portal.active = false;
  G.portal.near = false;
  G.portal.back = false;
  if (!G.stage || G.won || !legendFor(G.stage.id, G.floor)) return;
  // ?portal forces one, a few seconds in, so a portal can be tested without forty runs.
  const forced = bootParams && bootParams.has('portal');
  if (!forced && G.rngRun() >= PORTAL_CHANCE) return;
  const [a, b] = forced ? [3, 3] : PORTAL_WINDOW;
  portalAt = G.runTime + a + G.rngRun() * (b - a);
}

function updatePortal() {
  const p = G.player;
  if (!p) return;
  if (!G.secret && portalAt >= 0 && G.runTime >= portalAt && !G.won && !G.runOver) {
    portalAt = -1;
    // A forced portal (?portal) is for testing, so it opens where you can see it.
    if (bootParams && bootParams.has('portal')) portalBeside();
    else placeAway(G.portal, G.stairs.active ? G.stairs : null);
    G.portal.back = false;
    G.banner = { text: 'A STRANGE PORTAL HAS OPENED', sub: 'SOMEWHERE ON THIS FLOOR', t: 2.6 };
    sfx('move_ghost');
  }
  if (G.secret && portalBackAt >= 0 && G.clock >= portalBackAt) {
    portalBackAt = -1;
    G.portal.x = portalBackSpot.x;
    G.portal.y = portalBackSpot.y;
    G.portal.active = true;
    G.portal.back = true;
    // Everything the boss dropped comes to you: the fight is the reward, not the walk after it.
    magnetAll();
    sfx('move_ghost');
  }
  G.portal.near = G.portal.active &&
    Math.abs(p.x - G.portal.x) < PORTAL_REACH && Math.abs(p.y - G.portal.y) < PORTAL_REACH;
}

function beginPortal() {
  if (descent || !G.portal.active || !G.portal.near || G.runOver) return;
  const back = G.portal.back;
  if (!back) {
    if (G.won) return;
    secretDef = (secretOverride && LEGEND_BY_ID[secretOverride]) || testLegend();
    secretOverride = null;
    if (!secretDef) return;
    // Its sheets load in the dark: they are big, and most runs never need them at all.
    loadLegendAnims(secretDef.id, `assets/sprites/${secretDef.id}`, ['Walk', ...secretDef.anims]);
    // The floor's music stops at the threshold. The boss brings its own.
    stopMusicFile(0.6);
  }
  descent = { t: 0, swapped: false, kind: back ? 'return' : 'secret' };
  G.portal.active = false;
  G.portal.near = false;
  sfx('stairs');
  setMode(MODES.STAIRS);
}

/** Put the portal a few steps to the player's right, inside the room. */
function portalBeside() {
  const p = G.player, b = G.bounds;
  G.portal.x = b ? clamp(p.x + 48, b.minX + 40, b.maxX - 40) : p.x + 48;
  G.portal.y = p.y;
  G.portal.active = true;
  G.portal.near = false;
}

/**
 * The legendary a portal leads to. Normally the stage's trio member for this floor; `?boss=<id>`
 * overrides it for testing, and a debug portal opened on a floor with no legendary (4F) falls
 * back to the trio's last.
 */
function testLegend() {
  const forced = bootParams && LEGEND_BY_ID[bootParams.get('boss')];
  if (forced) return forced;
  return legendFor(G.stage.id, G.floor) || legendFor(G.stage.id, 3);
}

/** Debug key O: a portal right beside you, now, whatever the floor and the odds. */
function debugPortal() {
  if (G.secret || G.won || !G.player || descent) return;
  portalAt = -1;
  portalBeside();
  G.portal.back = false;
  G.banner = { text: 'DEBUG PORTAL', sub: (testLegend() || { name: '?' }).name.toUpperCase(), t: 1.6 };
}

/** Into the secret floor, at the darkest point of the fade. */
function enterSecret() {
  const def = secretDef;
  clearWorld();
  resetTraps();
  secretHadStairs = G.stairs.active;
  G.stairs.active = false;
  G.stairs.near = false;
  G.secret = true;
  G.bounds = arenaBounds(SECRET_ARENA);

  const p = G.player;
  p.x = 0; p.y = 100;
  p.vx = 0; p.vy = 0;
  p.iframes = Math.max(p.iframes, 1.2);
  clearStatuses(p);
  snapCamera(p.x, p.y);

  const e = spawnEnemy(legendEnemyDef(def, aiIndex('scripted')), 0, -20);
  if (e) beginLegend(def, e);
}

/** The screen is back: the boss arrives, and so does its theme. */
function startLegendFight() {
  const def = legend.def;
  if (!def) return;
  startMusic(def.music, BOSS);
  G.banner = { text: def.name.toUpperCase(), sub: def.title, t: 2.8 };
}

/** Back to the floor the portal was on -- the same floor number, on fresh ground. */
function leaveSecret() {
  leaveLegendBehind();
  clearWorld();
  resetProps();
  resetTraps();
  G.bounds = arenaBounds(G.stage.arena);

  const p = G.player;
  p.x = 0; p.y = 0;
  p.vx = 0; p.vy = 0;
  p.iframes = Math.max(p.iframes, 1.2);
  clearStatuses(p);
  snapCamera(0, 0);
  // Stairs that had already appeared are still yours to take; the floor is new, the find is not.
  if (secretHadStairs) placeStairs();
  secretHadStairs = false;
  relocateTotems();
  G.banner = { text: floorLabel(), sub: 'BACK FROM THE SECRET FLOOR', t: 2.4 };
}

/** Drop the legendary's fight state and free its sheets. Safe to call when there is none. */
function leaveLegendBehind() {
  clearLegend();
  if (secretDef) unloadLegendAnims(secretDef.id);
  secretDef = null;
  portalBackAt = -1;
  G.secret = false;
  G.portal.active = false;
  G.portal.near = false;
  G.portal.back = false;
}

/**
 * The legendary is down. Its theme fades, everything it had in the air goes with it, and it pays
 * out like nothing else in the game: three Elixirs, a Sitrus Berry, a flood of experience and a
 * pile of gold. Then the portal reopens where it fell.
 */
function legendDefeated(e) {
  const def = legend.def;
  unlockIf('prodigy', G.level <= 30);
  endLegend();
  stopMusicFile(2.5);

  for (let i = 0; i < 3; i++) dropPickup(e.x + (i - 1) * 24, e.y + 14, 'elixir');
  dropPickup(e.x, e.y - 20, 'berry');
  // Its relic, unless this run already carries one (a debug portal can repeat a boss).
  if (!G.relics.includes(def.id)) {
    const relic = dropPickup(e.x, e.y + 34, 'relic');
    if (relic) relic.sprId = relicSpr[def.id];
  } else {
    dropPickup(e.x, e.y + 34, 'elixir');
  }
  const xp = xpToNext(G.level) * 3;
  const orbsN = 36;
  scatter(e.x, e.y, orbsN, 80, (x, y) => dropXp(x, y, Math.max(1, Math.round(xp / orbsN))));
  scatter(e.x, e.y, 30, 70, (x, y) => dropCoin(x, y, Math.round((6 + G.rngRun() * 8) * floorReward())));
  burst(e.x, e.y, 40, def.color);
  addShake(0.9);
  sfx('kill');
  sfx('levelup');

  const s = saveData();
  s.legends[def.id] = 1;
  persistSave();
  const n = legendsBeaten();
  checkLegendary();
  G.banner = { text: `${def.name.toUpperCase()} FAINTED!`, sub: `LEGENDARY ${n} / ${LEGEND_IDS.length}`, t: 3 };

  const b = G.bounds;
  portalBackSpot.x = b ? clamp(e.x, b.minX + 48, b.maxX - 48) : e.x;
  portalBackSpot.y = b ? clamp(e.y, b.minY + 48, b.maxY - 48) : e.y;
  portalBackAt = G.clock + 2.2;
}

/** 0 while the field is visible, 1 at the darkest point. Read by the renderer. */
export function descentFade() {
  if (!descent) return 0;
  if (descent.t < FADE_OUT) return descent.t / FADE_OUT;
  if (descent.t < FADE_OUT + FADE_HOLD) return 1;
  return Math.max(0, 1 - (descent.t - FADE_OUT - FADE_HOLD) / FADE_IN);
}

/** The label to show on the black, or '' -- only once the floor has actually changed. */
export const descentLabel = () => (descent && descent.swapped ? floorLabel() : '');

/** Which transition is playing: 'stairs', 'secret' or 'return'. */
const descentKind = () => (descent ? descent.kind : '');

/** How visible the title card is, 0..1. Zero outside the black hold. */
function cardAlpha() {
  if (!descent || !descent.swapped) return 0;
  const h = descent.t - FADE_OUT;                      // time into the black hold
  if (h < CARD_IN_START || h > CARD_OUT_END) return 0;
  const fin = Math.min(1, (h - CARD_IN_START) / CARD_IN);
  const fout = Math.min(1, (CARD_OUT_END - h) / CARD_OUT);
  return Math.max(0, Math.min(fin, fout));
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
  // Backspace is the back key everywhere (see input.js for why it is not Escape). Translated
  // once, here, so every screen's existing back handling accepts it -- including cancelling a
  // rebind, which is why it is done before the settings screen sees the key.
  if (code === 'Backspace') code = 'Escape';
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

  if (G.mode === MODES.TITLE) return titleKey(code);
  if (G.mode === MODES.SUCCESSES) return successesKey(code);
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
  if (G.mode === MODES.STAIRS) return;                    // the fade swallows everything
  if (G.mode === MODES.VICTORY) {
    // Taking the win is the default and the safe key; continuing is a deliberate second choice.
    if (code === 'Digit2' || code === 'KeyE') return startEndless();
    if (code === 'Enter' || code === 'Space' || code === 'Digit1') return openSummary();
    return;
  }

  if (isAction(code, 'restart')) return startRun(G.character, bootParams, currentStageId());
  // The ability keys are live during play, so "back to partner select" only applies once the run
  // is already stopped.
  if (isAction(code, 'ability1') && (G.runOver || G.mode === MODES.PAUSED)) return toSelect();
  if (G.mode === MODES.PAUSED && code === 'KeyO') return openSettings();
  if (G.runOver) return;
  if (isAction(code, 'pause')) return togglePause();

  if (G.mode === MODES.PLAYING) {
    // Enter is otherwise unbound during play, so the staircase can own it outright rather than
    // sharing a key with something the player might mean instead.
    if (code === 'Enter' && G.stairs.near) return beginDescent();
    if (code === 'Enter' && G.portal.near) return beginPortal();
    if (code === 'Enter' && G.fortuneNear) return void fortuneOffer();
    if (isAction(code, 'ability1')) return void castAbility(0);
    if (isAction(code, 'ability2')) return void castAbility(1);
    for (let i = 0; i < 4; i++) {
      if (i < G.bag.length && isAction(code, `item${i + 1}`)) return void bagKey(i);
    }
  }

  if (!G.debug.on) return;
  switch (code) {
    case 'KeyH': G.debug.showHitboxes = !G.debug.showHitboxes; break;
    case 'KeyG': G.debug.godmode = !G.debug.godmode; break;
    case 'KeyK': stressSpawn(100); break;
    case 'KeyL': G.level++; G.xpNext = xpToNext(G.level); G.pendingLevelUps++; break;
    case 'KeyT': G.runTime += 60; catchUpSchedule(); break;
    case 'KeyO': debugPortal(); break;
    case 'BracketRight': G.debug.timescale = Math.min(8, G.debug.timescale * 2); break;
    case 'BracketLeft': G.debug.timescale = Math.max(0.25, G.debug.timescale / 2); break;
  }
}

// --- Main menu --------------------------------------------------------------
//
// The title screen used to be "press any key" with a footer of letter shortcuts, so the shop,
// options and credits were reachable only by reading the footer. It is a menu now. The letter
// shortcuts are gone because they collided with it: menuCode maps WASD onto the arrows, so S was
// both "down" and "open the shop".

/** Kept across visits, so backing out of a window lands on the entry that opened it. */
let titleCursor = 0;
let successCursor = 0;

function titleKey(code) {
  code = menuCode(code);
  const n = TITLE_MENU.length;
  if (code === 'ArrowUp') { titleCursor = (titleCursor + n - 1) % n; sfx('select'); return; }
  if (code === 'ArrowDown') { titleCursor = (titleCursor + 1) % n; sfx('select'); return; }
  if (code !== 'Enter' && code !== 'Space') return;
  switch (TITLE_MENU[titleCursor].id) {
    case 'play': ui.cursor = 0; setMode(MODES.SELECT); sfx('confirm'); break;
    case 'successes': openSuccesses(); break;
    case 'shop': openShop(); break;
    case 'options': openSettings(); break;
    case 'credits': ui.scroll = 0; setMode(MODES.CREDITS); sfx('select'); break;
  }
}

function openSuccesses() {
  // Land on the first reward waiting to be claimed, if there is one -- that is why you came.
  const i = SUCCESSES.findIndex((s) => successState(s.id) === 'unlocked');
  successCursor = i >= 0 ? i : 0;
  setMode(MODES.SUCCESSES);
  sfx('select');
}

/** Two columns: left/right step one card, up/down a whole row. */
function successesKey(code) {
  code = menuCode(code);
  const n = SUCCESSES.length;
  switch (code) {
    case 'ArrowLeft': successCursor = Math.max(0, successCursor - 1); break;
    case 'ArrowRight': successCursor = Math.min(n - 1, successCursor + 1); break;
    case 'ArrowUp': successCursor = Math.max(0, successCursor - 2); break;
    case 'ArrowDown': successCursor = Math.min(n - 1, successCursor + 2); break;
    case 'Enter': case 'Space': {
      const got = claimSuccess(SUCCESSES[successCursor].id);
      sfx(got > 0 ? 'levelup' : 'select');
      break;
    }
    case 'Escape': case 'Backspace': setMode(MODES.TITLE); sfx('select'); break;
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
    // The list runs down the side of the map, so up and down are the natural keys; left and
    // right still step through it for anyone who learned the old row of cards.
    case 'ArrowUp': case 'ArrowLeft': ui.cursor = (ui.cursor + n - 1) % n; sfx('select'); break;
    case 'ArrowDown': case 'ArrowRight': ui.cursor = (ui.cursor + 1) % n; sfx('select'); break;
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
  fireShot: 'quake', firePit: 'quake', pierceLine: 'shoot_grass', shadowOrb: 'shoot_bolt',
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
    case 'restart':
      saveSettings(); setMode(MODES.PLAYING);
      startRun(G.character, bootParams, currentStageId());
      break;
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
    if (G.mode === MODES.PLAYING && G.secret) {
      if (legend.active && legend.state !== 'dead') startMusic(legend.def.music, BOSS);
    } else if (G.mode === MODES.PLAYING && G.stage) startMusic(G.stage.id, ROUTE);
    else startMusic('menu', TITLE);
  }
  if (G.mode === MODES.EVOLVING) updateEvolution(rawDt);
  if (G.mode === MODES.STAIRS) updateDescent(rawDt);
  updateToast(rawDt);
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
  tickOverloads();
  updateBuffs(dt);
  if ((G.tick % 60) === 0) {
    unlockIf('full_house', G.bag.filter(Boolean).length >= 3 && G.passives.length >= 6
      && G.weapons.filter((w) => w.ovl).length >= 4);
  }
  G.clock += dt;
  // The run clock stands still on a secret floor: the schedule waits for you to come back.
  if (!G.secret) G.runTime += dt;

  // A secret floor has its one legendary and nothing else: no spawns, no scenery, no schedule.
  if (!G.secret) {
    updateDirector(dt);
    updateProps();
  }
  drainBossQueue();
  if (!G.secret) updateTotems(dt);
  drainSpawnRequests();

  // The grid stores INDICES into the enemies array, so it is rebuilt twice: once now, because
  // last tick's sweep swap-popped the array and left the old indices dangling, and again after
  // movement so that combat queries see where enemies actually are.
  rebuildGrid();
  // Before the enemies move: the legendary's velocity is decided here and applied there.
  updateLegend(dt);
  updateEnemies(dt, !heavyLoad || (sepTick++ & 1) === 0);
  rebuildGrid();

  updateWeapons(dt);
  updateDecoys(dt);
  updateAbilities(dt);
  updateZones(dt);
  updateProjectiles(dt);
  updatePlayer(dt);
  updateRelics(dt);
  updatePickups(dt, (v) => { grantXp(v); sfx('xp'); }, (v) => { grantCoins(v); sfx('coin'); });
  updateItems(dt);
  if (!G.secret) {
    updateTraps(dt);
    updateStairs();
  }
  updatePortal();
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
  // Not on the tick you die, either: an orb collected on that same frame would otherwise open a
  // card screen over the death panel.
  if (G.pendingLevelUps > 0 && G.mode === MODES.PLAYING && !winFrozen() && !G.runOver) openLevelUp();

  // Same reason and the same place: the tick that collected the present has to finish before
  // anything freezes the world.
  if (pendingBlessing && G.mode === MODES.PLAYING && !winFrozen() && !G.runOver) {
    pendingBlessing = false;
    openBlessing();
  }
  if (G.pendingWheel && G.mode === MODES.PLAYING && !winFrozen() && !G.runOver) {
    G.pendingWheel = false;
    openWheel();
  }

  // The victory beat: the world keeps ticking so the boss's payout flies in and is counted,
  // then the summary takes over.
  if (G.victoryT > 0) {
    G.victoryT -= dt;
    // The run is won either way by the time this lands; the only question left is whether to
    // stop. Endless runs are already endless -- their bosses do not re-open this.
    if (G.victoryT <= 0) {
      if (G.endless) setMode(MODES.PLAYING);
      else { setMode(MODES.VICTORY); playResult('mission_success'); }
    }
  }
  // Death banks here rather than in player.js, so every way a run can end goes through one line.
  if (G.runOver && !G.banked) { checkDeath(); bankRunGold(); playResult('mission_failed'); }
}

/**
 * The run has ended, one way or the other: the stage's music stops and the result's jingle plays
 * in its place. Leaving for the menus lets it finish (their music comes in after it); starting a
 * run, or carrying on into endless, cuts it.
 */
function playResult(id) {
  stopMusicFile(0.5);
  playJingle(id);
}

/**
 * The run is won: the records that can only be judged at the end, the stage, and the ribbon for
 * this partner on this stage.
 */
function recordWin() {
  const t = G.trk;
  unlockIf('lone_wolf', G.weapons.length === 1);
  if (t) {
    unlockIf('trap_dancer', t.traps >= 15);
    unlockIf('iron_stomach', !t.healed);
  }
  recordKey('won', G.stage.id);
  if (recordKey('ribbons', `${G.character.id}:${G.stage.id}`) && t) t.ribbon = true;
}

/** Bank the run's gold, exactly once, however the run ended. */
function bankRunGold() {
  if (G.banked) return 0;
  G.banked = true;
  // The run's share of the cross-run counters, written once.
  if (G.trk && G.trk.superKOs) { bumpStat('superKOs', G.trk.superKOs); G.trk.superKOs = 0; }
  flushRecords();
  // The depth bonus is paid for FINISHING down there, not for visiting: dying on the bottom
  // floor banks the gold that was actually collected and nothing more.
  return bankGold(G.coins + (G.won ? floorBonus() + endlessBonus() : 0));
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

let pendingBlessing = false;

/** A Blessing totem's draft: three blessings not yet taken, on the level-up screen. */
function openBlessing() {
  const picks = pickBlessings(3);
  if (!picks.length) { grantCoins(150); G.banner = { text: 'EVERY BLESSING IS YOURS', sub: '+150 GOLD INSTEAD', t: 2.4 }; return; }
  G.offers = picks.map((b) => ({ kind: 'blessing', id: b.id, name: b.name, desc: b.desc, level: 1, max: 0 }));
  sfx('levelup');
  ui.cursor = 0;
  ui.banishArm = false;
  setMode(MODES.LEVELUP);
  resetAccumulator();
}

/**
 * A trial won: a treasure chest, Vampire Survivors-style. One, three or five upgrades -- luck
 * leans toward the bigger hauls -- each a level on one of your weapons, or gold once they are all
 * at their last level.
 */
function openChest() {
  const luck = luckOf();
  const r = G.rngRun();
  let n = r < 0.1 + luck * 0.15 ? 5 : r < 0.4 + luck * 0.25 ? 3 : 1;
  if (G.perks && G.perks.chest_plus && n < 3) n = 3;
  const got = [];
  for (let i = 0; i < n; i++) {
    const open = G.weapons.filter((w) => w.level < w.def.levels.length);
    if (open.length) {
      const w = open[(G.rngRun() * open.length) | 0];
      levelWeapon(w);
      got.push(`${w.def.name.toUpperCase()} LV${w.level}`);
    } else {
      grantCoins(60);
      got.push('+60 GOLD');
    }
  }
  const p = G.player;
  if (p && G.rngRun() < 0.5) dropPickup(p.x + 16, p.y, BAG_BY_ID[rollBagItem()].kind);
  if (p) { burst(p.x, p.y, 34, '#ffd166'); pushFx(FX.RING, p.x, p.y, 60, 0, '#ffd166', 0.5); }
  addShake(0.4);
  sfx('evolve');
  G.banner = { text: `TREASURE CHEST  x${n}`, sub: got.slice(0, 3).join('   ') + (got.length > 3 ? '   ...' : ''), t: 3.4 };
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
  //
  // The stage's own list first. Species are exclusive to one stage now, so a global line-up
  // would have the beach fighting a Graveler that never otherwise sets foot there.
  const table = (G.stage && G.stage.bosses) || BOSS_TIERS;
  let def = ENEMY_BY_ID[table[Math.min(table.length - 1, tier - 1)]];
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

function popDamage(x, y, value, crit, eff = 1) {
  const d = spawn('damageNumbers');
  if (!d) return;
  d.x = x + (G.rngFx() - 0.5) * 6;
  d.y = y;
  d.vy = -26;
  d.life = 0.55;
  d.value = value;
  d.text = '';
  d.crit = crit;
  // A matchup shows in the number: orange when it is super effective, grey when it is not.
  d.color = crit ? 'gold' : eff > 1.05 ? 'orange' : eff < 0.95 ? 'dim' : 'white';
  // And now and then out loud, throttled so a crowd being shredded does not wallpaper the screen.
  if (eff > 1.05 && G.clock - calloutAt.super > 1.6) { calloutAt.super = G.clock; popText(x, y - 10, 'SUPER EFFECTIVE!', 'orange'); }
  else if (eff < 0.95 && G.clock - calloutAt.weak > 4) { calloutAt.weak = G.clock; popText(x, y - 10, 'NOT VERY EFFECTIVE...', 'dim'); }
}

const calloutAt = { super: -99, weak: -99 };

/** A floating word rather than a number, through the same pool. */
function popText(x, y, text, color) {
  const d = spawn('damageNumbers');
  if (!d) return;
  d.x = x; d.y = y;
  d.vy = -16;
  d.life = 0.9;
  d.value = 0;
  d.text = text;
  d.crit = false;
  d.color = color;
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
  dropPickup(e.x, e.y, tier >= 3 ? 'elixir' : 'berry');
  dropPickup(e.x - 14, e.y, BAG_BY_ID[rollBagItem()].kind);
  burst(e.x, e.y, 26, '#ffd166');
  addShake(0.7);
  sfx('kill');

  // The 20:00 boss is the win condition. Everything still on the field dies with it and all of
  // it -- the boss's own payout included -- is pulled in, so the run's last seconds are a
  // victory lap rather than a scramble over loot that then gets thrown away.
  if (tier >= 4 && G.won && G.endless) {
    // A boss felled after the win. Worth gold, and worth saying so.
    G.endlessBosses++;
    unlockIf('endless_hero', G.endlessBosses >= 10);
    G.banner = { text: `BOSS ${G.endlessBosses} DOWN`, sub: `+${endlessBonus()} BONUS GOLD`, t: 2.4 };
  }
  if (tier >= 4 && !G.won) {
    G.won = true;
    recordWin();
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

/**
 * The fade between floors, drawn over everything including the HUD.
 *
 * Over the HUD on purpose: a black screen with a health bar still floating on it is not a black
 * screen, and the point of the fade is that the player cannot see or act on the swap.
 *
 * The new floor's name appears once the swap has happened, so the label on the black is the
 * floor being arrived at rather than the one being left.
 */
function drawDescent() {
  const k = descentFade();
  if (k <= 0) return;
  ctx.fillStyle = `rgba(0,0,0,${k.toFixed(3)})`;
  ctx.fillRect(0, 0, VW, VH);

  // The title card: the stage's name, and under it the floor being entered -- in the Mystery
  // Dungeon font, the way the DS games announce a new floor.
  const a = cardAlpha();
  // Going in, the card says only where you are going -- the boss is the surprise.
  if (a > 0 && descentKind() === 'secret') {
    if (!drawDungeonText('Secret floor', VW / 2, VH / 2 - 12, a)) {
      ctx.globalAlpha = a;
      drawTextCentered(ctx, 'SECRET FLOOR', VW / 2, VH / 2 - 4, 'white');
      ctx.globalAlpha = 1;
    }
  } else if (a > 0 && G.stage) {
    const name = G.stage.name, floor = descentLabel();
    if (!drawDungeonText(name, VW / 2, VH / 2 - 26, a) || !drawDungeonText(floor, VW / 2, VH / 2 + 2, a)) {
      // No font sheet: the same card in the built-in font.
      ctx.globalAlpha = a;
      drawTextCentered(ctx, name.toUpperCase(), VW / 2, VH / 2 - 14, 'white');
      drawTextCentered(ctx, floor, VW / 2, VH / 2 + 2, 'white');
      ctx.globalAlpha = 1;
    }
  }
}

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
      G.mode === MODES.STAGE_SELECT || G.mode === MODES.CREDITS || G.mode === MODES.SUMMARY ||
      G.mode === MODES.SUCCESSES) {
    if (G.mode === MODES.CREDITS) drawCredits();
    else if (G.mode === MODES.SUCCESSES) drawSuccesses(successCursor);
    else if (G.mode === MODES.SUMMARY) drawSummary();
    else if (G.mode === MODES.SHOP) drawShop();
    else if (G.mode === MODES.TITLE) drawTitle(CHARACTERS, menuTime, titleCursor, claimableCount());
    else if (G.mode === MODES.STAGE_SELECT) drawStageSelect(STAGES, pendingCharacter, menuTime);
    else drawSelect(CHARACTERS, menuTime);
    present();
    if (G.debug.on) drawDebugOverlay([`mode ${G.mode}   1-${CHARACTERS.length} / ARROWS + ENTER`]);
    return;
  }

  drawBackground(G.secret ? secretStage() : G.stage);
  // The secret floor is the same ground, in a much smaller room, and darker -- it should not
  // look like anywhere you have been.
  if (G.secret) {
    ctx.fillStyle = 'rgba(18,6,40,0.38)';
    ctx.fillRect(0, 0, VW, VH);
  }
  drawEntities();

  if (G.debug.showHitboxes) drawHitboxes();

  drawHud();

  if (G.mode === MODES.LEVELUP) drawLevelUp();
  else if (G.mode === MODES.EVOLVING) drawEvolution(evo);
  else if (G.mode === MODES.EVOLVE_CHOICE) drawEvolutionChoice(evo.branches);
  else if (G.mode === MODES.WHEEL) drawWheel();
  else if (G.mode === MODES.PAUSED) drawPause();
  else if (G.mode === MODES.SETTINGS) drawSettings(true);
  else if (G.mode === MODES.VICTORY) drawVictoryChoice();

  drawDescent();

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
