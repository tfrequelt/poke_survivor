// L1 -- may import L0.
//
// Procedural chiptune and SFX. Nothing here loads a file: every sound is synthesised from
// oscillators and filtered noise at runtime.
//
// The failure modes in Web Audio are all SILENT -- a suspended context, a scheduler drifting on
// requestAnimationFrame, eighty death sounds firing in one frame and clipping the master. Each has
// an explicit guard, written from the first line rather than added after someone reports "no sound".

import { TITLE, ROUTE, BOSS, FANFARE, SFX } from './data/music.js';

const LOOKAHEAD = 0.12;        // seconds of notes to schedule ahead
const TICK_MS = 30;            // how often the scheduler wakes
const MAX_VOICES = 14;         // hard cap on simultaneous SFX voices

let ctx = null;
let master = null, musicBus = null, sfxBus = null;
let started = false;
let timer = 0;

let voices = 0;
const lastPlayed = new Map();  // sfx id -> ctx time, for rate limiting

export const settings = { music: 0.7, sfx: 0.8, muted: false };

// --- Graph ------------------------------------------------------------------

/**
 * Create the context. Must be called from a user gesture or the context starts suspended and
 * every subsequent schedule is silently dropped.
 */
export function initAudio() {
  if (ctx) return resume();
  const AC = window.AudioContext || window.webkitAudioContext;
  if (!AC) return false;

  ctx = new AC();

  // A compressor on the master is not polish -- without it, a crowd dying at once clips hard.
  const comp = ctx.createDynamicsCompressor();
  comp.threshold.value = -14;
  comp.knee.value = 18;
  comp.ratio.value = 10;
  comp.attack.value = 0.003;
  comp.release.value = 0.18;

  master = ctx.createGain();
  master.gain.value = settings.muted ? 0 : 1;

  musicBus = ctx.createGain();
  musicBus.gain.value = settings.music;
  sfxBus = ctx.createGain();
  sfxBus.gain.value = settings.sfx;

  musicBus.connect(comp);
  sfxBus.connect(comp);
  comp.connect(master);
  master.connect(ctx.destination);

  document.addEventListener('visibilitychange', () => {
    if (!ctx) return;
    if (document.hidden) ctx.suspend?.();
    else ctx.resume?.();
  });

  decodePending();
  return resume();
}

function resume() {
  if (!ctx) return false;
  if (ctx.state === 'suspended') ctx.resume?.();
  if (!timer) timer = setInterval(schedule, TICK_MS);
  started = true;
  return true;
}

export const audioReady = () => !!ctx && ctx.state === 'running';

export function setVolume(kind, v) {
  settings[kind] = Math.max(0, Math.min(1, v));
  // Cancel any duck in progress, or its scheduled ramp would overwrite this a moment later.
  if (kind === 'music' && ctx && musicBus) musicBus.gain.cancelScheduledValues(ctx.currentTime);
  if (kind === 'music' && musicBus) musicBus.gain.value = settings.music;
  if (kind === 'sfx' && sfxBus) sfxBus.gain.value = settings.sfx;
}

export function toggleMute() {
  settings.muted = !settings.muted;
  if (master) master.gain.value = settings.muted ? 0 : 1;
  return settings.muted;
}

// --- Waves ------------------------------------------------------------------
// Pulse waves are what make a chiptune sound like a chiptune, and an OscillatorNode has no pulse
// type -- they are built as PeriodicWaves from the Fourier series of a square with a given duty.

const waveCache = new Map();

function pulseWave(duty) {
  const key = `p${duty}`;
  if (waveCache.has(key)) return waveCache.get(key);
  const N = 24;
  const real = new Float32Array(N);
  const imag = new Float32Array(N);
  for (let n = 1; n < N; n++) {
    imag[n] = (2 / (n * Math.PI)) * Math.sin(Math.PI * n * duty);
  }
  const w = ctx.createPeriodicWave(real, imag, { disableNormalization: false });
  waveCache.set(key, w);
  return w;
}

