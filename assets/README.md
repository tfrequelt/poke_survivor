# Assets

The game ships with **no image files** — every sprite is drawn in code (`tools/spritegen.mjs` →
`src/data/shapes.js`) and compiled into a texture atlas at boot. This folder is the escape hatch:
drop an image here and it replaces the drawn art for that shape.

## Adding a sprite

1. Put a PNG in `assets/sprites/`, e.g. `assets/sprites/rowlet.png`.
2. Add it to `manifest.json`:

```json
{
  "sprites": {
    "rowlet": "assets/sprites/rowlet.png"
  }
}
```

The key is a **shape name** — one of the player forms (`wooper`, `quagsire`, `eevee`, `vaporeon`,
`jolteon`, `umbreon`, `rowlet`, `dartrix`, `decidueye`), an enemy shape (`quad_small`, `bat`,
`round_big`, `bug`), or a projectile (`proj_bubble`, `proj_star`, `proj_leaf`, …).

Any pixel size works; the sprite is anchored at the bottom-centre of the image, so leave the
creature standing on the bottom edge. Transparency is respected. The left-facing, hit-flash and
baked-rotation variants are all derived automatically — you only supply the one right-facing image.

## Failure behaviour

A missing manifest, a missing file or an undecodable image all fall back to the drawn art and log
a note to the console. **The game never black-screens over a bad asset.** One broken entry does not
affect the others.

## A note on sourcing

Only add art you have the right to use — your own work, something you commissioned, or something
properly licensed. Official Pokémon sprites and other people's fan art are copyrighted.
