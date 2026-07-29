/**
 * Regulation court geometry used by gameplay, rendering, and tests.
 *
 * Measurements are metres and follow the FIBA 2024 court diagram:
 * 15 x 28 m playing surface, 50 mm markings, 6.75 m three-point arc,
 * 1.80 m free-throw/centre circles, and a basket centre 1.575 m from
 * the inner edge of the endline.
 */

export const FIBA_COURT = Object.freeze({
  width: 15,
  length: 28,
  halfCourtLength: 14,
  boundaryLane: 2,
  lineWidth: 0.05,
  basketCenterFromEndline: 1.575,
  backboardFromEndline: 1.2,
  rimHeight: 3.05,
  rimRadius: 0.2286,
  threePointRadius: 6.75,
  threePointSidelineInset: 0.9,
  centreCircleRadius: 1.8,
  freeThrowCircleRadius: 1.8,
  freeThrowLineFromEndline: 5.8,
  freeThrowLineLength: 3.6,
  restrictedAreaHalfWidth: 2.45,
  noChargeRadius: 1.3,
  noChargeStraightLength: 0.375,
});

export function createRegulationCourtSpec(kind = "half") {
  const fullCourt = kind === "full";
  const halfLength = fullCourt ? FIBA_COURT.length / 2 : FIBA_COURT.halfCourtLength / 2;
  const basketOffset = halfLength - FIBA_COURT.basketCenterFromEndline;
  const backboardOffset = halfLength - FIBA_COURT.backboardFromEndline;
  const home = Object.freeze({
    x: 0,
    y: FIBA_COURT.rimHeight,
    z: -basketOffset,
    backboardZ: -backboardOffset,
    attackSign: -1,
  });
  const away = fullCourt
    ? Object.freeze({
        x: 0,
        y: FIBA_COURT.rimHeight,
        z: basketOffset,
        backboardZ: backboardOffset,
        attackSign: 1,
      })
    : home;
  return Object.freeze({
    kind: fullCourt ? "full" : "half",
    width: FIBA_COURT.width,
    length: fullCourt ? FIBA_COURT.length : FIBA_COURT.halfCourtLength,
    halfWidth: FIBA_COURT.width / 2,
    halfLength,
    threePointRadius: FIBA_COURT.threePointRadius,
    lineWidth: FIBA_COURT.lineWidth,
    baskets: Object.freeze({ home, away }),
  });
}

export function calculateCourtEndMarkings(runtime, basket) {
  const sign = Math.sign(basket?.attackSign || basket?.z) || -1;
  const baselineZ = sign * runtime.halfLength;
  const freeThrowZ = baselineZ - sign * FIBA_COURT.freeThrowLineFromEndline;
  const cornerX = runtime.halfWidth - FIBA_COURT.threePointSidelineInset;
  const arcInwardOffset = Math.sqrt(Math.max(
    0,
    FIBA_COURT.threePointRadius ** 2 - cornerX ** 2,
  ));
  const arcStartAngle = Math.acos(cornerX / FIBA_COURT.threePointRadius);
  const threePointJoinZ = basket.z - sign * arcInwardOffset;
  return Object.freeze({
    sign,
    baselineZ,
    freeThrowZ,
    laneHalfWidth: FIBA_COURT.restrictedAreaHalfWidth,
    freeThrowLineLength: FIBA_COURT.freeThrowLineLength,
    freeThrowCircleRadius: FIBA_COURT.freeThrowCircleRadius,
    cornerX,
    threePointJoinZ,
    arcInwardOffset,
    arcStartAngle,
    threePointArcStart: sign < 0 ? arcStartAngle : Math.PI + arcStartAngle,
    threePointArcEnd: sign < 0 ? Math.PI - arcStartAngle : Math.PI * 2 - arcStartAngle,
    noChargeArcStart: sign < 0 ? 0 : Math.PI,
    noChargeArcEnd: sign < 0 ? Math.PI : Math.PI * 2,
  });
}

