// Sprite authoring bootstrap.
//
// Hand-typing a 32x32 grid as 32 string literals is slow and miscounts silently. This describes
// each creature with drawing primitives instead, then EMITS literal character grids into
// src/data/shapes.js -- which stay hand-editable afterwards.
//
// The player forms are 32x32 and built from creature-specific construction (Wooper's gill fronds,
// Eevee's ruff and tail, Decidueye's hood); enemies stay 16-20px generic shapes recoloured by
// palette. Re-run to regenerate:
//
//   node tools/spritegen.mjs             # print ASCII previews of every shape
//   node tools/spritegen.mjs --only=eevee
//   node tools/spritegen.mjs --write     # (re)write src/data/shapes.js

import { writeFileSync } from 'node:fs';

// --- Tiny raster canvas -----------------------------------------------------

class Grid {
  constructor(w, h) {
    this.w = w; this.h = h;
    this.g = Array.from({ length: h }, () => Array(w).fill('.'));
  }
  px(x, y, c) {
    x = Math.round(x); y = Math.round(y);
    if (c !== undefined && x >= 0 && y >= 0 && x < this.w && y < this.h) this.g[y][x] = c;
  }
  get(x, y) {
    return (x >= 0 && y >= 0 && x < this.w && y < this.h) ? this.g[y][x] : '.';
  }
  rect(x, y, w, h, c) {
    for (let j = 0; j < h; j++) for (let i = 0; i < w; i++) this.px(x + i, y + j, c);
  }
  /** Solid ellipse. cx/cy may be half-integers, which is how you get even-width symmetry. */
  ellipse(cx, cy, rx, ry, c) {
    for (let y = Math.floor(cy - ry); y <= Math.ceil(cy + ry); y++) {
      for (let x = Math.floor(cx - rx); x <= Math.ceil(cx + rx); x++) {
        const dx = (x - cx) / rx, dy = (y - cy) / ry;
        if (dx * dx + dy * dy <= 1.0) this.px(x, y, c);
      }
    }
  }
  /** Ellipse clipped to the upper or lower half, for caps and bellies. */
  halfEllipse(cx, cy, rx, ry, c, upper = true) {
    for (let y = Math.floor(cy - ry); y <= Math.ceil(cy + ry); y++) {
      if (upper ? y > cy : y < cy) continue;
      for (let x = Math.floor(cx - rx); x <= Math.ceil(cx + rx); x++) {
        const dx = (x - cx) / rx, dy = (y - cy) / ry;
        if (dx * dx + dy * dy <= 1.0) this.px(x, y, c);
      }
    }
  }
  /**
   * Four-pointed star (an astroid). Four overlapping triangles just make a diamond blob at this
   * size; a superellipse with an exponent below 1 gives concave sides and real points.
   */
  star4(cx, cy, rx, ry, c, sharp = 0.5) {
    for (let y = Math.floor(cy - ry); y <= Math.ceil(cy + ry); y++) {
      for (let x = Math.floor(cx - rx); x <= Math.ceil(cx + rx); x++) {
        const dx = Math.abs(x - cx) / rx, dy = Math.abs(y - cy) / ry;
        if (Math.pow(dx, sharp) + Math.pow(dy, sharp) <= 1.0) this.px(x, y, c);
      }
    }
  }
  /** Leaf: a pointed almond with a vein, pointing right. */
  leafShape(cx, cy, rx, ry, c) {
    for (let y = Math.floor(cy - ry); y <= Math.ceil(cy + ry); y++) {
      for (let x = Math.floor(cx - rx); x <= Math.ceil(cx + rx); x++) {
        const dx = (x - cx) / rx, dy = (y - cy) / ry;
        // Taper the vertical extent toward the tip so it comes to a point instead of a round end.
        const taper = 1 - Math.max(0, dx) * 0.55;
        if (dx * dx + (dy / taper) * (dy / taper) <= 1.0) this.px(x, y, c);
      }
    }
  }
  /** A tapering line from (x0,y0) to (x1,y1), `w0` px wide at the start and `w1` at the end. */
  stalk(x0, y0, x1, y1, w0, w1, c) {
    const dx = x1 - x0, dy = y1 - y0;
    const len = Math.hypot(dx, dy) || 1;
    const steps = Math.ceil(len * 2);
    const nx = -dy / len, ny = dx / len;
    for (let i = 0; i <= steps; i++) {
      const t = i / steps;
      const cx = x0 + dx * t, cy = y0 + dy * t;
      const w = (w0 + (w1 - w0) * t) / 2;
      for (let o = -w; o <= w; o += 0.5) this.px(cx + nx * o, cy + ny * o, c);
    }
  }

  /**
   * A branching frond: a stalk that splits into `forks` smaller stalks at its tip.
   * This is the shape an ellipse or triangle cannot give you -- Wooper's gills are branches,
   * not horns, and that difference is most of why the old sprite read wrong.
   */
  branch(x, y, angle, len, width, forks, spread, c) {
    const tx = x + Math.cos(angle) * len;
    const ty = y + Math.sin(angle) * len;
    this.stalk(x, y, tx, ty, width, Math.max(1, width * 0.6), c);
    for (let i = 0; i < forks; i++) {
      const a = angle + (i - (forks - 1) / 2) * spread;
      this.stalk(tx, ty,
        tx + Math.cos(a) * len * 0.62,
        ty + Math.sin(a) * len * 0.62,
        Math.max(1, width * 0.6), 1, c);
    }
  }

  /** Stroked elliptical arc from a0 to a1 radians. Used for brow feathers and shockwaves. */
  arc(cx, cy, rx, ry, a0, a1, thickness, c) {
    const steps = Math.ceil(Math.max(rx, ry) * Math.abs(a1 - a0) * 2) + 4;
    for (let i = 0; i <= steps; i++) {
      const a = a0 + (a1 - a0) * (i / steps);
      for (let t = 0; t < thickness; t++) {
        this.px(cx + Math.cos(a) * (rx - t), cy + Math.sin(a) * (ry - t), c);
      }
    }
  }

  /**
   * Rounded triangle -- wide and round at the top, narrowing to a soft point at the bottom.
   * This is Rowlet's face disc, which is decidedly not an ellipse.
   */
  roundTri(cx, cy, w, h, c) {
    for (let y = Math.floor(cy - h / 2); y <= Math.ceil(cy + h / 2); y++) {
      const t = (y - (cy - h / 2)) / h;             // 0 at top, 1 at bottom
      // Wide near the top, tapering with a curve rather than a straight edge.
      const hw = (w / 2) * Math.sqrt(Math.max(0, 1 - Math.pow(Math.max(0, t - 0.15) / 0.85, 2.1)));
      for (let x = Math.round(cx - hw); x <= Math.round(cx + hw); x++) this.px(x, y, c);
    }
  }

  /** Explicit pixels from "x,y" pairs -- for the details that must land exactly. */
  pixels(list, c) {
    for (const p of list) this.px(p[0], p[1], c);
  }

  /** Mirror a list of pixels about a vertical axis, so a face only has to be authored once. */
  pixelsMirrored(list, axis, c) {
    for (const p of list) {
      this.px(p[0], p[1], c);
      this.px(axis * 2 - p[0], p[1], c);
    }
  }

