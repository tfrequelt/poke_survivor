// L4 -- may import L0-L3, read-only.
//
// The in-canvas run HUD, drawn in the pixel font so it matches the art. Menus are DOM
// (screens.js); anything that must sit inside the game's pixel grid lives here.

import { G, endLocked } from './state.js';
import { ctx, VW, VH } from './render.js';
import { drawText, drawTextCentered, textWidth, drawSprite } from './sprites.js';
import { formatTime, formatNum, clamp } from './util.js';
import { enemies } from './world.js';
import { panel, messageWindow, wrap, drawDamagePanel } from './win.js';
import { damageBreakdown } from './combat.js';
import { toast } from './successes.js';
import { newSuccessLine, drawEndPortrait } from './ui.js';
import { WEAPON_BY_ID } from './data/weapons.js';
import { bankTotal } from './save.js';
import { floorLabel, floorBonus, endlessBonus } from './floors.js';
import { legend } from './legends.js';
import { RELICS } from './data/legends.js';
import { spriteBase } from './sprites.js';
import { toScreenX, toScreenY } from './render.js';
import { itemSprite } from './pickups.js';
import { BAG_BY_ID, BAG_BY_KIND } from './data/bagitems.js';
import { KIND_KEYS } from './pickups.js';
import { TOTEM_KINDS } from './data/totems.js';
import { activeTrial, fortuneCost } from './totems.js';
import { FORTUNE_USES } from './data/totems.js';
import { waterAtWorld, pondsActive } from './terrain.js';

const PAD = 6;

export function drawHud() {
  drawXpBar();
  drawHealth();
  drawAbilities();
  if (G.sharpOn) drawSharpshoot();
  drawTimer();
  drawTallies();
  drawRelics();
  drawLegendBar();
  drawPortalMarker();
  drawMinimap();
  drawBag();
  drawBuffs();
  drawOverloadStates();
  if (G.banner.t > 0) drawBanner();
  drawStairsPrompt();
  drawBagPrompt();
  drawTrial();
  if (!G.stairs.near && !G.portal.near) drawFortunePrompt();
  drawSuccessToast();
  if (G.runOver) drawRunOver();
}

// --- Overload states ---------------------------------------------------------
//
// Bottom right: one small row per overloaded weapon whose overload keeps a state worth watching --
// heat building to its overheat, a tide's phase, momentum, souls fed, kills toward a guard, a
// pinch that is live. Its weapon's own sprite, a label and a bar in the overload's colour.

function drawOverloadStates() {
  // Stacked above the minimap, which owns the corner.
  let y = VH - MINI - PAD - 12;
  for (let i = G.weapons.length - 1; i >= 0; i--) {
    const w = G.weapons[i];
    const d = w.ovl;
    if (!d) continue;
    let label = '', k = -1, col = d.color;
    if (d.heat) {
      if (w.ventT > 0) { label = 'VENTING'; k = w.ventT / (d.heat.vent || 2); col = '#8a8a96'; }
      else { label = 'HEAT'; k = w.heat / d.heat.max; col = k > 0.75 ? '#ff5a1a' : '#ffb347'; }
    } else if (d.tide) { label = w.tidePh ? 'EBB TIDE' : 'FLOW TIDE'; k = (w.tideT % d.tide.period) / d.tide.period; col = w.tidePh ? '#2276bd' : '#7af0e8'; }
    else if (d.momentum) { label = 'MOMENTUM'; k = w.mom; }
    else if (d.stillness) { label = 'FOCUS'; k = w.mom; }
    else if (d.soul) { label = `SOULS +${Math.round(w.soul * 100)}%`; k = w.soul / d.soul.max; }
    else if (d.guard) { label = G.player && G.player.barrier ? 'GUARD UP' : 'GUARD'; k = G.player && G.player.barrier ? 1 : w.killN / d.guard.kills; }
    else if (d.pinch) {
      const live = G.player && G.stats && G.player.hp < G.stats.maxHp * d.pinch.at;
      if (!live) continue;
      label = 'PINCH!'; k = 1; col = '#ff4a4a';
    } else continue;
    const x = VW - 74;
    ctx.fillStyle = 'rgba(6,10,26,0.6)';
    ctx.fillRect(x - 13, y - 6, 84, 12);
    if (w.def.sprBase >= 0) drawSprite(ctx, w.def.sprBase + 1, x - 6, y + 4);
    drawText(ctx, label, x + 2, y - 4, 'white');
    ctx.fillStyle = '#1a1e30';
    ctx.fillRect(x + 2, y + 3, 64, 2);
    ctx.fillStyle = col;
    ctx.fillRect(x + 2, y + 3, Math.round(64 * Math.max(0, Math.min(1, k))), 2);
    y -= 14;
  }
}

