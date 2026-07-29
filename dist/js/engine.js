import { CourtControls } from "./controls.js?v=3.1";
import {
  createNightPark,
  getReplayFrameWindow,
  sampleReplayCamera,
  sampleReplayPoseEmphasis,
} from "./park-visuals.js?v=1.0";
import {
  predictReboundLanding,
  rankReboundCandidates,
  resolveOutOfBounds,
} from "./contact-rules.js?v=1.0";
import {
  calculateFootGroundCorrection,
  dampFootGroundCorrection,
  planFixedSteps,
  recommendQualityTier,
  resolveQualitySettings,
} from "./performance-profile.js?v=1.0";
import {
  advanceDistanceDrivenGait,
  advancePeriodicPhase,
  blendHandleTargets,
  sampleActionProgress,
  sampleShotFormTiming,
} from "./animation-continuity.js?v=1.1";
import {
  createReplayFlow,
  REPLAY_FLOW_EVENTS,
  REPLAY_FLOW_PHASES,
} from "./replay-flow.js?v=1.0";
import {
  sampleDunkChoreography,
  selectDunkChoreography,
} from "./dunk-choreography.js?v=1.0";
import {
  calculateShotCoverage,
  calculateShotMakePercentage,
  normalizeGameplayRating,
  resolveShotMeterWindow,
  resolveShotAttempt,
  RIM_RESULTS,
  SHOT_METER_IDEAL,
  SHOT_METER_PERFECT_HALF_WIDTH,
  shotFacingDirection,
} from "./shot-coverage.js?v=1.1";
import {
  DEFAULT_SHOOTING_ASSIST,
  normalizeShootingAssist,
  shotPerfectHalfWidthForPlayer,
  userShotPerfectHalfWidth,
} from "./shooting-assist.js";
import { createBasketballShortsRig } from "./basketball-shorts.js?v=1.0";
import {
  basketballShoeLowerLegFit,
  createBasketballShoe,
  normalizeBasketballShoeStyle,
} from "./basketball-shoes.js?v=1.3";
import {
  resolveLiveBallSteal,
  resolvePickupOpportunity,
  STEAL_OUTCOMES,
} from "./live-ball-duels.js?v=1.0";
import {
  basketForPossession,
  clampPlayerToRuntime,
  createCourtRuntime,
  shotValueForRuntime,
} from "./court-runtime.js";
import { installFullCourtVisuals } from "./full-court-visuals.js?v=1.2";
import {
  CONTEXTUAL_I_ACTIONS,
  FreeThrowFlow,
  planLayupBank,
  resolveContextualIAction,
  shouldEnforceOutOfBounds,
  shouldQueueMadeShotReplay,
} from "./finishing-mechanics.js?v=1.0";
import {
  applyBasketballStyle,
  createBasketballMesh,
  normalizeBasketballStyle,
} from "./basketball-visuals.js?v=1.1";
import { sampleFeaturedDribbleMove } from "./dribble-animation.js?v=1.0";
import {
  createProceduralHand,
  PLAYER_LEG_PROPORTIONS,
  playerRigScaleForHeight,
} from "./player-anatomy.js?v=1.0";
import { createPlayerHair } from "./player-appearance.js?v=1.0";
import {
  ARC_RUN_GRAB_DURATION,
  createArcRunCameraSnapshot,
  sampleArcRunGrab,
} from "./three-point-contest.js?v=1.2";

export const ENGINE_VERSION = "1.0.0";

export const COURT = Object.freeze({
  width: 15,
  length: 14,
  floorY: 0,
  basketZ: -5.7,
  backboardZ: -6.16,
  rimY: 3.05,
  rimRadius: 0.23,
  ballRadius: 0.12,
});

export const DRIBBLE_MOVE_CONFIG = Object.freeze({
  crossover: { duration: 0.44, switchesHand: true, color: 0x67f6ff, burst: 8 },
  behindBack: { duration: 0.62, switchesHand: true, color: 0xffa15d, burst: 9 },
  hesi: { duration: 0.56, switchesHand: false, color: 0x87ffe2, burst: 5 },
  betweenLegs: { duration: 0.54, switchesHand: true, color: 0xb18cff, burst: 8 },
  inOut: { duration: 0.5, switchesHand: false, color: 0x72ffb3, burst: 7 },
  doubleCross: { duration: 0.7, switchesHand: false, color: 0x58e8ff, burst: 11 },
  spin: { duration: 0.74, switchesHand: true, color: 0xffcf5c, burst: 12 },
  snatchBack: { duration: 0.64, switchesHand: false, color: 0xff6d91, burst: 11 },
  shamgod: { duration: 0.68, switchesHand: true, color: 0x9d7cff, burst: 12 },
});

export const DRIBBLE_MOVES = Object.freeze(Object.keys(DRIBBLE_MOVE_CONFIG));

export const apexReleaseQuality = (jumpVelocity, peakVelocity = 4.5) =>
  1 - Math.max(0, Math.min(1, Math.abs(jumpVelocity) / Math.max(0.01, peakVelocity)));

// Exponential easing keeps animation response identical at 30, 60, or 144 FPS.
export const animationDampingFactor = (lambda, dt) => 1 - Math.exp(-lambda * Math.max(0, dt));

export function getShotAnimationPose(
  shotElapsed,
  jumpVelocity,
  shotReleased = false,
  releaseElapsed = shotReleased ? shotElapsed : 0,
) {
  const timing = sampleShotFormTiming({
    shotElapsed,
    releaseElapsed,
    jumpVelocity,
    released: shotReleased,
  });
  return { ...timing, releaseSnap: timing.wristSnap };
}

export const PLAYER_STATES = Object.freeze({
  IDLE: "idle",
  RUN: "run",
  SPRINT: "sprint",
  DRIBBLE: "dribble",
  SHOOT: "shoot",
  LAYUP: "layup",
  DUNK: "dunk",
  DEFEND: "defend",
  BLOCK: "block",
  STUMBLE: "stumble",
  CELEBRATE: "celebrate",
});

export const BALL_HANDLER_GUARD_POSE = Object.freeze({
  leftShoulder: Object.freeze([-80, -180, -52]),
  rightShoulder: Object.freeze([-80, 180, 52]),
  leftElbow: Object.freeze([-17, 0, 22]),
  rightElbow: Object.freeze([-17, 0, -22]),
  hip: Object.freeze([-21, -11, -8]),
  knee: Object.freeze([30, 0, 0]),
});

const clamp = (v, min, max) => Math.max(min, Math.min(max, v));
const lerp = (a, b, t) => a + (b - a) * t;
const damp = (a, b, lambda, dt) => lerp(a, b, animationDampingFactor(lambda, dt));
const smoothstep = (min, max, v) => {
  const x = clamp((v - min) / (max - min), 0, 1);
  return x * x * (3 - 2 * x);
};
const rand = (min, max) => min + Math.random() * (max - min);
const guardPoseRadians = Object.freeze(Object.fromEntries(
  Object.entries(BALL_HANDLER_GUARD_POSE).map(([key, rotation]) => [
    key,
    Object.freeze(rotation.map((degrees) => degrees * Math.PI / 180)),
  ]),
));

export function isGuardingBallHandler(
  player,
  players = [],
  ballOwner = null,
  maxDistance = 2.8,
) {
  if (!player || !ballOwner || player === ballOwner || player.team === ballOwner.team) return false;
  const position = player.root?.position || player.position;
  const ownerPosition = ballOwner.root?.position || ballOwner.position;
  if (!position || !ownerPosition) return false;

  const guardDistanceSq = (position.x - ownerPosition.x) ** 2
    + (position.z - ownerPosition.z) ** 2;
  if (guardDistanceSq > Math.max(0, maxDistance) ** 2) return false;

  let closestDefender = null;
  let closestDistanceSq = Infinity;
  for (const candidate of players) {
    if (!candidate || candidate === ballOwner || candidate.team === ballOwner.team) continue;
    const candidatePosition = candidate.root?.position || candidate.position;
    if (!candidatePosition) continue;
    const distanceSq = (candidatePosition.x - ownerPosition.x) ** 2
      + (candidatePosition.z - ownerPosition.z) ** 2;
    if (distanceSq < closestDistanceSq) {
      closestDistanceSq = distanceSq;
      closestDefender = candidate;
    }
  }
  return closestDefender === player;
}

export function getDribbleMovePath(type, progress, startHand = 1) {
  const p = clamp(progress, 0, 1);
  const config = DRIBBLE_MOVE_CONFIG[type] || DRIBBLE_MOVE_CONFIG.hesi;
  const endHand = config.switchesHand ? -startHand : startHand;
  if (type === "crossover" || type === "spin") {
    const sample = sampleFeaturedDribbleMove(type, p, startHand);
    return { ...sample.ball, endHand: sample.endHand };
  }
  const eased = smoothstep(0, 1, p);
  let side = lerp(startHand * 0.46, endHand * 0.46, eased);
  let forward = 0.24;
  let height = 0.3 + Math.abs(p - 0.5) * 0.86;
  if (type === "crossover") {
    forward = 0.3;
    height = 0.2 + Math.abs(p - 0.5) * 0.95;
  } else if (type === "behindBack") {
    forward = -0.38 - Math.sin(p * Math.PI) * 0.18;
    height = 0.5 + Math.abs(p - 0.5) * 0.62;
  } else if (type === "betweenLegs") {
    side *= 0.62;
    forward = -0.02 + Math.sin(p * Math.PI) * 0.28;
    height = 0.22 + Math.abs(p - 0.5) * 0.72;
  } else if (type === "inOut") {
    side = startHand * (0.46 + Math.sin(p * Math.PI) * 0.56);
    forward = 0.24 + Math.sin(p * Math.PI) * 0.08;
    height = 0.28 + Math.abs(Math.cos(p * Math.PI)) * 0.74;
  } else if (type === "doubleCross") {
    side = startHand * 0.46 * Math.cos(p * Math.PI * 2);
    forward = 0.28 + Math.sin(p * Math.PI * 2) * 0.07;
    height = 0.2 + Math.abs(Math.cos(p * Math.PI * 2)) * 0.76;
  } else if (type === "spin") {
    forward = -0.14 - Math.sin(p * Math.PI) * 0.64;
    height = 0.3 + Math.abs(p - 0.5) * 0.92;
  } else if (type === "snatchBack") {
    side = startHand * (0.46 + Math.sin(p * Math.PI) * 0.08);
    forward = lerp(0.4, -0.76, smoothstep(0.08, 0.88, p));
    height = 0.2 + Math.abs(p - 0.54) * 0.96;
  } else if (type === "shamgod") {
    if (p < 0.44) {
      side = startHand * lerp(0.46, 1.02, smoothstep(0, 0.44, p));
    } else {
      side = lerp(startHand * 1.02, endHand * 0.46, smoothstep(0.44, 1, p));
    }
    forward = 0.18 + Math.sin(p * Math.PI) * 0.2;
    height = 0.18 + Math.abs(p - 0.58) * 0.9;
  } else if (type === "hesi") {
    side = startHand * 0.5;
    forward = 0.27;
    height = 0.4 + Math.sin(p * Math.PI) * 0.72;
  }
  return { side, forward, height, endHand };
}

class EventHub {
  constructor(forward) {
    this.listeners = new Map();
    this.forward = forward;
  }
  on(type, fn) {
    if (!this.listeners.has(type)) this.listeners.set(type, new Set());
    this.listeners.get(type).add(fn);
    return () => this.listeners.get(type)?.delete(fn);
  }
  emit(type, detail = {}) {
    const event = { type, time: performance.now(), ...detail };
    this.forward?.(event);
    for (const fn of this.listeners.get(type) || []) fn(event);
    for (const fn of this.listeners.get("*") || []) fn(event);
  }
  clear() { this.listeners.clear(); }
}

/**
 * A lightweight procedural athlete. Limbs are deliberately separate pivots so
 * animation reads clearly while remaining free of external models and mixers.
 */
export class ProceduralPlayer {
  constructor(engine, options = {}) {
    this.engine = engine;
    this.T = engine.T;
    this.id = options.id || `player-${engine._nextPlayerId++}`;
    this.name = options.name || this.id;
    this.team = options.team || "home";
    this.controlled = !!options.controlled;
    this.isAI = options.isAI ?? !this.controlled;
    this.radius = 0.42;
    this.height = options.height || options.metadata?.height || 1.9;
    this.baseHipHeight = 1.245;
    this.rigGroundOffset = 0;
    this._footWorld = new this.T.Vector3();
    this._ballLocal = new this.T.Vector3();
    this._upAxis = new this.T.Vector3(0, 1, 0);
    this.detailMeshes = [];
    this.speed = options.speed || 4.1;
    this.velocity = new this.T.Vector3();
    this.desiredVelocity = new this.T.Vector3();
    this.facing = new this.T.Vector3(0, 0, -1);
    this.jumpVelocity = 0;
    this.grounded = true;
    this.stamina = 1;
    this.state = PLAYER_STATES.IDLE;
    this.stateTime = 0;
    this.actionLock = 0;
    this.stealCooldown = 0;
    this.blockCooldown = 0;
    this.hasBall = false;
    this.dribbleHand = 1;
    this.dribblePhase = 0;
    this.passTarget = null;
    this.blockWindow = 0;
    this.blockConnected = false;
    this.dribbleMove = null;
    this.dribbleMoveTime = 0;
    this.dribbleMoveDuration = 0;
    this.dribbleMoveStartedAt = -Infinity;
    this.dribbleMoveProgress = 0;
    this.dribbleMoveStartHand = 1;
    this.dribbleMoveHandCommitted = true;
    this.queuedDribbleMove = null;
    this.dribbleTransition = null;
    this.dribbleMoveColor = DRIBBLE_MOVE_CONFIG.hesi.color;
    this.handleTrailTimer = 0;
    this.lastHandleInputAt = -Infinity;
    this.lastHandleMoveAt = -Infinity;
    this.handleComboCount = 0;
    this.shotReleased = false;
    this.shotElapsed = 0;
    this.shotReleaseElapsed = 0;
    this.shotStartedAt = -Infinity;
    this.shotReleasedAt = -Infinity;
    this.dunkSelection = null;
    this.dunkProgress = 0;
    this.dunkStartedAt = -Infinity;
    this.rimHangUntil = -Infinity;
    this.rimHangAnchor = new this.T.Vector3();
    this.shootingHand = (options.shootingHand ?? options.metadata?.shootingHand ?? 1) < 0 ? -1 : 1;
    this.landingImpact = 0;
    this.animationPhaseOffset = [...this.id].reduce((sum, character, index) => sum + character.charCodeAt(0) * (index + 1) * 0.013, 0) % (Math.PI * 2);
    this.animationClock = 0;
    this.gaitPhase = this.animationPhaseOffset;
    this.smoothedSpeed = 0;
    this.locomotionBlend = 0;
    this.sprintBlend = 0;
    this.defenseBlend = 0;
    this.ballHandlerGuardBlend = 0;
    this.arcRunGrab = null;
    this.airborneBlend = 0;
    this.metadata = {
      ...(options.metadata || {}),
      role: options.role ?? options.metadata?.role ?? "guard",
      height: this.height,
      shooting: options.shooting ?? options.metadata?.shooting,
      rebounding: options.rebounding ?? options.metadata?.rebounding,
      offensiveRebound: options.offensiveRebound ?? options.metadata?.offensiveRebound,
      defensiveRebound: options.defensiveRebound ?? options.metadata?.defensiveRebound,
      vertical: options.vertical ?? options.metadata?.vertical,
      finishing: options.finishing ?? options.metadata?.finishing,
      strength: options.strength ?? options.metadata?.strength,
      ballSecurity: options.ballSecurity ?? options.metadata?.ballSecurity,
      shootingHand: this.shootingHand,
      jerseyNumber: options.jerseyNumber ?? options.metadata?.jerseyNumber,
      appearanceId: options.appearanceId ?? options.metadata?.appearanceId ?? "classic",
      hairStyle: options.hairStyle ?? options.metadata?.hairStyle ?? "crop",
      headShape: options.headShape ?? options.metadata?.headShape ?? "round",
      shoeStyleId: normalizeBasketballShoeStyle(
        options.shoeStyleId ?? options.shoeStyle ?? options.metadata?.shoeStyleId,
      ),
    };
    this.colors = {
      jersey: options.jerseyColor ?? options.primary ?? (this.team === "home" ? 0x32e6c4 : 0xff5a76),
      trim: options.trimColor ?? options.accent ?? (this.team === "home" ? 0x123f57 : 0x541b38),
      skin: options.skinColor ?? 0xa96745,
      shoes: options.shoeColor ?? 0xeefcff,
    };
    this.root = this._buildModel();
    this.root.position.copy(options.position || new this.T.Vector3(0, 0, 3.8));
    this.root.userData.player = this;
    engine.playerRoot.add(this.root);
  }

  _material(color, roughness = 0.65, metalness = 0.05) {
    return new this.T.MeshStandardMaterial({ color, roughness, metalness });
  }

  _mesh(geometry, material, cast = true) {
    const mesh = new this.T.Mesh(geometry, material);
    mesh.castShadow = cast;
    mesh.receiveShadow = true;
    return mesh;
  }

  _jerseyNumberTexture() {
    const canvas = document.createElement("canvas");
    canvas.width = 128;
    canvas.height = 160;
    const ctx = canvas.getContext("2d");
    const fallbackNumber = ([...this.id].reduce((sum, character) => sum + character.charCodeAt(0), 0) % 90) + 1;
    const number = Number.isFinite(Number(this.metadata.jerseyNumber))
      ? Math.max(0, Math.min(99, Math.round(Number(this.metadata.jerseyNumber))))
      : fallbackNumber;
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.font = "900 86px Arial Black, Arial";
    ctx.lineWidth = 13;
    ctx.strokeStyle = "#10202a";
    ctx.strokeText(String(number), 64, 82);
    ctx.fillStyle = "#f7fbf2";
    ctx.fillText(String(number), 64, 82);
    const texture = new this.T.CanvasTexture(canvas);
    texture.colorSpace = this.T.SRGBColorSpace;
    texture.needsUpdate = true;
    this.engine.generatedTextures?.push(texture);
    return texture;
  }

  _buildModel() {
    const T = this.T;
    const group = new T.Group();
    group.name = this.id;
    const skin = this._material(this.colors.skin, 0.72);
    const jersey = this._material(this.colors.jersey, 0.58);
    const trim = this._material(this.colors.trim, 0.54);
    const sock = this._material(0xf0f2ed, 0.72);
    const hair = this._material(0x17120f, 0.92);

    this.hips = new T.Group();
    this.hips.position.y = this.baseHipHeight;
    group.add(this.hips);

    this.shortsRig = createBasketballShortsRig(T, {
      mainColor: this.colors.trim,
      panelColor: this.colors.jersey,
    });
    this.hips.add(this.shortsRig.root);

    const torso = this._mesh(new T.CylinderGeometry(0.305, 0.238, 0.59, 14), jersey);
    torso.position.y = 0.63;
    torso.scale.z = 0.72;
    this.hips.add(torso);
    const collar = this._mesh(new T.TorusGeometry(0.14, 0.022, 6, 20, Math.PI), trim);
    collar.position.set(0, 0.935, 0.205);
    collar.rotation.set(Math.PI / 2, 0, Math.PI);
    this.hips.add(collar);
    this.detailMeshes.push(collar);
    for (const side of [-1, 1]) {
      const sidePanel = this._mesh(new T.BoxGeometry(0.035, 0.47, 0.22), trim);
      sidePanel.position.set(side * 0.254, 0.6, 0);
      this.hips.add(sidePanel);
      this.detailMeshes.push(sidePanel);
    }

    const numberTexture = this._jerseyNumberTexture();
    const numberMaterial = new T.MeshBasicMaterial({
      map: numberTexture,
      transparent: true,
      depthWrite: false,
      side: T.DoubleSide,
      toneMapped: false,
    });
    for (const z of [-0.224, 0.224]) {
      const numberPlate = this._mesh(new T.PlaneGeometry(0.23, 0.29), numberMaterial, false);
      numberPlate.position.set(0, 0.69, z);
      if (z < 0) numberPlate.rotation.y = Math.PI;
      this.hips.add(numberPlate);
      this.detailMeshes.push(numberPlate);
    }

    const neck = this._mesh(new T.CylinderGeometry(0.1, 0.12, 0.18, 12), skin);
    neck.position.y = 1.03;
    this.hips.add(neck);
    const head = this._mesh(new T.SphereGeometry(0.205, 20, 16), skin);
    head.position.y = 1.255;
    const headShape = this.metadata.headShape;
    head.scale.set(
      headShape === "wide" ? 1.03 : 0.92,
      headShape === "long" ? 1.17 : 1.1,
      0.94,
    );
    this.hips.add(head);
    const jaw = this._mesh(new T.SphereGeometry(0.158, 16, 10), skin);
    jaw.position.set(0, 1.17, 0.012);
    jaw.scale.set(headShape === "wide" ? 1.08 : 0.92, 0.72, 0.96);
    this.hips.add(jaw);
    const hairRig = createPlayerHair(T, this.metadata.hairStyle, hair);
    this.hips.add(hairRig.root);
    this.detailMeshes.push(...hairRig.details);

    const faceDark = this._material(0x17191c, 0.82);
    const eyeWhite = this._material(0xf1eee6, 0.76);
    for (const side of [-1, 1]) {
      const ear = this._mesh(new T.SphereGeometry(0.038, 8, 6), skin, false);
      ear.position.set(side * (headShape === "wide" ? 0.205 : 0.187), 1.255, 0);
      ear.scale.set(0.45, 0.9, 0.62);
      this.hips.add(ear);
      this.detailMeshes.push(ear);
      const sclera = this._mesh(new T.SphereGeometry(0.023, 10, 7), eyeWhite, false);
      sclera.position.set(side * 0.067, 1.295, 0.19);
      sclera.scale.set(1.12, 0.56, 0.36);
      this.hips.add(sclera);
      this.detailMeshes.push(sclera);
      const iris = this._mesh(new T.SphereGeometry(0.009, 8, 6), faceDark, false);
      iris.position.set(side * 0.067, 1.295, 0.205);
      iris.scale.z = 0.45;
      this.hips.add(iris);
      this.detailMeshes.push(iris);
      const brow = this._mesh(new T.BoxGeometry(0.055, 0.008, 0.01), hair, false);
      brow.position.set(side * 0.067, 1.326, 0.196);
      brow.rotation.z = side * -0.08;
      this.hips.add(brow);
      this.detailMeshes.push(brow);
    }
    const nose = this._mesh(new T.SphereGeometry(0.027, 8, 6), skin, false);
    nose.position.set(0, 1.255, 0.21);
    nose.scale.set(0.72, 1.05, 0.72);
    this.hips.add(nose);
    this.detailMeshes.push(nose);
    const mouth = this._mesh(new T.BoxGeometry(0.07, 0.009, 0.012), faceDark, false);
    mouth.position.set(0, 1.195, 0.187);
    this.hips.add(mouth);
    this.detailMeshes.push(mouth);
    const jerseyHem = this._mesh(new T.CylinderGeometry(0.24, 0.24, 0.025, 14), jersey);
    jerseyHem.position.y = 0.33;
    jerseyHem.scale.z = 0.72;
    this.hips.add(jerseyHem);
    this.detailMeshes.push(jerseyHem);

    this.arms = [];
    for (const side of [-1, 1]) {
      const shoulder = new T.Group();
      shoulder.position.set(side * 0.345, 0.865, 0);
      this.hips.add(shoulder);
      const deltoid = this._mesh(new T.SphereGeometry(0.105, 10, 8), skin);
      deltoid.position.y = -0.03;
      deltoid.scale.set(0.9, 1.08, 0.86);
      shoulder.add(deltoid);
      const shoulderBand = this._mesh(new T.CylinderGeometry(0.094, 0.087, 0.095, 10), trim);
      shoulderBand.position.y = -0.115;
      shoulder.add(shoulderBand);
      this.detailMeshes.push(shoulderBand);
      const upper = this._mesh(new T.CapsuleGeometry(0.082, 0.32, 4, 9), skin);
      upper.position.y = -0.285;
      shoulder.add(upper);
      const elbow = new T.Group();
      elbow.position.y = -0.5;
      shoulder.add(elbow);
      const elbowJoint = this._mesh(new T.SphereGeometry(0.079, 9, 7), skin);
      elbowJoint.scale.set(0.94, 0.82, 0.92);
      elbow.add(elbowJoint);
      const forearm = this._mesh(new T.CapsuleGeometry(0.07, 0.3, 4, 9), skin);
      forearm.position.y = -0.205;
      elbow.add(forearm);
      const wristBand = this._mesh(new T.CylinderGeometry(0.073, 0.069, 0.06, 10), trim);
      wristBand.position.y = -0.39;
      elbow.add(wristBand);
      this.detailMeshes.push(wristBand);
      const handRig = createProceduralHand(T, { side, material: skin });
      const hand = handRig.root;
      hand.position.y = -0.47;
      hand.traverse((node) => {
        if (!node.isMesh) return;
        node.castShadow = true;
        node.receiveShadow = true;
      });
      elbow.add(hand);
      this.arms.push({ shoulder, elbow, hand, handRig, side });
    }

    this.legs = [];
    for (const side of [-1, 1]) {
      const lowerLegFit = basketballShoeLowerLegFit(this.metadata.shoeStyleId);
      const hip = new T.Group();
      hip.position.set(side * 0.165, -0.05, 0);
      this.hips.add(hip);
      const thigh = this._mesh(new T.CapsuleGeometry(
        PLAYER_LEG_PROPORTIONS.thigh.radius,
        PLAYER_LEG_PROPORTIONS.thigh.capsuleLength,
        4,
        10,
      ), skin);
      thigh.position.y = PLAYER_LEG_PROPORTIONS.thigh.centerY;
      hip.add(thigh);
      const knee = new T.Group();
      knee.position.y = -0.575;
      hip.add(knee);
      const kneeCap = this._mesh(new T.SphereGeometry(
        PLAYER_LEG_PROPORTIONS.knee.radius,
        10,
        8,
      ), skin);
      kneeCap.position.z = 0.012;
      kneeCap.scale.fromArray(PLAYER_LEG_PROPORTIONS.knee.scale);
      knee.add(kneeCap);
      const shin = this._mesh(new T.CapsuleGeometry(
        PLAYER_LEG_PROPORTIONS.calf.radius,
        lowerLegFit.shin.length,
        4,
        9,
      ), skin);
      shin.position.y = lowerLegFit.shin.centerY;
      knee.add(shin);
      const sockMesh = this._mesh(new T.CylinderGeometry(
        lowerLegFit.sock.radiusTop,
        lowerLegFit.sock.radiusBottom,
        lowerLegFit.sock.height,
        10,
      ), sock);
      sockMesh.position.y = lowerLegFit.sock.centerY;
      knee.add(sockMesh);
      this.detailMeshes.push(sockMesh);
      const shoe = createBasketballShoe(T, {
        styleId: this.metadata.shoeStyleId,
        shellColor: this.colors.shoes,
        accentColor: this.colors.trim,
        detail: "high",
        side,
      });
      shoe.root.position.fromArray(lowerLegFit.shoe.position);
      shoe.root.rotation.x = lowerLegFit.shoe.rotationX;
      knee.add(shoe.root);
      this.detailMeshes.push(...shoe.detailMeshes);
      this.legs.push({
        hip,
        knee,
        shin,
        sock: sockMesh,
        shoe: shoe.root,
        shoeRig: shoe,
        outsole: shoe.outsole,
        side,
      });
    }

    const markerMat = new T.MeshBasicMaterial({
      color: this.controlled ? 0x68e7ff : this.colors.jersey,
      transparent: true,
      opacity: this.controlled ? 0.7 : 0,
      depthWrite: false,
      toneMapped: false,
    });
    const contactShadow = this._mesh(
      new T.CircleGeometry(0.47, 32),
      new T.MeshBasicMaterial({
        color: 0x030506,
        transparent: true,
        opacity: 0.2,
        depthWrite: false,
        toneMapped: false,
      }),
      false,
    );
    contactShadow.rotation.x = -Math.PI / 2;
    contactShadow.position.y = 0.012;
    contactShadow.scale.set(1, 0.72, 1);
    group.add(contactShadow);
    this.marker = this._mesh(new T.RingGeometry(0.43, 0.51, 40), markerMat, false);
    this.marker.rotation.x = -Math.PI / 2;
    this.marker.position.y = 0.018;
    group.add(this.marker);
    const rigScale = playerRigScaleForHeight(this.height);
    group.scale.set(rigScale.x, rigScale.y, rigScale.z);
    return group;
  }

