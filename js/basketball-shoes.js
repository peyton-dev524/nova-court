const DEFAULT_DETAIL = "high";

function colorShift(T, color, lightnessDelta) {
  const shifted = new T.Color(color);
  shifted.offsetHSL(0, 0, lightnessDelta);
  return shifted;
}

function mergeGeometries(T, geometries) {
  const position = [];
  const normal = [];
  const uv = [];
  for (const source of geometries) {
    const geometry = source.index ? source.toNonIndexed() : source;
    const positions = geometry.getAttribute("position");
    const normals = geometry.getAttribute("normal");
    const uvs = geometry.getAttribute("uv");
    for (let index = 0; index < positions.count; index += 1) {
      position.push(positions.getX(index), positions.getY(index), positions.getZ(index));
      normal.push(normals?.getX(index) ?? 0, normals?.getY(index) ?? 1, normals?.getZ(index) ?? 0);
      uv.push(uvs?.getX(index) ?? 0, uvs?.getY(index) ?? 0);
    }
  }
  const merged = new T.BufferGeometry();
  merged.setAttribute("position", new T.Float32BufferAttribute(position, 3));
  merged.setAttribute("normal", new T.Float32BufferAttribute(normal, 3));
  merged.setAttribute("uv", new T.Float32BufferAttribute(uv, 2));
  return merged;
}

function densifySections(sections, steps = 3) {
  const result = [];
  for (let index = 0; index < sections.length - 1; index += 1) {
    const from = sections[index];
    const to = sections[index + 1];
    for (let step = 0; step < steps; step += 1) {
      const linear = step / steps;
      const amount = linear * linear * (3 - 2 * linear);
      const sample = {};
      for (const key of new Set([...Object.keys(from), ...Object.keys(to)])) {
        const a = from[key];
        const b = to[key];
        sample[key] = typeof a === "number" && typeof b === "number"
          ? a + (b - a) * amount
          : (a ?? b);
      }
      result.push(sample);
    }
  }
  result.push({ ...sections.at(-1) });
  return result;
}

function createLoftGeometry(T, sections, ringSegments = 12) {
  const positions = [];
  const uvs = [];
  const indices = [];
  for (let sectionIndex = 0; sectionIndex < sections.length; sectionIndex += 1) {
    const section = sections[sectionIndex];
    for (let ringIndex = 0; ringIndex < ringSegments; ringIndex += 1) {
      const angle = (ringIndex / ringSegments) * Math.PI * 2;
      const side = Math.cos(angle);
      const vertical = Math.sin(angle);
      const lowerBias = vertical < 0 ? (section.lowerSquash ?? 1) : 1;
      const crown = vertical > 0 ? (section.crown ?? 1) : 1;
      positions.push(
        side * section.halfWidth,
        section.centerY + vertical * section.halfHeight * lowerBias * crown,
        section.z,
      );
      uvs.push(sectionIndex / (sections.length - 1), ringIndex / ringSegments);
    }
  }
  for (let sectionIndex = 0; sectionIndex < sections.length - 1; sectionIndex += 1) {
    for (let ringIndex = 0; ringIndex < ringSegments; ringIndex += 1) {
      const nextRing = (ringIndex + 1) % ringSegments;
      const a = sectionIndex * ringSegments + ringIndex;
      const b = sectionIndex * ringSegments + nextRing;
      const c = (sectionIndex + 1) * ringSegments + nextRing;
      const d = (sectionIndex + 1) * ringSegments + ringIndex;
      indices.push(a, b, d, b, c, d);
    }
  }
  const addCap = (sectionIndex, flip) => {
    const centerIndex = positions.length / 3;
    const section = sections[sectionIndex];
    positions.push(0, section.centerY, section.z);
    uvs.push(0.5, 0.5);
    for (let ringIndex = 0; ringIndex < ringSegments; ringIndex += 1) {
      const nextRing = (ringIndex + 1) % ringSegments;
      const a = sectionIndex * ringSegments + ringIndex;
      const b = sectionIndex * ringSegments + nextRing;
      indices.push(...(flip ? [centerIndex, b, a] : [centerIndex, a, b]));
    }
  };
  addCap(0, true);
  addCap(sections.length - 1, false);
  const geometry = new T.BufferGeometry();
  geometry.setAttribute("position", new T.Float32BufferAttribute(positions, 3));
  geometry.setAttribute("uv", new T.Float32BufferAttribute(uvs, 2));
  geometry.setIndex(indices);
  geometry.computeVertexNormals();
  return geometry;
}

