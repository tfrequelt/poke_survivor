# Poke Survivor

A Pokemon-flavoured Vampire Survivors clone that runs in the browser. Vanilla JavaScript ES modules,
Canvas 2D and Web Audio -- no framework, no dependencies, no build step. All art is pixel data defined
in `src/data/art.js` and all music is synthesised at runtime, so there are no binary asset files.

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
| `F` | Fullscreen -- 640x360 is an exact 3x fit for 1080p |

The game opens on a title screen; any key goes to partner select, where you pick Wooper, Eevee or
Rowlet. `?char=wooper|eevee|rowlet` skips straight into a run with that partner.

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
| Eevee | **Hyperbeam** -- massive damage, but you cannot move while firing | **Thunderbolt** (Jolteon) -- chain lightning that paralyses |
| Eevee | | **Hydro Pump** (Vaporeon) -- knockback jet that heals you |
| Eevee | | **Dark Pulse** (Umbreon) -- rings that weaken enemies and drain life |

Both abilities level 1-5 through further level-up draws. The HUD shows each slot's icon, its key,
and a cooldown that drains as it recharges.

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
