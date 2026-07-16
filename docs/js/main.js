// Riley — Emotional Wellness Companion
// Bootstraps the 3D world, character, conversation, UI, speech and WebXR.

import * as THREE from 'three';
import { World } from './scene.js';
import { Riley } from './riley.js';
import { Dialogue } from './dialogue.js';
import { Journal } from './journal.js';
import { Speech } from './speech.js';
import { BGM } from './bgm.js';
import { resumeAudio } from './audio.js';
import { UI } from './ui.js';
import { XRManager } from './vr.js';
import { ZONES, ACTIVITIES } from './zones.js';
import { RileyAI, looksLikeCrisis } from './ai.js';

const canvas = document.getElementById('scene');
const world = new World(canvas);

const riley = new Riley();
riley.group.scale.setScalar(1.15);
world.scene.add(riley.group);
world.onUpdate((dt, time) => riley.update(dt, time));

const journal = new Journal();
const speech = new Speech();

// Gentle background music, ducked while Riley speaks so the voice
// always stays on top.
const bgm = new BGM();
let bgmEnabled = true;
try {
  bgmEnabled = localStorage.getItem('riley-bgm-enabled') !== 'false';
} catch { /* storage unavailable: keep default */ }

// Riley's little mouth moves while the voice is playing.
speech.onstart = () => {
  riley.setTalking(true);
  ui.setReplayAttention(false);
  bgm.setDucked(true);
};
speech.onend = () => {
  riley.setTalking(false);
  bgm.setDucked(false);
};
// The browser blocked audio before the first tap: make the replay
// button pulse so it's obvious how to hear Riley.
speech.onblocked = () => ui.setReplayAttention(true);

let ui; // assigned below; dialogue callbacks fire only after start()

const dialogue = new Dialogue({
  journal,
  onMessage: (msg) => {
    ui.showMessage(msg);
    xr.panel.setMessage(msg);
    speech.speak(msg.text);
    // Every message Riley shows — scripted or AI — joins the AI's memory,
    // so typing mid-flow continues the conversation instead of restarting it.
    ai.note('assistant', msg.text);
  },
  onZone: (zoneId) => {
    const zone = zoneId ? ZONES[zoneId] : null;
    // Riley's chest heart takes on the colour of the chosen zone,
    // and rests as warm coral between check-ins.
    riley.setZoneColor(zone ? zone.color : 0xf0716a);
    ui.setZone(zoneId);
    xr.panel.setZoneColor(zone ? zone.css : null);
  },
  onBreath: (breath) => riley.setBreath(breath),
  onGesture: (gesture) => riley.setGesture(gesture),
});

// ---- AI free chat ------------------------------------------------------

const ai = new RileyAI();
let aiEnabled = true;
try {
  aiEnabled = localStorage.getItem('riley-ai-enabled') !== 'false';
} catch { /* storage unavailable: keep default */ }

// With free chat available, the check-in starts as open conversation
// (the original narrative design) instead of a feeling picker.
dialogue.freeChat = () => aiEnabled && ai.available;

// Choice ids beginning with "ai:" are tappable suggestions from the AI;
// everything else belongs to the scripted dialogue.
function routeChoice(id, label) {
  if (id.startsWith('ai:')) return handleFreeText(id.slice(3));
  if (label) ai.note('user', label);
  return dialogue.choose(id);
}

