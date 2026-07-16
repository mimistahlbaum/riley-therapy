// Riley's conversation engine: a guided, scripted check-in based on the
// Zones of Regulation. Fully client-side (no API keys, no network), so it
// is dependable for children and safe to host as a static site.

import { ZONES, ZONE_ORDER, ACTIVITIES, FEELING_TO_ZONE, feelingById, activitiesForZone } from './zones.js';

function pick(list) {
  return list[Math.floor(Math.random() * list.length)];
}

const GREETINGS = [
  'Hi, I’m Riley! It’s so nice to see you. 💗',
  'Hello friend! I’m Riley, and I’m really glad you’re here. 💗',
  'Hi there! Riley here, ready to listen. 💗',
];

const REFLECTIONS = {
  blue: 'Thank you for telling me. Feeling {feeling} can make your body slow and heavy. That sounds like the Blue Zone. 💙',
  green: 'Yay, I’m happy to hear that! Feeling {feeling} sounds like the Green Zone: calm and ready. 💚',
  yellow: 'Thanks for sharing. Feeling {feeling} can make your engine speed up inside. That sounds like the Yellow Zone. 💛',
  red: 'Thank you for being brave and telling me. Feeling {feeling} is a really big feeling. That sounds like the Red Zone. ❤️',
};

const ZONE_FOLLOWUPS = {
  blue: 'It’s okay to be in the Blue Zone. Would you like to try something gentle that might help?',
  green: 'The Green Zone is a lovely place to be! Want to try something fun to keep your calm superpowers strong?',
  yellow: 'Everyone visits the Yellow Zone. I know some tools that can help your engine slow down. Want to try one?',
  red: 'The Red Zone is safe to visit with me. I know some strong tools that can help the big feeling pass. Want to try one?',
};

export class Dialogue {
  /**
   * @param {object} opts
   * @param {(msg: {text: string, choices: Array<{id: string, label: string}>}) => void} opts.onMessage
   * @param {(zoneId: string|null) => void} opts.onZone
   * @param {(breath: {phase: 'in'|'hold'|'out'|null, seconds?: number}) => void} opts.onBreath
   * @param {(gesture: string) => void} opts.onGesture
   * @param {import('./journal.js').Journal} opts.journal
   */
  constructor({ onMessage, onZone, onBreath, onGesture, journal }) {
    this.onMessage = onMessage;
    this.onZone = onZone;
    this.onBreath = onBreath;
    this.onGesture = onGesture;
    this.journal = journal;
    this.timers = [];
    this.state = 'idle';
    this.zoneId = null;
    this.feeling = null;
    this.activity = null;
    this.activityStep = 0;
  }

  emit(text, choices = []) {
    this.onMessage({ text, choices });
  }

  clearTimers() {
    for (const t of this.timers) clearTimeout(t);
    this.timers = [];
    this.onBreath({ phase: null });
  }

  after(seconds, fn) {
    this.timers.push(setTimeout(fn, seconds * 1000));
  }

  // ---- Check-in flow -------------------------------------------------

  start() {
    this.clearTimers();
    this.state = 'greeting';
    this.zoneId = null;
    this.feeling = null;
    this.onZone(null);
    this.onGesture('wave');
    // With free chat available, Riley works out the feeling from the
    // conversation itself (like the original narrative design). The list
    // stays one tap away for children who prefer it and for VR.
    if (this.freeChat?.()) {
      this.emit(`${pick(GREETINGS)} How are you feeling right now?`, [
        { id: 'show-feelings', label: '🙂 Pick from a list instead' },
        { id: 'show-toolbox', label: '🧰 Toolbox' },
      ]);
      return;
    }
    this.emit(`${pick(GREETINGS)} How are you feeling right now?`, [
      ...this.feelingChoices(),
      { id: 'show-toolbox', label: '🧰 Toolbox' },
    ]);
  }

  feelingChoices() {
    const choices = [];
    for (const zoneId of ZONE_ORDER) {
      for (const f of ZONES[zoneId].feelings) {
        choices.push({ id: `feeling:${f.id}`, label: `${f.emoji} ${f.label}` });
      }
    }
    choices.push({ id: 'unsure', label: '🤔 I’m not sure' });
    return choices;
  }

  choose(id) {
    // Any tap cancels pending timed steps so the child stays in control.
    if (id.startsWith('feeling:')) return this.handleFeeling(id.slice(8));

    switch (id) {
      case 'show-feelings':
        this.state = 'greeting';
        return this.emit('Of course! Which of these feels closest right now?', this.feelingChoices());
      case 'show-toolbox':
        return this.openToolbox();
      case 'unsure':
        return this.handleUnsure();
      case 'accept-activity':
        return this.offerActivities();
      case 'decline-activity':
        return this.handleDecline();
      case 'skip-activities':
        return this.closeGently();
      case 'restart':
        return this.start();
      case 'recheck-better':
        return this.handleRecheck('better');
      case 'recheck-same':
        return this.handleRecheck('same');
      case 'recheck-worse':
        return this.handleRecheck('worse');
      case 'another-activity':
        return this.offerActivities();
      case 'finish':
        return this.closeGently();
      case 'activity-next':
        return this.activityNext();
      case 'activity-next-step':
        return this.runStep(this.pendingStep ?? 1);
      case 'activity-count':
        return this.activityCount();
      case 'activity-done':
        return this.finishActivity();
      case 'activity-stop':
        return this.stopActivity();
      default:
        if (id.startsWith('toolbox-zone:')) return this.showToolboxTools(id.slice(13));
        if (id.startsWith('zone:')) return this.handleZonePick(id.slice(5));
        if (id.startsWith('activity:')) return this.startActivity(id.slice(9));
        return this.start();
    }
  }

