// Riley: a procedurally built, fully animated 3D character.
// A soft, matte-white rounded mascot: egg-shaped body, tiny stub arms,
// button eyes, an open friendly mouth and a puffy heart on its chest.
// The heart glows with the colour of the child's current zone; it blinks,
// bobs, waves, nods, celebrates, talks and guides breathing.

import * as THREE from 'three';

const BODY_WHITE = 0xf7f4f0;
const SHADE_SOFT = 0xd9d2cb;
const MOUTH_INNER = 0xcfc6bf;
const HEART_CORAL = 0xf0716a;

function heartGeometry(size = 1) {
  const s = size;
  const shape = new THREE.Shape();
  shape.moveTo(0, -0.55 * s);
  shape.bezierCurveTo(0.7 * s, 0.1 * s, 0.45 * s, 0.65 * s, 0, 0.3 * s);
  shape.bezierCurveTo(-0.45 * s, 0.65 * s, -0.7 * s, 0.1 * s, 0, -0.55 * s);
  const geo = new THREE.ExtrudeGeometry(shape, {
    depth: 0.22 * s,
    bevelEnabled: true,
    bevelThickness: 0.08 * s,
    bevelSize: 0.09 * s,
    bevelSegments: 5,
    curveSegments: 24,
  });
  geo.center();
  return geo;
}

// Egg/pear profile for the body: widest just below the middle,
// smoothly rounded at the top. Built as a lathe so it stays seamless.
function bodyGeometry(height = 0.95, radius = 0.4) {
  const points = [];
  const segments = 28;
  for (let i = 0; i <= segments; i++) {
    const a = (i / segments) * Math.PI;
    const y = ((1 - Math.cos(a)) / 2) * height;
    const r = Math.sin(a) * radius * (1 + 0.28 * Math.cos(a));
    points.push(new THREE.Vector2(Math.max(r, 0.0001), y));
  }
  return new THREE.LatheGeometry(points, 48);
}

// Radius of the body profile at a given height, for placing face features
// flush against the surface.
function bodyRadiusAt(y, height = 0.95, radius = 0.4) {
  const c = Math.min(1, Math.max(-1, 1 - (2 * y) / height));
  const a = Math.acos(c);
  return Math.sin(a) * radius * (1 + 0.28 * Math.cos(a));
}

export class Riley {
  constructor() {
    this.group = new THREE.Group();
    this.zoneColor = new THREE.Color(HEART_CORAL);
    this.targetZoneColor = new THREE.Color(HEART_CORAL);

    this.gesture = null;
    this.gestureT = 0;
    this.blinkT = 0;
    this.nextBlink = 2 + Math.random() * 3;
    this.breath = { phase: null, seconds: 0, t: 0, value: 0 };
    this.talking = false;

    // Everything except the balloon and shadow lives on `core`, so leaning
    // and nodding move the whole soft body as one piece.
    this.core = new THREE.Group();
    this.group.add(this.core);

    this.buildBody();
    this.buildFace();
    this.buildHeart();
    this.buildBalloon();
    this.buildShadow();
  }

  buildBody() {
    const bodyMat = new THREE.MeshStandardMaterial({ color: BODY_WHITE, roughness: 0.6 });

    this.body = new THREE.Mesh(bodyGeometry(), bodyMat);
    this.core.add(this.body);

    // Tiny stub arms, pivoted at the shoulder so they can wave.
    this.arms = [];
    this.armRest = [];
    for (const side of [-1, 1]) {
      const pivot = new THREE.Group();
      const shoulderR = bodyRadiusAt(0.48);
      pivot.position.set((shoulderR - 0.04) * side, 0.48, 0);
      const arm = new THREE.Mesh(new THREE.CapsuleGeometry(0.055, 0.09, 6, 14), bodyMat);
      arm.position.y = -0.08;
      pivot.add(arm);
      const rest = side * 2.0; // little wings pointing gently out and up
      pivot.rotation.z = rest;
      this.core.add(pivot);
      this.arms.push(pivot);
      this.armRest.push(rest);
    }

    // Short stub feet peeking out under the body.
    for (const side of [-1, 1]) {
      const foot = new THREE.Mesh(new THREE.CapsuleGeometry(0.05, 0.05, 6, 12), bodyMat);
      foot.position.set(0.14 * side, 0.04, 0.09);
      this.core.add(foot);
    }
  }

