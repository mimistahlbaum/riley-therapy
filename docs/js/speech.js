// Text-to-speech for Riley using Microsoft Edge's neural voices
// (the same online voices Edge uses for Read Aloud), spoken with
// "Ana" — a warm, natural child voice.
//
// Audio is synthesised over the Edge Read Aloud websocket endpoint and
// played back as MP3. If the service can't be reached (offline, blocked
// network), Riley falls back to the browser's built-in speech synthesis
// so the app keeps working everywhere, including the Quest browser.

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

    this.currentAudio = null;
    this.currentWs = null;
    this.requestSeq = 0;
    this.edgeFailures = 0;
    this.cache = new Map(); // cleaned text -> audio Blob

    // Fallback: browser speech synthesis.
    this.synthAvailable = typeof window !== 'undefined' && 'speechSynthesis' in window;
    this.fallbackVoice = null;
    if (this.synthAvailable) {
      this.pickFallbackVoice();
      window.speechSynthesis.onvoiceschanged = () => this.pickFallbackVoice();
    }
    this.available = (typeof WebSocket !== 'undefined' && 'subtle' in (crypto || {})) || this.synthAvailable;
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
      const timeout = setTimeout(() => fail(new Error('Edge TTS timed out')), 10000);

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

  async playBlob(blob, seq) {
    const audio = new Audio(URL.createObjectURL(blob));
    this.currentAudio = audio;
    audio.onended = () => {
      URL.revokeObjectURL(audio.src);
      if (this.currentAudio === audio) this.currentAudio = null;
      if (seq === this.requestSeq) this.onend?.();
    };
    audio.onpause = audio.onended;
    await audio.play();
    if (seq === this.requestSeq) this.onstart?.();
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
    window.speechSynthesis.speak(utterance);
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
    if (!this.available || !this.enabled) return;
    const cleaned = this.clean(text);
    if (!cleaned) return;
    this.stop();
    const seq = ++this.requestSeq;

    // Prefer the Edge neural voice; give up on it for this session
    // after repeated failures so every line isn't delayed by a retry.
    if (this.edgeFailures < 3) {
      try {
        let blob = this.cache.get(cleaned);
        if (!blob) {
          blob = await this.synthesise(cleaned);
          if (this.cache.size > 40) this.cache.delete(this.cache.keys().next().value);
          this.cache.set(cleaned, blob);
        }
        if (seq !== this.requestSeq) return; // superseded while synthesising
        this.edgeFailures = 0;
        await this.playBlob(blob, seq);
        return;
      } catch {
        this.edgeFailures += 1;
        if (seq !== this.requestSeq) return;
      }
    }
    this.speakFallback(cleaned, seq);
  }

  stop() {
    this.requestSeq += 1;
    if (this.currentWs && this.currentWs.readyState <= WebSocket.OPEN) {
      try { this.currentWs.close(); } catch { /* already closed */ }
    }
    this.currentWs = null;
    if (this.currentAudio) {
      const audio = this.currentAudio;
      this.currentAudio = null;
      audio.onended = audio.onpause = null;
      audio.pause();
      URL.revokeObjectURL(audio.src);
    }
    if (this.synthAvailable) window.speechSynthesis.cancel();
    this.onend?.();
  }

  isSpeaking() {
    if (this.currentAudio && !this.currentAudio.paused) return true;
    return this.synthAvailable && window.speechSynthesis.speaking;
  }

  setEnabled(on) {
    this.enabled = on;
    if (!on) this.stop();
  }
}
