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
async function decode(url, rect) {
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
  // A rect pulls one sprite out of a sheet, so a packed sheet like the PMD item rip can supply
  // several unrelated sprites without being split into files first.
  const r = rect
    ? { x: rect.x | 0, y: rect.y | 0, w: rect.w | 0, h: rect.h | 0 }
    : { x: 0, y: 0, w, h };
  if (r.x < 0 || r.y < 0 || r.x + r.w > w || r.y + r.h > h) {
    throw new Error(`crop ${r.x},${r.y} ${r.w}x${r.h} is outside ${w}x${h}: ${url}`);
  }
  const img = cx.getImageData(r.x, r.y, r.w, r.h);
  bmp.close?.();

  if (!w || !h) throw new Error(`decoded to ${w}x${h}: ${url}`);
  return { w: r.w, h: r.h, data: new Uint32Array(img.data.buffer.slice(0)) };
}

/**
 * Zero the alpha of every pixel matching a flat background colour, in the packed 0xAABBGGRR
 * buffer the atlas compiler consumes.
 */
function keyOutPacked(img, hex, tol = 10) {
  const n = parseInt(hex.slice(1), 16);
  const kr = (n >> 16) & 255, kg = (n >> 8) & 255, kb = n & 255;
  const d = img.data;
  for (let i = 0; i < d.length; i++) {
    const v = d[i];
    const r = v & 255, g = (v >>> 8) & 255, b = (v >>> 16) & 255;
    if (Math.abs(r - kr) <= tol && Math.abs(g - kg) <= tol && Math.abs(b - kb) <= tol) d[i] = 0;
  }
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
  await loadSfx(manifest);
  await loadUi(manifest);
  await loadImages(manifest);
  await loadAttacks(manifest);

  const sprites = (manifest && manifest.sprites) || {};
  const names = Object.keys(sprites);
  if (!names.length) return sheetStats;

  // allSettled, not all: one bad file must not reject the batch.
  const results = await Promise.allSettled(names.map((name) => {
    const e = sprites[name];
    const url = typeof e === 'string' ? e : e.src;
    const rect = typeof e === 'object' && e.w ? e : null;
    return decode(url, rect).then((px) => {
      // `anchor` decides where the sprite sits relative to its draw position. Bottom is right
      // for a creature standing on the ground and wrong for a coin, which is drawn centred.
      px.anchor = (typeof e === 'object' && e.anchor) || 'bottom';
      // Sheet rips are saved on a flat backdrop rather than with alpha, so a sprite cut out of
      // one arrives inside a coloured box unless that colour is keyed out.
      if (typeof e === 'object' && e.key) keyOutPacked(px, e.key, e.tolerance);
      return [name, px];
    });
  }));

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

/** shape -> { w, h, cols, rows, data, sheetW, ox, oy, anchors } */
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

  const anchors = await readAnchors(dir, animName, px, w, h, cols);
  // Whether those anchors are real shadow data or the estimate. Worth surfacing: a sheet on the
  // estimate is the one that will look like it is floating.
  const shadowed = anchors.shadowed === true;

  // A single scalar anchor is still published for callers that only need a rough sprite height
  // (spriteInfo). The per-frame values in `anchors` are the ones that matter for drawing.
  let oy = 0;
  for (let i = 1; i < anchors.length; i += 2) if (anchors[i] > oy) oy = anchors[i];

  return { w, h, cols, rows: 8, data: px.data, sheetW: px.w, ox: w >> 1, oy, anchors, shadowed };
}

/**
 * The ground point of every cell of a PMD sheet, as an Int16Array of [ox, oy] pairs indexed
 * `(dir * cols + frame) * 2`.
 *
 * PMD ships this data: each animation has a `-Shadow.png` of the same dimensions holding exactly
 * ONE white pixel per frame, sitting where the creature's shadow goes -- that is, where it
 * touches the ground. Using it is the difference between a sprite that stands on the floor and
 * one that hovers, and there is no way to infer it from the artwork.
 *
 * The previous approach -- anchor to the lowest opaque pixel of each direction row -- looks
 * right side-on and fails facing up, because a tail drawn toward the camera hangs BELOW the
 * feet. Anchoring to the tail leaves the body floating, which is exactly the bug this replaces.
 *
 * The anchor also moves between frames of a walk cycle. That is deliberate in PMD: the art
 * shifts inside the frame while the creature stays on its tile, so honouring it is what makes a
 * walk read as walking rather than sliding.
 */
