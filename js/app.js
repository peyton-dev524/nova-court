import { NovaCourtEngine, PLAYER_STATES, COURT } from "./engine.js?v=6.0";
import { createAIDirector } from "./ai.js?v=4.0";
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
  ATTRIBUTE_GROUPS,
  ATTRIBUTE_LABELS,
  AVATAR_APPEARANCES,
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

const compat = document.createElement("link");
compat.rel = "stylesheet";
compat.href = "./js/compat.css?v=7.0";
document.head.append(compat);
for (const href of [
  "./js/ui-menu-polish.css?v=1.1",
  "./js/ui-hud-polish.css?v=1.1",
  "./js/ui-profile-polish.css?v=1.1",
  "./js/ui-shooting-settings.css?v=1.0",
  "./js/ui-ball-selection.css?v=1.0",
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

function showMainMenu() {
  gameActive = false;
  ballSelectionPreview?.setVisible(false);
  resetShotMeter();
  audio.setMusicMode("street");
  announcer.stop();
  if (presentationKind !== "attract") startAttractMode();
  engine?.setPaused(false);
  engine?.controls?.setEnabled(false);
  setHidden($("#loading-screen"), true);
  setHidden($("#mode-select"), true);
  setHidden($("#ball-select"), true);
  setHidden($("#pause-screen"), true);
  setHidden($("#game-over"), true);
  setHidden($("#controls-screen"), true);
  setHidden($("#settings-screen"), true);
  setHidden($("#my-player-screen"), true);
  setHidden($("#create-player-screen"), true);
  setHidden($("#tutorial-screen"), true);
  setHidden($("#hud"), true);
  setHidden($("#main-menu"), false);
  app.dataset.state = "menu";
  renderPlayerProfile();
}

function showModeSelect() {
  engine?.setPaused(true);
  ballSelectionPreview?.setVisible(false);
  resetShotMeter();
  for (const id of ["main-menu", "my-player-screen", "ball-select", "pause-screen", "game-over", "controls-screen", "settings-screen", "tutorial-screen"]) {
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
  for (const id of ["main-menu", "my-player-screen", "mode-select", "ball-select", "pause-screen", "game-over", "controls-screen", "settings-screen"]) {
    setHidden($(`#${id}`), true);
  }
  setHidden($("#hud"), false);
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
  $("#confirm-ball-selection strong").textContent = pendingModeKey === "practice"
    ? "ENTER OPEN GYM"
    : `ENTER ${modeMeta.label}`;
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
  for (const id of ["main-menu", "my-player-screen", "mode-select", "pause-screen", "game-over", "controls-screen", "settings-screen", "tutorial-screen", "hud"]) {
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

  const appearanceRoot = $("#appearance-grid");
  appearanceRoot?.replaceChildren(...AVATAR_APPEARANCES.map((item) => {
    const button = document.createElement("button");
    button.type = "button";
    button.className = `identity-choice${summary.appearance.id === item.id ? " is-selected" : ""}`;
    button.dataset.appearance = item.id;
    button.setAttribute("aria-pressed", String(summary.appearance.id === item.id));
    button.innerHTML = `<i style="--skin:#${item.skin.toString(16).padStart(6, "0")}"></i><span>${item.name}</span>`;
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

function createEngine(modeKey, preview = false, roster = null) {
  engine?.destroy();
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
    venue: modeKey === "street" ? "park" : teamMode ? "arena" : "arena",
    reducedMotion: ui.settings.reducedMotion,
    userShootingAssist: ui.settings.shootingAssist,
    ballStyle: ui.settings.ballStyle,
  });
  bindEngineEvents();
  engine.start();
  engine.setPaused(preview);
  engine.controls.setEnabled(!preview);
  if (new URLSearchParams(location.search).has("qa")) {
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
      presentation: () => presentationDirector?.getSnapshot?.() || null,
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
  for (const id of ["main-menu", "my-player-screen", "mode-select", "ball-select", "pause-screen", "game-over", "controls-screen", "settings-screen"]) {
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
    return { difficulty: currentDifficulty, duration, targetScore: 18, moneyRackIndex: 2 };
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

function startMode(modeKey = selectedModeKey) {
  stopPresentation();
  resetShotMeter();
  runToken += 1;
  pendingShot = null;
  aiActionTimes.clear();
  aiAccumulator = 0;
  hudAccumulator = 0;
  currentModeKey = MODE_META[modeKey] ? modeKey : "street";
  selectedModeKey = currentModeKey;
  audio.setMusicMode(currentModeKey);
  unlockAudio().catch(() => {});
  currentDifficulty = $("#difficulty-select")?.value || "pro";
  const token = runToken;
  createEngine(currentModeKey);
  engine.setCameraMode(currentModeKey === "threePoint"
    ? "broadcast"
    : cameraPresetForTeamMode(currentModeKey).mode);
  mode = createModeController(currentModeKey);
  const opening = mode.start({ teamIds: ["home", "away"], userTeamId: "home" });
  processCommands(opening?.commands, token);
  ai = createAIDirector({
    difficulty: currentDifficulty,
    teamIds: currentModeKey === "threePoint" || currentModeKey === "practice" ? [] : null,
    debug: new URLSearchParams(location.search).has("aiDebug"),
  });
  const meta = MODE_META[currentModeKey];
  $("#mode-label").textContent = meta.label;
  $("#home-label").textContent = meta.home;
  $("#away-label").textContent = meta.away;
  $("#game-clock").textContent = meta.objective;
  setHidden($("#three-point-progress"), currentModeKey !== "threePoint");
  setHidden($("#teammate-hints"), !isTeamModeKey(currentModeKey));
  setHidden($("#restart-game"), !allowsRestart(currentModeKey));
  setHidden($("#rematch"), !allowsRestart(currentModeKey));
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
}

function buildRackProgress() {
  const node = $("#three-point-progress");
  if (!node) return;
  node.replaceChildren();
  for (let i = 0; i < 25; i += 1) {
    const dot = document.createElement("i");
    dot.dataset.ball = String(i);
    if (i % 5 === 4 || Math.floor(i / 5) === 2) dot.classList.add("is-money");
    node.append(dot);
  }
}

function handleModeEvent(type, payload = {}) {
  if (!mode) return null;
  const response = mode.handleEvent(type, payload);
  processCommands(response.commands, runToken);
  updateHUD();
  return response;
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
        placeAtRack(command.position || command.rack);
        break;
      case "SPAWN_RACK_BALL":
        placeAtRack(command.rack);
        setTimeout(() => {
          if (token !== runToken) return;
          engine.givePossession(engine.controlledPlayer, true);
          engine.controls.setEnabled(true);
        }, 90);
        break;
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
        feedback(String(command.seconds), "accent", 720);
        audio.playSfx("countdown");
        break;
      case "ANNOUNCE":
        feedback(command.text, command.tone === "overtime" ? "warning" : "good", 1100);
        announcer.announce(command.event || (command.tone === "overtime" ? "overtime" : "score"), { force: true });
        break;
      case "CONTEST_SHOT_RESOLVED":
        markRackBall(command.made);
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

function placeAtRack(rack) {
  if (!rack || !engine?.controlledPlayer) return;
  const player = engine.controlledPlayer;
  player.root.position.set(Number(rack.x) || 0, 0, Number(rack.z) || 2.4);
  player.velocity.set(0, 0, 0);
  player.desiredVelocity.set(0, 0, 0);
  player.facing.set(0, 0, -1);
  player.root.rotation.y = Math.PI;
  engine.givePossession(player, true);
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

function markRackBall(made) {
  const state = mode?.getState();
  const index = Math.max(0, (state?.attempts || 1) - 1);
  const dot = $(`[data-ball="${index}"]`, $("#three-point-progress"));
  dot?.classList.add(made ? "is-made" : "is-missed");
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
    pendingShot = {
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
      shotId: `${runToken}-${Math.round(performance.now())}`,
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
      handleModeEvent("MISS", { playerId: pendingShot.player?.id, teamId: pendingShot.player?.team });
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
      handleModeEvent("MISS", { playerId: pendingShot.player?.id, teamId: pendingShot.player?.team, reason: "out_of_bounds" });
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
  if (playerName) playerName.textContent = owner?.name || "LOOSE BALL";
  if (playerMeta) playerMeta.textContent = owner
    ? (owner.controlled ? "USER CONTROL" : "CPU") + " · " + String(owner.state || "LIVE").replaceAll("_", " ").toUpperCase()
    : "LIVE BALL · CRASH THE GLASS";
  if (playerCard) playerCard.dataset.team = owner?.team || "neutral";
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
    $("#possession-label").textContent = `${uiState.rackLabel || "RACK"} · BALL ${uiState.ballProgress || "1/5"}`;
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
      if (mode.phase === MODE_PHASES.LIVE) engine.controls.setEnabled(true);
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
  if (!hud || $("#broadcast-bug")) return;
  const bug = document.createElement("div");
  bug.id = "broadcast-bug";
  bug.className = "broadcast-bug";
  bug.innerHTML = '<b>NCN</b><span>LIVE</span><small>NOVA COURT NETWORK</small>';
  hud.append(bug);
  const playerCard = document.createElement("div");
  playerCard.id = "player-card-hud";
  playerCard.className = "player-card-hud";
  playerCard.dataset.team = "home";
  playerCard.innerHTML = '<span class="player-card-hud__number">01</span><div><b id="player-card-name">ACE NOVA</b><small id="player-card-meta">USER CONTROL · BALL HANDLER</small></div>';
  hud.append(playerCard);
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
    });
    if (result.ok) commitProfile(result.profile, "Player identity saved.");
    else profileMessage("Enter a name using letters or numbers.", "warning");
  });
  $("#appearance-grid")?.addEventListener("click", (event) => {
    const button = event.target.closest("[data-appearance]");
    if (!button) return;
    const result = updatePlayerIdentity(playerProfile, {
      displayName: playerProfile.identity.displayName || "Ace Nova",
      appearanceId: button.dataset.appearance,
    });
    if (result.ok) commitProfile(result.profile, `${AVATAR_APPEARANCES.find((item) => item.id === button.dataset.appearance)?.name} appearance equipped.`);
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
      appearanceId: $("#create-player-appearance")?.value,
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
    $("#loader-fill").style.width = "34%";
    $("#loader-copy").textContent = "Lighting the night court…";
    createEngine("street", true);
    $("#loader-fill").style.width = "76%";
    $("#loader-copy").textContent = "Calibrating ball physics…";
    await new Promise((resolve) => setTimeout(resolve, 420));
    $("#loader-fill").style.width = "100%";
    await new Promise((resolve) => setTimeout(resolve, 220));
    if (getProfileSummary(playerProfile).needsOnboarding) {
      setHidden($("#loading-screen"), true);
      setHidden($("#create-player-screen"), false);
      app.dataset.state = "onboarding";
      $("#create-player-name")?.focus();
    } else {
      startAttractMode();
      showMainMenu();
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
