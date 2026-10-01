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
import { getPortrait, getImage, getAnim, dungeonFont } from './assets.js';
import { CREDITS } from './data/credits.js';
import { panel, wrap, WIN_SELECTED, messageWindow, slider , drawDamagePanel, shortNum} from './win.js';
import { BINDABLE, bindings, keyLabel } from './input.js';
import { settings as audioSettings } from './audio.js';
import { bankTotal, rankOf } from './save.js';
import { wheel, SEGMENTS } from './wheel.js';
import { SHOP_ITEMS, rankCost } from './data/shop.js';
import { floorLabel, floorBonus, floorOrdinal, endlessBonus } from './floors.js';
import { damageBreakdown, damageFor } from './combat.js';
import { WEAPON_BY_ID } from './data/weapons.js';
import { SUCCESSES, rewardLabel } from './data/successes.js';
import { successState, unlockedCount, unlockedThisRun } from './successes.js';

/**
 * The main menu's entries. Shared with the key handler in main.js, so the two can never disagree
 * about what is on the screen or how many entries there are.
 */
export const TITLE_MENU = [
  { id: 'play', label: 'PLAY' },
  { id: 'successes', label: 'SUCCESSES' },
  { id: 'shop', label: 'KECLEON SHOP' },
  { id: 'options', label: 'OPTIONS' },
  { id: 'credits', label: 'CREDITS' },
];

/** Breakdown key -> weapon type, for bar colours. */
export const weaponTypeOf = (key) => {
  if (!key.startsWith('w:')) return null;
  const w = WEAPON_BY_ID[key.slice(2)];
  return w ? w.type : null;
};

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
  // Gold, and the only card with no pip track: mastery has no cap to draw.
  mastery: '#ffd166',
};

const KIND_LABEL = {
  ability: 'ABILITY',
  weapon: 'WEAPON',
  passive: 'ITEM',
  stat: 'BOOST',
  heal: 'RECOVER',
  mastery: 'MASTERY',
};

/** Colour-coded type badge, drawn from the character's typeLabel. */
const TYPE_COLORS = {
  WATER: '#4a90d9', GROUND: '#b8a038', NORMAL: '#a8a878',
  GRASS: '#78c850', FLYING: '#a890f0', ELECTRIC: '#f8d030', DARK: '#705848',
  GHOST: '#705898', POISON: '#a040a0',
  // No starter is either of these, so the table only needed nine until the weapons started
  // wearing the same badges -- and the weapon roster covers all eleven types.
  FIRE: '#f08030', ICE: '#98d8d8',
  // Not a type: the badge on Substitute, which every Pokemon may draft.
  ANY: '#d8d8e8',
};

// The badge is a 9px pill: a flat colour with a darker band along the bottom so it reads as a
// raised tag rather than a coloured rectangle. Shared by the partner select and the level-up
// cards, which is the point -- a Grass weapon and a Grass starter must look the same.
const BADGE_H = 9, BADGE_PAD = 3, BADGE_GAP = 3;

/** One badge, left-aligned at x. Returns its width so a caller can lay out a row of them. */
function drawBadge(text, x, y, color) {
  const w = textWidth(text) + BADGE_PAD * 2;
  ctx.fillStyle = color;
  ctx.fillRect(x, y, w, BADGE_H);
  ctx.fillStyle = 'rgba(0,0,0,0.25)';
  ctx.fillRect(x, y + BADGE_H - 2, w, 2);
  drawText(ctx, text, x + BADGE_PAD, y + 1, 'dark');
  return w;
}

/**
 * A row of badges, CENTRED on cx.
 *
 * Both the partner select and the level-up cards go through here, which is the whole reason it
 * exists: a Grass weapon and a Grass starter have to be the same badge in the same place, and
 * two separate copies of this layout would not stay that way.
 */
function drawBadgeRow(badges, cx, y) {
  if (!badges.length) return;
  let total = -BADGE_GAP;
  for (const b of badges) total += textWidth(b.text) + BADGE_PAD * 2 + BADGE_GAP;
  let x = Math.round(cx - total / 2);
  for (const b of badges) x += drawBadge(b.text, x, y, b.color) + BADGE_GAP;
}

/** A type badge descriptor. `type` may be lower case -- weapon defs store it that way. */
function typeBadge(type) {
  const t = String(type).toUpperCase();
  return { text: t, color: TYPE_COLORS[t] || '#7a7a8a' };
}