// --- Sharpshoot (Rowlet's line) ----------------------------------------------
//
// Right of the ability slots: a reticle icon, then a bar of bonus crit chance with a notch at 50%
// (where each crit starts to count for half). The fill brightens and a highlight sweeps along it
// every time it grows; at 100% it glows gold.

function drawSharpshoot() {
  const x = PAD + 2 * (SLOT + 4) + 2, y = 40;
  const k = clamp(G.sharp / 100, 0, 1);
  const fresh = G.sharpAt >= 0 ? clamp(1 - (G.clock - G.sharpAt) / 0.35, 0, 1) : 0;
  const full = G.sharp >= 100;

  // Panel.
  ctx.fillStyle = 'rgba(6,10,26,0.72)';
  const W = 22 + textWidth('SHARPSHOOT') + 6 + textWidth('+99.5%') + 4;
  ctx.fillRect(x, y, W, SLOT);
  ctx.strokeStyle = full ? '#ffd166' : '#3a3a55';
  ctx.lineWidth = 1;
  ctx.strokeRect(x + 0.5, y + 0.5, W - 1, SLOT - 1);

  // The icon: a reticle with a leaf-green feather through it, ring brightening on each crit.
  const cx = x + 10, cy = y + 10;
  ctx.strokeStyle = fresh > 0 ? '#ffffff' : (full ? '#ffd166' : '#c8d8a0');
  ctx.beginPath();
  ctx.arc(cx + 0.5, cy + 0.5, 6, 0, Math.PI * 2);
  ctx.stroke();
  ctx.fillStyle = ctx.strokeStyle;
  ctx.fillRect(cx, cy - 8, 1, 3); ctx.fillRect(cx, cy + 6, 1, 3);
  ctx.fillRect(cx - 8, cy, 3, 1); ctx.fillRect(cx + 6, cy, 3, 1);
  ctx.fillStyle = '#7fe08a';
  for (let i = 0; i < 7; i++) ctx.fillRect(cx - 4 + i, cy + 3 - i, 1, 1);
  ctx.fillStyle = '#c4f29a';
  ctx.fillRect(cx + 2, cy - 3, 2, 2);
  ctx.fillStyle = '#ff4a4a';
  ctx.fillRect(cx, cy, 1, 1);

  // Label and value.
  drawText(ctx, 'SHARPSHOOT', x + 21, y + 2, full ? 'gold' : 'white');
  const v = `+${G.sharp % 1 ? G.sharp.toFixed(1) : G.sharp}%`;
  drawText(ctx, v, x + W - 4 - textWidth(v), y + 2, full ? 'gold' : 'green');

  // The bar, with its 50% notch.
  const bx = x + 21, by = y + 12, bw = W - 25, bh = 4;
  ctx.fillStyle = '#141826';
  ctx.fillRect(bx, by, bw, bh);
  const fw = Math.round(bw * k);
  ctx.fillStyle = full ? '#ffd166' : '#5fc06a';
  ctx.fillRect(bx, by, fw, bh);
  ctx.fillStyle = full ? '#fff0a0' : '#a8f0a0';
  ctx.fillRect(bx, by, fw, 1);
  if (fresh > 0 && fw > 2) {
    // A highlight sweeping out to the new edge.
    const hx = bx + Math.round(fw * (1 - fresh));
    ctx.globalAlpha = fresh;
    ctx.fillStyle = '#ffffff';
    ctx.fillRect(Math.max(bx, hx - 3), by, 4, bh);
    ctx.globalAlpha = 1;
  }
  if (full) {
    ctx.globalAlpha = 0.35 + Math.sin(G.clock * 6) * 0.2;
    ctx.fillStyle = '#ffffff';
    ctx.fillRect(bx, by, bw, bh);
    ctx.globalAlpha = 1;
  }
  ctx.fillStyle = '#e8e8f0';
  ctx.fillRect(bx + (bw >> 1), by - 1, 1, bh + 2);
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
  // On a secret floor the clock is stopped, and it says so by not moving -- dimmed, beside a
  // floor number that does not exist.
  drawTextCentered(ctx, formatTime(G.runTime), VW / 2, 9, G.secret ? 'dim' : 'white');
  // Shown from the first floor rather than only once it changes, so the indicator is part of
  // the furniture and a player who has never found the stairs still knows the number exists.
  const f = G.secret ? '??F' : floorLabel();
  drawText(ctx, f, VW / 2 - textWidth(formatTime(G.runTime)) / 2 - textWidth(f) - 8, 9, 'gold');
}

