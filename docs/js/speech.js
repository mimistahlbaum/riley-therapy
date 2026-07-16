// Text-to-speech for Riley, tried in order:
//
// 1. Zundamon — a locally running zundamon-speech-webui server
//    (https://github.com/zunzun999/zundamon-speech-webui, GPT-SoVITS).
//    Start its API alongside the models from that repo's README, e.g.
//      cd zundamon-speech-webui/GPT-SoVITS
//      python api.py -g GPT_weights_v2/zudamon_style_1-e15.ckpt \
//        -s SoVITS_weights_v2/zudamon_style_1_e8_s96.pth \
//        -dr ../reference/reference.wav \
//        -dt "流し切りが完全に入ればデバフの効果が付与される" -dl ja
//    The default address http://127.0.0.1:9880 can be overridden via
//    localStorage key "riley-zundamon-url". The audio streams straight
//    into an <audio> element, so no CORS setup is needed on the server.
// 2. Microsoft Edge's neural voices (the same online voices Edge uses
//    for Read Aloud), spoken with "Ana" — a warm, natural child voice,
//    synthesised over the Edge Read Aloud websocket endpoint. This one
//    plays through the shared WebAudio context: once that context is
//    unlocked by the first tap it stays unlocked, so playback can't be
//    swallowed by the autoplay policy mid-session (which used to leave
//    the replay button silent).
// 3. The browser's built-in speech synthesis, as the last resort, so
//    the app keeps working everywhere, including the Quest browser.

import { getAudioContext, resumeAudio } from './audio.js';

const ZUNDAMON_BASE = 'http://127.0.0.1:9880';
// Synthesis on a slow machine can take a while, but a hung request must
// not leave Riley silent forever before the fallbacks get their turn.
const ZUNDAMON_TIMEOUT_MS = 12000;

const TRUSTED_CLIENT_TOKEN = '6A5AA1D4EAAB49E09B30460754FA3000';
const CHROMIUM_FULL_VERSION = '130.0.2849.68';
const VOICE = 'en-US-AnaNeural';
const OUTPUT_FORMAT = 'audio-24khz-48kbitrate-mono-mp3';
const WS_BASE = 'wss://speech.platform.bing.com/consumer/speech/synthesize/readaloud/edge/v1';

function randomHex(bytes) {
  const arr = new Uint8Array(bytes);
  crypto.getRandomValues(arr);
  return [...arr].map((b) => b.toString(16).padStart(2, '0')).join('');
}

// The endpoint requires a Sec-MS-GEC token: an uppercase SHA-256 of the
// current Windows file time (rounded down to 5 minutes) + client token.
async function secMsGec() {
  let ticks = BigInt(Math.floor(Date.now() / 1000) + 11644473600);
  ticks -= ticks % 300n;
  ticks *= 10000000n;
  const data = new TextEncoder().encode(`${ticks}${TRUSTED_CLIENT_TOKEN}`);
  const hash = await crypto.subtle.digest('SHA-256', data);
  return [...new Uint8Array(hash)]
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('')
    .toUpperCase();
}

function escapeXml(text) {
  return text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;');
}

export class Speech {
  constructor() {
    this.enabled = true;
    this.onstart = null;
    this.onend = null;
    // Fired when the browser refuses to play before a user gesture, so the
    // UI can invite the child to tap the replay button.
    this.onblocked = null;

    this.currentSource = null; // AudioBufferSourceNode while the Edge voice plays
    this.currentAudio = null; // <audio> element while the Zundamon voice plays
    this.currentWs = null;
    this.requestSeq = 0;
    this.edgeFailures = 0;
    this.zundaFailures = 0;
    this.zundamonBase = ZUNDAMON_BASE;
    try {
      this.zundamonBase = localStorage.getItem('riley-zundamon-url') || this.zundamonBase;
    } catch { /* storage unavailable: keep default */ }
    this.cache = new Map(); // cleaned text -> decoded AudioBuffer
    this.lastText = null; // last message asked to be spoken (cleaned)
    this.pendingText = null; // blocked by autoplay policy, waiting for a gesture

    // Fallback: browser speech synthesis.
    this.synthAvailable = typeof window !== 'undefined' && 'speechSynthesis' in window;
    this.fallbackVoice = null;
    if (this.synthAvailable) {
      this.pickFallbackVoice();
      window.speechSynthesis.onvoiceschanged = () => this.pickFallbackVoice();
    }
    this.edgeAvailable =
      typeof WebSocket !== 'undefined' && 'subtle' in (crypto || {}) && !!getAudioContext();
    this.available =
      typeof Audio !== 'undefined' || // Zundamon server playback
      this.edgeAvailable ||
      this.synthAvailable;
  }

