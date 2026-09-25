// L3 -- may import L0-L2.
//
// Destructible scenery placement.
//
// Props are STATIC ENEMIES (see data/enemies.js), which is what lets projectiles, abilities and
// the spatial grid handle them with no new collision code. This file only decides WHERE they are
// and, crucially, where they are NOT any more.
//
// Two rules the previous version got wrong, both of which the player could feel:
//
//   1. A destroyed prop stays destroyed. Placement is still derived from hash2() so walking away
//      and back finds the same bush in the same place -- but a cell that has been cleared is
//      remembered for the rest of the run. Without that, the hash simply re-rolled the same prop
//      in the same spot on the very next tick and the whole system was a gold faucet.
//
//   2. Nothing appears on screen. Spawning "a little beyond the screen edge" by radius still put
//      props inside the corners of a 640x360 view, so they visibly popped into existence. The
//      test is now the camera rectangle itself.

import { G } from './state.js';
import { hash2, dist2 } from './util.js';
import { spawnEnemy } from './enemies.js';
import { ENEMY_BY_ID } from './data/enemies.js';

const CELL = 96;                  // one prop candidate per 96x96 world cell
const RELEASE_RADIUS = 760;       // release well past the despawn ring, so nothing pops in view
const MAX_LIVE = 44;              // hard cap on scenery, whatever the density says
const VIEW_PAD = 40;              // how far outside the view a prop must appear

/** Cell keys currently represented by a live prop. */
const active = new Map();

/** Cell keys whose prop has been destroyed. Cleared only when a new run starts. */
const cleared = new Set();

export function resetProps() {
  active.clear();
  cleared.clear();
}

/** Called when a prop dies, so its cell is never repopulated. */
export function clearProp(e) {
  if (e.propKey !== 0) cleared.add(e.propKey);
}

export function propCount() { return active.size; }

export function updateProps() {
  const p = G.player;
  const stage = G.stage;
  if (!p || !stage || !stage.props) return;

  // Release first: a prop that has fallen behind frees both a pool slot and a cap slot.
  for (const [key, e] of active) {
    if (!e.alive) { active.delete(key); continue; }
    if (dist2(e.x, e.y, p.x, p.y) > RELEASE_RADIUS * RELEASE_RADIUS) {
      e.alive = false;              // swept with the rest at end of tick
      active.delete(key);
    }
  }
  if (active.size >= MAX_LIVE) return;

  const density = stage.propDensity || 0;
  const b = G.bounds;
  // The camera rectangle, padded. A candidate inside it would be seen arriving.
  const vx0 = G.cam.x - 320 - VIEW_PAD, vx1 = G.cam.x + 320 + VIEW_PAD;
  const vy0 = G.cam.y - 180 - VIEW_PAD, vy1 = G.cam.y + 180 + VIEW_PAD;

  const cx = Math.floor(p.x / CELL);
  const cy = Math.floor(p.y / CELL);
  const reach = Math.ceil(RELEASE_RADIUS / CELL);

  for (let gy = cy - reach; gy <= cy + reach; gy++) {
    for (let gx = cx - reach; gx <= cx + reach; gx++) {
      const key = gx * 100003 + gy;
      if (active.has(key) || cleared.has(key)) continue;

      const h = hash2(gx, gy);
      if (h > density) continue;

      // Jitter inside the cell so the placement does not read as a grid.
      const x = gx * CELL + hash2(gx + 17, gy) * (CELL - 24) + 12;
      const y = gy * CELL + hash2(gx, gy + 17) * (CELL - 24) + 12;

      // Out of reach, on screen, or outside the arena: not now.
      if (dist2(x, y, p.x, p.y) > RELEASE_RADIUS * RELEASE_RADIUS) continue;
      if (x > vx0 && x < vx1 && y > vy0 && y < vy1) continue;
      if (b && (x < b.minX + 24 || x > b.maxX - 24 || y < b.minY + 24 || y > b.maxY - 24)) continue;

      const def = ENEMY_BY_ID[pickProp(stage, hash2(gx + 71, gy + 71))];
      if (!def) continue;
      const e = spawnEnemy(def, x, y);
      if (!e) return;                 // pool exhausted: try again next pass
      e.propKey = key;
      active.set(key, e);
      if (active.size >= MAX_LIVE) return;
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