/**
 * The prompt for a staircase the player is standing on.
 *
 * Near the bottom of the screen rather than over the tile: the player's own sprite is on the
 * tile, and a label there would be behind them half the time.
 */
function drawStairsPrompt() {
  if (!G.stairs.near && !G.portal.near) return;
  const msg = G.portal.near
    ? (G.portal.back ? 'PRESS ENTER TO RETURN' : 'PRESS ENTER TO STEP THROUGH')
    : 'PRESS ENTER TO CONTINUE';
  const w = textWidth(msg);
  const x = Math.round((VW - w) / 2), y = VH - 34;
  ctx.fillStyle = 'rgba(8,8,18,0.72)';
  ctx.fillRect(x - 6, y - 4, w + 12, 15);
  drawTextCentered(ctx, msg, VW / 2, y, 'gold');
}

/**
 * The relics carried this run, in a row of their own under the ability slots -- they are not
 * items and take no item slot, so they do not sit with the items.
 */
function drawRelics() {
  const list = G.relics;
  if (!list.length) return;
  const y0 = 40 + 20 + 12;
  for (let i = 0; i < list.length; i++) {
    const r = RELICS[list[i]];
    if (!r) continue;
    const x = PAD + i * 18 + 8;
    ctx.fillStyle = 'rgba(16,16,24,0.6)';
    ctx.fillRect(x - 8, y0 - 8, 16, 16);
    drawSprite(ctx, spriteBase(r.shape, 'gold'), x, y0);
    // Metal Coat greys out while its barrier is down.
    if (list[i] === 'registeel' && G.player && !G.player.barrier) {
      ctx.fillStyle = 'rgba(8,8,18,0.6)';
      ctx.fillRect(x - 8, y0 - 8, 16, 16);
    }
  }
}

/**
 * The legendary's health, across the bottom of the screen with its name -- the one enemy in the
 * game that gets a bar of its own, because it is the one enemy the whole floor is about.
 */
function drawLegendBar() {
  const L = legend, e = L.e;
  if (!L.active || !L.def || !e || L.state === 'dead' || L.state === 'intro') return;
  const w = 260, h = 6, x = Math.round((VW - w) / 2), y = VH - 14;
  const pct = clamp(e.hp / e.maxHp, 0, 1);
  drawTextCentered(ctx, L.def.name.toUpperCase(), VW / 2, y - 11, L.phase === 3 ? 'red' : L.phase === 2 ? 'gold' : 'white');
  ctx.fillStyle = '#101018';
  ctx.fillRect(x - 1, y - 1, w + 2, h + 2);
  ctx.fillStyle = '#3a1418';
  ctx.fillRect(x, y, w, h);
  ctx.fillStyle = L.def.color;
  ctx.fillRect(x, y, Math.round(w * pct), h);
  // Where the fight turns: rage at half, the last stand at a fifth.
  ctx.fillStyle = '#101018';
  ctx.fillRect(x + w / 2, y, 1, h);
  ctx.fillRect(x + Math.round(w * 0.2), y, 1, h);
  // Iron Defense: the bar turns to steel while the guard holds.
  if (L.guardT > 0) {
    ctx.fillStyle = 'rgba(232,238,248,0.55)';
    ctx.fillRect(x, y, Math.round(w * pct), h);
  }
}

/**
 * A portal off the edge of the screen gets a marker on that edge. It is rare and it does not
 * wait -- leave the floor and it is gone -- so unlike the stairs it is worth pointing at.
 */
