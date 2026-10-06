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
    "coin": {
      "src": "assets/pmd/items_2.png", "x": 184, "y": 172, "w": 14, "h": 11,
      "anchor": "center", "key": "#008080", "flood": true
    }
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

### Autotile sheets: the grass and beach floors

`forest_tiles.png` and `beach_cave_tiles.png` are SilverDeoxys563's formatted sheets, the same
table as `mt_thunder.png`: 24px tiles on a 25px pitch from pixel (9, 163), columns in groups of
three -- Legend, Walls, Ground, Water, Water Sparkle (the column of each group is in
`src/data/tilesets.js`). They are drawn by `src/autotile.js`, which **reads the legend column** at
boot: every legend cell is a 3x3 of 8px squares, centre white, and a neighbour square is black when
that neighbour is the same terrain. That becomes the lookup from "which neighbours are wall/water"
to the right tile, so shorelines of any shape and the square outer wall need no hand-written tables.

- **Walls** frame the arena: everything outside it is wall, so the edge faces the floor and the deep
  outside is solid canopy or rock.
- **Ground** is mixed: in the open, any of the sheet's ground tiles whose edges match its centre
  (all 47 in the forest, 29 on the beach, whose others carry a wall's shadow); along the wall, the
  edge tile for that shape.
- **Water** is laid over the floor in ponds (`waterAt` in `src/terrain.js`, about 8-10% of the
  floor, never at the start or against the wall), with the **sparkle** tile for the same shape drawn
  on top. Water's teal backdrop and the sparkles' magenta are keyed out.
- **Animation** is the DS games' palette cycling: the water and sparkle palette tables beside the
  grid (10px swatches, 11px pitch, a row per frame) recolour the tiles once per row at load, and
  the frames run at the sheet's stated rates (forest every 17 / 13 frames, beach every 20 / 4).

Water blocks walking. Water, flying and ghost-type players cross it (`canSwim` in
`src/player.js`), and so do flying enemies and the species marked `swims` in
`src/data/enemies.js`; every other enemy walks round (`src/paths.js`). A missing sheet falls back
to the drawn ground, and its ponds then do not exist at all: water never blocks anyone unless it
can be seen.

## Music

`manifest.json` has a `music` section mapping a context key to a list of tracks. One is chosen at
random each time that context starts:

```json
{
  "music": {
    "menu":  ["assets/musics/stage/01. Pokemon Exploration Team Theme.mp3"],
    "grass": ["assets/musics/stage/109. Murky Forest.mp3", "..."],
    "cave":  ["assets/musics/stage/24. Waterfall Cave.mp3", "..."],
    "beach": ["assets/musics/stage/05. Beach Cave.mp3", "..."],
    "legend_zapdos": ["assets/musics/boss/boss_battle_final.mp3"]
  }
}
```

Stage and menu tracks live in `assets/musics/stage/`, boss themes in `assets/musics/boss/`.
Stage keys match the stage ids in `src/data/stages.js`. Each legendary's theme is under its own
key, `legend_<id>`, named by the `music` field of its entry in `src/data/legends.js`; it starts as
the boss appears and fades out over two and a half seconds when it falls.
`boss_battle_evil.mp3` is in the folder but no boss uses it yet. Tracks are **streamed, not looped**: when
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

An entry may also be an object, to set how loud the sample plays:

```json
{ "sfx": { "wheel_spin": { "src": "assets/sounds/wheel.mp3", "gain": 0.6 } } }
```

A synthesised sound carries a `gain` in its recipe; before this a supplied file had no way to say
how loud it should be, so one mastered hotter than the rest could only be fixed by re-exporting
it. `gain` is a plain multiplier, 1 being the file as recorded.

Every id is optional — anything you do not supply keeps its chiptune version, so a half-filled
folder is a perfectly normal state. The ids the game plays:

| group | ids |
|---|---|
| shots | `shoot_water` `shoot_normal` `shoot_grass` `shoot_rock` `shoot_bolt` |
| combat | `hit` `crit` `kill` `hurt` |
| pickups | `xp` `coin` `levelup` `pickup` |
| ability fallbacks | `ability` `quake` `beam` `shield` |
| events | `boss` `evolve` `select` `confirm` `stairs` |
| end of a run | `mission_success` `mission_failed` |
| wheel | `wheel_spin` |
| moves | one per ability — see below |

### Move sounds

Every ability names its own sound in `sound:` in
[`src/data/abilities.js`](../src/data/abilities.js), and the manifest maps that id to a file:

| id | ability | id | ability |
|---|---|---|---|
| `move_shield` | Protect Bubble | `move_hyperbeam` | Hyperbeam |
| `move_quake` | Earthquake | `move_thunder` / `move_electric` | Thunderbolt (picks one) |
| `move_whistle` | Homing Leaf | `move_bubble` | Hydro Pump |
| `move_air` | Spectral Arrow | `move_dark` | Dark Pulse |
| `move_fire` | Flamethrower | `move_shortdark` | Night Shade |
| `move_bigfire` / `move_flame` | Fire Spin (picks one) | `move_ghost` | Lick |
| `move_throw` | Present | `move_hail` | Blizzard |

Some sounds are not abilities and are played by name from the code that fires them: `evolve`,
`select`, `wheel_spin` and **`stairs`** — the last plays as the screen fades on the way to a new
floor. Note the file it points at is `stairs_sounds.mp3`, plural.

**`mission_success`** and **`mission_failed`** are the soundtrack's two result jingles (tracks 145
and 146). Success plays when the victory screen opens, Failed the moment you faint -- in an endless
run too. They are *jingles*, not effects (`playJingle` in `src/audio.js`): the stage music stops,
anything the next screen starts waits silently until the jingle is over, and restarting the run or
choosing to continue into endless cuts it short. Neither has a synthesised fallback; without the
file, the end of a run is simply quiet.

