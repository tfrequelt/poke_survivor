// L4 -- may import L0-L3, read-only. Drawing only; owns no state.
//
// The Mystery Dungeon message window, drawn in code.
//
// PMD's window is not a plain box: it is a rounded rectangle with a *double* border -- a bright
// cream line outside a mid blue line -- over a deep blue interior that is lighter at the top than
// at the bottom, with a small ornament tucked into each corner. Those four things together are
// what make a box read as "Mystery Dungeon" rather than "generic roguelite panel", and each one
// is a couple of spans, so all of it is drawn rather than shipped as art.
//
// Everything here draws with integer fillRect spans and never with a path: at 640x360 a single
// antialiased edge is a visibly blurry pixel, and rounded corners are the whole point.

import { ctx } from './render.js';
import { drawText, drawTextCentered, textWidth } from './sprites.js';
import { getUiImage } from './assets.js';

/** The window palette. `accent` is per-window so cards can stay colour-coded. */
export const WIN = {
  edge: '#08080f',        // outer silhouette, one pixel all the way round
  accent: '#eef3ff',      // the bright outer border line
  mid: '#2a4fa8',         // the blue border line inside it
  fill: '#0e1c47',        // interior, bottom
  fillTop: '#162a66',     // interior, top -- PMD's interior is a soft vertical gradient
  ink: 'white',
  inkDim: 'dim',
};

/**
 * A rounded rectangle in integer spans.
 *
 * The corner is a straight 45-degree chamfer rather than a true quarter circle: at radius 3-4 a
 * circle and a chamfer differ by less than a pixel, and the chamfer is exact.
 */
export function rrect(x, y, w, h, r, color) {
  if (w <= 0 || h <= 0) return;
  x |= 0; y |= 0; w |= 0; h |= 0;
  const rad = Math.min(r, (w >> 1), (h >> 1));
  ctx.fillStyle = color;
  ctx.fillRect(x, y + rad, w, h - rad * 2);
  for (let i = 0; i < rad; i++) {
    const inset = rad - i;                       // row i is inset by this much on each side
    ctx.fillRect(x + inset, y + i, w - inset * 2, 1);
    ctx.fillRect(x + inset, y + h - 1 - i, w - inset * 2, 1);
  }
}

/**
 * The frame itself: four concentric rounded rings, then the interior gradient, then the corner
 * ornaments. Returns the interior rect so callers can lay text out without recomputing the inset.
 */
/**
 * Draw a supplied frame image as a nine-slice. Returns false if there is no such image, which is
 * the normal case -- the drawn frame below is the default, not the fallback.
 */
function nineSlice(name, x, y, w, h) {
  const img = getUiImage(name);
  if (!img) return false;
  const c = Math.min(img.corner, Math.floor(w / 2), Math.floor(h / 2));
  const sw = img.w - c * 2, sh = img.h - c * 2;   // source middle
  const dw = w - c * 2, dh = h - c * 2;           // destination middle
  const src = img.canvas;
  // corners
  ctx.drawImage(src, 0, 0, c, c, x, y, c, c);
  ctx.drawImage(src, img.w - c, 0, c, c, x + w - c, y, c, c);
  ctx.drawImage(src, 0, img.h - c, c, c, x, y + h - c, c, c);
  ctx.drawImage(src, img.w - c, img.h - c, c, c, x + w - c, y + h - c, c, c);
  // edges
  if (dw > 0) {
    ctx.drawImage(src, c, 0, sw, c, x + c, y, dw, c);
    ctx.drawImage(src, c, img.h - c, sw, c, x + c, y + h - c, dw, c);
  }
  if (dh > 0) {
    ctx.drawImage(src, 0, c, c, sh, x, y + c, c, dh);
    ctx.drawImage(src, img.w - c, c, c, sh, x + w - c, y + c, c, dh);
  }
  if (dw > 0 && dh > 0) ctx.drawImage(src, c, c, sw, sh, x + c, y + c, dw, dh);
  return true;
}

export function panel(x, y, w, h, opts) {
  const o = opts || {};
  // A frame image supplied in the manifest replaces the drawn one wholesale. The accent colour
  // has nowhere to go in that case, so colour-coded cards lose their tint -- which is the trade
  // the person supplying the art is making.
  if (nineSlice(o.frame || 'window', x, y, w, h)) return { x: x + 6, y: y + 6, w: w - 12, h: h - 12 };

  const accent = o.accent || WIN.accent;
  const fill = o.fill || WIN.fill;
  const fillTop = o.fillTop || (o.fill ? o.fill : WIN.fillTop);
  const r = o.radius === undefined ? 4 : o.radius;

  rrect(x, y, w, h, r, WIN.edge);
  rrect(x + 1, y + 1, w - 2, h - 2, r, accent);
  rrect(x + 2, y + 2, w - 4, h - 4, r - 1, o.mid || WIN.mid);
  rrect(x + 3, y + 3, w - 6, h - 6, r - 1, fill);

  // Interior gradient, as two extra bands rather than a real gradient: a canvas gradient over a
  // 30px-tall box at this resolution is three barely distinguishable colours anyway.
  if (fillTop !== fill) {
    const bandH = Math.max(2, Math.round((h - 6) * 0.42));
    rrect(x + 3, y + 3, w - 6, bandH, r - 1, fillTop);
    ctx.fillStyle = mix(fillTop, fill);
    ctx.fillRect(x + 4, y + 3 + bandH, w - 8, 1);
  }

  // Corner ornaments: a 2x2 pip in the accent colour, tucked inside each corner.
  if (o.ornaments !== false && w > 18 && h > 18) {
    ctx.fillStyle = accent;
    const i = 4;
    ctx.fillRect(x + i, y + i, 2, 2);
    ctx.fillRect(x + w - i - 2, y + i, 2, 2);
    ctx.fillRect(x + i, y + h - i - 2, 2, 2);
    ctx.fillRect(x + w - i - 2, y + h - i - 2, 2, 2);
  }

  return { x: x + 4, y: y + 4, w: w - 8, h: h - 8 };
}