function applyWave(osc, wave) {
  switch (wave) {
    case 'pulse12': osc.setPeriodicWave(pulseWave(0.125)); break;
    case 'pulse25': osc.setPeriodicWave(pulseWave(0.25)); break;
    case 'pulse50': osc.type = 'square'; break;
    case 'triangle': osc.type = 'triangle'; break;
    case 'saw': osc.type = 'sawtooth'; break;
    default: osc.type = 'square'; break;
  }
}

const midiToFreq = (n) => 440 * Math.pow(2, (n - 69) / 12);

// --- Music scheduler --------------------------------------------------------
//
// Notes are scheduled against ctx.currentTime from a setInterval look-ahead. Driving this from
// requestAnimationFrame would tie the music to the frame rate and make it audibly wobble.

let track = null;
let trackStart = 0;
let nextStep = 0;
let intensity = 0;             // which `layer` values are currently audible
let queuedOnce = null;

export function playTrack(def, opts) {
  if (!ctx) return;
  track = def;
  trackStart = ctx.currentTime + 0.06;
  nextStep = 0;
  if (opts && opts.intensity !== undefined) intensity = opts.intensity;
}

export function stopTrack() {
  track = null;
}

/** Is the synthesised track currently scheduling notes? */
export const chiptunePlaying = () => !!track;

/** Layer the route theme up as the run escalates. 0 = bass+lead, 1 = +arp, 2 = everything. */
export function setIntensity(level) {
  intensity = Math.max(0, Math.min(2, level | 0));
}

/** Play a one-shot track (the evolution fanfare) over whatever is already going. */
export function playOnce(def) {
  if (!ctx) return;
  queuedOnce = { def, start: ctx.currentTime + 0.02, step: 0 };
}

function schedule() {
  if (!ctx || ctx.state !== 'running') return;
  const now = ctx.currentTime;
  const horizon = now + LOOKAHEAD;

  if (track) {
    const spb = 60 / track.bpm / 4;                 // seconds per 16th
    while (trackStart + nextStep * spb < horizon) {
      const t = trackStart + nextStep * spb;
      emitStep(track, nextStep % track.steps, t, spb);
      nextStep++;
      // Rebase periodically so the float accumulator never drifts over a 20 minute run.
      if (nextStep >= track.steps) {
        nextStep = 0;
        trackStart += track.steps * spb;
      }
    }
  }

  if (queuedOnce) {
    const d = queuedOnce.def;
    const spb = 60 / d.bpm / 4;
    while (queuedOnce.step < d.steps && queuedOnce.start + queuedOnce.step * spb < horizon) {
      emitStep(d, queuedOnce.step, queuedOnce.start + queuedOnce.step * spb, spb, true);
      queuedOnce.step++;
    }
    if (queuedOnce.step >= d.steps) queuedOnce = null;
  }
}

function emitStep(def, step, time, spb, isOnce) {
  for (const part of def.parts || []) {
    if (!isOnce && (part.layer || 0) > intensity) continue;
    const v = part.seq[step];
    if (!v || v < 0) continue;                       // rest, or a hold of the previous note

    // Extend the note through any following holds, so a melody breathes instead of stuttering.
    let len = 1;
    for (let i = step + 1; i < def.steps && part.seq[i] === -1; i++) len++;
    noteOn(midiToFreq(v), part.wave, part.gain, time, len * spb, part.attack, part.release);
  }
  for (const d of def.drums || []) {
    if ((d.layer || 0) > intensity) continue;
    if (d.seq[step]) drum(d.type, time);
  }
}

function noteOn(freq, wave, gain, time, dur, attack = 0.005, release = 0.06) {
  const osc = ctx.createOscillator();
  applyWave(osc, wave);
  osc.frequency.setValueAtTime(freq, time);

  const g = ctx.createGain();
  g.gain.setValueAtTime(0, time);
  g.gain.linearRampToValueAtTime(gain, time + attack);
  g.gain.setValueAtTime(gain, time + Math.max(attack, dur - release));
  g.gain.exponentialRampToValueAtTime(0.0001, time + dur);

  osc.connect(g);
  g.connect(musicBus);
  osc.start(time);
  osc.stop(time + dur + 0.02);
}