async function readAnchors(dir, animName, px, w, h, cols) {
  const out = new Int16Array(8 * cols * 2);
  let shadow = null;
  try {
    shadow = await decode(`${dir}/${animName}-Shadow.png`);
  } catch {
    // Normal for a folder whose shadow sheets were not kept -- fall through to the estimate.
  }
  const ok = shadow && shadow.w === px.w && shadow.h === px.h;
  if (shadow && !ok) {
    console.warn(`[assets] ${dir}/${animName}-Shadow.png is ${shadow.w}x${shadow.h}, expected ${px.w}x${px.h}`);
  }

  let found = 0;
  for (let d = 0; d < 8; d++) {
    for (let f = 0; f < cols; f++) {
      const i = (d * cols + f) * 2;
      const point = ok ? whitePixel(shadow, f * w, d * h, w, h) : -1;
      if (point >= 0) found++;
      if (point >= 0) {
        out[i] = point & 0xffff;
        out[i + 1] = point >>> 16;
      } else if (px.data) {
        // Estimate: horizontal centre, and the lowest opaque row of this one frame.
        out[i] = w >> 1;
        out[i + 1] = lowestOpaqueRow(px, f * w, d * h, w, h) + 1;
      } else {
        // No pixels to measure (the attack path keeps its sheet as a canvas). PMD centres the
        // larger attack frames on the creature, so the frame centre is the right estimate.
        out[i] = w >> 1;
        out[i + 1] = h >> 1;
      }
    }
  }
  // Only claim shadow anchoring if every cell had a point; a partial sheet is a broken sheet.
  out.shadowed = found === 8 * cols;
  return out;
}

/** The single white pixel in one cell, packed as `y << 16 | x`, or -1 if the cell has none. */
function whitePixel(img, x0, y0, w, h) {
  for (let y = 0; y < h; y++) {
    const row = (y0 + y) * img.w + x0;
    for (let x = 0; x < w; x++) {
      const v = img.data[row + x];
      if ((v >>> 24) < 8) continue;
      if ((v & 255) > 240 && ((v >>> 8) & 255) > 240 && ((v >>> 16) & 255) > 240) {
        return (y << 16) | x;
      }
    }
  }
  return -1;
}

function lowestOpaqueRow(img, x0, y0, w, h) {
  for (let y = h - 1; y >= 0; y--) {
    const row = (y0 + y) * img.w + x0;
    for (let x = 0; x < w; x++) if (img.data[row + x] >>> 24) return y;
  }
  return h - 1;
}

// --- Attack animations ------------------------------------------------------
//
// Every PMD folder ships an `Attack` animation alongside `Walk`, on a much larger frame -- Wooper
// walks in 32x40 and attacks in 72x72, because the frame has to hold the swing.
//
// These deliberately do NOT go in the sprite atlas. One form's attack sheet is around 830k
// pixels and twelve of them would be 10M against an 8.4M atlas. They are kept as canvases and
// blitted directly, like the ground tilesets and the status icons: a cast is one entity, one
// drawImage a frame, and only while it is playing.

/**
 * "shape:anim" -> { canvas, w, h, cols, durs, total, anchors, shadowed }
 *
 * These are the PMD animations that are NOT in the sprite atlas: attack sheets are far bigger
 * than walk frames, and the title idles are only ever drawn one at a time on a menu. Both are
 * kept as canvases and blitted directly.
 */
export const animSheets = new Map();

export const getAnim = (shape, anim) => animSheets.get(`${shape}:${anim}`);
/** The cast animation, which is the original and by far the most common caller. */
export const getAttack = (shape) => animSheets.get(`${shape}:Attack`);

/**
 * Load one named animation from a PMD folder.
 *
 * Unlike loadSheet this does NOT require eight direction rows: several of the idle animations
 * (Sleep, for one) ship as a single row, and a caller that only ever draws row 0 can use them
 * perfectly well.
 */
