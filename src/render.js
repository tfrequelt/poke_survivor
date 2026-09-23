// L4 -- may import L0-L3, read-only on L3.
// Canvas sizing and the integer blit, the camera, the background, and frame presentation.

import { G } from './state.js';
import { clamp, damp, hash2, TAU } from './util.js';

export const VW = 640;   // internal render width  -- world units ARE render pixels
export const VH = 360;   // internal render height -- 640x360 * 3 = 1920x1080 exactly
export const HALF_W = VW / 2;
export const HALF_H = VH / 2;

// The offscreen buffer everything draws into, always exactly VW x VH.
export const game = document.createElement('canvas');
game.width = VW;
game.height = VH;
export const ctx = game.getContext('2d', { alpha: false });
ctx.imageSmoothingEnabled = false;

// The on-screen canvas. Only ever receives one drawImage per frame.
let view = null;
let vctx = null;
export let scale = 1;    // integer device-pixel scale factor

export function initRender() {
  view = document.getElementById('view');
  vctx = view.getContext('2d', { alpha: false });
  vctx.imageSmoothingEnabled = false;

  resize();
  window.addEventListener('resize', scheduleResize);
  window.addEventListener('orientationchange', scheduleResize);
  // devicePixelRatio changes when the window moves between monitors with different scaling.
  matchMedia(`(resolution: ${devicePixelRatio}dppx)`).addEventListener?.('change', scheduleResize);
}

let resizePending = false;
function scheduleResize() {
  if (resizePending) return;
  resizePending = true;
  requestAnimationFrame(() => { resizePending = false; resize(); });
}

/**
 * The single most important function for image quality.
 *
 * A canvas sized in CSS pixels with `image-rendering: pixelated` looks WRONG at a non-integer
 * devicePixelRatio -- and Windows defaults to 125% on a great many laptops, giving dpr 1.25.
 * At that ratio some game-pixel rows land on 3 device pixels and their neighbours on 4, so the
 * sprites visibly shimmer and the art looks dirty.
 *
 * The fix: choose an INTEGER device-pixel scale `k` first, size the backbuffer to VW*k x VH*k
 * device pixels, then derive the CSS size back down by dividing by dpr. Every game pixel is then
 * exactly k x k device pixels, whatever the display scaling is.
 */
export function resize() {
  const dpr = window.devicePixelRatio || 1;
  const cssFit = Math.min(window.innerWidth / VW, window.innerHeight / VH);
  const k = Math.max(1, Math.floor(cssFit * dpr));

  scale = k;
  view.width = VW * k;
  view.height = VH * k;
  view.style.width = (VW * k / dpr) + 'px';
  view.style.height = (VH * k / dpr) + 'px';
  vctx.imageSmoothingEnabled = false;

  // DOM screens are positioned over the canvas, so they need the same box and a scale hook.
  const screens = document.getElementById('screens');
  if (screens) {
    screens.style.width = view.style.width;
    screens.style.height = view.style.height;
    screens.style.setProperty('--scale', String(k / dpr));
  }
}

// --- Camera -----------------------------------------------------------------

let shakeX = 0, shakeY = 0;

/** Snap the camera to a world position immediately (run start, teleports). */
export function snapCamera(x, y) {
  G.cam.x = x;
  G.cam.y = y;
}

export function updateCamera(dt) {
  const p = G.player;
  if (p) {
    // A touch of lag makes movement feel weighty without ever letting the player near the edge.
    G.cam.x = damp(G.cam.x, p.x, 0.0001, dt);
    G.cam.y = damp(G.cam.y, p.y, 0.0001, dt);
  }

  // Trauma-based shake: callers add trauma, offset scales with its square so small hits are subtle.
  const c = G.cam;
  c.trauma = Math.max(0, c.trauma - dt * 1.8);
  const amount = c.trauma * c.trauma * 6;
  if (amount > 0.01) {
    const t = G.tick;
    shakeX = Math.sin(t * 1.7) * amount;
    shakeY = Math.cos(t * 2.3) * amount;
  } else {
    shakeX = 0; shakeY = 0;
  }
}

