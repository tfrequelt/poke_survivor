// L2 -- may import L0-L1.
//
// The way round a pond, for the enemies that cannot swim it.
//
// Every walker is chasing the same thing -- you -- so instead of a search per enemy there is one
// FLOW FIELD: a grid around the player holding, for every tile, the length of the shortest dry
// walk from there to the player and the next tile along it. It is rebuilt when the player steps
// onto a new tile (the ground itself never changes), and reading it costs an enemy a few array
// lookups however many of them are using it.
//
// The grid is 64x64 tiles centred on the player: 768px each way, past the ring at which enemies
// are recycled, so nothing that is chasing is ever off it. Water and everything outside the arena
// are walls. Steps cost 10 straight and 14 diagonal, and a diagonal step needs both of its sides
// dry, so a path never shaves the corner of a pond -- the shore would stop it there.
//
// Only floors with ponds build one. Everywhere else the enemies' straight lines are already right.

import { G } from './state.js';
import { walkableTile, pondTileSize } from './terrain.js';

const N = 64, NN = N * N, HALF = N >> 1;
const INF = 0x7fffffff;

/** 1 where a walker can stand. */
const pass = new Uint8Array(NN);
/** Cost of the walk from each tile to the player; INF where there is none. */
const dist = new Int32Array(NN);
/** The next tile along that walk, or -1 at its end. */
const next = new Int32Array(NN);

const DX = [1, -1, 0, 0, 1, 1, -1, -1];
const DY = [0, 0, 1, -1, 1, -1, 1, -1];
const COST = [10, 10, 10, 10, 14, 14, 14, 14];

// Dijkstra over a bucket queue (Dial's algorithm), so a build allocates nothing. Every key waiting
// in the queue is within 255 of the one being expanded -- a step adds at most 14, and the seeds
// around a swimming player at most SEED_W x SEED_R -- so 256 buckets used as a ring are enough.
const RING = 256;
const head = new Int32Array(RING);
// A tile can be queued once per neighbour that improves it, plus once as a seed.
const POOL = NN * 9;
const nodeCell = new Int32Array(POOL);
const nodeNext = new Int32Array(POOL);

/**
 * A swimming player is reached at the shore: every dry tile within SEED_R is a goal, costing
 * SEED_W per tile of distance from the player. That has to be MORE than a step costs, or a goal
 * one tile further out is as good as the next one in, and the crowd stops at the outer edge of
 * the ring instead of coming down to the water.
 */
const SEED_R = 8, SEED_W = 20;

/** Fewest seconds between builds while the player walks, so a sprint is not a build a frame. */
const REBUILD_GAP = 0.3;

let ready = false;
// True while the player is in the water, so the walk ends at the shore instead of at them.
let shore = false;
let ox = 0, oy = 0, S = 24;          // the grid's top-left world tile, and the tile size
let builtTx = 1e9, builtTy = 1e9, since = 1e9;
let floorStage = null, floorSecret = false, floorSeed = -1;

let used = 0, pending = 0;
function push(c, d) {
  const node = used++;
  nodeCell[node] = c;
  const b = d & (RING - 1);
  nodeNext[node] = head[b];
  head[b] = node;
  pending++;
}

function build(ptx, pty) {
  ox = ptx - HALF; oy = pty - HALF;
  for (let gy = 0; gy < N; gy++) {
    for (let gx = 0; gx < N; gx++) {
      const c = (gy << 6) | gx;
      pass[c] = walkableTile(ox + gx, oy + gy) ? 1 : 0;
      dist[c] = INF;
      next[c] = -1;
    }
  }
  head.fill(-1);
  used = 0; pending = 0;

  const pc = (HALF << 6) | HALF;
  shore = !pass[pc];
  if (!shore) {
    dist[pc] = 0;
    push(pc, 0);
  } else {
    // In the water: the goal is the shore, and the nearer a stretch of shore is to the player,
    // the cheaper it is to end there. The crowd then waits where it is closest to you.
    for (let dy = -SEED_R; dy <= SEED_R; dy++) {
      for (let dx = -SEED_R; dx <= SEED_R; dx++) {
        const r2 = dx * dx + dy * dy;
        if (r2 > SEED_R * SEED_R) continue;
        const c = ((HALF + dy) << 6) | (HALF + dx);
        if (!pass[c]) continue;
        dist[c] = Math.round(SEED_W * Math.sqrt(r2));
        push(c, dist[c]);
      }
    }
  }
  if (pending === 0) { ready = false; return; }

  for (let d = 0; pending > 0; d++) {
    const b = d & (RING - 1);
    let node = head[b];
    head[b] = -1;
    while (node !== -1) {
      const c = nodeCell[node];
      node = nodeNext[node];
      pending--;
      if (dist[c] !== d) continue;              // queued again since, at a lower cost
      const cx = c & 63, cy = c >> 6;
      for (let k = 0; k < 8; k++) {
        const nx = cx + DX[k], ny = cy + DY[k];
        if (nx < 0 || ny < 0 || nx >= N || ny >= N) continue;
        const n = (ny << 6) | nx;
        if (!pass[n]) continue;
        if (k >= 4 && (!pass[(cy << 6) | nx] || !pass[(ny << 6) | cx])) continue;
        const nd = d + COST[k];
        if (nd < dist[n]) {
          dist[n] = nd;
          next[n] = c;
          push(n, nd);
        }
      }
    }
  }
  ready = true;
}

