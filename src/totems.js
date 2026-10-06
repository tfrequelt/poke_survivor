// L3 -- may import L0-L2.
//
// Totems: two to a floor, woken by standing in their ring. See data/totems.js for what each kind
// does. This file owns where they stand and what state they are in; everything a totem does to the
// rest of the game -- a blessing draft, a trial's elites, a chest, a curse -- goes out through
// totemHooks, plugged in by main.js, because those all belong to systems on this same layer.

import { G } from './state.js';
import { dist2, TAU } from './util.js';
import { enemies } from './world.js';
import { waterAtWorld } from './terrain.js';
import { luckOf } from './stats.js';
import {
  TOTEM_KINDS, TOTEM_KEYS, WAKE_SECS, RING_R, TRIAL_SECS, FORTUNE_MIN, FORTUNE_USES, BLESSINGS,
} from './data/totems.js';

export const totemHooks = {
  blessing: null,      // () -- open a blessing draft
  grantBlessing: null, // (id) -- a blessing, given outright
  spawnTrial: null,    // (totem) -- the trial's elites and their escort
  chest: null,         // (x, y) -- a trial won
  bagItem: null,       // (x, y) -- a bag item, dropped
  curse: null,         // () -- a Fortune totem's bad luck
  coins: null,         // (n) -- gold back
  banner: null,        // (text, sub)
  ring: null,          // (x, y, r, color, life)
  burst: null,         // (x, y, n, color)
  sfx: null,           // (id)
  woke: null,          // (kind) -- for the success tallies
};

/** Faster with the Expedition perk. */
export const wakeSecs = () => WAKE_SECS * (G.perks && G.perks.totem_fast ? 0.7 : 1);

export function resetTotems() {
  G.totems = [];
  G.totemPressure = false;
  G.fortuneNear = null;
}

/** Stand two totems, of two different kinds, somewhere away from you on this floor. */
export function placeTotems() {
  resetTotems();
  if (G.secret || !G.bounds) return;
  const kinds = TOTEM_KEYS.slice();
  for (let i = 0; i < 2; i++) {
    const k = kinds.splice((G.rngRun() * kinds.length) | 0, 1)[0];
    const t = { id: i, kind: k, x: 0, y: 0, charge: 0, state: 'idle', t: 0, uses: 0, near: false };
    if (!spot(t)) continue;
    G.totems.push(t);
  }
}

/**
 * Back from a secret floor onto fresh ground: the same totems, standing somewhere new. A trial
 * that was running is lost -- its elites were left behind with the old ground, and a trial cannot
 * be won by walking away from it.
 */
export function relocateTotems() {
  for (const t of G.totems) {
    spot(t);
    if (t.state === 'trial') t.state = 'crumbled';
  }
}

function spot(t) {
  const b = G.bounds, p = G.player;
  if (!b || !p) return false;
  for (let k = 0; k < 80; k++) {
    const x = b.minX + 90 + G.rngRun() * (b.maxX - b.minX - 180);
    const y = b.minY + 90 + G.rngRun() * (b.maxY - b.minY - 180);
    if (dist2(x, y, p.x, p.y) < 380 * 380) continue;
    if (G.totems.some((o) => o !== t && dist2(x, y, o.x, o.y) < 420 * 420)) continue;
    if (waterAtWorld(x, y) || waterAtWorld(x, y - 20)) continue;
    // Kept off the stairs and the portal, so a prompt is never about two things at once.
    if (G.stairs.active && dist2(x, y, G.stairs.x, G.stairs.y) < 90 * 90) continue;
    t.x = x; t.y = y;
    return true;
  }
  return false;
}

/** The blessings not yet taken this run, shuffled, up to `n`. */
export function pickBlessings(n) {
  const left = BLESSINGS.filter((b) => !G.blessings.includes(b.id));
  const out = [];
  while (out.length < n && left.length) out.push(left.splice((G.rngRun() * left.length) | 0, 1)[0]);
  return out;
}

export function updateTotems(dt) {
  G.totemPressure = false;
  G.fortuneNear = null;
  if (G.secret || !G.player) return;
  const p = G.player;
  const wake = wakeSecs();
  for (const t of G.totems) {
    const inRing = dist2(p.x, p.y, t.x, t.y) < RING_R * RING_R;
    t.near = inRing;
    if (t.state === 'idle') {
      if (inRing) {
        t.charge = Math.min(1, t.charge + dt / wake);
        // The crowd comes in harder while you stand at a totem. Waking one is a fight.
        G.totemPressure = true;
      } else {
        t.charge = Math.max(0, t.charge - dt / (wake * 2));
      }
      if (t.charge >= 1) awaken(t);
    } else if (t.state === 'trial') {
      t.t -= dt;
      let left = 0;
      for (let i = 0; i < enemies.length; i++) {
        const e = enemies[i];
        if (e.alive && e.trial === t.id && e.elite) left++;
      }
      t.uses = left;
      if (left === 0) {
        t.state = 'done';
        if (totemHooks.chest) totemHooks.chest(t.x, t.y + 18);
        if (totemHooks.banner) totemHooks.banner('TRIAL COMPLETE', 'A TREASURE CHEST APPEARS');
        if (totemHooks.ring) totemHooks.ring(t.x, t.y, 70, TOTEM_KINDS.trial.color, 0.5);
        if (totemHooks.woke) totemHooks.woke('trial_won');
      } else if (t.t <= 0) {
        t.state = 'crumbled';
        for (let i = 0; i < enemies.length; i++) if (enemies[i].trial === t.id) enemies[i].trial = -1;
        if (totemHooks.banner) totemHooks.banner('THE TRIAL IS LOST', 'THE TOTEM CRUMBLES');
        if (totemHooks.burst) totemHooks.burst(t.x, t.y - 20, 20, '#8a8070');
      }
    } else if (t.state === 'awake' && t.kind === 'fortune' && inRing) {
      G.fortuneNear = t;
    }
  }
}

