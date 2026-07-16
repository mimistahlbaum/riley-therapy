// Soft looping background music behind Riley.
//
// Track: "Infinite Peace" by Kevin MacLeod, released into the public
// domain (CC0) via freepd.com — see audio/CREDITS.txt. It plays quietly
// under the conversation and ducks even lower while Riley is speaking
// so the voice always stays easy to hear.

const BASE_VOLUME = 0.14; // a quiet backdrop, never competing with speech
const DUCK_VOLUME = 0.05; // while Riley is talking
const FADE_MS = 800;
const STEP_MS = 50;

export class BGM {
  constructor(src = 'audio/bgm.mp3') {
    this.src = src;
    this.audio = null; // created lazily so the file only loads when wanted
    this.enabled = false;
    this.ducked = false;
    this.pending = false; // autoplay blocked, waiting for a user gesture
    this.fadeTimer = null;
  }

  targetVolume() {
    return this.ducked ? DUCK_VOLUME : BASE_VOLUME;
  }

  ensureAudio() {
    if (!this.audio) {
      this.audio = new Audio(this.src);
      this.audio.loop = true;
      this.audio.volume = 0;
    }
    return this.audio;
  }

  fadeTo(target, { pauseAtZero = false } = {}) {
    const audio = this.audio;
    if (!audio) return;
    clearInterval(this.fadeTimer);
    const step = Math.max(0.005, Math.abs(target - audio.volume) / (FADE_MS / STEP_MS));
    this.fadeTimer = setInterval(() => {
      const diff = target - audio.volume;
      if (Math.abs(diff) <= step) {
        audio.volume = target;
        clearInterval(this.fadeTimer);
        this.fadeTimer = null;
        if (pauseAtZero && target === 0) audio.pause();
        return;
      }
      audio.volume += Math.sign(diff) * step;
    }, STEP_MS);
  }

  async play() {
    const audio = this.ensureAudio();
    try {
      await audio.play();
      this.pending = false;
      this.fadeTo(this.targetVolume());
    } catch {
      // Autoplay policy wants a user gesture first; unlock() retries then.
      this.pending = true;
    }
  }

  setEnabled(on) {
    this.enabled = on;
    if (on) {
      this.play();
    } else {
      this.pending = false;
      if (this.audio) this.fadeTo(0, { pauseAtZero: true });
    }
  }

  // Call from the first user gesture: starts music that autoplay blocked.
  unlock() {
    if (this.enabled && this.pending) this.play();
  }

  // Lower the music while Riley speaks so the words stay clear.
  setDucked(on) {
    this.ducked = on;
    if (this.enabled && this.audio && !this.audio.paused) {
      this.fadeTo(this.targetVolume());
    }
  }
}
