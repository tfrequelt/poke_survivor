// L4 -- may import L0-L3, read-only.
//
// The in-canvas run HUD, drawn in the pixel font so it matches the art. Menus are DOM
// (screens.js); anything that must sit inside the game's pixel grid lives here.

import { G } from './state.js';
import { ctx, VW, VH } from './render.js';
import { drawText, drawTextCentered, textWidth, drawSprite } from './sprites.js';
import { formatTime, formatNum, clamp } from './util.js';
import { enemies } from './world.js';
import { panel, messageWindow, wrap, drawDamagePanel } from './win.js';
import { damageBreakdown } from './combat.js';
import { toast } from './successes.js';
import { newSuccessLine } from './ui.js';
import { WEAPON_BY_ID } from './data/weapons.js';
import { bankTotal } from './save.js';
import { floorLabel, floorBonus, endlessBonus } from './floors.js';

const PAD = 6;

export function drawHud() {
  drawXpBar();
  drawHealth();
  drawAbilities();
  drawTimer();
  drawTallies();
  if (G.banner.t > 0) drawBanner();
  drawStairsPrompt();
  drawSuccessToast();
  if (G.runOver) drawRunOver();
}

// --- Ability slots ----------------------------------------------------------

const SLOT = 20;
const SLOT_KEYS = ['Q', 'E'];

/**
 * Two slots under the health bar. Each shows its icon, its key, and a dark overlay that drains
 * away as the cooldown recharges -- so readiness is legible at a glance without reading a number.
 */
function drawAbilities() {
  const x0 = PAD, y0 = 40;

  for (let i = 0; i < 2; i++) {
    const a = G.abilities[i];
    const x = x0 + i * (SLOT + 4);

    if (!a) {
      // Empty slot: a dim outline, so the player can see there IS a second slot to unlock.
      ctx.strokeStyle = '#2e2e44';
      ctx.lineWidth = 1;
      ctx.strokeRect(x + 0.5, y0 + 0.5, SLOT - 1, SLOT - 1);
      drawText(ctx, SLOT_KEYS[i], x + 2, y0 + SLOT - 8, 'dim');
      continue;
    }

    const ready = a.cd <= 0;
    const frac = ready ? 0 : clamp(a.cd / a.cdMax, 0, 1);

    ctx.fillStyle = '#101018';
    ctx.fillRect(x, y0, SLOT, SLOT);
    drawSprite(ctx, a.def.iconBase, x + SLOT / 2, y0 + SLOT / 2);

    // Cooldown drains from the top down.
    if (frac > 0) {
      ctx.fillStyle = 'rgba(8,8,18,0.72)';
      ctx.fillRect(x, y0, SLOT, Math.ceil(SLOT * frac));
    }

    // Ready slots pulse; recharging ones stay flat and dim.
    if (ready) {
      const pulse = (Math.sin(G.tick * 0.12) + 1) * 0.5;
      ctx.strokeStyle = pulse > 0.5 ? '#ffffff' : '#7ac8ff';
    } else {
      ctx.strokeStyle = '#3a3a55';
    }
    ctx.lineWidth = 1;
    ctx.strokeRect(x + 0.5, y0 + 0.5, SLOT - 1, SLOT - 1);

    drawText(ctx, SLOT_KEYS[i], x + 2, y0 + SLOT - 8, ready ? 'white' : 'dim');
    // Both numbers are right-aligned off the slot edge; a two-digit cooldown left-aligned at a
    // fixed offset overflows the 20px box and lands on top of the icon.
    if (a.level > 1) {
      const lv = String(a.level);
      drawText(ctx, lv, x + SLOT - 2 - textWidth(lv), y0 + SLOT - 8, 'gold');
    }
    if (!ready && a.cd > 1) {
      const cd = String(Math.ceil(a.cd));
      drawText(ctx, cd, x + SLOT - 2 - textWidth(cd), y0 + 2, 'white');
    }
  }
}

/**
 * Short centred announcement -- awakenings, stage name, pickups -- in a Mystery Dungeon message
 * window. Fades in and out, and sizes itself to the text rather than spanning the whole screen.
 */
function drawBanner() {
  const b = G.banner;
  const k = Math.min(1, b.t / 0.4) * Math.min(1, (3.0 - b.t) / 0.25);
  const lines = [b.text.toUpperCase()];
  if (b.sub) for (const line of wrap(b.sub, 40)) lines.push(line);

  let widest = 0;
  for (const line of lines) widest = Math.max(widest, textWidth(line));
  const w = Math.min(VW - 24, widest + 28);
  const x = Math.round((VW - w) / 2);
  const y = 70;

  ctx.globalAlpha = Math.max(0, Math.min(1, k));
  const h = Math.max(24, lines.length * 10 + 11);
  panel(x, y, w, h, { accent: '#ffd166' });
  let ty = y + 6;
  for (let i = 0; i < lines.length; i++) {
    drawTextCentered(ctx, lines[i], VW / 2, ty, i === 0 ? 'gold' : 'white');
    ty += 10;
  }
  ctx.globalAlpha = 1;
}

/** XP across the very top -- the bar the player watches most, so it gets the widest real estate. */
function drawXpBar() {
  const h = 5;
  const pct = clamp(G.xp / G.xpNext, 0, 1);
  ctx.fillStyle = '#101018';
  ctx.fillRect(0, 0, VW, h);
  ctx.fillStyle = '#4ae0a0';
  ctx.fillRect(0, 0, VW * pct, h - 1);
  ctx.fillStyle = '#c0ffe0';
  ctx.fillRect(0, h - 1, VW * pct, 1);

  const label = `LV ${G.level}`;
  drawText(ctx, label, PAD, h + 3, 'white');
}

