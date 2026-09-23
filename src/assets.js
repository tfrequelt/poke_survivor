// L1 -- may import L0.
//
// Optional image assets. The game is fully playable with zero files here: every sprite has a
// generated fallback, so a missing or broken asset degrades to the drawn art rather than to a
// black screen. That property is the whole point of this module and every failure path preserves it.
//
// Drop a PNG at assets/sprites/<shape>.png and list it in assets/manifest.json, and it replaces
// that shape everywhere -- atlas variants (flip, hit-flash, baked rotations) are derived from the
// image exactly as they are from the drawn pixel maps.

const MANIFEST_URL = 'assets/manifest.json';

/** shape name -> { w, h, data: Uint32Array } in packed 0xAABBGGRR, ready for the atlas blitter. */
export const imageOverrides = new Map();

let warned = false;

function warnOnce(msg) {
  if (!warned) {
    console.info('[assets] ' + msg + ' -- using generated art.');
    warned = true;
  }
}

/**
 * Read an image into a packed pixel buffer. Goes through a scratch canvas because the atlas
 * compiler needs raw pixel access to build the mirrored and whitened variants.
 */
async function decode(url) {
  const res = await fetch(url, { cache: 'no-cache' });
  if (!res.ok) throw new Error(`${res.status} ${url}`);
  const blob = await res.blob();
  const bmp = await createImageBitmap(blob);
  // Capture the dimensions BEFORE closing: close() zeroes width/height, which silently yields a
  // 0x0 image and a sprite that renders as nothing at all.
  const w = bmp.width, h = bmp.height;

  const c = document.createElement('canvas');
  c.width = w;
  c.height = h;
  const cx = c.getContext('2d', { willReadFrequently: true });
  cx.imageSmoothingEnabled = false;
  cx.drawImage(bmp, 0, 0);
  const img = cx.getImageData(0, 0, w, h);
  bmp.close?.();

  if (!w || !h) throw new Error(`decoded to ${w}x${h}: ${url}`);
  return { w, h, data: new Uint32Array(img.data.buffer.slice(0)) };
}

/**
 * Load the manifest and every sprite it lists. Never throws: a missing manifest is the normal
 * case (no assets supplied), and one broken entry must not take the others down with it.
 */
export async function loadAssets() {
  let manifest;
  try {
    const res = await fetch(MANIFEST_URL, { cache: 'no-cache' });
    if (!res.ok) { warnOnce('no assets/manifest.json'); return { loaded: 0, failed: 0 }; }
    manifest = await res.json();
  } catch (e) {
    warnOnce('assets/manifest.json missing or malformed');
    return { loaded: 0, failed: 0 };
  }

  loadMusicMap(manifest);
  const sheetStats = await loadSheets(manifest);

  const sprites = (manifest && manifest.sprites) || {};
  const names = Object.keys(sprites);
  if (!names.length) return sheetStats;

  // allSettled, not all: one bad file must not reject the batch.
  const results = await Promise.allSettled(
    names.map((name) => decode(sprites[name]).then((px) => [name, px])),
  );

  let loaded = sheetStats.loaded, failed = sheetStats.failed;
  for (const r of results) {
    if (r.status === 'fulfilled') {
      imageOverrides.set(r.value[0], r.value[1]);
      loaded++;
    } else {
      console.warn('[assets] failed:', r.reason && r.reason.message);
      failed++;
    }
  }
  return { loaded, failed };
}

export const hasOverride = (shape) => imageOverrides.has(shape);
export const getOverride = (shape) => imageOverrides.get(shape);

// --- PMD sprite sheets ------------------------------------------------------
//
// A sheet from pmdcollab is a grid of 8 ROWS (one per facing direction) by N COLUMNS (animation
// frames). The exact frame size varies per Pokemon -- Wooper is 32x40 with 8 frames, Decidueye is
// 24x48 with 4 -- and the frames are NOT square, so it cannot be inferred from the image alone.
// AnimData.xml carries the real numbers, so that is what we read.

/** shape -> { w, h, cols, rows, data, sheetW, ox, oy } */
export const sheetOverrides = new Map();

/** Row order in a PMD sheet. Index 0 is Down, then clockwise. */
export const DIR_DOWN = 0, DIR_RIGHT = 2, DIR_UP = 4, DIR_LEFT = 6;

const QUARTER = Math.PI / 4;

/**
 * Heading in radians -> PMD row index.
 * Down is row 0 and rows advance clockwise, which is why this counts *down* from +PI/2.
 */
export function dirFromAngle(angle) {
  const r = Math.round((Math.PI / 2 - angle) / QUARTER) % 8;
  return r < 0 ? r + 8 : r;
}