function drawTypeBadges(label, cx, y) {
  drawBadgeRow(label.split('/').map((t) => t.trim()).filter(Boolean).map(typeBadge), cx, y);
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

    drawText(ctx, o.name.toUpperCase(), x + 8, CARD_Y + 24, 'white');
    if (o.kind === 'ability') {
      drawText(ctx, o.slot === 0 ? 'KEY Q' : 'KEY E', x + CARD_W - 40, CARD_Y + 24, 'gold');
    }

    // Tag row between the name and the description: the weapon's type, then NEW if it is one,
    // centred exactly the way a starter's types are centred under its name.
    //
    // Its own line because the name row already ends in the ability's key hint, and a long name
    // plus two tags does not fit 176px.
    const tags = [];
    if (o.type) tags.push(typeBadge(o.type));
    if (o.isNew) tags.push({ text: 'NEW', color: '#ffd166' });
    drawBadgeRow(tags, x + CARD_W / 2, CARD_Y + 34);

    // Below the tag row with a clear gap. Five lines from here still finish well above the
    // card number at CARD_H - 16, so nothing had to shrink to make room for the badges.
    const lines = wrap(o.desc, 26);
    for (let l = 0; l < lines.length && l < 5; l++) {
      drawText(ctx, lines[l], x + 8, CARD_Y + 48 + l * 10, 'dim');
    }

    drawTextCentered(ctx, `${i + 1}`, x + CARD_W / 2, CARD_Y + CARD_H - 16, selected ? 'gold' : 'dim');
    if (selected) drawCursorArrow(x + CARD_W / 2, CARD_Y - 11);
  }

  drawFooter();
}

/**
 * Level pips: filled for levels taken, hollow for those remaining.
 *
 * The cap is the longest track anything has -- ten, since weapons gained levels 9 and 10. Ten
 * pips are 48px against the card's 176, so they still clear the kind label on the same row.
 *
 * `max: 0` means uncapped, which is what a Mastery card is: there is no track to draw, so it
 * draws none rather than one lonely pip that never fills.
 */
const PIP_MAX = 10;

