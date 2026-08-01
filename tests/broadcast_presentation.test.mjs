

import test from "node:test";
import assert from "node:assert/strict";

import {
  AUTO_HIGHLIGHT_TYPES,
  NCN_ROLES,
  PAUSE_TABS,
  REPLAY_DIRECTOR_PHASES,
  SOUNDTRACK_STATES,
  createCrowdReactionDirector,
  createHighlightExportMetadata,
  createNcnBroadcastDirector,
  createPauseMenuContract,
  createReplayDirector,
  createReplayMarker,
  createScoutingReport,
  createSoundtrackDirector,
  normalizePhotoModeSettings,
  photoModePolicy,
  presentationStateFingerprint,
  prioritizeHighlights,
  resolveVenuePresentationConditions,
  routeSpatialAudioEvent,
} from "../js/broadcast-presentation.js";

test("pause tabs expose every match action with contextual availability", () => {
  assert.equal(new Set(PAUSE_TABS.map((tab) => tab.id)).size, PAUSE_TABS.length);
  const contract = createPauseMenuContract({
    replayFrames: 0,
    restartAllowed: false,
    challenges: [{ id: "hold-lead" }],
    rules: { targetScore: 21 },
  });
  const actions = contract.flatMap((tab) => tab.actions);
  assert.deepEqual(
    new Set(actions.map((action) => action.id)),
    new Set([
      "resume", "instant-replay", "statistics", "controls", "camera-settings",
      "audio-settings", "accessibility", "restart", "quit", "challenges", "match-rules",
    ]),
  );
  assert.equal(actions.find((action) => action.id === "instant-replay").enabled, false);
  assert.equal(actions.find((action) => action.id === "restart").enabled, false);
  assert.deepEqual(actions.find((action) => action.id === "match-rules").payload, { targetScore: 21 });
});

test("replay director supports transport, cameras, HUD, restart, markers, and safe restoration", () => {
  const liveState = {
    ball: [0, 1, 2],
    camera: { position: [8, 5, 9], fov: 43 },
    inputEnabled: true,
    userPaused: true,
  };
  const director = createReplayDirector({ frameRate: 30 });
  const token = director.open({
    id: "park-duel-final",
    frames: [
      { t: 0, ball: [0, 1, 0] },
      { t: 1 / 30, ball: [0, 2, -1] },
      { t: 2 / 30, ball: [0, 3, -2] },
    ],
    markers: [
      { id: "winner", type: "game_winner", timestamp: 2 / 30, frameIndex: 2, playerId: "ace" },
    ],
    liveState,
    match: { matchId: "m-42", venueId: "montgomery", mode: "park-duel" },
  });
  assert.equal(token, 1);
  assert.equal(director.ownsSimulationLock, true);
  assert.equal(director.phase, REPLAY_DIRECTOR_PHASES.READY);
  assert.equal(director.play(), true);
  assert.equal(director.setRate(0.25), true);
  director.advance(1 / 30);
  assert.equal(director.pause(), true);
  assert.equal(director.stepFrame(1), 1);
  assert.equal(director.selectCamera("free"), true);
  assert.equal(director.setFreeCamera({ position: [2, 3, 4], pitch: 99 }), true);
  assert.ok(director.getSnapshot().freeCamera.pitch < Math.PI / 2);
  const clampedPitch = director.getSnapshot().freeCamera.pitch;
  assert.equal(director.setFreeCamera({ position: [3, 4, 5] }), true);
  assert.equal(director.getSnapshot().freeCamera.pitch, clampedPitch, "omitted axes preserve free-camera orientation");
  assert.equal(director.setZoom(9), 3);
  assert.equal(director.setHudVisible(false), true);
  assert.equal(director.restart(), true);
  assert.equal(director.getSnapshot().frameIndex, 0);

  const metadata = director.saveHighlight("winner", { participants: [{ id: "ace", name: "Ace Nova" }] });
  assert.equal(metadata.schema, "nova-court-highlight/v1");
  assert.equal(metadata.type, "game-winner");
  assert.equal(metadata.participants[0].displayName, "Ace Nova");

  const restore = director.requestRestoration("close-pause-menu");
  assert.equal(director.phase, REPLAY_DIRECTOR_PHASES.RESTORING);
  assert.deepEqual(restore.state, liveState);
  assert.equal(director.confirmRestoration(token, "wrong-state"), false);
  assert.equal(director.ownsSimulationLock, true, "invalid acknowledgement cannot release gameplay");
  assert.equal(director.confirmRestoration(token, presentationStateFingerprint(liveState)), true);
  assert.equal(director.phase, REPLAY_DIRECTOR_PHASES.IDLE);
  assert.equal(director.ownsSimulationLock, false);
});