function drawPortalMarker() {
  const o = G.portal;
  if (o.active && !G.secret) drawEdgeMarker(o.x, o.y, '#a8f0ff');
  // A Luminous Orb shows the way to the stairs too.
  if (G.lumFloor && G.stairs.active) drawEdgeMarker(G.stairs.x, G.stairs.y, '#ffe14a');
  // Totems that still have something to give are always marked.
  if (!G.secret && G.totems) {
    for (const t of G.totems) {
      if (t.state === 'idle' || t.state === 'awake' || t.state === 'trial') drawEdgeMarker(t.x, t.y, TOTEM_KINDS[t.kind].color);
    }
  }
}

/** A pulsing arrow at the screen edge pointing at a world point that is off-screen. */
export function drawEdgeMarker(wx, wy, color) {
  const sx = toScreenX(wx), sy = toScreenY(wy);
  if (sx > 0 && sx < VW && sy > 0 && sy < VH) return;
  const cx = VW / 2, cy = VH / 2;
  const dx = sx - cx, dy = sy - cy;
  const k = Math.min((VW / 2 - 12) / Math.abs(dx || 1), (VH / 2 - 12) / Math.abs(dy || 1));
  const x = cx + dx * k, y = cy + dy * k;
  const a = Math.atan2(dy, dx);
  const pulse = 0.6 + Math.sin(G.clock * 6) * 0.3;
  ctx.globalAlpha = pulse;
  ctx.fillStyle = color;
  ctx.beginPath();
  ctx.moveTo(x + Math.cos(a) * 6, y + Math.sin(a) * 6);
  ctx.lineTo(x + Math.cos(a + 2.4) * 6, y + Math.sin(a + 2.4) * 6);
  ctx.lineTo(x + Math.cos(a - 2.4) * 6, y + Math.sin(a - 2.4) * 6);
  ctx.closePath();
  ctx.fill();
  ctx.globalAlpha = 1;
}

// --- The minimap ---------------------------------------------------------------
//
// Bottom right: the whole floor in a small square -- its ground and ponds, the part you can see,
// and you -- with what the edge arrows point at marked on it: the strange portal, totems that
// still have something to give, the stairs once a Luminous Orb shows them, and any boss.

const MINI = 68;
let miniCanvas = null, miniKey = '';

/** The floor's ground and water, drawn once per floor into a small canvas. */
function miniGround(b, w, h) {
  const key = `${G.seed}:${G.floor}:${G.secret}:${b.minX}:${b.maxX}:${b.minY}:${b.maxY}:${G.stage && G.stage.id}`;
  if (miniCanvas && miniKey === key) return miniCanvas;
  miniKey = key;
  if (!miniCanvas) miniCanvas = document.createElement('canvas');
  miniCanvas.width = w; miniCanvas.height = h;
  const g = miniCanvas.getContext('2d');
  const ground = G.stage && G.stage.ground;
  g.fillStyle = G.secret ? '#1c1830' : (ground && ground.base) || '#2f4a3a';
  g.fillRect(0, 0, w, h);
  if (!G.secret && pondsActive()) {
    g.fillStyle = '#2c6cc0';
    const sx = (b.maxX - b.minX) / w, sy = (b.maxY - b.minY) / h;
    for (let y = 0; y < h; y++) {
      for (let x = 0; x < w; x++) {
        if (waterAtWorld(b.minX + (x + 0.5) * sx, b.minY + (y + 0.5) * sy)) g.fillRect(x, y, 1, 1);
      }
    }
  }
  return miniCanvas;
}

