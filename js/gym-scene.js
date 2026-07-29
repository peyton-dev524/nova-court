export const GYM_COURT = Object.freeze({
  length: 25.6032,
  width: 15.24,
  rimHeight: 3.048,
  rimRadius: 0.2286,
  centerCircleRadius: 1.8288,
  threePointRadius: 6.0198,
  laneWidth: 3.6576,
  freeThrowDistance: 4.572,
  lineWidth: 0.0508,
});

export const GYM_QUALITY_BUDGETS = Object.freeze({
  low: Object.freeze({ calls: 92, triangles: 28000, geometries: 150, textures: 6, seatRows: 3, rafterCount: 6 }),
  medium: Object.freeze({ calls: 116, triangles: 42000, geometries: 185, textures: 9, seatRows: 5, rafterCount: 8 }),
  high: Object.freeze({ calls: 140, triangles: 55000, geometries: 220, textures: 12, seatRows: 7, rafterCount: 10 }),
});

export const GYM_GROUP_IDS = Object.freeze([
  "gym-shell",
  "gym-court",
  "gym-hoops",
  "gym-architecture",
  "gym-bleachers",
  "gym-signage",
  "gym-lighting",
]);

const qualityName = (quality) => (quality in GYM_QUALITY_BUDGETS ? quality : "high");

function material(T, color, options = {}) {
  return new T.MeshStandardMaterial({ color, roughness: 0.72, metalness: 0.03, ...options });
}

function box(T, size, position, mat) {
  const mesh = new T.Mesh(new T.BoxGeometry(...size), mat);
  mesh.position.set(...position);
  mesh.castShadow = true;
  mesh.receiveShadow = true;
  return mesh;
}

function addLine(T, root, points, lineMaterial, closed = false) {
  const geometry = new T.BufferGeometry().setFromPoints(points.map(([x, z]) => new T.Vector3(x, 0.026, z)));
  const line = closed
    ? new T.LineLoop(geometry, lineMaterial)
    : new T.Line(geometry, lineMaterial);
  root.add(line);
  return line;
}

function arcPoints(cx, cz, radius, start, end, count = 48) {
  return Array.from({ length: count + 1 }, (_, index) => {
    const angle = start + ((end - start) * index) / count;
    return [cx + Math.cos(angle) * radius, cz + Math.sin(angle) * radius];
  });
}

function createCourt(T) {
  const root = new T.Group();
  root.name = "gym-court";
  const floorMaterial = material(T, 0xb9824f, { roughness: 0.43 });
  root.add(box(T, [GYM_COURT.width + 2.6, 0.12, GYM_COURT.length + 2.6], [0, -0.07, 0], floorMaterial));

  const stripGeometry = new T.BoxGeometry(0.305, 0.012, GYM_COURT.length + 2.55);
  const stripMaterial = material(T, 0xe2b36f, { roughness: 0.39 });
  const strips = new T.InstancedMesh(stripGeometry, stripMaterial, 51);
  const dummy = new T.Object3D();
  for (let index = 0; index < 51; index += 1) {
    dummy.position.set(-7.62 + index * 0.305, 0.003, 0);
    dummy.updateMatrix();
    strips.setMatrixAt(index, dummy.matrix);
  }
  strips.receiveShadow = true;
  root.add(strips);

  const paintMaterial = new T.MeshBasicMaterial({ color: 0x173c69, transparent: true, opacity: 0.86 });
  const paintGeometry = new T.PlaneGeometry(GYM_COURT.laneWidth, 4.572);
  for (const sign of [-1, 1]) {
    const paint = new T.Mesh(paintGeometry, paintMaterial);
    paint.rotation.x = -Math.PI / 2;
    paint.position.set(0, 0.018, sign * (GYM_COURT.length / 2 - 2.286));
    root.add(paint);
  }

  const lineMaterial = new T.LineBasicMaterial({ color: 0xf5efe5 });
  const hw = GYM_COURT.width / 2;
  const hl = GYM_COURT.length / 2;
  addLine(T, root, [[-hw, -hl], [hw, -hl], [hw, hl], [-hw, hl]], lineMaterial, true);
  addLine(T, root, [[-hw, 0], [hw, 0]], lineMaterial);
  addLine(T, root, arcPoints(0, 0, GYM_COURT.centerCircleRadius, 0, Math.PI * 2, 64), lineMaterial, true);
  for (const sign of [-1, 1]) {
    const basketZ = sign * (hl - 1.2192);
    addLine(T, root, arcPoints(0, basketZ, GYM_COURT.threePointRadius, sign < 0 ? 0.2 : Math.PI + 0.2, sign < 0 ? Math.PI - 0.2 : Math.PI * 2 - 0.2), lineMaterial);
    const freeThrowZ = sign * (hl - GYM_COURT.freeThrowDistance);
    addLine(T, root, arcPoints(0, freeThrowZ, GYM_COURT.laneWidth / 2, 0, Math.PI * 2, 48), lineMaterial, true);
    addLine(T, root, [
      [-GYM_COURT.laneWidth / 2, sign * hl],
      [-GYM_COURT.laneWidth / 2, freeThrowZ],
      [GYM_COURT.laneWidth / 2, freeThrowZ],
      [GYM_COURT.laneWidth / 2, sign * hl],
    ], lineMaterial);
  }
  return root;
}

