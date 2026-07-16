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
import { ZONES } from './zones.js';

const canvas = document.getElementById('scene');
const world = new World(canvas);

const riley = new Riley();
world.scene.add(riley.group);
world.onUpdate((dt, time) => riley.update(dt, time));

const journal = new Journal();
const speech = new Speech();

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
    riley.setZoneColor(zone ? zone.color : 0x34c759);
    ui.setZone(zoneId);
    xr.panel.setZoneColor(zone ? zone.css : null);
  },
  onBreath: (breath) => riley.setBreath(breath),
  onGesture: (gesture) => riley.setGesture(gesture),
});

ui = new UI({
  journal,
  onChoice: (id) => dialogue.choose(id),
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
  onMotionToggle: (on) => {
    world.sparkles.visible = on;
    for (const cloud of world.clouds) cloud.visible = on;
  },
});

// ---- WebXR -----------------------------------------------------------

const rileyHome = new THREE.Vector3(0, 0, 0);
const rileyXR = new THREE.Vector3(-0.35, 0, -1.35);

const xr = new XRManager(world, {
  onChoice: (id) => dialogue.choose(id),
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
      if (speech.available && speech.enabled && !window.speechSynthesis.speaking) {
        speech.speak(document.getElementById('riley-text').textContent);
      }
    }
  },
  { once: true },
);

document.getElementById('loading').classList.add('is-done');
