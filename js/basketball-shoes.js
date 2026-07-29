const DEFAULT_DETAIL = "high";
const TAU = Math.PI * 2;

export const BASKETBALL_SHOE_STYLE_IDS = Object.freeze([
  "nova-flight",
  "court-classic",
]);

export const BASKETBALL_SHOE_STYLES = Object.freeze([
  Object.freeze({
    id: "nova-flight",
    name: "NOVA Flight",
    description: "Molded low-top performance shell",
  }),
  Object.freeze({
    id: "court-classic",
    name: "NOVA Court Classic",
    description: "Canvas high-top with a curved rubber toe",
  }),
]);

export const COURT_CLASSIC_DIMENSIONS = Object.freeze({
  sourcedFootLengthMeters: 0.285,
  lengthMeters: 0.295,
  widthMeters: 0.108,
  heightMeters: 0.14,
  toleranceMeters: Object.freeze({
    length: 0.003,
    width: 0.0025,
    height: 0.0035,
  }),
  modelUnitsPerMeter: 1,
});

export function normalizeBasketballShoeStyle(value) {
  return BASKETBALL_SHOE_STYLE_IDS.includes(value) ? value : "nova-flight";
}

const clampUnit = (value) => Math.max(0, Math.min(1, Number(value) || 0));

export function courtClassicEllipsePoint(halfWidth, halfHeight, angle) {
  return Object.freeze({
    x: Math.cos(angle) * halfWidth,
    y: Math.sin(angle) * halfHeight,
  });
}

export function courtClassicToeCapRise(progress) {
  return Math.sin(clampUnit(progress) * Math.PI * 0.5);
}

export function courtClassicRockerHeight(normalizedLength) {
  const position = Math.max(-1, Math.min(1, Number(normalizedLength) || 0));
  if (position >= 0.52) {
    const progress = (position - 0.52) / 0.48;
    return 0.002 + (1 - Math.cos(progress * Math.PI * 0.5)) * 0.009;
  }
  if (position <= -0.78) {
    const progress = (-position - 0.78) / 0.22;
    return 0.002 + (1 - Math.cos(progress * Math.PI * 0.5)) * 0.0025;
  }
  return 0.002;
}

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

