import { NovaCourtEngine, PLAYER_STATES, COURT, ProceduralPlayer } from "./engine.js?v=6.3";
import { createAIDirector } from "./ai.js?v=5.0";
import { createGameMode, MODE_IDS, MODE_PHASES } from "./modes.js";
import { createPracticeMode, PRACTICE_MODE_ID } from "./practice.js";
import { createHalfCourtDuosMode } from "./half-court-duos-mode.js";
import { createHalfCourtQuadsMode } from "./half-court-quads-mode.js";
import { createFullCourtFiveOnFiveMode } from "./full-court-mode.js";
import { createCourtRuntime } from "./court-runtime.js";
import {
  createTeamRoster,
  getFormatForModeKey,
  isTeamModeKey,
  restartSpotForTeam,
  TEAM_FORMAT_IDS,
} from "./team-formats.js";
import { allowsRestart, cameraPresetForTeamMode } from "./team-mode-ui.js";
import { createAnnouncerRuntime } from "./announcer-runtime.js?v=2.0";
import { createAudioController } from "./audio.js?v=2.0";
import { createUIController } from "./ui.js";
import { createPresentationDirector } from "./presentation-director.js";
import {
  normalizeShootingAssist,
  shootingAssistDisplay,
} from "./shooting-assist.js";
import {
  BALL_SELECTION_OPTIONS,
  createBallSelectionPreview,
  cycleBallSelection,
  getBallSelectionOption,
} from "./ball-selection.js?v=1.0";
import {
  createThreePointRackVisuals,
  getThreePointRackPresentation,
} from "./three-point-contest.js?v=1.8";
import {
  BASKETBALL_SHOE_COLORWAYS,
  BASKETBALL_SHOE_STYLES,
} from "./basketball-shoes.js?v=1.3";
import {
  ATTRIBUTE_GROUPS,
  ATTRIBUTE_LABELS,
  COSMETIC_PALETTES,
  POSITION_PRESETS,
  awardMatch,
  equipCosmetic,
  getAvailableTitles,
  getEnginePlayerConfig,
  getProfileSummary,
  getUpgradeCost,
  loadProfile,
  purchaseCosmetic,
  saveProfile,
  selectPosition,
  selectTitle,
  updatePlayerIdentity,
  upgradeAttribute,
} from "./player-progression.js";
import {
  formatPlayerHeight,
  HAIR_STYLES,
  SKIN_TONES,
} from "./player-appearance.js?v=1.0";
import { normalizeBasketballJerseyParameters } from "./basketball-jersey.js?v=1.0";
import {
  createVenueSelectionPreview,
  cycleVenueSelection,
  getVenueOption,
  loadVenueSelection,
  saveVenueSelection,
  VENUE_OPTIONS,
} from "./venue-selection.js?v=1.0";
import { createProductionVenueLoader } from "./production-venue-loader.js?v=1.0";
import {
  getGameplayHudPolicy,
  getPlayerCardContent,
} from "./hud-presentation.js?v=1.0";
import { applyGameplayHudVisibility } from "./gameplay-hud-visibility.js?v=1.0";

const $ = (selector, root = document) => root.querySelector(selector);
const $$ = (selector, root = document) => [...root.querySelectorAll(selector)];
const clamp = (value, min = 0, max = 1) => Math.max(min, Math.min(max, value));

const MODE_MAP = Object.freeze({
  street: MODE_IDS.STREET_1V1,
  duos: TEAM_FORMAT_IDS.DUOS,
  threePoint: MODE_IDS.THREE_POINT_CONTEST,
  team: MODE_IDS.HALF_COURT_3V3,
  quads: TEAM_FORMAT_IDS.QUADS,
  fives: TEAM_FORMAT_IDS.FULL_FIVE,
  practice: PRACTICE_MODE_ID,
});

const MODE_META = Object.freeze({
  street: { label: "NOVA PARK", home: "NOVA", away: "ECLIPSE", objective: "FIRST TO 11" },
  duos: { label: "NOVA DUOS", home: "NOVA", away: "ECLIPSE", objective: "FIRST TO 13" },
  threePoint: { label: "ARC RUN", home: "SCORE", away: "TARGET", objective: "60 SECONDS" },
  team: { label: "NIGHT THREES", home: "NOVA", away: "ECLIPSE", objective: "FIRST TO 15" },
  quads: { label: "NOVA FOURS", home: "NOVA", away: "ECLIPSE", objective: "FIRST TO 19" },
  fives: { label: "NOVA FIVE", home: "NOVA", away: "ECLIPSE", objective: "6 MINUTES" },
  practice: { label: "OPEN GYM", home: "MAKES", away: "ATTEMPTS", objective: "NO CLOCK" },
});

const audio = createAudioController();
const ui = createUIController({ root: document, audio });
const announcer = createAnnouncerRuntime({
  audio,
  ui,
  getVolume: () => ui.settings.muted ? 0 : 0.75,
});
const app = $("#app");
const gameRoot = $("#game-root");
const profileSessionId = `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
let playerProfile = loadProfile();
let engine = null;
let mode = null;
let ai = null;
let currentModeKey = "street";
let currentDifficulty = "pro";
let gameActive = false;
let runToken = 0;
let pendingShot = null;
let lastFrame = performance.now();
let aiActionTimes = new Map();
let selectedModeKey = "street";
let audioUnlocked = false;
let aiAccumulator = 0;
let hudAccumulator = 0;
let presentationDirector = null;
let presentationKind = null;
let ballSelectionPreview = null;
let pendingModeKey = "street";
let pendingBallStyle = ui.settings.ballStyle;
let ballSelectionOrigin = "modes";
let venueSelectionPreview = null;
let pendingVenueId = loadVenueSelection();
let activeVenueLoader = null;
let contestRackVisuals = null;
let sceneLoadState = {
  sceneId: "boot",
  phase: "idle",
  progress: 0,
  loadedIds: [],
  loadErrors: [],
  activeGroupId: null,
  venueId: pendingVenueId,
};
const ONBOARDING_STEPS = Object.freeze(["identity", "appearance", "attributes", "review"]);
let onboardingStep = "identity";
let onboardingPreview = null;

const compat = document.createElement("link");
compat.rel = "stylesheet";
compat.href = "./js/compat.css?v=7.0";
document.head.append(compat);
for (const href of [
  "./js/ui-menu-polish.css?v=1.1",
  "./js/ui-hud-polish.css?v=1.2",
  "./js/ui-profile-polish.css?v=1.1",
  "./js/ui-shooting-settings.css?v=1.0",
  "./js/ui-ball-selection.css?v=1.4",
  "./js/ui-venue-selection.css?v=1.0",
]) {
  const stylesheet = document.createElement("link");
  stylesheet.rel = "stylesheet";
  stylesheet.href = href;
  document.head.append(stylesheet);
}

function setHidden(node, hidden) {
  if (!node) return;
  node.classList.toggle("is-hidden", hidden);
  node.hidden = hidden;
  node.setAttribute("aria-hidden", String(hidden));
}

function updateSceneLoading(sceneId, phase, progress, loadedIds = sceneLoadState.loadedIds, detail = {}) {
  const nextProgress = Math.max(
    sceneLoadState.sceneId === sceneId ? sceneLoadState.progress : 0,
    Math.min(1, progress),
  );
  sceneLoadState = {
    sceneId,
    phase,
    progress: nextProgress,
    loadedIds: [...new Set(loadedIds)],
    loadErrors: detail.loadErrors || (sceneLoadState.sceneId === sceneId ? sceneLoadState.loadErrors : []),
    activeGroupId: detail.groupId ?? null,
    venueId: detail.venueId || sceneLoadState.venueId || pendingVenueId,
    token: detail.token ?? sceneLoadState.token ?? 0,
  };
  const label = {
    shell: "Preparing court fallback…",
    required: "Loading court, hoops, and players…",
    optional: "Adding venue details…",
    ready: "Court ready.",
  }[phase] || "Preparing NOVA COURT…";
  if ($("#loader-fill")) $("#loader-fill").style.width = `${Math.round(nextProgress * 100)}%`;
  if ($("#loader-copy")) $("#loader-copy").textContent = label;
}

function showMainMenu() {
  gameActive = false;
  ballSelectionPreview?.setVisible(false);
  venueSelectionPreview?.setVisible(false);
  resetShotMeter();
  audio.setMusicMode("street");
  announcer.stop();
  if (presentationKind !== "attract") startAttractMode();
  engine?.setPaused(false);
  engine?.controls?.setEnabled(false);
  setHidden($("#loading-screen"), true);
  setHidden($("#mode-select"), true);
  setHidden($("#ball-select"), true);
  setHidden($("#venue-select"), true);
  setHidden($("#pause-screen"), true);
  setHidden($("#game-over"), true);
  setHidden($("#controls-screen"), true);
  setHidden($("#settings-screen"), true);
  setHidden($("#my-player-screen"), true);
  setHidden($("#create-player-screen"), true);
  setHidden($("#tutorial-screen"), true);
  setHidden($("#hud"), true);
  showArcRunCountdown();
  setHidden($("#main-menu"), false);
  app.dataset.state = "menu";
  renderPlayerProfile();
}

function showModeSelect() {
  engine?.setPaused(true);
  ballSelectionPreview?.setVisible(false);
  venueSelectionPreview?.setVisible(false);
  resetShotMeter();
  showArcRunCountdown();
  for (const id of ["main-menu", "my-player-screen", "ball-select", "venue-select", "pause-screen", "game-over", "controls-screen", "settings-screen", "tutorial-screen"]) {
    setHidden($(`#${id}`), true);
  }
  setHidden($("#mode-select"), false);
  app.dataset.state = "modes";
  $("#mode-select").scrollTop = 0;
  $(".mode-card.is-selected")?.focus({ preventScroll: true });
  requestAnimationFrame(() => { $("#mode-select").scrollTop = 0; });
}

function showGame() {
  ballSelectionPreview?.setVisible(false);
  venueSelectionPreview?.setVisible(false);
  for (const id of ["main-menu", "my-player-screen", "mode-select", "ball-select", "venue-select", "pause-screen", "game-over", "controls-screen", "settings-screen"]) {
    setHidden($(`#${id}`), true);
  }
  setHidden($("#hud"), false);
  app.dataset.gameMode = currentModeKey;
  app.dataset.state = "playing";
  engine?.renderer?.domElement?.focus?.();
}

function showOverlay(id) {
  setHidden($(`#${id}`), false);
}

function hideOverlay(id) {
  setHidden($(`#${id}`), true);
}

function resetShotMeter() {
  const meter = $("#shot-meter");
  meter?.classList.remove("is-active", "is-result");
  meter?.setAttribute("aria-hidden", "true");
  meter?.removeAttribute("data-quality");
  meter?.removeAttribute("data-tone");
}

function ensureBallSelectionPreview() {
  if (!ballSelectionPreview) {
    ballSelectionPreview = createBallSelectionPreview({
      T: globalThis.THREE,
      container: $("#ball-preview"),
      initialStyle: pendingBallStyle,
      reducedMotion: ui.settings.reducedMotion,
    });
  }
  return ballSelectionPreview;
}

function renderBallSelection() {
  const option = getBallSelectionOption(pendingBallStyle);
  const modeMeta = MODE_META[pendingModeKey] || MODE_META.street;
  $("#ball-mode-label").textContent = modeMeta.label;
  $("#ball-mode-objective").textContent = `${modeMeta.objective} / ${currentDifficulty.toUpperCase()} DIFFICULTY`;
  $("#ball-edition").textContent = option.edition;
  $("#ball-name").textContent = option.name;
  $("#ball-finish").textContent = option.finish;
  $("#ball-description").textContent = option.description;
  $("#confirm-ball-selection strong").textContent = "CHOOSE GYM / VENUE";
  $("#ball-selection-dots").replaceChildren(...BALL_SELECTION_OPTIONS.map((candidate) => {
    const dot = document.createElement("span");
    dot.classList.toggle("is-selected", candidate.id === option.id);
    return dot;
  }));
  const preview = ensureBallSelectionPreview();
  preview.setStyle(option.id);
  document.documentElement.style.setProperty("--ball-selection-accent", option.accent);
}

function showBallSelection(modeKey = selectedModeKey, origin = "modes") {
  pendingModeKey = MODE_META[modeKey] ? modeKey : "street";
  selectedModeKey = pendingModeKey;
  pendingBallStyle = ui.settings.ballStyle;
  ballSelectionOrigin = origin === "menu" ? "menu" : "modes";
  currentDifficulty = $("#difficulty-select")?.value || currentDifficulty || "pro";
  gameActive = false;
  engine?.setPaused(true);
  engine?.controls?.setEnabled(false);
  resetShotMeter();
  venueSelectionPreview?.setVisible(false);
  for (const id of ["main-menu", "my-player-screen", "mode-select", "venue-select", "pause-screen", "game-over", "controls-screen", "settings-screen", "tutorial-screen", "hud"]) {
    setHidden($(`#${id}`), true);
  }
  setHidden($("#ball-select"), false);
  app.dataset.state = "ball-select";
  audio.setMusicMode(pendingModeKey);
  renderBallSelection();
  requestAnimationFrame(() => {
    ballSelectionPreview?.setVisible(true);
    $("#confirm-ball-selection")?.focus({ preventScroll: true });
  });
}

function moveBallSelection(direction) {
  pendingBallStyle = cycleBallSelection(pendingBallStyle, direction);
  renderBallSelection();
  audio.playSfx("ui");
}

function leaveBallSelection() {
  ballSelectionPreview?.setVisible(false);
  if (ballSelectionOrigin === "menu") showMainMenu();
  else showModeSelect();
}

function confirmBallSelection() {
  const selected = getBallSelectionOption(pendingBallStyle);
  ui.applySettings({ ...ui.settings, ballStyle: selected.id });
  ballSelectionPreview?.setVisible(false);
  showVenueSelection();
}

function ensureVenueSelectionPreview() {
  if (!venueSelectionPreview) {
    venueSelectionPreview = createVenueSelectionPreview({
      T: globalThis.THREE,
      container: $("#venue-preview"),
      initialVenue: pendingVenueId,
      quality: $("#quality-select")?.value === "performance" ? "low" : "medium",
      reducedMotion: ui.settings.reducedMotion,
    });
  }
  return venueSelectionPreview;
}