async function handleFreeText(text) {
  // A leftover AI suggestion tapped after free chat was switched off:
  // restart the scripted check-in rather than doing nothing.
  if (!aiEnabled) return dialogue.start();
  dialogue.clearTimers();
  dialogue.activity = null;
  dialogue.state = 'ai';

  // Safety first: these messages never go to the AI. The app answers
  // itself and points the child to a trusted adult.
  if (looksLikeCrisis(text)) {
    dialogue.emit(
      'Thank you for trusting me with something so important. This is too big for us to carry alone — please tell a trusted grown-up right away: a parent, carer or teacher. You deserve help and care, always. 💗',
      [
        { id: 'activity:talk', label: '💬 Practise telling someone' },
        { id: 'restart', label: '↩️ Check in with Riley' },
      ],
    );
    return;
  }

  ui.setThinking(true);
  const res = await ai.chat(text, dialogue.zoneId);
  ui.setThinking(false);

  if (!res) {
    // The AI couldn't answer even after a retry: offer to try once more
    // and carry on with the scripted feeling list so the child never
    // lands in a dead end. While the service is down the text input
    // hides too; it comes back when the AI recovers.
    ui.setChatVisible(aiEnabled && ai.available);
    dialogue.state = 'greeting';
    dialogue.emit(
      'Oh! My thinking cloud drifted away for a moment. We can try again, or use the buttons — which of these feels closest? 💗',
      [{ id: `ai:${text}`, label: '🔁 Try again' }, ...dialogue.feelingChoices()],
    );
    return;
  }
  ui.setChatVisible(true);

  if (res.zone) {
    // A zone worked out in conversation counts as a check-in: journal it
    // (once per zone change) and let the heart take the zone colour.
    if (res.zone !== dialogue.zoneId) {
      journal.add({ zone: res.zone, feeling: res.feeling || null });
    }
    dialogue.setZone(res.zone);
  }
  riley.setGesture('nod');

  const choices = [];
  if (res.activity) {
    const a = ACTIVITIES[res.activity];
    choices.push({ id: `activity:${a.id}`, label: `${a.emoji} Try ${a.name.toLowerCase()}` });
  }
  for (const s of res.suggestions) choices.push({ id: `ai:${s}`, label: s });
  choices.push({ id: 'restart', label: '💬 Check in' });
  dialogue.emit(res.reply, choices);
}

ui = new UI({
  journal,
  onChoice: routeChoice,
  onLearnAsk: (zoneId) => {
    const zone = ZONES[zoneId];
    dialogue.clearTimers();
    dialogue.setZone(zoneId);
    dialogue.state = 'learn';
    dialogue.emit(`${zone.emoji} ${zone.description}`, [
      { id: 'accept-activity', label: `✨ Try a ${zone.name} tool` },
      { id: 'restart', label: '💬 Check in with Riley' },
    ]);
  },
  onVoiceToggle: (on) => {
    speech.setEnabled(on);
    ui.setReplayVisible(on);
    if (on) speech.replay();
  },
  onReplay: () => speech.replay(),
  onMotionToggle: (on) => world.setMotion(on),
  onBGMToggle: (on) => {
    bgmEnabled = on;
    try {
      localStorage.setItem('riley-bgm-enabled', String(on));
    } catch { /* storage unavailable */ }
    bgm.setEnabled(on);
  },
  onFreeText: handleFreeText,
  onListenStart: () => speech.stop(),
  onAIToggle: (on) => {
    aiEnabled = on;
    try {
      localStorage.setItem('riley-ai-enabled', String(on));
    } catch { /* storage unavailable */ }
    ui.setChatVisible(on && ai.available);
    // Refresh the conversation so no stale AI suggestion chips linger and
    // the greeting matches the new mode straight away.
    if (dialogue.state === 'greeting' || dialogue.state === 'ai') dialogue.start();
  },
});
ui.setAIVisible(aiEnabled);
ui.setReplayVisible(speech.available && speech.enabled);
ui.setBGMChecked(bgmEnabled);
bgm.setEnabled(bgmEnabled);

// ---- WebXR -----------------------------------------------------------

const rileyHome = new THREE.Vector3(0, 0, 0);
const rileyXR = new THREE.Vector3(-0.35, 0, -1.35);

const xr = new XRManager(world, {
  onChoice: routeChoice,
  onSessionChange: (active) => {
    if (active) {
      riley.group.position.copy(rileyXR);
      riley.group.lookAt(0, 0, 1);
      riley.setGesture('wave');
    } else {
      riley.group.position.copy(rileyHome);
      riley.group.rotation.set(0, 0, 0);
    }
  },
});

const xrButtons = document.getElementById('xr-buttons');
const vrBtn = document.getElementById('btn-vr');
const arBtn = document.getElementById('btn-ar');
xr.detectSupport().then(({ vr, ar }) => {
  if (vr || ar) xrButtons.hidden = false;
  vrBtn.hidden = !vr;
  arBtn.hidden = !ar;
});
vrBtn.addEventListener('click', () => xr.start('vr'));
arBtn.addEventListener('click', () => xr.start('ar'));

// ---- Go --------------------------------------------------------------

world.start();
dialogue.start();

// Browsers block audio until the first interaction. Every tap tries to
// unlock the shared AudioContext, restart any music the autoplay policy
// blocked and play any line it swallowed. Listening to every tap (not
// just the first) means one failed early attempt can't leave the app
// silent for the rest of the session.
window.addEventListener('pointerdown', async () => {
  await resumeAudio();
  bgm.unlock();
  speech.unlock();
});

document.getElementById('loading').classList.add('is-done');
