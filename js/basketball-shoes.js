const DEFAULT_DETAIL = "high";
const TAU = Math.PI * 2;

export const BASKETBALL_SHOE_STYLE_IDS = Object.freeze([
  "nova-flight",
  "court-classic",
  "precision-7",
  "cut-academy",
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
  Object.freeze({
    id: "precision-7",
    name: "Precision 7 Study",
    description: "Stylized low-top mesh court shoe with a sculpted foam sole",
  }),
  Object.freeze({
    id: "cut-academy",
    name: "NOVA Cut Academy",
    description: "Stylized low-top speed shoe with dual foam and directional traction",
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

export const PRECISION_7_DIMENSIONS = Object.freeze({
  sourcedFootLengthMeters: 0.283,
  lengthMeters: 0.298,
  widthMeters: 0.108,
  heightMeters: 0.104,
  toleranceMeters: Object.freeze({
    length: 0.003,
    width: 0.0025,
    height: 0.003,
  }),
  modelUnitsPerMeter: 1,
});

export const CUT_ACADEMY_DIMENSIONS = Object.freeze({
  sourcedFootLengthMeters: 0.271,
  lengthMeters: 0.297,
  widthMeters: 0.109,
  heightMeters: 0.105,
  toleranceMeters: Object.freeze({
    length: 0.003,
    width: 0.0025,
    height: 0.003,
  }),
  modelUnitsPerMeter: 1,
});

export const BASKETBALL_SHOE_COLORWAYS = Object.freeze([
  Object.freeze({
    id: "summit-silver",
    name: "Summit Silver",
    upper: 0xf1f0ec,
    upperShade: 0xd6d6d2,
    midsole: 0xf4f2ec,
    outsole: 0x303236,
    mark: 0xa7a9ac,
    lace: 0xf7f6f1,
    lining: 0x55585e,
  }),
  Object.freeze({
    id: "photon-navy",
    name: "Photon Navy",
    upper: 0xe4e5e1,
    upperShade: 0xc8cbd0,
    midsole: 0xf5f4ef,
    outsole: 0x17233d,
    mark: 0x203968,
    lace: 0xf8f8f2,
    lining: 0x1d2944,
  }),
  Object.freeze({
    id: "black-volt",
    name: "Black Volt",
    upper: 0x17191d,
    upperShade: 0x2b2f34,
    midsole: 0x454b50,
    outsole: 0x0d0f12,
    mark: 0xb8f23a,
    lace: 0xdde3d7,
    lining: 0x090a0c,
  }),
  Object.freeze({
    id: "glacier-silver",
    name: "Glacier Silver",
    upper: 0x84dfe2,
    upperShade: 0x4fb8c3,
    midsole: 0xf7f7f5,
    outsole: 0xd7dcde,
    mark: 0x8f989f,
    lace: 0xf4ffff,
    lining: 0x438d96,
  }),
  Object.freeze({
    id: "ember-ice",
    name: "Ember Ice",
    upper: 0xf16a45,
    upperShade: 0xc9412f,
    midsole: 0xf4f7f7,
    outsole: 0x202a32,
    mark: 0x91e4f5,
    lace: 0xffeee6,
    lining: 0x52261f,
  }),
]);

export const PRECISION_7_COLORWAYS = BASKETBALL_SHOE_COLORWAYS;
export const CUT_ACADEMY_COLORWAYS = BASKETBALL_SHOE_COLORWAYS;

export function normalizeBasketballShoeColorway(value) {
  return BASKETBALL_SHOE_COLORWAYS.some((colorway) => colorway.id === value)
    ? value
    : BASKETBALL_SHOE_COLORWAYS[0].id;
}

export function basketballShoeColorway(value) {
  const id = normalizeBasketballShoeColorway(value);
  return BASKETBALL_SHOE_COLORWAYS.find((colorway) => colorway.id === id);
}

export function normalizePrecision7Colorway(value) {
  return normalizeBasketballShoeColorway(value);
}

export function precision7Colorway(value) {
  return basketballShoeColorway(value);
}

export const normalizeCutAcademyColorway = normalizeBasketballShoeColorway;
export const cutAcademyColorway = basketballShoeColorway;

export function precision7EllipsePoint(halfWidth, halfHeight, angle) {
  return Object.freeze({
    x: Math.cos(angle) * halfWidth,
    y: Math.sin(angle) * halfHeight,
  });
}

export function precision7RockerHeight(normalizedLength) {
  const z = Math.max(-1, Math.min(1, Number(normalizedLength) || 0));
  if (z > 0.48) {
    const progress = (z - 0.48) / 0.52;
    return 0.002 + (1 - Math.cos(progress * Math.PI * 0.5)) * 0.01;
  }
  if (z < -0.82) {
    const progress = (-z - 0.82) / 0.18;
    return 0.002 + (1 - Math.cos(progress * Math.PI * 0.5)) * 0.002;
  }
  return 0.002;
}

export function precision7HalfWidth(normalizedLength) {
  const z = Math.max(-1, Math.min(1, Number(normalizedLength) || 0));
  const heel = Math.exp(-(((z + 0.83) / 0.29) ** 2)) * 0.0405;
  const waist = Math.exp(-(((z + 0.15) / 0.34) ** 2)) * 0.031;
  const forefoot = Math.exp(-(((z - 0.53) / 0.43) ** 2)) * 0.054;
  const toeTaper = 1 - Math.max(0, (z - 0.7) / 0.3) ** 1.6 * 0.42;
  return Math.max(heel, waist, forefoot) * toeTaper;
}

export function cutAcademyEllipsePoint(halfWidth, halfHeight, angle) {
  return Object.freeze({
    x: Math.cos(angle) * halfWidth,
    y: Math.sin(angle) * halfHeight,
  });
}

export function cutAcademyRockerHeight(normalizedLength) {
  const z = Math.max(-1, Math.min(1, Number(normalizedLength) || 0));
  const toeProgress = Math.max(0, (z - 0.5) / 0.5);
  const heelProgress = Math.max(0, (-z - 0.78) / 0.22);
  return 0.002
    + (1 - Math.cos(toeProgress * Math.PI * 0.5)) * 0.011
    + (1 - Math.cos(heelProgress * Math.PI * 0.5)) * 0.0022;
}

export function cutAcademyHalfWidth(normalizedLength) {
  const z = Math.max(-1, Math.min(1, Number(normalizedLength) || 0));
  const heel = Math.exp(-(((z + 0.8) / 0.31) ** 2)) * 0.042;
  const waist = Math.exp(-(((z + 0.08) / 0.35) ** 2)) * 0.0315;
  const forefoot = Math.exp(-(((z - 0.5) / 0.42) ** 2)) * 0.0545;
  const toeTaper = 1 - Math.max(0, (z - 0.7) / 0.3) ** 1.55 * 0.45;
  return Math.max(heel, waist, forefoot) * toeTaper;
}

export function normalizeBasketballShoeStyle(value) {
  return BASKETBALL_SHOE_STYLE_IDS.includes(value) ? value : "nova-flight";
}

const BASKETBALL_SHOE_LOWER_LEG_FITS = Object.freeze({
  "nova-flight": Object.freeze({
    shin: Object.freeze({ length: 0.315, centerY: -0.235 }),
    sock: Object.freeze({
      radiusTop: 0.091,
      radiusBottom: 0.083,
      height: 0.18,
      centerY: -0.425,
    }),
    shoe: Object.freeze({
      position: Object.freeze([0, -0.603, 0.08]),
      rotationX: -0.025,
    }),
    collarJoinY: -0.515,
    collarInnerRadius: 0.083,
  }),
  "court-classic": Object.freeze({
    // The high-top receives the ankle instead of being covered by it. The
    // narrow sock end sits 4 mm inside the collar while the skin shin stops
    // above the collar and remains hidden beneath the visible crew sock.
    shin: Object.freeze({ length: 0.28, centerY: -0.218 }),
    sock: Object.freeze({
      radiusTop: 0.082,
      radiusBottom: 0.0315,
      height: 0.166,
      centerY: -0.39,
    }),
    shoe: Object.freeze({
      position: Object.freeze([0, -0.603, 0.08]),
      rotationX: -0.025,
    }),
    collarJoinY: -0.469,
    collarInnerRadius: 0.034,
  }),
  "precision-7": Object.freeze({
    shin: Object.freeze({ length: 0.28, centerY: -0.218 }),
    sock: Object.freeze({
      radiusTop: 0.079,
      radiusBottom: 0.05,
      height: 0.17,
      centerY: -0.397,
    }),
    shoe: Object.freeze({
      position: Object.freeze([0, -0.603, 0.08]),
      rotationX: -0.025,
    }),
    collarJoinY: -0.506,
    collarInnerRadius: 0.052,
  }),
  "cut-academy": Object.freeze({
    shin: Object.freeze({ length: 0.28, centerY: -0.218 }),
    sock: Object.freeze({
      radiusTop: 0.079,
      radiusBottom: 0.05,
      height: 0.17,
      centerY: -0.397,
    }),
    shoe: Object.freeze({
      position: Object.freeze([0, -0.603, 0.08]),
      rotationX: -0.025,
    }),
    collarJoinY: -0.507,
    collarInnerRadius: 0.052,
  }),
});

export function basketballShoeLowerLegFit(styleId) {
  return BASKETBALL_SHOE_LOWER_LEG_FITS[normalizeBasketballShoeStyle(styleId)];
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
  colorwayId = null,
  detail = DEFAULT_DETAIL,
  side = 1,
} = {}) {
  const root = new T.Group();
  root.name = "nova-flight-shoe";
  const colorway = colorwayId === null ? null : basketballShoeColorway(colorwayId);
  const resolvedShell = colorway?.upper ?? shellColor;
  const resolvedAccent = colorway?.mark ?? accentColor;
  const resolvedMidsole = colorway?.midsole ?? colorShift(T, resolvedShell, 0.1);
  const resolvedOutsole = colorway?.outsole ?? 0x11151a;
  const resolvedLining = colorway?.lining ?? 0x171b20;

  const shell = new T.MeshPhysicalMaterial({
    color: resolvedShell,
    roughness: 0.38,
    metalness: 0.02,
    clearcoat: 0.28,
    clearcoatRoughness: 0.32,
  });
  const shellShade = new T.MeshPhysicalMaterial({
    color: colorway?.upperShade ?? colorShift(T, resolvedShell, -0.045),
    roughness: 0.44,
    metalness: 0.01,
    clearcoat: 0.14,
  });
  const foam = new T.MeshStandardMaterial({
    color: resolvedMidsole,
    roughness: 0.76,
    metalness: 0,
  });
  const rubber = new T.MeshStandardMaterial({
    color: resolvedOutsole,
    roughness: 0.88,
    metalness: 0.01,
  });
  const textile = new T.MeshStandardMaterial({
    color: resolvedLining,
    roughness: 0.94,
    metalness: 0,
  });
  const accent = new T.MeshPhysicalMaterial({
    color: resolvedAccent,
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
    styleId: "nova-flight",
    colorwayId: colorway?.id ?? "legacy-flight",
    colorwayName: colorway?.name ?? "Legacy Flight",
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
  colorwayId = null,
  detail = DEFAULT_DETAIL,
  side = 1,
} = {}) {
  const root = new T.Group();
  root.name = "nova-court-classic-shoe";
  const colorway = colorwayId === null ? null : basketballShoeColorway(colorwayId);
  const resolvedShell = colorway?.upper ?? shellColor;
  const resolvedAccent = colorway?.mark ?? accentColor;
  const resolvedRubber = colorway?.midsole ?? rubberColor;
  const resolvedLace = colorway?.lace ?? laceColor;
  const resolvedOutsole = colorway?.outsole ?? 0x15191b;

  const canvas = new T.MeshStandardMaterial({
    color: resolvedShell,
    roughness: 0.88,
    metalness: 0,
  });
  const canvasShade = new T.MeshStandardMaterial({
    color: colorway?.upperShade ?? colorShift(T, resolvedShell, -0.045),
    roughness: 0.91,
    metalness: 0,
  });
  const rubber = new T.MeshStandardMaterial({
    color: resolvedRubber,
    roughness: 0.62,
    metalness: 0,
  });
  const outsoleMaterial = new T.MeshStandardMaterial({
    color: resolvedOutsole,
    roughness: 0.9,
    metalness: 0,
  });
  const treadMaterial = new T.MeshStandardMaterial({
    color: 0x343b3d,
    roughness: 0.86,
    metalness: 0,
  });
  const laceMaterial = new T.MeshStandardMaterial({
    color: resolvedLace,
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
    color: resolvedAccent,
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
    colorwayId: colorway?.id ?? "legacy-classic",
    colorwayName: colorway?.name ?? "Legacy Classic",
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

function precision7SoleSections({ inset = 0, verticalOffset = 0, height = 0.007 } = {}) {
  const halfLength = PRECISION_7_DIMENSIONS.lengthMeters * 0.5;
  return [-1, -0.82, -0.58, -0.28, 0.05, 0.34, 0.58, 0.78, 1].map((normalized) => ({
    z: normalized * halfLength,
    halfWidth: Math.max(0.018, precision7HalfWidth(normalized) - inset),
    centerY: precision7RockerHeight(normalized) + verticalOffset,
    halfHeight: height * (0.9 + Math.cos(normalized * Math.PI * 0.5) * 0.1),
    lowerSquash: normalized > 0.55 ? 0.78 : 0.92,
  }));
}

function precision7UpperSections() {
  const halfLength = PRECISION_7_DIMENSIONS.lengthMeters * 0.5;
  return [
    { z: -halfLength + 0.013, halfWidth: 0.034, centerY: 0.047, halfHeight: 0.026, crown: 1.08 },
    { z: -0.105, halfWidth: 0.041, centerY: 0.058, halfHeight: 0.035, crown: 1.1 },
    { z: -0.055, halfWidth: 0.044, centerY: 0.058, halfHeight: 0.034, crown: 1.08 },
    { z: 0.005, halfWidth: 0.039, centerY: 0.052, halfHeight: 0.029, crown: 1.08 },
    { z: 0.058, halfWidth: 0.048, centerY: 0.044, halfHeight: 0.024, crown: 1.1 },
    { z: 0.105, halfWidth: 0.047, centerY: 0.038, halfHeight: 0.019, crown: 1.08 },
    { z: halfLength - 0.007, halfWidth: 0.022, centerY: 0.036, halfHeight: 0.009, crown: 1.02 },
  ];
}

export function createPrecision7Shoe(T, {
  colorwayId = "summit-silver",
  detail = DEFAULT_DETAIL,
  side = 1,
} = {}) {
  const root = new T.Group();
  root.name = "precision-7-shoe";
  const colorway = precision7Colorway(colorwayId);

  const upperMaterial = new T.MeshPhysicalMaterial({
    color: colorway.upper,
    roughness: 0.72,
    metalness: 0,
    clearcoat: 0.04,
    clearcoatRoughness: 0.82,
  });
  const overlayMaterial = new T.MeshPhysicalMaterial({
    color: colorway.upperShade,
    roughness: 0.52,
    metalness: 0,
    clearcoat: 0.16,
    clearcoatRoughness: 0.52,
  });
  const foamMaterial = new T.MeshStandardMaterial({
    color: colorway.midsole,
    roughness: 0.68,
    metalness: 0,
  });
  const rubberMaterial = new T.MeshStandardMaterial({
    color: colorway.outsole,
    roughness: 0.9,
    metalness: 0,
  });
  const tractionMaterial = new T.MeshStandardMaterial({
    color: colorShift(T, colorway.outsole, 0.18),
    roughness: 0.94,
    metalness: 0,
  });
  const markMaterial = new T.MeshPhysicalMaterial({
    color: colorway.mark,
    roughness: 0.28,
    metalness: 0.22,
    clearcoat: 0.42,
    clearcoatRoughness: 0.24,
  });
  const laceMaterial = new T.MeshStandardMaterial({
    color: colorway.lace,
    roughness: 0.92,
    metalness: 0,
  });
  const liningMaterial = new T.MeshStandardMaterial({
    color: colorway.lining,
    roughness: 0.96,
    metalness: 0,
  });

  const outsole = mesh(
    T,
    createLoftGeometry(T, densifySections(precision7SoleSections(), 3), 16),
    rubberMaterial,
    "precision-7-outsole",
  );
  root.add(outsole);

  const midsole = mesh(
    T,
    createLoftGeometry(T, densifySections(precision7SoleSections({
      inset: 0.0014,
      verticalOffset: 0.017,
      height: 0.011,
    }), 3), 16),
    foamMaterial,
    "precision-7-sculpted-midsole",
  );
  root.add(midsole);

  const upper = mesh(
    T,
    createLoftGeometry(T, densifySections(precision7UpperSections(), 3), 18),
    upperMaterial,
    "precision-7-breathable-upper",
  );
  root.add(upper);

  const heelQuarter = mesh(
    T,
    createLoftGeometry(T, densifySections([
      { z: -0.145, halfWidth: 0.026, centerY: 0.054, halfHeight: 0.025, crown: 1.04 },
      { z: -0.125, halfWidth: 0.041, centerY: 0.064, halfHeight: 0.033, crown: 1.08 },
      { z: -0.09, halfWidth: 0.044, centerY: 0.064, halfHeight: 0.034, crown: 1.08 },
      { z: -0.055, halfWidth: 0.041, centerY: 0.061, halfHeight: 0.031, crown: 1.06 },
      { z: -0.025, halfWidth: 0.032, centerY: 0.055, halfHeight: 0.023, crown: 1.04 },
    ], 2), 14),
    overlayMaterial,
    "precision-7-padded-heel-quarter",
  );
  root.add(heelQuarter);

  const tongue = mesh(
    T,
    createSidePrismGeometry(T, [
      { z: -0.084, y: 0.096 },
      { z: -0.052, y: 0.098 },
      { z: 0.075, y: 0.072 },
      { z: 0.096, y: 0.06 },
      { z: 0.079, y: 0.052 },
      { z: -0.079, y: 0.083 },
    ], 0, 0.052, 1),
    liningMaterial,
    "precision-7-plush-tongue",
  );
  root.add(tongue);

  const collarPoints = [];
  for (let index = 0; index < 30; index += 1) {
    const angle = index / 30 * TAU;
    const point = precision7EllipsePoint(0.044, 0.031, angle);
    const frontDip = Math.max(0, Math.sin(angle)) * 0.014;
    const rearRise = Math.max(0, -Math.sin(angle)) * 0.006;
    collarPoints.push([point.x, 0.087 + rearRise - frontDip, -0.087 + point.y]);
  }
  const collar = mesh(
    T,
    curveTube(T, collarPoints, 0.0042, 28, 6, true),
    liningMaterial,
    "precision-7-low-collar",
  );
  root.add(collar);

  const eyestayProfile = [
    { z: -0.074, y: 0.091 },
    { z: -0.045, y: 0.094 },
    { z: 0.09, y: 0.067 },
    { z: 0.104, y: 0.057 },
    { z: 0.089, y: 0.052 },
    { z: -0.056, y: 0.081 },
  ];
  const eyestays = mesh(
    T,
    mergeGeometries(T, [
      createSidePrismGeometry(T, eyestayProfile, 0.032, 0.005, 1),
      createSidePrismGeometry(T, eyestayProfile, -0.032, 0.005, -1),
    ]),
    overlayMaterial,
    "precision-7-no-sew-eyestays",
  );
  root.add(eyestays);

  const laceGeometries = [];
  const laceStations = [];
  for (let index = 0; index < 6; index += 1) {
    const progress = index / 5;
    laceStations.push({
      z: -0.052 + progress * 0.129,
      y: 0.091 - progress * 0.025 + Math.sin(progress * Math.PI) * 0.0025,
      width: 0.028 + progress * 0.005,
    });
  }
  for (let index = 0; index < laceStations.length - 1; index += 1) {
    const from = laceStations[index];
    const to = laceStations[index + 1];
    laceGeometries.push(
      cylinderBetween(T, new T.Vector3(-from.width, from.y, from.z), new T.Vector3(to.width, to.y + 0.0015, to.z), 0.0015, 5),
      cylinderBetween(T, new T.Vector3(from.width, from.y, from.z), new T.Vector3(-to.width, to.y + 0.0015, to.z), 0.0015, 5),
    );
  }
  const laces = mesh(
    T,
    mergeGeometries(T, laceGeometries),
    laceMaterial,
    "precision-7-six-station-laces",
  );
  root.add(laces);

  const lateralX = side * 0.048;
  const sideOverlay = mesh(
    T,
    createSidePrismGeometry(T, [
      { z: -0.112, y: 0.036 },
      { z: -0.105, y: 0.074 },
      { z: -0.058, y: 0.084 },
      { z: 0.016, y: 0.069 },
      { z: 0.092, y: 0.045 },
      { z: 0.072, y: 0.033 },
      { z: -0.02, y: 0.04 },
    ], lateralX, 0.004, side),
    overlayMaterial,
    "precision-7-lateral-overlay",
  );
  root.add(sideOverlay);

  const mark = mesh(
    T,
    curveTube(T, [
      [lateralX + side * 0.0032, 0.067, -0.078],
      [lateralX + side * 0.0035, 0.058, -0.03],
      [lateralX + side * 0.0035, 0.05, 0.031],
      [lateralX + side * 0.003, 0.044, 0.088],
    ], 0.0022, 24, 6),
    markMaterial,
    "precision-7-molded-speed-mark",
  );
  root.add(mark);

  const ribGeometries = [];
  for (let rib = 0; rib < 3; rib += 1) {
    const x = lateralX + side * (0.002 + rib * 0.0002);
    const rise = rib * 0.007;
    ribGeometries.push(curveTube(T, [
      [x, 0.075 - rise * 0.25, -0.068],
      [x + side * 0.0007, 0.068 - rise * 0.35, -0.015],
      [x + side * 0.0004, 0.055 - rise * 0.25, 0.045 + rise],
      [x, 0.045, 0.097],
    ], 0.00075, 18, 4));
  }
  const sideRibs = mesh(
    T,
    mergeGeometries(T, ribGeometries),
    markMaterial,
    "precision-7-lateral-ribs",
  );
  root.add(sideRibs);

  const heelCounterProfile = [
    { z: -0.146, y: 0.026 },
    { z: -0.142, y: 0.063 },
    { z: -0.124, y: 0.082 },
    { z: -0.103, y: 0.075 },
    { z: -0.098, y: 0.038 },
  ];
  const heelCounter = mesh(
    T,
    mergeGeometries(T, [
      createSidePrismGeometry(T, heelCounterProfile, 0.043, 0.005, 1),
      createSidePrismGeometry(T, heelCounterProfile, -0.043, 0.005, -1),
    ]),
    overlayMaterial,
    "precision-7-heel-counter",
  );
  root.add(heelCounter);

  const wrapGeometries = [];
  for (const xSign of [-1, 1]) {
    wrapGeometries.push(curveTube(T, [
      [xSign * 0.048, 0.023, 0.055],
      [xSign * 0.052, 0.025, 0.09],
      [xSign * 0.047, 0.032, 0.126],
      [xSign * 0.026, 0.04, 0.145],
    ], 0.0032, 22, 6));
  }
  const forefootWrap = mesh(
    T,
    mergeGeometries(T, wrapGeometries),
    rubberMaterial,
    "precision-7-forefoot-rubber-wrap",
  );
  root.add(forefootWrap);

  const perforationGeometries = [];
  if (detail === "high") {
    for (let row = 0; row < 3; row += 1) {
      for (let column = 0; column < 5; column += 1) {
        const z = -0.125 + column * 0.011 + row * 0.003;
        const y = 0.051 + row * 0.008 + Math.sin(column / 4 * Math.PI) * 0.003;
        const vent = new T.CylinderGeometry(0.00115, 0.00115, 0.003, 6);
        vent.rotateZ(Math.PI * 0.5);
        vent.translate(lateralX + side * 0.003, y, z);
        perforationGeometries.push(vent);
      }
    }
  }
  const perforations = perforationGeometries.length
    ? mesh(T, mergeGeometries(T, perforationGeometries), liningMaterial, "precision-7-quarter-perforations")
    : null;
  if (perforations) root.add(perforations);

  const treadGeometries = [];
  if (detail === "high") {
    const stations = [-0.115, -0.088, -0.052, 0.036, 0.072, 0.108];
    for (const z of stations) {
      for (const x of [-0.031, 0, 0.031]) {
        for (const direction of [-1, 1]) {
          const bar = new T.BoxGeometry(0.022, 0.004, 0.0055);
          bar.rotateY(direction * (Math.PI / 5));
          bar.translate(x + direction * 0.004, -0.0015, z);
          treadGeometries.push(bar);
        }
      }
    }
  }
  const tread = treadGeometries.length
    ? mesh(T, mergeGeometries(T, treadGeometries), tractionMaterial, "precision-7-herringbone-traction")
    : null;
  if (tread) root.add(tread);

  const detailMeshes = [laces, mark, sideRibs, forefootWrap, perforations, tread].filter(Boolean);
  const nodes = {
    root,
    outsole,
    midsole,
    upper,
    heelQuarter,
    tongue,
    collar,
    eyestays,
    laces,
    sideOverlay,
    mark,
    sideRibs,
    heelCounter,
    forefootWrap,
    perforations,
    tread,
  };
  for (const object of Object.values(nodes)) {
    if (!object) continue;
    object.userData.sculptPart = object.name;
  }
  root.userData.sculptRuntime = {
    id: "precision-7-procedural-study",
    styleId: "precision-7",
    socket: "foot",
    approximation: "Stylized procedural study inspired by the official Nike Precision 7 lateral view.",
    dimensionsMeters: PRECISION_7_DIMENSIONS,
    colorwayId: colorway.id,
    colorwayName: colorway.name,
    inferredSurfaces: ["medial-overlay", "collar-interior", "outsole-depth"],
    sourceEvidence: {
      product: "Nike Precision 7",
      style: "HJ9153-102",
      footLengthMeters: PRECISION_7_DIMENSIONS.sourcedFootLengthMeters,
      outerDimensionsInferred: true,
    },
    profileMath: {
      section: "x=cos(theta)*halfWidth(z); y=centerY(z)+sin(theta)*halfHeight(z)",
      rocker: "0.002+(1-cos(progress*pi/2))*toeRise",
      width: "max(heelGaussian,waistGaussian,forefootGaussian)*toeTaper",
      sideRibs: "CatmullRom curve sweep with fixed measured radii",
    },
    detailTier: detail,
    nodes,
    colliders: [
      { type: "box", center: [0, 0.047, 0], size: [0.108, 0.104, 0.298] },
    ],
    destructionGroups: {
      sole: ["precision-7-outsole", "precision-7-sculpted-midsole"],
      upper: ["precision-7-breathable-upper", "precision-7-padded-heel-quarter"],
      closure: ["precision-7-no-sew-eyestays", "precision-7-six-station-laces"],
      lateral: ["precision-7-lateral-overlay", "precision-7-molded-speed-mark", "precision-7-lateral-ribs"],
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

function cutAcademySoleSections({ inset = 0, verticalOffset = 0, height = 0.007 } = {}) {
  const halfLength = CUT_ACADEMY_DIMENSIONS.lengthMeters * 0.5;
  return [-1, -0.8, -0.55, -0.26, 0.05, 0.34, 0.58, 0.79, 1].map((normalized) => ({
    z: normalized * halfLength,
    halfWidth: Math.max(0.017, cutAcademyHalfWidth(normalized) - inset),
    centerY: cutAcademyRockerHeight(normalized) + verticalOffset,
    halfHeight: height * (0.9 + Math.cos(normalized * Math.PI * 0.5) * 0.1),
    lowerSquash: normalized > 0.52 ? 0.76 : 0.92,
  }));
}

function cutAcademyUpperSections() {
  const halfLength = CUT_ACADEMY_DIMENSIONS.lengthMeters * 0.5;
  return [
    { z: -halfLength + 0.011, halfWidth: 0.033, centerY: 0.052, halfHeight: 0.027, crown: 1.04 },
    { z: -0.108, halfWidth: 0.042, centerY: 0.06, halfHeight: 0.033, crown: 1.08 },
    { z: -0.058, halfWidth: 0.045, centerY: 0.058, halfHeight: 0.032, crown: 1.08 },
    { z: 0.002, halfWidth: 0.04, centerY: 0.052, halfHeight: 0.028, crown: 1.08 },
    { z: 0.056, halfWidth: 0.049, centerY: 0.044, halfHeight: 0.022, crown: 1.08 },
    { z: 0.108, halfWidth: 0.047, centerY: 0.039, halfHeight: 0.018, crown: 1.06 },
    { z: halfLength - 0.005, halfWidth: 0.021, centerY: 0.037, halfHeight: 0.008, crown: 1.02 },
  ];
}

export function createCutAcademyShoe(T, {
  colorwayId = "glacier-silver",
  detail = DEFAULT_DETAIL,
  side = 1,
} = {}) {
  const root = new T.Group();
  root.name = "cut-academy-shoe";
  const colorway = cutAcademyColorway(colorwayId);

  const upperMaterial = new T.MeshPhysicalMaterial({
    color: colorway.upper,
    roughness: 0.76,
    metalness: 0,
    clearcoat: 0.025,
    clearcoatRoughness: 0.86,
  });
  const overlayMaterial = new T.MeshPhysicalMaterial({
    color: colorway.upperShade,
    roughness: 0.5,
    metalness: 0,
    clearcoat: 0.12,
    clearcoatRoughness: 0.55,
  });
  const foamMaterial = new T.MeshStandardMaterial({
    color: colorway.midsole,
    roughness: 0.68,
    metalness: 0,
  });
  const foamAccentMaterial = new T.MeshStandardMaterial({
    color: colorShift(T, colorway.midsole, -0.065),
    roughness: 0.7,
    metalness: 0,
  });
  const rubberMaterial = new T.MeshStandardMaterial({
    color: colorway.outsole,
    roughness: 0.9,
    metalness: 0,
  });
  const tractionMaterial = new T.MeshStandardMaterial({
    color: colorShift(T, colorway.outsole, -0.1),
    roughness: 0.94,
    metalness: 0,
  });
  const markMaterial = new T.MeshPhysicalMaterial({
    color: colorway.mark,
    roughness: 0.28,
    metalness: 0.34,
    clearcoat: 0.38,
    clearcoatRoughness: 0.24,
  });
  const laceMaterial = new T.MeshStandardMaterial({
    color: colorway.lace,
    roughness: 0.92,
    metalness: 0,
  });
  const liningMaterial = new T.MeshStandardMaterial({
    color: colorway.lining,
    roughness: 0.96,
    metalness: 0,
  });

  const outsole = mesh(
    T,
    createLoftGeometry(T, densifySections(cutAcademySoleSections(), 3), 16),
    rubberMaterial,
    "cut-academy-outsole",
  );
  root.add(outsole);

  const midsole = mesh(
    T,
    createLoftGeometry(T, densifySections(cutAcademySoleSections({
      inset: 0.0013,
      verticalOffset: 0.017,
      height: 0.0105,
    }), 3), 16),
    foamMaterial,
    "cut-academy-dual-foam-midsole",
  );
  root.add(midsole);

  const cushionInsert = mesh(
    T,
    createLoftGeometry(T, densifySections(cutAcademySoleSections({
      inset: 0.005,
      verticalOffset: 0.026,
      height: 0.0045,
    }), 2), 12),
    foamAccentMaterial,
    "cut-academy-forefoot-cushion-insert",
  );
  root.add(cushionInsert);

  const upper = mesh(
    T,
    createLoftGeometry(T, densifySections(cutAcademyUpperSections(), 3), 18),
    upperMaterial,
    "cut-academy-engineered-mesh-upper",
  );
  root.add(upper);

  const heelQuarter = mesh(
    T,
    createLoftGeometry(T, densifySections([
      { z: -0.146, halfWidth: 0.024, centerY: 0.055, halfHeight: 0.024, crown: 1.02 },
      { z: -0.126, halfWidth: 0.04, centerY: 0.064, halfHeight: 0.03, crown: 1.06 },
      { z: -0.09, halfWidth: 0.043, centerY: 0.064, halfHeight: 0.031, crown: 1.06 },
      { z: -0.052, halfWidth: 0.04, centerY: 0.06, halfHeight: 0.028, crown: 1.04 },
      { z: -0.024, halfWidth: 0.031, centerY: 0.055, halfHeight: 0.021, crown: 1.02 },
    ], 2), 14),
    overlayMaterial,
    "cut-academy-padded-heel-quarter",
  );
  root.add(heelQuarter);

  const tongue = mesh(
    T,
    createSidePrismGeometry(T, [
      { z: -0.082, y: 0.097 },
      { z: -0.05, y: 0.098 },
      { z: 0.077, y: 0.07 },
      { z: 0.098, y: 0.059 },
      { z: 0.08, y: 0.052 },
      { z: -0.078, y: 0.084 },
    ], 0, 0.052, 1),
    liningMaterial,
    "cut-academy-plush-tongue",
  );
  root.add(tongue);

  const collarPoints = [];
  for (let index = 0; index < 30; index += 1) {
    const angle = index / 30 * TAU;
    const point = cutAcademyEllipsePoint(0.044, 0.031, angle);
    const frontDip = Math.max(0, Math.sin(angle)) * 0.014;
    const rearRise = Math.max(0, -Math.sin(angle)) * 0.006;
    collarPoints.push([point.x, 0.088 + rearRise - frontDip, -0.087 + point.y]);
  }
  const collar = mesh(
    T,
    curveTube(T, collarPoints, 0.0043, 28, 6, true),
    liningMaterial,
    "cut-academy-low-collar",
  );
  root.add(collar);

  const eyestayProfile = [
    { z: -0.073, y: 0.092 },
    { z: -0.045, y: 0.095 },
    { z: 0.09, y: 0.067 },
    { z: 0.105, y: 0.057 },
    { z: 0.09, y: 0.051 },
    { z: -0.057, y: 0.081 },
  ];
  const eyestays = mesh(
    T,
    mergeGeometries(T, [
      createSidePrismGeometry(T, eyestayProfile, 0.032, 0.005, 1),
      createSidePrismGeometry(T, eyestayProfile, -0.032, 0.005, -1),
    ]),
    overlayMaterial,
    "cut-academy-six-station-eyestays",
  );
  root.add(eyestays);

  const laceGeometries = [];
  const laceStations = [];
  for (let index = 0; index < 6; index += 1) {
    const progress = index / 5;
    laceStations.push({
      z: -0.052 + progress * 0.129,
      y: 0.092 - progress * 0.026 + Math.sin(progress * Math.PI) * 0.0025,
      width: 0.028 + progress * 0.005,
    });
  }
  for (let index = 0; index < laceStations.length - 1; index += 1) {
    const from = laceStations[index];
    const to = laceStations[index + 1];
    laceGeometries.push(
      cylinderBetween(T, new T.Vector3(-from.width, from.y, from.z), new T.Vector3(to.width, to.y + 0.0015, to.z), 0.0016, 5),
      cylinderBetween(T, new T.Vector3(from.width, from.y, from.z), new T.Vector3(-to.width, to.y + 0.0015, to.z), 0.0016, 5),
    );
  }
  const laces = mesh(T, mergeGeometries(T, laceGeometries), laceMaterial, "cut-academy-crossed-laces");
  root.add(laces);

  const lateralX = side * 0.049;
  const lateralOverlay = mesh(
    T,
    createSidePrismGeometry(T, [
      { z: -0.112, y: 0.036 },
      { z: -0.105, y: 0.075 },
      { z: -0.06, y: 0.084 },
      { z: 0.014, y: 0.07 },
      { z: 0.091, y: 0.045 },
      { z: 0.073, y: 0.034 },
      { z: -0.022, y: 0.041 },
    ], lateralX, 0.004, side),
    overlayMaterial,
    "cut-academy-lateral-support-overlay",
  );
  root.add(lateralOverlay);

  const medialOverlay = mesh(
    T,
    createSidePrismGeometry(T, [
      { z: -0.111, y: 0.038 },
      { z: -0.1, y: 0.071 },
      { z: -0.055, y: 0.08 },
      { z: 0.018, y: 0.066 },
      { z: 0.086, y: 0.045 },
      { z: 0.065, y: 0.035 },
      { z: -0.025, y: 0.042 },
    ], -lateralX, 0.0036, -side),
    upperMaterial,
    "cut-academy-medial-support-overlay",
  );
  root.add(medialOverlay);

  const wing = mesh(
    T,
    curveTube(T, [
      [lateralX + side * 0.003, 0.07, -0.08],
      [lateralX + side * 0.0034, 0.059, -0.035],
      [lateralX + side * 0.0036, 0.052, 0.026],
      [lateralX + side * 0.003, 0.045, 0.095],
    ], 0.0024, 24, 6),
    markMaterial,
    "cut-academy-original-nova-wing",
  );
  root.add(wing);

  const supportGeometries = [];
  for (let rib = 0; rib < 4; rib += 1) {
    const zOffset = rib * 0.012;
    supportGeometries.push(curveTube(T, [
      [lateralX + side * 0.001, 0.076, -0.04 + zOffset],
      [lateralX + side * 0.002, 0.068, -0.005 + zOffset],
      [lateralX + side * 0.001, 0.055, 0.037 + zOffset],
    ], 0.0007, 12, 4));
  }
  const supportEmbroidery = mesh(
    T,
    mergeGeometries(T, supportGeometries),
    markMaterial,
    "cut-academy-quarter-support-embroidery",
  );
  supportEmbroidery.userData.explodeWithParent = true;
  root.add(supportEmbroidery);

  const heelCounterProfile = [
    { z: -0.148, y: 0.026 },
    { z: -0.144, y: 0.063 },
    { z: -0.126, y: 0.082 },
    { z: -0.104, y: 0.075 },
    { z: -0.099, y: 0.038 },
  ];
  const heelCounter = mesh(
    T,
    mergeGeometries(T, [
      createSidePrismGeometry(T, heelCounterProfile, 0.043, 0.005, 1),
      createSidePrismGeometry(T, heelCounterProfile, -0.043, 0.005, -1),
    ]),
    overlayMaterial,
    "cut-academy-heel-counter",
  );
  root.add(heelCounter);

  const forefootFin = mesh(
    T,
    createSidePrismGeometry(T, [
      { z: 0.052, y: 0.018 },
      { z: 0.12, y: 0.022 },
      { z: 0.145, y: 0.034 },
      { z: 0.112, y: 0.04 },
      { z: 0.064, y: 0.031 },
    ], lateralX, 0.007, side),
    foamMaterial,
    "cut-academy-lateral-forefoot-fin",
  );
  root.add(forefootFin);

  const toeWrapGeometries = [];
  for (const xSign of [-1, 1]) {
    toeWrapGeometries.push(curveTube(T, [
      [xSign * 0.048, 0.024, 0.055],
      [xSign * 0.053, 0.026, 0.09],
      [xSign * 0.047, 0.033, 0.127],
      [xSign * 0.025, 0.041, 0.145],
    ], 0.0031, 22, 6));
  }
  const toeWrap = mesh(
    T,
    mergeGeometries(T, toeWrapGeometries),
    rubberMaterial,
    "cut-academy-forefoot-rubber-wrap",
  );
  root.add(toeWrap);

  const shankBridge = mesh(
    T,
    new T.BoxGeometry(0.052, 0.004, 0.058, 2, 1, 3),
    markMaterial,
    "cut-academy-midfoot-shank-bridge",
  );
  shankBridge.position.set(0, -0.004, -0.003);
  root.add(shankBridge);

  const perforationGeometries = [];
  if (detail === "high") {
    for (let row = 0; row < 4; row += 1) {
      for (let column = 0; column < 3; column += 1) {
        const hole = new T.CylinderGeometry(0.0011, 0.0011, 0.003, 6);
        hole.rotateX(Math.PI * 0.5);
        hole.translate((column - 1) * 0.007, 0.079 + row * 0.004, -0.139 + row * 0.006);
        perforationGeometries.push(hole);
      }
    }
  }
  const perforations = perforationGeometries.length
    ? mesh(T, mergeGeometries(T, perforationGeometries), liningMaterial, "cut-academy-heel-perforations")
    : null;
  if (perforations) {
    perforations.userData.explodeWithParent = true;
    root.add(perforations);
  }

  const treadGeometries = [];
  if (detail === "high") {
    const stations = [-0.118, -0.09, -0.058, 0.034, 0.065, 0.096, 0.123];
    for (const z of stations) {
      for (const x of [-0.033, -0.011, 0.011, 0.033]) {
        for (const direction of [-1, 1]) {
          const bar = new T.BoxGeometry(0.018, 0.0038, 0.0048);
          bar.rotateY(direction * Math.PI / 4.8);
          bar.translate(x + direction * 0.003, -0.0018, z);
          treadGeometries.push(bar);
        }
      }
    }
  }
  const tread = treadGeometries.length
    ? mesh(T, mergeGeometries(T, treadGeometries), tractionMaterial, "cut-academy-directional-herringbone")
    : null;
  if (tread) {
    tread.userData.explodeWithParent = true;
    root.add(tread);
  }

  const detailMeshes = [
    laces,
    wing,
    supportEmbroidery,
    forefootFin,
    toeWrap,
    shankBridge,
    perforations,
    tread,
  ].filter(Boolean);
  const nodes = {
    root,
    outsole,
    midsole,
    cushionInsert,
    upper,
    heelQuarter,
    tongue,
    collar,
    eyestays,
    laces,
    lateralOverlay,
    medialOverlay,
    wing,
    supportEmbroidery,
    heelCounter,
    forefootFin,
    toeWrap,
    shankBridge,
    perforations,
    tread,
  };
  for (const object of Object.values(nodes)) {
    if (!object) continue;
    object.userData.sculptPart = object.name;
  }
  root.userData.sculptRuntime = {
    id: "nova-cut-academy-procedural-study",
    styleId: "cut-academy",
    socket: "foot",
    approximation: "Stylized original NOVA study informed by six official Nike G.T. Cut Academy views; no logos or copied geometry.",
    dimensionsMeters: CUT_ACADEMY_DIMENSIONS,
    colorwayId: colorway.id,
    colorwayName: colorway.name,
    inferredSurfaces: ["internal-air-unit", "foam-stack-depth", "production-last"],
    sourceEvidence: {
      product: "Nike G.T. Cut Academy",
      style: "FB2599-400",
      officialViews: 6,
      footLengthMeters: CUT_ACADEMY_DIMENSIONS.sourcedFootLengthMeters,
      outerDimensionsInferred: true,
      referenceOnly: true,
    },
    profileMath: {
      section: "x=cos(theta)*halfWidth(z); y=centerY(z)+sin(theta)*halfHeight(z)",
      rocker: "0.002+(1-cos(progress*pi/2))*toeRise+(1-cos(heelProgress*pi/2))*heelRise",
      width: "max(heelGaussian,waistGaussian,forefootGaussian)*toeTaper",
      support: "CatmullRom sweeps sampled at deterministic quarter stations",
    },
    detailTier: detail,
    nodes,
    colliders: [
      { type: "box", center: [0, 0.047, 0], size: [0.109, 0.105, 0.297] },
    ],
    destructionGroups: {
      sole: ["cut-academy-outsole", "cut-academy-dual-foam-midsole", "cut-academy-forefoot-cushion-insert"],
      upper: ["cut-academy-engineered-mesh-upper", "cut-academy-padded-heel-quarter"],
      closure: ["cut-academy-six-station-eyestays", "cut-academy-crossed-laces"],
      support: ["cut-academy-lateral-support-overlay", "cut-academy-medial-support-overlay", "cut-academy-quarter-support-embroidery"],
    },
  };
  const metrics = triangleCount(root);
  root.userData.metrics = Object.freeze({
    ...metrics,
    detailTier: detail,
    materials: 9,
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
  if (styleId === "cut-academy") {
    return createCutAcademyShoe(T, options);
  }
  if (styleId === "precision-7") {
    return createPrecision7Shoe(T, options);
  }
  if (styleId === "court-classic") {
    return createNovaCourtClassicShoe(T, options);
  }
  return createNovaFlightShoe(T, options);
}

export function basketballShoeMetrics(shoe) {
  return Object.freeze({ ...(shoe?.root?.userData?.metrics ?? shoe?.userData?.metrics ?? {}) });
}

export function basketballShoeRegistrySnapshot() {
  return Object.freeze({
    geometries: 0,
    materials: 0,
    textures: 0,
    policy: "stateless-per-instance",
  });
}