/** Halfway between two '#rrggbb' strings. Used for the one-pixel gradient seam. */
function mix(a, b) {
  const pa = parseInt(a.slice(1), 16), pb = parseInt(b.slice(1), 16);
  const r = (((pa >> 16) & 255) + ((pb >> 16) & 255)) >> 1;
  const g = (((pa >> 8) & 255) + ((pb >> 8) & 255)) >> 1;
  const c = ((pa & 255) + (pb & 255)) >> 1;
  return `#${((1 << 24) | (r << 16) | (g << 8) | c).toString(16).slice(1)}`;
}

/** Interior colours for a highlighted card, so "selected" reads without changing the frame. */
export const WIN_SELECTED = { fill: '#1b3274', fillTop: '#27469f' };

/** A name tab that sits astride the top edge of a window, PMD's speaker label. */
export function titleTab(x, y, label, opts) {
  const o = opts || {};
  const text = label.toUpperCase();
  const w = textWidth(text) + 12;
  const h = 13;
  rrect(x, y, w, h, 3, WIN.edge);
  rrect(x + 1, y + 1, w - 2, h - 2, 3, o.accent || WIN.accent);
  rrect(x + 2, y + 2, w - 4, h - 4, 2, o.fill || '#2a4fa8');
  drawText(ctx, text, x + 6, y + 3, o.ink || 'white');
  return w;
}

/**
 * The blinking "more text" chevron PMD parks in the bottom-right of a window.
 * `t` is any monotonically rising time in seconds.
 */
export function moreArrow(x, y, t) {
  if ((t * 2) % 1 > 0.55) return;
  ctx.fillStyle = WIN.edge;
  ctx.fillRect(x - 4, y - 1, 9, 6);
  for (let i = 0; i < 4; i++) {
    ctx.fillStyle = i < 1 ? '#ffffff' : '#ffd166';
    ctx.fillRect(x - 3 + i, y + i, (3 - i) * 2 + 1, 1);
  }
}

/**
 * A complete dialogue window: frame, wrapped lines, optional speaker tab and chevron.
 *
 * Height is derived from the line count rather than passed in, because a message box that is
 * taller than its text is the single most obvious way a hand-rolled window looks wrong.
 */
export function messageWindow(x, y, w, lines, opts) {
  const o = opts || {};
  const lh = o.lineHeight || 10;
  const h = Math.max(24, lines.length * lh + 14);
  if (o.speaker) titleTab(x + 6, y - 7, o.speaker, o);
  const inner = panel(x, y, w, h, o);
  let ty = y + 8;
  for (const line of lines) {
    if (o.center) drawTextCentered(ctx, line, x + w / 2, ty, o.ink || 'white');
    else drawText(ctx, line, inner.x + 3, ty, o.ink || 'white');
    ty += lh;
  }
  if (o.more !== undefined) moreArrow(x + w - 9, y + h - 9, o.more);
  return h;
}

/**
 * A value bar, 0..1. Notched rather than smooth so a step is visible at a glance and the player
 * can see they are at, say, seven tenths without a number being spelled out.
 */
export function slider(x, y, w, v, opts) {
  const o = opts || {};
  const steps = o.steps || 10;
  const h = 7;
  ctx.fillStyle = WIN.edge;
  ctx.fillRect(x - 1, y - 1, w + 2, h + 2);
  ctx.fillStyle = '#12224e';
  ctx.fillRect(x, y, w, h);

  const gap = 1;
  const cell = (w - gap * (steps - 1)) / steps;
  const on = Math.round(v * steps);
  for (let i = 0; i < steps; i++) {
    ctx.fillStyle = i < on ? (o.accent || '#7ac8ff') : '#24386e';
    ctx.fillRect(Math.round(x + i * (cell + gap)), y + 1, Math.max(1, Math.round(cell)), h - 2);
  }
}

/** Greedy word wrap for the fixed-width pixel font. */
export function wrap(text, maxChars) {
  const words = String(text || '').toUpperCase().split(' ');
  const lines = [];
  let line = '';
  for (const word of words) {
    const candidate = line ? `${line} ${word}` : word;
    if (candidate.length > maxChars && line) {
      lines.push(line);
      line = word;
    } else {
      line = candidate;
    }
  }
  if (line) lines.push(line);
  return lines;
}
