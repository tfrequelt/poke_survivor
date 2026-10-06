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
  glowCanvas, fontColorNear,
} from './sprites.js';
import { chipsFor } from './overload.js';
import { ATTACK_TYPES, rosterMatchups, SUPER, RESISTED } from './data/types.js';
import { ENEMIES } from './data/enemies.js';
import { legend } from './legends.js';
import { clamp, hash2, formatTime, formatNum } from './util.js';
import { getPortrait, getImage, getAnim, dungeonFont, dirFromAngle } from './assets.js';
import { CREDITS } from './data/credits.js';
import { WORLD_MAP } from './data/stages.js';
import { panel, wrap, WIN_SELECTED, messageWindow, slider , drawDamagePanel, shortNum} from './win.js';
import { BINDABLE, bindings, keyLabel } from './input.js';
import { settings as audioSettings } from './audio.js';
import { bankTotal, rankOf } from './save.js';
import { wheel, SEGMENTS } from './wheel.js';
import { SHOP_ITEMS, rankCost } from './data/shop.js';
import { floorLabel, floorBonus, floorOrdinal, endlessBonus } from './floors.js';
import { damageBreakdown, damageFor } from './combat.js';
import { WEAPON_BY_ID } from './data/weapons.js';
import { SUCCESSES, rewardLabel, TIERS, PERKS, RANKS } from './data/successes.js';
import { successState, unlockedCount, unlockedThisRun, successProgress, explorerRank } from './successes.js';
import { spriteBase } from './sprites.js';
import { saveData } from './save.js';
import { STAGES } from './data/stages.js';

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
  blessing: '#7fe08a',
};

