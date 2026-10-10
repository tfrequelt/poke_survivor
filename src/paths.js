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
// A second field leads to the Substitute dolls, for the enemies that turn to chase one instead.
// Dolls never move, so it is built once when the set of standing dolls changes, seeded at every
// doll at once: whichever doll an enemy is after, the nearest one by dry ground is the way.
//
// Each grid is 64x64 tiles: 768px each way, past the ring at which enemies are recycled, so
// nothing that is chasing is ever off it. Water and everything outside the arena are walls. Steps
// cost 10 straight and 14 diagonal, and a diagonal step needs both of its sides dry, so a path
// never shaves the corner of a pond -- the shore would stop it there.
//
// Only floors with ponds build them. Everywhere else the enemies' straight lines are already right.

import { G } from './state.js';
import { walkableTile, pondTileSize } from './terrain.js';

const N = 64, NN = N * N, HALF = N >> 1;
const INF = 0x7fffffff;

/** One field: walkability, cost to its goal, the next tile along the way, and where it sits. */
function newField() {
  return {
    pass: new Uint8Array(NN),   // 1 where a walker can stand
    dist: new Int32Array(NN),   // cost of the walk from each tile to the goal; INF where none
    next: new Int32Array(NN),   // the next tile along that walk, or -1 at its end
    ox: 0, oy: 0,               // the grid's top-left world tile
    ready: false,
    shore: false,               // the goal is in the water: the walk ends at the shore
  };
}
const PLAYER = newField();
const DOLLS = newField();

const DX = [1, -1, 0, 0, 1, 1, -1, -1];
const DY = [0, 0, 1, -1, 1, -1, 1, -1];
const COST = [10, 10, 10, 10, 14, 14, 14, 14];

// Dijkstra over a bucket queue (Dial's algorithm), so a build allocates nothing. Every key waiting
// in the queue is within 255 of the one being expanded -- a step adds at most 14, and the seeds
// around a swimming player at most SEED_W x SEED_R -- so 256 buckets used as a ring are enough.
// The queue is shared: builds never overlap.
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

let S = 24;                          // the tile size
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

/** Lay field F's grid with its centre on tile (ctx, cty) and clear it, ready for seeds. */
function lay(F, ctx, cty) {
  F.ox = ctx - HALF; F.oy = cty - HALF;
  const { pass, dist, next } = F;
  for (let gy = 0; gy < N; gy++) {
    for (let gx = 0; gx < N; gx++) {
      const c = (gy << 6) | gx;
      pass[c] = walkableTile(F.ox + gx, F.oy + gy) ? 1 : 0;
      dist[c] = INF;
      next[c] = -1;
    }
  }
  head.fill(-1);
  used = 0; pending = 0;
}

/** Seed a goal tile (world tile coordinates) at cost `d`; ignored off the grid or in water. */
function seed(F, tx, ty, d) {
  const gx = tx - F.ox, gy = ty - F.oy;
  if (gx < 0 || gy < 0 || gx >= N || gy >= N) return;
  const c = (gy << 6) | gx;
  if (!F.pass[c] || F.dist[c] <= d) return;
  F.dist[c] = d;
  push(c, d);
}

/** Run the search out from whatever was seeded. */
function expand(F) {
  if (pending === 0) { F.ready = false; return; }
  const { pass, dist, next } = F;
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
  F.ready = true;
}

function buildPlayer(ptx, pty) {
  const F = PLAYER;
  lay(F, ptx, pty);
  const pc = (HALF << 6) | HALF;
  F.shore = !F.pass[pc];
  if (!F.shore) {
    seed(F, ptx, pty, 0);
  } else {
    // In the water: the goal is the shore, and the nearer a stretch of shore is to the player,
    // the cheaper it is to end there. The crowd then waits where it is closest to you.
    for (let dy = -SEED_R; dy <= SEED_R; dy++) {
      for (let dx = -SEED_R; dx <= SEED_R; dx++) {
        const r2 = dx * dx + dy * dy;
        if (r2 > SEED_R * SEED_R) continue;
        seed(F, ptx + dx, pty + dy, Math.round(SEED_W * Math.sqrt(r2)));
      }
    }
  }
  expand(F);
}

/** Keep the field around the player current. Called once a tick, on floors with ponds only. */
export function updateFlow(px, py, dt) {
  S = pondTileSize();
  if (G.stage !== floorStage || G.secret !== floorSecret || G.seed !== floorSeed) {
    floorStage = G.stage; floorSecret = G.secret; floorSeed = G.seed;
    builtTx = 1e9;
    since = 1e9;
    dollKey = -1;
  }
  since += dt;
  const ptx = Math.floor(px / S), pty = Math.floor(py / S);
  if ((ptx !== builtTx || pty !== builtTy) && since >= REBUILD_GAP) {
    builtTx = ptx; builtTy = pty;
    since = 0;
    buildPlayer(ptx, pty);
  }
}