  setState(next, force = false) {
    if (!force && (this.actionLock > 0 || next === this.state)) return false;
    const previous = this.state;
    this.state = next;
    this.stateTime = 0;
    this.engine.events.emit("state", { player: this, previous, state: next });
    return true;
  }

  worldHandPosition(target = new this.T.Vector3(), handSign = this.dribbleHand) {
    const hand = this.arms[handSign > 0 ? 1 : 0].hand;
    return hand.getWorldPosition(target);
  }

  setVisualQuality(tier = "balanced") {
    const showDetail = tier !== "performance";
    for (const mesh of this.detailMeshes) mesh.visible = showDetail;
    const showShoeMicroDetail = showDetail && (this.engine.players?.length ?? 0) <= 4;
    for (const leg of this.legs) {
      for (const mesh of leg.shoeRig?.detailMeshes || []) mesh.visible = showShoeMicroDetail;
    }
  }

  setShortsParameters(parameters = {}) {
    return this.shortsRig?.setParameters(parameters);
  }

  shortsMetrics() {
    return this.shortsRig?.getMetrics();
  }

  updateAnimation(dt, speedRatio) {
    this.stateTime += dt;
    this.animationClock += dt;
    this.actionLock = Math.max(0, this.actionLock - dt);
    this.stealCooldown = Math.max(0, this.stealCooldown - dt);
    this.blockCooldown = Math.max(0, this.blockCooldown - dt);
    this.blockWindow = Math.max(0, this.blockWindow - dt);
    this.landingImpact = Math.max(0, this.landingImpact - dt * 2.7);
    const action = this.state;
    const actionNow = this.engine.elapsed + this.engine.fixedAccumulator;
    if (action === PLAYER_STATES.SHOOT) {
      this.shotElapsed = Math.max(this.shotElapsed, actionNow - this.shotStartedAt);
      this.shotReleaseElapsed = this.shotReleased
        ? Math.max(this.shotReleaseElapsed, actionNow - this.shotReleasedAt)
        : 0;
    }
    const t = action === PLAYER_STATES.SHOOT ? this.shotElapsed : this.stateTime;
    const speedTarget = clamp(speedRatio, 0, 1.15);
    this.smoothedSpeed = damp(this.smoothedSpeed, speedTarget, speedTarget > this.smoothedSpeed ? 11 : 7, dt);
    this.locomotionBlend = damp(this.locomotionBlend, smoothstep(0.035, 0.32, this.smoothedSpeed), 9, dt);
    this.sprintBlend = damp(this.sprintBlend, action === PLAYER_STATES.SPRINT ? 1 : 0, 7.5, dt);
    this.defenseBlend = damp(this.defenseBlend, action === PLAYER_STATES.DEFEND ? 1 : 0, 9, dt);
    const guardingBallHandler = this.grounded
      && ![
        PLAYER_STATES.SHOOT,
        PLAYER_STATES.LAYUP,
        PLAYER_STATES.DUNK,
        PLAYER_STATES.BLOCK,
        PLAYER_STATES.STUMBLE,
        PLAYER_STATES.CELEBRATE,
      ].includes(action)
      && isGuardingBallHandler(this, this.engine.players, this.engine.ball.owner);
    this.ballHandlerGuardBlend = damp(
      this.ballHandlerGuardBlend,
      guardingBallHandler ? 1 : 0,
      guardingBallHandler ? 12 : 9,
      dt,
    );
    const guardBlend = this.ballHandlerGuardBlend;
    this.airborneBlend = damp(this.airborneBlend, this.grounded ? 0 : 1, this.grounded ? 13 : 16, dt);
    const locomotion = Math.min(1, this.smoothedSpeed) * this.locomotionBlend;
    const airborne = !this.grounded;
    const cadence = lerp(8.4, 13.5, this.sprintBlend) + this.defenseBlend * 1.1;
    const strideDistance = this.velocity.length() * dt * smoothstep(0.02, 0.5, this.smoothedSpeed);
    this.gaitPhase = advanceDistanceDrivenGait(
      this.gaitPhase,
      strideDistance,
      lerp(3.05, 2.55, this.sprintBlend),
    );
    const stride = Math.sin(this.gaitPhase);
    const breath = Math.sin(this.animationClock * 2.2 + this.animationPhaseOffset) * 0.012;
    const landingSquash = Math.sin(clamp(this.landingImpact, 0, 1) * Math.PI * 0.5) * 0.1;

    const moveActive = !!this.dribbleMove && this.dribbleMoveTime > 0;
    const moveProgress = moveActive
      ? sampleActionProgress(this.dribbleMoveStartedAt, this.dribbleMoveDuration, actionNow)
      : 0;
    const featuredMoveSample = moveActive
      && (this.dribbleMove === "crossover" || this.dribbleMove === "spin")
      ? sampleFeaturedDribbleMove(this.dribbleMove, moveProgress, this.dribbleMoveStartHand)
      : null;
    const moveWave = Math.sin(moveProgress * Math.PI);
    const doubleWave = Math.sin(moveProgress * Math.PI * 2);
    let moveTurn = 0;
    let moveCrouch = 0;
    let moveLean = this.dribbleMoveStartHand * 0.14 * moveWave;
    if (moveActive) {
      if (featuredMoveSample) {
        moveTurn = featuredMoveSample.pose.torsoYaw;
        moveLean = featuredMoveSample.pose.torsoLean;
        moveCrouch = featuredMoveSample.pose.crouch;
      } else if (this.dribbleMove === "behindBack") moveTurn = this.dribbleMoveStartHand * 0.82 * moveWave;
      else if (this.dribbleMove === "betweenLegs") moveTurn = this.dribbleMoveStartHand * -0.2 * moveWave;
      else if (this.dribbleMove === "inOut") {
        moveTurn = this.dribbleMoveStartHand * 0.24 * moveWave;
        moveLean *= -1.15;
      } else if (this.dribbleMove === "doubleCross") {
        moveTurn = this.dribbleMoveStartHand * -0.34 * doubleWave;
        moveLean = this.dribbleMoveStartHand * 0.2 * doubleWave;
      } else if (this.dribbleMove === "snatchBack") {
        moveTurn = this.dribbleMoveStartHand * -0.14 * moveWave;
        moveLean = this.dribbleMoveStartHand * 0.08 * moveWave;
      } else if (this.dribbleMove === "shamgod") {
        moveTurn = this.dribbleMoveStartHand * -0.72 * moveWave;
        moveLean = this.dribbleMoveStartHand * 0.26 * moveWave;
      }
      if (featuredMoveSample) {
        moveCrouch = featuredMoveSample.pose.crouch;
      } else if (this.dribbleMove === "betweenLegs") moveCrouch = 0.2 * moveWave;
      else if (this.dribbleMove === "hesi") moveCrouch = 0.12 * moveWave;
      else if (this.dribbleMove === "snatchBack") moveCrouch = 0.24 * moveWave;
      else if (this.dribbleMove === "doubleCross") moveCrouch = 0.13 * Math.abs(doubleWave);
      else if (this.dribbleMove === "shamgod") moveCrouch = 0.17 * moveWave;
    }
    const defensiveCrouch = 0.15 * this.defenseBlend;
    const stumble = action === PLAYER_STATES.STUMBLE ? Math.sin(Math.min(1, t / 0.45) * Math.PI) : 0;
    const celebration = action === PLAYER_STATES.CELEBRATE ? Math.sin(Math.min(1, t / 0.5) * Math.PI) : 0;
    const shootPose = action === PLAYER_STATES.SHOOT
      ? getShotAnimationPose(
        this.shotElapsed,
        this.jumpVelocity,
        this.shotReleased,
        this.shotReleaseElapsed,
      )
      : null;
    const dunkPose = action === PLAYER_STATES.DUNK && this.dunkSelection
      ? sampleDunkChoreography(this.dunkSelection, this.dunkProgress)
      : null;
    const arcRunGrabPose = this.arcRunGrab
      ? sampleArcRunGrab(this.arcRunGrab.progress, this.arcRunGrab.handSign)
      : null;

    this.hips.position.y = this.baseHipHeight + this.rigGroundOffset + breath
      - landingSquash - defensiveCrouch - moveCrouch
      - (arcRunGrabPose?.reach || 0) * 0.14
      + Math.abs(stride) * 0.035 * locomotion
      - (shootPose?.dip || 0) * 0.055
      + (shootPose?.torsoLift || 0);
    const handleForwardLean = this.dribbleMove === "snatchBack" ? 0.12 * moveWave
      : this.dribbleMove === "spin" ? -0.05 * moveWave : -0.12 * moveWave;
    const forwardLean = dunkPose
      ? dunkPose.torso.pitch
      : -0.16 * this.sprintBlend - 0.1 * this.defenseBlend
        + (moveActive ? handleForwardLean : 0)
        + (shootPose ? lerp(0.1 + shootPose.dip * 0.04, -0.055, shootPose.setPoint) : 0);
    this.hips.rotation.x = damp(this.hips.rotation.x, forwardLean + stumble * 0.28, 13, dt);
    const targetHipYaw = dunkPose
      ? dunkPose.root.turn + dunkPose.torso.yaw
      : moveTurn + stumble * 0.32;
    this.hips.rotation.y = featuredMoveSample?.move === "spin"
      ? targetHipYaw
      : damp(this.hips.rotation.y, targetHipYaw, 15, dt);
    const lateralLean = lerp(
      clamp(this.velocity.x * -0.032, -0.14, 0.14),
      clamp(this.velocity.x * -0.055, -0.18, 0.18),
      this.defenseBlend,
    );
    this.hips.rotation.z = damp(
      this.hips.rotation.z,
      dunkPose
        ? dunkPose.torso.roll
        : lateralLean + (moveActive ? moveLean : 0) - stumble * 0.34,
      13,
      dt,
    );

    const strideAmount = lerp(0.6, 0.78, this.sprintBlend);
    const legSwing = stride * lerp(strideAmount, 0.34, this.defenseBlend) * locomotion;
    for (let i = 0; i < this.legs.length; i++) {
      const leg = this.legs[i];
      const phase = i === 0 ? 1 : -1;
      let hipTarget = legSwing * phase;
      let kneeTarget = Math.max(0, -legSwing * phase) * lerp(0.52, 0.72, this.sprintBlend)
        + landingSquash * 2.2;
      let spread = phase * 0.16 * this.defenseBlend;
      if (shootPose) {
        const shootingFoot = i === (this.shootingHand > 0 ? 1 : 0);
        hipTarget += (shootingFoot ? -0.08 : 0.035)
          * shootPose.stanceSet
          * (1 - shootPose.landingRecovery);
        spread += phase * 0.07 * shootPose.stanceSet;
      }
      if (dunkPose) {
        const poseLeg = i === 0 ? dunkPose.legs.left : dunkPose.legs.right;
        hipTarget = poseLeg.hipPitch;
        kneeTarget = poseLeg.knee;
        spread = poseLeg.hipRoll;
      } else if (airborne || this.airborneBlend > 0.01) {
        const airHip = action === PLAYER_STATES.LAYUP
          ? (i === (this.dribbleHand > 0 ? 1 : 0) ? -0.62 : 0.22)
          : action === PLAYER_STATES.DUNK ? -0.38 : -0.12;
        const airKnee = action === PLAYER_STATES.DUNK ? 0.72 : shootPose ? shootPose.kneeBend : 0.5;
        hipTarget = lerp(hipTarget, airHip, this.airborneBlend);
        kneeTarget = lerp(kneeTarget, airKnee, this.airborneBlend);
      }
      if (moveActive) {
        if (featuredMoveSample) {
          const poseLeg = i === 0
            ? {
              hip: featuredMoveSample.pose.rightHip,
              knee: featuredMoveSample.pose.rightKnee,
            }
            : {
              hip: featuredMoveSample.pose.leftHip,
              knee: featuredMoveSample.pose.leftKnee,
            };
          hipTarget = poseLeg.hip;
          kneeTarget = poseLeg.knee;
          spread += phase * 0.06 * moveWave;
        } else if (this.dribbleMove === "betweenLegs" || this.dribbleMove === "shamgod") {
          hipTarget += phase * this.dribbleMoveStartHand * 0.3 * moveWave;
          kneeTarget += 0.34 * moveWave;
        } else if (this.dribbleMove === "snatchBack") {
          hipTarget -= 0.2 * moveWave;
          kneeTarget += 0.48 * moveWave;
        } else if (this.dribbleMove === "doubleCross") {
          spread += phase * 0.2 * Math.abs(doubleWave);
          kneeTarget += 0.2 * Math.abs(doubleWave);
        } else if (this.dribbleMove === "inOut") {
          kneeTarget += 0.18 * moveWave;
        }
      }
      const guardHip = guardPoseRadians.hip;
      const guardKnee = guardPoseRadians.knee;
      leg.hip.rotation.x = damp(leg.hip.rotation.x, lerp(hipTarget, guardHip[0], guardBlend), 17, dt);
      leg.hip.rotation.y = damp(leg.hip.rotation.y, guardHip[1] * guardBlend, 15, dt);
      leg.hip.rotation.z = damp(leg.hip.rotation.z, lerp(spread, guardHip[2], guardBlend), 15, dt);
      leg.knee.rotation.x = damp(leg.knee.rotation.x, lerp(kneeTarget, guardKnee[0], guardBlend), 18, dt);
      leg.knee.rotation.y = damp(leg.knee.rotation.y, guardKnee[1] * guardBlend, 18, dt);
      leg.knee.rotation.z = damp(leg.knee.rotation.z, guardKnee[2] * guardBlend, 18, dt);
    }

    this.shortsRig?.update(dt, {
      speedRatio: this.smoothedSpeed,
      lateralSpeed: this.velocity.x,
      forwardSpeed: this.velocity.z,
      defenseBlend: this.defenseBlend,
      airborneBlend: this.airborneBlend,
      leftHipPitch: this.legs[0]?.hip.rotation.x || 0,
      rightHipPitch: this.legs[1]?.hip.rotation.x || 0,
      leftHipYaw: this.legs[0]?.hip.rotation.y || 0,
      rightHipYaw: this.legs[1]?.hip.rotation.y || 0,
      leftHipRoll: this.legs[0]?.hip.rotation.z || 0,
      rightHipRoll: this.legs[1]?.hip.rotation.z || 0,
    });

    for (let i = 0; i < this.arms.length; i++) {
      const arm = this.arms[i];
      const phase = i === 0 ? -1 : 1;
      let swing = stride * 0.48 * locomotion * phase;
      let out = phase * 0.88 * this.defenseBlend;
      let elbow = lerp(-0.12, -0.3, this.defenseBlend);
      let wristX = 0;
      let wristZ = 0;
      if (shootPose) {
        const shootingArm = i === (this.shootingHand > 0 ? 1 : 0);
        swing = shootingArm
          ? lerp(-0.34 - shootPose.dip * 0.2, -2.88, shootPose.setPoint)
          : lerp(-0.42 - shootPose.dip * 0.12, -2.58, shootPose.setPoint);
        if (this.shotReleased) {
          swing -= shootPose.followThrough * (shootingArm ? 0.22 : 0.04);
        }
        out = shootingArm
          ? phase * lerp(0.2, 0.08, shootPose.elbowStack)
          : phase * lerp(0.27, 0.18 + shootPose.guideRelease * 0.26, shootPose.setPoint);
        elbow = shootingArm
          ? lerp(-1.02, -0.045, shootPose.elbowStack)
          : lerp(-0.86, -0.34, shootPose.setPoint);
        wristX = shootingArm ? -shootPose.wristSnap * 1.05 : shootPose.guideRelease * 0.24;
        wristZ = shootingArm ? phase * 0.04 : phase * shootPose.guideRelease * 0.34;
      } else if (dunkPose) {
        const poseArm = i === 0 ? dunkPose.arms.left : dunkPose.arms.right;
        swing = poseArm.shoulderPitch;
        out = poseArm.shoulderRoll;
        elbow = poseArm.elbow;
        wristX = poseArm.wrist;
      } else if (action === PLAYER_STATES.LAYUP || action === PLAYER_STATES.DUNK) {
        const finishHand = this.dribbleHand > 0 ? 1 : 0;
        if (i === finishHand) {
          swing = action === PLAYER_STATES.DUNK ? -2.94 : -2.72;
          elbow = action === PLAYER_STATES.DUNK ? -0.03 : -0.66;
          out = phase * 0.08;
        } else {
          swing = -0.72;
          out = phase * 0.5;
        }
      } else if (action === PLAYER_STATES.BLOCK) {
        const extension = smoothstep(0, 0.15, t);
        swing = -2.88 * extension;
        elbow = -0.05;
        out = phase * 0.22;
      } else if (action === PLAYER_STATES.CELEBRATE) {
        swing = i === 0 ? -2.6 * celebration : -1.4 * celebration;
        out = phase * 0.32;
        elbow = -0.2;
      } else if (action === PLAYER_STATES.STUMBLE) {
        swing = phase * 0.85 * stumble;
        out = phase * 0.95 * stumble;
        elbow = -0.42;
      } else if (arcRunGrabPose) {
        const activeArm = arm.side === arcRunGrabPose.handSign;
        swing = activeArm
          ? arcRunGrabPose.activeShoulderPitch
          : arcRunGrabPose.guideShoulderPitch;
        out = activeArm
          ? arcRunGrabPose.activeShoulderRoll
          : arcRunGrabPose.guideShoulderRoll;
        elbow = activeArm
          ? arcRunGrabPose.activeElbow
          : arcRunGrabPose.guideElbow;
        wristX = activeArm ? arcRunGrabPose.activeWrist : 0;
      } else if (moveActive && this.hasBall) {
        const activeHand = this.dribbleHand > 0 ? 1 : 0;
        const startHand = this.dribbleMoveStartHand > 0 ? 1 : 0;
        const isBallArm = i === activeHand || i === startHand || this.dribbleMove === "doubleCross";
        const handleWave = this.dribbleMove === "doubleCross" ? Math.abs(doubleWave) : moveWave;
        if (isBallArm) {
          const wrapDepth = this.dribbleMove === "behindBack" || this.dribbleMove === "spin" ? 0.96
            : this.dribbleMove === "snatchBack" ? 0.68
              : this.dribbleMove === "shamgod" ? 0.74 : 0.5;
          swing = -0.38 - handleWave * wrapDepth;
          const crossWidth = this.dribbleMove === "crossover" || this.dribbleMove === "doubleCross" ? 0.86
            : this.dribbleMove === "shamgod" ? 0.72 : 0.32;
          out = phase * crossWidth * (this.dribbleMove === "doubleCross" ? doubleWave : moveWave);
          elbow = -0.76 + handleWave * 0.34;
        } else if (this.dribbleMove === "hesi" || this.dribbleMove === "inOut") {
          swing = -1.0 * moveWave;
          out = phase * 0.5;
          elbow = -0.34;
        }
      } else if (this.hasBall) {
        const activeHand = this.dribbleHand > 0 ? 1 : 0;
        if (i === activeHand) {
          swing = -0.28 + Math.sin(this.dribblePhase * Math.PI * 2) * 0.5;
          out = phase * 0.18;
          elbow = -0.6;
        } else {
          swing *= 0.55;
          out = phase * 0.12;
        }
      }
      if (this.hasBall && !shootPose && action !== PLAYER_STATES.LAYUP && action !== PLAYER_STATES.DUNK &&
          this.engine.ball.owner === this) {
        const localBall = this._ballLocal.copy(this.engine.ball.position)
          .sub(this.root.position)
          .applyAxisAngle(this._upAxis, -this.root.rotation.y);
        const shoulderX = arm.side * 0.36 * this.root.scale.x;
        const shoulderY = (this.hips.position.y + 0.87) * this.root.scale.y;
        const dx = localBall.x - shoulderX;
        const dy = localBall.y - shoulderY;
        const dz = localBall.z;
        const ownership = clamp(1 - Math.abs(localBall.x - arm.side * 0.42) / 0.84, 0, 1);
        const contact = smoothstep(0.4, 0.96, localBall.y);
        const reachWeight = ownership * contact * 0.58;
        if (reachWeight > 0.001) {
          const downward = Math.max(0.12, -dy);
          const pitchTarget = clamp(-Math.atan2(dz, downward), -1.58, 0.35);
          const outTarget = clamp(Math.atan2(dx, downward), -1.2, 1.2);
          const scaleY = Math.max(0.01, this.root.scale.y);
          const reach = clamp(Math.hypot(dx, dy, dz) / scaleY, 0.22, 0.955);
          const upper = 0.5;
          const lower = 0.465;
          const elbowCos = clamp((upper * upper + lower * lower - reach * reach) / (2 * upper * lower), -1, 1);
          const elbowTarget = -(Math.PI - Math.acos(elbowCos));
          swing = lerp(swing, pitchTarget, reachWeight);
          out = lerp(out, outTarget, reachWeight);
          elbow = lerp(elbow, elbowTarget, reachWeight * 0.82);
        }
      }
      const guardShoulder = i === 0
        ? guardPoseRadians.rightShoulder
        : guardPoseRadians.leftShoulder;
      const guardElbow = i === 0
        ? guardPoseRadians.rightElbow
        : guardPoseRadians.leftElbow;
      arm.shoulder.rotation.x = damp(
        arm.shoulder.rotation.x,
        lerp(swing, guardShoulder[0], guardBlend),
        19,
        dt,
      );
      arm.shoulder.rotation.y = damp(
        arm.shoulder.rotation.y,
        guardShoulder[1] * guardBlend,
        18,
        dt,
      );
      arm.shoulder.rotation.z = damp(
        arm.shoulder.rotation.z,
        lerp(out, guardShoulder[2], guardBlend),
        18,
        dt,
      );
      arm.elbow.rotation.x = damp(
        arm.elbow.rotation.x,
        lerp(elbow, guardElbow[0], guardBlend),
        19,
        dt,
      );
      arm.elbow.rotation.y = damp(arm.elbow.rotation.y, guardElbow[1] * guardBlend, 19, dt);
      arm.elbow.rotation.z = damp(arm.elbow.rotation.z, guardElbow[2] * guardBlend, 19, dt);
      arm.hand.rotation.x = damp(arm.hand.rotation.x, wristX, 21, dt);
      arm.hand.rotation.z = damp(arm.hand.rotation.z, wristZ, 21, dt);
    }
    this.root.updateMatrixWorld(true);
    if (this.grounded) {
      const soleHalfHeight = 0.0175 * this.root.scale.y;
      const footBottoms = this.legs.map((leg) =>
        leg.outsole.getWorldPosition(this._footWorld).y - soleHalfHeight);
      const correction = calculateFootGroundCorrection({
        rootY: this.root.position.y,
        floorY: COURT.floorY,
        soleClearance: 0.006,
        footBottoms,
        grounded: true,
        maxRise: 0.24,
        maxDrop: 0.05,
      });
      const scaleY = Math.max(0.01, this.root.scale.y);
      const target = clamp(this.rigGroundOffset + correction.correctionY / scaleY, -0.04, 0.34);
      this.rigGroundOffset = dampFootGroundCorrection(this.rigGroundOffset, target, dt);
    } else {
      this.rigGroundOffset = dampFootGroundCorrection(this.rigGroundOffset, 0, dt);
    }
    if (this.dribbleMove && this.dribbleMoveTime <= 0) this.dribbleMove = null;
    this.marker.material.opacity = this.controlled
      ? 0.56 + Math.sin(this.animationClock * 4) * 0.18
      : 0;
    this.marker.scale.setScalar(1 + Math.sin(this.animationClock * 4) * 0.025);
  }