  /** Filled triangle, used for ears, beaks and leaves. */
  tri(ax, ay, bx, by, cx2, cy2, c) {
    const minX = Math.floor(Math.min(ax, bx, cx2)), maxX = Math.ceil(Math.max(ax, bx, cx2));
    const minY = Math.floor(Math.min(ay, by, cy2)), maxY = Math.ceil(Math.max(ay, by, cy2));
    const area = (bx - ax) * (cy2 - ay) - (cx2 - ax) * (by - ay);
    if (area === 0) return;
    for (let y = minY; y <= maxY; y++) {
      for (let x = minX; x <= maxX; x++) {
        const w0 = ((bx - ax) * (y - ay) - (x - ax) * (by - ay)) / area;
        const w1 = ((x - ax) * (cy2 - ay) - (cx2 - ax) * (y - ay)) / area;
        if (w0 >= -0.02 && w1 >= -0.02 && w0 + w1 <= 1.02) this.px(x, y, c);
      }
    }
  }
  /** Mirror the left half onto the right -- perfect symmetry for free. */
  symmetrize() {
    for (let y = 0; y < this.h; y++) {
      for (let x = 0; x < (this.w >> 1); x++) this.g[y][this.w - 1 - x] = this.g[y][x];
    }
    return this;
  }
  /** Wrap every non-transparent pixel that touches transparency in `c`. */
  outline(c) {
    const ink = c || '1';
    const add = [];
    for (let y = 0; y < this.h; y++) {
      for (let x = 0; x < this.w; x++) {
        if (this.get(x, y) !== '.') continue;
        if (this.get(x - 1, y) !== '.' || this.get(x + 1, y) !== '.' ||
            this.get(x, y - 1) !== '.' || this.get(x, y + 1) !== '.') add.push([x, y]);
      }
    }
    for (const p of add) this.px(p[0], p[1], ink);
    return this;
  }
  /** Darken body pixels sitting directly on the outline -- cheap sense of volume. */
  underShade(from, to) {
    const add = [];
    for (let y = 0; y < this.h; y++) {
      for (let x = 0; x < this.w; x++) {
        if (this.get(x, y) === from && this.get(x, y + 1) === '1') add.push([x, y]);
      }
    }
    for (const p of add) this.px(p[0], p[1], to);
    return this;
  }
  rows() {
    // Trailing transparency is trimmed; the compiler pads rows back out to `w`.
    return this.g.map((r) => r.join('').replace(/\.+$/, ''));
  }
  toAscii() {
    const ink = { '.': ' ', '1': '#', '2': '+', '3': '%', '4': 'o', '5': '@', '6': '*', '7': 'x', '8': '=' };
    return this.g.map((r) => '|' + r.map((c) => ink[c] || c).join('') + '|').join('\n');
  }
}

// --- Creature definitions ---------------------------------------------------
// Palette slots are consistent across every sprite:
//   1 outline   2 shadow   3 body   4 light   5 eye   6 accent   7 shine   8 accent-dark

/**
 * Wooper: an enormous round head with three-pronged gills, a tiny body and stubby feet.
 * The head:body ratio IS the read -- Wooper is basically a head that walks.
 */
function wooper(bob) {
  const g = new Grid(40, 40), y = bob;
  const cx = 19.5;

  // The gills are BRANCHES, not horns: one frond per side that forks into three at the tip.
  // Drawn first so the head overlaps their roots and they grow from behind it.
  for (const dir of [-1, 1]) {
    const a = dir > 0 ? -0.42 : Math.PI + 0.42;
    g.branch(cx + dir * 8.5, 17 + y, a, 6.2, 4, 3, 0.62, '6');
  }

  g.ellipse(cx, 29 + y, 7.5, 7.0, '3');         // body, much smaller than the head
  g.ellipse(cx, 17 + y, 12.5, 10.5, '3');       // head, dominating the silhouette
  g.ellipse(cx, 12 + y, 7.5, 3.6, '4');         // forehead highlight

  for (const dir of [-1, 1]) {                  // tiny dot eyes, set low and wide
    const ex = Math.round(cx + dir * 5.5);
    g.rect(ex - 1, 16 + y, 2, 3, '5');
    g.px(ex - 1, 16 + y, '7');
  }
  g.rect(17, 22 + y, 6, 1, '1');                // the flat little mouth
  g.px(16, 21 + y, '1'); g.px(23, 21 + y, '1');

  g.rect(13, 35 + y, 5, 4, '2');                // stubby nub feet
  g.rect(22, 35 + y, 5, 4, '2');
  g.underShade('3', '2');
  return g.outline();
}

/**
 * Quagsire: taller and slouched where Wooper is round. Wide flat mouth, dorsal ridge,
 * gills reduced to nubs, arms at its sides.
 */
function quagsire(bob) {
  const g = new Grid(40, 40), y = bob;
  const cx = 19.5;

  for (const dir of [-1, 1]) {                   // gill nubs -- much reduced from Wooper's fronds
    const a = dir > 0 ? -0.5 : Math.PI + 0.5;
    g.branch(cx + dir * 9, 12 + y, a, 3.6, 3, 2, 0.7, '6');
  }

  g.ellipse(cx, 29 + y, 10.5, 10.0, '3');        // heavy slouched body
  g.ellipse(cx, 22 + y, 7.0, 5.5, '3');          // waist, so head and body read apart
  g.ellipse(7.5, 27 + y, 3.2, 5.5, '3');         // arms hanging at its sides
  g.ellipse(31.5, 27 + y, 3.2, 5.5, '3');
  g.ellipse(cx, 14 + y, 11.5, 9.5, '3');         // head
  g.halfEllipse(cx, 10 + y, 11.0, 5.5, '2', true);    // dark cap over the skull
  g.stalk(cx, 20 + y, cx, 34 + y, 3, 2, '2');    // dorsal ridge down the back

  for (const dir of [-1, 1]) {                   // small sleepy eyes
    const ex = Math.round(cx + dir * 5.5);
    g.rect(ex - 1, 13 + y, 2, 2, '5');
  }
  // The wide flat grin, running most of the width of the face -- Quagsire's signature.
  g.arc(cx, 16 + y, 8.0, 4.0, Math.PI * 0.12, Math.PI * 0.88, 2, '1');

  g.rect(12, 36 + y, 6, 3, '2');                 // feet
  g.rect(22, 36 + y, 6, 3, '2');
  g.underShade('3', '2');
  return g.outline();
}

/**
 * Eevee: oversized pointed ears, a thick cream neck ruff and a big bushy tail.
 * Those three things are the whole read -- without the ruff it is just a brown dog.
 *
 * `opts` lets the eeveelutions reuse this body plan with their own heads and tails.
 */
