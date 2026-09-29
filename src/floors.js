// L2 -- may import L0-L1. Imports no system, so anything may import it.
//
// Floors: the one decision a run offers that is not a card.
//
// At 5:00, 10:00 and 15:00 a staircase appears somewhere off-screen. Taking it drops you onto a
// fresh floor of the SAME stage -- same tiles, same music, same roster -- with tougher enemies,
// more of them, and richer drops. Ignoring it is the safe play, and both are meant to be
// defensible: the whole feature is the trade, so the numbers below are the feature.
//
// This file owns the trade and nothing else. It holds no state (that lives on G.floor) and
// touches no system: main.js drives the transition, director.js reads the multipliers, hud.js
// and ui.js read the labels. Keeping it at L2 is what lets director.js (L3) and state.js (L0)
// both sit on the same numbers without an import cycle.

import { G } from './state.js';

/** The clock marks a staircase can appear at. Three of them, so the deepest floor is the 4th. */
export const STAIRS_AT = [300, 600, 900];

/** The deepest floor reachable, derived rather than written twice. */
export const MAX_FLOOR = STAIRS_AT.length + 1;

// How much harder and how much richer, per floor below the first.
//
// Reward outruns risk on purpose: at the fourth floor enemies have 2.05x the health and hit for
// 2.05x, while drops are worth 2.5x. A player who can actually handle the bottom floor should be
// rewarded for going there, and one who cannot has the stairs sitting right there to walk past.
const POWER = 0.35;     // enemy hp and damage
const SWARM = 0.20;     // spawn rate and alive cap
const REWARD = 0.50;    // xp and gold

export const floorPower = () => 1 + POWER * (G.floor - 1);
export const floorSwarm = () => 1 + SWARM * (G.floor - 1);
export const floorReward = () => 1 + REWARD * (G.floor - 1);

/**
 * Gold paid at the victory screen for finishing below the first floor, indexed by floor - 1.
 *
 * Accelerating rather than linear, so the fourth floor is a genuine prize rather than one more
 * step. Only paid on a win -- dying on the bottom floor pays nothing.
 */
export const FLOOR_BONUS = [0, 200, 500, 1000];

export const floorBonus = (floor = G.floor) => FLOOR_BONUS[Math.min(FLOOR_BONUS.length - 1, Math.max(0, floor - 1))];

/**
 * The floor as the player sees it.
 *
 * A stage that descends counts DOWN past the first floor -- 1F, -1F, -2F, -3F -- because that is
 * how Mystery Dungeon writes a basement, and a cave that called its second floor "2F" while
 * drawing a staircase going down would be telling the player two different things.
 */
export function floorLabel(floor = G.floor, stage = G.stage) {
  if (stage && stage.descend) return floor <= 1 ? '1F' : `-${floor - 1}F`;
  return `${floor}F`;
}

/** Which flight to draw. The sprite has to agree with the label for the same reason. */
export const stairsShape = (stage = G.stage) => (stage && stage.descend ? 'stairs_down' : 'stairs_up');

/**
 * "2ND", "3RD", "4TH" -- how deep the run got, for the bonus line on the summary.
 *
 * Deliberately the floor NUMBER and not the label: the beach's `-2F` is still the third floor
 * reached, and "-2ND FLOOR BONUS" is not a thing.
 */
export function floorOrdinal(floor = G.floor) {
  const suffix = floor === 1 ? 'ST' : floor === 2 ? 'ND' : floor === 3 ? 'RD' : 'TH';
  return `${floor}${suffix}`;
}