function drawPips(o, rightX, y, color) {
  if (!o.max) return;
  const max = Math.min(o.max, PIP_MAX);
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
// The box the title logo is fitted into, centred at the top. The height is what fits above the
// menu window and the starters on the shore; the width only matters for a very wide logo.
const LOGO_MAX_W = 380, LOGO_MAX_H = 100, LOGO_TOP = 8;

/** The logo shrunk to its on-screen size, built once. `null` until the image has loaded. */
let logoCache = null;
let logoSource = null;

/**
 * Trim the logo to its visible pixels and shrink it to fit the box.
 *
 * Done once, not per frame, and in HALVING steps with smoothing on. The supplied logo is painted
 * art at 1774x887 -- nearly three screens wide -- and everything else here is pixel art drawn
 * without smoothing. Squeezing it to a fifth of its size in one nearest-neighbour step would turn
 * every curve into stairs, and a single smoothed step that large skips most of the source pixels;
 * halving repeatedly averages them all.
 */
function buildLogo(img) {
  // Trim the transparent margin first, so the logo is centred on its art and not on its canvas.
  const sg = img.canvas.getContext('2d', { willReadFrequently: true });
  const px = sg.getImageData(0, 0, img.w, img.h).data;
  let x0 = img.w, y0 = img.h, x1 = -1, y1 = -1;
  for (let y = 0; y < img.h; y++) {
    for (let x = 0; x < img.w; x++) {
      if (px[(y * img.w + x) * 4 + 3] > 16) {
        if (x < x0) x0 = x; if (x > x1) x1 = x;
        if (y < y0) y0 = y; if (y > y1) y1 = y;
      }
    }
  }
  if (x1 < 0) return null;
  let w = x1 - x0 + 1, h = y1 - y0 + 1;
  let src = document.createElement('canvas');
  src.width = w; src.height = h;
  src.getContext('2d').drawImage(img.canvas, x0, y0, w, h, 0, 0, w, h);

  const k = Math.min(LOGO_MAX_W / w, LOGO_MAX_H / h);
  const tw = Math.max(1, Math.round(w * k)), th = Math.max(1, Math.round(h * k));
  while (w / 2 > tw) {
    const half = document.createElement('canvas');
    half.width = Math.max(tw, Math.round(w / 2));
    half.height = Math.max(th, Math.round(h / 2));
    const hg = half.getContext('2d');
    hg.imageSmoothingEnabled = true;
    hg.imageSmoothingQuality = 'high';
    hg.drawImage(src, 0, 0, half.width, half.height);
    src = half; w = half.width; h = half.height;
  }
  const out = document.createElement('canvas');
  out.width = tw; out.height = th;
  const og = out.getContext('2d');
  og.imageSmoothingEnabled = true;
  og.imageSmoothingQuality = 'high';
  og.drawImage(src, 0, 0, tw, th);
  return out;
}

/** The title logo, centred at the top. Returns the y just below it, for the subtitle. */
function drawTitleLogo() {
  const img = getImage('title');
  if (!img) {
    // No logo file: the drawn wordmark, as before.
    drawLogo(ctx, 'POKEMON DRACULA EDITION', VW / 2, 34, 3, 'gold', 'dark');
    return 50;
  }
  if (logoSource !== img) { logoSource = img; logoCache = buildLogo(img); }
  if (!logoCache) return 50;
  // Already at its final size, so a plain 1:1 blit -- no smoothing question at draw time.
  ctx.drawImage(logoCache, Math.round((VW - logoCache.width) / 2), LOGO_TOP);
  return LOGO_TOP + logoCache.height;
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

export function drawTitle(starters, t, cursor = 0, claimable = 0) {
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

  drawTitleMenu(subY + 20, cursor, claimable, t);

  // The two footer lines get a band behind them for the same reason.
  ctx.fillStyle = 'rgba(6,10,26,0.62)';
  ctx.fillRect(0, VH - 32, VW, 32);
  // The artists ask to be credited wherever their sprites are used, so the attribution stays on
  // the front page and not only on the credits screen.
  drawTextCentered(ctx, 'SPRITES AND PORTRAITS BY THE PMD SPRITE COLLAB', VW / 2, VH - 28, 'blue');
  drawTextCentered(ctx, 'ARROWS + ENTER    M MUTE    F FULLSCREEN', VW / 2, VH - 16, 'dim');
}

const MENU_ROW = 15;

/**
 * The main menu: one Mystery Dungeon window between the subtitle and the starters. In a window
 * because white text straight on the sea backdrop is barely legible.
 */
function drawTitleMenu(y, cursor, claimable, t) {
  const w = 168;
  const h = TITLE_MENU.length * MENU_ROW + 14;
  const x = Math.round((VW - w) / 2);
  panel(x, y, w, h, { accent: '#ffd166' });

  for (let i = 0; i < TITLE_MENU.length; i++) {
    const item = TITLE_MENU[i];
    const ry = y + 9 + i * MENU_ROW;
    const on = i === cursor;
    if (on) {
      ctx.fillStyle = 'rgba(255,209,102,0.16)';
      ctx.fillRect(x + 6, ry - 3, w - 12, MENU_ROW - 1);
      // A small chevron, nudging on wall time so the cursor reads as alive.
      const nx = x + 14 + Math.round(Math.abs(Math.sin(t * 5)) * 2);
      ctx.fillStyle = '#ffd166';
      for (let k = 0; k < 4; k++) ctx.fillRect(nx + k, ry + k, 1, 7 - k * 2);
    }
    drawText(ctx, item.label, x + 28, ry, on ? 'gold' : 'white');

    // Something waiting to be claimed: say so from the menu, or nobody would think to look.
    if (item.id === 'successes' && claimable > 0) {
      const tag = `! ${claimable}`;
      const tw = textWidth(tag) + 6;
      const tx = x + w - 14 - tw;
      ctx.fillStyle = '#ffd166';
      ctx.fillRect(tx, ry - 1, tw, 9);
      drawText(ctx, tag, tx + 3, ry, 'dark');
    }
  }
}

// --- Successes ----------------------------------------------------------------

const SC_W = 284, SC_H = 62, SC_GAP = 14, SC_TOP = 36, SC_ROW = SC_H + 10;

/** A 1px frame outside a card, in spans -- the golden outline of a reward waiting to be claimed. */
function outline(x, y, w, h, color) {
  ctx.fillStyle = color;
  ctx.fillRect(x, y, w, 1);
  ctx.fillRect(x, y + h - 1, w, 1);
  ctx.fillRect(x, y, 1, h);
  ctx.fillRect(x + w - 1, y, 1, h);
}

export function drawSuccesses(cursor) {
  ctx.fillStyle = '#17142a';
  ctx.fillRect(0, 0, VW, VH);
  drawText(ctx, 'SUCCESSES', 30, 14, 'gold');
  const head = `${unlockedCount()} / ${SUCCESSES.length} UNLOCKED     ${formatNum(bankTotal())} G`;
  drawText(ctx, head, VW - 30 - textWidth(head), 14, 'dim');

  // Scroll by whole rows so the selected card is always on screen.
  const rowsVisible = Math.floor((VH - SC_TOP - 26) / SC_ROW);
  const row = Math.floor(cursor / 2);
  const first = Math.max(0, row - rowsVisible + 1) * 2;
  const x0 = Math.round((VW - SC_W * 2 - SC_GAP) / 2);

  for (let i = first; i < SUCCESSES.length && i < first + rowsVisible * 2; i++) {
    const sc = SUCCESSES[i];
    const state = successState(sc.id);
    const x = x0 + (i % 2) * (SC_W + SC_GAP);
    const y = SC_TOP + Math.floor((i - first) / 2) * SC_ROW;
    const on = i === cursor;

    const accent = state === 'unlocked' ? '#ffd166' : state === 'claimed' ? '#7ac8ff' : '#3a4466';
    panel(x, y, SC_W, SC_H, on ? { accent: '#ffffff', ...WIN_SELECTED } : { accent });
    // Unlocked and unclaimed: a second, outer gold frame -- the "come and collect this" card.
    if (state === 'unlocked') {
      outline(x - 2, y - 2, SC_W + 4, SC_H + 4, '#ffd166');
      outline(x - 3, y - 3, SC_W + 6, SC_H + 6, 'rgba(255,209,102,0.35)');
    }

    const title = state === 'locked' ? '???' : sc.title.toUpperCase();
    drawText(ctx, title, x + 10, y + 9, state === 'locked' ? 'dim' : state === 'unlocked' ? 'gold' : 'white');

    const lines = wrap(sc.desc.toUpperCase(), 42);
    for (let l = 0; l < lines.length && l < 2; l++) {
      drawText(ctx, lines[l], x + 10, y + 23 + l * 10, state === 'locked' ? 'dim' : 'white');
    }

    // The prize, bottom right; what to do about it, bottom left.
    const prize = rewardLabel(sc.reward);
    drawText(ctx, prize, x + SC_W - 10 - textWidth(prize), y + SC_H - 15,
      state === 'claimed' ? 'dim' : 'gold');
    const status = state === 'locked' ? 'LOCKED'
      : state === 'claimed' ? 'CLAIMED'
      : 'ENTER TO CLAIM';
    drawText(ctx, status, x + 10, y + SC_H - 15,
      state === 'locked' ? 'dim' : state === 'claimed' ? 'green' : 'gold');
  }

  drawTextCentered(ctx, 'ARROWS MOVE    ENTER CLAIM    BACKSPACE BACK', VW / 2, VH - 16, 'dim');
}

/** One line for the end-of-run screens when anything unlocked during the run. */
export function newSuccessLine() {
  if (!unlockedThisRun.length) return '';
  return unlockedThisRun.length === 1
    ? 'NEW SUCCESS -- CLAIM IT FROM THE MENU'
    : `${unlockedThisRun.length} NEW SUCCESSES -- CLAIM THEM FROM THE MENU`;
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

  drawTextCentered(ctx, max > 0 ? 'UP / DOWN SCROLL      BACKSPACE BACK' : 'BACKSPACE BACK', VW / 2, VH - 24, 'dim');
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

  drawTextCentered(ctx, `1-${starters.length} / ARROWS + ENTER      BACKSPACE BACK`, VW / 2, VH - 18, 'dim');
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

  drawTextCentered(ctx, `1-${stages.length} / ARROWS + ENTER      BACKSPACE BACK`, VW / 2, VH - 18, 'dim');
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
    ui.awaitKey ? 'PRESS THE NEW KEY      BACKSPACE CANCEL' : 'ARROWS + ENTER      BACKSPACE BACK',
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

  // The depth bonus is its own line rather than folded into the gold, so the reward for going
  // down is visible as the reason it was worth going down.
  const bonus = floorBonus();
  const lines = [
    `${G.character ? G.character.name.toUpperCase() : ''} CLEARED ${G.stage ? G.stage.name.toUpperCase() : ''}`,
    '',
    `TIME      ${formatTime(G.runTime)}`,
    `LEVEL     ${G.level}`,
    `FLOOR     ${floorLabel()}`,
    `DEFEATED  ${formatNum(G.kills)}`,
    '',
  ];
  if (bonus > 0) lines.push(`${floorOrdinal()} FLOOR BONUS  +${formatNum(bonus)}`);
  if (G.endlessBosses > 0) {
    lines.push(`ENDLESS x${G.endlessBosses}    +${formatNum(endlessBonus())}`);
  }
  lines.push(`GOLD EARNED   +${formatNum(G.coins)}`);
  lines.push(`BANK          ${formatNum(bankTotal())}`);

  // Two columns: how the run went on the left, what did the work on the right.
  messageWindow(22, 96, 290, lines, { accent: '#ffd166', lineHeight: 11 });
  drawDamagePanel(328, 96, 290, damageBreakdown(), weaponTypeOf);

  const ns = newSuccessLine();
  drawTextCentered(ctx, ns || 'SPEND IT AT THE KECLEON SHOP', VW / 2, VH - 42, ns ? 'gold' : 'blue');
  drawTextCentered(ctx, 'PRESS ANY KEY', VW / 2, VH - 26, 'dim');
}

/**
 * The fork at the end of a won run: bank it, or keep going.
 *
 * Deliberately not a card screen. The win is already secured by the time this appears, so there
 * is nothing to weigh up and nothing to lose -- it is a question, and it reads as one.
 */
export function drawVictoryChoice() {
  ctx.fillStyle = 'rgba(8,8,18,0.82)';
  ctx.fillRect(0, 0, VW, VH);

  drawLogo(ctx, 'VICTORY', VW / 2, 52, 3, 'gold', 'dark');
  drawTextCentered(ctx, `${formatTime(G.runTime)}   FLOOR ${floorLabel()}`, VW / 2, 84, 'dim');

  const w = 300, x = Math.round((VW - w) / 2);
  messageWindow(x, 108, w, [
    'THE BOSS IS DOWN. THE WIN IS YOURS',
    'WHATEVER YOU DO NEXT.',
    '',
    '1 / ENTER   TAKE THE WIN',
    '2 / E       KEEP GOING',
    '',
    'ENDLESS SENDS A BOSS EVERY TWO',
    'MINUTES AND PAYS FOR EACH ONE.',
  ], { center: true, accent: '#ffd166', lineHeight: 11 });

  drawTextCentered(ctx, 'YOUR GOLD IS SAFE EITHER WAY', VW / 2, VH - 30, 'blue');
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
  drawTextCentered(ctx, 'ARROWS + ENTER BUY      BACKSPACE BACK', VW / 2, VH - 18, 'dim');
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
        [`OFFERED: ${inc.name.toUpperCase()} -- ${(inc.type || 'any').toUpperCase()}`],
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
    // Damage so far beside each weapon, so a pause is also a check on which picks are pulling
    // their weight.
    const ev = w.def.evolution;
    const ready = ev && !w.evolved && w.level >= w.def.levels.length && G.passives.includes(ev.needPassive);
    lines.push(`${w.def.name.toUpperCase()}  ${w.level}/${w.def.levels.length}   ${shortNum(damageFor(`w:${w.def.id}`))}${ready ? '  EVOLVE: FIND AN ELIXIR' : ''}`);
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

  drawTextCentered(ctx, 'BACKSPACE RESUME    O SETTINGS    R RESTART    Q CHANGE PARTNER', VW / 2, VH - 20, 'dim');
}

// --- Dungeon font -----------------------------------------------------------

/** Width of a string in the dungeon font, in pixels. */
export function dungeonTextWidth(str) {
  const f = dungeonFont;
  if (!f) return 0;
  let w = 0;
  for (const ch of str) {
    const g = f.glyphs.get(ch);
    w += (g ? g.w : f.space) + f.tracking;
  }
  return Math.max(0, w - f.tracking);
}

/**
 * Draw a line in the dungeon font, centred on cx, its cell top at y. Returns false when the font
 * did not load, so the caller can fall back to the built-in one.
 *
 * Drawn 1:1. The glyphs are anti-aliased, so scaling them by a fraction would blur them, and at
 * their native ~16px they are already twice the height of the pixel font.
 */
export function drawDungeonText(str, cx, y, alpha = 1) {
  const f = dungeonFont;
  if (!f) return false;
  let x = Math.round(cx - dungeonTextWidth(str) / 2);
  ctx.globalAlpha = alpha;
  for (const ch of str) {
    const g = f.glyphs.get(ch);
    if (!g) { x += f.space + f.tracking; continue; }
    ctx.drawImage(f.canvas, g.sx, g.sy, g.w, f.h, x, Math.round(y), g.w, f.h);
    x += g.w + f.tracking;
  }
  ctx.globalAlpha = 1;
  return true;
}
