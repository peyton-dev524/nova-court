import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { createGameMode, MODE_IDS, MODE_PHASES } from "../js/modes.js";
import { resolveOutOfBounds } from "../js/contact-rules.js";

test("street reach-in foul returns the ball to the offended offense", () => {
  const mode = createGameMode(MODE_IDS.STREET_1V1, { checkDelay: 0.01 });
  mode.start({ teamIds: ["home", "away"], userTeamId: "home" });
  mode.handleEvent("CHECK_COMPLETE", { offenseTeamId: "home" });
  assert.equal(mode.phase, MODE_PHASES.LIVE);
  const result = mode.handleEvent("FOUL", {
    foulType: "reach_in",
    committingTeamId: "away",
    offendedTeamId: "home",
  });
  assert.equal(result.accepted, true);
  assert.equal(mode.phase, MODE_PHASES.CHECK);
  assert.equal(mode.getState().possessionTeamId, "home");
  assert.ok(result.commands.some((command) =>
    command.type === "BEGIN_CHECK" && command.offenseTeamId === "home"));
});

test("resolved three-on-three out of bounds is accepted by the live mode", () => {
  const mode = createGameMode(MODE_IDS.HALF_COURT_3V3, { checkDelay: 0.01 });
  mode.start({ teamIds: ["home", "away"], userTeamId: "home" });
  mode.handleEvent("CHECK_COMPLETE", { offenseTeamId: "home" });
  const resolved = resolveOutOfBounds({
    previousPosition: { x: 7.1, z: 1 },
    position: { x: 7.8, z: 1.2 },
    modeId: MODE_IDS.HALF_COURT_3V3,
    possessionTeamId: "home",
    lastTouchedTeamId: "home",
    teamIds: ["home", "away"],
  });
  const response = mode.handleEvent(resolved.event);
  assert.equal(response.accepted, true);
  assert.equal(mode.phase, MODE_PHASES.INBOUND);
  assert.equal(mode.getState().possessionTeamId, "away");
  assert.ok(response.commands.some((command) =>
    command.type === "BEGIN_INBOUND" && command.offenseTeamId === "away"));
  mode.handleEvent("PASS_COMPLETE", {
    teamId: "away",
    fromPlayerId: "away-shade",
    toPlayerId: "away-rift",
  });
  assert.equal(mode.phase, MODE_PHASES.LIVE);
});

test("engine source wires perfect greens, animated replay, park, swish, and bounded 60 Hz simulation", async () => {
  const source = await readFile(new URL("../js/engine.js", import.meta.url), "utf8");
  assert.match(source, /this\.ball\.guaranteedMake = shotResult\.guaranteed/);
  assert.match(source, /this\._facePlayerToBasket\(player\)/);
  assert.match(source, /perfectRelease: override\.perfectRelease \?\? isShotMeterPerfect/);
  assert.doesNotMatch(source, /atApex \? 1 : timingQuality/);
  assert.match(source, /this\.ball\.plannedMade = shotResult\.made/);
  assert.match(source, /ball\.state === "shot" && ball\.guaranteedMake[\s\S]{0,100}ball\.plannedRimResult === RIM_RESULTS\.CLEAN_SWISH/);
  assert.match(source, /rimContacts === 0 && b\.backboardContacts === 0/);
  assert.match(source, /pose:\s*\[/);
  assert.match(source, /_applyReplayPose/);
  assert.match(source, /createNightPark/);
  assert.match(source, /fixedStep:\s*1 \/ 60/);
  assert.match(source, /maxSubSteps:\s*3/);
  assert.match(source, /sampleDunkChoreography\(this\.dunkSelection, this\.dunkProgress\)/);
  assert.match(source, /player\.dunkSelection\?\.finishHand/);
  assert.match(source, /this\.events\.emit\("dunkstyle"/);
  assert.match(source, /this\.events\.emit\("dunkfinish"/);
});

test("replay flow freezes simulation through explicit restoration acknowledgement", async () => {
  const [engineSource, appSource] = await Promise.all([
    readFile(new URL("../js/engine.js", import.meta.url), "utf8"),
    readFile(new URL("../js/app.js", import.meta.url), "utf8"),
  ]);
  assert.match(engineSource, /if \(this\.replayFlow\.frozen\) return;/);
  assert.match(engineSource, /this\.replayFlow\.advance\(dt\)/);
  assert.match(engineSource, /this\.replayFlow\.confirmRestoration\(replay\.flowToken\)/);
  assert.match(engineSource, /controls\.setEnabled\(!this\.paused && !this\.replayFlow\.frozen\)/);
  assert.match(appSource, /const replayFrozen = engine\.isReplayFrozen\(\)/);
  assert.match(appSource, /if \(!replayFrozen\) \{/);
  assert.match(appSource, /engine\.on\("dunkstyle"/);
  assert.match(appSource, /power_one_hand:\s*"POWER FINISH"/);
  assert.match(appSource, /power_two_hand:\s*"TWO-HAND SLAM"/);
  assert.match(appSource, /reverse:\s*"REVERSE FINISH"/);
  assert.match(appSource, /tomahawk:\s*"TOMAHAWK FINISH"/);
  assert.match(appSource, /CONTESTED · LAYUP/);
  assert.doesNotMatch(appSource, /engine\.on\("dunkstyle"[\s\S]{0,600}playSfx/);
  assert.doesNotMatch(appSource, /setTimeout\(\(\) => engine\?\.playHighlight/);
});