test("automatic markers and reels rank decisive representative plays deterministically", () => {
  for (const type of AUTO_HIGHLIGHT_TYPES) {
    assert.equal(createReplayMarker({ type }).automatic, true);
  }
  const reel = prioritizeHighlights([
    { id: "dunk-low", type: "dunk", value: 4, timestamp: 20, duration: 4 },
    { id: "dunk-high", type: "dunk", value: 9, timestamp: 30, duration: 4 },
    { id: "winner", type: "game-winner", value: 1, timestamp: 120, duration: 5 },
    { id: "assist", type: "assist", value: 8, timestamp: 40, duration: 3 },
    { id: "defense", type: "defensive-possession", value: 8, timestamp: 50, duration: 3 },
  ], { maxClips: 4, maxDuration: 15 });
  assert.deepEqual(reel.clips.map((clip) => clip.id), ["winner", "dunk-high", "assist", "defense"]);
  assert.equal(reel.clips.some((clip) => clip.id === "dunk-low"), false);
  assert.deepEqual(reel.controls, { skippable: true, replayable: true, savable: true });
  assert.ok(reel.duration <= 15);

  const exportData = createHighlightExportMetadata({
    matchId: "match-1",
    marker: { id: "winner", type: "game-winner", timestamp: 120 },
    participants: [{ id: "p1", displayName: "Nyx Vale", secretRating: 99 }],
  });
  assert.equal(exportData.participants[0].secretRating, undefined);
  assert.equal(exportData.streamSafe, true);
});

test("competitive Photo Mode is postgame-only and pose-safe", () => {
  assert.equal(photoModePolicy({ competitive: true, matchPhase: "live" }).allowed, false);
  const blocked = normalizePhotoModeSettings({ pose: "celebrate" }, { competitive: true, matchPhase: "live" });
  assert.equal(blocked.settings, null);

  const postgame = normalizePhotoModeSettings({
    fieldOfView: 200,
    depthOfField: 0.7,
    exposure: -3,
    contrast: 2,
    filter: "nova-night",
    playerFocus: "ace",
    hudVisible: false,
    pose: "celebrate",
    frame: "ncn-live",
  }, { competitive: true, matchPhase: "postgame" });
  assert.equal(postgame.policy.allowed, true);
  assert.equal(postgame.settings.fieldOfView, 90);
  assert.equal(postgame.settings.exposure, -2);
  assert.equal(postgame.settings.contrast, 1);
  assert.equal(postgame.settings.pose, "celebrate");
  assert.equal(postgame.settings.hudVisible, false);

  const noncompetitiveLive = normalizePhotoModeSettings(
    { pose: "victory-point" },
    { competitive: false, matchPhase: "live" },
  );
  assert.equal(noncompetitiveLive.policy.allowed, true);
  assert.equal(noncompetitiveLive.settings.pose, "authentic", "poses only alter players after games");
  const defaults = normalizePhotoModeSettings({}, { competitive: false, matchPhase: "live" }).settings;
  assert.deepEqual(
    {
      fieldOfView: defaults.fieldOfView,
      depthOfField: defaults.depthOfField,
      focusDistance: defaults.focusDistance,
      exposure: defaults.exposure,
      contrast: defaults.contrast,
    },
    { fieldOfView: 50, depthOfField: 0.35, focusDistance: 5, exposure: 0, contrast: 0 },
  );
});

test("NCN scouting limits information and distinct fictional roles own presentation beats", () => {
  const report = createScoutingReport({
    id: "nyx",
    name: "Nyx Vale",
    preferredScoringArea: "left elbow",
    dominantHand: "left",
    strongestAttribute: "first-step burst",
    defensiveWeakness: "back-door cuts",
    recentRecord: { wins: 4, losses: 1 },
    archetype: "slashing creator",
    favoriteMove: "inside-out crossover",
    hiddenRatings: { speed: 99 },
  });
  assert.equal(report.recentRecord, "4-1");
  assert.equal(report.hiddenRatings, undefined);
  assert.equal(report.hiddenRatingsExposed, false);
  assert.equal(new Set(Object.values(NCN_ROLES).map((role) => role.id)).size, 5);

  const ncn = createNcnBroadcastDirector({ maxNormalCallsPerWindow: 5 });
  const scouting = ncn.announce("scouting", { report, rivalName: "Nyx Vale", now: 0, seed: 3 });
  const homeIntro = ncn.announce("home-intro", { playerName: "Ace Nova", venueName: "Montgomery Park", now: 1 });
  const run = ncn.announce("scoring-run", { playerName: "Ace Nova", rivalName: "Nyx Vale", now: 2 });
  const gamePoint = ncn.announce("game-point", { playerName: "Ace Nova", score: { home: 20, away: 19 }, now: 3 });
  const postgame = ncn.announce("postgame", { playerName: "Ace Nova", score: { home: 21, away: 19 }, now: 4 });
  assert.equal(scouting.role.role, "Sideline host");
  assert.equal(homeIntro.role.role, "Arena announcer");
  assert.equal(run.role.role, "Color commentator");
  assert.equal(gamePoint.role.role, "Play-by-play announcer");
  assert.equal(postgame.role.role, "Postgame analyst");
  assert.equal(gamePoint.priority, "high");
  assert.equal(ncn.announce("game-point", { playerName: "Ace Nova", score: { home: 20, away: 19 }, now: 100 }), null,
    "the same game-point state cannot spam even after its cooldown");
});

