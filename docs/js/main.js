// Riley — Emotional Wellness Companion
// Bootstraps the 3D world, character, conversation, UI, speech and WebXR.

import * as THREE from 'three';
import { World } from './scene.js';
import { Riley } from './riley.js';
import { Dialogue } from './dialogue.js';
import { Journal } from './journal.js';
import { Speech } from './speech.js';
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
// Riley's little mouth moves while the voice is playing.
speech.onstart = () => riley.setTalking(true);
speech.onend = () => riley.setTalking(false);

let ui; // assigned below; dialogue callbacks fire only after start()

const dialogue = new Dialogue({
  journal,
  onMessage: (msg) => {
    ui.showMessage(msg);
    xr.panel.setMessage(msg);
    speech.speak(msg.text);
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
function routeChoice(id) {
  if (id.startsWith('ai:')) return handleFreeText(id.slice(3));
  return dialogue.choose(id);
}

async function handleFreeText(text) {
  if (!aiEnabled) return;
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
    dialogue.emit(
      'Oh! My thinking cloud drifted away for a moment. Let’s use the buttons together instead. 💗',
      [{ id: 'restart', label: '💬 Check in with Riley' }],
    );
    return;
  }

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
  onToolboxPick: (activityId) => dialogue.startActivity(activityId, { fromToolbox: true }),
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
  onVoiceToggle: (on) => speech.setEnabled(on),
  onMotionToggle: (on) => world.setMotion(on),
  onFreeText: handleFreeText,
  onListenStart: () => speech.stop(),
  onAIToggle: (on) => {
    aiEnabled = on;
    try {
      localStorage.setItem('riley-ai-enabled', String(on));
    } catch { /* storage unavailable */ }
    // Refresh the greeting so it matches the new mode straight away.
    if (dialogue.state === 'greeting') dialogue.start();
  },
});
ui.setAIVisible(aiEnabled);

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

// Browsers block audio until the first interaction; re-speak the greeting
// once the user interacts so the intro isn't silently lost.
let resumed = false;
window.addEventListener(
  'pointerdown',
  () => {
    if (!resumed) {
      resumed = true;
      if (speech.available && speech.enabled && !speech.isSpeaking()) {
        speech.speak(document.getElementById('riley-text').textContent);
      }
    }
  },
  { once: true },
);

document.getElementById('loading').classList.add('is-done');
