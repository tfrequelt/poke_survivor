// L4 -- may import L0-L3, read-only.
//
// In-canvas screens, drawn with the game's own pixel font.
//
// Deviation from the original plan, which called for DOM overlays: keeping the menus inside the
// 640x360 pixel grid means one visual language, no font mismatch against the sprites, and no
// second coordinate system to keep in sync with the integer canvas scale. The cost is manual
// layout, which at this size is a handful of constants.

import { G, MODES } from './state.js';
import { ctx, VW, VH, drawGround } from './render.js';
import {
  drawText, drawTextCentered, textWidth, drawSprite, drawSpriteScaled, drawShadow, drawLogo,
} from './sprites.js';
import { clamp, hash2, formatTime, formatNum } from './util.js';
import { getPortrait, getImage, getAnim } from './assets.js';
import { CREDITS } from './data/credits.js';
import { panel, wrap, WIN_SELECTED, messageWindow, slider } from './win.js';
import { BINDABLE, bindings, keyLabel } from './input.js';
import { settings as audioSettings } from './audio.js';
import { bankTotal, rankOf } from './save.js';
import { wheel, SEGMENTS } from './wheel.js';
import { SHOP_ITEMS, rankCost } from './data/shop.js';

/** Set by main.js once the atlas exists. */
export let ballSpr = -1;
export function setBallSprite(id) { ballSpr = id; }

