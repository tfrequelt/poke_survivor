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
  const g = new Grid(32, 32), y = bob;

  // Gills first, so the head overlaps their roots and they grow from behind it. Each prong has a
  // WIDE base so it reads as a fleshy frond rather than an antenna.
  for (const dir of [-1, 1]) {
    const bx = 15.5 + dir * 7;
    g.tri(bx, 7 + y, bx, 14 + y, bx + dir * 8, 3 + y, '6');
    g.tri(bx, 11 + y, bx, 18 + y, bx + dir * 9, 13 + y, '6');
    g.tri(bx, 15 + y, bx, 21 + y, bx + dir * 7, 22 + y, '6');
  }

  g.ellipse(15.5, 24 + y, 6.0, 5.4, '3');      // body
  g.ellipse(15.5, 13.5 + y, 10.5, 9.0, '3');   // head, dominating
  g.ellipse(15.5, 9.5 + y, 6.5, 3.2, '4');     // forehead highlight

  for (const dir of [-1, 1]) {                  // eyes: small, dark, set wide
    const ex = Math.round(15.5 + dir * 4.5);
    g.rect(ex - 1, 13 + y, 2, 3, '5');
    g.px(ex - 1, 13 + y, '7');
  }
  g.rect(14, 19 + y, 4, 1, '1');                // flat little mouth

  g.rect(10, 28 + y, 4, 3, '2');                // feet
  g.rect(18, 28 + y, 4, 3, '2');
  g.underShade('3', '2');
  return g.outline();
}

/**
 * Quagsire: taller and slouched where Wooper is round. Wide flat mouth, dorsal ridge,
 * gills reduced to nubs, arms at its sides.
 */
function quagsire(bob) {
  const g = new Grid(32, 32), y = bob;

  for (const dir of [-1, 1]) {                  // gill nubs, much smaller than Wooper's
    const bx = 15.5 + dir * 8.5;
    g.tri(bx, 9 + y, bx + dir * 4.5, 5 + y, bx + dir * 1.5, 12 + y, '6');
  }

  g.ellipse(15.5, 24 + y, 7.5, 7.5, '3');       // heavy slouched body
  g.ellipse(15.5, 18 + y, 5.5, 4.0, '3');       // narrower waist, so head and body read apart
  g.ellipse(6.5, 22 + y, 2.6, 4.5, '3');        // arms hanging at its sides
  g.ellipse(24.5, 22 + y, 2.6, 4.5, '3');
  g.ellipse(15.5, 11 + y, 9.0, 7.5, '3');       // head, narrower than Wooper's
  g.halfEllipse(15.5, 8 + y, 8.5, 4.5, '2', true);   // dark cap over the top of the skull only

  for (const dir of [-1, 1]) {                  // small sleepy eyes
    const ex = Math.round(15.5 + dir * 4.5);
    g.rect(ex - 1, 10 + y, 2, 2, '5');
  }
  g.rect(9, 16 + y, 14, 1, '1');                // the wide flat mouth -- Quagsire's signature
  g.rect(10, 17 + y, 12, 1, '2');

  g.rect(9, 29 + y, 5, 2, '2');                 // feet
  g.rect(18, 29 + y, 5, 2, '2');
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
  const g = new Grid(32, 32), y = bob;

  // Tail first, so the ruff drawn later occludes its root and it sits BEHIND the body.
  if (o.tail === 'fin') {
    g.tri(23, 26 + y, 31, 10 + y, 26, 27 + y, '3');
    g.tri(24, 24 + y, 31, 14 + y, 28, 26 + y, '4');
  } else if (o.tail === 'spike') {
    g.tri(20, 27 + y, 30, 17 + y, 25, 29 + y, '4');
    g.tri(21, 24 + y, 29, 11 + y, 26, 26 + y, '4');
  } else {
    g.ellipse(25, 18 + y, 6.0, 7.0, o.tailColor || '4');
    g.ellipse(22.5, 24 + y, 4.5, 4.0, o.tailColor || '4');
  }

  g.ellipse(14, 24 + y, 7.5, 6.0, '3');          // body
  g.rect(8, 27 + y, 3, 4, '2');                  // legs
  g.rect(13, 28 + y, 3, 3, '2');
  g.rect(18, 27 + y, 3, 4, '2');

  // The ruff: a wide cream collar that visually separates the head from the body.
  if (o.ruff !== false) g.ellipse(14, 19.5 + y, 8.5, 4.0, o.ruffColor || '4');

  // Ears: tall, pointed, angled outward, with a darker inner surface.
  for (const dir of [-1, 1]) {
    const bx = 14 + dir * 5;
    if (o.ears === 'spiky') {
      g.tri(bx - dir * 2, 12 + y, bx + dir * 6, 8 + y, bx + dir * 2, 0 + y, '3');
    } else {
      g.tri(bx - dir * 2.5, 13 + y, bx + dir * 4.5, 11 + y, bx + dir * 4, 1 + y, '3');
      g.tri(bx - dir * 1, 12 + y, bx + dir * 2.8, 10.5 + y, bx + dir * 3, 4 + y, '2');
    }
  }

  g.ellipse(14, 13 + y, 7.5, 6.5, '3');          // head
  if (o.frill) {                                  // Vaporeon's head fins
    g.tri(6, 12 + y, 0, 6 + y, 7, 17 + y, '6');
    g.tri(22, 12 + y, 28, 6 + y, 21, 17 + y, '6');
  }
  if (o.mane) {                                   // Jolteon's spiky collar
    for (let i = -3; i <= 3; i++) {
      const bx = 14 + i * 2.4;
      g.tri(bx - 1.6, 18 + y, bx + 1.6, 18 + y, bx + i * 1.1, 26 + y, '3');
    }
  }
  g.ellipse(14, 8.5 + y, 4.5, 2.2, o.tuftColor || '4');   // forehead tuft
  g.ellipse(14, 16 + y, 4.5, 3.0, o.tuftColor || '4');    // muzzle

  for (const dir of [-1, 1]) {                    // eyes
    const ex = Math.round(14 + dir * 4);
    g.rect(ex - 1, 12 + y, 2, 3, '5');
    g.px(ex - 1, 12 + y, '7');
  }
  g.rect(13, 16 + y, 2, 1, '8');                  // nose

  if (o.rings) {                                  // Umbreon's glowing bands
    g.rect(11, 6 + y, 6, 2, '6');
    g.rect(9, 24 + y, 3, 2, '6');
    g.rect(17, 24 + y, 3, 2, '6');
  }

  g.underShade('3', '2');
  return g.outline();
}