function drawMinimap() {
  const b = G.bounds, p = G.player;
  if (!b || !p || G.runOver) return;
  const bw = b.maxX - b.minX, bh = b.maxY - b.minY;
  // The floor's shape, fitted into the square.
  const k = MINI / Math.max(bw, bh);
  const w = Math.max(8, Math.round(bw * k)), h = Math.max(8, Math.round(bh * k));
  const x0 = VW - PAD - MINI + Math.round((MINI - w) / 2), y0 = VH - PAD - MINI + Math.round((MINI - h) / 2);
  const mx = (wx) => x0 + (wx - b.minX) * k, my = (wy) => y0 + (wy - b.minY) * k;

  ctx.fillStyle = 'rgba(6,10,26,0.75)';
  ctx.fillRect(x0 - 2, y0 - 2, w + 4, h + 4);
  ctx.globalAlpha = 0.8;
  ctx.drawImage(miniGround(b, w, h), x0, y0);
  ctx.globalAlpha = 1;
  ctx.strokeStyle = '#7a8ac8';
  ctx.lineWidth = 1;
  ctx.strokeRect(x0 - 1.5, y0 - 1.5, w + 3, h + 3);

  // What is on screen right now.
  ctx.strokeStyle = 'rgba(255,255,255,0.6)';
  ctx.strokeRect(Math.round(mx(G.cam.x - VW / 2)) + 0.5, Math.round(my(G.cam.y - VH / 2)) + 0.5,
    Math.max(2, Math.round(VW * k)), Math.max(2, Math.round(VH * k)));

  const blink = (Math.sin(G.clock * 6) + 1) * 0.5;
  // Bosses: a red dot that pulses.
  for (let i = 0; i < enemies.length; i++) {
    const e = enemies[i];
    if (!e.alive || !(e.boss || e.legend)) continue;
    miniDot(mx(e.x), my(e.y), 2, blink > 0.5 ? '#ff4a4a' : '#a01818');
  }
  if (!G.secret) {
    // Totems still worth a visit: a diamond in the totem's colour.
    if (G.totems) {
      for (const t of G.totems) {
        if (t.state === 'idle' || t.state === 'awake' || t.state === 'trial') miniDiamond(mx(t.x), my(t.y), TOTEM_KINDS[t.kind].color);
      }
    }
    // The strange portal: a ring that breathes.
    if (G.portal.active) miniRing(mx(G.portal.x), my(G.portal.y), 2 + blink, '#a8f0ff');
    // The stairs, once a Luminous Orb shows the way.
    if (G.lumFloor && G.stairs.active) miniStairs(mx(G.stairs.x), my(G.stairs.y));
  }
  // You: a white arrow toward where you face.
  const px = Math.round(mx(p.x)), py = Math.round(my(p.y));
  ctx.fillStyle = '#101018';
  ctx.fillRect(px - 2, py - 2, 5, 5);
  ctx.fillStyle = '#ffffff';
  ctx.fillRect(px - 1, py - 1, 3, 3);
  const fx = p.dir ? 1 : -1;
  ctx.fillRect(px + fx * 2, py, 1, 1);
}

function miniDot(x, y, r, color) {
  ctx.fillStyle = '#101018';
  ctx.fillRect(Math.round(x) - r - 1, Math.round(y) - r - 1, r * 2 + 2, r * 2 + 2);
  ctx.fillStyle = color;
  ctx.fillRect(Math.round(x) - r, Math.round(y) - r, r * 2, r * 2);
}

function miniDiamond(x, y, color) {
  x = Math.round(x); y = Math.round(y);
  ctx.fillStyle = '#101018';
  ctx.fillRect(x - 1, y - 3, 3, 7); ctx.fillRect(x - 3, y - 1, 7, 3);
  ctx.fillStyle = color;
  ctx.fillRect(x, y - 2, 1, 5); ctx.fillRect(x - 2, y, 5, 1); ctx.fillRect(x - 1, y - 1, 3, 3);
}

function miniRing(x, y, r, color) {
  ctx.strokeStyle = '#101018';
  ctx.lineWidth = 3;
  ctx.beginPath(); ctx.arc(Math.round(x) + 0.5, Math.round(y) + 0.5, r, 0, Math.PI * 2); ctx.stroke();
  ctx.strokeStyle = color;
  ctx.lineWidth = 1;
  ctx.beginPath(); ctx.arc(Math.round(x) + 0.5, Math.round(y) + 0.5, r, 0, Math.PI * 2); ctx.stroke();
}

function miniStairs(x, y) {
  x = Math.round(x); y = Math.round(y);
  ctx.fillStyle = '#101018';
  ctx.fillRect(x - 3, y - 3, 7, 7);
  ctx.fillStyle = '#ffe14a';
  ctx.fillRect(x - 2, y + 1, 5, 1); ctx.fillRect(x - 1, y - 1, 4, 1); ctx.fillRect(x, y - 2, 2, 1);
}

// --- The Explorer's Bag --------------------------------------------------------
//
// Bottom left, out of the way of everything else: one slot per bag space, each with its key and
// the item in it. The Reviver Seed is marked AUTO, because it is the one you never press.