  dispose() {
    this.root.traverse((node) => {
      node.geometry?.dispose?.();
      if (Array.isArray(node.material)) node.material.forEach((m) => m.dispose?.());
      else node.material?.dispose?.();
    });
    this.root.removeFromParent();
  }
}

export class NovaCourtEngine {
  constructor(options = {}) {
    const T = globalThis.THREE;
    if (!T) throw new Error("NovaCourtEngine requires THREE on globalThis before engine.js is loaded.");
    this.T = T;
    this.options = options;
    // Gameplay randomness is injectable so input-to-outcome mechanics can be
    // reproduced exactly in tests without changing the default runtime behavior.
    this.random = typeof options.random === "function" ? options.random : Math.random;
    this.container = options.container || document.body;
    this.events = new EventHub(options.onEvent);
    this.controls = options.controls || new CourtControls(options.controlOptions);
    this.ownsControls = !options.controls;
    this._nextPlayerId = 1;
    this.players = [];
    this.controlledPlayer = null;
    this.running = false;
    this.paused = false;
    this.destroyed = false;
    this.elapsed = 0;
    this.timeScale = 1;
    this.fixedAccumulator = 0;
    this.maxFixedSubsteps = 4;
    this.physicsDroppedTime = 0;
    this.frameTimeSamples = [];
    this.qualityTier = options.visualQuality || "balanced";
    this.lastQualityDecisionAt = performance.now();
    this.performanceWarmupUntil = this.lastQualityDecisionAt + 2500;
    this._lastPerformanceEventAt = -Infinity;
    this.mode = options.mode || "street-1v1";
    this.courtRuntime = options.courtRuntime || createCourtRuntime(null);
    this.venue = options.venue === "park" ? "park" : "arena";
    this.difficulty = options.difficulty || "pro";
    this.cameraMode = options.cameraMode || "follow";
    this.arcRunRack = null;
    this.activeArcRunGrab = null;
    this.cameraShake = 0;
    this.handleFlash = 0;
    this.score = { home: 0, away: 0 };
    this.possessionTeam = "home";
    this.shotClock = 24;
    this.shotCharge = 0;
    this.chargingShot = false;
    this.shotInputAction = "shoot";
    this.shotIdeal = SHOT_METER_IDEAL;
    this.userShootingAssist = normalizeShootingAssist(
      options.userShootingAssist ?? DEFAULT_SHOOTING_ASSIST,
    );
    this.shotPerfectHalfWidth = userShotPerfectHalfWidth(this.userShootingAssist);
    this.lastShotQuality = 0;
    this.shotApexTolerance = 0.38;
    this.queuedRelease = null;
    this.shotContext = "jumper";
    this.activeDunk = null;
    this.freeThrowFlow = new FreeThrowFlow();
    this.lastScorer = null;
    this._scoredOnFlight = false;
    this.deadBallCooldown = 0;
    this.rulesSequence = 0;
    this.teamFouls = { home: 0, away: 0 };
    this.netPulse = 0;
    this.scoreRingPulse = 0;
    this.shotTrailTimer = 0;
    this.perfectTrailIndex = 0;
    this.highlightPending = 0;
    this.replayBuffer = [];
    this.replay = null;
    this.replayQueue = [];
    this.replayFlow = createReplayFlow({
      queueDelay: options.reducedMotion ? 0 : 0.36,
      restoreDuration: options.reducedMotion ? 0.06 : 0.2,
      queueLimit: 3,
    });
    this._lastFrame = performance.now();
    this._raf = 0;
    this._resizeObserver = null;
    this._scratchA = new T.Vector3();
    this._scratchB = new T.Vector3();
    this._scratchC = new T.Vector3();
    this._scratchD = new T.Vector3();
    this._upAxis = new T.Vector3(0, 1, 0);

    this.scene = new T.Scene();
    this.scene.background = new T.Color(0x05070b);
    this.scene.fog = new T.FogExp2(0x05070b, 0.011);
    this.camera = new T.PerspectiveCamera(43, 1, 0.05, 120);
    this.camera.position.set(7.8, 5.4, 9.5);
    this.cameraTarget = new T.Vector3(0, 1.3, 1.4);
    this.renderer = new T.WebGLRenderer({
      antialias: options.antialias !== false,
      alpha: false,
      powerPreference: "high-performance",
    });
    this.renderer.outputColorSpace = T.SRGBColorSpace;
    this.renderer.toneMapping = T.ACESFilmicToneMapping;
    this.renderer.toneMappingExposure = 0.82;
    this.renderer.shadowMap.enabled = options.shadows !== false;
    this.renderer.shadowMap.type = T.PCFSoftShadowMap;
    this.renderer.setPixelRatio(Math.min(options.pixelRatio || devicePixelRatio || 1, 1.5));
    this.renderer.domElement.className = "nova-court-canvas";
    this.renderer.domElement.tabIndex = 0;
    this.renderer.domElement.setAttribute("aria-label", "Interactive Nova Court basketball game");
    this.renderer.domElement.addEventListener("pointerdown", () => this.renderer.domElement.focus());
    this.container.appendChild(this.renderer.domElement);

    this.generatedTextures = [];
    this.worldRoot = new T.Group();
    this.playerRoot = new T.Group();
    this.vfxRoot = new T.Group();
    this.scene.add(this.worldRoot, this.playerRoot, this.vfxRoot);
    this._buildLighting();
    this._buildArena();
    if (this.courtRuntime.kind === "full") installFullCourtVisuals(this, this.courtRuntime);
    this.park = this.venue === "park"
      ? createNightPark(T, {
          parent: this.worldRoot,
          quality: options.visualQuality || "balanced",
          courtWidth: this.courtRuntime.width,
          courtLength: this.courtRuntime.length,
          seed: 7319,
        })
      : null;
    this._buildBall();
    this._buildVFXPool();
    this._spawnDefaultPlayers(options.players);
    this._handleResize();
    if (globalThis.ResizeObserver) {
      this._resizeObserver = new ResizeObserver(() => this._handleResize());
      this._resizeObserver.observe(this.container);
    } else {
      this._resizeHandler = () => this._handleResize();
      window.addEventListener("resize", this._resizeHandler);
    }
    this.events.emit("ready", { engine: this, mode: this.mode });
  }

  _basketForTeam(teamId = this.possessionTeam) {
    return basketForPossession(this.courtRuntime, teamId);
  }

  _activeBasket() {
    const teamId = this.ball?.shotBy?.team || this.ball?.owner?.team || this.possessionTeam;
    return this._basketForTeam(teamId);
  }

  _makeCanvasTexture(width, height, painter) {
    const canvas = document.createElement("canvas");
    canvas.width = width;
    canvas.height = height;
    const context = canvas.getContext("2d");
    painter(context, canvas);
    const texture = new this.T.CanvasTexture(canvas);
    texture.colorSpace = this.T.SRGBColorSpace;
    texture.anisotropy = Math.min(8, this.renderer.capabilities.getMaxAnisotropy?.() || 1);
    texture.needsUpdate = true;
    this.generatedTextures.push(texture);
    return texture;
  }

  _buildLighting() {
    const T = this.T;
    const hemi = new T.HemisphereLight(0xc8ddff, 0x1c120d, 0.36);
    this.scene.add(hemi);
    const key = new T.DirectionalLight(0xfff1dd, 0.78);
    key.position.set(4.5, 10.5, 5.5);
    key.castShadow = true;
    key.shadow.mapSize.set(2048, 2048);
    key.shadow.camera.left = -11;
    key.shadow.camera.right = 11;
    key.shadow.camera.top = 11;
    key.shadow.camera.bottom = -10;
    key.shadow.bias = -0.00045;
    this.scene.add(key);

    this.accentLights = [];
    const spots = [
      [-5.6, 8.8, 2.8, 0xd9f3ff],
      [5.6, 8.8, 2.8, 0xffead4],
      [-5.2, 8.2, -4.6, 0xe4f6ff],
      [5.2, 8.2, -4.6, 0xffe6cf],
    ];
    for (const [x, y, z, color] of spots) {
      const light = new T.SpotLight(color, 4.2, 28, 0.54, 0.72, 1.35);
      light.position.set(x, y, z);
      light.target.position.set(x * 0.18, 0, z * 0.28);
      light.castShadow = false;
      this.scene.add(light, light.target);
      this.accentLights.push(light);
    }
    const rimGlow = new T.PointLight(0xff8d4f, 2.2, 8, 2);
    rimGlow.position.set(0, 4.1, -6.4);
    this.scene.add(rimGlow);
    const courtFill = new T.DirectionalLight(0x8edfff, 0.24);
    courtFill.position.set(-7.5, 5.8, 8.5);
    this.scene.add(courtFill);
  }

  _buildArena() {
    const T = this.T;
    const woodTexture = this._makeCanvasTexture(1024, 1024, (ctx, canvas) => {
      ctx.fillStyle = "#a96835";
      ctx.fillRect(0, 0, canvas.width, canvas.height);
      const plankHeight = 44;
      const plankWidth = 178;
      for (let row = 0; row < Math.ceil(canvas.height / plankHeight); row++) {
        const offset = row % 2 ? -plankWidth / 2 : 0;
        for (let column = -1; column < Math.ceil(canvas.width / plankWidth) + 1; column++) {
          const x = column * plankWidth + offset;
          const hue = 27 + ((row * 7 + column * 3) % 5);
          const light = 42 + ((row * 11 + column * 13) % 9);
          ctx.fillStyle = "hsl(" + hue + " 48% " + light + "%)";
          ctx.fillRect(x + 1, row * plankHeight + 1, plankWidth - 2, plankHeight - 2);
          ctx.strokeStyle = "rgba(55,26,12,.22)";
          ctx.strokeRect(x + 1, row * plankHeight + 1, plankWidth - 2, plankHeight - 2);
          for (let grain = 0; grain < 3; grain++) {
            const gy = row * plankHeight + 9 + grain * 11 + ((column * 7 + row) % 4);
            ctx.beginPath();
            ctx.moveTo(x + 12, gy);
            ctx.bezierCurveTo(x + 54, gy - 3, x + 108, gy + 3, x + plankWidth - 12, gy);
            ctx.strokeStyle = "rgba(65,30,13,.11)";
            ctx.stroke();
          }
        }
      }
      const sheen = ctx.createLinearGradient(0, 0, canvas.width, canvas.height);
      sheen.addColorStop(0, "rgba(255,235,194,.16)");
      sheen.addColorStop(0.48, "rgba(255,255,255,.02)");
      sheen.addColorStop(1, "rgba(53,20,8,.14)");
      ctx.fillStyle = sheen;
      ctx.fillRect(0, 0, canvas.width, canvas.height);
    });

    const surround = new T.Mesh(
      new T.PlaneGeometry(COURT.width + 3.4, COURT.length + 3.6),
      new T.MeshStandardMaterial({ color: 0x080b10, roughness: 0.72, metalness: 0.05 }),
    );
    surround.rotation.x = -Math.PI / 2;
    surround.position.y = -0.028;
    surround.receiveShadow = true;
    this.worldRoot.add(surround);

    const floor = new T.Mesh(
      new T.PlaneGeometry(COURT.width, COURT.length),
      new T.MeshStandardMaterial({
        map: this.venue === "park" ? null : woodTexture,
        color: this.venue === "park" ? 0x31545c : 0xd8b48c,
        roughness: this.venue === "park" ? 0.88 : 0.4,
        metalness: 0.01,
      }),
    );
    floor.rotation.x = -Math.PI / 2;
    floor.receiveShadow = true;
    this.worldRoot.add(floor);

    const paintMat = new T.MeshStandardMaterial({
      color: 0x18283d,
      roughness: 0.34,
      metalness: 0.04,
      transparent: true,
      opacity: 0.94,
    });
    const lanePaint = new T.Mesh(new T.PlaneGeometry(4.9, 3.9), paintMat);
    lanePaint.rotation.x = -Math.PI / 2;
    lanePaint.position.set(0, 0.011, -4.875);
    lanePaint.receiveShadow = true;
    this.worldRoot.add(lanePaint);
    const baselinePaint = new T.Mesh(
      new T.PlaneGeometry(COURT.width - 0.3, 0.48),
      new T.MeshStandardMaterial({ color: 0x101b2a, roughness: 0.38 }),
    );
    baselinePaint.rotation.x = -Math.PI / 2;
    baselinePaint.position.set(0, 0.01, -6.7);
    this.worldRoot.add(baselinePaint);

    const logoTexture = this._makeCanvasTexture(512, 512, (ctx, canvas) => {
      ctx.clearRect(0, 0, canvas.width, canvas.height);
      ctx.translate(256, 256);
      ctx.beginPath();
      ctx.arc(0, 0, 188, 0, Math.PI * 2);
      ctx.fillStyle = "rgba(9,20,31,.82)";
      ctx.fill();
      ctx.lineWidth = 16;
      ctx.strokeStyle = "#49d9e8";
      ctx.stroke();
      ctx.beginPath();
      ctx.arc(0, 0, 154, 0, Math.PI * 2);
      ctx.lineWidth = 3;
      ctx.strokeStyle = "rgba(255,255,255,.48)";
      ctx.stroke();
      ctx.fillStyle = "#f2eee5";
      ctx.textAlign = "center";
      ctx.font = "900 88px Arial Black, Arial";
      ctx.fillText("NOVA", 0, -8);
      ctx.font = "800 38px Arial Black, Arial";
      ctx.fillStyle = "#ff8b45";
      ctx.fillText("COURT", 0, 55);
    });
    const logo = new T.Mesh(
      new T.PlaneGeometry(3.5, 3.5),
      new T.MeshBasicMaterial({ map: logoTexture, transparent: true, depthWrite: false, toneMapped: false }),
    );
    logo.rotation.x = -Math.PI / 2;
    logo.position.set(0, 0.023, 1.6);
    this.worldRoot.add(logo);

    const baselineTexture = this._makeCanvasTexture(1024, 160, (ctx, canvas) => {
      ctx.clearRect(0, 0, canvas.width, canvas.height);
      ctx.textAlign = "center";
      ctx.textBaseline = "middle";
      ctx.font = "italic 900 92px Arial Black, Arial";
      ctx.fillStyle = "#f3eee4";
      ctx.fillText("NIGHT LEAGUE", canvas.width / 2, canvas.height / 2);
      ctx.lineWidth = 4;
      ctx.strokeStyle = "#ff844f";
      ctx.strokeText("NIGHT LEAGUE", canvas.width / 2, canvas.height / 2);
    });
    const baselineWordmark = new T.Mesh(
      new T.PlaneGeometry(5.25, 0.82),
      new T.MeshBasicMaterial({ map: baselineTexture, transparent: true, depthWrite: false, toneMapped: false }),
    );
    baselineWordmark.rotation.x = -Math.PI / 2;
    baselineWordmark.position.set(0, 0.026, -6.47);
    this.worldRoot.add(baselineWordmark);

    const lineMat = new T.LineBasicMaterial({ color: 0xf5ede0, transparent: true, opacity: 0.92 });
    const addLine = (points, closed = false) => {
      const pts = points.map(([x, z]) => new T.Vector3(x, 0.034, z));
      if (closed) pts.push(pts[0].clone());
      const geometry = new T.BufferGeometry().setFromPoints(pts);
      const line = new T.Line(geometry, lineMat);
      this.worldRoot.add(line);
      return line;
    };
    addLine([
      [-COURT.width / 2 + 0.16, -COURT.length / 2 + 0.16],
      [COURT.width / 2 - 0.16, -COURT.length / 2 + 0.16],
      [COURT.width / 2 - 0.16, COURT.length / 2 - 0.16],
      [-COURT.width / 2 + 0.16, COURT.length / 2 - 0.16],
    ], true);
    addLine([[-2.45, -6.82], [-2.45, -2.95], [2.45, -2.95], [2.45, -6.82]], true);
    const circle = (radius, cx, cz, start = 0, end = Math.PI * 2, segments = 72) => {
      const pts = [];
      for (let i = 0; i <= segments; i++) {
        const angle = lerp(start, end, i / segments);
        pts.push([cx + Math.cos(angle) * radius, cz + Math.sin(angle) * radius]);
      }
      return addLine(pts);
    };
    circle(1.15, 0, -2.95);
    circle(0.72, 0, COURT.basketZ);
    circle(6.35, 0, COURT.basketZ, 0.13, Math.PI - 0.13, 84);
    addLine([[-6.3, COURT.basketZ + 0.85], [-6.3, -6.82]]);
    addLine([[6.3, COURT.basketZ + 0.85], [6.3, -6.82]]);

    const metal = new T.MeshStandardMaterial({ color: 0x586575, roughness: 0.24, metalness: 0.86 });
    const padding = new T.MeshStandardMaterial({ color: 0x10263a, roughness: 0.66 });
    const glass = new T.MeshPhysicalMaterial({
      color: 0xe7f5fa,
      roughness: 0.05,
      metalness: 0,
      transmission: 0.86,
      transparent: true,
      opacity: 0.38,
    });
    const pole = new T.Mesh(new T.BoxGeometry(0.32, 3.55, 0.32), metal);
    pole.position.set(0, 1.78, -6.82);
    pole.castShadow = true;
    this.worldRoot.add(pole);
    const base = new T.Mesh(new T.BoxGeometry(1.18, 0.76, 1.3), padding);
    base.position.set(0, 0.38, -6.75);
    base.castShadow = true;
    this.worldRoot.add(base);
    const baseStripe = new T.Mesh(
      new T.BoxGeometry(1.2, 0.08, 1.32),
      new T.MeshBasicMaterial({ color: 0x48dbea, toneMapped: false }),
    );
    baseStripe.position.set(0, 0.62, -6.75);
    this.worldRoot.add(baseStripe);
    const support = new T.Mesh(new T.BoxGeometry(0.18, 0.18, 0.86), metal);
    support.position.set(0, 3.55, -6.47);
    this.worldRoot.add(support);
    this.backboard = new T.Mesh(new T.BoxGeometry(1.84, 1.08, 0.05), glass);
    this.backboard.position.set(0, 3.52, COURT.backboardZ);
    this.backboard.castShadow = true;
    this.worldRoot.add(this.backboard);
    const boardFrame = new T.LineSegments(
      new T.EdgesGeometry(new T.BoxGeometry(1.84, 1.08, 0.065)),
      new T.LineBasicMaterial({ color: 0xf8f8ef }),
    );
    boardFrame.position.copy(this.backboard.position);
    this.worldRoot.add(boardFrame);
    const square = new T.LineSegments(
      new T.EdgesGeometry(new T.PlaneGeometry(0.62, 0.46)),
      new T.LineBasicMaterial({ color: 0xffffff }),
    );
    square.position.set(0, 3.34, COURT.backboardZ + 0.033);
    this.worldRoot.add(square);
    this.rim = new T.Mesh(
      new T.TorusGeometry(COURT.rimRadius, 0.027, 12, 56),
      new T.MeshStandardMaterial({ color: 0xf36c21, roughness: 0.3, metalness: 0.58 }),
    );
    this.rim.rotation.x = Math.PI / 2;
    this.rim.position.set(0, COURT.rimY, COURT.basketZ);
    this.rim.castShadow = true;
    this.worldRoot.add(this.rim);
    this._buildNet();

    const shotClockTexture = this._makeCanvasTexture(256, 128, (ctx, canvas) => {
      ctx.fillStyle = "#090b0e";
      ctx.fillRect(0, 0, canvas.width, canvas.height);
      ctx.strokeStyle = "#59616b";
      ctx.lineWidth = 8;
      ctx.strokeRect(4, 4, canvas.width - 8, canvas.height - 8);
      ctx.fillStyle = "#ff5f4c";
      ctx.font = "900 78px Arial Black, Arial";
      ctx.textAlign = "center";
      ctx.textBaseline = "middle";
      ctx.fillText("24", 128, 67);
    });
    const shotClock = new T.Mesh(
      new T.PlaneGeometry(0.72, 0.38),
      new T.MeshBasicMaterial({ map: shotClockTexture, toneMapped: false }),
    );
    shotClock.position.set(0, 4.35, -6.12);
    this.worldRoot.add(shotClock);

    const restrictedArc = [];
    for (let i = 0; i <= 28; i++) {
      const angle = lerp(0.12, Math.PI - 0.12, i / 28);
      restrictedArc.push([Math.cos(angle) * 1.18, COURT.basketZ + Math.sin(angle) * 1.18]);
    }
    addLine(restrictedArc);
    for (const side of [-1, 1]) {
      for (let mark = 0; mark < 4; mark++) {
        const z = -5.12 + mark * 0.42;
        addLine([[side * 2.45, z], [side * 2.7, z]]);
      }
    }

    if (this.venue !== "park") {
    const wallMat = new T.MeshStandardMaterial({ color: 0x080d16, roughness: 0.94 });
    for (const [x, z, width, depth] of [[0, -8.6, 22, 0.7], [-9.35, 0, 0.7, 19], [9.35, 0, 0.7, 19]]) {
      const wall = new T.Mesh(new T.BoxGeometry(width, 7.2, depth), wallMat);
      wall.position.set(x, 3.5, z);
      wall.receiveShadow = true;
      this.worldRoot.add(wall);
    }

    const seatMat = new T.MeshStandardMaterial({ color: 0x121b28, roughness: 0.88 });
    const stepMat = new T.MeshStandardMaterial({ color: 0x202630, roughness: 0.82 });
    for (let row = 0; row < 6; row++) {
      const z = 7.65 + row * 0.58;
      const stand = new T.Mesh(new T.BoxGeometry(18.1, 0.25 + row * 0.34, 0.56), row % 2 ? seatMat : stepMat);
      stand.position.set(0, (0.25 + row * 0.34) / 2, z);
      this.worldRoot.add(stand);
    }
    for (const side of [-1, 1]) {
      for (let row = 0; row < 5; row++) {
        const x = side * (7.9 + row * 0.48);
        const stand = new T.Mesh(new T.BoxGeometry(0.46, 0.24 + row * 0.3, 15.8), row % 2 ? seatMat : stepMat);
        stand.position.set(x, (0.24 + row * 0.3) / 2, 0.1);
        this.worldRoot.add(stand);
      }
    }

    const crowdGeometry = new T.CapsuleGeometry(0.135, 0.34, 2, 6);
    const crowdMaterial = new T.MeshStandardMaterial({ color: 0x65768c, roughness: 0.9, vertexColors: true });
    const crowdHeadGeometry = new T.SphereGeometry(0.12, 7, 5);
    const crowdHeadMaterial = new T.MeshStandardMaterial({ color: 0xa9775c, roughness: 0.94, vertexColors: true });
    const crowdCount = 164;
    const crowd = new T.InstancedMesh(crowdGeometry, crowdMaterial, crowdCount);
    const crowdHeads = new T.InstancedMesh(crowdHeadGeometry, crowdHeadMaterial, crowdCount);
    const dummy = new T.Object3D();
    for (let index = 0; index < crowdCount; index++) {
      if (index < 84) {
        const row = index % 6;
        const column = Math.floor(index / 6);
        dummy.position.set(-7.7 + column * 1.12, 0.72 + row * 0.36, 7.64 + row * 0.58);
      } else {
        const local = index - 84;
        const side = local % 2 ? 1 : -1;
        const row = Math.floor(local / 2) % 5;
        const column = Math.floor(local / 10);
        dummy.position.set(side * (7.92 + row * 0.48), 0.69 + row * 0.34, -5.7 + column * 1.45);
      }
      dummy.rotation.y = index * 0.73;
      dummy.scale.setScalar(0.88 + (index % 5) * 0.04);
      dummy.updateMatrix();
      crowd.setMatrixAt(index, dummy.matrix);
      const bodyY = dummy.position.y;
      const fanScale = dummy.scale.x;
      const fanColors = [0x3d7890, 0x8a4055, 0x2f7a70, 0x9b7140, 0x565d86, 0x8e455e];
      const skinColors = [0x5e3829, 0x82533b, 0xa66f51, 0xc89472, 0xe0b694];
      crowd.setColorAt(index, new T.Color(fanColors[index % fanColors.length]));
      dummy.position.y = bodyY + 0.42 * fanScale;
      dummy.scale.setScalar(fanScale);
      dummy.updateMatrix();
      crowdHeads.setMatrixAt(index, dummy.matrix);
      crowdHeads.setColorAt(index, new T.Color(skinColors[index % skinColors.length]));
    }
    crowd.instanceMatrix.needsUpdate = true;
    crowdHeads.instanceMatrix.needsUpdate = true;
    if (crowd.instanceColor) crowd.instanceColor.needsUpdate = true;
    if (crowdHeads.instanceColor) crowdHeads.instanceColor.needsUpdate = true;
    this.arenaCrowd = crowd;
    this.arenaCrowdHeads = crowdHeads;
    const initialCrowdDensity = resolveQualitySettings(this.qualityTier, devicePixelRatio || 1).crowdDensity;
    crowd.count = Math.max(24, Math.floor(crowdCount * initialCrowdDensity));
    crowdHeads.count = crowd.count;
    this.worldRoot.add(crowd, crowdHeads);

    const bannerMaterial = (color, title, subtitle) => {
      const texture = this._makeCanvasTexture(384, 512, (ctx, canvas) => {
        const gradient = ctx.createLinearGradient(0, 0, 0, canvas.height);
        gradient.addColorStop(0, color);
        gradient.addColorStop(1, "#081019");
        ctx.fillStyle = gradient;
        ctx.fillRect(0, 0, canvas.width, canvas.height);
        ctx.strokeStyle = "rgba(255,255,255,.28)";
        ctx.lineWidth = 10;
        ctx.strokeRect(12, 12, canvas.width - 24, canvas.height - 24);
        ctx.textAlign = "center";
        ctx.fillStyle = "#f5f1e8";
        ctx.font = "900 60px Arial Black, Arial";
        ctx.fillText(title, canvas.width / 2, 218);
        ctx.fillStyle = "#b8c7ce";
        ctx.font = "800 25px Arial, sans-serif";
        ctx.fillText(subtitle, canvas.width / 2, 270);
      });
      return new T.MeshBasicMaterial({ map: texture, toneMapped: false });
    };
    const arenaBanners = [
      [-5.1, "#087d8e", "NOVA", "HOME COURT"],
      [0, "#293344", "NC", "NIGHT LEAGUE"],
      [5.1, "#9d3d35", "ECLIPSE", "CITY SERIES"],
    ];
    for (const [x, color, title, subtitle] of arenaBanners) {
      const banner = new T.Mesh(new T.PlaneGeometry(1.72, 2.28), bannerMaterial(color, title, subtitle));
      banner.position.set(x, 5.55, -8.22);
      this.worldRoot.add(banner);
    }

    const ledTexture = this._makeCanvasTexture(1024, 128, (ctx, canvas) => {
      ctx.fillStyle = "#071018";
      ctx.fillRect(0, 0, canvas.width, canvas.height);
      ctx.font = "900 48px Arial Black, Arial";
      ctx.textBaseline = "middle";
      for (let index = 0; index < 4; index++) {
        ctx.fillStyle = index % 2 ? "#ff8950" : "#55dfeb";
        ctx.fillText(index % 2 ? "NIGHT LEAGUE" : "NOVA COURT", 22 + index * 262, 66);
      }
    });
    const ledMaterial = new T.MeshBasicMaterial({ map: ledTexture, toneMapped: false });
    const backRibbon = new T.Mesh(new T.PlaneGeometry(13.8, 0.76), ledMaterial);
    backRibbon.position.set(0, 4.75, -8.23);
    this.worldRoot.add(backRibbon);
    for (const side of [-1, 1]) {
      const ribbon = new T.Mesh(new T.PlaneGeometry(13.8, 0.62), ledMaterial);
      ribbon.position.set(side * 8.92, 1.15, 0);
      ribbon.rotation.y = side > 0 ? -Math.PI / 2 : Math.PI / 2;
      this.worldRoot.add(ribbon);
    }

    const trussMat = new T.MeshStandardMaterial({ color: 0x343b46, roughness: 0.35, metalness: 0.8 });
    for (const x of [-6, 0, 6]) {
      const truss = new T.Mesh(new T.BoxGeometry(0.12, 0.12, 18), trussMat);
      truss.position.set(x, 7.05, 0);
      this.worldRoot.add(truss);
    }
    }
  }

