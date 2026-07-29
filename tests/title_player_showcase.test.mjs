import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs/promises";

import {
  TITLE_SHOWCASE_PLAYER_COUNT,
  createTitlePlayerShowcase,
  createTitleShowcaseProfiles,
} from "../js/title-player-showcase.js";

function seededRandom(seed = 1729) {
  let state = seed >>> 0;
  return () => {
    state = (state * 1664525 + 1013904223) >>> 0;
    return state / 0x100000000;
  };
}

function vector() {
  return {
    x: 0,
    y: 0,
    z: 0,
    set(x, y, z) {
      this.x = x;
      this.y = y;
      this.z = z;
      return this;
    },
  };
}

test("title showcase generates varied production-player style combinations", () => {
  const profiles = createTitleShowcaseProfiles(seededRandom());
  assert.equal(profiles.length, TITLE_SHOWCASE_PLAYER_COUNT);
  for (const key of ["hairStyle", "skinColor", "primary", "shoeStyleId", "shoeColorwayId", "height"]) {
    assert.equal(new Set(profiles.map((profile) => profile[key])).size, profiles.length, key);
  }
  assert.ok(profiles.every((profile) => profile.metadata.presentationOnly));
  assert.ok(profiles.every((profile) => profile.height >= 1.68 && profile.height <= 2.18));
});

test("title showcase hides every gameplay layer and leaves only idle player models", () => {
  const players = Array.from({ length: 3 }, () => ({
    controlled: true,
    isAI: true,
    hasBall: true,
    desiredVelocity: vector(),
    velocity: vector(),
    root: { position: vector(), rotation: { y: 0 } },
    marker: { visible: true },
    states: [],
    setState(state) { this.states.push(state); },
  }));
  const attributes = new Map();
  const engine = {
    T: null,
    players,
    worldRoot: { visible: true },
    vfxRoot: { visible: true },
    ballMesh: { visible: true },
    ball: { owner: players[0], state: "held" },
    controlledPlayer: players[0],
    shotClock: 24,
    cameraMode: "follow",
    renderer: { domElement: { setAttribute(name, value) { attributes.set(name, value); } } },
  };

  const showcase = createTitlePlayerShowcase(engine);
  showcase.update(1 / 60);
  const snapshot = showcase.getSnapshot();

  assert.equal(engine.worldRoot.visible, false);
  assert.equal(engine.vfxRoot.visible, false);
  assert.equal(engine.ball.owner, null);
  assert.equal(engine.controlledPlayer, null);
  assert.equal(engine.shotClock, Number.POSITIVE_INFINITY);
  assert.equal(engine.cameraMode, "showcase");
  assert.ok(players.every((player) => !player.controlled && !player.isAI && !player.hasBall));
  assert.ok(players.every((player) => player.marker.visible === false));
  assert.ok(players.every((player) => player.states.includes("idle")));
  assert.equal(snapshot.kind, "player-showcase");
  assert.equal(snapshot.gameplayActions, 0);
  assert.equal(snapshot.courtVisible, false);
  assert.equal(snapshot.ballVisible, false);
  assert.match(attributes.get("aria-label"), /randomized Nova Court player styles/);
});

test("main menu starts the player showcase while tutorial keeps the bot director", async () => {
  const app = await fs.readFile(new URL("../js/app.js", import.meta.url), "utf8");
  const titleStart = app.match(/function startTitlePlayerShowcase\(\) \{([\s\S]*?)\n\}/)?.[1] || "";
  const tutorialStart = app.match(/function startTutorial\(\) \{([\s\S]*?)\n\}/)?.[1] || "";

  assert.match(titleStart, /createTitleShowcaseRoster/);
  assert.match(titleStart, /createTitlePlayerShowcase/);
  assert.doesNotMatch(titleStart, /createPresentationDirector/);
  assert.match(tutorialStart, /createPresentationDirector/);
});
