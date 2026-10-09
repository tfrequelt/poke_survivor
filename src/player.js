// L3 -- may import L0-L2.
//
// The player entity: movement, health, i-frames, contact damage and levelling.

import { G } from './state.js';
import { moveAxis } from './input.js';
import { dist2, clampToBounds } from './util.js';
import { enemies, cellRange, cellStart, cellItems, GW } from './world.js';
import { damagePlayer, burnPlayer } from './combat.js';
import { STATUS } from './data/legends.js';
import { ensureStats } from './stats.js';
import { dirFromAngle } from './assets.js';
import { waterAtWorld, nearestLand, pondsActive } from './terrain.js';

/**
 * Can the current form cross water? Water types swim, flying types fly over it, and ghosts float
 * -- the Gastly line levitates. Read from the form, so evolving into Vaporeon grants it at once.
 */
export function canSwim() {
  const t = (G.form && G.form.types) || [];
  return t.includes('water') || t.includes('flying') || t.includes('ghost');
}

/** Per-enemy contact cooldown. Separate from player i-frames so a crowd cannot instagib. */
const CONTACT_CD = 0.5;

export function createPlayer(x = 0, y = 0) {
  return {
    x, y,
    vx: 0, vy: 0,
    r: 5,
    dir: 1,                // direction slot: 0/1 for a flipped sprite, 0-7 for a PMD sheet
    nd: 2,                 // how many direction slots this form's sprite actually has
    nf: 2,                 // frame count
    hp: 100, maxHp: 100,
    iframes: 0,
    moving: false,
    animTime: 0,
    frame: 0,
    sprBase: 0,
    // The shape actually drawn: the form's, or its `shiny_` sheet on a shiny run.
    sprShape: '',
    stillTime: 0,          // feeds Dartrix's "Tidy Feathers"
    regenAcc: 0,
    shieldT: 0,            // Protect Bubble -- blocks contact damage outright
    rootT: 0,              // Hyperbeam channel -- cannot move while firing
    // A one-shot attack animation, started by casting an ability. It overrides the walk frames
    // while it runs; `actT` counts UP so the renderer can index the real PMD frame durations.
    actT: 0,
    actDur: 0,
    // What a legendary's hits leave behind, in seconds remaining. See statusPlayer in combat.js.
    chillT: 0,
    paraT: 0,
    freezeT: 0,
    burnT: 0,
    burnTick: 0,
    // Silver Wing: `graceT` is the protected second running; it re-arms after `noContactT` seconds
    // clear of every enemy. Metal Coat: `barrier` blocks the next hit outright.
    graceT: 0,
    graceReady: true,
    noContactT: 0,
    barrier: false,
    // An overload's Speed Boost: seconds left and how much faster.
    hasteT: 0, hasteMul: 1,
  };
}

export function updatePlayer(dt) {
  const p = G.player;
  if (!p) return;
  const s = ensureStats();

  const axis = moveAxis();
  // Hyperbeam roots you while it channels -- that drawback is the whole point of the ability. A
  // freeze does the same from the outside.
  const rooted = p.rootT > 0 || p.freezeT > 0;
  const slowed = statusSlow(p);
  if (p.hasteT > 0) p.hasteT -= dt;
  const haste = p.hasteT > 0 ? p.hasteMul : 1;
  p.vx = rooted ? 0 : axis.x * s.moveSpeed * slowed * haste;
  p.vy = rooted ? 0 : axis.y * s.moveSpeed * slowed * haste;
  // Water stops anyone who cannot cross it. Each axis is tried on its own, so walking into a pond
  // at an angle slides you along its shore instead of sticking you to it.
  const dry = pondsActive() && !canSwim();
  const ox = p.x, oy = p.y;
  p.x += p.vx * dt;
  if (dry && waterAtWorld(p.x, p.y)) p.x = ox;
  p.y += p.vy * dt;
  if (dry && waterAtWorld(p.x, p.y)) p.y = oy;
  clampToBounds(p, G.bounds, p.r);
  // However you got there -- a shove, a pull, an evolution that took the ability away -- a
  // non-swimmer standing in water is put back on the nearest dry ground.
  if (dry && waterAtWorld(p.x, p.y)) {
    const l = nearestLand(p.x, p.y);
    p.x = l.x; p.y = l.y;
  }

  p.moving = !rooted && (axis.x !== 0 || axis.y !== 0);
  p.stillTime = p.moving ? 0 : p.stillTime + dt;

  if (p.moving) {
    // An 8-direction sheet uses the full heading; a flipped 2-frame sprite only cares about sign.
    if (p.nd === 8) p.dir = dirFromAngle(Math.atan2(axis.y, axis.x));
    else if (axis.x > 0) p.dir = 1;
    else if (axis.x < 0) p.dir = 0;
    p.animTime += dt;
    p.frame = ((p.animTime * 9) | 0) % p.nf;
  } else {
    // Standing still holds the first frame of the current facing, as PMD sprites do.
    p.animTime = 0;
    p.frame = 0;
  }

  // The attack animation runs on its own clock. It is deliberately advanced AFTER the walk
  // block above, which rewrites p.frame every tick and would otherwise fight it.
  if (p.actDur > 0) {
    p.actT += dt;
    if (p.actT >= p.actDur) { p.actT = 0; p.actDur = 0; }
  }

  if (p.iframes > 0) p.iframes -= dt;
  if (p.graceT > 0) p.graceT -= dt;
  tickStatuses(p, dt);

  // Regen is applied in whole points so the HUD never shows a fractional bar creeping.
  if (s.regen > 0 && p.hp < s.maxHp) {
    p.regenAcc += s.regen * dt;
    if (p.regenAcc >= 1) {
      const whole = Math.floor(p.regenAcc);
      p.regenAcc -= whole;
      p.hp = Math.min(s.maxHp, p.hp + whole);
    }
  }

  contactDamage(p, dt);

  if (p.hp <= 0 && !G.runOver) {
    // A Reviver Seed in the bag goes first: it is the one you can see you are carrying.
    if (bagRevive && bagRevive(p)) { clearStatuses(p); return; }
    // A revive bought from the Kecleon Shop spends itself here: back up at half health, with a
    // long mercy window so you are not immediately killed again by the crowd that did it.
    if (G.revivesLeft > 0) {
      G.revivesLeft--;
      p.hp = Math.max(1, Math.round(ensureStats().maxHp * 0.5));
      p.iframes = REVIVE_IFRAMES;
      clearStatuses(p);
      if (onRevive) onRevive(p, G.revivesLeft);
      return;
    }
    p.hp = 0;
    G.runOver = true;
    if (!G.endless) G.won = false;
  }
}

