// Check src/data/overloads.js against the rules that keep the overloads distinct and working.
//
//   node tools/checkoverloads.mjs
//
// Every overload: a signature, a three-colour palette, sprite effects that exist, only known
// keys, and mechanics its weapon's behaviour can actually carry. Each weapon's three must have
// three different signatures, and no signature may be used too often across the 234.
// Exits non-zero on any error; warnings are printed but do not fail.

import { fileURLToPath, pathToFileURL } from 'node:url';
import { join, dirname } from 'node:path';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const imp = (p) => import(pathToFileURL(join(ROOT, p)).href);
const { OVERLOADS } = await imp('src/data/overloads.js');
const { WEAPONS } = await imp('src/data/weapons.js');
const { SPRFX } = await imp('src/data/sprfx.js');

const KNOWN = new Set([
  'id', 'tag', 'name', 'color', 'colors', 'desc', 'signature', 'chips',
  'stats', 'pattern', 'volley', 'size', 'grow', 'homing', 'hit', 'kill', 'expire', 'every',
  'zone', 'orbit', 'turret', 'emit', 'link', 'chainFork', 'sweepFull', 'decoy', 'fx', 'dragon', 'move',
  // signatures
  'boomerang', 'orbitOut', 'ricochet', 'erase', 'accel', 'snowball', 'wake', 'mine', 'echo',
  'gravity', 'magnet', 'stacks', 'doom', 'contagion', 'bond', 'charm', 'polarity', 'overkill',
  'freezeAfter', 'thief', 'rod', 'heat', 'tide', 'momentum', 'stillness', 'pinch', 'soul', 'guard',
  'haste', 'warp', 'critBurst', 'metronome', 'gamble',
]);
// Every shared signature and mechanic key -- what a Dragon overload must NOT reuse.
const KNOWN_SHARED = ['pattern', 'size', 'grow', 'homing', 'hit', 'kill', 'expire', 'every', 'zone', 'boomerang',
  'orbitOut', 'ricochet', 'erase', 'accel', 'snowball', 'wake', 'mine', 'echo', 'gravity', 'magnet', 'stacks', 'doom',
  'contagion', 'bond', 'charm', 'polarity', 'overkill', 'freezeAfter', 'thief', 'rod', 'heat', 'tide', 'momentum',
  'stillness', 'pinch', 'soul', 'guard', 'haste', 'warp', 'critBurst', 'metronome', 'gamble'];
// Mechanics that need a shot in flight, and the behaviours that fire one.
const FLIGHT = ['boomerang', 'orbitOut', 'ricochet', 'accel', 'snowball', 'wake', 'gravity'];
const SHOOTERS = new Set(['projectile', 'cone', 'bouncer', 'split', 'charge', 'swarm', 'companion', 'turret', 'orbit', 'sweep']);
const ZONERS = new Set(['nova', 'pull', 'trail', 'aura']);
const DRAGON = ['rage', 'pulseOrb', 'dance', 'rush', 'rake', 'twister', 'rend', 'timelock'];
const FIRES = new Set(['projectile', 'cone', 'bouncer', 'split', 'charge', 'chain', 'tether', 'link', 'rain', 'bloom', 'mine', 'nova', 'sweep', 'trail', ...DRAGON]);
const MAX_USES = 9;

const byId = Object.fromEntries(WEAPONS.map((w) => [w.id, w]));
const mechNames = new Map();
const errors = [], warnings = [];
const uses = {};
let damageMul = 0, count = 0, longest = 0;
const hex = (c) => typeof c === 'string' && /^#[0-9a-f]{6}$/i.test(c);