  // ---- Edge neural voice ------------------------------------------------

  async synthesise(text) {
    const gec = await secMsGec();
    const url =
      `${WS_BASE}?TrustedClientToken=${TRUSTED_CLIENT_TOKEN}` +
      `&Sec-MS-GEC=${gec}&Sec-MS-GEC-Version=1-${CHROMIUM_FULL_VERSION}` +
      `&ConnectionId=${randomHex(16)}`;

    return new Promise((resolve, reject) => {
      const ws = new WebSocket(url);
      ws.binaryType = 'arraybuffer';
      this.currentWs = ws;
      const chunks = [];
      const decoder = new TextDecoder();
      let settled = false;

      const fail = (err) => {
        if (settled) return;
        settled = true;
        try { ws.close(); } catch { /* already closed */ }
        reject(err);
      };
      // Keep this short: while it runs the child hears nothing, and the
      // fallback voice is waiting right behind it.
      const timeout = setTimeout(() => fail(new Error('Edge TTS timed out')), 4000);

      ws.onopen = () => {
        const timestamp = new Date().toString();
        ws.send(
          `X-Timestamp:${timestamp}\r\n` +
          'Content-Type:application/json; charset=utf-8\r\n' +
          'Path:speech.config\r\n\r\n' +
          JSON.stringify({
            context: {
              synthesis: {
                audio: {
                  metadataoptions: { sentenceBoundaryEnabled: 'false', wordBoundaryEnabled: 'false' },
                  outputFormat: OUTPUT_FORMAT,
                },
              },
            },
          }),
        );
        const ssml =
          `<speak version='1.0' xmlns='http://www.w3.org/2001/10/synthesis' xml:lang='en-US'>` +
          `<voice name='${VOICE}'><prosody pitch='+0Hz' rate='+2%' volume='+0%'>` +
          `${escapeXml(text)}</prosody></voice></speak>`;
        ws.send(
          `X-RequestId:${randomHex(16)}\r\n` +
          'Content-Type:application/ssml+xml\r\n' +
          `X-Timestamp:${timestamp}Z\r\n` +
          'Path:ssml\r\n\r\n' +
          ssml,
        );
      };

      ws.onmessage = (event) => {
        if (typeof event.data === 'string') {
          if (event.data.includes('Path:turn.end')) {
            settled = true;
            clearTimeout(timeout);
            ws.close();
            resolve(new Blob(chunks, { type: 'audio/mpeg' }));
          }
          return;
        }
        const buf = event.data;
        if (buf.byteLength < 2) return;
        const headerLen = new DataView(buf).getUint16(0);
        const header = decoder.decode(new Uint8Array(buf, 2, headerLen));
        if (header.includes('Path:audio')) {
          chunks.push(new Uint8Array(buf, 2 + headerLen));
        }
      };

      ws.onerror = () => {
        clearTimeout(timeout);
        fail(new Error('Edge TTS websocket error'));
      };
      ws.onclose = () => {
        clearTimeout(timeout);
        fail(new Error('Edge TTS connection closed early'));
      };
    });
  }

  // Decoding works even while the context is still locked, so lines can be
  // prepared before the first tap and play instantly afterwards.
  async decode(blob) {
    const ctx = getAudioContext();
    const data = await blob.arrayBuffer();
    return new Promise((resolve, reject) => {
      const result = ctx.decodeAudioData(data, resolve, reject);
      if (result?.then) result.then(resolve, reject);
    });
  }

