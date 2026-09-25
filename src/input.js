// L1 -- may import L0.
//
// Keyboard state, and the action bindings every system asks about instead of comparing raw key
// codes.
//
// The indirection exists so keys can be rebound. Each action has exactly ONE bindable code plus
// fixed aliases that cannot be changed: the arrow keys always move, Enter always confirms and
// Escape always backs out, so a player who binds themselves into a corner can always reach the
// settings screen and undo it.

const down = new Set();        // currently held
const pressed = new Set();     // went down since the last endFrame()
const released = new Set();    // went up since the last endFrame()

let anyKeyFlag = false;
const listeners = [];

/**
 * Everything that can be rebound, in the order the settings screen lists it.
 *
 * `group` is what a binding conflicts within. Reroll, banish and skip only exist while the
 * level-up modal is open, so they may safely share a key with something used in play -- and by
 * default reroll does share R with restart, and skip shares S with move-down.
 */
export const BINDABLE = [
  { id: 'up', label: 'MOVE UP', def: 'KeyW', alias: ['ArrowUp'], group: 'play' },
  { id: 'down', label: 'MOVE DOWN', def: 'KeyS', alias: ['ArrowDown'], group: 'play' },
  { id: 'left', label: 'MOVE LEFT', def: 'KeyA', alias: ['ArrowLeft'], group: 'play' },
  { id: 'right', label: 'MOVE RIGHT', def: 'KeyD', alias: ['ArrowRight'], group: 'play' },
  { id: 'ability1', label: 'ABILITY 1', def: 'KeyQ', alias: [], group: 'play' },
  { id: 'ability2', label: 'ABILITY 2', def: 'KeyE', alias: [], group: 'play' },
  { id: 'pause', label: 'PAUSE', def: 'Escape', alias: ['KeyP'], group: 'play' },
  { id: 'restart', label: 'RESTART RUN', def: 'KeyR', alias: [], group: 'play' },
  { id: 'mute', label: 'MUTE', def: 'KeyM', alias: [], group: 'play' },
  { id: 'fullscreen', label: 'FULLSCREEN', def: 'KeyF', alias: [], group: 'play' },
  { id: 'reroll', label: 'REROLL CARD', def: 'KeyR', alias: [], group: 'levelup' },
  { id: 'banish', label: 'BANISH CARD', def: 'KeyB', alias: [], group: 'levelup' },
  { id: 'skip', label: 'SKIP LEVEL UP', def: 'KeyS', alias: [], group: 'levelup' },
];

const BY_ID = Object.fromEntries(BINDABLE.map((b) => [b.id, b]));

/** action id -> the single bound code. Aliases are not stored; they never change. */
export const bindings = {};
for (const b of BINDABLE) bindings[b.id] = b.def;

/** True if `code` triggers `action`, counting its fixed aliases. */
export function isAction(code, action) {
  if (bindings[action] === code) return true;
  const b = BY_ID[action];
  return !!b && b.alias.indexOf(code) >= 0;
}

/**
 * Rebind an action.
 *
 * If another action in the same group already holds the key they SWAP, rather than the other
 * being left unbound -- an action with no key at all is a dead end the player cannot see.
 * Returns the id of the action that was swapped, or null.
 */
export function bindAction(action, code) {
  const b = BY_ID[action];
  if (!b || !code) return null;
  const old = bindings[action];
  let swapped = null;
  for (const other of BINDABLE) {
    if (other.id !== action && other.group === b.group && bindings[other.id] === code) {
      bindings[other.id] = old;
      swapped = other.id;
    }
  }
  bindings[action] = code;
  return swapped;
}

export function resetBindings() {
  for (const b of BINDABLE) bindings[b.id] = b.def;
}

/** Bindings as a plain object, for saving. Unknown ids are ignored on the way back in. */
export const bindingsSnapshot = () => ({ ...bindings });
export function restoreBindings(saved) {
  if (!saved) return;
  for (const b of BINDABLE) if (typeof saved[b.id] === 'string') bindings[b.id] = saved[b.id];
}

/** 'KeyW' -> 'W', 'ArrowUp' -> 'UP', 'BracketRight' -> 'BRACKETRIGHT'. For the settings screen. */
export function keyLabel(code) {
  if (!code) return '--';
  if (code.startsWith('Key')) return code.slice(3);
  if (code.startsWith('Digit')) return code.slice(5);
  if (code.startsWith('Arrow')) return code.slice(5).toUpperCase();
  if (code === 'Escape') return 'ESC';
  if (code === 'Space') return 'SPACE';
  return code.toUpperCase();
}

// Keys the browser would otherwise act on (scrolling, quick-find) while playing.
const SWALLOW = new Set([
  'ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown',
  'Space', 'Tab', 'Slash', 'Quote', 'Backspace',
]);

export function initInput(target = window) {
  target.addEventListener('keydown', (e) => {
    if (e.repeat) {
      if (SWALLOW.has(e.code)) e.preventDefault();
      return;
    }
    if (SWALLOW.has(e.code)) e.preventDefault();
    down.add(e.code);
    pressed.add(e.code);
    anyKeyFlag = true;
    for (const fn of listeners) fn(e.code, e);
  });

  target.addEventListener('keyup', (e) => {
    down.delete(e.code);
    released.add(e.code);
  });

  // Losing focus mid-key leaves a phantom held key that walks the player into a wall forever.
  target.addEventListener('blur', clearAll);
  document.addEventListener('visibilitychange', () => {
    if (document.hidden) clearAll();
  });
}

function clearAll() {
  down.clear();
  pressed.clear();
  released.clear();
}

/** Subscribe to raw key-down events (menus, debug hotkeys). Returns an unsubscribe function. */
export function onKey(fn) {
  listeners.push(fn);
  return () => {
    const i = listeners.indexOf(fn);
    if (i >= 0) listeners.splice(i, 1);
  };
}

export const isDown = (code) => down.has(code);
export const wasPressed = (code) => pressed.has(code);
export const wasReleased = (code) => released.has(code);
export const anyOf = (codes) => codes.some((c) => down.has(c));
export const anyPressed = (codes) => codes.some((c) => pressed.has(c));

/** Is any key bound to this action currently held? */
function actionDown(action) {
  if (down.has(bindings[action])) return true;
  const b = BY_ID[action];
  if (b) for (const a of b.alias) if (down.has(a)) return true;
  return false;
}

/** True exactly once per key-down, for "press any key to start". */
export function consumeAnyKey() {
  const v = anyKeyFlag;
  anyKeyFlag = false;
  return v;
}

/** Normalised movement vector. Diagonals do not grant extra speed. */
const _axis = { x: 0, y: 0 };
export function moveAxis() {
  let x = (actionDown('right') ? 1 : 0) - (actionDown('left') ? 1 : 0);
  let y = (actionDown('down') ? 1 : 0) - (actionDown('up') ? 1 : 0);
  if (x !== 0 && y !== 0) {
    const inv = Math.SQRT1_2;
    x *= inv; y *= inv;
  }
  _axis.x = x; _axis.y = y;
  return _axis;
}

/** Called by main.js at the very end of each frame, after every system has polled edges. */
export function endFrame() {
  pressed.clear();
  released.clear();
  anyKeyFlag = false;
}