const KIND_LABEL = {
  ability: 'ABILITY',
  weapon: 'WEAPON',
  passive: 'ITEM',
  stat: 'BOOST',
  heal: 'RECOVER',
  mastery: 'MASTERY',
  blessing: 'BLESSING',
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

// --- Matchups -------------------------------------------------------------------
//
// What each attacking type does against what you are about to fight: a stage's whole roster,
// weighted by how often each species turns up, or -- on a secret floor -- the one legendary.

const rosterCache = new Map();

/** Per ATTACK_TYPES entry, the average multiplier against this stage's roster. Cached. */
export function stageMatchups(stageId) {
  let m = rosterCache.get(stageId);
  if (m) return m;
  const roster = ENEMIES.filter((e) => !e.prop && e.stages && e.stages.includes(stageId))
    .map((e) => ({ id: e.id, weight: e.weight || 1 }));
  m = rosterMatchups(roster);
  rosterCache.set(stageId, m);
  return m;
}

/** The matchups for what is on the field right now. */
function matchupsNow() {
  if (G.secret && legend.active && legend.def) return rosterMatchups([{ id: legend.def.id, weight: 1 }]);
  return G.stage ? stageMatchups(G.stage.id) : null;
}

/** The types that do best here, best first, up to `n`. */
function strongTypes(m, n) {
  return ATTACK_TYPES.map((t, i) => [t, m[i]]).filter(([, v]) => v >= SUPER)
    .sort((a, b) => b[1] - a[1]).slice(0, n).map(([t]) => t);
}

/** The types that do worst here, worst first, up to `n`. */
function weakTypes(m, n) {
  return ATTACK_TYPES.map((t, i) => [t, m[i]]).filter(([, v]) => v <= RESISTED)
    .sort((a, b) => a[1] - b[1]).slice(0, n).map(([t]) => t);
}

/** A STRONG / WEAK tag for a weapon of this type against the field, or null. */
function matchupTag(type, m) {
  const i = ATTACK_TYPES.indexOf(String(type).toLowerCase());
  if (i < 0 || !m) return null;
  if (m[i] >= SUPER) return { text: 'STRONG HERE', color: '#7fe08a' };
  if (m[i] <= RESISTED) return { text: 'WEAK HERE', color: '#ff8a8a' };
  return null;
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
  if (G.offers.length && G.offers[0].kind === 'overload') { drawOverloadPick(); return; }
  ctx.fillStyle = 'rgba(8,8,18,0.82)';
  ctx.fillRect(0, 0, VW, VH);

  const blessing = G.offers.length > 0 && G.offers[0].kind === 'blessing';
  if (blessing) {
    if (!drawDungeonText('Totem Blessing', VW / 2, 22)) drawTextCentered(ctx, 'TOTEM BLESSING', VW / 2, 30, 'green');
    drawTextCentered(ctx, 'CHOOSE ONE -- IT LASTS THE WHOLE RUN', VW / 2, 50, 'green');
  } else {
    drawTextCentered(ctx, 'LEVEL UP', VW / 2, 34, 'gold');
    drawTextCentered(ctx, `LEVEL ${G.level}`, VW / 2, 48, 'dim');
  }

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
    // How this weapon's type fares against what is on the field.
    if (o.kind === 'weapon' && o.type) {
      const mt = matchupTag(o.type, matchupsNow());
      if (mt) tags.push(mt);
    }
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

  if (blessing) drawTextCentered(ctx, '1-3 / ARROWS + ENTER', VW / 2, VH - 26, 'dim');
  else drawFooter();
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

// --- Overload ---------------------------------------------------------------
//
// The level-up after a weapon reaches level 10 is this instead: its three overloads, side by side,
// taller than ordinary cards because each one says a great deal more.

const OVL_W = 194, OVL_H = 236, OVL_Y = 54, OVL_GAP = 11;
const TAG_COLOR = { AMPLIFY: '#ffd166', TRANSFORM: '#7af0e8', WILD: '#ff9ad8' };

function drawOverloadPick() {
  const t = performance.now() / 1000;
  ctx.fillStyle = 'rgba(6,6,16,0.9)';
  ctx.fillRect(0, 0, VW, VH);

  const offers = G.offers;
  const w = G.weapons.find((x) => x.def.id === offers[0].weaponId);

  // Embers of the selected overload's colour drifting up the screen: the whole screen takes on
  // the choice under the cursor.
  const sel = offers[clamp(ui.cursor, 0, offers.length - 1)].ovl;
  ctx.fillStyle = sel.color;
  for (let i = 0; i < 46; i++) {
    const sx = hash2(i, 7) * VW;
    const speed = 14 + hash2(i, 11) * 30;
    const sy = VH - ((t * speed + hash2(i, 3) * VH) % (VH + 20));
    ctx.globalAlpha = 0.25 + hash2(i, 5) * 0.45;
    ctx.fillRect(Math.round(sx + Math.sin(t * 1.3 + i) * 6), Math.round(sy), i % 5 === 0 ? 2 : 1, i % 5 === 0 ? 2 : 1);
  }
  ctx.globalAlpha = 1;

  if (!drawDungeonText('Overload', VW / 2, 6)) drawTextCentered(ctx, 'OVERLOAD', VW / 2, 10, 'gold');
  const sub = w ? `${w.def.name.toUpperCase()} HAS REACHED LEVEL ${w.def.levels.length} -- CHOOSE ITS OVERLOAD` : 'CHOOSE AN OVERLOAD';
  drawTextCentered(ctx, sub, VW / 2, 30, 'gold');

  const totalW = offers.length * OVL_W + (offers.length - 1) * OVL_GAP;
  const startX = Math.round((VW - totalW) / 2);
  for (let i = 0; i < offers.length; i++) {
    const o = offers[i];
    const ov = o.ovl;
    const x = startX + i * (OVL_W + OVL_GAP);
    const selected = i === ui.cursor;
    const cx = x + OVL_W / 2;

    // A pulsing halo around the selected card, in its own colour.
    if (selected) {
      const a = 0.35 + Math.sin(t * 5) * 0.2;
      ctx.globalAlpha = a;
      ctx.fillStyle = ov.color;
      ctx.fillRect(x - 3, OVL_Y - 3, OVL_W + 6, OVL_H + 6);
      ctx.globalAlpha = 1;
    }
    panel(x, OVL_Y, OVL_W, OVL_H, selected ? { accent: '#ffffff', ...WIN_SELECTED } : { accent: ov.color });

    // The weapon itself, twice size, in the overload's glow.
    const gy = OVL_Y + 34;
    const pulse = 1 + Math.sin(t * 3 + i) * 0.08;
    const gr = 34 * pulse;
    ctx.globalCompositeOperation = 'lighter';
    ctx.globalAlpha = selected ? 0.95 : 0.6;
    ctx.drawImage(glowCanvas(ov.color), cx - gr, gy - gr, gr * 2, gr * 2);
    ctx.globalAlpha = 1;
    ctx.globalCompositeOperation = 'source-over';
    if (w) {
      // Turning slowly, so a rotated sprite shows off its shape; a flat one bobs instead.
      const rot = w.def.sprDirs > 2;
      const frame = rot ? ((t * 4 + i * 5) | 0) % w.def.sprDirs : 1;
      drawSpriteScaled(ctx, w.def.sprBase + frame, cx, gy + 8 + (rot ? 0 : Math.sin(t * 3 + i) * 2), 3);
    }

    drawBadgeRow([{ text: ov.tag, color: TAG_COLOR[ov.tag] || '#ffffff' }], cx, OVL_Y + 66);

    const nameLines = wrap(ov.name.toUpperCase(), 30);
    let y = OVL_Y + 80;
    for (const line of nameLines.slice(0, 2)) {
      drawTextCentered(ctx, line, cx, y, fontColorNear(ov.color));
      y += 10;
    }
    y += 4;
    ctx.fillStyle = ov.color;
    ctx.globalAlpha = 0.5;
    ctx.fillRect(x + 14, y - 3, OVL_W - 28, 1);
    ctx.globalAlpha = 1;
    y += 4;

    for (const line of wrap(ov.desc, 30).slice(0, 10)) {
      drawText(ctx, line, x + 9, y, 'white');
      y += 10;
    }

    // What it does, in a word or two each, as many as fit on two rows.
    const chips = chipsFor(ov).map((c) => ({ text: c, color: ov.color }));
    let row = [], rowW = -BADGE_GAP, cy = OVL_Y + OVL_H - 46, rows = 0;
    for (const c of chips) {
      const cw = textWidth(c.text) + BADGE_PAD * 2 + BADGE_GAP;
      if (rowW + cw > OVL_W - 16) {
        drawBadgeRow(row, cx, cy);
        cy += BADGE_H + 3; rows++;
        row = []; rowW = -BADGE_GAP;
        if (rows >= 2) break;
      }
      row.push(c); rowW += cw;
    }
    if (rows < 2 && row.length) drawBadgeRow(row, cx, cy);

    drawTextCentered(ctx, `${i + 1}`, cx, OVL_Y + OVL_H - 14, selected ? 'gold' : 'dim');
    if (selected) drawCursorArrow(cx, OVL_Y - 11);
  }

  const parts = ['1-3 / ARROWS + ENTER'];
  if (G.skips > 0) parts.push(`S SKIP (${G.skips})`);
  parts.push('ONE OVERLOAD PER WEAPON, FOR THE WHOLE RUN');
  drawTextCentered(ctx, parts.join('      '), VW / 2, VH - 16, 'dim');
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
  drawRankBadge();

  // The two footer lines get a band behind them for the same reason.
  ctx.fillStyle = 'rgba(6,10,26,0.62)';
  ctx.fillRect(0, VH - 32, VW, 32);
  // The artists ask to be credited wherever their sprites are used, so the attribution stays on
  // the front page and not only on the credits screen.
  drawTextCentered(ctx, 'SPRITES AND PORTRAITS BY THE PMD SPRITE COLLAB', VW / 2, VH - 28, 'blue');
  drawTextCentered(ctx, 'ARROWS + ENTER    M MUTE    F FULLSCREEN', VW / 2, VH - 16, 'dim');
}

/** Top left of the title: your Explorer Rank, its badge, and how far to the next. */
function drawRankBadge() {
  const r = explorerRank();
  const id = spriteBase(`rank_${r.index}`, 'gold');
  ctx.fillStyle = 'rgba(6,10,26,0.62)';
  ctx.fillRect(4, 4, 112, 34);
  if (id >= 0) drawSprite(ctx, id, 24, 21);
  drawText(ctx, 'EXPLORER RANK', 44, 9, 'dim');
  drawText(ctx, r.name, 44, 19, 'gold');
  if (r.next !== null) {
    const k = clamp((r.points - r.at) / (r.next - r.at), 0, 1);
    ctx.fillStyle = '#2a2f4a';
    ctx.fillRect(44, 29, 64, 3);
    ctx.fillStyle = '#ffd166';
    ctx.fillRect(44, 29, Math.round(64 * k), 3);
  }
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

const SC_W = 284, SC_H = 64, SC_GAP = 14, SC_TOP = 42, SC_ROW = SC_H + 6;

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
  drawText(ctx, 'SUCCESSES', 30, 10, 'gold');
  const head = `${unlockedCount()} / ${SUCCESSES.length} UNLOCKED     ${formatNum(bankTotal())} G`;
  drawText(ctx, head, VW - 30 - textWidth(head), 10, 'dim');
  // The Explorer Rank the claimed successes add up to, with the way to the next one.
  const r = explorerRank();
  const badge = spriteBase(`rank_${r.index}`, 'gold');
  if (badge >= 0) drawSpriteScaled(ctx, badge, 30 + 8, 30, 0.5);
  const rl = r.next === null ? `EXPLORER RANK  ${r.name}  -- ${r.points} PTS`
    : `EXPLORER RANK  ${r.name}  -- ${r.points} / ${r.next} PTS TO ${RANKS[r.index + 1].name}`;
  drawText(ctx, rl, 52, 26, 'white');

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
    // The tier: a stripe down the left edge, and its name top right.
    const tier = TIERS[sc.tier || 'bronze'];
    ctx.fillStyle = tier.color;
    ctx.fillRect(x + 4, y + 6, 2, SC_H - 12);
    drawText(ctx, tier.label, x + SC_W - 10 - textWidth(tier.label), y + 9, state === 'locked' ? 'dim' : 'white');
    // Unlocked and unclaimed: a second, outer gold frame -- the "come and collect this" card.
    if (state === 'unlocked') {
      outline(x - 2, y - 2, SC_W + 4, SC_H + 4, '#ffd166');
      outline(x - 3, y - 3, SC_W + 6, SC_H + 6, 'rgba(255,209,102,0.35)');
    }

    const title = state === 'locked' ? '???' : sc.title.toUpperCase();
    drawText(ctx, title, x + 10, y + 9, state === 'locked' ? 'dim' : state === 'unlocked' ? 'gold' : 'white');

    const lines = wrap(sc.desc.toUpperCase(), 42);
    for (let l = 0; l < lines.length && l < 2; l++) {
      drawText(ctx, lines[l], x + 10, y + 20 + l * 10, state === 'locked' ? 'dim' : 'white');
    }
    // A perk is the bigger part of the prize when there is one, so it gets a line of its own.
    if (sc.reward && sc.reward.perk && PERKS[sc.reward.perk]) {
      const pk = PERKS[sc.reward.perk];
      drawText(ctx, `PERK: ${pk.name.toUpperCase()} -- ${pk.desc.toUpperCase()}`.slice(0, 44), x + 10, y + 39, state === 'claimed' ? 'green' : 'blue');
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

    // A tally kept across runs gets a bar between the status and the prize, so a 3 / 9 reads
    // as progress rather than as a locked card that has not moved.
    const prog = successProgress(sc);
    if (prog) {
      const [have, of] = prog;
      const label = `${have} / ${of}`;
      const bx = x + 64, bw = SC_W - 64 - (textWidth(prize) + 18) - textWidth(label) - 8, by = y + SC_H - 14;
      ctx.fillStyle = '#101018';
      ctx.fillRect(bx - 1, by - 1, bw + 2, 7);
      ctx.fillStyle = '#2a2f4a';
      ctx.fillRect(bx, by, bw, 5);
      ctx.fillStyle = have >= of ? '#7fe08a' : '#ffd166';
      ctx.fillRect(bx, by, Math.round(bw * (have / of)), 5);
      drawText(ctx, label, bx + bw + 6, y + SC_H - 15, have >= of ? 'green' : 'white');
    }
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
    // A ribbon for every stage this partner has won, a grey one where it has not yet.
    const rib = saveData().ribbons;
    for (let s = 0; s < STAGES.length; s++) {
      const won = rib[`${c.id}:${STAGES[s].id}`];
      const rid = spriteBase(won ? `ribbon_${STAGES[s].id}` : 'ribbon_none', 'gold');
      if (rid < 0) continue;
      if (!won) ctx.globalAlpha = 0.35;
      // Stacked in the card's top-left corner, beside the portrait.
      drawSprite(ctx, rid, x + 13, SELECT_Y + 14 + s * 15);
      ctx.globalAlpha = 1;
    }
    if (selected) drawCursorArrow(px, SELECT_Y - 11);
  }

  drawTextCentered(ctx, `1-${starters.length} / ARROWS + ENTER      BACKSPACE BACK`, VW / 2, VH - 18, 'dim');
}

// --- Stage select -----------------------------------------------------------
//
// The stages are places on the world map: the first version of maps.png, drawn 1:1 in the middle
// of the screen, with the location dot on each stage's `mapAt`. A window over the empty cloud on
// the map's left lists them, and the pointer and your partner travel to whichever is selected.

// Shared maxima, so the three difficulty bars compare across stages instead of self-normalising.
const STAGE_ROWS = [
  { key: 'hpMult', label: 'HP', max: 1.4 },
  { key: 'spsMult', label: 'RATE', max: 1.4 },
  { key: 'coinMult', label: 'GOLD', max: 1.4 },
];

// Where the map's top-left lands on screen: centred across, and high enough to leave a line
// under it for the key hint.
const MAP_X = 68, MAP_Y = 5;
// The list window. The land on this map starts some 70px in from its left edge, so a window this
// wide covers nothing but cloud.
const LIST_X = 10, LIST_W = 128, LIST_ROW = 12;
// The partner's pace across the map, px/s, and where it stands relative to the dot.
const WALK_SPEED = 80, BESIDE_X = 17, BESIDE_Y = 5;

/**
 * The pointer and the partner between draws. Both run on the menu clock: the pointer eases to the
 * new dot, the partner walks there at a steady pace, so a quick scroll leaves the partner a step
 * behind -- which is what makes it read as walking rather than teleporting.
 */
const travel = { t: -1, px: 0, py: 0, wx: 0, wy: 0, ang: 0, walking: false };

/**
 * The pointer over the selected dot. Bigger than the menus' chevron and white-topped: the
 * chevron's pale gold all but vanishes against the sepia map. The tip ends at y.
 */
function drawMapPointer(cx, y) {
  const bob = Math.round(Math.abs(Math.sin(performance.now() * 0.004)) * 3);
  const x = Math.round(cx), top = Math.round(y) - 7 - bob;
  ctx.fillStyle = '#0d0d18';
  ctx.fillRect(x - 8, top - 1, 16, 1);
  for (let i = 0; i < 7; i++) ctx.fillRect(x - (7 - i) - 1, top + i, (7 - i) * 2 + 2, 1);
  ctx.fillRect(x - 1, top + 7, 2, 1);
  for (let i = 0; i < 7; i++) {
    ctx.fillStyle = i < 2 ? '#ffffff' : i < 5 ? '#ffd166' : '#e09a2a';
    ctx.fillRect(x - (7 - i), top + i, (7 - i) * 2, 1);
  }
}

/** A small right-pointing marker for the selected row, nudging with the cursor's bob. */
function drawRowPointer(x, y) {
  const nudge = Math.round(Math.abs(Math.sin(performance.now() * 0.003)) * 2);
  ctx.fillStyle = '#ffd166';
  ctx.fillRect(x + nudge, y, 1, 7);
  ctx.fillRect(x + nudge + 1, y + 1, 1, 5);
  ctx.fillRect(x + nudge + 2, y + 2, 1, 3);
  ctx.fillRect(x + nudge + 3, y + 3, 1, 1);
}

export function drawStageSelect(stages, partner, t) {
  ctx.fillStyle = '#12202a';
  ctx.fillRect(0, 0, VW, VH);

  // The map, in a thin frame.
  const [mx0, my0, mw, mh] = WORLD_MAP.rect;
  ctx.fillStyle = '#0d0d18';
  ctx.fillRect(MAP_X - 2, MAP_Y - 2, mw + 4, mh + 4);
  ctx.fillStyle = '#a07840';
  ctx.fillRect(MAP_X - 1, MAP_Y - 1, mw + 2, mh + 2);
  const map = getImage(WORLD_MAP.image);
  if (map) ctx.drawImage(map.canvas, mx0, my0, mw, mh, MAP_X, MAP_Y, mw, mh);
  else { ctx.fillStyle = '#e8c890'; ctx.fillRect(MAP_X, MAP_Y, mw, mh); }

  // A dot on every stage, and a ring pulsing out of the selected one.
  const dot = getImage(WORLD_MAP.cursor);
  for (const st of stages) {
    const x = MAP_X + st.mapAt[0], y = MAP_Y + st.mapAt[1];
    if (dot) ctx.drawImage(dot.canvas, x - (dot.w >> 1), y - (dot.h >> 1));
    else { ctx.fillStyle = '#ffc70f'; ctx.fillRect(x - 3, y - 3, 6, 6); }
  }
  // The cursor is shared with every other menu; clamped, so a stale one cannot select nothing.
  const cur = clamp(ui.cursor, 0, stages.length - 1);
  const sel = stages[cur];
  const sx = MAP_X + sel.mapAt[0], sy = MAP_Y + sel.mapAt[1];
  const ph = (t * 1.2) % 1;
  ctx.globalAlpha = 0.9 * (1 - ph);
  ctx.strokeStyle = '#fff6c0';
  ctx.lineWidth = 1;
  ctx.beginPath();
  ctx.arc(sx, sy, 5 + ph * 7, 0, Math.PI * 2);
  ctx.stroke();
  ctx.globalAlpha = 1;

  // Move the pointer and the partner toward the selected dot. A long gap since the last draw
  // means the screen has just opened: start them there rather than walking in from wherever the
  // last visit left them.
  const gx = sx + BESIDE_X, gy = sy + BESIDE_Y;
  const dt = t - travel.t;
  travel.t = t;
  if (!(dt >= 0 && dt < 0.25)) {
    travel.px = sx; travel.py = sy;
    travel.wx = gx; travel.wy = gy;
    travel.walking = false;
  } else {
    const k = 1 - Math.exp(-dt * 12);
    travel.px += (sx - travel.px) * k;
    travel.py += (sy - travel.py) * k;
    const dx = gx - travel.wx, dy = gy - travel.wy, d = Math.hypot(dx, dy);
    const stride = WALK_SPEED * dt;
    if (d <= stride) {
      travel.wx = gx; travel.wy = gy;
      travel.walking = false;
    } else {
      travel.wx += (dx / d) * stride;
      travel.wy += (dy / d) * stride;
      travel.ang = Math.atan2(dy, dx);
      travel.walking = true;
    }
  }

  if (partner && partner.sprId !== undefined) {
    const nd = partner.sprDirs || 2, nf = partner.sprFrames || 2;
    const face = partner.sprFace !== undefined ? partner.sprFace : (nd === 8 ? 0 : 1);
    // Facing the way it walks, and back to the camera once it is there.
    const dir = !travel.walking ? face
      : nd === 8 ? dirFromAngle(travel.ang) : (Math.cos(travel.ang) >= 0 ? 1 : 0);
    const frame = ((t * (travel.walking ? 8 : 3)) | 0) % nf;
    drawShadow(ctx, travel.wx, travel.wy);
    drawSprite(ctx, partner.sprId + frame * nd + dir, travel.wx, travel.wy);
  }
  drawMapPointer(travel.px, travel.py - 6);

  // The list window. Its height is fixed by the longest description, so it does not resize as
  // the selection moves.
  const chars = Math.floor((LIST_W - 20) / 6);
  let blurbRows = 0;
  for (const st of stages) blurbRows = Math.max(blurbRows, wrap(st.blurb || '', chars).length);
  const h = 8 + 10 + (partner ? 10 : 0) + 6 + stages.length * LIST_ROW + 11
    + STAGE_ROWS.length * 10 + 4 + 24 + blurbRows * 9 + 6;
  const x0 = LIST_X, y0 = Math.round(MAP_Y + mh / 2 - h / 2), cx = x0 + LIST_W / 2;
  panel(x0, y0, LIST_W, h, {});
  let y = y0 + 8;
  drawTextCentered(ctx, 'CHOOSE YOUR STAGE', cx, y, 'gold');
  y += 10;
  if (partner) {
    drawTextCentered(ctx, `WITH ${partner.name.toUpperCase()}`, cx, y, 'dim');
    y += 10;
  }
  y += 6;
  for (let i = 0; i < stages.length; i++) {
    const selected = i === cur;
    if (selected) {
      ctx.fillStyle = WIN_SELECTED.fillTop;
      ctx.fillRect(x0 + 5, y - 3, LIST_W - 10, LIST_ROW);
      drawRowPointer(x0 + 8, y);
    }
    drawText(ctx, `${i + 1} ${stages[i].name.toUpperCase()}`, x0 + 16, y, selected ? 'white' : 'dim');
    y += LIST_ROW;
  }

  y += 2;
  ctx.fillStyle = '#3a3a58';
  ctx.fillRect(x0 + 8, y, LIST_W - 16, 1);
  y += 9;

  const color = sel.color || '#7ac8ff';
  for (const row of STAGE_ROWS) {
    const v = sel[row.key] || 1;
    drawText(ctx, row.label, x0 + 10, y, 'dim');
    const bx = x0 + 42, bw = LIST_W - 52;
    ctx.fillStyle = '#2a2a40';
    ctx.fillRect(bx, y + 1, bw, 4);
    ctx.fillStyle = color;
    ctx.fillRect(bx, y + 1, Math.round(bw * clamp(v / row.max, 0, 1)), 4);
    y += 10;
  }
  // Which of your types this stage's roster is weak to: the planning the matchups ask for.
  y += 2;
  drawText(ctx, 'STRONG HERE', x0 + 10, y, 'dim');
  y += 9;
  const strong = strongTypes(stageMatchups(sel.id), 3).map(typeBadge);
  if (strong.length) drawBadgeRow(strong, x0 + LIST_W / 2, y);
  else drawText(ctx, 'NOTHING IN PARTICULAR', x0 + 10, y + 1, 'dim');
  y += 13;
  for (const line of wrap(sel.blurb || '', chars)) {
    drawText(ctx, line, x0 + 10, y, 'white');
    y += 9;
  }

  drawTextCentered(ctx, `1-${stages.length} / ARROWS + ENTER      BACKSPACE BACK`, VW / 2, VH - 13, 'dim');
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
  if (G.trk && G.trk.ribbon && G.stage) {
    const rid = spriteBase(`ribbon_${G.stage.id}`, 'gold');
    const msg = `RIBBON EARNED: ${G.character.name.toUpperCase()} ON ${G.stage.name.toUpperCase()}`;
    drawTextCentered(ctx, msg, VW / 2, 82, 'gold');
    if (rid >= 0) { drawSprite(ctx, rid, VW / 2 - textWidth(msg) / 2 - 12, 85); drawSprite(ctx, rid, VW / 2 + textWidth(msg) / 2 + 12, 85); }
  }
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
  const mm = matchupsNow();
  if (mm) {
    const up = strongTypes(mm, 4), down = weakTypes(mm, 3);
    lines.push(`STRONG HERE: ${up.length ? up.join(' ').toUpperCase() : '-'}    WEAK HERE: ${down.length ? down.join(' ').toUpperCase() : '-'}`);
  }
  lines.push('');
  lines.push('- WEAPONS -');
  for (const w of G.weapons) {
    // Damage so far beside each weapon, so a pause is also a check on which picks are pulling
    // their weight.
    const ev = w.def.evolution;
    const ready = ev && !w.evolved && w.level >= w.def.levels.length && G.passives.includes(ev.needPassive);
    lines.push(`${w.def.name.toUpperCase()}  ${w.level}/${w.def.levels.length}   ${shortNum(damageFor(`w:${w.def.id}`))}${ready ? '  EVOLVE: FIND AN ELIXIR' : ''}`);
    if (w.ovl) lines.push(`  OVERLOAD: ${w.ovl.name.toUpperCase()}`);
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
