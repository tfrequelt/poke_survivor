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

const PAD = 6;

export function drawHud() {
  drawXpBar();
  drawHealth();
  drawAbilities();
  drawTimer();
  drawTallies();
  drawRelics();
  drawLegendBar();
  drawPortalMarker();
  drawBag();
  drawBuffs();
  if (G.banner.t > 0) drawBanner();
  drawStairsPrompt();
  drawBagPrompt();
  drawTrial();
  if (!G.stairs.near && !G.portal.near) drawFortunePrompt();
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
    `K +100 enemies  L level up  T +60s  G god  H hitboxes  O portal  R restart`,
  ];
}