function drawHealth() {
  const p = G.player;
  if (!p) return;
  const s = G.stats;
  const w = 74, h = 6, x = PAD, y = 20;
  const pct = clamp(p.hp / s.maxHp, 0, 1);

  ctx.fillStyle = '#101018';
  ctx.fillRect(x - 1, y - 1, w + 2, h + 2);
  ctx.fillStyle = '#3a1418';
  ctx.fillRect(x, y, w, h);
  // Green until it gets dangerous, then red -- readable at a glance without reading numbers.
  ctx.fillStyle = pct > 0.5 ? '#7fe08a' : pct > 0.25 ? '#ffd166' : '#ff6b6b';
  ctx.fillRect(x, y, w * pct, h);

  drawText(ctx, `${Math.ceil(p.hp)}/${s.maxHp}`, x + 1, y + h + 3, 'dim');
}

function drawTimer() {
  drawTextCentered(ctx, formatTime(G.runTime), VW / 2, 9, 'white');
  // Shown from the first floor rather than only once it changes, so the indicator is part of
  // the furniture and a player who has never found the stairs still knows the number exists.
  const f = floorLabel();
  drawText(ctx, f, VW / 2 - textWidth(formatTime(G.runTime)) / 2 - textWidth(f) - 8, 9, 'gold');
}

/**
 * The prompt for a staircase the player is standing on.
 *
 * Near the bottom of the screen rather than over the tile: the player's own sprite is on the
 * tile, and a label there would be behind them half the time.
 */
function drawStairsPrompt() {
  if (!G.stairs.near) return;
  const msg = 'PRESS ENTER TO CONTINUE';
  const w = textWidth(msg);
  const x = Math.round((VW - w) / 2), y = VH - 34;
  ctx.fillStyle = 'rgba(8,8,18,0.72)';
  ctx.fillRect(x - 6, y - 4, w + 12, 15);
  drawTextCentered(ctx, msg, VW / 2, y, 'gold');
}

function drawTallies() {
  const rows = [
    [`${formatNum(G.kills)}`, 'white'],
    [`${formatNum(G.coins)}G`, 'gold'],
  ];
  let y = 10;
  for (const [text, color] of rows) {
    drawText(ctx, text, VW - PAD - textWidth(text), y, color);
    y += 10;
  }
}

function drawRunOver() {
  ctx.fillStyle = 'rgba(8,8,18,0.72)';
  ctx.fillRect(0, 0, VW, VH);
  const w = 264, x = Math.round((VW - w) / 2), y = Math.round(VH / 2) - 42;
  messageWindow(x, y, w, [
    G.endless ? `ENDLESS OVER -- ${G.endlessBosses} BOSS${G.endlessBosses === 1 ? '' : 'ES'}` : G.won ? 'VICTORY!' : 'YOU FAINTED...',
    '',
    `SURVIVED ${formatTime(G.runTime)}`,
    `LEVEL ${G.level}   ${formatNum(G.kills)} KO`,
    `+${formatNum(G.coins + (G.won ? floorBonus() + endlessBonus() : 0))} GOLD   BANK ${formatNum(bankTotal())}`,
    '',
    'R RESTART    Q CHANGE PARTNER',
  ], { center: true, accent: G.won ? '#ffd166' : '#ff9f9f', lineHeight: 11 });

  // What did the work, under the result. Five rows: the death screen shares the view with the
  // field behind it, and the full list is on the victory screen.
  const typeOf = (k) => (k.startsWith('w:') && WEAPON_BY_ID[k.slice(2)] ? WEAPON_BY_ID[k.slice(2)].type : null);
  const ph = drawDamagePanel(x, y + 96, w, damageBreakdown(), typeOf, 5);
  const ns = newSuccessLine();
  if (ns) drawTextCentered(ctx, ns, VW / 2, y + 102 + ph, 'gold');
}

/**
 * "SUCCESS UNLOCKED" -- top right, under the gold tally, for a few seconds.
 *
 * Its own slot rather than G.banner: floors, traps, evolutions and bosses all write the banner,
 * and an unlock is exactly the kind of thing that happens in the middle of all of those.
 */
function drawSuccessToast() {
  if (!toast.queue.length) return;
  const title = toast.queue[0].toUpperCase();
  const w = Math.max(textWidth('SUCCESS UNLOCKED'), textWidth(title)) + 20;
  const x = VW - PAD - w, y = 34;
  // Slides in over its first quarter second.
  const enter = Math.min(1, (3.2 - toast.t) / 0.25);
  const sx = Math.round(x + (1 - enter) * (w + PAD));
  panel(sx, y, w, 30, { accent: '#ffd166' });
  drawText(ctx, 'SUCCESS UNLOCKED', sx + 10, y + 7, 'gold');
  drawText(ctx, title, sx + 10, y + 17, 'white');
}

/** Dev overlay drawn in-canvas (the outer one in render.js is native-resolution text). */
export function debugLines(fps, frameMs, simMs, drawMs, counts) {
  const c = G.curve || { m: 0, cap: 0, sps: 0, hp: 1 };
  return [
    `fps ${fps.toFixed(0)}  frame ${frameMs.toFixed(2)}  sim ${simMs.toFixed(2)}  draw ${drawMs.toFixed(2)}`,
    `enemies ${counts.enemies}/${c.cap | 0}  proj ${counts.proj}  orbs ${counts.orbs}  fx ${counts.fx}`,
    `t ${formatTime(G.runTime)}  min ${c.m.toFixed(2)}  sps ${c.sps.toFixed(1)}  hpx ${c.hp.toFixed(2)}`,
    `lv ${G.level}  xp ${G.xp | 0}/${G.xpNext}  kills ${G.kills}  seed ${G.seed}`,
    `K +100 enemies  L level up  T +60s  G god  H hitboxes  R restart`,
  ];
}