for (const [wid, list] of Object.entries(OVERLOADS)) {
  const w = byId[wid];
  if (!w) { errors.push(`${wid}: no such weapon`); continue; }
  if (list.length !== 3) errors.push(`${wid}: ${list.length} overloads, not 3`);
  const sigs = new Set();
  for (const o of list) {
    count++;
    const at = `${wid}/${o.id}`;
    for (const k of Object.keys(o)) if (!KNOWN.has(k) && !k.startsWith('_')) errors.push(`${at}: unknown key "${k}"`);
    if (!o.signature) errors.push(`${at}: no signature`);
    else {
      if (sigs.has(o.signature)) errors.push(`${at}: signature "${o.signature}" repeats within ${wid}`);
      sigs.add(o.signature);
      uses[o.signature] = (uses[o.signature] || 0) + 1;
    }
    if (!Array.isArray(o.colors) || o.colors.length !== 3 || !o.colors.every(hex)) errors.push(`${at}: colors must be three hex colours`);
    if (!hex(o.color)) errors.push(`${at}: bad color`);
    const spr = o.fx && o.fx.spr;
    if (!spr) errors.push(`${at}: no fx.spr`);
    else for (const [slot, k] of Object.entries(spr)) {
      if (!['trail', 'hit', 'kill', 'proc'].includes(slot)) errors.push(`${at}: fx.spr slot "${slot}"`);
      if (!SPRFX[k]) errors.push(`${at}: fx.spr.${slot} "${k}" is not an effect`);
    }
    if (o.fx && o.fx.cycle && !o.fx.cycle.every(hex)) errors.push(`${at}: bad cycle colour`);
    const mech = Object.keys(o).filter((k) => KNOWN.has(k) && !['id', 'tag', 'name', 'color', 'colors', 'desc', 'signature', 'chips', 'fx', 'stats'].includes(k));
    if (!mech.length) errors.push(`${at}: stats only`);
    if (o.stats && o.stats.damage) damageMul++;
    for (const k of FLIGHT) if (o[k] && !SHOOTERS.has(w.behavior)) errors.push(`${at}: ${k} needs a shooting weapon, ${wid} is "${w.behavior}"`);
    if (o.erase && !SHOOTERS.has(w.behavior)) errors.push(`${at}: erase needs shots, ${wid} is "${w.behavior}"`);
    if (o.magnet && !SHOOTERS.has(w.behavior) && !ZONERS.has(w.behavior)) errors.push(`${at}: magnet needs shots or zones`);
    if (o.mine && !SHOOTERS.has(w.behavior)) errors.push(`${at}: mine needs shots`);
    if ((o.echo || o.gamble || o.heat) && !FIRES.has(w.behavior)) errors.push(`${at}: ${o.echo ? 'echo' : o.gamble ? 'gamble' : 'heat'} needs a weapon that fires, ${wid} is "${w.behavior}"`);
    if (o.polarity && !SHOOTERS.has(w.behavior) && w.behavior !== 'chain') errors.push(`${at}: polarity needs shots`);
    if (o.zone && !ZONERS.has(w.behavior)) errors.push(`${at}: zone knobs on a "${w.behavior}" weapon`);
    if (o.orbit && w.behavior !== 'orbit') errors.push(`${at}: orbit knobs on a "${w.behavior}" weapon`);
    if (o.turret && w.behavior !== 'turret') errors.push(`${at}: turret knobs on a "${w.behavior}" weapon`);
    if (o.emit && w.behavior !== 'companion') errors.push(`${at}: emit on a "${w.behavior}" weapon`);
    if (o.decoy && w.behavior !== 'decoy') errors.push(`${at}: decoy knobs on a "${w.behavior}" weapon`);
    if (o.dragon && !DRAGON.includes(w.behavior)) errors.push(`${at}: dragon knobs on a "${w.behavior}" weapon`);
    // A reworked weapon (one with an `archetype`) has overloads that are mechanics of their own:
    // one `move` (or the Dragon line's `dragon`) block each, and none of the shared signatures or
    // the plain damage / projectile bumps.
    const block = o.move || o.dragon;
    if (block) for (const k of Object.keys(block)) {
      if (mechNames.has(k)) errors.push(`${at}: mechanic "${k}" is already ${mechNames.get(k)}'s; every mechanic is used once`);
      else mechNames.set(k, o.id);
    }
    if (w.archetype) {
      if (!block || Object.keys(block).length !== 1) errors.push(`${at}: a reworked weapon's overload needs exactly one mechanic of its own`);
      if (o.stats && (o.stats.damage || o.stats.amount)) errors.push(`${at}: may not bump damage or projectiles`);
      for (const k of KNOWN_SHARED) if (o[k]) errors.push(`${at}: "${k}" is a shared signature; a reworked weapon's overloads have their own`);
      if (block && !o.dragon && DRAGON.includes(w.behavior)) errors.push(`${at}: dragon weapons use a dragon block`);
    }
    if (o.freezeAfter && !(o.hit && o.hit.slow) && !w.slow) errors.push(`${at}: freezeAfter but nothing chills`);
    if (o.pattern && !['projectile', 'cone', 'bouncer', 'charge', 'split', 'bloom'].includes(w.behavior)) errors.push(`${at}: pattern on a "${w.behavior}" weapon`);
    if (!o.desc || o.desc.length < 20) errors.push(`${at}: description missing`);
    longest = Math.max(longest, (o.desc || '').length);
    if ((o.desc || '').length > 190) warnings.push(`${at}: description is ${o.desc.length} characters`);
  }
}

// The reworked arsenal: no weapon archetype more than twice, and each with three different
// palettes, a card frame, and something to draw it with (a sheet animation, or a move module).
const GENERIC = new Set(['projectile', 'cone', 'bouncer', 'split', 'charge', 'swarm', 'companion', 'turret', 'orbit',
  'sweep', 'mine', 'bloom', 'rain', 'nova', 'pull', 'trail', 'aura']);
const archetypes = {};
let reworked = 0;
for (const w of WEAPONS) {
  if (!w.archetype) continue;
  reworked++;
  if (!w.hidden) (archetypes[w.archetype] = archetypes[w.archetype] || []).push(w.id);
  if (!w.card) errors.push(`${w.id}: no card frame for its overload cards`);
  // A weapon drawn in its own dedicated art needs no strip: `spriteAlt` (Seed Bomb's two seeds) or
  // `ownArt` (Toxic Spikes' toxic_spike.png).
  if (GENERIC.has(w.behavior) && !w.anim && !w.zoneAnim && !w.emitAnim && !w.spriteAlt && !w.ownArt) errors.push(`${w.id}: a reworked weapon needs a sheet animation (anim / zoneAnim)`);
  const list = OVERLOADS[w.id];
  if (list && new Set(list.map((o) => o.color)).size !== list.length) errors.push(`${w.id}: its overloads share a colour`);
}
for (const [a, ids] of Object.entries(archetypes)) if (ids.length > 2) errors.push(`archetype "${a}" is used ${ids.length} times (${ids.join(', ')}), max 2`);
console.log(`${reworked} reworked weapons, ${Object.keys(archetypes).length} archetypes`);
const over = Object.entries(uses).filter(([, n]) => n > MAX_USES);
for (const [s, n] of over) errors.push(`signature "${s}" used ${n} times (max ${MAX_USES})`);
console.log(`${count} overloads, ${Object.keys(uses).length} signatures, damage x in ${damageMul}, longest description ${longest}`);
console.log(Object.entries(uses).sort((a, b) => b[1] - a[1]).map(([s, n]) => `${s}:${n}`).join('  '));
for (const w of warnings) console.log('warn:', w);
for (const e of errors) console.log('ERROR:', e);
if (errors.length) process.exit(1);
console.log('ok');