function eevee(bob, opts) {
  const o = opts || {};
  const g = new Grid(40, 40), y = bob;
  const cx = 17;

  // Tail first, so the ruff drawn later occludes its root and it sits BEHIND the body.
  if (o.tail === 'fin') {
    g.tri(29, 33 + y, 39, 12 + y, 33, 34 + y, '3');
    g.tri(30, 30 + y, 38, 17 + y, 35, 32 + y, '4');
  } else if (o.tail === 'spike') {
    g.tri(26, 34 + y, 38, 20 + y, 32, 36 + y, '4');
    g.tri(27, 30 + y, 37, 13 + y, 33, 32 + y, '4');
  } else {
    g.ellipse(31.5, 24 + y, 6.5, 8.0, o.tailColor || '4');
    g.ellipse(28.5, 32 + y, 5.0, 4.5, o.tailColor || '4');
  }

  g.ellipse(cx, 30 + y, 9.5, 7.5, '3');          // body
  g.rect(9, 34 + y, 4, 5, '2');                  // legs
  g.rect(16, 35 + y, 4, 4, '2');
  g.rect(22, 34 + y, 4, 5, '2');

  // The ruff: a wide cream collar that visually separates the head from the body.
  if (o.ruff !== false) g.ellipse(cx, 24 + y, 11.0, 5.0, o.ruffColor || '4');

  // Ears: tall, pointed, angled outward, with a darker inner surface.
  for (const dir of [-1, 1]) {
    const bx = cx + dir * 6;
    if (o.ears === 'spiky') {
      g.tri(bx - dir * 4, 17 + y, bx + dir * 5, 13 + y, bx + dir * 2.5, 2 + y, '3');
    } else {
      g.tri(bx - dir * 4.5, 18 + y, bx + dir * 4.5, 15 + y, bx + dir * 2.5, 3 + y, '3');
      g.tri(bx - dir * 2.5, 17 + y, bx + dir * 2.8, 14.5 + y, bx + dir * 2, 6.5 + y, '2');
    }
  }

  g.ellipse(cx, 16 + y, 9.0, 8.0, '3');          // head
  if (o.frill) {                                  // Vaporeon's head fins
    g.tri(8, 15 + y, 0, 7 + y, 9, 22 + y, '6');
    g.tri(26, 15 + y, 34, 7 + y, 25, 22 + y, '6');
  }
  if (o.mane) {                                   // Jolteon's spiky collar
    for (let i = -4; i <= 4; i++) {
      const bx = cx + i * 2.4;
      g.tri(bx - 1.8, 23 + y, bx + 1.8, 23 + y, bx + i * 1.3, 33 + y, '3');
    }
  }
  g.ellipse(cx, 10.5 + y, 5.5, 2.8, o.tuftColor || '4');   // forehead tuft
  g.ellipse(cx, 20 + y, 5.5, 3.6, o.tuftColor || '4');     // short muzzle

  for (const dir of [-1, 1]) {                    // eyes
    const ex = Math.round(cx + dir * 4.5);
    g.ellipse(ex, 15 + y, 1.8, 2.4, '5');
    g.px(ex - 1, 14 + y, '7');
  }
  g.rect(16, 19 + y, 2, 2, '8');                  // nose

  if (o.rings) {                                  // Umbreon's glowing bands
    g.ellipse(cx, 8 + y, 3.2, 1.6, '6');
    g.ellipse(10, 31 + y, 2.4, 1.4, '6');
    g.ellipse(24, 31 + y, 2.4, 1.4, '6');
  }

  g.underShade('3', '2');
  return g.outline();
}

const vaporeon = (bob) => eevee(bob, { tail: 'fin', frill: true, ruffColor: '4' });
const jolteon = (bob) => eevee(bob, { tail: 'spike', ears: 'spiky', mane: true, ruff: false });
const umbreon = (bob) => eevee(bob, { rings: true, tailColor: '3', ruffColor: '2', tuftColor: '2' });

/**
 * Rowlet: a brown sphere with a pale rounded-triangle face disc, dark brow feathers over big
 * eyes, a small orange beak and a leaf bowtie.
 *
 * The brow feathers and the SHAPE of the face disc are what carry the recognition. The previous
 * version had an elliptical disc, no brows, and a green body -- three of the four things that
 * actually say "Rowlet" were wrong.
 */
function rowlet(bob) {
  const g = new Grid(40, 40), y = bob;
  const cx = 19.5;

  // Two small leaf-feather tufts, drawn first so the skull overlaps their roots.
  g.stalk(18, 12 + y, 15.5, 5 + y, 3, 1, '3');
  g.stalk(21, 12 + y, 23.5, 5 + y, 3, 1, '3');

  g.ellipse(cx, 22 + y, 13.0, 12.5, '3');          // the sphere
  g.halfEllipse(cx, 20 + y, 12.5, 8.0, '2', true); // slightly darker crown

  // The face disc: wide and round at the brow, narrowing to a soft point at the chin.
  // Kept well inside the silhouette so the brown body still frames it.
  g.roundTri(cx, 21 + y, 19, 16, '4');

  for (const dir of [-1, 1]) {                      // big round eyes
    const ex = Math.round(cx + dir * 5);
    g.ellipse(ex, 21 + y, 2.4, 2.8, '5');
    g.px(ex - 1, 20 + y, '7');
  }

  // Brow feathers -- a thin brown arc riding just over each eye. THE Rowlet detail. Kept in the
  // shadow colour, not the outline colour, or they read as heavy cartoon eyebrows.
  g.arc(14.5, 21 + y, 3.8, 3.4, Math.PI * 1.18, Math.PI * 1.82, 2, '2');
  g.arc(24.5, 21 + y, 3.8, 3.4, Math.PI * 1.18, Math.PI * 1.82, 2, '2');

  // Small orange beak, low and central.
  g.tri(cx, 24 + y, 18, 27 + y, 21, 27 + y, '6');

  // Leaf bowtie, sat low on the chest with a gap under the beak so the two oranges stay apart.
  g.leafShape(13, 31.5 + y, 5.5, 2.4, '8');
  g.leafShape(26, 31.5 + y, 5.5, 2.4, '8');
  g.ellipse(cx, 31.5 + y, 1.8, 1.6, '6');

  g.rect(14, 35 + y, 4, 3, '6');                    // stubby feet
  g.rect(22, 35 + y, 4, 3, '6');
  g.underShade('3', '2');
  return g.outline();
}

/** Dartrix: taller than Rowlet, with a feathered fringe over one eye and leaf-blade shoulders. */
function dartrix(bob) {
  const g = new Grid(40, 40), y = bob;
  const cx = 19.5;

  g.ellipse(cx, 27 + y, 11.5, 12.0, '3');        // taller, less spherical than Rowlet
  g.ellipse(cx, 14 + y, 9.5, 9.0, '3');          // distinct head
  g.roundTri(cx, 15 + y, 15, 13, '4');           // face disc

  g.leafShape(7, 26 + y, 7.0, 3.5, '8');         // leaf-blade shoulders
  g.leafShape(32, 26 + y, 7.0, 3.5, '8');

  for (const dir of [-1, 1]) {                    // eyes
    const ex = Math.round(cx + dir * 4);
    g.ellipse(ex, 14 + y, 2.0, 2.4, '5');
  }
  g.arc(15.5, 13 + y, 3.4, 3.0, Math.PI * 1.18, Math.PI * 1.82, 2, '2');
  g.arc(23.5, 13 + y, 3.4, 3.0, Math.PI * 1.18, Math.PI * 1.82, 2, '2');

  // The fringe: a slab of feathers hanging over one eye. Dartrix's signature.
  g.tri(9, 4 + y, 24, 7 + y, 14, 19 + y, '2');
  g.tri(11, 5 + y, 21, 8 + y, 15, 16 + y, '3');

  g.tri(cx, 16 + y, 17.5, 20 + y, 21.5, 20 + y, '6');   // beak
  g.rect(14, 36 + y, 4, 3, '6');
  g.rect(22, 36 + y, 4, 3, '6');
  g.underShade('3', '2');
  return g.outline();
}

