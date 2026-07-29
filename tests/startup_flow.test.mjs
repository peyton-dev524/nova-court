import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

import {
  getMyPlayerMenuPresentation,
  resolveStartupDestination,
  STARTUP_DESTINATIONS,
} from "../js/startup-flow.js";

test("normal startup always enters the title menu", () => {
  assert.equal(resolveStartupDestination(), STARTUP_DESTINATIONS.MENU);
  assert.equal(
    resolveStartupDestination({ forcePlayerCreation: false }),
    STARTUP_DESTINATIONS.MENU,
  );
});

test("player creation opens directly only through an explicit request", () => {
  assert.equal(
    resolveStartupDestination({ forcePlayerCreation: true }),
    STARTUP_DESTINATIONS.PLAYER_CREATION,
  );
});

test("fresh profiles present player creation as optional", () => {
  assert.deepEqual(getMyPlayerMenuPresentation({ needsOnboarding: true }), {
    action: "CREATE MY PLAYER",
    summary: "OPTIONAL · DEFAULT READY",
    ariaLabel: "Create My Player, optional",
  });
  assert.deepEqual(getMyPlayerMenuPresentation({
    needsOnboarding: false,
    displayName: "Ace Nova",
    title: { name: "PROSPECT" },
    overall: 64,
  }), {
    action: "MY PLAYER",
    summary: "Ace Nova · PROSPECT · 64 OVR",
    ariaLabel: "Open My Player",
  });
});

test("production boot wires menu-first startup, optional creation, and a pre-hidden countdown", async () => {
  const [app, index] = await Promise.all([
    readFile(new URL("../js/app.js", import.meta.url), "utf8"),
    readFile(new URL("../index.html", import.meta.url), "utf8"),
  ]);
  assert.match(app, /resolveStartupDestination/);
  assert.match(app, /showCreatePlayer/);
  assert.match(app, /skip-create-player/);
  assert.doesNotMatch(app, /forceOnboarding \|\| getProfileSummary\(playerProfile\)\.needsOnboarding/);
  assert.match(index, /id="skip-create-player"/);
  assert.match(index, /id="arc-run-countdown"[^>]*\shidden(?:\s|>)/);
});