`sound` may be an **array of two**, and one is chosen at random on every cast — the choice comes
from the cosmetic RNG, so it cannot shift anything the run's seed decides.

The sound lives on the ability rather than in a table keyed on its effect because Dark Pulse,
Night Shade and Lick all share the `drainRings` effect and have to sound nothing like each other.
If a file is missing the ability falls back to a chiptune chosen by effect, so emptying this
folder leaves the game audible rather than silent.

### Keep them short

These are decoded into memory rather than streamed, and `hit` fires many times a second. Anything
over about half a second will sound wrong for the constant ones. WAV, OGG and MP3 all work. The
45 ms per-id rate limit and the 14-voice cap apply to samples exactly as they do to the
synthesised sounds, so a dense fight cannot turn into a wall of noise.

Two ids are exceptions, because nothing fires them in bulk: the ability move sounds, which run up
to a couple of seconds, and `wheel_spin` — the prize wheel spins for **exactly as long as that
sample lasts**, so a longer or shorter file changes how long the wheel turns. Neither is ducked;
the stage music keeps playing underneath.

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

### Cutting a sprite out of a tile

`key` removes every pixel matching the backdrop colour, which is right for a sprite sitting on a
sheet's flat background. It is wrong when the sprite is cut out of a **dungeon tile**, because the
tile's floor colour can also appear inside the artwork -- the Voltorb trap's own outline is drawn
in exactly its floor colour, so keying by colour punches holes straight through its face.

`"flood": true` keys from the border inward instead, so only background actually connected to the
edge of the crop is removed:

```json
"item_voltorb": {
  "src": "assets/pmd/items_2.png",
  "x": 143, "y": 391, "w": 16, "h": 16,
  "anchor": "center", "key": "#554d55", "tolerance": 42, "flood": true
}
```

Flooding also lets the tolerance go much wider than a plain key safely, since interior pixels are
never at risk: 42 here takes the tile's darker floor shades with it while leaving the Voltorb's
darkest red, which is 57 away, untouched.

## Frame sequences

Some ripped effects ship as one PNG per frame rather than as a strip. A `sequences` entry names
the folder and how the files are numbered:

```json
"sequences": {
  "hail": { "dir": "assets/pmd/hail/Hail", "prefix": "Hail", "pad": 2, "frames": 65 }
}
```

That reads `Hail01.png` through `Hail65.png`. `pad` is how many digits the number is zero-padded
to; leave it out for `Hail1.png`.

The other form cuts frames out of **one sheet**, as explicit rectangles:

```json
"fx_blastburn": {
  "src": "assets/pmd/fire_moves.png", "key": "#008080", "tolerance": 8,
  "cell": [82, 76],
  "cells": [[2, 39, 48, 45, 17, 15], ...]
}
```

