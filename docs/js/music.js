// Gentle generative background music: a slow, soft chord pad with the
// occasional music-box twinkle, all synthesised locally with WebAudio.
// No audio files, nothing downloaded, nothing sent anywhere.
//
// The music starts after the first tap (browsers block sound before a
// gesture) and automatically gets quieter while Riley is speaking.

import { getAudioContext } from './audio.js';

// A calm I–vi–IV–V loop in C major, one chord at a time.
const CHORDS = [
  [261.63, 329.63, 392.0], // C  E  G
  [220.0, 261.63, 329.63], // A  C  E
  [174.61, 220.0, 261.63], // F  A  C
  [196.0, 246.94, 293.66], // G  B  D
];
const CHORD_SECONDS = 9.6;
// C major pentatonic an octave up, for the twinkles.
const TWINKLES = [523.25, 587.33, 659.25, 783.99, 880.0];

const BASE_GAIN = 0.09;
const DUCKED_GAIN = 0.028; // while Riley talks

export class Music {
  constructor() {
    this.enabled = true;
    this.master = null;
    this.filter = null;
    this.timer = null;
    this.chordIndex = 0;
    this.nextChordTime = 0;
    this.ducked = false;
  }

  get playing() {
    return this.timer !== null;
  }

  targetGain() {
    return this.ducked ? DUCKED_GAIN : BASE_GAIN;
  }

  // Begins playback if allowed. No-op until the AudioContext is running,
  // so call it again from a user gesture (main.js does this on every tap).
  start() {
    const ctx = getAudioContext();
    if (!this.enabled || this.playing || !ctx || ctx.state !== 'running') return;

    if (!this.master) {
      this.master = ctx.createGain();
      this.filter = ctx.createBiquadFilter();
      this.filter.type = 'lowpass';
      this.filter.frequency.value = 900; // keep everything mellow
      this.master.connect(this.filter);
      this.filter.connect(ctx.destination);
    }
    const now = ctx.currentTime;
    this.master.gain.cancelScheduledValues(now);
    this.master.gain.setValueAtTime(0.0001, now);
    this.master.gain.linearRampToValueAtTime(this.targetGain(), now + 2.5);

    this.nextChordTime = now + 0.1;
    this.timer = setInterval(() => this.schedule(), 400);
    this.schedule();
  }

  stop() {
    if (this.timer) {
      clearInterval(this.timer);
      this.timer = null;
    }
    const ctx = getAudioContext();
    if (this.master && ctx) {
      const now = ctx.currentTime;
      this.master.gain.cancelScheduledValues(now);
      this.master.gain.setTargetAtTime(0.0001, now, 0.4);
    }
  }

  // Lower the music while Riley speaks, bring it back afterwards.
  duck(on) {
    this.ducked = on;
    const ctx = getAudioContext();
    if (!this.playing || !this.master || !ctx) return;
    this.master.gain.setTargetAtTime(this.targetGain(), ctx.currentTime, 0.5);
  }

  setEnabled(on) {
    this.enabled = on;
    if (on) this.start();
    else this.stop();
  }

  // ---- Scheduling ---------------------------------------------------------

  // Keep about a second of music queued ahead of the clock.
  schedule() {
    const ctx = getAudioContext();
    if (!ctx) return;
    while (this.nextChordTime < ctx.currentTime + 1.2) {
      this.scheduleChord(ctx, this.nextChordTime);
      this.nextChordTime += CHORD_SECONDS;
    }
  }

  scheduleChord(ctx, t) {
    const chord = CHORDS[this.chordIndex % CHORDS.length];
    this.chordIndex += 1;

    // Soft pad: each chord note swells in and fades away.
    for (const freq of chord) {
      this.padNote(ctx, freq, t, 0.5);
    }
    // A quiet root note an octave down anchors the chord.
    this.padNote(ctx, chord[0] / 2, t, 0.3);

    // One or two music-box twinkles somewhere inside the chord.
    const count = Math.random() < 0.35 ? 2 : 1;
    for (let i = 0; i < count; i += 1) {
      const note = TWINKLES[Math.floor(Math.random() * TWINKLES.length)];
      const offset = 1 + Math.random() * (CHORD_SECONDS - 4);
      this.twinkle(ctx, note, t + offset);
    }
  }

  padNote(ctx, freq, t, peak) {
    const osc = ctx.createOscillator();
    osc.type = 'triangle';
    osc.frequency.value = freq;
    const gain = ctx.createGain();
    gain.gain.setValueAtTime(0.0001, t);
    gain.gain.linearRampToValueAtTime(peak, t + 3);
    gain.gain.setValueAtTime(peak, t + CHORD_SECONDS - 2.5);
    gain.gain.linearRampToValueAtTime(0.0001, t + CHORD_SECONDS + 0.5);
    osc.connect(gain);
    gain.connect(this.master);
    osc.start(t);
    osc.stop(t + CHORD_SECONDS + 0.7);
  }

  twinkle(ctx, freq, t) {
    const osc = ctx.createOscillator();
    osc.type = 'sine';
    osc.frequency.value = freq;
    const gain = ctx.createGain();
    gain.gain.setValueAtTime(0.0001, t);
    gain.gain.linearRampToValueAtTime(0.22, t + 0.03);
    gain.gain.exponentialRampToValueAtTime(0.0001, t + 1.6);
    osc.connect(gain);
    gain.connect(this.master);
    osc.start(t);
    osc.stop(t + 1.8);
  }
}