/**
 * Decidueye: the hardest of the nine. A hooded archer -- long neck, a pointed hood framing the
 * face, an arrow-fletch crest, and a leaf cloak flaring at the bottom.
 */
function decidueye(bob) {
  const g = new Grid(40, 40), y = bob;
  const cx = 19.5;

  // Wings read as a cloak but must stay SEPARATE from it, or the whole sprite collapses into one
  // green cone -- which is exactly what the previous version did.
  g.tri(9, 20 + y, 1, 33 + y, 12, 34 + y, '2');
  g.tri(30, 20 + y, 38, 33 + y, 27, 34 + y, '2');

  // Cloak: narrow and tapering, not a full-width skirt.
  g.tri(cx, 21 + y, 10, 38 + y, 29, 38 + y, '3');
  g.stalk(13, 30 + y, 12, 38 + y, 2, 2, '2');    // fold lines give the cloak depth
  g.stalk(26, 30 + y, 27, 38 + y, 2, 2, '2');

  g.ellipse(cx, 26 + y, 5.5, 8.0, '3');          // slender torso
  g.rect(17, 15 + y, 5, 8, '3');                 // long neck

  // The hood: a rounded cowl with a peak, sitting clearly above the shoulders.
  g.ellipse(cx, 11 + y, 9.5, 8.5, '2');
  g.tri(cx, 0 + y, 11, 12 + y, 28, 12 + y, '2');
  g.roundTri(cx, 12 + y, 11, 10, '4');           // pale face inside the hood

  // The arrow-fletch crest: a pale arrow pointing DOWN over the forehead, Decidueye's tell.
  g.stalk(cx, 2 + y, cx, 9 + y, 3, 3, '8');
  g.tri(cx, 12 + y, 16, 6 + y, 23, 6 + y, '8');

  for (const dir of [-1, 1]) {                    // narrow, sharp eyes
    const ex = Math.round(cx + dir * 3.5);
    g.rect(ex - 1, 13 + y, 2, 2, '5');
  }
  g.tri(cx, 15 + y, 18, 19 + y, 21, 19 + y, '6');   // beak

  g.rect(15, 37 + y, 4, 2, '6');                  // talons
  g.rect(21, 37 + y, 4, 2, '6');
  g.underShade('3', '2');
  return g.outline();
}

/** Generic small quadruped -- the workhorse enemy shape, recoloured per enemy. */
function quadSmall(bob) {
  const g = new Grid(16, 16), y = bob;
  g.ellipse(7.5, 10.0 + y, 4.8, 3.6, '3');
  g.ellipse(7.5, 6.4 + y, 3.8, 3.2, '3');
  for (const dir of [-1, 1]) {
    const bx = 7.5 + dir * 2.4;
    g.tri(bx - dir * 1.0, 5.0 + y, bx + dir * 1.8, 4.4 + y, bx + dir * 0.8, 1.2 + y, '3');
  }
  g.ellipse(7.5, 7.6 + y, 2.4, 1.4, '4');
  g.px(5, 6 + y, '5'); g.px(10, 6 + y, '5');
  g.rect(5, 12 + y, 2, 2, '2');
  g.rect(9, 12 + y, 2, 2, '2');
  g.underShade('3', '2');
  return g.outline();
}

/** Bat-ish flyer: wide wings that flap between frames. */
function bat(bob) {
  const g = new Grid(16, 16), y = bob;
  for (const dir of [-1, 1]) {
    g.tri(7.5 + dir * 2.2, 6.0 + y, 7.5 + dir * 7.6, 2.6 + y + bob * 3, 7.5 + dir * 6.4, 10.0 + y, '2');
  }
  g.ellipse(7.5, 8.0 + y, 3.0, 3.2, '3');
  for (const dir of [-1, 1]) {
    const bx = 7.5 + dir * 1.8;
    g.tri(bx - dir * 0.8, 6.2 + y, bx + dir * 1.4, 5.6 + y, bx + dir * 0.6, 3.0 + y, '3');
  }
  g.px(6, 8 + y, '5'); g.px(9, 8 + y, '5');
  g.rect(7, 10 + y, 2, 1, '4');
  g.underShade('3', '2');
  return g.outline();
}

/** Round heavy enemy -- the rock/tank archetype. */
function roundBig(bob) {
  const g = new Grid(20, 20), y = bob;
  g.ellipse(9.5, 11.0 + y, 7.2, 6.2, '3');
  g.halfEllipse(9.5, 9.4 + y, 6.8, 4.2, '4', true);
  g.rect(2, 14 + y, 4, 3, '3');
  g.rect(14, 14 + y, 4, 3, '3');
  g.px(6, 10 + y, '5'); g.px(7, 10 + y, '5');
  g.px(12, 10 + y, '5'); g.px(13, 10 + y, '5');
  g.rect(8, 13 + y, 4, 1, '1');
  g.underShade('3', '2');
  return g.outline();
}

/** Bug/grub enemy: segmented body with antennae. */
function bug(bob) {
  const g = new Grid(16, 16), y = bob;
  for (let i = 0; i < 3; i++) g.ellipse(7.5, 12.0 - i * 2.3 + y, 4.2 - i * 0.3, 2.1, '3');
  g.ellipse(7.5, 5.0 + y, 3.6, 3.0, '4');
  g.px(6, 5 + y, '5'); g.px(9, 5 + y, '5');
  g.px(5, 1 + y, '6'); g.px(10, 1 + y, '6');
  g.px(5, 2 + y, '6'); g.px(10, 2 + y, '6');
  g.underShade('3', '2');
  return g.outline();
}

// --- Projectiles and pickups (single frame) ---------------------------------

function bubble() {
  const g = new Grid(8, 8);
  g.ellipse(3.5, 3.5, 3.2, 3.2, '3');
  g.ellipse(3.5, 3.5, 2.0, 2.0, '4');
  g.px(2, 2, '7'); g.px(3, 2, '7');
  return g.outline();
}

/**
 * Four-point sparkle. At 8px a superellipse collapses (no pixel row sits exactly on the axis,
 * and the low exponent amplifies that), so the arms are drawn explicitly as a thin cross --
 * concave by construction, which is what makes it read as a star rather than a diamond.
 */
function star() {
  const g = new Grid(8, 8);
  g.rect(3, 1, 2, 6, '4');
  g.rect(1, 3, 6, 2, '4');
  g.px(2, 2, '3'); g.px(5, 2, '3'); g.px(2, 5, '3'); g.px(5, 5, '3');
  g.rect(3, 3, 2, 2, '7');
  return g.outline();
}