Each entry is `[sx, sy, sw, sh, dx, dy]`: where the frame is on the sheet, and where to place it
inside the uniform cell. The placement is not decoration -- ripped effect sheets draw each frame
only as big as it needs to be, so the frames differ in size and spacing. Centring them makes a
blast grow from a fixed point; aligning them to a common baseline instead makes flames rise.
Getting it wrong makes every frame snap to a corner and the animation jitter.

Some sheets divide their frames with a **magenta rule** (`#ff00ff`) rather than whitespace, which
is the only reliable way to split them -- `fire_moves.png` has gaps *inside* a frame wider than
the gaps between frames.

Every frame must be the same size, and they are stitched into **one wide canvas** at load, so
drawing a frame is a single `drawImage` with a source offset rather than juggling sixty-five
images. A sequence that fails to load is warned about and skipped, like every other asset.

The sequences today are `hail`, `fx_arrow`, `fx_flamethrower`, `fx_blastburn`, `fx_shadoworb`,
`fx_nightshade`, `fx_tsunami` and `substitute`, plus the secret floors' set: `legend_portal`,
`weather_rain`, and the legendaries' attack effects (`fx_icepillar`, `fx_iceshard`, `fx_icerock`,
`fx_iceblock`, `fx_firedome`, `fx_bolt`, `fx_spark`, `fx_bubble`, `fx_shard`, `fx_boulder`,
`fx_diamond`, `fx_flame`, `fx_geyser`, `fx_spire`, `fx_tornado`, `fx_rock`, and from the second
pass `fx_crescent`, `fx_firestar`, `fx_outrage`, `fx_meteor`, `fx_dust`, `fx_aura_warm`,
`fx_aura_cold`, `fx_roar` and `fx_bigbubble` out of `dragon_moves.png`, `fx_ring` out of
`dark_moves.png`, `fx_zigzag` out of `thunderbolt.png`, and `status_freeze` / `status_shield` out
of `status.png`). `hail` is the only one in the per-file form; the rest are cut out of sheets.

The legendaries' effects come mostly from `thunderbolt.png` (its labelled Ice, Fire 3, Bolt 3 and
Break rows) and `wave.png` (the Flame and blue-flame columns, the Earthquake spire, the Tornado),
with the tumbling rock from `rock_moves.png`. Which effect each attack uses is the `LOOKS` table
in `src/data/legends.js`. Two of the column effects (`fx_flame`, `fx_geyser`) skip one frame of
the sheet's row on purpose: a loose flame from the row above overlaps it, and the skipped frame is
a near-duplicate of its neighbour anyway. `weather_rain` is sixty 240x160 panels on an 8px gutter,
five to a row, drawn over the screen like the hail.

## Legendary sprites