/** Keep the field around the player current. Called once a tick, on floors with ponds only. */
export function updateFlow(px, py, dt) {
  S = pondTileSize();
  if (G.stage !== floorStage || G.secret !== floorSecret || G.seed !== floorSeed) {
    floorStage = G.stage; floorSecret = G.secret; floorSeed = G.seed;
    builtTx = 1e9;
    since = 1e9;
  }
  since += dt;
  const ptx = Math.floor(px / S), pty = Math.floor(py / S);
  if ((ptx !== builtTx || pty !== builtTy) && since >= REBUILD_GAP) {
    builtTx = ptx; builtTy = pty;
    since = 0;
    build(ptx, pty);
  }
}

/** Grid cell of a world point, or -1 off the grid. */
function cellAt(x, y) {
  const gx = Math.floor(x / S) - ox, gy = Math.floor(y / S) - oy;
  if (gx < 0 || gy < 0 || gx >= N || gy >= N) return -1;
  return (gy << 6) | gx;
}

/** Is the straight line from (x0, y0) to (x1, y1) dry the whole way? Sampled every 8px. */
function lineDry(x0, y0, x1, y1) {
  const dx = x1 - x0, dy = y1 - y0;
  const steps = Math.ceil(Math.hypot(dx, dy) / 8);
  for (let i = 1; i <= steps; i++) {
    const c = cellAt(x0 + (dx * i) / steps, y0 + (dy * i) / steps);
    if (c < 0 || !pass[c]) return false;
  }
  return true;
}

/**
 * Can an enemy at (x, y) walk straight at (px, py) without meeting water? True off the grid and
 * on floors without a field: there is nothing better to offer it there than its straight line.
 */
export function flowClear(x, y, px, py) {
  if (!ready || cellAt(x, y) < 0) return true;
  return lineDry(x, y, px, py);
}

const LOOK = 4;

/** What flowTarget tells an enemy to do. */
export const FLOW_NONE = 0, FLOW_STEER = 1, FLOW_HOLD = 2;

/**
 * Where an enemy at (x, y) should walk next to get round the water: the furthest of the next few
 * tiles along its path that it can reach in a straight line, so it cuts across open ground
 * instead of stepping tile by tile. FLOW_STEER, with the point written to `out`.
 *
 * FLOW_HOLD at the end of its path while you are swimming: it is on the shore nearest you, and
 * any further step is into the water. FLOW_NONE when the field has nothing for it -- off the
 * grid, cut off, or already on your tile.
 */
export function flowTarget(x, y, out) {
  if (!ready) return FLOW_NONE;
  let c = cellAt(x, y);
  if (c < 0 || dist[c] === INF) return FLOW_NONE;
  if (next[c] < 0) return shore ? FLOW_HOLD : FLOW_NONE;
  for (let k = 0; k < LOOK; k++) {
    c = next[c];
    if (c < 0) break;
    const tx = ((c & 63) + ox + 0.5) * S, ty = ((c >> 6) + oy + 0.5) * S;
    if (k > 0 && !lineDry(x, y, tx, ty)) break;
    out.x = tx; out.y = ty;
  }
  return FLOW_STEER;
}

/** For the debug overlay and the probes. */
export const flowDebug = () => ({ ready, ox, oy, S, N, pass, dist, next });