/** Leaf, pointing right (+x). The compiler bakes the other 15 angles. */
function leaf() {
  const g = new Grid(8, 8);
  g.leafShape(3.2, 3.5, 4.0, 2.0, '3');
  g.rect(1, 3, 4, 1, '4');
  g.px(6, 3, '4');
  return g.outline();
}

/** Night Shade: a crescent of shadow swallowing a disc. */
function iconShade() {
  const g = new Grid(16, 16);
  g.ellipse(7.5, 7.5, 6.4, 6.4, '3');
  g.ellipse(9.5, 6.5, 5.2, 5.2, '1');
  g.px(4, 6, '4'); g.px(5, 9, '4'); g.px(3, 8, '4');
  return g.outline();
}

/** Lick: a tongue unrolling to the right. */
function iconLick() {
  const g = new Grid(16, 16);
  g.stalk(1, 7.5, 12, 7.5, 5, 3, '3');
  g.ellipse(12.5, 7.5, 2.6, 2.2, '4');
  g.rect(1, 7, 9, 1, '4');
  g.px(13, 6, '7');
  return g.outline();
}

// --- The Gastly line --------------------------------------------------------
//
// These are FALLBACKS. The real art is the PMD sheets in assets/sprites/gastly|haunter|gengar,
// and these only ever appear if one of those folders is missing. They still have to be three
// visibly different creatures: a line whose fallbacks all look the same reintroduces exactly the
// "evolved into itself" confusion the evolution cutscene exists to avoid.

/** Gastly: a face suspended in a cloud of gas, with nothing solid about it at all. */
function gastly(bob) {
  const g = new Grid(40, 40), y = bob;
  const cx = 19.5;

  // The gas shroud: overlapping lobes, deliberately lumpy rather than a clean ellipse.
  for (const [ox, oy, rx, ry] of [
    [0, 26, 17, 9], [-11, 22, 8, 7], [11, 22, 8, 7],
    [-7, 31, 8, 6], [7, 31, 8, 6], [0, 18, 10, 6],
  ]) {
    g.ellipse(cx + ox, oy + y, rx, ry, '8');
  }
  g.ellipse(cx, 20 + y, 11.5, 10.5, '3');       // the dark inner sphere -- the creature itself
  g.ellipse(cx, 15 + y, 6.5, 3.4, '4');         // highlight across the top of the sphere

  for (const dir of [-1, 1]) {                  // wide, lidded, thoroughly unimpressed eyes
    const ex = Math.round(cx + dir * 5);
    g.ellipse(ex, 18 + y, 2.6, 2.2, '7');
    g.rect(ex - 1, 17 + y, 2, 3, '5');
  }
  g.arc(cx, 21 + y, 5, 4, 0.5, Math.PI - 0.5, 1, '5');   // a wide grin
  g.px(15, 25 + y, '5'); g.px(24, 25 + y, '5');          // two fangs
  return g.outline();
}

/** Haunter: a head and two detached hands, floating apart. The gap is the whole silhouette. */
function haunter(bob) {
  const g = new Grid(40, 40), y = bob;
  const cx = 19.5;

  g.ellipse(cx, 19 + y, 10.5, 9.5, '3');        // head
  g.tri(cx - 9, 13 + y, cx - 3, 4 + y, cx - 1, 14 + y, '3');    // two spiked ears
  g.tri(cx + 9, 13 + y, cx + 3, 4 + y, cx + 1, 14 + y, '3');
  g.ellipse(cx, 15 + y, 6.0, 3.0, '4');

  for (const dir of [-1, 1]) {
    const ex = Math.round(cx + dir * 4.5);
    g.ellipse(ex, 18 + y, 2.4, 2.0, '7');
    g.rect(ex - 1, 17 + y, 2, 3, '5');
  }
  g.arc(cx, 21 + y, 5.5, 4, 0.45, Math.PI - 0.45, 1, '5');
  g.px(15, 25 + y, '5'); g.px(24, 25 + y, '5');

  // The hands, floating clear of the body with a visible gap on each side.
  for (const dir of [-1, 1]) {
    const hx = cx + dir * 15;
    g.ellipse(hx, 30 + y, 4.2, 3.6, '3');
    for (let f = -1; f <= 1; f++) g.stalk(hx + f * 2, 28 + y, hx + f * 3, 24 + y, 2, 1, '3');
  }
  g.underShade('3', '2');
  return g.outline();
}

/** Gengar: squat, solid and grinning, with a ridged back and stubby limbs. */
function gengar(bob) {
  const g = new Grid(40, 40), y = bob;
  const cx = 19.5;

  g.ellipse(cx, 24 + y, 13.0, 12.0, '3');       // one heavy rounded body
  g.tri(cx - 11, 16 + y, cx - 5, 5 + y, cx - 2, 17 + y, '3');   // ears
  g.tri(cx + 11, 16 + y, cx + 5, 5 + y, cx + 2, 17 + y, '3');
  for (let i = -2; i <= 2; i++) {               // the spines down its back
    g.tri(cx + i * 5 - 2, 14 + y, cx + i * 5, 9 + y, cx + i * 5 + 2, 14 + y, '8');
  }
  g.ellipse(cx, 20 + y, 7.5, 3.4, '4');

  for (const dir of [-1, 1]) {
    const ex = Math.round(cx + dir * 5.5);
    g.ellipse(ex, 21 + y, 2.8, 2.2, '7');
    g.rect(ex - 1, 20 + y, 2, 3, '5');
  }
  // The grin: wide, and it reaches most of the way across the face.
  g.arc(cx, 24 + y, 8, 6, 0.35, Math.PI - 0.35, 1, '5');
  for (let x = cx - 6; x <= cx + 6; x += 3) g.px(Math.round(x), 29 + y, '5');

  g.ellipse(cx - 12, 31 + y, 3.4, 4.0, '3');    // stubby arms
  g.ellipse(cx + 12, 31 + y, 3.4, 4.0, '3');
  g.rect(13, 35 + y, 5, 4, '2');                // and feet
  g.rect(22, 35 + y, 5, 4, '2');
  g.underShade('3', '2');
  return g.outline();
}

// --- Weapon projectiles, second wave ----------------------------------------
//
// One sprite per delivery mechanism rather than one per weapon: the palette supplies the type,
// so a fang in `dark` and a fang in `electric` are the same 24 authored pixels. What must NOT be
// shared is the silhouette -- two weapons that read as the same shot in a different colour are
// exactly the thing the arsenal is trying to avoid.

/** A curved fang, pointing right. */
function projFang() {
  const g = new Grid(10, 8);
  g.tri(0, 1, 9, 4, 1, 6, '3');
  g.tri(1, 2, 7, 4, 2, 5, '4');
  g.px(8, 4, '7');
  return g.outline();
}

/** A sharp crystal shard. */
function projShard() {
  const g = new Grid(10, 10);
  g.tri(9, 5, 1, 1, 3, 5, '3');
  g.tri(9, 5, 3, 5, 1, 9, '4');
  g.px(4, 4, '7'); g.px(5, 5, '7');
  return g.outline();
}

/** A single feather, pointing right. */
function projFeather() {
  const g = new Grid(12, 8);
  g.leafShape(5.5, 3.5, 5.5, 2.6, '4');
  g.stalk(0, 4.5, 10, 3.5, 1, 1, '3');
  for (let i = 2; i < 9; i += 2) g.px(i, 2, '3');
  return g.outline();
}