function renderVenueSelection() {
  const option = getVenueOption(pendingVenueId);
  const modeMeta = MODE_META[pendingModeKey] || MODE_META.street;
  $("#venue-mode-label").textContent = modeMeta.label;
  $("#venue-ball-label").textContent =
    `${getBallSelectionOption(ui.settings.ballStyle).name} / ${currentDifficulty.toUpperCase()} DIFFICULTY`;
  $("#venue-edition").textContent = option.edition;
  $("#venue-name").textContent = option.name;
  $("#venue-capacity").textContent = option.capacity;
  $("#venue-description").textContent = option.description;
  $("#confirm-venue-selection strong").textContent = pendingModeKey === "practice"
    ? "ENTER OPEN GYM"
    : `ENTER ${modeMeta.label}`;
  $("#venue-selection-dots").replaceChildren(...VENUE_OPTIONS.map((candidate) => {
    const dot = document.createElement("span");
    dot.classList.toggle("is-selected", candidate.id === option.id);
    return dot;
  }));
  ensureVenueSelectionPreview().setVenue(option.id);
  document.documentElement.style.setProperty("--venue-accent", option.accent);
}

function showVenueSelection(venueId = loadVenueSelection()) {
  pendingVenueId = getVenueOption(venueId).id;
  gameActive = false;
  engine?.setPaused(true);
  engine?.controls?.setEnabled(false);
  ballSelectionPreview?.setVisible(false);
  for (const id of ["main-menu", "my-player-screen", "mode-select", "ball-select", "pause-screen", "game-over", "controls-screen", "settings-screen", "tutorial-screen", "hud"]) {
    setHidden($(`#${id}`), true);
  }
  setHidden($("#venue-select"), false);
  app.dataset.state = "venue-select";
  renderVenueSelection();
  requestAnimationFrame(() => {
    venueSelectionPreview?.setVisible(true);
    $("#confirm-venue-selection")?.focus({ preventScroll: true });
  });
}

function moveVenueSelection(direction) {
  pendingVenueId = cycleVenueSelection(pendingVenueId, direction);
  renderVenueSelection();
  audio.playSfx("ui");
}

function leaveVenueSelection() {
  venueSelectionPreview?.setVisible(false);
  showBallSelection(pendingModeKey, ballSelectionOrigin);
}

function confirmVenueSelection() {
  pendingVenueId = saveVenueSelection(pendingVenueId);
  venueSelectionPreview?.setVisible(false);
  startMode(pendingModeKey);
}

function renderShootingAssistSetting(value = ui.settings.shootingAssist) {
  const display = shootingAssistDisplay(value);
  const slider = $("#shooting-assist");
  const output = $("#shooting-assist-output");
  const preview = $(".shooting-assist-preview");
  if (slider) slider.value = String(Math.round(display.assist * 100));
  if (output) output.value = `${display.label} · ${display.windowPercent.toFixed(1)}% GREEN`;
  preview?.style.setProperty("--assist-window-start", `${(0.72 - display.halfWidth) * 100}%`);
  preview?.style.setProperty("--assist-window-width", `${display.windowPercent}%`);
  return display;
}

async function unlockAudio() {
  if (audioUnlocked) {
    await audio.resume();
    return;
  }
  audioUnlocked = true;
  await audio.init();
  await audio.startMusic();
}

function feedback(text, tone = "neutral", duration = 900) {
  const node = $("#feedback");
  if (!node) return;
  node.textContent = text;
  node.dataset.tone = tone;
  node.classList.remove("is-visible");
  requestAnimationFrame(() => node.classList.add("is-visible"));
  clearTimeout(feedback.timer);
  feedback.timer = setTimeout(() => node.classList.remove("is-visible"), duration);
}

function showArcRunCountdown(seconds = null) {
  const overlay = $("#arc-run-countdown");
  if (!overlay) return;
  const visible = currentModeKey === "threePoint" && Number(seconds) > 0;
  if (visible) {
    const value = String(Math.ceil(Number(seconds)));
    $("#arc-run-countdown-number").textContent = value;
    overlay.dataset.seconds = value;
  }
  setHidden(overlay, !visible);
}

function profileMessage(text, tone = "neutral") {
  const node = $("#profile-status");
  if (!node) return;
  node.textContent = text;
  node.dataset.tone = tone;
}

function commitProfile(nextProfile, message = "Build saved.", tone = "good") {
  playerProfile = saveProfile(nextProfile);
  renderPlayerProfile();
  profileMessage(message, tone);
}

function onboardingJerseyStyle() {
  return normalizeBasketballJerseyParameters({
    fit: $("#create-player-jersey-fit")?.value,
    length: $("#create-player-jersey-length")?.value,
    hemFlare: $("#create-player-jersey-hem")?.value,
    sidePanelWidth: $("#create-player-jersey-panel")?.value,
    fabricResponse: $("#create-player-jersey-fabric")?.value,
  });
}

function updateJerseyControlOutputs(root = document) {
  const mappings = [
    ["#create-player-jersey-length", (value) => `${(value / 0.0254).toFixed(1)} IN`],
    ["#create-player-jersey-hem", (value) => `${(value * 100).toFixed(1)} CM`],
    ["#create-player-jersey-panel", (value) => `${(value * 100).toFixed(1)} CM`],
    ["#create-player-jersey-fabric", (value) => `${Math.round(value * 100)}%`],
    ["#jersey-fit", (value) => `${Math.round(value * 100)}%`],
    ["#jersey-length", (value) => `${(value / 0.0254).toFixed(1)} IN`],
    ["#jersey-hem", (value) => `${(value * 100).toFixed(1)} CM`],
    ["#jersey-panel", (value) => `${(value * 100).toFixed(1)} CM`],
    ["#jersey-fabric", (value) => `${Math.round(value * 100)}%`],
  ];
  for (const [selector, formatter] of mappings) {
    const input = root.querySelector?.(selector);
    if (input?.nextElementSibling) input.nextElementSibling.value = formatter(Number(input.value));
  }
}

function disposePreviewPlayer(preview) {
  if (!preview?.player) return;
  preview.player.root.traverse((node) => {
    node.geometry?.dispose?.();
    if (Array.isArray(node.material)) node.material.forEach((material) => material.dispose?.());
    else node.material?.dispose?.();
  });
  preview.player.root.removeFromParent();
  preview.player = null;
  preview.engine.generatedTextures.splice(0).forEach((texture) => texture.dispose?.());
}

function rebuildOnboardingPreview() {
  if (!onboardingPreview) return;
  disposePreviewPlayer(onboardingPreview);
  const hairStyle = $("#create-player-hair")?.value || "crop";
  const skinTone = SKIN_TONES.find((item) => item.id === $("#create-player-skin")?.value)
    || SKIN_TONES.find((item) => item.id === "warm-brown")
    || SKIN_TONES[0];
  const palette = COSMETIC_PALETTES.find((item) => item.id === playerProfile.cosmetics.equipped)
    || COSMETIC_PALETTES[0];
  const player = new ProceduralPlayer(onboardingPreview.engine, {
    id: "onboarding-preview-player",
    name: $("#create-player-name")?.value || "Ace Nova",
    team: "home",
    position: new globalThis.THREE.Vector3(),
    height: $("#create-player-height")?.value,
    jerseyNumber: $("#create-player-number")?.value,
    hairStyle,
    skinColor: skinTone.color,
    shoeStyleId: $("#create-player-shoe-style")?.value,
    shoeColorwayId: $("#create-player-shoe-colorway")?.value,
    jerseyStyle: onboardingJerseyStyle(),
    primary: palette.colors.primary,
    accent: palette.colors.accent,
    shoeColor: palette.colors.shoes,
    controlled: false,
    isAI: false,
  });
  player.marker.visible = false;
  onboardingPreview.player = player;
}

function ensureOnboardingPreview() {
  if (onboardingPreview || !$("#create-player-preview") || !globalThis.THREE) return;
  const T = globalThis.THREE;
  const stage = $("#create-player-preview");
  const scene = new T.Scene();
  scene.background = new T.Color(0x03090d);
  const camera = new T.PerspectiveCamera(34, 1, 0.05, 30);
  camera.position.set(2.25, 1.45, 4.35);
  camera.lookAt(0, 1.02, 0);
  const renderer = new T.WebGLRenderer({ antialias: true, alpha: false });
  renderer.outputColorSpace = T.SRGBColorSpace;
  renderer.toneMapping = T.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 1.08;
  renderer.shadowMap.enabled = true;
  renderer.setPixelRatio(Math.min(devicePixelRatio || 1, 1.5));
  renderer.domElement.setAttribute("aria-label", "Live three-dimensional player preview");
  stage.append(renderer.domElement);
  const playerRoot = new T.Group();
  scene.add(playerRoot);
  const previewEngine = {
    T,
    _nextPlayerId: 1,
    playerRoot,
    generatedTextures: [],
    elapsed: 0,
    fixedAccumulator: 0,
    ball: { owner: null, position: new T.Vector3() },
    events: { emit() {} },
  };
  const floor = new T.Mesh(
    new T.CircleGeometry(1.5, 48),
    new T.MeshStandardMaterial({ color: 0x0b1820, roughness: 0.62, metalness: 0.1 }),
  );
  floor.rotation.x = -Math.PI / 2;
  floor.receiveShadow = true;
  scene.add(floor);
  scene.add(new T.HemisphereLight(0xcaf4ff, 0x111015, 1.55));
  const key = new T.DirectionalLight(0xffe8d8, 3.2);
  key.position.set(3.5, 6, 4);
  key.castShadow = true;
  scene.add(key);
  const rim = new T.DirectionalLight(0x4fe9ff, 1.9);
  rim.position.set(-4, 3, -2);
  scene.add(rim);
  onboardingPreview = {
    stage,
    scene,
    camera,
    renderer,
    engine: previewEngine,
    player: null,
    elapsed: 0,
  };
  const resize = () => {
    const width = Math.max(1, stage.clientWidth);
    const height = Math.max(1, stage.clientHeight);
    renderer.setSize(width, height, false);
    camera.aspect = width / height;
    camera.updateProjectionMatrix();
  };
  new ResizeObserver(resize).observe(stage);
  resize();
  rebuildOnboardingPreview();
  let previous = performance.now();
  const renderPreview = (now) => {
    if (!onboardingPreview) return;
    const dt = Math.min(0.05, (now - previous) / 1000);
    previous = now;
    if (onboardingStep === "appearance" && !$("#create-player-screen")?.classList.contains("is-hidden")) {
      onboardingPreview.elapsed += dt;
      const wave = Math.sin(onboardingPreview.elapsed * 2.3);
      onboardingPreview.player?.jerseyRig?.update(dt, {
        lateralSpeed: wave * 2.2,
        forwardSpeed: 1.1,
        torsoYaw: wave * 0.24,
      });
      if (onboardingPreview.player) onboardingPreview.player.root.rotation.y = wave * 0.13;
      renderer.render(scene, camera);
    }
    requestAnimationFrame(renderPreview);
  };
  requestAnimationFrame(renderPreview);
}

function renderOnboardingAttributes() {
  const root = $("#create-player-attribute-summary");
  if (!root) return;
  const build = playerProfile.builds.PG;
  const groups = Object.entries(ATTRIBUTE_GROUPS).slice(0, 6);
  root.replaceChildren(...groups.map(([name, keys]) => {
    const article = document.createElement("article");
    const rows = keys.slice(0, 4).map((key) =>
      `<div><dt>${ATTRIBUTE_LABELS[key]}</dt><dd>${build.attributes[key]}</dd></div>`).join("");
    article.innerHTML = `<h3>${name}</h3><dl>${rows}</dl>`;
    return article;
  }));
}

function renderOnboardingReview() {
  const root = $("#create-player-review");
  if (!root) return;
  const escapeHtml = (value) => String(value ?? "").replace(/[&<>"']/g, (character) => ({
    "&": "&amp;",
    "<": "&lt;",
    ">": "&gt;",
    "\"": "&quot;",
    "'": "&#39;",
  })[character]);
  const jerseyStyle = onboardingJerseyStyle();
  const hair = HAIR_STYLES.find((item) => item.id === $("#create-player-hair")?.value)?.name || "Close Crop";
  const skin = SKIN_TONES.find((item) => item.id === $("#create-player-skin")?.value)?.name || "Warm Brown";
  const shoe = BASKETBALL_SHOE_STYLES.find((item) => item.id === $("#create-player-shoe-style")?.value)?.name || "NOVA Flight";
  root.innerHTML = `
    <article><h3>Identity</h3><dl>
      <div><dt>Name</dt><dd>${escapeHtml($("#create-player-name")?.value || "Ace Nova")}</dd></div>
      <div><dt>Number</dt><dd>#${$("#create-player-number")?.value || 1}</dd></div>
      <div><dt>Height</dt><dd>${formatPlayerHeight($("#create-player-height")?.value)}</dd></div>
    </dl></article>
    <article><h3>Appearance</h3><dl>
      <div><dt>Hair</dt><dd>${hair}</dd></div>
      <div><dt>Skin</dt><dd>${skin}</dd></div>
      <div><dt>Shoes</dt><dd>${shoe}</dd></div>
    </dl></article>
    <article><h3>Jersey</h3><dl>
      <div><dt>Fit</dt><dd>${Math.round(jerseyStyle.fit * 100)}%</dd></div>
      <div><dt>Length</dt><dd>${(jerseyStyle.length / 0.0254).toFixed(1)} in</dd></div>
      <div><dt>Fabric</dt><dd>${Math.round(jerseyStyle.fabricResponse * 100)}%</dd></div>
    </dl></article>
    <article><h3>Starting build</h3><dl>
      <div><dt>Position</dt><dd>Point Guard</dd></div>
      <div><dt>Archetype</dt><dd>${POSITION_PRESETS.PG.archetype}</dd></div>
      <div><dt>Overall</dt><dd>${getProfileSummary(playerProfile).overall}</dd></div>
    </dl></article>`;
}

function setOnboardingStep(step, { focus = true } = {}) {
  if (!ONBOARDING_STEPS.includes(step)) return false;
  onboardingStep = step;
  $$("[data-wizard-step]").forEach((panel) => {
    const active = panel.dataset.wizardStep === step;
    panel.classList.toggle("is-hidden", !active);
    panel.hidden = !active;
    panel.setAttribute("aria-hidden", String(!active));
  });
  $$("#create-player-steps li").forEach((item, index) => {
    const current = ONBOARDING_STEPS.indexOf(step);
    if (index === current) item.setAttribute("aria-current", "step");
    else item.removeAttribute("aria-current");
    item.classList.toggle("is-complete", index < current);
  });
  if (step === "appearance") {
    ensureOnboardingPreview();
    rebuildOnboardingPreview();
  } else if (step === "attributes") {
    renderOnboardingAttributes();
  } else if (step === "review") {
    renderOnboardingReview();
  }
  if (focus) {
    const panel = $(`[data-wizard-step="${step}"]`);
    requestAnimationFrame(() => panel?.querySelector("input, select, button")?.focus());
  }
  return true;
}

