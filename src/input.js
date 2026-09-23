// L1 -- may import L0 (util, state, data).

const down = new Set();        // currently held
const pressed = new Set();     // went down since the last endFrame()
const released = new Set();    // went up since the last endFrame()

let anyKeyFlag = false;
const listeners = [];

// Movement is polled from both WASD and the arrow keys.
const LEFT  = ['KeyA', 'ArrowLeft'];
const RIGHT = ['KeyD', 'ArrowRight'];
const UP    = ['KeyW', 'ArrowUp'];
const DOWN  = ['KeyS', 'ArrowDown'];

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

/** True exactly once per key-down, for "press any key to start". */
export function consumeAnyKey() {
  const v = anyKeyFlag;
  anyKeyFlag = false;
  return v;
}

/** Normalised movement vector. Diagonals do not grant extra speed. */
const _axis = { x: 0, y: 0 };
export function moveAxis() {
  let x = (anyOf(RIGHT) ? 1 : 0) - (anyOf(LEFT) ? 1 : 0);
  let y = (anyOf(DOWN) ? 1 : 0) - (anyOf(UP) ? 1 : 0);
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
