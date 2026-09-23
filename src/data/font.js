// L0 -- pure data. A 5x7 pixel font.
//
// Each glyph is 7 rows encoded as one base32 digit per row, where the 5 low bits are the pixels
// left-to-right (bit 4 = leftmost). So '#...#' = 0b10001 = 17 = 'h'. That keeps a whole glyph to
// seven characters instead of seven string literals, and sprites.js decodes it at boot.
//
// Edit with care, or use the decoder: rows are 0..31 over "0123456789abcdefghijklmnopqrstuv".

export const GLYPH_W = 5;
export const GLYPH_H = 7;
export const B32 = '0123456789abcdefghijklmnopqrstuv';

export const FONT = {
  A: 'ehhvhhh', B: 'uhhuhhu', C: 'ehggghe', D: 'uhhhhhu', E: 'vgguggv',
  F: 'vgguggg', G: 'ehgnhhe', H: 'hhhvhhh', I: 'e44444e', J: '7222iic',
  K: 'hikokih', L: 'ggggggv', M: 'hrllhhh', N: 'hpljhhh', O: 'ehhhhhe',
  P: 'uhhuggg', Q: 'ehhhlid', R: 'uhhukih', S: 'fgge11u', T: 'v444444',
  U: 'hhhhhhe', V: 'hhhhha4', W: 'hhhhlrh', X: 'hha4ahh', Y: 'hha4444',
  Z: 'v1248gv',

  0: 'ehjlphe', 1: '4c4444e', 2: 'eh1248v', 3: 'v2421he', 4: '26aiv22',
  5: 'vgu11he', 6: '68guhhe', 7: 'v124888', 8: 'ehhehhe', 9: 'ehhf12c',

  ' ': '0000000', '.': '0000004', ':': '0040400', ',': '0000048', '!': '4444404',
  '?': 'eh12404', '-': '000e000', '+': '004v400', '/': '11248gg', '%': 'hi2489h',
  "'": '4400000', '(': '2488842', ')': '8422248', '>': '8421248', '<': '248g842',
  '*': '0a4v4a0', '=': '00v0v00', '#': 'avvvva0', '_': '000000v',
};

/** Colours the font is pre-rasterised in. Tinting at draw time would cost a filter per glyph. */
export const FONT_COLORS = {
  white:  '#f4f8ff',
  dim:    '#98a2b8',
  gold:   '#ffd166',
  red:    '#ff6b6b',
  green:  '#7fe08a',
  blue:   '#7ac8ff',
  dark:   '#141425',
};