function renderPlayerProfile() {
  const summary = getProfileSummary(playerProfile);
  const build = playerProfile.builds[summary.position];
  const preset = POSITION_PRESETS[summary.position];
  const nextXp = summary.nextLevelXp;
  const levelStart = (summary.level - 1) ** 2 * 120;
  const xpProgress = nextXp ? clamp((summary.xp - levelStart) / Math.max(1, nextXp - levelStart)) : 1;
  $("#profile-credits").textContent = `${summary.credits.toLocaleString()} CR`;
  $("#profile-overall").textContent = summary.overall;
  $("#profile-position-name").textContent = summary.positionName.toUpperCase();
  $("#profile-archetype").textContent = summary.archetype.toUpperCase();
  $("#profile-level").textContent = summary.level;
  $("#profile-games").textContent = summary.games;
  $("#profile-wins").textContent = summary.wins;
  $("#profile-xp-label").textContent = nextXp ? `${summary.xp} / ${nextXp} XP` : "MAX LEVEL";
  $("#profile-xp-fill").style.width = `${Math.round(xpProgress * 100)}%`;
  $("#menu-player-summary").textContent = `${summary.displayName} · ${summary.title.name} · ${summary.overall} OVR`;
  $("#profile-display-name").textContent = summary.displayName.toUpperCase();
  $("#profile-title").textContent = summary.title.name;
  $("#player-card-name").textContent = summary.displayName.toUpperCase();
  $("#player-card-meta").textContent = `#${String(summary.jerseyNumber).padStart(2, "0")} · ${summary.title.name} · ${summary.overall} OVR`;
  const identityName = $("#identity-name");
  if (identityName && document.activeElement !== identityName) identityName.value = summary.displayName === "UNNAMED PLAYER" ? "" : summary.displayName;
  const jerseyNumber = $("#jersey-number");
  if (jerseyNumber && document.activeElement !== jerseyNumber) jerseyNumber.value = summary.jerseyNumber;
  const playerHeight = $("#player-height");
  if (playerHeight && document.activeElement !== playerHeight) playerHeight.value = summary.heightM.toFixed(2);
  if ($("#player-height-output")) $("#player-height-output").textContent = formatPlayerHeight(summary.heightM);
  const jerseyInputs = {
    "#jersey-fit": summary.jerseyStyle.fit,
    "#jersey-length": summary.jerseyStyle.length,
    "#jersey-hem": summary.jerseyStyle.hemFlare,
    "#jersey-panel": summary.jerseyStyle.sidePanelWidth,
    "#jersey-fabric": summary.jerseyStyle.fabricResponse,
  };
  for (const [selector, value] of Object.entries(jerseyInputs)) {
    const input = $(selector);
    if (input && document.activeElement !== input) input.value = String(value);
  }
  updateJerseyControlOutputs();

  const positions = $("#position-tabs");
  positions.replaceChildren(...Object.entries(POSITION_PRESETS).map(([key, value]) => {
    const button = document.createElement("button");
    button.type = "button";
    button.className = `position-tab${key === summary.position ? " is-selected" : ""}`;
    button.dataset.position = key;
    button.setAttribute("aria-pressed", String(key === summary.position));
    button.innerHTML = `<b>${key}</b><span>${value.name}</span><small>${getProfileSummary({ ...playerProfile, selectedPosition: key }).overall} OVR</small>`;
    return button;
  }));

  const attributeRoot = $("#attribute-groups");
  attributeRoot.replaceChildren(...Object.entries(ATTRIBUTE_GROUPS).map(([groupName, keys]) => {
    const section = document.createElement("section");
    section.className = "attribute-group";
    const title = document.createElement("h4");
    title.textContent = groupName;
    section.append(title);
    for (const key of keys) {
      const value = build.attributes[key];
      const cap = preset.caps[key];
      const cost = getUpgradeCost(value);
      const row = document.createElement("div");
      row.className = "attribute-row";
      row.innerHTML = `<div class="attribute-row__copy"><span>${ATTRIBUTE_LABELS[key]}</span><small>CAP ${cap}</small></div><strong>${value}</strong><i><b style="width:${value}%"></b></i>`;
      const button = document.createElement("button");
      button.type = "button";
      button.className = "attribute-upgrade";
      button.dataset.upgrade = key;
      button.disabled = value >= cap || playerProfile.credits < cost;
      button.setAttribute("aria-label", `Upgrade ${ATTRIBUTE_LABELS[key]}`);
      button.textContent = value >= cap ? "MAX" : `+1 / ${cost} CR`;
      row.append(button);
      section.append(row);
    }
    return section;
  }));

  const colorHex = (value) => `#${value.toString(16).padStart(6, "0")}`;
  const cosmeticRoot = $("#cosmetic-grid");
  cosmeticRoot.replaceChildren(...COSMETIC_PALETTES.map((item) => {
    const owned = playerProfile.cosmetics.owned.includes(item.id);
    const equipped = playerProfile.cosmetics.equipped === item.id;
    const button = document.createElement("button");
    button.type = "button";
    button.className = `cosmetic-card${equipped ? " is-equipped" : ""}`;
    button.dataset.cosmetic = item.id;
    button.style.setProperty("--swatch-a", colorHex(item.colors.primary));
    button.style.setProperty("--swatch-b", colorHex(item.colors.accent));
    button.disabled = !owned && playerProfile.credits < item.cost;
    button.innerHTML = `<i aria-hidden="true"></i><span><b>${item.name}</b><small>${equipped ? "EQUIPPED" : owned ? "OWNED / EQUIP" : `${item.cost.toLocaleString()} CR`}</small></span>`;
    return button;
  }));

  const hairRoot = $("#hair-style-grid");
  hairRoot?.replaceChildren(...HAIR_STYLES.map((item) => {
    const button = document.createElement("button");
    button.type = "button";
    button.className = `identity-choice${summary.hairStyle.id === item.id ? " is-selected" : ""}`;
    button.dataset.hairStyle = item.id;
    button.setAttribute("aria-pressed", String(summary.hairStyle.id === item.id));
    button.innerHTML = `<i class="hair-style-icon" aria-hidden="true"></i><span>${item.name}</span>`;
    return button;
  }));

  const skinToneRoot = $("#skin-tone-grid");
  skinToneRoot?.replaceChildren(...SKIN_TONES.map((item) => {
    const button = document.createElement("button");
    button.type = "button";
    button.className = `identity-choice${summary.skinTone.id === item.id ? " is-selected" : ""}`;
    button.dataset.skinTone = item.id;
    button.setAttribute("aria-pressed", String(summary.skinTone.id === item.id));
    button.innerHTML = `<i style="--skin:#${item.color.toString(16).padStart(6, "0")}"></i><span>${item.name}</span>`;
    return button;
  }));

  const shoeStyleRoot = $("#shoe-style-grid");
  shoeStyleRoot?.replaceChildren(...BASKETBALL_SHOE_STYLES.map((item) => {
    const button = document.createElement("button");
    button.type = "button";
    button.className = `identity-choice${summary.shoeStyle.id === item.id ? " is-selected" : ""}`;
    button.dataset.shoeStyle = item.id;
    button.setAttribute("aria-pressed", String(summary.shoeStyle.id === item.id));
    button.innerHTML = `<i class="shoe-style-icon" aria-hidden="true"></i><span><b>${item.name}</b><small>${item.description}</small></span>`;
    return button;
  }));
  const shoeColorwayRoot = $("#shoe-colorway-grid");
  shoeColorwayRoot?.replaceChildren(...BASKETBALL_SHOE_COLORWAYS.map((item) => {
    const button = document.createElement("button");
    button.type = "button";
    button.className = `identity-choice${summary.shoeColorway.id === item.id ? " is-selected" : ""}`;
    button.dataset.shoeColorway = item.id;
    button.setAttribute("aria-pressed", String(summary.shoeColorway.id === item.id));
    const colors = [item.upper, item.midsole, item.outsole, item.mark]
      .map((color) => `#${color.toString(16).padStart(6, "0")}`)
      .join(",");
    button.innerHTML = `<i class="shoe-colorway-swatch" style="background:linear-gradient(135deg,${colors})" aria-hidden="true"></i><span>${item.name}</span>`;
    return button;
  }));

  const titleRoot = $("#title-grid");
  titleRoot?.replaceChildren(...getAvailableTitles(playerProfile).map((title) => {
    const button = document.createElement("button");
    button.type = "button";
    button.className = `title-chip${summary.title.id === title.id ? " is-selected" : ""}`;
    button.dataset.title = title.id;
    button.setAttribute("aria-pressed", String(summary.title.id === title.id));
    button.textContent = title.name;
    return button;
  }));
}

function showMyPlayer() {
  gameActive = false;
  engine?.setPaused(true);
  engine?.controls?.setEnabled(false);
  hideOverlay("pause-screen");
  hideOverlay("game-over");
  setHidden($("#main-menu"), true);
  setHidden($("#mode-select"), true);
  setHidden($("#ball-select"), true);
  setHidden($("#venue-select"), true);
  setHidden($("#my-player-screen"), false);
  renderPlayerProfile();
  app.dataset.state = "profile";
  $(".position-tab.is-selected")?.focus();
}

function controlledProfileConfig() {
  const config = getEnginePlayerConfig(playerProfile);
  return {
    ...config,
    metadata: {
      ratings: config.ratings,
      overall: config.overall,
      positionRole: config.positionRole,
      passAccuracy: config.passAccuracy,
      perimeterDefense: config.perimeterDefense,
      steal: config.steal,
      block: config.block,
      stamina: config.staminaRating,
      jerseyNumber: config.jerseyNumber,
      appearanceId: config.appearanceId,
      hairStyleId: config.hairStyleId,
      skinToneId: config.skinToneId,
      height: config.height,
      shoeStyleId: config.shoeStyleId,
      shoeColorwayId: config.shoeColorwayId,
      jerseyStyle: config.jerseyStyle,
      hairStyle: config.hairStyle,
      headShape: config.headShape,
    },
  };
}

function createRoster(modeKey) {
  const V = globalThis.THREE.Vector3;
  const controlled = controlledProfileConfig();
  const format = getFormatForModeKey(modeKey);
  if (format) {
    return createTeamRoster(format.id).map((player) => ({
      ...player,
      ...(player.controlled ? controlled : {}),
      position: new V(player.position.x, player.position.y || 0, player.position.z),
    }));
  }
  if (modeKey === "threePoint" || modeKey === "practice") {
    return [
      { id: "ace", name: controlled.name, team: "home", controlled: true, position: new V(modeKey === "practice" ? 0 : -4.6, 0, modeKey === "practice" ? 3.7 : -0.5), ...controlled },
    ];
  }
  return [
    { id: "ace", name: controlled.name, team: "home", controlled: true, position: new V(0, 0, 3.7), ...controlled },
    { id: "shade", name: "Shade", team: "away", isAI: true, role: "handler", shooting: 0.86, vertical: 0.85, position: new V(0.5, 0, 0.7), primary: 0xff6438, accent: 0xffc15d, skinColor: 0x5f382a, shoeColor: 0xffddd1 },
  ];
}

function createEngine(modeKey, preview = false, roster = null, venueOverride = "park") {
  activeVenueLoader?.release({ dispose: true });
  activeVenueLoader = null;
  engine?.destroy();
  contestRackVisuals = null;
  gameRoot.replaceChildren();
  const teamMode = isTeamModeKey(modeKey);
  const performanceMode = $("#quality-select")?.value === "performance";
  engine = new NovaCourtEngine({
    container: gameRoot,
    players: roster || createRoster(modeKey),
    mode: MODE_MAP[modeKey],
    courtRuntime: createCourtRuntime(modeKey),
    difficulty: currentDifficulty,
    shadows: !performanceMode && modeKey !== "fives",
    pixelRatio: performanceMode || modeKey === "fives" ? 1 : Math.min(devicePixelRatio || 1, 1.35),
    visualQuality: performanceMode || modeKey === "fives" ? "performance" : "balanced",
    venue: venueOverride,
    reducedMotion: ui.settings.reducedMotion,
    userShootingAssist: ui.settings.shootingAssist,
    ballStyle: ui.settings.ballStyle,
  });
  bindEngineEvents();
  engine.start();
  engine.setPaused(preview);
  engine.controls.setEnabled(!preview);
  const qaQuery = new URLSearchParams(location.search);
  if (qaQuery.has("qa") || qaQuery.has("aiDebug")) {
    globalThis.__NOVA_QA__ = {
      snapshot: () => engine?.getSnapshot?.(),
      replay: () => engine ? {
        ...engine.replayFlow.getSnapshot(),
        playing: engine.replay?.playing || false,
        queued: engine.replay?.queued || false,
        elapsed: engine.replay?.elapsed || 0,
        duration: engine.replay?.duration || 0,
        frames: engine.replay?.frames?.length || 0,
        scorerId: engine.replay?.scorerId || null,
      } : null,
      renderer: () => ({
        calls: engine?.renderer?.info?.render?.calls || 0,
        triangles: engine?.renderer?.info?.render?.triangles || 0,
        textures: engine?.renderer?.info?.memory?.textures || 0,
        geometries: engine?.renderer?.info?.memory?.geometries || 0,
      }),
      shootingAssist: () => engine?.getShootingAssistSnapshot?.() || null,
      basketballStyle: () => engine?.ballMesh?.userData?.visualProfile?.style || null,
      threePointContest: () => getThreePointContestQASnapshot(),
      advanceThreePointContest: (sequenceIndex = 4, made = false) =>
        advanceThreePointContestForQA(sequenceIndex, made),
      jumpThreePointContest: (rackIndex = 0, ballIndex = 0, made = false) =>
        jumpThreePointContestForQA(rackIndex, ballIndex, made),
      setArcRunCountdown: (seconds = 3) => setArcRunCountdownForQA(seconds),
      setArcRunGrab: (progress = 0.5, rackIndex = 0, ballIndex = 0) =>
        setArcRunGrabForQA(progress, rackIndex, ballIndex),
      snapThreePointCamera: () => engine?.snapArcRunCameraForQA?.() || null,
      snapCourtWideCamera: () => engine?.snapCourtWideCameraForQA?.() || null,
      snapOpenGymCamera: () => engine?.snapOpenGymCameraForQA?.() || null,
      presentation: () => presentationDirector?.getSnapshot?.() || null,
      sceneLoading: () => ({
        ...sceneLoadState,
        loadedIds: [...sceneLoadState.loadedIds],
        loadErrors: [...sceneLoadState.loadErrors],
      }),
      venueSelection: () => ({
        venueId: pendingVenueId,
        option: getVenueOption(pendingVenueId),
        preview: venueSelectionPreview?.getSnapshot?.() || null,
      }),
      ai: () => ai?.getDecisionSnapshot?.() || {
        enabled: false,
        limit: 0,
        count: 0,
        latest: null,
        traces: [],
      },
    };
  }
  return engine;
}