/** Speed multiplier from chill and paralysis. The stronger one wins; they do not stack. */
function statusSlow(p) {
  let slow = 0;
  if (p.chillT > 0) slow = STATUS.chill.slow;
  if (p.paraT > 0) slow = Math.max(slow, STATUS.para.slow);
  return 1 - slow;
}

/** Count the statuses down, and pay a burn out on the half second. */
function tickStatuses(p, dt) {
  if (p.chillT > 0) p.chillT -= dt;
  if (p.paraT > 0) p.paraT -= dt;
  if (p.freezeT > 0) p.freezeT -= dt;
  if (p.burnT > 0) {
    p.burnT -= dt;
    p.burnTick -= dt;
    if (p.burnTick <= 0) {
      p.burnTick = 0.5;
      burnPlayer(STATUS.burn.dps * 0.5);
    }
  } else {
    p.burnTick = 0;
  }
}

/** Clear every status. A revive and a new floor both start clean. */
export function clearStatuses(p) {
  p.chillT = 0; p.paraT = 0; p.freezeT = 0; p.burnT = 0; p.burnTick = 0;
}

/** Seconds of invulnerability after getting back up. Far longer than an ordinary hit's. */
export const REVIVE_IFRAMES = 2.5;

/** Set by main.js: a legendary's touch can carry a status (Raikou's Static). legends.js is L3 too. */
export let onLegendTouch = null;
export function setLegendTouch(fn) { onLegendTouch = fn; }

/** Set by main.js so getting up can shake the screen and say so, without importing upward. */
export let onRevive = null;
export function setReviveFx(fn) { onRevive = fn; }

/** bag.js's Reviver Seed check, plugged in by main.js: (player) -> true if it saved you. */
let bagRevive = null;
export function setBagRevive(fn) { bagRevive = fn; }

/**
 * Enemy -> player contact. One small grid query per tick rather than a scan of every enemy.
 * Each enemy carries its own cooldown so standing in a crowd deals steady damage rather than
 * one massive spike, and the player's i-frames then gate the overall rate.
 */
/** How long you must be clear of every enemy before the Silver Wing protects you again. */
const GRACE_REARM = 1.5;
/** How long the Silver Wing protects you, once contact begins. */
const GRACE_TIME = 1;

function contactDamage(p, dt) {
  const reach = p.r + 16;
  const range = cellRange(p.x, p.y, reach);
  const wing = G.relics.includes('articuno');
  let touching = false;
  if (!range) { graceTick(p, dt, wing, false); return; }

  for (let gy = range.y0; gy <= range.y1; gy++) {
    const rowBase = gy * GW;
    for (let gx = range.x0; gx <= range.x1; gx++) {
      const c = rowBase + gx;
      const end = cellStart[c + 1];
      for (let k = cellStart[c]; k < end; k++) {
        const e = enemies[cellItems[k]];
        // Something asleep does not bite, and nor does something charmed onto your side.
        if (!e.alive || e.harmless || e.sleep || e.charmT > 0) continue;
        const rr = p.r + e.r;
        const near = dist2(p.x, p.y, e.x, e.y) <= rr * rr;
        if (near) touching = true;
        if (e.contactCd > 0) { e.contactCd -= dt; continue; }
        if (!near) continue;
        // Silver Wing: the first second of contact does no harm.
        if (wing && (p.graceT > 0 || p.graceReady)) {
          if (p.graceReady) { p.graceReady = false; p.graceT = GRACE_TIME; }
          continue;
        }
        const dmg = (e.weakenT > 0 ? e.dmg * 0.7 : e.dmg) * (G.stats.contactMult || 1);
        if (damagePlayer(dmg)) {
          e.contactCd = CONTACT_CD;
          if (e.legend && onLegendTouch) onLegendTouch(e);
        }
      }
    }
  }
  graceTick(p, dt, wing, touching);
}

/** Re-arm the Silver Wing once you have been clear of every enemy for a moment. */
function graceTick(p, dt, wing, touching) {
  if (!wing) return;
  if (touching) { p.noContactT = 0; return; }
  p.noContactT += dt;
  if (p.noContactT >= GRACE_REARM && p.graceT <= 0) p.graceReady = true;
}

export function healPlayer(amount) {
  const p = G.player;
  if (!p) return;
  p.hp = Math.min(G.stats.maxHp, p.hp + amount);
}
