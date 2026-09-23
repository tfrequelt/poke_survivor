// Sprite authoring bootstrap.
//
// Hand-typing a 20x20 grid as 20 string literals is slow and miscounts silently. This describes
// each creature with a few drawing primitives instead, then EMITS literal character grids into
// src/data/shapes.js -- which stay hand-editable afterwards. Re-run it to regenerate:
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

/** Wooper: round head wider than the body, three-pronged gills, tiny feet. */
function wooper(bob) {
  const g = new Grid(20, 20), y = bob;
  g.ellipse(9.5, 14 + y, 4.2, 3.6, '3');
  g.ellipse(9.5, 8 + y, 6.6, 5.4, '3');
  for (const dir of [-1, 1]) {
    const bx = 9.5 + dir * 6.4;
    g.tri(bx, 5.0 + y, bx + dir * 3.4, 2.4 + y, bx + dir * 0.8, 7.0 + y, '6');
    g.tri(bx, 8.0 + y, bx + dir * 3.6, 8.4 + y, bx + dir * 0.8, 10.4 + y, '6');
  }
  g.ellipse(9.5, 5.4 + y, 4.2, 2.0, '4');
  g.rect(6, 17 + y, 3, 2, '2');
  g.rect(11, 17 + y, 3, 2, '2');
  g.px(6, 7 + y, '5'); g.px(7, 7 + y, '5'); g.px(6, 8 + y, '5'); g.px(7, 8 + y, '5');
  g.px(12, 7 + y, '5'); g.px(13, 7 + y, '5'); g.px(12, 8 + y, '5'); g.px(13, 8 + y, '5');
  g.px(6, 7 + y, '7'); g.px(12, 7 + y, '7');
  g.rect(9, 11 + y, 2, 1, '1');
  g.underShade('3', '2');
  return g.outline();
}

/** Eevee: big pointed ears, cream ruff and a bushy tail off to one side. */
function eevee(bob) {
  const g = new Grid(20, 20), y = bob;
  // Tail first, so the ruff drawn later occludes it and it reads as sitting behind the body.
  g.ellipse(15.8, 12.4 + y, 2.9, 3.4, '4');
  g.ellipse(14.6, 15.2 + y, 2.5, 2.3, '4');
  g.ellipse(9.0, 15.2 + y, 3.6, 3.0, '3');
  g.ellipse(9.0, 12.6 + y, 4.5, 2.0, "4");
  for (const dir of [-1, 1]) {
    const bx = 9.0 + dir * 3.2;
    g.tri(bx - dir * 1.6, 7.2 + y, bx + dir * 2.6, 6.2 + y, bx + dir * 1.8, 1.6 + y, "3");
    g.tri(bx - dir * 0.6, 6.6 + y, bx + dir * 1.6, 5.8 + y, bx + dir * 1.5, 3.4 + y, "2");
  }
  g.ellipse(9.0, 8.6 + y, 4.9, 4.0, '3');
  g.ellipse(9.0, 6.4 + y, 3.0, 1.6, '4');
  g.ellipse(9.0, 10.4 + y, 3.0, 1.8, '4');
  g.px(6, 8 + y, '5'); g.px(7, 8 + y, '5'); g.px(6, 9 + y, '5');
  g.px(11, 8 + y, '5'); g.px(12, 8 + y, '5'); g.px(12, 9 + y, '5');
  g.px(6, 8 + y, '7'); g.px(11, 8 + y, '7');
  g.px(8, 10 + y, '8'); g.px(9, 10 + y, '8');
  g.rect(7, 17 + y, 2, 2, '2');
  g.rect(10, 17 + y, 2, 2, '2');
  g.underShade('3', '2');
  return g.outline();
}

/** Rowlet: a sphere with a pale face disc, small beak and a leaf bowtie. */
function rowlet(bob) {
  const g = new Grid(20, 20), y = bob;
  g.ellipse(9.5, 10.5 + y, 6.4, 6.2, '3');
  g.halfEllipse(9.5, 8.0 + y, 6.2, 4.4, '2', true);
  g.ellipse(9.5, 9.5 + y, 4.4, 3.4, '4');
  g.ellipse(9.5, 4.4 + y, 3.0, 1.6, '3');
  g.px(7, 8 + y, '5'); g.px(8, 8 + y, '5'); g.px(7, 9 + y, '5'); g.px(8, 9 + y, '5');
  g.px(11, 8 + y, '5'); g.px(12, 8 + y, '5'); g.px(11, 9 + y, '5'); g.px(12, 9 + y, '5');
  g.px(7, 8 + y, '7'); g.px(11, 8 + y, '7');
  g.tri(9.5, 10.4 + y, 8.4, 12.4 + y, 10.6, 12.4 + y, '6');
  // Leaf bowtie: two short wedges meeting at the chest, kept narrow so it reads as a bowtie
  // rather than a band across the whole body.
  g.tri(6.2, 13.2 + y, 9.5, 14.0 + y, 6.6, 15.2 + y, '8');
  g.tri(12.8, 13.2 + y, 9.5, 14.0 + y, 12.4, 15.2 + y, '8');
  g.px(9, 14 + y, '6'); g.px(10, 14 + y, '6');
  g.rect(7, 17 + y, 2, 2, '6');
  g.rect(11, 17 + y, 2, 2, '6');
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

// --- Assemble ---------------------------------------------------------------

const TWO_FRAME = { wooper, eevee, rowlet, quad_small: quadSmall, bat, round_big: roundBig, bug };
const ONE_FRAME = { proj_bubble: bubble, proj_star: star, proj_leaf: leaf, orb, coin };

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
