// L0 -- imports NOTHING. Math, RNG, array and pooling helpers.

export const TAU = Math.PI * 2;
export const DEG = Math.PI / 180;

export const clamp = (v, lo, hi) => (v < lo ? lo : v > hi ? hi : v);
export const lerp = (a, b, t) => a + (b - a) * t;
export const sign = (v) => (v < 0 ? -1 : v > 0 ? 1 : 0);

/** Frame-rate independent exponential approach. `rate` is the fraction remaining after 1 second. */
export const damp = (a, b, rate, dt) => lerp(a, b, 1 - Math.pow(rate, dt));

/** Move `a` toward `b` by at most `step`. */
export function approach(a, b, step) {
  const d = b - a;
  return Math.abs(d) <= step ? b : a + sign(d) * step;
}

export const dist2 = (ax, ay, bx, by) => {
  const dx = bx - ax, dy = by - ay;
  return dx * dx + dy * dy;
};

/** Shortest signed angular difference from a to b, in (-PI, PI]. */
export function angDiff(a, b) {
  let d = (b - a) % TAU;
  if (d > Math.PI) d -= TAU;
  if (d < -Math.PI) d += TAU;
  return d;
}

// --- Seeded RNG -------------------------------------------------------------
// mulberry32: tiny, fast, good enough for gameplay. Seeded so runs are reproducible
// (the ?seed= URL param), which is what makes a broken late game debuggable.

export function mulberry32(seed) {
  let a = seed >>> 0;
  return function rng() {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export const randRange = (rng, lo, hi) => lo + rng() * (hi - lo);
export const randInt = (rng, lo, hi) => Math.floor(lo + rng() * (hi - lo + 1));
export const pick = (rng, arr) => arr[(rng() * arr.length) | 0];

/** Weighted pick. `weightOf(item, i)` returns a non-negative number. Returns null if all weights are 0. */
export function pickWeighted(rng, arr, weightOf) {
  let total = 0;
  for (let i = 0; i < arr.length; i++) total += weightOf(arr[i], i);
  if (total <= 0) return null;
  let r = rng() * total;
  for (let i = 0; i < arr.length; i++) {
    r -= weightOf(arr[i], i);
    if (r <= 0) return arr[i];
  }
  return arr[arr.length - 1];
}

/** Deterministic 2D value hash in [0,1). Used for per-tile background variation -- no storage. */
export function hash2(x, y) {
  let h = Math.imul(x | 0, 374761393) + Math.imul(y | 0, 668265263);
  h = Math.imul(h ^ (h >>> 13), 1274126177);
  return ((h ^ (h >>> 16)) >>> 0) / 4294967296;
}

// --- Arrays -----------------------------------------------------------------

/** O(1) removal that does not preserve order. The removal strategy for every entity array. */
export function swapPop(arr, i) {
  const last = arr.length - 1;
  if (i !== last) arr[i] = arr[last];
  arr.pop();
}

// --- Pooling ----------------------------------------------------------------
// Every entity comes from a Pool so the hot loop never allocates. `get()` returning null
// IS the hard cap -- callers decide whether to skip the spawn or recycle something.

export class Pool {
  constructor(factory, cap) {
    this.cap = cap;
    this.factory = factory;
    this.free = new Array(cap);
    for (let i = 0; i < cap; i++) this.free[i] = factory();
  }
  get() {
    return this.free.length > 0 ? this.free.pop() : null;
  }
  put(obj) {
    if (this.free.length < this.cap) this.free.push(obj);
  }
  get available() { return this.free.length; }
}

// --- Misc -------------------------------------------------------------------

/** "2:07" from seconds. */
export function formatTime(sec) {
  const s = Math.max(0, Math.floor(sec));
  return `${(s / 60) | 0}:${String(s % 60).padStart(2, '0')}`;
}

/** Thousands separator without Intl overhead in hot paths. */
export function formatNum(n) {
  return String(Math.round(n)).replace(/\B(?=(\d{3})+(?!\d))/g, ',');
}
