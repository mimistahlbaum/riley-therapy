// WebXR support: immersive VR and AR (passthrough) sessions, controller
// ray interaction, and an in-headset panel that mirrors the conversation UI.

import * as THREE from 'three';

const PANEL_W = 1024;

// Draws the conversation onto a canvas texture shown as a floating panel.
export class VRPanel {
  constructor() {
    this.canvas = document.createElement('canvas');
    this.canvas.width = PANEL_W;
    this.canvas.height = 1280;
    this.ctx = this.canvas.getContext('2d');
    this.texture = new THREE.CanvasTexture(this.canvas);
    this.texture.colorSpace = THREE.SRGBColorSpace;
    this.texture.anisotropy = 4;

    const material = new THREE.MeshBasicMaterial({
      map: this.texture,
      transparent: true,
      side: THREE.DoubleSide,
    });
    this.mesh = new THREE.Mesh(new THREE.PlaneGeometry(0.82, 1.025), material);
    this.mesh.visible = false;

    this.message = { text: '', choices: [] };
    this.zoneCss = '#F26D8D';
    this.buttons = [];
    this.hoverIndex = -1;
  }

  setMessage(message) {
    this.message = message;
    this.hoverIndex = -1;
    this.draw();
  }

  setZoneColor(css) {
    this.zoneCss = css || '#F26D8D';
    this.draw();
  }

  setHover(index) {
    if (index !== this.hoverIndex) {
      this.hoverIndex = index;
      this.draw();
    }
  }

  wrapText(ctx, text, maxWidth) {
    const words = text.split(' ');
    const lines = [];
    let line = '';
    for (const word of words) {
      const test = line ? `${line} ${word}` : word;
      if (ctx.measureText(test).width > maxWidth && line) {
        lines.push(line);
        line = word;
      } else {
        line = test;
      }
    }
    if (line) lines.push(line);
    return lines;
  }

  roundRect(ctx, x, y, w, h, r) {
    ctx.beginPath();
    ctx.moveTo(x + r, y);
    ctx.arcTo(x + w, y, x + w, y + h, r);
    ctx.arcTo(x + w, y + h, x, y + h, r);
    ctx.arcTo(x, y + h, x, y, r);
    ctx.arcTo(x, y, x + w, y, r);
    ctx.closePath();
  }

  draw() {
    const ctx = this.ctx;
    const W = this.canvas.width;
    const H = this.canvas.height;
    ctx.clearRect(0, 0, W, H);

    // Card background
    this.roundRect(ctx, 8, 8, W - 16, H - 16, 48);
    ctx.fillStyle = 'rgba(255, 251, 246, 0.96)';
    ctx.fill();
    ctx.lineWidth = 6;
    ctx.strokeStyle = this.zoneCss;
    ctx.stroke();

    // Header
    ctx.fillStyle = this.zoneCss;
    this.roundRect(ctx, 8, 8, W - 16, 96, 48);
    ctx.save();
    ctx.clip();
    ctx.fillRect(8, 8, W - 16, 96);
    ctx.restore();
    ctx.fillStyle = '#ffffff';
    ctx.font = 'bold 46px system-ui, sans-serif';
    ctx.textAlign = 'left';
    ctx.textBaseline = 'middle';
    ctx.fillText('💗 Riley', 44, 58);

    // Message text
    ctx.fillStyle = '#4A3B44';
    ctx.font = '400 40px system-ui, sans-serif';
    ctx.textBaseline = 'top';
    const lines = this.wrapText(ctx, this.message.text || '', W - 120);
    let y = 140;
    for (const line of lines.slice(0, 8)) {
      ctx.fillText(line, 56, y);
      y += 52;
    }
    y += 24;

    // Choice buttons
    this.buttons = [];
    const choices = this.message.choices || [];
    const cols = choices.length > 5 ? 2 : 1;
    const gap = 20;
    const bw = cols === 2 ? (W - 112 - gap) / 2 : W - 112;
    const bh = 84;
    choices.forEach((choice, i) => {
      const col = i % cols;
      const row = Math.floor(i / cols);
      const bx = 56 + col * (bw + gap);
      const by = y + row * (bh + gap);
      if (by + bh > H - 40) return; // safety: never draw off-card
      const hovered = i === this.hoverIndex;
      this.roundRect(ctx, bx, by, bw, bh, 40);
      ctx.fillStyle = hovered ? this.zoneCss : '#FFE9F0';
      ctx.fill();
      ctx.lineWidth = 3;
      ctx.strokeStyle = hovered ? this.zoneCss : '#F5C2D4';
      ctx.stroke();
      ctx.fillStyle = hovered ? '#ffffff' : '#4A3B44';
      ctx.font = '600 34px system-ui, sans-serif';
      ctx.textBaseline = 'middle';
      let label = choice.label;
      while (ctx.measureText(label).width > bw - 48 && label.length > 4) {
        label = label.slice(0, -2);
      }
      ctx.fillText(label, bx + 26, by + bh / 2 + 2);
      this.buttons.push({ x: bx, y: by, w: bw, h: bh, id: choice.id, index: i });
    });

    this.texture.needsUpdate = true;
  }

  // uv (0..1, v up) -> button id under that point, or -1.
  buttonAt(uv) {
    const px = uv.x * this.canvas.width;
    const py = (1 - uv.y) * this.canvas.height;
    for (const b of this.buttons) {
      if (px >= b.x && px <= b.x + b.w && py >= b.y && py <= b.y + b.h) return b;
    }
    return null;
  }
}

