// DOM user interface: chat bubbles, choice chips and sheets.

import { ZONES, ZONE_ORDER, feelingById } from './zones.js';

export class UI {
  /**
   * @param {object} opts
   * @param {(id: string, label?: string) => void} opts.onChoice
   * @param {(zoneId: string) => void} opts.onLearnAsk
   * @param {(on: boolean) => void} opts.onVoiceToggle
   * @param {(on: boolean) => void} opts.onMusicToggle
   * @param {(on: boolean) => void} opts.onMotionToggle
   * @param {(text: string) => void} opts.onFreeText
   * @param {(on: boolean) => void} opts.onAIToggle
   * @param {() => void} opts.onListenStart
   * @param {() => void} opts.onReplay
   * @param {import('./journal.js').Journal} opts.journal
   */
  constructor({ onChoice, onLearnAsk, onVoiceToggle, onMusicToggle, onMotionToggle, onFreeText, onAIToggle, onListenStart, onReplay, journal }) {
    this.onChoice = onChoice;
    this.onLearnAsk = onLearnAsk;
    this.journal = journal;

    this.rileyText = document.getElementById('riley-text');
    this.choicesEl = document.getElementById('choices');
    this.chatEl = document.getElementById('chat');

    // Play the current message out loud again (also the way to hear the
    // greeting when the browser blocked audio before the first tap).
    this.replayBtn = document.getElementById('btn-replay');
    this.replayBtn.addEventListener('click', () => {
      this.setReplayAttention(false);
      onReplay?.();
    });

    // Free-text chat with Riley (AI)
    this.chatForm = document.getElementById('chat-form');
    this.chatInput = document.getElementById('chat-input');
    this.chatSend = this.chatForm.querySelector('.chat-send');
    this.chatForm.addEventListener('submit', (e) => {
      e.preventDefault();
      const text = this.chatInput.value.trim();
      if (!text || this.chatInput.disabled) return;
      this.chatInput.value = '';
      onFreeText(text);
    });

    // Voice input: speak to Riley instead of typing, where the browser
    // supports speech recognition (Chrome, Edge, Safari, Android).
    this.micBtn = document.getElementById('btn-mic');
    const SR = window.SpeechRecognition || window.webkitSpeechRecognition;
    if (SR) {
      this.micBtn.hidden = false;
      this.listening = false;
      this.recognition = new SR();
      this.recognition.lang = 'en-US';
      this.recognition.interimResults = false;
      this.recognition.maxAlternatives = 1;
      this.recognition.onresult = (e) => {
        const text = e.results[0]?.[0]?.transcript?.trim();
        if (text && !this.chatInput.disabled) onFreeText(text);
      };
      this.recognition.onend = () => this.setListening(false);
      this.recognition.onerror = () => this.setListening(false);
      this.micBtn.addEventListener('click', () => {
        if (this.listening) {
          this.recognition.stop();
          return;
        }
        onListenStart?.(); // hush Riley so the mic doesn't hear the app
        try {
          this.recognition.start();
          this.setListening(true);
        } catch { /* already started or mic unavailable */ }
      });
    }

    this.sheets = {
      learn: document.getElementById('sheet-learn'),
      journal: document.getElementById('sheet-journal'),
      settings: document.getElementById('sheet-settings'),
    };

    this.buildLearn();

    // Learn and Journal live inside the settings sheet, keeping the
    // main screen clear for the child.
    document.getElementById('btn-open-learn').addEventListener('click', () => {
      this.closeSheets();
      this.sheets.learn.hidden = false;
    });
    document.getElementById('btn-open-journal').addEventListener('click', () => {
      this.closeSheets();
      this.renderJournal();
      this.sheets.journal.hidden = false;
    });

    // Sheet close buttons + backdrop click
    for (const [name, sheet] of Object.entries(this.sheets)) {
      sheet.querySelector('.sheet-close').addEventListener('click', () => this.closeSheets());
      sheet.addEventListener('click', (e) => {
        if (e.target === sheet) this.closeSheets();
      });
    }
    document.addEventListener('keydown', (e) => {
      if (e.key === 'Escape') this.closeSheets();
    });

    // Voice toggle
    this.voiceBtn = document.getElementById('btn-voice');
    this.voiceCheck = document.getElementById('setting-voice');
    const setVoice = (on) => {
      this.voiceBtn.setAttribute('aria-pressed', String(on));
      this.voiceBtn.textContent = on ? '🔊' : '🔇';
      this.voiceCheck.checked = on;
      onVoiceToggle(on);
    };
    this.voiceBtn.addEventListener('click', () =>
      setVoice(this.voiceBtn.getAttribute('aria-pressed') !== 'true'),
    );
    this.voiceCheck.addEventListener('change', () => setVoice(this.voiceCheck.checked));

    // Background music toggle
    this.musicCheck = document.getElementById('setting-music');
    this.musicCheck.addEventListener('change', () => onMusicToggle(this.musicCheck.checked));

    // Motion toggle
    const motionCheck = document.getElementById('setting-motion');
    motionCheck.addEventListener('change', () => onMotionToggle(motionCheck.checked));

    // AI free-chat toggle
    this.aiCheck = document.getElementById('setting-ai');
    this.aiCheck.addEventListener('change', () => {
      this.setAIVisible(this.aiCheck.checked);
      onAIToggle(this.aiCheck.checked);
    });

    // Settings button
    document.getElementById('btn-settings').addEventListener('click', () => {
      this.closeSheets();
      this.sheets.settings.hidden = false;
    });

    // Journal clear
    document.getElementById('btn-clear-journal').addEventListener('click', () => {
      if (window.confirm('Clear all journal entries on this device?')) {
        this.journal.clear();
        this.renderJournal();
      }
    });
  }