function createShell(T) {
  const root = new T.Group();
  root.name = "gym-shell";
  const cream = material(T, 0xd8d0bb);
  const lower = material(T, 0x506a78, { roughness: 0.86 });
  root.add(box(T, [20, 0.16, 31], [0, -0.15, 0], material(T, 0x2a3137)));
  root.add(box(T, [20, 2.15, 0.22], [0, 1.075, -15.45], lower));
  root.add(box(T, [20, 6.4, 0.18], [0, 5.35, -15.48], cream));
  root.add(box(T, [20, 2.15, 0.22], [0, 1.075, 15.45], lower));
  root.add(box(T, [20, 6.4, 0.18], [0, 5.35, 15.48], cream));
  root.add(box(T, [0.22, 8.6, 31], [-10, 4.3, 0], cream));
  root.add(box(T, [0.22, 8.6, 31], [10, 4.3, 0], cream));
  root.add(box(T, [20.2, 0.16, 31.2], [0, 8.62, 0], material(T, 0x1d2930, { roughness: 0.92 })));
  const doorMaterial = material(T, 0x243e50, { metalness: 0.15, roughness: 0.5 });
  for (const sign of [-1, 1]) {
    for (const x of [-4.4, 4.4]) {
      root.add(box(T, [2.25, 2.45, 0.08], [x, 1.225, sign * 15.31], doorMaterial));
      root.add(box(T, [0.055, 2.35, 0.09], [x, 1.225, sign * 15.26], material(T, 0xb4c5ca)));
    }
  }
  root.traverse((node) => { if (node.isMesh) node.castShadow = false; });
  return root;
}

function createHoop(T, sign) {
  const root = new T.Group();
  const z = sign * (GYM_COURT.length / 2 - 1.2192);
  const board = box(T, [1.8288, 1.0668, 0.075], [0, 3.48, z + sign * 0.16], material(T, 0xe8f6f5, {
    transparent: true,
    opacity: 0.72,
    roughness: 0.12,
  }));
  const support = box(T, [0.13, 3.42, 0.13], [0, 1.71, sign * (GYM_COURT.length / 2 + 0.55)], material(T, 0x263c4a));
  const arm = box(T, [0.13, 0.13, 1.9], [0, 3.62, sign * (GYM_COURT.length / 2 - 0.25)], material(T, 0x263c4a));
  const rim = new T.Mesh(
    new T.TorusGeometry(GYM_COURT.rimRadius, 0.019, 10, 32),
    material(T, 0xe4522d, { roughness: 0.38 }),
  );
  rim.rotation.x = Math.PI / 2;
  rim.position.set(0, GYM_COURT.rimHeight, z - sign * 0.31);
  root.add(board, support, arm, rim);
  return root;
}

function createArchitecture(T, quality) {
  const root = new T.Group();
  root.name = "gym-architecture";
  const budget = GYM_QUALITY_BUDGETS[qualityName(quality)];
  const rafterGeometry = new T.BoxGeometry(19.4, 0.12, 0.16);
  const rafterMaterial = material(T, 0x273c4a, { metalness: 0.45 });
  const rafters = new T.InstancedMesh(rafterGeometry, rafterMaterial, budget.rafterCount);
  const dummy = new T.Object3D();
  for (let index = 0; index < budget.rafterCount; index += 1) {
    dummy.position.set(0, 8.02, -13.5 + (27 * index) / Math.max(1, budget.rafterCount - 1));
    dummy.rotation.z = index % 2 ? 0.018 : -0.018;
    dummy.updateMatrix();
    rafters.setMatrixAt(index, dummy.matrix);
  }
  root.add(rafters);

  const panelGeometry = new T.BoxGeometry(0.08, 1.25, 2.1);
  const panels = new T.InstancedMesh(panelGeometry, material(T, 0xabc2c6, { roughness: 0.5 }), 20);
  for (let index = 0; index < 20; index += 1) {
    const side = index < 10 ? -1 : 1;
    dummy.position.set(side * 9.86, 5.25, -12.6 + (index % 10) * 2.8);
    dummy.updateMatrix();
    panels.setMatrixAt(index, dummy.matrix);
  }
  root.add(panels);
  return root;
}