  _buildNet() {
    const T = this.T;
    const mat = new T.LineBasicMaterial({ color: 0xeaffff, transparent: true, opacity: 0.72 });
    this.netLines = [];
    const strands = 12;
    for (let i = 0; i < strands; i++) {
      const a = (i / strands) * Math.PI * 2;
      const next = ((i + 1) / strands) * Math.PI * 2;
      const pts = [];
      for (let row = 0; row < 5; row++) {
        const t = row / 4;
        const radius = lerp(COURT.rimRadius, 0.115, t);
        const angle = row % 2 ? next : a;
        pts.push(new T.Vector3(
          Math.cos(angle) * radius,
          COURT.rimY - t * 0.48,
          COURT.basketZ + Math.sin(angle) * radius
        ));
      }
      const line = new T.Line(new T.BufferGeometry().setFromPoints(pts), mat);
      line.userData.basePositions = Array.from(line.geometry.attributes.position.array);
      this.worldRoot.add(line);
      this.netLines.push(line);
    }
  }

  _buildBall() {
    const T = this.T;
    this.ballMesh = createBasketballMesh(T, COURT.ballRadius, {
      anisotropy: this.renderer.capabilities.getMaxAnisotropy?.() || 1,
      textureRegistry: this.generatedTextures,
      style: this.options.ballStyle,
    });
    this.worldRoot.add(this.ballMesh);
    this.ball = {
      position: this.ballMesh.position,
      previousPosition: new T.Vector3(),
      velocity: new T.Vector3(),
      angularVelocity: new T.Vector3(),
      owner: null,
      lastOwner: null,
      state: "loose",
      flightTime: 0,
      shotBy: null,
      points: 2,
      shotQuality: 0,
      canScore: false,
      pickupCooldown: 0,
      rimContacts: 0,
      backboardContacts: 0,
      maxBackboardContacts: Infinity,
      rimContactCooldown: 0,
      perfectRelease: false,
      guaranteedMake: false,
      plannedMade: false,
      plannedRimResult: null,
      shotResult: null,
      bankShot: false,
      bankResolved: false,
      freeThrow: false,
      lastTouchedTeamId: null,
      lastTouchedPlayerId: null,
    };
    this.ball.position.set(0.45, 1, 3.7);
  }

  _buildVFXPool() {
    const T = this.T;
    this.particles = [];
    const geo = new T.IcosahedronGeometry(0.035, 0);
    for (let i = 0; i < 52; i++) {
      const material = new T.MeshBasicMaterial({
        color: i % 2 ? 0x6affdf : 0xffcc5c,
        transparent: true, opacity: 0, depthWrite: false, toneMapped: false,
      });
      const mesh = new T.Mesh(geo, material);
      mesh.visible = false;
      this.vfxRoot.add(mesh);
      this.particles.push({
        mesh, velocity: new T.Vector3(), life: 0, maxLife: 1,
      });
    }
    this.aimRing = new T.Mesh(
      new T.RingGeometry(0.28, 0.34, 32),
      new T.MeshBasicMaterial({ color: 0x70ffe1, transparent: true, opacity: 0, depthWrite: false })
    );
    this.aimRing.rotation.x = -Math.PI / 2;
    this.aimRing.position.set(0, 0.028, COURT.basketZ);
    this.vfxRoot.add(this.aimRing);
    this.handleRing = new T.Mesh(
      new T.RingGeometry(0.58, 0.67, 48),
      new T.MeshBasicMaterial({
        color: DRIBBLE_MOVE_CONFIG.hesi.color,
        transparent: true,
        opacity: 0,
        depthWrite: false,
        toneMapped: false,
      }),
    );
    this.handleRing.rotation.x = -Math.PI / 2;
    this.handleRing.position.y = 0.04;
    this.vfxRoot.add(this.handleRing);
    this.scoreRing = new T.Mesh(
      new T.RingGeometry(0.28, 0.35, 56),
      new T.MeshBasicMaterial({
        color: 0x74ffe2,
        transparent: true,
        opacity: 0,
        depthWrite: false,
        side: T.DoubleSide,
        toneMapped: false,
      }),
    );
    this.scoreRing.rotation.x = Math.PI / 2;
    this.scoreRing.position.set(0, COURT.rimY - 0.02, COURT.basketZ);
    this.vfxRoot.add(this.scoreRing);
  }

  _spawnDefaultPlayers(config) {
    const T = this.T;
    const list = config || [
      { id: "ace", name: "Ace", team: "home", controlled: true, position: new T.Vector3(0, 0, 3.7) },
      { id: "rival", name: "Rival", team: "away", isAI: true, position: new T.Vector3(0.5, 0, 0.7) },
    ];
    for (const player of list) this.addPlayer(player);
    const rosterTier = this.players.length > 2 ? this.qualityTier : "balanced";
    for (const player of this.players) player.setVisualQuality(rosterTier);
    const owner = this.controlledPlayer || this.players[0];
    if (owner) this.givePossession(owner, true);
  }

  addPlayer(options = {}) {
    const player = new ProceduralPlayer(this, options);
    player.setVisualQuality("balanced");
    this.players.push(player);
    if (player.controlled) {
      if (this.controlledPlayer) this.controlledPlayer.controlled = false;
      this.controlledPlayer = player;
    }
    this.events.emit("playeradded", { player });
    return player;
  }

  removePlayer(playerOrId) {
    const player = typeof playerOrId === "string"
      ? this.players.find((p) => p.id === playerOrId) : playerOrId;
    if (!player) return false;
    if (this.ball.owner === player) this.releaseBall(player.root.position, new this.T.Vector3());
    this.players.splice(this.players.indexOf(player), 1);
    if (this.controlledPlayer === player) this.controlledPlayer = null;
    player.dispose();
    this.events.emit("playerremoved", { player });
    return true;
  }

  setControlledPlayer(playerOrId) {
    const next = typeof playerOrId === "string"
      ? this.players.find((p) => p.id === playerOrId) : playerOrId;
    if (!next) return false;
    for (const player of this.players) {
      player.controlled = player === next;
      player.marker.material.opacity = player.controlled ? 0.75 : 0;
    }
    this.controlledPlayer = next;
    return true;
  }

  givePossession(player, silent = false) {
    if (!player || this.ball.pickupCooldown > 0) return false;
    const previousOwner = this.ball.lastOwner;
    const completedTeamPass = this.ball.state === "pass"
      && this.ball.passTarget === player
      && previousOwner?.controlled
      && previousOwner.team === player.team;
    if (this.ball.owner && this.ball.owner !== player) this.ball.owner.hasBall = false;
    this.ball.owner = player;
    this.ball.lastOwner = player;
    this.ball.lastTouchedTeamId = player.team;
    this.ball.lastTouchedPlayerId = player.id;
    this.ball.state = "held";
    this.ball.passTarget = null;
    this.ball.velocity.set(0, 0, 0);
    player.hasBall = true;
    this.possessionTeam = player.team;
    this.shotClock = this.mode === "open_gym" ? Infinity : 24;
    this._scoredOnFlight = false;
    if (completedTeamPass) {
      this.setControlledPlayer(player);
      this.events.emit("controlchange", { from: previousOwner, to: player, reason: "completed-pass" });
    }
    if (!silent) this.events.emit("possession", { player, team: player.team });
    return true;
  }

  startFreeThrows({ shooterId, teamId, attempts = 1 } = {}) {
    const shooter = this.players.find((player) => player.id === shooterId)
      || this.players.find((player) => player.team === teamId)
      || this.controlledPlayer;
    if (!shooter) return false;
    this.chargingShot = false;
    this.queuedRelease = null;
    this.activeDunk = null;
    this.shotCharge = 0;
    this.shotInputAction = "shoot";
    const flow = this.freeThrowFlow.start({
      shooterId: shooter.id,
      teamId: teamId || shooter.team,
      attempts,
    });
    const basket = this._basketForTeam(shooter.team);
    const lineDistance = 4.18;
    shooter.root.position.set(
      basket.x,
      0,
      basket.z - basket.attackSign * lineDistance,
    );
    shooter.velocity.set(0, 0, 0);
    shooter.desiredVelocity.set(0, 0, 0);
    this.ball.pickupCooldown = 0;
    this.givePossession(shooter, true);
    this.setControlledPlayer(shooter);
    this.shotClock = Infinity;
    this.events.emit("freethrow", {
      phase: "ready",
      shooter,
      attempts: flow.state.attemptsRemaining,
      prompt: "HOLD SPACE · RELEASE IN GREEN",
    });
    return true;
  }

  releaseBall(position, velocity, state = "loose") {
    const owner = this.ball.owner;
    if (owner) owner.hasBall = false;
    this.ball.lastOwner = owner || this.ball.lastOwner;
    if (owner) {
      this.ball.lastTouchedTeamId = owner.team;
      this.ball.lastTouchedPlayerId = owner.id;
    }
    this.ball.owner = null;
    this.ball.state = state;
    if (state !== "shot") {
      this.ball.guaranteedMake = false;
      this.ball.plannedMade = false;
      this.ball.plannedRimResult = null;
      this.ball.shotResult = null;
      this.ball.bankShot = false;
      this.ball.bankResolved = false;
      this.ball.freeThrow = false;
      this.ball.canScore = false;
    }
    this.ball.position.copy(position);
    this.ball.velocity.copy(velocity);
    this.ball.flightTime = 0;
    this.ball.pickupCooldown = 0.16;
    return owner;
  }

  _handleResize() {
    const width = Math.max(1, this.container.clientWidth || window.innerWidth);
    const height = Math.max(1, this.container.clientHeight || window.innerHeight);
    this.camera.aspect = width / height;
    this.camera.updateProjectionMatrix();
    this.renderer.setSize(width, height, false);
  }

  setMode(mode, rules = {}) {
    this.mode = mode;
    this.rules = { ...(this.rules || {}), ...rules };
    this.events.emit("mode", { mode, rules: this.rules });
    this.reset({ keepMode: true });
  }

  setDifficulty(difficulty) {
    this.difficulty = difficulty;
    this.events.emit("difficulty", { difficulty });
  }

  setUserShootingAssist(value) {
    this.userShootingAssist = normalizeShootingAssist(value);
    this.shotPerfectHalfWidth = userShotPerfectHalfWidth(this.userShootingAssist);
    this.options.userShootingAssist = this.userShootingAssist;
    this.events.emit("shootingassist", this.getShootingAssistSnapshot());
    return this.getShootingAssistSnapshot();
  }

  setBasketballStyle(style) {
    const normalizedStyle = normalizeBasketballStyle(style);
    this.options.ballStyle = normalizedStyle;
    if (this.ballMesh) {
      applyBasketballStyle(this.T, this.ballMesh, normalizedStyle, {
        anisotropy: this.renderer.capabilities.getMaxAnisotropy?.() || 1,
        textureRegistry: this.generatedTextures,
      });
    }
    this.events.emit("basketballstyle", { style: normalizedStyle });
    return normalizedStyle;
  }

  getShootingAssistSnapshot() {
    return Object.freeze({
      value: this.userShootingAssist,
      userPerfectWindowWidth: this.shotPerfectHalfWidth * 2,
      cpuPerfectWindowWidth: SHOT_METER_PERFECT_HALF_WIDTH * 2,
    });
  }

  _shotPerfectHalfWidthFor(player) {
    return shotPerfectHalfWidthForPlayer(player, this.userShootingAssist);
  }

  setCameraMode(mode) {
    const allowed = ["follow", "broadcast", "cinematic", "arc-run"];
    if (!allowed.includes(mode)) return false;
    this.cameraMode = mode;
    this.events.emit("camera", { mode });
    return true;
  }

  cycleCamera() {
    if (this.cameraMode === "arc-run") return "arc-run";
    const modes = ["follow", "broadcast", "cinematic"];
    this.setCameraMode(modes[(modes.indexOf(this.cameraMode) + 1) % modes.length]);
    return this.cameraMode;
  }

  setArcRunRack(rack) {
    this.arcRunRack = rack ? { ...rack } : null;
    return this.arcRunRack;
  }

  beginArcRunGrab({
    position,
    duration = ARC_RUN_GRAB_DURATION,
    rackIndex = 0,
    ballIndex = 0,
  } = {}) {
    const player = this.controlledPlayer;
    if (!player || !position) return null;
    if (this.ball.owner) this.ball.owner.hasBall = false;
    this.ball.owner = null;
    player.hasBall = false;
    this.ball.state = "rack-grab";
    this.ball.velocity.set(0, 0, 0);
    this.ball.position.set(
      Number(position.x) || 0,
      Number(position.y) || 1.01,
      Number(position.z) || 0,
    );
    this.ball.previousPosition.copy(this.ball.position);
    this.ball.pickupCooldown = Math.max(0.2, duration);
    const localStart = this.ball.position.clone()
      .sub(player.root.position)
      .applyAxisAngle(this._upAxis, -player.root.rotation.y);
    const handSign = localStart.x < 0 ? -1 : 1;
    this.activeArcRunGrab = {
      player,
      rackIndex,
      ballIndex,
      startedAt: this.elapsed,
      duration: Math.max(0.2, Number(duration) || ARC_RUN_GRAB_DURATION),
      start: this.ball.position.clone(),
      handSign,
      progress: 0,
      phase: "reach",
    };
    player.arcRunGrab = { progress: 0, handSign };
    player.actionLock = Math.max(player.actionLock, this.activeArcRunGrab.duration);
    player.desiredVelocity.set(0, 0, 0);
    player.velocity.set(0, 0, 0);
    this.controls.setEnabled(false);
    this.events.emit("arcrungrab", this.getArcRunGrabSnapshot());
    return this.getArcRunGrabSnapshot();
  }

  _updateArcRunGrab() {
    const grab = this.activeArcRunGrab;
    if (!grab) return false;
    const progress = clamp((this.elapsed - grab.startedAt) / grab.duration, 0, 1);
    const sample = sampleArcRunGrab(progress, grab.handSign);
    grab.progress = progress;
    grab.phase = sample.phase;
    grab.player.arcRunGrab = { progress, handSign: grab.handSign };
    const target = new this.T.Vector3(grab.handSign * 0.28, 1.16, 0.2)
      .applyAxisAngle(this._upAxis, grab.player.root.rotation.y)
      .add(grab.player.root.position);
    this.ball.position.lerpVectors(grab.start, target, sample.ballBlend);
    this.ball.previousPosition.copy(this.ball.position);
    this.ball.velocity.set(0, 0, 0);
    this.events.emit("arcrungrab", this.getArcRunGrabSnapshot());
    if (progress < 1) return true;
    grab.player.arcRunGrab = null;
    this.activeArcRunGrab = null;
    this.ball.pickupCooldown = 0;
    this.givePossession(grab.player, true);
    this.events.emit("arcrungrabcomplete", {
      rackIndex: grab.rackIndex,
      ballIndex: grab.ballIndex,
    });
    return true;
  }

  setArcRunGrabProgressForQA(progress) {
    if (!this.activeArcRunGrab) return null;
    const safeProgress = clamp(Number(progress) || 0, 0, 0.999);
    this.activeArcRunGrab.startedAt = this.elapsed
      - safeProgress * this.activeArcRunGrab.duration;
    this._updateArcRunGrab();
    this._updateVisuals(0.5);
    this.render();
    return this.getArcRunGrabSnapshot();
  }

  getArcRunGrabSnapshot() {
    const grab = this.activeArcRunGrab;
    if (!grab) return { active: false };
    const sample = sampleArcRunGrab(grab.progress, grab.handSign);
    return {
      active: true,
      rackIndex: grab.rackIndex,
      ballIndex: grab.ballIndex,
      duration: grab.duration,
      progress: grab.progress,
      phase: sample.phase,
      handSign: grab.handSign,
      ballBlend: sample.ballBlend,
      ballPosition: this.ball.position.toArray(),
    };
  }

  getArcRunCameraSnapshot() {
    const player = this.controlledPlayer?.root?.position;
    if (!player) return null;
    const basket = this._basketForTeam(
      this.ball.owner?.team || this.possessionTeam || this.controlledPlayer?.team || "home",
    );
    const planned = createArcRunCameraSnapshot({
      shooter: player,
      basket,
      rack: this.arcRunRack,
    });
    const actualForward = this.cameraTarget.clone().sub(this.camera.position).normalize();
    const plannedForward = this._scratchD
      .set(planned.forward.x, 0, planned.forward.z)
      .normalize();
    return {
      ...planned,
      actualPosition: this.camera.position.toArray(),
      actualTarget: this.cameraTarget.toArray(),
      actualFov: this.camera.fov,
      actualTowardHoopDot: actualForward.x * plannedForward.x
        + actualForward.z * plannedForward.z,
    };
  }

  snapArcRunCameraForQA() {
    if (this.cameraMode !== "arc-run" || !this.controlledPlayer) return null;
    const basket = this._basketForTeam(
      this.ball.owner?.team || this.possessionTeam || this.controlledPlayer.team || "home",
    );
    const snapshot = createArcRunCameraSnapshot({
      shooter: this.controlledPlayer.root.position,
      basket,
      rack: this.arcRunRack,
    });
    this.camera.position.set(
      snapshot.position.x,
      snapshot.position.y,
      snapshot.position.z,
    );
    this.cameraTarget.set(
      snapshot.target.x,
      snapshot.target.y,
      snapshot.target.z,
    );
    this.camera.fov = snapshot.fov;
    this.camera.updateProjectionMatrix();
    this.camera.lookAt(this.cameraTarget);
    return this.getArcRunCameraSnapshot();
  }

  start() {
    if (this.running || this.destroyed) return;
    this.running = true;
    this.paused = false;
    this._lastFrame = performance.now();
    this._raf = requestAnimationFrame((now) => this._frame(now));
    this.events.emit("start", { mode: this.mode });
  }

  stop() {
    if (!this.running) return;
    this.running = false;
    cancelAnimationFrame(this._raf);
    this.events.emit("stop");
  }

  setPaused(paused) {
    this.paused = !!paused;
    // User pause and replay freeze are independent locks. Clearing one must
    // never clear the other or re-enable gameplay during a restoration.
    this.controls.setEnabled(!this.paused && !this.replayFlow.frozen);
    this.events.emit("pause", { paused: this.paused });
  }

  togglePause() { this.setPaused(!this.paused); }

  _frame(now) {
    if (!this.running) return;
    const rawDt = Math.min(0.05, Math.max(0, (now - this._lastFrame) / 1000));
    this._lastFrame = now;
    if (!this.paused) {
      this.presentationUpdate?.(rawDt);
      if (this.replayFlow.frozen) {
        // Replay time belongs to the render loop while gameplay simulation,
        // shot clocks, AI-owned actors, and control output remain frozen.
        this.fixedAccumulator = 0;
        this.controls.setEnabled(false);
        this._updateVisuals(rawDt);
      } else {
        this.controls.update();
        if (this.controls.wasPressed("pause")) this.togglePause();
        else {
          const plan = planFixedSteps(this.fixedAccumulator, rawDt, {
            fixedStep: 1 / 60,
            maxFrameDelta: 0.05,
            maxSubSteps: 3,
            timeScale: this.timeScale,
          });
          for (let step = 0; step < plan.steps; step++) this._fixedUpdate(plan.fixedStep);
          this.fixedAccumulator = plan.nextAccumulator;
          this.physicsDroppedTime += plan.droppedTime;
          this._samplePerformance(rawDt * 1000, now, plan);
          this._updateVisuals(plan.scaledFrameDelta);
        }
      }
    } else {
      // Pause can still be exited from the keyboard even while control output is muted.
      if (this.controls.keys?.has("Escape") || this.controls.keys?.has("KeyP")) {
        this.setPaused(false);
      }
    }
    this.render();
    this._raf = requestAnimationFrame((next) => this._frame(next));
  }

