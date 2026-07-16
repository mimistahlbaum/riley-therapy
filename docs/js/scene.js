// 3D world: renderer, camera, lights and a calm, cosy living room —
// warm wooden floor, a soft rug, a sofa, a sunny window, shelves, plants
// and a gently glowing floor lamp, so the space feels like home.
// The environment hides automatically in AR (passthrough) sessions.

import * as THREE from 'three';
import { OrbitControls } from './vendor/OrbitControls.js';

const ROOM = { halfW: 3.5, backZ: -2.8, frontZ: 3.6, height: 3.0 };

const WALL_CREAM = 0xefe3d2;
const CEILING_CREAM = 0xf6efe3;
const WOOD_DARK = 0x9c7250;
const WOOD_MID = 0xa97e58;
const FABRIC_SAGE = 0xa9b79b;
const FABRIC_CREAM = 0xf0e4d2;

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
    this.renderer.toneMappingExposure = 1.08;
    this.renderer.xr.enabled = true;

    this.scene = new THREE.Scene();
    this.bgColor = new THREE.Color(0xf1e5d4);
    this.scene.background = this.bgColor;

    this.camera = new THREE.PerspectiveCamera(50, window.innerWidth / window.innerHeight, 0.05, 100);
    this.camera.position.set(0, 1.15, 2.55);

    this.controls = new OrbitControls(this.camera, canvas);
    // Aim a little low so Riley's face sits above the chat panel.
    this.controls.target.set(0, 0.45, 0);
    this.controls.enableDamping = true;
    this.controls.dampingFactor = 0.08;
    this.controls.enablePan = false;
    this.controls.minDistance = 1.0;
    this.controls.maxDistance = 3.1; // stay inside the room
    this.controls.maxPolarAngle = Math.PI * 0.52;
    this.controls.update();

    this.clock = new THREE.Clock();
    this.updaters = [];

    this.buildLights();
    this.buildEnvironment();

    window.addEventListener('resize', () => this.onResize());
  }

  buildLights() {
    // Warm indoor light: soft ambience, afternoon sun through the window,
    // and a cosy glow from the floor lamp.
    const hemi = new THREE.HemisphereLight(0xfff1de, 0xb59f8a, 0.8);
    this.scene.add(hemi);

    const sun = new THREE.DirectionalLight(0xffdfb0, 1.15);
    sun.position.set(-1.2, 2.4, -1.6);
    sun.target.position.set(0.6, 0, 1.2);
    this.scene.add(sun);
    this.scene.add(sun.target);

    const fill = new THREE.DirectionalLight(0xd8e2ea, 0.25);
    fill.position.set(1.5, 2, 3);
    this.scene.add(fill);
  }

  // ---- Procedural textures ---------------------------------------------

  makeWoodTexture() {
    const canvas = document.createElement('canvas');
    canvas.width = canvas.height = 512;
    const ctx = canvas.getContext('2d');
    const plankW = 128;
    const plankH = 512;
    for (let col = 0; col < 4; col++) {
      // Two planks per column, offset like real flooring
      for (let row = 0; row < 2; row++) {
        const shade = 0.92 + ((col * 7 + row * 13) % 5) * 0.035;
        ctx.fillStyle = `rgb(${Math.round(196 * shade)}, ${Math.round(155 * shade)}, ${Math.round(112 * shade)})`;
        const y = row * (plankH / 2) + (col % 2) * 64 - 64;
        ctx.fillRect(col * plankW, y, plankW, plankH / 2);
      }
      // Grain streaks
      ctx.strokeStyle = 'rgba(120, 84, 55, 0.16)';
      ctx.lineWidth = 2;
      for (let g = 0; g < 7; g++) {
        const x = col * plankW + 12 + ((g * 37 + col * 19) % (plankW - 24));
        ctx.beginPath();
        ctx.moveTo(x, 0);
        ctx.bezierCurveTo(x + 6, 140, x - 6, 340, x + 4, 512);
        ctx.stroke();
      }
      // Seams between planks
      ctx.fillStyle = 'rgba(110, 78, 52, 0.22)';
      ctx.fillRect(col * plankW, 0, 2, 512);
      const seamY = (col % 2) * 64 + 192;
      ctx.fillRect(col * plankW, seamY, plankW, 2);
    }
    const tex = new THREE.CanvasTexture(canvas);
    tex.colorSpace = THREE.SRGBColorSpace;
    tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
    tex.repeat.set(2, 2);
    return tex;
  }

  makeWindowViewTexture() {
    const canvas = document.createElement('canvas');
    canvas.width = canvas.height = 256;
    const ctx = canvas.getContext('2d');
    const sky = ctx.createLinearGradient(0, 0, 0, 256);
    sky.addColorStop(0, '#a8cbe8');
    sky.addColorStop(0.65, '#dfe6d8');
    sky.addColorStop(1, '#e9ddbe');
    ctx.fillStyle = sky;
    ctx.fillRect(0, 0, 256, 256);
    // Soft sun glow
    const glow = ctx.createRadialGradient(70, 66, 6, 70, 66, 70);
    glow.addColorStop(0, 'rgba(255, 244, 214, 0.95)');
    glow.addColorStop(1, 'rgba(255, 244, 214, 0)');
    ctx.fillStyle = glow;
    ctx.fillRect(0, 0, 256, 256);
    // Distant soft hills and a couple of trees
    ctx.fillStyle = '#b3c6a2';
    ctx.beginPath();
    ctx.ellipse(60, 232, 140, 60, 0, Math.PI, 0);
    ctx.fill();
    ctx.fillStyle = '#a2bb90';
    ctx.beginPath();
    ctx.ellipse(220, 244, 130, 66, 0, Math.PI, 0);
    ctx.fill();
    ctx.fillStyle = '#87a877';
    for (const [x, y, r] of [[180, 200, 16], [206, 206, 12]]) {
      ctx.beginPath();
      ctx.arc(x, y, r, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillRect(x - 2, y, 4, 240 - y);
    }
    const tex = new THREE.CanvasTexture(canvas);
    tex.colorSpace = THREE.SRGBColorSpace;
    return tex;
  }

  makeDrawingTexture(kind) {
    // A child's crayon drawing for the picture frames.
    const canvas = document.createElement('canvas');
    canvas.width = canvas.height = 256;
    const ctx = canvas.getContext('2d');
    ctx.fillStyle = '#fdf6ea';
    ctx.fillRect(0, 0, 256, 256);
    ctx.lineCap = 'round';
    ctx.lineWidth = 7;
    if (kind === 'sun-heart') {
      ctx.strokeStyle = '#f2b632';
      ctx.beginPath();
      ctx.arc(70, 70, 30, 0, Math.PI * 2);
      ctx.stroke();
      for (let i = 0; i < 8; i++) {
        const a = (i / 8) * Math.PI * 2;
        ctx.beginPath();
        ctx.moveTo(70 + Math.cos(a) * 40, 70 + Math.sin(a) * 40);
        ctx.lineTo(70 + Math.cos(a) * 56, 70 + Math.sin(a) * 56);
        ctx.stroke();
      }
      ctx.strokeStyle = '#e8635a';
      ctx.beginPath();
      ctx.moveTo(170, 190);
      ctx.bezierCurveTo(120, 150, 138, 108, 170, 132);
      ctx.bezierCurveTo(202, 108, 220, 150, 170, 190);
      ctx.stroke();
    } else if (kind === 'house') {
      ctx.strokeStyle = '#8a6a4e';
      ctx.strokeRect(78, 120, 100, 84);
      ctx.strokeStyle = '#d96a5a';
      ctx.beginPath();
      ctx.moveTo(66, 122);
      ctx.lineTo(128, 66);
      ctx.lineTo(190, 122);
      ctx.closePath();
      ctx.stroke();
      ctx.strokeStyle = '#5f8fb4';
      ctx.strokeRect(96, 142, 26, 26);
      ctx.strokeStyle = '#7fa46f';
      ctx.beginPath();
      ctx.moveTo(216, 204);
      ctx.lineTo(216, 168);
      ctx.stroke();
      ctx.beginPath();
      ctx.arc(216, 152, 20, 0, Math.PI * 2);
      ctx.stroke();
    } else {
      // rainbow
      const colors = ['#e8635a', '#f2b632', '#7fa46f', '#5f8fb4', '#9a7fb8'];
      colors.forEach((c, i) => {
        ctx.strokeStyle = c;
        ctx.beginPath();
        ctx.arc(128, 210, 96 - i * 14, Math.PI, 0);
        ctx.stroke();
      });
    }
    const tex = new THREE.CanvasTexture(canvas);
    tex.colorSpace = THREE.SRGBColorSpace;
    return tex;
  }

  // ---- Room ---------------------------------------------------------------

  buildEnvironment() {
    this.environment = new THREE.Group();
    this.scene.add(this.environment);

    this.buildRoomShell();
    this.buildRug();
    this.buildWindow();
    this.buildSofa();
    this.buildBookshelf();
    this.buildLamp();
    this.buildPlant();
    this.buildSideTable();
    this.buildPictures();
    this.buildCushions();
    this.buildDustMotes();
  }

  buildRoomShell() {
    const { halfW, backZ, frontZ, height } = ROOM;
    const width = halfW * 2;
    const depth = frontZ - backZ;
    const midZ = (backZ + frontZ) / 2;

    // Wooden floor
    const floor = new THREE.Mesh(
      new THREE.PlaneGeometry(width, depth),
      new THREE.MeshStandardMaterial({ map: this.makeWoodTexture(), roughness: 0.9 }),
    );
    floor.rotation.x = -Math.PI / 2;
    floor.position.z = midZ;
    this.environment.add(floor);

    // Walls
    const wallMat = new THREE.MeshStandardMaterial({ color: WALL_CREAM, roughness: 1 });
    const addWall = (w, x, z, rotY) => {
      const wall = new THREE.Mesh(new THREE.PlaneGeometry(w, height), wallMat);
      wall.position.set(x, height / 2, z);
      wall.rotation.y = rotY;
      this.environment.add(wall);
    };
    addWall(width, 0, backZ, 0);            // back
    addWall(width, 0, frontZ, Math.PI);     // front (behind the camera)
    addWall(depth, -halfW, midZ, Math.PI / 2);  // left
    addWall(depth, halfW, midZ, -Math.PI / 2);  // right

    // Ceiling
    const ceiling = new THREE.Mesh(
      new THREE.PlaneGeometry(width, depth),
      new THREE.MeshStandardMaterial({ color: CEILING_CREAM, roughness: 1 }),
    );
    ceiling.rotation.x = Math.PI / 2;
    ceiling.position.set(0, height, midZ);
    this.environment.add(ceiling);

    // Skirting boards
    const skirtMat = new THREE.MeshStandardMaterial({ color: 0xfaf3ea, roughness: 0.8 });
    const skirt = (w, x, z, rotY) => {
      const board = new THREE.Mesh(new THREE.BoxGeometry(w, 0.12, 0.025), skirtMat);
      board.position.set(x, 0.06, z);
      board.rotation.y = rotY;
      this.environment.add(board);
    };
    skirt(width, 0, backZ + 0.013, 0);
    skirt(width, 0, frontZ - 0.013, Math.PI);
    skirt(depth, -halfW + 0.013, midZ, Math.PI / 2);
    skirt(depth, halfW - 0.013, midZ, -Math.PI / 2);
  }

  buildRug() {
    const layers = [
      { r: 1.55, color: 0xd9bfa4, y: 0.004 },
      { r: 1.42, color: 0xead8c4, y: 0.006 },
      { r: 0.85, color: 0xf1e2cf, y: 0.008 },
    ];
    for (const { r, color, y } of layers) {
      const disc = new THREE.Mesh(
        new THREE.CircleGeometry(r, 48),
        new THREE.MeshStandardMaterial({ color, roughness: 1 }),
      );
      disc.rotation.x = -Math.PI / 2;
      disc.position.y = y;
      this.environment.add(disc);
    }
  }

  buildWindow() {
    const g = new THREE.Group();
    const wallZ = ROOM.backZ + 0.01;
    const cx = -1.2;
    const cy = 1.65;
    const w = 1.5;
    const h = 1.4;

    // Daylight view
    const view = new THREE.Mesh(
      new THREE.PlaneGeometry(w, h),
      new THREE.MeshBasicMaterial({ map: this.makeWindowViewTexture() }),
    );
    view.position.set(cx, cy, wallZ + 0.005);
    g.add(view);

    // Frame and cross bars
    const frameMat = new THREE.MeshStandardMaterial({ color: 0xfaf3ea, roughness: 0.7 });
    const bar = (bw, bh, x, y) => {
      const m = new THREE.Mesh(new THREE.BoxGeometry(bw, bh, 0.06), frameMat);
      m.position.set(cx + x, cy + y, wallZ + 0.02);
      g.add(m);
    };
    bar(w + 0.14, 0.08, 0, h / 2 + 0.03);
    bar(w + 0.14, 0.08, 0, -h / 2 - 0.03);
    bar(0.08, h + 0.14, -w / 2 - 0.03, 0);
    bar(0.08, h + 0.14, w / 2 + 0.03, 0);
    bar(0.05, h, 0, 0);
    bar(w, 0.05, 0, 0);
    // Window sill
    const sill = new THREE.Mesh(new THREE.BoxGeometry(w + 0.3, 0.05, 0.16), frameMat);
    sill.position.set(cx, cy - h / 2 - 0.09, wallZ + 0.07);
    g.add(sill);

    // Curtains: soft fabric folds on both sides, hung from a wooden rod
    const rodMat = new THREE.MeshStandardMaterial({ color: WOOD_DARK, roughness: 0.6 });
    const rod = new THREE.Mesh(new THREE.CylinderGeometry(0.02, 0.02, w + 0.85, 10), rodMat);
    rod.rotation.z = Math.PI / 2;
    rod.position.set(cx, cy + h / 2 + 0.18, wallZ + 0.1);
    g.add(rod);
    const curtainMat = new THREE.MeshStandardMaterial({
      color: 0xe7cdb2,
      roughness: 1,
      side: THREE.DoubleSide,
    });
    for (const side of [-1, 1]) {
      const panel = new THREE.Group();
      for (let i = 0; i < 4; i++) {
        const fold = new THREE.Mesh(
          new THREE.CylinderGeometry(0.05, 0.06, 1.85, 10, 1, true, 0, Math.PI),
          curtainMat,
        );
        fold.position.set(i * 0.085, 0, 0);
        panel.add(fold);
      }
      panel.position.set(cx + side * (w / 2 + 0.14) - (side < 0 ? 0.26 : 0), cy + h / 2 + 0.16 - 0.925, wallZ + 0.1);
      g.add(panel);
    }

    this.environment.add(g);
  }

  buildSofa() {
    const sofa = new THREE.Group();
    const fabric = new THREE.MeshStandardMaterial({ color: FABRIC_SAGE, roughness: 0.95 });
    const cushionMat = new THREE.MeshStandardMaterial({ color: FABRIC_CREAM, roughness: 0.95 });

    const base = new THREE.Mesh(new THREE.BoxGeometry(1.7, 0.34, 0.78), fabric);
    base.position.y = 0.28;
    sofa.add(base);

    const back = new THREE.Mesh(new THREE.BoxGeometry(1.7, 0.62, 0.2), fabric);
    back.position.set(0, 0.72, -0.3);
    back.rotation.x = -0.08;
    sofa.add(back);

    for (const side of [-1, 1]) {
      const arm = new THREE.Mesh(new THREE.CapsuleGeometry(0.11, 0.55, 6, 14), fabric);
      arm.rotation.x = Math.PI / 2;
      arm.position.set(side * 0.85, 0.55, -0.02);
      sofa.add(arm);
    }

    // Seat and back cushions
    for (const side of [-1, 1]) {
      const seat = new THREE.Mesh(new THREE.BoxGeometry(0.76, 0.14, 0.6), cushionMat);
      seat.position.set(side * 0.41, 0.51, 0.03);
      sofa.add(seat);
      const backCushion = new THREE.Mesh(new THREE.SphereGeometry(0.3, 20, 14), cushionMat);
      backCushion.scale.set(1.25, 0.72, 0.38);
      backCushion.position.set(side * 0.41, 0.74, -0.17);
      sofa.add(backCushion);
    }

    // Throw pillows
    const pillowColors = [0xe8907e, 0xe3b96f];
    pillowColors.forEach((color, i) => {
      const pillow = new THREE.Mesh(
        new THREE.SphereGeometry(0.16, 18, 12),
        new THREE.MeshStandardMaterial({ color, roughness: 1 }),
      );
      pillow.scale.set(1, 0.95, 0.5);
      pillow.position.set(i === 0 ? -0.62 : 0.62, 0.68, -0.05);
      pillow.rotation.z = i === 0 ? 0.2 : -0.2;
      sofa.add(pillow);
    });

    // Little wooden legs
    const legMat = new THREE.MeshStandardMaterial({ color: WOOD_DARK, roughness: 0.7 });
    for (const [x, z] of [[-0.78, 0.3], [0.78, 0.3], [-0.78, -0.3], [0.78, -0.3]]) {
      const leg = new THREE.Mesh(new THREE.CylinderGeometry(0.03, 0.025, 0.12, 8), legMat);
      leg.position.set(x, 0.06, z);
      sofa.add(leg);
    }

    sofa.position.set(1.7, 0, -2.2);
    this.environment.add(sofa);
  }

  buildBookshelf() {
    const shelf = new THREE.Group();
    const woodMat = new THREE.MeshStandardMaterial({ color: WOOD_MID, roughness: 0.8 });
    const W = 0.95;
    const H = 1.45;
    const D = 0.26;

    for (const side of [-1, 1]) {
      const upright = new THREE.Mesh(new THREE.BoxGeometry(0.05, H, D), woodMat);
      upright.position.set(side * (W / 2 - 0.025), H / 2, 0);
      shelf.add(upright);
    }
    const bookColors = [0xc98d75, 0x8fa98b, 0xd8b36a, 0x9a8bb5, 0xb5766a, 0x7f9db1];
    for (let level = 0; level < 4; level++) {
      const y = 0.08 + level * 0.42;
      const board = new THREE.Mesh(new THREE.BoxGeometry(W, 0.04, D), woodMat);
      board.position.y = y;
      shelf.add(board);
      if (level === 3) break; // top board only
      // A cosy row of books, leaning a little
      let x = -W / 2 + 0.08;
      for (let b = 0; b < 8 && x < W / 2 - 0.1; b++) {
        const bh = 0.2 + ((b * 5 + level * 3) % 4) * 0.025;
        const bw = 0.035 + ((b * 3 + level) % 3) * 0.01;
        const book = new THREE.Mesh(
          new THREE.BoxGeometry(bw, bh, 0.17),
          new THREE.MeshStandardMaterial({ color: bookColors[(b + level * 2) % bookColors.length], roughness: 0.9 }),
        );
        book.position.set(x, y + 0.02 + bh / 2, 0);
        if (b === 7) book.rotation.z = 0.12;
        shelf.add(book);
        x += bw + 0.012;
      }
    }
    // A tiny plant on top
    const topPot = new THREE.Mesh(
      new THREE.CylinderGeometry(0.06, 0.045, 0.09, 12),
      new THREE.MeshStandardMaterial({ color: 0xb96f52, roughness: 0.9 }),
    );
    topPot.position.set(0.2, H - 0.155, 0);
    shelf.add(topPot);
    const topLeaf = new THREE.Mesh(
      new THREE.SphereGeometry(0.08, 12, 10),
      new THREE.MeshStandardMaterial({ color: 0x86b57e, roughness: 1 }),
    );
    topLeaf.scale.y = 1.2;
    topLeaf.position.set(0.2, H - 0.03, 0);
    shelf.add(topLeaf);

    shelf.position.set(-3.32, 0, 0.7);
    shelf.rotation.y = Math.PI / 2;
    this.environment.add(shelf);
  }

  buildLamp() {
    const lamp = new THREE.Group();
    const metal = new THREE.MeshStandardMaterial({ color: 0x8a6a4e, roughness: 0.6 });
    const base = new THREE.Mesh(new THREE.CylinderGeometry(0.16, 0.18, 0.035, 20), metal);
    base.position.y = 0.02;
    lamp.add(base);
    const pole = new THREE.Mesh(new THREE.CylinderGeometry(0.018, 0.018, 1.32, 10), metal);
    pole.position.y = 0.68;
    lamp.add(pole);
    const shade = new THREE.Mesh(
      new THREE.CylinderGeometry(0.14, 0.22, 0.28, 20, 1, true),
      new THREE.MeshStandardMaterial({
        color: 0xf3dcba,
        emissive: 0xffe0b0,
        emissiveIntensity: 0.55,
        roughness: 0.9,
        side: THREE.DoubleSide,
      }),
    );
    shade.position.y = 1.44;
    lamp.add(shade);
    const bulb = new THREE.Mesh(
      new THREE.SphereGeometry(0.05, 12, 10),
      new THREE.MeshBasicMaterial({ color: 0xfff0d0 }),
    );
    bulb.position.y = 1.4;
    lamp.add(bulb);

    const glow = new THREE.PointLight(0xffd9a8, 0.7, 6, 2);
    glow.position.y = 1.42;
    lamp.add(glow);

    lamp.position.set(2.85, 0, -1.0);
    this.environment.add(lamp);
  }

  buildPlant() {
    const plant = new THREE.Group();
    const pot = new THREE.Mesh(
      new THREE.CylinderGeometry(0.17, 0.13, 0.26, 16),
      new THREE.MeshStandardMaterial({ color: 0xb96f52, roughness: 0.9 }),
    );
    pot.position.y = 0.13;
    plant.add(pot);
    const rim = new THREE.Mesh(
      new THREE.TorusGeometry(0.165, 0.018, 8, 20),
      new THREE.MeshStandardMaterial({ color: 0xc57e60, roughness: 0.9 }),
    );
    rim.rotation.x = Math.PI / 2;
    rim.position.y = 0.26;
    plant.add(rim);
    const leafMat = new THREE.MeshStandardMaterial({ color: 0x74a06d, roughness: 1 });
    const leafMat2 = new THREE.MeshStandardMaterial({ color: 0x86b57e, roughness: 1 });
    const leaves = [
      [0, 0.55, 0, 0.2, 0],
      [0.14, 0.48, 0.06, 0.16, 0.5],
      [-0.13, 0.5, 0.05, 0.17, -0.5],
      [0.05, 0.46, -0.13, 0.15, 0.2],
      [-0.05, 0.64, -0.05, 0.14, -0.2],
      [0.02, 0.42, 0.14, 0.13, 0.7],
    ];
    leaves.forEach(([x, y, z, r, tilt], i) => {
      const leaf = new THREE.Mesh(new THREE.SphereGeometry(r, 12, 10), i % 2 ? leafMat2 : leafMat);
      leaf.scale.set(0.55, 1.5, 0.55);
      leaf.position.set(x, y, z);
      leaf.rotation.z = tilt;
      plant.add(leaf);
    });
    plant.position.set(-2.85, 0, -2.25);
    this.environment.add(plant);
  }

  buildSideTable() {
    const table = new THREE.Group();
    const woodMat = new THREE.MeshStandardMaterial({ color: WOOD_MID, roughness: 0.7 });
    const top = new THREE.Mesh(new THREE.CylinderGeometry(0.26, 0.26, 0.035, 24), woodMat);
    top.position.y = 0.5;
    table.add(top);
    const leg = new THREE.Mesh(new THREE.CylinderGeometry(0.025, 0.025, 0.48, 10), woodMat);
    leg.position.y = 0.25;
    table.add(leg);
    const foot = new THREE.Mesh(new THREE.CylinderGeometry(0.16, 0.18, 0.03, 20), woodMat);
    foot.position.y = 0.015;
    table.add(foot);
    // A mug of something warm
    const mug = new THREE.Mesh(
      new THREE.CylinderGeometry(0.045, 0.04, 0.09, 14),
      new THREE.MeshStandardMaterial({ color: 0xd96a5a, roughness: 0.6 }),
    );
    mug.position.set(0.06, 0.565, 0.04);
    table.add(mug);
    const handle = new THREE.Mesh(
      new THREE.TorusGeometry(0.028, 0.008, 8, 14),
      new THREE.MeshStandardMaterial({ color: 0xd96a5a, roughness: 0.6 }),
    );
    handle.position.set(0.11, 0.565, 0.04);
    table.add(handle);
    // A small stack of picture books
    const bookStack = [0x8fa98b, 0xd8b36a];
    bookStack.forEach((color, i) => {
      const book = new THREE.Mesh(
        new THREE.BoxGeometry(0.16, 0.02, 0.12),
        new THREE.MeshStandardMaterial({ color, roughness: 0.9 }),
      );
      book.position.set(-0.08, 0.528 + i * 0.021, -0.03);
      book.rotation.y = i * 0.35;
      table.add(book);
    });

    table.position.set(2.95, 0, -2.3);
    this.environment.add(table);
  }

  buildPictures() {
    const frames = [
      { kind: 'sun-heart', x: 1.7, y: 2.15, z: ROOM.backZ + 0.03, rotY: 0 },
      { kind: 'rainbow', x: 0.35, y: 1.9, z: ROOM.backZ + 0.03, rotY: 0 },
      { kind: 'house', x: ROOM.halfW - 0.03, y: 1.75, z: 0.6, rotY: -Math.PI / 2 },
    ];
    const frameMat = new THREE.MeshStandardMaterial({ color: WOOD_DARK, roughness: 0.7 });
    for (const { kind, x, y, z, rotY } of frames) {
      const g = new THREE.Group();
      const frame = new THREE.Mesh(new THREE.BoxGeometry(0.56, 0.46, 0.035), frameMat);
      g.add(frame);
      const art = new THREE.Mesh(
        new THREE.PlaneGeometry(0.48, 0.38),
        new THREE.MeshStandardMaterial({ map: this.makeDrawingTexture(kind), roughness: 1 }),
      );
      art.position.z = 0.02;
      g.add(art);
      g.position.set(x, y, z);
      g.rotation.y = rotY;
      this.environment.add(g);
    }
  }

  buildCushions() {
    // Floor cushions near the rug — somewhere soft to imagine sitting.
    const cushions = [
      { color: 0xe8907e, x: -1.55, z: 0.85, s: 1 },
      { color: 0xa9b79b, x: 1.75, z: 1.15, s: 0.85 },
    ];
    for (const { color, x, z, s } of cushions) {
      const cushion = new THREE.Mesh(
        new THREE.SphereGeometry(0.3, 20, 14),
        new THREE.MeshStandardMaterial({ color, roughness: 1 }),
      );
      cushion.scale.set(s, 0.38 * s, s);
      cushion.position.set(x, 0.11 * s, z);
      this.environment.add(cushion);
    }
  }

  buildDustMotes() {
    // Tiny motes drifting in the window light — barely-there sparkle.
    const count = 36;
    const positions = new Float32Array(count * 3);
    for (let i = 0; i < count; i++) {
      positions[i * 3] = -2.2 + Math.random() * 2.4;
      positions[i * 3 + 1] = 0.4 + Math.random() * 1.8;
      positions[i * 3 + 2] = -2.3 + Math.random() * 2.6;
    }
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.BufferAttribute(positions, 3));

    const spriteCanvas = document.createElement('canvas');
    spriteCanvas.width = spriteCanvas.height = 64;
    const sctx = spriteCanvas.getContext('2d');
    const sgrad = sctx.createRadialGradient(32, 32, 2, 32, 32, 30);
    sgrad.addColorStop(0, 'rgba(255, 244, 218, 1)');
    sgrad.addColorStop(0.5, 'rgba(255, 240, 208, 0.5)');
    sgrad.addColorStop(1, 'rgba(255, 240, 208, 0)');
    sctx.fillStyle = sgrad;
    sctx.fillRect(0, 0, 64, 64);

    this.motes = new THREE.Points(
      geo,
      new THREE.PointsMaterial({
        map: new THREE.CanvasTexture(spriteCanvas),
        color: 0xfff2d8,
        size: 0.035,
        transparent: true,
        opacity: 0.5,
        depthWrite: false,
        sizeAttenuation: true,
      }),
    );
    this.environment.add(this.motes);
  }

  // ---- Runtime ------------------------------------------------------------

  // Toggle the gentle background animations (dust motes drifting).
  setMotion(on) {
    this.motes.visible = on;
  }

  // Hide the room during AR passthrough sessions.
  setAREnvironment(isAR) {
    this.environment.visible = !isAR;
    this.scene.background = isAR ? null : this.bgColor;
  }

  onUpdate(fn) {
    this.updaters.push(fn);
  }

  start() {
    this.renderer.setAnimationLoop(() => {
      const dt = Math.min(this.clock.getDelta(), 0.1);
      const time = this.clock.elapsedTime;
      if (!this.renderer.xr.isPresenting) this.controls.update();
      if (this.motes.visible) {
        this.motes.rotation.y = Math.sin(time * 0.05) * 0.25;
        this.motes.position.y = Math.sin(time * 0.3) * 0.04;
      }
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