function createBleachers(T, quality) {
  const root = new T.Group();
  root.name = "gym-bleachers";
  const rows = GYM_QUALITY_BUDGETS[qualityName(quality)].seatRows;
  const seatCount = rows * 18;
  const geometry = new T.BoxGeometry(0.76, 0.13, 0.66);
  const seats = new T.InstancedMesh(geometry, material(T, 0x1b4775, { roughness: 0.56 }), seatCount);
  const dummy = new T.Object3D();
  let instance = 0;
  for (let row = 0; row < rows; row += 1) {
    for (let column = 0; column < 18; column += 1) {
      dummy.position.set(-6.9 + column * 0.81, 0.32 + row * 0.34, 14.15 - row * 0.42);
      dummy.updateMatrix();
      seats.setMatrixAt(instance++, dummy.matrix);
    }
  }
  seats.castShadow = true;
  root.add(seats);
  return root;
}

function textTexture(T, title, subtitle, colors = {}) {
  const canvas = document.createElement("canvas");
  canvas.width = 1024;
  canvas.height = 256;
  const context = canvas.getContext("2d");
  context.fillStyle = colors.background || "#e7deca";
  context.fillRect(0, 0, canvas.width, canvas.height);
  context.fillStyle = colors.accent || "#a41f2c";
  context.fillRect(0, 196, canvas.width, 20);
  context.textAlign = "center";
  context.fillStyle = colors.foreground || "#193b62";
  context.font = "700 82px Arial";
  context.fillText(title, 512, 108);
  context.font = "600 38px Arial";
  context.fillText(subtitle, 512, 166);
  const texture = new T.CanvasTexture(canvas);
  texture.colorSpace = T.SRGBColorSpace;
  return texture;
}

function createSignage(T) {
  const root = new T.Group();
  root.name = "gym-signage";
  const endTexture = textTexture(T, "MONTGOMERY", "HOME COURT");
  const banner = new T.Mesh(
    new T.PlaneGeometry(7.2, 1.8),
    new T.MeshBasicMaterial({ map: endTexture }),
  );
  banner.position.set(0, 5.55, -15.36);
  root.add(banner);
  const scoreboardTexture = textTexture(T, "HOME  00  GUEST", "PERIOD  1", {
    background: "#14202a",
    foreground: "#f2c75c",
    accent: "#a72c37",
  });
  const scoreboard = new T.Mesh(
    new T.PlaneGeometry(4.2, 1.35),
    new T.MeshBasicMaterial({ map: scoreboardTexture }),
  );
  scoreboard.rotation.y = Math.PI;
  scoreboard.position.set(0, 5.15, 15.33);
  root.add(scoreboard);
  root.userData.textures = [endTexture, scoreboardTexture];
  return root;
}

function createLighting(T, quality) {
  const root = new T.Group();
  root.name = "gym-lighting";
  const columns = qualityName(quality) === "low" ? 4 : 6;
  const geometry = new T.BoxGeometry(1.25, 0.06, 0.42);
  const lights = new T.InstancedMesh(geometry, new T.MeshBasicMaterial({ color: 0xfff3d1 }), columns * 2);
  const dummy = new T.Object3D();
  let instance = 0;
  for (const x of [-4.3, 4.3]) {
    for (let index = 0; index < columns; index += 1) {
      dummy.position.set(x, 7.78, -11.5 + (23 * index) / Math.max(1, columns - 1));
      dummy.updateMatrix();
      lights.setMatrixAt(instance++, dummy.matrix);
    }
  }
  root.add(lights);
  return root;
}

export function createGymGroups(T, quality = "high") {
  const tier = qualityName(quality);
  return [
    { id: "gym-shell", phase: "shell", required: true, createFallback: () => createShell(T), load: () => createShell(T) },
    { id: "gym-court", phase: "required", required: true, createFallback: () => createCourt(T), load: () => createCourt(T) },
    {
      id: "gym-hoops",
      phase: "required",
      required: true,
      createFallback: () => {
        const root = new T.Group();
        root.name = "gym-hoops";
        root.add(createHoop(T, -1), createHoop(T, 1));
        return root;
      },
      load: () => {
        const root = new T.Group();
        root.name = "gym-hoops";
        root.add(createHoop(T, -1), createHoop(T, 1));
        return root;
      },
    },
    { id: "gym-architecture", phase: "optional", load: () => createArchitecture(T, tier) },
    { id: "gym-bleachers", phase: "optional", load: () => createBleachers(T, tier) },
    { id: "gym-signage", phase: "optional", load: () => createSignage(T) },
    { id: "gym-lighting", phase: "optional", load: () => createLighting(T, tier) },
  ];
}

export function gymBudgetSnapshot(quality = "high") {
  const tier = qualityName(quality);
  return { quality: tier, ...GYM_QUALITY_BUDGETS[tier], glbBytes: 0 };
}