function createPresentationRoster() {
  const V = globalThis.THREE.Vector3;
  return [
    { id: "demo-nova-1", name: "Nova One", team: "home", isAI: true, position: new V(-2.8, 0, 3.6), primary: 0x38e8ff, accent: 0xf4fbff, jerseyNumber: 7, hairStyle: "highTop", headShape: "long", skinColor: 0x75442f },
    { id: "demo-nova-2", name: "Nova Two", team: "home", isAI: true, position: new V(3.4, 0, 1.2), primary: 0x38e8ff, accent: 0x152d40, jerseyNumber: 24, hairStyle: "braids", skinColor: 0x4f2f25 },
    { id: "demo-eclipse-1", name: "Eclipse One", team: "away", isAI: true, position: new V(-1.7, 0, 1.2), primary: 0xff6438, accent: 0xffd166, jerseyNumber: 11, hairStyle: "fade", headShape: "wide", skinColor: 0xc88a68 },
  ];
}

function stopPresentation() {
  if (engine) engine.presentationUpdate = null;
  presentationDirector?.destroy?.();
  presentationDirector = null;
  presentationKind = null;
}

function startAttractMode() {
  stopPresentation();
  createEngine("street", false, createPresentationRoster());
  engine.controls.setEnabled(false);
  engine.setCameraMode("broadcast");
  presentationKind = "attract";
  presentationDirector = createPresentationDirector(engine, { loop: true });
  engine.presentationUpdate = (dt) => presentationDirector?.update(dt);
  engine.setPaused(false);
  engine.controls.setEnabled(false);
}

function renderTutorialStep(step) {
  if (!step) return;
  $("#tutorial-step-count").textContent = `${step.index + 1} / ${step.total}`;
  $("#tutorial-step-label").textContent = step.label;
  $("#tutorial-step-control").textContent = step.control;
  $("#tutorial-step-copy").textContent = step.copy;
  $("#tutorial-progress-fill").style.width = `${Math.round(((step.index + 1) / step.total) * 100)}%`;
  $$(".tutorial-step-dot").forEach((dot, index) => dot.classList.toggle("is-active", index === step.index));
}

function startTutorial() {
  stopPresentation();
  createEngine("street", false, createPresentationRoster());
  engine.controls.setEnabled(false);
  engine.setCameraMode("broadcast");
  presentationKind = "tutorial";
  presentationDirector = createPresentationDirector(engine, {
    tutorial: true,
    onStep: renderTutorialStep,
    onComplete: () => {
      $("#tutorial-step-label").textContent = "RUN COMPLETE";
      $("#tutorial-step-control").textContent = "REPLAY OR TAKE THE COURT";
      $("#tutorial-step-copy").textContent = "You saw every core action. This demonstration never changes credits, XP, or your record.";
      $("#tutorial-replay").hidden = false;
    },
  });
  engine.presentationUpdate = (dt) => presentationDirector?.update(dt);
  engine.setPaused(false);
  engine.controls.setEnabled(false);
  for (const id of ["main-menu", "my-player-screen", "mode-select", "ball-select", "venue-select", "pause-screen", "game-over", "controls-screen", "settings-screen"]) {
    setHidden($(`#${id}`), true);
  }
  setHidden($("#hud"), true);
  setHidden($("#tutorial-screen"), false);
  $("#tutorial-replay").hidden = true;
  app.dataset.state = "tutorial";
}

function configForMode(modeKey) {
  if (modeKey === "practice") return {};
  const targetChoice = $("#target-select")?.value || "standard";
  if (modeKey === "street") {
    const targetScore = targetChoice === "quick" ? 7 : targetChoice === "extended" ? 15 : 11;
    return { difficulty: currentDifficulty, targetScore, winBy: 2, scoreCap: targetScore + 4 };
  }
  if (modeKey === "threePoint") {
    const duration = targetChoice === "quick" ? 45 : targetChoice === "extended" ? 75 : 60;
    return { difficulty: currentDifficulty, duration, targetScore: 18 };
  }
  if (modeKey === "duos") {
    const targetScore = targetChoice === "quick" ? 9 : targetChoice === "extended" ? 17 : 13;
    return { difficulty: currentDifficulty, targetScore, gameDuration: targetChoice === "quick" ? 180 : 240 };
  }
  if (modeKey === "quads") {
    const targetScore = targetChoice === "quick" ? 13 : targetChoice === "extended" ? 23 : 19;
    return {
      difficulty: currentDifficulty,
      targetScore,
      gameDuration: targetChoice === "quick" ? 210 : targetChoice === "extended" ? 420 : 330,
    };
  }
  if (modeKey === "fives") {
    const targetScore = targetChoice === "quick" ? 15 : targetChoice === "extended" ? 25 : 21;
    return { difficulty: currentDifficulty, targetScore, gameDuration: targetChoice === "quick" ? 240 : targetChoice === "extended" ? 480 : 360 };
  }
  const targetScore = targetChoice === "quick" ? 9 : targetChoice === "extended" ? 21 : 15;
  return { difficulty: currentDifficulty, targetScore, gameDuration: targetChoice === "quick" ? 180 : 300 };
}

function createModeController(modeKey) {
  const config = configForMode(modeKey);
  if (modeKey === "practice") return createPracticeMode(config);
  if (modeKey === "duos") return createHalfCourtDuosMode(config);
  if (modeKey === "quads") return createHalfCourtQuadsMode(config);
  if (modeKey === "fives") return createFullCourtFiveOnFiveMode(config);
  return createGameMode(MODE_MAP[modeKey], config);
}

async function startMode(modeKey = selectedModeKey, { loadVenueDetails = true } = {}) {
  stopPresentation();
  resetShotMeter();
  runToken += 1;
  pendingShot = null;
  aiActionTimes.clear();
  aiAccumulator = 0;
  hudAccumulator = 0;
  currentModeKey = MODE_META[modeKey] ? modeKey : "street";
  selectedModeKey = currentModeKey;
  app.dataset.gameMode = currentModeKey;
  audio.setMusicMode(currentModeKey);
  unlockAudio().catch(() => {});
  currentDifficulty = $("#difficulty-select")?.value || "pro";
  const token = runToken;
  setHidden($("#loading-screen"), false);
  createEngine(currentModeKey, false, null, pendingVenueId);
  const loadQuality = $("#quality-select")?.value === "performance" ? "low" : "medium";
  activeVenueLoader = createProductionVenueLoader({
    T: globalThis.THREE,
    engine,
    venueId: pendingVenueId,
    quality: loadQuality,
    onProgress: ({ sceneId, phase, progress, groupId, token: loaderToken }) => {
      if (token !== runToken) return;
      const snapshot = activeVenueLoader?.snapshot?.();
      updateSceneLoading(
        sceneId || `${currentModeKey}:${pendingVenueId}`,
        phase,
        progress,
        snapshot?.loadedIds || [],
        {
          groupId,
          token: loaderToken,
          venueId: pendingVenueId,
          loadErrors: snapshot?.errors || [],
        },
      );
    },
  });
  const venueLoadPromise = loadVenueDetails
    ? activeVenueLoader.load()
    : Promise.resolve({ cancelled: false, baseCourtOnly: true });
  engine.setCameraMode(currentModeKey === "threePoint"
    ? "arc-run"
    : cameraPresetForTeamMode(currentModeKey).mode);
  mode = createModeController(currentModeKey);
  if (currentModeKey === "threePoint") {
    contestRackVisuals = createThreePointRackVisuals(
      globalThis.THREE,
      engine.worldRoot,
      { racks: mode.getRules().racks },
    );
  }
  const opening = mode.start({ teamIds: ["home", "away"], userTeamId: "home" });
  processCommands(opening?.commands, token);
  ai = createAIDirector({
    difficulty: currentDifficulty,
    teamIds: currentModeKey === "threePoint" || currentModeKey === "practice" ? [] : null,
    debug: new URLSearchParams(location.search).has("aiDebug"),
  });
  const venueLoadResult = await venueLoadPromise;
  if (token !== runToken || venueLoadResult.cancelled) return;
  const venueLoadSnapshot = loadVenueDetails
    ? activeVenueLoader.snapshot()
    : {
        ...activeVenueLoader.snapshot(),
        sceneId: `${currentModeKey}:base-court`,
        phase: "ready",
        progress: 1,
        loadedIds: ["court-fallback", "court", "hoops", "players"],
        errors: [],
      };
  sceneLoadState = {
    ...sceneLoadState,
    ...venueLoadSnapshot,
    loadErrors: [...venueLoadSnapshot.errors],
    venueId: pendingVenueId,
    activeGroupId: null,
  };
  const meta = MODE_META[currentModeKey];
  $("#mode-label").textContent = meta.label;
  $("#home-label").textContent = meta.home;
  $("#away-label").textContent = meta.away;
  $("#game-clock").textContent = meta.objective;
  setHidden($("#three-point-progress"), currentModeKey !== "threePoint");
  setHidden($("#teammate-hints"), !isTeamModeKey(currentModeKey));
  setHidden($("#restart-game"), !allowsRestart(currentModeKey));
  setHidden($("#rematch"), !allowsRestart(currentModeKey));
  applyGameplayHudVisibility(document, currentModeKey);
  if (currentModeKey === "threePoint") buildRackProgress();
  if (isTeamModeKey(currentModeKey)) {
    $("#teammate-hints").innerHTML = "<span>J / E <b>PASS + SWITCH</b></span><span>I <b>STEAL</b></span><span>C <b>CAMERA</b></span>";
  }
  showGame();
  gameActive = true;
  announcer.reset();
  announcer.announce("tip", { force: true, seed: `${currentModeKey}-${runToken}` });
  audio.playSfx("whistle");
  const openingCall = currentModeKey === "threePoint" ? "ARC RUN"
    : currentModeKey === "practice" ? "OPEN GYM"
      : currentModeKey === "street" ? "WELCOME TO NOVA PARK"
        : currentModeKey === "fives" ? "FULL COURT ? TEN PLAYERS ? TWO HOOPS"
          : "CHECK BALL";
  feedback(openingCall, "accent", 1200);
  updateHUD();
  updateSceneLoading(
    activeVenueLoader.sceneId,
    "ready",
    1,
    venueLoadSnapshot.loadedIds,
    { venueId: pendingVenueId, loadErrors: venueLoadSnapshot.errors },
  );
  requestAnimationFrame(() => {
    if (token === runToken) setHidden($("#loading-screen"), true);
  });
}

function buildRackProgress() {
  const node = $("#three-point-progress");
  if (!node) return;
  node.replaceChildren();
  node.dataset.layout = "left-rail";
  const rules = mode?.getRules?.() || {};
  const rackCount = rules.rackCount || 5;
  const ballsPerRack = rules.ballsPerRack || 5;
  const moneyBallSlot = rules.moneyBallSlot ?? ballsPerRack - 1;
  const heading = document.createElement("span");
  heading.className = "rack-progress__heading";
  heading.innerHTML = "<b>ARC RUN</b><small>ALL RACKS</small>";
  const balls = document.createElement("div");
  balls.className = "rack-progress__balls";
  for (let i = 0; i < rackCount * ballsPerRack; i += 1) {
    const dot = document.createElement("i");
    const rackIndex = Math.floor(i / ballsPerRack);
    const ballIndex = i % ballsPerRack;
    dot.dataset.ball = String(i);
    dot.dataset.rack = String(rackIndex);
    dot.dataset.slot = String(ballIndex);
    dot.setAttribute(
      "aria-label",
      `Rack ${rackIndex + 1}, ball ${ballIndex + 1}${ballIndex === moneyBallSlot ? ", money ball" : ""}`,
    );
    if (ballIndex === moneyBallSlot) dot.classList.add("is-money");
    balls.append(dot);
  }
  node.append(heading, balls);
}

function handleModeEvent(type, payload = {}) {
  if (!mode) return null;
  const response = mode.handleEvent(type, payload);
  processCommands(response.commands, runToken);
  updateHUD();
  return response;
}

function advanceThreePointContestForQA(sequenceIndex = 4, made = false) {
  if (currentModeKey !== "threePoint" || !mode) {
    return { ok: false, reason: "three_point_mode_not_active" };
  }
  let guard = 0;
  while (mode.phase === MODE_PHASES.COUNTDOWN && guard < 40) {
    const response = mode.update(0.1);
    processCommands(response.commands, runToken);
    guard += 1;
  }
  const rules = mode.getRules();
  const target = Math.max(0, Math.min(rules.totalBalls - 1, Math.floor(Number(sequenceIndex) || 0)));
  while (mode.phase === MODE_PHASES.LIVE
    && mode.getState().sequenceIndex < target
    && guard < rules.totalBalls + 40) {
    const shotId = `qa-${runToken}-${mode.getState().sequenceIndex}`;
    processCommands(mode.handleEvent("SHOT_ATTEMPT", { shotId }).commands, runToken);
    processCommands(
      mode.handleEvent(made ? "BASKET" : "MISS", { shotId, perfectRelease: made }).commands,
      runToken,
    );
    guard += 1;
  }
  updateHUD();
  return {
    ok: mode.phase === MODE_PHASES.LIVE && mode.getState().sequenceIndex === target,
    state: mode.getState(),
    ui: mode.getUIState(),
    racks: contestRackVisuals?.getSnapshot?.() || null,
    basketballStyle: engine?.ballMesh?.userData?.visualProfile?.style || null,
  };
}

function jumpThreePointContestForQA(rackIndex = 0, ballIndex = 0, made = false) {
  if (currentModeKey !== "threePoint" || !mode) {
    return { ok: false, reason: "three_point_mode_not_active" };
  }
  const rules = mode.getRules();
  const safeRack = Math.max(0, Math.min(
    rules.rackCount - 1,
    Math.floor(Number(rackIndex) || 0),
  ));
  const safeBall = Math.max(0, Math.min(
    rules.ballsPerRack - 1,
    Math.floor(Number(ballIndex) || 0),
  ));
  const target = safeRack * rules.ballsPerRack + safeBall;
  const state = mode.getState();
  if (state.phase === MODE_PHASES.FINISHED || state.sequenceIndex > target) {
    processCommands(mode.handleEvent("RESTART").commands, runToken);
  }
  const result = advanceThreePointContestForQA(target, made);
  const camera = engine?.snapArcRunCameraForQA?.() || null;
  return {
    ...result,
    camera,
    qa: getThreePointContestQASnapshot(),
  };
}