export const ui = {
  cursor: 0,        // selected card index
  banishArm: false, // banish needs a second keypress, so it cannot be hit by accident
  scroll: 0,        // credits scroll offset, in lines
  // Settings screen. `page` is 'main' or 'controls'; `awaitKey` is the action being rebound,
  // which makes the next key-down a binding rather than a navigation.
  page: 'main',
  awaitKey: null,
  note: '',
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

/** Colour-coded type badge, drawn from the character's typeLabel. */
const TYPE_COLORS = {
  WATER: '#4a90d9', GROUND: '#b8a038', NORMAL: '#a8a878',
  GRASS: '#78c850', FLYING: '#a890f0', ELECTRIC: '#f8d030', DARK: '#705848',
  GHOST: '#705898', POISON: '#a040a0',
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

/**
 * Frame id offset for a menu sprite facing the camera.
 *
 * The atlas lays frames out as base + flash*(nf*nd) + frame*nd + dir. `nd` is 2 for drawn art and
 * 8 for a PMD sheet, so any menu that assumes 2 silently animates by TURNING instead of walking.
 * Everything that draws a character outside the world goes through here.
 */
/**
 * A small bobbing chevron over the selected card. The white border alone is easy to miss at
 * 640x360 when every card already has a bright border of its own.
 */
function drawCursorArrow(cx, y) {
  // Wall time, not run time: the level-up modal freezes the simulation, and a cursor that stops
  // bobbing the moment the modal opens looks like the game hung.
  const bob = Math.round(Math.abs(Math.sin(performance.now() * 0.003)) * 2);
  const x = Math.round(cx);
  for (let i = 0; i < 5; i++) {
    ctx.fillStyle = '#0d0d18';
    ctx.fillRect(x - (5 - i) - 1, y + bob + i, (5 - i) * 2 + 2, 1);
  }
  for (let i = 0; i < 5; i++) {
    ctx.fillStyle = i < 2 ? '#ffe9a0' : '#ffd166';
    ctx.fillRect(x - (5 - i), y + bob + i, (5 - i) * 2, 1);
  }
}

function walkFrame(c, phase) {
  const nd = c.sprDirs || 2;
  const nf = c.sprFrames || 2;
  const face = c.sprFace !== undefined ? c.sprFace : (nd === 8 ? 0 : 1);
  return (((phase | 0) % nf) + nf) % nf * nd + face;
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

    panel(x, CARD_Y, CARD_W, CARD_H, selected ? { accent: '#ffffff', ...WIN_SELECTED } : { accent: color });

    // Kind tag and pip row
    drawText(ctx, KIND_LABEL[o.kind] || '', x + 8, CARD_Y + 8, 'dim');
    drawPips(o, x + CARD_W - 8, CARD_Y + 8, color);

    drawText(ctx, o.name.toUpperCase(), x + 8, CARD_Y + 24, selected ? 'white' : 'white');
    if (o.isNew) drawText(ctx, 'NEW', x + 8 + textWidth(o.name) + 8, CARD_Y + 24, 'gold');
    if (o.kind === 'ability') {
      drawText(ctx, o.slot === 0 ? 'KEY Q' : 'KEY E', x + CARD_W - 40, CARD_Y + 24, 'gold');
    }

    const lines = wrap(o.desc, 26);
    for (let l = 0; l < lines.length && l < 5; l++) {
      drawText(ctx, lines[l], x + 8, CARD_Y + 44 + l * 10, 'dim');
    }

    drawTextCentered(ctx, `${i + 1}`, x + CARD_W / 2, CARD_Y + CARD_H - 16, selected ? 'gold' : 'dim');
    if (selected) drawCursorArrow(x + CARD_W / 2, CARD_Y - 11);
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

const HORIZON = 196;        // where the drawn grass starts, when there is no backdrop image

// The sea panel inside the ripped PMD intro-scene sheet: source rect, in pixels. It is a GBA
// screen, 256x192, and it is drawn at exactly 2x so the pixels stay square.
const SEA = { x: 282, y: 538, w: 256, h: 192 };
const SEA_FEET = 286;       // where the starters stand once the sea is the backdrop

/**
 * The sea backdrop, doubled and laid across the screen.
 *
 * 512 does not reach 640, so it takes two copies -- and the second is MIRRORED, which makes the
 * join between them exact instead of a visible cut through the clouds.
 */
function drawSeaBackdrop() {
  const img = getImage('backgrounds');
  if (!img) return false;
  const k = 2;
  const dw = SEA.w * k, dh = SEA.h * k;
  const dy = VH - dh;                    // bottom-anchored; the top of the sky is cropped
  ctx.drawImage(img.canvas, SEA.x, SEA.y, SEA.w, SEA.h, 0, dy, dw, dh);
  if (dw < VW) {
    ctx.save();
    ctx.translate(dw * 2, 0);
    ctx.scale(-1, 1);
    ctx.drawImage(img.canvas, SEA.x, SEA.y, SEA.w, SEA.h, 0, dy, dw, dh);
    ctx.restore();
  }
  return true;
}

/**
 * The title logo. A supplied `title` image replaces the drawn wordmark the moment one appears in
 * the manifest; until then the generated one stands in, so the screen is never blank.
 *
 * The image is scaled by a whole number only. A pixel logo resampled to a fraction turns to mush,
 * and this game is integer-scaled everywhere else for the same reason.
 */
function drawTitleLogo() {
  const img = getImage('title');
  if (!img) {
    drawLogo(ctx, 'POKEMON DRACULA EDITION', VW / 2, 34, 3, 'gold', 'dark');
    return 50;
  }
  const maxW = VW - 48, maxH = 58;
  const k = Math.max(1, Math.min(Math.floor(maxW / img.w), Math.floor(maxH / img.h)));
  const w = img.w * k, h = img.h * k;
  const y = Math.round(14 + (maxH - h) / 2);
  ctx.drawImage(img.canvas, 0, 0, img.w, img.h, Math.round((VW - w) / 2), y, w, h);
  return y + h;
}

/**
 * One frame of a starter's title animation, looped on wall-clock time. Returns false when there
 * is no sheet for it, so the caller can fall back to the walk cycle.
 *
 * Row 0 only: several of these ship as a single-row sheet, and the ones that do not are facing
 * down in row 0 anyway, which is the direction that should look at the player.
 */
function drawIdleAnim(c, x, footY, t) {
  const a = c.titleAnim ? getAnim(c.shape, c.titleAnim) : null;
  if (!a) return false;

  let ticks = (t % Math.max(0.2, a.total)) * 60;
  let f = 0;
  while (f < a.cols - 1 && ticks >= a.durs[f]) { ticks -= a.durs[f]; f++; }

  const i = f * 2;                       // row 0, so the anchor index is just the frame
  const k = 2;
  ctx.drawImage(
    a.canvas, f * a.w, 0, a.w, a.h,
    Math.round(x - a.anchors[i] * k), Math.round(footY - a.anchors[i + 1] * k), a.w * k, a.h * k,
  );
  return true;
}

export function drawTitle(starters, t) {
  const sea = drawSeaBackdrop();
  let feet = SEA_FEET;

  if (!sea) {
    // No backdrop image: sky, distant treeline, then grass. The starters' feet sit on the
    // horizon so they read as standing in the world rather than floating in front of it.
    feet = HORIZON;
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
  }

  // The subtitle sits under whatever the logo turned out to be: a supplied image can be much
  // taller than the drawn wordmark, and a fixed y would have the two overlap.
  const subY = Math.max(68, drawTitleLogo() + 8);
  drawTextCentered(ctx, 'SURVIVE TWENTY MINUTES', VW / 2, subY, 'white');

  // A pokeball either side of the subtitle.
  if (ballSpr >= 0) {
    drawSprite(ctx, ballSpr, VW / 2 - 96, subY + 2);
    drawSprite(ctx, ballSpr, VW / 2 + 96, subY + 2);
  }

  // The starters lined up along the shore, bobbing out of phase.
  const span = Math.min(78, (VW - 60) / Math.max(1, starters.length));
  for (let i = 0; i < starters.length; i++) {
    const c = starters[i];
    const x = VW / 2 + (i - (starters.length - 1) / 2) * span;
    const bob = Math.sin(t * 2.2 + i * 1.5) * 2;
    drawShadow(ctx, x, feet + 2, 1.7);
    // Each starter plays its own idle -- Wooper sleeps, Eevee flicks its tail. Offset so six of
    // them are not in lockstep, and falling back to the walk cycle if the sheet is missing.
    if (!drawIdleAnim(c, x, feet + bob, t + i * 1.7)) {
      drawSpriteScaled(ctx, c.sprId + walkFrame(c, t * 5 + i), x, feet + bob, 2);
    }
  }

  // Visible most of the time rather than a hard 50/50 blink, which reads as broken. In a window,
  // because white text on bright water is barely legible on its own.
  if ((t * 1.4) % 1 < 0.72) {
    const label = 'PRESS ANY KEY';
    const w = textWidth(label) + 26;
    panel(Math.round((VW - w) / 2), 292, w, 22, { accent: '#ffd166' });
    drawTextCentered(ctx, label, VW / 2, 299, 'white');
  }

  // The two footer lines get a band behind them for the same reason.
  ctx.fillStyle = 'rgba(6,10,26,0.62)';
  ctx.fillRect(0, VH - 32, VW, 32);
  // The artists ask to be credited wherever their sprites are used, so the attribution stays on
  // the front page and not only on the credits screen.
  drawTextCentered(ctx, 'SPRITES AND PORTRAITS BY THE PMD SPRITE COLLAB', VW / 2, VH - 28, 'blue');
  drawTextCentered(ctx, 'S SHOP    C CREDITS    O SETTINGS    M MUTE    F FULLSCREEN',
    VW / 2, VH - 16, 'dim');
}

// --- Credits ----------------------------------------------------------------

const CREDIT_ROWS = 27;     // lines that fit inside the window

/** How far the credits can scroll. Exported so the key handler can clamp without re-measuring. */
export const creditsMax = () => Math.max(0, CREDITS.length - CREDIT_ROWS);

export function drawCredits() {
  ctx.fillStyle = '#12202a';
  ctx.fillRect(0, 0, VW, VH);
  drawTextCentered(ctx, 'CREDITS', VW / 2, 18, 'gold');

  panel(20, 32, VW - 40, VH - 66, { accent: '#7ac8ff' });

  const max = creditsMax();
  const from = clamp(ui.scroll, 0, max);
  let y = 40;
  for (let i = from; i < Math.min(CREDITS.length, from + CREDIT_ROWS); i++) {
    const row = CREDITS[i];
    if (row.heading) drawText(ctx, row.heading, 32, y, 'gold');
    else drawText(ctx, row.line, 32, y, row.color || 'white');
    y += 10;
  }

  // A scrollbar, so it is obvious there is more below rather than the list just stopping.
  if (max > 0) {
    const trackY = 36, trackH = VH - 74;
    ctx.fillStyle = '#1b2b4a';
    ctx.fillRect(VW - 27, trackY, 3, trackH);
    const knob = Math.max(12, (trackH * CREDIT_ROWS) / CREDITS.length);
    ctx.fillStyle = '#7ac8ff';
    ctx.fillRect(VW - 27, Math.round(trackY + (trackH - knob) * (from / max)), 3, Math.round(knob));
  }

  drawTextCentered(ctx, max > 0 ? 'UP / DOWN SCROLL      ESC BACK' : 'ESC BACK', VW / 2, VH - 24, 'dim');
}

// --- Character select -------------------------------------------------------

const SELECT_W = 176;
// Six starters make each card narrow, which makes the blurb and trait wrap to far more lines
// than three wide cards did. The card grew to match; the text below is then fitted to whatever
// room is actually left rather than to a fixed line count.
const SELECT_H = 284;
const SELECT_Y = 40;

// Shared maxima so the three bars are comparable rather than each self-normalised.
const STAT_ROWS = [
  { key: 'maxHp', label: 'HP', max: 160 },
  { key: 'moveSpeed', label: 'SPD', max: 80 },
  { key: 'power', label: 'PWR', max: 1.3 },
  { key: 'armor', label: 'DEF', max: 4 },
];

/**
 * The cards shrink to fit however many starters there are: four 176px cards do not go into 640.
 * Everything inside a card is derived from the width it ends up with rather than a constant, so
 * adding a fifth starter later is a data change and not a layout rewrite.
 */
function cardLayout(n, maxW, gap) {
  const g = n > 3 ? Math.min(gap, 12) : gap;
  const w = Math.min(maxW, Math.floor((VW - 20 - g * (n - 1)) / n));
  return { w, gap: g, startX: Math.round((VW - (n * w + (n - 1) * g)) / 2) };
}

export function drawSelect(starters, t) {
  ctx.fillStyle = '#12202a';
  ctx.fillRect(0, 0, VW, VH);

  drawTextCentered(ctx, 'CHOOSE YOUR PARTNER', VW / 2, 26, 'gold');

  const L = cardLayout(starters.length, SELECT_W, GAP);
  const chars = Math.floor((L.w - 20) / 6);       // the font is 5px plus 1px of spacing

  for (let i = 0; i < starters.length; i++) {
    const c = starters[i];
    const x = L.startX + i * (L.w + L.gap);
    const selected = i === ui.cursor;
    panel(x, SELECT_Y, L.w, SELECT_H, selected ? { accent: '#ffffff', ...WIN_SELECTED } : { accent: c.color });

    // The portrait, not the walking sprite -- a face reads far better on a selection card.
    const port = getPortrait(c.id);
    const px = x + L.w / 2;
    if (port) {
      // Scale to fill the card width, capped at 2x so a large portrait cannot overflow.
      const k = Math.max(1, Math.min(2, Math.floor((L.w - 24) / port.w)));
      const pw = port.w * k, ph = port.h * k;
      const py = SELECT_Y + 8 - (selected ? 1 : 0);
      ctx.fillStyle = '#0d0d18';
      ctx.fillRect(px - pw / 2 - 2, py - 2, pw + 4, ph + 4);
      ctx.fillStyle = selected ? c.color : '#2a2a40';
      ctx.fillRect(px - pw / 2 - 1, py - 1, pw + 2, ph + 2);
      ctx.drawImage(port.canvas, 0, 0, port.w, port.h, Math.round(px - pw / 2), py, pw, ph);
    } else {
      const bob = selected ? Math.sin(t * 4) * 2 : 0;
      drawShadow(ctx, px, SELECT_Y + 46, 1.6);
      drawSpriteScaled(ctx, c.sprId + walkFrame(c, selected ? t * 6 : 0), px, SELECT_Y + 44 + bob, 2);
    }

    drawTextCentered(ctx, c.name.toUpperCase(), px, SELECT_Y + 94, 'white');
    drawTypeBadges(c.typeLabel, px, SELECT_Y + 105);

    let y = SELECT_Y + 120;
    for (const row of STAT_ROWS) {
      const v = c.stats[row.key] || 0;
      drawText(ctx, row.label, x + 8, y, 'dim');
      const bx = x + 32, bw = L.w - 40;
      ctx.fillStyle = '#2a2a40';
      ctx.fillRect(bx, y + 1, bw, 4);
      ctx.fillStyle = c.color;
      ctx.fillRect(bx, y + 1, Math.round(bw * clamp(v / row.max, 0, 1)), 4);
      y += 10;
    }

    y += 4;
    // Split the remaining rows between the two blocks: the blurb gets what it needs up to four
    // lines, and the trait takes the rest, so neither is cut off mid-sentence at any card width.
    const rows = Math.max(0, Math.floor((SELECT_Y + SELECT_H - 16 - y) / 9));
    const blurb = wrap(c.blurb, chars);
    const trait = wrap(c.trait, chars);
    const nBlurb = Math.min(blurb.length, 4, rows);
    for (const line of blurb.slice(0, nBlurb)) {
      drawText(ctx, line, x + 8, y, 'white');
      y += 9;
    }
    y += 3;
    for (const line of trait.slice(0, Math.max(0, rows - nBlurb - 1))) {
      drawText(ctx, line, x + 8, y, 'dim');
      y += 9;
    }

    drawTextCentered(ctx, `${i + 1}`, px, SELECT_Y + SELECT_H - 13, selected ? 'gold' : 'dim');
    if (selected) drawCursorArrow(px, SELECT_Y - 11);
  }

  drawTextCentered(ctx, `1-${starters.length} / ARROWS + ENTER      ESC BACK`, VW / 2, VH - 18, 'dim');
}

// --- Stage select -----------------------------------------------------------

const STAGE_W = 176;
const STAGE_H = 232;
const STAGE_Y = 56;

// Shared maxima, so the three difficulty bars compare across cards instead of self-normalising.
const STAGE_ROWS = [
  { key: 'hpMult', label: 'HP', max: 1.4 },
  { key: 'spsMult', label: 'RATE', max: 1.4 },
  { key: 'coinMult', label: 'GOLD', max: 1.4 },
];

export function drawStageSelect(stages, partner, t) {
  ctx.fillStyle = '#12202a';
  ctx.fillRect(0, 0, VW, VH);

  drawTextCentered(ctx, 'CHOOSE YOUR STAGE', VW / 2, 20, 'gold');
  if (partner) {
    drawTextCentered(ctx, `WITH ${partner.name.toUpperCase()}`, VW / 2, 34, 'dim');
  }

  const L = cardLayout(stages.length, STAGE_W, GAP);

  for (let i = 0; i < stages.length; i++) {
    const st = stages[i];
    const x = L.startX + i * (L.w + L.gap);
    const selected = i === ui.cursor;
    const color = st.color || '#7ac8ff';
    panel(x, STAGE_Y, L.w, STAGE_H, selected ? { accent: '#ffffff', ...WIN_SELECTED } : { accent: color });

    // The preview is the real ground renderer in a small window, so it can never drift from what
    // the stage actually looks like. It pans slowly, and only the selected card pans fast enough
    // to notice, which keeps the eye where the cursor is.
    const pvX = x + 8, pvY = STAGE_Y + 8, pvW = L.w - 16, pvH = 76;
    ctx.fillStyle = '#0d0d18';
    ctx.fillRect(pvX - 1, pvY - 1, pvW + 2, pvH + 2);
    drawGround(st, pvX, pvY, pvW, pvH, 1200 + i * 977 + t * (selected ? 14 : 4), 800 + i * 613);

    // A partner sprite standing in the preview sells it as a place you will play.
    if (partner && partner.sprId !== undefined) {
      const bob = Math.sin(t * 3 + i) * 1.5;
      drawShadow(ctx, pvX + pvW / 2, pvY + pvH - 12, 1.2);
      drawSprite(ctx, partner.sprId + walkFrame(partner, t * 5), pvX + pvW / 2, pvY + pvH - 14 + bob);
    }

    drawTextCentered(ctx, st.name.toUpperCase(), x + L.w / 2, STAGE_Y + 92, 'white');

    let y = STAGE_Y + 108;
    for (const row of STAGE_ROWS) {
      const v = st[row.key] || 1;
      drawText(ctx, row.label, x + 10, y, 'dim');
      const bx = x + 44, bw = L.w - 54;
      ctx.fillStyle = '#2a2a40';
      ctx.fillRect(bx, y + 1, bw, 4);
      ctx.fillStyle = color;
      ctx.fillRect(bx, y + 1, Math.round(bw * clamp(v / row.max, 0, 1)), 4);
      y += 10;
    }

    y += 6;
    for (const line of wrap(st.blurb || '', Math.floor((L.w - 20) / 6)).slice(0, 3)) {
      drawText(ctx, line, x + 10, y, 'dim');
      y += 9;
    }

    drawTextCentered(ctx, `${i + 1}`, x + L.w / 2, STAGE_Y + STAGE_H - 13, selected ? 'gold' : 'dim');
    if (selected) drawCursorArrow(x + L.w / 2, STAGE_Y - 11);
  }

  drawTextCentered(ctx, `1-${stages.length} / ARROWS + ENTER      ESC BACK`, VW / 2, VH - 18, 'dim');
}

// --- Settings ---------------------------------------------------------------

/**
 * The rows of the settings screen, as data, so the key handler and the renderer cannot disagree
 * about what is on it or how many there are.
 *
 * `inRun` rows only exist when a run is in progress -- returning to the menu or restarting means
 * nothing from the title screen.
 */
export function settingsRows(inRun) {
  if (ui.page === 'controls') {
    return [
      ...BINDABLE.map((b) => ({ kind: 'bind', id: b.id, label: b.label })),
      { kind: 'action', id: 'resetKeys', label: 'RESET TO DEFAULTS' },
      { kind: 'action', id: 'back', label: 'BACK' },
    ];
  }
  const rows = [
    { kind: 'slider', id: 'music', label: 'MUSIC' },
    { kind: 'slider', id: 'sfx', label: 'SOUND' },
    { kind: 'action', id: 'controls', label: 'CONTROLS' },
  ];
  if (inRun) {
    rows.push({ kind: 'action', id: 'menu', label: 'BACK TO MENU' });
    rows.push({ kind: 'action', id: 'restart', label: 'RESTART RUN' });
  }
  rows.push({ kind: 'action', id: 'close', label: 'CLOSE' });
  return rows;
}

const SETTINGS_ROW_H = 14;

export function drawSettings(inRun) {
  // Over the world when paused, on a flat field from the title, so the screen behind never
  // shows through at full brightness either way.
  ctx.fillStyle = inRun ? 'rgba(8,8,18,0.82)' : '#12202a';
  ctx.fillRect(0, 0, VW, VH);

  const rows = settingsRows(inRun);
  const w = 300;
  const h = Math.min(VH - 46, rows.length * SETTINGS_ROW_H + 34);
  const x = Math.round((VW - w) / 2);
  const y = Math.round((VH - h) / 2) - 6;

  panel(x, y, w, h, { accent: '#ffffff' });
  drawTextCentered(ctx, ui.page === 'controls' ? 'CONTROLS' : 'SETTINGS', VW / 2, y + 8, 'gold');

  // Scroll the list if it is taller than the window, so the controls page always fits.
  const visible = Math.floor((h - 34) / SETTINGS_ROW_H);
  const first = Math.max(0, Math.min(ui.cursor - (visible >> 1), rows.length - visible));
  let ry = y + 24;

  for (let i = first; i < Math.min(rows.length, first + visible); i++) {
    const row = rows[i];
    const on = i === ui.cursor;
    if (on) {
      // Bright enough to beat the window's own top-gradient band, which is otherwise easy to
      // mistake for the selection.
      ctx.fillStyle = '#3f6ae0';
      ctx.fillRect(x + 5, ry - 2, w - 10, SETTINGS_ROW_H - 2);
      ctx.fillStyle = '#ffd166';
      ctx.fillRect(x + 5, ry - 2, 2, SETTINGS_ROW_H - 2);
    }
    drawText(ctx, row.label, x + 14, ry, on ? 'white' : 'dim');

    if (row.kind === 'slider') {
      const v = audioSettings[row.id];
      slider(x + w - 122, ry, 84, v, { accent: on ? '#ffd166' : '#7ac8ff' });
      const pct = `${Math.round(v * 100)}%`;
      drawText(ctx, pct, x + w - 32, ry, on ? 'white' : 'dim');
    } else if (row.kind === 'bind') {
      const waiting = ui.awaitKey === row.id;
      const label = waiting ? 'PRESS A KEY' : keyLabel(bindings[row.id]);
      drawText(ctx, label, x + w - 14 - textWidth(label), ry, waiting ? 'gold' : on ? 'white' : 'blue');
    }
    ry += SETTINGS_ROW_H;
  }

  if (ui.note) drawTextCentered(ctx, ui.note, VW / 2, y + h - 12, 'gold');
  drawTextCentered(ctx,
    ui.awaitKey ? 'PRESS THE NEW KEY      ESC CANCEL' : 'ARROWS + ENTER      ESC BACK',
    VW / 2, VH - 18, 'dim');
}

// --- Run summary ------------------------------------------------------------

/**
 * Shown once, after the 20:00 boss goes down. Death keeps its lighter overlay in hud.js, which
 * leaves the world visible behind it; a win has earned a screen of its own.
 */
export function drawSummary() {
  ctx.fillStyle = '#101c34';
  ctx.fillRect(0, 0, VW, VH);

  // A few stars, seeded so they are in the same place every time rather than crawling.
  for (let i = 0; i < 70; i++) {
    const x = (hash2(i, 7) * VW) | 0;
    const y = (hash2(i, 13) * (VH - 60)) | 0;
    ctx.fillStyle = hash2(i, 21) > 0.7 ? '#ffd166' : '#2c4a7c';
    ctx.fillRect(x, y, 1, 1);
  }

  drawLogo(ctx, 'VICTORY', VW / 2, 40, 3, 'gold', 'dark');

  const w = 300, x = Math.round((VW - w) / 2);
  messageWindow(x, 104, w, [
    `${G.character ? G.character.name.toUpperCase() : ''} CLEARED ${G.stage ? G.stage.name.toUpperCase() : ''}`,
    '',
    `TIME      ${formatTime(G.runTime)}`,
    `LEVEL     ${G.level}`,
    `DEFEATED  ${formatNum(G.kills)}`,
    '',
    `GOLD EARNED   +${formatNum(G.coins)}`,
    `BANK          ${formatNum(bankTotal())}`,
  ], { accent: '#ffd166', lineHeight: 11 });

  drawTextCentered(ctx, 'SPEND IT AT THE KECLEON SHOP', VW / 2, VH - 42, 'blue');
  drawTextCentered(ctx, 'PRESS ANY KEY', VW / 2, VH - 26, 'dim');
}

// --- Kecleon Shop -----------------------------------------------------------

// Tuned so every row and group heading fits one page: 17 items + 4 headings + 2 actions = 23
// lines, and 23 * 12 clears the panel's inner height. The scroll below still works if the
// stock grows, but the list is meant to be read at a glance.
const SHOP_ROW_H = 12;

/**
 * The selectable rows, as data, for the same reason settingsRows exists: the key handler and the
 * renderer must not be able to disagree about what is on the screen or how many things there are.
 * Group headings are NOT rows -- they are drawn between them and cannot be landed on.
 */
export function shopRows() {
  const rows = SHOP_ITEMS.map((item) => ({ kind: 'item', item, group: item.group }));
  rows.push({ kind: 'reset', group: '', label: 'RESET PROGRESS' });
  rows.push({ kind: 'close', group: '', label: 'LEAVE' });
  return rows;
}

/** Rank pips, so an owned rank reads at a glance without a number to parse. */
function drawRanks(x, y, owned, max, color) {
  for (let i = 0; i < max; i++) {
    ctx.fillStyle = i < owned ? color : '#24386e';
    ctx.fillRect(x + i * 5, y + 1, 3, 5);
  }
}

export function drawShop() {
  ctx.fillStyle = '#17142a';
  ctx.fillRect(0, 0, VW, VH);
  drawTextCentered(ctx, 'KECLEON SHOP', VW / 2, 12, 'gold');

  const gold = bankTotal();
  const bank = `${formatNum(gold)} G`;
  drawText(ctx, bank, VW - 30 - textWidth(bank), 12, 'gold');

  const px = 28, py = 26, pw = VW - 56, ph = VH - 62;
  panel(px, py, pw, ph, { accent: '#7ac8ff' });

  // Lay the list out as display lines -- headings included -- then scroll over those, so a
  // heading can never end up orphaned at the bottom or hide the row the cursor is on.
  const rows = shopRows();
  const lines = [];
  let group = null;
  for (let i = 0; i < rows.length; i++) {
    if (rows[i].group && rows[i].group !== group) {
      group = rows[i].group;
      lines.push({ heading: group });
    }
    lines.push({ row: rows[i], index: i });
  }

  const visible = Math.floor((ph - 14) / SHOP_ROW_H);
  const at = lines.findIndex((l) => l.index === Math.min(ui.cursor, rows.length - 1));
  const first = clamp(at - (visible >> 1), 0, Math.max(0, lines.length - visible));

  const innerX = px + 8;
  const innerW = pw - 16;
  let y = py + 8;

  for (let i = first; i < Math.min(lines.length, first + visible); i++) {
    const line = lines[i];
    if (line.heading) {
      drawText(ctx, line.heading, innerX, y, 'blue');
      y += SHOP_ROW_H;
      continue;
    }

    const row = line.row;
    const on = line.index === ui.cursor;
    if (on) {
      ctx.fillStyle = '#27469f';
      ctx.fillRect(innerX - 3, y - 2, innerW + 6, SHOP_ROW_H - 1);
    }

    if (row.kind !== 'item') {
      drawText(ctx, row.label, innerX + 6, y, on ? 'white' : 'dim');
      y += SHOP_ROW_H;
      continue;
    }

    const owned = rankOf(row.item.id);
    const cost = rankCost(row.item, owned);
    const maxed = cost < 0;
    const afford = !maxed && cost <= gold;

    drawText(ctx, row.item.name, innerX + 6, y, on ? 'white' : maxed ? 'gold' : 'dim');
    drawRanks(innerX + 96, y, owned, row.item.ranks, maxed ? '#ffd166' : '#7ac8ff');

    // The description only on the selected row: seventeen of them at once is noise.
    if (on) drawText(ctx, row.item.desc.toUpperCase(), innerX + 132, y, 'blue');

    const price = maxed ? 'MAX' : `${cost} G`;
    drawText(ctx, price, innerX + innerW - 6 - textWidth(price),
      y, maxed ? 'gold' : afford ? 'white' : 'red');
    y += SHOP_ROW_H;
  }

  if (ui.note) drawTextCentered(ctx, ui.note, VW / 2, VH - 32, 'gold');
  drawTextCentered(ctx, 'ARROWS + ENTER BUY      ESC BACK', VW / 2, VH - 18, 'dim');
}

// --- Delibird's present wheel -----------------------------------------------

const WHEEL_R = 78;

/**
 * The wheel itself: alternating red and white wedges, one per prize, with a fixed arrow at the
 * top pointing at whichever one is under it.
 *
 * Drawn rather than bitmapped, but the moment a `wheel` image is in the manifest that image is
 * rotated and blitted in place of the wedges instead -- the arrow, the labels and the result
 * window stay drawn either way, so dropping a found PNG in needs no code.
 */
function drawWheelFace(cx, cy, angle) {
  const n = SEGMENTS.length;
  const slice = (Math.PI * 2) / n;
  const img = getImage('wheel');

  if (img) {
    ctx.save();
    ctx.translate(cx, cy);
    ctx.rotate(angle);
    const d = WHEEL_R * 2;
    ctx.drawImage(img.canvas, 0, 0, img.w, img.h, -WHEEL_R, -WHEEL_R, d, d);
    ctx.restore();
  } else {
    for (let i = 0; i < n; i++) {
      const a0 = angle + i * slice;
      ctx.beginPath();
      ctx.moveTo(cx, cy);
      ctx.arc(cx, cy, WHEEL_R, a0, a0 + slice);
      ctx.closePath();
      ctx.fillStyle = i % 2 ? '#f4f4ff' : '#d8253c';
      ctx.fill();
    }
    // An odd wedge count would leave two of the same colour adjacent; tint the seam so the
    // boundary is still readable if SEGMENTS ever grows to an odd number.
    ctx.strokeStyle = '#3a2028';
    ctx.lineWidth = 1;
    for (let i = 0; i < n; i++) {
      const a0 = angle + i * slice;
      ctx.beginPath();
      ctx.moveTo(cx, cy);
      ctx.lineTo(cx + Math.cos(a0) * WHEEL_R, cy + Math.sin(a0) * WHEEL_R);
      ctx.stroke();
    }
  }

  // Hub and rim.
  ctx.strokeStyle = '#3a2028';
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.arc(cx, cy, WHEEL_R, 0, Math.PI * 2);
  ctx.stroke();
  ctx.fillStyle = '#ffd166';
  ctx.beginPath();
  ctx.arc(cx, cy, 7, 0, Math.PI * 2);
  ctx.fill();
  ctx.strokeStyle = '#3a2028';
  ctx.stroke();

  // Labels, laid along each wedge and upright rather than rotated -- rotated text in a 5px font
  // is unreadable.
  //
  // Skipped entirely for a supplied wheel image: that image is expected to carry its own
  // artwork for each slice, and its colours are unknown, so painting this palette's text over
  // it would be both redundant and unreadable.
  for (let i = 0; i < n && !img; i++) {
    const a = angle + i * slice + slice / 2;
    const lx = cx + Math.cos(a) * (WHEEL_R * 0.62);
    const ly = cy + Math.sin(a) * (WHEEL_R * 0.62) - 3;
    drawTextCentered(ctx, SEGMENTS[i].label, lx, ly, i % 2 ? 'dark' : 'white');
  }

  // The pointer, fixed at the top.
  ctx.fillStyle = '#ffd166';
  ctx.beginPath();
  ctx.moveTo(cx, cy - WHEEL_R + 11);
  ctx.lineTo(cx - 7, cy - WHEEL_R - 6);
  ctx.lineTo(cx + 7, cy - WHEEL_R - 6);
  ctx.closePath();
  ctx.fill();
  ctx.strokeStyle = '#3a2028';
  ctx.lineWidth = 1;
  ctx.stroke();
}

export function drawWheel() {
  ctx.fillStyle = 'rgba(8,8,18,0.86)';
  ctx.fillRect(0, 0, VW, VH);

  const cx = Math.round(VW / 2);
  const cy = 128;
  drawTextCentered(ctx, 'A PRESENT!', cx, 18, 'gold');
  drawWheelFace(cx, cy, wheel.angle);

  if (wheel.phase === 'swap') {
    // Which move to trade in. "Keep everything" is a real option and sits with the others.
    const n = wheel.choices.length;
    const L = cardLayout(n, 108, 10);
    const y = 232;
    for (let i = 0; i < n; i++) {
      const c = wheel.choices[i];
      const x = L.startX + i * (L.w + L.gap);
      const on = i === wheel.cursor;
      panel(x, y, L.w, 46, on ? { accent: '#ffffff', ...WIN_SELECTED } : { accent: '#7ac8ff' });
      drawTextCentered(ctx, c.label.toUpperCase(), x + L.w / 2, y + 10, on ? 'white' : 'dim');
      if (c.kind === 'swap') {
        drawTextCentered(ctx, `LV ${c.weapon.level}`, x + L.w / 2, y + 22, 'dim');
        drawTextCentered(ctx, 'REPLACE', x + L.w / 2, y + 32, on ? 'gold' : 'dim');
      } else {
        drawTextCentered(ctx, 'LEVEL A MOVE', x + L.w / 2, y + 27, on ? 'gold' : 'dim');
      }
      if (on) drawCursorArrow(x + L.w / 2, y - 11);
    }
    const inc = wheel.incoming;
    if (inc) {
      messageWindow(Math.round((VW - 300) / 2), 196, 300,
        [`OFFERED: ${inc.name.toUpperCase()} -- ${inc.type.toUpperCase()}`],
        { center: true, accent: '#ffd166' });
    }
    drawTextCentered(ctx, 'ARROWS + ENTER', VW / 2, VH - 16, 'dim');
    return;
  }

  const seg = SEGMENTS[wheel.index];
  if (wheel.phase === 'spin') {
    drawTextCentered(ctx, 'SPINNING...', VW / 2, 232, 'dim');
  } else {
    messageWindow(Math.round((VW - 300) / 2), 224, 300,
      [seg.label, wheel.note || seg.sub], { center: true, accent: '#ffd166', lineHeight: 11 });
    drawTextCentered(ctx, 'PRESS ANY KEY', VW / 2, VH - 16, 'dim');
  }
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

  // The cutscene holds here until the player is ready. At the top, because the bottom third is
  // already carrying the two name lines and the form's note.
  if (evo.done && (evo.t * 1.6) % 1 < 0.72) {
    drawTextCentered(ctx, 'PRESS ENTER TO CONTINUE', cx, 24, 'white');
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
    panel(x, CARD_Y, CARD_W, CARD_H, selected ? { accent: '#ffffff', ...WIN_SELECTED } : { accent: '#7ac8ff' });

    if (b.sprId !== undefined) drawSprite(ctx, b.sprId, x + CARD_W / 2, CARD_Y + 34);
    drawTextCentered(ctx, b.name.toUpperCase(), x + CARD_W / 2, CARD_Y + 44, 'white');

    const lines = wrap(b.note || '', 26);
    for (let l = 0; l < lines.length && l < 4; l++) {
      drawText(ctx, lines[l], x + 8, CARD_Y + 62 + l * 10, 'dim');
    }
    drawTextCentered(ctx, `${i + 1}`, x + CARD_W / 2, CARD_Y + CARD_H - 16, selected ? 'gold' : 'dim');
    if (selected) drawCursorArrow(x + CARD_W / 2, CARD_Y - 11);
  }

  drawTextCentered(ctx, `1-${branches.length} / ARROWS + ENTER`, VW / 2, VH - 26, 'dim');
}

// --- Pause ------------------------------------------------------------------

export function drawPause() {
  ctx.fillStyle = 'rgba(8,8,18,0.78)';
  ctx.fillRect(0, 0, VW, VH);

  // The whole summary in one Mystery Dungeon window, sized to its contents. Types are listed
  // because they are now what decides which weapons the rest of the run can even offer.
  const lines = [`${G.form ? G.form.name.toUpperCase() : ''}   LV ${G.level}`];
  if (G.form && G.form.types && G.form.types.length) {
    lines.push(G.form.types.map((t) => t.toUpperCase()).join(' / '));
  }
  lines.push('');
  lines.push('- WEAPONS -');
  for (const w of G.weapons) {
    lines.push(`${w.def.name.toUpperCase()}  ${w.level}/${w.def.levels.length}`);
  }
  if (G.passives.length) {
    lines.push('');
    lines.push('- ITEMS -');
    for (const id of G.passives) lines.push(id.replace(/_/g, ' ').toUpperCase());
  }

  let widest = 0;
  for (const line of lines) widest = Math.max(widest, textWidth(line));
  const w = Math.max(180, Math.min(VW - 40, widest + 40));
  const h = Math.max(60, lines.length * 10 + 30);
  const x = Math.round((VW - w) / 2);
  const y = Math.max(18, Math.round((VH - h) / 2) - 8);

  panel(x, y, w, h, { accent: '#ffffff' });
  drawTextCentered(ctx, 'PAUSED', VW / 2, y + 8, 'gold');
  let ty = y + 22;
  for (const line of lines) {
    const heading = line.startsWith('-');
    drawTextCentered(ctx, heading ? line.slice(2, -2) : line, VW / 2, ty, heading ? 'dim' : 'white');
    ty += 10;
  }

  drawTextCentered(ctx, 'ESC RESUME    O SETTINGS    R RESTART    Q CHANGE PARTNER', VW / 2, VH - 20, 'dim');
}
