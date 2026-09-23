// L4 -- may import L0-L3, read-only.
//
// In-canvas screens, drawn with the game's own pixel font.
//
// Deviation from the original plan, which called for DOM overlays: keeping the menus inside the
// 640x360 pixel grid means one visual language, no font mismatch against the sprites, and no
// second coordinate system to keep in sync with the integer canvas scale. The cost is manual
// layout, which at this size is a handful of constants.

import { G, MODES } from './state.js';
import { ctx, VW, VH } from './render.js';
import {
  drawText, drawTextCentered, textWidth, drawSprite, drawSpriteScaled, drawShadow,
} from './sprites.js';
import { clamp, hash2 } from './util.js';

export const ui = {
  cursor: 0,        // selected card index
  banishArm: false, // banish needs a second keypress, so it cannot be hit by accident
};

const CARD_W = 176;
const CARD_H = 132;
const CARD_Y = 96;
const GAP = 28;

const KIND_COLOR = {
  weapon: '#7ac8ff',
  passive: '#ffd166',
  stat: '#7fe08a',
  heal: '#ff9f9f',
};

const KIND_LABEL = {
  weapon: 'WEAPON',
  passive: 'ITEM',
  stat: 'BOOST',
  heal: 'RECOVER',
};

/** Greedy word wrap for the pixel font, which is fixed width at GLYPH_W + spacing per character. */
function wrap(text, maxChars) {
  const words = text.toUpperCase().split(' ');
  const lines = [];
  let line = '';
  for (const w of words) {
    const candidate = line ? `${line} ${w}` : w;
    if (candidate.length > maxChars && line) {
      lines.push(line);
      line = w;
    } else {
      line = candidate;
    }
  }
  if (line) lines.push(line);
  return lines;
}

function panel(x, y, w, h, border, fill) {
  ctx.fillStyle = fill || '#161629';
  ctx.fillRect(x, y, w, h);
  ctx.fillStyle = border;
  ctx.fillRect(x, y, w, 1);
  ctx.fillRect(x, y + h - 1, w, 1);
  ctx.fillRect(x, y, 1, h);
  ctx.fillRect(x + w - 1, y, 1, h);
}

export function drawLevelUp() {
  ctx.fillStyle = 'rgba(8,8,18,0.82)';
  ctx.fillRect(0, 0, VW, VH);

  drawTextCentered(ctx, 'LEVEL UP', VW / 2, 34, 'gold');
  drawTextCentered(ctx, `LEVEL ${G.level}`, VW / 2, 48, 'dim');

  const offers = G.offers;
  const totalW = offers.length * CARD_W + (offers.length - 1) * GAP;
  const startX = Math.round((VW - totalW) / 2);

  for (let i = 0; i < offers.length; i++) {
    const o = offers[i];
    const x = startX + i * (CARD_W + GAP);
    const selected = i === ui.cursor;
    const color = KIND_COLOR[o.kind] || '#ffffff';

    panel(x, CARD_Y, CARD_W, CARD_H, selected ? '#ffffff' : color, selected ? '#20203a' : '#161629');

    // Kind tag and pip row
    drawText(ctx, KIND_LABEL[o.kind] || '', x + 8, CARD_Y + 8, 'dim');
    drawPips(o, x + CARD_W - 8, CARD_Y + 8, color);

    drawText(ctx, o.name.toUpperCase(), x + 8, CARD_Y + 24, selected ? 'white' : 'white');
    if (o.isNew) drawText(ctx, 'NEW', x + 8 + textWidth(o.name) + 8, CARD_Y + 24, 'gold');

    const lines = wrap(o.desc, 28);
    for (let l = 0; l < lines.length && l < 5; l++) {
      drawText(ctx, lines[l], x + 8, CARD_Y + 44 + l * 10, 'dim');
    }

    drawTextCentered(ctx, `${i + 1}`, x + CARD_W / 2, CARD_Y + CARD_H - 16, selected ? 'gold' : 'dim');
  }

  drawFooter();
}

/** Level pips: filled for levels taken, hollow for those remaining. Caps out at 8 to fit. */
function drawPips(o, rightX, y, color) {
  const max = Math.min(o.max || 1, 8);
  const filled = clamp(o.level, 0, max);
  const size = 3, gap = 2;
  const w = max * (size + gap) - gap;
  let x = rightX - w;
  for (let i = 0; i < max; i++) {
    ctx.fillStyle = i < filled ? color : '#3a3a55';
    ctx.fillRect(x, y + 2, size, size);
    x += size + gap;
  }
}

