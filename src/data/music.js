// L0 -- pure data. Chiptune note data and SFX definitions.
//
// Tracks are step sequences of 16th notes. A value is a MIDI note number, 0 is a rest, and a
// negative value holds the previous note for another step. Everything is synthesised at runtime,
// so there are no audio files and the music can react to the game (parts layer in as the run
// escalates).
//
// Original compositions in the GBA route-music idiom: bright major keys, a walking bass, and a
// melody that sits on the pentatonic so it never sounds wrong against the harmony.

const _ = 0;      // rest
const H = -1;     // hold the previous note

/** Title: unhurried, wistful, sits on a I-V-vi-IV loop. */
export const TITLE = {
  bpm: 104,
  steps: 64,
  parts: [
    {
      id: 'lead', wave: 'pulse25', gain: 0.17, attack: 0.01, release: 0.12, layer: 0,
      seq: [
        76, H, H, _, 79, H, _, _, 81, H, H, H, 79, H, _, _,
        76, H, H, _, 72, H, _, _, 74, H, H, H, _, _, _, _,
        69, H, H, _, 72, H, _, _, 76, H, H, H, 74, H, _, _,
        72, H, H, H, 69, H, H, H, _, _, _, _, _, _, _, _,
      ],
    },
    {
      id: 'bass', wave: 'triangle', gain: 0.22, attack: 0.005, release: 0.08, layer: 0,
      seq: [
        45, _, 52, _, 45, _, 52, _, 40, _, 47, _, 40, _, 47, _,
        41, _, 48, _, 41, _, 48, _, 43, _, 50, _, 43, _, 50, _,
        45, _, 52, _, 45, _, 52, _, 40, _, 47, _, 40, _, 47, _,
        41, _, 48, _, 43, _, 50, _, 45, _, 52, _, 45, _, 52, _,
      ],
    },
  ],
};

/**
 * Route: the in-run loop. Parts carry a `layer` and are muted until the run reaches that
 * intensity, so the track thickens as the spawn curve ramps rather than looping identically
 * for twenty minutes.
 */
export const ROUTE = {
  bpm: 148,
  steps: 64,
  parts: [
    {
      id: 'bass', wave: 'triangle', gain: 0.24, attack: 0.004, release: 0.06, layer: 0,
      seq: [
        40, _, 40, _, 47, _, 40, _, 40, _, 40, _, 47, _, 45, _,
        38, _, 38, _, 45, _, 38, _, 38, _, 38, _, 45, _, 43, _,
        36, _, 36, _, 43, _, 36, _, 36, _, 36, _, 43, _, 41, _,
        43, _, 43, _, 50, _, 43, _, 45, _, 45, _, 52, _, 47, _,
      ],
    },
    {
      id: 'lead', wave: 'pulse50', gain: 0.15, attack: 0.005, release: 0.07, layer: 0,
      seq: [
        76, _, 79, _, 81, _, 79, _, 76, _, 72, _, 74, _, _, _,
        74, _, 77, _, 79, _, 77, _, 74, _, 71, _, 72, _, _, _,
        72, _, 76, _, 79, _, 76, _, 72, _, 69, _, 71, _, _, _,
        71, _, 74, _, 76, _, 79, _, 81, _, 83, _, 84, H, H, _,
      ],
    },
    {
      id: 'arp', wave: 'pulse12', gain: 0.09, attack: 0.002, release: 0.04, layer: 1,
      seq: [
        64, 68, 71, 68, 64, 68, 71, 68, 64, 67, 71, 67, 64, 67, 71, 67,
        62, 65, 69, 65, 62, 65, 69, 65, 62, 66, 69, 66, 62, 66, 69, 66,
        60, 64, 67, 64, 60, 64, 67, 64, 60, 64, 67, 64, 60, 64, 67, 64,
        62, 67, 71, 67, 62, 67, 71, 67, 64, 69, 72, 69, 64, 69, 72, 69,
      ],
    },
    {
      id: 'counter', wave: 'pulse25', gain: 0.11, attack: 0.004, release: 0.05, layer: 2,
      seq: [
        _, _, 88, _, _, _, 86, _, _, _, 84, _, _, _, 83, _,
        _, _, 86, _, _, _, 84, _, _, _, 83, _, _, _, 81, _,
        _, _, 84, _, _, _, 83, _, _, _, 81, _, _, _, 79, _,
        _, _, 83, _, _, _, 86, _, _, _, 88, _, _, _, 91, _,
      ],
    },
  ],
  drums: [
    // kick, snare, hat -- a driving 4-on-the-floor with offbeat hats.
    { id: 'kick', type: 'kick', layer: 0, seq: [1,_,_,_, _,_,_,_, 1,_,_,_, _,_,1,_, 1,_,_,_, _,_,_,_, 1,_,_,_, _,_,1,_, 1,_,_,_, _,_,_,_, 1,_,_,_, _,_,1,_, 1,_,_,_, _,_,_,_, 1,_,1,_, 1,_,1,_] },
    { id: 'snare', type: 'snare', layer: 1, seq: [_,_,_,_, 1,_,_,_, _,_,_,_, 1,_,_,_, _,_,_,_, 1,_,_,_, _,_,_,_, 1,_,_,_, _,_,_,_, 1,_,_,_, _,_,_,_, 1,_,_,_, _,_,_,_, 1,_,_,_, _,_,_,_, 1,_,1,_] },
    { id: 'hat', type: 'hat', layer: 2, seq: [_,_,1,_, _,_,1,_, _,_,1,_, _,_,1,_, _,_,1,_, _,_,1,_, _,_,1,_, _,_,1,_, _,_,1,_, _,_,1,_, _,_,1,_, _,_,1,_, _,_,1,_, _,_,1,_, _,_,1,_, _,_,1,_] },
  ],
};