const BAG_Y = VH - 26;

function drawBag() {
  if (!G.bag || !G.bag.length) return;
  for (let i = 0; i < G.bag.length; i++) {
    const x = PAD + i * (SLOT + 4), y = BAG_Y;
    const id = G.bag[i];
    ctx.fillStyle = id ? '#101018' : 'rgba(16,16,24,0.55)';
    ctx.fillRect(x, y, SLOT, SLOT);
    if (id) {
      const def = BAG_BY_ID[id];
      const spr = itemSprite(def.kind);
      if (spr >= 0) drawSprite(ctx, spr, x + SLOT / 2, y + SLOT / 2);
      ctx.strokeStyle = def.color;
    } else {
      ctx.strokeStyle = '#2e2e44';
    }
    ctx.lineWidth = 1;
    ctx.strokeRect(x + 0.5, y + 0.5, SLOT - 1, SLOT - 1);
    drawText(ctx, String(i + 1), x + 2, y + 2, id ? 'white' : 'dim');
    if (id && BAG_BY_ID[id].auto) drawText(ctx, 'A', x + SLOT - 7, y + SLOT - 8, 'gold');
  }
}

/** The timed buffs on you, stacked above the bag: a name and a bar that runs down. */
function drawBuffs() {
  if (!G.buffs || !G.buffs.length) return;
  let y = BAG_Y - 12;
  for (const b of G.buffs) {
    const w = 84;
    ctx.fillStyle = 'rgba(8,8,18,0.7)';
    ctx.fillRect(PAD, y, w, 10);
    ctx.fillStyle = b.color;
    ctx.fillRect(PAD + 1, y + 8, Math.round((w - 2) * clamp(b.t / b.max, 0, 1)), 1);
    drawText(ctx, `${b.name} ${Math.ceil(b.t)}`, PAD + 3, y + 1, b.curse ? 'red' : 'white');
    y -= 12;
  }
}

/** A trial in progress: the clock and what is left, under the timer. */
function drawTrial() {
  const t = activeTrial();
  if (!t || G.secret) return;
  const msg = `TRIAL ${Math.max(0, Math.ceil(t.t))}s -- ${t.uses} ELITE${t.uses === 1 ? '' : 'S'} LEFT`;
  const w = textWidth(msg);
  ctx.fillStyle = 'rgba(40,8,8,0.75)';
  ctx.fillRect(Math.round((VW - w) / 2) - 6, 22, w + 12, 13);
  drawTextCentered(ctx, msg, VW / 2, 25, 'red');
}

/** At an awake Fortune totem: what an offering costs. */
function drawFortunePrompt() {
  const t = G.fortuneNear;
  if (!t || t.state !== 'awake') return;
  const left = FORTUNE_USES - t.uses;
  const msg = `ENTER: OFFER ${fortuneCost(t)} GOLD (${left} LEFT)`;
  const w = textWidth(msg);
  const x = Math.round((VW - w) / 2), y = VH - 34;
  ctx.fillStyle = 'rgba(8,8,18,0.72)';
  ctx.fillRect(x - 6, y - 4, w + 12, 15);
  drawTextCentered(ctx, msg, VW / 2, y, 'gold');
}

/** Standing on a bag item with no room for it: how to swap. */
function drawBagPrompt() {
  const it = G.bagOver;
  if (!it || !it.alive) return;
  const def = BAG_BY_KIND[KIND_KEYS[it.kind]];
  if (!def) return;
  const msg = `BAG FULL - PRESS 1-${G.bag.length} TO SWAP FOR ${def.name.toUpperCase()}`;
  const w = textWidth(msg);
  const x = Math.round((VW - w) / 2), y = VH - (G.stairs.near || G.portal.near ? 50 : 34);
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
    // Blank while the screen is still ignoring keys, so it never offers what it will not do.
    endLocked() ? '' : 'R RESTART    Q CHANGE PARTNER',
  ], { center: true, accent: G.won ? '#ffd166' : '#ff9f9f', lineHeight: 11 });
  // The partner's face beside the result: one of its sad portraits (picked when it fainted).
  drawEndPortrait(x - 92, y + 2, G.won ? '#ffd166' : '#ff9f9f');

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
    `K +100 enemies  L level up  T +60s  G god  H hitboxes  O portal  R restart`,
  ];
}
