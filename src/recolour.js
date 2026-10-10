// L1 -- may import L0. Holds only a cache of recoloured canvases.
//
// An animation strip redrawn in an overload's palette: each pixel's brightness mapped onto a ramp
// from a deep shade of the overload's main colour, through the main colour, to its accent, with
// near-white highlights left white. Built once per (strip, overload) and cached; shared by the
// world renderer (entities.js, a Dragon weapon's actors) and the overload cards (ui.js).
//
// The copy is read, never the strip itself, which is drawn every frame: reading pixels back from
// a canvas that is being blitted demotes it off the GPU.

const recolours = new Map();
const CAP = 160;

const hexRgb = (h) => [parseInt(h.slice(1, 3), 16), parseInt(h.slice(3, 5), 16), parseInt(h.slice(5, 7), 16)];

/** `canvas` (a sequence strip) in `ov`'s colours; `ov` needs an `id` and `colors`. */
export function recoloured(canvas, ov) {
  let byOv = recolours.get(canvas);
  if (!byOv) {
    if (recolours.size > CAP) recolours.clear();
    byOv = new Map();
    recolours.set(canvas, byOv);
  }
  let c = byOv.get(ov.id);
  if (c) return c;
  const W = canvas.width, H = canvas.height;
  c = document.createElement('canvas');
  c.width = W; c.height = H;
  const g = c.getContext('2d', { willReadFrequently: true });
  g.drawImage(canvas, 0, 0);
  const img = g.getImageData(0, 0, W, H);
  const d = img.data;
  const main = hexRgb(ov.colors[0]), acc = hexRgb(ov.colors[2]);
  const deep = main.map((v) => v * 0.28);
  for (let i = 0; i < d.length; i += 4) {
    if (!d[i + 3]) continue;
    const r = d[i], gg = d[i + 1], bb = d[i + 2];
    const mx = Math.max(r, gg, bb), mn = Math.min(r, gg, bb);
    if (mx > 236 && mx - mn < 30) continue;              // white highlights stay white
    const l = (0.3 * r + 0.59 * gg + 0.11 * bb) / 255;
    const lo = l < 0.55 ? deep : main, hi = l < 0.55 ? main : acc;
    const k = l < 0.55 ? l / 0.55 : (l - 0.55) / 0.45;
    d[i] = lo[0] + (hi[0] - lo[0]) * k;
    d[i + 1] = lo[1] + (hi[1] - lo[1]) * k;
    d[i + 2] = lo[2] + (hi[2] - lo[2]) * k;
  }
  g.putImageData(img, 0, 0);
  byOv.set(ov.id, c);
  return c;
}
