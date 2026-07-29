import {
  createGymGroups,
  GYM_QUALITY_BUDGETS,
  gymBudgetSnapshot,
} from "./gym-scene.js?v=1.0";

export const VENUE_IDS = Object.freeze({
  MONTGOMERY: "montgomery",
  ARENA_840: "arena840",
});

export const VENUE_QUALITY_BUDGETS = Object.freeze({
  montgomery: GYM_QUALITY_BUDGETS,
  arena840: Object.freeze({
    low: Object.freeze({ calls: 88, triangles: 30000, geometries: 130, textures: 5, seats: 210, rafters: 6 }),
    medium: Object.freeze({ calls: 112, triangles: 44000, geometries: 170, textures: 7, seats: 420, rafters: 9 }),
    high: Object.freeze({ calls: 138, triangles: 58000, geometries: 210, textures: 9, seats: 840, rafters: 12 }),
  }),
});

export const VENUE_VIEW_PRESETS = Object.freeze({
  montgomery: Object.freeze({
    baseline: Object.freeze({ position: [8.3, 4.25, 13.4], target: [0, 2.4, -8.6] }),
    sideline: Object.freeze({ position: [8.65, 4.15, 2.1], target: [0, 1.45, 0] }),
    bleachers: Object.freeze({ position: [-6.4, 2.35, -5.5], target: [0, 1.8, 14.1] }),
    rafters: Object.freeze({ position: [6.4, 2.25, 8.8], target: [0, 7.65, -1] }),
    scoreboard: Object.freeze({ position: [-6.8, 3.8, -5.4], target: [0, 4.9, 15.2] }),
    "court-wide": Object.freeze({ position: [8.4, 7.15, 13.6], target: [0, 0.2, 0] }),
  }),
  arena840: Object.freeze({
    baseline: Object.freeze({ position: [6.9, 4.4, 10.6], target: [0, 1.25, -8.6] }),
    sideline: Object.freeze({ position: [9.3, 4.6, 2.4], target: [0, 1.1, -1.4] }),
    bleachers: Object.freeze({ position: [-7.5, 5.8, 10.9], target: [0, 1.5, 0] }),
    rafters: Object.freeze({ position: [7.8, 7.7, 9.7], target: [0, 8.7, -2.2] }),
    scoreboard: Object.freeze({ position: [-6.6, 3.8, -9.8], target: [0, 5.35, 15.4] }),
    "court-wide": Object.freeze({ position: [9.1, 7.8, 10.8], target: [0, 0.35, 0] }),
  }),
});

const qualityName = (quality) => ["low", "medium", "high"].includes(quality) ? quality : "high";
const mat = (T, color, options = {}) =>
  new T.MeshStandardMaterial({ color, roughness: 0.72, metalness: 0.04, ...options });

function box(T, dimensions, position, material) {
  const mesh = new T.Mesh(new T.BoxGeometry(...dimensions), material);
  mesh.position.set(...position);
  mesh.receiveShadow = true;
  return mesh;
}

function createArenaShell(T) {
  const root = new T.Group();
  root.name = "arena840-shell";
  root.userData.collisionProxies = Object.freeze([
    { id: "north-wall", center: [0, 4.8, -16.2], halfExtents: [11.4, 4.8, 0.12] },
    { id: "south-wall", center: [0, 4.8, 16.2], halfExtents: [11.4, 4.8, 0.12] },
    { id: "west-wall", center: [-11.4, 4.8, 0], halfExtents: [0.12, 4.8, 16.2] },
    { id: "east-wall", center: [11.4, 4.8, 0], halfExtents: [0.12, 4.8, 16.2] },
  ]);
  const brick = mat(T, 0x181413, { roughness: 0.94 });
  const lower = mat(T, 0xe3e3df, { roughness: 0.82 });
  root.add(
    box(T, [23, 0.18, 32.8], [0, -0.18, 0], mat(T, 0x181a1d)),
    box(T, [23, 3.1, 0.24], [0, 1.55, -16.2], lower),
    box(T, [23, 6.5, 0.24], [0, 6.35, -16.2], brick),
    box(T, [23, 3.1, 0.24], [0, 1.55, 16.2], lower),
    box(T, [23, 6.5, 0.24], [0, 6.35, 16.2], brick),
    box(T, [0.24, 9.6, 32.6], [-11.4, 4.8, 0], brick),
    box(T, [0.24, 9.6, 32.6], [11.4, 4.8, 0], brick),
  );
  return root;
}