async function loadSheet(name, dir, animName) {
  // AnimData.xml holds the authoritative frame size and frame count.
  const xmlRes = await fetch(`${dir}/AnimData.xml`, { cache: 'no-cache' });
  if (!xmlRes.ok) throw new Error(`${xmlRes.status} ${dir}/AnimData.xml`);
  const doc = new DOMParser().parseFromString(await xmlRes.text(), 'application/xml');

  let anim = null;
  for (const a of doc.querySelectorAll('Anim')) {
    if (a.querySelector('Name')?.textContent === animName) { anim = a; break; }
  }
  if (!anim) throw new Error(`${dir}: no "${animName}" animation`);

  const w = parseInt(anim.querySelector('FrameWidth')?.textContent, 10);
  const h = parseInt(anim.querySelector('FrameHeight')?.textContent, 10);
  const cols = anim.querySelectorAll('Duration').length;
  if (!w || !h || !cols) throw new Error(`${dir}: incomplete ${animName} metadata`);

  const px = await decode(`${dir}/${animName}-Anim.png`);
  const rows = Math.floor(px.h / h);
  if (rows < 8) throw new Error(`${dir}: expected 8 direction rows, got ${rows}`);

  // Origin: horizontal centre, and the bottom of the actual artwork rather than the bottom of the
  // frame. PMD frames carry padding, and anchoring to the frame edge makes everything float.
  let maxY = 0;
  for (let y = 0; y < px.h; y++) {
    for (let x = 0; x < px.w; x++) {
      if (px.data[y * px.w + x] >>> 24) { const local = y % h; if (local > maxY) maxY = local; }
    }
  }

  return { w, h, cols, rows: 8, data: px.data, sheetW: px.w, ox: w >> 1, oy: maxY + 1 };
}

/** name -> { w, h, canvas } for the character-select portraits. */
export const portraits = new Map();

/**
 * Decode straight to a canvas. Portraits are only ever blitted whole, so they skip the atlas
 * entirely -- no variants to derive, and no reason to spend atlas space on them.
 */
async function decodeDrawable(url) {
  const res = await fetch(url, { cache: 'no-cache' });
  if (!res.ok) throw new Error(`${res.status} ${url}`);
  const bmp = await createImageBitmap(await res.blob());
  const w = bmp.width, h = bmp.height;
  const c = document.createElement('canvas');
  c.width = w; c.height = h;
  const cx = c.getContext('2d');
  cx.imageSmoothingEnabled = false;
  cx.drawImage(bmp, 0, 0);
  bmp.close?.();
  if (!w || !h) throw new Error(`decoded to ${w}x${h}: ${url}`);
  return { w, h, canvas: c };
}

/**
 * Load sprite sheets and portraits named in the manifest. Same contract as the sprite overrides:
 * any failure logs and falls back, and never stops the game booting.
 */
export async function loadSheets(manifest) {
  const sheets = (manifest && manifest.sheets) || {};
  const ports = (manifest && manifest.portraits) || {};
  let loaded = 0, failed = 0;

  const jobs = [];
  for (const name of Object.keys(sheets)) {
    const entry = sheets[name];
    const dir = typeof entry === 'string' ? entry : entry.dir;
    const animName = (typeof entry === 'object' && entry.anim) || 'Walk';
    jobs.push(loadSheet(name, dir, animName).then((s) => ['sheet', name, s]));
  }
  for (const name of Object.keys(ports)) {
    jobs.push(decodeDrawable(ports[name]).then((p) => ['portrait', name, p]));
  }

  for (const r of await Promise.allSettled(jobs)) {
    if (r.status === 'fulfilled') {
      const [kind, name, val] = r.value;
      if (kind === 'sheet') sheetOverrides.set(name, val);
      else portraits.set(name, val);
      loaded++;
    } else {
      console.warn('[assets] sheet/portrait failed:', r.reason && r.reason.message);
      failed++;
    }
  }
  return { loaded, failed };
}

/** key -> [url, ...]. Supplied music, one list per menu/stage key. */
export const musicTracks = new Map();

export function loadMusicMap(manifest) {
  const m = (manifest && manifest.music) || {};
  for (const key of Object.keys(m)) {
    const list = Array.isArray(m[key]) ? m[key] : [m[key]];
    if (list.length) musicTracks.set(key, list);
  }
  return musicTracks.size;
}

/** A random track for a key, or null if none supplied (caller falls back to the chiptune). */
export function pickMusic(key, rng) {
  const list = musicTracks.get(key);
  if (!list || !list.length) return null;
  return list[Math.floor((rng ? rng() : Math.random()) * list.length) % list.length];
}

export const getSheet = (shape) => sheetOverrides.get(shape);
export const getPortrait = (name) => portraits.get(name);
