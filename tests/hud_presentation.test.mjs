import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import {
  getGameplayHudPolicy,
  getPlayerCardContent,
} from "../js/hud-presentation.js";

test("competitive HUD policy keeps only essential match state", () => {
  for (const mode of ["street", "duos", "team", "quads", "fives"]) {
    const policy = getGameplayHudPolicy(mode);
    assert.equal(policy.competitive, true, `${mode} remains a competitive presentation`);
    assert.equal(policy.showScoreboard, true, `${mode} keeps score and clock`);
    assert.equal(policy.showControlHints, false, `${mode} has no persistent control panel`);
  }
});

test("Arc Run uses a rack ledger and never presents rack handoffs as LOOSE BALL", () => {
  const policy = getGameplayHudPolicy("threePoint");
  const handoff = getPlayerCardContent("threePoint", null);
  assert.equal(policy.showRackTracker, true);
  assert.equal(policy.showPlayerCard, false);
  assert.deepEqual(handoff, {
    hidden: true,
    name: "",
    meta: "",
    team: "neutral",
  });
  assert.doesNotMatch(`${handoff.name} ${handoff.meta}`, /loose ball/i);
});

test("real loose-ball identity remains available outside Arc Run", () => {
  const streetLooseBall = getPlayerCardContent("street", null);
  assert.equal(streetLooseBall.hidden, false);
  assert.equal(streetLooseBall.name, "LOOSE BALL");
  assert.match(streetLooseBall.meta, /CRASH THE GLASS/);
});

test("HUD markup and layout hooks prove controls are pause-menu only and Arc Run is off-lane", async () => {
  const [html, app, css] = await Promise.all([
    readFile(new URL("../index.html", import.meta.url), "utf8"),
    readFile(new URL("../js/app.js", import.meta.url), "utf8"),
    readFile(new URL("../js/ui-hud-polish.css", import.meta.url), "utf8"),
  ]);

  assert.doesNotMatch(html, /id="control-hints"/);
  assert.match(html, /id="open-controls"/);
  assert.match(html, /id="controls-screen"/);
  assert.match(app, /app\.dataset\.gameMode = currentModeKey/);
  assert.match(app, /node\.dataset\.layout = "left-rail"/);
  assert.match(app, /className = "rack-progress__balls"/);
  assert.match(css, /data-game-mode="threePoint"[\s\S]*?\.rack-progress\s*\{[\s\S]*?left:\s*var\(--hud-edge\)/);
  assert.match(css, /\.rack-progress__balls\s*\{[\s\S]*?grid-template-columns:\s*repeat\(5,\s*9px\)/);
  assert.match(css, /#hud \.scoreboard\s*\{[\s\S]*?width:\s*min\(448px/);
});