function drum(type, time) {
  if (type === 'kick') {
    const osc = ctx.createOscillator();
    osc.type = 'sine';
    osc.frequency.setValueAtTime(150, time);
    osc.frequency.exponentialRampToValueAtTime(42, time + 0.11);
    const g = ctx.createGain();
    g.gain.setValueAtTime(0.5, time);
    g.gain.exponentialRampToValueAtTime(0.0001, time + 0.14);
    osc.connect(g); g.connect(musicBus);
    osc.start(time); osc.stop(time + 0.16);
    return;
  }
  // snare / hat are filtered noise bursts
  const dur = type === 'snare' ? 0.12 : 0.04;
  const src = noiseSource(dur);
  const f = ctx.createBiquadFilter();
  f.type = 'highpass';
  f.frequency.value = type === 'snare' ? 1200 : 6500;
  const g = ctx.createGain();
  g.gain.setValueAtTime(type === 'snare' ? 0.26 : 0.10, time);
  g.gain.exponentialRampToValueAtTime(0.0001, time + dur);
  src.connect(f); f.connect(g); g.connect(musicBus);
  src.start(time); src.stop(time + dur + 0.01);
}

let noiseBuf = null;
function noiseSource(dur) {
  if (!noiseBuf) {
    const n = Math.ceil(ctx.sampleRate * 0.5);
    noiseBuf = ctx.createBuffer(1, n, ctx.sampleRate);
    const d = noiseBuf.getChannelData(0);
    for (let i = 0; i < n; i++) d[i] = Math.random() * 2 - 1;
  }
  const s = ctx.createBufferSource();
  s.buffer = noiseBuf;
  s.loop = true;
  return s;
}

// --- Streamed music files ---------------------------------------------------
//
// Supplied tracks are STREAMED through HTMLAudioElement rather than decoded into buffers: the
// set is ~35MB, and decodeAudioData would hold all of it uncompressed in memory for no benefit.
//
// Two elements exist so one can fade out while the next fades in. createMediaElementSource can
// only be called once per element, so they are built once here and reused by swapping `.src`.

const FADE = 1.1;

let musicEls = null;
let musicGains = null;
let activeSlot = 0;
let currentUrl = null;
let fileMusicOn = false;

/**
 * Called when a supplied track cannot play. play() rejects ASYNCHRONOUSLY, long after
 * playMusicFile has returned, so the caller cannot fall back on its own -- without this hook a
 * missing or unsupported file leaves the game silent rather than dropping to the chiptune.
 */
let onMusicFail = null;
export function setMusicFallback(fn) { onMusicFail = fn; }

/**
 * Called when the playing track reaches its end, and returns the URL to play next. Tracks do not
 * loop: a stage lists several songs and running out of one should move to another, which is what
 * the games themselves do. Returning null (or the same URL, when a list holds only one song)
 * restarts the current track instead, so a single-track list still behaves like a loop.
 */
let onMusicEnded = null;
export function setMusicAdvance(fn) { onMusicEnded = fn; }

