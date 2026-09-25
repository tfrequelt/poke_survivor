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

`portraits` maps a name to a single still image, used on the character-select cards.

Check all eight facings at once with `?dirs=1`.

### Keep the `-Shadow` sheets

**`<anim>-Shadow.png` is required and must not be deleted.** It holds exactly one white pixel per
frame, at the point where the creature touches the ground, and that pixel is the sprite's origin.

There is no way to recover it from the artwork. Anchoring to the lowest opaque pixel instead
looks correct side-on and fails facing up, because a tail drawn toward the camera hangs *below*
the feet — anchor to the tail and the body floats. If a folder has no shadow sheet the loader
falls back to that estimate and logs a warning naming the folder.

The `-Offsets` sheets are not used and can be deleted.

### Attack animations

The `attacks` list names the forms whose `Attack-Anim.png` is loaded for the one-shot animation
played when an ability is cast:

```json
{ "attacks": ["wooper", "quagsire", "eevee"] }
```

The folder comes from that name's `sheets` entry, so it is only written once. Attack frames are
much larger than walk frames — Wooper walks in 32×40 and attacks in 72×72 — and are kept as
canvases rather than put in the sprite atlas, which twelve of them would not fit in. They need
`Attack-Shadow.png` for the same reason the walk sheets do.

### Title screen animations

`anims` gives each starter one animation to play on the title screen, by name:

```json
{ "anims": { "wooper": "Sleep", "eevee": "TailWhip", "gastly": "Lick" } }
```

Change the word to change the animation. Anything in that Pokemon's folder works -- run
`ls assets/sprites/<name>/*-Anim.png` to see the list. Six sensible ones every starter has are
`Sleep`, `Hop`, `Idle`, `Charge`, `Shoot` and `Swing`; the more entertaining ones are per
Pokemon, which is the point.

These go through the same loader as the attack sheets, with one difference that matters: it does
**not** require eight direction rows. `Sleep` ships as a single row on most Pokemon, and the
title screen only ever draws row 0.

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

A sprite can also be **one rect out of a packed sheet**, which is how the coin and the Sitrus
Berry are taken from the ripped PMD item sheet without splitting it into files first:

```json
{
  "sprites": {
    "coin": { "src": "assets/pmd/items.png", "x": 1, "y": 6, "w": 14, "h": 11, "anchor": "center" }
  }
}
```

`anchor` is `"bottom"` (the default, right for anything standing on the ground) or `"center"`
(right for a coin or a berry, which are drawn centred on their position).

The key is a **shape name** — one of the player forms (`wooper`, `quagsire`, `eevee`, `vaporeon`,
`jolteon`, `umbreon`, `rowlet`, `dartrix`, `decidueye`, `gastly`, `haunter`, `gengar`), an enemy
(`rattata`, `caterpie`, `zubat`, `pidgey`, `diglett`, `geodude`, `delibird`, `metapod`,
`raticate`, `pidgeotto`, `crobat`, `dugtrio`, `butterfree`, `graveler`, `pidgeot`), or a
projectile (`proj_bubble`, `proj_star`, `proj_leaf`, …).

Any pixel size works; the sprite is anchored at the bottom-centre of the image, so leave the
creature standing on the bottom edge. Transparency is respected. The left-facing, hit-flash and
baked-rotation variants are all derived automatically — you only supply the one right-facing image.

## Ground tilesets and backdrops

`manifest.json` has an `images` section for whole sheets that are drawn from directly rather
than going through the sprite atlas — ground tilesets and backdrops:

```json
{
  "images": {
    "woods": "assets/pmd/woods.png",
    "status": { "src": "assets/pmd/status.png", "key": "#007890" }
  }
}
```

`key` punches a flat background colour out to transparency, which sheet rips usually need: they
are saved on a solid backdrop rather than with an alpha channel, so without it everything drawn
from one arrives inside a coloured box. `tolerance` widens the match (default 10).

**Where the tiles are** lives in `src/data/tilesets.js`, not here. Two of the three sources are
rendered *maps* rather than tilesets, so that file records the pixel where the grid starts, the
pitch between tiles, and which rectangles are which terrain:

| Layer | Tiny Woods (map) | Mt. Thunder (autotile sheet) |
|---|---|---|
| `wild` | flowery meadow | — |
| `open` | plain grass | — |
| `floor` | sand room floor | the block's centre tile |
| `ring` | the two-tile cliff around a room | — |
| `border` | the cliff at the arena edge | the Walls block, nine-sliced |

`mt_thunder.png` is a real autotile sheet: a 25px table grid (24px tile plus a 1px rule) starting
at pixel (9, 163), 23 columns by 24 rows in groups of three — Legend, Walls, Wall Alt 1, Wall Alt
2, Ground, Ground Alt 1, Water, Water Sparkle. Rows are eight 3×3 blocks, and **block 0 is a
ring**: its outer eight tiles are the edges where that terrain meets something else and only the
centre is seamless fill. Tiling all nine lays a grid of borders across the floor.