  // ---- Chat ------------------------------------------------------------

  showMessage({ text, choices }) {
    this.rileyText.textContent = text;
    this.choicesEl.innerHTML = '';
    choices.forEach((choice, i) => {
      const btn = document.createElement('button');
      btn.className = 'choice';
      btn.style.setProperty('--i', i);
      btn.textContent = choice.label;
      btn.addEventListener('click', () => this.onChoice(choice.id, choice.label));
      this.choicesEl.appendChild(btn);
    });
  }

  setMusicChecked(on) {
    this.musicCheck.checked = on;
  }

  setReplayVisible(on) {
    this.replayBtn.hidden = !on;
    if (!on) this.setReplayAttention(false);
  }

  setReplayAttention(on) {
    this.replayBtn.classList.toggle('needs-attention', on);
  }

  setListening(on) {
    this.listening = on;
    this.micBtn.classList.toggle('is-listening', on);
    this.micBtn.setAttribute('aria-pressed', String(on));
    this.chatInput.placeholder = on ? 'Listening… speak to Riley' : 'Tell Riley how you feel…';
  }

  // While Riley is thinking of an AI reply the input is locked so the
  // child can't queue up several messages at once.
  setThinking(on) {
    this.chatInput.disabled = on;
    this.chatSend.disabled = on;
    this.micBtn.disabled = on;
    if (on) this.showMessage({ text: '💭 Hmm, let me think…', choices: [] });
  }

  // The settings toggle reflects the child's choice; the form itself can
  // also hide when the AI service is unreachable, without flipping the
  // setting off behind their back.
  setAIVisible(on) {
    this.chatForm.hidden = !on;
    this.aiCheck.checked = on;
  }

  setChatVisible(on) {
    this.chatForm.hidden = !on;
  }

  setZone(zoneId) {
    const zone = zoneId ? ZONES[zoneId] : null;
    const root = document.documentElement;
    root.style.setProperty('--zone', zone ? zone.css : '#F0716A');
    root.style.setProperty('--zone-soft', zone ? zone.cssSoft : '#FBE4DE');
    document.getElementById('brand-heart').textContent = zone ? zone.emoji : '💗';
  }

  // ---- Sheets ------------------------------------------------------------

  closeSheets() {
    for (const sheet of Object.values(this.sheets)) sheet.hidden = true;
  }

  // ---- Learn ---------------------------------------------------------------

  buildLearn() {
    const grid = document.getElementById('learn-grid');
    for (const zoneId of ZONE_ORDER) {
      const zone = ZONES[zoneId];
      const card = document.createElement('div');
      card.className = 'learn-card';
      card.style.borderColor = zone.css;
      card.style.background = zone.cssSoft;
      card.innerHTML = `
        <h3>${zone.emoji} ${zone.name}</h3>
        <span class="learn-tagline">${zone.tagline.toUpperCase()}</span>
        <p class="learn-desc">${zone.description}</p>
        <div class="feeling-chips">
          ${zone.feelings.map((f) => `<span class="feeling-chip">${f.emoji} ${f.label}</span>`).join('')}
        </div>`;
      const ask = document.createElement('button');
      ask.className = 'learn-ask';
      ask.textContent = '💬 Ask Riley about this zone';
      ask.addEventListener('click', () => {
        this.closeSheets();
        this.onLearnAsk(zoneId);
      });
      card.appendChild(ask);
      grid.appendChild(card);
    }
  }

  // ---- Journal ----------------------------------------------------------------

  renderJournal() {
    const list = document.getElementById('journal-list');
    const entries = this.journal.recent(50);
    if (!entries.length) {
      list.innerHTML = '<p class="journal-empty">No check-ins yet. Tell Riley how you feel! 💗</p>';
      return;
    }
    const afterLabels = { better: '😊 Felt better', same: '😐 The same', worse: '😟 Not great' };
    list.innerHTML = '';
    for (const entry of entries) {
      const zone = ZONES[entry.zone];
      const feeling = entry.feeling ? feelingById(entry.feeling) : null;
      const row = document.createElement('div');
      row.className = 'journal-entry';
      const when = new Date(entry.ts).toLocaleString(undefined, {
        day: 'numeric', month: 'short', hour: 'numeric', minute: '2-digit',
      });
      row.innerHTML = `
        <span class="journal-zone" style="background:${zone?.cssSoft || '#eee'}">${feeling ? feeling.emoji : zone?.emoji || '💗'}</span>
        <span class="journal-main">
          <span class="journal-feeling">${feeling ? feeling.label : zone?.name || 'Check-in'}</span>
          <br><span class="journal-date">${when} · ${zone ? zone.name : ''}</span>
        </span>
        ${entry.after ? `<span class="journal-after">${afterLabels[entry.after] || ''}</span>` : ''}`;
      list.appendChild(row);
    }
  }
}