function getThreePointContestQASnapshot() {
  const state = mode?.getState?.() || null;
  const rules = mode?.getRules?.() || null;
  const rack = state && rules && state.rackIndex < rules.racks.length
    ? rules.racks[state.rackIndex]
    : null;
  const player = engine?.controlledPlayer?.root?.position;
  const basket = engine?.courtRuntime?.baskets?.home || { x: 0, y: 3.05, z: -5.7 };
  const rackPresentation = rack ? getThreePointRackPresentation(rack, basket) : null;
  const facing = engine?.controlledPlayer?.facing;
  const shooterToHoopLength = player
    ? Math.hypot(basket.x - player.x, basket.z - player.z) || 1
    : 1;
  const facingHoopDot = player && facing
    ? facing.x * ((basket.x - player.x) / shooterToHoopLength)
      + facing.z * ((basket.z - player.z) / shooterToHoopLength)
    : null;
  return {
    mode: state,
    ui: mode?.getUIState?.() || null,
    racks: contestRackVisuals?.getSnapshot?.() || null,
    currentRack: rack ? {
      ...rack,
      ...rackPresentation,
    } : null,
    player: player ? {
      position: player.toArray(),
      facing: facing?.toArray?.() || null,
      facingHoopDot,
    } : null,
    hoop: { ...basket },
    camera: engine?.getArcRunCameraSnapshot?.() || null,
    grab: engine?.getArcRunGrabSnapshot?.() || null,
    countdownOverlay: {
      visible: !$("#arc-run-countdown")?.hidden,
      seconds: Number($("#arc-run-countdown")?.dataset?.seconds) || 0,
    },
  };
}

function setArcRunCountdownForQA(seconds = 3) {
  if (currentModeKey !== "threePoint" || !mode?.setCountdownForQA) {
    return { ok: false, reason: "three_point_mode_not_active" };
  }
  const state = mode.setCountdownForQA(seconds);
  processCommands(mode.consumeCommands(), runToken);
  engine.controls.setEnabled(false);
  updateHUD();
  return { ok: true, state, qa: getThreePointContestQASnapshot() };
}

function setArcRunGrabForQA(progress = 0.5, rackIndex = 0, ballIndex = 0) {
  if (currentModeKey !== "threePoint" || !mode) {
    return { ok: false, reason: "three_point_mode_not_active" };
  }
  const result = jumpThreePointContestForQA(rackIndex, ballIndex, false);
  if (!result.ok) return result;
  const grab = engine?.setArcRunGrabProgressForQA?.(progress) || null;
  engine?.snapArcRunCameraForQA?.();
  return { ok: Boolean(grab), grab, qa: getThreePointContestQASnapshot() };
}

function prepareArcRunCaptureState(name) {
  startMode("threePoint");
  const countdownMatch = /^countdown-([123])$/.exec(name);
  if (countdownMatch) {
    setArcRunCountdownForQA(Number(countdownMatch[1]));
  } else if (name === "grab-contact") {
    setArcRunGrabForQA(0.6, 2, 4);
  } else if (name === "grab-gather") {
    setArcRunGrabForQA(0.76, 2, 4);
  } else if (name === "rack-money-ball") {
    setArcRunGrabForQA(0.12, 2, 3);
  } else if (name === "top-key-rack") {
    setArcRunGrabForQA(0.12, 2, 0);
  } else {
    const rackCaptureIndex = [
      "rack-left-corner",
      "rack-left-wing",
      "rack-top",
      "rack-right-wing",
      "rack-right-corner",
    ].indexOf(name);
    if (rackCaptureIndex >= 0) {
      setArcRunGrabForQA(0.12, rackCaptureIndex, 0);
    }
  }
  gameActive = false;
  engine.controls.setEnabled(false);
  engine.paused = true;
  engine.snapArcRunCameraForQA?.();
  engine.render();
  document.body.classList.add("arc-run-capture-mode");
  audio.setCaptions(false);
  for (const id of ["feedback", "subtitles", "toast"]) setHidden($(`#${id}`), true);
  setHidden($(".caption-bubble"), true);
  setHidden($(".toast-region"), true);
  app.dataset.state = "arc-run-capture";
  app.dataset.arcRunCapture = name;
  return getThreePointContestQASnapshot();
}

function processCommands(commands = [], token = runToken) {
  for (const command of commands || []) {
    if (token !== runToken) return;
    switch (command.type) {
      case "BEGIN_INBOUND": {
        const teamId = command.offenseTeamId || command.teamId || "home";
        const format = getFormatForModeKey(currentModeKey);
        const spot = command.position || (format
          ? restartSpotForTeam(format.id, teamId, command.boundary || "inbound")
          : null);
        const inbounder = setPossession(teamId, spot, false);
        if (inbounder) inbounder.metadata.inbounder = true;
        engine.shotClock = Infinity;
        engine.setPaused(false);
        engine.controls.setEnabled(true);
        feedback(`${String(teamId).toUpperCase()} INBOUND · PASS TO RESUME`, "warning", 1200);
        break;
      }
      case "BEGIN_CHECK":
      case "SET_POSSESSION": {
        const teamId = command.offenseTeamId || command.teamId || "home";
        setPossession(teamId, command.position, Boolean(command.live));
        if (command.live) {
          engine.controls.setEnabled(true);
        } else if (currentModeKey !== "threePoint") {
          engine.setPaused(false);
          engine.controls.setEnabled(false);
          setTimeout(() => {
            if (token !== runToken || !mode || mode.phase !== MODE_PHASES.CHECK) return;
            handleModeEvent("CHECK_COMPLETE", { offenseTeamId: teamId });
          }, 720);
        }
        break;
      }
      case "CHECK_AVAILABLE":
        handleModeEvent("CHECK_COMPLETE", { offenseTeamId: command.offenseTeamId });
        break;
      case "SET_BALL_LIVE":
        for (const player of engine.players) player.metadata.inbounder = false;
        engine.shotClock = mode?.getState?.().shotClock ?? 21;
        engine.controls.setEnabled(true);
        feedback("BALL LIVE", "good", 650);
        break;
      case "PLACE_PLAYER":
      case "MOVE_TO_RACK":
        placeAtRack(command.position || command.rack, false);
        break;
      case "SPAWN_RACK_BALL": {
        placeAtRack(command.rack, false);
        engine.setBasketballStyle(command.ballStyle || "classic");
        contestRackVisuals?.setCurrent(command.rackIndex, command.ballIndex);
        setActiveRackBall(command.sequenceIndex);
        const placement = contestRackVisuals?.getBallPlacement?.(
          command.rackIndex,
          command.ballIndex,
        );
        contestRackVisuals?.takeBall?.(command.rackIndex, command.ballIndex);
        engine.beginArcRunGrab?.({
          position: placement || {
            x: command.rack?.propX ?? command.rack?.x,
            y: 1.01,
            z: command.rack?.propZ ?? command.rack?.z,
          },
          rackIndex: command.rackIndex,
          ballIndex: command.ballIndex,
        });
        break;
      }
      case "RETURN_BALL":
        setTimeout(() => {
          if (token !== runToken || !engine?.controlledPlayer) return;
          engine.ball.pickupCooldown = 0;
          engine.givePossession(engine.controlledPlayer, true);
          engine.controls.setEnabled(true);
          pendingShot = null;
          feedback("NEXT REP", "accent", 500);
        }, Math.max(0, command.delay || 0));
        break;
      case "START_FREE_THROWS":
        engine.startFreeThrows({
          shooterId: command.shooterId,
          teamId: command.teamId,
          attempts: command.attempts || 1,
        });
        break;
      case "PRACTICE_SHOT_RESOLVED":
        feedback(command.made ? "CASH · KEEP IT GOING" : "RESET · NEXT REP", command.made ? "good" : "neutral", 700);
        break;
      case "COUNTDOWN":
        engine.controls.setEnabled(false);
        showArcRunCountdown(command.seconds);
        feedback(String(command.seconds), "accent", 720);
        audio.playSfx("countdown");
        break;
      case "ANNOUNCE":
        if (currentModeKey === "threePoint" && command.tone === "start") {
          showArcRunCountdown();
        }
        feedback(command.text, command.tone === "overtime" ? "warning" : "good", 1100);
        announcer.announce(command.event || (command.tone === "overtime" ? "overtime" : "score"), { force: true });
        break;
      case "CONTEST_SHOT_RESOLVED":
        markRackBall(command.rackIndex, command.ballIndex, command.made);
        if (!command.made && pendingShot?.shotId === command.shotId) pendingShot = null;
        feedback(command.made ? `+${command.value}` : "OFF", command.made ? "good" : "neutral", 600);
        break;
      case "SCORE_CONFIRMED":
        const deep = currentModeKey === "fives" ? command.points === 3 : command.points === 2;
        feedback(deep ? "FROM DEEP" : "BUCKET", "good", 850);
        break;
      case "BASKET_WAVED_OFF":
        feedback("CLEAR IT FIRST", "warning", 1000);
        audio.playSfx("whistle");
        break;
      case "REQUIRE_CLEAR":
        feedback("CLEAR THE ARC", "warning", 900);
        break;
      case "RESET_SHOT_CLOCK":
        engine.shotClock = command.seconds || 12;
        break;
      case "END_GAME":
        endGame(command.result);
        break;
      default:
        break;
    }
  }
}

function placeAtRack(rack, giveBall = false) {
  if (!rack || !engine?.controlledPlayer) return;
  const player = engine.controlledPlayer;
  player.root.position.set(Number(rack.x) || 0, 0, Number(rack.z) || 2.4);
  player.velocity.set(0, 0, 0);
  player.desiredVelocity.set(0, 0, 0);
  const basket = engine.courtRuntime?.baskets?.home || { x: 0, z: -5.7 };
  engine.setArcRunRack?.(rack);
  player.facing.set(
    (Number(basket.x) || 0) - player.root.position.x,
    0,
    (Number(basket.z) || -5.7) - player.root.position.z,
  ).normalize();
  player.root.rotation.y = Math.atan2(player.facing.x, player.facing.z);
  if (giveBall) {
    engine.ball.pickupCooldown = 0;
    engine.givePossession(player, true);
  }
}

function setPossession(teamId, restartPosition = null, live = false) {
  if (!engine) return null;
  for (const player of engine.players) player.metadata.inbounder = false;
  if (live && engine.ball.owner?.team === teamId) {
    engine.possessionTeam = teamId;
    return engine.ball.owner;
  }
  const candidates = engine.players.filter((player) => player.team === teamId);
  const owner = live
    ? [...candidates].sort((a, b) => a.root.position.distanceToSquared(engine.ball.position) - b.root.position.distanceToSquared(engine.ball.position))[0]
    : candidates.find((player) => player.controlled) || candidates[0];
  if (!owner) return null;
  if (currentModeKey !== "threePoint" && !live) {
    if (restartPosition) {
      owner.root.position.set(Number(restartPosition.x) || 0, Number(restartPosition.y) || 0, Number(restartPosition.z) || 0);
    } else {
      owner.root.position.set(0, 0, 3.7);
      const defenders = engine.players.filter((player) => player.team !== teamId);
      defenders.forEach((player, index) => player.root.position.set((index - (defenders.length - 1) / 2) * 2.2, 0, 1.1 - index * 0.35));
    }
  }
  engine.ball.pickupCooldown = 0;
  engine.givePossession(owner, true);
  return owner;
}

function setActiveRackBall(sequenceIndex) {
  const node = $("#three-point-progress");
  if (!node) return;
  $$("i", node).forEach((dot, index) => {
    dot.classList.toggle("is-active", index === sequenceIndex);
  });
}

function markRackBall(rackIndex, ballIndex, made) {
  const ballsPerRack = mode?.getRules?.().ballsPerRack || 5;
  const index = Math.max(0, rackIndex * ballsPerRack + ballIndex);
  const dot = $(`[data-ball="${index}"]`, $("#three-point-progress"));
  dot?.classList.add(made ? "is-made" : "is-missed");
  dot?.classList.remove("is-active");
}

