// 3D world: renderer, camera, lights and a soft, friendly environment.
// The environment hides automatically in AR (passthrough) sessions.

import * as THREE from 'three';
import { OrbitControls } from './vendor/OrbitControls.js';

export class World {
  constructor(canvas) {
    this.renderer = new THREE.WebGLRenderer({
      canvas,
      antialias: true,
      alpha: true,
      powerPreference: 'high-performance',
    });
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    this.renderer.setSize(window.innerWidth, window.innerHeight);
    this.renderer.outputColorSpace = THREE.SRGBColorSpace;
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
    this.renderer.xr.enabled = true;

    this.scene = new THREE.Scene();
    this.skyColor = new THREE.Color(0xbde3ff);
    this.scene.background = this.skyColor;
    this.scene.fog = new THREE.Fog(0xbde3ff, 14, 40);

    this.camera = new THREE.PerspectiveCamera(50, window.innerWidth / window.innerHeight, 0.05, 100);
    this.camera.position.set(0, 1.35, 2.1);

    this.controls = new OrbitControls(this.camera, canvas);
    this.controls.target.set(0, 0.75, 0);
    this.controls.enableDamping = true;
    this.controls.dampingFactor = 0.08;
    this.controls.enablePan = false;
    this.controls.minDistance = 0.9;
    this.controls.maxDistance = 6;
    this.controls.maxPolarAngle = Math.PI * 0.55;
    this.controls.update();

    this.clock = new THREE.Clock();
    this.updaters = [];

    this.buildLights();
    this.buildEnvironment();

    window.addEventListener('resize', () => this.onResize());
  }

  buildLights() {
    const hemi = new THREE.HemisphereLight(0xdff1ff, 0xffe3ec, 1.1);
    this.scene.add(hemi);
    const key = new THREE.DirectionalLight(0xfff4e0, 1.4);
    key.position.set(2.5, 4, 2.5);
    this.scene.add(key);
    const fill = new THREE.DirectionalLight(0xcfe8ff, 0.5);
    fill.position.set(-2, 2, -1.5);
    this.scene.add(fill);
  }