  _samplePerformance(frameTimeMs, now, fixedPlan) {
    if (document.hidden || now < this.performanceWarmupUntil
        || !Number.isFinite(frameTimeMs) || frameTimeMs <= 0) return;
    this.frameTimeSamples.push(frameTimeMs);
    if (this.frameTimeSamples.length > 150) this.frameTimeSamples.shift();
    if (now - this.lastQualityDecisionAt < 5000 || this.frameTimeSamples.length < 120) return;
    const decision = recommendQualityTier(this.frameTimeSamples, this.qualityTier, {
      minimumSamples: 120,
      cooldownReady: true,
    });
    this.lastQualityDecisionAt = now;
    if (decision.changed) {
      this.qualityTier = decision.tier;
      const settings = resolveQualitySettings(this.qualityTier, devicePixelRatio || 1);
      this.renderer.setPixelRatio(settings.pixelRatio);
      this.renderer.shadowMap.enabled = settings.shadows;
      const rosterTier = this.players.length > 2 ? this.qualityTier : "balanced";
      for (const player of this.players) player.setVisualQuality(rosterTier);
      if (this.arenaCrowd) this.arenaCrowd.count = Math.max(24, Math.floor(164 * settings.crowdDensity));
      if (this.arenaCrowdHeads) this.arenaCrowdHeads.count = Math.max(24, Math.floor(164 * settings.crowdDensity));
      this._handleResize();
    }
    if (decision.changed || fixedPlan.saturated || now - this._lastPerformanceEventAt > 10000) {
      this._lastPerformanceEventAt = now;
      this.events.emit("performance", {
        tier: this.qualityTier,
        changed: decision.changed,
        reason: decision.reason,
        p95Ms: decision.stats.p95Ms,
        fps: decision.stats.effectiveFps,
        droppedTime: this.physicsDroppedTime,
      });
    }
    this.frameTimeSamples.length = 0;
  }

  /**
   * Public deterministic step, useful to mode logic, tests, and paused debug tools.
   */
  step(dt) {
    const capped = Math.min(0.05, Math.max(0, dt));
    if (!this.replayFlow.frozen) {
      this.controls.update();
      this._fixedUpdate(capped);
    }
    this._updateVisuals(capped);
    this.render();
  }

  isReplayFrozen() { return this.replayFlow.frozen; }

  _fixedUpdate(dt) {
    if (this.replayFlow.frozen) return;
    this.elapsed += dt;
    for (const athlete of this.players) this._syncPlayerActionTiming(athlete);
    this.deadBallCooldown = Math.max(0, this.deadBallCooldown - dt);
    this.ball.pickupCooldown = Math.max(0, this.ball.pickupCooldown - dt);
    this.shotClock = Math.max(0, this.shotClock - dt);
    const player = this.controlledPlayer;
    if (player) this._updateControlledPlayer(player, dt);
    for (const other of this.players) {
      if (other !== player) this._updateExternalPlayer(other, dt);
      this._integratePlayer(other, dt);
    }
    this._resolvePlayerSeparation();
    this._updateDunkChoreography();
    if (this.queuedRelease && this.queuedRelease.player.hasBall &&
        this.queuedRelease.player.jumpVelocity <= this.shotApexTolerance) {
      const queued = this.queuedRelease;
      this.queuedRelease = null;
      this.releaseShot(queued.player, { ...queued.override, atApex: true });
    }
    this._updateBall(dt);
    this._recordReplayFrame();
    if (this.highlightPending > 0) {
      const duration = this.highlightPending;
      this.highlightPending = 0;
      this.queueHighlight(duration);
    }
    if (this.shotClock === 0) {
      this.shotClock = 24;
      this.events.emit("violation", { violation: "shot-clock", team: this.possessionTeam });
    }
  }

  _updateControlledPlayer(player, dt) {
    if (player.metadata.inbounder) {
      player.desiredVelocity.set(0, 0, 0);
      if (this.controls.wasPressed("pass") && player.hasBall) this.pass(player);
      if (this.controls.wasPressed("camera")) this.cycleCamera();
      if (this.controls.wasPressed("restart")) this.events.emit("restartrequest", { mode: this.mode });
      this.events.emit("stamina", { player, value: player.stamina });
      return;
    }
    const input = this.controls.move;
    const sprinting = this.controls.isDown("sprint") && player.stamina > 0.04;
    const maxSpeed = player.speed * (sprinting ? 1.34 : 1);
    player.desiredVelocity.set(input.x * maxSpeed, 0, input.y * maxSpeed);
    if (this.chargingShot) {
      player.desiredVelocity.multiplyScalar(0.08);
      this._facePlayerToBasket(player);
    } else if (input.magnitude > 0.08) {
      player.facing.x = damp(player.facing.x, input.x, 10, dt);
      player.facing.z = damp(player.facing.z, input.y, 10, dt);
      player.facing.normalize();
      if (player.grounded && player.actionLock <= 0 && !this.chargingShot) {
        player.setState(sprinting ? PLAYER_STATES.SPRINT : (player.hasBall ? PLAYER_STATES.DRIBBLE : PLAYER_STATES.RUN));
      }
    } else if (player.grounded && player.actionLock <= 0 && !this.chargingShot) {
      player.desiredVelocity.set(0, 0, 0);
      player.setState(player.hasBall ? PLAYER_STATES.DRIBBLE : PLAYER_STATES.IDLE);
    }
    if (sprinting && input.magnitude > 0.25) player.stamina = Math.max(0, player.stamina - dt * 0.115);
    else player.stamina = Math.min(1, player.stamina + dt * 0.072);

    if (this.controls.wasPressed("modifier") && player.hasBall && !this.chargingShot) {
      const inputAt = this.elapsed;
      const doubleTap = inputAt - player.lastHandleInputAt <= 0.44;
      player.lastHandleInputAt = inputAt;
      const move = sprinting
        ? (Math.abs(input.x) > 0.32 ? "doubleCross"
          : input.y > 0.32 ? "snatchBack"
            : input.y < -0.32 ? "shamgod" : "spin")
        : (doubleTap ? "inOut"
          : Math.abs(input.x) > 0.32 ? "crossover"
            : input.y > 0.32 ? "behindBack"
              : input.y < -0.32 ? "betweenLegs" : "hesi");
      this.performDribbleMove(player, move);
    }
    const basket = this._basketForTeam(player.team);
    const contextualI = resolveContextualIAction({
      hasBall: player.hasBall,
      isOffense: player.team === this.possessionTeam,
      distanceToRim: Math.hypot(
        basket.x - player.root.position.x,
        basket.z - player.root.position.z,
      ),
      stamina: player.stamina,
      actionLocked: player.actionLock > 0,
    });
    if (this.controls.wasPressed("dunk")
        && contextualI.action === CONTEXTUAL_I_ACTIONS.DUNK
        && !this.chargingShot) {
      this.beginShot(player, "dunk", "dunk");
      this.events.emit("contextualaction", { player, ...contextualI });
    }
    if (this.controls.wasPressed("shoot") && player.hasBall && !this.chargingShot) {
      this.beginShot(player, this.freeThrowFlow.active ? "free_throw" : null, "shoot");
    }
    const chargeAction = this.shotInputAction || "shoot";
    if (this.chargingShot && this.controls.isDown(chargeAction)) this.holdShot(dt);
    if (this.chargingShot && this.controls.wasReleased(chargeAction)) this.releaseShot(player);
    if (this.controls.wasPressed("pass") && player.hasBall) this.pass(player);
    this._handleControlledStealInput(player, contextualI);
    if (this.controls.wasPressed("defend") && !player.hasBall) this.attemptBlock(player);
    if (this.controls.wasPressed("camera")) this.cycleCamera();
    if (this.controls.wasPressed("restart")) this.events.emit("restartrequest", { mode: this.mode });
    this.events.emit("stamina", { player, value: player.stamina });
  }

  _updateExternalPlayer(player, dt) {
    // AI systems may assign desiredVelocity/facing/state each frame. This fallback
    // keeps un-driven defenders readable without trying to replace a real AI layer.
    if (!player.isAI || player.metadata.externallyDriven) return;
    const focus = this.ball.owner || this.controlledPlayer;
    if (!focus) {
      player.desiredVelocity.multiplyScalar(0);
      return;
    }
    const delta = new this.T.Vector3().subVectors(focus.root.position, player.root.position);
    const desiredDistance = focus.hasBall ? 1.35 : 2.1;
    const distance = delta.length();
    delta.y = 0;
    if (distance > desiredDistance + 0.25) {
      delta.normalize();
      player.desiredVelocity.copy(delta).multiplyScalar(player.speed * 0.66);
      player.facing.lerp(delta, clamp(dt * 7, 0, 1)).normalize();
      if (player.grounded && player.actionLock <= 0) player.setState(PLAYER_STATES.RUN);
    } else {
      player.desiredVelocity.multiplyScalar(Math.exp(-8 * dt));
      if (delta.lengthSq() > 0.01) player.facing.lerp(delta.normalize(), clamp(dt * 8, 0, 1)).normalize();
      if (player.grounded && player.actionLock <= 0) player.setState(PLAYER_STATES.DEFEND);
      if (focus.hasBall && player.stealCooldown <= 0 && Math.random() < dt * this._difficultyValue(0.18, 0.32, 0.48)) {
        this.attemptSteal(player);
      }
    }
  }

  _difficultyValue(rookie, pro, legend) {
    if (this.difficulty === "rookie") return rookie;
    if (this.difficulty === "legend") return legend;
    return pro;
  }

  _handleControlledStealInput(player, contextualAction) {
    if (!this.controls.wasPressed("steal")
        || contextualAction?.action !== CONTEXTUAL_I_ACTIONS.STEAL) return false;
    this.attemptSteal(player, { source: "user" });
    return true;
  }

  _integratePlayer(player, dt) {
    const accel = player.grounded ? 13 : 4;
    player.velocity.x = damp(player.velocity.x, player.desiredVelocity.x, accel, dt);
    player.velocity.z = damp(player.velocity.z, player.desiredVelocity.z, accel, dt);
    if (!player.grounded) {
      if (this.elapsed < player.rimHangUntil) {
        player.root.position.lerp(player.rimHangAnchor, animationDampingFactor(18, dt));
        player.velocity.multiplyScalar(Math.exp(-10 * dt));
        player.jumpVelocity = 0;
      } else {
        player.jumpVelocity -= 9.81 * dt;
        player.root.position.y += player.jumpVelocity * dt;
        if (player.root.position.y <= 0) {
          const landingSpeed = Math.abs(player.jumpVelocity);
          player.root.position.y = 0;
          player.jumpVelocity = 0;
          player.grounded = true;
          player.landingImpact = clamp(landingSpeed / 6.2, 0.18, 1);
          this._burst(player.root.position.clone().add(new this.T.Vector3(0, 0.06, 0)), 5, 0xcdfdff, 0.65);
        }
      }
    }
    const previousX = player.root.position.x;
    const previousZ = player.root.position.z;
    player.root.position.addScaledVector(player.velocity, dt);
    if (
      player.hasBall
      && !player.metadata.inbounder
      && this.deadBallCooldown <= 0
      && shouldEnforceOutOfBounds(this.mode)
    ) {
      const resolution = resolveOutOfBounds({
        position: { x: player.root.position.x, z: player.root.position.z },
        previousPosition: { x: previousX, z: previousZ },
        court: { width: this.courtRuntime.width, length: this.courtRuntime.length },
        radius: player.radius,
        modeId: this.mode,
        possessionTeamId: this.possessionTeam,
        lastTouchedTeamId: player.team,
        lastTouchedPlayerId: player.id,
        possessionId: Math.floor(this.elapsed * 10),
        sequence: ++this.rulesSequence,
      });
      if (resolution.occurred) {
        this.deadBallCooldown = 0.7;
        this.events.emit("outofbounds", { ...resolution.event, consequence: resolution.consequence });
      }
    }
    if (player.metadata.inbounder) {
      player.velocity.set(0, 0, 0);
      player.desiredVelocity.set(0, 0, 0);
    } else {
      const edge = player.radius + 0.13;
      const clampedPosition = clampPlayerToRuntime(this.courtRuntime, player.root.position, edge);
      player.root.position.x = clampedPosition.x;
      player.root.position.z = clampedPosition.z;
    }
    if (player.facing.lengthSq() > 0.01) {
      const targetRotation = Math.atan2(player.facing.x, player.facing.z);
      let diff = targetRotation - player.root.rotation.y;
      diff = Math.atan2(Math.sin(diff), Math.cos(diff));
      const turnRate = player.grounded ? (player.state === PLAYER_STATES.DEFEND ? 9 : 10.5) : 5.5;
      player.root.rotation.y += diff * animationDampingFactor(turnRate, dt);
    }
  }

  _resolvePlayerSeparation() {
    for (let i = 0; i < this.players.length; i++) {
      for (let j = i + 1; j < this.players.length; j++) {
        const a = this.players[i];
        const b = this.players[j];
        const dx = b.root.position.x - a.root.position.x;
        const dz = b.root.position.z - a.root.position.z;
        const dist = Math.hypot(dx, dz);
        const minDist = a.radius + b.radius;
        if (dist > 0.001 && dist < minDist) {
          const push = (minDist - dist) * 0.5;
          const nx = dx / dist;
          const nz = dz / dist;
          a.root.position.x -= nx * push;
          a.root.position.z -= nz * push;
          b.root.position.x += nx * push;
          b.root.position.z += nz * push;
        }
      }
    }
  }

  _ballTargetInPlayerSpace(player) {
    return this._scratchC.copy(this.ball.position)
      .sub(player.root.position)
      .applyAxisAngle(this._upAxis, -player.root.rotation.y);
  }

  _samplePlayerHandleTarget(player, now = this.elapsed) {
    if (!player.dribbleMove || player.dribbleMoveDuration <= 0) return null;
    const progress = sampleActionProgress(player.dribbleMoveStartedAt, player.dribbleMoveDuration, now);
    let target = getDribbleMovePath(player.dribbleMove, progress, player.dribbleMoveStartHand);
    const transition = player.dribbleTransition;
    if (transition) {
      const transitionProgress = sampleActionProgress(transition.startedAt, transition.duration, now);
      target = blendHandleTargets(transition.fromTarget, target, transitionProgress);
      if (transitionProgress >= 1) player.dribbleTransition = null;
    }
    return target;
  }

  _commitDribbleHand(player) {
    if (!player.dribbleMove || player.dribbleMoveHandCommitted) return;
    const config = DRIBBLE_MOVE_CONFIG[player.dribbleMove];
    if (config?.switchesHand) player.dribbleHand = -player.dribbleMoveStartHand;
    player.dribbleMoveHandCommitted = true;
  }

  _applyDribbleMomentum(player, type) {
    const forward = this._scratchA.copy(player.facing).setY(0).normalize();
    const lateral = this._scratchB.set(forward.z, 0, -forward.x);
    if (type === "crossover") player.velocity.addScaledVector(lateral, player.dribbleMoveStartHand * -2.25);
    else if (type === "behindBack") player.velocity.addScaledVector(forward, -1.75);
    else if (type === "betweenLegs") player.velocity.addScaledVector(forward, 2.15);
    else if (type === "inOut") {
      player.velocity.addScaledVector(lateral, player.dribbleMoveStartHand * 0.9);
      player.velocity.addScaledVector(forward, 0.55);
    } else if (type === "doubleCross") {
      player.velocity.addScaledVector(lateral, player.dribbleMoveStartHand * -1.05);
      player.velocity.multiplyScalar(0.82);
    } else if (type === "spin") {
      player.velocity.addScaledVector(lateral, player.dribbleMoveStartHand * 1.45);
      player.velocity.addScaledVector(forward, 1.1);
    } else if (type === "snatchBack") {
      player.velocity.multiplyScalar(0.22);
      player.velocity.addScaledVector(forward, -3.0);
    } else if (type === "shamgod") {
      player.velocity.addScaledVector(lateral, player.dribbleMoveStartHand * -2.85);
      player.velocity.addScaledVector(forward, 1.0);
    } else player.velocity.multiplyScalar(0.28);
  }

  _startDribbleMove(player, type, chained = false) {
    const config = DRIBBLE_MOVE_CONFIG[type];
    if (!config) return false;
    const localTarget = this._ballTargetInPlayerSpace(player);
    const fromTarget = {
      side: localTarget.x,
      height: localTarget.y,
      forward: localTarget.z,
      endHand: player.dribbleHand,
    };
    player.dribbleMove = type;
    player.dribbleMoveDuration = config.duration;
    player.dribbleMoveStartedAt = this.elapsed;
    player.dribbleMoveProgress = 0;
    player.dribbleMoveTime = config.duration;
    player.dribbleMoveStartHand = player.dribbleHand;
    player.dribbleMoveHandCommitted = !config.switchesHand;
    player.dribbleTransition = {
      fromTarget,
      startedAt: this.elapsed,
      duration: chained ? 0.13 : 0.09,
    };
    player.queuedDribbleMove = null;
    player.dribbleMoveColor = config.color;
    player.handleTrailTimer = 0;
    player.actionLock = config.duration * 0.58;
    this._applyDribbleMomentum(player, type);
    const comboLinked = chained || this.elapsed - player.lastHandleMoveAt < 0.95;
    player.handleComboCount = comboLinked ? Math.min(9, player.handleComboCount + 1) : 1;
    player.lastHandleMoveAt = this.elapsed;
    player.setState(PLAYER_STATES.DRIBBLE, true);
    this._burst(this.ball.position, config.burst, config.color, type === "hesi" ? 0.5 : 0.72);
    this.handleFlash = 1;
    this.handleRing.position.copy(player.root.position);
    this.handleRing.position.y = 0.04;
    this.handleRing.material.color.setHex(config.color);
    this.handleRing.material.opacity = 0.72;
    this.handleRing.scale.setScalar(0.72);
    this.cameraShake = Math.max(this.cameraShake, type === "spin" || type === "shamgod" ? 0.055 : 0.025);
    this.controls.rumble(type === "spin" || type === "shamgod" ? 0.32 : 0.2, 52);
    this.events.emit("dribblemove", {
      player,
      move: type,
      duration: config.duration,
      combo: player.handleComboCount,
      chained: comboLinked,
    });
    return true;
  }

  _syncPlayerActionTiming(player) {
    if (!player.hasBall) {
      player.queuedDribbleMove = null;
      player.dribbleTransition = null;
      player.dribbleMove = null;
      player.dribbleMoveTime = 0;
      return;
    }
    if (!player.dribbleMove || player.dribbleMoveDuration <= 0) return;
    const progress = sampleActionProgress(player.dribbleMoveStartedAt, player.dribbleMoveDuration, this.elapsed);
    player.dribbleMoveProgress = progress;
    player.dribbleMoveTime = Math.max(0, player.dribbleMoveDuration * (1 - progress));
    if (progress >= 0.52) this._commitDribbleHand(player);
    if (player.queuedDribbleMove && progress >= 0.68) {
      const queuedType = player.queuedDribbleMove.type;
      this._startDribbleMove(player, queuedType, true);
      return;
    }
    if (progress >= 1) {
      if (player.dribbleMove === "spin") player.hips.rotation.y = 0;
      this._commitDribbleHand(player);
      player.dribbleMove = null;
      player.dribbleMoveTime = 0;
      player.dribbleMoveProgress = 1;
      player.dribbleTransition = null;
    }
  }

  performDribbleMove(player = this.controlledPlayer, type = "hesi") {
    const config = DRIBBLE_MOVE_CONFIG[type];
    if (!player?.hasBall || !config || this.chargingShot) return false;
    if (player.dribbleMove && player.dribbleMoveTime > 0) {
      player.queuedDribbleMove = { type, queuedAt: this.elapsed };
      this.events.emit("dribblequeue", {
        player,
        move: type,
        after: player.dribbleMove,
      });
      if (player.dribbleMoveProgress >= 0.68) {
        return this._startDribbleMove(player, type, true);
      }
      return true;
    }
    if (player.actionLock > 0) return false;
    return this._startDribbleMove(player, type, false);
  }

  _dunkSelectionContext(player, contextual = false) {
    const defenders = this.players.filter((candidate) => candidate.team !== player.team);
    const basket = this._basketForTeam(player.team);
    let nearest = null;
    let nearestDistance = Infinity;
    for (const defender of defenders) {
      const distance = defender.root.position.distanceTo(player.root.position);
      if (distance < nearestDistance) {
        nearest = defender;
        nearestDistance = distance;
      }
    }
    const basketDirection = new this.T.Vector3(
      basket.x - player.root.position.x,
      0,
      basket.z - player.root.position.z,
    );
    if (basketDirection.lengthSq() > 1e-6) basketDirection.normalize();
    const approachVelocity = contextual && player.velocity.length() < 1.8
      ? basketDirection.multiplyScalar(2.15)
      : player.velocity;
    return {
      playerPosition: { x: player.root.position.x, z: player.root.position.z },
      rimPosition: { x: basket.x, z: basket.z },
      velocity: { x: approachVelocity.x, z: approachVelocity.z },
      stamina: player.stamina,
      defenderContest: nearest ? clamp((1.65 - nearestDistance) / 1.35, 0, 1) : 0,
      traffic: defenders.filter((defender) =>
        defender.root.position.distanceTo(player.root.position) < 1.8).length / 3,
      finishRating: player.metadata.finishing ?? 0.78,
      vertical: player.metadata.vertical ?? (player.height > 2 ? 0.82 : 0.74),
      strength: player.metadata.strength ?? (player.metadata.role === "big" ? 0.88 : 0.7),
      ballSecurity: player.metadata.ballSecurity ?? 0.76,
      handedness: player.shootingHand,
      canDunk: true,
    };
  }

  _beginDunkChoreography(player, quality = 0.82, override = {}) {
    const selection = selectDunkChoreography(
      this._dunkSelectionContext(player, override.contextualDunk === true),
    );
    if (!selection.eligible) {
      this.events.emit("dunkstyle", {
        player,
        style: selection.type,
        accepted: false,
        fallback: "layup",
        reason: selection.reason,
      });
      this.shotContext = "layup";
      return this.releaseShot(player, {
        ...override,
        context: "layup",
        quality,
        immediate: true,
        choreographyRelease: true,
      });
    }
    player.dunkSelection = selection;
    player.dunkProgress = 0;
    player.dunkStartedAt = this.elapsed;
    player.dribbleHand = selection.finishHand || player.shootingHand;
    player.setState(PLAYER_STATES.DUNK, true);
    player.jumpVelocity = 4.8;
    player.grounded = false;
    player.actionLock = selection.duration + 0.16;
    player.desiredVelocity.multiplyScalar(0.32);
    this.aimRing.material.opacity = 0;
    this.activeDunk = {
      player,
      selection,
      quality,
      override,
      released: false,
    };
    this.events.emit("dunkstyle", {
      player,
      style: selection.type,
      accepted: true,
      finishHand: selection.finishHand,
      duration: selection.duration,
    });
    return true;
  }

  _updateDunkChoreography() {
    const active = this.activeDunk;
    if (!active) return;
    const { player, selection } = active;
    const basket = this._basketForTeam(player.team);
    if (!player || !player.dunkSelection) {
      this.activeDunk = null;
      return;
    }
    player.dunkProgress = clamp(
      (this.elapsed - player.dunkStartedAt) / selection.duration,
      0,
      1,
    );
    if (!active.released && player.dunkProgress >= selection.milestones.release) {
      active.released = true;
      player.rimHangAnchor.set(clamp(player.root.position.x, basket.x - 0.2, basket.x + 0.2), Math.max(0.9, player.root.position.y), basket.z - basket.attackSign * 0.46);
      player.rimHangUntil = this.elapsed + 0.32;
      this.events.emit("rimhang", { player, duration: 0.32, style: selection.type });
      const released = this.releaseShot(player, {
        ...active.override,
        context: "dunk",
        quality: active.quality,
        immediate: true,
        choreographyRelease: true,
      });
      this.events.emit("dunkfinish", {
        player,
        style: selection.type,
        outcome: released ? "released" : "cancelled",
        progress: player.dunkProgress,
      });
    }
    if (player.dunkProgress >= 1) {
      player.dunkSelection = null;
      player.dunkProgress = 1;
      this.activeDunk = null;
    }
  }

  _getShotCoverage(player, releasePosition = null) {
    const shooterPosition = releasePosition || player.root.position;
    const basket = this._basketForTeam(player.team);
    const rimPosition = { x: basket.x, y: basket.y, z: basket.z };
    const defenders = this.players
      .filter((candidate) => candidate !== player && candidate.team !== player.team)
      .map((defender) => {
        const activeBlock = defender.blockWindow > 0;
        const isContesting = activeBlock || defender.state === PLAYER_STATES.DEFEND;
        return {
          id: defender.id,
          position: {
            x: defender.root.position.x,
            y: defender.root.position.y,
            z: defender.root.position.z,
          },
          height: defender.height,
          vertical: defender.metadata?.vertical ?? (defender.height > 2 ? 0.82 : 0.68),
          reach: clamp(defender.height / 2.14, 0.56, 1),
          contestTiming: activeBlock ? 0.025 : isContesting ? 0.18 : 0.5,
          blockWindow: defender.blockWindow,
          isContesting,
          contestIntent: activeBlock ? 1 : isContesting ? 0.82 : 0.34,
          handPosition: {
            x: defender.root.position.x,
            y: defender.root.position.y + (activeBlock ? 2.28 : 1.78),
            z: defender.root.position.z,
          },
        };
      });
    return calculateShotCoverage({
      shooterPosition: {
        x: shooterPosition.x,
        y: shooterPosition.y,
        z: shooterPosition.z,
      },
      rimPosition,
      releaseHeight: shooterPosition.y,
      defenders,
    });
  }