  handleUnsure() {
    this.state = 'pick-zone';
    this.emit(
      'That’s okay! Sometimes feelings are tricky to name. Which colour feels most like your body right now?',
      [
        ...ZONE_ORDER.map((z) => ({
          id: `zone:${z}`,
          label: `${ZONES[z].emoji} ${ZONES[z].name}: ${ZONES[z].tagline}`,
        })),
        { id: 'restart', label: '↩️ Start again' },
      ],
    );
  }

  handleFeeling(feelingId) {
    const zoneId = FEELING_TO_ZONE[feelingId];
    if (!zoneId) return this.start();
    this.feeling = feelingById(feelingId);
    this.setZone(zoneId);
    this.journal.add({ zone: zoneId, feeling: feelingId });
    const reflection = REFLECTIONS[zoneId].replace('{feeling}', this.feeling.label.toLowerCase());
    this.state = 'zone-detected';
    this.onGesture(zoneId === 'green' ? 'celebrate' : 'nod');
    this.emit(`${reflection} ${ZONE_FOLLOWUPS[zoneId]}`, [
      { id: 'accept-activity', label: '✨ Yes, let’s try!' },
      { id: 'decline-activity', label: '🙅 Not right now' },
    ]);
  }

  handleZonePick(zoneId) {
    if (!ZONES[zoneId]) return this.start();
    this.feeling = null;
    this.setZone(zoneId);
    this.journal.add({ zone: zoneId, feeling: null });
    this.state = 'zone-detected';
    this.onGesture(zoneId === 'green' ? 'celebrate' : 'nod');
    this.emit(
      `The ${ZONES[zoneId].name}, got it. My heart is glowing ${zoneId} for you now. ${ZONE_FOLLOWUPS[zoneId]}`,
      [
        { id: 'accept-activity', label: '✨ Yes, let’s try!' },
        { id: 'decline-activity', label: '🙅 Not right now' },
      ],
    );
  }

  setZone(zoneId) {
    this.zoneId = zoneId;
    this.onZone(zoneId);
  }

  handleDecline() {
    this.state = 'closing';
    this.emit(
      'That’s completely okay. Just noticing your feeling is already a big step, and I’m proud of you. I’ll be right here whenever you need me. 💗',
      [{ id: 'restart', label: '💬 Check in again' }],
    );
  }

  offerActivities() {
    const zoneId = this.zoneId || 'green';
    const activities = activitiesForZone(zoneId);
    this.state = 'pick-activity';
    this.emit(
      'Here are some tools that work really well for this zone. Which one would you like to try?',
      [
        ...activities.map((a) => ({ id: `activity:${a.id}`, label: `${a.emoji} ${a.name}` })),
        { id: 'show-toolbox', label: '🧰 More tools' },
        { id: 'skip-activities', label: '🙅 Maybe later' },
      ],
    );
  }

  // The toolbox inside the same conversation: no separate screen, and
  // never every tool at once. The child first picks a zone, then sees
  // just that zone's few tools, and the flow carries straight on to the
  // activity and the body check afterwards.
  openToolbox() {
    this.clearTimers();
    this.activity = null;
    this.state = 'toolbox';
    this.emit(
      '🧰 Here’s my toolbox! Each zone has its own little set of tools. Which zone shall we look in?',
      [
        ...ZONE_ORDER.map((z) => ({
          id: `toolbox-zone:${z}`,
          label: `${ZONES[z].emoji} ${ZONES[z].name}: ${ZONES[z].tagline}`,
        })),
        { id: 'restart', label: '💬 Check in instead' },
      ],
    );
  }

  showToolboxTools(zoneId) {
    if (!ZONES[zoneId]) return this.openToolbox();
    const zone = ZONES[zoneId];
    this.state = 'toolbox';
    this.emit(
      `${zone.emoji} These tools are just right for ${zone.name} feelings. Which one shall we try together?`,
      [
        ...activitiesForZone(zoneId).map((a) => ({ id: `activity:${a.id}`, label: `${a.emoji} ${a.name}` })),
        { id: 'show-toolbox', label: '↩️ Other zones' },
      ],
    );
  }

  // ---- Activities ----------------------------------------------------

  startActivity(activityId) {
    const activity = ACTIVITIES[activityId];
    if (!activity) return this.offerActivities();
    this.clearTimers();
    this.activity = activity;
    this.activityStep = 0;
    this.state = 'activity';
    this.emit(`${activity.emoji} ${activity.intro}`, [
      { id: 'activity-next', label: '▶️ I’m ready!' },
      { id: 'activity-stop', label: '⏹️ Stop' },
    ]);
  }

