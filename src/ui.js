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
  drawText, drawTextCentered, textWidth, drawSprite, drawSpriteScaled, drawShadow, drawLogo,
} from './sprites.js';
import { clamp, hash2 } from './util.js';
import { getPortrait } from './assets.js';
import { CREDITS } from './data/credits.js';

/** Set by main.js once the atlas exists. */
export let ballSpr = -1;
export function setBallSprite(id) { ballSpr = id; }

export const ui = {
  cursor: 0,        // selected card index
  banishArm: false, // banish needs a second keypress, so it cannot be hit by accident
};

const CARD_W = 176;
const CARD_H = 132;
const CARD_Y = 96;
const GAP = 28;

const KIND_COLOR = {
  ability: '#e878d0',
  weapon: '#7ac8ff',
  passive: '#ffd166',
  stat: '#7fe08a',
  heal: '#ff9f9f',
};

const KIND_LABEL = {
  ability: 'ABILITY',
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

/**
 * A GBA-style dialogue box: an outer dark frame, a bright inner border inset by two pixels, and
 * clipped corners. Two rectangles more than a plain box, and it is most of what makes the UI read
 * as a Pokemon game rather than a generic roguelite.
 */
function panel(x, y, w, h, border, fill) {
  ctx.fillStyle = '#0d0d18';                    // outer frame
  ctx.fillRect(x, y, w, h);
  ctx.fillStyle = fill || '#161629';            // interior
  ctx.fillRect(x + 1, y + 1, w - 2, h - 2);

  ctx.fillStyle = border;                       // inner highlight border
  ctx.fillRect(x + 2, y + 2, w - 4, 1);
  ctx.fillRect(x + 2, y + h - 3, w - 4, 1);
  ctx.fillRect(x + 2, y + 2, 1, h - 4);
  ctx.fillRect(x + w - 3, y + 2, 1, h - 4);

  // Clipped corners -- the little detail that sells the border.
  ctx.fillStyle = '#0d0d18';
  for (const [cx2, cy2] of [[x + 2, y + 2], [x + w - 3, y + 2], [x + 2, y + h - 3], [x + w - 3, y + h - 3]]) {
    ctx.fillRect(cx2, cy2, 1, 1);
  }
}

/** Colour-coded type badge, drawn from the character's typeLabel. */
const TYPE_COLORS = {
  WATER: '#4a90d9', GROUND: '#b8a038', NORMAL: '#a8a878',
  GRASS: '#78c850', FLYING: '#a890f0', ELECTRIC: '#f8d030', DARK: '#705848',
};

function drawTypeBadges(label, cx, y) {
  const types = label.split('/').map((t) => t.trim()).filter(Boolean);
  const pad = 3;
  let total = 0;
  for (const t of types) total += textWidth(t) + pad * 2 + 3;
  let x = Math.round(cx - (total - 3) / 2);
  for (const t of types) {
    const w = textWidth(t) + pad * 2;
    ctx.fillStyle = TYPE_COLORS[t] || '#7a7a8a';
    ctx.fillRect(x, y, w, 9);
    ctx.fillStyle = 'rgba(0,0,0,0.25)';
    ctx.fillRect(x, y + 7, w, 2);
    drawText(ctx, t, x + pad, y + 1, 'dark');
    x += w + 3;
  }
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
    if (o.kind === 'ability') {
      drawText(ctx, o.slot === 0 ? 'KEY Q' : 'KEY E', x + CARD_W - 40, CARD_Y + 24, 'gold');
    }

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

  drawLogo(ctx, 'POKE SURVIVOR', VW / 2, 40, 3, 'gold', 'dark');
  drawTextCentered(ctx, 'SURVIVE TWENTY MINUTES', VW / 2, 74, 'white');

  // A pokeball either side of the subtitle.
  if (ballSpr >= 0) {
    drawSprite(ctx, ballSpr, VW / 2 - 96, 76);
    drawSprite(ctx, ballSpr, VW / 2 + 96, 76);
  }

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
  drawTextCentered(ctx, 'WASD MOVE   Q E ABILITIES   M MUTE   ESC PAUSE   F FULLSCREEN', VW / 2, VH - 16, 'dim');
  drawTextCentered(ctx, 'SPRITES BY THE PMD SPRITE COLLAB   -   C FOR CREDITS', VW / 2, VH - 28, 'blue');
}

// --- Credits ----------------------------------------------------------------

export function drawCredits() {
  ctx.fillStyle = '#12202a';
  ctx.fillRect(0, 0, VW, VH);
  drawTextCentered(ctx, 'CREDITS', VW / 2, 22, 'gold');

  panel(28, 38, VW - 56, VH - 76, '#7ac8ff', '#161629');

  let y = 50;
  for (const row of CREDITS) {
    if (row.heading) {
      y += 4;
      drawText(ctx, row.heading, 42, y, 'gold');
      y += 12;
    } else {
      drawText(ctx, row.line, 42, y, row.color || 'white');
      y += row.line ? 10 : 5;
    }
  }
  drawTextCentered(ctx, 'ESC BACK', VW / 2, VH - 22, 'dim');
}

// --- Character select -------------------------------------------------------

const SELECT_W = 176;
const SELECT_H = 252;
const SELECT_Y = 44;

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

    // The portrait, not the walking sprite -- a face reads far better on a selection card.
    const port = getPortrait(c.id);
    const px = x + SELECT_W / 2;
    if (port) {
      const k = 2;
      const pw = port.w * k, ph = port.h * k;
      // Framed, with the selected one lifted slightly.
      const py = SELECT_Y + 8 - (selected ? 1 : 0);
      ctx.fillStyle = '#0d0d18';
      ctx.fillRect(px - pw / 2 - 2, py - 2, pw + 4, ph + 4);
      ctx.fillStyle = selected ? c.color : '#2a2a40';
      ctx.fillRect(px - pw / 2 - 1, py - 1, pw + 2, ph + 2);
      ctx.drawImage(port.canvas, 0, 0, port.w, port.h, Math.round(px - pw / 2), py, pw, ph);
    } else {
      const frame = selected ? (((t * 6) | 0) & 1) : 0;
      const bob = selected ? Math.sin(t * 4) * 2 : 0;
      drawShadow(ctx, px, SELECT_Y + 46, 1.6);
      drawSpriteScaled(ctx, c.sprId + frame * 2 + 1, px, SELECT_Y + 44 + bob, 2);
    }

    drawTextCentered(ctx, c.name.toUpperCase(), x + SELECT_W / 2, SELECT_Y + 94, 'white');
    drawTypeBadges(c.typeLabel, x + SELECT_W / 2, SELECT_Y + 105);

    let y = SELECT_Y + 120;
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

// --- Evolution cutscene -----------------------------------------------------
//
// The classic Pokemon cadence: the creature flickers between its old and new silhouette in pure
// white, ACCELERATING, then a white flash reveals the new form. The white silhouettes are the
// hit-flash variants already baked into the atlas, so this costs no extra art.

export const EVO_FLICKER = 1.5;    // silhouette flicker
export const EVO_FLASH = 0.35;     // white screen wipe
export const EVO_REVEAL = 0.9;     // new form on screen with its banner
export const EVO_TOTAL = EVO_FLICKER + EVO_FLASH + EVO_REVEAL;

export function drawEvolution(evo) {
  const t = evo.t;
  const cx = VW / 2;
  const cy = VH / 2 + 6;

  ctx.fillStyle = '#0a0a14';
  ctx.fillRect(0, 0, VW, VH);

  // A slow starburst behind the creature, so the screen is never static.
  const spin = t * 0.6;
  ctx.globalAlpha = 0.12;
  ctx.fillStyle = '#7ac8ff';
  for (let i = 0; i < 12; i++) {
    const a = spin + (i / 12) * Math.PI * 2;
    ctx.beginPath();
    ctx.moveTo(cx, cy);
    ctx.lineTo(cx + Math.cos(a) * 300, cy + Math.sin(a) * 300);
    ctx.lineTo(cx + Math.cos(a + 0.12) * 300, cy + Math.sin(a + 0.12) * 300);
    ctx.closePath();
    ctx.fill();
  }
  ctx.globalAlpha = 1;

  if (t < EVO_FLICKER) {
    // Flicker interval shrinks from 0.34s to 0.05s across the phase.
    const k = t / EVO_FLICKER;
    const interval = 0.34 - k * 0.29;
    const showNew = Math.floor(t / interval) & 1;
    // The white silhouette is the pre-baked flash variant; its offset is nf*nd per form.
    const id = showNew ? evo.newBase + evo.newFlash : evo.oldBase + evo.oldFlash;
    drawSpriteScaled(ctx, id, cx, cy, 2);
    drawTextCentered(ctx, 'WHAT?', cx, 48, 'white');
  } else if (t < EVO_FLICKER + EVO_FLASH) {
    const k = (t - EVO_FLICKER) / EVO_FLASH;
    drawSpriteScaled(ctx, evo.newBase + evo.newFlash, cx, cy, 2 + k * 0.6);
    ctx.globalAlpha = Math.min(1, k * 1.6);
    ctx.fillStyle = '#ffffff';
    ctx.fillRect(0, 0, VW, VH);
    ctx.globalAlpha = 1;
  } else {
    const k = (t - EVO_FLICKER - EVO_FLASH) / EVO_REVEAL;
    // White wipe pulls back to reveal the real sprite.
    if (k < 0.35) {
      ctx.globalAlpha = 1 - k / 0.35;
      ctx.fillStyle = '#ffffff';
      ctx.fillRect(0, 0, VW, VH);
      ctx.globalAlpha = 1;
    }
    const pop = k < 0.2 ? 2.5 - k * 2.5 : 2;
    drawSpriteScaled(ctx, evo.newBase + evo.newFace, cx, cy, pop);

    ctx.globalAlpha = Math.max(0, 1 - k);
    ctx.strokeStyle = '#ffffff';
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.ellipse(cx, cy, 40 + k * 220, (40 + k * 220) * 0.6, 0, 0, Math.PI * 2);
    ctx.stroke();
    ctx.globalAlpha = 1;

    drawTextCentered(ctx, `${evo.oldName.toUpperCase()} EVOLVED`, cx, VH - 58, 'white');
    drawTextCentered(ctx, `INTO ${evo.newName.toUpperCase()}!`, cx, VH - 44, 'gold');
    if (evo.note) {
      for (const [i, line] of wrap(evo.note, 46).slice(0, 2).entries()) {
        drawTextCentered(ctx, line, cx, VH - 26 + i * 10, 'dim');
      }
    }
  }
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