function createArenaArchitecture(T, quality) {
  const root = new T.Group();
  root.name = "arena840-architecture";
  const budget = VENUE_QUALITY_BUDGETS.arena840[qualityName(quality)];
  const dummy = new T.Object3D();

  const balcony = mat(T, 0xd8d9d7, { roughness: 0.76 });
  root.add(
    box(T, [22.1, 0.3, 2.9], [0, 3.08, -14.25], balcony),
    box(T, [22.1, 0.3, 2.9], [0, 3.08, 14.25], balcony),
  );
  const fascia = mat(T, 0xc62028, { roughness: 0.54 });
  root.add(
    box(T, [22.2, 0.34, 0.4], [0, 2.85, -12.82], fascia),
    box(T, [22.2, 0.34, 0.4], [0, 2.85, 12.82], fascia),
  );

  const rafterGeometry = new T.BoxGeometry(22.6, 0.12, 0.16);
  const rafters = new T.InstancedMesh(
    rafterGeometry,
    mat(T, 0x30343a, { roughness: 0.35, metalness: 0.62 }),
    budget.rafters,
  );
  for (let index = 0; index < budget.rafters; index += 1) {
    const z = -14.3 + (28.6 * index) / Math.max(1, budget.rafters - 1);
    dummy.position.set(0, 9.12 + Math.cos((z / 14.3) * Math.PI / 2) * 0.22, z);
    dummy.updateMatrix();
    rafters.setMatrixAt(index, dummy.matrix);
  }
  root.add(rafters);

  const windowGeometry = new T.CapsuleGeometry(0.58, 1.75, 4, 12);
  const windowMaterial = new T.MeshBasicMaterial({ color: 0xffb16a, transparent: true, opacity: 0.72 });
  const windows = new T.InstancedMesh(windowGeometry, windowMaterial, 20);
  let instance = 0;
  for (const side of [-1, 1]) {
    for (let index = 0; index < 10; index += 1) {
      dummy.position.set(-8.85 + index * 1.97, 6.4, side * 16.03);
      dummy.rotation.set(Math.PI / 2, 0, 0);
      dummy.scale.set(1, 1, 0.08);
      dummy.updateMatrix();
      windows.setMatrixAt(instance++, dummy.matrix);
    }
  }
  root.add(windows);
  return root;
}

function createArenaBleachers(T, quality) {
  const root = new T.Group();
  root.name = "arena840-bleachers";
  const seatCount = VENUE_QUALITY_BUDGETS.arena840[qualityName(quality)].seats;
  const rows = qualityName(quality) === "high" ? 14 : qualityName(quality) === "medium" ? 10 : 7;
  const columns = Math.ceil(seatCount / (rows * 2));
  const seatGeometry = new T.BoxGeometry(0.42, 0.12, 0.39);
  const seats = new T.InstancedMesh(seatGeometry, mat(T, 0x242326, { roughness: 0.82 }), seatCount);
  const dummy = new T.Object3D();
  let instance = 0;
  for (const side of [-1, 1]) {
    for (let row = 0; row < rows && instance < seatCount; row += 1) {
      for (let column = 0; column < columns && instance < seatCount; column += 1) {
        dummy.position.set(
          -10.2 + column * (20.4 / Math.max(1, columns - 1)),
          3.35 + row * 0.38,
          side * (13.35 + row * 0.2),
        );
        dummy.updateMatrix();
        seats.setMatrixAt(instance++, dummy.matrix);
      }
    }
  }
  root.add(seats);

  const railGeometry = new T.BoxGeometry(21.5, 0.06, 0.06);
  const rails = new T.InstancedMesh(railGeometry, mat(T, 0x8d9699, { metalness: 0.7 }), 4);
  for (let index = 0; index < 4; index += 1) {
    dummy.position.set(0, 3.55 + (index % 2) * 2.25, index < 2 ? -12.72 : 12.72);
    dummy.updateMatrix();
    rails.setMatrixAt(index, dummy.matrix);
  }
  root.add(rails);
  return root;
}

function createArenaSignage(T) {
  const root = new T.Group();
  root.name = "arena840-signage";
  const board = new T.Group();
  board.add(box(T, [4.4, 1.5, 0.16], [0, 0, 0], mat(T, 0x101317, { roughness: 0.44 })));
  const home = box(T, [1.35, 0.18, 0.02], [-1.25, 0.18, 0.1], new T.MeshBasicMaterial({ color: 0xffd15b }));
  const guest = home.clone();
  guest.position.x = 1.25;
  const clock = box(T, [0.7, 0.22, 0.02], [0, -0.28, 0.1], new T.MeshBasicMaterial({ color: 0xff4d45 }));
  board.add(home, guest, clock);
  board.position.set(0, 5.45, 16.02);
  board.rotation.y = Math.PI;
  root.add(board);
  return root;
}