  async playBuffer(buffer, seq) {
    const ctx = await resumeAudio();
    if (ctx.state !== 'running') {
      // Still locked: the browser wants a user gesture first.
      const err = new Error('Audio blocked until a user gesture');
      err.name = 'NotAllowedError';
      throw err;
    }
    const source = ctx.createBufferSource();
    source.buffer = buffer;
    source.connect(ctx.destination);
    this.currentSource = source;
    source.onended = () => {
      if (this.currentSource === source) this.currentSource = null;
      if (seq === this.requestSeq) this.onend?.();
    };
    source.start();
    if (seq === this.requestSeq) this.onstart?.();
  }

  // Plays a remote TTS URL through an <audio> element (the Zundamon
  // server streams straight into it). With timeoutMs set, a server that
  // neither answers nor errors gives up instead of hanging.
  async playAudio(src, seq, { timeoutMs = 0 } = {}) {
    const audio = new Audio(src);
    this.currentAudio = audio;
    audio.onended = () => {
      if (this.currentAudio === audio) this.currentAudio = null;
      if (seq === this.requestSeq) this.onend?.();
    };
    audio.onpause = audio.onended;
    let timer = null;
    try {
      const playing = audio.play();
      await (timeoutMs
        ? Promise.race([playing, new Promise((_, reject) => {
            timer = setTimeout(() => reject(new Error('TTS server timed out')), timeoutMs);
          })])
        : playing);
    } catch (err) {
      audio.onended = audio.onpause = null;
      audio.pause();
      audio.removeAttribute('src'); // abort a request still in flight
      if (this.currentAudio === audio) this.currentAudio = null;
      throw err;
    } finally {
      if (timer) clearTimeout(timer);
    }
    if (seq === this.requestSeq) this.onstart?.();
  }

  // ---- Zundamon: local zundamon-speech-webui (GPT-SoVITS) server ----------

  zundamonSrc(text) {
    const base = this.zundamonBase.replace(/\/+$/, '');
    return `${base}/?text=${encodeURIComponent(text)}&text_language=en`;
  }

  // ---- Fallback: browser speech synthesis --------------------------------

  pickFallbackVoice() {
    const voices = window.speechSynthesis.getVoices();
    if (!voices.length) return;
    const preferred = [/en[-_]AU/i, /en[-_]GB/i, /en[-_]US/i, /^en/i];
    for (const pattern of preferred) {
      const match =
        voices.find((v) => pattern.test(v.lang) && /female|samantha|karen|catherine|zira|libby|natasha/i.test(v.name)) ||
        voices.find((v) => pattern.test(v.lang));
      if (match) {
        this.fallbackVoice = match;
        return;
      }
    }
    this.fallbackVoice = voices[0];
  }

  speakFallback(text, seq) {
    if (!this.synthAvailable) return;
    window.speechSynthesis.cancel();
    const utterance = new SpeechSynthesisUtterance(text);
    if (this.fallbackVoice) utterance.voice = this.fallbackVoice;
    utterance.rate = 0.95;
    utterance.pitch = 1.35; // brighter, more childlike
    utterance.volume = 1;
    utterance.onstart = () => { if (seq === this.requestSeq) this.onstart?.(); };
    utterance.onend = () => { if (seq === this.requestSeq) this.onend?.(); };
    utterance.onerror = (e) => {
      if (seq !== this.requestSeq) return;
      // Before the first tap the browser refuses to speak; keep the text
      // so it plays on the next gesture instead of vanishing silently.
      if (e.error === 'not-allowed') {
        this.pendingText = text;
        this.onblocked?.();
      }
      this.onend?.();
    };
    // Chrome can swallow a speak() issued in the same tick as cancel(),
    // so give it a moment to settle first.
    setTimeout(() => {
      if (seq === this.requestSeq) window.speechSynthesis.speak(utterance);
    }, 60);
  }

  // ---- Public API ---------------------------------------------------------

