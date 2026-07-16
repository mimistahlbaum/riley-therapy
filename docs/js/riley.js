// Riley: a procedurally built, fully animated 3D character.
// The 2025 demo used a static, unrigged model; this version animates
// blinking, bobbing, waving, nodding, celebrating and guided breathing,
// with a glowing chest heart that changes colour with the child's zone.

import * as THREE from 'three';

const BODY_PINK = 0xf9a8c4;
const BODY_PINK_DARK = 0xf07ca6;
const CREAM = 0xfff3e8;

function heartGeometry(size = 1) {
  const s = size;
  const shape = new THREE.Shape();
  shape.moveTo(0, -0.55 * s);
  shape.bezierCurveTo(0.7 * s, 0.1 * s, 0.45 * s, 0.65 * s, 0, 0.3 * s);
  shape.bezierCurveTo(-0.45 * s, 0.65 * s, -0.7 * s, 0.1 * s, 0, -0.55 * s);
  const geo = new THREE.ExtrudeGeometry(shape, {
    depth: 0.18 * s,
    bevelEnabled: true,
    bevelThickness: 0.04 * s,
    bevelSize: 0.05 * s,
    bevelSegments: 3,
    curveSegments: 24,
  });
  geo.center();
  return geo;
}

export class Riley {
  constructor() {
    this.group = new THREE.Group();
    this.zoneColor = new THREE.Color(0x34c759);
    this.targetZoneColor = new THREE.Color(0x34c759);

    this.gesture = null;
    this.gestureT = 0;
    this.blinkT = 0;
    this.nextBlink = 2 + Math.random() * 3;
    this.breath = { phase: null, seconds: 0, t: 0, value: 0 };

    this.buildBody();
    this.buildFace();
    this.buildHeart();
    this.buildBalloon();
    this.buildShadow();
  }

  buildBody() {
    const bodyMat = new THREE.MeshStandardMaterial({ color: BODY_PINK, roughness: 0.65 });
    const darkMat = new THREE.MeshStandardMaterial({ color: BODY_PINK_DARK, roughness: 0.65 });
    const creamMat = new THREE.MeshStandardMaterial({ color: CREAM, roughness: 0.8 });

    this.body = new THREE.Mesh(new THREE.SphereGeometry(0.34, 32, 24), bodyMat);
    this.body.scale.set(1, 1.12, 0.92);
    this.body.position.y = 0.42;
    this.group.add(this.body);

    // Tummy patch
    const tummy = new THREE.Mesh(new THREE.SphereGeometry(0.26, 32, 24), creamMat);
    tummy.scale.set(0.82, 0.95, 0.45);
    tummy.position.set(0, 0.4, 0.15);
    this.group.add(tummy);

    // Head
    this.head = new THREE.Group();
    this.head.position.y = 0.95;
    this.group.add(this.head);

    const skull = new THREE.Mesh(new THREE.SphereGeometry(0.3, 32, 24), bodyMat);
    skull.scale.set(1.05, 0.95, 0.95);
    this.head.add(skull);

    // Round ears
    for (const side of [-1, 1]) {
      const ear = new THREE.Mesh(new THREE.SphereGeometry(0.115, 24, 18), bodyMat);
      ear.position.set(0.22 * side, 0.24, 0);
      this.head.add(ear);
      const inner = new THREE.Mesh(new THREE.SphereGeometry(0.06, 16, 12), darkMat);
      inner.position.set(0.22 * side, 0.24, 0.07);
      this.head.add(inner);
    }

    // Arms (pivoted at the shoulder so they can wave)
    this.arms = [];
    for (const side of [-1, 1]) {
      const pivot = new THREE.Group();
      pivot.position.set(0.3 * side, 0.55, 0);
      const arm = new THREE.Mesh(new THREE.CapsuleGeometry(0.075, 0.16, 6, 14), bodyMat);
      arm.position.y = -0.13;
      pivot.add(arm);
      pivot.rotation.z = side * 0.5;
      this.group.add(pivot);
      this.arms.push(pivot);
    }

    // Feet
    for (const side of [-1, 1]) {
      const foot = new THREE.Mesh(new THREE.SphereGeometry(0.11, 20, 14), darkMat);
      foot.scale.set(1, 0.7, 1.2);
      foot.position.set(0.16 * side, 0.07, 0.06);
      this.group.add(foot);
    }
  }

