// L1 -- may import L0.
//
// Cross-run progress: the gold bank and the Kecleon Shop's purchased ranks. This is the file
// state.js has always named as the owner of G.save.
//
// It is kept separate from settings.js on purpose. Settings are the player's preferences and
// losing them is an annoyance; this is the player's *progress* and losing it is the whole game.
// Different key, different shape, so a corrupt settings blob cannot take the bank down with it.
//
// Every read and write is wrapped. Storage throws outright in a private window and can return
// garbage at any time, and a save that cannot be read must cost the player their bank, never
// their ability to play.

import { G } from './state.js';

const KEY = 'pokesurvivor.save.v1';

/** `spent` is tracked only so RESET PROGRESS can refund exactly what went in. */
const empty = () => ({ gold: 0, spent: 0, ranks: {} });

/**
 * Coerce whatever came out of storage into a save. Anything unrecognised is dropped rather than
 * trusted -- a hand-edited or half-written blob must not be able to put a string into G.stats.
 */
function sanitize(data) {
  const s = empty();
  if (!data || typeof data !== 'object') return s;
  if (Number.isFinite(data.gold)) s.gold = Math.max(0, Math.floor(data.gold));
  if (Number.isFinite(data.spent)) s.spent = Math.max(0, Math.floor(data.spent));
  if (data.ranks && typeof data.ranks === 'object') {
    for (const k of Object.keys(data.ranks)) {
      const n = data.ranks[k];
      if (Number.isFinite(n) && n > 0) s.ranks[k] = Math.floor(n);
    }
  }
  return s;
}

/** Must run before the first startRun, or a ?char= deep link starts without its purchases. */
export function loadSave() {
  let data = null;
  try {
    data = JSON.parse(localStorage.getItem(KEY) || 'null');
  } catch {
    data = null;
  }
  G.save = sanitize(data);
  return G.save;
}

export function persistSave() {
  if (!G.save) return false;
  try {
    localStorage.setItem(KEY, JSON.stringify(G.save));
    return true;
  } catch {
    return false;                    // blocked or full; the session keeps its progress anyway
  }
}

/** The bank, safe to call before loadSave -- a missing save is created rather than thrown on. */
export function saveData() {
  if (!G.save) G.save = empty();
  return G.save;
}

export const bankTotal = () => saveData().gold;

export function bankGold(amount) {
  const s = saveData();
  const n = Math.max(0, Math.round(amount));
  s.gold += n;
  persistSave();
  return n;
}

export const rankOf = (id) => saveData().ranks[id] || 0;

/** Buy one rank. Returns false and changes nothing if it cannot be afforded. */
export function buyRank(id, cost, maxRank) {
  const s = saveData();
  const have = s.ranks[id] || 0;
  if (have >= maxRank || cost > s.gold) return false;
  s.gold -= cost;
  s.spent += cost;
  s.ranks[id] = have + 1;
  persistSave();
  return true;
}

/** Refund everything ever spent and clear every rank. */
export function resetProgress() {
  const s = saveData();
  s.gold += s.spent;
  s.spent = 0;
  s.ranks = {};
  persistSave();
  return s.gold;
}