  _getShotPercentage(player, quality, perfectRelease, releasePosition = null, shotContext = null) {
    const basket = this._basketForTeam(player.team);
    const position = releasePosition || player.root.position;
    const coverageResult = this._getShotCoverage(player, position);
    const ratings = player.metadata?.ratings || player.metadata || {};
    const shooting = ratings.shooting ?? player.metadata?.shooting ?? 0.68;
    return {
      coverageResult,
      percentage: calculateShotMakePercentage({
        coverageResult,
        releaseQuality: quality,
        perfectRelease,
        shooterPosition: position,
        rimPosition: { x: basket.x, y: basket.y, z: basket.z },
        ratings: {
          ...ratings,
          shooting,
          finishing: ratings.finishing ?? player.metadata?.finishing ?? shooting,
          closeShot: ratings.closeShot ?? player.metadata?.closeShot,
          drivingLayup: ratings.drivingLayup ?? player.metadata?.drivingLayup,
          drivingDunk: ratings.drivingDunk ?? player.metadata?.drivingDunk,
          midRange: ratings.midRange ?? ratings.mid ?? shooting,
          threePoint: ratings.threePoint ?? ratings.three ?? shooting,
          freeThrow: ratings.freeThrow ?? player.metadata?.freeThrow,
        },
        stamina: player.stamina,
        difficulty: this.difficulty,
        isAI: player.isAI,
        userControlled: player.controlled === true,
        shotContext: shotContext || this.shotContext || "jumper",
        movementSpeed: Math.hypot(player.velocity.x, player.velocity.z),
        threePointDistance: this.courtRuntime.threePointRadius,
      }),
    };
  }

  beginShot(player = this.controlledPlayer, forcedContext = null, inputAction = "shoot") {
    if (!player?.hasBall || this.chargingShot || player.actionLock > 0) return false;
    this.chargingShot = true;
    this.shotCharge = 0;
    this.shotInputAction = inputAction;
    this.queuedRelease = null;
    this.shotContext = forcedContext || this._shotContext(player);
    if (this.shotContext === "free_throw") this.freeThrowFlow.beginCharge();
    player.queuedDribbleMove = null;
    player.dribbleTransition = null;
    player.dribbleMove = null;
    player.dribbleMoveTime = 0;
    player.shotReleased = false;
    player.shotElapsed = 0;
    player.shotReleaseElapsed = 0;
    player.shotStartedAt = this.elapsed;
    player.shotReleasedAt = -Infinity;
    this._facePlayerToBasket(player);
    player.setState(PLAYER_STATES.SHOOT, true);
    player.desiredVelocity.multiplyScalar(0.18);
    if (this.shotContext === "jumper" || this.shotContext === "free_throw") {
      player.jumpVelocity = 4.5;
      player.grounded = false;
      player.actionLock = 0.58;
    }
    this.aimRing.material.opacity = 0.75;
    this.events.emit("shotstart", {
      player,
      context: this.shotContext,
      inputAction: this.shotInputAction,
    });
    return true;
  }

  holdShot(dt) {
    if (!this.chargingShot) return;
    this.shotCharge = Math.min(1.25, this.shotCharge + dt * 1.48);
    const player = this.controlledPlayer;
    const perfectHalfWidth = this._shotPerfectHalfWidthFor(player);
    const meterWindow = resolveShotMeterWindow(
      this.shotCharge,
      this.shotIdeal,
      perfectHalfWidth,
    );
    const meterQuality = 1 - clamp(Math.abs(this.shotCharge - this.shotIdeal) / 0.45, 0, 1);
    const apexQuality = player && this.shotContext === "jumper" && !player.grounded
      ? apexReleaseQuality(player.jumpVelocity) : 0;
    const quality = meterQuality;
    const perfectRelease = meterWindow.perfect;
    this.lastShotQuality = quality;
    this.aimRing.material.color.setHex(quality > 0.9 ? 0x72ff9b : quality > 0.48 ? 0xffd45b : 0xff5475);
    this.aimRing.material.opacity = 0.45 + quality * 0.45;
    this.aimRing.scale.setScalar(0.82 + this.shotCharge * 0.48);
    const previewPosition = player ? player.worldHandPosition(new this.T.Vector3(), player.shootingHand) : null;
    const preview = player
      ? this._getShotPercentage(player, quality, perfectRelease, previewPosition, this.shotContext)
      : null;
    this.events.emit("shotmeter", {
      context: this.shotContext,
      charge: meterWindow.charge,
      quality,
      perfectRelease,
      apex: apexQuality > 0.91,
      perfectWindowStart: meterWindow.start,
      perfectWindowWidth: meterWindow.width,
      jumpVelocity: player?.jumpVelocity || 0,
      makeProbability: preview?.percentage.makeProbability ?? 0,
      makePercent: preview?.percentage.makePercent ?? 0,
      coverage: preview?.coverageResult.coverage ?? 0,
      coverageLabel: preview?.coverageResult.displayLabel ?? "WIDE OPEN",
      hud: preview?.percentage.hud ?? null,
    });
  }

  _shotContext(player) {
    const basket = this._basketForTeam(player.team);
    const dx = basket.x - player.root.position.x;
    const dz = basket.z - player.root.position.z;
    const distance = Math.hypot(dx, dz);
    const speed = Math.hypot(player.velocity.x, player.velocity.z);
    if (distance < 1.55 && speed > 2.2 && player.stamina > 0.18) return "dunk";
    if (distance < 2.0) return "layup";
    return "jumper";
  }

  _facePlayerToBasket(player) {
    if (!player) return;
    const basket = this._basketForTeam(player.team);
    const direction = shotFacingDirection(player.root.position, basket);
    player.facing.set(direction.x, 0, direction.z).normalize();
    player.root.rotation.y = Math.atan2(player.facing.x, player.facing.z);
  }

  releaseShot(player = this.controlledPlayer, override = {}) {
    if (!this.chargingShot || !player?.hasBall) return false;
    const context = override.context || this.shotContext || this._shotContext(player);
    const perfectHalfWidth = this._shotPerfectHalfWidthFor(player);
    const meterWindow = resolveShotMeterWindow(
      this.shotCharge,
      this.shotIdeal,
      perfectHalfWidth,
    );
    if (context === "dunk" && !override.choreographyRelease) {
      const timingQuality = override.quality
        ?? (1 - clamp(Math.abs(this.shotCharge - this.shotIdeal) / 0.45, 0, 1));
      return this._beginDunkChoreography(player, timingQuality, {
        ...override,
        contextualDunk: this.shotInputAction === "dunk",
      });
    }
    const meterQuality = 1 - clamp(Math.abs(this.shotCharge - this.shotIdeal) / 0.45, 0, 1);
    if (context === "jumper" && !override.immediate && !override.atApex &&
        !player.grounded && player.jumpVelocity > this.shotApexTolerance) {
      this.queuedRelease = {
        player,
        override: {
          ...override,
          quality: override.quality ?? meterQuality,
          perfectRelease: override.perfectRelease ?? meterWindow.perfect,
        },
      };
      this.events.emit("shotqueued", { player, context, until: "apex" });
      return true;
    }
    this.queuedRelease = null;
    this.chargingShot = false;
    this.aimRing.material.opacity = 0;
    const atApex = !!override.atApex ||
      (context === "jumper" && !player.grounded && Math.abs(player.jumpVelocity) <= this.shotApexTolerance);
    const quality = override.quality ?? meterQuality;
    const perfectRelease = override.perfectRelease ?? meterWindow.perfect;
    this._facePlayerToBasket(player);
    const releaseHand = context === "dunk" && player.dunkSelection?.finishHand
      ? player.dunkSelection.finishHand
      : player.shootingHand;
    const start = player.worldHandPosition(new this.T.Vector3(), releaseHand);
    const shotModel = this._getShotPercentage(player, quality, perfectRelease, start, context);
    const layupPlan = context === "layup"
      ? planLayupBank({
        shooterPosition: player.root.position,
        rimPosition: this._basketForTeam(player.team),
        backboardZ: this._basketForTeam(player.team).backboardZ,
        attackSign: this._basketForTeam(player.team).attackSign,
        contested: shotModel.coverageResult.coverage > 0.08,
      })
      : null;
    const ratings = player.metadata?.ratings || player.metadata || {};
    const freeThrowResult = context === "free_throw"
      ? this.freeThrowFlow.release({
        charge: this.shotCharge,
        rating: normalizeGameplayRating(ratings.freeThrow, ratings.shooting ?? 0.7),
        outcomeValue: Math.random(),
        halfWidth: perfectHalfWidth,
      })
      : null;
    const freeThrowPercentage = context === "free_throw"
      ? {
        makeProbability: freeThrowResult?.makeProbability ?? 0,
        makePercent: 0,
        guaranteed: freeThrowResult?.guaranteed === true,
        coverage: 0,
        releaseQuality: freeThrowResult?.timingQuality ?? quality,
        coverageLabel: "wide_open",
        rangeLabel: "free_throw",
        hud: {
          makePercent: perfectRelease ? "100%" : `${Math.round(clamp(0.18 + normalizeGameplayRating(ratings.freeThrow, ratings.shooting ?? 0.7) * 0.5 + quality * 0.25, 0.18, 0.88) * 100)}%`,
          coverageLabel: "FREE THROW",
          coveragePercent: "0% COVERED",
          releaseLabel: perfectRelease ? "PERFECT" : "TIMED",
          rangeLabel: "FREE THROW",
        },
      }
      : null;
    if (freeThrowPercentage) {
      freeThrowPercentage.makePercent = Math.round(freeThrowPercentage.makeProbability * 100);
    }
    const forcedFinishPercentage = context === "dunk" && perfectRelease
      ? {
        ...shotModel.percentage,
        makeProbability: 1,
        makePercent: 100,
        guaranteed: true,
      }
      : null;
    const shotResult = resolveShotAttempt({
      percentageResult: freeThrowPercentage || forcedFinishPercentage || shotModel.percentage,
      outcomeValue: freeThrowResult
        ? (freeThrowResult.made ? 0 : 1)
        : Math.random(),
      rimValue: context === "layup" ? 0.05 : Math.random(),
      bankIntent: context === "layup" ? 1 : 0,
      bankAngleQuality: context === "layup" ? 1 : 0.7,
    });
    const basket = this._basketForTeam(player.team);
    const target = new this.T.Vector3(basket.x, basket.y + 0.05, basket.z);
    const aim = this.controls.aim;
    const missSide = aim.x < -0.05 ? -1 : aim.x > 0.05 ? 1 : (Math.random() < 0.5 ? -1 : 1);
    if (layupPlan || shotResult.rim.result === RIM_RESULTS.BANK) {
      const bankTarget = layupPlan?.target || {
        x: clamp(player.root.position.x * 0.16, -0.34, 0.34),
        y: basket.y + 0.48,
        z: basket.backboardZ + basket.attackSign * 0.02,
      };
      target.set(bankTarget.x, bankTarget.y, bankTarget.z);
    } else if (shotResult.rim.result === RIM_RESULTS.RIM_OUT) {
      target.x = missSide * rand(0.3, 0.39);
      target.z += rand(-0.08, 0.08);
    } else if (shotResult.rim.result === RIM_RESULTS.SOFT_RIM_IN) {
      target.x = missSide * rand(0.125, 0.16);
      target.z += rand(-0.035, 0.035);
    } else if (!atApex && aim.magnitude > 0.2) {
      target.x += aim.x * 0.12;
      target.z += aim.y * 0.08;
    }
    const error = shotResult.made ? 0 : (1 - quality) ** 1.45;
    if (shotResult.rim.result !== RIM_RESULTS.BANK) {
      target.x += rand(-0.12, 0.12) * error;
      target.z += rand(-0.1, 0.1) * error;
    }
    const distance = start.distanceTo(target);
    let flightTime = clamp(0.60 + distance * 0.105, 0.68, 1.38);
    if (context === "layup") flightTime = 0.46;
    if (context === "dunk") flightTime = 0.24;
    const gravity = 9.81;
    const velocity = new this.T.Vector3(
      (target.x - start.x) / flightTime,
      (target.y - start.y + 0.5 * gravity * flightTime * flightTime) / flightTime,
      (target.z - start.z) / flightTime
    );
    if (context === "dunk") {
      if (!override.choreographyRelease) {
        player.setState(PLAYER_STATES.DUNK, true);
        player.jumpVelocity = 4.5;
        player.grounded = false;
      }
      player.actionLock = Math.max(player.actionLock, 0.32);
      velocity.y *= 0.72;
    } else if (context === "layup") {
      player.setState(PLAYER_STATES.LAYUP, true);
      player.jumpVelocity = 3.4;
      player.grounded = false;
      player.actionLock = 0.58;
    } else {
      player.setState(PLAYER_STATES.SHOOT, true);
      if (player.grounded) {
        player.jumpVelocity = 2.2;
        player.grounded = false;
      }
      player.actionLock = Math.max(player.actionLock, 0.38);
    }
    player.shotReleased = true;
    player.shotReleasedAt = this.elapsed;
    player.shotReleaseElapsed = 0;
    this.releaseBall(start, velocity, "shot");
    this.ball.angularVelocity.set(rand(-4, 4), 0, -11);
    this.ball.shotBy = player;
    this.ball.shotQuality = quality;
    this.ball.rimContacts = 0;
    this.ball.backboardContacts = 0;
    this.ball.maxBackboardContacts = layupPlan?.maxBackboardContacts ?? Infinity;
    this.ball.rimContactCooldown = 0;
    this.ball.perfectRelease = perfectRelease;
    this.ball.guaranteedMake = shotResult.guaranteed;
    this.ball.plannedMade = shotResult.made;
    this.ball.plannedRimResult = layupPlan ? RIM_RESULTS.BANK : shotResult.rim.result;
    this.ball.shotResult = shotResult;
    this.ball.bankShot = Boolean(layupPlan) || shotResult.rim.result === RIM_RESULTS.BANK;
    this.ball.bankResolved = false;
    this.ball.freeThrow = context === "free_throw";
    this.shotTrailTimer = 0;
    this.ball.canScore = shotResult.made && !this.ball.bankShot;
    this.ball.points = context === "free_throw" ? 1 : this._shotPoints(player.root.position, player.team);
    this._scoredOnFlight = false;
    this.lastShotQuality = quality;
    this.controls.rumble(perfectRelease ? 0.82 : quality > 0.9 ? 0.7 : 0.28, perfectRelease ? 155 : quality > 0.9 ? 130 : 65);
    this._burst(start, perfectRelease ? 16 : quality > 0.9 ? 10 : 5, perfectRelease ? 0x72ff9b : quality > 0.82 ? 0x6affbc : 0xffbf5c, 1);
    this.events.emit("shot", {
      player, context, quality, perfectRelease, atApex, points: this.ball.points, charge: this.shotCharge,
      start: start.clone(), target: target.clone(),
      makeProbability: shotResult.makeProbability,
      makePercent: shotResult.makePercent,
      guaranteed: shotResult.guaranteed,
      coverage: shotModel.coverageResult.coverage,
      coveragePercent: shotModel.coverageResult.percent,
      coverageLabel: shotModel.coverageResult.displayLabel,
      rimResult: layupPlan ? RIM_RESULTS.BANK : shotResult.rim.result,
      hud: shotResult.hud,
    });
    this.shotCharge = 0;
    this.shotInputAction = "shoot";
    return true;
  }

  /**
   * AI-facing shot API that shares all ballistics, scoring, and feedback paths.
   */
  shoot(player, quality = 0.72, context) {
    if (!player?.hasBall || this.chargingShot) return false;
    const normalizedContext = context === "jumpShot2" || context === "jumpShot3" ? "jumper"
      : context || this._shotContext(player);
    this.chargingShot = true;
    this.shotContext = normalizedContext;
    this.shotCharge = this.shotIdeal;
    this._facePlayerToBasket(player);
    player.queuedDribbleMove = null;
    player.dribbleTransition = null;
    player.dribbleMove = null;
    player.dribbleMoveTime = 0;
    player.shotReleased = false;
    player.shotElapsed = 0;
    player.shotReleaseElapsed = 0;
    player.shotStartedAt = this.elapsed;
    player.shotReleasedAt = -Infinity;
    if (normalizedContext === "jumper") {
      player.setState(PLAYER_STATES.SHOOT, true);
      player.desiredVelocity.multiplyScalar(0.1);
      player.velocity.multiplyScalar(0.45);
      player.jumpVelocity = 4.5;
      player.grounded = false;
      player.actionLock = 0.62;
      this.queuedRelease = {
        player,
        override: {
          quality: clamp(quality, 0.48, 0.97),
          perfectRelease: quality >= 0.94,
          context: "jumper",
          ai: true,
        },
      };
      this.events.emit("shotstart", { player, context: "jumper", ai: true });
      this.events.emit("aishotdecision", { player, quality, context: "jumper" });
      return true;
    }
    this.events.emit("aishotdecision", { player, quality, context: normalizedContext });
    return this.releaseShot(player, {
      quality: clamp(quality, 0.48, 0.97),
      context: normalizedContext,
      immediate: true,
      ai: true,
    });
  }

  _shotPoints(position, teamId = this.possessionTeam) {
    return shotValueForRuntime(this.courtRuntime, position, teamId);
  }

  findPassTarget(player, direction = player.facing) {
    let best = null;
    let bestScore = -Infinity;
    for (const candidate of this.players) {
      if (candidate === player || candidate.team !== player.team) continue;
      const delta = new this.T.Vector3().subVectors(candidate.root.position, player.root.position);
      const distance = delta.length();
      if (distance < 0.4 || distance > 11) continue;
      const alignment = delta.normalize().dot(direction);
      const nearestDefender = Math.min(...this.players
        .filter((p) => p.team !== player.team)
        .map((p) => p.root.position.distanceTo(candidate.root.position)), 10);
      const score = alignment * 2.1 - distance * 0.035 + nearestDefender * 0.12;
      if (score > bestScore) {
        best = candidate;
        bestScore = score;
      }
    }
    return best;
  }

  pass(player = this.controlledPlayer, target = null) {
    if (!player?.hasBall) return false;
    target ||= this.findPassTarget(player);
    if (!target) {
      this.events.emit("passrequest", { player });
      return false;
    }
    const start = player.worldHandPosition(new this.T.Vector3());
    const destination = target.root.position.clone().add(new this.T.Vector3(0, 1.15, 0));
    const distance = start.distanceTo(destination);
    const time = clamp(distance / 10, 0.28, 0.78);
    const velocity = destination.sub(start).divideScalar(time);
    velocity.y += 0.5 * 9.81 * time;
    this.releaseBall(start, velocity, "pass");
    this.ball.shotBy = null;
    this.ball.canScore = false;
    this.ball.passTarget = target;
    player.actionLock = 0.24;
    this.events.emit("pass", { player, target, velocity: velocity.clone() });
    return true;
  }

  attemptSteal(defender, { source = defender?.controlled ? "user" : "cpu" } = {}) {
    if (!defender || defender.stealCooldown > 0) return false;
    defender.stealCooldown = 0.62;
    defender.actionLock = 0.28;
    const owner = this.ball.owner;
    if (!owner || owner.team === defender.team) {
      this.events.emit("steal", { defender, success: false, reason: "no-target" });
      return false;
    }

    const distance = owner.root.position.distanceTo(defender.root.position);
    const facing = new this.T.Vector3()
      .subVectors(owner.root.position, defender.root.position)
      .setY(0)
      .normalize();
    const alignment = defender.facing.dot(facing);
    const userTimedReach = source === "user";
    const proximity = clamp((1.65 - distance) / 1.05, 0, 1);
    const moveActive = !!owner.dribbleMove && owner.dribbleMoveTime > 0;
    const ballExposure = moveActive
      ? clamp(0.2 + Math.abs(owner.dribbleMoveProgress - 0.5) * 0.42, 0.2, 0.48)
      : 0.72;
    const duel = resolveLiveBallSteal({
      owner: {
        id: owner.id,
        teamId: owner.team,
        position: owner.root.position,
        velocity: owner.velocity,
        handleRating: owner.metadata?.ratings?.ballHandle
          ?? owner.metadata?.handle
          ?? owner.metadata?.ballHandling
          ?? 0.76,
        ballSecurity: owner.metadata?.ballSecurity ?? 0.74,
        strength: owner.metadata?.strength ?? owner.metadata?.ratings?.strength ?? 0.65,
        stamina: owner.stamina,
      },
      defender: {
        id: defender.id,
        teamId: defender.team,
        position: defender.root.position,
        velocity: defender.velocity,
        stealRating: defender.metadata?.steal ?? this._difficultyValue(0.56, 0.72, 0.86),
        perimeterDefense: defender.metadata?.perimeterDefense
          ?? defender.metadata?.ratings?.perimeterDefense
          ?? this._difficultyValue(0.56, 0.7, 0.84),
        reaction: defender.metadata?.reaction
          ?? defender.metadata?.ratings?.reaction
          ?? defender.metadata?.ratings?.acceleration
          ?? this._difficultyValue(0.58, 0.72, 0.86),
        balance: defender.metadata?.balance ?? 0.7,
        discipline: defender.metadata?.discipline ?? this._difficultyValue(0.62, 0.72, 0.84),
        reach: clamp(defender.height / 2.08, 0.58, 1),
        reachAggression: this._difficultyValue(0.48, 0.62, 0.78),
        stamina: defender.stamina,
      },
      ball: { position: this.ball.position },
      distance,
      alignment,
      // A button press is an intentional timing read. Give it a modest timing
      // edge when the user is in legal reach without ever guaranteeing a poke.
      // CPU reaches retain their existing tuning.
      reachTiming: clamp(
        0.55 + alignment * 0.18 + (userTimedReach ? 0.08 + proximity * 0.06 : 0),
        0.18,
        0.92,
      ),
      ballExposure,
      handContact: clamp((1.5 - distance) / 0.8, 0, 1) * 0.36,
      bodyContact: distance < 0.62 ? 0.72 : 0.04,
      fromBehind: alignment < -0.1,
      ballFirst: distance < 1.18 && alignment > -0.2,
      victimProtectingBall: moveActive,
      dribbleMove: moveActive ? owner.dribbleMove : null,
      dribbleProgress: owner.dribbleMoveProgress,
      moveExecution: owner.metadata?.handle ?? 0.78,
      defenderWrongFoot: moveActive && alignment < 0.12,
      foulCheckValue: this.random(),
      ankleCheckValue: this.random(),
      pokeCheckValue: this.random(),
      pokeSide: defender.root.position.x <= owner.root.position.x ? 1 : -1,
    });

    const foul = duel.outcome === STEAL_OUTCOMES.FOUL;
    const success = duel.outcome === STEAL_OUTCOMES.LOOSE_BALL;
    if (foul) {
      this.teamFouls[defender.team] = (this.teamFouls[defender.team] || 0) + 1;
      this.deadBallCooldown = 0.72;
      this.events.emit("foul", {
        ...duel.event,
        risk: duel.foulRisk,
        teamFouls: this.teamFouls[defender.team],
      });
    } else if (duel.outcome === STEAL_OUTCOMES.ANKLE_BREAK) {
      const stunSeconds = clamp(duel.stunSeconds, 0, 1.5);
      defender.setState(PLAYER_STATES.STUMBLE, true);
      defender.actionLock = Math.max(defender.actionLock, stunSeconds);
      defender.desiredVelocity.set(0, 0, 0);
      defender.velocity.multiplyScalar(0.18);
      this.cameraShake = Math.max(this.cameraShake, 0.2);
      this.controls.rumble(0.58, 125);
      this._burst(defender.root.position.clone().add(new this.T.Vector3(0, 0.2, 0)), 14, 0xb18cff, 1);
      this.events.emit("anklebreak", {
        ...duel.event,
        handler: owner,
        defender,
        stunSeconds,
      });
    } else if (success) {
      const stealPosition = this.ball.position.clone();
      const loose = duel.looseBall;
      this.releaseBall(
        stealPosition,
        new this.T.Vector3(loose.velocity.x, loose.velocity.y, loose.velocity.z),
        "loose",
      );
      this.ball.angularVelocity.set(
        loose.angularVelocity.x,
        loose.angularVelocity.y,
        loose.angularVelocity.z,
      );
      this.ball.pickupCooldown = loose.pickupDelay;
      this.ball.lastTouchedTeamId = loose.lastTouchTeamId;
      this.ball.lastTouchedPlayerId = loose.lastTouchPlayerId;
      // The handler must visibly lose control before becoming pickup-eligible.
      // The defender still has to chase the loose ball; possession is never
      // assigned by the steal itself.
      owner.actionLock = Math.max(owner.actionLock, 0.62);
      this.cameraShake = Math.max(this.cameraShake, 0.16);
      this.controls.rumble(0.48, 95);
      this._burst(stealPosition, 11, 0xffdc65, 0.9);
      this.events.emit("ballloose", {
        ...duel.event,
        defender,
        victim: owner,
        position: stealPosition,
      });
    }

    this.events.emit("steal", {
      defender,
      victim: owner,
      source,
      success,
      chance: duel.pokeProbability ?? 0,
      distance,
      foul,
      foulRisk: duel.foulRisk ?? 0,
      looseBall: success,
      ankleBreak: duel.outcome === STEAL_OUTCOMES.ANKLE_BREAK,
      reason: foul ? "reach-in"
        : success ? "poked-loose"
          : duel.outcome === STEAL_OUTCOMES.ANKLE_BREAK ? "ankle-break" : "missed",
    });
    return success;
  }