test("soundtrack maps match states to arrangements, stream-safe tracks, and deterministic ducking", () => {
  const music = createSoundtrackDirector({ venueId: "arena840", volume: 0.8, streamSafe: true });
  assert.equal(music.track.streamSafe, true);
  assert.equal(music.availableTracks.some((track) => track.id === "840-afterglow"), false);
  music.setState(SOUNDTRACK_STATES.INTRO);
  assert.equal(music.getSnapshot().arrangement, "instrumental");
  music.setState(SOUNDTRACK_STATES.GAMEPLAY);
  const gameplayTarget = music.getSnapshot().targetGain;
  music.setState(SOUNDTRACK_STATES.GAME_POINT);
  assert.ok(music.getSnapshot().targetGain > gameplayTarget);
  assert.equal(music.getSnapshot().intensity, 1);
  music.setDuck("ncn-voice", true, 0.3);
  const ducked = music.getSnapshot().targetGain;
  music.setDuck("ncn-voice", false);
  assert.ok(music.getSnapshot().targetGain > ducked);
  const before = music.getSnapshot().gain;
  const after = music.advance(0.1).gain;
  assert.ok(after > before && after < music.getSnapshot().targetGain);
  music.setState(SOUNDTRACK_STATES.VICTORY);
  assert.equal(music.getSnapshot().arrangement, "victory");
});

test("spatial routing positions court events and applies distinct venue acoustics", () => {
  const listener = { position: [0, 1.7, 5], forward: [0, 0, -1] };
  const rightBounce = routeSpatialAudioEvent({ type: "bounce", source: [5, 0, 0], listener, venueId: "montgomery" });
  const leftBounce = routeSpatialAudioEvent({ type: "bounce", source: [-5, 0, 0], listener, venueId: "montgomery" });
  assert.ok(rightBounce.pan > 0);
  assert.ok(leftBounce.pan < 0);
  const outdoorRim = routeSpatialAudioEvent({ type: "rim", source: [0, 3.05, -9], listener, venueId: "montgomery" });
  const indoorRim = routeSpatialAudioEvent({ type: "rim", source: [0, 3.05, -9], listener, venueId: "arena840" });
  assert.ok(indoorRim.reverbSend > outdoorRim.reverbSend);
  assert.ok(indoorRim.reflectionDelay > outdoorRim.reflectionDelay);
  const crowd = routeSpatialAudioEvent({ type: "crowd", source: [7, 2, 0], listener, venueId: "arena840" });
  assert.equal(crowd.pan, 0);
  assert.equal(crowd.surroundSpread, 1);
  const pa = routeSpatialAudioEvent({ type: "announcer", source: [99, 99, 99], listener, venueId: "arena840" });
  assert.deepEqual(pa.source, [0, 6.4, 0], "arena announcer routes through the installed PA origin");
  assert.ok(pa.speakerColoration);
});

test("venue conditions preserve competitive fairness while allowing atmospheric presentation", () => {
  const casualRain = resolveVenuePresentationConditions({
    venueId: "montgomery",
    competitive: false,
    requested: { weather: "light-rain", wind: 0.8, seasonalDecor: "winter-lights" },
    seed: 4,
  });
  assert.equal(casualRain.weather, "light-rain");
  assert.equal(casualRain.wetSurfaceVisual, true);
  assert.equal(casualRain.environmentalBed, "distant-traffic");

  const competitive = resolveVenuePresentationConditions({
    venueId: "montgomery",
    competitive: true,
    requested: { weather: "light-rain", wind: 1 },
    seed: 4,
  });
  assert.equal(competitive.weather, "clear");
  assert.equal(competitive.clarity.precipitationOpacity, 0);
  assert.ok(competitive.visualWind <= 0.35);
  assert.deepEqual(competitive.gameplayModifiers, {
    ballPhysics: 0,
    courtFriction: 0,
    shotAccuracy: 0,
    movementSpeed: 0,
  });
});

test("crowd reactions are contextual, seeded, staggered, and never all synchronized", () => {
  const first = createCrowdReactionDirector({ fanCount: 40, seed: "park-duel" });
  const second = createCrowdReactionDirector({ fanCount: 40, seed: "park-duel" });
  const reaction = first.react("dunk", { at: 12, home: true });
  assert.deepEqual(reaction, second.react("dunk", { at: 12, home: true }));
  assert.equal(reaction.synchronized, false);
  assert.ok(reaction.cohorts.length >= 2);
  assert.ok(new Set(reaction.cohorts.map((cohort) => cohort.startAt)).size >= 2);
  assert.ok(reaction.responderCount < reaction.fanCount);
  assert.equal(new Set(reaction.cohorts.flatMap((cohort) => cohort.fanIds)).size, reaction.responderCount);
  const rival = first.react("rival-intro", { at: 20, home: false });
  assert.ok(rival.intensity < reaction.intensity);
});