function drawFooter() {
  const y = VH - 26;
  const parts = [];
  parts.push(['1-3 / ARROWS + ENTER', 'dim']);
  if (G.rerolls > 0) parts.push([`R REROLL (${G.rerolls})`, 'blue']);
  if (G.banishes > 0) parts.push([ui.banishArm ? 'B AGAIN TO BANISH' : `B BANISH (${G.banishes})`, ui.banishArm ? 'red' : 'blue']);
  if (G.skips > 0) parts.push([`S SKIP (${G.skips})`, 'blue']);

  let total = 0;
  for (const [t] of parts) total += textWidth(t) + 14;
  let x = Math.round((VW - (total - 14)) / 2);
  for (const [t, c] of parts) {
    drawText(ctx, t, x, y, c);
    x += textWidth(t) + 14;
  }
}

// --- Title ------------------------------------------------------------------

const HORIZON = 196;        // where the grass starts -- the starters stand ON this line

export function drawTitle(starters, t) {
  // Sky, distant treeline, then grass. The starters' feet sit on the horizon so they read as
  // standing in the world rather than floating in front of a backdrop.
  ctx.fillStyle = '#16283a';
  ctx.fillRect(0, 0, VW, HORIZON);
  ctx.fillStyle = '#1d4430';
  ctx.fillRect(0, HORIZON - 10, VW, 10);
  ctx.fillStyle = '#2f7a3a';
  ctx.fillRect(0, HORIZON, VW, VH - HORIZON);

  // Scattered tufts, same deterministic hash the in-game ground uses.
  for (let i = 0; i < 90; i++) {
    const h = hash2(i * 7 + 1, 3);
    const x = (h * VW) | 0;
    const y = (HORIZON + hash2(i, 11) * (VH - HORIZON)) | 0;
    ctx.fillStyle = h > 0.5 ? '#3f9a4a' : '#276a32';
    ctx.fillRect(x, y, 2, 1);
  }

  drawTextCentered(ctx, 'POKE SURVIVOR', VW / 2, 56, 'gold');
  drawTextCentered(ctx, 'SURVIVE TWENTY MINUTES', VW / 2, 74, 'dim');

  // The three starters lined up on the horizon, bobbing out of phase.
  for (let i = 0; i < starters.length; i++) {
    const c = starters[i];
    const x = VW / 2 + (i - 1) * 78;
    const bob = Math.sin(t * 2.2 + i * 1.5) * 2;
    drawShadow(ctx, x, HORIZON + 2, 1.7);
    drawSpriteScaled(ctx, c.sprId + (((t * 5 + i) | 0) & 1) * 2 + 1, x, HORIZON + bob, 2);
  }

  // Visible most of the time rather than a hard 50/50 blink, which reads as broken.
  if ((t * 1.4) % 1 < 0.72) {
    drawTextCentered(ctx, 'PRESS ANY KEY', VW / 2, 268, 'white');
  }
  drawTextCentered(ctx, 'WASD MOVE    SPACE ABILITY    ESC PAUSE    F FULLSCREEN', VW / 2, VH - 16, 'dim');
}

// --- Character select -------------------------------------------------------

const SELECT_W = 176;
const SELECT_H = 216;
const SELECT_Y = 62;

// Shared maxima so the three bars are comparable rather than each self-normalised.
const STAT_ROWS = [
  { key: 'maxHp', label: 'HP', max: 160 },
  { key: 'moveSpeed', label: 'SPD', max: 80 },
  { key: 'power', label: 'PWR', max: 1.3 },
  { key: 'armor', label: 'DEF', max: 4 },
];