export function addShake(amount) {
  G.cam.trauma = clamp(G.cam.trauma + amount, 0, 1);
}

/** Camera top-left in world space, rounded so the world never lands on half pixels. */
export function camLeft()  { return Math.round(G.cam.x - HALF_W + shakeX); }
export function camTop()   { return Math.round(G.cam.y - HALF_H + shakeY); }

/** World -> screen. Both are in the same unit, so this is a translation only. */
export const toScreenX = (wx) => wx - camLeft();
export const toScreenY = (wy) => wy - camTop();

/** Is a world-space circle worth drawing/updating? `margin` widens the test. */
export function inView(wx, wy, r, margin = 0) {
  const sx = toScreenX(wx), sy = toScreenY(wy);
  const m = r + margin;
  return sx > -m && sx < VW + m && sy > -m && sy < VH + m;
}

// --- Background -------------------------------------------------------------
// One fillRect for the whole screen, then sparse decoration drawn only for visible tiles.
// Tile contents come from hash2(), so an infinite field costs zero storage.

const TILE = 32;

export function drawBackground(stage) {
  const pal = (stage && stage.ground) || DEFAULT_GROUND;

  ctx.fillStyle = pal.base;
  ctx.fillRect(0, 0, VW, VH);

  const left = camLeft(), top = camTop();
  const tx0 = Math.floor(left / TILE), ty0 = Math.floor(top / TILE);
  const tx1 = Math.floor((left + VW) / TILE), ty1 = Math.floor((top + VH) / TILE);

  for (let ty = ty0; ty <= ty1; ty++) {
    for (let tx = tx0; tx <= tx1; tx++) {
      const h = hash2(tx, ty);
      if (h > pal.density) continue;

      const ox = (hash2(tx + 9871, ty) * (TILE - 6)) | 0;
      const oy = (hash2(tx, ty + 7717) * (TILE - 6)) | 0;
      const sx = tx * TILE - left + ox;
      const sy = ty * TILE - top + oy;

      // Two decoration tiers keep the ground from reading as a regular grid.
      if (h < pal.density * 0.4) {
        ctx.fillStyle = pal.detailA;
        ctx.fillRect(sx, sy, 3, 2);
        ctx.fillRect(sx + 1, sy - 1, 1, 1);
      } else {
        ctx.fillStyle = pal.detailB;
        ctx.fillRect(sx, sy, 2, 1);
      }
    }
  }
}

const DEFAULT_GROUND = {
  base: '#2f7a3a',
  detailA: '#3f9a4a',
  detailB: '#276a32',
  density: 0.26,
};

// --- Frame presentation -----------------------------------------------------

/** Blit the internal buffer to the screen. One drawImage, ~0.3-0.5ms at 1080p. */
export function present() {
  vctx.drawImage(game, 0, 0, VW, VH, 0, 0, view.width, view.height);
}

/**
 * Debug overlay, drawn to the VIEW canvas after the blit so it renders at native device
 * resolution -- crisp text without needing the pixel font, and it costs the game nothing.
 */
export function drawDebugOverlay(lines) {
  if (!lines.length) return;
  const pad = 6, lh = 14;
  vctx.save();
  vctx.font = '12px Consolas, monospace';
  vctx.textBaseline = 'top';
  let w = 0;
  for (const l of lines) w = Math.max(w, vctx.measureText(l).width);
  vctx.fillStyle = 'rgba(8,8,18,0.78)';
  vctx.fillRect(0, 0, w + pad * 2, lines.length * lh + pad * 2);
  vctx.fillStyle = '#9fe8a0';
  for (let i = 0; i < lines.length; i++) {
    vctx.fillText(lines[i], pad, pad + i * lh);
  }
  vctx.restore();
}

/** Filled circle helper used before the sprite atlas exists, and for FX afterwards. */
export function circle(sx, sy, r, color) {
  ctx.fillStyle = color;
  ctx.beginPath();
  ctx.arc(sx, sy, r, 0, TAU);
  ctx.fill();
}
