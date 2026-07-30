import { NovaCourtEngine, PLAYER_STATES, COURT } from "./engine.js?v=5.4";
import { createAIDirector } from "./ai.js?v=4.0";
import { createGameMode, MODE_IDS, MODE_PHASES } from "./modes.js";
import { createPracticeMode, PRACTICE_MODE_ID } from "./practice.js";
import { createHalfCourtDuosMode } from "./half-court-duos-mode.js";
import { createFullCourtFiveOnFiveMode } from "./full-court-mode.js";
import { createCourtRuntime } from "./court-runtime.js";
import { createTeamRoster, getFormatForModeKey, isTeamModeKey, TEAM_FORMAT_IDS } from "./team-formats.js";
import { createAnnouncerRuntime } from "./announcer-runtime.js";
import { createAudioController } from "./audio.js";
import { createUIController } from "./ui.js";
import {
  ATTRIBUTE_GROUPS,
  ATTRIBUTE_LABELS,
  COSMETIC_PALETTES,
  POSITION_PRESETS,
  awardMatch,
  equipCosmetic,
  getEnginePlayerConfig,
  getNightLeagueRank,
  getProfileSummary,
  getUpgradeCost,
  loadProfile,
  purchaseCosmetic,
  saveProfile,
  selectPosition,
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
  fives: TEAM_FORMAT_IDS.FULL_FIVE,
  practice: PRACTICE_MODE_ID,
});

