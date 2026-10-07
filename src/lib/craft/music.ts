import { MUSIC_TRACKS, MUSIC_VOLUME } from "@/config/audio";
import { getAudioContext } from "./sounds";

const KEY = "crafty:music";
const url = (p: string) => `${import.meta.env.BASE_URL}${p}`.replace(/\/{2,}/g, "/");

let enabled = true;
try {
  enabled = localStorage.getItem(KEY) !== "off";
} catch {
  /* ignore */
}

let el: HTMLAudioElement | null = null;
let fileFailed = false;
let wantPlaying = false;
const listeners = new Set<() => void>();

// ---------- procedural fallback (used when background.mp3 is missing) ----------
const CHORDS = [
  [220.0, 261.63, 329.63], // Am
  [174.61, 220.0, 261.63], // F
  [196.0, 261.63, 329.63], // C
  [196.0, 246.94, 293.66], // G
];
let synthTimer: ReturnType<typeof setInterval> | null = null;
let synthMaster: GainNode | null = null;
let chordIdx = 0;

function playChord() {
  const c = getAudioContext();
  if (!c || !synthMaster) return;
  const now = c.currentTime;
  const dur = 8;
  const chord = CHORDS[chordIdx++ % CHORDS.length];
  for (const f of chord) {
    for (const detune of [-6, 6]) {
      const o = c.createOscillator();
      const g = c.createGain();
      const lp = c.createBiquadFilter();
      lp.type = "lowpass";
      lp.frequency.value = 900;
      o.type = "triangle";
      o.frequency.value = f;
      o.detune.value = detune;
      g.gain.setValueAtTime(0.0001, now);
      g.gain.linearRampToValueAtTime(0.05, now + 2.5);
      g.gain.linearRampToValueAtTime(0.0001, now + dur + 1.5);
      o.connect(lp);
      lp.connect(g);
      g.connect(synthMaster);
      o.start(now);
      o.stop(now + dur + 1.6);
    }
  }
}

function startSynth() {
  const c = getAudioContext();
  if (!c || synthTimer) return;
  synthMaster = c.createGain();
  synthMaster.gain.value = MUSIC_VOLUME;
  synthMaster.connect(c.destination);
  playChord();
  synthTimer = setInterval(playChord, 7000);
}

function stopSynth() {
  if (synthTimer) clearInterval(synthTimer);
  synthTimer = null;
  if (synthMaster) {
    try {
      synthMaster.disconnect();
    } catch {
      /* ignore */
    }
    synthMaster = null;
  }
}

// ---------- file based music (playlist) ----------
const TRACK_KEY = "crafty:track";
const failed = new Set<number>();
let trackIdx = 0;
try {
  const saved = Number(localStorage.getItem(TRACK_KEY));
  if (Number.isInteger(saved) && saved >= 0 && saved < MUSIC_TRACKS.length) trackIdx = saved;
} catch {
  /* ignore */
}

const allFailed = () => failed.size >= MUSIC_TRACKS.length;

function saveTrack() {
  try {
    localStorage.setItem(TRACK_KEY, String(trackIdx));
  } catch {
    /* ignore */
  }
}

function ensureEl() {
  if (el) return el;
  el = new Audio();
  el.loop = MUSIC_TRACKS.length <= 1;
  el.volume = MUSIC_VOLUME;
  el.preload = "auto";
  el.setAttribute("playsinline", "");
  el.src = url(MUSIC_TRACKS[trackIdx]);
  // Song finished -> play the next one (cycles back to the first).
  el.addEventListener("ended", () => advance(1));
  // Missing/undecodable file -> skip it; if none work, use the synth fallback.
  el.addEventListener("error", () => {
    failed.add(trackIdx);
    if (allFailed()) {
      if (wantPlaying && enabled && document.visibilityState === "visible") startSynth();
    } else {
      advance(1);
    }
  });
  return el;
}

function advance(step: number) {
  if (allFailed() || MUSIC_TRACKS.length === 0) return;
  let next = trackIdx;
  for (let i = 0; i < MUSIC_TRACKS.length; i++) {
    next = (next + step + MUSIC_TRACKS.length) % MUSIC_TRACKS.length;
    if (!failed.has(next)) break;
  }
  trackIdx = next;
  saveTrack();
  const a = ensureEl();
  a.src = url(MUSIC_TRACKS[trackIdx]);
  a.load();
  emit();
  if (enabled && wantPlaying && document.visibilityState === "visible") {
    a.play().catch(() => {
      /* needs a gesture; next click retries */
    });
  }
}

function begin() {
  if (!enabled || !wantPlaying || document.visibilityState !== "visible") return;
  if (allFailed() || MUSIC_TRACKS.length === 0) {
    startSynth();
    return;
  }
  const a = ensureEl();
  const p = a.play();
  if (p) {
    p.catch(() => {
      // Autoplay blocked (needs a gesture) or file unusable. The next gesture retries.
      if (allFailed()) startSynth();
    });
  }
}

function halt() {
  el?.pause();
  stopSynth();
}

function emit() {
  listeners.forEach((l) => l());
}

/** Call from a user gesture (pointerdown / touchend / click). Safe to call repeatedly. */
export function startMusic() {
  wantPlaying = true;
  // Only (re)start if not already playing.
  if (enabled && (!el || el.paused) && !synthTimer) begin();
}

/** Skip to the next song (wraps around). Turns music on if it was muted. */
export function nextTrack() {
  wantPlaying = true;
  if (!enabled) {
    setMusicEnabled(true);
  }
  if (allFailed()) {
    // Synth fallback: start a fresh chord so the button still gives feedback.
    stopSynth();
    startSynth();
    return;
  }
  advance(1);
}

export function getTrackNumber() {
  return allFailed() ? 0 : trackIdx + 1;
}

export const trackCount = MUSIC_TRACKS.length;

export function isMusicEnabled() {
  return enabled;
}

export function setMusicEnabled(on: boolean) {
  enabled = on;
  try {
    localStorage.setItem(KEY, on ? "on" : "off");
  } catch {
    /* ignore */
  }
  if (on) {
    wantPlaying = true;
    begin();
  } else {
    halt();
  }
  emit();
}

export function subscribeMusic(fn: () => void) {
  listeners.add(fn);
  return () => {
    listeners.delete(fn);
  };
}

// Pause when the tab/app is hidden (important on mobile), resume when visible again.
if (typeof document !== "undefined") {
  document.addEventListener("visibilitychange", () => {
    if (document.visibilityState === "hidden") halt();
    else if (enabled && wantPlaying) begin();
  });
}