function initMusicElements() {
  if (musicEls) return;
  musicEls = [];
  musicGains = [];
  for (let i = 0; i < 2; i++) {
    const el = new Audio();
    // Deliberately NOT looping -- see setMusicAdvance.
    el.loop = false;
    el.preload = 'none';
    el.addEventListener('ended', () => {
      // Only the element currently in front may advance the playlist. The outgoing half of a
      // crossfade is still playing while it fades, and if it happens to run out during that
      // second it would otherwise yank the playlist forward past the track that just started.
      if (!musicEls || musicEls[activeSlot] !== el) return;
      const next = onMusicEnded ? onMusicEnded(currentUrl) : null;
      if (next && next !== currentUrl) { playMusicFile(next); return; }
      // One-song list, or nothing to advance to: replay this one.
      try { el.currentTime = 0; el.play(); } catch { /* element torn down */ }
    });
    el.addEventListener('error', () => {
      if (el.src && decodeURI(el.src).endsWith(String(currentUrl))) {
        console.warn('[audio] track errored:', currentUrl);
        fileMusicOn = false;
        currentUrl = null;
        if (onMusicFail) onMusicFail();
      }
    });
    const g = ctx.createGain();
    g.gain.value = 0;
    ctx.createMediaElementSource(el).connect(g);
    g.connect(musicBus);
    musicEls.push(el);
    musicGains.push(g);
  }
}

/**
 * Stream a music file, crossfading from whatever is playing.
 * Returns false if it could not start, so the caller can fall back to the chiptune.
 */
export function playMusicFile(url) {
  if (!ctx || ctx.state !== 'running' || !url) return false;
  if (url === currentUrl) return true;               // already playing this one

  initMusicElements();
  const now = ctx.currentTime;
  const next = activeSlot ^ 1;
  const outG = musicGains[activeSlot];
  const inEl = musicEls[next];
  const inG = musicGains[next];

  // Fade the outgoing track down and stop it once it is silent.
  outG.gain.cancelScheduledValues(now);
  outG.gain.setValueAtTime(outG.gain.value, now);
  outG.gain.linearRampToValueAtTime(0, now + FADE);
  const outEl = musicEls[activeSlot];
  const outSlot = activeSlot;
  setTimeout(() => {
    if (activeSlot === outSlot) return;              // it became current again; leave it alone
    try { outEl.pause(); } catch { /* element already torn down */ }
  }, FADE * 1000 + 60);

  inEl.src = encodeURI(url);
  inEl.currentTime = 0;
  inG.gain.cancelScheduledValues(now);
  inG.gain.setValueAtTime(0, now);
  inG.gain.linearRampToValueAtTime(1, now + FADE);

  const p = inEl.play();
  if (p && p.catch) {
    p.catch((e) => {
      console.warn('[audio] could not play', url, e && e.message);
      fileMusicOn = false;
      currentUrl = null;
      if (onMusicFail) onMusicFail(url);
    });
  }

  activeSlot = next;
  currentUrl = url;
  fileMusicOn = true;
  stopTrack();                                       // the chiptune stands down
  return true;
}

export function stopMusicFile() {
  if (!musicEls) return;
  const now = ctx.currentTime;
  for (let i = 0; i < 2; i++) {
    musicGains[i].gain.cancelScheduledValues(now);
    musicGains[i].gain.linearRampToValueAtTime(0, now + 0.4);
    const el = musicEls[i];
    setTimeout(() => { try { el.pause(); } catch {} }, 460);
  }
  currentUrl = null;
  fileMusicOn = false;
}

export const musicFilePlaying = () => fileMusicOn;
export const currentMusicUrl = () => currentUrl;
/** The element actually playing. Exposed so a harness can seek a track to its end and watch the
 *  playlist hand over, which is the only way to test that path without waiting three minutes. */
export const currentMusicEl = () => (musicEls ? musicEls[activeSlot] : null);

// --- SFX --------------------------------------------------------------------

/**
 * Fire a sound effect. Rate-limited per id and capped globally: 300 enemies dying in one frame
 * would otherwise queue eighty overlapping voices and turn the master into mud.
 */
// --- Supplied samples -------------------------------------------------------
//
// A decoded sample takes priority over the synthesised version of the same id, so dropping a
// file into assets/sfx/ and naming it in the manifest replaces that sound with no code change.
// Decoding needs a live context, so the raw bytes sit here until initAudio has one.

const sampleBytes = new Map();      // id -> ArrayBuffer, not yet decoded
const samples = new Map();          // id -> AudioBuffer, ready to play

