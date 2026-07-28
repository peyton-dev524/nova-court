export const BASKETBALL_TEXTURE_WIDTH = 512;
export const BASKETBALL_TEXTURE_HEIGHT = 256;
// FIBA 2024 equipment range: size 7 circumference 750-770 mm,
// with channels no wider than 6.35 mm. The midpoint defines our scale.
export const BASKETBALL_REFERENCE_CIRCUMFERENCE_MM = 760;
export const BASKETBALL_REFERENCE_RADIUS_MM = BASKETBALL_REFERENCE_CIRCUMFERENCE_MM / (2 * Math.PI);
export const BASKETBALL_MAX_CHANNEL_WIDTH_MM = 6.35;
// The supplied photo places the two visible curve/channel crossings at
// approximately 0.36R and 0.67R from center; average them to offset perspective.
export const BASKETBALL_REFERENCE_CURVE_INTERSECTION_OFFSET = 0.515;
export const BASKETBALL_CURVED_SEAM_AMPLITUDE = Math.acos(
  BASKETBALL_REFERENCE_CURVE_INTERSECTION_OFFSET,
);
export const BASKETBALL_CURVED_SEAM_PHASE = Math.PI / 2;
export const BASKETBALL_CHANNEL_OUTER_HALF_ANGLE = (
  BASKETBALL_MAX_CHANNEL_WIDTH_MM / (2 * BASKETBALL_REFERENCE_RADIUS_MM)
);

const CHANNELS = 4;
const TWO_PI = Math.PI * 2;

function clampByte(value) {
  return Math.max(0, Math.min(255, Math.round(value)));
}

function smoothstep(edge0, edge1, value) {
  const t = Math.max(0, Math.min(1, (value - edge0) / (edge1 - edge0)));
  return t * t * (3 - 2 * t);
}

function hash2(x, y, seed) {
  let value = Math.imul(x | 0, 374761393) + Math.imul(y | 0, 668265263);
  value = (value + Math.imul(seed | 0, 1442695041)) | 0;
  value = Math.imul(value ^ (value >>> 13), 1274126177);
  return ((value ^ (value >>> 16)) >>> 0) / 4294967295;
}

function mixChannel(surface, groove, amount) {
  return clampByte(surface + (groove - surface) * amount);
}

export function basketballCurvedSeamPoint(
  azimuth,
  amplitude = BASKETBALL_CURVED_SEAM_AMPLITUDE,
  phase = BASKETBALL_CURVED_SEAM_PHASE,
) {
  const latitude = amplitude * Math.sin(2 * azimuth + phase);
  const cosLatitude = Math.cos(latitude);
  return Object.freeze({
    x: Math.sin(latitude),
    y: cosLatitude * Math.sin(azimuth),
    z: cosLatitude * Math.cos(azimuth),
  });
}

export function basketballSeamDistances(
  x,
  y,
  z,
  {
    amplitude = BASKETBALL_CURVED_SEAM_AMPLITUDE,
    phase = BASKETBALL_CURVED_SEAM_PHASE,
  } = {},
) {
  const length = Math.hypot(x, y, z);
  if (!Number.isFinite(length) || length <= Number.EPSILON) {
    throw new RangeError("Basketball seam samples require a finite non-zero direction.");
  }

  const nx = x / length;
  const ny = y / length;
  const nz = z / length;
  const azimuth = Math.atan2(ny, nz);
  const latitude = Math.asin(Math.max(-1, Math.min(1, nx)));
  const curvedLatitude = amplitude * Math.sin(2 * azimuth + phase);
  const curvedDerivative = 2 * amplitude * Math.cos(2 * azimuth + phase);

  // The spherical metric scales azimuth by cos(latitude). Dividing by the
  // local gradient keeps the sinusoidal channel approximately constant-width.
  const metricCosine = Math.max(0.2, Math.cos((latitude + curvedLatitude) * 0.5));
  const curvedGradient = Math.hypot(1, curvedDerivative / metricCosine);
  const curved = Math.abs(latitude - curvedLatitude) / curvedGradient;
  const greatCircleY = Math.asin(Math.min(1, Math.abs(ny)));
  const greatCircleZ = Math.asin(Math.min(1, Math.abs(nz)));

  return Object.freeze({
    greatCircleY,
    greatCircleZ,
    curved,
    minimum: Math.min(greatCircleY, greatCircleZ, curved),
  });
}

/**
 * Produces independent, deterministic PBR channels for a regulation-style
 * eight-panel rubber basketball. The reference image informs the appearance;
 * no photographed lighting is baked into the maps.
 */