async function loadNamed(dir, animName) {
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
  // The real per-frame timings, so the animation plays at the speed PMD authored rather than at
  // a rate invented here. A unit is one 60Hz tick.
  const durs = [...anim.querySelectorAll('Duration')].map((d) => parseInt(d.textContent, 10) || 1);
  if (!w || !h || !durs.length) throw new Error(`${dir}: incomplete ${animName} metadata`);

  const img = await decodeDrawable(`${dir}/${animName}-Anim.png`);
  // Anchors need raw pixels, and only for the estimate path; decoding the sheet twice is the
  // price of keeping the drawn copy as a canvas.
  const px = { w: img.w, h: img.h, data: null };
  const anchors = await readAnchors(dir, animName, px, w, h, durs.length);

  let total = 0;
  for (const d of durs) total += d;
  return {
    canvas: img.canvas, w, h, cols: durs.length, rows: Math.max(1, (img.h / h) | 0),
    durs: Int16Array.from(durs), total: total / 60,
    anchors, shadowed: anchors.shadowed === true,
  };
}

/**
 * Load the non-atlas animations the manifest asks for: `attacks` (a list of shapes, all using
 * "Attack") and `anims` (a map of shape -> animation name, for the title screen idles).
 *
 * The folder comes from the `sheets` entry of the same name in both cases, so a form only ever
 * names its folder once.
 */
export async function loadAttacks(manifest) {
  const sheets = (manifest && manifest.sheets) || {};
  const wanted = [];
  for (const name of (manifest && manifest.attacks) || []) wanted.push([name, 'Attack']);
  for (const [name, anim] of Object.entries((manifest && manifest.anims) || {})) {
    wanted.push([name, anim]);
  }
  if (!wanted.length) return 0;

  const jobs = wanted.map(([name, animName]) => {
    const entry = sheets[name];
    const dir = typeof entry === 'string' ? entry : entry && entry.dir;
    if (!dir) return Promise.reject(new Error(`anims: "${name}" has no sheets entry`));
    return loadNamed(dir, animName).then((a) => [`${name}:${animName}`, a]);
  });

  let n = 0;
  for (const r of await Promise.allSettled(jobs)) {
    if (r.status === 'fulfilled') { animSheets.set(r.value[0], r.value[1]); n++; }
    else console.warn('[assets] animation failed:', r.reason && r.reason.message);
  }
  return n;
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

  const estimated = [];
  for (const r of await Promise.allSettled(jobs)) {
    if (r.status === 'fulfilled') {
      const [kind, name, val] = r.value;
      if (kind === 'sheet') {
        sheetOverrides.set(name, val);
        if (!val.shadowed) estimated.push(name);
      } else portraits.set(name, val);
      loaded++;
    } else {
      console.warn('[assets] sheet/portrait failed:', r.reason && r.reason.message);
      failed++;
    }
  }
  if (estimated.length) {
    console.warn(
      '[assets] no -Shadow.png for: ' + estimated.sort().join(', ') +
      ' -- these are anchored by estimate and may look like they float. Re-download the folder ' +
      'from pmdcollab keeping its *-Shadow.png files.');
  }
  return { loaded, failed };
}

// --- Supplied sound effects -------------------------------------------------
//
// Fetched as raw bytes at boot and decoded later, because decoding needs an AudioContext and
// there is no AudioContext until the player presses a key. Anything not supplied keeps its
// synthesised version, so a half-filled sfx folder is a perfectly normal state.

/** sfx id -> ArrayBuffer, awaiting decode. */
export const sfxFiles = new Map();

/**
 * sfx id -> playback gain, for the ids whose manifest entry asked for one.
 *
 * A synthesised sound carries its own `gain` in its recipe; a supplied file had no way to say
 * how loud it should be, so one mastered hotter than the rest could only be fixed by re-exporting
 * it. An entry may now be `{ src, gain }`, exactly as an `images` entry may be `{ src, key }`.
 */
export const sfxGains = new Map();

export async function loadSfx(manifest) {
  const m = (manifest && manifest.sfx) || {};
  const ids = Object.keys(m);
  if (!ids.length) return 0;

  const results = await Promise.allSettled(ids.map(async (id) => {
    const e = m[id];
    const src = typeof e === 'string' ? e : e.src;
    if (typeof e === 'object' && typeof e.gain === 'number') sfxGains.set(id, e.gain);
    const res = await fetch(src, { cache: 'no-cache' });
    if (!res.ok) throw new Error(`${res.status} ${src}`);
    return [id, await res.arrayBuffer()];
  }));
  let n = 0;
  for (const r of results) {
    if (r.status === 'fulfilled') { sfxFiles.set(r.value[0], r.value[1]); n++; }
    else console.warn('[assets] sfx failed:', r.reason && r.reason.message);
  }
  return n;
}