A stage opts in with `tileset: 'woods'` in `src/data/stages.js`. The interior layout is generated
per tile from the run seed by `src/terrain.js` — nothing is stored, so walking back over ground
finds it unchanged. `layout: null` means the stage is one open floor with no generated rooms. If
the image is missing the stage falls back to its four procedural ground layers.

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

Stage keys match the stage ids in `src/data/stages.js`. Tracks are **streamed, not looped**: when
one finishes, a *different* track from the same list starts. A list with one entry repeats that
one. Everything is routed through the same music bus as the synthesised audio, so the volume and
mute controls apply. Paths are URL-encoded on load, so spaces and accented characters in filenames
are fine.

## Sound effects

`manifest.json` has an `sfx` section mapping a sound id to a short file. A supplied file replaces
the synthesised version of that sound completely:

```json
{
  "sfx": {
    "levelup": "assets/sfx/levelup.wav",
    "hurt":    "assets/sfx/hurt.wav"
  }
}
```

Every id is optional — anything you do not supply keeps its chiptune version, so a half-filled
folder is a perfectly normal state. Five are supplied today: `evolve` (the Mystery Dungeon
evolution jingle, which also ducks the stage music for its length), `select`, and the three move
sounds. The ids the game plays are:

| group | ids |
|---|---|
| shots | `shoot_water` `shoot_normal` `shoot_grass` `shoot_rock` `shoot_bolt` |
| combat | `hit` `crit` `kill` `hurt` |
| pickups | `xp` `coin` `levelup` `pickup` |
| abilities | `ability` `quake` `beam` `shield` |
| moves | `move_fire` (Flamethrower, Fire Spin) `move_cut` (Spectral Arrow) `move_dark` (Dark Pulse) |
| events | `boss` `evolve` `select` `confirm` |

Keep them **short** — these are decoded into memory rather than streamed, and `hit` fires many
times a second. Anything over about half a second will sound wrong regardless. WAV, OGG and MP3
all work. The 45 ms per-id rate limit and the 14-voice cap apply to samples exactly as they do to
the synthesised sounds, so a dense fight cannot turn into a wall of noise.

## UI window frames

`manifest.json` has a `ui` section. A `window` image replaces the drawn Mystery Dungeon frame
everywhere a panel is drawn — level-up cards, the character and stage select, the pause screen,
the credits and the in-run banner:

```json
{
  "ui": {
    "window": { "src": "assets/ui/window.png", "corner": 8 }
  }
}
```

It is drawn as a **nine-slice**: `corner` is how many pixels of each edge form a fixed corner; the
edges stretch along one axis and the middle fills the rest. If `corner` is left out it defaults to
a quarter of the shorter side. Supplying a frame means the per-card accent colours no longer show
(the image has no place to put them), which is the trade you are making by using one image for
every window.

## Optional images

Two images are ones the game is designed to run without, and are marked `optional` so a missing
file is silent rather than a warning every boot:

```json
"images": {
  "title": { "src": "assets/pmd/title.png", "optional": true },
  "wheel": { "src": "assets/pmd/wheel.png", "optional": true }
}
```

* **`title.png`** replaces the generated `POKEMON DRACULA EDITION` wordmark. Any size: it is
  scaled by a whole number to fit roughly 590x58, and the subtitle below moves down to make room
  for a tall one. Whole-number scaling only, because a pixel logo resampled to a fraction turns
  to mush.
* **`wheel.png`** replaces the drawn red-and-white face of Delibird's prize wheel. It should be
  **square** and is drawn as a circle inscribed in that square, rotating about its centre. The
  arrow, the hub and the result window stay drawn on top. A supplied image is assumed to carry
  its own slice artwork, so the built-in text labels are not painted over it -- which also means
  its slices should match the order in `SEGMENTS` at the top of `src/wheel.js`.

## Failure behaviour

A missing manifest, a missing file or an undecodable image all fall back to the drawn art and log
a note to the console. **The game never black-screens over a bad asset.** One broken entry does not
affect the others.

A music track that is missing or will not decode falls back to the synthesised chiptune for that
context, so the game is never silent either. A sound effect that will not decode falls back to its
synthesised version, and a missing UI frame falls back to the drawn one.

An enemy whose sprite folder is missing falls back to a generic drawn shape (`fallback` in
`src/data/enemies.js`) rather than failing the boot, so a mistyped folder name costs you that one
Pokemon's artwork and nothing else. A stage whose tileset image is missing falls back to its
procedural ground, and the title screen falls back to its drawn sky and grass.

## A note on sourcing

Only add art you have the right to use — your own work, something you commissioned, or something
properly licensed. Official Pokémon sprites and other people's fan art are copyrighted.

The sheets in `assets/pmd/` are rips of **Pokémon Mystery Dungeon: Red Rescue Team**, taken from
The Spriters Resource. They are Nintendo / Chunsoft's artwork, not this project's, and several of
the rips ask to be credited by name. Every one of them is listed on the in-game credits screen
(`C` from the title) with its asset id and what it is used for — **if you add another sheet, add
it to `src/data/credits.js` at the same time.**