function createSidePrismGeometry(T, profile, xCenter, thickness, outwardSign = 1) {
  const positions = [];
  const indices = [];
  const outerX = xCenter + thickness * 0.5 * outwardSign;
  const innerX = xCenter - thickness * 0.5 * outwardSign;
  for (const x of [outerX, innerX]) {
    for (const point of profile) positions.push(x, point.y, point.z);
  }
  const count = profile.length;
  const capTriangles = T.ShapeUtils.triangulateShape(
    profile.map((point) => new T.Vector2(point.z, point.y)),
    [],
  );
  for (const [a, b, c] of capTriangles) {
    indices.push(a, b, c);
    indices.push(count + c, count + b, count + a);
  }
  for (let index = 0; index < count; index += 1) {
    const next = (index + 1) % count;
    indices.push(index, next, count + index, next, count + next, count + index);
  }
  const geometry = new T.BufferGeometry();
  geometry.setAttribute("position", new T.Float32BufferAttribute(positions, 3));
  geometry.setIndex(indices);
  geometry.computeVertexNormals();
  return geometry;
}

function cylinderBetween(T, start, end, radius, radialSegments = 6) {
  const direction = end.clone().sub(start);
  const geometry = new T.CylinderGeometry(radius, radius, direction.length(), radialSegments, 1);
  geometry.translate(0, direction.length() * 0.5, 0);
  geometry.applyQuaternion(new T.Quaternion().setFromUnitVectors(
    new T.Vector3(0, 1, 0),
    direction.clone().normalize(),
  ));
  geometry.translate(start.x, start.y, start.z);
  return geometry;
}

function mesh(T, geometry, material, name) {
  const object = new T.Mesh(geometry, material);
  object.name = name;
  object.castShadow = true;
  object.receiveShadow = true;
  return object;
}

function triangleCount(root) {
  let triangles = 0;
  let drawCalls = 0;
  root.traverse((object) => {
    if (!object.isMesh) return;
    drawCalls += 1;
    const positionCount = object.geometry?.getAttribute("position")?.count ?? 0;
    triangles += object.geometry?.index?.count
      ? object.geometry.index.count / 3
      : positionCount / 3;
  });
  return { triangles: Math.round(triangles), drawCalls };
}

