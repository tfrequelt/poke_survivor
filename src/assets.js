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

  const sprites = (manifest && manifest.sprites) || {};
  const names = Object.keys(sprites);
  if (!names.length) return { loaded: 0, failed: 0 };

  // allSettled, not all: one bad file must not reject the batch.
  const results = await Promise.allSettled(
    names.map((name) => decode(sprites[name]).then((px) => [name, px])),
  );

  let loaded = 0, failed = 0;
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