// --- Supplied UI frames -----------------------------------------------------
//
// A window image is drawn as a nine-slice: the four corners stay put, the four edges stretch
// along one axis and the middle fills. `corner` is how many pixels of the source form a corner.

/** name -> { w, h, canvas, corner } */
export const uiImages = new Map();

export async function loadUi(manifest) {
  const m = (manifest && manifest.ui) || {};
  const names = Object.keys(m);
  if (!names.length) return 0;

  const results = await Promise.allSettled(names.map(async (name) => {
    const entry = m[name];
    const url = typeof entry === 'string' ? entry : entry.src;
    const img = await decodeDrawable(url);
    img.corner = (typeof entry === 'object' && entry.corner) || Math.max(2, Math.min(img.w, img.h) >> 2);
    return [name, img];
  }));
  let n = 0;
  for (const r of results) {
    if (r.status === 'fulfilled') { uiImages.set(r.value[0], r.value[1]); n++; }
    else console.warn('[assets] ui frame failed:', r.reason && r.reason.message);
  }
  return n;
}

export const getUiImage = (name) => uiImages.get(name);

// --- Tilesets and backdrops -------------------------------------------------
//
// These are drawn straight from their source image with drawImage rather than going through the
// sprite atlas: a ground tileset is sampled by rect thousands of times a frame and never needs
// the atlas's mirrored or hit-flash variants, and a backdrop is one big blit.

/** name -> { w, h, canvas } */
export const sheetImages = new Map();

/**
 * Punch a flat background colour out of a decoded image.
 *
 * Sheet rips are usually saved on a solid backdrop rather than with an alpha channel -- the PMD
 * status sheet is on teal -- so anything drawn from one arrives with a coloured box around it.
 */
function keyOut(img, hex, tol = 10) {
  const n = parseInt(hex.slice(1), 16);
  const kr = (n >> 16) & 255, kg = (n >> 8) & 255, kb = n & 255;
  const cx = img.canvas.getContext('2d', { willReadFrequently: true });
  const data = cx.getImageData(0, 0, img.w, img.h);
  const px = data.data;
  for (let i = 0; i < px.length; i += 4) {
    if (Math.abs(px[i] - kr) <= tol && Math.abs(px[i + 1] - kg) <= tol && Math.abs(px[i + 2] - kb) <= tol) {
      px[i + 3] = 0;
    }
  }
  cx.putImageData(data, 0, 0);
}

export async function loadImages(manifest) {
  const m = (manifest && manifest.images) || {};
  const names = Object.keys(m);
  if (!names.length) return 0;
  const results = await Promise.allSettled(names.map((n) => {
    const e = m[n];
    const url = typeof e === 'string' ? e : e.src;
    return decodeDrawable(url).then((img) => {
      if (typeof e === 'object' && e.key) keyOut(img, e.key, e.tolerance);
      return [n, img, e];
    });
  }));
  let loaded = 0;
  for (let i = 0; i < results.length; i++) {
    const r = results[i];
    if (r.status === 'fulfilled') { sheetImages.set(r.value[0], r.value[1]); loaded++; continue; }
    // An `optional` image is one the game is DESIGNED to run without -- a custom title logo, a
    // wheel face the player may never supply. Warning about those every boot would train
    // everyone to ignore this channel, which is where real missing assets are reported.
    const e = m[names[i]];
    if (typeof e === 'object' && e.optional) continue;
    console.warn('[assets] image failed:', r.reason && r.reason.message);
  }
  return loaded;
}

export const getImage = (name) => sheetImages.get(name);

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

/**
 * A random track for a key, or null if none supplied (caller falls back to the chiptune).
 *
 * `exclude` is the track that just finished. Picking from the remainder means a stage with three
 * songs actually cycles through them instead of occasionally playing the same one twice in a row,
 * which reads as "the music looped" -- the exact thing the playlist exists to avoid.
 */
export function pickMusic(key, rng, exclude) {
  const list = musicTracks.get(key);
  if (!list || !list.length) return null;
  if (list.length === 1) return list[0];
  const pool = exclude ? list.filter((u) => u !== exclude) : list;
  const from = pool.length ? pool : list;
  return from[Math.floor((rng ? rng() : Math.random()) * from.length) % from.length];
}

/** How many tracks are listed for a key. 0 means "no supplied music, use the chiptune". */
export const musicCount = (key) => (musicTracks.get(key) || []).length;

export const getSheet = (shape) => sheetOverrides.get(shape);
export const getPortrait = (name) => portraits.get(name);