const vaporeon = (bob) => eevee(bob, { tail: 'fin', frill: true, ruffColor: '4' });
const jolteon = (bob) => eevee(bob, { tail: 'spike', ears: 'spiky', mane: true, ruff: false });
const umbreon = (bob) => eevee(bob, { rings: true, tailColor: '3', ruffColor: '2', tuftColor: '2' });

/**
 * Rowlet: an almost perfect sphere with a huge pale face disc, a tiny triangular beak and the
 * leaf bowtie. The round silhouette plus the disc is what makes it read instantly.
 */
function rowlet(bob) {
  const g = new Grid(32, 32), y = bob;

  g.ellipse(15.5, 17 + y, 11.5, 11.0, '3');       // the sphere
  g.halfEllipse(15.5, 15 + y, 11.0, 8.0, '2', true);   // darker crown over the top
  g.ellipse(15.5, 16 + y, 8.0, 6.8, '4');         // the pale face disc

  // Two small leaf tufts on the crown.
  g.tri(13, 7 + y, 10, 1 + y, 16, 6 + y, '3');
  g.tri(18, 7 + y, 22, 1 + y, 15, 6 + y, '3');

  for (const dir of [-1, 1]) {                     // big round eyes
    const ex = Math.round(15.5 + dir * 3.5);
    g.rect(ex - 1, 13 + y, 3, 4, '5');
    g.px(ex - 1, 13 + y, '7');
  }
  g.tri(15.5, 18 + y, 13.5, 22 + y, 17.5, 22 + y, '6');   // small triangular beak

  // Leaf bowtie: two short wedges meeting at the chest.
  g.tri(8, 22 + y, 15, 24 + y, 9, 27 + y, '8');
  g.tri(23, 22 + y, 16, 24 + y, 22, 27 + y, '8');
  g.rect(14, 23 + y, 3, 3, '6');

  g.rect(10, 29 + y, 4, 2, '6');                   // stubby feet
  g.rect(18, 29 + y, 4, 2, '6');
  g.underShade('3', '2');
  return g.outline();
}