  attemptBlock(defender) {
    if (!defender || defender.blockCooldown > 0) return false;
    defender.blockCooldown = 0.78;
    defender.blockWindow = 0.4;
    defender.blockConnected = false;
    defender.setState(PLAYER_STATES.BLOCK, true);
    defender.actionLock = 0.5;
    defender.jumpVelocity = 4.35;
    defender.grounded = false;
    this.events.emit("blockattempt", { defender, window: defender.blockWindow });
    return this._resolveActiveBlock(defender);
  }

  _resolveActiveBlock(defender) {
    if (!defender || defender.blockConnected || defender.blockWindow <= 0 ||
        this.ball.owner || this.ball.state !== "shot") return false;
    const hand = defender.root.position.clone().add(new this.T.Vector3(0, 1.88, 0));
    const distance = hand.distanceTo(this.ball.position);
    if (distance > 1.02) return false;
    const shooter = this.ball.shotBy;
    const activeBasket = shooter ? this._basketForTeam(shooter.team) : null;
    const shooterRimDistance = shooter && activeBasket
      ? Math.hypot(
        shooter.root.position.x - activeBasket.x,
        shooter.root.position.z - activeBasket.z,
      )
      : Infinity;
    const bodyDistance = shooter
      ? defender.root.position.distanceTo(shooter.root.position)
      : Infinity;
    if (shooter && shooterRimDistance <= 2.15 && bodyDistance < 0.72) {
      defender.blockConnected = true;
      this.teamFouls[defender.team] = (this.teamFouls[defender.team] || 0) + 1;
      this.deadBallCooldown = 0.72;
      this.events.emit("foul", {
        foulType: "shooting",
        shooting: true,
        nearBasket: true,
        committingTeamId: defender.team,
        committingPlayerId: defender.id,
        offendedTeamId: shooter.team,
        offendedPlayerId: shooter.id,
        freeThrows: 1,
        teamFouls: this.teamFouls[defender.team],
        commands: [{
          type: "START_FREE_THROWS",
          teamId: shooter.team,
          shooterId: shooter.id,
          attempts: 1,
        }],
      });
      return true;
    }
    const away = this.ball.velocity.clone().reflect(defender.facing.clone().normalize()).multiplyScalar(0.62);
    this.ball.velocity.copy(away);
    this.ball.velocity.y = Math.min(this.ball.velocity.y, 1.0);
    this.ball.state = "blocked";
    this.ball.canScore = false;
    this.ball.pickupCooldown = 0.14;
    defender.blockConnected = true;
    defender.blockWindow = 0;
    this.cameraShake = Math.max(this.cameraShake, 0.26);
    this._burst(this.ball.position, 15, 0x72f9ff, 1.35);
    this.controls.rumble(0.72, 130);
    this.events.emit("block", { defender, success: true, ball: this.ball, distance });
    return true;
  }

  _checkActiveBlocks() {
    if (this.ball.state !== "shot") return;
    for (const player of this.players) {
      if (player.blockWindow > 0 && this._resolveActiveBlock(player)) break;
    }
  }

  _updateBall(dt) {
    const ball = this.ball;
    ball.rimContactCooldown = Math.max(0, ball.rimContactCooldown - dt);
    ball.previousPosition.copy(ball.position);
    if (this._updateArcRunGrab()) return;
    if (ball.owner) {
      this._updatePossessedBall(dt);
      return;
    }
    ball.flightTime += dt;
    ball.velocity.y -= 9.81 * dt;
    ball.position.addScaledVector(ball.velocity, dt);
    this._checkActiveBlocks();
    if (ball.owner) return;
    const activeBasket = this._activeBasket();
    // A user green at the apex is a gameplay promise: preserve blocks, but
    // remove integration/rim-edge variance from an otherwise perfect release.
    if (ball.state === "shot" && ball.guaranteedMake
        && ball.plannedRimResult === RIM_RESULTS.CLEAN_SWISH && ball.velocity.y < 0
        && ball.previousPosition.y >= activeBasket.y
        && ball.position.y < activeBasket.y + 0.22) {
      ball.previousPosition.y = Math.max(ball.previousPosition.y, activeBasket.y + 0.02);
      ball.position.set(activeBasket.x, activeBasket.y - 0.02, activeBasket.z);
    }
    this.ballMesh.rotation.x += ball.angularVelocity.x * dt;
    this.ballMesh.rotation.y += ball.angularVelocity.y * dt;
    this.ballMesh.rotation.z += ball.angularVelocity.z * dt;
    ball.angularVelocity.multiplyScalar(Math.exp(-0.12 * dt));

    this._collideBackboard();
    this._collideRim();
    this._detectScore();
    if (ball.perfectRelease && ball.state === "shot") {
      this.shotTrailTimer -= dt;
      if (this.shotTrailTimer <= 0) {
        this.shotTrailTimer = 0.045;
        this._emitPerfectTrail(ball.position);
      }
    }

    if (ball.position.y < COURT.ballRadius) {
      ball.position.y = COURT.ballRadius;
      if (Math.abs(ball.velocity.y) > 1.15) {
        this.events.emit("bounce", { speed: Math.abs(ball.velocity.y), position: ball.position.clone() });
      }
      ball.velocity.y = Math.abs(ball.velocity.y) * 0.67;
      ball.velocity.x *= 0.82;
      ball.velocity.z *= 0.82;
      if (ball.velocity.lengthSq() < 0.12) {
        ball.velocity.set(0, 0, 0);
        ball.state = "loose";
      }
    }
    if (this.deadBallCooldown <= 0 && shouldEnforceOutOfBounds(this.mode)) {
      const resolution = resolveOutOfBounds({
        position: { x: ball.position.x, z: ball.position.z },
        previousPosition: { x: ball.previousPosition.x, z: ball.previousPosition.z },
        court: { width: this.courtRuntime.width, length: this.courtRuntime.length },
        radius: COURT.ballRadius,
        modeId: this.mode,
        possessionTeamId: this.possessionTeam,
        lastTouchedTeamId: ball.lastTouchedTeamId || ball.lastOwner?.team || this.possessionTeam,
        lastTouchedPlayerId: ball.lastTouchedPlayerId || ball.lastOwner?.id || null,
        possessionId: Math.floor(this.elapsed * 10),
        sequence: ++this.rulesSequence,
      });
      if (resolution.occurred) {
        ball.position.set(resolution.event.restartSpot.x, COURT.ballRadius, resolution.event.restartSpot.z);
        ball.velocity.set(0, 0, 0);
        ball.state = "dead";
        ball.canScore = false;
        ball.pickupCooldown = 0.72;
        this.deadBallCooldown = 0.72;
        this.events.emit("outofbounds", { ...resolution.event, consequence: resolution.consequence });
        return;
      }
    } else if (!shouldEnforceOutOfBounds(this.mode)) {
      const xLimit = this.courtRuntime.width / 2 - COURT.ballRadius;
      const zLimit = this.courtRuntime.length / 2 - COURT.ballRadius;
      if (Math.abs(ball.position.x) > xLimit) {
        ball.position.x = clamp(ball.position.x, -xLimit, xLimit);
        ball.velocity.x *= -0.38;
        ball.state = "loose";
        ball.canScore = false;
      }
      if (Math.abs(ball.position.z) > zLimit) {
        ball.position.z = clamp(ball.position.z, -zLimit, zLimit);
        ball.velocity.z *= -0.38;
        ball.state = "loose";
        ball.canScore = false;
      }
    }
    this._tryPickupOrRebound();
  }

  _updatePossessedBall(dt) {
    const owner = this.ball.owner;
    const speed = Math.hypot(owner.velocity.x, owner.velocity.z);
    const frequency = 2.0 + Math.min(1.2, speed * 0.22);
    const phaseStep = advancePeriodicPhase(owner.dribblePhase, dt * frequency);
    owner.dribblePhase = phaseStep.phase;
    const phase = owner.dribblePhase;
    const bounceCurve = Math.abs(Math.cos(phase * Math.PI));
    const moveActive = !!owner.dribbleMove && owner.dribbleMoveTime > 0;
    if (!moveActive && phaseStep.crossings > 0 && speed > 1.7) owner.dribbleHand *= -1;
    let side = owner.dribbleHand * 0.42;
    let forward = 0.12 + speed * 0.025;
    let height = lerp(COURT.ballRadius + 0.04, 1.05, bounceCurve);
    const shotGather = owner.state === PLAYER_STATES.SHOOT && this.chargingShot;
    const dunkGather = owner.state === PLAYER_STATES.DUNK
      && owner.dunkSelection
      && this.activeDunk?.player === owner
      && !this.activeDunk.released;
    if (dunkGather) {
      const pose = sampleDunkChoreography(owner.dunkSelection, owner.dunkProgress);
      side = pose.ball.side;
      forward = pose.ball.forward;
      height = pose.ball.height;
    } else if (shotGather) {
      const pose = getShotAnimationPose(owner.shotElapsed, owner.jumpVelocity, false, 0);
      const pocketHeight = 1.06 - pose.dip * 0.16;
      side = owner.shootingHand * lerp(0.22, 0.31, pose.setPoint);
      forward = lerp(0.3, 0.12, pose.setPoint);
      height = lerp(pocketHeight, 1.78, pose.setPoint);
    } else if (moveActive) {
      const path = this._samplePlayerHandleTarget(owner, this.elapsed);
      side = path.side;
      forward = path.forward;
      height = path.height;
    }
    const target = new this.T.Vector3(side, height, forward);
    target.applyAxisAngle(new this.T.Vector3(0, 1, 0), owner.root.rotation.y);
    target.add(owner.root.position);
    const follow = dunkGather ? 46 : shotGather ? 32 : moveActive ? 38 : (phase > 0.42 && phase < 0.58 ? 34 : 22);
    this.ball.position.lerp(target, animationDampingFactor(follow, dt));
    if (moveActive) {
      owner.handleTrailTimer -= dt;
      if (owner.handleTrailTimer <= 0) {
        owner.handleTrailTimer = 0.055;
        this._burst(this.ball.position, 1, owner.dribbleMoveColor, 0.3);
      }
    }
    this.ballMesh.rotation.x += dt * (6 + speed * 1.5);
    this.ballMesh.rotation.z += dt * owner.dribbleHand * (moveActive ? 5.2 : 2.2);
    if (phaseStep.crossings > 0) {
      this.events.emit("dribble", { player: owner, speed, position: this.ball.position.clone() });
    }
  }

  _collideBackboard() {
    const b = this.ball;
    const r = COURT.ballRadius;
    const basket = this._activeBasket();
    const frontZ = basket.backboardZ - basket.attackSign * r;
    const crossedFront = basket.attackSign < 0
      ? b.previousPosition.z > frontZ && b.position.z <= frontZ
      : b.previousPosition.z < frontZ && b.position.z >= frontZ;
    if (crossedFront
        && b.backboardContacts < b.maxBackboardContacts
        && Math.abs(b.position.x) < 0.98
        && b.position.y > 2.94
        && b.position.y < 4.10) {
      b.position.z = frontZ;
      b.velocity.z = -basket.attackSign * Math.abs(b.velocity.z) * 0.68;
      b.velocity.x *= 0.91;
      b.velocity.y *= 0.88;
      this.cameraShake = Math.max(this.cameraShake, 0.055);
      b.backboardContacts += 1;
      if (b.bankShot) {
        if (b.plannedMade) {
          b.canScore = true;
          b.bankResolved = true;
          const bankTime = b.maxBackboardContacts === 1 ? 0.2 : 0.22;
          b.velocity.set(
            (basket.x - b.position.x) / bankTime,
            (basket.y + 0.04 - b.position.y + 0.5 * 9.81 * bankTime * bankTime) / bankTime,
            (basket.z - b.position.z) / bankTime,
          );
        } else {
          b.velocity.x += (b.position.x >= 0 ? 1 : -1) * 1.15;
        }
      }
      this.events.emit("backboard", { position: b.position.clone(), speed: b.velocity.length() });
    }
  }

  _collideRim() {
    const b = this.ball;
    if (b.rimContactCooldown > 0) return;
    const basket = this._activeBasket();
    const yDelta = b.position.y - basket.y;
    if (Math.abs(yDelta) > COURT.ballRadius + 0.05) return;
    const dx = b.position.x - basket.x;
    const dz = b.position.z - basket.z;
    const radial = Math.hypot(dx, dz);
    const collisionRadius = COURT.rimRadius + COURT.ballRadius + 0.018;
    const innerRadius = Math.max(0.02, COURT.rimRadius - COURT.ballRadius);
    if (radial < collisionRadius && radial > innerRadius) {
      const nx = radial > 0.0001 ? dx / radial : 1;
      const nz = radial > 0.0001 ? dz / radial : 0;
      const normal = new this.T.Vector3(nx, clamp(yDelta / 0.17, -0.55, 0.55), nz).normalize();
      if (b.velocity.dot(normal) < 0) {
        b.position.addScaledVector(normal, collisionRadius - radial + 0.006);
        b.velocity.reflect(normal).multiplyScalar(0.69);
        b.velocity.y += 0.25;
        b.angularVelocity.x += rand(-2, 2);
        this.cameraShake = Math.max(this.cameraShake, 0.075);
        b.rimContacts += 1;
        b.rimContactCooldown = 0.055;
        this.events.emit("rim", { position: b.position.clone(), speed: b.velocity.length() });
        if (b.plannedMade && b.plannedRimResult === RIM_RESULTS.SOFT_RIM_IN) {
          const settleTime = 0.16;
          b.velocity.x = (basket.x - b.position.x) / settleTime * 0.58;
          b.velocity.z = (basket.z - b.position.z) / settleTime * 0.58;
          b.velocity.y = -Math.max(0.72, Math.abs(b.velocity.y) * 0.46);
        } else if (!b.plannedMade) {
          b.canScore = false;
          b.velocity.x += nx * 0.82;
          b.velocity.z += nz * 0.82;
        }
        if (b.rimContacts >= 3 && !b.plannedMade) {
          b.canScore = false;
          b.velocity.x += nx * 1.15;
          b.velocity.z += nz * 1.15;
          b.velocity.y = Math.max(0.48, Math.abs(b.velocity.y) * 0.52);
        }
      }
    }
    if (b.position.y < basket.y && b.position.y > basket.y - 0.5 && radial < COURT.rimRadius) {
      b.velocity.x *= 0.992;
      b.velocity.z *= 0.992;
    }
  }

  _detectScore() {
    const b = this.ball;
    const basket = this._activeBasket();
    if (!b.canScore || this._scoredOnFlight || b.velocity.y >= 0) return;
    const crossed = b.previousPosition.y >= basket.y && b.position.y < basket.y;
    const radial = Math.hypot(b.position.x - basket.x, b.position.z - basket.z);
    if (crossed && radial < COURT.rimRadius - COURT.ballRadius * 0.22) {
      this._scoredOnFlight = true;
      b.canScore = false;
      b.velocity.x *= 0.72;
      b.velocity.z *= 0.72;
      const scorer = b.shotBy;
      const team = scorer?.team || this.possessionTeam;
      this.score[team] = (this.score[team] || 0) + b.points;
      this.lastScorer = scorer;
      const swish = b.rimContacts === 0 && b.backboardContacts === 0;
      this.cameraShake = Math.max(this.cameraShake, swish ? 0.18 : b.shotQuality > 0.9 ? 0.14 : 0.08);
      this.netPulse = swish ? 1 : 0.58;
      this.fullCourtVisuals?.pulse(team, this.netPulse);
      this.scoreRingPulse = 1;
      this.scoreRing.position.set(basket.x, basket.y - 0.02, basket.z);
      this.scoreRing.material.color.setHex(swish ? 0x76ffe1 : 0xffc45c);
      this._burst(new this.T.Vector3(basket.x, basket.y - 0.1, basket.z), swish ? 28 : 18, swish ? 0x68ffd4 : 0xffc45c, 1.7);
      const wasFreeThrow = b.freeThrow;
      this.events.emit("score", {
        player: scorer, team, points: b.points, score: { ...this.score },
        quality: b.shotQuality, swish,
        rimContacts: b.rimContacts,
        backboardContacts: b.backboardContacts,
        makeProbability: b.shotResult?.makeProbability ?? 0,
        makePercent: b.shotResult?.makePercent ?? 0,
        coverage: b.shotResult?.event?.coverage ?? 0,
        rimResult: b.plannedRimResult,
      });
      if (wasFreeThrow) {
        const resolved = this.freeThrowFlow.resolve(true);
        this.events.emit("freethrow", {
          phase: "resolved",
          made: true,
          perfectRelease: b.perfectRelease,
          attemptsRemaining: resolved?.attemptsRemaining ?? 0,
        });
        b.freeThrow = false;
      }
      if (scorer) {
        scorer.setState(PLAYER_STATES.CELEBRATE, true);
        scorer.actionLock = 0.55;
      }
      if (b.shotQuality > 0.88 && !wasFreeThrow && shouldQueueMadeShotReplay(this.mode)) {
        this.highlightPending = 2.5;
      }
    }
  }

  _tryPickupOrRebound() {
    const b = this.ball;
    if (b.pickupCooldown > 0 || b.state === "dead") return;
    const wasShot = ["shot", "blocked"].includes(b.state);
    const highBall = b.position.y > 1.45;
    const reach = highBall ? 0.66 : 0.78;
    const landing = wasShot
      ? predictReboundLanding({
        position: b.position,
        velocity: b.velocity,
      }, { seconds: highBall ? 0.48 : 0.28 })
      : { x: b.position.x, z: b.position.z, seconds: 0.12 };
    const eligible = [];
    for (const player of this.players) {
      const chestY = player.root.position.y + (b.position.y > 1.1 ? 1.35 : 0.35);
      const catchDistance = Math.hypot(
        player.root.position.x - b.position.x,
        chestY - b.position.y,
        player.root.position.z - b.position.z,
      );
      const pursuitDistance = Math.hypot(
        player.root.position.x - landing.x,
        player.root.position.z - landing.z,
      );
      const canPursue = wasShot
        ? pursuitDistance < 2.45 && catchDistance < (highBall ? 1.3 : 1.05)
        : catchDistance < reach;
      if (canPursue && player.actionLock < 0.36) {
        eligible.push({
          id: player.id,
          teamId: player.team,
          position: { x: player.root.position.x, z: player.root.position.z },
          velocity: { x: player.velocity.x, z: player.velocity.z },
          facing: { x: player.facing.x, z: player.facing.z },
          grounded: player.grounded,
          role: player.metadata?.role,
          rebounding: player.metadata?.rebounding ?? (player.metadata?.role === "big" ? 0.88 : 0.68),
          offensiveRebound: player.metadata?.offensiveRebound
            ?? player.metadata?.ratings?.offensiveRebound,
          defensiveRebound: player.metadata?.defensiveRebound
            ?? player.metadata?.ratings?.defensiveRebound,
          vertical: player.metadata?.vertical ?? (player.height > 2 ? 0.82 : 0.7),
          reach: clamp(player.height / 2.15, 0.55, 1),
          height: player.height,
          strength: player.metadata?.strength ?? player.metadata?.ratings?.strength ?? 0.65,
          ratings: player.metadata?.ratings,
        });
      }
    }
    if (!eligible.length) return;
    const wasFreeThrow = b.freeThrow;
    const ranking = rankReboundCandidates(eligible, {
      landingPoint: { x: landing.x, z: landing.z },
      rim: { x: this._activeBasket().x, z: this._activeBasket().z },
      offenseTeamId: b.shotBy?.team || this.possessionTeam,
      maxPursuitDistance: wasShot ? 2.45 : 1.4,
      predictedLandingSeconds: landing.seconds,
    });
    const winner = ranking[0];
    const best = this.players.find((player) => player.id === winner?.playerId) || this.players.find((player) => player.id === eligible[0].id);
    if (!best) return;
    this.givePossession(best);
    if (wasFreeThrow) {
      const resolved = this.freeThrowFlow.resolve(false);
      b.freeThrow = false;
      this.shotClock = 24;
      this.events.emit("freethrow", {
        phase: "resolved",
        made: false,
        attemptsRemaining: resolved?.attemptsRemaining ?? 0,
      });
    }
    if (wasShot) {
      best.jumpVelocity = highBall ? 1.35 : best.jumpVelocity;
      if (highBall) best.grounded = false;
      this.events.emit("rebound", {
        player: best, team: best.team,
        offensive: best.team === b.shotBy?.team,
        reboundScore: winner?.score || 0,
        reboundBreakdown: winner?.breakdown || null,
        contested: eligible.length > 1,
      });
      best.setState(PLAYER_STATES.DRIBBLE, true);
    } else {
      this.events.emit("pickup", { player: best });
    }
  }

  _burst(position, count, color, energy = 1) {
    let emitted = 0;
    for (const particle of this.particles) {
      if (particle.life > 0) continue;
      particle.life = rand(0.32, 0.68) * energy;
      particle.maxLife = particle.life;
      particle.mesh.visible = true;
      particle.mesh.material.color.setHex(color);
      particle.mesh.material.opacity = 1;
      particle.mesh.position.copy(position);
      particle.mesh.scale.setScalar(rand(0.65, 1.55));
      particle.velocity.set(rand(-1.6, 1.6), rand(0.6, 2.7), rand(-1.6, 1.6)).multiplyScalar(energy);
      if (++emitted >= count) break;
    }
  }

  _emitPerfectTrail(position) {
    const particle = this.particles.find((candidate) => candidate.life <= 0);
    if (!particle) return false;
    particle.life = 0.2;
    particle.maxLife = particle.life;
    particle.mesh.visible = true;
    particle.mesh.material.color.setHex(this.perfectTrailIndex++ % 2 ? 0x5affb8 : 0x52e9ff);
    particle.mesh.material.opacity = 0.92;
    particle.mesh.position.copy(position);
    particle.mesh.scale.set(1.7, 0.72, 1.7);
    particle.velocity.copy(this.ball.velocity).normalize().multiplyScalar(-0.28);
    return true;
  }

  _updateVFX(dt) {
    for (const particle of this.particles) {
      if (particle.life <= 0) continue;
      particle.life -= dt;
      if (particle.life <= 0) {
        particle.mesh.visible = false;
        particle.mesh.material.opacity = 0;
        continue;
      }
      particle.velocity.y -= 4.5 * dt;
      particle.mesh.position.addScaledVector(particle.velocity, dt);
      particle.mesh.material.opacity = clamp(particle.life / particle.maxLife, 0, 1);
      particle.mesh.rotation.x += dt * 5;
      particle.mesh.rotation.y += dt * 7;
    }
    if (this.netPulse > 0.001) {
      this.netPulse = Math.max(0, this.netPulse - dt * 2.45);
      for (let strand = 0; strand < this.netLines.length; strand++) {
        const attribute = this.netLines[strand].geometry.attributes.position;
        const base = this.netLines[strand].userData.basePositions;
        if (!attribute || !base) continue;
        for (let index = 0; index < attribute.count; index++) {
          const row = index / Math.max(1, attribute.count - 1);
          const squeeze = this.netPulse * row * 0.28;
          attribute.setXYZ(
            index,
            base[index * 3] * (1 - squeeze),
            base[index * 3 + 1] - Math.sin(row * Math.PI) * this.netPulse * 0.09,
            COURT.basketZ + (base[index * 3 + 2] - COURT.basketZ) * (1 - squeeze),
          );
        }
        attribute.needsUpdate = true;
      }
    }
    if (this.scoreRingPulse > 0.001) {
      this.scoreRingPulse = Math.max(0, this.scoreRingPulse - dt * 1.8);
      this.scoreRing.material.opacity = this.scoreRingPulse * 0.82;
      this.scoreRing.scale.setScalar(0.8 + (1 - this.scoreRingPulse) * 3.2);
    } else {
      this.scoreRing.material.opacity = 0;
    }
    if (this.handleFlash > 0) {
      this.handleFlash = Math.max(0, this.handleFlash - dt * 2.25);
      this.handleRing.material.opacity = this.handleFlash * 0.68;
      this.handleRing.scale.setScalar(0.72 + (1 - this.handleFlash) * 1.05);
    } else {
      this.handleRing.material.opacity = 0;
    }
    const pulse = 1 + Math.sin(this.elapsed * 2.2) * 0.035;
    for (let i = 0; i < this.accentLights.length; i++) {
      this.accentLights[i].intensity = (4.2 + Math.sin(this.elapsed * 1.4 + i * Math.PI) * 0.55) * pulse;
    }
  }