// --- The dolls' field -----------------------------------------------------------------------

let dollKey = -1;

/**
 * Keep the dolls' field current: rebuilt only when the set of standing dolls changes (one
 * placed, one fallen). `dolls` is the live list, each with x and y. Called once a tick by
 * enemies.js, on floors with ponds, after updateFlow.
 */
export function updateDollFlow(dolls, n) {
  if (n === 0) { DOLLS.ready = false; dollKey = 0; return; }
  // A cheap signature of where the dolls stand: any change of tile or count rebuilds.
  let key = n * 7919, cx = 0, cy = 0;
  for (let i = 0; i < n; i++) {
    const tx = Math.floor(dolls[i].x / S), ty = Math.floor(dolls[i].y / S);
    key = (key * 31 + tx * 131 + ty * 197) | 0;
    cx += tx; cy += ty;
  }
  if (key === dollKey && DOLLS.ready) return;
  dollKey = key;
  const F = DOLLS;
  lay(F, Math.round(cx / n), Math.round(cy / n));
  F.shore = false;
  for (let i = 0; i < n; i++) seed(F, Math.floor(dolls[i].x / S), Math.floor(dolls[i].y / S), 0);
  expand(F);
}

// --- Reading a field --------------------------------------------------------------------------

/** Grid cell of a world point in field F, or -1 off its grid. */
function cellAt(F, x, y) {
  const gx = Math.floor(x / S) - F.ox, gy = Math.floor(y / S) - F.oy;
  if (gx < 0 || gy < 0 || gx >= N || gy >= N) return -1;
  return (gy << 6) | gx;
}

/** Is the straight line from (x0, y0) to (x1, y1) dry the whole way? Sampled every 8px. */
function lineDry(F, x0, y0, x1, y1) {
  const dx = x1 - x0, dy = y1 - y0;
  const steps = Math.ceil(Math.hypot(dx, dy) / 8);
  for (let i = 1; i <= steps; i++) {
    const c = cellAt(F, x0 + (dx * i) / steps, y0 + (dy * i) / steps);
    if (c < 0 || !F.pass[c]) return false;
  }
  return true;
}

function clearIn(F, x, y, px, py) {
  if (!F.ready || cellAt(F, x, y) < 0) return true;
  return lineDry(F, x, y, px, py);
}

const LOOK = 4;

/** What flowTarget tells an enemy to do. */
export const FLOW_NONE = 0, FLOW_STEER = 1, FLOW_HOLD = 2;

function targetIn(F, x, y, out) {
  if (!F.ready) return FLOW_NONE;
  let c = cellAt(F, x, y);
  if (c < 0 || F.dist[c] === INF) return FLOW_NONE;
  if (F.next[c] < 0) return F.shore ? FLOW_HOLD : FLOW_NONE;
  for (let k = 0; k < LOOK; k++) {
    c = F.next[c];
    if (c < 0) break;
    const tx = ((c & 63) + F.ox + 0.5) * S, ty = ((c >> 6) + F.oy + 0.5) * S;
    if (k > 0 && !lineDry(F, x, y, tx, ty)) break;
    out.x = tx; out.y = ty;
  }
  return FLOW_STEER;
}

/**
 * Can an enemy at (x, y) walk straight at (px, py) without meeting water? True off the grid and
 * on floors without a field: there is nothing better to offer it there than its straight line.
 */
export const flowClear = (x, y, px, py) => clearIn(PLAYER, x, y, px, py);

/**
 * Where an enemy at (x, y) should walk next to get round the water: the furthest of the next few
 * tiles along its path that it can reach in a straight line, so it cuts across open ground
 * instead of stepping tile by tile. FLOW_STEER, with the point written to `out`.
 *
 * FLOW_HOLD at the end of its path while you are swimming: it is on the shore nearest you, and
 * any further step is into the water. FLOW_NONE when the field has nothing for it -- off the
 * grid, cut off, or already on your tile.
 */
export const flowTarget = (x, y, out) => targetIn(PLAYER, x, y, out);

/** The same two questions, asked of the way to the dolls. */
export const dollFlowClear = (x, y, tx, ty) => clearIn(DOLLS, x, y, tx, ty);
export const dollFlowTarget = (x, y, out) => targetIn(DOLLS, x, y, out);

/** For the debug overlay and the probes. */
export const flowDebug = () => ({ ready: PLAYER.ready, ox: PLAYER.ox, oy: PLAYER.oy, S, N, pass: PLAYER.pass, dist: PLAYER.dist, next: PLAYER.next, dolls: DOLLS.ready });