/** Dartrix: taller than Rowlet, with a feathered fringe over one eye and leaf-blade shoulders. */
function dartrix(bob) {
  const g = new Grid(32, 32), y = bob;

  g.ellipse(15.5, 21 + y, 9.5, 10.0, '3');        // taller, less spherical body
  g.ellipse(15.5, 11 + y, 8.0, 7.5, '3');         // distinct head
  g.ellipse(15.5, 12 + y, 6.0, 5.5, '4');         // face disc

  g.tri(4, 20 + y, 10, 14 + y, 9, 26 + y, '8');   // leaf-blade shoulders
  g.tri(27, 20 + y, 21, 14 + y, 22, 26 + y, '8');

  for (const dir of [-1, 1]) {                     // eyes
    const ex = Math.round(15.5 + dir * 3);
    g.rect(ex - 1, 10 + y, 2, 3, '5');
  }
  // The fringe: a slab of feathers hanging over the left eye, Dartrix's signature.
  g.tri(8, 3 + y, 18, 6 + y, 11, 14 + y, '2');
  g.tri(9, 4 + y, 16, 7 + y, 12, 12 + y, '3');

  g.tri(15.5, 13 + y, 13, 17 + y, 18, 17 + y, '6');  // beak
  g.rect(10, 29 + y, 4, 2, '6');
  g.rect(18, 29 + y, 4, 2, '6');
  g.underShade('3', '2');
  return g.outline();
}

/**
 * Decidueye: the hardest of the nine. A hooded archer -- long neck, a pointed hood framing the
 * face, an arrow-fletch crest, and a leaf cloak flaring at the bottom.
 */
function decidueye(bob) {
  const g = new Grid(32, 32), y = bob;

  // Cloak: a wide flared skirt, drawn first so the body sits in front of it.
  g.tri(15.5, 14 + y, 2, 31 + y, 29, 31 + y, '2');
  g.tri(15.5, 17 + y, 6, 30 + y, 25, 30 + y, '3');

  g.ellipse(15.5, 22 + y, 5.5, 8.0, '3');         // slender torso
  g.rect(14, 12 + y, 4, 8, '3');                  // long neck

  // The hood: a pointed cowl that frames the face and comes to a peak.
  g.tri(15.5, 0 + y, 5, 14 + y, 26, 14 + y, '2');
  g.ellipse(15.5, 9 + y, 7.5, 6.5, '2');
  g.ellipse(15.5, 10 + y, 5.0, 4.5, '4');         // pale face inside the hood

  // Arrow-fletch crest hanging from the back of the hood.
  g.tri(15.5, 2 + y, 12, 9 + y, 19, 9 + y, '8');
  g.rect(15, 1 + y, 2, 9, '8');

  for (const dir of [-1, 1]) {                     // narrow, sharp eyes
    const ex = Math.round(15.5 + dir * 2.5);
    g.rect(ex - 1, 9 + y, 2, 2, '5');
  }
  g.tri(15.5, 11 + y, 14, 15 + y, 17, 15 + y, '6');  // beak

  g.rect(10, 29 + y, 4, 2, '6');                   // talons
  g.rect(18, 29 + y, 4, 2, '6');
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

function orb() {
  const g = new Grid(6, 6);
  g.ellipse(2.5, 2.5, 2.2, 2.2, '3');
  g.px(1, 1, '4'); g.px(2, 1, '4');
  return g.outline();
}

function coin() {
  const g = new Grid(6, 6);
  g.ellipse(2.5, 2.5, 2.2, 2.2, '3');
  g.rect(2, 1, 2, 4, '4');
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
  quad_small: quadSmall, bat, round_big: roundBig, bug,
};
const ONE_FRAME = {
  proj_bubble: bubble, proj_star: star, proj_leaf: leaf, orb, coin,
  proj_rock: projRock, proj_bone: projBone, proj_spark: projSpark, proj_cloud: projCloud,
  icon_shield: iconShield, icon_quake: iconQuake, icon_leaf: iconLeaf, icon_arrow: iconArrow,
  icon_beam: iconBeam, icon_bolt: iconBolt, icon_jet: iconJet, icon_pulse: iconPulse,
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
