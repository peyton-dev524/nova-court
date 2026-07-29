/**
 * Code-native full-court basket extension. The shared arena builder supplies
 * the regulation surface and markings; this module adds the second hoop.
 */

const near = (a, b, tolerance = 0.002) => Math.abs((Number(a) || 0) - b) <= tolerance;

function hideLegacyHoop(engine) {
  engine.rim.visible = false;
  engine.backboard.visible = false;
  for (const line of engine.netLines || []) line.visible = false;
  const legacyBoxes = [
    [0.32, 3.55, 0.32],
    [1.18, 0.76, 1.3],
    [1.2, 0.08, 1.32],
    [0.18, 0.18, 0.86],
  ];
  for (const child of engine.worldRoot.children) {
    if (child.name?.startsWith("legacy-basket-")) {
      child.visible = false;
      continue;
    }
    const p = child.geometry?.parameters;
    if (!p || Math.abs(child.position.x) > 0.05 || child.position.z > -6) continue;
    if (legacyBoxes.some(([w, h, d]) => near(p.width, w) && near(p.height, h) && near(p.depth, d))) {
      child.visible = false;
    }
    if (near(p.width, 0.72) && near(p.height, 0.38)) child.visible = false;
  }
}

function hideLegacyArenaFull(engine) {
  for (const child of engine.worldRoot.children) {
    if (child.isInstancedMesh) {
      child.visible = false;
      continue;
    }
    const p = child.geometry?.parameters;
    if (!p) continue;
    const width = Number(p.width) || 0;
    const depth = Number(p.depth) || 0;
    const legacyWall = (near(width, 22) && near(depth, 0.7)) || (near(width, 0.7) && near(depth, 19));
    const legacyStand = (near(width, 18.1) && near(depth, 0.56)) || (near(width, 0.46) && near(depth, 15.8));
    const legacyRibbon = near(width, 13.8) && (near(p.height, 0.76) || near(p.height, 0.62));
    const legacyTruss = near(width, 0.12) && near(depth, 18);
    if (legacyWall || legacyStand || legacyRibbon || legacyTruss) child.visible = false;
  }
}

function buildNet(T, parent, basket) {
  const material = new T.LineBasicMaterial({ color: 0xeaffff, transparent: true, opacity: 0.78 });
  const lines = [];
  const strands = 12;
  for (let strand = 0; strand < strands; strand += 1) {
    const angle = (strand / strands) * Math.PI * 2;
    const nextAngle = ((strand + 1) / strands) * Math.PI * 2;
    const points = [];
    for (let row = 0; row < 5; row += 1) {
      const t = row / 4;
      const radius = 0.23 + (0.115 - 0.23) * t;
      const sampleAngle = row % 2 ? nextAngle : angle;
      points.push(new T.Vector3(
        basket.x + Math.cos(sampleAngle) * radius,
        basket.y - t * 0.48,
        basket.z + Math.sin(sampleAngle) * radius,
      ));
    }
    const line = new T.Line(new T.BufferGeometry().setFromPoints(points), material);
    line.userData.basePositions = Array.from(line.geometry.attributes.position.array);
    parent.add(line);
    lines.push(line);
  }
  return lines;
}

