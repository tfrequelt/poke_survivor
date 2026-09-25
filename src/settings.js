// L2 -- may import L0-L1.
//
// The only thing this project persists.
//
// Everything else about a run is deliberately derived or thrown away, but volume and key
// bindings are the player's, not the game's, and losing them on every reload would be actively
// hostile. One localStorage key holds both.
//
// Every read and write is wrapped: storage throws in a private window, and can come back empty
// or corrupt at any time. A failure here must cost the player their preferences, never the game.

import { setVolume, settings as audioSettings } from './audio.js';
import { bindingsSnapshot, restoreBindings } from './input.js';

const KEY = 'pokesurvivor.settings.v1';

export function saveSettings() {
  try {
    localStorage.setItem(KEY, JSON.stringify({
      music: audioSettings.music,
      sfx: audioSettings.sfx,
      muted: audioSettings.muted,
      bindings: bindingsSnapshot(),
    }));
    return true;
  } catch {
    return false;                    // blocked or full; the session keeps its settings anyway
  }
}

export function loadSettings() {
  let data = null;
  try {
    data = JSON.parse(localStorage.getItem(KEY) || 'null');
  } catch {
    data = null;
  }
  if (!data || typeof data !== 'object') return false;

  // setVolume clamps and pushes to the buses, so a corrupt value cannot deafen anyone.
  if (typeof data.music === 'number') setVolume('music', data.music);
  if (typeof data.sfx === 'number') setVolume('sfx', data.sfx);
  if (typeof data.muted === 'boolean') audioSettings.muted = data.muted;
  restoreBindings(data.bindings);
  return true;
}