export class XRManager {
  /**
   * @param {import('./scene.js').World} world
   * @param {object} opts
   * @param {(id: string) => void} opts.onChoice
   * @param {(active: boolean, mode: 'vr'|'ar'|null) => void} opts.onSessionChange
   */
  constructor(world, { onChoice, onSessionChange }) {
    this.world = world;
    this.onChoice = onChoice;
    this.onSessionChange = onSessionChange;
    this.panel = new VRPanel();
    this.raycaster = new THREE.Raycaster();
    this.sessionMode = null;
    this.controllers = [];

    // Panel + Riley placement while in XR (user stands at the origin).
    this.panelHome = new THREE.Vector3(0.34, 1.25, -1.05);
    world.scene.add(this.panel.mesh);

    this.setupControllers();
    world.onUpdate(() => this.updateHover());
  }

  async detectSupport() {
    const support = { vr: false, ar: false };
    if (navigator.xr) {
      try {
        support.vr = await navigator.xr.isSessionSupported('immersive-vr');
      } catch { /* not supported */ }
      try {
        support.ar = await navigator.xr.isSessionSupported('immersive-ar');
      } catch { /* not supported */ }
    }
    return support;
  }

  async start(mode) {
    const sessionInit = {
      optionalFeatures: ['local-floor', 'bounded-floor', 'hand-tracking'],
    };
    try {
      const session = await navigator.xr.requestSession(
        mode === 'ar' ? 'immersive-ar' : 'immersive-vr',
        sessionInit,
      );
      this.sessionMode = mode;
      this.world.renderer.xr.setReferenceSpaceType('local-floor');
      await this.world.renderer.xr.setSession(session);
      this.world.setAREnvironment(mode === 'ar');
      this.panel.mesh.position.copy(this.panelHome);
      this.panel.mesh.lookAt(0, 1.5, 0.4);
      this.panel.mesh.visible = true;
      this.panel.draw();
      this.onSessionChange(true, mode);
      session.addEventListener('end', () => {
        this.sessionMode = null;
        this.panel.mesh.visible = false;
        this.world.setAREnvironment(false);
        this.world.onResize();
        this.onSessionChange(false, null);
      });
    } catch (err) {
      console.error('Failed to start XR session:', err);
      this.onSessionChange(false, null);
    }
  }

  end() {
    const session = this.world.renderer.xr.getSession();
    if (session) session.end();
  }

  setupControllers() {
    const rayGeo = new THREE.BufferGeometry().setFromPoints([
      new THREE.Vector3(0, 0, 0),
      new THREE.Vector3(0, 0, -1),
    ]);
    for (let i = 0; i < 2; i++) {
      const controller = this.world.renderer.xr.getController(i);
      const ray = new THREE.Line(
        rayGeo,
        new THREE.LineBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0.6 }),
      );
      ray.scale.z = 3;
      controller.add(ray);
      const tip = new THREE.Mesh(
        new THREE.SphereGeometry(0.012, 12, 8),
        new THREE.MeshBasicMaterial({ color: 0xff8fb3 }),
      );
      controller.add(tip);
      controller.addEventListener('selectstart', () => this.handleSelect(controller));
      this.world.scene.add(controller);
      this.controllers.push(controller);

      const grip = this.world.renderer.xr.getControllerGrip(i);
      const handle = new THREE.Mesh(
        new THREE.SphereGeometry(0.03, 14, 10),
        new THREE.MeshStandardMaterial({ color: 0xf9a8c4, roughness: 0.5 }),
      );
      grip.add(handle);
      this.world.scene.add(grip);
    }
  }

  intersectPanel(controller) {
    if (!this.panel.mesh.visible) return null;
    const tempMatrix = new THREE.Matrix4();
    tempMatrix.identity().extractRotation(controller.matrixWorld);
    this.raycaster.ray.origin.setFromMatrixPosition(controller.matrixWorld);
    this.raycaster.ray.direction.set(0, 0, -1).applyMatrix4(tempMatrix);
    const hits = this.raycaster.intersectObject(this.panel.mesh, false);
    return hits.length ? hits[0] : null;
  }

  handleSelect(controller) {
    const hit = this.intersectPanel(controller);
    if (!hit || !hit.uv) return;
    const button = this.panel.buttonAt(hit.uv);
    if (button) {
      this.pulse(controller);
      this.onChoice(button.id);
    }
  }

  pulse(controller) {
    const gamepad = controller.userData?.gamepad || null;
    const source = this.world.renderer.xr
      .getSession()
      ?.inputSources?.[this.controllers.indexOf(controller)];
    const actuator = (source?.gamepad?.hapticActuators || [])[0] || gamepad?.hapticActuators?.[0];
    if (actuator?.pulse) actuator.pulse(0.4, 60);
  }

  updateHover() {
    if (!this.world.renderer.xr.isPresenting || !this.panel.mesh.visible) return;
    let hover = -1;
    for (const controller of this.controllers) {
      const hit = this.intersectPanel(controller);
      if (hit?.uv) {
        const button = this.panel.buttonAt(hit.uv);
        if (button) hover = button.index;
        const ray = controller.children.find((c) => c.isLine);
        if (ray) ray.scale.z = hit.distance;
      } else {
        const ray = controller.children.find((c) => c.isLine);
        if (ray) ray.scale.z = 3;
      }
    }
    this.panel.setHover(hover);
  }
}