  buildFace() {
    const socketMat = new THREE.MeshStandardMaterial({ color: SHADE_SOFT, roughness: 0.9 });
    const ballMat = new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.35 });

    // Eyes: small white buttons resting in soft moulded sockets.
    this.eyes = [];
    const eyeY = 0.66;
    const eyeR = bodyRadiusAt(eyeY);
    for (const side of [-1, 1]) {
      const eye = new THREE.Group();
      const x = 0.125 * side;
      eye.position.set(x, eyeY, Math.sqrt(Math.max(0.0001, eyeR * eyeR - x * x)) - 0.012);
      const socket = new THREE.Mesh(new THREE.SphereGeometry(0.048, 20, 14), socketMat);
      socket.scale.z = 0.3;
      eye.add(socket);
      const ball = new THREE.Mesh(new THREE.SphereGeometry(0.04, 18, 14), ballMat);
      ball.position.z = 0.02;
      eye.add(ball);
      this.core.add(eye);
      this.eyes.push(eye);
    }

    // Mouth: a softly open rounded mouth with a raised rim.
    const mouthY = 0.52;
    const mouthZ = bodyRadiusAt(mouthY);
    this.mouth = new THREE.Group();
    this.mouth.position.set(0, mouthY, mouthZ - 0.02);
    const inner = new THREE.Mesh(new THREE.SphereGeometry(0.072, 24, 16), new THREE.MeshStandardMaterial({ color: MOUTH_INNER, roughness: 0.95 }));
    inner.scale.set(1.3, 1, 0.35);
    this.mouth.add(inner);
    const rim = new THREE.Mesh(
      new THREE.TorusGeometry(0.072, 0.02, 12, 36),
      new THREE.MeshStandardMaterial({ color: BODY_WHITE, roughness: 0.6 }),
    );
    rim.scale.set(1.3, 1, 1);
    rim.position.z = 0.02;
    this.mouth.add(rim);
    this.core.add(this.mouth);
  }

  buildHeart() {
    this.heartMat = new THREE.MeshStandardMaterial({
      color: HEART_CORAL,
      emissive: HEART_CORAL,
      emissiveIntensity: 0.3,
      roughness: 0.4,
    });
    this.heart = new THREE.Mesh(heartGeometry(0.13), this.heartMat);
    // Low on the tummy, a little off to the side, snuggled onto the surface.
    const heartY = 0.34;
    const r = bodyRadiusAt(heartY);
    const x = 0.15;
    this.heart.position.set(x, heartY, Math.sqrt(Math.max(0.0001, r * r - x * x)) - 0.015);
    this.heart.rotation.set(0.3, 0.34, -0.08);
    this.core.add(this.heart);

    this.heartLight = new THREE.PointLight(HEART_CORAL, 0.35, 0.65);
    this.heartLight.position.copy(this.heart.position);
    this.heartLight.position.z += 0.15;
    this.core.add(this.heartLight);
  }

  buildBalloon() {
    // Breathing balloon: grows on inhale, shrinks on exhale.
    this.balloonMat = new THREE.MeshStandardMaterial({
      color: 0xffd166,
      roughness: 0.3,
      transparent: true,
      opacity: 0.92,
    });
    this.balloon = new THREE.Group();
    const ball = new THREE.Mesh(new THREE.SphereGeometry(0.16, 28, 20), this.balloonMat);
    ball.scale.set(1, 1.15, 1);
    this.balloon.add(ball);
    const knot = new THREE.Mesh(
      new THREE.ConeGeometry(0.035, 0.05, 10),
      this.balloonMat,
    );
    knot.position.y = -0.2;
    knot.rotation.x = Math.PI;
    this.balloon.add(knot);
    const string = new THREE.Mesh(
      new THREE.CylinderGeometry(0.004, 0.004, 0.3, 6),
      new THREE.MeshBasicMaterial({ color: 0xd9c8b8 }),
    );
    string.position.y = -0.38;
    this.balloon.add(string);
    this.balloon.position.set(0.62, 0.95, 0.1);
    this.balloon.scale.setScalar(0.001);
    this.balloon.visible = false;
    this.group.add(this.balloon);
  }

  buildShadow() {
    const canvas = document.createElement('canvas');
    canvas.width = canvas.height = 128;
    const ctx = canvas.getContext('2d');
    const grad = ctx.createRadialGradient(64, 64, 8, 64, 64, 62);
    grad.addColorStop(0, 'rgba(70, 52, 38, 0.32)');
    grad.addColorStop(1, 'rgba(70, 52, 38, 0)');
    ctx.fillStyle = grad;
    ctx.fillRect(0, 0, 128, 128);
    const tex = new THREE.CanvasTexture(canvas);
    const shadow = new THREE.Mesh(
      new THREE.PlaneGeometry(0.95, 0.95),
      new THREE.MeshBasicMaterial({ map: tex, transparent: true, depthWrite: false }),
    );
    shadow.rotation.x = -Math.PI / 2;
    shadow.position.y = 0.005;
    this.group.add(shadow);
  }

  // ---- Behaviour ------------------------------------------------------

  setZoneColor(hex) {
    this.targetZoneColor.setHex(hex);
  }

  setGesture(name) {
    this.gesture = name;
    this.gestureT = 0;
  }

  setBreath({ phase, seconds = 0 }) {
    this.breath.phase = phase;
    this.breath.seconds = Math.max(seconds, 0.001);
    this.breath.t = 0;
    this.balloon.visible = true;
  }

  setTalking(on) {
    this.talking = on;
  }

  update(dt, time) {
    // Idle bob and sway
    this.group.position.y = Math.sin(time * 1.6) * 0.018;
    this.group.rotation.y = Math.sin(time * 0.45) * 0.06;
    this.core.rotation.z = Math.sin(time * 0.9) * 0.03;

    // Gentle breathing squash of the whole body
    const puff = 1 + Math.sin(time * 1.6) * 0.01;
    this.body.scale.set(puff, 1 / puff, puff);

    // Blinking
    this.blinkT += dt;
    if (this.blinkT > this.nextBlink) {
      this.blinkT = 0;
      this.nextBlink = 2 + Math.random() * 3.5;
    }
    const blinkPhase = this.blinkT < 0.14 ? Math.sin((this.blinkT / 0.14) * Math.PI) : 0;
    for (const eye of this.eyes) eye.scale.y = 1 - blinkPhase * 0.92;

    // Talking: the little mouth opens and closes with the voice.
    const mouthTarget = this.talking ? 0.8 + Math.abs(Math.sin(time * 9)) * 0.55 : 1;
    this.mouth.scale.y += (mouthTarget - this.mouth.scale.y) * Math.min(1, dt * 14);

    // Heart colour easing + gentle pulse
    this.zoneColor.lerp(this.targetZoneColor, Math.min(1, dt * 3));
    this.heartMat.color.copy(this.zoneColor);
    this.heartMat.emissive.copy(this.zoneColor);
    this.heartLight.color.copy(this.zoneColor);
    const pulse = 1 + Math.sin(time * 2.4) * 0.05;
    this.heart.scale.setScalar(pulse);
    this.heartLight.intensity = 0.3 + Math.sin(time * 2.4) * 0.1;

    this.updateGesture(dt);
    this.updateBreath(dt, time);
  }

  updateGesture(dt) {
    if (!this.gesture) {
      // Ease arms and body back to resting pose
      for (let i = 0; i < 2; i++) {
        this.arms[i].rotation.z += (this.armRest[i] - this.arms[i].rotation.z) * Math.min(1, dt * 6);
        this.arms[i].rotation.x += (0 - this.arms[i].rotation.x) * Math.min(1, dt * 6);
      }
      this.core.rotation.x += (0 - this.core.rotation.x) * Math.min(1, dt * 6);
      return;
    }
    this.gestureT += dt;
    const t = this.gestureT;
    if (this.gesture === 'wave') {
      // Right stub raised high and waving
      this.arms[1].rotation.z = 2.7 + Math.sin(t * 9) * 0.3;
      if (t > 1.8) this.gesture = null;
    } else if (this.gesture === 'nod') {
      // Whole-body bow, like an eager little nod
      this.core.rotation.x = Math.sin(t * 5) * 0.14 * Math.max(0, 1 - t / 1.2);
      if (t > 1.2) this.gesture = null;
    } else if (this.gesture === 'celebrate') {
      this.arms[0].rotation.z = -2.7 + Math.sin(t * 10) * 0.2;
      this.arms[1].rotation.z = 2.7 - Math.sin(t * 10) * 0.2;
      this.group.position.y += Math.abs(Math.sin(t * 6)) * 0.06 * Math.max(0, 1 - t / 1.6);
      if (t > 1.6) this.gesture = null;
    }
  }

  updateBreath(dt, time) {
    const b = this.breath;
    if (!b.phase) {
      // Deflate and hide the balloon when not breathing
      if (this.balloon.visible) {
        const s = this.balloon.scale.x + (0.001 - this.balloon.scale.x) * Math.min(1, dt * 4);
        this.balloon.scale.setScalar(s);
        if (s < 0.01) this.balloon.visible = false;
      }
      b.value = Math.max(0, b.value - dt);
      return;
    }
    b.t += dt;
    const progress = Math.min(1, b.t / b.seconds);
    const eased = progress * progress * (3 - 2 * progress); // smoothstep
    if (b.phase === 'in') b.value = eased;
    else if (b.phase === 'out') b.value = 1 - eased;
    // hold keeps the previous value
    const scale = 0.55 + b.value * 0.75;
    this.balloon.scale.setScalar(scale);
    this.balloon.position.y = 0.95 + b.value * 0.18 + Math.sin(time * 1.4) * 0.02;
  }
}
