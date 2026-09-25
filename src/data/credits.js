// L0 -- pure data. Attribution.
//
// Three different sources are in this project and they are NOT interchangeable, so the screen
// keeps them apart:
//
//   * Pokemon sprites and portraits from the PMD Sprite Collab, a community project whose
//     artists ask to be credited per Pokemon on their own site.
//   * Sheets ripped from Pokemon Mystery Dungeon: Red Rescue Team and hosted on The Spriters
//     Resource. Several of those rips ask for credit by name, which is given below.
//   * The Mystery Dungeon soundtrack.
//
// None of it is the project's own work, and nothing here may be listed as if it were.

const RIP_BASE = 'spriters-resource.com/game_boy_advance/pokemonmysterydungeonredrescueteam';

/** [asset id, what it is, where it is used]. The full URL is RIP_BASE + '/asset/' + id. */
const RIPS = [
  ['5402', 'TINY WOODS MAP', 'grass stage tiles'],
  ['19788', 'MT THUNDER TILES', 'cave stage tiles'],
  ['75220', 'BEACH CAVE MAP', 'bundled'],
  ['5413', 'INTRO BACKGROUNDS', 'title screen'],
  ['5426', 'ITEMS', 'coin, sitrus berry'],
  ['69118', 'STATUS ICONS', 'low health, burn'],
  ['5422', 'FONT AND WINDOW', 'window styling'],
  ['163902', 'POISON MOVES', 'bundled'],
  ['39320', 'GHOST MOVES', 'bundled'],
  ['41323', 'DARK MOVES', 'bundled'],
  ['40562', 'FIRE MOVES', 'bundled'],
  ['41326', 'ROCK MOVES', 'bundled'],
];

/**
 * Rips from OTHER games, which are not Mystery Dungeon and do not share its URL. Kept separate
 * so the screen never implies one source covers all of it.
 *
 * [site section, game folder, asset id, what it is].
 */
const OTHER_RIPS = [
  ['snes', 'ff6', '6705', 'FINAL FANTASY VI', 'thunderbolt'],
  ['game_boy_advance', 'finalfantasy4advance', '5814', 'FINAL FANTASY IV ADVANCE', 'wave'],
  ['mobile', 'rockbotthemachinewars', '159762', 'ROCKBOT: THE MACHINE WARS', 'explosion'],
  ['mobile', 'graalonlineera', '147250', 'GRAAL ONLINE ERA', 'water particles'],
  ['game_boy_advance', 'pokemonfireredleafgreen', '28883', 'POKEMON FIRERED/LEAFGREEN', 'R/S moves'],
];

export const CREDITS = [
  { heading: 'SPRITES AND PORTRAITS' },
  { line: 'Pokemon sprites and portraits by the' },
  { line: 'PMD SPRITE COLLAB community.', color: 'gold' },
  { line: '' },
  { line: 'sprites.pmdcollab.org', color: 'blue' },
  { line: 'see the CONTRIBUTORS page there', color: 'blue' },
  { line: '' },
  { line: 'Every sprite and portrait is the work of', color: 'dim' },
  { line: 'individual contributors credited on that', color: 'dim' },
  { line: 'site, per Pokemon. Thank you.', color: 'dim' },
  { line: '' },

  { heading: 'TILES, BACKGROUNDS, ITEMS AND ICONS' },
  { line: 'Ripped from POKEMON MYSTERY DUNGEON:', color: 'gold' },
  { line: 'RED RESCUE TEAM, via The Spriters Resource.', color: 'gold' },
  { line: '' },
  { line: `${RIP_BASE}/asset/<ID>`, color: 'blue' },
  { line: '' },
  ...RIPS.map(([id, what, used]) => ({
    line: `${id.padEnd(7)}${what.padEnd(20)}${used}`,
    color: 'dim',
  })),
  { line: '' },
  { line: 'Intro backgrounds ripped by MEGA_LEO,', color: 'dim' },
  { line: 'who asks to be credited if used.', color: 'dim' },
  { line: 'Mt Thunder tiles ripped and formatted', color: 'dim' },
  { line: 'by SILVERDEOXUS563.', color: 'dim' },
  { line: '' },

  { heading: 'EFFECT SHEETS FROM OTHER GAMES' },
  { line: 'Also via The Spriters Resource:', color: 'gold' },
  { line: '' },
  ...OTHER_RIPS.map(([section, game, id, title, what]) => ({
    line: `${title}  (${what})`,
    color: 'dim',
  })),
  { line: '' },
  ...OTHER_RIPS.map(([section, game, id]) => ({
    line: `spriters-resource.com/${section}/${game}/asset/${id}`,
    color: 'blue',
  })),
  { line: '' },

  { heading: 'MUSIC' },
  { line: 'Tracks from the POKEMON MYSTERY DUNGEON', color: 'gold' },
  { line: 'soundtrack, composed by Arata Iiyoshi,', color: 'dim' },
  { line: 'Hideki Sakamoto, Keisuke Ito, Ken-ichi', color: 'dim' },
  { line: 'Saito and Yoshihiro Maeda.', color: 'dim' },
  { line: '' },

  { heading: 'EVERYTHING ELSE' },
  { line: 'Code, sound effects, UI and fallback art', color: 'dim' },
  { line: 'made for this project.', color: 'dim' },
  { line: '' },
  { line: 'Pokemon is a trademark of Nintendo,', color: 'dim' },
  { line: 'Game Freak and Creatures Inc.', color: 'dim' },
  { line: 'This is a non-commercial fan project and', color: 'dim' },
  { line: 'is not affiliated with them.', color: 'dim' },
];