/** A thin needle-quill. */
function projQuill() {
  const g = new Grid(11, 5);
  g.tri(10, 2, 0, 1, 0, 3, '4');
  g.rect(0, 2, 5, 1, '3');
  return g.outline();
}

/** A falling droplet, pointing down. */
function projDroplet() {
  const g = new Grid(7, 10);
  g.ellipse(3, 6.5, 2.8, 3.0, '3');
  g.tri(3, 0, 0.6, 6, 5.4, 6, '3');
  g.ellipse(3, 6.5, 1.5, 1.6, '4');
  g.px(2, 5, '7');
  return g.outline();
}

/** A swirling vortex, seen from above. */
function projVortex() {
  const g = new Grid(16, 16);
  for (let arm = 0; arm < 3; arm++) {
    const a0 = (arm / 3) * Math.PI * 2;
    g.arc(7.5, 7.5, 7, 7, a0, a0 + 1.5, 2, '3');
    g.arc(7.5, 7.5, 4.2, 4.2, a0 + 0.6, a0 + 2.0, 2, '4');
  }
  g.ellipse(7.5, 7.5, 1.6, 1.6, '7');
  return g;
}

/** A spiked mine, sitting on the ground. */
function projMine() {
  const g = new Grid(12, 12);
  for (let i = 0; i < 8; i++) {
    const a = (i / 8) * Math.PI * 2;
    g.stalk(5.5 + Math.cos(a) * 2.5, 5.5 + Math.sin(a) * 2.5,
      5.5 + Math.cos(a) * 5.5, 5.5 + Math.sin(a) * 5.5, 2, 1, '3');
  }
  g.ellipse(5.5, 5.5, 3.4, 3.4, '3');
  g.ellipse(5.5, 5.5, 2.0, 2.0, '4');
  g.px(4, 4, '7');
  return g.outline();
}

/** A squat coil, the turret body. */
function projCoil() {
  const g = new Grid(12, 14);
  g.rect(3, 9, 6, 4, '2');
  g.ellipse(5.5, 12, 4.4, 1.8, '3');
  for (let y = 3; y < 10; y += 2) g.rect(3, y, 6, 1, '3');
  for (let y = 4; y < 10; y += 2) g.rect(4, y, 4, 1, '4');
  g.rect(5, 0, 2, 4, '4');
  g.px(5, 0, '7'); g.px(6, 0, '7');
  return g.outline();
}

/** A seed with a sprouting tip. */
function projSeed() {
  const g = new Grid(9, 9);
  g.ellipse(4, 5.5, 3.0, 3.2, '3');
  g.ellipse(3.4, 5, 1.6, 1.8, '4');
  g.stalk(4, 2.5, 4, 0, 1, 1, '6');
  g.px(3, 1, '6'); g.px(5, 1, '6');
  return g.outline();
}

/** A barbed thorn vine segment, pointing right. */
function projThorn() {
  const g = new Grid(14, 9);
  g.stalk(0, 4.5, 13, 4.5, 3, 1, '3');
  g.tri(4, 4, 6, 0, 7, 4, '4');
  g.tri(7, 5, 9, 9, 10, 5, '4');
  g.tri(9, 4, 11, 1, 12, 4, '4');
  return g.outline();
}

/** A lidless ghostly eye. */
function projEye() {
  const g = new Grid(12, 9);
  g.ellipse(5.5, 4.5, 5.4, 3.6, '3');
  g.ellipse(5.5, 4.5, 3.0, 2.8, '4');
  g.ellipse(5.5, 4.5, 1.4, 2.0, '1');
  g.px(4, 3, '7');
  return g.outline();
}

/** A clenched fist, thrown right. */
function projFist() {
  const g = new Grid(11, 10);
  g.ellipse(6, 4.5, 4.2, 4.0, '3');
  g.rect(2, 3, 4, 4, '3');
  for (let y = 2; y < 7; y += 2) g.rect(7, y, 3, 1, '4');
  g.ellipse(5, 3, 2.0, 1.4, '4');
  return g.outline();
}

/** A crescent slash, opening right. */
function projBlade() {
  const g = new Grid(14, 16);
  g.arc(1, 8, 12, 7.5, -1.15, 1.15, 3, '3');
  g.arc(1, 8, 10.5, 6.2, -1.0, 1.0, 2, '4');
  g.px(11, 3, '7'); g.px(12, 8, '7'); g.px(11, 13, '7');
  return g.outline();
}

/** A grinning skull. */
function projSkull() {
  const g = new Grid(11, 11);
  g.ellipse(5, 4.5, 4.4, 4.0, '4');
  g.rect(3, 7, 5, 3, '4');
  g.ellipse(3.2, 4.2, 1.5, 1.6, '1');
  g.ellipse(6.8, 4.2, 1.5, 1.6, '1');
  for (let x = 3; x <= 7; x += 2) g.px(x, 9, '1');
  return g.outline();
}

/** A small four-legged familiar, for the companion weapons. */
function projHound() {
  const g = new Grid(14, 12);
  g.ellipse(6, 6, 4.6, 3.2, '3');
  g.ellipse(10.5, 4.5, 2.8, 2.4, '3');
  g.tri(9, 2.5, 10, 0, 11, 2.5, '3');
  g.tri(11, 2.5, 12, 0, 13, 2.5, '3');
  g.stalk(2, 6, 0, 2, 2, 1, '3');
  g.rect(3, 8, 2, 3, '2'); g.rect(8, 8, 2, 3, '2');
  g.ellipse(5, 5, 2.4, 1.4, '4');
  g.px(11, 4, '5');
  return g.outline();
}

/** A hooked claw, three talons, pointing right. */
function projClaw() {
  const g = new Grid(12, 12);
  for (let i = 0; i < 3; i++) {
    const y = 2 + i * 3.5;
    g.stalk(0, y, 9, y - 0.5, 2, 1, '4');
    g.px(10, Math.round(y) - 1, '3');
  }
  return g.outline();
}

/** A blunt chunk of earth thrown up by the ground weapons. */
function projBoulder() {
  const g = new Grid(14, 12);
  g.tri(7, 0, 0, 7, 13, 6, '3');
  g.tri(0, 7, 13, 6, 6, 11, '3');
  g.tri(4, 3, 9, 4, 6, 7, '4');
  g.px(3, 6, '2'); g.px(10, 8, '2');
  return g.outline();
}

/** A ring segment, for the expanding nova fronts. */
function projRing() {
  const g = new Grid(16, 16);
  g.arc(7.5, 7.5, 7.5, 7.5, 0, Math.PI * 2, 2, '3');
  g.arc(7.5, 7.5, 5.5, 5.5, 0, Math.PI * 2, 1, '4');
  return g;
}

// --- Ability FX -------------------------------------------------------------

/**
 * Homing Leaf's blade. Deliberately much larger than proj_leaf (14px against 8px) and outlined
 * through palette slot 1, which the `leafblade` palette sets to purple -- so the outline colour
 * is a palette decision rather than something baked into the pixels.
 */