  _updateVisuals(dt) {
    this.replayFlow.advance(dt);
    this._processReplayFlowEvents();
    if (!this.replayFlow.frozen) {
      for (const player of this.players) {
        player.updateAnimation(dt, player.velocity.length() / player.speed);
      }
    }
    this._updateVFX(dt);
    this.fullCourtVisuals?.update(dt);
    this.park?.update(dt, clamp(0.28 + this.handleFlash * 0.4 + this.scoreRingPulse * 0.5, 0, 1));
    this._updateCamera(dt);
    this._updateReplay(dt);
    this._processReplayFlowEvents();
  }

  _updateCamera(dt) {
    if (this.replayFlow.frozen) return;
    const focus = this.ball.owner?.root.position || this.ball.position;
    const player = this.controlledPlayer?.root.position || focus;
    const desired = this._scratchA.set(0, 0, 0);
    const target = this._scratchB.set(0, 0, 0);
    const isShot = !this.ball.owner && this.ball.state === "shot";
    let desiredFov = 42;
    const activeBasket = this._basketForTeam(this.ball.owner?.team || this.possessionTeam || this.controlledPlayer?.team || "home");
    if (this.cameraMode === "arc-run") {
      const snapshot = createArcRunCameraSnapshot({
        shooter: player,
        basket: activeBasket,
        rack: this.arcRunRack,
      });
      desired.set(
        snapshot.position.x,
        snapshot.position.y,
        snapshot.position.z,
      );
      target.set(
        snapshot.target.x,
        snapshot.target.y,
        snapshot.target.z,
      );
      desiredFov = snapshot.fov;
    } else if (this.cameraMode === "broadcast") {
      const actionX = clamp((focus.x + player.x) * 0.16, -1.2, 1.2);
      if (this.courtRuntime.kind === "full") {
        const trackZ = clamp(focus.z * 0.72 + player.z * 0.28,
          -this.courtRuntime.halfLength + 4,
          this.courtRuntime.halfLength - 4);
        desired.set(this.courtRuntime.halfWidth + 2.45 + actionX * 0.18, 8.15, trackZ);
        target.set(
          clamp(focus.x * 0.18, -1.8, 1.8),
          isShot ? 2.2 : 1.35,
          clamp(focus.z, -this.courtRuntime.halfLength + 1.1, this.courtRuntime.halfLength - 1.1),
        );
        desiredFov = 50;
      } else {
        desired.set(this.courtRuntime.halfWidth + 0.72 + actionX * 0.28, 6.15, 1.55);
        target.set(
          clamp(focus.x * 0.22, -1.45, 1.45),
          isShot ? 1.85 : 1.24,
          clamp(focus.z * 0.24 - 2.45, -4.25, 0.35),
        );
        desiredFov = this.players.length >= 8 ? 45 : this.players.length >= 6 ? 43 : 41.5;
      }
    } else if (this.cameraMode === "cinematic") {
      const orbit = this.elapsed * 0.075;
      desired.set(Math.cos(orbit) * 9.1, 3.8, Math.sin(orbit) * 5.4 + 0.5);
      target.copy(focus).lerp(this._scratchC.set(activeBasket.x, 1.45, activeBasket.z), 0.28);
      target.y = 1.38;
      desiredFov = 38;
    } else if (isShot) {
      desired.set(7.9, 4.55, clamp(player.z + 3.9, 1.6, 7.4));
      target.copy(this.ball.position).lerp(this._scratchC.set(activeBasket.x, activeBasket.y, activeBasket.z), 0.44);
      desiredFov = 39;
    } else {
      const side = clamp(player.x * 0.2, -1.25, 1.25);
      desired.set(5.05 + side, 3.08, clamp(player.z + 4.45, 3.25, 8.75));
      target.copy(player).lerp(focus, 0.38);
      target.y = 1.12;
      target.z -= 1.12;
      desiredFov = 40.5 + clamp(this.controlledPlayer?.velocity.length() || 0, 0, 5) * 0.3;
    }
    this.camera.position.lerp(desired, 1 - Math.exp(-4.2 * dt));
    this.cameraTarget.lerp(target, 1 - Math.exp(-6.4 * dt));
    this.camera.fov = damp(this.camera.fov, desiredFov, 4.8, dt);
    this.camera.updateProjectionMatrix();
    if (this.cameraShake > 0.001) {
      const strength = this.cameraShake;
      this.camera.position.x += rand(-strength, strength);
      this.camera.position.y += rand(-strength, strength) * 0.55;
      this.camera.position.z += rand(-strength, strength);
      this.cameraShake *= Math.exp(-12 * dt);
    }
    this.camera.lookAt(this.cameraTarget);
  }

  _recordReplayFrame() {
    if (this.replayFlow.frozen || Math.floor(this.elapsed * 30) === this._lastReplayTick) return;
    this._lastReplayTick = Math.floor(this.elapsed * 30);
    this.replayBuffer.push({
      t: this.elapsed,
      ball: this.ball.position.toArray(),
      players: this.players.map((p) => ({
        id: p.id,
        position: p.root.position.toArray(),
        yaw: p.root.rotation.y,
        state: p.state,
        stateTime: p.stateTime,
        gaitPhase: p.gaitPhase,
        dribbleHand: p.dribbleHand,
        shotReleased: p.shotReleased,
        pose: [
          p.hips.position.y, p.hips.rotation.x, p.hips.rotation.y, p.hips.rotation.z,
          ...p.arms.flatMap((arm) => [
            arm.shoulder.rotation.x, arm.shoulder.rotation.z, arm.elbow.rotation.x,
            arm.hand.rotation.x, arm.hand.rotation.z,
          ]),
          ...p.legs.flatMap((leg) => [
            leg.hip.rotation.x, leg.hip.rotation.z, leg.knee.rotation.x,
          ]),
        ],
      })),
    });
    if (this.replayBuffer.length > 150) this.replayBuffer.shift();
  }

  _captureReplayPlayer(player) {
    return {
      id: player.id,
      position: player.root.position.toArray(),
      yaw: player.root.rotation.y,
      state: player.state,
      stateTime: player.stateTime,
      gaitPhase: player.gaitPhase,
      dribbleHand: player.dribbleHand,
      shotReleased: player.shotReleased,
      pose: [
        player.hips.position.y, player.hips.rotation.x, player.hips.rotation.y, player.hips.rotation.z,
        ...player.arms.flatMap((arm) => [
          arm.shoulder.rotation.x, arm.shoulder.rotation.z, arm.elbow.rotation.x,
          arm.hand.rotation.x, arm.hand.rotation.z,
        ]),
        ...player.legs.flatMap((leg) => [
          leg.hip.rotation.x, leg.hip.rotation.z, leg.knee.rotation.x,
        ]),
      ],
    };
  }

  _captureReplayRestore() {
    return {
      ball: this.ball.position.toArray(),
      players: this.players.map((player) => this._captureReplayPlayer(player)),
      camera: {
        position: this.camera.position.toArray(),
        target: this.cameraTarget.toArray(),
        fov: this.camera.fov,
      },
    };
  }

  queueHighlight(duration = 2.25) {
    if (!shouldQueueMadeShotReplay(this.mode)) return false;
    if (this.replayBuffer.length < 25) return false;
    const alreadyFrozen = this.replayFlow.frozen;
    if (!alreadyFrozen) this.replayControlsWereEnabled = this.controls.enabled;
    const restore = alreadyFrozen && this.replay?.restore
      ? this.replay.restore
      : this._captureReplayRestore();
    const token = this.replayFlow.requestHighlight({
      id: `score-${this.rulesSequence}-${Math.floor(this.elapsed * 1000)}`,
      queueDelay: this.options.reducedMotion ? 0 : 0.36,
    });
    const record = {
      frames: this.replayBuffer.slice(-80),
      elapsed: 0,
      duration,
      playing: false,
      queued: true,
      phase: REPLAY_FLOW_PHASES.QUEUED,
      flowToken: token,
      restore,
      scorerId: this.lastScorer?.id || this.ball.shotBy?.id || null,
      seed: Math.floor(this.elapsed * 1000) + this.players.length,
    };
    if (alreadyFrozen && this.replay) {
      if (this.replayQueue.length >= this.replayFlow.queueLimit) {
        this.replayQueue[this.replayQueue.length - 1] = record;
      } else {
        this.replayQueue.push(record);
      }
    } else {
      this.replay = record;
    }
    this.controls.setEnabled(false);
    this.events.emit("highlightqueued", {
      duration,
      token,
      pending: alreadyFrozen ? this.replayQueue.length : 0,
      phase: REPLAY_FLOW_PHASES.QUEUED,
      frozen: true,
    });
    return true;
  }

  playHighlight(token = this.replay?.flowToken) {
    if (!this.replay?.frames?.length || token !== this.replay.flowToken) return false;
    if (!this.replayFlow.startPlayback(token)) return false;
    this.replay.playing = true;
    this.replay.queued = false;
    this.replay.phase = REPLAY_FLOW_PHASES.PLAYING;
    this.replay.elapsed = 0;
    this.controls.setEnabled(false);
    this.events.emit("replay", {
      playing: true,
      phase: REPLAY_FLOW_PHASES.PLAYING,
      frozen: true,
      token,
      shot: "establish",
    });
    return true;
  }

  _processReplayFlowEvents() {
    let flowEvents = this.replayFlow.drainEvents();
    while (flowEvents.length > 0) {
      for (const event of flowEvents) {
        if (event.type === REPLAY_FLOW_EVENTS.PLAYBACK_READY) {
          if (this.options.reducedMotion) this.replayFlow.skip("reduced-motion", event.token);
          else this.playHighlight(event.token);
        } else if (event.type === REPLAY_FLOW_EVENTS.RESTORE_STARTED) {
          if (this.replay) {
            this.replay.playing = false;
            this.replay.queued = false;
            this.replay.phase = REPLAY_FLOW_PHASES.RESTORING;
            this.replay.restoreFrom ||= this._captureReplayRestore();
          }
          this.events.emit("replay", {
            playing: false,
            phase: REPLAY_FLOW_PHASES.RESTORING,
            frozen: true,
            token: event.token,
            reason: event.reason,
          });
        } else if (event.type === REPLAY_FLOW_EVENTS.RESTORE_COMPLETED) {
          if (this.replayQueue.length > 0) this.replay = this.replayQueue.shift();
        } else if (event.type === REPLAY_FLOW_EVENTS.RESUME) {
          this.replay = null;
          this.controls.setEnabled(!this.paused && this.replayControlsWereEnabled !== false);
          this.events.emit("replay", {
            playing: false,
            phase: REPLAY_FLOW_PHASES.IDLE,
            frozen: false,
            token: event.token,
          });
        }
      }
      flowEvents = this.replayFlow.drainEvents();
    }
  }

  _applyReplayPose(player, poseA, poseB, alpha, emphasis, isScorer) {
    if (!poseA || !poseB) return;
    const mix = (index) => lerp(poseA[index] || 0, poseB[index] || 0, alpha);
    player.hips.position.y = mix(0);
    player.hips.rotation.set(mix(1), mix(2), mix(3));
    let cursor = 4;
    for (const arm of player.arms) {
      arm.shoulder.rotation.x = mix(cursor++);
      arm.shoulder.rotation.z = mix(cursor++);
      arm.elbow.rotation.x = mix(cursor++);
      arm.hand.rotation.x = mix(cursor++);
      arm.hand.rotation.z = mix(cursor++);
    }
    for (const leg of player.legs) {
      leg.hip.rotation.x = mix(cursor++);
      leg.hip.rotation.z = mix(cursor++);
      leg.knee.rotation.x = mix(cursor++);
    }
    if (isScorer) {
      player.hips.position.y += emphasis.jumpLift - emphasis.landingCompression;
      player.hips.rotation.x += emphasis.torsoLean;
      const shootingArm = player.arms[player.dribbleHand > 0 ? 1 : 0];
      shootingArm.shoulder.rotation.x -= emphasis.shootingArmExtension * 0.16;
      shootingArm.hand.rotation.x -= emphasis.wristSnap * 0.72;
      const guideArm = player.arms[player.dribbleHand > 0 ? 0 : 1];
      guideArm.shoulder.rotation.z += guideArm.side * emphasis.shootingArmExtension * 0.12;
    }
  }

  _applyReplayRestoration(replay, mix) {
    const emptyEmphasis = {
      jumpLift: 0,
      landingCompression: 0,
      torsoLean: 0,
      shootingArmExtension: 0,
      wristSnap: 0,
    };
    for (const saved of replay.restore?.players || []) {
      const from = replay.restoreFrom?.players?.find((entry) => entry.id === saved.id) || saved;
      const player = this.players.find((candidate) => candidate.id === saved.id);
      if (!player) continue;
      player.root.position.fromArray(from.position).lerp(this._scratchC.fromArray(saved.position), mix);
      let yawDelta = saved.yaw - from.yaw;
      yawDelta = Math.atan2(Math.sin(yawDelta), Math.cos(yawDelta));
      player.root.rotation.y = from.yaw + yawDelta * mix;
      this._applyReplayPose(player, from.pose, saved.pose, mix, emptyEmphasis, false);
      if (mix >= 1) {
        player.state = saved.state;
        player.stateTime = saved.stateTime;
        player.gaitPhase = saved.gaitPhase;
        player.dribbleHand = saved.dribbleHand;
        player.shotReleased = saved.shotReleased;
      }
    }
    const fromBall = replay.restoreFrom?.ball || replay.restore?.ball;
    if (fromBall && replay.restore?.ball) {
      this.ball.position.fromArray(fromBall).lerp(this._scratchD.fromArray(replay.restore.ball), mix);
    }
    const fromCamera = replay.restoreFrom?.camera || replay.restore?.camera;
    const savedCamera = replay.restore?.camera;
    if (fromCamera && savedCamera) {
      this.camera.position.fromArray(fromCamera.position).lerp(this._scratchA.fromArray(savedCamera.position), mix);
      this.cameraTarget.fromArray(fromCamera.target).lerp(this._scratchB.fromArray(savedCamera.target), mix);
      this.camera.fov = lerp(fromCamera.fov, savedCamera.fov, mix);
      this.camera.updateProjectionMatrix();
      this.camera.lookAt(this.cameraTarget);
    }
  }

  _updateReplay(dt) {
    const replay = this.replay;
    if (!replay) return;
    if (this.replayFlow.phase === REPLAY_FLOW_PHASES.RESTORING) {
      this._applyReplayRestoration(replay, this.replayFlow.restorationMix);
      if (this.replayFlow.restoreReady) {
        // Restoration has been applied at 100%; this explicit acknowledgement
        // is the only path that can release the replay-owned simulation lock.
        this.replayFlow.confirmRestoration(replay.flowToken);
      }
      return;
    }
    if (!replay.playing || this.replayFlow.phase !== REPLAY_FLOW_PHASES.PLAYING) return;
    const currentProgress = clamp(replay.elapsed / replay.duration, 0, 1);
    const replayScorerPlayer = this.players.find((player) => player.id === replay.scorerId);
    const replayBasket = this._basketForTeam(replayScorerPlayer?.team || this.possessionTeam || "home");
    const currentBall = replay.frames[Math.min(
      replay.frames.length - 1,
      Math.floor(currentProgress * Math.max(0, replay.frames.length - 1)),
    )]?.ball || [replayBasket.x, replayBasket.y, replayBasket.z];
    const currentScorer = replay.frames[0]?.players?.find((entry) => entry.id === replay.scorerId)?.position || [0, 0, -2];
    const cameraBeat = sampleReplayCamera({
      progress: currentProgress,
      ball: currentBall,
      scorer: currentScorer,
      hoop: [replayBasket.x, replayBasket.y, replayBasket.z],
      seed: replay.seed,
      courtWidth: this.courtRuntime.width,
    });
    replay.elapsed += dt * cameraBeat.slowMotion;
    const normalized = clamp(replay.elapsed / replay.duration, 0, 1);
    const window = getReplayFrameWindow(replay.frames.length, normalized);
    const frameA = replay.frames[window.from];
    const frameB = replay.frames[window.to] || frameA;
    if (frameA && frameB) {
      this.ball.position.fromArray(frameA.ball).lerp(this._scratchD.fromArray(frameB.ball), window.alpha);
      const emphasis = sampleReplayPoseEmphasis(normalized);
      for (const dataA of frameA.players) {
        const dataB = frameB.players.find((entry) => entry.id === dataA.id) || dataA;
        const player = this.players.find((candidate) => candidate.id === dataA.id);
        if (!player) continue;
        player.root.position.fromArray(dataA.position).lerp(this._scratchC.fromArray(dataB.position), window.alpha);
        let yawDelta = dataB.yaw - dataA.yaw;
        yawDelta = Math.atan2(Math.sin(yawDelta), Math.cos(yawDelta));
        player.root.rotation.y = dataA.yaw + yawDelta * window.alpha;
        player.state = window.alpha < 0.5 ? dataA.state : dataB.state;
        player.stateTime = lerp(dataA.stateTime, dataB.stateTime, window.alpha);
        player.gaitPhase = lerp(dataA.gaitPhase, dataB.gaitPhase, window.alpha);
        player.dribbleHand = window.alpha < 0.5 ? dataA.dribbleHand : dataB.dribbleHand;
        player.shotReleased = window.alpha < 0.5 ? dataA.shotReleased : dataB.shotReleased;
        this._applyReplayPose(player, dataA.pose, dataB.pose, window.alpha, emphasis, player.id === replay.scorerId);
      }
      const cameraSample = sampleReplayCamera({
        progress: normalized,
        ball: this.ball.position.toArray(),
        scorer: (this.players.find((player) => player.id === replay.scorerId)?.root.position || this.ball.position).toArray(),
        hoop: [replayBasket.x, replayBasket.y, replayBasket.z],
        seed: replay.seed,
        courtWidth: this.courtRuntime.width,
      });
      this.camera.position.fromArray(cameraSample.position);
      this.cameraTarget.fromArray(cameraSample.target);
      this.camera.fov = cameraSample.fov;
      this.camera.updateProjectionMatrix();
      this.camera.lookAt(this.cameraTarget);
      this.camera.position.x += emphasis.cameraShake * Math.sin(replay.elapsed * 48);
    }
    if (normalized >= 1) {
      replay.playing = false;
      replay.phase = REPLAY_FLOW_PHASES.RESTORING;
      replay.restoreFrom = this._captureReplayRestore();
      this.replayFlow.completePlayback(replay.flowToken);
    }
  }

  getSnapshot() {
    return {
      version: ENGINE_VERSION,
      mode: this.mode,
      difficulty: this.difficulty,
      elapsed: this.elapsed,
      paused: this.paused,
      replay: this.replayFlow.getSnapshot(),
      score: { ...this.score },
      shotClock: this.shotClock,
      possessionTeam: this.possessionTeam,
      teamFouls: { ...this.teamFouls },
      venue: this.venue,
      qualityTier: this.qualityTier,
      physicsDroppedTime: this.physicsDroppedTime,
      shotCharge: this.shotCharge,
      shotQuality: this.lastShotQuality,
      freeThrow: this.freeThrowFlow.getState(),
      cameraMode: this.cameraMode,
      ball: {
        state: this.ball.state,
        ownerId: this.ball.owner?.id || null,
        position: this.ball.position.toArray(),
        velocity: this.ball.velocity.toArray(),
      },
      players: this.players.map((p) => ({
        id: p.id, name: p.name, team: p.team, state: p.state,
        controlled: p.controlled, stamina: p.stamina,
        position: p.root.position.toArray(),
      })),
      renderInfo: this.getRenderMetrics(),
    };
  }

  getRenderMetrics() {
    return {
      calls: this.renderer?.info?.render?.calls || 0,
      triangles: this.renderer?.info?.render?.triangles || 0,
      geometries: this.renderer?.info?.memory?.geometries || 0,
      textures: this.renderer?.info?.memory?.textures || 0,
      sceneId: this.mode,
      phase: this.paused ? "paused" : "live",
      players: this.players.length,
      externalAssetBytes: 0,
    };
  }

  reset(options = {}) {
    this.chargingShot = false;
    this.queuedRelease = null;
    this.activeDunk = null;
    this.activeArcRunGrab = null;
    this.shotCharge = 0;
    this.shotInputAction = "shoot";
    this.freeThrowFlow.reset();
    this.shotClock = this.mode === "open_gym" ? Infinity : 24;
    this.elapsed = 0;
    this.fixedAccumulator = 0;
    const replayWasFrozen = this.replayFlow.reset("engine-reset");
    this.replayFlow.drainEvents();
    this.replayBuffer.length = 0;
    this.replayQueue.length = 0;
    this.replay = null;
    this.controls.setEnabled(!this.paused);
    this.replayControlsWereEnabled = undefined;
    if (replayWasFrozen) {
      this.events.emit("replay", {
        playing: false,
        phase: REPLAY_FLOW_PHASES.IDLE,
        frozen: false,
        reason: "engine-reset",
      });
    }
    this._scoredOnFlight = false;
    this.ball.freeThrow = false;
    this.ball.bankResolved = false;
    this.ball.maxBackboardContacts = Infinity;
    this.ball.rimContactCooldown = 0;
    this.deadBallCooldown = 0;
    this.netPulse = 0;
    this.scoreRingPulse = 0;
    this.scoreRing.material.opacity = 0;
    this.highlightPending = 0;
    if (!options.keepScore) {
      this.score = { home: 0, away: 0 };
      this.teamFouls = { home: 0, away: 0 };
    }
    this.players.forEach((player, index) => {
      const defaultX = index === 0 ? 0 : (index % 2 ? 0.7 : -1.4);
      const defaultZ = index === 0 ? 3.7 : 0.7 + Math.floor(index / 2) * 1.3;
      player.root.position.set(defaultX, 0, defaultZ);
      player.velocity.set(0, 0, 0);
      player.desiredVelocity.set(0, 0, 0);
      player.facing.set(0, 0, -1);
      player.root.rotation.y = Math.PI;
      player.stamina = 1;
      player.grounded = true;
      player.jumpVelocity = 0;
      player.actionLock = 0;
      player.blockWindow = 0;
      player.blockConnected = false;
      player.dribbleMove = null;
      player.queuedDribbleMove = null;
      player.dribbleTransition = null;
      player.dribbleMoveStartedAt = -Infinity;
      player.dribbleMoveProgress = 0;
      player.dribbleMoveHandCommitted = true;
      player.shotReleased = false;
      player.shotElapsed = 0;
      player.shotReleaseElapsed = 0;
      player.shotStartedAt = -Infinity;
      player.shotReleasedAt = -Infinity;
      player.dunkSelection = null;
      player.dunkProgress = 0;
      player.dunkStartedAt = -Infinity;
      player.landingImpact = 0;
      player.dribbleMoveTime = 0;
      player.handleTrailTimer = 0;
      player.lastHandleInputAt = -Infinity;
      player.lastHandleMoveAt = -Infinity;
      player.handleComboCount = 0;
      player.smoothedSpeed = 0;
      player.locomotionBlend = 0;
      player.sprintBlend = 0;
      player.defenseBlend = 0;
      player.ballHandlerGuardBlend = 0;
      player.arcRunGrab = null;
      player.airborneBlend = 0;
      player.gaitPhase = player.animationPhaseOffset;
      player.setState(PLAYER_STATES.IDLE, true);
      player.hasBall = false;
    });
    const owner = this.controlledPlayer || this.players[0];
    if (owner) {
      this.ball.pickupCooldown = 0;
      this.givePossession(owner, true);
    } else {
      this.ball.owner = null;
      this.ball.position.set(0, 1, 3.7);
    }
    this.events.emit("reset", { score: { ...this.score }, mode: this.mode });
  }

  render() {
    this.renderer.render(this.scene, this.camera);
  }

  on(type, fn) { return this.events.on(type, fn); }

  destroy() {
    if (this.destroyed) return;
    this.stop();
    this.destroyed = true;
    this._resizeObserver?.disconnect();
    if (this._resizeHandler) window.removeEventListener("resize", this._resizeHandler);
    if (this.ownsControls) this.controls.destroy();
    for (const player of [...this.players]) player.dispose();
    this.scene.traverse((node) => {
      node.geometry?.dispose?.();
      if (Array.isArray(node.material)) node.material.forEach((m) => m.dispose?.());
      else node.material?.dispose?.();
    });
    this.park?.dispose?.();
    for (const texture of this.generatedTextures) texture.dispose?.();
    this.generatedTextures.length = 0;
    this.renderer.dispose();
    this.renderer.domElement.remove();
    this.events.clear();
  }
}

export default NovaCourtEngine;