  // Strip emoji and markup so they aren't read aloud.
  clean(text) {
    return text
      .replace(/[\u{1F000}-\u{1FAFF}\u{2600}-\u{27BF}\u{FE0F}\u{200D}]/gu, '')
      .replace(/\s+/g, ' ')
      .trim();
  }

  async speak(text) {
    if (!this.available) return;
    const cleaned = this.clean(text);
    if (!cleaned) return;
    // Remember the message even while the voice is off, so switching it
    // back on (or tapping replay) reads the current message, not an old one.
    this.lastText = cleaned;
    if (!this.enabled) return;
    this.stop();
    const seq = ++this.requestSeq;

    // First choice: the Zundamon voice from a locally running
    // zundamon-speech-webui server. When no server is listening the
    // attempt fails almost instantly, and after repeated failures it is
    // skipped for the rest of the session.
    if (this.zundaFailures < 3) {
      try {
        await this.playAudio(this.zundamonSrc(cleaned), seq, { timeoutMs: ZUNDAMON_TIMEOUT_MS });
        this.zundaFailures = 0;
        return;
      } catch (err) {
        if (seq !== this.requestSeq) return;
        // Autoplay policy blocked playback: the server is fine, the
        // browser just wants a user gesture first. Keep the line ready
        // for the next tap instead of counting a failure.
        if (err?.name === 'NotAllowedError') {
          this.pendingText = cleaned;
          this.onblocked?.();
          return;
        }
        this.zundaFailures += 1;
      }
    }

    // Second choice: the Edge neural voice; give up on it for this
    // session after repeated failures so every line isn't delayed by a
    // retry.
    if (this.edgeAvailable && this.edgeFailures < 3) {
      try {
        let buffer = this.cache.get(cleaned);
        if (!buffer) {
          const blob = await this.synthesise(cleaned);
          buffer = await this.decode(blob);
          if (this.cache.size > 40) this.cache.delete(this.cache.keys().next().value);
          this.cache.set(cleaned, buffer);
        }
        if (seq !== this.requestSeq) return; // superseded while synthesising
        this.edgeFailures = 0;
        await this.playBuffer(buffer, seq);
        return;
      } catch (err) {
        if (seq !== this.requestSeq) return;
        // Autoplay policy blocked playback: the audio itself is fine, the
        // browser just wants a user gesture first. Don't count it against
        // the Edge voice; keep the line ready for the next tap.
        if (err?.name === 'NotAllowedError') {
          this.pendingText = cleaned;
          this.onblocked?.();
          return;
        }
        this.edgeFailures += 1;
      }
    }
    this.speakFallback(cleaned, seq);
  }

  // Speak the most recent message again (e.g. the replay button).
  replay() {
    this.pendingText = null;
    if (this.lastText) this.speak(this.lastText);
  }

  // Call from the first user gesture: plays any line that autoplay blocked.
  unlock() {
    if (!this.enabled) return;
    const pending = this.pendingText;
    this.pendingText = null;
    if (pending && !this.isSpeaking()) this.speak(pending);
  }

  stop() {
    this.requestSeq += 1;
    this.pendingText = null;
    if (this.currentWs && this.currentWs.readyState <= WebSocket.OPEN) {
      try { this.currentWs.close(); } catch { /* already closed */ }
    }
    this.currentWs = null;
    if (this.currentSource) {
      const source = this.currentSource;
      this.currentSource = null;
      source.onended = null;
      try { source.stop(); } catch { /* not started or already stopped */ }
    }
    if (this.currentAudio) {
      const audio = this.currentAudio;
      this.currentAudio = null;
      audio.onended = audio.onpause = null;
      audio.pause();
      audio.removeAttribute('src'); // abort a request still in flight
    }
    if (this.synthAvailable) window.speechSynthesis.cancel();
    this.onend?.();
  }

  isSpeaking() {
    if (this.currentSource) return true;
    if (this.currentAudio && !this.currentAudio.paused) return true;
    return this.synthAvailable && window.speechSynthesis.speaking;
  }

  setEnabled(on) {
    this.enabled = on;
    if (!on) this.stop();
  }
}