The nine legendaries (`assets/sprites/<id>/`, PMD collab folders like every other Pokemon) are NOT
in `manifest.json` and NOT in the sprite atlas. Their sheets are large -- Moltres attacks in 104x136
cells -- and only one is ever on screen, so they load when a portal is entered (`loadLegendAnims`
in `src/assets.js`), during the two seconds of black, and are freed on the way back out. Each entry
in `src/data/legends.js` lists the animations it needs in `anims`; `Walk` is always loaded. An
animation that is only a `<CopyOf>` in `AnimData.xml` (Articuno's `Strike`, say) cannot be loaded
by name -- list the one it copies.

`substitute` is not an effect but a creature: the Substitute weapon's doll, fifteen 26x28 cells
out of `substitute_sprite.png`, bottom-aligned so the doll's feet stay put. Cells 0-4 are the
idle poses from the sheet's first row (down, down-left, left, up-left, up), 5-9 its second row
and 10-14 its fourth -- the death plays one frame from each at the facing's column. The three
right-hand facings are those poses **mirrored at draw time**, so they are not in the strip.

Two of them are worth copying when you add the next one:

* **`hail`** is the weather overlay Delibird's Blizzard lays over the viewport. Its frames are
  240x160, which is the GBA screen, so they are drawn **1:1 and tiled** -- scaling them up would
  turn the hailstones into boulders.
* **`fx_tsunami`** is Hydro Pump's wall of water: three 72x112 cells out of `wave.png`. It shows
  two things. First, **one key can clear two backgrounds** -- the frames sit on a `#006464` panel
  inside the sheet's own `#008080` field, and since those are 28 apart per channel, a tolerance of
  30 takes both while the nearest colour the water actually uses (`#209090`, 32 away) survives
  untouched. Second, art that has to cover a **variable length** is **tiled at its own size**
  rather than stretched: the wall is as long as the ability's `wallLen` asks, drawn as however
  many copies of the 112-tall cell that takes, spaced so the crest spans exactly the hitbox and
  never a stride further. Stretching it would change the pixel size halfway through the game.

## Optional images

Two images are ones the game is designed to run without, and are marked `optional` so a missing
file is silent rather than a warning every boot:

```json
"images": {
  "title": { "src": "assets/miscellaneous/logo.png", "optional": true },
  "wheel": { "src": "assets/pmd/wheel.png", "optional": true }
}
```

Every item and tile now comes from **`items_2.png`** (the Explorers of Time/Darkness sheet),
which has all twelve that `items.png` used to supply: the coin, the berry, the orb, the elixir
and the Voltorb from its item block on `#008080`, and from its trap block the two staircases and
the six traps -- spike, explosion, slumber, poison, warp, and PP Down (114,412, row 2 column 5),
all 24x24 and all flooded on `#808080`. `items.png` stays in the folder and on the credits
screen, but nothing loads it any more.

* **`miscellaneous/logo.png`** is the title logo, centred at the top of the main menu in place
  of the drawn `POKEMON DRACULA EDITION` wordmark (which comes back if the file is missing). It
  should have a transparent background. Any size: the transparent margin is trimmed, then it is
  shrunk once at load to fit 380x100, in halving steps with smoothing — it is painted art, not
  pixel art, so nearest-neighbour would turn its curves to stairs. The subtitle and the menu sit
  below it.
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

The DS sheets — from **Explorers of Sky** and **Explorers of Time/Darkness** — have their own
block on that screen. Five are in use: `maps.png` (the stage select's world map, see below),
`substitute_sprite.png` (the Substitute weapon),
`dungeon_font.png` (the stage name and floor on the stairs title card; sliced by
`src/data/dungeonfont.js`, white on black, each glyph cut to its inked width), `items_2.png`, and
`dimensional_hole.png` (the secret floor's portal: its top-left four frames).

Each legendary also drops a **relic**, cut from `items_2.png`'s species items like the other
pickups: `relic_articuno` (a pale feather), `relic_moltres` (a flame feather), `relic_zapdos` (a
golden feather), and gems or stones for the rest -- see the `sprites` section of the manifest and
`RELICS` in `src/data/legends.js`.

**Credited, not yet used:** `ice_stage_tileset.png` and `miracle_sea_tileset.png`.

### More from items_2.png

`items_2.png` also provides, as crops in the manifest's `sprites`:

- **The Explorer's Bag:** `bag_*`. The sheet has two seeds and one orb, so most of the seeds and
  orbs are the same sprite recoloured: a crop may carry `"hue"` (degrees to rotate every pixel's
  hue) and `"sat"` (a saturation multiplier; 0 is grey), applied once at load. Oran Berry, Max
  Elixir and Gravelerock are their own sprites.
- **Totems:** `totem_blessing`, `totem_trial`, `totem_fortune` — three of the four totem poles in
  the "Other 2" corner, anchored at the bottom. The pink pole with the skull is not used.
- **The treasure chest:** `chest_deluxe`, the red Deluxe Box.
- **Seven new trap tiles:** `trap_summon`, `trap_pitfall`, `trap_gust`, `trap_seal`,
  `trap_wonder`, `trap_random`, `trap_slow`, cut from the same 25px grid as the first five.
- **Ribbons and ranks:** `ribbon_grass` / `_cave` / `_beach` / `_none` (green, purple, blue, grey)
  and `rank_0` … `rank_8` with `rank_lock`, the Explorer Rank badges in sheet order.

### The world map: the stage select

`maps.png` is twelve versions of the same world map, 504x336 each, in a 2x6 grid with 3px black
lines between them; the later versions show more of the world and its location dots. The stage
select draws **version 1** (top-left, `WORLD_MAP.rect` in `src/data/stages.js`) at 1:1, and puts
`cursor.png` -- the 8x8 location dot -- on each stage's `mapAt`, the centre of its dot in that
map's pixels. The three spots are the ones version 9 (first column, fifth row) gives those places:
Grass Route on the right half of the left-most forest, Beach Cave on the grey cave above the sea,
Damp Cave on the brown boulder mountain south of the village.

A new stage needs only a `mapAt`. Another map version is a different `rect`, and its dots are on
the sheet to copy from.