export function calculateCourtMarkingLayout(runtime) {
  const baskets = runtime.kind === "full"
    ? [runtime.baskets.home, runtime.baskets.away]
    : [runtime.baskets.home];
  return Object.freeze({
    width: runtime.width,
    length: runtime.length,
    halfWidth: runtime.halfWidth,
    halfLength: runtime.halfLength,
    lineWidth: FIBA_COURT.lineWidth,
    centreCircleRadius: FIBA_COURT.centreCircleRadius,
    ends: Object.freeze(baskets.map((basket) => Object.freeze({
      basket,
      ...calculateCourtEndMarkings(runtime, basket),
    }))),
  });
}

function createSegment(T, material, start, end, width, y) {
  const dx = end[0] - start[0];
  const dz = end[1] - start[1];
  const length = Math.hypot(dx, dz);
  const mesh = new T.Mesh(new T.BoxGeometry(length, 0.006, width), material);
  mesh.position.set((start[0] + end[0]) / 2, y, (start[1] + end[1]) / 2);
  mesh.rotation.y = -Math.atan2(dz, dx);
  mesh.receiveShadow = true;
  return mesh;
}

function createArcRibbon(T, material, {
  x = 0,
  z = 0,
  radius,
  width,
  start,
  end,
  segments = 96,
  y,
}) {
  const inner = Math.max(0.001, radius - width / 2);
  const outer = radius + width / 2;
  const positions = [];
  const normals = [];
  const uvs = [];
  const indices = [];
  for (let index = 0; index <= segments; index += 1) {
    const t = index / segments;
    const angle = start + (end - start) * t;
    const cosine = Math.cos(angle);
    const sine = Math.sin(angle);
    positions.push(
      x + cosine * inner, y, z + sine * inner,
      x + cosine * outer, y, z + sine * outer,
    );
    normals.push(0, 1, 0, 0, 1, 0);
    uvs.push(t, 0, t, 1);
    if (index < segments) {
      const base = index * 2;
      indices.push(base, base + 2, base + 1, base + 1, base + 2, base + 3);
    }
  }
  const geometry = new T.BufferGeometry();
  geometry.setAttribute("position", new T.Float32BufferAttribute(positions, 3));
  geometry.setAttribute("normal", new T.Float32BufferAttribute(normals, 3));
  geometry.setAttribute("uv", new T.Float32BufferAttribute(uvs, 2));
  geometry.setIndex(indices);
  geometry.computeBoundingSphere();
  return new T.Mesh(geometry, material);
}

function addEndVisuals(T, root, lineMaterial, paintMaterial, end, lineWidth) {
  const baselineInside = end.baselineZ - end.sign * lineWidth;
  const freeThrowLineCentre = end.freeThrowZ + end.sign * lineWidth / 2;
  const freeThrowPaintEdge = freeThrowLineCentre + end.sign * lineWidth / 2;
  const laneSideX = FIBA_COURT.restrictedAreaHalfWidth - lineWidth / 2;
  const laneLength = Math.abs(freeThrowPaintEdge - baselineInside);
  const paint = new T.Mesh(
    new T.PlaneGeometry(
      FIBA_COURT.restrictedAreaHalfWidth * 2 - lineWidth * 2,
      Math.max(0.01, laneLength),
    ),
    paintMaterial,
  );
  paint.rotation.x = -Math.PI / 2;
  paint.position.set(0, 0.012, (baselineInside + freeThrowPaintEdge) / 2);
  paint.receiveShadow = true;
  root.add(paint);

  for (const side of [-1, 1]) {
    root.add(createSegment(
      T,
      lineMaterial,
      [side * laneSideX, baselineInside],
      [side * laneSideX, freeThrowLineCentre],
      lineWidth,
      0.043,
    ));
  }
  root.add(createSegment(
    T,
    lineMaterial,
    [-FIBA_COURT.freeThrowLineLength / 2, freeThrowLineCentre],
    [FIBA_COURT.freeThrowLineLength / 2, freeThrowLineCentre],
    lineWidth,
    0.044,
  ));
  root.add(createArcRibbon(T, lineMaterial, {
    radius: FIBA_COURT.freeThrowCircleRadius - lineWidth / 2,
    width: lineWidth,
    start: 0,
    end: Math.PI * 2,
    z: end.freeThrowZ,
    y: 0.045,
    segments: 96,
  }));

  const cornerLineX = end.cornerX - lineWidth / 2;
  for (const side of [-1, 1]) {
    root.add(createSegment(
      T,
      lineMaterial,
      [side * cornerLineX, baselineInside],
      [side * cornerLineX, end.threePointJoinZ],
      lineWidth,
      0.046,
    ));
  }
  root.add(createArcRibbon(T, lineMaterial, {
    radius: FIBA_COURT.threePointRadius - lineWidth / 2,
    width: lineWidth,
    start: end.threePointArcStart,
    end: end.threePointArcEnd,
    x: end.basket.x,
    z: end.basket.z,
    y: 0.046,
    segments: 120,
  }));

  root.add(createArcRibbon(T, lineMaterial, {
    radius: FIBA_COURT.noChargeRadius - lineWidth / 2,
    width: lineWidth,
    start: end.noChargeArcStart,
    end: end.noChargeArcEnd,
    x: end.basket.x,
    z: end.basket.z,
    y: 0.047,
    segments: 56,
  }));
  for (const side of [-1, 1]) {
    root.add(createSegment(
      T,
      lineMaterial,
      [side * (FIBA_COURT.noChargeRadius - lineWidth / 2), end.basket.z],
      [
        side * (FIBA_COURT.noChargeRadius - lineWidth / 2),
        end.basket.z + end.sign * FIBA_COURT.noChargeStraightLength,
      ],
      lineWidth,
      0.047,
    ));
  }
}