function bindEngineEvents() {
  engine.on("dribblemove", (event) => {
    const labels = {
      crossover: "CROSSOVER",
      behindBack: "BEHIND THE BACK",
      hesi: "HESITATION",
      betweenLegs: "BETWEEN THE LEGS",
      inOut: "IN & OUT",
      doubleCross: "DOUBLE CROSS",
      spin: "SPIN CYCLE",
      snatchBack: "SNATCH BACK",
      shamgod: "PUSH CROSS",
    };
    audio.playSfx("dribble", 1);
    const combo = event.combo > 1 ? "  ×" + event.combo : "";
    feedback((labels[event.move] || "HANDLE MOVE") + combo, "accent", event.combo > 1 ? 760 : 620);
  });
  engine.on("dribble", (event) => audio.playSfx("dribble", clamp((event.speed || 2) / 6, 0.35, 1)));
  engine.on("dunkstyle", (event) => {
    if (!event.accepted) {
      feedback("CONTESTED · LAYUP", "warning", 720);
      return;
    }
    const labels = {
      power_one_hand: "POWER FINISH",
      power_two_hand: "TWO-HAND SLAM",
      reverse: "REVERSE FINISH",
      tomahawk: "TOMAHAWK FINISH",
    };
    const tone = event.style === "tomahawk" || event.style === "reverse" ? "warning" : "accent";
    feedback(labels[event.style] || "POWER FINISH", tone, 760);
  });
  engine.on("dunkfinish", (event) => {
    if (event.outcome === "cancelled") feedback("CONTESTED · LAYUP", "warning", 720);
  });
  engine.on("bounce", () => audio.playSfx("bounce"));
  engine.on("pass", (event) => {
    audio.playSfx("pass");
    handleModeEvent("PASS_COMPLETE", {
      playerId: event.player?.id,
      targetPlayerId: event.target?.id,
      fromPlayerId: event.player?.id,
      toPlayerId: event.target?.id,
      teamId: event.player?.team,
    });
  });
  engine.on("shotstart", (event) => {
    audio.playSfx("shoot", 0.45);
    const meter = $("#shot-meter");
    meter?.classList.remove("is-result");
    meter?.classList.add("is-active");
    meter?.setAttribute("aria-hidden", "false");
    meter?.setAttribute("data-context", event.context || "jumper");
    const label = $(".shot-meter__label", meter);
    if (label) {
      label.textContent = event.context === "dunk"
        ? "DUNK · RELEASE IN GREEN"
        : event.context === "free_throw"
          ? "FREE THROW · RELEASE IN GREEN"
          : "RELEASE IN GREEN";
    }
  });
  engine.on("shotmeter", (event) => {
    const meter = $("#shot-meter");
    const makePercent = Math.round(event.makePercent ?? (event.makeProbability || 0) * 100);
    const coveredPercent = Math.round(clamp(event.coverage || 0) * 100);
    meter?.style.setProperty("--shot-value", clamp(event.charge));
    meter?.style.setProperty("--shot-window-start", `${clamp(event.perfectWindowStart ?? 0.684) * 100}%`);
    meter?.style.setProperty("--shot-window-width", `${clamp(event.perfectWindowWidth ?? 0.072) * 100}%`);
    const meterFill = $("#shot-meter-fill");
    const meterWindow = $(".shot-meter__window", meter);
    if (meterFill) meterFill.style.strokeDasharray = `${clamp(event.charge)} 1`;
    if (meterWindow) {
      meterWindow.style.strokeDasharray = `${clamp(event.perfectWindowWidth ?? 0.072)} 1`;
      meterWindow.style.strokeDashoffset = `${-clamp(event.perfectWindowStart ?? 0.684)}`;
    }
    meter?.setAttribute("data-quality", event.perfectRelease ? "perfect" : event.quality > 0.7 ? "good" : "early");
    meter?.setAttribute("data-context", event.context || "jumper");
    meter?.setAttribute("data-tone", makePercent >= 100 ? "guaranteed" : coveredPercent >= 70 ? "smothered" : "live");
    const chance = $("#shot-chance");
    const coverage = $("#shot-coverage");
    if (chance) chance.textContent = `${makePercent}%`;
    if (coverage) coverage.textContent = `${event.coverageLabel || "WIDE OPEN"} ? ${coveredPercent}% COVERED`;
    ui.setShotMeter(event.charge, event.perfectRelease ? "perfect" : "charging", event.perfectRelease ? "PERFECT" : "RELEASE IN GREEN");
  });
  engine.on("shotqueued", (event) => {
    if (!event.player?.isAI) feedback("RISE · RELEASE AT THE APEX", "accent", 520);
  });
  engine.on("aishotdecision", (event) => {
    if (event.player?.team === "away") feedback("CPU PULL-UP", "warning", 480);
  });
  engine.on("shot", (event) => {
    const meter = $("#shot-meter");
    const makePercent = Math.round(event.makePercent ?? (event.makeProbability || 0) * 100);
    const coveragePercent = Math.round(clamp(event.coverage || 0) * 100);
    const shotId = `${runToken}-${Math.round(performance.now())}`;
    pendingShot = {
      shotId,
      player: event.player,
      scored: false,
      time: performance.now(),
      quality: event.quality,
      perfectRelease: event.perfectRelease,
      makePercent,
      coverage: event.coverage,
      coverageLabel: event.coverageLabel,
      guaranteed: event.guaranteed,
      rimResult: event.rimResult,
      context: event.context,
    };
    meter?.classList.remove("is-active");
    meter?.classList.add("is-result");
    meter?.setAttribute("aria-hidden", "false");
    meter?.setAttribute("data-quality", event.perfectRelease ? "perfect" : event.quality > 0.7 ? "good" : "early");
    meter?.setAttribute("data-tone", event.guaranteed ? "guaranteed" : coveragePercent >= 70 ? "smothered" : "live");
    const chance = $("#shot-chance");
    const coverage = $("#shot-coverage");
    if (chance) chance.textContent = `${makePercent}%`;
    if (coverage) coverage.textContent = event.perfectRelease
      ? `${event.guaranteed ? "WIDE OPEN" : event.coverageLabel || "CONTESTED"} / PERFECT / ${coveragePercent}% COVERED`
      : `${event.coverageLabel || "WIDE OPEN"} / ${coveragePercent}% COVERED`;
    feedback(
      event.guaranteed
        ? "100% / WIDE OPEN / PERFECT"
        : `${event.perfectRelease ? "PERFECT / " : ""}${makePercent}% / ${event.coverageLabel || "SHOT"}`,
      event.guaranteed ? "good" : "accent",
      820,
    );
    audio.playSfx(event.context === "dunk" ? "dunk" : "shoot", 0.9);
    handleModeEvent("SHOT_ATTEMPT", {
      shotId,
      playerId: event.player?.id,
      teamId: event.player?.team,
      isThree: event.points === 3,
    });
  });
  engine.on("score", (event) => {
    if (pendingShot) pendingShot.scored = true;
    const points = currentModeKey === "fives" ? event.points : event.points === 3 ? 2 : 1;
    const callType = pendingShot?.context === "dunk" ? "dunk" : event.swish ? "swish" : event.points === 3 ? "three" : "score";
    handleModeEvent("BASKET", {
      shotId: pendingShot?.shotId,
      teamId: event.team,
      playerId: event.player?.id,
      points: currentModeKey === "threePoint" ? undefined : points,
      isThree: event.points === 3,
      perfectRelease: pendingShot?.perfectRelease === true,
    });
    audio.playSfx(event.swish ? "swish" : "score", 1);
    feedback(event.swish ? "PURE SWISH" : pendingShot?.perfectRelease ? "PERFECT RELEASE" : event.points === 3 ? "DEEP WATER" : "BUCKET", "good", 1000);
    const state = mode?.getState?.() || {};
    announcer.announce(callType, {
      playerName: event.player?.name,
      homeScore: state.scores?.home,
      awayScore: state.scores?.away,
    });
    pendingShot = null;
    setTimeout(() => {
      const meterNode = $("#shot-meter");
      meterNode?.classList.remove("is-result");
      meterNode?.setAttribute("aria-hidden", "true");
    }, 1100);
  });
  engine.on("rim", () => audio.playSfx("rim"));
  engine.on("backboard", () => audio.playSfx("backboard"));
  engine.on("rebound", (event) => {
    if (pendingShot && !pendingShot.scored) {
      handleModeEvent("MISS", {
        shotId: pendingShot.shotId,
        playerId: pendingShot.player?.id,
        teamId: pendingShot.player?.team,
      });
      pendingShot = null;
    }
    handleModeEvent("REBOUND", { playerId: event.player?.id, teamId: event.team, offensive: event.offensive });
    feedback(event.offensive ? "SECOND CHANCE" : "BOARD", "neutral", 650);

    setTimeout(() => $("#shot-meter")?.classList.remove("is-result"), 900);
  });
  engine.on("steal", (event) => {
    audio.playSfx(event.success ? "steal" : "ui", event.success ? 1 : 0.35);
    if (event.success) {
      feedback("BALL POKED LOOSE / LIVE BALL", "warning", 900);
      announcer.announce("steal", { playerName: event.defender?.name });
    }
  });
  engine.on("ballloose", () => {
    feedback("LIVE BALL ? GO GET IT", "warning", 760);
  });
  engine.on("contextualaction", (event) => {
    if (event.action === "dunk") feedback("DUNK METER · RELEASE IN GREEN", "accent", 720);
  });
  engine.on("freethrow", (event) => {
    if (event.phase === "ready") feedback("ONE FREE THROW · GREEN GUARANTEES IT", "accent", 1100);
    if (event.phase === "resolved") {
      feedback(event.made ? "FREE THROW GOOD" : "FREE THROW MISSED", event.made ? "good" : "warning", 900);
    }
  });
  engine.on("anklebreak", (event) => {
    audio.playSfx("dribble", 1);
    feedback(`ANKLE BREAK / ${(event.stunSeconds || 1.5).toFixed(1)}S STUN`, "accent", 1050);
    announcer.announce("ankle_break", { playerName: event.handler?.name });
  });
  engine.on("controlchange", (event) => {
    const name = event.to?.name || "TEAMMATE";
    feedback(`CONTROL ? ${String(name).toUpperCase()}`, "accent", 650);
  });
  engine.on("block", (event) => {
    if (!event.success) return;
    audio.playSfx("block");
    handleModeEvent("BLOCK", { teamId: event.defender?.team, playerId: event.defender?.id });
    feedback("ERASED", "warning", 900);
    announcer.announce("block", { playerName: event.defender?.name });
  });
  engine.on("outofbounds", (event) => {
    audio.playSfx("whistle");
    if (pendingShot && !pendingShot.scored) {
      handleModeEvent("MISS", {
        shotId: pendingShot.shotId,
        playerId: pendingShot.player?.id,
        teamId: pendingShot.player?.team,
        reason: "out_of_bounds",
      });
      pendingShot = null;
    }
    if (currentModeKey === "practice") {
      setTimeout(() => {
        if (!engine?.controlledPlayer) return;
        engine.ball.pickupCooldown = 0;
        engine.givePossession(engine.controlledPlayer, true);
      }, 420);
    } else if (currentModeKey !== "threePoint") {
      handleModeEvent("OUT_OF_BOUNDS", {
        awardedTeamId: event.awardedTeamId,
        lastTouchedTeamId: event.lastTouchedTeamId,
        lastTouchedPlayerId: event.lastTouchedPlayerId,
        boundary: event.boundary,
      });
    }
    feedback("OUT OF BOUNDS · " + String(event.awardedTeamId || "BALL").toUpperCase() + " BALL", "warning", 1050);
  });
  engine.on("foul", (event) => {
    audio.playSfx("whistle");
    if (event.shooting && event.nearBasket && event.commands?.length) {
      processCommands(event.commands, runToken);
      feedback("SHOOTING FOUL · ONE FREE THROW", "warning", 1150);
      return;
    }
    handleModeEvent("FOUL", {
      offendedTeamId: event.offendedTeamId,
      committingTeamId: event.committingTeamId,
      foulType: event.foulType,
      teamFouls: event.teamFouls,
    });
    feedback("REACH-IN FOUL · " + String(event.offendedTeamId || "OFFENSE").toUpperCase() + " BALL", "warning", 1150);
  });
  engine.on("performance", (event) => {
    app.dataset.qualityTier = event.tier;
    app.dataset.performanceFps = Number(event.fps || 0).toFixed(1);
    app.dataset.performanceP95 = Number(event.p95Ms || 0).toFixed(2);
    if (event.changed) ui.toast("Performance adjusted: " + event.tier);
  });
  engine.on("replay", (event) => {
    app.dataset.replay = event.phase || (event.playing ? "playing" : "idle");
    app.dataset.replayFrozen = event.frozen ? "true" : "false";
    if (event.phase === "playing") feedback("NOVA REPLAY · CINEMATIC", "accent", 900);
    else if (event.phase === "restoring") feedback("NOVA REPLAY · RESTORING", "accent", 420);
  });
  engine.on("violation", (event) => {
    audio.playSfx("whistle");
    handleModeEvent("TURNOVER", { teamId: engine.possessionTeam, reason: event.violation });
    feedback("SHOT CLOCK", "warning", 950);
  });
  engine.on("stamina", (event) => {
    const fill = $("#stamina-fill");
    if (fill) fill.style.width = `${Math.round(event.value * 100)}%`;
  });
  engine.on("arcrungrabcomplete", () => {
    if (currentModeKey !== "threePoint" || mode?.phase !== MODE_PHASES.LIVE) return;
    engine.controls.setEnabled(true);
    feedback("BALL SECURED", "accent", 360);
  });
  engine.on("pause", (event) => {
    if (event.paused) {
      mode?.pause();
      showOverlay("pause-screen");
      app.dataset.state = "paused";
    } else {
      mode?.resume();
      hideOverlay("pause-screen");
      app.dataset.state = gameActive ? "playing" : app.dataset.state;
    }
  });
  engine.on("restartrequest", () => {
    if (allowsRestart(currentModeKey)) startMode(currentModeKey);
    else feedback("RESTART IS AVAILABLE IN 1V1", "warning", 850);
  });
  engine.on("highlightqueued", (event) => {
    app.dataset.replay = "queued";
    app.dataset.replayFrozen = "true";
    if (event.pending === 0) feedback("NOVA REPLAY · QUEUED", "accent", 420);
  });
  engine.on("camera", (event) => {
    ui.toast(`Camera: ${event.mode}`);
    announcer.announce("camera", { seed: event.mode });
  });
}

function makeAISnapshot() {
  const aiContext = mode?.getAIContext?.() || {};
  return {
    players: engine.players.map((player) => ({
      id: player.id,
      teamId: player.team,
      position: { x: player.root.position.x, z: player.root.position.z },
      velocity: { x: player.velocity.x, z: player.velocity.z },
      hasBall: player.hasBall,
      role: player.metadata?.role,
      height: player.metadata?.height,
      isHuman: player.controlled,
      aiEnabled: player.isAI,
      stamina: player.stamina,
      shooting: player.metadata?.shooting ?? (player.metadata?.role === "wing" ? 0.79 : player.metadata?.role === "big" ? 0.68 : 0.76),
      canDunk: player.metadata?.role === "big" || player.metadata?.height > 2,
      isShooting: [PLAYER_STATES.SHOOT, PLAYER_STATES.LAYUP, PLAYER_STATES.DUNK].includes(player.state),
    })),
    ball: {
      position: { x: engine.ball.position.x, z: engine.ball.position.z },
      velocity: { x: engine.ball.velocity.x, z: engine.ball.velocity.z },
      holderId: engine.ball.owner?.id || null,
      isLoose: !engine.ball.owner && engine.ball.state !== "shot",
      airborne: !engine.ball.owner && ["shot", "blocked", "pass"].includes(engine.ball.state),
      isShotResolved: !pendingShot,
    },
    offenseTeamId: aiContext.offenseTeamId || engine.ball.owner?.team || engine.possessionTeam,
    attackBaskets: {
      home: { x: engine.courtRuntime.baskets.home.x, z: engine.courtRuntime.baskets.home.z },
      away: { x: engine.courtRuntime.baskets.away.x, z: engine.courtRuntime.baskets.away.z },
    },
    court: {
      halfWidth: engine.courtRuntime.halfWidth,
      halfLength: engine.courtRuntime.halfLength,
      threePointRadius: engine.courtRuntime.threePointRadius,
    },
    phase: aiContext.phase || "live",
    shotClock: aiContext.shotClock ?? engine.shotClock,
    gameClock: aiContext.gameClock,
    possessionId: aiContext.possessionId,
  };
}

function applyAI(dt) {
  if (!ai || !engine || currentModeKey === "threePoint" || currentModeKey === "practice") return;
  aiAccumulator += dt;
  if (aiAccumulator < 1 / 30) return;
  const aiStep = Math.min(0.1, aiAccumulator);
  aiAccumulator = 0;
  const intents = ai.update(aiStep, makeAISnapshot());
  const now = performance.now();
  for (const intent of intents) {
    const player = engine.players.find((candidate) => candidate.id === intent.playerId);
    if (!player || player.controlled) continue;
    player.metadata.externallyDriven = true;
    const dx = intent.move.target.x - player.root.position.x;
    const dz = intent.move.target.z - player.root.position.z;
    const length = Math.hypot(dx, dz) || 1;
    const speed = player.speed * clamp(intent.move.speed, 0, 1.1);
    player.desiredVelocity.set((dx / length) * speed, 0, (dz / length) * speed);
    const fx = intent.face.x - player.root.position.x;
    const fz = intent.face.z - player.root.position.z;
    if (Math.hypot(fx, fz) > 0.05) player.facing.set(fx, 0, fz).normalize();
    if (player.grounded) {
      if (["on_ball_defense", "transition_defense", "deny", "help", "contest"].includes(intent.state)) {
        player.setState(PLAYER_STATES.DEFEND);
      } else if (intent.state === "drive" || intent.state === "ball_handler" || intent.state === "create_shot") {
        player.setState(player.hasBall ? PLAYER_STATES.DRIBBLE : PLAYER_STATES.RUN);
      } else if (intent.state === "cut" || intent.state === "off_ball_space" || intent.state === "rebound") {
        player.setState(PLAYER_STATES.RUN);
      }
    }
    const action = intent.action;
    if (!action || (aiActionTimes.get(player.id) || 0) > now) continue;
    aiActionTimes.set(player.id, now + 420);
    if (action.type === "shoot") {
      const started = engine.shoot(player, clamp(action.quality, 0.48, 0.96), action.shotType);
      if (started) aiActionTimes.set(player.id, now + 1050);
    } else if (action.type === "pass") {
      engine.pass(player, engine.players.find((candidate) => candidate.id === action.targetPlayerId));
    } else if (action.type === "dribbleMove") {
      const moveMap = { hesitation: "hesi", sizeUp: "crossover", protect: "behindBack" };
      engine.performDribbleMove(player, moveMap[action.move] || action.move || "hesi");
    } else if (action.type === "steal") {
      engine.attemptSteal(player);
    } else if (["showHands", "contest", "block"].includes(action.type) && engine.ball.state === "shot") {
      engine.attemptBlock(player);
    } else if ((action.type === "secureBall" || action.type === "rebound") && !engine.ball.owner
        && player.root.position.distanceTo(engine.ball.position) < 1.1) {
      engine.ball.pickupCooldown = 0;
      engine.givePossession(player);
    }
  }
}