export function drawSelect(starters, t) {
  ctx.fillStyle = '#12202a';
  ctx.fillRect(0, 0, VW, VH);

  drawTextCentered(ctx, 'CHOOSE YOUR PARTNER', VW / 2, 26, 'gold');

  const totalW = starters.length * SELECT_W + (starters.length - 1) * GAP;
  const startX = Math.round((VW - totalW) / 2);

  for (let i = 0; i < starters.length; i++) {
    const c = starters[i];
    const x = startX + i * (SELECT_W + GAP);
    const selected = i === ui.cursor;
    panel(x, SELECT_Y, SELECT_W, SELECT_H, selected ? '#ffffff' : c.color, selected ? '#20203a' : '#161629');

    // Only the selected partner animates -- it reads as "this one is awake".
    const frame = selected ? (((t * 6) | 0) & 1) : 0;
    const bob = selected ? Math.sin(t * 4) * 2 : 0;
    drawShadow(ctx, x + SELECT_W / 2, SELECT_Y + 46, 1.6);
    drawSpriteScaled(ctx, c.sprId + frame * 2 + 1, x + SELECT_W / 2, SELECT_Y + 44 + bob, 2);

    drawTextCentered(ctx, c.name.toUpperCase(), x + SELECT_W / 2, SELECT_Y + 58, 'white');
    drawTextCentered(ctx, c.typeLabel, x + SELECT_W / 2, SELECT_Y + 70, 'dim');

    let y = SELECT_Y + 86;
    for (const row of STAT_ROWS) {
      const v = c.stats[row.key] || 0;
      drawText(ctx, row.label, x + 10, y, 'dim');
      const bx = x + 38, bw = SELECT_W - 48;
      ctx.fillStyle = '#2a2a40';
      ctx.fillRect(bx, y + 1, bw, 4);
      ctx.fillStyle = c.color;
      ctx.fillRect(bx, y + 1, Math.round(bw * clamp(v / row.max, 0, 1)), 4);
      y += 10;
    }

    y += 4;
    for (const line of wrap(c.blurb, 27).slice(0, 2)) {
      drawText(ctx, line, x + 10, y, 'white');
      y += 9;
    }
    y += 3;
    for (const line of wrap(c.trait, 27).slice(0, 3)) {
      drawText(ctx, line, x + 10, y, 'dim');
      y += 9;
    }

    drawTextCentered(ctx, `${i + 1}`, x + SELECT_W / 2, SELECT_Y + SELECT_H - 13, selected ? 'gold' : 'dim');
  }

  drawTextCentered(ctx, '1-3 / ARROWS + ENTER      ESC BACK', VW / 2, VH - 18, 'dim');
}

// --- Evolution choice (Eevee's branch) --------------------------------------

export function drawEvolutionChoice(branches) {
  ctx.fillStyle = 'rgba(8,8,18,0.88)';
  ctx.fillRect(0, 0, VW, VH);
  drawTextCentered(ctx, 'EVOLUTION', VW / 2, 34, 'gold');
  drawTextCentered(ctx, 'CHOOSE YOUR PATH', VW / 2, 48, 'dim');

  const totalW = branches.length * CARD_W + (branches.length - 1) * GAP;
  const startX = Math.round((VW - totalW) / 2);

  for (let i = 0; i < branches.length; i++) {
    const b = branches[i];
    const x = startX + i * (CARD_W + GAP);
    const selected = i === ui.cursor;
    panel(x, CARD_Y, CARD_W, CARD_H, selected ? '#ffffff' : '#7ac8ff', selected ? '#20203a' : '#161629');

    if (b.sprId !== undefined) drawSprite(ctx, b.sprId, x + CARD_W / 2, CARD_Y + 34);
    drawTextCentered(ctx, b.name.toUpperCase(), x + CARD_W / 2, CARD_Y + 44, 'white');

    const lines = wrap(b.note || '', 28);
    for (let l = 0; l < lines.length && l < 4; l++) {
      drawText(ctx, lines[l], x + 8, CARD_Y + 62 + l * 10, 'dim');
    }
    drawTextCentered(ctx, `${i + 1}`, x + CARD_W / 2, CARD_Y + CARD_H - 16, selected ? 'gold' : 'dim');
  }

  drawTextCentered(ctx, '1-3 / ARROWS + ENTER', VW / 2, VH - 26, 'dim');
}

// --- Pause ------------------------------------------------------------------

export function drawPause() {
  ctx.fillStyle = 'rgba(8,8,18,0.78)';
  ctx.fillRect(0, 0, VW, VH);
  drawTextCentered(ctx, 'PAUSED', VW / 2, 60, 'white');

  let y = 92;
  drawTextCentered(ctx, `${G.form ? G.form.name.toUpperCase() : ''}  LV ${G.level}`, VW / 2, y, 'gold');
  y += 20;

  drawTextCentered(ctx, 'WEAPONS', VW / 2, y, 'dim');
  y += 12;
  for (const w of G.weapons) {
    drawTextCentered(ctx, `${w.def.name.toUpperCase()}  ${w.level}/${w.def.levels.length}`, VW / 2, y, 'white');
    y += 10;
  }

  if (G.passives.length) {
    y += 8;
    drawTextCentered(ctx, 'ITEMS', VW / 2, y, 'dim');
    y += 12;
    for (const id of G.passives) {
      drawTextCentered(ctx, id.replace(/_/g, ' ').toUpperCase(), VW / 2, y, 'white');
      y += 10;
    }
  }

  drawTextCentered(ctx, 'ESC RESUME    R RESTART    Q CHANGE PARTNER', VW / 2, VH - 24, 'dim');
}