function awaken(t) {
  const def = TOTEM_KINDS[t.kind];
  if (totemHooks.ring) totemHooks.ring(t.x, t.y, RING_R + 10, def.color, 0.5);
  if (totemHooks.burst) totemHooks.burst(t.x, t.y - 24, 24, def.color);
  if (totemHooks.sfx) totemHooks.sfx('evolve');
  if (totemHooks.woke) totemHooks.woke(t.kind);
  if (t.kind === 'blessing') {
    t.state = 'done';
    if (totemHooks.blessing) totemHooks.blessing();
  } else if (t.kind === 'trial') {
    t.state = 'trial';
    t.t = TRIAL_SECS;
    if (totemHooks.spawnTrial) totemHooks.spawnTrial(t);
    if (totemHooks.banner) totemHooks.banner('THE TRIAL BEGINS', `DEFEAT THE THREE ELITES IN ${TRIAL_SECS} SECONDS`);
  } else {
    t.state = 'awake';
    t.uses = 0;
    if (totemHooks.banner) totemHooks.banner('FORTUNE TOTEM', 'PRESS ENTER IN ITS RING TO MAKE AN OFFERING');
  }
}

/** What the next offering at this Fortune totem costs. */
export const fortuneCost = (t) => Math.round(Math.max(FORTUNE_MIN, G.coins * 0.25) * (1 + 0.5 * t.uses));

/**
 * Make an offering at the Fortune totem you are standing in. Luck shifts the odds away from the
 * curse. Returns the outcome, or null if there is nothing to offer or not enough gold.
 */
export function fortuneOffer() {
  const t = G.fortuneNear;
  if (!t || t.state !== 'awake') return null;
  const cost = fortuneCost(t);
  if (G.coins < cost) {
    if (totemHooks.banner) totemHooks.banner('NOT ENOUGH GOLD', `THE TOTEM WANTS ${cost}`);
    return null;
  }
  G.coins -= cost;
  t.uses++;
  if (t.uses >= FORTUNE_USES) t.state = 'done';
  const luck = luckOf();
  const pCurse = 0.15 * (1 - luck), pDouble = 0.15, pBag = 0.25;
  const r = G.rngRun();
  const color = TOTEM_KINDS.fortune.color;
  if (totemHooks.ring) totemHooks.ring(t.x, t.y, 50, color, 0.4);
  let out;
  if (r < pCurse) {
    out = 'curse';
    if (totemHooks.curse) totemHooks.curse();
  } else if (r < pCurse + pDouble) {
    out = 'gold';
    if (totemHooks.coins) totemHooks.coins(cost * 2);
    if (totemHooks.banner) totemHooks.banner('FORTUNE SMILES', `+${cost * 2} GOLD`);
  } else if (r < pCurse + pDouble + pBag) {
    out = 'item';
    if (totemHooks.bagItem) totemHooks.bagItem(t.x, t.y + 20);
    if (totemHooks.banner) totemHooks.banner('A GIFT FROM THE TOTEM', 'SOMETHING FOR YOUR BAG');
  } else {
    const b = pickBlessings(1)[0];
    if (b) {
      out = 'blessing';
      if (totemHooks.grantBlessing) totemHooks.grantBlessing(b.id);
    } else {
      out = 'gold';
      if (totemHooks.coins) totemHooks.coins(cost * 2);
    }
  }
  if (totemHooks.burst) totemHooks.burst(t.x, t.y - 24, 18, out === 'curse' ? '#ff4a4a' : color);
  if (totemHooks.woke) totemHooks.woke(`fortune_${out}`);
  return out;
}

/** For the HUD: the trial that is running, if any. */
export const activeTrial = () => G.totems ? G.totems.find((t) => t.state === 'trial') || null : null;

/** Spawn positions for a trial: `n` points on a ring around the totem. */
export function trialRing(t, n, r, out) {
  out.length = 0;
  const a0 = G.rngRun() * TAU;
  for (let i = 0; i < n; i++) {
    const a = a0 + (i / n) * TAU;
    out.push({ x: t.x + Math.cos(a) * r, y: t.y + Math.sin(a) * r });
  }
  return out;
}