/**
 * Builds code-native, physically scaled court markings. Using mesh ribbons
 * instead of WebGL line primitives keeps every stripe 50 mm wide on screen.
 */
export function createRegulationCourtMarkings(T, runtime, {
  lineColor = 0xf5ede0,
  paintColor = 0x18283d,
} = {}) {
  const layout = calculateCourtMarkingLayout(runtime);
  const root = new T.Group();
  root.name = "regulation-court-markings";
  root.userData.layout = layout;
  const lineMaterial = new T.MeshStandardMaterial({
    color: lineColor,
    roughness: 0.44,
    metalness: 0,
  });
  const paintMaterial = new T.MeshStandardMaterial({
    color: paintColor,
    roughness: 0.38,
    metalness: 0.02,
    transparent: true,
    opacity: 0.94,
  });
  const lineWidth = layout.lineWidth;
  const x = runtime.halfWidth - lineWidth / 2;
  const z = runtime.halfLength - lineWidth / 2;
  root.add(
    createSegment(T, lineMaterial, [-x, -z], [x, -z], lineWidth, 0.042),
    createSegment(T, lineMaterial, [x, -z], [x, z], lineWidth, 0.042),
    createSegment(T, lineMaterial, [x, z], [-x, z], lineWidth, 0.042),
    createSegment(T, lineMaterial, [-x, z], [-x, -z], lineWidth, 0.042),
  );
  for (const end of layout.ends) addEndVisuals(T, root, lineMaterial, paintMaterial, end, lineWidth);

  const centreLineZ = runtime.kind === "full" ? 0 : runtime.halfLength - lineWidth / 2;
  root.add(createSegment(T, lineMaterial, [-x, centreLineZ], [x, centreLineZ], lineWidth, 0.048));
  if (runtime.kind === "full") {
    root.add(createArcRibbon(T, lineMaterial, {
      radius: FIBA_COURT.centreCircleRadius - lineWidth / 2,
      width: lineWidth,
      start: 0,
      end: Math.PI * 2,
      y: 0.049,
      segments: 96,
    }));
  } else {
    root.add(createArcRibbon(T, lineMaterial, {
      radius: FIBA_COURT.centreCircleRadius - lineWidth / 2,
      width: lineWidth,
      start: Math.PI,
      end: Math.PI * 2,
      z: runtime.halfLength,
      y: 0.049,
      segments: 48,
    }));
  }
  return root;
}