function buildBasket(T, parent, basket, teamId) {
  const group = new T.Group();
  group.name = `full-court-${teamId}-basket`;
  const sign = Math.sign(basket.z) || 1;
  const behindBoard = basket.backboardZ + sign * 0.7;
  const metal = new T.MeshStandardMaterial({ color: 0x596675, roughness: 0.24, metalness: 0.86 });
  const padding = new T.MeshStandardMaterial({
    color: teamId === "home" ? 0x10334a : 0x4a1728,
    roughness: 0.64,
  });
  const glass = new T.MeshPhysicalMaterial({
    color: 0xe7f5fa,
    roughness: 0.05,
    transmission: 0.86,
    transparent: true,
    opacity: 0.38,
  });
  const pole = new T.Mesh(new T.BoxGeometry(0.32, 3.55, 0.32), metal);
  pole.position.set(0, 1.78, behindBoard);
  pole.castShadow = true;
  group.add(pole);
  const base = new T.Mesh(new T.BoxGeometry(1.18, 0.76, 1.3), padding);
  base.position.set(0, 0.38, behindBoard);
  base.castShadow = true;
  group.add(base);
  const supportLength = Math.abs(behindBoard - basket.backboardZ) + 0.12;
  const support = new T.Mesh(new T.BoxGeometry(0.18, 0.18, supportLength), metal);
  support.position.set(0, 3.55, (behindBoard + basket.backboardZ) / 2);
  group.add(support);
  const board = new T.Mesh(new T.BoxGeometry(1.84, 1.08, 0.05), glass);
  board.position.set(0, 3.52, basket.backboardZ);
  board.castShadow = true;
  group.add(board);
  const frame = new T.LineSegments(
    new T.EdgesGeometry(new T.BoxGeometry(1.84, 1.08, 0.065)),
    new T.LineBasicMaterial({ color: 0xf8f8ef }),
  );
  frame.position.copy(board.position);
  group.add(frame);
  const square = new T.LineSegments(
    new T.EdgesGeometry(new T.PlaneGeometry(0.62, 0.46)),
    new T.LineBasicMaterial({ color: 0xffffff }),
  );
  square.position.set(0, 3.34, basket.backboardZ - sign * 0.033);
  if (sign > 0) square.rotation.y = Math.PI;
  group.add(square);
  const rim = new T.Mesh(
    new T.TorusGeometry(0.23, 0.027, 12, 56),
    new T.MeshStandardMaterial({ color: 0xf36c21, roughness: 0.3, metalness: 0.58 }),
  );
  rim.rotation.x = Math.PI / 2;
  rim.position.set(basket.x, basket.y, basket.z);
  rim.castShadow = true;
  group.add(rim);
  const nets = buildNet(T, group, basket);
  parent.add(group);
  return { group, rim, board, nets };
}

export function installFullCourtVisuals(engine, runtime) {
  if (!engine?.T || !engine.worldRoot || runtime?.kind !== "full") return null;
  if (engine.fullCourtVisuals) return engine.fullCourtVisuals;
  const T = engine.T;
  hideLegacyHoop(engine);
  hideLegacyArenaFull(engine);
  const root = new T.Group();
  root.name = "nova-full-court";
  const baskets = {
    home: buildBasket(T, root, runtime.baskets.home, "home"),
    away: buildBasket(T, root, runtime.baskets.away, "away"),
  };
  engine.worldRoot.add(root);
  engine.fullCourtVisuals = {
    root,
    baskets,
    pulse(teamId, amount = 1) {
      const basket = baskets[teamId];
      if (!basket) return;
      basket.group.userData.netPulse = Math.max(basket.group.userData.netPulse || 0, amount);
    },
    update(dt) {
      for (const basket of Object.values(baskets)) {
        const pulse = Math.max(0, (basket.group.userData.netPulse || 0) - dt * 2.45);
        basket.group.userData.netPulse = pulse;
        for (const line of basket.nets) {
          const attribute = line.geometry.attributes.position;
          const base = line.userData.basePositions;
          for (let index = 0; index < attribute.count; index += 1) {
            const row = (index % 5) / 4;
            const x = base[index * 3];
            const y = base[index * 3 + 1];
            const z = base[index * 3 + 2];
            const cx = runtime.baskets.home.x;
            const cz = Math.abs(z - runtime.baskets.home.z) < 1 ? runtime.baskets.home.z : runtime.baskets.away.z;
            attribute.setXYZ(
              index,
              cx + (x - cx) * (1 - pulse * row * 0.28),
              y - Math.sin(row * Math.PI) * pulse * 0.09,
              cz + (z - cz) * (1 - pulse * row * 0.28),
            );
          }
          attribute.needsUpdate = true;
        }
      }
    },
  };
  return engine.fullCourtVisuals;
}

