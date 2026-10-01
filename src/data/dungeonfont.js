// L0 -- pure data. The character map for dungeon_font.png (Explorers of Sky).
//
// The sheet is a grid of 25x25 cells, 20 to a row, white glyphs on black. Only its first four
// rows are mapped: they hold everything Latin -- punctuation, digits, A-Z and a-z. The rest of the
// sheet is accented letters, kana and hangul, which nothing in the game writes.
//
// Each string is one row, one character per cell, left to right. A space marks an empty cell.

export const DUNGEON_FONT = {
  cell: 25,
  perRow: 20,
  rows: [
    ' !"&\'+,-./0123456789',
    ':;?ABCDEFGHIJKLMNOPQ',
    'RSTUVWXYZabcdefghijk',
    'lmnopqrstuvwxyz',
  ],
  // Gap between glyphs, and the width of a space -- the sheet's space cell is empty, so it has no
  // inked width of its own to measure.
  tracking: 1,
  space: 6,
};