  buildFace() {
    const eyeMat = new THREE.MeshStandardMaterial({ color: 0x33262e, roughness: 0.35 });
    const glintMat = new THREE.MeshBasicMaterial({ color: 0xffffff });
    const cheekMat = new THREE.MeshStandardMaterial({ color: 0xff8fb3, roughness: 0.9 });

    this.eyes = [];
    for (const side of [-1, 1]) {
      const eye = new THREE.Group();
      eye.position.set(0.11 * side, 0.03, 0.27);
      const ball = new THREE.Mesh(new THREE.SphereGeometry(0.05, 18, 14), eyeMat);
      ball.scale.z = 0.6;
      eye.add(ball);
      const glint = new THREE.Mesh(new THREE.SphereGeometry(0.016, 10, 8), glintMat);
      glint.position.set(0.015, 0.02, 0.035);
      eye.add(glint);
      this.head.add(eye);
      this.eyes.push(eye);
    }

    for (const side of [-1, 1]) {
      const cheek = new THREE.Mesh(new THREE.SphereGeometry(0.045, 14, 10), cheekMat);
      cheek.scale.z = 0.35;
      cheek.position.set(0.19 * side, -0.06, 0.245);
      this.head.add(cheek);
    }

    // Smile: a thin curved tube
    const smileCurve = new THREE.CatmullRomCurve3([
      new THREE.Vector3(-0.06, -0.05, 0.285),
      new THREE.Vector3(0, -0.095, 0.295),
      new THREE.Vector3(0.06, -0.05, 0.285),
    ]);
    const smile = new THREE.Mesh(
      new THREE.TubeGeometry(smileCurve, 12, 0.011, 8),
      new THREE.MeshStandardMaterial({ color: 0x33262e, roughness: 0.5 }),
    );
    this.head.add(smile);
  }

  buildHeart() {
    this.heartMat = new THREE.MeshStandardMaterial({
      color: 0x34c759,
      emissive: 0x34c759,
      emissiveIntensity: 0.55,
      roughness: 0.35,
    });
    this.heart = new THREE.Mesh(heartGeometry(0.14), this.heartMat);
    this.heart.position.set(0, 0.47, 0.29);
    this.group.add(this.heart);

    this.heartLight = new THREE.PointLight(0x34c759, 0.6, 1.6);
    this.heartLight.position.copy(this.heart.position);
    this.heartLight.position.z += 0.15;
    this.group.add(this.heartLight);
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
    grad.addColorStop(0, 'rgba(60, 40, 60, 0.35)');
    grad.addColorStop(1, 'rgba(60, 40, 60, 0)');
    ctx.fillStyle = grad;
    ctx.fillRect(0, 0, 128, 128);
    const tex = new THREE.CanvasTexture(canvas);
    const shadow = new THREE.Mesh(
      new THREE.PlaneGeometry(0.9, 0.9),
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

  update(dt, time) {
    // Idle bob and sway
    this.group.position.y = Math.sin(time * 1.6) * 0.018;
    this.group.rotation.y = Math.sin(time * 0.45) * 0.06;
    this.head.rotation.z = Math.sin(time * 0.9) * 0.04;

    // Blinking
    this.blinkT += dt;
    if (this.blinkT > this.nextBlink) {
      this.blinkT = 0;
      this.nextBlink = 2 + Math.random() * 3.5;
    }
    const blinkPhase = this.blinkT < 0.14 ? Math.sin((this.blinkT / 0.14) * Math.PI) : 0;
    for (const eye of this.eyes) eye.scale.y = 1 - blinkPhase * 0.92;

    // Heart colour easing + gentle pulse
    this.zoneColor.lerp(this.targetZoneColor, Math.min(1, dt * 3));
    this.heartMat.color.copy(this.zoneColor);
    this.heartMat.emissive.copy(this.zoneColor);
    this.heartLight.color.copy(this.zoneColor);
    const pulse = 1 + Math.sin(time * 2.4) * 0.05;
    this.heart.scale.setScalar(pulse);
    this.heartLight.intensity = 0.5 + Math.sin(time * 2.4) * 0.15;

    this.updateGesture(dt);
    this.updateBreath(dt, time);
  }

  updateGesture(dt) {
    if (!this.gesture) {
      // Ease arms back to resting pose
      for (let i = 0; i < 2; i++) {
        const rest = (i === 0 ? -1 : 1) * 0.5;
        this.arms[i].rotation.z += (rest - this.arms[i].rotation.z) * Math.min(1, dt * 6);
        this.arms[i].rotation.x += (0 - this.arms[i].rotation.x) * Math.min(1, dt * 6);
      }
      this.head.rotation.x += (0 - this.head.rotation.x) * Math.min(1, dt * 6);
      return;
    }
    this.gestureT += dt;
    const t = this.gestureT;
    if (this.gesture === 'wave') {
      // Right arm raised and waving
      this.arms[1].rotation.z = -2.2 + Math.sin(t * 9) * 0.35;
      if (t > 1.8) this.gesture = null;
    } else if (this.gesture === 'nod') {
      this.head.rotation.x = Math.sin(t * 5) * 0.22 * Math.max(0, 1 - t / 1.2);
      if (t > 1.2) this.gesture = null;
    } else if (this.gesture === 'celebrate') {
      this.arms[0].rotation.z = 2.4 + Math.sin(t * 10) * 0.2;
      this.arms[1].rotation.z = -2.4 - Math.sin(t * 10) * 0.2;
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
