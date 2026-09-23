// L3 -- may import L0-L2.
//
// Destructible scenery placement.
//
// Props are STATIC ENEMIES (see data/enemies.js), which is what lets projectiles, abilities and
// the spatial grid handle them with no new collision code. This file only decides WHERE they are.
//
// Placement is derived from hash2() over a coarse grid, so the world is consistent -- walk away
// from a bush and back and it is the same bush in the same place -- without storing anything.
// Cells are spawned as they come near and released as they fall behind.

import { G } from './state.js';
import { hash2, dist2 } from './util.js';
import { enemies } from './world.js';
import { spawnEnemy } from './enemies.js';
import { ENEMY_BY_ID } from './data/enemies.js';

const CELL = 96;                  // one prop candidate per 96x96 world cell
const SPAWN_RADIUS = 420;         // place a little beyond the screen edge
const RELEASE_RADIUS = 620;       // and release well past that, so nothing pops in view

/** Cell keys currently represented by a live prop. */
const active = new Map();

export function resetProps() {
  active.clear();
}

export function updateProps() {
  const p = G.player;
  const stage = G.stage;
  if (!p || !stage || !stage.props) return;

  const density = stage.propDensity || 0;
  const cx = Math.floor(p.x / CELL);
  const cy = Math.floor(p.y / CELL);
  const reach = Math.ceil(SPAWN_RADIUS / CELL);

  for (let gy = cy - reach; gy <= cy + reach; gy++) {
    for (let gx = cx - reach; gx <= cx + reach; gx++) {
      const key = gx * 100003 + gy;
      if (active.has(key)) continue;

      const h = hash2(gx, gy);
      if (h > density) continue;

      // Jitter inside the cell so the placement does not read as a grid.
      const x = gx * CELL + hash2(gx + 17, gy) * (CELL - 24) + 12;
      const y = gy * CELL + hash2(gx, gy + 17) * (CELL - 24) + 12;
      if (dist2(x, y, p.x, p.y) > SPAWN_RADIUS * SPAWN_RADIUS) continue;

      const def = ENEMY_BY_ID[pickProp(stage, hash2(gx + 71, gy + 71))];
      if (!def) continue;
      const e = spawnEnemy(def, x, y);
      if (!e) continue;               // pool exhausted: try again next pass
      e.propKey = key;
      active.set(key, e);
    }
  }

  // Release props that have fallen far behind, and forget any that were destroyed.
  for (const [key, e] of active) {
    if (!e.alive) { active.delete(key); continue; }
    if (dist2(e.x, e.y, p.x, p.y) > RELEASE_RADIUS * RELEASE_RADIUS) {
      e.alive = false;                // swept with the rest at end of tick
      active.delete(key);
    }
  }
}

function pickProp(stage, roll) {
  let total = 0;
  for (const p of stage.props) total += p.weight;
  let r = roll * total;
  for (const p of stage.props) {
    r -= p.weight;
    if (r <= 0) return p.id.startsWith('prop_') ? p.id : `prop_${p.id}`;
  }
  const last = stage.props[stage.props.length - 1].id;
  return last.startsWith('prop_') ? last : `prop_${last}`;
}