function createToeCapShellGeometry(T, sections, arcSegments = 12) {
  const positions = [];
  const uvs = [];
  const indices = [];
  const rowSize = arcSegments + 3;
  for (let sectionIndex = 0; sectionIndex < sections.length; sectionIndex += 1) {
    const section = sections[sectionIndex];
    positions.push(section.halfWidth, section.baseY, section.z);
    uvs.push(sectionIndex / (sections.length - 1), 0);
    for (let arcIndex = 0; arcIndex <= arcSegments; arcIndex += 1) {
      const angle = (arcIndex / arcSegments) * Math.PI;
      positions.push(
        Math.cos(angle) * section.halfWidth,
        section.baseY + section.sideWallHeight + Math.sin(angle) * section.archHeight,
        section.z + Math.sin(angle) * (section.centerZOffset ?? 0),
      );
      uvs.push(sectionIndex / (sections.length - 1), (arcIndex + 1) / (arcSegments + 2));
    }
    positions.push(-section.halfWidth, section.baseY, section.z);
    uvs.push(sectionIndex / (sections.length - 1), 1);
  }
  for (let sectionIndex = 0; sectionIndex < sections.length - 1; sectionIndex += 1) {
    for (let arcIndex = 0; arcIndex < rowSize - 1; arcIndex += 1) {
      const a = sectionIndex * rowSize + arcIndex;
      const b = a + 1;
      const d = (sectionIndex + 1) * rowSize + arcIndex;
      const c = d + 1;
      indices.push(a, b, d, b, c, d);
    }
  }
  const capEnd = (sectionIndex, flip) => {
    const centerIndex = positions.length / 3;
    const section = sections[sectionIndex];
    positions.push(0, section.baseY, section.z);
    uvs.push(0.5, 0);
    for (let arcIndex = 0; arcIndex < rowSize - 1; arcIndex += 1) {
      const a = sectionIndex * rowSize + arcIndex;
      const b = a + 1;
      indices.push(...(flip ? [centerIndex, a, b] : [centerIndex, b, a]));
    }
  };
  capEnd(0, true);
  capEnd(sections.length - 1, false);
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

function courtClassicSoleSections({ inset = 0, verticalOffset = 0, heightScale = 1 } = {}) {
  const halfLength = COURT_CLASSIC_DIMENSIONS.lengthMeters * 0.5;
  return [
    { z: -halfLength, halfWidth: 0.039 - inset, centerY: 0.006 + verticalOffset, halfHeight: 0.008 * heightScale },
    { z: -0.105, halfWidth: 0.049 - inset, centerY: 0.005 + verticalOffset, halfHeight: 0.007 * heightScale },
    { z: -0.035, halfWidth: 0.045 - inset, centerY: 0.005 + verticalOffset, halfHeight: 0.007 * heightScale },
    { z: 0.045, halfWidth: 0.05 - inset, centerY: 0.005 + verticalOffset, halfHeight: 0.007 * heightScale },
    { z: 0.095, halfWidth: 0.054 - inset, centerY: 0.006 + verticalOffset, halfHeight: 0.008 * heightScale },
    { z: 0.133, halfWidth: 0.047 - inset, centerY: 0.009 + verticalOffset, halfHeight: 0.009 * heightScale },
    { z: halfLength, halfWidth: 0.034 - inset, centerY: 0.013 + verticalOffset, halfHeight: 0.009 * heightScale },
  ];
}

function courtClassicUpperSections() {
  return [
    { z: -0.128, halfWidth: 0.041, centerY: 0.047, halfHeight: 0.028, crown: 1.04 },
    { z: -0.087, halfWidth: 0.044, centerY: 0.051, halfHeight: 0.032, crown: 1.06 },
    { z: -0.025, halfWidth: 0.043, centerY: 0.052, halfHeight: 0.031, crown: 1.08 },
    { z: 0.012, halfWidth: 0.045, centerY: 0.049, halfHeight: 0.024, crown: 1.04 },
    { z: 0.045, halfWidth: 0.043, centerY: 0.038, halfHeight: 0.01, crown: 1 },
    { z: 0.064, halfWidth: 0.04, centerY: 0.023, halfHeight: 0.003, crown: 1 },
  ];
}

function curveFromPoints(T, points, closed = false) {
  return new T.CatmullRomCurve3(
    points.map(([x, y, z]) => new T.Vector3(x, y, z)),
    closed,
    "centripetal",
  );
}

function curveTube(T, points, radius, tubularSegments = 14, radialSegments = 5, closed = false) {
  return new T.TubeGeometry(
    curveFromPoints(T, points, closed),
    tubularSegments,
    radius,
    radialSegments,
    closed,
  );
}

export function createNovaCourtClassicShoe(T, {
  shellColor = 0x224960,
  accentColor = 0x102d47,
  rubberColor = 0xe8e0c4,
  laceColor = 0xf0ead8,
  detail = DEFAULT_DETAIL,
  side = 1,
} = {}) {
  const root = new T.Group();
  root.name = "nova-court-classic-shoe";

  const canvas = new T.MeshStandardMaterial({
    color: shellColor,
    roughness: 0.88,
    metalness: 0,
  });
  const canvasShade = new T.MeshStandardMaterial({
    color: colorShift(T, shellColor, -0.045),
    roughness: 0.91,
    metalness: 0,
  });
  const rubber = new T.MeshStandardMaterial({
    color: rubberColor,
    roughness: 0.62,
    metalness: 0,
  });
  const outsoleMaterial = new T.MeshStandardMaterial({
    color: 0x15191b,
    roughness: 0.9,
    metalness: 0,
  });
  const treadMaterial = new T.MeshStandardMaterial({
    color: 0x343b3d,
    roughness: 0.86,
    metalness: 0,
  });
  const laceMaterial = new T.MeshStandardMaterial({
    color: laceColor,
    roughness: 0.94,
    metalness: 0,
  });
  const eyeletMaterial = new T.MeshPhysicalMaterial({
    color: 0x8f9ca1,
    roughness: 0.24,
    metalness: 0.88,
    clearcoat: 0.18,
  });
  const stripeMaterial = new T.MeshStandardMaterial({
    color: accentColor,
    roughness: 0.72,
    metalness: 0,
  });

  const outsole = mesh(
    T,
    createLoftGeometry(T, densifySections(courtClassicSoleSections(), 2), 10),
    outsoleMaterial,
    "court-classic-outsole",
  );
  root.add(outsole);

  const midsoleBand = mesh(
    T,
    createLoftGeometry(
      T,
      densifySections(courtClassicSoleSections({
        inset: 0.0015,
        verticalOffset: 0.015,
        heightScale: 1.08,
      }), 2),
      10,
    ),
    rubber,
    "court-classic-midsole-band",
  );
  root.add(midsoleBand);

  const upper = mesh(
    T,
    createLoftGeometry(T, densifySections(courtClassicUpperSections(), 2), 10),
    canvas,
    "court-classic-canvas-upper",
  );
  root.add(upper);

  const ankleQuarter = mesh(
    T,
    createLoftGeometry(T, densifySections([
      { z: -0.142, halfWidth: 0.026, centerY: 0.068, halfHeight: 0.036, crown: 0.9 },
      { z: -0.133, halfWidth: 0.036, centerY: 0.077, halfHeight: 0.048, crown: 0.96 },
      { z: -0.114, halfWidth: 0.043, centerY: 0.082, halfHeight: 0.054, crown: 1 },
      { z: -0.086, halfWidth: 0.044, centerY: 0.081, halfHeight: 0.053, crown: 1 },
      { z: -0.052, halfWidth: 0.041, centerY: 0.076, halfHeight: 0.046, crown: 1 },
      { z: -0.018, halfWidth: 0.034, centerY: 0.066, halfHeight: 0.035, crown: 1 },
    ], 2), 10),
    canvasShade,
    "court-classic-ankle-quarter",
  );
  root.add(ankleQuarter);

  const toeStart = 0.068;
  const toeEnd = COURT_CLASSIC_DIMENSIONS.lengthMeters * 0.5 + 0.002;
  const toeSections = [0, 0.1, 0.2, 0.32, 0.45, 0.58, 0.7, 0.8, 0.88, 0.94, 1].map((progress) => {
    const sineDome = Math.max(0, Math.sin(progress * Math.PI));
    const cosineTaper = Math.max(0, Math.cos(progress * Math.PI * 0.5));
    return {
      z: toeStart + (toeEnd - toeStart) * progress,
      halfWidth: 0.0505 * cosineTaper ** 0.65,
      baseY: 0.025 + progress ** 2 * 0.008,
      sideWallHeight: 0.023 * sineDome ** 0.8 * (1 - progress * 0.12),
      archHeight: 0.008 * sineDome ** 0.7,
      centerZOffset: -0.006 * (1 - progress) ** 4,
    };
  });
  const toeCap = mesh(
    T,
    createToeCapShellGeometry(T, toeSections, 9),
    rubber,
    "court-classic-toe-cap",
  );
  root.add(toeCap);

  const tongue = mesh(
    T,
    createSidePrismGeometry(T, [
      { z: -0.09, y: 0.136 },
      { z: -0.065, y: 0.135 },
      { z: 0.039, y: 0.082 },
      { z: 0.049, y: 0.074 },
      { z: 0.033, y: 0.069 },
      { z: -0.086, y: 0.121 },
    ], 0, 0.058, 1),
    canvasShade,
    "court-classic-tongue",
  );
  root.add(tongue);

  const quarterPanelProfile = [
    { z: -0.139, y: 0.032 },
    { z: -0.144, y: 0.068 },
    { z: -0.138, y: 0.105 },
    { z: -0.121, y: 0.129 },
    { z: -0.093, y: 0.135 },
    { z: -0.064, y: 0.127 },
    { z: -0.029, y: 0.108 },
    { z: 0.021, y: 0.083 },
    { z: 0.03, y: 0.064 },
    { z: 0.038, y: 0.055 },
    { z: 0.015, y: 0.042 },
    { z: -0.058, y: 0.035 },
    { z: -0.116, y: 0.031 },
  ];
  const quarterPanels = mesh(
    T,
    mergeGeometries(T, [
      createSidePrismGeometry(T, quarterPanelProfile, 0.043, 0.003, 1),
      createSidePrismGeometry(T, quarterPanelProfile, -0.043, 0.003, -1),
    ]),
    canvas,
    "court-classic-quarter-panels",
  );
  root.add(quarterPanels);

  const heelProfile = [
    { z: -0.143, y: 0.025 },
    { z: -0.145, y: 0.067 },
    { z: -0.139, y: 0.108 },
    { z: -0.126, y: 0.132 },
    { z: -0.111, y: 0.136 },
    { z: -0.104, y: 0.112 },
    { z: -0.105, y: 0.067 },
    { z: -0.111, y: 0.029 },
  ];
  const heelReinforcement = mesh(
    T,
    mergeGeometries(T, [
      createSidePrismGeometry(T, heelProfile, 0.0415, 0.0035, 1),
      createSidePrismGeometry(T, heelProfile, -0.0415, 0.0035, -1),
    ]),
    canvasShade,
    "court-classic-heel-reinforcement",
  );
  root.add(heelReinforcement);

  const collarPoints = [];
  for (let index = 0; index < 24; index += 1) {
    const angle = (index / 24) * TAU;
    const point = courtClassicEllipsePoint(0.04, 0.033, angle);
    const frontDip = Math.max(0, Math.sin(angle)) * 0.0105;
    const sideRise = Math.cos(angle) ** 2 * 0.0065;
    collarPoints.push([point.x, 0.1275 + sideRise - frontDip, -0.088 + point.y]);
  }
  const collarOpening = mesh(
    T,
    new T.CylinderGeometry(1, 1, 0.0035, 18),
    outsoleMaterial,
    "court-classic-collar-opening",
  );
  collarOpening.position.set(0, 0.1255, -0.09);
  collarOpening.scale.set(0.034, 1, 0.025);
  root.add(collarOpening);
  const collarInsetProfile = [
    { z: -0.123, y: 0.119 },
    { z: -0.112, y: 0.13 },
    { z: -0.091, y: 0.134 },
    { z: -0.071, y: 0.128 },
    { z: -0.057, y: 0.115 },
    { z: -0.071, y: 0.119 },
    { z: -0.091, y: 0.124 },
    { z: -0.111, y: 0.117 },
  ];
  const collarInset = mesh(
    T,
    mergeGeometries(T, [
      createSidePrismGeometry(T, collarInsetProfile, 0.044, 0.0028, 1),
      createSidePrismGeometry(T, collarInsetProfile, -0.044, 0.0028, -1),
    ]),
    outsoleMaterial,
    "court-classic-curved-collar-inset",
  );
  root.add(collarInset);
  const collarBinding = mesh(
    T,
    curveTube(T, collarPoints, 0.003, 20, 4, true),
    laceMaterial,
    "court-classic-collar-binding",
  );
  root.add(collarBinding);

  const eyeletGeometries = [];
  const laceGeometries = [];
  const eyeletStations = [];
  for (let index = 0; index < 7; index += 1) {
    const progress = index / 6;
    const z = -0.07 + progress * 0.105;
    const y = 0.124 - progress * 0.052 + Math.sin(progress * Math.PI) * 0.003;
    const width = 0.037 + progress * 0.004;
    eyeletStations.push({ z, y, width });
    for (const xSign of [-1, 1]) {
      const eyelet = new T.TorusGeometry(0.0042, 0.0014, 3, 5);
      eyelet.rotateY(Math.PI * 0.5);
      eyelet.translate(xSign * width, y, z);
      eyeletGeometries.push(eyelet);
    }
  }
  for (let index = 0; index < eyeletStations.length - 1; index += 1) {
    const from = eyeletStations[index];
    const to = eyeletStations[index + 1];
    laceGeometries.push(cylinderBetween(
      T,
      new T.Vector3(-from.width, from.y + 0.001, from.z),
      new T.Vector3(to.width, to.y + 0.003, to.z),
      0.00175,
      5,
    ));
    laceGeometries.push(cylinderBetween(
      T,
      new T.Vector3(from.width, from.y + 0.001, from.z),
      new T.Vector3(-to.width, to.y + 0.003, to.z),
      0.00175,
      5,
    ));
  }
  const topStation = eyeletStations[0];
  laceGeometries.push(cylinderBetween(
    T,
    new T.Vector3(-topStation.width, topStation.y + 0.002, topStation.z),
    new T.Vector3(topStation.width, topStation.y + 0.002, topStation.z),
    0.00175,
    5,
  ));
  const eyelets = mesh(
    T,
    mergeGeometries(T, eyeletGeometries),
    eyeletMaterial,
    "court-classic-eyelets-seven-pairs",
  );
  const laces = mesh(
    T,
    mergeGeometries(T, laceGeometries),
    laceMaterial,
    "court-classic-crossed-laces",
  );
  root.add(eyelets, laces);

  const sideStripeGeometries = [];
  const stitchGeometries = [];
  for (const xSign of [-1, 1]) {
    sideStripeGeometries.push(curveTube(T, [
      [xSign * 0.0505, 0.021, -0.132],
      [xSign * 0.0515, 0.021, -0.02],
      [xSign * 0.0525, 0.023, 0.092],
      [xSign * 0.043, 0.029, 0.137],
    ], 0.00125, 16, 4));
    const seamX = xSign * 0.045;
    stitchGeometries.push(curveTube(T, [
      [seamX, 0.13, -0.112],
      [seamX, 0.112, -0.052],
      [seamX, 0.082, 0.016],
      [seamX, 0.062, 0.038],
    ], 0.00065, 12, 3));
    stitchGeometries.push(curveTube(T, [
      [seamX, 0.126, -0.11],
      [seamX, 0.108, -0.05],
      [seamX, 0.078, 0.018],
      [seamX, 0.058, 0.04],
    ], 0.00055, 12, 3));
  }
  const sidewallStripe = mesh(
    T,
    mergeGeometries(T, sideStripeGeometries),
    stripeMaterial,
    "court-classic-sidewall-stripe",
  );
  const stitching = mesh(
    T,
    mergeGeometries(T, stitchGeometries),
    laceMaterial,
    "court-classic-double-stitching",
  );
  root.add(sidewallStripe, stitching);

  const detailMeshes = [eyelets, laces, stitching, sidewallStripe];
  let tread = null;
  if (detail === "high") {
    const treadGeometries = [];
    for (const z of [-0.118, -0.068, 0.068, 0.118]) {
      for (const x of [-0.032, 0, 0.032]) {
        const treadBar = new T.BoxGeometry(0.027, 0.004, 0.007);
        treadBar.rotateY((Math.round((z + 0.2) * 100) + Math.round(x * 1000)) % 2 ? 0.55 : -0.55);
        treadBar.translate(x, -0.003, z);
        treadGeometries.push(treadBar);
      }
    }
    tread = mesh(
      T,
      mergeGeometries(T, treadGeometries),
      treadMaterial,
      "court-classic-chevron-tread",
    );
    root.add(tread);
    detailMeshes.push(tread);
  }

  const nodes = {
    root,
    outsole,
    midsoleBand,
    upper,
    ankleQuarter,
    toeCap,
    tongue,
    quarterPanels,
    heelReinforcement,
    collarBinding,
    collarOpening,
    collarInset,
    eyelets,
    laces,
    sidewallStripe,
    stitching,
    tread,
  };
  for (const object of Object.values(nodes)) {
    if (!object) continue;
    object.userData.sculptPart = object.name;
  }

  root.userData.sculptRuntime = {
    id: "nova-court-classic-shoe",
    styleId: "court-classic",
    socket: "foot",
    dimensionsMeters: COURT_CLASSIC_DIMENSIONS,
    inferredSurfaces: [
      "medial-panel-construction",
      "inner-padding",
      "outer-width",
      "outsole-tread-spacing",
    ],
    sourceEvidence: {
      footLengthMeters: COURT_CLASSIC_DIMENSIONS.sourcedFootLengthMeters,
      source: "official-size-guide",
      inferredOuterDimensions: true,
    },
    profileMath: {
      ellipticalRings: "x=cos(theta)*halfWidth; y=sin(theta)*halfHeight",
      toeCap: "sin(progress*pi/2)",
      rocker: "1-cos(progress*pi/2)",
    },
    detailTier: detail,
    nodes,
    colliders: [
      { type: "box", center: [0, 0.069, 0], size: [0.108, 0.14, 0.295] },
    ],
    destructionGroups: {
      sole: ["court-classic-outsole", "court-classic-midsole-band"],
      upper: ["court-classic-canvas-upper", "court-classic-ankle-quarter"],
      closure: ["court-classic-eyelets-seven-pairs", "court-classic-crossed-laces"],
    },
  };
  const metrics = triangleCount(root);
  root.userData.metrics = Object.freeze({
    ...metrics,
    detailTier: detail,
    materials: 8,
    textures: 0,
  });
  return {
    root,
    outsole,
    detailMeshes,
    metrics: root.userData.metrics,
  };
}

export function createBasketballShoe(T, options = {}) {
  const styleId = normalizeBasketballShoeStyle(options.styleId ?? options.shoeStyleId ?? options.style);
  if (styleId === "court-classic") {
    return createNovaCourtClassicShoe(T, options);
  }
  return createNovaFlightShoe(T, options);
}

export function basketballShoeMetrics(shoe) {
  return Object.freeze({ ...(shoe?.root?.userData?.metrics ?? shoe?.userData?.metrics ?? {}) });
}
