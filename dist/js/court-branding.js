export const CENTER_LOGO_SIZE_METERS = 3.5;
export const CENTER_LOGO_HALF_EXTENT_METERS = CENTER_LOGO_SIZE_METERS / 2;

/**
 * The local court origin is the genuine midcourt point only for a full court.
 * A half-court scene runs from its attacking baseline (-halfLength) to the
 * half-court boundary (+halfLength), so centering the logo inside that surface
 * would invent a second, false "midcourt". The authentic center lies on the
 * open boundary and a centered mark would extend off the modeled floor.
 */
export function resolveCourtBrandingPlacement(runtime = {}) {
  const halfLength = Math.max(0, Number(runtime.halfLength) || 0);
  if (runtime.kind === "full") {
    return Object.freeze({
      visible: true,
      x: 0,
      z: 0,
      centerLineZ: 0,
      logoHalfExtent: CENTER_LOGO_HALF_EXTENT_METERS,
      reason: "full-court-origin-is-midcourt",
    });
  }
  return Object.freeze({
    visible: false,
    x: 0,
    z: halfLength,
    centerLineZ: halfLength,
    logoHalfExtent: CENTER_LOGO_HALF_EXTENT_METERS,
    reason: "half-court-center-is-open-boundary",
  });
}

export function calculateCourtWideCamera(runtime = {}, aspect = 16 / 9, fovDegrees = 50) {
  const safeAspect = Math.max(0.5, Number(aspect) || 16 / 9);
  const safeFov = Math.max(20, Math.min(80, Number(fovDegrees) || 50));
  const verticalTangent = Math.tan((safeFov * Math.PI / 180) / 2);
  const padding = 0.7;
  const halfLength = Math.max(1, Number(runtime.halfLength) || 7) + padding;
  const halfWidth = Math.max(1, Number(runtime.halfWidth) || 7.5) + padding;
  const fitLengthHeight = halfLength / verticalTangent;
  const fitWidthHeight = halfWidth / (verticalTangent * safeAspect);
  const height = Math.max(fitLengthHeight, fitWidthHeight);
  return Object.freeze({
    fov: safeFov,
    padding,
    height,
    position: Object.freeze([0, height, 0]),
    target: Object.freeze([0, 0, 0]),
    up: Object.freeze([0, 0, -1]),
  });
}

export function calculateOpenGymQACamera(runtime = {}) {
  const halfWidth = Math.max(1, Number(runtime.halfWidth) || 7.5);
  const halfLength = Math.max(1, Number(runtime.halfLength) || 7);
  return Object.freeze({
    fov: 43,
    position: Object.freeze([
      halfWidth * 0.72,
      halfLength * 0.58,
      halfLength * 0.72,
    ]),
    target: Object.freeze([0, 1.18, -halfLength * 0.12]),
    up: Object.freeze([0, 1, 0]),
  });
}