function updateHUD() {
  if (!mode) return;
  const owner = engine?.ball?.owner;
  const playerName = $("#player-card-name");
  const playerMeta = $("#player-card-meta");
  const playerCard = $("#player-card-hud");
  const hudPolicy = getGameplayHudPolicy(currentModeKey);
  const playerCardContent = getPlayerCardContent(currentModeKey, owner);
  setHidden($(".scoreboard", $("#hud")), !hudPolicy.showScoreboard);
  setHidden($("#three-point-progress"), !hudPolicy.showRackTracker);
  setHidden(playerCard, playerCardContent.hidden);
  if (playerName) playerName.textContent = playerCardContent.name;
  if (playerMeta) playerMeta.textContent = playerCardContent.meta;
  if (playerCard) playerCard.dataset.team = playerCardContent.team;
  const state = mode.getState();
  const uiState = mode.getUIState();
  if (currentModeKey === "practice") {
    $("#home-score").textContent = state.makes ?? 0;
    $("#away-score").textContent = state.attempts ?? 0;
    $("#game-clock").textContent = "FREEPLAY";
    $("#possession-label").textContent = "STREAK " + (state.streak || 0) + " · BEST " + (state.bestStreak || 0) + " · Q: BASIC · SHIFT+Q: ELITE";
  } else if (currentModeKey === "threePoint") {
    $("#home-score").textContent = state.score ?? 0;
    $("#away-score").textContent = state.targetScore ?? 18;
    $("#game-clock").textContent = uiState.clockText || "1:00";
    $("#possession-label").textContent = uiState.complete
      ? `ALL ${state.totalBalls || 25} BALLS COMPLETE`
      : `${uiState.rackLabel || "RACK"} ${uiState.rackProgress || "1/5"} · BALL ${uiState.ballProgress || "1/5"}${uiState.isMoneyBall ? " · MONEY BALL / 2 PTS" : ""}`;
  } else {
    $("#home-score").textContent = state.scores?.home ?? 0;
    $("#away-score").textContent = state.scores?.away ?? 0;
    $("#game-clock").textContent = currentModeKey === "team"
      ? `${uiState.clockText || "5:00"} · ${Math.ceil(state.shotClock || 0)}`
      : `${Math.ceil(state.shotClock || 0)} · FIRST TO ${state.targetScore}`;
    if (isTeamModeKey(currentModeKey)) {
      $("#game-clock").textContent = `${uiState.clockText || (currentModeKey === "fives" ? "6:00" : "5:00")} / ${Math.ceil(state.shotClock || 0)}`;
    }
    $("#possession-label").textContent = (uiState.statusText || `${state.possessionTeamId} ball`).toUpperCase();
  }
  const momentum = clamp(((state.scores?.home || state.score || 0) + 1) / ((state.targetScore || 15) + 1));
  $("#takeover-fill").style.width = `${Math.round(momentum * 100)}%`;
}

function endGame(result = mode?.getState()?.result || {}) {
  if (!gameActive) return;
  gameActive = false;
  engine?.setPaused(true);
  engine?.controls?.setEnabled(false);
  const state = mode?.getState() || {};
  const won = result.outcome === "win";
  announcer.announce("game_over", { force: true, userWon: won });
  $("#result-kicker").textContent = currentModeKey === "threePoint" ? "FINAL RACK" : "FINAL";
  $("#result-title").textContent = won ? "COURT CLEARED" : result.outcome === "complete" ? "RUN COMPLETE" : "RUN IT BACK";
  if (currentModeKey === "threePoint") {
    $("#result-summary").textContent = `${state.score || 0} POINTS`;
    $("#result-stats").innerHTML = `<span><b>${state.makes || 0}</b> MAKES</span><span><b>${state.attempts || 0}</b> ATTEMPTS</span><span><b>${state.moneyBallMakes || 0}</b> MONEY BALLS</span>`;
  } else {
    $("#result-summary").textContent = `${state.scores?.home || 0} — ${state.scores?.away || 0}`;
    $("#result-stats").innerHTML = `<span><b>${Math.round(state.elapsed || 0)}s</b> RUN TIME</span><span><b>${currentDifficulty.toUpperCase()}</b> DIFFICULTY</span><span><b>${MODE_META[currentModeKey].objective}</b> FORMAT</span>`;
  }
  const reward = awardMatch(playerProfile, {
    matchId: `${profileSessionId}-${runToken}`,
    won,
    mode: currentModeKey,
    difficulty: currentDifficulty,
  });
  if (reward.ok) {
    playerProfile = saveProfile(reward.profile);
    const summary = getProfileSummary(playerProfile);
    $("#result-reward").innerHTML = `<span><b>+${reward.baseCredits} CR</b> MATCH PAY</span>${won ? `<span class="is-win-bonus"><b>+${reward.winCredits} CR</b> WIN BONUS</span>` : ""}<span><b>+${reward.xp} XP</b> LEVEL ${summary.level}</span><span><b>${summary.overall} OVR</b> ${summary.title.name}</span>`;
    renderPlayerProfile();
  } else {
    $("#result-reward").textContent = "MATCH REWARD ALREADY SAVED";
  }
  setHidden($("#hud"), true);
  showOverlay("game-over");
  audio.playSfx(won ? "crowd" : "buzzer");
}

function pauseGame() {
  if (!gameActive || !engine) return;
  engine.setPaused(true);
  mode?.pause();
  showOverlay("pause-screen");
  app.dataset.state = "paused";
}

function resumeGame() {
  if (!engine || !mode) return;
  hideOverlay("pause-screen");
  mode.resume();
  engine.setPaused(false);
  engine.controls.setEnabled(
    ([MODE_PHASES.LIVE, MODE_PHASES.INBOUND].includes(mode.phase)
      || mode.getState?.().inboundRequiresPass)
      && !engine.isReplayFrozen(),
  );
  app.dataset.state = engine.isReplayFrozen() ? "replay" : "playing";
}

function tick(now) {
  const dt = clamp((now - lastFrame) / 1000, 0, 0.05);
  lastFrame = now;
  if (gameActive && mode && engine && !engine.paused) {
    const replayFrozen = engine.isReplayFrozen();
    if (!replayFrozen) {
      const response = mode.update(dt);
      processCommands(response.commands, runToken);
      applyAI(dt);
      if (mode.phase === MODE_PHASES.LIVE && !engine.getArcRunGrabSnapshot?.().active) {
        engine.controls.setEnabled(true);
      }
      if (["duos", "team", "quads"].includes(currentModeKey) && mode.needsClear && engine.ball.owner) {
        const p = engine.ball.owner.root.position;
        if (Math.hypot(p.x, p.z - COURT.basketZ) > 6.2) handleModeEvent("CLEAR_COMPLETE", { teamId: engine.ball.owner.team });
      }
    }
    hudAccumulator += dt;
    if (hudAccumulator >= 0.05) {
      hudAccumulator = 0;
      updateHUD();
    }
    if (mode.phase === MODE_PHASES.FINISHED && gameActive) endGame(mode.getState().result);
  }
  requestAnimationFrame(tick);
}

function ensurePracticeCard() {
  const grid = $(".mode-grid");
  if (!grid || $('[data-mode="practice"]', grid)) return;
  const card = document.createElement("button");
  card.className = "mode-card mode-card--practice";
  card.dataset.mode = "practice";
  card.innerHTML = '<span class="mode-card__number">04</span><span class="mode-card__tag">SOLO LAB</span><strong>OPEN<br>GYM</strong><p>Unlimited reps, automatic ball return, make streaks, and every signature handle move.</p><span class="mode-card__cta">ENTER THE LAB →</span>';
  grid.append(card);
  const index = $(".panel-index");
  if (index) index.textContent = "01 / 04";
}

function ensureBroadcastChrome() {
  const hud = $("#hud");
  if (!hud || $("#player-card-hud")) return;
  const playerCard = document.createElement("div");
  playerCard.id = "player-card-hud";
  playerCard.className = "player-card-hud";
  playerCard.dataset.team = "home";
  playerCard.innerHTML = '<span class="player-card-hud__number">01</span><div><b id="player-card-name">ACE NOVA</b><small id="player-card-meta">USER CONTROL · BALL HANDLER</small></div>';
  hud.append(playerCard);
}

function prepareGameplayHudCaptureState(modeKey = "street") {
  gameActive = false;
  engine?.controls?.setEnabled(false);
  if (engine) {
    engine.paused = true;
    engine.render();
  }
  app.dataset.state = "hud-capture";
  app.dataset.hudCapture = modeKey;
  for (const id of ["feedback", "subtitles", "toast"]) setHidden($(`#${id}`), true);
  setHidden($(".caption-bubble"), true);
  return {
    mode: currentModeKey,
    policy: getGameplayHudPolicy(currentModeKey),
    scoreboard: $(".scoreboard", $("#hud"))?.getBoundingClientRect?.().toJSON?.() || null,
  };
}

