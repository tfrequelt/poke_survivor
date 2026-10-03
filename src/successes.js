// L2 -- may import L0-L1.
//
// Successes: unlocking, claiming, and the toast that announces an unlock mid-run.
//
// The state lives in the save (save.ach), not here, so an unlock survives the tab closing in the
// middle of the run that earned it -- unlockSuccess persists immediately rather than waiting for
// the run to end. Claiming is separate and only happens from the Successes window: an unlock is
// the moment you did it, a claim is the moment you collect.

import { G } from './state.js';
import { saveData, persistSave, bankGold } from './save.js';
import { SUCCESSES, SUCCESS_BY_ID } from './data/successes.js';

/** 'locked' | 'unlocked' | 'claimed' */
export const successState = (id) => saveData().ach[id] || 'locked';

/** Unlocked this run, so the run's end screen can say so. */
export const unlockedThisRun = [];

/** Set by main.js to play a sound; this file does not import audio. */
export const successHooks = { onUnlock: null };

/** The toast, read by the HUD. One at a time; a second unlock queues behind the first. */
export const toast = { queue: [], t: 0 };
const TOAST_TIME = 3.2;

export function unlockSuccess(id) {
  const def = SUCCESS_BY_ID[id];
  if (!def || successState(id) !== 'locked') return false;
  saveData().ach[id] = 'unlocked';
  persistSave();
  unlockedThisRun.push(id);
  toast.queue.push(def.title);
  if (toast.queue.length === 1) toast.t = TOAST_TIME;
  if (successHooks.onUnlock) successHooks.onUnlock(def);
  return true;
}

/** Collect an unlocked success's reward. Returns the gold banked, or 0 if there was nothing to claim. */
export function claimSuccess(id) {
  const def = SUCCESS_BY_ID[id];
  if (!def || successState(id) !== 'unlocked') return 0;
  saveData().ach[id] = 'claimed';
  // bankGold persists, so the claimed mark and the gold land in the same write.
  return bankGold((def.reward && def.reward.gold) || 0);
}

export const claimableCount = () => SUCCESSES.filter((s) => successState(s.id) === 'unlocked').length;
export const unlockedCount = () => SUCCESSES.filter((s) => successState(s.id) !== 'locked').length;

/** Advance the toast. Wall-clock dt: it keeps counting on card screens, where the sim is frozen. */
export function updateToast(dt) {
  if (!toast.queue.length) return;
  toast.t -= dt;
  if (toast.t <= 0) {
    toast.queue.shift();
    toast.t = toast.queue.length ? TOAST_TIME : 0;
  }
}

/** Called at the start of each run. */
export function resetRunSuccesses() {
  unlockedThisRun.length = 0;
}

// --- Conditions ---------------------------------------------------------------------------
//
// Each is called from the one place in the game that knows the moment it happened. They are
// cheap and idempotent: unlockSuccess returns at once for anything already unlocked.

/** After any hit that landed. Matches what the HUD shows, which rounds HP up. */
export function checkCloseCall(p) {
  if (p && p.hp > 0 && Math.ceil(p.hp) === 1) unlockSuccess('close_call');
}

export function checkLevel() {
  if (G.level >= 100) unlockSuccess('maxed_out');
}

export const KABOOM_KILLS = 30;

export function checkKaboom(castKills) {
  if (castKills >= KABOOM_KILLS) unlockSuccess('kaboom');
}

/** How many of the nine legendaries have ever been beaten. */
export const legendsBeaten = () => Object.keys(saveData().legends || {}).length;

/** After a legendary falls. All nine, across any number of runs, unlocks it. */
export function checkLegendary() {
  if (legendsBeaten() >= 9) unlockSuccess('legendary');
}

/** How far along a success with a `progress` tally is: [have, of], or null for the others. */
export function successProgress(def) {
  if (!def.progress) return null;
  const tally = saveData()[def.progress.save] || {};
  return [Math.min(def.progress.of, Object.keys(tally).length), def.progress.of];
}

/** When a run ends in death. The 20:00 boss is a win, so dying after it is not this. */
export function checkDeath() {
  if (!G.won && G.runTime >= 19 * 60 + 30 && G.runTime < 20 * 60) unlockSuccess('punching_the_screen');
}
