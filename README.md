# Poke Dracula Edition

## Credits

The Pokemon sprites and portraits in `assets/` come from the **[PMD Sprite Collab](https://sprites.pmdcollab.org)**,
a community project. Each sprite and portrait is the work of individual contributors, who are
credited per-Pokemon on the project's
**[Contributors page](https://sprites.pmdcollab.org/#/Contributors)**. Thank you to all of them.

Pokemon is a trademark of Nintendo, Game Freak and Creatures Inc. This is a non-commercial fan
project and is not affiliated with them.

Code, music, sound, UI and the fallback pixel art were made for this project.

A Pokemon-flavoured Vampire Survivors clone that runs in the browser. Vanilla JavaScript ES
modules, Canvas 2D and Web Audio -- no framework, no dependencies, no build step.

Every piece of supplied art and audio is optional. The PMD sprite sheets, the ripped tilesets and
the soundtrack all have a drawn or synthesised fallback in `src/data/art.js` and `src/audio.js`,
so the game runs from a bare checkout and gets better as assets are added. See
[`assets/README.md`](assets/README.md).

## Running it

ES modules will not load over `file://`, so the folder has to be served over HTTP. Run **one** of these
from this directory, then open the address it prints:

```
npx serve .                 # -> http://localhost:3000
python -m http.server 8000  # -> http://localhost:8000
```

## Controls

| Key | Action |
|---|---|
| `WASD` / arrow keys | Move |
| `Q` / `E` | First / second ability |
| `Esc` / `P` | Pause |
| `1`-`3` / arrows + `Enter` | Choose on any card screen |
| `R` | Reroll on level-up, restart otherwise |
| `B` / `S` | Banish / skip a level-up (press `B` twice to confirm) |
| `Q` (paused / after a run) | Back to partner select |
| `O` | Settings — volume, key bindings, back to menu, restart |
| `M` | Mute |
| `S` | Kecleon Shop (from the title screen) |
| `C` | Credits (from the title screen) |
| `F` | Fullscreen -- 640x360 is an exact 3x fit for 1080p |

The game opens on a title screen; any key goes to partner select, where you pick one of six
partners, and then to stage select.
`?char=wooper|eevee|rowlet|vulpix|delibird|gastly` skips straight into a run with that partner,
and `?stage=grass|cave|beach` picks where.

## Settings

`O` opens settings from the title screen or from the pause screen: separate music and sound
volume sliders, and a **controls page where every key can be rebound** — movement, both
abilities, pause, restart, mute, fullscreen, and the level-up reroll / banish / skip. Binding a
key another action already holds swaps the two rather than leaving anything unbound.

The arrow keys, `Enter` and `Escape` are fixed aliases and always work, so a binding you regret
can always be undone. Volumes and bindings are saved to `localStorage`, and a browser that blocks
storage simply starts from the defaults.

Two separate keys are written: `pokesurvivor.settings.v1` for preferences and
`pokesurvivor.save.v1` for the gold bank and shop ranks. They are kept apart deliberately --
losing your settings is an annoyance, losing your progress is not, and a corrupt blob in one must
not be able to take the other down with it.

## Debug tools

Append `?debug=1` to the URL for the developer overlay (frame timing, entity counts, hitboxes).
Other URL parameters: `?seed=`, `?t=` (start N seconds into a run), `?char=`, `?stage=`, `?level=`.
`?spriteedit=1` opens the in-page pixel editor used to author the sprites in `src/data/art.js`.

## Abilities

Each partner has two abilities, exclusive to it, drafted from the level-up screen. The first is
guaranteed to appear within three level-ups; the second unlocks when you evolve at level 10.

| Partner | `Q` | `E` (after evolving) |
|---|---|---|
| Wooper | **Protect Bubble** -- shield that blocks all contact damage, then bursts | **Earthquake** (Quagsire) -- shockwaves that stun; flying enemies are immune |
| Rowlet | **Homing Leaf** -- blades that seek separate targets and curve back | **Spectral Arrow** (Dartrix) -- pierces a line, executes the wounded, leaves a burning trail |
| Eevee | **Hyperbeam** -- massive damage, but you cannot move while firing | **Thunderbolt** (Jolteon) -- lightning falls from the sky into a marked circle and leaves it crackling |
| Eevee | | **Hydro Pump** (Vaporeon) -- a wave front that sweeps outward, shoving and healing |
| Eevee | | **Dark Pulse** (Umbreon) -- rings that leave a lasting pool of shadow |
| Gastly | **Night Shade** -- spreads a shadow that eats away at whatever stands in it | **Lick** (Haunter) -- drags the life out of everything nearby |
| Vulpix | **Flamethrower** -- a held cone of fire that leaves everything in it burning | **Fire Spin** (Ninetales) -- a vortex of flame that holds a crowd in place and cooks it |
| Delibird | **Present** -- lobs a gift: four times in five it detonates, the fifth time it heals you | **Blizzard** (Hustle) -- a storm across the whole screen; little damage, but nothing moves through it |

Both abilities level 1-5 through further level-up draws. The HUD shows each slot's icon, its key,
and a cooldown that drains as it recharges. Below 20% health a `!` appears over your Pokémon's
head, the way it does in Mystery Dungeon, and stays until you heal.

### Burn

Fire is the only thing in the game that keeps hurting after it has hit you. A burning enemy takes
damage four times a second for as long as it lasts, carries an animated flame over its head, and
**ignores armour** -- charging the armour toll on every instalment is an artefact of the tick rate
rather than a decision, and it would leave fire doing almost nothing to exactly the rock-types it
ought to melt. Burns refresh rather than stack: the strongest and the longest win.

Casting plays your form's **Attack animation** once, from its own PMD sheet, in whatever
direction you are facing. Decidueye and Gengar do not grant a third ability --
they make the second one enormous instead.

## Weapons and types

Every weapon has a **Pokemon type**, and you are only ever offered weapons matching one of your
current form's types. Eleven types, six weapons each, **four weapon slots** -- so a run picks four
out of six and no two partners play out of the same toolbox. Evolving changes the pool for future
draws; it never takes away a weapon you already hold.

| Form | Pool |
|---|---|
| Wooper / Quagsire | Water + Ground |
| Eevee | Normal |
| Vaporeon / Jolteon / Umbreon | Water / Electric / Dark |
| Rowlet / Dartrix | Grass + Flying |
| Decidueye | Grass + Ghost |
| Gastly / Haunter / Gengar | Ghost + Poison |
| Vulpix / Ninetales | Fire |
| Delibird | Ice + Flying |

No two weapons share a delivery mechanism. There are twenty firing behaviours -- among them mines
you leave behind, turrets that fire on their own, shots that ricochet and gain damage, seeds that
detonate seconds later, beams that burn everything on the line to their target, vortices that drag
the crowd together, and an attack that charges while you stand still -- and `initWeaponDefs()`
warns at boot if two weapons ever end up with the same `behavior` + `motion` pair.

## Stages

Every stage is a **bounded square**. Walls stop the player, the enemies and the camera, and the
spawn director keeps everything inside — the arena size is `arena` in `src/data/stages.js`.

| Stage | Arena | Ground |
|---|---|---|
| Grass Route | 3456² | Tiny Woods — meadow, grass clearings, sand rooms inside their cliff borders |
| Damp Cave | 2880² | Mt. Thunder — one open floor of rock, walled all the way round |
| Sunset Beach | 3840×3456 | drawn procedurally; the sand runs out into the sea |

The first two are drawn from ripped PMD art, 24px tiles at a time. The interior layout — where
the rooms are, how big, where the clearings fall — is generated from the run seed per tile by
`src/terrain.js` and never stored, so walking back over ground finds it exactly as you left it.
Each stage keeps its procedural layers as a fallback if the image is missing.

## Winning, and the Kecleon Shop

Butterfree arrives at 20:00. Beating it **wins the run**: everything on the field dies with it,
all of it is pulled in so the payout is actually collected, and after a few seconds a victory
screen shows the time, the level, the kill count and the gold.

Gold banks from **every** run -- win, death or quit -- and is spent at the **Kecleon Shop** on the
title screen (`S`). Everything there is permanent and applies to every run afterwards:

| Group | What it sells |
|---|---|
| Offence | Might, Haste, Reach, Multishot, Focus, Attunement |
| Survival | Vitality, Hide, Swiftness, Revive (a second chance at half health) |
| Fortune | Scholar, Greed, Magnetism, Luck |
| Draft | Extra rerolls, banishes and skips on the level-up screen |

Ranks stack by repetition rather than by scaling, so five ranks of a +8% upgrade read as +40% and
not x1.47 -- the same way five Might cards do in a run. **Reset Progress** refunds every coin ever
spent and clears every rank. The bank lives in its own `localStorage` key, separate from settings,
so a corrupt preferences blob cannot take your progress with it.

## Delibird's presents

Delibird, and nobody else, finds **presents** on the map. Walking onto one freezes the run and
spins a wheel:

| Prize | Chance |
|---|---|
| A small stat bonus | 26% |
| +1 projectile | 20% |
| A level | 18% |
| Trade a move in for a new one | 18% |
| A large stat bonus | 12% |
| Three levels | 6% |

The prize is decided from the run seed the moment the wheel starts -- the spin is an animation of
a result that already exists. Trading a move in opens a second page showing everything you own
plus **Keep Everything**, which is a real option and still pays out. The offered move always
respects your type gating, and if there is nothing legal left to offer the wheel pays in stats
instead of handing over an empty menu.

## Pickups and systems

Enemies, destructible scenery and mini-bosses drop items you walk over:

| Item | Effect |
|---|---|
| **Magnet** | Vacuums every XP orb and coin on the field |
| **Sitrus Berry** | Heals 30% of max HP |
| **Blast Seed** | Clears the screen |
| **Treasure** | Evolves a maxed weapon (if you hold its paired item), and pays gold |
| **Present** | Delibird only -- freezes the run and spins the prize wheel |

XP orbs come in four tiers by value, differing in size and colour -- a Graveler visibly out-drops
a Rattata. Mini-bosses arrive at 5:00, 10:00 and 15:00 (Raticate, Graveler, Pidgeot), with
Butterfree as the final boss at 20:00. A boss pays out like one: a spray of a dozen or more orbs
and coins you can see from across the screen, plus exactly one power-up.

**Destructible scenery** — bushes, rocks and crates — breaks once and stays broken. Breaking one
almost always drops a little XP and gold and sometimes a single power-up, a crate being the
jackpot. New scenery keeps appearing as you move, but only ever out of sight beyond the screen
edge, and never above a hard cap. Weapons and abilities never *target* scenery; you break it with
shots that pass through it and with area damage.

The roster is built as **evolution lines**: Rattata early and Raticate later, Caterpie then
Metapod then Butterfree, Zubat into Crobat, Geodude into Graveler, Marill into Azumarill,
Zigzagoon into Linoone, Poochyena into Mightyena. The swarm visibly grows up over a run rather
than only gaining a health multiplier.

**Revives** bought from the shop are spent automatically: at zero health you get back up at half
health with a two and a half second mercy window, and everything nearby dies. Only when you have
none left does the run end.

**Weapon evolution:** take a weapon to max level, hold its paired passive item, then open a
treasure chest. Mud Shot + Mystic Water becomes Quagmire; Swift Star + Silk Scarf becomes Star
Barrage; Leaf Arrow + Sharp Beak becomes Spirit Shackle.

## Audio

Music tracks listed under `music` in `assets/manifest.json` are streamed per context -- one list
per key, picked at random each time:

| Key | When |
|---|---|
| `menu` | Title, partner select and credits |
| `grass` / `cave` / `beach` | Whichever stage the run is on |

Tracks stream rather than decode, so the ~35MB set costs nothing at boot. **Tracks do not loop:**
when one finishes, a different track from the same list starts, so a twenty-minute run on a stage
with three songs cycles through them.

Sound effects are synthesised at runtime, and so is a **fallback chiptune**: if a key has no track
listed, or the file fails to load, the synthesised theme takes over so the game is never silent.
Individual sounds can be replaced with real samples by listing them under `sfx` in the manifest --
see `assets/README.md`.

Browsers require a real keypress before audio can start, so the first key you press unlocks it.
`M` mutes.

## Debug keys

Available with `?debug=1`:

| Key | Action |
|---|---|
| `K` | Spawn 100 enemies (stress test) |
| `L` | Force a level-up |
| `T` | Skip forward 60 seconds |
| `G` | Toggle god mode |
| `H` | Toggle hitboxes and magnet radius |
| `[` / `]` | Timescale down / up (0.25x - 8x) |
| `R` | Restart the run |

`?atlas=1` renders a contact sheet of every sprite and the pixel font.
`?dirs=1` shows every PMD-backed form in all eight facings, to verify direction mapping.

## Development tools

`tools/spritegen.mjs` is the sprite authoring bootstrap. Creatures are described with drawing
primitives (ellipse, triangle, outline, mirror) and it emits the literal character grids in
`src/data/shapes.js`, which stay hand-editable afterwards.

```
node tools/spritegen.mjs                # ASCII preview of every shape
node tools/spritegen.mjs --only=eevee   # just one
node tools/spritegen.mjs --write        # regenerate src/data/shapes.js
```

`tools/shot.mjs` drives headless Chrome over the DevTools Protocol with no dependencies: it loads
the game, collects console output and uncaught exceptions, optionally holds keys or runs script,
and writes a PNG. It is how changes get verified without a human at the keyboard.

```
node tools/shot.mjs --url="http://127.0.0.1:8080/?debug=1" --out=shot.png --wait=3000 --gpu=1
node tools/shot.mjs --url="..." --hold=KeyD,KeyS --pre="window.__dbg.stress(600)" \
                    --eval="JSON.stringify(window.__dbg.perf())"
```

`--dpr=1.25` simulates Windows display scaling, which is what the integer-scaling canvas exists
to handle.
