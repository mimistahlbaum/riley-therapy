// Text-to-speech for Riley using the Web Speech API.
// Works in desktop/mobile browsers and in the Meta Quest browser.
// Falls back silently when speech synthesis is unavailable.

export class Speech {
  constructor() {
    this.enabled = true;
    this.voice = null;
    this.available = typeof window !== 'undefined' && 'speechSynthesis' in window;
    if (this.available) {
      this.pickVoice();
      window.speechSynthesis.onvoiceschanged = () => this.pickVoice();
    }
  }

  pickVoice() {
    const voices = window.speechSynthesis.getVoices();
    if (!voices.length) return;
    // Prefer a friendly-sounding English voice; child voices are rare,
    // so we pitch a standard voice up instead.
    const preferred = [
      /en[-_]AU/i,
      /en[-_]GB/i,
      /en[-_]US/i,
      /^en/i,
    ];
    for (const pattern of preferred) {
      const match =
        voices.find((v) => pattern.test(v.lang) && /female|samantha|karen|catherine|zira|libby|natasha/i.test(v.name)) ||
        voices.find((v) => pattern.test(v.lang));
      if (match) {
        this.voice = match;
        return;
      }
    }
    this.voice = voices[0];
  }

  // Strip emoji and markup so they aren't read aloud.
  clean(text) {
    return text
      .replace(/[\u{1F000}-\u{1FAFF}\u{2600}-\u{27BF}\u{FE0F}\u{200D}]/gu, '')
      .replace(/\s+/g, ' ')
      .trim();
  }

  speak(text) {
    if (!this.available || !this.enabled) return;
    const cleaned = this.clean(text);
    if (!cleaned) return;
    window.speechSynthesis.cancel();
    const utterance = new SpeechSynthesisUtterance(cleaned);
    if (this.voice) utterance.voice = this.voice;
    utterance.rate = 0.95;
    utterance.pitch = 1.35; // brighter, more childlike
    utterance.volume = 1;
    window.speechSynthesis.speak(utterance);
  }

  stop() {
    if (this.available) window.speechSynthesis.cancel();
  }

  setEnabled(on) {
    this.enabled = on;
    if (!on) this.stop();
  }
}
