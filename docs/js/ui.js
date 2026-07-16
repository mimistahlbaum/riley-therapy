// DOM user interface: chat bubbles, choice chips, mode tabs and sheets.

import { ZONES, ZONE_ORDER, ACTIVITIES, feelingById } from './zones.js';

export class UI {
  /**
   * @param {object} opts
   * @param {(id: string) => void} opts.onChoice
   * @param {(activityId: string) => void} opts.onToolboxPick
   * @param {(zoneId: string) => void} opts.onLearnAsk
   * @param {(on: boolean) => void} opts.onVoiceToggle
   * @param {(on: boolean) => void} opts.onMotionToggle
   * @param {import('./journal.js').Journal} opts.journal
   */
  constructor({ onChoice, onToolboxPick, onLearnAsk, onVoiceToggle, onMotionToggle, journal }) {
    this.onChoice = onChoice;
    this.onToolboxPick = onToolboxPick;
    this.onLearnAsk = onLearnAsk;
    this.journal = journal;

    this.rileyText = document.getElementById('riley-text');
    this.choicesEl = document.getElementById('choices');
    this.chatEl = document.getElementById('chat');

    this.sheets = {
      toolbox: document.getElementById('sheet-toolbox'),
      learn: document.getElementById('sheet-learn'),
      journal: document.getElementById('sheet-journal'),
      settings: document.getElementById('sheet-settings'),
    };

    this.buildToolbox();
    this.buildLearn();

    // Tabs
    this.tabs = [...document.querySelectorAll('.tab')];
    for (const tab of this.tabs) {
      tab.addEventListener('click', () => this.openTab(tab.dataset.tab));
    }

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

    // Motion toggle
    const motionCheck = document.getElementById('setting-motion');
    motionCheck.addEventListener('change', () => onMotionToggle(motionCheck.checked));

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
      btn.addEventListener('click', () => this.onChoice(choice.id));
      this.choicesEl.appendChild(btn);
    });
  }

  setZone(zoneId) {
    const zone = zoneId ? ZONES[zoneId] : null;
    const root = document.documentElement;
    root.style.setProperty('--zone', zone ? zone.css : '#F0716A');
    root.style.setProperty('--zone-soft', zone ? zone.cssSoft : '#FBE4DE');
    document.getElementById('brand-heart').textContent = zone ? zone.emoji : '💗';
  }

  // ---- Tabs and sheets ---------------------------------------------------

  openTab(name) {
    for (const tab of this.tabs) tab.classList.toggle('is-active', tab.dataset.tab === name);
    this.closeSheets(false);
    if (name === 'checkin') return;
    if (name === 'journal') this.renderJournal();
    this.sheets[name].hidden = false;
  }

  closeSheets(resetTab = true) {
    for (const sheet of Object.values(this.sheets)) sheet.hidden = true;
    if (resetTab) {
      for (const tab of this.tabs) tab.classList.toggle('is-active', tab.dataset.tab === 'checkin');
    }
  }

  // ---- Toolbox -----------------------------------------------------------

  buildToolbox() {
    const grid = document.getElementById('toolbox-grid');
    for (const activity of Object.values(ACTIVITIES)) {
      const zones = ZONE_ORDER.filter((z) => ZONES[z].activities.includes(activity.id));
      const card = document.createElement('button');
      card.className = 'tool-card';
      card.innerHTML = `
        <span class="tool-emoji">${activity.emoji}</span>
        <span class="tool-name">${activity.name}</span>
        <span class="tool-blurb">${activity.blurb}</span>
        <span class="tool-zones" aria-label="Good for: ${zones.map((z) => ZONES[z].name).join(', ')}">
          ${zones.map((z) => `<span class="zone-dot" style="background:${ZONES[z].css}"></span>`).join('')}
        </span>`;
      card.addEventListener('click', () => {
        this.closeSheets();
        this.onToolboxPick(activity.id);
      });
      grid.appendChild(card);
    }
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
      list.innerHTML = '<p class="journal-empty">No check-ins yet. Tap “Check in” and tell Riley how you feel! 💗</p>';
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