const MODE_META = Object.freeze({
  street: { label: "NOVA PARK", home: "NOVA", away: "ECLIPSE", objective: "FIRST TO 11" },
  duos: { label: "NOVA DUOS", home: "NOVA", away: "ECLIPSE", objective: "FIRST TO 13" },
  threePoint: { label: "ARC RUN", home: "SCORE", away: "TARGET", objective: "60 SECONDS" },
  team: { label: "NIGHT THREES", home: "NOVA", away: "ECLIPSE", objective: "FIRST TO 15" },
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
let broadcastMomentTimer = 0;
let controlHintTimer = 0;
let gamePointSignature = "";
const lastRenderedScores = { home: null, away: null };
let livePlayerStats = { points: 0, rebounds: 0, assists: 0, steals: 0, blocks: 0, grade: 76 };
let assistCandidate = null;
let targetLabelTimer = 0;
let controlGuideHeld = false;
let lastInputScheme = "keyboard";

const compat = document.createElement("link");
compat.rel = "stylesheet";
compat.href = "./js/compat.css?v=5.0";
document.head.append(compat);
const ncnPresentation = document.createElement("link");
ncnPresentation.rel = "stylesheet";
ncnPresentation.href = "./js/ncn-presentation.css?v=1.0";
document.head.append(ncnPresentation);

function setHidden(node, hidden) {
  if (!node) return;
  node.classList.toggle("is-hidden", hidden);
  node.hidden = hidden;
  node.setAttribute("aria-hidden", String(hidden));
}

function showMainMenu() {
  gameActive = false;
  engine?.setPaused(true);
  engine?.controls?.setEnabled(false);
  setHidden($("#loading-screen"), true);
  setHidden($("#mode-select"), true);
  setHidden($("#pause-screen"), true);
  setHidden($("#game-over"), true);
  setHidden($("#controls-screen"), true);
  setHidden($("#settings-screen"), true);
  setHidden($("#my-player-screen"), true);
  setHidden($("#hud"), true);
  setHidden($("#main-menu"), false);
  app.dataset.state = "menu";
}

function showModeSelect() {
  setHidden($("#main-menu"), true);
  setHidden($("#my-player-screen"), true);
  setHidden($("#mode-select"), false);
  app.dataset.state = "modes";
  $("#mode-select").scrollTop = 0;
  $(".mode-card.is-selected")?.focus({ preventScroll: true });
  requestAnimationFrame(() => { $("#mode-select").scrollTop = 0; });
}

function showGame() {
  for (const id of ["main-menu", "my-player-screen", "mode-select", "pause-screen", "game-over", "controls-screen", "settings-screen"]) {
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

function showBroadcastMoment(kicker, title, detail = "", stat = "", duration = 1800) {
  const node = $("#broadcast-moment");
  if (!node) return;
  $(".broadcast-moment__kicker", node).textContent = kicker;
  $(".broadcast-moment__title", node).textContent = title;
  $(".broadcast-moment__detail", node).textContent = detail;
  $(".broadcast-moment__stat", node).textContent = stat;
  node.dataset.kind = String(kicker || "live").toLowerCase().replaceAll(" ", "-");
  node.classList.remove("is-visible");
  requestAnimationFrame(() => node.classList.add("is-visible"));
  clearTimeout(broadcastMomentTimer);
  broadcastMomentTimer = setTimeout(() => node.classList.remove("is-visible"), duration);
}

function setScoreValue(id, value) {
  const node = $(id);
  const key = id.includes("home") ? "home" : "away";
  const normalized = String(value ?? 0);
  if (lastRenderedScores[key] !== null && lastRenderedScores[key] !== normalized) {
    node.classList.remove("is-changing");
    requestAnimationFrame(() => node.classList.add("is-changing"));
  }
  lastRenderedScores[key] = normalized;
  node.textContent = normalized;
}

function gradeFromScore(score = livePlayerStats.grade) {
  if (score >= 94) return "A+";
  if (score >= 88) return "A";
  if (score >= 83) return "A-";
  if (score >= 78) return "B+";
  if (score >= 72) return "B";
  if (score >= 67) return "B-";
  if (score >= 61) return "C+";
  return "C";
}

function adjustGrade(amount, reason = "") {
  livePlayerStats.grade = clamp(livePlayerStats.grade + amount, 40, 100);
  const card = $("#player-card-hud");
  card?.classList.remove(amount >= 0 ? "grade-down" : "grade-up");
  card?.classList.add(amount >= 0 ? "grade-up" : "grade-down");
  setTimeout(() => card?.classList.remove("grade-up", "grade-down"), 520);
  if (reason) feedback(`${reason} · GRADE ${gradeFromScore()}`, amount >= 0 ? "good" : "warning", 620);
}

function maybeQueueHighlight(kind, delay = 180) {
  const frequency = $("#highlight-frequency")?.value || "broadcast";
  if (frequency === "off" || currentModeKey === "practice" || currentModeKey === "threePoint") return;
  if (frequency === "reduced" && !["dunk", "gameWinner"].includes(kind)) return;
  setTimeout(() => {
    if (!gameActive || engine?.isReplayFrozen?.() || engine?.highlightPending > 0) return;
    engine?.queueHighlight?.(kind === "ankleBreak" ? 1.8 : 2.05);
  }, delay);
}

function updateControlHintScheme(force = false) {
  const gamepad = Boolean(navigator.getGamepads?.().some(Boolean));
  const scheme = gamepad ? "gamepad" : "keyboard";
  if (!force && scheme === lastInputScheme) return;
  lastInputScheme = scheme;
  app.dataset.input = scheme;
  const hints = $("#control-hints");
  if (!hints) return;
  hints.innerHTML = gamepad
    ? '<span><kbd>LS</kbd> MOVE</span><span><kbd>X</kbd> SHOOT</span><span><kbd>A</kbd> PASS</span><span><kbd>RT</kbd> SPRINT</span>'
    : '<span><kbd>WASD</kbd> MOVE</span><span><kbd>SPACE</kbd> SHOOT</span><span><kbd>E</kbd> PASS</span><span><kbd>SHIFT</kbd> SPRINT</span>';
}

function updateModeFeature(card = $(".mode-card.is-selected")) {
  const feature = $("#mode-feature");
  if (!feature || !card) return;
  const number = $(".mode-card__number", card)?.textContent || "01";
  const tag = $(".mode-card__tag", card)?.textContent || "NIGHT RUN";
  const title = $("strong", card)?.textContent?.replace(/\s+/g, " ").trim() || "PARK DUEL";
  const description = $("p", card)?.textContent || "Choose a run and take the court.";
  $(".mode-feature__number", feature).textContent = number;
  $(".mode-feature__tag", feature).textContent = tag;
  $(".mode-feature__title", feature).textContent = title;
  $(".mode-feature__copy", feature).textContent = description;
  feature.dataset.mode = card.dataset.mode || "street";
  $(".panel-index").textContent = `${number} / 06`;
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
  $("#menu-player-summary").textContent = `${summary.position} / ${summary.overall} OVR / ${summary.credits.toLocaleString()} CR`;
  const menuRank = $("#menu-rank");
  const rank = getNightLeagueRank(summary.level);
  if (menuRank) {
    menuRank.style.setProperty("--rank-color", rank.color);
    menuRank.innerHTML = `<span>NIGHT LEAGUE RANK</span><b>${rank.name.toUpperCase()}</b><small>LEVEL ${summary.level} · ${summary.wins} WINS · ${summary.xp} XP</small>`;
  }

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
}

function showMyPlayer() {
  gameActive = false;
  engine?.setPaused(true);
  engine?.controls?.setEnabled(false);
  hideOverlay("pause-screen");
  hideOverlay("game-over");
  setHidden($("#main-menu"), true);
  setHidden($("#mode-select"), true);
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
      { id: "ace", name: "Ace Nova", team: "home", controlled: true, position: new V(modeKey === "practice" ? 0 : -4.6, 0, modeKey === "practice" ? 3.7 : -0.5), ...controlled },
    ];
  }
  return [
    { id: "ace", name: "Ace Nova", team: "home", controlled: true, position: new V(0, 0, 3.7), ...controlled },
    { id: "shade", name: "Shade", team: "away", isAI: true, role: "handler", shooting: 0.86, vertical: 0.85, position: new V(0.5, 0, 0.7), primary: 0xff6438, accent: 0xffc15d, skinColor: 0x5f382a, shoeColor: 0xffddd1 },
  ];
}

function createEngine(modeKey, preview = false) {
  engine?.destroy();
  gameRoot.replaceChildren();
  const teamMode = isTeamModeKey(modeKey);
  const performanceMode = $("#quality-select")?.value === "performance";
  engine = new NovaCourtEngine({
    container: gameRoot,
    players: createRoster(modeKey),
    mode: MODE_MAP[modeKey],
    courtRuntime: createCourtRuntime(modeKey),
    difficulty: currentDifficulty,
    shadows: !performanceMode && modeKey !== "fives",
    pixelRatio: performanceMode || modeKey === "fives" ? 1 : Math.min(devicePixelRatio || 1, 1.35),
    visualQuality: performanceMode || modeKey === "fives" ? "performance" : "balanced",
    venue: modeKey === "street" ? "park" : teamMode ? "arena" : "arena",
    reducedMotion: ui.settings.reducedMotion,
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
    };
  }
  return engine;
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
  if (modeKey === "fives") return createFullCourtFiveOnFiveMode(config);
  return createGameMode(MODE_MAP[modeKey], config);
}

function startMode(modeKey = selectedModeKey) {
  unlockAudio().catch(() => {});
  runToken += 1;
  pendingShot = null;
  aiActionTimes.clear();
  aiAccumulator = 0;
  hudAccumulator = 0;
  currentModeKey = MODE_META[modeKey] ? modeKey : "street";
  selectedModeKey = currentModeKey;
  currentDifficulty = $("#difficulty-select")?.value || "pro";
  const token = runToken;
  createEngine(currentModeKey);
  engine.setCameraMode($("#camera-preset")?.value || (["threePoint", "duos", "team"].includes(currentModeKey) ? "broadcast" : "follow"));
  mode = createModeController(currentModeKey);
  const opening = mode.start({ teamIds: ["home", "away"], userTeamId: "home" });
  processCommands(opening?.commands, token);
  ai = createAIDirector({
    difficulty: currentDifficulty === "legend" ? "allStar" : currentDifficulty,
    teamIds: currentModeKey === "threePoint" || currentModeKey === "practice" ? [] : null,
    debug: new URLSearchParams(location.search).has("aiDebug"),
  });
  const meta = MODE_META[currentModeKey];
  $("#mode-label").textContent = meta.label;
  $("#home-label").textContent = meta.home;
  $("#away-label").textContent = meta.away;
  $("#game-clock").textContent = "--:--";
  $("#shot-clock").textContent = "--";
  $("#target-label").textContent = meta.objective;
  setHidden($("#three-point-progress"), currentModeKey !== "threePoint");
  setHidden($("#teammate-hints"), !isTeamModeKey(currentModeKey));
  if (currentModeKey === "threePoint") buildRackProgress();
  if (isTeamModeKey(currentModeKey)) {
    $("#teammate-hints").innerHTML = "<span>J / E <b>PASS + SWITCH</b></span><span>I <b>STEAL</b></span><span>C <b>CAMERA</b></span>";
  }
  showGame();
  gameActive = true;
  gamePointSignature = "";
  lastRenderedScores.home = null;
  lastRenderedScores.away = null;
  livePlayerStats = { points: 0, rebounds: 0, assists: 0, steals: 0, blocks: 0, grade: 76 };
  assistCandidate = null;
  const introDuration = engine.beginPresentationIntro?.(ui.settings.reducedMotion ? 0.5 : 2.8) || 0.5;
  engine.controls.setEnabled(false);
  const controls = $("#control-hints");
  const showGuide = $("#control-guide-enabled")?.checked !== false;
  controls?.classList.toggle("is-dismissed", !showGuide);
  updateControlHintScheme(true);
  clearTimeout(controlHintTimer);
  controlHintTimer = setTimeout(() => {
    if (!controlGuideHeld) controls?.classList.add("is-dismissed");
  }, 9000);
  const targetLabel = $("#target-label");
  targetLabel?.classList.remove("is-dismissed");
  clearTimeout(targetLabelTimer);
  targetLabelTimer = setTimeout(() => targetLabel?.classList.add("is-dismissed"), Math.max(2600, introDuration * 1000));
  const summary = getProfileSummary(playerProfile);
  showBroadcastMoment(
    "NCN MATCHUP",
    `${meta.home}  vs  ${meta.away}`,
    `${meta.label} · ${currentDifficulty.toUpperCase()}`,
    `${summary.position} · ${summary.overall} OVR · LEVEL ${summary.level}`,
    Math.max(900, introDuration * 1000),
  );
  setTimeout(() => {
    if (token !== runToken || !gameActive || engine.isReplayFrozen()) return;
    if (mode?.phase === MODE_PHASES.LIVE) engine.controls.setEnabled(true);
  }, introDuration * 1000);
  announcer.reset();
  announcer.announce("tip", { force: true, seed: `${currentModeKey}-${runToken}` });
  audio.playSfx("whistle");
  const openingCall = currentModeKey === "threePoint" ? "ARC RUN"
    : currentModeKey === "practice" ? "OPEN GYM"
      : currentModeKey === "street" ? "WELCOME TO NOVA PARK"
        : currentModeKey === "fives" ? "FULL COURT · TEN PLAYERS · TWO HOOPS"
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
  if (!engine) return;
  if (live && engine.ball.owner?.team === teamId) {
    engine.possessionTeam = teamId;
    return;
  }
  const candidates = engine.players.filter((player) => player.team === teamId);
  const owner = live
    ? [...candidates].sort((a, b) => a.root.position.distanceToSquared(engine.ball.position) - b.root.position.distanceToSquared(engine.ball.position))[0]
    : candidates.find((player) => player.controlled) || candidates[0];
  if (!owner) return;
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
    if (event.player?.controlled) {
      assistCandidate = { targetId: event.target?.id, at: performance.now() };
      adjustGrade(1.2, "GOOD PASS");
    }
    handleModeEvent("PASS_COMPLETE", {
      playerId: event.player?.id,
      targetPlayerId: event.target?.id,
      fromPlayerId: event.player?.id,
      toPlayerId: event.target?.id,
      teamId: event.player?.team,
    });
  });
  engine.on("shotstart", () => {
    audio.playSfx("shoot", 0.45);
    const meter = $("#shot-meter");
    meter?.classList.remove("is-result");
    meter?.classList.add("is-active");
  });
  engine.on("shotmeter", (event) => {
    const meter = $("#shot-meter");
    const makePercent = Math.round(event.makePercent ?? (event.makeProbability || 0) * 100);
    const coveredPercent = Math.round(clamp(event.coverage || 0) * 100);
    meter?.style.setProperty("--shot-value", clamp(event.charge));
    meter?.style.setProperty("--shot-window-start", `${clamp(event.perfectWindowStart ?? 0.684) * 100}%`);
    meter?.style.setProperty("--shot-window-width", `${clamp(event.perfectWindowWidth ?? 0.072) * 100}%`);
    meter?.setAttribute("data-quality", event.perfectRelease ? "perfect" : event.quality > 0.7 ? "good" : "early");
    meter?.setAttribute("data-tone", makePercent >= 100 ? "guaranteed" : coveredPercent >= 70 ? "smothered" : "live");
    const chance = $("#shot-chance");
    const coverage = $("#shot-coverage");
    if (chance) chance.textContent = `${makePercent}%`;
    if (coverage) coverage.textContent = `${event.coverageLabel || "WIDE OPEN"} · ${coveredPercent}% COVERED`;
    const distance = $("#shot-distance");
    if (distance) distance.textContent = `${Math.round(event.distanceFeet || 0)} FT · ENERGY ${Math.round((event.stamina ?? 1) * 100)}%`;
    ui.setShotMeter(event.charge, event.perfectRelease ? "perfect" : "charging", event.perfectRelease ? "PERFECT" : "RELEASE IN WHITE");
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
    meter?.setAttribute("data-quality", event.perfectRelease ? "perfect" : event.quality > 0.7 ? "good" : "early");
    meter?.setAttribute("data-tone", event.guaranteed ? "guaranteed" : coveragePercent >= 70 ? "smothered" : "live");
    const chance = $("#shot-chance");
    const coverage = $("#shot-coverage");
    if (chance) chance.textContent = `${makePercent}%`;
    if (coverage) coverage.textContent = event.perfectRelease
      ? `${event.guaranteed ? "WIDE OPEN" : event.coverageLabel || "CONTESTED"} / PERFECT / ${coveragePercent}% COVERED`
      : `${event.coverageLabel || "WIDE OPEN"} / ${coveragePercent}% COVERED`;
    const distance = $("#shot-distance");
    if (distance) distance.textContent = `${Math.round(event.distanceFeet || 0)} FT · ENERGY ${Math.round((event.stamina ?? 1) * 100)}%`;
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
    if (event.player?.controlled) {
      livePlayerStats.points += points;
      adjustGrade(pendingShot?.coverage >= 0.65 ? 0.4 : 1.8, pendingShot?.coverage >= 0.65 ? "TOUGH MAKE" : "GOOD SHOT SELECTION");
    } else if (assistCandidate?.targetId === event.player?.id && performance.now() - assistCandidate.at < 6500) {
      livePlayerStats.assists += 1;
      adjustGrade(2.4, "ASSIST");
    }
    if (callType === "dunk") maybeQueueHighlight("dunk", 320);
    assistCandidate = null;
    announcer.announce(callType, {
      playerName: event.player?.name,
      homeScore: state.scores?.home,
      awayScore: state.scores?.away,
    });
    showBroadcastMoment(
      "NCN SCORE UPDATE",
      event.swish ? "PURE. NO RIM." : callType === "dunk" ? "ABOVE THE LIGHTS" : "COUNT IT",
      `${String(event.player?.name || "NOVA").toUpperCase()} · ${points} POINT${points === 1 ? "" : "S"}`,
      `${state.scores?.home ?? "–"}  —  ${state.scores?.away ?? "–"}`,
      1250,
    );
    pendingShot = null;
    setTimeout(() => $("#shot-meter")?.classList.remove("is-result"), 1100);
  });
  engine.on("rim", () => audio.playSfx("rim"));
  engine.on("backboard", () => audio.playSfx("backboard"));
  engine.on("rebound", (event) => {
    if (pendingShot && !pendingShot.scored) {
      handleModeEvent("MISS", { playerId: pendingShot.player?.id, teamId: pendingShot.player?.team });
      pendingShot = null;
    }
    handleModeEvent("REBOUND", { playerId: event.player?.id, teamId: event.team, offensive: event.offensive });
    if (event.player?.controlled) {
      livePlayerStats.rebounds += 1;
      adjustGrade(event.offensive ? 1.8 : 1.3, event.offensive ? "SECOND CHANCE" : "STRONG BOARD");
    } else feedback(event.offensive ? "SECOND CHANCE" : "BOARD", "neutral", 650);

    setTimeout(() => $("#shot-meter")?.classList.remove("is-result"), 900);
  });
  engine.on("steal", (event) => {
    audio.playSfx(event.success ? "steal" : "ui", event.success ? 1 : 0.35);
    if (!event.success && event.defender?.controlled) adjustGrade(-1.5, "BAD STEAL ATTEMPT");
    if (event.success) {
      if (event.defender?.controlled) {
        livePlayerStats.steals += 1;
        adjustGrade(2.6, "FORCED TURNOVER");
      }
      feedback("BALL POKED LOOSE / LIVE BALL", "warning", 900);
      showBroadcastMoment("NCN TURNOVER", "POKED FREE", "LIVE BALL · NO RESET", String(event.defender?.name || "DEFENSE").toUpperCase(), 1200);
      announcer.announce("steal", { playerName: event.defender?.name });
    }
  });
  engine.on("ballloose", () => {
    feedback("LIVE BALL · GO GET IT", "warning", 760);
  });
  engine.on("anklebreak", (event) => {
    audio.playSfx("dribble", 1);
    if (event.handler?.controlled) adjustGrade(1.5, "PERFECT CROSSOVER");
    maybeQueueHighlight("ankleBreak", 520);
    feedback(`ANKLE BREAK / ${(event.stunSeconds || 1.5).toFixed(1)}S STUN`, "accent", 1050);
    announcer.announce("ankle_break", { playerName: event.handler?.name });
  });
  engine.on("controlchange", (event) => {
    const name = event.to?.name || "TEAMMATE";
    feedback(`CONTROL · ${String(name).toUpperCase()}`, "accent", 650);
  });
  engine.on("block", (event) => {
    if (!event.success) return;
    if (event.defender?.controlled) {
      livePlayerStats.blocks += 1;
      adjustGrade(2.8, "STRONG RIM DEFENSE");
    }
    maybeQueueHighlight("block", 260);
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
    handleModeEvent("FOUL", {
      offendedTeamId: event.offendedTeamId,
      committingTeamId: event.committingTeamId,
      foulType: event.foulType,
      teamFouls: event.teamFouls,
    });
    feedback("REACH-IN FOUL · " + String(event.offendedTeamId || "OFFENSE").toUpperCase() + " BALL", "warning", 1150);
    showBroadcastMoment("NCN FOUL", "REACH-IN", `${String(event.offendedTeamId || "OFFENSE").toUpperCase()} BALL`, `TEAM FOULS ${event.teamFouls || 1}`, 1400);
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
    if (event.phase === "playing") {
      feedback("NCN REPLAY · CINEMATIC", "accent", 900);
      showBroadcastMoment("NCN INSTANT REPLAY", "RUN IT BACK", "THE GAME REMAINS FROZEN UNTIL THE REPLAY ENDS", "HIGHLIGHT ANGLE", 1050);
    } else if (event.phase === "restoring") feedback("NCN REPLAY · RETURNING LIVE", "accent", 420);
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
  engine.on("restartrequest", () => startMode(currentModeKey));
  engine.on("highlightqueued", (event) => {
    app.dataset.replay = "queued";
    app.dataset.replayFrozen = "true";
    if (event.pending === 0) feedback("NOVA REPLAY · QUEUED", "accent", 420);
  });
  engine.on("camera", (event) => {
    const labels = { follow: "Street Close", cinematic: "Night Broadcast", broadcast: "Competitive Wide" };
    ui.toast(`Camera: ${labels[event.mode] || event.mode}`);
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
  if (!mode || !engine) return;
  const controlled = engine.controlledPlayer;
  const playerName = $("#player-card-name");
  const playerMeta = $("#player-card-meta");
  const playerCard = $("#player-card-hud");
  const summary = getProfileSummary(playerProfile);
  if (playerName) playerName.textContent = controlled?.name || "ACE NOVA";
  if (playerMeta) playerMeta.textContent = `${summary.position} · ${summary.overall} OVR · GRADE ${gradeFromScore()}`;
  const playerStats = $("#player-card-stats");
  if (playerStats) playerStats.textContent = `${livePlayerStats.points} PTS  ${livePlayerStats.rebounds} REB  ${livePlayerStats.assists} AST  ${livePlayerStats.steals} STL  ${livePlayerStats.blocks} BLK`;
  if (playerCard) playerCard.dataset.team = controlled?.team || "home";
  const state = mode.getState();
  const uiState = mode.getUIState();
  if (currentModeKey === "practice") {
    setScoreValue("#home-score", state.makes ?? 0);
    setScoreValue("#away-score", state.attempts ?? 0);
    $("#game-clock").textContent = "FREE";
    $("#shot-clock").textContent = "--";
    $("#target-label").textContent = "OPEN GYM";
    $("#possession-label").textContent = `STREAK ${state.streak || 0} · BEST ${state.bestStreak || 0}`;
  } else if (currentModeKey === "threePoint") {
    setScoreValue("#home-score", state.score ?? 0);
    setScoreValue("#away-score", state.targetScore ?? 18);
    $("#game-clock").textContent = uiState.clockText || "1:00";
    $("#shot-clock").textContent = "--";
    $("#target-label").textContent = `TARGET ${state.targetScore ?? 18}`;
    $("#possession-label").textContent = `${uiState.rackLabel || "RACK"} · BALL ${uiState.ballProgress || "1/5"}`;
  } else {
    const home = state.scores?.home ?? 0;
    const away = state.scores?.away ?? 0;
    setScoreValue("#home-score", home);
    setScoreValue("#away-score", away);
    $("#game-clock").textContent = isTeamModeKey(currentModeKey)
      ? uiState.clockText || (currentModeKey === "fives" ? "6:00" : "5:00")
      : "--:--";
    $("#shot-clock").textContent = String(Math.ceil(state.shotClock ?? engine.shotClock ?? 12)).padStart(2, "0");
    $("#target-label").textContent = `FIRST TO ${state.targetScore}`;
    $("#possession-label").textContent = (uiState.statusText || `${state.possessionTeamId} ball`).toUpperCase();
    const possession = state.possessionTeamId || engine.possessionTeam || "home";
    $(".score-side--home")?.classList.toggle("has-possession", possession === "home");
    $(".score-side--away")?.classList.toggle("has-possession", possession === "away");
    $(".scoreboard").dataset.possession = possession;
    const leader = Math.max(home, away);
    const signature = leader >= (state.targetScore || 99) - 1 ? `${home}-${away}-${state.targetScore}` : "";
    if (signature && signature !== gamePointSignature) {
      gamePointSignature = signature;
      showBroadcastMoment("NCN GAME POINT", "ONE SCORE AWAY", `${home} — ${away}`, "EVERY POSSESSION MATTERS", 1600);
    }
  }
  const momentum = clamp(((state.scores?.home || state.score || 0) + 1) / ((state.targetScore || 15) + 1));
  $("#takeover-fill").style.width = `${Math.round(momentum * 100)}%`;
  const meter = $("#shot-meter");
  updateControlHintScheme();
  const anchor = engine.getControlledScreenAnchor?.();
  if (meter && anchor?.visible) {
    meter.style.setProperty("--player-anchor-x", `${anchor.x}%`);
    meter.style.setProperty("--player-anchor-y", `${anchor.y}%`);
  }
}

function endGame(result = mode?.getState()?.result || {}) {
  if (!gameActive) return;
  gameActive = false;
  engine?.setPaused(true);
  engine?.controls?.setEnabled(false);
  const state = mode?.getState() || {};
  const won = result.outcome === "win";
  announcer.announce("game_over", { force: true, userWon: won });
  $("#result-kicker").textContent = currentModeKey === "threePoint" ? "NCN · FINAL RACK" : "NCN · FINAL";
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
    const rank = getNightLeagueRank(summary.level);
    $("#result-reward").innerHTML = `<span><b>+${reward.credits} CR</b> MATCH PAY</span><span><b>+${reward.xp} XP</b> ${rank.name.toUpperCase()}</span><span><b>${summary.overall} OVR</b> ${summary.position} · GRADE ${gradeFromScore()}</span>`;
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
  showBroadcastMoment("NCN TIMEOUT", "RUN PAUSED", "MAKE THE ADJUSTMENT", MODE_META[currentModeKey]?.label || "NIGHT RUN", 1000);
}

function resumeGame() {
  if (!engine || !mode) return;
  hideOverlay("pause-screen");
  mode.resume();
  engine.setPaused(false);
  engine.controls.setEnabled(mode.phase === MODE_PHASES.LIVE && !engine.isReplayFrozen());
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
      if (["duos", "team"].includes(currentModeKey) && mode.needsClear && engine.ball.owner) {
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
  const modeGrid = $(".mode-grid");
  if (modeGrid && !$("#mode-feature")) {
    const feature = document.createElement("article");
    feature.id = "mode-feature";
    feature.className = "mode-feature";
    feature.innerHTML = '<span class="mode-feature__number">01</span><div><span class="mode-feature__tag">HEAD-TO-HEAD</span><h3 class="mode-feature__title">PARK DUEL</h3><p class="mode-feature__copy">Outdoor 1v1 · First to 11 · Live crowd</p><small>NCN FEATURED RUN</small></div>';
    modeGrid.before(feature);
  }
  const menu = $("#main-menu");
  if (menu && !$("#menu-crew-scene")) {
    const crew = document.createElement("div");
    crew.id = "menu-crew-scene";
    crew.className = "menu-crew-scene";
    crew.setAttribute("aria-hidden", "true");
    crew.innerHTML = "<i></i><i></i><i></i>";
    menu.append(crew);
    const rank = document.createElement("div");
    rank.id = "menu-rank";
    rank.className = "menu-rank";
    $(".menu-feature")?.append(rank);
  }
  const bug = document.createElement("div");
  bug.id = "broadcast-bug";
  bug.className = "broadcast-bug";
  bug.innerHTML = '<b>NCN</b><span>LIVE</span><small>NOVA COURT NETWORK</small>';
  hud.append(bug);
  const playerCard = document.createElement("div");
  playerCard.id = "player-card-hud";
  playerCard.className = "player-card-hud";
  playerCard.dataset.team = "home";
  playerCard.innerHTML = '<span class="player-card-hud__number">01</span><div><b id="player-card-name">ACE NOVA</b><small id="player-card-meta">PG · 64 OVR · GRADE B+</small><em id="player-card-stats">0 PTS  0 REB  0 AST  0 STL  0 BLK</em></div>';
  hud.append(playerCard);
  const moment = document.createElement("div");
  moment.id = "broadcast-moment";
  moment.className = "broadcast-moment";
  moment.setAttribute("role", "status");
  moment.innerHTML = '<span class="broadcast-moment__kicker">NCN LIVE</span><strong class="broadcast-moment__title">NOVA COURT</strong><small class="broadcast-moment__detail">NIGHT LEAGUE</small><b class="broadcast-moment__stat"></b>';
  hud.append(moment);
  updateModeFeature();
}

function bindUI() {
  ensurePracticeCard();
  ensureBroadcastChrome();
  renderPlayerProfile();
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
  $("#quick-play")?.addEventListener("click", () => startMode("street"));
  $("#open-modes")?.addEventListener("click", showModeSelect);
  $("#open-my-player")?.addEventListener("click", showMyPlayer);
  $("#open-controls")?.addEventListener("click", () => showOverlay("controls-screen"));
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
  $("#start-selected-mode")?.addEventListener("click", () => startMode(selectedModeKey));
  $("#pause-button")?.addEventListener("click", pauseGame);
  $("#resume-game")?.addEventListener("click", resumeGame);
  $("#restart-game")?.addEventListener("click", () => startMode(currentModeKey));
  $("#rematch")?.addEventListener("click", () => startMode(currentModeKey));

  $$(".mode-card").forEach((card) => card.addEventListener("click", () => {
    $$(".mode-card").forEach((item) => item.classList.remove("is-selected"));
    card.classList.add("is-selected");
    selectedModeKey = card.dataset.mode;
    updateModeFeature(card);
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
  $("#camera-preset")?.addEventListener("change", (event) => {
    engine?.setCameraMode(event.target.value);
    localStorage.setItem("nova-court-camera-preset", event.target.value);
  });
  $("#highlight-frequency")?.addEventListener("change", (event) => localStorage.setItem("nova-court-highlight-frequency", event.target.value));
  $("#control-guide-enabled")?.addEventListener("change", (event) => {
    localStorage.setItem("nova-court-control-guide", event.target.checked ? "on" : "off");
    $("#control-hints")?.classList.toggle("is-dismissed", !event.target.checked);
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
  $("#reduced-motion")?.addEventListener("change", (event) => ui.applySettings({ ...ui.settings, reducedMotion: event.target.checked }));
  $("#high-contrast")?.addEventListener("change", (event) => ui.applySettings({ ...ui.settings, highContrast: event.target.checked }));
  $("#captions-enabled")?.addEventListener("change", (event) => {
    ui.applySettings({ ...ui.settings, captions: event.target.checked });
    audio.setCaptions(event.target.checked);
  });
  $("#mute-all")?.addEventListener("change", (event) => ui.applySettings({ ...ui.settings, muted: event.target.checked }));

  window.addEventListener("nova:settings", (event) => {
    engine && (engine.options.reducedMotion = event.detail.reducedMotion);
  });
  window.addEventListener("keydown", (event) => {
    if (event.code === "Escape" && engine?.isReplayFrozen?.()) {
      engine.skipHighlight?.();
      event.preventDefault();
      return;
    }
    if (event.code === "KeyH" && gameActive) {
      controlGuideHeld = true;
      $("#control-hints")?.classList.remove("is-dismissed");
    }
    if (event.code === "Escape" && !$("#settings-screen").hidden) hideOverlay("settings-screen");
    else if (event.code === "Escape" && !$("#controls-screen").hidden) hideOverlay("controls-screen");
    else if (event.code === "Escape" && !$("#my-player-screen").hidden) showMainMenu();
  });
  window.addEventListener("keyup", (event) => {
    if (event.code === "KeyH") {
      controlGuideHeld = false;
      if (gameActive) $("#control-hints")?.classList.add("is-dismissed");
    }
  });
  const savedCamera = localStorage.getItem("nova-court-camera-preset");
  if (["follow", "cinematic", "broadcast"].includes(savedCamera)) $("#camera-preset").value = savedCamera;
  const savedHighlights = localStorage.getItem("nova-court-highlight-frequency");
  if (["broadcast", "reduced", "off"].includes(savedHighlights)) $("#highlight-frequency").value = savedHighlights;
  $("#control-guide-enabled").checked = localStorage.getItem("nova-court-control-guide") !== "off";
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
    showMainMenu();
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