function bindUI() {
  ensurePracticeCard();
  ensureBroadcastChrome();
  renderPlayerProfile();
  renderShootingAssistSetting();
  $("#close-my-player")?.addEventListener("click", (event) => {
    event.preventDefault();
    event.stopPropagation();
    showMainMenu();
  });
  $$("[data-action=\"back-menu\"], [data-action=\"quit-menu\"]").forEach((button) => button.addEventListener("click", showMainMenu));
  $$("[data-action=\"back-modes\"]").forEach((button) => button.addEventListener("click", () => {
    hideOverlay("game-over");
    showModeSelect();
  }));
  $("#quick-play")?.addEventListener("click", () => showBallSelection("street", "menu"));
  $("#open-modes")?.addEventListener("click", showModeSelect);
  $("#open-my-player")?.addEventListener("click", showMyPlayer);
  $("#open-controls")?.addEventListener("click", () => showOverlay("controls-screen"));
  $("#open-tutorial")?.addEventListener("click", () => {
    hideOverlay("controls-screen");
    startTutorial();
  });
  $("#open-settings")?.addEventListener("click", () => showOverlay("settings-screen"));
  $("#position-tabs")?.addEventListener("click", (event) => {
    const button = event.target.closest("[data-position]");
    if (!button) return;
    const result = selectPosition(playerProfile, button.dataset.position);
    if (result.ok) commitProfile(result.profile, `${POSITION_PRESETS[button.dataset.position].name} build selected.`);
    audio.playSfx("ui");
  });
  $("#attribute-groups")?.addEventListener("click", (event) => {
    const button = event.target.closest("[data-upgrade]");
    if (!button) return;
    const result = upgradeAttribute(playerProfile, button.dataset.upgrade);
    if (result.ok) {
      commitProfile(result.profile, `${ATTRIBUTE_LABELS[button.dataset.upgrade]} upgraded to ${result.profile.builds[result.profile.selectedPosition].attributes[button.dataset.upgrade]}.`);
      audio.playSfx("score");
    } else {
      profileMessage(result.reason === "at-cap" ? "That rating is already at its position cap." : "Earn more credits by completing matches.", "warning");
      audio.playSfx("ui");
    }
  });
  $("#cosmetic-grid")?.addEventListener("click", (event) => {
    const button = event.target.closest("[data-cosmetic]");
    if (!button) return;
    const cosmeticId = button.dataset.cosmetic;
    const owned = playerProfile.cosmetics.owned.includes(cosmeticId);
    const result = owned ? equipCosmetic(playerProfile, cosmeticId) : purchaseCosmetic(playerProfile, cosmeticId);
    const item = COSMETIC_PALETTES.find((candidate) => candidate.id === cosmeticId);
    if (result.ok) {
      commitProfile(result.profile, `${item.name} ${owned ? "equipped" : "unlocked and equipped"}.`);
      audio.playSfx("score");
    } else {
      profileMessage("Earn more credits to unlock that colorway.", "warning");
      audio.playSfx("ui");
    }
  });
  $("#save-identity")?.addEventListener("click", () => {
    const result = updatePlayerIdentity(playerProfile, {
      displayName: $("#identity-name")?.value,
      jerseyNumber: $("#jersey-number")?.value,
      appearanceId: playerProfile.identity.appearanceId,
      hairStyleId: playerProfile.identity.hairStyleId,
      skinToneId: playerProfile.identity.skinToneId,
      heightM: $("#player-height")?.value,
      shoeStyleId: playerProfile.identity.shoeStyleId,
      jerseyStyle: playerProfile.identity.jerseyStyle,
    });
    if (result.ok) commitProfile(result.profile, "Player identity saved.");
    else profileMessage("Enter a name using letters or numbers.", "warning");
  });
  $("#hair-style-grid")?.addEventListener("click", (event) => {
    const button = event.target.closest("[data-hair-style]");
    if (!button) return;
    const result = updatePlayerIdentity(playerProfile, {
      displayName: playerProfile.identity.displayName || "Ace Nova",
      hairStyleId: button.dataset.hairStyle,
    });
    if (result.ok) commitProfile(result.profile, `${HAIR_STYLES.find((item) => item.id === button.dataset.hairStyle)?.name} equipped.`);
  });
  $("#skin-tone-grid")?.addEventListener("click", (event) => {
    const button = event.target.closest("[data-skin-tone]");
    if (!button) return;
    const result = updatePlayerIdentity(playerProfile, {
      displayName: playerProfile.identity.displayName || "Ace Nova",
      skinToneId: button.dataset.skinTone,
    });
    if (result.ok) commitProfile(result.profile, `${SKIN_TONES.find((item) => item.id === button.dataset.skinTone)?.name} equipped.`);
  });
  $("#player-height")?.addEventListener("input", (event) => {
    $("#player-height-output").textContent = formatPlayerHeight(event.target.value);
  });
  $("#player-height")?.addEventListener("change", (event) => {
    const result = updatePlayerIdentity(playerProfile, {
      displayName: playerProfile.identity.displayName || "Ace Nova",
      heightM: event.target.value,
    });
    if (result.ok) commitProfile(result.profile, `Height saved at ${formatPlayerHeight(result.profile.identity.heightM)}.`);
  });
  $("#shoe-style-grid")?.addEventListener("click", (event) => {
    const button = event.target.closest("[data-shoe-style]");
    if (!button) return;
    const result = updatePlayerIdentity(playerProfile, {
      displayName: playerProfile.identity.displayName || "Ace Nova",
      shoeStyleId: button.dataset.shoeStyle,
    });
    if (result.ok) {
      commitProfile(
        result.profile,
        `${BASKETBALL_SHOE_STYLES.find((item) => item.id === button.dataset.shoeStyle)?.name} equipped.`,
      );
    }
  });
  $("#shoe-colorway-grid")?.addEventListener("click", (event) => {
    const button = event.target.closest("[data-shoe-colorway]");
    if (!button) return;
    const result = updatePlayerIdentity(playerProfile, {
      displayName: playerProfile.identity.displayName || "Ace Nova",
      shoeColorwayId: button.dataset.shoeColorway,
    });
    if (result.ok) {
      commitProfile(
        result.profile,
        `${BASKETBALL_SHOE_COLORWAYS.find((item) => item.id === button.dataset.shoeColorway)?.name} shoes equipped.`,
      );
    }
  });
  const jerseyProfileSelectors = [
    "#jersey-fit",
    "#jersey-length",
    "#jersey-hem",
    "#jersey-panel",
    "#jersey-fabric",
  ];
  jerseyProfileSelectors.forEach((selector) => {
    $(selector)?.addEventListener("input", updateJerseyControlOutputs);
    $(selector)?.addEventListener("change", () => {
      const result = updatePlayerIdentity(playerProfile, {
        displayName: playerProfile.identity.displayName || "Ace Nova",
        jerseyStyle: {
          fit: $("#jersey-fit")?.value,
          length: $("#jersey-length")?.value,
          hemFlare: $("#jersey-hem")?.value,
          sidePanelWidth: $("#jersey-panel")?.value,
          fabricResponse: $("#jersey-fabric")?.value,
        },
      });
      if (result.ok) commitProfile(result.profile, "Jersey fit saved.");
    });
  });
  $("#title-grid")?.addEventListener("click", (event) => {
    const button = event.target.closest("[data-title]");
    if (!button) return;
    const result = selectTitle(playerProfile, button.dataset.title);
    if (result.ok) commitProfile(result.profile, `${result.profile.identity.selectedTitle === "legend" ? "LEGEND" : button.textContent} title equipped.`);
  });
  $("#create-player-form")?.addEventListener("submit", (event) => {
    event.preventDefault();
    const result = updatePlayerIdentity(playerProfile, {
      displayName: $("#create-player-name")?.value,
      jerseyNumber: $("#create-player-number")?.value,
      hairStyleId: $("#create-player-hair")?.value,
      skinToneId: $("#create-player-skin")?.value,
      heightM: $("#create-player-height")?.value,
      shoeStyleId: $("#create-player-shoe-style")?.value,
      shoeColorwayId: $("#create-player-shoe-colorway")?.value,
      jerseyStyle: onboardingJerseyStyle(),
    });
    if (!result.ok) {
      $("#create-player-error").textContent = "Enter a display name using letters or numbers.";
      return;
    }
    playerProfile = saveProfile(result.profile);
    setHidden($("#create-player-screen"), true);
    renderPlayerProfile();
    startAttractMode();
    showMainMenu();
  });
  $("#create-player-form")?.addEventListener("click", (event) => {
    const next = event.target.closest("[data-wizard-next]");
    const back = event.target.closest("[data-wizard-back]");
    if (next) {
      if (onboardingStep === "identity" && !$("#create-player-name")?.value.trim()) {
        $("#create-player-error").textContent = "Enter a display name before continuing.";
        $("#create-player-name")?.focus();
        return;
      }
      $("#create-player-error").textContent = "";
      setOnboardingStep(next.dataset.wizardNext);
    } else if (back) {
      $("#create-player-error").textContent = "";
      setOnboardingStep(back.dataset.wizardBack);
    }
  });
  $("#create-player-form")?.addEventListener("input", (event) => {
    if (event.target.id === "create-player-height") {
      $("#create-player-height-output").textContent = formatPlayerHeight(event.target.value);
    }
    updateJerseyControlOutputs();
    if (onboardingStep !== "appearance") return;
    if (event.target.id.startsWith("create-player-jersey-")
        && event.target.id !== "create-player-jersey-fit") {
      onboardingPreview?.player?.setJerseyParameters(onboardingJerseyStyle());
    } else {
      rebuildOnboardingPreview();
    }
  });
  $("#create-player-form")?.addEventListener("change", (event) => {
    if (onboardingStep === "appearance"
        && ["create-player-hair", "create-player-skin", "create-player-shoe-style", "create-player-shoe-colorway", "create-player-jersey-fit"].includes(event.target.id)) {
      rebuildOnboardingPreview();
    }
  });
  $("#tutorial-skip")?.addEventListener("click", () => {
    presentationDirector?.skip?.();
    showMainMenu();
  });
  $("#tutorial-replay")?.addEventListener("click", () => {
    $("#tutorial-replay").hidden = true;
    presentationDirector?.replay?.();
  });
  $("#start-selected-mode")?.addEventListener("click", () => showBallSelection(selectedModeKey, "modes"));
  $("#back-from-ball-select")?.addEventListener("click", leaveBallSelection);
  $("#previous-ball")?.addEventListener("click", () => moveBallSelection(-1));
  $("#next-ball")?.addEventListener("click", () => moveBallSelection(1));
  $("#confirm-ball-selection")?.addEventListener("click", confirmBallSelection);
  $("#back-from-venue-select")?.addEventListener("click", leaveVenueSelection);
  $("#previous-venue")?.addEventListener("click", () => moveVenueSelection(-1));
  $("#next-venue")?.addEventListener("click", () => moveVenueSelection(1));
  $("#confirm-venue-selection")?.addEventListener("click", confirmVenueSelection);
  $("#pause-button")?.addEventListener("click", pauseGame);
  $("#resume-game")?.addEventListener("click", resumeGame);
  $("#restart-game")?.addEventListener("click", () => startMode(currentModeKey));
  $("#rematch")?.addEventListener("click", () => startMode(currentModeKey));

  $$(".mode-card").forEach((card) => card.addEventListener("click", () => {
    $$(".mode-card").forEach((item) => item.classList.remove("is-selected"));
    card.classList.add("is-selected");
    selectedModeKey = card.dataset.mode;
    audio.setMusicMode(selectedModeKey);
    audio.playSfx("ui");
  }));

  $$("[data-action]").forEach((button) => button.addEventListener("click", () => {
    const action = button.dataset.action;
    if (action === "back-menu" || action === "quit-menu") showMainMenu();
    if (action === "back-modes") {
      hideOverlay("game-over");
      showModeSelect();
    }
    if (action === "open-settings") showOverlay("settings-screen");
    if (action === "close-overlay") {
      hideOverlay("settings-screen");
      hideOverlay("controls-screen");
    }
  }));

  $("#difficulty-select")?.addEventListener("change", (event) => {
    currentDifficulty = event.target.value;
    audio.playSfx("ui");
  });
  $("#quality-select")?.addEventListener("change", () => {
    if (!engine) return;
    const performanceMode = $("#quality-select").value === "performance";
    engine.renderer.setPixelRatio(performanceMode ? 1 : Math.min(devicePixelRatio || 1, 1.75));
    engine.renderer.shadowMap.enabled = !performanceMode;
  });
  $("#music-volume")?.addEventListener("input", (event) => {
    audio.setMusicVolume(Number(event.target.value) / 100);
    if (event.target.nextElementSibling) event.target.nextElementSibling.value = String(event.target.value);
  });
  $("#sfx-volume")?.addEventListener("input", (event) => {
    audio.setSfxVolume(Number(event.target.value) / 100);
    if (event.target.nextElementSibling) event.target.nextElementSibling.value = String(event.target.value);
  });
  $("#camera-shake")?.addEventListener("input", (event) => {
    ui.settings.cameraShake = Number(event.target.value) / 100;
    if (event.target.nextElementSibling) event.target.nextElementSibling.value = String(event.target.value);
  });
  $("#shooting-assist")?.addEventListener("input", (event) => {
    const shootingAssist = normalizeShootingAssist(Number(event.target.value) / 100);
    ui.applySettings({ ...ui.settings, shootingAssist });
    renderShootingAssistSetting(shootingAssist);
    engine?.setUserShootingAssist(shootingAssist);
  });
  $("#shooting-assist")?.addEventListener("change", () => audio.playSfx("ui"));
  $("#reduced-motion")?.addEventListener("change", (event) => ui.applySettings({ ...ui.settings, reducedMotion: event.target.checked }));
  $("#high-contrast")?.addEventListener("change", (event) => ui.applySettings({ ...ui.settings, highContrast: event.target.checked }));
  $("#captions-enabled")?.addEventListener("change", (event) => {
    ui.applySettings({ ...ui.settings, captions: event.target.checked });
    audio.setCaptions(event.target.checked);
  });
  $("#mute-all")?.addEventListener("change", (event) => ui.applySettings({ ...ui.settings, muted: event.target.checked }));

  window.addEventListener("nova:settings", (event) => {
    if (!engine) return;
    engine.options.reducedMotion = event.detail.reducedMotion;
    engine.setBasketballStyle(event.detail.ballStyle);
  });
  window.addEventListener("keydown", (event) => {
    if (app.dataset.state === "ball-select" && event.code === "ArrowLeft") moveBallSelection(-1);
    else if (app.dataset.state === "ball-select" && event.code === "ArrowRight") moveBallSelection(1);
    else if (app.dataset.state === "ball-select" && event.code === "Escape") leaveBallSelection();
    else if (app.dataset.state === "venue-select" && event.code === "ArrowLeft") moveVenueSelection(-1);
    else if (app.dataset.state === "venue-select" && event.code === "ArrowRight") moveVenueSelection(1);
    else if (app.dataset.state === "venue-select" && event.code === "Escape") leaveVenueSelection();
    else if (event.code === "Escape" && !$("#settings-screen").hidden) hideOverlay("settings-screen");
    else if (event.code === "Escape" && !$("#controls-screen").hidden) hideOverlay("controls-screen");
    else if (event.code === "Escape" && !$("#my-player-screen").hidden) showMainMenu();
  });
  window.addEventListener("pointerdown", unlockAudio, { once: true });
  window.addEventListener("keydown", unlockAudio, { once: true });
}

function fail(error) {
  console.error(error);
  $("#error-message").textContent = error?.message || "NOVA COURT could not start. Try refreshing with WebGL enabled.";
  setHidden($("#loading-screen"), true);
  showOverlay("fatal-error");
  app.dataset.state = "error";
}

async function boot() {
  bindUI();
  try {
    if (!globalThis.THREE || !globalThis.WebGLRenderingContext) throw new Error("WebGL is unavailable in this browser.");
    const bootQuery = new URLSearchParams(location.search);
    if (bootQuery.get("captureHeight") === "720") {
      app.style.width = "1278px";
      app.style.height = "720px";
    }
    updateSceneLoading("boot", "shell", 0.14, ["court-fallback"]);
    $("#loader-copy").textContent = "Lighting the night court…";
    createEngine("street", true);
    updateSceneLoading("boot", "required", 0.72, ["court-fallback", "court", "hoops", "players"]);
    $("#loader-copy").textContent = "Calibrating ball physics…";
    updateSceneLoading("boot", "optional", 0.92, ["court-fallback", "court", "hoops", "players", "venue-details"]);
    updateSceneLoading("boot", "ready", 1);
    const captureName = bootQuery.get("arcRunCapture");
    const venueSelectCapture = bootQuery.get("venueSelectCapture");
    const gameplayVenueCapture = bootQuery.get("gameplayVenueCapture");
    const gameplayHudCapture = bootQuery.get("gameplayHudCapture");
    const openGymCapture = bootQuery.get("openGymCapture");
    if (captureName) {
      prepareArcRunCaptureState(captureName);
      setHidden($("#loading-screen"), true);
    } else if (venueSelectCapture) {
      pendingModeKey = MODE_META[bootQuery.get("mode")] ? bootQuery.get("mode") : "street";
      showVenueSelection(venueSelectCapture);
      setHidden($("#loading-screen"), true);
    } else if (gameplayHudCapture) {
      const captureMode = MODE_META[gameplayHudCapture] ? gameplayHudCapture : "street";
      await startMode(captureMode);
      prepareGameplayHudCaptureState(captureMode);
      setHidden($("#loading-screen"), true);
    } else if (gameplayVenueCapture) {
      pendingVenueId = getVenueOption(gameplayVenueCapture).id;
      await startMode(MODE_META[bootQuery.get("mode")] ? bootQuery.get("mode") : "practice");
      setHidden($("#loading-screen"), true);
    } else if (openGymCapture) {
      pendingVenueId = getVenueOption(bootQuery.get("venue") || "montgomery").id;
      await startMode("practice", { loadVenueDetails: false });
      engine.paused = true;
      engine.controls.setEnabled(false);
      app.dataset.openGymCapture = openGymCapture;
      setHidden($("#loading-screen"), true);
    } else {
      const forceOnboarding = bootQuery.get("onboarding") === "1";
      if (forceOnboarding || getProfileSummary(playerProfile).needsOnboarding) {
        setHidden($("#loading-screen"), true);
        hideOverlay("pause-screen");
        hideOverlay("game-over");
        setHidden($("#main-menu"), true);
        setHidden($("#mode-select"), true);
        setHidden($("#ball-select"), true);
        setHidden($("#venue-select"), true);
        setHidden($("#create-player-screen"), false);
        app.dataset.state = "onboarding";
        const requestedStep = ONBOARDING_STEPS.includes(bootQuery.get("step"))
          ? bootQuery.get("step")
          : "identity";
        setOnboardingStep(requestedStep);
      } else {
        startAttractMode();
        showMainMenu();
      }
    }
    requestAnimationFrame(tick);
  } catch (error) {
    fail(error);
  }
}

window.addEventListener("error", (event) => {
  if (app.dataset.state === "loading") fail(event.error || new Error(event.message));
});
window.addEventListener("unhandledrejection", (event) => {
  console.error("Unhandled NOVA COURT rejection:", event.reason);
});

boot();
