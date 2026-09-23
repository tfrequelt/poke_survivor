# Assets

The game ships with **no image files** — every sprite is drawn in code (`tools/spritegen.mjs` →
`src/data/shapes.js`) and compiled into a texture atlas at boot. This folder is the escape hatch:
drop an image here and it replaces the drawn art for that shape.

## PMD sprite sheets

`manifest.json` has a `sheets` section pointing at a folder in PMD Sprite Collab layout:

```json
{ "sheets": { "wooper": "assets/sprites/wooper" } }
```

The loader reads `AnimData.xml` from that folder for the real `FrameWidth`, `FrameHeight` and
frame count (they vary per Pokemon and the frames are not square, so they cannot be inferred from
the PNG), then slices `Walk-Anim.png` into **8 direction rows x N frame columns**. Row order is
Down, Down-Right, Right, Up-Right, Up, Up-Left, Left, Down-Left.

The sprite origin is the horizontal centre and the bottom of the actual artwork — not the bottom
of the frame, since PMD frames carry padding.

`portraits` maps a name to a single still image, used on the character-select cards.

Check all eight facings at once with `?dirs=1`.

The `-Shadow` and `-Offsets` sheets that ship alongside are not used and can be deleted.

## Adding a single-image sprite

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

## Music

`manifest.json` has a `music` section mapping a context key to a list of tracks. One is chosen at
random each time that context starts:

```json
{
  "music": {
    "menu":  ["assets/musics/01. Pokemon Exploration Team Theme.mp3"],
    "grass": ["assets/musics/109. Murky Forest.mp3", "..."],
    "cave":  ["assets/musics/24. Waterfall Cave.mp3", "..."],
    "beach": ["assets/musics/05. Beach Cave.mp3", "..."]
  }
}
```

Stage keys match the stage ids in `src/data/stages.js`. Tracks are streamed and looped, and routed
through the same music bus as the synthesised audio, so the volume and mute controls apply. Paths
are URL-encoded on load, so spaces and accented characters in filenames are fine.

## Failure behaviour

A missing manifest, a missing file or an undecodable image all fall back to the drawn art and log
a note to the console. **The game never black-screens over a bad asset.** One broken entry does not
affect the others.

A music track that is missing or will not decode falls back to the synthesised chiptune for that
context, so the game is never silent either.

## A note on sourcing

Only add art you have the right to use — your own work, something you commissioned, or something
properly licensed. Official Pokémon sprites and other people's fan art are copyrighted.
