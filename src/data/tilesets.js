// L0 -- pure data. Where each terrain lives inside a ripped PMD dungeon map.
//
// The source images in assets/pmd/ are rendered MAPS, not tilesets: a whole Tiny Woods or Beach
// Cave floor, drawn once. Everything here is coordinates into those maps, in TILES, measured from
// `origin` -- the pixel where the 24x24 grid starts, which is not the corner of the image.
//
// Terrain comes in three layers and every stage that uses a tileset is built from them:
//
//   wild   the ground everywhere else. Tiny Woods' flowery meadow, Beach Cave's solid rock.
//   open   large organic patches over the wild ground. Optional -- the cave has no third terrain.
//   floor  rectangular rooms, each ringed by the map's own cliff border.
//
// A `block` is [tileX, tileY, wide, tall]: a rectangle of the source map that is uniformly one
// terrain. It is sampled with (tx mod wide, ty mod tall), so the original texture -- including
// where its flowers and pebbles fall -- is reproduced exactly instead of approximated by picking
// random single tiles, which reads as noise.
//
// `ring` names the border tiles. `north` is a LIST because Tiny Woods draws its cliff two tiles
// tall (the grassy lip, then the rock face below it) while Beach Cave draws one.
//
// `border` is the edge of the stage itself -- the arena wall. Its `ring` is the same eight named
// tiles, and `fill` is the block that covers everything beyond it, so the world ends in something
// solid rather than in bare canvas.
//
// `pitch` is the distance between tiles in the SOURCE image. It is normally the tile size, but a
// sheet laid out as a table has a rule between its cells: Mt. Thunder is 24px tiles on a 25px
// pitch, and reading it at 24 would shear every tile by a pixel more than the last.

export const TILESETS = {
  woods: {
    image: 'woods',
    size: 24,
    origin: [105, 23],
    // The meadow is a genuine 4x4 pattern -- sixteen distinct tiles -- so it is sampled as a
    // block and not as random picks, which is what keeps its flowers laid out the way the
    // original artist placed them.
    wild: [13, 24, 4, 4],
    // Plain grass is a single repeating tile in the source, so this block is one tile wide in
    // effect; taking more would pull in the shading of the wall it sits next to.
    open: [0, 22, 2, 4],
    // Kept one tile clear of the walls on every side: the floor tiles that touch a wall carry its
    // shading, and a block that includes one repeats that shadow in stripes across open ground.
    floor: [20, 20, 6, 7],
    layout: { cell: 18, minRoom: 5, margin: 3, roomChance: 0.76, patch: 0.42 },
    ring: {
      north: [[20, 2], [21, 3]],
      south: [[20, 12]],
      west: [18, 6],
      east: [27, 6],
      nw: [[18, 2], [18, 3]],
      ne: [[27, 2], [27, 3]],
      sw: [18, 12],
      se: [27, 12],
    },
    // The map edge. The ring tiles are MIRRORED relative to the room ring above: a room's west
    // wall has its rock on the outside and the room's sand on the inside, and the arena needs the
    // opposite -- rock facing the player, sand carrying on behind it. So west takes the room's
    // east tile and vice versa, and the fill is the sand floor, which makes the edge read as a
    // cliff at the lip of a plateau rather than as a ridge in the middle of the meadow.
    border: {
      ring: {
        nw: [27, 12], north: [[20, 12]], ne: [18, 12],
        west: [27, 6], east: [18, 6],
        sw: [27, 3], south: [[21, 3]], se: [18, 3],
      },
      fill: [20, 20, 6, 7],
    },
  },

  // Mt. Thunder is a real autotile sheet rather than a rendered map, which makes it far better
  // source material than the Beach Cave rip below. Its table starts at pixel (9, 163) and runs
  // 23 columns by 24 rows on a 25px pitch, grouped in threes: Legend 0-2, Walls 3-5, Wall Alt 1
  // 6-8, Wall Alt 2 9-11, Ground 12-14, Ground Alt 1 15-17, Water 18-20, Water Sparkle 21-22.
  // Rows come in eight 3x3 blocks; block 0 is the fully-enclosed case, nine interior variants.
  mtthunder: {
    image: 'mtthunder',
    size: 24,
    pitch: 25,
    origin: [9, 163],
    // One big room, as the stage is meant to be: no wild ground, no clearings, no sub-rooms.
    wild: null,
    open: null,
    // The CENTRE tile of the block, not the block. A block-0 3x3 is a ring: its outer eight are
    // the edges where the terrain meets something else, and only the middle is seamless fill.
    // Tiling all nine lays a grid of pebble borders across the floor.
    floor: [13, 1, 1, 1],
    layout: null,
    ring: null,
    // The arena wall. A ring name says which side of the FLOOR the tile sits on, so the tile it
    // picks is the wall edge facing that floor -- the wall above the floor shows its underside,
    // which is the block's bottom row. The mapping is therefore flipped through both axes.
    border: {
      ring: {
        nw: [5, 2], north: [[4, 2]], ne: [3, 2],
        west: [5, 1], east: [3, 1],
        sw: [5, 0], south: [[4, 0]], se: [3, 0],
      },
      fill: [4, 1, 1, 1],
    },
  },

  cave: {
    image: 'cave',
    size: 24,
    origin: [16, 16],
    // One tile, not a block: the rip's out-of-bounds rock is a single flat colour, so sampling a
    // 2x2 only risks catching the one tile at the sheet corner that has floor bleeding into it.
    wild: [1, 1, 1, 1],
    open: null,                    // Beach Cave is rock and floor, nothing between
    // Rows 5-6 and columns 5-9 only: the other rows clip the room's corner ponds, and the columns
    // either side carry the wall shading.
    floor: [5, 5, 5, 2],
    // Bigger, denser rooms than the woods: the rock between them is a flat fill, so a cave made
    // mostly of rock is a screen of one brown colour. Here the rooms are the stage and the rock
    // is the wall between them.
    layout: { cell: 14, minRoom: 7, margin: 2, roomChance: 0.94, patch: 0 },
    ring: {
      north: [[6, 2]],
      south: [[6, 9]],
      west: [3, 5],
      east: [11, 5],
      // The cave room's corners are cut: the map leaves solid rock in the diagonal cells rather
      // than drawing a corner piece, which is what gives its rooms their rounded look.
      cutCorners: true,
    },
  },
};