/** Boss: minor, urgent, all layers on from the first beat. */
export const BOSS = {
  bpm: 164,
  steps: 32,
  parts: [
    {
      id: 'bass', wave: 'triangle', gain: 0.26, attack: 0.003, release: 0.05, layer: 0,
      seq: [
        33, _, 33, _, 33, _, 36, _, 33, _, 33, _, 40, _, 39, _,
        31, _, 31, _, 31, _, 34, _, 31, _, 31, _, 38, _, 37, _,
      ],
    },
    {
      id: 'lead', wave: 'pulse25', gain: 0.16, attack: 0.004, release: 0.05, layer: 0,
      seq: [
        69, 72, 76, 72, 69, 72, 76, 79, 77, 76, 72, 76, 69, _, _, _,
        67, 70, 74, 70, 67, 70, 74, 77, 75, 74, 70, 74, 67, _, _, _,
      ],
    },
  ],
  drums: [
    { id: 'kick', type: 'kick', layer: 0, seq: [1,_,1,_, _,_,1,_, 1,_,_,_, 1,_,1,_, 1,_,1,_, _,_,1,_, 1,_,_,_, 1,_,1,1] },
    { id: 'snare', type: 'snare', layer: 0, seq: [_,_,_,_, 1,_,_,_, _,_,_,_, 1,_,_,1, _,_,_,_, 1,_,_,_, _,_,_,_, 1,_,1,1] },
  ],
};

/** A short rising fanfare, played once over the evolution cutscene. */
export const FANFARE = {
  bpm: 150,
  steps: 32,
  once: true,
  parts: [
    {
      id: 'lead', wave: 'pulse50', gain: 0.22, attack: 0.004, release: 0.18, layer: 0,
      seq: [
        60, _, 64, _, 67, _, 72, _, 76, _, 79, _, 84, H, H, H,
        _, _, 83, _, 84, H, H, H, H, H, H, H, H, H, H, H,
      ],
    },
    {
      id: 'harm', wave: 'pulse25', gain: 0.13, attack: 0.004, release: 0.18, layer: 0,
      seq: [
        48, _, 52, _, 55, _, 60, _, 64, _, 67, _, 72, H, H, H,
        _, _, 71, _, 72, H, H, H, H, H, H, H, H, H, H, H,
      ],
    },
  ],
};

/**
 * SFX. Each is a tiny synth recipe rather than a sample.
 *   type: 'blip' pitched tone | 'noise' filtered burst | 'sweep' pitch glide | 'chord'
 */
export const SFX = {
  shoot_water: { type: 'sweep', from: 620, to: 260, dur: 0.10, wave: 'pulse25', gain: 0.10 },
  shoot_normal:{ type: 'blip', freq: 940, dur: 0.05, wave: 'pulse12', gain: 0.09 },
  shoot_grass: { type: 'sweep', from: 420, to: 720, dur: 0.09, wave: 'pulse50', gain: 0.09 },
  shoot_rock:  { type: 'noise', dur: 0.08, hp: 400, gain: 0.10 },
  shoot_bolt:  { type: 'noise', dur: 0.09, hp: 2200, gain: 0.11 },

  hit:         { type: 'noise', dur: 0.045, hp: 1400, gain: 0.07 },
  crit:        { type: 'sweep', from: 1200, to: 1800, dur: 0.08, wave: 'pulse25', gain: 0.13 },
  kill:        { type: 'noise', dur: 0.10, hp: 700, gain: 0.09 },
  hurt:        { type: 'sweep', from: 340, to: 120, dur: 0.20, wave: 'triangle', gain: 0.20 },

  xp:          { type: 'blip', freq: 1320, dur: 0.035, wave: 'pulse50', gain: 0.05 },
  coin:        { type: 'chord', notes: [1568, 2093], dur: 0.10, wave: 'pulse25', gain: 0.08 },
  levelup:     { type: 'chord', notes: [523, 659, 784, 1046], dur: 0.36, wave: 'pulse50', gain: 0.13 },
  pickup:      { type: 'chord', notes: [784, 1046, 1318], dur: 0.22, wave: 'pulse25', gain: 0.12 },

  ability:     { type: 'sweep', from: 200, to: 900, dur: 0.22, wave: 'pulse25', gain: 0.14 },
  quake:       { type: 'noise', dur: 0.38, hp: 120, gain: 0.22 },
  beam:        { type: 'sweep', from: 1400, to: 300, dur: 0.30, wave: 'pulse12', gain: 0.14 },
  shield:      { type: 'chord', notes: [392, 523, 659], dur: 0.26, wave: 'triangle', gain: 0.13 },
  boss:        { type: 'sweep', from: 160, to: 60, dur: 0.70, wave: 'triangle', gain: 0.26 },
  evolve:      { type: 'sweep', from: 300, to: 1500, dur: 0.50, wave: 'pulse50', gain: 0.18 },
  select:      { type: 'blip', freq: 880, dur: 0.05, wave: 'pulse50', gain: 0.10 },
  confirm:     { type: 'chord', notes: [660, 990], dur: 0.12, wave: 'pulse50', gain: 0.12 },
};