function fxLeafBlade() {
  const g = new Grid(18, 16);
  g.leafShape(7.5, 7.5, 7.5, 4.2, '3');
  g.leafShape(7.0, 6.2, 5.2, 1.5, '4');       // a highlight along the upper edge only
  for (let x = 3; x <= 12; x++) g.px(x, 7, '8');   // central vein, one pixel, darker than body
  g.px(6, 6, '8'); g.px(7, 5, '8');                // two short side veins
  g.px(6, 8, '8'); g.px(7, 9, '8');
  g.px(11, 6, '7');
  g.stalk(1, 9, 4, 10.5, 2, 1, '3');          // stem
  return g.outline();
}

/**
 * One segment of a lightning strike, pointing DOWN. A strike stacks several of these with a
 * little horizontal jitter rather than stretching one tall sprite, because a vertically scaled
 * zigzag smears into mush and a stack of segments reads as a real bolt.
 */
function fxBolt() {
  const g = new Grid(12, 16);
  g.tri(7, 0, 3, 8, 7, 8, '3');
  g.tri(5, 15, 9, 7, 5, 7, '3');
  g.tri(6.5, 1, 4, 7.5, 6.5, 7.5, '4');
  g.tri(5.5, 14, 8, 7.5, 5.5, 7.5, '4');
  g.px(6, 7, '7'); g.px(5, 8, '7');
  return g.outline();
}

/** A breaking wave crest, travelling to the right (+x). Rotations are baked by the compiler. */
function fxWave() {
  const g = new Grid(20, 12);
  // The body of the crest: a tall arc leaning into its direction of travel.
  for (let y = 0; y < 12; y++) {
    const t = y / 11;
    const x0 = 3 + Math.sin(t * Math.PI) * 5;
    g.rect(x0, y, 7 - Math.abs(t - 0.5) * 4, 1, '3');
  }
  for (let y = 1; y < 11; y++) {
    const t = y / 11;
    const x0 = 5 + Math.sin(t * Math.PI) * 5;
    g.rect(x0, y, 3, 1, '4');
  }
  // Foam along the leading edge.
  for (let y = 1; y < 11; y += 2) {
    const t = y / 11;
    g.px(6 + Math.sin(t * Math.PI) * 6 + 3, y, '7');
  }
  g.px(14, 4, '7'); g.px(15, 6, '7'); g.px(14, 8, '7');
  return g.outline();
}

/** A drifting shadow wisp for Dark Pulse's lingering zone. */
function fxWisp() {
  // No eyes and no outline: with either, a drifting wisp reads as a small enemy, and a shadow
  // zone that appears to be full of creatures is actively misleading in a game about a swarm.
  const g = new Grid(8, 10);
  g.ellipse(3.5, 6.5, 2.6, 2.8, '3');
  g.tri(3.5, 0, 1.5, 6, 5.5, 6, '3');
  g.ellipse(3.5, 6.5, 1.4, 1.5, '4');
  return g;
}

/** A jagged chunk of earth thrown up by Earthquake. */
function fxRubble() {
  const g = new Grid(6, 6);
  g.tri(3, 0, 0, 4, 5, 3, '3');
  g.tri(0, 4, 5, 3, 3, 5, '4');
  return g.outline();
}

/** Chunky angular rock, for the orbitals. */
function projRock() {
  const g = new Grid(10, 10);
  g.tri(5, 0, 0, 5, 9, 4, '3');
  g.tri(0, 5, 9, 4, 4, 9, '3');
  g.tri(3, 2, 7, 3, 5, 6, '4');
  return g.outline();
}

/** Bone, for the out-and-back boomerang. Pointing right; rotations are baked. */
function projBone() {
  const g = new Grid(12, 8);
  g.rect(3, 3, 6, 2, '4');
  g.ellipse(2, 2.5, 2.0, 2.0, '4');
  g.ellipse(2, 5.5, 2.0, 2.0, '4');
  g.ellipse(9.5, 2.5, 2.0, 2.0, '4');
  g.ellipse(9.5, 5.5, 2.0, 2.0, '4');
  return g.outline();
}

/** A jagged spark for chain lightning. */
function projSpark() {
  const g = new Grid(8, 8);
  g.tri(5, 0, 2, 4, 5, 4, '4');
  g.tri(3, 7, 6, 3, 3, 3, '4');
  g.px(3, 3, '7'); g.px(4, 4, '7');
  return g.outline();
}

/** A soft billowing cloud for the poison trail. */
function projCloud() {
  const g = new Grid(12, 10);
  g.ellipse(4, 6, 3.6, 3.2, '3');
  g.ellipse(8, 5, 3.4, 3.0, '3');
  g.ellipse(6, 3.5, 3.0, 2.6, '3');
  g.ellipse(5, 5, 1.8, 1.5, '4');
  return g.outline();
}

/** Destructible scenery: a leafy bush. */
function propBush() {
  const g = new Grid(20, 18);
  g.ellipse(6, 11, 5.5, 5.0, '3');
  g.ellipse(13, 10, 6.0, 5.5, '3');
  g.ellipse(9.5, 7, 5.0, 4.5, '4');
  g.ellipse(9.5, 9, 3.0, 2.5, '3');
  g.rect(9, 15, 2, 3, '2');
  g.underShade('3', '2');
  return g.outline();
}

/** Destructible scenery: a boulder. */
function propRock() {
  const g = new Grid(20, 16);
  g.tri(2, 15, 8, 1, 18, 15, '3');
  g.ellipse(10, 11, 8.0, 4.5, '3');
  g.tri(6, 10, 9, 3, 13, 10, '4');
  g.underShade('3', '2');
  return g.outline();
}

/** Destructible scenery: a wooden crate -- the one most likely to hold something. */
function propCrate() {
  const g = new Grid(18, 16);
  g.rect(1, 2, 16, 13, '3');
  g.rect(3, 4, 12, 9, '4');
  g.rect(1, 7, 16, 2, '2');
  g.rect(8, 2, 2, 13, '2');
  return g.outline();
}

function orb() {
  const g = new Grid(6, 6);
  g.ellipse(2.5, 2.5, 2.2, 2.2, '3');
  g.px(1, 1, '4'); g.px(2, 1, '4');
  return g.outline();
}

/** Coins are pokeballs -- the most recognisable object in the series and a better pickup read. */
function coin() {
  const g = new Grid(8, 8);
  g.ellipse(3.5, 3.5, 3.2, 3.2, '4');             // lower half, pale
  g.halfEllipse(3.5, 3.5, 3.2, 3.2, '3', true);   // upper half, coloured
  g.rect(0, 3, 8, 2, '1');                        // the band
  g.ellipse(3.5, 3.5, 1.3, 1.3, '1');             // button ring
  g.px(3, 3, '7'); g.px(4, 3, '7');
  return g.outline();
}

/** A larger pokeball, for the HUD and the title screen. */
function pokeball() {
  const g = new Grid(14, 14);
  g.ellipse(6.5, 6.5, 6.0, 6.0, '4');
  g.halfEllipse(6.5, 6.5, 6.0, 6.0, '3', true);
  g.rect(0, 6, 14, 2, '1');
  g.ellipse(6.5, 6.5, 2.4, 2.4, '1');
  g.ellipse(6.5, 6.5, 1.3, 1.3, '7');
  g.px(4, 3, '7'); g.px(5, 3, '7');
  return g.outline();
}