/** Hand over the raw files loaded from the manifest. Safe to call before initAudio. */
export function setSfxFiles(map) {
  for (const [id, bytes] of map) sampleBytes.set(id, bytes);
  if (ctx) decodePending();
}

function decodePending() {
  for (const [id, bytes] of sampleBytes) {
    sampleBytes.delete(id);
    // decodeAudioData detaches the buffer, so a failed decode cannot be retried -- which is
    // fine: the synthesised sound is already the fallback.
    ctx.decodeAudioData(bytes.slice(0))
      .then((buf) => samples.set(id, buf))
      .catch((e) => console.warn('[audio] could not decode sfx', id, e && e.message));
  }
}

/** True if a supplied sample was used. */
function playSample(id, detune, now) {
  const buf = samples.get(id);
  if (!buf) return false;
  const src = ctx.createBufferSource();
  src.buffer = buf;
  if (detune) src.playbackRate.value = Math.pow(2, detune / 12);
  const g = ctx.createGain();
  g.gain.value = 1;
  src.connect(g);
  g.connect(sfxBus);
  src.start(now);
  voices++;
  setTimeout(() => { voices--; }, buf.duration * 1000 + 40);
  return true;
}

/** How long a supplied sample runs, in seconds, or 0 if there is no sample for that id. */
export function sampleDuration(id) {
  const buf = samples.get(id);
  return buf ? buf.duration : 0;
}

/**
 * Dip the music bus for `seconds`, then bring it back.
 *
 * The evolution jingle is a piece of music in its own right and runs far longer than the
 * cutscene does; without this it plays underneath the stage track and both turn to mush.
 */
export function duckMusic(seconds, level = 0.18) {
  if (!ctx || !musicBus) return;
  const now = ctx.currentTime;
  const g = musicBus.gain;
  g.cancelScheduledValues(now);
  g.setValueAtTime(g.value, now);
  g.linearRampToValueAtTime(settings.music * level, now + 0.25);
  g.setValueAtTime(settings.music * level, now + Math.max(0.3, seconds - 1));
  g.linearRampToValueAtTime(settings.music, now + Math.max(0.6, seconds));
}

export function sfx(id, detune = 0) {
  if (!ctx || ctx.state !== 'running' || settings.muted) return;
  const def = SFX[id];
  // A supplied sample does not need a synthesised definition to exist, so this check comes after.
  if (!def && !samples.has(id)) return;

  const now = ctx.currentTime;
  const last = lastPlayed.get(id) || 0;
  if (now - last < 0.045) return;                   // same sound, too soon
  if (voices >= MAX_VOICES) return;
  lastPlayed.set(id, now);

  if (playSample(id, detune, now)) return;

  const dur = def.dur;
  voices++;
  setTimeout(() => { voices--; }, dur * 1000 + 40);

  const g = ctx.createGain();
  g.gain.setValueAtTime(def.gain, now);
  g.gain.exponentialRampToValueAtTime(0.0001, now + dur);
  g.connect(sfxBus);

  const bend = Math.pow(2, detune / 12);

  if (def.type === 'noise') {
    const s = noiseSource(dur);
    const f = ctx.createBiquadFilter();
    f.type = 'highpass';
    f.frequency.value = def.hp || 800;
    s.connect(f); f.connect(g);
    s.start(now); s.stop(now + dur + 0.01);
    return;
  }

  const freqs = def.type === 'chord' ? def.notes : [def.freq || def.from];
  for (const base of freqs) {
    const osc = ctx.createOscillator();
    applyWave(osc, def.wave);
    osc.frequency.setValueAtTime(base * bend, now);
    if (def.type === 'sweep') {
      osc.frequency.exponentialRampToValueAtTime(Math.max(20, def.to * bend), now + dur);
    }
    osc.connect(g);
    osc.start(now);
    osc.stop(now + dur + 0.02);
  }
}

export { TITLE, ROUTE, BOSS, FANFARE };