export function createNovaFlightShoe(T, {
  shellColor = 0xeefcff,
  accentColor = 0x67e9ff,
  detail = DEFAULT_DETAIL,
  side = 1,
} = {}) {
  const root = new T.Group();
  root.name = "nova-flight-shoe";

  const shell = new T.MeshPhysicalMaterial({
    color: shellColor,
    roughness: 0.38,
    metalness: 0.02,
    clearcoat: 0.28,
    clearcoatRoughness: 0.32,
  });
  const shellShade = new T.MeshPhysicalMaterial({
    color: colorShift(T, shellColor, -0.045),
    roughness: 0.44,
    metalness: 0.01,
    clearcoat: 0.14,
  });
  const foam = new T.MeshStandardMaterial({
    color: colorShift(T, shellColor, 0.1),
    roughness: 0.76,
    metalness: 0,
  });
  const rubber = new T.MeshStandardMaterial({
    color: 0x11151a,
    roughness: 0.88,
    metalness: 0.01,
  });
  const textile = new T.MeshStandardMaterial({
    color: 0x171b20,
    roughness: 0.94,
    metalness: 0,
  });
  const accent = new T.MeshPhysicalMaterial({
    color: accentColor,
    roughness: 0.2,
    metalness: 0.08,
    clearcoat: 0.62,
    clearcoatRoughness: 0.18,
  });

  const outsole = mesh(T, createLoftGeometry(T, densifySections([
    { z: -0.145, halfWidth: 0.102, centerY: 0.006, halfHeight: 0.019, lowerSquash: 0.55 },
    { z: -0.105, halfWidth: 0.112, centerY: 0, halfHeight: 0.0175, lowerSquash: 1 },
    { z: -0.02, halfWidth: 0.088, centerY: 0, halfHeight: 0.0175, lowerSquash: 1 },
    { z: 0.09, halfWidth: 0.096, centerY: 0, halfHeight: 0.0175, lowerSquash: 1 },
    { z: 0.205, halfWidth: 0.118, centerY: 0.004, halfHeight: 0.02, lowerSquash: 0.7 },
    { z: 0.265, halfWidth: 0.108, centerY: 0.014, halfHeight: 0.021, lowerSquash: 0.55 },
  ], 3), 14), rubber, "nova-flight-outsole");
  root.add(outsole);

  const midsole = mesh(T, createLoftGeometry(T, densifySections([
    { z: -0.135, halfWidth: 0.098, centerY: 0.031, halfHeight: 0.021 },
    { z: -0.075, halfWidth: 0.104, centerY: 0.029, halfHeight: 0.021 },
    { z: 0.02, halfWidth: 0.083, centerY: 0.028, halfHeight: 0.019 },
    { z: 0.13, halfWidth: 0.105, centerY: 0.031, halfHeight: 0.022 },
    { z: 0.23, halfWidth: 0.112, centerY: 0.039, halfHeight: 0.026 },
    { z: 0.265, halfWidth: 0.1, centerY: 0.047, halfHeight: 0.024 },
  ], 3), 14), foam, "nova-flight-midsole");
  root.add(midsole);

  const upper = mesh(T, createLoftGeometry(T, densifySections([
    { z: -0.145, halfWidth: 0.078, centerY: 0.082, halfHeight: 0.046, crown: 1.04 },
    { z: -0.108, halfWidth: 0.086, centerY: 0.09, halfHeight: 0.052, crown: 1.06 },
    { z: -0.055, halfWidth: 0.086, centerY: 0.094, halfHeight: 0.064, crown: 1.08 },
    { z: 0.02, halfWidth: 0.075, centerY: 0.087, halfHeight: 0.057, crown: 1.08 },
    { z: 0.095, halfWidth: 0.09, centerY: 0.078, halfHeight: 0.05, crown: 1.08 },
    { z: 0.18, halfWidth: 0.104, centerY: 0.073, halfHeight: 0.042, crown: 1.06 },
    { z: 0.245, halfWidth: 0.096, centerY: 0.074, halfHeight: 0.032, crown: 1.05 },
  ], 3), 18), shell, "nova-flight-upper");
  root.add(upper);

  const bootie = mesh(T, createLoftGeometry(T, densifySections([
    { z: -0.112, halfWidth: 0.061, centerY: 0.127, halfHeight: 0.046 },
    { z: -0.055, halfWidth: 0.064, centerY: 0.13, halfHeight: 0.05 },
    { z: 0.015, halfWidth: 0.053, centerY: 0.116, halfHeight: 0.038 },
    { z: 0.055, halfWidth: 0.046, centerY: 0.102, halfHeight: 0.025 },
  ], 2), 12), textile, "nova-flight-bootie");
  root.add(bootie);

  const tongue = mesh(T, new T.CapsuleGeometry(0.026, 0.105, 4, 8), textile, "nova-flight-tongue");
  tongue.position.set(0, 0.153, 0.03);
  tongue.rotation.x = Math.PI / 2 - 0.17;
  tongue.scale.x = 1.35;
  root.add(tongue);

  const laceBed = mesh(T, createLoftGeometry(T, densifySections([
    { z: -0.035, halfWidth: 0.057, centerY: 0.14, halfHeight: 0.014 },
    { z: 0.035, halfWidth: 0.064, centerY: 0.137, halfHeight: 0.014 },
    { z: 0.11, halfWidth: 0.071, centerY: 0.126, halfHeight: 0.012 },
  ], 2), 10), textile, "nova-flight-lace-bed");
  root.add(laceBed);

  const collarCurve = new T.CatmullRomCurve3([
    new T.Vector3(-0.058, 0.159, -0.035),
    new T.Vector3(-0.064, 0.164, -0.085),
    new T.Vector3(0, 0.157, -0.116),
    new T.Vector3(0.064, 0.164, -0.085),
    new T.Vector3(0.058, 0.159, -0.035),
  ], false, "centripetal");
  const collar = mesh(T, new T.TubeGeometry(collarCurve, 24, 0.0085, 6, false), textile, "nova-flight-collar");
  root.add(collar);

  const lateralX = 0.086 * side;
  const cageProfile = [
    { z: -0.142, y: 0.05 },
    { z: -0.13, y: 0.175 },
    { z: -0.085, y: 0.184 },
    { z: -0.028, y: 0.132 },
    { z: 0.075, y: 0.092 },
    { z: 0.142, y: 0.073 },
    { z: 0.055, y: 0.061 },
    { z: -0.09, y: 0.055 },
  ];
  const cage = mesh(
    T,
    createSidePrismGeometry(T, cageProfile, lateralX, 0.014, side),
    shellShade,
    "nova-flight-lateral-cage",
  );

  const heelProfile = [
    { z: -0.148, y: 0.022 },
    { z: -0.14, y: 0.058 },
    { z: -0.116, y: 0.076 },
    { z: -0.095, y: 0.058 },
    { z: -0.102, y: 0.03 },
  ];
  const heelCounter = mesh(
    T,
    mergeGeometries(T, [
      createSidePrismGeometry(T, heelProfile, 0.09, 0.018, 1),
      createSidePrismGeometry(T, heelProfile, -0.09, 0.018, -1),
    ]),
    rubber,
    "nova-flight-heel-counter",
  );

  const toeGuard = mesh(T, createLoftGeometry(T, [
    { z: 0.222, halfWidth: 0.11, centerY: 0.047, halfHeight: 0.014 },
    { z: 0.256, halfWidth: 0.101, centerY: 0.058, halfHeight: 0.016 },
    { z: 0.272, halfWidth: 0.087, centerY: 0.068, halfHeight: 0.014 },
  ], 12), rubber, "nova-flight-toe-guard");

  const laceGeometries = [];
  for (let index = 0; index < 5; index += 1) {
    const z = -0.012 + index * 0.027;
    const width = 0.052 + index * 0.005;
    const y = 0.15 - index * 0.003;
    laceGeometries.push(cylinderBetween(
      T,
      new T.Vector3(-width, y, z - 0.01),
      new T.Vector3(width, y + 0.004, z + 0.01),
      0.0028,
      6,
    ));
    laceGeometries.push(cylinderBetween(
      T,
      new T.Vector3(width, y, z - 0.01),
      new T.Vector3(-width, y + 0.004, z + 0.01),
      0.0028,
      6,
    ));
  }
  const laces = mesh(T, mergeGeometries(T, laceGeometries), textile, "nova-flight-laces");
  root.add(laces);

  const ribGeometries = [];
  for (const offset of [0, 0.028]) {
    const curve = new T.CatmullRomCurve3([
      new T.Vector3(lateralX + side * 0.01, 0.098 + offset * 0.2, 0.135 - offset),
      new T.Vector3(lateralX + side * 0.012, 0.125 + offset, 0.055 - offset),
      new T.Vector3(lateralX + side * 0.012, 0.168 + offset * 0.6, -0.045 - offset * 0.4),
    ]);
    ribGeometries.push(new T.TubeGeometry(curve, 9, 0.0022, 5, false));
  }
  const ribs = mesh(T, mergeGeometries(T, ribGeometries), shellShade, "nova-flight-cage-ribs");

  const slashProfile = [
    { z: 0.035, y: 0.107 },
    { z: 0.087, y: 0.126 },
    { z: 0.053, y: 0.099 },
    { z: 0.016, y: 0.09 },
  ];
  const slash = mesh(
    T,
    createSidePrismGeometry(T, slashProfile, lateralX + side * 0.012, 0.006, side),
    accent,
    "nova-flight-nova-slash",
  );
  root.add(slash);

  const microMeshes = [laces, ribs, slash];
  if (detail === "high") {
    const ventGeometries = [];
    const vents = [
      [-0.075, 0.11, 0.004],
      [-0.058, 0.118, 0.0045],
      [-0.083, 0.132, 0.0045],
      [-0.065, 0.143, 0.005],
      [-0.045, 0.138, 0.004],
      [-0.075, 0.158, 0.0035],
    ];
    for (const [z, y, radius] of vents) {
      const vent = new T.CylinderGeometry(radius, radius, 0.004, 7);
      vent.rotateZ(Math.PI / 2);
      vent.translate(lateralX + side * 0.009, y, z);
      ventGeometries.push(vent);
    }
    const ventMesh = mesh(T, mergeGeometries(T, ventGeometries), textile, "nova-flight-vents");
    root.add(ventMesh);
    microMeshes.push(ventMesh);

    const treadGeometries = [];
    const pods = [
      [-0.075, -0.102, 0.055, 0.035],
      [0.075, -0.102, 0.055, 0.035],
      [0, -0.025, 0.058, 0.03],
      [-0.07, 0.07, 0.052, 0.033],
      [0.07, 0.07, 0.052, 0.033],
      [-0.075, 0.17, 0.058, 0.037],
      [0.075, 0.17, 0.058, 0.037],
    ];
    for (const [x, z, width, depth] of pods) {
      const pod = new T.CylinderGeometry(depth * 0.44, depth * 0.44, 0.006, 8);
      pod.scale(width / Math.max(0.001, depth * 0.88), 1, 1.18);
      pod.translate(x, -0.015, z);
      treadGeometries.push(pod);
    }
    const tread = mesh(T, mergeGeometries(T, treadGeometries), rubber, "nova-flight-tread-pods");
    root.add(tread);
    microMeshes.push(tread);
  }

  root.userData.sculptRuntime = {
    id: "nova-flight-shoe",
    socket: "foot",
    inferredSurfaces: ["medial-shell", "outsole-tread"],
    detailTier: detail,
    nodes: {
      root,
      outsole,
      midsole,
      upper,
      bootie,
      tongue,
      laceBed,
      collar,
      cage,
      heelCounter,
      toeGuard,
      laces,
      ribs,
      slash,
    },
    colliders: [
      { type: "box", center: [0, 0.06, 0.06], size: [0.21, 0.14, 0.39] },
    ],
    destructionGroups: {
      sole: ["nova-flight-outsole", "nova-flight-midsole"],
      upper: ["nova-flight-upper", "nova-flight-lateral-cage"],
      bootie: ["nova-flight-bootie", "nova-flight-tongue", "nova-flight-collar"],
    },
  };
  const metrics = triangleCount(root);
  root.userData.metrics = Object.freeze({
    ...metrics,
    detailTier: detail,
    textures: 0,
  });
  return {
    root,
    outsole,
    detailMeshes: microMeshes,
    metrics: root.userData.metrics,
  };
}

export function novaFlightShoeMetrics(shoe) {
  return Object.freeze({ ...(shoe?.root?.userData?.metrics ?? shoe?.userData?.metrics ?? {}) });
}
