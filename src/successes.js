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
import { SUCCESSES, SUCCESS_BY_ID, TIERS, RANKS } from './data/successes.js';
import { CHARACTERS } from './data/characters.js';

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
  const s = saveData();
  s.ach[id] = 'claimed';
  // A perk is for good: every run from the next one on.
  if (def.reward && def.reward.perk) s.perks[def.reward.perk] = 1;
  // bankGold persists, so the claimed mark, the perk and the gold land in the same write.
  return bankGold((def.reward && def.reward.gold) || 0) || 1;
}

// --- Explorer Rank -------------------------------------------------------------------------

/** Points from every claimed success, by tier. */
export function explorerPoints() {
  let n = 0;
  for (const sc of SUCCESSES) if (successState(sc.id) === 'claimed') n += TIERS[sc.tier || 'bronze'].points;
  return n;
}

/** { index, name, points, at, next } -- `next` is the next rank's threshold, or null at Master. */
export function explorerRank() {
  const points = explorerPoints();
  let i = 0;
  while (i + 1 < RANKS.length && points >= RANKS[i + 1].at) i++;
  return { index: i, name: RANKS[i].name, points, at: RANKS[i].at, next: i + 1 < RANKS.length ? RANKS[i + 1].at : null };
}

// --- Cross-run counters ----------------------------------------------------------------------

/** Add to a save.stats counter. Persisted by the caller's next write, or by flushRecords. */
export function bumpStat(key, n = 1) {
  const s = saveData();
  s.stats[key] = (s.stats[key] || 0) + n;
  checkCounters();
}

export function flushRecords() { persistSave(); }

/** Every success that is a counter reaching its target. */
function checkCounters() {
  for (const sc of SUCCESSES) {
    const p = sc.progress;
    if (!p || (!p.count && !p.save && !p.partners)) continue;
    if (sc.id === 'legendary') continue;            // has its own check, with its own timing
    const prog = successProgress(sc);
    if (prog && prog[0] >= prog[1]) unlockSuccess(sc.id);
  }
}

/** Mark a stage-keyed or ribbon tally and check what it completes. */
export function recordKey(field, key) {
  const s = saveData();
  if (s[field][key]) return false;
  s[field][key] = 1;
  persistSave();
  checkCounters();
  return true;
}

/** Unlock `id` if `cond` holds. For the one-moment conditions main.js checks where they happen. */
export function unlockIf(id, cond) {
  if (cond) unlockSuccess(id);
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
  const p = def.progress;
  if (!p) return null;
  const s = saveData();
  let have = 0;
  if (p.count) have = s.stats[p.count] || 0;
  else if (p.partners) have = CHARACTERS.filter((c) => Object.keys(s.ribbons).some((k) => k.startsWith(`${c.id}:`))).length;
  else have = Object.keys(s[p.save] || {}).length;
  return [Math.min(p.of, have), p.of];
}

/** When a run ends in death. The 20:00 boss is a win, so dying after it is not this. */
export function checkDeath() {
  if (!G.won && G.runTime >= 19 * 60 + 30 && G.runTime < 20 * 60) unlockSuccess('punching_the_screen');
}