export function createBasketballTextureData({
  width = BASKETBALL_TEXTURE_WIDTH,
  height = BASKETBALL_TEXTURE_HEIGHT,
  seed = 2408,
} = {}) {
  if (!Number.isInteger(width) || width < 16 || !Number.isInteger(height) || height < 8) {
    throw new RangeError("Basketball textures require integer dimensions of at least 16 by 8.");
  }

  const albedo = new Uint8Array(width * height * CHANNELS);
  const bump = new Uint8Array(width * height * CHANNELS);
  const roughness = new Uint8Array(width * height * CHANNELS);

  for (let py = 0; py < height; py += 1) {
    const v = (py + 0.5) / height;
    const latitude = (0.5 - v) * Math.PI;
    const cosLatitude = Math.cos(latitude);
    const sphereY = Math.sin(latitude);

    for (let px = 0; px < width; px += 1) {
      const u = (px + 0.5) / width;
      const longitude = (u - 0.5) * TWO_PI;
      const sphereX = cosLatitude * Math.sin(longitude);
      const sphereZ = cosLatitude * Math.cos(longitude);

      // A traditional eight-panel topology: two perpendicular great circles
      // plus one continuous non-planar sinusoidal channel.
      const grooveDistance = basketballSeamDistances(
        sphereX,
        sphereY,
        sphereZ,
      ).minimum;
      const groove = 1 - smoothstep(
        BASKETBALL_CHANNEL_OUTER_HALF_ANGLE * 0.46,
        BASKETBALL_CHANNEL_OUTER_HALF_ANGLE,
        grooveDistance,
      );
      const grooveCore = 1 - smoothstep(
        BASKETBALL_CHANNEL_OUTER_HALF_ANGLE * 0.12,
        BASKETBALL_CHANNEL_OUTER_HALF_ANGLE * 0.52,
        grooveDistance,
      );

      // A staggered pebble field gives the rubber its characteristic micro-relief.
      const cellSize = 3.25;
      const row = Math.floor(py / cellSize);
      const stagger = (row & 1) * cellSize * 0.5;
      const localX = ((px - stagger) % cellSize + cellSize) % cellSize - cellSize * 0.5;
      const localY = (py % cellSize) - cellSize * 0.5;
      const pebbleDistance = Math.hypot(localX, localY);
      const pebble = 1 - smoothstep(0.52, 1.38, pebbleDistance);
      const grain = hash2(px, py, seed);
      const broadVariation = hash2(Math.floor(px / 12), Math.floor(py / 12), seed + 19);

      const surfaceRed = 181 + broadVariation * 13 + pebble * 6 + grain * 3;
      const surfaceGreen = 58 + broadVariation * 7 + pebble * 3 + grain * 2;
      const surfaceBlue = 20 + broadVariation * 3 + grain * 2;
      const offset = (py * width + px) * CHANNELS;

      albedo[offset] = mixChannel(surfaceRed, 31, groove);
      albedo[offset + 1] = mixChannel(surfaceGreen, 15, groove);
      albedo[offset + 2] = mixChannel(surfaceBlue, 10, groove);
      albedo[offset + 3] = 255;

      const surfaceHeight = 176 + pebble * 35 + grain * 3;
      const bumpValue = mixChannel(surfaceHeight, 36, Math.max(groove, grooveCore));
      bump[offset] = bumpValue;
      bump[offset + 1] = bumpValue;
      bump[offset + 2] = bumpValue;
      bump[offset + 3] = 255;

      const surfaceRoughness = 216 + (1 - pebble) * 10 + grain * 5;
      const roughnessValue = mixChannel(surfaceRoughness, 242, grooveCore);
      roughness[offset] = roughnessValue;
      roughness[offset + 1] = roughnessValue;
      roughness[offset + 2] = roughnessValue;
      roughness[offset + 3] = 255;
    }
  }

  return {
    width,
    height,
    albedo,
    bump,
    roughness,
    metadata: Object.freeze({
      topology: "traditional-eight-panel-spherical-wave",
      finish: "matte-pebbled-rubber",
      referenceCircumferenceMm: BASKETBALL_REFERENCE_CIRCUMFERENCE_MM,
      maximumChannelWidthMm: BASKETBALL_MAX_CHANNEL_WIDTH_MM,
      curvedSeamAmplitudeRadians: BASKETBALL_CURVED_SEAM_AMPLITUDE,
      textureBytes: albedo.byteLength + bump.byteLength + roughness.byteLength,
    }),
  };
}

function makeDataTexture(T, data, width, height, { color = false, anisotropy = 1 } = {}) {
  const texture = new T.DataTexture(data, width, height, T.RGBAFormat, T.UnsignedByteType);
  texture.wrapS = T.RepeatWrapping;
  texture.wrapT = T.ClampToEdgeWrapping;
  texture.minFilter = T.LinearMipmapLinearFilter;
  texture.magFilter = T.LinearFilter;
  texture.generateMipmaps = true;
  texture.anisotropy = Math.max(1, Math.min(8, anisotropy));
  if (color) texture.colorSpace = T.SRGBColorSpace;
  texture.needsUpdate = true;
  return texture;
}

export function createBasketballMesh(T, radius, {
  anisotropy = 1,
  textureRegistry,
  textureData = createBasketballTextureData(),
} = {}) {
  if (!T?.Mesh || !T?.SphereGeometry || !T?.MeshStandardMaterial || !T?.DataTexture) {
    throw new TypeError("createBasketballMesh requires a complete THREE namespace.");
  }
  if (!Number.isFinite(radius) || radius <= 0) {
    throw new RangeError("Basketball radius must be a positive finite number.");
  }

  const map = makeDataTexture(T, textureData.albedo, textureData.width, textureData.height, {
    color: true,
    anisotropy,
  });
  const bumpMap = makeDataTexture(T, textureData.bump, textureData.width, textureData.height, {
    anisotropy,
  });
  const roughnessMap = makeDataTexture(
    T,
    textureData.roughness,
    textureData.width,
    textureData.height,
    { anisotropy },
  );
  textureRegistry?.push(map, bumpMap, roughnessMap);

  const material = new T.MeshStandardMaterial({
    color: 0xffffff,
    map,
    bumpMap,
    bumpScale: radius * 0.018,
    roughness: 0.96,
    roughnessMap,
    metalness: 0,
  });
  const mesh = new T.Mesh(new T.SphereGeometry(radius, 64, 48), material);
  mesh.name = "procedural-basketball";
  mesh.castShadow = true;
  mesh.receiveShadow = true;
  mesh.userData.visualProfile = {
    source: "img2threejs-inspired-procedural-reconstruction",
    topology: textureData.metadata?.topology || "traditional-eight-panel-spherical-wave",
    textureBytes: textureData.metadata?.textureBytes || 0,
    drawCalls: 1,
  };
  return mesh;
}