  buildEnvironment() {
    this.environment = new THREE.Group();
    this.scene.add(this.environment);

    // Ground
    const ground = new THREE.Mesh(
      new THREE.CircleGeometry(30, 48),
      new THREE.MeshStandardMaterial({ color: 0xa9e3a0, roughness: 1 }),
    );
    ground.rotation.x = -Math.PI / 2;
    this.environment.add(ground);

    // Soft hills on the horizon
    const hillMat = new THREE.MeshStandardMaterial({ color: 0x8fd48a, roughness: 1 });
    const hillSpots = [
      [-9, -12, 6], [7, -14, 8], [14, -6, 5], [-14, -4, 5], [0, -18, 10], [12, 8, 6], [-11, 9, 5],
    ];
    for (const [x, z, r] of hillSpots) {
      const hill = new THREE.Mesh(new THREE.SphereGeometry(r, 24, 16), hillMat);
      hill.scale.y = 0.35;
      hill.position.set(x, 0, z);
      this.environment.add(hill);
    }

    // Simple friendly trees
    const trunkMat = new THREE.MeshStandardMaterial({ color: 0xa9745a, roughness: 1 });
    const leafColors = [0x63c76a, 0x7fd680, 0x55b98f];
    const treeSpots = [
      [-3.2, -3.5], [3.6, -2.8], [-4.5, 1.5], [4.8, 2.2], [-2.2, 4.5], [2.8, 5], [6, -5.5], [-6.5, -4.8],
    ];
    treeSpots.forEach(([x, z], i) => {
      const tree = new THREE.Group();
      const trunk = new THREE.Mesh(new THREE.CylinderGeometry(0.12, 0.16, 0.8, 8), trunkMat);
      trunk.position.y = 0.4;
      tree.add(trunk);
      const leafMat = new THREE.MeshStandardMaterial({ color: leafColors[i % 3], roughness: 0.9 });
      const blob = new THREE.Mesh(new THREE.SphereGeometry(0.55 + (i % 3) * 0.12, 20, 14), leafMat);
      blob.position.y = 1.1;
      blob.scale.y = 1.15;
      tree.add(blob);
      tree.position.set(x, 0, z);
      tree.scale.setScalar(0.9 + (i % 4) * 0.18);
      this.environment.add(tree);
    });

    // Flowers around Riley
    const flowerColors = [0xff8fb3, 0xffd166, 0x9d8bf4, 0xff9e66];
    for (let i = 0; i < 26; i++) {
      const angle = (i / 26) * Math.PI * 2;
      const radius = 1.6 + (i % 5) * 0.6 + Math.sin(i * 7) * 0.3;
      const flower = new THREE.Group();
      const stem = new THREE.Mesh(
        new THREE.CylinderGeometry(0.012, 0.012, 0.14, 5),
        new THREE.MeshStandardMaterial({ color: 0x5fae5f, roughness: 1 }),
      );
      stem.position.y = 0.07;
      flower.add(stem);
      const bud = new THREE.Mesh(
        new THREE.SphereGeometry(0.04, 10, 8),
        new THREE.MeshStandardMaterial({ color: flowerColors[i % 4], roughness: 0.8 }),
      );
      bud.position.y = 0.15;
      flower.add(bud);
      flower.position.set(Math.cos(angle) * radius, 0, Math.sin(angle) * radius);
      this.environment.add(flower);
    }

    // Drifting clouds
    this.clouds = [];
    const cloudMat = new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 1 });
    for (let i = 0; i < 6; i++) {
      const cloud = new THREE.Group();
      const puffs = 3 + (i % 3);
      for (let p = 0; p < puffs; p++) {
        const puff = new THREE.Mesh(new THREE.SphereGeometry(0.5 + (p % 2) * 0.3, 16, 12), cloudMat);
        puff.position.set(p * 0.55 - puffs * 0.25, (p % 2) * 0.18, 0);
        cloud.add(puff);
      }
      cloud.position.set(-14 + i * 5.5, 5.5 + (i % 3) * 1.2, -8 - (i % 4) * 3);
      cloud.userData.speed = 0.08 + (i % 3) * 0.05;
      this.environment.add(cloud);
      this.clouds.push(cloud);
    }

    // Floating sparkles around Riley
    const sparkleCount = 60;
    const positions = new Float32Array(sparkleCount * 3);
    for (let i = 0; i < sparkleCount; i++) {
      const angle = Math.random() * Math.PI * 2;
      const radius = 0.8 + Math.random() * 2.2;
      positions[i * 3] = Math.cos(angle) * radius;
      positions[i * 3 + 1] = 0.3 + Math.random() * 1.8;
      positions[i * 3 + 2] = Math.sin(angle) * radius;
    }
    const sparkleGeo = new THREE.BufferGeometry();
    sparkleGeo.setAttribute('position', new THREE.BufferAttribute(positions, 3));
    // Soft round sprite so sparkles don't render as hard squares
    const spriteCanvas = document.createElement('canvas');
    spriteCanvas.width = spriteCanvas.height = 64;
    const sctx = spriteCanvas.getContext('2d');
    const sgrad = sctx.createRadialGradient(32, 32, 2, 32, 32, 30);
    sgrad.addColorStop(0, 'rgba(255, 250, 220, 1)');
    sgrad.addColorStop(0.5, 'rgba(255, 246, 201, 0.55)');
    sgrad.addColorStop(1, 'rgba(255, 246, 201, 0)');
    sctx.fillStyle = sgrad;
    sctx.fillRect(0, 0, 64, 64);
    this.sparkles = new THREE.Points(
      sparkleGeo,
      new THREE.PointsMaterial({
        map: new THREE.CanvasTexture(spriteCanvas),
        color: 0xfff6c9,
        size: 0.06,
        transparent: true,
        opacity: 0.9,
        depthWrite: false,
        sizeAttenuation: true,
      }),
    );
    this.environment.add(this.sparkles);
  }

  // Hide the sky and ground during AR passthrough sessions.
  setAREnvironment(isAR) {
    this.environment.visible = !isAR;
    this.scene.background = isAR ? null : this.skyColor;
    this.scene.fog = isAR ? null : new THREE.Fog(0xbde3ff, 14, 40);
  }

  onUpdate(fn) {
    this.updaters.push(fn);
  }

  start() {
    this.renderer.setAnimationLoop(() => {
      const dt = Math.min(this.clock.getDelta(), 0.1);
      const time = this.clock.elapsedTime;
      if (!this.renderer.xr.isPresenting) this.controls.update();
      for (const cloud of this.clouds) {
        cloud.position.x += cloud.userData.speed * dt;
        if (cloud.position.x > 18) cloud.position.x = -18;
      }
      this.sparkles.rotation.y = time * 0.05;
      for (const fn of this.updaters) fn(dt, time);
      this.renderer.render(this.scene, this.camera);
    });
  }

  onResize() {
    this.camera.aspect = window.innerWidth / window.innerHeight;
    this.camera.updateProjectionMatrix();
    this.renderer.setSize(window.innerWidth, window.innerHeight);
  }
}