function createArenaLighting(T, quality) {
  const root = new T.Group();
  root.name = "arena840-lighting";
  const count = qualityName(quality) === "low" ? 8 : qualityName(quality) === "medium" ? 12 : 16;
  const panels = new T.InstancedMesh(
    new T.BoxGeometry(1.3, 0.05, 0.46),
    new T.MeshBasicMaterial({ color: 0xfff4d8 }),
    count,
  );
  const dummy = new T.Object3D();
  for (let index = 0; index < count; index += 1) {
    const column = index % 2;
    const row = Math.floor(index / 2);
    dummy.position.set(column ? 4.6 : -4.6, 8.95, -12.4 + row * (24.8 / Math.max(1, count / 2 - 1)));
    dummy.updateMatrix();
    panels.setMatrixAt(index, dummy.matrix);
  }
  root.add(panels);
  return root;
}

function arenaGroups(T, quality) {
  const montgomeryRequired = createGymGroups(T, quality).slice(1, 3);
  return [
    { id: "arena840-shell", phase: "shell", required: true, createFallback: () => createArenaShell(T), load: () => createArenaShell(T) },
    ...montgomeryRequired.map((group) => ({
      ...group,
      id: group.id.replace("gym-", "arena840-"),
      createFallback: group.createFallback ? () => {
        const value = group.createFallback();
        value.name = group.id.replace("gym-", "arena840-");
        if (value.name === "arena840-court") {
          value.traverse((node) => {
            if (node.material?.color?.getHex?.() === 0x173c69) node.material.color.setHex(0xb71924);
          });
        }
        return value;
      } : undefined,
      load: () => {
        const value = group.load();
        value.name = group.id.replace("gym-", "arena840-");
        if (value.name === "arena840-court") {
          value.traverse((node) => {
            if (node.material?.color?.getHex?.() === 0x173c69) node.material.color.setHex(0xb71924);
          });
        }
        return value;
      },
    })),
    { id: "arena840-architecture", phase: "optional", load: () => createArenaArchitecture(T, quality) },
    { id: "arena840-bleachers", phase: "optional", load: () => createArenaBleachers(T, quality) },
    { id: "arena840-signage", phase: "optional", load: () => createArenaSignage(T) },
    { id: "arena840-lighting", phase: "optional", load: () => createArenaLighting(T, quality) },
  ];
}

function prefixMontgomeryGroup(group) {
  const id = group.id.replace("gym-", "montgomery-");
  const rename = (factory) => factory ? () => {
    const value = factory();
    value.name = id;
    return value;
  } : undefined;
  return { ...group, id, createFallback: rename(group.createFallback), load: rename(group.load) };
}

export function normalizeVenueId(value) {
  return value === VENUE_IDS.ARENA_840 ? VENUE_IDS.ARENA_840 : VENUE_IDS.MONTGOMERY;
}

export function createVenueGroups(T, venueId = VENUE_IDS.MONTGOMERY, quality = "high") {
  const selected = normalizeVenueId(venueId);
  const tier = qualityName(quality);
  return selected === VENUE_IDS.ARENA_840
    ? arenaGroups(T, tier)
    : createGymGroups(T, tier).map(prefixMontgomeryGroup);
}

export function venueGroupIds(venueId = VENUE_IDS.MONTGOMERY) {
  const prefix = normalizeVenueId(venueId);
  return [
    `${prefix}-shell`,
    `${prefix}-court`,
    `${prefix}-hoops`,
    `${prefix}-architecture`,
    `${prefix}-bleachers`,
    `${prefix}-signage`,
    `${prefix}-lighting`,
  ];
}

export function venueBudgetSnapshot(venueId = VENUE_IDS.MONTGOMERY, quality = "high") {
  const selected = normalizeVenueId(venueId);
  const tier = qualityName(quality);
  if (selected === VENUE_IDS.MONTGOMERY) {
    return { venueId: selected, ...gymBudgetSnapshot(tier), downloadedBytes: 0 };
  }
  return {
    venueId: selected,
    quality: tier,
    ...VENUE_QUALITY_BUDGETS[selected][tier],
    glbBytes: 0,
    downloadedBytes: 0,
  };
}

export function productionVenueGroupIds(venueId = VENUE_IDS.MONTGOMERY) {
  const prefix = normalizeVenueId(venueId);
  return [
    "production-court",
    "production-hoops",
    "production-players",
    `${prefix}-shell`,
    `${prefix}-architecture`,
    `${prefix}-bleachers`,
    `${prefix}-signage`,
    `${prefix}-lighting`,
  ];
}
