// L2 -- may import L0-L1. Holds only the registry; the mechanics themselves live in moves/*.js.
//
// Overload mechanics. An overload names its mechanic in a `move` block -- `move: { tideline: {...} }`
// -- and the type module that owns it registers what the mechanic does at each moment of a
// weapon's life. overload.js and weapons.js call these hooks where they used to run the shared
// signature vocabulary, so a mechanic can be anything at all rather than a combination of stock
// parts. Every hook is optional, and each receives the overload's own numbers as `cfg`:
//
//   spawn(pr, w, cfg)               a shot of the weapon has just been fired (look, flags)
//   shot(pr, rec, dt, cfg)          every frame of that shot's flight; return true to end it
//   expire(pr, rec, cfg)            the shot has ended (spent, landed or timed out)
//   lay(z, w, st, cfg)              the weapon has just laid a zone (trail, nova, vortex)
//   zone(z, rec, dt, cfg)           every frame of such a zone
//   fire(w, st, p, cfg, rec)        after every successful trigger pull
//   tick(w, dt, p, cfg, rec)        every frame, for the weapon's own clocks
//   hit(e, dealt, rec, crit, cfg)   a hit landed under the weapon's damage source
//   kill(e, rec, cfg)               the killing blow came from it

export const MECHS = Object.create(null);

export function registerMech(name, hooks) {
  if (MECHS[name]) throw new Error(`mechs: "${name}" registered twice`);
  MECHS[name] = hooks;
}

const NONE = [];

/**
 * An overload's mechanics as [{ name, cfg, h }], worked out once per overload. Unknown names are
 * skipped (a type module not loaded yet is a boot-order bug, caught by the probes, not a crash).
 */
export function mechsOf(ov) {
  if (!ov) return NONE;
  if (ov._mx !== undefined) return ov._mx;
  const out = [];
  const src = ov.move;
  if (src) for (const k of Object.keys(src)) if (MECHS[k]) out.push({ name: k, cfg: src[k], h: MECHS[k] });
  ov._mx = out.length ? out : NONE;
  // Which moments it cares about, so the hot paths ask one flag rather than walk the list.
  ov._mxShot = out.some((m) => m.h.shot);
  ov._mxSpawn = out.some((m) => m.h.spawn);
  ov._mxExpire = out.some((m) => m.h.expire);
  ov._mxZone = out.some((m) => m.h.zone);
  return ov._mx;
}