// --- Ability icons (16x16, single frame) ------------------------------------
// Flat, high-contrast silhouettes: at 18px on the HUD these must read instantly, so detail is
// the enemy here. Slot 4 (light) carries the glyph, slot 3 (body) the backing.

function iconShield() {
  const g = new Grid(16, 16);
  g.ellipse(7.5, 7.5, 6.2, 6.2, '3');
  g.ellipse(7.5, 7.5, 4.2, 4.2, '4');
  g.px(5, 4, '7'); g.px(6, 4, '7'); g.px(5, 5, '7');
  return g.outline();
}

function iconQuake() {
  const g = new Grid(16, 16);
  // Three nested arcs opening upward from a ground line -- a shockwave spreading outward.
  // Sweeping the UPPER half of each ellipse (PI..2PI) is what keeps them centred and symmetric.
  for (let i = 2; i >= 0; i--) {
    const rx = 2.6 + i * 2.6, ry = 1.8 + i * 1.9;
    const col = i === 0 ? '4' : '3';
    for (let a = Math.PI; a <= Math.PI * 2; a += 0.05) {
      g.px(7.5 + Math.cos(a) * rx, 12 + Math.sin(a) * ry, col);
    }
  }
  g.rect(1, 13, 14, 2, '4');
  return g.outline();
}

function iconLeaf() {
  const g = new Grid(16, 16);
  g.leafShape(7.0, 7.5, 7.0, 4.2, '3');
  g.rect(3, 7, 8, 1, '4');
  g.px(11, 7, '4'); g.px(12, 7, '4');
  return g.outline();
}

function iconArrow() {
  const g = new Grid(16, 16);
  g.rect(3, 7, 9, 2, '3');
  g.tri(15, 8, 10, 4, 10, 12, '4');          // head
  g.tri(1, 4, 5, 8, 1, 12, '3');             // fletching
  return g.outline();
}

function iconBeam() {
  const g = new Grid(16, 16);
  g.rect(1, 6, 13, 4, '3');
  g.rect(1, 7, 13, 2, '4');
  g.ellipse(2.5, 7.5, 2.4, 3.4, '4');        // muzzle flare
  return g.outline();
}

function iconBolt() {
  const g = new Grid(16, 16);
  g.tri(10, 1, 4, 9, 9, 9, '4');
  g.tri(6, 14, 11, 6, 7, 6, '4');
  g.tri(9.5, 2, 5, 8.5, 8.5, 8.5, '3');
  return g.outline();
}

function iconJet() {
  const g = new Grid(16, 16);
  // A cone widening to the right, with droplets.
  g.tri(1, 7.5, 14, 2, 14, 13, '3');
  g.tri(1, 7.5, 10, 5, 10, 10, '4');
  g.px(13, 4, '4'); g.px(14, 9, '4'); g.px(12, 12, '4');
  return g.outline();
}

function iconPulse() {
  const g = new Grid(16, 16);
  g.ellipse(7.5, 7.5, 6.4, 6.4, '3');
  g.ellipse(7.5, 7.5, 4.4, 4.4, '1');
  g.ellipse(7.5, 7.5, 2.6, 2.6, '4');
  return g.outline();
}

// --- Assemble ---------------------------------------------------------------

const TWO_FRAME = {
  wooper, quagsire,
  eevee, vaporeon, jolteon, umbreon,
  rowlet, dartrix, decidueye,
  gastly, haunter, gengar,
  quad_small: quadSmall, bat, round_big: roundBig, bug,
};
const ONE_FRAME = {
  proj_bubble: bubble, proj_star: star, proj_leaf: leaf, orb, coin,
  proj_rock: projRock, proj_bone: projBone, proj_spark: projSpark, proj_cloud: projCloud,
  icon_shield: iconShield, icon_quake: iconQuake, icon_leaf: iconLeaf, icon_arrow: iconArrow,
  icon_beam: iconBeam, icon_bolt: iconBolt, icon_jet: iconJet, icon_pulse: iconPulse,
  icon_shade: iconShade, icon_lick: iconLick,
  fx_leafblade: fxLeafBlade, fx_bolt: fxBolt, fx_wave: fxWave, fx_wisp: fxWisp,
  fx_rubble: fxRubble,
  proj_fang: projFang, proj_shard: projShard, proj_feather: projFeather,
  proj_quill: projQuill, proj_droplet: projDroplet, proj_vortex: projVortex,
  proj_mine: projMine, proj_coil: projCoil, proj_seed: projSeed, proj_thorn: projThorn,
  proj_eye: projEye, proj_fist: projFist, proj_blade: projBlade, proj_skull: projSkull,
  proj_hound: projHound, proj_claw: projClaw, proj_boulder: projBoulder, proj_ring: projRing,
  prop_bush: propBush, prop_rock: propRock, prop_crate: propCrate,
  pokeball,
};

const SHAPES = {};
for (const name of Object.keys(TWO_FRAME)) {
  const a = TWO_FRAME[name](0), b = TWO_FRAME[name](1);
  SHAPES[name] = { w: a.w, h: a.h, ox: a.w >> 1, oy: a.h - 2, frames: [a.rows(), b.rows()], _g: [a, b] };
}
for (const name of Object.keys(ONE_FRAME)) {
  const a = ONE_FRAME[name]();
  SHAPES[name] = { w: a.w, h: a.h, ox: a.w >> 1, oy: a.h >> 1, frames: [a.rows()], _g: [a] };
}

if (process.argv.includes('--write')) {
  const out = [];
  out.push('// GENERATED by tools/spritegen.mjs -- safe to hand-edit afterwards.');
  out.push('// Rows may omit trailing transparency; the compiler pads them back out to `w`.');
  out.push('// Palette slots: 1 outline  2 shadow  3 body  4 light  5 eye  6 accent  7 shine  8 accent-dark');
  out.push('');
  out.push('export const SHAPES = {');
  for (const name of Object.keys(SHAPES)) {
    const s = SHAPES[name];
    out.push('  ' + name + ': {');
    out.push('    w: ' + s.w + ', h: ' + s.h + ', ox: ' + s.ox + ', oy: ' + s.oy + ',');
    out.push('    frames: [');
    for (const f of s.frames) {
      out.push('      [');
      for (const r of f) out.push("        '" + r + "',");
      out.push('      ],');
    }
    out.push('    ],');
    out.push('  },');
  }
  out.push('};');
  out.push('');
  writeFileSync(new URL('../src/data/shapes.js', import.meta.url), out.join('\n'));
  console.log('wrote src/data/shapes.js (' + Object.keys(SHAPES).length + ' shapes)');
} else {
  const onlyArg = process.argv.find((a) => a.startsWith('--only='));
  const only = onlyArg ? onlyArg.split('=')[1] : null;
  for (const name of Object.keys(SHAPES)) {
    if (only && name !== only) continue;
    const s = SHAPES[name];
    console.log('\n=== ' + name + '  ' + s.w + 'x' + s.h + ' ===');
    console.log(s._g[0].toAscii());
  }
}