  activityNext() {
    const a = this.activity;
    if (!a) return this.start();
    if (a.type === 'breathing') return this.runBreathCycle(1);
    if (a.type === 'count') {
      this.activityStep = a.from;
      return this.activityCount(true);
    }
    // steps
    return this.runStep(0);
  }

  runStep(index) {
    const a = this.activity;
    if (!a || !a.steps || index >= a.steps.length) return this.finishActivity();
    this.activityStep = index;
    const step = a.steps[index];
    const isLast = index === a.steps.length - 1;
    this.emit(step.text, [
      { id: isLast ? 'activity-done' : 'activity-next-step', label: step.button },
      { id: 'activity-stop', label: '⏹️ Stop' },
    ]);
    // Reuse choose() routing for the intermediate step button.
    if (!isLast) {
      this.pendingStep = index + 1;
    }
  }

  runBreathCycle(cycle) {
    const a = this.activity;
    if (!a) return;
    const total = a.cycles;
    if (cycle > total) return this.finishActivity();
    this.emit(`Round ${cycle} of ${total}: Breathe in slowly through your nose... 🌬️`, [
      { id: 'activity-stop', label: '⏹️ Stop' },
    ]);
    this.onBreath({ phase: 'in', seconds: a.inhale });
    this.after(a.inhale, () => {
      this.emit('Hold it gently...', [{ id: 'activity-stop', label: '⏹️ Stop' }]);
      this.onBreath({ phase: 'hold', seconds: a.hold });
      this.after(a.hold, () => {
        this.emit('And slowly breathe all the way out... 😮‍💨', [
          { id: 'activity-stop', label: '⏹️ Stop' },
        ]);
        this.onBreath({ phase: 'out', seconds: a.exhale });
        this.after(a.exhale, () => this.runBreathCycle(cycle + 1));
      });
    });
  }

  activityCount(first = false) {
    const a = this.activity;
    if (!a) return;
    if (!first) {
      this.activityStep += a.from < a.to ? 1 : -1;
    }
    const n = this.activityStep;
    const finished = a.from < a.to ? n > a.to : n < a.to;
    if (finished) return this.finishActivity();
    const isLast = n === a.to;
    this.emit(`${'⭐'.repeat(Math.min(5, Math.abs(n - a.from) + 1))} ${n}!`, [
      { id: isLast ? 'activity-done' : 'activity-count', label: isLast ? '🎉 Finish' : `Next: ${a.from < a.to ? n + 1 : n - 1}` },
      { id: 'activity-stop', label: '⏹️ Stop' },
    ]);
  }

  finishActivity() {
    const a = this.activity;
    this.clearTimers();
    this.activity = null;
    this.onGesture('celebrate');
    // Every activity flows into the same gentle body check, so check-in,
    // tools and feedback feel like one conversation.
    this.state = 'recheck';
    this.emit(`${a ? a.outro : 'All done!'} How does your body feel now?`, [
      { id: 'recheck-better', label: '😊 Better' },
      { id: 'recheck-same', label: '😐 The same' },
      { id: 'recheck-worse', label: '😟 Not great' },
    ]);
  }

  stopActivity() {
    this.clearTimers();
    this.activity = null;
    this.state = 'pick-activity';
    this.emit('No worries, we can stop. You’re the boss of your own body. 💗 Would you like to try a different tool instead?', [
      { id: 'show-toolbox', label: '🧰 See the tools' },
      { id: 'skip-activities', label: '🙅 Maybe later' },
    ]);
  }

  handleRecheck(result) {
    this.journal.amendLast({ after: result });
    if (result === 'better') {
      this.setZone('green');
      this.onGesture('celebrate');
      this.state = 'closing';
      this.emit(
        'That makes my heart glow green! 💚 You used a tool and helped your own body. That’s a real superpower. Come back and see me any time.',
        [
          { id: 'restart', label: '💬 Check in again' },
          { id: 'another-activity', label: '🧰 Try another tool' },
        ],
      );
      return;
    }
    if (result === 'same') {
      this.state = 'pick-activity';
      this.emit(
        'That’s okay. Feelings sometimes need a little more time, and that’s normal. Want to try another tool together?',
        [
          { id: 'another-activity', label: '✨ Yes, another one' },
          { id: 'finish', label: '🙅 Not right now' },
        ],
      );
      return;
    }
    this.state = 'closing';
    this.emit(
      'Thank you for telling me the truth. When feelings stay big or heavy, the best tool of all is a trusted grown-up: a parent, carer or teacher. Could you tell one of them how you feel? You deserve help and care. 💗',
      [
        { id: 'another-activity', label: '🧰 Try one more tool' },
        { id: 'restart', label: '💬 Check in again' },
      ],
    );
  }

  closeGently() {
    this.state = 'closing';
    this.emit(
      'Okay! Remember: all feelings are okay, and they always pass, like weather. I’ll be right here whenever you want to talk. 💗',
      [{ id: 'restart', label: '💬 Check in again' }],
    );
  }
}
